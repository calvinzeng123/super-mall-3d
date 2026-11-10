// 夜间潜入的规则（src/arcade/games/heist-rules.js）：巡逻线在真实地图上走得通，视野、听觉和警觉条按规则变化。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, clear, step, spawn } from '../src/layout/nav.js';
import { traceMotion, hasLineOfSight } from '../src/fps/pathfinding.js';
import { HEIST, HEIST_LEVELS, patrolNodes, patrolEdges, patrolStarts, patrolLoop, newGuard, guardSees, alertRate, updateAlert,
  stepGuard, sightLine, openVoids, heistStars, heistScore } from '../src/arcade/games/heist-rules.js';
import { mulberry32, seedOf } from '../src/arcade/rng.js';

const layout = buildPlayableLayout({ mode: 'arcade' });
const nav = buildNav(layout);
const cfg = HEIST_LEVELS.gallery;
const standable = (floor) => (x, z) => clear(nav, { floor, x, z, slope: null });
const sees = (floor) => { const walls = nav.floors.get(floor).walls, voids = openVoids(layout.levels.find((l) => l.id === floor)), ok = standable(floor); return (a, b) => sightLine(a, b, walls, ok, voids); };
const graph = (floor) => {
  const lv = layout.levels.find((l) => l.id === floor), see = sees(floor);
  const nodes = patrolNodes(lv, standable(floor));
  const adj = patrolEdges(nodes, (a, b) => see(a, b) && !!traceMotion(nav, { floor, x: a.x, z: a.z }, { floor, x: b.x, z: b.z }, { stepSize: 0.6 }));
  return { nodes, adj };
};
const walkOn = (g, dx, dz) => { const s = step(nav, { floor: g.floor, x: g.x, z: g.z, y: g.y, slope: null }, dx, dz, 0); return s.floor === g.floor && !s.slope ? s : g; };

test('the start and every objective are real places on the map', () => {
  assert.equal(spawn(nav, layout, {}).floor, 'ground');
  for (const o of cfg.objectives) {
    const st = spawn(nav, layout, { level: o.level });
    assert.equal(st?.floor, o.level, o.id);
    assert.ok(clear(nav, st));
    assert.ok(o.title && o.where && o.done);
  }
  assert.deepEqual(cfg.objectives.map((o) => o.id), ['card', 'exhibit', 'escape']);
});

test('every guard floor gives a patrol graph, and guards walk their loops without getting stuck', () => {
  const rng = mulberry32(seedOf('heist:gallery'));
  let guards = 0;
  for (const [floor, count] of cfg.guards) {
    const { nodes, adj } = graph(floor), F = nav.floors.get(floor);
    assert.ok(nodes.length >= 6, `${floor}: ${nodes.length} nodes`);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) assert.ok(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z) >= 4);
    adj.forEach((list, i) => { for (const j of list) assert.ok(adj[j].includes(i), 'edges go both ways'); });
    const starts = patrolStarts(nodes, adj, rng, count);
    assert.equal(new Set(starts).size, count, `${floor}: ${count} distinct starts`);
    for (const s of starts) {
      const route = patrolLoop(nodes, adj, s, 4);
      assert.ok(route.length >= 4, `${floor}: loop of ${route.length}`);
      assert.deepEqual([route[0].x, route[0].z], [nodes[s].x, nodes[s].z]);
      const g = newGuard(`${floor}-G`, floor, F.y, route, 0);
      let walked = 0, worst = 0;
      for (let k = 0; k < 90 * 30; k++) { const [px, pz] = [g.x, g.z]; stepGuard(g, 1 / 30, k / 30, walkOn); walked += Math.hypot(g.x - px, g.z - pz); worst = Math.max(worst, g.stuck); }
      assert.ok(walked > 60, `${floor}: walked ${walked.toFixed(0)} m in 90 s`);
      assert.ok(worst < 1.5, `${floor}: stuck for ${worst.toFixed(1)} s`);
      assert.ok(clear(nav, { floor, x: g.x, z: g.z, slope: null }), 'still on walkable floor');
      guards++;
    }
  }
  assert.equal(guards, cfg.guards.reduce((n, [, c]) => n + c, 0));
});

