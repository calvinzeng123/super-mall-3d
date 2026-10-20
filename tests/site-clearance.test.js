import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { rect, rectPoly, frame, toW, lrectPoly, clipConvex, polyArea, pointInPoly, convexOverlap, distToPolyEdge } from '../src/layout/geom.js';
import { subtractTowerFootprints, siteLampPlacement, siteTreePlacement, siteGroundHoles, siteContextBuildings } from '../src/render/build/site.js';
import { shapeFromPoly, flatShapeGeometry } from '../src/render/build/shell.js';
import { cutSurfaceShapes } from '../src/render/build/surface-shapes.js';
import { BatchSet } from '../src/render/batch.js';
import { addTrees, streetLamp } from '../src/render/build/props.js';

const area = poly => Math.abs(polyArea(poly));
const towers = L.buildings.filter(b => b.kind === 'tower' && !b.undergroundOnly).map(b => b.outline);
const accessKiosks = L.buildings.flatMap(b => (b.accessKiosks || []).map(r => lrectPoly(b.frame, r)));
const garageKiosks = L.levels.flatMap(l => (l.garageKiosks || []).map(k => k.poly));
function approaches() {
  const result = [];
  for (const b of L.buildings.filter(b => b.kind === 'mall')) {
    const r = b.plot, plot = rectPoly(rect(r.x0 + 2, r.z0 + 2, r.x1 - 2, r.z1 - 2));
    for (const e of L.entrances.filter(e => e.building === b.id && e.to === 'site')) {
      const F = frame((e.seg.x0 + e.seg.x1) / 2, (e.seg.z0 + e.seg.z1) / 2, Math.atan2(e.nz, e.nx) * 180 / Math.PI);
      const hw = Math.max(3, e.width / 2);
      const poly = clipConvex([toW(F, 8, -hw), toW(F, 160, -hw), toW(F, 160, hw), toW(F, 8, hw)], plot);
      if (poly.length >= 3) result.push({ id: e.id, F, hw, poly });
    }
  }
  return result;
}

test('入口铺装扣除部分相交、旋转及反绕序塔楼后，面积守恒且实际三角形不穿楼', () => {
  const base = rectPoly(rect(-10, -5, 10, 5));
  const cuts = [rectPoly(rect(-2, -2, 2, 2)), rectPoly(rect(-15, -2, 0, 2)), rectPoly(rect(-20, -20, 20, 20)),
    rectPoly(rect(10, -2, 20, 2)), lrectPoly(frame(0, 0, 27), rect(-2, -12, 2, 12))];
  for (const cut of cuts) for (const footprint of [cut, [...cut].reverse()]) {
    const pieces = subtractTowerFootprints(base, [footprint]);
    assert.ok(Math.abs(pieces.reduce((n, p) => n + area(p), 0) + area(clipConvex(base, cut)) - area(base)) < 1e-7);
    for (const p of pieces) assert.ok(!convexOverlap(p, cut, 1e-7));
  }
  let triangles = 0;
  for (const entry of approaches()) for (const piece of subtractTowerFootprints(entry.poly, towers)) {
    const g = flatShapeGeometry(shapeFromPoly(piece), -.1), pos = g.attributes.position, ids = g.index;
    assert.ok([...pos.array].every(Number.isFinite));
    for (let i = 0; i < (ids?.count || pos.count); i += 3) {
      const tri = [0, 1, 2].map(k => { const j = ids ? ids.getX(i + k) : i + k; return [pos.getX(j), pos.getZ(j)]; });
      for (const footprint of towers) assert.ok(!convexOverlap(tri, footprint, .0001), `${entry.id} 铺装穿入塔楼`);
      triangles++;
    }
    g.dispose();
  }
  assert.ok(triangles > 10, '入口铺装不可全部移除');
});

test('保留入口与街道照明，真实灯杆和灯臂均不穿入塔楼或接驳围护', () => {
  const allow = siteLampPlacement(L), B = new BatchSet({});
  const enclosures = [...towers, ...accessKiosks, ...garageKiosks, ...(L.extensions.gateways || []).filter(g => g.elev >= 0).map(g => g.poly),
    ...L.extensions.paths.filter(p => p.kind === 'skybridge').flatMap(p => p.slab.pieces.map(s => s.outer))];
  let retained = 0;
  const place = (x, z, dir) => { if (allow(x, z)) { streetLamp(B, x, z, -.14, dir, 5); retained++; } };
  for (const { F, hw, poly } of approaches()) for (let u = 20; u < 160; u += 15) {
    if (!pointInPoly(toW(F, u, 0), poly)) break;
    for (const k of [-1, 1]) place(...toW(F, u, k * (hw + .6)), [k * F.s, -k * F.c]);
  }
  for (let x = -270; x <= 270; x += 26) if (Math.abs(x) >= 24) { place(x, -15, [0, 1]); place(x, 15, [0, -1]); }
  for (let z = -250; z <= 250; z += 26) if (Math.abs(z) >= 24) { place(-15, z, [1, 0]); place(15, z, [-1, 0]); }
  for (const batch of Object.values(B.sets)) for (let i = 0; i < batch.n; i++) {
    const p = [batch.pos[i * 3], batch.pos[i * 3 + 2]];
    assert.ok(enclosures.every(poly => !pointInPoly(p, poly)), `灯具穿入建筑 ${p}`);
  }
  assert.ok(retained > 40, `仅保留 ${retained} 盏场地照明`);
});

