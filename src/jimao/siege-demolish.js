// 丧尸围城的另一个结局：清扫完以后可以呼叫空袭，把商场和住宅楼一起炸掉。
// 清完那一刻给几秒钟选（按 F / 点按钮）；选了以后直升机拉高飞走，镜头切到远处的机位：
//   炸弹落下来 → 楼底一串爆炸、白光 → 住宅楼从底下一层层垮下去、商场屋面塌陷、压在商场上面的塔楼歪着倒下去 → 尘土漫上来 → 压暗、结算。
// 楼是整组模型（场景里每栋楼一个组，名字就是楼的 id）：往下沉、压扁、倾斜，垮完以后藏起来；重开一局时原样放回去。
// 这里的时间线是纯函数（collapseAt），测试直接用；模型、尘土、灯光在 createDemolition 里。
import * as THREE from 'three';

/**
 * offer：清完以后给多少秒选；key：键盘上按哪个键；
 * bomb：炸弹从多高掉下来、掉多少秒（这一秒起爆）；seconds：机外镜头一共多少秒；fade：最后压暗多少秒；
 * mall：商场这一组（主楼和压在上面的各栋）；towers：整栋垮的高楼；
 * cam：机位和看的地方（商场东南角外的高处，商场、公寓、北区塔楼都在画面里）。
 */
export const DEMOLISH = Object.freeze({
  offer: 8, key: 'KeyF',
  bomb: Object.freeze({ height: 260, fall: 2.6 }),
  seconds: 15, fade: 1.2,
  // 在飞机上看：观看圈的圈心（这几栋楼的中间）、半径、高度（比所有楼都高出 8 米以上）、转一圈多少秒；选了以后 delay 秒投弹、seconds 秒后离开
  watch: Object.freeze({ center: Object.freeze([-150, -150]), R: 260, y: 135, turn: 110, delay: 4.5, seconds: 24 }),
  mall: Object.freeze(['P1', 'P1C', 'P1S', 'P1E', 'P1E2', 'P1W1', 'P1W2', 'P1W3', 'P1W4', 'arcade-massing']),
  towers: Object.freeze(['A', 'T1', 'T2']),
  cam: Object.freeze({ pos: [104, 118, -2], look: [-118, 26, -168] }),
});

const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

/**
 * 一栋楼在起爆后第 u 秒的样子。kind：'tower'（整栋往下垮，越垮越快，带一点歪）/ 'mall'（屋面塌下去，压扁）；
 * delay：这栋楼晚多少秒开始；height：楼高。返回 { sink（往下沉多少米）, squash（竖向压到原来的几成）, tilt（歪多少弧度）, shake（抖动幅度，米）, gone（垮完了）}
 */
export function collapseAt(kind, u, { delay = 0, height = 60, lean = 0.12 } = {}) {
  const t = u - delay;
  if (t <= 0) return { sink: 0, squash: 1, tilt: 0, shake: 0, gone: false };
  if (kind === 'tower') {
    // 先抖半秒，再往下垮：6 秒左右垮完（高的楼慢一点）
    const T = 4.6 + height / 55, k = Math.min(1, Math.max(0, t - 0.5) / T), e = k * k * (3 - 2 * k) * (0.35 + 0.65 * k);
    return { sink: height * 0.9 * e, squash: 1 - 0.55 * e, tilt: lean * smooth(k * 1.4), shake: (k < 1 ? 0.35 : 0) * Math.min(1, t / 0.5), gone: k >= 1 };
  }
  const T = 5.2, k = Math.min(1, t / T), e = smooth(k);
  return { sink: height * 0.62 * e, squash: 1 - 0.7 * e, tilt: lean * 0.25 * e, shake: k < 1 ? 0.25 : 0, gone: k >= 1 };
}

