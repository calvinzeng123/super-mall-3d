// 零点突围：小地图 + 「下一步怎么走」。
// 以前找路只靠脚下一串蓝箭头：箭头在身后、被柜台挡住、目标在别的楼层时，就不知道该往哪走。
// 左上角加一块圆形小地图（人朝上，随视角转）：这一层的墙线、蓝色的路线、琥珀色的目标（不在范围内时贴在圆边上、
// 在别的楼层时带 ▲▼）、楼梯扶梯（小三角）和电梯（小方块）的位置、刚开过枪的敌人（红点，2.5 秒后淡掉）。
// 小地图下面一行字写下一步：「扶梯上 2F · 24 米」「电梯到 RF · 18 米」（到门口变成「按 Z / X 选楼层」）「目标 · 36 米」。
// 画在 2D 画布上，每秒画 12 次（不跟着帧率画），墙线只在人换了格子（8 米）或换层时重新取。
import { NAV } from '../layout/nav.js';
import { toW } from '../layout/geom.js';
import { floorLabel } from './lift.js';

export const MINIMAP = Object.freeze({ range: 42, size: 148, touchSize: 104, hz: 12, blip: 2.5 });
const KIND_NAME = { escalator: '扶梯', 'interior-stair': '楼梯', 'protected-stair': '楼梯', 'exterior-stair': '楼梯', ramp: '坡道', exit: '出口坡道' };

/** 世界坐标 → 小地图坐标（人在原点、面朝上；返回 [右, 上]，单位米）。原游戏面朝 (−sin yaw, −cos yaw) */
export function toMap(dx, dz, yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); return [dx * c - dz * s, -(dx * s + dz * c)]; }

/** 这一层在 (x, z) 周围 range 米内的墙线（去重）。F 是导航楼面（墙按 8 米一格登记在 F.grid 里） */
export function wallsAround(F, x, z, range) {
  const c = NAV.cell, out = [], seen = new Set();
  for (let gx = Math.floor((x - range) / c); gx <= Math.floor((x + range) / c); gx++) for (let gz = Math.floor((z - range) / c); gz <= Math.floor((z + range) / c); gz++) {
    for (const i of F.grid.get(`${gx},${gz}`) || []) { if (seen.has(i)) continue; seen.add(i); out.push(F.walls[i]); }
  }
  return out;
}

/** 这一层的上下楼设施：[{ kind: 'slope' | 'lift', up, x, z, to }]（楼梯扶梯取在本层的那一头；电梯取门口） */
export function verticalsOn(nav, floorId) {
  const F = nav.floors.get(floorId), out = [];
  if (!F) return out;
  for (const sl of F.slopes || []) {
    if (sl.kind === 'protected-stair') continue; // 消防楼梯太多（每栋塔楼每层一部），画出来全是三角
    const low = sl.low === floorId, [x, z] = toW(sl.F, low ? 0 : sl.len, 0);
    out.push({ kind: 'slope', type: sl.kind, up: low, x, z, to: low ? sl.high : sl.low });
  }
  for (const link of nav.links || []) {
    if (link.kind !== 'lift') continue;
    const s = link.stops?.find((q) => q.floor === floorId);
    if (s && link.stops.length > 1) out.push({ kind: 'lift', x: s.x, z: s.z, name: link.name });
  }
  return out;
}

/**
 * 路线的下一步。pts 是寻路给的一串导航状态（{ floor, x, z, y }，电梯那一跳带 via: 'lift'）。
 * 返回 { kind: 'goal' | 'slope' | 'lift', dist, text, x, y, z, to?, up? }：第一次换楼层的地方和走到那儿的距离；全程同层就是目标。
 */
