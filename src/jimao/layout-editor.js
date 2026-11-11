// 几猫模式的界面布局：触屏按键和几块 HUD 都可以自己拖动位置、调大小，按横屏 / 竖屏分别保存在这台设备上。
// 原游戏的按键和 HUD 位置写在它的样式里；这里只在那个位置上叠加偏移（CSS 的 translate）和缩放（scale），
// 不改它的样式和事件，所以「恢复默认」就是把偏移清零。
export const LAYOUT_KEY = 'yunlan.jimao.layout.v1';

/** 能调的东西：选择器、名字、是不是触屏按键（触屏按键只在手机上出现）。 */
export const LAYOUT_ITEMS = Object.freeze([
  { key: 'fire', sel: '.t-fire', label: '开火', touch: true },
  { key: 'ads', sel: '.t-ads', label: '瞄准', touch: true },
  { key: 'reload', sel: '.t-reload', label: '换弹', touch: true },
  { key: 'jump', sel: '.t-jump', label: '跳跃', touch: true },
  { key: 'interact', sel: '.t-interact', label: '交互', touch: true },
  { key: 'pause', sel: '.t-pause', label: '暂停', touch: true },
  { key: 'ammo', sel: '.h-ammo', label: '弹药' },
  { key: 'health', sel: '.h-health', label: '生命' },
  { key: 'objective', sel: '.h-obj', label: '任务目标' },
  { key: 'compass', sel: '.h-compass', label: '指南针' },
  { key: 'feed', sel: '.h-feed', label: '击杀提示' },
]);
const SCALE = [0.5, 1.8];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 读出来的设置一律检查一遍：坏数据、旧格式都退回默认。纯函数，测试里直接用。 */
export function normalizeLayout(value) {
  const out = { landscape: {}, portrait: {}, opacity: 1 };
  if (value && typeof value === 'object') {
    if (Number.isFinite(value.opacity)) out.opacity = clamp(value.opacity, 0.25, 1);
    for (const o of ['landscape', 'portrait']) for (const it of LAYOUT_ITEMS) {
      const v = value[o]?.[it.key];
      if (!v || ![v.dx, v.dy, v.s].every(Number.isFinite)) continue;
      out[o][it.key] = { dx: clamp(v.dx, -1, 1), dy: clamp(v.dy, -1, 1), s: clamp(v.s, ...SCALE) };
    }
  }
  return out;
}

