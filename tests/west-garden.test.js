// 云澜·西苑（西停车场北排，云澜物业）：两栋 3梯5户 板楼的场地、消防登高、核心筒、户型、
// 地下门户与门禁记录，以及从大门、车库走到每户门口的实际步行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl } from './helpers.js';
import { rectPoly, toW, polyBounds, convexOverlap, pointInPoly, polysConnect, distToSeg } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { buildWalkGraph, components } from '../src/layout/walk.js';
import { communityContractErrors } from '../src/layout/community-contract.js';
import { planSignature } from '../src/layout/community-plan.js';
import { gateRecordErrors, GATE } from '../src/layout/access-records.js';
import { WEST_GARDEN } from '../src/layout/community.js';
import { WEST_GATE_AXIS } from '../src/layout/west-parking.js';

const W = ['W1', 'W2'].map((id) => L.buildings.find((b) => b.id === id));
const P = L.site.westParking, plot = WEST_GARDEN.plot, plotPoly = rectPoly(plot);
const nav = buildNav(L, { gates: 'open' });
const levelsOf = (id) => L.levels.filter((l) => l.building === id);
const at = (floor, x, z) => ({ floor, x, z, y: nav.floors.get(floor).y, slope: null });
function walk(s, [x, z], floor) {
  const n = Math.max(1, Math.ceil(Math.hypot(x - s.x, z - s.z) / .08));
  const dx = (x - s.x) / n, dz = (z - s.z) / n;
  for (let i = 0; i < n; i++) s = step(nav, s, dx, dz, 0);
  assert.ok(Math.hypot(s.x - x, s.z - z) < .04, `停在 ${s.floor} ${s.x.toFixed(2)},${s.z.toFixed(2)}，目标 ${x.toFixed(2)},${z.toFixed(2)}`);
  if (floor) assert.equal(s.floor, floor);
  return s;
}
const route = (s, points) => points.reduce((q, p) => walk(q, p.slice(0, 2), p[2]), s);
const linkStop = (id, floor) => nav.links.find((l) => l.id === id).stops.find((s) => s.floor === floor);

test('云澜·西苑两栋塔楼满足社区契约，品牌为云澜物业', () => {
  for (const b of W) {
    assert.deepEqual(communityContractErrors(L, b), [], b.id);
    assert.equal(b.usage, 'community'); assert.equal(b.community, 'west'); assert.equal(b.operator, '云澜物业');
    assert.match(b.name, /^云澜·西苑 [12] 号楼$/);
  }
  assert.deepEqual(L.categories.community, { label: '云澜社区住宅', color: '#6f8a7a' });
});

