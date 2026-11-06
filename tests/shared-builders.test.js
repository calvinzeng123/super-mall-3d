// 共享构建器规则（supertall P0a, SPEC §2.1 "Rule for shared builders", C-13）：mall.js 的 lift()、tower-stairs.js
// 与 gateRecord 被紧凑 FPS 布局共用；超高层字段只由游览布局专有的构建器写入，读取方一律用默认值。
// The compact JSON must stay byte-identical (fps-frozen.test.js); this test names the field that leaked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/layout/layout.js';
import { LIFT_SPEED_DEFAULT, liftStops, landingAt, isFireLift } from '../src/layout/elevator-shafts.js';
import { createElevatorRide } from '../src/layout/elevator-ride.js';

const C = buildLayout({ expansion: false }), json = JSON.stringify(C);
/** The C-13 list: fields only expansion-only builders may write. */
const FIELDS = {
  elevators: ['speed', 'role', 'zone', 'card', 'fireOnly'],
  stairs: ['breakLevels', 'breakDoors', 'maxRisers'],
  levels: ['zone', 'refugePlan', 'navPlan'],
  buildings: ['zones'],
  residences: ['refugeRoom'],
};

test('紧凑布局的电梯、楼梯、楼层、楼栋、住户记录不含任何超高层字段，也没有门禁记录', () => {
  const residences = C.levels.flatMap((l) => l.units).filter((u) => u.residence).map((u) => u.residence);
  const records = { elevators: C.elevators, stairs: C.stairs, levels: C.levels, buildings: C.buildings, residences };
  for (const [kind, keys] of Object.entries(FIELDS)) for (const r of records[kind]) for (const k of keys)
    assert.ok(!(k in r), `${kind} ${r.id ?? r.plan ?? ''}: shared builder wrote ${k}`);
  assert.equal(C.accessControl, undefined, 'gates (releaseOnAlarm, role, leaf) exist only in the expansion layout');
  assert.equal(C.levels.filter((l) => l.kind === 'refuge').length, 0);
  // fields that do not occur anywhere in today's compact JSON (a grep over the whole file)
  for (const k of ['speed', 'card', 'fireOnly', 'breakLevels', 'breakDoors', 'maxRisers', 'releaseOnAlarm', 'leaf', 'refugeRoom', 'refugePlan', 'navPlan', 'stairBreak', 'doorless'])
    assert.ok(!json.includes(`"${k}":`), `the compact JSON contains "${k}"`);
});

test('读取方的默认值：速度 3.5 m/s、无消防专用层站、楼梯无分隔', () => {
  for (const e of C.elevators) {
    assert.equal(e.speed ?? LIFT_SPEED_DEFAULT, 3.5);
    assert.equal(liftStops(e, { fire: true }), e.serves, `${e.id}: fire mode adds nothing without fireOnly`);
    for (const id of e.serves) assert.equal(landingAt(e, id), 'normal');
    assert.equal(isFireLift(e), false);
    const ride = createElevatorRide({ x: 0, z: 0, y: 0 }, { x: 0, z: 0, y: 20 }, { x: 0, z: 0 }, null, e.speed);
    assert.equal(ride.travel, Math.max(1.2, 20 / 7));
  }
  for (const s of C.stairs) assert.deepEqual(s.breakLevels ?? [], []);
});

test('电梯新字段的读取：fireOnly 层站只在火灾模式出现，井道覆盖消防专用层站，客梯不算消防梯', async () => {
  const { syntheticTower } = await import('./fixtures/synthetic-tower.js');
  const { prepareRideableElevators, FIRE_LIFT_ROLES } = await import('../src/layout/elevator-shafts.js');
  const S = syntheticTower({ lfServes: ['1F', '2F', '3F', '4F'], lfFireOnly: ['RF'] });
  const LF = S.elevators.find((e) => e.id === 'S-LF'), L1 = S.elevators.find((e) => e.id === 'S-L1');
  assert.deepEqual(liftStops(LF), ['S-1F', 'S-2F', 'S-3F', 'S-4F']);
  assert.deepEqual(liftStops(LF, { fire: true }), ['S-1F', 'S-2F', 'S-3F', 'S-4F', 'S-RF']);
  assert.deepEqual(['S-3F', 'S-RF', 'S-9F'].map((id) => landingAt(LF, id)), ['normal', 'fire', null]);
  assert.equal(landingAt(L1, 'S-3F'), null, 'the passenger lift passes the refuge floor (blank wall)');
  assert.ok(isFireLift(LF) && !isFireLift(L1)); assert.deepEqual(FIRE_LIFT_ROLES, ['fire', 'fire-service', 'service-fire']);
  prepareRideableElevators(S);
  assert.equal(LF.shaftTop, S.levels.find((l) => l.id === 'S-RF').elev, 'the shaft reaches the fire-only landing');
  assert.equal(L1.shaftTop, S.levels.find((l) => l.id === 'S-4F').elev);
});
