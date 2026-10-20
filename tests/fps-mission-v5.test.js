import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, clear } from '../src/layout/nav.js';
import { findPath, traceMotion } from '../src/fps/pathfinding.js';
import { FPS_MISSION, createMissionLayout } from '../src/fps/mission-layout.js';
import { ENEMY_TYPES } from '../src/fps/enemy-tactics.js';

const fps = buildPlayableLayout({ mode: 'fps' });
const nav = buildNav(fps);
const hotelZ = -81.1533717;
const walkable = new Set(fps.playable.walkableLevelIds);
const NEW_ENEMY_IDS = ['west-marksman', 'garage-elite'];
const newEnemies = FPS_MISSION.enemies.filter(e => NEW_ENEMY_IDS.includes(e.id));
const addedPoints = [...FPS_MISSION.pickups, FPS_MISSION.bonus, ...newEnemies, ...newEnemies.flatMap(e => e.patrol)];

const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon,
  `expected ${expected}, got ${actual}`);
const assertAt = (p, floor, x, z, y) => {
  assert.equal(p.floor, floor);
  near(p.x, x); near(p.z, z);
  if (y !== undefined) near(p.y, y);
};

test('the original mission content keeps every id and surveyed position', () => {
  assert.equal(FPS_MISSION.id, 'yunlan-blackout');
  assert.equal(FPS_MISSION.duration, 900);
  assertAt(FPS_MISSION.spawn, 'P1-1F', -135, -98, 0);
  assertAt(FPS_MISSION.teammate, 'P1-1F', -133, -98, 0);
  assert.equal(FPS_MISSION.teammate.id, 'echo');
  assert.equal(FPS_MISSION.teammate.name, '回声');
  assert.deepEqual(FPS_MISSION.objectives.map(o => o.id), ['terminal', 'intel', 'extract-car']);
  assertAt(FPS_MISSION.objectives[0], 'P1-1F', -169, -90);
  assertAt(FPS_MISSION.objectives[1], 'H-2F', -245, hotelZ, 6.5);
  assertAt(FPS_MISSION.objectives[2], 'A-B1', -35, -220, -4.5);
  assert.deepEqual(FPS_MISSION.extractions.map(e => e.id), ['extract-car', 'extract-heli']);
  assertAt(FPS_MISSION.extractions[0], 'A-B1', -35, -220, -4.5);
  assertAt(FPS_MISSION.extractions[1], 'H-RF', -250, hotelZ - 5, 13.3);
  assert.deepEqual(FPS_MISSION.cover.map(c => c.id),
    ['west-equipment', 'west-freight', 'hotel-luggage', 'intel-equipment', 'garage-cargo']);
  assertAt(FPS_MISSION.cover[0], 'P1-1F', -151, -98.4);
  assertAt(FPS_MISSION.cover[4], 'A-B1', -32, -204, -4.5);
  const legacy = [
    ['west-patrol', 'scout', 'P1-1F', -179, -87, 72],
    ['hotel-entry', 'assault', 'H-1F', -220, hotelZ, 98],
    ['hotel-intel', 'heavy', 'H-2F', -258, hotelZ, 145],
    ['concourse-patrol', 'scout', 'P1-B1M', -130, -100, 72],
    ['extraction-guard', 'assault', 'A-B1', -35, -202, 98],
    ['roof-guard', 'heavy', 'H-RF', -239, hotelZ, 145],
    ['roof-scout', 'scout', 'H-3F', -220, hotelZ, 72],
  ];
  assert.deepEqual(FPS_MISSION.enemies.slice(0, legacy.length).map(e => [e.id, e.type, e.floor, e.x, e.z, e.health]),
    legacy, 'existing enemy ids/types/positions are the backwards-compatibility contract');
  for (const enemy of FPS_MISSION.enemies.slice(0, legacy.length)) {
    assert.equal(enemy.patrol.length, 2);
    assert.equal(enemy.elite, undefined, 'legacy hostiles are not elite');
  }
});

test('v5 adds exactly 5 intel chips, 3 supplies, one bonus console, one marksman and one elite', () => {
  const pickups = FPS_MISSION.pickups;
  assert.equal(pickups.length, 8);
  assert.equal(pickups.filter(p => p.kind === 'intel').length, 5);
  assert.deepEqual([...new Set(pickups.filter(p => p.kind !== 'intel').map(p => p.kind))].sort(), ['armor', 'grenade', 'medkit']);
  assert.deepEqual([...new Set(pickups.map(p => p.floor))].sort(),
    ['A-B1', 'H-1F', 'H-2F', 'H-RF', 'P1-1F', 'P1-B1M'], 'pickups reward the whole route, including the roof and garage');
  const ids = [...pickups.map(p => p.id), FPS_MISSION.bonus.id, ...FPS_MISSION.enemies.map(e => e.id)];
  assert.equal(new Set(ids).size, ids.length, 'mission ids are unique');
  for (const pickup of pickups) {
    assert.equal(typeof pickup.title, 'string');
    assert.ok(pickup.title.length > 0);
    assert.equal(typeof pickup.x, 'number');
    assert.equal(typeof pickup.z, 'number');
    assert.ok(walkable.has(pickup.floor), `pickup ${pickup.id} must sit on a walkable FPS floor`);
  }
  assert.equal(FPS_MISSION.bonus.floor, 'P1-B1M');
  const marksmen = FPS_MISSION.enemies.filter(e => e.type === 'marksman');
  assert.equal(marksmen.length, 1, 'one new marksman hostile');
  assert.equal(marksmen[0].id, 'west-marksman');
  assert.equal(marksmen[0].health, ENEMY_TYPES.marksman.health);
  const elites = FPS_MISSION.enemies.filter(e => e.elite);
  assert.equal(elites.length, 1, 'one elite heavy that drops armor on death');
  assert.equal(elites[0].id, 'garage-elite');
  assert.equal(elites[0].type, 'heavy');
  assert.equal(elites[0].health, ENEMY_TYPES.heavy.health);
  assert.equal(FPS_MISSION.enemies.length, 9);
});

