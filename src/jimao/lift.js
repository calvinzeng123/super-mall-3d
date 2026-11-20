// 零点突围：坐电梯。走到任何一部电梯门口，选好楼层就出发：
//   电脑：Z 往上选一层、X 往下选一层（按住连着选），停手 0.6 秒出发；手机：屏幕下方正中的 ▲ ▼ 一样。
//   路线指引正好要坐这部电梯时，第一下直接跳到指引要去的那层。
// 有轿厢的电梯（商场、酒店、公寓的客梯和观光梯，漫游模式那一套 ctx.elevatorCars）是真坐：
//   人走到门正前方 → 走进轿厢 → 门关上 → 轿厢带着人走（玻璃轿厢看得见楼层一层层过去，楼层屏跟着变）→ 到站开门 → 走出去。
//   时间线用漫游的 layout/elevator-ride.js（走进去 0.9 秒、关门 0.65 秒、每 7 米 1 秒、开门 0.65 秒、走出来 0.9 秒）。
// 没建轿厢的（货梯等）还是老办法：画面压暗，正中显示楼层，一层 0.55 秒。
// 坐的时候人不能走、不挨打，但可以转头看。坐载具（直升机、接应车）时不显示。
// 电梯的停靠层来自导航网格（layout/nav.js 的 lift 链接：每部电梯每一层门口一个 stop）。
import { createElevatorRide, sampleElevatorRide } from '../layout/elevator-ride.js';

/** 门口多近算「在电梯口」（米）、每层用时（秒）、坐电梯时画面压暗到多少 */
export const LIFT = Object.freeze({ reach: 2.4, perFloor: 0.55, dim: 0.62, scan: 0.2, settle: 0.6 });

/** 楼层 id → 给人看的名字：「H-12F」→「12F」，「P1-B1M」→「B1M」，「WPG-G」→「G」 */
export function floorLabel(layout, id) {
  const lv = layout?.levels?.find((l) => l.id === id);
  return lv?.short || String(id).split('-').slice(1).join('-') || String(id);
}

/** (floor, x, z) 附近的电梯口：返回 { link, i, d }（i 是这一层在 link.stops 里的序号），没有就 null */
export function liftAt(lifts, floor, x, z, reach = LIFT.reach) {
  let best = null;
  for (const link of lifts) {
    const i = link.stops.findIndex((s) => s.floor === floor);
    if (i < 0) continue;
    const s = link.stops[i], d = Math.hypot(s.x - x, s.z - z);
    if (d <= reach && (!best || d < best.d)) best = { link, i, d };
  }
  return best;
}

/** 门口朝外的视角：stop.face 是门的外法线（x, z）。原游戏的 yaw：朝 (dx, dz) 看时 yaw = atan2(−dx, −dz) */
export const faceYaw = (stop) => (stop?.face ? Math.atan2(-stop.face[0], -stop.face[1]) : null);

