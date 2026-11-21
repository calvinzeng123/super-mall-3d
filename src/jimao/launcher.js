// 第五把武器：G40 榴弹枪（丧尸围城里在第二道关的安全点捡到，正好赶上巨尸出来）。
// 单发、撅把式：打一发，枪管往下一撅，左手塞一发 40 毫米榴弹进去，合上——换弹 1.9 秒。榴弹的飞行和爆炸在 actions.js（launch / SHELL）。
// 模型是手搭的（没有找到授权合适的贴图模型）：粗枪管、木护木、圆顶机匣、连着握把的木枪托、立着的梯形表尺，按步枪握把和护木的位置摆，
// 所以步枪上那两只手原样搬过来就握得住——右手握把、左手托护木。外形和贴图在 skins/launcher-skin.js。
// 这里只管这把枪自己；切枪、HUD 读数在 arsenal.js。
import * as THREE from 'three';
import { buildG40, createG40Materials } from './skins/launcher-skin.js';

/** reserve：捡到时带几发备弹；noise：开火那一下的响动（炸点另算一次手雷的响动）；recoil：镜头上抬（弧度） */
export const LAUNCHER = Object.freeze({ name: 'G40 榴弹枪', mag: 1, reserve: 4, reserveMax: 8, reload: 1.9, recoil: 0.032, adsRate: 4.6, noise: 30, spreadHip: 0.012, spreadAds: 0.003 });
/**
 * 腰射 / 开镜时模型原点在镜头前的位置；sightY：表尺缺口比原点高多少；muzzle：枪口；hinge：枪管撅下去绕的轴。
 * 开镜时整把枪比原来再往前送 4 厘米（−0.4 → −0.44）：镜头在枪托正后上方，枪托离得太近时屏幕正下方是一大条木头；
 * 送远一点它窄一截，缺口和准星还在屏幕正中（只动了前后）。
 */
export const LAUNCHER_VIEW = Object.freeze({ hip: Object.freeze([0.14, -0.115, -0.43]), ads: Object.freeze([0, -0.05, -0.44]), sightY: 0.05, muzzle: Object.freeze([0, 0.006, -0.36]), hinge: Object.freeze([0, -0.032, -0.012]), open: 0.62 });

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/**
 * 换弹进行到 k（0–1）：open = 枪管撅开多少（0–1），hand = 左手离开护木去拿弹、塞弹（0–1），loaded = 弹已经塞进去了。纯函数。
 */
export function breakPose(k) {
  const seg = (a, b) => clamp01((k - a) / (b - a));
  return { open: ease(seg(0.06, 0.22)) * (1 - ease(seg(0.72, 0.9))), hand: ease(seg(0.2, 0.36)) * (1 - ease(seg(0.56, 0.72))), loaded: k >= 0.6, tilt: ease(seg(0, 0.16)) * (1 - ease(seg(0.84, 1))) };
}

/**
 * camera：镜头；layer：枪那一层；cloneHand(i, parent)：把步枪上的第 i 只手搬一份过来（0 右、1 左；测试环境可以没有）。
 * 返回 { root, state, update(dt, active, busy), reset(), startReload(), muzzleWorld(out), addShells(n), dispose() }。
 */
