// 小游戏外壳：游戏列表、开始 / 暂停 / 结算、星级存档。每个小游戏是一个独立模块（registry.js）。
//
// 小游戏模块约定：
//   export async function createGame({ app, layout, level, hud, input, rng, toast, finish })
//     → { update(dt), dispose(), pause?(on) }
//   finish({ success, stars, score, seconds, title, lines }) 结束这一局；外壳负责记录和显示结果。
//   游戏自己改动的全局状态（相机、夜景、漫游模式）在 dispose() 里还原。
//
// 两种挂法：
//   · 独立的小游戏模式（runtime 'arcade'，裁过的地图）：一进来就是游戏列表，「自由逛逛 / 返回主菜单」。
//   · 嵌在园区导览里（embedded: true，runtime 'tour'）：平时不出现；工具栏 / 手机底栏的「小游戏」、
//     地图上各游戏的标记点开列表，选一关就地开始，玩完「回到导览」回到原来的园区画面。
import { GAMES, gameById, gameSpot } from './registry.js';
import { loadProgress, saveProgress, recordResult, levelRecord, gameStars, totalStars, isLevelUnlocked, MAX_STARS } from './progress.js';
import { createInput } from './input.js';
import { mulberry32, seedOf } from './rng.js';
import { returnToTitle } from '../title/route.js';

