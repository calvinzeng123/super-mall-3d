/**
 * 云澜社区住宅户型平面图（布局图）目录。
 *
 * 为每个户型层（西苑 10 张 + 北苑 68 张 = 78 张）输出世界方位（上北下南、左西右东）的
 * SVG 平面图与 1000 px 宽 PNG，另出三张索引总图（西苑 / 北苑 1 号楼 / 北苑 2 号楼）和两张
 * 剖面楼层图（北苑、西苑），并校核面积、标注与门扇。
 *
 * Usage: node scripts/unit-catalog-plans.mjs <outDir>
 *   <outDir>/plans/<户号>-<楼层>F.svg|.png   例如 W1-SW-12F、T1-08W-8F、T1-16W-16F、T1-16W-17F
 *   <outDir>/index-west.jpg、index-T1.jpg、index-T2.jpg
 *   <outDir>/north-section.jpg、west-section.jpg
 *   <outDir>/plans/manifest.json            每张图的标题、面积校核、标注溢出与门扇检查
 *
 * Needs node and Playwright (Chromium) only: `playwright` is resolved from the project, from
 * $PLAYWRIGHT_PATH, or from /opt/node-tools/node_modules/playwright.
 * Geometry comes from the built layout, buildLayout({ expansion: true }): every room, wall, window
 * and door is the unit-local plan data of the unit record, mapped through the unit's world frame.
 * Doors are drawn where the renderer (src/render/build/residence-interiors.js, communityHome)
 * puts them: the leaf stands open at 90° on the (dz, −dx) side of the partition a→b.
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildLayout } from '../src/layout/layout.js';
import { COMMUNITY_PLANS } from '../src/layout/community-plan-data.js';
import { northStops } from '../src/layout/north-towers.js';
import { NORTH_SITE, WEST_SITE } from '../src/layout/community-sites.js';
import { toW, dirW } from '../src/layout/geom.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONT = `'WenQuanYi Zen Hei','Noto Sans CJK SC','Source Han Sans SC','PingFang SC','Microsoft YaHei',sans-serif`;
const EPS = 1e-6;
const S0 = 36;            // plan scale, px per metre (all sheets share it so the thumbnails compare)
const SHEET_W = 1000;     // PNG width
const PAD = 30;

/* ------------------------------------------------------------------ helpers */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const fmtA = (a) => String(Number(a.toFixed(1)));
const n2 = (v) => Math.round(v * 100) / 100;
const SIDE_CN = { N: '北', S: '南', E: '东', W: '西' };
const LOCAL_N = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const TOWER_NO = (id) => id.slice(1);
const worldSide = (F, side) => { const [nx, nz] = dirW(F, ...LOCAL_N[side]); return Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 'E' : 'W') : (nz > 0 ? 'S' : 'N'); };
const wpt = (F, p) => toW(F, p[0], p[1]);
function wrect(F, r) {
  const a = toW(F, r.x0, r.z0), b = toW(F, r.x1, r.z1);
  return { x0: Math.min(a[0], b[0]), z0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), z1: Math.max(a[1], b[1]) };
}
const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1) });
const grow = (r, m) => ({ x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m });
const rArea = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const overlapArea = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
const inRect = (p, r, e = EPS) => p[0] >= r.x0 - e && p[0] <= r.x1 + e && p[1] >= r.z0 - e && p[1] <= r.z1 + e;
const boxesOverlap = (a, b, e = 0) => a.x0 < b.x1 - e && b.x0 < a.x1 - e && a.y0 < b.y1 - e && b.y0 < a.y1 - e;

/** Room kinds → colour categories (one palette for every sheet). */
const CATS = [
  { key: 'living', label: '起居 / 餐厅', fill: '#f6e6c6', kinds: ['living', 'dining', 'family'] },
  { key: 'bedroom', label: '卧室', fill: '#d9e7f5', kinds: ['bedroom'] },
  { key: 'study', label: '书房 / 影音 / 茶室', fill: '#e6ddf1', kinds: ['study'] },
  { key: 'kitchen', label: '厨房', fill: '#f8d8b8', kinds: ['kitchen'] },
  { key: 'wet', label: '卫浴 / 家务', fill: '#cfeae6', kinds: ['bathroom', 'powder', 'laundry'] },
  { key: 'balcony', label: '阳台', fill: '#dcefcf', kinds: ['balcony'] },
  { key: 'storage', label: '储藏 / 衣帽', fill: '#e6e1d8', kinds: ['storage', 'closet'] },
  { key: 'hall', label: '玄关 / 走廊', fill: '#efebe3', kinds: ['hall', 'entry'] },
  { key: 'stair', label: '套内楼梯', fill: 'url(#hatch)', kinds: ['stair'] },
  { key: 'void', label: '挑空', fill: '#ffffff', kinds: ['void'] },
];
const CAT_OF = Object.fromEntries(CATS.flatMap((c) => c.kinds.map((k) => [k, c])));
const CIRCULATION = new Set(['hall', 'entry', 'living', 'dining', 'family']);
const COL = { ext: '#2b2b2b', party: '#3d3d3d', part: '#5b5753', glass: '#4b82ad', glassFill: '#d5e7f4', rail: '#6c8ea6', door: '#6b5640', arc: '#9b8b76', entry: '#c0392b', ctx: '#c9c5bd', ctxFill: '#f5f4f1', ctxText: '#8d887f' };
const T_EXT = 0.24, T_PARTY = 0.2, T_PART = 0.1;

async function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return req(t); } catch { /* next */ } }
  throw new Error('Playwright not found: install it (npm i -D playwright) or set PLAYWRIGHT_PATH');
}

/* ------------------------------------------------------------------ parts */
const DUP_TAG = (h) => `${h.levels[0]}–${h.levels[1]}${h.side}`;
function collectParts(L) {
  const lvById = new Map(L.levels.map((l) => [l.id, l]));
  const out = [];
  for (const [tid, T] of Object.entries(COMMUNITY_PLANS.west)) {
    const lv = lvById.get(`${tid}-12F`);
    for (const [i, w] of T.units.entries()) {
      const unit = lv.units.find((u) => u.id === `${lv.id}-${w.slot}`);
      if (!unit || unit.residence.plan !== w.plan.plan) throw new Error(`${tid} ${w.slot}: unit record missing`);
      out.push({ community: 'west', tower: tid, slot: w.slot, slotNo: i + 1, homeId: `${tid}-${w.slot}`, floor: 12, lv, unit, res: unit.residence,
        file: `${tid}-${w.slot}-12F`, homeArea: w.plan.area });
    }
  }
  for (const [tid, T] of Object.entries(COMMUNITY_PLANS.north)) {
    for (const h of T.homes) {
      const total = h.parts.reduce((s, p) => s + p.plan.area, 0);
      h.parts.forEach((p, i) => {
        const lv = lvById.get(`${tid}-${h.levels[i]}F`);
        const unit = lv.units.find((u) => u.id === `${lv.id}-${h.side}`);
        if (!unit || unit.residence.plan !== p.plan.plan) throw new Error(`${h.id} ${h.levels[i]}F: unit record missing`);
        out.push({ community: 'north', tower: tid, slot: h.side, homeId: h.id, home: h, partIndex: i, floor: h.levels[i], lv, unit, res: unit.residence,
          file: `${h.id}-${h.levels[i]}F`, homeArea: total });
      });
    }
  }
  return out;
}

/**
 * 面宽 × 进深 as drawn (north up): 面宽 is the east–west extent, 进深 the north–south one. The plan
 * data's width/depth are unit-local (width runs along the entry wall), which for the 北苑 homes is
 * the north–south core wall, so their width/depth would read the wrong way round on these sheets.
 */
function worldSize(p) {
  const b = wrect(p.unit.frame, { x0: 0, z0: 0, x1: p.res.width, z1: p.res.depth });
  return `面宽 ${f1(b.x1 - b.x0)} m × 进深 ${f1(b.z1 - b.z0)} m`;
}

function titles(p) {
  const r = p.res, n = TOWER_NO(p.tower);
  if (p.community === 'west') {
    const ext = r.exteriorSides.map((s) => SIDE_CN[worldSide(p.unit.frame, s)]).join(' / ');
    return {
      title: `云澜·西苑 ${n} 号楼 ${p.slot} 户 · ${r.label} · ${fmtA(r.area)} ㎡`,
      sub: `户型 ${r.plan} · 标准层 12F（2F–28F 同户型，12F 标高 ${f1(p.lv.elev)} m，层高 ${f1(p.lv.height)} m）· ${worldSize(p)} · ${r.bedrooms} 卧 · 采光面 ${ext}`,
      caption: [`${n} 号楼 · ${p.slot} 户`, `${r.label} · ${fmtA(r.area)} ㎡`, '2F–28F（图为 12F）'],
    };
  }
  const h = p.home, ext = r.exteriorSides.map((s) => SIDE_CN[worldSide(p.unit.frame, s)]).join(' / ');
  const env = `${p.floor}F 标高 ${f1(p.lv.elev)} m · 层高 ${f1(p.lv.height)} m · ${worldSize(p)} · 采光面 ${ext}`;
  if (h.kind === 'duplex') {
    const upper = r.level === 'upper';
    return {
      title: `云澜·北苑 ${n} 号楼 ${DUP_TAG(h)} ${upper ? '上层' : '下层'}（${p.floor}F）· ${r.label} · ${fmtA(r.area)} ㎡`,
      sub: `户型 ${r.plan} · 错层复式${upper ? '上层（经套内楼梯，无户门）' : '下层（入户层）'} · 全户 ${fmtA(p.homeArea)} ㎡ · ${env}`,
      caption: [`${n} 号楼 · ${DUP_TAG(h)} 复式`, `${r.label} · ${fmtA(p.homeArea)} ㎡`, `${h.levels[0]}F 下层 / ${h.levels[1]}F 上层`],
    };
  }
  const tag = h.id.split('-')[1], pent = h.kind === 'penthouse-flat';
  return {
    title: `云澜·北苑 ${n} 号楼 ${tag} ${pent ? '顶层大平层' : '大平层'}（${p.floor}F）· ${r.label} · ${fmtA(r.area)} ㎡`,
    sub: `户型 ${r.plan} · 一梯一户${pent ? ' · 顶层' : ''} · ${env}`,
    caption: [`${n} 号楼 · ${tag}${pent ? ' 顶层' : ''}`, `${r.label} · ${fmtA(r.area)} ㎡`, `${p.floor}F`],
  };
}

/* ------------------------------------------------------------------ plan analysis */
/** Solid wall segments of a plan (unit-local), for the door checks. */
function solidSegments(res) {
  const W = res.width, D = res.depth, segs = [];
  const add = (a, b, id, gaps = []) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.02) return;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    let ivs = [[0, len]];
    for (const [g0, g1] of gaps) ivs = ivs.flatMap(([s0, s1]) => [[s0, Math.min(s1, g0)], [Math.max(s0, g1), s1]]).filter(([s0, s1]) => s1 - s0 > 0.02);
    for (const [s0, s1] of ivs) segs.push({ id, a: [a[0] + dx * s0, a[1] + dz * s0], b: [a[0] + dx * s1, a[1] + dz * s1] });
  };
  const ent = res.entryDoor;
  add([0, 0], [W, 0], 'outline-N', ent ? [[ent.at - ent.width / 2, ent.at + ent.width / 2]] : []);
  add([W, 0], [W, D], 'outline-E'); add([0, D], [W, D], 'outline-S'); add([0, 0], [0, D], 'outline-W');
  for (const p of res.partitions) {
    if (p.role === 'balcony-slider') continue;
    const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
    const gaps = p.door ? [[Math.max(0, p.door.at - p.door.width / 2), Math.min(len, p.door.at + p.door.width / 2)]] : [];
    add(p.a, p.b, p.id, gaps);
  }
  return segs;
}
const segAxis = (s) => Math.abs(s.a[1] - s.b[1]) < 1e-6 ? 'x' : 'z';
/** Does the thin rect r (unit-local) cross segment s (excluding touching at the ends)? */
function segHitsRect(s, r, e = 0.02) {
  const x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]), z0 = Math.min(s.a[1], s.b[1]), z1 = Math.max(s.a[1], s.b[1]);
  return x0 < r.x1 - e && x1 > r.x0 + e && z0 < r.z1 - e && z1 > r.z0 + e;
}
const roomAt = (res, p) => res.rooms.find((q) => inRect(p, q.rect, 1e-3) && p[0] > q.rect.x0 && p[0] < q.rect.x1 && p[1] > q.rect.z0 && p[1] < q.rect.z1);

