// 零点突围 / 丧尸围城：手机按键和 HUD 的统一排布（用户：手机按键要像 COD 手游那样排；地图、标记、步数这些看着很乱）。
// 各个模块（原游戏、actions、arsenal、supplies、siege-defense……）各自建自己的按键和 HUD 块；这里不改它们的逻辑，
// 只在样式表最后叠一层排布（HUD_LAYOUT_CSS），再给按键画上 SVG 图标（不用表情符号）、补一个左手开火键，每帧整理世界里的目标标记。
//
// 手机横屏（以 844 × 390 为准，四周让开安全区）：
//   左上：小地图（带方位）→ 下面一行「下一步怎么走」→ 任务栏（一行标题 + 进度）；左边中段：左手开火键；左下半边：浮动摇杆。
//   右下：大开火键；它右边一列：开镜、跳、蹲（从上到下）；开火键左上：换弹，正上方：手雷，左下：近战；交互键有东西可互动时出现在准星右下方；
//   围城的治疗 / 路障在换弹、近战再往左一列。底部正中：切枪（显示下一把的名字），右边是弹药数，左边是血量。右上：暂停。
// 竖屏不动按键位置（原来的排布），只换图标。电脑上没有按键，HUD 排布同样整理（小地图下面是任务栏，标记不叠在一起）。
//
// 信息要安静（用户：地图、标记看着还是乱）：
//   顶部指南针只有刻度、当前目标那一枚（一行，不折行）和队友小圆点；弹药箱这类东西不上指南针。
//   世界里的标记：只有当前目标写名字和距离；弹药箱 15 米以内才露一个小图标、不写字；准星附近的标记淡掉；同时最多 3 枚。
//   无线电字幕：一行、过长截断，在切枪条上面，几秒后淡掉；提示条不和它叠。弹药块收紧，「弹药不足」是一枚小签。
//   摇杆圈只在按着的时候出现（跟随拇指；固定摇杆才常显）。队友血条收在小地图右边（手机）/ 任务栏下面（电脑）。
//   字号只用 TYPE 里那几档，颜色只用 HUD_COLORS 里那几种。

