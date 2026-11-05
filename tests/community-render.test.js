// 云澜社区住宅渲染（Node three）：每栋社区塔楼外壳 ≤ 8 次绘制、立面窗只开在外墙上，
// 西苑 12F 与手工搭建的北苑错层复式楼层的户内陈设在预算内，复式有踏步、上层楼梯洞口不铺地板，
// 西苑场地的围墙、北门、消防登高场地字样与花园不占登高场地。
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

test('每栋社区塔楼外壳可构建：≤ 8 次绘制（楼梯实例默认隐藏），西苑两栋 ≤ 16 次 / 17 万三角形', () => {
  const ctx = context(L), community = L.buildings.filter((b) => b.community);
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

/** Vertices of the distinct geometries under the given groups (instanced geometry counted once). */
function vertices(...groups) {
  const seen = new Set();
  for (const g of groups) g?.traverse((o) => { if (o.isMesh) seen.add(o.geometry); });
  return [...seen].reduce((n, q) => n + q.attributes.position.count, 0);
}

test('社区住宅几何常驻量 ≤ 10 MB（18 B/顶点）：外壳、大堂 / 会所、地下大堂与西苑场地，梯段到访才建', () => {
  const ctx = context(L), records = L.buildings.filter((b) => b.community).map((b) => buildCommunityTower(ctx, b, ctx.hospitality.buildings));
  const site = buildCommunitySite(ctx);
  const n = vertices(...records.flatMap((r) => [r.group, r.groundGroup, ...r.basements]), site), mb = n * 18 / 1e6;
  assert.ok(mb <= 10, `社区几何 ${mb.toFixed(2)} MB`);
});

test('阳台推拉门：门洞内没有玻璃（与步行开口一致），两扇推拉扇停在固定扇旁；楼梯间立面窗不被楼梯后墙挡住', () => {
  const ctx = context(L), rc = new THREE.Raycaster();
  for (const b of L.buildings.filter((q) => q.community === 'west')) {
    const rec = buildCommunityTower(ctx, b, ctx.hospitality.buildings), meshes = visibleMeshes(rec.group);
    rec.group.updateMatrixWorld(true);
    for (const m of meshes) m.material.side = THREE.DoubleSide;
    const hits = (o, d, far) => { rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize()); rc.far = far; return rc.intersectObjects(meshes, false); };
    const lv = L.levels.find((l) => l.id === `${b.id}-12F`);
    let doors = 0;
    for (const u of lv.units) for (const p of u.residence.partitions.filter((q) => q.role === 'balcony-slider' && q.door)) {
      const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]), d = [(p.b[0] - p.a[0]) / len, (p.b[1] - p.a[1]) / len], n = [-d[1], d[0]];
      const P = (s, off) => toW(u.frame, p.a[0] + d[0] * s + n[0] * off, p.a[1] + d[1] * s + n[1] * off);
      const ray = (s) => { const [x0, z0] = P(s, -.4), [x1, z1] = P(s, .4); return hits([x0, lv.elev + 1.2, z0], [x1 - x0, 0, z1 - z0], .8).filter((h) => /glass/.test(h.object.material.name)); };
      for (const s of [p.door.at - p.door.width / 2 + .15, p.door.at, p.door.at + p.door.width / 2 - .15]) assert.equal(ray(s).length, 0, `${u.code} 推拉门门洞内有玻璃 (s=${s.toFixed(2)})`);
      const fixed = p.door.at - p.door.width / 2 > len - p.door.at - p.door.width / 2 ? (p.door.at - p.door.width / 2) / 2 : (len + p.door.at + p.door.width / 2) / 2;
      assert.ok(ray(fixed).length >= 3, `${u.code} 固定扇与两扇推拉扇不全`);
      doors++;
    }
    assert.ok(doors >= 3, `${b.id}-12F 推拉门 ${doors}`);
    // 核心筒北立面：每部楼梯的竖向条窗从外面看是玻璃，不是楼梯后墙的抹灰。
    for (const st of lv.corePlan.stairs) {
      const m = (st.rect.x0 + st.rect.x1) / 2, [x, z] = toW(b.frame, m, b.footprint.z0 - 5);
      const first = hits([x, lv.elev + 1.5, z], [0, 0, 1], 6)[0];
      assert.ok(first && /glass/.test(first.object.material.name), `${b.id} ${st.id} 条窗被 ${first?.object.material.name} 挡住`);
    }
  }
});

