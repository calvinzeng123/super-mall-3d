// 丧尸围城：封门和路障。
// 封门：能走的范围（商场那几层 + 这一局的那栋楼）往外的每一个门口、每一部上下的扶梯 / 楼梯口，落一道卷帘门——
//   原来走出范围只是被「退回原地」，看不出为什么过不去。卷帘只是看的，拦人还是靠 siege.js 的范围检查（inArea）。
// 路障：人自己摆的沙袋墙。拿到步枪、每过一个安全点各发几个；按 B（手机上有个按钮）摆在面前。
//   丧尸走到跟前会被挡回去、踉跄一下，每挡一次路障掉一点「耐久」，掉光了塌掉；巨尸一巴掌拍碎。挡不住人和子弹（人本来就要从后面往外打）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toW } from '../layout/geom.js';
import { sandbagGeometry, DRESS } from './dressing.js';

/**
 * seal：卷帘的高度、厚度、离门洞线往里缩多少；slat：一条帘片多高。
 * wall：路障——耐久、最多同时立几道、摆在面前几米、多近算碰上、每隔几秒挡一次、每挡一只掉多少、巨尸一下掉多少、推回去的力道；
 * give：哪一步发几个（locker 武器柜、switch 合闸、gate 每清一道关、flare 上楼顶前）。
 */
export const DEFENSE = Object.freeze({
  seal: Object.freeze({ height: 3.2, thick: 0.08, slat: 0.11, slopeHeight: 2.8 }),
  wall: Object.freeze({ hp: 100, max: 4, ahead: 1.7, reach: 1.0, every: 0.35, wear: 5, brute: 60, push: 5, half: DRESS.length / 2 }),
  give: Object.freeze({ locker: 2, switch: 1, gate: 1, flare: 2 }),
  carry: 4,
});

/**
 * 要封的口子。inside(floor) 说这层在不在范围里。纯函数。
 * 返回 [{ x0, z0, x1, z1, y, h, kind }]：门口（portal：一边在里面、一边在外面）和坡道口（扶梯 / 楼梯：一头在里面、一头在外面，封在里面那一头）。
 */
export function sealSegments(nav, inside, S = DEFENSE.seal) {
  const out = [], yOf = (f) => nav.floors.get(f)?.y ?? 0;
  for (const p of nav.portals || []) {
    const a = inside(p.a), b = inside(p.b);
    if (a === b || !p.seg) continue;
    out.push({ x0: p.seg.x0, z0: p.seg.z0, x1: p.seg.x1, z1: p.seg.z1, y: yOf(a ? p.a : p.b), h: S.height, kind: 'door' });
  }
  for (const s of nav.slopes || []) {
    const lo = inside(s.low), hi = inside(s.high);
    if (lo === hi) continue;
    // 封在范围里的那一头：往坡道里缩半米（不压在楼面的走道上）
    const u = lo ? 0.5 : s.len - 0.5, [x0, z0] = toW(s.F, u, -s.hw), [x1, z1] = toW(s.F, u, s.hw);
    out.push({ x0, z0, x1, z1, y: (lo ? s.y0 : s.y1) + (lo ? 1 : -1) * Math.abs(s.y1 - s.y0) * (0.5 / s.len), h: S.slopeHeight, kind: 'slope' });
  }
  return out;
}

/** 帘片的贴图：一条条横的帘片（上亮下暗的弧面），竖向平铺。没有 document 返回 null */
function slatTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 8; c.height = 32;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 32);
  gr.addColorStop(0, '#3b3f44'); gr.addColorStop(0.15, '#b9bec4'); gr.addColorStop(0.6, '#858b92'); gr.addColorStop(0.93, '#4a4f55'); gr.addColorStop(1, '#22252a');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 32);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/**
 * 把卷帘建出来：所有口子合成一个网格（一次绘制）。返回 { mesh, count, dispose() }；segs 空就什么都不建。
 */
