// 超级商业中心（游览模式）第一步：方庭、西北翼、圆厅之间补两块楼面（A、B），三处中庭连成一个大中庭。
// 用户的要求：「和方庭连在一起，要有一眼望到头的感觉，开口要很大」。做法：
//   · A（方庭东边、北翼西边）、B（西北翼南边、西翼北边）两块并进一期 1F–6F 和屋面（地下室不动）；
//   · 2F–6F 的洞口 = 圆厅洞口 + 一段「颈」（圆厅到西北翼）+ 西北翼上一个大椭圆（往 A 那边鼓出去）+ 方庭洞口，合成一个；
//     椭圆每层往外退，6F 约 72×56 米；避开北翼的口袋楼梯（N-PSR、N-ST）和西北翼楼梯（NW-ST）；
//   · 椭圆里原来的西北翼铺位、卫生间去掉；西北翼两部客梯只到 1F；原来的西北翼扶梯（K7、K8）换成 A 里的一组交叉扶梯（p1-expansion-spec.js）。
// 坐标：西北翼局部坐标（NW 翼 frame：原点圆厅圆心、u 沿 225° 朝方庭，v 正向朝北翼一侧 = A、负向 = B）。
import clipping from 'polygon-clipping';
import { frame, toW, toL, rect, rectPoly, lrectPoly, circlePoly } from './geom.js';
import { WEST_GATE_AXIS } from './west-parking.js';
import { BrandPicker } from './brands.js';
import { CATEGORIES } from './constants.js';
import { expansionFacadeWalls } from './p1-expansion.js';
import { lseg, polysConnect } from './geom.js';

export const NW_FRAME = frame(-106, -106, 225, 'P1-NW-MEGA');
/** 新增楼面（世界坐标），按 polygon-clipping 算出的空地取整 */
export const INFILL = {
  A: [[-160, -207], [-104, -207], [-102.9, -196.3], [-105.4, -197], [-117.9, -150.4], [-160, -192.5]],
  B: [[-210, -160], [-192.5, -160], [-150.4, -117.9], [-204.7, -103.4], [-203.8, -100], [-210, -100]],
};
/** 大椭圆（西北翼局部）：圆心、每层的半长（沿 u）和半宽（沿 v） */
// 每层往外退 4 米（长向）、3–4 米（宽向）：2F 52×28 米 → 6F 84×60 米
export const MEGA_OVAL = { u: 82, v: 11, steps: { '2F': [26, 14], '3F': [30, 18], '4F': [34, 22], '5F': [38, 26], '6F': [42, 30] } };
/** 圆厅到大椭圆的「颈」：u 20–52，半宽（避开北翼口袋楼梯 v≥13.6） */
export const MEGA_NECK = { u0: 20, u1: 52, steps: { '2F': 6, '3F': 7.5, '4F': 9, '5F': 10.5, '6F': 12 } };
/** 方庭到大椭圆的「喉」（方庭局部坐标，原点 (−220,−200)）：从方庭洞口东端斜着接到椭圆西北头，半宽每层 +1.5 米，2F 起每层都连通 */
/** 东南翼采光长廊（东南翼局部坐标：原点圆厅圆心、u 沿 45° 朝东南主入口）：u 26–74 一条圆头长洞口接上圆厅，
 *  半宽每层 +1.5 米（2F 5 → 6F 11）。从东南主入口经圆厅、颈、大椭圆、喉到方庭一条线 */
export const SE_FRAME = frame(-106, -106, 45, 'P1-SE-MEGA');
export const SE_GALLERIA = { u0: 26, u1: 74, steps: { '2F': 5, '3F': 6.5, '4F': 8, '5F': 9.5, '6F': 11 } };
/** 西翼退台长廊（西翼 165°，u 26–84），和 B 区、酒店连廊连成一片；步距同东南翼 */
export const W_FRAME = frame(-106, -106, 165, 'P1-W-MEGA');
export const W_GALLERIA = { u0: 26, u1: 70, steps: SE_GALLERIA.steps };
export const MEGA_THROAT = { x0: 24, x1: 50, z1: 10, steps: { '2F': 5, '3F': 6.5, '4F': 8, '5F': 9.5, '6F': 11 } };
/** 1F 中庭广场上两座喷泉的位置（西北翼局部 u、v：大椭圆中轴上） */
export const MEGA_FOUNTAINS = [[68, 9], [96, 9]];
/** 新楼面贴墙一圈铺位：墙线（世界坐标，起点→终点）、进深 */
export const MEGA_SHOP_WALLS = [
  { id: 'AN', a: [-159, -207], b: [-105, -207] },          // A 北：贴艺文馆 P1C 南墙
  { id: 'AE', a: [-105.4, -197], b: [-117.9, -150.4] },    // A 东：贴北翼铺位背墙
  { id: 'AS', a: [-117.9, -150.4], b: [-160, -192.5] },    // A 西南：贴西北翼北侧铺位背墙
  { id: 'BW', a: [-210, -159], b: [-210, -100.5] },        // B 西：贴西苑附楼 P1W2、P1W4 东墙
  { id: 'BN', a: [-192.5, -160], b: [-150.4, -117.9] },    // B 东北：贴西北翼南侧铺位背墙
  { id: 'BS', a: [-150.4, -117.9], b: [-204.7, -103.4] },  // B 南：贴西翼北侧铺位背墙
];
/** 原来就空着的角落（不是走道也没有铺位）：方庭南排铺位东头到外墙那块 16×16 米，做成一间朝走道开门的铺位。x0..x1、z0..z1 是世界坐标，门脸在 z1 一侧 */
export const MEGA_POCKETS = [{ id: 'SQ-SE', x0: -176, z0: -240, x1: -160, z1: -224 }];
/** 中庭环形店铺：门脸离洞口 7 米，每间 9 米开间，进深 16 → 10 米能放多深放多深 */
export const MEGA_RING = { corridor: 7, width: 9, depths: [16, 14, 12, 10] };
// 西北翼原来那条翼楼（局部 u 15–125、v ±24）也能排环形店铺
// 方庭（x < −194）和圆厅（圆心 30 米内）原有布局不动，其余楼面都能排环形店铺
const megaZone = (q) => q[0] > -194 && Math.hypot(q[0] + 106, q[1] + 106) > 30;
const inBand = (q) => { const [u, v] = toL(NW_FRAME, q[0], q[1]); return u > 15 && u < 125 && Math.abs(v) < 24; };
/** 门、扶梯口、楼梯门、电梯门到中庭边的 6 米宽通道：环形店铺不能挡 */
function accessStrips(layout, lv, rings) {
  const pts = [];
  for (const e of layout.entrances) if (e.level === lv.id || e.to === lv.id) pts.push(midSeg(e.seg));
  for (const g of layout.fidelity.mega.gaps) if (g.level === lv.id) pts.push(g.poly.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4], [0, 0]));
  for (const e of layout.escalators) {
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z), ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    if (e.from === lv.id) pts.push([e.bottom.x - ux * 2, e.bottom.z - uz * 2]);
    if (e.to === lv.id) pts.push([e.top.x + ux * 2, e.top.z + uz * 2]);
  }
  for (const s of layout.stairs) if (s.serves?.includes(lv.id)) { const d = s.wdoorByLevel?.[lv.id] || s.wdoor; if (d) pts.push([(d.x0 + d.x1) / 2 + d.nx * 1.2, (d.z0 + d.z1) / 2 + d.nz * 1.2]); }
  for (const e of layout.elevators) if (e.serves?.includes(lv.id) && e.nx != null) pts.push([e.x + e.nx * ((e.reach || 1.5) + 0.6), e.z + e.nz * ((e.reach || 1.5) + 0.6)]);
  const out = [];
  for (const p of pts) {
    if (!(inInfill(p) || inBand(p))) continue;
    let best = null;
    for (const V of rings) for (let i = 0; i < V.length; i++) {
      const a = V[i], b = V[(i + 1) % V.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)), q = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!best || d < best.d) best = { q, d };
    }
    if (!best || best.d < 0.5) continue;
    const ux = (best.q[0] - p[0]) / best.d, uz = (best.q[1] - p[1]) / best.d, h = 3;
    const a = [p[0] - ux * 1.5, p[1] - uz * 1.5], b = best.q;
    out.push([[a[0] - uz * h, a[1] + ux * h], [b[0] - uz * h, b[1] + ux * h], [b[0] + uz * h, b[1] - ux * h], [a[0] + uz * h, a[1] - ux * h]]);
  }
  return out;
}
export const MEGA_SHOP = { depth: 11, width: 8.5, corridor: 5, cats: ['fashion', 'cafe', 'beauty', 'shoes', 'tech', 'accessory', 'tea', 'sports', 'jewelry', 'home', 'snack', 'books', 'toys', 'bakery'] };
const UPPER = ['2F', '3F', '4F', '5F', '6F'];
const ABOVE = ['1F', ...UPPER, 'RF'];

