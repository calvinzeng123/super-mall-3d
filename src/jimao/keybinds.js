// 零点突围：键盘按键可改（设置 → 键盘按键 · 修改）。原游戏的按键表（KeyW → forward …）通过补丁交出来（G.input.keyMap），
// 这里改的就是那张表本身，按下、松开都按新表走。改过的存在这台设备上（KEYS_KEY），只存「动作 → 键」，其余照原表。
// 暂停（Esc）不让改，免得改坏了出不去；方向键 / IJKL 转视角也不动。
export const KEYS_KEY = 'yunlan.jimao.keys.v1';

export const KEY_ACTIONS = Object.freeze([
  ['forward', '前进'], ['back', '后退'], ['left', '左移'], ['right', '右移'],
  ['jump', '跳跃'], ['sprint', '冲刺'], ['crouch', '蹲下'], ['reload', '换弹'],
  ['interact', '交互'], ['melee', '近战'], ['fire', '开火（键盘）'],
]);
const ACTIONS = new Set(KEY_ACTIONS.map(([a]) => a));
const LOCKED = new Set(['Escape']);

/** 按键码 → 给人看的名字 */
export function keyLabel(code) {
  if (!code) return '—';
  const m = /^(Key|Digit|Numpad)(.+)$/.exec(code);
  if (m) return m[1] === 'Numpad' ? `小键盘 ${m[2]}` : m[2];
  const names = { Space: '空格', ShiftLeft: '左 Shift', ShiftRight: '右 Shift', ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl', AltLeft: '左 Alt', AltRight: '右 Alt',
    Enter: '回车', Tab: 'Tab', CapsLock: '大写锁定', Backspace: '退格', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
  return names[code] || code;
}

/** 读出来的设置检查一遍：只留认识的动作、像样的键码，Esc 不行；同一个键只给最后一个动作 */
export function normalizeKeys(value) {
  const out = {}, used = new Map();
  if (value && typeof value === 'object') {
    for (const [a, code] of Object.entries(value)) {
      if (!ACTIONS.has(a) || typeof code !== 'string' || !/^[A-Za-z0-9]{2,24}$/.test(code) || LOCKED.has(code)) continue;
      if (used.has(code)) delete out[used.get(code)];
      out[a] = code; used.set(code, a);
    }
  }
  return out;
}

/**
 * 把改过的键套到按键表上。base 是原表的副本（不改它）。改过的动作：原来给它的键全部去掉，换成新键；
 * 新键原来属于别的动作的，那个动作就少了这个键。返回新表（纯函数，测试直接用）。
 */
export function applyKeys(base, keys) {
  const map = { ...base };
  for (const [a, code] of Object.entries(keys)) {
    for (const c of Object.keys(map)) if (map[c] === a && !LOCKED.has(c)) delete map[c];
    map[code] = a;
  }
  return map;
}

/** 某个动作现在用的键（列表） */
export const keysFor = (map, action) => Object.keys(map).filter((c) => map[c] === action);

export function createKeybinds(G, { storage = globalThis.localStorage } = {}) {
  const live = G.input?.keyMap;
  if (!live) return { open() {}, dispose() {}, available: false };
  const base = { ...live };
  let keys;
  try { keys = normalizeKeys(JSON.parse(storage?.getItem(KEYS_KEY) || 'null')); } catch { keys = {}; }
  const commit = () => {
    const next = applyKeys(base, keys);
    for (const c of Object.keys(live)) delete live[c];
    Object.assign(live, next);
    try { storage?.setItem(KEYS_KEY, JSON.stringify(keys)); } catch { /* 隐私模式 */ }
  };
  commit();

  let root = null, waiting = null, onKey = null;
  function render() {
    if (!root) return;
    root.querySelector('.jm-keys-list').innerHTML = KEY_ACTIONS.map(([a, label]) => {
      const now = keysFor(live, a).map(keyLabel).join(' / ') || '未设置';
      return `<div class="jm-key-row"><span>${label}</span><button data-a="${a}" class="${waiting === a ? 'wait' : ''}">${waiting === a ? '请按一个键…' : now}</button></div>`;
    }).join('');
  }
  function open() {
    if (root) return;
    root = document.createElement('div'); root.className = 'jm-keys';
    root.innerHTML = `<div class="jm-keys-card"><b>键盘按键</b><p>点一个动作，再按想用的键（Esc 取消）。键被别的动作占着时，会从那个动作上拿过来。</p>
      <div class="jm-keys-list"></div><div class="jm-acts"><button data-act="reset">全部恢复默认</button><button data-act="done" class="primary">完成</button></div></div>`;
    document.body.append(root);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a) { waiting = waiting === b.dataset.a ? null : b.dataset.a; render(); }
      else if (b.dataset.act === 'reset') { keys = {}; waiting = null; commit(); render(); }
      else if (b.dataset.act === 'done') close();
    });
    // 等按键时抢在原游戏前面接住这一下（捕获阶段），不让它触发动作
    onKey = (e) => {
      if (!root) return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (!waiting) { if (e.code === 'Escape') close(); return; }
      if (e.code !== 'Escape' && !LOCKED.has(e.code)) { keys = normalizeKeys({ ...Object.fromEntries(Object.entries(keys).filter(([, c]) => c !== e.code)), [waiting]: e.code }); commit(); }
      waiting = null; render();
    };
    addEventListener('keydown', onKey, true);
    render();
  }
  function close() {
    if (!root) return;
    removeEventListener('keydown', onKey, true); root.remove(); root = null; waiting = null;
  }
  return { open, close, available: true, get keys() { return keys; }, dispose() { close(); } };
}

export const KEYS_CSS = `
.jm-keys { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(6, 8, 10, .55); font: 13px/1.4 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #e8e4da; }
.jm-keys-card { width: min(440px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 14px 16px; border-radius: 10px; background: rgba(11, 13, 15, .94); border: 1px solid rgba(232, 228, 218, .2); display: grid; gap: 10px; }
.jm-keys-card p { margin: 0; color: rgba(232, 228, 218, .64); font-size: 12px; }
.jm-keys-list { display: grid; gap: 6px; }
.jm-key-row { display: grid; grid-template-columns: 7em 1fr; align-items: center; gap: 8px; }
.jm-key-row button { min-height: 34px; border-radius: 6px; border: 1px solid rgba(232, 228, 218, .3); background: rgba(232, 228, 218, .06); color: inherit; font: inherit; cursor: pointer; }
.jm-key-row button.wait { border-color: #ffb347; color: #ffb347; }
.jm-keys .jm-acts { display: flex; gap: 8px; justify-content: flex-end; }
.jm-keys .jm-acts button { min-height: 40px; padding: 0 14px; border-radius: 6px; border: 1px solid rgba(232, 228, 218, .3); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.jm-keys .jm-acts .primary { background: #ffb347; color: #0b0d0f; border-color: #ffb347; font-weight: 700; }
`;
