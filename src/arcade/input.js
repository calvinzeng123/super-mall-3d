// 小游戏共用输入：键盘和触屏双摇杆统一成四个轴，取值 [-1, 1]。
//   lx / ly  左手：平移（右为正）/ 前进（前为正）
//   rx / ry  右手：转向（右为正）/ 升降（上为正）
// 走路类游戏用漫游模式自带的操作，不启用这里的摇杆。

const KEY_AXES = {
  lx: [['KeyD'], ['KeyA']],
  ly: [['KeyW'], ['KeyS']],
  rx: [['ArrowRight', 'KeyE'], ['ArrowLeft', 'KeyQ']],
  ry: [['ArrowUp', 'Space', 'KeyR'], ['ArrowDown', 'ShiftLeft', 'ShiftRight', 'KeyF']],
};
const GAME_KEYS = new Set(Object.values(KEY_AXES).flat(2));

/** 按下的键 → 四个轴。纯函数，便于测试。 */
export function axesFromKeys(keys) {
  const out = {};
  for (const [axis, [plus, minus]] of Object.entries(KEY_AXES)) {
    out[axis] = (plus.some((k) => keys.has(k)) ? 1 : 0) - (minus.some((k) => keys.has(k)) ? 1 : 0);
  }
  return out;
}

const clamp1 = (n) => Math.max(-1, Math.min(1, n));

/** 摇杆位移（像素，屏幕坐标向下为正）→ 轴值；中心 12% 是死区，推到半径即满。 */
export function stickAxes(dx, dy, radius) {
  const len = Math.hypot(dx, dy) / radius;
  if (len < 0.12) return { x: 0, y: 0 };
  const k = Math.min(1, len) / len / radius;
  return { x: clamp1(dx * k), y: clamp1(-dy * k) };
}

export function createInput(host, { win = globalThis.window } = {}) {
  const keys = new Set();
  const sticks = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  const abort = new AbortController();
  const opts = { signal: abort.signal };
  let enabled = false, pad = null;

  const onKey = (e) => {
    if (!enabled || !GAME_KEYS.has(e.code)) return;
    if (e.target?.closest?.('input, textarea, select')) return;
    if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code);
    e.preventDefault(); // 方向键、空格不滚动页面
  };
  win.addEventListener('keydown', onKey, opts);
  win.addEventListener('keyup', onKey, opts);
  win.addEventListener('blur', () => keys.clear(), opts);

  function buildSticks() {
    pad = win.document.createElement('div');
    pad.className = 'ac-sticks';
    for (const side of ['left', 'right']) {
      const base = win.document.createElement('div');
      base.className = `ac-stick ac-stick-${side}`;
      base.innerHTML = '<i></i>';
      const knob = base.firstChild;
      let id = null;
      const move = (e) => {
        const r = base.getBoundingClientRect(), radius = r.width / 2;
        const a = stickAxes(e.clientX - (r.left + radius), e.clientY - (r.top + radius), radius);
        sticks[side] = a;
        knob.style.transform = `translate(${a.x * radius * 0.6}px, ${-a.y * radius * 0.6}px)`;
      };
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null; sticks[side] = { x: 0, y: 0 }; knob.style.transform = '';
      };
      base.addEventListener('pointerdown', (e) => { id = e.pointerId; base.setPointerCapture?.(id); move(e); e.preventDefault(); }, opts);
      base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); }, opts);
      base.addEventListener('pointerup', end, opts);
      base.addEventListener('pointercancel', end, opts);
      pad.append(base);
    }
    host.append(pad);
  }

  const touchDevice = () => !!(win.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in win);

  return {
    /** sticks: true 时在触屏设备上显示双摇杆（force 用于测试）。 */
    enable({ sticks: wantSticks = false, force = false } = {}) {
      enabled = true;
      if (wantSticks && (force || touchDevice())) { if (!pad) buildSticks(); pad.hidden = false; } else if (pad) pad.hidden = true;
    },
    disable() {
      enabled = false; keys.clear();
      sticks.left = { x: 0, y: 0 }; sticks.right = { x: 0, y: 0 };
      if (pad) pad.hidden = true;
    },
    axes() {
      const k = axesFromKeys(keys);
      return { lx: clamp1(k.lx + sticks.left.x), ly: clamp1(k.ly + sticks.left.y),
        rx: clamp1(k.rx + sticks.right.x), ry: clamp1(k.ry + sticks.right.y) };
    },
    get sticksVisible() { return !!pad && !pad.hidden; },
    /** 测试 / 自动化：直接按下或放开一个键。 */
    press(code, down = true) { if (down) keys.add(code); else keys.delete(code); },
    dispose() { abort.abort(); pad?.remove(); },
  };
}
