// 丧尸围城三人联机：接到游戏上的那一层（网络在 net.js，压缩 / 插值在 sync.js，大厅界面在 lobby.js，服务器在 cloud/rooms/）。
// 规则：主机说了算。
//   主机：整局照单人那样跑（丧尸 AI、关卡导演、队友）。座位 1、2 上的真人顶替阿哲、林医生——那个队友不再由电脑开，位置朝向照他报的走（squad.js 的 m.remote），
//         丧尸把他当目标（G.zombieTarget 给一个代理），挨咬、倒地、被扶起都在主机上算。他报的命中（哪只、第几回出场、多少伤害）核对一下就打上去。
//   客户端：自己的人照常走、开枪（本地手感不变）；丧尸、队友、主机的人都是木偶，照主机的快照插值着摆（zombie.js 的 puppet、squad.js 的 net.puppet）；
//         关卡跟着主机的步数走（siege.follow），按交互键做目标做到最后一下停住、请主机定。血量、倒地听主机的。
//   座位 → 角色：0 主角、1 阿哲、2 林医生（sync.js 的 ROLES）。没人坐的座位是电脑队友；有人走了，那个角色从他站的地方接着由电脑开。
//   中途加入：拿开局信息（种子、哪栋楼）抽同一局，按主机的步数补上前面的目标，站到自己那个角色现在的位置上（倒着的就倒着进来）。
//   主机走了：服务器把下一个人提成主机，他接着跑这一局（木偶接着当真丧尸跑）。
// 给后面的玩法规则留的口子（hooks）：rewardMul（多人资源翻倍）、players()、on(type, fn) / send(type, data)（自定义消息）、
//   extend(name, { write, read })（往快照里加字段：直升机第二挺机枪、第三个人在机上……）、events 'coop:*'。
import * as THREE from 'three';
import { NET, ROLES, CHARS, PART_CODES, WEAPON_CODES, encodeZombie, encodeChar, encodeInput, decodeInput, createDeltaWriter, createMirror, createInterp, createNetClock, validateHits, seededRng, qp, dp } from './sync.js';
import { createRoomClient, serverUrl, randomCode } from './net.js';
import { createLobby, LOBBY_CSS } from './lobby.js';
import { SIEGE } from '../siege.js';

export { LOBBY_CSS };
/**
 * reward：多人（房间里不止你一个真人）时资源乘几（玩法规则那边接）；cutHold：客户端做目标做到这个进度停住，等主机定；
 * cutReach：主机认客户端完成目标时，他离目标多远以内；cutEvery：多久重发一次请求；
 * targetEvery：主机多久给每只丧尸重挑一次追谁；stick：换目标要近多少米才换（不来回摇摆）；
 * down：客户端倒地时多久提示一次；shotRange：别人开枪的弹道画多长
 */
export const COOP = Object.freeze({
  reward: 2, cutHold: 0.97, cutReach: 4.5, cutEvery: 0.6, targetEvery: 0.5, stick: 3, down: 3, shotRange: 30,
  noise: Object.freeze({ rifle: SIEGE.noise.rifle, pistol: SIEGE.noise.pistol, smg: SIEGE.noise.smg, launcher: SIEGE.noise.launcher, knife: 0, axe: 0 }),
});
const ROLE_NAME = Object.freeze({ lead: '主角', zhe: '阿哲', lin: '林医生', xu: '小许' });
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/**
 * 接到游戏上（run.js 在丧尸围城的各模块建好以后调）。返回 api：
 *   mode：'off'（单人，和以前一模一样）/ 'host' / 'client'；pre(dt)（每帧在敌人、队友更新之前）、post(dt)（每帧最后）；
 *   open()（打开大厅）、players()、rewardMul、stats()、on / send / extend、dispose()
 */
