import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_TYPES, enemyType, inVisionCone, perceiveEnemy, explosionAlert, isUnaware,
  enemyShotChance, damageEnemy } from '../src/fps/enemy-tactics.js';

const enemy = (type = 'scout', overrides = {}) => ({ type, floor: 'P1-1F', x: 0, y: 0, z: 0, yaw: 0,
  alert: 0, health: ENEMY_TYPES[type].health, ammo: 10, reload: 0, ...overrides });
const target = (x, z, overrides = {}) => ({ floor: 'P1-1F', x, y: 0, z, ...overrides });

test('marksman is the long-range single-shot profile and tops the aiming order', () => {
  const marksman = ENEMY_TYPES.marksman;
  assert.ok(marksman, 'marksman type must exist');
  assert.equal(marksman.label, '狙击手');
  assert.equal(enemyType({ type: 'marksman' }), marksman);
  assert.equal(marksman.range, 52);
  assert.equal(marksman.burst, 1, 'single heavy shot per engagement');
  assert.equal(marksman.clip, 5);
  assert.equal(marksman.damage, 16);
  assert.equal(marksman.health, 64);
  for (const other of ['scout', 'assault', 'heavy']) {
    assert.ok(marksman.range > ENEMY_TYPES[other].range, `marksman outranges ${other}`);
    assert.ok(marksman.accuracy > ENEMY_TYPES[other].accuracy, `marksman outshoots ${other}`);
    assert.ok(marksman.preferred > ENEMY_TYPES[other].preferred, `marksman holds farther than ${other}`);
  }
  assert.ok(marksman.accuracy > .54 && marksman.accuracy < 1);
  assert.ok(ENEMY_TYPES.assault.speed > ENEMY_TYPES.marksman.speed && ENEMY_TYPES.marksman.speed > ENEMY_TYPES.heavy.speed);
  // Legacy profile ordering is a compatibility contract.
  assert.ok(ENEMY_TYPES.assault.speed > ENEMY_TYPES.heavy.speed);
  assert.ok(ENEMY_TYPES.heavy.reload > ENEMY_TYPES.scout.reload);
  assert.ok(ENEMY_TYPES.heavy.armor < ENEMY_TYPES.scout.armor);
});

test('rangeScale shortens vision without changing floor, cone or point-blank rules', () => {
  const scout = enemy('scout'), far = target(0, 28);
  assert.equal(inVisionCone(scout, far), true, 'two-arg legacy call keeps full range');
  assert.equal(inVisionCone(scout, far, 1), true);
  assert.equal(inVisionCone(scout, far, .72), false, 'bonus objective cuts 28m down to 23m');
  assert.equal(inVisionCone(scout, far, 1.2), true);
  assert.equal(inVisionCone(scout, target(0, 33), 1), false);
  assert.equal(inVisionCone(scout, target(0, 33), 1.2), true);
  // Floor separation and the forward cone never scale away.
  assert.equal(inVisionCone(scout, target(0, 10, { floor: 'H-2F' }), 3), false);
  assert.equal(inVisionCone(scout, target(-20, 0), 3), false);
  scout.alert = 12;
  assert.equal(inVisionCone(scout, target(-12, 0), .5), true, 'an alerted hostile turns toward contact in range');
  assert.equal(inVisionCone(scout, target(-20, 0), .5), false, 'alert never extends the scaled range');
  // Point-blank detection stays even when facing away.
  assert.equal(inVisionCone(enemy('scout'), target(4, 0), .72), true);
});

test('perceiveEnemy forwards rangeScale to both player and ally checks', () => {
  const player = target(0, 20);
  const seen = enemy('scout');
  assert.equal(perceiveEnemy(seen, { player, ally: null, noise: null, elapsed: 0, visible: () => true }), player);
  assert.equal(seen.seesPlayer, true); assert.equal(seen.state, 'engage');
  const blinded = enemy('scout');
  assert.equal(perceiveEnemy(blinded, { player, ally: null, noise: null, elapsed: 0, visible: () => true, rangeScale: .5 }), null);
  assert.equal(blinded.seesPlayer, false); assert.equal(blinded.alert, 0); assert.equal(blinded.state, 'patrol');
  const cut = enemy('assault'), ally = target(1, 18, { health: 100 });
  const long = perceiveEnemy(cut, { player, ally, noise: null, elapsed: 0, visible: () => true });
  assert.equal(long, player, 'closest visible contact is still picked when both are visible');
  const short = perceiveEnemy(enemy('assault'), { player, ally: null, noise: null, elapsed: 0, visible: () => true, rangeScale: .72 });
  assert.equal(short, player, '37m * .72 still covers a 20m contact');
  // Visibility callback still gates a scaled contact.
  const hidden = enemy('marksman');
  assert.equal(perceiveEnemy(hidden, { player: target(0, 40), ally: null, noise: null, elapsed: 0, visible: () => false }), null);
  assert.equal(hidden.seesPlayer, false);
});