test('会所 / 大堂标识：有接待背柜挂在背柜上，否则挂在面向会所的核心筒实墙上（避开梯门与候梯厅）', () => {
  const w = L.levels.find((l) => l.id === 'W1-1F'), W1 = L.buildings.find((b) => b.id === 'W1');
  const desk = w.lobbyPlan.obstacles.find((o) => o.id === 'reception-back-cabinet');
  assert.deepEqual(lobbySignSpot(w, w.lobbyPlan, W1), { frame: w.lobbyPlan.frame, x: (desk.rect.x0 + desk.rect.x1) / 2, z: desk.rect.z0 - .02, side: 'N' });
  // 北苑 7F 会所形状（契约字段）：四个会所分区在核心筒东西两侧，无接待背柜。
  const F = frame(-260, -232, 0, 'T1'), zones = [['lounge', rect(-18, -8, -4, -.5)], ['library', rect(-18, -.5, -4, 8)], ['dining', rect(4, -8, 18, -.5)], ['gym', rect(4, -.5, 18, 8)]]
    .map(([id, r]) => ({ id, kind: id, name: id, rect: r }));
  const lv = { id: 'T1-7F', elev: 34, height: 5, corePlan: { kind: 'community', frame: F, core: rect(-4, -8, 4, 8),
    landings: [{ id: 'W', rect: rect(-4, -4.8, -1.4, -1.6), open: true }, { id: 'F', rect: rect(-1.4, -4.8, 1.4, -1.6), open: true }, { id: 'E', rect: rect(1.4, -4.8, 4, -1.6), open: true }],
    lifts: [-2.7, 0, 2.7].map((x, i) => ({ id: `L${i}`, rect: rect(x - 1.2, -7.8, x + 1.2, -4.8), door: 'S' })),
    stairs: [{ id: 'A', rect: rect(-4, -1.6, -.2, 8), door: { x0: -1.35, z0: -1.6, x1: -.25, z1: -1.6, side: 'N' } }, { id: 'B', rect: rect(.2, -1.6, 4, 8), door: { x0: .25, z0: -1.6, x1: 1.35, z1: -1.6, side: 'N' } }] } };
  const plan = { kind: 'community-club', frame: F, zones, obstacles: [{ id: 'lounge-sofa-north', rect: rect(-13, -7.2, -9, -6.4) }], partitions: [] };
  const spot = lobbySignSpot(lv, plan, { frame: F });
  assert.ok(spot && ['W', 'E'].includes(spot.side), `会所标识 ${JSON.stringify(spot)}`);
  assert.ok(Math.abs(Math.abs(spot.x) - 4.02) < 1e-6, '标识不在核心筒墙面上');
  assert.ok(spot.z - 1.6 >= -1.6 + .2 - 1e-6 && spot.z + 1.6 <= 8 + 1e-6, '标识压住候梯厅开口');
  // 没有可挂的实墙时不挂。
  assert.equal(lobbySignSpot({ ...lv, corePlan: { ...lv.corePlan, core: rect(-1, -1, 1, 1) } }, plan, { frame: F }), null);
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

test('消防车道与 G4 车道不画路中虚线（登高场地字样不被覆盖），普通车道照画', () => {
  const road = (id, kind, z) => ({ id, kind, width: 10, points: [[0, 0, z], [40, 0, z]], polys: [rectPoly(rect(0, z - 5, 40, z + 5))] });
  const layout = { extensions: { roads: [road('west-garden-fire-road', 'fire', 0), road('west-plain', undefined, 30)], paths: [] }, site: { trenches: [], openings: [], roads: [] }, levels: [], buildings: [], entrances: [], ramps: [] };
  const ctx = { layout, mats: { base }, root: new THREE.Group(), hospitality: {}, dynamic: [], levels: {} };
  connections(ctx);
  const raised = { fire: 0, plain: 0 };
  ctx.hospitality.connections.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > .05) raised[p.getZ(i) < 15 ? 'fire' : 'plain']++; } });
  assert.equal(raised.fire, 0); assert.ok(raised.plain > 0);
});

