// supertall P0 合并交接（SPEC §2.2 "fixtures"、§5.1）：P0b 的渲染与界面读 P0a 引擎写出的真实记录，不只是合成夹具。
// · 楼层牌分区就是 P0a 的分区：社区塔楼读 applyTowerZones() 写的 b.zones，其余塔楼由 towerZones() 推出；lv.zone 与楼层牌一致。
// · P0b 的合成夹具（tests/fixtures/supertall-records.js）通过 P0a 的记录校验，两边的形状不会各走各的。
// · P0a 的合成门禁塔（tests/fixtures/synthetic-tower.js，用真实的 refugeLevel / applyStairBreaks / lift / gateRecord 搭成）：
//   楼层牌的避难层行、电梯面板（role / fireOnly）、乘梯时间（createElevatorRide 的 speed 与 realSeconds）、
//   避难层室内（refugePlan）、楼梯分隔的第二樘门（applyStairBreaks）、门禁 role / leaf 的标牌与拾取卡片。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { syntheticTower } from './fixtures/synthetic-tower.js';
import { stLayout } from './fixtures/supertall-records.js';
import { towerZones, ZONE_KINDS } from '../src/layout/zones.js';
import { refugeLevelErrors, checkRefugeStack } from '../src/layout/refuge.js';
import { towerStairPlan } from '../src/layout/tower-stairs.js';
import { createElevatorRide, liftRunSeconds, LIFT_RUN } from '../src/layout/elevator-ride.js';
import { landingAt, isFireLift, LIFT_ROLES } from '../src/layout/elevator-shafts.js';
import { GATE_ALARM_TEXT, segmentGate, stairReentryGates, gateRecordErrors } from '../src/layout/access-records.js';
import { floorRows, towerRailZones, zoneOfLevel, zoneChips, towerFacts } from '../src/render/floor-rows.js';
import { keypadModel, rideHud } from '../src/render/lift-keypad.js';
import { buildRefugeFloor, REFUGE_FLOOR_MAX_VERTICES } from '../src/render/build/refuge-floor.js';
import { buildTowerStairGeometry, stairBreak } from '../src/render/build/tower-stairs.js';
import { liftLanding } from '../src/render/build/community.js';
import { gateLeafBoxes, gateSignText, gatePickInfo, GATE_SIGN } from '../src/render/build/access-gates.js';
import { BatchSet } from '../src/render/batch.js';

const mats = new Proxy({}, { get: (m, k) => (m[k] ||= Object.assign(new THREE.MeshBasicMaterial({ vertexColors: true }), { name: k })) });
const countBoxes = (fn) => { const B = new BatchSet(mats), g = new THREE.Group(); fn(B); B.flush(g); const out = {}; for (const m of g.children) out[m.material.name] = m.geometry.attributes.position.count; return out; };
/** P0a's synthetic gated tower with its zones published the way a tower package does (towerZones()). */
function zoned(opts) {
  const S = syntheticTower(opts), b = S.buildings[0];
  b.zones = towerZones(b, S.levels, { elevators: S.elevators });
  for (const z of b.zones) for (const id of z.levels) S.levels.find((l) => l.id === id).zone = z.id;
  return S;
}