test('a blast turns every hostile on the floor toward the detonation', () => {
  const guard = enemy('heavy', { x: 6, z: 4 });
  assert.equal(isUnaware(guard), true);
  const point = { floor: 'P1-1F', x: 12, y: 0, z: -3, slope: null };
  assert.equal(explosionAlert(guard, point), true);
  assert.equal(guard.alert, 12);
  assert.deepEqual(guard.lastKnown, { floor: 'P1-1F', x: 12, y: 0, z: -3, slope: null });
  assert.notEqual(guard.lastKnown, point, 'lastKnown is a memory copy, not the live point');
  point.x = -999;
  assert.equal(guard.lastKnown.x, 12);
  assert.equal(guard.state, 'investigate');
  assert.equal(isUnaware(guard), false);
  // Other floors ignore the sound, and bad input is harmless.
  const upstairs = enemy('scout', { floor: 'H-2F' });
  assert.equal(explosionAlert(upstairs, point), false);
  assert.equal(upstairs.alert, 0); assert.equal(upstairs.lastKnown, undefined);
  assert.equal(explosionAlert(null, point), false);
  assert.equal(explosionAlert(guard, null), false);
  assert.equal(guard.alert, 12, 'ignored input never clears an existing alert');
});

test('investigation memory survives the next perception tick without a target', () => {
  const guard = enemy('scout');
  explosionAlert(guard, { floor: 'P1-1F', x: 9, y: 0, z: 9 });
  const seen = perceiveEnemy(guard, { player: target(0, 30), ally: null, noise: null, elapsed: 1, visible: () => false });
  assert.equal(seen, null);
  assert.equal(guard.state, 'investigate');
  assert.equal(guard.seesPlayer, false);
  assert.deepEqual(guard.lastKnown, { floor: 'P1-1F', x: 9, y: 0, z: 9, slope: null });
  // Reloading outranks investigation for animation state, as before.
  guard.reload = 1;
  perceiveEnemy(guard, { player: target(0, 30), ally: null, noise: null, elapsed: 2, visible: () => false });
  assert.equal(guard.state, 'reload');
});

test('isUnaware only reports hostiles with no visual or audible contact', () => {
  assert.equal(isUnaware(enemy()), true);
  assert.equal(isUnaware(enemy('scout', { seesPlayer: true })), false);
  assert.equal(isUnaware(enemy('scout', { seesAlly: true })), false);
  assert.equal(isUnaware(enemy('scout', { alert: 1 })), false);
  assert.equal(isUnaware(enemy('scout', { seesPlayer: false, seesAlly: false, alert: 0 })), true);
  // Perception clears stale flags after losing contact but keeps the alert hot.
  const guard = enemy('scout', { seesPlayer: true });
  perceiveEnemy(guard, { player: target(0, 30), ally: null, noise: null, elapsed: 0, visible: () => false });
  assert.equal(guard.seesPlayer, false);
  assert.equal(isUnaware(guard), true);
});

test('marksman accuracy/damage resolve against the same deterministic functions', () => {
  const spot = { x: 0, z: 0 };
  assert.ok(enemyShotChance(enemy('marksman'), { ...spot, z: 8 }) > enemyShotChance(enemy('scout'), { ...spot, z: 8 }));
  assert.ok(enemyShotChance(enemy('marksman'), { ...spot, z: 45 }) > enemyShotChance(enemy('assault'), { ...spot, z: 45 }),
    'single-shot marksman stays accurate at extreme range');
  const rifleman = enemy('marksman');
  damageEnemy(rifleman, 20);
  assert.equal(rifleman.health, 44, 'unarmored marksman takes full torso damage');
  assert.equal(rifleman.alert, 12);
  damageEnemy(rifleman, 100, true);
  assert.equal(rifleman.health, 0);
});
