// 避难层（supertall P0a, SPEC §0.5 / §1.0 / §2.1）：refugeLevel() 的记录形状与 checkRefugeStack() 的每一类错误
// （首个避难层 > 50 m、间距 > 50 m、最后一个避难层以上的封闭楼层 > 50 m（露天屋面除外，C-17）、避难区面积不足、
// 无消防电梯停靠、客梯停靠、避难层有住户、避难区不在登高面）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { frame, rect } from '../src/layout/geom.js';
import { REFUGE, refugeLevel, refugeLevelErrors, checkRefugeStack } from '../src/layout/refuge.js';
import { LEVEL_KINDS } from '../src/layout/community-contract.js';
import { syntheticTower } from './fixtures/synthetic-tower.js';

const F = frame(0, 0, 0, 'X'), FOOT = rect(-20, -10, 20, 10), building = { id: 'X', footprint: FOOT };
const refuge = (short, elev, extra = {}) => refugeLevel({ id: `X-${short}`, building: 'X', short, elev, height: 4.5, frame: F, footprint: FOOT, face: 'S',
  areas: [{ id: `X-${short}-refuge`, rect: rect(-10, 4, 10, 10) }], persons: 200, ...extra });
const floor = (short, elev, kind = 'community') => ({ id: `X-${short}`, building: 'X', short, elev, kind, units: [] });
const fireLift = (serves, extra = {}) => ({ id: 'X-LF', role: 'fire', serves, ...extra });
const passenger = (serves) => ({ id: 'X-L1', role: 'passenger', serves });
/** A 47F-like stack: 3 m storeys from 4.5 m, refuge floors at the given storeys (4.5 m each). */
function stack(refuges, top = 47, { roof = true } = {}) {
  const out = [floor('1F', 0, 'lobby')];
  let y = 4.5;
  for (let n = 2; n <= top; n++) {
    out.push(refuges.includes(n) ? refuge(`${n}F`, +y.toFixed(2)) : floor(`${n}F`, +y.toFixed(2)));
    y += refuges.includes(n) ? 4.5 : 3.0;
  }
  if (roof) out.push(floor('RF', +y.toFixed(2), 'roof'));
  return out;
}
const fireFor = (levels) => fireLift(levels.map((l) => l.id));
const has = (errs, re) => errs.some((e) => re.test(e));

test('refugeLevel：编号楼层「nF 避难层」，无住户，避难区 / 设备房 / 防火隔间 / 窗 / 消防设施成记录', () => {
  assert.ok(LEVEL_KINDS.has('refuge'));
  const lv = refuge('16F', 46.5, {
    plant: [{ id: 'X-16F-pumps', name: '消防转输水箱 · 水泵', rect: rect(-20, 4, -10, 10), rating: '3.00h', contents: ['tank', 'pumps'] }],
    vestibules: [{ rect: rect(-10, 2, -8, 4), doors: [{ x0: -10, z0: 3, x1: -10, z1: 3.9 }] }],
    windows: [{ edge: 'S', span: [-10, 10], kind: 'fire-window-B' }, { edge: 'N', span: [-20, 20], kind: 'louvre' }],
    fixtures: [{ kind: 'hydrant', x: 0, z: 4.5, label: '消火栓' }, { kind: 'fire-phone', x: 1, z: 4.5, label: '消防专线电话' }],
    serves: ['X-15F'], outrigger: true });
  assert.equal(lv.kind, 'refuge'); assert.equal(lv.name, '16F 避难层'); assert.equal(lv.levelNumber, 16);
  assert.deepEqual(lv.units, []);
  assert.equal(lv.theme.label, '避难层 · 设备层 · 消防电梯停靠 · 加强层');
  assert.equal(refuge('31F', 93).theme.label, REFUGE.label);
  const p = lv.refugePlan;
  assert.deepEqual(Object.keys(p).sort(), ['areas', 'face', 'fixtures', 'frame', 'netRequired', 'outrigger', 'persons', 'plant', 'serves', 'vestibules', 'windows'].sort());
  assert.deepEqual(Object.keys(p.areas[0]).sort(), ['id', 'name', 'net', 'poly', 'rect']);
  assert.equal(p.areas[0].name, '避难区'); assert.equal(p.areas[0].net, 120); assert.equal(p.netRequired, 40);
  assert.equal(p.plant[0].rating, '3.00h'); assert.equal(p.vestibules[0].name, '防火隔间');
  assert.deepEqual(p.windows.map((w) => w.kind), ['fire-window-B', 'louvre']);
  assert.deepEqual([p.fixtures[0].x, p.fixtures[0].z, p.fixtures[0].label], [0, 4.5, '消火栓']);
  // walk = the 避难区 (+ corridors); the plant rooms are solid rooms with no door
  assert.deepEqual(lv.walk.map((w) => w.kind), ['refuge']);
  assert.deepEqual(lv.rooms.map((r) => [r.type, r.doors.length]), [['plant', 0]]);
  assert.deepEqual(refugeLevelErrors(lv), []);
  assert.throws(() => refuge('RF', 100), /numbered storey/);
  assert.ok(has(refugeLevelErrors({ ...lv, refugePlan: { ...p, face: 'up' } }), /face/));
  assert.ok(has(refugeLevelErrors({ ...lv, refugePlan: { ...p, plant: [{ ...p.plant[0], rating: '1.00h' }] } }), /rating/));
  assert.ok(has(refugeLevelErrors({ ...lv, refugePlan: { ...p, fixtures: [{ kind: 'sofa' }] } }), /fixtures/));
});

