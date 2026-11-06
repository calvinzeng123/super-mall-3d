// 云澜社区住宅（西苑 / 北苑）户型单元工厂：由生成的户型数据（community-plan-data.js）
// 生成一个楼层单元记录。复式下层围合套内楼梯、上层在楼梯洞口与挑空边设栏杆，
// nav.js 的分隔墙代码直接把它们当作墙，不需要额外导航代码。
import { rect, lrectPoly, lseg } from './geom.js';

export const COMMUNITY_CATEGORY = Object.freeze({ label: '云澜社区住宅', color: '#6f8a7a' });
export const COMMUNITY_ACCENT = Object.freeze({ west: '#6f8a7a', north: '#8a7a5c' });

const EPS = 1e-6;
const r2 = (v) => Math.round(v * 100) / 100;

// Axis-aligned unit-local segments as { axis, c, lo, hi }: axis 'x' runs along x at z = c.
const rectEdges = (r) => [
  { axis: 'x', c: r.z0, lo: r.x0, hi: r.x1 }, { axis: 'z', c: r.x1, lo: r.z0, hi: r.z1 },
  { axis: 'x', c: r.z1, lo: r.x0, hi: r.x1 }, { axis: 'z', c: r.x0, lo: r.z0, hi: r.z1 },
];
const segOf = ({ a, b }) => Math.abs(a[1] - b[1]) < EPS
  ? { axis: 'x', c: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) }
  : Math.abs(a[0] - b[0]) < EPS ? { axis: 'z', c: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) } : null;
const onOutline = (e, w, d, tol = EPS) => e.axis === 'x'
  ? Math.abs(e.c) < tol || Math.abs(e.c - d) < tol
  : Math.abs(e.c) < tol || Math.abs(e.c - w) < tol;
/** Parts of edge e not covered by the collinear cuts (within tol of its line). */
function uncovered(e, cuts, tol = EPS) {
  let ivs = [[e.lo, e.hi]];
  for (const s of cuts) {
    if (!s || s.axis !== e.axis || Math.abs(s.c - e.c) > tol) continue;
    ivs = ivs.flatMap(([a, b]) => [[a, Math.min(b, s.lo)], [Math.max(a, s.hi), b]]).filter(([a, b]) => b - a > 0.02);
  }
  return ivs;
}
const segment = (e, [lo, hi]) => e.axis === 'x'
  ? { a: [r2(lo), r2(e.c)], b: [r2(hi), r2(e.c)] }
  : { a: [r2(e.c), r2(lo)], b: [r2(e.c), r2(hi)] };

/** Duplex partitions and obstacles added on top of the generated plan (all unit-local). */
function duplexParts(res) {
  const s = res.homeStair, w = res.width, d = res.depth;
  const existing = res.partitions.map(segOf);
  const out = [], push = (prefix, role, e, ivs) => ivs.forEach((iv) => out.push({ id: `${prefix}-${out.length}`, ...segment(e, iv), role }));
  if (s?.role === 'lower') {
    // Walls round the stair block except flight A's foot (where the generator left the edge open).
    const opening = segOf(s.lowerOpening);
    for (const e of rectEdges(s.block)) if (!onOutline(e, w, d)) push('home-stair/wall', 'stair-wall', e, uncovered(e, [...existing, opening]));
    const B = s.flights.find((f) => f.id === 'B'), hw = B.width / 2;
    const z0 = Math.min(B.bottom[1], B.top[1]), z1 = Math.max(B.bottom[1], B.top[1]);
    res.obstacles = [...(res.obstacles || []), { id: 'home-stair-under-B', rect: rect(r2(B.x - hw + .05), r2(z0 + .05), r2(B.x + hw - .05), r2(z1 - .05)) }];
  }
  if (s?.role === 'upper') {
    // 1.1 m railing round the slab opening (0.1 m inside the block); flight B's head arrives
    // through the rear edge, and an edge already guarded by the outline or a wall needs none.
    const arrival = segOf(s.upperArrival);
    for (const e of rectEdges(s.upperHole)) if (!onOutline(e, w, d, .15)) push('home-stair/railing', 'railing', e, uncovered(e, [...existing, arrival], .15));
  }
  for (const v of res.voids || []) for (const e of rectEdges(v)) {
    if (!onOutline(e, w, d)) push('home-void/railing', 'railing', e, uncovered(e, existing));
  }
  res.partitions = [...res.partitions, ...out];
}

// ---------------------------------------------------------------------------
// 门扇（PV-1 / PV-2）：每樘户内门的门扇开 90° 停在它所服务的房间里（卧室、卫生间、储藏、
// 书房、厨房、衣帽间、家务间，而不是走廊、客餐厅），铰链在靠近该房间一面垂直墙的门框上，
// 门扇贴着那面墙停放（间隙 ≤ 5 cm）。生成器把门洞放在离墙角 0.15 m 处或走廊居中，
// 门扇贴不到墙时，门洞沿自己的隔墙平移到墙角（门垛 3 cm）；墙角不行时沿隔墙找一处不压床的位置。
// 门扇不压床、障碍物、别的门扇、窗户和任何门洞的通行区，自由停放的门扇在开门一侧留出 0.65 m 绕行；
// 走廊留 ≥ 0.75 m。门扇只差几厘米碰到床时把床横向挪开（≤ 0.25 m，另一侧留 ≥ 0.6 m）；挡在门洞、
// 门扇或门扇开合范围里的床头柜改成窄款或去掉（bed.tables）。入户门位置由核心筒决定、不移动，
// 门扇向内 180° 贴入户墙停放（或 90° 贴近旁的玄关侧墙）。无解的门改为推拉入墙的口袋门。
// 结果写在 partition.door.leaf / entryDoor.leaf 与 residence.doorLeaves 上，并作为导航
// 障碍物写入 residence.obstacles；渲染、导航与户型图脚本读取同一份记录。

