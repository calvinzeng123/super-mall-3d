// 零点突围的随机任务（src/jimao/missions.js）：用园区探索的地图（arcade 布局），每局抽一种任务和一种撤离方式。
// ① 四种任务都抽得到，取物任务的房间（公寓住户、商场商铺、酒店客房）在导航上站得住、从 1F 走得到门口；
// ② 中继点、两个撤离点都在导航上、从开局点走得到；直升机停机位周围 7.5 m 是空地，离光穹、屋顶酒吧、咖啡座都远；
// ③ 任务文字、台词随任务改写；原游戏补丁（任务文字、交互提示、结算等撤离镜头放完）都在。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, clear, landAt } from '../src/layout/nav.js';
import { findPath } from '../src/fps/pathfinding.js';
import { walkNav } from './helpers.js';
import { pointInPoly, distToPolyEdge } from '../src/layout/geom.js';
import { MISSION_TYPES, RELAY_SITES, EXTRACTIONS, CAR_ROUTE_LENGTH, HOLD, HOLD_SITES, HUNT, roomSites, rollMission, missionText, missionRadio, boardingSpot, BOARD_GAP } from '../src/jimao/missions.js';
import { liftAt, floorLabel, faceYaw, LIFT } from '../src/jimao/lift.js';
import { createRideVehicle, rideFootprint, RIDE_SPECS } from '../src/jimao/ride-vehicles.js';
import { CAR_ROUTE, sampleRoute, carPoseAt, carSpeedAt, HELI_ORBIT, heliPoseAt, heliDuration } from '../src/jimao/ride-paths.js';
import { buildDoorGun, DOOR_GUN } from '../src/jimao/door-gun.js';
import { crateSites, AMMO } from '../src/jimao/ammo.js';
import { createTouchStick, stickVector, STICK } from '../src/jimao/touch-stick.js';

const L = buildPlayableLayout({ mode: 'arcade' });
const nav = buildNav(L);
const elev = (id) => L.levels.find((l) => l.id === id).elev;
const at = (p) => ({ floor: p.floor, x: p.x, z: p.z, y: elev(p.floor), slope: null });
const START = { floor: 'P1-1F', x: -135, z: -98, y: 0, slope: null };
const sites = roomSites(L, nav);

