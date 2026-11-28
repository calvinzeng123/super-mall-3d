// 零点突围 / 丧尸围城：手机按键和 HUD 的统一排布（用户：手机按键要像 COD 手游那样排；地图、标记、步数这些看着很乱）。
// 各个模块（原游戏、actions、arsenal、supplies、siege-defense……）各自建自己的按键和 HUD 块；这里不改它们的逻辑，
// 只在样式表最后叠一层排布（HUD_LAYOUT_CSS），再给按键画上 SVG 图标（不用表情符号）、补一个左手开火键，每帧整理世界里的目标标记。
//
// 手机横屏（以 844 × 390 为准，四周让开安全区）：
//   左上：小地图（带方位）→ 下面一行「下一步怎么走」→ 任务栏（一行标题 + 进度）；左边中段：左手开火键；左下半边：浮动摇杆。
//   右下：大开火键；它右边一列：开镜、跳、蹲（从上到下）；开火键左上：换弹，正上方：手雷，左下：近战；交互键有东西可互动时出现在准星右下方；
//   围城的治疗 / 路障在换弹、近战再往左一列。底部正中：切枪（显示下一把的名字），右边是弹药数，左边是血量。右上：暂停。
// 竖屏不动按键位置（原来的排布），只换图标。电脑上没有按键，HUD 排布同样整理（小地图下面是任务栏，标记不叠在一起）。

/** 按键图标：24 × 24 的线稿，跟着按键的文字颜色 */
export const ICONS = Object.freeze({
  fire: '<path d="M9.5 20.5h5M9.5 17.5h5V9.2c0-2.6-1-4.6-2.5-6-1.5 1.4-2.5 3.4-2.5 6z"/><path d="M9.5 11h5" opacity=".55"/>',
  ads: '<circle cx="12" cy="12" r="7"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  reload: '<path d="M19.5 12.5a7.5 7.5 0 1 1-2.2-5.8"/><path d="M19.8 3.8v4.4h-4.4"/><rect x="10" y="9" width="4" height="7.5" rx="1"/>',
  jump: '<path d="M6 12.5l6-6 6 6M6 18.5l6-6 6 6"/>',
  crouch: '<path d="M6 5.5l6 6 6-6M6 11.5l6 6 6-6"/><path d="M4.5 21h15" opacity=".6"/>',
  melee: '<path d="M4 20l4.5-4.5M7 13l4 4"/><path d="M9.5 14.5l9-9c.9-.9 2.1-1.1 2.5-.7.4.4.2 1.6-.7 2.5l-9 9"/>',
  nade: '<circle cx="11" cy="14.5" r="6"/><path d="M8.5 8.8V6.5h5v2.3M13.5 6.5l4.5-2.5M16 10.5l3.5-.8"/>',
  swap: '<path d="M4 8.5h14l-3.5-3.5M20 15.5H6l3.5 3.5"/>',
  heal: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 7.5v9M7.5 12h9" stroke-width="2.6"/>',
  wall: '<path d="M5 5v15M19 5v15M3.5 9h17M3.5 15h17"/>',
  interact: '<path d="M8.5 13.5V6a1.5 1.5 0 0 1 3 0v5M11.5 10.5V4.5a1.5 1.5 0 0 1 3 0v6M14.5 10.5V6.5a1.5 1.5 0 0 1 3 0v7c0 4-2.4 7-6 7-2.4 0-4-1-5.4-3L3.7 14a1.5 1.5 0 0 1 2.4-1.8L8.5 15"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13" stroke-width="2.8"/>',
});
/** 哪个按键用哪个图标（选择器 → 图标名）；label：图标下面要不要留一行小字（切枪写下一把的名字、交互写「交互」） */
export const BUTTON_ICONS = Object.freeze([
  ['.t-fire', 'fire'], ['.t-fire2', 'fire'], ['.t-ads', 'ads'], ['.t-reload', 'reload'], ['.t-jump', 'jump'], ['.t-crouch', 'crouch'],
  ['.t-melee', 'melee'], ['.t-nade', 'nade'], ['.t-swap', 'swap', true], ['.t-heal', 'heal'], ['.t-wall', 'wall'], ['.t-interact', 'interact', true], ['.t-pause', 'pause'],
]);
export const svgIcon = (name) => `<svg class="t-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

/**
 * 手机横屏的按键位置（px）：r 离右边、b 离下边（都另加安全区）、s 直径。左手开火键 l 离左边。
 * 测试检查这些圆两两不重叠、都 ≥ 48 像素、都在 844 × 390 的屏幕里、都不压右上角暂停键和底部中间那一条。
 */
export const TOUCH_SLOTS = Object.freeze({
  fire: Object.freeze({ r: 100, b: 94, s: 86 }),
  ads: Object.freeze({ r: 18, b: 170, s: 60 }),
  jump: Object.freeze({ r: 18, b: 94, s: 60 }),
  crouch: Object.freeze({ r: 20, b: 20, s: 56 }),
  reload: Object.freeze({ r: 200, b: 168, s: 54 }),
  nade: Object.freeze({ r: 116, b: 194, s: 54 }),
  melee: Object.freeze({ r: 200, b: 92, s: 54 }),
  interact: Object.freeze({ r: 290, b: 230, s: 62 }),
  heal: Object.freeze({ r: 274, b: 168, s: 52 }),
  wall: Object.freeze({ r: 274, b: 92, s: 52 }),
  fire2: Object.freeze({ l: 20, b: 112, s: 58 }),
});
/** 底部正中的切枪键（宽 × 高） */
export const SWAP_SLOT = Object.freeze({ w: 116, h: 44, b: 10 });

const slotCss = (sel, q) => `${sel} { width: ${q.s}px; height: ${q.s}px; ${q.l != null ? `left: calc(${q.l}px + var(--sal)); right: auto;` : `right: calc(${q.r}px + var(--sar)); left: auto;`} bottom: calc(${q.b}px + var(--sab)); top: auto; }`;

export const HUD_LAYOUT_CSS = `
/* ===== 按键外观：半透明圆、线稿图标、按下变亮 ===== */
#ui .t-btn { display: grid; place-items: center; background: rgba(12, 15, 18, .34); border: 1.5px solid rgba(236, 232, 222, .5); color: rgba(244, 240, 232, .94);
  -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); box-shadow: 0 2px 10px rgba(0, 0, 0, .22); transition: background .08s, transform .08s; -webkit-tap-highlight-color: transparent; }