test('立面窗与玻璃只出现在外墙（exteriorSides）、走廊端与核心筒楼梯窗上，阳台推拉门内退', () => {
  const ctx = context(L);
  for (const b of L.buildings.filter((q) => q.community === 'west')) {
    // 数据：每面带窗的外墙都在 exteriorSides 中，且落在塔楼外轮廓上。
    for (const lv of L.levels.filter((l) => l.building === b.id)) {
      for (const u of lv.units) for (const w of u.residence.facadeWalls) {
        assert.ok(u.residence.exteriorSides.includes(w.side), `${u.code} ${w.side} 不是外墙`);
        for (const p of [w.a, w.b]) assert.ok(distToPoly(toW(u.frame, ...p), b.outline) < .01, `${u.code} 外墙不在轮廓上`);
      }
      const cover = facadeCoverage(b, lv);
      if (lv.kind === 'community') assert.ok(cover.S.reduce((n, [a, z]) => n + z - a, 0) > 43.3, `${lv.id} 南立面未被户型覆盖`);
    }
    const rec = buildCommunityTower(ctx, b, ctx.hospitality.buildings);
    const glass = visibleMeshes(rec.group).find((m) => m.material.name === 'glassTint');
    const sliders = L.levels.filter((l) => l.building === b.id).flatMap((l) => l.units.flatMap((u) => u.residence.partitions
      .filter((p) => p.role === 'balcony-slider').map((p) => [toW(u.frame, ...p.a), toW(u.frame, ...p.b)])));
    let perimeter = 0;
    for (const tri of trianglesOf(glass)) {
      const c = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][2] + tri[1][2] + tri[2][2]) / 3];
      if (distToPoly(c, b.outline) < .4) { perimeter++; continue; }
      assert.ok(sliders.some(([a, z]) => distToSeg(c, a, z) < .05), `${b.id} 玻璃 (${c.map((v) => v.toFixed(1))}) 不在外墙或阳台门上`);
    }
    assert.ok(perimeter > 1000, `${b.id} 外墙玻璃过少 ${perimeter}`);
  }
});
const distToPoly = (p, poly) => Math.min(...poly.map((a, i) => distToSeg(p, a, poly[(i + 1) % poly.length])));

function floorStats(ctx, lv) {
  const t = performance.now(), r = buildResidenceFloor(ctx, { lv }), ms = performance.now() - t;
  const meshes = []; r.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return { r, ms, meshes, boxes: meshes.reduce((n, m) => n + triangles(m), 0) / 12 };
}

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

/** Hand-built 北苑 14–15W duplex pair (P-north's plan data through communityUnit). */
function northDuplex() {
  const T = NORTH_SITE.towers[0], hm = COMMUNITY_PLANS.north.T1.homes.find((h) => h.id === 'T1-14W');
  const UF = frame(T.core[0], -240, 90, 'T1-W'), [l14, l15] = NORTH_SITE.levels.filter((l) => ['14F', '15F'].includes(l.short));
  const levels = [l14, l15].map((l) => ({ id: `T1-${l.short}`, building: 'T1', short: l.short, elev: l.elev, height: l.height, kind: 'community', units: [], rooms: [] }));
  const [lower, upper] = hm.parts.map((p, i) => communityUnit({ lv: levels[i], building: 'T1', id: `${levels[i].id}-W`, code: `T1-1415W-${i ? 'U' : 'L'}`,
    slot: 'W', frame: UF, plan: p.plan, name: `云澜·北苑 1 号楼 14–15W 复式 · ${i ? '上层' : '下层'}`, en: 'YUNLAN NORTH RESIDENCE 1 · 1415W',
    home: hm.id, homeLevels: levels.map((l) => l.id), partner: `${levels[1 - i].id}-W`, ...(i ? { fronts: [] } : {}) }));
  levels[0].units.push(lower); levels[1].units.push(upper);
  return { levels, lower, upper, UF };
}

