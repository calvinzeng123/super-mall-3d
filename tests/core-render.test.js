// 核心筒、楼梯、电梯、门禁与避难层的渲染（supertall P0b · SPEC §2.2，合成记录 tests/fixtures/supertall-records.js）：
//   · refuge-floor.js 按 lv.refugePlan 画避难区、设备间、消防设施，≤ 3k 顶点；
//   · 楼梯分隔层（breakLevels）画第二樘门与隔墙，非分隔层不变；
//   · liftShaft()：门宽取自记录，经过不停的楼层画成实墙，消防专用停靠层有门和红色牌；
//   · buildElevators() 对封闭塔楼井道什么都不画（C-14），层门门槛由 landingDoors 实例画；
//   · 塔楼封闭井道的轿厢按塔实例化，大小取自记录（北苑 1.1 × 2.1 m 担架梯居中）；
//   · 门禁 role / leaf：leaf 'existing' 只画读卡器与标牌、没有玻璃门扇，拾取卡片按 role 写。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { stLayout } from './fixtures/supertall-records.js';
import { BatchSet } from '../src/render/batch.js';
import { buildRefugeFloor, REFUGE_FLOOR_MAX_VERTICES } from '../src/render/build/refuge-floor.js';
import { buildTowerStairGeometry, stairBreak } from '../src/render/build/tower-stairs.js';
import { towerStairPlan } from '../src/layout/tower-stairs.js';
import { liftShaft, liftLanding, Columns } from '../src/render/build/community.js';
import { buildElevators } from '../src/render/build/elevators.js';
import { buildTowerElevators, closedTowerShaft, cabinSize } from '../src/render/build/tower-elevators.js';
import { gateLeafBoxes, gateStatics, gatePickInfo, gateSignText } from '../src/render/build/access-gates.js';
import { renderContext } from './render-context.js';

const SL = stLayout();
const mats = new Proxy({}, { get: (m, k) => (m[k] ||= Object.assign(new THREE.MeshBasicMaterial({ vertexColors: true }), { name: k })) });
const countBoxes = (fn) => { const B = new BatchSet(mats), g = new THREE.Group(); fn(B); B.flush(g); const out = {}; for (const m of g.children) out[m.material.name] = m.geometry.attributes.position.count; return out; };

test('避难层室内（refuge-floor.js，来自 lv.refugePlan）：避难区地面与黄色边线、两间设备房（水箱 / 水泵 / 风机）、消防设施；≤ 3k 顶点', () => {
  const lv = SL.levels.find((l) => l.id === 'ST-10F');
  const ctx = { mats: { base: mats }, bById: { ST: SL.buildings[0] } };
  const r = buildRefugeFloor(ctx, { lv, base: new THREE.Group() });
  assert.ok(r.vertices > 300 && r.vertices <= REFUGE_FLOOR_MAX_VERTICES, `${r.vertices} 顶点`);
  const names = r.group.children.map((m) => m.material.name).sort();
  for (const k of ['concrete', 'extSatin', 'glowSoft']) assert.ok(names.includes(k), `缺 ${k}`);
  // The 避难区 floor lies inside the area poly, at the storey's elevation.
  const fl = r.group.children.find((m) => m.material.name === 'concrete');
  fl.geometry.computeBoundingBox();
  assert.ok(fl.geometry.boundingBox.min.y >= lv.elev - .05 && fl.geometry.boundingBox.max.y <= lv.elev + lv.height);
  // A level without a plan builds nothing.
  assert.equal(buildRefugeFloor(ctx, { lv: { ...lv, refugePlan: null } }).vertices, 0);
});

