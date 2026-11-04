// 云澜江渲染（Node three）：草地挖去河道、水面全宽、星湾桥构件、栏杆避让桥面、绘制调用与顶点预算、江景台挑台。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, lvl } from './helpers.js';
import { BatchSet } from '../src/render/batch.js';
import { siteGroundHoles } from '../src/render/build/site.js';
import { flatShapeGeometry } from '../src/render/build/shell.js';
import { cutSurfaceShapes } from '../src/render/build/surface-shapes.js';
import { buildUrbanDistrict } from '../src/render/build/urban.js';
import { buildRiver, riverBridgeParts, riverRailRuns, archY } from '../src/render/build/river.js';
import { buildRiverTerrace, maskRects } from '../src/render/build/riverfront.js';
import { buildP1ExpansionExterior } from '../src/render/build/p1-expansion.js';
import { streetLanes } from '../src/render/build/traffic.js';
import { skywalk } from '../src/render/build/roof.js';
import { pointInPoly, polyBounds } from '../src/layout/geom.js';

const R = L.site.river;
const inChannel = (x, z) => z > -436 && z < -290 && x > -1500 && x < 1500;
const vertices = batch => Object.values(batch.sets).reduce((n, b) => n + b.n, 0);
function context() {
  const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, name: String(k) }) });
  const floor = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, name: 'floor' });
  const levels = Object.fromEntries(L.levels.map(lv => [lv.id, {
    lv, base: new THREE.Group(), shell: new THREE.Group(), facade: new THREE.Group(),
    batch: new BatchSet(materials), shellBatch: new BatchSet(materials), facadeBatch: new BatchSet(materials),
  }]));
  return { layout: L, materials, levels, mats: { base: materials, floor: () => floor, onNight: () => {} },
    site: { group: new THREE.Group(), batch: new BatchSet(materials), labels: new THREE.Group(), picks: new THREE.Group() } };
}
const triangles = mesh => {
  const g = mesh.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
  return mesh.isInstancedMesh ? n * mesh.count : n;
};

test('草地沿堤顶挖去整条河道，没有一个三角形落在河道里', () => {
  const holes = siteGroundHoles(L);
  assert.ok(holes.includes(R.channel));
  const g = flatShapeGeometry(cutSurfaceShapes([[-1500, -1500], [1500, -1500], [1500, 1500], [-1500, 1500]], holes), -0.32);
  const p = g.attributes.position, idx = g.index;
  let inside = 0, n = 0;
  for (let i = 0; i < (idx ? idx.count : p.count); i += 3) {
    const k = [0, 1, 2].map(j => idx ? idx.getX(i + j) : i + j);
    const cx = k.reduce((s, j) => s + p.getX(j), 0) / 3, cz = k.reduce((s, j) => s + p.getZ(j), 0) / 3;
    if (inChannel(cx, cz)) inside++;
    n++;
  }
  assert.ok(n > 100);
  assert.equal(inside, 0, `${inside} 个草地三角形在河道里`);
  g.dispose();
});

