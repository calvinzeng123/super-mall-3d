// A 2D entry screen. Importing this module must never initialize a WebGL scene.
// 首页封面：四个方案（?cover=a|b|c|d，见 cover-options.js），结构相同——
//   园区导览（小游戏嵌在里面）· 单独一框的枪战 FPS（零点突围 / 丧尸围城 / 联机三人）· 画质。
// 每个按钮带 data-mode（tour / jimao），FPS 的还带 data-query（siege=… / mp=1），由 main.js 写进地址栏再进模式。
import { COVER_URL, FPS_COVER_URL } from './cover-data.js';
import { COVER_OPTIONS, DEFAULT_COVER, TOUR_ENTRY, FPS_ENTRIES, MP_ENTRY, COVER_TIERS, coverOption, pickCover, readCoverTier, writeCoverTier } from './cover-options.js';
import { GAMES } from './arcade/registry.js';
import { loadProgress, gameStars, MAX_STARS } from './arcade/progress.js';

const ARROW = '<svg class="yl-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const SCOPE = '<svg class="yl-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6"/><circle cx="12" cy="12" r="1"/></svg>';
const TEAM = '<svg class="yl-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="3"/><circle cx="5" cy="9.5" r="2.3"/><circle cx="19" cy="9.5" r="2.3"/><path d="M6.5 20c0-3.5 2.4-6 5.5-6s5.5 2.5 5.5 6M1 19c0-2.6 1.6-4.4 4-4.6M23 19c0-2.6-1.6-4.4-4-4.6"/></svg>';
const GEAR = '<svg class="yl-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg>';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- 各方案共用的零件（纯字符串，node 里能拼出来检查） ----
const modeAttrs = (e) => `data-mode="${e.mode}"${e.query ? ` data-query="${esc(e.query)}"` : ''}`;
const tierLabel = (id) => COVER_TIERS.find((t) => t.id === id)?.label || '自动';
const qualityButton = (tier, cls = '') => `<button type="button" class="yl-q ${cls}" data-cover-quality aria-haspopup="dialog">${GEAR}<span>画质 · <b>${tierLabel(tier)}</b></span></button>`;
/** 园区里能玩的小游戏：点了进园区并直接打开它的关卡（?play=…） */
function gameChips(progress) {
  return GAMES.filter((g) => g.status === 'playable').map((g) => `<button type="button" class="yl-chip" data-mode="tour" data-query="play=${g.id}"><b>${esc(g.title)}</b><em>${gameStars(progress, g)}/${g.levels.length * MAX_STARS}★</em></button>`).join('');
}
const soonGames = () => GAMES.filter((g) => g.status !== 'playable').map((g) => g.title).slice(0, 3).join(' · ');
const tourButton = (cls = 'yl-tour-go') => `<button type="button" class="${cls}" ${modeAttrs(TOUR_ENTRY)}><b>${TOUR_ENTRY.title}</b><span>${TOUR_ENTRY.sub}</span>${ARROW}</button>`;
const gamesBlock = (progress) => `<div class="yl-games"><p class="yl-games-h"><span>园区小游戏</span><small>嵌在导览里 · 进园区后点「小游戏」或地图上的金色标记</small></p><div class="yl-chips">${gameChips(progress)}</div></div>`;
const fpsButton = (e) => `<button type="button" class="yl-fps-mode yl-fps-${e.id}" ${modeAttrs(e)}><img class="yl-fps-thumb" data-img="fps" alt="" decoding="async"><b>${e.short}${e.en && e.title.includes(e.en) ? `<small> · ${e.en}</small>` : ''}</b><span>${e.sub}</span><em>${e.tag}</em>${ARROW}</button>`;
const mpButton = () => `<button type="button" class="yl-fps-mp" ${modeAttrs(MP_ENTRY)}>${TEAM}<b>${MP_ENTRY.title}</b><span>${MP_ENTRY.sub}</span><i>联机</i></button>`;
const corners = '<i class="yl-corner tl"></i><i class="yl-corner tr"></i><i class="yl-corner bl"></i><i class="yl-corner br"></i>';
/** 枪战 FPS 的框：每个方案都有，样式各自定 */
const fpsFrame = (label = '枪战 FPS') => `<section class="yl-fps" aria-label="枪战 FPS">
  <img class="yl-fps-img" data-img="fps" alt="" decoding="async">${corners}
  <header class="yl-fps-head">${SCOPE}<b>${label}</b><small>独立模式 · 不经过园区导览</small></header>
  <div class="yl-fps-modes">${FPS_ENTRIES.map(fpsButton).join('')}</div>
  ${mpButton()}
</section>`;
const status = () => `<div class="yl-state"><p class="yl-cover-status" role="status" aria-live="polite">选择模式，进入云澜汇</p><div class="yl-cover-load" hidden><i></i></div><p class="yl-cover-error" role="alert"></p></div>`;