/** Door-leaf construction (m): leaf thickness, jamb lining, pier beside the corner, wall gap, clear widths. */
export const DOOR = Object.freeze({ t: .04, lining: .02, pier: .03, gap: .05, h: 2.05, frontT: .05, frontLining: .05, frontH: 2.1, hall: .75, room: .6 });
const CIRCULATION = new Set(['hall', 'entry', 'dining', 'living', 'family', 'balcony']);
/** Wall half-thickness: partitions (0.12 m), party and front walls (0.16 m), facade (0.2 m). */
const HALF = { part: .06, party: .08, facade: .1 };
const r3 = (v) => Math.round(v * 1000) / 1000;
const ov = (a, b, pad = 0) => a.x0 < b.x1 - pad && b.x0 < a.x1 - pad && a.z0 < b.z1 - pad && b.z0 < a.z1 - pad;
/** Axis-aligned rect from coordinates along a wall axis (a0, a1) and across it (n0, n1). */
const axRect = (axis, a0, a1, n0, n1) => axis === 'x'
  ? { x0: Math.min(a0, a1), x1: Math.max(a0, a1), z0: Math.min(n0, n1), z1: Math.max(n0, n1) }
  : { x0: Math.min(n0, n1), x1: Math.max(n0, n1), z0: Math.min(a0, a1), z1: Math.max(a0, a1) };
const grow = (q, k) => ({ x0: q.x0 - k, z0: q.z0 - k, x1: q.x1 + k, z1: q.z1 + k });

/** A partition as an axis line: { axis, c, lo, hi, a0 (coordinate of a), sign (a→b along the axis) }. */
export function partitionAxis(p) {
  const s = segOf(p);
  if (!s) return null;
  const a0 = s.axis === 'x' ? p.a[0] : p.a[1], b0 = s.axis === 'x' ? p.b[0] : p.b[1];
  return { ...s, a0, sign: b0 >= a0 ? 1 : -1 };
}
/** A door's opening [g0, g1] as coordinates along its wall axis (clamped to the partition, as drawn). */
export function doorSpan(p, at = p.door.at) {
  const s = partitionAxis(p), len = s.hi - s.lo, d0 = Math.max(0, at - p.door.width / 2), d1 = Math.min(len, at + p.door.width / 2);
  const u0 = s.a0 + s.sign * d0, u1 = s.a0 + s.sign * d1;
  return [Math.min(u0, u1), Math.max(u0, u1)];
}

/** Every wall of a level-unit as thick axis segments; solid = a plain wall a leaf may rest on (not glass). */
export function wallSegments(res) {
  const W = res.width, D = res.depth, ext = new Set(res.exteriorSides || []), out = [];
  const add = (id, axis, c, lo, hi, half, solid, gaps = []) => {
    let ivs = [[lo, hi]];
    for (const [g0, g1] of gaps) ivs = ivs.flatMap(([a, b]) => [[a, Math.min(b, g0)], [Math.max(a, g1), b]]).filter(([a, b]) => b - a > .01);
    for (const [a, b] of ivs) out.push({ id, axis, c, lo: a, hi: b, half, solid });
  };
  const ent = res.entryDoor;
  for (const [side, axis, c, len] of [['N', 'x', 0, W], ['S', 'x', D, W], ['W', 'z', 0, D], ['E', 'z', W, D]]) {
    if (ext.has(side)) {
      // Facade: windows and balcony railings are glass, the piers between them solid.
      const ops = ((res.facadeWalls || []).find((f) => f.side === side)?.openings || []).map((o) => [o.at - o.width / 2, o.at + o.width / 2]);
      add(`outline-${side}`, axis, c, 0, len, HALF.facade, true, ops);
      for (const [g0, g1] of ops) add(`window-${side}`, axis, c, Math.max(0, g0), Math.min(len, g1), HALF.facade, false);
    } else add(`outline-${side}`, axis, c, 0, len, HALF.party, true, side === 'N' && ent ? [[ent.at - ent.width / 2, ent.at + ent.width / 2]] : []);
  }
  for (const p of res.partitions) out.push(...partitionSegments(p));
  return out;
}
/** One partition's wall pieces (its door gap left open); railings and balcony sliders are glass. */
function partitionSegments(p) {
  const s = partitionAxis(p);
  if (!s) return [];
  let ivs = [[s.lo, s.hi]];
  if (p.door && p.role !== 'railing') { const [g0, g1] = doorSpan(p); ivs = [[s.lo, g0], [g1, s.hi]].filter(([a, b]) => b - a > .01); }
  return ivs.map(([lo, hi]) => ({ id: p.id, axis: s.axis, c: s.c, lo, hi, half: HALF.part, solid: p.role !== 'railing' && p.role !== 'balcony-slider' }));
}
export const wallRect = (w) => axRect(w.axis, w.lo, w.hi, w.c - w.half, w.c + w.half);

/**
 * Bedside table of a bed on side s (-1 = the lower unit-local side 'L', +1 = 'R'): 0.42 m wide, 6 cm off the bed,
 * or slim (0.30 m, 2 cm off the bed) where the full one would stand in a doorway or a door leaf's swing.
 */
export function bedsideRect(b, s, slim = false) {
  const head = b.head || 'N', lat = head === 'N' || head === 'S', q = { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 };
  const hz = { N: q.z0 + .25, S: q.z1 - .25, W: q.x0 + .25, E: q.x1 - .25 }[head], off = slim ? .17 : .27, hw = slim ? .15 : .21;
  const c = lat ? (s < 0 ? q.x0 - off : q.x1 + off) : (s < 0 ? q.z0 - off : q.z1 + off);
  return lat ? { x0: c - hw, x1: c + hw, z0: hz - .2, z1: hz + .2 } : { z0: c - hw, z1: c + hw, x0: hz - .2, x1: hz + .2 };
}
/**
 * Beds with their headboards and bedside tables, unit-local. The tables are the layout's choice (bed.tables: 'L' / 'R'
 * full, 'l' / 'r' slim) once doorLeaves() ran, else both full ones when both lateral gaps exceed 0.95 m.
 */
