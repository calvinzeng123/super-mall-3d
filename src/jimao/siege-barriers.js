// 丧尸围城：卷帘、防火卷帘这些「拦路的东西」做成真东西。
// 以前（siege-defense.js 的 buildSeals）卷帘只是一张贴图：拦人靠 siege.js 的范围检查把人拉回去，队友、丧尸、子弹全都穿得过去；
// 摇开 / 撬开以后贴图一下子没了，看不出门开没开，也看不出是哪个开关开的它。现在：
//   碰撞：每道卷帘在导航网格那一层登记一段真墙（nav.js 的门禁墙：gate.open 为真时不挡）。关着挡人、队友、丧尸、子弹和视线；
//        往上卷到头（动画走完）才放开；往下落的那一刻就又挡上。墙按位置缓存在导航网格上，换一局重用，不越积越多。
//   样子：两侧导轨、顶上卷筒箱、一片片帘片、底梁；开的时候帘片往上卷进卷筒箱（贴图跟着帘片走，不压扁），按住撬的时候跟着进度往上抬。
//   状态：卷筒箱两面各一盏指示灯——关着红、动着黄（一闪一闪）、开了绿；动的时候从卷帘那儿响起哗啦啦的声音，到顶「咣」一声。
// 纯函数（mouthSegment、wallKey、barrierLook）测试直接用；建模、动画、声音在 createBarriers 里。
import * as THREE from 'three';
import { NAV } from '../layout/nav.js';
import { toW } from '../layout/geom.js';
import { clearPathfindingCache, forgetPathfindingFloor } from '../fps/pathfinding.js';
import { slatTexture, DEFENSE } from './siege-defense.js';
import { propMats } from './siege-props.js';

/**
 * rise / fall：卷上去、落下来各要几秒；hold：按住撬的时候最多抬到几成（松手往回落）；
 * header：卷筒箱的高、深；rail：导轨宽、深；bar：底梁高；thick：帘片厚；
 * mouth：扶梯口那道防火卷帘离坡道端头多远（落在楼面上，不压在梯级上）、两边各多出多少；
 * rattle：卷动时每隔几秒响一下；near：多远以内才响（米）。
 */
export const BARRIER = Object.freeze({
  rise: 1.6, fall: 1.2, hold: 0.85,
  header: Object.freeze({ h: 0.42, d: 0.46 }), rail: Object.freeze({ w: 0.09, d: 0.16 }), bar: 0.1, thick: 0.06,
  mouth: Object.freeze({ off: 0.12, side: 0.12 }),
  rattle: 0.11, near: 40,
});

/**
 * 扶梯口那道防火卷帘的位置：坡道 sl 的 high 端（top = true）或 low 端，在楼面上离端头 off 米、横跨整个梯宽再往两边各多 side 米。纯函数。
 * 返回 { floor, x0, z0, x1, z1, y }（y 是那一层楼面高）
 */
export function mouthSegment(nav, sl, top = true, M = BARRIER.mouth) {
  const u = top ? sl.len + M.off : -M.off, w = sl.hw + M.side, [x0, z0] = toW(sl.F, u, -w), [x1, z1] = toW(sl.F, u, w), floor = top ? sl.high : sl.low;
  return { floor, x0, z0, x1, z1, y: nav.floors.get(floor)?.y ?? (top ? sl.y1 : sl.y0) };
}

/** 一段墙按位置（厘米）认：同一道卷帘每局都落在同一处，墙重用 */
export const wallKey = (floor, s) => `${floor}|${[s.x0, s.z0, s.x1, s.z1].map((v) => Math.round(v * 100)).join(',')}`;

/** 卷帘开到 k（0 关、1 开）时看起来的样子：帘片还露在外面多高、底梁离地多高、灯的颜色。纯函数 */
export function barrierLook(k, h, moving = false) {
  const open = Math.max(0, Math.min(1, k)), left = Math.max(0.04, (1 - open) * h);
  return { left, bottom: h - left, light: open >= 1 && !moving ? 'green' : moving || open > 0.01 ? 'amber' : 'red' };
}

