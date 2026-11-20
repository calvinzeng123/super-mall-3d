// 丧尸围城的两名队友（电脑控制）：不是一个人闯，而是三个人互相照应着往上打。
//   阿哲   商场夜班保安。冲锋枪，射速快；跟得近、血厚；熟悉这栋楼——特殊感染者一露头他先喊出来；你换弹的时候他加紧打。
//   林医生 急诊科医生。手枪，打得慢但准，常打头；跟在后面；你血量见底时跑过来给你包扎（一分钟一次）；队友倒了她去扶。
// 他们跟着你走（落下太远、你坐电梯 / 走楼梯换了层，就直接跟到你身后），自己找目标开火，优先打按住你的扑袭者和特殊感染者。
// 丧尸贴上去会咬他们；血打空就倒地——走到跟前站三秒把人扶起来（半血），不管也会在下一个安全点缓过来。
// 人形用劫持者那副骨架（soldier.js），换成自己的配色；丧尸不专门去追他们，但贴近了会转过去扑咬。
// 这里的开火不走原游戏的「敌人开火」那条路（那条路会算进直升机挨打），直接结算伤害、画弹道。
import * as THREE from 'three';
import { landAt, clear } from '../layout/nav.js';
import { buildParts, RIG } from './soldier.js';

/**
 * follow：站在你身后 [near, far] 米之间，超过 run 米跑着追，超过 warp 米（或不在同一层超过 warpSeconds 秒）直接跟到身后；
 * see：多远以内的丧尸会打；bite：丧尸在 reach 米内每只每秒咬掉 dps；
 * down：倒地后你站在 reach 米内 revive 秒扶起来（回到 hp），林医生去扶要 medic 秒；
 * horde：有队友在场时尸潮的规模乘多少（人多了，来的也多）。
 */
export const SQUAD = Object.freeze({
  follow: Object.freeze({ near: 2.2, far: 4.6, run: 8, warp: 24, warpSeconds: 2.2, walk: 3.4, sprint: 7.2 }),
  see: 24, bite: Object.freeze({ reach: 1.55, dps: 6.5, pull: 5.5 }),
  down: Object.freeze({ revive: 3, reach: 2.1, hp: 50, medic: 4.5 }),
  horde: 1.25,
  members: Object.freeze([
    Object.freeze({ id: 'zhe', name: '阿哲', role: '夜班保安', hp: 130, side: -1, back: 2.6, trait: 'spotter',
      gun: Object.freeze({ name: '冲锋枪', interval: 0.11, burst: [4, 7], rest: [0.55, 1.1], damage: 9, hit: 0.78, falloff: 0.012, head: 0.08, range: 22 }),
      look: Object.freeze({ shirt: 0x1f2a44, pants: 0x1b2030, vest: 0xd8d23a, strap: 0x9aa0a8, pouch: 0x2a3350, helmet: 0xe2c21e, mask: 0x23262b, glove: 0x1c1c1e, boot: 0x17181a, pad: 0x2b3148, heavy: false }) }),
    Object.freeze({ id: 'lin', name: '林医生', role: '急诊科医生', hp: 90, side: 1, back: 4, trait: 'medic',
      gun: Object.freeze({ name: '手枪', interval: 0.5, burst: [1, 3], rest: [0.35, 0.7], damage: 24, hit: 0.9, falloff: 0.008, head: 0.3, range: 26 }),
      heal: Object.freeze({ below: 45, amount: 35, cooldown: 55, reach: 2.2, time: 1.4, range: 16 }),
      look: Object.freeze({ shirt: 0x2f8f8a, pants: 0x2a6f6c, vest: 0xe9ebe6, strap: 0x7fbf9a, pouch: 0xcfd4cf, helmet: 0xf1f1ec, mask: 0x9ad6d0, glove: 0x9fc4e8, boot: 0xe6e6e0, pad: 0x8fc9c4, heavy: false }) }),
  ]),
});

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * 该打哪一只。mate：队友的位置；player：玩家的位置；zombies：[{ pos, special, zs, alive, active }]；pin：正按着玩家的那只（没有是 null）。
 * 排序：按着你的 > 特殊感染者 > 离你近的 > 离他近的。超出 range、不在同一层的不算。纯函数，返回丧尸或 null（看不看得见由调用的人查）。
 */
