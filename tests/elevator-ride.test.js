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

// ---------- supertall P0a: ride time from the lift speed (SPEC §2.1 "ride time", §3.2; user: compressed rides) ----------
import { rideTravel, liftRunSeconds, LIFT_SPEED_DEFAULT } from '../src/layout/elevator-ride.js';

test('乘梯时长：travel = max(1.2, Δy / (2 × speed))，默认 3.5 m/s 与原来的 Δy / 7 完全相同', () => {
  assert.equal(LIFT_SPEED_DEFAULT, 3.5);
  for (const dy of [0, 0.5, 3.3, 8.4, 34, 96, 183.3]) {
    const a = { x: 0, z: 0, y: 0 }, b = { x: 0, z: 0, y: dy };
    // today's formula, written out: the default ride must not move by a single bit
    assert.equal(createElevatorRide(a, b, { x: 0, z: 0 }).travel, Math.max(1.2, Math.abs(b.y - a.y) / 7));
    assert.equal(createElevatorRide(b, a, { x: 0, z: 0 }).travel, Math.max(1.2, dy / 7));
    assert.equal(rideTravel(dy), Math.max(1.2, dy / 7));
  }
  // e.speed: 北苑 LW 1F → 34F (134.1 m) at 4 m/s ≈ 16.8 s in game, R1-LF 1F → 53F (183.3 m) at 5 m/s ≈ 18.3 s
  assert.ok(Math.abs(createElevatorRide({ x: 0, z: 0, y: 0 }, { x: 0, z: 0, y: 134.1 }, { x: 0, z: 0 }, null, 4).travel - 16.76) < .01);
  assert.ok(Math.abs(rideTravel(183.3, 5) - 18.33) < .01);
  assert.equal(createElevatorRide({ x: 0, z: 0, y: 0 }, { x: 0, z: 0, y: 10 }, { x: 0, z: 0 }, null, undefined).speed, 3.5);
});

test('HUD 实际时间：realSeconds 为额定速度下的加减速运行时间，长行程约为压缩后的两倍', () => {
  assert.equal(liftRunSeconds(0, 4), 0);
  // a long run reaches rated speed: t = d / v + v / a + a / j
  assert.ok(Math.abs(liftRunSeconds(134.1, 4) - (134.1 / 4 + 4 / 1.0 + 1.0 / 1.5)) < 1e-9);
  // a short run peaks below rated speed: t = 2 √(d / a) + a / j
  assert.ok(Math.abs(liftRunSeconds(3, 4) - (2 * Math.sqrt(3) + 1 / 1.5)) < 1e-9);
  // fire lifts accelerate at 0.9 m/s² (codes.md §4.3); real time is always ≥ the compressed in-game time
  const ride = createElevatorRide({ x: 0, z: 0, y: 0 }, { x: 0, z: 0, y: 183.3 }, { x: 0, z: 0 }, null, 5, { fire: true });
  assert.ok(Math.abs(ride.realSeconds - (183.3 / 5 + 5 / 0.9 + 0.9 / 1.5)) < 1e-9);
  for (const [dy, v] of [[4.5, 3.5], [96, 3.5], [140.7, 4], [183.3, 5]]) assert.ok(liftRunSeconds(dy, v) >= rideTravel(dy, v) - 1e-9, `${dy} m`);
  const r = liftRunSeconds(134.1, 4) / rideTravel(134.1, 4);
  assert.ok(r > 2 && r < 2.6, `compression ${r.toFixed(2)}`);
});