// ---- 导航网格上的墙 ----
const POOL = new WeakMap();
/** 这一段墙（没有就加一段，按位置缓存）。返回门禁状态对象 gate：gate.open = true 不挡 */
export function barrierWall(nav, floor, seg) {
  const F = nav.floors.get(floor); if (!F) return null;
  let pool = POOL.get(nav); if (!pool) POOL.set(nav, pool = new Map());
  const key = wallKey(floor, seg); let rec = pool.get(key);
  if (rec) return rec.gate;
  // 和别的楼层共用一份墙的（标准层）先拆开
  if (F.sharedPlan) { F.walls = F.walls.slice(); F.obstacles = F.obstacles.slice(); F.grid = new Map([...F.grid].map(([k, v]) => [k, v.slice()])); F.sharedPlan = null; }
  const gate = { open: true, barrier: true, id: key }, w = { x0: seg.x0, z0: seg.z0, x1: seg.x1, z1: seg.z1, gate };
  const i = F.walls.length; F.walls.push(w); F.gated = true;
  const c = NAV.cell, pad = NAV.r + 0.05;
  for (let gx = Math.floor((Math.min(w.x0, w.x1) - pad) / c); gx <= Math.floor((Math.max(w.x0, w.x1) + pad) / c); gx++)
    for (let gz = Math.floor((Math.min(w.z0, w.z1) - pad) / c); gz <= Math.floor((Math.max(w.z0, w.z1) + pad) / c); gz++) {
      const k = `${gx},${gz}`; if (!F.grid.has(k)) F.grid.set(k, []); F.grid.get(k).push(i);
    }
  pool.set(key, rec = { gate, floor });
  return gate;
}
/**
 * 坡道（楼梯段）上的一处门禁停点：楼里那几道关（杂物、栅门、防火门、着火）挡在梯段上，停点登记在坡道上（nav.js 的 sl.stops），
 * 关着的时候人、队友、丧尸都过不去那一处（两头都一样）。按坡道和位置缓存，换一局重用。返回门禁状态 gate（gate.open = true 不挡）
 */
export function slopeStop(nav, slopeId, u) {
  const sl = nav.slopeById?.get(slopeId); if (!sl) return null;
  let pool = POOL.get(nav); if (!pool) POOL.set(nav, pool = new Map());
  const key = `${slopeId}|${Math.round(u * 100)}`; let rec = pool.get(key);
  if (rec) return rec.gate;
  const gate = { open: true, barrier: true, id: key };
  (sl.stops ||= []).push({ u, gate });
  pool.set(key, rec = { gate, slope: slopeId });
  return gate;
}
/** 这张导航网格上所有卷帘墙都放开（换一局抽关卡之前：寻路、量路程都按没有卷帘的地图算，主机和客户端抽到的一样） */
export function releaseBarrierWalls(nav) { let n = 0; for (const r of POOL.get(nav)?.values() || []) if (!r.gate.open) { r.gate.open = true; n++; } if (n) clearPathfindingCache(nav); } // 路线指引（findPath）按格子记着「这两格之间过不过得去」：墙变了要忘掉

// ---- 建模 ----
const _v = new THREE.Vector3();
/**
 * 挂到游戏上。返回 { add(spec), list, update(dt), reset(), dispose() }。
 * spec：{ id, floor, x0, z0, x1, z1, y, h, kind（'shutter' 店面卷帘 / 'fire' 防火卷帘）, open（一开始就开着）, extra（同一道卷帘还要挡的别的楼层：[floor]）}
 * 返回的那一道：{ k（0–1）, state, open(cb), close(), hold(t), gate, group, center, floor }
 */