const snap = (p) => p.map(([x, z]) => [Math.round(x * 1e4) / 1e4, Math.round(z * 1e4) / 1e4]);
const close0 = (p) => (p.length && (p[0][0] !== p.at(-1)[0] || p[0][1] !== p.at(-1)[1]) ? [...p, p[0]] : p);
const close = (p) => close0(snap(p));
const open = (p) => p.slice(0, -1);
const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length]; a += x0 * z1 - x1 * z0; } return a / 2; };
const nw = (u, v) => toW(NW_FRAME, u, v);
const mid = (P) => [P.reduce((a, q) => a + q[0], 0) / P.length, P.reduce((a, q) => a + q[1], 0) / P.length];
/** 去掉相距不到 5 cm 的点和共线点（布尔运算留下的碎边会让三角剖分出错） */
function clean(P) {
  let out = P.slice();
  for (let pass = 0; pass < 3; pass++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const a = next.length ? next[next.length - 1] : out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) continue;
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 1e-4 * Math.hypot(c[0] - a[0], c[1] - a[1])) continue;
      next.push(b);
    }
    if (next.length === out.length || next.length < 3) { out = next.length >= 3 ? next : out; break; }
    out = next;
  }
  return out;
}

export function megaVoidParts(short) {
  const [a, b] = MEGA_OVAL.steps[short], h = MEGA_NECK.steps[short];
  const oval = Array.from({ length: 64 }, (_, i) => { const t = (i / 64) * Math.PI * 2; return nw(MEGA_OVAL.u + a * Math.cos(t), MEGA_OVAL.v + b * Math.sin(t)); });
  const neck = [[MEGA_NECK.u0, -h], [MEGA_NECK.u1, -h], [MEGA_NECK.u1, h], [MEGA_NECK.u0, h]].map(([u, v]) => nw(u, v));
  const t = MEGA_THROAT, th = t.steps[short], sq = ([x, z]) => [x - 220, z - 200];
  const throat = [[t.x0, -th], [t.x1, t.z1 - th], [t.x1, t.z1 + th], [t.x0, th]].map(sq);
  // 东南翼长廊：两头半圆
  const stadium = (g, F) => { const gh = g.steps[short], arc = (cu, a0) => Array.from({ length: 13 }, (_, i) => { const a = a0 + (i / 12) * Math.PI; return [cu + Math.cos(a) * gh, Math.sin(a) * gh]; });
    return [...arc(g.u1 - gh, -Math.PI / 2), ...arc(g.u0 + gh, Math.PI / 2)].map(([u, v]) => toW(F, u, v)); };
  const galleria = stadium(SE_GALLERIA, SE_FRAME), west = stadium(W_GALLERIA, W_FRAME);
  return { oval, neck, throat, galleria, west };
}

/** 多边形集合 → 不带洞的简单多边形（带洞的块从洞的中线竖切开） */
function noHoles(mp, depth = 0) {
  const out = [];
  for (const poly of mp) {
    if (poly.length === 1 || depth > 8) { const p = open(poly[0]); if (Math.abs(area(p)) >= 1) out.push(p); continue; }
    const xs = poly[1].map((q) => q[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const zs = poly[0].map((q) => q[1]), z0 = Math.min(...zs) - 1, z1 = Math.max(...zs) + 1, xa = Math.min(...poly[0].map((q) => q[0])) - 1, xb = Math.max(...poly[0].map((q) => q[0])) + 1;
    for (const half of [[[xa, z0], [cx, z0], [cx, z1], [xa, z1]], [[cx, z0], [xb, z0], [xb, z1], [cx, z1]]]) out.push(...noHoles(clipping.intersection([poly], [close(half)]), depth + 1));
  }
  return out;
}
const INFILL_BOX = (() => { const pts = [...INFILL.A, ...INFILL.B]; return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]; })();
const bboxHit = (p, [x0, z0, x1, z1]) => p.some(([x, z]) => x >= x0 && x <= x1 && z >= z0 && z <= z1) || (Math.min(...p.map((q) => q[0])) < x1 && Math.max(...p.map((q) => q[0])) > x0 && Math.min(...p.map((q) => q[1])) < z1 && Math.max(...p.map((q) => q[1])) > z0);
const inside = ([x, z], P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const hit = (a, b) => clipping.intersection([[close(a)]], [[close(b)]]).length > 0;

/** 多边形往里收 m 米（凸多边形，判相邻是否真的压上用） */
const shrink = (P, m) => grow(P, -m);
const boxOf = (P, m) => { const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]); return [Math.min(...xs) - m, Math.min(...zs) - m, Math.max(...xs) + m, Math.max(...zs) + m]; };
/** 凸多边形（楼梯、井道都是斜放的矩形）往外扩 m 米：每条边平移后相邻两条求交 */
function grow(P, m) {
  const n = P.length, sgn = area(P) > 0 ? 1 : -1, lines = [];
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (sgn * (b[1] - a[1])) / L, nz = (-sgn * (b[0] - a[0])) / L; lines.push([[a[0] + nx * m, a[1] + nz * m], [b[0] + nx * m, b[1] + nz * m]]); }
  return lines.map((l, i) => { const k = lines[(i + n - 1) % n], [p, q] = k, [r, t] = l, d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]); if (Math.abs(d) < 1e-9) return l[0]; const u = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d; return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]; });
}
const boxAround = (pts, m) => { const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]); const x0 = Math.min(...xs) - m, x1 = Math.max(...xs) + m, z0 = Math.min(...zs) - m, z1 = Math.max(...zs) + m; return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; };
/** 这一层要留出来的楼梯、电梯、扶梯范围（外扩：楼梯 3 米、电梯 3.5 米、扶梯 3 米） */
export function keepOuts(layout, lv, { forVoid = false } = {}) {
  const out = [];
  for (const s of layout.stairs || []) if (s.poly && (s.serves || []).includes(lv.id)) out.push(grow(s.poly, 3));
  // 卫生间、核心筒用房（西北翼那两间在洞口里，本来就要拆）：开洞时绕开，门前留 2 米
  if (forVoid) for (const r of lv.rooms || []) if (!['NW-core', 'NW-wc'].includes(r.id)) for (const p of r.polys || []) if (p.length === 4) out.push(grow(p, 2));
  for (const e of layout.elevators || []) if ((e.serves || []).includes(lv.id)) { const p = e.shaftPoly || (e.frame && e.w ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => toW(e.frame, e.lu + (a * e.w) / 2, e.lv + (b * e.d) / 2)) : null); if (p) out.push(grow(p, 3.5)); }
  // 扶梯：沿梯身的斜矩形（两边各 1.5 米，两头各留 3 米梯口），不用外接方框（45° 的翼楼里外接方框大得多）
  // 中庭退台扶梯（MEGA-X）本来就是从洞口里往上爬的：开洞时不躲它们（扶梯洞另算）
  for (const e of layout.escalators || []) if ((e.from === lv.id || e.to === lv.id) && !(forVoid && /MEGA-X/.test(e.pair))) {
    const ax = e.top.x - e.bottom.x, az = e.top.z - e.bottom.z, L = Math.hypot(ax, az) || 1, ux = ax / L, uz = az / L, h = 1.5 + (e.width || 1.2) / 2;
    const a = [e.bottom.x - ux * 3, e.bottom.z - uz * 3], b = [e.top.x + ux * 3, e.top.z + uz * 3];
    out.push([[a[0] - uz * h, a[1] + ux * h], [b[0] - uz * h, b[1] + ux * h], [b[0] + uz * h, b[1] - ux * h], [a[0] + uz * h, a[1] - ux * h]]);
  }
  return out;
}

/** 楼板上互相压着的洞（扶梯开洞伸进中庭洞口）并成一个：三角剖分遇到重叠的洞会把整个洞补上（从下面看中庭顶上成了一整块天花） */
function mergeOverlapping(list) {
  const out = list.slice();
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      let both;
      try { if (!hit(out[i], out[j])) continue; both = clipping.union([[close(out[i])]], [[close(out[j])]]); } catch { continue; }
      if (both.length !== 1) continue;
      out[i] = clean(open(both[0][0]));
      out.splice(j, 1);
      j = i;
    }
  }
  return out;
}

