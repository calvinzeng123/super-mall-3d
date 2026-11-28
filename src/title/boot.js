// 首页启动编排：进度条 → 开场动画 → Logo 落下、主菜单浮出 → 选模式 → 释放开场场景 → 进游戏。
//   · 进度条（黑底、底边一根细线 + 一句轮换的文案）= 开场资源下载 + 建场景 + 着色器预编译、每个镜头预热 + Logo 栅格化，全部完成才开播；
//   · 开场中任意键 / 点屏幕跳到 Logo + 菜单；从游戏返回、减少动态效果、设置里选了「不播」都直接到菜单（背景照常循环）；
//   · 邀请链接（?room=CODE）不建场景，直接进联机大厅；别的深链只在菜单里预选；
//   · 兜底：场景建不起来（没有 WebGL、资源 404）→ 静态主视觉 + 同一套菜单；毛笔 Logo 画不出来 → 静态 Logo 图；都照样能进游戏；
//   · 进游戏前先把开场场景彻底释放（GL 上下文、贴图、几何体），游戏用自己的 GL 上下文：同一时间只有一个；
//   · 菜单出来以后（省流量模式除外）对游戏的脚本发 <link rel="prefetch">，只进 HTTP 缓存、不解析。
// 场景、Logo、进游戏、联机探测都能注入，node 里用假 DOM 测（tests/title-boot.test.js）。
import { mountMenu } from './menu.js';
import { prepareLogo as drawBrushLogo } from './logo.js';
import { introVersion, deepLink, entrySearch, returnCleanup, markIntroSeen, readIntroPref, writeIntroPref, arcadeStars, probeServer, RETURNING_KEY } from './route.js';
import { readCoverTier, writeCoverTier } from './tiers.js';
import { injectTitleCss } from './title.css.js';
import { TITLE_FONTS, TITLE_FONT_FAMILIES } from './title-data.js';
import { TITLE_FALLBACK } from './fallback-data.js';
import { loadProgress } from '../arcade/progress.js';

/** 进度条上轮换的文案 */
export const PRELOAD_LINES = Object.freeze(['正在封锁云澜……', '尸群正在逼近商场……', '重机枪就位，弹链上膛……', '直升机正在预热旋翼……']);

