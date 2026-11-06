// 社区住宅数据契约：手工搭建的最小西苑塔楼（2 层）与北苑塔楼（14F 复式下层 + 15F 上层）通过契约，
// 逐项删去必需字段时给出点名的错误。西苑 / 北苑的实现包与社区渲染器都以此为接口。
import test from 'node:test';
import assert from 'node:assert/strict';
import { frame, rect, lrectPoly, polyBounds } from '../src/layout/geom.js';
import { lift } from '../src/layout/mall.js';
import { towerStairPlan } from '../src/layout/tower-stairs.js';
import { communityContractErrors } from '../src/layout/community-contract.js';
import { communityUnit, COMMUNITY_ACCENT, COMMUNITY_CATEGORY } from '../src/layout/community-units.js';
import { NORTH_SITE, WEST_SITE } from '../src/layout/community-sites.js';
import { COMMUNITY_PLANS } from '../src/layout/community-plan-data.js';
import { GATE, SPEED_LANES, SPEED_CABINETS, gateRecord, zoneRecord, gateRecordErrors } from '../src/layout/access-records.js';
import { refugeLevel } from '../src/layout/refuge.js';

const P1_HOSTS = [['B2', -12], ['B1', -8.4], ['B1M', -4.5], ['1F', 0], ['2F', 6.5], ['3F', 12], ['4F', 17.5], ['5F', 23], ['6F', 28.5]];
const level = (id, building, short, elev, height, kind, F, footprint) => ({
  id, building, short, elev, height, kind, ...(/^\d+F$/.test(short) ? { levelNumber: parseInt(short, 10) } : {}),
  name: `${short}`, units: [], rooms: [], walk: [], voids: [], features: [],
  slab: { pieces: [{ outer: lrectPoly(F, footprint), holes: [], localRect: footprint }] },
});
function core(lv, F, coreRect, stairs, lifts) {
  lv.corePlan = { kind: 'community', frame: F, core: coreRect,
    landings: [{ id: `${lv.id}-landing`, rect: rect(coreRect.x0, coreRect.z0 + 3.2, coreRect.x1, coreRect.z0 + 6.4), open: true }],
    lifts: lifts.map((e) => ({ id: e.id, rect: rect(e.lu - e.w / 2, e.lv - e.d / 2, e.lu + e.w / 2, e.lv + e.d / 2), door: e.door })),
    stairs: stairs.map((s) => ({ id: s.id, rect: s.rect, door: s.door, shaftRect: s.shaftRect, landingRect: s.landingRect })) };
  for (const s of stairs) {
    const poly = lrectPoly(F, s.shaftRect);
    lv.voids.push({ id: `${s.id}-void`, kind: 'stair', frame: F, rect: s.shaftRect, poly, stair: s.id, residentialCore: s.residentialCore });
    lv.slab.pieces[0].holes.push(poly);
  }
  for (const e of lifts) {
    const inner = rect(e.lu - e.w / 2 + .09, e.lv - e.d / 2 + .09, e.lu + e.w / 2 - .09, e.lv + e.d / 2 - .09), poly = lrectPoly(F, inner);
    lv.voids.push({ id: `${e.id}-void`, kind: 'shaft', frame: F, rect: inner, poly, elevator: e.id });
    lv.slab.pieces[0].holes.push(poly);
  }
}
function stair(id, building, F, r, door, serves, extra = {}) {
  const s = { id, building, residentialCore: building, frame: F, rect: r, poly: lrectPoly(F, r), door, serves, ...extra };
  const plan = towerStairPlan(s);
  return Object.assign(s, { continuous: true, shaftRect: plan.shaftRect, landingRect: plan.landingRect });
}
const tower = (b, F, footprint) => {
  const outline = lrectPoly(F, footprint);
  return { kind: 'tower', usage: 'community', campusGroup: 'P1', accent: COMMUNITY_ACCENT[b.community], frame: F, footprint, outline,
    bounds: polyBounds(outline), center: [F.ox, F.oz], radius: Math.hypot(footprint.x1 - footprint.x0, footprint.z1 - footprint.z0) / 2, ...b };
};