test('楼梯分隔（breakLevels）：分隔层有第二樘门（缺省镜像，或 breakDoors 指定）和隔墙，非分隔层与以前一样', () => {
  const [st] = SL.stairs, p = towerStairPlan(st);
  const b10 = stairBreak(st, p, 'ST-10F'), b20 = stairBreak(st, p, 'ST-20F');
  assert.equal(stairBreak(st, p, 'ST-12F'), null);
  assert.equal(b10.doors.length, 2);
  const px = b10.partition.x0;
  assert.ok((b10.doors[0].x0 + b10.doors[0].x1) / 2 > px !== (b10.doors[1].x0 + b10.doors[1].x1) / 2 > px, '两樘门应在隔墙两侧');
  assert.deepEqual(b20.doors[1], st.breakDoors['ST-20F'].door2);
  const draw = (levelId) => countBoxes((B) => B.frame(st.frame, () => buildTowerStairGeometry(B, { access: { protected: true, flights: [], surfaces: [] } }, SL.levels.filter((l) => l.id === levelId), [{ ...st, serves: [levelId] }], { flights: false })));
  const plain = draw('ST-12F'), split = draw('ST-10F');
  // +1 wall segment, +1 lintel, the partition (concrete); one parked leaf per door instead of two; +1 exit sign and 2 plates.
  assert.ok(split.concrete > plain.concrete, `分隔层墙体 ${split.concrete} / ${plain.concrete}`);
  assert.ok(split.glowSoft > plain.glowSoft, '分隔层缺少第二个安全出口标识 / 避难层牌');
});

test('liftShaft：门宽取自记录；经过不停的楼层（landing false）门一侧是实墙；消防专用停靠层有门和红色牌', () => {
  const pal = { core: '#d5ccbc', frame: '#3e3b37' }, F = { ox: 0, oz: 0, deg: 0, a: 0, c: 1, s: 0 };
  const L0 = { id: 'X', rect: { x0: -1, z0: -3, x1: .9, z1: 0 }, door: 'S' };
  const run = (Lr, landing) => { const col = new Columns(); return countBoxes((B) => { liftShaft(B, col, F, Lr, 10, 3.3, pal, landing); col.flush(B); }); };
  const normal = run(L0, 'normal'), blank = run(L0, null), fire = run(L0, 'fire'), narrow = run({ ...L0, doorWidth: 1.0 }, 'normal');
  assert.ok(!blank.extMetal && normal.extMetal, '不停的楼层不应有门头');
  assert.ok(fire.extMetal > normal.extMetal, '消防专用层缺少红色牌');
  assert.equal(narrow.facadePlaster, normal.facadePlaster);
  // landing kind from the records: fireOnly → 'fire'; landing false → null; absent → today's door.
  const recs = new Map(SL.elevators.map((e) => [e.id, e]));
  assert.equal(liftLanding({ id: 'ST-S' }, { id: 'ST-1F' }, recs), 'fire');
  assert.equal(liftLanding({ id: 'ST-S', landing: true }, { id: 'ST-2F' }, recs), 'normal');
  assert.equal(liftLanding({ id: 'ST-L1', landing: false }, { id: 'ST-10F' }, recs), null);
  assert.equal(liftLanding({ id: 'T1-LW' }, { id: 'T1-15F' }, new Map()), 'normal');
});

test('C-14：buildElevators 对封闭塔楼井道一个面片都不画（西苑 / 北苑），玻璃与外挂电梯照画', () => {
  const ctx = renderContext(L);
  const batches = new Map();
  for (const lv of L.levels) ctx.levels[lv.id].batch = { frame: (F, fn) => fn(), get: (k) => ({ box: () => batches.set(lv.id, (batches.get(lv.id) || 0) + 1) }) };
  ctx.root = new THREE.Group();
  buildElevators(ctx);
  const closed = L.elevators.filter((e) => closedTowerShaft(ctx, e));
  assert.ok(closed.length >= 12 && closed.every((e) => ['W1', 'W2', 'T1', 'T2'].includes(e.building)), closed.map((e) => e.id).join(' '));
  for (const id of ['W1-12F', 'T1-16F', 'W2-RF']) assert.ok(!batches.has(id), `${id} 仍画了井道玻璃`);
  for (const e of L.elevators.filter((q) => q.type === 'glass' || q.exterior)) assert.ok(e.serves.some((id) => batches.has(id)), `${e.id} 没有井道`);
});

