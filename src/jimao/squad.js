// 丧尸围城的两名队友（电脑控制）：不是一个人闯，而是三个人互相照应着往上打。
//   阿哲   商场夜班保安。冲锋枪，射速快；跟得近、血厚；熟悉这栋楼——特殊感染者一露头他先喊出来；你换弹的时候他加紧打。
//   林医生 急诊科医生。手枪，打得慢但准，常打头；跟在后面；你血量见底时跑过来给你包扎（一分钟一次）；队友倒了她去扶。
// 他们跟着你走（落下太远、你坐电梯 / 走楼梯换了层，就直接跟到你身后），自己找目标开火，优先打按住你的扑袭者和特殊感染者。
// 丧尸贴上去会咬他们；血打空就倒地——走到跟前站三秒把人扶起来（半血），不管也会在下一个安全点缓过来。
// 人形用劫持者那副骨架（soldier.js），换成自己的配色；丧尸不专门去追他们，但贴近了会转过去扑咬。
// 这里的开火不走原游戏的「敌人开火」那条路（那条路会算进直升机挨打），直接结算伤害、画弹道。
import * as THREE from 'three';
import { landAt, clear } from '../layout/nav.js';
import { buildParts, RIG, HELD_POSES } from './soldier.js';
import { createRigMaterial } from './skins/rig-skin.js';

export { SQUAD } from './squad-roster.js';
import { SQUAD } from './squad-roster.js';

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
/**
 * 人形手里拿的东西 → 显示哪几副手臂（soldier.js 的 HELD_POSES）、哪一把武器。联机时别人拿刀你看见的就是刀
 * crouch：蹲下时髋往下压多少米、腿怎么折（大腿往前、小腿往后，弧度）；act：一下子的动作多长（秒）——挥刀、扔手雷、榴弹出膛
 */
export const HELD = Object.freeze({
  rifle: Object.freeze({ arms: ['rifle'], gun: 'rifle' }), smg: Object.freeze({ arms: ['rifle'], gun: 'smg' }), launcher: Object.freeze({ arms: ['rifle'], gun: 'launcher' }),
  pistol: Object.freeze({ arms: ['pistol'], gun: 'pistol' }), knife: Object.freeze({ arms: ['knifeL', 'knifeR'], gun: 'knife' }), axe: Object.freeze({ arms: ['knifeL', 'axeR'], gun: 'axe' }),
  none: Object.freeze({ arms: ['none'], gun: null }),
});
export const POSE = Object.freeze({ crouch: Object.freeze({ drop: 0.4, thigh: 1.15, shin: 2.0, lean: 0.22 }), act: Object.freeze({ swing: 0.34, throw: 0.6, shell: 0.25 }) });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * 该打哪一只。mate：队友的位置；player：玩家的位置；zombies：[{ pos, special, zs, alive, active }]；pin：正按着玩家的那只（没有是 null）。
 * 排序：按着你的 > 正在扑小许的（guard：他站的地方，离他 guardR 米内、醒着的） > 特殊感染者 > 离你近的 > 离他近的。超出 range、不在同一层的不算。
 * 纯函数，返回丧尸或 null（看不看得见由调用的人查）。
 */