/** 云澜·西苑 1 号楼：1F 社区大堂 + 2F 一套三房。 */
function westFixture() {
  const [cx, cz] = WEST_SITE.towers[0].center, c = WEST_SITE.towers[0].core[0];
  const F = frame(cx, cz, 0, 'W1'), footprint = rect(-21.7, -9.6, 21.7, 9.6);
  const lvs = [level('W1-1F', 'W1', '1F', 0, 4.5, 'lobby', F, footprint), level('W1-2F', 'W1', '2F', 4.5, 3, 'community', F, footprint)];
  const ids = lvs.map((l) => l.id);
  const stairs = [stair('W1-ST-A', 'W1', F, rect(c, -9.6, c + 3.6, -1.2), { x0: c + 1.1, z0: -1.2, x1: c + 2.5, z1: -1.2, side: 'S' }, ids)];
  const lifts = [{ ...lift('W1-L1', 'W1', 'passenger', F, c + 4.975, -5.4, 2.6, 2.4, 'E', ids), tower: true, residentialCore: 'W1', label: '西苑客梯 1', role: 'passenger' }];
  for (const lv of lvs) core(lv, F, rect(c, -9.6, c + 15.7, -1.2), stairs, lifts);
  lvs[0].lobbyPlan = { kind: 'community-lobby', frame: F, zones: [{ id: 'entry', kind: 'entry', name: '入口门厅', rect: rect(-4, 3, 4, 9.6) }],
    obstacles: [], partitions: [], circulation: [rect(-4, -1.2, 4, 9.6)] };
  const u = COMMUNITY_PLANS.west.W1.units[0];
  lvs[1].units.push(communityUnit({ lv: lvs[1], building: 'W1', id: 'W1-2F-SW', code: 'W1-0201', slot: '01',
    frame: frame(cx + u.x0, cz + 0.6, 0, 'W1-2F-SW'), plan: u.plan, name: '云澜·西苑 1 号楼 0201', en: 'YUNLAN WEST GARDEN 1-0201' }));
  const b = tower({ id: 'W1', community: 'west', name: '云澜·西苑 1 号楼', short: '西苑1', en: 'YUNLAN WEST GARDEN 1',
    height: 7.5, storeys: 2, levels: ids, entryLevel: 'W1-1F', stackedOn: null, stairLevelIds: ids,
    fireFrontage: [-480, -436.6], hardstand: { x0: -480, z0: -221.8, x1: -436.6, z1: -211.8 },
    access: { protected: true, surfaces: [], flights: [], routes: [] } }, F, footprint);
  return { b, layout: { buildings: [b], levels: lvs, elevators: lifts, stairs, entrances: [] } };
}