/** 屏幕上的提示和手机按钮 */
export const DEMOLISH_CSS = `
.jm-demo { position: absolute; left: 50%; bottom: calc(150px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 6; pointer-events: none; padding: 9px 16px; border: 1px solid rgba(255, 94, 58, .75); background: rgba(22, 8, 6, .72); color: #ffd9c9; font: 700 15px/1.35 ui-monospace, 'PingFang SC', monospace; letter-spacing: .08em; text-align: center; white-space: nowrap; }
.jm-demo b { color: #ff6a3d; }
.jm-demo.off { display: none; }
.jm-demo.tap { pointer-events: auto; cursor: pointer; white-space: normal; max-width: calc(100vw - 48px); }
.jm-demo-btn { position: absolute; z-index: 7; right: calc(24px + env(safe-area-inset-right)); top: 50%; transform: translateY(-50%); width: 84px; height: 84px; border-radius: 50%; border: 2px solid #ff6a3d; background: rgba(120, 24, 10, .82); color: #ffe6dc; font: 800 20px/1 'PingFang SC', ui-sans-serif, sans-serif; letter-spacing: .1em; pointer-events: auto; touch-action: none; box-shadow: 0 0 18px rgba(255, 90, 50, .55); animation: jm-demo-pulse 1s ease-in-out infinite; }
.jm-demo-btn.off { display: none; }
@keyframes jm-demo-pulse { 50% { box-shadow: 0 0 30px rgba(255, 90, 50, .95); transform: translateY(-50%) scale(1.06); } }
`;

/**
 * 挂到游戏上。scene：整张图的场景（楼的模型按名字找）；ui：界面根（没有就不出提示）。
 * 返回 { offer(seconds), offered, chosen, accept(), decline(), start(), tick(dt), reset(), running, done, camera(), dispose() }
 */