test('塔楼与社区地块位置准确，避开道路、车位、小厅、坡口与洞口，西门步道不受影响', () => {
  assert.deepEqual(polyBounds(W[0].outline), { x0: -480, z0: -246, x1: -436.6, z1: -226.8 });
  assert.deepEqual(polyBounds(W[1].outline), { x0: -414, z0: -246, x1: -370.6, z1: -226.8 });
  assert.equal(Math.round((polyBounds(W[1].outline).x0 - polyBounds(W[0].outline).x1) * 10) / 10, 22.6, '两楼间距 22.6 m');
  assert.ok(L.site.plots.some((p) => p.id === 'west-garden'));
  const garageKiosks = L.levels.flatMap((l) => l.garageKiosks || []);
  for (const b of W) {
    assert.ok(b.outline.every((p) => pointInPoly(p, plotPoly) || p[0] >= plot.x0 && p[0] <= plot.x1 && p[1] >= plot.z0 && p[1] <= plot.z1));
    for (const r of [...L.extensions.roads, ...L.site.roads.map((r) => ({ id: r.id, polys: [r.poly] }))])
      for (const q of r.polys) assert.ok(!convexOverlap(b.outline, q), `${b.id} 压道路 ${r.id}`);
    for (const lot of L.extensions.surfaceParking) assert.ok(!convexOverlap(b.outline, lot.poly), `${b.id} 压地面停车 ${lot.id}`);
    for (const k of garageKiosks) assert.ok(!convexOverlap(b.outline, k.poly), `${b.id} 压车库小厅 ${k.id}`);
    for (const q of [...L.site.trenches, ...L.site.openings]) assert.ok(!convexOverlap(b.outline, q), `${b.id} 压坡口或洞口`);
  }
  // 北排车位、通道与车库小厅全部让出社区地块
  for (const lot of P.lots) for (const s of lot.stalls) assert.ok(!convexOverlap(s.poly, plotPoly), `${lot.id} 车位留在社区内`);
  for (const k of garageKiosks) assert.ok(!convexOverlap(k.poly, plotPoly), `${k.id} 公共小厅在住户社区内`);
  assert.ok(!L.stairs.some((s) => s.id === 'WPG-SHARED-ST1'));
  assert.deepEqual([L.elevators.find((e) => e.id === 'WPG-SHARED-L1')].map((e) => [e.x, e.z])[0], [-359, -241]);
  const st2 = L.stairs.find((s) => s.id === 'WPG-SHARED-ST2'), b2 = polyBounds(st2.poly);
  assert.deepEqual([(b2.x0 + b2.x1) / 2, (b2.z0 + b2.z1) / 2], [-359, -226]);
  assert.ok(!P.gates.some((g) => g.id === 'WP-G5'));
  for (const id of ['WP-A1', 'WP-A2', 'WP-B1', 'WP-B2']) assert.ok(!P.lots.some((l) => l.id === id));
  const gate = L.extensions.paths.find((p) => p.id === 'west-gate-promenade');
  assert.ok(!convexOverlap(gate.polys[0], plotPoly), '西门步道越入社区');
  assert.ok(Math.abs((polyBounds(gate.polys[0]).z0 + polyBounds(gate.polys[0]).z1) / 2 - WEST_GATE_AXIS) < 1e-9);
  // 南侧围墙外的 4 m 西苑南侧步道承接原去往一期的步行路线
  const approach = P.walks.find((w) => w.id === 'west-mall-approach'), first = polyBounds(approach.polys[0]);
  assert.deepEqual([first.z0, first.z1], [plot.z1, plot.z1 + 4]);
  assert.ok(first.x0 <= plot.x0 + .01 && first.x1 >= -303);
});

test('消防登高场地：10 m 宽、距南立面 5 m、贯通 43.4 m 长边，北门 G4 经车道可达', () => {
  const fire = L.extensions.roads.find((r) => r.id === 'west-garden-fire-road');
  const lane = L.extensions.roads.find((r) => r.id === 'west-garden-g4-lane');
  const gateRoad = L.extensions.roads.find((r) => r.id === 'west-gate-WP-G4');
  assert.ok(fire && lane && gateRoad);
  assert.equal(fire.kind, 'fire');
  for (const b of W) {
    const hs = b.hardstand, fp = polyBounds(b.outline);
    assert.equal(Math.round((hs.z1 - hs.z0) * 100) / 100, 10);
    assert.equal(Math.round((hs.z0 - fp.z1) * 100) / 100, 5);
    assert.equal(Math.round((hs.x1 - hs.x0) * 100) / 100, 43.4);
    assert.deepEqual(b.fireFrontage, [fp.x0, fp.x1]);
    assert.ok(fire.polys.some((q) => polyBounds(q).x0 <= hs.x0 && polyBounds(q).x1 >= hs.x1 && polyBounds(q).z0 <= hs.z0 && polyBounds(q).z1 >= hs.z1), `${b.id} 登高场地不在消防车道上`);
    for (const lot of L.extensions.surfaceParking) assert.ok(!convexOverlap(rectPoly(hs), lot.poly));
    for (const q of [...L.site.trenches, ...L.site.openings]) assert.ok(!convexOverlap(rectPoly(hs), q));
  }
  assert.ok(polysConnect(gateRoad.polys[0], lane.polys[0], 6) && polysConnect(lane.polys[0], fire.polys[0], 6), 'G4 → 车道 → 消防车道不连续');
  // 消防车从北环（G4 外的城市道路）开到两块登高场地
  for (const b of W) {
    const hs = b.hardstand, cz = (hs.z0 + hs.z1) / 2;
    route(at('ground', -422, -258), [[-422, cz, 'ground'], [(hs.x0 + hs.x1) / 2, cz, 'ground']]);
  }
});