/** 大椭圆中庭顶上的玻璃天窗（屋面开洞）：比 6F 洞口每边收 5 米，避开屋面的楼梯、电梯、扶梯和用房 */
export const MEGA_SKY = { a: 37, b: 25, neck: [40, 56, 6] };
function convexHull(P) {
  const pts = P.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()) { while (hi.length >= 2 && cr(hi.at(-2), hi.at(-1), p) <= 0) hi.pop(); hi.push(p); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
/** 天窗外圈补回屋顶花园：天窗压掉的咖啡座（两张圆桌 + 木平台）沿天窗外 7 米、16 米两圈重新摆，花池沿上下两条长边摆一排。
 * 只放在真屋面上：避开洞口、用房、铺位、已有屋面设施和导航障碍、光穹柱环、方庭天幕。桌子和花池都是导航障碍。 */
function roofRing(lv) {
  const dome = lv.features.find((f) => f.type === 'art-dome'), canopy = lv.features.find((f) => f.type === 'glass-canopy');
  const onDeck = (p) => lv.slab.pieces.some((sp) => inside(p, sp.outer) && !(sp.holes || []).some((h) => inside(p, h))) && !lv.voids.some((v) => inside(p, v.poly));
  const taken = [...(lv.rooms || []).flatMap((r) => r.polys || []), ...lv.units.flatMap((x) => x.polys),
    ...lv.features.filter((f) => f.rect && f.frame).map((f) => grow(lrectPoly(f.frame, f.rect), 0.8)),
    ...(lv.navObstacles || []).map((o) => boxAround(o.poly, 0.6)), ...(canopy ? [rectPoly(canopy.rect)] : [])];
  const free = (P) => {
    const xs = P.map((q) => q[0]), zs = P.map((q) => q[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs) + 1e-6; x += 0.8) for (let z = Math.min(...zs); z <= Math.max(...zs) + 1e-6; z += 0.8) if (inside([x, z], P) && !onDeck([x, z])) return false;
    if (!grow(P, 0.6).every((q) => onDeck(q))) return false;
    if (dome && P.some(([x, z]) => Math.hypot(x - dome.cx, z - dome.cz) < dome.radius + 4.5)) return false;
    return !taken.some((t) => hit(t, grow(P, 0.5)));
  };
  const add = (f, poly, obstacles) => { lv.features.push(f); taken.push(grow(poly, 0.5)); lv.navObstacles.push(...obstacles); };
  const { a, b } = MEGA_SKY;
  for (const [d, n] of [[7, 28], [16, 36]]) for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2, u = MEGA_OVAL.u + (a + d) * Math.cos(t), v = MEGA_OVAL.v + (b + d) * Math.sin(t);
    const r = rect(u - 3.25, v - 2.4, u + 3.25, v + 2.4), poly = lrectPoly(NW_FRAME, r);
    if (!free(poly)) continue;
    const tablesAt = [0.27, 0.73].map((q) => toW(NW_FRAME, r.x0 + (r.x1 - r.x0) * q, (r.z0 + r.z1) / 2));
    add({ type: 'cafe-cluster', frame: NW_FRAME, rect: r, expansion: true, mega: true, tablesAt }, poly, tablesAt.map(([x, z]) => ({ id: 'P1-RF-cafe-table', poly: circlePoly(x, z, 1.15, 10) })));
  }
  for (const s of [-1, 1]) for (let u = MEGA_OVAL.u - 16; u <= MEGA_OVAL.u + 16; u += 8) {
    const v = MEGA_OVAL.v + s * (b + 2.6), r = rect(u - 2.1, v - 0.75, u + 2.1, v + 0.75), poly = lrectPoly(NW_FRAME, r);
    if (free(poly)) add({ type: 'planter-bed', frame: NW_FRAME, rect: r, tree: u === MEGA_OVAL.u, expansion: true, mega: true }, poly, [{ id: 'P1-RF-planter', poly }]);
  }
}

function megaSkylight(layout, lv) {
  const { a, b } = MEGA_SKY;
  const ell = Array.from({ length: 72 }, (_, i) => { const t = (i / 72) * Math.PI * 2; return nw(MEGA_OVAL.u + a * Math.cos(t), MEGA_OVAL.v + b * Math.sin(t)); });
  const neck = [[MEGA_SKY.neck[0], -MEGA_SKY.neck[2]], [MEGA_SKY.neck[1], -MEGA_SKY.neck[2]], [MEGA_SKY.neck[1], MEGA_SKY.neck[2]], [MEGA_SKY.neck[0], MEGA_SKY.neck[2]]].map(([u, v]) => nw(u, v));
  let sky = clipping.union([[close(ell)]], [[close(neck)]]);
  const all = [ell, neck], near = (k) => all.some((P) => hit(k, P));
  const off = (P, m) => (P.length === 4 ? grow(P, m) : boxAround(P, m));
  const avoid = [...keepOuts(layout, lv, { forVoid: true }), ...lv.voids.map((v) => off(v.poly, 1.5)),
    ...lv.units.flatMap((x) => x.polys.map((p) => off(p, 2))), ...(lv.rooms || []).flatMap((r) => (r.polys || []).map((p) => off(p, 2)))];
  for (const k of avoid) { if (!near(k)) continue; try { sky = clipping.difference(sky, [[close(k)]]); } catch { /* 跳过 */ } }
  sky = clipping.intersection(sky, [[close(lv.outline)]]);
  // 天窗下面必须是 6F 的中庭洞口（6F 上还躲了几处电梯、用房，屋面上没有）
  const six = layout.levels.find((l) => l.building === 'P1' && l.short === '6F');
  const atria = (six?.voids || []).filter((v) => v.kind === 'atrium');
  if (atria.length) { try { sky = clipping.intersection(sky, clipping.union(...atria.map((v) => [[close(v.poly)]]))); } catch { /* 保留原样 */ } }
  const pieces = sky.map((m) => clean(open(m[0]))).filter((p) => Math.abs(area(p)) > 50).sort((p, q) => Math.abs(area(q)) - Math.abs(area(p)));
  return pieces[0] || null;
}

/** 这一层新加的洞口（椭圆 ∪ 颈 − 楼梯、电梯、扶梯留出的范围） */
export function addedVoid(layout, lv) {
  const { oval, neck, throat, galleria, west } = megaVoidParts(lv.short);
  let added = clipping.union([[close(oval)]], [[close(neck)]], [[close(throat)]], [[close(galleria)]], [[close(west)]]);
  // 扶梯口落在新洞口中间（东南翼、西翼街心的扶梯）：在梯口外加一道 4 米宽、横跨洞口的连桥，接到两边走廊，梯口不会悬空
  const raw = added, inRaw = (q) => raw.some((m) => inside(q, open(m[0])) && !m.slice(1).some((h) => inside(q, open(h))));
  const bridges = [];
  for (const e of layout.escalators || []) {
    if (/MEGA-X/.test(e.pair)) continue;
    const ax = e.top.x - e.bottom.x, az = e.top.z - e.bottom.z, L = Math.hypot(ax, az) || 1, ux = ax / L, uz = az / L;
    for (const [p, sgn, here] of [[e.bottom, -1, e.from === lv.id], [e.top, 1, e.to === lv.id]]) {
      if (!here || !inRaw([p.x, p.z])) continue;
      const c = [p.x + ux * sgn * 2, p.z + uz * sgn * 2], hl = 15, hw = 2.5;
      bridges.push([[c[0] - ux * hw - uz * hl, c[1] - uz * hw + ux * hl], [c[0] + ux * hw - uz * hl, c[1] + uz * hw + ux * hl], [c[0] + ux * hw + uz * hl, c[1] + uz * hw - ux * hl], [c[0] - ux * hw + uz * hl, c[1] - uz * hw - ux * hl]]);
    }
  }
  for (const k of [...keepOuts(layout, lv, { forVoid: true }), ...bridges]) { try { added = clipping.difference(added, [[close(k)]]); } catch { /* 跳过 */ } }
  return added;
}
/** 布尔运算前坐标取整到 0.1 mm；算完把落在原有顶点 0.3 mm 内的点还原成原值（门洞、连廊端头要和楼板边严丝合缝） */
function unsnapper(...polysList) {
  const m = new Map();
  for (const P of polysList.flat()) for (const q of P || []) m.set(`${Math.round(q[0] * 1e4)},${Math.round(q[1] * 1e4)}`, q);
  return (P) => P.map((q) => { const k = (dx, dz) => m.get(`${Math.round(q[0] * 1e4) + dx},${Math.round(q[1] * 1e4) + dz}`);
    for (const dx of [0, -1, 1, -2, 2, -3, 3]) for (const dz of [0, -1, 1, -2, 2, -3, 3]) { const r = k(dx, dz); if (r) return [r[0], r[1]]; } return q; });
}
const mpArea = (mp) => mp.reduce((n, poly) => n + poly.reduce((m, ring, i) => m + (i ? -1 : 1) * Math.abs(area(open(ring))), 0), 0);
const overlapArea = (a, mp) => { try { return mpArea(clipping.intersection([[close(a)]], mp)); } catch { return 0; } };

