// 联机时别人看得见你在干什么（src/jimao/coop/ 的事件和人物标记、squad.js 的姿势、actions.js 的别人扔的手雷）：
// 扔手雷（客户端报给主机 → 主机核对后真扔一颗、算伤害、记在他名下 → 转给大家只画）、拿的武器（刀 / 手枪 / 步枪）、蹲、挥刀、开枪（火光、枪声）、换弹；
// 编码来回、核对规则、服务器那一层（事件只到主机、客户端冒充不了快照；大厅的准备 / 延迟）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, clear } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { addZombies } from '../src/jimao/zombie.js';
import { createSquad, HELD, POSE } from '../src/jimao/squad.js';
import { createActions } from '../src/jimao/actions.js';
import { createCoop } from '../src/jimao/coop/coop.js';
import { createRoomCore, ROOM } from '../cloud/rooms/room-core.js';
import { FPS_MISSION } from '../src/fps/mission-layout.js';
import { EVT, encodeEvent, decodeEvent, validThrow, encodeChar, decodeChar, encodeInput, decodeInput } from '../src/jimao/coop/sync.js';

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' });
const S0 = FPS_MISSION.spawn, Y0 = L.levels.find((l) => l.id === S0.floor).elev;
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };
const worlds = []; after(() => { for (const w of worlds) { try { w.coop.dispose(); } catch { /* */ } } });

test('事件编码：扔东西（种类、出手点、速度、引信）、挥刀来回一遍；坏数据不认；人物和操作多了冲刺、换弹、包扎', () => {
  const t = { type: 'throw', role: 'zhe', kind: 'fire', pos: { x: 12.34, y: 3.5, z: -7.81 }, vel: { x: 9.6, y: 4.2, z: -11.05 }, fuse: 2 };
  const d = decodeEvent(JSON.parse(JSON.stringify(encodeEvent(t))));
  assert.equal(d.type, 'throw'); assert.equal(d.role, 'zhe'); assert.equal(d.kind, 'fire'); assert.equal(d.fuse, 2);
  for (const k of ['x', 'y', 'z']) { assert.ok(Math.abs(d.pos[k] - t.pos[k]) < 0.03); assert.ok(Math.abs(d.vel[k] - t.vel[k]) < 0.03); }
  for (const kind of ['frag', 'fire', 'lure', 'shell']) assert.equal(decodeEvent(encodeEvent({ ...t, kind })).kind, kind);
  assert.deepEqual(decodeEvent(encodeEvent({ type: 'swing', role: 'lin' })), { type: 'swing', role: 'lin' });
  for (const bad of [null, 5, [], [9, 0], [0, 7, 0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 0, 1, 2], [0, 1, 0, 'x', 2, 3, 4, 5, 6, 7], [0, 1, 9, 1, 2, 3, 4, 5, 6, 7], { 0: 0 }]) assert.equal(decodeEvent(bad), null, JSON.stringify(bad));
  // 核对：离扔的人不远、速度不离谱、引信不离谱
  const from = { x: 12, y: 2.2, z: -8 };
  assert.equal(validThrow(d, from), true);
  assert.equal(validThrow({ ...d, pos: { x: 40, y: 3, z: 0 } }, from), false, '离他太远');
  assert.equal(validThrow({ ...d, vel: { x: 200, y: 0, z: 0 } }, from), false, '太快');
  assert.equal(validThrow({ ...d, fuse: 0 }, from), false); assert.equal(validThrow({ ...d, fuse: 99 }, from), false);
  assert.equal(validThrow({ ...d, pos: { x: 999, y: 0, z: 0 } }, null), true, '坐直升机时不按人站哪核对');
  // 人物 / 操作的新标记
  const c = decodeChar(encodeChar({ role: 'lead', x: 1, y: 2, z: 3, on: true, human: true, sprint: true, reload: true, crouch: true, weapon: 'knife' }));
  assert.ok(c.sprint && c.reload && c.crouch && c.human && c.on); assert.equal(c.weapon, 'knife');
  const c2 = decodeChar(encodeChar({ role: 'lead', x: 1, y: 2, z: 3, weapon: 'axe' })); assert.ok(!c2.sprint && !c2.reload); assert.equal(c2.weapon, 'axe');
  const i = decodeInput(encodeInput({ x: 1, y: 2, z: 3, yaw: 0, pitch: 0, speed: 3, crouch: true, sprint: false, reload: true, healing: true, weapon: 'pistol' }));
  assert.ok(i.crouch && i.reload && i.healing && !i.sprint); assert.equal(i.weapon, 'pistol');
});

