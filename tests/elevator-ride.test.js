import test from 'node:test';
import assert from 'node:assert/strict';
import { createElevatorRide, sampleElevatorRide } from '../src/layout/elevator-ride.js';

test('玻璃电梯进舱、关门、连续升降、开门、出舱，终点准确', () => {
  for (const [fromY, toY] of [[0, 96], [96, -4.5]]) {
    const ride = createElevatorRide({ x: 4, z: 0, y: fromY }, { x: 4, z: 0, y: toY }, { x: 0, z: 0 });
    assert.equal(sampleElevatorRide(ride, 0).x, 4);
    const mid = sampleElevatorRide(ride, 1.55 + ride.travel / 2);
    assert.ok(Math.abs(mid.y - (fromY + toY) / 2) < 1e-8);
    assert.equal(mid.door, 0);
    const end = sampleElevatorRide(ride, 100);
    assert.equal(end.x, 4); assert.equal(end.y, toY); assert.equal(end.door, 1); assert.equal(end.done, true);
    let prev = sampleElevatorRide(ride, 0);
    for (let t = 0.05; t < end.total; t += 0.05) {
      const next = sampleElevatorRide(ride, t);
      assert.ok(Math.abs(next.y - prev.y) < 0.55, '不得跳楼层');
      prev = next;
    }
  }
});

test('从斜侧候梯点先对齐门口，穿过井道门线时不碰玻璃门框', () => {
  const from = { x: -467.75, z: -204.5, y: 6.5 };
  const entry = { x: -466.25, z: -205, y: 6.5 };
  const cabin = { x: -466.25, z: -202.5 };
  const ride = createElevatorRide(from, { ...entry, y: 67.7 }, cabin, entry);
  let previous = sampleElevatorRide(ride, 0);
  assert.equal(previous.x, from.x);
  for (let t = 0.01; t <= 1.55; t += 0.01) {
    const p = sampleElevatorRide(ride, t);
    assert.ok(Math.hypot(p.x - previous.x, p.z - previous.z) < 0.05, '进舱过程连续');
    if (p.z > -204.3) assert.ok(Math.abs(p.x - cabin.x) < 0.01, '进入门框前已对正');
    assert.equal(p.y, from.y);
    previous = p;
  }
  assert.equal(sampleElevatorRide(ride, 100).y, 67.7);
});
