import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, DIFFICULTIES, WEAPONS, tickRun, fireWeapon, reloadWeapon, switchWeapon,
  damagePlayer, healPlayer, throwGrenade, meleeAttack, awardKill, addArmor, addMedkit, addGrenade,
  collectIntel, pushFeed, gradeFor, finishRun } from '../src/fps/rules.js';

const tick = (s, n) => { for (let i = 0; i < n; i++) tickRun(s, .1); };
const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon,
  `expected ${expected}, got ${actual}`);

test('difficulty presets are exact and createRun only scales the documented fields', () => {
  assert.deepEqual(DIFFICULTIES.standard, { id: 'standard', label: '标准', enemyDamage: 1, enemyAccuracy: 1, extractionScale: 1, medkits: 2, grenades: 2 });
  assert.deepEqual(DIFFICULTIES.veteran, { id: 'veteran', label: '老兵', enemyDamage: 1.35, enemyAccuracy: 1.18, extractionScale: 1.2, medkits: 1, grenades: 1 });
  assert.ok(Object.isFrozen(DIFFICULTIES) && Object.isFrozen(DIFFICULTIES.veteran));
  const standard = createRun(), veteran = createRun({ difficulty: 'veteran' }), broken = createRun({ difficulty: 'nightmare' });
  assert.equal(standard.difficulty, 'standard');
  assert.equal(standard.medkits, 2); assert.equal(standard.grenades, 2);
  assert.equal(veteran.difficulty, 'veteran');
  assert.equal(veteran.medkits, 1); assert.equal(veteran.grenades, 1);
  assert.equal(broken.difficulty, 'standard', 'unknown difficulty must fall back to standard');
  for (const run of [standard, veteran]) {
    assert.equal(run.armor, 0); assert.equal(run.maxArmor, 100);
    assert.equal(run.maxGrenades, 4); assert.equal(run.maxMedkits, 4);
    assert.equal(run.meleeCooldown, 0); assert.equal(run.grenadeCooldown, 0);
    assert.equal(run.score, 0); assert.equal(run.streak, 0); assert.equal(run.bestStreak, 0);
    assert.equal(run.multiplier, 1); assert.equal(run.headshots, 0);
    assert.equal(run.damageTaken, 0); assert.equal(run.medkitsUsed, 0);
    assert.equal(run.intelFound, 0); assert.equal(run.intelTotal, 5);
    assert.equal(run.bonusComplete, false);
    assert.deepEqual(run.feed, []); assert.equal(run.feedSeq, 0);
  }
  // Weapon tuning is a compatibility contract; difficulty must not touch it.
  assert.deepEqual(WEAPONS.map(w => w.id), ['rifle', 'pistol']);
  assert.equal(createRun().magazines[0], WEAPONS[0].magazine);
});

test('armor absorbs 65% of each hit, depletes first and never goes negative', () => {
  const bare = createRun();
  assert.equal(damagePlayer(bare, 40), true);
  assert.equal(bare.hp, 60); assert.equal(bare.armor, 0); assert.equal(bare.damageTaken, 40);

  const plate = createRun();
  assert.equal(addArmor(plate, 100), 100);
  damagePlayer(plate, 20);
  near(plate.armor, 87); near(plate.hp, 93); near(plate.damageTaken, 7);
  // Full plate then a big hit: 32.5 absorbed, 67.5 reaches health.
  damagePlayer(plate, 50);
  near(plate.armor, 54.5); near(plate.hp, 75.5); near(plate.damageTaken, 24.5);
  // Partially armored: absorb exactly the remaining plate, overflow to health.
  const thin = createRun(); addArmor(thin, 10);
  damagePlayer(thin, 40);
  near(thin.armor, 0); near(thin.hp, 70); near(thin.damageTaken, 30);
  assert.equal(addArmor(thin, 500), 100, 'armor gain is capped at maxArmor');
});

test('armor-less damage still kills exactly like the old rules and grades D', () => {
  const run = createRun();
  run.paused = true; assert.equal(damagePlayer(run, 100), false); assert.equal(run.hp, 100);
  run.paused = false;
  assert.equal(damagePlayer(run, 110), true);
  assert.equal(run.status, 'failed'); assert.equal(run.paused, true);
  assert.equal(run.result.success, false); assert.equal(run.result.grade, 'D');
  assert.equal(damagePlayer(run, 10), false, 'a finished run rejects further damage');
});