/** HUD 的字号档（px）：这个文件里的字号都从这里取（CSS 里写 var(--jm-t-*)） */
export const TYPE = Object.freeze({ xs: 10, s: 11, m: 13, l: 15, xl: 26, xxl: 44 });
/** HUD 的颜色：目标（琥珀）、补给（绿）、敌人（红）、队友（浅绿）、正文、次要文字、底板 */
export const HUD_COLORS = Object.freeze({ obj: '#ffb347', pick: '#7dffb0', enemy: '#ff5a4a', mate: '#9fe0a8', text: '#ece8de', dim: 'rgba(236, 232, 222, .62)', plate: 'rgba(10, 13, 15, .58)' });
const tokens = () => `#ui { ${Object.entries(TYPE).map(([k, v]) => `--jm-t-${k}: ${v}px;`).join(' ')} ${Object.entries(HUD_COLORS).map(([k, v]) => `--jm-c-${k}: ${v};`).join(' ')} }`;

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
#ui .t-btn.has-ic.lbl > span { display: block; font: 600 var(--jm-t-xs)/1 var(--f-label); letter-spacing: .08em; margin: 3px 0 0; white-space: nowrap; }
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
  #ui .t-fire { font-size: var(--jm-t-m); }
  /* 围城里搬东西时的「放下」：原来在右边中段，正压着开镜键——挪到交互键左边那一格 */
  .is-touch .jm-drop { right: calc(366px + var(--sar)) !important; top: auto !important; bottom: calc(230px + var(--sab)) !important; width: 60px !important; height: 60px !important; }
  #ui .t-pause { width: 40px; height: 40px; right: calc(12px + var(--sar)); top: calc(10px + var(--sat)); }
  /* 切枪：底部正中的一条（图标 + 下一把的名字） */
  #ui .t-swap { width: ${SWAP_SLOT.w}px; height: ${SWAP_SLOT.h}px; left: calc(50% - ${SWAP_SLOT.w / 2}px); right: auto; bottom: calc(${SWAP_SLOT.b}px + var(--sab)); top: auto; border-radius: 22px;
    grid-template-columns: auto auto; grid-template-rows: none; gap: 6px; justify-content: center; padding: 0 12px; border-color: rgba(159, 196, 232, .65); color: #d8e9f8; }
  #ui .t-swap.has-ic.lbl .t-ic { width: 20px; height: 20px; align-self: center; }
  #ui .t-swap.has-ic.lbl > span { font-size: var(--jm-t-m); margin: 0; }
  /* 弹药：切枪键右边，一行「弹匣 / 备弹」+ 枪名，不画子弹格；「弹药不足 / 耗尽」是数字右边的一枚小签。血量：切枪键左边（受伤时才亮） */
  .is-touch #ui .h-ammo, #ui.is-touch .h-ammo, .is-touch .h-ammo { top: auto !important; right: auto !important; left: calc(50% + ${SWAP_SLOT.w / 2 + 12}px) !important; bottom: calc(8px + var(--sab)) !important; text-align: left; }
  .is-touch .h-ammo-row { justify-content: flex-start; gap: 5px; }
  .is-touch .h-ammo-n { font-size: var(--jm-t-xl) !important; }
  .is-touch .h-ammo-r { font-size: var(--jm-t-s); padding-bottom: 2px; }
  .is-touch .h-pips { display: none !important; }
  .is-touch .h-cue { left: calc(100% + 8px); right: auto; bottom: auto; top: 2px; }
  .is-touch .h-wname { font-size: var(--jm-t-xs); letter-spacing: .1em; margin-top: 4px; }
  .is-touch .h-health { top: auto !important; left: auto !important; right: calc(50% + ${SWAP_SLOT.w / 2 + 12}px) !important; bottom: calc(10px + var(--sab)) !important; text-align: right; }
  .is-touch .h-hp-row { justify-content: flex-end; }
  .is-touch .h-hp-n { font-size: var(--jm-t-xl); }
  .is-touch .jm-stick-home { left: calc(170px + var(--sal)); bottom: calc(80px + var(--sab)); }
  .is-touch .jm-stick-home span { display: none; }
  /* 击杀提示挪到右上、暂停键下面 */
  .is-touch .h-feed { top: calc(58px + var(--sat)) !important; right: calc(14px + var(--sar)); }
  .is-touch .h-fl { font-size: var(--jm-t-s); }
  /* 队友：小地图右边，名字 + 一根细血条，一人一行 */
  .is-touch .jm-squad { top: calc(16px + var(--sat)) !important; bottom: auto !important; left: calc(var(--gl) + var(--jm-map, 104px) + 12px) !important; }
  /* 无线电字幕、提示条：切枪条正上方那一行 */
  .is-touch .comms { max-width: min(440px, 52vw); bottom: calc(${SWAP_SLOT.b + SWAP_SLOT.h + 10}px + var(--sab)) !important; }
  .is-touch .h-msg { top: auto !important; bottom: calc(${SWAP_SLOT.b + SWAP_SLOT.h + 10}px + var(--sab)) !important; max-width: min(420px, 50vw); }
}

/* ===== HUD 信息层级：左上角一列（小地图 → 下一步 → 任务栏），顶部正中指南针 ===== */
${tokens()}
.h-obj { left: var(--gl) !important; top: calc(14px + var(--jm-map, 148px) + 44px + var(--sat)) !important; max-width: min(300px, 34vw) !important; padding: 6px 10px 7px 10px !important;
  background: linear-gradient(90deg, rgba(10, 13, 15, .62), rgba(10, 13, 15, .18)); border-left: 2px solid var(--jm-c-obj); }
