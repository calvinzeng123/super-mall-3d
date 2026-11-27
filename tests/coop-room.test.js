// 丧尸围城联机的房间服务器（cloud/rooms/room-core.js、worker.js）：座位、主机、转发、中途加入、主机迁移、限流、来源检查。
// 用假连接（记下发出去的每一条），不连 Cloudflare。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomCore, ROOM, roleName } from '../cloud/rooms/room-core.js';
import worker, { originAllowed, createJoinLimiter, JOIN_LIMIT } from '../cloud/rooms/worker.js';

function fake(name) {
  const c = { name, out: [], closed: null, saved: null, send(t) { if (c.closed) throw new Error('closed'); c.out.push(t === 'pong' ? 'pong' : JSON.parse(t)); }, close(code, why) { c.closed = { code, why }; }, save(m) { c.saved = m; } };
  c.last = (t) => [...c.out].reverse().find((m) => m.t === t);
  return c;
}
const clock = () => { let t = 1000; const now = () => t; now.add = (ms) => { t += ms; }; return now; };

test('座位：第一个进来的是主机坐 0 号（主角），后来的依次坐 1（阿哲）、2（林医生）；第四个进不来；建房撞号 / 加入空房各有回话', () => {
  const room = createRoomCore({ code: 'ABCD' });
  const a = fake('a'), b = fake('b'), c = fake('c'), d = fake('d');
  assert.equal(room.join(a, { name: '房主', want: 'create' }), 0);
  assert.equal(room.join(b, { name: '小乙', want: 'join' }), 1);
  assert.equal(room.join(c, { name: '<b>丙</b>', want: 'join' }), 2);
  assert.equal(room.join(d, { name: '丁', want: 'join' }), -1); assert.equal(d.out[0].t, 'full'); assert.equal(d.closed.code, 4003);
  const w = c.last('welcome'); assert.equal(w.seat, 2); assert.equal(w.host, 0); assert.equal(w.players.length, 3);
  assert.deepEqual(w.players.map((p) => p.role), ['主角', '阿哲', '林医生']); assert.equal(w.players[2].name, 'b丙/b', '昵称里的尖括号去掉');
  assert.equal(a.last('peer').ev, 'join'); assert.equal(a.last('peer').seat, 2);
  const e = fake('e'); assert.equal(createRoomCore().join(e, { want: 'join' }), -1); assert.equal(e.out[0].t, 'nope');
  const f = fake('f'); assert.equal(room.join(f, { want: 'create' }), -1); assert.equal(f.out[0].t, 'taken');
  assert.equal(roleName(1), '阿哲'); assert.ok(ROOM.code.test('4821') && ROOM.code.test('0007') && !ROOM.code.test('K7QX') && !ROOM.code.test('482') && !ROOM.code.test('48210'), '房间码 4 位数字');
  // 连接上存了座位和主机标记（休眠醒来用）
  assert.equal(a.saved.seat, 0); assert.equal(a.saved.host, true); assert.equal(b.saved.host, false);
});

test('转发：主机的快照发给别人（完整帧留一份）；玩家的操作只发给主机、带上是谁发的；to: all / 座位号照发；不是主机发的快照、开局不算数', () => {
  const room = createRoomCore({ code: 'ABCD' }), a = fake('a'), b = fake('b'), c = fake('c');
  room.join(a); room.join(b); room.join(c);
  room.message(a, JSON.stringify({ t: 's', z: [[1, 2, 3]] }));
  assert.deepEqual(b.last('s').z, [[1, 2, 3]]); assert.ok(c.last('s')); assert.equal(a.out.filter((m) => m.t === 's').length, 0, '不发回给自己');
  assert.equal(room.state.key, null, '增量帧不留');
  room.message(a, JSON.stringify({ t: 's', k: 1, z: [[9]] })); assert.ok(room.state.key.includes('[[9]]'));
  room.message(b, JSON.stringify({ t: 'i', p: [1, 2] }));
  assert.equal(a.last('i').f, 1); assert.equal(c.out.filter((m) => m.t === 'i').length, 0, '操作只给主机');
  room.message(a, JSON.stringify({ t: 'chat', to: 'all', x: 1 })); assert.equal(c.last('chat').f, 0); assert.equal(b.last('chat').f, 0);
  room.message(a, JSON.stringify({ t: 'ev', to: 2, x: 2 })); assert.equal(c.last('ev').x, 2); assert.equal(b.out.filter((m) => m.t === 'ev').length, 0);
  room.message(b, JSON.stringify({ t: 's', k: 1, z: 'fake' })); assert.ok(!room.state.key.includes('fake'), '不是主机的快照扔掉');
  room.message(b, JSON.stringify({ t: 'start', seed: 1 })); assert.equal(room.state.started, false, '不是主机不能开局');
  room.message(b, '{not json'); assert.equal(b.last('err').why, 'json');
  room.message(b, JSON.stringify({ t: 'ping', c: 5 })); assert.equal(b.last('pong').c, 5);
  room.message(b, 'ping'); assert.equal(b.out.at(-1), 'pong');
});