function seq(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

test('房间点：公寓、商铺、客房都有，每个都站在本层导航上', () => {
  assert.ok(sites.apartment.length >= 6, `公寓住户只有 ${sites.apartment.length} 户`);
  assert.ok(sites.shop.length >= 10, `商铺只有 ${sites.shop.length} 间`);
  assert.ok(sites.hotel.length >= 10, `客房只有 ${sites.hotel.length} 间`);
  assert.ok(new Set(sites.hotel.map((h) => h.floor)).size >= 3, '客房应分布在好几层');
  for (const s of [...sites.apartment, ...sites.shop, ...sites.hotel]) {
    const st = landAt(nav, s.x, s.z, s.y + 0.6);
    assert.equal(st?.floor, s.floor, `${s.unit} 的物品不在 ${s.floor} 上`);
    assert.ok(clear(nav, at(s)), `${s.unit} 的物品点被挡住`);
  }
});

test('随机任务：五种都抽得到，两种撤离都抽得到，目标齐全', () => {
  const rng = seq(7), types = new Set(), exits = new Set();
  for (let i = 0; i < 80; i++) {
    const m = rollMission(rng, sites);
    types.add(m.type); exits.add(m.extraction.id);
    if (m.type === 'relay') assert.equal(m.objectives.length, 3);
    else if (m.type === 'eliminate') { assert.equal(m.objectives.length, 0); assert.ok(m.kills >= 10); }
    else if (m.type === 'hold') { assert.equal(m.objectives.length, 0); assert.ok(HOLD_SITES.some((h) => h.where === m.hold.where) && m.hold.need === HOLD.need); }
    else {
      assert.equal(m.objectives.length, 2);
      assert.ok(m.objectives.every((o) => o.kind === 'item' && o.verb === '取回'));
      if (m.type === 'hotel') assert.ok(m.objectives.every((o) => o.site.floor.startsWith('H-')), '酒店任务的物品要在酒店里');
      if (m.type === 'rooms') assert.deepEqual(m.objectives.map((o) => o.site.floor[0]), ['A', 'P'], '住户任务：一件在公寓、一件在商场');
    }
  }
  assert.deepEqual([...types].sort(), [...MISSION_TYPES].sort());
  assert.deepEqual([...exits].sort(), ['car', 'heli']);
  const forced = rollMission(seq(3), sites, { type: 'hotel', exit: 'car' });
  assert.equal(forced.type, 'hotel'); assert.equal(forced.extraction.id, 'car');
});

test('中继、取物房间门口、撤离点都从开局点走得到', () => {
  for (const s of RELAY_SITES) assert.ok(findPath(nav, START, at(s)), `中继 ${s.where} 走不到`);
  for (const x of Object.values(EXTRACTIONS)) assert.ok(findPath(nav, START, at(x)), `${x.label}撤离点走不到`);
  // 房间内部 findPath 进不去（门洞很窄）：每类房间抽 3 间，寻路到门外 1.5 米，再从门口直走进房间走到物品跟前
  for (const kind of ['apartment', 'shop', 'hotel']) for (const s of sites[kind].slice(0, 3)) {
    const u = L.levels.find((l) => l.id === s.floor).units.find((q) => q.id === s.unit), f = u.wfronts?.[0];
    assert.ok(f, `${s.unit} 没有门脸`);
    const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2;
    const out = [1, -1].map((g) => ({ ...at(s), x: mx + f.nx * 1.5 * g, z: mz + f.nz * 1.5 * g }))
      .find((p) => Math.hypot(p.x - s.x, p.z - s.z) > Math.hypot(mx - s.x, mz - s.z) && clear(nav, p));
    assert.ok(out && findPath(nav, START, out), `${s.unit} 门口走不到`);
    const w = walkNav(nav, s.floor, [out.x, out.z], [s.x, s.z]);
    assert.ok(Math.hypot(w.x - s.x, w.z - s.z) < 0.3, `${s.unit} 从门口走不到物品跟前`);
  }
});

test('直升机停机位：屋面上 7.5 m 内都是空地，离光穹、屋顶铺位和咖啡座都远', () => {
  const h = EXTRACTIONS.heli, v = h.vehicle, rf = L.levels.find((l) => l.id === h.floor);
  for (let k = 0; k < 16; k++) for (const R of [0, 3, 5.5, 7.5]) {
    const x = v.x + Math.cos(k / 16 * Math.PI * 2) * R, z = v.z + Math.sin(k / 16 * Math.PI * 2) * R;
    assert.ok(clear(nav, { floor: h.floor, x, z, y: rf.elev, slope: null }), `停机位 (${x.toFixed(1)}, ${z.toFixed(1)}) 被挡`);
  }
  const dome = rf.features.find((f) => f.type === 'art-dome');
  assert.ok(Math.hypot(v.x - dome.cx, v.z - dome.cz) > dome.radius + 15, '离屋顶光穹太近');
  for (const u of [...rf.units, ...rf.rooms]) for (const P of u.polys || []) {
    assert.ok(!pointInPoly([v.x, v.z], P) && distToPolyEdge([v.x, v.z], P) > 9, `离 ${u.id} 太近`);
  }
});

test('任务文字和台词跟着任务走', () => {
  const m = rollMission(seq(5), sites, { type: 'eliminate', exit: 'heli' });
  assert.equal(missionText(m, { cut: 0, allCut: false, relays: [] }, 6), `歼灭武装劫持者 6/${m.kills}`);
  assert.equal(missionText(m, { cut: 0, allCut: true, relays: [] }, 14), '撤离 · 一期商场屋顶直升机');
  const r = rollMission(seq(5), sites, { type: 'relay', exit: 'car' });
  assert.equal(missionText(r, { cut: 1, allCut: false, relays: [1, 2, 3] }), '切断剩余 2 处中继');
  const radio = missionRadio(r);
  assert.match(radio.intro, /接应车/);
  assert.equal(radio.cut.length, 2);
  const hotel = missionRadio(rollMission(seq(9), sites, { type: 'hotel', exit: 'heli' }));
  assert.match(hotel.intro, /酒店/);
});

test('原游戏补丁：任务文字、交互提示、撤离点名字、外部完成、结算等撤离镜头', () => {
  const src = readFileSync(new URL('../src/jimao/vendor/game.js', import.meta.url), 'utf8');
  // vendor 里的中文按 esbuild 的写法转成 \uXXXX
  const esc = (t) => [...t].map((ch) => (ch.charCodeAt(0) > 127 ? '\\u' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') : ch)).join('');
  for (const needle of ['s && s.missionText', 'V.o.verb || ', 's.extraction.label || ', 'completeAll() {', 'refreshObjective() {', 's && s.outroDelay || 3.3', esc('已完成目标'), esc('击倒敌人'), 'RADIO']) {
    assert.ok(src.includes(needle), `vendor/game.js 缺补丁：${needle}`);
  }
  assert.ok(src.includes('s && s.keepLock || r.exitLock()'), 'vendor/game.js 缺补丁：乘坐时不松开鼠标');
  for (const needle of ['s.onExtract ? s.onExtract() : ee()', 'finish() {', 'C.mounted ?', 's.extraMarkers()']) assert.ok(src.includes(needle), `vendor/game.js 缺补丁：${needle}`);
  // 触屏摇杆：「没有手指」只认 -1（iOS 的 Touch.identifier 可能是负数）
  for (const needle of ['w === -1 ?', 'w !== -1 && (V += H', ': q === -1 && (q = V.identifier', 't.identifier === w) && ie()']) assert.ok(src.includes(needle), `vendor/game.js 缺补丁：${needle}`);
  assert.ok(!src.includes('w < 0 ?') && !src.includes('w >= 0 && (V += H'), 'vendor/game.js 还在拿 id < 0 当没手指');
});

test('撤离载具能坐进去：门口在空地上、机身占地不压墙，乘坐位置在舱里 / 车顶射击口', () => {
  for (const x of Object.values(EXTRACTIONS)) {
    const y = elev(x.floor), r = rideFootprint(x.vehicle), name = x.label;
    // 机身 / 车身整块落在导航上（加成障碍后不会把路堵死在墙里），登机点在占地外、离机身不远
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
      const px = r.x0 + (r.x1 - r.x0) * i / 6, pz = r.z0 + (r.z1 - r.z0) * j / 6;
      assert.ok(clear(nav, { floor: x.floor, x: px, z: pz, y, slope: null }), `${name}占地 (${px.toFixed(1)}, ${pz.toFixed(1)}) 压到墙或障碍`);
    }
    const out = x.x < r.x0 || x.x > r.x1 || x.z < r.z0 || x.z > r.z1;
    assert.ok(out, `${name}登机点在机身里`);
    assert.ok(Math.max(r.x0 - x.x, x.x - r.x1, r.z0 - x.z, x.z - r.z1) < 1.2, `${name}登机点离机身太远`);
    const veh = createRideVehicle({ ...x, y });
    let verts = 0; veh.root.traverse((o) => { if (o.isMesh) verts += o.geometry.attributes.position.count; });
    assert.ok(verts > 3000, `${name}模型太简单（${verts} 个顶点）`);
    // 直升机：坐在左舷机枪后面、朝舱门外；接应车：站在后排、从车顶射击口探出（眼睛高过车顶 0.6 米）
    const seat = veh.seatPose(0, 0).position, k = x.vehicle.kind;
    if (k === 'helicopter') assert.ok(seat.y - y > 1.5 && seat.y - y < 1.9, `直升机座位高度 ${(seat.y - y).toFixed(2)}`);
    else assert.ok(seat.y - y > 2.6 && seat.y - y < 2.9, `车顶射击口眼高 ${(seat.y - y).toFixed(2)}`);
    assert.ok(seat.x > r.x0 && seat.x < r.x1 && seat.z > r.z0 && seat.z < r.z1, `${name}座位不在机身里`);
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(veh.seatPose(0, 0).quaternion), yaw = x.vehicle.yaw + (RIDE_SPECS[k].seatYaw || 0);
    assert.ok(look.dot(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))) > 0.95, `${name}座位朝向不对`);
    veh.reset(); assert.ok(veh.seatPose(0, 0).position.distanceTo(seat) < 1e-6, `${name}重开后没回到原位`);
    veh.dispose();
  }
});

