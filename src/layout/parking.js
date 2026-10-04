// 车位排布：在局部坐标系里沿排生成车位（每 3 车一跨、跨间 0.5m 柱位），
// 车位世界多边形与阻挡物（车道、用房、洞口）重叠即跳过。
import { rect, lrectPoly, toW, convexOverlap, dist } from './geom.js';

export const STALL_W = 2.5;
export const STALL_D = 5;

/**
 * rows: [{ id, u0, u1, v0, v1, face }]（局部；face 为车位开口朝向，即朝车道的方向）
 * blocks: 世界凸多边形[]
 */
export function fillRows(F, rows, blocks, zone) {
  const stalls = [];
  const columns = [];
  for (const row of rows) {
    const alongU = row.face === 'N' || row.face === 'S';
    const a0 = alongU ? row.u0 : row.v0;
    const a1 = alongU ? row.u1 : row.v1;
    const cross = alongU ? (row.v0 + row.v1) / 2 : (row.u0 + row.u1) / 2;
    const back = { N: row.v1, S: row.v0, E: row.u0, W: row.u1 }[row.face];
    for (let i = 0; ; i++) {
      const start = a0 + 0.25 + i * STALL_W + Math.floor(i / 3) * 0.5;
      if (start + STALL_W > a1 - 0.1) break;
      const c = start + STALL_W / 2;
      const s = alongU ? { lx: c, lz: cross, w: STALL_W, d: STALL_D } : { lx: cross, lz: c, w: STALL_D, d: STALL_W };
      const poly = lrectPoly(F, rect(s.lx - s.w / 2, s.lz - s.d / 2, s.lx + s.w / 2, s.lz + s.d / 2));
      if (blocks.some((b) => convexOverlap(poly, b, 0.02))) continue;
      const [x, z] = toW(F, s.lx, s.lz);
      stalls.push({ frame: F, ...s, face: row.face, row: row.id, zone, x, z, poly, type: 'normal' });
      if (i % 3 === 2) {
        const ca = start + STALL_W + 0.25;
        if (ca < a1 - 0.3) columns.push(alongU ? { frame: F, lx: ca, lz: back } : { frame: F, lx: back, lz: ca });
      }
    }
  }
  return { stalls, columns };
}

/** 标注特殊车位：每个电梯点附近最近的 2 个为无障碍位；指定排的末端 n 个为充电位 */
export function markSpecial(stalls, liftPoints, evRow, evCount = 6) {
  for (const p of liftPoints) {
    const near = stalls
      .filter((s) => s.type === 'normal')
      .map((s) => ({ s, d: dist([s.x, s.z], p) }))
      .filter((o) => o.d < 16)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const o of near) o.s.type = 'accessible';
  }
  const row = stalls.filter((s) => s.row === evRow && s.type === 'normal');
  for (const s of row.slice(-evCount)) s.type = 'ev';
}
