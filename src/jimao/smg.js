// 第四把武器：V45 微声冲锋枪（丧尸围城里在配电室的安全点捡到）。
// 模型是老 FPS 模式那把带手臂、带换弹动画的冲锋枪（assets/models/fps/smg45-mobile.glb，CC-BY 4.0，见 CREDITS.txt），
// 手和枪是一个整体：平时停在换弹动画的最后一帧（握好的姿势），换弹就把动画从头放一遍。
// 定位：射速快、单发伤害低、动静小——步枪 7 点响动一发，它只有 2.5；打散兵游勇不招尸潮，打尸潮得靠步枪和投掷物。
// 这里只管这把枪自己（状态、开火、换弹、模型摆位）；切枪、HUD 读数在 arsenal.js。
import * as THREE from 'three';
import { skinSmg, gripPose } from './skins/smg-skin.js';

/**
 * interval：两发间隔（秒，按住连发）；noise：一发的响动（siege.js 读）；recoil：每发镜头上抬（弧度）；
 * spread*：腰射 / 开镜的散布，bloom 是每发涨多少、封顶 spreadMax。
 */
export const SMG = Object.freeze({ name: 'V45 冲锋枪', mag: 25, reserve: 100, reserveMax: 200, damage: 23, range: 60, interval: 0.071, reload: 2.2,
  spreadHip: 0.02, spreadAds: 0.007, spreadMax: 0.055, bloom: 0.0045, recoil: 0.0068, adsRate: 5.2, noise: 2.5 });
/** 模型在镜头里的位置（米）：腰射、开镜；枪口、抛壳口在模型里的位置；fov：这套数是按多大的视角调的 */
export const SMG_VIEW = Object.freeze({ hip: Object.freeze([0.17, -0.352, -0.57]), ads: Object.freeze([0, -0.318, -0.66]), muzzle: Object.freeze([0, 0.285, -0.8]), eject: Object.freeze([0.03, 0.3, -0.42]), kick: 0.035, rise: 0.05 });

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/** 枪口火光：一个六角星片（不用贴图） */
function starGeometry(r = 0.05, n = 6) {
  const pos = [0, 0, 0], idx = [];
  for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, q = i % 2 ? r * 0.35 : r; pos.push(Math.cos(a) * q, Math.sin(a) * q, 0); }
  for (let i = 0; i < n * 2; i++) idx.push(0, 1 + i, 1 + ((i + 1) % (n * 2)));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}

/**
 * camera：镜头（模型挂在它下面）；layer：枪那一层。
 * 返回 { root, state, ready, attach(gltf), update(dt, active, busy, time), reset(), startReload(), muzzleWorld(out), addAmmo(n), dispose() }。
 * 模型没加载出来之前 ready 是 false，arsenal 不让换到这把。
 */
