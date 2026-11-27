// 丧尸围城三人联机的玩法规则（src/jimao/coop/rules.js，接在 coop.js 上）：只在房间里有两个以上真人时生效。
// 纯函数（三人全倒、扶人进度、守屋顶加量、两挺机枪的航线调头）+ 三个「游戏」连在内存房间服务器上走：主机倒地被扶起来、三个全倒房间结束、投票重来、资源翻倍；单人不变。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, clear } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { addZombies } from '../src/jimao/zombie.js';
import { createSquad, SQUAD } from '../src/jimao/squad.js';
import { createCoop } from '../src/jimao/coop/coop.js';
import { createCoopRules, COOP_RULES, allDown, reviveStep, seatOf } from '../src/jimao/coop/rules.js';
import { createRoomCore } from '../cloud/rooms/room-core.js';
import { FPS_MISSION } from '../src/fps/mission-layout.js';
import { SIEGE, holdSchedule, siegeFlight, heliGuns } from '../src/jimao/siege.js';
import { createSupplies, SUPPLY } from '../src/jimao/supplies.js';
import { createScore } from '../src/jimao/score.js';

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' });
const S0 = FPS_MISSION.spawn, Y0 = L.levels.find((l) => l.id === S0.floor).elev;
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };
const worlds = []; after(() => { for (const w of worlds) { try { w.rules.dispose(); w.coop.dispose(); } catch { /* */ } } });

// ---- 内存里的房间服务器 + 假 WebSocket（和 coop-game.test.js 同一套）----
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
  return { FakeWS, pump, rooms };
}

// ---- 一个「游戏」：玩家、丧尸池、队友、假的关卡和游戏流程，外加联机规则 ----
function world(net, tag) {
  const physics = createMapPhysics(nav), scene = new THREE.Scene(), events = [], handlers = {}, msgs = [];
  const ctx = { rng: seq(tag.length * 7 + 3), list: [], retire(m) { m._deactivate(); const i = ctx.list.indexOf(m); if (i >= 0) ctx.list.splice(i, 1); }, releaseToken() {} };
  const enemies = { debug: { ctx }, list: ctx.list, spawn(type, pos, opts) { const z = ctx.pools[type].find((q) => !q.active); if (!z) return null; z._activate(pos, opts); ctx.list.push(z); return z; } };
  const player = { pos: new THREE.Vector3(S0.x, Y0, S0.z), vel: new THREE.Vector3(), yaw: 0, pitch: 0, alive: true, health: 100, maxHealth: 100, onGround: true, invulnerable: false,
    damage(n) { if (this.invulnerable || !this.alive) return; this.health = Math.max(0, this.health - n); if (!this.health) this.alive = false; }, addShake() {} };
  const relays = Array.from({ length: 5 }, (_, i) => ({ id: `st${i}`, cut: false, t: 0, o: { pos: new THREE.Vector3(S0.x + 1, Y0, S0.z), label: `第 ${i + 1} 步`, locked: false } }));
  const siege = { enabled: true, follow: false, towerPick: null, plan: null, holdBoost: null, twin: false, state: { stage: 0, pin: null }, useRng(r) { this.rng = r; }, addNoise() {}, followOut: () => ({ hold: -1 }), followState(v) { this.sv = v; } };
  const G = { scene, physics, player, enemies, events: { emit(n, e) { events.push([n, e]); for (const h of handlers[n] || []) h(e); }, on(n, h) { (handlers[n] ||= []).push(h); } },
    fx: { smoke() {}, explosion() {}, tracer() {}, muzzleFlash() {} }, time: { t: 0, frame: 0 }, weapon: { state: 'idle', current: 'rifle' },
    hud: { message: (t) => msgs.push(t), radio: (t) => msgs.push('R:' + t) },
    level: { onReset() { const r = siege.rng || Math.random; siege.rng = null; siege.plan = [r(), r(), r()]; for (const q of relays) { q.cut = false; q.t = 0; } siege.state.stage = 0; } },
    game: { state: 'title', run: { relays }, start() { G.level.onReset(); player.alive = true; player.health = 100; this.state = 'playing'; }, debugCut() { const q = relays.find((x) => !x.cut); if (q) { q.cut = true; siege.state.stage = relays.filter((x) => x.cut).length; } } },
  };
  const zombies = addZombies(G, enemies, { count: 14 });
  const director = { riding: false, phase: 'none', state: {}, vehicles: {}, deadTitle() {} };
  const squad = createSquad(G, { scene, nav, zombies, siege, director, rng: seq(tag.length * 13 + 5) });
  squad.reset();
  const coop = createCoop(G, { squad, zombies, siege, director, ui: null, params: { mp: 'ws://rooms.test' }, storage: null, WS: net.FakeWS });
  const rules = createCoopRules(G, { coop, squad, siege, director, ui: null });
  // 电脑队友先别开枪
  const step = (dt = 1 / 30) => { G.time.t += dt; G.time.frame++; for (const m of squad.everyone) m.cool = Math.max(m.cool || 0, 0.5); coop.pre(dt); rules.pre(dt); for (const z of [...ctx.list]) z._update(dt); squad.update(dt); rules.post(dt); coop.post(dt); };
  const w = { tag, G, player, zombies, squad, coop, rules, siege, enemies, events, msgs, step, relays }; worlds.push(w);
  return w;
}
const near = (pos, d, skip = 0) => {
  const eye = new THREE.Vector3(pos.x, pos.y + 1.5, pos.z), ph = createMapPhysics(nav);
  for (let k = 0, n = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, x = pos.x + Math.cos(a) * d, z = pos.z + Math.sin(a) * d, st = landAt(nav, x, z, pos.y + 0.6);
    if (!st || Math.abs(st.y - pos.y) > 0.1 || !clear(nav, st) || !ph.lineOfSight(eye, new THREE.Vector3(x, pos.y + 1.5, z))) continue;
    if (n++ === skip * 5) return new THREE.Vector3(x, st.y, z);
  }
  throw new Error('找不到空地');
};
const connect = (n = 3) => {
  const net = network(), ws = ['host', 'b', 'c'].slice(0, n).map((t) => world(net, t));
  const run = (secs, list = ws, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { each?.(); for (const w of list) w.step(); net.pump(); } };
  const code = ws[0].coop.create('房主'); net.pump();
  ws.slice(1).forEach((w, i) => { w.coop.join(code, `玩家${i + 1}`); net.pump(); });
  ws[0].coop.start(); net.pump();
  return { net, ws, run, code };
};