test('载具被击落后重来：出生点在载具门口外的本层空地上、不在机身里、走得到门口，面朝载具', () => {
  for (const x of Object.values(EXTRACTIONS)) {
    const y = elev(x.floor), name = x.label, r = rideFootprint(x.vehicle);
    const veh = createRideVehicle({ ...x, y });
    const { pos, yaw } = boardingSpot(nav, veh, x, y);
    const st = landAt(nav, pos.x, pos.z, y + 0.6);
    assert.ok(st && st.floor === x.floor && Math.abs(st.y - y) < 0.5 && clear(nav, st), `${name}重来出生点 (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) 不在 ${x.floor} 空地上`);
    assert.ok(pos.x < r.x0 || pos.x > r.x1 || pos.z < r.z0 || pos.z > r.z1, `${name}重来出生点在机身里`);
    const d = Math.hypot(pos.x - x.x, pos.z - x.z);
    assert.ok(d >= BOARD_GAP && d > x.radius + 1 && d < 7, `${name}重来出生点离登机点 ${d.toFixed(1)} 米（太近一落地就自动上车）`);
    assert.ok(findPath(nav, st, at(x)), `${name}重来出生点走不到登机点`);
    // 原游戏朝 (dx, dz) 看时 yaw = atan2(−dx, −dz)：看的方向要指向车门
    const c = veh.toWorld(veh.spec.doorOut), look = [-Math.sin(yaw), -Math.cos(yaw)], to = [c.x - pos.x, c.z - pos.z], n = Math.hypot(...to);
    assert.ok((look[0] * to[0] + look[1] * to[1]) / n > 0.7, `${name}重来时没面朝车门`);
    veh.dispose();
  }
});