export function bedRects(res) {
  const out = [];
  for (const b of res.beds || []) {
    const room = res.rooms.find((r) => r.id === b.room)?.rect, head = b.head || 'N';
    const q = { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 };
    out.push({ id: `${b.room}-bed`, rect: { ...q, ...{ N: { z0: q.z0 - .1 }, S: { z1: q.z1 + .1 }, W: { x0: q.x0 - .1 }, E: { x1: q.x1 + .1 } }[head] } });
    const lat = head === 'N' || head === 'S', gap = room ? (lat ? Math.min(q.x0 - room.x0, room.x1 - q.x1) : Math.min(q.z0 - room.z0, room.z1 - q.z1)) : 0;
    const keep = Array.isArray(b.tables) ? b.tables : gap > .95 ? ['L', 'R'] : [];
    for (const t of keep) out.push({ id: `${b.room}-bedside${t.toUpperCase()}`, rect: bedsideRect(b, t.toUpperCase() === 'L' ? -1 : 1, t !== t.toUpperCase()) });
  }
  return out;
}
/** Whether rect q reaches into the quarter disc a swing leaf sweeps between its closed and open positions. */
export function inSwing(l, q) {
  if (l.kind !== 'swing' || l.angle !== 90) return false;
  const H = l.axis === 'x' ? [l.hinge[0], l.line] : [l.line, l.hinge[1]];
  const box = { x0: Math.min(H[0], l.closed[0], l.free[0]), x1: Math.max(H[0], l.closed[0], l.free[0]), z0: Math.min(H[1], l.closed[1], l.free[1]), z1: Math.max(H[1], l.closed[1], l.free[1]) };
  if (!ov(box, q, .005)) return false;
  const px = Math.max(q.x0, Math.min(H[0], q.x1)), pz = Math.max(q.z0, Math.min(H[1], q.z1));
  return Math.hypot(px - H[0], pz - H[1]) < l.w + .02;
}

/** Doorway passages (opening less 5 cm a side, `depth` deep on both sides) of every door, opening, slider and the entry. */
export function doorPassages(res, depth = .6) {
  const out = res.partitions.map((p) => passageOf(p, depth)).filter(Boolean);
  const e = res.entryDoor;
  if (e) out.push({ id: 'entry', role: 'entry', rect: axRect('x', e.at - e.width / 2 + .05, e.at + e.width / 2 - .05, -depth, depth) });
  return out;
}

function passageOf(p, depth = .6) {
  if (!p.door || p.role === 'railing') return null;
  const s = partitionAxis(p), [g0, g1] = doorSpan(p);
  return { id: p.id, role: p.role, rect: axRect(s.axis, g0 + .05, g1 - .05, s.c - depth, s.c + depth) };
}

/** Breadth-first depth of every room from the entry (or the stair on an upper level), through doors and open edges. */
function roomDepths(res) {
  const adj = new Map(res.rooms.map((r) => [r.id, new Set()]));
  const byPair = new Map(res.partitions.map((p) => [p.id.split('/').sort().join('/'), p]));
  for (const a of res.rooms) for (const b of res.rooms) {
    if (a.id >= b.id) continue;
    const q = a.rect, r = b.rect, ox = Math.min(q.x1, r.x1) - Math.max(q.x0, r.x0), oz = Math.min(q.z1, r.z1) - Math.max(q.z0, r.z0);
    const touch = (ox > .3 && (Math.abs(q.z1 - r.z0) < EPS || Math.abs(r.z1 - q.z0) < EPS)) || (oz > .3 && (Math.abs(q.x1 - r.x0) < EPS || Math.abs(r.x1 - q.x0) < EPS));
    if (!touch) continue;
    const p = byPair.get([a.id, b.id].sort().join('/'));
    if (!p || (p.door && p.role !== 'railing')) { adj.get(a.id).add(b.id); adj.get(b.id).add(a.id); }
  }
  const e = res.entryDoor, at = (x, z) => res.rooms.find((r) => x > r.rect.x0 && x < r.rect.x1 && z > r.rect.z0 && z < r.rect.z1);
  const start = (e ? at(e.at, .05) : null) || res.rooms.find((r) => r.kind === 'stair') || res.rooms[0];
  const depth = new Map([[start.id, 0]]), queue = [start.id];
  while (queue.length) { const id = queue.shift(); for (const n of adj.get(id)) if (!depth.has(n)) { depth.set(n, depth.get(id) + 1); queue.push(n); } }
  return depth;
}

const within = (p, r, tol = 1e-3) => [p.a, p.b].every(([x, z]) => x >= r.x0 - tol && x <= r.x1 + tol && z >= r.z0 - tol && z <= r.z1 + tol);
/** Lexicographic comparison of two score arrays (lower is better). */
const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const rounded = (q) => ({ x0: r3(q.x0), z0: r3(q.z0), x1: r3(q.x1), z1: r3(q.z1) });
/** Length of [a0, a1] covered by the segments (collinear pieces of one wall line). */
const covered = (segs, a0, a1) => segs.reduce((n, w) => n + Math.max(0, Math.min(w.hi, a1) - Math.max(w.lo, a0)), 0);
const pt = (axis, a, n) => axis === 'x' ? [r3(a), r3(n)] : [r3(n), r3(a)];
/** Distance from point p along the axis direction d ([±1, 0] or [0, ±1]) to the first rect it meets (capped at 3 m). */
function ray(rects, [px, pz], [dx, dz]) {
  let best = 3;
  for (const q of rects) {
    if (dx) { if (pz <= q.z0 || pz >= q.z1) continue; const s = dx > 0 ? q.x0 - px : px - q.x1; if (s >= -1e-6) best = Math.min(best, s); }
    else { if (px <= q.x0 || px >= q.x1) continue; const s = dz > 0 ? q.z0 - pz : pz - q.z1; if (s >= -1e-6) best = Math.min(best, s); }
  }
  return best;
}

