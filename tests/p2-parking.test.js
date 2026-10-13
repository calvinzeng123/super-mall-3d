import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, onSlab } from './helpers.js';
import { pointInPoly, convexOverlap, toW } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';

const nav = buildNav(L);
const ramps = L.ramps.filter((r) => ['P2-DN', 'P2-UP'].includes(r.id));
const b1 = lvl('P2-B1'), b2 = lvl('P2-B2');
const at = (floor, x, z) => ({ floor, x, z, y: nav.floors.get(floor).y, slope: null });

test('二期 B2 为独立停车层，客梯与两处分散消防楼梯均可到达', () => {
  assert.equal(b2.kind, 'parking');
  assert.equal(b2.elev, -8.4);
  assert.equal(b1.elev - b2.elev, 4.2);
  assert.ok(b2.parking.stalls.length > 100, 'B2 没有完整停车排布');
  const lifts = L.elevators.filter((e) => e.building === 'P2' && e.type === 'passenger');
  const stairs = L.stairs.filter((s) => s.building === 'P2');
  assert.ok(lifts.length >= 2 && stairs.length >= 2);
  for (const e of [...lifts, ...stairs]) {
    assert.ok(e.serves.includes(b2.id), `${e.id} 不服务 B2`);
    const stop = nav.links.find((l) => l.id === e.id)?.stops.find((s) => s.floor === b2.id);
    assert.ok(stop && clear(nav, at(b2.id, stop.x, stop.z)), `${e.id} 的 B2 候梯/楼梯互动点不可站立`);
  }
});

test('二期双坡各净宽 6m、长 28m，上层开洞且不压用房和车位', () => {
  assert.equal(ramps.length, 2);
  assert.ok(b1.voids.some((v) => v.kind === 'ramp'));
  assert.ok(!b2.voids.some((v) => v.kind === 'ramp'), '下层不能挖空坡底承接楼板');
  for (const r of ramps) {
    assert.equal(r.width, 6);
    assert.equal(Math.hypot(r.from.x - r.to.x, r.from.z - r.to.z), 28);
    assert.equal(Math.abs(r.from.y - r.to.y), 4.2);
    for (const lv of [b1, b2]) {
      for (const room of lv.rooms) for (const p of room.polys) assert.ok(!convexOverlap(r.poly, p), `${r.id} 穿过 ${lv.id}/${room.id}`);
      for (const stall of lv.parking.stalls) assert.ok(!convexOverlap(r.poly, stall.poly), `${r.id} 压到 ${lv.id} 车位 ${stall.id}`);
    }
    for (let sample = 1; sample < 10; sample++) {
      const t = sample / 10;
      const p = [r.from.x + t * (r.to.x - r.from.x), r.from.z + t * (r.to.z - r.from.z)];
      assert.ok(!onSlab(b1, p), `${r.id} 上层楼板遮挡坡道`);
      assert.ok(onSlab(b2, p), `${r.id} 下层承接楼板缺失`);
    }
  }
});

test('两条车坡中线与两侧都能实际小步双向换层，途中高度连续', () => {
  let routes = 0;
  for (const r of ramps) for (const reverse of [false, true]) for (const offset of [-2.3, 0, 2.3]) {
    const start = reverse ? r.to : r.from, end = reverse ? r.from : r.to;
    const len = Math.hypot(end.x - start.x, end.z - start.z);
    const ux = (end.x - start.x) / len, uz = (end.z - start.z) / len;
    let state = at(start.level, start.x - ux * 1.2 - uz * offset, start.z - uz * 1.2 + ux * offset);
    assert.ok(clear(nav, state), `${r.id}/${reverse}/${offset} 起点被挡`);
    let intermediate = 0;
    const distance = len + 2.4, n = Math.ceil(distance / .08);
    for (let i = 0; i < n; i++) {
      const previous = state;
      state = step(nav, state, ux * distance / n, uz * distance / n, 0);
      assert.ok(Math.abs(state.y - previous.y) < .05, `${r.id} 出现高度跳变`);
      if (state.y > b2.elev + .1 && state.y < b1.elev - .1) intermediate++;
    }
    assert.equal(state.floor, end.level, `${r.id}/${reverse}/${offset} 未完成换层`);
    assert.ok(Math.abs(state.y - end.y) < 1e-6);
    assert.ok(Math.hypot(state.x - (end.x + ux * 1.2 - uz * offset), state.z - (end.z + uz * 1.2 + ux * offset)) < .05, `${r.id} 停在坡道中途`);
    assert.ok(intermediate > 250, `${r.id} 没有沿坡面连续升降`);
    routes++;
  }
  assert.equal(routes, 12);
});

test('A 圆厅坡道周围的 B1/B2 环道可绕行，进口出口落点有楼板', () => {
  const F = ramps[0].frame;
  for (const lv of [b1, b2]) {
    for (const [x, z] of [[-16, -8], [-16, 8], [16, -8], [16, 8], [0, -10], [0, 10]]) {
      const p = toW(F, x, z);
      assert.ok(onSlab(lv, p) && clear(nav, at(lv.id, ...p)), `${lv.id} 圆厅绕行点 ${x},${z} 不通`);
      assert.ok(lv.walk.some((w) => pointInPoly(p, w.poly)), `${lv.id} 绕行点没有登记车道/步道`);
    }
    const circuit = [[-16, -10], [-16, 10], [16, 10], [16, -10], [-16, -10]].map((p) => toW(F, ...p));
    let state = at(lv.id, ...circuit[0]);
    for (const [x, z] of circuit.slice(1)) {
      const dx = x - state.x, dz = z - state.z, n = Math.ceil(Math.hypot(dx, dz) / .08);
      for (let i = 0; i < n; i++) state = step(nav, state, dx / n, dz / n, 0);
      assert.equal(state.floor, lv.id, `${lv.id} 环道误入坡面`);
      assert.ok(Math.hypot(state.x - x, state.z - z) < .05, `${lv.id} 环道实际步行被挡`);
    }
  }
});
