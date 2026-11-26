// 丧尸围城联机的同步层（src/jimao/coop/sync.js、net.js）：压缩、增量、插值、主机时钟、镜像、命中核对、种子、服务器地址。纯逻辑，不建场景。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NET, ROLES, encodeZombie, decodeZombie, encodeChar, decodeChar, encodeInput, decodeInput, createDeltaWriter, createInterp, createNetClock, createMirror, validateHits, seededRng, qa, da } from '../src/jimao/coop/sync.js';
import { serverUrl, randomCode, normCode, createRoomClient, COOP_SERVER } from '../src/jimao/coop/net.js';

const V = (x, y, z) => ({ x, y, z });
const zomb = (o = {}) => ({ pos: V(-120.33, 12.4, -98.71), yaw: 2.9, kind: 'runner', zs: 'attack', hp: 18, maxHp: 36, alive: true, gen: 3, lunge: 0.62, fixed: false, sweep: null, post: null, ...o });

test('压缩：丧尸、人物、操作来回一遍，位置误差不到 3 厘米、朝向不到 1.5 度，标记都在', () => {
  const z = zomb(), d = decodeZombie(encodeZombie(z, 17));
  assert.equal(d.idx, 17); assert.equal(d.gen, 3); assert.equal(d.kind, 'runner'); assert.equal(d.zs, 'attack'); assert.ok(d.alive && !d.fixed);
  assert.ok(Math.abs(d.x - z.pos.x) < 0.026 && Math.abs(d.y - z.pos.y) < 0.026 && Math.abs(d.z - z.pos.z) < 0.026);
  assert.ok(Math.abs(Math.atan2(Math.sin(d.yaw - z.yaw), Math.cos(d.yaw - z.yaw))) < 0.026, '朝向');
  assert.ok(Math.abs(d.hp - 0.5) < 0.01); assert.equal(d.lunge, 0.6);
  assert.equal(decodeZombie(encodeZombie(zomb({ alive: false, fixed: true, sweep: {}, kind: 'brute', zs: 'pin' }), 1)).fixed, true);
  const c = decodeChar(encodeChar({ role: 'lin', x: 3.21, y: 40.1, z: -7.77, yaw: -1, pitch: 0.31, speed: 4.2, down: true, on: true, crouch: true, hp: 52.6, revive: 0.4, human: true, weapon: 'pistol' }));
  assert.deepEqual([c.role, c.down, c.on, c.crouch, c.human, c.hp, c.revive, c.weapon], ['lin', true, true, true, true, 53, 0.4, 'pistol']);
  assert.ok(Math.abs(c.pitch - 0.31) < 0.006 && Math.abs(c.speed - 4.2) < 0.06);
  const i = decodeInput(encodeInput({ x: 1.5, y: 2, z: 3, yaw: 0.5, pitch: -0.2, speed: 3, crouch: true, sprint: true, weapon: 'smg' }));
  assert.deepEqual([i.crouch, i.sprint, i.weapon], [true, true, 'smg']); assert.ok(Math.abs(i.yaw - 0.5) < 0.026);
  assert.equal(decodeInput([1, 2]), null); assert.equal(decodeInput(['x', 1, 2, 3, 4, 5, 6, 7]), null, '坏的操作包不认');
  assert.ok(Math.abs(da(qa(-Math.PI * 0.75)) + Math.PI * 0.75) < 0.03);
  assert.equal(ROLES[0], 'lead'); assert.equal(ROLES[1], 'zhe'); assert.equal(ROLES[2], 'lin');
  // 一只丧尸十来个整数：三十只一帧也就一千多字节
  assert.ok(JSON.stringify(encodeZombie(z, 63)).length < 48, JSON.stringify(encodeZombie(z, 63)));
});

test('增量：只发变了的，不发了的进 rm；每 keyEvery 秒一帧完整的（全发、没有 rm）；有人进来马上补一帧完整的', () => {
  const w = createDeltaWriter({ keyEvery: 2 }), a = [1, 1, 0, 10, 0, 10], b = [2, 1, 0, 20, 0, 20];
  let o = w.write(0.1, [[1, a], [2, b]]); assert.equal(o.k, 1, '第一帧是完整的'); assert.equal(o.z.length, 2);
  o = w.write(0.1, [[1, a], [2, b]]); assert.equal(o.k, 0); assert.equal(o.z.length, 0, '没变的不发');
  o = w.write(0.1, [[1, [1, 1, 0, 11, 0, 10]], [2, b]]); assert.equal(o.z.length, 1); assert.equal(o.z[0][3], 11);
  o = w.write(0.1, [[2, b]]); assert.deepEqual(o.rm, [1], '走远了 / 收回了');
  o = w.write(2, [[2, b]]); assert.equal(o.k, 1); assert.equal(o.z.length, 1); assert.deepEqual(o.rm, []);
  w.keyNow(); assert.equal(w.write(0.01, [[2, b]]).k, 1);
});

