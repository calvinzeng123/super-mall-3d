// 楼层分区（supertall P0a, SPEC §2.1 "zones as data", §3.1）：b.zones / lv.zone 由 towerZones() 从楼层种类推出，
// 只写在游览布局的塔楼上；每个楼层恰好属于一个分区；避难层自成一区，分区的电梯只列在区内有平时层站的电梯。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { ZONE_KINDS, towerZones, applyTowerZones, zoneOf, levelZoneKind } from '../src/layout/zones.js';
import { syntheticTower } from './fixtures/synthetic-tower.js';

const KEYS = ['from', 'homes', 'id', 'kind', 'levels', 'lifts', 'name', 'to'];

test('游览布局：北苑 / 西苑塔楼有 b.zones，自下而上覆盖全部楼层（含一期宿主楼层），本楼楼层写 lv.zone', () => {
  const zoned = L.buildings.filter((b) => b.zones).map((b) => b.id).sort();
  assert.deepEqual(zoned, ['T1', 'T2', 'W1', 'W2'], 'only the expansion-only towers are zoned until each package sets its own');
  for (const b of L.buildings.filter((q) => q.zones)) {
    const ids = b.zones.flatMap((z) => z.levels), all = [...(b.hostLevels || []), ...b.levels];
    assert.deepEqual([...ids].sort(), [...all].sort(), `${b.id}: every level in exactly one zone`);
    const elev = (id) => L.levels.find((l) => l.id === id).elev;
    for (let i = 1; i < b.zones.length; i++) assert.ok(elev(b.zones[i].from) > elev(b.zones[i - 1].to), `${b.id}: zones run bottom-up`);
    for (const z of b.zones) {
      assert.deepEqual(Object.keys(z).filter((k) => k !== 'host').sort(), KEYS);
      assert.ok(ZONE_KINDS.includes(z.kind), z.kind);
      assert.equal(z.from, z.levels[0]); assert.equal(z.to, z.levels.at(-1));
      assert.ok(z.name && !z.name.includes('undefined'), z.name);
      for (const id of z.levels) {
        const lv = L.levels.find((l) => l.id === id);
        if (z.host) assert.equal(lv.zone, undefined, `${id}: host levels belong to P1`);
        else assert.equal(lv.zone, z.id);
        assert.equal(zoneOf(b, id), z);
      }
      for (const e of z.lifts) assert.ok(L.elevators.find((q) => q.id === e).serves.some((id) => z.levels.includes(id)), `${z.id}: ${e} has no stop in it`);
    }
  }
  const T1 = L.buildings.find((b) => b.id === 'T1');
  assert.deepEqual(T1.zones.map((z) => [z.kind, z.name, z.homes]), [
    ['basement', 'B1 / B2 地下', 0], ['lobby', '1F 住户大堂', 0], ['podium', '2–6F 裙房 · 电梯直达', 0], ['amenity', '7F 空中大堂', 0],
    ['band', '江景大平层 8–13F', 12], ['band', '错层复式 14–24F', 12], ['roof', 'RF 屋顶花园', 0]]);
  assert.equal(T1.zones.find((z) => z.kind === 'podium').lifts.length, 0, 'the podium floors are passed sealed');
  const W1 = L.buildings.find((b) => b.id === 'W1');
  assert.deepEqual(W1.zones.map((z) => [z.kind, z.from, z.to, z.homes]), [
    ['basement', 'W1-B2', 'W1-B1', 0], ['lobby', 'W1-1F', 'W1-1F', 0], ['band', 'W1-2F', 'W1-28F', 135], ['roof', 'W1-RF', 'W1-RF', 0]]);
  for (const id of ['H', 'A', 'R1', 'R4', 'P1']) assert.equal(L.buildings.find((b) => b.id === id).zones, undefined, id);
});

test('towerZones：避难层自成一区，分区电梯只列平时停靠的电梯；显式 b.zones 不被覆盖', () => {
  const S = syntheticTower(), b = S.buildings[0];
  const zones = towerZones(b, S.levels, { elevators: S.elevators });
  assert.deepEqual(zones.map((z) => [z.kind, z.from, z.to]), [
    ['lobby', 'S-1F', 'S-1F'], ['band', 'S-2F', 'S-2F'], ['refuge', 'S-3F', 'S-3F'], ['band', 'S-4F', 'S-4F'], ['roof', 'S-RF', 'S-RF']]);
  const ref = zones.find((z) => z.kind === 'refuge');
  assert.equal(ref.name, '3F 避难层'); assert.deepEqual(ref.lifts, ['S-LF'], 'the passenger lift passes the refuge floor');
  assert.equal(levelZoneKind(S.levels[2]), 'refuge');
  const L2 = { buildings: [{ ...b, kind: 'tower', community: 'test', zones: [{ id: 'mine', name: '自定义', from: 'S-1F', to: 'S-RF', kind: 'band', levels: b.levels, lifts: [], homes: 0 }] }],
    levels: S.levels.map((l) => ({ ...l })), stairs: S.stairs, elevators: S.elevators };
  applyTowerZones(L2);
  assert.equal(L2.buildings[0].zones.length, 1);
  assert.ok(L2.levels.every((l) => l.zone === 'mine'));
});
