// 「零点突围」的随机任务（地图是园区探索的那张：一期商场、酒店、公寓、地铁）。
// 每局开始（含重开）抽一种任务和一种撤离方式：
//   切断中继   商场西翼、酒店二楼、地下大厅三处上行中继，按住交互切断；
//   歼灭       歼灭一定数量的武装劫持者（敌人会持续增援）；
//   取物·住户  去公寓住户家里和商场商铺里各取回一件物品；
//   取物·酒店  去酒店两间客房取回情报箱；
//   坚守       守住一处控制点 75 秒（站在圈里才计时），敌人一波波冲过来。
// 歼灭和坚守的敌人会主动找你（每隔几秒把你的位置告诉他们），HUD 上每个敌人一个红点、带距离，
// 地上的蓝色箭头指向最近的敌人；增援在你附近 20–50 米、同一层优先的地方刷出来（以前在整张地图上随机刷，很难找）。
// 撤离：一期商场屋顶的直升机，或公寓地下车库的装甲接应车。
// 原游戏的任务流程（按住交互、波次增援、撤离判定、结算）不变；这里给它提供关卡数据（目标、文字、撤离点）、
// 装置和载具模型，并负责歼灭任务的计数和增援。原游戏那边的接口见 scripts/jimao/patches.mjs 里「随机任务」几条。
import * as THREE from 'three';
import { landAt, clear } from '../layout/nav.js';
import { toW } from '../layout/geom.js';
import { createRideVehicle, rideLocalToWorld, rideFootprint, RIDE_SPECS, BOARD_TIME } from './ride-vehicles.js';
import { CAR_ROUTE, sampleRoute, carPoseAt, carSpeedAt, HELI_ORBIT, heliPoseAt, heliDuration } from './ride-paths.js';
import { CUT, carOutroPose, outroCamera, outroFade } from './cutscene.js';
import { createDoorGun } from './door-gun.js';
import { VEHICLE_HP, rayMiss, crashPose, makeDurabilityHud } from './vehicle-damage.js';

export const MISSION_TYPES = Object.freeze(['relay', 'eliminate', 'rooms', 'hotel', 'hold', 'bomb', 'hvt']);
export const ELIMINATE_TARGET = 12;
/** 坚守：圈的半径（米）、要守的秒数、同时在场的敌人上限、刷兵间隔 */
export const HOLD = Object.freeze({ radius: 6, need: 75, alive: 7, every: 2.2 });
/** 歼灭 / 坚守的增援：同时在场上限、间隔、离玩家多远刷（米）、多久把玩家位置告诉一次敌人（秒） */
export const HUNT = Object.freeze({ alive: 6, every: 2.2, near: 20, far: 50, tell: 3 });

/** 坚守的控制点：导航上能站、四周 6 米基本是空地，同一层 20–50 米内有 20 个以上的刷兵点（实测；车库那一层没有刷兵点，不用） */
export const HOLD_SITES = Object.freeze([
  { floor: 'P1-1F', x: -169, z: -90, where: '商场西翼' },
  { floor: 'H-1F', x: -245, z: -81, where: '酒店大堂' },
  { floor: 'P1-2F', x: -100, z: -140, where: '商场二楼走道' },
  { floor: 'P1-B1M', x: -151, z: -94, where: '地下大厅' },
  { floor: 'P1-RF', x: -160, z: -120, where: '屋顶花园' },
  // 下面几处是后来加的（把地铁、地库、商场高层、公寓也用上）
  { floor: 'M-B1', x: -36, z: -12, where: '地铁站厅' },
  { floor: 'M-B3', x: -18, z: -6, where: '地铁换乘厅' },
  { floor: 'P1-B1', x: -126, z: -132, where: '商场地库' },
  { floor: 'P1-5F', x: -150, z: -126, where: '商场五楼' },
  { floor: 'A-1F', x: -36, z: -216, where: '公寓大堂' },
]);
const HOTEL_Z = -81.1533717;
/** 拆弹：几颗、总共多少秒（三颗分在三栋楼 / 三个区，坐电梯赶路）、最后多少秒开始催 */
export const BOMB = Object.freeze({ count: 3, time: 330, hurry: 60 });
/** 猎杀头目：身边几个护卫、护卫离头目多远 */
export const HVT = Object.freeze({ guards: 3, ring: 5 });
const BOSS_NAMES = ['灰狼', '铁砧', '渡鸦', '黑桃', '蝰蛇'];

/**
 * 全图的行动地点（中继、炸弹、头目、坚守都从这里抽）：每处都在导航空地上、四周 6 米基本是空的、从开局点走得到
 * （tests/jimao-missions.test.js 逐个验）。zone 是所在的片区——一局里的几个地点尽量分在不同片区，把整张图都跑到。
 */
export const OPS_SITES = Object.freeze([
  { floor: 'P1-1F', x: -169, z: -90, where: '商场西翼', zone: 'mall-low' },
  { floor: 'P1-2F', x: -100, z: -140, where: '商场二楼走道', zone: 'mall-low' },
  { floor: 'P1-B1M', x: -151, z: -94, where: '地下大厅', zone: 'mall-under' },
  { floor: 'P1-B1M', x: -138, z: -138, where: '美食广场', zone: 'mall-under' },
  { floor: 'P1-B1', x: -126, z: -132, where: '商场地库', zone: 'mall-under' },
  { floor: 'P1-4F', x: -102, z: -132, where: '商场四楼', zone: 'mall-high' },
  { floor: 'P1-5F', x: -150, z: -126, where: '商场五楼', zone: 'mall-high' },
  { floor: 'P1-6F', x: -96, z: -132, where: '商场六楼', zone: 'mall-high' },
  { floor: 'P1-RF', x: -160, z: -120, where: '屋顶花园', zone: 'roof' },
  { floor: 'P1-RF', x: -96, z: -138, where: '屋顶东侧', zone: 'roof' },
  { floor: 'P1C-1F', x: -132, z: -216, where: '艺文馆', zone: 'north' },
  { floor: 'H-1F', x: -245, z: -81, where: '酒店大堂', zone: 'hotel' },
  { floor: 'H-2F', x: -245, z: HOTEL_Z, where: '酒店二楼', zone: 'hotel' },
  { floor: 'H-8F', x: -216, z: -84, where: '酒店八楼', zone: 'hotel' },
  { floor: 'H-12F', x: -216, z: -84, where: '酒店十二楼', zone: 'hotel' },
  { floor: 'A-1F', x: -36, z: -216, where: '公寓大堂', zone: 'apartment' },
  { floor: 'A-6F', x: -36, z: -186, where: '公寓六楼', zone: 'apartment' },
  { floor: 'M-B1', x: -36, z: -12, where: '地铁站厅', zone: 'metro' },
  { floor: 'M-B2', x: -6, z: 0, where: '地铁站台', zone: 'metro' },
  { floor: 'M-B3', x: -18, z: -6, where: '地铁换乘厅', zone: 'metro' },
]);
/** 从全图地点里抽 n 处，尽量每处在不同的片区；rng 返回 [0, 1) */
export function pickSites(rng, n, pool = OPS_SITES) {
  const left = [...pool], out = [];
  while (out.length < n && left.length) {
    const fresh = left.filter((s) => !out.some((o) => o.zone === s.zone)), from = fresh.length ? fresh : left;
    const s = from[Math.floor(rng() * from.length)];
    out.push(s); left.splice(left.indexOf(s), 1);
  }
  return out;
}

/** 三处中继（旧 FPS 任务的终端、酒店情报点和地下大厅；在园区地图上都实测可达） */
export const RELAY_SITES = Object.freeze([
  { floor: 'P1-1F', x: -169, z: -90, where: '商场西翼' },
  { floor: 'H-2F', x: -245, z: HOTEL_Z, where: '酒店二楼' },
  { floor: 'P1-B1M', x: -151, z: -94, where: '地下大厅' },
]);

/** 两种撤离：直升机停在一期屋顶（从中庭扶梯一路上到 RF），接应车停在公寓 B1 车库出口坡道前。
 * 撤离点在登机门 / 车门外：走到门口就登机，然后不是直接结算，而是坐在载具上打一段——
 *   直升机：绕一期屋顶飞一圈，用左舷六管机枪清扫源源不断冲上楼顶的敌人，再飞走；
 *   接应车：沿出口坡道 → 星湾路 → 云澜大道一路开出去，玩家站在车顶射击口里用步枪压制沿路两侧冲出来的敌人。 */