test('手工搭建的北苑错层复式：下层有两跑踏步与平台，上层楼梯洞口不铺地板且四周（到达口除外）有栏杆', () => {
  const { levels, lower, upper, UF } = northDuplex(), ctx = { layout: { elevators: [] }, mats: { base } };
  const lo = floorStats(ctx, levels[0]), up = floorStats(ctx, levels[1]);
  for (const s of [lo, up]) { assert.ok(s.boxes <= 1500 && s.meshes.length <= 8, `${s.boxes} 盒 / ${s.meshes.length} 网格`); }
  const st = lower.residence.homeStair, block = lrectPoly(UF, st.block);
  // 下层：楼梯块内有 ≥ 20 级踏步（木质水平面，标高沿梯段递增至上层楼面）。
  const treadTops = new Set();
  for (const m of lo.meshes.filter((q) => q.material.name === 'wood')) for (const t of trianglesOf(m)) {
    const ys = t.map((p) => p[1]);
    if (Math.max(...ys) - Math.min(...ys) > 1e-4) continue;
    if (!t.every((p) => pointInPoly([p[0], p[2]], block))) continue;
    if (ys[0] > levels[0].elev + .1) treadTops.add(ys[0].toFixed(2));
  }
  assert.ok(treadTops.size >= 19, `只有 ${treadTops.size} 级踏步`);
  assert.ok([...treadTops].some((y) => Math.abs(+y - (levels[0].elev + st.landingY)) < .05), '缺少半层平台');
  // 上层：洞口内没有地板（楼面附近的水平三角形）。
  const hole = lrectPoly(UF, st.upperHole), y0 = levels[1].elev;
  // 地面盒体与地毯：楼面附近的水平面（离洞口边 > 8 cm，排除骑在洞口边线上的墙与栏杆）。
  const floors = up.meshes.filter((m) => ['wood', 'stone', 'matte'].includes(m.material.name));
  const floorIn = (poly) => floors.some((m) => trianglesOf(m).some((t) => {
    if (!t.every((p) => Math.abs(p[1] - t[0][1]) < 1e-4 && p[1] > y0 - .01 && p[1] < y0 + .04)) return false;
    const c = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
    return pointInPoly(c, poly) && distToPoly(c, poly) > .08;
  }));
  assert.ok(!floorIn(hole), '上层楼梯洞口内有地板');
  // 栏杆：玻璃栏板沿洞口的封闭边，梯段 B 到达口留空。
  const rails = upper.residence.partitions.filter((p) => p.role === 'railing');
  assert.ok(rails.length >= 1);
  const glass = up.meshes.filter((m) => m.material.name === 'glass').flatMap(trianglesOf).filter((t) => t.some((p) => p[1] > y0 + .9));
  for (const p of rails) {
    const a = toW(UF, ...p.a), b = toW(UF, ...p.b), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    assert.ok(glass.some((t) => t.some((q) => distToSeg([q[0], q[2]], a, b) < .1)), `栏杆 ${p.id} 未绘制 (${mid})`);
  }
  const arrival = st.upperArrival, ax = toW(UF, (arrival.a[0] + arrival.b[0]) / 2, (arrival.a[1] + arrival.b[1]) / 2);
  assert.ok(!glass.some((t) => t.some((q) => Math.hypot(q[0] - ax[0], q[2] - ax[1]) < .3)), '到达口被栏杆挡住');
  // 上层无户门，不生成门牌；挑空（若有）同样不铺地板。
  for (const v of upper.residence.voids || []) assert.ok(!floorIn(lrectPoly(UF, v)), '挑空内有地板');
  // 反证：同一判据能找到上层家庭厅的地板。
  const family = upper.residence.rooms.find((r) => r.kind === 'family');
  assert.ok(floorIn(lrectPoly(UF, family.rect)), '家庭厅缺少地板');
  lo.r.dispose(); up.r.dispose();
});