.h-obj .h-k { font-size: var(--jm-t-xs); letter-spacing: .2em; }
.h-obj-t { font: 600 var(--jm-t-l)/1.25 var(--f-label) !important; margin: 4px 0 6px !important; min-height: 0 !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-relays.none { display: none !important; }
.h-relays { font-size: var(--jm-t-xs); }
.jm-map-hint { margin-top: 14px !important; max-width: min(300px, 34vw) !important; overflow: hidden; text-overflow: ellipsis; font-size: var(--jm-t-m) !important; }
.jm-map-floor { font-size: var(--jm-t-xs) !important; }
.is-touch .h-obj { top: calc(10px + var(--jm-map, 104px) + 40px + var(--sat)) !important; max-width: min(250px, 30vw) !important; }
.is-touch .h-obj-t { font-size: var(--jm-t-m) !important; }
.is-touch .jm-map-hint { margin-top: 10px !important; font-size: var(--jm-t-s) !important; }
.is-touch .h-compass { width: min(280px, 36vw) !important; }
@media (orientation: portrait) {
  .is-touch .h-obj { max-width: 52vw !important; }
}

/* 指南针：刻度 + 当前目标（菱形下面一行「名字 距离」，不折行）+ 队友小圆点；别的标记不上指南针 */
.h-cm { left: 0 !important; width: 0 !important; display: grid !important; grid-template-columns: auto auto; justify-content: center; column-gap: 3px; white-space: nowrap; color: var(--jm-c-obj); }
.h-cm i { grid-column: 1 / -1; justify-self: center; width: 7px !important; height: 7px !important; margin: 0 0 3px !important; }
.h-cm b { font: 700 var(--jm-t-s)/1 var(--f-label) !important; margin: 0 !important; }
.h-cm span { font: 500 var(--jm-t-xs)/1.1 var(--f-mono) !important; color: var(--jm-c-text); }
.h-cm b:empty { display: none; }
.h-cm.jm-hide { display: none !important; }
.h-cmarks .jm-mate { position: absolute; left: -3px; top: -9px; width: 6px; height: 6px; border-radius: 50%; background: var(--jm-c-mate); box-shadow: 0 0 0 1px rgba(0, 0, 0, .45); will-change: transform; }
.h-cmarks .jm-mate.down { background: var(--jm-c-enemy); }

/* 世界里的标记：当前目标 = 菱形 + 上面名字、下面距离；其余只有一枚小图标（补给是绿色小方块、敌人是红点），不写字 */
.h-wm { color: var(--jm-c-obj); transition: opacity .2s; }
.h-wm.dim { opacity: .78; }
.h-wm b { top: -24px !important; font: 700 var(--jm-t-s)/1 var(--f-label) !important; text-shadow: 0 1px 3px rgba(0, 0, 0, .85); white-space: nowrap; }
.h-wm span { top: 10px !important; left: -24px !important; width: 48px !important; font: 500 var(--jm-t-xs)/1.3 var(--f-mono) !important; color: var(--jm-c-text); white-space: nowrap; text-shadow: 0 1px 3px rgba(0, 0, 0, .9); }
.h-wm.jm-hide { display: none !important; }
.h-wm.jm-icon b, .h-wm.jm-icon span { display: none !important; }
.h-wm.jm-icon { opacity: .7; }
.h-wm.jm-icon i { left: -4px !important; top: -4px !important; width: 8px !important; height: 8px !important; }
.h-wm.supply { color: var(--jm-c-pick); }
.h-wm.supply.jm-icon i { transform: none; border-radius: 2px; }
.h-wm.enemy, .h-wm.hunt { color: var(--jm-c-enemy); }
.h-wm.enemy.jm-icon i, .h-wm.hunt.jm-icon i { transform: none; border-radius: 50%; left: -3px !important; top: -3px !important; width: 6px !important; height: 6px !important; }
.h-wm.jm-aim, .h-wm.jm-aim.offscreen { opacity: 0 !important; }
.h-wm.jm-far { opacity: .6; }
.h-wm .jm-arr { position: absolute; left: -7px; top: -7px; width: 14px; height: 14px; display: none; transform: rotate(var(--jm-a, 0deg)) translateY(-15px); }
.h-wm .jm-arr::before { content: ''; position: absolute; left: 3px; top: 0; border: 4px solid transparent; border-bottom: 7px solid currentColor; border-top: 0; }
.h-wm.offscreen .jm-arr { display: block; }

/* 无线电字幕：一行（「指挥中心」小字 + 正文，长了截断），几秒后淡掉；提示条和它在同一处，字幕在的时候提示条让到上面一行 */
.comms { display: flex !important; align-items: baseline; gap: 8px; white-space: nowrap; top: auto !important; bottom: calc(96px + var(--sab)) !important; width: max-content !important; max-width: min(620px, 56vw); padding: 0 10px; border-radius: 3px; background: var(--jm-c-plate); transition: opacity .5s; }
.comms-who { display: inline !important; flex: none; margin: 0 !important; font: 600 var(--jm-t-xs)/1 var(--f-label) !important; letter-spacing: .14em !important; color: var(--jm-c-obj); }
.comms-t { display: block !important; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 var(--jm-t-m)/1.7 var(--f-label) !important; padding: 0 !important; background: none !important; }
.comms.jm-fade { opacity: 0 !important; }
.h-msg { top: auto !important; bottom: calc(96px + var(--sab)); max-width: min(620px, 56vw); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font: 500 var(--jm-t-s)/1.4 var(--f-label) !important; letter-spacing: .04em !important; text-transform: none !important;
  padding: 3px 10px !important; border-radius: 3px; background: var(--jm-c-plate) !important; transition: opacity .3s, translate .2s; }
#ui.jm-radio .h-msg { translate: 0 -28px; }

/* 弹药：数字收小；「弹药不足 / 换弹 / 耗尽」是一枚小签（不闪） */
.h-ammo-n { font-size: var(--jm-t-xxl) !important; }
.h-ammo-r { font-size: var(--jm-t-m); }
.h-pips { margin: 6px 0 5px !important; }
.h-pips i { height: 8px !important; }
.h-wname { font-size: var(--jm-t-xs) !important; }
.h-cue { position: absolute; right: 0; bottom: 100%; margin: 0 0 6px !important; height: auto !important; padding: 2px 6px; border: 1px solid currentColor; border-radius: 3px; background: rgba(255, 179, 71, .14);
  font: 700 var(--jm-t-xs)/1.2 var(--f-label) !important; letter-spacing: .1em !important; white-space: nowrap; }
.h-cue.urgent { color: var(--jm-c-enemy) !important; background: rgba(255, 90, 74, .16); animation: none !important; }

/* 队友（电脑）：任务栏下面，名字 + 细血条 */
.jm-squad { left: var(--gl) !important; bottom: auto !important; top: calc(14px + var(--jm-map, 148px) + 44px + 96px + var(--sat)); gap: 3px !important; font-size: var(--jm-t-xs) !important; }
.jm-squad .m { grid-template-columns: 40px 56px auto !important; gap: 6px !important; }
.jm-squad .m i { height: 3px !important; }
.jm-squad .m i b { background: var(--jm-c-mate); }

/* 跟随拇指的摇杆：不按的时候什么都不画（固定摇杆、布局编辑时照常显示那个圈） */
#ui:not(.jm-stick-fixed):not(.jm-editing) .jm-stick-home { display: none; }
`;

/**
 * 世界标记的取舍：max 同时最多几枚；pickupNear 补给（弹药箱）几米以内才露图标；enemyNear 敌人几米以内露红点；
 * aim 准星附近（屏幕短边的这个比例为半径）的标记淡掉；rank 抢名额的先后（目标 → 敌人 → 补给）。
 */
export const MARKERS = Object.freeze({ max: 3, pickupNear: 15, enemyNear: 40, aim: 0.13, rank: Object.freeze({ objective: 0, enemy: 1, pickup: 2 }) });
/** 标记的 kind（原游戏 + 我们的 extraMarkers）→ 角色：supply 是补给，enemy / hunt 是敌人，别的都算目标 */
export function markerRole(kind) { return kind === 'supply' ? 'pickup' : kind === 'enemy' || kind === 'hunt' ? 'enemy' : 'objective'; }

/**
 * 一组标记（{ role, d 米, x, y 屏幕像素, off 贴在屏幕边上, near 走到跟前了 }）→ 每枚怎么画：
 *   { primary 当前目标, compass 上不上指南针, world: 'label' | 'icon' | 'hide', aim 在准星附近（淡掉） }。
 * 当前目标 = 最近的目标类标记（没有目标类时取最近的敌人）：指南针只放它，世界里只有它写名字和距离、贴边时带箭头。
 * 其余只在屏幕里、够近时画一枚小图标；准星附近的淡掉、不占名额；总数不超过 max。纯函数
 */
export function planMarkers(marks, { w, h }, M = MARKERS) {
  let primary = -1;
  for (const want of ['objective', 'enemy']) {
    marks.forEach((m, i) => { if (m.role === want && (primary < 0 || m.d < marks[primary].d)) primary = i; });
    if (primary >= 0) break;
  }
  const out = marks.map((m, i) => ({ primary: i === primary, compass: i === primary, world: 'hide', aim: false }));
  const cand = [];
  marks.forEach((m, i) => {
    if (m.near) return;
    if (i !== primary && (m.off || (m.role === 'pickup' && m.d > M.pickupNear) || (m.role === 'enemy' && m.d > M.enemyNear))) return;
    cand.push(i);
  });
  cand.sort((a, b) => (b === primary) - (a === primary) || M.rank[marks[a].role] - M.rank[marks[b].role] || marks[a].d - marks[b].d);
  const r = M.aim * Math.min(w, h);
  let n = 0;
  for (const i of cand) {
    const m = marks[i], aim = !m.off && Math.hypot(m.x - w / 2, m.y - h / 2) < r;
    if (!aim && n >= M.max) continue;
    out[i].world = i === primary ? 'label' : 'icon'; out[i].aim = aim;
    if (!aim) n++;
  }
  return out;
}

/** 原游戏指南针一度几像素（它的 tx） */
export const COMPASS_PX = 4;
/** 指南针上的横坐标（相对正中，像素）：从你到 (dx, dz) 的方位，你朝 yaw；出了这条刻度带（宽 width）返回 null */
export function compassX(dx, dz, yaw, width) {
  const head = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  let a = Math.atan2(dx, -dz) * 180 / Math.PI - head; a = ((a + 540) % 360 + 360) % 360 - 180;
  const x = a * COMPASS_PX;
  return Math.abs(x) > width / 2 - 14 ? null : Math.round(x);
}

/** 无线电一句话打完以后留几秒就淡掉 */
export const RADIO_HOLD = 3.5;

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
  // 标记的角色（目标 / 补给 / 敌人）：setMarkers 收到的每一项可以自己带 role（楼顶机枪是绿色的 supply，但那一段它就是目标），没带按 kind 算
  const hud = G.hud, setMarkers0 = hud?.setMarkers;
  if (setMarkers0) hud.setMarkers = function (list) {
    const r = setMarkers0.call(this, list);
    const cms = ui.querySelectorAll('.h-cmarks .h-cm'), wms = ui.querySelectorAll('.h-marks .h-wm');
    (list || []).forEach((q, i) => { const role = q.role || markerRole(q.kind || 'relay'); if (cms[i]) cms[i].dataset.role = role; if (wms[i]) wms[i].dataset.role = role; });
    return r;
  };
  const roleOf = (el) => el.dataset.role || markerRole([...el.classList].find((c) => c !== 'h-wm' && c !== 'h-cm' && !c.startsWith('jm-') && !['offscreen', 'near', 'dim', 'edge'].includes(c)));
  function markers() {
    const wms = [...ui.querySelectorAll('.h-marks .h-wm')], cms = [...ui.querySelectorAll('.h-cmarks .h-cm')], marks = [];
    const W = innerWidth, H = innerHeight;
    for (const el of wms) {
      const p = pos(el) || [-1e4, -1e4];
      marks.push({ role: roleOf(el), x: p[0], y: p[1], d: parseFloat(el.querySelector('span')?.textContent) || 0, off: el.classList.contains('offscreen'), near: el.classList.contains('near') });
    }
    const res = planMarkers(marks, { w: W, h: H });
    // 贴在屏幕边上的目标别压在左上角那一列（小地图、队友、任务栏）和左手开火键上：压着就往下挪到它们下面
    const keep = [...ui.querySelectorAll('.jm-map:not(.off), .jm-squad:not(.off), .h-obj.has, .touch.on .t-fire2')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    wms.forEach((el, i) => {
      const m = marks[i], q = res[i];
      el.classList.toggle('jm-hide', q.world === 'hide'); el.classList.toggle('jm-icon', q.world === 'icon'); el.classList.toggle('jm-aim', q.aim);
      el.classList.toggle('jm-far', q.world === 'label' && m.d > 90);
      if (cms[i]) cms[i].classList.toggle('jm-hide', !q.compass);
      let dy = 0;
      if (q.world === 'label' && m.off) {
        if (!el.querySelector('.jm-arr')) el.insertAdjacentHTML('beforeend', '<u class="jm-arr"></u>');
        el.style.setProperty('--jm-a', `${(Math.atan2(m.y - H / 2, m.x - W / 2) * 180 / Math.PI + 90).toFixed(0)}deg`);
        for (const r of keep) if (m.x > r.left - 34 && m.x < r.right + 34 && m.y + dy > r.top - 30 && m.y + dy < r.bottom + 30) dy = r.bottom + 34 - m.y;
      }
      const t = dy ? `0 ${Math.round(dy)}px` : ''; if (el.style.translate !== t) el.style.translate = t;
    });
  }
  // 指南针上的队友小圆点
  const dots = new Map();
  function mates() {
    const host = ui.querySelector('.h-cmarks'), sq = G.squad, p = G.player?.pos;
    const list = host && p && sq?.everyone && sq.spawned ? sq.everyone.filter((m) => sq.isOn?.(m) && m.pos && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > 1) : [];
    const width = ui.querySelector('.h-compass')?.clientWidth || 280, seen = new Set();
    for (const m of list) {
      const x = compassX(m.pos.x - p.x, m.pos.z - p.z, G.player.yaw || 0, width);
      if (x === null) continue;
      let el = dots.get(m.id);
      if (!el) { el = document.createElement('i'); el.className = 'jm-mate'; dots.set(m.id, el); }
      if (el.parentNode !== host) host.appendChild(el);
      const t = `translate3d(${x}px,0,0)`; if (el.style.transform !== t) el.style.transform = t;
      el.classList.toggle('down', !!m.down); seen.add(m.id);
    }
    for (const [id, el] of dots) if (!seen.has(id)) el.remove();
  }
  // 无线电：一句话打完、停 RADIO_HOLD 秒就淡掉；字幕在的时候提示条让到上面一行
  let radioText = '', radioT = 0;
  function radio(dt) {
    const c = ui.querySelector('.comms'), t = c?.querySelector('.comms-t'); if (!c || !t) return;
    const on = c.classList.contains('on');
    if (t.textContent !== radioText) { radioText = t.textContent; radioT = 0; } else radioT += dt;
    const fade = on && radioT > RADIO_HOLD;
    if (c.classList.contains('jm-fade') !== fade) c.classList.toggle('jm-fade', fade);
    const busy = on && !fade && !!radioText;
    if (ui.classList.contains('jm-radio') !== busy) ui.classList.toggle('jm-radio', busy);
  }
  return {
    /** dt：这一帧的秒数（游戏时间，暂停时不走） */
    update(dt = 1 / 60) {
      if (G.input?.touch && !fire2) buildFire2();
      frame++;
      if (frame % 6 === 0) relays();
      if (frame % 3 === 0) { markers(); mates(); }
      radio(Math.min(0.1, Math.max(0, dt || 0)));
    },
    get fire2() { return fire2; },
    dispose() { watcher.disconnect(); fire2?.remove(); for (const el of dots.values()) el.remove(); if (setMarkers0) hud.setMarkers = setMarkers0; },
  };
}
