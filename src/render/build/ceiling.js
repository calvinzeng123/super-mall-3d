// 商场走道的天花：分格的梁和洞口边的边梁。只在完整园区和小游戏里画（FPS 的天花保持平板加灯）。
// 属于各层的室内细节，离开那一层就一起释放。灯在 shell.js 的 ceilingLights 里，位置跟这里的分格对齐。
import { pointInPoly, toW } from '../../layout/geom.js';
import { SLAB_T, ceilingBays } from './shell.js';

/** 梁的截面和取样步长（m）。 */
export const RIB = Object.freeze({ width: 0.2, depth: 0.3, step: 0.25, min: 0.75 });
/** 洞口边梁的截面（m）。 */
export const EDGE_BEAM = Object.freeze({ width: 0.28, depth: 0.5, step: 0.5 });

const bounds = (P) => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of P) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [x0, z0, x1, z1];
};
const touching = (a, b, pad = 0.5) => a[0] <= b[2] + pad && a[2] >= b[0] - pad && a[1] <= b[3] + pad && a[3] >= b[1] - pad;

/**
 * 把一条线分成小段逐段判断，连着合格的小段并成一段。good(t) 判断参数 t ∈ [0, 1] 处合不合格。
 * 返回 [[t0, t1], ...]。
 */
export function runs(length, step, good) {
  const n = Math.max(1, Math.ceil(length / step)), out = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const ok = i < n && good((i + 0.5) / n);
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) { out.push([start / n, i / n]); start = -1; }
  }
  return out;
}

/**
 * lv 这一层的天花：上一层楼板底下的分格梁，加上上一层洞口（中庭、街谷、扶梯口）周边的边梁。
 * 梁只画在头顶真有楼板的地方：挑空的街谷和中庭上方不画。
 */
export function ceilingRelief(ctx, b, lv) {
  if (!ctx.depthCues || !['retail', 'food'].includes(lv.kind)) return;
  // 上一层从楼栋自己的楼层表里找：按需加载的那份上下文里，楼栋只带着当前这一层
  const order = b.levels || [], above = ctx.lvById?.[order[order.indexOf(lv.id) + 1]];
  if (!above?.slab) return;
  const B = ctx.levels[lv.id].batch;
  const top = above.elev - (SLAB_T[above.kind] || 0.45);
  const voids = (above.voids || []).filter((v) => v.poly?.length >= 3).map((v) => ({ v, poly: v.poly, bb: bounds(v.poly) }));
  const plates = above.slab.pieces.map((piece) => ({ piece, bb: bounds(piece.outer) }));
  /** (x, z) 头顶有没有上一层的楼板。 */
  const covered = (x, z, near = voids) => plates.some(({ piece, bb }) => x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3]
    && pointInPoly([x, z], piece.outer) && !(piece.holes || []).some((h) => pointInPoly([x, z], h)))
    && !near.some((q) => pointInPoly([x, z], q.poly));

  // ---------- 分格梁 ----------
  const tone = '#e4dccd';
  for (const bay of ceilingBays(lv)) {
    const { w, r, nx, nz } = bay, F = w.frame, bb = bounds(w.poly);
    const near = voids.filter((q) => touching(q.bb, bb)), earlier = bay.earlier.filter((P) => touching(bounds(P), bb, 0));
    const good = (lx, lz) => { const [x, z] = toW(F, lx, lz); return covered(x, z, near) && !earlier.some((P) => pointInPoly([x, z], P)); };
    B.frame(F, () => {
      const lenX = r.x1 - r.x0, lenZ = r.z1 - r.z0, y = top - RIB.depth / 2;
      for (let i = 1; i < nx; i++) {
        const x = r.x0 + i * lenX / nx;
        for (const [t0, t1] of runs(lenZ, RIB.step, (t) => good(x, r.z0 + t * lenZ))) {
          if ((t1 - t0) * lenZ >= RIB.min) B.get('matte').box(x, y, r.z0 + (t0 + t1) / 2 * lenZ, RIB.width, RIB.depth, (t1 - t0) * lenZ, tone);
        }
      }
      for (let j = 1; j < nz; j++) {
        const z = r.z0 + j * lenZ / nz;
        for (const [t0, t1] of runs(lenX, RIB.step, (t) => good(r.x0 + t * lenX, z))) {
          if ((t1 - t0) * lenX >= RIB.min) B.get('matte').box(r.x0 + (t0 + t1) / 2 * lenX, y, z, (t1 - t0) * lenX, RIB.depth, RIB.width, tone);
        }
      }
    });
  }

  // ---------- 洞口边梁：楼板在洞口边往下翻一道，底下一条灯带 ----------
  for (const { v, poly } of voids) {
    if (v.kind === 'shaft' || v.kind === 'skylight' || v.kind === 'ramp' || v.kind === 'stair') continue;
    for (let i = 0; i < poly.length; i++) {
      const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1) continue;
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len, lx = -uz, lz = ux;
      // 楼板在这条边的哪一侧：一侧是板、另一侧是空的才画（两个洞口共用的边不画）
      const side = (t) => {
        const mx = x0 + (x1 - x0) * t, mz = z0 + (z1 - z0) * t;
        const left = covered(mx + lx * 0.35, mz + lz * 0.35), right = covered(mx - lx * 0.35, mz - lz * 0.35);
        return left === right ? 0 : left ? 1 : -1;
      };
      for (const s of [1, -1]) for (const [t0, t1] of runs(len, EDGE_BEAM.step, (t) => side(t) === s)) {
        const run = (t1 - t0) * len, tm = (t0 + t1) / 2;
        if (run < 1) continue;
        const mx = x0 + (x1 - x0) * tm + lx * s * EDGE_BEAM.width / 2, mz = z0 + (z1 - z0) * tm + lz * s * EDGE_BEAM.width / 2;
        const ang = Math.atan2(-uz, ux);
        B.get('matte').box(mx, top - EDGE_BEAM.depth / 2, mz, run, EDGE_BEAM.depth, EDGE_BEAM.width, '#cfccc3', ang);
        B.get('glow').box(mx - lx * s * (EDGE_BEAM.width / 2 - 0.05), top - EDGE_BEAM.depth - 0.012, mz - lz * s * (EDGE_BEAM.width / 2 - 0.05), run - 0.1, 0.024, 0.06, '#ffe6bd', ang);
      }
    }
  }
}
