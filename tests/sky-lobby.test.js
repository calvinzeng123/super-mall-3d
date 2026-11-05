// 云澜·北苑 7F 空中大堂（规格 skylobby §11）：与一期天台同层，朝两塔之间的一翼对天台开南门与缝侧门，
// 不刷卡也能穿堂而过；礼宾台、江景休息区对公众开放；速通闸机后的候梯厅紧挨核心筒，住户电梯直上。
// 全程用真实门禁（tapGate / updateGates / gateBlocking）与导航（step / linksNear）；疏散距离、够不到、
// HUD 名称、可见性规则与渲染（Node three）一并钉住。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, lvl, stairDoor } from './helpers.js';
import { buildNav, step, clear, linksNear, tapGate, updateGates, gateBlocking, resetGates, floorLabel, spawn, GATE, NAV } from '../src/layout/nav.js';
import { toW, toL, pointInPoly, rectPoly, dist, distToSeg } from '../src/layout/geom.js';
import { gateRecordErrors } from '../src/layout/access-records.js';
import { SKY_LOBBY, northStops } from '../src/layout/north-towers.js';
import { BatchSet } from '../src/render/batch.js';
import { buildCommunityTower } from '../src/render/build/community.js';
import { buildAccessGates } from '../src/render/build/access-gates.js';
import { skyLobbyVisibility } from '../src/render/explore-visibility.js';

const nav = buildNav(L), gates = L.accessControl.gates, zones = L.accessControl.zones;
const floorY = (f) => (f === 'ground' ? 0 : nav.floors.get(f).y);
const S = (floor, x, z) => ({ floor, x, z, y: floorY(floor), slope: null });
const at = (s, p, e = .05) => Math.hypot(s.x - p[0], s.z - p[1]) < e;
const label = (s) => floorLabel(nav, L, s);
const inZone = (z, p) => z.polys.some((q) => pointInPoly(p, q));
const TOWERS = [
  // near: the private lift on the lift-hall side; far: the other one, through the two 0.9 m fire doors.
  { id: 'T1', n: '1', gateX: -251.6, laneZ: -234.1, inside: -254.1, near: ['T1-LE', -257.3, 'T1-10F'], far: ['T1-LW', -262.7, 'T1-16F'], door: -249 },
  { id: 'T2', n: '2', gateX: -220.4, laneZ: -236.3, inside: -217.9, near: ['T2-LW', -214.7, 'T2-10F'], far: ['T2-LE', -209.3, 'T2-17F'], door: -222 },
];

/** 10 cm a step; the clock runs 36 ms a step and the gate states update (exit sensor, auto close). */
function walk(r, to) {
  let { s, now } = r;
  const n = Math.max(1, Math.ceil(Math.hypot(to[0] - s.x, to[1] - s.z) / .1)), dx = (to[0] - s.x) / n, dz = (to[1] - s.z) / n;
  for (let i = 0; i < n; i++) { s = step(nav, s, dx, dz, .036); now += .036; updateGates(nav, s, now); r.trail?.push(s); }
  return { ...r, s, now };
}
const route = (r, pts) => pts.reduce((q, p) => walk(q, p), r);
/** Without a card: walking toward the residents' side stops within 0.5 m of the line, the HUD asks for this gate. */
function blocked(r, id, inside) {
  const g = gates.find((q) => q.id === id), q = walk(r, inside), [, v] = toL(g.frame, q.s.x, q.s.z);
  assert.ok(v < 0 && v > -.5, `${id} 未刷卡却走过了门线 (v=${v.toFixed(2)})`);
  assert.equal(gateBlocking(nav, q.s)?.id, id, `${id} 没有提示刷卡`);
  return q;
}
/** Tap: the reader is within reach (E works), then tap. */
function tap(r, id) {
  const g = gates.find((q) => q.id === id), [rx, rz] = toW(g.frame, g.reader.u, g.reader.v);
  assert.ok(Math.hypot(r.s.x - rx, r.s.z - rz) <= NAV.reach + .6, `${id} 读卡器离门口太远`);
  assert.ok(linksNear(nav, g.floors[0], rx, rz).some((n) => n.link.id === id && n.options[0].action === 'tap'), `${id} 读卡器不可互动`);
  assert.ok(tapGate(nav, id, r.now));
  return r;
}
/** Ride a lift from its stop: choose the floor with linksNear, land on the stop of that floor. */
function ride(r, liftId, floor) {
  const n = linksNear(nav, r.s.floor, r.s.x, r.s.z).find((q) => q.link.id === liftId), o = n?.options.find((q) => q.floor === floor);
  assert.ok(o, `${liftId} 在 ${r.s.floor} 不能去 ${floor}`);
  const s = S(o.floor, o.x, o.z);
  assert.ok(clear(nav, s), `${liftId} ${floor} 出梯点不可站立`);
  return { s, now: r.now + 30 };
}
const stopOf = (id, floor) => nav.links.find((k) => k.id === id).stops.find((q) => q.floor === floor);

