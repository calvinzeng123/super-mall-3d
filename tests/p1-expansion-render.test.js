import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLayout } from '../src/layout/layout.js';
import { rect, rectPoly, pointInPoly, toW, toL, distToPolyEdge, polyBounds } from '../src/layout/geom.js';
import { BatchSet, SignBatch } from '../src/render/batch.js';
import { buildShell } from '../src/render/build/shell.js';
import { buildRooms } from '../src/render/build/rooms.js';
import { buildWalls } from '../src/render/build/walls.js';
import { buildStorefronts } from '../src/render/build/storefronts.js';
import { buildInteriors } from '../src/render/build/interiors.js';
import { buildP1ExpansionExterior, buildP1ExpansionLevel, expansionFacadeEdges, expansionTerraceEdges,
  expansionTerraceSites, usesExpansionFacade, buildP1PublicFixture } from '../src/render/build/p1-expansion.js';

function context(layout) {
  return { layout, mats: { floor: () => new THREE.MeshBasicMaterial() }, levels: Object.fromEntries(layout.levels.map(lv => [lv.id, {
    lv, batch: new BatchSet({}), shellBatch: new BatchSet({}), facadeBatch: new BatchSet({}),
  }])) };
}
const vertices = batch => Object.values(batch.sets).reduce((n, b) => n + b.n, 0);
function meshes(batch, material) {
  return Object.values(batch.sets).map(b => b.mesh(material)).filter(Boolean).map(m => { m.updateMatrixWorld(true); return m; });
}
const dispose = list => list.forEach(m => m.geometry.dispose());

function renderedContext(layout) {
  const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) });
  const ctx = context(layout), floor = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  ctx.mats = { base: materials, floor: () => floor, onNight: () => {} };
  ctx.bById = Object.fromEntries(layout.buildings.map(b => [b.id, b]));
  ctx.atlas = Object.fromEntries(layout.levels.map(lv => [lv.id, { cell: () => null }]));
  for (const L of Object.values(ctx.levels)) Object.assign(L, {
    base: new THREE.Group(), shell: new THREE.Group(), facade: new THREE.Group(), signs: new SignBatch(), facadeSigns: new SignBatch(),
    batch: new BatchSet(materials), shellBatch: new BatchSet(materials), facadeBatch: new BatchSet(materials),
  });
  ctx.buildings = Object.fromEntries(layout.buildings.map(b => [b.id, { b, levels: layout.levels.filter(lv => lv.building === b.id).map(lv => ctx.levels[lv.id]) }]));
  ctx.finish = () => {
    for (const L of Object.values(ctx.levels)) {
      L.batch.flush(L.base); L.shellBatch.flush(L.shell); L.facadeBatch.flush(L.facade);
      for (const group of [L.base, L.shell, L.facade]) group.updateMatrixWorld(true);
    }
  };
  ctx.cleanup = () => {
    const geometries = new Set();
    for (const L of Object.values(ctx.levels)) for (const group of [L.base, L.shell, L.facade]) group.traverse(m => { if (m.geometry) geometries.add(m.geometry); });
    for (const geometry of geometries) geometry.dispose();
    for (const material of Object.values(materials)) material.dispose();
    floor.dispose();
  };
  return ctx;
}
function allMeshes(ctx, bid) {
  const out = [];
  for (const L of Object.values(ctx.levels).filter(L => !bid || L.lv.building === bid)) for (const g of [L.base, L.shell, L.facade]) g.traverse(m => { if (m.isMesh) out.push(m); });
  return out;
}