export function createLayoutEditor(ui, { storage = globalThis.localStorage } = {}) {
  let layout;
  try { layout = normalizeLayout(JSON.parse(storage?.getItem(LAYOUT_KEY) || 'null')); } catch { layout = normalizeLayout(null); }
  const save = () => { try { storage?.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* 隐私模式可能禁止存储 */ } };
  const orientation = () => (innerWidth >= innerHeight ? 'landscape' : 'portrait');
  const entry = (key) => layout[orientation()][key] || { dx: 0, dy: 0, s: 1 };

  function apply() {
    for (const it of LAYOUT_ITEMS) {
      const el = ui.querySelector(it.sel);
      if (!el) continue;
      const e = entry(it.key);
      el.style.translate = e.dx || e.dy ? `${(e.dx * innerWidth).toFixed(1)}px ${(e.dy * innerHeight).toFixed(1)}px` : '';
      el.style.scale = e.s !== 1 ? String(e.s) : '';
      // 缩放以元素中心为准（原样式里靠右、靠下摆的按钮放大时不会往屏幕外长）
      el.style.transformOrigin = 'center';
    }
    const touch = ui.querySelector('.touch');
    if (touch) touch.style.opacity = layout.opacity < 1 ? String(layout.opacity) : '';
  }
  // 原游戏的触屏按键是第一次摸屏幕时才建的，HUD 在开局时建：有新东西加进来就再套一遍
  const watcher = new MutationObserver(apply); watcher.observe(ui, { childList: true, subtree: true });
  addEventListener('resize', apply);
  apply();

  // ---------------- 编辑界面 ----------------
  let root = null;
  function open() {
    if (root) return;
    ui.classList.add('jm-editing');
    root = document.createElement('div'); root.className = 'jm-edit';
    root.innerHTML = `<div class="jm-boxes"></div>
      <div class="jm-bar">
        <div class="jm-title" title="按住这里可以把面板拖开"><b>调整界面布局 <i>⠿ 按住标题拖开面板</i></b><span data-f="sel">拖动方框移动位置；选中后用下面的滑杆调大小</span></div>
        <label>大小 <input type="range" data-f="scale" min="${SCALE[0]}" max="${SCALE[1]}" step="0.05"><output data-f="scaleOut"></output></label>
        <label>按键透明度 <input type="range" data-f="opacity" min="0.25" max="1" step="0.05"><output data-f="opOut"></output></label>
        <div class="jm-acts"><button data-act="reset-one">恢复所选</button><button data-act="reset-all">全部恢复</button><button data-act="done" class="primary">完成</button></div>
        <p class="jm-note" data-f="note"></p>
      </div>`;
    document.body.append(root);
    const q = (s) => root.querySelector(s), boxes = q('.jm-boxes'), scale = q('[data-f="scale"]'), opacity = q('[data-f="opacity"]');
    let selected = null;
    const items = LAYOUT_ITEMS.map((it) => ({ ...it, el: ui.querySelector(it.sel) })).filter((it) => it.el);
    q('[data-f="note"]').textContent = items.some((it) => it.touch) ? `正在调整${orientation() === 'landscape' ? '横屏' : '竖屏'}布局；横竖屏分别保存。`
      : '触屏按键只在手机上出现，在手机上打开这里就能调整按键。';
    const boxFor = new Map();
    for (const it of items) {
      const b = document.createElement('div'); b.className = 'jm-box'; b.innerHTML = `<span>${it.label}</span>`; boxes.append(b); boxFor.set(it.key, b);
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); ev.stopPropagation(); select(it); b.setPointerCapture(ev.pointerId);
        const start = { x: ev.clientX, y: ev.clientY, ...entry(it.key) };
        const move = (e) => { set(it.key, { ...entry(it.key), dx: start.dx + (e.clientX - start.x) / innerWidth, dy: start.dy + (e.clientY - start.y) / innerHeight }); };
        const up = () => { b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up); keepOnScreen(it); };
        b.addEventListener('pointermove', move); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      });
    }
    function set(key, e) { layout[orientation()][key] = normalizeLayout({ landscape: { [key]: e } }).landscape[key]; apply(); save(); place(); }
    /** 拖出屏幕外的拉回来（留至少 24 px 在屏幕里） */
    function keepOnScreen(it) {
      const r = it.el.getBoundingClientRect(), e = entry(it.key);
      const fx = r.right < 24 ? 24 - r.right : r.left > innerWidth - 24 ? innerWidth - 24 - r.left : 0;
      const fy = r.bottom < 24 ? 24 - r.bottom : r.top > innerHeight - 24 ? innerHeight - 24 - r.top : 0;
      if (fx || fy) set(it.key, { ...e, dx: e.dx + fx / innerWidth, dy: e.dy + fy / innerHeight });
    }
    function place() {
      for (const it of items) {
        const r = it.el.getBoundingClientRect(), b = boxFor.get(it.key), w = Math.max(44, r.width), h = Math.max(30, r.height);
        Object.assign(b.style, { left: `${r.left + r.width / 2 - w / 2}px`, top: `${r.top + r.height / 2 - h / 2}px`, width: `${w}px`, height: `${h}px` });
        b.classList.toggle('on', selected === it);
      }
      const e = selected ? entry(selected.key) : null;
      scale.disabled = !selected; scale.value = e ? e.s : 1; q('[data-f="scaleOut"]').value = e ? `${Math.round(e.s * 100)}%` : '—';
      opacity.value = layout.opacity; q('[data-f="opOut"]').value = `${Math.round(layout.opacity * 100)}%`;
      q('[data-f="sel"]').textContent = selected ? `已选中：${selected.label}` : '拖动方框移动位置；选中后用下面的滑杆调大小';
    }
    function select(it) { selected = it; place(); }
    // 面板本身也能拖开，免得挡住要调的按键
    const bar = q('.jm-bar'), title = q('.jm-title');
    title.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); title.setPointerCapture(ev.pointerId);
      const r = bar.getBoundingClientRect(), ox = ev.clientX - r.left, oy = ev.clientY - r.top;
      const move = (e) => Object.assign(bar.style, { left: `${clamp(e.clientX - ox, 0, innerWidth - r.width)}px`, top: `${clamp(e.clientY - oy, 0, innerHeight - 60)}px`, transform: 'none' });
      const up = () => { title.removeEventListener('pointermove', move); title.removeEventListener('pointerup', up); };
      title.addEventListener('pointermove', move); title.addEventListener('pointerup', up);
    });
    scale.addEventListener('input', () => { if (selected) { set(selected.key, { ...entry(selected.key), s: +scale.value }); keepOnScreen(selected); } });
    opacity.addEventListener('input', () => { layout.opacity = +opacity.value; apply(); save(); place(); });
    root.addEventListener('click', (ev) => {
      const act = ev.target.closest('[data-act]')?.dataset.act;
      if (act === 'reset-one' && selected) { delete layout[orientation()][selected.key]; apply(); save(); place(); }
      else if (act === 'reset-all') { layout[orientation()] = {}; layout.opacity = 1; apply(); save(); place(); }
      else if (act === 'done') close();
    });
    // 编辑时屏幕上的东西不响应游戏操作
    for (const type of ['touchstart', 'mousedown', 'keydown']) root.addEventListener(type, (e) => e.stopPropagation());
    root._resize = () => place(); addEventListener('resize', root._resize);
    place();
  }
  function close() {
    if (!root) return;
    removeEventListener('resize', root._resize); root.remove(); root = null; ui.classList.remove('jm-editing');
  }
  return { open, close, apply, get layout() { return layout; }, dispose() { close(); watcher.disconnect(); removeEventListener('resize', apply); } };
}