// ---- 服务器那一层 ----
function fake(name) {
  const c = { name, out: [], send(t) { c.out.push(t === 'pong' ? 'pong' : JSON.parse(t)); }, close() {}, save() {} };
  c.last = (t) => [...c.out].reverse().find((m) => m.t === t); c.count = (t) => c.out.filter((m) => m.t === t).length;
  return c;
}
test('服务器：事件只随操作到主机、别人收不到；客户端发快照冒充主机转手雷不转；大厅的准备马上广播、延迟洗过、只变延迟的隔一会儿才广播、开局清掉准备', () => {
  let t = 1000; const now = () => t;
  const room = createRoomCore({ code: '4821', now }), a = fake('a'), b = fake('b'), c = fake('c');
  room.join(a, { name: '房主' }); room.join(b, { name: '乙' }); room.join(c, { name: '丙' });
  const ev = [encodeEvent({ type: 'throw', role: 'lead', kind: 'frag', pos: { x: 0, y: 1, z: 0 }, vel: { x: 1, y: 2, z: 3 }, fuse: 2 })];
  room.message(b, JSON.stringify({ t: 'i', p: [0, 0, 0, 0, 0, 0, 0, 0], ev }));
  assert.deepEqual(a.last('i').ev, ev); assert.equal(a.last('i').f, 1); assert.equal(c.count('i'), 0, '别的客户端收不到');
  room.message(b, JSON.stringify({ t: 's', ev, k: 1 })); room.message(b, JSON.stringify({ t: 's', ev, to: 'all' }));
  assert.equal(c.count('s'), 0, '客户端发的快照（带假事件）不转'); assert.equal(room.state.key, null);
  room.message(a, JSON.stringify({ t: 's', ev })); assert.deepEqual(c.last('s').ev, ev, '主机的快照照转');
  // 准备
  room.message(b, JSON.stringify({ t: 'meta', ready: true }));
  const p1 = c.last('peer'); assert.equal(p1.ev, 'meta'); assert.equal(p1.players.find((p) => p.seat === 1).ready, true); assert.equal(a.last('peer').players[1].ready, true);
  // 延迟：洗成整数、有上限；隔 metaEvery 才广播
  const n0 = c.count('peer');
  room.message(c, JSON.stringify({ t: 'meta', ping: 41.6 })); assert.equal(a.last('peer').players[2].ping, 42); assert.equal(c.count('peer'), n0 + 1);
  t += 500; room.message(c, JSON.stringify({ t: 'meta', ping: 77 })); assert.equal(c.count('peer'), n0 + 1, '只变延迟：没到时间不广播');
  t += ROOM.metaEvery; room.message(c, JSON.stringify({ t: 'meta', ping: 1e9 })); assert.equal(a.last('peer').players[2].ping, ROOM.pingMax);
  room.message(c, JSON.stringify({ t: 'meta', ping: 'x', ready: 'yes' })); assert.equal(a.last('peer').players[2].ready, false, '不是布尔的不认');
  room.message(c, JSON.stringify({ t: 'meta', ping: -5 })); assert.equal(room.players()[2].ping, ROOM.pingMax, '负数不认');
  assert.ok(!('to' in a.last('peer')), 'meta 不能点名转发');
  // 开局：准备清掉
  room.message(a, JSON.stringify({ t: 'start', seed: 1 })); assert.equal(room.players().filter((p) => p.ready).length, 0);
});