export function createLiftControl(G, { nav, layout, root = null, hidden = () => false, post = null, keys = { up: 'KeyZ', down: 'KeyX' }, cars = null, guide = null }) {
  const lifts = (nav?.links || []).filter((l) => l.kind === 'lift' && l.stops?.length > 1);
  // 楼面高度从导航网格取（室外的 ground、天桥 bridge 这些不是楼层记录，也有高度）
  const elev = (id) => nav.floors.get(id)?.y ?? layout.levels.find((l) => l.id === id)?.elev ?? 0;
  const held = { up: false, down: false }, tapped = { up: false, down: false };
  let near = null, pick = null, ride = null, scanT = 0, el = null, upB = null, downB = null, label = null, big = null, strip = null, repeatT = 0;

  if (root && typeof document !== 'undefined') {
    el = document.createElement('div'); el.className = 'jm-lift off';
    el.innerHTML = `<div class="jm-lift-card"><b></b><div class="jm-lift-floors"></div><span class="jm-lift-hint"></span></div>
      <button class="jm-lift-btn" data-d="up" aria-label="往上选一层">▲</button><button class="jm-lift-btn" data-d="down" aria-label="往下选一层">▼</button>`;
    label = el.querySelector('b'); strip = el.querySelector('.jm-lift-floors'); upB = el.querySelector('[data-d=up]'); downB = el.querySelector('[data-d=down]');
    for (const b of [upB, downB]) {
      const d = b.dataset.d;
      const on = (e) => { e.preventDefault(); e.stopPropagation(); if (!held[d]) tapped[d] = true; held[d] = true; };
      const off = (e) => { e.preventDefault?.(); held[d] = false; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
      b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('touchend', off);
    }
    big = document.createElement('div'); big.className = 'jm-lift-big off';
    root.appendChild(el); root.appendChild(big);
  }
  const onKey = (down) => (e) => {
    const d = e.code === keys.up ? 'up' : e.code === keys.down ? 'down' : null;
    if (!d) return;
    if (down && !held[d] && !e.repeat) tapped[d] = true;
    held[d] = down;
    if (down && (near || ride)) e.preventDefault();
  };
  const kd = onKey(true), ku = onKey(false);
  if (typeof addEventListener === 'function') { addEventListener('keydown', kd); addEventListener('keyup', ku); }

  /** 把人放到这部电梯第 i 层的门口 */
  function place(link, i, faceOut) {
    const s = link.stops[i], p = G.player.pos;
    p.set(s.x, elev(s.floor), s.z);
    G.player.vel?.set?.(0, 0, 0);
    G.physics?.forget?.(p);
    if (faceOut) { const y = faceYaw(s); if (y != null) { G.player.yaw = y; G.player.pitch = 0; } }
  }

  function show(on) { if (el && el.classList.contains('off') === on) el.classList.toggle('off', !on); }
  function paint() {
    if (!el) return;
    const at = ride || near;
    if (!at) return;
    const stops = at.link.stops, here = ride ? ride.from : near.i, want = ride ? ride.to : (pick?.i ?? near.i);
    label.textContent = `${at.link.name || '电梯'} · ${floorLabel(layout, stops[here].floor)}${want !== here ? ` → ${floorLabel(layout, stops[want].floor)}` : ''}`;
    // 楼层条：从高到低，当前层描边、选中的那层点亮（层数多时只显示选中层上下各三层）
    const lo = Math.max(0, Math.min(want - 3, stops.length - 7)), hi = Math.min(stops.length - 1, lo + 6);
    let html = '';
    for (let i = hi; i >= lo; i--) html += `<i class="${i === want ? 'sel' : ''}${i === here ? ' here' : ''}">${floorLabel(layout, stops[i].floor)}</i>`;
    strip.innerHTML = html;
    const touch = G.input?.touch || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    el.querySelector('.jm-lift-hint').textContent = ride ? '' : touch ? '点 ▲ ▼ 选楼层，停手就出发' : `${keys.up.replace('Key', '')} / ${keys.down.replace('Key', '')} 选楼层，停手就出发`;
    upB.disabled = !!ride || want >= stops.length - 1; downB.disabled = !!ride || want <= 0;
    if (big) {
      big.textContent = ride && !ride.car ? `${ride.dir > 0 ? '▲' : '▼'} ${floorLabel(layout, stops[ride.shown ?? here].floor)}` : '';
      big.classList.toggle('off', !(ride && !ride.car));
    }
  }

  /** 选楼层：往 dir 方向挪一层；第一下如果路线指引正好要坐这部电梯去那个方向，直接跳到指引要去的那层 */
  function choose(dir) {
    const stops = near.link.stops;
    if (!pick) {
      pick = { i: near.i, t: 0 };
      const want = guide?.hint?.to, gi = want ? stops.findIndex((s) => s.floor === want) : -1;
      if (gi >= 0 && Math.sign(gi - near.i) === dir) { pick.i = gi; pick.t = 0; paint(); return; }
    }
    pick.i = Math.max(0, Math.min(stops.length - 1, pick.i + dir)); pick.t = 0;
    paint();
  }

  function start(to) {
    const link = near.link, from = near.i, e = link.elevator, car = cars?.get?.(link.id) || null, p = G.player.pos;
    if (to === from) return;
    const a = link.stops[from], b = link.stops[to];
    ride = { link, from, to, dir: Math.sign(to - from), t: 0, car, shown: from, wasInv: !!G.player.invulnerable };
    G.player.mounted = true; G.player.invulnerable = true;
    G.hud?.message?.('', 0);
    if (car && e) {
      // 真轿厢（漫游模式用的那一套，layout/elevator-ride.js 的时间线）：走到门正前方 → 进轿厢 → 关门 → 运行 → 开门 → 走出去
      const fromS = { floor: a.floor, x: p.x, z: p.z, y: elev(a.floor) }, off = Math.hypot(a.x - p.x, a.z - p.z);
      ride.line = createElevatorRide(fromS, { floor: b.floor, x: b.x, z: b.z, y: elev(b.floor) }, { x: e.x, z: e.z }, off > 0.05 ? { x: a.x, z: a.z, y: fromS.y } : null, e.speed);
      ride.entryYaw = Math.atan2(a.face[0], a.face[1]);  // 面朝轿厢里（门的外法线的反方向）
      ride.exitYaw = Math.atan2(-b.face[0], -b.face[1]); // 面朝门外
      ride.yaw0 = G.player.yaw; ride.turned = 0; ride.door = 1;
      G.audio?.play?.('ui_click', { gain: 0.8, pitch: 0.7 });
    }
    pick = null;
    paint();
  }
  function finish() {
    const r = ride; ride = null;
    place(r.link, r.to, !r.car);
    if (r.car) r.car.set(elev(r.link.stops[r.to].floor), 1, floorLabel(layout, r.link.stops[r.to].floor));
    G.player.mounted = false; G.player.invulnerable = r.wasInv;
    if (post) post.fade = 0;
    near = { link: r.link, i: r.to, d: 0 };
    paint();
  }
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function rideCar(dt) {
    const r = ride, L = r.line, p = sampleElevatorRide(L, r.t), pl = G.player;
    pl.pos.set(p.x, p.y, p.z); pl.vel?.set?.(0, 0, 0);
    // 视角：进轿厢时转向轿厢里，关门前后转过来面朝门（只加转动的增量，玩家自己还能环顾）
    const align = L.approach ? 0.65 : 0, inK = Math.min(1, r.t / 0.35), turnK = Math.max(0, Math.min(1, (r.t - align - 0.9) / 0.65));
    const s = (k) => k * k * (3 - 2 * k), total = wrap(r.entryYaw - r.yaw0) * s(inK) + wrap(r.exitYaw - r.entryYaw) * s(turnK);
    pl.yaw += total - r.turned; r.turned = total;
    // 楼层屏显示正在经过的那一层；门开合有一声响，到站「叮」一声
    const pass = r.link.stops.reduce((best, st, i) => (Math.abs(elev(st.floor) - p.y) < Math.abs(elev(r.link.stops[best].floor) - p.y) ? i : best), r.shown);
    if (pass !== r.shown) { r.shown = pass; paint(); }
    r.car.set(p.y, p.door, floorLabel(layout, r.link.stops[pass].floor));
    if ((p.door < 1) !== (r.door < 1) && p.door < 1 && !r.closing) { r.closing = true; G.audio?.play?.('reload_bolt', { gain: 0.5, pitch: 0.55 }); }
    if (p.arrived && !r.dinged) { r.dinged = true; G.audio?.play?.('objective', { gain: 0.5, pitch: 1.7 }); G.audio?.play?.('reload_bolt', { gain: 0.45, pitch: 0.6 }); }
    r.door = p.door; r.phase = p.phase; r.y = p.y;
    if (p.done) finish();
  }
  function rideFade(dt) {
    const r = ride, n = Math.abs(r.to - r.from), dur = LIFT.perFloor * n;
    if (post) post.fade = Math.max(post.fade || 0, Math.min(LIFT.dim, r.t * 3));
    const at = r.from + r.dir * Math.min(n, Math.floor(r.t / LIFT.perFloor));
    if (at !== r.shown) { r.shown = at; place(r.link, at, false); paint(); }
    if (r.t >= dur) finish();
  }

  function update(dt) {
    const playing = G.game?.state === 'playing' && G.player?.alive !== false && !hidden();
    const up = tapped.up, down = tapped.down; tapped.up = tapped.down = false;
    if (ride) {
      if (!playing) { finish(); return; }
      ride.t += dt;
      if (ride.car) rideCar(dt); else rideFade(dt);
      return;
    }
    if (!playing || G.player?.mounted) { if (near) { near = null; pick = null; show(false); } return; }
    if ((scanT -= dt) <= 0) {
      scanT = LIFT.scan;
      const st = G.physics?.stateOf?.(G.player.pos);
      const n = st ? liftAt(lifts, st.floor, G.player.pos.x, G.player.pos.z) : null;
      if ((n?.link !== near?.link) || n?.i !== near?.i) { near = n; pick = null; show(!!near); paint(); }
    }
    if (!near) return;
    // 选楼层：点一下挪一层，按住每 0.2 秒连着挪；停手 LIFT.settle 秒就出发
    const dir = up || (held.up && (repeatT -= dt) <= 0) ? 1 : down || (held.down && (repeatT -= dt) <= 0) ? -1 : 0;
    if (dir) { repeatT = up || down ? 0.42 : 0.2; choose(dir); }
    if (pick) {
      if (held.up || held.down) pick.t = 0; else pick.t += dt;
      if (pick.t >= LIFT.settle) { if (pick.i === near.i) { pick = null; paint(); } else start(pick.i); }
    }
  }

  return { update, lifts, get near() { return near; }, get riding() { return !!ride; }, get pick() { return pick ? pick.i : null; },
    /** 正在坐的这一趟：{ id, from, to, pass }（楼层 id；pass 是轿厢正经过的那层）。run.js 拿它决定显示哪几层 */
    get rideInfo() { return ride ? { id: ride.link.id, from: ride.link.stops[ride.from].floor, to: ride.link.stops[ride.to].floor, pass: ride.link.stops[ride.shown ?? ride.from].floor, car: !!ride.car, phase: ride.phase || '', door: ride.door ?? 1 } : null; },
    /** 按一下往上 / 往下选（'up' | 'down'）：手机按键、测试用 */
    press(d) { if (d === 'up' || d === 'down') tapped[d] = true; },
    /** 测试 / 调试：直接选好第 i 层出发 */
    go(i) { if (near && !ride) start(i); },
    reset() { if (ride) finish(); near = null; pick = null; show(false); held.up = held.down = false; tapped.up = tapped.down = false; },
    dispose() { removeEventListener?.('keydown', kd); removeEventListener?.('keyup', ku); el?.remove(); big?.remove(); } };
}

export const LIFT_CSS = `
/* 屏幕下方正中一排：右边是原游戏的开火、跳跃、换弹、瞄准，左边是摇杆，正中下方是空的 */
.jm-lift { position: absolute; left: 50%; bottom: calc(64px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 4; display: flex; gap: 10px; align-items: center; pointer-events: none; }
.jm-lift.off { display: none; }
.jm-lift-card { padding: 7px 11px; border-radius: 8px; background: rgba(11, 13, 15, .72); border: 1px solid rgba(232, 228, 218, .25); color: #e8e4da; font: 13px/1.35 'PingFang SC', 'Microsoft YaHei', sans-serif; text-align: center; white-space: nowrap; }
.jm-lift-card b { display: block; font-weight: 700; color: #ffb347; }
.jm-lift-hint { font-size: 11px; color: rgba(232, 228, 218, .7); }
.jm-lift-floors { display: flex; flex-direction: row-reverse; justify-content: center; gap: 3px; margin: 4px 0 3px; }
.jm-lift-floors i { font-style: normal; min-width: 26px; padding: 2px 4px; border: 1px solid rgba(232, 228, 218, .22); font: 600 11px/1.3 var(--f-mono, monospace); color: rgba(232, 228, 218, .65); }
.jm-lift-floors i.here { border-color: rgba(232, 228, 218, .75); color: #e8e4da; }
.jm-lift-floors i.sel { background: #ffb347; border-color: #ffb347; color: #14110c; }
.jm-lift-btn { pointer-events: auto; width: 58px; height: 58px; flex: none; border-radius: 50%; border: 2px solid rgba(255, 179, 71, .85); background: rgba(11, 13, 15, .6); color: #ffb347; font: 700 24px/1 system-ui, sans-serif; touch-action: none; user-select: none; -webkit-user-select: none; }
.jm-lift-btn:disabled { opacity: .25; }
.jm-lift-big { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 5; pointer-events: none; font: 800 64px/1 system-ui, sans-serif; color: #ffd9a0; text-shadow: 0 2px 18px rgba(0, 0, 0, .7); letter-spacing: .04em; }
.jm-lift-big.off { display: none; }
`;
