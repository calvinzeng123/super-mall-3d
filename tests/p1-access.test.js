import test from 'node:test';
import assert from 'node:assert/strict';
import { L, walkNav } from './helpers.js';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav } from '../src/layout/nav.js';
import { P1_GARAGE_RAMPS, WEST_LOT_GATES } from '../src/layout/p1-access.js';
import { convexOverlap, pointInPoly, polySamples, lrectPoly, rect } from '../src/layout/geom.js';

const nav = buildNav(L), old = buildLayout({ expansion: false });
const deck = L.levels.find(l => l.id === 'P1-B1');
const ramps = P1_GARAGE_RAMPS.map(d => L.ramps.find(r => r.id === d.id));
const walk = (floor, from, to) => walkNav(nav, floor, from, to);

test('一期新增方庭北口、星湾东口两对坡道只在完整探索中出现，直落 P1-B1，坡度 ≤15%', () => {
  assert.equal(ramps.filter(Boolean).length, 4);
  assert.ok(!old.ramps.some(r => /^P1-[NE]-/.test(r.id)), 'FPS 布局不应出现新坡道');
  for (const r of ramps) {
    const low = r.from.level === 'street' ? r.to : r.from, high = low === r.from ? r.to : r.from;
    assert.equal(low.level, 'P1-B1'); assert.equal(low.y, -8.4); assert.equal(high.level, 'street');
    const len = Math.hypot(high.x - low.x, high.z - low.z);
    assert.ok(8.4 / len <= .150001, `${r.id} 坡度过大`);
    for (const p of r.poly) assert.ok(p[0] >= -286 && p[0] <= -16 && p[1] >= -256 && p[1] <= -20, `${r.id} 超出一期地块`);
    for (const b of L.buildings.filter(b => !b.undergroundOnly && b.kind !== 'metro'))
      assert.ok(!convexOverlap(r.poly, b.outline), `${r.id} 压 ${b.id}`);
    for (const k of L.levels.flatMap(l => l.garageKiosks || [])) assert.ok(!convexOverlap(r.poly, k.poly), `${r.id} 压 ${k.id}`);
    for (const other of L.ramps.filter(x => x !== r && convexOverlap(r.poly, x.poly))) {
      // Plan overlap is allowed only above a B1→B2 ramp, with the new lane still above the deck storey.
      assert.ok(Math.max(other.from.y, other.to.y) <= -8.4, `${r.id}/${other.id} 重叠`);
      for (const p of polySamples(other.poly, 1, .05).filter(p => pointInPoly(p, r.poly))) {
        const u = Math.hypot(p[0] - high.x, p[1] - high.z);
        assert.ok(-8.4 * u / len > -4.1, `${r.id} 在 ${other.id} 上方进入 B1 层高`);
      }
    }
  }
  assert.deepEqual(new Set(ramps.map(r => r.quadrant)), new Set(['方庭北口', '星湾东口']));
});

test('新坡道地面只开敞到 3.05m 深，暗埋段上方广场可走，敞开段不能横穿', () => {
  for (const r of ramps) {
    assert.ok(L.site.trenches.includes(r.groundOpening));
    assert.ok(Math.abs(r.cover.open / r.cover.length * 8.4 - 3.05) < 1e-9);
    assert.ok(!L.site.trenches.some(t => t !== r.groundOpening && convexOverlap(t, r.poly)), `${r.id} 暗埋段被挖开`);
  }
  // 方庭北门前：暗埋段上方可以从北侧走到门前，敞开段被坡槽挡住。
  assert.ok(Math.abs(walk('ground', [-210, -255.6], [-210, -241]).z + 241) < .05, '北口暗埋段上方不能通行');
  assert.ok(walk('ground', [-176, -255.8], [-176, -241]).z < -255, '北口敞开段竟能横穿');
  assert.ok(Math.abs(walk('ground', [-24, -60], [-24, -40]).z + 40) < .05, '东口暗埋段上方不能通行');
});

