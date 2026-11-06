// 电梯按键面板（COP，supertall P0b · SPEC §3.2；纯数据 + HTML 字符串，Node 可测，explore.js 渲染）。
// 停靠层超过 9 个的电梯用按键面板代替原来的一排选项：桌面 6 列、手机 5 列，每键 ≥ 44 px；表头是梯组
// （「高区 · H1 H2 F2 · 32–47F · 不停 2–30F」），按楼层分区分组，当前层高亮。
//   · 避难层只出现在消防电梯的面板上（客梯面板没有它经过的楼层的按钮），按键写「避难层 · 消防/检修专用」、
//     带钥匙图标；平时按下要确认「使用消防员钥匙？」，消防模式下直接可按。
//   · fireOnly 停靠层（e.fireOnly，平时不开门）灰显「消防专用」，消防模式前不能按。
//   · 住宅梯的卡片文字「刷卡乘梯 · 仅可到达本户楼层」（只是说明，游戏里不限制楼层）；房卡梯控按 e.card 写。
// 电梯记录的新字段都按缺省读：e.role（缺省普通客梯）、e.zone、e.card、e.fireOnly、e.speed ?? 3.5。
import { towerRailZones } from './floor-rows.js';

export const KEYPAD_MIN_STOPS = 10;
export const FIRE_ROLES = Object.freeze(['fire', 'fire-service', 'service-fire']);
export const isFireLift = (e) => FIRE_ROLES.includes(e?.role);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (lv) => lv?.levelNumber ?? (/^(\d+)F$/.exec(lv?.short || '') ? +/^(\d+)F$/.exec(lv.short)[1] : null);
const shortId = (e) => String(e.id).replace(new RegExp(`^${e.residentialCore || e.building}-`), '');

/** The bank name of a lift: 低区 / 高区 by zone, else by role, else its label. */
export function bankName(e) {
  if (e.zone === 'high') return '高区';
  if (e.zone === 'low') return '低区';
  if (e.role === 'private-w' || e.role === 'private-e' || e.role === 'residence') return '住户电梯';
  if (isFireLift(e)) return e.role === 'fire' ? '消防电梯' : '消防 / 服务梯';
  if (e.role === 'shuttle') return '穿梭梯';
  if (e.role === 'hotel') return '酒店客梯';
  return (e.label || '客梯').replace(/\s*\d+$/, '');
}
/** Contiguous numbered-floor ranges of a sorted list of floor numbers: [[a, b]…]. */
const ranges = (nums) => nums.reduce((out, n) => { const r = out.at(-1); if (r && n === r[1] + 1) r[1] = n; else out.push([n, n]); return out; }, []);
const fmt = ([a, b]) => (a === b ? `${a}F` : `${a}–${b}F`);

/**
 * Keypad model of lift e (layout record) at nav floor `here`, with `options` = the nav stops reachable now
 * ([{ floor }…], as linksNear gives them). opts.fireMode unlocks refuge and fire-only keys.
 * → { title, card, groups: [{ zone, name, keys: [{ level, label, sub, kind, current, disabled, confirm }] }] (top-down), keys }
 */
export function keypadModel(layout, e, { here = null, options = [], fireMode = false } = {}) {
  const byId = new Map(layout.levels.map((l) => [l.id, l])), fire = isFireLift(e), reach = new Set(options.map((o) => o.floor));
  const stops = [...new Set([...e.serves, ...(e.fireOnly || [])])].map((id) => byId.get(id)).filter(Boolean).sort((a, b) => b.elev - a.elev);
  const keys = [];
  for (const lv of stops) {
    const refuge = lv.kind === 'refuge', fireOnly = !!e.fireOnly?.includes(lv.id) && !e.serves.includes(lv.id);
    if (refuge && !fire) continue;   // passenger keypads have no button for the floors they pass
    const kind = fireOnly ? 'fireOnly' : refuge ? 'refuge' : 'normal', current = lv.id === here;
    const available = current || reach.has(lv.id);
    keys.push({ level: lv.id, label: lv.short, sub: fireOnly ? '消防专用' : refuge ? '避难层 · 消防/检修专用' : '', kind, current,
      disabled: current || (fireOnly ? !(fireMode && available) : !available), confirm: refuge && !fireMode, key: refuge });
  }
  // Zone groups of the tower the lift serves (北苑's lifts stand in P1 but belong to their tower).
  const tower = e.residentialCore || e.building, zones = towerRailZones(layout, tower) || [];
  const groups = [], zoneOf = (id) => zones.find((z) => z.levels.some((l) => l.id === id));
  for (const k of keys) {
    const z = zoneOf(k.level), id = z?.id || `${byId.get(k.level).building}-other`, g = groups.at(-1);
    if (g && g.id === id) g.keys.push(k);
    else groups.push({ id, name: z ? (z.single ? z.name : `${z.name.replace(` ${z.range}`, '')} ${z.range}`) : byId.get(k.level).building === tower ? '' : '裙房 · 地下', keys: [k] });
  }
  // Header: bank · lifts of the same bank · served range · floors it passes.
  const bank = layout.elevators.filter((q) => (q.residentialCore || q.building) === tower && bankName(q) === bankName(e) && (q.zone ?? null) === (e.zone ?? null));
  const above = e.serves.map((id) => byId.get(id)).filter((l) => l && l.building === tower && num(l) != null).map(num).sort((a, b) => a - b);
  const own = layout.levels.filter((l) => l.building === tower && num(l) != null).map(num);
  const served = new Set(above), skipped = own.filter((n) => n > 1 && n >= Math.min(...own) && n < Math.max(...above, 0) && !served.has(n)).sort((a, b) => a - b);
  const span = above.length ? fmt([above[0], above.at(-1)]) : '';
  const pass = ranges(skipped).filter(([a, b]) => b - a >= 1 || skipped.length <= 3).slice(0, 2).map(fmt);
  const title = [bankName(e), bank.map(shortId).join(' '), span, pass.length ? `不停 ${pass.join(' / ')}` : ''].filter(Boolean).join(' · ');
  const residential = e.card === 'resident' || ['private-w', 'private-e', 'residence'].includes(e.role) || !!layout.buildings.find((b) => b.id === tower)?.community;
  const card = e.card === 'room-key' ? `房卡梯控 · ${span}` : residential && !fire ? '刷卡乘梯 · 仅可到达本户楼层' : fire ? '消防电梯 · 避难层须消防员钥匙' : '';
  return { lift: e.id, title, card, groups, keys };
}

