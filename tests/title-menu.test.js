// 首页主菜单（src/title/menu.js）和毛笔 Logo（src/title/logo.js）：在 node 里用一个很小的假 DOM 检查键盘 / 鼠标 / 二级菜单 / 设置，
// 以及 Logo「字体真正可用之后才画」。仓库里没有 jsdom，假 DOM 只实现菜单用到的那几样（createElement、classList、事件）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountMenu } from '../src/title/menu.js';
import { prepareLogo, LOGO_SIZE } from '../src/title/logo.js';
import { ENTRIES } from '../src/title/route.js';
import { TITLE_CSS } from '../src/title/title.css.js';

// ---------------------------------------------------------------- 假 DOM
class Target {
  constructor() { this.listeners = {}; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { const l = this.listeners[t]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  dispatch(t, ev = {}) { const e = { type: t, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...ev }; for (const fn of [...(this.listeners[t] || [])]) fn(e); return e; }
  count(t) { return (this.listeners[t] || []).length; }
}
class El extends Target {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.parentNode = null;
    this.dataset = {}; this.attrs = {}; this._text = ''; this.width = 0; this.height = 0;
    const cls = new Set(); this._cls = cls;
    this.classList = { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; if (v) cls.add(c); else cls.delete(c); return v; } };
    const style = {}; this.style = Object.assign(style, { setProperty: (k, v) => { style[k] = v; }, removeProperty: (k) => { delete style[k]; } });
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls.clear(); for (const c of String(v).split(/\s+/).filter(Boolean)) this._cls.add(c); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...cs) { for (let c of cs) { if (typeof c === 'string') { const t = new El('#text', this.ownerDocument); t._text = c; c = t; } c.parentNode = this; this.children.push(c); } }
  appendChild(c) { this.append(c); return c; }
  remove() { const p = this.parentNode; if (p) { p.children = p.children.filter((c) => c !== this); this.parentNode = null; } }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  focus() {}
  getContext() { return paint; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  find(fn) { return this.all().find(fn) || null; }
}
const noop = () => {};
const paint = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? (s) => ({ width: String(s).length * 20 }) : k.startsWith('create') ? () => ({ addColorStop: noop }) : noop), set: (t, k, v) => { t[k] = v; return true; } });
function fakeDoc() {
  const doc = new Target();
  doc.createElement = (tag) => new El(tag, doc);
  doc.head = new El('head', doc); doc.body = new El('body', doc);
  doc.getElementById = (id) => doc.head.find((e) => e.attrs.id === id) || doc.body.find((e) => e.attrs.id === id);
  return doc;
}
const key = (win, k) => win.dispatch('keydown', { key: k });

function setup(extra = {}) {
  const doc = fakeDoc(), win = new Target(), root = doc.createElement('div'); doc.body.append(root);
  const picks = [], tiers = [], intros = []; let replays = 0;
  const logo = doc.createElement('canvas');
  const menu = mountMenu(root, { logo, preselect: null, tier: 'balanced', onSelect: (e) => picks.push(e), onTier: (t) => tiers.push(t), onReplay: () => { replays++; },
    onIntro: (v) => intros.push(v), intro: 'auto', win, doc, ...extra });
  const item = (id) => root.find((e) => e.dataset.id === id);
  const focused = () => root.all().filter((e) => e.classList.contains('on') && e.dataset.id).map((e) => e.dataset.id);
  return { doc, win, root, menu, picks, tiers, intros, item, focused, logo, replays: () => replays };
}

// ---------------------------------------------------------------- 菜单
test('菜单：一级 6 项照 ENTRIES 的顺序，Logo 画布放在左上那一块里，样式只插一次', () => {
  const { root, logo, doc } = setup();
  const ids = root.all().filter((e) => e.dataset.level === '1').map((e) => e.dataset.id);
  assert.deepEqual(ids, ENTRIES.map((e) => e.id));
  assert.ok(root.find((e) => e.classList.contains('wc-logo')).children.includes(logo), 'Logo 画布直接挂上去（不再排版、不再读字体）');
  assert.ok(/[一-鿿]/.test(root.textContent));
  setup({ doc });
  assert.equal(doc.head.children.filter((e) => e.attrs.id === 'wc-title-css').length, 1);
  assert.ok(TITLE_CSS.includes('@media') && TITLE_CSS.includes('orientation: portrait'));
});