test('checkRefugeStack：西苑 S47（16F / 31F）与合成塔楼通过；屋顶花园是露天屋面，不计入最后一段（C-17）', () => {
  const S47 = stack([16, 31]);
  assert.equal(S47.find((l) => l.short === '16F').elev, 46.5); assert.equal(S47.find((l) => l.short === '31F').elev, 93);
  assert.equal(S47.find((l) => l.short === '47F').elev, 142.5); assert.equal(S47.at(-1).elev, 145.5);
  assert.deepEqual(checkRefugeStack(building, S47, { elevators: [fireFor(S47)] }), []);
  // the RF garden sits 52.5 m above 31F: exempt only because it is an open-air roof
  const enclosedRoof = S47.map((l) => (l.short === 'RF' ? { ...l, kind: 'community' } : l));
  assert.ok(has(checkRefugeStack(building, enclosedRoof, { elevators: [fireFor(S47)] }), /top occupied storey 52\.5 m above the last refuge floor X-31F/));
  const S = syntheticTower(), b = S.buildings[0];
  assert.deepEqual(checkRefugeStack(b, S.levels, { elevators: S.elevators }), []);
});

test('checkRefugeStack：逐类报错', () => {
  const lifts = (levels) => [fireFor(levels)];
  // first refuge floor more than 50 m above the hardstand (ground 0.0)
  const late = stack([17, 31]);
  assert.ok(has(checkRefugeStack(building, late, { elevators: lifts(late) }), /first refuge floor 49\.5 m/) === false);
  const later = stack([18, 31]);
  assert.ok(has(checkRefugeStack(building, later, { elevators: lifts(later) }), /X-18F: first refuge floor 52\.5 m above the hardstand/));
  // gap between refuge floors
  const gap = stack([16, 34]);
  assert.ok(has(checkRefugeStack(building, gap, { elevators: lifts(gap) }), /X-34F: gap 55\.5 m to X-16F/));
  // the top enclosed storey too far above the last refuge floor; a tall tower with no refuge floor at all
  const tall = stack([16, 31], 49);
  assert.ok(has(checkRefugeStack(building, tall, { elevators: lifts(tall) }), /X-49F: top occupied storey 55\.5 m above the last refuge floor X-31F/));
  const none = stack([], 20);
  assert.ok(has(checkRefugeStack(building, none, { elevators: [] }), /no refuge floor/));
  assert.deepEqual(checkRefugeStack(building, stack([], 16), { elevators: [] }), [], 'a tower whose top storey is ≤ 50 m needs none');
  // area: net < persons / 5
  const small = stack([16, 31]).map((l) => (l.short === '16F' ? refuge('16F', l.elev, { persons: 700 }) : l));
  assert.ok(has(checkRefugeStack(building, small, { elevators: lifts(small) }), /X-16F: net 避难区 120 m² < 140 m²/));
  // lifts: no fire lift; a passenger lift landing; a fire-only landing counts for the fire lift
  const S47 = stack([16, 31]), noRefuge = S47.filter((l) => l.kind !== 'refuge').map((l) => l.id);
  assert.ok(has(checkRefugeStack(building, S47, { elevators: [fireLift(noRefuge)] }), /X-16F: no fire lift lands on it/));
  assert.deepEqual(checkRefugeStack(building, S47, { elevators: [fireLift(noRefuge, { fireOnly: ['X-16F', 'X-31F'] })] }), []);
  assert.ok(has(checkRefugeStack(building, S47, { elevators: [fireFor(S47), passenger(['X-1F', 'X-31F'])] }), /X-31F: passenger lift X-L1 lands on it/));
  assert.ok(has(checkRefugeStack(building, S47, { elevators: [fireFor(S47), { ...passenger(['X-31F']), role: 'private-w' }] }), /passenger lift X-L1/));
  // a unit on a refuge floor; the 避难区 not on the hardstand face
  const unit = S47.map((l) => (l.short === '16F' ? { ...l, units: [{ id: 'X-16F-01' }] } : l));
  assert.ok(has(checkRefugeStack(building, unit, { elevators: lifts(S47) }), /X-16F: unit on a refuge floor \(X-16F-01\)/));
  const north = S47.map((l) => (l.short === '31F' ? refuge('31F', l.elev, { face: 'N' }) : l));
  assert.ok(has(checkRefugeStack(building, north, { elevators: lifts(S47) }), /X-31F: no 避难区 on the hardstand face N/));
  // the ground option: 北苑 measures from the street hardstand at 0.0, not from the 34 m P1 roof
  const podium = stack([16, 31]).map((l) => ({ ...l, elev: l.elev + 34 }));
  assert.ok(has(checkRefugeStack(building, podium, { elevators: lifts(podium) }), /first refuge floor 80\.5 m/));
  assert.deepEqual(checkRefugeStack(building, podium, { ground: 34, elevators: lifts(podium) }), []);
});

