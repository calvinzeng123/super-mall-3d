// 住户刷卡门禁（全园区）：“所见即所挡”——门扇关闭时是实体墙，刷卡开 4 秒，出门感应自动开，
// 人在通道里不关门；公共一侧任何站得住的点都够不到住户电梯和楼梯；穿越层封闭；
// 商场疏散距离不变；紧凑 FPS 布局没有门禁。对 layout.accessControl 的全部门禁执行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, insetPts, midOf, stairDoor } from './helpers.js';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, step, clear, linksNear, tapGate, updateGates, gateBlocking, resetGates, floorLabel, spawn, GATE, NAV } from '../src/layout/nav.js';
import { toW, toL, pointInPoly, dist } from '../src/layout/geom.js';
import { gateRecordErrors } from '../src/layout/access-records.js';
import { NORTH_SITE } from '../src/layout/community-sites.js';

const nav = buildNav(L), gates = L.accessControl.gates, zones = L.accessControl.zones;
const floorY = (f) => (f === 'ground' ? 0 : nav.floors.get(f).y);
const S = (floor, x, z) => ({ floor, x, z, y: floorY(floor), slope: null });
const zoneOf = (g) => zones.find((z) => z.id === g.zone);
const inZone = (z, p) => z.polys.some((q) => pointInPoly(p, q));
const residential = (k) => (k.kind === 'lift' && k.elevator?.residentialCore) || (k.kind === 'stair' && L.stairs.find((s) => s.id === k.id)?.residentialCore);
const residentialStops = (floor) => nav.links.filter(residential).flatMap((k) => k.stops.filter((s) => s.floor === floor).map((s) => ({ ...s, id: k.id })));
/** 10 cm steps; with gates the clock advances 36 ms a step and the gate states update. */
function walk(s, to, { gates: g = false, t0 = 0, n: navi = nav } = {}) {
  const n = Math.max(1, Math.ceil(Math.hypot(to[0] - s.x, to[1] - s.z) / .1)), dx = (to[0] - s.x) / n, dz = (to[1] - s.z) / n;
  let now = t0;
  for (let i = 0; i < n; i++) { s = step(navi, s, dx, dz, .036); now += .036; if (g) updateGates(navi, s, now); }
  return { s, now };
}
const at = (s, p, e = .05) => Math.hypot(s.x - p[0], s.z - p[1]) < e;
const laneOf = (g) => g.lanes.at(-1), cu = (g) => (laneOf(g).u0 + laneOf(g).u1) / 2;

test('门禁记录：门线、通道、机柜与读卡器几何正确，住户区在 v > 0 一侧，读卡点可站立', () => {
  assert.ok(gates.length >= 8);
  assert.equal(new Set(gates.map((g) => g.id)).size, gates.length);
  for (const g of gates) {
    assert.deepEqual(gateRecordErrors(g), [], g.id);
    for (const f of g.floors) assert.ok(nav.floors.has(f), `${g.id} ${f}`);
    const z = zoneOf(g);
    assert.ok(z && z.floors.includes(g.floors[0]), `${g.id} 住户区`);
    for (const l of g.lanes) {
      const c = (l.u0 + l.u1) / 2;
      assert.ok(inZone(z, toW(g.frame, c, 1)), `${g.id} 通道内侧不在住户区`);
      assert.ok(!inZone(z, toW(g.frame, c, -1)), `${g.id} 通道外侧落在住户区`);
    }
    assert.ok(!inZone(z, toW(g.frame, g.reader.u, g.reader.v)), `${g.id} 读卡器在住户区里`);
    assert.equal(g.hold, GATE.hold);
  }
  for (const k of nav.links.filter((q) => q.kind === 'gate')) for (const st of k.stops) assert.ok(clear(nav, S(st.floor, st.x, st.z)), `${k.id} 读卡点不可站立`);
});

