// 首页启动路由（src/title/route.js）：开场播哪一版、深链、从游戏返回时擦参数、入口参数、联机服务器探测。全是纯函数（探测注入假 fetch）
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRIES, findEntry, introVersion, markIntroSeen, deepLink, returnCleanup, entrySearch, probeServer, healthUrl, arcadeStars,
  INTRO_SEEN_KEY, INTRO_PREF_KEY, RETURNING_KEY } from '../src/title/route.js';
import { recordResult, emptyProgress } from '../src/arcade/progress.js';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

test('开场版本：首访完整版，看过一次短版，设置里能指定，减少动态效果 / 从游戏返回都不播', () => {
  const s = store();
  assert.equal(introVersion({ search: '', storage: s, reducedMotion: false }), 'full');
  markIntroSeen(s);
  assert.equal(s.getItem(INTRO_SEEN_KEY), '1');
  assert.equal(introVersion({ search: '', storage: s, reducedMotion: false }), 'short');
  assert.equal(introVersion({ search: '', storage: store({ [INTRO_PREF_KEY]: 'none' }), reducedMotion: false }), 'none');
  assert.equal(introVersion({ search: '', storage: store({ [INTRO_SEEN_KEY]: '1', [INTRO_PREF_KEY]: 'full' }), reducedMotion: false }), 'full', '设置成总是完整版');
  assert.equal(introVersion({ search: '', storage: store({ [INTRO_PREF_KEY]: 'short' }), reducedMotion: false }), 'short');
  assert.equal(introVersion({ search: '', storage: store({ [INTRO_PREF_KEY]: '乱写' }), reducedMotion: false }), 'full', '认不得的设置当没设');
  assert.equal(introVersion({ search: '', storage: store(), reducedMotion: true }), 'none');
  assert.equal(introVersion({ search: '', storage: store({ [INTRO_PREF_KEY]: 'full' }), reducedMotion: true }), 'none', '减少动态效果优先');
  assert.equal(introVersion({ search: '', storage: store(), session: store({ [RETURNING_KEY]: '1' }), reducedMotion: false }), 'none', '从游戏返回');
  assert.equal(introVersion({ search: '', storage: store({ [RETURNING_KEY]: '1' }), reducedMotion: false }), 'none', '只给一个 storage 时也认');
  assert.equal(introVersion({ search: '', storage: store({ [RETURNING_KEY]: '1' }), session: store(), reducedMotion: false }), 'full',
    '给了 sessionStorage 就只认它：localStorage 里误留的返回标记不会把开场永远关掉');
  assert.equal(introVersion({ search: '', storage: null, reducedMotion: false }), 'full', '存不了（无痕）当首访');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(introVersion({ search: '', storage: broken, reducedMotion: false }), 'full');
  assert.doesNotThrow(() => markIntroSeen(broken));
  assert.equal(introVersion({ search: '?intro=short', storage: store(), reducedMotion: false }), 'short', '?intro= 调试用');
  // 调试参数不改开场版本
  assert.equal(introVersion({ search: '?guns=now&t=3&shot=1', storage: store(), reducedMotion: false }), 'full');
});

test('深链：只有有效房间码直接进联机，其它只预选菜单项，调试参数什么都不触发', () => {
  const r = deepLink('?room=ab12cd');
  assert.ok(r.direct);
  assert.equal(r.direct.mode, 'jimao');
  const q = new URLSearchParams(r.direct.query);
  assert.equal(q.get('room'), 'AB12CD'); assert.equal(q.get('autostart'), '1'); assert.equal(q.get('mp'), '1'); assert.equal(q.get('siege'), '1');
  assert.equal(deepLink('?room=a!').direct, null, '无效房间码不直进');
  assert.equal(deepLink('?room=').direct, null);
  assert.equal(deepLink('?siege=1').preselect, 'siege');
  assert.equal(deepLink('?siege=1').direct, null);
  assert.equal(deepLink('?siege=0').preselect, 'zero');
  assert.equal(deepLink('?mp=1').direct, null);
  assert.equal(deepLink('?mp=1').preselect, 'coop');
  assert.equal(deepLink('?siege=1&mp=1').preselect, 'coop', 'mp 优先');
  assert.equal(deepLink('?play=drone').preselect, 'more');
  assert.equal(deepLink('?play=heist').preselect, 'more');
  assert.equal(deepLink('?play=glide').preselect, null, '还不能玩的不预选');
  assert.equal(deepLink('?guns=now&t=3').preselect, null);
  assert.equal(deepLink('?guns=now&t=3').direct, null);
  assert.deepEqual(deepLink('?nointro=1&cover=b&shot=2'), { direct: null, preselect: null });
  assert.deepEqual(deepLink(''), { direct: null, preselect: null });
});