test('星湾桥：两条拱肋各 28 段，吊杆 ≥ 40 且挑台开口内没有吊杆，三道风撑高于 25 m；四座梁桥各两排桥墩', () => {
  const parts = riverBridgeParts(R), xw = R.bridges.find(b => b.id === 'XW-BR');
  const of = role => parts.filter(p => p.bridge === 'XW-BR' && p.role === role);
  const ribs = of('rib');
  assert.equal(ribs.length, 56);
  for (const x of [-17, 17]) assert.equal(ribs.filter(p => p.a.x === x).length, 28);
  const crown = Math.max(...ribs.map(p => Math.max(p.a.y, p.b.y)));
  assert.ok(crown > 30 && crown < 31.5, `拱顶 ${crown}`);
  assert.ok(Math.abs(archY(xw, xw.deck.z0) - (xw.deckTop + .9)) < 1e-9 && Math.abs(archY(xw, xw.deck.z1) - (xw.deckTop + .9)) < 1e-9);
  const hangers = of('hanger');
  assert.ok(hangers.length >= 40, `${hangers.length} 根吊杆`);
  for (const h of hangers) for (const r of xw.lookouts) assert.ok(!(h.a.z >= r.z0 - .01 && h.a.z <= r.z1 + .01), `挑台开口内有吊杆 z ${h.a.z}`);
  const struts = of('strut');
  assert.equal(struts.length, 3);
  for (const s of struts) assert.ok(s.y > 25 && s.w >= 33.9);
  // The walk-edge balustrade stops at both lookout mouths and the lookouts carry their own glass on three sides.
  for (const r of xw.lookouts) {
    const mouth = r.x0 < 0 ? r.x1 : r.x0;
    for (const b of of('balustrade').filter(p => Math.abs(p.x - mouth) < .01)) assert.ok(b.z + b.d / 2 <= r.z0 + .01 || b.z - b.d / 2 >= r.z1 - .01, '护栏封住挑台入口');
    assert.equal(of('lookout-rail').filter(p => p.x >= r.x0 - .01 && p.x <= r.x1 + .01 && p.z >= r.z0 - .01 && p.z <= r.z1 + .01).length, 3);
  }
  // Crash barriers and name plates are drawn on the layout's footprints, which nav treats as obstacles.
  const foot = p => ({ x0: p.x - p.w / 2, z0: p.z - p.d / 2, x1: p.x + p.w / 2, z1: p.z + p.d / 2 });
  const near = (a, b) => ['x0', 'z0', 'x1', 'z1'].every(k => Math.abs(a[k] - b[k]) < 1e-9);
  for (const [role, list] of [['barrier', xw.barriers], ['nameplate', xw.nameplates]]) {
    assert.equal(of(role).length, list.length);
    for (const r of list) assert.ok(of(role).some(p => near(foot(p), r)), `${role} ${JSON.stringify(r)}`);
    for (const r of list) assert.ok(R.obstacles.some(o => near(polyBounds(o.poly), r)), `${role} 不是导航障碍`);
  }
  assert.equal(of('nameplate-plaque').length, 4);
  for (const b of R.bridges.filter(b => b.kind === 'girder')) {
    const piers = parts.filter(p => p.bridge === b.id && p.role === 'pier');
    assert.equal(piers.length, 4);
    for (const p of piers) assert.ok(p.z > -436 && p.z < -290 && p.y + p.h / 2 < b.soffit);
  }
});

test('南岸玻璃栏杆 7 段，避开五座桥面与江景玻璃眺台；星湾路车流跨过星湾桥', () => {
  const runs = riverRailRuns(R);
  assert.equal(runs.length, 7);
  for (const [a, b] of runs) {
    for (const br of R.bridges) assert.ok(b <= br.deck.x0 + 1e-9 || a >= br.deck.x1 - 1e-9, `栏杆穿过 ${br.id}`);
    for (const l of R.lookouts) assert.ok(b <= l.rect.x0 + 1e-9 || a >= l.rect.x1 - 1e-9, '栏杆穿过眺台');
  }
  assert.deepEqual([runs[0][0], runs[runs.length - 1][1]], [R.render.x0, R.render.x1]);
  const lanes = streetLanes(L).filter(l => l.axis === 'z' && Math.abs(l.c) < 10);
  assert.equal(lanes.length, 4);
  for (const l of lanes) assert.deepEqual([l.a0, l.n], [-500, 7]);
  assert.ok(streetLanes({ site: {} }).filter(l => l.axis === 'z' && Math.abs(l.c) < 10).every(l => l.a0 === -300 && l.n === 5));
  assert.equal(typeof skywalk, 'function');
});

