// 北苑在一期内的渲染：住户核心筒与大堂只写入宿主楼层已有的批次（不加绘制调用），
// 门禁每个楼层最多两个实例化网格，关闭的门扇横跨每条通道、打开后让出通道；
// 一期楼层的用房与隔墙渲染在住户核心筒（穿越层楼梯无门）上不报错；地铁闸机画成常开式。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { BatchSet, SignBatch } from '../src/render/batch.js';
import { buildRooms } from '../src/render/build/rooms.js';
import { buildWalls } from '../src/render/build/walls.js';
import { buildResidentialCores } from '../src/render/build/residential-cores.js';
import { buildAccessGates, gateLeafBoxes, GATE_COLORS } from '../src/render/build/access-gates.js';
import { fareGateFlaps } from '../src/render/build/metro.js';
import { shapeFromPoly, flatShapeGeometry, buildShell } from '../src/render/build/shell.js';
import { polyArea, polyBounds } from '../src/layout/geom.js';

function context(layout) {
  const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial() });
  const levels = Object.fromEntries(layout.levels.map((lv) => [lv.id, {
    lv, base: new THREE.Group(), shell: new THREE.Group(), facade: new THREE.Group(), signs: new SignBatch(), facadeSigns: new SignBatch(),
    batch: new BatchSet(materials), shellBatch: new BatchSet(materials), facadeBatch: new BatchSet(materials),
  }]));
  return { layout, levels, mats: { base: materials, floor: () => materials.floor, onNight: () => {} }, dynamic: [],
    lvById: Object.fromEntries(layout.levels.map((l) => [l.id, l])), bById: Object.fromEntries(layout.buildings.map((b) => [b.id, b])),
    atlas: Object.fromEntries(layout.levels.map((l) => [l.id, { cell: (id) => (/^res-/.test(id) ? [0, 0, 1, 1] : null) }])),
    site: { batch: new BatchSet(materials), group: new THREE.Group() } };
}
const vertices = (B) => Object.values(B.sets).reduce((n, b) => n + b.n, 0);
const keys = (B) => new Set(Object.keys(B.sets));
const hosts = [...new Set(L.buildings.filter((b) => b.community === 'north').flatMap((b) => b.hostLevels))];

test('住户核心筒与大堂只写入宿主楼层已有批次，不新建网格；穿越层与开门层都有围护', () => {
  const ctx = context(L), stats = buildResidentialCores(ctx);
  for (const L2 of Object.values(ctx.levels)) for (const g of [L2.base, L2.shell, L2.facade]) assert.equal(g.children.length, 0, `${L2.lv.id} 新建了网格`);
  assert.equal(ctx.site.group.children.length, 0);
  for (const [id, L2] of Object.entries(ctx.levels)) {
    const n = vertices(L2.batch);
    if (hosts.includes(id)) assert.ok(n > 300, `${id} 没有核心筒`);
    else assert.equal(n, 0, `${id} 不是宿主楼层`);
  }
  // 只用宿主楼层本已使用的材质（石材、哑光、金属、缎面、发光），外立面只用玻璃与金属
  const allowed = new Set(['stone', 'matte', 'metal', 'satin', 'glow']);
  for (const id of hosts) for (const k of keys(ctx.levels[id].batch)) assert.ok(allowed.has(k), `${id} 新材质 ${k}`);
  for (const k of keys(ctx.levels['P1-1F'].facadeBatch)) assert.ok(['glassTint', 'extMetal'].includes(k), k);
  assert.ok(vertices(ctx.levels['P1-1F'].facadeBatch) > 100, '街门雨棚');
  assert.ok(vertices(ctx.site.batch) > 100, '消防登高场地标线');
  assert.equal(stats.levels, 18);
  ctx.coreTriangles = stats.boxes * 12;
  assert.ok(ctx.coreTriangles < 30000, `核心筒 ${ctx.coreTriangles} 三角形`);
});