test('从游戏返回：擦掉 room / mp / siege / play / autostart，别的参数原样留', () => {
  assert.equal(returnCleanup('?room=AB12CD&mp=1&siege=1&quality=low'), '?quality=low');
  assert.equal(returnCleanup('?siege=0&autostart=1'), '');
  assert.equal(returnCleanup('?play=drone&guns=now'), '?guns=now');
  assert.equal(returnCleanup(''), '');
});

test('入口参数：并进地址栏时入口的值优先，上一局带进来的启动参数先擦掉', () => {
  const zero = findEntry('zero');
  assert.equal(entrySearch('?quality=low', zero), '?quality=low&siege=0&autostart=1');
  assert.equal(entrySearch('?siege=1&mp=1&room=AB12CD', zero), '?siege=0&autostart=1');
  assert.equal(entrySearch('', findEntry('tour')), '');
  assert.equal(entrySearch('?guns=now', findEntry('drone')), '?guns=now&play=drone');
});

test('入口表：一级 6 项、顺序固定；每项都有中文说明；能进游戏的都带 mode', () => {
  assert.deepEqual(ENTRIES.map((e) => e.id), ['siege', 'coop', 'zero', 'tour', 'more', 'settings']);
  assert.deepEqual(ENTRIES.map((e) => e.label), ['丧尸围城（单人）', '联机 · 三人', '零点突围', '园区漫游', '更多玩法', '设置']);
  assert.deepEqual(ENTRIES.map((e) => e.en), ['CAMPAIGN', 'CO-OP', 'ZERO HOUR', 'FREE ROAM', 'MORE', 'SETTINGS']);
  assert.deepEqual(ENTRIES.slice(0, 4).map((e) => [e.mode, e.query]), [['jimao', 'siege=1&autostart=1'], ['jimao', 'siege=1&mp=1&autostart=1'], ['jimao', 'siege=0&autostart=1'], ['tour', '']]);
  assert.deepEqual(findEntry('more').children.map((c) => [c.id, c.mode, c.query]), [['drone', 'tour', 'play=drone'], ['heist', 'tour', 'play=heist']]);
  for (const e of [...ENTRIES, ...findEntry('more').children]) assert.ok(/[一-鿿]/.test(e.desc || ''), `${e.id} 没有说明`);
  assert.equal(findEntry('nope'), null);
  assert.ok(Object.isFrozen(ENTRIES) && Object.isFrozen(ENTRIES[0]));
});

test('小游戏星数：按本机进度算，「已得/满分」', () => {
  const p = recordResult(emptyProgress(), 'drone', 'lunch', { stars: 2 });
  assert.deepEqual(arcadeStars(p), { drone: '2/9', heist: '0/3' });
  assert.deepEqual(arcadeStars(null), { drone: '0/9', heist: '0/3' });
});

test('联机服务器探测：wss 换 https 加 /health，ok 算在线，出错 / 超时算离线', async () => {
  assert.equal(healthUrl('wss://rooms.example.dev'), 'https://rooms.example.dev/health');
  assert.equal(healthUrl('ws://127.0.0.1:8787/'), 'http://127.0.0.1:8787/health');
  const seen = [];
  assert.equal(await probeServer('wss://rooms.example.dev', 4000, async (u) => { seen.push(u); return { ok: true }; }), true);
  assert.deepEqual(seen, ['https://rooms.example.dev/health']);
  assert.equal(await probeServer('wss://x.dev', 4000, async () => ({ ok: false })), false);
  const modes = [];
  assert.equal(await probeServer('wss://x.dev', 4000, async (_u, o) => { modes.push(o.mode); return { ok: false, type: 'opaque', status: 0 }; }), true,
    '跨域且服务器不回 CORS 头：no-cors 拿到不透明响应也算在线（连不上会直接抛错）');
  assert.deepEqual(modes, ['no-cors']);
  assert.equal(await probeServer('wss://x.dev', 4000, async () => { throw new Error('offline'); }), false);
  const t0 = Date.now();
  assert.equal(await probeServer('wss://x.dev', 30, (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('abort'))))), false);
  assert.ok(Date.now() - t0 < 1000, '超时就算离线，不干等');
  assert.equal(await probeServer('wss://x.dev', 30, () => new Promise(() => {})), false, '不认 signal 的 fetch 也按超时算');
  assert.equal(await probeServer('', 4000, async () => ({ ok: true })), false, '没地址算离线');
});