// ---- 三个「游戏」连在一起（同 coop-game.test.js：内存里的房间服务器 + 假 WebSocket）----
function network() {
  const rooms = new Map(), queue = [];
  const pump = () => { for (let n = 0; queue.length && n < 1e5; n++) queue.shift()(); };
  class FakeWS {
    constructor(url) {
      const u = new URL(url.replace(/^ws/, 'http')), code = u.pathname.split('/').pop();
      if (!rooms.has(code)) rooms.set(code, createRoomCore({ code }));
      const core = rooms.get(code), ws = this; this.readyState = 0;
      this.conn = { send: (t) => queue.push(() => ws.readyState === 1 && ws.onmessage?.({ data: t })), close: (c, r) => queue.push(() => { if (ws.readyState === 3) return; ws.readyState = 3; core.leave(ws.conn); ws.onclose?.({ code: c, reason: r }); }), save() {} };
      this.core = core;
      queue.push(() => { ws.readyState = 1; ws.onopen?.(); core.join(ws.conn, { name: u.searchParams.get('name'), want: u.searchParams.get('want') }); });
    }
    send(t) { if (this.readyState === 1) queue.push(() => this.core.message(this.conn, t)); }
    close() { if (this.readyState === 3) return; queue.push(() => { if (this.readyState === 3) return; this.readyState = 3; this.core.leave(this.conn); this.onclose?.({ code: 1000, reason: 'leave' }); }); }
  }
  return { FakeWS, pump };
}
function world(net, tag) {
  const physics = createMapPhysics(nav), scene = new THREE.Scene(), events = [], handlers = {}, sounds = [], fx = { explosion: 0, flash: 0, tracer: 0 };
  const ctx = { rng: seq(tag.length * 7 + 3), list: [], retire(m) { m._deactivate(); const i = ctx.list.indexOf(m); if (i >= 0) ctx.list.splice(i, 1); }, releaseToken() {} };
  const enemies = { debug: { ctx }, list: ctx.list, spawn(type, pos, opts) { const z = ctx.pools[type].find((q) => !q.active); if (!z) return null; z._activate(pos, opts); ctx.list.push(z); return z; } };
  const player = { pos: new THREE.Vector3(S0.x, Y0, S0.z), eye: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, alive: true, health: 100, maxHealth: 100, onGround: true, invulnerable: false, crouching: false, sprinting: false,
    damage(n) { if (this.invulnerable || !this.alive) return; this.health = Math.max(0, this.health - n); if (!this.health) this.alive = false; }, addShake() {} };
  const relays = Array.from({ length: 5 }, (_, i) => ({ id: `st${i}`, cut: false, t: 0, o: { pos: new THREE.Vector3(S0.x + 1, Y0, S0.z), label: `第 ${i + 1} 步`, locked: false } }));
  const siege = { enabled: true, follow: false, towerPick: null, state: { stage: 0, pin: null }, useRng() {}, addNoise() {}, followOut: () => ({ hold: -1 }), followState() {} };
  const G = { scene, physics, player, enemies, events: { emit(n, e) { events.push([n, e]); for (const h of handlers[n] || []) h(e); }, on(n, h) { (handlers[n] ||= []).push(h); } },
    fx: { smoke() {}, explosion() { fx.explosion++; }, tracer() { fx.tracer++; }, muzzleFlash() { fx.flash++; } }, audio: { play: (name, o) => sounds.push([name, o]) },
    time: { t: 0, frame: 0 }, weapon: { state: 'idle', current: 'rifle', melee: 'knife' }, hud: { message() {}, radio() {} },
    level: { onReset() { for (const q of relays) { q.cut = false; q.t = 0; } siege.state.stage = 0; } },
    game: { state: 'title', run: { relays }, start() { G.level.onReset(); this.state = 'playing'; }, debugCut() {} },
  };
  const zombies = addZombies(G, enemies, { count: 10 });
  const actions = createActions(G, { scene, nav }); G.actions = actions;
  const director = { riding: false, state: {}, vehicles: {} };
  const squad = createSquad(G, { scene, nav, zombies, siege, director, rng: seq(tag.length * 13 + 5) }); squad.reset();
  const coop = createCoop(G, { squad, zombies, siege, director, ui: null, params: { mp: 'ws://rooms.test' }, storage: null, WS: net.FakeWS });
  const step = (dt = 1 / 30) => { G.time.t += dt; G.time.frame++; player.eye.set(player.pos.x, player.pos.y + 1.6, player.pos.z); for (const m of squad.everyone) m.cool = Math.max(m.cool || 0, 0.5); coop.pre(dt); for (const z of [...ctx.list]) z._update(dt); squad.update(dt); actions.update(dt); coop.post(dt); };
  const w = { tag, G, player, zombies, squad, coop, actions, enemies, events, sounds, fx, step }; worlds.push(w);
  return w;
}
const open = (pos, d) => {
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, x = pos.x + Math.cos(a) * d, z = pos.z + Math.sin(a) * d, st = landAt(nav, x, z, pos.y + 0.6);
    if (st && Math.abs(st.y - pos.y) < 0.1 && clear(nav, st)) return new THREE.Vector3(x, st.y, z);
  }
  throw new Error('找不到空地');
};
function trio() {
  const net = network(), A = world(net, 'host'), B = world(net, 'bb'), C = world(net, 'ccc');
  const run = (secs, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { each?.(); for (const w of [A, B, C]) w.step(); net.pump(); } };
  const code = A.coop.create('房主'); net.pump(); B.coop.join(code, '乙'); net.pump(); C.coop.join(code, '丙'); net.pump();
  A.coop.start(); net.pump(); run(0.8);
  return { net, A, B, C, run, code };
}

