// 西苑渲染（Node three）：外壳绘制预算、600 m 远景替身、西库地下大堂、12F 户内陈设预算、西苑场地。
// supertall P0b moved these cases out of community-render.test.js (which keeps the shared ones); the tower package owns this file next.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { frame, rect, rectPoly, lrectPoly, toW, toL, pointInPoly, distToSeg, polyBounds } from '../src/layout/geom.js';
import { BatchSet, SignBatch } from '../src/render/batch.js';
import { buildCommunityTower, coreCells, facadeCoverage, lobbySignSpot, COMMUNITY_FAR_LOD } from '../src/render/build/community.js';
import { buildPublicGarageShells, connections, setHospitalityCut } from '../src/render/build/hospitality.js';
import { buildCommunitySite } from '../src/render/build/community-site.js';
import { buildWestParkingDetails } from '../src/render/build/west-parking.js';
import { buildResidenceFloor, communityFurniture, homePlate } from '../src/render/build/residence-interiors.js';
import { frameMatrix } from '../src/render/batch.js';
import { communityUnit } from '../src/layout/community-units.js';
import { COMMUNITY_PLANS } from '../src/layout/community-plan-data.js';
import { NORTH_SITE } from '../src/layout/community-sites.js';

const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };

const base = new Proxy({}, { get: (m, k) => typeof k === 'string' ? (m[k] ||= Object.assign(new THREE.MeshBasicMaterial(), { name: k })) : undefined });
function context(layout) {
  return { layout, dynamic: [], mats: { base, sign: () => new THREE.MeshBasicMaterial(), onNight: () => {} },
    levels: Object.fromEntries(layout.levels.map((lv) => [lv.id, { lv, base: new THREE.Group(), shell: new THREE.Group() }])),
    buildings: Object.fromEntries(layout.buildings.map((b) => [b.id, { b, group: new THREE.Group() }])),
    hospitality: { buildings: new Map() }, site: { group: new THREE.Group() } };
}
const triangles = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
function visibleMeshes(group) { const out = []; group.traverse((o) => { if (o.isMesh && o.visible) out.push(o); }); return out; }
/** World-space triangles of a mesh as [[x,y,z] × 3]. */
function trianglesOf(mesh) {
  mesh.updateMatrixWorld(true);
  const p = mesh.geometry.attributes.position, idx = mesh.geometry.index, v = new THREE.Vector3(), out = [];
  for (let i = 0; i < (idx ? idx.count : p.count); i += 3) out.push([0, 1, 2].map((k) => v.fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld).toArray()));
  return out;
}

/** Meshes the renderer would draw: the mesh and every ancestor up to `root` visible. */
function drawnMeshes(root) {
  const out = [];
  root.traverse((o) => { if (!o.isMesh) return; for (let q = o; q && q !== root.parent; q = q.parent) if (!q.visible) return; out.push(o); });
  return out;
}
/** World bounds of the meshes' vertices at or above height y0. */
function boundsOf(meshes, y0 = -Infinity) {
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).y >= y0) box.expandByPoint(v);
  }
  return box;
}
const distToPoly = (p, poly) => Math.min(...poly.map((a, i) => distToSeg(p, a, poly[(i + 1) % poly.length])));
function floorStats(ctx, lv) {
  const t = performance.now(), r = buildResidenceFloor(ctx, { lv }), ms = performance.now() - t;
  const meshes = []; r.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return { r, ms, meshes, boxes: meshes.reduce((n, m) => n + triangles(m), 0) / 12 };
}

