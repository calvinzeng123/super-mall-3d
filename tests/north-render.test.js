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
import { buildAccessGates, gateLeafBoxes, gateLeds, gatePickInfo, GATE_COLORS } from '../src/render/build/access-gates.js';
import { clearHeight } from '../src/render/build/shell.js';
import { toW } from '../src/layout/geom.js';
import { fareGateFlaps } from '../src/render/build/metro.js';
import { shapeFromPoly, flatShapeGeometry, buildShell } from '../src/render/build/shell.js';
import { buildP1ExpansionExterior } from '../src/render/build/p1-expansion.js';
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
  // 只用宿主楼层本已使用的材质（地上石材、地库混凝土、哑光、金属、缎面、玻璃、发光）；逐层核对见下一条
  const allowed = new Set(['stone', 'concrete', 'matte', 'metal', 'satin', 'glass', 'glow']);
  for (const id of hosts) for (const k of keys(ctx.levels[id].batch)) assert.ok(allowed.has(k), `${id} 新材质 ${k}`);
  for (const id of ['P1-B2', 'P1-B1']) assert.ok(!keys(ctx.levels[id].batch).has('stone'), `${id} 地库批次没有石材`);
  for (const k of keys(ctx.levels['P1-1F'].facadeBatch)) assert.ok(['glassTint', 'extMetal'].includes(k), k);
  assert.ok(vertices(ctx.levels['P1-1F'].facadeBatch) > 100, '街门雨棚');
  assert.ok(vertices(ctx.site.batch) > 100, '消防登高场地标线');
  assert.equal(stats.levels, 18);
  ctx.coreTriangles = stats.boxes * 12;
  assert.ok(ctx.coreTriangles < 30000, `核心筒 ${ctx.coreTriangles} 三角形`);
});

