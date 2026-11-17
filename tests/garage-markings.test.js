import test from 'node:test';
import assert from 'node:assert/strict';
import { aisleLanes, laneClash, parapetRuns, RAMP_PARAPET } from '../src/render/build/parking.js';
import { trussStart, TRUSS_SINK, drawEscalator } from '../src/render/build/escalators.js';
import { frame, rect, rectPoly, toW, pointInPoly } from '../src/layout/geom.js';

const F = frame(0, 0, 0, 'G');
const aisle = (id, f, r) => ({ id, kind: 'aisle', frame: f, rect: r, poly: rectPoly(r).map(([x, z]) => toW(f, x, z)) });

test('车库标线：路口里不画中线和箭头，叠在一起的同向车道只有先来的那条画', () => {
  const main = aisle('main', F, rect(0, 10, 60, 16));
  const cross = aisle('cross', F, rect(27, -20, 33, 40));          // 横穿主车道
  const twin = aisle('twin', F, rect(40, 10, 80, 16));              // 和主车道同向、叠着一段
  const skew = aisle('skew', frame(10, 13, 40, 'X'), rect(-12, -3, 12, 3)); // 斜着穿过主车道
  const lanes = aisleLanes({ walk: [main, cross, twin, skew, { id: 's', kind: 'spine', frame: F, rect: rect(0, 0, 4, 4), poly: rectPoly(rect(0, 0, 4, 4)) }] });
  assert.equal(lanes.length, 4, '只算车道');
  const L = (id) => lanes.find((l) => l.w.id === id);
  // 路口：主车道和横车道交叉的那一块，两条都让
  assert.equal(laneClash(lanes, L('main'), [30, 13]), true);
  assert.equal(laneClash(lanes, L('cross'), [30, 13]), true);
  // 路口以外照常画
  assert.equal(laneClash(lanes, L('main'), [20, 13]), false);
  assert.equal(laneClash(lanes, L('cross'), [30, -10]), false);
  // 同向叠着的一段：先来的画，后来的让；各自独有的一段都画
  assert.equal(laneClash(lanes, L('main'), [50, 13]), false);
  assert.equal(laneClash(lanes, L('twin'), [50, 13]), true);
  assert.equal(laneClash(lanes, L('twin'), [70, 13]), false);
  // 斜车道穿过主车道的地方也算路口
  assert.equal(laneClash(lanes, L('main'), [10, 13]), true);
  assert.equal(laneClash(lanes, L('skew'), toW(skew.frame, 0, 0)), true);
  // 箭头要离路口远一点：离横车道不到 2.5 米也不画
  assert.equal(laneClash(lanes, L('main'), [25, 13], 2.5), true);
  assert.equal(laneClash(lanes, L('main'), [22, 13], 2.5), false);
});

test('坡道洞口的护墙：四周都砌，只在坡道开上来的那一头留口', () => {
  // 洞口 24 × 9.5，两条 4.5 米宽的坡道都从 x = 12 那一头上到楼面
  const hole = [[-12, -4.75], [12, -4.75], [12, 4.75], [-12, 4.75]];
  const mouths = [{ x: 12, z: -2.35, half: 2.7 }, { x: 12, z: 2.35, half: 2.7 }];
  const runs = parapetRuns(hole, mouths);
  const len = (r) => Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
  const on = (r, f) => f(r.a) && f(r.b);
  const low = runs.filter((r) => on(r, (p) => Math.abs(p[0] + 12) < 1e-6));
  assert.ok(low.length === 1 && Math.abs(len(low[0]) - 9.5) < RAMP_PARAPET.step + 1e-6, '下口那一头整条砌上');
  assert.equal(runs.filter((r) => on(r, (p) => Math.abs(p[0] - 12) < 1e-6)).length, 0, '上口那一头留空，车从这里开上来');
  for (const v of [-4.75, 4.75]) {
    const side = runs.filter((r) => on(r, (p) => Math.abs(p[1] - v) < 1e-6));
    assert.equal(side.length, 1);
    assert.ok(len(side[0]) > 20, `侧边的护墙 ${len(side[0]).toFixed(1)} 米`);
  }
  // 没有坡道口的洞：四条边都砌满
  assert.equal(parapetRuns(hole, []).reduce((t, r) => t + len(r), 0), 2 * (24 + 9.5));
});

test('扶梯桁架的下端收在下口楼板的厚度以内，不从下一层的天花里露出来', () => {
  const boxes = [];
  const B = { get: (key) => ({ shape: (name, c, q, s) => boxes.push({ key, c: c.clone(), q: q.clone(), s: s.clone() }) }) };
  const rise = 4.5, run = rise / Math.tan(Math.PI / 6), y0 = -4.5;
  drawEscalator(B, { bottom: { x: 0, y: y0, z: 0 }, top: { x: run, y: y0 + rise, z: 0 }, width: 1.6 }, '#b9a27a');
  let lowest = Infinity;
  for (const b of boxes) for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
    const p = b.c.clone().add(b.s.clone().multiply({ x: sx, y: sy, z: sz }).applyQuaternion(b.q));
    lowest = Math.min(lowest, p.y);
  }
  assert.ok(lowest >= y0 - TRUSS_SINK - 0.02, `最低点在楼面下 ${(y0 - lowest).toFixed(2)} 米`);
  assert.ok(lowest < y0 - 0.2, '桁架和垫块还是埋进楼板里一截');
  assert.ok(trussStart(9) > 1 && trussStart(9) < 2);
  assert.equal(trussStart(1.2), 0.6, '很短的扶梯最多让到一半');
});