export function routeHint(nav, layout, pts, goalName = '目标') {
  if (!pts || pts.length < 2) return null;
  const y0 = pts[0].y ?? 0, levelOf = (id) => { const F = nav.floors.get(id); return F?.parentFloor || F?.level?.id || id; };
  let dist = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.via === 'lift') {
      const up = (b.y ?? 0) > (a.y ?? 0);
      return { kind: 'lift', dist, up, to: b.to, x: a.x, y: a.y ?? y0, z: a.z, text: `${b.lift || '电梯'}${up ? '上' : '下'}到 ${floorLabel(layout, b.to)} · ${Math.max(1, Math.round(dist))} 米` };
    }
    // 换了楼层才算（楼梯平台、夹层这些挂在同一层下面的小楼面不算）
    if (levelOf(b.floor) !== levelOf(a.floor)) {
      // 换层：找连着这两层、离 a 最近的那部梯
      let best = null, bd = 6;
      for (const sl of nav.floors.get(a.floor)?.slopes || []) {
        if (!((sl.low === a.floor && sl.high === b.floor) || (sl.high === a.floor && sl.low === b.floor))) continue;
        const [x, z] = toW(sl.F, sl.low === a.floor ? 0 : sl.len, 0), d = Math.hypot(x - a.x, z - a.z);
        if (d < bd) { bd = d; best = sl; }
      }
      const up = (b.y ?? nav.floors.get(b.floor)?.y ?? 0) > (a.y ?? y0) + 0.3, down = (b.y ?? nav.floors.get(b.floor)?.y ?? 0) < (a.y ?? y0) - 0.3;
      if (!best && !up && !down) { dist += Math.hypot(b.x - a.x, b.z - a.z); continue; } // 同一高度穿过门洞（商场接酒店连廊之类）：不算换层
      const name = KIND_NAME[best?.kind] || (up || down ? '楼梯' : '通道');
      return { kind: 'slope', dist, up, to: b.floor, x: a.x, y: a.y ?? y0, z: a.z, text: `${name}${up ? '上' : down ? '下' : '到'} ${floorLabel(layout, levelOf(b.floor))} · ${Math.max(1, Math.round(dist))} 米` };
    }
    dist += Math.hypot(b.x - a.x, b.z - a.z);
  }
  const g = pts.at(-1);
  return { kind: 'goal', dist, x: g.x, y: g.y ?? y0, z: g.z, text: `${goalName} · ${Math.max(1, Math.round(dist))} 米` };
}