test('记录：每栋 7F 两樘门通一期天台（南门 3.0 m、缝侧门 2.4 m）、一道速通闸机、一个住户区；会所只剩远离缝的一翼', () => {
  assert.deepEqual(L.northResidences.skyLobbies, ['T1-7F', 'T2-7F']);
  for (const t of TOWERS) {
    const lv = lvl(`${t.id}-7F`), plan = lv.lobbyPlan, s = t.id === 'T1' ? 1 : -1;
    assert.equal(lv.name, '7F 空中大堂');
    assert.equal(lv.theme.label.split(' · ')[0], '空中大堂');
    assert.equal(plan.kind, 'community-club');
    assert.equal(plan.side, t.id === 'T1' ? 'E' : 'W');
    assert.deepEqual(lv.skyLobby.doors, [`${t.id}-SKY-S`, `${t.id}-SKY-GAP`]);
    const [S0, G0] = lv.skyLobby.doors.map((id) => L.entrances.find((e) => e.id === id));
    for (const e of [S0, G0]) assert.deepEqual([e.level, e.to, e.building, e.residentialCore, e.main], [lv.id, 'P1-RF', t.id, t.id, false]);
    assert.deepEqual([S0.width, S0.nx, S0.nz, S0.seg.z0, S0.seg.z1], [3, 0, 1, -224, -224]);
    assert.ok(S0.seg.x0 <= t.door - 1.4 && S0.seg.x1 >= t.door + 1.4, `${S0.id} ${S0.seg.x0}…${S0.seg.x1}`);
    assert.deepEqual([G0.width, G0.nx, G0.nz, G0.seg.x0, G0.seg.x1, G0.seg.z0, G0.seg.z1], [2.4, s, 0, t.id === 'T1' ? -242 : -228, t.id === 'T1' ? -242 : -228, -227.4, -225]);
    // 闸机与住户区
    const g = gates.find((q) => q.id === `${t.id}-7F-GATE`), z = zones.find((q) => q.id === `${t.id}-7F`);
    assert.equal(g.kind, 'speed-gates');
    assert.deepEqual(g.floors, [lv.id]);
    assert.deepEqual(gateRecordErrors(g), []);
    assert.equal(g.lanes.length, 3);
    assert.ok(g.lanes.at(-1).accessible);
    assert.deepEqual([g.frame.ox, g.frame.oz], lv.skyLobby.gateFrame.slice(0, 2));
    assert.equal(z.label, `北苑 ${t.n} 号楼 · 空中大堂候梯厅`);
    const band = [(t.id === 'T1' ? -260 : -212), -235.2];
    for (const p of [band, [t.gateX - s * 2, -236], [t.gateX - s * 2, -233]]) assert.ok(inZone(z, p), `${z.id} 不含 ${p}`);
    for (const p of [[t.gateX + s * 2, -236], [t.door, -228]]) assert.ok(!inZone(z, p), `${z.id} 含公共点 ${p}`);
    // 保留的会所一翼不在住户区内（闸机后经候梯带进入）
    assert.ok(lv.skyLobby.clubRects.every((r) => !inZone(z, [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2])));
  }
  const kept = (id) => lvl(id).lobbyPlan.zones.filter((q) => !q.id.startsWith('sky-')).map((q) => q.id);
  assert.deepEqual(kept('T1-7F'), ['lounge', 'library']);
  assert.deepEqual(kept('T2-7F'), ['dining', 'gym']);
  assert.ok(lvl('T2-7F').lobbyPlan.obstacles.filter((o) => o.type === 'treadmill').length === 3);
  assert.equal(gates.length, 16);
  assert.equal(zones.length, 14);
  // 电梯停靠不变：7F 三部都停
  for (const t of TOWERS) for (const k of ['LW', 'LF', 'LE']) assert.ok(northStops(t.id)[k].includes(`${t.id}-7F`));
});

test('一期屋面：塔楼底板边线的墙只在空中大堂的两樘门处断开（每栋缺口合计 5.4 m，门洞里没有墙）', () => {
  const rf = lvl('P1-RF'), walls = rf.navWalls.filter((w) => w.towerPlate);
  const doors = L.entrances.filter((e) => e.skyLobby);
  assert.equal(doors.length, 4);
  for (const pl of rf.towerPlates) {
    const perimeter = pl.poly.reduce((n, p, i, P) => n + dist(p, P[(i + 1) % P.length]), 0);
    const mine = walls.filter((w) => [[w.x0, w.z0], [w.x1, w.z1]].every((p) => pl.poly.some((q, i, P) => distToSeg(p, q, P[(i + 1) % P.length]) < 1e-6)));
    const len = mine.reduce((n, w) => n + Math.hypot(w.x1 - w.x0, w.z1 - w.z0), 0);
    assert.ok(Math.abs(perimeter - len - 5.4) < 1e-6, `${pl.building} 底板墙缺口 ${(perimeter - len).toFixed(3)} m`);
  }
  for (const d of doors) for (const t of [.05, .5, .95]) {
    const p = [d.seg.x0 + (d.seg.x1 - d.seg.x0) * t, d.seg.z0 + (d.seg.z1 - d.seg.z0) * t];
    assert.ok(walls.every((w) => distToSeg(p, [w.x0, w.z0], [w.x1, w.z1]) > 1e-3), `${d.id} 门洞里有底板墙`);
  }
});

