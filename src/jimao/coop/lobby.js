// 丧尸围城联机大厅：封面（标题菜单）上一个「联机（三人）」按钮打开。建房（给房间码、复制邀请链接 ?room=房间码）/ 输房间码加入；
// 昵称；三个座位（主角 / 阿哲 / 林医生）谁坐着；房主按「开始」，开打以后进来的直接加入这一局。手机上点得动（按钮够大、输入框不被游戏抢键）。
// 只管界面，连接、开局都交给 coop.js 传进来的回调。

export const LOBBY_CSS = `
.jm-mp-btn { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 2px; margin: 0 10px 10px 0; padding: 9px 16px 10px; min-height: 44px; border: 1px solid rgba(255, 214, 150, .55); background: rgba(16, 14, 10, .62); color: var(--bone, #e8e4da); font: 600 15px/1.1 var(--f-label, sans-serif); letter-spacing: .12em; cursor: pointer; pointer-events: auto; }
.jm-mp-btn small { font-size: 10px; letter-spacing: .2em; opacity: .7; font-weight: 500; }
.jm-mp-btn:hover, .jm-mp-btn:focus-visible { background: rgba(60, 40, 14, .8); outline: none; border-color: #ffd28a; }
.jm-lobby { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(4, 4, 6, .62); pointer-events: auto; padding: calc(12px + var(--sat, 0px)) calc(16px + var(--sar, 0px)) calc(12px + var(--sab, 0px)) calc(16px + var(--sal, 0px)); }
.jm-lobby[hidden] { display: none; }
.jm-lobby .box { width: min(460px, 100%); max-height: 100%; overflow: auto; background: rgba(18, 17, 15, .96); border: 1px solid rgba(255, 214, 150, .35); color: var(--bone, #e8e4da); font: 500 14px/1.5 var(--f-label, sans-serif); padding: 18px 18px 16px; box-shadow: 0 18px 60px rgba(0, 0, 0, .6); }
.jm-lobby h3 { margin: 0 0 4px; font-size: 18px; letter-spacing: .16em; color: #ffd28a; }
.jm-lobby .sub { margin: 0 0 12px; font-size: 12px; opacity: .72; }
.jm-lobby label { display: block; font-size: 11px; letter-spacing: .18em; opacity: .7; margin: 10px 0 4px; }
.jm-lobby input { width: 100%; box-sizing: border-box; min-height: 42px; padding: 8px 10px; background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .22); color: inherit; font: 600 16px/1.2 var(--f-mono, monospace); letter-spacing: .08em; border-radius: 0; }
.jm-lobby input.code { text-transform: uppercase; letter-spacing: .4em; text-align: center; }
.jm-lobby .row { display: flex; gap: 8px; align-items: stretch; margin-top: 8px; }
.jm-lobby .row > * { flex: 1; }
.jm-lobby button.b { min-height: 44px; padding: 8px 12px; border: 1px solid rgba(255, 214, 150, .5); background: rgba(255, 210, 138, .12); color: inherit; font: 600 14px/1.2 var(--f-label, sans-serif); letter-spacing: .12em; cursor: pointer; }
.jm-lobby button.b.main { background: #c98a2e; border-color: #ffd28a; color: #17120a; }
.jm-lobby button.b:disabled { opacity: .4; cursor: default; }
.jm-lobby .or { text-align: center; font-size: 11px; opacity: .5; margin: 12px 0 2px; letter-spacing: .3em; }
.jm-lobby .msg { margin-top: 12px; min-height: 1.5em; font-size: 13px; color: #ffcf99; }
.jm-lobby .msg.bad { color: #ff8a7a; }
.jm-lobby .codebig { font: 700 34px/1 var(--f-mono, monospace); letter-spacing: .32em; text-align: center; color: #ffd28a; margin: 6px 0 2px; user-select: all; }
.jm-lobby .seats { margin-top: 12px; display: grid; gap: 6px; }
.jm-lobby .seat { display: grid; grid-template-columns: 64px 1fr auto; gap: 8px; align-items: center; padding: 7px 10px; background: rgba(255, 255, 255, .05); border-left: 3px solid rgba(255, 255, 255, .2); }
.jm-lobby .seat.human { border-left-color: #ffd28a; }
.jm-lobby .seat.me { background: rgba(255, 210, 138, .1); }
.jm-lobby .seat em { font-style: normal; font-size: 12px; opacity: .7; }
.jm-lobby .seat i { font-style: normal; font-size: 11px; opacity: .7; letter-spacing: .1em; }
.jm-lobby .close { float: right; margin: -6px -6px 0 0; min-width: 40px; min-height: 40px; background: none; border: 0; color: inherit; font-size: 22px; cursor: pointer; opacity: .7; }
@media (max-height: 500px) { .jm-lobby .box { padding: 12px 14px; } .jm-lobby .codebig { font-size: 26px; } .jm-lobby label { margin-top: 6px; } }
`;

const MSG = Object.freeze({
  connecting: ['正在连接联机服务器…', false],
  noserver: ['联机服务器还没上线（服务器地址还没配置）。现在可以先一个人玩，电脑队友会跟着你。', true],
  offline: ['联机服务器还没上线（连不上）。现在可以先一个人玩，电脑队友会跟着你。', true],
  full: ['房间满了（最多三人）。', true],
  nope: ['没有这个房间：房间码不对，或者房主已经走了。', true],
  closed: ['和房间断开了，接着一个人打。', true],
  left: ['已经离开房间。', false],
  in: ['', false],
});

/**
 * ui：游戏界面根；state()：现在的房间状态（coop.js 给）；create(name) / join(code, name) / start() / leave() / rename(name)：回调。
 * 返回 { open(), close(), status(key), render(), autoJoin(code), entry(box)（在标题菜单上放按钮）, dispose() }
 */