export function pickTarget(mate, player, zombies, { range = SQUAD.see, pin = null, sees = () => true, guard = null, guardR = SQUAD.guest.guard } = {}) {
  let best = null, bs = Infinity;
  for (const z of zombies) {
    if (!z.alive || !z.active || Math.abs(z.pos.y - mate.y) > 2.6) continue;
    const dm = Math.hypot(z.pos.x - mate.x, z.pos.z - mate.z); if (dm > range) continue;
    const dp = Math.hypot(z.pos.x - player.x, z.pos.z - player.z);
    const onGuest = !!guard && z.zs !== 'idle' && Math.abs(z.pos.y - guard.y) < 1.6 && Math.hypot(z.pos.x - guard.x, z.pos.z - guard.z) < guardR;
    const score = (z === pin ? -1000 : 0) + (onGuest ? -40 : 0) + (z.special ? -25 : 0) + (z.zs === 'idle' ? 10 : 0) + dp * 1.2 + dm * 0.5;
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
/** 那一点站不住、或者你看不见（隔着玻璃、墙）时依次换的站位：另一侧 → 正后方 → 贴近一点的正后方 */
export const SLOT_ALTS = Object.freeze([(q) => q, (q) => ({ back: q.back, side: -q.side }), (q) => ({ back: q.back, side: 0 }), (q) => ({ back: 1.2, side: 0 })]);

export const SQUAD_CSS = `
.jm-squad { position: absolute; left: calc(22px + var(--sal, 0px)); bottom: calc(166px + var(--sab, 0px)); z-index: 3; pointer-events: none; display: grid; gap: 5px; font: 600 11px/1 var(--f-label, sans-serif); letter-spacing: .1em; color: var(--bone, #e8e4da); text-shadow: 0 1px 4px rgba(0, 0, 0, .7); }
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
  const g = c.getContext('2d');
  const draw = (t) => { g.clearRect(0, 0, 160, 40); g.font = '600 24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(18, 4, 124, 32); g.fillStyle = color; g.fillText(t, 80, 21, 120); };
  draw(text);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  sp.scale.set(0.62, 0.155, 1); sp.position.y = 2.02; sp.renderOrder = 5;
  sp.userData.rename = (t) => { draw(t); tex.needsUpdate = true; }; // 联机时名牌换成玩家的昵称
  return sp;
}

/**
 * 接到游戏上。zombies：丧尸池（alive()）；siege：围城（state.pin、enabled）；director：任务系统（riding）。
 * 返回 { mates, enabled, reset(), rally()（到安全点：倒地的缓过来、都回满一截）, update(dt), buildUi(), dispose() }。
 */
export function createSquad(G, { scene, nav, zombies, siege = null, director = null, ui = null, rng = Math.random, P = SQUAD } = {}) {
  const group = new THREE.Group(); group.name = 'squad'; scene?.add(group);
  // 两人共用一个材质（rig-skin.js：顶点色 + 表面种类 + 细节图）；自发光按颜色走，停电里认得出人，黑衣服不会被抬成一层灰
  const mat = createRigMaterial({ name: 'squad', emissive: 0x16181a, looks: [...P.members, P.lead].filter(Boolean).map((m) => m.look) });
  // 胸前小手电的镜头（灯体在 buildParts 里）：一片发光的小圆，不是以前那个浮在胸口的亮球
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xf2e6cc, fog: false });
  const lampGeo = new THREE.CylinderGeometry(0.0105, 0.0105, 0.004, 14); lampGeo.rotateX(Math.PI / 2);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dir = new THREE.Vector3();
  let enabled = false, hud = null, sayT = 0, wanted = true;
  // 联机（coop/coop.js）：local 是这台机器上的你扮演谁（'lead' 主角 / 'zhe' / 'lin'），那个角色不再画成队友；
  // puppet：客户端上所有人形都是木偶（位置、血量、倒地照主机的快照，不跑 AI、不开枪）；force：房间里有人时不管设置里关没关队友都出场
  // selfDown：联机时这台机器上的你倒地了（coop/rules.js 管；倒着的你扶不了别人、林医生不来包扎而是来扶你）；medicMul：真人林医生扶人快几倍
  const net = { local: 'lead', puppet: false, force: false, selfDown: false, medicMul: 1 };
  // 你最近是朝哪边走的（不是朝哪边看）：站位按这个方向排在你身后。原地转头不会让他们跟着绕圈
  const trail = { x: 0, z: 0, yaw: 0, ready: false };
  function track() {
    const p = G.player; if (!p?.pos) return;
    if (!trail.ready) { trail.x = p.pos.x; trail.z = p.pos.z; trail.yaw = p.yaw || 0; trail.ready = true; return; }
    const dx = p.pos.x - trail.x, dz = p.pos.z - trail.z, d = Math.hypot(dx, dz);
    if (d > 12) { trail.x = p.pos.x; trail.z = p.pos.z; trail.yaw = p.yaw || 0; return; } // 换层 / 传送：按现在朝向重排
    if (d < 1.2) return;
    const want = Math.atan2(-dx, -dz); trail.yaw = wrap(trail.yaw + clamp(wrap(want - trail.yaw), -1.2, 1.2)); trail.x = p.pos.x; trail.z = p.pos.z;
  }
  const statRows = [];
  const say = (who, text, secs = 3) => { if (sayT > 0) return false; sayT = 2.4; G.hud?.radio?.(`${who.name}：${text}`, secs); return true; };

  function make(member, index) {
    const parts = buildParts(member.look, { held: true });
    const mk = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = false; return m; };
    const root = new THREE.Group(); root.name = 'squad-' + member.id; root.visible = false;
    const body = new THREE.Group(); root.add(body);
    const hips = new THREE.Group(); hips.position.y = RIG.HIP_Y; body.add(hips); hips.add(mk(parts.pelvis));
    const spine = new THREE.Group(); spine.position.y = 0.1; hips.add(spine); spine.add(mk(parts.torso));
    const head = new THREE.Group(); head.position.y = 0.5; spine.add(head); head.add(mk(parts.head));
    const aim = new THREE.Group(); aim.position.set(0, 0.42, 0.02); spine.add(aim);
    const muzzle = new THREE.Object3D(); muzzle.position.set(-0.1, -0.08, 0.78); aim.add(muzzle);
    // 手里拿的：几副手臂、几把武器都挂上，按 m.weapon 换着显示（setHeld）；刀 / 斧子那条右胳膊单独一组，挥刀时绕右肩转
    const H = parts.held, rArm = new THREE.Group(), heldMesh = { arms: {}, guns: {} };
    if (H) {
      rArm.position.fromArray(H.pivot); aim.add(rArm);
      for (const [k, g] of Object.entries(H.arms)) { const o = mk(g); o.visible = false; (k.endsWith('R') ? rArm : aim).add(o); heldMesh.arms[k] = o; }
      for (const [k, g] of Object.entries(H.guns)) { const o = mk(g); o.visible = false; (k === 'knife' || k === 'axe' ? rArm : aim).add(o); heldMesh.guns[k] = o; }
    } else aim.add(mk(parts.aim));
    let heldNow = null;
    function setHeld(w) {
      const key = HELD[w] ? w : 'rifle'; if (!H || key === heldNow) return; heldNow = key;
      const P0 = HELD[key];
      for (const [k, o] of Object.entries(heldMesh.arms)) o.visible = P0.arms.includes(k);
      for (const [k, o] of Object.entries(heldMesh.guns)) o.visible = k === P0.gun;
      muzzle.position.fromArray(H.muzzle[P0.gun] || H.muzzle.rifle);
    }
    const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.set(0.1, 0.36, 0.16); spine.add(lamp); // 胸前一盏小灯：黑里看得出人在哪
    const legs = [0.092, -0.092].map((x) => {
      const thigh = new THREE.Group(); thigh.position.set(x, -0.07, 0); hips.add(thigh); thigh.add(mk(parts.thigh));
      const shin = new THREE.Group(); shin.position.y = -RIG.THIGH; thigh.add(shin); shin.add(mk(parts.shin));
      return { thigh, shin };
    });
    const tag = nameTag(member.name, member.lead ? '#ffd2a8' : index ? '#bfeee8' : '#ffe98a'); if (tag) root.add(tag);
    group.add(root);
    const vel = new THREE.Vector3(), want = new THREE.Vector3();
    const m = {
      // label：名牌上的名字（联机时是玩家昵称）；remote：主机上由真人操控时，coop.js 每帧给的 { x, y, z, yaw, pitch, speed, crouch, sprint }
      member, id: member.id, name: member.name, label: member.name, remote: null, pos: root.position, root, yaw: 0, speed: 0, hp: member.hp, maxHp: member.hp, alive: true, down: false, active: false,
      target: null, senseT: rng() * 0.3, cool: 0.6, burst: 0, shots: 0, kills: 0, path: null, wp: 0, planT: 0, pathJob: null, awayT: 0, gait: 0, pitch: 0, recoil: 0, lowReady: 1,
      reviveT: 0, flingT: 0, stun: 0, flingX: 0, flingZ: 0, dodgeT: 0, dodgeSide: 1, holdT: 0, slotK: 0, goalSeen: true, seenP: true, offArea: false, lostT: 0, exitTo: null, exitT: 0, healT: 12 + rng() * 8, healing: 0, fallK: 0, muzzle: new THREE.Vector3(), chest: new THREE.Vector3(), parts, hurtT: 0, stuckT: 0, biteSay: 0,
      biters: [], biteAt: new Map(), clock: 0, hide: null, bitten: 0, // 小许：正在咬他的（最多 P.guest.cap 只）、每只下一口的时刻、往哪儿躲、挨了几口
      // 姿势（联机时照真人的状态摆）：weapon 手里拿的（HELD 的键）、crouch 蹲着、sprint 冲刺、reloading 换弹、kneel 跪下扶人；
      // crouchK / reloadK / kneelK 是过渡（0–1）；act / actT：一下子的动作（'swing' 挥刀 / 'throw' 扔东西 / 'shell' 榴弹出膛）放到第几秒
      weapon: member.weapon || 'rifle', crouch: false, sprint: false, reloading: false, kneel: false, crouchK: 0, reloadK: 0, actKind: null, actT: 0, human: false,
    };
    setHeld(m.weapon);

    function place(at, yaw = 0) {
      m.pos.set(at.x, at.y, at.z); m.yaw = yaw; vel.set(0, 0, 0); m.path = null; m.pathJob?.cancel?.(); m.pathJob = null; m.awayT = 0; m.planT = 0;
    }
    /** 救出来的人（小许）去不了的地方：卷帘拉下的店里、楼梯顶、范围外（不然跟过去又被判在范围外，一直原地闪） */
    const off = (st, x, z) => !!member.guest && siege?.inArea?.({ floor: st.floor, x, z }) === false;
    /** 跟到你身后站得住的一点（优先你看不见的方向） */
    function warp() {
      const p = G.player; if (!p?.pos) return false;
      const yaw = p.yaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      for (const [b, s] of [[member.back, member.side * 1.3], [member.back, -member.side * 1.3], [2, member.side], [1.4, 0], [-1.6, member.side * 1.2], [0.8, member.side * 0.8]]) {
        const x = p.pos.x - fx * b + fz * s, z = p.pos.z - fz * b - fx * s, st = landAt(nav, x, z, p.pos.y + 0.6);
        if (!st || Math.abs(st.y - p.pos.y) > 0.5 || !clear(nav, st) || off(st, x, z)) continue;
        if (G.physics?.lineOfSight && !G.physics.lineOfSight(tmp.set(p.pos.x, p.pos.y + 1.2, p.pos.z), tmp2.set(x, st.y + 1.2, z))) continue;
        place({ x, y: st.y, z }, yaw); return true;
      }
      place(p.pos, yaw); return true;
    }
    /** 站位 spec（{ back, side }）落在哪：站得住、和你同一层；look：还要你看得见那一点。不行返回 null */
    function slotAt(spec, yaw, look) {
      const p = G.player, s = slotOf(p.pos, yaw, spec), st = landAt(nav, s.x, s.z, p.pos.y + 0.6);
      if (!st || Math.abs(st.y - p.pos.y) >= 0.5 || !clear(nav, st) || off(st, s.x, s.z)) return null;
      if (look && G.physics?.lineOfSight && !G.physics.lineOfSight(tmp.set(p.pos.x, p.pos.y + 1.2, p.pos.z), tmp2.set(s.x, st.y + 1.2, s.z))) return null;
      return new THREE.Vector3(s.x, st.y, s.z);
    }
    /**
     * 小许挨咬：贴着他的（close：[[离他多远, 丧尸], ...]）里最多 P.guest.cap 只咬得到——咬着的不换，空出位置才轮到下一只（近的先），
     * 其余的围着等；每只各数各的：贴上 windup 秒咬第一口，之后每 every 秒一口（离开再贴上也不重新算）。一口 hit 点，siege.guestHurt() 再打折（你手里还没枪时）。
     * 返回这一下是不是咬倒了
     */
    function guestBites(dt, close) {
      const B = P.guest; m.clock += dt;
      m.biters = m.biters.filter((z) => close.some((q) => q[1] === z));
      for (const [, z] of close.sort((a, b) => a[0] - b[0])) {
        if (m.biters.length >= B.cap) break;
        if (!m.biters.includes(z)) { m.biters.push(z); m.biteAt.set(z, Math.max(m.biteAt.get(z) ?? -Infinity, m.clock + B.windup)); }
      }
      let bit = 0;
      for (const z of m.biters) {
        if (m.clock < m.biteAt.get(z)) continue;
        m.biteAt.set(z, m.clock + B.every);
        const n = B.hit * (siege?.guestHurt?.() ?? 1); m.hp -= n; m.hurtT = 0.6; m.bitten++; bit++;
        G.events?.emit?.('squad:bite', { mate: m, by: z, damage: n });
        if (m.hp <= 0) return true;
      }
      if (m.biteAt.size > 24) for (const [z, at] of m.biteAt) if (at < m.clock - 3) m.biteAt.delete(z);
      if (bit && m.biteSay <= 0) { m.biteSay = 8; say(member, m.hp < m.maxHp * 0.4 ? '救命——快把它们弄开！' : '它咬我！别丢下我！'); }
      return false;
    }
    /**
     * 小许往哪儿躲：身边 P.guest.flee 米内有醒着的丧尸时，在你周围（1.7 / 2.6 米一圈）挑一处离尸群远、隔着你在尸群另一边、偏扶梯口那边（siege.refuge()）的地方；
     * 要站得住、在范围里、你看得见。身边没丧尸、或者挪过去也不比原地宽敞，就不躲（null）
     */
    function hideSpot(zs) {
      const B = P.guest, p = G.player?.pos; if (!p || Math.abs(p.y - m.pos.y) > 1.5) return null;
      const awake = zs.filter((z) => z.zs !== 'idle' && !z.fixed && !z.passive && Math.abs(z.pos.y - m.pos.y) < 1.6);
      const room = (x, z) => { let r = 6; for (const q of awake) r = Math.min(r, Math.hypot(q.pos.x - x, q.pos.z - z)); return r; };
      const here = room(m.pos.x, m.pos.z); if (here >= B.flee) return null;
      let cx = 0, cz = 0, n = 0; // 尸群（离他 6 米内的，近的分量大）的重心
      for (const q of awake) { const d = Math.hypot(q.pos.x - m.pos.x, q.pos.z - m.pos.z); if (d < 6) { const w = 1 / Math.max(0.5, d); cx += q.pos.x * w; cz += q.pos.z * w; n += w; } }
      cx /= n; cz /= n;
      let ux = p.x - cx, uz = p.z - cz; const ul = Math.hypot(ux, uz); if (ul > 1e-3) { ux /= ul; uz /= ul; } else { ux = Math.sin(p.yaw || 0); uz = Math.cos(p.yaw || 0); }
      const ref = siege?.refuge?.(); let rx = 0, rz = 0; if (ref && Math.abs(ref.y - p.y) < 1.5) { const rl = Math.hypot(ref.x - p.x, ref.z - p.z); if (rl > 1) { rx = (ref.x - p.x) / rl; rz = (ref.z - p.z) / rl; } }
      const cands = [];
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, ax = Math.sin(a), az = Math.cos(a);
        for (const r of [1.7, 2.6]) {
          const x = p.x + ax * r, z = p.z + az * r, rm = room(x, z); if (rm < here + 0.5) continue; // 挪过去不比原地宽敞：不去
          const st = landAt(nav, x, z, p.y + 0.6); if (!st || Math.abs(st.y - p.y) > 0.5 || !clear(nav, st) || off(st, x, z)) continue; // 栏杆外（中庭）、墙里、范围外
          cands.push({ x, y: st.y, z, s: rm + 1.2 * (ax * ux + az * uz) + 0.5 * (ax * rx + az * rz) - 0.2 * Math.hypot(x - m.pos.x, z - m.pos.z) });
        }
      }
      cands.sort((a, b) => b.s - a.s);
      for (const c of cands.slice(0, 4)) if (!G.physics?.lineOfSight || G.physics.lineOfSight(tmp.set(p.x, p.y + 1.2, p.z), tmp2.set(c.x, c.y + 1.2, c.z))) return new THREE.Vector3(c.x, c.y, c.z);
      return null;
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
      m.biters = []; m.hide = null;
      G.hud?.radio?.(member.guest ? `${member.name}倒下了！把你身边的丧尸砍开，站到他跟前一秒多就能扶起来（倒着的时候它们不咬他）。` : `${m.label}倒下了！走到跟前把人扶起来。`, 4);
      G.events?.emit?.('squad:down', { mate: m });
    }
    function getUp(hp = P.down.hp, quiet = false) {
      m.down = false; m.hp = Math.min(m.maxHp, Math.max(m.hp, hp)); m.reviveT = 0; m.cool = 0.8;
      if (!quiet) G.hud?.message?.(`${m.label}站起来了`, 2);
      G.events?.emit?.('squad:up', { mate: m });
    }

    /**
     * 倒地：等人来扶（你站在跟前三秒；林医生过来四秒半；联机时别的真人站到跟前也算）。小许：你站到 P.guest.reach 米内 P.guest.revive 秒就起来，
     * 但你身边 busy 米内有醒着的丧尸时扶不了（先腾出手）——光站着不打就扶不起来；扶了一半走开，进度慢慢退
     */
    function downTick(dt, others, p, dist, dy, zs) {
      const B = P.guest, reach = member.guest ? B.reach : P.down.reach;
      const meNear = p.alive !== false && !net.selfDown && dist < reach && Math.abs(dy) < 1.5;
      const helper = meNear ? null : others.find((o) => o !== m && o.remote && !o.down && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < reach && Math.abs(o.pos.y - m.pos.y) < 1.5);
      const near = meNear || !!helper;
      // 联机：扶人的是真人扮演的林医生（你自己、或者别人）——快一些（net.medicMul）
      const fast = !member.guest && ((meNear && net.local === 'lin') || helper?.member.trait === 'medic') ? net.medicMul : 1;
      const busy = member.guest && near && zs.some((z) => z.zs !== 'idle' && !z.fixed && !z.passive && Math.abs(z.pos.y - p.pos.y) < 1.6 && Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) < B.busy);
      const medic = others.find((o) => o !== m && !o.down && !o.remote && o.member.trait === 'medic' && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < P.down.reach && Math.abs(o.pos.y - m.pos.y) < 1.5);
      m.help = !near ? 'far' : busy ? 'busy' : 'up'; // siege 的护送提示按这个说
      if (near && !busy) m.reviveT += dt * fast / (member.guest ? B.revive : P.down.revive); else if (medic) m.reviveT += dt / P.down.medic; else if (!busy) m.reviveT = Math.max(0, m.reviveT - dt * (member.guest ? 0.2 : 0.5));
      if (m.reviveT >= 1) getUp();
      m.fallK = Math.min(1, m.fallK + dt * 3); m.speed = 0; pose(dt);
    }
    /**
     * 主机上由真人操控（联机）：位置、朝向、俯仰照对方报的（coop.js 已经插值好放在 m.remote），不找目标、不开枪（他自己开枪，命中报给主机）；
     * 挨咬由丧尸的普通扑咬结算（G.zombieTarget 把他当成目标），这里不再按「贴着就掉血」另算；血打空照样倒地、等人扶
     */
    function remoteUpdate(dt, others) {
      const p = G.player, R = m.remote;
      m.hurtT -= dt; m.flingT -= dt;
      if (m.hp <= 0 && !m.down) goDown();
      if (m.down) { downTick(dt, others, p, Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z), p.pos.y - m.pos.y, zombies?.alive?.() || []); return; }
      m.fallK = Math.max(0, m.fallK - dt * 4); m.help = null; m.target = null; m.healing = 0;
      m.pos.set(R.x, R.y, R.z); m.yaw = wrap((R.yaw || 0) + Math.PI); m.pitch = R.pitch || 0; m.speed = R.speed || 0;
      m.human = true; m.crouch = !!R.crouch; m.sprint = !!R.sprint; m.reloading = !!R.reload; m.healing = R.healing ? 1 : 0; if (R.weapon) m.weapon = R.weapon;
      m.kneel = kneelNear(others);
      m.lowReady = R.sprint || R.healing ? Math.min(1, m.lowReady + dt * 5) : Math.max(0, m.lowReady - dt * 6);
      pose(dt);
    }
    /** 客户端的木偶：coop.js 已经把位置、朝向、速度、血、倒地写好了，这里只摆姿势 */
    function puppetPose(dt, others) {
      m.fallK = m.down ? Math.min(1, m.fallK + dt * 3) : Math.max(0, m.fallK - dt * 4);
      const low = m.human ? m.sprint || m.healing > 0 : m.speed > 4.5;
      m.lowReady = low ? Math.min(1, m.lowReady + dt * (m.human ? 5 : 2.5)) : Math.max(0, m.lowReady - dt * (m.human ? 6 : 4));
      m.kneel = m.human && kneelNear(others);
      pose(dt);
    }
    /** 真人蹲在倒地的人跟前不动：在扶人（跪下去） */
    function kneelNear(others) {
      if (m.down || m.speed > 0.6) return false;
      const near = (o) => o !== m && o.down && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < P.down.reach && Math.abs(o.pos.y - m.pos.y) < 1.5;
      if (others?.some(near)) return true;
      const p = G.player; return !!(net.selfDown && p?.pos && Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) < P.down.reach && Math.abs(p.pos.y - m.pos.y) < 1.5);
    }
    /** 一下子的动作（联机：别人挥刀、扔手雷、打榴弹） */
    m.act = (kind) => { if (!POSE.act[kind]) return; m.actKind = kind; m.actT = 0; if (kind === 'shell') m.recoil = 2; };
    function update(dt, others) {
      const p = G.player; if (!p?.pos) return;
      if (net.puppet) { puppetPose(dt, others); return; }
      if (m.remote) { remoteUpdate(dt, others); return; }
      m.weapon = member.weapon || 'rifle'; m.crouch = false; m.sprint = false; m.reloading = false; m.kneel = false; m.human = false; // 电脑开的：拿自己那把，站着打
      const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, dy = p.pos.y - m.pos.y, dist = Math.hypot(dx, dz);
      m.cool -= dt; m.hurtT -= dt; m.biteSay -= dt; m.healT -= dt;
      want.set(0, 0, 0);
      let faceYaw = null;
      // 落下太远 / 你换了层：直接跟过来（坐电梯、走楼梯、翻栏杆他们都这样跟）
      // 倒在地上的不跟：留在原地等人扶，到下一个安全点才缓过来（rally）
      if (!m.down && (dist > P.follow.warp || Math.abs(dy) > 2.2)) { m.awayT += dt; if ((dist > P.follow.warp * 1.6 || m.awayT > P.follow.warpSeconds) && p.onGround !== false) warp(); } else m.awayT = 0;
      // 丧尸贴身：掉血
      const zs = zombies?.alive?.() || [];
      let biting = 0; const close = member.guest ? [] : null; // 小许：贴着他的先记下（离他多远、哪一只），下面按上限一口一口算
      for (const z of zs) {
        if (z.zs === 'idle' || z.fixed || Math.abs(z.pos.y - m.pos.y) > 1.6) continue;
        const d = Math.hypot(z.pos.x - m.pos.x, z.pos.z - m.pos.z);
        if (d < P.bite.reach * (z.scale || 1)) {
          if (z.kind !== 'brute') { biting++; close?.push([d, z]); }
          else if (!m.down && m.flingT <= 0) {
            // 巨尸：一巴掌拍飞
            const hx = m.pos.x - z.pos.x, hz = m.pos.z - z.pos.z, hd = Math.hypot(hx, hz) || 1;
            m.flingT = P.fling.every; m.stun = P.fling.stun; m.flingX = hx / hd * P.fling.speed; m.flingZ = hz / hd * P.fling.speed; m.hp -= P.fling.damage; m.hurtT = 0.6; m.target = null; m.burst = 0;
            G.events?.emit?.('squad:fling', { mate: m, by: z });
            if (m.hp > 0) say(member, '被拍飞了——别让它近身！');
          }
        }
        // 贴近了、离他比离你近：转过去扑他，咬上了就不撒口（巨尸、正按着人的不管；倒地的不再招丧尸）。
        // 小许不在这儿招：扑他的几只由护送那一步定（siege-mall 的 MALL.rescue.mob）——以前这一句把他身边追你的全招过去，五六只一起啃
        if (!member.guest && !m.down && d < P.bite.pull && d < Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) - 0.5 && z.zs === 'chase') z.distract?.(m.pos, 0.6);
      }
      m.flingT -= dt;
      if (m.hp <= 0 && !m.down) { goDown(); }
      if (m.stun > 0 && !m.down) {
        // 被拍飞：往后滑出去、摔在地上，过一秒多才爬起来
        m.stun -= dt; vel.set(m.flingX, 0, m.flingZ); const k = Math.exp(-dt * 4.5); m.flingX *= k; m.flingZ *= k;
        const res = G.physics?.moveCapsule?.(m.pos, vel, dt, 0.28, 1.7) || null; if (!res) { m.pos.x += vel.x * dt; m.pos.z += vel.z * dt; }
        m.fallK = Math.min(1, m.fallK + dt * 5); m.speed = 0; pose(dt); return;
      }
      if (m.down) {
        downTick(dt, others, p, dist, dy, zs); return;
      }
      m.fallK = Math.max(0, m.fallK - dt * 4); m.help = null;
      if (member.guest) { if (guestBites(dt, close)) { goDown(); pose(dt); return; } }
      else if (biting > 0) {
        m.hp -= P.bite.dps * (siege?.mateBites?.(biting) ?? biting) * dt; m.hurtT = 0.6; // 守屋顶时同时挨咬的只数有上限、打折（siege.js 的 SIEGE.crowd）
        if (m.hp <= 0) { goDown(); pose(dt); return; }
        if (m.hp < m.maxHp * 0.4 && m.biteSay <= 0) { m.biteSay = 14; say(member, member.trait === 'medic' ? '我被围住了！' : '顶不住了，帮我一把！'); }
      }
      // 找目标（几条视线也按这个节奏查：站位看不看得见、到没到位、小许在不在你眼皮底下）
      const sensed = (m.senseT -= dt) <= 0;
      if (sensed) {
        m.senseT = 0.22 + rng() * 0.1;
        const pin = siege?.state?.pin?.by || null, guest = member.guest ? null : others.find((o) => o.member.guest && !o.down);
        m.target = pickTarget(m.pos, p.pos, zs, { range: member.gun.range, pin, sees, guard: guest?.pos || null }); // 扑小许的先打
        if (member.guest) m.hide = m.exitTo ? null : hideSpot(zs);
      }
      // 救出来的人（小许）卡住了的保底：你 lost 秒看不见他（隔着店面玻璃、墙），或者他站在你进不去的地方（卷帘拉下的店里、范围外）——直接跟到你身后
      if (member.guest) {
        if (sensed) {
          m.seenP = !G.physics?.lineOfSight || G.physics.lineOfSight(tmp.set(p.pos.x, p.pos.y + 1.4, p.pos.z), tmp2.set(m.pos.x, m.pos.y + 1.4, m.pos.z));
          const at = siege?.inArea ? landAt(nav, m.pos.x, m.pos.z, m.pos.y + 0.6) : null;
          m.offArea = !!at && siege.inArea({ floor: at.floor, x: m.pos.x, z: m.pos.z }) === false;
        }
        m.lostT = m.seenP && !m.offArea ? 0 : m.lostT + dt;
        if ((m.offArea || m.lostT > P.follow.lost) && p.onGround !== false) { m.lostT = 0; m.offArea = false; m.exitTo = null; warp(); pose(dt); return; }
      }
      // 刚从店里放出来：先走到门外那一点（一次性的，走到了、或者几秒还没到就照常跟着）
      if (m.exitTo && ((m.exitT -= dt) <= 0 || Math.hypot(m.exitTo.x - m.pos.x, m.exitTo.z - m.pos.z) < 0.6)) m.exitTo = null;
      const t = m.target && m.target.alive && m.target.active ? m.target : (m.target = null);
      // 林医生：你血量见底，跑过来包扎
      const H = member.heal;
      const needHeal = H && m.healT <= 0 && p.alive !== false && !net.selfDown && (p.health ?? 100) < H.below && dist < H.range && Math.abs(dy) < 1.5;
      // 队友倒了：林医生去扶（联机时你自己倒了也来扶你：rules.js 按她站在你跟前多久算）
      const fallen = member.trait === 'medic' ? (others.find((o) => o.down && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 18 && Math.abs(o.pos.y - m.pos.y) < 1.5) || (net.selfDown && dist < 30 && Math.abs(dy) < 1.5 ? p : null)) : null;
      let goal = null, stopAt = 0;
      // 你架着楼顶机枪（roof-gun.js）：站到机枪阵地里给他留的那一处（沙袋墙里、台子边上），不跟着枪口转来转去
      const post = G.roofGun?.active ? G.roofGun.matePost?.(member.id) : null;
      if (needHeal) { goal = p.pos; stopAt = H.reach * 0.8; }
      else if (fallen) { goal = fallen.pos; stopAt = P.down.reach * 0.7; }
      else if (m.exitTo) { goal = m.exitTo; stopAt = 0.4; }
      else if (m.hide) { goal = m.hide; stopAt = 0.35; } // 小许：身边有丧尸，躲到你身后
      else if (post) { goal = post; stopAt = 0.35; }
      else {
        // 站位：你身后偏一侧；那一点站不住（墙里、栏杆外）或者你看不见（隔着玻璃、墙）就换一个（SLOT_ALTS，挑哪个按节奏重查）；都不行才直接朝你靠
        const yaw = trail.ready ? trail.yaw : (p.yaw || 0);
        if (sensed) m.slotK = SLOT_ALTS.findIndex((alt) => !!slotAt(alt(member), yaw, true));
        const s = m.slotK >= 0 ? slotAt(SLOT_ALTS[m.slotK](member), yaw, false) : null;
        if (s) { goal = s; stopAt = 0.7; } else { goal = p.pos; stopAt = P.follow.near; }
      }
      const gd = Math.hypot(goal.x - m.pos.x, goal.z - m.pos.z);
      const hurry = needHeal || fallen || dist > P.follow.run || !!p.sprinting;
      // 到没到位要看得见那一点：隔着店面玻璃离站位一米多不算到（小许以前就这样站在店里的玻璃后面不出来）
      if (sensed) m.goalSeen = gd >= 1.6 || !G.physics?.lineOfSight || G.physics.lineOfSight(tmp.set(m.pos.x, m.pos.y + 0.9, m.pos.z), tmp2.set(goal.x, goal.y + 0.9, goal.z));
      // 在位置上（离你不远、离站位不远）就不动；有目标时也不追着站位小碎步挪。站位都不行时：队友离你不远就站着，小许（没枪）一直走到你跟前
      const settle = !needHeal && !fallen && !m.exitTo && !m.hide && (post ? gd < 0.6 : dist < P.follow.far + 0.6 && ((gd < 1.6 && m.goalSeen) || !!t || (goal === p.pos && !member.guest)));
      if (gd > stopAt && !settle) steer(dt, goal, hurry ? P.follow.sprint : m.hide ? P.guest.run : P.follow.walk, gd < 7 && Math.abs(goal.y - m.pos.y) < 0.8 && (!G.physics?.lineOfSight || G.physics.lineOfSight(tmp.set(m.pos.x, m.pos.y + 0.9, m.pos.z), new THREE.Vector3(goal.x, goal.y + 0.9, goal.z))));
      // 别挡枪口：站在你正前方四米内就往旁边让（包扎、扶人的时候除外）。小许没枪、也不用给你让枪线——以前他从店门出来正对着你，
      // 一让就让到门边的玻璃后面、站住六秒，再出来又正对着你……一直出不来
      m.dodgeT -= dt; m.holdT -= dt;
      if (!member.guest && !needHeal && !fallen && !post && dist < 3.6 && dist > 0.2) { // 架着楼顶机枪时不用让：枪口在台子上，从头顶上打过去
        const yaw = p.yaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw), ax = -dx / dist, az = -dz / dist; // 你 → 他
        if (m.dodgeT <= 0 && fx * ax + fz * az > 0.965) { m.dodgeT = 0.7; m.dodgeSide = fx * az - fz * ax >= 0 ? 1 : -1; }
        // 往旁边横着让开一步；让开以后先站着别动（你走远了再跟），免得又走回枪口前
        if (m.dodgeT > 0) { want.set(-fz * m.dodgeSide * P.follow.walk * 1.2, 0, fx * m.dodgeSide * P.follow.walk * 1.2); m.path = null; m.holdT = 6; }
      }
      if (m.holdT > 0 && m.dodgeT <= 0 && dist < P.follow.far + 1.5) want.set(0, 0, 0);
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
      // 喊特殊感染者：坐飞机、看炸楼时不喊地上的（只喊还活着的清扫目标）
      if (member.trait === 'spotter') for (const z of zs) if (z.special && !z.called && (!director?.riding || (z.sweep && z.alive && z.active)) && Math.abs(z.pos.y - m.pos.y) < 3 && Math.hypot(z.pos.x - m.pos.x, z.pos.z - m.pos.z) < 30 && sees(z)) { if (say(member, `${z.name}！${z.kind === 'brute' ? '别硬顶，边退边打！' : z.kind === 'spitter' ? '离地上那滩酸远点！' : z.kind === 'lunger' ? '它要扑人，盯住！' : '先打它！'}`)) z.called = true; break; }
      // 走
      const k = 1 - Math.exp(-dt * 10);
      vel.x += (want.x - vel.x) * k; vel.z += (want.z - vel.z) * k; vel.y = 0;
      const sp = Math.hypot(vel.x, vel.z);
      if (faceYaw === null && sp > 0.3) faceYaw = Math.atan2(vel.x, vel.z);
      if (faceYaw === null && sp < 0.3 && dist < P.follow.far + 1) faceYaw = trail.yaw + Math.PI + member.side * 0.5; // 站定：朝着行进的方向、稍微往外看
      if (faceYaw !== null) { const d = wrap(faceYaw - m.yaw); m.yaw = wrap(m.yaw + clamp(d, -7 * dt, 7 * dt)); }
      const res = G.physics?.moveCapsule?.(m.pos, vel, dt, 0.28, 1.7) || null;
      if (!res) { m.pos.x += vel.x * dt; m.pos.z += vel.z * dt; }
      if (res?.hitWall && want.lengthSq() > 0.3) { m.stuckT += dt; if (m.stuckT > 0.8) { m.stuckT = 0; m.planT = 0; m.path = null; } } else m.stuckT = Math.max(0, m.stuckT - dt);
      m.speed = sp;
      pose(dt);
    }

    function pose(dt) {
      setHeld(m.weapon);
      const sp = m.speed, CR = POSE.crouch;
      // 蹲（蹲着、跪下扶人、包扎时半蹲）：髋往下压、大腿往前、小腿往后折，上身往前探；倒地时不蹲
      const wantC = m.down ? 0 : m.crouch || m.kneel ? 1 : m.healing > 0 && m.human ? 0.45 : 0;
      m.crouchK += (wantC - m.crouchK) * Math.min(1, dt * 12); const ck = m.crouchK;
      m.reloadK += ((m.reloading && !m.down ? 1 : 0) - m.reloadK) * Math.min(1, dt * 10);
      const amp = Math.min(0.55, sp * 0.14) * (1 - 0.45 * ck), stride = (1.3 + sp * 0.15) * (1 - 0.35 * ck);
      const g0 = m.gait; m.gait += dt * sp / stride * Math.PI * 2; m.recoil = Math.max(0, m.recoil - dt * 12);
      // 真人（联机）的脚步声：每落一步响一下（蹲着走轻、跑起来重）；电脑队友不响（以前就不响，免得一屋子脚步声）
      if (m.human && sp > 0.8 && !m.down && Math.floor(g0 / Math.PI) !== Math.floor(m.gait / Math.PI) && G.player?.pos && G.player.pos.distanceTo(m.pos) < 30) G.audio?.play?.('soldier_step', { pos: m.pos, gain: Math.min(0.8, 0.25 + sp * 0.09) * (1 - 0.6 * ck), jitter: 0.08 });
      const run = Math.min(1, sp / P.follow.sprint) * (1 - ck), f = m.fallK;
      // 一下子的动作：k 是 0–1 的进度，没有就是 -1
      let ak = -1; if (m.actKind) { m.actT += dt; const T = POSE.act[m.actKind]; ak = m.actT / T; if (ak >= 1) { m.actKind = null; ak = -1; } }
      const swing = m.actKind === 'swing' ? ak : -1, toss = m.actKind === 'throw' ? ak : -1;
      root.rotation.y = m.yaw;
      // 倒地：坐倒下去、上身后仰靠着
      body.rotation.x = -1.15 * f; body.position.y = 0.06 * f; body.position.z = -0.35 * f;
      hips.position.y = RIG.HIP_Y - Math.abs(Math.cos(m.gait)) * 0.035 * Math.min(1, sp / 2) - 0.12 * f - CR.drop * ck;
      // 上身跟着瞄的方向俯仰（一部分在腰上、其余在肩上）；冲刺往前倾；蹲着往前探；扔东西时先往后仰再甩过来
      const tossLean = toss >= 0 ? (toss < 0.4 ? -0.18 * toss / 0.4 : -0.18 + 0.45 * (toss - 0.4) / 0.6) : 0;
      spine.rotation.set(0.12 * run - m.pitch * 0.3 + CR.lean * ck + 0.5 * f + tossLean + 0.12 * m.reloadK, 0, 0);
      head.rotation.set(-m.pitch * 0.35 - 0.06 * run - CR.lean * ck * 0.6 + 0.4 * f + (m.healing > 0 && m.human ? 0.35 : 0) + 0.25 * m.reloadK, 0, 0);
      // 枪：瞄的方向（减掉腰上那一截）、低持枪、后坐；换弹时枪口往下压、往里歪；扔东西时整组举过头再甩下来
      const tossArm = toss >= 0 ? (toss < 0.4 ? -1.5 * toss / 0.4 : -1.5 + 2.2 * (toss - 0.4) / 0.6) : 0;
      aim.rotation.set(-m.pitch + m.lowReady * 0.55 - m.recoil * 0.03 - spine.rotation.x + 0.5 * f + 0.5 * m.reloadK + tossArm, m.lowReady * 0.35 + 0.25 * m.reloadK, -0.45 * m.reloadK);
      aim.position.z = 0.02 - m.recoil * 0.025;
      // 挥刀：右胳膊绕右肩先往外上方抬（蓄力），再往里下方劈过去
      if (swing >= 0) { const w = swing < 0.3 ? swing / 0.3 : 1 - (swing - 0.3) / 0.7, cut = swing < 0.3 ? 0 : Math.sin((swing - 0.3) / 0.7 * Math.PI); rArm.rotation.set(-1.2 * w + 0.5 * cut, 0.7 * w - 0.9 * cut, 0.5 * w); }
      else rArm.rotation.set(0, 0, 0);
      for (let i = 0; i < 2; i++) {
        const ph = m.gait + i * Math.PI, L = legs[i], walkT = -amp * Math.sin(ph), walkS = amp * 1.4 * Math.max(0, Math.cos(ph)) + 0.05;
        L.thigh.rotation.x = (walkT - CR.thigh * ck * (i ? 0.78 : 1.08)) * (1 - f) - 1.2 * f * (i ? 0.7 : 1);
        L.shin.rotation.x = (walkS + CR.shin * ck * (i ? 1.05 : 0.92)) * (1 - f) + 0.9 * f * (i ? 1 : 0.3);
      }
      if (tag) tag.position.y = 2.02 - CR.drop * ck - 0.6 * f;
      if (tag) tag.visible = !G.player?.pos || G.player.pos.distanceTo(m.pos) < (m.remote || net.puppet ? 60 : 32); // 联机：真人的名牌远一点也看得见
      root.updateMatrixWorld(true);
      muzzle.getWorldPosition(m.muzzle); spine.localToWorld(m.chest.set(0, 0.36, 0));
    }
    /** 名牌（和队友栏）上显示的名字：联机时换成玩家的昵称，走了换回角色名 */
    m.rename = (text) => { const t = text || member.name; if (t === m.label) return; m.label = t; tag?.userData.rename?.(t); const row = hud?.children?.[everyone.indexOf(m)]?.querySelector?.('em'); if (row) row.textContent = t; };
    Object.assign(m, { place, warp, update, pose, goDown, getUp, fire, sees, setHeld, held: heldMesh, rArm });
    return m;
  }

  // 队友（mates）和救出来的人（guests：小许）分开放：队友的血条、站位、击杀统计只管队友
  // 主角（P.lead）排在最后：只在联机、你扮演别人的时候出场
  const everyone = [...P.members, ...(P.lead ? [P.lead] : [])].map(make), mates = everyone.filter((m) => !m.member.guest && !m.member.lead), guests = everyone.filter((m) => m.member.guest);
  const lead = everyone.find((m) => m.member.lead) || null;
  // 小许救出来才算；两个队友看设置（联机时你扮演的那个不画）；主角只在你不是主角的时候出场
  const on = (m) => (m.member.guest ? !!m.joined : m.member.lead ? enabled && net.local !== 'lead' : enabled && net.local !== m.id);
  const show = (v) => { for (const m of everyone) { m.root.visible = v && on(m); m.active = v && on(m); } hud?.classList.toggle('off', !v); };

  function paint() {
    // 结算 / 阵亡页上多一行：队友各打倒了几只
    for (const row of statRows) { row.hidden = !enabled; row.querySelector('dd').textContent = mates.map((m) => `${m.name} ${m.kills}`).join(' · '); }
    if (!hud) return;
    everyone.forEach((m, i) => {
      const row = hud.children[i]; if (!row) return;
      row.hidden = !on(m);
      row.classList.toggle('down', m.down); row.classList.toggle('hurt', !m.down && m.hp < m.maxHp * 0.5);
      row.querySelector('b').style.width = `${m.down ? Math.round(m.reviveT * 100) : Math.round(m.hp / m.maxHp * 100)}%`;
      row.querySelector('span').textContent = m.down ? (m.reviveT > 0.02 ? '正在扶起…' : '倒地 · 去扶') : m.healing > 0 ? '包扎中' : '';
    });
  }

  const api = {
    mates, lead, everyone,
    get enabled() { return enabled; },
    /** 联机（coop.js）：local 你扮演谁、puppet 客户端木偶模式、force 不看设置都出场。改了以后调 refresh() */
    net,
    /** 按角色 id 拿人（'lead' / 'zhe' / 'lin' / 'xu'） */
    byId: (id) => everyone.find((m) => m.id === id) || null,
    /** 这个人现在在不在场（画不画、算不算） */
    isOn: (m) => !!m && on(m),
    /** 联机里换了谁扮演谁（有人进来 / 走了）：重新算谁出场 */
    refresh() { enabled = (wanted || net.force) && !!siege?.enabled; if (api.spawned) show(true); paint(); },
    /** 设置里关掉队友（单人）：want = false */
    get wanted() { return wanted; }, set wanted(v) { wanted = !!v; },
    /** 每局开始 / 重来：站到你身后，血回满 */
    reset() {
      enabled = (wanted || net.force) && !!siege?.enabled; sayT = 0;
      for (const m of everyone) { m.joined = false; m.hp = m.maxHp; m.remote = null; m.down = false; m.fallK = 0; m.target = null; m.reviveT = 0; m.kills = 0; m.shots = 0; m.cool = 1; m.healT = 12; m.healing = 0; m.pathJob?.cancel?.(); m.pathJob = null; m.path = null; }
      show(false); api.spawned = false; trail.ready = false;
      paint();
    },
    /** 到了安全点：倒地的缓过来，都回一截血 */
    rally() { if (!enabled) return; for (const m of mates) { if (m.down) { m.getUp(P.down.hp, true); if (api.spawned) m.warp(); } m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.4); } paint(); },
    /** 尸潮规模的倍数：有站着的队友才加 */
    get hordeScale() { return enabled && api.spawned && mates.some((m) => !m.down) ? P.horde : 1; },
    /** 救出来的人（小许）：从 at 出来，跟着你。exit：先走到门外这一点（从店里放出来，别让他自己在店里找站位） */
    join(id, at, { exit = null } = {}) { const m = guests.find((q) => q.id === id); if (!m) return null; m.joined = true; m.hp = m.maxHp; m.down = false; m.reviveT = 0; m.fallK = 0; m.biters = []; m.biteAt.clear(); m.hide = null; m.bitten = 0; m.help = null; m.place(at, 0);
      m.exitTo = exit ? new THREE.Vector3(exit.x, exit.y ?? at.y, exit.z) : null; m.exitT = 4; m.lostT = 0; m.seenP = true; m.offArea = false; m.slotK = 0; m.goalSeen = true; if (api.spawned || !enabled) { m.root.visible = true; m.active = true; } m.pose(0.016); paint(); return m; },
    leave(id) { const m = guests.find((q) => q.id === id); if (!m || !m.joined) return; m.joined = false; m.root.visible = false; m.active = false; m.pathJob?.cancel?.(); paint(); },
    get guest() { return guests.find((m) => m.joined) || null; },
    update(dt) {
      sayT -= dt;
      const joined = guests.filter((m) => m.joined);
      if (!enabled && !joined.length) { if (api.spawned) { show(false); api.spawned = false; } return; }
      const playing = G.game?.state === 'playing' && G.player?.alive !== false, riding = !!director?.riding;
      if (!playing || riding) { if (api.spawned && riding) show(false); if (riding) api.spawned = false; return; }
      if (!api.spawned) { api.spawned = true; show(true); if (!net.puppet) for (const m of [...mates, lead]) if (m && on(m) && !m.remote) { m.warp(); m.pose(0.016); } }
      track();
      for (const m of everyone) { if (!on(m)) continue; try { m.update(Math.min(dt, 0.05), everyone.filter(on)); } catch (e) { console.error('[零点突围] 队友出错', e); } }
      paint();
    },
    buildUi() {
      if (!ui || typeof document === 'undefined' || hud) return;
      hud = document.createElement('div'); hud.className = 'jm-squad off';
      hud.innerHTML = everyone.map((m) => `<div class="m"><em style="font-style:normal">${m.name}</em><i><b></b></i><span></span></div>`).join('');
      (ui.querySelector('.hud') || ui).appendChild(hud);
      for (const dl of ui.querySelectorAll('.m-stats')) { const row = document.createElement('div'); row.hidden = true; row.innerHTML = '<dt>队友击倒</dt><dd></dd>'; dl.appendChild(row); statRows.push(row); }
    },
    dispose() {
      group.removeFromParent(); mat.dispose(); lampMat.dispose(); lampGeo.dispose(); hud?.remove(); for (const row of statRows) row.remove();
      for (const m of everyone) { m.pathJob?.cancel?.(); for (const g of Object.values(m.parts)) g?.dispose?.(); for (const set of Object.values(m.parts.held || {})) for (const g of Object.values(set || {})) g?.dispose?.(); m.root.traverse((o) => { if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } }); }
    },
  };
  return api;
}