test('菜单：没 show() 之前不接键盘；show 之后方向键 + 回车选中第一项，只触发一次', () => {
  const { win, menu, picks, focused } = setup();
  key(win, 'Enter');
  assert.equal(picks.length, 0, '开场还在播时回车不选菜单（交给跳过）');
  menu.show();
  assert.deepEqual(focused(), ['siege']);
  key(win, 'ArrowDown'); assert.deepEqual(focused(), ['coop']);
  key(win, 'ArrowUp'); assert.deepEqual(focused(), ['siege']);
  key(win, 'ArrowUp'); assert.deepEqual(focused(), ['settings'], '到顶绕回最后一项');
  key(win, 'ArrowDown');
  key(win, 'Enter');
  assert.equal(picks.length, 1);
  assert.equal(picks[0].id, 'siege'); assert.equal(picks[0].mode, 'jimao'); assert.equal(picks[0].query, 'siege=1&autostart=1');
  key(win, 'Enter'); key(win, ' ');
  assert.equal(picks.length, 1, '选了以后锁住，连按不会进两次');
  menu.showError('进不去');
  key(win, 'Enter');
  assert.equal(picks.length, 2, '出错后解锁，可以再选');
});

test('菜单：「更多玩法」不直接进游戏，展开后两项才触发；Esc 关二级菜单', () => {
  const { win, menu, picks, item, focused, root } = setup();
  menu.show();
  for (let i = 0; i < 4; i++) key(win, 'ArrowDown');
  assert.deepEqual(focused(), ['more']);
  key(win, 'Enter');
  assert.equal(picks.length, 0);
  assert.ok(root.find((e) => e.dataset.sub === 'more').classList.contains('open'));
  assert.deepEqual(focused(), ['more', 'drone']);
  key(win, 'Escape');
  assert.ok(!root.find((e) => e.dataset.sub === 'more').classList.contains('open'));
  assert.deepEqual(focused(), ['more'], '回到一级，焦点还在「更多玩法」');
  key(win, 'ArrowRight');
  key(win, 'ArrowDown');
  assert.deepEqual(focused(), ['more', 'heist']);
  key(win, 'Enter');
  assert.equal(picks.length, 1); assert.equal(picks[0].id, 'heist'); assert.equal(picks[0].query, 'play=heist');
  // 鼠标：点「更多玩法」只展开，点子项才进
  const m2 = setup(); m2.menu.show();
  m2.item('more').dispatch('click');
  assert.equal(m2.picks.length, 0);
  m2.item('drone').dispatch('click');
  assert.equal(m2.picks.length, 1); assert.equal(m2.picks[0].id, 'drone');
});

test('菜单：鼠标悬停移焦点，点一级项直接进；星数写在小游戏后面', () => {
  const s = setup({ stars: { drone: '2/9', heist: '0/3' } });
  s.menu.show();
  s.item('zero').dispatch('mouseenter');
  assert.deepEqual(s.focused(), ['zero']);
  s.item('tour').dispatch('click');
  assert.equal(s.picks.length, 1); assert.equal(s.picks[0].id, 'tour');
  assert.ok(s.item('drone').textContent.includes('2/9'));
});

test('菜单：预选项（深链）一出来就选中；「更多」预选时焦点在「更多玩法」', () => {
  const a = setup({ preselect: 'coop' }); a.menu.show();
  assert.deepEqual(a.focused(), ['coop']);
  const b = setup({ preselect: 'more' }); b.menu.show();
  assert.deepEqual(b.focused(), ['more']);
  const c = setup({ preselect: '乱写' }); c.menu.show();
  assert.deepEqual(c.focused(), ['siege']);
});

test('菜单：开场中跳过 / 选模式 → show({instant:true}) 直接停在 Logo + 菜单，马上接键盘', () => {
  const s = setup();
  s.menu.show({ instant: true });
  assert.ok(s.menu.el.classList.contains('instant') && s.menu.el.classList.contains('shown'), '直接到最终状态，不走过渡');
  assert.ok(!s.menu.el.classList.contains('manual'));
  assert.deepEqual(s.focused(), ['siege']);
  key(s.win, 'ArrowDown'); key(s.win, 'Enter');
  assert.equal(s.picks.length, 1); assert.equal(s.picks[0].id, 'coop', '不用等过渡，第一下按键就算数');
  // 先逐帧出场再改成 instant：manual 被去掉
  const t = setup();
  t.menu.setPhase(0.5, 0); t.menu.show({ instant: true });
  assert.ok(!t.menu.el.classList.contains('manual') && t.menu.el.classList.contains('shown'));
});

test('菜单：setPhase 逐帧出场时，菜单没完全出来不接键盘，到 (1,1) 才接', () => {
  const s = setup();
  s.menu.setPhase(1, 0.6);
  assert.ok(s.menu.el.classList.contains('manual'));
  key(s.win, 'Enter');
  assert.equal(s.picks.length, 0, '菜单还在浮出');
  s.menu.setPhase(1, 1);
  key(s.win, 'Enter');
  assert.equal(s.picks.length, 1); assert.equal(s.picks[0].id, 'siege');
});

