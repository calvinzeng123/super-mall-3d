// 《围城》联机大厅（丧尸围城三人合作）：标题菜单上一个「联机（三人）」按钮打开。
// 样子照老派 PC 射击游戏的服务器浏览器 / 多人大厅来：橄榄灰绿的面板、一像素的凸凹边、密排的表格（房间码、房主、人数、延迟用等宽数字），
// 底下一条状态栏；右边一栏是操作（输 4 位房间码加入、起昵称、创建房间 / 进了房间以后的房间码、准备、开始、离开）。
// 没进房间：表格是「最近的房间」（本机记的，点一行就填好房间码）；进了房间：表格是三个座位（主角 / 阿哲 / 林医生）谁坐着、准备了没有、延迟，下面一栏动态。
// 手机竖屏：操作栏在上、表格在下，整页滚；横屏：左右两栏压紧。输入框不被游戏抢键（面板里的按键、点按都不往外传）；房间码输入弹数字键盘。
// 只管界面，连接、开局都交给 coop.js 传进来的回调。

export const LOBBY_CSS = `
.jm-mp-btn { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 2px; margin: 0 10px 10px 0; padding: 9px 16px 10px; min-height: 44px; border: 1px solid rgba(255, 214, 150, .55); background: rgba(16, 14, 10, .62); color: var(--bone, #e8e4da); font: 600 15px/1.1 var(--f-label, sans-serif); letter-spacing: .12em; cursor: pointer; pointer-events: auto; }
.jm-mp-btn small { font-size: 10px; letter-spacing: .2em; opacity: .7; font-weight: 500; }
.jm-mp-btn:hover, .jm-mp-btn:focus-visible { background: rgba(60, 40, 14, .8); outline: none; border-color: #ffd28a; }

.jm-lobby { --lb-body: #3e4637; --lb-panel: #4c5844; --lb-head: #5a6a50; --lb-well: #2a3024; --lb-row: #333b2d; --lb-hi: #8c9681; --lb-lo: #1b1f17;
  --lb-text: #dfe4d8; --lb-dim: #a1ab95; --lb-faint: #6f7a64; --lb-gold: #d6c35a; --lb-sel: #958831; --lb-red: #e0795f; --lb-green: #a6d46f; --lb-amber: #e2b04a;
  --lb-ui: Tahoma, Verdana, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif; --lb-mono: "JetBrains Mono", "SFMono-Regular", Consolas, Menlo, "Courier New", monospace;
  position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; pointer-events: auto; color: var(--lb-text); font: 400 13px/1.35 var(--lb-ui);
  background: radial-gradient(ellipse at 50% 38%, rgba(40, 46, 34, .78), rgba(6, 7, 5, .96) 70%), #070806;
  padding: calc(14px + var(--sat, 0px)) calc(16px + var(--sar, 0px)) calc(14px + var(--sab, 0px)) calc(16px + var(--sal, 0px)); box-sizing: border-box; }
.jm-lobby[hidden] { display: none; }
.jm-lobby *, .jm-lobby *::before, .jm-lobby *::after { box-sizing: border-box; }
.jm-lobby .win { width: min(1000px, 100%); max-height: 100%; display: flex; flex-direction: column; background: var(--lb-body);
  box-shadow: inset 1px 1px 0 var(--lb-hi), inset -1px -1px 0 var(--lb-lo), 0 0 0 1px #0c0e0a, 0 30px 80px rgba(0, 0, 0, .7); }
/* 标题栏 */
.jm-lobby .tbar { display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 4px 0 10px; flex: none; user-select: none;
  background: linear-gradient(#5f6f54, #4f5d46); box-shadow: inset 0 1px 0 #93a085, inset 0 -1px 0 #2c3326; }
.jm-lobby .tbar svg { width: 20px; height: 20px; flex: none; }
.jm-lobby .tbar b { font: 700 14px/1 var(--lb-ui); letter-spacing: .14em; color: #f1ecc4; text-shadow: 0 1px 0 #20261b; }
.jm-lobby .tbar span { font-size: 12px; color: #c9d0bf; letter-spacing: .06em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jm-lobby .tbar .x { margin-left: auto; width: 26px; height: 22px; display: grid; place-items: center; background: var(--lb-panel); border: 0; color: var(--lb-text); font: 700 13px/1 var(--lb-ui); cursor: pointer;
  box-shadow: inset 1px 1px 0 var(--lb-hi), inset -1px -1px 0 var(--lb-lo); }
.jm-lobby .tbar .x:hover { color: #fff; background: #5d6b53; }
/* 页签 */
.jm-lobby .tabs { display: flex; align-items: flex-end; gap: 2px; padding: 8px 10px 0; flex: none; }
.jm-lobby .tab { padding: 6px 14px 5px; font-size: 12px; letter-spacing: .08em; color: var(--lb-dim); background: #434c3b; box-shadow: inset 1px 1px 0 #6e7863, inset -1px 0 0 var(--lb-lo); white-space: nowrap; }
.jm-lobby .tab.on { color: var(--lb-text); background: var(--lb-panel); padding-bottom: 7px; margin-bottom: -1px; position: relative; z-index: 1; box-shadow: inset 1px 1px 0 var(--lb-hi), inset -1px 0 0 var(--lb-lo); }
.jm-lobby .tabs .net { margin-left: auto; align-self: center; display: flex; align-items: center; gap: 6px; font: 12px/1 var(--lb-mono); color: var(--lb-dim); padding-bottom: 4px; white-space: nowrap; }
.jm-lobby .dot { width: 8px; height: 8px; background: var(--lb-faint); box-shadow: 0 0 0 1px #11140e; display: inline-block; flex: none; }
.jm-lobby .dot.ok { background: var(--lb-green); box-shadow: 0 0 0 1px #11140e, 0 0 6px rgba(166, 212, 111, .6); }
.jm-lobby .dot.wait { background: var(--lb-amber); animation: jm-lb-blink 1s steps(2) infinite; }
.jm-lobby .dot.bad { background: var(--lb-red); }
@keyframes jm-lb-blink { 50% { opacity: .25; } }
/* 主体：左边表格、右边操作栏 */
.jm-lobby .main { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 10px; padding: 10px; margin: 0 10px; flex: 1 1 auto; min-height: 0;
  background: var(--lb-panel); box-shadow: inset 1px 1px 0 var(--lb-hi), inset -1px -1px 0 var(--lb-lo); }
.jm-lobby .col { display: flex; flex-direction: column; min-height: 0; min-width: 0; gap: 10px; }
.jm-lobby .cap { display: flex; align-items: baseline; gap: 8px; font-size: 11px; letter-spacing: .16em; color: var(--lb-dim); text-transform: uppercase; }
.jm-lobby .cap b { color: var(--lb-text); font-weight: 700; letter-spacing: .12em; }
.jm-lobby .cap i { margin-left: auto; font-style: normal; font-family: var(--lb-mono); letter-spacing: 0; text-transform: none; }
/* 表格（服务器列表那种密排的） */
.jm-lobby .grid { background: var(--lb-well); box-shadow: inset 1px 1px 0 var(--lb-lo), inset -1px -1px 0 var(--lb-hi); overflow: auto; min-height: 0; flex: 1 1 auto; }
.jm-lobby table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.jm-lobby th { position: sticky; top: 0; z-index: 1; height: 24px; padding: 0 8px; text-align: left; font: 400 11px/1 var(--lb-ui); letter-spacing: .06em; color: var(--lb-text); white-space: nowrap;
  background: linear-gradient(#57644d, #4b5743); box-shadow: inset 1px 1px 0 #7f8a72, inset -1px -1px 0 #262c20; }
.jm-lobby td { height: 30px; padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid #262c20; color: var(--lb-text); }
.jm-lobby tbody tr:nth-child(even) td { background: rgba(255, 255, 255, .018); }
.jm-lobby tbody tr.pick { cursor: pointer; }
.jm-lobby tbody tr.pick:hover td { background: rgba(214, 195, 90, .1); }
.jm-lobby tbody tr.sel td, .jm-lobby tbody tr.sel:hover td { background: var(--lb-sel); color: #fffbe0; }
.jm-lobby tbody tr.sel td .m, .jm-lobby tbody tr.sel td .d { color: #fffbe0; }
.jm-lobby tbody tr.blank td { color: var(--lb-faint); }
.jm-lobby td.m, .jm-lobby .m { font-family: var(--lb-mono); font-variant-numeric: tabular-nums; }
.jm-lobby td.r, .jm-lobby th.r { text-align: right; }
.jm-lobby td.c, .jm-lobby th.c { text-align: center; }
.jm-lobby td .d { color: var(--lb-dim); }
.jm-lobby .tag { display: inline-block; padding: 2px 6px 1px; font: 700 10px/1.2 var(--lb-ui); letter-spacing: .1em; vertical-align: 1px; }
.jm-lobby .tag.host { background: #6c6223; color: #fff3b0; box-shadow: inset 0 0 0 1px #a5963c; }
.jm-lobby .tag.me { background: #2f4a5a; color: #cfeaff; box-shadow: inset 0 0 0 1px #4d7489; }
.jm-lobby .st { font-weight: 700; letter-spacing: .06em; }
.jm-lobby .st.ready { color: var(--lb-green); }
.jm-lobby .st.wait { color: var(--lb-amber); }
.jm-lobby .st.bot { color: var(--lb-faint); font-weight: 400; }
.jm-lobby .ping.pg { color: var(--lb-green); } .jm-lobby .ping.py { color: var(--lb-amber); } .jm-lobby .ping.pr { color: var(--lb-red); }
.jm-lobby tbody tr.sel td.ping, .jm-lobby tbody tr.sel td .st { color: #fffbe0; text-shadow: 0 1px 0 rgba(40, 34, 6, .45); }
.jm-lobby .bars { display: inline-flex; align-items: flex-end; gap: 1px; height: 10px; margin-right: 6px; vertical-align: -1px; }
.jm-lobby .bars u { display: block; width: 3px; background: #4e5845; text-decoration: none; }
.jm-lobby .bars u:nth-child(1) { height: 4px; } .jm-lobby .bars u:nth-child(2) { height: 7px; } .jm-lobby .bars u:nth-child(3) { height: 10px; }
.jm-lobby .ping.pg .bars u { background: var(--lb-green); } .jm-lobby .ping.py .bars u:nth-child(-n+2) { background: var(--lb-amber); } .jm-lobby .ping.pr .bars u:nth-child(1) { background: var(--lb-red); }
.jm-lobby tbody tr.sel td.ping .bars u { box-shadow: 0 0 0 1px rgba(40, 34, 6, .5); }
.jm-lobby .jc { display: none; }
.jm-lobby .main.inroom .grid { flex: none; }
.jm-lobby .main.inroom .log { flex: 1 1 auto; height: auto; min-height: 92px; }
/* 动态（谁进来了、谁准备了） */
.jm-lobby .log { flex: 0 0 auto; height: 92px; overflow: auto; padding: 6px 8px; font: 12px/1.55 var(--lb-mono); color: var(--lb-dim); background: var(--lb-well); box-shadow: inset 1px 1px 0 var(--lb-lo), inset -1px -1px 0 var(--lb-hi); }
.jm-lobby .log p { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jm-lobby .log p em { font-style: normal; color: var(--lb-faint); margin-right: 8px; }
.jm-lobby .log p.hi { color: var(--lb-gold); }
/* 右边操作栏 */
.jm-lobby .side { gap: 12px; }
.jm-lobby .box { padding: 10px; background: #46513e; box-shadow: inset 1px 1px 0 var(--lb-lo), inset -1px -1px 0 #66715a, 0 0 0 1px #3a4233; }
.jm-lobby .box h4 { margin: 0 0 8px; font: 700 11px/1 var(--lb-ui); letter-spacing: .2em; color: var(--lb-dim); }
.jm-lobby label { display: block; font-size: 11px; letter-spacing: .14em; color: var(--lb-dim); margin: 0 0 5px; }
.jm-lobby input.txt { width: 100%; height: 30px; padding: 0 8px; background: var(--lb-well); border: 0; color: var(--lb-text); font: 15px/1 var(--lb-ui); border-radius: 0; outline: none;
  box-shadow: inset 1px 1px 0 var(--lb-lo), inset -1px -1px 0 var(--lb-hi); }
.jm-lobby input.txt:focus { box-shadow: inset 1px 1px 0 var(--lb-lo), inset -1px -1px 0 var(--lb-hi), 0 0 0 1px var(--lb-gold); }
/* 4 位房间码：四个格子，真的输入框盖在上面（透明），手机弹数字键盘 */
.jm-lobby .pin { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.jm-lobby .pin span { height: 54px; display: grid; place-items: center; font: 700 30px/1 var(--lb-mono); color: var(--lb-gold); background: var(--lb-well); text-shadow: 0 0 10px rgba(214, 195, 90, .35);
  box-shadow: inset 1px 1px 0 var(--lb-lo), inset -1px -1px 0 var(--lb-hi); }
.jm-lobby .pin span:empty::after { content: ''; width: 14px; height: 2px; background: var(--lb-faint); }
.jm-lobby .pin.focus span.cur { box-shadow: inset 1px 1px 0 var(--lb-lo), inset -1px -1px 0 var(--lb-hi), 0 0 0 1px var(--lb-gold); }
.jm-lobby .pin.focus span.cur:empty::after { background: var(--lb-gold); animation: jm-lb-blink 1s steps(2) infinite; }
.jm-lobby .pin.bad span { color: var(--lb-red); }
.jm-lobby .pin input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .01; font-size: 16px; border: 0; background: transparent; color: transparent; caret-color: transparent; cursor: text; }
/* 按钮：凸起的方块；主按钮金色 */
.jm-lobby .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 0 14px; border: 0; cursor: pointer; white-space: nowrap;
  background: linear-gradient(#5a684f, #4c5844); color: var(--lb-text); font: 400 13px/1 var(--lb-ui); letter-spacing: .1em; border-radius: 0;
  box-shadow: inset 1px 1px 0 var(--lb-hi), inset -1px -1px 0 var(--lb-lo), 0 0 0 1px #20251b; }
.jm-lobby .btn:hover { background: linear-gradient(#66755a, #56634d); color: #fff; }
.jm-lobby .btn:active { box-shadow: inset 1px 1px 0 var(--lb-lo), inset -1px -1px 0 var(--lb-hi), 0 0 0 1px #20251b; padding-top: 2px; }
.jm-lobby .btn:focus-visible { outline: 1px dotted var(--lb-gold); outline-offset: -5px; }
.jm-lobby .btn.go { background: linear-gradient(#b4a24a, #8f7f2e); color: #1d1a08; font-weight: 700; text-shadow: 0 1px 0 rgba(255, 245, 180, .35);
  box-shadow: inset 1px 1px 0 #e6d98a, inset -1px -1px 0 #4f4612, 0 0 0 1px #20251b; }
.jm-lobby .btn.go:hover { background: linear-gradient(#c6b457, #9e8d35); color: #120f02; }
.jm-lobby .btn.on { background: linear-gradient(#5d7a3d, #4a6431); color: #eaffd0; }
.jm-lobby .btn:disabled { opacity: .45; cursor: default; pointer-events: none; }
.jm-lobby .btn.wide { width: 100%; }
.jm-lobby .btn kbd { font: 10px/1 var(--lb-mono); color: inherit; opacity: .6; letter-spacing: 0; }
.jm-lobby .row { display: flex; gap: 8px; margin-top: 8px; }
.jm-lobby .row > .btn { flex: 1; }
.jm-lobby .or { display: flex; align-items: center; gap: 8px; margin: 2px 0; font-size: 11px; letter-spacing: .3em; color: var(--lb-faint); }
.jm-lobby .or::before, .jm-lobby .or::after { content: ''; flex: 1; height: 0; border-top: 1px solid #2c3326; border-bottom: 1px solid #5b6650; }
/* 进了房间：房间码大字 */
.jm-lobby .code { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.jm-lobby .code b { font: 700 42px/1 var(--lb-mono); letter-spacing: .14em; color: var(--lb-gold); text-shadow: 0 0 14px rgba(214, 195, 90, .3); user-select: all; }
.jm-lobby .code .btn { min-height: 30px; padding: 0 10px; font-size: 12px; }
.jm-lobby .facts { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 10px 0 0; font-size: 12px; }
.jm-lobby .facts dt { color: var(--lb-dim); }
.jm-lobby .facts dd { margin: 0; text-align: right; font-family: var(--lb-mono); }
.jm-lobby .hint { margin: 8px 0 0; font-size: 12px; color: var(--lb-dim); line-height: 1.5; }
/* 状态栏 */
.jm-lobby .foot { display: flex; align-items: center; gap: 10px; min-height: 30px; padding: 6px 10px 8px; flex: none; }
.jm-lobby .foot .msg { flex: 1; min-width: 0; padding: 5px 8px; font-size: 12px; color: var(--lb-text); background: #363e30; box-shadow: inset 1px 1px 0 var(--lb-lo), inset -1px -1px 0 #5b6650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jm-lobby .foot .msg.bad { color: #ffb19c; }
.jm-lobby .foot .msg:empty::before { content: '就绪'; color: var(--lb-faint); }
.jm-lobby .foot .ver { font: 11px/1 var(--lb-mono); color: var(--lb-faint); white-space: nowrap; }
.jm-lobby [hidden], .jm-lobby .hide { display: none !important; }

/* 窄屏（手机竖屏）：操作栏放到表格上面，整页滚 */
@media (max-width: 720px) {
  .jm-lobby { padding: var(--sat, 0px) var(--sar, 0px) var(--sab, 0px) var(--sal, 0px); align-items: stretch; }
  .jm-lobby .win { width: 100%; max-height: none; height: 100%; box-shadow: none; }
  .jm-lobby .main { grid-template-columns: 1fr; margin: 0 8px; padding: 8px; overflow: auto; align-content: start; }
  .jm-lobby .side { order: -1; }
  .jm-lobby .grid { flex: none; max-height: none; }
  .jm-lobby .tabs { padding: 8px 8px 0; }
  .jm-lobby .tabs .net { font-size: 11px; }
  .jm-lobby .tab { padding: 6px 10px 5px; }
  .jm-lobby .tbar span { display: none; }
  .jm-lobby .btn { min-height: 44px; font-size: 14px; }
  .jm-lobby .pin span { height: 60px; font-size: 32px; }
  .jm-lobby input.txt { height: 40px; font-size: 16px; }
  .jm-lobby td { height: 40px; }
  .jm-lobby .hm { display: none; }
  .jm-lobby th.jc, .jm-lobby td.jc { display: table-cell; width: 72px; padding: 0 6px 0 0; }
  .jm-lobby td.jc .btn { min-height: 30px; padding: 0 12px; font-size: 12px; }
  .jm-lobby .log, .jm-lobby .main.inroom .log { height: 96px; flex: none; }
  .jm-lobby .foot { padding: 6px 8px 8px; }
  .jm-lobby .foot .ver { display: none; }
}
/* 矮屏（手机横屏）：两栏压紧，表格、操作栏各自滚 */
@media (max-height: 520px) and (min-width: 560px) {
  .jm-lobby { padding: var(--sat, 0px) calc(8px + var(--sar, 0px)) var(--sab, 0px) calc(8px + var(--sal, 0px)); align-items: stretch; }
  .jm-lobby .win { width: 100%; max-height: none; height: 100%; }
  .jm-lobby .tbar { height: 28px; }
  .jm-lobby .tabs { display: none; }
  .jm-lobby .main { grid-template-columns: minmax(0, 1fr) minmax(250px, 300px); margin: 6px 6px 0; padding: 6px; gap: 8px; overflow: hidden; }
  .jm-lobby .main > .col { overflow: auto; }
  .jm-lobby .side { order: 0; gap: 8px; }
  .jm-lobby .box { padding: 8px; }
  .jm-lobby .box h4 { margin-bottom: 6px; }
  .jm-lobby .btn { min-height: 38px; }
  .jm-lobby .pin span { height: 44px; font-size: 26px; }
  .jm-lobby input.txt { height: 34px; }
  .jm-lobby td { height: 32px; }
  .jm-lobby .code b { font-size: 32px; }
  .jm-lobby .main.inroom .log { min-height: 48px; }
  .jm-lobby .hint, .jm-lobby .or { display: none; }
  .jm-lobby .hm { display: none; }
  .jm-lobby .foot { padding: 4px 6px 6px; min-height: 0; }
  .jm-lobby .foot .ver { display: none; }
}
`;