/** Length of the edge rooms a and b share that no partition covers (an open-plan junction). */
function openEdge(res, a, b) {
  const covered = (axis, c, lo, hi) => {
    let ivs = [[lo, hi]];
    for (const p of res.partitions) {
      const ax = segAxis(p), cc = ax === 'x' ? p.a[1] : p.a[0];
      if (ax !== axis || Math.abs(cc - c) > 1e-3) continue;
      const pl = ax === 'x' ? Math.min(p.a[0], p.b[0]) : Math.min(p.a[1], p.b[1]), ph = ax === 'x' ? Math.max(p.a[0], p.b[0]) : Math.max(p.a[1], p.b[1]);
      ivs = ivs.flatMap(([u, v]) => [[u, Math.min(v, pl)], [Math.max(u, ph), v]]).filter(([u, v]) => v - u > 0.05);
    }
    return ivs.reduce((sum, [u, v]) => sum + v - u, 0);
  };
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  if (ox > 0.3 && (Math.abs(a.z1 - b.z0) < 1e-3 || Math.abs(b.z1 - a.z0) < 1e-3)) return covered('x', Math.abs(a.z1 - b.z0) < 1e-3 ? a.z1 : a.z0, Math.max(a.x0, b.x0), Math.min(a.x1, b.x1));
  if (oz > 0.3 && (Math.abs(a.x1 - b.x0) < 1e-3 || Math.abs(b.x1 - a.x0) < 1e-3)) return covered('z', Math.abs(a.x1 - b.x0) < 1e-3 ? a.x1 : a.x0, Math.max(a.z0, b.z0), Math.min(a.z1, b.z1));
  return 0;
}
/** Rooms of one name and kind joined by a wall-free edge (e.g. 餐厅 + 餐厅 fragment) label as one. */
function labelGroups(res) {
  const parent = new Map(res.rooms.map((q) => [q.id, q.id]));
  const find = (id) => parent.get(id) === id ? id : find(parent.get(id));
  for (const a of res.rooms) for (const b of res.rooms) {
    if (a.id >= b.id || a.name !== b.name || a.kind !== b.kind) continue;
    if (openEdge(res, a.rect, b.rect) > 0.6) parent.set(find(a.id), find(b.id));
  }
  const groups = new Map();
  for (const q of res.rooms) { const k = find(q.id); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); }
  return [...groups.values()].map((rooms) => ({ rooms, host: rooms.reduce((m, q) => rArea(q.rect) > rArea(m.rect) ? q : m), area: rooms.reduce((sum, q) => sum + rArea(q.rect), 0) }));
}

/** Every internal door leaf as the renderer places it, with the checks. */
function doorLeaves(res) {
  const out = [];
  for (const p of res.partitions) {
    if (!p.door || p.role === 'opening' || p.role === 'railing' || p.role === 'balcony-slider') continue;
    const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
    const dx = (p.b[0] - p.a[0]) / len, dz = (p.b[1] - p.a[1]) / len;
    const d0 = Math.max(0, p.door.at - p.door.width / 2), d1 = Math.min(len, p.door.at + p.door.width / 2), w = d1 - d0 - 0.06;
    const hinge = [p.a[0] + dx * (d0 + 0.03), p.a[1] + dz * (d0 + 0.03)], n = [dz, -dx];
    const tip = [hinge[0] + n[0] * w, hinge[1] + n[1] * w], close = [p.a[0] + dx * (d0 + 0.03 + w), p.a[1] + dz * (d0 + 0.03 + w)];
    out.push({ p, len, dx, dz, d0, d1, w, hinge, tip, close, n });
  }
  return out;
}

function analysePlan(res) {
  const issues = [], notes = [];
  const W = res.width, D = res.depth, plate = { x0: 0, z0: 0, x1: W, z1: D };
  // Areas.
  const sum = res.rooms.reduce((s, q) => s + rArea(q.rect), 0);
  const pct = (sum - res.area) / res.area * 100;
  let overlap = 0;
  for (let i = 0; i < res.rooms.length; i++) for (let j = i + 1; j < res.rooms.length; j++) overlap += overlapArea(res.rooms[i].rect, res.rooms[j].rect);
  for (const q of res.rooms) if (!inRect([q.rect.x0, q.rect.z0], plate) || !inRect([q.rect.x1, q.rect.z1], plate)) issues.push(`房间 ${q.id} 超出户型外框`);
  if (overlap > 0.01) issues.push(`房间互相重叠 ${f1(overlap)} ㎡`);
  // Doors (leaves exactly as rendered).
  const segs = solidSegments(res), leaves = doorLeaves(res), doors = [];
  for (const L of leaves) {
    const [ra, rb] = L.p.id.split('/');
    const mid = [L.hinge[0] + L.n[0] * L.w / 2 + (L.dx) * 0.08, L.hinge[1] + L.n[1] * L.w / 2 + (L.dz) * 0.08];
    const into = roomAt(res, mid), other = [ra, rb].find((id) => id !== into?.id);
    const kindOf = (id) => res.rooms.find((q) => q.id === id)?.kind;
    const leafRect = { x0: Math.min(L.hinge[0], L.tip[0]) - 0.02, x1: Math.max(L.hinge[0], L.tip[0]) + 0.02, z0: Math.min(L.hinge[1], L.tip[1]) - 0.02, z1: Math.max(L.hinge[1], L.tip[1]) + 0.02 };
    // A wall perpendicular to the partition, within 0.3 m of the hinge and on the leaf side, parks the leaf.
    const along = segAxis({ a: L.p.a, b: L.p.b });
    const support = segs.find((s) => {
      if (s.id === L.p.id || segAxis(s) === along) return false;
      const c = along === 'x' ? s.a[0] : s.a[1];                       // the support's coordinate along the partition
      const h = along === 'x' ? L.hinge[0] : L.hinge[1];
      if (Math.abs(c - h) > 0.3) return false;
      const lo = along === 'x' ? Math.min(s.a[1], s.b[1]) : Math.min(s.a[0], s.b[0]), hi = along === 'x' ? Math.max(s.a[1], s.b[1]) : Math.max(s.a[0], s.b[0]);
      const base = along === 'x' ? L.p.a[1] : L.p.a[0], dir = along === 'x' ? L.n[1] : L.n[0];
      const t0 = Math.min(base, base + dir * L.w), t1 = Math.max(base, base + dir * L.w);
      return Math.min(hi, t1) - Math.max(lo, t0) > L.w * 0.5;
    });
    const hits = segs.filter((s) => s.id !== L.p.id && s !== support && segHitsRect(s, leafRect)).map((s) => s.id);
    const shrink = (r, k) => ({ x0: r.x0 + k, z0: r.z0 + k, x1: r.x1 - k, z1: r.z1 - k });
    const beds = (res.obstacles || []).filter((o) => /-bed$/.test(o.id) || /^home-stair/.test(o.id)).filter((o) => overlapArea(shrink(o.rect, 0.03), leafRect) > 1e-6).map((o) => o.id);
    const outside = !inRect(L.tip, plate, 1e-3);
    const intoKind = into?.kind;
    const wrongRoom = into && ![ra, rb].includes(into.id);
    const outward = into && CIRCULATION.has(intoKind) && other && !CIRCULATION.has(kindOf(other));
    const d = { partition: L.p.id, at: L.p.door.at, width: L.p.door.width, leafInto: into?.id ?? null, freestanding: !support, outward: !!outward,
      hits, beds, outside, wrongRoom: !!wrongRoom };
    doors.push(d);
    if (outside) issues.push(`门 ${L.p.id}：门扇伸出户型外框`);
    if (!into) issues.push(`门 ${L.p.id}：门扇落在无房间处`);
    if (wrongRoom) issues.push(`门 ${L.p.id}：门扇开进第三个房间 ${into.id}`);
    if (hits.length) issues.push(`门 ${L.p.id}：门扇穿墙（${hits.join(', ')}）`);
    if (beds.length) issues.push(`门 ${L.p.id}：门扇与 ${beds.join(', ')} 重叠`);
    if (into && (intoKind === 'void' || intoKind === 'stair')) issues.push(`门 ${L.p.id}：门扇开向${intoKind === 'void' ? '挑空' : '楼梯'}`);
  }
  // A door gap that a perpendicular wall runs into.
  for (const L of leaves) {
    const along = segAxis({ a: L.p.a, b: L.p.b });
    const g0 = (along === 'x' ? L.p.a[0] : L.p.a[1]) + L.d0 * (along === 'x' ? L.dx : L.dz), g1 = (along === 'x' ? L.p.a[0] : L.p.a[1]) + L.d1 * (along === 'x' ? L.dx : L.dz);
    const [lo, hi] = [Math.min(g0, g1), Math.max(g0, g1)], line = along === 'x' ? L.p.a[1] : L.p.a[0];
    for (const s of segs) {
      if (segAxis(s) === along) continue;
      const c = along === 'x' ? s.a[0] : s.a[1];
      const sl = along === 'x' ? Math.min(s.a[1], s.b[1]) : Math.min(s.a[0], s.b[0]), sh = along === 'x' ? Math.max(s.a[1], s.b[1]) : Math.max(s.a[0], s.b[0]);
      if (c > lo + 0.05 && c < hi - 0.05 && sl <= line + 0.01 && sh >= line - 0.01) issues.push(`门 ${L.p.id}：门洞中间有墙 ${s.id}`);
    }
  }
  // Reachability: doors, openings, sliders and wall-free shared edges.
  const adj = new Map(res.rooms.map((q) => [q.id, new Set()]));
  const link = (a, b) => { if (adj.has(a) && adj.has(b)) { adj.get(a).add(b); adj.get(b).add(a); } };
  for (const p of res.partitions) if (p.door && p.role !== 'railing') { const [a, b] = p.id.split('/'); link(a, b); }
  for (let i = 0; i < res.rooms.length; i++) for (let j = i + 1; j < res.rooms.length; j++) {
    if (openEdge(res, res.rooms[i].rect, res.rooms[j].rect) > 0.6) link(res.rooms[i].id, res.rooms[j].id);
  }
  const ent = res.entryDoor;
  const start = ent ? roomAt(res, [ent.at, 0.05]) : res.rooms.find((q) => q.kind === 'stair');
  const seen = new Set();
  if (start) {
    const q = [start.id]; seen.add(start.id);
    while (q.length) { const id = q.shift(); for (const nb of adj.get(id)) if (!seen.has(nb)) { seen.add(nb); q.push(nb); } }
  } else issues.push('找不到入户房间');
  for (const r of res.rooms) if (!seen.has(r.id) && r.kind !== 'void') issues.push(`房间 ${r.id}（${r.name}）无门可达`);
  // Rooms reached only through a private room (e.g. a store behind a bathroom).
  const pub = new Set([...CIRCULATION, 'stair', 'balcony']);
  for (const r of res.rooms) {
    if (pub.has(r.kind) || !seen.has(r.id)) continue;
    const viaPublic = [...adj.get(r.id)].some((nb) => pub.has(res.rooms.find((q) => q.id === nb).kind));
    if (viaPublic) continue;
    const through = [...adj.get(r.id)].map((nb) => res.rooms.find((q) => q.id === nb));
    // Suites (bedroom → closet → bath) and stores off a kitchen, study, closet or utility room are normal;
    // a store or closet reachable only through a bathroom is not.
    const okEnsuite = ['bathroom', 'closet', 'study', 'powder'].includes(r.kind) && through.some((q) => q.kind === 'bedroom' || q.kind === 'closet');
    const okPantry = r.kind === 'storage' && through.some((q) => ['kitchen', 'bedroom', 'closet', 'study', 'laundry'].includes(q.kind));
    const note = `${r.id}（${r.name}）只能经 ${through.map((q) => `${q.id}（${q.name}）`).join(' / ')} 进入`;
    if (okEnsuite || okPantry) notes.push(note); else issues.push(note);
  }
  // Bedrooms and living rooms without a window.
  const lit = new Set((res.facadeWalls || []).flatMap((f) => f.openings.filter((o) => o.type === 'window').map((o) => o.room)));
  // A living room lit through its balcony slider counts as lit.
  const viaBalcony = (id) => res.partitions.some((p) => p.role === 'balcony-slider' && p.id.split('/').includes(id));
  for (const r of res.rooms) if (['bedroom', 'living'].includes(r.kind) && !lit.has(r.id) && !viaBalcony(r.id)) issues.push(`房间 ${r.id}（${r.name}）没有外窗`);
  return { area: res.area, roomSum: n2(sum), pct: n2(pct), mismatch: Math.abs(pct) > 2, overlap: n2(overlap), doors, issues, notes };
}