/**
 * Choose every door leaf of one level-unit (mutates res; see the block comment above).
 * res.doorLeaves: [{ id, kind: 'swing'|'pocket', into, axis, line, n, side, angle, w, t, h, hinge, free, closed, rect, rest, shift, planAt }]:
 * the door wall runs along `axis` at `line`; the leaf hangs on the `side` ('lo' / 'hi' along the axis) jamb and opens
 * toward n (±1 across the wall) by `angle` (90°, or 180° for a front door folded back on the front wall).
 * hinge / free are the centres of the open leaf's hinge and free edges, closed the free edge when shut; rect is the
 * open leaf (a nav obstacle); rest names the wall it rests against and the gap. partition.door.planAt keeps the
 * generator's position when the opening moved. A pocket leaf (no swing option clears) slides into the wall: no rect.
 */
function chooseLeaves(res, { log } = {}) {
  const rooms = new Map(res.rooms.map((r) => [r.id, r])), depth = roomDepths(res);
  // Beds and obstacles are hard; a bedside table gives way to a door (it is left out, see bed.tables below).
  let tables, fixed;
  const refresh = () => {
    const parts = bedRects(res);
    tables = parts.filter((o) => /-bedside[LR]$/.test(o.id));
    fixed = [...parts.filter((o) => !tables.includes(o)), ...(res.obstacles || []).filter((o) => !/-bed$/.test(o.id))];
  };
  refresh();
  /** Move a bed's centre to (x, z), with its obstacle rect. */
  const moveBed = (b, x, z) => {
    const o = (res.obstacles || []).find((q) => q.id === `${b.room}-bed`);
    b.x = r3(x); b.z = r3(z);
    if (o) o.rect = rect(r3(b.x - b.w / 2), r3(b.z - b.d / 2), r3(b.x + b.w / 2), r3(b.z + b.d / 2));
    refresh();
  };
  /**
   * A door wins over the bed by a few centimetres: when only the bed of bedroom R stops a leaf, slide the bed
   * sideways (never along its length, at most 0.25 m, ≥ 0.6 m left on its far side). Returns the new centre or null.
   */
  const bedNudge = (R, leafRect, axis, n) => {
    const b = (res.beds || []).find((q) => q.room === R.id), head = b?.head || 'N';
    if (!b || R.kind !== 'bedroom' || (axis === 'z') !== (head === 'N' || head === 'S')) return null;
    const k = axis === 'z' ? 'x' : 'z', half = (axis === 'z' ? b.w : b.d) / 2, c = b[k];
    const d = n > 0 ? leafRect[`${k}1`] + .03 - (c - half) : (c + half) - (leafRect[`${k}0`] - .03);
    const far = n > 0 ? R.rect[`${k}1`] - (c + half + d) : (c - half - d) - R.rect[`${k}0`];
    if (d <= 0 || d > .25 || far < .6) return null;
    return k === 'x' ? [c + n * d, b.z] : [b.x, c + n * d];
  };
  const blocked = res.rooms.filter((r) => r.kind === 'stair' || r.kind === 'void');
  const placed = [], out = [];
  const priv = (k) => !CIRCULATION.has(k) && k !== 'stair' && k !== 'void';
  // While door p is being placed, every other wall and doorway is fixed: compute those once per search.
  let base = null;
  const allWalls = () => base ? [...base.walls, ...partitionSegments(base.p)] : wallSegments(res);
  const allPassages = () => base ? [...base.passages, ...[passageOf(base.p)].filter(Boolean)] : doorPassages(res);
  /** Checks of one open leaf `rect` in room R for door `id` (whose opening is wherever the partition now puts it). */
  const check = (id, axis, rect, R) => {
    const core = grow(rect, -.005), walls = allWalls(), passages = allPassages(), mine = passages.find((q) => q.id === id)?.rect;
    const hits = [
      ...walls.filter((s) => ov(core, wallRect(s))).map((s) => `wall ${s.id}`),
      ...fixed.filter((o) => ov(core, grow(o.rect, .02))).map((o) => o.id),
      ...blocked.filter((o) => ov(core, o.rect)).map((o) => `room ${o.id}`),
      ...placed.filter((o) => ov(core, o.rect)).map((o) => `leaf ${o.id}`),
      ...passages.filter((o) => o.id !== id && ov(core, o.rect)).map((o) => `doorway ${o.id}`),
    ];
    if (R && !(rect.x0 >= R.rect.x0 + .04 && rect.x1 <= R.rect.x1 - .04 && rect.z0 >= R.rect.z0 + .04 && rect.z1 <= R.rect.z1 - .04)) hits.push(`outside ${R.id}`);
    // The doorway itself: clear of beds, obstacles, placed leaves and crossing walls.
    if (mine) hits.push(...fixed.filter((o) => ov(mine, o.rect, .005)).map((o) => `passage ${o.id}`),
      ...placed.filter((o) => ov(mine, o.rect, .005)).map((o) => `passage leaf ${o.id}`),
      ...walls.filter((s) => s.axis !== axis && ov(mine, wallRect(s), .005)).map((s) => `passage wall ${s.id}`));
    const soft = tables.filter((o) => ov(core, grow(o.rect, .01)) || (mine && ov(mine, o.rect, .005))).map((o) => o.id);
    return { hits, soft, walls };
  };
  /** A 90° leaf of the opening [g0, g1] on the wall (axis, line), hung on `side`, opening toward n into room R. */
  const assess = ({ id, axis, line, n, g0, g1, side, R, t = DOOR.t, lining = DOOR.lining, half0 = HALF.part }) => {
    const w = g1 - g0 - 2 * lining - .01, ac = side === 'lo' ? g0 + lining + t / 2 : g1 - lining - t / 2;
    const n0 = line + n * half0, n1 = line + n * (half0 + w), rect = axRect(axis, ac - t / 2, ac + t / 2, n0, n1);
    const { hits, soft, walls } = check(id, axis, rect, R);
    // Resting wall: a solid wall parallel to the leaf on the hinge side, ≤ 5 cm off its face, along ≥ 90 % of it.
    const face = side === 'lo' ? ac - t / 2 : ac + t / 2, lo = Math.min(n0, n1), hi = Math.max(n0, n1), lines = new Map();
    for (const s of walls) {
      if (!s.solid || s.axis === axis) continue;
      const gap = side === 'lo' ? face - (s.c + s.half) : (s.c - s.half) - face, cover = Math.min(s.hi, hi) - Math.max(s.lo, lo);
      if (gap < -.005 || gap > DOOR.gap + .005 || cover <= 0) continue;
      const l = lines.get(s.c) || { id: s.id, gap, cover: 0 };
      l.cover += cover; lines.set(s.c, l);
    }
    const restLine = [...lines.values()].find((l) => l.cover >= .9 * (hi - lo));
    const rest = restLine ? { id: restLine.id, gap: r3(restLine.gap) } : null;
    // Clear width beyond the leaf's tip (across the wall) and, for a resting leaf, beside its free face (along the
    // wall), up to the first wall, bed, obstacle, stair / void or placed leaf (room edges may be open plan).
    const solids = [...walls.map(wallRect), ...fixed.map((o) => o.rect), ...blocked.map((o) => o.rect), ...placed.map((o) => o.rect)];
    const tip = ray(solids, axis === 'x' ? [ac, n1] : [n1, ac], axis === 'x' ? [0, n] : [n, 0]);
    const away = side === 'lo' ? 1 : -1, freeFace = side === 'lo' ? ac + t / 2 : ac - t / 2;
    const beside = Math.min(...[.15, .5, .85].map((k) => { const v = n0 + (n1 - n0) * k; return ray(solids, axis === 'x' ? [freeFace, v] : [v, freeFace], axis === 'x' ? [away, 0] : [0, away]); }));
    const need = CIRCULATION.has(R.kind) ? DOOR.hall : DOOR.room;
    if (!(tip >= need || (rest && beside >= need))) hits.push(`clearance tip ${tip.toFixed(2)} beside ${beside.toFixed(2)}`);
    // A leaf standing free must not shut the doorway into a pocket: past its tip, on the opening's side, 0.65 m stays clear.
    if (!rest) {
      const round = axRect(axis, ac, ac + away * .65, n1, n1 + n * .65);
      if (solids.some((q) => ov(round, q, .005))) hits.push('no walk round the tip');
    }
    return { rect, w, rest, hits, soft, tip, beside, angle: 90,
      hinge: pt(axis, ac, n0), free: pt(axis, ac, n1), closed: pt(axis, side === 'lo' ? ac + w : ac - w, line) };
  };
  const setAt = (p, s, g0) => { const c = g0 + p.door.width / 2; p.door.at = r3(s.sign > 0 ? c - s.a0 : s.a0 - c); };
  const doors = res.partitions.filter((p) => p.door && !['opening', 'balcony-slider', 'railing'].includes(p.role));
  const deepest = (p) => Math.max(...p.id.split('/').map((id) => depth.get(id) ?? 0));
  // Deeper (more private) doors first: a store behind a bathroom settles before the bathroom's own door.
  doors.sort((a, b) => deepest(b) - deepest(a) || (a.id < b.id ? -1 : 1));
  const plan = new Map(doors.map((p) => [p.id, { at: p.door.at, span: doorSpan(p) }]));
  const ctxOf = (p) => {
    const s = partitionAxis(p), ids = p.id.split('/').filter((id) => rooms.has(id) && !['stair', 'void'].includes(rooms.get(id).kind));
    /** 0 for the room this door serves: the private one, or the deeper of two private rooms. */
    const prefer = (id) => {
      const other = ids.find((q) => q !== id);
      if (!other) return 0;
      const k = rooms.get(id).kind, ko = rooms.get(other).kind;
      if (priv(k) !== priv(ko)) return priv(k) ? 0 : 1;
      if (!priv(k)) return 0;
      const d = depth.get(id) ?? 0, dO = depth.get(other) ?? 0;
      return d > dO || (d === dO && id < other) ? 0 : 1;
    };
    return { s, ids, prefer };
  };
  /** Every option for door p against the current state (p's own leaf not placed), best first. */
  const search = (p) => {
    const { s, ids, prefer } = ctxOf(p), width = p.door.width, [pg0] = plan.get(p.id).span, keep = p.door.at, list = [];
    base = { p, walls: wallSegments(res).filter((w) => w.id !== p.id), passages: doorPassages(res).filter((q) => q.id !== p.id) };
    const into = (id) => { const R = rooms.get(id), mid = s.axis === 'x' ? (R.rect.z0 + R.rect.z1) / 2 : (R.rect.x0 + R.rect.x1) / 2; return { id, R, n: mid > s.c ? 1 : -1 }; };
    const tryAll = (cands) => {
      for (const c of cands) {
        setAt(p, s, c.g0);
        let m = assess({ id: p.id, axis: s.axis, line: s.c, n: c.n, g0: c.g0, g1: c.g0 + width, side: c.side, R: c.R }), nudge = null;
        if (m.hits.length && m.hits.every((h) => h === `${c.id}-bed`)) {
          const to = bedNudge(c.R, m.rect, s.axis, c.n), b = to && res.beds.find((q) => q.room === c.id);
          if (to) {
            const from = [b.x, b.z];
            moveBed(b, ...to);
            const m2 = assess({ id: p.id, axis: s.axis, line: s.c, n: c.n, g0: c.g0, g1: c.g0 + width, side: c.side, R: c.R });
            moveBed(b, ...from);
            if (!m2.hits.length) { m = m2; nudge = { room: c.id, x: r3(to[0]), z: r3(to[1]), from }; }
          }
        }
        const shift = Math.abs(c.g0 - pg0), score = [m.hits.length ? 1 : 0, prefer(c.id), m.rest ? 0 : 1, m.soft.length, nudge ? 1 : 0, Math.round(shift * 100), c.side === 'lo' ? 0 : 1];
        if (log) log({ door: p.id, into: c.id, side: c.side, g0: r3(c.g0), shift: r3(shift), score, hits: m.hits, soft: m.soft, rest: m.rest, nudge, tip: r3(m.tip), beside: r3(m.beside) });
        list.push({ c, m, score, shift, nudge, at: p.door.at });
      }
    };
    // 1. Where the generator put it (either jamb, either room), and slid to a corner of either room where a solid
    //    perpendicular wall runs ≥ 0.95 m in from the door wall (the leaf then rests on it).
    const first = [];
    for (const id of ids) {
      const c = into(id), [lo, hi] = s.axis === 'x' ? [c.R.rect.x0, c.R.rect.x1] : [c.R.rect.z0, c.R.rect.z1];
      for (const side of ['lo', 'hi']) first.push({ ...c, side, g0: pg0 });
      for (const [side, E] of [['lo', lo], ['hi', hi]]) {
        if (E < s.lo - EPS || E > s.hi + EPS) continue;
        const along = base.walls.filter((w) => w.solid && w.axis !== s.axis && Math.abs(w.c - E) < EPS);
        const [a0, a1] = c.n > 0 ? [s.c + .07, s.c + .95] : [s.c - .95, s.c - .07];
        if (!along.length || covered(along, a0, a1) < a1 - a0 - .01) continue;
        const half = Math.max(...along.map((w) => w.half)), g0 = side === 'lo' ? E + half + DOOR.pier : E - half - DOOR.pier - width;
        if (g0 < s.lo - EPS || g0 + width > s.hi + EPS || Math.abs(g0 - pg0) < .005) continue;
        first.push({ ...c, side, g0 });
      }
    }
    tryAll(first);
    // 2. Nothing clear in the room the door serves: slide the opening along the partition (10 cm steps) until it clears.
    const top = () => list.reduce((b, o) => (!b || better(o.score, b.score) ? o : b), null);
    if (!top() || top().score[0] || top().score[1]) {
      const sweep = [];
      for (const id of ids.filter((q) => prefer(q) === 0)) for (let g0 = s.lo + .09; g0 + width <= s.hi - .09 + EPS; g0 += .1) for (const side of ['lo', 'hi']) sweep.push({ ...into(id), side, g0 });
      tryAll(sweep);
    }
    p.door.at = keep; base = null;
    return list.sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0));
  };
  const chosen = new Map();
  /** Hang door p as option `best` (a swing leaf), or as a pocket leaf when best still clashes. */
  const commit = (p, best) => {
    const { s, ids, prefer } = ctxOf(p), { at: planAt, span: [pg0, pg1] } = plan.get(p.id);
    chosen.set(p.id, best);
    if (best && !best.m.hits.length) {
      const { c, m } = best;
      if (best.nudge) { const b = res.beds.find((q) => q.room === best.nudge.room); moveBed(b, best.nudge.x, best.nudge.z); b.nudged = { from: best.nudge.from, by: p.id }; }
      p.door.at = best.at;
      if (Math.abs(best.at - planAt) > 1e-6) p.door.planAt = planAt; else delete p.door.planAt;
      const leaf = { id: p.id, kind: 'swing', into: c.id, axis: s.axis, line: s.c, n: c.n, side: c.side, angle: 90, w: r3(m.w), t: DOOR.t, h: DOOR.h,
        hinge: m.hinge, free: m.free, closed: m.closed, rect: rounded(m.rect), rest: m.rest, shift: r3(best.shift), planAt };
      p.door.leaf = leaf; placed.push(leaf);
      return leaf;
    }
    // 3. No clash-free swing: a pocket leaf that slides into the longer solid stretch of wall beside the opening.
    p.door.at = planAt; delete p.door.planAt;
    const pid = ids.slice().sort((a, b) => prefer(a) - prefer(b))[0] ?? null;
    const segs = wallSegments(res).filter((w) => w.id === p.id && w.solid);
    const len = (g) => { const w = segs.find((q) => Math.abs(q.hi - g) < .01 || Math.abs(q.lo - g) < .01); return w ? w.hi - w.lo : 0; };
    const side = len(pg0) >= len(pg1) ? 'lo' : 'hi', w = pg1 - pg0 - 2 * DOOR.lining - .01, edge = side === 'lo' ? pg0 + DOOR.lining : pg1 - DOOR.lining;
    p.door.leaf = { id: p.id, kind: 'pocket', into: pid, axis: s.axis, line: s.c, n: 0, side, angle: 0, w: r3(w), t: DOOR.t, h: DOOR.h,
      hinge: pt(s.axis, edge, s.c), free: pt(s.axis, edge, s.c), closed: pt(s.axis, side === 'lo' ? edge + w : edge - w, s.c),
      rect: null, rest: null, shift: 0, planAt, why: best ? best.m.hits.slice(0, 4) : ['no room'] };
    return p.door.leaf;
  };
  const release = (p) => {
    const i = placed.indexOf(p.door.leaf);
    if (i >= 0) placed.splice(i, 1);
    delete p.door.leaf; delete p.door.planAt; p.door.at = plan.get(p.id).at;
  };
  for (const p of doors) commit(p, search(p)[0]);
  // Repair: a leaf left standing free because a neighbouring door's opening breaks its resting wall (or its doorway
  // is in the way). Re-hang that neighbour at another resting option and try again; keep the pair only if both rest.
  for (const p of doors) {
    if (p.door.leaf.kind !== 'swing' || p.door.leaf.rest) continue;
    const mineRooms = new Set(p.id.split('/'));
    for (const x of doors) {
      if (x === p || !x.id.split('/').some((id) => mineRooms.has(id)) || x.door.leaf.kind !== 'swing' || !x.door.leaf.rest) continue;
      const before = { p: chosen.get(p.id), x: chosen.get(x.id) };
      release(p); release(x);
      let done = false;
      for (const ox of search(x)) {
        if (ox.m.hits.length || !ox.m.rest || ox.score[1] > before.x.score[1] || Math.abs(ox.at - before.x.at) < .005) continue;
        commit(x, ox);
        const op = search(p)[0];
        if (op && !op.m.hits.length && op.m.rest && op.score[1] <= before.p.score[1]) { commit(p, op); done = true; break; }
        release(x);
      }
      if (done) break;
      commit(x, before.x); commit(p, before.p);
    }
  }
  out.push(...doors.map((p) => p.door.leaf));
  // Keep the bathroom / kitchen door records (side, `at` from the room corner) in step with moved openings.
  for (const rec of [...(res.bathrooms || []), ...(res.kitchen ? [{ ...res.kitchen, id: 'kitchen', ref: res.kitchen }] : [])]) {
    if (!rec.door) continue;
    const p = res.partitions.find((q) => q.door?.planAt != null && q.id.split('/').includes(rec.id) && within(q, rec.rect));
    if (!p) continue;
    const s = partitionAxis(p), [g0, g1] = doorSpan(p);
    (rec.ref || rec).door = { ...rec.door, at: r2((g0 + g1) / 2 - (s.axis === 'x' ? rec.rect.x0 : rec.rect.z0)) };
  }
  // Front door: into the foyer, hung on the jamb nearer a foyer side wall. The entry stays where the core puts it, so
  // the leaf rests at 90° on that side wall when the pier is ≤ 5 cm, else folds back 180° flat on the front wall.
  const e = res.entryDoor;
  if (e) {
    const R = res.rooms.find((r) => e.at > r.rect.x0 && e.at < r.rect.x1 && r.rect.z0 < .05 && r.rect.z1 > .05) || null;
    const g0 = e.at - e.width / 2, g1 = e.at + e.width / 2, t = DOOR.frontT, lining = DOOR.frontLining, w = e.width - 2 * lining - .01;
    const stubs = wallSegments(res).filter((s) => s.axis === 'z' && s.lo <= .3);
    const pier = (side) => Math.min(9, ...stubs.filter((s) => side === 'lo' ? s.c <= g0 : s.c >= g1).map((s) => side === 'lo' ? g0 - s.c - s.half : s.c - s.half - g1));
    let pick = null;
    for (const side of ['lo', 'hi']) {
      const m90 = assess({ id: 'entry', axis: 'x', line: 0, n: 1, g0, g1, side, R, t, lining, half0: HALF.party });
      const hx = side === 'lo' ? g0 + lining : g1 - lining, fx = side === 'lo' ? hx - w : hx + w, z = HALF.party + .02 + t / 2;
      const rect = axRect('x', hx, fx, z - t / 2, z + t / 2), c180 = check('entry', 'x', rect, R);
      const m180 = { rect, w, hits: c180.hits, soft: c180.soft, angle: 180, rest: { id: 'outline-N', gap: .02 }, hinge: [r3(hx), r3(z)], free: [r3(fx), r3(z)], closed: [r3(side === 'lo' ? hx + w : hx - w), 0] };
      for (const m of [m90, m180]) {
        const score = [m.hits.length ? 1 : 0, m.rest ? 0 : 1, Math.round(pier(side) * 100), m.angle === 90 ? 0 : 1];
        if (log) log({ door: 'entry', side, angle: m.angle, score, hits: m.hits, rest: m.rest });
        if (!pick || better(score, pick.score)) pick = { side, m, score, pier: pier(side) };
      }
    }
    const { m } = pick;
    e.leaf = { id: 'entry', kind: 'swing', front: true, into: R?.id ?? null, axis: 'x', line: 0, n: 1, side: pick.side, angle: m.angle, w: r3(m.w), t, h: DOOR.frontH,
      hinge: m.hinge, free: m.free, closed: m.closed, rect: rounded(m.rect), rest: m.rest, pier: r3(pick.pier), shift: 0, planAt: e.at, ...(m.hits.length ? { why: m.hits } : {}) };
    placed.push(e.leaf); out.push(e.leaf);
  }
  // A bedside table in a doorway, against a parked leaf or in a leaf's swing becomes a slim one, or is left out
  // (bed.tables: 'L' / 'R' full, 'l' / 'r' slim).
  const passages = doorPassages(res);
  const clearOf = (q) => !passages.some((p) => ov(p.rect, q, .005)) && !placed.some((l) => ov(grow(l.rect, .01), q) || inSwing(l, q));
  for (const b of res.beds || []) {
    const mine = tables.filter((o) => o.id.startsWith(`${b.room}-bedside`)).map((o) => o.id.at(-1));
    b.tables = mine.map((t) => clearOf(bedsideRect(b, t === 'L' ? -1 : 1)) ? t : clearOf(bedsideRect(b, t === 'L' ? -1 : 1, true)) ? t.toLowerCase() : null).filter(Boolean);
  }
  res.doorLeaves = out;
  res.obstacles = [...(res.obstacles || []), ...placed.map((l) => ({ id: `door-leaf/${l.id}`, rect: l.rect }))];
  return res;
}