/** 云澜·北苑 1 号楼：14–15W 错层复式的下层（14F）与上层（15F），核心筒穿过一期宿主楼层。 */
function northFixture() {
  const T = NORTH_SITE.towers[0], F = frame(...T.frame, 0, 'T1'), footprint = rect(-18, -8, 18, 8);
  const hosts = P1_HOSTS.map(([s, elev]) => level(`P1-${s}`, 'P1', s, elev, 5.5, 'retail', frame(0, 0, 0), rect(-300, -300, 0, 0)));
  const own = NORTH_SITE.levels.filter((l) => ['14F', '15F'].includes(l.short))
    .map((l) => level(`T1-${l.short}`, 'T1', l.short, l.elev, l.height, l.kind, F, footprint));
  const hostIds = hosts.map((l) => l.id), ownIds = own.map((l) => l.id), all = [...hostIds, ...ownIds];
  const serves = [...NORTH_SITE.hostDoorLevels, ...ownIds];
  const stairs = [stair('T1-ST-A', 'T1', F, rect(-4, -1.6, -0.2, 8), { x0: -1.35, z0: -1.6, x1: -0.25, z1: -1.6, side: 'N' }, serves, { passLevels: [...NORTH_SITE.hostPassLevels] })];
  const lifts = [{ ...lift('T1-LF', 'T1', 'passenger', F, 0, -6.3, 2.6, 3, 'S', serves), tower: true, residentialCore: 'T1', label: '北苑消防电梯', role: 'fire', fire: true, shaftLevels: all }];
  for (const lv of own) core(lv, F, rect(-4, -8, 4, 8), stairs, lifts);
  const hm = COMMUNITY_PLANS.north.T1.homes.find((h) => h.id === 'T1-14W');
  const UF = frame(T.core[0], -240, 90, 'T1-W');
  const [lower, upper] = hm.parts.map((p, i) => communityUnit({ lv: own[i], building: 'T1', id: `${ownIds[i]}-W`,
    code: `T1-1415W-${i ? 'U' : 'L'}`, slot: 'W', frame: UF, plan: p.plan,
    name: `云澜·北苑 1 号楼 14–15W 复式 · ${i ? '上层' : '下层'}`, en: `YUNLAN NORTH RESIDENCE 1 · 1415W ${i ? 'UPPER' : 'LOWER'}`,
    catLabel: '五房两厅复式 · 448㎡', home: hm.id, homeLevels: ownIds, partner: `${ownIds[1 - i]}-W`, ...(i ? { fronts: [] } : {}) }));
  own[0].units.push(lower); own[1].units.push(upper);
  const hole = lrectPoly(UF, upper.residence.homeStair.upperHole);
  own[1].voids.push({ id: `${upper.id}-stair`, kind: 'home-stair', unit: upper.id, poly: hole });
  own[1].slab.pieces[0].holes.push(hole);
  for (const [i, v] of (upper.residence.voids || []).entries()) {
    const poly = lrectPoly(UF, v);
    own[1].voids.push({ id: `${upper.id}-void-${i}`, kind: 'home-void', unit: upper.id, poly });
    own[1].slab.pieces[0].holes.push(poly);
  }
  const st = lower.residence.homeStair, landing = `${lower.id}-home-landing`;
  const at = (q, y, floor) => { const [x, z] = [UF.ox - q[1], UF.oz + q[0]]; return { x, z, y, floor }; };
  const [A, B] = st.flights;
  const flights = [
    { id: `${lower.id}-stair-A`, kind: 'interior-stair', from: ownIds[0], to: landing, bottom: at(A.bottom, own[0].elev, ownIds[0]), top: at(A.top, own[0].elev + st.landingY, landing), width: A.width },
    { id: `${lower.id}-stair-B`, kind: 'interior-stair', from: landing, to: ownIds[1], bottom: at(B.bottom, own[0].elev + st.landingY, landing), top: at(B.top, own[1].elev, ownIds[1]), width: B.width },
  ];
  const b = tower({ id: 'T1', community: 'north', name: '云澜·北苑 1 号楼', short: '北苑1', en: 'YUNLAN NORTH RESIDENCE 1',
    height: 67.2, storeys: 2, levels: ownIds, entryLevel: 'P1-1F', stackedOn: 'P1', hostLevels: hostIds, stairLevelIds: all,
    fireFrontage: [...T.plate], hardstand: { ...T.hardstand }, addition: 'p1-podium',
    access: { protected: true, surfaces: [{ id: landing, parentFloor: ownIds[0], elev: own[0].elev + st.landingY, poly: lrectPoly(UF, st.landing) }], flights, routes: [] } }, F, footprint);
  return { b, layout: { buildings: [b], levels: [...hosts, ...own], elevators: lifts, stairs, entrances: [] } };
}

/** 西苑 1 号楼 with a 3F 避难层 (supertall P0a: kind 'refuge' from refugeLevel()); L1 passes it, the fire lift F1 lands. */
function refugeFixture() {
  const fx = westFixture(), { b, layout } = fx, F = b.frame, c = WEST_SITE.towers[0].core[0];
  const lv = refugeLevel({ id: 'W1-3F', building: 'W1', short: '3F', elev: 7.5, height: 4.5, frame: F, footprint: rect(-21.7, -9.6, 21.7, 9.6), face: 'S',
    areas: [{ id: 'W1-3F-refuge', rect: rect(-9, 0.6, 9, 9.6) }], corridors: [rect(-21.7, -1.2, 21.7, 0.6)],
    plant: [{ id: 'W1-3F-plant-SW', name: '消防水池 · 水泵', rect: rect(-21.7, 0.6, -9, 9.6), rating: '2.00h' }],
    windows: [{ edge: 'S', span: [-9, 9], kind: 'fire-window-B' }], persons: 120, serves: ['W1-2F'] });
  layout.levels.push(lv);
  const ids = [...b.levels, lv.id];
  Object.assign(b, { levels: ids, stairLevelIds: ids, storeys: 3, height: 12 });
  layout.stairs[0].serves = ids;
  const fire = { ...lift('W1-F1', 'W1', 'passenger', F, c + 7.575, -5.4, 2.6, 2.4, 'E', ids), tower: true, residentialCore: 'W1', label: '西苑消防电梯', role: 'fire', speed: 3 };
  layout.elevators.push(fire);
  for (const l of layout.levels) {
    if (l.building !== 'W1') continue;
    if (l === lv) core(l, F, rect(c, -9.6, c + 15.7, -1.2), layout.stairs, layout.elevators);
    else {
      const inner = rect(fire.lu - fire.w / 2 + .09, fire.lv - fire.d / 2 + .09, fire.lu + fire.w / 2 - .09, fire.lv + fire.d / 2 - .09), poly = lrectPoly(F, inner);
      l.voids.push({ id: `${fire.id}-void`, kind: 'shaft', frame: F, rect: inner, poly, elevator: fire.id });
      l.slab.pieces[0].holes.push(poly);
      l.corePlan.lifts.push({ id: fire.id, rect: rect(fire.lu - fire.w / 2, fire.lv - fire.d / 2, fire.lu + fire.w / 2, fire.lv + fire.d / 2), door: fire.door });
    }
  }
  return fx;
}

