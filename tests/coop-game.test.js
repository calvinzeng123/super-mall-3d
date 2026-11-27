// 丧尸围城联机接到游戏上（src/jimao/coop/coop.js + zombie.js 的木偶 + squad.js 的远程 / 木偶）：
// 三个「游戏」（同一张导航图上的丧尸池、队友、玩家）通过一个内存里的房间服务器（cloud/rooms/room-core.js，假 WebSocket）连起来，
// 走一遍：建房、加入、开局（种子一样）、客户端看到主机的丧尸在动、客户端打死一只主机那边也死、客户端的人顶替阿哲、
// 中途加入的站到林医生的位置、客户端走了阿哲由电脑接手、主机走了下一个人接着当主机。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, clear } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { addZombies } from '../src/jimao/zombie.js';
import { createSquad, SQUAD } from '../src/jimao/squad.js';
import { createCoop, COOP } from '../src/jimao/coop/coop.js';
import { createRoomCore } from '../cloud/rooms/room-core.js';
import { FPS_MISSION } from '../src/fps/mission-layout.js';
import { siegePlan, TOWERS } from '../src/jimao/siege.js';
import { stairRuns } from '../src/jimao/stairs.js';
import { seededRng } from '../src/jimao/coop/sync.js';

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' });
const S0 = FPS_MISSION.spawn, Y0 = L.levels.find((l) => l.id === S0.floor).elev;
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };
// 测试挂了也要把连接关掉（不然心跳的定时器让进程一直不退）
const worlds = []; after(() => { for (const w of worlds) { try { w.coop.dispose(); } catch { /* */ } } });

// ---- 内存里的房间服务器 + 假 WebSocket：消息排队，pump() 一口气送完 ----
function network() {
  const rooms = new Map(), queue = [], sockets = [];
  const pump = () => { for (let n = 0; queue.length && n < 1e5; n++) queue.shift()(); };
  class FakeWS {
    constructor(url) {
      const u = new URL(url.replace(/^ws/, 'http')), code = u.pathname.split('/').pop();
      if (!rooms.has(code)) rooms.set(code, createRoomCore({ code }));
      const core = rooms.get(code), ws = this; this.readyState = 0; sockets.push(this);
      this.conn = { send: (t) => queue.push(() => ws.readyState === 1 && ws.onmessage?.({ data: t })), close: (c, r) => queue.push(() => { if (ws.readyState === 3) return; ws.readyState = 3; core.leave(ws.conn); ws.onclose?.({ code: c, reason: r }); }), save() {} };
      this.core = core;
      queue.push(() => { ws.readyState = 1; ws.onopen?.(); core.join(ws.conn, { name: u.searchParams.get('name'), want: u.searchParams.get('want') }); });
    }
    send(t) { if (this.readyState === 1) queue.push(() => this.core.message(this.conn, t)); }
    close() { if (this.readyState === 3) return; queue.push(() => { if (this.readyState === 3) return; this.readyState = 3; this.core.leave(this.conn); this.onclose?.({ code: 1000, reason: 'leave' }); }); }
  }
  return { FakeWS, pump, rooms, sockets };
}