const CSS = `
.ac-root{--ac-amber:#e8b876;--ac-ink:#edf4f8;--ac-dim:#a9bac6;position:fixed;inset:0;z-index:60;pointer-events:none;color:var(--ac-ink);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.45}
.ac-root *{box-sizing:border-box}.ac-root [hidden]{display:none!important}
.ac-root button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;border:1px solid #8da9ba55;background:#1a3142cc;border-radius:11px;padding:8px 14px}
.ac-root button:hover{background:#24465ccc}.ac-root button:focus-visible{outline:2px solid var(--ac-amber);outline-offset:2px}
.ac-root button[disabled]{opacity:.45;cursor:default}
.ac-root button.ac-primary{background:var(--ac-amber);border-color:var(--ac-amber);color:#1a1206;font-weight:600}
.ac-hub{pointer-events:auto;position:absolute;inset:0;overflow:auto;padding:calc(20px + env(safe-area-inset-top,0px)) calc(20px + env(safe-area-inset-right,0px)) calc(76px + env(safe-area-inset-bottom,0px)) calc(20px + env(safe-area-inset-left,0px));background:linear-gradient(180deg,#07121ce6,#07121c99 55%,#07121cd9)}
.ac-hub-in{max-width:980px;margin:0 auto}
.ac-hub header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:6px}
.ac-hub h1{font-size:26px;margin:0;letter-spacing:.04em}.ac-total{color:var(--ac-amber);font-weight:600}
.ac-hub .ac-sub{color:var(--ac-dim);margin:0 0 18px}
.ac-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.ac-card{border:1px solid #8da9ba40;background:#122533d9;border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.ac-card h2{font-size:18px;margin:0;display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.ac-card p{margin:0;color:var(--ac-dim)}.ac-card.soon{opacity:.62}
.ac-stars{color:var(--ac-amber);letter-spacing:.12em;white-space:nowrap;font-size:15px}.ac-stars i{font-style:normal;color:#5d7383}
.ac-levels{display:flex;flex-direction:column;gap:8px;margin-top:2px}
.ac-level{display:grid;grid-template-columns:1fr auto;gap:2px 10px;text-align:left;align-items:center;width:100%}
.ac-level b{font-weight:600}.ac-level span{grid-column:1;color:var(--ac-dim);font-size:12.5px}.ac-level .ac-stars{grid-row:1/3;grid-column:2}
.ac-keys{font-size:12px;color:#8ea2b0}
.ac-hub footer{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap}
.ac-open{pointer-events:auto;position:absolute;left:calc(14px + env(safe-area-inset-left,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px))}
.ac-bar{pointer-events:auto;position:absolute;top:calc(10px + env(safe-area-inset-top,0px));right:calc(12px + env(safe-area-inset-right,0px));display:flex;gap:8px;align-items:center}
.ac-bar .ac-name{background:#0c1a25cc;border:1px solid #8da9ba40;border-radius:11px;padding:8px 12px;color:var(--ac-dim)}
.ac-hud{position:absolute;inset:0;pointer-events:none}
.ac-toast{position:absolute;left:50%;top:18%;transform:translateX(-50%);background:#0c1a25e6;border:1px solid #8da9ba55;border-radius:12px;padding:9px 16px;max-width:min(520px,86vw);text-align:center;transition:opacity .25s}
.ac-toast[data-on="0"]{opacity:0}
.ac-dialog{pointer-events:auto;position:absolute;inset:0;display:grid;place-items:center;background:#040b12b3;padding:20px}
.ac-box{width:min(440px,100%);background:#122533f2;border:1px solid #8da9ba55;border-radius:18px;padding:22px 24px;text-align:center}
.ac-box h2{margin:0 0 6px;font-size:22px}.ac-box .ac-stars{font-size:30px;display:block;margin:8px 0 10px}
.ac-box ul{list-style:none;margin:0 0 16px;padding:0;color:var(--ac-dim)}.ac-box li{padding:2px 0}
.ac-box .ac-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.ac-sticks{position:absolute;inset:auto 0 0 0;height:0}
.ac-stick{pointer-events:auto;touch-action:none;position:absolute;bottom:calc(22px + env(safe-area-inset-bottom,0px));width:132px;height:132px;border-radius:50%;border:2px solid #cfe1ee55;background:#0c1a2566}
.ac-stick-left{left:calc(22px + env(safe-area-inset-left,0px))}.ac-stick-right{right:calc(22px + env(safe-area-inset-right,0px))}
.ac-stick i{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:#e8f2f8cc}
/* 列表和游戏中隐藏导览界面；「自由逛逛」时还原 */
body[data-arcade="hub"] #app>.panel,body[data-arcade="playing"] #app>.panel,body[data-arcade="loading"] #app>.panel,
body[data-arcade="hub"] #app>.clean-hint,body[data-arcade="playing"] #app>.clean-hint,
body[data-arcade="hub"] #modeBack,body[data-arcade="playing"] #modeBack,body[data-arcade="loading"] #modeBack{display:none!important}
body[data-mode="arcade"] [data-act="tour"]{display:none!important}
body[data-arcade="playing"] .ex-top,body[data-arcade="playing"] #exHelp{display:none!important}
@media(max-width:600px){.ac-hub h1{font-size:22px}.ac-stick{width:116px;height:116px}}
/* 嵌在导览里：列表做成右侧抽屉（手机上铺满），能看到后面的园区 */
.ac-root[data-embedded] .ac-hub{background:linear-gradient(90deg,#07121c22,#07121cc4 36%,#07121cf2)}
.ac-root[data-embedded] .ac-hub-in{max-width:760px;margin:0 0 0 auto}
.ac-hub .ac-x{margin-left:auto}
.ac-card[data-focus]{border-color:var(--ac-amber);box-shadow:0 0 0 1px var(--ac-amber),0 10px 40px #e8b87622}
.ac-card .ac-where{font-size:12px;color:var(--ac-amber);letter-spacing:.06em}
/* 地图上的游戏标记：深底金边，插在游戏发生的那栋楼上方；点一下打开这个游戏的关卡 */
.ac-pins{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.ac-root .ac-pin{pointer-events:auto;position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;padding:5px 12px 5px 5px;border-radius:999px;background:#10202ce6;border:1px solid #e8b876b0;box-shadow:0 6px 24px #0007;white-space:nowrap;will-change:transform}
.ac-pin:after{content:"";position:absolute;left:50%;top:100%;width:2px;height:18px;margin-left:-1px;background:linear-gradient(#e8b876,#e8b87600);pointer-events:none}
.ac-pin i{width:26px;height:26px;border-radius:50%;background:var(--ac-amber);color:#1a1206;display:grid;place-items:center;font-style:normal;font-size:13px}
.ac-pin b{font-size:13px;font-weight:650}.ac-pin em{font-style:normal;font-size:11.5px;color:var(--ac-amber)}
.ac-root .ac-pin:hover{background:#1b3446f0}
body:not([data-arcade="free"]) .ac-pins,body.exploring .ac-pins,body.ui-hidden .ac-pins{display:none}
.tool-arcade svg{fill:none;stroke:currentColor}
@media(max-width:600px){.ac-root[data-embedded] .ac-hub{background:#07121cf0}}
@media(max-width:600px),(max-height:520px){.ac-root .ac-pin{padding:3px 9px 3px 3px;gap:6px}.ac-pin i{width:20px;height:20px;font-size:11px}.ac-pin b{font-size:11.5px}.ac-pin em{display:none}}
`;

const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const starsText = (n, max = MAX_STARS) => `${'★'.repeat(n)}<i>${'★'.repeat(Math.max(0, max - n))}</i>`;

const GAME_ICON = { drone: '✈', heist: '◆' };