/* ------------------------------------------------------------------ text metrics */
let ADV = {};
const tw = (s, fs) => [...String(s)].reduce((w, ch) => w + (ADV[ch] ?? 100), 0) * fs / 100;
async function measureChars(page, chars) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><body><canvas id="c"></canvas></body>`);
  return page.evaluate(({ chars, font }) => {
    const ctx = document.getElementById('c').getContext('2d'); ctx.font = `100px ${font}`;
    return Object.fromEntries(chars.map((ch) => [ch, ctx.measureText(ch).width]));
  }, { chars: [...new Set(chars)], font: FONT });
}

/* ------------------------------------------------------------------ the plan sheet */
function drawPlan(part, L, { bare = false } = {}) {
  const { unit: u, lv, res } = part, F = u.frame, W = res.width, D = res.depth;
  const north = part.community === 'north';
  const ub = wrect(F, { x0: 0, z0: 0, x1: W, z1: D });
  const cp = lv.corePlan, CF = cp.frame;
  const coreW = wrect(CF, cp.core);
  let view = north ? (bare ? grow(ub, 1.5) : grow(union(ub, coreW), 2.0)) : grow(ub, bare ? 2.0 : 3.0);
  let S = S0;
  const pad = bare ? 8 : PAD;
  if (!bare) {
    const need = (SHEET_W - 2 * pad) / S0, vw = view.x1 - view.x0;
    if (vw < need) { const e = (need - vw) / 2; view = { ...view, x0: view.x0 - e, x1: view.x1 + e }; } else S = (SHEET_W - 2 * pad) / vw;
  }
  const titleH = bare ? pad : 84, drawW = (view.x1 - view.x0) * S, drawH = (view.z1 - view.z0) * S;
  const footH = bare ? pad : 92;
  const svgW = bare ? Math.round(drawW + 2 * pad) : SHEET_W, svgH = Math.round(titleH + drawH + footH);
  const X = (x) => pad + (x - view.x0) * S, Y = (z) => titleH + (z - view.z0) * S;
  const P = (w) => [X(w[0]), Y(w[1])];
  const pxRect = (r) => ({ x0: X(r.x0), y0: Y(r.z0), x1: X(r.x1), y1: Y(r.z1) });
  const rectEl = (r, attrs) => `<rect x="${n2(X(r.x0))}" y="${n2(Y(r.z0))}" width="${n2((r.x1 - r.x0) * S)}" height="${n2((r.z1 - r.z0) * S)}" ${attrs}/>`;
  const line = (a, b, attrs) => `<line x1="${n2(a[0])}" y1="${n2(a[1])}" x2="${n2(b[0])}" y2="${n2(b[1])}" ${attrs}/>`;
  const ctx = [], fills = [], deco = [], walls = [], doorsEl = [], labels = [], over = [];
  const lbl = (x, y, text, fs, attrs = '') => `<text x="${n2(x)}" y="${n2(y)}" font-size="${fs}" text-anchor="middle" ${attrs}>${esc(text)}</text>`;
  const halo = `paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"`;
  // Context labels go to the first free spot of their rect (centre, then quarters), clear of the reserved boxes.
  const reserved = [];
  const ctxLabel = (r, text, fs = 11, col = COL.ctxText) => {
    if (bare) return;
    const q = pxRect(r), t = tw(text, fs);
    const x0 = Math.max(q.x0, pad), x1 = Math.min(q.x1, pad + drawW), y0 = Math.max(q.y0, titleH), y1 = Math.min(q.y1, titleH + drawH);
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const tries = [];
    if (t + 8 <= w && h >= fs + 6) for (const k of [0.5, 0.22, 0.78]) tries.push({ rot: false, cx: (x0 + x1) / 2, cy: y0 + h * k, bw: t, bh: fs });
    if (t + 8 <= h && w >= fs + 6) for (const k of [0.5, 0.25, 0.75]) tries.push({ rot: true, cx: x0 + w * k, cy: (y0 + y1) / 2, bw: fs, bh: t });
    for (const c of tries) {
      const b = { x0: c.cx - c.bw / 2, y0: c.cy - c.bh / 2, x1: c.cx + c.bw / 2, y1: c.cy + c.bh / 2 };
      if (b.x0 < x0 + 2 || b.x1 > x1 - 2 || b.y0 < y0 + 2 || b.y1 > y1 - 2 || reserved.some((rr) => boxesOverlap(rr, b, -3))) continue;
      reserved.push(b);
      ctx.push(lbl(c.cx, c.cy + fs * 0.36, text, fs, `fill="${col}"${c.rot ? ` transform="rotate(-90 ${n2(c.cx)} ${n2(c.cy)})"` : ''}`));
      return;
    }
  };
  // The entry arrow and its 入户门 tag are placed first; context labels keep clear of them.
  const ent = res.entryDoor;
  let entryTag = null;
  if (ent) {
    const o = P(wpt(F, [ent.at, -1.0])), i = P(wpt(F, [ent.at, -0.25])), fs = 13, t = tw('入户门', fs);
    const horiz = Math.abs(o[0] - i[0]) > Math.abs(o[1] - i[1]);
    const cx = horiz ? o[0] + (o[0] - i[0]) * 0.25 : o[0], cy = horiz ? o[1] - 13 : o[1] + (o[1] < i[1] ? -13 : 15);
    entryTag = { o, i, cx, cy, fs };
    reserved.push({ x0: Math.min(o[0], i[0]) - 5, y0: Math.min(o[1], i[1]) - 5, x1: Math.max(o[0], i[0]) + 5, y1: Math.max(o[1], i[1]) + 5 });
    if (!bare) reserved.push({ x0: cx - t / 2 - 2, y0: cy - fs / 2 - 2, x1: cx + t / 2 + 2, y1: cy + fs / 2 + 2 });
  }

  /* ---- context: slab, neighbours, core, corridor ---- */
  const bld = L.buildings.find((b) => b.id === part.tower);
  ctx.push(`<polygon points="${(lv.outline || bld.outline).map((w) => P(w).map(n2).join(',')).join(' ')}" fill="${COL.ctxFill}" stroke="${COL.ctx}" stroke-width="1"/>`);
  for (const o of lv.units) {
    if (o === u) continue;
    const r = wrect(o.frame, { x0: 0, z0: 0, x1: o.residence.width, z1: o.residence.depth });
    ctx.push(rectEl(r, `fill="#f1efea" stroke="${COL.ctx}" stroke-width="1.2"`));
    for (const q of o.residence.rooms) ctx.push(rectEl(wrect(o.frame, q.rect), `fill="none" stroke="#dedad2" stroke-width="0.8"`));
    const code = o.code.split('-')[1], m = /^(\d{2})(\d{2})([A-Z])$/.exec(code);
    const tag = part.community === 'west' ? `邻户 ${o.id.split('-').at(-1)}`
      : `邻户 ${m ? `${+m[1]}–${+m[2]}${m[3]}` : code}${o.residence.level === 'upper' ? ' 上层' : o.residence.level === 'lower' ? ' 下层' : ''}`;
    ctxLabel(r, tag, 12);
  }
  if (cp.corridor) { ctx.push(rectEl(wrect(CF, cp.corridor), `fill="#faf9f6" stroke="none"`)); }
  ctx.push(rectEl(coreW, `fill="#e9e7e2" stroke="#bdb8ae" stroke-width="1"`));
  for (const s of cp.stairs) {
    const r = wrect(CF, s.rect);
    ctx.push(rectEl(r, `fill="url(#hatchCore)" stroke="#bdb8ae" stroke-width="1"`));
    ctxLabel(r, north ? `疏散楼梯 ${s.id.split('-').at(-1)}` : `楼梯 ${s.id.split('-').at(-1)}`, 11);
  }
  for (const l of cp.landings || []) {
    const r = wrect(CF, l.rect);
    ctx.push(rectEl(r, `fill="${l.open ? '#f6f4ef' : '#dcd8d0'}" stroke="#bdb8ae" stroke-width="1"`));
    const k = l.id.split('-').at(-1);
    ctxLabel(r, north ? (l.open ? (k === 'lobby' ? '消防前室' : `${k} 户电梯厅`) : '本层不停') : '电梯厅', 10.5);
  }
  for (const s of cp.service || []) for (const [i, rr] of s.rects.entries()) { const r = wrect(CF, rr); ctx.push(rectEl(r, `fill="#e2dfd8" stroke="#bdb8ae" stroke-width="1"`)); if (i === 0) ctxLabel(r, s.name, 10); }
  for (const e of cp.lifts) {
    const r = wrect(CF, e.rect), q = pxRect(r);
    ctx.push(rectEl(r, `fill="#dad6ce" stroke="#a9a397" stroke-width="1"`), line([q.x0, q.y0], [q.x1, q.y1], `stroke="#b9b3a7" stroke-width="0.8"`), line([q.x1, q.y0], [q.x0, q.y1], `stroke="#b9b3a7" stroke-width="0.8"`));
    const k = e.id.split('-').at(-1);
    ctxLabel(r, north ? `${k} ${e.role === 'fire' ? '消防梯' : '住户梯'}` : e.role === 'fire' ? '消防梯' : `客梯 ${k.slice(1)}`, 10.5, '#6f695f');
  }
  if (cp.corridor) {
    // Corridor label, clear of the entry door.
    const cr = wrect(CF, cp.corridor), ent = res.entryDoor ? wpt(F, [res.entryDoor.at, 0]) : null;
    const span = { x0: Math.max(cr.x0, view.x0), x1: Math.min(cr.x1, view.x1) };
    const cx = ent ? (ent[0] - span.x0 > span.x1 - ent[0] ? (span.x0 + ent[0]) / 2 - 1 : (ent[0] + span.x1) / 2 + 1) : (span.x0 + span.x1) / 2;
    if (!bare) ctx.push(lbl(X(cx), Y((cr.z0 + cr.z1) / 2) + 4, '公共走廊', 11.5, `fill="${COL.ctxText}"`));
  }

  /* ---- rooms ---- */
  const cats = new Set();
  for (const q of res.rooms) {
    const r = wrect(F, q.rect), c = CAT_OF[q.kind] || CATS[7];
    cats.add(c.key);
    if (q.kind === 'void') {
      const p = pxRect(r);
      fills.push(rectEl(r, `fill="#ffffff"`));
      deco.push(`<rect x="${n2(p.x0 + 3)}" y="${n2(p.y0 + 3)}" width="${n2(p.x1 - p.x0 - 6)}" height="${n2(p.y1 - p.y0 - 6)}" fill="none" stroke="#8a8a8a" stroke-width="1.3" stroke-dasharray="7 5"/>`,
        line([p.x0 + 3, p.y0 + 3], [p.x1 - 3, p.y1 - 3], `stroke="#b4b4b4" stroke-width="1" stroke-dasharray="5 5"`), line([p.x1 - 3, p.y0 + 3], [p.x0 + 3, p.y1 - 3], `stroke="#b4b4b4" stroke-width="1" stroke-dasharray="5 5"`));
    } else fills.push(rectEl(r, `fill="${c.fill}"`));
  }

  /* ---- beds (as the renderer places them) ---- */
  const bedPx = [];
  for (const b of res.beds || []) {
    const r = wrect(F, { x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2 }), q = pxRect(r);
    bedPx.push({ ...q, room: b.room });
    const hs = worldSide(F, b.head), wide = hs === 'N' || hs === 'S' ? q.x1 - q.x0 : q.y1 - q.y0;
    const nP = wide >= 1.4 * S ? 2 : 1, pw = Math.min(0.62 * S, wide / nP - 0.12 * S), pd = 0.36 * S;
    deco.push(`<rect x="${n2(q.x0)}" y="${n2(q.y0)}" width="${n2(q.x1 - q.x0)}" height="${n2(q.y1 - q.y0)}" rx="2" fill="#fffdf9" stroke="#b3a691" stroke-width="1"/>`);
    for (let k = 0; k < nP; k++) {
      const t = (k + 0.5) / nP;
      let px, py, w, h;
      if (hs === 'N' || hs === 'S') { w = pw; h = pd; px = q.x0 + (q.x1 - q.x0) * t - w / 2; py = hs === 'N' ? q.y0 + 0.08 * S : q.y1 - 0.08 * S - h; }
      else { w = pd; h = pw; py = q.y0 + (q.y1 - q.y0) * t - h / 2; px = hs === 'W' ? q.x0 + 0.08 * S : q.x1 - 0.08 * S - w; }
      deco.push(`<rect x="${n2(px)}" y="${n2(py)}" width="${n2(w)}" height="${n2(h)}" rx="2" fill="#f4efe6" stroke="#c3b8a5" stroke-width="0.8"/>`);
    }
    const fold = 0.62 * S;
    if (hs === 'N') deco.push(line([q.x0, q.y0 + fold], [q.x1, q.y0 + fold], `stroke="#c3b8a5" stroke-width="0.8"`));
    if (hs === 'S') deco.push(line([q.x0, q.y1 - fold], [q.x1, q.y1 - fold], `stroke="#c3b8a5" stroke-width="0.8"`));
    if (hs === 'W') deco.push(line([q.x0 + fold, q.y0], [q.x0 + fold, q.y1], `stroke="#c3b8a5" stroke-width="0.8"`));
    if (hs === 'E') deco.push(line([q.x1 - fold, q.y0], [q.x1 - fold, q.y1], `stroke="#c3b8a5" stroke-width="0.8"`));
  }

  /* ---- home stair: treads, landing, arrow ---- */
  const st = res.homeStair;
  if (st) {
    const upper = st.role === 'upper';
    const lp = pxRect(wrect(F, st.landing));
    deco.push(`<rect x="${n2(lp.x0)}" y="${n2(lp.y0)}" width="${n2(lp.x1 - lp.x0)}" height="${n2(lp.y1 - lp.y0)}" fill="#ffffff" fill-opacity="0.75" stroke="#7d756a" stroke-width="1"/>`);
    for (const fl of st.flights) {
      const [bx, bz] = fl.bottom, [tx, tz] = fl.top, alongZ = Math.abs(tz - bz) > 0.01, hw = fl.width / 2;
      const fr = alongZ ? { x0: fl.x - hw, z0: Math.min(bz, tz), x1: fl.x + hw, z1: Math.max(bz, tz) } : { x0: Math.min(bx, tx), z0: bz - hw, x1: Math.max(bx, tx), z1: bz + hw };
      const q = pxRect(wrect(F, fr));
      deco.push(`<rect x="${n2(q.x0)}" y="${n2(q.y0)}" width="${n2(q.x1 - q.x0)}" height="${n2(q.y1 - q.y0)}" fill="#ffffff" fill-opacity="${upper ? 0.55 : 0.8}" stroke="#7d756a" stroke-width="1"/>`);
      for (let i = 1; i < fl.steps; i++) {
        const t = i / fl.steps, px = bx + (tx - bx) * t, pz = bz + (tz - bz) * t;
        const a = alongZ ? [fl.x - hw, pz] : [px, bz - hw], b = alongZ ? [fl.x + hw, pz] : [px, bz + hw];
        deco.push(line(P(wpt(F, a)), P(wpt(F, b)), `stroke="#8f877b" stroke-width="0.8"${upper ? ' stroke-dasharray="3 2"' : ''}`));
      }
    }
    // Walking line: up flight A → landing → flight B (lower); down from flight B's head (upper).
    const [A, B] = st.flights;
    const pts = upper ? [B.top, B.bottom, A.top, A.bottom] : [A.bottom, A.top, B.bottom, B.top];
    const ptsW = pts.map((p) => P(wpt(F, p)));
    const ins = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    const path = [ins(ptsW[0], ptsW[1], 0.04), ptsW[1], ptsW[2], ins(ptsW[3], ptsW[2], upper ? 0.5 : 0.06)];
    deco.push(`<polyline points="${path.map((p) => p.map(n2).join(',')).join(' ')}" fill="none" stroke="#5c554b" stroke-width="1.4" marker-end="url(#arrow)"/>`,
      `<circle cx="${n2(path[0][0])}" cy="${n2(path[0][1])}" r="2.6" fill="#5c554b"/>`);
    // 上 / 下 just outside the walking line's start, back along it (in the room the stair is entered from).
    const dl = Math.hypot(ptsW[1][0] - ptsW[0][0], ptsW[1][1] - ptsW[0][1]) || 1, ux = (ptsW[1][0] - ptsW[0][0]) / dl, uy = (ptsW[1][1] - ptsW[0][1]) / dl;
    if (!bare) labels.push({ svg: lbl(path[0][0] - ux * 13, path[0][1] - uy * 13 + 4.3, upper ? '下' : '上', 12, `font-weight="700" fill="#5c554b" ${halo}`) });
  }

  /* ---- walls ---- */
  // Solid pieces of the local segment a→b (gaps = local [s0,s1] spans), as world rects.
  const pieces = (a, b, t, gaps, fill, extend = true) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.02) return;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    let ivs = [[0, len]];
    for (const [g0, g1] of gaps) ivs = ivs.flatMap(([s0, s1]) => [[s0, Math.min(s1, g0)], [Math.max(s0, g1), s1]]).filter(([s0, s1]) => s1 - s0 > 0.005);
    for (let [s0, s1] of ivs) {
      if (extend && s0 < 1e-6) s0 -= t / 2;
      if (extend && s1 > len - 1e-6) s1 += t / 2;
      const p0 = wpt(F, [a[0] + dx * s0, a[1] + dz * s0]), p1 = wpt(F, [a[0] + dx * s1, a[1] + dz * s1]);
      const horiz = Math.abs(p0[1] - p1[1]) < 1e-6;
      const r = horiz ? { x0: Math.min(p0[0], p1[0]), z0: p0[1] - t / 2, x1: Math.max(p0[0], p1[0]), z1: p0[1] + t / 2 }
        : { x0: p0[0] - t / 2, z0: Math.min(p0[1], p1[1]), x1: p0[0] + t / 2, z1: Math.max(p0[1], p1[1]) };
      walls.push(rectEl(r, `fill="${fill}"`));
    }
  };
  // A thin band along a→b between s0 and s1, offset o (m) to the (dz,−dx) side, as a px polygon.
  const band = (a, b, s0, s1, t, o = 0) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, nx = dz, nz = -dx;
    const at = (s, k) => P(wpt(F, [a[0] + dx * s + nx * (o + k), a[1] + dz * s + nz * (o + k)]));
    return [at(s0, -t / 2), at(s1, -t / 2), at(s1, t / 2), at(s0, t / 2)];
  };
  const poly = (pts, attrs) => `<polygon points="${pts.map((p) => p.map(n2).join(',')).join(' ')}" ${attrs}/>`;
  const segAt = (a, b, s) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); return [a[0] + (b[0] - a[0]) * s / len, a[1] + (b[1] - a[1]) * s / len]; };

  // Partitions (thin).
  for (const p of res.partitions) {
    const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
    if (p.role === 'railing') { walls.push(poly(band(p.a, p.b, 0, len, 0.07), `fill="#ffffff" stroke="${COL.rail}" stroke-width="1.2"`)); continue; }
    if (p.role === 'balcony-slider') {
      walls.push(poly(band(p.a, p.b, 0, len, 0.09), `fill="${COL.glassFill}" stroke="${COL.glass}" stroke-width="1"`));
      if (p.door) {
        const s0 = Math.max(0, p.door.at - p.door.width / 2), s1 = Math.min(len, p.door.at + p.door.width / 2), m = (s0 + s1) / 2;
        walls.push(poly(band(p.a, p.b, s0, m + 0.1, 0.035, -0.025), `fill="${COL.glass}"`), poly(band(p.a, p.b, m - 0.1, s1, 0.035, 0.025), `fill="${COL.glass}"`));
      }
      continue;
    }
    const gaps = p.door ? [[Math.max(0, p.door.at - p.door.width / 2), Math.min(len, p.door.at + p.door.width / 2)]] : [];
    pieces(p.a, p.b, T_PART, gaps, COL.part);
    if (p.door && p.role === 'opening') {
      const [g0, g1] = gaps[0];
      walls.push(line(P(wpt(F, segAt(p.a, p.b, g0))), P(wpt(F, segAt(p.a, p.b, g1))), `stroke="#8d877c" stroke-width="1" stroke-dasharray="4 3"`));
    }
  }
  // Door leaves and swings, where the renderer stands them.
  for (const Lf of doorLeaves(res)) {
    const h = P(wpt(F, Lf.hinge)), t = P(wpt(F, Lf.tip)), c = P(wpt(F, Lf.close)), r = Lf.w * S;
    const cross = (t[0] - h[0]) * (c[1] - h[1]) - (t[1] - h[1]) * (c[0] - h[0]);
    doorsEl.push(`<path d="M${n2(t[0])},${n2(t[1])} A${n2(r)},${n2(r)} 0 0 ${cross > 0 ? 1 : 0} ${n2(c[0])},${n2(c[1])}" fill="none" stroke="${COL.arc}" stroke-width="0.9"/>`,
      poly(band(Lf.hinge, Lf.tip, 0, Lf.w, 0.05), `fill="${COL.door}"`));
  }
  // Party / front walls (thick) and the entry door.
  const ext = new Set(res.exteriorSides || []), facade = new Map((res.facadeWalls || []).map((f) => [f.side, f]));
  const sides = { N: [[0, 0], [W, 0]], E: [[W, 0], [W, D]], S: [[0, D], [W, D]], W: [[0, 0], [0, D]] };
  for (const [side, [a, b]] of Object.entries(sides)) {
    if (ext.has(side) && facade.has(side)) continue;
    const gaps = side === 'N' && ent ? [[ent.at - ent.width / 2, ent.at + ent.width / 2]] : [];
    pieces(a, b, ext.has(side) ? T_EXT : T_PARTY, gaps, ext.has(side) ? COL.ext : COL.party);
  }
  // Exterior walls with windows and railings.
  for (const fw of res.facadeWalls || []) {
    const len = Math.hypot(fw.b[0] - fw.a[0], fw.b[1] - fw.a[1]);
    const ops = fw.openings.map((o) => ({ ...o, s0: Math.max(0, o.at - o.width / 2), s1: Math.min(len, o.at + o.width / 2) })).filter((o) => o.s1 - o.s0 > 0.05);
    pieces(fw.a, fw.b, T_EXT, ops.map((o) => [o.s0, o.s1]), COL.ext);
    for (const o of ops) {
      if (o.type === 'railing') {
        walls.push(poly(band(fw.a, fw.b, o.s0, o.s1, 0.08), `fill="#ffffff" stroke="${COL.rail}" stroke-width="1.3"`));
        continue;
      }
      const ftc = o.style === 'floor-to-ceiling';
      walls.push(poly(band(fw.a, fw.b, o.s0, o.s1, T_EXT), `fill="${ftc ? COL.glassFill : '#ffffff'}" stroke="${COL.ext}" stroke-width="0.8"`));
      for (const k of ftc ? [-0.06, 0, 0.06] : [-0.045, 0.045]) {
        const q = band(fw.a, fw.b, o.s0, o.s1, 0, k);
        walls.push(line(q[0], q[1], `stroke="${o.frosted ? '#9aa9b4' : COL.glass}" stroke-width="${ftc ? 1.1 : 1.2}"`));
      }
    }
  }
  if (ent) {
    const d0 = ent.at - ent.width / 2;
    const h = P(wpt(F, [d0 + 0.05, 0.02])), t = P(wpt(F, [d0 + 0.05, 0.94])), c = P(wpt(F, [d0 + 0.97, 0.02])), r = 0.92 * S;
    const cross = (t[0] - h[0]) * (c[1] - h[1]) - (t[1] - h[1]) * (c[0] - h[0]);
    doorsEl.push(`<path d="M${n2(t[0])},${n2(t[1])} A${n2(r)},${n2(r)} 0 0 ${cross > 0 ? 1 : 0} ${n2(c[0])},${n2(c[1])}" fill="${COL.entry}" fill-opacity="0.08" stroke="${COL.entry}" stroke-width="1.2"/>`,
      poly(band([d0 + 0.05, 0.02], [d0 + 0.05, 0.94], 0, 0.92, 0.06), `fill="${COL.entry}"`));
    // Arrow from the corridor/core side into the home, and the 入户门 tag.
    const { o, i, cx, cy, fs } = entryTag;
    doorsEl.push(`<line x1="${n2(o[0])}" y1="${n2(o[1])}" x2="${n2(i[0])}" y2="${n2(i[1])}" stroke="${COL.entry}" stroke-width="2" marker-end="url(#arrowRed)"/>`);
    if (!bare) labels.push({ svg: lbl(cx, cy + fs * 0.36, '入户门', fs, `font-weight="700" fill="${COL.entry}" ${halo}`) });
  }

  /* ---- room labels ---- */
  const leaders = [];
  for (const g of labelGroups(res)) {
    const q = g.host, r = wrect(F, q.rect), box = pxRect(r), inset = 0.07 * S + 2;
    const avail = { x0: box.x0 + inset, y0: box.y0 + inset, x1: box.x1 - inset, y1: box.y1 - inset };
    const name = q.name, area = `${f1(g.area)} ㎡`;
    const beds = bedPx.filter((b) => boxesOverlap(b, avail));
    const fit = fitLabel(avail, name, area, beds, bare);
    if (fit) {
      labels.push({ room: q.id, box: avail, svg: labelSvg(fit, name, area, bare, q.kind === 'void' || q.kind === 'stair' ? '#555' : '#2f2b26') });
    } else if (!bare) leaders.push({ q, r, box, name, area });
    else over.push({ room: q.id, name: q.name, reason: 'thumbnail: omitted' });
  }
  // Leader labels: just outside the nearest exterior wall.
  const used = [];
  for (const ld of leaders) {
    const cx = (ld.box.x0 + ld.box.x1) / 2, cy = (ld.box.y0 + ld.box.y1) / 2, ub2 = pxRect(ub);
    const extW = [...ext].map((s) => worldSide(F, s));
    const cand = (extW.length ? extW : ['N', 'S', 'E', 'W']).map((s) => ({ s, d: s === 'N' ? cy - ub2.y0 : s === 'S' ? ub2.y1 - cy : s === 'W' ? cx - ub2.x0 : ub2.x1 - cx })).sort((a, b) => a.d - b.d);
    const s = cand[0].s, fs = 11, text = `${ld.name} ${ld.area}`, w = tw(text, fs) + 6, h = fs + 6;
    let lx = s === 'W' ? ub2.x0 - 0.9 * S - w : s === 'E' ? ub2.x1 + 0.9 * S : cx - w / 2;
    let ly = s === 'N' ? ub2.y0 - 0.9 * S - h : s === 'S' ? ub2.y1 + 0.9 * S : cy - h / 2;
    for (let k = 0; k < 20 && used.some((b) => boxesOverlap(b, { x0: lx, y0: ly, x1: lx + w, y1: ly + h }, -2)); k++) { if (s === 'N' || s === 'S') lx += w + 6; else ly += h + 4; }
    const b = { x0: lx, y0: ly, x1: lx + w, y1: ly + h }; used.push(b);
    const ax = s === 'W' ? b.x1 : s === 'E' ? b.x0 : (b.x0 + b.x1) / 2, ay = s === 'N' ? b.y1 : s === 'S' ? b.y0 : (b.y0 + b.y1) / 2;
    labels.push({ leader: ld.q.id, box: b, svg: `<g class="leader"><polyline points="${n2(cx)},${n2(cy)} ${n2(ax)},${n2(ay)}" fill="none" stroke="#6d665c" stroke-width="0.9"/><circle cx="${n2(cx)}" cy="${n2(cy)}" r="2.2" fill="#6d665c"/>`
      + `<rect x="${n2(b.x0)}" y="${n2(b.y0)}" width="${n2(w)}" height="${n2(h)}" rx="3" fill="#ffffff" stroke="#b8b1a5" stroke-width="0.8"/>`
      + lbl((b.x0 + b.x1) / 2, b.y0 + h / 2 + fs * 0.36, text, fs, 'fill="#2f2b26"') + '</g>' });
    over.push({ room: ld.q.id, name: ld.name, reason: 'leader line (does not fit inside at 9 px)' });
  }

  /* ---- sheet chrome ---- */
  const T = titles(part);
  const defs = `<defs>
    <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#f4f1ea"/><line x1="0" y1="0" x2="0" y2="7" stroke="#c8bfb0" stroke-width="1.4"/></pattern>
    <pattern id="hatchCore" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#eceae5"/><line x1="0" y1="0" x2="0" y2="6" stroke="#d3cfc6" stroke-width="1"/></pattern>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5c554b"/></marker>
    <marker id="arrowRed" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${COL.entry}"/></marker>
    <clipPath id="view"><rect x="${pad}" y="${titleH}" width="${n2(drawW)}" height="${n2(drawH)}"/></clipPath>
  </defs>`;
  const chrome = [];
  if (!bare) {
    chrome.push(`<text x="${pad}" y="36" font-size="22" font-weight="700" fill="#1f1d1a">${esc(T.title)}</text>`,
      `<text x="${pad}" y="62" font-size="13" fill="#5e5850">${esc(T.sub)}</text>`);
    // North arrow (world north is up).
    const nx = SHEET_W - pad - 22, ny = 40;
    chrome.push(`<g><circle cx="${nx}" cy="${ny}" r="20" fill="#ffffff" stroke="#3a3632" stroke-width="1.2"/><path d="M${nx},${ny - 17} L${nx + 7},${ny + 8} L${nx},${ny + 3} L${nx - 7},${ny + 8} z" fill="#3a3632"/>`
      + `<text x="${nx}" y="${ny - 24}" font-size="12" font-weight="700" text-anchor="middle" fill="#3a3632">北 N</text></g>`);
    // Scale bar: 5 m.
    const sx = pad, sy = titleH + drawH + 26;
    for (let i = 0; i < 5; i++) chrome.push(`<rect x="${n2(sx + i * S)}" y="${sy}" width="${n2(S)}" height="7" fill="${i % 2 ? '#ffffff' : '#3a3632'}" stroke="#3a3632" stroke-width="1"/>`);
    for (let i = 0; i <= 5; i++) chrome.push(`<text x="${n2(sx + i * S)}" y="${sy + 21}" font-size="11" text-anchor="middle" fill="#3a3632">${i}${i === 5 ? ' m' : ''}</text>`);
    chrome.push(`<text x="${sx}" y="${sy - 7}" font-size="11" fill="#5e5850">比例尺</text>`);
    // Legend.
    let lx = sx + 5 * S + 40;
    const legend = CATS.filter((c) => cats.has(c.key));
    for (const c of legend) {
      const w = tw(c.label, 11.5) + 30;
      if (lx + w > SHEET_W - pad) break;
      chrome.push(`<rect x="${n2(lx)}" y="${sy - 4}" width="16" height="12" fill="${c.fill}" stroke="${c.key === 'void' ? '#8a8a8a' : '#a39d92'}" stroke-width="0.8"${c.key === 'void' ? ' stroke-dasharray="3 2"' : ''}/>`,
        `<text x="${n2(lx + 21)}" y="${sy + 7}" font-size="11.5" fill="#3a3632">${esc(c.label)}</text>`);
      lx += w;
    }
    const sy2 = sy + 44;
    chrome.push(`<text x="${pad}" y="${sy2}" font-size="11" fill="#7b756b">上北下南、左西右东（世界坐标，与俯视图同向）· 门扇按场景中的位置画成 90° 开启 · 浅灰为核心筒、走廊与邻户 · 数据：COMMUNITY_PLANS / buildLayout({ expansion: true })</text>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" font-family="${esc(FONT)}">
  ${defs}
  <rect width="${svgW}" height="${svgH}" fill="#ffffff"/>
  <g clip-path="url(#view)">
    <rect x="${pad}" y="${titleH}" width="${n2(drawW)}" height="${n2(drawH)}" fill="#ffffff"/>
    <g id="context">${ctx.join('')}</g>
    <g id="rooms">${fills.join('')}</g>
    <g id="deco">${deco.join('')}</g>
    <g id="walls">${walls.join('')}</g>
    <g id="doors">${doorsEl.join('')}</g>
    <g id="labels">${labels.map((l) => l.room ? `<g class="room-label" data-room="${l.room}" data-box="${[l.box.x0, l.box.y0, l.box.x1, l.box.y1].map(n2).join(' ')}">${l.svg}</g>`
      : l.leader ? `<g class="leader-label" data-room="${l.leader}" data-box="${[l.box.x0, l.box.y0, l.box.x1, l.box.y1].map(n2).join(' ')}">${l.svg}</g>` : l.svg).join('')}</g>
  </g>
  ${bare ? '' : `<rect x="${pad}" y="${titleH}" width="${n2(drawW)}" height="${n2(drawH)}" fill="none" stroke="#d6d2ca" stroke-width="1"/>`}
  ${chrome.join('')}
</svg>`;
  return { svg, width: svgW, height: svgH, title: T, labelsOver: over, viewPx: { x0: pad, y0: titleH, x1: pad + drawW, y1: titleH + drawH } };
}

/** Largest label that fits a room (px box), horizontal preferred; null when even 9 px fails. */
function fitLabel(box, name, area, beds, bare) {
  const maxFs = bare ? 26 : 15, minFs = bare ? 13 : 9;
  const W = box.x1 - box.x0, H = box.y1 - box.y0;
  if (W <= 0 || H <= 0) return null;
  const strips = [];
  for (const b of beds) {
    strips.push({ x0: box.x0, y0: box.y0, x1: Math.min(box.x1, b.x0), y1: box.y1 }, { x0: Math.max(box.x0, b.x1), y0: box.y0, x1: box.x1, y1: box.y1 },
      { x0: box.x0, y0: box.y0, x1: box.x1, y1: Math.min(box.y1, b.y0) }, { x0: box.x0, y0: Math.max(box.y0, b.y1), x1: box.x1, y1: box.y1 });
  }
  const regions = [box, ...strips.filter((r) => r.x1 - r.x0 > 8 && r.y1 - r.y0 > 8).sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))];
  const dims = (fs) => {
    const fs2 = bare ? 0 : Math.max(8, Math.round(fs * 0.82));
    return { fs, fs2, w: Math.max(tw(name, fs), bare ? 0 : tw(area, fs2)), h: bare ? fs * 1.2 : fs * 1.18 + fs2 * 1.18 };
  };
  const tryFit = (avoid) => {
    let best = null;
    for (let fs = maxFs; fs >= minFs; fs--) {
      const d = dims(fs);
      for (const rot of [false, true]) {
        const [w, h] = rot ? [d.h, d.w] : [d.w, d.h];
        for (const r of avoid ? regions : [box]) {
          if (r.x1 - r.x0 < w || r.y1 - r.y0 < h) continue;
          const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, rect = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
          if (avoid && beds.some((b) => boxesOverlap(b, rect, 0.5))) continue;
          const score = fs - (rot ? 3 : 0);
          if (!best || score > best.score) best = { ...d, rot, cx, cy, rect, score };
          break;
        }
      }
      if (best && best.score >= fs) break;
    }
    return best;
  };
  return tryFit(true) || tryFit(false);
}
function labelSvg(f, name, area, bare, color) {
  const halo = `paint-order="stroke" stroke="#ffffff" stroke-opacity="0.85" stroke-width="3" stroke-linejoin="round"`;
  const tr = f.rot ? ` transform="rotate(-90 ${n2(f.cx)} ${n2(f.cy)})"` : '';
  if (bare) return `<text x="${n2(f.cx)}" y="${n2(f.cy + f.fs * 0.36)}" font-size="${f.fs}" text-anchor="middle" fill="${color}" ${halo}${tr}>${esc(name)}</text>`;
  const top = f.cy - f.h / 2;
  return `<g${tr}><text x="${n2(f.cx)}" y="${n2(top + f.fs * 0.9)}" font-size="${f.fs}" font-weight="700" text-anchor="middle" fill="${color}" ${halo}>${esc(name)}</text>`
    + `<text x="${n2(f.cx)}" y="${n2(top + f.fs * 1.18 + f.fs2 * 0.9)}" font-size="${f.fs2}" text-anchor="middle" fill="#5e5850" ${halo}>${esc(area)}</text></g>`;
}