test('河道渲染：水面覆盖 ±1500 且排在玻璃之前，新增绘制调用 ≤ 12、三角形 ≤ 9 万、批次顶点 < 12 万，芦苇 ≤ 600 株', () => {
  const ctx = context();
  // The real base water is transparent (materials.js); the river clone must not inherit that.
  Object.assign(ctx.materials.water, { transparent: true, opacity: .9 });
  buildUrbanDistrict(ctx);
  const keysBefore = new Set(Object.keys(ctx.site.batch.sets)), verticesBefore = vertices(ctx.site.batch);
  const childrenBefore = ctx.site.group.children.length;
  const out = buildRiver(ctx);
  const added = ctx.site.group.children.slice(childrenBefore);
  assert.deepEqual(new Set(added), new Set(out.meshes));
  const water = added.find(m => m.name === 'river-water');
  water.geometry.computeBoundingBox();
  const bb = water.geometry.boundingBox;
  assert.ok(bb.min.x <= -1500 && bb.max.x >= 1500 && Math.abs(bb.min.y - R.water.y) < 1e-6);
  assert.equal(water.renderOrder, 1);
  // Opaque, so it draws in the opaque pass before every transparent pane: the glass key (renderOrder 2) and
  // the curtain-wall/window glassTint batches (renderOrder 0, no depth write) both composite over it.
  assert.equal(water.material.transparent, false);
  assert.equal(water.material.opacity, 1);
  assert.notEqual(water.material, ctx.materials.water);
  const reeds = added.find(m => m.name === 'river-reeds');
  assert.ok(reeds.isInstancedMesh && reeds.count <= 600 && reeds.count >= 450, `${reeds.count} 株芦苇`);
  // Site batch keys the river uses all exist in the site batch already (glass, glow, stone come from
  // the entrances, lamps and city plinths), so the batch itself adds no draw call.
  const siteKeys = new Set([...keysBefore, 'glass', 'glow', 'extSatin', 'foliage', 'wood', 'stone', 'water']);
  const newKeys = Object.keys(ctx.site.batch.sets).filter(k => !siteKeys.has(k));
  assert.deepEqual(newKeys, []);
  const drawCalls = added.length + newKeys.length;
  assert.ok(drawCalls <= 12, `${drawCalls} 次绘制调用`);
  const batchVertices = vertices(ctx.site.batch) - verticesBefore;
  assert.ok(batchVertices < 120000, `${batchVertices} 个批次顶点`);
  const tris = added.reduce((s, m) => s + triangles(m), 0) + batchVertices / 3;
  if (process.env.RIVER_COST) console.log(Object.fromEntries([...added.map(m => [m.name || m.geometry.type, triangles(m)]), ...Object.entries(ctx.site.batch.sets).map(([k, b]) => [`batch:${k}`, b.n / 3])]));
  assert.ok(tris <= 90000, `${Math.round(tris)} 个三角形`);
  // Glass sorts after the water when the batch is flushed.
  const group = new THREE.Group();
  ctx.site.batch.flush(group);
  const glass = group.children.find(m => m.name === 'glass');
  assert.ok(glass && glass.renderOrder > water.renderOrder);
  // Bridge sidewalks show their paving: the first surface under a walker is the paving at -0.135, not the
  // deck slab (星湾桥 and a girder bridge alike).
  const surfaces = [...ctx.site.group.children, ...group.children].filter(m => m.isMesh && !m.isInstancedMesh);
  for (const [x, z] of [[13, -340], [-13, -400], [527, -340]]) {
    const hits = new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0), 0, 1.5).intersectObjects(surfaces, false);
    assert.ok(hits.length >= 2, `(${x}, ${z}) ${hits.length} 个面`);
    assert.equal(hits[0].object.material.name, 'floor', `(${x}, ${z}) 最上层是 ${hits[0].object.name}@${hits[0].point.y.toFixed(3)}`);
    assert.ok(Math.abs(hits[0].point.y - -0.135) < 1e-6 && hits[1].point.y <= -0.14 + 1e-6, `(${x}, ${z}) ${hits.slice(0, 2).map(h => h.point.y.toFixed(3))}`);
  }
  group.traverse(m => m.geometry?.dispose());
  for (const m of added) m.geometry.dispose();
});