test('中途加入：开局以后进来的拿到开局信息和最近一帧完整快照；主机收到有人进来的消息（它会马上再发一帧完整的）', () => {
  const now = clock(), stored = {};
  const room = createRoomCore({ code: 'ROOM', now, persist: (k, v) => { stored[k] = v; } }), a = fake('a'), b = fake('b');
  room.join(a, { name: '房主' }); room.join(b, { name: '乙' });
  room.message(a, JSON.stringify({ t: 'start', seed: 4207, tower: 'T1' }));
  assert.equal(b.last('start').seed, 4207); assert.equal(stored.start.tower, 'T1'); assert.equal(a.saved.started, true);
  room.message(a, JSON.stringify({ t: 's', k: 1, n: 1 })); now.add(500); room.message(a, JSON.stringify({ t: 's', n: 2 }));
  const c = fake('c'); now.add(300); room.join(c, { name: '丙' });
  const w = c.last('welcome'); assert.equal(w.started, true); assert.equal(w.start.seed, 4207); assert.equal(JSON.parse(w.snap).n, 1); assert.equal(w.keyAge, 800);
  assert.equal(a.last('peer').seat, 2);
  // 二号座位走了又来了一个人：坐回空出来的 2 号
  room.leave(b); const d = fake('d'); assert.equal(room.join(d), 1);
});

test('主机迁移：主机走了，座位号最小的那个提成主机（快照从它那儿来）；房里没人了清空；一般玩家走了只通知', () => {
  const stored = {}, room = createRoomCore({ code: 'MIGR', persist: (k, v) => { stored[k] = v; } }), a = fake('a'), b = fake('b'), c = fake('c');
  room.join(a); room.join(b); room.join(c);
  room.message(a, JSON.stringify({ t: 'start', seed: 1 })); room.message(a, JSON.stringify({ t: 's', k: 1 }));
  room.leave(c); assert.equal(a.last('peer').ev, 'leave'); assert.equal(a.out.filter((m) => m.t === 'host').length, 0);
  room.leave(a);
  assert.equal(b.last('host').seat, 1); assert.equal(room.state.host, 1); assert.equal(b.saved.host, true); assert.equal(room.state.key, null, '旧主机的完整帧作废');
  room.message(b, JSON.stringify({ t: 's', k: 1, from: 'b' })); assert.ok(room.state.key.includes('"from":"b"'), '新主机的快照照常转');
  const e = fake('e'); assert.equal(room.join(e), 0); assert.equal(e.last('welcome').host, 1, '后来的坐 0 号，但主机还是 1 号');
  room.message(e, JSON.stringify({ t: 'i', p: 1 })); assert.equal(b.last('i').f, 0, '操作发给新主机');
  room.leave(b); room.leave(e); assert.equal(room.count, 0); assert.equal(room.state.started, false); assert.equal(stored.start, null);
  const f = fake('f'); assert.equal(room.join(f, { want: 'create' }), 0, '空了以后能重新建');
});

test('休眠醒来：按连接上存的东西重新摆座位和主机，开局信息还在；没有完整帧就叫主机补一帧', () => {
  const room = createRoomCore({ code: 'WAKE' }), a = fake('a'), b = fake('b');
  room.join(a, { name: '房主' }); room.join(b, { name: '乙' }); room.message(a, JSON.stringify({ t: 'start', seed: 9 }));
  const room2 = createRoomCore(), a2 = fake('a2'), b2 = fake('b2');
  assert.ok(room2.restore(b2, b.saved)); assert.ok(room2.restore(a2, a.saved)); assert.equal(room2.restore(fake('x'), b.saved), false, '同一个座位不放两个');
  room2.settle();
  assert.equal(room2.state.host, 0); assert.equal(room2.state.started, true); assert.equal(room2.state.start.seed, 9); assert.equal(room2.state.code, 'WAKE');
  assert.equal(a2.last('need').t, 'need');
  room2.message(b2, JSON.stringify({ t: 'i', p: 2 })); assert.equal(a2.last('i').f, 1);
});