/* ------------------------------------------------------------------ section charts */
function northSection(L) {
  const T = COMMUNITY_PLANS.north.T1, stops = northStops('T1');
  const p1 = L.levels.filter((l) => l.building === 'P1' && /^P1-(B2|B1|B1M|\dF|RF)$/.test(l.id)).sort((a, b) => a.elev - b.elev);
  const tl = NORTH_SITE.levels;
  const Wd = 2200, Hd = 1560, E = 11.2, base = 1300;           // px per metre, y of ±0.00
  const y = (e) => base - e * E;
  const o = [], t = (x, yy, s, fs = 14, a = '') => o.push(`<text x="${n2(x)}" y="${n2(yy)}" font-size="${fs}" ${a}>${esc(s)}</text>`);
  const rect = (x0, e0, x1, e1, a) => o.push(`<rect x="${n2(x0)}" y="${n2(y(e1))}" width="${n2(x1 - x0)}" height="${n2(y(e0) - y(e1))}" ${a}/>`);
  t(60, 52, '云澜·北苑 1 号楼 剖面楼层图（真实标高比例）', 30, 'font-weight="700" fill="#1f1d1a"');
  t(60, 86, '2 号楼的楼层、标高与电梯停靠与 1 号楼相同。塔楼立在一期商场（P1）屋面上：商场 1F–6F 在 0–34 m，住宅从 7F 接着往上编号。', 16, 'fill="#4a453e"');
  // Elevation axis.
  const ax = 92;
  o.push(`<line x1="${ax}" y1="${y(-12)}" x2="${ax}" y2="${y(101)}" stroke="#8d877c" stroke-width="1.2"/>`);
  for (let e = -10; e <= 100; e += 5) {
    o.push(`<line x1="${ax - (e % 10 ? 4 : 8)}" y1="${y(e)}" x2="${ax}" y2="${y(e)}" stroke="#8d877c" stroke-width="1"/>`);
    if (e % 10 === 0) t(ax - 12, y(e) + 5, `${e} m`, 12.5, 'text-anchor="end" fill="#6d675e"');
  }
  // Ground.
  const rx = 1050;
  o.push(`<rect x="${ax + 10}" y="${y(0)}" width="${rx + 70 - ax - 10}" height="${n2(12 * E)}" fill="#efe9de"/>`, `<line x1="${ax + 10}" y1="${y(0)}" x2="${rx + 70}" y2="${y(0)}" stroke="#6b5f4f" stroke-width="2.5"/>`);
  t(rx + 76, y(0) + 5, '室外地面 ±0.00', 13, 'fill="#6b5f4f"');
  // Mall P1.
  const mx0 = 150, mx1 = 1010;
  for (const l of p1) {
    if (l.short === 'RF') continue;
    const fill = l.elev < 0 ? '#e4ded3' : '#f3e7d3';
    rect(mx0, l.elev, mx1, l.elev + l.height, `fill="${fill}" stroke="#b9ab94" stroke-width="1"`);
    const label = l.short === 'B1M' ? 'B1M 夹层' : l.short;
    t(mx0 + 12, y(l.elev) - (l.height * E) / 2 + 6, `商场 ${label}`, 15, 'font-weight="700" fill="#6b5a40"');
    t(mx0 + 12 + 112, y(l.elev) - (l.height * E) / 2 + 6, `${f1(l.elev)} m · 层高 ${f1(l.height)} m`, 13, 'fill="#7d6d55"');
  }
  o.push(`<line x1="${mx0 - 10}" y1="${y(34)}" x2="${mx1 + 10}" y2="${y(34)}" stroke="#6b5a40" stroke-width="3"/>`);
  t(mx0 + 12, y(34) - 8, '商场屋面（天台）RF 34.0 m', 15, 'font-weight="700" fill="#6b5a40"');
  t(mx0 + 12, y(-12) + 26, '一期商场 P1（裙房，层高大：1F 6.5 m，2F–6F 各 5.5 m）', 14, 'fill="#6b5a40"');
  // Core with the three lifts, from P1-B2 up to RF (drawn first; the homes sit either side).
  const wx0 = 400, wx1 = 600, cx0 = 600, cx1 = 690, ex0 = 690, ex1 = 890;
  const rf = tl.at(-1), bottom = p1[0].elev, top = rf.elev + 1.2;
  rect(cx0, bottom, cx1, top, `fill="#ebe8e2" stroke="#8d877c" stroke-width="1.2"`);
  rect(cx0, bottom, cx1, 34, `fill="url(#hatchS)" stroke="#8d877c" stroke-width="1.2"`);
  const shafts = [['LW', cx0 + 10], ['LF', cx0 + 38], ['LE', cx0 + 66]];
  const lvElev = (id) => { const p = p1.find((l) => l.id === id); return p ? p.elev : tl.find((q) => q.short === id.split('-').at(-1)).elev; };
  for (const [k, x] of shafts) {
    o.push(`<rect x="${x}" y="${n2(y(top - 0.2))}" width="14" height="${n2((top - 0.2 - bottom) * E)}" fill="#ffffff" stroke="#6d675e" stroke-width="1"/>`);
    t(x + 7, y(bottom) + 16, k, 12, 'text-anchor="middle" font-weight="700" fill="#3a3530"');
    for (const id of stops[k]) o.push(`<circle cx="${x + 7}" cy="${n2(y(lvElev(id) + 1.1))}" r="5" fill="${k === 'LF' ? '#c0392b' : '#2d6a9f'}" stroke="#ffffff" stroke-width="1"/>`);
  }
  t((cx0 + cx1) / 2, y(bottom) + 34, '核心筒', 13, 'text-anchor="middle" font-weight="700" fill="#4a453e"');
  // 7F club, one wing either side of the core.
  const club = tl[0];
  rect(wx0, club.elev, wx1, club.elev + club.height, `fill="#cfeae6" stroke="#5f8f88" stroke-width="1.4"`);
  rect(ex0, club.elev, ex1, club.elev + club.height, `fill="#cfeae6" stroke="#5f8f88" stroke-width="1.4"`);
  t((wx0 + wx1) / 2, y(club.elev + club.height / 2) - 2, '7F 空中会所', 15, 'text-anchor="middle" font-weight="700" fill="#2f5d57"');
  t((wx0 + wx1) / 2, y(club.elev + club.height / 2) + 17, '会客厅 · 阅览室', 12.5, 'text-anchor="middle" fill="#2f5d57"');
  t((ex0 + ex1) / 2, y(club.elev + club.height / 2) - 2, '7F 空中会所', 15, 'text-anchor="middle" font-weight="700" fill="#2f5d57"');
  t((ex0 + ex1) / 2, y(club.elev + club.height / 2) + 17, '私宴厅 · 健身房', 12.5, 'text-anchor="middle" fill="#2f5d57"');
  // Homes.
  const homeFill = { flat: '#d9e7f5', duplex: '#f6e6c6', pent: '#e6ddf1', single: '#dcefcf' };
  for (const h of T.homes) {
    const lv0 = tl.find((d) => d.levelNumber === h.levels[0]), lvN = tl.find((d) => d.levelNumber === h.levels.at(-1));
    const e0 = lv0.elev, e1 = lvN.elev + lvN.height, [x0, x1] = h.side === 'W' ? [wx0, wx1] : [ex0, ex1];
    const kind = h.kind === 'duplex' ? 'duplex' : h.kind === 'penthouse-flat' ? 'pent' : h.levels[0] >= 14 ? 'single' : 'flat';
    rect(x0 + 3, e0 + 0.06, x1 - 3, e1 - 0.06, `fill="${homeFill[kind]}" stroke="#7d7363" stroke-width="1.1" rx="2"`);
    const tag = h.kind === 'duplex' ? `${h.levels[0]}–${h.levels[1]}${h.side}` : h.id.split('-')[1];
    const area = Math.round(h.parts.reduce((sum, q) => sum + q.plan.area, 0));
    if (h.kind === 'duplex') {
      const em = lv0.elev + lv0.height;
      o.push(`<line x1="${x0 + 8}" y1="${y(em)}" x2="${x1 - 8}" y2="${y(em)}" stroke="#a5998a" stroke-width="1" stroke-dasharray="5 4"/>`);
      t((x0 + x1) / 2, y(em + lvN.height / 2) + 5.5, `${tag} ${h.parts[0].plan.label}复式 ${area}㎡`, 13.5, 'text-anchor="middle" font-weight="700" fill="#3a3530"');
      t((x0 + x1) / 2, y(e0 + lv0.height / 2) + 5, `${h.levels[0]}F 下层入户 · ${h.levels[1]}F 上层`, 11.5, 'text-anchor="middle" fill="#6d665c"');
    } else t((x0 + x1) / 2, y(e0 + (e1 - e0) / 2) + 5, `${tag} ${h.parts[0].plan.label}${kind === 'pent' ? ' 顶层' : ''} ${area}㎡`, 13, 'text-anchor="middle" font-weight="700" fill="#3a3530"');
  }
  // Roof garden.
  rect(wx0, rf.elev, wx1, rf.elev + 1.2, `fill="#dcefcf" stroke="#6d8f5c" stroke-width="1.2"`);
  rect(ex0, rf.elev, ex1, rf.elev + 1.2, `fill="#dcefcf" stroke="#6d8f5c" stroke-width="1.2"`);
  for (let x = wx0 + 14; x < ex1 - 10; x += 34) if (x < cx0 - 6 || x > cx1 + 6) o.push(`<circle cx="${x}" cy="${n2(y(rf.elev + 1.9))}" r="7" fill="#9cc58a" stroke="#6d8f5c" stroke-width="1"/>`);
  t((wx0 + ex1) / 2, y(rf.elev + 4.2), 'RF 屋顶花园 96.9 m（住户电梯直达）', 15, 'text-anchor="middle" font-weight="700" fill="#4c6b3e"');
  // Floor labels (right of the tower); 7F–10F in bold.
  for (const d of tl) {
    const lx = ex1 + 14, key = /^(7|8|9|10)F$/.test(d.short);
    o.push(`<line x1="${ex1}" y1="${y(d.elev)}" x2="${lx + 4}" y2="${y(d.elev)}" stroke="#b5ad9f" stroke-width="1"/>`);
    t(lx + 8, y(d.elev) - (d.short === 'RF' ? 3 : d.height * E / 2 - 5), `${d.short}  ${f1(d.elev)} m`, key ? 14 : 13, `fill="${key ? '#8a4f0b' : '#3a3530'}"${key ? ' font-weight="700"' : ''}`);
  }
  // "7F–10F are here" bracket, left of the tower above the mall roof.
  const e10 = tl.find((d) => d.levelNumber === 10), top10 = e10.elev + e10.height;
  o.push(`<path d="M${wx0 - 8},${y(34) - 2} h-12 V${y(top10)} h12" fill="none" stroke="#d08a2a" stroke-width="2.5"/>`);
  o.push(`<rect x="${mx0 + 8}" y="${n2(y((34 + top10) / 2) - 34)}" width="214" height="68" rx="8" fill="#fff4e0" stroke="#d08a2a" stroke-width="2"/>`);
  t(mx0 + 20, y((34 + top10) / 2) - 8, '7F、8F、9F、10F 在这里', 17, 'font-weight="700" fill="#8a4f0b"');
  t(mx0 + 20, y((34 + top10) / 2) + 18, `标高 34.0–${f1(top10)} m`, 14, 'fill="#8a4f0b"');
  o.push(`<line x1="${mx0 + 222}" y1="${y((34 + top10) / 2)}" x2="${wx0 - 22}" y2="${y((34 + top10) / 2)}" stroke="#d08a2a" stroke-width="2" marker-end="url(#arrowO)"/>`);
  // Pass-through bracket over 2F–6F.
  o.push(`<path d="M${cx1 + 6},${y(6.5)} h10 V${y(34)} h-10" fill="none" stroke="#c0392b" stroke-width="2"/>`);
  o.push(`<rect x="${cx1 + 24}" y="${n2(y(23.5))}" width="300" height="66" rx="6" fill="#ffffff" stroke="#c0392b" stroke-width="1.5"/>`);
  t(cx1 + 36, y(23.5) + 26, '住户电梯在 2F–6F 穿过商场、不停靠', 16, 'font-weight="700" fill="#c0392b"');
  t(cx1 + 36, y(23.5) + 50, '（B1M 夹层同样不停）1F 上车 → 第一站 7F', 13.5, 'fill="#7a2a20"');
  // Height comparison ruler: 34 m ≈ 11 residential storeys.
  for (let i = 0; i < 11; i++) {
    const e0 = i * 34 / 11, e1 = (i + 1) * 34 / 11;
    rect(rx, e0, rx + 54, e1, `fill="${i % 2 ? '#ffffff' : '#f2efe9'}" stroke="#9b9386" stroke-width="1"`);
    t(rx + 27, y(e0 + (e1 - e0) / 2) + 5, `${i + 1}`, 13, 'text-anchor="middle" fill="#4a453e"');
  }
  t(rx + 27, y(34) - 26, '同高度≈', 12, 'text-anchor="middle" fill="#6d665c"');
  t(rx + 27, y(34) - 10, '普通住宅', 13, 'text-anchor="middle" font-weight="700" fill="#4a453e"');
  o.push(`<line x1="${mx1 + 10}" y1="${y(34)}" x2="${rx + 70}" y2="${y(34)}" stroke="#6b5a40" stroke-width="1.5" stroke-dasharray="6 4"/>`);
  o.push(`<rect x="${rx + 72}" y="${n2(y(34) - 22)}" width="420" height="44" rx="8" fill="#fff4e0" stroke="#d08a2a" stroke-width="2"/>`);
  t(rx + 84, y(34) + 7, '商场 6 层总高 34 m，约等于住宅 11 层高', 19, 'font-weight="700" fill="#8a4f0b"');
  t(rx + 72, y(34) + 46, '对照：西苑 12F 的标高是 34.5 m，与北苑 7F（34.0 m）几乎同高。', 14, 'fill="#6d5a3d"');
  // Answer panel and stop list (text first, the panel box sized to it).
  const qx = 1560, qy = 150;
  // Greedy wrap by visual width (CJK = 1 em, ASCII ≈ 0.55 em); ASCII words stay whole, no line starts with punctuation.
  const wrap = (str, n) => {
    const toks = str.match(/[A-Za-z0-9.+\-–/]+|./gu) || [], wid = (tk) => [...tk].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x2000 ? 0.55 : 1), 0);
    const out = []; let cur = '', cw = 0;
    for (const tk of toks) {
      const w = wid(tk);
      if (cw + w > n && cur && !/^[，。、；）：]/.test(tk)) { out.push(cur); cur = ''; cw = 0; }
      cur += tk; cw += w;
    }
    if (cur) out.push(cur);
    return out;
  };
  const panel = [];
  const pt = (x, yy, str, fs, a) => panel.push(`<text x="${n2(x)}" y="${n2(yy)}" font-size="${fs}" ${a}>${esc(str)}</text>`);
  pt(qx, qy, '问：7F、8F、9F、10F 去哪里了？', 20, 'font-weight="700" fill="#1f1d1a"');
  const ans = [
    '答：一层都没有少。北苑的楼层号接着商场往上数：',
    '· 商场 1F–6F 占 0–34 m；',
    '· 7F 空中会所就在 34 m 的商场屋面上；',
    '· 8F–13F 江景大平层（层高 3.6 m，每层 W / E 两户）；',
    '· 14F–24F 错层复式（层高 3.3 m；W 侧 14–15、16–17…，E 侧 15–16、17–18…；14E 与 24W 为单层）；',
    '· RF 屋顶花园 96.9 m。',
    '看上去像“从十几楼开始”，是因为商场每层比住宅高得多：6 层商场 34 m，相当于普通住宅 11 层。站在地面看，北苑 7F 的高度和普通住宅的十一、二楼一样。',
  ];
  let yy = qy + 38;
  for (const a of ans) {
    for (const [i, l] of wrap(a, a.startsWith('·') ? 35 : 36).entries()) { pt(qx + (i && a.startsWith('·') ? 14 : 0), yy, l, 15.5, 'fill="#3a3530"'); yy += 25; }
    if (!a.startsWith('·') || a.startsWith('· RF')) yy += 6;
  }
  yy += 16;
  pt(qx, yy, '电梯停靠（● 停靠；2F–6F 与 B1M 只穿过）', 17, 'font-weight="700" fill="#1f1d1a"'); yy += 30;
  const compact = (list) => {
    const tower = list.filter((id) => /^T1-/.test(id)).map((id) => id.slice(3)), hosts = list.filter((id) => /^P1-/.test(id)).map((id) => id.slice(3));
    const nums = tower.filter((v) => /^\d+F$/.test(v)).map((v) => +v.slice(0, -1));
    const runs = []; for (const v of nums) { const r = runs.at(-1); if (r && v === r[1] + 1) r[1] = v; else runs.push([v, v]); }
    const segs = []; for (const [a, b] of runs) { if (b - a >= 2) segs.push(`${a}F–${b}F`); else for (let v = a; v <= b; v++) segs.push(`${v}F`); }
    return [`商场 ${hosts.join(' / ')}`, segs.join(' · '), tower.includes('RF') ? 'RF' : ''].filter(Boolean).join(' · ');
  };
  for (const [k, name, col] of [['LW', 'LW 住户电梯（W 户）', '#2d6a9f'], ['LE', 'LE 住户电梯（E 户）', '#2d6a9f'], ['LF', 'LF 消防电梯（每层）', '#c0392b']]) {
    panel.push(`<circle cx="${qx + 7}" cy="${yy - 5}" r="6" fill="${col}"/>`);
    pt(qx + 20, yy, name, 15.5, 'font-weight="700" fill="#3a3530"'); yy += 23;
    for (const l of wrap(compact(stops[k]), 38)) { pt(qx + 20, yy, l, 14.5, 'fill="#4a453e"'); yy += 22; }
    yy += 8;
  }
  o.push(`<rect x="${qx - 20}" y="${qy - 34}" width="${Wd - qx - 10}" height="${n2(yy - qy + 30)}" rx="10" fill="#f8f6f1" stroke="#d6d0c4" stroke-width="1.2"/>`, ...panel);
  // Legend.
  const lg = [['#d9e7f5', '8F–13F 大平层'], ['#dcefcf', '14E 单层大平层'], ['#f6e6c6', '错层复式（虚线为上下层分界）'], ['#e6ddf1', '24W 顶层大平层'], ['#cfeae6', '7F 空中会所'], ['#f3e7d3', '一期商场楼层']];
  let lx = qx, ly = yy + 60;
  t(lx, ly - 14, '图例', 15, 'font-weight="700" fill="#1f1d1a"');
  for (const [c, str] of lg) { o.push(`<rect x="${lx}" y="${ly}" width="20" height="14" fill="${c}" stroke="#7d7363"/>`); t(lx + 28, ly + 12, str, 14, 'fill="#3a3530"'); ly += 24; }
  o.push(`<circle cx="${lx + 10}" cy="${ly + 7}" r="5" fill="#2d6a9f"/>`); t(lx + 28, ly + 12, '住户电梯停靠层', 14, 'fill="#3a3530"'); ly += 24;
  o.push(`<circle cx="${lx + 10}" cy="${ly + 7}" r="5" fill="#c0392b"/>`); t(lx + 28, ly + 12, '消防电梯停靠层', 14, 'fill="#3a3530"');
  t(60, Hd - 28, '数据：NORTH_SITE.levels（标高）、northStops()（停靠层）、COMMUNITY_PLANS.north.T1（户型）。竖向按真实标高绘制：1 m = 11.2 px。', 13, 'fill="#7b756b"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Hd}" viewBox="0 0 ${Wd} ${Hd}" font-family="${esc(FONT)}">
  <defs><pattern id="hatchS" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#e8e4dc"/><line x1="0" y1="0" x2="0" y2="8" stroke="#cbc4b7" stroke-width="1.5"/></pattern>
  <marker id="arrowO" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#d08a2a"/></marker></defs>
  <rect width="${Wd}" height="${Hd}" fill="#ffffff"/>${o.join('')}</svg>`;
}

function westSection(L) {
  const lvs = L.levels.filter((l) => l.building === 'W1').sort((a, b) => a.elev - b.elev);
  const Wd = 1900, Hd = 1420, E = 11.6, base = 1220, y = (e) => base - e * E;
  const o = [], t = (x, yy, s, fs = 14, a = '') => o.push(`<text x="${n2(x)}" y="${n2(yy)}" font-size="${fs}" ${a}>${esc(s)}</text>`);
  const rect = (x0, e0, x1, e1, a) => o.push(`<rect x="${n2(x0)}" y="${n2(y(e1))}" width="${n2(x1 - x0)}" height="${n2(y(e0) - y(e1))}" ${a}/>`);
  t(60, 52, '云澜·西苑 剖面楼层图（真实标高比例）', 30, 'font-weight="700" fill="#1f1d1a"');
  t(60, 86, '3梯5户板楼，1 号楼与 2 号楼楼层相同；2F–28F 每层 5 户、各层同户型。B1 / B2 为住户电梯厅，经刷卡门接西侧共享车库。', 16, 'fill="#4a453e"');
  const ax = 92;
  o.push(`<line x1="${ax}" y1="${y(-9)}" x2="${ax}" y2="${y(90)}" stroke="#8d877c" stroke-width="1.2"/>`);
  for (let e = -5; e <= 90; e += 5) {
    o.push(`<line x1="${ax - (e % 10 ? 4 : 8)}" y1="${y(e)}" x2="${ax}" y2="${y(e)}" stroke="#8d877c" stroke-width="1"/>`);
    if (e % 10 === 0) t(ax - 12, y(e) + 5, `${e} m`, 12.5, 'text-anchor="end" fill="#6d675e"');
  }
  o.push(`<rect x="${ax + 10}" y="${y(0)}" width="1500" height="${n2(9 * E)}" fill="#efe9de"/>`, `<line x1="${ax + 10}" y1="${y(0)}" x2="${ax + 1510}" y2="${y(0)}" stroke="#6b5f4f" stroke-width="2.5"/>`);
  const typeFill = { 2: '#dcefcf', 3: '#d9e7f5', 4: '#f6e6c6' };
  const towers = [['W1', 190], ['W2', 860]];
  for (const [tid, x0] of towers) {
    const T = COMMUNITY_PLANS.west[tid], order = ['SW', 'S', 'SE', 'NW', 'NE'], units = order.map((s) => T.units.find((u) => u.slot === s));
    const cw = 96, coreW = 70, cols = [0, 1, 2].map((i) => x0 + i * cw).concat([x0 + 3 * cw + coreW, x0 + 4 * cw + coreW]), coreX = x0 + 3 * cw, x1 = x0 + 5 * cw + coreW;
    t((x0 + x1) / 2, y(lvs.at(-1).elev + 3.2) - 52, `西苑 ${tid.slice(1)} 号楼`, 19, 'text-anchor="middle" font-weight="700" fill="#1f1d1a"');
    for (const [i, u] of units.entries()) {
      t(cols[i] + cw / 2, y(lvs.at(-1).elev + 3.2) - 26, `${u.slot} ${u.plan.label.slice(0, 2)}`, 12.5, 'text-anchor="middle" fill="#4a453e"');
    }
    t(coreX + coreW / 2, y(lvs.at(-1).elev + 3.2) - 26, '核心筒', 12.5, 'text-anchor="middle" fill="#4a453e"');
    for (const l of lvs) {
      if (l.kind === 'garage-lobby') { rect(coreX - 40, l.elev, coreX + coreW + 40, l.elev + l.height, `fill="#e4ded3" stroke="#b9ab94"`); t(coreX - 48, y(l.elev + l.height / 2) + 5, `${l.short} 住户电梯厅 · 接共享车库`, 12.5, 'text-anchor="end" fill="#5e5242"'); continue; }
      if (l.kind === 'lobby') {
        rect(x0, l.elev, x1, l.elev + l.height, `fill="#cfeae6" stroke="#5f8f88" stroke-width="1.2"`);
        t((x0 + coreX) / 2, y(l.elev + l.height / 2) + 6, '1F 社区大堂', 15, 'text-anchor="middle" font-weight="700" fill="#2f5d57"');
        t((coreX + coreW + x1) / 2, y(l.elev + l.height / 2) + 5, '门禁 · 礼宾 · 物业 · 信报', 12.5, 'text-anchor="middle" fill="#2f5d57"');
        continue;
      }
      if (l.kind === 'roof') { rect(x0, l.elev, x1, l.elev + 1.2, `fill="#dcefcf" stroke="#6d8f5c"`); t((x0 + coreX) / 2, y(l.elev + 1.2) - 9, 'RF 屋顶花园 85.5 m', 13, 'text-anchor="middle" font-weight="700" fill="#4c6b3e"'); continue; }
      for (const [i, u] of units.entries()) rect(cols[i] + 1.5, l.elev + 0.15, cols[i] + cw - 1.5, l.elev + l.height - 0.15, `fill="${typeFill[u.plan.bedrooms] || '#eee'}" stroke="#8d8273" stroke-width="0.8"`);
      rect(coreX, l.elev, coreX + coreW, l.elev + l.height, `fill="#ebe8e2" stroke="#b5ad9f" stroke-width="0.6"`);
      if (l.short === '12F' || l.short === '2F' || l.short === '28F') for (const [i, u] of units.entries()) t(cols[i] + cw / 2, y(l.elev + l.height / 2) + 4.5, `${u.slot} ${fmtA(u.plan.area)}㎡`, 11, 'text-anchor="middle" fill="#3a3530"');
    }
    // Lifts through every level.
    for (const [k, i] of [['L1', 0], ['L2', 1], ['L3', 2]]) {
      const x = coreX + 9 + i * 20, b = lvs[0].elev, tp = lvs.at(-1).elev + 1.2;
      o.push(`<rect x="${x}" y="${n2(y(tp))}" width="12" height="${n2((tp - b) * E)}" fill="#ffffff" stroke="#6d675e" stroke-width="0.9"/>`);
      for (const l of lvs) o.push(`<circle cx="${x + 6}" cy="${n2(y(l.elev + 1))}" r="3.6" fill="${k === 'L3' ? '#c0392b' : '#2d6a9f'}"/>`);
      t(x + 6, y(b) + 16, k, 11.5, 'text-anchor="middle" font-weight="700" fill="#3a3530"');
    }
  }
  // Floor labels between the towers / right.
  const fx = 1425;
  for (const l of lvs) {
    const yy = y(l.elev + (l.kind === 'roof' ? 0.4 : l.height / 2)) + 4.5;
    if (l.kind === 'community' && !['2F', '5F', '10F', '12F', '15F', '20F', '25F', '28F'].includes(l.short)) { o.push(`<line x1="${fx}" y1="${y(l.elev)}" x2="${fx + 8}" y2="${y(l.elev)}" stroke="#b5ad9f"/>`); continue; }
    o.push(`<line x1="${fx}" y1="${y(l.elev)}" x2="${fx + 14}" y2="${y(l.elev)}" stroke="#8d877c"/>`);
    t(fx + 20, yy, `${l.short}  ${f1(l.elev)} m${l.short === '12F' ? '（户型图所用楼层）' : ''}`, 13, `fill="#3a3530"${l.short === '12F' ? ' font-weight="700"' : ''}`);
  }
  const l12 = lvs.find((l) => l.short === '12F');
  o.push(`<line x1="${ax + 10}" y1="${y(34)}" x2="${fx}" y2="${y(34)}" stroke="#d08a2a" stroke-width="1.6" stroke-dasharray="7 5"/>`);
  t(ax + 20, y(34) + 17, `34.0 m = 北苑 7F 空中会所标高（西苑 12F 为 ${f1(l12.elev)} m）`, 13.5, 'font-weight="700" fill="#8a4f0b" paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"');
  // Legend.
  let lx = 1650, ly = 160;
  t(lx, ly - 14, '图例', 15, 'font-weight="700" fill="#1f1d1a"');
  for (const [c, s] of [['#dcefcf', '两房一厅'], ['#d9e7f5', '三房一厅'], ['#f6e6c6', '四房一厅'], ['#cfeae6', '1F 社区大堂'], ['#e4ded3', 'B1 / B2 住户电梯厅'], ['#ebe8e2', '核心筒']]) {
    o.push(`<rect x="${lx}" y="${ly}" width="20" height="14" fill="${c}" stroke="#7d7363"/>`); t(lx + 28, ly + 12, s, 14, 'fill="#3a3530"'); ly += 24;
  }
  ly += 10;
  o.push(`<circle cx="${lx + 8}" cy="${ly}" r="4" fill="#2d6a9f"/>`); t(lx + 20, ly + 5, 'L1 / L2 客梯：B2–RF 每层停靠', 13.5, 'fill="#3a3530"'); ly += 22;
  o.push(`<circle cx="${lx + 8}" cy="${ly}" r="4" fill="#c0392b"/>`); t(lx + 20, ly + 5, 'L3 消防电梯：B2–RF 每层停靠', 13.5, 'fill="#3a3530"'); ly += 30;
  for (const s of ['南排：SW · S · SE', '北排：NW · 核心筒 · NE', '1F 4.5 m，2F–28F 层高 3.0 m']) { t(lx, ly, s, 13.5, 'fill="#4a453e"'); ly += 22; }
  t(60, Hd - 28, `数据：WEST_SITE.levels（B2 ${WEST_SITE.levels.B2} m · B1 ${WEST_SITE.levels.B1} m · 1F 0 m · 2F 4.5 m … 28F 82.5 m · RF ${WEST_SITE.levels.roof} m）、COMMUNITY_PLANS.west。竖向 1 m = ${E} px。`, 13, 'fill="#7b756b"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Hd}" viewBox="0 0 ${Wd} ${Hd}" font-family="${esc(FONT)}"><rect width="${Wd}" height="${Hd}" fill="#ffffff"/>${o.join('')}</svg>`;
}