export function pickTarget(mate, player, zombies, { range = SQUAD.see, pin = null, sees = () => true } = {}) {
  let best = null, bs = Infinity;
  for (const z of zombies) {
    if (!z.alive || !z.active || Math.abs(z.pos.y - mate.y) > 2.6) continue;
    const dm = Math.hypot(z.pos.x - mate.x, z.pos.z - mate.z); if (dm > range) continue;
    const dp = Math.hypot(z.pos.x - player.x, z.pos.z - player.z);
    const score = (z === pin ? -1000 : 0) + (z.special ? -25 : 0) + (z.zs === 'idle' ? 10 : 0) + dp * 1.2 + dm * 0.5;
    if (score < bs && sees(z)) { bs = score; best = z; }
  }
  return best;
}

/** 这一枪打没打中：近处 hit，每远一米少 falloff。纯函数（r 是 0–1 的随机数） */
export const shotHits = (gun, dist, r) => r < clamp(gun.hit - gun.falloff * dist, 0.25, 0.98);

/** 站位：你身后 back 米、往 side 那一侧偏 1.3 米。纯函数，返回 { x, z } */
export function slotOf(player, yaw, member) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // 你面朝的方向
  return { x: player.x - fx * member.back + fz * member.side * 1.3, z: player.z - fz * member.back - fx * member.side * 1.3 };
}

export const SQUAD_CSS = `
.jm-squad { position: absolute; left: calc(22px + var(--sal, 0px)); bottom: calc(124px + var(--sab, 0px)); z-index: 3; pointer-events: none; display: grid; gap: 5px; font: 600 11px/1 var(--f-label, sans-serif); letter-spacing: .1em; color: var(--bone, #e8e4da); text-shadow: 0 1px 4px rgba(0, 0, 0, .7); }
.jm-squad.off { display: none; }
.jm-squad .m { display: grid; grid-template-columns: 54px 84px auto; align-items: center; gap: 7px; }
.jm-squad .m i { display: block; height: 4px; background: rgba(255, 255, 255, .16); border-radius: 2px; overflow: hidden; }
.jm-squad .m i b { display: block; height: 100%; background: #9fe0a8; }
.jm-squad .m.hurt i b { background: #ffd166; }
.jm-squad .m.down i b { background: #ff6a5a; }
.jm-squad .m.down { color: #ff9a8c; }
.jm-squad .m span { opacity: .8; font-weight: 500; }
.is-touch .jm-squad { left: calc(14px + var(--sal, 0px)); bottom: auto; top: calc(196px + var(--sat, 0px)); }
`;

function nameTag(text, color) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 160; c.height = 40;
  const g = c.getContext('2d'); g.font = '600 24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(18, 4, 124, 32); g.fillStyle = color; g.fillText(text, 80, 21);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  sp.scale.set(0.62, 0.155, 1); sp.position.y = 2.02; sp.renderOrder = 5;
  return sp;
}

/**
 * 接到游戏上。zombies：丧尸池（alive()）；siege：围城（state.pin、enabled）；director：任务系统（riding）。
 * 返回 { mates, enabled, reset(), rally()（到安全点：倒地的缓过来、都回满一截）, update(dt), buildUi(), dispose() }。
 */