export function createBarriers(G, { nav, scene, B = BARRIER } = {}) {
  const root = new THREE.Group(); root.name = '丧尸围城 · 卷帘门'; scene?.add(root);
  const list = [];
  let base = null; // 帘片贴图：每道卷帘一份（共用同一张图，只有平铺的参数不一样）
  const P = typeof document !== 'undefined' ? propMats() : null;
  const mats = {
    frame: new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: 0.5, metalness: 0.7, name: 'barrier-frame' }),
    fire: new THREE.MeshStandardMaterial({ color: 0x8c2a1f, roughness: 0.6, metalness: 0.3, name: 'barrier-fire' }),
    bar: new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.6, name: 'barrier-bar' }),
    red: P?.ledRed || new THREE.MeshBasicMaterial({ color: 0xff2a1a }), green: P?.ledGreen || new THREE.MeshBasicMaterial({ color: 0x4dff7a }),
    amber: P?.ledAmber || new THREE.MeshBasicMaterial({ color: 0xffb030 }), off: P?.lamp || new THREE.MeshBasicMaterial({ color: 0x2a1410 }),
  };
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const box = (parent, mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(unit, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m; };
  const floorsTouched = new Set();
  /** 墙放开 / 挡上以后：路线指引、队友、丧尸的寻路格子按这一层重算（以前算的「这两格之间过不过得去」不对了） */
  const replan = (floor) => { G?.physics?.pathfinder?.forget?.(floor); forgetPathfindingFloor(nav, floor); };

  function add(spec) {
    const len = Math.hypot(spec.x1 - spec.x0, spec.z1 - spec.z0); if (len < 0.3) return null;
    const h = spec.h ?? DEFENSE.seal.height, fire = spec.kind === 'fire';
    const gates = [spec.floor, ...(spec.extra || [])].map((f) => barrierWall(nav, f, spec)).filter(Boolean);
    const g = new THREE.Group(); g.name = `${fire ? '防火卷帘' : '卷帘门'} · ${spec.id || ''}`;
    g.position.set((spec.x0 + spec.x1) / 2, spec.y, (spec.z0 + spec.z1) / 2); g.rotation.y = -Math.atan2(spec.z1 - spec.z0, spec.x1 - spec.x0);
    const H = B.header, R = B.rail;
    // 导轨、卷筒箱（防火卷帘的箱子刷红漆）、箱子下沿一道深色的出帘口
    for (const s of [-1, 1]) box(g, mats.frame, R.w, h + H.h, R.d, s * (len / 2 + R.w / 2), (h + H.h) / 2, 0);
    box(g, fire ? mats.fire : mats.frame, len + R.w * 2 + 0.06, H.h, H.d, 0, h + H.h / 2, 0);
    box(g, mats.bar, len, 0.03, B.thick + 0.03, 0, h + 0.015, 0);
    // 帘片：单位高的方盒，往上卷就是缩短、往上挪；贴图按露在外面的高度平铺（帘片跟着底梁走，不压扁）
    base ||= slatTexture();
    const map = base ? base.clone() : null; if (map) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(1, h / DEFENSE.seal.slat); map.needsUpdate = true; }
    const cm = new THREE.MeshStandardMaterial({ map, color: map ? (fire ? 0xe6dccd : 0xffffff) : (fire ? 0x9a8f80 : 0x7f858c), roughness: 0.55, metalness: 0.6, name: 'barrier-curtain' });
    const curtain = box(g, cm, len, 1, B.thick, 0, h / 2, 0); curtain.scale.y = h;
    const bar = new THREE.Group(); g.add(bar);
    box(bar, mats.bar, len, B.bar, B.thick + 0.05, 0, 0, 0);
    for (const s of [-0.25, 0.25]) for (const side of [-1, 1]) box(bar, mats.frame, 0.12, 0.035, 0.05, s * Math.min(len, 3), 0.03, side * (B.thick / 2 + 0.05)); // 两只提手（两面都有）
    // 指示灯：卷筒箱两面、靠一边（两面都看得见）
    const lamps = [-1, 1].map((side) => { const m = box(g, mats.red, 0.09, 0.09, 0.03, len / 2 - 0.25, h + H.h / 2, side * (H.d / 2 + 0.016)); return m; });
    root.add(g);
    for (const f of [spec.floor, ...(spec.extra || [])]) floorsTouched.add(f);
    const b = {
      id: spec.id, floor: spec.floor, floors: [spec.floor, ...(spec.extra || [])], kind: fire ? 'fire' : 'shutter', len, h, group: g, gates, center: new THREE.Vector3(g.position.x, spec.y + h / 2, g.position.z),
      k: spec.open ? 1 : 0, target: spec.open ? 1 : 0, held: 0, state: spec.open ? 'open' : 'closed', cbs: [], rattleT: 0, blinkT: 0,
      /** 开：卷上去，到顶了才放开碰撞；cb 在那一刻调（门真开了再让人 / 小许过） */
      open(cb = null) { if (cb) { if (b.state === 'open') cb(b); else b.cbs.push(cb); } if (b.target === 1 && b.state !== 'closed') return b; b.target = 1; b.state = b.k >= 1 ? 'open' : 'opening'; if (b.state === 'open') settle(b); return b; },
      /** 关：马上挡上（人站在门口会被推开），帘片往下落 */
      close() { b.target = 0; b.held = 0; b.cbs.length = 0; b.state = b.k <= 0 ? 'closed' : 'closing'; for (const q of b.gates) q.open = false; replanAll(b); return b; },
      /** 读档、跳步：一下子到位（不响、不动画） */
      snap(open) { b.target = open ? 1 : 0; b.k = b.target; b.held = 0; b.state = open ? 'open' : 'closed'; b.cbs.length = 0; for (const q of b.gates) q.open = !!open; replanAll(b); paint(b, b.parts.curtain, b.parts.bar, b.parts.lamps, b.parts.map, false); return b; },
      /** 按住撬 / 摇的进度 t（0–1）：帘片跟着往上抬（最多 hold 成），碰撞照旧挡着 */
      hold(t) { if (b.target === 1) return b; b.held = Math.max(0, Math.min(1, t || 0)) * B.hold; return b; },
    };
    for (const q of b.gates) q.open = b.state === 'open';
    paint(b, curtain, bar, lamps, map, false);
    b.parts = { curtain, bar, lamps, map, mat: cm };
    list.push(b); replanAll(b);
    return b;
  }
  const replanAll = (b) => { for (const f of b.floors) replan(f); };
  function settle(b) {
    for (const q of b.gates) q.open = true; replanAll(b);
    const cbs = b.cbs.splice(0); for (const cb of cbs) { try { cb(b); } catch { /* 回调出错不影响别的 */ } }
  }
  function paint(b, curtain, bar, lamps, map, moving) {
    const L = barrierLook(b.k, b.h, moving);
    curtain.scale.y = L.left; curtain.position.y = b.h - L.left / 2; bar.position.y = L.bottom + B.bar / 2;
    if (map) map.repeat.y = L.left / DEFENSE.seal.slat;
    const blink = moving && (b.blinkT % 0.5) > 0.25;
    for (const m of lamps) m.material = L.light === 'green' ? mats.green : L.light === 'amber' ? (blink ? mats.off : mats.amber) : mats.red;
  }
  /** 卷动的声音：从卷帘那儿响（远了不响） */
  function sound(b, name, gain, pitch) {
    const me = G?.player?.pos; if (!me || !G.audio?.play) return;
    if (me.distanceTo(_v.set(b.center.x, b.center.y, b.center.z)) > B.near) return;
    G.audio.play(name, { pos: b.center, gain, pitch });
  }
  function update(dt) {
    for (const b of list) {
      const want = b.target === 1 ? 1 : b.held, was = b.k;
      if (Math.abs(want - b.k) < 1e-4) { if (b.state === 'opening' && b.k >= 1) { b.state = 'open'; settle(b); sound(b, 'land', 0.8, 0.55); G?.events?.emit?.('barrier:open', { id: b.id }); } else if (b.state === 'closing' && b.k <= 0) { b.state = 'closed'; sound(b, 'land', 0.8, 0.6); } paint(b, b.parts.curtain, b.parts.bar, b.parts.lamps, b.parts.map, false); continue; }
      const sp = want > b.k ? 1 / B.rise : 1 / B.fall;
      b.k = want > b.k ? Math.min(want, b.k + sp * dt) : Math.max(want, b.k - sp * dt);
      b.blinkT += dt; b.rattleT -= dt;
      if (b.rattleT <= 0 && Math.abs(b.k - was) > 1e-5) { b.rattleT = B.rattle; sound(b, 'reload_magout', 0.55, 0.42 + 0.1 * Math.random()); }
      paint(b, b.parts.curtain, b.parts.bar, b.parts.lamps, b.parts.map, true);
    }
  }
  function reset() {
    for (const b of list.splice(0)) { for (const q of b.gates) q.open = true; b.group.removeFromParent(); b.parts.mat.dispose(); b.parts.map?.dispose(); }
    for (const f of floorsTouched) replan(f); floorsTouched.clear();
  }
  return {
    root, list, add, update, reset,
    /** 按 id 找 */
    get: (id) => list.find((b) => b.id === id) || null,
    dispose() { reset(); root.removeFromParent(); unit.dispose(); for (const k of ['frame', 'fire', 'bar']) mats[k].dispose(); base?.dispose(); base = null; },
  };
}

/** 一串关着、不会再开的卷帘段（锁着的店、范围边上的门口和扶梯口）：只登记碰撞（样子还是 buildSeals 那一整块）。返回门禁状态 [gate] */
export function solidSeals(nav, segs) {
  const out = [];
  const floors = new Set();
  for (const s of segs) { const g = barrierWall(nav, s.floor, s); if (g) { if (g.open) floors.add(s.floor); g.open = false; out.push(g); } }
  for (const f of floors) forgetPathfindingFloor(nav, f);
  return out;
}