const MSG = Object.freeze({
  connecting: ['正在连接联机服务器…', false],
  noserver: ['联机服务器还没上线（服务器地址还没配置）。现在可以先一个人玩，电脑队友会跟着你。', true],
  offline: ['联机服务器还没上线（连不上）。现在可以先一个人玩，电脑队友会跟着你。', true],
  full: ['房间满了（最多三人）。', true],
  nope: ['没有这个房间：房间码不对，或者房主已经走了。', true],
  slow: ['房间码试错太多次了，过一会儿再试。', true],
  closed: ['和房间断开了，接着一个人打。', true],
  left: ['已经离开房间。', false],
  in: ['', false],
});
// 标题栏上的小标：一段城墙（垛口）——《围城》，原创几何图形
const EMBLEM = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="1" y="1" width="18" height="18" fill="#2c3326"/><path d="M3 16V8h2.5V5.5H8V8h1.6V5.5h2.8V8H14V5.5h2.5V8H17v8z" fill="#d6c35a"/><path d="M8.6 16v-3.4a1.4 1.4 0 0 1 2.8 0V16z" fill="#2c3326"/></svg>';
const RECENT_KEY = 'jimao-mp-recent', RECENT_MAX = 8;

/**
 * ui：游戏界面根；state()：现在的房间状态（coop.js 给）；create(name) / join(code, name) / start() / leave() / rename(name) / ready(on)：回调。
 * 返回 { open(), close(), status(key), render(), log(text, hi), autoJoin(code), entry(box)（在标题菜单上放按钮）, dispose() }
 */