export function createLobby({ ui, storage = null, params = {}, state, create, join, start, leave, rename, doc = globalThis.document } = {}) {
  if (!doc) return null;
  const el = doc.createElement('div'); el.className = 'jm-lobby'; el.hidden = true;
  el.innerHTML = `<div class="box" role="dialog" aria-label="联机（三人）"><button class="close" data-a="close" aria-label="关闭">×</button>
    <h3>联机 · 三人</h3><p class="sub">三人一起守城：你们分别扮演主角、阿哲、林医生，没人坐的座位由电脑队友顶上；开打以后也能中途加入。</p>
    <div data-v="home"><label for="jm-mp-name">昵称</label><input id="jm-mp-name" maxlength="16" autocomplete="nickname" placeholder="起个名字">
      <div class="row"><button class="b main" data-a="create">创建房间</button></div>
      <div class="or">或者</div>
      <label for="jm-mp-code">输入房间码加入</label><div class="row"><input id="jm-mp-code" class="code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD"><button class="b" data-a="join">加入</button></div></div>
    <div data-v="room" hidden><label>房间码</label><div class="codebig" data-v="code"></div>
      <div class="row"><button class="b" data-a="copy">复制邀请链接</button></div>
      <div class="seats" data-v="seats"></div>
      <div class="row" data-v="startrow"><button class="b main" data-a="start">开始这一局</button></div>
      <div class="row"><button class="b" data-a="leave">离开房间</button><button class="b" data-a="hide">回到游戏</button></div></div>
    <div class="msg" data-v="msg" aria-live="polite"></div></div>`;
  (ui || doc.body).append(el);
  const $ = (s) => el.querySelector(s);
  const nameIn = $('#jm-mp-name'), codeIn = $('#jm-mp-code'), msgEl = $('[data-v="msg"]');
  let lastStatus = 'in', retried = 0;
  try { nameIn.value = storage?.getItem?.('jimao-mp-name') || ''; } catch { /* */ }
  const name = () => { const n = nameIn.value.trim().slice(0, 16) || `玩家${Math.floor(Math.random() * 90 + 10)}`; nameIn.value = n; try { storage?.setItem?.('jimao-mp-name', n); } catch { /* */ } return n; };
  const say = (text, bad = false) => { msgEl.textContent = text; msgEl.classList.toggle('bad', !!bad); };
  // 游戏自己的键盘、触屏监听别抢：面板里的按键、点按都不往外传
  for (const t of ['keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) el.addEventListener(t, (e) => e.stopPropagation(), { passive: t === 'touchstart' || t === 'wheel' });
  codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  nameIn.addEventListener('change', () => { if (state().code && state().connected) rename(name()); });
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close' || a === 'hide') api.close();
    if (a === 'create') { retried = 0; create(name()); }
    if (a === 'join') { const c = codeIn.value.trim(); if (!/^[A-HJ-NP-Z2-9]{4,6}$/.test(c)) { say('房间码是 4–6 位字母和数字（没有 0、O、1、I）', true); return; } join(c, name()); }
    if (a === 'start') { start(); api.close(); }
    if (a === 'leave') leave();
    if (a === 'copy') copyLink();
  });
  function link() { const L = globalThis.location; return L ? `${L.origin}${L.pathname}?room=${state().code}` : `?room=${state().code}`; }
  async function copyLink() {
    const url = link();
    try { await navigator.clipboard.writeText(url); say(`邀请链接已复制：${url}`); }
    catch { codeIn.value = ''; say(`复制不了，手动发这个链接：${url}`); }
  }
  const api = {
    open() { el.hidden = false; api.render(); if (globalThis.document?.pointerLockElement) globalThis.document.exitPointerLock?.(); },
    close() { el.hidden = true; },
    get isOpen() { return !el.hidden; },
    status(key) {
      lastStatus = key;
      if (key === 'taken' && retried++ < 3) { create(name()); return; } // 房间码撞了：换一个再建
      const [text, bad] = MSG[key] || ['', false]; say(text, bad); api.render();
    },
    render() {
      const s = state(), inRoom = !!s.code && (s.connected || lastStatus === 'in');
      $('[data-v="home"]').hidden = inRoom; $('[data-v="room"]').hidden = !inRoom; $('.sub').hidden = inRoom; // 进了房间：说明那段收起来，手机横屏放得下
      if (!inRoom) return;
      $('[data-v="code"]').textContent = s.code;
      const me = s.seat, host = s.host;
      $('[data-v="seats"]').innerHTML = s.roles.map((role, seat) => {
        const p = s.players.find((q) => q.seat === seat);
        const who = p ? escape(p.name) : '电脑队友', tags = [seat === host && p ? '房主' : '', seat === me ? '你' : ''].filter(Boolean).join(' · ');
        return `<div class="seat${p ? ' human' : ''}${seat === me ? ' me' : ''}"><b>${role}</b><span>${who}</span><i>${tags}</i></div>`;
      }).join('');
      const startBtn = $('[data-a="start"]');
      $('[data-v="startrow"]').hidden = me !== host; startBtn.textContent = s.started ? '重新开一局（大家一起）' : '开始这一局';
      if (me !== host) say(s.started ? '已经开打了——进入这一局，站到你扮演的那个人现在的位置。' : '等房主开始。');
      else if (!msgEl.textContent || msgEl.textContent.startsWith('等')) say(s.players.length > 1 ? '人齐了就开始；没来的座位由电脑队友顶上。' : '把房间码或邀请链接发给朋友。也可以直接开始，别人中途加入。');
    },
    /** 网址带 ?room=CODE：打开大厅，房间码填好、直接加入 */
    autoJoin(code) { const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!c) return; codeIn.value = c; api.open(); join(c, name()); },
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