test('真实布局：楼层牌分区就是 P0a 的分区（社区塔楼读 b.zones，其余塔楼由 towerZones() 推出）；lv.zone 与楼层牌一致', () => {
  const towers = L.buildings.filter((b) => b.kind === 'tower');
  assert.ok(towers.length >= 10, `${towers.length} 栋塔楼`);
  for (const b of towers) {
    const p0a = (b.zones ?? towerZones(b, L.levels, { elevators: L.elevators })).filter((z) => !z.host);
    const rail = towerRailZones(L, b.id);
    assert.deepEqual(rail.map((z) => z.id).sort(), p0a.map((z) => z.id).sort(), `${b.id} 楼层牌分区`);
    for (const z of p0a) {
      const r = rail.find((q) => q.id === z.id);
      assert.deepEqual(r.levels.map((l) => l.id).reverse(), z.levels, `${b.id} ${z.id} 楼层`);
      assert.equal(r.name, z.name);
      assert.equal(r.homes, z.homes);
    }
  }
  // The community towers carry P0a's b.zones (applyTowerZones, expansion layout); every own level names its rail zone.
  for (const id of ['T1', 'T2', 'W1', 'W2']) {
    assert.ok(L.buildings.find((q) => q.id === id).zones?.length, `${id} 没有 b.zones`);
    for (const lv of L.levels.filter((l) => l.building === id)) assert.equal(zoneOfLevel(L, id, lv.id)?.id, lv.zone, lv.id);
  }
  // The keypad of a real lift groups its keys by those zones (P1 host floors of 北苑 fall in their own group).
  const e = L.elevators.find((q) => q.id === 'T1-LF'), ids = new Set(L.buildings.find((q) => q.id === 'T1').zones.map((z) => z.id));
  for (const g of keypadModel(L, e, { here: 'P1-1F', options: e.serves.map((floor) => ({ floor })) }).groups) assert.ok(ids.has(g.id) || g.id.endsWith('-other'), g.id);
});

test('P0a 合成门禁塔：楼层牌有避难层斜纹行与「避 3F」标签，分区自上而下；目录事实数出避难层', () => {
  const S = zoned(), b = S.buildings[0];
  assert.deepEqual(b.zones.map((z) => z.kind), ['lobby', 'band', 'refuge', 'band', 'roof']);
  const html = floorRows(S, 'S');
  assert.match(html, /class="floor refuge zone-single" data-level="S-3F"[^>]*><span class="fl-num">3F<\/span><span class="fl-name">避难层 · 设备层</);
  assert.deepEqual(towerRailZones(S, 'S').map((z) => z.levels[0].short), ['RF', '4F', '3F', '2F', '1F']);
  assert.match(zoneChips(S, 'S'), /zone-chip refuge[^>]*>避 3F</);
  assert.equal(Object.fromEntries(towerFacts(S, 'S'))['避难层'], 1);
});

test('P0a 合成门禁塔：电梯面板读 role / fireOnly——客梯没有避难层键，消防梯的避难层键要钥匙确认，fireOnly 层灰显「消防专用」', () => {
  const S = zoned({ lfServes: ['2F', '3F', '4F', 'RF'], lfFireOnly: ['1F'] });
  const L1 = S.elevators.find((e) => e.id === 'S-L1'), LF = S.elevators.find((e) => e.id === 'S-LF'), b = S.buildings[0];
  assert.ok(isFireLift(LF) && !isFireLift(L1));
  const opts = (e, here) => ({ here, options: e.serves.map((floor) => ({ floor })) });
  const pass = keypadModel(S, L1, opts(L1, 'S-1F'));
  assert.ok(!pass.keys.some((k) => k.level === 'S-3F'), '客梯面板有避难层键');
  const fire = keypadModel(S, LF, opts(LF, 'S-2F'));
  const refuge = fire.keys.find((k) => k.level === 'S-3F'), only = fire.keys.find((k) => k.level === 'S-1F');
  assert.ok(refuge && refuge.kind === 'refuge' && refuge.confirm && refuge.key, JSON.stringify(refuge));
  assert.ok(only && only.kind === 'fireOnly' && only.disabled && only.sub === '消防专用', JSON.stringify(only));
  assert.ok(fire.title.startsWith('消防电梯'), fire.title);
  assert.equal(fire.card, '消防电梯 · 避难层须消防员钥匙');
  for (const g of fire.groups) assert.ok(b.zones.some((z) => z.id === g.id), g.id);
  // The core renderers' landing kind is P0a's landingAt(): 'fire' for a fire-only stop.
  assert.equal(landingAt(LF, 'S-1F'), 'fire');
  assert.equal(liftLanding({ id: 'S-LF' }, { id: 'S-1F' }, new Map(S.elevators.map((e) => [e.id, e]))), 'fire');
  assert.equal(liftLanding({ id: 'S-LF' }, { id: 'S-2F' }, new Map(S.elevators.map((e) => [e.id, e]))), 'normal');
});

