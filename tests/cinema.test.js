// 影城（src/layout/cinema.js）：入口大堂、候场区、走廊、阶梯放映厅。平面是渲染和导航共用的一份——
// 看得见的实心东西（厅墙、柜台、长椅、栏杆、看台、每排椅背）在导航里都挡人；过道是一段坡道，人走上去脚下跟着台阶升高；
// 子弹被椅背挡住、从椅背上面过得去；开局点在厅里、站得住，从大堂走得到厅里、走得上过道。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, clear, step } from '../src/layout/nav.js';
import { toW, pointInPoly } from '../src/layout/geom.js';
import { findPath } from '../src/fps/pathfinding.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { cinemaPlan, cinemaFrame, CINEMA } from '../src/layout/cinema.js';
import { cinemaSteps } from '../src/jimao/siege-mall.js';

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' });
const lv = L.levels.find((l) => l.id === 'P1-3F'), u = lv.units.find((q) => q.brand?.name === '云澜影城');
const P = cinemaPlan(u), K = cinemaFrame(P.frame), y0 = lv.elev;
/** 规范坐标 (a, b) → 世界坐标 */
const W = (a, b) => toW(u.frame, ...K.at(a, b));
const at = (a, b) => { const [x, z] = W(a, b); return landAt(nav, x, z, y0 + 0.6); };
/** 从 s 朝世界方向 (dx, dz) 一小步一小步走 dist 米（和人、队友、丧尸走路一样的 step） */
function walk(s, dx, dz, dist) {
  const l = Math.hypot(dx, dz), n = Math.ceil(dist / 0.08);
  for (let i = 0; i < n; i++) s = step(nav, s, (dx / l) * 0.08, (dz / l) * 0.08, 1 / 30);
  return s;
}
/** 规范方向 (da, db) → 世界方向 */
const dirW = (da, db) => { const [x0, z0] = W(0, 0), [x1, z1] = W(da, db); return [x1 - x0, z1 - z0]; };
/** 世界坐标的点 → 规范坐标的 b */
const bOf = (s) => { const [x0, z0] = W(0, 0), [dx, dz] = dirW(0, 1); return (s.x - x0) * dx + (s.z - z0) * dz; };

test('影城的平面：入口大堂（售票台、卖品部、排队栏杆、检票口、场次屏、柱子）、候场区（长椅、海报、服务台）、走廊、两个阶梯放映厅', () => {
  assert.equal(P.halls.length, 2);
  assert.ok(P.foyer.ticket && P.foyer.concession && P.foyer.podium && P.foyer.rails.length >= 2 && P.foyer.pillars.length === 2, '大堂');
  assert.ok(P.lounge.benches.length >= 8 && P.lounge.posters.length >= 4 && P.lounge.duty, '候场区');
  assert.ok(P.corridor && P.check, '走廊、检票口');
  for (const h of P.halls) {
    assert.equal(h.doors.length, 2); assert.equal(h.doors.filter((d) => d.exit).length, 1, '一道入场门、一道散场门');
    assert.ok(h.tiers.length >= 8, `${h.n} 号厅 ${h.tiers.length} 级看台`);
    for (let k = 1; k < h.tiers.length; k++) assert.ok(h.tiers[k].top > h.tiers[k - 1].top + 0.15, '一排比一排高');
    assert.ok(h.rows.every((r) => r.seats.length >= 9), '每排九把以上');
    for (const r of h.rows) for (let j = 1; j < r.seats.length; j++) assert.ok(Math.abs(r.seats[j] - r.seats[j - 1] - CINEMA.seat.w) < 1e-6);
    assert.equal(h.aisles.length, 2, '两条过道');
    for (const a of h.aisles) assert.ok(a.y1 > h.tiers.at(-2).top && a.y1 < h.tiers.at(-1).top + 0.3, '过道顶端和最后一排一样高');
  }
  // 小影城（五层那几家）进深不够摆厅：不摆，也不出错
  for (const l of L.levels) for (const q of l.units) if (q.brand?.cat === 'cinema' && !q.residence && q !== u) { const p = cinemaPlan(q); assert.ok(p.frame && Array.isArray(p.halls)); }
});