test('按实际树心和尺寸避让，含随机偏移的真实树冠不穿建筑、接驳体或活动场地', () => {
  const allow = siteTreePlacement(L), list = [];
  const solids = [...L.buildings.filter(b => b.kind !== 'metro' && !b.undergroundOnly).map(b => b.outline), ...accessKiosks, ...garageKiosks,
    ...L.extensions.gateways.filter(g => g.elev >= 0).map(g => g.poly),
    ...L.extensions.paths.filter(p => p.kind === 'skybridge').flatMap(p => p.slab.pieces.map(s => s.outer)),
    ...L.site.activityExclusions, ...L.site.trenches, ...L.extensions.surfaceParking.map(p => p.poly),
    ...(L.site.westParking?.poly ? [L.site.westParking.poly] : [])];
  for (let x = -500; x < 290; x += 15) for (let z = -265; z < -10; z += 17) {
    const tree = { x: x + .37, z: z - .41, y: -.14, s: 1.35, kind: (x + z) % 3 ? 'round' : 'cone' };
    if (allow(tree)) list.push(tree);
  }
  assert.ok(list.length > 30, '需要保留场地绿化');
  const group = new THREE.Group();
  addTrees(group, {}, list, 23);
  const matrix = new THREE.Matrix4(), p = new THREE.Vector3();
  for (const mesh of group.children) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      for (let j = 0; j < pos.count; j++) {
        p.fromBufferAttribute(pos, j).applyMatrix4(matrix);
        assert.ok(solids.every(poly => !pointInPoly([p.x, p.z], poly)), `树冠穿入设施 ${p.x},${p.z}`);
      }
    }
    mesh.geometry.dispose(); mesh.material.dispose();
  }
});

test('跳过通用大雨棚的入口均落在已有地面接驳结构上', () => {
  const covers = [...accessKiosks, ...garageKiosks, ...L.extensions.gateways.filter(g => g.elev === 0).map(g => g.poly),
    ...L.extensions.paths.filter(p => p.kind === 'ground').flatMap(p => p.polys || [])];
  const entries = L.entrances.filter(e => e.coveredConnection);
  assert.ok(entries.length >= 2);
  for (const e of entries) {
    const p = [(e.seg.x0 + e.seg.x1) / 2, (e.seg.z0 + e.seg.z1) / 2];
    assert.ok(covers.some(poly => pointInPoly(p, poly) || distToPolyEdge(p, poly) < .02), `${e.id} 跳过门棚却没有实体接驳`);
  }
});

test('地下附库上方保留真实地面及绿化照明，实际坡口仍挖空并避让', () => {
  const trench = rectPoly(rect(6, -2, 9, 2));
  const layout = { buildings: [{ id: 'WPG', kind: 'garage', undergroundOnly: true, outline: rectPoly(rect(-10, -10, 10, 10)) }],
    site: { trenches: [trench] }, extensions: {} };
  const holes = siteGroundHoles(layout), center = [.7, .3], ramp = [7, .3];
  const ground = flatShapeGeometry(shapeFromPoly(rectPoly(rect(-30, -30, 30, 30)), holes), -.32);
  const p = ground.attributes.position, index = ground.index, triangles = [];
  for (let i = 0; i < index.count; i += 3) triangles.push([0, 1, 2].map(k => { const j = index.getX(i + k); return [p.getX(j), p.getZ(j)]; }));
  assert.ok(triangles.some(t => pointInPoly(center, t)), '附库上方被挖成大洞');
  assert.ok(!triangles.some(t => pointInPoly(ramp, t)), '真实坡口被地面盖住');
  assert.ok(siteTreePlacement(layout)({ x: center[0], z: center[1], s: 1 }));
  assert.ok(siteLampPlacement(layout)(...center));
  assert.ok(!siteTreePlacement(layout)({ x: ramp[0], z: ramp[1], s: 1 }));
  assert.ok(!siteLampPlacement(layout)(...ramp));
  ground.dispose();

  // Use buildSite's real mesh boundary and actual annex roof locations as well
  // as the synthetic garage: underground mass must never cut out the surface.
  const actual = flatShapeGeometry(cutSurfaceShapes([[-1500, -1500], [1500, -1500], [1500, 1500], [-1500, 1500]], siteGroundHoles(L)), -.32);
  const ap = actual.attributes.position, ai = actual.index, actualTriangles = [];
  for (let i = 0; i < ai.count; i += 3) actualTriangles.push([0, 1, 2].map(k => { const j = ai.getX(i + k); return [ap.getX(j), ap.getZ(j)]; }));
  for (const point of [[-344.5, -200], [-344.5, -215], [-377, -200]]) {
    assert.ok(actualTriangles.some(t => pointInPoly(point, t)), `西侧附库上方真实地面缺失 ${point}`);
  }
  for (const kiosk of accessKiosks) {
    const center = kiosk.reduce((p, q) => [p[0] + q[0] / kiosk.length, p[1] + q[1] / kiosk.length], [0, 0]);
    assert.ok(!actualTriangles.some(t => pointInPoly(center, t)), '行人小厅井道被场地地面封堵');
    assert.ok(!siteTreePlacement(L)({ x: center[0], z: center[1], s: 1 }));
    assert.ok(!siteLampPlacement(L)(...center));
  }
  actual.dispose();
});