/* ------------------------------------------------------------------ index sheets */
function indexHtml(title, sub, sections, cols, tileW) {
  const b64 = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`;
  const css = `body{margin:0;background:#fff;font-family:${FONT};color:#2b2824;width:2400px}
  h1{font-size:34px;margin:28px 36px 4px} .sub{font-size:17px;color:#5e5850;margin:0 36px 10px}
  h2{font-size:22px;margin:26px 36px 10px;padding-bottom:6px;border-bottom:2px solid #e1dcd2}
  .grid{display:grid;grid-template-columns:repeat(${cols},${tileW}px);gap:18px 14px;margin:0 36px;align-items:start}
  .tile{border:1px solid #e1dcd2;border-radius:6px;padding:8px;background:#fff}
  .pair{grid-column:span 2;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .img{display:flex;align-items:center;justify-content:center;background:#fff}
  .cap{font-size:15px;line-height:1.35;margin-top:6px} .cap b{font-size:16px} .cap span{color:#6d665c}
  .tag{font-size:13px;color:#6d665c;text-align:center;margin-top:2px}
  .north{position:absolute;top:26px;right:40px;font-size:16px;text-align:center;font-weight:700}`;
  const img = (th, k) => `<div class="img"><img src="${b64(th.svg)}" width="${Math.round(th.width * k)}" height="${Math.round(th.height * k)}"></div>`;
  const body = sections.map((s) => `<h2>${esc(s.title)}</h2><div class="grid">${s.items.map((it) => it.pair
    ? `<div class="tile pair"><div>${img(it.pair[0], s.k)}<div class="tag">${esc(it.tags[0])}</div></div><div>${img(it.pair[1], s.k)}<div class="tag">${esc(it.tags[1])}</div></div>`
      + `<div class="cap" style="grid-column:span 2"><b>${esc(it.caption[0])}</b><br>${esc(it.caption[1])}<br><span>${esc(it.caption[2])}</span></div></div>`
    : `<div class="tile">${img(it.thumb, s.k)}<div class="cap"><b>${esc(it.caption[0])}</b><br>${esc(it.caption[1])}<br><span>${esc(it.caption[2])}</span></div></div>`).join('')}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="position:relative">
  <div class="north"><svg width="40" height="40" viewBox="-20 -20 40 40"><circle r="18" fill="#fff" stroke="#3a3632" stroke-width="1.5"/><path d="M0,-15 L6,7 L0,3 L-6,7 z" fill="#3a3632"/></svg><br>上北</div>
  <h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div>${body}<div style="height:30px"></div></body></html>`;
}

/* ------------------------------------------------------------------ main */
async function main() {
  const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'catalog'));
  const planDir = path.join(outDir, 'plans');
  mkdirSync(planDir, { recursive: true });
  const t0 = Date.now();
  const L = buildLayout({ expansion: true });
  const parts = collectParts(L);
  if (parts.length !== 78) throw new Error(`expected 78 level-parts, got ${parts.length}`);
  console.log(`layout built, ${parts.length} level-parts (${parts.filter((p) => p.community === 'west').length} west, ${parts.filter((p) => p.community === 'north').length} north)`);

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: SHEET_W, height: 900 }, deviceScaleFactor: 1 });
    const chars = parts.flatMap((p) => p.res.rooms.flatMap((q) => [...q.name])).concat([...'0123456789. ㎡入户门公共走廊邻户上下层核心筒楼梯疏散消防住户梯客电厅本不停管道井垃圾间强弱']);
    ADV = await measureChars(page, chars);

    for (const p of parts) {
      const a = analysePlan(p.res);
      const sheet = drawPlan(p, L);
      p.thumb = drawPlan(p, L, { bare: true });
      p.titles = sheet.title;
      writeFileSync(path.join(planDir, `${p.file}.svg`), sheet.svg);
      await page.setViewportSize({ width: sheet.width, height: sheet.height });
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${sheet.svg}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      // Every in-room label must sit inside its room (actual glyph boxes); leader labels inside the drawing.
      const overflow = await page.evaluate((vp) => {
        const out = [];
        for (const g of document.querySelectorAll('g.room-label, g.leader-label')) {
          const [x0, y0, x1, y1] = g.dataset.box.split(' ').map(Number);
          let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
          for (const t of g.querySelectorAll('text')) {
            const b = t.getBoundingClientRect(); bx0 = Math.min(bx0, b.left); by0 = Math.min(by0, b.top); bx1 = Math.max(bx1, b.right); by1 = Math.max(by1, b.bottom);
          }
          const leader = g.classList.contains('leader-label');
          const lim = leader ? vp : { x0, y0, x1, y1 };
          const tol = leader ? 0 : 1.5;
          if (bx0 < lim.x0 - tol || by0 < lim.y0 - tol || bx1 > lim.x1 + tol || by1 > lim.y1 + tol) out.push({ room: g.dataset.room, leader, box: [x0, y0, x1, y1].map(Math.round), text: [bx0, by0, bx1, by1].map(Math.round) });
        }
        return out;
      }, sheet.viewPx);
      await page.screenshot({ path: path.join(planDir, `${p.file}.png`), clip: { x: 0, y: 0, width: sheet.width, height: sheet.height } });
      results.push({ file: `plans/${p.file}.svg`, png: `plans/${p.file}.png`, home: p.homeId, floor: `${p.floor}F`, level: p.lv.id, unit: p.unit.id, code: p.unit.code,
        plan: p.res.plan, title: sheet.title.title, ...a, labelOverflow: overflow, leaders: sheet.labelsOver.filter((x) => /leader/.test(x.reason)) });
      process.stdout.write('.');
    }
    process.stdout.write('\n');

    // Index sheets.
    const jpeg = async (html, file, width = 2400) => {
      await page.setViewportSize({ width, height: 300 });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      await page.setViewportSize({ width, height: h });
      let q = 86, size = Infinity;
      while (q >= 40) {
        await page.screenshot({ path: file, type: 'jpeg', quality: q, fullPage: true });
        size = statSync(file).size;
        if (size <= 900 * 1024) break;
        q -= 6;
      }
      return { file, size, quality: q, height: h };
    };
    const sheets = [];
    const westParts = parts.filter((p) => p.community === 'west');
    {
      const cols = 5, tileW = Math.floor((2400 - 72 - (cols - 1) * 14) / cols);
      const k = (tileW - 18) / Math.max(...westParts.map((p) => p.thumb.width));
      const sec = (tid) => ({ title: `西苑 ${tid.slice(1)} 号楼 · 3梯5户（南排 SW · S · SE，北排 NW · NE）`, k,
        items: westParts.filter((p) => p.tower === tid).map((p) => ({ thumb: p.thumb, caption: p.titles.caption })) });
      sheets.push(await jpeg(indexHtml('云澜·西苑 户型索引', '10 个户型（两房 / 三房 / 四房），各户位 2F–28F 同户型，图为标准层 12F；上北下南，统一比例。', [sec('W1'), sec('W2')], cols, tileW), path.join(outDir, 'index-west.jpg')));
    }
    for (const tid of ['T1', 'T2']) {
      const cols = 6, tileW = Math.floor((2400 - 72 - (cols - 1) * 14) / cols);
      const tp = parts.filter((p) => p.tower === tid);
      const k = (tileW - 18) / Math.max(...tp.map((p) => p.thumb.width));
      const homes = COMMUNITY_PLANS.north[tid].homes;
      const item = (h) => {
        const ps = tp.filter((p) => p.homeId === h.id);
        if (h.kind !== 'duplex') return { thumb: ps[0].thumb, caption: ps[0].titles.caption };
        return { pair: ps.map((p) => p.thumb), tags: [`${h.levels[0]}F 下层（入户）`, `${h.levels[1]}F 上层`], caption: ps[0].titles.caption };
      };
      const flats = homes.filter((h) => h.kind === 'flat' && h.levels[0] < 14).sort((a, b) => a.levels[0] - b.levels[0] || (a.side < b.side ? 1 : -1));
      const wSide = homes.filter((h) => h.levels[0] >= 14 && h.side === 'W').sort((a, b) => a.levels[0] - b.levels[0]);
      const eSide = homes.filter((h) => h.levels[0] >= 14 && h.side === 'E').sort((a, b) => a.levels[0] - b.levels[0]);
      const n = tid.slice(1);
      sheets.push(await jpeg(indexHtml(`云澜·北苑 ${n} 号楼 户型索引`, `24 户：8F–13F 江景大平层 12 户，14F–24F 错层复式 10 户（下层入户 + 上层）与 14E、24W 两户单层；上北下南，统一比例。W 户在核心筒西侧，E 户在东侧。`, [
        { title: '8F–13F 江景大平层（一梯一户，每层 W / E 两户，层高 3.6 m）', k, items: flats.map(item) },
        { title: 'W 侧 14F–24F：错层复式 14–15W … 22–23W，24W 顶层大平层', k, items: wSide.map(item) },
        { title: 'E 侧 14F–24F：14E 单层大平层，错层复式 15–16E … 23–24E', k, items: eSide.map(item) },
      ], cols, tileW), path.join(outDir, `index-${tid}.jpg`)));
    }
    // Section charts.
    const ns = northSection(L), ws = westSection(L);
    writeFileSync(path.join(outDir, 'north-section.svg'), ns);
    writeFileSync(path.join(outDir, 'west-section.svg'), ws);
    const shot = async (svg, file) => {
      const w = +/width="(\d+)"/.exec(svg)[1], h = +/height="(\d+)"/.exec(svg)[1];
      await page.setViewportSize({ width: w, height: h });
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${svg}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: file, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: w, height: h } });
      return { file, size: statSync(file).size };
    };
    sheets.push(await shot(ns, path.join(outDir, 'north-section.jpg')), await shot(ws, path.join(outDir, 'west-section.jpg')));

    // Manifest and summary.
    writeFileSync(path.join(planDir, 'manifest.json'), JSON.stringify({ generated: new Date().toISOString(), count: results.length, sheets: sheets.map((s) => ({ ...s, file: path.relative(outDir, s.file) })), plans: results }, null, 1));
    const mism = results.filter((r) => r.mismatch), ovf = results.filter((r) => r.labelOverflow.length), led = results.filter((r) => r.leaders.length);
    console.log(`plans: ${results.length} → ${planDir}`);
    for (const s of sheets) console.log(`sheet ${path.relative(outDir, s.file)}: ${(s.size / 1024).toFixed(0)} KB${s.quality ? ` (q${s.quality}, ${s.height}px tall)` : ''}`);
    console.log(`area mismatch > 2 %: ${mism.length ? mism.map((r) => `${r.file} ${r.roomSum} vs ${r.area} (${r.pct}%)`).join('; ') : 'none'}`);
    console.log(`label overflow: ${ovf.length ? ovf.map((r) => `${r.file}: ${r.labelOverflow.map((o) => o.room).join(',')}`).join('; ') : 'none'}`);
    console.log(`leader lines: ${led.length ? led.map((r) => `${r.file}: ${r.leaders.map((o) => o.room).join(',')}`).join('; ') : 'none'}`);
    const doors = results.flatMap((r) => r.doors.map((d) => ({ ...d, file: r.file })));
    console.log(`internal door leaves: ${doors.length}; freestanding (not parked against a wall): ${doors.filter((d) => d.freestanding).length}; swing into the circulation side: ${doors.filter((d) => d.outward).length}`);
    const iss = results.filter((r) => r.issues.length);
    console.log(`plans with plan-data issues: ${iss.length}`);
    for (const r of iss) console.log(`  ${r.file}: ${r.issues.join(' | ')}`);
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