// Extract the actual instanced/batched triangles inside a local audit volume.
// This is independent of the layout's collision boxes and includes floor skins,
// facade fins, room furnishings and roof furniture when they cross the route.
function meshSubset(source, bounds, material) {
  const pos = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = new THREE.Triangle(a, b, c), matrix = new THREE.Matrix4(), instance = new THREE.Matrix4();
  for (const mesh of source) {
    const p = mesh.geometry.attributes.position, indices = mesh.geometry.index;
    for (let j = 0; j < (mesh.isInstancedMesh ? mesh.count : 1); j++) {
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(j, instance); matrix.multiplyMatrices(mesh.matrixWorld, instance); }
      else matrix.copy(mesh.matrixWorld);
      for (let i = 0; i < (indices?.count || p.count); i += 3) {
        a.fromBufferAttribute(p, indices ? indices.getX(i) : i).applyMatrix4(matrix);
        b.fromBufferAttribute(p, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(matrix);
        c.fromBufferAttribute(p, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(matrix);
        if (!bounds.intersectsTriangle(tri)) continue;
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    }
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, material); m.updateMatrixWorld(true); return m;
}

function bodyClear(mesh, p, name) {
  const rays = [];
  for (const [dx, dz] of [[0, 0], [.24, 0], [-.24, 0], [0, .24], [0, -.24]])
    rays.push(new THREE.Raycaster(new THREE.Vector3(p.x + dx, p.y + .35, p.z + dz), new THREE.Vector3(0, 1, 0), 0, 1.7));
  for (const h of [.7, 1.35, 1.95]) {
    rays.push(new THREE.Raycaster(new THREE.Vector3(p.x - .24, p.y + h, p.z), new THREE.Vector3(1, 0, 0), 0, .48));
    rays.push(new THREE.Raycaster(new THREE.Vector3(p.x, p.y + h, p.z - .24), new THREE.Vector3(0, 0, 1), 0, .48));
  }
  for (const ray of rays) {
    const hit = ray.intersectObject(mesh, false)[0];
    assert.ok(!hit, `${name} 身体或头部碰到真实网格 ${hit?.point.toArray().map(n => n.toFixed(3))}; 脚点 ${JSON.stringify(p)}`);
  }
}

test('一期扩建立面实际三角网格在桥门、地面门和内退露台门保留完整行人净空', () => {
  const layout = buildLayout(), ctx = context(layout), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  buildP1ExpansionExterior(ctx);
  let checked = 0;
  for (const lv of layout.levels.filter(usesExpansionFacade)) {
    const facade = meshes(ctx.levels[lv.id].facadeBatch, material);
    for (const e of expansionFacadeEdges(lv, layout.entrances)) for (const [a, b] of e.gaps) {
      if (a < -.2 || b > e.len + .2) continue;
      for (const t of [.18, .5, .82]) for (const dy of [.5, 1.1, 1.75, 2.3]) {
        const u = a + (b - a) * t, start = toW(e.F, u, -1), end = toW(e.F, u, 1.3);
        const origin = new THREE.Vector3(start[0], lv.elev + dy, start[1]);
        const target = new THREE.Vector3(end[0], lv.elev + dy, end[1]);
        const ray = new THREE.Raycaster(origin, target.clone().sub(origin).normalize(), 0, origin.distanceTo(target));
        assert.equal(ray.intersectObjects(facade, false).length, 0, `${lv.id} 的入口被幕墙/构件封堵：${u},${dy}`);
        checked++;
      }
    }
    dispose(facade);
  }
  material.dispose();
  assert.ok(checked > 500, `仅检查 ${checked} 个入口人体采样点`);
});

test('露台栏杆只沿真实楼板落差；与室内相接的共享边保持开放', () => {
  const outer = rectPoly(rect(-10, -8, 10, 8));
  const terrace = rectPoly(rect(6, -8, 10, 8));
  const lv = { id: 'TEST-4F', elev: 17.5, kind: 'retail', outline: outer, voids: [],
    slab: { pieces: [{ outer, holes: [] }] }, expansion: { terraces: [terrace] } };
  const edges = expansionTerraceEdges(lv);
  assert.equal(edges.length, 3);
  assert.ok(edges.every(e => Math.abs(e.mid[0] - 6) > .01), '室内与露台之间误加栏杆');
  for (const e of edges) {
    assert.ok(pointInPoly(toW(e.F, e.len / 2, -.18), outer));
    assert.ok(!pointInPoly(toW(e.F, e.len / 2, .18), outer));
  }
});

test('露台铺装不补回楼板核心洞口，家具留在实板上并避让门前', () => {
  const outer = rectPoly(rect(-12, -10, 12, 10)), hole = rectPoly(rect(-2, -2, 2, 2));
  const lv = { id: 'T-RF', building: 'T', short: 'RF', elev: 12, height: 4, kind: 'roof', outline: outer,
    units: [], rooms: [], features: [], walk: [], voids: [{ kind: 'shaft', poly: hole }],
    slab: { pieces: [{ outer, holes: [hole] }] }, expansion: { zone: 'garden', terraces: [outer], facadePoly: outer } };
  const en = { id: 'door', level: lv.id, seg: { x0: -2, z0: -10, x1: 2, z1: -10 } };
  const ctx = context({ levels: [lv], entrances: [en] });
  buildP1ExpansionExterior(ctx);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), shell = meshes(ctx.levels[lv.id].shellBatch, material);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 12.2, 0), new THREE.Vector3(0, -1, 0), 0, 1);
  assert.equal(ray.intersectObjects(shell, false).length, 0, '露台面层把电梯洞盖住');
  const supported = new THREE.Raycaster(new THREE.Vector3(4.5, 12.2, 4.5), new THREE.Vector3(0, -1, 0), 0, 1);
  assert.ok(supported.intersectObjects(shell, false).length > 0, '正常露台面层消失');
  for (const s of expansionTerraceSites(lv, [en])) {
    assert.ok(pointInPoly([s.x, s.z], outer) && !pointInPoly([s.x, s.z], hole));
    assert.ok(distToPolyEdge([s.x, s.z], outer) >= 1.7);
  }
  dispose(shell); material.dispose();
});