test('限流和大小：一条连接每秒几十条，攒的用完就丢；太长的消息不转；一直刷就断开', () => {
  const now = clock(), room = createRoomCore({ code: 'RATE', now, P: { ...ROOM, rate: 10, burst: 20, drop: 30 } }), a = fake('a'), b = fake('b');
  room.join(a); room.join(b);
  for (let i = 0; i < 40; i++) room.message(b, JSON.stringify({ t: 'i', n: i }));
  assert.equal(a.out.filter((m) => m.t === 'i').length, 20, '攒满 20 条以后丢掉');
  now.add(1000); room.message(b, JSON.stringify({ t: 'i', n: 99 })); assert.equal(a.last('i').n, 99, '过一秒又补上了');
  room.message(b, JSON.stringify({ t: 'i', pad: 'x'.repeat(ROOM.size.peer) })); assert.equal(b.last('err').why, 'size');
  room.message(a, JSON.stringify({ t: 's', pad: 'x'.repeat(ROOM.size.peer + 10) })); assert.ok(b.last('s'), '主机的快照可以大一些');
  for (let i = 0; i < 60; i++) room.message(b, JSON.stringify({ t: 'i' }));
  assert.equal(b.closed?.code, 1008, '一直刷被断开');
});

test('来源：正式站、预览分支、本机能连；别的网站、没有来源的不行；额外的来源可以配', () => {
  assert.ok(originAllowed('https://yunlan-mall.pages.dev')); assert.ok(originAllowed('https://abc123.yunlan-mall.pages.dev'));
  assert.ok(originAllowed('http://127.0.0.1:5191')); assert.ok(originAllowed('http://localhost:5174'));
  assert.ok(!originAllowed('https://evil.example')); assert.ok(!originAllowed('https://yunlan-mall.pages.dev.evil.example')); assert.ok(!originAllowed(''));
  assert.ok(!originAllowed('http://yunlan-mall.pages.dev'), '正式站只认 https');
  assert.ok(originAllowed('https://game.example.com', 'https://a.b, https://game.example.com'));
});

test('冒充：谁也不能发服务器才发的（换主机、有人进来、欢迎……）；不是主机的只能发操作 / 投票 / 请登机 / 回血，只发给主机；主机的规则消息照发', () => {
  const room = createRoomCore({ code: 'ABCDEF' }), a = fake('a'), b = fake('b'), c = fake('c');
  room.join(a); room.join(b); room.join(c);
  const n = (x, t) => x.out.filter((m) => m.t === t).length;
  for (const t of ROOM.server) {
    const before = [a, b, c].map((x) => n(x, t));
    room.message(b, JSON.stringify({ t, seat: 1, to: 'all', ev: 'join', name: '假的', players: [] }));
    room.message(a, JSON.stringify({ t, seat: 2, to: 'all' }));
    assert.deepEqual([a, b, c].map((x) => n(x, t)), before, `${t}：客户端（包括主机）发来的都不转`);
  }
  assert.equal(room.state.host, 0, '主机没被换掉');
  // 不是主机：规则消息（结束、投票结果、全员登机、开局、快照）一律不转
  for (const t of ['over', 'boardAll', 'votes', 'start', 'end', 's', 'chat', 'snap']) {
    room.message(b, JSON.stringify({ t, to: 'all', k: 1, n: [0, 1, 2] }));
    assert.equal(n(a, t) + n(c, t), 0, `${t}：不是主机发的不转`);
  }
  assert.equal(room.state.started, false); assert.equal(room.state.key, null);
  // 允许的那几种：只给主机（带了 to 也只给主机），补上 f
  for (const t of ROOM.peer) {
    room.message(b, JSON.stringify({ t, to: 2, x: 1 }));
    assert.equal(a.last(t)?.f, 1, `${t} 发给了主机`); assert.equal(n(c, t), 0, `${t} 没发给别人`); assert.equal(a.last(t).to, undefined);
  }
  // 主机的规则消息：照 to 发，f 是主机的座位
  room.message(a, JSON.stringify({ t: 'over', why: 'down', to: 'all' }));
  assert.equal(b.last('over').f, 0); assert.equal(c.last('over').f, 0);
  room.message(a, JSON.stringify({ t: 'boardAll', twin: true, to: 2 })); assert.equal(c.last('boardAll').f, 0); assert.equal(n(b, 'boardAll'), 0);
  // 名字照样洗
  room.message(b, JSON.stringify({ t: 'name', name: '<img src=x>\u202e坏' })); assert.equal(a.last('peer').name, 'img src=x坏');
  // 主机走了：新主机发的才算
  room.leave(a); assert.equal(room.state.host, 1); room.message(c, JSON.stringify({ t: 'over', to: 'all' })); assert.equal(n(b, 'over'), 1, '老客户端发的不算');
  room.message(b, JSON.stringify({ t: 'over', to: 'all' })); assert.equal(c.last('over').f, 1);
});

