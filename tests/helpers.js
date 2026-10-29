// 测试共用：构建一次园区布局，提供走道 / 楼板 / 洞口 / 场地 / 桥面判定。
import { buildLayout } from '../src/layout/layout.js';
import { pointInPoly, segProbes, dist, polyCentroid } from '../src/layout/geom.js';
import { clear, step } from '../src/layout/nav.js';

export const L = buildLayout();
export const lvl = (id) => L.levels.find((l) => l.id === id);
export const levelsOf = (b) => L.levels.filter((l) => l.building === b);
export const inWalk = (lv, p) => lv.walk.some((w) => pointInPoly(p, w.poly));
export const inVoid = (lv, p) => lv.voids.some((v) => pointInPoly(p, v.poly));
export const onSlab = (lv, p) =>
  lv.slab.pieces.some((s) => pointInPoly(p, s.outer) && !s.holes.some((h) => pointInPoly(p, h))) && !inVoid(lv, p);
export const inSite = (p) => L.site.walk.some((w) => pointInPoly(p, w.poly));
// 导航实走：在 floor 上从 from 以 10cm 步长走向 to，返回最终状态（起点必须可站立）。
const floorY = (floor) => (floor === 'ground' ? 0 : lvl(floor).elev);
export const standable = (nav, floor, x, z) => clear(nav, { floor, x, z, y: floorY(floor), slope: null });
export function walkNav(nav, floor, from, to) {
  let s = { floor, x: from[0], z: from[1], y: floorY(floor), slope: null };
  if (!clear(nav, s)) throw new Error(`${floor} ${from} not standable`);
  const n = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / .1);
  for (let i = 0; i < n; i++) s = step(nav, s, (to[0] - from[0]) / n, (to[1] - from[1]) / n, 0);
  return s;
}
export const inBridge = (p) => (L.bridges ? L.bridges.walk.some((w) => pointInPoly(p, w.poly)) : false);
export const stairDoor = (s, id) => (s.wdoorByLevel && s.wdoorByLevel[id]) || s.wdoor;
export const midOf = (s) => [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];
export const liftProbe = (e) => [e.x + e.nx * (e.reach + 0.6), e.z + e.nz * (e.reach + 0.6)];

/** 多边形各顶点向形心内缩 d（不超过到形心距离的一半） */
export function insetPts(poly, d = 1) {
  const c = polyCentroid(poly);
  return poly.map((p) => {
    const len = dist(p, c) || 1;
    const k = Math.min(d, len / 2) / len;
    return [p[0] + (c[0] - p[0]) * k, p[1] + (c[1] - p[1]) * k];
  });
}

/** 法线方向聚类：相差 30° 以内算同一方向 */
export function directionCount(items) {
  const clusters = [];
  for (const e of items) {
    const a = (Math.atan2(e.nz, e.nx) * 180) / Math.PI;
    if (!clusters.some((c) => Math.abs(((a - c + 540) % 360) - 180) < 30)) clusters.push(a);
  }
  return clusters.length;
}

export { segProbes };