test('纯函数：三人全倒（在场的至少两个、都倒着）、扶人进度（真人 3 秒，真人林医生快 1.6 倍，电脑林医生 4.5 秒，走开慢慢退）、坐哪', () => {
  assert.equal(allDown([{ on: true, down: true }, { on: true, down: true }, { on: true, down: true }]), true);
  assert.equal(allDown([{ on: true, down: true }, { on: true, down: false }, { on: true, down: true }]), false);
  assert.equal(allDown([{ on: true, down: true }, { on: false, down: false }, { on: true, down: true }]), true, '没出场的不算');
  assert.equal(allDown([{ on: true, down: true }]), false, '只剩一个在场：不按全倒算（单人有自己的阵亡）');
  const R = COOP_RULES.revive, step = (helpers, secs) => { let t = 0; for (let i = 0; i < Math.round(secs * 30); i++) t = reviveStep(t, 1 / 30, helpers); return t; };
  assert.ok(step([{ dist: 1, dy: 0, human: true }], R.secs - 0.1) < 1 && step([{ dist: 1, dy: 0, human: true }], R.secs + 0.05) >= 1, '真人站跟前 3 秒');
  assert.ok(step([{ dist: 1, dy: 0, human: true, medic: true }], R.secs / COOP_RULES.medicMul + 0.05) >= 1, '真人林医生快');
  assert.ok(step([{ dist: 1, dy: 0, human: false, medic: true }], R.secs + 0.05) < 1 && step([{ dist: 1, dy: 0, human: false, medic: true }], R.medic + 0.05) >= 1, '电脑林医生慢一些');
  assert.equal(step([{ dist: R.reach + 0.5, dy: 0, human: true }], 5), 0, '离得远扶不了'); assert.equal(step([{ dist: 1, dy: 3, human: true }], 5), 0, '隔层扶不了');
  assert.ok(Math.abs(reviveStep(0.6, 0.2, []) - (0.6 - 0.2 * R.decay)) < 1e-9, '没人：进度往回退');
  assert.deepEqual(['lead', 'zhe', 'lin'].map((r) => seatOf(r)), ['left', 'right', 'cabin']); assert.equal(seatOf('lin', false), 'left', '单人永远坐左舷');
});