test('floorLabel：避难区按 refugePlan 命名（社区塔楼用全名加括号），amenityPlan / labelZones 的分区按名字报出', async () => {
  const { buildNav, floorLabel } = await import('../src/layout/nav.js');
  const S = syntheticTower(), nav = buildNav(S), at = (floor, x, z) => floorLabel(nav, S, { floor, x, z });
  assert.equal(at('S-3F', 0, 8), '测试塔 · 3F 避难层 · 避难区');
  assert.equal(at('S-3F', 0, -2), '测试塔 · 3F 避难层', 'the corridor outside the 避难区 reads as the floor');
  const N = syntheticTower();
  Object.assign(N.buildings[0], { community: 'north', name: '云澜·北苑 1 号楼' });
  N.accessControl.zones[0].label = '测试塔 · 住户区';
  N.levels.find((l) => l.id === 'S-2F').amenityPlan = { frame: F, zones: [{ id: 'club', name: '住户会所', rect: rect(-12, 6, 12, 12) }] };
  N.levels.find((l) => l.id === 'S-1F').lobbyPlan = { frame: F, labelZones: true, zones: [{ id: 'hall', name: '入口门厅', rect: rect(-12, 6, 12, 12) }], partitions: [], obstacles: [] };
  const nn = buildNav(N), at2 = (floor, x, z) => floorLabel(nn, N, { floor, x, z });
  assert.equal(at2('S-3F', 0, 8), '云澜·北苑 1 号楼 · 3F 避难层（避难区）');
  assert.equal(at2('S-2F', 0, 9), '云澜·北苑 1 号楼 · 2F 住户会所');
  assert.equal(at2('S-1F', 0, 9), '云澜·北苑 1 号楼 · 1F 入口门厅');
  assert.equal(at2('S-1F', 0, -2), '测试塔 · 住户区（1F）', 'access zones still name the residents\' side first');
});