test('门禁：每个有门禁的楼层两个实例化网格，静态件进楼层批次；刷卡开门 0.35 s 动画、指示灯变色', () => {
  const ctx = context(L), api = buildAccessGates(ctx);
  const floors = [...new Set(L.accessControl.gates.flatMap((g) => g.floors))];
  let triangles = 0;
  for (const f of floors) {
    const inst = ctx.levels[f].base.children.filter((m) => m.isInstancedMesh);
    assert.ok(inst.length <= 2 && inst.length >= 1, `${f} ${inst.length} 个实例化网格`);
    assert.equal(ctx.levels[f].base.children.length, inst.length);
    for (const m of inst) triangles += m.count * 12;
    triangles += vertices(ctx.levels[f].batch) / 3;
  }
  assert.ok(floors.length <= 6);
  assert.ok(triangles < 10000, `门禁 ${triangles} 三角形`);
  const id = 'T2-1F-GATE', st = api.states.get(id);
  api.set(id, true); api.step(.2); assert.ok(st.t > .5 && st.t < 1);
  api.step(.2); assert.equal(st.t, 1); assert.equal(st.painted, 'granted');
  api.flash(id, 'denied'); assert.equal(st.painted, 'denied'); api.step(.7); assert.equal(st.painted, 'granted');
  api.resetAll(); assert.equal(st.t, 0); assert.equal(st.painted, 'idle');
  assert.equal(GATE_COLORS.idle, 0x3aa0ff);
  assert.equal(ctx.dynamic.filter((d) => d.name === 'access-gates').length, 1);
  // 漫游镜头经过 6 m 内时门禁打开
  ctx.dynamic[0].update(.5, 0, { state: { touring: true }, camera: { position: st.center.clone() } });
  assert.equal(st.target, 1);
});

test('门扇：关闭时横跨每条通道中心线，打开后离通道中心 ≥ 0.25 m', () => {
  for (const g of L.accessControl.gates) {
    const closed = gateLeafBoxes(g, 0), open = gateLeafBoxes(g, 1);
    const span = (b) => { const hw = Math.abs(Math.cos(b.ry)) * b.w / 2 + Math.abs(Math.sin(b.ry)) * b.d / 2, hd = Math.abs(Math.sin(b.ry)) * b.w / 2 + Math.abs(Math.cos(b.ry)) * b.d / 2;
      return { u0: b.u - hw, u1: b.u + hw, v0: b.v - hd, v1: b.v + hd }; };
    for (const l of g.lanes) {
      const c = (l.u0 + l.u1) / 2;
      assert.ok(closed.map(span).some((s) => s.u0 <= c && s.u1 >= c && s.v0 <= .05 && s.v1 >= -.05), `${g.id} 关闭门扇没有挡住通道 ${c}`);
      for (const s of open.map(span)) assert.ok(s.u1 <= c - .25 || s.u0 >= c + .25 || s.u1 < l.u0 || s.u0 > l.u1, `${g.id} 打开的门扇仍挡在通道 ${c}`);
    }
  }
});

test('一期楼层的用房、隔墙渲染在住户核心筒上不报错，且不重复绘制住户核心筒', () => {
  const levels = L.levels.filter((l) => l.building === 'P1');
  const layout = { ...L, buildings: L.buildings.filter((b) => b.id === 'P1'), levels, elevators: L.elevators.filter((e) => e.building === 'P1'),
    stairs: L.stairs.filter((s) => s.building === 'P1') };
  const ctx = context(layout);
  assert.doesNotThrow(() => { buildRooms(ctx); buildWalls(ctx); });
  const before = vertices(ctx.levels['P1-3F'].batch);
  for (const r of ctx.levels['P1-3F'].lv.rooms.filter((q) => q.residentialCore)) assert.equal(r.doors.length, 0);
  assert.ok(before > 0);
});

test('地铁闸机画成常开式：扇门收在机柜面上，不压通道中心线', () => {
  const gates = L.levels.flatMap((l) => l.features.filter((f) => f.type === 'gates'));
  assert.ok(gates.length > 0);
  for (const f of gates) {
    const n = Math.max(2, Math.round((f.z1 - f.z0) / (f.pitch || 0.95))), pitch = (f.z1 - f.z0) / n;
    const flaps = fareGateFlaps(f);
    assert.equal(flaps.length, n * 2);
    for (let i = 0; i < n; i++) {
      const c = f.z0 + (i + .5) * pitch;
      assert.ok(!flaps.some((q) => Math.abs(q.z - c) < q.d / 2 + .2), `闸机通道 ${c} 被扇门挡住`);
    }
  }
});