test('最小西苑塔楼与北苑复式塔楼满足社区契约', () => {
  for (const fx of [westFixture(), northFixture()]) assert.deepEqual(communityContractErrors(fx.layout, fx.b), [], fx.b.id);
  // supertall P0a: a refuge level (kind 'refuge', no homes, a refugePlan) passes the west contract
  const rf = refugeFixture();
  assert.deepEqual(communityContractErrors(rf.layout, rf.b), [], 'W1 + 3F 避难层');
  assert.equal(rf.layout.levels.find((l) => l.id === 'W1-3F').name, '3F 避难层');
  const { layout } = northFixture();
  assert.deepEqual(communityContractErrors(layout, 'T1'), []);
  assert.deepEqual(communityContractErrors(layout, 'nope'), ['building: missing']);
});

test('社区单元工厂：复式下层围合楼梯、梯段 B 下方为实体，上层围栏杆且无门面', () => {
  const { layout } = northFixture();
  const [lower, upper] = ['T1-14F', 'T1-15F'].map((id) => layout.levels.find((l) => l.id === id).units[0]);
  assert.deepEqual(lower.residence.obstacles.find((o) => o.id === 'home-stair-under-B').rect, rect(1.35, 1.35, 2.35, 3.85));
  const walls = lower.residence.partitions.filter((p) => p.role === 'stair-wall');
  // 楼梯块 x[0,2.5] z[0,4]：东侧整面墙，北（后）侧只留梯段 A 的入口 x[0.1,1.2]
  assert.ok(walls.some((p) => p.a[0] === 2.5 && p.b[0] === 2.5 && p.a[1] === 0 && p.b[1] === 4));
  assert.ok(walls.some((p) => p.a[1] === 4 && p.a[0] === 1.2 && p.b[0] === 2.5));
  assert.ok(!walls.some((p) => p.a[1] === 4 && p.b[1] === 4 && p.a[0] < 1.2 - 1e-6 && p.b[0] > 0.1 + 1e-6), '梯段 A 入口被封');
  const rails = upper.residence.partitions.filter((p) => p.role === 'railing');
  assert.ok(rails.length >= 2);
  assert.ok(!rails.some((p) => p.a[1] === 3.9 && p.b[1] === 3.9 && p.b[0] > 1.3 + 1e-6), '梯段 B 到达口被栏杆挡住');
  assert.deepEqual(upper.fronts, []); assert.deepEqual(upper.wfronts, []);
  assert.equal(upper.residence.entryDoor, null);
  assert.equal(upper.residence.partner, lower.id); assert.equal(lower.residence.partner, upper.id);
  assert.deepEqual(lower.residence.homeLevels, ['T1-14F', 'T1-15F']);
  assert.equal(lower.residence.community, 'north');
  assert.equal(lower.brand.cat, 'community'); assert.equal(lower.brand.bg, COMMUNITY_ACCENT.north);
  assert.equal(lower.fronts.length, 1);
  // 原始数据不被工厂改写
  const plan = COMMUNITY_PLANS.north.T1.homes.find((h) => h.id === 'T1-14W').parts[0].plan;
  assert.ok(!plan.partitions.some((p) => p.role === 'stair-wall' && p.id.startsWith('home-stair')));
  assert.equal(plan.home, undefined);
  assert.deepEqual(COMMUNITY_CATEGORY, { label: '云澜社区住宅', color: '#6f8a7a' });
});