test('扩建外壳保持有界顶点预算，室内重建不改永久外壳，FPS 不生成新几何', () => {
  const layout = buildLayout(), ctx = context(layout);
  buildP1ExpansionExterior(ctx);
  let count = 0, inside = 0;
  for (const lv of layout.levels.filter(lv => lv.expansion)) {
    const L = ctx.levels[lv.id], before = vertices(L.shellBatch) + vertices(L.facadeBatch);
    buildP1ExpansionLevel(ctx, lv);
    assert.equal(vertices(L.shellBatch) + vertices(L.facadeBatch), before);
    count += before; inside += vertices(L.batch);
    for (const batch of [L.shellBatch, L.facadeBatch, L.batch]) for (const b of Object.values(batch.sets))
      assert.ok(b.pos.subarray(0, b.n * 3).every(Number.isFinite), `${lv.id} 非有限几何`);
  }
  assert.ok(count > 100000 && count < 850000, `扩建永久几何 ${count} 顶点`);
  assert.ok(inside > 20000 && inside < 400000, `扩建室内附加几何 ${inside} 顶点`);
  assert.ok(Object.values(ctx.levels).every(L => vertices(L.batch) < 36000), '单层公共陈设超过流式预算');
  const compact = context({ ...layout, playable: true });
  buildP1ExpansionExterior(compact);
  for (const lv of layout.levels) buildP1ExpansionLevel(compact, lv);
  assert.ok(Object.values(compact.levels).every(L => !vertices(L.batch) && !vertices(L.shellBatch) && !vertices(L.facadeBatch)));
});