export function createCoop(G, { squad, zombies, siege, director, ui = null, params = {}, storage = null, WS = globalThis.WebSocket, scene = null } = {}) {
  const handlers = {}, extensions = new Map();
  const C = {
    mode: 'off', room: null, seat: -1, host: -1, players: [], started: false, round: 0, seed: 0, code: '', name: '',
    hostStage: 0, wantStart: null, keyed: false, placed: false, down: false, downPos: new THREE.Vector3(), downSay: 0,
    snapT: 0, inputT: 0, cutT: 0, mirror: createMirror(), writer: createDeltaWriter(),
    inputs: new Map(), // 主机：座位 → { clock, buf, last }
    kills: [], shots: [], radio: [], hits: [], outShots: [], cutReq: -1, sv: '', extOut: {},
    frame: { worst: 0, sum: 0, n: 0 }, lastTarget: new Map(),
    // self：主机这台机器上的你倒地了没有、被扶到几成（联机玩法规则 rules.js 写，快照照它发；单人时一直是没倒）
    self: { down: false, revive: 0 }, boardHook: null,
  };
  const inputExt = new Map(); // 客户端的操作里带的自定义字段（rules.js：直升机上的机枪朝向、机舱里站在哪）
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const pool = zombies?.pool || [];
  const emit = (t, e) => { for (const f of handlers[t] || []) { try { f(e); } catch (err) { console.error('[联机]', t, err); } } G.events?.emit?.(`coop:${t}`, e); };
  const local = () => squad?.net?.local || 'lead';
  const roleOf = (seat) => ROLES[seat] || null;
  const humans = () => C.players.length;
  const isHostRoom = () => C.mode === 'host' && !!C.room;
  const nameOf = (seat) => C.players.find((p) => p.seat === seat)?.name || null;
  let lobby = null;

  // ---- 角色：谁扮演谁（有人进来、走了、换主机都重排一遍）----
  function applyRoles() {
    if (!squad) return;
    const mine = C.seat >= 0 ? roleOf(C.seat) : 'lead';
    const changed = squad.net.local !== mine;
    squad.net.local = mine; squad.net.force = C.mode !== 'off';
    for (const role of ROLES) {
      const m = squad.byId(role); if (!m) continue;
      const seat = ROLES.indexOf(role), p = C.players.find((q) => q.seat === seat);
      m.rename(p && seat !== C.seat ? p.name : null);
      if (C.mode === 'host' && (!p || seat === C.seat)) { m.remote = null; C.inputs.delete(seat); } // 没人了：电脑接手（从他站的地方）
    }
    // 自己扮演的角色血量上限照角色来（阿哲 130、林医生 90）
    const me = squad.byId(mine); if (G.player && me) { G.player.maxHealth = mine === 'lead' ? 100 : me.maxHp; if (changed) G.player.health = Math.min(G.player.health, G.player.maxHealth); }
    squad.refresh();
  }

  // ---- 主机：丧尸追离它最近的真人（远程玩家用代理对象）----
  const proxies = new Map();
  function proxyOf(m) {
    let p = proxies.get(m); if (p) return p;
    p = { vel: new THREE.Vector3(), get pos() { return m.pos; }, get alive() { return !m.down && m.hp > 0; }, get yaw() { return m.yaw + Math.PI; }, mate: m,
      damage(n) { if (m.down || !(n > 0)) return; m.hp -= n; m.hurtT = 0.6; G.events?.emit?.('squad:bite', { mate: m, damage: n }); }, addShake() {} };
    proxies.set(m, p); return p;
  }
  // 主机上的你倒地了、真人又都倒了：丧尸去扑还站着的电脑队友（代理不扣血——队友挨咬照 squad.js 自己那套「贴着就掉血」算）
  const npcProxies = new Map();
  function npcProxy(m) {
    let p = npcProxies.get(m); if (p) return p;
    p = { vel: new THREE.Vector3(), get pos() { return m.pos; }, get alive() { return !m.down && m.hp > 0; }, get yaw() { return m.yaw + Math.PI; }, mate: m, damage() {}, addShake() {} };
    npcProxies.set(m, p); return p;
  }
  const selfUp = () => G.player?.alive !== false && !C.self.down;
  function zombieTarget(z) {
    const remotes = squad?.everyone?.filter((m) => m.remote && !m.down) || [];
    if (!remotes.length && selfUp()) return null;
    const now = G.time?.t || 0, rec = C.lastTarget.get(z);
    if (rec && now - rec.t < COOP.targetEvery && (rec.p === G.player ? selfUp() : rec.p.alive)) return rec.p;
    // 离得近的优先（隔层的算远很多）；正在追的那个让 stick 米——别人近不了这么多就不换（免得两个人中间来回摇摆）
    const score = (p, alive) => (alive ? Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z) + Math.abs(p.pos.y - z.pos.y) * 4 - (rec?.p === p ? COOP.stick : 0) : Infinity);
    let best = G.player, bs = score(G.player, selfUp());
    for (const m of remotes) { const pr = proxyOf(m), s = score(pr, true); if (s < bs) { best = pr; bs = s; } }
    if (bs === Infinity) for (const m of squad?.mates || []) { if (m.remote || m.down || !squad.isOn(m)) continue; const pr = npcProxy(m), s = score(pr, true); if (s < bs) { best = pr; bs = s; } }
    C.lastTarget.set(z, { p: best, t: now });
    return best;
  }

  // ---- 主机：收客户端的操作 ----
  function onInput(msg) {
    const seat = msg.f, role = roleOf(seat), m = squad?.byId(role); if (!m || seat === C.seat) return;
    const s = decodeInput(msg.p);
    let rec = C.inputs.get(seat);
    if (!rec) { rec = { clock: createNetClock({ delay: 0.1 }), buf: createInterp(), last: null }; C.inputs.set(seat, rec); }
    if (s && Number.isFinite(msg.ct)) {
      // 轻度核对：一下子挪了很远（坐电梯、走快速楼梯、传送）直接跳过去，不插值
      if (rec.last && (Math.hypot(s.x - rec.last.x, s.z - rec.last.z) > 6 || Math.abs(s.y - rec.last.y) > 2)) rec.buf.reset(msg.ct, s); else rec.buf.push(msg.ct, s);
      rec.clock.sample(msg.ct, G.time?.t || 0); rec.last = s;
      if (!m.remote) { m.remote = { ...s }; if (!m.down) m.place?.(s, wrapA(s.yaw + Math.PI)); m.target = null; }
    }
    // 他开的枪：从他的人形的枪口画弹道、出响动（围城的响动条、尸群）
    for (const sh of (msg.sh || []).slice(0, 12)) {
      if (!Array.isArray(sh) || sh.length < 4) continue;
      const kind = WEAPON_CODES[sh[3]] || 'rifle', dir = tmp.set(sh[0] / 100, sh[1] / 100, sh[2] / 100); if (dir.lengthSq() < 0.5) continue; dir.normalize();
      const from = m.muzzle?.lengthSq?.() ? m.muzzle : tmp2.set(m.pos.x, m.pos.y + 1.4, m.pos.z), end = from.clone().addScaledVector(dir, COOP.shotRange);
      G.fx?.tracer?.(from.clone(), end, { color: 0xffe0a0, speed: 260, width: 0.025 }); G.fx?.muzzleFlash?.(from.clone(), dir.clone(), { scale: 0.5 });
      if (COOP.noise[kind]) siege?.addNoise?.(COOP.noise[kind], m.pos);
      C.shots.push([CHARS.indexOf(role), qp(end.x), qp(end.y), qp(end.z)]);
    }
    // 他报的命中：核对完打上去（记在他名下：netBy）
    // 坐直升机清扫时：从机身中心量（楼顶、楼下的离飞机一百多米；他的人这会儿收起来了，位置不准）
    const ride = director?.riding ? director.vehicleCenter?.() : null;
    for (const [name, v] of Object.entries(msg.x || {})) { try { inputExt.get(name)?.read?.(seat, v); } catch (e) { console.error('[联机] 操作字段出错', name, e); } }
    for (const h of validateHits(msg.hit, (i) => pool[i], ride || m.pos, ride ? { range: NET.rideRange } : undefined)) {
      h.z.netBy = seat;
      try { h.z.damage(h.damage, null, null, h.part, 'squad'); } catch (e) { console.error('[联机] 命中出错', e); }
      h.z.netBy = null;
    }
    // 他做完了一个目标（按交互键做到最后一下）：是眼下这一步、人在跟前，就算
    if (Number.isInteger(msg.cut)) {
      const relays = G.game?.run?.relays || [], i = relays.findIndex((r) => !r.cut), o = relays[i]?.o;
      if (i === msg.cut && o?.pos && !o.locked && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < COOP.cutReach && Math.abs(o.pos.y - m.pos.y) < 2.5) { G.game.debugCut(); G.hud?.message?.(`${m.label}：${o.label || '目标'}搞定`, 2.5); }
    }
    emit('input', { seat, msg });
  }

  // ---- 主机：一帧快照 ----
  function charOf(m, role) {
    if (role === local()) { // 这台机器上的你：照你自己的人
      const p = G.player, v = p.vel || tmp.set(0, 0, 0);
      return { role, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: wrapA((p.yaw || 0) + Math.PI), pitch: p.pitch || 0, speed: Math.hypot(v.x, v.z), down: p.alive === false || C.self.down, revive: C.self.revive, on: true, crouch: !!p.crouching, hp: C.self.down ? 0 : p.health, human: true, weapon: G.weapon?.current };
    }
    if (!m) return null;
    return { role, x: m.pos.x, y: m.pos.y, z: m.pos.z, yaw: m.yaw, pitch: m.pitch || 0, speed: m.speed || 0, down: !!m.down, on: !!squad.isOn(m), crouch: !!m.remote?.crouch, healing: m.healing > 0, hp: m.hp, revive: m.reviveT, human: !!m.remote, weapon: m.remote?.weapon };
  }
  function snapshot(dt, force = false) {
    const people = [G.player.pos, ...(squad?.everyone || []).filter((m) => m.remote).map((m) => m.pos)], R = director?.riding ? NET.rideNear : NET.near;
    const entries = [];
    for (let i = 0; i < pool.length; i++) {
      const z = pool[i]; if (!z.active) continue;
      if (!people.some((p) => Math.abs(p.x - z.pos.x) < R && Math.abs(p.z - z.pos.z) < R && Math.hypot(p.x - z.pos.x, p.z - z.pos.z) < R)) continue;
      entries.push([i, encodeZombie(z, i)]);
    }
    const d = C.writer.write(dt, entries, force);
    const msg = { t: 's', ht: +(G.time?.t || 0).toFixed(3), k: d.k, z: d.z, round: C.round, stage: siege?.state?.stage ?? 0 };
    if (d.rm.length) msg.rm = d.rm;
    msg.c = CHARS.map((role) => charOf(squad?.byId(role), role)).filter(Boolean).map(encodeChar);
    const sv = JSON.stringify(siege?.followOut?.() || {}); if (d.k || sv !== C.sv) { msg.sv = JSON.parse(sv); C.sv = sv; }
    const heli = director?.vehicles?.heli?.root; if (heli?.visible) msg.h = [qp(heli.position.x), qp(heli.position.y), qp(heli.position.z), Math.round(heli.rotation.y * 100)];
    if (C.kills.length) msg.kill = C.kills.splice(0);
    if (C.shots.length) msg.sh = C.shots.splice(0, 40);
    if (C.radio.length) msg.r = C.radio.splice(0, 6);
    if (director?.riding) msg.ride = 1;
    for (const [name, ext] of extensions) { try { const v = ext.write?.(); if (v !== undefined) (msg.x ||= {})[name] = v; } catch (e) { console.error('[联机] 快照字段出错', name, e); } }
    C.room.send(msg);
  }

  // ---- 客户端：照快照摆 ----
  const zState = {};
  let tellRide = 0;
  function onSnap(msg) {
    if (!C.started || (msg.round !== undefined && msg.round !== C.round)) return; // 还没开局 / 上一局的
    const res = C.mirror.ingest(msg, G.time?.t || 0);
    if (!C.mirror.keyed) return;
    C.hostStage = msg.stage ?? C.hostStage;
    for (const idx of res.gone) { const z = pool[idx]; if (z?.active) z._deactivate(); }
    for (const idx of res.spawn) {
      const e = C.mirror.zombies.get(idx), z = pool[idx]; if (!z || !e) continue;
      if (!e.st.alive) { if (z.active && z.gen === e.gen) continue; if (z.active) z._deactivate(); continue; } // 主机那边已经死了的：不放尸体
      spawnPuppet(idx, e);
    }
    for (const [idx, gen, seat, part] of res.kills) {
      const z = pool[idx]; if (!z?.active || z.gen !== gen || !z.alive) continue;
      z.netKill?.(null, PART_CODES[part] || 'body', seat === C.seat ? null : 'squad');
    }
    // 主机那边死了但这一帧没收到击倒事件（中途加入时）：直接倒下
    for (const [idx, e] of C.mirror.zombies) { const z = pool[idx]; if (z?.active && z.alive && z.gen === e.gen && !e.st.alive) z.netKill?.(null, 'body', 'squad'); }
    if (msg.sv) siege?.followState?.(msg.sv);
    if (msg.h) { const h = director?.vehicles?.heli?.root; if (h && !director.riding) { h.visible = true; h.position.set(dp(msg.h[0]), dp(msg.h[1]), dp(msg.h[2])); h.rotation.y = msg.h[3] / 100; } }
    for (const sh of msg.sh || []) drawShot(sh);
    for (const [text, secs] of msg.r || []) hostRadio(text, secs);
    if (msg.ride && !director?.riding && (tellRide -= 1) <= 0) { tellRide = 60; G.hud?.message?.('房主上了直升机，正在清扫', 3); }
    if (msg.x) for (const [name, v] of Object.entries(msg.x)) { try { extensions.get(name)?.read?.(v); } catch (e) { console.error('[联机] 快照字段出错', name, e); } }
    emit('snap', msg);
  }
  function spawnPuppet(idx, e) {
    const s = e.st, z = zombies.activate(idx, tmp.set(s.x, s.y, s.z), { kind: s.kind, yaw: s.yaw, fixed: s.fixed });
    if (!z) return;
    z.gen = e.gen; z.net = { x: s.x, y: s.y, z: s.z, yaw: s.yaw, zs: s.zs, lunge: s.lunge }; z.hp = s.hp * z.maxHp; z.sweep = s.sweep ? (z.sweep || { net: true }) : null;
    puppetDamage(z, idx);
  }
  /** 客户端：打中木偶丧尸——记一条命中报给主机（主机核对完才真掉血），这边先冒血、血条先往下掉一点 */
  function puppetDamage(z, idx) {
    if (!z._hostDamage) z._hostDamage = z.damage;
    z.damage = (amount, point, dir, part) => {
      if (!z.alive || !(amount > 0)) return false;
      if (C.hits.length < NET.hitsPerPack) C.hits.push([idx, z.gen | 0, Math.round(Math.min(NET.claim, amount)), part === 'weak' ? 1 : 0]);
      z.netHitT = G.time?.t || 0; z.hp = Math.max(1, z.hp - amount);
      G.events?.emit?.('enemy:hit', { enemy: z, point, part: part || 'body' });
      if (point) G.fx?.smoke?.(point, { size: 0.18, life: 0.4, color: 0x3a0b0b, rise: 0.15 });
      return false;
    };
  }
  function drawShot(sh) {
    const role = CHARS[sh[0]]; if (!role || role === local()) return;
    const m = squad?.byId(role); if (!m || !squad.isOn(m)) return;
    const end = new THREE.Vector3(dp(sh[1]), dp(sh[2]), dp(sh[3])), from = m.muzzle?.lengthSq?.() ? m.muzzle.clone() : new THREE.Vector3(m.pos.x, m.pos.y + 1.4, m.pos.z);
    G.fx?.tracer?.(from, end, { color: 0xffe0a0, speed: 260, width: 0.025 }); G.fx?.muzzleFlash?.(from, end.clone().sub(from).normalize(), { scale: 0.45 });
    m.recoil = 1;
  }
  const recentRadio = [];
  function hostRadio(text, secs) {
    const now = G.time?.t || 0;
    for (let i = recentRadio.length - 1; i >= 0; i--) if (now - recentRadio[i].t > 6) recentRadio.splice(i, 1);
    if (recentRadio.some((q) => q.text === text)) return; // 自己这边刚说过（跟着关卡走的那几句两边都会说）
    origRadio?.(text, secs);
  }
  /** 客户端每帧：丧尸、人物摆到插值好的位置；自己的血量、倒地照主机 */
  function clientPre(dt) {
    const t = G.time?.t || 0;
    for (const [idx] of C.mirror.zombies) {
      const z = pool[idx]; if (!z?.active || !z.alive) continue;
      const s = C.mirror.zombieAt(idx, t, zState); if (!s) continue;
      (z.net ||= {}); z.net.x = s.x; z.net.y = s.y; z.net.z = s.z; z.net.yaw = s.yaw; z.net.zs = s.zs; z.net.lunge = s.lunge;
      if (!((G.time?.t || 0) - (z.netHitT ?? -9) < 0.3)) z.hp = Math.max(1, s.hp * z.maxHp); // 刚打中的那一下先别被旧快照的血量顶回去
    }
    if (!squad) return;
    for (const role of CHARS) {
      if (role === local()) continue;
      const m = squad.byId(role), e = C.mirror.chars.get(role); if (!m || !e) continue;
      if (role === 'xu') { if (e.st.on && !m.joined) squad.join('xu', { x: e.st.x, y: e.st.y, z: e.st.z }); else if (!e.st.on && m.joined) squad.leave('xu'); }
      const s = C.mirror.charAt(role, t, zState); if (!s) continue;
      const d = Math.hypot(s.x - m.pos.x, s.z - m.pos.z);
      m.speed = d < 3 && dt > 0 ? m.speed + (d / dt - m.speed) * Math.min(1, dt * 8) : s.speed;
      m.pos.set(s.x, s.y, s.z); m.yaw = s.yaw; m.pitch = s.pitch; m.down = e.st.down; m.hp = e.st.hp; m.reviveT = e.st.revive; m.healing = e.st.healing ? 1 : 0;
    }
    // 自己：血量、倒地
    const me = C.mirror.chars.get(local())?.st, p = G.player;
    if (me && p) {
      if (!C.placed && G.game?.state === 'playing') placeMe(me);
      if (me.down && !C.down) { C.down = true; C.downPos.copy(p.pos); C.downSay = 0; G.arms?.setLowered?.(1); emit('down', { seat: C.seat }); }
      else if (!me.down && C.down) { C.down = false; G.arms?.setLowered?.(0); G.hud?.message?.('你被扶起来了', 2); emit('up', { seat: C.seat }); }
      const want = Math.max(C.down ? 1 : 0, Math.min(p.maxHealth || 100, me.hp));
      if (want < p.health - 0.5 && want > 0) { const d = p.health - want; p.invulnerable = false; p.damage?.(d, null); }
      else if (want > 0) p.health = want;
      p.invulnerable = true; // 本地不掉血：伤害都是主机算的（不然自己扔的手雷、摔一下就把本地的人「打死」了）
    }
    if (C.down && p && !director?.riding) { // 坐上飞机了（登机时大家都扶起来了，快照还没跟上）：不再按在地上
      p.pos.copy(C.downPos); p.vel?.set?.(0, 0, 0);
      if ((C.downSay -= dt) <= 0) { C.downSay = COOP.down; G.hud?.message?.('你倒下了——等队友过来，站到你跟前三秒把你扶起来', COOP.down); }
    }
    // 跟上主机的步数（中途加入、主机做完了一步）：一帧补一步
    if (siege?.state && G.game?.state === 'playing' && (siege.state.stage < C.hostStage)) G.game.debugCut?.();
    // 自己按交互键做目标：做到最后一下停住，请主机定（主机认了，下一帧快照的步数就过去了）
    const relays = G.game?.run?.relays || [];
    C.cutT -= dt;
    relays.forEach((r, i) => { if (!r.cut && r.t >= COOP.cutHold) { r.t = COOP.cutHold; if (C.cutT <= 0) { C.cutReq = i; C.cutT = COOP.cutEvery; } } });
  }
  /** 中途加入 / 开局：站到自己扮演的那个角色现在的位置（主机那边电脑开着他走到哪儿了）；他倒着就倒着进来 */
  function placeMe(st) {
    C.placed = true;
    if (!st.on || !G.player) return;
    C.placedAt = { x: +st.x.toFixed(2), y: +st.y.toFixed(2), z: +st.z.toFixed(2), down: !!st.down };
    G.player.pos.set(st.x, st.y, st.z); G.player.yaw = wrapA(st.yaw - Math.PI); G.player.vel?.set?.(0, 0, 0); G.physics?.forget?.(G.player.pos);
    if (st.down) { C.down = true; C.downPos.copy(G.player.pos); G.arms?.setLowered?.(1); }
    emit('placed', st);
  }
  function clientPost(dt) {
    if ((C.inputT += dt) < 1 / NET.inputHz - 1e-6) return;
    C.inputT = Math.min(C.inputT - 1 / NET.inputHz, 1 / NET.inputHz); // 减掉而不是清零：帧率不整除时也是每秒 inputHz 次
    const p = G.player; if (!p) return;
    const v = p.vel || tmp.set(0, 0, 0);
    const msg = { t: 'i', ct: +(G.time?.t || 0).toFixed(3), p: encodeInput({ x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, speed: Math.hypot(v.x, v.z), crouch: !!p.crouching, sprint: !!p.sprinting, weapon: G.weapon?.current }) };
    if (C.outShots.length) msg.sh = C.outShots.splice(0, 12);
    if (C.hits.length) msg.hit = C.hits.splice(0);
    if (C.cutReq >= 0) { msg.cut = C.cutReq; C.cutReq = -1; }
    for (const [name, ext] of inputExt) { try { const v = ext.write?.(); if (v !== undefined) (msg.x ||= {})[name] = v; } catch (e) { console.error('[联机] 操作字段出错', name, e); } }
    C.room?.send(msg);
  }

  // ---- 进出模式 ----
  /** 当客户端：丧尸、队友当木偶，关卡跟着主机走 */
  function becomeClient() {
    C.mode = 'client';
    if (zombies) zombies.puppet = true;
    if (siege) siege.follow = true;
    if (squad) squad.net.puppet = true;
    G.zombieTarget = null;
    for (let i = 0; i < pool.length; i++) if (pool[i].active) pool[i]._deactivate(); // 本地已经放出来的（标题画面背后、单人时的）收起来，等主机的快照
    for (let i = 0; i < pool.length; i++) puppetDamage(pool[i], i);
    applyRoles();
  }
  /** 当主机（建房、主机迁移、离开房间以后自己接着玩）：木偶接着当真丧尸跑，关卡自己导演 */
  function becomeHost(solo = false) {
    C.mode = solo ? 'off' : 'host';
    if (zombies) zombies.puppet = false;
    for (const z of pool) if (z._hostDamage) { z.damage = z._hostDamage; z._hostDamage = null; }
    if (siege) siege.follow = false;
    if (squad) { squad.net.puppet = false; for (const m of squad.everyone) m.remote = null; }
    if (G.player) { G.player.invulnerable = false; if (C.down) { C.down = false; G.arms?.setLowered?.(0); } }
    G.zombieTarget = solo ? null : zombieTarget;
    C.inputs.clear(); C.writer.keyNow(); C.mirror.reset();
    if (solo) { C.seat = -1; C.players = []; C.started = false; }
    applyRoles();
  }

  // ---- 开局 ----
  /** 主机按「开始」：抽一个种子，大家按它抽同一局 */
  function hostStart() {
    if (C.mode !== 'host') return;
    if (siege && !siege.enabled) { siege.enabled = true; }
    G.game?.start?.({ skipIntro: true }); // onReset（下面包的那一层）会发 start
  }
  function startMsg(stage = 0) { return { t: 'start', seed: C.seed, tower: siege?.towerPick || null, round: C.round, stage }; }
  /** 客户端收到开局（含中途加入）：按种子抽同一局、开打，步数跟上主机 */
  function clientStart(st, snap = null) {
    if (!st) return;
    C.seed = st.seed >>> 0; C.round = st.round ?? C.round; C.hostStage = st.stage || 0; C.placed = false; C.down = false;
    C.mirror.reset();
    if (siege) { siege.enabled = true; siege.towerPick = st.tower || null; }
    C.started = true;
    G.game?.start?.({ skipIntro: true });
    lobby?.close(); // 开打了：大厅收起来（还在房间里，标题菜单 / 暂停里随时能再打开）
    if (snap) { try { onSnap(JSON.parse(snap)); } catch { /* 完整帧坏了：等下一帧 */ } }
    emit('start', st);
  }
  // 每局开始（含重开、读档）：主机抽种子发给大家；客户端用同一个种子（自己点了重开也还是主机那一局）
  const baseReset = G.level?.onReset;
  if (G.level) G.level.onReset = () => {
    if (C.mode === 'host' && C.room) {
      const d = director?.state, keep = !!(d?.retryArmed && d.checkpoint && d.mission);
      if (!keep) { C.seed = (Math.random() * 2 ** 32) >>> 0; C.round++; }
      siege?.useRng?.(seededRng(C.seed));
      baseReset?.();
      C.writer.keyNow(); C.lastTarget.clear();
      C.room.send(startMsg(keep ? siege?.state?.stage || 0 : 0)); C.started = true;
      return;
    }
    if (C.mode === 'client') { siege?.useRng?.(seededRng(C.seed)); baseReset?.(); for (const z of pool) if (z.active) z._deactivate(); C.mirror.reset(); C.placed = false; return; }
    // 不在房间里：和以前一样；联机时换过的角色换回主角
    if (squad && (squad.net.local !== 'lead' || squad.net.force)) { squad.net.local = 'lead'; squad.net.force = false; if (G.player) G.player.maxHealth = 100; }
    baseReset?.();
  };
  // 客户端：到了登机门先不上（第三个人上机还没做）——主机上机清扫
  const baseExtract = () => G.level?.onExtract;
  // 客户端走到登机门：交给 boardHook（rules.js：请主机让大家一起登机）；没接规则时只提示
  const clientExtractGuard = () => { if (C.mode === 'client' && G.level && G.level.onExtract && !G.level.onExtract.coop) { const f = () => { if (C.boardHook) C.boardHook(); else if ((C.boardSay = (C.boardSay || 0) - 1) <= 0) { C.boardSay = 120; G.hud?.message?.('联机时由房主登机清扫；你守住屋顶', 3); } emit('board', {}); }; f.coop = true; G.level.onExtract = f; } };
  void baseExtract;

  // ---- 网络 ----
  function connect(want, code, name) {
    leave(true);
    C.code = code; C.name = name;
    const url = serverUrl({ params, storage });
    const id = (() => { try { let v = storage?.getItem?.('jimao-mp-id'); if (!v) { v = randomCode(Math.random, 6) + Date.now().toString(36).slice(-4); storage?.setItem?.('jimao-mp-id', v); } return v; } catch { return ''; } })();
    const room = createRoomClient({ url, code, name, id, want, WS });
    C.room = room; lobby?.status('connecting');
    room.on('fail', ({ why }) => { if (C.room !== room) return; C.room = null; lobby?.status(why === 'offline' ? (url ? 'offline' : 'noserver') : why); emit('fail', { why }); });
    room.on('welcome', (w) => {
      if (C.room !== room) return;
      C.seat = w.seat; C.host = w.host; C.players = w.players; C.code = w.code || code;
      if (w.host === w.seat) becomeHost(false); else becomeClient();
      lobby?.status('in'); lobby?.render();
      emit('join', { seat: w.seat, host: w.host });
      if (w.started && w.host !== w.seat) clientStart(w.start, w.snap);
    });
    room.on('msg', (msg) => { if (C.room === room) onMessage(msg); });
    room.on('closed', ({ why }) => {
      if (C.room !== room) return;
      C.room = null; const wasClient = C.mode === 'client';
      becomeHost(true); lobby?.status('closed'); lobby?.render();
      G.hud?.message?.(wasClient ? '和房间断开了：接着一个人打（队友由电脑接手）' : '房间已关闭', 3.5);
      emit('leave', { why });
    });
  }
  function onMessage(msg) {
    switch (msg.t) {
      case 's': if (C.mode === 'client') onSnap(msg); return;
      case 'i': if (C.mode === 'host') onInput(msg); return;
      case 'start': if (C.mode === 'client') clientStart(msg); return;
      case 'need': C.writer.keyNow(); return;
      case 'peer': {
        C.players = msg.players || C.players; C.host = msg.host ?? C.host;
        if (msg.ev === 'join') { G.hud?.message?.(`${msg.name} 加入了（扮演${ROLE_NAME[roleOf(msg.seat)] || ''}）`, 3); if (C.mode === 'host') C.writer.keyNow(); }
        if (msg.ev === 'leave') { G.hud?.message?.(`${msg.name} 离开了${C.mode === 'host' ? '，由电脑接手' : ''}`, 3); C.inputs.delete(msg.seat); }
        applyRoles(); lobby?.render(); emit('peer', msg); return;
      }
      case 'host': {
        C.host = msg.seat;
        if (msg.seat === C.seat && C.mode === 'client') { becomeHost(false); G.hud?.message?.('房主走了：现在由你主持这一局', 3.5); C.room?.send(startMsg(siege?.state?.stage || 0)); }
        lobby?.render(); emit('host', msg); return;
      }
      case 'end': return;
      default: for (const f of handlers[msg.t] || []) { try { f(msg); } catch (e) { console.error('[联机]', msg.t, e); } }
    }
  }
  function leave(quiet = false) {
    const room = C.room; if (!room) return;
    C.room = null; room.close();
    becomeHost(true);
    if (!quiet) { lobby?.status('left'); lobby?.render(); G.hud?.message?.('离开了房间：接着一个人打', 3); }
  }

  // 客户端不自己放丧尸（关卡那边 finishStage 里招来的那几只、尸潮都在主机上放）：原游戏的 spawn 在客户端直接返回 null
  const baseSpawn = G.enemies?.spawn?.bind(G.enemies);
  if (G.enemies && baseSpawn) G.enemies.spawn = (type, ...rest) => (C.mode === 'client' && type === 'zombie' ? null : baseSpawn(type, ...rest));

  // ---- 事件 ----
  const on = (n, f) => G.events?.on?.(n, f);
  on('enemy:killed', (e) => {
    if (C.mode !== 'host' || !C.room || !e?.enemy?.zombie) return;
    const idx = pool.indexOf(e.enemy); if (idx < 0) return;
    const seat = e.enemy.netBy ?? (e.by === 'squad' ? -1 : C.seat);
    C.kills.push([idx, e.enemy.gen | 0, seat, e.part === 'weak' ? 1 : 0]);
    if (seat >= 0 && seat !== C.seat) { const m = squad?.byId(roleOf(seat)); if (m) m.kills++; }
  });
  on('weapon:fire', (e) => {
    if (!C.room || !e?.dir || e.doorGun || (director?.riding && director.crew?.seat !== 'cabin')) return; // 坐飞机时只有机舱里拿步枪的照常报弹道（舱门机枪的另外同步，见 rules.js）
    if (C.mode === 'client') { if (C.outShots.length < 12) C.outShots.push([Math.round(e.dir.x * 100), Math.round(e.dir.y * 100), Math.round(e.dir.z * 100), Math.max(0, WEAPON_CODES.indexOf(e.kind || 'rifle'))]); return; }
    if (C.mode === 'host') { const o = e.muzzle || e.origin; if (!o) return; const end = tmp.copy(o).addScaledVector(e.dir, COOP.shotRange); C.shots.push([CHARS.indexOf(local()), qp(end.x), qp(end.y), qp(end.z)]); }
  });
  on('squad:fire', (e) => {
    if (C.mode !== 'host' || !C.room || !e?.mate || !e.dir) return;
    const end = tmp.copy(e.pos).addScaledVector(e.dir, COOP.shotRange); C.shots.push([CHARS.indexOf(e.mate.id), qp(end.x), qp(end.y), qp(end.z)]);
  });
  // 无线电：主机说的转给大家（守屋顶的「第几波」、队友喊话）；客户端自己这边说过的记下来，免得说两遍
  const origRadio = G.hud?.radio?.bind(G.hud);
  if (G.hud && origRadio) G.hud.radio = (text, secs, ...rest) => {
    if (C.mode === 'host' && C.room && humans() > 1 && typeof text === 'string' && C.radio.length < 12) C.radio.push([text, secs || 3]);
    if (C.mode === 'client') recentRadio.push({ text, t: G.time?.t || 0 });
    return origRadio(text, secs, ...rest);
  };

  // ---- 大厅 ----
  lobby = ui ? createLobby({ ui, storage, params,
    state: () => ({ mode: C.mode, seat: C.seat, host: C.host, players: C.players, code: C.code, started: C.started || G.game?.state === 'playing', name: C.name, connected: !!C.room?.ready, roles: ROLES.map((r) => ROLE_NAME[r]) }),
    create: (name) => { const code = randomCode(); connect('create', code, name); },
    join: (code, name) => connect('join', code, name),
    start: () => hostStart(),
    leave: () => leave(false),
    rename: (name) => { C.name = name; C.room?.send({ t: 'name', name }); },
  }) : null;

  const api = {
    get mode() { return C.mode; }, get seat() { return C.seat; }, get host() { return C.host; }, get code() { return C.code; }, get round() { return C.round; },
    get inRoom() { return !!C.room; }, get room() { return C.room; }, get down() { return C.down; },
    /** 房间里几个真人 */
    get humans() { return C.room ? humans() : 0; },
    /** 主机这台机器上的你：{ down, revive }（rules.js 写，快照照它发、丧尸照它挑目标） */
    get self() { return C.self; },
    /** 客户端走到登机门时调（rules.js 接：请主机全员登机） */
    set boardHook(f) { C.boardHook = f || null; },
    /** 客户端每次发操作时带上的自定义字段：write() 在客户端调（返回 undefined 不带），read(seat, v) 在主机收到时调 */
    extendInput(name, ext) { inputExt.set(name, ext); return api; },
    /** 多人（房间里不止你一个真人）时资源乘几；单人 1 */
    get rewardMul() { return C.room && humans() > 1 ? COOP.reward : 1; },
    /** 三个座位现在是谁：{ seat, role, name, human, host, me, pos, hp, down } */
    players() {
      return ROLES.map((role, seat) => {
        const p = C.players.find((q) => q.seat === seat), m = role === local() ? null : squad?.byId(role);
        const pos = role === local() ? G.player?.pos : m?.pos;
        return { seat, role, name: p?.name || ROLE_NAME[role], human: !!p || (seat === C.seat) || (C.mode === 'off' && role === 'lead'), host: seat === C.host, me: role === local(), pos, hp: role === local() ? G.player?.health : m?.hp, down: role === local() ? (C.mode === 'client' ? C.down : G.player?.alive === false) : !!m?.down };
      });
    },
    roleOf, ROLE_NAME,
    /** 自定义消息：send('revive', { ... }) 默认发给主机（主机发给大家用 to: 'all'）；on('revive', (msg) => …)，msg.f 是谁发的座位号 */
    send(type, data = {}, to) { return C.room?.send({ ...data, t: type, ...(to !== undefined ? { to } : {}) }) || false; },
    on(type, fn) { (handlers[type] ||= []).push(fn); return api; },
    /** 往主机的快照里加一个字段：write() 在主机上每帧快照时调（返回 undefined 不发），read(v) 在客户端收到时调 */
    extend(name, ext) { extensions.set(name, ext); return api; },
    open() { lobby?.open(); },
    /** 在标题菜单上放「联机（三人）」按钮（box 前面） */
    entry(box) { return lobby?.entry(box) || null; },
    /** 直接进房间（测试 / 自动化用；界面上走大厅） */
    create(name = '玩家', code = randomCode()) { connect('create', code, name); return code; },
    join(code, name = '玩家') { connect('join', code, name); },
    start: hostStart, leave: () => leave(false),
    /** 网络和每帧开销：发了 / 收了多少条、多少字节，同步这一层每帧花了多少毫秒 */
    stats() { const s = C.room?.stats; const f = C.frame; return { mode: C.mode, seat: C.seat, net: s ? { sent: s.sent, recv: s.recv, bytesOut: s.bytesOut, bytesIn: s.bytesIn, byType: s.byType, secs: (Date.now() - s.since) / 1000 } : null, frameMs: { avg: f.n ? f.sum / f.n : 0, worst: f.worst, n: f.n }, zombies: C.mirror.zombies.size, keyed: C.mirror.keyed, hostStage: C.hostStage, stage: siege?.state?.stage, placedAt: C.placedAt || null }; },
    resetStats() { C.frame = { worst: 0, sum: 0, n: 0 }; if (C.room?.stats) Object.assign(C.room.stats, { sent: 0, recv: 0, bytesOut: 0, bytesIn: 0, byType: {}, since: Date.now() }); },
    /** 每帧在敌人、队友更新之前（run.js）：客户端摆木偶、跟步数；主机把远程玩家的位置插值好 */
    pre(dt) {
      if (C.mode === 'off') return;
      const t0 = performance.now();
      try {
        if (C.mode === 'client') { clientExtractGuard(); clientPre(dt); }
        else if (C.mode === 'host') for (const [seat, rec] of C.inputs) {
          const m = squad?.byId(roleOf(seat)); if (!m?.remote) continue;
          const t = rec.clock.renderT(G.time?.t || 0), s = t === null ? rec.last : rec.buf.sample(t, m.remote);
          if (s && s !== m.remote) Object.assign(m.remote, s);
        }
      } finally { C.preMs = performance.now() - t0; }
    },
    /** 每帧最后（run.js）：主机发快照、客户端发操作 */
    post(dt) {
      if (C.mode === 'off' || !C.room) return;
      const t0 = performance.now();
      try {
        if (C.mode === 'host') { if (C.started && humans() > 1 && G.game?.state !== 'title' && (C.snapT += dt) >= 1 / NET.snapHz - 1e-6) { C.snapT = Math.min(C.snapT - 1 / NET.snapHz, 1 / NET.snapHz); snapshot(1 / NET.snapHz); } }
        else if (G.game?.state === 'playing' || G.game?.state === 'paused') { if (C.down && G.player && !director?.riding) { G.player.pos.copy(C.downPos); G.player.vel?.set?.(0, 0, 0); } clientPost(dt); }
      } finally { const ms = performance.now() - t0 + (C.preMs || 0); C.frame.sum += ms; C.frame.n++; C.frame.worst = Math.max(C.frame.worst, ms); }
    },
    dispose() { leave(true); lobby?.dispose(); if (G.enemies && baseSpawn) G.enemies.spawn = baseSpawn; if (G.level && baseReset) G.level.onReset = baseReset; if (G.hud && origRadio) G.hud.radio = origRadio; G.zombieTarget = null; },
  };
  // 网址带 ?room=CODE：打开大厅、直接加入
  if (params.room && lobby) setTimeout(() => lobby.autoJoin(params.room), 1500); // 等加载画面后面那几帧（预热着色器、传贴图）过去再连
  // 封面「联机（三人）」入口带 ?mp=1（见 src/cover-options.js 的 MP_ENTRY）：没带房间码时进来就把大厅打开
  else if (params.mp === '1' && lobby) setTimeout(() => lobby.open(), 1500);
  return api;
}
