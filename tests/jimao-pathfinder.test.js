// 零点突围的分帧寻路（src/jimao/pathfinder.js）：
// ① 和原来一次算完的 findPath 找到的路一样通、长度相当；② 真的是分片算的（预算很小时要调很多次 update 才出结果），结果和一次算完相同；
// ③ lifts: true 时会走电梯（给玩家的路线指引），不给时不会；④ 取消的请求不回调；⑤ 走不到的目标回调 null。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, clear } from '../src/layout/nav.js';
import { findPath, traceMotion } from '../src/fps/pathfinding.js';
import { createPathfinder, PATH } from '../src/jimao/pathfinder.js';

const L = buildPlayableLayout({ mode: 'arcade' });
const nav = buildNav(L);
const S = (floor, x, z) => ({ floor, x, z, y: nav.floors.get(floor).y, slope: null });
const START = S('P1-1F', -135, -98);
const GOALS = [['商场西翼', S('P1-1F', -169, -90)], ['酒店二楼', S('H-2F', -245, -81.1533717)], ['地下大厅', S('P1-B1M', -151, -94)], ['屋顶停机位', S('P1-RF', -183.75, -119.75)], ['公寓车库', S('A-B1', -51.85, -231.5)]];
const length = (p) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i].x, q.z - p[i].z), 0);
const pf = createPathfinder(nav);

test('一次算完：每个任务地点都找得到路，长度和原来的寻路差不到一成；同层的每一段都真的走得过去', () => {
  for (const [name, goal] of GOALS) {
    const mine = pf.findNow(START, goal), old = findPath(nav, START, goal, { maxNodes: 12000, cellSize: 0.8 });
    assert.ok(mine && old, `${name}：${mine ? '' : '新'}${old ? '' : '旧'}寻路没找到路`);
    assert.ok(Math.abs(length(mine) - length(old)) < Math.max(4, length(old) * 0.1), `${name}：新 ${length(mine).toFixed(0)} 米，旧 ${length(old).toFixed(0)} 米`);
    assert.ok(Math.hypot(mine.at(-1).x - goal.x, mine.at(-1).z - goal.z) < 0.01 && mine.at(-1).floor === goal.floor, `${name}：路的终点不是目标`);
    for (let i = 1; i < mine.length; i++) {
      const a = mine[i - 1], b = mine[i];
      if (a.floor === b.floor && !a.slope && !b.slope && clear(nav, a) && clear(nav, b)) assert.ok(traceMotion(nav, a, b), `${name}：第 ${i} 段走不过去`);
    }
  }
});

test('分片：预算很小时一帧只算一小段，要调很多次 update 才出结果；结果和一次算完的一样', () => {
  const fresh = createPathfinder(nav);
  const got = [];
  for (const [name, goal] of GOALS) fresh.request(START, goal, (p) => got.push([name, p]));
  assert.equal(fresh.pending, GOALS.length);
  let calls = 0;
  while (fresh.pending && calls < 200000) { fresh.update(0); calls++; }
  assert.equal(got.length, GOALS.length, '每个请求都回调了');
  assert.deepEqual(got.map((g) => g[0]), GOALS.map((g) => g[0]), '按排队的先后回调');
  assert.ok(calls > 300, `只调了 ${calls} 次 update 就全算完了，没有分片`);
  for (const [name, p] of got) {
    const whole = pf.findNow(START, GOALS.find((g) => g[0] === name)[1]);
    assert.ok(p && Math.abs(length(p) - length(whole)) < 0.01, `${name}：分片算的和一次算完的不一样`);
  }
  assert.equal(fresh.stats.done, GOALS.length);
});

test('电梯：给玩家指路时把电梯算进去（去酒店高层、去屋顶都坐电梯，路更短）；敌人的寻路不会用电梯', () => {
  const lifts = (nav.links || []).filter((l) => l.kind === 'lift' && l.stops.length > 1);
  assert.ok(lifts.length > 10, '地图上应该有十几部电梯');
  const roof = GOALS[3][1];
  const walk = pf.findNow(START, roof), ride = pf.findNow(START, roof, { lifts: true });
  assert.ok(walk.every((p) => !p.via), '不开 lifts 的路线里不该有电梯');
  const hop = ride.find((p) => p.via === 'lift');
  assert.ok(hop, '去屋顶的路线应该坐电梯');
  assert.equal(hop.to, 'P1-RF'); assert.ok(hop.lift && hop.from);
  assert.ok(length(ride) < length(walk) * 0.7, `坐电梯要走 ${length(ride).toFixed(0)} 米，走扶梯 ${length(walk).toFixed(0)} 米`);
  // 电梯那一跳的前一个点就是电梯门口（lift.js 认门口 2.4 米内）
  const at = ride[ride.indexOf(hop) - 1];
  assert.ok(lifts.some((l) => l.stops.some((s) => s.floor === at.floor && Math.hypot(s.x - at.x, s.z - at.z) < 0.01)), '电梯那一跳的起点不在电梯门口');
});

test('取消的请求不回调；走不到的地方回调 null；重置清空队列', () => {
  const fresh = createPathfinder(nav);
  let a = 'none', b = 'none', c = 'none';
  const ja = fresh.request(START, GOALS[1][1], (p) => { a = p; });
  fresh.request(START, { floor: 'P1-1F', x: 5000, z: 5000, y: 0, slope: null }, (p) => { b = p; });
  ja.cancel();
  while (fresh.pending) fresh.update(5);
  assert.equal(a, 'none'); assert.equal(b, null);
  assert.equal(fresh.stats.cancelled, 1); assert.equal(fresh.stats.failed, 1);
  fresh.request(START, GOALS[0][1], (p) => { c = p; });
  fresh.reset();
  assert.equal(fresh.pending, 0); fresh.update(5); assert.equal(c, 'none');
  assert.ok(PATH.budget > 0 && PATH.budget <= 5, '每帧的寻路预算应该只有几毫秒');
});
