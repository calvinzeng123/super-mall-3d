// 零点突围：坐电梯。以前电梯只是画出来的，只能走楼梯、扶梯上下楼；现在走到任何一部电梯门口：
//   电脑：按住 Z 往上、按住 X 往下（松手就在那一层停）；手机：屏幕下方正中出现 ▲ ▼ 两个按钮，按住一样。
// 坐的时候画面压暗、正中显示楼层，人不能走、不挨打（敌人不会坐电梯，坐电梯是甩开追兵、抢高点的办法）。
// 每过一层约 0.55 秒；到了以后人站在那一层的电梯门口，面朝外。坐载具（直升机、接应车）时不显示。
// 电梯的停靠层来自导航网格（layout/nav.js 的 lift 链接：每部电梯每一层门口一个 stop）。

/** 门口多近算「在电梯口」（米）、每层用时（秒）、坐电梯时画面压暗到多少 */
export const LIFT = Object.freeze({ reach: 2.4, perFloor: 0.55, dim: 0.62, scan: 0.2 });

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

export function createLiftControl(G, { nav, layout, root = null, hidden = () => false, post = null, keys = { up: 'KeyZ', down: 'KeyX' } }) {
  const lifts = (nav?.links || []).filter((l) => l.kind === 'lift' && l.stops?.length > 1);
  // 楼面高度从导航网格取（室外的 ground、天桥 bridge 这些不是楼层记录，也有高度）
  const elev = (id) => nav.floors.get(id)?.y ?? layout.levels.find((l) => l.id === id)?.elev ?? 0;
  const held = { up: false, down: false };
  let near = null, ride = null, scanT = 0, el = null, upB = null, downB = null, label = null, big = null;

  if (root && typeof document !== 'undefined') {
    el = document.createElement('div'); el.className = 'jm-lift off';
    el.innerHTML = `<div class="jm-lift-card"><b></b><span class="jm-lift-hint"></span></div>
      <button class="jm-lift-btn" data-d="up" aria-label="上楼">▲</button><button class="jm-lift-btn" data-d="down" aria-label="下楼">▼</button>`;
    label = el.querySelector('b'); upB = el.querySelector('[data-d=up]'); downB = el.querySelector('[data-d=down]');
    for (const b of [upB, downB]) {
      const d = b.dataset.d;
      const on = (e) => { e.preventDefault(); e.stopPropagation(); held[d] = true; };
      const off = (e) => { e.preventDefault?.(); held[d] = false; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
      b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('touchend', off);
    }
    big = document.createElement('div'); big.className = 'jm-lift-big off';
    root.appendChild(el); root.appendChild(big);
  }
  const onKey = (down) => (e) => {
    if (e.code === keys.up) held.up = down; else if (e.code === keys.down) held.down = down; else return;
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
    const n = at.link.stops.length, i = at.i;
    label.textContent = `${at.link.name || '电梯'} · ${floorLabel(layout, at.link.stops[i].floor)}`;
    el.querySelector('.jm-lift-hint').textContent = (G.input?.touch || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) ? '按住 ▲ ▼ 上下楼' : `按住 ${keys.up.replace('Key', '')} 上楼 · ${keys.down.replace('Key', '')} 下楼`;
    upB.disabled = i >= n - 1; downB.disabled = i <= 0;
    if (big) {
      big.textContent = ride ? `${ride.dir > 0 ? '▲' : '▼'} ${floorLabel(layout, at.link.stops[i].floor)}` : '';
      big.classList.toggle('off', !ride);
    }
  }

  function start(dir) {
    const n = near.link.stops.length, next = near.i + dir;
    if (next < 0 || next >= n) return;
    ride = { link: near.link, i: near.i, dir, t: 0 };
    G.player.mounted = true; ride.wasInv = !!G.player.invulnerable; G.player.invulnerable = true;
    G.hud?.message?.('', 0);
    paint();
  }
  function stop() {
    const r = ride; ride = null;
    place(r.link, r.i, true);
    G.player.mounted = false; G.player.invulnerable = r.wasInv;
    if (post) post.fade = 0;
    near = { link: r.link, i: r.i, d: 0 };
    paint();
  }

  function update(dt) {
    const playing = G.game?.state === 'playing' && G.player?.alive !== false && !hidden();
    if (ride) {
      if (!playing) { stop(); return; }
      ride.t += dt;
      if (post) post.fade = Math.max(post.fade || 0, Math.min(LIFT.dim, ride.t * 3));
      if (ride.t >= LIFT.perFloor) {
        ride.t -= LIFT.perFloor;
        ride.i += ride.dir;
        place(ride.link, ride.i, false);
        paint();
        const want = ride.dir > 0 ? held.up : held.down, end = ride.i + ride.dir < 0 || ride.i + ride.dir >= ride.link.stops.length;
        if (!want || end) stop();
      } else place(ride.link, ride.i, false);
      return;
    }
    if (!playing || G.player?.mounted) { if (near) { near = null; show(false); } return; }
    if ((scanT -= dt) <= 0) {
      scanT = LIFT.scan;
      const st = G.physics?.stateOf?.(G.player.pos);
      const n = st ? liftAt(lifts, st.floor, G.player.pos.x, G.player.pos.z) : null;
      if ((n?.link !== near?.link) || n?.i !== near?.i) { near = n; show(!!near); paint(); }
    }
    if (near && (held.up || held.down)) start(held.up ? 1 : -1);
  }

  return { update, lifts, get near() { return near; }, get riding() { return !!ride; },
    reset() { if (ride) stop(); near = null; show(false); held.up = held.down = false; },
    dispose() { removeEventListener?.('keydown', kd); removeEventListener?.('keyup', ku); el?.remove(); big?.remove(); } };
}

export const LIFT_CSS = `
/* 屏幕下方正中一排：右边是原游戏的开火、跳跃、换弹、瞄准，左边是摇杆，正中下方是空的 */
.jm-lift { position: absolute; left: 50%; bottom: calc(64px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 4; display: flex; gap: 10px; align-items: center; pointer-events: none; }
.jm-lift.off { display: none; }
.jm-lift-card { padding: 7px 11px; border-radius: 8px; background: rgba(11, 13, 15, .72); border: 1px solid rgba(232, 228, 218, .25); color: #e8e4da; font: 13px/1.35 'PingFang SC', 'Microsoft YaHei', sans-serif; text-align: center; white-space: nowrap; }
.jm-lift-card b { display: block; font-weight: 700; color: #ffb347; }
.jm-lift-hint { font-size: 11px; color: rgba(232, 228, 218, .7); }
.jm-lift-btn { pointer-events: auto; width: 58px; height: 58px; flex: none; border-radius: 50%; border: 2px solid rgba(255, 179, 71, .85); background: rgba(11, 13, 15, .6); color: #ffb347; font: 700 24px/1 system-ui, sans-serif; touch-action: none; user-select: none; -webkit-user-select: none; }
.jm-lift-btn:disabled { opacity: .25; }
.jm-lift-big { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 5; pointer-events: none; font: 800 64px/1 system-ui, sans-serif; color: #ffd9a0; text-shadow: 0 2px 18px rgba(0, 0, 0, .7); letter-spacing: .04em; }
.jm-lift-big.off { display: none; }
`;