test('扔手雷：客户端自己那颗只画；主机按他报的真扔一颗（伤害记在他名下）、转给第三个人也画一颗；三边都炸；只算一次伤害', () => {
  const { A, B, C, run } = trio();
  assert.match(A.coop.code, /^[0-9]{4}$/, '房间码 4 位数字');
  assert.equal(B.actions.visualOnly, true, '客户端：自己扔的只画'); assert.equal(A.actions.visualOnly, false);
  // 乙（阿哲）朝前下方扔一颗
  B.player.yaw = 0.4; B.player.pitch = -0.5; B.step(1 / 60);
  assert.ok(B.actions.throwNade(), '扔出去了');
  const mine = B.actions.nades.find((n) => n.live); assert.ok(mine.visual, '自己那颗只画');
  run(0.3);
  const hostNade = A.actions.nades.find((n) => n.live && n.owner === 1), seen = C.actions.nades.find((n) => n.live);
  assert.ok(hostNade, '主机那边真扔了一颗，记在 1 号座位名下'); assert.equal(hostNade.visual, false);
  assert.ok(seen && seen.visual, '第三个人看得见（只画）');
  assert.ok(hostNade.mesh.position.distanceTo(mine.mesh.position) < 1.5, `主机那颗和他自己那颗飞在一块（差 ${hostNade.mesh.position.distanceTo(mine.mesh.position).toFixed(2)} 米）`);
  assert.ok(seen.mesh.position.distanceTo(hostNade.mesh.position) < 1.8, '第三个人看见的也差不多在那儿');
  assert.equal(A.squad.byId('zhe').actKind, 'throw', '主机上阿哲做了扔的动作'); assert.equal(C.squad.byId('zhe').actKind, 'throw', '第三个人看见阿哲在扔');
  // 落地前把一只丧尸放到手雷底下（主机放，大家都看得见）
  run(1.2);
  const at = open(hostNade.mesh.position, 0.4), z = A.enemies.spawn('zombie', at, { kind: 'walker' }); z.pos.copy(at);
  run(0.1); z.pos.copy(hostNade.mesh.position).setY(at.y);
  const kills0 = A.squad.byId('zhe').kills;
  run(1.2);
  assert.equal(z.alive, false, '主机那颗炸死了它');
  assert.equal(A.squad.byId('zhe').kills, kills0 + 1, '击倒记在阿哲（乙）名下');
  assert.equal(A.events.filter(([n, e]) => n === 'enemy:killed' && e.enemy === z).length, 1, '只死一次');
  for (const w of [A, B, C]) assert.ok(w.fx.explosion >= 1, `${w.tag} 看见爆炸`);
  assert.ok(B.sounds.some(([n]) => n === 'explosion') && C.sounds.some(([n]) => n === 'explosion'), '客户端都听见爆炸');
  assert.equal(B.events.filter(([n]) => n === 'grenade:explode').length, 0, '客户端只画的那颗不发爆炸事件（不招尸群、不算分）');
  assert.ok(A.events.some(([n, e]) => n === 'grenade:explode' && e.owner === 1), '主机那颗发爆炸事件（招尸群）');
});

test('扔手雷的核对：一包刷一堆只认几颗（令牌桶）；离人太远、速度离谱的不认', () => {
  const { A, B, net, run } = trio();
  const zhe = A.squad.byId('zhe'), at = zhe.pos;
  const ok = (dx) => encodeEvent({ type: 'throw', role: 'lead', kind: 'frag', pos: { x: at.x + dx * 0.01, y: at.y + 1.5, z: at.z }, vel: { x: 3, y: 4, z: 0 }, fuse: 2 });
  B.coop.send('i', { ev: Array.from({ length: 20 }, (_, i) => ok(i)) }); net.pump(); A.step(); net.pump();
  const mine = () => A.actions.nades.filter((n) => n.live && n.owner === 1).length;
  assert.equal(mine(), Math.min(EVT.perPack, EVT.nadeBurst), `一包 20 颗只认 ${EVT.nadeBurst} 颗`);
  run(3);
  B.coop.send('i', { ev: [encodeEvent({ type: 'throw', kind: 'frag', pos: { x: at.x + 30, y: at.y + 1, z: at.z }, vel: { x: 1, y: 1, z: 1 }, fuse: 2 }), encodeEvent({ type: 'throw', kind: 'frag', pos: { x: at.x, y: at.y + 1.5, z: at.z }, vel: { x: 300, y: 0, z: 0 }, fuse: 2 })] });
  net.pump(); A.step(); net.pump(); assert.equal(mine(), 0, '离人太远、速度离谱的不认');
});