test('接应车路线：车库 → 出口坡道（−4.5 升到 0）→ 星湾路 → 云澜大道，全程 400 米以上，一路在空地上', () => {
  const S = sampleRoute(), L0 = S.at(-1).s;
  assert.ok(Math.abs(L0 - CAR_ROUTE_LENGTH) < 1e-6 && L0 > 400, `路线只有 ${L0.toFixed(0)} 米`);
  const start = carPoseAt(S, 0), end = carPoseAt(S, L0);
  assert.equal(start.y, -4.5); assert.equal(end.y, 0);
  let prevY = -4.5, t = 0, s = 0;
  for (let d = 0; d <= L0; d += 1) {
    const p = carPoseAt(S, d);
    assert.ok(p.y >= prevY - 1e-6, `${d} 米处路面往下掉了`); prevY = p.y;
    // 车库段在公寓 B1、坡道上不查，上了街以后路面中心在导航上（星湾路、云澜大道都是 street 层）
    if (p.y > -0.01 && d > 70) { const st = landAt(nav, p.x, p.z, 0.6); assert.ok(st && Math.abs(st.y) < 0.6, `${d} 米处 (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) 不在路面上`); }
  }
  while (s < L0 - 0.05 && t < 120) { s += carSpeedAt(S, s) * 0.05; t += 0.05; }
  assert.ok(t > 55 && t < 90, `开完要 ${t.toFixed(0)} 秒（开慢一点好瞄）`);
  assert.ok(Math.abs(carPoseAt(S, 0).yaw - CAR_ROUTE.start.yaw) < 1e-6, '起点朝向和停车朝向不一致');
});