test('西苑塔楼外壳可构建：每栋 ≤ 8 次绘制（楼梯实例默认隐藏），两栋 ≤ 16 次 / 17 万三角形', () => {
  const ctx = context(L), community = L.buildings.filter((b) => b.community === 'west');
  assert.ok(community.length >= 2);
  let west = { calls: 0, tris: 0 };
  for (const b of community) {
    const rec = buildCommunityTower(ctx, b, ctx.hospitality.buildings);
    const meshes = visibleMeshes(rec.group), tris = meshes.reduce((n, m) => n + triangles(m), 0);
    assert.ok(meshes.length <= 8, `${b.id} 外壳 ${meshes.length} 次绘制`);
    assert.ok(ctx.buildings[b.id].group.children.includes(rec.group));
    // 防烟楼梯梯段按需构建：首次到访前没有实例网格，聚焦某层后才生成并显示。
    assert.ok(!rec.group.children.some((m) => m.isInstancedMesh && m.userData.towerStairs), `${b.id} 楼梯梯段提前构建`);
    const focus = (b.stairLevelIds || b.levels).find((id) => b.access.flights.some((f) => f.parentFloor === id && f.kind !== 'interior-stair'));
    ctx.dynamic.find((d) => d.name === `${b.id}-protected-stairs`).update(0, 0, { state: { building: b.id, focus } });
    assert.ok(rec.group.children.some((m) => m.isInstancedMesh && m.userData.towerStairs && m.visible && m.count > 0), `${b.id} 聚焦 ${focus} 后缺少楼梯梯段`);
    assert.ok(rec.groundGroup?.children.length && rec.roofGroup?.children.length, `${b.id} 缺少大堂或屋顶花园`);
    if (b.community === 'west') { west.calls += meshes.length; west.tris += tris; assert.equal(rec.basements.length, 2); }
  }
  assert.ok(west.calls <= 16 && west.tris <= 170000, `西苑外壳 ${west.calls} 次 / ${west.tris} 三角形`);
});

test('西苑塔楼远景替身：600 m 外只画 2 个网格、≤ 1,500 三角形，轮廓与完整外壳一致；回到近处恢复完整外壳', () => {
  const ctx = context(L);
  for (const b of L.buildings.filter((q) => q.community === 'west')) {
    const rec = buildCommunityTower(ctx, b, ctx.hospitality.buildings), lod = rec.group.children.find((o) => o.isLOD);
    assert.ok(lod, `${b.id} 缺少远景替身`);
    const near = drawnMeshes(rec.group), roof = L.levels.find((l) => l.building === b.id && l.kind === 'roof');
    const [cx, cz] = toW(b.frame, (b.footprint.x0 + b.footprint.x1) / 2, (b.footprint.z0 + b.footprint.z1) / 2);
    const cam = new THREE.PerspectiveCamera();
    const at = (d) => { cam.position.set(cx + d, roof.elev / 2, cz); cam.updateMatrixWorld(); lod.update(cam); return drawnMeshes(rec.group); };
    assert.deepEqual(at(COMMUNITY_FAR_LOD - 50), near, `${b.id} 近处应显示完整外壳`);
    const far = at(COMMUNITY_FAR_LOD + 50), tris = far.reduce((n, m) => n + triangles(m), 0);
    assert.ok(far.length <= 2 && far.every((m) => !near.includes(m)), `${b.id} 远景 ${far.length} 个网格`);
    assert.ok(tris <= 1500, `${b.id} 远景 ${tris} 三角形`);
    assert.deepEqual(far.map((m) => m.material.name).sort(), ['facadePlaster', 'facadeWindow']);
    // 轮廓：入口雨棚（3.6 m）以上的平面包围盒、以及总高度，与完整外壳相差不到 0.5 m。
    const A = boundsOf(near, 5), F = boundsOf(far, 5), Ah = boundsOf(near), Fh = boundsOf(far);
    for (const k of ['x', 'z']) for (const s of ['min', 'max']) assert.ok(Math.abs(A[s][k] - F[s][k]) <= .5, `${b.id} 远景轮廓 ${s}.${k} ${F[s][k].toFixed(2)} / ${A[s][k].toFixed(2)}`);
    assert.ok(Math.abs(Ah.max.y - Fh.max.y) <= .5 && Math.abs(Ah.min.y - Fh.min.y) <= .5, `${b.id} 远景高度 ${Fh.min.y.toFixed(2)}–${Fh.max.y.toFixed(2)} / ${Ah.min.y.toFixed(2)}–${Ah.max.y.toFixed(2)}`);
    // 5 % 回差：刚进 600 m 仍是远景，570 m 以内才换回完整外壳。
    assert.deepEqual(at(COMMUNITY_FAR_LOD - 10), far);
    assert.deepEqual(at(COMMUNITY_FAR_LOD * .95 - 5), near);
  }
});

