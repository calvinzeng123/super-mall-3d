// 小游戏外壳：游戏列表、开始 / 暂停 / 结算、星级存档。每个小游戏是一个独立模块（registry.js）。
//
// 小游戏模块约定：
//   export async function createGame({ app, layout, level, hud, input, rng, toast, finish })
//     → { update(dt), dispose(), pause?(on) }
//   finish({ success, stars, score, seconds, title, lines }) 结束这一局；外壳负责记录和显示结果。
//   游戏自己改动的全局状态（相机、夜景、漫游模式）在 dispose() 里还原。
import { GAMES, gameById } from './registry.js';
import { loadProgress, saveProgress, recordResult, levelRecord, gameStars, totalStars, isLevelUnlocked, MAX_STARS } from './progress.js';
import { createInput } from './input.js';
import { mulberry32, seedOf } from './rng.js';

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
`;

const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const starsText = (n, max = MAX_STARS) => `${'★'.repeat(n)}<i>${'★'.repeat(Math.max(0, max - n))}</i>`;

export function attachArcade(app, ui, { storage } = {}) {
  if (storage === undefined) { try { storage = window.localStorage; } catch { storage = null; } }
  let progress = loadProgress(storage);
  let session = null, toastTimer = 0;

  const style = el('style'); style.textContent = CSS; document.head.append(style);
  const root = el('div', 'ac-root');
  const hub = el('section', 'ac-hub'), hud = el('div', 'ac-hud'), bar = el('div', 'ac-bar');
  const toastEl = el('div', 'ac-toast'), dialog = el('div', 'ac-dialog'), open = el('button', 'ac-open', '小游戏');
  toastEl.dataset.on = '0'; bar.hidden = true; dialog.hidden = true; open.hidden = true;
  root.append(hud, hub, bar, toastEl, dialog, open);
  document.body.append(root);
  const input = createInput(root);

  const setState = (s) => { document.body.dataset.arcade = s; };
  const toast = (text, seconds = 2.6) => {
    toastEl.textContent = text; toastEl.dataset.on = '1';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.dataset.on = '0'; }, seconds * 1000);
  };

  function renderHub() {
    const playable = GAMES.filter((g) => g.status === 'playable');
    const cards = GAMES.map((g) => {
      if (g.status !== 'playable') return `<article class="ac-card soon"><h2>${esc(g.title)}<span class="ac-keys">敬请期待</span></h2><p>${esc(g.tagline)}</p></article>`;
      const levels = g.levels.map((l) => {
        const rec = levelRecord(progress, g.id, l.id), unlocked = isLevelUnlocked(progress, g, l.id);
        const note = unlocked ? l.brief : '上一关拿到 1 星后开放';
        return `<button class="ac-level" data-game="${g.id}" data-level="${l.id}"${unlocked ? '' : ' disabled'}><b>${esc(l.title)}</b><span>${esc(note)}</span><em class="ac-stars">${starsText(rec?.stars || 0)}</em></button>`;
      }).join('');
      return `<article class="ac-card" data-card="${g.id}"><h2>${esc(g.title)}<span class="ac-stars">${gameStars(progress, g)} / ${g.levels.length * MAX_STARS} ★</span></h2><p>${esc(g.tagline)}</p><div class="ac-levels">${levels}</div><p class="ac-keys">键盘：${esc(g.controls.keys)}<br>触屏：${esc(g.controls.touch)}</p></article>`;
    }).join('');
    const max = playable.reduce((n, g) => n + g.levels.length * MAX_STARS, 0);
    hub.innerHTML = `<div class="ac-hub-in"><header><h1>云澜小游戏</h1><span class="ac-total">${totalStars(progress, playable)} / ${max} ★</span></header>
      <p class="ac-sub">一张地图，几个小游戏。地图是一期商场、酒店、公寓、住宅楼和地铁站。</p>
      <div class="ac-cards">${cards}</div>
      <footer><button data-hub="free">自由逛逛</button><button data-hub="cover">返回封面</button></footer></div>`;
  }

  function showHub() {
    renderHub();
    hub.hidden = false; bar.hidden = true; dialog.hidden = true; open.hidden = true;
    setState('hub');
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
    s.instance?.pause?.(true);
    const i = s.game.levels.indexOf(s.level), next = s.game.levels[i + 1];
    const canNext = next && isLevelUnlocked(progress, s.game, next.id);
    bar.hidden = true;
    dialog.innerHTML = `<div class="ac-box" role="dialog" aria-label="本局结果"><h2>${esc(result.title || (stars ? '完成' : '没成功'))}</h2>
      <span class="ac-stars">${starsText(stars)}</span><ul>${(result.lines || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="ac-actions"><button data-dlg="retry">再来一次</button>${canNext ? `<button class="ac-primary" data-dlg="next">下一关：${esc(next.title)}</button>` : ''}<button data-dlg="hub"${canNext ? '' : ' class="ac-primary"'}>返回列表</button></div></div>`;
    dialog.hidden = false;
  }

  function pause(on = true) {
    const s = session;
    if (!s || s.done || s.paused === on) return;
    s.paused = on;
    s.instance?.pause?.(on);
    if (on) {
      dialog.innerHTML = `<div class="ac-box" role="dialog" aria-label="已暂停"><h2>已暂停</h2><ul><li>${esc(s.game.title)} · ${esc(s.level.title)}</li></ul>
        <div class="ac-actions"><button class="ac-primary" data-dlg="resume">继续</button><button data-dlg="retry">重新开始</button><button data-dlg="hub">退出</button></div></div>`;
    }
    dialog.hidden = !on;
  }

  async function quit() { await endSession(); showHub(); }

  root.addEventListener('click', async (event) => {
    const b = event.target.closest('button');
    if (!b) return;
    if (b.dataset.game) await start(b.dataset.game, b.dataset.level);
    else if (b.dataset.hub === 'free') { hub.hidden = true; open.hidden = false; setState('free'); }
    else if (b.dataset.hub === 'cover') location.reload();
    else if (b === open) { if (app.explore?.active) app.exitExplore(); showHub(); }
    else if (b.dataset.bar === 'pause') pause(true);
    else if (b.dataset.dlg === 'resume') pause(false);
    else if (b.dataset.dlg === 'retry') { const s = session; if (s) await start(s.game.id, s.level.id); }
    else if (b.dataset.dlg === 'next') { const s = session; const n = s?.game.levels[s.game.levels.indexOf(s.level) + 1]; if (n) await start(s.game.id, n.id); }
    else if (b.dataset.dlg === 'hub') await quit();
  });
  const onKey = (e) => { if (e.code === 'KeyP' && session && !session.done) pause(!session.paused); };
  window.addEventListener('keydown', onKey);
  const onHide = () => { if (document.hidden) pause(true); };
  document.addEventListener('visibilitychange', onHide);

  app.ctx.dynamic.push({ name: 'arcade', update(dt) {
    const s = session;
    if (s?.instance && !s.paused && !s.done) s.instance.update(dt);
  } });

  showHub();
  const api = {
    games: GAMES, input, start, quit, pause, toast,
    get progress() { return progress; },
    /** 调试 / 自动化：当前这一局 */
    get session() { return session && { game: session.game.id, level: session.level.id, paused: session.paused, done: session.done, result: session.result, instance: session.instance }; },
    get state() { return document.body.dataset.arcade; },
    showHub,
    resetProgress() { progress = loadProgress(null); saveProgress(storage, progress); if (!session) renderHub(); },
  };
  app.arcade = api;
  return api;
}