export function buildSeals(scene, segs, S = DEFENSE.seal) {
  if (!segs.length) return { mesh: null, count: 0, dispose() {} };
  const parts = [];
  for (const q of segs) {
    const len = Math.hypot(q.x1 - q.x0, q.z1 - q.z0); if (len < 0.3) continue;
    const g = new THREE.BoxGeometry(len, q.h, S.thick), uv = g.attributes.uv;
    // 帘片按实际高度平铺（每条 slat 米），横向不重复
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * q.h / S.slat);
    g.rotateY(-Math.atan2(q.z1 - q.z0, q.x1 - q.x0)); g.translate((q.x0 + q.x1) / 2, q.y + q.h / 2, (q.z0 + q.z1) / 2);
    parts.push(g);
    // 底下一道深色的底梁
    const bar = new THREE.BoxGeometry(len, 0.09, S.thick + 0.04), buv = bar.attributes.uv; for (let i = 0; i < buv.count; i++) buv.setXY(i, 0.5, 0.98);
    bar.rotateY(-Math.atan2(q.z1 - q.z0, q.x1 - q.x0)); bar.translate((q.x0 + q.x1) / 2, q.y + 0.045, (q.z0 + q.z1) / 2);
    parts.push(bar);
  }
  const geo = mergeGeometries(parts, false); for (const p of parts) p.dispose();
  const map = slatTexture();
  const mat = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0x7f858c, roughness: 0.55, metalness: 0.6, name: 'siege-seal' });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = '丧尸围城 · 卷帘'; mesh.castShadow = false; mesh.receiveShadow = false; mesh.matrixAutoUpdate = false;
  scene?.add(mesh);
  return { mesh, count: segs.length, dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); map?.dispose(); } };
}

/** 点 (px, pz) 到线段的距离，和线段上最近的那个点。纯函数 */
export function segDist(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz, t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / l2)) : 0;
  const cx = x0 + dx * t, cz = z0 + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), x: cx, z: cz };
}

export const DEFENSE_CSS = `
.t-wall { width: 50px; height: 50px; right: calc(306px + var(--sar)); bottom: calc(186px + var(--sab)); border-color: #d8c27a; color: #f0e2b0; }
.t-wall.off { display: none; }
.t-wall.empty { opacity: .4; }
.jm-walls { position: absolute; left: 22px; bottom: 118px; font: 600 12px/1.2 system-ui, sans-serif; color: #f0e2b0; text-shadow: 0 1px 2px #000; letter-spacing: .5px; }
.jm-walls.off { display: none; }
.jm-walls b { color: #fff; margin: 0 4px; }
@media (pointer: coarse) { .jm-walls { display: none; } }
`;

/**
 * 路障。zombies：{ pool }；返回
 * { enabled（读写）, count（手里几个）, walls（立着的）, give(n), place()（摆一道，成功返回它）, update(dt), reset(), dispose() }。
 */