test('影城的导航：厅墙、柜台、长椅、栏杆、看台、座椅都挡人；只走得进过道；过道上脚下跟着台阶升高，走到最后一排是死胡同、原路下得来', () => {
  const h = P.halls[0], ai = h.aisles[0], mid = (ai.a0 + ai.a1) / 2, sa = (h.a0 + h.a1) / 2;
  // 1. 从银幕前那块地往看台里走：被第一级看台挡住（座椅那一块进不去）
  let s = at(sa, h.b1 - 1.2); assert.ok(s && !s.slope && clear(nav, s), '银幕前站得住');
  s = walk(s, ...dirW(0, -1), 6); assert.ok(!s.slope && bOf(s) > h.sb + 0.25, `走进了座椅：停在 b=${bOf(s).toFixed(2)}，看台前沿 ${h.sb.toFixed(2)}`);
  // 2. 从过道口往上走：上了坡道，脚下一路升高，走到头停在后墙前
  s = at(mid, h.b1 - 1.2); let y = s.y, rising = true;
  for (let i = 0; i < 160; i++) { s = step(nav, s, ...dirW(0, -0.08), 1 / 30); if (s.y < y - 1e-6) rising = false; y = s.y; }
  assert.ok(s.slope && rising, '在过道上、一路往上');
  assert.ok(s.y - y0 > h.tiers.at(-1).top - 0.3, `到了最后一排的高度：${(s.y - y0).toFixed(2)} 米`);
  assert.ok(bOf(s) > h.b0, '没穿过后墙');
  // 在过道上横着往座椅里挤：挤不进去
  const v0 = s.slope.v; s = walk(s, ...dirW(ai.a0 === h.a0 ? 1 : -1, 0), 3); assert.ok(s.slope && Math.abs(s.slope.v - v0) <= ai.a1 - ai.a0, '横着出不了过道');
  // 原路下来：回到地面
  s = walk(s, ...dirW(0, 1), 14); assert.ok(!s.slope && Math.abs(s.y - y0) < 1e-6, '下得来');
  // 3. 厅墙：从厅里往隔壁厅走（两个厅之间那道墙）
  s = at(h.a1 - CINEMA.aisle - 0.4, h.b1 - 0.6); const s1 = walk(s, ...dirW(1, 0), 4); assert.ok(K.at(0, 0) && ((dirW(1, 0)[0] * (s1.x - s.x) + dirW(1, 0)[1] * (s1.z - s.z)) < CINEMA.aisle + 0.4), '穿不过厅墙');
  // 4. 柜台、长椅、栏杆、柱子：每一件都从正面撞上去，过不去
  const solids = [['售票台', P.foyer.ticket], ['卖品部', P.foyer.concession], ['服务台', P.lounge.duty], ['长椅', { ...P.lounge.benches[0], b0: P.lounge.benches[0].b0, b1: P.lounge.benches[1].b1 }]];
  for (const [name, q] of solids) {
    const am = (q.a0 + q.a1) / 2, b1 = Math.max(q.b0, q.b1), front = at(am, b1 + 0.9);
    assert.ok(front && clear(nav, front), `${name} 前面站得住`);
    const e = walk(front, ...dirW(0, -1), 3); assert.ok(bOf(e) > b1 + 0.25, `${name} 穿过去了`);
  }
  const [ra, r0, r1] = P.foyer.rails[1], beside = at(ra - 0.6, (r0 + r1) / 2), e = walk(beside, ...dirW(1, 0), 1.5);
  assert.ok(e && (dirW(1, 0)[0] * (e.x - beside.x) + dirW(1, 0)[1] * (e.z - beside.z)) < 0.35, '穿过了排队栏杆');
  const [pa, pb] = P.foyer.pillars[0], pf = at(pa, pb + 1.2), pe = walk(pf, ...dirW(0, -1), 2.5); assert.ok(bOf(pe) > pb + CINEMA.pillar / 2 + 0.25, '穿过了柱子');
  // 导航里的看台：在看台上方（座椅那一块）落不下脚——地面这一层在那儿不能站
  const [tx, tz] = W(sa, (h.tiers[3].b0 + h.tiers[3].b1) / 2), q = landAt(nav, tx, tz, y0 + 3);
  assert.ok(!q || q.floor !== lv.id || !clear(nav, q) || q.slope, '座椅那一块不是能站的地面');
});