test('插值：两帧之间线性走（朝向走近的那边）；最后一帧之后按速度最多推 0.25 秒再停住；第一帧之前就是第一帧；传送不推', () => {
  const b = createInterp();
  b.push(1, { x: 0, y: 0, z: 0, yaw: 3.0, zs: 'idle' }); b.push(1.1, { x: 1, y: 0, z: 0, yaw: -3.0, zs: 'chase' });
  const m = b.sample(1.05); assert.ok(Math.abs(m.x - 0.5) < 1e-9); assert.ok(Math.abs(Math.abs(m.yaw) - Math.PI) < 0.2, `朝向从 3.0 绕过 π 到 -3.0：${m.yaw}`);
  assert.equal(b.sample(1.08).zs, 'chase', '离散字段取近的那帧');
  assert.equal(b.sample(0.5).x, 0);
  assert.ok(Math.abs(b.sample(1.2).x - 2) < 1e-9, '往前推了 0.1 秒（速度 10 米 / 秒）');
  assert.ok(Math.abs(b.sample(5).x - 3.5) < 1e-9, '最多推 0.25 秒');
  b.push(1.05, { x: 9, y: 0, z: 0 }); assert.equal(b.length, 2, '比最后一帧早的丢掉');
  b.push(1.2, { x: 40, y: 0, z: 0 }); assert.equal(b.sample(1.5).x, 40, '一下跳了 39 米（传送）：不往前推');
  b.reset(2, { x: 5, y: 1, z: 5 }); assert.equal(b.length, 1); assert.equal(b.sample(9).x, 5);
});

test('主机时钟：第一次直接对齐；来得早马上跟上，来得晚（网络抖）慢慢靠；差太远（暂停、重连）重新对齐；画面落后 delay 秒', () => {
  const c = createNetClock({ delay: 0.12 });
  assert.equal(c.renderT(5), null);
  c.sample(100, 5); assert.equal(c.offset, 95); assert.ok(Math.abs(c.renderT(5.5) - 100.38) < 1e-9);
  c.sample(100.2, 5.1); assert.ok(Math.abs(c.offset - 95.1) < 1e-9, '早到：马上跟');
  c.sample(100.2, 5.4); assert.ok(c.offset < 95.1 && c.offset > 95.09, '晚到：只挪一点');
  c.sample(300, 6); assert.equal(c.offset, 294, '差太远：重来');
});

test('镜像：收到完整帧以前的增量不要；新出场 / 换了一回出场的报 spawn；rm 和完整帧里没有的报 gone；击倒事件原样给；画面落后插值', () => {
  const M = createMirror({ clock: createNetClock({ delay: 0.1 }) });
  const z1 = (x, gen = 1, o = {}) => encodeZombie(zomb({ pos: V(x, 0, 0), gen, ...o }), 4);
  assert.deepEqual(M.ingest({ ht: 1, z: [z1(0)] }, 0).spawn, [], '还没完整帧');
  let r = M.ingest({ ht: 1, k: 1, z: [z1(0), encodeZombie(zomb({ pos: V(5, 0, 0) }), 9)], c: [encodeChar({ role: 'lead', x: 1, y: 0, z: 2, on: true, hp: 80 })] }, 0);
  assert.deepEqual(r.spawn.sort(), [4, 9]); assert.ok(M.keyed);
  M.ingest({ ht: 1.1, z: [z1(1)] }, 0.1);
  const at = M.zombieAt(4, 0.15); assert.ok(Math.abs(at.x - 0.5) < 1e-6, `画面时间 1.05：${at.x}`);
  r = M.ingest({ ht: 1.2, z: [z1(2, 2)], rm: [9], kill: [[4, 1, 2, 1]] }, 0.2);
  assert.deepEqual(r.spawn, [4], '换了一回出场'); assert.deepEqual(r.gone, [9]); assert.deepEqual(r.kills, [[4, 1, 2, 1]]);
  assert.equal(M.charAt('lead', 0.2).hp, 80);
  r = M.ingest({ ht: 1.3, k: 1, z: [] }, 0.3); assert.deepEqual(r.gone, [4], '完整帧里没有的收起来');
  M.reset(); assert.equal(M.keyed, false); assert.equal(M.zombies.size, 0);
});