test('3梯5户：每层三部电梯（含消防电梯）与两部防烟楼梯，每层至少两部客梯', () => {
  for (const b of W) {
    const lifts = L.elevators.filter((e) => e.building === b.id), stairs = L.stairs.filter((s) => s.building === b.id);
    assert.equal(lifts.length, 3); assert.equal(stairs.length, 2);
    assert.deepEqual(lifts.map((e) => e.role), ['passenger', 'passenger', 'fire']);
    assert.ok(lifts.find((e) => e.role === 'fire').stretcher);
    assert.equal(b.levels.length, 31);
    for (const id of b.levels) {
      assert.equal(lifts.filter((e) => e.serves.includes(id)).length, 3, id);
      assert.equal(stairs.filter((s) => s.serves.includes(id)).length, 2, id);
      assert.ok(lifts.filter((e) => e.serves.includes(id) && e.role === 'passenger').length >= 2, id);
    }
    assert.deepEqual(levelsOf(b.id).map((l) => l.short), ['B2', 'B1', ...Array.from({ length: 28 }, (_, i) => `${i + 1}F`), 'RF']);
    assert.equal(lvl(`${b.id}-RF`).elev, 85.5); assert.equal(lvl(`${b.id}-2F`).elev, 4.5); assert.equal(lvl(`${b.id}-28F`).elev, 82.5);
  }
});

test('每栋 27 层 × 5 户，每层五户户型各不相同，面积 90–160㎡，两楼共 10 种户型', () => {
  const all = new Set();
  for (const b of W) {
    const floors = levelsOf(b.id).filter((l) => l.kind === 'community');
    assert.equal(floors.length, 27);
    const homes = floors.flatMap((l) => l.units);
    assert.equal(homes.length, 135);
    for (const lv of floors) {
      assert.equal(lv.units.length, 5);
      assert.equal(new Set(lv.units.map((u) => planSignature(u.residence))).size, 5, `${lv.id} 户型重复`);
      for (const u of lv.units) {
        assert.equal(u.residence.kind, 'community'); assert.equal(u.residence.level, 'flat');
        assert.ok(u.area >= 90 && u.area <= 160, `${u.code} 面积 ${u.area}`);
        assert.match(u.brand.name, new RegExp(`^云澜·西苑 ${b.id.slice(1)} 号楼 \\d{4}$`));
        assert.match(u.brand.catLabel, /^[两三四]房一厅 · \d+㎡$/);
        assert.ok(u.residence.beds.length === u.residence.bedrooms);
        const fp = polyBounds(b.outline);
        for (const [x, z] of u.polys[0]) assert.ok(x >= fp.x0 - 1e-6 && x <= fp.x1 + 1e-6 && z >= fp.z0 - 1e-6 && z <= fp.z1 + 1e-6, `${u.code} 越出塔楼`);
      }
      for (const u of lv.units) all.add(planSignature(u.residence));
    }
    const types = homes.slice(0, 5).map((u) => u.residence.type).sort();
    assert.deepEqual(types, ['2br', '2br', '3br', '3br', '4br']);
  }
  assert.equal(all.size, 10);
  assert.equal(W.flatMap((b) => levelsOf(b.id)).flatMap((l) => l.units).length, 270);
});

