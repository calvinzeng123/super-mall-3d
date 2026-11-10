// 小游戏进度（src/arcade/progress.js）和目录（registry.js）、输入换算（input.js）的纯逻辑。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCADE_STORAGE_KEY, MAX_STARS, emptyProgress, normalizeProgress, recordResult, levelStars, gameStars, totalStars,
  isLevelUnlocked, loadProgress, saveProgress } from '../src/arcade/progress.js';
import { GAMES, gameById, playableGames } from '../src/arcade/registry.js';
import { axesFromKeys, stickAxes } from '../src/arcade/input.js';
import { mulberry32, seedOf, sample } from '../src/arcade/rng.js';
import { DRONE_LEVELS } from '../src/arcade/games/drone-rules.js';
import { HEIST_LEVELS } from '../src/arcade/games/heist-rules.js';

const game = { id: 'g', levels: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };

test('a result keeps the best stars and score, and the time of the best-star run', () => {
  let p = recordResult(emptyProgress(), 'g', 'a', { stars: 2, score: 300, seconds: 90 });
  assert.deepEqual(p.games.g.a, { stars: 2, score: 300, plays: 1, seconds: 90 });
  p = recordResult(p, 'g', 'a', { stars: 1, score: 500, seconds: 40 }); // 星少：时间不算，分数取高
  assert.deepEqual(p.games.g.a, { stars: 2, score: 500, plays: 2, seconds: 90 });
  p = recordResult(p, 'g', 'a', { stars: 2, score: 100, seconds: 70 }); // 同星更快
  assert.equal(p.games.g.a.seconds, 70);
  p = recordResult(p, 'g', 'a', { stars: 3, score: 100, seconds: 120 }); // 更高星：换成这一局的时间
  assert.deepEqual(p.games.g.a, { stars: 3, score: 500, plays: 4, seconds: 120 });
  p = recordResult(p, 'g', 'a', { stars: 9, seconds: -1 });
  assert.equal(p.games.g.a.stars, MAX_STARS);
  assert.equal(recordResult(emptyProgress(), 'g', 'a', {}).games.g.a.stars, 0);
});

test('recordResult does not mutate its input', () => {
  const before = recordResult(emptyProgress(), 'g', 'a', { stars: 1 }), copy = structuredClone(before);
  recordResult(before, 'g', 'a', { stars: 3 });
  assert.deepEqual(before, copy);
});

test('later levels open after one star on the level before', () => {
  let p = emptyProgress();
  assert.equal(isLevelUnlocked(p, game, 'a'), true);
  assert.equal(isLevelUnlocked(p, game, 'b'), false);
  p = recordResult(p, 'g', 'a', { stars: 0 });
  assert.equal(isLevelUnlocked(p, game, 'b'), false);
  p = recordResult(p, 'g', 'a', { stars: 1 });
  assert.equal(isLevelUnlocked(p, game, 'b'), true);
  assert.equal(isLevelUnlocked(p, game, 'c'), false);
  assert.equal(isLevelUnlocked(p, game, 'nope'), false);
  assert.equal(levelStars(p, 'g', 'a'), 1);
  assert.equal(gameStars(p, game), 1);
  assert.equal(totalStars(p, [game, { id: 'soon' }]), 1);
});

test('saved data is validated on the way in, and storage failures do not throw', () => {
  assert.deepEqual(normalizeProgress(null), emptyProgress());
  assert.deepEqual(normalizeProgress({ games: { g: { a: { stars: '2', score: 'x', seconds: 0, plays: 1.5 }, b: null }, bad: 3 } }),
    { version: 1, games: { g: { a: { stars: 2, score: 0, seconds: null, plays: 0 } } } });
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const p = recordResult(emptyProgress(), 'drone', 'lunch', { stars: 3, score: 509, seconds: 131 });
  assert.equal(saveProgress(storage, p), true);
  assert.ok(store.has(ARCADE_STORAGE_KEY));
  assert.deepEqual(loadProgress(storage), p);
  store.set(ARCADE_STORAGE_KEY, '{not json');
  assert.deepEqual(loadProgress(storage), emptyProgress());
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadProgress(broken), emptyProgress());
  assert.equal(saveProgress(broken, p), false);
  assert.deepEqual(loadProgress(null), emptyProgress());
});

test('the registry is consistent: unique ids, playable games have levels, a loader and a rules entry per level', async () => {
  assert.equal(new Set(GAMES.map((g) => g.id)).size, GAMES.length);
  assert.deepEqual(playableGames().map((g) => g.id), ['drone', 'heist']);
  assert.equal(gameById('nope'), null);
  const rules = { drone: DRONE_LEVELS, heist: HEIST_LEVELS };
  for (const g of GAMES) {
    assert.ok(g.title && g.tagline, g.id);
    if (g.status !== 'playable') { assert.equal(g.status, 'soon'); assert.equal(g.load, undefined); continue; }
    assert.ok(g.levels.length >= 1 && g.controls.keys && g.controls.touch, g.id);
    assert.equal(new Set(g.levels.map((l) => l.id)).size, g.levels.length);
    for (const l of g.levels) assert.ok(rules[g.id][l.id], `${g.id}:${l.id} has no rules entry`);
    assert.deepEqual(Object.keys(rules[g.id]), g.levels.map((l) => l.id));
    const mod = await g.load();
    assert.equal(typeof mod.createGame, 'function', `${g.id} module exports createGame`);
  }
});

test('keys and sticks map onto the four axes', () => {
  assert.deepEqual(axesFromKeys(new Set()), { lx: 0, ly: 0, rx: 0, ry: 0 });
  assert.deepEqual(axesFromKeys(new Set(['KeyW', 'KeyD', 'ArrowLeft', 'Space'])), { lx: 1, ly: 1, rx: -1, ry: 1 });
  assert.deepEqual(axesFromKeys(new Set(['KeyA', 'KeyD', 'KeyS', 'ShiftLeft', 'KeyE'])), { lx: 0, ly: -1, rx: 1, ry: -1 });
  assert.deepEqual(stickAxes(3, -3, 60), { x: 0, y: 0 }); // 死区
  const up = stickAxes(0, -30, 60);
  assert.ok(Math.abs(up.x) < 1e-9 && Math.abs(up.y - 0.5) < 1e-9); // 屏幕向上 = 前进
  const far = stickAxes(120, 0, 60);
  assert.ok(Math.abs(far.x - 1) < 1e-9 && Math.abs(far.y) < 1e-9); // 推出圈外也只算满
  const diag = stickAxes(100, 100, 60);
  assert.ok(Math.abs(Math.hypot(diag.x, diag.y) - 1) < 1e-9 && diag.y < 0);
});

test('the level seed gives the same draw every time', () => {
  const a = mulberry32(seedOf('drone:lunch')), b = mulberry32(seedOf('drone:lunch')), c = mulberry32(seedOf('drone:dinner'));
  const xs = [a(), a(), a()], ys = [b(), b(), b()], zs = [c(), c(), c()];
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
  for (const x of xs) assert.ok(x >= 0 && x < 1);
  const picked = sample(mulberry32(1), [1, 2, 3, 4, 5], 3);
  assert.equal(new Set(picked).size, 3);
  assert.equal(sample(mulberry32(1), [1, 2], 5).length, 2);
});
