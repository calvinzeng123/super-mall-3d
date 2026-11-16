// 「零点突围」的随机任务（地图是园区探索的那张：一期商场、酒店、公寓、地铁）。
// 每局开始（含重开）抽一种任务和一种撤离方式：
//   切断中继   商场西翼、酒店二楼、地下大厅三处上行中继，按住交互切断；
//   歼灭       歼灭一定数量的武装劫持者（敌人会持续增援）；
//   取物·住户  去公寓住户家里和商场商铺里各取回一件物品；
//   取物·酒店  去酒店两间客房取回情报箱。
// 撤离：一期商场屋顶的直升机，或公寓地下车库的装甲接应车。
// 原游戏的任务流程（按住交互、波次增援、撤离判定、结算）不变；这里给它提供关卡数据（目标、文字、撤离点）、
// 装置和载具模型，并负责歼灭任务的计数和增援。原游戏那边的接口见 scripts/jimao/patches.mjs 里「随机任务」几条。
import * as THREE from 'three';
import { landAt, clear } from '../layout/nav.js';
import { toW } from '../layout/geom.js';
import { createRideVehicle, rideLocalToWorld, RIDE_SPECS, BOARD_TIME } from './ride-vehicles.js';
import { CAR_ROUTE, sampleRoute, carPoseAt, carSpeedAt, HELI_ORBIT, heliPoseAt, heliDuration } from './ride-paths.js';
import { createDoorGun } from './door-gun.js';
import { VEHICLE_HP, rayMiss, crashPose, makeDurabilityHud } from './vehicle-damage.js';

export const MISSION_TYPES = Object.freeze(['relay', 'eliminate', 'rooms', 'hotel']);
export const ELIMINATE_TARGET = 14;
const HOTEL_Z = -81.1533717;

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

/**
 * 抽一局任务。rng 返回 [0, 1)。返回 { type, title, objectives: [{ id, label, verb, kind, site }], extraction, kills }
 */
export function rollMission(rng, sites, { type, exit } = {}) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  type ||= pick(MISSION_TYPES);
  const extraction = EXTRACTIONS[exit || (rng() < 0.5 ? 'heli' : 'car')];
  let objectives = [], title;
  if (type === 'relay') {
    title = '切断上行中继';
    objectives = RELAY_SITES.map((s, i) => ({ id: `relay_${'abc'[i]}`, label: `${'甲乙丙'[i]}号中继 · ${s.where}`, verb: '切断中继', kind: 'relay', site: s }));
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
  } else {
    title = '歼灭武装劫持者';
  }
  return { type, title, objectives, extraction, kills: type === 'eliminate' ? ELIMINATE_TARGET : 0 };
}

/** 这一局的目标文字（任务栏）。c 是原游戏的进度对象 { cut, allCut, relays } */
export function missionText(m, c, kills = 0, ride = null) {
  const x = m.extraction;
  if (ride?.kind === 'helicopter') return `清扫楼顶 · 击倒 ${ride.kills}`;
  if (ride?.kind === 'car') return `突围 · 剩 ${Math.max(0, Math.round(ride.left))} 米 · 击倒 ${ride.kills}`;
  if (c.allCut) return `撤离 · ${x.where}${x.label}`;
  if (m.type === 'eliminate') return `歼灭武装劫持者 ${Math.min(kills, m.kills)}/${m.kills}`;
  const left = c.relays.length - c.cut;
  if (m.type === 'relay') return c.cut === 0 ? '切断三处上行中继' : left === 1 ? '切断最后一处中继' : `切断剩余 ${left} 处中继`;
  return c.cut === 0 ? `取回 ${c.relays.length} 件目标物品` : `还剩 ${left} 件物品`;
}