export function createLobby({ ui, storage = null, params = {}, state, create, join, start, leave, rename, ready = () => {}, doc = globalThis.document } = {}) {
  if (!doc) return null;
  const el = doc.createElement('div'); el.className = 'jm-lobby'; el.hidden = true;
  el.innerHTML = `<div class="win" role="dialog" aria-label="《围城》联机大厅">
    <div class="tbar">${EMBLEM}<b>围城</b><span>多人联机 · 三人合作守城</span><button class="x" data-a="close" aria-label="关闭">✕</button></div>
    <div class="tabs"><div class="tab on" data-v="tab">房间</div><div class="net"><i class="dot" data-v="dot"></i><span data-v="net">未连接</span></div></div>
    <div class="main">
      <div class="col">
        <div class="cap" data-v="cap"></div>
        <div class="grid"><table><thead data-v="head"></thead><tbody data-v="rows"></tbody></table></div>
        <div class="log" data-v="log" aria-live="polite" hidden></div>
      </div>
      <div class="col side">
        <div data-v="home">
          <div class="box"><h4>加入房间</h4>
            <label for="jm-mp-code">房间码（4 位数字）</label>
            <div class="pin" data-v="pin"><span></span><span></span><span></span><span></span>
              <input id="jm-mp-code" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" enterkeyhint="go" aria-label="4 位房间码"></div>
            <div class="row"><button class="btn go" data-a="join">加入 <kbd>Enter</kbd></button></div>
          </div>
          <div class="or">或者</div>
          <div class="box"><h4>创建房间</h4>
            <label for="jm-mp-name">昵称</label><input id="jm-mp-name" class="txt" maxlength="16" autocomplete="nickname" placeholder="起个名字" spellcheck="false">
            <div class="row"><button class="btn" data-a="create">创建房间</button></div>
            <p class="hint">建好以后把 4 位房间码发给朋友。最多三人：主角、阿哲、林医生；没人坐的座位由电脑队友顶上，开打以后也能中途加入。</p>
          </div>
        </div>
        <div data-v="room" hidden>
          <div class="box"><h4>房间码</h4>
            <div class="code"><b data-v="code"></b><button class="btn" data-a="copy">复制邀请</button></div>
            <dl class="facts"><dt>模式</dt><dd>丧尸围城 · 合作</dd><dt>人数</dt><dd data-v="count"></dd><dt>准备</dt><dd data-v="ready"></dd><dt>奖励</dt><dd data-v="bonus"></dd></dl>
          </div>
          <div class="box">
            <div class="row" style="margin-top:0"><button class="btn" data-a="ready" data-v="readyBtn">准备</button></div>
            <div class="row" data-v="startrow"><button class="btn go" data-a="start" data-v="startBtn">开始游戏</button></div>
            <div class="row"><button class="btn" data-a="leave">离开房间</button><button class="btn" data-a="hide">回到游戏</button></div>
            <p class="hint" data-v="hint"></p>
          </div>
        </div>
      </div>
    </div>
    <div class="foot"><div class="msg" data-v="msg" aria-live="polite"></div><span class="ver">围城 · 联机</span></div>
  </div>`;
  (ui || doc.body).append(el);
  const $ = (s) => el.querySelector(s);
  const nameIn = $('#jm-mp-name'), codeIn = $('#jm-mp-code'), msgEl = $('[data-v="msg"]'), pin = $('[data-v="pin"]'), logEl = $('[data-v="log"]');
  let lastStatus = 'in', retried = 0, pick = -1;
  const lines = [];
  try { nameIn.value = storage?.getItem?.('jimao-mp-name') || ''; } catch { /* */ }
  const name = () => { const n = nameIn.value.trim().slice(0, 16) || `玩家${Math.floor(Math.random() * 90 + 10)}`; nameIn.value = n; try { storage?.setItem?.('jimao-mp-name', n); } catch { /* */ } return n; };
  const say = (text, bad = false) => { msgEl.textContent = text; msgEl.classList.toggle('bad', !!bad); };
  // 游戏自己的键盘、触屏监听别抢：面板里的按键、点按都不往外传
  for (const t of ['keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) el.addEventListener(t, (e) => e.stopPropagation(), { passive: t === 'touchstart' || t === 'wheel' });

  // ---- 4 位房间码 ----
  const paintPin = () => {
    const v = codeIn.value, cells = pin.querySelectorAll('span');
    cells.forEach((c, i) => { c.textContent = v[i] || ''; c.classList.toggle('cur', i === Math.min(v.length, 3) && doc.activeElement === codeIn); });
    pin.classList.toggle('focus', doc.activeElement === codeIn);
  };
  const setCode = (c) => { codeIn.value = String(c || '').normalize('NFKC').replace(/[^0-9]/g, '').slice(0, 4); pin.classList.remove('bad'); paintPin(); };
  codeIn.addEventListener('input', () => { setCode(codeIn.value); pick = -1; paintRows(); });
  codeIn.addEventListener('focus', paintPin); codeIn.addEventListener('blur', paintPin);
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doJoin(); } });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); } });
  nameIn.addEventListener('change', () => { if (state().code && state().connected) rename(name()); });
  function doJoin(c = codeIn.value) {
    if (!/^[0-9]{4}$/.test(c)) { pin.classList.add('bad'); say('房间码是 4 位数字', true); codeIn.focus(); return; }
    join(c, name());
  }

  // ---- 最近的房间（本机记的）----
  const recent = () => { try { const a = JSON.parse(storage?.getItem?.(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter((r) => r && /^[0-9]{4}$/.test(r.code)).slice(0, RECENT_MAX) : []; } catch { return []; } };
  function remember(s) {
    if (!s.code || !/^[0-9]{4}$/.test(s.code)) return;
    const hostName = s.players.find((p) => p.seat === s.host)?.name || '', list = recent().filter((r) => r.code !== s.code);
    list.unshift({ code: s.code, host: String(hostName).slice(0, 16), n: s.players.length, t: Date.now() });
    try { storage?.setItem?.(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* */ }
  }
  const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? '刚才' : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : s < 86400 ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 86400)} 天前`; };
  const pingCell = (ms) => { if (!Number.isFinite(ms)) return '<td class="r m d">—</td>'; const k = ms < 90 ? 'pg' : ms < 180 ? 'py' : 'pr'; return `<td class="r m ping ${k}"><span class="bars"><u></u><u></u><u></u></span>${Math.round(ms)}</td>`; };

  el.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-code]');
    if (row) { const c = row.dataset.code; if (e.target.closest('[data-a="rjoin"]')) { setCode(c); doJoin(c); return; } setCode(c); pick = +row.dataset.i; paintRows(); return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close' || a === 'hide') api.close();
    if (a === 'create') { retried = 0; create(name()); }
    if (a === 'join') doJoin();
    if (a === 'start') { start(); api.close(); }
    if (a === 'ready') { const s = state(), me = s.players.find((p) => p.seat === s.seat); ready(!me?.ready); }
    if (a === 'leave') leave();
    if (a === 'copy') copyLink();
  });
  el.addEventListener('dblclick', (e) => { const row = e.target.closest('tr[data-code]'); if (row) { setCode(row.dataset.code); doJoin(row.dataset.code); } });
  function link() { const q = `?siege=1&mp=1&room=${state().code}`; const L = globalThis.location; return L ? `${L.origin}${L.pathname}${q}` : q; } // 带上 siege=1&mp=1：朋友从封面点任何枪战入口都进丧尸围城联机（封面不覆盖地址栏已有的键）
  async function copyLink() {
    const url = link();
    try { await navigator.clipboard.writeText(url); say(`邀请链接已复制（房间码 ${state().code}）：${url}`); }
    catch { say(`复制不了，手动发这个链接：${url}`); }
  }

  function paintRows() {
    const s = state(), inRoom = !!s.code && (s.connected || lastStatus === 'in');
    const head = $('[data-v="head"]'), rows = $('[data-v="rows"]'), cap = $('[data-v="cap"]');
    if (inRoom) {
      cap.innerHTML = `<b>房间 ${escape(s.code)}</b><span>座位</span><i>${s.players.length} / 3</i>`;
      head.innerHTML = '<tr><th style="width:34px" class="c">#</th><th style="width:22%">角色</th><th>玩家</th><th style="width:22%">状态</th><th style="width:84px" class="r">延迟</th></tr>';
      rows.innerHTML = s.roles.map((role, seat) => {
        const p = s.players.find((q) => q.seat === seat), me = seat === s.seat, host = p && seat === s.host;
        const who = p ? `${escape(p.name)}${host ? ' <span class="tag host">房主</span>' : ''}${me ? ' <span class="tag me">你</span>' : ''}` : '<span class="d">电脑队友</span>';
        const st = !p ? '<span class="st bot">AI 顶替</span>' : host ? '<span class="st ready">房主</span>' : s.started ? '<span class="st ready">战斗中</span>' : p.ready ? '<span class="st ready">已准备</span>' : '<span class="st wait">未准备</span>';
        const ms = me ? (s.rtt ?? p?.ping) : p?.ping;
        return `<tr class="${me ? 'sel' : ''}"><td class="c m d">${seat + 1}</td><td>${escape(role)}</td><td>${who}</td><td>${st}</td>${p ? pingCell(ms) : '<td class="r m d">BOT</td>'}</tr>`;
      }).join('');
      return;
    }
    const list = recent();
    cap.innerHTML = `<b>最近的房间</b><span>本机记录</span><i>${list.length}</i>`;
    head.innerHTML = '<tr><th style="width:26px"></th><th style="width:84px">房间码</th><th>房主</th><th style="width:60px" class="r">人数</th><th style="width:96px" class="r hm">上次</th><th class="jc"></th></tr>';
    const blank = Math.max(0, 6 - list.length);
    rows.innerHTML = list.map((r, i) => `<tr class="pick${i === pick ? ' sel' : ''}" data-code="${r.code}" data-i="${i}"><td class="c d">▸</td><td class="m">${r.code}</td><td>${escape(r.host || '—')}</td><td class="r m">${Math.max(1, Math.min(3, r.n | 0))}/3</td><td class="r d hm">${ago(r.t)}</td><td class="r jc"><button class="btn" data-a="rjoin">加入</button></td></tr>`).join('')
      + Array.from({ length: blank }, (_, i) => `<tr class="blank"><td></td><td class="m">${!list.length && i === 0 ? '' : ''}</td><td>${!list.length && i === 0 ? '还没有记录：加入或创建一个房间以后会出现在这里' : ''}</td><td></td><td class="hm"></td><td class="jc"></td></tr>`).join('');
  }
  function paintLog() { logEl.innerHTML = lines.map((l) => `<p class="${l.hi ? 'hi' : ''}"><em>${l.at}</em>${escape(l.text)}</p>`).join(''); logEl.scrollTop = logEl.scrollHeight; }

  const api = {
    open() { el.hidden = false; api.render(); if (globalThis.document?.pointerLockElement) globalThis.document.exitPointerLock?.(); },
    close() { el.hidden = true; },
    get isOpen() { return !el.hidden; },
    get el() { return el; },
    status(key) {
      lastStatus = key;
      if (key === 'taken' && retried++ < 6) { create(name()); return; } // 房间码撞了：换一个再建
      const [text, bad] = MSG[key] || ['', false]; say(text, bad); api.render();
    },
    /** 动态栏里加一行（谁进来了、谁准备了……） */
    log(text, hi = false) { const d = new Date(), at = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; lines.push({ text: String(text), hi, at }); while (lines.length > 30) lines.shift(); paintLog(); },
    render() {
      const s = state(), inRoom = !!s.code && (s.connected || lastStatus === 'in');
      $('[data-v="home"]').hidden = inRoom; $('[data-v="room"]').hidden = !inRoom; logEl.hidden = !inRoom; $('.main').classList.toggle('inroom', inRoom);
      $('[data-v="tab"]').textContent = inRoom ? `房间 ${s.code}` : '服务器浏览';
      const dot = $('[data-v="dot"]'), net = $('[data-v="net"]'), connecting = lastStatus === 'connecting';
      dot.className = `dot ${s.connected ? 'ok' : connecting ? 'wait' : MSG[lastStatus]?.[1] ? 'bad' : ''}`;
      net.textContent = s.connected ? `在线${Number.isFinite(s.rtt) ? ` · ${Math.round(s.rtt)} ms` : ''}` : connecting ? '连接中…' : '未连接';
      paintRows(); paintPin();
      if (!inRoom) return;
      remember(s);
      $('[data-v="code"]').textContent = s.code;
      const me = s.seat, host = s.host, others = s.players.filter((p) => p.seat !== host), readyN = others.filter((p) => p.ready).length;
      $('[data-v="count"]').textContent = `${s.players.length} / 3`;
      $('[data-v="ready"]').textContent = others.length ? `${readyN} / ${others.length}` : '—';
      $('[data-v="bonus"]').textContent = s.players.length > 1 ? '资源 ×2' : '—';
      const mine = s.players.find((p) => p.seat === me), readyBtn = $('[data-v="readyBtn"]');
      readyBtn.parentElement.hidden = me === host || s.started; readyBtn.textContent = mine?.ready ? '取消准备' : '准备'; readyBtn.classList.toggle('on', !!mine?.ready);
      const startBtn = $('[data-v="startBtn"]');
      $('[data-v="startrow"]').hidden = me !== host; startBtn.textContent = s.started ? '重新开一局（大家一起）' : others.length && readyN < others.length ? `开始游戏（${readyN}/${others.length} 已准备）` : '开始游戏';
      const hint = $('[data-v="hint"]');
      if (me !== host) hint.textContent = s.started ? '已经开打了——进入这一局，站到你扮演的那个人现在的位置。' : mine?.ready ? '已准备，等房主开始。' : '点「准备」告诉房主你好了；房主开始以后自动进入。';
      else hint.textContent = s.players.length > 1 ? (readyN >= others.length ? '人齐了，可以开始。没来的座位由电脑队友顶上。' : '等队友准备；也可以直接开始。') : '把房间码或邀请链接发给朋友。也可以直接开始，别人中途加入。';
    },
    /** 网址带 ?room=1234：打开大厅，房间码填好、直接加入（不是 4 位数字的只填进去、提示一下） */
    autoJoin(code) { const c = String(code ?? '').normalize('NFKC').replace(/[^0-9]/g, ''); api.open(); setCode(c); if (/^[0-9]{4}$/.test(c)) join(c, name()); else say('邀请链接里的房间码不对（应该是 4 位数字）', true); },
    /** 在标题菜单（box 前面）放「联机（三人）」按钮 */
    entry(box) {
      if (!box?.parentElement) return null;
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'jm-mp-btn'; b.dataset.act = 'jm-coop';
      b.innerHTML = '<small>丧尸围城</small><b>联机（三人）</b>';
      b.addEventListener('click', (e) => { e.stopPropagation(); api.open(); });
      box.parentElement.insertBefore(b, box); return b;
    },
    dispose() { el.remove(); },
  };
  return api;
}
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