#ui .t-btn .t-ic { width: 46%; height: 46%; display: block; filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, .55)); }
#ui .t-btn.has-ic > span { display: none; }
#ui .t-btn.has-ic.lbl { grid-template-rows: 1fr auto; padding: 6px 0 5px; }
#ui .t-btn.has-ic.lbl .t-ic { width: 22px; height: 22px; align-self: end; }
#ui .t-btn.has-ic.lbl > span { display: block; font: 600 10px/1 var(--f-label); letter-spacing: .08em; margin: 3px 0 0; white-space: nowrap; }
#ui .t-btn.active { background: rgba(255, 179, 71, .34); border-color: #ffb347; color: #ffd08a; transform: scale(.94); }
#ui .t-fire, #ui .t-fire2 { border-width: 2px; border-color: rgba(255, 196, 120, .75); color: #ffd9a0; background: rgba(40, 22, 8, .32); }
#ui .t-fire .t-ic { width: 42%; height: 42%; }
#ui .t-crouch.latched { background: rgba(236, 232, 222, .82); color: #14181b; }
#ui .t-ads.active { background: rgba(255, 179, 71, .34); }
#ui .t-nade { border-color: rgba(185, 210, 122, .7); color: #d7ec9c; }
#ui .t-heal { border-color: rgba(255, 138, 122, .7); color: #ffc2b8; }
#ui .t-wall { border-color: rgba(216, 194, 122, .7); color: #f0e2b0; }
#ui .t-interact { border-color: #ffb347; color: #ffc977; background: rgba(40, 24, 6, .5); }
#ui .t-pause { border-radius: 50%; }
#ui .t-fire2 { display: none; }
/* 上面把按键改成了 grid 排图标：原来靠 display: none 藏起来的（交互键没东西可交互、围城的治疗 / 路障没货）照样藏 */
#ui .t-interact:not(.on), #ui .t-btn.off { display: none; }
#ui .t-nade.multi::after { bottom: -13px; }