for (const t of TOWERS) {
  test(`住户回家 ${t.id}：一期天台方庭观光梯出口 → 南门 → 空中大堂 → 刷卡闸机（不刷卡过不去）→ 候梯厅 → 两部私家梯直达`, () => {
    resetGates(nav);
    const gw = stopOf('P1-SQ-GW', 'P1-RF');
    assert.deepEqual([gw.x, gw.z], [-237.8, -200]);
    let r = { s: S('P1-RF', gw.x, gw.z), now: 0 };
    assert.ok(clear(nav, r.s));
    assert.equal(label(r.s), '一期 · RF 天台花园');
    // 沿方庭天幕北排柱西侧 / 天窗北侧走到南门前，穿门进 7F
    r = route(r, t.id === 'T1' ? [[-238.5, -205], [-238.5, -221], [t.door, -221], [t.door, -225.6]]
      : [[-238.5, -205], [-238.5, -213], [t.door, -213], [t.door, -221], [t.door, -225.6]]);
    assert.equal(r.s.floor, `${t.id}-7F`, `没有从南门走进 ${t.id}-7F`);
    assert.ok(at(r.s, [t.door, -225.6]));
    assert.equal(label(r.s), `云澜·北苑 ${t.n} 号楼 · 空中大堂（7F）`);
    // 读卡点 → 无障碍通道口：不刷卡挡住，提示刷这道闸机
    const g = gates.find((q) => q.id === `${t.id}-7F-GATE`), [rx, rz] = toW(g.frame, g.reader.u, g.reader.v);
    r = route(r, [[rx, -228], [rx, rz]]);
    assert.ok(at(r.s, [rx, rz]), `走不到读卡点 (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
    r = walk(r, [rx, t.laneZ]);
    r = tap(blocked(r, g.id, [t.inside, t.laneZ]), g.id);
    r = walk(r, [t.inside, t.laneZ]);
    assert.ok(at(r.s, [t.inside, t.laneZ]), `刷卡后仍过不了闸机 (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
    assert.equal(label(r.s), `北苑 ${t.n} 号楼 · 空中大堂候梯厅（7F）`);
    // 近侧私家梯：候梯厅直通核心筒的候梯带
    const [nearId, nx, nearTo] = t.near, ns = stopOf(nearId, `${t.id}-7F`);
    assert.ok(Math.abs(ns.x - nx) < .01, `${nearId} 7F 停靠点 ${ns.x}`);
    r = route(r, [[nx, -235.2], [ns.x, ns.z]]);
    assert.ok(at(r.s, [ns.x, ns.z]), `候梯厅走不到 ${nearId}`);
    const up = ride(r, nearId, nearTo);
    assert.equal(up.s.floor, nearTo);
    // 远侧私家梯：穿过候梯带两樘 0.9 m 防火门
    const [farId, fx, farTo] = t.far, fs = stopOf(farId, `${t.id}-7F`), mid = t.id === 'T1' ? -260 : -212;
    r = route(r, [[nx, -235.2], [mid, -235.2], [fx, -235.2], [fs.x, fs.z]]);
    assert.ok(at(r.s, [fs.x, fs.z]), `走不到 ${farId} (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
    assert.ok(linksNear(nav, r.s.floor, r.s.x, r.s.z).find((q) => q.link.id === farId).options.length >= 15, `${farId} 不能选层`);
    assert.equal(ride(r, farId, farTo).s.floor, farTo);
    resetGates(nav);
  });
}

test('乘 6F → 天台扶梯 P1-SQ-P7-U 上来，沿天台花园走到 1 号楼南门进空中大堂', () => {
  resetGates(nav);
  const e = L.escalators.find((q) => q.id === 'P1-SQ-P7-U');
  assert.deepEqual([e.from, e.to, e.dir], ['P1-6F', 'P1-RF', 'up']);
  const len = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z), ux = (e.top.x - e.bottom.x) / len, uz = (e.top.z - e.bottom.z) / len;
  let r = { s: S('P1-6F', e.bottom.x - ux * 2, e.bottom.z - uz * 2), now: 0 };
  assert.ok(clear(nav, r.s));
  r = walk(r, [e.top.x + ux * 1.8, e.top.z + uz * 1.8]);
  assert.equal(r.s.floor, 'P1-RF', '扶梯没有上到天台');
  r = route(r, [[-254.8, r.s.z], [-254.8, -221], [-249, -221], [-249, -226]]);
  assert.equal(r.s.floor, 'T1-7F');
  assert.ok(at(r.s, [-249, -226]), `(${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
});

test('穿堂而过（不刷卡）：天台 → 1 号楼南门 → 大堂 → 缝侧门 → 空中大堂前庭 → 2 号楼缝侧门 → 大堂 → 南门 → 天台', () => {
  resetGates(nav);
  let r = { s: S('P1-RF', -249, -221), now: 0, trail: [] };
  assert.ok(clear(nav, r.s));
  const legs = [
    [[-249, -226.2], 'T1-7F', '云澜·北苑 1 号楼 · 空中大堂（7F）'],
    [[-243.5, -226.2], 'T1-7F', '云澜·北苑 1 号楼 · 空中大堂（7F）'],
    [[-240.5, -226.2], 'P1-RF', '云澜·北苑 空中大堂前庭（一期 RF）'],
    [[-229.5, -226.2], 'P1-RF', '云澜·北苑 空中大堂前庭（一期 RF）'],
    [[-226.5, -226.2], 'T2-7F', '云澜·北苑 2 号楼 · 空中大堂（7F）'],
    [[-222, -226.2], 'T2-7F', '云澜·北苑 2 号楼 · 空中大堂（7F）'],
    [[-222, -221], 'P1-RF', '一期 · RF 天台花园'],
  ];
  for (const [p, floor, hud] of legs) {
    r = walk(r, p);
    assert.ok(at(r.s, p) && r.s.floor === floor, `穿堂停在 ${r.s.floor} (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})，应到 ${floor} ${p}`);
    assert.equal(label(r.s), hud);
  }
  // 一路没进任何住户区，没有门禁被打开
  for (const s of r.trail) assert.ok(!zones.some((z) => z.floors.includes(s.floor) && inZone(z, [s.x, s.z])), `穿堂踩进住户区 ${s.floor} (${s.x},${s.z})`);
  assert.ok([...nav.gates.values()].every((g) => !g.open), '穿堂打开了门禁');
});

test('住户出门：候梯厅朝闸机走，出门感应自动开门，出南门回天台；门到时关上，再从大堂进去又被挡住', () => {
  for (const t of TOWERS) {
    resetGates(nav);
    const g = gates.find((q) => q.id === `${t.id}-7F-GATE`), ns = stopOf(t.near[0], `${t.id}-7F`), s = t.id === 'T1' ? 1 : -1;
    let r = { s: S(`${t.id}-7F`, ns.x, ns.z), now: 0 };
    r = route(r, [[t.inside - s * .9, t.laneZ], [t.gateX + s * 1.2, t.laneZ]]);
    assert.ok(at(r.s, [t.gateX + s * 1.2, t.laneZ]), `${t.id} 出门被闸机挡住 (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
    assert.ok(nav.gates.get(g.id).open, `${t.id} 出门感应没开门`);
    r = route(r, [[t.door, -228], [t.door, -222]]);
    assert.equal(r.s.floor, 'P1-RF', `${t.id} 没从南门出到天台`);
    r = walk({ ...r, now: r.now + g.hold + 1 }, [t.door, -222.5]);
    assert.equal(nav.gates.get(g.id).open, false, `${t.id} 门禁没有自动关闭`);
    const [rx, rz] = toW(g.frame, g.reader.u, g.reader.v);
    r = route(r, [[t.door, -228], [rx, -228], [rx, t.laneZ]]);
    blocked(r, g.id, [t.inside, t.laneZ]);
  }
  resetGates(nav);
});

test('够不到：7F 从读卡点出发、闸机关闭时能走到的每一点都在住户区外，且离住户电梯 / 楼梯停靠点 2 m 以上', () => {
  const G = .25;
  const residential = (k) => (k.kind === 'lift' && k.elevator?.residentialCore) || (k.kind === 'stair' && L.stairs.find((s) => s.id === k.id)?.residentialCore);
  for (const t of TOWERS) {
    resetGates(nav);
    const f = `${t.id}-7F`, g = gates.find((q) => q.id === `${t.id}-7F-GATE`), z = zones.find((q) => q.id === f);
    const x0 = t.id === 'T1' ? -266 : -228, x1 = t.id === 'T1' ? -242 : -206, z0 = -240;
    const ni = Math.round((x1 - x0) / G), nj = Math.round(16 / G), P = (i, j) => [x0 + i * G, z0 + j * G];
    const [rx, rz] = toW(g.frame, g.reader.u, g.reader.v), start = [Math.round((rx - x0) / G), Math.round((rz - z0) / G)];
    assert.ok(clear(nav, S(f, ...P(...start))), `${f} 读卡点不可站立`);
    const seen = new Set([start[0] * 1e4 + start[1]]), queue = [start];
    while (queue.length) {
      const [i, j] = queue.pop(), from = S(f, ...P(i, j));
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a > ni || b > nj || seen.has(a * 1e4 + b)) continue;
        const s = step(nav, from, di * G, dj * G, 0);
        if (s.floor !== f || s.slope || !at(s, P(a, b), .02)) continue;
        seen.add(a * 1e4 + b); queue.push([a, b]);
      }
    }
    const stops = nav.links.filter(residential).flatMap((k) => k.stops.filter((s) => s.floor === f).map((s) => ({ ...s, id: k.id })));
    assert.equal(stops.length, 5, `${f} 住户停靠点 ${stops.map((s) => s.id)}`);
    for (const k of seen) {
      const p = P(Math.floor(k / 1e4), k % 1e4);
      assert.ok(!inZone(z, p), `${f} 公共点 (${p}) 在住户区里`);
      for (const st of stops) assert.ok(dist(p, [st.x, st.z]) > GATE.reachClear, `${f} 公共点 (${p}) 够得到 ${st.id}`);
    }
    // 公共一侧：大堂前厅与江景休息区（159–191 m²，扣掉家具与贴墙净距）的 0.25 m 网格
    assert.ok(seen.size > 1500, `${f} 只走到 ${seen.size} 点`);
    assert.ok([...nav.gates.values()].every((q) => !q.open));
  }
});

test('疏散：公共区任一点到两樘外门之一直线 ≤ 20 m、两门中心距 ≥ 5 m；住户一侧（候梯厅、候梯带、会所）到疏散楼梯门 ≤ 25 m', () => {
  for (const t of TOWERS) {
    const lv = lvl(`${t.id}-7F`), sky = lv.skyLobby;
    const doors = sky.doors.map((id) => L.entrances.find((e) => e.id === id).seg).map((q) => [[q.x0, q.z0], [q.x1, q.z1]]);
    const mid = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    assert.ok(dist(mid(doors[0]), mid(doors[1])) >= 5, `${t.id} 两樘门太近`);
    const grid = (r) => { const out = []; for (let x = r.x0 + .5; x <= r.x1 - .5 + 1e-9; x += .5) for (let z = r.z0 + .5; z <= r.z1 - .5 + 1e-9; z += .5) out.push([x, z]); return out; };
    let n = 0;
    for (const p of sky.publicRects.flatMap(grid)) { n++; assert.ok(Math.min(...doors.map(([a, b]) => distToSeg(p, a, b))) <= 20, `${t.id} 公共点 ${p} 离外门太远`); }
    assert.ok(n > 400);
    const stairs = L.stairs.filter((s) => s.residentialCore === t.id).map((s) => stairDoor(s, lv.id)).map((d) => [[d.x0, d.z0], [d.x1, d.z1]]);
    assert.equal(stairs.length, 2);
    const zone = zones.find((q) => q.id === lv.id), residents = [...sky.clubRects.flatMap(grid), ...grid(sky.liftHall)];
    for (const p of residents) assert.ok(Math.min(...stairs.map(([a, b]) => distToSeg(p, a, b))) <= 25, `${t.id} 住户点 ${p} 离疏散楼梯太远`);
    assert.ok(zone.polys.length === 2);
  }
});

test('火警时闸机常开（gates: open）：消防员从天台南门进大堂，不刷卡直达消防电梯前室与疏散楼梯门', () => {
  const open = buildNav(L, { gates: 'open' });
  for (const t of TOWERS) {
    const g = gates.find((q) => q.id === `${t.id}-7F-GATE`), [rx, rz] = toW(g.frame, g.reader.u, g.reader.v);
    const lf = open.links.find((k) => k.id === `${t.id}-LF`).stops.find((q) => q.floor === `${t.id}-7F`);
    let s = S('P1-RF', t.door, -221);
    for (const p of [[t.door, -228], [rx, -228], [rx, t.laneZ], [t.inside, t.laneZ], [t.near[1], -235.2], [lf.x, -235.2], [lf.x, lf.z]]) {
      const n = Math.max(1, Math.ceil(Math.hypot(p[0] - s.x, p[1] - s.z) / .1));
      const dx = (p[0] - s.x) / n, dz = (p[1] - s.z) / n;
      for (let i = 0; i < n; i++) s = step(open, s, dx, dz, .036);
      assert.ok(at(s, p), `${t.id} 常开模式走不到 (${p})：停在 ${s.floor} (${s.x.toFixed(2)},${s.z.toFixed(2)})`);
    }
    assert.equal(s.floor, `${t.id}-7F`);
    assert.ok(linksNear(open, s.floor, s.x, s.z).some((n) => n.link.id === `${t.id}-LF`), `${t.id} 消防电梯不可用`);
  }
});

test('位置提示：大堂 / 江景休息区、候梯厅、住户会所、空中大堂前庭与天台花园各有名字', () => {
  const P = (f, x, z) => label(S(f, x, z));
  assert.equal(P('T1-7F', -247, -238), '云澜·北苑 1 号楼 · 空中大堂（7F）');            // 江景休息区
  assert.equal(P('T1-7F', -249, -228), '云澜·北苑 1 号楼 · 空中大堂（7F）');
  assert.equal(P('T1-7F', -254, -238), '北苑 1 号楼 · 空中大堂候梯厅（7F）');
  assert.equal(P('T1-7F', -260, -235.2), '北苑 1 号楼 · 空中大堂候梯厅（7F）');          // 候梯带
  assert.equal(P('T1-7F', -270, -236), '云澜·北苑 1 号楼 · 住户会所（7F）');
  assert.equal(P('T2-7F', -224, -238), '云澜·北苑 2 号楼 · 空中大堂（7F）');
  assert.equal(P('T2-7F', -218, -238), '北苑 2 号楼 · 空中大堂候梯厅（7F）');
  assert.equal(P('T2-7F', -200, -228), '云澜·北苑 2 号楼 · 住户会所（7F）');
  assert.equal(P('P1-RF', -235, -226), '云澜·北苑 空中大堂前庭（一期 RF）');
  assert.equal(P('P1-RF', -235, -205), '一期 · RF 天台花园');
  assert.equal(P('P1-RF', -249, -221), '一期 · RF 天台花园');
});

test('可见性规则：站在天台或另一座空中大堂时画出 60 m 内的空中大堂；俯瞰选中一期且未聚焦、或选中本塔时画出', () => {
  const rule = skyLobbyVisibility(L), T = ['T1', 'T2'].map((id) => L.buildings.find((b) => b.id === id));
  const ex = (level, x, z, building = L.levels.find((l) => l.id === level).building) => ({ explore: { level, building, position: { x, z } } });
  assert.deepEqual(T.map((b) => rule(b, ex('P1-RF', -235, -215))), ['T1-7F', 'T2-7F']);
  assert.deepEqual(T.map((b) => rule(b, ex('P1-RF', -60, -60))), [null, null]);
  assert.deepEqual(T.map((b) => rule(b, ex('P1-3F', -235, -215))), [null, null], '一期 3F 不与 7F 相通');
  assert.deepEqual(T.map((b) => rule(b, ex('T1-7F', -249, -228))), [null, 'T2-7F'], '在 1 号楼里：本楼由 inside 规则画出');
  assert.deepEqual(T.map((b) => rule(b, ex('T2-7F', -222, -228))), ['T1-7F', null]);
  assert.deepEqual(T.map((b) => rule(b, ex('T1-12F', -249, -228))), [null, null]);
  assert.deepEqual(T.map((b) => rule(b, { building: 'P1', focus: null })), ['T1-7F', 'T2-7F']);
  assert.deepEqual(T.map((b) => rule(b, { building: 'P1', focus: 'P1-3F' })), [null, null]);
  assert.deepEqual(T.map((b) => rule(b, { building: 'T1', focus: null })), ['T1-7F', null]);
  assert.deepEqual(T.map((b) => rule(b, { building: 'T1', focus: 'T1-12F' })), [null, null]);
  assert.deepEqual(T.map((b) => rule(b, { building: 'W1', focus: null })), [null, null]);
  assert.deepEqual(T.map((b) => rule(b, {})), [null, null]);
});

// ---------------------------------------------------------------------------
// 渲染（Node three）

const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
const base = new Proxy({}, { get: (m, k) => typeof k === 'string' ? (m[k] ||= Object.assign(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), { name: k })) : undefined });
function context() {
  return { layout: L, dynamic: [], mats: { base, sign: () => new THREE.MeshBasicMaterial(), onNight: () => {} },
    levels: Object.fromEntries(L.levels.map((lv) => [lv.id, { lv, base: new THREE.Group(), shell: new THREE.Group(), batch: new BatchSet(base) }])),
    lvById: Object.fromEntries(L.levels.map((l) => [l.id, l])),
    buildings: Object.fromEntries(L.buildings.map((b) => [b.id, { b, group: new THREE.Group() }])),
    hospitality: { buildings: new Map() }, site: { group: new THREE.Group() } };
}
const meshesOf = (g) => { const out = []; g.updateMatrixWorld(true); g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible) out.push(o); }); return out; };

test('渲染：7F 会所组 ≤ 7 个网格（含礼宾台），闸机静态件在会所组里、楼层批次为空，门扇 / 指示灯是 7F 的两个实例网格；外壳仍 ≤ 8 个网格', () => {
  const ctx = context();
  const recs = ['T1', 'T2'].map((id) => buildCommunityTower(ctx, L.buildings.find((b) => b.id === id), ctx.hospitality.buildings));
  buildAccessGates(ctx);
  const rc = new THREE.Raycaster();
  for (const [i, t] of TOWERS.entries()) {
    const rec = recs[i], lv = lvl(`${t.id}-7F`), y = lv.elev, club = rec.groundGroup;
    assert.ok(ctx.levels[lv.id].shell.children.includes(club), `${t.id} 会所组不在 7F shell 里`);
    const cm = club.children.filter((o) => o.isMesh);
    assert.ok(cm.length <= 7, `${t.id} 会所组 ${cm.length} 个网格`);
    assert.ok(meshesOf(rec.group).length <= 8, `${t.id} 外壳 ${meshesOf(rec.group).length} 个网格`);
    assert.equal(Object.keys(ctx.levels[lv.id].batch.sets).length, 0, `${t.id}-7F 楼层批次被写入`);
    const inst = ctx.levels[lv.id].base.children.filter((o) => o.isInstancedMesh);
    assert.equal(inst.length, 2);
    // 礼宾台：台面 1.05 m，木饰面朝南门
    const desk = lv.lobbyPlan.obstacles.find((o) => o.id === 'reception-desk'), [dx, dz] = toW(lv.lobbyPlan.frame, (desk.rect.x0 + desk.rect.x1) / 2, (desk.rect.z0 + desk.rect.z1) / 2);
    rc.set(new THREE.Vector3(dx, y + 2, dz), new THREE.Vector3(0, -1, 0)); rc.far = 3;
    const top = rc.intersectObjects(cm, false)[0];
    assert.ok(top && Math.abs(top.point.y - (y + 1.05)) < .02, `${t.id} 礼宾台台面 ${top?.point.y}`);
    // 跑步机画出来了（T2 健身房；原来是看不见的障碍）
    for (const o of lv.lobbyPlan.obstacles.filter((q) => q.type === 'treadmill')) {
      const [x, z] = toW(lv.lobbyPlan.frame, (o.rect.x0 + o.rect.x1) / 2, (o.rect.z0 + o.rect.z1) / 2);
      rc.set(new THREE.Vector3(x, y + 2, z), new THREE.Vector3(0, -1, 0)); rc.far = 1.9;
      assert.ok(rc.intersectObjects(cm, false).length, `${o.id} 看不见`);
    }
  }
});

test('渲染：两樘外门门洞里没有玻璃、门旁是玻璃幕墙；闸机上方 3.25 m 是横梁、4.0 m 是封到吊顶的玻璃亮子', () => {
  const ctx = context();
  const recs = ['T1', 'T2'].map((id) => buildCommunityTower(ctx, L.buildings.find((b) => b.id === id), ctx.hospitality.buildings));
  const rc = new THREE.Raycaster();
  for (const [i, t] of TOWERS.entries()) {
    const lv = lvl(`${t.id}-7F`), y = lv.elev, list = [...meshesOf(recs[i].group), ...meshesOf(recs[i].groundGroup)];
    const glassHits = (o, d) => { rc.set(new THREE.Vector3(o[0], y + 1.5, o[1]), new THREE.Vector3(d[0], 0, d[1])); rc.far = 1.3; return rc.intersectObjects(list, false).filter((h) => /glass/i.test(h.object.material.name)); };
    for (const id of lv.skyLobby.doors) {
      const e = L.entrances.find((q) => q.id === id), m = [(e.seg.x0 + e.seg.x1) / 2, (e.seg.z0 + e.seg.z1) / 2];
      const along = [(e.seg.x1 - e.seg.x0) / e.width, (e.seg.z1 - e.seg.z0) / e.width];
      // From 1 m outside, inward: nothing glass within ±0.3 m of the façade line in the opening.
      const through = glassHits([m[0] + e.nx, m[1] + e.nz], [-e.nx, -e.nz]).filter((h) => Math.abs(h.distance - 1) < .3);
      assert.equal(through.length, 0, `${id} 门洞里有玻璃 (${through.map((h) => h.object.material.name)})`);
      // 0.6 m beside each jamb (the gap door stands 1 m from the tower's south-east / south-west corner).
      for (const sgn of [-1, 1]) {
        const k = .6, p = sgn < 0 ? [e.seg.x0 - along[0] * k, e.seg.z0 - along[1] * k] : [e.seg.x1 + along[0] * k, e.seg.z1 + along[1] * k];
        assert.ok(glassHits([p[0] + e.nx, p[1] + e.nz], [-e.nx, -e.nz]).some((h) => Math.abs(h.distance - 1) < .3), `${id} 门旁不是玻璃`);
      }
    }
    const g = gates.find((q) => q.id === `${t.id}-7F-GATE`), club = meshesOf(recs[i].groundGroup);
    for (const l of g.lanes) {
      const c = (l.u0 + l.u1) / 2, [ax, az] = toW(g.frame, c, -1), [bx, bz] = toW(g.frame, c, 1);
      const hit = (h) => { rc.set(new THREE.Vector3(ax, y + h, az), new THREE.Vector3(bx - ax, 0, bz - az).normalize()); rc.far = 2; return rc.intersectObjects(club, false)[0]; };
      const header = hit(3.25), transom = hit(4.0);
      assert.ok(header && /metal/.test(header.object.material.name) && Math.abs(header.distance - 1) < .1, `${g.id} 通道 ${c} 上方没有横梁`);
      assert.ok(transom && /glass/.test(transom.object.material.name) && Math.abs(transom.distance - 1) < .05, `${g.id} 通道 ${c} 上方 4.0 m 没封到吊顶`);
    }
  }
});

// ---------------------------------------------------------------------------
// Review fixes (RL-1 … RL-9): wayfinding on the roof, the directory spawn, the backdrop wall to the ceiling,
// the canopy tie rods, the solid viewdeck furniture.

test('目录 / 楼层栏进 7F：落在空中大堂南门内 1.6 m（公共区、不在任何门禁区），面朝礼宾台与闸机', () => {
  for (const t of TOWERS) {
    const lv = lvl(`${t.id}-7F`), s = spawn(nav, L, { building: t.id, level: lv.id });
    assert.ok(s && s.floor === lv.id && clear(nav, s), `${lv.id} 出生点站不住`);
    assert.ok(Math.abs(s.x - t.door) < .01 && Math.abs(s.yaw) < 1e-9, `${lv.id} 出生点 (${s.x}, ${s.z}) yaw ${s.yaw}`);
    assert.ok(lv.skyLobby.publicRects.some((r) => s.x > r.x0 && s.x < r.x1 && s.z > r.z0 && s.z < r.z1), `${lv.id} 出生点不在公共区`);
    assert.ok(!zones.some((z) => z.floors.includes(lv.id) && inZone(z, [s.x, s.z])), `${lv.id} 出生点在门禁区里`);
    assert.match(label(s), /空中大堂（7F）$/);
  }
});

test('一期天台导视：方庭观光梯、方庭扶梯顶、SQ-E 电梯与五组主电梯出口都有指向空中大堂的双面牌，立杆是导航障碍物且不挡出口', () => {
  const rf = lvl('P1-RF'), signs = rf.skySigns || [];
  assert.deepEqual(signs.map((s) => s.id).sort(), ['C-GE', 'C-GW', 'N', 'NW', 'SE', 'SQ-E', 'SQ-GE', 'SQ-GW', 'SQ-P7', 'SQ-canopy-N', 'W'].sort());
  const doors = TOWERS.map((t) => [t.door, lvl(`${t.id}-7F`).spawn.z + 1.6]);
  for (const s of signs) {
    assert.equal(s.faces.length, 2, `${s.id} 不是双面牌`);
    if (!s.post) continue;
    assert.ok(!clear(nav, S('P1-RF', s.x, s.z)), `${s.id} 立杆不是障碍物`);
    // Walkable all round at 0.75 m on at least three sides (not jammed into a corner), and each face's arrow points
    // within 90° of the nearer S door as its viewer (standing in front of that face) sees it.
    const ring = Array.from({ length: 12 }, (_, i) => S('P1-RF', s.x + Math.cos(i * Math.PI / 6) * .75, s.z + Math.sin(i * Math.PI / 6) * .75)).filter((q) => clear(nav, q));
    assert.ok(ring.length >= 7, `${s.id} 立杆周围只有 ${ring.length}/12 处可站`);
    const [tx, tz] = doors.reduce((m, p) => Math.hypot(p[0] - s.x, p[1] - s.z) < Math.hypot(m[0] - s.x, m[1] - s.z) ? p : m);
    for (const f of s.faces) {
      const nx = s.nx * f.side, nz = s.nz * f.side, fx = -nx, fz = -nz, dir = { 'res-sky-u': [fx, fz], 'res-sky-r': [-fz, fx], 'res-sky-l': [fz, -fx] }[f.cell];
      assert.ok(dir && dir[0] * (tx - s.x) + dir[1] * (tz - s.z) > 0, `${s.id} 面 ${f.side} 的箭头 ${f.cell} 指错方向`);
    }
  }
  // The lift exits stay clear: 1.5 m straight out of each served lift door is standable.
  for (const id of ['P1-SQ-GW', 'P1-SQ-GE', 'P1-SQ-E-L2', 'P1-SE-L1', 'P1-C-GW']) {
    const e = L.elevators.find((q) => q.id === id), d = e.reach + 1.5;
    assert.ok(clear(nav, S('P1-RF', e.x + e.nx * d, e.z + e.nz * d)), `${id} 出梯口被挡`);
  }
  // The canopy pair hangs on the 方庭 canopy's north column, both towers named.
  const pair = signs.find((s) => s.id === 'SQ-canopy-N');
  assert.ok(!pair.post && rf.navObstacles.some((o) => o.id.startsWith('P1-SQ-CANOPY-column') && pointInPoly([pair.x, pair.z], o.poly)));
});

test('平齐观景台的长椅与两台望远镜是导航障碍物；两座空中大堂缝侧门之间仍走得通', () => {
  const deck = lvl('P1-RF').features.find((f) => f.type === 'viewdeck' && f.flush), r = deck.rect, cx = (r.x0 + r.x1) / 2;
  for (const [x, z, what] of [[cx, r.z0 + 4.5, '长椅'], [cx - 2.2, r.z0 + .6, '西望远镜'], [cx + 2.2, r.z0 + .6, '东望远镜']]) assert.ok(!clear(nav, S('P1-RF', x, z)), `${what} 可以穿过`);
  // Gap door to gap door across the forecourt at the doors' mid height.
  const d = L.entrances.filter((e) => e.skyLobby === 'GAP'), z = (d[0].seg.z0 + d[0].seg.z1) / 2;
  const r0 = walk({ s: S('P1-RF', d[0].seg.x0 + 1.0 * Math.sign(d[1].seg.x0 - d[0].seg.x0), z), now: 0 }, [d[1].seg.x0 - 1.0 * Math.sign(d[1].seg.x0 - d[0].seg.x0), z]);
  assert.ok(Math.abs(r0.s.x - (d[1].seg.x0 - 1.0 * Math.sign(d[1].seg.x0 - d[0].seg.x0))) < .05, `缝侧门之间走不通（停在 ${r0.s.x.toFixed(2)}）`);
});

test('渲染：接待背墙封到 7F 吊顶（4.0 m 处射线打到墙），闸机两侧玻璃有竖梃；南门雨棚拉杆斜拉到立面、不悬空', () => {
  const ctx = context();
  for (const t of TOWERS) {
    const b = L.buildings.find((q) => q.id === t.id), rec = buildCommunityTower(ctx, b, ctx.hospitality.buildings), lv = lvl(`${t.id}-7F`), y = lv.elev;
    const plan = lv.lobbyPlan, wall = plan.partitions.find((p) => p.skyLobby && !p.role), F = plan.frame;
    const [ax, az] = toW(F, ...wall.a), [bx, bz] = toW(F, ...wall.b), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const rc = new THREE.Raycaster(new THREE.Vector3(mx, y + 4.0, mz + 1), new THREE.Vector3(0, 0, -1), 0, 2);
    const hit = rc.intersectObjects(meshesOf(rec.groundGroup), false)[0];
    assert.ok(hit && Math.abs(hit.distance - 1) < .1 && !/glass/.test(hit.object.material.name), `${t.id} 接待背墙上方 4.0 m 是空的`);
    // Mullions: a metal hit on the gate line, beside the gate bank, at 2 m.
    const g = gates.find((q) => q.id === `${t.id}-7F-GATE`), [gx, gz] = toW(g.frame, -.01, -1), [hx, hz] = toW(g.frame, -.01, 1);
    const m = new THREE.Raycaster(new THREE.Vector3(gx, y + 2, gz), new THREE.Vector3(hx - gx, 0, hz - gz).normalize(), 0, 2).intersectObjects(meshesOf(rec.groundGroup), false)[0];
    assert.ok(m && /metal/.test(m.object.material.name) && Math.abs(m.distance - 1) < .1, `${t.id} 闸机边没有竖梃`);
    // Tie rods: nothing metal stands in mid-air 1.2 m out from the S door canopy, 1 m above it.
    const e = L.entrances.find((q) => q.id === `${t.id}-SKY-S`), cx = (e.seg.x0 + e.seg.x1) / 2, cz = e.seg.z0 + 1.2;
    const up = new THREE.Raycaster(new THREE.Vector3(cx - 3, y + 5.3, cz), new THREE.Vector3(1, 0, 0), 0, 6).intersectObjects(meshesOf(rec.group), false)
      .filter((h) => /metal/i.test(h.object.material.name) && h.point.y > y + 5);
    assert.equal(up.length, 0, `${t.id} 南门雨棚上方 1.2 m 处仍有竖直拉杆`);
  }
});