test('漫游（闸门常开）：大门经大堂到每户门口，车库经门户到电梯厅，两部楼梯 B2 ↔ RF 双向连续', () => {
  for (const b of W) {
    const F = b.frame;
    const main = L.entrances.find((e) => e.id === `${b.id}-MAIN`), mx = (main.seg.x0 + main.seg.x1) / 2;
    const L1 = `${b.id}-L1`, stop1F = linkStop(L1, `${b.id}-1F`);
    // 室外 → 门禁前厅 → 刷卡门 → 大堂 → 走廊 → 客梯厅
    let s = at('ground', mx, main.seg.z0 + 3);
    s = route(s, [[mx, main.seg.z0 - 2, `${b.id}-1F`], [mx, toW(F, 0, -0.3)[1]], [stop1F.x, toW(F, 0, -0.3)[1]], [stop1F.x, stop1F.z]]);
    assert.ok(clear(nav, s));
    for (const lv of levelsOf(b.id).filter((l) => l.kind === 'community')) {
      const stop = linkStop(L1, lv.id), corridorZ = toW(F, 0, -0.3)[1];
      assert.ok(clear(nav, at(lv.id, stop.x, stop.z)), `${lv.id} 候梯点不可站立`);
      for (const u of lv.units) {
        const entry = u.residence.entryDoor, door = toW(u.frame, entry.at, 0), inside = toW(u.frame, entry.at, 1.2);
        let q = at(lv.id, stop.x, stop.z);
        q = route(q, [[stop.x, corridorZ], [door[0], corridorZ], [door[0], door[1]], [inside[0], inside[1], lv.id]]);
        assert.ok(u.polys.some((poly) => pointInPoly([q.x, q.z], poly)), `${u.code} 进不了门`);
      }
    }
    // 西侧共享车库 → 门户 → 门禁前厅 → 刷卡门 → 地下电梯厅 L1 候梯点，双向
    for (const short of ['B1', 'B2']) {
      const deck = `WPG-${short}`, floor = `${b.id}-${short}`, seg = b.deckPortal, x = (seg.x0 + seg.x1) / 2;
      const stop = linkStop(L1, floor), corridorZ = toW(F, 0, -0.1)[1];
      let q = at(deck, x, -229.5);
      q = route(q, [[x, seg.z0 - 2.4, floor], [x, corridorZ], [stop.x, corridorZ], [stop.x, stop.z]]);
      q = route(q, [[stop.x, corridorZ], [x, corridorZ], [x, seg.z0 - 1], [x, -229.5, deck]]);
    }
    // 两部防烟楼梯：逐段双跑楼梯 B2 ↔ RF 连续步行，不跳高
    const routes = b.access.routes;
    assert.equal(routes.length, 60);
    for (const r of routes) for (const path of [r.waypoints, [...r.waypoints].reverse()]) {
      let q = { ...path[0], slope: null };
      assert.ok(clear(nav, q), `${r.id} 起点`);
      for (const p of path.slice(1)) {
        const n = Math.max(1, Math.ceil(Math.hypot(p.x - q.x, p.z - q.z) / .06));
        for (let i = 0; i < n; i++) { const prev = q; q = step(nav, q, (p.x - q.x) / (n - i), (p.z - q.z) / (n - i)); assert.ok(Math.abs(q.y - prev.y) < .04, `${r.id} 高度突变`); }
        assert.ok(Math.hypot(q.x - p.x, q.z - p.z) < .03 && q.floor === p.floor, `${r.id} 被挡 ${q.floor} ${q.x},${q.z}`);
      }
    }
  }
});

test('门禁记录：单层玻璃门，离门户 ≥ 2 m，读卡器在公共侧前厅，住户区在 v > 0 一侧且住户梯点不可越门触达', () => {
  const gates = L.accessControl.gates.filter((g) => /^W[12]-/.test(g.id)), zones = L.accessControl.zones.filter((z) => /^W[12]-/.test(z.id));
  assert.deepEqual(gates.map((g) => g.id).sort(), ['W1-1F-GATE', 'W1-B1-GATE', 'W1-B2-GATE', 'W2-1F-GATE', 'W2-B1-GATE', 'W2-B2-GATE']);
  assert.equal(zones.length, 6);
  for (const g of gates) {
    assert.deepEqual(gateRecordErrors(g), [], g.id);
    assert.equal(g.kind, 'glass-door'); assert.equal(g.floors.length, 1); assert.equal(g.hold, GATE.hold);
    const floor = g.floors[0], lv = lvl(floor), zone = zones.find((z) => z.id === g.zone);
    assert.ok(zone && zone.floors[0] === floor, `${g.id} 住户区`);
    const reader = toW(g.frame, g.reader.u, g.reader.v), mid = (g.lanes[0].u0 + g.lanes[0].u1) / 2;
    const residents = toW(g.frame, mid, 1), publicSide = toW(g.frame, mid, -.5);
    assert.ok(zone.polys.some((p) => pointInPoly(residents, p)), `${g.id} 住户侧不在住户区`);
    assert.ok(!zone.polys.some((p) => pointInPoly(reader, p) || pointInPoly(publicSide, p)), `${g.id} 读卡器落在住户区`);
    assert.ok(clear(nav, at(floor, ...reader)), `${g.id} 读卡器站位不可站立`);
    // 读卡器所在的前厅是一块独立走道（大堂门禁前厅 / 地下门禁前厅）
    assert.ok(lv.walk.some((w) => /vestibule|lobby-1/.test(w.id) && pointInPoly(reader, w.poly)), `${g.id} 读卡器不在前厅`);
    // 门线离任一门户线 ≥ 2.0 m
    const line = [toW(g.frame, 0, 0), toW(g.frame, g.line.u1, 0)];
    for (const e of L.entrances.filter((e) => e.level === floor)) {
      const a = [e.seg.x0, e.seg.z0], z = [e.seg.x1, e.seg.z1];
      const d = Math.min(distToSeg(a, ...line), distToSeg(z, ...line), distToSeg(line[0], a, z), distToSeg(line[1], a, z));
      assert.ok(d >= GATE.reachClear - 1e-6, `${g.id} 距门户 ${e.id} 仅 ${d.toFixed(2)}`);
    }
    // 读卡器一侧 0.25 m 网格内任何可站立点离住户电梯/楼梯停靠点都 > 2.0 m
    const stops = nav.links.filter((l) => (l.kind === 'lift' || l.kind === 'stair') && l.id.startsWith(g.zone.split('-')[0] + '-'))
      .flatMap((l) => l.stops.filter((s) => s.floor === floor));
    assert.ok(stops.length >= 5, `${g.id} 停靠点`);
    let probes = 0;
    for (let u = -3; u <= g.line.u1 + 3 + 1e-9; u += .25) for (let v = -4; v < 0; v += .25) {
      const p = toW(g.frame, u, v);
      if (zone.polys.some((z) => pointInPoly(p, z)) || !clear(nav, at(floor, ...p))) continue;
      probes++;
      for (const s of stops) assert.ok(Math.hypot(s.x - p[0], s.z - p[1]) > GATE.reachClear, `${g.id} 公共点 ${p} 可触达 ${s.floor}`);
    }
    assert.ok(probes > 20, `${g.id} 只检查了 ${probes} 个点`);
  }
});

