// 首页启动编排（src/title/boot.js 的 bootTitle）：注入假的开场场景、假的 startRuntime，在 node 里检查
//   · 场景建不起来（没有 WebGL / 资源 404）→ 菜单照样挂上、背景换成兜底主视觉，选「零点突围」照常进游戏；
//   · 正常路径：选了模式先释放开场场景、再进游戏（只留一个 GL 上下文）；
//   · 开场播放中按键跳过 → 立即停在 Logo + 菜单；
//   · 邀请链接 ?room= → 不建场景，直接进联机；
//   · 毛笔 Logo 画不出来（字体读失败）→ 用静态 Logo 图，不报错；
//   · 从游戏返回：不播开场、擦掉返回标记；看完完整版记下来，下次播短版。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bootTitle } from '../src/title/boot.js';
import { returnToTitle, RETURNING_KEY, INTRO_SEEN_KEY } from '../src/title/route.js';
import { Target, fakeDoc } from './fake-dom.js';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const tick = () => new Promise((r) => setTimeout(r, 0));

/** 假窗口：地址栏 + history.replaceState + 事件 */
function fakeWin(search = '') {
  const win = new Target();
  win.location = { pathname: '/', search, hash: '', reloads: 0, reload() { this.reloads++; }, replace(u) { this.replaced = u; } };
  win.history = { state: null, replaceState(_s, _t, url) { const u = new URL(url, 'http://x'); win.location.search = u.search; win.location.pathname = u.pathname; } };
  return win;
}

/** 假开场场景：记下调用顺序；skip / play('none') 同步发出 logo、menu 事件（和真场景一样） */
function fakeScene(log) {
  const ls = { logo: [], menu: [], end: [] };
  const emit = (e) => ls[e].forEach((f) => f());
  return {
    played: null,
    on(e, f) { ls[e].push(f); return () => {}; },
    play(v) { this.played = v; log.push(`play:${v}`); if (v === 'none') { emit('logo'); emit('menu'); } },
    skip() { log.push('skip'); emit('logo'); emit('menu'); },
    finish() { emit('logo'); emit('menu'); },
    ui() { return { t: 0 }; },
    dispose() { log.push('dispose'); },
  };
}

function setup({ search = '', scene = 'ok', logo = 'ok', storage = store(), session = store(), reducedMotion = false } = {}) {
  const doc = fakeDoc(), win = fakeWin(search), root = doc.createElement('div'), canvas = doc.createElement('canvas');
  doc.body.append(root); root.append(canvas);
  const log = [], picks = [];
  let sc = null;
  const createScene = async (c, opts) => {
    log.push('create');
    opts.onProgress?.('读取模型', 0.5);
    if (scene === 'fail') throw new Error('WebGL 不可用');
    sc = fakeScene(log); return sc;
  };
  const prepareLogo = async () => { if (logo === 'fail') throw new Error('字体读取失败'); const c = doc.createElement('canvas'); c.dataset.ready = '1'; return c; };
  const startRuntime = async (mode, onProgress) => { log.push(`start:${mode}`); picks.push({ mode, search: win.location.search }); onProgress('读取地图', 0.5); };
  const done = bootTitle({ canvas, root, storage, session, search, startRuntime, createScene, prepareLogo, win, doc, reducedMotion,
    probe: async () => true, fallback: { scene: 'fallback.jpg', logo: 'logo.png' }, prefetch: false });
  const item = (id) => root.find((e) => e.dataset.id === id);
  const shown = () => !!root.find((e) => e.classList.contains('wc-title') && e.classList.contains('shown'));
  return { doc, win, root, canvas, log, picks, done, item, shown, scene: () => sc, storage, session };
}

test('场景建不起来：菜单照样挂上，背景是兜底主视觉；选「零点突围」进游戏，地址里带 siege=0&autostart=1', async () => {
  const s = setup({ scene: 'fail' });
  const h = await s.done;
  assert.equal(h.fallback, true);
  assert.ok(s.shown(), '兜底时菜单直接到位');
  const bg = s.root.find((e) => e.classList.contains('wc-boot'));
  assert.match(bg.style.backgroundImage || '', /fallback\.jpg/, '背景换成兜底主视觉');
  assert.equal(s.canvas.style.display, 'none', '坏掉的画布藏起来');
  s.item('zero').dispatch('click');
  await tick(); await tick();
  assert.deepEqual(s.picks.map((p) => p.mode), ['jimao']);
  assert.match(s.picks[0].search, /siege=0/); assert.match(s.picks[0].search, /autostart=1/);
});

test('正常路径：进度条走完才开播；选了模式先释放开场场景，再进游戏', async () => {
  const s = setup();
  const h = await s.done;
  assert.equal(h.fallback, false);
  assert.equal(s.scene().played, 'full', '第一次打开播完整版');
  assert.ok(!s.shown(), '开场在播，菜单还没出来');
  s.scene().finish();
  assert.ok(s.shown(), 'Logo 落下时菜单出来');
  assert.equal(s.storage.getItem(INTRO_SEEN_KEY), '1', '看完完整版记下来，下次播短版');
  s.item('siege').dispatch('click');
  await tick(); await tick();
  assert.deepEqual(s.log.filter((x) => x === 'dispose' || x.startsWith('start:')), ['dispose', 'start:jimao'], '先释放开场、再进游戏');
  assert.match(s.picks[0].search, /siege=1/);
  assert.ok(!s.root.find((e) => e.classList.contains('wc-title')), '进去以后首页的界面拿掉');
});