export function createLauncher(G, { camera, layer = 0, cloneHand = null, V = LAUNCHER_VIEW, W = LAUNCHER } = {}) {
  const root = new THREE.Group(); root.name = 'viewmodel-g40'; root.visible = false; camera.add(root);
  // 外形和表面都在 skins/launcher-skin.js：按材质拼成几个大件（机匣这一组 5 个、枪管那一组 5 个），不是一个零件一次绘制
  const look = createG40Materials(), M = look.M, model = buildG40({ hinge: V.hinge });
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const geos = [];
  const add = (geo, mat, parent, x = 0, y = 0, z = 0) => { geos.push(geo); const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; parent.add(m); return m; };
  // 机匣、握把、枪托（不动的部分）
  const body = new THREE.Group(); root.add(body);
  for (const [k, g] of Object.entries(model.body)) if (g) add(g, M[k], body).name = `g40-body-${k}`;
  // 枪管那一截（换弹时绕铰链往下撅）：枪管、护木、表尺、准星、耳座都跟着转
  const tube = new THREE.Group(); tube.position.set(...V.hinge); root.add(tube);
  for (const [k, g] of Object.entries(model.tube)) if (g) add(g, M[k], tube).name = `g40-tube-${k}`;
  const shell = add(model.shell, M.brass, tube); shell.name = 'g40-shell'; shell.visible = false; // 撅开时露出来的弹底
  const flash = add(new THREE.CircleGeometry(0.05, 14), flashMat, root, V.muzzle[0], V.muzzle[1], V.muzzle[2] - 0.02); flash.visible = false;
  const right = cloneHand?.(0, root) || null, left = cloneHand?.(1, root) || null, leftBase = left ? left.position.clone() : null;
  root.traverse((o) => { if (layer) o.layers.set(layer); });

  const S = { ammo: W.mag, reserve: W.reserve, cool: 0, ads: 0, adsLin: 0, spread: W.spreadHip, reload: null, lastShot: -9, kick: 0, kickV: 0, flashT: 0, bob: 0, swayX: 0, swayY: 0, sprint: 0, time: 0 };
  const e1 = new THREE.Euler();

  function muzzleWorld(out = new THREE.Vector3()) { root.updateWorldMatrix(true, false); return out.set(...V.muzzle).applyMatrix4(root.matrixWorld); }
  function shoot() {
    const origin = camera.getWorldPosition(new THREE.Vector3()), dir = camera.getWorldDirection(new THREE.Vector3());
    if (!G.actions?.launch?.(origin, dir)) return false;
    S.ammo--; S.cool = 0.35; S.lastShot = S.time;
    const muzzle = muzzleWorld();
    G.events?.emit?.('weapon:fire', { origin, dir, muzzle, ads: S.ads, kind: 'launcher' });
    G.fx?.smoke?.(muzzle, { size: 0.35, life: 0.6, color: 0x8a8a84, rise: 0.4 });
    G.render?.lightPool?.flash?.(muzzle, 0xffc880, 26, 8, 0.06);
    const k = 1 - 0.3 * S.ads;
    G.player?.addRecoil?.(W.recoil * k, (Math.random() - 0.5) * 0.008);
    G.player?.addShake?.(0.22 * k);
    S.kickV += 3.4 * k; S.flashT = 0.05; flashMat.opacity = 0.8; flash.visible = true;
    return true;
  }
  function startReload() {
    if (S.reload || S.ammo >= W.mag || S.reserve <= 0) return false;
    S.reload = { t: 0, in: false, open: false };
    G.events?.emit?.('weapon:reload', { phase: 'start', kind: 'launcher', empty: true });
    return true;
  }

  return {
    root, state: S, spec: W, parts: { tube, body, left, right, shell },
    muzzleWorld, startReload,
    update(dt, active, busy) {
      S.time += dt; S.flashT -= dt; S.cool -= dt;
      if (S.flashT <= 0 && flash.visible) { flash.visible = false; flashMat.opacity = 0; }
      const inp = G.input, p = G.player;
      if (active && !busy && inp) {
        const wantAds = !!inp.ads && !S.reload && !p?.sprinting;
        S.adsLin = clamp01(S.adsLin + (wantAds ? 1 : -1) * W.adsRate * dt);
        if (inp.pressed?.('reload')) startReload();
        if (inp.pressed?.('fire') && S.cool <= 0 && !S.reload && S.sprint < 0.4) {
          if (S.ammo > 0) shoot(); else if (!startReload()) G.events?.emit?.('weapon:dry', {});
        }
        if (S.ammo <= 0 && !S.reload && S.reserve > 0 && S.time - S.lastShot > 0.45) startReload();
      } else S.adsLin = clamp01(S.adsLin - W.adsRate * dt);
      let pose = null;
      if (S.reload && !active) S.reload = null; // 换到一半切走：这次不算
      if (S.reload) {
        const r = S.reload; r.t += dt; const k = r.t / W.reload; pose = breakPose(k);
        if (!r.open && k >= 0.14) { r.open = true; G.events?.emit?.('weapon:reload', { phase: 'magout', kind: 'launcher' }); }
        if (!r.in && pose.loaded) { r.in = true; const take = Math.min(W.mag - S.ammo, S.reserve); S.ammo += take; S.reserve -= take; G.events?.emit?.('weapon:reload', { phase: 'magin', kind: 'launcher' }); }
        if (k >= 1) { S.reload = null; pose = null; G.events?.emit?.('weapon:reload', { phase: 'done', kind: 'launcher' }); }
      }
      S.ads = ease(S.adsLin);
      for (let n = Math.max(1, Math.ceil(dt * 240)), h = dt / n, i = 0; i < n; i++) { S.kickV += (-S.kick * 300 - S.kickV * 24) * h; S.kick += S.kickV * h; }
      S.spread = W.spreadHip + (W.spreadAds - W.spreadHip) * S.ads;
      // 枪管撅开、露出弹底；左手离开护木去塞弹
      const open = pose?.open || 0, hand = pose?.hand || 0;
      tube.rotation.x = -V.open * open; shell.visible = open > 0.2 && (!pose || !pose.loaded || hand > 0.05);
      if (left && leftBase) { left.position.copy(leftBase); left.position.y -= 0.1 * hand + 0.05 * open; left.position.z += 0.2 * hand - 0.02 * open; left.position.x += 0.02 * hand; }
      if (!active) return;
      const moving = p?.vel ? Math.hypot(p.vel.x, p.vel.z) : 0, amt = Math.min(1, moving / 4) * (p?.onGround === false ? 0.2 : 1) * (1 - 0.8 * S.ads);
      S.bob += moving * dt * 1.9;
      S.swayX = damp(S.swayX, Math.max(-0.03, Math.min(0.03, -(inp?.look?.dx || 0) * 0.9)), 9, dt);
      S.swayY = damp(S.swayY, Math.max(-0.03, Math.min(0.03, (inp?.look?.dy || 0) * 0.9)), 9, dt);
      S.sprint = damp(S.sprint, p?.sprinting ? 1 : 0, 9, dt);
      const calm = (1 - 0.7 * S.ads) * (1 - S.sprint), tilt = pose?.tilt || 0;
      root.position.set(V.hip[0] + (V.ads[0] - V.hip[0]) * S.ads, V.hip[1] + (V.ads[1] - V.hip[1]) * S.ads, V.hip[2] + (V.ads[2] - V.hip[2]) * S.ads);
      root.position.x += Math.sin(S.bob) * 0.004 * amt + S.swayX * 0.5 + Math.sin(S.time * 0.85) * 0.001 * calm;
      root.position.y += -Math.abs(Math.cos(S.bob)) * 0.0036 * amt - S.swayY * 0.4 - 0.04 * S.sprint - 0.03 * tilt + 0.012 * S.kick + Math.sin(S.time * 1.7) * 0.0014 * calm;
      root.position.z += 0.05 * S.kick + 0.03 * S.sprint;
      e1.set(0.09 * S.kick + 0.3 * S.sprint + 0.22 * tilt - S.swayY * 0.6, S.swayX * 0.9 + 0.3 * S.sprint + 0.04 * (1 - S.ads), -0.35 * tilt + S.swayX * 0.4 - 0.12 * S.sprint);
      root.quaternion.setFromEuler(e1);
    },
    reset() { Object.assign(S, { ammo: W.mag, reserve: W.reserve, cool: 0, ads: 0, adsLin: 0, reload: null, lastShot: -9, kick: 0, kickV: 0, flashT: 0, sprint: 0 }); flash.visible = false; tube.rotation.x = 0; shell.visible = false; },
    /** 捡到榴弹：加 n 发（封顶）。返回实际加了几发 */
    addShells(n) { const b = S.reserve; S.reserve = Math.min(W.reserveMax, S.reserve + n); return S.reserve - b; },
    dispose() { root.removeFromParent(); for (const g of geos) g.dispose(); flashMat.dispose(); look.dispose(); },
  };
}