test('坡脚接 B1 到达车道；坡板进入 B1 层高后的投影内不留车位，侧面不能钻到板下', () => {
  for (const r of ramps) {
    const low = r.from.level === 'street' ? r.to : r.from, high = low === r.from ? r.to : r.from;
    const len = Math.hypot(high.x - low.x, high.z - low.z), ux = (low.x - high.x) / len, uz = (low.z - high.z) / len;
    const past = [low.x + ux * .8, low.z + uz * .8];
    assert.ok(deck.walk.some(w => w.kind === 'aisle' && pointInPoly(past, w.poly)), `${r.id} 坡脚没有车道`);
    const under = lrectPoly(r.frame, rect(r.cover.deep, -r.width / 2, len, r.width / 2));
    assert.ok(!deck.parking.stalls.some(s => convexOverlap(s.poly, under)), `${r.id} 板下仍有车位`);
    assert.ok(!deck.walk.some(w => w.kind === 'aisle' && polySamples(under, 1.5, .3).some(p => pointInPoly(p, w.poly))), `${r.id} 板下仍画车道`);
  }
  for (const w of deck.walk.filter(w => /^P1-[NE]-arrival/.test(w.id)))
    for (const room of deck.rooms) assert.ok(!room.polys.some(p => convexOverlap(p, w.poly)), `${w.id} 压 ${room.id}`);
  // 北口两坡板在 B1 的南侧护线：从南侧车道往北走会被挡在板外。
  const s = walk('P1-B1', [-210, -238], [-210, -250]);
  assert.ok(s.z > -243.9, `从侧面钻进北口坡板下 ${s.z}`);
  assert.ok(deck.parking.stalls.length > 850 && deck.parking.stalls.length < 914, `B1 车位 ${deck.parking.stalls.length}`);
});

test('车行口距离控制：东口距云澜大道红线 ≥70m，北口距两端路口 ≥100m，均有地面车道接入', () => {
  const east = ramps.filter(r => r.quadrant === '星湾东口'), north = ramps.filter(r => r.quadrant === '方庭北口');
  for (const r of east) { const s = r.from.level === 'street' ? r.from : r.to; assert.ok(-20 - s.z >= 70, `${r.id} 距大道 ${-20 - s.z}`); }
  for (const r of north) { const s = r.from.level === 'street' ? r.from : r.to; assert.ok(s.x + 286 >= 100 && -10 - s.x >= 100); }
  for (const r of ramps) {
    const s = r.from.level === 'street' ? r.from : r.to, low = s === r.from ? r.to : r.from, len = Math.hypot(low.x - s.x, low.z - s.z);
    const out = [s.x - (low.x - s.x) / len * .4, s.z - (low.z - s.z) / len * .4];
    assert.ok(L.site.driveways.some(d => pointInPoly(out, d)), `${r.id} 地面端没有接入道`);
  }
  for (const id of ['xingwan', 'ring-n']) {
    const road = L.site.roads.find(r => r.id === id);
    assert.ok(L.site.driveways.some(d => convexOverlap(d, road.poly, -.01) || d.some(p => Math.abs(p[0] + 10) < .01 || Math.abs(p[1] + 256) < .01)), `${id} 未接入`);
  }
});

test('西侧地面停车场新增北环两口与大道口，闸架朝向城市道路并接场内纵向车道', () => {
  const plan = L.site.westParking;
  assert.equal(plan.gates.length, 6);
  for (const g of WEST_LOT_GATES) {
    const gate = plan.gates.find(x => x.id === g.id);
    assert.ok(gate && gate.facing, `${g.id} 缺少朝向`);
    const street = L.site.roads.find(r => pointInPoly([g.x, g.street + Math.sign(g.street - g.lot) * 2], r.poly));
    assert.ok(street, `${g.id} 外侧不是城市道路`);
    assert.ok(Math.abs(g.x + 298) >= 70, `${g.id} 距西外环路口 ${Math.abs(g.x + 298)}`);
    const spine = plan.roads.find(r => r.id === `west-spine-${-g.x}`);
    assert.ok(spine, `${g.id} 未对准纵向车道`);
    assert.ok(plan.roads.some(r => r.id === `west-gate-${g.id}`));
  }
});
