// 一期弧形花坛（游览布局，接在 applyP1SouthAtrium 后面）：效果图里宽走道不是笔直的一条，中间隔一段就有一条弯弯的
// 长花坛（棕榈、樱花、花丛），人从两边绕过去，走道跟着花坛弯。这里在 2F–6F 的宽走道上摆月牙形花坛（导航障碍，
// 漫游时挡人），渲染见 render/build/p1-atrium.js 的 walkBeds。
// 选址：花坛中线上每一点外面 2.8 米一圈都在走道上（不贴店门、栏板、洞口），离人流路线 ≥ 花坛半宽 + 2.4 米，
// 离楼梯门、电梯门、扶梯上下口 ≥ 6 米，离岛柜等原有障碍 ≥ 3 米，花坛之间 ≥ 16 米。方向顺着最近的人流路线（走道方向）。
// FPS 布局没有 fidelity.mega，不走这里。
import { pointInPoly, distToPolyEdge, lrectPoly } from './geom.js';
import { levelPaths } from '../render/paths.js';

const UPPER = ['2F', '3F', '4F', '5F', '6F'];
export const BED = Object.freeze({ width: 2.4, sag: 1.1, lengths: [11, 8, 5] });

/** 月牙形花坛：中心 (x, z)，长轴方向 a，长 L、最宽 w、中线弓高 sag。返回 { line: 中线点 [x, z, 半宽], poly } */
export function crescent(x, z, a, L, w = BED.width, sag = BED.sag, n = 14) {
  const ux = Math.cos(a), uz = Math.sin(a), nx = -uz, nz = ux;
  const line = [];
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n, bow = sag * (1 - t * t) - sag * 2 / 3;
    line.push([x + ux * t * L / 2 + nx * bow, z + uz * t * L / 2 + nz * bow, (w / 2) * Math.pow(Math.max(0, 1 - t * t), 0.35)]);
  }
  const left = [], right = [];
  for (let i = 0; i <= n; i++) {
    const [px, pz, hw] = line[i], j = Math.min(n, i + 1), k = Math.max(0, i - 1);
    let tx = line[j][0] - line[k][0], tz = line[j][1] - line[k][1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const h = Math.max(hw, 0.05);
    left.push([px - tz * h, pz + tx * h]);
    right.push([px + tz * h, pz - tx * h]);
  }
  return { line, poly: [...left, ...right.reverse()] };
}

/** 按包围盒分格的索引（8 米一格）：只查附近格子里的多边形 / 线段，不然每层几百块走道、铺位逐个查太慢 */
function gridIndex(items, bbox, cell = 8) {
  const map = new Map(), key = (i, j) => i * 100003 + j;
  for (const it of items) {
    const [ax, az, bx, bz] = bbox(it);
    for (let i = Math.floor(ax / cell); i <= Math.floor(bx / cell); i++) for (let j = Math.floor(az / cell); j <= Math.floor(bz / cell); j++) {
      const k = key(i, j); if (!map.has(k)) map.set(k, []); map.get(k).push(it);
    }
  }
  return (x, z, r = 0) => {
    const out = new Set();
    for (let i = Math.floor((x - r) / cell); i <= Math.floor((x + r) / cell); i++) for (let j = Math.floor((z - r) / cell); j <= Math.floor((z + r) / cell); j++) for (const it of map.get(key(i, j)) || []) out.add(it);
    return out;
  };
}
const polyBox = (P) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of P) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return [a, b, c, d]; };

export function applyP1WalkBeds(layout) {
  const M = layout.fidelity?.mega;
  if (!M) return layout;
  const paths = levelPaths(layout);
  const beds = [];
  for (const lv of layout.levels.filter((l) => l.building === 'P1' && UPPER.includes(l.short))) {
    const walks = lv.walk.map((w) => w.poly), holes = lv.voids.map((v) => v.poly);
    const units = lv.units.flatMap((u) => u.polys);
    const W = gridIndex(walks, polyBox), H = gridIndex(holes, polyBox), U = gridIndex(units, polyBox);
    const onWalk = (x, z) => [...W(x, z)].some((w) => pointInPoly([x, z], w)) && ![...H(x, z)].some((h) => pointInPoly([x, z], h)) && ![...U(x, z)].some((q) => pointInPoly([x, z], q));
    const segs = [];
    for (const p of paths[lv.id]?.people || []) for (let i = 0; i < p.pts.length - (p.loop ? 0 : 1); i++) segs.push([p.pts[i], p.pts[(i + 1) % p.pts.length]]);
    const S = gridIndex(segs, ([a, b]) => [Math.min(a[0], b[0]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[2], b[2])]);
    // 最近的人流线段（只查 12 米内；再远就当作没有，方向取 0）
    const nearest = (x, z) => {
      let best = { d: Infinity, a: 0 };
      for (const [a, b] of S(x, z, 12)) {
        const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2));
        const d = Math.hypot(a[0] + dx * t - x, a[2] + dz * t - z);
        if (d < best.d) best = { d, a: Math.atan2(dz, dx) };
      }
      return best;
    };
    const keep = [];
    for (const s of layout.stairs.filter((q) => q.serves?.includes(lv.id))) { if (s.poly) keep.push([s.poly, 3]); const d = s.wdoorByLevel?.[lv.id] || s.wdoor; if (d) keep.push([[[d.x0 ?? d[0], d.z0 ?? d[1]]], 6]); }
    for (const e of layout.elevators.filter((q) => q.serves?.includes(lv.id))) keep.push([[[e.x, e.z]], 6]);
    for (const e of layout.escalators) for (const [end, id] of [[e.top, e.to], [e.bottom, e.from]]) if (id === lv.id) keep.push([[[end.x, end.z]], 7]);
    for (const o of lv.navObstacles || []) keep.push([o.poly, 3]);
    const K = gridIndex(keep, ([P, d]) => { const [a, b, c, e] = polyBox(P); return [a - d, b - d, c + d, e + d]; });
    const clearOf = (x, z) => [...K(x, z)].every(([P, d]) => (P.length > 2 ? !pointInPoly([x, z], P) && distToPolyEdge([x, z], P) >= d : Math.hypot(P[0][0] - x, P[0][1] - z) >= d));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const w of walks) for (const [x, z] of w) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const mine = [];
    for (let x = Math.ceil(x0 / 3) * 3; x <= x1; x += 3) for (let z = Math.ceil(z0 / 3) * 3; z <= z1; z += 3) {
      if (!onWalk(x, z) || mine.some((b) => Math.hypot(b.x - x, b.z - z) < 16)) continue;
      const near = nearest(x, z);
      if (near.d < BED.width / 2 + 2.4) continue;
      for (const L of BED.lengths) {
        const { line, poly } = crescent(x, z, near.a, L);
        const fits = line.every(([px, pz, hw]) => {
          if (!onWalk(px, pz) || !clearOf(px, pz) || nearest(px, pz).d < hw + 2.4) return false;
          for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, R = hw + 2.8; if (!onWalk(px + Math.cos(a) * R, pz + Math.sin(a) * R)) return false; }
          return true;
        });
        if (!fits) continue;
        const id = `P1-${lv.short}-bed-${mine.length}`;
        mine.push({ id, level: lv.id, x, z, a: near.a, L, poly, line });
        lv.navObstacles = [...(lv.navObstacles || []), { id, poly }];
        break;
      }
    }
    beds.push(...mine);
  }
  M.beds = beds;
  return layout;
}