test('sight on the real map: walls block it, and an atrium can be seen across', () => {
  const mall = graph('P1-1F').nodes, see = sees('P1-1F');
  let blocked = 0, close = 0;
  for (let i = 0; i < mall.length; i++) for (let j = i + 1; j < mall.length; j++) {
    if (Math.hypot(mall[i].x - mall[j].x, mall[i].z - mall[j].z) > HEIST.range) continue;
    close++; if (!see(mall[i], mall[j])) blocked++;
  }
  assert.ok(blocked > 20 && blocked < close, `${blocked} of ${close} nearby pairs are hidden from each other`);
  // 艺文馆 4F 中间是中庭洞口：站在两侧互相看得见，尽管中间不能站人
  const floor = 'P1C-4F', lv = layout.levels.find((l) => l.id === floor), atrium = lv.voids.find((v) => v.kind === 'atrium');
  assert.deepEqual(openVoids(lv), [atrium.poly], 'lift shafts and stair cores are not see-through');
  const xs = atrium.poly.map((p) => p[0]), zs = atrium.poly.map((p) => p[1]), z = (Math.min(...zs) + Math.max(...zs)) / 2, ok = standable(floor);
  let west = Math.min(...xs) - 0.6, east = Math.max(...xs) + 0.6;
  while (!ok(west, z) && west > Math.min(...xs) - 6) west -= 0.3;
  while (!ok(east, z) && east < Math.max(...xs) + 6) east += 0.3;
  assert.ok(ok(west, z) && ok(east, z) && !ok((west + east) / 2, z), 'two standable points with the void between them');
  const a = { floor, x: west, z }, b = { floor, x: east, z };
  assert.equal(sees(floor)(a, b), true, 'seen across the atrium');
  assert.equal(hasLineOfSight(nav, a, b), false, 'the FPS sight line stops at the void');
  assert.equal(sightLine(a, b, nav.floors.get(floor).walls, ok, []), false, 'without the void list it is blocked too');
  // 巡逻图的每条边都既走得通又看得见
  const g = graph(floor);
  g.adj.forEach((list, i) => { for (const j of list) assert.equal(sees(floor)(g.nodes[i], g.nodes[j]), true); });
});

test('vision: range, cone, touch distance and floor', () => {
  const g = { floor: 'F', x: 0, z: 0, yaw: 0 }, open = () => true, at = (x, z, floor = 'F') => ({ floor, x, z }); // yaw 0 faces +z
  assert.equal(guardSees(g, at(0, 10), open), true);
  assert.equal(guardSees(g, at(0, -10), open), false, 'behind');
  assert.equal(guardSees(g, at(0, -HEIST.touch + 0.2), open), true, 'right behind, close enough to notice');
  assert.equal(guardSees(g, at(0, HEIST.range + 1), open), false, 'too far');
  const off = (deg, d = 10) => at(Math.sin(deg * Math.PI / 180) * d, Math.cos(deg * Math.PI / 180) * d);
  assert.equal(guardSees(g, off(HEIST.fov / 2 - 3), open), true);
  assert.equal(guardSees(g, off(HEIST.fov / 2 + 3), open), false);
  assert.equal(guardSees(g, at(0, 10, 'G'), open), false, 'another floor');
  assert.equal(guardSees(g, at(0, 10), () => false), false, 'a wall in between');
  assert.equal(guardSees({ ...g, yaw: Math.PI / 2 }, at(10, 0), open), true, 'yaw turns the cone towards +x');
});