test('守屋顶加量：多 2 波（间隔照旧，直升机晚到同样的秒数）、每波 ×1.4、最后那阵 ×1.5、第 7 波加巨尸；单人那份不变；一波装得进 64 只的池子', () => {
  const solo = holdSchedule(null), mp = holdSchedule(COOP_RULES.hold), gap = SIEGE.waves.at(-1) - SIEGE.waves.at(-2);
  assert.deepEqual(solo, { hold: SIEGE.hold, waves: [...SIEGE.waves], size: 1, surge: 1, brutes: [] });
  assert.equal(mp.waves.length, SIEGE.waves.length + 2); assert.deepEqual(mp.waves.slice(0, SIEGE.waves.length), [...SIEGE.waves]);
  assert.equal(mp.waves.at(-1), SIEGE.waves.at(-1) + gap * 2); assert.equal(mp.hold, SIEGE.hold + gap * 2);
  assert.ok(mp.waves.at(-1) < mp.hold, '最后一波在直升机到之前');
  assert.ok(mp.size >= 1.3 && mp.size <= 1.5); assert.equal(mp.surge, 1.5); assert.deepEqual(mp.brutes, [7]);
  const sizes = [SIEGE.waveSize[1], ...Object.values(SIEGE.towers || {}).map((t) => t?.hold?.waveSize?.[1] || 0)];
  const biggest = Math.round(Math.max(...sizes) * mp.size);
  assert.ok(biggest < 64, `一波最多 ${biggest} 只（丧尸池 64）`);
});

test('两挺舱门机枪的航线：联机（twin）绕楼时隔一阵原地调个头，右舷那挺朝楼；单人一直左舷朝楼；调头是连续的（不跳）', () => {
  const pad = SIEGE.pad, f1 = siegeFlight(pad, 100), f2 = siegeFlight(pad, 100); f2.twin = true;
  const F = SIEGE.sweep.flip, B = f2.box;
  // 左舷朝楼程度（k = 1）/ 右舷（k = −1）：左舷方向 (cos yaw, −sin yaw) 和指向楼的方向的夹角余弦
  const side = (p, k) => { const qx = Math.max(B.x0, Math.min(B.x1, p.x)), qz = Math.max(B.z0, Math.min(B.z1, p.z)), cx = qx - p.x, cz = qz - p.z, d = Math.hypot(cx, cz) || 1; return k * (Math.cos(p.yaw) * cx - Math.sin(p.yaw) * cz) / d; };
  // 绕楼下（windows / ground 段：离墙 off 米，朝楼看得最清楚）时找：调头转完（flip = 1）那一刻、之后再调回来（flip = 0）那一刻
  const orb = (p) => p.phase === 'windows' || p.phase === 'ground';
  let tFlip = null, tBack = null;
  for (let t = 0; t < SIEGE.sweep.cap && tBack == null; t += 0.05) { const p = f2.poseAt(t); if (!orb(p)) continue; if (tFlip == null) { if (p.flip > 0.999) tFlip = t; } else if (p.flip < 0.001) tBack = t; }
  assert.ok(tFlip != null && tBack != null, '绕楼的时间够调两次头');
  assert.ok(side(f1.poseAt(tFlip), 1) > 0.9, '单人：左舷朝楼');
  assert.ok(side(f2.poseAt(tFlip), -1) > 0.9, `联机：调过头，右舷朝楼（${side(f2.poseAt(tFlip), -1).toFixed(2)}）`); assert.ok(f2.poseAt(tFlip).flip > 0.99);
  assert.ok(side(f2.poseAt(tBack), 1) > 0.9, '再过一阵调回来：左舷朝楼');
  let prev = null; for (let t = Math.max(0, tFlip - F.every); t < tBack; t += 1 / 30) { const p = f2.poseAt(t); if (prev) assert.ok(Math.abs(Math.atan2(Math.sin(p.yaw - prev.yaw), Math.cos(p.yaw - prev.yaw))) < 0.06, `t=${t.toFixed(1)} 机头不跳`); prev = p; }
  const g1 = heliGuns(f2.poseAt(tFlip), false), g2 = heliGuns(f2.poseAt(tFlip), true);
  assert.equal(g1.right, null); assert.ok(g2.right && g2.right.eye.distanceTo(g2.eye) > 1, '两挺枪一边一挺');
});