test('乘梯：游戏行程按 P0a 的 Δy / (2 × e.speed)，HUD 的「实际约 n 秒」就是 P0a 的 realSeconds（消防梯加速度 0.9）', () => {
  const S = zoned(), LF = S.elevators.find((e) => e.id === 'S-LF');
  const at = (id) => S.levels.find((l) => l.id === id).elev, dy = at('S-RF') - at('S-1F');
  // explore.js: createElevatorRide(from, to, cabin, approach, e.speed, { fire: isFireLift(e) })
  const ride = createElevatorRide({ x: LF.x, y: at('S-1F'), z: LF.z }, { x: LF.x, y: at('S-RF'), z: LF.z }, { x: LF.x, z: LF.z }, null, LF.speed, { fire: isFireLift(LF) });
  assert.equal(LF.speed, 4);
  assert.ok(Math.abs(ride.travel - Math.max(1.2, dy / 8)) < 1e-9, `${ride.travel}`);
  assert.ok(Math.abs(ride.realSeconds - liftRunSeconds(dy, 4, { accel: LIFT_RUN.fireAccel })) < 1e-9);
  assert.equal(rideHud('上行', 'RF', ride.realSeconds), `上行 · RF · 实际约 ${Math.round(ride.realSeconds)} 秒`);
  // A lift without a speed rides at today's Δy / 7.
  const plain = createElevatorRide({ x: 0, y: 0, z: 0 }, { x: 0, y: 35, z: 0 }, { x: 0, z: 0 }, null, undefined);
  assert.equal(plain.travel, 5);
});

test('避难层室内画 P0a refugeLevel() 的 refugePlan：避难区地面、设备房与水泵、消火栓与标识、乙级防火窗框；≤ 3k 顶点', () => {
  const S = zoned(), lv = S.levels.find((l) => l.id === 'S-3F');
  assert.equal(lv.kind, 'refuge');
  const r = buildRefugeFloor({ mats: { base: mats }, bById: { S: S.buildings[0] } }, { lv, base: new THREE.Group() });
  assert.ok(r.vertices > 200 && r.vertices <= REFUGE_FLOOR_MAX_VERTICES, `${r.vertices} 顶点`);
  const names = new Set(r.group.children.map((m) => m.material.name));
  for (const k of ['concrete', 'extSatin', 'glowSoft', 'extMetal', 'stone']) assert.ok(names.has(k), `缺 ${k}`);
  // Everything stays inside the plate (world bounds of the slab rect) and within the storey.
  const box = new THREE.Box3();
  for (const m of r.group.children) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
  assert.ok(box.min.x >= -12.05 && box.max.x <= 12.05 && box.min.z >= -8.05 && box.max.z <= 12.05, JSON.stringify(box));
  assert.ok(box.min.y >= lv.elev - .05 && box.max.y <= lv.elev + lv.height, JSON.stringify(box));
});

test('楼梯分隔：渲染的第二樘门与隔墙就是 P0a applyStairBreaks() 写进楼梯间的门（3F 避难层），非分隔层照旧', () => {
  const S = zoned(), [st] = S.stairs, p = towerStairPlan(st), b = S.buildings[0];
  const room = S.levels.find((l) => l.id === 'S-3F').rooms.find((m) => m.id === st.id && m.type === 'stair');
  const br = stairBreak(st, p, 'S-3F');
  assert.deepEqual(br.doors, room.doors);
  assert.deepEqual(br.partition, room.breakPartition);
  assert.equal(stairBreak(st, p, 'S-2F'), null);
  const draw = (id) => countBoxes((B) => B.frame(st.frame, () => buildTowerStairGeometry(B, b, S.levels.filter((l) => l.id === id), [{ ...st, serves: [id] }], { flights: false })));
  const plain = draw('S-2F'), split = draw('S-3F');
  assert.ok(split.concrete > plain.concrete, `分隔层墙体 ${split.concrete} / ${plain.concrete}`);
  assert.ok(split.glowSoft > plain.glowSoft, '分隔层缺少第二个安全出口标识');
});

