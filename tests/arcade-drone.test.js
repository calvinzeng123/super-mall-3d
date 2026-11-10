// 空域碰撞（src/arcade/airspace.js）和无人机送外卖的规则（games/drone-rules.js），跑在小游戏地图上。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildAirspace } from '../src/arcade/airspace.js';
import { DRONE, DRONE_LEVELS, dronePads, foodShops, buildOrders, newDrone, stepDrone, windAt, overPad, droneStars,
  newRun, stepRun, runTarget, runResult, pilotAxes } from '../src/arcade/games/drone-rules.js';
import { mulberry32, seedOf } from '../src/arcade/rng.js';

const layout = buildPlayableLayout({ mode: 'arcade' });
const air = buildAirspace(layout);
const pads = dronePads(layout, air), hub = pads[0];
const level = (id) => layout.levels.find((l) => l.id === id);
const still = { lx: 0, ly: 0, rx: 0, ry: 0 };

test('buildings are solid, roofs are landable, and the river can be flown under its bridges', () => {
  const r1 = level('R1-15F'), [x, z] = [(r1.outline[0][0] + r1.outline[2][0]) / 2, (r1.outline[0][1] + r1.outline[2][1]) / 2];
  assert.equal(air.hit(x, 50, z, 0.6)?.tag, 'R1-15F');
  const roof = level('R1-RF').elev;
  assert.equal(air.hit(x, roof + 0.7, z, 0.6), null, 'just above the roof is free');
  assert.equal(air.surfaceBelow(x, z, roof + 5), roof);
  const tops = layout.levels.filter((l) => l.building === 'R1' && l.kind !== 'roof').map((l) => Math.round((l.elev + l.height) * 1000) / 1000);
  assert.equal(air.surfaceBelow(x, z, 40), Math.max(...tops.filter((y) => y <= 40)), 'inside the tower the surface below is the top of the storey below');
  // 一期：屋面 34 m；光穹比屋面高；地下层不算实体
  assert.equal(air.surfaceBelow(hub.x, hub.z, 60), level('P1-RF').elev);
  const dome = level('P1-RF').features.find((f) => f.type === 'art-dome');
  assert.equal(air.hit(dome.cx, 45, dome.cz, 0.6)?.tag, dome.id);
  assert.equal(air.hit(dome.cx, 60, dome.cz, 0.6), null);
  assert.ok(air.solids.every((s) => s.y1 > 0 && s.y1 > s.y0), 'no underground solids');
  // 江：水面比地面低；星湾桥桥面是实体，桥下留空
  const water = layout.site.river.water, arch = layout.site.river.bridges.find((b) => b.kind === 'tied-arch');
  const mx = (arch.deck.x0 + arch.deck.x1) / 2, mz = (water.z0 + water.z1) / 2;
  assert.equal(air.ground(mx, mz), water.y);
  assert.equal(air.ground(hub.x, hub.z), 0);
  assert.equal(air.hit(mx, 0.3, mz, 0.6)?.tag, arch.id);
  assert.equal(air.hit(mx, (water.y + arch.soffit) / 2, mz, 0.6), null, 'room to fly under the deck');
  // 被裁地块的体块、周边城市的楼
  const block = layout.arcade.massing.find((m) => m.building === 'P3'), c = layout.site.urban.buildings[0];
  const bx = block.poly.reduce((s, p) => s + p[0], 0) / block.poly.length, bz = block.poly.reduce((s, p) => s + p[1], 0) / block.poly.length;
  assert.equal(air.hit(bx, 6, bz, 0.6)?.tag, block.id);
  assert.equal(air.hit(c.x, c.h / 2, c.z, 0.6)?.tag, c.id);
});

test('a move slides along walls, lands on roofs and stays inside the map', () => {
  const r1 = level('R1-15F'), z = (r1.outline[0][1] + r1.outline[2][1]) / 2, west = Math.min(...r1.outline.map((p) => p[0]));
  const blocked = air.move({ x: west - 1.5, y: 50, z }, { x: 3, y: 0, z: 2 }, 0.6);
  assert.equal(blocked.bumped, true);
  assert.ok(blocked.x < west - 0.5 && Math.abs(blocked.z - (z + 2)) < 1e-9, 'x is stopped at the wall, z keeps sliding');
  const landed = air.move({ x: hub.x, y: hub.y + 0.9, z: hub.z }, { x: 0, y: -1, z: 0 }, 0.6);
  assert.equal(landed.grounded, true);
  assert.ok(Math.abs(landed.y - (hub.y + 0.6)) < 1e-6);
  const free = air.move({ x: hub.x, y: 150, z: hub.z }, { x: 4, y: 1, z: -3 }, 0.6);
  assert.deepEqual([free.x, free.y, free.z, free.bumped, free.grounded], [hub.x + 4, 151, hub.z - 3, false, false]);
  const edge = air.move({ x: air.bounds.x1 - 1, y: 150, z: 0 }, { x: 5, y: 0, z: 0 }, 0.6);
  assert.ok(edge.x < air.bounds.x1 && edge.bumped);
});