test('主机倒地不阵亡：血打空了倒在原地（开不了枪、走不动），客户端看得见主角倒着；客户端（阿哲）站到跟前 3 秒扶起来，回到 50 血', () => {
  const { ws: [A, B], run } = connect(2);
  run(0.2);
  assert.equal(A.rules.active, true); assert.equal(A.G.rewardMul, 2); assert.equal(B.G.rewardMul, 2);
  assert.deepEqual(A.siege.holdBoost, COOP_RULES.hold); assert.equal(A.siege.twin, true);
  // 林医生（电脑）先倒着，免得她跑过来扶
  const lin = A.squad.byId('lin'); lin.hp = 0; run(0.3); assert.ok(lin.down);
  const away = near(A.player.pos, 12); run(0.6, [A, B], () => B.player.pos.copy(away)); // 小乙先站远（开局大家都站在一处）
  A.player.damage(500);
  assert.equal(A.player.alive, true, '没阵亡'); assert.equal(A.coop.self.down, true, '倒地'); assert.equal(A.player.health, 1);
  const at = A.player.pos.clone(); A.player.pos.x += 2; A.rules.post(); assert.ok(A.player.pos.distanceTo(at) < 1e-6, '原地不动');
  A.G.input = { fire: true, ads: true, move: { x: 1, y: 0 } }; run(0.1, [A, B], () => B.player.pos.copy(away)); assert.equal(A.G.input.fire, false, '开不了枪');
  run(0.4, [A, B], () => B.player.pos.copy(away)); assert.ok(B.squad.lead.down, '客户端看到主角倒着'); assert.equal(A.coop.self.revive, 0, '跟前没人：没人扶');
  A.player.damage(30); assert.equal(A.player.alive, true, '倒着不再挨打'); assert.equal(A.player.health, 1);
  // 阿哲（小乙）站到跟前
  const spot = near(A.player.pos, 1.2); let first = -1, t = 0;
  run(4.5, [A, B], () => { B.player.pos.copy(spot); t += 1 / 30; if (first < 0 && !A.coop.self.down) first = t; });
  assert.ok(first > 0, '扶起来了'); assert.ok(first > SQUAD.down.revive - 0.2 && first < SQUAD.down.revive + 0.8, `${first.toFixed(2)} 秒扶起来（含插值延迟）`);
  assert.ok(A.player.health >= COOP_RULES.revive.hp); assert.equal(A.player.invulnerable, false);
  run(0.4); assert.equal(B.squad.lead.down, false, '客户端也看到主角起来了');
});

test('三个角色都倒下：整个房间这一局结束（大家一起看阵亡页），投票：大家都点了重来才开', () => {
  const { ws: [A, B, C], run } = connect(3);
  run(0.3);
  const zhe = A.squad.byId('zhe'), lin = A.squad.byId('lin');
  zhe.hp = 0; run(0.2); assert.ok(zhe.down);
  A.player.damage(999); run(0.2); assert.equal(A.rules.state.over, false, '还有一个站着');
  lin.hp = 0; run(COOP_RULES.over.delay + 0.5);
  for (const w of [A, B, C]) assert.equal(w.rules.state.over, true, `${w.tag}：这一局结束`);
  assert.equal(A.player.alive, false, '主机进阵亡页'); assert.equal(B.player.alive, false, '客户端也进阵亡页');
  // 投票：两个人点了还不够
  A.rules.vote('retry'); B.rules.vote('retry'); run(0.2);
  assert.equal(A.rules.state.over, true); assert.equal(A.rules.state.votes.size, 2); assert.equal(C.rules.state.votes.size, 2, '票数同步给大家');
  C.rules.vote('retry'); run(0.3);
  assert.equal(A.rules.state.over, false, '三个人都同意：重开'); assert.equal(A.G.game.state, 'playing'); assert.equal(A.player.alive, true);
});

