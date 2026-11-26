// 首页封面（src/cover-options.js、src/launcher.js 的 renderCover）和「小游戏嵌在园区导览里」（arcade/registry.js 的 gameSpot、
// arcade/shell.js 的嵌入式外壳）能在 node 里检查的部分。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COVER_OPTIONS, DEFAULT_COVER, pickCover, coverOption, TOUR_ENTRY, FPS_ENTRIES, MP_ENTRY, mergeLaunchQuery, stripLaunchQuery, launchCleanup,
  COVER_TIERS, readCoverTier, writeCoverTier, FPS_SETTINGS_KEY } from '../src/cover-options.js';
import { renderCover } from '../src/launcher.js';
import { QUALITY_STORAGE_KEY, normalizeQuality } from '../src/render/quality.js';
import { savedTier } from '../src/runtime.js';
import { GAMES, playableGames, gameSpot } from '../src/arcade/registry.js';
import { emptyProgress, recordResult } from '../src/arcade/progress.js';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildAirspace } from '../src/arcade/airspace.js';
import { DRONE_LEVELS, dronePads, buildOrders } from '../src/arcade/games/drone-rules.js';
import { HEIST_LEVELS } from '../src/arcade/games/heist-rules.js';
import { mulberry32, seedOf } from '../src/arcade/rng.js';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const buttons = (html) => [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;

test('封面方案：a b c d 四个，?cover= 切换，给错或不给回到默认', () => {
  assert.deepEqual(COVER_OPTIONS.map((o) => o.id), ['a', 'b', 'c', 'd']);
  for (const o of COVER_OPTIONS) assert.ok(o.name && o.desc.length > 20, o.id);
  assert.ok(coverOption(DEFAULT_COVER));
  assert.equal(pickCover(''), DEFAULT_COVER);
  assert.equal(pickCover('?cover=b'), 'b');
  assert.equal(pickCover('?siege=1&cover=D'), 'd', '大小写都认');
  assert.equal(pickCover('?cover=z'), DEFAULT_COVER);
  assert.equal(pickCover('?cover='), DEFAULT_COVER);
});

test('每个方案的结构一样：园区导览一个主入口 + 小游戏快捷入口，FPS 单独一框（零点突围 / 丧尸围城 / 联机），画质，状态条', () => {
  const progress = recordResult(emptyProgress(), 'drone', 'lunch', { stars: 2 });
  for (const { id } of COVER_OPTIONS) {
    const html = renderCover(id, { progress, tier: 'balanced' });
    const btns = buttons(html), modes = btns.map((b) => attr(b, 'data-mode')).filter(Boolean);
    assert.ok(!modes.includes('arcade'), `${id}：小游戏不再是封面上的单独模式`);
    assert.ok(!modes.includes('fps'), `${id}：没有竞技 FPS`);
    const tour = btns.filter((b) => attr(b, 'data-mode') === 'tour');
    assert.equal(tour.filter((b) => !attr(b, 'data-query')).length, 1, `${id}：一个「进入园区」`);
    // 小游戏快捷入口：进园区并带 play=<游戏>，每个能玩的游戏一个
    const chips = tour.map((b) => attr(b, 'data-query')).filter(Boolean);
    assert.deepEqual(chips.sort(), playableGames().map((g) => `play=${g.id}`).sort(), id);
    assert.match(html, /2\/9★/, `${id}：快捷入口上显示星数`);
    // FPS 框
    const fps = html.slice(html.indexOf('<section class="yl-fps"'));
    assert.ok(html.includes('<section class="yl-fps"'), `${id}：有 FPS 框`);
    const q = buttons(fps).filter((b) => attr(b, 'data-mode') === 'jimao').map((b) => attr(b, 'data-query'));
    assert.deepEqual(q, ['siege=0', 'siege=1', 'siege=1&amp;mp=1'], `${id}：零点突围、丧尸围城、联机（按这个顺序）`);
    assert.ok(fps.includes(MP_ENTRY.title) && fps.includes('零点突围') && fps.includes('丧尸围城'));
    // 第一个 jimao 按钮在 FPS 框里（老脚本用 [data-mode="jimao"] 点第一个）
    assert.ok(html.indexOf('data-mode="jimao"') > html.indexOf('<section class="yl-fps"'), id);
    assert.ok(html.includes('data-cover-quality') && html.includes('<b>均衡</b>'), `${id}：画质按钮显示当前档位`);
    for (const cls of ['yl-cover-status', 'yl-cover-load', 'yl-cover-error']) assert.ok(html.includes(cls), `${id}：${cls}`);
    assert.ok(!/undefined|NaN/.test(html), id);
  }
});

test('入口数据：零点突围标题、FPS 入口参数', () => {
  assert.equal(FPS_ENTRIES[0].title, '零点突围 · ZERO HOUR');
  assert.equal(TOUR_ENTRY.mode, 'tour');
  assert.ok(FPS_ENTRIES.every((e) => e.mode === 'jimao') && MP_ENTRY.mode === 'jimao');
  assert.equal(new URLSearchParams(MP_ENTRY.query).get('mp'), '1');
});

test('带进游戏的参数：地址栏已有的不改（深链优先），封面加的键记下来，回封面时擦掉', () => {
  assert.deepEqual(mergeLaunchQuery('', 'siege=1'), { search: '?siege=1', added: ['siege'] });
  assert.deepEqual(mergeLaunchQuery('?cover=b', 'siege=1&mp=1'), { search: '?cover=b&siege=1&mp=1', added: ['siege', 'mp'] });
  assert.deepEqual(mergeLaunchQuery('?siege=1&tower=A', 'siege=0'), { search: '?siege=1&tower=A', added: [] }, '外部 ?siege=1 优先');
  assert.deepEqual(mergeLaunchQuery('?nointro=1', ''), { search: '?nointro=1', added: [] });
  assert.equal(stripLaunchQuery('?cover=b&siege=1&mp=1', ['siege', 'mp']), '?cover=b');
  assert.equal(stripLaunchQuery('?play=drone', ['play']), '');
  assert.equal(stripLaunchQuery('?siege=1', []), '?siege=1');
  // 只有「返回封面」（同一个地址刷新）才擦；同一标签页换了深链不擦
  const rec = { search: '?cover=b&siege=1', added: ['siege'] };
  assert.equal(launchCleanup('?cover=b&siege=1', rec), '?cover=b');
  assert.equal(launchCleanup('?nointro=1&siege=1&tower=A', rec), null);
  assert.equal(launchCleanup('?cover=b&siege=1', null), null);
  assert.equal(launchCleanup('?x=1', { search: '?x=1', added: [] }), null);
});

test('封面画质：漫游和 FPS 一起写，FPS 别的设置留着；读回来的档位和运行时一致', () => {
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