test('封闭井道轿厢按塔实例化（每种材质一个 InstancedMesh + 门扇一个），轿厢尺寸取自记录；车厢 API 不变', () => {
  const ctx = renderContext(L);
  buildTowerElevators(ctx);
  const w1 = ctx.buildings.W1.group, inst = w1.children.filter((o) => o.isInstancedMesh && o.userData.towerCars);
  // One set per cabin size (W1's three cars come in two sizes): ≤ 5 meshes each, instead of 7 meshes per car.
  assert.ok(inst.length >= 5 && inst.length <= 10, `${inst.length} 个实例网格`);
  const doors = inst.filter((im) => im.name.endsWith('car-doors'));
  assert.equal(doors.reduce((n, im) => n + im.count, 0), 2 * 3, '每台轿厢两扇门');
  const car = ctx.elevatorCars.get('W1-L1');
  car.set(20, .5, '7F');
  assert.equal(car.group.position.y, 20);
  assert.equal(car.open, .5);
  // Hidden cars collapse to zero scale; the meshes hide when no car of the tower shows.
  for (const c of ['W1-L1', 'W1-L2', 'W1-L3']) ctx.elevatorCars.get(c).group.visible = false;
  for (const d of ctx.dynamic.filter((q) => q.name?.startsWith('W1-cars'))) d.update(0, 0, {});
  assert.ok(inst.every((im) => !im.visible));
  // Cabin size from e.car (北苑 K4: 1.1 × 2.1 m stretcher car, centred), else the shaft less 0.13 m a side.
  assert.deepEqual(cabinSize({ door: 'S', w: 1.9, d: 3.0, car: { w: 1.1, d: 2.1 } }), { hw: .55, hd: 1.05 });
  const e = L.elevators.find((q) => q.id === 'T1-LF'), s = cabinSize(e);
  assert.ok(Math.abs(s.hw - (e.w - .26) / 2) < 1e-9);
  // Mall / glass / exterior lifts keep one group per car.
  assert.ok(ctx.elevatorCars.get('P1-C-GW').group.children.length >= 4);
});

test('门禁 role / leaf：既有门洞（leaf existing）只画读卡器与标牌，没有玻璃门扇；标牌与拾取卡片按 role 写，都写「火灾时自动释放」', () => {
  const [entry, exit, reentry] = SL.accessControl.gates;
  assert.ok(gateLeafBoxes(entry, 0).length >= 2);
  assert.equal(gateLeafBoxes(exit, 0).length, 0);
  assert.equal(gateLeafBoxes(reentry, 1).length, 0);
  const sidelit = { ...entry, line: { u0: 0, u1: 3 }, lanes: [{ u0: .5, u1: 2.5 }] };
  const own = countBoxes((B) => gateStatics(B, sidelit, 0)), existing = countBoxes((B) => gateStatics(B, reentry, 0));
  assert.ok(own.glass > 0 && !existing.glass, '既有门洞不应画侧挡玻璃');
  assert.equal(existing.metal, 2 * 36, '读卡器 + 标牌两个盒子');
  assert.deepEqual(gateSignText(exit), { cn: '仅供疏散 · 外侧刷卡', sub: '火灾时自动释放' });
  assert.deepEqual(gateSignText({ ...reentry, sign: null }), { cn: '住户楼层 · 刷卡进入', sub: '火灾时自动释放' });
  assert.match(gatePickInfo(SL, exit)[1], /仅供疏散 · 外侧刷卡 · 火灾时自动释放/);
  assert.match(gatePickInfo(SL, reentry)[1], /住户楼层 · 刷卡进入 · 火灾时自动释放/);
  // Today's gates (no role / leaf) draw as before.
  for (const g of L.accessControl.gates) assert.ok(gateLeafBoxes(g, 0).length > 0, g.id);
});