export function createMinimap(G, { nav, layout, ui = null, guide = null, hidden = () => false }) {
  let root = null, canvas = null, ctx = null, label = null, hintEl = null, size = MINIMAP.size, px = 1;
  const blips = [];
  let acc = 0, wallKey = '', walls = [], verts = [], lastHint = '';
  if (ui && typeof document !== 'undefined') {
    root = document.createElement('div'); root.className = 'jm-map off';
    root.innerHTML = '<canvas></canvas><b class="jm-map-floor"></b><span class="jm-map-hint"></span>';
    canvas = root.querySelector('canvas'); label = root.querySelector('.jm-map-floor'); hintEl = root.querySelector('.jm-map-hint');
    (ui.querySelector('.hud') || ui).appendChild(root);
    ctx = canvas.getContext('2d');
  }
  const onFire = (e) => { if (e?.pos) { blips.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, t: MINIMAP.blip }); if (blips.length > 24) blips.shift(); } };
  G.events?.on?.('enemy:fire', onFire);

  function resize() {
    const want = G.input?.touch ? MINIMAP.touchSize : MINIMAP.size, ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    if (want === size && canvas.width === Math.round(size * ratio)) return;
    size = want; px = ratio; canvas.width = canvas.height = Math.round(size * ratio); canvas.style.width = canvas.style.height = `${size}px`;
    root.style.setProperty('--jm-map', `${size}px`);
  }

  function draw() {
    const p = G.player, st = G.physics?.stateOf?.(p.pos);
    if (!st) return;
    resize();
    const F = nav.floors.get(st.floor), R = MINIMAP.range, half = canvas.width / 2, k = (half - 2 * px) / R, yaw = p.yaw;
    const key = `${st.floor}/${Math.floor(p.pos.x / NAV.cell)}/${Math.floor(p.pos.z / NAV.cell)}`;
    if (key !== wallKey && F) { wallKey = key; walls = wallsAround(F, p.pos.x, p.pos.z, R + NAV.cell); verts = verticalsOn(nav, st.floor); label.textContent = floorName(st.floor); }
    const P = (x, z) => { const [u, v] = toMap(x - p.pos.x, z - p.pos.z, yaw); return [half + u * k, half - v * k]; };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath(); ctx.arc(half, half, half - px, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(10, 13, 15, 0.62)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 墙线
    ctx.strokeStyle = 'rgba(232, 228, 218, 0.5)'; ctx.lineWidth = Math.max(1, px * 0.9); ctx.beginPath();
    for (const w of walls) { const a = P(w.x0, w.z0), b = P(w.x1, w.z1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    // 楼梯扶梯（三角：朝上 = 上楼）和电梯（方块）
    for (const v of verts) {
      const [x, y] = P(v.x, v.z); if (Math.hypot(x - half, y - half) > half) continue;
      if (v.kind === 'lift') { ctx.fillStyle = '#7dd3ff'; ctx.fillRect(x - 3 * px, y - 3 * px, 6 * px, 6 * px); }
      else { ctx.fillStyle = '#b6f0c8'; const s = 4.5 * px, d = v.up ? -1 : 1; ctx.beginPath(); ctx.moveTo(x, y + d * s); ctx.lineTo(x - s, y - d * s * 0.7); ctx.lineTo(x + s, y - d * s * 0.7); ctx.closePath(); ctx.fill(); }
    }
    // 路线
    const route = guide?.route || [];
    if (route.length > 1) {
      ctx.strokeStyle = 'rgba(120, 220, 255, 0.95)'; ctx.lineWidth = 2.2 * px; ctx.lineJoin = 'round'; ctx.beginPath();
      let pen = false;
      for (const r of route) { if (Math.abs(r.y - p.pos.y) > 2.5) { pen = false; continue; } const [x, y] = P(r.x, r.z); if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; } }
      ctx.stroke();
    }
    // 开过枪的敌人
    for (const b of blips) {
      if (Math.abs(b.y - p.pos.y) > 4) continue;
      const [x, y] = P(b.x, b.z); ctx.globalAlpha = Math.min(1, b.t / 0.8); ctx.fillStyle = '#ff4a3d'; ctx.beginPath(); ctx.arc(x, y, 3.2 * px, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 无人机侦察（三连杀奖励）：这一层附近所有敌人都显示，外加一圈往外扩的扫描线
    if ((G.score?.uav || 0) > 0) {
      ctx.fillStyle = '#ff6a5c';
      for (const e of G.enemies?.list || []) {
        if (!e.alive || !e.active || Math.abs(e.pos.y - p.pos.y) > 4) continue;
        const [x, y] = P(e.pos.x, e.pos.z); if (Math.hypot(x - half, y - half) > half) continue;
        ctx.beginPath(); ctx.arc(x, y, 3 * px, 0, Math.PI * 2); ctx.fill();
      }
      const sweep = ((G.time?.t || 0) % 1.6) / 1.6;
      ctx.strokeStyle = `rgba(255, 179, 71, ${0.55 * (1 - sweep)})`; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(half, half, sweep * half, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // 目标：在范围里画菱形，出了范围贴在圆边上；在别的楼层带 ▲▼
    const tg = guide?.target;
    if (tg) {
      let [x, y] = P(tg.x, tg.z); const d = Math.hypot(x - half, y - half), lim = half - 7 * px;
      if (d > lim) { x = half + (x - half) / d * lim; y = half + (y - half) / d * lim; }
      ctx.fillStyle = '#ffb347'; ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'; ctx.lineWidth = px; const s = 5 * px;
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      const dy = (tg.y ?? p.pos.y) - p.pos.y;
      if (Math.abs(dy) > 2.5) { ctx.font = `${9 * px}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(dy > 0 ? '▲' : '▼', x, y - s - 2 * px); }
    }
    // 人（朝上的箭头）、圆边、北
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(half, half - 6 * px); ctx.lineTo(half + 4.5 * px, half + 5 * px); ctx.lineTo(half, half + 2.5 * px); ctx.lineTo(half - 4.5 * px, half + 5 * px); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(232, 228, 218, 0.55)'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(half, half, half - px, 0, Math.PI * 2); ctx.stroke();
    const [nu, nv] = toMap(0, -1, yaw); // 北 = −z
    ctx.fillStyle = 'rgba(232, 228, 218, 0.9)'; ctx.font = `600 ${9 * px}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('北', half + nu * (half - 9 * px), half - nv * (half - 9 * px));
    // 下一步
    const h = guide?.next, text = h ? (h.kind === 'lift' && h.dist < 4 ? `${h.text.split(' · ')[0]} · ${G.input?.touch ? '点 ▲▼' : '按 Z / X'} 选楼层` : h.text) : '';
    if (text !== lastHint) { lastHint = text; hintEl.textContent = text; hintEl.dataset.kind = h?.kind || ''; }
  }
  function floorName(id) {
    const F = nav.floors.get(id), lv = layout.levels.find((l) => l.id === (F?.parentFloor || F?.level?.id || id)), b = lv && layout.buildings.find((q) => q.id === lv.building);
    if (!lv) return id === 'ground' ? '室外' : floorLabel(layout, id);
    return `${b?.name || ''} ${lv.short || ''}`.trim();
  }

  return {
    root, blips,
    update(dt) {
      for (let i = blips.length - 1; i >= 0; i--) if ((blips[i].t -= dt) <= 0) blips.splice(i, 1);
      if (!root) return;
      const on = G.game?.state === 'playing' && G.player?.alive !== false && !hidden();
      if (root.classList.contains('off') === on) root.classList.toggle('off', !on);
      if (!on) return;
      if ((acc += dt) < 1 / MINIMAP.hz) return;
      acc = 0;
      draw();
    },
    reset() { blips.length = 0; wallKey = ''; lastHint = ''; if (hintEl) hintEl.textContent = ''; },
    dispose() { root?.remove(); },
  };
}

export const MINIMAP_CSS = `
.jm-map { position: absolute; left: var(--gl, 18px); top: calc(14px + var(--sat, 0px)); z-index: 3; width: var(--jm-map, 148px); pointer-events: none; }
.jm-map.off { display: none; }
.jm-map canvas { display: block; border-radius: 50%; }
.jm-map-floor { position: absolute; left: 0; right: 0; top: calc(var(--jm-map, 148px) - 9px); text-align: center; font: 600 11px/1 var(--f-label, sans-serif); letter-spacing: .08em; color: var(--bone, #e8e4da); text-shadow: 0 1px 3px rgba(0, 0, 0, .9); white-space: nowrap; }
.jm-map-hint { display: block; margin: 12px 0 0; width: max-content; max-width: 62vw; padding: 4px 8px; border-left: 2px solid #78dcff; background: rgba(10, 13, 15, .55); font: 600 13px/1.3 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #dff6ff; white-space: nowrap; }
.jm-map-hint:empty { display: none; }
.jm-map-hint[data-kind="goal"] { border-left-color: #ffb347; color: #ffe2b0; }
/* 小地图占了左上角：任务栏挪到它右边 */
.h-obj { left: calc(var(--gl) + 164px) !important; }
.is-touch .h-obj { left: calc(var(--gl) + 118px) !important; max-width: 46vw !important; }
.is-touch .jm-map-hint { margin-top: 44px; font-size: 12px; }
/* 手机横屏：无线电字幕原来在上三分之一处，正好压在任务栏上——挪到准星下面（电梯按键上面） */
.is-touch .comms { top: auto !important; bottom: calc(34% + var(--sab)) !important; }
.is-touch .comms-t { font-size: 15px !important; }
`;