test('西库停车顶盖与 B1 灯具让出西苑地下大堂：大堂内没有车库构件，楼梯井与电梯井向上不被遮挡', () => {
  const levels = Object.fromEntries(L.levels.map((lv) => [lv.id, { lv, group: new THREE.Group(), base: new THREE.Group(), shell: new THREE.Group(), batch: new BatchSet(base), shellBatch: new BatchSet(base) }]));
  const ctx = { layout: L, levels, mats: { base, floor: () => base.floor, onNight: () => {} }, dynamic: [], root: new THREE.Group(), camera: { position: { y: -3 } } };
  buildPublicGarageShells(ctx);
  for (const L2 of Object.values(levels)) L2.batch.flush(L2.base);
  const meshes = []; for (const id of ['WPG-B1', 'WPG-B2', 'WPG-G']) for (const g of [levels[id].base, levels[id].shell]) g.traverse((o) => { if (o.isMesh) { o.updateMatrixWorld(true); meshes.push(o); } });
  // 顶盖面片仍在（车位上方照旧），只是没有一块压进住户大堂。
  let ceiling = null; levels['WPG-B1'].shell.traverse((o) => { if (o.name === 'WPG-park-support-ceiling') ceiling = o; });
  const WPG = L.buildings.find((b) => b.id === 'WPG');
  assert.ok(ceiling?.userData.panels.length > 1, '缺少西库停车顶盖');
  for (const b of L.buildings.filter((q) => q.community === 'west')) {
    const ex = polyBounds(b.deckExclusions[0].map((q) => toL(WPG.frame, ...q)));
    for (const r of ceiling.userData.panels) assert.ok(!(r.x0 < ex.x1 - 1e-6 && r.x1 > ex.x0 + 1e-6 && r.z0 < ex.z1 - 1e-6 && r.z1 > ex.z0 + 1e-6), `顶盖面片压住 ${b.id} 地下大堂`);
  }
  const rc = new THREE.Raycaster(), v = new THREE.Vector3();
  for (const b of L.buildings.filter((q) => q.community === 'west')) {
    const ex = polyBounds(b.deckExclusions[0]);
    for (const m of meshes) {
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        assert.ok(!(v.y > -4.4 && v.y < -.05 && v.x > ex.x0 + .05 && v.x < ex.x1 - .05 && v.z > ex.z0 + .05 && v.z < ex.z1 - .05), `${m.material.name} 在 ${b.id} 地下大堂内 (${v.x.toFixed(1)}, ${v.y.toFixed(2)}, ${v.z.toFixed(1)})`);
      }
    }
    const shafts = [...L.stairs.filter((s) => s.building === b.id).map((s) => toW(b.frame, (s.shaftRect.x0 + s.shaftRect.x1) / 2, (s.shaftRect.z0 + s.shaftRect.z1) / 2)),
      ...L.elevators.filter((e) => e.building === b.id).map((e) => [e.x, e.z])];
    for (const [x, z] of shafts) {
      rc.set(new THREE.Vector3(x, -3.5, z), new THREE.Vector3(0, 1, 0)); rc.far = 3.4;
      for (const m of meshes) m.material.side = THREE.DoubleSide;
      assert.equal(rc.intersectObjects(meshes, false).length, 0, `${b.id} 井道 (${x.toFixed(1)}, ${z.toFixed(1)}) 上方有车库顶盖`);
    }
  }
});