// 屋顶光穹（半径 30 m，圆心 -106,-106）西边、一期屋面上半径 7.5 m 都是空地的一块，离屋顶酒吧、咖啡座和花池都在 9 m 以上；机头朝南（-z）
const HELI = Object.freeze({ kind: 'helicopter', x: -182, z: -120, yaw: Math.PI });
const CAR = Object.freeze({ kind: 'car', x: CAR_ROUTE.start.x, z: CAR_ROUTE.start.z, yaw: CAR_ROUTE.start.yaw }); // 车头朝南对着出口坡道
const door = (veh) => { const p = rideLocalToWorld(veh, 0, RIDE_SPECS[veh.kind].doorOut); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; };
export const EXTRACTIONS = Object.freeze({
  heli: { id: 'heli', label: '直升机', where: '一期商场屋顶', floor: 'P1-RF', ...door(HELI), radius: 1.7, vehicle: HELI,
    blocked: '任务还没完成，直升机不会在火力下降落' },
  car: { id: 'car', label: '接应车', where: '公寓地下车库', floor: 'A-B1', ...door(CAR), radius: 1.7, vehicle: CAR,
    blocked: '任务还没完成，接应车不会进场' },
});
/** 接应车路线全长（米） */
export const CAR_ROUTE_LENGTH = sampleRoute(CAR_ROUTE).at(-1).s;

const ROOM_FLOORS = { apartment: ['A-2F', 'A-3F', 'A-4F'], shop: ['P1-1F', 'P1-2F', 'P1-3F'], hotel: ['H-2F', 'H-3F', 'H-4F', 'H-5F', 'H-6F'] };

/**
 * 地图上所有能放物品的房间：公寓住户、商场商铺、酒店客房。物品放在房间矩形的中心
 * （导航上能站、确实在这一层；公寓、客房的门在走廊一侧，人从门走进去）。
 */
export function roomSites(layout, nav) {
  const out = { apartment: [], shop: [], hotel: [] };
  for (const [kind, floors] of Object.entries(ROOM_FLOORS)) for (const id of floors) {
    const lv = layout.levels.find((l) => l.id === id);
    if (!lv) continue;
    for (const u of lv.units) {
      const r = u.rects?.[0];
      if (!r || (kind === 'shop') !== !u.residence) continue;
      const [x, z] = toW(u.frame, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      const st = landAt(nav, x, z, lv.elev + 0.6);
      if (!st || st.floor !== id || !clear(nav, st)) continue;
      const n = +(u.id.split('-').at(-1).replace(/\D/g, '') || 1);
      const name = kind === 'shop' ? (u.brand?.name || '商铺') : `${lv.short.replace(/\D/g, '')}${String(n).padStart(2, '0')}`;
      out[kind].push({ floor: id, x: st.x, z: st.z, y: lv.elev, unit: u.id, name, level: lv.short });
    }
  }
  return out;
}

// ---- 模型 ----
const MAT = {};
function mats() {
  if (MAT.dark) return MAT;
  Object.assign(MAT, {
    dark: new THREE.MeshStandardMaterial({ color: '#2a3238', metalness: 0.55, roughness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: '#8b969c', metalness: 0.8, roughness: 0.35 }),
    case: new THREE.MeshStandardMaterial({ color: '#1d2226', metalness: 0.3, roughness: 0.45 }),
    brass: new THREE.MeshStandardMaterial({ color: '#d9b066', metalness: 0.7, roughness: 0.3 }),
    green: new THREE.MeshBasicMaterial({ color: '#4cf08f' }),
    amber: new THREE.MeshBasicMaterial({ color: '#ffb13b' }),
    red: new THREE.MeshBasicMaterial({ color: '#ff4a3d' }),
    beam: new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.18, depthWrite: false }),
  });
  return MAT;
}
const add = (g, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };

/** 上行中继：机柜、天线、指示灯；live 绿灯闪、cutting 黄灯快闪、cut 红灯常亮天线断开 */
export function relayModel() {
  const M = mats(), g = new THREE.Group();
  add(g, new THREE.BoxGeometry(1.2, 0.16, 0.8), M.metal, 0, 0.08, 0);
  add(g, new THREE.BoxGeometry(1.0, 1.5, 0.62), M.dark, 0, 0.91, 0);
  for (const x of [-0.28, 0, 0.28]) add(g, new THREE.BoxGeometry(0.2, 0.9, 0.02), M.metal, x, 0.95, 0.32);
  const mast = add(g, new THREE.CylinderGeometry(0.03, 0.04, 1.1, 8), M.metal, -0.3, 2.2, -0.1);
  const dish = add(g, new THREE.CylinderGeometry(0.22, 0.05, 0.12, 12), M.metal, 0.25, 1.8, -0.05); dish.rotation.x = 1.1;
  const lamp = add(g, new THREE.SphereGeometry(0.09, 10, 8), M.green, 0.36, 1.58, 0.32);
  let state = 'live', t = 0;
  g.userData.setState = (s) => { state = s; mast.visible = s !== 'cut'; lamp.material = s === 'cut' ? M.red : s === 'cutting' ? M.amber : M.green; };
  g.userData.update = (dt) => { t += dt; lamp.visible = state === 'cut' || (Math.sin(t * (state === 'cutting' ? 22 : 5)) > -0.3); };
  return g;
}

/** 要取回的物品：小台子上的黑色手提箱，上面一道淡金色光柱方便远处找到；取走以后箱子和光柱消失 */
export function itemModel() {
  const M = mats(), g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.9, 0.06, 0.6), M.metal, 0, 0.74, 0);
  for (const x of [-0.4, 0.4]) for (const z of [-0.25, 0.25]) add(g, new THREE.BoxGeometry(0.04, 0.74, 0.04), M.metal, x, 0.37, z);
  const box = new THREE.Group(); g.add(box);
  add(box, new THREE.BoxGeometry(0.6, 0.18, 0.42), M.case, 0, 0.86, 0);
  add(box, new THREE.BoxGeometry(0.2, 0.05, 0.04), M.brass, 0, 0.98, 0.0);
  for (const x of [-0.2, 0.2]) add(box, new THREE.BoxGeometry(0.05, 0.05, 0.03), M.brass, x, 0.88, 0.22);
  const beam = add(g, new THREE.CylinderGeometry(0.12, 0.35, 3.2, 12, 1, true), M.beam, 0, 2.2, 0);
  let t = 0, taken = false;
  g.userData.setState = (s) => { taken = s === 'cut'; box.visible = beam.visible = !taken; };
  g.userData.update = (dt) => { t += dt; if (!taken) { box.position.y = Math.sin(t * 2) * 0.01; beam.material.opacity = 0.12 + 0.06 * Math.sin(t * 3); } };
  return g;
}

/** 定时炸弹：地上一只黑色工具箱，上面绑着几管炸药和一块红色的计时屏；没拆时红灯越闪越急、头顶一道淡红色光柱，拆掉以后绿灯常亮 */
export function bombModel() {
  const M = mats(), g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.7, 0.26, 0.46), M.case, 0, 0.13, 0);
  for (const x of [-0.2, 0, 0.2]) { const t = add(g, new THREE.CylinderGeometry(0.055, 0.055, 0.42, 10), new THREE.MeshStandardMaterial({ color: '#8a2f24', roughness: 0.7 }), x, 0.32, 0); t.rotation.x = Math.PI / 2; }
  add(g, new THREE.BoxGeometry(0.62, 0.03, 0.05), M.dark, 0, 0.385, 0.12); add(g, new THREE.BoxGeometry(0.62, 0.03, 0.05), M.dark, 0, 0.385, -0.12);
  const screen = add(g, new THREE.BoxGeometry(0.3, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: '#ff3b2f' }), 0, 0.45, 0.2); screen.rotation.x = -0.5;
  const lamp = add(g, new THREE.SphereGeometry(0.06, 10, 8), M.red, 0.27, 0.44, 0);
  const beam = add(g, new THREE.CylinderGeometry(0.12, 0.35, 3.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ff5a4a', transparent: true, opacity: 0.16, depthWrite: false }), 0, 2, 0);
  let t = 0, state = 'live', rate = 3;
  g.userData.setState = (s) => { state = s; lamp.material = s === 'cut' ? M.green : s === 'cutting' ? M.amber : M.red; beam.visible = s !== 'cut'; screen.visible = s !== 'cut'; lamp.visible = true; };
  /** 闪得多急（每秒几下）：director 按剩余时间调 */
  g.userData.setRate = (r) => { rate = r; };
  g.userData.update = (dt) => { t += dt; if (state === 'cut') return; const on = Math.sin(t * rate * Math.PI * 2) > 0; lamp.visible = on || state === 'cutting'; screen.material.color.set(on ? '#ff3b2f' : '#7a1a14'); beam.material.opacity = 0.1 + (on ? 0.1 : 0); };
  return g;
}

/** 坚守的控制点：地上一圈琥珀色光环（站进去变绿）、中间一根光柱，远处也看得见 */
export function holdModel(radius = HOLD.radius) {
  const M = mats(), g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffb13b', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.25, radius, 64).rotateX(-Math.PI / 2), ringMat); ring.position.y = 0.04; g.add(ring);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.25, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb13b', transparent: true, opacity: 0.08, depthWrite: false })); fill.position.y = 0.03; g.add(fill);
  const beam = add(g, new THREE.CylinderGeometry(0.18, 0.45, 6, 12, 1, true), M.beam.clone(), 0, 3, 0);
  let t = 0, state = 'out';
  g.userData.setState = (s) => {
    state = s;
    const c = s === 'in' ? '#4cf08f' : s === 'cut' ? '#8b969c' : '#ffb13b';
    ringMat.color.set(c); fill.material.color.set(c); beam.visible = s !== 'cut';
  };
  g.userData.update = (dt) => { t += dt; ringMat.opacity = state === 'in' ? 0.75 : 0.4 + 0.2 * Math.sin(t * 4); beam.material.opacity = 0.12 + 0.06 * Math.sin(t * 3); };
  return g;
}

