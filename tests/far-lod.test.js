// 远景替身（supertall P0b · SPEC §2.2 M1 / §2.3）：十栋高塔在 600 m 外都换成 ≤ 2 个网格（facadePlaster + facadeWindow）、
// ≤ 2,000 三角形（西苑 ≤ 1,500）的替身；轮廓（5 m 以上的平面包围盒、塔冠高度、地面以上的底）与完整外壳相差 ≤ 0.5 m；
// 5 % 回差；R / H / A 的 1F 大堂与屋顶花园随近景显隐。夜景层：每塔一个网格，白天隐藏、夜间远景才显示，
// ≤ 600 三角形，逐实例着色（亮窗、塔冠亮边、红色航空障碍灯），避难层不亮（合成 spec）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { renderContext, drawnMeshes, boundsOf, triangles } from './render-context.js';
import { buildCommunityTower, COMMUNITY_FAR_LOD } from '../src/render/build/community.js';
import { buildHospitalityTower } from '../src/render/build/hospitality.js';
import { BatchSet } from '../src/render/batch.js';
import { farStandIn, farSwap, farNight, nightQuads, storeyNightWindows, crownEdgeLines, cornerAviation, mergeBands, FAR_BUDGET, FAR_LOD_RADIUS } from '../src/render/build/far-lod.js';

const TOWERS = ['T1', 'T2', 'W1', 'W2', 'R1', 'R2', 'R3', 'R4', 'H', 'A'];
const ctx = renderContext(L);
const records = new Map();
for (const id of TOWERS) {
  const b = L.buildings.find((q) => q.id === id);
  records.set(id, b.community ? buildCommunityTower(ctx, b, ctx.hospitality.buildings) : buildHospitalityTower(ctx, b, ctx.hospitality.buildings));
}
const lodOf = (rec) => rec.group.getObjectByProperty('isLOD', true);
/** Near and far drawn meshes of a tower (its exterior, plus the R / H / A roof garden that rides the near branch). */
function views(id) {
  const rec = records.get(id), lod = lodOf(rec), c = lod.userData.farLod.centre, cam = new THREE.PerspectiveCamera();
  const at = (d) => { cam.position.set(c.x + d, c.y, c.z); cam.updateMatrixWorld(); lod.update(cam); return [...drawnMeshes(rec.group), ...(rec.roofGroup && rec.roofGroup !== rec.group ? drawnMeshes(rec.roofGroup) : [])]; };
  return { rec, lod, at };
}

test('M1：十栋高塔都有远景替身（600 m，5 % 回差）；替身 ≤ 2 个网格 / ≤ 2,000 三角形（西苑 ≤ 1,500），材质 facadePlaster + facadeWindow', () => {
  assert.equal(FAR_LOD_RADIUS, 600);
  assert.equal(COMMUNITY_FAR_LOD, FAR_LOD_RADIUS);
  for (const id of TOWERS) {
    const { lod, at } = views(id);
    assert.ok(lod, `${id} 没有远景替身`);
    const near = at(FAR_LOD_RADIUS - 50), far = at(FAR_LOD_RADIUS + 50);
    const fFar = far.filter((m) => !near.includes(m) || m.parent === lod), tris = fFar.reduce((n, m) => n + triangles(m), 0);
    assert.ok(fFar.length <= FAR_BUDGET.dayMeshes, `${id} 远景 ${fFar.length} 个网格`);
    assert.ok(tris <= (id.startsWith('W') ? FAR_BUDGET.westTriangles : FAR_BUDGET.dayTriangles), `${id} 远景 ${tris} 三角形`);
    assert.deepEqual(fFar.map((m) => m.material.name).sort(), ['facadePlaster', 'facadeWindow'], id);
    assert.ok(far.every((m) => !near.includes(m) || m.parent === lod), `${id} 远景时近景网格仍在画`);
    // 5 % hysteresis: just inside 600 m stays far, inside 570 m swaps back.
    assert.deepEqual(at(FAR_LOD_RADIUS - 10), far);
    assert.deepEqual(at(FAR_LOD_RADIUS * .95 - 5), near);
  }
});

test('远景轮廓与完整外壳一致（十栋）：5 m 以上的平面包围盒、塔冠最高点、地面以上的最低点都 ≤ 0.5 m', () => {
  for (const id of TOWERS) {
    const { at } = views(id), near = at(500), far = at(700);
    const A = boundsOf(near, 5), F = boundsOf(far, 5);
    for (const k of ['x', 'z']) for (const s of ['min', 'max']) assert.ok(Math.abs(A[s][k] - F[s][k]) <= .5, `${id} 远景轮廓 ${s}.${k} ${F[s][k].toFixed(2)} / ${A[s][k].toFixed(2)}`);
    assert.ok(Math.abs(A.max.y - F.max.y) <= .5, `${id} 远景塔冠 ${F.max.y.toFixed(2)} / ${A.max.y.toFixed(2)}`);
    const a0 = boundsOf(near, -.5), f0 = boundsOf(far, -.5);
    assert.ok(Math.abs(a0.min.y - f0.min.y) <= .5, `${id} 远景底 ${f0.min.y.toFixed(2)} / ${a0.min.y.toFixed(2)}`);
  }
});