// Every west floor repeats the same five plans and the north towers reuse plans across floors: choose once per plan.
const LEAF_CACHE = new Map();
/** Choose (memoized per plan) and apply the door leaves of one level-unit; returns res.doorLeaves. */
export function doorLeaves(res, opts = {}) {
  if (opts.log) { const r = chooseLeaves(res, opts); for (const leaf of refugeDoorLeaves(r)) leaf.fire = '乙级'; return r.doorLeaves; }
  const key = JSON.stringify([res.plan, res.level, res.width, res.depth, res.entryDoor, res.exteriorSides, res.rooms, res.partitions, res.beds, res.obstacles, res.facadeWalls]);
  let done = LEAF_CACHE.get(key);
  if (!done) {
    const r = chooseLeaves(structuredClone(res));
    done = { doors: Object.fromEntries(r.partitions.filter((p) => p.door).map((p) => [p.id, p.door])), entry: r.entryDoor, beds: r.beds,
      bathrooms: r.bathrooms, kitchen: r.kitchen, obstacles: r.obstacles };
    LEAF_CACHE.set(key, done);
  }
  const d = structuredClone(done);
  for (const p of res.partitions) if (d.doors[p.id]) p.door = d.doors[p.id];
  if (res.entryDoor) res.entryDoor = d.entry;
  res.beds = d.beds; res.bathrooms = d.bathrooms; res.kitchen = d.kitchen; res.obstacles = d.obstacles;
  for (const leaf of refugeDoorLeaves(res)) leaf.fire = '乙级';
  res.doorLeaves = [...res.partitions.filter((p) => p.door?.leaf).map((p) => p.door.leaf), ...(res.entryDoor?.leaf ? [res.entryDoor.leaf] : [])];
  return res.doorLeaves;
}

