// 一期南中庭（游览布局，接在 applyP1Mega 后面）：效果图南边那个圆形中庭（中间一棵白色树形灯雕）。
// 位置是 1F 西门喷泉艺术街广场：1F–6F 在这里半径 10 米内都是走道（没有铺位、核心筒、扶梯，最近的楼梯 13 米外），
// 2F–6F 开一个半径 7.5 米的圆洞（圆心按「各层离铺位、楼梯、走道边都 ≥ 10.5 米」挑的，洞边一圈走道 ≥ 3 米），不拆任何铺位；洞口边 3 米内的岛柜、花园、休息区（mega islands）挪掉，
// 1F 洞口下面空出来摆光之树（render/build/p1-atrium.js 的 lightTree）。屋面不开洞（6F 天花上画一圈灯环）。
// FPS 布局没有 fidelity.mega，不走这里。
import clipping from 'polygon-clipping';
import { circlePoly, pointInPoly } from './geom.js';

export const SOUTH_ATRIUM = Object.freeze({ x: -175.5, z: -126.5, r: 7.5 });
const UPPER = ['2F', '3F', '4F', '5F', '6F'];
const close = (P) => [...P, P[0]];
const open = (R) => R.slice(0, -1);

export function applyP1SouthAtrium(layout) {
  const M = layout.fidelity?.mega;
  if (!M) return layout;
  const { x, z, r } = SOUTH_ATRIUM;
  const poly = circlePoly(x, z, r, 48);
  const near = (P, pad) => P.some(([px, pz]) => Math.hypot(px - x, pz - z) < r + pad) || pointInPoly([x, z], P);
  const dropped = [];
  for (const lv of layout.levels.filter((l) => l.building === 'P1' && ['1F', ...UPPER].includes(l.short))) {
    // 洞口边（1F 是光之树和外圈人流）的岛柜、花园、休息区、咖啡外摆：连同导航障碍一起拿掉
    const gone = (M.islands || []).filter((it) => it.level === lv.id
      && near([[it.x - it.hx, it.z - it.hz], [it.x + it.hx, it.z - it.hz], [it.x + it.hx, it.z + it.hz], [it.x - it.hx, it.z + it.hz]], 3));
    if (gone.length) {
      M.islands = M.islands.filter((it) => !gone.includes(it));
      dropped.push(...gone.map((it) => `${lv.short}:${it.kind}`));
    }
    lv.navObstacles = (lv.navObstacles || []).filter((o) => !(/-mega-(kiosk|garden|lounge|cafe)-/.test(o.id) && near(o.poly, 3)));
    if (!UPPER.includes(lv.short)) continue;
    lv.voids.push({ id: 'SOUTH-void', kind: 'atrium', poly, mega: true, south: true });
    const main = (lv.slab?.pieces || []).find((p) => pointInPoly([x, z], p.outer));
    if (main) main.holes = [...(main.holes || []), poly];
    const walk = [];
    for (const w of lv.walk) {
      if (!near(w.poly, 0) && !w.poly.some((p) => pointInPoly(p, poly))) { walk.push(w); continue; }
      const diff = clipping.difference([[close(w.poly)]], [[close(poly)]]);
      diff.forEach((piece, i) => {
        // 走道块被圆洞挖成环的（洞完全在走道块里）：切成两半，各自没有内环
        if (piece.length > 1) {
          for (const [k, half] of [[0, [[x - 400, z - 400], [x, z - 400], [x, z + 400], [x - 400, z + 400]]], [1, [[x, z - 400], [x + 400, z - 400], [x + 400, z + 400], [x, z + 400]]]]) {
            for (const [j, q] of clipping.intersection(piece, [[close(half)]]).entries()) walk.push({ ...w, id: `${w.id}-s${i}${k}${j}`, poly: open(q[0]), rect: undefined, lpoly: undefined });
          }
        } else walk.push({ ...w, id: `${w.id}-s${i}`, poly: open(piece[0]), rect: undefined, lpoly: undefined });
      });
    }
    lv.walk = walk;
  }
  M.southAtrium = { ...SOUTH_ATRIUM, dropped };
  return layout;
}