test('门禁：P0a gateRecord / segmentGate / stairReentryGates 的 role / leaf 决定门扇、标牌与拾取卡片，都写「火灾时自动释放」', () => {
  const S = zoned(), [st] = S.stairs, [entry] = S.accessControl.gates;
  assert.deepEqual([entry.role, entry.leaf, entry.releaseOnAlarm], ['entry', 'own', true]);
  assert.equal(gateLeafBoxes(entry, 0).length, 2);
  assert.deepEqual(gateSignText(entry), { cn: entry.sign.cn, sub: GATE_ALARM_TEXT });
  assert.equal(gatePickInfo(S, entry)[0], '测试塔 · 住户门禁');
  const exit = segmentGate({ id: 'S-ST1-EXIT', zone: 'S-RES-1F', name: '楼梯间疏散门', floor: 'S-1F', frame: st.frame, seg: st.door, toward: 'N', role: 'exit', building: 'S' });
  assert.equal(exit.leaf, 'existing');
  assert.equal(gateLeafBoxes(exit, 0).length, 0);
  assert.deepEqual(gateSignText(exit), { cn: '仅供疏散 · 外侧刷卡', sub: GATE_ALARM_TEXT });
  assert.match(gatePickInfo(S, exit)[1], new RegExp(`仅供疏散 · 外侧刷卡 · ${GATE_ALARM_TEXT}`));
  const reentry = stairReentryGates(st, S.levels.filter((l) => ['S-2F', 'S-4F'].includes(l.id)), () => 'S-RES-1F');
  assert.deepEqual(reentry.map((g) => [g.id, g.role, g.leaf]), [['S-ST1-2F', 'reentry', 'existing'], ['S-ST1-4F', 'reentry', 'existing']]);
  for (const g of reentry) {
    assert.equal(gateLeafBoxes(g, 1).length, 0);
    assert.deepEqual(gateSignText(g), { cn: '住户楼层 · 刷卡进入', sub: GATE_ALARM_TEXT });
    assert.match(gatePickInfo(S, g)[1], new RegExp(`住户楼层 · 刷卡进入 · ${GATE_ALARM_TEXT}`));
  }
  // The renderer's sign text is P0a's GATE_ALARM_TEXT; the real gates carry P0a's defaults and draw their own leaves.
  for (const k of Object.keys(GATE_SIGN)) assert.equal(GATE_SIGN[k].sub, GATE_ALARM_TEXT, k);
  assert.ok(L.accessControl.gates.length >= 16);
  for (const g of L.accessControl.gates) {
    assert.deepEqual([g.role, g.leaf, g.releaseOnAlarm], ['entry', 'own', true], g.id);
    assert.ok(gateLeafBoxes(g, 0).length > 0, g.id);
    assert.equal(gateSignText(g).sub, g.sign?.sub || GATE_ALARM_TEXT, g.id);
  }
});

test('P0b 的合成夹具（supertall-records.js）符合 P0a 的记录契约：避难层、避难层间距、门禁 role / leaf、电梯 role、分区 kind', () => {
  const SL = stLayout(), b = SL.buildings[0];
  for (const lv of SL.levels.filter((l) => l.kind === 'refuge')) assert.deepEqual(refugeLevelErrors(lv), [], lv.id);
  assert.deepEqual(checkRefugeStack(b, SL.levels, { elevators: SL.elevators }), []);
  for (const g of SL.accessControl.gates) assert.deepEqual(gateRecordErrors(g), [], g.id);
  for (const e of SL.elevators) assert.ok(LIFT_ROLES.includes(e.role), `${e.id} role ${e.role}`);
  for (const z of b.zones) assert.ok(ZONE_KINDS.includes(z.kind), `${z.id} kind ${z.kind}`);
  // Its hand-written zones have the bands P0a's towerZones() derives from the same levels.
  assert.deepEqual(b.zones.map((z) => [z.kind, z.levels]), towerZones(b, SL.levels).map((z) => [z.kind, z.levels]));
});
