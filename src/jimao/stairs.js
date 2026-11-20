// 消防楼梯（防烟楼梯间）的两件事——用户反馈「消防梯一圈圈绕，看着头晕」：
//   1. 楼层标识：每层楼梯口挂一块绿底白字的楼层牌（「3F」），爬到哪一层一眼看得出来；
//   2. 快速上下楼：站在楼梯口按 Z / X（手机 ▲ ▼），画面压黑一秒多，人直接到上一层 / 下一层的楼梯口，不用自己绕那两段折返梯。
//      想自己走照样可以走。附近有敌人时不让用（不然成了逃生按钮）；丧尸围城里被堵住的楼梯也不让用（blocked 回调）。
// 楼梯怎么串起来全看导航里的坡道（nav.slopes 里 kind 为 protected-stair 的那些）：商场、公寓、酒店、北区塔楼都是同一套。
import * as THREE from 'three';
import { toW } from '../layout/geom.js';
import { landAt } from '../layout/nav.js';

export const STAIR = Object.freeze({
  reach: 2.6,     // 离楼梯口这么近才出提示（米）
  pair: 6,        // 同一个楼梯间里「上去的口」和「下去的口」最多隔这么远
  time: 1.3,      // 快速上 / 下一层用时（秒）
  fade: 0.3,      // 压黑、亮起各用多久
  out: 0.7,       // 到了以后站在离梯段口多远的地方
  safe: 9,        // 这么近有敌人就不让用
  signUp: 2.3, signOut: 0.55, signW: 0.62, signH: 0.34, // 楼层牌：离地、离梯段口、宽、高
  showWithin: 26, // 离人这么远以内的楼层牌才画
});

/**
 * 把防烟楼梯串成一段段「从这一层到上一层」：
 * [{ id, from, to, y0, y1, a: {x, y, z}（下层楼梯口站位）, b（上层楼梯口站位）, da: {x, z}（下层第一段梯的上行方向）, db（上层最后一段的上行方向）, ea / eb（梯段口本身） }]
 */
export function stairRuns(nav) {
  const prot = nav.slopes.filter((s) => s.kind === 'protected-stair');
  const byLow = new Map();
  for (const s of prot) { if (!byLow.has(s.low)) byLow.set(s.low, []); byLow.get(s.low).push(s); }
  const main = (id) => { const F = nav.floors.get(id); return !!F && !F.stairLanding; };
  const dirOf = (s) => { const [x0, z0] = toW(s.F, 0, 0), [x1, z1] = toW(s.F, s.len, 0), L = Math.hypot(x1 - x0, z1 - z0) || 1; return { x: (x1 - x0) / L, z: (z1 - z0) / L }; };
  // 站位：梯段口往楼面方向退一点；那一点不在这层楼面上（顶着墙）就站在梯段口
  const spot = (floor, ex, ez, y, dx, dz) => {
    for (const d of [STAIR.out, STAIR.out / 2]) {
      const x = ex + dx * d, z = ez + dz * d, s = landAt(nav, x, z, y + 0.6);
      if (s && s.floor === floor && Math.abs(s.y - y) < 0.3) return { x, y, z };
    }
    return { x: ex, y, z: ez };
  };
  const runs = [];
  for (const first of prot) {
    if (!main(first.low)) continue;
    const chain = [first]; let cur = first;
    for (let guard = 0; !main(cur.high) && guard < 8; guard++) {
      const next = (byLow.get(cur.high) || []).find((n) => n !== cur);
      if (!next) break;
      chain.push(next); cur = next;
    }
    if (!main(cur.high)) continue;
    const da = dirOf(first), db = dirOf(cur), [ax, az] = toW(first.F, 0, 0), [bx, bz] = toW(cur.F, cur.len, 0);
    runs.push({ id: first.id, from: first.low, to: cur.high, y0: first.y0, y1: cur.y1, da, db,
      // 这一段经过的梯段和休息平台（丧尸围城：堵住的楼梯靠它认出「人走进了被堵的那段」）
      slopes: chain.map((c) => c.id), landings: chain.slice(0, -1).map((c) => c.high),
      ea: { x: ax, y: first.y0, z: az }, eb: { x: bx, y: cur.y1, z: bz },
      a: spot(first.low, ax, az, first.y0, -da.x, -da.z), b: spot(cur.high, bx, bz, cur.y1, db.x, db.z) });
  }
  return runs;
}