@media (orientation: landscape) {
  #ui .touch.on .t-fire2 { display: grid; }
  ${Object.entries(TOUCH_SLOTS).map(([k, q]) => slotCss(`#ui .t-${k}`, q)).join('\n  ')}
  #ui .t-fire { font-size: 13px; }
  /* 围城里搬东西时的「放下」：原来在右边中段，正压着开镜键——挪到交互键左边那一格 */
  .is-touch .jm-drop { right: calc(366px + var(--sar)) !important; top: auto !important; bottom: calc(230px + var(--sab)) !important; width: 60px !important; height: 60px !important; }
  #ui .t-pause { width: 40px; height: 40px; right: calc(12px + var(--sar)); top: calc(10px + var(--sat)); }
  /* 切枪：底部正中的一条（图标 + 下一把的名字） */
  #ui .t-swap { width: ${SWAP_SLOT.w}px; height: ${SWAP_SLOT.h}px; left: calc(50% - ${SWAP_SLOT.w / 2}px); right: auto; bottom: calc(${SWAP_SLOT.b}px + var(--sab)); top: auto; border-radius: 22px;
    grid-template-columns: auto auto; grid-template-rows: none; gap: 6px; justify-content: center; padding: 0 12px; border-color: rgba(159, 196, 232, .65); color: #d8e9f8; }
  #ui .t-swap.has-ic.lbl .t-ic { width: 20px; height: 20px; align-self: center; }
  #ui .t-swap.has-ic.lbl > span { font-size: 13px; margin: 0; }
  /* 弹药：切枪键右边；血量：切枪键左边（受伤时才亮） */
  .is-touch #ui .h-ammo, #ui.is-touch .h-ammo, .is-touch .h-ammo { top: auto !important; right: auto !important; left: calc(50% + ${SWAP_SLOT.w / 2 + 12}px) !important; bottom: calc(6px + var(--sab)) !important; text-align: left; }
  .is-touch .h-ammo-row { justify-content: flex-start; }
  .is-touch .h-ammo-n { font-size: 34px !important; }
  .is-touch .h-pips { justify-content: flex-start; margin: 4px 0 3px !important; }
  .is-touch .h-cue { position: absolute; bottom: 100%; left: 0; white-space: nowrap; }
  .is-touch .h-wname { font-size: 10px; }
  .is-touch .h-health { top: auto !important; left: auto !important; right: calc(50% + ${SWAP_SLOT.w / 2 + 12}px) !important; bottom: calc(10px + var(--sab)) !important; text-align: right; }
  .is-touch .h-hp-row { justify-content: flex-end; }
  .is-touch .h-hp-n { font-size: 26px; }
  .is-touch .jm-stick-home { left: calc(170px + var(--sal)); bottom: calc(80px + var(--sab)); }
  .is-touch .jm-stick-home span { display: none; }
  /* 手雷数（电脑上是文字，手机上按键自己标数）；击杀提示挪到右上、暂停键下面 */
  .is-touch .h-feed { top: calc(58px + var(--sat)) !important; right: calc(14px + var(--sar)); }
  .is-touch .h-fl { font-size: 11px; }
  /* 队友血条：任务栏下面、左手开火键右边 */
  .is-touch .jm-squad { top: calc(10px + var(--jm-map, 104px) + 112px + var(--sat)) !important; bottom: auto !important; left: calc(96px + var(--sal)) !important; gap: 3px; }
  .is-touch .jm-squad .m { grid-template-columns: 44px 60px auto; }
  /* 无线电字幕、提示条：放在摇杆和右手按键中间那一条里，不压按键 */
  .is-touch .comms { width: min(320px, 40vw) !important; bottom: calc(66px + var(--sab)) !important; top: auto !important; }
  .is-touch .comms-t { font-size: 13px !important; }
  .is-touch .h-msg { bottom: auto !important; top: calc(98px + var(--sat)); max-width: min(360px, 44vw); font-size: 10px; }
}