test('the alert bar fills faster up close, falls when unseen, and guards react to sight and sound', () => {
  assert.ok(alertRate(1) > alertRate(10) && alertRate(10) > alertRate(19));
  assert.ok(Math.abs(alertRate(0) - HEIST.fillNear) < 1e-9 && Math.abs(alertRate(HEIST.range * 3) - HEIST.fillFar) < 1e-9);
  const open = () => true, mk = () => ({ id: 'g', floor: 'F', x: 0, z: 0, yaw: 0, mode: 'patrol', target: null, until: 0 });
  const p = { floor: 'F', x: 0, z: 5, speed: 1, hidden: false };
  let g = mk(), r = updateAlert(0, [g], p, 0.5, 10, open);
  assert.equal(r.seenBy, 1);
  assert.ok(Math.abs(r.alert - alertRate(5) * 0.5) < 1e-9);
  assert.deepEqual([g.mode, g.target], ['look', { x: 0, z: 5 }]);
  const far = updateAlert(0, [mk()], { ...p, z: 19 }, 0.5, 10, open).alert;
  assert.ok(far < r.alert);
  assert.ok(updateAlert(0, [mk()], { ...p, speed: HEIST.runSpeed + 1 }, 0.5, 10, open).alert > r.alert, 'running in view is worse');
  assert.equal(updateAlert(0.95, [mk()], p, 1, 10, open).alert, 1, 'capped at full');
  // 没人看见：回落
  const behind = { ...p, z: -8 };
  g = mk(); r = updateAlert(0.5, [g], behind, 1, 10, open);
  assert.deepEqual([r.seenBy, r.heardBy, g.mode], [0, 0, 'patrol']);
  assert.ok(Math.abs(r.alert - (0.5 - HEIST.decay)) < 1e-9);
  assert.equal(updateAlert(0.1, [mk()], behind, 5, 10, open).alert, 0);
  // 背后跑步：听见了，过去查看；走路没事；太远听不见
  g = mk(); r = updateAlert(0, [g], { ...behind, speed: HEIST.runSpeed + 1 }, 0.1, 10, open);
  assert.deepEqual([r.heardBy, g.mode, g.target, g.until], [1, 'investigate', { x: 0, z: -8 }, 10 + HEIST.investigate]);
  g = mk(); assert.equal(updateAlert(0, [g], { ...behind, z: -HEIST.hear - 2, speed: 9 }, 0.1, 10, open).heardBy, 0);
  // 在楼梯、电梯里：看不见也听不见
  g = mk(); r = updateAlert(0.3, [g], { ...p, speed: 9, hidden: true }, 0.1, 10, open);
  assert.deepEqual([r.seenBy, r.heardBy, g.mode], [0, 0, 'patrol']);
});

test('a guard walks the loop in order, pauses at stops, and returns to patrol after investigating', () => {
  const route = [{ x: 0, z: 0, stop: true }, { x: 10, z: 0, stop: true }, { x: 10, z: 10, stop: true }];
  const free = (g, dx, dz) => ({ x: g.x + dx, z: g.z + dz });
  const g = newGuard('g', 'F', 0, route, 0);
  let t = 0; const run = (seconds) => { for (let i = 0; i < seconds * 30; i++) { stepGuard(g, 1 / 30, t, free); t += 1 / 30; } };
  run(10 / HEIST.guardSpeed + 0.2);
  assert.ok(Math.hypot(g.x - 10, g.z) < 0.4 && g.wait > 0 && g.i === 2, 'reached the first stop and is pausing');
  assert.ok(Math.abs(g.yaw - Math.PI / 2) < 0.6, 'faced +x while walking');
  run(HEIST.pause + 10 / HEIST.guardSpeed + 0.3);
  assert.ok(Math.hypot(g.x - 10, g.z - 10) < 0.4 && g.i === 0);
  // 看见人：停下盯着；人不见了：走过去查看；查完回到最近的路点
  Object.assign(g, { mode: 'look', target: { x: 10, z: 20 }, until: t + 0.5 });
  const [x0, z0] = [g.x, g.z]; run(0.4);
  assert.deepEqual([g.x, g.z, g.mode], [x0, z0, 'look']);
  run(0.3); assert.equal(g.mode, 'investigate');
  run(10 / HEIST.searchSpeed + 0.3);
  assert.equal(g.mode, 'patrol');
  assert.ok(Math.hypot(g.x - 10, g.z - 20) < 1.5);
  assert.equal(g.i, 2, 'heads back to the nearest loop point');
  // 被墙挡住的保安不会原地卡死
  const wall = (h) => ({ x: h.x, z: h.z }), stuck = newGuard('s', 'F', 0, route, 0);
  for (let i = 0; i < 4 * 30; i++) stepGuard(stuck, 1 / 30, i / 30, wall);
  assert.ok(stuck.i !== 1, 'gives up on an unreachable point and moves on');
});

test('stars: out, unnoticed, and in time', () => {
  assert.equal(heistStars({ escaped: false, maxAlert: 0, seconds: 10 }), 0);
  assert.equal(heistStars({ escaped: true, maxAlert: 0.8, seconds: 10 }), 1);
  assert.equal(heistStars({ escaped: true, maxAlert: 0.3, seconds: HEIST.par + 1 }), 2);
  assert.equal(heistStars({ escaped: true, maxAlert: 0.3, seconds: HEIST.par }), 3);
  assert.equal(heistScore({ escaped: false, maxAlert: 0, seconds: 1 }), 0);
  assert.ok(heistScore({ escaped: true, maxAlert: 0, seconds: 100 }) > heistScore({ escaped: true, maxAlert: 0.5, seconds: 100 }));
});