const del = (path) => (o) => { const keys = path.split('.'), last = keys.pop(); delete keys.reduce((q, k) => q[k], o)[last]; };
const CASES = [
  ...['kind', 'usage', 'community', 'name', 'short', 'en', 'accent', 'campusGroup', 'frame', 'footprint', 'outline', 'bounds', 'center',
    'radius', 'height', 'storeys', 'levels', 'entryLevel', 'stackedOn', 'hostLevels', 'stairLevelIds', 'fireFrontage', 'hardstand', 'access']
    .map((k) => ['north', `building.${k}`, (fx) => del(k)(fx.b)]),
  ['west', 'building.stackedOn', (fx) => del('stackedOn')(fx.b)],
  ['west', 'building.entryLevel', (fx) => del('entryLevel')(fx.b)],
  ['north', 'building.frame', (fx) => { fx.b.frame = frame(-260, -232, 90, 'T1'); }],
  ...['kind', 'elev', 'height', 'levelNumber', 'slab', 'voids', 'corePlan'].map((k) => ['north', `level T1-14F ${k}`, (fx) => del(k)(fx.layout.levels.find((l) => l.id === 'T1-14F'))]),
  ['north', 'level T1-15F slab', (fx) => { fx.layout.levels.find((l) => l.id === 'T1-15F').slab.pieces[0].holes = []; }],
  ['north', 'corePlan', (fx) => { fx.layout.levels.find((l) => l.id === 'T1-15F').corePlan.kind = 'tower'; }],
  ['west', 'level W1-1F lobbyPlan', (fx) => del('lobbyPlan')(fx.layout.levels.find((l) => l.id === 'W1-1F'))],
  ['north', 'residence.kind', (fx) => del('residence.kind')(fx.layout.levels.find((l) => l.id === 'T1-15F').units[0])],
  ['north', 'entryDoor', (fx) => del('residence.entryDoor')(fx.layout.levels.find((l) => l.id === 'T1-15F').units[0])],
  ['west', 'entryDoor', (fx) => del('residence.entryDoor')(fx.layout.levels.find((l) => l.id === 'W1-2F').units[0])],
  ['north', 'fronts', (fx) => del('fronts')(fx.layout.levels.find((l) => l.id === 'T1-15F').units[0])],
  ['north', 'partner', (fx) => del('residence.partner')(fx.layout.levels.find((l) => l.id === 'T1-15F').units[0])],
  ['north', 'home-stair-under-B', (fx) => { const u = fx.layout.levels.find((l) => l.id === 'T1-14F').units[0]; u.residence.obstacles = u.residence.obstacles.filter((o) => o.id !== 'home-stair-under-B'); }],
  ['north', 'interior-stair', (fx) => { for (const f of fx.b.access.flights) delete f.kind; }],
  ...['tower', 'residentialCore', 'label', 'role', 'shaftLevels'].map((k) => ['north', `lift T1-LF ${k}`, (fx) => del(k)(fx.layout.elevators[0])]),
  ...['building', 'residentialCore', 'serves', 'passLevels', 'continuous', 'shaftRect', 'landingRect'].map((k) => ['north', `stair T1-ST-A ${k}`, (fx) => del(k)(fx.layout.stairs[0])]),
  ['north', 'stair T1-ST-A serves', (fx) => { fx.layout.stairs[0].serves.push('P1-3F'); }],
  ['west', 'lift W1-L1 role', (fx) => { fx.layout.elevators[0].role = 'vip'; }],
  // supertall P0a: the refuge level (SPEC §2.1): no homes, its plan, its name, only fire lifts land there
  ['refuge', 'units: a refuge floor has no homes', (fx) => { const lv = fx.layout.levels.find((l) => l.id === 'W1-3F'), u = fx.layout.levels.find((l) => l.id === 'W1-2F').units[0]; lv.units.push({ ...u, level: lv.id }); }],
  ['refuge', 'refugePlan', (fx) => del('refugePlan')(fx.layout.levels.find((l) => l.id === 'W1-3F'))],
  ['refuge', "name: expected '3F 避难层'", (fx) => { fx.layout.levels.find((l) => l.id === 'W1-3F').name = '3F 住宅'; }],
  ['refuge', 'W1-3F is a refuge floor: only fire lifts land there', (fx) => { fx.layout.elevators[0].serves.push('W1-3F'); }],
  ['refuge', 'kind', (fx) => { fx.layout.levels.find((l) => l.id === 'W1-3F').kind = 'plant'; }],
  ['refuge', 'fireOnly', (fx) => { fx.layout.elevators[1].fireOnly = ['W1-1F']; }],
];