test('别人眼里的你：拿刀就是刀、拿手枪是双手手枪、蹲下身子矮下去、挥刀、开枪有火光和枪声、换弹；主机这边的你客户端也看得见', () => {
  const { A, B, C, run } = trio();
  const zheA = A.squad.byId('zhe'), zheC = C.squad.byId('zhe'), leadB = B.squad.lead;
  assert.ok(zheA.held.guns.rifle.visible && !zheA.held.guns.smg.visible, '阿哲由乙操控：拿的是乙手里那把（步枪），不是电脑开时的冲锋枪');
  // 乙：换刀、蹲下
  B.G.weapon.current = 'knife'; B.player.crouching = true; run(0.6);
  for (const [who, m] of [['主机', zheA], ['第三个人', zheC]]) {
    assert.equal(m.weapon, 'knife', `${who}看见阿哲拿刀`);
    assert.ok(m.held.guns.knife.visible && !m.held.guns.rifle.visible && m.held.arms.knifeR.visible && !m.held.arms.rifle.visible, `${who}：刀和握刀的手臂显示、步枪收起`);
    assert.ok(m.crouchK > 0.8, `${who}看见阿哲蹲着（${m.crouchK.toFixed(2)}）`);
  }
  const hipStand = A.squad.byId('lin').root.children[0].children[0].position.y, hipCrouch = zheA.root.children[0].children[0].position.y;
  assert.ok(hipStand - hipCrouch > POSE.crouch.drop * 0.8, `蹲下髋低了 ${(hipStand - hipCrouch).toFixed(2)} 米`);
  // 挥刀
  B.G.events.emit('weapon:melee', {}); run(0.1);
  assert.equal(zheA.actKind, 'swing'); assert.equal(zheC.actKind, 'swing', '第三个人看见挥刀'); C.step(); C.step(); assert.ok(Math.abs(zheC.rArm.rotation.y) + Math.abs(zheC.rArm.rotation.x) > 0.1, '右胳膊在动');
  run(0.5); assert.equal(zheC.actKind, null, '挥完了');
  // 换手枪、站起来、开一枪
  B.G.weapon.current = 'pistol'; B.player.crouching = false; run(0.5);
  assert.ok(zheC.held.guns.pistol.visible && zheC.held.arms.pistol.visible && !zheC.held.guns.knife.visible, '第三个人看见双手握手枪');
  assert.ok(zheC.crouchK < 0.2, '站起来了');
  const f0 = C.fx.flash, s0 = C.sounds.length;
  B.G.events.emit('weapon:fire', { dir: new THREE.Vector3(0, 0, -1), kind: 'pistol', origin: B.player.pos.clone() }); run(0.3);
  assert.ok(C.fx.flash > f0, '第三个人看见枪口火光');
  const shot = C.sounds.slice(s0).find(([n]) => n === 'soldier_fire'); assert.ok(shot, '第三个人听见枪声'); assert.ok(shot[1].pos.distanceTo(zheC.pos) < 2.2, '枪声在阿哲那儿'); assert.ok(shot[1].pitch > 1.2, '手枪的音调');
  assert.ok(A.sounds.some(([n, o]) => n === 'soldier_fire' && o.pos.distanceTo(zheA.pos) < 2.2), '主机也听见');
  // 换弹
  B.G.weapon.state = 'reloading'; run(0.4); assert.ok(zheC.reloading && zheC.reloadK > 0.5, '第三个人看见在换弹'); B.G.weapon.state = 'idle';
  // 主机这边的你：拿刀蹲着、斧子——客户端看主角
  A.G.weapon.current = 'knife'; A.player.crouching = true; run(0.6);
  assert.equal(leadB.weapon, 'knife'); assert.ok(leadB.crouchK > 0.8 && leadB.held.guns.knife.visible, '客户端看见房主拿刀蹲着');
  A.G.weapon.melee = 'axe'; run(0.3); assert.ok(leadB.held.guns.axe.visible && !leadB.held.guns.knife.visible, '斧子也认得');
  A.G.events.emit('weapon:melee', {}); run(0.1); assert.equal(leadB.actKind, 'swing', '客户端看见房主挥斧子');
  // 冲刺：枪放低
  A.G.weapon.current = 'rifle'; A.player.crouching = false; A.player.sprinting = true; run(0.5); assert.ok(leadB.sprint && leadB.lowReady > 0.8, '冲刺时枪放低');
  assert.ok(Object.keys(HELD).every((k) => leadB.held.guns[HELD[k].gun] || !HELD[k].gun), '每种武器都有模型');
});