test('直升机路线：垂直起飞，绕一期屋顶一圈（左舷朝圈心、高过屋顶 18 米以上），再飞走', () => {
  const y0 = elev('P1-RF'), C = HELI_ORBIT.center, T = heliDuration();
  const p0 = heliPoseAt(0, y0);
  assert.equal(p0.x, HELI_ORBIT.pad.x); assert.equal(p0.y, y0);
  let swept = 0, prev = null;
  for (let t = HELI_ORBIT.lift; t < HELI_ORBIT.lift + HELI_ORBIT.loop + HELI_ORBIT.ramp / 2; t += 0.25) {
    const p = heliPoseAt(t, y0), left = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw)), toC = new THREE.Vector3(C.x - p.x, 0, C.z - p.z).normalize();
    assert.ok(left.dot(toC) > 0.95, `${t.toFixed(1)} 秒左舷没朝圈心`);
    assert.ok(p.y - y0 > 18, `${t.toFixed(1)} 秒太低`);
    const a = Math.atan2(p.z - C.z, p.x - C.x);
    if (prev != null) swept += Math.abs(((a - prev + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    prev = a;
  }
  assert.ok(swept > Math.PI * 1.9, `只绕了 ${(swept / Math.PI * 180).toFixed(0)}°`);
  const end = heliPoseAt(T, y0);
  assert.ok(end.y - y0 > 50 && Math.hypot(end.x - C.x, end.z - C.z) > 150, '直升机最后没飞走');
});

test('舱门机枪模型：六根枪管、细节足够，射界和过热参数合理', () => {
  const g = buildDoorGun(null);
  let verts = 0, meshes = 0; g.root.traverse((o) => { if (o.isMesh) { verts += o.geometry.attributes.position.count; meshes++; } });
  assert.ok(verts > 6000, `机枪模型太简单（${verts} 个顶点）`);
  assert.ok(meshes < 40, `机枪网格太多（${meshes}）`);
  let barrelVerts = 0; g.barrels.traverse((o) => { if (o.isMesh) barrelVerts += o.geometry.attributes.position.count; });
  assert.ok(barrelVerts > 1500, '枪管组太简单');
  assert.ok(DOOR_GUN.rate >= 15 && 1 / DOOR_GUN.heatPerShot / DOOR_GUN.rate > 3, '打 3 秒以内就过热');
  g.dispose();
});

test('弹药补给：地图上至少 8 个弹药箱，都在导航空地上、分布在商场、酒店、公寓和撤离点附近', () => {
  const crates = crateSites(L, nav);
  assert.ok(crates.length >= 8, `只有 ${crates.length} 个弹药箱`);
  for (const c of crates) assert.ok(clear(nav, { floor: c.floor, x: c.x, z: c.z, y: c.y, slope: null }), `${c.id} 被挡住`);
  for (const pre of ['P1-', 'H-', 'A-']) assert.ok(crates.some((c) => c.floor.startsWith(pre)), `${pre} 没有弹药箱`);
  assert.ok(crates.some((c) => c.floor === 'P1-RF') && crates.some((c) => c.floor === 'A-B1'), '撤离点附近没有弹药箱');
  assert.ok(AMMO.crate > AMMO.drop && AMMO.cap >= 240);
});

test('载具耐久：子弹擦过机身才算打中；坠毁轨迹——直升机打转掉到地面停住，接应车侧翻滑出后停住', async () => {
  const { VEHICLE_HP, rayMiss, crashPose } = await import('../src/jimao/vehicle-damage.js');
  const c = { x: 0, y: 2, z: 0 };
  assert.ok(rayMiss({ x: 0, y: 2, z: -30 }, { x: 0, y: 0, z: 1 }, c) < 0.01, '正对着打要算中');
  assert.ok(rayMiss({ x: 0, y: 2, z: -30 }, { x: 0, y: 0, z: -1 }, c) === Infinity, '背着打不算');
  assert.ok(rayMiss({ x: 5, y: 2, z: -30 }, { x: 0, y: 0, z: 1 }, c) > VEHICLE_HP.radius.car, '偏 5 米不算');
  for (const k of ['helicopter', 'car']) assert.ok(VEHICLE_HP.damage[k] >= 0.5 && VEHICLE_HP.damage[k] < 3, `${k} 每发伤害不合理`);
  const h0 = { x: -150, y: 62, z: -120, yaw: 1, pitch: 0, roll: -0.2 };
  let landedAt = null, yaw0 = h0.yaw;
  for (let t = 0; t <= VEHICLE_HP.crash.helicopter; t += 0.05) { const p = crashPose('helicopter', h0, t, 34); assert.ok(p.y >= 34 + 0.59); if (p.landed && landedAt == null) landedAt = t; yaw0 = p.yaw; }
  assert.ok(landedAt != null && landedAt < VEHICLE_HP.crash.helicopter - 0.5, '直升机在动画结束前没落地');
  assert.ok(Math.abs(yaw0 - h0.yaw) > Math.PI, '直升机没打转');
  const c0 = { x: 4, y: 0, z: -100, yaw: 0, pitch: 0, roll: 0 }, end = crashPose('car', c0, VEHICLE_HP.crash.car, 0);
  assert.ok(end.landed && end.roll > 1 && Math.hypot(end.x - c0.x, end.z - c0.z) > 4, '接应车没翻、没滑出去');
});

test('路线指引：从开局点到每种目标都能铺出一条贴地路线（房间里的物品先到门口），箭头间距均匀', async () => {
  const { resample, doorOutside, GUIDE } = await import('../src/jimao/guide.js');
  const goals = [RELAY_SITES[1], sites.apartment[0], sites.hotel[0], sites.shop[0]];
  for (const g of goals) {
    const door = doorOutside(L, g), goal = door || at(g);
    const pts = findPath(nav, START, goal);
    assert.ok(pts && pts.length > 1, `${g.unit || g.where} 铺不出路线`);
    const list = pts.map((s) => ({ x: s.x, y: s.y ?? 0, z: s.z }));
    if (door) list.push({ x: g.x, y: g.y ?? elev(g.floor), z: g.z });
    const R = resample(list);
    assert.ok(R.length > 10, '路线太短');
    for (let i = 1; i < R.length; i++) assert.ok(Math.abs(R[i].s - R[i - 1].s - GUIDE.spacing) < 1e-6 || R[i].s - R[i - 1].s < GUIDE.spacing + 1e-6, '箭头间距不均匀');
    const last = R.at(-1);
    assert.ok(Math.hypot(last.x - g.x, last.z - g.z) < GUIDE.spacing + 0.1, `${g.unit || g.where} 路线没走到目标跟前`);
    if (g.unit) assert.ok(door, `${g.unit} 找不到门`);
  }
});

test('开局朝向：正前方至少 20 米空地（以前正对 2 米外的咖啡外摆，推摇杆就顶住）', async () => {
  const { openYaw } = await import('../src/jimao/run.js');
  const { FPS_MISSION } = await import('../src/fps/mission-layout.js');
  const s = { ...FPS_MISSION.spawn, y: elev(FPS_MISSION.spawn.floor) }, yaw = openYaw(nav, s);
  const end = walkNav(nav, s.floor, [s.x, s.z], [s.x - Math.sin(yaw) * 20, s.z - Math.cos(yaw) * 20]);
  assert.ok(Math.hypot(end.x - s.x, end.z - s.z) > 19.5, `往前只能走 ${Math.hypot(end.x - s.x, end.z - s.z).toFixed(1)} 米`);
});

test('画质：原游戏设置面板切画质会接到我们的画质档位（不再是空函数）', () => {
  const src = readFileSync(new URL('../src/jimao/run.js', import.meta.url), 'utf8');
  assert.ok(/setQuality\(preset\) \{[\s\S]{0,240}app\.setQuality\(tier, \{ persist: false \}\)/.test(src), 'render.setQuality 没接到 app.setQuality（只改这一局，不改漫游存的画质）');
  for (const [v, t] of [['low', 'low'], ['medium', 'balanced'], ['high', 'high'], ['ultra', 'ultra']]) assert.ok(src.includes(`${v}: '${t}'`), `缺 ${v} → ${t}`);
});

test('备用摇杆：左半边按住拖动算出移动；原游戏的摇杆这一帧没给移动时顶上，给了就不管', () => {
  assert.deepEqual(stickVector(0, -58), { x: 0, y: 1 });
  const v = stickVector(200, 0); assert.ok(Math.abs(v.x - 1) < 1e-9 && Math.abs(v.y) < 1e-9, '超过半径按半径算');
  const L = {}, canvas = { addEventListener(t, f) { (L[t] ||= []).push(f); }, removeEventListener() {} };
  const fire = (t, e) => { for (const f of L[t] || []) f(e); };
  const keepW = globalThis.innerWidth; globalThis.innerWidth = 1000;
  try {
    let playing = true;
    const input = { move: { x: 0, y: 0 }, sprint: false, touch: true };
    const stick = createTouchStick({ canvas, input, active: () => playing });
    fire('pointerdown', { pointerType: 'touch', pointerId: -7, clientX: 120, clientY: 500 });
    fire('pointermove', { pointerId: -7, clientX: 120, clientY: 440 }); // 往上推 60 像素 = 推满往前
    assert.equal(stick.apply(), true); assert.ok(input.move.y > 0.99 && input.sprint, '推满往前：走 + 冲刺');
    input.move = { x: 0.3, y: 0.5 }; input.sprint = false;
    assert.equal(stick.apply(), false); assert.deepEqual(input.move, { x: 0.3, y: 0.5 }, '原游戏的摇杆在工作时不覆盖');
    input.move = { x: 0, y: 0 }; playing = false;
    assert.equal(stick.apply(), false, '暂停 / 菜单里不动');
    playing = true;
    fire('pointerdown', { pointerType: 'touch', pointerId: 3, clientX: 800, clientY: 500 }); // 右半边的手指不归摇杆
    fire('pointermove', { pointerId: 3, clientX: 860, clientY: 500 });
    assert.equal(stick.vector.x, 0);
    fire('pointerup', { pointerId: -7 });
    assert.equal(stick.held, false); assert.equal(stick.apply(), false);
    fire('pointerdown', { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 500 });
    assert.equal(stick.held, false, '鼠标不当摇杆');
    assert.equal(STICK.zone, 0.45, '跟原游戏的摇杆区一样是左边 45%');
  } finally { globalThis.innerWidth = keepW; }
});

test('低帧率：玩家按真实间隔分小步走（敌人照旧一步）；画质切换不改漫游存的档位；手机贴图封顶 1024', () => {
  const src = readFileSync(new URL('../src/jimao/run.js', import.meta.url), 'utf8');
  assert.match(src, /function stepPlayer\(dt, gap\)/);
  assert.match(src, /Math\.min\(Math\.max\(gap, dt\), 0\.15\)/);
  assert.match(src, /stepPlayer\(dt, gap\); if \(!director\.gunActive\) run\('weapon', dt\); run\('enemies', dt\)/);
  assert.match(src, /app\.setQuality\(VENDOR_TIER\[q\], \{ persist: false \}\)/);
  assert.match(src, /MOBILE && q && q\.tex > 1024/);
  assert.match(src, /stick\.apply\(\)/);
});

test('接应车：舱盖翻平不挡后方视线；车顶机枪架在环上、在眼睛前下方，四周都没有东西挡枪', async () => {
  const v = createRideVehicle({ vehicle: { kind: 'car', x: 0, z: 0, yaw: 0 }, y: 0 });
  v.root.updateMatrixWorld(true);
  const eye = v.toWorld(RIDE_SPECS.car.seat);
  // 舱盖：后方视线（眼高 2.72、往后下看 20°）上没有车顶以上的东西
  const back = new THREE.Raycaster(eye.clone(), new THREE.Vector3(0, -Math.sin(0.35), -Math.cos(0.35)).normalize(), 0.05, 3);
  const hit = back.intersectObject(v.root, true).filter((h) => h.point.y > 2.15);
  assert.equal(hit.length, 0, `往后看被挡：${hit.map((h) => h.point.toArray().map((x) => x.toFixed(2))).join(' ')}`);
  // 车顶机枪：环心在眼睛正下方约 0.3 米，枪离环心 0.8–1 米（够远，握把和机匣才在视野里：握把在视线下方 35° 以内）
  const S = RIDE_SPECS.car, [rx, ry, rz] = S.gunRing;
  assert.ok(Math.abs(rx - S.seat[0]) < 1e-9 && Math.abs(rz - S.seat[2]) < 1e-9, '环心在眼睛正下方');
  assert.ok(S.seat[1] - ry > 0.2 && S.seat[1] - ry < 0.4 && S.gunReach > 0.8 && S.gunReach < 1.0);
  const grip = Math.atan2(S.seat[1] - (ry + 0.04), S.gunReach - 0.28) * 180 / Math.PI;
  assert.ok(grip < 35, `握把在视线下方 ${grip.toFixed(0)}°，看不见枪身`);
  // 枪绕环一整圈（每 30° 一处），枪身高度上、往外 0.9 米以内没有车顶上的东西（原来口前的挡板已经去掉）
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    const from = new THREE.Vector3(rx, ry + 0.04, rz), dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const blocked = new THREE.Raycaster(from, dir, 0.05, S.gunReach + 0.5).intersectObject(v.root, true);
    assert.equal(blocked.length, 0, `${Math.round(a * 180 / Math.PI)}° 方向有东西挡枪`);
  }
  // 短立柱的机枪模型：最低点不低于转轴下 0.9 米（弹药箱），立柱只有一小截
  // 车顶上的机枪：立柱和弹药箱都不低于转盘下 0.4 米（不插进车顶）
  const g = buildDoorGun(null, { post: 0.24, drop: 0.24 });
  const box = new THREE.Box3().setFromObject(g.root);
  assert.ok(box.min.y > -0.4 && box.max.y < 0.35, `机枪高度范围 ${box.min.y.toFixed(2)}…${box.max.y.toFixed(2)}`);
  assert.ok(ry + box.min.y > 2.0, '机枪最低点不低于车顶');
  g.dispose();
  // 乘坐时步枪停用（两种载具都用车载机枪）
  const src = readFileSync(new URL('../src/jimao/missions.js', import.meta.url), 'utf8');
  assert.match(src, /state\.phase === 'crash' \|\| state\.phase === 'ride'; \}/);
  assert.match(src, /createDoorGun\(G, carMount, \{ label: 'M134 车顶机枪', post: 0\.24, drop: 0\.24, flash: 0\.7 \}\)/);
});