/** Keypad HTML (6 columns on desktop, 5 on phones via CSS): group headers, then the floor keys. */
export function keypadHtml(model, { selected = null, buffer = '', confirm = null } = {}) {
  let html = `<div class="kp-head"><b>${esc(model.title)}</b>${model.card ? `<span>${esc(model.card)}</span>` : ''}</div>`;
  if (confirm) {
    return `${html}<div class="kp-confirm"><span>使用消防员钥匙？</span><b>${esc(confirm.label)} 避难层 · 消防/检修专用</b><button type="button" class="kp-yes" data-level="${confirm.level}">确认</button><button type="button" class="kp-no">取消</button></div>`;
  }
  html += `<div class="kp-buffer"${buffer ? '' : ' hidden'}>${esc(buffer)}</div>`;
  for (const g of model.groups) {
    if (g.name) html += `<div class="kp-zone">${esc(g.name)}</div>`;
    html += `<div class="kp-grid">${g.keys.map((k) => `<button type="button" class="kp-key ${k.kind}${k.current ? ' current' : ''}${k.level === selected ? ' sel' : ''}" data-level="${k.level}"${k.disabled ? ' disabled' : ''} title="${esc(k.sub || k.label)}">${k.key ? '<i class="kp-icon">⚿</i>' : ''}<b>${esc(k.label)}</b>${k.sub ? `<small>${esc(k.sub)}</small>` : ''}</button>`).join('')}</div>`;
  }
  return html;
}

/** The key a typed number buffer names ('37' → 37F, 'B2' → B2, 'R' → RF), or null. */
export function keyForBuffer(model, buffer) {
  const q = String(buffer).toUpperCase();
  if (!q) return null;
  return model.keys.find((k) => k.label === q || k.label === `${q}F` || (q === 'R' && k.label === 'RF')) || null;
}

/** Real lift run time (s) for the HUD when the ride carries none: jerk-limited trapezoid at speed v (a = 1.0, j = 1.5). */
export function realRunSeconds(dy, speed = 3.5, accel = 1.0, jerk = 1.5) {
  const d = Math.abs(dy);
  if (d < 1e-9) return 0;
  return (d >= speed * speed / accel ? d / speed + speed / accel : 2 * Math.sqrt(d / accel)) + accel / jerk;
}

/** HUD line of a ride in progress: 「上行 · 32F · 实际约 37 秒」. */
export const rideHud = (phase, toShort, realSeconds) => `${phase} · ${toShort}${realSeconds > 0 ? ` · 实际约 ${Math.round(realSeconds)} 秒` : ''}`;

/** Keypad styles (injected once by explore.js; index.html is not touched). */
export const KEYPAD_CSS = `
.ex-prompt.keypad { max-width: min(560px, calc(100vw - 24px)); max-height: min(70vh, 620px); overflow: auto; flex-direction: column; align-items: stretch; gap: 6px; }
.kp-head { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.kp-head span { opacity: .75; font-size: 12px; }
.kp-zone { margin-top: 4px; font-size: 12px; opacity: .8; }
.kp-grid { display: grid; grid-template-columns: repeat(6, minmax(44px, 1fr)); gap: 6px; }
.kp-key { all: unset; box-sizing: border-box; min-height: 44px; min-width: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 10px; background: var(--chip, #2a3a44); cursor: pointer; text-align: center; line-height: 1.1; }
.kp-key b { font: 700 15px/1.1 var(--font-sign, sans-serif); }
.kp-key small { font-size: 9px; opacity: .85; }
.kp-key:hover:not([disabled]), .kp-key.sel { background: var(--accent, #3aa0ff); color: var(--accent-ink, #fff); }
.kp-key.current { outline: 2px solid var(--accent, #3aa0ff); }
.kp-key.refuge { background: repeating-linear-gradient(135deg, #59636a 0 6px, #4b545a 6px 12px); color: #fff; }
.kp-key.fireOnly, .kp-key[disabled] { opacity: .45; cursor: not-allowed; }
.kp-key.fireOnly { background: #6b3a35; color: #f2dcd6; }
.kp-icon { font-style: normal; font-size: 10px; }
.kp-buffer { font: 700 18px/1 var(--font-sign, sans-serif); letter-spacing: 2px; }
.kp-confirm { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: center; }
.kp-confirm span, .kp-confirm b { grid-column: 1 / -1; }
.kp-confirm button { all: unset; min-height: 44px; display: grid; place-items: center; border-radius: 10px; background: var(--chip, #2a3a44); cursor: pointer; }
.kp-confirm .kp-yes { background: #b5302a; color: #fff; }
.kp-others { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
@media (max-width: 640px) { .kp-grid { grid-template-columns: repeat(5, minmax(44px, 1fr)); } }
`;