test('大型停车场整片地块、外接车道及步行轴不被通用树木路灯占用', () => {
  const boundary = rectPoly(rect(-484, -250, -301, -33));
  const drive = rectPoly(rect(-484, -243, -292, -235));
  const promenade = rectPoly(rect(-303, -31, -203, -27));
  const layout = { buildings: [], site: { westParking: { poly: boundary } }, extensions: {
    surfaceParking: [{ poly: rectPoly(rect(-475, -220, -460, -210)) }],
    roads: [{ polys: [drive] }], paths: [{ kind: 'ground', polys: [promenade] }],
  } };
  const lamp = siteLampPlacement(layout), tree = siteTreePlacement(layout);
  for (const [x, z] of [[-479, -247], [-390, -130], [-302, -34], [-296, -239], [-240, -29]]) {
    assert.ok(!lamp(x, z), `停车地块或交通主线出现通用灯杆 ${x},${z}`);
    assert.ok(!tree({ x, z, s: 1.35 }), `停车地块或交通主线出现通用树木 ${x},${z}`);
  }
  assert.ok(!tree({ x: -486, z: -180, s: 1.35 }), '树干在界外但树冠越入停车地块');
  assert.ok(tree({ x: -490, z: -180, s: 1.35 }), '仍应保留界外安全绿化');
  assert.ok(lamp(-490, -180), '仍应保留界外路灯');
});

test('背景城市楼按完整楼体避让停车场、入口车道与步行轴且不因删除邻楼而重排', () => {
  const empty = { buildings: [], site: {}, extensions: {} };
  const all = siteContextBuildings(empty);
  assert.equal(all.length, 52);
  const edgeStrip = b => rectPoly(rect(b.x + b.w / 2 - 1, b.z - 1, b.x + b.w / 2 + 5, b.z + 1));
  const boundary = rectPoly(rect(-484, -250, -301, -33));
  // These exclusions touch facade corners while all three building centers
  // remain outside; a center-only collision test would miss the conflict.
  const layout = { buildings: [], site: { westParking: { poly: boundary }, driveways: [edgeStrip(all[0])] }, extensions: {
    roads: [{ polys: [edgeStrip(all[1])] }], paths: [{ kind: 'ground', polys: [edgeStrip(all[2])] }],
  } };
  const reserved = [boundary, ...layout.site.driveways, ...layout.extensions.roads[0].polys, ...layout.extensions.paths[0].polys];
  const remaining = siteContextBuildings(layout);
  assert.ok(remaining.length >= 40, '应保留周边城市环境');
  for (const b of remaining) {
    assert.deepEqual(b, all.find(old => old.id === b.id), '避让一栋楼不应改变其他楼的尺寸或配色');
    const footprint = rectPoly(rect(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2));
    assert.ok(reserved.every(poly => !convexOverlap(footprint, poly)), `背景楼 ${b.id} 越入保留地块`);
  }
  for (const id of [0, 1, 2]) assert.ok(!remaining.some(b => b.id === id), `中心未重叠的 ${id} 号楼仍压入口或步行轴`);

  const actualReserved = [...L.site.activityExclusions, ...L.site.driveways,
    ...L.site.roads.map(r => r.poly), ...L.site.sidewalks.map(r => r.poly),
    ...L.extensions.surfaceParking.map(p => p.poly), ...L.extensions.roads.flatMap(r => r.polys),
    ...L.extensions.paths.filter(p => p.kind === 'ground').flatMap(p => p.polys),
    ...(L.site.westParking?.poly ? [L.site.westParking.poly] : [])];
  const actual = siteContextBuildings(L);
  assert.ok(actual.length >= 35);
  for (const b of actual) {
    const footprint = rectPoly(rect(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2));
    assert.ok(actualReserved.every(poly => !convexOverlap(footprint, poly)), `实际背景楼 ${b.id} 占用停车或交通空间`);
  }
});