const assetURL = (base, u) => (/^(data:|blob:|https?:|\/)/.test(u) ? u : base + String(u).replace(/^\.\//, ''));
const tryDo = (fn) => { try { return fn(); } catch { return undefined; } };

/**
 * 挂首页。canvas：开场画布（放在 root 里）；root：首页容器（盖在游戏 #app 上面）；storage / session：localStorage / sessionStorage（可为 null）；
 * search：打开时的地址栏参数；startRuntime(mode, onProgress)：进游戏（main.js 里动态 import runtime.js）。
 * 注入（测试用）：createScene(canvas, opts)、prepareLogo()、probe()、win、doc、reducedMotion、fallback、prefetch、base。
 * 返回（Promise）：{ scene, menu, fallback, version }；邀请链接直进联机时 scene / menu 为 null。
 */
export async function bootTitle({
  canvas, root, storage = null, session = null, search = '', startRuntime,
  createScene, prepareLogo = null, probe = probeServer, base = './',
  win = globalThis.window, doc = root?.ownerDocument || globalThis.document,
  reducedMotion = tryDo(() => win.matchMedia('(prefers-reduced-motion: reduce)').matches) || false,
  fallback = TITLE_FALLBACK, prefetch = true,
} = {}) {
  injectTitleCss(doc);
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const shell = el('div', 'wc-boot');
  // 画布挪进首页容器（最底层），进度条盖在最上面
  if (canvas) { canvas.classList?.add('wc-canvas'); shell.append(canvas); }
  const pre = el('div', 'wc-pre'); const preT = el('div', 'wc-pre-t', PRELOAD_LINES[0]); const preBar = el('div', 'wc-pre-bar'); const preI = el('i'); preBar.append(preI); pre.append(preT, preBar);
  shell.append(pre); root.append(shell);
  let line = 0;
  const rotate = setInterval(() => { line = (line + 1) % PRELOAD_LINES.length; preT.textContent = PRELOAD_LINES[line]; }, 2200);
  const setPre = (p) => preI.style.setProperty('--p', `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`);
  const endPre = () => { clearInterval(rotate); pre.classList.add('done'); setTimeout(() => pre.remove(), 600); };

  const setSearch = (s) => tryDo(() => win.history.replaceState(win.history.state, '', `${win.location.pathname}${s}${win.location.hash || ''}`));
  const curSearch = () => tryDo(() => win.location.search) ?? search;

  // ---- 邀请链接：不建场景，直接进联机大厅
  const link = deepLink(search);
  if (link.direct) {
    preT.textContent = '正在进入联机大厅……'; clearInterval(rotate);
    setSearch(entrySearch(search, { query: link.direct.query }));
    try {
      await startRuntime(link.direct.mode, (label, p) => { if (label) preT.textContent = label; if (p != null) setPre(p); });
      shell.remove();
    } catch (error) {
      console.error(error);
      // 进不去：退回菜单那条路（刷新时去掉房间码，免得一直卡在同一个错误上）
      preT.textContent = `加载未完成：${error?.message || error}。轻点屏幕回到主菜单。`;
      pre.addEventListener?.('click', () => { setSearch(returnCleanup(search)); win.location.reload(); });
    }
    return { scene: null, menu: null, fallback: false, version: 'none' };
  }

  // ---- 这次播哪一版；从游戏返回的标记用过就擦（之后手动刷新照常播短版）
  const version = introVersion({ search, storage, session, reducedMotion });
  tryDo(() => session?.removeItem?.(RETURNING_KEY));
  const tier = readCoverTier(storage);

  // ---- 进度：场景（下载 + 建场景 + 预编译 + 预热）占 85%，Logo 栅格化 15%
  let sceneP = 0, logoP = 0;
  const report = () => setPre(sceneP * 0.85 + logoP * 0.15);
  const logoTask = (prepareLogo ? prepareLogo() : drawBrushLogo({
    fonts: { brush: assetURL(base, TITLE_FONTS.brush), latin: assetURL(base, TITLE_FONTS.latin) },
    scale: Math.min(2, Math.max(1, (win.devicePixelRatio || 1))) * 0.6, doc, families: TITLE_FONT_FAMILIES,
  })).catch((e) => {
    console.warn('[首页] 毛笔 Logo 画不出来，改用静态图', e);
    const img = el('img'); img.alt = '围城'; img.src = assetURL(base, fallback.logo); img.decoding = 'async';
    return img;
  }).then((x) => { logoP = 1; report(); return x; });
  let scene = null, failed = false;
  try {
    scene = await createScene(canvas, { tier, base, onProgress: (label, p) => { sceneP = p; report(); } });
  } catch (e) {
    console.warn('[首页] 开场场景建不起来，改用静态主视觉', e);
    failed = true;
    loseContext(canvas);
    if (canvas) canvas.style.display = 'none';
    shell.style.backgroundImage = `url("${assetURL(base, fallback.scene)}")`;
    shell.classList.add('wc-still');
  }
  sceneP = 1; report();
  const logo = await logoTask;

  // ---- 菜单
  let entering = false, broken = false, intro = version;
  const menu = mountMenu(shell, {
    logo, preselect: link.preselect, tier, intro: readIntroPref(storage), win, doc,
    stars: tryDo(() => arcadeStars(loadProgress(storage))) || {},
    onSelect: (entry) => enter(entry),
    onTier: (t) => writeCoverTier(storage, t),
    onIntro: (v) => writeIntroPref(storage, v),
    onReplay: () => { if (!scene) return; skipping = false; intro = 'full'; menu.hide(); armSkip(); scene.play('full'); },
  });

  let shown = false, skipping = false, prefetched = false;
  const show = (instant) => {
    if (!shown || instant) menu.show({ instant: !!instant });
    if (!shown) { shown = true; disarmSkip(); startPrefetch(); }
  };
  // ---- 跳过：开场中任意键 / 点屏幕。菜单的键盘在 show() 之前不接，所以这一下不会顺带选中菜单项；
  // 点屏幕跳过的那一下 click 也吞掉（不然手指正好落在菜单项上会直接进游戏）
  let swallowUntil = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const onSkip = (e) => {
    if (shown || !scene) return;
    if (e?.type === 'pointerdown') swallowUntil = now() + 450;
    skipping = true; scene.skip();
  };
  const onClickCapture = (e) => { if (now() < swallowUntil) { e.stopPropagation?.(); e.preventDefault?.(); } };
  const armSkip = () => { shown = false; win.addEventListener('keydown', onSkip); win.addEventListener('pointerdown', onSkip); };
  const disarmSkip = () => { win.removeEventListener('keydown', onSkip); win.removeEventListener('pointerdown', onSkip); };
  win.addEventListener('click', onClickCapture, true);

  if (scene) {
    scene.on('logo', () => show(skipping || intro === 'none'));
    scene.on('menu', () => { show(false); if (intro === 'full') markIntroSeen(storage); });
  }
  tryDo(() => probe().then((ok) => menu.setServer(!!ok), () => menu.setServer(false)));

  endPre();
  if (scene) { armSkip(); scene.play(version); } else show(true);

  // ---- 选了模式：写地址栏参数 → 定格最后一帧当背景 → 释放开场 → 进游戏
  async function enter(entry) {
    if (broken) { win.location.reload(); return; }
    if (entering) return;
    entering = true;
    menu.setLoading('进入关卡', 0);
    setSearch(entrySearch(curSearch(), entry));
    if (scene) {
      const still = freezeFrame(canvas);
      shell.style.backgroundImage = `url("${still || assetURL(base, fallback.scene)}")`;
      shell.classList.add('wc-still');
      try { scene.dispose(); } catch (e) { console.warn('[首页] 释放开场场景出错', e); }
      scene = null;
      if (canvas) canvas.style.display = 'none';
    }
    try {
      await startRuntime(entry.mode, (label, p) => menu.setLoading(label, p));
      menu.dispose(); disarmSkip(); win.removeEventListener('click', onClickCapture, true);
      shell.remove();
    } catch (error) {
      console.error(error);
      broken = true; entering = false;
      // 半截建起来的游戏场景只有整页刷新才放得干净：再点任一模式就刷新
      menu.showError(`加载未完成：${error?.message || error}。点任一模式刷新后重试。`);
    }
  }

  // ---- 后台预下载游戏脚本（Pages 版打包时写进页面的 <script type="application/json" id="prefetch">）
  function startPrefetch() {
    if (!prefetch || prefetched) return; prefetched = true;
    if (tryDo(() => win.navigator.connection?.saveData)) return;
    const list = tryDo(() => JSON.parse(doc.getElementById('prefetch')?.textContent || '[]')) || [];
    for (const href of list) { const l = doc.createElement('link'); l.rel = 'prefetch'; l.as = 'script'; l.href = href; doc.head.append(l); }
  }

  return { get scene() { return scene; }, menu, fallback: failed, version };
}

/** 当前这一帧拍成图（进游戏时当背景，免得释放场景后闪一下黑）；拍不到返回 null */
function freezeFrame(canvas) {
  try { const u = canvas?.toDataURL?.('image/jpeg', 0.82); return typeof u === 'string' && u.length > 2000 ? u : null; } catch { return null; }
}

/** 场景建到一半失败时，画布上可能已经有一个 GL 上下文：丢掉它（同一时间只留游戏那一个） */
function loseContext(canvas) {
  for (const kind of ['webgl2', 'webgl']) {
    try { const gl = canvas?.getContext?.(kind); const ext = gl?.getExtension?.('WEBGL_lose_context'); if (ext) { ext.loseContext(); return; } } catch { /* 拿不到就算了 */ }
  }
}