test('住户电梯在一期只停 B2 / B1 / 1F，一期电梯不停塔楼楼层', () => {
  const p1 = new Set(L.levels.filter((l) => l.building === 'P1').map((l) => l.id));
  const lifts = L.elevators.filter((e) => e.residentialCore && L.buildings.find((b) => b.id === e.residentialCore)?.stackedOn === 'P1');
  assert.equal(lifts.length, 6);
  for (const e of lifts) assert.deepEqual(e.serves.filter((id) => p1.has(id)), [...NORTH_SITE.hostDoorLevels], e.id);
  const towerLevels = new Set(L.levels.filter((l) => L.buildings.find((b) => b.id === l.building)?.stackedOn).map((l) => l.id));
  for (const e of L.elevators.filter((q) => q.building === 'P1')) assert.ok(!e.serves.some((id) => towerLevels.has(id)), e.id);
  for (const s of L.stairs.filter((q) => q.building === 'P1')) assert.ok(!s.serves.some((id) => towerLevels.has(id)), s.id);
});

test('每道门禁：关闭时挡在门线前并提示刷卡，刷卡后走进住户区，超时关门，出门感应放行，人在通道里不关门', () => {
  for (const g of gates) {
    resetGates(nav);
    const f = g.floors[0], st = nav.gates.get(g.id), P = (u, v) => toW(g.frame, u, v);
    const reader = P(g.reader.u, g.reader.v), front = P(cu(g), -1.2), inside = P(cu(g), 2.5);
    let r = walk(S(f, ...reader), front);
    assert.ok(at(r.s, front), `${g.id} 走不到通道口`);
    r = walk(r.s, inside);
    const [, v] = toL(g.frame, r.s.x, r.s.z);
    assert.ok(v < 0 && v > -.5, `${g.id} 关闭的门扇没挡住 (v=${v.toFixed(2)})`);
    assert.equal(gateBlocking(nav, r.s)?.id, g.id, `${g.id} 未提示刷卡`);
    assert.ok(linksNear(nav, f, ...reader).some((n) => n.link.id === g.id && n.options[0].action === 'tap'), `${g.id} 读卡器不可互动`);
    assert.ok(tapGate(nav, g.id, r.now));
    r = walk(r.s, inside, { gates: true, t0: r.now });
    assert.ok(at(r.s, inside), `${g.id} 刷卡后仍进不去`);
    updateGates(nav, r.s, r.now + g.hold + 1);
    assert.equal(st.open, false, `${g.id} 到时未关门`);
    const back = walk(r.s, front, { gates: true, t0: r.now + g.hold + 1 });
    assert.ok(at(back.s, front), `${g.id} 出门感应没有放行`);
    // 防夹：人站在通道正中时到时也不关
    tapGate(nav, g.id, 100);
    updateGates(nav, S(f, ...P(cu(g), 0)), 200);
    assert.equal(st.open, true, `${g.id} 夹人`);
    updateGates(nav, S(f, ...front), 210);
    assert.equal(st.open, false);
  }
  resetGates(nav);
});

test('够不到：门禁公共一侧 0.25 m 网格上站得住的点距住户电梯 / 楼梯停靠点都超过 2 m', () => {
  let probes = 0;
  for (const g of gates) for (const f of g.floors) {
    const z = zoneOf(g), stops = residentialStops(f);
    for (let u = -3; u <= g.line.u1 + 3 + 1e-9; u += .25) for (let v = -4; v <= 1e-9; v += .25) {
      const p = toW(g.frame, u, v);
      if (inZone(z, p) || !clear(nav, S(f, ...p))) continue;
      probes++;
      for (const st of stops) assert.ok(dist(p, [st.x, st.z]) > GATE.reachClear, `${g.id} ${f} (${p[0].toFixed(2)},${p[1].toFixed(2)}) 够得到 ${st.id}`);
    }
  }
  assert.ok(probes > 2000, `只探了 ${probes} 个点`);
});