test('住户核心筒不给宿主楼层新增材质批次（绘制调用 +0）：每层只用该层外壳、用房与一期立面已有的材质', (t) => {
  const previous = globalThis.document;
  const paint = new Proxy({}, { get: (p, k) => (k in p ? p[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}), set: (p, k, v) => { p[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
  t.after(() => { if (previous) globalThis.document = previous; else delete globalThis.document; });
  const P1 = L.buildings.find((b) => b.id === 'P1'), levels = L.levels.filter((l) => hosts.includes(l.id));
  const ctx = context({ ...L, buildings: [P1], levels, stairs: L.stairs.filter((s) => s.building === 'P1'), elevators: L.elevators.filter((e) => e.building === 'P1') });
  ctx.mats.screen = () => ctx.mats.base.screen;
  ctx.buildings = { P1: { b: P1, levels: levels.map((l) => ctx.levels[l.id]) } };
  buildShell(ctx); buildRooms(ctx); buildP1ExpansionExterior(ctx);
  const sets = ['batch', 'facadeBatch'], before = Object.fromEntries(hosts.map((id) => [id, sets.map((k) => keys(ctx.levels[id][k]))]));
  ctx.layout = L;
  buildResidentialCores(ctx);
  for (const id of hosts) sets.forEach((k, i) => {
    const fresh = [...keys(ctx.levels[id][k])].filter((q) => !before[id][i].has(q));
    assert.deepEqual(fresh, [], `${id} ${k} 新增材质批次 ${fresh.join(',')}`);
  });
});

test('T2 核心筒立在 3F–6F 退台凹口里的外露面按外墙画进立面批次：外景从西、北两面都看到石材墙，不见旧立面与悬空楼板', () => {
  const faces = Object.fromEntries(L.levels.filter((l) => l.residentialCoreFaces).map((l) => [l.id, l.residentialCoreFaces]));
  assert.deepEqual(Object.keys(faces), ['P1-3F', 'P1-4F', 'P1-5F', 'P1-6F']);
  for (const [id, list] of Object.entries(faces)) {
    assert.ok(list.every((f) => f.building === 'T2'));
    const south = id === 'P1-3F' ? -234 : -228;
    assert.deepEqual(list.map((f) => [f.x0, f.z0, f.x1, f.z1, f.nx, f.nz]).sort(), [[-216, -240, -212, -240, 0, -1], [-216, -240, -216, south, -1, 0]].sort(), id);
  }
  const ctx = context(L);
  buildResidentialCores(ctx);
  const meshes = [];
  for (const id of Object.keys(faces)) { const L2 = ctx.levels[id]; L2.facadeBatch.flush(L2.facade); L2.facade.updateMatrixWorld(true); meshes.push(...L2.facade.children); }
  for (const m of meshes) m.material.side = THREE.DoubleSide;
  const rc = new THREE.Raycaster();
  for (const id of Object.keys(faces)) {
    const lv = L.levels.find((l) => l.id === id), south = id === 'P1-3F' ? -234 : -228;
    for (const y of [lv.elev + .2, lv.elev + lv.height / 2, lv.elev + lv.height - .2]) {
      for (let z = -239.8; z < south - .2; z += 1.1) {
        rc.set(new THREE.Vector3(-232, y, z), new THREE.Vector3(1, 0, 0)); rc.far = 30;
        const hit = rc.intersectObjects(meshes, false)[0];
        assert.ok(hit && hit.point.x > -216.15 && hit.point.x < -215.95, `${id} 西面 z ${z.toFixed(1)} y ${y.toFixed(1)} → ${hit?.point.x}`);
      }
      for (const x of [-215.8, -214, -212.2]) {
        rc.set(new THREE.Vector3(x, y, -250), new THREE.Vector3(0, 0, 1)); rc.far = 30;
        const hit = rc.intersectObjects(meshes, false)[0];
        assert.ok(hit && hit.point.z > -240.15 && hit.point.z < -239.95, `${id} 北面 x ${x} y ${y.toFixed(1)} → ${hit?.point.z}`);
      }
    }
  }
  for (const m of meshes) m.geometry.dispose();
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
  // 本包（北苑）的门禁只在一期 B2/B1/1F；合并后西苑门禁在各自楼栋楼层上，单独计
  const north = [...new Set(L.accessControl.gates.filter((g) => /^T[12]-/.test(g.zone)).flatMap((g) => g.floors))];
  assert.ok(north.length >= 3 && north.length <= 6, `北苑门禁楼层 ${north.join(',')}`);
  assert.ok(north.every((f) => f.startsWith('P1-')));
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

test('门禁指示灯装在机柜顶面上（不悬在通道里）；拾取卡片按门禁所属楼栋命名', () => {
  for (const g of L.accessControl.gates.filter((q) => q.kind === 'speed-gates')) {
    const leds = gateLeds(g);
    assert.equal(leds.length, g.lanes.length);
    for (const d of leds) {
      assert.ok(g.cabinets.some((c) => d.u > c.u0 && d.u < c.u1 && d.v > c.v0 && d.v < c.v1), `${g.id} 指示灯 u ${d.u} 不在机柜上`);
      assert.ok(!g.lanes.some((l) => d.u > l.u0 && d.u < l.u1), `${g.id} 指示灯悬在通道里`);
      assert.ok(d.y >= 1.05 && d.y < 1.1);
    }
  }
  for (const g of L.accessControl.gates.filter((q) => /^T[12]-/.test(q.zone))) {
    const [title, desc] = gatePickInfo(L, g);
    assert.equal(title, `云澜·北苑 ${g.zone[1]} 号楼 · 住户门禁`);
    assert.ok(desc.startsWith(g.name));
  }
  // 合并后的西苑门禁（记录带 building）不再被叫成北苑
  const west = { id: 'W1-1F-GATE', zone: 'W1-1F-zone', building: 'W1', name: '西苑 1 号楼 · 住户门禁' };
  const layout = { buildings: [{ id: 'W1', name: '云澜·西苑 1 号楼' }], accessControl: { zones: [{ id: 'W1-1F-zone', building: 'W1' }] } };
  assert.equal(gatePickInfo(layout, west)[0], '云澜·西苑 1 号楼 · 住户门禁');
  assert.equal(gatePickInfo(layout, { ...west, building: undefined })[0], '云澜·西苑 1 号楼 · 住户门禁');
});

test('门线上方封到吊顶：玻璃门框上有玻璃亮子、3.05 m 以上石材过梁；商场侧闸机口两樘玻璃门常开贴墙', () => {
  const ctx = context(L);
  buildResidentialCores(ctx); buildAccessGates(ctx);
  const rc = new THREE.Raycaster(), meshes = (id) => { const L2 = ctx.levels[id]; if (!L2.flushed) { L2.batch.flush(L2.base); L2.base.updateMatrixWorld(true); L2.flushed = true; }
    return L2.base.children.filter((m) => !m.isInstancedMesh); };
  for (const g of L.accessControl.gates.filter((q) => /^T[12]-/.test(q.zone))) {
    const lv = L.levels.find((l) => l.id === g.floors[0]), H = clearHeight(lv), list = meshes(lv.id);
    for (const m of list) m.material.side = THREE.DoubleSide;
    const ys = [...(g.kind === 'glass-door' ? [2.5, 2.9] : []), 3.2, H - .15].filter((y) => y < H);
    for (const l of g.lanes) for (const y of ys) {
      const c = (l.u0 + l.u1) / 2, [ax, az] = toW(g.frame, c, -1), [bx, bz] = toW(g.frame, c, 1);
      rc.set(new THREE.Vector3(ax, lv.elev + y, az), new THREE.Vector3(bx - ax, 0, bz - az).normalize()); rc.far = 2;
      const hit = rc.intersectObjects(list, false)[0];
      assert.ok(hit && hit.distance > .7 && hit.distance < 1.2, `${g.id} 通道 ${c} 高 ${y.toFixed(2)} m 门线上方敞开`);
    }
    if (g.kind === 'speed-gates') {
      // 常开的玻璃门折贴在门口两侧的大堂墙面上（住户一侧），不挡闸机通道
      for (const u of [g.line.u0 - .8, g.line.u1 + .8]) {
        const [ax, az] = toW(g.frame, u, .8), [bx, bz] = toW(g.frame, u, 0);
        rc.set(new THREE.Vector3(ax, lv.elev + 1.5, az), new THREE.Vector3(bx - ax, 0, bz - az).normalize()); rc.far = 1;
        const hit = rc.intersectObjects(list, false)[0];
        assert.ok(hit && hit.distance > .6 && hit.distance < .72, `${g.id} 门口两侧没有常开玻璃门 (${hit?.distance})`);
      }
      for (const l of g.lanes) assert.ok(l.u0 >= g.line.u0 && l.u1 <= g.line.u1);
    }
  }
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
