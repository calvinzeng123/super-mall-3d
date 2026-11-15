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
import { MISSION_TYPES, RELAY_SITES, EXTRACTIONS, rideShot, roomSites, rollMission, missionText, missionRadio } from '../src/jimao/missions.js';
import { createRideVehicle, rideFootprint, RIDE_SPECS, BOARD_TIME } from '../src/jimao/ride-vehicles.js';

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

test('随机任务：四种都抽得到，两种撤离都抽得到，目标齐全', () => {
  const rng = seq(7), types = new Set(), exits = new Set();
  for (let i = 0; i < 80; i++) {
    const m = rollMission(rng, sites);
    types.add(m.type); exits.add(m.extraction.id);
    if (m.type === 'relay') assert.equal(m.objectives.length, 3);
    else if (m.type === 'eliminate') { assert.equal(m.objectives.length, 0); assert.ok(m.kills >= 10); }
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
  for (const k of ['helicopter', 'car']) assert.ok(rideShot(k) >= BOARD_TIME + 4, `${k} 撤离镜头太短`);
});

test('撤离载具能坐进去：门口在空地上、机身占地不压墙，座位在舱里，直升机真的飞走、车真的开走', () => {
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
    // 座位在舱里：眼睛离舱底 0.9 米以上、离舱顶 0.2 米以上
    const seat = veh.seatPose(0, 0).position;
    assert.ok(seat.y - y > 1.5 && seat.y - y < 1.85, `${name}座位高度 ${(seat.y - y).toFixed(2)}`);
    assert.ok(seat.x > r.x0 && seat.x < r.x1 && seat.z > r.z0 && seat.z < r.z1, `${name}座位不在机身里`);
    // 坐着朝前看：视线方向和机头一致
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(veh.seatPose(0, 0).quaternion), nose = new THREE.Vector3(Math.sin(x.vehicle.yaw), 0, Math.cos(x.vehicle.yaw));
    assert.ok(fwd.dot(nose) > 0.95, `${name}座位没朝前`);
    veh.update(0.1, { ready: true, board: BOARD_TIME + RIDE_SPECS[x.vehicle.kind].ride, ride: RIDE_SPECS[x.vehicle.kind].ride });
    const end = veh.seatPose(0, 0).position;
    if (x.vehicle.kind === 'helicopter') { assert.ok(end.y - seat.y > 30, '直升机没飞起来'); assert.ok(end.distanceTo(seat) > 120, '直升机没飞远'); }
    else assert.ok(Math.hypot(end.x - seat.x, end.z - seat.z) > 18 && Math.abs(end.y - seat.y) < 0.2, '接应车没开走');
    veh.reset(); assert.ok(veh.seatPose(0, 0).position.distanceTo(seat) < 1e-6, `${name}重开后没回到原位`);
    veh.dispose();
  }
});
