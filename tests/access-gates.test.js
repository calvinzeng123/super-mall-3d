// 门禁记录的角色与门扇（supertall P0a, SPEC §1.0 "card zones", §2.1 gates；GB 55037 §7.1.7）：每道门禁火灾时释放；
// role 'entry' / 'exit'（只出不进）/ 'reentry'（楼梯回到住户层需刷卡），leaf 'own' / 'existing'；stairReentryGates()
// 在楼梯门洞里逐层生成回层门禁。只出不进门与回层门禁在导航里都是「从无卡一侧过不去、从受保护一侧感应开门」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { toL } from '../src/layout/geom.js';
import { GATE, GATE_ROLES, GATE_LEAVES, GATE_ALARM_TEXT, gateRecord, gateRecordErrors, segmentGate, stairReentryGates } from '../src/layout/access-records.js';
import { buildNav, step, updateGates, resetGates } from '../src/layout/nav.js';
import { syntheticTower, STAIR_DOOR } from './fixtures/synthetic-tower.js';

const has = (errs, re) => errs.some((e) => re.test(e));

test('门禁默认：火灾时释放、entry、自有门扇；今天的 16 道门禁全部如此并通过校验', () => {
  assert.deepEqual(GATE_ROLES, ['entry', 'exit', 'reentry']); assert.deepEqual(GATE_LEAVES, ['own', 'existing']);
  assert.equal(GATE_ALARM_TEXT, '火灾时自动释放');
  for (const g of L.accessControl.gates) {
    assert.equal(g.releaseOnAlarm, true, g.id); assert.equal(g.role, 'entry', g.id); assert.equal(g.leaf, 'own', g.id);
    assert.deepEqual(gateRecordErrors(g), [], g.id);
  }
  const g = L.accessControl.gates[0];
  assert.ok(has(gateRecordErrors({ ...g, releaseOnAlarm: false }), /releaseOnAlarm must be true/));
  assert.ok(has(gateRecordErrors({ ...g, role: 'vip' }), /role vip/));
  assert.ok(has(gateRecordErrors({ ...g, leaf: 'glass' }), /leaf glass/));
  assert.ok(has(gateRecordErrors({ ...g, kind: 'speed-gates', leaf: 'existing' }), /leaf 'existing'/));
});

test('segmentGate / stairReentryGates：楼梯门洞里的回层门禁，楼层一侧 v > 0、读卡器在楼梯一侧', () => {
  const S = syntheticTower(), st = S.stairs[0], levels = S.levels.filter((l) => ['S-2F', 'S-4F'].includes(l.id));
  const gates = stairReentryGates(st, levels, (lv) => `S-RES-${lv.short}`);
  assert.deepEqual(gates.map((g) => [g.id, g.floors[0], g.zone, g.role, g.leaf, g.kind, g.releaseOnAlarm]), [
    ['S-ST1-2F', 'S-2F', 'S-RES-2F', 'reentry', 'existing', 'glass-door', true], ['S-ST1-4F', 'S-4F', 'S-RES-4F', 'reentry', 'existing', 'glass-door', true]]);
  for (const g of gates) {
    assert.deepEqual(gateRecordErrors(g), [], g.id);
    assert.equal(g.building, 'S'); assert.equal(g.sign.sub, GATE_ALARM_TEXT); assert.equal(g.name, '住户楼层 · 刷卡进入');
    assert.ok(Math.abs(g.line.u1 - (STAIR_DOOR.x1 - STAIR_DOOR.x0)) < 1e-9, 'the gate spans the door opening');
    // the floor side (south of the door, z > 1.6) is v > 0; the reader stands inside the stair (z < 1.6)
    assert.ok(toL(g.frame, -9.8, 2.4)[1] > 0 && toL(g.frame, -9.8, 0.8)[1] < 0);
    const [rx, rz] = [g.frame.ox + g.reader.u * g.frame.c - g.reader.v * g.frame.s, g.frame.oz + g.reader.u * g.frame.s + g.reader.v * g.frame.c];
    assert.ok(rz < 1.6 && rx > STAIR_DOOR.x0 && rx < STAIR_DOOR.x1, 'reader inside the stair, mid-door');
  }
  // an exit-only door: the protected (stair) side is v > 0
  const exit = segmentGate({ id: 'S-ST1-EXIT', zone: 'S-RES-1F', name: '仅供疏散 · 外侧刷卡', floor: 'S-1F', frame: st.frame, seg: STAIR_DOOR, toward: 'N', role: 'exit' });
  assert.ok(toL(exit.frame, -9.8, 0.8)[1] > 0, 'v > 0 is inside the stair'); assert.equal(exit.role, 'exit');
  assert.deepEqual(gateRecordErrors(exit), []);
});

test('回层门禁在导航里：从住户层进楼梯自动感应放行，从楼梯回住户层没卡过不去，火灾模式常开', () => {
  const S = syntheticTower(), st = S.stairs[0];
  const g = stairReentryGates(st, S.levels.filter((l) => l.id === 'S-2F'), () => 'S-RES-2F')[0];
  S.accessControl.gates.push(g);
  const walk = (nav, from, to) => {
    let s = { floor: 'S-2F', x: from[0], z: from[1], y: 4.5, slope: null }, now = 0;
    const n = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / .1);
    for (let i = 0; i < n; i++) { s = step(nav, s, (to[0] - from[0]) / n, (to[1] - from[1]) / n, .036); now += .036; updateGates(nav, s, now); }
    return s;
  };
  const nav = buildNav(S);
  // from the floor into the stair: the exit sensor (v > 0 side within GATE.exitSensor) opens the leaf
  assert.ok(GATE.exitSensor > 1);
  let s = walk(nav, [-9.8, 3.2], [-9.8, 0.9]);
  assert.ok(Math.abs(s.z - 0.9) < .05, `cannot leave the floor into the stair (${s.z.toFixed(2)})`);
  resetGates(nav);
  s = walk(nav, [-9.8, 0.9], [-9.8, 3.2]);
  assert.ok(s.z < 1.6 + .05, `walked from the stair onto the residents' floor without a card (${s.z.toFixed(2)})`);
  const open = buildNav(S, { gates: 'open' });
  s = walk(open, [-9.8, 0.9], [-9.8, 3.2]);
  assert.ok(Math.abs(s.z - 3.2) < .05, 'released on alarm');
});