test('立体字栅格合并成矩形后不多不少覆盖全部亮像素', () => {
  const w = 9, h = 6, lit = new Set(['1,0', '2,0', '1,1', '2,1', '1,2', '2,2', '5,1', '6,1', '7,1', '5,2', '6,2', '7,2', '4,4', '8,5']);
  const mask = { data: new Uint8Array(w * h * 4) };
  for (const k of lit) { const [i, j] = k.split(',').map(Number); mask.data[(j * w + i) * 4] = 255; }
  const rects = maskRects(mask, w, h), covered = new Map();
  for (const r of rects) for (let i = r.i0; i < r.i1; i++) for (let j = r.j0; j < r.j1; j++) covered.set(`${i},${j}`, (covered.get(`${i},${j}`) || 0) + 1);
  assert.deepEqual([...covered.keys()].sort(), [...lit].sort());
  assert.ok([...covered.values()].every(n => n === 1));
  assert.equal(rects.length, 4);
});

test('江景台：托架、封边、两座玻璃挑台全部进 P1-3F 已有批次，挑台下没有铺装或楼板，挑台玻璃存在', () => {
  const ctx = context(), lv = lvl('P1-3F'), Lv = ctx.levels[lv.id];
  buildP1ExpansionExterior(ctx);
  const shellKeys = new Set(Object.keys(Lv.shellBatch.sets)), facadeKeys = new Set(Object.keys(Lv.facadeBatch.sets));
  const before = vertices(Lv.shellBatch) + vertices(Lv.facadeBatch);
  const out = buildRiverTerrace(ctx);
  assert.equal(out.prows, 2);
  for (const k of Object.keys(Lv.shellBatch.sets)) assert.ok(shellKeys.has(k), `P1-3F shellBatch 新增材质 ${k}`);
  for (const k of Object.keys(Lv.facadeBatch.sets)) assert.ok(facadeKeys.has(k), `P1-3F facadeBatch 新增材质 ${k}`);
  const added = vertices(Lv.shellBatch) + vertices(Lv.facadeBatch) - before;
  assert.ok(added > 1000 && added < 120000, `${added} 个顶点`);
  Lv.shellBatch.flush(Lv.shell);
  Lv.shell.updateMatrixWorld(true);
  const meshes = [];
  Lv.shell.traverse(m => { if (m.isMesh) meshes.push(m); });
  for (const p of lv.riverTerrace.prows) {
    const cx = (p.rect.x0 + p.rect.x1) / 2;
    for (const cz of [-253, -254.5]) {
      const hits = new THREE.Raycaster(new THREE.Vector3(cx, lv.elev + .6, cz), new THREE.Vector3(0, -1, 0), 0, .7).intersectObjects(meshes, false);
      assert.ok(hits.length > 0, `${p.id} 没有玻璃地面`);
      assert.ok(hits.every(h => ['glass', 'extMetal'].includes(h.object.name)), `${p.id} 下有 ${hits.map(h => h.object.name)}`);
    }
    assert.ok(!lv.slab.pieces.some(s => pointInPoly([cx, -254], s.outer)), `${p.id} 下有楼板`);
  }
  // The stone deck is paved: a ray at the gap deck hits terrace paving.
  const deck = new THREE.Raycaster(new THREE.Vector3(-235, lv.elev + .6, -246), new THREE.Vector3(0, -1, 0), 0, .7).intersectObjects(meshes, false);
  assert.ok(deck.some(h => ['p1TerracePaving', 'facadeStone'].includes(h.object.name)), `江景台石材面层缺失 ${deck.map(h => h.object.name)}`);
  Lv.shell.traverse(m => m.geometry?.dispose());
});
