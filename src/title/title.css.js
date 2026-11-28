// 首页主菜单的样式（字符串，menu.js 插进 <head> 一次）。布局照试做版「布局二」：Logo 左上、菜单竖排左下、底边一行小字；
// 手机横屏同一布局缩小、只留右侧状态；手机竖屏 Logo 在上、菜单在下。
// Logo 出场只动 opacity / transform（合成层，不重排、不重绘），画布在进度条阶段就画好挂上去了——出场那一刻不排版、不读字体。

// 几处要点（样式字符串里不写中文注释：开场字体按 src/title 里字符串字面量的字子集化，注释写进去会把字体撑大）：
//   · 压暗（.wc-scrim）只压左边和底边给菜单字垫底，画面中间、右边的场景不压（用户反馈过「整个画面黑黑的一片」）；
//   · 二级菜单 / 设置贴在菜单右边，左边一道红线，底是往右淡出的渐变，不是带框的卡片；
//   · 底边一行不带框、低对比；进入关卡是底边一根细线 + 一句话；
//   · 出场：show() 加 .shown；跳过加 .instant（没有过渡）；setPhase() 加 .manual 按时间逐帧给（截图、导出视频）。
export const TITLE_CSS = `
.wc-title { --wc-red: #d8261c; --wc-redhot: #ff3b2a; --wc-ink: #ece8df; --wc-dim: rgba(236,232,223,0.62); --wc-logo: 0; --wc-menu: 0;
  position: absolute; inset: 0; pointer-events: none; color: var(--wc-ink); user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'Noto Sans CJK SC', 'Source Han Sans SC', 'WenQuanYi Zen Hei', sans-serif; }
.wc-title .wc-en, .wc-title .wc-foot, .wc-title .wc-key { font-family: 'TitleLatin', 'Oswald', 'Arial Narrow', sans-serif; }

.wc-scrim { position: absolute; inset: 0; opacity: 0; transition: opacity 1.2s ease 1.2s;
  background: linear-gradient(90deg, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.32) 24%, rgba(0,0,0,0) 46%), linear-gradient(to top, rgba(0,0,0,0.5), rgba(0,0,0,0) 26%); }

.wc-logo { position: absolute; left: 5.2vw; top: 7vh; width: min(38vw, 660px); transform-origin: 0 0; opacity: 0;
  transform: translate3d(0, -2.5vh, 0) scale(1.12); will-change: opacity, transform; contain: layout paint;
  transition: opacity 0.9s cubic-bezier(.2,.7,.2,1), transform 1.2s cubic-bezier(.16,.84,.24,1); }
.wc-logo canvas, .wc-logo img { display: block; width: 100%; height: auto; }

.wc-menu { position: absolute; left: 5.2vw; bottom: 12vh; width: min(32vw, 460px); display: flex; flex-direction: column; gap: 2px;
  opacity: 0; transform: translate3d(-12px, 0, 0); transition: opacity 0.8s ease 1.4s, transform 0.8s cubic-bezier(.2,.7,.2,1) 1.4s; }
.wc-item { position: relative; display: flex; align-items: baseline; gap: 14px; padding: 0.42em 0 0.42em 22px; cursor: pointer;
  font-weight: 700; font-size: clamp(16px, 1.5vw, 26px); letter-spacing: 0.1em; color: var(--wc-dim); white-space: nowrap;
  text-shadow: 0 2px 12px rgba(0,0,0,0.85); transition: color 0.15s, background 0.15s; }
.wc-item .wc-en { font-weight: 500; font-size: clamp(9px, 0.66vw, 11px); letter-spacing: 0.3em; opacity: 0.55; }
.wc-item .wc-chev { margin-left: auto; padding-right: 12px; font-size: 0.8em; opacity: 0.5; }
.wc-item.on { color: #fff; background: linear-gradient(90deg, rgba(216,38,28,0.58), rgba(216,38,28,0.14) 60%, rgba(216,38,28,0)); }
.wc-item.on::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--wc-redhot); box-shadow: 0 0 14px var(--wc-red); }
.wc-sep { height: 1px; margin: 8px 0 8px 22px; background: linear-gradient(90deg, rgba(255,255,255,0.22), rgba(255,255,255,0)); }
.wc-desc { margin: 8px 0 0 22px; min-height: 3.2em; max-width: 30em; font-size: 12.5px; line-height: 1.6; letter-spacing: 0.08em; color: rgba(255,255,255,0.62);
  text-shadow: 0 1px 8px rgba(0,0,0,0.9); white-space: normal; }

.wc-sub { position: absolute; left: calc(100% + 18px); bottom: 3.6em; min-width: 250px; padding: 6px 0; display: none;
  background: linear-gradient(90deg, rgba(6,7,8,0.72), rgba(6,7,8,0.4) 70%, rgba(6,7,8,0)); box-shadow: inset 2px 0 0 var(--wc-red); }
.wc-sub.open { display: block; }
.wc-sub .wc-item { font-size: clamp(14px, 1.15vw, 19px); padding: 0.55em 22px 0.55em 18px; }
.wc-sub .wc-item.on::before { width: 3px; }
.wc-item .wc-stars { margin-left: auto; font-size: 0.72em; letter-spacing: 0.12em; color: rgba(255,214,120,0.8); }
.wc-item .wc-val { margin-left: auto; font-weight: 500; font-size: 0.86em; color: #fff; }
.wc-item .wc-val::before { content: '‹  '; opacity: 0.45; } .wc-item .wc-val::after { content: '  ›'; opacity: 0.45; }
.wc-item.wc-act .wc-val::before, .wc-item.wc-act .wc-val::after { content: ''; }

.wc-foot { position: absolute; left: 5.2vw; right: 3.4vw; bottom: 4vh; display: flex; align-items: center; gap: 26px;
  font-weight: 500; font-size: 11px; line-height: 1; letter-spacing: 0.2em; color: rgba(255,255,255,0.4); opacity: 0; transition: opacity 0.8s ease 1.6s; }
.wc-key { display: inline-block; min-width: 18px; padding: 3px 6px; margin-right: 8px; border-radius: 2px; text-align: center;
  font-weight: 700; font-size: 9px; letter-spacing: 0.12em; color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.12); }
.wc-foot .wc-r { margin-left: auto; display: flex; align-items: center; gap: 18px; }
.wc-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; margin-right: 9px; vertical-align: 1px; background: rgba(255,255,255,0.35); }
.wc-srv.ok .wc-dot { background: rgba(120,220,160,0.8); } .wc-srv.off .wc-dot { background: rgba(230,90,70,0.75); }
.wc-build { font-size: 10px; letter-spacing: 0.28em; color: rgba(255,255,255,0.26); }

.wc-load { position: absolute; left: 0; right: 0; bottom: 0; height: 18vh; display: none; flex-direction: column; justify-content: flex-end; padding: 0 5.2vw 4vh;
  background: linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0)); }
.wc-load.on { display: flex; }
.wc-load-t { font-size: 13px; letter-spacing: 0.2em; color: rgba(255,255,255,0.78); margin-bottom: 10px; }
.wc-load-bar { position: relative; height: 2px; background: rgba(255,255,255,0.12); overflow: hidden; }
.wc-load-bar i { position: absolute; left: 0; top: 0; bottom: 0; width: var(--p, 0%); background: var(--wc-redhot); box-shadow: 0 0 10px var(--wc-red); transition: width 0.25s; }
.wc-load.ind .wc-load-bar i { width: 30%; animation: wc-ind 1.2s linear infinite; }
@keyframes wc-ind { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
.wc-err { position: absolute; left: 5.2vw; bottom: 8vh; font-size: 13px; letter-spacing: 0.08em; color: #ff7a66; text-shadow: 0 1px 8px #000; display: none; }
.wc-err.on { display: block; }

.wc-title.shown .wc-logo { opacity: 1; transform: none; }
.wc-title.shown .wc-menu { opacity: 1; transform: none; }
.wc-title.shown .wc-scrim, .wc-title.shown .wc-foot { opacity: 1; }
.wc-title.shown .wc-menu, .wc-title.shown .wc-foot { pointer-events: auto; }
.wc-title.instant .wc-logo, .wc-title.instant .wc-menu, .wc-title.instant .wc-scrim, .wc-title.instant .wc-foot { transition: none; }
.wc-title.manual .wc-logo { transition: none; opacity: var(--wc-logo); transform: translate3d(0, calc(-2.5vh * (1 - var(--wc-logo))), 0) scale(calc(1.12 - 0.12 * var(--wc-logo))); }
.wc-title.manual .wc-menu { transition: none; opacity: var(--wc-menu); transform: translate3d(calc(-12px * (1 - var(--wc-menu))), 0, 0); }
.wc-title.manual .wc-scrim, .wc-title.manual .wc-foot { transition: none; opacity: var(--wc-menu); }
.wc-title.busy .wc-menu { opacity: 0.45; pointer-events: none; }

@media (pointer: coarse) { .wc-item { min-height: 40px; align-items: center; } }

@media (max-height: 500px) and (orientation: landscape) {
  .wc-logo { top: 4vh; left: 4vw; width: 27vw; }
  .wc-menu { bottom: 11vh; left: 4vw; width: 38vw; }
  .wc-item { font-size: 14px; padding: 4px 0 4px 14px; min-height: 0; }
  .wc-item .wc-en, .wc-desc, .wc-foot .wc-k { display: none; }
  .wc-sep { margin: 3px 0 3px 14px; }
  .wc-sub { bottom: 0; min-width: 200px; }
  .wc-sub .wc-item { font-size: 13px; padding: 7px 16px 7px 14px; }
  .wc-foot { bottom: 4.5vh; left: 4vw; right: 3vw; font-size: 10px; }
}
@media (orientation: portrait) {
  .wc-scrim { background: linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 32%, rgba(0,0,0,0) 54%), linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0) 24%); }
  .wc-logo { left: 50%; top: 6.5vh; width: 84vw; transform-origin: 50% 0; transform: translate3d(-50%, -2.5vh, 0) scale(1.1); }
  .wc-title.shown .wc-logo { transform: translate3d(-50%, 0, 0); }
  .wc-title.manual .wc-logo { transform: translate3d(-50%, calc(-2.5vh * (1 - var(--wc-logo))), 0) scale(calc(1.1 - 0.1 * var(--wc-logo))); }
  .wc-menu { left: 7vw; right: 7vw; width: auto; bottom: 10vh; }
  .wc-item { font-size: 18px; padding: 10px 0 10px 18px; }
  .wc-item .wc-en, .wc-foot .wc-k { display: none; }
  .wc-desc { margin-left: 18px; min-height: 0; font-size: 12px; }
  .wc-sub { left: 0; right: 0; bottom: calc(100% + 10px); min-width: 0; background: linear-gradient(90deg, rgba(6,7,8,0.85), rgba(6,7,8,0.6)); }
  .wc-foot { left: 7vw; right: 7vw; bottom: 3.6vh; justify-content: center; font-size: 10px; }
  .wc-foot .wc-r { margin: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .wc-logo, .wc-menu, .wc-scrim, .wc-foot { transition: none !important; }
}
`;

/** 插一次样式（同一个 document 里重复调用不重复插） */
export function injectTitleCss(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById?.('wc-title-css')) return;
  const s = doc.createElement('style');
  s.setAttribute('id', 'wc-title-css');
  s.textContent = TITLE_CSS;
  doc.head.append(s);
}
