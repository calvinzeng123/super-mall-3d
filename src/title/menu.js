// 首页主菜单：左上 Logo、左下竖排菜单（选中项红色高亮条 + 下面一句说明）、二级菜单（更多玩法）、设置面板、底边一行小字。
// 键盘上下 + 回车、Esc 返回上一级、左右在设置里改值；鼠标悬停移焦点、点击确认；手机点按（click）。
// show() 之前不接键盘（开场还在播，按键归「跳过」管）；选了一个能进游戏的入口就锁住，免得连按进两次，showError() 解锁。
// DOM 全用 createElement 搭（不用 innerHTML），node 里用一个很小的假 DOM 就能测。
import { ENTRIES } from './route.js';
import { COVER_TIERS } from '../cover-options.js';
import { injectTitleCss } from './title.css.js';

/** 打包时写进去的版本（提交短哈希 + 时间），本机直接跑是 dev */
const BUILD = typeof __JM_BUILD__ !== 'undefined' ? __JM_BUILD__ : 'dev';

const INTRO_OPTS = Object.freeze([
  Object.freeze({ id: 'auto', label: '自动', note: '第一次播完整版，之后只播短版' }),
  Object.freeze({ id: 'full', label: '完整版', note: '每次都播完整的开场（约 26 秒）' }),
  Object.freeze({ id: 'short', label: '短版', note: '只播楼顶和直升机升起（约 6 秒）' }),
  Object.freeze({ id: 'none', label: '不播', note: '打开就是主菜单' }),
]);

/**
 * 挂主菜单。root：放菜单的容器（盖在开场画布上面）。
 * opts：logo（prepareLogo 画好的画布，或兜底的 <img>）、preselect（深链预选的入口 id）、tier（当前画质档）、
 *   onSelect(entry)、onTier(tier)、onReplay()、intro / onIntro(pref)（设置里的开场偏好）、stars（{ drone: '2/9' }）、
 *   doc / win（注入用；默认 root 所在的 document 和 window）。
 * 返回 { show, setPhase, setLoading, hideLoading, showError, setServer, dispose, el }。
 */