/**
 * 抽一局任务。rng 返回 [0, 1)。返回 { type, title, objectives: [{ id, label, verb, kind, site }], extraction, kills }
 */
/** 载具被击落 / 撤离途中阵亡后重来的出生点：载具复位，在门口外找一块本层空地——先朝门外正前方，
 *  不行就往两侧转（公寓车库的车门正对车库西墙，墙外是一期 B1，只能站到车头 / 车尾那边），
 *  离登机点至少 BOARD_GAP 米（不然一落地就自动上车），不压在机身上；面朝车门。都不行才退到门外 1.2 米。
 *  原游戏的 yaw：朝 (dx, dz) 看时 yaw = atan2(−dx, −dz)。 */
export const BOARD_GAP = 3;
export function boardingSpot(nav, vv, x, y) {
  vv.reset(); vv.root.updateMatrixWorld(true);
  const D = vv.toWorld(vv.spec.doorOut), c = vv.root.position, r = rideFootprint(x.vehicle);
  let ox = D.x - c.x, oz = D.z - c.z; const n = Math.hypot(ox, oz) || 1; ox /= n; oz /= n;
  const face = (px, pz) => ({ pos: new THREE.Vector3(px, y, pz), yaw: Math.atan2(-(D.x - px), -(D.z - pz)) });
  for (const k of [4.5, 3.5]) for (const deg of [0, 30, -30, 60, -60, 90, -90, 120, -120]) {
    const a = deg * Math.PI / 180, dx = ox * Math.cos(a) - oz * Math.sin(a), dz = ox * Math.sin(a) + oz * Math.cos(a);
    const px = D.x + dx * k, pz = D.z + dz * k;
    if (Math.hypot(px - x.x, pz - x.z) < BOARD_GAP) continue;
    if (px > r.x0 - 0.6 && px < r.x1 + 0.6 && pz > r.z0 - 0.6 && pz < r.z1 + 0.6) continue;
    const st = landAt(nav, px, pz, y + 0.6);
    if (st && st.floor === x.floor && Math.abs(st.y - y) < 0.5 && clear(nav, st)) return face(px, pz);
  }
  return face(D.x + ox * 1.2, D.z + oz * 1.2);
}

export function rollMission(rng, sites, { type, exit } = {}) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  type ||= pick(MISSION_TYPES);
  const extraction = EXTRACTIONS[exit || (rng() < 0.5 ? 'heli' : 'car')];
  let objectives = [], title;
  if (type === 'relay') {
    title = '切断上行中继';
    // 三台中继每局换地方，分在三个片区
    objectives = pickSites(rng, 3).map((s, i) => ({ id: `relay_${'abc'[i]}`, label: `${'甲乙丙'[i]}号中继 · ${s.where}`, verb: '切断中继', kind: 'relay', site: s }));
  } else if (type === 'bomb') {
    title = '拆除定时炸弹';
    objectives = pickSites(rng, BOMB.count).map((s, i) => ({ id: `bomb_${'abc'[i]}`, label: `${'一二三'[i]}号炸弹 · ${s.where}`, verb: '拆除炸弹', kind: 'bomb', site: s }));
    return { type, title, objectives, extraction, kills: 0, bomb: { time: BOMB.time } };
  } else if (type === 'hvt') {
    title = '猎杀头目';
    const site = pickSites(rng, 1)[0];
    return { type, title, objectives, extraction, kills: 0, hvt: { ...site, name: pick(BOSS_NAMES) } };
  } else if (type === 'rooms') {
    title = '取回失窃物品';
    const a = pick(sites.apartment), s = pick(sites.shop);
    objectives = [
      { id: 'item_a', label: `证物箱 · 公寓 ${a.level} ${a.name} 室`, verb: '取回', kind: 'item', site: a },
      { id: 'item_b', label: `货款箱 · 商场 ${s.level} ${s.name}`, verb: '取回', kind: 'item', site: s },
    ];
  } else if (type === 'hotel') {
    title = '酒店情报回收';
    const a = pick(sites.hotel), rest = sites.hotel.filter((h) => h.floor !== a.floor), b = pick(rest.length ? rest : sites.hotel);
    objectives = [a, b].map((h, i) => ({ id: `intel_${'ab'[i]}`, label: `情报箱 · 酒店 ${h.level} ${h.name} 房`, verb: '取回', kind: 'item', site: h }));
  } else if (type === 'hold') {
    title = '坚守控制点';
    return { type, title, objectives, extraction, kills: 0, hold: { ...pick(HOLD_SITES), radius: HOLD.radius, need: HOLD.need } };
  } else {
    title = '歼灭武装劫持者';
  }
  return { type, title, objectives, extraction, kills: type === 'eliminate' ? ELIMINATE_TARGET : 0 };
}

/** 倒计时牌上的字：「05:28」 */
export function bombClock(seconds) { const t = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }

/** 这一局的目标文字（任务栏）。c 是原游戏的进度对象 { cut, allCut, relays } */
export function missionText(m, c, kills = 0, ride = null, hold = null) {
  const x = m.extraction;
  if (ride?.kind === 'helicopter') return `清扫楼顶 · 击倒 ${ride.kills}`;
  if (ride?.kind === 'car') return `突围 · 剩 ${Math.max(0, Math.round(ride.left))} 米 · 击倒 ${ride.kills}`;
  if (c.allCut) return `撤离 · ${x.where}${x.label}`;
  if (m.type === 'eliminate') return `歼灭武装劫持者 ${Math.min(kills, m.kills)}/${m.kills}`;
  if (m.type === 'hvt') return `猎杀头目「${m.hvt.name}」 · ${m.hvt.where}`;
  if (m.type === 'bomb') {
    // 倒计时不写在任务栏里（任务栏的字是一个个打出来的，每秒换一次永远打不完）：另有一块大的计时牌（bombClock）
    const left = c.relays.length - c.cut;
    return `拆除炸弹 ${c.cut}/${c.relays.length}${left === 1 ? ' · 最后一颗' : ''}`;
  }
  if (m.type === 'hold') {
    const t = Math.min(m.hold.need, Math.floor(hold?.t || 0));
    return hold?.inside ? `坚守${m.hold.where} ${t}/${m.hold.need} 秒` : `${t ? '回到' : '前往'}${m.hold.where}控制点 · ${t}/${m.hold.need} 秒`;
  }
  const left = c.relays.length - c.cut;
  if (m.type === 'relay') return c.cut === 0 ? '切断三处上行中继' : left === 1 ? '切断最后一处中继' : `切断剩余 ${left} 处中继`;
  return c.cut === 0 ? `取回 ${c.relays.length} 件目标物品` : `还剩 ${left} 件物品`;
}

/** 这一局的无线电台词（原游戏的台词表 RADIO 每局按任务改写） */
export function missionRadio(m) {
  const x = m.extraction, done = `${x.label}在${x.where}待命，立刻撤离！`;
  const intro = {
    relay: '特勤组，这里是指挥中心。他们靠三台上行中继往外发信号：商场西翼、酒店二楼、地下大厅。全部拔掉。',
    eliminate: `特勤组，这里是指挥中心。楼里至少还有 ${m.kills} 名武装分子，HUD 上的红点就是他们。一个不留。`,
    rooms: `特勤组，这里是指挥中心。赃物藏在${m.objectives.map((o) => o.label.split(' · ')[1]).join('和')}，地上的蓝色箭头会带你过去。`,
    hotel: `特勤组，这里是指挥中心。酒店里有两箱被劫走的情报：${m.objectives.map((o) => o.label.split(' · ')[1]).join('、')}。拿回来。`,
    hold: `特勤组，这里是指挥中心。拿下${m.hold?.where}的控制点，在光圈里守住 ${m.hold?.need} 秒，技术组要接管系统。`,
    bomb: `特勤组，这里是指挥中心。他们在${m.objectives.map((o) => o.label.split(' · ')[1]).join('、')}各放了一颗定时炸弹，${Math.round((m.bomb?.time || 0) / 60 * 10) / 10} 分钟后一起引爆。三处离得远，坐电梯赶路。`,
    hvt: `特勤组，这里是指挥中心。这伙人的头目代号「${m.hvt?.name}」，人在${m.hvt?.where}，身边有护卫。他比别人能扛得多——找到他，击毙。`,
  }[m.type];
  const step = m.type === 'relay' ? ['第一台中继断了。他们发现了，正往你这边压。', '第二台也断了。最后一台，他们会拼命守。']
    : m.type === 'bomb' ? ['第一颗拆掉了。抓紧，另外两颗还在走。', '第二颗也拆了。最后一颗，快！']
    : m.type === 'eliminate' || m.type === 'hold' || m.type === 'hvt' ? ['打得好，别停。', '增援还在往里涌，顶住。'] : ['第一件到手。他们察觉了，正在赶来。', '第二件到手。'];
  return {
    intro: `${intro}完事后乘${x.label}撤离。`,
    contact: '被发现了！他们正从几个方向围过来。',
    cut: step,
    all: `${m.type === 'relay' ? '中继全部断开，信号切断了！' : m.type === 'eliminate' ? '目标区域肃清！' : m.type === 'hold' ? '技术组已接管系统！' : m.type === 'bomb' ? '炸弹全部拆除！' : m.type === 'hvt' ? `「${m.hvt?.name}」已击毙！` : '东西全部到手！'}${done}`,
    low: '你中弹了。找掩体，缓一口气。',
    done: '指挥中心收到。云澜汇已收复，特勤组安全撤离——干得漂亮。',
  };
}