test('开场播放中按任意键：立即停在 Logo + 菜单（不黑屏、不重播）', async () => {
  const s = setup();
  await s.done;
  assert.ok(!s.shown());
  s.win.dispatch('keydown', { key: 'x' });
  assert.ok(s.log.includes('skip'));
  assert.ok(s.shown(), '跳过后菜单马上在');
  const n = s.log.filter((x) => x.startsWith('play')).length;
  s.win.dispatch('keydown', { key: 'x' });
  assert.equal(s.log.filter((x) => x === 'skip').length, 1, '菜单出来以后按键归菜单，不再跳过');
  assert.equal(s.log.filter((x) => x.startsWith('play')).length, n);
});

test('邀请链接 ?room=AB12CD：不建开场场景，直接进联机', async () => {
  const s = setup({ search: '?room=ab12cd' });
  await s.done;
  assert.ok(!s.log.includes('create'), '不建场景');
  assert.deepEqual(s.picks.map((p) => p.mode), ['jimao']);
  assert.match(s.picks[0].search, /room=AB12CD/); assert.match(s.picks[0].search, /mp=1/); assert.match(s.picks[0].search, /autostart=1/);
});

test('毛笔 Logo 画不出来：换成静态 Logo 图，照常开播、出菜单', async () => {
  const s = setup({ logo: 'fail' });
  const h = await s.done;
  const box = s.root.find((e) => e.classList.contains('wc-logo'));
  const img = box.children[0];
  assert.equal(img.tagName, 'IMG'); assert.match(img.src, /logo\.png$/);
  assert.equal(h.fallback, false);
  s.scene().finish();
  assert.ok(s.shown());
});

test('从游戏返回：不播开场、直接菜单，返回标记用过就擦；深链参数只预选菜单项', async () => {
  const session = store({ [RETURNING_KEY]: '1' });
  const s = setup({ session, search: '?siege=0' });
  await s.done;
  assert.equal(s.scene().played, 'none');
  assert.ok(s.shown());
  assert.equal(session.getItem(RETURNING_KEY), null, '返回标记用过就擦');
  assert.ok(s.item('zero').classList.contains('on'), '?siege=0 预选零点突围');
  // 减少动态效果也不播
  const r = setup({ reducedMotion: true });
  await r.done;
  assert.equal(r.scene().played, 'none');
});

test('进游戏出错：菜单显示一行红字；再点任一模式整页刷新重试', async () => {
  const doc = fakeDoc(), win = fakeWin(''), root = doc.createElement('div'), canvas = doc.createElement('canvas'); root.append(canvas); doc.body.append(root);
  await bootTitle({ canvas, root, storage: store(), session: store({ [RETURNING_KEY]: '1' }), search: '', win, doc, prefetch: false, probe: async () => false,
    createScene: async () => fakeScene([]), prepareLogo: async () => doc.createElement('canvas'), fallback: { scene: 'f.jpg', logo: 'l.png' },
    startRuntime: async () => { throw new Error('网络断了'); } });
  root.find((e) => e.dataset.id === 'zero').dispatch('click');
  await tick(); await tick();
  const err = root.find((e) => e.classList.contains('wc-err'));
  assert.ok(err.classList.contains('on')); assert.match(err.textContent, /网络断了/);
  root.find((e) => e.dataset.id === 'zero').dispatch('click');
  assert.equal(win.location.reloads, 1);
});

test('返回主菜单：写返回标记、擦掉启动参数；地址没变就整页刷新', () => {
  const session = store();
  const win = { sessionStorage: session, location: { pathname: '/g/', search: '?siege=1&autostart=1&quality=low', hash: '#x', reloads: 0, reload() { this.reloads++; }, replace(u) { this.replaced = u; } } };
  returnToTitle(win);
  assert.equal(session.getItem(RETURNING_KEY), '1');
  assert.equal(win.location.replaced, '/g/?quality=low#x');
  win.location.search = '?quality=low'; win.location.replaced = undefined;
  returnToTitle(win);
  assert.equal(win.location.reloads, 1, '地址一样（只差 hash）时 replace 不会重载，改成 reload');
});

test('接线：main.js 走 bootTitle；游戏内「返回」改用 returnToTitle；旧封面删干净', () => {
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /bootTitle\(/);
  assert.ok(!/launcher\.js|cover-options|cover-data/.test(main));
  const rt = readFileSync('src/runtime.js', 'utf8');
  assert.match(rt, /returnToTitle/);
  for (const f of ['src/launcher.js', 'src/cover-options.js', 'src/cover-data.js']) assert.throws(() => readFileSync(f), f);
});

test('改名《围城》：标签页标题、manifest、主屏标题、theme-color 都换了', () => {
  const shell = readFileSync('src/shell.html', 'utf8');
  assert.match(shell, /<title>围城/);
  const mf = JSON.parse(readFileSync('assets/icons/manifest.webmanifest', 'utf8'));
  assert.equal(mf.short_name, '围城'); assert.match(mf.name, /^围城/);
  assert.ok(!/云澜汇/.test(mf.name));
  for (const f of ['build.mjs', 'scripts/build-netlify.mjs']) {
    const s = readFileSync(f, 'utf8');
    assert.match(s, /apple-mobile-web-app-title" content="围城"/, f);
    assert.ok(!/content="#0b1218"/.test(s), `${f}：theme-color 换成深色`);
  }
});