test('下沉庭院北侧地库通道和南侧真实楼梯口净空；地面北缘仍有防护栏', () => {
  const layout = buildLayout(), ctx = context(layout), court = layout.expansion.sunkenCourt;
  assert.ok(court);
  buildP1ExpansionExterior(ctx);
  const L = ctx.levels[court.level], material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const shell = meshes(L.shellBatch, material);
  const cross = (x, y, z) => new THREE.Raycaster(new THREE.Vector3(x, y, z - 1), new THREE.Vector3(0, 0, 1), 0, 2).intersectObjects(shell, false);
  for (const dx of [-1.4, 0, 1.4]) {
    assert.equal(cross(-108.5 + dx, court.elev + 1.65, court.bounds.z0).length, 0, '北侧 B1M 入口封堵');
    assert.equal(cross(court.stair.top.x + dx, .7, court.bounds.z1).length, 0, '南侧楼梯出口被护栏封堵');
  }
  assert.ok(cross(-108.5, .7, court.bounds.z0).length > 0, '地面北侧落差缺少护栏');
  for (const dz of [-1.8, 0, 1.8]) for (const h of [.5, 1.65, 2.3]) {
    const east = new THREE.Raycaster(new THREE.Vector3(-87, court.elev + h, -38.5 + dz), new THREE.Vector3(1, 0, 0), 0, 2);
    assert.equal(east.intersectObjects(shell, false).length, 0, '东侧地铁通廊入口封堵');
  }
  const before = vertices(L.shellBatch);
  buildP1ExpansionLevel(ctx, layout.levels.find(l => l.id === court.level));
  assert.equal(vertices(L.shellBatch), before);
  assert.ok(vertices(L.batch) > 500, '下沉院未生成阶梯座椅和植物');
  dispose(shell); material.dispose();
});

test('西门新增横向门厅的真实隔墙、店铺陈设和立面保留整段通行净空', t => {
  const previousDocument = globalThis.document;
  const paint = new Proxy({}, { get: (p,k) => k in p ? p[k] : k === 'measureText' ? () => ({width:10}) : String(k).startsWith('create') ? () => ({addColorStop(){}}) : () => {}, set: (p,k,v) => {p[k]=v;return true;} });
  globalThis.document = {createElement:()=>({width:0,height:0,getContext:()=>paint})};
  t.after(() => { if(previousDocument)globalThis.document=previousDocument;else delete globalThis.document; });
  const full = buildLayout(), D = full.expansion.westArrival;
  const layout = { ...full, expansion: null, buildings: full.buildings.filter(b => b.id === 'P1'), levels: full.levels.filter(lv => lv.id === 'P1-1F') };
  const ctx = renderedContext(layout);
  ctx.dynamic = []; ctx.mats.screen = () => ctx.mats.base.screen;
  buildShell(ctx); buildRooms(ctx); buildWalls(ctx); buildStorefronts(ctx); buildInteriors(ctx); buildP1ExpansionExterior(ctx);
  buildP1ExpansionLevel(ctx, layout.levels[0]); ctx.finish();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), r = polyBounds(D.hall);
  const solid = meshSubset(allMeshes(ctx), new THREE.Box3(new THREE.Vector3(r.x0 - 2, 0, r.z0 - 2), new THREE.Vector3(r.x1 + 2, 2.5, r.z1 + 2)), material);
  const F = layout.buildings[0].wings.find(w => w.id === 'NW').F;
  for (const u of [83, 84.25, 85.5]) for (let v = -25; v <= -3; v += .5) {
    const [x,z] = toW(F,u,v); bodyClear(solid,{x,y:0,z},'P1-WEST-ART');
  }
  solid.geometry.dispose(); material.dispose(); ctx.cleanup();
});

