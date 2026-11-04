import test from 'node:test';
import clipping from 'polygon-clipping';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, step, clear } from '../src/layout/nav.js';
import { pointInPoly, polysOverlap, polyArea, toL, toW, rect, lrectPoly } from '../src/layout/geom.js';
import { expansionConnectionNetworks } from '../src/render/build/expansion-connections.js';

const L = buildLayout(), nav = buildNav(L), court = L.expansion.sunkenCourt;
const state = (p, floor) => ({ x: p[0], y: p[1], z: p[2], floor, slope: null });
function travel(s, points) {
  assert.ok(clear(nav, s), `start ${JSON.stringify(s)}`);
  for (const p of points) {
    const n = Math.ceil(Math.hypot(p[0] - s.x, p[2] - s.z) / .05) || 1, dx = (p[0] - s.x) / n, dz = (p[2] - s.z) / n;
    for (let i = 0; i < n; i++) { const y = s.y; s = step(nav, s, dx, dz); assert.ok(clear(nav, s)); assert.ok(Math.abs(s.y - y) < .06); }
    assert.ok(Math.hypot(p[0] - s.x, p[2] - s.z) < .04, `blocked at ${s.floor} ${s.x},${s.z} -> ${p}`);
    assert.ok(Math.abs(s.y - p[1]) < .05);
  }
  return s;
}

test('西门连接西外环与喷泉主步道，并从真实门厅进入首层商业街', () => {
  const D = L.expansion.westArrival, e = L.entrances.find(e => e.id === D.entry);
  const points = [...D.path.points].reverse().map(([x, z]) => [x, 0, z]);
  points.push([D.interior[0], 0, D.interior[1]]);
  let s = travel(state(points[0], 'ground'), points.slice(1)); assert.equal(s.floor, 'P1-1F');
  s = travel(s, points.slice(0, -1).reverse()); assert.equal(s.floor, 'ground');
  assert.equal(e.to, 'site'); assert.ok(e.width >= 5);
  assert.ok(L.site.crossings.some(c => c.id === 'west-cross-art-gate' && pointInPoly([-292, -124.5], c.poly)));
  for (const r of D.gate.piers) assert.equal(clear(nav, { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, y: 0, floor: 'ground' }), false);
});

test('扩建下沉广场超过旧面积两倍，真实地面开洞且不压建筑、道路和地铁井', () => {
  assert.ok(Math.abs(polyArea(court.poly)) > 2 * 17 * 26.5);
  for (const b of L.buildings.filter(b => b.kind !== 'metro' && !b.undergroundOnly))
    assert.ok(!polysOverlap(court.poly, b.outline), `${b.id} overlaps court`);
  for (const e of L.entrances.filter(e => e.kiosk)) assert.ok(!polysOverlap(court.poly, e.kiosk.poly), e.id);
  for (const r of L.site.roads) assert.ok(!polysOverlap(court.poly, r.poly));
  assert.ok(L.site.openings.includes(court.poly));
  for (const o of L.levels.find(l => l.id === court.level).navObstacles.filter(o => o.id.startsWith('P1-court')))
    assert.ok(o.poly.every(p => pointInPoly(p, court.poly)), `${o.id} outside court`);
  assert.ok(court.stair.width >= 6);
});

test('地面宽台阶、B1M 美食层和地铁站厅经过真实通廊连续双向步行', () => {
  const food = L.extensions.paths.find(p => p.id === court.path), metro = L.extensions.paths.find(p => p.id === court.metroPath);
  const e = L.entrances.find(e => e.id === court.metroPortal), f = L.entrances.find(e => e.id === 'P1-sunken-food-door');
  const start = [food.points[0][0] - f.nx * 2, -4.5, food.points[0][2] - f.nz * 2];
  const end = metro.points.at(-1), station = [end[0] + e.nx * 1.4, -4.5, end[2] + e.nz * 1.4];
  const points = [start, ...food.points, ...court.routes.metro, station];
  let s = travel(state(start, court.level), points.slice(1)); assert.equal(s.floor, 'M-B1');
  s = travel(s, points.slice(0, -1).reverse()); assert.equal(s.floor, court.level);
  const stair = court.stair, access = [[stair.top.x, 0, -23.5], [stair.top.x, 0, stair.top.z + .7], [stair.bottom.x, -4.5, stair.bottom.z - .8], court.routes.metro[0], ...court.routes.metro.slice(1), station];
  s = travel(state(access[0], 'ground'), access.slice(1)); assert.equal(s.floor, 'M-B1');
  s = travel(s, access.slice(0, -1).reverse()); assert.equal(s.floor, 'ground');
});

test('艺术通廊接入地铁 E 口通道侧墙，不再横穿 E 口通道，且两端结构边界均开口', () => {
  const M = L.buildings.find(b => b.id === 'M'), PE = M.passages.find(p => p.id === 'PE'), e = L.entrances.find(e => e.id === court.metroPortal);
  assert.equal(e.metroPassage, 'PE');
  const p = L.extensions.paths.find(p => p.id === court.metroPath), P1 = L.buildings.find(b => b.id === 'P1');
  for (const poly of p.polys) assert.ok(!polysOverlap(poly, P1.outline), 'new tunnel crosses the main mall outside its portal');
  for (const ex of M.exits) for (const poly of p.polys) assert.ok(!polysOverlap(poly, ex.kiosk.poly), `${ex.id} stair overlaps the art passage`);
  // Only the 3 cm butt end of the last strip may reach into the E tunnel.
  const inside = clipping.intersection(clipping.union(...p.polys.map(q => [q])), [PE.poly]);
  const area = inside.reduce((sum, [ring]) => sum + Math.abs(polyArea(ring)), 0);
  assert.ok(area < 5.2 * .05, `art passage runs through the E tunnel (${area.toFixed(2)} m²)`);
  const len = Math.hypot(e.seg.x1 - e.seg.x0, e.seg.z1 - e.seg.z0);
  for (let t = .1; t < .9; t += .1) {
    const x = e.seg.x0 + (e.seg.x1 - e.seg.x0) * t, z = e.seg.z0 + (e.seg.z1 - e.seg.z0) * t;
    assert.ok(!PE.walls.some(w => Math.abs(w.z0 - z) < .01 && Math.abs(w.z1 - z) < .01 && x > Math.min(w.x0, w.x1) && x < Math.max(w.x0, w.x1)), `E tunnel wall across doorway at ${x}`);
  }
  assert.ok(len >= 5 && PE.walls.some(w => Math.abs(w.z0 - e.seg.z0) < .01 && Math.max(w.x0, w.x1) <= Math.min(e.seg.x0, e.seg.x1) + .01), 'E tunnel wall beside the doorway');
  const network = expansionConnectionNetworks(L).find(n => n.paths.some(p => p.id === court.metroPath));
  assert.ok(network.levels.includes('M-B1') && network.levels.includes('P1-B1M'));
  for (const edge of network.boundary) {
    const onDoor = [edge.z0, edge.z1].every(z => Math.abs(z - e.seg.z0) < .1);
    assert.ok(!(onDoor && Math.min(edge.x0, edge.x1) < (e.seg.x0 + e.seg.x1) / 2 && Math.max(edge.x0, edge.x1) > (e.seg.x0 + e.seg.x1) / 2), 'station portal capped');
  }
  const compact = buildLayout({ expansion: false });
  assert.equal(compact.expansion, undefined);
  assert.equal(compact.entrances.some(e => e.id === 'P1-WEST-ART' || e.id === court.metroPortal), false);
});
