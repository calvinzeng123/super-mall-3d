// Mobile input and HUD only. Simulation, navigation and combat stay in game.js.
export const FPS_CONTROL_STORAGE_KEY = 'yunlan.fps.controls.v1';
export const FPS_SETTINGS_STORAGE_KEY = 'yunlan.fps.settings.v2';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const numeric = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Every draggable control. v5 appends melee/grenade so v1 saved layouts still load. */
export const CONTROL_KEYS = ['move', 'fire', 'ads', 'reload', 'swap', 'interact', 'sprint', 'crouch', 'heal', 'jump', 'melee', 'grenade'];
/** Pixel footprint at scale 1; mirrors the --base-size rules inside HUD_CSS. */
const CONTROL_BASE_SIZES = { move: 108, fire: 72, interact: 55 };
/** Insets applied by .fps-controls around the touch arena (safe-area adds to these). */
export const CONTROL_ARENA_INSETS = { top: 5, right: 10, bottom: 8, left: 10 };
export const controlButtonSize = (key, scale = 1) => Math.max(44, (CONTROL_BASE_SIZES[key] || 52) * clamp(numeric(scale, 1), .8, 1.4));
export const SETTINGS_SECTIONS = Object.freeze({
  ops: ['scale', 'opacity', 'sensitivity', 'invertY'],
  hud: ['hudScale', 'killfeed', 'compass', 'hints', 'damageIndicators', 'lowHpVignette'],
  display: ['crosshair', 'crosshairColor', 'crosshairSize', 'shake'],
  audio: ['masterVolume', 'sfxVolume'],
  assist: ['aimAssist', 'deadzone'],
});
const CROSSHAIRS = ['cross', 'dot', 'circle'];
const CROSSHAIR_COLORS = ['amber', 'white', 'mint', 'red'];
const asBool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const asEnum = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;

/** Validate persisted data rather than trusting a previous session's JSON. */
export function normalizeControlSettings(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const positions = { portrait: {}, landscape: {} };
  for (const orientation of Object.keys(positions)) {
    for (const key of CONTROL_KEYS) {
      const stored = value.positions?.[orientation]?.[key];
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
        positions[orientation][key] = { x: clamp(stored.x, 0, 1), y: clamp(stored.y, 0, 1) };
      }
    }
  }
  return {
    scale: clamp(numeric(value.scale, 1), .8, 1.4),
    opacity: clamp(numeric(value.opacity, .78), .3, 1),
    sensitivity: clamp(numeric(value.sensitivity, 1), .35, 2.5),
    invertY: value.invertY === true,
    positions,
    deadzone: clamp(numeric(value.deadzone, .12), 0, .4),
    aimAssist: asBool(value.aimAssist, true),
    crosshair: asEnum(value.crosshair, CROSSHAIRS, 'cross'),
    crosshairColor: asEnum(value.crosshairColor, CROSSHAIR_COLORS, 'amber'),
    crosshairSize: clamp(numeric(value.crosshairSize, 1), .5, 2),
    hudScale: clamp(numeric(value.hudScale, 1), .85, 1.3),
    killfeed: asBool(value.killfeed, true),
    compass: asBool(value.compass, true),
    hints: asBool(value.hints, true),
    damageIndicators: asBool(value.damageIndicators, true),
    lowHpVignette: asBool(value.lowHpVignette, true),
    shake: clamp(numeric(value.shake, 1), 0, 1.5),
    masterVolume: clamp(numeric(value.masterVolume, .8), 0, 1),
    sfxVolume: clamp(numeric(value.sfxVolume, .9), 0, 1),
  };
}

/** Read v2 first, then migrate a v1 control block and persist the upgraded shape. */
export function loadControlSettings(storage) {
  if (!storage) return normalizeControlSettings();
  try {
    const saved = storage.getItem(FPS_SETTINGS_STORAGE_KEY);
    if (saved != null) return normalizeControlSettings(JSON.parse(saved));
    const legacy = storage.getItem(FPS_CONTROL_STORAGE_KEY);
    if (legacy != null) {
      const migrated = normalizeControlSettings(JSON.parse(legacy));
      saveControlSettings(storage, migrated);
      return migrated;
    }
  } catch { /* Corrupt JSON or blocked storage falls back to defaults. */ }
  return normalizeControlSettings();
}
export function saveControlSettings(storage, value) {
  try { storage?.setItem(FPS_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeControlSettings(value))); return true; }
  catch { return false; }
}

/** Constrain the entire target inside the safe-area arena, not just its centre. */
export function clampControlPosition(position, width, height, size = 44) {
  const halfW = typeof size === 'object' ? size.width / 2 : size / 2;
  const halfH = typeof size === 'object' ? size.height / 2 : size / 2;
  const marginX = Math.min(.5, (halfW + 4) / Math.max(1, width));
  const marginY = Math.min(.5, (halfH + 4) / Math.max(1, height));
  return { x: clamp(numeric(position.x, .5), marginX, 1 - marginX), y: clamp(numeric(position.y, .5), marginY, 1 - marginY) };
}

/**
 * Deterministic default layout for one orientation, as arena fractions.
 * Buttons sit on a 12px-gap grid and the two new v5 keys (melee/grenade) fill
 * dedicated rows so nothing overlaps at scale 1.4 on small phones.
 * Pure so tests can verify the geometry without a browser.
 */
export function layoutControlDefaults(orientation, width, height, scale = 1) {
  const w = Math.max(1, numeric(width, 1));
  const h = Math.max(1, numeric(height, 1));
  const s = clamp(numeric(scale, 1), .8, 1.4);
  const radius = key => controlButtonSize(key, s) / 2;
  const place = {};
  const put = (key, x, y) => { place[key] = clampControlPosition({ x, y }, w, h, controlButtonSize(key, s)); };
  if (orientation === 'portrait') {
    // Left thumb: crouch row above the stick, heal under it.
    const healY = 1 - (radius('heal') + 4) / h;
    const moveY = healY - (radius('move') + radius('heal') + 14) / h;
    const sprintY = moveY - (radius('move') + radius('sprint') + 16) / h;
    put('heal', .23, healY);
    put('move', .23, moveY);
    put('sprint', .23, sprintY);
    // Right thumb: outer firing column + inner utility column.
    const fireX = 1 - (radius('fire') + 4) / w;
    const edgeX = 1 - (radius('jump') + 4) / w;
    put('fire', fireX, .76);
    put('reload', edgeX, healY);
    put('jump', edgeX, .575);
    put('melee', edgeX, .41);
    put('grenade', edgeX, .245);
    const innerX = edgeX - (radius('jump') + radius('interact') + 12) / w;
    put('ads', fireX - (radius('fire') + radius('ads') + 12) / w, .76);
    put('interact', innerX, .575);
    put('crouch', innerX, .41);
    put('swap', innerX, .245);
  } else {
    // Left thumb cluster.
    put('move', .125, .73);
    put('sprint', .125 + (radius('move') + radius('sprint') + 12) / w, .73 - (radius('move') + radius('sprint') + 16) / h);
    const bottomY = 1 - (radius('heal') + 4) / h;
    put('heal', .315, bottomY);
    put('swap', .45, bottomY);
    put('crouch', .585, bottomY);
    put('reload', .72, bottomY);
    put('grenade', .93, bottomY);
    // Right thumb cluster.
    put('fire', .895, .56);
    put('melee', .93, .30);
    const adsX = .895 - (radius('fire') + radius('ads') + 12) / w;
    put('ads', adsX, .57);
    put('jump', adsX, .34);
    put('interact', adsX - (radius('jump') + radius('interact') + 12) / w, .59);
  }
  return place;
}