export function createBarricades(G, { scene, zombies, ui = null, D = DEFENSE } = {}) {
  const W = D.wall, root = new THREE.Group(); root.name = '丧尸围城 · 路障'; scene?.add(root);
  const geo = sandbagGeometry(), mat = new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.95, name: 'siege-sandbag' });
  const walls = [];
  let enabled = false, count = 0, want = false, tick = 0, el = null, btn = null;
  if (ui && typeof document !== 'undefined') { el = document.createElement('div'); el.className = 'jm-walls off'; ui.append(el); }
  const say = (t, s = 2) => G.hud?.message?.(t, s);
  function paint() {
    if (el) { el.classList.toggle('off', !enabled || count <= 0); el.innerHTML = `路障<b>${count}</b>B 摆放`; }
    if (btn) { btn.classList.toggle('off', !enabled); btn.classList.toggle('empty', count <= 0); btn.innerHTML = `<span>路障 ${count}</span>`; }
  }
  function give(n) { const b = count; count = Math.min(D.carry, count + Math.max(0, n | 0)); paint(); return count - b; }
  function place() {
    const p = G.player; if (!enabled || !p?.pos || count <= 0) { if (enabled && count <= 0) say('没有路障了'); return null; }
    // 面前 ahead 米、横着摆（长边垂直于视线）；落脚点要和人在同一层楼面上
    const fx = -Math.sin(p.yaw || 0), fz = -Math.cos(p.yaw || 0), x = p.pos.x + fx * W.ahead, z = p.pos.z + fz * W.ahead;
    const gy = G.physics?.groundHeight?.(x, z, p.pos.y + 1);
    if (gy !== undefined && (!(gy > -900) || Math.abs(gy - p.pos.y) > 0.6)) { say('这儿摆不下'); return null; }
    const y = gy ?? p.pos.y;
    if (walls.length >= W.max) fall(walls[0], true);
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.rotation.y = Math.atan2(fx, fz); mesh.castShadow = true; root.add(mesh);
    // 沙袋墙的长边是模型的 x 轴：两头的世界坐标
    const rx = Math.cos(mesh.rotation.y), rz = -Math.sin(mesh.rotation.y);
    const w = { mesh, hp: W.hp, x, y, z, x0: x - rx * W.half, z0: z - rz * W.half, x1: x + rx * W.half, z1: z + rz * W.half, nx: fx, nz: fz, fallT: -1, rise: 0 };
    mesh.scale.y = 0.05; walls.push(w); count--; paint(); say('路障摆好了', 1.4);
    G.events?.emit?.('defense:place', { pos: mesh.position });
    return w;
  }
  function fall(w, quiet = false) { if (w.fallT >= 0) return; w.fallT = 0; if (!quiet) { say('路障被冲垮了！', 1.6); G.events?.emit?.('defense:break', { pos: w.mesh.position }); } }
  function step(dt) {
    for (let i = walls.length - 1; i >= 0; i--) {
      const w = walls[i];
      if (w.fallT >= 0) { w.fallT += dt; w.mesh.scale.y = Math.max(0.02, 1 - w.fallT / 0.5); w.mesh.position.y = w.y - w.fallT * 0.4; if (w.fallT > 0.5) { w.mesh.removeFromParent(); walls.splice(i, 1); } continue; }
      if (w.rise < 1) { w.rise = Math.min(1, w.rise + dt / 0.25); w.mesh.scale.y = w.rise; }
    }
    if ((tick -= dt) > 0) return;
    tick = W.every;
    for (const w of walls) {
      if (w.fallT >= 0) continue;
      for (const z of zombies?.pool || []) {
        if (!z.active || !z.alive || Math.abs(z.pos.y - w.y) > 1.6) continue;
        const q = segDist(z.pos.x, z.pos.z, w.x0, w.z0, w.x1, w.z1); if (q.d > W.reach) continue;
        // 往它来的那一侧推回去
        let dx = z.pos.x - q.x, dz = z.pos.z - q.z; const l = Math.hypot(dx, dz); if (l < 1e-3) { dx = -w.nx; dz = -w.nz; } else { dx /= l; dz /= l; }
        if (z.kind === 'brute') { w.hp -= W.brute; continue; }
        if (z.shove?.(dx, dz, W.push) !== false) w.hp -= W.wear;
      }
      if (w.hp <= 0) fall(w);
    }
  }
  const onKey = (e) => { if (e.code === 'KeyB' && !e.repeat && enabled && G.game?.state === 'playing') want = true; };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  return {
    get enabled() { return enabled; }, set enabled(v) { enabled = !!v; paint(); },
    get count() { return count; }, walls, give, place,
    update(dt) {
      if (!enabled) return;
      // 手机上的按钮：触屏层第一次碰屏幕才建，建好了再挂
      if (ui && !btn && G.input?.touch && typeof document !== 'undefined') {
        const touch = ui.querySelector('.touch');
        if (touch) { btn = document.createElement('button'); btn.className = 't-btn t-wall off'; btn.setAttribute('aria-label', '摆路障'); const down = (e) => { e.preventDefault(); e.stopPropagation(); want = true; }; btn.addEventListener('touchstart', down, { passive: false }); touch.appendChild(btn); paint(); }
      }
      if (want) { want = false; if (G.game?.state === 'playing' && !G.player?.mounted) place(); }
      step(dt);
    },
    reset() { for (const w of walls.splice(0)) w.mesh.removeFromParent(); count = 0; want = false; tick = 0; paint(); },
    dispose() { for (const w of walls.splice(0)) w.mesh.removeFromParent(); root.removeFromParent(); geo.dispose(); mat.dispose(); el?.remove(); btn?.remove(); if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey); },
  };
}