export function createDemolition(G, { scene, layout = null, ui = null }) {
  const root = new THREE.Group(); root.name = '炸毁大楼'; scene?.add(root);
  const S = { offerT: -1, chosen: false, t: -1, boomed: false, done: false };
  const parts = []; // { g, kind, delay, height, cx, cz, base: { pos, rot, scale, vis } }
  const dust = [], fires = [], chunks = [];
  let el = null, btn = null, bomb = null, light = null, flash = null;

  const groupOf = (id) => { let hit = null; scene?.traverse?.((o) => { if (!hit && o.name === id && o.isGroup) hit = o; }); return hit; };
  const heightOf = (id) => {
    const b = layout?.buildings?.find((x) => x.id === id);
    if (b?.height) return b.height;
    const tops = (layout?.levels || []).filter((l) => l.building === id).map((l) => l.elev + (l.height || 4));
    return tops.length ? Math.max(...tops) : 40;
  };
  const centerOf = (id) => { const b = layout?.buildings?.find((x) => x.id === id), o = b?.outline; return o?.length ? [o.reduce((a, p) => a + p[0], 0) / o.length, o.reduce((a, p) => a + p[1], 0) / o.length] : [-150, -130]; };

  function collect() {
    if (parts.length) return;
    const add = (id, kind, delay) => {
      const g = groupOf(id); if (!g) return;
      const [cx, cz] = centerOf(id);
      parts.push({ id, g, kind, delay, height: heightOf(id), cx, cz, lean: ((parts.length % 2) ? -1 : 1) * (0.08 + 0.05 * (parts.length % 3)), base: { pos: g.position.clone(), rot: g.rotation.clone(), scale: g.scale.clone(), vis: g.visible } });
    };
    DEMOLISH.towers.forEach((id, i) => add(id, 'tower', 0.25 + i * 0.9));
    DEMOLISH.mall.forEach((id, i) => add(id, id === 'P1' || id === 'arcade-massing' ? 'mall' : 'tower', id === 'P1' ? 0.6 : 1.1 + i * 0.35));
  }

  // ---- 提示 ----
  // 手机上：提示条本身就是按钮，旁边再放一个大的「炸楼」按钮。都直接挂在界面根上——触屏操作层（.touch）是第一次碰屏幕才建的，
  // 以前挂在它上面，建这个模块的时候它还不存在，手机上就没有按钮
  if (ui && typeof document !== 'undefined') {
    const down = (e) => { e.preventDefault(); e.stopPropagation(); accept(); };
    el = document.createElement('div'); el.className = 'jm-demo off'; ui.append(el);
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'jm-demo-btn off'; btn.textContent = '炸楼'; btn.setAttribute('aria-label', '呼叫空袭炸毁大楼');
    for (const n of [el, btn]) { n.addEventListener('touchstart', down, { passive: false }); n.addEventListener('pointerdown', down); n.addEventListener('click', down); }
    ui.append(btn);
  }
  const onKey = (e) => { if (e.code === DEMOLISH.key && S.offerT > 0) accept(); };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
  const touchy = () => !!(G.input?.touch || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches));
  const show = (on) => { el?.classList.toggle('off', !on); btn?.classList.toggle('off', !on || !touchy()); el?.classList.toggle('tap', on && touchy()); };

  function offer(seconds = DEMOLISH.offer) { if (S.chosen || S.offerT >= 0) return; S.offerT = seconds; show(true); }
  function accept() { if (!(S.offerT > 0) || S.chosen) return false; S.chosen = true; S.offerT = 0; show(false); return true; }
  function decline() { if (S.offerT > 0) { S.offerT = 0; show(false); } }

  // ---- 尘土、火光 ----
  const dustGeo = new THREE.IcosahedronGeometry(1, 2), dustMat = () => new THREE.MeshBasicMaterial({ color: 0x8d8478, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const fireMat = () => new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending });
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1), chunkMat = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.95 });
  const SHADES = [0x8d8478, 0x7a7268, 0x9a9186, 0x5f5850];
  function puff(x, y, z, size, life, rise = 3, drift = 0, dark = false) {
    const m = new THREE.Mesh(dustGeo, dustMat()); m.material.color.setHex(dark ? 0x35312d : SHADES[dust.length % SHADES.length]); m.position.set(x, y, z); m.scale.setScalar(size * 0.3); m.renderOrder = 6; root.add(m);
    dust.push({ m, t: 0, life, size, rise, dx: Math.cos(drift) * 2.2, dz: Math.sin(drift) * 2.2, peak: dark ? 0.7 : 0.46 });
  }
  function fireball(x, y, z, size, life) {
    const m = new THREE.Mesh(dustGeo, fireMat()); m.position.set(x, y, z); m.scale.setScalar(size * 0.2); m.renderOrder = 7; root.add(m);
    fires.push({ m, t: 0, life, size });
  }
  /** 一把碎块：从 (x, y, z) 往四周崩出去，落地就没了 */
  function burst(x, y, z, n, power) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(chunkGeo, chunkMat), a = (i / n) * 6.283 + x, up = 0.5 + ((i * 7) % 5) / 5, sz = 1.2 + ((i * 3) % 4);
      m.position.set(x, y, z); m.scale.set(sz, sz * 0.6, sz * 1.4); root.add(m);
      chunks.push({ m, vx: Math.cos(a) * power * (0.5 + up * 0.5), vy: power * up, vz: Math.sin(a) * power * (0.5 + up * 0.5), spin: 2 + (i % 5) });
    }
  }

  function start() {
    if (S.t >= 0) return;
    collect();
    S.t = 0; S.boomed = false; S.done = false;
    bomb = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 4.2, 4, 10), new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.6 }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff5a2a, toneMapped: false, fog: false })); glow.position.y = 3.6;
    bomb.add(body, glow); root.add(bomb);
    light = new THREE.PointLight(0xff8a3c, 0, 900, 1.2); light.position.set(-120, 60, -150); root.add(light);
    flash = new THREE.HemisphereLight(0xfff0d8, 0xff9a5a, 0); root.add(flash);
  }

  const target = () => { const a = parts.find((p) => p.id === 'A') || parts[0]; return a ? [a.cx, a.cz] : [-35, -214]; };
  function tick(dt) {
    if (S.offerT > 0) {
      S.offerT -= dt;
      if (el) el.innerHTML = `丧尸清光了。${touchy() ? '点这里' : '按 <b>F</b> '}呼叫空袭，<b>炸毁大楼</b> · ${Math.max(0, Math.ceil(S.offerT))} 秒后直接返航`;
      if (S.offerT <= 0) show(false);
    }
    if (S.t < 0) return;
    S.t += dt;
    const B = DEMOLISH.bomb, [tx, tz] = target();
    if (!S.boomed) {
      // 炸弹斜着掉下来，尾巴拖着火
      const k = Math.min(1, S.t / B.fall), y = B.height * (1 - k * k) + 6;
      bomb.position.set(tx + (1 - k) * 60, y, tz + (1 - k) * 40); bomb.rotation.z = -0.25;
      if (k >= 1) {
        S.boomed = true; bomb.visible = false;
        G.player?.addShake?.(1.2);
        for (const p of parts) { fireball(p.cx, 10, p.cz, p.id === 'P1' ? 120 : 52, 2.6); burst(p.cx, 12, p.cz, p.id === 'P1' ? 16 : 6, p.id === 'P1' ? 46 : 34); G.fx?.explosion?.(new THREE.Vector3(p.cx, 4, p.cz), 3); }
        fireball(tx, 24, tz, 170, 3.4); fireball(tx, 30, tz, 420, 0.5); // 最后这个是一闪的白光
        G.events?.emit?.('siege:demolish', { pos: new THREE.Vector3(tx, 0, tz) });
      }
      return;
    }
    const u = S.t - B.fall;
    light.intensity = 9000 * Math.exp(-u * 0.55); flash.intensity = 2.4 * Math.exp(-u * 2.2) + 0.35 * Math.exp(-u * 0.3);
    // 垮的过程里楼身上接二连三地炸、冒黑烟
    if (u < 5.5 && (S.popT = (S.popT || 0) - dt) <= 0 && parts.length) {
      S.popT = 0.22; S.pop = (S.pop || 0) + 1;
      const p = parts[(S.pop * 5) % parts.length], h = Math.max(6, p.height * (0.15 + 0.6 * ((S.pop * 37) % 10) / 10) - collapseAt(p.kind, u, p).sink), r = p.id === 'P1' ? 90 : 12;
      const x = p.cx + Math.sin(S.pop * 2.1) * r, z = p.cz + Math.cos(S.pop * 1.7) * r;
      if (h > 4) { fireball(x, h, z, 24 + (S.pop % 4) * 8, 1.3); burst(x, h, z, 3, 22); puff(x, h + 6, z, 26, 8, 9, S.pop, true); }
    }
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i]; c.vy -= 28 * dt; c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt; c.m.rotation.x += c.spin * dt; c.m.rotation.z += c.spin * 0.7 * dt;
      if (c.m.position.y < 0.5) { c.m.removeFromParent(); chunks.splice(i, 1); }
    }
    let all = true;
    for (const p of parts) {
      const c = collapseAt(p.kind, u, p), g = p.g;
      if (!c.gone) all = false;
      const jx = c.shake ? (Math.sin(u * 37 + p.cx) * c.shake) : 0, jz = c.shake ? (Math.cos(u * 31 + p.cz) * c.shake) : 0;
      // 绕着楼脚（楼的中心、地面）压扁和歪：组的原点在世界原点，所以先算出压扁 / 旋转以后中心挪了多少，再挪回去
      g.scale.set(p.base.scale.x, p.base.scale.y * c.squash, p.base.scale.z);
      g.rotation.set(p.base.rot.x, p.base.rot.y, p.base.rot.z + c.tilt);
      const a = g.rotation.z - p.base.rot.z, ox = p.cx - (p.cx * Math.cos(a)), oy = -p.cx * Math.sin(a);
      g.position.set(p.base.pos.x + ox + jx, p.base.pos.y + oy - c.sink, p.base.pos.z + jz);
      if (c.gone) g.visible = false;
      // 垮的时候楼脚不停地冒尘土
      if (c.sink > 0 && !c.gone && (p.puffT = (p.puffT || 0) - dt) <= 0) {
        p.puffT = p.id === 'P1' ? 0.07 : 0.14;
        const r = p.id === 'P1' ? 115 : 24, ang = u * 2.3 + p.cx;
        puff(p.cx + Math.cos(ang * 1.7) * r * (0.3 + 0.7 * Math.abs(Math.sin(ang))), 3 + Math.abs(Math.sin(ang * 3)) * 8, p.cz + Math.sin(ang * 1.3) * r * 0.8, (p.id === 'P1' ? 26 : 18) + 10 * Math.abs(Math.sin(ang * 5)), 7.5, 3.5, ang);
      }
    }
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i]; d.t += dt; const k = d.t / d.life;
      if (k >= 1) { d.m.removeFromParent(); d.m.material.dispose(); dust.splice(i, 1); continue; }
      d.m.scale.setScalar(d.size * (0.3 + 0.9 * Math.sqrt(k))); d.m.position.y += d.rise * dt * (1 - k); d.m.position.x += d.dx * dt; d.m.position.z += d.dz * dt;
      d.m.material.opacity = d.peak * Math.min(1, k * 6) * (1 - k);
    }
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i]; f.t += dt; const k = f.t / f.life;
      if (k >= 1) { f.m.removeFromParent(); f.m.material.dispose(); fires.splice(i, 1); continue; }
      f.m.scale.setScalar(f.size * (0.2 + 0.8 * Math.sqrt(k))); f.m.position.y += 9 * dt;
      f.m.material.opacity = 0.95 * (1 - k) * (1 - k); f.m.material.color.setHex(k < 0.35 ? 0xfff2c0 : k < 0.7 ? 0xff9a3c : 0x5a3a2a);
    }
    if (all && !S.done) S.done = true;
  }

  function reset() {
    for (const p of parts) { p.g.position.copy(p.base.pos); p.g.rotation.copy(p.base.rot); p.g.scale.copy(p.base.scale); p.g.visible = p.base.vis; p.puffT = 0; }
    for (const d of dust.splice(0)) { d.m.removeFromParent(); d.m.material.dispose(); }
    for (const f of fires.splice(0)) { f.m.removeFromParent(); f.m.material.dispose(); }
    for (const c of chunks.splice(0)) c.m.removeFromParent();
    bomb?.removeFromParent(); light?.removeFromParent(); flash?.removeFromParent(); bomb = light = flash = null;
    Object.assign(S, { offerT: -1, chosen: false, t: -1, boomed: false, done: false, popT: 0, pop: 0 });
    show(false);
  }

  return { offer, accept, decline, start, tick, reset, state: S, parts,
    get offered() { return S.offerT > 0; }, get chosen() { return S.chosen; }, get running() { return S.t >= 0; }, get done() { return S.done; },
    camera: () => { const u = S.t - DEMOLISH.bomb.fall, k = u > 0 ? Math.exp(-u * 0.35) * 2.2 : 0; // 起爆以后镜头跟着震，越来越轻
      return { pos: new THREE.Vector3(...DEMOLISH.cam.pos), look: new THREE.Vector3(DEMOLISH.cam.look[0] + Math.sin(S.t * 43) * k, DEMOLISH.cam.look[1] + Math.cos(S.t * 51) * k, DEMOLISH.cam.look[2]) }; },
    /** 机外镜头第 outT 秒压多暗：最后 fade 秒压黑 */
    fade: (outT) => Math.max(0, Math.min(1, (outT - (DEMOLISH.seconds - DEMOLISH.fade)) / DEMOLISH.fade)),
    dispose() { reset(); root.removeFromParent(); dustGeo.dispose(); el?.remove(); btn?.remove(); if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey); } };
}