export function mountMenu(root, opts = {}) {
  const { logo = null, preselect = null, onSelect = () => {}, onTier = () => {}, onReplay = () => {}, onIntro = () => {}, stars = {} } = opts;
  const doc = opts.doc || root.ownerDocument || globalThis.document;
  const win = opts.win || doc.defaultView || globalThis;
  injectTitleCss(doc);
  let tier = COVER_TIERS.some((t) => t.id === opts.tier) ? opts.tier : 'auto';
  let intro = INTRO_OPTS.some((o) => o.id === opts.intro) ? opts.intro : 'auto';

  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const wrap = el('div', 'wc-title');
  const scrim = el('div', 'wc-scrim');
  const logoBox = el('div', 'wc-logo');
  if (logo) logoBox.append(logo);
  const menu = el('div', 'wc-menu'); menu.setAttribute('role', 'menu');
  const desc = el('div', 'wc-desc');

  // 一级菜单
  const top = ENTRIES.map((e) => {
    const it = el('div', 'wc-item');
    it.dataset.id = e.id; it.dataset.level = '1'; it.setAttribute('role', 'menuitem');
    it.append(el('span', 'wc-label', e.label));
    if (e.en) it.append(el('span', 'wc-en', e.en));
    if (e.children || e.id === 'settings') it.append(el('span', 'wc-chev', '›'));
    return it;
  });
  top.forEach((it, i) => { if (ENTRIES[i].id === 'tour') menu.append(el('div', 'wc-sep')); menu.append(it); });

  // 二级：更多玩法
  const more = ENTRIES.find((e) => e.children);
  const morePanel = el('div', 'wc-sub'); morePanel.dataset.sub = more.id;
  const moreItems = more.children.map((c) => {
    const it = el('div', 'wc-item'); it.dataset.id = c.id; it.dataset.level = '2'; it.setAttribute('role', 'menuitem');
    it.append(el('span', 'wc-label', c.label));
    if (stars[c.id]) it.append(el('span', 'wc-stars', `${stars[c.id]} ★`));
    morePanel.append(it); return it;
  });

  // 二级：设置（画质、开场、重看开场）
  const setPanel = el('div', 'wc-sub'); setPanel.dataset.sub = 'settings';
  const rows = [
    { id: 'tier', label: '画质', opts: COVER_TIERS, get: () => tier, set: (v) => { tier = v; onTier(v); } },
    { id: 'intro', label: '开场', opts: INTRO_OPTS, get: () => intro, set: (v) => { intro = v; onIntro(v); } },
    { id: 'replay', label: '重看开场', act: () => onReplay(), note: '从头再播一遍完整的开场' },
  ];
  const rowEls = rows.map((r) => {
    const it = el('div', r.act ? 'wc-item wc-act' : 'wc-item'); it.dataset.id = r.id; it.dataset.level = '2'; it.setAttribute('role', 'menuitem');
    it.append(el('span', 'wc-label', r.label));
    r.val = el('span', 'wc-val', r.act ? '' : ''); it.append(r.val);
    setPanel.append(it); return it;
  });
  menu.append(desc, morePanel, setPanel);

  // 底边：按键提示 + 联机服务器状态 + 版本
  const foot = el('div', 'wc-foot');
  const k1 = el('span', 'wc-k'); k1.append(el('b', 'wc-key', 'ENTER'), '确认');
  const k2 = el('span', 'wc-k'); k2.append(el('b', 'wc-key', 'ESC'), '返回');
  const right = el('span', 'wc-r');
  const srv = el('span', 'wc-srv'); const srvText = el('span', '', '联机服务器 检测中');
  srv.append(el('i', 'wc-dot'), srvText);
  right.append(srv, el('span', 'wc-build', `版本 ${BUILD}`));
  foot.append(k1, k2, right);

  const load = el('div', 'wc-load'); const loadT = el('div', 'wc-load-t'); const bar = el('div', 'wc-load-bar'); const barI = el('i'); bar.append(barI); load.append(loadT, bar);
  const err = el('div', 'wc-err');
  wrap.append(scrim, logoBox, menu, foot, load, err);
  root.append(wrap);

  // ---------------------------------------------------------------- 状态
  let shown = false, locked = false, level = 'top', sub = 0;
  let idx = Math.max(0, ENTRIES.findIndex((e) => e.id === preselect));
  const panelOf = () => (level === 'more' ? moreItems : level === 'settings' ? rowEls : null);

  function render() {
    top.forEach((it, i) => { const on = i === idx; it.classList.toggle('on', on); it.setAttribute('aria-selected', on ? 'true' : 'false'); });
    morePanel.classList.toggle('open', level === 'more');
    setPanel.classList.toggle('open', level === 'settings');
    for (const [list, lv] of [[moreItems, 'more'], [rowEls, 'settings']]) list.forEach((it, i) => it.classList.toggle('on', level === lv && i === sub));
    for (const r of rows) if (!r.act) { const o = r.opts.find((x) => x.id === r.get()); r.val.textContent = o ? o.label : ''; }
    let text = ENTRIES[idx].desc || '';
    if (level === 'more') text = more.children[sub].desc;
    if (level === 'settings') { const r = rows[sub]; text = r.act ? r.note : r.opts.find((x) => x.id === r.get())?.note || ''; }
    desc.textContent = text;
  }

  const select = (entry) => {
    locked = true; wrap.classList.add('busy');
    api.setLoading('进入关卡', null);
    onSelect(entry);
  };
  const change = (r, d) => { const n = r.opts.length, i = r.opts.findIndex((x) => x.id === r.get()); r.set(r.opts[(((i < 0 ? 0 : i) + d) % n + n) % n].id); };
  const activate = () => {
    if (level === 'top') {
      const e = ENTRIES[idx];
      if (e.children) { level = 'more'; sub = 0; } else if (e.id === 'settings') { level = 'settings'; sub = 0; } else return select(e);
    } else if (level === 'more') return select(more.children[sub]);
    else { const r = rows[sub]; if (r.act) r.act(); else change(r, 1); }
    render();
  };
  const back = () => { if (level !== 'top') { level = 'top'; render(); } };
  const move = (d) => {
    const list = panelOf();
    if (list) sub = (sub + d + list.length) % list.length; else idx = (idx + d + top.length) % top.length;
    render();
  };

  const onKey = (e) => {
    if (!shown || locked) return;
    const k = e.key;
    let used = true;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') move(-1);
    else if (k === 'ArrowDown' || k === 's' || k === 'S') move(1);
    else if (k === 'Enter' || k === ' ' || k === 'Spacebar') activate();
    else if (k === 'Escape' || k === 'Backspace') back();
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      if (level === 'settings' && !rows[sub].act) { change(rows[sub], 1); render(); } else if (level === 'top' && (ENTRIES[idx].children || ENTRIES[idx].id === 'settings')) activate();
    } else if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      if (level === 'settings' && !rows[sub].act) { change(rows[sub], -1); render(); } else back();
    } else used = false;
    if (used) e.preventDefault?.();
  };
  win.addEventListener('keydown', onKey);

  // 鼠标 / 触屏
  const ok = () => shown && !locked;
  top.forEach((it, i) => {
    it.addEventListener('mouseenter', () => { if (!ok() || (level !== 'top' && i === idx)) return; idx = i; level = 'top'; render(); });
    it.addEventListener('click', (e) => { e?.stopPropagation?.(); if (!ok()) return; if (i === idx && level !== 'top') { back(); return; } idx = i; level = 'top'; activate(); });
  });
  for (const [list, lv] of [[moreItems, 'more'], [rowEls, 'settings']]) list.forEach((it, i) => {
    it.addEventListener('mouseenter', () => { if (!ok() || level !== lv) return; sub = i; render(); });
    it.addEventListener('click', (e) => { e?.stopPropagation?.(); if (!ok() || level !== lv) return; sub = i; activate(); });
  });

  render();

  const api = {
    el: wrap,
    /** Logo 落下、菜单浮出（CSS 过渡）；instant = 跳过时直接到位 */
    show({ instant = false } = {}) {
      shown = true;
      wrap.classList.remove('manual');
      wrap.classList.toggle('instant', !!instant);
      wrap.classList.add('shown');
    },
    /** 按时间逐帧给出场进度（截图、导出视频；0..1）。菜单完全出来后才接键盘 */
    setPhase(logoP, menuP) {
      wrap.classList.add('manual'); wrap.classList.remove('shown');
      wrap.style.setProperty('--wc-logo', String(Math.max(0, Math.min(1, logoP))));
      wrap.style.setProperty('--wc-menu', String(Math.max(0, Math.min(1, menuP))));
      shown = menuP >= 1;
    },
    /** 进入关卡的进度：label 一句话，p = 0..1（null = 不知道进度，来回走的细线） */
    setLoading(label, p = null) {
      load.classList.add('on'); err.classList.remove('on');
      loadT.textContent = label || '';
      load.classList.toggle('ind', p == null);
      if (p != null) barI.style.setProperty('--p', `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`);
    },
    hideLoading() { load.classList.remove('on'); },
    /** 出错：一行红字，解锁菜单（可以再选） */
    showError(msg) {
      load.classList.remove('on'); err.textContent = msg || ''; err.classList.add('on');
      locked = false; wrap.classList.remove('busy');
    },
    /** 联机服务器：true 在线 / false 离线 / null 检测中（真实探测的结果，不编） */
    setServer(online) {
      srv.classList.toggle('ok', online === true); srv.classList.toggle('off', online === false);
      srvText.textContent = `联机服务器 ${online === true ? '在线' : online === false ? '离线' : '检测中'}`;
    },
    dispose() { win.removeEventListener('keydown', onKey); wrap.remove(); },
  };
  return api;
}