test('够不到：从公共一侧（读卡点）出发、门禁关闭时能走到的每一点都离住户停靠点 2 m 以上', () => {
  const G = .25;
  for (const t of NORTH_SITE.towers) for (const f of NORTH_SITE.hostDoorLevels) {
    const x0 = t.core[0] - 14, z0 = -243, ni = Math.round((t.core[1] + 14 - x0) / G), nj = Math.round(29 / G);
    const P = (i, j) => [x0 + i * G, z0 + j * G], seen = new Set(), queue = [];
    for (const g of gates.filter((q) => q.floors.includes(f))) {
      const [rx, rz] = toW(g.frame, g.reader.u, g.reader.v), i = Math.round((rx - x0) / G), j = Math.round((rz - z0) / G);
      if (i >= 0 && j >= 0 && i <= ni && j <= nj && clear(nav, S(f, ...P(i, j)))) { seen.add(i * 1e4 + j); queue.push([i, j]); }
    }
    assert.ok(queue.length, `${t.id} ${f} 没有读卡点`);
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
    const stops = residentialStops(f);
    for (const k of seen) {
      const p = P(Math.floor(k / 1e4), k % 1e4);
      for (const st of stops) assert.ok(dist(p, [st.x, st.z]) > GATE.reachClear, `${f} 公共点 (${p[0]},${p[1]}) 够得到 ${st.id}`);
    }
    assert.ok(seen.size > 3000);
  }
});

test('穿越层封闭：B1M、2F–6F 从方庭北环廊朝核心筒走，停在核心筒外；住户楼梯只在开门层可互动', () => {
  for (const f of NORTH_SITE.hostPassLevels) for (const t of NORTH_SITE.towers) {
    // 3F–6F：方庭北侧扶梯（移到江景台通道口以东）挡在 T2 核心筒正前方，起点取扶梯与核心筒之间的走道。
    const x = (t.core[0] + t.core[1]) / 2, s = [-221, -223.5].map((z) => S(f, x, z)).find((q) => clear(nav, q));
    assert.ok(s, `${f} 环廊起点`);
    const r = walk(s, [x, -232]);
    assert.ok(r.s.z >= -224.4, `${f} 走进了 ${t.id} 核心筒 (z=${r.s.z.toFixed(2)})`);
  }
  for (const k of nav.links.filter((q) => q.kind === 'stair' && residential(q)))
    assert.ok(k.stops.every((st) => !NORTH_SITE.hostPassLevels.includes(st.floor)), k.id);
});