export function applyP1Mega(layout) {
  const P1 = layout.buildings.find((b) => b.id === 'P1');
  if (!P1) return layout;
  const infill = [INFILL.A, INFILL.B].map(close);
  // 1F：2F 新洞口正下方的铺位拿掉，变成一条从方庭到圆厅的中庭广场
  const lv2 = layout.levels.find((l) => l.id === 'P1-2F');
  const plaza = lv2 ? addedVoid(layout, lv2) : [];
  const befores = {};
  // 楼栋外轮廓（总图、立面、屋面都用它）
  P1.outline = unsnapper([P1.outline], [INFILL.A, INFILL.B])(open(clipping.union([[close(P1.outline)]], ...infill.map((p) => [p]))[0][0]));
  for (const lv of layout.levels.filter((l) => l.building === 'P1' && ABOVE.includes(l.short))) {
    const before = lv.outline;
    const merged = clipping.union([[close(lv.outline)]], ...infill.map((p) => [p]));
    const fix = unsnapper([before], [INFILL.A, INFILL.B], lv.walk.map((w) => w.poly), lv.units.flatMap((x) => x.polys), lv.voids.map((v) => v.poly));
    lv.outline = fix(open(merged.sort((x, y) => Math.abs(area(open(y[0]))) - Math.abs(area(open(x[0]))))[0][0]));
    let holes = [], removed = [], oldVoidPolys = [], freed = [];
    if (UPPER.includes(lv.short)) {
      const old = lv.voids.filter((v) => v.id === 'C-void' || v.id === 'SQ-void');
      oldVoidPolys = old.map((v) => v.poly);
      // 新加的椭圆和颈避开这一层的楼梯、电梯、扶梯（各留出门前、梯口的站立空间）；原来的圆厅、方庭洞口不动
      const added = addedVoid(layout, lv);
      const u = clipping.union(...old.map((v) => [[close(v.poly)]]), ...added.map((piece) => [piece[0]]));
      const deck = old.find((v) => v.id === 'SQ-void')?.deck || null;
      lv.voids = lv.voids.filter((v) => v.id !== 'C-void' && v.id !== 'SQ-void');
      // 合起来的洞口可能是一块，也可能还分成几块（低层的方庭、圆厅洞口还没连上椭圆）：每块单独一个记录，
      // 含圆厅圆心的叫 C-void，含方庭中心的叫 SQ-void（两个都含就叫 C-void），其余叫 MEGA-void
      const rc = toW(NW_FRAME, 0, 0), sc = [-220, -200];
      u.forEach((piece, i) => {
        const poly = clean(open(piece[0]));
        const hasC = inside(rc, poly), hasS = inside(sc, poly);
        const id = hasC ? 'C-void' : hasS ? 'SQ-void' : `MEGA-void${i ? `-${i}` : ''}`;
        // 合进来的原洞口记录留在 parts 里（rect、frame 还是原来的，测试和渲染按部件查）
        const parts = old.filter((v) => inside(mid(v.poly), poly));
        const head = parts.find((v) => v.id === id);
        lv.voids.push({ ...(head || {}), id, kind: 'atrium', poly, frame: head?.frame || NW_FRAME, mega: true, square: hasS, deck: hasS ? deck : null, parts });
        holes.push(poly);
      });
      const poly = holes[0];
      // 东南翼、西翼两侧铺位：长廊变宽以后店面往后退（门脸离洞口 4 米），剩下的进深 ≥ 7 米就留着，让出来的那条变成走道
      for (const [wing, g] of [['SE', SE_GALLERIA], ['W', W_GALLERIA]]) {
        const hw = g.steps[lv.short] + 4;
        for (const x of lv.units.filter((q) => q.wing === wing && q.rects?.length === 1 && !q.mega)) {
          const r = x.rects[0];
          if (r.x1 <= g.u0 || r.x0 >= g.u1) continue;
          const north = r.z0 >= 0, nr = north ? { ...r, z0: Math.max(r.z0, hw) } : { ...r, z1: Math.min(r.z1, -hw) };
          if ((north && nr.z0 === r.z0) || (!north && nr.z1 === r.z1) || r.z0 < 0 && r.z1 > 0) continue;
          if (nr.z1 - nr.z0 < 7) continue;
          freed.push(...x.polys);
          x.rects = [nr]; x.polys = [lrectPoly(x.frame, nr)];
          x.fronts = x.fronts.map((f) => (f.side === 'N' && north ? { ...f, z0: nr.z0, z1: nr.z0 } : f.side === 'S' && !north ? { ...f, z0: nr.z1, z1: nr.z1 } : f.side === 'W' || f.side === 'E' ? { ...f, z0: Math.max(f.z0, nr.z0), z1: Math.min(f.z1, nr.z1) } : f));
          x.wfronts = x.fronts.map((f) => lseg(x.frame, f));
        }
      }
      // 洞口里的铺位、卫生间、客梯厅去掉
      removed = lv.units.filter((x) => x.polys.some((p) => holes.some((h) => hit(p, h))));
      lv.units = lv.units.filter((x) => !removed.includes(x));
      lv.rooms = (lv.rooms || []).filter((r) => !(['NW-core', 'NW-wc'].includes(r.id)));
    } else if (lv.short === '1F' && plaza.length) {
      removed = lv.units.filter((x) => x.polys.some((p) => overlapArea(p, plaza) > 1));
      lv.units = lv.units.filter((x) => !removed.includes(x));
    } else if (lv.kind === 'roof') {
      // 西北翼核心筒的客梯只到 1F 了，屋面上那间电梯机房也拆掉（腾给天窗）
      lv.rooms = (lv.rooms || []).filter((r) => !(['NW-core', 'NW-wc'].includes(r.id)));
      // 原来西北翼屋面那条小天窗在大天窗里面，拆掉（屋面开洞一起去掉）
      const oldSky = lv.voids.filter((v) => v.id === 'NW-sky-44');
      lv.voids = lv.voids.filter((v) => !oldSky.includes(v));
      for (const piece of lv.slab?.pieces || []) piece.holes = (piece.holes || []).filter((h) => !oldSky.some((v) => v.poly === h));
      const sky = megaSkylight(layout, lv);
      if (sky) {
        holes.push(sky);
        lv.voids.push({ id: 'MEGA-sky', kind: 'skylight', poly: sky, frame: NW_FRAME, mega: true, oval: { u: MEGA_OVAL.u, v: MEGA_OVAL.v, a: MEGA_SKY.a, b: MEGA_SKY.b } });
        // 天窗压到的屋顶花园（咖啡座、花池）和它们的导航障碍一起拿掉
        const zone = grow(sky.length > 3 ? convexHull(sky) : sky, 1);
        const gone = (P) => P && hit(P, zone);
        lv.features = lv.features.filter((f) => !(f.expansion && f.rect && f.frame && gone(lrectPoly(f.frame, f.rect))));
        lv.navObstacles = (lv.navObstacles || []).filter((o) => !gone(o.poly));
        // 方庭天台的露天影院原来压在椭圆西北头上：整块往北挪（尺寸不变），挪过去压到的咖啡座也拿掉
        const cine = lv.features.find((f) => f.type === 'cinema-open' && f.rect && hit(rectPoly(f.rect), zone));
        if (cine) {
          cine.rect = rect(-191, -239.5, -167, -210);
          const area0 = grow(rectPoly(cine.rect), 0.8);
          lv.features = lv.features.filter((f) => f === cine || !(f.expansion && f.rect && f.frame && hit(lrectPoly(f.frame, f.rect), area0)));
          lv.navObstacles = lv.navObstacles.filter((o) => !hit(o.poly, area0));
        }
      }
    }
    befores[lv.id] = before;
    // 3F 以上的一期立面（退台的「艺术露台」外墙）也把 A、B 并进去，不然原来西北翼的外墙会画在中庭里
    const X = lv.expansion;
    if (X) {
      const grow = (list) => { try { return clipping.union(...list.map((q) => [close(q)]), ...infill.map((q) => [q])).map((m) => fix(open(m[0]))); } catch { return list; } };
      if (X.facadePolys?.length) { X.facadePolys = grow(X.facadePolys); X.facadePoly = X.facadePolys.slice().sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0]; }
      if (X.floorPolys?.length) X.floorPolys = grow(X.floorPolys);
    }
    // 楼板：只改主楼板（外轮廓那一块）；其它块（楼梯薄平台、连廊、车库小厅等）原样保留。
    // 主楼板上的洞：原圆厅、方庭洞口换成合并后的洞口，其余（井道、扶梯开洞、塔楼底板）留着
    const pieces = lv.slab?.pieces || [];
    const main = pieces.find((p) => p.outer === before) || pieces.slice().sort((x, y) => Math.abs(area(y.outer)) - Math.abs(area(x.outer)))[0];
    if (main) {
      const centroid = (P) => [P.reduce((a, q) => a + q[0], 0) / P.length, P.reduce((a, q) => a + q[1], 0) / P.length];
      main.outer = lv.outline;
      if (holes.length) {
        // 合并后的洞口代替原来的圆厅、方庭洞口；落在新洞口里的小洞（井道、开洞）不要了
        const rest = (main.holes || []).filter((h) => !oldVoidPolys.includes(h) && !holes.some((H) => inside(centroid(h), H)));
        main.holes = mergeOverlapping([...rest, ...holes]);
      }
    } else lv.slab = { pieces: [{ outer: lv.outline, holes: lv.voids.map((v) => v.poly) }] };
    // 走道：原来的走道减去洞口，再加上 A、B 两块（减去洞口、铺位、井道、扶梯开洞）
    const cut = [...holes, ...lv.voids.filter((v) => v.kind === 'shaft' || v.kind === 'escalator' || v.kind === 'stair').map((v) => v.poly),
      ...lv.units.flatMap((x) => x.polys)];
    const walk = [];
    for (const w of lv.walk) {
      if (!holes.length || !holes.some((h) => hit(w.poly, h))) { walk.push(w); continue; }
      noHoles(clipping.difference([[close(w.poly)]], ...holes.map((h) => [[close(h)]]))).forEach((p, i) => walk.push({ ...w, id: `${w.id}-m${i}`, poly: fix(p), rect: undefined, lpoly: undefined }));
    }
    // 原来的走道都在改造前的楼层轮廓里，新走道 = A、B − 原轮廓 − 洞口、铺位、井道
    // 一块一块减（一次减几百个多边形 polygon-clipping 容易算不出来）；只减和 A、B 有交的
    let add = clipping.difference(clipping.union(...infill.map((p) => [p])), [[close(before)]]);
    // 去掉的铺位原地变成走道（铺位里原来没有走道）
    for (const x of removed) for (const p of x.polys) { try { add = clipping.union(add, [[close(p)]]); } catch { /* 跳过 */ } }
    for (const p of freed) { try { add = clipping.union(add, [[close(p)]]); } catch { /* 跳过 */ } }
    for (const r of (lv.rooms || []).filter((q) => q._megaRemoved)) for (const p of r._megaRemoved) { try { add = clipping.union(add, [[close(p)]]); } catch { /* 跳过 */ } }
    // 只减和新加走道有交的（A、B 加上让出来的铺位范围）
    const extra = [...removed.flatMap((x) => x.polys), ...freed].map((p) => boxOf(p, 0.5));
    for (const c of cut) {
      if (!bboxHit(c, INFILL_BOX) && !extra.some((b) => bboxHit(c, b))) continue;
      try { add = clipping.difference(add, [[close(c)]]); } catch { /* 极少数共线边算不出来：跳过这一块，走道略大一点 */ }
    }
    noHoles(add).forEach((p, i) => walk.push({ id: `P1-mega-${lv.short}-${i}`, kind: lv.kind === 'roof' ? 'deck' : 'atrium', poly: fix(p), frame: NW_FRAME, mega: true }));
    lv.walk = walk;
    // 屋面：楼板并进 A、B 以后，再沿天窗外圈补回咖啡座和花池
    if (lv.kind === 'roof' && lv.voids.some((v) => v.id === 'MEGA-sky')) roofRing(lv);
  }
  // 西北翼两部客梯：洞口里只到 1F
  for (const e of layout.elevators.filter((q) => q.id === 'P1-NW-L1' || q.id === 'P1-NW-L2')) e.serves = e.serves.filter((id) => !UPPER.some((s) => id === `P1-${s}`) && id !== 'P1-RF');
  layout.fidelity = { ...(layout.fidelity || {}), mega: { version: 1, links: [], indoorFountains: [], gaps: [], shops: 0 } };
  megaSite(layout, plaza);
  // 3F 以上的立面导航墙按并进 A、B 以后的立面重算（原来那条西北翼外墙会把新楼面拦断）
  for (const lv of layout.levels.filter((l) => befores[l.id] && l.expansion?.facadePolys && l.navWalls)) {
    lv.navWalls = lv.navWalls.filter((w) => !w.facade).concat(expansionFacadeWalls(lv, layout.entrances));
  }
  megaShops(layout, befores, plaza);
  megaSideFronts(layout);
  megaIslands(layout, befores);
  for (const lv of layout.levels.filter((l) => befores[l.id])) pruneIslands(lv);
  return layout;
}