// ---- 一个「游戏」：玩家、丧尸池、队友、假的关卡导演和游戏流程 ----
function world(net, tag) {
  const physics = createMapPhysics(nav), scene = new THREE.Scene(), events = [], handlers = {}, msgs = [];
  const ctx = { rng: seq(tag.length * 7 + 3), list: [], retire(m) { m._deactivate(); const i = ctx.list.indexOf(m); if (i >= 0) ctx.list.splice(i, 1); }, releaseToken() {} };
  const enemies = { debug: { ctx }, list: ctx.list, spawn(type, pos, opts) { const z = ctx.pools[type].find((q) => !q.active); if (!z) return null; z._activate(pos, opts); ctx.list.push(z); return z; } };
  const player = { pos: new THREE.Vector3(S0.x, Y0, S0.z), vel: new THREE.Vector3(), yaw: 0, pitch: 0, alive: true, health: 100, maxHealth: 100, onGround: true, invulnerable: false,
    damage(n) { if (this.invulnerable || !this.alive) return; this.health = Math.max(0, this.health - n); if (!this.health) this.alive = false; }, addShake() {} };
  const relays = Array.from({ length: 5 }, (_, i) => ({ id: `st${i}`, cut: false, t: 0, o: { pos: new THREE.Vector3(S0.x + 1, Y0, S0.z), label: `第 ${i + 1} 步`, locked: false } }));
  const siege = { enabled: true, follow: false, towerPick: null, plan: null, state: { stage: 0, pin: null }, useRng(r) { this.rng = r; }, addNoise() {}, followOut: () => ({ hold: -1 }), followState(v) { this.sv = v; } };
  const G = { scene, physics, player, enemies, events: { emit(n, e) { events.push([n, e]); for (const h of handlers[n] || []) h(e); }, on(n, h) { (handlers[n] ||= []).push(h); } },
    fx: { smoke() {}, explosion() {}, tracer() {}, muzzleFlash() {} }, time: { t: 0, frame: 0 }, weapon: { state: 'idle', current: 'rifle' },
    hud: { message: (t) => msgs.push(t), radio: (t) => msgs.push('R:' + t) },
    level: { onReset() { const r = siege.rng || Math.random; siege.rng = null; siege.plan = [r(), r(), r()]; for (const q of relays) { q.cut = false; q.t = 0; } siege.state.stage = 0; } },
    game: { state: 'title', run: { relays }, start() { G.level.onReset(); this.state = 'playing'; }, debugCut() { const q = relays.find((x) => !x.cut); if (q) { q.cut = true; siege.state.stage = relays.filter((x) => x.cut).length; } } },
  };
  const zombies = addZombies(G, enemies, { count: 14 });
  const director = { riding: false, state: {}, vehicles: {} };
  const squad = createSquad(G, { scene, nav, zombies, siege, director, rng: seq(tag.length * 13 + 5) });
  squad.reset();
  const coop = createCoop(G, { squad, zombies, siege, director, ui: null, params: { mp: 'ws://rooms.test' }, storage: null, WS: net.FakeWS });
  // 电脑队友先别开枪（游戏里拿到步枪之前也不开枪）：不然要测的那几只先被他们打死了
  const step = (dt = 1 / 30) => { G.time.t += dt; G.time.frame++; for (const m of squad.everyone) m.cool = Math.max(m.cool || 0, 0.5); coop.pre(dt); for (const z of [...ctx.list]) z._update(dt); squad.update(dt); coop.post(dt); };
  const w = { tag, G, player, zombies, squad, coop, siege, enemies, events, msgs, step, relays }; worlds.push(w);
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

test('三个人联机走一遍：建房 → 加入 → 开局（同一个种子）→ 客户端看到主机的丧尸在动 → 客户端打死的主机那边也死 → 客户端顶替阿哲 → 中途加入站到林医生那儿 → 走了由电脑接手 → 主机走了换人当主机', () => {
  const net = network(), A = world(net, 'host'), B = world(net, 'b'), C = world(net, 'c');
  const run = (secs, ws = [A, B, C], each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { each?.(); for (const w of ws) w.step(); net.pump(); } };
  // 建房、加入
  const code = A.coop.create('房主'); net.pump();
  assert.equal(A.coop.mode, 'host'); assert.equal(A.coop.seat, 0);
  B.coop.join(code, '小乙'); net.pump();
  assert.equal(B.coop.mode, 'client'); assert.equal(B.coop.seat, 1); assert.equal(B.squad.net.local, 'zhe', '座位 1 扮演阿哲');
  assert.equal(B.squad.net.puppet, true); assert.equal(B.zombies.puppet, true); assert.equal(B.siege.follow, true);
  assert.equal(A.squad.byId('zhe').label, '小乙', '主机上阿哲的名牌换成玩家的昵称');
  // 开局：两边按同一个种子抽到同一局
  A.coop.start(); net.pump();
  assert.equal(A.G.game.state, 'playing'); assert.equal(B.G.game.state, 'playing', '客户端跟着开打');
  assert.deepEqual(B.siege.plan, A.siege.plan, '同一局关卡');
  assert.equal(A.coop.rewardMul, 2, '多人：资源翻倍'); assert.equal(C.coop.rewardMul, 1);
  // 主机放三只丧尸（客户端自己不放：spawn 在客户端返回 null）
  assert.equal(B.enemies.spawn('zombie', near(B.player.pos, 8), { kind: 'walker' }), null, '客户端不自己放丧尸');
  const zs = [0, 1, 2].map((k) => A.enemies.spawn('zombie', near(A.player.pos, 9 + k, k), { kind: 'walker', hunt: true }));
  run(1.5);
  const idx = zs.map((z) => A.zombies.pool.indexOf(z));
  for (const i of idx) { const h = A.zombies.pool[i], c = B.zombies.pool[i]; assert.ok(c.active && c.alive, `客户端的 ${i} 号出来了`); assert.equal(c.gen, h.gen); }
  // 在动：客户端的木偶两秒走了一截，一直跟着主机（落后不到一米）
  const p0 = idx.map((i) => B.zombies.pool[i].pos.clone()); let gap = 0;
  run(2, [A, B, C], () => { for (const i of idx) gap = Math.max(gap, A.zombies.pool[i].pos.distanceTo(B.zombies.pool[i].pos)); });
  const moved = idx.map((i, k) => B.zombies.pool[i].pos.distanceTo(p0[k]));
  assert.ok(moved.some((d) => d > 1), `木偶在动：${moved.map((d) => d.toFixed(1))}`); assert.ok(gap < 1.2, `落后最多 ${gap.toFixed(2)} 米`);
  assert.ok(B.zombies.pool[idx[0]].speed > 0.3, '走路姿势跟着转');
  // 客户端打一只：本地不掉（报给主机），主机核对完打上去、死了，客户端跟着倒下，算客户端的分
  const target = B.zombies.pool[idx[0]];
  assert.equal(target.damage(999, null, null, 'body'), false, '本地不算死');
  run(0.5);
  assert.equal(A.zombies.pool[idx[0]].alive, false, '主机那边死了'); assert.equal(target.alive, false, '客户端跟着倒下');
  const kill = B.events.find(([n, e]) => n === 'enemy:killed' && e.enemy === target); assert.ok(kill && kill[1].by === null, '算客户端自己打倒的');
  assert.equal(A.squad.byId('zhe').kills, 1, '主机那边记在阿哲（小乙）名下');
  // 客户端的人：主机上的阿哲照他走（不由电脑开）
  const to = near(B.player.pos, 4, 2); B.player.pos.copy(to); B.player.yaw = 1.2;
  run(0.6);
  const zhe = A.squad.byId('zhe'); assert.ok(zhe.remote, '阿哲由真人操控'); assert.ok(zhe.pos.distanceTo(to) < 0.4, `阿哲站到小乙那儿（差 ${zhe.pos.distanceTo(to).toFixed(2)} 米）`);
  // 客户端看主机：主角是个人形（名牌是房主），阿哲（自己）不画
  const lead = B.squad.lead; assert.ok(B.squad.isOn(lead) && lead.root.visible, '客户端看得见主角'); assert.equal(lead.label, '房主');
  assert.ok(lead.pos.distanceTo(A.player.pos) < 0.6, '主角站在房主那儿'); assert.equal(B.squad.isOn(B.squad.byId('zhe')), false, '自己扮演的不画');
  // 主机做到第二步；客户端跟上
  A.G.game.debugCut(); A.G.game.debugCut(); run(0.4); assert.equal(B.siege.state.stage, 2, '客户端补上主机做完的步数');
  // 客户端按交互键做第三步：做到最后一下停住、请主机定；主机认了
  B.relays[2].o.pos.copy(A.squad.byId('zhe').pos); A.relays[2].o.pos.copy(A.squad.byId('zhe').pos);
  run(0.6, [A, B, C], () => { B.relays[2].t = Math.min(1, B.relays[2].t + 0.2); });
  assert.equal(A.siege.state.stage, 3, '主机认了客户端做完的那一步'); assert.ok(B.relays[2].cut && B.siege.state.stage === 3);
  // 中途加入：第三个人站到林医生（电脑开着走到的）位置上
  const linAt = A.squad.byId('lin').pos.clone();
  C.coop.join(code, '老丙'); net.pump(); run(0.5);
  assert.equal(C.coop.seat, 2); assert.equal(C.squad.net.local, 'lin'); assert.equal(C.G.game.state, 'playing', '中途加入直接开打');
  assert.deepEqual(C.siege.plan, A.siege.plan, '中途加入的也是同一局'); assert.equal(C.siege.state.stage, 3, '前面的步数补上了');
  assert.ok(C.player.pos.distanceTo(linAt) < 2.5, `站到林医生的位置（差 ${C.player.pos.distanceTo(linAt).toFixed(2)} 米）`);
  run(0.5); assert.ok(A.squad.byId('lin').remote, '林医生现在由老丙操控');
  // 主机看见的 / 客户端看见的丧尸一致（中途加入的也收到了）
  { const live = A.zombies.pool.map((z, i) => [z, i]).filter(([z]) => z.active && z.alive && z.pos.distanceTo(A.player.pos) < 50);
    assert.ok(live.every(([z, i]) => C.zombies.pool[i].active && C.zombies.pool[i].gen === z.gen), `中途加入的也看得见主机那边还活着的 ${live.length} 只`); }
  // 客户端的血量听主机的：阿哲在主机上挨了 30
  zhe.hp -= 30; run(0.3); assert.ok(Math.abs(B.player.health - Math.min(B.player.maxHealth, zhe.hp)) < 1.5, `客户端血量 ${B.player.health} / 主机上 ${zhe.hp}`);
  assert.equal(B.player.maxHealth, SQUAD.members[0].hp, '血量上限照角色（阿哲 130）');
  // 倒地：主机上阿哲倒了，客户端的人原地倒着动不了
  zhe.hp = 0; run(0.4); assert.ok(zhe.down); assert.equal(B.coop.down, true, '客户端倒地');
  const downAt = B.player.pos.clone(); B.player.pos.x += 3; run(0.2); assert.ok(B.player.pos.distanceTo(downAt) < 0.01, '倒着走不了');
  // 小乙走了：阿哲从他站的地方由电脑接手
  const left = zhe.pos.clone(); B.coop.leave(); net.pump(); run(0.2, [A, C]);
  assert.equal(zhe.remote, null, '电脑接手'); assert.equal(zhe.label, '阿哲', '名牌换回角色名'); assert.ok(zhe.pos.distanceTo(left) < 1, '从他站的地方接着');
  assert.equal(B.coop.mode, 'off'); assert.equal(B.zombies.puppet, false, '离开房间的接着一个人打'); assert.equal(B.player.invulnerable, false);
  // 主机走了：老丙接着当主机，丧尸接着跑 AI
  A.coop.leave(); net.pump(); run(0.2, [C]);
  assert.equal(C.coop.mode, 'host', '提成主机'); assert.equal(C.zombies.puppet, false); assert.equal(C.siege.follow, false);
  assert.ok(C.zombies.pool.every((z) => !z.net), '木偶的目标位置清掉了（接着跑 AI）');
  const nz = C.enemies.spawn('zombie', near(C.player.pos, 9, 3), { kind: 'walker', hunt: true }); assert.ok(nz, '新主机自己放丧尸');
  const d0 = nz.pos.distanceTo(C.player.pos); run(2, [C]); assert.ok(nz.pos.distanceTo(C.player.pos) < d0 - 1.5, `新主机的丧尸自己会追人（${d0.toFixed(1)} → ${nz.pos.distanceTo(C.player.pos).toFixed(1)} 米）`);
  assert.equal(C.squad.lead.remote, null); assert.ok(C.squad.isOn(C.squad.lead), '主角由电脑开（跟着老丙）');
  for (const w of [A, B, C]) w.coop.dispose(); net.pump();
});

test('主机上的丧尸追离它最近的真人：远程玩家（代理对象）也会被扑、被咬，掉的是主机上那个队友的血；一个人的时候还是只追你', () => {
  const net = network(), A = world(net, 'host'), B = world(net, 'b');
  const run = (secs, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { each?.(); A.step(); B.step(); net.pump(); } };
  const code = A.coop.create('房主'); net.pump(); B.coop.join(code, '乙'); net.pump(); A.coop.start(); net.pump();
  assert.equal(A.G.zombieTarget, A.coop && A.G.zombieTarget, '主机装上了挑目标');
  // 小乙站到离主机 20 米外；一只丧尸放在他身边
  run(0.3); // 客户端先站到自己那个角色身上（等主机的快照）
  const far = near(A.player.pos, 20, 1); B.player.pos.copy(far); run(0.5);
  const zhe = A.squad.byId('zhe'); assert.ok(zhe.remote && zhe.pos.distanceTo(far) < 0.5);
  const z = A.enemies.spawn('zombie', near(far, 3), { kind: 'walker', hunt: true }), hp0 = zhe.hp;
  run(6, () => { B.player.pos.copy(far); });
  assert.ok(z.pos.distanceTo(far) < z.pos.distanceTo(A.player.pos), '扑向小乙'); assert.ok(zhe.hp < hp0, `小乙挨咬了（${hp0} → ${zhe.hp.toFixed(0)}）`);
  assert.equal(A.player.health, 100, '房主没挨咬');
  A.coop.leave(); net.pump(); assert.equal(A.G.zombieTarget, null, '离开房间：还是只追你');
  for (const w of [A, B]) w.coop.dispose(); net.pump();
});

test('同一个种子抽出同一局真关卡（siegePlan：商场段、三道关、信号弹的位置都一样），换个种子不一样', () => {
  const runs = stairRuns(nav), key = (p) => p.stages.map((s) => `${s.id}:${s.site.floor}:${s.site.x.toFixed(2)},${s.site.z.toFixed(2)}`).join('|') + `|${p.tower.id}|${p.gates.map((g) => g.type).join(',')}`;
  const a = siegePlan(seededRng(4207), L, nav, runs, TOWERS.A), b = siegePlan(seededRng(4207), L, nav, runs, TOWERS.A), c = siegePlan(seededRng(99), L, nav, runs, TOWERS.A);
  assert.equal(key(a), key(b)); assert.notEqual(key(a), key(c));
});

test('不进房间时和以前一样：丧尸不是木偶、照常放；主角不画；没有挑目标；开局不按种子抽；连不上服务器只提示，不影响单人', async () => {
  const net = network(), A = world(net, 'solo');
  assert.equal(A.coop.mode, 'off'); assert.equal(A.zombies.puppet, false); assert.equal(A.siege.follow, false);
  assert.equal(A.squad.net.local, 'lead'); assert.equal(A.squad.isOn(A.squad.lead), false, '主角不画（你就是主角）');
  assert.ok(A.squad.mates.every((m) => A.squad.isOn(m)), '两名电脑队友照常出场'); assert.equal(A.squad.mates.length, 2);
  assert.equal(A.G.zombieTarget, undefined); assert.equal(A.coop.rewardMul, 1);
  A.G.game.start(); assert.equal(A.siege.rng, null, '不在房间里：关卡照旧用普通随机数抽'); assert.equal(A.G.game.state, 'playing');
  const z = A.enemies.spawn('zombie', near(A.player.pos, 9), { kind: 'walker', hunt: true }); assert.ok(z && z.active);
  const d0 = z.pos.distanceTo(A.player.pos); for (let i = 0; i < 60; i++) A.step(); assert.ok(z.pos.distanceTo(A.player.pos) < d0 - 1, '丧尸照常追你');
  // 服务器连不上：报个错就完了，人还是单人
  const B = world({ FakeWS: class { constructor() { setTimeout(() => { this.onerror?.(); this.onclose?.({ code: 1006 }); }, 0); } send() {} close() {} } }, 'nonet');
  const fails = []; B.coop.on('fail', (e) => fails.push(e.why)); B.coop.join('ABCD', '我'); await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(fails, ['offline']); assert.equal(B.coop.mode, 'off'); assert.equal(B.coop.inRoom, false);
});

// ---- 这一轮修的几处 ----
function trio(n = 3) {
  const net = network(), ws = [world(net, 'host'), world(net, 'b'), world(net, 'c')].slice(0, n);
  const run = (secs, list = ws, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { each?.(); for (const w of list) w.step(); net.pump(); } };
  const code = ws[0].coop.create('房主'); net.pump();
  return { net, ws, run, code };
}

test('点一下就拿的目标（tap）：客户端本地做不完（不会一帧里 t += 1 就算拿到），卡在 cutHold 显示「正在拿」、请主机定；主机认了两边才过去；按住的一帧跳过 1 也一样', () => {
  const { net, ws: [A, B], run, code } = trio(2);
  B.coop.join(code, '乙'); net.pump(); A.coop.start(); net.pump(); run(0.4);
  const zheAt = A.squad.byId('zhe').pos;
  for (const w of [A, B]) { w.relays[0].o.pos.copy(zheAt); w.relays[0].o.tap = true; }
  // 原游戏点一下：t += 1，t >= 1 就当场做完（这里照它写）
  const tap = (w, r, d = 1) => { r.t += d; if (r.t >= 1) { r.cut = true; r.t = 1; w.siege.state.stage = w.relays.filter((x) => x.cut).length; } };
  tap(B, B.relays[0]);
  assert.equal(B.relays[0].cut, false, '客户端本地没做完'); assert.equal(B.relays[0].t, COOP.cutHold, '卡在最后一下'); assert.equal(B.siege.state.stage, 0);
  run(0.2, [A, B]); assert.ok(B.relays[0].t >= COOP.cutHold - 1e-9 || B.relays[0].cut, '等主机定的时候一直显示正在拿');
  run(0.6, [A, B]);
  assert.equal(A.siege.state.stage, 1, '主机收到请求、认了'); assert.ok(B.relays[0].cut && B.siege.state.stage === 1, '客户端跟着过去');
  // 按住的：这一帧进度一下子跳过 1（掉帧）也做不完，照样请主机
  for (const w of [A, B]) w.relays[1].o.pos.copy(zheAt);
  B.relays[1].t = 0.8; tap(B, B.relays[1], 0.5);
  assert.equal(B.relays[1].cut, false); assert.equal(B.relays[1].t, COOP.cutHold);
  run(0.8, [A, B]); assert.equal(A.siege.state.stage, 2); assert.ok(B.relays[1].cut);
  // 主机自己点一下照常当场做完；客户端离开以后自己点一下也照常
  tap(A, A.relays[2]); assert.ok(A.relays[2].cut, '主机照常');
  B.coop.leave(); net.pump(); tap(B, B.relays[3]); assert.ok(B.relays[3].cut, '离开房间以后照常');
  for (const w of [A, B]) w.coop.dispose(); net.pump();
});

test('登机门：客户端时换成「请主机登机」，离开房间 / 断线 / 提成主机以后换回原来的登机（单人能上飞机）', () => {
  const { net, ws: [A, B, C], run, code } = trio(3);
  const boarded = []; for (const w of [B, C]) w.G.level.onExtract = () => boarded.push(w.tag);
  const baseB = B.G.level.onExtract, baseC = C.G.level.onExtract;
  B.coop.join(code, '乙'); net.pump(); C.coop.join(code, '丙'); net.pump(); A.coop.start(); net.pump(); run(0.2);
  assert.notEqual(B.G.level.onExtract, baseB, '客户端：登机换成请主机');
  B.G.level.onExtract(); assert.deepEqual(boarded, [], '客户端走到登机门不自己登机');
  B.coop.leave(); net.pump(); run(0.1);
  assert.equal(B.G.level.onExtract, baseB, '离开房间：换回原来的'); B.G.level.onExtract(); assert.deepEqual(boarded, ['b'], '一个人能登机了');
  // 主机走了：丙提成主机，也换回原来的
  A.coop.leave(); net.pump(); run(0.1, [C]);
  assert.equal(C.coop.mode, 'host'); assert.equal(C.G.level.onExtract, baseC); C.G.level.onExtract(); assert.deepEqual(boarded, ['b', 'c']);
  for (const w of [A, B, C]) w.coop.dispose(); net.pump();
});

test('客户端回血（医疗包、止痛药）：报给主机，主机加到那个人身上（有上限）；回执以前本地不被快照顶回去', () => {
  const { net, ws: [A, B], run, code } = trio(2);
  B.coop.join(code, '乙'); net.pump(); A.coop.start(); net.pump(); run(0.4);
  const zhe = A.squad.byId('zhe'); zhe.hp = 40; run(0.4);
  assert.ok(Math.abs(B.player.health - 40) < 1, `先照主机掉到 40（${B.player.health}）`);
  // 吃了一片止痛药 +30
  B.player.health += 30; B.step(); assert.ok(B.player.health > 69, `下一帧没被顶回 40（${B.player.health}）`);
  run(0.6, [A, B]);
  assert.ok(Math.abs(zhe.hp - 70) < 1, `主机上阿哲也回到 70（${zhe.hp}）`); assert.ok(Math.abs(B.player.health - 70) < 1, `客户端 ${B.player.health}`);
  run(3, [A, B]); assert.ok(Math.abs(B.player.health - 70) < 1, '回执以后照主机的，不会多算一遍');
  // 报得离谱（一次 500）：主机最多认 COOP.heal.max；再报一次（同一个次数）不认
  zhe.hp = 10; const seq = 50;
  B.coop.send('i', { heal: [seq, 500] }); net.pump(); run(0.1, [A]);
  assert.equal(zhe.hp, 10 + COOP.heal.max, '一次最多 80');
  B.coop.send('i', { heal: [seq, 30] }); net.pump(); assert.equal(zhe.hp, 10 + COOP.heal.max, '同一个次数不再认');
  B.coop.send('i', { heal: [seq + 1, 80] }); net.pump(); assert.ok(zhe.hp < 10 + COOP.heal.max + 60, `一段时间里有总数上限（${zhe.hp}）`);
  // 倒着的不回
  zhe.hp = 0; run(0.2, [A, B]); assert.ok(zhe.down); B.coop.send('i', { heal: [seq + 9, 30] }); net.pump(); assert.ok(zhe.down && zhe.hp <= 0);
  for (const w of [A, B]) w.coop.dispose(); net.pump();
});

test('换主机：新主机接着这一局，剩下的客户端不重开（背包、位置、步数都不动）；之后中途加入的照常拿到这一局', () => {
  const { net, ws: [A, B, C], run, code } = trio(3);
  B.coop.join(code, '乙'); net.pump(); C.coop.join(code, '丙'); net.pump(); A.coop.start(); net.pump(); run(0.5);
  A.G.game.debugCut(); run(0.4);
  const starts = { b: 0, c: 0 }; for (const w of [B, C]) { const s0 = w.G.game.start.bind(w.G.game); w.G.game.start = (...a) => { starts[w.tag]++; return s0(...a); }; }
  const to = near(C.player.pos, 5, 1); C.player.pos.copy(to); run(0.3);
  const plan = JSON.stringify(C.siege.plan), round = C.coop.round;
  A.coop.leave(); net.pump(); run(0.6, [B, C]);
  assert.equal(B.coop.mode, 'host', '乙提成主机'); assert.equal(C.coop.mode, 'client');
  assert.deepEqual(starts, { b: 0, c: 0 }, '谁都没重开');
  assert.ok(C.player.pos.distanceTo(to) < 0.3, '丙还站在原地'); assert.equal(C.siege.state.stage, 1, '步数还在');
  assert.equal(JSON.stringify(C.siege.plan), plan); assert.equal(C.coop.round, round);
  assert.ok(B.squad.byId('lin').remote, '新主机上林医生照丙走');
  // 新主机做一步，丙跟上
  B.G.game.debugCut(); run(0.4, [B, C]); assert.equal(C.siege.state.stage, 2);
  // 新主机按「开始」：那是新的一局，丙照常重开
  B.coop.start(); net.pump(); assert.equal(starts.c, 1, '新的一局照常重开'); assert.equal(C.siege.state.stage, 0);
  for (const w of [A, B, C]) w.coop.dispose(); net.pump();
});

test('中途加入：站好以前不报位置——主机上的林医生不会被拉到加入的人的出生点，加入的人站到林医生那儿', () => {
  const { net, ws: [A, B, C], run, code } = trio(3);
  B.coop.join(code, '乙'); net.pump(); A.coop.start(); net.pump(); run(0.3);
  // 房主带着队友走开 14 米（林医生由电脑开着跟过去）；加入的人出生在开局点
  const away = near(A.player.pos, 14, 2); A.player.pos.copy(away); run(4);
  const lin = A.squad.byId('lin'); assert.ok(lin.pos.distanceTo(C.player.pos) > 6, `林医生跟着房主走远了（离出生点 ${lin.pos.distanceTo(C.player.pos).toFixed(1)} 米）`);
  const spawn = C.player.pos.clone(); let closest = Infinity;
  C.coop.join(code, '丙'); net.pump();
  run(0.8, [A, B, C], () => { closest = Math.min(closest, lin.pos.distanceTo(spawn)); });
  assert.ok(closest > 4, `主机上的林医生一直没被拉回出生点（最近 ${closest.toFixed(1)} 米）`);
  const at = C.coop.stats().placedAt; assert.ok(at, '站好了');
  assert.ok(C.player.pos.distanceTo(lin.pos) < 1.5, `丙站在林医生那儿（差 ${C.player.pos.distanceTo(lin.pos).toFixed(2)} 米）`);
  assert.ok(lin.remote, '之后林医生照丙走');
  for (const w of [A, B, C]) w.coop.dispose(); net.pump();
});

test('只听主机的：客户端不认别的座位冒充主机发的规则消息、开局；名字显示前洗一遍', () => {
  const { net, ws: [A, B, C], run, code } = trio(3);
  B.coop.join(code, '乙'); net.pump(); C.coop.join(code, '丙'); net.pump(); A.coop.start(); net.pump(); run(0.3);
  const bws = net.sockets.find((s) => s.conn && s.core && s.readyState === 1 && B.coop.room && s === net.sockets[1]);
  const got = []; B.coop.on('over', (m) => got.push(m.f));
  const deliver = (m) => { bws.onmessage({ data: JSON.stringify(m) }); };
  const startsBefore = B.coop.round;
  deliver({ t: 'over', why: 'down', f: 2 }); deliver({ t: 'over', why: 'down' });
  assert.deepEqual(got, [], '丙（座位 2）发的、没署名的都不认');
  deliver({ t: 'over', why: 'down', f: 0 }); assert.deepEqual(got, [0], '主机发的认');
  deliver({ t: 'start', seed: 7, round: 99, f: 2 }); assert.equal(B.coop.round, startsBefore, '冒充的开局不认');
  deliver({ t: 'peer', ev: 'join', seat: 2, name: '<script>x\u202e', players: [{ seat: 2, name: '<b>坏</b>' }], host: 0 });
  assert.ok(B.msgs.some((t) => t.startsWith('scriptx 加入了')), '提示里的名字洗过'); assert.equal(B.squad.byId('lin').label, 'b坏/b');
  for (const w of [A, B, C]) w.coop.dispose(); net.pump();
});
