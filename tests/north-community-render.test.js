// 北苑社区渲染（Node three）：外壳绘制预算、手工搭建的错层复式、契约塔楼外壳。
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

const distToPoly = (p, poly) => Math.min(...poly.map((a, i) => distToSeg(p, a, poly[(i + 1) % poly.length])));
function floorStats(ctx, lv) {
  const t = performance.now(), r = buildResidenceFloor(ctx, { lv }), ms = performance.now() - t;
  const meshes = []; r.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return { r, ms, meshes, boxes: meshes.reduce((n, m) => n + triangles(m), 0) / 12 };
}

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

test('北苑塔楼外壳可构建：每栋 ≤ 8 次绘制（楼梯实例默认隐藏），有空中大堂与屋顶花园', () => {
  const ctx = context(L), community = L.buildings.filter((b) => b.community === 'north');
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