test('西侧共享车库：门户落在住户大堂与车道之间，核心背后的窄条不再是车道，车道网络仍连通', () => {
  for (const short of ['B1', 'B2']) {
    const deck = lvl(`WPG-${short}`);
    for (const b of W) {
      const ex = polyBounds(b.deckExclusions[0]);
      assert.ok(deck.slab.pieces[0].holes.some((h) => polyBounds(h).x0 === ex.x0 && polyBounds(h).z1 === ex.z1), `${b.id} 车库板未让出住户大堂`);
      assert.ok(!deck.walk.some((w) => w.kind === 'aisle' && w.rect && w.rect.z1 <= ex.z0 + 1e-6 && w.rect.x0 >= ex.x0 - .3 && w.rect.x1 <= ex.x1 + .3), `${b.id} 核心背后仍有窄车道`);
      for (const s of deck.parking.stalls) assert.ok(!convexOverlap(s.poly, b.deckExclusions[0]), `${deck.id} 车位压住户大堂`);
      const portal = L.entrances.find((e) => e.id === `${b.id}-${short}-deck-to`);
      assert.ok(portal && portal.residentialCore === b.id);
      assert.ok(deck.walk.some((w) => w.id === `${b.id}-${short}-deck-arrival`));
    }
    // 北侧双车道被核心切断后，仍经三条南北向横通道连成一个网络
    const aisles = deck.walk.filter((w) => w.kind === 'aisle' && polyBounds(w.poly).z0 < -200);
    const seen = new Set([aisles[0].id]), queue = [aisles[0]];
    while (queue.length) {
      const a = queue.pop();
      for (const q of aisles) if (!seen.has(q.id) && polysConnect(a.poly, q.poly, 1)) { seen.add(q.id); queue.push(q); }
    }
    assert.equal(seen.size, aisles.length, `${deck.id} 北部车道断开：${aisles.filter((a) => !seen.has(a.id)).map((a) => a.id).join(',')}`);
  }
});

test('每户都与地铁网络连通（步行图）', () => {
  const comp = components(buildWalkGraph(L));
  const metro = comp.get(`ent:${L.entrances.find((e) => e.building === 'M').id}`);
  for (const b of W) for (const lv of levelsOf(b.id)) {
    for (const u of lv.units) assert.equal(comp.get(`unit:${u.id}`), metro, `${u.code} 不可达`);
    for (const w of lv.walk) assert.equal(comp.get(`walk:${lv.id}:${w.id}`), metro, `${lv.id} ${w.id} 不可达`);
  }
});
