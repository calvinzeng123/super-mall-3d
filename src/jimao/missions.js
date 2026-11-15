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

export const MISSION_TYPES = Object.freeze(['relay', 'eliminate', 'rooms', 'hotel']);
export const ELIMINATE_TARGET = 14;
const HOTEL_Z = -81.1533717;

/** 三处中继（旧 FPS 任务的终端、酒店情报点和地下大厅；在园区地图上都实测可达） */
export const RELAY_SITES = Object.freeze([
  { floor: 'P1-1F', x: -169, z: -90, where: '商场西翼' },
  { floor: 'H-2F', x: -245, z: HOTEL_Z, where: '酒店二楼' },
  { floor: 'P1-B1M', x: -151, z: -94, where: '地下大厅' },
]);

/** 两种撤离：直升机停在一期屋顶（从中庭扶梯一路上到 RF），接应车停在公寓 B1 车库。
 * 撤离点在登机门 / 车门外：走到门口就开始登机（钻进舱、坐好），然后坐在里面第一人称看着它飞走 / 开走。 */
// 屋顶光穹（半径 30 m，圆心 -106,-106）西边、一期屋面上半径 7.5 m 都是空地的一块，离屋顶酒吧、咖啡座和花池都在 9 m 以上；机头朝南（-z）
const HELI = Object.freeze({ kind: 'helicopter', x: -182, z: -120, yaw: Math.PI });
const CAR = Object.freeze({ kind: 'car', x: -41, z: -220, yaw: 0 });
const door = (veh) => { const p = rideLocalToWorld(veh, 0, RIDE_SPECS[veh.kind].doorOut); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; };
export const EXTRACTIONS = Object.freeze({
  heli: { id: 'heli', label: '直升机', where: '一期商场屋顶', floor: 'P1-RF', ...door(HELI), radius: 1.7, vehicle: HELI,
    blocked: '任务还没完成，直升机不会在火力下降落' },
  car: { id: 'car', label: '接应车', where: '公寓地下车库', floor: 'A-B1', ...door(CAR), radius: 1.7, vehicle: CAR,
    blocked: '任务还没完成，接应车不会进场' },
});
/** 撤离镜头（登机 + 乘坐）一共多少秒 */
export const rideShot = (kind) => BOARD_TIME + RIDE_SPECS[kind].ride;

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
export function missionText(m, c, kills = 0) {
  const x = m.extraction;
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
 * 接到游戏上：G 是原游戏的共享上下文，level 是 G.level（buildLevel 生成的），nav 是导航网格。
 * 返回 { roll(), update(dt), mission }：roll 在每局开始时抽任务、摆模型；update 每帧推进模型、歼灭计数、增援和撤离动画。
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
  const state = { mission: null, kills: 0, departing: false, depart: 0, reinforce: 0, lookYaw: 0, lookPitch: 0, released: false };
  const from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  let models = [];

  function roll() {
    for (const m of models) m.removeFromParent();
    const mission = rollMission(rng, sites, force);
    state.mission = mission; state.kills = 0; state.departing = false; state.depart = 0; state.reinforce = 0; state.released = false;
    models = mission.objectives.map((o) => {
      const g = o.kind === 'relay' ? relayModel() : itemModel();
      const y = o.site.y ?? elev(o.site.floor);
      g.position.set(o.site.x, y, o.site.z);
      root.add(g);
      o.object = g; o.pos = v({ ...o.site, y }); o.zone = o.site.floor;
      return g;
    });
    for (const veh of Object.values(vehicles)) veh.reset();
    const x = mission.extraction;
    Object.assign(G.level, {
      objectives: mission.objectives,
      extraction: { pos: v({ ...x, y: elev(x.floor) }), radius: x.radius, label: x.label, blocked: x.blocked },
      missionText: (c) => missionText(mission, c, state.kills),
      outroDelay: rideShot(x.vehicle.kind) + 0.5, keepLock: true,
    });
    Object.assign(J.RADIO, missionRadio(mission));
    return mission;
  }

  G.events.on('enemy:killed', () => {
    const m = state.mission;
    if (!m || m.type !== 'eliminate' || G.game?.state !== 'playing') return;
    state.kills++;
    if (state.kills >= m.kills) G.game.completeAll?.();
    G.game.refreshObjective?.();
  });
  G.events.on('extraction:reached', () => {
    state.departing = true; state.depart = 0; state.released = false;
    const veh = vehicles[state.mission.extraction.id];
    state.lookYaw = veh.kind === 'helicopter' ? 0.55 : 0.25; state.lookPitch = -0.05; // 坐下时先朝舱门外看一眼
    if (camera) { from.pos.copy(camera.position); from.quat.copy(camera.quaternion); }
  });

  // 乘坐时能转头看（鼠标锁定时直接动鼠标；没锁定 / 触屏时按住拖）
  const look = (dx, dy) => {
    if (!state.departing) return;
    const lim = state.mission?.extraction.vehicle.kind === 'helicopter' ? 2.4 : 1.9;
    state.lookYaw = Math.max(-lim, Math.min(lim, state.lookYaw - dx * 0.0028));
    state.lookPitch = Math.max(-1.0, Math.min(0.75, state.lookPitch - dy * 0.0028));
  };
  let drag = null;
  const onMove = (e) => { if (document.pointerLockElement) look(e.movementX || 0, e.movementY || 0); else if (drag) { look(e.clientX - drag.x, e.clientY - drag.y); drag = { x: e.clientX, y: e.clientY }; } };
  const onDown = (e) => { if (state.departing && !document.pointerLockElement) drag = { x: e.clientX, y: e.clientY }; };
  const onUp = () => { drag = null; };
  const onTouch = (e) => { const t = e.touches?.[0]; if (!t) { drag = null; return; } if (e.type === 'touchstart') drag = { x: t.clientX, y: t.clientY }; else onMove({ clientX: t.clientX, clientY: t.clientY }); };
  const listeners = [['mousemove', onMove], ['mousedown', onDown], ['mouseup', onUp], ['touchstart', onTouch], ['touchmove', onTouch], ['touchend', onTouch]];
  if (typeof document !== 'undefined') for (const [k, f] of listeners) document.addEventListener(k, f, { passive: true });

  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const lookQuat = (eye, target) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0)));
  /** 登机：0–1 秒走到门口（看着舱里），1–1.9 秒弯腰钻进去坐到座位上，之后坐着、关门、旋翼加速 */
  function boardingView(veh, t) {
    const sp = veh.spec, D = veh.toWorld(sp.doorOut), I = veh.toWorld(sp.doorIn), seat = veh.seatPose(state.lookYaw, state.lookPitch);
    if (t < 1) {
      const k = smooth(t), position = from.pos.clone().lerp(D, k);
      return { position, quaternion: from.quat.clone().slerp(lookQuat(D, I.clone().lerp(seat.position, 0.5)), smooth(t * 1.3)) };
    }
    const k = smooth((t - 1) / 0.9), a = D.clone().lerp(I, k), b = I.clone().lerp(seat.position, k), position = a.lerp(b, k);
    position.y += Math.sin(k * Math.PI) * -0.12; // 钻门时低一下头
    return { position, quaternion: lookQuat(D, I.clone().lerp(seat.position, 0.5)).slerp(seat.quaternion, k) };
  }

  /** 歼灭任务：场上的敌人少于 5 个时，从远处（离玩家 28 米以上、看不见的地方优先）补一个，直到计数够了 */
  function reinforce(dt) {
    const m = state.mission;
    if (m?.type !== 'eliminate' || G.game?.state !== 'playing' || G.game.run?.allCut) return;
    state.reinforce -= dt;
    if (state.reinforce > 0) return;
    state.reinforce = 2.5;
    const alive = G.enemies?.list?.filter((e) => e.alive).length || 0;
    if (alive >= 5) return;
    const p = G.player.pos, spots = (G.level.enemySpawns || []).filter((s) => s.type === 'ground' && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) > 28 && Math.abs(s.pos.y - p.y) < 14);
    if (!spots.length) return;
    const s = spots[Math.floor(rng() * spots.length)];
    try { G.enemies.spawn('soldier', s.pos.clone(), { state: 'alert', target: p }); } catch { /* 池子满了就下次 */ }
  }

  function update(dt) {
    for (const m of models) m.userData.update?.(dt);
    reinforce(dt);
    const veh = state.mission && vehicles[state.mission.extraction.id];
    if (!veh) return null;
    for (const other of Object.values(vehicles)) if (other !== veh) other.update(dt);
    if (state.departing) state.depart += dt;
    const t = state.depart, ride = Math.max(0, t - BOARD_TIME);
    veh.update(dt, { ready: G.game?.run?.allCut, board: state.departing ? t : -1, ride: state.departing ? ride : 0 });
    if (!state.departing) return null;
    // 撤离：先登机，再坐在舱里第一人称看着载具起飞 / 开走（能转头），最后一秒压暗，结算页出来前松开鼠标
    const total = rideShot(veh.kind);
    const view = t < 1.9 ? boardingView(veh, t) : veh.seatPose(state.lookYaw, state.lookPitch);
    view.fade = Math.min(0.85, smooth((t - (total - 1)) / 1));
    if (t >= total && !state.released) { state.released = true; if (document.pointerLockElement) document.exitPointerLock?.(); }
    return view;
  }

  return { roll, update, state, sites, vehicles, root,
    dispose() {
      root.removeFromParent(); for (const veh of Object.values(vehicles)) veh.dispose();
      if (typeof document !== 'undefined') for (const [k, f] of listeners) document.removeEventListener(k, f);
    } };
}