const strip = (a, b, width) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return lrectPoly(frame(...a, (Math.atan2(dz, dx) * 180) / Math.PI), rect(-0.03, -width / 2, Math.hypot(dx, dz) + 0.03, width / 2));
};
const inInfill = ([x, z]) => [INFILL.A, INFILL.B].some((P) => inside([x, z], P));
const midSeg = (g) => [(g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2];

/** A、B 盖住的室外东西：
 *  · 二层两座艺术环廊天桥（P1-ART-C：方庭东门→艺文馆 P1C；P1-ART-W-RETURN：西苑 P1W4→西翼）整段落在新楼板上，
 *    拆掉桥，换成楼板直接到附楼外墙上的门（P1C 南墙 z=−207、P1W4 东墙 x=−210）；
 *  · 首层：方庭东门（P1-SQ-E）、北庭阅读步道、方庭到南边活动区的步道（square-events）都在楼里了，去掉；
 *    艺文馆南门（P1C-S）改成直接进商场；两处庭院喷泉变成室内喷泉（首层导航障碍）；
 *  · 西门（P1-WEST-ART）挪到 B 的西墙上（西苑两栋附楼 P1W2、P1W4 之间的缺口，正对原来的艺术步道），步道截短。 */
function megaSite(layout, plaza) {
  const M = layout.fidelity.mega, S = layout.site, fc = S.forecourt;
  const level = (id) => layout.levels.find((l) => l.id === id);
  const ent = (id) => layout.entrances.find((e) => e.id === id);
  const dropEnt = (ids) => { layout.entrances = layout.entrances.filter((e) => !ids.includes(e.id)); };
  // ---- 二层天桥 → 外墙上的门
  const bridges = [
    { id: 'P1-ART-C', p1: 'P1-2F', annex: 'P1C-2F', seg: null, drop: ['start'] },
    { id: 'P1-ART-W-RETURN', p1: 'P1-2F', annex: 'P1W4-2F', seg: { x0: -210, z0: -116.4, x1: -210, z1: -112.6 }, n: [-1, 0], drop: ['start'] },
  ];
  for (const b of bridges) {
    const path = layout.extensions.paths.find((q) => q.id === b.id);
    if (!path) continue;
    layout.extensions.paths = layout.extensions.paths.filter((q) => q !== path);
    layout.expansion.routes = (layout.expansion.routes || []).filter((r) => r.id !== b.id);
    for (const lv of layout.levels) if (lv.walk?.some((w) => w.id.startsWith(`${b.id}-walk-`))) lv.walk = lv.walk.filter((w) => !w.id.startsWith(`${b.id}-walk-`));
    dropEnt(b.drop.map((k) => `${b.id}-${k}`));
    const target = ent(`${b.id}-target`), arrival = ent(`${b.id}-arrival`);
    if (b.seg) {
      // 原来门在西翼（P1 一侧）：挪到 P1W4 东墙。target 在 P1 楼层上、朝 P1W4；arrival 在 P1W4 上、朝 P1
      Object.assign(target, { level: b.p1, to: b.annex, building: 'P1', seg: { ...b.seg }, nx: b.n[0], nz: b.n[1], width: 3.8 });
      Object.assign(arrival, { level: b.annex, to: b.p1, building: arrival.building, seg: { ...b.seg }, nx: -b.n[0], nz: -b.n[1], width: 3.8 });
      // P1W4 上原来的「起点」门（target 的楼层）现在由 arrival 提供；P1W4 的内退立面门洞（inner-owner）留着
    }
    const c = (layout.extensions.connections || []).find((q) => q.id === b.id);
    const seg = (b.seg || target.seg);
    if (c) Object.assign(c, { from: b.p1, to: b.annex, seg: { ...seg } });
    M.links.push({ id: b.id, from: b.p1, to: b.annex, seg: { ...seg }, doors: [target.id, arrival.id] });
  }
  // ---- 首层：方庭东门、P1C 南门
  dropEnt(['P1-SQ-E']);
  const c1 = ent('P1C-S');
  if (c1) {
    c1.to = 'P1-1F'; c1.name = '艺文馆南门 · 商场中庭'; c1.mega = true;
    layout.entrances.push({ ...c1, id: 'P1-MEGA-P1C', building: 'P1', level: 'P1-1F', to: c1.level, nx: -c1.nx, nz: -c1.nz, main: false, name: '艺文馆 · 方庭阅读馆', mega: true });
    M.links.push({ id: 'P1-MEGA-P1C', from: 'P1-1F', to: c1.level, seg: { ...c1.seg }, doors: ['P1-MEGA-P1C', 'P1C-S'] });
  }
  // ---- 室外步道、场地：去掉落在 A、B 里的
  const gonePaths = new Set(['square-events', 'north-reading']);
  fc.paths = fc.paths.filter((q) => !gonePaths.has(q.id));
  S.walk = S.walk.filter((w) => !(w.id === 'P1C-arrival' || [...gonePaths].some((g) => w.id.startsWith(`${g}-`))));
  // ---- 庭院喷泉进室内
  const lv1 = level('P1-1F'), D = layout.fidelity.landscape;
  // 两处庭院喷泉搬进 1F 中庭广场（大椭圆正下方，沿中轴一前一后）
  const spots = MEGA_FOUNTAINS.map(([u, v]) => nw(u, v));
  for (const f of D?.fountains || []) {
    if (!inInfill([f.x, f.z])) continue;
    const [x, z] = spots[M.indoorFountains.length] || [f.x, f.z];
    Object.assign(f, { x, z, poly: circlePoly(x, z, f.r + 0.4, 20), indoor: true, level: 'P1-1F' });
    fc.obstacles = fc.obstacles.filter((o) => o.id !== f.id);
    (lv1.navObstacles ||= []).push({ id: `P1-mega-${f.id}`, poly: f.poly });
    M.indoorFountains.push(f.id);
  }
  // 1F 中庭广场：原来西北翼走道的地毯条去掉（一整片广场铺地）；喷泉周围一圈棕榈、樱花树池（导航障碍），中间留出 4 米以上的口子
  for (const w of lv1.walk) if (w.rect && overlapArea(w.poly, plaza) > 1) { w.rect = undefined; w.plaza = true; }
  const fountains = (D?.fountains || []).filter((f) => f.indoor);
  const blocked = [...lv1.units.flatMap((x) => x.polys), ...keepOuts(layout, lv1), ...(lv1.rooms || []).flatMap((r) => r.polys || [])];
  M.plaza = { trees: [] };
  for (const f of fountains) {
    const R = f.r + 3.4, n = 8;
    for (let i = 0; i < n; i++) {
      // 樱花树池外再围一圈 0.55 米宽的环形木座椅（障碍跟着放大）
      const a = (i / n) * Math.PI * 2 + 0.2, x = f.x + Math.cos(a) * R, z = f.z + Math.sin(a) * R, r = 1.4, bench = i % 2 === 1;
      const poly = circlePoly(x, z, r + (bench ? 0.55 : 0), 16);
      if (!plaza.some((m) => inside([x, z], open(m[0])))) continue;
      if (blocked.some((b) => hit(poly, b))) continue;
      if ((lv1.navObstacles || []).some((o) => hit(poly, o.poly))) continue;
      const kind = i % 2 ? 'blossom' : 'palm';
      M.plaza.trees.push({ id: `P1-mega-${kind}-${M.plaza.trees.length}`, kind, x, z, r, bench });
      lv1.navObstacles.push({ id: `P1-mega-${kind}-${M.plaza.trees.length - 1}`, poly });
    }
  }
  // ---- 东南主入口落客环岛：门正前方是地铁 A 口，环岛放在 A 口东侧（外径 20 米、中间花坛岛），
  // 一条双向短支路接云澜大道；门口雨棚接一条风雨连廊，沿 A 口东北侧走到环岛上下客点
  const seDoor = ent('P1-SE');
  if (seDoor && D) {
    const [mx, mz] = midSeg(seDoor.seg), R = 10, cx = -22.5, cz = -26;
    const loop = { id: 'SE-dropoff', name: '东南主入口落客环岛', rect: rect(cx - R, cz - R, cx + R, cz + R), corner: R, cx, cz, planter: [4.6, 4.6], R };
    loop.poly = circlePoly(cx, cz, R, 40);
    loop.planterPoly = circlePoly(cx, cz, 4.9, 28);
    loop.spur = rect(cx - 5, cz + R - 2, cx + 5, -14);
    // 雨棚顺着东南翼轴线：门外 0.3–7 米、横向 ±7 米（东南翼局部坐标）；连廊再往外接到环岛边
    const [du] = toL(SE_FRAME, mx, mz), [lu] = toL(SE_FRAME, cx, cz);
    loop.canopy = { frame: SE_FRAME, u0: du + 0.3, u1: du + 7, v0: -7, v1: 7, height: 5.2 };
    // 顶棚伸出路缘 1.2 米罩住上下客车位，柱子留在路缘里面
    loop.walkway = { frame: SE_FRAME, u0: du + 7, u1: lu - R + 1.2, postEnd: lu - R - 0.5, v0: -5, v1: 1.5, height: 4.4 };
    // 柱子（两侧，每段不超过 8 米）也是行人障碍
    for (const c of [loop.canopy, loop.walkway]) {
      const end = c.postEnd ?? c.u1 - 0.4, n = Math.max(1, Math.ceil((end - c.u0 - 0.5) / 8));
      c.posts = [];
      for (let i = 0; i <= n; i++) {
        const u = c.u0 + 0.5 + (end - c.u0 - 0.5) * i / n;
        if (c === loop.canopy && i === 0) continue; // 门口那排柱子不立（贴着门）
        if (c === loop.walkway && i === 0) continue; // 和门口雨棚外沿的柱子重合
        for (const v of [c.v0 + 0.4, c.v1 - 0.4]) c.posts.push([u, v]);
      }
      for (const [i, [u, v]] of c.posts.entries()) fc.obstacles.push({ id: `SE-canopy-post-${c === loop.canopy ? 'd' : 'w'}${i}`, poly: circlePoly(...toW(SE_FRAME, u, v), 0.2, 8) });
    }
    S.driveways.push(loop.poly, rectPoly(loop.spur));
    fc.obstacles.push({ id: 'SE-dropoff-planter', poly: loop.planterPoly });
    // 环岛范围里的行道树挪走
    const gone = new Set();
    D.trees = (D.trees || []).filter((t) => { const hitLoop = Math.hypot(t.x - cx, t.z - cz) < R + 1.2 || (t.x > loop.spur.x0 - 1.2 && t.x < loop.spur.x1 + 1.2 && t.z > loop.spur.z0 - 1.2 && t.z < loop.spur.z1 + 1.2); if (hitLoop) gone.add(`belt-tree-${t.x.toFixed(1)}-${t.z.toFixed(1)}`); return !hitLoop; });
    fc.obstacles = fc.obstacles.filter((o) => !gone.has(o.id));
    D.seLoop = loop;
  }
  // ---- 西门挪到 B 西墙
  const W = layout.expansion.westArrival, e = W && ent(W.entry);
  if (e) {
    const Z = WEST_GATE_AXIS, zc = -127.5, half = 2.8;
    // 原来的西门厅（西北翼 NWR4 那头）留着当 B 区和西北翼之间的通道：门外 12 米内不排铺位
    const [ox, oz] = midSeg(e.seg);
    M.gaps.push({ level: e.level, poly: [[ox - 6, oz - 6], [ox + 6, oz - 6], [ox + 6, oz + 6], [ox - 6, oz + 6]].map(([x, z]) => [x + e.nx * 6, z + e.nz * 6]) });
    Object.assign(e, { seg: { x0: -210, z0: zc - half, x1: -210, z1: zc + half }, nx: -1, nz: 0, width: half * 2, mega: true });
    const P = W.path, old = P.polys;
    P.points = [[-210, zc], [-264, zc], [-269, Z], [-286, Z], [-298, Z]];
    P.polys = P.points.slice(1).map((q, i) => strip(P.points[i], q, P.width));
    P.crossingSegments = [3];
    S.walk = S.walk.filter((w) => !w.id.startsWith(`${P.id}-`));
    P.polys.forEach((poly, i) => S.walk.push({ id: `${P.id}-${i}`, kind: 'promenade', poly, outdoor: true }));
    S.activityExclusions = (S.activityExclusions || []).filter((q) => !old.includes(q));
    S.activityExclusions.push(...P.polys);
    Object.assign(W, { approach: [-214, zc], middle: [-210, zc], interior: [-203, zc], megaDoor: true });
  }
}


/** A、B 贴墙一圈铺位（1F–6F）：每段墙按 8.5 米开间、11 米进深排；离中庭洞口留 5 米走道，
 *  避开楼梯、电梯、扶梯、门、喷泉、原有铺位和用房；放不下的开间就空着当走道。品牌另起一个取名器（不动园区原来的取号顺序）。 */
function megaShops(layout, befores, plaza) {
  const picker = new BrandPicker(2031);
  for (const lv of layout.levels) for (const u of lv.units || []) if (u.brand) picker.mark(u.brand);
  const { depth: D, width: W, corridor: C, cats } = MEGA_SHOP;
  let k = 0;
  const M = layout.fidelity.mega;
  for (const lv of layout.levels.filter((l) => l.building === 'P1' && ['1F', ...UPPER].includes(l.short))) {
    const before = befores[lv.id];
    if (!before) continue;
    const atria = lv.voids.filter((v) => v.kind === 'atrium' || v.kind === 'skylight').map((v) => v.poly);
    const others = [...lv.voids.filter((v) => v.kind !== 'atrium' && v.kind !== 'skylight').map((v) => v.poly), ...keepOuts(layout, lv),
      ...(lv.rooms || []).flatMap((r) => r.polys || []), ...(lv.navObstacles || []).map((o) => o.poly)];
    const doors = layout.entrances.filter((e) => e.level === lv.id || e.to === lv.id).map((e) => { const [x, z] = midSeg(e.seg); return [[x - 4.5, z - 4.5], [x + 4.5, z - 4.5], [x + 4.5, z + 4.5], [x - 4.5, z + 4.5]]; });
    for (const g of M.gaps) if (g.level === lv.id) doors.push(g.poly);
    // 1F：2F 各个洞口正下方都是中庭广场，不放铺位
    if (lv.short === '1F') others.push(...(layout.levels.find((l) => l.id === 'P1-2F')?.voids || []).filter((v) => v.mega).map((v) => v.poly));
    // 中庭（1F 是广场）：环形店铺朝它开门
    const rings = lv.short === '1F' ? plaza.map((m) => open(m[0])) : lv.voids.filter((v) => v.mega).map((v) => v.poly);
    const strips = accessStrips(layout, lv, rings);
    M.strips = [...(M.strips || []), ...strips.map((poly) => ({ level: lv.id, poly }))];
    let n = 0;
    const add = (F0, r, wall) => {
      // 每家新铺位自己一个坐标系 id：隔墙、店面按 frame.id 分组，空 id 会把不同朝向的铺位并成一组、墙画到别处去
      const F = F0.id ? F0 : { ...F0, id: `${lv.id}-MG${String(n + 1).padStart(2, '0')}` };
      const poly = lrectPoly(F, r), cat = cats[k++ % cats.length], brand = picker.take(cat);
      brand.catLabel = CATEGORIES[cat]?.label || cat;
      const slot = `MG${String(++n).padStart(2, '0')}`;
      const fr = wall === 'ring' ? { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0, side: 'N' } : { x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1, side: 'S' };
      lv.units.push({ id: `${lv.id}-${slot}`, slot, level: lv.id, building: 'P1', brand, frame: F, rects: [r], fronts: [fr], style: 'glass', wing: 'NW', mega: wall,
        polys: [poly], wfronts: [lseg(F, fr)], code: `M${lv.short}-${String(n).padStart(2, '0')}` });
      lv.walk = lv.walk.flatMap((wk) => {
        if (!hit(wk.poly, poly)) return [wk];
        let res; try { res = clipping.difference([[close(wk.poly)]], [[close(poly)]]); } catch { return [wk]; }
        // 铺位和墙之间挤出来的细条（半宽不到 0.6 米或面积不到 8 平方米）不留
        return noHoles(res).filter((q) => { const A = Math.abs(area(q)); let per = 0; for (let j = 0; j < q.length; j++) { const a = q[j], b = q[(j + 1) % q.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); } return A >= 8 && (2 * A) / per >= 0.6; })
          .map((q, j) => ({ ...wk, id: `${wk.id}-s${n}-${j}`, poly: q, rect: undefined, lpoly: undefined }));
      });
      M.shops++;
    };
    const clashes = (poly) => others.some((h) => hit(poly, h)) || doors.some((h) => hit(poly, h)) || strips.some((h) => hit(poly, h))
      || lv.units.some((x) => x.polys.some((p) => hit(grow(poly, 0.02), p)));
    const inFloor = (F, r) => [0.05, 0.5, 0.95].every((t) => [r.z0 + 0.3, (r.z0 + r.z1) / 2, r.z1 - 0.3].every((v) => { const q = toW(F, r.x0 + (r.x1 - r.x0) * t, v); return inside(q, lv.outline) && (inInfill(q) || inBand(q) || megaZone(q)); }));
    // ① 环形店铺：沿中庭边每 9 米一间，门脸离洞口 7 米（回游走廊），进深尽量做深（16 → 10 米）
    const RC = MEGA_RING.corridor;
    for (const V of rings) {
      const per = V.reduce((a, q, i) => a + Math.hypot(V[(i + 1) % V.length][0] - q[0], V[(i + 1) % V.length][1] - q[1]), 0);
      const at = (d) => { d = ((d % per) + per) % per; for (let i = 0; i < V.length; i++) { const a = V[i], b = V[(i + 1) % V.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= l) return [a[0] + ((b[0] - a[0]) * d) / (l || 1), a[1] + ((b[1] - a[1]) * d) / (l || 1)]; d -= l; } return V[0]; };
      for (let d = 0; d < per; d += MEGA_RING.width) {
        let p0 = at(d), p1 = at(d + MEGA_RING.width);
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        if (len < 6) continue;
        let F = frame(p0[0], p0[1], (Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI);
        // 朝外：弧线中点往 +v 走 2 米要在洞口外面（弦的中点在凸弧里面，不能拿它判断）
        const pm = at(d + MEGA_RING.width / 2), vd = [-F.s, F.c];
        if (inside([pm[0] + vd[0] * 2, pm[1] + vd[1] * 2], V)) F = frame(p1[0], p1[1], (Math.atan2(p0[1] - p1[1], p0[0] - p1[0]) * 180) / Math.PI);
        for (const depth of MEGA_RING.depths) {
          const r = rect(0.2, RC, len - 0.2, RC + depth), poly = lrectPoly(F, r);
          if (!inFloor(F, r)) continue;
          if (atria.some((h) => hit(lrectPoly(F, rect(r.x0 - 0.5, RC - 1.5, r.x1 + 0.5, r.z1 + 0.3)), h))) continue;
          if (clashes(poly)) continue;
          add(F, r, 'ring');
          break;
        }
      }
    }
    // ② 贴墙铺位：只放在门前还留得出 5 米走道的地方（不对着环形店铺的背面）
    for (const wall of MEGA_SHOP_WALLS) {
      // 1F 西北翼北侧铺位已经让给中庭广场，A 西南这道墙在 1F 不存在
      if (wall.id === 'AS' && lv.short === '1F') continue;
      const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
      let F = frame(wall.a[0], wall.a[1], (Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]) * 180) / Math.PI);
      if (!inInfill(toW(F, len / 2, 1))) F = frame(wall.b[0], wall.b[1], (Math.atan2(wall.a[1] - wall.b[1], wall.a[0] - wall.b[0]) * 180) / Math.PI);
      const cnt = Math.max(1, Math.round(len / W)), w = len / cnt;
      for (let i = 0; i < cnt; i++) {
        // 进深能深就深（20 → 11 米），门前留 5 米走道
        for (const depth of [20, 17, 14, D]) {
          const r = rect(i * w + 0.15, 0.15, (i + 1) * w - 0.15, depth), poly = lrectPoly(F, r);
          const front = lrectPoly(F, rect(r.x0 - 1, 0.2, r.x1 + 1, depth + C));
          if (overlapArea(poly, [[close(before)]]) > 0.5) continue;
          if (![0.05, 0.5, 0.95].every((t) => [0.3, depth - 0.3].every((v) => inside(toW(F, r.x0 + (r.x1 - r.x0) * t, v), lv.outline)))) continue;
          if (atria.some((h) => hit(front, h))) continue;
          if (clashes(poly)) continue;
          if (lv.units.some((x) => x.polys.some((p) => overlapArea(lrectPoly(F, rect(r.x0, depth, r.x1, depth + C)), [[close(p)]]) > 0.5))) continue;
          add(F, r, wall.id);
          break;
        }
      }
    }
    // ③ 角落空地：整块都在外墙里、不碰别的东西、门口 1.5 米外是走道，才排一间
    for (const pk of MEGA_POCKETS) {
      const F = frame(pk.x0, pk.z0, 0), r = rect(0.15, 0.15, pk.x1 - pk.x0 - 0.15, pk.z1 - pk.z0), poly = lrectPoly(F, r);
      const probes = [0.1, 0.5, 0.9].flatMap((a) => [0.1, 0.5, 0.9].map((b) => toW(F, r.x0 + (r.x1 - r.x0) * a, r.z0 + (r.z1 - r.z0) * b)));
      if (!probes.every((q) => inside(q, lv.outline)) || clashes(poly)) continue;
      const door = toW(F, (r.x0 + r.x1) / 2, r.z1 + 1.5);
      if (!lv.walk.some((w) => inside(door, w.poly))) continue;
      add(F, r, pk.id);
    }
  }
}

