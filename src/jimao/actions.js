// 零点突围：操作手感补强。原游戏有走、跑、蹲、跳、开镜、近战，但手机上没有蹲和近战的按键，瞄人全靠手搓。这里加：
//   滑铲：跑动中按蹲，贴地滑出去一段（先快后慢，能边滑边打），滑完是蹲着的；
//   翻越：对着沙袋墙、隔离墩、柜台这类矮掩体按跳（或者顶着它往前推一下）就翻过去——镜头抬起前倾、枪放低，半秒落到另一边；
//         墙、栏杆、太厚的东西、另一边没地方站的翻不了；
//   手雷：G 键 / 手机上的手雷键，抛物线扔出去、会弹，2 秒后炸，炸到的敌人掉血（自己站太近也会受伤）；每局 2 颗，开弹药箱补 1 颗；
//   手机按键：蹲（点一下蹲、再点一下站，跑动中点就是滑铲）、近战、手雷，位置和大小在「键位布局」里一样能拖；
//   辅助瞄准（触屏、手柄）：准星贴近敌人时转动变慢（不容易划过头），开火 / 开镜时视角往敌人身上带一点，开镜那一下吸到最近的敌人；
//   自动开火（触屏）：准星压在敌人身上超过一瞬就自己开火，松开自然停。
// 辅助瞄准、自动开火在设置里各有一个开关（存在 zerohour.controls.v1），键鼠默认都不启用。
import * as THREE from 'three';
import { landAt, clear } from '../layout/nav.js';

export const SLIDE = Object.freeze({ time: 0.8, v0: 9, v1: 4.5, cooldown: 0.45, minSpeed: 2.5 });
export const GRENADE = Object.freeze({ count: 2, max: 3, fuse: 2, speed: 16, lift: 4.5, gravity: 16, bounce: 0.38, friction: 0.72, radius: 6.5, damage: 170, selfRadius: 4.5, selfDamage: 55, cooldown: 0.8 });
export const ASSIST = Object.freeze({ cone: 0.16, sticky: 0.062, slow: 0.55, pullFire: 2.2, pullAds: 1.2, snap: 0.7, snapCone: 0.19, range: 60, fireCone: 0.03, fireDelay: 0.12, fireHold: 0.18 });
/** 翻越：前面多近算顶到掩体、掩体最厚多少、翻过去用多久、镜头抬多高、自动翻越要顶住多久 */
export const VAULT = Object.freeze({ reach: 1.15, depth: 2.2, time: 0.55, rise: 0.5, lean: 0.16, clearance: 1.35, auto: 0.18 });
export const CONTROLS_KEY = 'zerohour.controls.v1';

/**
 * 面前能不能翻过去。人在 pos（脚下）、朝 (dx, dz)（单位向量）。规则：
 *   ① 膝盖高度往前 reach 米内顶到东西；② 胸口以上（clearance）往前一路是空的——说明顶到的是矮掩体（沙袋、隔离墩、柜台），不是墙、栏杆；
 *   ③ 掩体后面 depth 米内有同一层、站得住的落脚点。
 * 能翻返回 { x, y, z, dist }（落脚点和水平距离），不能翻返回 null。
 */
export function vaultTarget(physics, nav, pos, dx, dz, floor) {
  const o = new THREE.Vector3(pos.x, pos.y + 0.5, pos.z), d = new THREE.Vector3(dx, 0, dz);
  const low = physics.raycast(o, d, VAULT.reach);
  if (!low || Math.abs(low.normal.y) > 0.5) return null;
  o.y = pos.y + VAULT.clearance;
  if (physics.raycast(o, d, low.dist + VAULT.depth + 0.6)) return null;
  for (let L = low.dist + 0.75; L <= low.dist + VAULT.depth + 1e-6; L += 0.15) {
    const x = pos.x + dx * L, z = pos.z + dz * L, st = landAt(nav, x, z, pos.y + 0.6);
    if (!st || st.slope || Math.abs(st.y - pos.y) > 0.25 || (floor && st.floor !== floor) || !clear(nav, st)) continue;
    // 落脚点再往前半步也得站得住（不然翻过去正好卡在另一件家具的缝里）
    const st2 = landAt(nav, x + dx * 0.3, z + dz * 0.3, pos.y + 0.6);
    if (!st2 || Math.abs(st2.y - pos.y) > 0.25 || !clear(nav, st2)) continue;
    return { x, y: st.y, z, dist: L };
  }
  return null;
}