test('一期屋面与 4F–6F 楼板三角剖分正确：塔楼底板处挖空，核心筒井道开洞，面积守恒', () => {
  const area = (g) => { const p = g.attributes.position, idx = g.index; let a = 0;
    for (let i = 0; i < idx.count; i += 3) { const [A, B, C] = [0, 1, 2].map((k) => idx.getX(i + k));
      a += Math.abs((p.getX(B) - p.getX(A)) * (p.getZ(C) - p.getZ(A)) - (p.getX(C) - p.getX(A)) * (p.getZ(B) - p.getZ(A))) / 2; } return a; };
  const towers = L.buildings.filter((b) => b.community === 'north');
  for (const id of ['P1-RF', 'P1-4F', 'P1-5F', 'P1-6F', 'P1-1F', 'P1-B1']) {
    const lv = L.levels.find((l) => l.id === id);
    for (const piece of lv.slab.pieces.filter((p) => !p.stair)) {
      const g = flatShapeGeometry(shapeFromPoly(piece.outer, piece.holes), lv.elev);
      const want = Math.abs(polyArea(piece.outer)) - piece.holes.reduce((n, h) => n + Math.abs(polyArea(h)), 0);
      assert.ok(Math.abs(area(g) - want) < .5, `${id} 楼板三角剖分 ${area(g).toFixed(1)} ≠ ${want.toFixed(1)}`);
      g.dispose();
    }
  }
  // 屋面在两块塔楼底板处没有楼板网格
  const rf = L.levels.find((l) => l.id === 'P1-RF'), mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = rf.slab.pieces.map((p) => new THREE.Mesh(flatShapeGeometry(shapeFromPoly(p.outer, p.holes), rf.elev), mat));
  for (const b of towers) for (const [dx, dz] of [[-10, -4], [0, 4], [10, -6], [-14, 6]]) {
    const hit = new THREE.Raycaster(new THREE.Vector3(b.center[0] + dx, rf.elev + 1, b.center[1] + dz), new THREE.Vector3(0, -1, 0), 0, 2).intersectObjects(meshes);
    assert.equal(hit.length, 0, `${b.id} 底板下仍画了屋面楼板`);
  }
  for (const m of meshes) m.geometry.dispose();
  mat.dispose();
});

test('一期屋面女儿墙、玻璃栏板与压顶不进塔楼底板：底板范围内 34.05 m 以上没有屋面构件', () => {
  const rf = L.levels.find((l) => l.id === 'P1-RF'), P1 = L.buildings.find((b) => b.id === 'P1');
  const ctx = context({ ...L, buildings: [P1], levels: [rf] });
  ctx.buildings = { P1: { b: P1, levels: [ctx.levels['P1-RF']] } };
  buildShell(ctx);
  const plates = rf.towerPlates.map((t) => polyBounds(t.poly));
  assert.equal(plates.length, 2);
  let tris = 0, inside = 0;
  for (const B of [ctx.levels['P1-RF'].batch, ctx.levels['P1-RF'].shellBatch, ctx.levels['P1-RF'].facadeBatch]) for (const [key, s] of Object.entries(B.sets)) {
    for (let i = 0; i + 2 < s.n; i += 3) {
      const [x, y, z] = [0, 1, 2].map((k) => (s.pos[i * 3 + k] + s.pos[i * 3 + 3 + k] + s.pos[i * 3 + 6 + k]) / 3);
      tris++;
      if (y > 34.05 && plates.some((p) => x > p.x0 + .05 && x < p.x1 - .05 && z > p.z0 - .45 && z < p.z1 - .05)) { inside++; assert.fail(`${key} 三角形 (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) 在塔楼底板内`); }
    }
  }
  assert.ok(tris > 1000 && inside === 0);
  // 底板外的屋面边仍有栏板：T1 西侧 x[−280,−278] 与凹口 x[−239,−228]
  const glass = ctx.levels['P1-RF'].batch.sets.glass;
  const at = (x0, x1, z0, z1) => { for (let i = 0; i < glass.n; i++) { const x = glass.pos[i * 3], z = glass.pos[i * 3 + 2]; if (x > x0 && x < x1 && z > z0 && z < z1) return true; } return false; };
  assert.ok(at(-280.1, -277.9, -240.2, -239.8) && at(-239.2, -227.9, -228.3, -227.8) && at(-239.2, -238.8, -240, -228));
});
