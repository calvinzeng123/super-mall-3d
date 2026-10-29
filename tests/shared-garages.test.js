import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/layout/layout.js';
import { applySharedGarages, SHARED_GARAGE_BOUNDS } from '../src/layout/shared-garages.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { convexOverlap, pointInPoly, polyBounds, lrectPoly, rect, polySamples } from '../src/layout/geom.js';

const L = applySharedGarages(buildLayout()), nav = buildNav(L);
const lv = id => L.levels.find(l => l.id === id);
const onSlab = (l, p) => l.slab.pieces.some(s => pointInPoly(p, s.outer) && !s.holes.some(h => pointInPoly(p, h)))
  && !l.voids.some(v => pointInPoly(p, v.poly));
const at = (floor, x, z) => ({ floor, x, z, y: nav.floors.get(floor).y, slope: null });

function follow(state, target, tolerance = .1) {
  const dx = target.x - state.x, dz = target.z - state.z, n = Math.ceil(Math.hypot(dx, dz) / .07);
  for (let i = 0; i < n; i++) {
    const previous = state.y;
    state = step(nav, state, dx / n, dz / n, 0);
    assert.ok(Math.abs(state.y - previous) < .12, `height jump before ${target.floor || target.x}`);
  }
  assert.ok(Math.hypot(state.x - target.x, state.z - target.z) < tolerance,
    `blocked at ${state.floor} ${state.x.toFixed(2)},${state.z.toFixed(2)} → ${target.x},${target.z}`);
  if (target.floor) assert.equal(state.floor, target.floor);
  return state;
}

test('一期共享地库扩大到整片一期与西停车场，塔楼区域只保留一张同标高楼板', () => {
  assert.deepEqual(polyBounds(lv('P1-B1').outline), SHARED_GARAGE_BOUNDS.mall);
  assert.deepEqual(polyBounds(lv('WPG-B1').outline), SHARED_GARAGE_BOUNDS.west);
  for (const id of ['H-B2', 'A-B2']) {
    const tower = lv(id), b = polyBounds(tower.outline);
    assert.equal(tower.elev, lv('P1-B1').elev);
    for (const p of [[(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2], [b.x0 + 2, b.z0 + 2]]) {
      assert.ok(!onSlab(lv('P1-B1'), p), `${id} has a duplicate main parking slab`);
    }
  }
  for (const p of [[-279, -246], [-130, -225], [-174, -40], [-28, -132]]) assert.ok(onSlab(lv('P1-B1'), p), `${p} has no floor`);
  assert.equal(L.levels.filter(l => l.building === 'P1').length, 10);
  assert.equal(L.levels.filter(l => l.building === 'WPG').length, 3);
});

test('六组共享地面进出坡道成对分离，原公寓与商场交叉坡道已删除', () => {
  assert.ok(!L.ramps.some(r => ['P1-IN', 'P1-OUT'].includes(r.id)));
  const ramps = L.ramps.filter(r => r.sharedGarage && r.type.startsWith('street'));
  assert.equal(ramps.length, 12);
  assert.equal(new Set(ramps.map(r => r.quadrant)).size, 6);
  const all = L.ramps.filter(r => r.type.startsWith('street'));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
    assert.ok(!convexOverlap(all[i].poly, all[j].poly), `${all[i].id}/${all[j].id} intersect`);
  for (const r of all) {
    // Covered ramps open only until the surface is 3.05 m below grade.
    const opening = r.cover ? r.groundOpening : r.poly;
    assert.ok(L.site.trenches.some(p => p === opening), `${r.id} does not share its excavation with the surface`);
    if (r.cover) {
      assert.ok(r.cover.open < r.cover.length && Math.abs(r.cover.open / r.cover.length * 8.4 - 3.05) < 1e-9, `${r.id} open length`);
      assert.ok(polySamples(opening, 1, .05).every(q => pointInPoly(q, r.poly)), `${r.id} trench leaves the lane`);
    }
    assert.ok(Math.abs(r.to.y - r.from.y) / Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z) <= .15001);
  }
});

test('全园36条车库坡道中线和两侧均连续双向步行，所有层间坡道有真洞口', () => {
  let count = 0;
  for (const r of L.ramps) {
    for (const reverse of [false, true]) for (const offset of [-1.8, 0, 1.8]) {
      const a = reverse ? r.to : r.from, b = reverse ? r.from : r.to;
      const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      const x = a.x - ux - uz * offset, z = a.z - uz + ux * offset;
      const floor = a.level === 'street' ? nav.groundAt(x, z) : a.level;
      const state = at(floor, x, z);
      assert.ok(clear(nav, state), `${r.id}/${reverse}/${offset} has no supported arrival`);
      const tx = b.x + ux - uz * offset, tz = b.z + uz + ux * offset;
      follow(state, { x: tx, z: tz, floor: b.level === 'street' ? nav.groundAt(tx, tz) : b.level });
      count++;
    }
    if (!r.type.startsWith('street')) {
      const high = r.from.y > r.to.y ? r.from : r.to, low = high === r.from ? r.to : r.from;
      for (const t of [.1, .3, .5, .7, .9]) assert.ok(!onSlab(lv(high.level),
        [high.x + (low.x - high.x) * t, high.z + (low.z - high.z) * t]), `${r.id} is covered by an upper slab`);
    }
  }
  assert.equal(count, L.ramps.length * 6);
});