test('坚守：控制点从开局点走得到，圈里基本是空地；任务文字随进出圈变化', () => {
  for (const h of HOLD_SITES) {
    assert.ok(findPath(nav, START, at(h)), `${h.where} 走不到`);
    let open = 0, n = 0;
    for (const r of [2, 4, HOLD.radius - 0.5]) for (let k = 0; k < 16; k++) {
      n++; const q = landAt(nav, h.x + Math.cos(k / 16 * Math.PI * 2) * r, h.z + Math.sin(k / 16 * Math.PI * 2) * r, elev(h.floor) + 0.6);
      if (q && q.floor === h.floor && clear(nav, q)) open++;
    }
    assert.ok(open / n > 0.6, `${h.where} 圈里只有 ${open}/${n} 是空地`);
  }
  const m = rollMission(seq(4), sites, { type: 'hold', exit: 'car' });
  assert.equal(missionText(m, { cut: 0, allCut: false, relays: [] }, 0, null, { t: 0, inside: false }), `前往${m.hold.where}控制点 · 0/${HOLD.need} 秒`);
  assert.equal(missionText(m, { cut: 0, allCut: false, relays: [] }, 0, null, { t: 30.6, inside: true }), `坚守${m.hold.where} 30/${HOLD.need} 秒`);
  assert.equal(missionText(m, { cut: 0, allCut: false, relays: [] }, 0, null, { t: 30.6, inside: false }), `回到${m.hold.where}控制点 · 30/${HOLD.need} 秒`);
  assert.match(missionRadio(m).intro, new RegExp(`${m.hold.where}.*${HOLD.need} 秒`));
  // 增援刷在附近（不是整张地图），同时在场的人数有上限
  assert.ok(HUNT.near >= 15 && HUNT.far <= 60 && HUNT.alive >= 5 && HOLD.alive >= HUNT.alive);
});