/** 四个方案的版面 */
const LAYOUTS = {
  // A · 影院海报：园区鸟瞰铺满，标题左上，底部两个框并排
  a: ({ progress, tier }) => `
    <img class="yl-bg" data-img="campus" alt="云澜汇一期六层商场、艺术街区与完整园区鸟瞰" decoding="async" fetchpriority="high"><div class="yl-shade"></div>
    <div class="yl-a">
      <header class="yl-top"><span class="yl-wordmark">云澜汇<small>YUNLAN CAMPUS</small></span>${qualityButton(tier)}</header>
      <section class="yl-hero"><p class="yl-kicker">一座城市综合体，地上地下连成一片</p><h1>云澜汇</h1><p class="yl-sub">3D 城市园区 · 导览与游戏</p>
        <p class="yl-copy">逛六层商场，坐地铁进站，走进住宅样板间；园区里还藏着小游戏。<br>想打枪，右下角单独一扇门。</p></section>
      <div class="yl-a-row">
        <section class="yl-tour" aria-label="园区导览"><p class="yl-tag">园区导览</p>${tourButton()}${gamesBlock(progress)}</section>
        ${fpsFrame()}
      </div>
      ${status()}
    </div>`,
  // B · 双联分屏：左园区（白天）、右枪战（夜里的中庭），中间斜切
  b: ({ progress, tier }) => `
    <div class="yl-b">
      <section class="yl-b-half yl-b-tour" aria-label="园区导览">
        <img class="yl-b-img" data-img="campus" alt="云澜汇园区鸟瞰" decoding="async" fetchpriority="high">
        <div class="yl-b-in"><p class="yl-b-no"><b>01</b>园区导览</p><h1>云澜汇<small>3D 城市园区</small></h1>
          <p class="yl-copy">一期、二期、三期，从地面到地铁全部连通。自由漫游、自动导览、看每一家店。</p>
          ${tourButton()}${gamesBlock(progress)}</div>
      </section>
      <section class="yl-b-half yl-b-fps">
        <div class="yl-b-in"><p class="yl-b-no"><b>02</b>枪战 FPS</p>${fpsFrame('选择行动')}</div>
      </section>
      <header class="yl-top yl-b-top"><span class="yl-wordmark">云澜汇<small>YUNLAN CAMPUS</small></span>${qualityButton(tier)}</header>
      ${status()}
    </div>`,
  // C · 游戏大厅：深色、磁贴；园区一大块（下面挂小游戏），FPS 单独一组
  c: ({ progress, tier }) => `
    <div class="yl-c">
      <header class="yl-c-top"><span class="yl-c-logo">云</span><span class="yl-wordmark">云澜汇<small>游戏大厅 · YUNLAN CAMPUS</small></span><span class="yl-c-sp"></span>${qualityButton(tier)}</header>
      <main class="yl-c-grid">
        <section class="yl-c-group yl-c-tourgroup" aria-label="园区导览">
          <h2 class="yl-c-h">园区导览<small>CAMPUS</small></h2>
          <button type="button" class="yl-c-tile yl-c-big" ${modeAttrs(TOUR_ENTRY)}><img data-img="campus" alt="" decoding="async" fetchpriority="high"><span class="yl-c-cap"><em>漫游 · 导览 · 店铺</em><b>${TOUR_ENTRY.title}</b><span>${TOUR_ENTRY.sub}</span></span>${ARROW}</button>
          ${gamesBlock(progress)}
        </section>
        ${fpsFrame()}
      </main>
      <footer class="yl-c-bar">${status()}<span class="yl-c-keys"><kbd>点按</kbd> 进入 · 小游戏在园区里 · ${esc(soonGames())} 陆续开放</span></footer>
    </div>`,
  // D · 建筑画册：米白纸面、编号目录、图注；FPS 是末页黑底附页
  d: ({ progress, tier }) => `
    <div class="yl-d">
      <header class="yl-d-top"><span class="yl-wordmark">云澜汇<small>YUNLAN CAMPUS</small></span><span class="yl-d-vol">导览手册 · 2026</span>${qualityButton(tier)}</header>
      <div class="yl-d-body">
        <section class="yl-d-text">
          <p class="yl-d-no">No.01 — 城市综合体</p><h1>云澜汇</h1>
          <p class="yl-d-lead">一座地上地下连成一片的园区：六层商场、艺术街区、酒店公寓、住宅和地铁站。</p>
          <ol class="yl-d-index">
            <li><span>01</span><div><b>园区导览</b><small>自由漫游 · 自动导览 · 店铺目录</small></div>${tourButton('yl-d-go')}</li>
            <li><span>02</span><div><b>园区小游戏</b><small>嵌在导览里，地图上找金色标记</small><div class="yl-chips">${gameChips(progress)}</div></div></li>
            <li><span>03</span><div><b>枪战 FPS</b><small>见附页 ↓</small></div></li>
          </ol>
        </section>
        <figure class="yl-d-plate"><img data-img="campus" alt="云澜汇园区鸟瞰" decoding="async" fetchpriority="high"><figcaption><b>图 1</b> 云澜汇园区鸟瞰 · 实时渲染</figcaption></figure>
      </div>
      <div class="yl-d-appendix"><p class="yl-d-no">附页 — 独立的枪战模式</p>${fpsFrame('枪战 FPS')}</div>
      ${status()}
    </div>`,
};

/** 拼出某个方案的整页 HTML（不碰 DOM） */
export function renderCover(id, { progress = loadProgress(null), tier = 'auto' } = {}) {
  const opt = coverOption(id) || coverOption(DEFAULT_COVER);
  return LAYOUTS[opt.id]({ progress, tier });
}

const qualityPanel = (tier) => `<div class="yl-qpanel" role="dialog" aria-modal="false" aria-label="画质" hidden><div class="yl-qbox">
  <h2>画质</h2><p>园区导览和枪战一起改；进去后在各自的「设置」里还能细调分辨率、阴影、人数。</p>
  <div class="yl-qlist">${COVER_TIERS.map((t) => `<button type="button" data-tier="${t.id}" aria-pressed="${t.id === tier}"><b>${t.label}</b><small>${t.note}</small></button>`).join('')}</div>
  <button type="button" class="yl-qclose" data-cover-quality-close>完成</button></div></div>`;
const switcher = (id) => `<nav class="yl-switch" aria-label="封面方案">${COVER_OPTIONS.map((o) => `<button type="button" data-cover-pick="${o.id}" aria-pressed="${o.id === id}" title="${esc(o.name)}">${o.id.toUpperCase()}<small>${esc(o.name)}</small></button>`).join('')}</nav>`;