test('猜房间码：同一个 IP 一分钟里加入不存在的房间（或建房撞上有人的房间）10 次以后，再加入 / 建房都回 slow；过了一分钟重新算；一刻钟里 30 次也挡', async () => {
  const now = clock(), L = createJoinLimiter({ now });
  for (let i = 0; i < JOIN_LIMIT.max - 1; i++) L.fail('1.2.3.4');
  assert.equal(L.blocked('1.2.3.4'), false); L.fail('1.2.3.4'); assert.equal(L.blocked('1.2.3.4'), true);
  assert.equal(L.blocked('5.6.7.8'), false, '别的 IP 不受影响'); assert.equal(L.blocked(''), false);
  now.add(JOIN_LIMIT.windowMs); assert.equal(L.blocked('1.2.3.4'), false, '过了一分钟');
  // 长窗口：每分钟都只差一次没到上限，一刻钟里攒够 longMax 次也挡
  const L3 = createJoinLimiter({ now }); let n3 = 0;
  while (!L3.blocked('7.7.7.7') && n3 < 200) { for (let i = 0; i < JOIN_LIMIT.max - 1 && !L3.blocked('7.7.7.7'); i++) { L3.fail('7.7.7.7'); n3++; } now.add(JOIN_LIMIT.windowMs); }
  assert.equal(n3, JOIN_LIMIT.longMax, `一刻钟里 ${JOIN_LIMIT.longMax} 次就挡`); assert.ok(JOIN_LIMIT.max <= 10 && JOIN_LIMIT.longMax <= 30, '4 位码：限流收紧了');
  now.add(JOIN_LIMIT.longMs); assert.equal(L3.blocked('7.7.7.7'), false, '过了一刻钟');
  // 走一遍 Worker：房间（DO）回 X-Room-Join: nope 的记一次；到了上限不再去敲房间
  const L2 = createJoinLimiter({ now }); let hits = 0;
  const env = { ROOMS: { idFromName: (c) => c, get: () => ({ fetch: async () => { hits++; return { status: 101, headers: new Headers({ 'X-Room-Join': 'nope' }) }; } }) } };
  const req = (code, want = 'join') => new Request(`https://rooms.test/room/${code}?want=${want}`, { headers: { Upgrade: 'websocket', Origin: 'https://yunlan-mall.pages.dev', 'CF-Connecting-IP': '9.9.9.9' } });
  for (let i = 0; i < JOIN_LIMIT.max; i++) await worker.fetch(req(String(1000 + i * 37)), env, null, L2);
  assert.equal(hits, JOIN_LIMIT.max); assert.equal(L2.blocked('9.9.9.9'), true);
  const WP = globalThis.WebSocketPair, R = globalThis.Response, sent = [];
  globalThis.WebSocketPair = class { constructor() { this[0] = {}; this[1] = { accept() {}, send: (t) => sent.push(t), close: (c) => sent.push(c) }; } };
  globalThis.Response = class { constructor(body, init) { this.status = init?.status; } };
  try {
    const r = await worker.fetch(req('9999'), env, null, L2); assert.equal(r.status, 101);
    await worker.fetch(req('4821', 'create'), env, null, L2);
  } finally { globalThis.WebSocketPair = WP; globalThis.Response = R; }
  assert.equal(hits, JOIN_LIMIT.max, '到了上限不再去敲房间（建房也挡：撞号能探出哪些码有人）'); assert.deepEqual(sent, ['{"t":"slow"}', 4029, '{"t":"slow"}', 4029]);
  // 建房撞上有人的房间（taken）也算一次
  const L4 = createJoinLimiter({ now }), env4 = { ROOMS: { idFromName: (c) => c, get: () => ({ fetch: async () => ({ status: 101, headers: new Headers({ 'X-Room-Join': 'taken' }) }) }) } };
  for (let i = 0; i < JOIN_LIMIT.max; i++) await worker.fetch(req(String(2000 + i), 'create'), env4, null, L4);
  assert.equal(L4.blocked('9.9.9.9'), true, '建房撞号也记');
  // 房间码不是 4 位数字：直接 400，不敲房间
  const before = hits, L5 = createJoinLimiter({ now });
  for (const bad of ['K7QX2M', 'ABCD', '482', '48210']) { const r = await worker.fetch(req(bad), env, null, L5); assert.equal(r.status, 400, `${bad} 不认`); }
  assert.equal(hits, before);
});