export function attachArcade(app, ui, { storage, embedded = false, focus = null } = {}) {
  if (storage === undefined) { try { storage = window.localStorage; } catch { storage = null; } }
  let progress = loadProgress(storage);
  let session = null, toastTimer = 0, paintPins = null;

  const style = el('style'); style.textContent = CSS; document.head.append(style);
  const root = el('div', 'ac-root');
  const hub = el('section', 'ac-hub'), hud = el('div', 'ac-hud'), bar = el('div', 'ac-bar');
  const toastEl = el('div', 'ac-toast'), dialog = el('div', 'ac-dialog'), open = el('button', 'ac-open', '小游戏');
  toastEl.dataset.on = '0'; bar.hidden = true; dialog.hidden = true; open.hidden = true;
  const pins = el('div', 'ac-pins');
  root.append(hud, pins, hub, bar, toastEl, dialog, open);
  if (embedded) root.dataset.embedded = '';
  document.body.append(root);
  const input = createInput(root);

  const setState = (s) => { document.body.dataset.arcade = s; };
  const toast = (text, seconds = 2.6) => {
    toastEl.textContent = text; toastEl.dataset.on = '1';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.dataset.on = '0'; }, seconds * 1000);
  };

  function renderHub(focusId = null) {
    const playable = GAMES.filter((g) => g.status === 'playable');
    const cards = GAMES.map((g) => {
      if (g.status !== 'playable') return `<article class="ac-card soon"><h2>${esc(g.title)}<span class="ac-keys">敬请期待</span></h2><p>${esc(g.tagline)}</p></article>`;
      const levels = g.levels.map((l) => {
        const rec = levelRecord(progress, g.id, l.id), unlocked = isLevelUnlocked(progress, g, l.id);
        const note = unlocked ? l.brief : '上一关拿到 1 星后开放';
        return `<button class="ac-level" data-game="${g.id}" data-level="${l.id}"${unlocked ? '' : ' disabled'}><b>${esc(l.title)}</b><span>${esc(note)}</span><em class="ac-stars">${starsText(rec?.stars || 0)}</em></button>`;
      }).join('');
      const where = embedded && g.spot?.note ? `<span class="ac-where">地点：${esc(g.spot.note)}</span>` : '';
      return `<article class="ac-card" data-card="${g.id}"${g.id === focusId ? ' data-focus' : ''}>${where}<h2>${esc(g.title)}<span class="ac-stars">${gameStars(progress, g)} / ${g.levels.length * MAX_STARS} ★</span></h2><p>${esc(g.tagline)}</p><div class="ac-levels">${levels}</div><p class="ac-keys">键盘：${esc(g.controls.keys)}<br>触屏：${esc(g.controls.touch)}</p></article>`;
    }).join('');
    const max = playable.reduce((n, g) => n + g.levels.length * MAX_STARS, 0);
    hub.innerHTML = embedded
      ? `<div class="ac-hub-in"><header><h1>园区小游戏</h1><span class="ac-total">${totalStars(progress, playable)} / ${max} ★</span><button class="ac-x" data-hub="free">回到导览</button></header>
      <p class="ac-sub">就在云澜汇里玩：选一关就地开始，玩完回到刚才的园区画面。地图上的金色标记也能点。</p>
      <div class="ac-cards">${cards}</div>
      <footer><button class="ac-primary" data-hub="free">回到园区导览</button></footer></div>`
      : `<div class="ac-hub-in"><header><h1>云澜小游戏</h1><span class="ac-total">${totalStars(progress, playable)} / ${max} ★</span></header>
      <p class="ac-sub">一张地图，几个小游戏。地图是一期商场、酒店、公寓、住宅楼和地铁站。</p>
      <div class="ac-cards">${cards}</div>
      <footer><button data-hub="free">自由逛逛</button><button data-hub="cover">返回主菜单</button></footer></div>`;
    if (focusId) requestAnimationFrame(() => hub.querySelector(`[data-card="${focusId}"]`)?.scrollIntoView?.({ block: 'nearest' }));
  }

  function showHub(focusId = null) {
    // 导览里：先停掉自动导览、退出漫游，免得镜头在列表后面自己跑
    if (embedded) { if (app.state.touring) app.stopTour?.(); if (app.explore?.active) app.exitExplore(); }
    renderHub(focusId);
    hub.hidden = false; bar.hidden = true; dialog.hidden = true; open.hidden = true;
    setState('hub');
  }
  /** 回到园区：导览里是「回到导览」，独立模式是「自由逛逛」（左下角留一个「小游戏」按钮） */
  async function free() {
    await endSession();
    hub.hidden = true; bar.hidden = true; dialog.hidden = true; open.hidden = embedded;
    setState('free');
  }

  async function endSession() {
    const s = session; session = null;
    if (!s) return;
    try { s.instance?.dispose(); } catch (error) { console.error(error); }
    input.disable();
    hud.replaceChildren();
    app.state.arcadeCamera = false;
  }

  async function start(gameId, levelId) {
    const game = gameById(gameId);
    if (!game || game.status !== 'playable') return false;
    const level = game.levels.find((l) => l.id === levelId) || game.levels[0];
    if (!isLevelUnlocked(progress, game, level.id)) return false;
    await endSession();
    hub.hidden = true; dialog.hidden = true; open.hidden = true; bar.hidden = true;
    setState('loading');
    toast(`${game.title} · ${level.title}`, 2);
    const s = session = { game, level, paused: false, done: false, instance: null, result: null };
    try {
      const mod = await game.load();
      // 同一关每次的布置相同（订单、巡逻路线），熟能生巧
      const rng = mulberry32(seedOf(`${game.id}:${level.id}`));
      const instance = await mod.createGame({ app, layout: app.ctx.layout, level, hud, input, rng, toast,
        finish: (result) => finish(s, result) });
      if (session !== s) { instance.dispose(); return false; } // 载入途中被退出
      s.instance = instance;
    } catch (error) {
      console.error(error);
      await endSession();
      showHub();
      toast(`没能开始：${error?.message || error}`, 4);
      return false;
    }
    bar.innerHTML = `<span class="ac-name">${esc(game.title)} · ${esc(level.title)}</span><button data-bar="pause">暂停</button>`;
    bar.hidden = false;
    setState('playing');
    return true;
  }

  function finish(s, result = {}) {
    if (s !== session || s.done) return;
    s.done = true; s.result = result;
    const stars = result.success === false && !result.stars ? 0 : Math.max(0, Math.min(MAX_STARS, result.stars | 0));
    progress = recordResult(progress, s.game.id, s.level.id, { stars, score: result.score, seconds: result.seconds });
    saveProgress(storage, progress);
    paintPins?.();
    s.instance?.pause?.(true);
    const i = s.game.levels.indexOf(s.level), next = s.game.levels[i + 1];
    const canNext = next && isLevelUnlocked(progress, s.game, next.id);
    bar.hidden = true;
    dialog.innerHTML = `<div class="ac-box" role="dialog" aria-label="本局结果"><h2>${esc(result.title || (stars ? '完成' : '没成功'))}</h2>
      <span class="ac-stars">${starsText(stars)}</span><ul>${(result.lines || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="ac-actions"><button data-dlg="retry">再来一次</button>${canNext ? `<button class="ac-primary" data-dlg="next">下一关：${esc(next.title)}</button>` : ''}<button data-dlg="hub"${canNext ? '' : ' class="ac-primary"'}>返回列表</button>${embedded ? '<button data-dlg="tour">回到导览</button>' : ''}</div></div>`;
    dialog.hidden = false;
  }

  function pause(on = true) {
    const s = session;
    if (!s || s.done || s.paused === on) return;
    s.paused = on;
    s.instance?.pause?.(on);
    if (on) {
      dialog.innerHTML = `<div class="ac-box" role="dialog" aria-label="已暂停"><h2>已暂停</h2><ul><li>${esc(s.game.title)} · ${esc(s.level.title)}</li></ul>
        <div class="ac-actions"><button class="ac-primary" data-dlg="resume">继续</button><button data-dlg="retry">重新开始</button><button data-dlg="hub">退出</button>${embedded ? '<button data-dlg="tour">回到导览</button>' : ''}</div></div>`;
    }
    dialog.hidden = !on;
  }

  async function quit() { await endSession(); showHub(); }

  root.addEventListener('click', async (event) => {
    const b = event.target.closest('button');
    if (!b) return;
    if (b.dataset.game) await start(b.dataset.game, b.dataset.level);
    else if (b.dataset.hub === 'free') await free();
    else if (b.dataset.hub === 'cover') returnToTitle(window); // 回首页主菜单：不播开场、擦掉 play= 等启动参数
    else if (b === open) { if (app.explore?.active) app.exitExplore(); showHub(); }
    else if (b.dataset.pin) showHub(b.dataset.pin);
    else if (b.dataset.dlg === 'tour') await free();
    else if (b.dataset.bar === 'pause') pause(true);
    else if (b.dataset.dlg === 'resume') pause(false);
    else if (b.dataset.dlg === 'retry') { const s = session; if (s) await start(s.game.id, s.level.id); }
    else if (b.dataset.dlg === 'next') { const s = session; const n = s?.game.levels[s.game.levels.indexOf(s.level) + 1]; if (n) await start(s.game.id, n.id); }
    else if (b.dataset.dlg === 'hub') await quit();
  });
  const onKey = (e) => {
    if (e.code === 'KeyP' && session && !session.done) pause(!session.paused);
    else if (e.code === 'Escape' && embedded && document.body.dataset.arcade === 'hub') free(); // 列表里按 Esc 回到导览
  };
  window.addEventListener('keydown', onKey);
  const onHide = () => { if (document.hidden) pause(true); };
  document.addEventListener('visibilitychange', onHide);

  app.ctx.dynamic.push({ name: 'arcade', update(dt) {
    const s = session;
    if (s?.instance && !s.paused && !s.done) s.instance.update(dt);
  } });

  // ---- 嵌在导览里：入口按钮 + 地图标记 ----
  if (embedded) {
    const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9h10a4 4 0 0 1 3.9 4.8l-.8 3.6a2 2 0 0 1-3.5.8L14.5 16h-5l-2.1 2.2a2 2 0 0 1-3.5-.8l-.8-3.6A4 4 0 0 1 7 9Z"/><path d="M8 11.5v3M6.5 13h3"/></svg>';
    const tool = el('button', 'tool tool-arcade', `${icon}<span>小游戏</span>`);
    tool.type = 'button'; tool.dataset.arcadeOpen = ''; tool.title = '在园区里玩小游戏：无人机送外卖、夜间潜入…';
    const toolbar = document.getElementById('toolbar');
    toolbar?.insertBefore(tool, toolbar.querySelector('[data-act="city"]') || null);
    const dockBtn = el('button', '', `${icon}<span>游戏</span>`); // 底栏六个按钮，两个字放得下
    dockBtn.type = 'button'; dockBtn.dataset.arcadeOpen = ''; dockBtn.setAttribute('aria-label', '小游戏');
    const dock = document.getElementById('mobileDock');
    dock?.insertBefore(dockBtn, dock.querySelector('[data-ui-hide]') || null);
    for (const b of [tool, dockBtn]) b.addEventListener('click', (e) => { e.stopPropagation(); showHub(); });
    // 地图标记：每个能玩的游戏一个，插在它发生的那栋楼上方
    const marks = GAMES.filter((g) => g.status === 'playable').map((g) => ({ g, at: gameSpot(app.ctx.layout, g) })).filter((m) => m.at);
    for (const m of marks) {
      m.node = el('button', 'ac-pin', `<i>${GAME_ICON[m.g.id] || '★'}</i><b>${esc(m.g.title)}</b><em></em>`);
      m.node.type = 'button'; m.node.dataset.pin = m.g.id; m.node.title = `${m.g.title}：${m.g.tagline}`;
      pins.append(m.node);
    }
    paintPins = () => { for (const m of marks) m.node.querySelector('em').textContent = `${gameStars(progress, m.g)} / ${m.g.levels.length * MAX_STARS} ★`; };
    paintPins();
    let probe = null;
    app.ctx.dynamic.push({ name: 'arcade-pins', update() {
      const s = app.state, show = document.body.dataset.arcade === 'free' && !s.explore && !s.touring && !s.building && !s.focus; // 不跟「标注」开关走：手机上标注默认关，标记还要在
      pins.hidden = !show;
      if (!show) return;
      const cam = app.camera, w = innerWidth, h = innerHeight;
      probe ??= cam.position.clone();
      for (const m of marks) {
        const p = probe.set(m.at.x, m.at.y, m.at.z).project(cam);
        const on = p.z < 1 && Math.abs(p.x) < 1.02 && Math.abs(p.y) < 1.02;
        m.node.style.visibility = on ? '' : 'hidden';
        if (on) m.node.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(1)}px,${((1 - p.y) / 2 * h - 18).toFixed(1)}px) translate(-50%,-100%)`;
      }
    } });
  }

  if (embedded) {
    hub.hidden = true; setState('free'); // 平时不出现：列表等玩家点开
    const want = focus && gameById(focus);
    if (want?.status === 'playable') showHub(want.id); // 封面上点了某个小游戏：进园区后直接打开它的关卡
  } else showHub();
  const api = {
    games: GAMES, input, start, quit, pause, toast,
    get progress() { return progress; },
    /** 调试 / 自动化：当前这一局 */
    get session() { return session && { game: session.game.id, level: session.level.id, paused: session.paused, done: session.done, result: session.result, instance: session.instance }; },
    get state() { return document.body.dataset.arcade; },
    showHub, free, embedded,
    resetProgress() { progress = loadProgress(null); saveProgress(storage, progress); paintPins?.(); if (!session && document.body.dataset.arcade === 'hub') renderHub(); },
  };
  app.arcade = api;
  return api;
}
