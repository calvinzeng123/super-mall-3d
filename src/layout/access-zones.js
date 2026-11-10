// 要留出通道的地方：店门内外、扶梯口、电梯门前、楼栋出入口。纯数据，世界坐标。
// 摆家具和摆件的代码用它避开这些地方；核对摆放的工具（scripts/props/audit-placements.mjs）用同一份规则检查。
import { NORMAL, toW, pointInPoly, lrectPoly, unionOutline, mergeSegments, subtractOpenings } from './geom.js';
import { storeStyle, glassDoors, doorGaps } from './frontage.js';

/** 店门内侧留多深、外侧留多深（m），门洞两侧各收多少。 */
export const DOOR_CLEAR = Object.freeze({ inside: 1.6, outside: 1.2, trim: 0.1 });

/**
 * 一层楼里所有要留空的区域：[{ what, poly } | { what, circle: [x, z, r] } | { what, seg, reach }]。
 * 玻璃店面的每个门洞是一块矩形（店内 1.6 m、店外 1.2 m）；扶梯两端是半径 2.2 m 的圆；
 * 电梯门前是半径 1.5 m 的圆；楼栋出入口是门线两侧 1.2 m。
 */
export function accessZones(layout, lv) {
  const zones = [];
  for (const u of lv.units || []) {
    if (u.residence) continue;
    const style = storeStyle(lv, u);
    if (!['glass', 'cinema', 'market'].includes(style)) continue;
    for (const f of u.fronts || []) {
      const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0), ux = (f.x1 - f.x0) / len, uz = (f.z1 - f.z0) / len, [nx, nz] = NORMAL[f.side];
      const { width, at } = glassDoors(style, len);
      if (!width) continue;
      const p = (a, v) => toW(u.frame, f.x0 + ux * a - nx * v, f.z0 + uz * a - nz * v);
      for (const d of at) {
        const a0 = d - width / 2 + DOOR_CLEAR.trim, a1 = d + width / 2 - DOOR_CLEAR.trim;
        zones.push({ what: `${u.id} 的店门`, unit: u.id, poly: [p(a0, -DOOR_CLEAR.outside), p(a1, -DOOR_CLEAR.outside), p(a1, DOOR_CLEAR.inside), p(a0, DOOR_CLEAR.inside)] });
      }
    }
  }
  for (const e of layout.escalators || []) for (const [end, level] of [[e.bottom, e.from], [e.top, e.to]]) {
    if (level === lv.id) zones.push({ what: `扶梯 ${e.id} 的出入口`, circle: [end.x, end.z, 2.2] });
  }
  for (const e of layout.elevators || []) {
    if (e.serves?.includes(lv.id) && e.x != null) zones.push({ what: `电梯 ${e.id} 的门前`, circle: [e.x + e.nx * 1.4, e.z + e.nz * 1.4, 1.5] });
  }
  for (const e of layout.entrances || []) {
    if (e.level === lv.id || e.to === lv.id) zones.push({ what: `出入口 ${e.id}`, seg: e.seg, reach: 1.2 });
  }
  return zones;
}