/** 这一局的无线电台词（原游戏的台词表 RADIO 每局按任务改写） */
export function missionRadio(m) {
  const x = m.extraction, done = `${x.label}在${x.where}，快撤！`;
  const intro = {
    relay: '特勤组，云澜汇的通信被劫持了。切断商场西翼、酒店二楼、地下大厅三处上行中继。',
    eliminate: `特勤组，武装劫持者占领了云澜汇。歼灭 ${m.kills} 名武装分子，夺回控制权。`,
    rooms: `特勤组，劫持者把赃物藏在了${m.objectives.map((o) => o.label.split(' · ')[1]).join('和')}。取回来。`,
    hotel: `特勤组，酒店里有两箱被劫走的情报：${m.objectives.map((o) => o.label.split(' · ')[1]).join('、')}。取回来。`,
  }[m.type];
  const step = m.type === 'relay' ? ['第一处中继已断开。敌人察觉了，正在赶来。', '第二处中继已断开。敌人全力围攻，小心应对。']
    : m.type === 'eliminate' ? ['干得好，继续清剿。', '敌人还在增援，坚持住。'] : ['第一件已到手。敌人察觉了，正在赶来。', '第二件到手。'];
  return {
    intro: `${intro}完成后乘${x.label}撤离。`,
    contact: '你已被发现！武装劫持者正在包围你。',
    cut: step,
    all: `${m.type === 'relay' ? '三处中继全部断开！' : m.type === 'eliminate' ? '目标区域已肃清！' : '物品全部到手！'}${done}`,
    low: '伤势严重！找掩体躲避，稍作恢复。',
    done: '特勤组已安全撤离，云澜汇恢复控制。干得漂亮！',
  };
}

/**
 * 接到游戏上：G 是原游戏的共享上下文，nav 是导航网格，camera 是主相机。
 * 返回 { roll(), prePlayer(dt), update(dt), gunActive, riding, rideKind, ... }：
 *   roll 每局开始时抽任务、摆模型；prePlayer 在玩家更新之前把载具和玩家摆到这一帧的位置；
 *   update 推进模型、歼灭计数、增援、登机镜头、坐车 / 坐直升机时的刷兵和舱门机枪。
 */