export function createSmg(G, { camera, layer = 0, V = SMG_VIEW, W = SMG } = {}) {
  const root = new THREE.Group(); root.name = 'viewmodel-smg'; root.visible = false; camera.add(root);
  const S = { ammo: W.mag, reserve: W.reserve, cool: 0, ads: 0, adsLin: 0, spread: W.spreadHip, reload: null, lastShot: -9, kick: 0, kickV: 0, flashT: 0, bob: 0, swayX: 0, swayY: 0, sprint: 0, time: 0 };
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const flashGeo = starGeometry(), flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.set(V.muzzle[0], V.muzzle[1], V.muzzle[2] - 0.02); flash.visible = false; if (layer) flash.layers.set(layer); root.add(flash);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion(), e1 = new THREE.Euler();
  let model = null, mixer = null, action = null, clipTime = 0, skin = null, grip = null;
  const res = { geometries: new Set(), materials: new Set(), textures: new Set() };

  function attach(gltf) {
    if (model || !gltf?.scene) return false;
    model = gltf.scene; model.rotation.y = Math.PI; // 模型枪口朝 +z，镜头看 −z
    model.traverse((o) => {
      if (layer) o.layers.set(layer);
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false;
      res.geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { res.materials.add(m); m.envMapIntensity = 0.9; }
    });
    // 贴图整理（去压缩方块、分开钢件和聚合物、棱边磨损、细节法线；见 skins/smg-skin.js）。它会把原贴图换掉并释放，所以贴图在它之后再登记
    try { skin = skinSmg(model); } catch (e) { console.error('[零点突围] 冲锋枪贴图整理出错', e); }
    for (const m of res.materials) for (const t of Object.values(m)) if (t?.isTexture) { res.textures.add(t); if (!skin?.textures.has(t)) t.anisotropy = 4; }
    root.add(model);
    const clip = gltf.animations?.find((c) => /reload/i.test(c.name)) || gltf.animations?.[0] || null;
    if (clip) { mixer = new THREE.AnimationMixer(model); action = mixer.clipAction(clip); action.play(); action.paused = true; clipTime = clip.duration; action.time = clipTime; mixer.update(0); }
    // 右手扣回握把上（模型自带的握姿两根手指张在护圈外面；见 skins/smg-skin.js 的 SMG_GRIP），每次动画写完骨骼再套
    if (mixer) { try { grip = gripPose(model, clip); grip?.apply(); } catch (e) { console.error('[零点突围] 冲锋枪握姿修正出错', e); } }
    return true;
  }

  function muzzleWorld(out = new THREE.Vector3()) { root.updateWorldMatrix(true, false); return out.set(...V.muzzle).applyMatrix4(root.matrixWorld); }
  function shoot() {
    S.ammo--; S.cool += W.interval; S.lastShot = S.time;
    const origin = camera.getWorldPosition(new THREE.Vector3()), dir = camera.getWorldDirection(new THREE.Vector3());
    if (S.spread > 0) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * S.spread; dir.add(v2.set(Math.cos(a) * r, Math.sin(a) * r, 0).applyQuaternion(camera.getWorldQuaternion(q1))).normalize(); }
    let hit = null;
    try { hit = G.combat?.playerShot?.(origin, dir, { damage: W.damage, range: W.range }) || null; } catch (e) { console.error('[零点突围] 冲锋枪开火出错', e); }
    const muzzle = muzzleWorld();
    G.events?.emit?.('weapon:fire', { origin, dir, muzzle, ads: S.ads, kind: 'smg' });
    G.fx?.tracer?.(muzzle, hit?.point || origin.clone().addScaledVector(dir, W.range));
    root.updateWorldMatrix(true, false);
    const ej = v1.set(...V.eject).applyMatrix4(root.matrixWorld).clone(), vel = new THREE.Vector3(1.6 + Math.random(), 1.2 + Math.random() * 0.6, 0.2 - Math.random() * 0.4).applyQuaternion(camera.getWorldQuaternion(q1));
    if (G.player?.vel) vel.add(G.player.vel);
    G.fx?.shell?.(ej, vel);
    G.render?.lightPool?.flash?.(muzzle, 0xffc880, 9, 5, 0.04); // 微声：火光小
    const k = 1 - 0.4 * S.ads;
    G.player?.addRecoil?.(W.recoil * k * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * 0.008 * k);
    G.player?.addShake?.(0.035 * k);
    S.kickV += 1.5 * k; S.flashT = 0.035; flashMat.opacity = 0.75; flash.visible = true; flash.rotation.z = Math.random() * Math.PI; flash.scale.setScalar(0.7 + Math.random() * 0.5);
    S.spread = Math.min(W.spreadMax, S.spread + W.bloom * k);
  }
  function startReload() {
    if (S.reload || S.ammo >= W.mag || S.reserve <= 0) return false;
    S.reload = { t: 0, out: false, in: false };
    G.events?.emit?.('weapon:reload', { phase: 'start', kind: 'smg', empty: S.ammo <= 0 });
    return true;
  }
  function stepReload(dt) {
    const r = S.reload; r.t += dt; const k = r.t / W.reload;
    if (!r.out && k >= 0.2) { r.out = true; G.events?.emit?.('weapon:reload', { phase: 'magout', kind: 'smg' }); }
    if (!r.in && k >= 0.62) { r.in = true; const take = Math.min(W.mag - S.ammo, S.reserve); S.ammo += take; S.reserve -= take; G.events?.emit?.('weapon:reload', { phase: 'magin', kind: 'smg' }); }
    if (k >= 1) { S.reload = null; G.events?.emit?.('weapon:reload', { phase: 'done', kind: 'smg' }); }
  }

  return {
    root, state: S, spec: W,
    get ready() { return !!model; },
    attach, muzzleWorld, startReload,
    /** active：手里拿的是它；busy：正在切枪 / 翻越（不能开火） */
    update(dt, active, busy) {
      S.time += dt; S.flashT -= dt;
      S.cool = Math.max(-0.02, S.cool - dt);
      if (S.flashT <= 0 && flash.visible) { flash.visible = false; flashMat.opacity = 0; }
      const inp = G.input, p = G.player;
      if (active && !busy && inp) {
        const wantAds = !!inp.ads && !S.reload && !p?.sprinting;
        S.adsLin = clamp01(S.adsLin + (wantAds ? 1 : -1) * W.adsRate * dt);
        if (inp.pressed?.('reload')) startReload();
        const holding = !!inp.fire || !!inp.down?.('fire') || !!inp.pressed?.('fire');
        if (holding && !S.reload && S.sprint < 0.4) {
          if (S.ammo > 0) { let n = 0; while (S.cool <= 0 && S.ammo > 0 && n++ < 3) shoot(); }
          else if (!startReload() && inp.pressed?.('fire')) G.events?.emit?.('weapon:dry', {});
        } else if (S.cool < 0) S.cool = 0;
        if (S.ammo <= 0 && !S.reload && S.reserve > 0 && S.time - S.lastShot > 0.3) startReload();
      } else { S.adsLin = clamp01(S.adsLin - W.adsRate * dt); if (S.cool < 0) S.cool = 0; }
      if (S.reload && active) stepReload(dt); else if (S.reload && !active) S.reload = null; // 换弹换到一半切走：这次不算
      S.ads = ease(S.adsLin);
      for (let n = Math.max(1, Math.ceil(dt * 240)), h = dt / n, i = 0; i < n; i++) { S.kickV += (-S.kick * 380 - S.kickV * 30) * h; S.kick += S.kickV * h; }
      const moving = p?.vel ? Math.hypot(p.vel.x, p.vel.z) : 0;
      const target = (W.spreadHip + (W.spreadAds - W.spreadHip) * S.ads) * (1 + Math.min(1, moving / 6) * 1.1) * (p?.onGround === false ? 1.8 : 1);
      S.spread = damp(S.spread, Math.max(target, Math.min(S.spread, W.spreadMax)), 6, dt);
      if (S.time - S.lastShot > 0.12) S.spread = damp(S.spread, target, 7, dt);
      // 换弹动画：从头放到尾；平时停在最后一帧
      if (action) { action.time = S.reload ? clamp01(S.reload.t / W.reload) * clipTime : clipTime; mixer.update(0); grip?.apply(); }
      if (!active) return;
      // 摆位：腰射在右下、开镜到正中；走路起伏、转头滞后、冲刺时枪口朝上收
      const amt = Math.min(1, moving / 4) * (p?.onGround === false ? 0.2 : 1) * (1 - 0.8 * S.ads);
      S.bob += moving * dt * 1.9;
      S.swayX = damp(S.swayX, Math.max(-0.03, Math.min(0.03, -(inp?.look?.dx || 0) * 0.9)), 9, dt);
      S.swayY = damp(S.swayY, Math.max(-0.03, Math.min(0.03, (inp?.look?.dy || 0) * 0.9)), 9, dt);
      S.sprint = damp(S.sprint, p?.sprinting ? 1 : 0, 9, dt);
      const calm = (1 - 0.7 * S.ads) * (1 - S.sprint);
      root.position.set(V.hip[0] + (V.ads[0] - V.hip[0]) * S.ads, V.hip[1] + (V.ads[1] - V.hip[1]) * S.ads, V.hip[2] + (V.ads[2] - V.hip[2]) * S.ads);
      root.position.x += Math.sin(S.bob) * 0.004 * amt + S.swayX * 0.5 + Math.sin(S.time * 0.85) * 0.001 * calm;
      root.position.y += -Math.abs(Math.cos(S.bob)) * 0.0036 * amt - S.swayY * 0.4 - 0.03 * S.sprint + Math.sin(S.time * 1.7) * 0.0014 * calm;
      root.position.z += V.kick * S.kick + 0.03 * S.sprint;
      e1.set(V.rise * S.kick + 0.28 * S.sprint - S.swayY * 0.6, S.swayX * 0.9 + 0.3 * S.sprint, S.swayX * 0.4 - 0.12 * S.sprint);
      root.quaternion.setFromEuler(e1);
    },
    reset() { Object.assign(S, { ammo: W.mag, reserve: W.reserve, cool: 0, ads: 0, adsLin: 0, spread: W.spreadHip, reload: null, lastShot: -9, kick: 0, kickV: 0, flashT: 0, sprint: 0 }); flash.visible = false; },
    addAmmo(n) { const b = S.reserve; S.reserve = Math.min(W.reserveMax, S.reserve + n); return S.reserve - b; },
    dispose() {
      root.removeFromParent(); flashGeo.dispose(); flashMat.dispose(); mixer?.stopAllAction();
      model?.traverse((o) => o.skeleton?.dispose()); // 骨骼贴图（boneTexture）不随几何、材质释放
      for (const g of res.geometries) g.dispose(); for (const m of res.materials) m.dispose(); for (const t of res.textures) { t.dispose(); t.image?.close?.(); } skin?.dispose();
    },
  };
}