test('设置：画质左右切换回调 onTier，开场偏好回调 onIntro，「重看开场」回调 onReplay；Esc 返回', () => {
  const s = setup();
  s.menu.show();
  s.item('settings').dispatch('click');
  const panel = s.root.find((e) => e.dataset.sub === 'settings');
  assert.ok(panel.classList.contains('open'));
  assert.deepEqual(s.focused(), ['settings', 'tier']);
  key(s.win, 'ArrowRight');
  assert.deepEqual(s.tiers, ['high'], '均衡 → 精细');
  key(s.win, 'ArrowLeft'); key(s.win, 'ArrowLeft');
  assert.deepEqual(s.tiers, ['high', 'balanced', 'low']);
  assert.ok(s.item('tier').textContent.includes('流畅'));
  key(s.win, 'ArrowDown'); key(s.win, 'ArrowRight');
  assert.equal(s.intros.length, 1);
  assert.ok(['full', 'short', 'none', 'auto'].includes(s.intros[0]));
  key(s.win, 'ArrowDown'); key(s.win, 'Enter');
  assert.equal(s.replays(), 1);
  key(s.win, 'Escape');
  assert.ok(!panel.classList.contains('open'));
  assert.equal(s.picks.length, 0, '设置不进游戏');
});

test('底边状态行：服务器在线 / 离线 / 检测中，版本号不编造；进入关卡进度；dispose 解绑键盘并移除节点', () => {
  const s = setup();
  const foot = s.root.find((e) => e.classList.contains('wc-foot'));
  assert.ok(foot.textContent.includes('检测中'));
  s.menu.setServer(true); assert.ok(foot.textContent.includes('在线') && !foot.textContent.includes('离线'));
  s.menu.setServer(false); assert.ok(foot.textContent.includes('离线'));
  assert.ok(/dev|\d/.test(foot.textContent), '版本：打包时的 __JM_BUILD__，node 里是 dev');
  s.menu.setLoading('进入关卡', 0.4);
  const load = s.root.find((e) => e.classList.contains('wc-load'));
  assert.ok(load.classList.contains('on') && load.textContent.includes('进入关卡'));
  assert.ok(s.win.count('keydown') >= 1);
  s.menu.dispose();
  assert.equal(s.win.count('keydown'), 0);
  assert.equal(s.root.children.length, 0);
});

// ---------------------------------------------------------------- Logo
function fontEnv() {
  let ready = false; const added = [], loaded = [];
  class FakeFace { constructor(family, src) { this.family = family; this.src = src; this.status = 'unloaded'; } async load() { loaded.push(this.family); this.status = 'loaded'; return this; } }
  const fonts = { add: (f) => added.push(f), check: () => ready, [Symbol.iterator]: function* () { yield* added; } };
  const doc = fakeDoc(); doc.fonts = fonts;
  return { doc, FontFace: FakeFace, added, loaded, setReady: (v) => { ready = v; } };
}

test('Logo：字体 load + add 之后还要等 document.fonts.check 为真才画，画好返回整张画布', async () => {
  const env = fontEnv();
  let done = false, canvas = null;
  const p = prepareLogo({ fonts: { brush: 'b.woff2', latin: 'l.woff2' }, scale: 1, doc: env.doc, FontFace: env.FontFace, poll: 5, timeout: 2000 })
    .then((c) => { done = true; canvas = c; });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(env.loaded.sort(), ['TitleBrush', 'TitleLatin']);
  assert.equal(env.added.length, 2);
  assert.equal(done, false, 'check 还是 false：不画、不 resolve');
  env.setReady(true);
  await p;
  assert.equal(done, true);
  assert.equal(canvas.width, LOGO_SIZE.w); assert.equal(canvas.height, LOGO_SIZE.h);
  assert.equal(canvas.dataset.ready, '1');
});

test('Logo：已经读过的字体不重复读；scale 放大画布；没有字体接口或超时就 reject（调用方用静态图）', async () => {
  const env = fontEnv();
  env.added.push({ family: 'TitleBrush', status: 'loaded' }, { family: 'TitleLatin', status: 'loaded' });
  env.setReady(true);
  const c = await prepareLogo({ fonts: { brush: 'b', latin: 'l' }, scale: 2, doc: env.doc, FontFace: env.FontFace });
  assert.equal(env.loaded.length, 0);
  assert.equal(c.width, LOGO_SIZE.w * 2);
  await assert.rejects(prepareLogo({ fonts: { brush: 'b', latin: 'l' }, scale: 1, doc: fakeDoc(), FontFace: undefined }));
  const slow = fontEnv();
  await assert.rejects(prepareLogo({ fonts: { brush: 'b', latin: 'l' }, scale: 1, doc: slow.doc, FontFace: slow.FontFace, poll: 5, timeout: 40 }), /字体/);
  const bad = fontEnv();
  bad.FontFace.prototype.load = async () => { throw new Error('404'); };
  await assert.rejects(prepareLogo({ fonts: { brush: 'b', latin: 'l' }, scale: 1, doc: bad.doc, FontFace: bad.FontFace }));
});