const launcherCSS = `
.yl-launcher{--amber:#e8b876;--ink:#edf4f8;--dim:#a9bdca;--red:#ff4f3f;position:fixed;inset:0;z-index:1000;isolation:isolate;overflow:auto;color:var(--ink);background:#0a121b;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","WenQuanYi Zen Hei",sans-serif;overscroll-behavior:none;-webkit-font-smoothing:antialiased}
.yl-launcher *{box-sizing:border-box}.yl-launcher[hidden],.yl-launcher [hidden]{display:none!important}
:where(.yl-launcher) button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;cursor:pointer;text-align:left;border:0;background:none;padding:0}
.yl-launcher button:focus-visible{outline:3px solid var(--amber);outline-offset:4px}.yl-launcher button:disabled{cursor:wait;opacity:.55}
.yl-launcher h1,.yl-launcher h2,.yl-launcher p{margin:0}
.yl-ico{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none}
.yl-wordmark{font-size:14px;font-weight:700;letter-spacing:.26em;display:flex;align-items:baseline;gap:12px}.yl-wordmark small{font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;opacity:.72;font-weight:500}
.yl-top{display:flex;align-items:center;justify-content:space-between;gap:14px}
.yl-q{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px 0 11px!important;border-radius:999px;border:1px solid #ffffff3a!important;background:#0b16208c!important;font-size:12.5px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.yl-q .yl-ico{width:17px;height:17px}.yl-q b{color:var(--amber);font-weight:650}
.yl-chips{display:flex;flex-wrap:wrap;gap:8px}
.yl-chip{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 12px!important;border-radius:999px;border:1px solid #ffffff38!important;background:#ffffff14!important;font-size:12.5px;white-space:nowrap}.yl-chip em{font-style:normal;font-size:11px;color:var(--amber)}.yl-chip:hover{background:#ffffff26!important}
.yl-games-h{display:flex;flex-direction:column;gap:2px;margin-bottom:9px!important}.yl-games-h span{font-size:12px;font-weight:650;letter-spacing:.12em;color:var(--amber)}.yl-games-h small{font-size:11px;color:var(--dim)}
/* 状态 / 进度 / 出错 */
.yl-state{min-height:18px}.yl-cover-status{color:var(--amber);font-size:11.5px;min-height:16px}.yl-cover-load{height:2px;background:#b0cfdf24;overflow:hidden;margin-top:7px}.yl-cover-load i{display:block;height:100%;width:0;background:var(--amber);transition:width .2s}
.yl-launcher[data-loading="true"] .yl-cover-load i.indeterminate{width:35%;animation:yl-loading 1.1s ease-in-out infinite}.yl-cover-error{color:#ffbaad;font-size:12px;line-height:1.6;margin-top:8px!important}.yl-cover-error:empty{display:none}
@keyframes yl-loading{from{transform:translateX(-100%)}to{transform:translateX(380%)}}
/* 枪战 FPS 框（共用骨架；各方案再调） */
.yl-fps{position:relative;isolation:isolate;overflow:hidden;border:1px solid #ff6a5a66;background:#120708;color:#f6ecea;padding:20px 22px 18px;display:flex;flex-direction:column;gap:12px}
.yl-fps-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;filter:grayscale(.35) sepia(.5) hue-rotate(-28deg) saturate(1.6) brightness(.5) contrast(1.15)}
.yl-fps:before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(160deg,#1a0706e8 10%,#14070799 55%,#0a0405f0),repeating-linear-gradient(0deg,#0000 0 2px,#00000038 2px 3px)}
.yl-corner{position:absolute;width:18px;height:18px;border:2px solid var(--red);pointer-events:none}.yl-corner.tl{left:8px;top:8px;border-right:0;border-bottom:0}.yl-corner.tr{right:8px;top:8px;border-left:0;border-bottom:0}.yl-corner.bl{left:8px;bottom:8px;border-right:0;border-top:0}.yl-corner.br{right:8px;bottom:8px;border-left:0;border-top:0}
.yl-fps-head{display:flex;align-items:center;gap:9px}.yl-fps-head .yl-ico{color:var(--red);width:20px;height:20px}.yl-fps-head b{font-size:13px;letter-spacing:.26em;font-weight:750}.yl-fps-head small{margin-left:auto;font-size:10.5px;color:#d9aaa4;letter-spacing:.06em}
.yl-fps-modes{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.yl-fps-mode{position:relative;display:grid;grid-template-columns:1fr 22px;gap:4px 10px;align-content:start;padding:14px 15px!important;border:1px solid #ffffff26!important;background:#00000059!important;min-height:104px;transition:background .15s,border-color .15s}
.yl-fps-mode:hover{background:#3a0d0a99!important;border-color:#ff7a6a!important}
.yl-fps-mode b{font-size:17px;font-weight:750;letter-spacing:.04em}.yl-fps-mode span{grid-column:1;font-size:11px;line-height:1.55;color:#e2c3bf}.yl-fps-mode em{grid-column:1;font-style:normal;font-size:10px;letter-spacing:.14em;color:var(--red);margin-top:4px}.yl-fps-mode .yl-ico{grid-column:2;grid-row:1/4;align-self:center}
.yl-fps-siege b{color:#ffd2c8}.yl-fps-mode b small{font-size:inherit;font-weight:inherit}.yl-fps-thumb{display:none}
.yl-fps-mode>*{position:relative}
.yl-fps-mp{display:grid;grid-template-columns:24px auto 1fr auto;align-items:center;gap:4px 11px;padding:11px 14px!important;border:1px dashed #ff8b7b99!important;background:#ff4f3f17!important}
.yl-fps-mp:hover{background:#ff4f3f33!important}.yl-fps-mp b{font-size:14px;font-weight:700;white-space:nowrap}.yl-fps-mp span{font-size:10.5px;color:#e2c3bf;line-height:1.45}.yl-fps-mp i{justify-self:end;font-style:normal;font-size:10px;letter-spacing:.14em;padding:3px 8px;border-radius:3px;background:var(--red);color:#1a0504;font-weight:750}
/* 手机共用的收紧（各方案再细调） */
@media(max-width:640px) and (orientation:portrait){
  .yl-fps-head small{display:none}.yl-fps-mode b small{display:block;font-size:.78em;letter-spacing:.06em;opacity:.8}
  .yl-fps-mp{grid-template-columns:22px auto 1fr}.yl-fps-mp span{grid-column:2/4}.yl-fps-mp i{grid-column:3;grid-row:1}
}
@media(max-height:520px) and (orientation:landscape){
  .yl-fps-head small,.yl-games-h small,.yl-fps-mode span,.yl-fps-mode em,.yl-fps-mp span{display:none}
  .yl-fps-mode{min-height:0}.yl-fps-mode b{font-size:14px}.yl-fps-mp{padding:7px 10px!important}.yl-chip{height:30px;font-size:11.5px}
}
/* 预览模式（带 ?cover=）底部有方案切换条：给页面底部留出位置 */
.yl-launcher[data-preview] .yl-stage{padding-bottom:52px}
/* 方案预览切换（只有地址栏带 ?cover= 时出现） */
.yl-switch{position:fixed;z-index:5;left:50%;bottom:calc(10px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;gap:4px;padding:4px;border-radius:12px;background:#05090dd9;border:1px solid #ffffff30;box-shadow:0 8px 30px #0008}
.yl-switch button{padding:5px 11px!important;border-radius:8px;font-size:12px;font-weight:700;color:#cfe0ea;display:flex;gap:6px;align-items:baseline}.yl-switch small{font-weight:500;font-size:10.5px;opacity:.75}.yl-switch [aria-pressed="true"]{background:var(--amber);color:#1a1206}
/* 画质面板 */
.yl-qpanel{position:fixed;inset:0;z-index:6;display:grid;place-items:center;background:#02060ab3;padding:18px}
.yl-qbox{width:min(420px,100%);background:#101c26;border:1px solid #ffffff30;border-radius:18px;padding:20px 20px 16px;color:var(--ink);box-shadow:0 20px 60px #000a}
.yl-qbox h2{font-size:18px;margin-bottom:6px!important}.yl-qbox p{font-size:12px;color:var(--dim);line-height:1.6;margin-bottom:14px!important}
.yl-qlist{display:grid;gap:6px}.yl-qlist button{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:10px 13px!important;border-radius:11px;border:1px solid #ffffff22!important;background:#ffffff0d!important}
.yl-qlist button b{font-size:14px}.yl-qlist button small{font-size:11px;color:var(--dim);text-align:right}.yl-qlist [aria-pressed="true"]{border-color:var(--amber)!important;background:#e8b8761f!important}.yl-qlist [aria-pressed="true"] b{color:var(--amber)}
.yl-qclose{margin-top:12px;width:100%;height:42px;border-radius:11px;background:var(--amber)!important;color:#1a1206!important;font-weight:700;text-align:center!important}

/* ========== A · 影院海报 ========== */
[data-cover="a"] .yl-bg{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;object-position:57% 58%;filter:saturate(.78) brightness(.86);z-index:-3}
[data-cover="a"] .yl-shade{position:fixed;inset:0;z-index:-2;background:linear-gradient(90deg,#06111dee 0%,#0b1927a0 42%,#0a131d22 70%),linear-gradient(0deg,#070d14 0%,#070d14d9 22%,transparent 58%)}
.yl-a{min-height:100vh;min-height:100dvh;max-width:1520px;margin:auto;display:flex;flex-direction:column;padding:calc(28px + env(safe-area-inset-top,0px)) calc(44px + env(safe-area-inset-right,0px)) calc(22px + env(safe-area-inset-bottom,0px)) calc(44px + env(safe-area-inset-left,0px))}
.yl-a .yl-hero{padding:6vh 0 4vh;max-width:640px}
.yl-kicker{display:flex;gap:10px;align-items:center;color:var(--amber);font-size:11px;letter-spacing:.22em;margin-bottom:12px!important}.yl-kicker:before{content:"";width:24px;height:1px;background:currentColor}
.yl-a h1{font-weight:800;font-size:clamp(56px,8.4vw,120px);letter-spacing:.04em;line-height:1.02;text-shadow:0 4px 40px #001c2e}
.yl-a .yl-sub{font-size:clamp(16px,1.9vw,24px);letter-spacing:.3em;color:#d3e0e8;margin:10px 0 16px!important}
.yl-copy{font-size:13px;line-height:1.8;color:#b6c8d4}
.yl-a-row{margin-top:auto;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:16px;align-items:stretch}
.yl-tour{display:flex;flex-direction:column;gap:14px;padding:18px;border-radius:18px;border:1px solid #ffffff3d;background:#0d1d2a8c;backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2)}
.yl-tag{font-size:11px;letter-spacing:.24em;color:#cfe0ea;font-weight:650}
.yl-tour-go{display:grid;grid-template-columns:1fr 26px;gap:6px 14px;align-items:center;padding:20px 22px!important;border-radius:13px;background:#dcb27fee!important;color:#101c26!important;min-height:112px;transition:background .15s}
.yl-tour-go:hover{background:#ebc798!important}.yl-tour-go b{font-size:30px;letter-spacing:.12em;font-weight:780}.yl-tour-go span{grid-column:1;font-size:12px;color:#3a4b5a}.yl-tour-go .yl-ico{grid-column:2;grid-row:1/3;width:26px;height:26px}
[data-cover="a"] .yl-fps{border-radius:4px}
.yl-a .yl-state{margin-top:12px}
@media(max-width:640px) and (orientation:portrait){
  .yl-a{padding:calc(16px + env(safe-area-inset-top,0px)) 14px calc(16px + env(safe-area-inset-bottom,0px))}
  [data-cover="a"] .yl-bg{position:absolute;height:400px;object-position:60% 50%}
  [data-cover="a"] .yl-shade{position:absolute;height:402px;background:linear-gradient(0deg,#070d14 0%,#070d1400 50%),linear-gradient(180deg,#070d14b0,#070d1400 34%)}
  .yl-launcher[data-cover="a"]{background:#070d14}
  .yl-a .yl-hero{padding:86px 0 16px}.yl-a h1{font-size:62px}.yl-a .yl-sub{font-size:14px;letter-spacing:.22em;margin:4px 0 0!important}.yl-a .yl-copy,.yl-a .yl-kicker{display:none}
  .yl-a-row{grid-template-columns:1fr;gap:12px;margin-top:0}.yl-a .yl-tour{padding:12px;gap:12px;border-radius:16px}.yl-a .yl-tag{display:none}.yl-a .yl-tour-go{min-height:80px;padding:14px 16px!important}.yl-a .yl-tour-go b{font-size:24px}.yl-a .yl-tour-go span{font-size:11px}
  .yl-a .yl-games-h{margin-bottom:7px!important}
  [data-cover="a"] .yl-fps{padding:14px 14px 12px;gap:10px}[data-cover="a"] .yl-fps-mode{min-height:0;padding:11px 12px!important}[data-cover="a"] .yl-fps-mode b{font-size:16px}[data-cover="a"] .yl-fps-mode span{font-size:10.5px}[data-cover="a"] .yl-fps-mode em{display:none}
  .yl-a .yl-state{margin-top:8px}
}
@media(max-height:520px) and (orientation:landscape){
  .yl-a{padding:calc(12px + env(safe-area-inset-top,0px)) calc(20px + env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) calc(20px + env(safe-area-inset-left,0px));display:grid;grid-template-columns:minmax(0,.78fr) minmax(0,1.5fr);grid-template-rows:auto 1fr auto;column-gap:16px;height:100%}
  .yl-a .yl-top{grid-column:1/-1}.yl-a .yl-hero{grid-column:1;grid-row:2;padding:4px 0 0;align-self:center}.yl-a h1{font-size:48px}.yl-a .yl-sub{font-size:13px;letter-spacing:.16em;margin:4px 0 8px!important}.yl-a .yl-copy{font-size:11px;line-height:1.6}.yl-a .yl-kicker{font-size:9px;margin-bottom:6px!important}
  .yl-a-row{grid-column:2;grid-row:2;margin:6px 0 0;gap:10px;align-self:end}.yl-a .yl-tour{padding:10px;gap:9px;border-radius:14px}.yl-a .yl-tour-go{min-height:72px;padding:12px 14px!important}.yl-a .yl-tour-go b{font-size:20px}.yl-a .yl-tour-go span{font-size:10px}.yl-a .yl-tag{display:none}
  [data-cover="a"] .yl-fps{padding:11px 12px;gap:8px}[data-cover="a"] .yl-fps-modes{grid-template-columns:1fr}[data-cover="a"] .yl-fps-mode{padding:8px 10px!important}
  .yl-a .yl-state{grid-column:1/-1;margin-top:4px}
}

/* ========== B · 双联分屏 ========== */
.yl-launcher[data-cover="b"]{background:#05070a}
.yl-b{position:relative;min-height:100vh;min-height:100dvh;display:grid;grid-template-columns:1fr 1fr}
.yl-b-half{position:relative;isolation:isolate;min-height:100vh;min-height:100dvh;display:flex;align-items:flex-end;overflow:hidden}
.yl-b-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:52% 55%;z-index:-2;filter:saturate(.95) brightness(1.02)}
.yl-b-tour:before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(0deg,#f3f6f8 6%,#f3f6f8f0 44%,#f3f6f8a0 58%,#f3f6f800 78%),linear-gradient(180deg,#0b1620aa,#0b162000 26%)}
.yl-b-tour{color:#10212e;clip-path:polygon(0 0,100% 0,88% 100%,0 100%);margin-right:-12%;z-index:1}
.yl-b-fps{background:#0b0606;padding-left:12%}
[data-cover="b"] .yl-fps{position:static;isolation:auto}
.yl-b-fps .yl-fps-img{filter:grayscale(.3) sepia(.6) hue-rotate(-30deg) saturate(1.8) brightness(.42) contrast(1.2);object-position:30% 40%}
.yl-b-fps:before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(0deg,#090404 8%,#090404d9 40%,#0904044d 75%,#09040480),radial-gradient(ellipse at 70% 25%,#7a1a1255 0,#0000 60%),repeating-linear-gradient(0deg,#0000 0 2px,#00000030 2px 3px)}
.yl-b-in{position:relative;width:100%;padding:0 calc(44px + env(safe-area-inset-right,0px)) calc(40px + env(safe-area-inset-bottom,0px)) 44px}
.yl-b-fps .yl-b-in{position:static}.yl-b-fps .yl-b-no,.yl-b-fps .yl-fps-head,.yl-b-fps .yl-fps-modes,.yl-b-fps .yl-fps-mp{position:relative}
.yl-b-tour .yl-b-in{padding-right:16%;padding-left:calc(44px + env(safe-area-inset-left,0px))}
.yl-b-no{display:flex;gap:12px;align-items:baseline;font-size:12px;letter-spacing:.3em;font-weight:700;margin-bottom:12px!important}.yl-b-no b{font:800 34px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0}
.yl-b-tour .yl-b-no{color:#8a5a1c}.yl-b-fps .yl-b-no{color:#ff8a7a}
.yl-b h1{font-size:clamp(48px,6.4vw,92px);font-weight:820;letter-spacing:.04em;line-height:1.04;display:flex;flex-direction:column}.yl-b h1 small{font-size:clamp(14px,1.5vw,19px);letter-spacing:.34em;font-weight:600;color:#3f5463;margin-top:8px}
.yl-b-tour .yl-copy{color:#3f5463;margin:16px 0 20px!important;max-width:30em}
.yl-b-tour .yl-tour-go{background:#10212e!important;color:#f3f6f8!important;max-width:520px}.yl-b-tour .yl-tour-go:hover{background:#1d3647!important}.yl-b-tour .yl-tour-go span{color:#b8c9d5}
.yl-b-tour .yl-games{margin-top:16px}.yl-b-tour .yl-games-h span{color:#8a5a1c}.yl-b-tour .yl-games-h small{color:#4d6271}
.yl-b-tour .yl-chip{border-color:#10212e40!important;background:#ffffffb0!important;color:#10212e}.yl-b-tour .yl-chip em{color:#a06512}
[data-cover="b"] .yl-fps{background:none;border:0;padding:0;overflow:visible;gap:14px}
[data-cover="b"] .yl-fps:before,[data-cover="b"] .yl-corner{display:none}
[data-cover="b"] .yl-fps-head b{font-size:clamp(34px,4.2vw,60px);letter-spacing:.06em;font-weight:820}[data-cover="b"] .yl-fps-head .yl-ico{width:34px;height:34px}
[data-cover="b"] .yl-fps-head{flex-wrap:wrap}[data-cover="b"] .yl-fps-head small{flex-basis:100%;margin:2px 0 6px 43px}
[data-cover="b"] .yl-fps-modes{grid-template-columns:1fr}[data-cover="b"] .yl-fps-mode{min-height:0;padding:16px 18px!important;border-left:3px solid var(--red)!important}
.yl-b-top{position:absolute;left:0;right:0;top:0;padding:calc(24px + env(safe-area-inset-top,0px)) calc(44px + env(safe-area-inset-right,0px)) 0 calc(44px + env(safe-area-inset-left,0px));z-index:2}
.yl-b .yl-state{position:absolute;z-index:3;left:calc(44px + env(safe-area-inset-left,0px));right:52%;bottom:calc(12px + env(safe-area-inset-bottom,0px))}.yl-b .yl-cover-status{color:#8a5a1c}
@media(max-width:640px) and (orientation:portrait){
  .yl-b{grid-template-columns:1fr;grid-template-rows:auto auto}
  .yl-b-half{min-height:0}
  .yl-b-tour{clip-path:polygon(0 0,100% 0,100% 94%,0 100%);margin:0 0 -26px;padding-top:300px}
  .yl-b-tour .yl-b-img{height:380px;bottom:auto}
  .yl-b-tour:before{background:linear-gradient(0deg,#f3f6f8 48%,#f3f6f8d9 58%,#f3f6f800 74%),linear-gradient(180deg,#0b1620aa,#0b162000 18%)}
  .yl-b-fps{padding:50px 0 0}
  .yl-b-in,.yl-b-tour .yl-b-in{padding:0 18px 36px}.yl-b-fps .yl-b-in{padding-bottom:calc(64px + env(safe-area-inset-bottom,0px))}
  .yl-b h1{font-size:52px}.yl-b-tour .yl-copy{font-size:12.5px;margin:10px 0 14px!important}.yl-b-no b{font-size:26px}
  .yl-b .yl-tour-go{min-height:86px}.yl-b .yl-tour-go b{font-size:24px}
  [data-cover="b"] .yl-fps-head b{font-size:30px}[data-cover="b"] .yl-fps-head .yl-ico{width:26px;height:26px}[data-cover="b"] .yl-fps-head small{margin-left:35px}
  .yl-b-top{padding:calc(16px + env(safe-area-inset-top,0px)) 16px 0}.yl-b-top .yl-wordmark{color:#fff}
  .yl-b .yl-state{position:static;padding:0 18px 20px;background:#090404}.yl-b .yl-cover-status{color:var(--amber)}
}
@media(max-height:520px) and (orientation:landscape){
  .yl-b-half{min-height:100vh;align-items:flex-end}
  .yl-b-in,.yl-b-tour .yl-b-in{padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))}.yl-b-tour .yl-b-in{padding-left:calc(20px + env(safe-area-inset-left,0px))}.yl-b-fps .yl-b-in{padding-right:calc(20px + env(safe-area-inset-right,0px));padding-left:16px}
  .yl-b h1{font-size:38px}.yl-b h1 small{font-size:11px;margin-top:3px}.yl-b-no{margin-bottom:4px!important;font-size:10px}.yl-b-no b{font-size:20px}
  .yl-b-tour:before{background:linear-gradient(0deg,#f3f6f8 10%,#f3f6f8e0 62%,#f3f6f800 92%),linear-gradient(180deg,#0b1620aa,#0b162000 26%)}
  .yl-b-tour .yl-copy{display:none}.yl-b-tour .yl-tour-go{margin-top:10px;min-height:0;padding:11px 14px!important}.yl-b .yl-tour-go b{font-size:19px}.yl-b .yl-tour-go span{font-size:10px}
  .yl-b-tour .yl-games{margin-top:8px}.yl-b .yl-chip{height:28px;font-size:11px}
  [data-cover="b"] .yl-fps{gap:8px}[data-cover="b"] .yl-fps-head b{font-size:24px}[data-cover="b"] .yl-fps-head .yl-ico{width:22px;height:22px}
  [data-cover="b"] .yl-fps-mode{padding:8px 12px!important}
  .yl-b-top{padding:calc(10px + env(safe-area-inset-top,0px)) calc(20px + env(safe-area-inset-right,0px)) 0 calc(20px + env(safe-area-inset-left,0px))}
  .yl-b .yl-state{display:none}.yl-launcher[data-loading="true"] .yl-b .yl-state{display:block;left:20px;right:20px;bottom:4px}
}

/* ========== C · 游戏大厅 ========== */
.yl-launcher[data-cover="c"]{background:#07090d radial-gradient(ellipse at 20% -10%,#1b2a38 0,#07090d 55%)}
.yl-launcher[data-cover="c"]:before{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(#ffffff06 1px,transparent 1px) 0 0/44px 44px,linear-gradient(90deg,#ffffff06 1px,transparent 1px) 0 0/44px 44px;pointer-events:none}
.yl-c{min-height:100vh;min-height:100dvh;max-width:1480px;margin:auto;display:flex;flex-direction:column;padding:calc(22px + env(safe-area-inset-top,0px)) calc(36px + env(safe-area-inset-right,0px)) 0 calc(36px + env(safe-area-inset-left,0px))}
.yl-c-top{display:flex;align-items:center;gap:14px;padding-bottom:18px;border-bottom:1px solid #ffffff14}
.yl-c-logo{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,#f2c98c,#c48d4a);color:#1a1206;font-weight:900;font-size:21px}
.yl-c-sp{flex:1}
.yl-c-grid{flex:1;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:22px;padding:22px 0;align-items:stretch}
.yl-c-group{display:flex;flex-direction:column;gap:14px}
.yl-c-h{font-size:13px;letter-spacing:.24em;font-weight:700;color:#cfe0ea;display:flex;gap:10px;align-items:baseline}.yl-c-h small{font:10px ui-monospace,monospace;letter-spacing:.2em;color:#6f8797}
.yl-c-tile{position:relative;overflow:hidden;border-radius:16px;border:1px solid #ffffff1f!important;background:#101820!important;transition:transform .18s,border-color .18s,box-shadow .18s}
.yl-c-tile:hover{transform:translateY(-2px);border-color:var(--amber)!important;box-shadow:0 0 0 2px #e8b87655,0 20px 50px #0009}
.yl-c-big{flex:1;min-height:360px;display:flex;align-items:flex-end}
.yl-c-big img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:57% 58%;filter:saturate(.9) brightness(.92)}
.yl-c-big:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,#060a0ff2 0%,#060a0f80 32%,#060a0f00 60%)}
.yl-c-cap{position:relative;z-index:1;display:flex;flex-direction:column;gap:6px;padding:24px 26px}.yl-c-cap em{font-style:normal;font-size:11px;letter-spacing:.2em;color:var(--amber)}.yl-c-cap b{font-size:40px;font-weight:800;letter-spacing:.1em}.yl-c-cap span{font-size:12.5px;color:#c3d3de}
.yl-c-big>.yl-ico{position:absolute;z-index:1;right:24px;bottom:28px;width:44px;height:44px;padding:10px;border-radius:50%;background:var(--amber);color:#1a1206;stroke-width:2}
[data-cover="c"] .yl-games{padding:14px 16px;border-radius:14px;background:#ffffff08;border:1px solid #ffffff14}
[data-cover="c"] .yl-games-h{flex-direction:row;align-items:baseline;gap:12px}
[data-cover="c"] .yl-chip{border-radius:10px;height:44px;padding:0 16px!important;background:#ffffff0f!important;font-size:13.5px}
[data-cover="c"] .yl-fps{border-radius:16px;padding:22px;gap:14px;border-color:#ff5b4a80;box-shadow:inset 0 0 0 1px #ff5b4a22,0 0 60px #ff3b2a1a}
[data-cover="c"] .yl-fps-head b{font-size:13px}
[data-cover="c"] .yl-fps-modes{grid-template-columns:1fr;flex:1}
[data-cover="c"] .yl-fps-mode{border-radius:12px;min-height:118px;padding:18px!important}
[data-cover="c"] .yl-fps-mode b{font-size:22px}
[data-cover="c"] .yl-fps-mode{overflow:hidden;align-content:end;isolation:isolate}
[data-cover="c"] .yl-fps-thumb{display:block;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;opacity:.55}
[data-cover="c"] .yl-fps-mode:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,#08090cf2 0,#08090cb0 55%,#08090c33)}
[data-cover="c"] .yl-fps-zero .yl-fps-thumb{object-position:20% 30%;filter:grayscale(.2) hue-rotate(170deg) saturate(1.3) brightness(.8)}
[data-cover="c"] .yl-fps-siege .yl-fps-thumb{object-position:85% 70%;filter:sepia(.7) hue-rotate(-30deg) saturate(2) brightness(.7)}
[data-cover="c"] .yl-fps-mode .yl-ico{align-self:end}
[data-cover="c"] .yl-fps-mp{border-radius:12px;padding:14px!important}
.yl-c-bar{position:sticky;bottom:0;display:flex;align-items:center;gap:20px;justify-content:space-between;padding:12px 0 calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid #ffffff14;background:#07090de6;backdrop-filter:blur(8px)}
.yl-c-bar .yl-state{flex:1;max-width:520px}.yl-c-keys{font-size:11px;color:#71889a}.yl-c-keys kbd{font:inherit;padding:2px 6px;border:1px solid #ffffff30;border-radius:4px;color:#cfe0ea}
@media(max-width:640px) and (orientation:portrait){
  .yl-c{padding:calc(14px + env(safe-area-inset-top,0px)) 14px 0}.yl-c-top{padding-bottom:12px;gap:10px}.yl-c-logo{width:34px;height:34px;font-size:18px}.yl-c .yl-wordmark small{display:none}
  .yl-c-grid{grid-template-columns:1fr;gap:18px;padding:16px 0 70px}.yl-c-big{min-height:230px}.yl-c-cap{padding:16px}.yl-c-cap b{font-size:28px}.yl-c-cap span{font-size:11px}.yl-c-big>.yl-ico{right:14px;bottom:auto;top:14px;width:38px;height:38px;padding:8px}
  [data-cover="c"] .yl-games-h{flex-direction:column;gap:2px}[data-cover="c"] .yl-chip{flex:1 1 140px;justify-content:space-between}
  [data-cover="c"] .yl-fps{padding:16px}[data-cover="c"] .yl-fps-mode{min-height:112px;padding:14px!important}[data-cover="c"] .yl-fps-mode b{font-size:18px}
  .yl-c-keys{display:none}
}
@media(max-height:520px) and (orientation:landscape){
  .yl-c{padding:calc(10px + env(safe-area-inset-top,0px)) calc(18px + env(safe-area-inset-right,0px)) 0 calc(18px + env(safe-area-inset-left,0px))}.yl-c-top{padding-bottom:8px}.yl-c-logo{width:30px;height:30px;font-size:16px}.yl-c .yl-q{height:30px}
  .yl-c-grid{gap:12px;padding:10px 0}.yl-c-h{display:none}.yl-c-group{gap:8px}.yl-c-big{min-height:0}.yl-c-cap{padding:12px 14px}.yl-c-cap b{font-size:24px}.yl-c-cap span{display:none}.yl-c-big>.yl-ico{width:34px;height:34px;padding:7px;right:12px;bottom:12px}
  [data-cover="c"] .yl-games{padding:8px 10px}[data-cover="c"] .yl-games-h{margin-bottom:6px!important}[data-cover="c"] .yl-chip{height:32px;font-size:11.5px}
  [data-cover="c"] .yl-fps{padding:12px;gap:8px}[data-cover="c"] .yl-fps-mode{min-height:0;padding:9px 12px!important;align-content:center}[data-cover="c"] .yl-fps-mode b{font-size:15px}
  .yl-c-bar{padding:6px 0 calc(6px + env(safe-area-inset-bottom,0px))}.yl-c-keys{display:none}
}

/* ========== D · 建筑画册 ========== */
.yl-launcher[data-cover="d"]{background:#f2eee6;color:#1d1b18;--serif:"Songti SC","Noto Serif SC","Source Han Serif SC","STSong","SimSun",serif}
.yl-d{min-height:100vh;min-height:100dvh;max-width:1400px;margin:auto;padding:calc(26px + env(safe-area-inset-top,0px)) calc(56px + env(safe-area-inset-right,0px)) calc(30px + env(safe-area-inset-bottom,0px)) calc(56px + env(safe-area-inset-left,0px))}
.yl-d-top{display:flex;align-items:center;gap:18px;padding-bottom:14px;border-bottom:1px solid #1d1b18}
.yl-d-top .yl-wordmark{font-family:var(--serif)}.yl-d-vol{margin-left:auto;font-size:11px;letter-spacing:.2em;color:#6b645a}
[data-cover="d"] .yl-q{border-color:#1d1b1855!important;background:transparent!important;backdrop-filter:none}[data-cover="d"] .yl-q b{color:#9b2f22}
.yl-d-body{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.25fr);gap:52px;padding:26px 0 18px;align-items:start}
.yl-d-no{font-size:11px;letter-spacing:.22em;color:#9b2f22;margin-bottom:16px!important}
.yl-d h1{font-family:var(--serif);font-weight:700;font-size:clamp(64px,7.6vw,112px);letter-spacing:.06em;line-height:1}
.yl-d-lead{font-family:var(--serif);font-size:16px;line-height:1.8;color:#4a453e;margin:18px 0 22px!important;max-width:24em}
.yl-d-index{list-style:none;margin:0;padding:0;border-top:1px solid #1d1b1833}
.yl-d-index li{display:grid;grid-template-columns:44px 1fr auto;gap:14px;align-items:center;padding:13px 0;border-bottom:1px solid #1d1b1833}
.yl-d-index li>span{font:500 13px ui-monospace,Menlo,monospace;color:#9b2f22}.yl-d-index b{font-family:var(--serif);font-size:20px;font-weight:700;display:block}.yl-d-index small{font-size:12px;color:#6b645a}
.yl-d-index .yl-chips{margin-top:10px}.yl-d-index .yl-chip b{font:inherit;display:inline;font-size:12.5px;font-weight:600}[data-cover="d"] .yl-chip{border-color:#1d1b1840!important;background:#fffdf8!important;color:#1d1b18}[data-cover="d"] .yl-chip em{color:#9b2f22}
.yl-d-go{display:flex;align-items:center;gap:10px;height:46px;padding:0 18px!important;background:#1d1b18!important;color:#f2eee6!important;font-weight:700;letter-spacing:.1em;white-space:nowrap}.yl-d-go span{display:none}.yl-d-go b{font:inherit}.yl-d-go:hover{background:#9b2f22!important}
.yl-d-plate{margin:0;background:#fffdf8;padding:14px 14px 10px;box-shadow:0 1px 0 #0000000d,0 18px 50px #3a2c1a22}
.yl-d-plate img{display:block;width:100%;aspect-ratio:16/10.5;object-fit:cover;object-position:57% 58%;filter:saturate(.85) contrast(1.02)}
.yl-d-plate figcaption{font-family:var(--serif);font-size:12px;color:#6b645a;padding-top:10px}.yl-d-plate figcaption b{color:#1d1b18;margin-right:8px}
.yl-d-appendix{border-top:3px double #1d1b18;padding-top:10px}.yl-d-appendix .yl-d-no{margin-bottom:10px!important}
[data-cover="d"] .yl-fps{background:#14110f;border:0;border-radius:2px;padding:22px 26px;display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.6fr) minmax(0,.9fr);gap:22px;align-items:stretch}
[data-cover="d"] .yl-fps-img{filter:grayscale(1) brightness(.33) contrast(1.2)}[data-cover="d"] .yl-fps:before{background:linear-gradient(90deg,#14110ff0 0,#14110fb0 60%,#14110ff0)}
[data-cover="d"] .yl-corner{border-color:#c8463a;width:14px;height:14px}
[data-cover="d"] .yl-fps-head{flex-direction:column;align-items:flex-start;justify-content:center;gap:10px}[data-cover="d"] .yl-fps-head b{font-family:var(--serif);font-size:26px;letter-spacing:.12em}[data-cover="d"] .yl-fps-head small{margin:0;font-size:11.5px;line-height:1.6}
[data-cover="d"] .yl-fps-mode{border-radius:0;border-color:#ffffff22!important}[data-cover="d"] .yl-fps-mode b{font-family:var(--serif)}
[data-cover="d"] .yl-fps-mp{grid-template-columns:24px 1fr;align-content:center;border-radius:0}[data-cover="d"] .yl-fps-mp span{grid-column:1/-1}[data-cover="d"] .yl-fps-mp i{grid-column:1/-1;justify-self:start}
[data-cover="d"] .yl-cover-status{color:#9b2f22;margin-top:12px!important}
@media(max-width:900px){[data-cover="d"] .yl-fps{grid-template-columns:1fr}}
@media(max-width:640px) and (orientation:portrait){
  .yl-d{padding:calc(16px + env(safe-area-inset-top,0px)) 18px calc(20px + env(safe-area-inset-bottom,0px))}.yl-d-vol{display:none}.yl-d-top{padding-bottom:10px}.yl-d .yl-wordmark small{display:none}
  .yl-d-body{grid-template-columns:1fr;gap:20px;padding:20px 0 26px}.yl-d-plate{order:-1;padding:8px 8px 6px}.yl-d h1{font-size:60px}.yl-d-lead{font-size:14.5px;margin:12px 0 18px!important}.yl-d-no{margin-bottom:10px!important}
  .yl-d-index li{grid-template-columns:30px 1fr;padding:13px 0}.yl-d-go{grid-column:1/-1;justify-content:center}
  [data-cover="d"] .yl-fps{padding:20px 16px;gap:14px}[data-cover="d"] .yl-fps-modes{grid-template-columns:1fr}[data-cover="d"] .yl-fps-mode{min-height:0}
}
@media(max-height:520px) and (orientation:landscape){
  .yl-d{padding:calc(10px + env(safe-area-inset-top,0px)) calc(22px + env(safe-area-inset-right,0px)) 16px calc(22px + env(safe-area-inset-left,0px))}.yl-d-top{padding-bottom:8px}.yl-d-vol{display:none}
  .yl-d-body{gap:22px;padding:14px 0 18px;grid-template-columns:minmax(0,1fr) minmax(0,.95fr)}.yl-d h1{font-size:44px}.yl-d-lead{font-size:12.5px;margin:8px 0 10px!important;line-height:1.6}.yl-d-no{margin-bottom:6px!important;font-size:9.5px}
  .yl-d-index li{padding:8px 0;grid-template-columns:30px 1fr auto}.yl-d-index b{font-size:16px}.yl-d-index small{font-size:10.5px}.yl-d-go{height:38px;padding:0 12px!important}.yl-d-index .yl-chips{margin-top:6px}
  [data-cover="d"] .yl-fps{grid-template-columns:.8fr 1.6fr 1fr;padding:14px 16px;gap:12px}[data-cover="d"] .yl-fps-head b{font-size:19px}[data-cover="d"] .yl-fps-mode{padding:9px 11px!important}
}
@media(prefers-reduced-motion:reduce){.yl-launcher *{animation:none!important;transition:none!important}}
`;