test('删去任一必需字段，契约给出点名的错误', () => {
  for (const [kind, field, mutate] of CASES) {
    const fx = kind === 'west' ? westFixture() : kind === 'refuge' ? refugeFixture() : northFixture();
    mutate(fx);
    const errs = communityContractErrors(fx.layout, fx.b);
    assert.ok(errs.some((e) => e.includes(field)), `${kind} ${field}: ${errs.join(' | ') || '没有报错'}`);
  }
});

test('门禁记录：闸机坐标约定、住户区记录与几何校验', () => {
  assert.deepEqual(GATE, { hold: 4, exitHold: 1.5, exitSensor: 1.4, pinch: 0.6, reachClear: 2.0 });
  const g = gateRecord({ id: 'T1-1F-GATE', zone: 'T1', kind: 'speed-gates', name: '北苑住户通道 · 刷卡', floor: 'P1-1F',
    frame: frame(-264, -223.4, 90), length: 3.5, lanes: SPEED_LANES, cabinets: SPEED_CABINETS, reader: { u: 1.75, v: -1.2 },
    sign: { cn: '云澜·北苑 住户通道 · RESIDENTS', sub: '住户刷卡通行 · 访客请至礼宾台' } });
  assert.deepEqual(g.floors, ['P1-1F']); assert.deepEqual(g.line, { u0: 0, u1: 3.5 }); assert.equal(g.hold, 4);
  assert.equal(g.lanes.length, 3); assert.ok(g.lanes[2].accessible); assert.equal(g.cabinets.length, 4);
  assert.deepEqual(gateRecordErrors(g), []);
  const door = gateRecord({ id: 'W1-1F-GATE', zone: 'W1', kind: 'glass-door', name: '西苑住户门', floor: 'W1-1F', frame: [-454.3, -229.2, 180], length: 8, lanes: [{ u0: 3.2, u1: 4.8 }], reader: { u: 2.2, v: -0.8 } });
  assert.equal(door.frame.deg, 180); assert.deepEqual(door.cabinets, []);
  assert.deepEqual(gateRecordErrors(door), []);
  assert.ok(gateRecordErrors({ ...door, reader: { u: 2.2, v: .5 } }).some((e) => e.includes('reader')));
  assert.ok(gateRecordErrors({ ...door, lanes: [{ u0: 7, u1: 9 }] }).some((e) => e.includes('outside')));
  const z = zoneRecord({ id: 'W1', building: 'W1', name: '云澜·西苑 1 号楼住户区', label: '西苑 1 号楼 · 住户大堂', floor: 'W1-1F', polys: [] });
  assert.deepEqual(z.floors, ['W1-1F']);
});

test('场地常量：北苑两栋塔楼、19 层标高与宿主楼层，西苑两栋 3梯5户塔楼', () => {
  assert.deepEqual(NORTH_SITE.towers.map((t) => t.id), ['T1', 'T2']);
  assert.equal(NORTH_SITE.levels.length, 19);
  assert.deepEqual(NORTH_SITE.levels.map((l) => l.short), ['7F', ...Array.from({ length: 17 }, (_, i) => `${8 + i}F`), 'RF']);
  for (const [i, l] of NORTH_SITE.levels.entries()) if (i) {
    const p = NORTH_SITE.levels[i - 1];
    assert.ok(Math.abs(p.elev + p.height - l.elev) < 1e-9, `${l.short} 标高不连续`);
  }
  assert.equal(NORTH_SITE.levels.at(-1).elev, 96.9);
  assert.ok(Object.isFrozen(NORTH_SITE.towers[0].hardstand) && Object.isFrozen(WEST_SITE.levels));
  for (const t of NORTH_SITE.towers) {
    assert.equal(t.hardstand.z1 - t.hardstand.z0, 10);
    assert.deepEqual([t.hardstand.x0, t.hardstand.x1], t.plate);
    assert.equal(t.core[1] - t.core[0], 8);
  }
  assert.deepEqual(WEST_SITE.towers.map((t) => t.id), ['W1', 'W2']);
  for (const t of WEST_SITE.towers) {
    const T = COMMUNITY_PLANS.west[t.id];
    assert.deepEqual([T.x, T.z], t.center);
    assert.equal(T.core.x1 - T.core.x0, 15.7);
    assert.equal(T.core.x0, t.core[0]);
  }
  for (const t of NORTH_SITE.towers) {
    const T = COMMUNITY_PLANS.north[t.id];
    assert.deepEqual(T.plate, t.plate); assert.deepEqual(T.core, t.core);
  }
});