test('单人（不进房间、或者房间里只有你一个）：规则不生效——倒地就是阵亡，资源不翻倍，守屋顶不加量，飞机一挺枪', () => {
  const net = network(), A = world(net, 'solo');
  A.G.game.start(); A.step();
  assert.equal(A.rules.active, false); assert.equal(A.G.rewardMul, 1); assert.equal(A.siege.holdBoost, null); assert.equal(A.siege.twin, false);
  A.player.damage(500); assert.equal(A.player.alive, false, '单人：血打空就阵亡'); assert.equal(A.coop.self.down, false);
  const B = world(net, 'alone'); B.coop.create('一个人'); net.pump(); B.coop.start(); net.pump(); B.step();
  assert.equal(B.rules.active, false, '房间里只有一个人：规则不生效'); assert.equal(B.G.rewardMul, 1);
  B.player.damage(500); assert.equal(B.player.alive, false);
  // 有人进来了：生效；他走了：倒着的直接起来（没人扶了）
  const C = world(net, 'c'); B.player.alive = true; B.player.health = 100; C.coop.join(B.coop.code, '乙'); net.pump(); B.step(); C.step(); net.pump();
  assert.equal(B.rules.active, true); assert.deepEqual(B.siege.holdBoost, COOP_RULES.hold); assert.equal(B.siege.twin, true);
  B.player.damage(500); assert.equal(B.coop.self.down, true);
  C.coop.leave(); net.pump(); B.step(); assert.equal(B.rules.active, false); assert.equal(B.coop.self.down, false, '只剩自己：直接起来'); assert.ok(B.player.alive && B.player.health > 1);
});

test('资源翻倍：G.rewardMul = 2 时医疗用品、投掷物、榴弹、连杀补给、得分都翻倍（带得下的也翻倍）；= 1 时和以前一样', () => {
  for (const mul of [1, 2]) {
    const thrown = { frag: 0 }, G = { rewardMul: mul, scene: new THREE.Scene(), events: { on() {}, emit() {} }, hud: { message() {} },
      weapon: { reserve: 0, owns: { launcher: true }, launcher: { shells: 0, addShells(n) { this.shells += n; return n; } }, addAmmo(n) { this.reserve += n; } } };
    const actions = { countOf: (k) => thrown[k] || 0, give(n, k = 'frag') { thrown[k] = (thrown[k] || 0) + n; return n; } };
    const sp = createSupplies(G, { scene: G.scene, actions, ammo: { give: (n) => n }, rng: () => 0.5 });
    assert.equal(sp.give('medkit'), mul, `医疗包 ×${mul}`); assert.equal(sp.inv.medkit, SUPPLY.medkit.max * mul, '带得下的也翻倍');
    sp.give('pills'); assert.equal(sp.inv.pills, mul);
    sp.give('frag'); assert.equal(thrown.frag, mul);
    sp.give('shell'); assert.equal(G.weapon.launcher.shells, SUPPLY.shell.give * mul);
    sp.dispose?.();
    const handlers = {}, H = { rewardMul: mul, game: { state: 'playing' }, events: { on: (n, f) => { (handlers[n] ||= []).push(f); }, emit() {} }, player: { health: 30, maxHealth: 100 },
      weapon: { reserve: 0, addAmmo(n) { this.reserve += n; } }, actions: { got: 0, give(n) { this.got += n; return n; } }, audio: { play() {} } };
    const score = createScore(H);
    const kill = () => handlers['enemy:killed'].forEach((f) => f({ part: 'body', enemy: { role: 'regular' } }));
    kill(); assert.equal(score.state.total, 100 * mul, `得分 ×${mul}`);
    for (let i = 0; i < 4; i++) kill();
    assert.equal(H.weapon.reserve, 60 * mul, '五连杀补给的弹药'); assert.equal(H.actions.got, mul, '五连杀补给的手雷');
    score.dispose?.();
  }
});