const distToSeg = (x, z, s) => {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0, t = Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - s.x0 - dx * t, z - s.z0 - dz * t);
};
const distToPoly = (x, z, poly) => {
  if (pointInPoly([x, z], poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; best = Math.min(best, distToSeg(x, z, { x0: a[0], z0: a[1], x1: b[0], z1: b[1] })); }
  return best;
};

/** 以 (x, z) 为中心、半径 r 的东西会不会占到某个要留空的区域；占到就返回那个区域，否则 null。 */
export function blockedZone(zones, x, z, r = 0) {
  for (const k of zones) {
    if (k.poly ? distToPoly(x, z, k.poly) <= r : k.circle ? Math.hypot(x - k.circle[0], z - k.circle[1]) < k.circle[2] + r : distToSeg(x, z, k.seg) < k.reach + r) return k;
  }
  return null;
}

/**
 * 一层楼里会挡住家具的墙段（世界坐标的线段）。和导航模型（nav.js）里这一层的墙是同一批来源：
 * 铺位轮廓（门洞处断开）、核心筒和后勤用房的轮廓、大堂隔墙和固定家具、屋顶和公共区的立柱、花池与构筑物、
 * 布局登记的护栏，以及观光电梯的井道。住宅户内的墙不在这里（户内家具由户型自己管）。
 */
export function levelWalls(layout, lv) {
  const out = [];
  const add = (x0, z0, x1, z1) => { if (Math.hypot(x1 - x0, z1 - z0) > 0.02) out.push({ x0, z0, x1, z1 }); };
  const local = (F, s) => { const [ax, az] = toW(F, s.x0, s.z0), [bx, bz] = toW(F, s.x1, s.z1); add(ax, az, bx, bz); };
  const ring = (P) => { for (let i = 0; i < P.length; i++) add(...P[i], ...P[(i + 1) % P.length]); };
  for (const u of lv.units || []) {
    if (u.residence) continue;
    const style = storeStyle(lv, u), openings = [];
    for (const f of u.fronts || []) {
      const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
      for (const [a, b] of doorGaps(style, len)) {
        const t0 = a / len, t1 = b / len;
        openings.push({ x0: f.x0 + (f.x1 - f.x0) * t0, z0: f.z0 + (f.z1 - f.z0) * t0, x1: f.x0 + (f.x1 - f.x0) * t1, z1: f.z0 + (f.z1 - f.z0) * t1, side: f.side });
      }
    }
    for (const s of subtractOpenings(mergeSegments(unionOutline(u.rects)), openings)) local(u.frame, s);
  }
  for (const m of lv.rooms || []) {
    if (m.openStair) { for (const s of m.navigationWalls || []) local(m.frame, s); continue; }
    for (const s of mergeSegments(unionOutline(m.rects))) local(m.frame, s);
  }
  if (lv.lobbyPlan) {
    const F = lv.lobbyPlan.frame;
    for (const p of lv.lobbyPlan.partitions || []) local(F, { x0: p.a[0], z0: p.a[1], x1: p.b[0], z1: p.b[1] });
    for (const o of lv.lobbyPlan.obstacles || []) ring(lrectPoly(F, o.rect));
  }
  // 布局给外摆的桌子也登记了一圈障碍（人走不过去）。那一圈就是桌椅自己，不算挡家具的墙。
  const ownFootprint = (o) => /table/.test(o.id || '');
  for (const o of [...(lv.expansion?.publicFixtures || []), ...(lv.navObstacles || [])]) if (!ownFootprint(o)) for (const P of [o.poly, ...(o.holes || [])]) ring(P);
  for (const s of lv.navWalls || []) add(s.x0, s.z0, s.x1, s.z1);
  for (const e of layout.elevators || []) {
    if (!(e.type === 'glass' || e.exterior) || !e.serves?.includes(lv.id) || !e.frame) continue;
    ring(lrectPoly(e.frame, { x0: e.lu - e.w / 2, z0: e.lv - e.d / 2, x1: e.lu + e.w / 2, z1: e.lv + e.d / 2 }));
  }
  return out;
}

const CELL = 6; // 墙段索引的格子边长（m）

/** 把墙段按 6 m 的格子编索引，查一小块范围时不用把全层的墙过一遍。 */
function wallGrid(walls) {
  const grid = new Map();
  walls.forEach((s, i) => {
    const gx0 = Math.floor(Math.min(s.x0, s.x1) / CELL), gx1 = Math.floor(Math.max(s.x0, s.x1) / CELL);
    const gz0 = Math.floor(Math.min(s.z0, s.z1) / CELL), gz1 = Math.floor(Math.max(s.z0, s.z1) / CELL);
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
      const key = gx + ',' + gz;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
  });
  return grid;
}

/** (x, z) 周围 reach 米范围里可能碰到的墙段（不重复）。 */
function wallsNear(guard, x, z, reach) {
  if (!guard.walls.length) return guard.walls;
  guard.grid ||= wallGrid(guard.walls);
  const gx0 = Math.floor((x - reach) / CELL), gx1 = Math.floor((x + reach) / CELL), gz0 = Math.floor((z - reach) / CELL), gz1 = Math.floor((z + reach) / CELL);
  if (gx0 === gx1 && gz0 === gz1) return (guard.grid.get(gx0 + ',' + gz0) || []).map((i) => guard.walls[i]);
  const seen = new Set();
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) for (const i of guard.grid.get(gx + ',' + gz) || []) seen.add(i);
  return [...seen].map((i) => guard.walls[i]);
}