/**
 * The leaves of the 户内避难间 door (GB 50016 §5.5.32: 宜 乙级): the doors of residence.refugeRoom whose
 * leaf swings into it (its entrance from the hall; an en-suite or closet door swings the other way).
 * If none swings in, its doors onto circulation rooms. Empty when the plan names no refuge room.
 */
export function refugeDoorLeaves(res) {
  const id = res.refugeRoom;
  if (id == null) return [];
  const mine = res.partitions.filter((p) => p.door?.leaf && p.id.split('/').includes(id));
  const into = mine.filter((p) => p.door.leaf.into === id);
  const kindOf = new Map(res.rooms.map((r) => [r.id, r.kind]));
  const onto = mine.filter((p) => p.id.split('/').some((q) => q !== id && CIRCULATION.has(kindOf.get(q))));
  return (into.length ? into : onto).map((p) => p.door.leaf);
}

/**
 * One level-unit from a generated plan (unit-local: x along the entry front, z from the
 * front to the rear). fronts defaults to the entry front; an upper duplex level has none.
 */
export function communityUnit({ lv, building, id, code, slot, frame, plan, name, en, catLabel, accent,
  fronts, home, homeLevels, partner, community, refugeRoom }) {
  const residence = structuredClone(plan);
  const bid = building ?? lv.building;
  residence.community = community || residence.community || (/^T/.test(bid) ? 'north' : 'west');
  residence.home = home ?? residence.home ?? id;
  residence.homeLevels = [...(homeLevels ?? residence.homeLevels ?? [lv.id])];
  if (partner != null) residence.partner = partner;
  // 户内避难间 (GB 50016 §5.5.32, supertall P0a): a room id of this plan; its door leaf becomes 乙级 (doorLeaves).
  // Absent, the plan's own refugeRoom (if any) stands; today's frozen data has none.
  if (refugeRoom != null) residence.refugeRoom = refugeRoom;
  if (residence.homeStair || residence.voids?.length) duplexParts(residence);
  doorLeaves(residence);
  const upper = residence.level === 'upper' || residence.entryDoor == null;
  const fr = (fronts ?? (upper ? [] : [{ x0: 0, z0: 0, x1: plan.width, z1: 0, side: 'N' }])).map((f) => ({ ...f }));
  const r = rect(0, 0, plan.width, plan.depth);
  return {
    id, code, slot: String(slot), building: bid, level: lv.id, frame,
    rects: [r], polys: [lrectPoly(frame, r)], fronts: fr, wfronts: fr.map((f) => lseg(frame, f)),
    style: 'residence', area: plan.area,
    brand: { name, en, cat: 'community', catLabel: catLabel ?? `${plan.label} · ${Math.round(plan.area)}㎡`,
      bg: accent ?? COMMUNITY_ACCENT[residence.community], fg: '#ffffff', logo: 'diamond' },
    residence,
  };
}