test('北苑契约塔楼（手工两层）外壳可构建：楼板开洞、两户立面、核心筒实体与会所 / 屋顶缺省时不报错', () => {
  const { levels, UF } = northDuplex(), T = NORTH_SITE.towers[0], F = frame(...T.frame, 0, 'T1'), footprint = rect(-18, -8, 18, 8);
  const coreRect = rect(-4, -8, 4, 8), stairs = [{ id: 'T1-ST-A', building: 'T1', frame: F, rect: rect(-4, -1.6, -.2, 8), door: { x0: -1.35, z0: -1.6, x1: -.25, z1: -1.6, side: 'N' }, serves: levels.map((l) => l.id) }];
  for (const lv of levels) {
    lv.slab = { pieces: [{ outer: lrectPoly(F, footprint), holes: [], localRect: footprint }] };
    lv.voids = []; lv.walk = []; lv.features = [];
    lv.corePlan = { kind: 'community', frame: F, core: coreRect,
      landings: [{ id: 'W', rect: rect(-4, -4.8, -1.4, -1.6), open: lv.short === '14F' }, { id: 'F', rect: rect(-1.4, -4.8, 1.4, -1.6), open: true }, { id: 'E', rect: rect(1.4, -4.8, 4, -1.6), open: lv.short === '15F' }],
      lifts: [-2.7, 0, 2.7].map((x, i) => ({ id: `T1-L${i}`, rect: rect(x - 1.2, -7.8, x + 1.2, -4.8), door: 'S' })),
      stairs: [{ id: 'T1-ST-A', rect: stairs[0].rect, door: stairs[0].door, shaftRect: rect(-3.6, 0.4, -.6, 7.3), landingRect: rect(-3.8, -1.4, -.4, .4) }] };
  }
  const upper = levels[1], st = upper.units[0].residence.homeStair;
  upper.slab.pieces[0].holes.push(lrectPoly(UF, st.upperHole));
  const b = { id: 'T1', kind: 'tower', usage: 'community', community: 'north', name: '云澜·北苑 1 号楼', short: '北苑1', en: 'YUNLAN NORTH RESIDENCE 1',
    frame: F, footprint, outline: lrectPoly(F, footprint), levels: levels.map((l) => l.id), stairLevelIds: levels.map((l) => l.id), access: { protected: true, flights: [], surfaces: [], routes: [] } };
  const layout = { buildings: [b], levels, stairs, elevators: [], entrances: [] }, ctx = context(layout);
  const rec = buildCommunityTower(ctx, b, ctx.hospitality.buildings);
  const meshes = visibleMeshes(rec.group);
  assert.ok(meshes.length <= 8 && meshes.length >= 5, `${meshes.length} 次绘制`);
  const solid = (lv, [x, z]) => coreCells(lv.corePlan).some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
  assert.ok(solid(levels[1], [-2.7, -3.2]) && !solid(levels[0], [-2.7, -3.2]), '西侧候梯厅只在不停靠的上层为实体');
  // 上层楼板在楼梯洞口处真的开洞。
  const slabTris = trianglesOf(meshes.find((m) => m.material.name === 'stone')).filter((t) => t.every((p) => Math.abs(p[1] - (upper.elev - .03)) < 1e-3));
  const c = toW(UF, (st.upperHole.x0 + st.upperHole.x1) / 2, (st.upperHole.z0 + st.upperHole.z1) / 2);
  assert.ok(!slabTris.some((t) => pointInPoly(c, t.map((p) => [p[0], p[2]]))), '复式上层楼板盖住了楼梯洞口');
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

/** Records every furniture piece of one home as world-space points (box corners, template vertices, bar ends). */
function furnitureRecorder() {
  let xf = null; const out = [], Y = new THREE.Vector3(0, 1, 0);
  const add = (m, pts) => { const M = xf ? new THREE.Matrix4().multiplyMatrices(xf, m) : m, v = new THREE.Vector3(); out.push(pts.map((p) => v.set(...p).applyMatrix4(M).toArray())); };
  const corners = [-.5, .5].flatMap((x) => [-.5, .5].flatMap((y) => [-.5, .5].map((z) => [x, y, z])));
  const B = {
    get: () => ({
      box(cx, cy, cz, sx, sy, sz, c, ry = 0) { add(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromAxisAngle(Y, ry), new THREE.Vector3(sx, sy, sz)), corners); },
      push(t, m) { const pts = []; for (let i = 0; i < t.count; i++) pts.push([t.pos[i * 3], t.pos[i * 3 + 1], t.pos[i * 3 + 2]]); add(m.clone(), pts); },
      bar(a, b) { add(new THREE.Matrix4(), [[a.x, a.y, a.z], [b.x, b.y, b.z]]); },
      shape() {},
    }),
    frame(F, fn) { const p = xf; xf = F ? frameMatrix(F) : null; try { fn(); } finally { xf = p; } },
  };
  return { B, out };
}
/** One home per distinct community plan and level part. */
const distinctHomes = () => {
  const seen = new Map();
  for (const lv of L.levels) for (const u of lv.units || []) {
    const r = u.residence;
    if (r?.kind === 'community' && !seen.has(r.plan + r.level)) seen.set(r.plan + r.level, { lv, u });
  }
  return [...seen.values()];
};
/** A piece's unit-local footprint and height range. */
const footprintOf = (u, lv, pts) => {
  const l = pts.map((p) => toL(u.frame, p[0], p[2])), ys = pts.map((p) => p[1] - lv.elev);
  return { x0: Math.min(...l.map((p) => p[0])), x1: Math.max(...l.map((p) => p[0])), z0: Math.min(...l.map((p) => p[1])), z1: Math.max(...l.map((p) => p[1])), y0: Math.min(...ys), y1: Math.max(...ys) };
};

test('社区住宅家具：每一件都落在单个房间矩形内（不穿隔墙），阳台桌椅有立柱 / 椅腿落地', () => {
  const homes = distinctHomes();
  assert.ok(homes.length >= 70, `${homes.length} 种户型`);
  let pieces = 0, balconies = 0;
  for (const { lv, u } of homes) {
    const { B, out } = furnitureRecorder(), res = u.residence;
    communityFurniture(B, u, lv.elev);
    const fps = out.map((pts) => footprintOf(u, lv, pts));
    pieces += fps.length;
    for (const f of fps) {
      const room = res.rooms.find((r) => f.x0 >= r.rect.x0 - .02 && f.x1 <= r.rect.x1 + .02 && f.z0 >= r.rect.z0 - .02 && f.z1 <= r.rect.z1 + .02);
      assert.ok(room, `${u.code} 有家具跨出房间：x ${f.x0.toFixed(2)}–${f.x1.toFixed(2)} z ${f.z0.toFixed(2)}–${f.z1.toFixed(2)} y ${f.y0.toFixed(2)}`);
    }
    // 阳台：每件离地家具都由落地的构件托住（桌面在立柱上，椅面在椅腿上）。
    for (const b of res.rooms.filter((r) => r.kind === 'balcony')) {
      const inB = fps.filter((f) => f.x0 >= b.rect.x0 - .02 && f.x1 <= b.rect.x1 + .02 && f.z0 >= b.rect.z0 - .02 && f.z1 <= b.rect.z1 + .02);
      if (!inB.length) continue;
      balconies++;
      const held = new Set(inB.filter((f) => f.y0 < .04));
      for (let grew = true; grew;) {
        grew = false;
        for (const f of inB) if (!held.has(f) && [...held].some((g) => g.y1 >= f.y0 - .02 && g.x0 < f.x1 && f.x0 < g.x1 && g.z0 < f.z1 && f.z0 < g.z1)) { held.add(f); grew = true; }
      }
      const loose = inB.filter((f) => !held.has(f));
      assert.equal(loose.length, 0, `${u.code} ${b.id} 有悬空家具：${loose.map((f) => `y ${f.y0.toFixed(2)}`).join(', ')}`);
      assert.ok(inB.some((f) => f.y0 < .04 && f.y1 > .6), `${u.code} 阳台桌没有立柱`);
    }
  }
  assert.ok(pieces > 8000 && balconies >= 30, `${pieces} 件 / ${balconies} 个阳台`);
});

test('社区住宅客厅与卧室：电视墙不在外墙或玻璃侧、沙发齐全；同层五户客厅陈设各不相同；卧室有衣柜或步入式衣帽间', () => {
  const stub = { get: () => ({ box() {}, push() {}, bar() {}, shape() {} }), frame: (F, fn) => fn() };
  let bedrooms = 0, stored = 0;
  for (const { lv, u } of distinctHomes()) {
    const res = u.residence, s = communityFurniture(stub, u, lv.elev), ext = new Set(res.exteriorSides || []);
    const livings = res.rooms.filter((r) => r.kind === 'living');
    assert.equal(s.living.length, livings.length, `${u.code} 客厅缺少陈设`);
    for (const l of s.living) {
      const r = res.rooms.find((q) => q.id === l.room).rect, edge = { N: r.z0 === 0, S: Math.abs(r.z1 - res.depth) < 1e-3, W: r.x0 === 0, E: Math.abs(r.x1 - res.width) < 1e-3 };
      assert.ok(!(edge[l.tvSide] && ext.has(l.tvSide)), `${u.code} 电视靠在外墙 ${l.tvSide}`);
      const line = { N: r.z0, S: r.z1, W: r.x0, E: r.x1 }[l.tvSide], horiz = l.tvSide === 'N' || l.tvSide === 'S';
      assert.ok(!res.partitions.some((p) => ['balcony-slider', 'railing'].includes(p.role) && (horiz ? p.a[1] === line && p.b[1] === line : p.a[0] === line && p.b[0] === line)), `${u.code} 电视挡在推拉门前`);
      assert.ok(l.pieces.includes('sofa') || l.pieces.includes('loveseat'), `${u.code} 客厅没有沙发`);
    }
    for (const b of s.bedrooms) { bedrooms++; if (b.wardrobe) stored++; else { const r = res.rooms.find((q) => q.id === b.room).rect; assert.ok((r.x1 - r.x0) * (r.z1 - r.z0) < 15, `${u.code} ${b.name} 没有衣柜`); } }
  }
  assert.ok(stored / bedrooms >= .9, `衣柜 ${stored}/${bedrooms}`);
  // 西苑 12F：二、三、四房的客厅陈设不同，同层相邻户的沙发颜色也不同。
  const lv = L.levels.find((l) => l.id === 'W1-12F'), rows = lv.units.map((u) => ({ u, l: communityFurniture(stub, u, lv.elev).living[0] }));
  const sig = rows.map(({ l }) => `${l.kind}|${l.sofa}|${l.pieces.join(',')}`);
  assert.equal(new Set(sig).size, rows.length, sig.join(' / '));
  assert.equal(new Set(rows.map(({ l }) => l.sofa)).size, rows.length, '同层沙发颜色重复');
  const kinds = new Map(rows.map(({ u, l }) => [u.residence.bedrooms, l.kind]));
  assert.ok(kinds.get(2) !== kinds.get(3) && kinds.get(3) !== kinds.get(4), [...kinds].join(' '));
  // 北苑：大平层与复式下层的江景客厅各有沙发组合，复式下层在玻璃边放钢琴或休闲椅。
  for (const id of ['T1-10F', 'T2-16F']) for (const u of L.levels.find((l) => l.id === id).units) {
    const l = communityFurniture(stub, u, 0).living[0];
    if (!l) continue;
    assert.ok(l.pieces.some((p) => ['piano', 'lounge-chairs'].includes(p)), `${u.code} 江景客厅没有临窗陈设：${l.pieces}`);
  }
});

test('门牌：复式两层门牌写成 16–17W，不是只剩一个 L；平层与西苑照常', () => {
  assert.equal(homePlate('T2-1617W-L'), '16–17W');
  assert.equal(homePlate('T1-1415W-U'), '14–15W');
  assert.equal(homePlate('T1-10W'), '10W');
  assert.equal(homePlate('W1-1201'), '1201');
  const texts = [], lv = L.levels.find((l) => l.id === 'T2-16F'), prev = paint.fillText;
  paint.fillText = (t) => texts.push(t);
  try { buildResidenceFloor({ layout: L, mats: { base } }, { lv }).dispose(); } finally { paint.fillText = prev; }
  assert.ok(texts.includes('16–17W') && !texts.includes('L'), texts.join(','));
});

test('楼板底面画成白色抹灰顶棚（不是石材地砖），楼板边沿仍用石材', () => {
  const ctx = context(L), b = L.buildings.find((q) => q.id === 'W1');
  const rec = buildCommunityTower(ctx, b, ctx.hospitality.buildings);
  const lv = L.levels.find((l) => l.id === 'W1-12F'), under = lv.elev - .03 - .28;
  const down = (name) => visibleMeshes(rec.group).filter((m) => m.material.name === name).flatMap(trianglesOf)
    .filter((t) => t.every((p) => Math.abs(p[1] - under) < 1e-3)).filter((t) => {
      const [a, b2, c] = t.map((p) => new THREE.Vector3(...p)), n = b2.clone().sub(a).cross(c.clone().sub(a));
      return n.y < 0;
    });
  assert.equal(down('stone').length, 0, '楼板底面仍是石材');
  assert.ok(down('facadePlaster').length > 10, '缺少抹灰顶棚');
});

test('社区电梯层门：每个停靠层一对金属门扇，轿厢所在层随轿门打开，其余层关闭；塔楼不在使用时整组隐藏', () => {
  const ctx = context(L), b = L.buildings.find((q) => q.id === 'W1');
  const rec = buildCommunityTower(ctx, b, ctx.hospitality.buildings), { mesh, stops } = rec.landing;
  const lifts = L.elevators.filter((e) => e.building === 'W1');
  assert.equal(stops.length, lifts.reduce((n, e) => n + e.serves.filter((id) => L.levels.find((l) => l.id === id)?.corePlan).length, 0));
  assert.ok(stops.length >= 90, `${stops.length} 个层门`);
  const twelve = L.levels.find((l) => l.id === 'W1-12F'), car = { group: { visible: true, position: { y: twelve.elev } }, open: 1, elevator: lifts[0] };
  ctx.elevatorCars = new Map([[lifts[0].id, car]]);
  const update = ctx.dynamic.find((d) => d.name === 'W1-landing-doors');
  update.update(0, 0, {});
  assert.ok(mesh.visible, '使用中的塔楼层门不可见');
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const gap = (i) => {
    const st = stops[i], c = [0, 1].map((k) => { mesh.getMatrixAt(2 * i + k, m); m.decompose(p, q, s); return toL(b.frame, p.x, p.z)[st.alongX ? 0 : 1]; });
    return Math.abs(c[1] - c[0]);
  };
  for (const [i, st] of stops.entries()) {
    const open = st.lift === lifts[0].id && st.level === 'W1-12F';
    if (open) assert.ok(gap(i) > 1.5, `轿厢层门未打开：${gap(i).toFixed(2)}`);
    else assert.ok(gap(i) < .6, `${st.lift} ${st.level} 层门未关闭（${gap(i).toFixed(2)} m）`);
  }
  // 轿门关上（运行中）或轿厢隐藏时，所有层门关闭 / 整组隐藏。
  car.open = 0; update.update(0, 0, {});
  assert.ok(stops.every((st, i) => gap(i) < .6));
  car.group.visible = false; update.update(0, 0, {});
  assert.ok(!mesh.visible);
});

test('社区电梯层门随楼层剖切：门扇材质与塔楼外立面共用同一个剖切平面，聚焦某层时该层以上的层门随外立面切掉，下方保留', () => {
  for (const [id, floor] of [['W1', 'W1-12F'], ['T1', 'T1-16F']]) {
    const ctx = context(L), b = L.buildings.find((q) => q.id === id);
    const rec = buildCommunityTower(ctx, b, ctx.hospitality.buildings), mat = rec.landing.mesh.material;
    assert.ok(mat.clippingPlanes?.includes(rec.plane), `${id} 层门没有使用塔楼剖切平面`);
    // 与 app.js 聚焦时相同：剖切面在聚焦层楼面以上 5 cm。
    const lv = L.levels.find((l) => l.id === floor);
    setHospitalityCut(ctx, id, lv.elev + .05);
    const [plane] = mat.clippingPlanes, kept = (s) => plane.distanceToPoint(new THREE.Vector3(0, s.y + 1.14, 0)) >= 0;
    const above = rec.landing.stops.filter((s) => s.y >= lv.elev - .01), below = rec.landing.stops.filter((s) => s.y < lv.elev - .01);
    assert.ok(above.length > 0 && below.length > 0);
    assert.ok(above.every((s) => !kept(s)), `${id} 聚焦 ${floor} 后上方层门仍然显示`);
    assert.ok(below.every(kept), `${id} 聚焦 ${floor} 后下方层门被切掉`);
    setHospitalityCut(ctx, id);
    assert.ok(rec.landing.stops.every(kept), `${id} 取消聚焦后层门仍被切掉`);
  }
});