const DIFFICULTY_LABELS = { standard: '标准', veteran: '老兵' };
const difficultyText = value => DIFFICULTY_LABELS[value] || (typeof value === 'string' && value ? value : '');
const formatClock = seconds => { const s = Math.max(0, Math.round(numeric(seconds, 0))); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const formatSetting = (key, value) => {
  if (key === 'sensitivity' || key === 'crosshairSize' || key === 'hudScale') return `${numeric(value, 1).toFixed(2)}×`;
  if (key === 'scale' || key === 'opacity' || key === 'shake' || key === 'masterVolume' || key === 'sfxVolume' || key === 'deadzone') return `${Math.round(numeric(value, 0) * 100)}%`;
  return String(value);
};


const TOP_LEFT_EXTRA_HTML = `
  <div class="fps-meta-strip" aria-label="行动状态"><span>时间 <b class="fps-timer">00:00</b></span><span>情报 <b class="fps-intel-found">0</b>/<span class="fps-intel-total">5</span></span><span class="fps-difficulty" hidden>标准</span></div>
  <div class="fps-bonus-row" hidden><i class="fps-bonus-dot"></i><span class="fps-bonus-text"></span><div class="fps-bonus-bar"><i></i></div></div>`;
const ARMOR_HTML = '<div class="fps-armor-row" hidden>护甲<div class="fps-armor-track"><i></i></div><b class="fps-armor-value">0</b></div>';
const HUD_LIVE_EXTRA_HTML = `
  <div class="fps-score" aria-label="行动得分"><b class="fps-score-value">0</b><span class="fps-score-mult">×1.0</span><span class="fps-score-streak">连杀 0</span></div>
  <div class="fps-feed" role="log" aria-label="行动记录"></div>
  <div class="fps-damage-arcs" aria-hidden="true"><i></i></div>
  <div class="fps-lowhp" aria-hidden="true"></div>
  <div class="fps-hint" role="status" hidden><span class="fps-hint-text"></span><button type="button" data-action="hint-dismiss" aria-label="关闭提示">知道了</button></div>
  <div class="fps-toasts" role="status" aria-live="polite"></div>`;
const PAUSE_TABS_HTML = `<nav class="fps-tabs" role="tablist" aria-label="暂停菜单" hidden>
  <button type="button" role="tab" data-action="tab" data-tab="menu" aria-selected="true">行动</button>
  <button type="button" role="tab" data-action="tab" data-tab="settings" aria-selected="false">设置</button>
  <button type="button" role="tab" data-action="tab" data-tab="help" aria-selected="false">操作说明</button>
  <button type="button" role="tab" data-action="tab" data-tab="credits" aria-selected="false">署名</button></nav>`;
const PAUSE_MENU_HTML = `
  <div class="fps-menu-intro"><div class="fps-eyebrow">OPERATION / PAUSED</div><h2>行动暂停</h2>
    <p>搜索商场终端，获取酒店情报。<br>在车库接应车与屋顶直升机之间选择撤离路线。</p>
    <div class="fps-mission-summary" aria-label="行动概况">
      <div><b class="fps-summary-time">0:00</b><span>行动时间</span></div>
      <div><b class="fps-summary-score">0</b><span>行动得分</span></div>
      <div><b class="fps-summary-intel">0/5</b><span>情报碎片</span></div>
      <div><b class="fps-summary-bonus">未完成</b><span>可选目标</span></div>
      <div><b class="fps-summary-difficulty">标准</b><span>行动难度</span></div>
    </div>
  </div>
  <div class="fps-menu-actions"><button class="fps-primary" data-action="resume">继续行动</button><button data-action="settings">设置</button><button data-action="editor">调整按键</button><button data-action="firemode" class="fps-firemode">SMG：全自动 ⇄ 两连发</button><button data-action="extract-route">切换撤离路线</button><button data-action="credits">素材署名</button></div>
  <div class="fps-menu-bottom"><button data-action="restart">重新行动</button><button data-action="exit">返回封面</button></div>
  <form class="fps-order-form"><label for="fpsOrderInput">给队友下达指令</label><div class="fps-order-row"><input id="fpsOrderInput" autocomplete="off" maxlength="120" placeholder="例如：守住这里"><button type="submit">发送</button></div><div class="fps-order-status">支持跟随、守位与掩护指令</div><button class="fps-credits" type="button" data-action="credits" aria-label="素材署名与许可">素材署名 · DJMaesen / ELIZION</button></form>`;
const SETTINGS_PANEL_HTML = `
  <div class="fps-panel-heading"><h2>设置</h2><button data-action="menu">返回</button></div>
  <div class="fps-settings-tabs" role="tablist" aria-label="设置分类">
    <button type="button" role="tab" data-action="settings-tab" data-settings-tab="ops" aria-selected="true">操作</button>
    <button type="button" role="tab" data-action="settings-tab" data-settings-tab="hud" aria-selected="false">界面</button>
    <button type="button" role="tab" data-action="settings-tab" data-settings-tab="display" aria-selected="false">显示</button>
    <button type="button" role="tab" data-action="settings-tab" data-settings-tab="audio" aria-selected="false">音频</button>
    <button type="button" role="tab" data-action="settings-tab" data-settings-tab="assist" aria-selected="false">辅助</button>
  </div>
  <div class="fps-settings-section" data-settings-section="ops">
    <div class="fps-settings-row"><label for="fpsControlScale">按键大小</label><output data-output="scale"></output><input id="fpsControlScale" data-setting="scale" type="range" min="0.8" max="1.4" step="0.05"></div>
    <div class="fps-settings-row"><label for="fpsControlOpacity">按键不透明度</label><output data-output="opacity"></output><input id="fpsControlOpacity" data-setting="opacity" type="range" min="0.3" max="1" step="0.05"></div>
    <div class="fps-settings-row"><label for="fpsAimSensitivity">转向灵敏度</label><output data-output="sensitivity"></output><input id="fpsAimSensitivity" data-setting="sensitivity" type="range" min="0.35" max="2.5" step="0.05"></div>
    <div class="fps-settings-presets" role="group" aria-label="灵敏度预设"><button type="button" data-action="sens-preset" data-sens-preset="0.6">低</button><button type="button" data-action="sens-preset" data-sens-preset="1">标准</button><button type="button" data-action="sens-preset" data-sens-preset="1.6">高</button></div>
    <label class="fps-settings-toggle"><input data-setting="invertY" type="checkbox">反转上下视角</label>
    <div class="fps-settings-actions"><button class="fps-primary" data-action="editor">拖动调整按键</button><button data-action="reset-controls">恢复全部默认</button><button data-action="reset-section" data-section="ops">重置本区</button></div>
    <p class="fps-settings-caption">布局按横屏与竖屏分别保存。左侧摇杆移动，右侧空白区域滑动转向。灵敏度预设会立即生效。</p>
  </div>
  <div class="fps-settings-section" data-settings-section="hud" hidden>
    <div class="fps-settings-row"><label for="fpsHudScale">HUD 大小</label><output data-output="hudScale"></output><input id="fpsHudScale" data-setting="hudScale" type="range" min="0.85" max="1.3" step="0.05"></div>
    <label class="fps-settings-toggle"><input data-setting="killfeed" type="checkbox">显示击杀/行动记录</label>
    <label class="fps-settings-toggle"><input data-setting="compass" type="checkbox">显示罗盘标记</label>
    <label class="fps-settings-toggle"><input data-setting="hints" type="checkbox">显示教学提示</label>
    <label class="fps-settings-toggle"><input data-setting="damageIndicators" type="checkbox">受击方向指示</label>
    <label class="fps-settings-toggle"><input data-setting="lowHpVignette" type="checkbox">低血量暗角</label>
    <div class="fps-settings-actions"><button data-action="reset-section" data-section="hud">重置本区</button></div>
  </div>
  <div class="fps-settings-section" data-settings-section="display" hidden>
    <div class="fps-settings-row"><label for="fpsCrosshair">准星样式</label><select id="fpsCrosshair" class="fps-settings-select" data-setting="crosshair"><option value="cross">十字</option><option value="dot">圆点</option><option value="circle">圆环</option></select></div>
    <div class="fps-settings-row"><label for="fpsCrosshairColor">准星颜色</label><select id="fpsCrosshairColor" class="fps-settings-select" data-setting="crosshairColor"><option value="amber">琥珀</option><option value="white">白色</option><option value="mint">薄荷</option><option value="red">红色</option></select></div>
    <div class="fps-settings-row"><label for="fpsCrosshairSize">准星大小</label><output data-output="crosshairSize"></output><input id="fpsCrosshairSize" data-setting="crosshairSize" type="range" min="0.5" max="2" step="0.05"></div>
    <div class="fps-settings-row"><label for="fpsShake">镜头震动</label><output data-output="shake"></output><input id="fpsShake" data-setting="shake" type="range" min="0" max="1.5" step="0.05"></div>
    <div class="fps-settings-actions"><button data-action="reset-section" data-section="display">重置本区</button></div>
  </div>
  <div class="fps-settings-section" data-settings-section="audio" hidden>
    <div class="fps-settings-row"><label for="fpsMasterVolume">主音量</label><output data-output="masterVolume"></output><input id="fpsMasterVolume" data-setting="masterVolume" type="range" min="0" max="1" step="0.05"></div>
    <div class="fps-settings-row"><label for="fpsSfxVolume">音效音量</label><output data-output="sfxVolume"></output><input id="fpsSfxVolume" data-setting="sfxVolume" type="range" min="0" max="1" step="0.05"></div>
    <div class="fps-settings-actions"><button data-action="reset-section" data-section="audio">重置本区</button></div>
  </div>
  <div class="fps-settings-section" data-settings-section="assist" hidden>
    <label class="fps-settings-toggle"><input data-setting="aimAssist" type="checkbox">辅助瞄准（轻度吸附）</label>
    <div class="fps-settings-row"><label for="fpsDeadzone">摇杆死区</label><output data-output="deadzone"></output><input id="fpsDeadzone" data-setting="deadzone" type="range" min="0" max="0.4" step="0.01"></div>
    <div class="fps-settings-actions"><button data-action="reset-section" data-section="assist">重置本区</button></div>
    <p class="fps-settings-caption">老兵难度下敌人伤害更高、视野更远；设置会自动保存。</p>
  </div>`;
const RESULT_PANEL_HTML = `
  <div class="fps-result-layout"><div class="fps-result-head">
    <div class="fps-grade" data-grade="A"><b>A</b><span>GRADE</span></div>
    <div><div class="fps-eyebrow fps-result-eyebrow">OPERATION COMPLETE</div><h2 class="fps-result-title">撤离成功</h2><p class="fps-result-subtitle"></p><p class="fps-result-meta"></p></div>
  </div><div class="fps-result-stats"></div><div class="fps-result-actions"><button class="fps-primary" data-action="restart">再来一局</button><button data-action="exit">返回封面</button></div></div>`;
const HELP_PANEL_HTML = `
  <div data-panel="help" hidden><div class="fps-panel-heading"><h2>操作说明</h2><button data-action="menu">返回</button></div>
    <div class="fps-help-grid">
      <article><h3>触屏</h3><p>左摇杆移动，右侧空白区域滑动转向；按住开火可直接拖动瞄准。</p><p>开火 / 瞄准 / 换弹 / 切枪 / 互动 / 冲刺 / 蹲伏 / 跳跃 / 急救 / 近战 / 手雷 都可在“调整按键”中拖动自定义，横竖屏分别保存。</p></article>
      <article><h3>键盘</h3><p>WASD 移动 · Shift 冲刺 · 空格 跳跃 · R 换弹 · E 互动 · Q 切枪 · F 切换射击模式 · C 蹲伏 / 冲刺中滑铲 · X 近战 · G 手雷 · H 急救 · T 切换撤离路线 · Esc 暂停。</p></article>
      <article><h3>行动提示</h3><p>护甲会吸收大部分伤害；低血量时出现红色暗角与心跳提示。受击方向以屏幕边缘的弧线指示，连杀可以提升得分倍率。收集 5 枚情报碎片与完成可选目标会提高结算评级。</p></article>
    </div>
  </div>`;
const EDITOR_BAR_HTML = `<div><b>拖动按钮，自定义布局</b><span class="fps-editor-caption"></span><span class="fps-editor-size"></span></div><button data-action="editor-reset">重置当前方向</button><button data-action="editor-cancel">取消</button><button data-action="editor-save">保存</button>`;

const icons = {
  fire: '<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  ads: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/><circle cx="12" cy="12" r="3"/>',
  reload: '<path d="M19.7 7A8 8 0 1 0 20 16M20 3v5h-5"/>',
  swap: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
  interact: '<path d="M8 13V5a2 2 0 0 1 4 0v7m0-4a2 2 0 0 1 4 0v4m0-2a2 2 0 0 1 4 0v6c0 4-3 6-6 6-3 0-5-2-6-4l-4-5a2 2 0 0 1 3-2l1 2"/>',
  sprint: '<circle cx="15" cy="4" r="2"/><path d="m7 10 5-3 4 4 4 1m-8-5-2 7 5 3 1 5M10 14l-4 6H2"/>',
  jump: '<circle cx="14" cy="4" r="2"/><path d="m6 5 4 5 5-1 4-4M10 10l-2 5-4 2m4-2 7 2 2 4M3 22h18"/>',
  crouch: '<circle cx="12" cy="4" r="2"/><path d="m9 8 4 3 5 1M9 8l-2 6 7 2-2 5h7M7 14l-4 5"/>',
  heal: '<rect x="4" y="5" width="16" height="16" rx="4"/><path d="M9 5V3h6v2m-3 5v7m-3.5-3.5h7"/>',
  melee: '<path d="M6 19 17 8m-3-3 3-3 5 5-3 3m-8 8-1 3-4 1 1-4 3-1Zm5-11-9 9-1 3"/>',
  grenade: '<path d="M8 10a4 4 0 0 1 8 0v7a4 4 0 0 1-8 0v-7Zm4-4V3m-2 0h4M9 7l-3-2m9 2 3-2M8 13h8M8 16h8"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  squad: '<circle cx="8" cy="8" r="3"/><path d="M2 20v-3a6 6 0 0 1 12 0v3m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 5 5v1"/>',
};
const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ''}</svg>`;
const HUD_CSS = `
.fps-exit-choice{position:absolute;right:calc(10px + env(safe-area-inset-right,0px));top:calc(58px + env(safe-area-inset-top,0px));min-height:44px;max-width:142px;padding:5px 10px;color:#badfd9;border:1px solid #bfe4d64d;border-radius:12px;background:#102431a8;pointer-events:auto;font-size:10px}.fps-hud[data-paused="true"] .fps-exit-choice{pointer-events:none}.fps-mobility{position:absolute;left:50%;bottom:calc(38px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);font-size:9px;text-align:center;color:#c7e1dc;text-shadow:0 1px 3px #000;min-width:110px}.fps-stamina-track{height:2px;width:82px;margin:4px auto;background:#d8eeec30}.fps-stamina-track i{display:block;height:100%;background:#97d7bd}.fps-jump{border-color:#c5e5ec9c}.fps-hud[data-sprinting="true"] .fps-crosshair{opacity:.25}.fps-hud[data-airborne="true"] .fps-crosshair{transform:translate(-50%,-50%) scale(1.4)}.fps-threat-status{color:#edbb96;font-size:9px;min-height:12px;margin-top:2px}
.fps-hud{--fps-scale:1;--fps-opacity:.78;--fps-amber:#e8b876;--fps-mint:#9bc9bc;--fps-white:#edf4f8;--fps-muted:#b4c7d3;position:fixed;inset:0;z-index:80;color:var(--fps-white);font:12px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden;isolation:isolate;color-scheme:dark}
.fps-hud *{box-sizing:border-box}.fps-hud [hidden]{display:none!important}.fps-hud button,.fps-hud input{font:inherit}.fps-hud button{color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}.fps-hud button:focus-visible,.fps-hud input:focus-visible{outline:2px solid var(--fps-amber);outline-offset:3px}.fps-hud button:disabled{cursor:default}.fps-hud svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.fps-look{position:absolute;inset:0 0 0 34%;pointer-events:auto;touch-action:none;z-index:0}.fps-live{position:absolute;inset:0;pointer-events:none;transition:opacity .15s}.fps-hud[data-paused="true"]:not([data-editing="true"]) .fps-live{opacity:.22}.fps-hud[data-paused="true"] .fps-look{pointer-events:none}.fps-hud[data-paused="true"]:not([data-editing="true"]) .fps-control,.fps-hud[data-paused="true"] .fps-pause,.fps-hud[data-paused="true"] .fps-squad-toggle{pointer-events:none}
.fps-top-left{position:absolute;left:calc(14px + env(safe-area-inset-left,0px));top:calc(12px + env(safe-area-inset-top,0px));width:min(280px,40vw);text-shadow:0 1px 3px #000,0 1px 8px #0009}.fps-mission-overline{display:flex;align-items:center;gap:8px;font-size:9px;letter-spacing:.12em;color:var(--fps-amber)}.fps-mission-step{font:600 13px/1 ui-monospace,SFMono-Regular,monospace}.fps-objective{font-size:13px;font-weight:600;margin:4px 0 1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fps-objective-detail{font-size:10px;color:#d5e0e7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:14px}.fps-route{display:flex;gap:5px;width:104px;margin:7px 0 5px}.fps-route i{height:2px;background:#d1e1ed4a;flex:1}.fps-route i.complete{background:#9bc9bc}.fps-route i.current{background:#e8b876}.fps-bearing{font-size:10px;color:#e8cda4;min-height:14px}.fps-compass{position:absolute;left:50%;top:calc(13px + env(safe-area-inset-top,0px));transform:translateX(-50%);font:600 10px/1.2 ui-monospace,SFMono-Regular,monospace;display:flex;align-items:center;gap:15px;color:#d3e1e9;text-shadow:0 1px 4px #000}.fps-compass:before,.fps-compass:after{content:"";height:4px;width:30px;border-top:1px solid #d9e9f08c;border-left:1px solid #d9e9f04d;border-right:1px solid #d9e9f04d}.fps-compass b{color:#fff;font-size:12px;min-width:45px;text-align:center}.fps-pause{position:absolute;top:calc(7px + env(safe-area-inset-top,0px));right:calc(10px + env(safe-area-inset-right,0px));width:44px;height:44px;border-radius:14px;background:#10243176;border:1px solid #d1e5f03d;display:grid;place-items:center;pointer-events:auto}.fps-pause svg{width:19px;height:19px}
.fps-squad{position:absolute;left:calc(14px + env(safe-area-inset-left,0px));top:calc(105px + env(safe-area-inset-top,0px));pointer-events:none;max-width:245px}.fps-squad-toggle{display:flex;align-items:center;gap:7px;min-height:44px;padding:6px 10px;border-radius:12px;background:#0d22358c;border:1px solid #c3e1df2b;pointer-events:auto;text-align:left;max-width:235px}.fps-squad-toggle svg{width:18px;height:18px;color:var(--fps-mint);flex:none}.fps-teammate{font-size:10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.fps-teammate-health{font:10px ui-monospace,monospace;color:#b7d7d0}.fps-squad-choices{display:flex;gap:4px;margin-top:5px;pointer-events:auto;padding:4px;background:#10232fec;border:1px solid #8daebb3d;border-radius:12px}.fps-squad-choices button{min-width:51px;min-height:44px;border:0;background:#f0f8ff0b;border-radius:8px;font-size:11px}.fps-squad-choices button[aria-pressed="true"]{background:#9bc9bc30;color:#bfe9dc}
.fps-controls{position:absolute;inset:calc(5px + env(safe-area-inset-top,0px)) calc(10px + env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) calc(10px + env(safe-area-inset-left,0px));pointer-events:none}.fps-control{position:absolute;left:50%;top:50%;width:max(44px,calc(var(--base-size,52px)*var(--fps-scale)));height:max(44px,calc(var(--base-size,52px)*var(--fps-scale)));transform:translate(-50%,-50%);border:1px solid #d1e5ef69;border-radius:50%;background:linear-gradient(145deg,#d6e6f020,#11273542);color:#edf4f8;pointer-events:auto;touch-action:none;opacity:var(--fps-opacity);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0;box-shadow:inset 0 1px 0 #effaff12,0 2px 8px #020e1717;text-shadow:0 1px 3px #071927;transition:background .1s,border-color .1s;z-index:2}.fps-control .fps-control-label{font-size:9px;line-height:1;white-space:nowrap}.fps-control svg{width:22px;height:22px}.fps-control.is-active,.fps-control[aria-pressed="true"]{background:#c4dce658;border-color:#e7f5ff;opacity:1}.fps-fire{--base-size:72px;border:1px solid #f0c491a8;background:radial-gradient(circle,#c6936030 0%,#d3aa7d0a 65%);color:#f6d3a8}.fps-fire svg{width:29px;height:29px}.fps-fire.is-active{background:#e8b87677;border-color:#ffdfb2}.fps-interact{--base-size:55px;border-color:#a7d9cc9e;color:#d0f0e5}.fps-interact:disabled{opacity:.24}.fps-stick{--base-size:108px;border-color:#daebf041;background:radial-gradient(circle,transparent 30%,#b0c8da12);box-shadow:inset 0 0 25px #acccda10}.fps-stick:before,.fps-stick:after{content:"";position:absolute;background:#d3e4ed30}.fps-stick:before{height:1px;width:74%;left:13%;top:50%}.fps-stick:after{width:1px;height:74%;left:50%;top:13%}.fps-stick-knob{position:absolute;left:50%;top:50%;width:40%;height:40%;margin:-20% 0 0 -20%;border-radius:50%;border:1px solid #e0eef378;background:linear-gradient(145deg,#b5d6e345,#a4bddb18);box-shadow:0 3px 8px #0c243823;z-index:1}.fps-stick .fps-control-label{position:absolute;bottom:9px;color:#dbe9ed8c;font-size:8px}
.fps-crosshair{position:absolute;left:50%;top:50%;width:24px;height:24px;transform:translate(-50%,-50%);color:#fff;filter:drop-shadow(0 1px 1px #0009);opacity:.8}.fps-crosshair:before,.fps-crosshair:after{content:"";position:absolute;background:currentColor}.fps-crosshair:before{width:2px;height:4px;top:0;left:11px;box-shadow:0 20px currentColor}.fps-crosshair:after{width:4px;height:2px;left:0;top:11px;box-shadow:20px 0 currentColor}.fps-crosshair i{position:absolute;left:11px;top:11px;width:2px;height:2px;background:currentColor}.fps-hud[data-ads="true"] .fps-crosshair{width:3px;height:3px;background:#fff;border-radius:50%}.fps-hud[data-ads="true"] .fps-crosshair:before,.fps-hud[data-ads="true"] .fps-crosshair:after,.fps-hud[data-ads="true"] .fps-crosshair i{display:none}.fps-hit-marker{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(45deg);width:20px;height:20px;opacity:0;border:2px solid #edc99e;clip-path:polygon(0 0,36% 0,36% 12%,12% 12%,12% 36%,0 36%,0 0,100% 0,100% 36%,88% 36%,88% 12%,64% 12%,64% 0,100% 0,100% 100%,64% 100%,64% 88%,88% 88%,88% 64%,100% 64%,100% 100%,0 100%,0 64%,12% 64%,12% 88%,36% 88%,36% 100%,0 100%)}.fps-hit-marker.on{opacity:1}.fps-damage{position:absolute;inset:0;box-shadow:inset 0 0 90px 20px #a22d324d;opacity:0;transition:opacity .3s;pointer-events:none}.fps-damage.on{opacity:1}
.fps-health{position:absolute;bottom:calc(13px + env(safe-area-inset-bottom,0px));left:calc(16px + env(safe-area-inset-left,0px));display:flex;align-items:center;gap:9px;text-shadow:0 1px 5px #000}.fps-health b{font:600 17px ui-monospace,monospace;min-width:32px}.fps-health-track{height:3px;background:#e4f2f235;width:82px;overflow:hidden}.fps-health-track i{display:block;width:100%;height:100%;background:#c0e1d5}.fps-health.low{color:#ffb5a4}.fps-health.low i{background:#ff9e87}.fps-health small{font-size:8px;letter-spacing:.1em;color:#c5d9e2}.fps-ammo{position:absolute;bottom:calc(11px + env(safe-area-inset-bottom,0px));right:calc(16px + env(safe-area-inset-right,0px));display:flex;align-items:flex-end;gap:10px;text-shadow:0 1px 5px #000}.fps-weapon{font-size:10px;text-transform:uppercase;color:#d6e3ec;max-width:120px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;padding-bottom:3px}.fps-ammo-numbers b{font:600 25px/1 ui-monospace,monospace}.fps-ammo-numbers span{font:12px ui-monospace,monospace;color:#bbccd7}.fps-ammo.reloading .fps-weapon{color:var(--fps-amber)}.fps-notice{position:absolute;left:50%;top:calc(55px + env(safe-area-inset-top,0px));transform:translateX(-50%);padding:7px 13px;background:#102636dd;border:1px solid #b6d0dd3b;border-radius:10px;max-width:min(390px,62vw);font-size:11px;text-align:center;opacity:0;transition:opacity .2s}.fps-notice.on{opacity:1}.fps-interact-prompt{position:absolute;left:50%;top:calc(50% + 43px);transform:translateX(-50%);max-width:42vw;font-size:11px;text-align:center;text-shadow:0 1px 5px #000;color:#cce9de}.fps-extract-progress{position:absolute;left:50%;top:calc(50% + 67px);transform:translateX(-50%);width:120px;height:3px;background:#d2efde32}.fps-extract-progress i{height:100%;display:block;background:#a4d4bf;width:0}.fps-keyboard-hint{position:absolute;left:50%;bottom:13px;transform:translateX(-50%);font-size:9px;color:#d7e7ef94;text-shadow:0 1px 4px #000;white-space:nowrap}.fps-world-marker{position:absolute;pointer-events:none;transform:translate(-50%,-50%);color:#ffe1ad;font-weight:600;font-size:11px;text-shadow:0 1px 3px #000;white-space:nowrap;padding:4px 8px;background:#112b3d80;border:1px solid #c6a3695e;border-radius:8px}.fps-world-marker:empty{display:none}.fps-map{position:absolute;display:none}
.fps-modal{position:absolute;inset:0;background:#06121ddb;display:flex;align-items:center;justify-content:center;padding:calc(18px + env(safe-area-inset-top,0px)) calc(22px + env(safe-area-inset-right,0px)) calc(18px + env(safe-area-inset-bottom,0px)) calc(22px + env(safe-area-inset-left,0px));pointer-events:auto;touch-action:pan-y;overflow:auto;z-index:20}.fps-dialog{width:min(620px,100%);max-height:100%;overflow:auto;background:#142735ed;border:1px solid #afc7d135;border-radius:22px;padding:24px;box-shadow:0 15px 80px #0006}.fps-dialog h2{margin:2px 0 6px;font-size:27px;letter-spacing:.05em}.fps-dialog p{color:#b6cbd7;font-size:12px;line-height:1.75;margin:6px 0 17px}.fps-eyebrow{font:10px ui-monospace,monospace;letter-spacing:.15em;color:#e8b876}.fps-dialog button{min-height:44px;padding:10px 15px;border:1px solid #c1d7e32b;border-radius:11px;background:#b9d2e20a;font-weight:500}.fps-dialog button:hover{background:#c9e5f41c}.fps-dialog .fps-primary{background:#e8b876;color:#162733;border-color:#e8b876;font-weight:650}.fps-dialog .fps-primary:hover{background:#f1c88f}.fps-menu-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:16px 0}.fps-menu-actions .fps-primary{grid-column:1/-1}.fps-menu-bottom{display:flex;gap:9px;margin-top:13px}.fps-menu-bottom button{flex:1;font-size:11px}.fps-order-form{border-top:1px solid #b3d0e11c;padding-top:16px;margin-top:18px}.fps-order-form label{font-size:11px;display:block;margin-bottom:8px;color:#c5e0d9}.fps-order-row{display:flex;gap:8px}.fps-order-row input{min-width:0;flex:1;min-height:44px;padding:10px 12px;background:#08182596;color:#edf4f8;border:1px solid #bdd6e236;border-radius:10px;user-select:text;-webkit-user-select:text}.fps-order-row button{flex:none}.fps-order-status{font-size:10px;color:#b5d7c9;min-height:14px;margin-top:7px}.fps-credits{display:flex;align-items:center;min-height:44px;font-size:9px;color:#aac8d8;text-underline-offset:3px}.fps-dialog .fps-credits{border:0;padding:0;background:none;text-decoration:underline}.fps-credits-content article{padding:8px 0 15px;border-bottom:1px solid #c9dfed26}.fps-credits-content h3{font-size:14px;margin:8px 0}.fps-credits-content a{display:inline-flex;align-items:center;min-height:44px;margin-right:18px;font-size:11px;color:#d9c59e;text-underline-offset:4px}.fps-credits-content p{font-size:11px;margin:5px 0;line-height:1.75}.fps-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:17px}.fps-panel-heading h2{font-size:21px;margin:0}.fps-settings-row{display:grid;grid-template-columns:1fr auto;gap:6px 16px;margin-bottom:20px;align-items:center}.fps-settings-row label{font-size:12px}.fps-settings-row output{font:11px ui-monospace,monospace;color:#e8c48f}.fps-settings-row input[type="range"]{grid-column:1/-1;width:100%;min-height:28px;accent-color:#e8b876;cursor:pointer;touch-action:pan-y}.fps-settings-toggle{display:flex;align-items:center;gap:10px;min-height:44px;font-size:12px}.fps-settings-toggle input{width:20px;height:20px;accent-color:#e8b876}.fps-settings-actions{display:flex;gap:9px;margin-top:14px}.fps-settings-actions button{flex:1;font-size:11px}.fps-settings-caption{font-size:10px!important;margin:12px 0 0!important}.fps-editor-bar{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100% - 26px);padding:8px 10px 8px 14px;border:1px solid #d2dfeb40;background:#102839f5;border-radius:16px;display:flex;gap:10px;align-items:center;pointer-events:auto;z-index:30;box-shadow:0 7px 28px #0005}.fps-editor-bar b{font-size:11px}.fps-editor-bar span{display:block;font-size:9px;color:#c4d7e2;line-height:1.6}.fps-editor-bar button{min-height:44px;padding:6px 14px;border:1px solid #bfd8e433;border-radius:10px;background:#d7e9f014;font-size:11px;white-space:nowrap}.fps-editor-bar button[data-action="editor-save"]{background:#e8b876;color:#162733;border-color:#e8b876}.fps-hud[data-editing="true"] .fps-control{opacity:1;border-style:dashed;border-color:#dfbf8b;background:#0c293ab8;pointer-events:auto;cursor:grab}.fps-hud[data-editing="true"] .fps-control.is-selected{border:2px solid #ffda99;box-shadow:0 0 0 4px #e8b8762b}.fps-hud[data-editing="true"] .fps-top-left,.fps-hud[data-editing="true"] .fps-compass,.fps-hud[data-editing="true"] .fps-squad,.fps-hud[data-editing="true"] .fps-pause{visibility:hidden}.fps-editor-grid{position:absolute;inset:0;background-image:linear-gradient(#a0bdcd09 1px,transparent 1px),linear-gradient(90deg,#a0bdcd09 1px,transparent 1px);background-size:24px 24px;pointer-events:none}.fps-result-title{font-size:32px!important;margin:8px 0!important}.fps-result-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:22px 0}.fps-result-stat{padding:11px 0;border-top:1px solid #b4d2df29}.fps-result-stat b{display:block;font:600 23px ui-monospace,monospace;color:#f2dab6}.fps-result-stat span{font-size:10px;color:#b9cedb}.fps-result-actions{display:flex;gap:10px}.fps-result-actions button{flex:1}.fps-dialog[data-result="failure"] .fps-eyebrow{color:#ffb6a7}.fps-dialog[data-result="failure"] .fps-result-title{color:#f6d1c8}
@media(orientation:portrait){.fps-top-left{width:calc(100% - 80px);max-width:310px;top:calc(15px + env(safe-area-inset-top,0px))}.fps-objective{font-size:14px}.fps-compass{top:calc(134px + env(safe-area-inset-top,0px));font-size:10px}.fps-squad{top:calc(92px + env(safe-area-inset-top,0px))}.fps-squad-toggle{min-height:44px;padding:4px 9px}.fps-notice{top:calc(175px + env(safe-area-inset-top,0px));max-width:84vw}.fps-health-track{width:61px}.fps-health{bottom:calc(18px + env(safe-area-inset-bottom,0px))}.fps-ammo{bottom:calc(15px + env(safe-area-inset-bottom,0px))}.fps-weapon{font-size:9px;max-width:90px}.fps-keyboard-hint{display:none}.fps-dialog{padding:23px 20px;border-radius:21px}.fps-menu-actions{grid-template-columns:1fr}.fps-menu-actions .fps-primary{grid-column:auto}.fps-editor-bar{align-items:center;gap:7px;padding:8px 9px}.fps-editor-bar b{font-size:10px}.fps-editor-bar button{padding:6px 10px;min-height:44px}.fps-editor-bar span{font-size:8px}.fps-result-stats{grid-template-columns:repeat(3,1fr)}.fps-interact-prompt{max-width:70vw}}
@media(orientation:portrait){.fps-mobility{top:calc(153px + env(safe-area-inset-top,0px));bottom:auto}.fps-notice{top:calc(184px + env(safe-area-inset-top,0px))}}
@media(orientation:landscape) and (max-height:460px){.fps-top-left{top:calc(8px + env(safe-area-inset-top,0px));width:min(235px,32vw)}.fps-objective{font-size:11px}.fps-objective-detail{font-size:9px}.fps-mission-overline{font-size:8px}.fps-route{margin-top:4px;margin-bottom:3px}.fps-bearing{font-size:9px}.fps-squad{top:calc(86px + env(safe-area-inset-top,0px))}.fps-squad-toggle{min-height:44px;padding:4px 8px}.fps-squad-choices{position:absolute;left:100%;top:0;margin:0 0 0 5px}.fps-squad-choices button{min-width:44px;font-size:10px}.fps-stick{--base-size:98px}.fps-notice{top:calc(42px + env(safe-area-inset-top,0px))}.fps-dialog{padding:20px 23px;width:min(680px,100%)}.fps-dialog [data-panel="menu"]{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}.fps-menu-intro{grid-column:1}.fps-menu-actions{grid-column:2;grid-row:1/3;margin:0;align-self:start}.fps-menu-bottom{grid-column:2;grid-row:3;margin-top:0}.fps-order-form{grid-column:1;grid-row:2/4;margin:0;padding-top:10px}.fps-dialog h2{font-size:24px}.fps-dialog p{font-size:11px;margin-bottom:10px}.fps-order-form label{font-size:10px}.fps-order-row input{width:100px;font-size:11px}.fps-order-row button{font-size:10px;padding:8px 11px}.fps-menu-actions button{min-height:44px;font-size:11px}.fps-settings-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:24px}.fps-settings-row{margin-bottom:9px}.fps-settings-actions{margin-top:8px}.fps-settings-caption{margin-top:6px!important}.fps-settings-toggle{min-height:35px}.fps-result-layout{display:grid;grid-template-columns:1fr 1fr;gap:0 25px}.fps-result-stats{margin:0;grid-column:2;grid-row:1/3}.fps-result-actions{grid-column:1/-1;margin-top:14px}.fps-result-title{font-size:28px!important}}
@media(hover:hover) and (pointer:fine){.fps-look{pointer-events:none}}@media(pointer:coarse){.fps-keyboard-hint{display:none}}@media(prefers-reduced-motion:reduce){.fps-hud *{transition:none!important;animation:none!important}}
`;
const HUD_CSS_V5 = `
/* ---- v5: HUD additions ---- */
.fps-hud{--fps-hud-scale:1;--fps-crosshair-size:1;--fps-crosshair-color:#e8b876}
.fps-meta-strip{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin-top:7px;font:10px/1.2 ui-monospace,SFMono-Regular,monospace;color:#d6e4ec}
.fps-meta-strip span{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:6px;background:#0d22318c;border:1px solid #cfe3ef24;white-space:nowrap}
.fps-meta-strip b{color:#f2dab6;font-weight:600}
.fps-meta-strip .fps-difficulty{color:#e8b876;letter-spacing:.08em}
.fps-armor-row{display:flex;align-items:center;gap:5px;margin-top:5px;font-size:8px;letter-spacing:.08em;color:#b9d8e6}
.fps-armor-row[hidden]{display:none!important}
.fps-armor-track{height:3px;width:72px;background:#e4f2f235;overflow:hidden;border-radius:2px}
.fps-armor-track i{display:block;height:100%;width:0;background:#9fc9e8;transition:width .18s}
.fps-armor-value{font:9px ui-monospace,monospace;color:#cfe6f2;min-width:18px}
.fps-bonus-row{margin-top:6px;font-size:10px;color:#e5cfa6;display:flex;gap:6px;align-items:center;line-height:1.35;text-shadow:0 1px 3px #000}
.fps-bonus-row[hidden]{display:none!important}
.fps-bonus-row .fps-bonus-dot{width:6px;height:6px;flex:none;border-radius:50%;background:#e8b876;box-shadow:0 0 0 2px #e8b87626}
.fps-bonus-row.done{color:#a8d8c6}
.fps-bonus-row.done .fps-bonus-dot{background:#9bc9bc;box-shadow:0 0 0 2px #9bc9bc26}
.fps-bonus-bar{height:2px;width:64px;background:#e8b8762e;margin-left:auto;flex:none}
.fps-bonus-bar i{display:block;height:100%;width:0;background:#e8b876}
.fps-compass{position:absolute}
.fps-compass-tape{position:absolute;left:50%;top:calc(100% + 5px);transform:translateX(-50%);width:min(230px,46vw);height:15px;border-top:1px solid #d9e9f03d;pointer-events:none;overflow:hidden}
.fps-compass-tape:before{content:"";position:absolute;left:50%;top:0;width:1px;height:5px;background:#f2dab6;transform:translateX(-50%)}
.fps-compass-mark{position:absolute;top:2px;left:50%;transform:translateX(-50%);font:8px/1 ui-monospace,monospace;color:#c8dee7;white-space:nowrap;transition:left .1s linear}
.fps-compass-mark:before{content:"";display:block;width:1px;height:3px;margin:0 auto 1px;background:currentColor}
.fps-compass-mark[data-kind="objective"]{color:#f0c48f}
.fps-compass-mark[data-kind="ally"]{color:#9bc9bc}
.fps-compass-mark[data-kind="extraction"]{color:#8fd0e8}
.fps-hud[data-compass="false"] .fps-compass-tape,.fps-hud[data-compass="false"] .fps-compass-mark{display:none}
.fps-feed{position:absolute;top:calc(90px + env(safe-area-inset-top,0px));right:calc(12px + env(safe-area-inset-right,0px));display:flex;flex-direction:column;align-items:flex-end;gap:3px;max-width:min(230px,38vw);pointer-events:none;z-index:2}
.fps-feed-entry{font-size:10px;line-height:1.35;padding:3px 8px;border-radius:7px;background:#0b1e2bbb;border:1px solid #bcd8e42b;color:#d9e7ee;text-shadow:0 1px 3px #000;animation:fps-feed-in .18s ease-out;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fps-feed-entry[data-tone="kill"]{border-color:#f0c49166;color:#f6d8b0}
.fps-feed-entry[data-tone="intel"]{border-color:#9bc9bc66;color:#c9efe4}
.fps-feed-entry[data-tone="danger"]{border-color:#f09b8f66;color:#ffc4b8}
.fps-feed-entry[data-tone="pickup"]{border-color:#c9dce855;color:#dceaf2}
.fps-hud[data-killfeed="false"] .fps-feed{display:none}
@keyframes fps-feed-in{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
.fps-score{position:absolute;top:calc(58px + env(safe-area-inset-top,0px));right:calc(12px + env(safe-area-inset-right,0px));display:flex;flex-direction:column;align-items:flex-end;gap:0;font:10px/1.25 ui-monospace,monospace;color:#d8e6ee;text-shadow:0 1px 3px #000;z-index:2}
.fps-score b{font-size:15px;color:#f2dab6}
.fps-score-mult{color:#e8b876;font-size:9px}
.fps-score-streak{font-size:9px;color:#b9d7d0;min-height:11px}
.fps-damage-arcs{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .18s;z-index:1}
.fps-damage-arcs.on{opacity:1}
.fps-damage-arcs i{position:absolute;left:50%;top:50%;width:92px;height:16px;margin:-8px 0 0 -46px;border-radius:50%;border-top:3px solid #ff9b86;transform:rotate(var(--arc-angle,0deg)) translateY(-112px);filter:drop-shadow(0 0 6px #ff8f7a88)}
.fps-hud[data-damage-indicators="false"] .fps-damage-arcs{display:none}
.fps-lowhp{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .35s;background:radial-gradient(circle at 50% 50%,transparent 50%,#6d0f1440 100%);box-shadow:inset 0 0 110px 26px #7e12186b;z-index:1}
.fps-lowhp.on{opacity:1;animation:fps-heartbeat 1.1s ease-in-out infinite}
.fps-hud[data-lowhp="false"] .fps-lowhp{display:none}
@keyframes fps-heartbeat{0%,100%{opacity:.55}12%{opacity:1}24%{opacity:.68}36%{opacity:.95}}
.fps-hint{position:absolute;left:50%;bottom:calc(112px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;align-items:center;gap:10px;max-width:min(420px,84vw);padding:9px 12px;background:#102636e8;border:1px solid #d9c59e4d;border-radius:12px;font-size:11px;line-height:1.5;color:#e8daba;pointer-events:auto;z-index:4;box-shadow:0 6px 24px #0005}
.fps-hint[hidden]{display:none!important}
.fps-hint button{flex:none;min-height:32px;padding:4px 9px;border:1px solid #e8b87666;border-radius:8px;background:#e8b8761a;color:#f2dab6;font-size:10px;cursor:pointer}
.fps-hud[data-hints="false"] .fps-hint{display:none}
.fps-toasts{position:absolute;left:50%;bottom:calc(168px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;z-index:3;max-width:min(420px,86vw)}
.fps-toast{font-size:11px;padding:4px 10px;border-radius:8px;background:#0f2331de;border:1px solid #bcd8e430;color:#dcebf2;text-shadow:0 1px 3px #000;animation:fps-toast-in .16s ease-out;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fps-toast[data-tone="pickup"]{border-color:#9bc9bc55;color:#cdeee3}
.fps-toast[data-tone="intel"]{border-color:#9bc9bc55;color:#cdeee3}
.fps-toast[data-tone="armor"]{border-color:#9fc9e855;color:#d3ecf8}
.fps-toast[data-tone="danger"]{border-color:#f0a08f55;color:#ffcfc4}
.fps-toast[data-tone="score"]{border-color:#e8b87655;color:#f4dfbb}
@keyframes fps-toast-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.fps-control .fps-cooldown-ring{position:absolute;inset:-2px;border-radius:50%;background:conic-gradient(#0a1822cc 0deg var(--fps-cd,0deg),transparent var(--fps-cd,0deg));opacity:0;pointer-events:none;transition:opacity .12s,z-index 0s;z-index:0}
.fps-control.cooling .fps-cooldown-ring{opacity:.7}
.fps-control.is-empty{opacity:.3}
.fps-melee,.fps-grenade{border-color:#d9c59e8c;color:#f0dcb8}
.fps-hud[data-editing="true"] .fps-control .fps-cooldown-ring{opacity:0}
.fps-difficulty[hidden]{display:none!important}
.fps-hud[data-editing="true"] .fps-feed,.fps-hud[data-editing="true"] .fps-score,.fps-hud[data-editing="true"] .fps-lowhp,.fps-hud[data-editing="true"] .fps-hint,.fps-hud[data-editing="true"] .fps-toasts,.fps-hud[data-editing="true"] .fps-meta-strip{visibility:hidden}
/* ---- v5: pause tabs + mission summary ---- */
.fps-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 16px;padding-bottom:10px;border-bottom:1px solid #c9dfed26}
.fps-tabs[hidden]{display:none!important}
.fps-tabs button{min-height:38px;padding:6px 13px;border:1px solid #c1d7e32b;border-radius:9px;background:#b9d2e20a;font-size:11px;color:#cfe0ea;cursor:pointer}
.fps-tabs button[aria-selected="true"]{background:#e8b876;color:#162733;border-color:#e8b876;font-weight:650}
.fps-menu-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px 0 10px}
.fps-menu-summary div{padding:7px 8px;border:1px solid #b4d2df24;border-radius:9px;background:#0d223166;min-width:0}
.fps-menu-summary b{display:block;font:600 15px ui-monospace,SFMono-Regular,monospace;color:#f2dab6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fps-menu-summary span{font-size:9px;color:#b9cedb;white-space:nowrap}
.fps-help-grid h3{font-size:13px;margin:0 0 6px;color:#f0e2c4}
.fps-help-grid article{padding:11px 0 13px;border-bottom:1px solid #c9dfed26}
.fps-help-grid article:last-child{border-bottom:0}
.fps-help-grid p{font-size:11px;line-height:1.75;margin:4px 0;color:#c3d7e2}
/* ---- v5: tabbed settings ---- */
.fps-settings-tabs{display:flex;gap:6px;overflow-x:auto;margin:0 0 15px;padding-bottom:3px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.fps-settings-tabs::-webkit-scrollbar{display:none}
.fps-settings-tabs button{flex:none;min-height:38px;padding:6px 12px;border:1px solid #c1d7e32b;border-radius:9px;background:#b9d2e20a;font-size:11px;color:#cfe0ea;cursor:pointer}
.fps-settings-tabs button[aria-selected="true"]{background:#e8b876;color:#162733;border-color:#e8b876;font-weight:650}
.fps-settings-section[hidden]{display:none!important}
.fps-settings-presets{display:flex;gap:7px;margin:0 0 18px}
.fps-settings-presets button{flex:1;min-height:40px;font-size:11px}
.fps-settings-presets button[aria-pressed="true"]{background:#9bc9bc30;border-color:#9bc9bc8c;color:#d7f4ea}
.fps-settings-select{grid-column:1/-1;min-height:42px;padding:6px 10px;background:#08182596;color:#edf4f8;border:1px solid #bdd6e236;border-radius:10px;font-size:12px;user-select:text;-webkit-user-select:text}
.fps-settings-section .fps-settings-actions{flex-wrap:wrap}
.fps-settings-section .fps-settings-actions button{flex:1 1 30%}
/* ---- v5: result grade ---- */
.fps-result-head{display:flex;gap:16px;align-items:center;margin-bottom:16px}
.fps-grade{position:relative;flex:none;width:82px;height:82px;border-radius:50%;display:grid;place-items:center;border:2px solid #e8b87680;background:radial-gradient(circle,#e8b87624,transparent 70%);box-shadow:0 0 24px #e8b87626}
.fps-grade b{font:800 38px/1 ui-monospace,SFMono-Regular,monospace;color:#f2dab6}
.fps-grade span{position:absolute;bottom:7px;font-size:7px;letter-spacing:.18em;color:#cbb28a}
.fps-grade[data-grade="S"]{border-color:#ffd99a;box-shadow:0 0 30px #ffd99a4d}
.fps-grade[data-grade="S"] b{color:#fff0cf}
.fps-grade[data-grade="B"]{border-color:#9bc9bcb0}
.fps-grade[data-grade="B"] b{color:#c9efe4}
.fps-grade[data-grade="C"]{border-color:#9db6c4a0}
.fps-grade[data-grade="C"] b{color:#d3e2ea}
.fps-grade[data-grade="D"]{border-color:#f09b8fa0;box-shadow:0 0 22px #f09b8f2e}
.fps-grade[data-grade="D"] b{color:#ffc4b8}
.fps-result-meta{font-size:10px!important;color:#a8c2d2!important;margin:2px 0 0!important;letter-spacing:.06em}
.fps-dialog[data-result="failure"] .fps-grade{border-color:#f09b8fa0}
/* ---- v5: layout editor extras ---- */
.fps-editor-bar{flex-wrap:wrap;justify-content:center;gap:6px 8px;padding:7px 9px 7px 12px}
.fps-editor-bar button{min-width:44px}
.fps-editor-size{font:9px ui-monospace,monospace;color:#e8c48f;display:block;margin-top:2px}
.fps-editor-snap{position:absolute;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;border:1px solid #ffda99;background:#e8b87640;box-shadow:0 0 10px #e8b87688;pointer-events:none;z-index:25}
.fps-editor-snap[hidden]{display:none!important}
.fps-hud[data-editing="true"] .fps-editor-grid{background-size:40px 40px}
@media(orientation:portrait){
 .fps-feed{max-width:44vw;top:calc(88px + env(safe-area-inset-top,0px))}
 .fps-compass-tape{width:min(230px,54vw)}
 .fps-hint{bottom:calc(160px + env(safe-area-inset-bottom,0px));max-width:88vw}
 .fps-toasts{bottom:calc(210px + env(safe-area-inset-bottom,0px))}
 .fps-meta-strip{font-size:9px;gap:3px 5px;margin-top:5px}
 .fps-menu-summary{grid-template-columns:repeat(2,1fr)}
 .fps-result-head{align-items:flex-start;gap:12px}
 .fps-grade{width:66px;height:66px}
 .fps-grade b{font-size:30px}
 .fps-editor-bar button{padding:5px 8px;font-size:10px}
 .fps-help-grid p{font-size:10px}
}
@media(orientation:landscape) and (max-height:460px){
 .fps-feed{top:calc(56px + env(safe-area-inset-top,0px));max-width:29vw}
 .fps-score{top:calc(54px + env(safe-area-inset-top,0px))}
 .fps-menu-summary{grid-template-columns:repeat(5,1fr);margin:6px 0}
 .fps-menu-summary b{font-size:12px}
 .fps-menu-summary div{padding:5px 6px}
 .fps-compass-tape{width:min(180px,30vw)}
 .fps-hint{bottom:calc(84px + env(safe-area-inset-bottom,0px));max-width:54vw;padding:7px 10px}
 .fps-toasts{bottom:calc(124px + env(safe-area-inset-bottom,0px))}
 .fps-tabs{margin-bottom:10px;padding-bottom:6px}
 .fps-settings-tabs{margin-bottom:10px}
 .fps-result-head{margin-bottom:10px}
 .fps-grade{width:62px;height:62px}
 .fps-grade b{font-size:28px}
}
/* ---- v5 layout pass: the grown top-left mission card must not collide with
   the squad row, compass, score column or portrait status strip. ---- */
.fps-keyboard-hint{left:calc(16px + env(safe-area-inset-left,0px));bottom:calc(68px + env(safe-area-inset-bottom,0px));transform:none;text-align:left;max-width:190px;white-space:normal;line-height:1.5;font-size:8px;opacity:.6}
@media(orientation:landscape) and (max-height:520px){.fps-keyboard-hint{display:none}}
.fps-score{top:calc(110px + env(safe-area-inset-top,0px))}
.fps-feed{top:calc(164px + env(safe-area-inset-top,0px))}
.fps-squad{top:calc(178px + env(safe-area-inset-top,0px))}
@media(orientation:portrait){
 .fps-top-left{width:calc(100% - 112px)}
 .fps-compass{top:calc(166px + env(safe-area-inset-top,0px))}
 .fps-squad{top:calc(188px + env(safe-area-inset-top,0px))}
 .fps-mobility{top:calc(292px + env(safe-area-inset-top,0px));bottom:auto}
 .fps-notice{top:calc(338px + env(safe-area-inset-top,0px))}
 .fps-score{top:calc(110px + env(safe-area-inset-top,0px))}
 .fps-feed{top:calc(162px + env(safe-area-inset-top,0px))}
}
/* kill feed moves to the left rail so it never covers the right-side action
   buttons; short landscape has no safe rail and keeps notices/toasts only. */
.fps-feed{right:auto;left:calc(14px + env(safe-area-inset-left,0px));top:calc(240px + env(safe-area-inset-top,0px));align-items:flex-start;max-width:min(250px,44vw)}
.fps-feed-entry{text-align:left}
@media(orientation:portrait){
 .fps-feed{top:calc(292px + env(safe-area-inset-top,0px));max-width:62vw}
 .fps-feed-entry{font-size:9px;padding:2px 7px;line-height:1.3}
 .fps-notice{top:calc(360px + env(safe-area-inset-top,0px))}
 .fps-mobility{top:auto;bottom:calc(120px + env(safe-area-inset-bottom,0px))}
 .fps-health{left:calc(50% + 6px);right:auto;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));gap:6px}
 .fps-health-track{width:64px}
 .fps-health b{font-size:15px;min-width:26px}
 .fps-ammo{right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(60px + env(safe-area-inset-bottom,0px))}
}
@media(orientation:landscape) and (max-height:460px){
 .fps-feed{display:none}
 .fps-squad{top:calc(152px + env(safe-area-inset-top,0px))}
 .fps-score{top:calc(108px + env(safe-area-inset-top,0px))}
 .fps-feed{top:calc(158px + env(safe-area-inset-top,0px))}
 .fps-compass{top:calc(13px + env(safe-area-inset-top,0px))}
}
`;



/**
 * Input contract: onMove.x = right, onMove.y = forward (-1..1); onLook is raw CSS px.
 * onSettings owns aim sensitivity/inversion in the game; HUD never applies it twice.
 */
export function createFPSHUD({ onAction = () => {}, onMove = () => {}, onLook, onSettings = () => {}, storage } = {}) {
  try { storage ??= globalThis.localStorage; } catch { storage = null; } // Private mode may throw on access.
  let settings = loadControlSettings(storage);
  const style = document.createElement('style'); style.textContent = HUD_CSS + HUD_CSS_V5;
  const root = document.createElement('div'); root.className = 'fps-hud'; root.id = 'fpsHUD';
  root.dataset.paused = 'false'; root.dataset.editing = 'false'; root.dataset.ads = 'false';
  root.innerHTML = `
    <div class="fps-look" aria-hidden="true"></div>
    <div class="fps-live">
      <div class="fps-top-left"><div class="fps-mission-overline"><span class="fps-mission-step">01</span><span>封锁行动 / 当前目标</span></div><div class="fps-objective">搜索商场终端</div><div class="fps-objective-detail">和队友一起获取情报</div><div class="fps-route" aria-label="任务进度"><i class="current"></i><i></i><i></i></div><div class="fps-bearing"></div><div class="fps-threat-status"></div></div>
      <div class="fps-compass" aria-label="朝向"><b>北 000°</b></div>
      <button class="fps-pause" data-action="pause" aria-label="暂停游戏">${svg('pause')}</button>
      <button class="fps-exit-choice" data-action="extract-route" aria-label="切换撤离方式">车辆撤离 ⇄</button>
      <div class="fps-squad"><button class="fps-squad-toggle" data-action="squad-menu" aria-label="队友指令" aria-expanded="false">${svg('squad')}<span class="fps-teammate">回声 · 跟随</span><span class="fps-teammate-health">100</span></button><div class="fps-squad-choices" hidden><button data-action="squad" data-command="follow" aria-pressed="true">跟随</button><button data-action="squad" data-command="hold" aria-pressed="false">守位</button><button data-action="squad" data-command="cover" aria-pressed="false">掩护</button><button data-action="order-panel" aria-label="输入队友指令">指令</button></div></div>
      <div class="fps-controls" aria-label="触屏游戏控制">
        <div class="fps-control fps-stick" data-control="move" role="application" aria-label="左摇杆：移动"><i class="fps-stick-knob"></i><span class="fps-control-label">移动</span></div>
        ${[['fire','开火','按住开火'],['ads','瞄准','切换瞄准'],['reload','换弹','重新装填'],['swap','切枪','切换武器'],['interact','互动','互动或拾取'],['sprint','冲刺','切换持续冲刺'],['crouch','蹲伏','切换蹲伏'],['heal','急救 2','使用急救包'],['jump','跳跃','跳跃'],['melee','近战','近战攻击'],['grenade','手雷 2','投掷手雷']].map(([key,label,aria]) => `<button class="fps-control fps-${key}" data-action="${key}" data-control="${key}" aria-label="${aria}"${['ads','crouch','sprint'].includes(key)?' aria-pressed="false"':''}>${svg(key)}<span class="fps-control-label">${label}</span>${['melee','grenade'].includes(key)?'<i class="fps-cooldown-ring" aria-hidden="true"></i>':''}</button>`).join('')}
      </div>
      <div class="fps-crosshair" aria-hidden="true"><i></i></div><div class="fps-hit-marker" aria-hidden="true"></div><div class="fps-damage" aria-hidden="true"></div>
      <div class="fps-health"><b>100</b><div><small>生命</small><div class="fps-health-track"><i></i></div></div></div>
      <div class="fps-mobility"><span>步行 · 全自动</span><div class="fps-stamina-track" aria-label="冲刺耐力"><i></i></div></div>
      <div class="fps-ammo"><div class="fps-weapon">步枪</div><div class="fps-ammo-numbers"><b>30</b><span> / 120</span></div></div>
      <div class="fps-notice" role="status" aria-live="polite"></div><div class="fps-interact-prompt" hidden></div><div class="fps-extract-progress" hidden><i></i></div>
      <div class="fps-keyboard-hint">WASD 移动 · Shift 冲刺 · 空格 跳跃 · R 换弹 · E 互动 · Q 切枪</div><div class="fps-world-marker"></div><div class="fps-map"></div>
    </div>
    <div class="fps-editor-grid" hidden></div>
    <div class="fps-editor-bar" hidden><div><b>拖动按钮，自定义布局</b><span class="fps-editor-caption">游戏已暂停 · 横竖屏分别保存</span></div><button data-action="editor-cancel">取消</button><button data-action="editor-save">保存</button></div>
    <div class="fps-modal" hidden>
      <section class="fps-dialog" role="dialog" aria-modal="true" aria-label="游戏菜单">
        <div data-panel="menu">
          <div class="fps-menu-intro"><div class="fps-eyebrow">OPERATION / PAUSED</div><h2>行动暂停</h2><p>搜索商场终端，获取酒店情报。<br>在车库接应车与屋顶直升机之间选择。<br>点击冲刺开关后推动摇杆，跳跃独立操作。</p></div>
          <div class="fps-menu-actions"><button class="fps-primary" data-action="resume">继续行动</button><button data-action="settings">操作设置</button><button data-action="editor">调整按键</button><button data-action="firemode" class="fps-firemode">SMG：全自动 ⇄ 两连发</button></div>
          <div class="fps-menu-bottom"><button data-action="restart">重新行动</button><button data-action="exit">返回封面</button></div>
          <form class="fps-order-form"><label for="fpsOrderInput">给队友下达指令</label><div class="fps-order-row"><input id="fpsOrderInput" autocomplete="off" maxlength="120" placeholder="例如：守住这里"><button type="submit">发送</button></div><div class="fps-order-status">支持跟随、守位与掩护指令</div><button class="fps-credits" type="button" data-action="credits" aria-label="素材署名与许可">素材署名 · DJMaesen / ELIZION</button></form>
        </div>
        <div data-panel="settings" hidden><div class="fps-panel-heading"><h2>操作设置</h2><button data-action="menu">返回</button></div><div class="fps-settings-grid">
          <div class="fps-settings-row"><label for="fpsControlScale">按键大小</label><output data-output="scale"></output><input id="fpsControlScale" data-setting="scale" type="range" min="0.8" max="1.4" step="0.05"></div>
          <div class="fps-settings-row"><label for="fpsControlOpacity">按键不透明度</label><output data-output="opacity"></output><input id="fpsControlOpacity" data-setting="opacity" type="range" min="0.3" max="1" step="0.05"></div>
          <div class="fps-settings-row"><label for="fpsAimSensitivity">转向灵敏度</label><output data-output="sensitivity"></output><input id="fpsAimSensitivity" data-setting="sensitivity" type="range" min="0.35" max="2.5" step="0.05"></div>
          <label class="fps-settings-toggle"><input data-setting="invertY" type="checkbox">反转上下视角</label></div>
          <div class="fps-settings-actions"><button class="fps-primary" data-action="editor">拖动调整按键</button><button data-action="reset-controls">恢复默认</button></div><p class="fps-settings-caption">布局按横屏与竖屏分别保存。左侧摇杆移动，右侧空白区域滑动转向。</p>
        </div>
        <div data-panel="lift" hidden><div class="fps-panel-heading"><h2>选择电梯楼层</h2><button data-action="resume">返回行动</button></div><p>走入玻璃轿厢后连续升降，抵达后开门。附近的回声会一起乘梯。</p><div class="fps-lift-stops fps-menu-actions"></div></div>
        <div data-panel="credits" hidden><div class="fps-panel-heading"><h2>素材署名</h2><button data-action="menu">返回</button></div><div class="fps-credits-content">
          <article><h3>SMG-45 / 贴图手臂</h3><p>“fps animated smg” · DJMaesen<br>采用源模型手套、布料袖子与 SMG 原生换弹动画。</p><a href="https://sketchfab.com/3d-models/fps-animated-smg-ea3dad7478624495a5a46f40127b0579" target="_blank" rel="noopener">DJMaesen 原始作品</a><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0 许可</a><p>改动：移动端贴图缩放与 JPEG 重编码，第一人称位置、后坐力、切枪与手枪换弹呈现。保留源几何。手枪握持姿态继承 AetherRadar / Operation Steel Tide 的适配。</p></article>
          <article><h3>Desert Eagle</h3><p>“Desert Eagle” · ELIZION</p><a href="https://sketchfab.com/3d-models/desert-eagle-cabde59f5cf24effaf80536e35d04e95" target="_blank" rel="noopener">ELIZION 原始作品</a><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0 许可</a><p>改动：贴图缩放与 JPEG 重编码、统一呈现比例、基于源分件制作弹匣和套筒运动。保留源几何。</p></article>
          <article><h3>人物与环境</h3><a href="https://github.com/microsoft/Microsoft-Rocketbox" target="_blank" rel="noopener">Microsoft Rocketbox · MIT</a><p>原人物网格与贴图经图集整理、移动端压缩和程序步态适配。</p><a href="https://polyhaven.com/license" target="_blank" rel="noopener">Poly Haven 材质 · CC0</a><p>使用本地保存的 PBR 材质并调整贴图编码与映射。用户提供的酒店套房模型保留原作者权益。</p></article>
          <p>上述枪械与手臂资源保留 CC BY 4.0 许可，与本项目软件代码许可分开。</p><a class="fps-online-credits" href="./credits.html" target="_blank" rel="noopener" hidden>查看完整在线署名</a>
        </div></div>
        <div data-panel="result" hidden><div class="fps-result-layout"><div><div class="fps-eyebrow fps-result-eyebrow">OPERATION COMPLETE</div><h2 class="fps-result-title">撤离成功</h2><p class="fps-result-subtitle"></p></div><div class="fps-result-stats"></div><div class="fps-result-actions"><button class="fps-primary" data-action="restart">再来一局</button><button data-action="exit">返回封面</button></div></div></div>
      </section>
    </div>`;
  document.head.append(style); document.body.append(root);
  const $ = selector => root.querySelector(selector);
  // ---- v5 layers: injected here so the legacy template/CSS stays intact ----
  $('.fps-top-left').insertAdjacentHTML('beforeend', TOP_LEFT_EXTRA_HTML);
  $('.fps-health > div').insertAdjacentHTML('beforeend', ARMOR_HTML);
  $('.fps-compass').insertAdjacentHTML('beforeend', '<div class="fps-compass-tape" aria-hidden="true"></div>');
  $('.fps-live').insertAdjacentHTML('beforeend', HUD_LIVE_EXTRA_HTML);
  $('[data-panel="menu"]').innerHTML = PAUSE_MENU_HTML;
  $('[data-panel="settings"]').innerHTML = SETTINGS_PANEL_HTML;
  $('[data-panel="result"]').innerHTML = RESULT_PANEL_HTML;
  $('[data-panel="credits"]').insertAdjacentHTML('beforebegin', HELP_PANEL_HTML);
  $('.fps-dialog').insertAdjacentHTML('afterbegin', PAUSE_TABS_HTML);
  $('.fps-editor-bar').innerHTML = EDITOR_BAR_HTML;
  $('.fps-editor-grid').insertAdjacentHTML('afterend', '<i class="fps-editor-snap" hidden></i>');
  $('.fps-online-credits').hidden = !/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[?::1\]?$)/.test(location.hostname);
  const controls = Object.fromEntries(CONTROL_KEYS.map(key => [key, $(`[data-control="${key}"]`)]));
  const arena = $('.fps-controls');
  const abort = new AbortController();
  const listen = (target, event, handler, options = {}) => target.addEventListener(event, handler, { ...options, signal: abort.signal });
  const refs = {
    timer: $('.fps-timer'), intelFound: $('.fps-intel-found'), intelTotal: $('.fps-intel-total'), difficulty: $('.fps-difficulty'),
    bonus: $('.fps-bonus-row'), bonusText: $('.fps-bonus-text'), bonusBar: $('.fps-bonus-bar i'),
    armorRow: $('.fps-armor-row'), armorFill: $('.fps-armor-track i'), armorValue: $('.fps-armor-value'),
    compassTape: $('.fps-compass-tape'), feed: $('.fps-feed'), scoreValue: $('.fps-score-value'),
    scoreMult: $('.fps-score-mult'), scoreStreak: $('.fps-score-streak'),
    arcs: $('.fps-damage-arcs'), arc: $('.fps-damage-arcs i'), lowhp: $('.fps-lowhp'),
    hint: $('.fps-hint'), hintText: $('.fps-hint-text'), toasts: $('.fps-toasts'),
    grenadeLabel: $('.fps-grenade .fps-control-label'), meleeLabel: $('.fps-melee .fps-control-label'),
    summaryTime: $('.fps-summary-time'), summaryScore: $('.fps-summary-score'), summaryIntel: $('.fps-summary-intel'),
    summaryBonus: $('.fps-summary-bonus'), summaryDifficulty: $('.fps-summary-difficulty'),
    grade: $('.fps-grade'), gradeValue: $('.fps-grade b'), resultMeta: $('.fps-result-meta'), snap: $('.fps-editor-snap'),
  };
  // Values reflected in the pause summary and the new HUD chips. Only written
  // when the source snapshot actually provides a field (all v5 fields optional).
  const stats = { time: 0, score: 0, streak: 0, multiplier: 1, bestStreak: 0, kills: 0, intelFound: 0, intelTotal: 0,
    bonusDone: false, bonusProgress: 0, bonusTitle: '', bonusAvailable: true, difficulty: '', heading: 0,
    compassMarks: [], hintId: '', toastId: '', armor: 0 };
  let feedKey = '', compassKey = '', summaryKey = '', hintTimer = 0, arcTimer = 0, settingsSaveTimer = 0, settingsSection = 'ops';
  const setText = (node, value) => { if (!node) return; const next = String(value); if (node.textContent !== next) node.textContent = next; };
  const setStyle = (node, prop, value) => { if (!node) return; if (node.style[prop] !== value) node.style[prop] = value; };
  const setVar = (node, name, value) => { if (!node) return; if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value); };
  const held = new Map();
  let paused = false, editing = false, disposed = false, resultVisible = false, editBackup = null;
  let lookPointer = null, lookLast = null, stickPointer = null, drag = null, fireLook = null;
  let ads = false, crouching = false, sprintRequested = false, lastInteract = '', lastMessage = '', noticeTimer = 0, hitTimer = 0, damageTimer = 0;
  let previousFocus = null;
  const orientation = () => innerWidth > innerHeight ? 'landscape' : 'portrait';
  const saveSettings = () => { saveControlSettings(storage, settings); };
  function emitSettings() { onSettings(normalizeControlSettings(settings)); }
  /** Apply immediately (the game needs live sensitivity/volume) but debounce storage writes. */
  function commitSettings(message) {
    settings = normalizeControlSettings(settings);
    applySettings(false);
    emitSettings();
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(() => { if (disposed) return; saveSettings(); if (message) notify(message, 1600); }, 550);
  }
  function activateSettingsSection(section) {
    settingsSection = SETTINGS_SECTIONS[section] ? section : 'ops';
    for (const node of root.querySelectorAll('[data-settings-section]')) node.hidden = node.dataset.settingsSection !== settingsSection;
    for (const tab of root.querySelectorAll('[data-settings-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.settingsTab === settingsSection));
  }
  function resetSettingsSection(section) {
    const defaults = normalizeControlSettings();
    for (const key of SETTINGS_SECTIONS[section] || []) settings[key] = defaults[key];
    activateSettingsSection(section);
    commitSettings();
    notify('已恢复本区默认设置', 1800);
  }
  function renderSummary() {
    const intel = stats.intelTotal ? `${stats.intelFound}/${stats.intelTotal}` : String(stats.intelFound);
    const bonus = stats.bonusDone ? '已完成' : stats.bonusProgress > 0 ? `${Math.round(clamp(stats.bonusProgress, 0, 1) * 100)}%` : '未完成';
    const difficulty = stats.difficulty || '标准';
    const key = `${formatClock(stats.time)}|${stats.score}|${intel}|${bonus}|${difficulty}`;
    if (key === summaryKey) return;
    summaryKey = key;
    setText(refs.summaryTime, formatClock(stats.time)); setText(refs.summaryScore, stats.score);
    setText(refs.summaryIntel, intel); setText(refs.summaryBonus, bonus); setText(refs.summaryDifficulty, difficulty);
  }
  function renderFeed(entries) {
    if (!refs.feed) return;
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'fps-feed-entry';
      row.dataset.tone = entry?.tone || 'system';
      row.textContent = String(entry?.text ?? '');
      fragment.append(row);
    }
    refs.feed.replaceChildren(fragment);
  }
  function renderCompassMarks(marks, heading) {
    if (!refs.compassTape) return;
    const list = Array.isArray(marks) ? marks.slice(0, 6).map(mark => ({
      kind: ['objective', 'ally', 'extraction'].includes(mark?.kind) ? mark.kind : 'objective',
      bearing: ((numeric(mark?.bearing, 0) % 360) + 360) % 360,
    })) : [];
    const rounded = Math.round(((numeric(heading, 0) % 360) + 360) % 360 / 3) * 3;
    const key = `${rounded}|${list.map(mark => `${mark.kind}:${Math.round(mark.bearing / 3)}`).join(',')}`;
    if (key === compassKey) return;
    compassKey = key;
    const labels = { objective: '目标', ally: '队友', extraction: '撤离' };
    refs.compassTape.replaceChildren(...list.map(mark => {
      const delta = ((mark.bearing - rounded + 540) % 360) - 180;
      const node = document.createElement('span');
      node.className = 'fps-compass-mark'; node.dataset.kind = mark.kind; node.textContent = labels[mark.kind] || '';
      node.style.left = `${clamp(50 + delta / 60 * 50, 3, 97)}%`;
      node.hidden = Math.abs(delta) > 64;
      return node;
    }));
  }
  function showDamageArc(angle) {
    if (disposed || !refs.arcs || !settings.damageIndicators) return;
    const degrees = (((numeric(angle, 0) * 180 / Math.PI) % 360) + 360) % 360;
    if (refs.arc) refs.arc.style.setProperty('--arc-angle', `${degrees.toFixed(1)}deg`);
    refs.arcs.classList.add('on');
    clearTimeout(arcTimer);
    arcTimer = setTimeout(() => { if (!disposed) refs.arcs?.classList.remove('on'); }, 700);
  }
  function toast(message, tone = 'pickup') {
    if (disposed || !message || !refs.toasts) return;
    while (refs.toasts.children.length >= 3) refs.toasts.firstElementChild.remove();
    const entry = document.createElement('div');
    entry.className = 'fps-toast'; entry.dataset.tone = tone; entry.textContent = String(message);
    refs.toasts.append(entry);
    setTimeout(() => { if (!disposed) entry.remove(); }, 3000);
  }
  function showHint(id, message) {
    if (disposed || !message || !refs.hint) return;
    if (id) stats.hintId = String(id);
    if (!settings.hints) return;
    setText(refs.hintText, message);
    refs.hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { if (!disposed && refs.hint) refs.hint.hidden = true; }, 10000);
  }
  function hideHint() {
    clearTimeout(hintTimer);
    if (refs.hint) refs.hint.hidden = true;
    stats.hintId = '';
  }
  function updateEditorSize() {
    const node = $('.fps-editor-size'); if (!node) return;
    const selected = root.querySelector('.fps-control.is-selected') || drag?.control;
    if (!editing || !selected) { setText(node, ''); return; }
    const rect = selected.getBoundingClientRect();
    setText(node, `${selected.dataset.control || ''} · ${Math.round(rect.width)}×${Math.round(rect.height)} px`);
  }
  function layoutControls() {
    if (disposed) return;
    const bounds = arena.getBoundingClientRect();
    const mode = orientation();
    root.dataset.orientation = mode;
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    // Pure geometry from hud.js keeps the two v5 buttons clear of every other
    // target at 140% scale; saved custom positions always win.
    const defaults = layoutControlDefaults(mode, width, height, settings.scale);
    for (const key of CONTROL_KEYS) {
      const node = controls[key];
      if (!node) continue;
      const desired = settings.positions[mode][key] || defaults[key] || { x: .5, y: .5 };
      const pos = clampControlPosition(desired, width, height, node.getBoundingClientRect());
      node.style.left = `${pos.x * 100}%`; node.style.top = `${pos.y * 100}%`;
    }
    const caption = $('.fps-editor-caption');
    if (caption) caption.textContent = `游戏已暂停 · 当前${mode === 'landscape' ? '横屏' : '竖屏'}布局 · 吸附 2.5%`;
    updateEditorSize();
  }
  function applySettings(persist = true) {
    root.style.setProperty('--fps-scale', settings.scale);
    root.style.setProperty('--fps-opacity', settings.opacity);
    root.style.setProperty('--fps-hud-scale', settings.hudScale);
    root.style.setProperty('--fps-crosshair-size', settings.crosshairSize);
    const crosshairColors = { amber: '#e8b876', white: '#eef6fa', mint: '#9bc9bc', red: '#ff9d8a' };
    root.style.setProperty('--fps-crosshair-color', crosshairColors[settings.crosshairColor] || '#e8b876');
    root.dataset.crosshair = settings.crosshair;
    root.dataset.crosshairColor = settings.crosshairColor;
    root.dataset.killfeed = String(settings.killfeed);
    root.dataset.compass = String(settings.compass);
    root.dataset.hints = String(settings.hints);
    root.dataset.damageIndicators = String(settings.damageIndicators);
    root.dataset.lowhp = String(settings.lowHpVignette);
    if (!settings.hints && refs.hint) refs.hint.hidden = true;
    for (const input of root.querySelectorAll('[data-setting]')) {
      const key = input.dataset.setting;
      if (settings[key] === undefined) continue;
      if (input.type === 'checkbox') input.checked = settings[key] === true;
      else if (input.tagName === 'SELECT') input.value = String(settings[key]);
      else input.value = settings[key];
    }
    for (const output of root.querySelectorAll('[data-output]')) {
      const key = output.dataset.output;
      if (settings[key] !== undefined) setText(output, formatSetting(key, settings[key]));
    }
    for (const preset of root.querySelectorAll('[data-sens-preset]')) preset.setAttribute('aria-pressed', String(Math.abs(settings.sensitivity - numeric(preset.dataset.sensPreset, 1)) < .001));
    layoutControls(); if (persist) saveSettings(); emitSettings();
  }
  function releaseInputs() {
    for (const [key, value] of held) { if (value != null) onAction(key, { pressed: false }); controls[key]?.classList.remove('is-active'); }
    held.clear(); stickPointer = null; lookPointer = null; lookLast = null; fireLook = null;
    $('.fps-stick-knob').style.transform = ''; onMove({ x: 0, y: 0 });
  }
  function setPanel(name) {
    for (const panel of root.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
    const tabs = $('.fps-tabs');
    if (tabs) tabs.hidden = !['menu', 'settings', 'help', 'credits'].includes(name);
    for (const tab of root.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
    if (name === 'settings') activateSettingsSection(settingsSection);
    const labels = { result: '行动结果', settings: '设置', credits: '素材署名', help: '操作说明', lift: '选择楼层' };
    $('.fps-dialog').setAttribute('aria-label', labels[name] || '游戏菜单');
    $('.fps-dialog').scrollTop = 0;
    if (name === 'menu') renderSummary();
    queueMicrotask(() => { if (!disposed && !$('.fps-modal').hidden) $(`[data-panel="${name}"] button`)?.focus({ preventScroll: true }); });
  }
  function setPaused(value, notifyGame = false) {
    paused = !!value;
    if (!paused && editing) finishEditor(true);
    root.dataset.paused = String(paused);
    if (paused) {
      releaseInputs(); previousFocus ||= document.activeElement;
      if (!editing) { $('.fps-modal').hidden = false; if (!resultVisible) setPanel('menu'); }
      $('.fps-squad-choices').hidden = true; $('.fps-squad-toggle').setAttribute('aria-expanded', 'false');
    } else {
      resultVisible = false; $('.fps-modal').hidden = true; $('.fps-dialog').removeAttribute('data-result');
      previousFocus?.focus?.({ preventScroll: true }); previousFocus = null;
    }
    if (notifyGame) onAction('pause', { paused });
  }
  function beginEditor() {
    setPaused(true, true); editing = true; editBackup = normalizeControlSettings(settings);
    root.dataset.editing = 'true'; $('.fps-modal').hidden = true;
    $('.fps-editor-bar').hidden = false; $('.fps-editor-grid').hidden = false;
    if (refs.snap) refs.snap.hidden = true;
    controls.interact.disabled = false; layoutControls();
  }
  function finishEditor(save) {
    if (!editing) return;
    if (!save && editBackup) settings = editBackup;
    editing = false; drag = null; root.dataset.editing = 'false';
    $('.fps-editor-bar').hidden = true; $('.fps-editor-grid').hidden = true;
    if (refs.snap) refs.snap.hidden = true;
    for (const control of Object.values(controls)) control.classList.remove('is-selected');
    applySettings(); controls.interact.disabled = !lastInteract;
    if (paused) { $('.fps-modal').hidden = false; setPanel(save ? 'settings' : 'menu'); }
    editBackup = null;
  }
  function notify(text, duration = 2800) {
    clearTimeout(noticeTimer); $('.fps-notice').textContent = String(text); $('.fps-notice').classList.add('on');
    if (paused) $('.fps-order-status').textContent = String(text);
    noticeTimer = setTimeout(() => $('.fps-notice')?.classList.remove('on'), duration);
  }
  function beginHold(key, pointerId) {
    if (paused || editing || held.has(key)) return;
    held.set(key, pointerId); controls[key].classList.add('is-active'); onAction(key, { pressed: true });
  }
  function endHold(key, pointerId) {
    if (!held.has(key) || (pointerId != null && held.get(key) !== pointerId)) return;
    held.delete(key); controls[key].classList.remove('is-active'); onAction(key, { pressed: false });
    if (key === 'fire') fireLook = null;
  }
  for (const key of ['fire']) {
    const button = controls[key];
    listen(button, 'pointerdown', event => {
      if (paused || editing || event.button > 0) return;
      event.preventDefault(); button.setPointerCapture?.(event.pointerId); beginHold(key, event.pointerId);
      if (key === 'fire' && event.pointerType !== 'mouse') fireLook = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) listen(button, type, event => endHold(key, event.pointerId));
    listen(button, 'keydown', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); beginHold(key, 'keyboard'); } });
    listen(button, 'keyup', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); endHold(key, 'keyboard'); } });
  }
  listen(controls.fire, 'pointermove', event => {
    if (!fireLook || fireLook.pointerId !== event.pointerId || paused || editing) return;
    event.preventDefault(); onLook?.({ dx: event.clientX - fireLook.x, dy: event.clientY - fireLook.y });
    fireLook.x = event.clientX; fireLook.y = event.clientY;
  });
  function moveStick(event) {
    const rect = controls.move.getBoundingClientRect(), radius = rect.width * .34;
    let dx = event.clientX - (rect.left + rect.width / 2), dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy); if (length > radius) { dx *= radius / length; dy *= radius / length; }
    $('.fps-stick-knob').style.transform = `translate(${dx}px,${dy}px)`;
    onMove({ x: dx / radius, y: -dy / radius });
  }
  listen(controls.move, 'pointerdown', event => {
    if (paused || editing || stickPointer !== null || event.button > 0) return;
    event.preventDefault(); stickPointer = event.pointerId; controls.move.setPointerCapture?.(event.pointerId); moveStick(event);
  });
  listen(controls.move, 'pointermove', event => { if (event.pointerId === stickPointer) { event.preventDefault(); moveStick(event); } });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) listen(controls.move, type, event => {
    if (event.pointerId !== stickPointer) return; stickPointer = null; $('.fps-stick-knob').style.transform = ''; onMove({ x: 0, y: 0 });
  });
  const look = $('.fps-look');
  if (typeof onLook !== 'function') look.style.pointerEvents = 'none';
  listen(look, 'pointerdown', event => {
    if (paused || editing || lookPointer !== null || event.pointerType === 'mouse') return;
    event.preventDefault(); lookPointer = event.pointerId; lookLast = [event.clientX, event.clientY]; look.setPointerCapture?.(event.pointerId);
  });
  listen(look, 'pointermove', event => {
    if (event.pointerId !== lookPointer || !lookLast || paused) return;
    event.preventDefault(); onLook?.({ dx: event.clientX - lookLast[0], dy: event.clientY - lookLast[1] }); lookLast = [event.clientX, event.clientY];
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) listen(look, type, event => { if (event.pointerId === lookPointer) { lookPointer = null; lookLast = null; } });
  listen(root, 'contextmenu', event => event.preventDefault());
  // Capture editing gestures before a fire/joystick handler can observe them.
  listen(root, 'pointerdown', event => {
    if (!editing) return;
    const control = event.target.closest('[data-control]'); if (!control) return;
    event.preventDefault(); event.stopImmediatePropagation();
    for (const item of Object.values(controls)) item.classList.toggle('is-selected', item === control);
    const rect = control.getBoundingClientRect();
    drag = { pointerId: event.pointerId, control, key: control.dataset.control, offsetX: event.clientX - rect.left - rect.width / 2, offsetY: event.clientY - rect.top - rect.height / 2 };
    control.setPointerCapture?.(event.pointerId);
    updateEditorSize();
  }, { capture: true });
  listen(root, 'pointermove', event => {
    if (!editing || !drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const rect = arena.getBoundingClientRect();
    const raw = { x: (event.clientX - rect.left - drag.offsetX) / rect.width, y: (event.clientY - rect.top - drag.offsetY) / rect.height };
    // 2.5% grid keeps the layout readably aligned without feeling sticky.
    const snapped = { x: Math.round(raw.x * 40) / 40, y: Math.round(raw.y * 40) / 40 };
    const position = clampControlPosition(snapped, rect.width, rect.height, drag.control.getBoundingClientRect());
    settings.positions[orientation()][drag.key] = position;
    drag.control.style.left = `${position.x * 100}%`; drag.control.style.top = `${position.y * 100}%`;
    if (refs.snap) {
      refs.snap.hidden = false;
      refs.snap.style.left = `${position.x * 100}%`; refs.snap.style.top = `${position.y * 100}%`;
    }
  }, { capture: true });
  for (const type of ['pointerup','pointercancel']) listen(root, type, event => {
    if (drag?.pointerId === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); drag = null; }
    if (refs.snap) refs.snap.hidden = true;
  }, { capture: true });
  listen(root, 'click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    if (editing && !action.startsWith('editor-')) return;
    if (action === 'pause') setPaused(true, true);
    else if (action === 'resume') setPaused(false, true);
    else if (action === 'settings') { setPaused(true, true); setPanel('settings'); }
    else if (action === 'credits') setPanel('credits');
    else if (action === 'help') setPanel('help');
    else if (action === 'tab') setPanel(button.dataset.tab === 'help' ? 'help' : button.dataset.tab || 'menu');
    else if (action === 'settings-tab') activateSettingsSection(button.dataset.settingsTab || 'ops');
    else if (action === 'sens-preset') {
      settings.sensitivity = clamp(numeric(button.dataset.sensPreset, 1), .35, 2.5);
      commitSettings(); notify(`灵敏度：${button.textContent}`, 1500);
    }
    else if (action === 'reset-section') resetSettingsSection(button.dataset.section || 'ops');
    else if (action === 'hint-dismiss') hideHint();
    else if (action === 'firemode') onAction('firemode', {});
    else if (action === 'extract-route') onAction('extract-route', {});
    else if (action === 'lift-stop') onAction('lift', { id: button.dataset.lift, floor: button.dataset.floor });
    else if (action === 'menu') setPanel('menu');
    else if (action === 'editor') beginEditor();
    else if (action === 'editor-save') finishEditor(true);
    else if (action === 'editor-cancel') finishEditor(false);
    else if (action === 'editor-reset') {
      settings.positions[orientation()] = {};
      applySettings(false); layoutControls();
      notify('已重置当前方向按键位置', 1800);
    }
    else if (action === 'reset-controls') {
      settings = normalizeControlSettings(); applySettings(); notify('已恢复全部默认设置');
    }
    else if (action === 'restart') { resultVisible = false; setPaused(false, false); onAction('restart', {}); }
    else if (action === 'exit') { releaseInputs(); onAction('exit', {}); }
    else if (action === 'squad-menu' && !paused) { const menu = $('.fps-squad-choices'); menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); }
    else if (action === 'order-panel') { setPaused(true, true); $('#fpsOrderInput').focus(); }
    else if (action === 'squad' && !paused) {
      const command = button.dataset.command; onAction('squad', { command });
      for (const b of root.querySelectorAll('[data-command]')) b.setAttribute('aria-pressed', String(b.dataset.command === command));
      $('.fps-squad-choices').hidden = true; $('.fps-squad-toggle').setAttribute('aria-expanded', 'false');
    } else if (action === 'ads' && !paused) { ads = !ads; root.dataset.ads = String(ads); button.setAttribute('aria-pressed', String(ads)); onAction('ads', { active: ads }); }
    else if (action === 'sprint' && !paused) { sprintRequested = !sprintRequested; button.setAttribute('aria-pressed', String(sprintRequested)); onAction('sprint', { active: sprintRequested }); }
    else if (action === 'crouch' && !paused) { crouching = !crouching; button.setAttribute('aria-pressed', String(crouching)); onAction('crouch', { active: crouching }); }
    else if (['reload','swap','interact','heal','jump','melee','grenade'].includes(action) && !paused) onAction(action, {});
  });

  listen(root, 'input', event => {
    const input = event.target.closest('[data-setting]'); if (!input) return;
    const key = input.dataset.setting;
    if (input.type === 'checkbox') settings[key] = input.checked;
    else if (input.tagName === 'SELECT') settings[key] = input.value;
    else settings[key] = Number(input.value);
    commitSettings();
  });
  // `input` covers live ranges; `change` re-reads the control so <select> and
  // keyboard-driven checkboxes commit even when only a change event fires.
  listen(root, 'change', event => {
    const input = event.target.closest('[data-setting]'); if (!input) return;
    const key = input.dataset.setting;
    if (input.type === 'checkbox') settings[key] = input.checked;
    else if (input.tagName === 'SELECT') settings[key] = input.value;
    else settings[key] = Number(input.value);
    commitSettings('设置已保存');
  });

  listen($('.fps-order-form'), 'submit', event => {
    event.preventDefault(); const input = $('#fpsOrderInput'); const text = input.value.trim(); if (!text) return;
    onAction('order', { text }); $('.fps-order-status').textContent = `已下达：${text}`; input.value = '';
  });
  listen($('.fps-modal'), 'keydown', event => {
    if (event.key !== 'Tab') return;
    const focusables = [...$('.fps-dialog').querySelectorAll('button,input')].filter(node => node.getClientRects().length && !node.disabled);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  listen(window, 'resize', () => { releaseInputs(); drag = null; layoutControls(); });
  listen(window, 'blur', releaseInputs);
  listen(document, 'visibilitychange', () => { if (document.hidden) { releaseInputs(); if (!paused && !resultVisible) setPaused(true, true); } });
  function update(snapshot = {}) {
    if (disposed) return;
    if (snapshot.hp !== undefined) {
      const hp = Math.max(0, numeric(snapshot.hp, 100)); setText($('.fps-health b'), Math.ceil(hp));
      const ratio = clamp(hp / Math.max(1, numeric(snapshot.maxHp, 100)), 0, 1);
      setStyle($('.fps-health-track i'), 'width', `${ratio * 100}%`);
      $('.fps-health').classList.toggle('low', ratio <= .3);
      if (refs.lowhp) refs.lowhp.classList.toggle('on', settings.lowHpVignette && ratio > 0 && ratio <= .3);
    }
    if (snapshot.ammo !== undefined) setText($('.fps-ammo-numbers b'), snapshot.ammo);
    if (snapshot.reserve !== undefined) setText($('.fps-ammo-numbers span'), ` / ${snapshot.reserve}`);
    if (snapshot.weapon !== undefined) setText($('.fps-weapon'), snapshot.reloading ? '装填中…' : snapshot.weapon);
    $('.fps-ammo').classList.toggle('reloading', !!snapshot.reloading);
    if (snapshot.objective !== undefined) setText($('.fps-objective'), snapshot.objective);
    if (snapshot.detail !== undefined) setText($('.fps-objective-detail'), snapshot.detail);
    if (snapshot.bearing !== undefined || snapshot.distance !== undefined || snapshot.floorLabel !== undefined) {
      const direction = [snapshot.bearing, snapshot.distance != null ? `${Math.round(snapshot.distance)} m` : '', snapshot.floorLabel].filter(Boolean).join(' · ');
      setText($('.fps-bearing'), direction);
    }
    if (snapshot.heading !== undefined) {
      const degrees = ((numeric(snapshot.heading, 0) % 360) + 360) % 360;
      stats.heading = degrees;
      const direction = ['北','东北','东','东南','南','西南','西','西北'][Math.round(degrees / 45) % 8];
      setText($('.fps-compass b'), `${direction} ${String(Math.round(degrees) % 360).padStart(3,'0')}°`);
    }
    if (snapshot.compassMarks !== undefined || snapshot.heading !== undefined) {
      if (Array.isArray(snapshot.compassMarks)) stats.compassMarks = snapshot.compassMarks;
      if (settings.compass) renderCompassMarks(stats.compassMarks, stats.heading);
    }
    if (snapshot.progress !== undefined) {
      const stage = typeof snapshot.progress === 'object' ? numeric(snapshot.progress.current, 0) : numeric(snapshot.progress, 0);
      setText($('.fps-mission-step'), String(Math.min(3, Math.floor(stage) + 1)).padStart(2, '0'));
      [...root.querySelectorAll('.fps-route i')].forEach((node,index) => { node.classList.toggle('complete', index < stage); node.classList.toggle('current', index === Math.floor(stage)); });
    }
    if (snapshot.teammate !== undefined) {
      const mate = snapshot.teammate || {};
      setText($('.fps-teammate'), typeof mate === 'string' ? mate : `${mate.name || '回声'} · ${mate.status || ({ follow:'跟随',hold:'守位',cover:'掩护' }[mate.command]) || '待命'}`);
      setText($('.fps-teammate-health'), typeof mate === 'object' && mate.hp !== undefined ? Math.ceil(mate.hp) : '');
      if (mate.command) for (const button of root.querySelectorAll('[data-command]')) button.setAttribute('aria-pressed', String(button.dataset.command === mate.command));
    }
    if (snapshot.interactLabel !== undefined) {
      lastInteract = snapshot.interactLabel || ''; controls.interact.disabled = !editing && !lastInteract;
      const prompt = $('.fps-interact-prompt'); prompt.hidden = !lastInteract; setText(prompt, lastInteract);
    }
    if (snapshot.extracting !== undefined) {
      const value = typeof snapshot.extracting === 'object' ? snapshot.extracting.progress : snapshot.extracting;
      $('.fps-extract-progress').hidden = value === null || value === false || value < 0;
      setStyle($('.fps-extract-progress i'), 'width', `${clamp(numeric(value, 0), 0, 1) * 100}%`);
    }
    if (snapshot.ads !== undefined) { ads = !!snapshot.ads; root.dataset.ads = String(ads); controls.ads.setAttribute('aria-pressed', String(ads)); }
    if (snapshot.stamina !== undefined) setStyle($('.fps-stamina-track i'), 'width', `${clamp(snapshot.stamina, 0, 100)}%`);
    if (snapshot.movementLabel !== undefined) setText($('.fps-mobility span'), snapshot.movementLabel);
    if (snapshot.sprintRequested !== undefined) { sprintRequested = !!snapshot.sprintRequested; controls.sprint.setAttribute('aria-pressed', String(sprintRequested)); }
    root.dataset.sprinting = String(!!snapshot.sprinting);
    root.dataset.airborne = String(!!snapshot.airborne);
    if (snapshot.sliding !== undefined) root.dataset.sliding = String(!!snapshot.sliding);
    if (snapshot.extractionLabel) setText($('.fps-exit-choice'), `${snapshot.extractionLabel} ⇄`);
    if (snapshot.threatLabel !== undefined) setText($('.fps-threat-status'), snapshot.threatLabel);
    if (snapshot.fireMode) setText($('.fps-firemode'), `SMG：${snapshot.fireMode === 'burst' ? '两连发' : '全自动'} ⇄`);
    if (snapshot.medkits !== undefined) { setText($('.fps-heal .fps-control-label'), snapshot.healing ? '急救中' : `急救 ${snapshot.medkits}`); controls.heal.disabled = !editing && (snapshot.medkits <= 0 || snapshot.healing); }
    if (snapshot.crouching !== undefined) { crouching = !!snapshot.crouching; controls.crouch.setAttribute('aria-pressed', String(crouching)); }
    // ---- v5 snapshot fields (every one optional) ----
    if (snapshot.armor !== undefined) {
      const maxArmor = Math.max(1, numeric(snapshot.maxArmor, 100));
      stats.armor = clamp(numeric(snapshot.armor, stats.armor), 0, maxArmor);
      if (refs.armorRow) refs.armorRow.hidden = false;
      setText(refs.armorValue, Math.ceil(stats.armor));
      setStyle(refs.armorFill, 'width', `${(stats.armor / maxArmor) * 100}%`);
    }
    if (snapshot.grenades !== undefined) {
      stats.grenades = Math.max(0, Math.floor(numeric(snapshot.grenades, 0)));
      setText(refs.grenadeLabel, `手雷 ${stats.grenades}`);
      controls.grenade.classList.toggle('is-empty', stats.grenades <= 0 && !editing);
    }
    if (snapshot.meleeReady !== undefined) {
      const ready = snapshot.meleeReady !== false;
      controls.melee.classList.toggle('cooling', !ready && !editing);
      controls.melee.setAttribute('aria-disabled', String(!ready));
      if (snapshot.meleeCooldown !== undefined) setVar(controls.melee, '--fps-cd', `${clamp(numeric(snapshot.meleeCooldown, 0), 0, 1) * 360}deg`);
    }
    if (snapshot.grenadeCooldown !== undefined) setVar(controls.grenade, '--fps-cd', `${clamp(numeric(snapshot.grenadeCooldown, 0), 0, 1) * 360}deg`);
    if (snapshot.score !== undefined) {
      stats.score = Math.max(0, Math.round(numeric(snapshot.score, stats.score)));
      setText(refs.scoreValue, stats.score);
    }
    if (snapshot.streak !== undefined) {
      stats.streak = Math.max(0, Math.round(numeric(snapshot.streak, stats.streak)));
      setText(refs.scoreStreak, stats.streak > 0 ? `连杀 ${stats.streak}` : '连杀 0');
    }
    if (snapshot.multiplier !== undefined) {
      stats.multiplier = Math.max(1, numeric(snapshot.multiplier, stats.multiplier));
      setText(refs.scoreMult, `×${stats.multiplier.toFixed(1)}`);
    }
    if (snapshot.bestStreak !== undefined) stats.bestStreak = Math.max(0, Math.round(numeric(snapshot.bestStreak, stats.bestStreak)));
    if (Array.isArray(snapshot.feed)) {
      const entries = snapshot.feed.slice(-5);
      const key = entries.map(entry => `${entry?.id ?? ''}:${entry?.text ?? ''}:${entry?.tone ?? ''}`).join('|');
      if (key !== feedKey) { feedKey = key; renderFeed(entries); }
    }
    if (snapshot.intel && typeof snapshot.intel === 'object') {
      stats.intelFound = clamp(Math.round(numeric(snapshot.intel.found, stats.intelFound)), 0, 99);
      stats.intelTotal = Math.max(stats.intelFound, Math.round(numeric(snapshot.intel.total, stats.intelTotal || 5)));
      setText(refs.intelFound, stats.intelFound); setText(refs.intelTotal, stats.intelTotal);
    }
    if (snapshot.bonus !== undefined) {
      const bonus = snapshot.bonus;
      if (bonus && typeof bonus === 'object') {
        stats.bonusTitle = String(bonus.title || '可选目标');
        stats.bonusDone = bonus.done === true;
        stats.bonusAvailable = bonus.available !== false;
        stats.bonusProgress = clamp(numeric(bonus.progress, stats.bonusProgress), 0, 1);
        if (refs.bonus) {
          refs.bonus.hidden = false;
          refs.bonus.classList.toggle('done', stats.bonusDone);
          setText(refs.bonusText, `${stats.bonusTitle} · ${stats.bonusDone ? '已完成' : stats.bonusProgress > 0 ? '进行中' : '可执行'}`);
        }
        if (refs.bonusBar) {
          refs.bonusBar.parentElement.hidden = stats.bonusDone || stats.bonusProgress <= 0;
          setStyle(refs.bonusBar, 'width', `${stats.bonusProgress * 100}%`);
        }
      } else if (refs.bonus) refs.bonus.hidden = true;
    }
    if (snapshot.timer !== undefined || snapshot.elapsed !== undefined) {
      stats.time = Math.max(0, numeric(snapshot.timer, numeric(snapshot.elapsed, stats.time)));
      setText(refs.timer, formatClock(stats.time));
    }
    if (snapshot.difficulty !== undefined) {
      stats.difficulty = difficultyText(snapshot.difficulty) || '标准';
      setText(refs.difficulty, stats.difficulty);
      if (refs.difficulty) refs.difficulty.hidden = false;
    }
    if (snapshot.damageFrom !== undefined && snapshot.damageFrom !== null) showDamageArc(snapshot.damageFrom);
    if (snapshot.hint === null) hideHint();
    else if (snapshot.hint && typeof snapshot.hint === 'object') {
      const hintId = String(snapshot.hint.id || 'hint');
      if (hintId !== stats.hintId && snapshot.hint.text) showHint(hintId, snapshot.hint.text);
    }
    if (snapshot.toast && typeof snapshot.toast === 'object') {
      const toastId = String(snapshot.toast.id ?? '');
      if (toastId && toastId !== stats.toastId) { stats.toastId = toastId; toast(snapshot.toast.text || '', snapshot.toast.tone || 'pickup'); }
    }
    if (snapshot.message && snapshot.message !== lastMessage) { lastMessage = snapshot.message; notify(snapshot.message); }
    if (snapshot.hit) { clearTimeout(hitTimer); $('.fps-hit-marker').classList.add('on'); hitTimer = setTimeout(() => $('.fps-hit-marker')?.classList.remove('on'), 140); }
    if (snapshot.damaged) { clearTimeout(damageTimer); $('.fps-damage').classList.add('on'); damageTimer = setTimeout(() => $('.fps-damage')?.classList.remove('on'), 330); }
    if (paused && resultVisible === false && !$('.fps-modal').hidden) renderSummary();
  }

  function showResult(result = {}) {
    resultVisible = true; if (editing) finishEditor(true); setPaused(true, true); setPanel('result');
    const won = !!result.success;
    $('.fps-dialog').dataset.result = won ? 'success' : 'failure';
    $('.fps-result-eyebrow').textContent = won ? 'EXTRACTION / COMPLETE' : 'OPERATION / ENDED';
    $('.fps-result-title').textContent = result.title || (won ? '撤离成功' : '行动结束');
    $('.fps-result-subtitle').textContent = result.subtitle || (won ? '情报已带回，云澜汇行动完成。' : '调整路线，与队友重新出发。');
    const grade = typeof result.grade === 'string' && /^[SABCD]$/u.test(result.grade) ? result.grade : won ? 'A' : 'D';
    if (refs.grade) refs.grade.dataset.grade = grade;
    setText(refs.gradeValue, grade);
    const seconds = Math.max(0, Math.round(numeric(result.time, 0)));
    const accuracy = clamp(Math.round(numeric(result.accuracy, 0)), 0, 100);
    const intel = typeof result.intel === 'boolean' ? (result.intel ? 2 : 0) : clamp(Math.floor(numeric(result.intel, won ? 2 : 0)), 0, 2);
    const statsRows = [
      ['行动用时', formatClock(seconds)],
      ['击倒目标', result.kills ?? 0], ['命中率', `${accuracy}%`],
      ['发射弹药', result.shots ?? 0], ['获取情报', `${intel}/2`],
      ['队友状态', typeof result.teammate === 'string' ? result.teammate : result.teammate === false ? '倒地' : '存活'],
    ];
    if (result.score !== undefined) statsRows.push(['行动得分', Math.max(0, Math.round(numeric(result.score, 0)))]);
    if (result.bestStreak !== undefined) statsRows.push(['最高连杀', Math.max(0, Math.round(numeric(result.bestStreak, 0)))]);
    if (result.intelFound !== undefined || result.intelTotal !== undefined) {
      statsRows.push(['情报碎片', `${Math.max(0, Math.floor(numeric(result.intelFound, 0)))}/${Math.max(1, Math.floor(numeric(result.intelTotal, 5)))}`]);
    }
    if (result.bonusComplete !== undefined) statsRows.push(['可选目标', result.bonusComplete ? '已完成' : '未完成']);
    const difficulty = result.difficultyLabel || difficultyText(result.difficulty);
    if (difficulty) statsRows.push(['行动难度', difficulty]);
    $('.fps-result-stats').replaceChildren(...statsRows.map(([label,value]) => {
      const item = document.createElement('div'); item.className = 'fps-result-stat';
      const number = document.createElement('b'); number.textContent = String(value);
      const caption = document.createElement('span'); caption.textContent = label; item.append(number,caption); return item;
    }));
    setText(refs.resultMeta, [difficulty ? `难度 ${difficulty}` : '', result.headshots !== undefined ? `精准击杀 ${Math.max(0, Math.round(numeric(result.headshots, 0)))}` : ''].filter(Boolean).join(' · '));
    if (refs.grade) refs.grade.setAttribute('aria-label', `行动评级 ${grade}`);
  }

  applySettings(false); controls.interact.disabled = true;
  function clearResult() {
    resultVisible = false; setPaused(false, false); ads = false; crouching = false; sprintRequested = false; lastMessage = '';
    root.dataset.ads = 'false'; controls.ads.setAttribute('aria-pressed', 'false'); controls.crouch.setAttribute('aria-pressed', 'false');
    $('.fps-hit-marker').classList.remove('on'); $('.fps-damage').classList.remove('on'); $('.fps-notice').classList.remove('on');
    $('.fps-extract-progress').hidden = true; lastInteract = ''; controls.interact.disabled = true;
    // Reset v5 chips so a fresh run starts clean.
    Object.assign(stats, { time: 0, score: 0, streak: 0, multiplier: 1, bestStreak: 0, kills: 0, intelFound: 0, intelTotal: 0,
      bonusDone: false, bonusProgress: 0, bonusTitle: '', bonusAvailable: true, difficulty: '', heading: 0, compassMarks: [], hintId: '', toastId: '', armor: 0 });
    feedKey = ''; compassKey = ''; summaryKey = '';
    setText(refs.timer, '00:00'); setText(refs.intelFound, 0); setText(refs.intelTotal, 5);
    setText(refs.scoreValue, 0); setText(refs.scoreMult, '×1.0'); setText(refs.scoreStreak, '连杀 0');
    if (refs.feed) refs.feed.replaceChildren();
    if (refs.compassTape) refs.compassTape.replaceChildren();
    if (refs.toasts) refs.toasts.replaceChildren();
    if (refs.bonus) refs.bonus.hidden = true;
    if (refs.armorRow) refs.armorRow.hidden = true;
    if (refs.lowhp) refs.lowhp.classList.remove('on');
    if (refs.arcs) refs.arcs.classList.remove('on');
    if (refs.difficulty) refs.difficulty.hidden = true;
    if (refs.grenadeLabel) setText(refs.grenadeLabel, '手雷 2');
    controls.melee.classList.remove('cooling'); controls.grenade.classList.remove('is-empty');
    clearTimeout(hintTimer); clearTimeout(arcTimer); hideHint();
  }

  return {
    root, marker: $('.fps-world-marker'), map: $('.fps-map'), update, setPaused, showResult, clearResult, reset: clearResult, notify,
    toast, showHint, hideHint,
    get settings() { return normalizeControlSettings(settings); },
    get paused() { return paused; }, get editing() { return editing; },
    showSettings() { setPaused(true, true); setPanel('settings'); },
    showHelp() { setPaused(true, true); setPanel('help'); },
    showLiftStops(link, current) {
      setPaused(true, true); setPanel('lift');
      $('.fps-lift-stops').replaceChildren(...link.stops.map(stop => {
        const button = document.createElement('button');
        button.dataset.action = 'lift-stop'; button.dataset.lift = link.id; button.dataset.floor = stop.floor;
        button.textContent = stop.label || stop.floor; button.disabled = stop.floor === current;
        return button;
      }));
    },
    editControls: beginEditor,
    dispose() {
      if (disposed) return; disposed = true; releaseInputs(); abort.abort();
      clearTimeout(noticeTimer); clearTimeout(hitTimer); clearTimeout(damageTimer);
      clearTimeout(hintTimer); clearTimeout(arcTimer); clearTimeout(settingsSaveTimer);
      root.remove(); style.remove();
    },
  };
}