test('pads: a hub on the mall roof and one pad on every tower roof, each on a real surface with clear air above', () => {
  assert.equal(hub.id, 'hub');
  assert.equal(hub.y, level('P1-RF').elev);
  const towers = layout.buildings.filter((b) => b.kind === 'tower').map((b) => b.id);
  assert.equal(towers.length, 10);
  for (const id of towers) {
    const pad = pads.find((p) => p.id === `${id}-roof`);
    assert.ok(pad, `no pad on ${id}`);
    assert.equal(pad.y, layout.levels.find((l) => l.building === id && l.kind === 'roof').elev);
  }
  for (const id of ['P1C-roof', 'river-park', 'xingwan-bridge']) assert.ok(pads.some((p) => p.id === id), id);
  assert.equal(new Set(pads.map((p) => p.id)).size, pads.length);
  for (const p of pads) {
    assert.equal(air.hit(p.x, p.y + 1.8, p.z, 1.6), null, `${p.id} is obstructed`);
    assert.ok(Math.abs(air.surfaceBelow(p.x, p.z, p.y + 3) - p.y) < 0.6, `${p.id} floats`);
    assert.ok(['hub', 'near', 'far'].includes(p.zone));
  }
  assert.ok(pads.filter((p) => p.zone === 'near').length >= DRONE_LEVELS.lunch.orders, 'enough near pads for the first level');
});

test('orders are fixed per level, come from food shops and respect the level zone', () => {
  assert.ok(foodShops(layout).length > 100);
  for (const [id, cfg] of Object.entries(DRONE_LEVELS)) {
    const a = buildOrders(layout, pads, cfg, mulberry32(seedOf(`drone:${id}`)));
    const b = buildOrders(layout, pads, cfg, mulberry32(seedOf(`drone:${id}`)));
    assert.equal(a.length, cfg.orders);
    assert.deepEqual(a.map((o) => [o.shop.id, o.to.id]), b.map((o) => [o.shop.id, o.to.id]));
    for (const o of a) {
      assert.ok(o.shop.name && !o.to.hub);
      if (cfg.zone === 'near') assert.equal(o.to.zone, 'near');
    }
    assert.equal(new Set(a.map((o) => o.to.id)).size, a.length, 'no destination twice while there are enough pads');
  }
});

test('flight: forward speed, turning, climbing, a wall bump and battery drain', () => {
  const s = Object.assign(newDrone(hub), { y: 150 });
  const z0 = s.z;
  for (let i = 0; i < 90; i++) stepDrone(s, { ...still, ly: 1 }, 1 / 30, air);
  assert.ok(s.z < z0 - 30 && Math.abs(s.x - hub.x) < 1e-6, 'yaw 0 flies towards −z');
  assert.ok(Math.abs(Math.hypot(s.vx, s.vz) - DRONE.speed) < 0.5);
  for (let i = 0; i < 30; i++) stepDrone(s, { ...still, rx: 1 }, 1 / 30, air);
  assert.ok(s.yaw < -1.5, 'right stick turns right (clockwise from above)');
  const y0 = s.y; for (let i = 0; i < 60; i++) stepDrone(s, { ...still, ry: 1 }, 1 / 30, air);
  assert.ok(s.y > y0 + 12);
  assert.ok(s.battery < DRONE.battery && s.battery > 80);
  // 撞墙：朝 R1 的西墙全速飞
  const r1 = level('R1-15F'), wz = (r1.outline[0][1] + r1.outline[2][1]) / 2, west = Math.min(...r1.outline.map((p) => p[0]));
  const d = Object.assign(newDrone(hub), { x: west - 22, y: 50, z: wz, yaw: -Math.PI / 2 }); // 机头朝 +x；R1 和公寓之间的空当起飞
  assert.equal(air.hit(d.x, d.y, d.z, DRONE.radius), null);
  let impact = 0;
  for (let i = 0; i < 200 && !impact; i++) impact = stepDrone(d, { ...still, ly: 1 }, 1 / 30, air).impact;
  assert.ok(impact > DRONE.crashSpeed, `impact ${impact}`);
  assert.ok(d.x < west - DRONE.radius + 0.01, 'stopped outside the wall');
  assert.ok(d.vx <= 0, 'bounced back');
  // 风只在高处有
  assert.deepEqual(windAt(10, 5, 30), { x: 0, z: 0, k: 0 });
  assert.equal(windAt(10, 0, 200).k, 0);
  const w = windAt(10, 5, 200); assert.ok(Math.hypot(w.x, w.z) > 2 && Math.hypot(w.x, w.z) <= 5);
});