test('住户路线：北外环街门 → 门斗刷卡 → 大堂 → 私家梯；商场环廊刷卡 → 候梯厅；位置名称与电梯名称', () => {
  for (const b of L.buildings.filter((q) => q.community === 'north')) {
    resetGates(nav);
    const door = L.entrances.find((e) => e.id === `${b.id}-STREET`), x = (door.seg.x0 + door.seg.x1) / 2;
    let r = walk(S('ground', x, -244), [x, -238.6]);
    assert.equal(r.s.floor, 'P1-1F', `${b.id} 街门`);
    r = walk(r.s, [x, -236]);
    assert.ok(r.s.z < -237.6, `${b.id} 门斗玻璃门没挡住`);
    tapGate(nav, `${b.id}-STREET-GATE`, r.now);
    r = walk(r.s, [x, -235.2], { gates: true, t0: r.now });
    const lw = nav.links.find((k) => k.id === `${b.id}-LW`), stop = lw.stops.find((s) => s.floor === 'P1-1F');
    r = walk(r.s, [r.s.x, stop.z], { gates: true, t0: r.now });
    r = walk(r.s, [stop.x, stop.z], { gates: true, t0: r.now });
    assert.ok(at(r.s, [stop.x, stop.z]), `${b.id} 大堂走不到私家梯 (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
    const lift = linksNear(nav, 'P1-1F', r.s.x, r.s.z).find((n) => n.link.id === `${b.id}-LW`);
    assert.ok(lift?.options.some((o) => o.floor === `${b.id}-16F`), `${b.id} 私家梯不能去 16F`);
    assert.equal(lift.link.name, '北苑住户电梯 W');
    assert.equal(floorLabel(nav, L, r.s), `北苑 ${b.id.slice(1)} 号楼 · 住户大堂（一期 1F）`);
    // 商场一侧：环廊读卡器 → 闸机 → 大堂 → 消防梯候梯
    resetGates(nav);
    const g = gates.find((q) => q.id === `${b.id}-1F-GATE`), P = (u, v) => toW(g.frame, u, v);
    let m = walk(S('P1-1F', ...P(g.reader.u, g.reader.v)), P(cu(g), -1.2));
    tapGate(nav, g.id, m.now);
    m = walk(m.s, P(cu(g), 2.5), { gates: true, t0: m.now });
    const lf = nav.links.find((k) => k.id === `${b.id}-LF`).stops.find((q) => q.floor === 'P1-1F');
    const aisle = NORTH_SITE.towers.find((t) => t.id === b.id).core[0] - 2.2;   // clear of the concierge desk
    for (const p of [[aisle, m.s.z], [aisle, -235], [lf.x - 1.5, -235], [lf.x, lf.z]]) m = walk(m.s, p, { gates: true, t0: m.now });
    assert.ok(at(m.s, [lf.x, lf.z]), `${b.id} 商场通道走不到候梯厅 (${m.s.x.toFixed(2)},${m.s.z.toFixed(2)})`);
    const sp = spawn(nav, L, { building: b.id });
    assert.equal(sp.floor, 'P1-1F'); assert.ok(clear(nav, sp));
    assert.ok(zones.find((z) => z.id === `${b.id}-1F`).polys.some((p) => pointInPoly([sp.x, sp.z], p)), `${b.id} 出生点不在住户大堂`);
  }
  resetGates(nav);
});

test('常开模式：buildNav(L, { gates: "open" }) 所有门禁常开，无需刷卡', () => {
  const open = buildNav(L, { gates: 'open' });
  for (const g of gates) {
    const f = g.floors[0], P = (u, v) => toW(g.frame, u, v), front = P(cu(g), -1.2), inside = P(cu(g), 2.5);
    const r = walk(S(f, ...front), inside, { gates: true, n: open });
    assert.ok(at(r.s, inside), `${g.id} 常开模式仍挡人`);
    updateGates(open, r.s, 1e6);
    assert.ok(open.gates.get(g.id).open);
  }
});

test('一期疏散距离不变：住户楼梯不计入商场楼层，各层最远点到楼梯或出口不超过基线', () => {
  // 6F 37.7 → 37.8：样板中庭把 6F 洞口开大，可走面积只减不增；最远点是在走道多边形上取样算的，取样点随形状挪了几厘米
  // 2F 37.2 → 37.4：云澜大中庭第一轮把方庭西侧铺位改成公共的观瀑平台，最远的公共点比原来远 11 cm
  // 3F 37.7 → 38.0：超级商业中心的退台扶梯和环形店铺改了 A 区走道，最远的公共点远了 23 cm（仍有安全楼梯在 40 m 内）
  // 6F 37.8 → 38.4：东南翼、西翼长廊开到 6F 半宽 11 米，两侧铺位门脸往后退，走廊绕洞口走得更远
  const baseline = { 'P1-1F': 37.5, 'P1-2F': 37.4, 'P1-3F': 38.0, 'P1-4F': 37.7, 'P1-5F': 37.7, 'P1-6F': 38.4, 'P1-B1M': 36.0, 'P1-B2': 59.3, 'P1-B1': 57.9 };
  for (const [id, limit] of Object.entries(baseline)) {
    const lv = lvl(id);
    const st = L.stairs.filter((s) => s.serves.includes(id) && !(s.residentialCore && s.building !== lv.building));
    assert.ok(!st.some((s) => s.residentialCore), id);
    const exits = [...st.map((s) => midOf(stairDoor(s, id))), ...L.entrances.filter((e) => e.level === id).map((e) => midOf(e.seg))];
    let worst = 0;
    for (const w of lv.walk) if (!w.outdoor) for (const p of insetPts(w.poly, 1)) worst = Math.max(worst, Math.min(...exits.map((q) => dist(p, q))));
    assert.ok(worst <= limit + .06, `${id} 最远 ${worst.toFixed(2)} m`);
  }
});

test('紧凑 FPS 布局没有门禁、没有北苑', () => {
  const fps = buildLayout({ expansion: false });
  assert.equal(fps.accessControl, undefined);
  assert.ok(!fps.buildings.some((b) => b.community));
  assert.equal(buildNav(fps).gates.size, 0);
  assert.equal(NAV.reach + .4, GATE.reachClear);
});
