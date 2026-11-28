// 首页「设置 → 画质」（src/title/tiers.js，原来在旧封面的 cover-options.js，存储的 key 不变）和
// 「小游戏嵌在园区导览里」（arcade/registry.js 的 gameSpot、arcade/shell.js 的嵌入式外壳）能在 node 里检查的部分。
// 2026-11-28 旧封面（四套方案、launcher.js）随首页换成《围城》开场一起删掉，封面方案 / 入口的测试改到 title-route、title-menu、title-boot。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COVER_TIERS, readCoverTier, writeCoverTier, FPS_SETTINGS_KEY } from '../src/title/tiers.js';
import { QUALITY_STORAGE_KEY, normalizeQuality } from '../src/render/quality.js';
import { savedTier } from '../src/runtime.js';
import { GAMES, playableGames, gameSpot } from '../src/arcade/registry.js';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildAirspace } from '../src/arcade/airspace.js';
import { DRONE_LEVELS, dronePads, buildOrders } from '../src/arcade/games/drone-rules.js';
import { HEIST_LEVELS } from '../src/arcade/games/heist-rules.js';
import { mulberry32, seedOf } from '../src/arcade/rng.js';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

test('首页画质：漫游和 FPS 一起写，FPS 别的设置留着；读回来的档位和运行时一致', () => {
  assert.deepEqual(COVER_TIERS.map((t) => t.id), ['auto', 'low', 'balanced', 'high', 'ultra']);
  const s = store({ [FPS_SETTINGS_KEY]: JSON.stringify({ quality: 'high', sens: 1.7, volume: 0.3 }) });
  assert.equal(readCoverTier(s), 'high', '漫游没存过时读 FPS 的');
  assert.equal(writeCoverTier(s, 'balanced'), true);
  assert.deepEqual(JSON.parse(s.getItem(FPS_SETTINGS_KEY)), { quality: 'medium', sens: 1.7, volume: 0.3 });
  assert.deepEqual(normalizeQuality(JSON.parse(s.getItem(QUALITY_STORAGE_KEY))), { preset: 'balanced', overrides: {} });
  assert.equal(readCoverTier(s), 'balanced');
  for (const t of ['low', 'balanced', 'high', 'ultra', 'auto']) {
    writeCoverTier(s, t);
    assert.equal(savedTier('tour', s), t, `漫游：${t}`);
    assert.equal(savedTier('jimao', s), t, `FPS：${t}`);
  }
  assert.equal(writeCoverTier(s, 'max'), false);
  assert.equal(writeCoverTier({ getItem: () => null, setItem() { throw new Error('quota'); } }, 'low'), false, '存不了不报错');
  assert.equal(readCoverTier(null), 'auto');
});

test('小游戏嵌在园区导览：完整园区上每个能玩的游戏都有地图标记，落在楼顶上方', () => {
  const tour = buildPlayableLayout({ mode: 'tour' });
  for (const g of playableGames()) {
    const at = gameSpot(tour, g);
    assert.ok(at, g.id);
    const b = tour.buildings.find((x) => x.id === g.spot.building);
    const roof = tour.levels.filter((l) => l.building === b.id).reduce((m, l) => Math.max(m, l.elev), 0);
    assert.ok(at.y > roof, `${g.id} 在屋面之上`);
    const xs = b.outline.map((p) => p[0]), zs = b.outline.map((p) => p[1]);
    assert.ok(at.x >= Math.min(...xs) && at.x <= Math.max(...xs) && at.z >= Math.min(...zs) && at.z <= Math.max(...zs), `${g.id} 在楼的范围里`);
  }
  // 无人机送外卖在完整园区上也排得出每一关的订单（取餐点在商场天台）
  const air = buildAirspace(tour), pads = dronePads(tour, air);
  assert.equal(pads[0].id, 'hub');
  for (const [id, cfg] of Object.entries(DRONE_LEVELS)) assert.equal(buildOrders(tour, pads, cfg, mulberry32(seedOf(`drone:${id}`))).length, cfg.orders, id);
  // 夜间潜入的目标楼层在完整园区里都在
  for (const o of HEIST_LEVELS.gallery.objectives) assert.ok(tour.levels.some((l) => l.id === o.level), o.level);
  assert.equal(gameSpot(tour, { spot: { building: 'nope' } }), null);
  assert.equal(gameSpot(tour, GAMES.find((g) => g.status === 'soon')), null, '没开放的游戏不插标记');
});

test('园区导览挂嵌入式小游戏外壳；独立小游戏模式照旧', () => {
  const rt = readFileSync(new URL('../src/runtime.js', import.meta.url), 'utf8');
  assert.match(rt, /attachArcade\(app,ui,\{embedded:true,focus:new URLSearchParams\(location\.search\)\.get\('play'\)\}\)/);
  assert.match(rt, /if\(mode==='arcade'\)window\.__arcade=attachArcade\(app,ui\);/);
  const sh = readFileSync(new URL('../src/arcade/shell.js', import.meta.url), 'utf8');
  // 嵌入时：列表里「回到导览」，结算 / 暂停里也有，Esc 关列表；入口在工具栏和手机底栏
  for (const s of ['data-hub="free">回到导览', 'data-dlg="tour">回到导览', "e.code === 'Escape' && embedded", "getElementById('toolbar')", "getElementById('mobileDock')", 'arcade-pins']) assert.ok(sh.includes(s), s);
});