/** 洞口、铺位切剩下的走道碎块：和别的走道隔开（1 米内不相接）、加起来不到 40 平方米的一组，而且全是这次切出来的，就去掉 */
function pruneIslands(lv) {
  const W = lv.walk, n = W.length, comp = new Array(n).fill(-1);
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i]; comp[i] = c;
    while (stack.length) { const a = stack.pop(); for (let b = 0; b < n; b++) if (comp[b] < 0 && polysConnect(W[a].poly, W[b].poly, 1)) { comp[b] = c; stack.push(b); } }
    c++;
  }
  const size = new Array(c).fill(0), cut = new Array(c).fill(true);
  W.forEach((w, i) => { size[comp[i]] += Math.abs(area(w.poly)); if (!(w.mega || /-m\d+$|-s\d+-\d+$/.test(w.id))) cut[comp[i]] = false; });
  lv.walk = W.filter((w, i) => !(cut[comp[i]] && size[comp[i]] < 40));
}

/** A、B 宽走道里的岛：每层最多 2 个岛柜（3×2 米）和 1 处咖啡外摆（7×5 米）。岛四周外扩 3.5 米（咖啡 3 米）都得是走道，
 *  不碰铺位、洞口、楼梯电梯扶梯、门、别的障碍；两岛相距 ≥ 14 米。都是 navObstacles，画在 render/build/p1-atrium.js。 */