test('八座附楼所有连续梯段、平台和RF出口避开真实楼板、幕墙、内装及坡屋顶', () => {
  const full = buildLayout(), buildings = full.buildings.filter(b => b.kind === 'annex'), bids = new Set(buildings.map(b => b.id));
  const layout = { ...full, expansion: null, buildings, levels: full.levels.filter(lv => bids.has(lv.building)),
    stairs: full.stairs.filter(s => bids.has(s.building)) };
  const ctx = renderedContext(layout);
  buildShell(ctx); buildRooms(ctx); buildWalls(ctx); buildStorefronts(ctx); buildInteriors(ctx); buildP1ExpansionExterior(ctx);
  for (const lv of layout.levels) buildP1ExpansionLevel(ctx, lv);
  ctx.finish();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  let samples = 0;
  for (const building of buildings) for (const stair of layout.stairs.filter(s => s.building === building.id)) {
    const r = polyBounds(stair.poly), bounds = new THREE.Box3(new THREE.Vector3(r.x0 - 1, -1, r.z0 - 1), new THREE.Vector3(r.x1 + 1, 55, r.z1 + 1));
    const solid = meshSubset(allMeshes(ctx, building.id), bounds, material);
    for (const flight of building.access.flights.filter(f => f.stair === stair.id)) {
      const n = Math.ceil(flight.run / .5);
      for (let i = 1; i < n; i++) {
        const t = i / n, p = { x: flight.bottom.x + (flight.top.x - flight.bottom.x) * t,
          y: flight.bottom.y + flight.rise * t, z: flight.bottom.z + (flight.top.z - flight.bottom.z) * t };
        bodyClear(solid, p, flight.id); samples++;
      }
    }
    for (const route of building.access.routes.filter(r => r.stair === stair.id)) for (const p of route.waypoints) {
      bodyClear(solid, p, route.id); samples++;
    }
    solid.geometry.dispose();
  }
  for (const lv of layout.levels.filter(l => l.kind !== 'roof' && l.expansion.terraces.length)) {
    const L = ctx.levels[lv.id], source = [...L.base.children, ...L.shell.children, ...L.facade.children];
    for (const e of layout.entrances.filter(e => e.level === lv.id && e.id.startsWith(`${lv.id}-inner-`))) {
      const x = (e.seg.x0 + e.seg.x1) / 2, z = (e.seg.z0 + e.seg.z1) / 2;
      const bounds = new THREE.Box3(new THREE.Vector3(x - 2, lv.elev, z - 2), new THREE.Vector3(x + 2, lv.elev + 2.5, z + 2));
      const solid = meshSubset(source, bounds, material);
      for (const d of [-.6, 0, .6]) bodyClear(solid, { x: x + e.nx * d, y: lv.elev, z: z + e.nz * d }, e.id);
      solid.geometry.dispose();
    }
  }
  material.dispose(); ctx.cleanup();
  assert.ok(samples > 1000, `仅检查 ${samples} 个身体姿态`);
});

test('主楼3–6F真实退台门不会被商铺隔墙或陈设二次堵住', () => {
  const full = buildLayout(), levels = full.levels.filter(lv => lv.building === 'P1' && lv.expansion && lv.kind !== 'roof');
  const layout = { ...full, expansion: null, buildings: full.buildings.filter(b => b.id === 'P1'), levels };
  const ctx = renderedContext(layout);
  buildRooms(ctx); buildWalls(ctx); buildStorefronts(ctx); buildInteriors(ctx); buildP1ExpansionExterior(ctx);
  for (const lv of levels) buildP1ExpansionLevel(ctx, lv);
  ctx.finish();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const e of layout.entrances.filter(e => e.id.endsWith('-terrace-door'))) {
    const L = ctx.levels[e.level]; if (!L) continue;
    const x = (e.seg.x0 + e.seg.x1) / 2, z = (e.seg.z0 + e.seg.z1) / 2, y = L.lv.elev;
    const solid = meshSubset([...L.base.children, ...L.shell.children, ...L.facade.children],
      new THREE.Box3(new THREE.Vector3(x - 2, y, z - 2), new THREE.Vector3(x + 2, y + 2.5, z + 2)), material);
    for (const d of [-.7, -.3, 0, .3, .7]) bodyClear(solid, { x: x + e.nx * d, y, z: z + e.nz * d }, e.id);
    solid.geometry.dispose();
  }
  material.dispose(); ctx.cleanup();
});

test('真实退台楼板以外不悬挂下层旧范围生成的天花灯具', () => {
  const outer = rectPoly(rect(-10, -10, 10, 10)), upper = rectPoly(rect(-3, -10, 10, 10));
  const level = (id, elev, poly) => ({ id, building: 'QA', short: id, kind: 'retail', elev, height: 5.5,
    theme: { key: 'culture', floor: 'stone' }, outline: poly, slab: { pieces: [{ outer: poly, holes: [] }] },
    units: [], rooms: [], voids: [], features: [], walk: [{ poly, kind: 'gallery' }], expansion: { zone: 'culture' } });
  const ground = level('1F', 0, outer), above = level('2F', 5.5, upper);
  const ctx = renderedContext({ levels: [ground, above], buildings: [{ id: 'QA', kind: 'annex', wings: [], rotundas: [] }], escalators: [], elevators: [], entrances: [] });
  buildShell(ctx);
  const light = ctx.levels['2F'].batch.sets.glow;
  assert.ok(light?.n > 50);
  for (let i = 0; i < light.n; i++) assert.ok(pointInPoly([light.pos[i * 3], light.pos[i * 3 + 2]], upper), '退台上方残留悬空灯具');
  ctx.cleanup();
});