/** 滑铲这一刻的速度（米/秒）：t 是已经滑了多久 */
export const slideSpeed = (t) => SLIDE.v0 + (SLIDE.v1 - SLIDE.v0) * Math.min(1, Math.max(0, t / SLIDE.time));
/** 手雷炸到 d 米外的东西掉多少血（线性衰减，radius 以外为 0） */
export const blastDamage = (d, radius = GRENADE.radius, damage = GRENADE.damage) => (d >= radius ? 0 : damage * (1 - d / radius));
/** 朝 (dx, dy, dz) 看的视角：原游戏朝 (dx, dz) 看时 yaw = atan2(−dx, −dz)，pitch 向上为正 */
export function aimAngles(dx, dy, dz) { const h = Math.hypot(dx, dz); return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, h) }; }
/** 把角度差收到 (−π, π] */
export const wrapAngle = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
/** 存下来的开关 → 干净的对象。assist / autoFire 为 null 表示按设备默认（触屏开、键鼠关） */
export function normalizeControls(v) {
  const o = { assist: null, autoFire: null };
  if (v && typeof v === 'object') for (const k of ['assist', 'autoFire']) if (typeof v[k] === 'boolean') o[k] = v[k];
  return o;
}

export function createActions(G, { scene, nav = null, ui = null, storage = null, hidden = () => false }) {
  let prefs;
  try { prefs = normalizeControls(JSON.parse(storage?.getItem(CONTROLS_KEY) || 'null')); } catch { prefs = normalizeControls(null); }
  const save = () => { try { storage?.setItem(CONTROLS_KEY, JSON.stringify(prefs)); } catch { /* 存不了就算了 */ } };
  const assisted = () => !!(G.input?.touch || G.input?.gamepad);
  const assistOn = () => prefs.assist ?? assisted();
  const autoFireOn = () => prefs.autoFire ?? !!G.input?.touch;

  // ---- 滑铲 / 蹲 ----
  const slide = { t: -1, dx: 0, dz: 0, cool: 0 };
  let crouchLatch = false; // 手机上的蹲键是点一下切换

  // ---- 翻越 ----
  const vault = { t: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), leaned: 0, push: 0, cool: 0, dx: 0, dz: 0 };
  function tryVault() {
    const p = G.player;
    if (!nav || vault.t >= 0 || vault.cool > 0 || !p?.onGround || slide.t >= 0) return false;
    const st = G.physics.stateOf?.(p.pos);
    if (!st || st.slope) return false;
    const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw), tg = vaultTarget(G.physics, nav, p.pos, dx, dz, st.floor);
    if (!tg) return false;
    vault.t = 0; vault.from.copy(p.pos); vault.to.set(tg.x, tg.y, tg.z); vault.leaned = 0; vault.dx = dx; vault.dz = dz;
    p.mounted = true;
    G.audio?.play?.('jump', { gain: 0.9, pitch: 0.9 });
    G.events?.emit?.('player:vault', { from: vault.from.clone(), to: vault.to.clone() });
    return true;
  }
  function stepVault(dt) {
    const p = G.player, inp = G.input;
    vault.t += dt;
    const k = Math.min(1, vault.t / VAULT.time), e = k * k * (3 - 2 * k), arc = Math.sin(Math.PI * k);
    p.pos.lerpVectors(vault.from, vault.to, e); p.pos.y += arc * VAULT.rise;
    // 身子前倾：视角先往下压再抬回来（只加增量，玩家还能转头）
    const lean = -VAULT.lean * arc; p.pitch += lean - vault.leaned; vault.leaned = lean;
    G.arms?.setLowered?.(Math.min(1, arc * 1.6));
    inp.fire = false; inp.ads = false; if (inp.move) { inp.move.x = 0; inp.move.y = 0; }
    if (k >= 1) {
      vault.t = -1; vault.cool = 0.35; vault.push = 0;
      p.pos.copy(vault.to); p.mounted = false; G.physics.forget?.(p.pos);
      p.vel.set(vault.dx * 3.4, 0, vault.dz * 3.4);
      G.arms?.setLowered?.(0);
      G.audio?.play?.('land', { gain: 0.7 }); p.addShake?.(0.14);
    }
  }

  // ---- 手雷 ----
  const nades = [];
  let stock = GRENADE.count, throwCool = 0, wantThrow = false;
  const nadeGeo = new THREE.SphereGeometry(0.065, 10, 8), nadeMat = new THREE.MeshStandardMaterial({ color: '#3d4a2c', roughness: 0.6, metalness: 0.3 });
  const pinMat = new THREE.MeshStandardMaterial({ color: '#9aa0a4', roughness: 0.4, metalness: 0.8 }), pinGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.05, 8);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  function makeNade() {
    const g = new THREE.Group(); g.add(new THREE.Mesh(nadeGeo, nadeMat)); const pin = new THREE.Mesh(pinGeo, pinMat); pin.position.y = 0.08; g.add(pin);
    g.visible = false; scene.add(g);
    return { mesh: g, vel: new THREE.Vector3(), fuse: 0, live: false, rest: false };
  }
  for (let i = 0; i < 3; i++) nades.push(makeNade());
  function throwNade() {
    const p = G.player, n = nades.find((q) => !q.live);
    if (!n || stock <= 0 || throwCool > 0 || !p?.alive) return false;
    stock--; throwCool = GRENADE.cooldown;
    const cy = Math.cos(p.pitch), dir = v1.set(-Math.sin(p.yaw) * cy, Math.sin(p.pitch), -Math.cos(p.yaw) * cy);
    n.mesh.position.copy(p.eye || p.pos).addScaledVector(dir, 0.45); n.mesh.position.y -= 0.12;
    n.vel.copy(dir).multiplyScalar(GRENADE.speed); n.vel.y += GRENADE.lift; n.vel.x += p.vel.x * 0.6; n.vel.z += p.vel.z * 0.6;
    n.fuse = GRENADE.fuse; n.live = true; n.rest = false; n.mesh.visible = true;
    G.audio?.play?.('reload_magout', { gain: 0.7, pitch: 1.4 });
    G.events?.emit?.('grenade:throw', { pos: n.mesh.position.clone() });
    paintHud();
    return true;
  }
  function explode(n) {
    n.live = false; n.mesh.visible = false;
    const c = n.mesh.position;
    G.fx?.explosion?.(c, 1.6); G.audio?.play?.('explosion', { pos: c, gain: 1 });
    G.render?.lightPool?.flash?.(c, 0xffb060, 60, 18, 0.18);
    const from = v2.set(c.x, c.y + 0.35, c.z);
    let hits = 0;
    for (const e of G.enemies?.list || []) {
      if (!e.alive || !e.active) continue;
      const chest = v3.set(e.pos.x, e.pos.y + 1.1, e.pos.z), d = chest.distanceTo(from), dmg = blastDamage(d);
      if (dmg <= 0 || (d > 1.2 && !G.physics.lineOfSight(from, chest))) continue;
      try { e.damage(dmg, chest.clone(), chest.clone().sub(from).normalize(), 'body'); hits++; } catch (err) { console.error('[零点突围] 手雷伤害出错', err); }
    }
    const p = G.player;
    if (p?.alive && !p.invulnerable) {
      const d = from.distanceTo(p.eye || p.pos);
      if (d < GRENADE.selfRadius && (d < 1.2 || G.physics.lineOfSight(from, p.eye || p.pos))) p.damage(GRENADE.selfDamage * (1 - d / GRENADE.selfRadius), { pos: c.clone(), type: 'grenade' });
      else if (d < 14) p.addShake?.(0.5 * (1 - d / 14));
    }
    if (hits) G.hud?.hitmarker?.(false);
    G.events?.emit?.('grenade:explode', { pos: c.clone(), hits });
  }
  function stepNade(n, dt) {
    n.fuse -= dt;
    if (n.fuse <= 0) { explode(n); return; }
    if (n.rest) return;
    n.vel.y -= GRENADE.gravity * dt;
    const p = n.mesh.position, len = n.vel.length() * dt;
    if (len > 1e-5) {
      const dir = v1.copy(n.vel).normalize(), hit = G.physics.raycast(p, dir, len + 0.07);
      if (hit && hit.dist <= len + 0.07) {
        p.addScaledVector(dir, Math.max(0, hit.dist - 0.07));
        const vn = n.vel.dot(hit.normal);
        n.vel.addScaledVector(hit.normal, -(1 + GRENADE.bounce) * vn);
        const floorHit = Math.abs(hit.normal.y) > 0.5;
        n.vel.x *= GRENADE.friction; n.vel.z *= GRENADE.friction; if (!floorHit) n.vel.y *= GRENADE.friction;
        if (floorHit && Math.abs(n.vel.y) < 1.1) { n.vel.y = 0; if (Math.hypot(n.vel.x, n.vel.z) < 0.6) { n.rest = true; n.vel.set(0, 0, 0); } }
        if (Math.abs(vn) > 2) G.audio?.play?.('shell_bounce', { pos: p, gain: 0.9, pitch: 0.55 });
      } else p.addScaledVector(dir, len);
    }
    n.mesh.rotation.x += dt * 9; n.mesh.rotation.z += dt * 6;
    if (p.y < -60) { n.live = false; n.mesh.visible = false; }
  }

  // ---- 辅助瞄准 / 自动开火 ----
  let target = null, scanT = 0, onTargetT = 0, fireHold = 0, prevAds = false;
  const fwd = new THREE.Vector3(), to = new THREE.Vector3(), chestV = new THREE.Vector3();
  /** 准星附近最合适的敌人：{ enemy, angle, dist, yaw, pitch }；每 0.06 秒找一次，视线只验最好的那个 */
  function findTarget() {
    const p = G.player, eye = p.eye || p.pos, cy = Math.cos(p.pitch);
    fwd.set(-Math.sin(p.yaw) * cy, Math.sin(p.pitch), -Math.cos(p.yaw) * cy);
    let best = null;
    for (const e of G.enemies?.list || []) {
      if (!e.alive || !e.active) continue;
      to.set(e.pos.x - eye.x, e.pos.y + 1.15 - eye.y, e.pos.z - eye.z);
      const d = to.length(); if (d < 0.5 || d > ASSIST.range) continue;
      const ang = Math.acos(Math.min(1, to.dot(fwd) / d));
      // 近处的敌人身子占的角度大：按 0.35 米的身宽放宽一点
      const eff = Math.max(0, ang - Math.atan2(0.35, d));
      if (eff > ASSIST.snapCone) continue;
      if (!best || eff < best.angle) best = { enemy: e, angle: eff, raw: ang, dist: d };
    }
    if (best) {
      chestV.set(best.enemy.pos.x, best.enemy.pos.y + 1.15, best.enemy.pos.z);
      if (!G.physics.lineOfSight(eye, chestV)) return null;
      Object.assign(best, aimAngles(chestV.x - eye.x, chestV.y - eye.y, chestV.z - eye.z));
    }
    return best;
  }
  function assist(dt) {
    const p = G.player, inp = G.input;
    if ((scanT -= dt) <= 0) { scanT = 0.06; target = (assistOn() || autoFireOn()) ? findTarget() : null; }
    if (target && (!target.enemy.alive || !target.enemy.active)) target = null;
    const ads = !!inp.ads, adsEdge = ads && !prevAds; prevAds = ads;
    if (target && assistOn()) {
      const dyaw = wrapAngle(target.yaw - p.yaw), dpitch = target.pitch - p.pitch;
      // 开镜那一下：吸过去大半
      if (adsEdge) { p.yaw += dyaw * ASSIST.snap; p.pitch += dpitch * ASSIST.snap; scanT = 0; }
      else if (target.angle < ASSIST.cone) {
        // 贴近时转动变慢（越近越慢）
        if (target.angle < ASSIST.sticky && inp.look) { inp.look.dx *= ASSIST.slow; inp.look.dy *= ASSIST.slow; }
        // 开火 / 开镜时往目标身上带；自己在转动时带得轻（不抢手感）
        const rate = inp.fire ? ASSIST.pullFire : ads ? ASSIST.pullAds : 0;
        if (rate) { const k = Math.min(1, rate * dt) * (1 - 0.5 * target.angle / ASSIST.cone); p.yaw += dyaw * k; p.pitch += dpitch * k; }
      }
    }
    // 自动开火：准星压在敌人身上超过 fireDelay 就开火，离开后再多打 fireHold（免得抖一下就断）
    if (autoFireOn() && inp.touch) {
      // 拿着刀：人到了两米多以内才自己出刀
      const on = !!target && target.angle < ASSIST.fireCone && (G.weapon?.ammo ?? 1) > 0 && G.weapon?.state !== 'reloading' && (G.weapon?.current !== 'knife' || target.dist < 2.4);
      onTargetT = on ? onTargetT + dt : 0;
      if (on && onTargetT >= ASSIST.fireDelay) fireHold = ASSIST.fireHold; else fireHold -= dt;
      if (fireHold > 0) inp.fire = true;
    } else { onTargetT = 0; fireHold = 0; }
  }

  // ---- 界面：手机按键、手雷数量、设置里的两个开关 ----
  let hud = null, btns = null, rows = null;
  function paintHud() {
    if (hud) { hud.textContent = `手雷 ${'●'.repeat(stock)}${'○'.repeat(Math.max(0, GRENADE.count - stock))}`; hud.classList.toggle('empty', stock <= 0); }
    // 手机上数量直接写在手雷键上（右上角是弹药、左上角是任务，没地方再放一行字）
    if (btns?.nade) { btns.nade.querySelector('span').textContent = `手雷 ${stock}`; btns.nade.classList.toggle('empty', stock <= 0); }
  }
  function buildUi() {
    if (!ui || typeof document === 'undefined') return;
    if (!hud) { hud = document.createElement('div'); hud.className = 'jm-nade-hud'; ui.querySelector('.hud')?.appendChild(hud) || ui.appendChild(hud); paintHud(); }
    const touch = ui.querySelector('.touch');
    if (touch && !btns) {
      btns = {};
      for (const [key, label, aria] of [['crouch', '蹲', '蹲下 / 滑铲'], ['melee', '近战', '近战'], ['nade', '手雷', '扔手雷']]) {
        const b = document.createElement('button'); b.className = `t-btn t-${key}`; b.setAttribute('aria-label', aria); b.innerHTML = `<span>${label}</span>`;
        const down = (e) => {
          e.preventDefault(); e.stopPropagation(); b.classList.add('active');
          if (key === 'crouch') { if (G.player?.sprinting) startSlide(); else crouchLatch = !crouchLatch; b.classList.toggle('latched', crouchLatch); }
          else if (key === 'melee') G.input.act?.('touch', 'melee', true);
          else wantThrow = true;
        };
        const up = (e) => { e.preventDefault?.(); b.classList.remove('active'); if (key === 'melee') G.input.act?.('touch', 'melee', false); };
        b.addEventListener('touchstart', down, { passive: false }); b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
        touch.appendChild(b); btns[key] = b;
      }
      paintHud();
    }
    const sens = ui.querySelector('#s-sens')?.closest('.row');
    if (sens && !rows) {
      rows = document.createElement('div'); rows.className = 'jm-ctl';
      rows.innerHTML = `<div class="row"><label>辅助瞄准</label><button class="toggle" data-ctl="assist" aria-pressed="false"><i></i><span></span></button></div>
        <div class="row"><label>自动开火（触屏）</label><button class="toggle" data-ctl="autoFire" aria-pressed="false"><i></i><span></span></button></div>`;
      rows.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ctl]'); if (!b) return;
        const k = b.dataset.ctl; prefs[k] = !(k === 'assist' ? assistOn() : autoFireOn()); save(); paintRows();
      });
      sens.after(rows); paintRows();
    }
  }
  function paintRows() {
    if (!rows) return;
    for (const b of rows.querySelectorAll('[data-ctl]')) { const on = b.dataset.ctl === 'assist' ? assistOn() : autoFireOn(); b.setAttribute('aria-pressed', String(on)); b.querySelector('span').textContent = on ? '开启' : '关闭'; }
  }
  const onKey = (e) => { if (e.code === (G.input?.keyMap?.__grenade || 'KeyG') && !e.repeat && G.game?.state === 'playing') wantThrow = true; };
  if (typeof addEventListener === 'function') addEventListener('keydown', onKey);
  let touchSeen = false;

  function startSlide() {
    const p = G.player;
    if (slide.t >= 0 || slide.cool > 0 || !p?.onGround) return false;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp < 3) return false;
    slide.t = 0; slide.dx = p.vel.x / sp; slide.dz = p.vel.z / sp;
    G.audio?.play?.('step_concrete', { gain: 0.9, pitch: 0.5 });
    p.addShake?.(0.12);
    return true;
  }

  return {
    get slide() { return slide.t >= 0; }, get vaulting() { return vault.t >= 0; }, tryVault, get grenades() { return stock; }, get target() { return target; }, get prefs() { return { ...prefs }; },
    assistOn, autoFireOn, throwNade, startSlide,
    /** 玩家更新之前调（输入已经读完）：滑铲、蹲键、辅助瞄准、自动开火、扔手雷 */
    pre(dt) {
      const p = G.player, inp = G.input;
      if (!touchSeen && inp?.touch) { touchSeen = true; buildUi(); paintRows(); }
      const playing = G.game?.state === 'playing' && p?.alive !== false && !hidden();
      throwCool -= dt; slide.cool -= dt; vault.cool -= dt;
      if (!playing) { slide.t = -1; wantThrow = false; if (vault.t >= 0) { vault.t = -1; p.mounted = false; G.arms?.setLowered?.(0); } return; }
      // 翻越：对着矮掩体按跳；或者顶着它往前推 / 冲刺撞上去 0.18 秒自动翻
      if (vault.t >= 0) { stepVault(dt); return; }
      if (inp.pressed?.('jump') && (inp.move?.y ?? 0) > -0.2 && tryVault()) return;
      const pushing = (inp.move?.y ?? 0) > 0.6 && Math.hypot(p.vel.x, p.vel.z) < 1.2 && p.onGround;
      vault.push = pushing ? vault.push + dt : 0;
      if (vault.push >= VAULT.auto && tryVault()) return;
      // 滑铲：跑动中按下蹲
      if (slide.t < 0 && p.sprinting && inp.pressed?.('crouch')) startSlide();
      if (slide.t >= 0) {
        slide.t += dt;
        const moved = Math.hypot(p.vel.x, p.vel.z);
        if (slide.t >= SLIDE.time || !p.onGround || (slide.t > 0.12 && moved < SLIDE.minSpeed) || inp.pressed?.('jump')) { slide.t = -1; slide.cool = SLIDE.cooldown; if (inp.touch) { crouchLatch = true; btns?.crouch?.classList.add('latched'); } }
        else { const s = slideSpeed(slide.t); p.vel.x = slide.dx * s; p.vel.z = slide.dz * s; inp.crouch = true; inp.sprint = false; if (inp.move) { inp.move.x = 0; inp.move.y = 0; } }
      }
      // 手机上的蹲：点一下切换；起跳或者推满摇杆跑起来就站起来
      if (crouchLatch) { if (inp.pressed?.('jump') || inp.sprint) { crouchLatch = false; btns?.crouch?.classList.remove('latched'); } else inp.crouch = true; }
      if (assisted() || inp.touch) assist(dt); else { target = null; prevAds = !!inp.ads; }
      if (wantThrow) { wantThrow = false; throwNade(); }
    },
    /** 每帧调：推进飞着的手雷 */
    update(dt) { for (const n of nades) if (n.live) stepNade(n, Math.min(dt, 0.05)); },
    /** 捡到补给：加一颗手雷（最多 max 颗） */
    give(n = 1) { const before = stock; stock = Math.min(GRENADE.max, stock + n); paintHud(); return stock - before; },
    reset() { stock = GRENADE.count; throwCool = 0; wantThrow = false; slide.t = -1; slide.cool = 0; if (vault.t >= 0 && G.player) G.player.mounted = false; vault.t = -1; vault.cool = 0; vault.push = 0; crouchLatch = false; btns?.crouch?.classList.remove('latched'); target = null; onTargetT = 0; fireHold = 0;
      for (const n of nades) { n.live = false; n.mesh.visible = false; } paintHud(); },
    buildUi,
    dispose() { if (typeof removeEventListener === 'function') removeEventListener('keydown', onKey); for (const n of nades) n.mesh.removeFromParent(); nadeGeo.dispose(); nadeMat.dispose(); pinGeo.dispose(); pinMat.dispose(); hud?.remove(); rows?.remove(); for (const b of Object.values(btns || {})) b.remove(); },
  };
}