test('命中核对：同一回出场、活着、离报的人不太远、伤害有上限、一包总伤害有上限；坏数据不认', () => {
  const pool = [zomb({ gen: 2, active: true }), zomb({ gen: 5, active: true, pos: V(500, 0, 0) }), zomb({ gen: 1, active: true, alive: false }), zomb({ gen: 1, active: false })];
  const get = (i) => pool[i], me = V(-118, 12, -96);
  const ok = validateHits([[0, 2, 30, 1], [0, 1, 30, 0], [1, 5, 30, 0], [2, 1, 30, 0], [3, 1, 30, 0], [9, 1, 30, 0], 'x', [0, 2, -5, 0], [0, 2, 9999, 0]], get, me);
  assert.equal(ok.length, 2); assert.equal(ok[0].part, 'weak'); assert.equal(ok[1].damage, NET.claim, '一下最多 NET.claim');
  const many = Array.from({ length: 30 }, () => [0, 2, 300, 0]);
  const sum = validateHits(many, get, me).reduce((a, h) => a + h.damage, 0); assert.ok(sum <= NET.claimPack, `一包总共 ${sum}`);
  assert.deepEqual(validateHits(null, get, me), []);
});

test('种子：同一个种子抽出同一串随机数，不同种子不一样；都在 [0, 1)', () => {
  const a = seededRng(4207), b = seededRng(4207), c = seededRng(4208);
  const xa = Array.from({ length: 50 }, a), xb = Array.from({ length: 50 }, b), xc = Array.from({ length: 50 }, c);
  assert.deepEqual(xa, xb); assert.notDeepEqual(xa, xc); assert.ok(xa.every((v) => v >= 0 && v < 1));
});

test('服务器地址：网址 ?mp= 最优先（http 换成 ws）、再是本机存的、本机开发连 8787、都没有就是还没上线；房间码规整', () => {
  const loc = (h) => ({ hostname: h });
  assert.equal(serverUrl({ params: { mp: 'https://rooms.example.workers.dev/' }, loc: loc('yunlan-mall.pages.dev') }), 'wss://rooms.example.workers.dev');
  assert.equal(serverUrl({ params: {}, loc: loc('127.0.0.1') }), COOP_SERVER.dev);
  assert.equal(serverUrl({ params: {}, loc: loc('yunlan-mall.pages.dev'), storage: { getItem: () => 'wss://x.y' } }), 'wss://x.y');
  assert.equal(serverUrl({ params: {}, loc: loc('yunlan-mall.pages.dev') }), COOP_SERVER.url ? COOP_SERVER.url : null);
  assert.equal(serverUrl({ params: { mp: 'ftp://nope' }, loc: loc('a') }), null);
  assert.match(randomCode(), /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normCode(' ab cd '), 'ABCD'); assert.equal(normCode('ＡＢＣＤ'), 'ABCD', '全角'); assert.equal(normCode('AB0D'), null); assert.equal(normCode('ABC'), null);
});

test('连房间：没有服务器地址、连不上都报 offline（大厅显示「联机服务器还没上线」）；进来了报 welcome；房间满了报 full；统计收发字节', async () => {
  const fails = [];
  createRoomClient({ url: null, code: 'ABCD' }).on('fail', (e) => fails.push(e.why));
  class Dead { constructor() { setTimeout(() => { this.onerror?.(); this.onclose?.({ code: 1006 }); }, 0); } close() {} }
  createRoomClient({ url: 'ws://127.0.0.1:1', code: 'ABCD', WS: Dead }).on('fail', (e) => fails.push(e.why));
  class Ok { constructor(u) { this.url = u; this.readyState = 1; this.sent = []; setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify({ t: 'welcome', seat: 1, host: 0, players: [] }) }); this.onmessage?.({ data: JSON.stringify({ t: 's', ht: 1 }) }); }, 0); } send(t) { this.sent.push(t); } close() {} }
  const got = [], c = createRoomClient({ url: 'ws://h', code: 'WXYZ', name: '小 王', want: 'create', WS: Ok }).on('welcome', (w) => got.push(['w', w.seat])).on('msg', (m) => got.push(['m', m.t]));
  class Full { constructor() { this.readyState = 1; setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: '{"t":"full"}' }); this.onclose?.({ code: 4003 }); }, 0); } send() {} close() {} }
  createRoomClient({ url: 'ws://h', code: 'ABCD', WS: Full }).on('fail', (e) => fails.push(e.why));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(fails.sort(), ['full', 'offline', 'offline']);
  assert.deepEqual(got, [['w', 1], ['m', 's']]); assert.ok(c.ready);
  assert.ok(c.send({ t: 'i', p: [1] })); assert.equal(c.stats.sent, 1); assert.ok(c.stats.bytesIn > 20); assert.equal(c.stats.byType['>i'].n, 1);
  c.close();
});