test('附楼紧凑卫生间实际门洞可进，两间厕位可达且家具不越出房间', () => {
  const full = buildLayout();
  const publicRooms = full.levels.flatMap(lv => lv.rooms.filter(r => r.publicAccess).map(room => ({ lv, room })));
  assert.ok(publicRooms.length >= 10);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const { lv, room } of publicRooms) {
    const level = { ...lv, units: [], rooms: [room], walk: [], voids: [] };
    const building = { ...full.buildings.find(b => b.id === lv.building), access: null };
    const layout = { ...full, buildings: [building], levels: [level], stairs: [], elevators: [] };
    const ctx = renderedContext(layout);
    buildRooms(ctx);
    for (const b of Object.values(ctx.levels[lv.id].batch.sets)) for (let i = 0; i < b.n; i++) {
      const p = toL(room.frame, b.pos[i * 3], b.pos[i * 3 + 2]), r = room.rects[0];
      assert.ok(p[0] >= r.x0 - .01 && p[0] <= r.x1 + .01 && p[1] >= r.z0 - .01 && p[1] <= r.z1 + .01, `${room.id} 陈设穿出实体墙：${p}`);
    }
    buildWalls(ctx); ctx.finish();
    const r = room.rects[0], solid = meshSubset(allMeshes(ctx), new THREE.Box3(new THREE.Vector3(r.x0 - 1, lv.elev, r.z0 - 1), new THREE.Vector3(r.x1 + 1, lv.elev + 3.5, r.z1 + 1)), material);
    const door = room.wdoors[0], mx = (door.x0 + door.x1) / 2, mz = (door.z0 + door.z1) / 2;
    for (const d of [-.7, 0, .7, 1.3]) bodyClear(solid, { x: mx, y: lv.elev, z: mz - d }, room.id);
    for (const x of [r.x0 + 1.5, r.x0 + 4.5]) for (const d of [1.3, 1.8, 2.25, 2.8, 3.4])
      bodyClear(solid, { x, y: lv.elev, z: r.z1 - d }, `${room.id} 厕位入口`);
    solid.geometry.dispose(); ctx.cleanup();
  }
  material.dispose();
});

test('艺术穹顶与悬吊雕塑保持在采光开口内，不侵入RF扶梯和屋顶环廊', () => {
  const layout = buildLayout(), ctx = context(layout), lv = layout.levels.find(l => l.id === 'P1-RF');
  buildP1ExpansionExterior(ctx);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), shell = meshes(ctx.levels[lv.id].shellBatch, material);
  const solid = meshSubset(shell, new THREE.Box3(new THREE.Vector3(-160, 25, -160), new THREE.Vector3(-50, 45, -50)), material);
  let checked = 0;
  for (const e of layout.escalators.filter(e => e.to === lv.id)) {
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      bodyClear(solid, { x: e.bottom.x + (e.top.x - e.bottom.x) * t,
        y: e.bottom.y + (e.top.y - e.bottom.y) * t, z: e.bottom.z + (e.top.z - e.bottom.z) * t }, e.id);
      checked++;
    }
  }
  const sky = lv.voids.find(v => v.id === 'C-void'), r = sky.rect;
  for (let x = r.x0 - 1; x <= r.x1 + 1; x += 1) for (const z of [r.z0 - 1, r.z1 + 1]) {
    const p = toW(sky.frame, x, z); bodyClear(solid, { x: p[0], y: lv.elev, z: p[1] }, '穹顶周边步行环廊'); checked++;
  }
  for (let z = r.z0 - 1; z <= r.z1 + 1; z += 1) for (const x of [r.x0 - 1, r.x1 + 1]) {
    const p = toW(sky.frame, x, z); bodyClear(solid, { x: p[0], y: lv.elev, z: p[1] }, '穹顶周边步行环廊'); checked++;
  }
  assert.ok(checked > 100); solid.geometry.dispose(); dispose(shell); material.dispose();
});