export function createMissionDirector(G, { scene, layout, nav, J, camera = null, rng = Math.random, force = {} }) {
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
  const carSamples = sampleRoute(CAR_ROUTE), carLength = carSamples.at(-1).s;
  const roofY = elev(EXTRACTIONS.heli.floor), eye = J.PLAYER?.eye ?? 1.62;
  const FRESH = () => ({ phase: 'none', t: 0, rideT: 0, carS: 0, speed: 0, stopT: 0, endT: 0, rideKills: 0, spawnT: 0, textT: 0, released: false,
    vhp: 100, vhits: 0, warned: 0, smokeT: 0, pose: null, crashT: 0, crashStart: null, crashed: false, boom: false, dead: false });
  const state = { mission: null, kills: 0, reinforce: 0, ...FRESH() };
  const vhud = makeDurabilityHud();
  const from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  let models = [], roofSpots = null;
  const veh = () => state.mission && vehicles[state.mission.extraction.id];
  const riding = () => state.phase === 'board' || state.phase === 'ride' || state.phase === 'end' || state.phase === 'crash';

  // 坐在载具里挨打少一些（直升机舱壁 + 距离，接应车有装甲挡板）
  const baseDamage = G.player?.damage?.bind(G.player);
  if (baseDamage) G.player.damage = (amount, ...rest) => baseDamage(riding() ? amount * (veh()?.kind === 'helicopter' ? 0.35 : 0.5) : amount, ...rest);

  function roll() {
    for (const m of models) m.removeFromParent();
    const mission = rollMission(rng, sites, force);
    Object.assign(state, { mission, kills: 0, reinforce: 0, ...FRESH() });
    vhud.show(false);
    if (G.player) G.player.mounted = false;
    doorGun.reset();
    models = mission.objectives.map((o) => {
      const g = o.kind === 'relay' ? relayModel() : itemModel();
      const y = o.site.y ?? elev(o.site.floor);
      g.position.set(o.site.x, y, o.site.z);
      root.add(g);
      o.object = g; o.pos = v({ ...o.site, y }); o.zone = o.site.floor;
      return g;
    });
    for (const vv of Object.values(vehicles)) vv.reset();
    const x = mission.extraction;
    Object.assign(G.level, {
      objectives: mission.objectives,
      extraction: { pos: v({ ...x, y: elev(x.floor) }), radius: x.radius, label: x.label, blocked: x.blocked },
      missionText: (c) => missionText(mission, c, state.kills, state.phase === 'ride' ? { kind: veh().kind, kills: state.rideKills, left: carLength - state.carS } : null),
      onExtract: () => board(),
      outroDelay: 1.6, keepLock: true,
    });
    Object.assign(J.RADIO, missionRadio(mission));
    return mission;
  }

  G.events.on('enemy:killed', () => {
    if (G.game?.state !== 'playing') return;
    if (state.phase === 'ride') { state.rideKills++; G.game.refreshObjective?.(); return; }
    const m = state.mission;
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
        if (state.rideT >= heliDuration()) finishRide();
      } else {
        state.speed = state.carS >= carLength - 0.05 ? 0 : carSpeedAt(carSamples, state.carS);
        state.carS = Math.min(carLength, state.carS + state.speed * dt);
        vv.setPose(state.pose = carPoseAt(carSamples, state.carS), Math.sin(state.carS * 2.1) * 0.012 * Math.min(1, state.speed / 6));
        if (state.carS >= carLength - 0.05 && (state.stopT += dt) > 1.2) finishRide();
      }
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
    doorGun.update(0, { active: false });
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
    if (vv.kind === 'car') G.weapon?.setVisible?.(true);
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

  function finishRide() {
    if (state.phase !== 'ride') return;
    state.phase = 'end'; state.endT = 0;
    doorGun.update(0, { active: false });
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
    state.spawnT = 1.1;
    if (alive().length >= 9) return;
    for (let k = 0; k < 6; k++) {
      const p = carPoseAt(carSamples, Math.min(carLength - 10, state.carS + 28 + rng() * 35)), side = rng() < 0.5 ? 1 : -1, off = 6 + rng() * 8;
      const x = p.x + p.dir.z * off * side, z = p.z - p.dir.x * off * side, st = landAt(nav, x, z, 0.6);
      if (st && Math.abs(st.y) < 1.5 && clear(nav, st)) { spawnAt(new THREE.Vector3(st.x, st.y, st.z)); break; }
    }
  }

  /** 歼灭任务：场上的敌人少于 5 个时，从远处（离玩家 28 米以上、看不见的地方优先）补一个，直到计数够了 */
  function reinforce(dt) {
    const m = state.mission;
    if (m?.type !== 'eliminate' || G.game?.state !== 'playing' || G.game.run?.allCut) return;
    state.reinforce -= dt;
    if (state.reinforce > 0) return;
    state.reinforce = 2.5;
    if (alive().length >= 5) return;
    const p = G.player.pos, spots = (G.level.enemySpawns || []).filter((s) => s.type === 'ground' && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) > 28 && Math.abs(s.pos.y - p.y) < 14);
    if (!spots.length) return;
    spawnAt(spots[Math.floor(rng() * spots.length)].pos.clone());
  }

  function update(dt) {
    for (const m of models) m.userData.update?.(dt);
    reinforce(dt);
    const vv = veh();
    if (!vv) return null;
    for (const other of Object.values(vehicles)) if (other !== vv) other.update(dt);
    vv.update(dt, { ready: G.game?.run?.allCut, board: state.phase === 'board' ? state.t : state.phase === 'none' ? -1 : 9, speed: state.speed });
    const heliGun = vv.kind === 'helicopter' && state.phase === 'ride' && G.game?.state === 'playing';
    doorGun.update(dt, { active: heliGun, firing: heliGun && !!(G.input?.down?.('fire') || G.input?.fire), camera });
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
        G.player.invulnerable = false;
        G.player.damage?.(9999, null);
      }
      return { fade: Math.min(0.92, smooth((state.crashT - (dur - 1)) / 1)) };
    }
    if (state.phase === 'ride') {
      if (G.game?.state === 'playing') rideSpawns(dt, vv);
      if (vv.kind === 'car' && (state.textT -= dt) <= 0) { state.textT = 0.5; G.game?.refreshObjective?.(); }
      // 最后一秒多压暗
      const left = vv.kind === 'helicopter' ? heliDuration() - state.rideT : (carLength - state.carS) / Math.max(1, state.speed) + (1.2 - state.stopT);
      return left < 1.3 ? { fade: Math.min(0.85, smooth(1 - left / 1.3)) } : null;
    }
    if (state.phase === 'end') {
      state.endT += dt;
      if (state.endT > 1 && !state.released) { state.released = true; if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock?.(); }
      return { ...vv.seatPose(0, 0), position: camera ? camera.position.clone() : vv.seatPose(0, 0).position, quaternion: camera ? camera.quaternion.clone() : vv.seatPose(0, 0).quaternion, fade: 0.85 };
    }
    return null;
  }

  return { roll, prePlayer, update, state, sites, vehicles, root, doorGun,
    get gunActive() { return state.phase === 'board' || state.phase === 'end' || state.phase === 'crash' || (state.phase === 'ride' && veh()?.kind === 'helicopter'); },
    get riding() { return riding(); },
    get rideKind() { return riding() ? veh()?.kind === 'helicopter' ? 'helicopter' : 'car' : null; },
    dispose() { root.removeFromParent(); for (const vv of Object.values(vehicles)) vv.dispose(); doorGun.dispose(); vhud.remove(); } };
}