/**
 * 接到游戏上：G 是原游戏的共享上下文，nav 是导航网格，camera 是主相机。
 * 返回 { roll(), prePlayer(dt), update(dt), gunActive, riding, rideKind, ... }：
 *   roll 每局开始时抽任务、摆模型；prePlayer 在玩家更新之前把载具和玩家摆到这一帧的位置；
 *   update 推进模型、歼灭计数、增援、登机镜头、坐车 / 坐直升机时的刷兵和舱门机枪。
 */
export function createMissionDirector(G, { scene, layout, nav, J, camera = null, rng = Math.random, force = {}, letterbox = null }) {
  const sites = roomSites(layout, nav);
  const root = new THREE.Group(); root.name = '零点突围任务物件'; scene.add(root);
  const v = (s, dy = 0) => new THREE.Vector3(s.x, (s.y ?? 0) + dy, s.z);
  const elev = (floor) => layout.levels.find((l) => l.id === floor)?.elev ?? 0;
  const vehicles = {};
  for (const [id, x] of Object.entries(EXTRACTIONS)) {
    const exit = { ...x, y: elev(x.floor) };
    vehicles[id] = createRideVehicle(exit);
    root.add(vehicles[id].root); // 两台都摆着（也都是导航障碍）；没抽到的那台熄火停着
  }
  // 舱门机枪挂在直升机左舷，枪口默认朝舱门外（挂点 +z = 机身 +x）
  const gunMount = new THREE.Object3D();
  gunMount.position.set(...RIDE_SPECS.helicopter.gunMount); gunMount.rotation.y = Math.PI / 2;
  vehicles.heli.body.add(gunMount);
  const doorGun = createDoorGun(G, gunMount);
  // 装甲车的车顶机枪（同一挺 M134）：不用换弹、只会过热。环形枪架：圆心在射击口正中，枪挂在环上跟着视线绕人转一整圈
  // （用户反馈：车上用步枪，换弹耽误太久）
  const carRing = new THREE.Object3D(), carMount = new THREE.Object3D();
  carRing.position.set(...RIDE_SPECS.car.gunRing); carMount.position.set(0, 0, RIDE_SPECS.car.gunReach);
  carRing.add(carMount); vehicles.car.body.add(carRing);
  const roofGun = createDoorGun(G, carMount, { label: 'M134 车顶机枪', post: 0.24, drop: 0.24, flash: 0.7 });
  const ringQ = new THREE.Quaternion(), ringD = new THREE.Vector3();
  const carSamples = sampleRoute(CAR_ROUTE), carLength = carSamples.at(-1).s;
  const roofY = elev(EXTRACTIONS.heli.floor), eye = J.PLAYER?.eye ?? 1.62;
  const FRESH = () => ({ phase: 'none', t: 0, rideT: 0, carS: 0, speed: 0, stopT: 0, endT: 0, rideKills: 0, spawnT: 0, textT: 0, released: false,
    vhp: 100, vhits: 0, warned: 0, smokeT: 0, pose: null, outT: 0, outCam: null, outLook: null, pose0: null, crashT: 0, crashStart: null, crashed: false, boom: false, dead: false, markT: 0, markSig: '' });
  const state = { mission: null, kills: 0, reinforce: 0, tell: 0, holdT: 0, inside: false, holdTextT: 0, bombT: 0, bombDone: false, boss: null, bossT: 0, ...FRESH() };
  const vhud = makeDurabilityHud();
  const from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  let models = [], roofSpots = null;
  const veh = () => state.mission && vehicles[state.mission.extraction.id];
  const riding = () => state.phase === 'board' || state.phase === 'ride' || state.phase === 'outro' || state.phase === 'end' || state.phase === 'crash';

  // 坐在载具里挨打少一些（直升机舱壁 + 距离，接应车有装甲挡板）
  const baseDamage = G.player?.damage?.bind(G.player);
  if (baseDamage) G.player.damage = (amount, ...rest) => baseDamage(riding() ? amount * (veh()?.kind === 'helicopter' ? 0.35 : 0.5) : amount, ...rest);

  const home = G.level?.playerStart; // 开局点（坐载具失败后从登机点重来时换掉，重新开局再换回来）

  /**
   * 登机点前的重生位置：载具门口往外 4.5 米（站在空地上就用它，不然就站在门口），面朝车门 / 舱门。
   * 离门口还差几步，不会一重生就自动登机，有时间先看一眼周围、捡点弹药。
   */
  function checkpointStart(x) { return boardingSpot(nav, vehicles[x.id], x, elev(x.floor)); }

  function roll() {
    for (const m of models) m.removeFromParent();
    // 坐直升机 / 接应车失败（坠毁或在车上阵亡）以后点「回到登机点重来」：同一局任务、目标都算完成，人站到登机点前
    if (state.phase === 'outro' && G.player) G.player.invulnerable = !!state.wasInv;
    letterbox?.(false);
    const keep = state.checkpoint && state.mission ? state.checkpoint : null;
    const mission = keep ? state.mission : rollMission(rng, sites, force);
    Object.assign(state, { mission, kills: keep ? state.kills : 0, reinforce: 0, tell: 0, holdT: keep ? state.holdT : 0, inside: false, holdTextT: 0, ...FRESH(),
      bombT: keep ? state.bombT : (mission.bomb?.time || 0), bombDone: false, boss: keep ? state.boss : null, bossT: 0,
      checkpoint: null, restore: !!keep });
    if (G.level) G.level.playerStart = keep ? checkpointStart(mission.extraction) : home;
    vhud.show(false); deadTitle(null, null); deadActions(false);
    if (G.player) G.player.mounted = false;
    doorGun.reset(); roofGun.reset();
    models = mission.objectives.map((o) => {
      const g = o.kind === 'relay' ? relayModel() : o.kind === 'bomb' ? bombModel() : itemModel();
      const y = o.site.y ?? elev(o.site.floor);
      g.position.set(o.site.x, y, o.site.z);
      root.add(g);
      o.object = g; o.pos = v({ ...o.site, y }); o.zone = o.site.floor;
      return g;
    });
    if (mission.hold) {
      const h = mission.hold, g = holdModel(h.radius), y = elev(h.floor);
      g.position.set(h.x, y, h.z); root.add(g); models.push(g);
      h.object = g; h.pos = v({ ...h, y });
    }
    if (mission.hvt) mission.hvt.pos = v({ ...mission.hvt, y: elev(mission.hvt.floor) });
    for (const vv of Object.values(vehicles)) vv.reset();
    const x = mission.extraction;
    Object.assign(G.level, {
      objectives: mission.objectives,
      extraction: { pos: v({ ...x, y: elev(x.floor) }), radius: x.radius, label: x.label, blocked: x.blocked },
      missionText: (c) => missionText(mission, c, state.kills, state.phase === 'ride' ? { kind: veh().kind, kills: state.rideKills, left: carLength - state.carS } : null, { t: state.holdT, inside: state.inside, bombT: state.bombT }),
      // 地上的路线箭头指向哪里（guide.js）：歼灭任务指向最近的敌人，坚守任务指向控制点（人在圈里时不画）
      guideTarget: () => guideTarget(),
      onExtract: () => board(),
      outroDelay: 1.6, keepLock: true,
    });
    Object.assign(J.RADIO, missionRadio(mission));
    return mission;
  }

  // 坐在载具上被打死（不是坠毁）也一样：可以回到登机点重来
  G.events.on('player:dead', () => {
    if ((state.phase === 'ride' || state.phase === 'board') && state.mission && !state.checkpoint) {
      state.checkpoint = { kind: veh()?.kind };
      deadTitle('撤离途中阵亡', '撤离失败'); deadActions(true);
    }
  });

  G.events.on('enemy:killed', (ev) => {
    if (G.game?.state !== 'playing') return;
    // 坐车时每击倒一人，下一个敌人推迟 2.2 秒才冲出来：清得快就真的能喘口气
    if (state.phase === 'ride') { state.rideKills++; if (veh()?.kind === 'car') state.spawnT = Math.max(state.spawnT, 2.2); G.game.refreshObjective?.(); return; }
    const m = state.mission;
    // 猎杀头目：倒下的是头目本人才算
    if (m?.type === 'hvt') { if (ev?.enemy && ev.enemy === state.boss && !G.game.run?.allCut) { G.hud?.message?.(`头目「${m.hvt.name}」已击毙`, 3); G.game.completeAll?.(); G.game.refreshObjective?.(); } return; }
    if (!m || m.type !== 'eliminate') return;
    state.kills++;
    if (state.kills >= m.kills) G.game.completeAll?.();
    G.game.refreshObjective?.();
  });

  /** 到了登机门：交给载具（原游戏这时不结算） */
  function board() {
    if (state.phase !== 'none') return;
    const vv = veh();
    state.phase = 'board'; state.t = 0;
    G.player.mounted = true;
    G.level.extraction = null; G.game?.refreshObjective?.();
    if (camera) { from.pos.copy(camera.position); from.quat.copy(camera.quaternion); }
    G.weapon?.setVisible?.(false);
    G.hud?.radio?.(vv.kind === 'helicopter' ? '上机！左舷机枪交给你，绕楼顶一圈，把冲上来的敌人全部清掉。' : '上车！从车顶射击口压制沿路的敌人，我们冲出去！', 4.5);
  }

  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const lookQuat = (eyeP, target) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eyeP, target, new THREE.Vector3(0, 1, 0)));
  /** 登机：0–1 秒走到门口（看着舱里），1–1.9 秒钻进去到位（直升机坐到机枪后面，接应车站到车顶射击口） */
  function boardingView(vv, t) {
    const sp = vv.spec, D = vv.toWorld(sp.doorOut), I = vv.toWorld(sp.doorIn), seat = vv.seatPose(0, 0);
    if (t < 1) return { position: from.pos.clone().lerp(D, smooth(t)), quaternion: from.quat.clone().slerp(lookQuat(D, I.clone().lerp(seat.position, 0.5)), smooth(t * 1.3)) };
    const k = smooth((t - 1) / 0.9), a = D.clone().lerp(I, k), b = I.clone().lerp(seat.position, k), position = a.lerp(b, k);
    position.y += Math.sin(k * Math.PI) * -0.12;
    return { position, quaternion: lookQuat(D, I.clone().lerp(seat.position, 0.5)).slerp(seat.quaternion, k) };
  }

  /** 玩家每帧被摆到座位上（脚底 = 眼睛 − 眼高），原游戏照常算视角和开枪 */
  function pin(vv) {
    const e = vv.toWorld(vv.spec.seat);
    G.player.pos.set(e.x, e.y - eye, e.z);
    G.player.vel?.set?.(0, 0, 0);
  }

  /** 玩家更新之前：推进载具，摆好玩家 */
  function prePlayer(dt) {
    const vv = veh();
    if (!vv || !riding()) return;
    if (state.phase === 'ride') {
      if (vv.kind === 'helicopter') {
        state.rideT += dt;
        vv.setPose(state.pose = heliPoseAt(state.rideT, roofY), Math.sin(state.rideT * 7) * 0.025);
        if (state.rideT >= heliDuration() - CUT.heliLead) startOutro(vv);
      } else {
        state.speed = state.carS >= carLength - 0.05 ? 0 : carSpeedAt(carSamples, state.carS);
        state.carS = Math.min(carLength, state.carS + state.speed * dt);
        vv.setPose(state.pose = carPoseAt(carSamples, state.carS), Math.sin(state.carS * 2.1) * 0.012 * Math.min(1, state.speed / 6));
        if (state.carS >= carLength - 0.05 && (state.stopT += dt) > CUT.carStop) startOutro(vv);
      }
    } else if (state.phase === 'outro') {
      // 车外 / 机外镜头：载具自己开走（直升机接着飞「离开」那一段，接应车从停下的地方加速开走）
      state.outT += dt;
      if (vv.kind === 'helicopter') {
        state.rideT += dt;
        vv.setPose(state.pose = heliPoseAt(state.rideT, roofY), Math.sin(state.rideT * 7) * 0.025);
      } else {
        const o = carOutroPose(state.pose0, state.outT);
        state.speed = o.speed; vv.setPose(state.pose = o.pose, Math.sin(state.outT * 9) * 0.008);
      }
      if (state.outT >= CUT.outro[vv.kind]) finishRide();
    } else if (state.phase === 'crash') {
      state.crashT += dt;
      const C = HELI_ORBIT.center, s0 = state.crashStart;
      const ground = vv.kind === 'helicopter' ? (Math.hypot(s0.x - C.x, s0.z - C.z) < 80 ? roofY : 0) : s0.y;
      const p = crashPose(vv.kind, s0, state.crashT, ground);
      vv.setPose(p, 0);
      if (p.landed && !state.boom) boom(vv, 1);
    }
    pin(vv);
  }

  // ---- 载具耐久：敌人的子弹擦过机身 / 车身就掉，打光了坠毁 ----
  G.events.on('enemy:fire', (e) => {
    const vv = veh();
    if (state.phase !== 'ride' || !vv || !e?.pos || !e?.dir || G.game?.state !== 'playing') return;
    const c = vv.toWorld(VEHICLE_HP.center[vv.kind]);
    if (rayMiss(e.pos, e.dir, c) > VEHICLE_HP.radius[vv.kind]) return;
    state.vhits++;
    state.vhp = Math.max(0, state.vhp - VEHICLE_HP.damage[vv.kind]);
    vhud.hit();
    // 弹着点：朝射手那一侧的机身表面冒火花
    const back = new THREE.Vector3(e.pos.x - c.x, e.pos.y - c.y, e.pos.z - c.z).normalize();
    G.fx?.sparks?.(c.clone().addScaledVector(back, VEHICLE_HP.radius[vv.kind] * 0.55), back, 4);
    if (state.warned < VEHICLE_HP.warn.length && state.vhp < VEHICLE_HP.warn[state.warned]) {
      G.hud?.radio?.(state.warned === 0 ? (vv.kind === 'helicopter' ? '机体中弹！把朝我们开火的敌人清掉！' : '车被打得很惨，先打开火的那几个！') : (vv.kind === 'helicopter' ? '机体严重受损，快撑不住了！' : '发动机冒烟了，撑不了多久！'), 3.5);
      state.warned++;
    }
    if (state.vhp <= 0) crash(vv);
  });

  /** 阵亡页的两行标题（「特勤队员倒下 / 通讯中断」，cover.js 写的）：载具坠毁时改成「…被击落 / 撤离失败」，下一局恢复。
   * 原文只在第一次改写时记下（这时封面的话术已经换好了），恢复时没记过就不动。 */
  function deadTitle(kicker, head) {
    const sec = typeof document !== 'undefined' && document.querySelector('[data-s="dead"]');
    if (!sec) return;
    for (const [el, text] of [[sec.querySelector('.m-k'), kicker], [sec.querySelector('.m-h'), head]]) {
      if (!el) continue;
      if (text != null) { if (el.dataset.orig == null) el.dataset.orig = el.textContent; el.textContent = text; }
      else if (el.dataset.orig != null) el.textContent = el.dataset.orig;
    }
  }

  /**
   * 阵亡页的按钮：坐载具失败时，「重新出击」改成「回到登机点重来」（原游戏的 retry：整局重置，我们在 roll 里接住，
   * 保留这一局任务、直接站到登机点前），旁边多一个「换一项任务重来」（原游戏的 redeploy，点它先把存档点清掉）。
   */
  function deadActions(on) {
    const sec = typeof document !== 'undefined' && document.querySelector('[data-s="dead"]');
    const retry = sec?.querySelector('[data-act="retry"]');
    if (!retry) return;
    if (retry.dataset.orig == null) retry.dataset.orig = retry.textContent;
    retry.textContent = on ? '回到登机点重来' : retry.dataset.orig;
    let fresh = sec.querySelector('[data-zh="fresh"]');
    if (!fresh && on) {
      fresh = document.createElement('button');
      fresh.className = 'btn'; fresh.dataset.act = 'redeploy'; fresh.dataset.zh = 'fresh'; fresh.textContent = '换一项任务重来';
      fresh.addEventListener('click', () => { state.checkpoint = null; }); // 先于菜单根节点上的委托处理
      retry.after(fresh);
    }
    if (fresh) fresh.hidden = !on;
    const line = sec.querySelector('[data-zh="ckpt"]') || (on ? sec.querySelector('.m-stats')?.insertAdjacentElement('afterend', Object.assign(document.createElement('p'), { className: 'm-line' })) : null);
    if (line) { line.dataset.zh = 'ckpt'; line.textContent = on ? '任务目标已经完成，重来时直接回到登机点前，不用再打一遍。' : ''; line.hidden = !on; }
  }

  function boom(vv, size) {
    state.boom = true;
    const at = vv.toWorld(VEHICLE_HP.engine[vv.kind]);
    G.fx?.explosion?.(at, size * (vv.kind === 'helicopter' ? 3 : 2.4));
    G.render?.lightPool?.flash?.(at, 0xff8030, 80, 18, 0.35);
    G.player?.addShake?.(0.6);
  }

  /** 耐久打光：直升机尾桨被打断、打转下坠砸到楼顶；接应车失控侧翻。动画放完黑场、阵亡（撤离失败） */
  function crash(vv) {
    if (state.phase !== 'ride') return;
    state.phase = 'crash'; state.crashT = 0; state.boom = false; state.crashStart = { ...(state.pose || { x: vv.root.position.x, y: vv.root.position.y, z: vv.root.position.z, yaw: vv.root.rotation.y, pitch: 0, roll: 0 }) };
    doorGun.update(0, { active: false }); roofGun.update(0, { active: false });
    G.weapon?.setVisible?.(false);
    G.fx?.explosion?.(vv.toWorld(VEHICLE_HP.engine[vv.kind]), 1.4);
    G.player?.addShake?.(0.5);
    G.hud?.clearRadio?.();
    G.hud?.radio?.(vv.kind === 'helicopter' ? '尾桨被打断了！要坠机了！' : '车失控了！', 3);
    G.hud?.message?.('撤离失败 · ' + (vv.kind === 'helicopter' ? '直升机被击落' : '接应车被击毁'), 4);
  }

  function startRide(vv) {
    state.phase = 'ride'; state.rideT = 0; state.carS = 0; state.rideKills = 0; state.spawnT = 1;
    // 视角接上座位朝向（直升机朝舱门外，车上朝前）
    const q = vv.seatPose(0, 0).quaternion, d = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    G.player.yaw = Math.atan2(-d.x, -d.z); G.player.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    if (vv.kind === 'helicopter') G.player.pitch = -0.42; // 坐好先往下看楼顶
    G.weapon?.setVisible?.(false); // 两种载具都用车载机枪，步枪收起来
    // 原游戏的追兵波次停掉，地图别处的敌人收掉，敌人池（18 人）留给沿路 / 楼顶刷出来的
    const run = G.game?.run;
    if (run) { run.pursuitLeft = 0; run.pursuitT = 0; if (run.queue) run.queue.length = 0; run.waveHot = 0; }
    cull(vv, true);
    G.game?.refreshObjective?.();
  }
  /** 收掉和这段乘坐无关的敌人：直升机只留一期屋顶上的，接应车只留离车 110 米以内、没被甩在后面 45 米的 */
  function cull(vv, all = false) {
    const C = HELI_ORBIT.center, car = vv.kind === 'car' ? carPoseAt(carSamples, state.carS) : null;
    for (const e of alive()) {
      const keep = car ? Math.hypot(e.pos.x - car.x, e.pos.z - car.z) < 110 && (e.pos.x - car.x) * car.dir.x + (e.pos.z - car.z) * car.dir.z > -45 && !all
        : Math.abs(e.pos.y - roofY) < 4 && Math.hypot(e.pos.x - C.x, e.pos.z - C.z) < 95;
      if (!keep) e._deactivate?.();
    }
  }

  /** 最后一段打完：镜头切到机外 / 车外，看着载具离开（cutscene.js），放完再结算 */
  function startOutro(vv) {
    if (state.phase !== 'ride') return;
    state.phase = 'outro'; state.outT = 0;
    doorGun.update(0, { active: false }); roofGun.update(0, { active: false });
    state.pose0 = { ...(state.pose || { x: vv.root.position.x, y: vv.root.position.y, z: vv.root.position.z, yaw: vv.root.rotation.y, pitch: 0, roll: 0, dir: { x: 0, z: -1 } }) };
    const t0 = state.rideT;
    state.outCam = outroCamera(vv.kind, state.pose0, { poseAt: (d) => heliPoseAt(t0 + d, roofY), away: HELI_ORBIT.center });
    state.outLook = vv.toWorld(VEHICLE_HP.center[vv.kind]);
    state.wasInv = !!G.player.invulnerable; G.player.invulnerable = true;
    G.hud?.clearRadio?.(); G.hud?.show?.(false);
    letterbox?.(true, `<b>撤离成功</b>${vv.kind === 'helicopter' ? '直升机已离开云澜汇上空' : '接应车已驶离云澜汇'}`);
  }

  function finishRide() {
    if (state.phase !== 'ride' && state.phase !== 'outro') return;
    if (state.phase === 'outro') { G.player.invulnerable = !!state.wasInv; letterbox?.(false); }
    state.phase = 'end'; state.endT = 0;
    doorGun.update(0, { active: false }); roofGun.update(0, { active: false });
    G.game?.finish?.();
  }

  /** 直升机：楼顶上能刷兵的点（离楼梯口近的优先，像是从楼下冲上来的） */
  function roofSpawns() {
    if (roofSpots) return roofSpots;
    const C = HELI_ORBIT.center, R = Math.hypot(HELI_ORBIT.pad.x - C.x, HELI_ORBIT.pad.z - C.z) + 22;
    const rf = layout.levels.find((l) => l.id === EXTRACTIONS.heli.floor);
    const stairs = (rf?.rooms || []).filter((r) => r.type === 'stair').flatMap((r) => r.polys || []).map((P) => [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length]);
    const all = (G.level.enemySpawns || []).filter((s) => s.type === 'ground' && Math.abs(s.pos.y - roofY) < 1.5 && Math.hypot(s.pos.x - C.x, s.pos.z - C.z) < R
      && Math.hypot(s.pos.x - HELI_ORBIT.pad.x, s.pos.z - HELI_ORBIT.pad.z) > 10);
    const near = all.filter((s) => stairs.some(([x, z]) => Math.hypot(s.pos.x - x, s.pos.z - z) < 12));
    roofSpots = { all, near };
    return roofSpots;
  }
  const alive = () => G.enemies?.list?.filter((e) => e.alive) || [];
  const roofEnemies = () => alive().filter((e) => Math.abs(e.pos.y - roofY) < 4 && Math.hypot(e.pos.x - HELI_ORBIT.center.x, e.pos.z - HELI_ORBIT.center.z) < 100);
  /** HUD 标记：坐直升机时楼顶上每个敌人一个红点（位置直接引用敌人坐标，跟着走） */
  function markers() {
    const m = state.mission;
    if (state.phase === 'none' && m && !G.game?.run?.allCut && (m.type === 'eliminate' || m.type === 'hold')) {
      // 歼灭 / 坚守：每个敌人一个红点，带距离；坚守再加控制点
      const list = alive().map((e) => ({ id: `hunt-${G.enemies.list.indexOf(e)}`, short: '', label: '敌人', pos: e.pos, kind: 'hunt' }));
      if (m.hold) list.push({ id: 'hold', short: '守', label: `${m.hold.where}控制点`, pos: m.hold.pos.clone().setY(m.hold.pos.y + 1), kind: 'relay' });
      return list;
    }
    // 猎杀头目：头目头顶一个红点（带距离）
    if (state.phase === 'none' && m?.type === 'hvt' && !G.game?.run?.allCut && state.boss?.alive) return [{ id: 'boss', short: '首', label: `头目「${m.hvt.name}」`, pos: state.boss.pos.clone().setY(state.boss.pos.y + 2.1), kind: 'hunt' }];
    if (state.phase !== 'ride') return [];
    return (veh()?.kind === 'helicopter' ? roofEnemies() : alive()).map((e) => ({ id: `tgt-${G.enemies.list.indexOf(e)}`, short: '', label: '敌人', pos: e.pos, kind: 'enemy' }));
  }
  function spawnAt(pos) { try { G.enemies.spawn('soldier', pos, { state: 'alert', target: G.player.pos }); return true; } catch { return false; } }

  /** 坐车 / 坐直升机时刷兵：楼顶源源不断涌上来；车前方 28–63 米、路两侧 6–14 米冲出来，被甩在后面 45 米的收掉 */
  function rideSpawns(dt, vv) {
    state.spawnT -= dt;
    if (vv.kind === 'helicopter') {
      if (state.spawnT > 0) return;
      state.spawnT = 0.9;
      cull(vv);
      const C = HELI_ORBIT.center, onRoof = alive().filter((e) => Math.abs(e.pos.y - roofY) < 3 && Math.hypot(e.pos.x - C.x, e.pos.z - C.z) < 90).length;
      if (onRoof >= 10) return;
      const { all, near } = roofSpawns(), list = near.length && rng() < 0.7 ? near : all;
      if (list.length) spawnAt(list[Math.floor(rng() * list.length)].pos.clone());
      return;
    }
    const car = carPoseAt(carSamples, state.carS);
    cull(vv);
    if (state.spawnT > 0 || car.y < -0.5 || state.carS < 45 || state.carS > carLength - 25) return;
    state.spawnT = 1.6;
    if (alive().length >= 6) return; // 上限 6 人：清得快压力就小，放着不打就一直挨揍
    for (let k = 0; k < 6; k++) {
      const p = carPoseAt(carSamples, Math.min(carLength - 10, state.carS + 28 + rng() * 35)), side = rng() < 0.5 ? 1 : -1, off = 6 + rng() * 8;
      const x = p.x + p.dir.z * off * side, z = p.z - p.dir.x * off * side, st = landAt(nav, x, z, 0.6);
      if (st && Math.abs(st.y) < 1.5 && clear(nav, st)) { spawnAt(new THREE.Vector3(st.x, st.y, st.z)); break; }
    }
  }

  /** 敌人刷在哪：离 at 有 near–far 米、同一层（高差 < 1.5 米）优先，其次高差 6 米以内，再不行就 25–90 米内任何一处 */
  function nearSpawn(at, near = HUNT.near, far = HUNT.far) {
    const all = (G.level.enemySpawns || []).filter((s) => s.type === 'ground');
    const ring = (lo, hi, dy) => all.filter((s) => { const d = Math.hypot(s.pos.x - at.x, s.pos.z - at.z); return d > lo && d < hi && Math.abs(s.pos.y - at.y) < dy; });
    for (const list of [ring(near, far, 1.5), ring(near, far + 15, 6), ring(25, 90, 14)]) if (list.length) return list[Math.floor(rng() * list.length)].pos.clone();
    return null;
  }

  /** 歼灭 / 坚守：增援就近刷，并且每隔几秒把玩家的位置告诉没在交火的敌人，让他们自己找过来 */
  function reinforce(dt) {
    const m = state.mission;
    if (!m || (m.type !== 'eliminate' && m.type !== 'hold' && m.type !== 'hvt') || G.game?.state !== 'playing' || G.game.run?.allCut || state.phase !== 'none') return;
    // 猎杀头目：靠近到 45 米以内才开始来增援
    if (m.type === 'hvt' && !(state.boss?.alive && state.boss.pos.distanceTo(G.player.pos) < 45)) return;
    // 增援上限跟着「性能微调 · 同时在场的敌人」缩（少 = 8/14）
    const cap = Math.max(3, Math.round((m.type === 'hold' ? HOLD.alive : HUNT.alive) * (G.tuning?.enemyScale?.() ?? 1))), every = m.type === 'hold' ? HOLD.every : HUNT.every;
    // 坚守：没走到控制点之前不刷（先让人走过去），到过以后一直刷
    if (m.type === 'hold' && state.holdT <= 0 && !state.inside) return;
    state.reinforce -= dt;
    if (state.reinforce <= 0) {
      state.reinforce = every;
      if (alive().length < cap) { const p = nearSpawn(m.hold ? m.hold.pos : G.player.pos); if (p) spawnAt(p); }
    }
    if ((state.tell -= dt) <= 0) {
      state.tell = HUNT.tell;
      for (const e of alive()) if (e.mode !== 'engage' && e.lastKnown) { e.lastKnown.copy(G.player.pos); if (e.mode === 'patrol' || e.mode === 'search') e.mode = 'investigate'; e.modeT = Math.max(e.modeT || 0, 10); }
    }
  }

  /** 坚守：站在圈里计时；守够了就算完成 */
  function holdTick(dt) {
    const m = state.mission;
    if (m?.type !== 'hold' || G.game?.state !== 'playing' || G.game.run?.allCut || state.phase !== 'none') return;
    const h = m.hold, p = G.player.pos;
    const inside = G.player.alive !== false && Math.hypot(p.x - h.pos.x, p.z - h.pos.z) <= h.radius && Math.abs(p.y - h.pos.y) < 2;
    if (inside !== state.inside) {
      state.inside = inside; h.object?.userData.setState?.(inside ? 'in' : 'out');
      if (!inside && state.holdT > 0) G.hud?.warn?.('离开了控制点，计时暂停', 2);
      G.game?.refreshObjective?.();
    }
    if (inside) {
      const before = Math.floor(state.holdT);
      state.holdT += dt;
      if (before === 0 && state.holdT >= 0.05 && state.holdT - dt < 0.05) G.hud?.radio?.('控制点已占领，守住！敌人马上就到。', 3.5);
      if (Math.floor(state.holdT) !== before) G.game?.refreshObjective?.();
      if (state.holdT >= h.need) { h.object?.userData.setState?.('cut'); G.game.completeAll?.(); G.game?.refreshObjective?.(); }
    }
  }

  // 拆弹的计时牌：指南针下面一块红色的「炸弹 05:28」，最后一分钟变大、闪
  let clockEl = null;
  function paintClock(show) {
    if (typeof document === 'undefined') return;
    if (!clockEl) { const hud = document.querySelector('#ui .hud') || document.getElementById('ui'); if (!hud) return; clockEl = document.createElement('div'); clockEl.className = 'jm-bomb-clock'; clockEl.hidden = true; hud.appendChild(clockEl); }
    clockEl.hidden = !show;
    if (show) { clockEl.textContent = `炸弹 ${bombClock(state.bombT)}`; clockEl.classList.toggle('hurry', state.bombT <= BOMB.hurry); }
  }
  /** 拆弹：倒计时；到点没拆完，剩下的炸弹一起炸，行动失败 */
  function bombTick(dt) {
    const m = state.mission, run = G.game?.run;
    if (m?.type !== 'bomb' || G.game?.state !== 'playing' || !run || run.allCut || state.phase !== 'none' || state.bombDone) { if (clockEl && !clockEl.hidden) paintClock(false); return; }
    if (clockEl?.hidden !== false) paintClock(true);
    const before = Math.ceil(state.bombT);
    state.bombT -= dt;
    const now = Math.ceil(state.bombT);
    if (now !== before) {
      paintClock(true);
      if (now === BOMB.hurry) G.hud?.radio?.('还剩一分钟！没拆完的那颗，跑过去！', 3.5);
      if (now === 20) G.hud?.radio?.('二十秒！', 2);
      if (now <= 10 && now > 0) G.audio?.play?.('ui_click', { gain: 1, pitch: 1.6 });
      // 越到后面闪得越急
      const rate = now > BOMB.hurry ? 2 : now > 20 ? 4 : 8;
      for (const o of m.objectives) o.object?.userData.setRate?.(rate);
    }
    if (state.bombT > 0) return;
    state.bombDone = true;
    for (const r of run.relays || []) if (!r.cut && r.o?.pos) { G.fx?.explosion?.(r.o.pos, 3); G.audio?.play?.('explosion', { pos: r.o.pos, gain: 1 }); r.o.object && (r.o.object.visible = false); }
    G.player.addShake?.(1.2);
    deadTitle('炸弹爆炸', '行动失败');
    if (!G.player.invulnerable) G.player.damage(9999);
  }

  /** 猎杀头目：开打以后把头目和护卫摆到地点上（敌人池满了就过一会儿再试） */
  function bossTick(dt) {
    const m = state.mission;
    if (m?.type !== 'hvt' || state.boss || G.game?.state !== 'playing' || G.game.run?.allCut || state.phase !== 'none') return;
    if ((state.bossT -= dt) > 0) return;
    state.bossT = 1;
    const at = m.hvt.pos;
    let boss = null;
    try { boss = G.enemies.spawn('soldier', at.clone(), { role: 'boss', state: 'patrol' }); } catch { boss = null; }
    if (!boss) return;
    state.boss = boss;
    for (let i = 0; i < HVT.guards; i++) {
      const a = (i / HVT.guards) * Math.PI * 2 + 0.5, x = at.x + Math.cos(a) * HVT.ring, z = at.z + Math.sin(a) * HVT.ring, st = landAt(nav, x, z, at.y + 0.6);
      if (st && Math.abs(st.y - at.y) < 0.6 && clear(nav, st)) { try { G.enemies.spawn('soldier', new THREE.Vector3(st.x, st.y, st.z), { role: i ? 'regular' : 'heavy', state: 'patrol' }); } catch { /* 池子满了就少一个护卫 */ } }
    }
  }

  /** 地上箭头的目标（guide.js 用）：返回 undefined 时照原来的规则（物品、中继、撤离点） */
  function guideTarget() {
    const m = state.mission;
    if (!m || G.game?.run?.allCut || state.phase !== 'none') return undefined;
    if (m.type === 'hold') {
      if (state.inside) return null;
      return { key: 'hold', name: '控制点', floor: m.hold.floor, x: m.hold.pos.x, y: m.hold.pos.y, z: m.hold.pos.z, door: null };
    }
    if (m.type === 'hvt') {
      const at = state.boss?.alive ? state.boss.pos : m.hvt.pos, st = (state.boss?.alive && G.physics?.stateOf?.(state.boss.pos)) || landAt(nav, at.x, at.z, at.y + 0.6);
      return st ? { key: `boss-${Math.round(at.x / 8)}-${Math.round(at.z / 8)}-${st.floor}`, name: `头目「${m.hvt.name}」`, floor: st.floor, x: at.x, y: at.y, z: at.z, door: null } : null;
    }
    if (m.type !== 'eliminate') return undefined;
    const p = G.player.pos;
    let best = null, bd = Infinity;
    for (const e of alive()) { const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) + Math.abs(e.pos.y - p.y) * 4; if (d < bd) { bd = d; best = e; } }
    if (!best) return null;
    const st = G.physics?.stateOf?.(best.pos) || landAt(nav, best.pos.x, best.pos.z, best.pos.y + 0.6);
    if (!st) return null;
    // 敌人在动：key 里带上他所在的 8 米格子，走远了路线会重算
    return { key: `hunt-${G.enemies.list.indexOf(best)}-${Math.round(best.pos.x / 8)}-${Math.round(best.pos.z / 8)}-${st.floor}`, name: '最近的敌人', floor: st.floor, x: best.pos.x, y: best.pos.y, z: best.pos.z, door: null };
  }

  /** 从登机点重来：原游戏重置完（目标全部变回没完成）以后，把目标标成完成、进入撤离阶段 */
  function restoreCheckpoint() {
    const run = G.game?.run, st = G.game?.state;
    if (!state.restore || !run || (st !== 'intro' && st !== 'playing')) return;
    state.restore = false;
    for (const r of run.relays || []) { r.cut = true; r.cutting = false; r.t = 1; r.o?.object?.userData?.setState?.('cut'); }
    run.cut = (run.relays || []).length;
    state.mission.hold?.object?.userData?.setState?.('cut');
    G.game.completeAll?.();
    G.hud?.radio?.(`回到登机点了。${state.mission.extraction.label}已经重新就位，这次稳住。`, 4);
    G.game.refreshObjective?.();
  }

  function update(dt) {
    restoreCheckpoint();
    for (const m of models) m.userData.update?.(dt);
    holdTick(dt);
    bombTick(dt);
    bossTick(dt);
    reinforce(dt);
    const vv = veh();
    if (!vv) return null;
    for (const other of Object.values(vehicles)) if (other !== vv) other.update(dt);
    vv.update(dt, { ready: G.game?.run?.allCut, board: state.phase === 'board' ? state.t : state.phase === 'none' ? -1 : 9, speed: state.speed });
    const heliGun = vv.kind === 'helicopter' && state.phase === 'ride' && G.game?.state === 'playing';
    // 舱门机枪的辅助瞄准目标：楼顶上活着的敌人（瞄胸口）；HUD 上给它们标红点
    const targets = heliGun ? roofEnemies().map((e) => (e._aim ||= new THREE.Vector3()).set(e.pos.x, e.pos.y + 1.15, e.pos.z)) : null;
    doorGun.update(dt, { active: heliGun, firing: heliGun && !!(G.input?.down?.('fire') || G.input?.fire), camera, targets });
    // 车顶机枪：先把环形枪架转到视线方向（枪始终在人前面），再按舱门机枪同一套开火、过热、辅助瞄准；目标是车周围所有敌人
    const carGun = vv.kind === 'car' && state.phase === 'ride' && G.game?.state === 'playing';
    if (carGun) {
      vehicles.car.body.getWorldQuaternion(ringQ).invert();
      camera.getWorldDirection(ringD).applyQuaternion(ringQ);
      carRing.rotation.y = Math.atan2(ringD.x, ringD.z);
    }
    roofGun.update(dt, { active: carGun, firing: carGun && !!(G.input?.down?.('fire') || G.input?.fire), camera,
      targets: carGun ? alive().map((e) => (e._aim ||= new THREE.Vector3()).set(e.pos.x, e.pos.y + 1.15, e.pos.z)) : null });
    if ((state.markT -= dt) <= 0) {
      state.markT = 0.3;
      const hunt = state.phase === 'none' && !G.game?.run?.allCut && (state.mission?.type === 'eliminate' || state.mission?.type === 'hold');
      const sig = heliGun ? roofEnemies().map((e) => G.enemies.list.indexOf(e)).join(',') : carGun || hunt ? alive().map((e) => G.enemies.list.indexOf(e)).join(',') : '';
      if (sig !== state.markSig) { state.markSig = sig; G.game?.refreshObjective?.(); }
    }
    if (state.phase === 'board') {
      state.t += dt;
      if (state.t >= BOARD_TIME) { startRide(vv); return null; }
      return { ...(state.t < 1.9 ? boardingView(vv, state.t) : vv.seatPose(0, 0)), fade: 0 };
    }
    // 耐久条、受损冒烟起火
    vhud.show(state.phase === 'ride' || state.phase === 'crash', vv.kind === 'helicopter' ? '机体耐久' : '车辆耐久');
    vhud.set(state.vhp, dt);
    if (state.phase === 'ride' || state.phase === 'crash') {
      state.smokeT -= dt;
      const burning = state.phase === 'crash' || state.vhp < VEHICLE_HP.fire;
      if ((state.vhp < VEHICLE_HP.smoke || state.phase === 'crash') && state.smokeT <= 0) {
        state.smokeT = state.phase === 'crash' ? 0.05 : burning ? 0.09 : 0.16;
        const at = vv.toWorld(VEHICLE_HP.engine[vv.kind]);
        G.fx?.smoke?.(at, { size: state.phase === 'crash' ? 1.6 : 0.9, life: 2.4, color: 0x262626, rise: 1.4 });
        if (burning) G.fx?.smoke?.(at, { size: 0.7, life: 0.5, color: 0xff6a1e, rise: 2.2 });
      }
    }
    if (state.phase === 'crash') {
      const dur = VEHICLE_HP.crash[vv.kind];
      if (state.crashT > dur && !state.dead) {
        // 黑场后阵亡：原游戏的阵亡页（重新出击会重抽任务）
        state.dead = true;
        state.checkpoint = { kind: vv.kind };
        deadTitle(vv.kind === 'helicopter' ? '直升机被击落' : '接应车被击毁', '撤离失败');
        deadActions(true);
        G.player.invulnerable = false;
        G.player.damage?.(9999, null);
      }
      return { fade: Math.min(0.92, smooth((state.crashT - (dur - 1)) / 1)) };
    }
    if (state.phase === 'ride') {
      if (G.game?.state === 'playing') rideSpawns(dt, vv);
      if (vv.kind === 'car' && (state.textT -= dt) <= 0) { state.textT = 0.5; G.game?.refreshObjective?.(); }
      return null;
    }
    if (state.phase === 'outro') {
      // 机位不动，转头跟着载具（跟得稍微慢半拍，像真有人在摇镜头）
      const target = vv.toWorld(VEHICLE_HP.center[vv.kind]);
      state.outLook.lerp(target, 1 - Math.exp(-dt * 7));
      return { position: state.outCam.clone(), lookAt: state.outLook.clone(), fade: outroFade(vv.kind, state.outT) };
    }
    if (state.phase === 'end') {
      state.endT += dt;
      if (state.endT > 1 && !state.released) { state.released = true; if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock?.(); }
      if (state.outCam) return { position: state.outCam.clone(), lookAt: state.outLook.clone(), fade: 0.9 }; // 机外镜头留在原地，别跳回座位
      return { ...vv.seatPose(0, 0), position: camera ? camera.position.clone() : vv.seatPose(0, 0).position, quaternion: camera ? camera.quaternion.clone() : vv.seatPose(0, 0).quaternion, fade: 0.85 };
    }
    return null;
  }

  return { roll, prePlayer, update, markers, state, sites, vehicles, root, doorGun, roofGun, checkpointStart,
    /** 步枪停用：登车、乘坐（直升机舱门机枪 / 装甲车车顶机枪）、结算、坠毁 */
    get gunActive() { return state.phase === 'board' || state.phase === 'end' || state.phase === 'crash' || state.phase === 'ride' || state.phase === 'outro'; },
    get riding() { return riding(); },
    get rideKind() { return riding() ? veh()?.kind === 'helicopter' ? 'helicopter' : 'car' : null; },
    dispose() { root.removeFromParent(); for (const vv of Object.values(vehicles)) vv.dispose(); doorGun.dispose(); roofGun.dispose(); vhud.remove(); } };
}