test('西苑 12F：五户全部有家具，≤ 1,500 个盒体、≤ 8 个网格，构建足够快', () => {
  const ctx = { layout: L, mats: { base } }, lv = L.levels.find((l) => l.id === 'W1-12F');
  let best = Infinity, stats;
  for (let i = 0; i < 3; i++) { stats = floorStats(ctx, lv); best = Math.min(best, stats.ms); if (i < 2) stats.r.dispose(); }
  assert.ok(stats.boxes <= 1500, `${stats.boxes} 个盒体`);
  assert.ok(stats.meshes.length <= 8, `${stats.meshes.length} 个网格`);
  assert.ok(best < 60, `构建 ${best.toFixed(1)} ms`);
  // 每户：至少一张床（含床头板）、卫浴与厨房台面落在户内。
  const tris = stats.meshes.flatMap((m) => trianglesOf(m).map((t) => [m.material.name, t]));
  for (const u of lv.units) {
    const inside = tris.filter(([, t]) => t.every((p) => u.polys.some((q) => pointInPoly([p[0], p[2]], q))));
    const tall = (key, y) => inside.filter(([k, t]) => k === key && t.some((p) => p[1] > lv.elev + y)).length;
    assert.ok(tall('wood', .9) > 30, `${u.code} 缺少床头板 / 柜体`);
    assert.ok(tall('matte', .3) > 30, `${u.code} 缺少床品与沙发`);
    assert.ok(tall('stone', .85) > 10, `${u.code} 缺少厨卫台面`);
  }
  stats.r.dispose();
});

test('西苑场地：围墙留出北门与步行口，消防登高场地有字样，乔木不种在登高场地、消防车道与车行道上', () => {
  const ctx = context(L);
  for (const b of L.buildings.filter((q) => q.community)) buildCommunityTower(ctx, b, ctx.hospitality.buildings);
  const group = buildCommunitySite(ctx), S = L.site.westGarden;
  assert.ok(group && ctx.site.group.children.includes(group));
  const meshes = []; group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.ok(meshes.length <= 10, `场地 ${meshes.length} 次绘制`);
  assert.equal(S.fence.length, 4);
  assert.ok(S.fence.find((f) => f.id === 'north').gaps.some(([a, z]) => a <= S.gateLane.x0 && z >= S.gateLane.x1), '北门车道被围墙封住');
  const legends = group.children.filter((m) => m.isMesh && m.name === 'signs');
  assert.equal(legends.length, S.hardstands.length);
  // 北门 G4：门楼石柱与岗亭按场地记录绘制；停车场 P 门架不再立在社区门前（门楼招牌另由停车场渲染挂上）。
  const solidAt = (meshes, r, y0, y1) => meshes.some((m) => { m.updateMatrixWorld(true); const p = m.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if (v.x > r.x0 && v.x < r.x1 && v.z > r.z0 && v.z < r.z1 && v.y > y0 && v.y < y1) return true; } return false; });
  for (const r of [...S.gate.pillars, S.gate.booth]) assert.ok(solidAt(meshes, r, .5, 2.5), '门楼石柱或岗亭未绘制');
  const parking = new THREE.Group();
  buildWestParkingDetails({ layout: L, mats: { base, sign: () => new THREE.MeshBasicMaterial() }, site: { group: parking } });
  const pm = []; parking.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) pm.push(o); });
  const g4 = L.site.westParking.gates.find((g) => g.id === 'WP-G4');
  assert.ok(!solidAt(pm, rect(g4.x - 5, g4.z - .6, g4.x + 5, g4.z + .6), .3, 4.5), '社区北门前仍有停车场门架');
  assert.ok(pm.some((m) => m.geometry.type === 'PlaneGeometry' && Math.abs(m.position.z - (S.gate.z - .27)) < 1e-6), '北门门楼缺少招牌');
  const trees = group.children.filter((m) => m.isInstancedMesh);
  assert.ok(trees.length && trees[0].count > 5);
  const matrix = new THREE.Matrix4(), p = new THREE.Vector3();
  const blocked = [S.fireRoad, S.gateLane, ...S.hardstands.map((h) => h.rect)];
  for (let i = 0; i < trees[0].count; i++) {
    trees[0].getMatrixAt(i, matrix); p.setFromMatrixPosition(matrix);
    for (const r of blocked) assert.ok(!(p.x > r.x0 - 2 && p.x < r.x1 + 2 && p.z > r.z0 - 2 && p.z < r.z1 + 2), `树 (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) 占用消防场地`);
    for (const b of L.buildings.filter((q) => q.community)) assert.ok(!pointInPoly([p.x, p.z], b.outline));
  }
});