/* ===== HUD 信息层级：左上角一列（小地图 → 下一步 → 任务栏），顶部正中指南针，标记不叠 ===== */
.h-obj { left: var(--gl) !important; top: calc(14px + var(--jm-map, 148px) + 44px + var(--sat)) !important; max-width: min(300px, 34vw) !important; padding: 6px 10px 7px 10px !important;
  background: linear-gradient(90deg, rgba(10, 13, 15, .62), rgba(10, 13, 15, .18)); border-left: 2px solid var(--signal); }
.h-obj .h-k { font-size: 10px; letter-spacing: .2em; }
.h-obj-t { font: 600 16px/1.2 var(--f-label) !important; margin: 4px 0 6px !important; min-height: 0 !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-relays.none { display: none !important; }
.h-relays { font-size: 10px; }
.jm-map-hint { margin-top: 14px !important; max-width: min(300px, 34vw) !important; overflow: hidden; text-overflow: ellipsis; }
.jm-map-floor { font-size: 10px !important; }
/* 世界里的目标标记：菱形 + 名字 + 距离排成一枚小牌；看不见（身后、屏幕外）时贴在屏幕边上、带一个指向它的箭头 */
.h-wm b { top: -26px !important; font-size: 11px !important; text-shadow: 0 1px 3px rgba(0, 0, 0, .85); }
.h-wm span { top: 10px !important; font: 600 10px/1 var(--f-mono) !important; padding: 2px 4px; background: rgba(10, 13, 15, .55); border-radius: 3px; left: -24px !important; width: 48px !important; }
.h-wm.jm-stack-1 b, .h-wm.jm-stack-1 span { translate: 0 var(--jm-dy, 0px); }
.h-wm.jm-quiet b { display: none; }
.h-wm.jm-quiet span { display: none; }
.h-wm.jm-far { opacity: .55; }
.h-wm .jm-arr { position: absolute; left: -7px; top: -7px; width: 14px; height: 14px; display: none; transform: rotate(var(--jm-a, 0deg)) translateY(-15px); }
.h-wm .jm-arr::before { content: ''; position: absolute; left: 3px; top: 0; border: 4px solid transparent; border-bottom: 7px solid currentColor; border-top: 0; }
.h-wm.offscreen .jm-arr { display: block; }
.is-touch .h-obj { top: calc(10px + var(--jm-map, 104px) + 40px + var(--sat)) !important; max-width: min(250px, 30vw) !important; }
.is-touch .h-obj-t { font-size: 14px !important; }
.is-touch .jm-map-hint { margin-top: 10px !important; font-size: 11px !important; }
.is-touch .h-compass { width: min(280px, 36vw) !important; }
@media (orientation: portrait) {
  .is-touch .h-obj { max-width: 52vw !important; }
}
`;

/** 两枚标记在屏幕上挨得太近（像素）：远的那枚只留菱形，近的照常 */
export const DECLUTTER = Object.freeze({ dx: 64, dy: 40, far: 90 });
/** 屏幕上的一组标记（{ x, y, d, off }，d 是米数）→ 每枚的处理：{ quiet, far }。近的优先显示文字，和已显示的挤在一起的只留菱形。纯函数 */
export function declutter(marks, D = DECLUTTER) {
  const order = marks.map((m, i) => i).sort((a, b) => (marks[a].d ?? 1e9) - (marks[b].d ?? 1e9)), shown = [], out = marks.map(() => ({ quiet: false, far: false }));
  for (const i of order) {
    const m = marks[i];
    out[i].far = (m.d ?? 0) > D.far;
    if (shown.some((s) => Math.abs(s.x - m.x) < D.dx && Math.abs(s.y - m.y) < D.dy)) out[i].quiet = true; else shown.push(m);
  }
  return out;
}

/**
 * G、ui（#ui）。返回 { update(), dispose() }：每帧调（HUD 更新之后）——给新出现的按键画图标、补左手开火键、整理目标标记、没有分步时藏掉「0/0」。
 */
export function createHudLayout(G, ui) {
  if (!ui || typeof document === 'undefined') return { update() {}, dispose() {} };
  let fire2 = null, frame = 0;
  const decorate = () => {
    for (const [sel, name, label] of BUTTON_ICONS) for (const b of ui.querySelectorAll(sel)) {
      if (b.classList.contains('has-ic')) continue;
      b.insertAdjacentHTML('afterbegin', svgIcon(name)); b.classList.add('has-ic'); if (label) b.classList.add('lbl');
    }
  };
  const buildFire2 = () => {
    const touch = ui.querySelector('.touch');
    if (!touch || fire2) return;
    fire2 = document.createElement('button'); fire2.className = 't-btn t-fire2'; fire2.setAttribute('aria-label', '开火（左手）'); fire2.innerHTML = '<span>开火</span>';
    let id = null;
    const down = (e) => { e.preventDefault(); e.stopPropagation(); if (id !== null) return; id = e.changedTouches?.[0]?.identifier ?? 0; fire2.classList.add('active'); G.input?.act?.('touch', 'fire', true); };
    const up = (e) => { e.preventDefault?.(); if (id === null) return; if (e.changedTouches && ![...e.changedTouches].some((t) => t.identifier === id)) return; id = null; fire2.classList.remove('active'); G.input?.act?.('touch', 'fire', false); };
    fire2.addEventListener('touchstart', down, { passive: false }); fire2.addEventListener('touchend', up, { passive: false }); fire2.addEventListener('touchcancel', up, { passive: false });
    fire2.addEventListener('contextmenu', (e) => e.preventDefault());
    touch.appendChild(fire2);
  };
  const watcher = new MutationObserver(() => decorate()); watcher.observe(ui, { childList: true, subtree: true });
  decorate();
  // 「目标 0/0」：这一局的任务没有分步（坚守、歼灭……）时整行藏掉
  const relays = () => { const r = ui.querySelector('.h-relays'), b = r?.querySelector('b'); if (r && b) r.classList.toggle('none', /^0\/0$/.test(b.textContent.trim())); };
  const pos = (el) => { const m = /translate3d\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px/.exec(el.style.transform || ''); return m ? [+m[1], +m[2]] : null; };
  function markers() {
    const els = [...ui.querySelectorAll('.h-wm')], marks = [], used = [];
    const W = innerWidth, H = innerHeight;
    for (const el of els) {
      const p = pos(el); if (!p || el.classList.contains('near') || getComputedStyle(el).display === 'none') continue;
      const d = parseFloat(el.querySelector('span')?.textContent) || 0, off = el.classList.contains('offscreen');
      marks.push({ x: p[0], y: p[1], d, off }); used.push(el);
      if (off) {
        if (!el.querySelector('.jm-arr')) el.insertAdjacentHTML('beforeend', '<u class="jm-arr"></u>');
        const a = Math.atan2(p[1] - H / 2, p[0] - W / 2) * 180 / Math.PI + 90;
        el.style.setProperty('--jm-a', `${a.toFixed(0)}deg`);
      }
    }
    const res = declutter(marks);
    // 贴在屏幕边上的标记别压在左上角那一列（小地图、任务栏）和左手开火键上：压着就往下挪到它们下面
    const keep = [...ui.querySelectorAll('.jm-map:not(.off), .h-obj.has, .touch.on .t-fire2')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    used.forEach((el, i) => {
      el.classList.toggle('jm-quiet', res[i].quiet); el.classList.toggle('jm-far', res[i].far);
      let dy = 0; const m = marks[i];
      if (m.off) for (const r of keep) if (m.x > r.left - 34 && m.x < r.right + 34 && m.y + dy > r.top - 30 && m.y + dy < r.bottom + 30) dy = r.bottom + 34 - m.y;
      const t = dy ? `0 ${Math.round(dy)}px` : ''; if (el.style.translate !== t) el.style.translate = t;
    });
  }
  return {
    update() {
      if (G.input?.touch && !fire2) buildFire2();
      frame++;
      if (frame % 6 === 0) relays();
      if (frame % 3 === 0) markers();
    },
    get fire2() { return fire2; },
    dispose() { watcher.disconnect(); fire2?.remove(); },
  };
}