test('grenades consume a finite count and cool down on the run timer', () => {
  const run = createRun();
  assert.equal(run.grenades, 2);
  assert.equal(throwGrenade(run), true); assert.equal(run.grenades, 1); near(run.grenadeCooldown, .9);
  assert.equal(throwGrenade(run), false, 'cannot chain-throw during the cooldown');
  tick(run, 8); assert.ok(run.grenadeCooldown > 0);
  tick(run, 1); assert.equal(run.grenadeCooldown, 0);
  assert.equal(throwGrenade(run), true); assert.equal(run.grenades, 0);
  assert.equal(throwGrenade(run), false, 'no grenades left');
  addGrenade(run, 2); assert.equal(run.grenades, 2);
  assert.equal(addGrenade(run, 99), 2, 'carry cap is maxGrenades');
  assert.equal(run.grenades, 4);
  run.paused = true; assert.equal(throwGrenade(run), false);
});

test('melee swing respects its cooldown and busy weapon states', () => {
  const run = createRun();
  assert.equal(meleeAttack(run), true); near(run.meleeCooldown, .72);
  assert.equal(meleeAttack(run), false, 'cooldown blocks the second swing');
  tick(run, 7); assert.ok(run.meleeCooldown > 0);
  tick(run, 1); assert.equal(run.meleeCooldown, 0);
  assert.equal(meleeAttack(run), true);
  tick(run, 8);

  tick(run, 8);
  assert.equal(reloadWeapon(run), false, 'full magazine nowhere to reload');
  fireWeapon(run); assert.equal(reloadWeapon(run), true);
  assert.equal(meleeAttack(run), false, 'melee blocked while reloading');
  tick(run, 24);

  assert.equal(run.healTime, 0); damagePlayer(run, 40); assert.equal(healPlayer(run), true);
  assert.equal(meleeAttack(run), false, 'melee blocked while healing');
  tick(run, 17);

  assert.equal(switchWeapon(run), true);
  assert.equal(meleeAttack(run), false, 'melee blocked while swapping weapons');
  tick(run, 7);
  assert.equal(meleeAttack(run), true);
  run.paused = true; assert.equal(meleeAttack(run), false);
});

test('kills build a capped streak multiplier and track headshots deterministically', () => {
  const run = createRun();
  assert.deepEqual(awardKill(run), { points: 115, multiplier: 1.15 });
  assert.deepEqual(awardKill(run, { headshot: true }), { points: 195, multiplier: 1.3 });
  assert.deepEqual(awardKill(run, { headshot: true, melee: true, stealth: true }), { points: 399, multiplier: 1.45 });
  assert.equal(run.kills, 3); assert.equal(run.streak, 3); assert.equal(run.bestStreak, 3);
  assert.equal(run.headshots, 2); assert.equal(run.score, 115 + 195 + 399);
  for (let i = 0; i < 9; i++) awardKill(run);
  assert.equal(run.streak, 12); assert.equal(run.multiplier, 1.75, 'streak bonus caps at +75%');
  assert.equal(run.bestStreak, 12); assert.equal(run.headshots, 2);
  const before = run.score;
  awardKill(run);
  assert.equal(run.score - before, 175, 'a plain kill at cap pays 100 * 1.75');
  assert.ok(Number.isInteger(run.score) && Number.isInteger(run.multiplier * 100));
});

test('medkits and grenades are carry-capped, and consumed kits are counted', () => {
  const run = createRun();
  damagePlayer(run, 60);
  assert.equal(healPlayer(run), true);
  assert.equal(run.medkits, 1); assert.equal(run.medkitsUsed, 1);
  tick(run, 17); assert.equal(run.hp, 95);
  assert.equal(addMedkit(run, 10), 3, 'tops up to maxMedkits=4');
  assert.equal(run.medkits, 4);
  damagePlayer(run, 60); healPlayer(run); tick(run, 17);
  assert.equal(run.medkitsUsed, 2);
  assert.equal(addMedkit(run, -5), 0); assert.equal(run.medkits, 3);
});

test('intel chips clamp at intelTotal, pay 150 each and feed the HUD', () => {
  const run = createRun();
  for (let i = 1; i <= 5; i++) {
    assert.equal(collectIntel(run), true);
    assert.equal(run.intelFound, i); assert.equal(run.score, i * 150);
    assert.equal(run.feed.at(-1).text, `情报碎片 ${i}/5`);
    assert.equal(run.feed.at(-1).tone, 'intel');
  }
  assert.equal(collectIntel(run), false, 'a sixth chip is ignored');
  assert.equal(run.intelFound, 5); assert.equal(run.score, 750);
  const short = createRun();
  assert.equal(collectIntel(short, 2), true);
  assert.equal(collectIntel(short, 2), true);
  assert.equal(collectIntel(short, 2), false);
  short.paused = true; assert.equal(collectIntel(short, 9), false, 'paused runs cannot collect');
});