/** 编辑界面的样式（跟原游戏的暗色界面一致）。 */
export const LAYOUT_CSS = `
#ui.jm-editing > :not(.hud):not(.touch) { visibility: hidden !important; }
#ui.jm-editing .touch { display: block !important; }
#ui.jm-editing .h-obj, #ui.jm-editing .h-health { opacity: 1 !important; }
#ui.jm-editing .t-interact { display: block !important; }
.jm-edit { position: fixed; inset: 0; z-index: 60; background: rgba(6, 8, 10, .35); touch-action: none; font: 13px/1.4 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #e8e4da; }
.jm-box { position: fixed; border: 1.5px dashed rgba(255, 179, 71, .8); border-radius: 8px; background: rgba(255, 179, 71, .08); cursor: grab; touch-action: none; display: flex; align-items: flex-start; justify-content: center; }
.jm-box span { margin-top: -18px; padding: 1px 6px; border-radius: 4px; background: rgba(11, 13, 15, .85); font-size: 11px; white-space: nowrap; pointer-events: none; }
.jm-box.on { border-style: solid; border-color: #ffb347; background: rgba(255, 179, 71, .2); }
.jm-bar { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); padding: 14px 16px; border-radius: 10px; background: rgba(11, 13, 15, .92); border: 1px solid rgba(232, 228, 218, .2); display: grid; gap: 10px; }
.jm-title { display: grid; gap: 2px; cursor: move; touch-action: none; } .jm-title i { font-style: normal; font-weight: 400; font-size: 11px; color: rgba(232, 228, 218, .5); margin-left: 6px; } .jm-title span { color: rgba(232, 228, 218, .64); font-size: 12px; }
.jm-bar label { display: grid; grid-template-columns: 6em 1fr 3.2em; align-items: center; gap: 8px; }
.jm-bar input[type=range] { width: 100%; accent-color: #ffb347; }
.jm-acts { display: flex; gap: 8px; justify-content: flex-end; }
.jm-acts button { min-height: 40px; padding: 0 14px; border-radius: 6px; border: 1px solid rgba(232, 228, 218, .3); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.jm-acts .primary { background: #ffb347; color: #0b0d0f; border-color: #ffb347; font-weight: 700; }
.jm-note { margin: 0; color: rgba(232, 228, 218, .64); font-size: 12px; }
`;