test('every added point is collision-free on a walkable floor', () => {
  assert.ok(addedPoints.length >= 8, 'bonus + 5 intel + 3 supplies + 2 hostiles');
  for (const p of addedPoints) {
    assert.ok(nav.floors.has(p.floor), `missing nav floor ${p.floor}`);
    assert.ok(walkable.has(p.floor), `${p.floor} must be a walkable FPS floor`);
    assert.equal(clear(nav, p), true, `${p.id || p.title || 'point'} is blocked at ${p.floor}/${p.x}/${p.z}`);
  }
  // Existing objectives/extractions/patrols must stay usable with the new
  // bonus console and pickups present (they are intentionally non-solid).
  const existing = [FPS_MISSION.spawn, FPS_MISSION.teammate, ...FPS_MISSION.objectives,
    ...FPS_MISSION.extractions, ...FPS_MISSION.enemies, ...FPS_MISSION.enemies.flatMap(e => e.patrol)];
  for (const p of existing) assert.equal(clear(nav, p), true, `${p.id || p.title} blocked`);
});

test('the bonus console and every pickup are reachable from the insertion spawn', () => {
  for (const p of [...FPS_MISSION.pickups, FPS_MISSION.bonus]) {
    const route = findPath(nav, FPS_MISSION.spawn, p);
    assert.ok(route?.length > 1, `${p.id} has no physical route from the spawn`);
    const end = route.at(-1);
    assert.equal(end.floor, p.floor);
    assert.ok(Math.hypot(end.x - p.x, end.z - p.z) < .08);
  }
});

test('new hostile patrols use real walkable paths and are reachable from the spawn', () => {
  assert.equal(newEnemies.length, 2);
  for (const enemy of newEnemies) {
    assert.equal(enemy.patrol.length, 2);
    for (const p of enemy.patrol) assert.equal(clear(nav, p), true, `${enemy.id} patrol blocked`);
    const path = findPath(nav, enemy.patrol[0], enemy.patrol[1]);
    assert.ok(path?.length > 1, `${enemy.id} patrol has no route`);
    for (let i = 1; i < path.length; i++) assert.ok(traceMotion(nav, path[i - 1], path[i]), `${enemy.id} patrol segment ${i}`);
    assert.ok(findPath(nav, FPS_MISSION.spawn, enemy)?.length > 1, `${enemy.id} spawn must be reachable`);
  }
});

test('the bonus objective carries the exact hold/prop contract', () => {
  const bonus = FPS_MISSION.bonus;
  assert.equal(bonus.id, 'security');
  assert.equal(bonus.title, '切断监控');
  assert.equal(bonus.prop, 'security');
  assert.equal(bonus.holdSeconds, 4);
  assert.equal(bonus.radius, 2.4);
  assert.equal(bonus.floor, 'P1-B1M');
  assert.equal(typeof bonus.description, 'string');
  assert.ok(bonus.description.length > 10);
  near(bonus.x, -127);
  near(bonus.z, -140);
  near(bonus.y, -4.5);
  assert.ok(!FPS_MISSION.enemies.some(e => e.id === bonus.id));
});

test('createMissionLayout elevates bonus/pickup/hostile y from the real floor data', () => {
  const mission = createMissionLayout(fps);
  const elevated = [...mission.pickups, mission.bonus, ...mission.enemies, ...mission.enemies.flatMap(e => e.patrol)];
  for (const p of elevated) {
    near(p.y, nav.floors.get(p.floor).y);
    near(p.y, fps.levels.find(l => l.id === p.floor).elev);
  }
  near(mission.pickups.find(p => p.id === 'intel-4').y, 6.5);
  near(mission.pickups.find(p => p.id === 'intel-5').y, 13.3);
  near(mission.pickups.find(p => p.id === 'intel-2').y, -4.5);
  near(mission.bonus.y, -4.5);
  near(mission.enemies.find(e => e.id === 'west-marksman').y, 0);
  near(mission.enemies.find(e => e.id === 'garage-elite').y, -4.5);
  near(mission.objectives[2].y, -4.5, 1e-9);
});

test('createMissionLayout deep-copies the new bonus/pickup data (no aliasing)', () => {
  const copy = createMissionLayout();
  assert.notEqual(copy.pickups, FPS_MISSION.pickups);
  assert.notEqual(copy.bonus, FPS_MISSION.bonus);
  copy.bonus.x = 0;
  copy.pickups[0].x = 0;
  copy.pickups[0].title = '被污染';
  copy.enemies.at(-1).patrol[0].x = 0;
  near(FPS_MISSION.bonus.x, -127);
  near(FPS_MISSION.pickups[0].x, -173);
  assert.equal(FPS_MISSION.pickups[0].title, '情报碎片 1');
  near(FPS_MISSION.enemies.at(-1).patrol[0].x, -45);
  // Authoring elevations are preserved when no live layout is supplied.
  near(FPS_MISSION.bonus.y, -4.5);
  near(FPS_MISSION.pickups.find(p => p.id === 'intel-1').y, 0);
  near(FPS_MISSION.pickups.find(p => p.id === 'intel-4').y, 6.5);
  near(FPS_MISSION.pickups.find(p => p.id === 'intel-5').y, 13.3);
  const raw = createMissionLayout();
  near(raw.bonus.y, -4.5); near(raw.pickups.find(p => p.id === 'intel-5').y, 13.3);
});