test('pushFeed keeps five newest entries in chronological order with a run timestamp', () => {
  const run = createRun();
  tick(run, 12);
  const first = pushFeed(run, '首个目标完成');
  assert.equal(first.id, 1); assert.equal(first.text, '首个目标完成'); assert.equal(first.tone, 'system');
  near(first.at, 1.2);
  pushFeed(run, '爆头击杀', 'headshot');
  for (let i = 0; i < 5; i++) pushFeed(run, `事件 ${i}`, 'kill');
  assert.equal(run.feed.length, 5);
  assert.deepEqual(run.feed.map(e => e.id), [3, 4, 5, 6, 7]);
  assert.equal(run.feed.at(-1).text, '事件 4');
  assert.equal(run.feed.at(-1).at, run.elapsed);
  assert.equal(pushFeed(run, '连杀 x3', 'streak').tone, 'streak');
});

test('tickRun freezes action cooldowns while paused or after the run ends', () => {
  const run = createRun();
  throwGrenade(run); meleeAttack(run);
  run.paused = true;
  tick(run, 20);
  assert.equal(run.grenadeCooldown, .9); assert.equal(run.meleeCooldown, .72);
  run.paused = false;
  tick(run, 20);
  assert.equal(run.grenadeCooldown, 0); assert.equal(run.meleeCooldown, 0);
  throwGrenade(run); finishRun(run, true);
  tick(run, 20);
  assert.ok(run.grenadeCooldown > 0, 'result state stops the timer');
});

test('finishRun keeps legacy fields and adds the full v5 result payload', () => {
  const run = createRun({ difficulty: 'veteran' });
  tick(run, 100);
  fireWeapon(run); tick(run, 2); fireWeapon(run);
  run.hits = 1;
  awardKill(run, { headshot: true });
  collectIntel(run); collectIntel(run);
  addArmor(run, 25); damagePlayer(run, 20);
  addMedkit(run, 1); damagePlayer(run, 30); healPlayer(run); tick(run, 17);
  run.bonusComplete = true;
  const result = finishRun(run, true);
  assert.equal(result.time, 12);
  assert.equal(result.success, true); assert.equal(result.title, '行动完成');
  assert.equal(typeof result.subtitle, 'string');
  assert.equal(result.kills, 1); assert.equal(result.shots, 2); assert.equal(result.accuracy, 50);
  assert.equal(result.intel, 0, 'legacy intel stage field still mirrors stage, not intelFound');
  const staged = createRun(); staged.stage = 2; finishRun(staged, true);
  assert.equal(staged.result.intel, 2, 'legacy intel stage field is capped at 2');
  assert.equal(result.teammate, true);
  assert.equal(result.difficulty, 'veteran'); assert.equal(result.difficultyLabel, '老兵');
  assert.equal(result.score, run.score); assert.equal(result.grade, gradeFor(run, true));
  assert.equal(result.headshots, 1); assert.equal(result.bestStreak, 1);
  assert.equal(result.intelFound, 2); assert.equal(result.intelTotal, 5);
  assert.equal(result.bonusComplete, true);
  near(result.damageTaken, 25, 1e-9); assert.equal(result.medkitsUsed, 1);
  assert.equal(finishRun(run, false), result, 'finishing twice returns the frozen original result');
  assert.equal(result.success, true);
});

test('gradeFor is deterministic and rewards speed, score, accuracy, intel and bonus', () => {
  const stub = overrides => ({ elapsed: 700, score: 0, shots: 0, hits: 0, intelFound: 0, intelTotal: 5, bonusComplete: false, ...overrides });
  assert.equal(gradeFor(stub({}), false), 'D', 'failed runs always grade D');
  assert.equal(gradeFor(stub({ bonusComplete: true }), false), 'D');
  assert.equal(gradeFor(stub({}), true), 'C');
  assert.equal(gradeFor(stub({ elapsed: 700, score: 0, shots: 10, hits: 0, intelFound: 1 }), true), 'C');
  assert.equal(gradeFor(stub({ elapsed: 500, score: 1000, shots: 100, hits: 32, intelFound: 3 }), true), 'B');
  assert.equal(gradeFor(stub({ elapsed: 300, score: 1000, shots: 100, hits: 50, intelFound: 5 }), true), 'A');
  assert.equal(gradeFor(stub({ elapsed: 300, score: 1600, shots: 100, hits: 60, intelFound: 5, bonusComplete: true }), true), 'S');
  assert.equal(gradeFor(stub({ elapsed: 350, score: 1700, shots: 100, hits: 70, intelFound: 5, bonusComplete: true }), true), 'S');
  // Determinism: identical states always produce the same badge, and the
  // result grade is never computed from wallclock/randomness.
  const state = stub({ elapsed: 320, score: 1100, shots: 80, hits: 40, intelFound: 5, bonusComplete: true });
  assert.equal(gradeFor(state, true), gradeFor({ ...state }, true));
  const run = createRun(); finishRun(run, true);
  assert.equal(run.result.grade, 'C', 'instant zero-score success lands at C');
});