test('电梯：零点突围地图上的电梯每层门口都在导航空地上；门口 2.4 米内认得出是哪部、哪一层；楼层名、出门朝向', () => {
  const lifts = nav.links.filter((l) => l.kind === 'lift' && l.stops.length > 1);
  assert.ok(lifts.length >= 30, `只有 ${lifts.length} 部电梯`);
  for (const id of ['P1-SE-L1', 'H-L1', 'A-L1', 'P1-C-GW']) assert.ok(lifts.some((l) => l.id === id), `${id} 不在`);
  for (const link of lifts) for (const [i, s] of link.stops.entries()) {
    assert.ok(clear(nav, { floor: s.floor, x: s.x, z: s.z, y: nav.floors.get(s.floor).y, slope: null }), `${link.id} ${s.floor} 门口被挡`);
    const near = liftAt(lifts, s.floor, s.x + 1, s.z);
    assert.ok(near && near.link.stops[near.i].floor === s.floor, `${link.id} ${s.floor} 门口认不出来`);
    assert.ok(Math.hypot(...s.face) > 0.99 && faceYaw(s) != null);
  }
  const h = lifts.find((l) => l.id === 'H-L1'), s = h.stops[5];
  assert.equal(liftAt(lifts, s.floor, s.x + LIFT.reach + 0.5, s.z + LIFT.reach), null, '离门口太远不算');
  assert.equal(floorLabel(L, 'H-12F'), '12F'); assert.equal(floorLabel(L, 'P1-B1M'), 'B1M');
  // 出门朝外：yaw 对应的视线方向 (−sin yaw, −cos yaw) 就是门的外法线
  const y = faceYaw(s); assert.ok(Math.abs(-Math.sin(y) - s.face[0]) < 1e-9 && Math.abs(-Math.cos(y) - s.face[1]) < 1e-9);
});