test('下沉庭院总览预览有真实台阶和座椅，室内显示、B2聚焦及分层状态不重复漂浮', () => {
  const full = buildLayout(), court = full.expansion.sunkenCourt;
  const layout = { ...full, levels: full.levels.filter(l => [court.level, 'P1-B2'].includes(l.id)), buildings: full.buildings.filter(b => b.id === court.building) };
  const ctx = renderedContext(layout);
  buildP1ExpansionExterior(ctx);
  const L = ctx.levels[court.level], preview = L.sunkenCourtPreview;
  assert.ok(preview?.children.length > 0, '室外庭院没有常驻几何预览');
  const update = ctx.dynamic.find(d => d.name === preview.name).update;
  L.base.visible = false; update(0, 0, { state: {} });
  assert.equal(preview.visible, true, '总览隐藏B1M内装后看不到台阶');
  preview.updateMatrixWorld(true);
  for (const t of [.12, .35, .65, .9]) {
    const f = court.stair, p = { x: f.bottom.x + (f.top.x - f.bottom.x) * t, y: f.bottom.y + f.rise * t, z: f.bottom.z + (f.top.z - f.bottom.z) * t };
    const ray = new THREE.Raycaster(new THREE.Vector3(p.x, p.y + .4, p.z), new THREE.Vector3(0, -1, 0), 0, .7);
    assert.ok(ray.intersectObject(preview, true).length > 0, '预览缺少与导航同源的实体阶梯');
  }
  const seat = court.seats[1], a = seat.poly[12], b = seat.poly[37];
  const ray = new THREE.Raycaster(new THREE.Vector3((a[0] + b[0]) / 2, court.elev + 1.5, (a[1] + b[1]) / 2), new THREE.Vector3(0, -1, 0), 0, 1.4);
  assert.ok(ray.intersectObject(preview, true).length > 0, '总览预览缺少阶梯座椅');
  L.base.visible = true; update(0, 0, { state: {} }); assert.equal(preview.visible, false, '与完整B1M台阶重复');
  L.base.visible = false; update(0, 0, { state: { focus: 'P1-B2' } }); assert.equal(preview.visible, false, 'B2视图中漂浮');
  update(0, 0, { state: { exploded: true } }); assert.equal(preview.visible, false, '分层视图中漂浮');
  ctx.cleanup();
});

test('全部公共陈设实际顶点含椅子、画屏和雕塑均落在同源碰撞安全岛内', () => {
  const layout = buildLayout(); let count = 0, total = 0;
  const kinds = new Set();
  for (const lv of layout.levels) for (const fixture of lv.expansion?.publicFixtures || []) {
    const B = new BatchSet({}); buildP1PublicFixture(B, lv, fixture);
    assert.ok(vertices(B) > 300, `${fixture.id} 未产生完整公共陈设`);
    count++; kinds.add(fixture.kind); total += vertices(B);
    for (const b of Object.values(B.sets)) for (let i = 0; i < b.n; i++) {
      const p = [b.pos[i * 3], b.pos[i * 3 + 2]];
      assert.ok(pointInPoly(p, fixture.poly) || distToPolyEdge(p, fixture.poly) < .001, `${fixture.id} 实体穿出碰撞占地 ${p}`);
      assert.ok(Number.isFinite(b.pos[i * 3 + 1]));
    }
  }
  assert.ok(count >= 80 && kinds.size === 6, `仅有${count}组、${kinds.size}类公共陈设`);
  assert.ok(total < 250000, `公共陈设共${total}顶点`);
});