function megaIslands(layout, befores) {
  const M = layout.fidelity.mega, xs = [...INFILL.A, ...INFILL.B].map((p) => p[0]), zs = [...INFILL.A, ...INFILL.B].map((p) => p[1]);
  M.islands = [];
  const box = (x, z, hx, hz) => [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]];
  for (const lv of layout.levels.filter((l) => l.building === 'P1' && ['1F', ...UPPER].includes(l.short) && befores[l.id])) {
    const walks = lv.walk.filter((w) => w.mega || w.plaza || /-m\d+$/.test(w.id));
    const onWalk = (q) => walks.some((w) => inside(q, w.poly));
    const blocked = [...lv.units.flatMap((u) => u.polys), ...lv.voids.map((v) => v.poly), ...keepOuts(layout, lv), ...(lv.rooms || []).flatMap((r) => r.polys || []),
      ...(lv.navObstacles || []).map((o) => o.poly), ...M.gaps.filter((g) => g.level === lv.id).map((g) => g.poly),
      ...layout.entrances.filter((e) => e.level === lv.id || e.to === lv.id).map((e) => { const [x, z] = midSeg(e.seg); return box(x, z, 5, 5); }),
      ...(M.strips || []).filter((q) => q.level === lv.id).map((q) => q.poly)];
    const placed = [];
    // 1F 中庭广场（2F 大洞口正下方）：效果图里喷泉四周有几处带遮阳伞的咖啡外摆。离喷泉 13 米上下最好，四周留 1.8 米走道，彼此相距 ≥ 10 米，最多 3 处
    if (lv.short === '1F') {
      const under = (layout.levels.find((l) => l.id === 'P1-2F')?.voids || []).filter((v) => v.mega && /^MEGA-void/.test(v.id)).map((v) => v.poly);
      const springs = MEGA_FOUNTAINS.map(([u, v]) => nw(u, v));
      const pts = under.flat(), [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))], [z0, z1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
      for (let n = 0; n < 3; n++) {
        let best = null;
        for (let x = x0 + 4; x < x1 - 4; x += 1) for (let z = z0 + 4; z < z1 - 4; z += 1) {
          if (!under.some((P) => inside([x, z], P)) || placed.some((p) => Math.hypot(p.x - x, p.z - z) < 10)) continue;
          const clearBox = box(x, z, 3.5 + 1.8, 2.5 + 1.8);
          if (![...clearBox, [x, z]].every(onWalk) || blocked.some((b) => hit(clearBox, b))) continue;
          const score = Math.abs(Math.min(...springs.map(([fx, fz]) => Math.hypot(x - fx, z - fz))) - 13);
          if (!best || score < best.score) best = { x, z, score };
        }
        if (!best) break;
        const it = { id: `${lv.id}-mega-plaza-cafe-${n}`, kind: 'cafe', plaza: true, level: lv.id, x: best.x, z: best.z, hx: 3.5, hz: 2.5, poly: box(best.x, best.z, 3.5, 2.5), seed: 50 + n };
        placed.push(it); M.islands.push(it);
        (lv.navObstacles ||= []).push({ id: it.id, poly: it.poly });
        blocked.push(it.poly);
      }
    }
    // 岛柜、咖啡外摆，再用休憩花园（树池 + 两条长椅）把空出来的大块地面填上
    // 最后再用休息区（三人沙发 + 圆茶几 + 地毯 + 落地绿植，2.6 × 4 米）填剩下的大块空地
    const want = [['kiosk', 1.5, 1, 3.5], ['cafe', 3.5, 2.5, 3], ['kiosk', 1.5, 1, 3.5], ['cafe', 3.5, 2.5, 3], ['kiosk', 1.5, 1, 3.5],
      ...Array.from({ length: 10 }, () => ['garden', 3, 2, 2.5]), ...Array.from({ length: 4 }, () => ['lounge', 1.3, 2, 2.2])];
    for (const [kind, hx, hz, m] of want) {
      let best = null;
      for (let x = Math.min(...xs) + 4; x < Math.max(...xs) - 4; x += 3) for (let z = Math.min(...zs) + 4; z < Math.max(...zs) - 4; z += 3) {
        if (!(inInfill([x, z]) || inBand([x, z])) || placed.some((p) => Math.hypot(p.x - x, p.z - z) < (['garden', 'lounge'].includes(kind) || ['garden', 'lounge'].includes(p.kind) ? 9 : 14))) continue;
        const clearBox = box(x, z, hx + m, hz + m);
        if (![...clearBox, [x, z]].every(onWalk)) continue;
        if (blocked.some((b) => hit(clearBox, b))) continue;
        // 离 A、B 中心近的优先（走道最宽的地方），A、B 轮流
        const score = Math.min(...[[-135, -185], [-190, -130]].map(([cx, cz]) => Math.hypot(x - cx, z - cz)));
        if (!best || score < best.score) best = { x, z, score };
      }
      if (!best) continue;
      const it = { id: `${lv.id}-mega-${kind}-${placed.length}`, kind, level: lv.id, x: best.x, z: best.z, hx, hz, poly: box(best.x, best.z, hx, hz), seed: placed.length };
      placed.push(it); M.islands.push(it);
      (lv.navObstacles ||= []).push({ id: it.id, poly: it.poly });
    }
  }
}

