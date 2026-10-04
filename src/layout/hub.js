// 圆厅 + 翼楼：外轮廓、圆厅走道切块、翼楼局部几何。
// 翼楼矩形从 u_a = √(R² − HW²) 开始，角点正好落在圆周上，所以外轮廓 = 圆弧段 + 翼楼矩形。
import { frame, toW, rect, lrectPoly, circlePoly, clipConvex } from './geom.js';

const DEG = 180 / Math.PI;
const mod360 = (a) => ((a % 360) + 360) % 360;

/** 圆弧上严格位于 (a0, a1) 之间、角度为 step 整数倍的点 */
function arc(pts, r, a0, a1, step) {
  for (let k = Math.floor(a0 / step + 1e-9) + 1; k * step < a1 - 1e-6; k++) {
    const a = (k * step) / DEG;
    pts.push([r.x + Math.cos(a) * r.R, r.z + Math.sin(a) * r.R]);
  }
}

/**
 * 外轮廓多边形。
 * rots: [{ id, x, z, R }]
 * arms: 端翼 { id, rot, deg, uEnd } 或连接翼 { id, rot, to, deg }（deg 为从 rot 指向 to 的方向）
 */
export function hubOutline(rots, arms, HW, step = 3) {
  const R = Object.fromEntries(rots.map((r) => [r.id, r]));
  const att = Object.fromEntries(rots.map((r) => [r.id, []]));
  for (const a of arms) {
    att[a.rot].push({ arm: a, rot: a.rot, deg: a.deg, beta: Math.asin(HW / R[a.rot].R) * DEG });
    if (a.to) att[a.to].push({ arm: a, rot: a.to, deg: a.deg + 180, beta: Math.asin(HW / R[a.to].R) * DEG, back: true });
  }
  const first = att[rots[0].id][0];
  const start = { rot: first.rot, ang: first.deg + first.beta };
  const pts = [];
  let rot = start.rot;
  let ang = start.ang;
  for (let guard = 0; guard < 64; guard++) {
    const dd = mod360(ang - start.ang);
    if (guard > 0 && rot === start.rot && (dd < 1e-6 || dd > 360 - 1e-6)) return pts;
    let best = null;
    let bestD = Infinity;
    for (const t of att[rot]) {
      const d = mod360(t.deg - t.beta - ang);
      if (d < bestD) { bestD = d; best = t; }
    }
    const r = R[rot];
    arc(pts, r, ang, ang + bestD, step);
    const F = frame(r.x, r.z, best.deg);
    const ua = Math.sqrt(r.R * r.R - HW * HW);
    if (!best.arm.to) {
      const u1 = best.arm.uEnd;
      pts.push(toW(F, ua, -HW), toW(F, u1, -HW), toW(F, u1, HW), toW(F, ua, HW));
      ang = best.deg + best.beta;
    } else {
      const otherId = best.back ? best.arm.rot : best.arm.to;
      const o = R[otherId];
      const ub = Math.hypot(o.x - r.x, o.z - r.z) - Math.sqrt(o.R * o.R - HW * HW);
      pts.push(toW(F, ua, -HW), toW(F, ub, -HW));
      const tb = att[otherId].find((x) => x.arm === best.arm);
      rot = otherId;
      ang = tb.deg + tb.beta;
    }
  }
  throw new Error('hubOutline 没有闭合');
}

/**
 * 圆厅走道切块：圆盘减去套件 frame 下的矩形 hole（洞口外接矩形），切成北 / 南 / 西 / 东四块凸多边形；
 * hole 为 null 时整个圆盘一块。
 */
export function ringPieces(rot, kitF, hole, n = 120) {
  const disk = circlePoly(rot.x, rot.z, rot.R, n);
  if (!hole) return [disk];
  const big = rot.R + 2;
  const parts = [
    rect(-big, -big, big, hole.z0),
    rect(-big, hole.z1, big, big),
    rect(-big, hole.z0, hole.x0, hole.z1),
    rect(hole.x1, hole.z0, big, hole.z1),
  ];
  return parts.map((r) => clipConvex(disk, lrectPoly(kitF, r))).filter((p) => p.length >= 3);
}