/**
 * The two level-units of one generated duplex, for callers outside the 西苑 / 北苑 builders (二期 R 顶层复式).
 * spec: { building, community, home, slot, accent?, catLabel?,
 *         levels: [lowerLv, upperLv], ids: [lowerId, upperId], codes: [lower, upper] (or code),
 *         names: [lower, upper] (or name), en: [lower, upper] (or en), plans: [lowerPlan, upperPlan],
 *         refugeRooms?: [lowerRoomId | null, upperRoomId | null] (户内避难间; the entry level's bedroom by rule) }
 * frame: the unit frame both levels share (x along the entry front, z to the rear facade).
 * Returns [lower, upper]: partners of each other, homeLevels both level ids, the upper with no front.
 */
export function buildDuplexUnits(spec, frame) {
  const { levels, ids, plans } = spec;
  if (levels?.length !== 2 || ids?.length !== 2 || plans?.length !== 2) throw new Error('buildDuplexUnits: two levels, ids and plans');
  const pick = (v, i) => (Array.isArray(v) ? v[i] : v);
  const homeLevels = levels.map((lv) => lv.id);
  return [0, 1].map((i) => communityUnit({ lv: levels[i], building: spec.building, id: ids[i], code: pick(spec.codes ?? spec.code, i),
    slot: spec.slot, frame, plan: plans[i], name: pick(spec.names ?? spec.name, i), en: pick(spec.en, i), catLabel: spec.catLabel,
    accent: spec.accent, community: spec.community, home: spec.home ?? ids[0], homeLevels, partner: ids[1 - i], ...(i ? { fronts: [] } : {}),
    ...(spec.refugeRooms?.[i] != null ? { refugeRoom: spec.refugeRooms[i] } : {}) }));
}