/** 新铺位两侧如果对着走道（不是贴着别的铺位或墙），侧面也做成玻璃店面：
 *  效果图里的店都是通透的玻璃盒子，侧面露出来的白墙看着像没做完。 */
function megaSideFronts(layout) {
  for (const lv of layout.levels.filter((l) => l.building === 'P1')) {
    const walkAt = (q) => lv.walk.some((w) => inside(q, w.poly)) && !lv.units.some((u) => u.polys.some((p) => inside(q, p)));
    // 新铺位 + 1F–6F 原有的单块矩形铺位：四条边里外面是走道、还没有门脸的，都做成玻璃面（中庭对面看过去不再是一块块白墙）
    const all = /^[1-6]F$/.test(lv.short);
    for (const u of lv.units.filter((x) => (x.mega || all) && x.rects?.length === 1 && x.frame && x.fronts)) {
      const r = u.rects[0];
      const sides = [['W', r.x0, true], ['E', r.x1, true], ['N', r.z0, false], ['S', r.z1, false]];
      for (const [side, c, vert] of sides) {
        if (u.fronts.some((f) => f.side === side)) continue;
        const out = side === 'W' || side === 'N' ? -1.2 : 1.2;
        const probes = [0.3, 0.5, 0.7].map((t) => (vert ? toW(u.frame, c + out, r.z0 + (r.z1 - r.z0) * t) : toW(u.frame, r.x0 + (r.x1 - r.x0) * t, c + out)));
        if (!probes.every(walkAt)) continue;
        const f = vert ? { x0: c, z0: r.z0, x1: c, z1: r.z1, side } : { x0: r.x0, z0: c, x1: r.x1, z1: c, side };
        u.fronts.push(f); u.wfronts.push(lseg(u.frame, f));
      }
    }
  }
}