/**
 * 一层楼摆东西时要守的三样：要留空的区域、楼板（哪里有地可站）、墙段。
 * 楼板取本层的结构板，加上接在本层的空桥和联廊；洞口是板上的开洞和中庭、扶梯口、竖井。
 */
export function floorGuard(layout, lv) {
  const voids = (lv.voids || []).map((v) => v.poly).filter((p) => p?.length >= 3);
  const pieces = [
    ...(lv.slab?.pieces || []).map((p) => ({ outer: p.outer, holes: [...(p.holes || []), ...voids] })),
    ...(lv.navSurfaces || []).map((p) => ({ outer: p.outer, holes: p.holes || [] })),
    ...(layout.extensions?.paths || []).filter((path) => path.level === lv.id).flatMap((path) => (path.slab?.pieces || []).map((p) => ({ outer: p.outer, holes: p.holes || [] }))),
  ];
  return { zones: accessZones(layout, lv), pieces, walls: levelWalls(layout, lv), grid: null };
}

/** (x, z) 脚下有没有楼板（在某块板的范围里，而且不在洞口上）。 */
export function supported(guard, x, z) {
  return guard.pieces.some((p) => pointInPoly([x, z], p.outer) && !p.holes.some((h) => pointInPoly([x, z], h)));
}

/**
 * 半径 r 的一组东西（一桌四椅、一组陈设）放在 (x, z) 合不合适：中心和四周都有楼板，而且离墙够远
 * （墙到中心不到 0.6 r 就算挤）。单件家具贴墙摆是常事，用下面的 crossed() 按它的实际占地判断。
 */
export function fits(guard, x, z, r = 0.4) {
  return grounded(guard, x, z, r) && !wallsNear(guard, x, z, r).some((s) => distToSeg(x, z, s) < r * 0.6);
}

/** 半径 r 的东西放在 (x, z)，中心和前后左右 0.7 r 处是不是都有楼板。这一层没有登记楼板时不检查。 */
export function grounded(guard, x, z, r = 0.4) {
  if (!guard.pieces.length) return true;
  const k = r * 0.7;
  for (const [dx, dz] of [[0, 0], [k, 0], [-k, 0], [0, k], [0, -k]]) if (!supported(guard, x + dx, z + dz)) return false;
  return true;
}

const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
const segmentsCross = (a, b, c, d) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;

/**
 * 有没有墙从一件家具中间穿过。corners 是它占地的四个角（世界坐标，按顺序绕一圈）；
 * 先向中心收 inset 米（贴着墙摆不算穿墙），再看有没有墙段和这个矩形的边相交，或者整段落在矩形里面。
 * 穿过就返回那段墙，否则 null。
 */
export function crossed(guard, corners, inset = 0.06) {
  if (!guard.walls.length) return null;
  const cx = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4, cz = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4;
  let reach = 0;
  const inner = corners.map(([x, z]) => {
    const dx = x - cx, dz = z - cz, len = Math.hypot(dx, dz) || 1, k = Math.max(0, len - inset * 1.4) / len;
    reach = Math.max(reach, len);
    return [cx + dx * k, cz + dz * k];
  });
  for (const s of wallsNear(guard, cx, cz, reach)) {
    if (Math.hypot(s.x1 - s.x0, s.z1 - s.z0) <= 0.3 && !pointInPoly([(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2], inner)) continue;
    if (distToSeg(cx, cz, s) > reach) continue;
    const a = [s.x0, s.z0], b = [s.x1, s.z1];
    if (pointInPoly(a, inner) || pointInPoly(b, inner)) return s;
    for (let i = 0; i < 4; i++) if (segmentsCross(a, b, inner[i], inner[(i + 1) % 4])) return s;
  }
  return null;
}
