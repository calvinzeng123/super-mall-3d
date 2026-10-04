// 云环天桥（规格第 8 节）：路口上空的圆环桥面 + 四条沿对角线的连廊 + 两座落地塔 + 支柱。
// 连廊 frame 原点在路口中心、u 沿对角线向外；一、二期连廊直抵翼楼末端 2F 天桥入口，
// 三期与公园两条落在 10×10m 落地塔上，塔内楼梯、扶梯、电梯把桥面与地面步行区连起来。
import { frame, toW, rect, lrectPoly } from './geom.js';
import { ESC } from './constants.js';

export const BRIDGE = { y: 6.5, thick: 1.0, R: 34, width: 6, linkWidth: 5, tower: 10, segments: 24 };

/** 翼楼末端立面中点到路口中心的距离（翼楼轴线经过原点） */
function wingFacade(building, wingId) {
  const w = building.wings.find((x) => x.id === wingId);
  const [x, z] = toW(w.F, w.uEnd, 0);
  return Math.hypot(x, z);
}

export function buildBridges(buildings) {
  const { y, thick, R, width, linkWidth, tower: TS, segments: N } = BRIDGE;
  const walk = [];
  const ring = [];
  const r0 = R - width / 2, r1 = R + width / 2;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const P = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
    const poly = [P(r0, a0), P(r1, a0), P(r1, a1), P(r0, a1)];
    ring.push({ id: `ring-${i}`, a0, a1, poly });
    walk.push({ id: `ring-${i}`, kind: 'ring', poly });
  }

  const byId = Object.fromEntries(buildings.map((b) => [b.id, b]));
  const tc = 40 * Math.SQRT2;
  const defs = [
    { id: 'L-P1', deg: 225, building: 'P1', wing: 'SE', name: '一期连廊' },
    { id: 'L-P2', deg: 315, building: 'P2', wing: 'W', name: '二期连廊' },
    { id: 'L-P3', deg: 135, tower: 'T-P3', name: '三期连廊', side: 1 },
    { id: 'L-PK', deg: 45, tower: 'T-PK', name: '公园连廊', side: -1 },
  ];
  const links = [];
  const towers = [];
  const verticals = [];
  const supports = [];
  const u0 = R + 1;
  for (const d of defs) {
    const F = frame(0, 0, d.deg, `bridge-${d.id}`);
    const hw = linkWidth / 2;
    let u1;
    let end;
    if (d.building) {
      u1 = wingFacade(byId[d.building], d.wing);
      end = toW(F, u1 + 0.5, 0);
      const [sx, sz] = toW(F, (u0 + u1) / 2 + 2, 0);
      supports.push({ id: `${d.id}-S`, x: sx, z: sz, deg: d.deg, kind: 'link' });
    } else {
      const t0 = tc - TS / 2, t1 = tc + TS / 2;
      u1 = t0 + 1;
      end = toW(F, t0 + 2, 0);
      const T = { id: d.tower, link: d.id, name: `${d.name}落地塔`, frame: F, rect: rect(t0, -TS / 2, t1, TS / 2), center: toW(F, tc, 0), side: d.side };
      T.poly = lrectPoly(F, T.rect);
      towers.push(T);
      walk.push({ id: d.tower, kind: 'tower', poly: T.poly });
      // 扶梯：塔的 side 侧沿 v 向外伸出（朝大道），上端落在塔内、下端落在地面广场
      const s = d.side;
      const run = y * Math.sqrt(3);
      const top = s * (TS / 2 - 0.4);
      const bottom = top + s * run;
      for (const [k, dir] of [[-1, 'up'], [1, 'down']]) {
        const cu = tc - 2 + (k * ESC.lane) / 2;
        verticals.push({
          id: `${d.tower}-E${dir === 'up' ? 'U' : 'D'}`, type: 'escalator', dir, tower: d.tower, frame: F, lu: cu,
          top: { lu: cu, lv: top }, bottom: { lu: cu, lv: bottom }, width: ESC.width, rise: y, run,
          deck: toW(F, cu, top - s * 1.2), ground: toW(F, cu, bottom + s * 1.2),
        });
      }
      // 楼梯（折返跑）占塔内 −side 半边远端，门朝连廊；电梯在 side 半边远端
      const st = rect(tc - 0.5, Math.min(-s * 1.2, -s * 4.8), tc + 4.7, Math.max(-s * 1.2, -s * 4.8));
      const sp = toW(F, tc - 1.1, -s * 3);
      verticals.push({ id: `${d.tower}-ST`, type: 'stair', tower: d.tower, frame: F, rect: st, door: { x0: tc - 0.5, z0: st.z0 + 0.6, x1: tc - 0.5, z1: st.z1 - 0.6, side: 'W' }, deck: sp, ground: sp });
      const lp = toW(F, tc + 1.5, s * 2.5);
      verticals.push({ id: `${d.tower}-L`, type: 'lift', tower: d.tower, frame: F, lu: tc + 3.4, lv: s * 2.5, w: 2.6, d: 2.6, door: 'W', deck: lp, ground: lp });
    }
    const r = rect(u0, -hw, u1, hw);
    const poly = lrectPoly(F, r);
    links.push({ id: d.id, name: d.name, deg: d.deg, frame: F, rect: r, poly, building: d.building || null, tower: d.tower || null, end, u0, u1 });
    walk.push({ id: d.id, kind: 'link', poly });
  }
  for (const deg of [0, 45, 135, 180, 225, 315]) {
    const a = (deg * Math.PI) / 180;
    supports.push({ id: `S${deg}`, x: R * Math.cos(a), z: R * Math.sin(a), deg, kind: 'ring' });
  }
  return { y, thick, R, width, linkWidth, walk, ring, links, towers, verticals, supports };
}