test('R / H / A 的 1F 大堂与屋顶花园只随近景显示；回到近处恢复', () => {
  for (const id of ['R1', 'H', 'A']) {
    const { rec, at } = views(id);
    at(700);
    assert.ok(rec.groundGroup && !rec.groundGroup.visible && !rec.roofGroup.visible, `${id} 远景时大堂 / 屋顶花园仍可见`);
    at(500);
    assert.ok(rec.groundGroup.visible && rec.roofGroup.visible, id);
  }
});

test('夜景层：每塔一个网格，白天隐藏，夜间只在远景显示；≤ 600 三角形，有亮窗（暖色）、塔冠亮边和红色障碍灯', () => {
  for (const id of TOWERS) {
    const { lod, at } = views(id), night = lod.children.find((o) => o.userData.farNight);
    assert.ok(night?.isInstancedMesh, `${id} 没有夜景层`);
    assert.ok(triangles(night) <= FAR_BUDGET.nightTriangles, `${id} 夜景层 ${triangles(night)} 三角形`);
    // Primitive geometry in a plain (no vertex colours) material, tinted per instance: never black.
    assert.ok(!night.material.vertexColors && night.instanceColor, `${id} 夜景层材质`);
    const colours = new Set(Array.from({ length: night.count }, (_, i) => { const c = new THREE.Color(); night.getColorAt(i, c); return c.getHexString(); }));
    assert.ok(colours.has('f6dfb4') && colours.has('ff2a1f') && colours.has('f1dcae'), `${id} 夜景层颜色 ${[...colours]}`);
    ctx.setNight(0); at(700);
    assert.ok(!night.visible, `${id} 白天远景显示了夜景层`);
    ctx.setNight(1);
    assert.ok(night.visible, `${id} 夜间远景没有夜景层`);
    at(500);
    assert.ok(!night.visible, `${id} 夜间近景仍显示夜景层`);
    ctx.setNight(0);
  }
});

test('farStandIn / farNight 按 spec 画：体量、各面窗带合并、塔冠盒；避难层不亮；合成 spec 的三角形与网格数', () => {
  const b = { id: 'ST', frame: { ox: 0, oz: 0, deg: 0, a: 0, c: 1, s: 0 }, footprint: { x0: -10, x1: 10, z0: -8, z1: 8 } };
  const storeys = Array.from({ length: 30 }, (_, i) => ({ id: `ST-${i + 2}F`, y0: 4.5 + 3.3 * i, y1: 7.8 + 3.3 * i, refuge: i === 13 }));
  const bands = mergeBands(storeys.map((s) => ({ kind: 'glass', t0: -8, t1: 8, y0: s.y0 + .6, y1: s.y1 - .4 })));
  assert.equal(bands.length, 1, '连续楼层的窗带应合并成一条');
  const spec = { top: 103.5, faces: ['N', 'S', 'W', 'E'].map((edge) => ({ edge, bands: [...bands, ...storeys.map((s) => ({ kind: 'spandrel', y0: s.y0 - .3, y1: s.y0 + .5 }))] })),
    crown: [{ rect: { x0: -3, x1: 3, z0: -3, z1: 3 }, y0: 103.5, y1: 108 }], roof: { y: 103.5 } };
  const mats = new Proxy({}, { get: (m, k) => (m[k] ||= Object.assign(new THREE.MeshBasicMaterial({ vertexColors: true }), { name: k })) });
  const B = new BatchSet(mats), g = new THREE.Group();
  B.frame(b.frame, () => farStandIn(B, b, spec));
  B.flush(g);
  assert.deepEqual(g.children.map((m) => m.material.name).sort(), ['facadePlaster', 'facadeWindow']);
  assert.ok(g.children.reduce((n, m) => n + triangles(m), 0) <= 2000);
  const lit = storeyNightWindows(b, storeys, [{ edge: 'N', t0: -10, t1: 10 }, { edge: 'S', t0: -10, t1: 10 }], { rate: 1, perFace: 2 });
  assert.ok(!lit.some((w) => w.y0 >= storeys[13].y0 && w.y1 <= storeys[13].y1), '避难层亮了窗');
  const night = { windows: lit, crownEdges: crownEdgeLines(b.footprint, 104), aviation: cornerAviation(b.footprint, 105) };
  assert.equal(nightQuads(b, night).length, lit.length + 4 + 8);
  const mesh = farNight(b, night, mats.glowSoft);
  assert.ok(mesh.isInstancedMesh && mesh.count === lit.length + 12 && !mesh.material.vertexColors);
  // farSwap toggles near / far / extra and the night mesh with the onNight hook.
  const near = new THREE.Group(), extra = new THREE.Group(), far = [new THREE.Mesh()], hooks = [];
  const lod = farSwap(b, 100, near, far, { extra: [extra], night: mesh, onNight: (fn) => hooks.push(fn) });
  const cam = new THREE.PerspectiveCamera(); cam.position.set(700, 50, 0); cam.updateMatrixWorld(); lod.update(cam);
  assert.ok(!near.visible && !extra.visible && far[0].visible && !mesh.visible);
  hooks[0](1); assert.ok(mesh.visible);
});