test('封面：五种任务都列出来、和任务表一一对应；文案里没有开发工具的名字；话术跟着任务走', async () => {
  const { coverHtml, COVER_OPS, COVER_COPY, SCREEN_COPY, ABOUT_COPY, LIFT_HELP, COVER_CSS } = await import('../src/jimao/cover.js');
  assert.deepEqual(COVER_OPS.map((o) => o.type), [...MISSION_TYPES]);
  const html = coverHtml();
  for (const t of MISSION_TYPES) assert.match(html, new RegExp(`data-op="${t}"`));
  assert.match(html, /data-zh="actions"/); assert.match(html, /零点突围/);
  const all = [html, ...SCREEN_COPY.flat(), ...ABOUT_COPY, LIFT_HELP, JSON.stringify(COVER_COPY)].join('\n');
  assert.doesNotMatch(all, /Fable|几猫/);
  assert.match(LIFT_HELP, /<kbd>Z<\/kbd>.*<kbd>X<\/kbd>/);
  // 园区漫游的 .panel 会盖掉原游戏面板的深色底：封面样式里要压回去
  assert.match(COVER_CSS, /\.menu \.panel \{ background: rgba\(11, 13, 15, \.95\) !important/);
  // 原游戏打包里也不留开发工具的名字（scripts/jimao/rebrand.mjs 换掉）
  assert.doesNotMatch(readFileSync(new URL('../src/jimao/vendor/game.js', import.meta.url), 'utf8'), /Fable/);
  // 无线电：每种任务都有开场白，撤离点写进去
  for (const t of MISSION_TYPES) {
    const r = missionRadio(rollMission(seq(11), sites, { type: t, exit: 'heli' }));
    assert.ok(r.intro.length > 20 && r.intro.includes('直升机'), `${t} 开场白`);
  }
});