/** 楼层的短名（「3F」「RF」「B1」） */
export function floorLabel(nav, id) { const F = nav.floors.get(id); return F?.level?.short || String(id).split('-').pop(); }

/**
 * 楼层牌摆在哪：每个楼梯口一块，挂在梯段口往楼面方向 signOut 米、离地 signUp 米，牌面朝着梯段（从楼梯上下来 / 上来的人正好看到）。
 * 返回 [{ x, y, z, nx, nz（牌面朝向）, label, floor }]；同一层 1.6 米内只留一块。
 */
export function stairSigns(nav, runs = stairRuns(nav)) {
  const out = [];
  const add = (floor, e, dx, dz) => {
    const x = e.x + dx * STAIR.signOut, z = e.z + dz * STAIR.signOut;
    if (out.some((s) => s.floor === floor && Math.hypot(s.x - x, s.z - z) < 1.6)) return;
    out.push({ x, y: e.y + STAIR.signUp, z, nx: -dx, nz: -dz, label: floorLabel(nav, floor), floor });
  };
  for (const r of runs) { add(r.to, r.eb, r.db.x, r.db.z); add(r.from, r.ea, -r.da.x, -r.da.z); }
  return out;
}

/** 楼层牌的网格：所有牌子合成一个网格，贴图是一张把各个楼层名排成格子的小图（没有 document 时不贴图，测试里只看几何） */
export function buildStairSigns(nav, { runs = stairRuns(nav), doc = typeof document === 'undefined' ? null : document } = {}) {
  const signs = stairSigns(nav, runs), labels = [...new Set(signs.map((s) => s.label))];
  const cols = 8, rows = Math.max(1, Math.ceil(labels.length / cols)), cw = 128, ch = 64;
  let map = null;
  if (doc) {
    const c = doc.createElement('canvas'); c.width = cols * cw; c.height = rows * ch;
    const g = c.getContext('2d');
    if (g) {
      labels.forEach((t, i) => {
        const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
        g.fillStyle = '#0f6b3c'; g.fillRect(x, y, cw, ch);
        g.strokeStyle = '#e9f5ec'; g.lineWidth = 4; g.strokeRect(x + 5, y + 5, cw - 10, ch - 10);
        g.fillStyle = '#ffffff'; g.font = `800 ${t.length > 3 ? 34 : 42}px system-ui, 'PingFang SC', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(t, x + cw / 2, y + ch / 2 + 2);
      });
      map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    }
  }
  // 按楼梯间分组（同一个平面位置 6 米一格）：离人远的整组不画
  const groups = new Map(), root = new THREE.Group(); root.name = 'jm-stair-signs';
  const mat = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : 0x0f6b3c, side: THREE.DoubleSide, toneMapped: false });
  for (const s of signs) { const key = `${Math.round(s.x / 6)},${Math.round(s.z / 6)}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(s); }
  const cells = [];
  for (const list of groups.values()) {
    const pos = [], uv = [], idx = [];
    list.forEach((s, k) => {
      const i = labels.indexOf(s.label), u0 = (i % cols) / cols, v1 = 1 - Math.floor(i / cols) / rows, u1 = u0 + 1 / cols, v0 = v1 - 1 / rows;
      // 牌面的「右」方向：面朝 (nx, nz) 时，观察者看过去的右手边
      const rx = s.nz, rz = -s.nx, hw = STAIR.signW / 2, hh = STAIR.signH / 2;
      // 观察者站在牌面法线那一侧看，左边是 +r 还是 −r 要对：文字从左到右 = 从 +r 到 −r
      pos.push(s.x + rx * hw, s.y - hh, s.z + rz * hw, s.x - rx * hw, s.y - hh, s.z - rz * hw, s.x - rx * hw, s.y + hh, s.z - rz * hw, s.x + rx * hw, s.y + hh, s.z + rz * hw);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; root.add(mesh);
    const cx = list.reduce((a, s) => a + s.x, 0) / list.length, cz = list.reduce((a, s) => a + s.z, 0) / list.length;
    cells.push({ mesh, x: cx, z: cz });
  }
  return { root, signs, labels,
    /** 每隔一会儿调：只画人附近的楼梯间里的牌子 */
    update(p) { for (const c of cells) c.mesh.visible = Math.hypot(c.x - p.x, c.z - p.z) < STAIR.showWithin; },
    dispose() { root.removeFromParent(); for (const c of cells) c.mesh.geometry.dispose(); mat.dispose(); map?.dispose(); } };
}

/**
 * 快速上下楼。press('up' | 'down') 或键盘 Z / X、手机 ▲ ▼。
 * blocked(run, dir) 返回一句话就是不让走的原因（丧尸围城：这段楼梯被堵了）；lift.near 为真时让给电梯（两边都用 Z / X）。
 */
export function createStairControl(G, { nav, scene = null, root = null, hidden = () => false, post = null, lift = null, keys = { up: 'KeyZ', down: 'KeyX' }, blocked = () => null, runs = stairRuns(nav) }) {
  const signs = scene ? buildStairSigns(nav, { runs }) : null;
  if (signs) scene.add(signs.root);
  const byFrom = new Map(), byTo = new Map();
  for (const r of runs) { if (!byFrom.has(r.from)) byFrom.set(r.from, []); byFrom.get(r.from).push(r); if (!byTo.has(r.to)) byTo.set(r.to, []); byTo.get(r.to).push(r); }
  let el = null, ride = null, near = { up: null, down: null }, signT = 0, sig = '', msgT = 0;
  if (root && typeof document !== 'undefined') {
    el = document.createElement('div'); el.className = 'jm-lift jm-stair off';
    el.innerHTML = `<button class="jm-lift-btn" data-d="down" aria-label="下一层">▼</button><div class="jm-lift-card"><b></b><span class="jm-lift-hint"></span></div><button class="jm-lift-btn" data-d="up" aria-label="上一层">▲</button>`;
    root.append(el);
    for (const b of el.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); api.press(b.dataset.d); });
  }
  const onKey = (e) => { if (e.repeat) return; const d = e.code === keys.up ? 'up' : e.code === keys.down ? 'down' : null; if (d) api.press(d); };
  if (typeof addEventListener === 'function') addEventListener('keydown', onKey);

  const usable = () => G.game?.state === 'playing' && !hidden() && !lift?.riding && !lift?.near && G.player?.alive !== false && !G.player?.mounted;
  function scan() {
    // physics.stateOf 只认它一直跟着的那个位置（玩家）；刚传送完、或者测试里没有跟踪时，按坐标现找脚下的楼面
    const p = G.player.pos, s = G.physics.stateOf?.(p) || landAt(nav, p.x, p.z, p.y + 0.6), out = { up: null, down: null };
    if (!s || s.slope) return out;
    let best = STAIR.reach;
    for (const r of byFrom.get(s.floor) || []) { const d = Math.hypot(r.a.x - p.x, r.a.z - p.z, r.ea.y - p.y); if (d < best) { best = d; out.up = r; } }
    best = STAIR.reach;
    for (const r of byTo.get(s.floor) || []) { const d = Math.hypot(r.b.x - p.x, r.b.z - p.z, r.eb.y - p.y); if (d < best) { best = d; out.down = r; } }
    // 同一个楼梯间里上行段的起点和下行段的终点隔着三四米（折返梯的两头）：站在其中一头，另一个方向也给
    if (out.up && !out.down) out.down = (byTo.get(s.floor) || []).find((r) => Math.hypot(r.b.x - out.up.a.x, r.b.z - out.up.a.z) < STAIR.pair) || null;
    else if (out.down && !out.up) out.up = (byFrom.get(s.floor) || []).find((r) => Math.hypot(r.a.x - out.down.b.x, r.a.z - out.down.b.z) < STAIR.pair) || null;
    return out;
  }
  const threat = () => { const p = G.player.pos; return (G.enemies?.list || []).some((e) => e.alive && e.active && Math.abs(e.pos.y - p.y) < 2.6 && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < STAIR.safe); };
  function paint() {
    if (!el) return;
    const on = usable() && !ride && !!(near.up || near.down);
    const here = near.up ? floorLabel(nav, near.up.from) : near.down ? floorLabel(nav, near.down.to) : '';
    const k = `${on}|${here}|${near.up?.id}|${near.down?.id}|${!!G.input?.touch}|${msgT > 0}`;
    el.classList.toggle('off', !on);
    if (!on || k === sig) return;
    sig = k;
    el.querySelector('b').textContent = `楼梯 · ${here}`;
    const up = near.up ? `上 ${floorLabel(nav, near.up.to)}` : '', down = near.down ? `下 ${floorLabel(nav, near.down.from)}` : '';
    el.querySelector('.jm-lift-hint').textContent = G.input?.touch ? [down && `▼ ${down}`, up && `▲ ${up}`].filter(Boolean).join(' · ')
      : [up && `${keys.up.replace('Key', '')} 快速${up}`, down && `${keys.down.replace('Key', '')} 快速${down}`].filter(Boolean).join(' · ');
    el.querySelector('[data-d="up"]').disabled = !near.up; el.querySelector('[data-d="down"]').disabled = !near.down;
    for (const b of el.querySelectorAll('button')) b.style.display = G.input?.touch ? '' : 'none';
  }

  const api = {
    runs, signs,
    get riding() { return !!ride; },
    get near() { return usable() && !!(near.up || near.down); },
    /** 这一刻能上 / 能下的那一段（没有就是 null） */
    get options() { return near; },
    press(dir) {
      if (!usable() || ride) return false;
      near = scan();
      const run = near[dir];
      if (!run) return false;
      const why = blocked(run, dir) || (threat() ? '附近有敌人，没法安心上下楼' : null);
      if (why) { G.hud?.message?.(why, 2.2); return false; }
      ride = { run, dir, t: 0, moved: false, wasInv: !!G.player.invulnerable };
      G.player.mounted = true; G.player.invulnerable = true; G.player.vel?.set?.(0, 0, 0);
      G.arms?.setLowered?.(1);
      G.events?.emit?.('stair:quick', { from: dir === 'up' ? run.from : run.to, to: dir === 'up' ? run.to : run.from, dir });
      return true;
    },
    update(dt) {
      if (signs && (signT -= dt) <= 0) { signT = 0.4; signs.update(G.player.pos); }
      if (ride) {
        ride.t += dt;
        const k = ride.t / STAIR.time, f = STAIR.fade / STAIR.time;
        if (post) post.fade = Math.max(post.fade || 0, k < f ? k / f : k > 1 - f ? Math.max(0, (1 - k) / f) : 1);
        if (!ride.moved && k >= 0.5) {
          ride.moved = true;
          const r = ride.run, up = ride.dir === 'up', at = up ? r.b : r.a, d = up ? r.db : { x: -r.da.x, z: -r.da.z };
          G.player.pos.set(at.x, at.y, at.z); G.player.vel?.set?.(0, 0, 0);
          G.physics.forget?.(G.player.pos); // 换了一层：让物理按新位置重新找脚下的楼面
          G.player.yaw = Math.atan2(-d.x, -d.z); G.player.pitch = 0;
        }
        if (k >= 1) { G.player.mounted = false; G.player.invulnerable = ride.wasInv; G.arms?.setLowered?.(0); ride = null; sig = ''; }
        paint();
        return;
      }
      near = usable() ? scan() : { up: null, down: null };
      paint();
    },
    reset() { if (ride) { G.player.mounted = false; G.player.invulnerable = ride.wasInv; G.arms?.setLowered?.(0); } ride = null; near = { up: null, down: null }; sig = ''; el?.classList.add('off'); },
    dispose() { el?.remove(); signs?.dispose(); if (typeof removeEventListener === 'function') removeEventListener('keydown', onKey); },
  };
  return api;
}

export const STAIRS_CSS = `
.jm-stair .jm-lift-card b { color: #7fd6a2; }
.jm-stair .jm-lift-btn { border-color: rgba(127, 214, 162, .85); color: #7fd6a2; }`;
