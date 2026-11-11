// 一期样板中庭（游览模式）：照用户的预想图做圆厅中庭。
// 洞口逐层退台在 p1-expansion-spec.js（ATRIUM_STEPS）；这里放 1F 中庭地面上的东西和四根「树形柱」：
//   螺旋雕塑喷泉、叠石跌水池、棕榈花池、休息沙发、四根从 1F 直通到光穹下的树形柱。
// 都在圆厅的套件坐标系里（kitF：圆心、转 45°，+x 朝东南翼，−x 朝西北翼；两部观光梯在 x=±15.5）。
// 每一样都写进 1F 的 navObstacles，走路的人和导航绕开它们。
import { toW, circlePoly } from './geom.js';

/** 套件坐标（u, v）。避让：B1M↔1F 扶梯在 |x|<5、|z|<8 的洞口里；1F↔2F 扶梯在 x=±10.65；
 * 服务台在 (22, −9.5)；洞口四角花池在 (±9, ±12.5)；东门、南门在 kit 角 60°/300° 的弧上，门到圆心的人流线不挡。 */
export const ATRIUM = {
  fountain: { u: -3, v: 19.5, r: 4.3, name: '云澜螺旋喷泉', en: 'SPIRAL FOUNTAIN' },
  cascade: { u: -3, v: -19.5, rx: 5.2, rz: 3.8, name: '叠石跌水', en: 'STONE CASCADE' },
  columns: [[7.5, 8.8], [-7.5, 8.8], [7.5, -8.8], [-7.5, -8.8]].map(([u, v]) => ({ u, v, r: 0.62 })),
  palms: [[-13, 20.5], [-13, -20.5], [7, 23.5], [7, -23.5], [-10.5, 26], [-10.5, -26]].map(([u, v]) => ({ u, v, r: 1.5 })),
  lounges: [[-9.5, 16], [-9.5, -16]].map(([u, v]) => ({ u, v, w: 3.6, d: 2.2 })),
};

export function applyP1Atrium(layout) {
  const P1 = layout.buildings.find((b) => b.id === 'P1');
  const lv = layout.levels.find((l) => l.id === 'P1-1F');
  const rf = layout.levels.find((l) => l.id === 'P1-RF');
  const rot = P1?.rotundas?.find((r) => r.id === 'C');
  if (!lv || !rot || !rf) return layout;
  const F = rot.kitF, w = (u, v) => toW(F, u, v);
  const circle = (u, v, r, n = 24) => { const [x, z] = w(u, v); return circlePoly(x, z, r, n); };
  const ellipse = (u, v, rx, rz, n = 28) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return w(u + Math.cos(a) * rx, v + Math.sin(a) * rz); });
  lv.navObstacles ||= [];
  const add = (id, poly) => lv.navObstacles.push({ id, poly });
  const A = ATRIUM;
  add('P1-atrium-fountain', circle(A.fountain.u, A.fountain.v, A.fountain.r + 0.15));
  add('P1-atrium-cascade', ellipse(A.cascade.u, A.cascade.v, A.cascade.rx + 0.15, A.cascade.rz + 0.15));
  A.columns.forEach((c, i) => add(`P1-atrium-column-${i}`, circle(c.u, c.v, c.r + 0.1, 12)));
  A.palms.forEach((p, i) => add(`P1-atrium-palm-${i}`, circle(p.u, p.v, p.r, 16)));
  A.lounges.forEach((s, i) => add(`P1-atrium-lounge-${i}`, [w(s.u - s.d / 2, s.v - s.w / 2), w(s.u + s.d / 2, s.v - s.w / 2), w(s.u + s.d / 2, s.v + s.w / 2), w(s.u - s.d / 2, s.v + s.w / 2)]));
  lv.features.push({ type: 'p1-atrium', frame: F, ...A, top: rf.elev, name: '云澜中庭', en: 'YUNLAN GRAND ATRIUM' });
  layout.fidelity = { ...(layout.fidelity || {}), atrium: { version: 1, columns: A.columns.length } };
  return layout;
}
