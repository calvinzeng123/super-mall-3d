// 零点突围：触屏移动的两道保险。
// 1) 备用摇杆：用 Pointer Events 再跟一遍左半边那根拇指（pointerId 只拿 === 比较，不看正负）。
//    原游戏的摇杆读 Touch.identifier，iOS 上这个 id 可能是负数，以前被当成「没有手指」，摇杆圈出来了人却不动
//    （这一处已经在 scripts/jimao/patches.mjs 里修掉）。万一 iOS 的触摸还有别的怪脾气，这里接着顶上：
//    原游戏这一帧算出来的移动是 0、左边却确实按着一根手指并且推开了，就用这里算的移动。
// 2) 摇杆的「家」：没按的时候左下角显示一个淡淡的圈和「移动」，告诉玩家左半边按住拖动就是走。
export const STICK = Object.freeze({ radius: 58, zone: 0.45, dead: 0.08, sprint: 0.93, sprintY: 0.8 });

/** 拇指从按下点拖开 (dx, dy) 像素 → 移动量：超过半径按半径算；x 向右为正，y 向上（往前）为正 */
export function stickVector(dx, dy, radius = STICK.radius) {
  const d = Math.hypot(dx, dy), k = d > radius ? radius / d : 1;
  return { x: (dx * k) / radius, y: (-dy * k) / radius };
}

/**
 * canvas：画布（原游戏的触摸也挂在它上面）；input：G.input；active()：现在能不能走（开局中、没暂停）。
 * 每帧在 input.update 之后调 apply()：原游戏的移动是 0 而这里有推开的拇指，就把移动写进 input。
 */
export function createTouchStick({ canvas, input, active = () => true, root = null }) {
  let id = null, sx = 0, sy = 0, v = { x: 0, y: 0 }, used = 0, last = '';
  const zone = () => (typeof innerWidth === 'number' ? innerWidth : 1e9) * STICK.zone;
  const down = (e) => {
    if (e.pointerType === 'mouse' || id !== null || e.clientX >= zone() || !active()) return;
    id = e.pointerId; sx = e.clientX; sy = e.clientY; v = { x: 0, y: 0 };
  };
  const move = (e) => { if (e.pointerId === id) v = stickVector(e.clientX - sx, e.clientY - sy); };
  const up = (e) => { if (e.pointerId === id) { id = null; v = { x: 0, y: 0 }; } };
  const opts = { passive: true };
  canvas.addEventListener('pointerdown', down, opts);
  canvas.addEventListener('pointermove', move, opts);
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(t, up, opts);

  // 摇杆的家：只在触屏、开局中、拇指没按着的时候显示
  let home = null;
  if (root && typeof document !== 'undefined') {
    home = document.createElement('div');
    home.className = 'jm-stick-home'; home.hidden = true;
    home.innerHTML = '<i></i><span>移动</span>';
    root.appendChild(home);
  }

  return {
    get held() { return id !== null; },
    get vector() { return v; },
    /** 用了几帧备用摇杆（诊断用） */
    get used() { return used; },
    apply() {
      const on = id !== null && active();
      if (home) { const show = !!input.touch && active() && id === null; if (home.hidden === show) home.hidden = !show; }
      if (!on) { last = ''; return false; }
      const m = input.move;
      if (Math.hypot(m.x, m.y) > 0.05 || Math.hypot(v.x, v.y) < STICK.dead) { last = ''; return false; }
      m.x = v.x; m.y = v.y;
      if (Math.hypot(v.x, v.y) > STICK.sprint && v.y > STICK.sprintY) input.sprint = true;
      used++; last = 'fallback';
      return true;
    },
    get mode() { return last; },
    release() { id = null; v = { x: 0, y: 0 }; },
    dispose() {
      canvas.removeEventListener('pointerdown', down, opts);
      canvas.removeEventListener('pointermove', move, opts);
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(t, up, opts);
      home?.remove();
    },
  };
}

export const TOUCH_STICK_CSS = `
.jm-stick-home { position: absolute; left: max(96px, 22vw); bottom: calc(150px + env(safe-area-inset-bottom)); width: 0; height: 0; z-index: 2; pointer-events: none; }
.jm-stick-home i { position: absolute; left: -58px; top: -58px; width: 116px; height: 116px; border-radius: 50%; border: 1.5px dashed rgba(232, 228, 218, .32); background: rgba(11, 13, 15, .1); }
.jm-stick-home span { position: absolute; left: -40px; width: 80px; top: -8px; text-align: center; font: 600 13px/16px system-ui, sans-serif; letter-spacing: .2em; color: rgba(232, 228, 218, .55); }
@media (max-height: 460px) { .jm-stick-home { bottom: calc(110px + env(safe-area-inset-bottom)); } }
`;