test('hovering over a pad counts only when close, low and slow', () => {
  const s = newDrone(hub);
  assert.equal(overPad(s, hub), true);
  assert.equal(overPad({ ...s, x: s.x + DRONE.padRadius + 0.5 }, hub), false);
  assert.equal(overPad({ ...s, y: hub.y + DRONE.radius + DRONE.padHeight + 0.5 }, hub), false);
  assert.equal(overPad({ ...s, vx: DRONE.padSpeed + 1 }, hub), false);
});

test('stars: half the orders, all the orders, all of them cleanly with time to spare', () => {
  const base = { total: 4, crashes: 0, timeLeft: 100, seconds: 240 };
  assert.equal(droneStars({ ...base, delivered: 1 }), 0);
  assert.equal(droneStars({ ...base, delivered: 2 }), 1);
  assert.equal(droneStars({ ...base, delivered: 4 }), 3);
  assert.equal(droneStars({ ...base, delivered: 4, crashes: 2 }), 2);
  assert.equal(droneStars({ ...base, delivered: 4, timeLeft: 20 }), 2);
});

test('the autopilot finishes every level in time: the levels are winnable as tuned', () => {
  for (const [id, cfg] of Object.entries(DRONE_LEVELS)) {
    const orders = buildOrders(layout, pads, cfg, mulberry32(seedOf(`drone:${id}`)));
    const run = newRun(cfg, orders, hub), seen = [];
    assert.equal(runTarget(run).id, 'hub');
    for (let i = 0; i < cfg.seconds * 30 + 10 && !run.ended; i++) for (const e of stepRun(run, pilotAxes(run), 1 / 30, air)) seen.push(e.type);
    const r = runResult(run);
    assert.equal(run.reason, 'done', `${id}: ${r.delivered}/${r.total} delivered, ${r.crashes} crashes, ${r.swaps} swaps`);
    assert.equal(r.success, true);
    assert.ok(r.stars >= 2, `${id}: ${r.stars} stars, ${r.crashes} crashes, ${Math.round(r.timeLeft)} s left`);
    assert.equal(seen.filter((t) => t === 'pickup').length, cfg.orders);
    assert.equal(seen.filter((t) => t === 'deliver').length, cfg.orders);
    assert.equal(seen.at(-1), 'end');
    assert.equal(r.swaps, 0, `${id}: the battery lasts a round trip`);
    assert.deepEqual(stepRun(run, pilotAxes(run), 1 / 30, air), [], 'nothing happens after the end');
  }
});

test('running out of time or battery', () => {
  const cfg = { ...DRONE_LEVELS.lunch, seconds: 5 };
  const orders = buildOrders(layout, pads, DRONE_LEVELS.lunch, mulberry32(1));
  const run = newRun(cfg, orders, hub);
  let last = null;
  for (let i = 0; i < 400 && !run.ended; i++) for (const e of stepRun(run, still, 1 / 30, air)) last = e;
  assert.deepEqual(last, { type: 'end', reason: 'time' });
  assert.deepEqual([runResult(run).success, runResult(run).stars], [false, 0]);
  // 电量耗尽：回到取餐点上方、满电、扣时间、订单还在
  const r2 = newRun(DRONE_LEVELS.dinner, buildOrders(layout, pads, DRONE_LEVELS.dinner, mulberry32(2)), hub);
  stepRun(r2, still, 1.2, air); // 悬停取餐
  assert.equal(r2.phase, 'deliver');
  Object.assign(r2.drone, { x: hub.x + 80, y: 120, battery: 0.01 });
  const before = r2.timeLeft, events = stepRun(r2, still, 0.1, air).map((e) => e.type);
  assert.deepEqual(events, ['swap']);
  assert.equal(r2.drone.battery, DRONE.battery);
  assert.ok(Math.abs(r2.drone.x - hub.x) < 1e-9 && r2.phase === 'deliver' && r2.swaps === 1);
  assert.ok(Math.abs(before - r2.timeLeft - 0.1 - DRONE.swapPenalty) < 1e-9);
});