export function createSquad(G, { scene, nav, zombies, siege = null, director = null, ui = null, rng = Math.random, P = SQUAD } = {}) {
  const group = new THREE.Group(); group.name = 'squad'; scene?.add(group);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, emissive: 0x16181a, name: 'squad' });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xdff2ff, toneMapped: false, fog: false });
  const lampGeo = new THREE.SphereGeometry(0.022, 8, 6);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dir = new THREE.Vector3();
  let enabled = false, hud = null, sayT = 0, wanted = true;
  const say = (who, text, secs = 3) => { if (sayT > 0) return false; sayT = 2.4; G.hud?.radio?.(`${who.name}：${text}`, secs); return true; };

  function make(member, index) {
    const parts = buildParts(member.look);
    const mk = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = false; return m; };
    const root = new THREE.Group(); root.name = 'squad-' + member.id; root.visible = false;
    const body = new THREE.Group(); root.add(body);
    const hips = new THREE.Group(); hips.position.y = RIG.HIP_Y; body.add(hips); hips.add(mk(parts.pelvis));
    const spine = new THREE.Group(); spine.position.y = 0.1; hips.add(spine); spine.add(mk(parts.torso));
    const head = new THREE.Group(); head.position.y = 0.5; spine.add(head); head.add(mk(parts.head));
    const aim = new THREE.Group(); aim.position.set(0, 0.42, 0.02); spine.add(aim); aim.add(mk(parts.aim));
    const muzzle = new THREE.Object3D(); muzzle.position.set(-0.1, -0.08, 0.78); aim.add(muzzle);
    const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.set(0.1, 0.36, 0.16); spine.add(lamp); // 胸前一盏小灯：黑里看得出人在哪
    const legs = [0.092, -0.092].map((x) => {
      const thigh = new THREE.Group(); thigh.position.set(x, -0.07, 0); hips.add(thigh); thigh.add(mk(parts.thigh));
      const shin = new THREE.Group(); shin.position.y = -RIG.THIGH; thigh.add(shin); shin.add(mk(parts.shin));
      return { thigh, shin };
    });
    const tag = nameTag(member.name, index ? '#bfeee8' : '#ffe98a'); if (tag) root.add(tag);
    group.add(root);
    const vel = new THREE.Vector3(), want = new THREE.Vector3();
    const m = {
      member, id: member.id, name: member.name, pos: root.position, root, yaw: 0, speed: 0, hp: member.hp, maxHp: member.hp, alive: true, down: false, active: false,
      target: null, senseT: rng() * 0.3, cool: 0.6, burst: 0, shots: 0, kills: 0, path: null, wp: 0, planT: 0, pathJob: null, awayT: 0, gait: 0, pitch: 0, recoil: 0, lowReady: 1,
      reviveT: 0, healT: 12 + rng() * 8, healing: 0, fallK: 0, muzzle: new THREE.Vector3(), chest: new THREE.Vector3(), parts, hurtT: 0, stuckT: 0, biteSay: 0,
    };

    function place(at, yaw = 0) {
      m.pos.set(at.x, at.y, at.z); m.yaw = yaw; vel.set(0, 0, 0); m.path = null; m.pathJob?.cancel?.(); m.pathJob = null; m.awayT = 0; m.planT = 0;
    }
    /** 跟到你身后站得住的一点（优先你看不见的方向） */
    function warp() {
      const p = G.player; if (!p?.pos) return false;
      const yaw = p.yaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      for (const [b, s] of [[member.back, member.side * 1.3], [member.back, -member.side * 1.3], [2, member.side], [1.4, 0], [-1.6, member.side * 1.2], [0.8, member.side * 0.8]]) {
        const x = p.pos.x - fx * b + fz * s, z = p.pos.z - fz * b - fx * s, st = landAt(nav, x, z, p.pos.y + 0.6);
        if (!st || Math.abs(st.y - p.pos.y) > 0.5 || !clear(nav, st)) continue;
        if (G.physics?.lineOfSight && !G.physics.lineOfSight(tmp.set(p.pos.x, p.pos.y + 1.2, p.pos.z), tmp2.set(x, st.y + 1.2, z))) continue;
        place({ x, y: st.y, z }, yaw); return true;
      }
      place(p.pos, yaw); return true;
    }
    function plan(goal) {
      m.planT = 0.5 + rng() * 0.3;
      m.pathJob?.cancel?.();
      const req = G.physics?.nav?.requestPath; if (!req) { m.path = null; return; }
      m.pathJob = req(m.pos, goal, (path) => { m.pathJob = null; m.path = path && path.length ? path : null; m.wp = 0; });
    }
    function steer(dt, goal, speed, direct) {
      let tx = goal.x, tz = goal.z;
      if (!direct) {
        m.planT -= dt; if (m.planT <= 0) plan(goal);
        if (m.path) { while (m.wp < m.path.length - 1 && Math.hypot(m.path[m.wp].x - m.pos.x, m.path[m.wp].z - m.pos.z) < 0.6) m.wp++; const w = m.path[Math.min(m.wp, m.path.length - 1)]; tx = w.x; tz = w.z; }
      } else m.path = null;
      const ex = tx - m.pos.x, ez = tz - m.pos.z, el = Math.hypot(ex, ez) || 1;
      want.set(ex / el * speed, 0, ez / el * speed);
    }
    const sees = (z) => !G.physics?.lineOfSight || G.physics.lineOfSight(tmp.set(m.pos.x, m.pos.y + 1.45, m.pos.z), tmp2.set(z.pos.x, z.pos.y + 1.1 * (z.scale || 1), z.pos.z));

    function fire(z) {
      const gun = member.gun, d = Math.hypot(z.pos.x - m.pos.x, z.pos.z - m.pos.z);
      const hit = shotHits(gun, d, rng()), headshot = hit && rng() < gun.head;
      tmp.set(z.pos.x, z.pos.y + (headshot ? 1.55 : 1.1) * (z.scale || 1), z.pos.z);
      if (!hit) tmp.x += (rng() - 0.5) * 1.2, tmp.y += rng() * 0.8, tmp.z += (rng() - 0.5) * 1.2;
      dir.copy(tmp).sub(m.muzzle).normalize();
      G.fx?.tracer?.(m.muzzle, tmp.clone(), { color: 0xffe0a0, speed: 260, width: 0.025 });
      G.fx?.muzzleFlash?.(m.muzzle, dir, { scale: member.gun.damage > 15 ? 0.55 : 0.45 });
      G.render?.lightPool?.flash?.(m.muzzle, 0xffc080, 12, 6, 0.04);
      G.events?.emit?.('squad:fire', { mate: m, pos: m.muzzle, dir: dir.clone(), gun: gun.name });
      m.recoil = 1; m.shots++;
      if (!hit) return;
      let killed = false;
      try { killed = z.damage(gun.damage * (headshot ? 2.4 : 1), tmp.clone(), dir.clone(), headshot ? 'weak' : 'body', 'squad') === true; } catch (e) { console.error('[零点突围] 队友开火出错', e); }
      if (killed) { m.kills++; m.target = null; }
    }

    function goDown() {
      m.down = true; m.hp = 0; m.target = null; m.reviveT = 0; m.burst = 0; m.path = null; want.set(0, 0, 0); vel.set(0, 0, 0);
      G.hud?.radio?.(`${member.name}倒下了！走到跟前把人扶起来。`, 4);
      G.events?.emit?.('squad:down', { mate: m });
    }
    function getUp(hp = P.down.hp, quiet = false) {
      m.down = false; m.hp = Math.min(m.maxHp, Math.max(m.hp, hp)); m.reviveT = 0; m.cool = 0.8;
      if (!quiet) G.hud?.message?.(`${member.name}站起来了`, 2);
      G.events?.emit?.('squad:up', { mate: m });
    }

    function update(dt, others) {
      const p = G.player; if (!p?.pos) return;
      const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, dy = p.pos.y - m.pos.y, dist = Math.hypot(dx, dz);
      m.cool -= dt; m.hurtT -= dt; m.biteSay -= dt; m.healT -= dt;
      want.set(0, 0, 0);
      let faceYaw = null;
      // 落下太远 / 你换了层：直接跟过来（坐电梯、走楼梯、翻栏杆他们都这样跟）
      if (dist > P.follow.warp || Math.abs(dy) > 2.2) { m.awayT += dt; if ((dist > P.follow.warp * 1.6 || m.awayT > P.follow.warpSeconds) && p.onGround !== false) { warp(); if (m.down) getUp(P.down.hp, true); } } else m.awayT = 0;
      // 丧尸贴身：掉血
      const zs = zombies?.alive?.() || [];
      let biting = 0;
      for (const z of zs) {
        if (z.zs === 'idle' || z.fixed || Math.abs(z.pos.y - m.pos.y) > 1.6) continue;
        const d = Math.hypot(z.pos.x - m.pos.x, z.pos.z - m.pos.z);
        if (d < P.bite.reach * (z.scale || 1)) biting += z.special && z.kind === 'brute' ? 4 : 1;
        // 贴近了、离他比离你近：转过去扑他，咬上了就不撒口（巨尸、正按着人的不管；倒地的不再招丧尸）
        if (!m.down && d < P.bite.pull && d < Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) - 0.5 && z.zs === 'chase') z.distract?.(m.pos, 0.6);
      }
      if (m.down) {
        // 倒地：等人来扶（你站在跟前三秒；林医生过来四秒半）
        const near = p.alive !== false && dist < P.down.reach && Math.abs(dy) < 1.5;
        const medic = others.find((o) => o !== m && !o.down && o.member.trait === 'medic' && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < P.down.reach && Math.abs(o.pos.y - m.pos.y) < 1.5);
        if (near) m.reviveT += dt / P.down.revive; else if (medic) m.reviveT += dt / P.down.medic; else m.reviveT = Math.max(0, m.reviveT - dt * 0.5);
        if (m.reviveT >= 1) getUp();
        m.fallK = Math.min(1, m.fallK + dt * 3); m.speed = 0; pose(dt); return;
      }
      m.fallK = Math.max(0, m.fallK - dt * 4);
      if (biting > 0) {
        m.hp -= P.bite.dps * biting * dt; m.hurtT = 0.6;
        if (m.hp <= 0) { goDown(); pose(dt); return; }
        if (m.hp < m.maxHp * 0.4 && m.biteSay <= 0) { m.biteSay = 14; say(member, member.trait === 'medic' ? '我被围住了！' : '顶不住了，帮我一把！'); }
      }
      // 找目标
      if ((m.senseT -= dt) <= 0) {
        m.senseT = 0.22 + rng() * 0.1;
        const pin = siege?.state?.pin?.by || null;
        m.target = pickTarget(m.pos, p.pos, zs, { range: member.gun.range, pin, sees });
      }
      const t = m.target && m.target.alive && m.target.active ? m.target : (m.target = null);
      // 林医生：你血量见底，跑过来包扎
      const H = member.heal;
      const needHeal = H && m.healT <= 0 && p.alive !== false && (p.health ?? 100) < H.below && dist < H.range && Math.abs(dy) < 1.5;
      // 队友倒了：林医生去扶
      const fallen = member.trait === 'medic' ? others.find((o) => o.down && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 18 && Math.abs(o.pos.y - m.pos.y) < 1.5) : null;
      let goal = null, stopAt = 0;
      if (needHeal) { goal = p.pos; stopAt = H.reach * 0.8; }
      else if (fallen) { goal = fallen.pos; stopAt = P.down.reach * 0.7; }
      else {
        // 站位：你身后偏一侧；那一点站不住（墙里、栏杆外）就直接朝你靠
        const s = slotOf(p.pos, p.yaw || 0, member), st = landAt(nav, s.x, s.z, p.pos.y + 0.6);
        if (st && Math.abs(st.y - p.pos.y) < 0.5 && clear(nav, st)) { goal = new THREE.Vector3(s.x, st.y, s.z); stopAt = 0.7; } else { goal = p.pos; stopAt = P.follow.near; }
      }
      const gd = Math.hypot(goal.x - m.pos.x, goal.z - m.pos.z);
      const hurry = needHeal || fallen || dist > P.follow.run || !!p.sprinting;
      // 在位置上（离你不远、离站位不远）就不动；有目标时也不追着站位小碎步挪
      const settle = !needHeal && !fallen && dist < P.follow.far + 0.6 && (gd < 1.6 || !!t || goal === p.pos);
      if (gd > stopAt && !settle) steer(dt, goal, hurry ? P.follow.sprint : P.follow.walk, gd < 7 && Math.abs(goal.y - m.pos.y) < 0.8 && (!G.physics?.lineOfSight || G.physics.lineOfSight(tmp.set(m.pos.x, m.pos.y + 0.9, m.pos.z), new THREE.Vector3(goal.x, goal.y + 0.9, goal.z))));
      // 包扎
      if (needHeal && dist < H.reach) {
        m.healing += dt; faceYaw = Math.atan2(dx, dz);
        if (m.healing >= H.time) {
          m.healing = 0; m.healT = H.cooldown;
          const before = p.health; p.health = Math.min(p.maxHealth ?? 100, p.health + H.amount);
          G.hud?.radio?.(`${member.name}：别动，给你包一下。生命 +${Math.round(p.health - before)}`, 3.5);
          G.events?.emit?.('squad:heal', { mate: m, amount: p.health - before });
        }
      } else m.healing = 0;
      // 开火：点射，打完歇一下；跑着追人的时候不打
      const running = want.lengthSq() > 20;
      if (t && !running && m.healing <= 0) {
        const tx = t.pos.x - m.pos.x, tz = t.pos.z - m.pos.z, td = Math.hypot(tx, tz);
        faceYaw = Math.atan2(tx, tz); m.pitch = Math.atan2((t.pos.y + 1.1) - (m.pos.y + 1.4), Math.max(0.5, td)); m.lowReady = Math.max(0, m.lowReady - dt * 6);
        const facing = Math.abs(wrap(faceYaw - m.yaw)) < 0.3;
        if (m.cool <= 0 && facing && m.lowReady < 0.2) {
          if (m.burst <= 0) m.burst = member.gun.burst[0] + Math.floor(rng() * (member.gun.burst[1] - member.gun.burst[0] + 1));
          fire(t); m.burst--;
          const boost = member.trait === 'spotter' && G.weapon?.state === 'reloading' ? 0.7 : 1; // 你换弹：他加紧打
          m.cool = m.burst > 0 ? member.gun.interval : (member.gun.rest[0] + rng() * (member.gun.rest[1] - member.gun.rest[0])) * boost;
        }
      } else { m.lowReady = Math.min(1, m.lowReady + dt * 2.5); m.pitch *= Math.exp(-dt * 6); }
      // 阿哲：特殊感染者一露头先喊出来
      if (member.trait === 'spotter') for (const z of zs) if (z.special && !z.called && Math.abs(z.pos.y - m.pos.y) < 3 && Math.hypot(z.pos.x - m.pos.x, z.pos.z - m.pos.z) < 30 && sees(z)) { if (say(member, `${z.name}！${z.kind === 'brute' ? '别硬顶，边退边打！' : z.kind === 'spitter' ? '离地上那滩酸远点！' : z.kind === 'lunger' ? '它要扑人，盯住！' : '先打它！'}`)) z.called = true; break; }
      // 走
      const k = 1 - Math.exp(-dt * 10);
      vel.x += (want.x - vel.x) * k; vel.z += (want.z - vel.z) * k; vel.y = 0;
      const sp = Math.hypot(vel.x, vel.z);
      if (faceYaw === null && sp > 0.3) faceYaw = Math.atan2(vel.x, vel.z);
      if (faceYaw === null && sp < 0.3 && dist < P.follow.far + 1) faceYaw = (p.yaw || 0) + Math.PI + member.side * 0.5; // 站定：和你朝同一个方向、稍微往外看
      if (faceYaw !== null) { const d = wrap(faceYaw - m.yaw); m.yaw = wrap(m.yaw + clamp(d, -7 * dt, 7 * dt)); }
      const res = G.physics?.moveCapsule?.(m.pos, vel, dt, 0.28, 1.7) || null;
      if (!res) { m.pos.x += vel.x * dt; m.pos.z += vel.z * dt; }
      if (res?.hitWall && want.lengthSq() > 0.3) { m.stuckT += dt; if (m.stuckT > 0.8) { m.stuckT = 0; m.planT = 0; m.path = null; } } else m.stuckT = Math.max(0, m.stuckT - dt);
      m.speed = sp;
      pose(dt);
    }

    function pose(dt) {
      const sp = m.speed, amp = Math.min(0.55, sp * 0.14), stride = 1.3 + sp * 0.15;
      m.gait += dt * sp / stride * Math.PI * 2; m.recoil = Math.max(0, m.recoil - dt * 12);
      const run = Math.min(1, sp / P.follow.sprint), f = m.fallK;
      root.rotation.y = m.yaw;
      // 倒地：坐倒下去、上身后仰靠着
      body.rotation.x = -1.15 * f; body.position.y = 0.06 * f; body.position.z = -0.35 * f;
      hips.position.y = RIG.HIP_Y - Math.abs(Math.cos(m.gait)) * 0.035 * Math.min(1, sp / 2) - 0.12 * f;
      spine.rotation.set(0.12 * run - m.pitch * 0.15 + 0.5 * f, 0, 0);
      head.rotation.set(-m.pitch * 0.4 - 0.06 * run + 0.4 * f, 0, 0);
      aim.rotation.set(-m.pitch + m.lowReady * 0.55 - m.recoil * 0.03 - spine.rotation.x + 0.5 * f, m.lowReady * 0.35, 0);
      for (let i = 0; i < 2; i++) { const ph = m.gait + i * Math.PI, L = legs[i]; L.thigh.rotation.x = -amp * Math.sin(ph) * (1 - f) - 1.2 * f * (i ? 0.7 : 1); L.shin.rotation.x = amp * 1.4 * Math.max(0, Math.cos(ph)) * (1 - f) + 0.05 + 0.9 * f * (i ? 1 : 0.3); }
      if (tag) tag.visible = !G.player?.pos || G.player.pos.distanceTo(m.pos) < 32;
      root.updateMatrixWorld(true);
      muzzle.getWorldPosition(m.muzzle); spine.localToWorld(m.chest.set(0, 0.36, 0));
    }
    Object.assign(m, { place, warp, update, pose, goDown, getUp, fire, sees });
    return m;
  }

  const mates = P.members.map(make);
  const show = (v) => { for (const m of mates) { m.root.visible = v; m.active = v; } hud?.classList.toggle('off', !v); };

  function paint() {
    if (!hud) return;
    mates.forEach((m, i) => {
      const row = hud.children[i]; if (!row) return;
      row.classList.toggle('down', m.down); row.classList.toggle('hurt', !m.down && m.hp < m.maxHp * 0.5);
      row.querySelector('b').style.width = `${m.down ? Math.round(m.reviveT * 100) : Math.round(m.hp / m.maxHp * 100)}%`;
      row.querySelector('span').textContent = m.down ? (m.reviveT > 0.02 ? '正在扶起…' : '倒地 · 去扶') : m.healing > 0 ? '包扎中' : '';
    });
  }

  const api = {
    mates,
    get enabled() { return enabled; },
    /** 设置里关掉队友（单人）：want = false */
    get wanted() { return wanted; }, set wanted(v) { wanted = !!v; },
    /** 每局开始 / 重来：站到你身后，血回满 */
    reset() {
      enabled = wanted && !!siege?.enabled; sayT = 0;
      for (const m of mates) { m.hp = m.maxHp; m.down = false; m.fallK = 0; m.target = null; m.reviveT = 0; m.kills = 0; m.shots = 0; m.cool = 1; m.healT = 12; m.healing = 0; m.pathJob?.cancel?.(); m.pathJob = null; m.path = null; }
      show(false); api.spawned = false;
      paint();
    },
    /** 到了安全点：倒地的缓过来，都回一截血 */
    rally() { if (!enabled) return; for (const m of mates) { if (m.down) m.getUp(P.down.hp, true); m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.4); } paint(); },
    /** 尸潮规模的倍数：有站着的队友才加 */
    get hordeScale() { return enabled && api.spawned && mates.some((m) => !m.down) ? P.horde : 1; },
    update(dt) {
      sayT -= dt;
      if (!enabled) { if (api.spawned) { show(false); api.spawned = false; } return; }
      const playing = G.game?.state === 'playing' && G.player?.alive !== false, riding = !!director?.riding;
      if (!playing || riding) { if (api.spawned && riding) show(false); if (riding) api.spawned = false; return; }
      if (!api.spawned) { api.spawned = true; show(true); for (const m of mates) { m.warp(); m.pose(0.016); } }
      for (const m of mates) { try { m.update(Math.min(dt, 0.05), mates); } catch (e) { console.error('[零点突围] 队友出错', e); } }
      paint();
    },
    buildUi() {
      if (!ui || typeof document === 'undefined' || hud) return;
      hud = document.createElement('div'); hud.className = 'jm-squad off';
      hud.innerHTML = mates.map((m) => `<div class="m"><em style="font-style:normal">${m.name}</em><i><b></b></i><span></span></div>`).join('');
      (ui.querySelector('.hud') || ui).appendChild(hud);
    },
    dispose() {
      group.removeFromParent(); mat.dispose(); lampMat.dispose(); lampGeo.dispose(); hud?.remove();
      for (const m of mates) { m.pathJob?.cancel?.(); for (const g of Object.values(m.parts)) g.dispose?.(); m.root.traverse((o) => { if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } }); }
    },
  };
  return api;
}