test('酒店、公寓和西停车场可步行进入一期共享层，车道不接二期', () => {
  for (const [floor, points] of [
    ['H-B2', [[-219, -81.15], [-203, -81.15]]],
    ['A-B2', [[-38, -214], [-66, -214]]],
    ['WPG-B2', [[-307, -179], [-279, -179]]],
  ]) {
    let state = at(floor, ...points[0]);
    state = follow(state, { x: points[1][0], z: points[1][1], floor: 'P1-B1' });
    const original = points[0];
    follow(state, { x: original[0], z: original[1], floor });
  }
  assert.ok(!L.extensions.paths.some(p => p.kind === 'garage'
    && [p.from, p.to].some(v => /^(P1|H|A|WPG)-/.test(v))
    && [p.from, p.to].some(v => /^P2-/.test(v))));
});

test('酒店南侧双坡脚经独立汇流车道双向进入酒店主通道', () => {
  for (const z of [-45, -37]) for (const reverse of [false, true]) {
    const route = [[-243, z], [-238, z], [-238, -81.15]];
    if (reverse) route.reverse();
    let state = at('H-B1', ...route[0]);
    assert.ok(clear(nav, state));
    for (const [x, z] of route.slice(1)) state = follow(state, { floor: 'H-B1', x, z });
  }
});

test('新增车位与结构、楼梯、电梯厅和车道分离，四张大盘均有密集车位', () => {
  for (const id of ['P1-B1', 'P1-B2', 'WPG-B1', 'WPG-B2']) {
    const l = lv(id);
    assert.ok(l.parking.stalls.length > 800, `${id}: only ${l.parking.stalls.length} marked bays`);
    const blocks = [...l.walk.filter(w => w.kind === 'aisle').map(w => w.poly),
      ...l.rooms.flatMap(r => r.polys), ...l.voids.map(v => v.poly)];
    for (const s of l.parking.stalls) {
      assert.ok(!blocks.some(p => convexOverlap(s.poly, p)), `${id} bay on a lane or structure at ${s.x},${s.z}`);
      assert.ok(polySamples(s.poly, 2, .05).every(p => onSlab(l, p)), `${id} unsupported bay`);
    }
  }
  assert.ok(!lv('A-B1').parking.stalls.some(s => convexOverlap(s.poly,
    [[-43, -225], [-32, -225], [-32, -214], [-43, -214]])), 'extraction pickup lane is occupied');
});

test('新增六组电梯均有真实地面入口候梯楼板，十一组安全梯有连续实体梯段', () => {
  const lifts = L.elevators.filter(e => e.sharedGarage);
  assert.equal(lifts.length, 6);
  for (const e of lifts) {
    const link = nav.links.find(l => l.id === e.id);
    assert.equal(link.stops.length, 3);
    for (const s of link.stops) assert.ok(clear(nav, at(s.floor, s.x, s.z)), `${e.id}/${s.floor} lift lobby blocked`);
    const entry=L.entrances.find(en=>en.id===`${e.id}-entry`);
    assert.ok(entry);
    if(entry.to!=='site') {
      const hall=lv(entry.to);
      assert.equal(hall.elev,0);
      assert.ok(hall.integratedGarageKiosks.some(k=>k.id===e.id));
    }
    assert.ok(lv(e.serves.at(-1)).slab.pieces.some(p => pointInPoly([e.x, e.z + 3.2], p.outer)));
  }
  const stairs = L.stairs.filter(s => s.sharedGarage);
  assert.equal(stairs.length, 11);
  for (const s of stairs) {
    const b = L.buildings.find(b => b.id === s.building);
    const routes = b.access.routes.filter(r => r.stair === s.id);
    assert.equal(routes.length, 2);
    for (const route of routes) for (const reverse of [false, true]) {
      const points = reverse ? [...route.waypoints].reverse() : route.waypoints;
      let state = at(points[0].floor, points[0].x, points[0].z);
      assert.ok(clear(nav, state), `${s.id} stair entrance blocked`);
      for (const p of points.slice(1)) state = follow(state, p);
    }
  }
});

test('共享车库每座地面小厅可双向穿门进入，外侧不被场地设施阻挡', () => {
  for (const e of L.entrances.filter(e => e.sharedGarage && e.to === 'site')) {
    const x = (e.seg.x0 + e.seg.x1) / 2, z = (e.seg.z0 + e.seg.z1) / 2;
    const inside = { x: x - e.nx * 1.5, z: z - e.nz * 1.5, floor: e.level };
    const outside = { x: x + e.nx * 1.5, z: z + e.nz * 1.5, floor: 'ground' };
    for (const [from, to] of [[outside, inside], [inside, outside]]) {
      const state = at(from.floor, from.x, from.z);
      assert.ok(clear(nav, state), `${e.id} approach blocked at ${from.x},${from.z}`);
      follow(state, to);
    }
  }
});