test('影城：从大堂走得到每个厅的过道口（寻路，门洞、检票口都开着）；开局点在厅里站得住；手摇柄在服务台跟前', () => {
  const foyer = at(P.frame.W / 2, (P.foyer.b0 + P.foyer.b1) / 2); assert.ok(foyer && clear(nav, foyer));
  for (const h of P.halls) for (const ai of h.aisles) {
    const mouth = at((ai.a0 + ai.a1) / 2, h.sb + 0.6); assert.ok(mouth && !mouth.slope && clear(nav, mouth), '过道口站得住');
    const p = findPath(nav, foyer, mouth); assert.ok(p, `${h.n} 号厅过道口走得到`);
    // 照着寻路的路线真走一遍（step），走得到
    let s = foyer;
    for (const w of p.slice(1)) { const d = Math.hypot(w.x - s.x, w.z - s.z); if (d > 1e-6) s = walk(s, w.x - s.x, w.z - s.z, d); }
    assert.ok(Math.hypot(s.x - mouth.x, s.z - mouth.z) < 0.3, `${h.n} 号厅：照着路线走到了过道口（差 ${Math.hypot(s.x - mouth.x, s.z - mouth.z).toFixed(2)} 米）`);
  }
  const steps = cinemaSteps(nav, lv, u); assert.ok(steps, '影城给得出开局点、手摇柄');
  const sp = landAt(nav, steps.spawn.x, steps.spawn.z, y0 + 0.6); assert.ok(sp && sp.floor === lv.id && !sp.slope && clear(nav, sp), '开局点站得住');
  const hall = P.halls.find((h) => h.n === P.spots.hall), poly = [[hall.a0, hall.b0], [hall.a1, hall.b0], [hall.a1, hall.b1], [hall.a0, hall.b1]].map(([a, b]) => W(a, b));
  assert.ok(pointInPoly([sp.x, sp.z], poly), '开局点在放映厅里');
  const d = P.lounge.duty, [dx, dz] = W((d.a0 + d.a1) / 2, (d.b0 + d.b1) / 2); assert.ok(Math.hypot(steps.crank.x - dx, steps.crank.z - dz) < 2.5, '手摇柄在服务台跟前');
});

test('影城：子弹被椅背、柜台挡住，从椅背上面、柜台上面打得过去；厅墙整面挡', () => {
  const physics = createMapPhysics(nav), h = P.halls[0], sa = (h.a0 + h.a1) / 2, row = h.rows[2];
  const ray = (a, b, y, da, db, dist) => { const [x, z] = W(a, b), [dx, dz] = dirW(da, db); return physics.raycast(new THREE.Vector3(x, y0 + y, z), new THREE.Vector3(dx, 0, dz).normalize(), dist)?.dist ?? Infinity; };
  // 沿着看台往后（朝后墙）平射：低处打在看台 / 椅背上，比最后一排还高的地方一直打到后墙
  assert.ok(ray(sa, h.b1 - 0.5, 0.9, 0, -1, 30) < h.b1 - h.sb + 1.2, '低处被看台、座椅挡住');
  assert.ok(ray(sa, h.b1 - 0.5, h.tiers.at(-1).top + CINEMA.seat.back + 0.3, 0, -1, 30) > h.b1 - h.b0 - 0.6, '高处打得到后墙');
  // 横着打一排椅背（站在过道上，高度在椅背中间）：挡住
  const ai = h.aisles[0], am = (ai.a0 + ai.a1) / 2, inward = ai.a0 === h.a0 ? 1 : -1;
  assert.ok(ray(am, row.b + 0.3, row.base + 0.4, inward, 0, 8) < 1.2, '坐垫那一截挡住');
  assert.ok(ray(am, row.b + 0.3, row.base + 1.5, inward, 0, 8) > 6, '从椅背上面打得过去');
  // 柜台：齐腰挡、头顶过
  const t = P.foyer.ticket, ta = (t.a0 + t.a1) / 2;
  assert.ok(ray(ta, t.b1 + 1.5, 0.8, 0, -1, 4) < 1.6, '柜台挡子弹');
  assert.ok(ray(ta, t.b1 + 1.5, 1.6, 0, -1, 4) > 1.6, '从柜台上面打得过去（打到后柜）');
  // 厅墙：从走廊朝厅里打（不对着门）：整面挡
  assert.ok(ray(sa, h.b1 + 1.2, 3.5, 0, -1, 6) < 1.4, '厅墙挡子弹');
});
