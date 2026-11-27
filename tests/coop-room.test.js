// 丧尸围城联机的房间服务器（cloud/rooms/room-core.js、worker.js）：座位、主机、转发、中途加入、主机迁移、限流、来源检查。
// 用假连接（记下发出去的每一条），不连 Cloudflare。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomCore, ROOM, roleName } from '../cloud/rooms/room-core.js';
import { originAllowed } from '../cloud/rooms/worker.js';

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
  assert.equal(roleName(1), '阿哲'); assert.ok(ROOM.code.test('K7QX') && !ROOM.code.test('AB0D') && !ROOM.code.test('ABC'));
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
  room.message(b, JSON.stringify({ t: 'chat', to: 'all', x: 1 })); assert.equal(c.last('chat').f, 1); assert.equal(a.last('chat').f, 1);
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