export const ACTIONS_CSS = `
/* 新加的三个手机按键：蹲在瞄准键左边，近战再往左，手雷在交互键上面（右上角留给弹药数） */
.t-crouch { width: 54px; height: 54px; right: calc(194px + var(--sar)); bottom: calc(26px + var(--sab)); }
.t-crouch.latched { background: rgba(232, 228, 218, .82); color: var(--ink); }
.t-melee { width: 50px; height: 50px; right: calc(260px + var(--sar)); bottom: calc(28px + var(--sab)); }
.t-nade { width: 54px; height: 54px; right: calc(176px + var(--sar)); bottom: calc(178px + var(--sab)); border-color: #b9d27a; color: #d7ec9c; }
.jm-nade-hud { position: absolute; right: calc(22px + var(--sar, 0px)); bottom: calc(150px + var(--sab, 0px)); z-index: 3; pointer-events: none; font: 600 12px/1 var(--f-label, sans-serif); letter-spacing: .14em; color: var(--bone, #e8e4da); text-shadow: 0 1px 4px rgba(0, 0, 0, .7); }
.jm-nade-hud.empty { opacity: .45; }
.is-touch .jm-nade-hud { display: none; }
.t-nade.empty { opacity: .4; }
.jm-ctl .toggle { justify-self: start; }
`;