/** @param {{onSelect:(mode:'tour'|'jimao', options:{query:string})=>unknown, backgroundUrl?:string, fpsUrl?:string, cover?:string, storage?:Storage|null, preview?:boolean}} options */
export function mountLauncher({ onSelect, backgroundUrl = COVER_URL, fpsUrl = FPS_COVER_URL, cover, storage, preview } = {}) {
  if (storage === undefined) { try { storage = window.localStorage; } catch { storage = null; } }
  const search = globalThis.location?.search || '';
  let id = cover || pickCover(search);
  if (preview === undefined) preview = new URLSearchParams(search).has('cover'); // 带 ?cover= 时显示方案切换条，方便对比
  const style = document.createElement('style');
  style.textContent = launcherCSS;
  const root = document.createElement('main');
  root.className = 'yl-launcher';
  root.id = 'ylLauncher';
  root.setAttribute('aria-label', '云澜汇游戏入口');
  const stage = document.createElement('div'); stage.className = 'yl-stage';
  root.append(stage);
  document.head.append(style);
  document.body.append(root);
  let busy = false, disposed = false, tier = readCoverTier(storage);
  const abort = new AbortController();
  const urls = { campus: backgroundUrl, fps: fpsUrl };
  function paint() {
    root.dataset.cover = id; root.toggleAttribute('data-preview', !!preview);
    stage.innerHTML = renderCover(id, { progress: loadProgress(storage), tier }) + qualityPanel(tier) + (preview ? switcher(id) : '');
    for (const img of stage.querySelectorAll('img[data-img]')) { const u = urls[img.dataset.img]; if (u) img.src = u; else img.remove(); }
  }
  paint();
  const $ = (sel) => stage.querySelector(sel);
  const buttons = () => [...stage.querySelectorAll('[data-mode]')];
  function setLoading(message = '正在进入…', progress) {
    if (disposed) return;
    busy = true;
    root.dataset.loading = 'true';
    root.setAttribute('aria-busy', 'true');
    $('.yl-cover-status').textContent = message;
    $('.yl-cover-error').textContent = '';
    $('.yl-cover-load').hidden = false;
    const bar = $('.yl-cover-load i');
    bar.classList.toggle('indeterminate', !Number.isFinite(progress));
    bar.style.width = Number.isFinite(progress) ? `${Math.max(0, Math.min(1, progress)) * 100}%` : '';
    buttons().forEach((b) => { b.disabled = true; });
  }
  function showError(message) {
    if (disposed) return;
    busy = false;
    root.dataset.loading = 'false';
    root.setAttribute('aria-busy', 'false');
    $('.yl-cover-status').textContent = '未能进入，请重试';
    $('.yl-cover-error').textContent = String(message || '加载失败');
    $('.yl-cover-load').hidden = true;
    buttons().forEach((b) => { b.disabled = false; });
  }
  const loadingText = (b) => (b.dataset.mode === 'tour' ? (b.dataset.query?.startsWith('play=') ? '正在进入园区，稍后打开小游戏…' : '正在进入园区…')
    : /mp=1/.test(b.dataset.query || '') ? '正在准备联机大厅…' : /siege=1/.test(b.dataset.query || '') ? '正在准备丧尸围城…' : '正在准备零点突围…');
  root.addEventListener('click', async (event) => {
    const q = event.target.closest('[data-cover-quality]'), panel = $('.yl-qpanel');
    if (q) { panel.hidden = false; panel.querySelector('[aria-pressed="true"]')?.focus(); return; }
    if (event.target.closest('[data-cover-quality-close]') || event.target === panel) { panel.hidden = true; return; }
    const t = event.target.closest('[data-tier]');
    if (t) {
      tier = t.dataset.tier; writeCoverTier(storage, tier);
      for (const b of panel.querySelectorAll('[data-tier]')) b.setAttribute('aria-pressed', String(b === t));
      for (const b of stage.querySelectorAll('.yl-q b')) b.textContent = tierLabel(tier);
      return;
    }
    const pick = event.target.closest('[data-cover-pick]');
    if (pick && !busy) {
      id = pick.dataset.coverPick; paint();
      try { const p = new URLSearchParams(location.search); p.set('cover', id); history.replaceState(history.state, '', `${location.pathname}?${p}${location.hash}`); } catch { /* 预览里改不了地址也没关系 */ }
      return;
    }
    const button = event.target.closest('[data-mode]');
    if (!button || busy) return;
    setLoading(loadingText(button));
    try { await onSelect?.(button.dataset.mode, { query: button.dataset.query || '' }); }
    catch (error) { showError(error?.message || error); }
  }, { signal: abort.signal });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const p = $('.yl-qpanel'); if (p && !p.hidden) p.hidden = true; } }, { signal: abort.signal });
  return {
    root, setLoading, showError,
    get cover() { return id; },
    dispose() { if (disposed) return; disposed = true; abort.abort(); root.remove(); style.remove(); },
  };
}
