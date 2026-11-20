// 「丧尸围城」：从商场一路突围到公寓楼顶，叫直升机，清扫完才飞走。
// 一局的流程（目标一个一个放出来，都走原游戏「走到跟前按住交互键」那一套）：
//   1. 商场保安室：开武器柜拿步枪（开局只有手枪和刀）；
//   2. 公寓地下一层：合电闸（电梯才动；拉闸声很大，会招来尸群）；
//   3. 往上三道关，每道关卡在某一层——电梯只能到这层、再往上的楼梯也走不了，要先在这层的住户家里找到工具，再回到关卡处解决：
//        杂物堵死楼梯 → 撬棍；分区配电箱跳闸 → 保险丝；楼梯间着火 → 灭火器；防火门反锁 → 门禁卡。
//      三道关从四种里随机抽三种，楼层、房间每局都不一样；
//   4. 屋顶：点信号弹，守 70 秒（尸群一波波从楼梯口涌上来），直升机降落；
//   5. 登机：用舱门机枪清扫——屋顶追上来的、阳台玻璃后面的（打碎玻璃才看得见打得着）、楼下街上和商场屋面上冲过来的。
//      尖叫者会冲着直升机叫，掉机体耐久。清完才飞走，接机外过场和结算。
// 丧尸平时零零散散地游荡，响动（开枪、拉闸、尖叫、手雷）攒满了就来一波尸群；用刀不出声。
// 这里的规则（抽关卡、航线、封锁判定）都是纯函数，createSiege 把它们接到游戏上。任务系统那边的接口见 missions.js（mission.extraction.flight / ride / closed）。
import * as THREE from 'three';
import { landAt, clear } from '../layout/nav.js';
import { toW } from '../layout/geom.js';
import { RIDE_SPECS, rideLocalToWorld } from './ride-vehicles.js';

export const SIEGE = Object.freeze({
  building: 'A', roof: 'A-RF', power: 'A-B1',
  pad: Object.freeze({ kind: 'helicopter', x: -35, z: -214, yaw: Math.PI }), // 公寓屋顶正中（屋面 38 × 74 米）
  arms: Object.freeze({ floor: 'P1-1F', x: -169, z: -90, where: '商场西翼保安室' }),
  gates: Object.freeze([[4, 6], [9, 12], [15, 18]]), // 三道关各在哪几层里抽（公寓；别的楼见 TOWERS）
  hold: 70, waves: Object.freeze([3, 16, 29, 42, 55]), waveSize: [5, 7], land: 6,
  noise: Object.freeze({ rifle: 7, pistol: 5, grenade: 45, switch: 70, pry: 40, panel: 25, spray: 20, card: 10, flare: 100, decay: 6, quiet: 1.5, horde: 100, after: 35, cooldown: 14, hear: 26 }),
  ambient: Object.freeze({ mall: 9, tower: 6, roof: 4, every: 0.9, near: 12, far: 30, drop: 58 }),
  sweep: Object.freeze({ roof: 8, window: 6, ground: 14, screamers: 3, cap: 150 }),
  ammo: Object.freeze({ rifle: 30, reserve: 90 }),
});

/**
 * 能撤离的两栋楼。每局抽一栋（weight），网址参数 tower=A / T1 可以指定。
 *   A  公寓：从商场一层走过去，地下一层合闸；屋顶 38 × 74 米，停机位在正中；
 *   T1 北区 1 号楼：压在商场上面的住宅塔楼（7F 是空中大堂），电梯从商场地下一层的电梯厅上去；屋顶只有 36 × 16 米还有两个楼梯间，
 *      停机位只能放在东头；旁边 2 号楼隔着 14 米，绕飞半径放到 58 米才绕得开。住宅楼的门禁在紧急状态下全部释放（run.js 用开着门的导航）。
 *      北区 2 号楼的地下电梯厅从商场走不到，所以不做。
 */
export const TOWERS = Object.freeze({
  A: Object.freeze({ id: 'A', name: '公寓', roof: 'A-RF', roofName: '公寓楼顶', power: 'A-B1', powerName: '公寓地下一层', lift: 'A-ST1', stair: 'A-ST', mall: false,
    pad: SIEGE.pad, gates: SIEGE.gates, R: 46, weight: 0.65 }),
  T1: Object.freeze({ id: 'T1', name: '北区 1 号楼', roof: 'T1-RF', roofName: '北区 1 号楼楼顶', power: 'P1-B1', powerName: '北区 1 号楼地下一层电梯厅', lift: 'T1-ST-A', stair: 'T1-ST', mall: true,
    pad: Object.freeze({ kind: 'helicopter', x: -249.2, z: -232, yaw: Math.PI / 2 }), gates: Object.freeze([[9, 11], [14, 17], [20, 23]]), R: 58, weight: 0.35 }),
});
/** 抽一栋楼。r ∈ [0, 1)；force 是楼的 id */
export function pickTower(r, force = null) {
  if (TOWERS[force]) return TOWERS[force];
  const list = Object.values(TOWERS), total = list.reduce((a, t) => a + t.weight, 0);
  let x = r * total;
  for (const t of list) { x -= t.weight; if (x < 0) return t; }
  return TOWERS.A;
}

/** 四种关卡：卡住的原因、要找的工具、怎么解决 */
export const GATES = Object.freeze({
  debris: Object.freeze({ name: '杂物堵死楼梯', tool: '撬棍', at: 'stair', verb: '撬开杂物', find: '找撬棍', why: '楼梯被倒下来的柜子堵死了', lift: '轿厢被卡住，上不去', noise: 'pry' }),
  fuse: Object.freeze({ name: '分区配电箱跳闸', tool: '保险丝', at: 'lobby', verb: '换上保险丝', find: '找保险丝', why: '楼梯间的电动栅门落着', lift: '上面几层没电', noise: 'panel' }),
  fire: Object.freeze({ name: '楼梯间着火', tool: '灭火器', at: 'stair', verb: '扑灭明火', find: '找灭火器', why: '楼梯间烧着，过不去', lift: '消防联动把电梯锁在这层', noise: 'spray' }),
  lock: Object.freeze({ name: '防火门反锁', tool: '门禁卡', at: 'stair', verb: '刷卡开门', find: '找门禁卡', why: '防火门从里面反锁了', lift: '门禁系统把上面几层锁了', noise: 'card' }),
});

const floorOf = (n, tower = TOWERS.A) => `${tower.id}-${n}F`;
const shuffle = (list, rng) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** 公寓某一层的住户房间（屋子中间那一点，站得住人）：[{ floor, x, y, z, name }] */
export function unitSites(layout, nav, floor) {
  const lv = layout.levels.find((l) => l.id === floor), out = [];
  for (const u of lv?.units || []) {
    const r = u.rects?.[0]; if (!r) continue;
    const [x, z] = toW(u.frame, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2), st = landAt(nav, x, z, lv.elev + 0.6);
    if (!st || st.floor !== floor || !clear(nav, st)) continue;
    const n = +(u.id.split('-').at(-1).replace(/\D/g, '') || 1);
    out.push({ floor, x: st.x, y: lv.elev, z: st.z, unit: u.id, name: `${lv.short.replace(/\D/g, '')}${String(n).padStart(2, '0')} 室` }); // unit：路线指引要靠它找到这户的门
  }
  return out;
}
/** 电梯厅里站人的位置：这一层电梯门正前方 dist 米 */
export function lobbySpot(nav, link, floor, dist = 2.2) {
  const stop = link?.stops?.find((s) => s.floor === floor); if (!stop) return null;
  const y = nav.floors.get(floor)?.y ?? 0;
  for (const d of [dist, dist * 0.7, 1.2]) for (const sign of [1, -1]) {
    const x = stop.x + stop.face[0] * d * sign, z = stop.z + stop.face[1] * d * sign, st = landAt(nav, x, z, y + 0.6);
    if (st && st.floor === floor && clear(nav, st)) return { floor, x, y, z };
  }
  return null;
}

/**
 * 抽一局。rng 返回 [0, 1)；runs 是 stairs.js 的 stairRuns(nav)；tower 是 TOWERS 里的一栋（默认公寓）。
 * 返回 { tower, stages: [{ id, kind, floor, site: {floor, x, y, z}, label, verb, text, noise?, gate?, tool? }], gates: [{ type, floor, n, runs, stage（解决它的那一步的下标）}], pad, flare }
 */
export function siegePlan(rng, layout, nav, runs, tower = TOWERS.A) {
  const lift = nav.links.find((l) => l.id === tower.lift), yOf = (f) => nav.floors.get(f)?.y ?? 0;
  const stages = [], gates = [];
  const a = SIEGE.arms;
  stages.push({ id: 'arms', kind: 'locker', floor: a.floor, site: { floor: a.floor, x: a.x, y: yOf(a.floor), z: a.z }, label: `武器柜 · ${a.where}`, verb: '打开武器柜', text: `去${a.where}拿步枪`, noise: 0 });
  const stop = lift.stops.find((q) => q.floor === tower.power) || lift.stops[0];
  const power = lobbySpot(nav, lift, tower.power, 3) || { floor: tower.power, x: stop.x, y: yOf(tower.power), z: stop.z };
  stages.push({ id: 'power', kind: 'switch', floor: tower.power, site: power, label: `配电柜 · ${tower.powerName}`, verb: '合上电闸', text: `${tower.name}停电了：到${tower.powerName}合闸，电梯才能用`, noise: SIEGE.noise.switch });
  const types = shuffle(Object.keys(GATES), rng).slice(0, tower.gates.length);
  tower.gates.forEach(([lo, hi], i) => {
    // 这一段里有住户房间可找工具的楼层才抽（北区塔楼有几层没有能进的户）
    const ok = []; for (let n = lo; n <= hi; n++) if (unitSites(layout, nav, floorOf(n, tower)).length && runs.some((r) => r.from === floorOf(n, tower) && r.id.startsWith(tower.stair))) ok.push(n);
    const n = ok[Math.floor(rng() * ok.length)], floor = floorOf(n, tower), type = types[i], T = GATES[type];
    const rooms = unitSites(layout, nav, floor), room = rooms[Math.floor(rng() * rooms.length)];
    const up = runs.filter((r) => r.from === floor && r.id.startsWith(tower.stair));
    const core = up[Math.floor(rng() * up.length)];
    const at = T.at === 'lobby' ? (lobbySpot(nav, lift, floor) || core.a) : core.a;
    stages.push({ id: `tool${i}`, kind: 'tool', gate: i, tool: T.tool, floor, site: room, label: `${T.tool} · ${n}F ${room.name}`, verb: `拿${T.tool}`, text: `${n}F：${T.name}。到 ${room.name}${T.find}`, noise: 0 });
    stages.push({ id: `gate${i}`, kind: 'gate', gate: i, type, floor, site: { floor, x: at.x, y: yOf(floor), z: at.z }, label: `${T.name} · ${n}F`, verb: T.verb, text: `带着${T.tool}回${T.at === 'lobby' ? '电梯厅' : '楼梯口'}：${T.verb}`, noise: SIEGE.noise[T.noise] });
    gates.push({ type, floor, n, runs: up.map((r) => r.id), core: core.id, stage: stages.length - 1, model: { x: core.ea.x + core.da.x * 0.7, y: yOf(floor), z: core.ea.z + core.da.z * 0.7, yaw: Math.atan2(core.da.x, core.da.z) } });
  });
  // 信号弹：停机位旁边 7 米多、屋面上站得住的一点（屋顶窄的楼只有一两个方向放得下）
  const pad = tower.pad, ry = yOf(tower.roof);
  let flare = null;
  for (const [dx, dz] of [[7.5, 3], [-7.5, 3], [3, 7.5], [3, -7.5], [-7.5, -3], [7.5, -3], [-3, 7.5], [-3, -7.5]]) { const st = landAt(nav, pad.x + dx, pad.z + dz, ry + 0.6); if (st && st.floor === tower.roof && clear(nav, st)) { flare = { floor: tower.roof, x: pad.x + dx, y: ry, z: pad.z + dz }; break; } }
  flare ||= { floor: tower.roof, x: pad.x, y: ry, z: pad.z + 6 };
  stages.push({ id: 'flare', kind: 'flare', floor: tower.roof, site: flare, label: `信号弹 · ${tower.roofName}`, verb: '点燃信号弹', text: `上到${tower.roofName}，点信号弹叫直升机`, noise: SIEGE.noise.flare });
  return { tower, stages, gates, pad, flare };
}

/** 现在走到第 stage 步（已经完成了 stage 步）时，哪一道关还拦着：没有了返回 null */
export function activeGate(plan, stage) { return plan.gates.find((g) => stage <= g.stage) || null; }
/** 电梯能不能从 from 层到 to 层（只管这一局那栋楼的电梯）。返回一句原因或 null */
export function liftRule(plan, stage, nav, linkId, from, to) {
  const tower = plan.tower || TOWERS.A;
  if (!String(linkId).startsWith(`${tower.id}-`)) return null;
  if (stage <= 1) return `${tower.name}停电了，电梯不动。先去${tower.powerName}合闸`;
  const g = activeGate(plan, stage), y = (f) => nav.floors.get(f)?.y ?? 0;
  if (g && Math.max(y(from), y(to)) > y(g.floor) + 0.1) return `电梯只能到 ${g.n}F：${GATES[g.type].lift}`;
  return null;
}
/** 这一段楼梯（往上）走不走得通。返回一句原因或 null */
export function stairRule(plan, stage, run) {
  const g = activeGate(plan, stage);
  return g && g.runs.includes(run.id) ? `${GATES[g.type].why}——${stage === g.stage ? '用' : '先找'}${GATES[g.type].tool}` : null;
}

/**
 * 清扫航线。从公寓楼顶起飞，先绕着楼顶转（清屋顶、看高层的阳台），边转边降到离地 48 米（一路是中低层的阳台；
 * 公寓西边、北边紧挨着商场，商场屋面 37 米高，不能再低），再绕着楼下转（清街上和商场屋面上冲过来的）；这一圈可以一直转，直到 setLeave(t) 定下离开的时刻，然后沿切线加速爬升飞走。
 * 左舷（舱门机枪那一侧）始终朝着楼。返回 { poseAt(t), duration(), setLeave(t), phaseAt(t), R, center }
 */
export function siegeFlight(pad, padY, { center = { x: pad.x, z: pad.z }, R = 46, lift = 4.5, high = 12, low = 48, turn = 44, descend = 30, leave = 6, cap = SIEGE.sweep.cap } = {}) {
  let leaveAt = null;
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const omega = (Math.PI * 2) / turn, th0 = Math.atan2(pad.z - center.z, pad.x - center.x) || 0;
  const top = padY + high, bottom = low; // 地面标高 0
  // 起飞后先滑出去：半径从 0 长到 R（1 圈的前 1/4），角速度一直是 omega
  const orbitAt = (t) => {
    const tau = Math.max(0, t - lift), th = th0 - omega * tau, r = R * smooth(tau / (turn * 0.22));
    const k = smooth((tau - turn * 0.75) / descend), y = top + (bottom - top) * k + 1.5 * Math.sin(tau * 0.45);
    return { x: center.x + r * Math.cos(th), y, z: center.z + r * Math.sin(th), yaw: Math.PI - th, pitch: 0.05, roll: -0.2 * Math.min(1, tau / 3), th, tau };
  };
  const poseAt = (t) => {
    if (t < lift) { const k = smooth(t / lift); return { x: pad.x, y: padY + high * k, z: pad.z, yaw: pad.yaw + (Math.PI - th0 - pad.yaw) * smooth((t - 0.8) / (lift - 0.8)), pitch: 0, roll: 0, phase: 'lift' }; }
    const end = leaveAt ?? cap;
    if (t <= end) { const p = orbitAt(t); return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, roll: p.roll, phase: p.tau < turn * 0.75 ? 'roof' : p.tau < turn * 0.75 + descend ? 'windows' : 'ground' }; }
    const p = orbitAt(end), u = t - end, f = { x: Math.sin(p.th), z: -Math.cos(p.th) }, d = R * omega * u + 4 * u * u;
    return { x: p.x + f.x * d, y: p.y + 2 * u + 1.8 * u * u, z: p.z + f.z * d, yaw: p.yaw, pitch: 0.14 * smooth(u / 1.5), roll: -0.2 * (1 - smooth(u / 2)), phase: 'leave' };
  };
  return { poseAt, center, R, padY,
    duration: () => (leaveAt ?? cap) + leave,
    setLeave(t) { if (leaveAt === null) leaveAt = Math.min(cap, t); return leaveAt; },
    get leaving() { return leaveAt !== null; },
    phaseAt: (t) => poseAt(t).phase,
    times: { roof: lift, windows: lift + turn * 0.75, ground: lift + turn * 0.75 + descend } };
}

const bounds = (layout, tower) => { const b = layout.buildings.find((x) => x.id === tower.id), xs = b.outline.map((p) => p[0]), zs = b.outline.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; };
/**
 * 楼下丧尸冲出来的位置，都在离这栋楼外墙 lo–hi 米一圈里。返回 [{x, y, z, where: 'street' | 'mall'}]：
 *   公寓：一半在东、南两面的街上（标高 0 的室外地面），一半在西边紧挨着的商场屋面上（从楼与楼之间冲过来的）；
 *   北区 1 号楼压在商场上面，四周全是商场屋面（tower.mall）。
 */
export function groundSpots(nav, layout, count, rng, tower = TOWERS.A, lo = 8, hi = 34) {
  const { x0, x1, z0, z1 } = bounds(layout, tower), out = [];
  const mallY = nav.floors.get('P1-RF')?.y ?? 34;
  for (let k = 0; k < count * 80 && out.length < count; k++) {
    const mall = tower.mall || out.length % 2 === 1;
    const x = x0 - hi + rng() * (x1 - x0 + hi * 2), z = z0 - hi + rng() * (z1 - z0 + hi * 2);
    const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1), d = Math.hypot(dx, dz);
    if (d < lo || d > hi) continue;
    const st = landAt(nav, x, z, mall ? mallY + 1.2 : 1.2);
    if (!st || st.floor !== (mall ? 'P1-RF' : 'ground') || !clear(nav, st) || out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.5)) continue;
    out.push({ x, y: st.y, z, where: mall ? 'mall' : 'street' });
  }
  return out;
}
/** 阳台（外挂在这栋楼两面长墙外）：[{ x, y, z, nx, nz（朝外）, n（楼层）}]，楼层错开、两面交替 */
export function balconySpots(layout, nav, count, rng, tower = TOWERS.A) {
  const { x0, x1, z0, z1 } = bounds(layout, tower), alongZ = z1 - z0 >= x1 - x0, out = [];
  const all = []; for (let n = 5; n < 40; n++) if (nav.floors.has(floorOf(n, tower)) && nav.floors.has(floorOf(n + 1, tower))) all.push(n);
  const floors = shuffle(all.filter((n, i) => i % 3 !== 2), rng).slice(0, count);
  floors.forEach((n, i) => {
    const far = i % 2 === 0, y = nav.floors.get(floorOf(n, tower)).y;
    if (alongZ) out.push({ x: far ? x1 + 0.75 : x0 - 0.75, y, z: z0 + 8 + rng() * (z1 - z0 - 16), nx: far ? 1 : -1, nz: 0, n });
    else out.push({ x: x0 + 6 + rng() * (x1 - x0 - 12), y, z: far ? z1 + 0.75 : z0 - 0.75, nx: 0, nz: far ? 1 : -1, n });
  });
  return out;
}

// ---------- 模型（关卡物件、工具、阳台）----------
const M = {};
function mats() {
  if (M.steel) return M;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, ...o });
  Object.assign(M, { steel: std(0x4a4f55, { metalness: 0.7, roughness: 0.45 }), dark: std(0x1b1d20), wood: std(0x6b4a2e, { roughness: 0.85 }), red: std(0xb3261e), yellow: std(0xe0a62a), green: std(0x2f7d4f),
    glow: new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }), glowGreen: new THREE.MeshBasicMaterial({ color: 0x6dff9a, toneMapped: false }), flame: new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd0e6, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.2, side: THREE.DoubleSide }), slab: std(0xbfc2c4, { roughness: 0.9 }), white: std(0xe8e6df) });
  return M;
}
const box = (g, w, h, d, x, y, z, m, ry = 0, rz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.set(0, ry, rz); b.castShadow = true; g.add(b); return b; };
const cyl = (g, r, h, x, y, z, m, rx = 0, rz = 0) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), m); b.position.set(x, y, z); b.rotation.set(rx, 0, rz); b.castShadow = true; g.add(b); return b; };
/** 物件上方一根细光柱 + 一圈光环：隔着半个大厅也看得见该去哪 */
function beacon(g, color = 'glow', h = 2.6) { const m = mats(); const b = box(g, 0.05, h, 0.05, 0, h / 2 + 0.2, 0, m[color]); b.castShadow = false; b.userData.beacon = true; return b; }
function setState(g, on) { g.traverse((o) => { if (o.userData.beacon) o.visible = on !== 'cut'; if (o.userData.cutHide) o.visible = on !== 'cut'; if (o.userData.cutShow) o.visible = on === 'cut'; }); }

export function lockerModel() {
  const m = mats(), g = new THREE.Group(); g.name = '武器柜';
  box(g, 1.1, 1.9, 0.5, 0, 0.95, 0, m.steel); const door = box(g, 0.52, 1.8, 0.04, -0.27, 0.95, 0.27, m.dark); box(g, 0.52, 1.8, 0.04, 0.27, 0.95, 0.27, m.dark); door.userData.cutHide = true;
  box(g, 0.9, 0.05, 0.3, 0, 1.2, 0.1, m.steel); box(g, 0.06, 0.9, 0.06, -0.2, 0.75, 0.1, m.dark, 0, 0.12); box(g, 0.06, 0.9, 0.06, 0.2, 0.75, 0.1, m.dark, 0, -0.12);
  beacon(g); g.userData.setState = (s) => setState(g, s); return g;
}
export function switchModel() {
  const m = mats(), g = new THREE.Group(); g.name = '配电柜';
  box(g, 0.9, 1.7, 0.35, 0, 0.95, 0, m.steel); box(g, 0.7, 0.5, 0.03, 0, 1.4, 0.19, m.yellow);
  const off = box(g, 0.08, 0.34, 0.08, 0, 0.82, 0.24, m.red, 0, 0); off.rotation.x = 0.9; off.userData.cutHide = true;
  const on = box(g, 0.08, 0.34, 0.08, 0, 1.0, 0.24, m.green); on.rotation.x = -0.9; on.userData.cutShow = true; on.visible = false;
  const lamp = box(g, 0.1, 0.1, 0.03, 0.28, 1.4, 0.21, m.glowGreen); lamp.userData.cutShow = true; lamp.visible = false;
  beacon(g); g.userData.setState = (s) => setState(g, s); return g;
}
export function toolModel(tool) {
  const m = mats(), g = new THREE.Group(); g.name = tool;
  const table = box(g, 0.7, 0.05, 0.45, 0, 0.72, 0, m.wood); for (const [x, z] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) box(g, 0.05, 0.7, 0.05, x, 0.35, z, m.wood);
  const item = new THREE.Group(); item.position.y = 0.76; item.userData.cutHide = true; g.add(item); table.castShadow = false;
  if (tool === '撬棍') { cyl(item, 0.018, 0.7, 0, 0.03, 0, m.red, 0, Math.PI / 2); box(item, 0.05, 0.03, 0.12, 0.35, 0.03, 0.04, m.red); }
  else if (tool === '保险丝') { box(item, 0.3, 0.12, 0.2, 0, 0.06, 0, m.dark); for (const x of [-0.08, 0, 0.08]) cyl(item, 0.022, 0.1, x, 0.16, 0, m.white, 0, 0); }
  else if (tool === '灭火器') { cyl(item, 0.09, 0.45, 0, 0.23, 0, m.red); cyl(item, 0.03, 0.08, 0, 0.5, 0, m.dark); box(item, 0.16, 0.03, 0.03, 0.06, 0.55, 0, m.dark); }
  else { box(item, 0.09, 0.006, 0.055, 0, 0.01, 0, m.white); box(item, 0.05, 0.007, 0.012, 0, 0.012, 0.012, m.green); }
  beacon(g); g.userData.setState = (s) => setState(g, s); return g;
}
/** 关卡挡在那儿的东西：type 是 GATES 的键。交互点上只放一块小牌子（真正的大件摆在楼梯口，见 gateBlock） */
export function gateModel(type) {
  const m = mats(), g = new THREE.Group(); g.name = GATES[type].name;
  if (type === 'fuse') { box(g, 0.6, 0.8, 0.16, 0, 1.3, 0, m.steel); const a = box(g, 0.1, 0.1, 0.02, 0, 1.45, 0.09, m.red); a.userData.cutHide = true; const b = box(g, 0.1, 0.1, 0.02, 0, 1.45, 0.09, m.glowGreen); b.userData.cutShow = true; b.visible = false; }
  else if (type === 'lock') { box(g, 0.12, 0.18, 0.04, 0, 1.25, 0, m.dark); const a = box(g, 0.04, 0.04, 0.01, 0, 1.3, 0.025, m.red); a.userData.cutHide = true; const b = box(g, 0.04, 0.04, 0.01, 0, 1.3, 0.025, m.glowGreen); b.userData.cutShow = true; b.visible = false; }
  beacon(g, 'glow', 2.2); g.userData.setState = (s) => setState(g, s); return g;
}
/** 堵在楼梯口的大件：杂物 / 火 / 落下的栅门 / 关死的防火门。clear() 以后挪开、熄灭、升起 */
export function gateBlock(type) {
  const m = mats(), g = new THREE.Group(); g.name = `${GATES[type].name}（挡路）`;
  const junk = new THREE.Group(); g.add(junk);
  if (type === 'debris') { box(junk, 1.4, 0.9, 0.5, 0, 0.55, 0, m.wood, 0.3, 0.5); box(junk, 0.9, 0.5, 0.6, 0.2, 0.25, 0.3, m.steel, -0.4); box(junk, 0.5, 1.5, 0.08, -0.4, 0.8, -0.2, m.wood, 0.2, -0.35); box(junk, 0.6, 0.4, 0.4, -0.3, 1.2, 0.1, m.dark, 0.6, 0.2); }
  else if (type === 'fire') { for (let i = 0; i < 6; i++) { const f = box(junk, 0.35, 0.5 + (i % 3) * 0.3, 0.35, -0.6 + i * 0.24, 0.3 + (i % 3) * 0.12, (i % 2) * 0.2 - 0.1, m.flame, i); f.castShadow = false; f.userData.flame = i; } box(junk, 1.3, 0.12, 0.6, 0, 0.06, 0, m.dark); }
  else { const n = type === 'fuse' ? 7 : 1; for (let i = 0; i < n; i++) box(junk, type === 'fuse' ? 0.04 : 1.3, 2.1, type === 'fuse' ? 0.04 : 0.07, type === 'fuse' ? -0.6 + i * 0.2 : 0, 1.05, 0, type === 'fuse' ? m.steel : m.red); if (type === 'fuse') { box(junk, 1.3, 0.05, 0.05, 0, 2.1, 0, m.steel); box(junk, 1.3, 0.05, 0.05, 0, 0.9, 0, m.steel); } else box(junk, 0.3, 0.1, 0.1, 0.4, 1.05, 0.07, m.steel); }
  let cleared = false, t = 0;
  g.userData.update = (dt) => { t += dt; if (type === 'fire' && !cleared) for (const f of junk.children) if (f.userData.flame !== undefined) { f.scale.y = 0.8 + 0.35 * Math.sin(t * 9 + f.userData.flame * 1.7); f.rotation.y += dt * 2; } if (cleared && junk.visible) { const k = Math.min(1, (g.userData.clearT += dt) / 0.8); if (type === 'debris') { junk.position.x = 1.6 * k; junk.rotation.z = -0.5 * k; } else if (type === 'fire') junk.scale.setScalar(1 - k); else junk.position.y = 2.2 * k; if (k >= 1 && type === 'fire') junk.visible = false; } };
  g.userData.clear = () => { cleared = true; g.userData.clearT = 0; };
  g.userData.reset = () => { cleared = false; junk.visible = true; junk.position.set(0, 0, 0); junk.rotation.set(0, 0, 0); junk.scale.setScalar(1); };
  return g;
}
export function flareModel() {
  const m = mats(), g = new THREE.Group(); g.name = '信号弹';
  box(g, 0.5, 0.3, 0.35, 0, 0.15, 0, m.red); cyl(g, 0.035, 0.3, 0, 0.42, 0, m.yellow);
  const smoke = box(g, 0.5, 9, 0.5, 0, 5, 0, new THREE.MeshBasicMaterial({ color: 0xff4a2e, transparent: true, opacity: 0.4, toneMapped: false, depthWrite: false })); smoke.castShadow = false; smoke.userData.cutShow = true; smoke.visible = false;
  const light = box(g, 0.14, 0.14, 0.14, 0, 0.62, 0, m.glow); light.userData.cutShow = true; light.visible = false;
  beacon(g); g.userData.setState = (s) => setState(g, s); return g;
}
/** 一个阳台：楼板、两侧挡板、整面玻璃（pane）。朝 +x 伸出去 */
export function balconyModel() {
  const m = mats(), g = new THREE.Group(); g.name = '阳台';
  box(g, 1.5, 0.14, 2.6, 0, -0.07, 0, m.slab); box(g, 1.5, 0.1, 2.6, 0, 2.5, 0, m.slab); box(g, 1.5, 2.5, 0.08, 0, 1.25, -1.3, m.white); box(g, 1.5, 2.5, 0.08, 0, 1.25, 1.3, m.white); box(g, 0.06, 2.5, 2.6, -0.72, 1.25, 0, m.dark);
  const pane = box(g, 0.03, 2.4, 2.5, 0.72, 1.25, 0, m.glass); pane.castShadow = false; pane.renderOrder = 3;
  g.userData.pane = pane; return g;
}

export const SIEGE_CSS = `
.jm-noise { position: absolute; left: 50%; top: calc(58px + env(safe-area-inset-top)); transform: translateX(-50%); width: 150px; z-index: 4; pointer-events: none; font: 600 10px/1 ui-monospace, 'PingFang SC', monospace; letter-spacing: .2em; color: rgba(232, 228, 218, .75); text-align: center; }
.jm-noise.off { display: none; }
.jm-noise i { display: block; height: 4px; margin-top: 4px; background: rgba(232, 228, 218, .18); border-radius: 2px; overflow: hidden; }
.jm-noise i b { display: block; height: 100%; width: 0; background: #e8e4da; transition: width .15s linear, background .2s; }
.jm-noise.hot i b { background: #ff5a40; } .jm-noise.hot { color: #ff8a70; }
.jm-siege-clock { position: absolute; left: 50%; top: calc(86px + env(safe-area-inset-top)); transform: translateX(-50%); z-index: 4; pointer-events: none; padding: 5px 12px; border: 1px solid rgba(255, 179, 71, .6); background: rgba(11, 13, 15, .6); color: #ffb347; font: 700 15px/1.2 ui-monospace, 'PingFang SC', monospace; letter-spacing: .12em; white-space: nowrap; }
.jm-siege-clock.off { display: none; }
.jm-mode { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; padding: 9px 14px; border: 1px solid rgba(232, 228, 218, .28); background: rgba(11, 13, 15, .55); color: #e8e4da; cursor: pointer; font: 14px/1.2 'PingFang SC', 'Microsoft YaHei', sans-serif; letter-spacing: .08em; }
.jm-mode small { font-size: 11px; color: rgba(232, 228, 218, .6); letter-spacing: .2em; }
.jm-mode b { font-weight: 800; color: #ffb347; font-size: 16px; }
.jm-mode i { font-style: normal; font-size: 11px; color: rgba(232, 228, 218, .5); margin-left: auto; padding-left: 14px; }
.jm-mode.on { border-color: rgba(255, 90, 64, .7); } .jm-mode.on b { color: #ff5a40; }`;

/**
 * 接到游戏上。G.siege.enabled 为真时任务系统改抽这里的任务（missions.js 的 roll）。
 * zombies：zombie.js 的 addZombies 返回值；director：任务系统；runs：stairs.js 的楼梯分段。
 */
export function createSiege(G, { layout, nav, scene, ui = null, zombies, director, runs, flow = null, rng = Math.random, storage = null, tower: forceTower = null }) {
  const root = new THREE.Group(); root.name = '丧尸围城'; scene?.add(root);
  const S = { plan: null, mission: null, stage: 0, noise: 0, quietT: 0, hordeCool: 0, spawnT: 0, hold: -1, waveI: 0, land: -1, landed: false, flight: null, sweep: null, safe: new THREE.Vector3(), hasSafe: false, tellT: 0 };
  const blocks = [], balconies = [];
  let enabled = false, noiseEl = null, clockEl = null, savedFlow = null;
  try { enabled = storage?.getItem?.('jimao-siege') === '1'; } catch { enabled = false; }
  if (ui && typeof document !== 'undefined') {
    noiseEl = document.createElement('div'); noiseEl.className = 'jm-noise off'; noiseEl.innerHTML = '响动<i><b></b></i>'; ui.append(noiseEl);
    clockEl = document.createElement('div'); clockEl.className = 'jm-siege-clock off'; ui.append(clockEl);
  }
  const playing = () => enabled && G.game?.state === 'playing' && !!S.plan;
  const tower = () => S.plan?.tower || TOWERS.A;
  const padY = () => nav.floors.get(tower().roof)?.y ?? 74;
  const zalive = () => zombies.pool.filter((z) => z.active && z.alive);
  const spawn = (pos, opts = {}) => { try { return G.enemies.spawn('zombie', pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z), opts); } catch { return null; } };
  const say = (t, s = 3) => G.hud?.message?.(t, s);

  /** 任务系统每局来要一次 */
  function mission(r = rng) {
    const T = pickTower(r(), forceTower), plan = siegePlan(r, layout, nav, runs, T), pad = plan.pad;
    S.plan = plan;
    const flight = siegeFlight(pad, padY(), { R: T.R });
    const door = rideLocalToWorld(pad, 0, RIDE_SPECS.helicopter.doorOut);
    const objectives = plan.stages.map((st, i) => ({ id: st.id, label: st.label, verb: st.verb, kind: st.kind === 'tool' ? 'item' : 'relay', site: st.site, locked: i > 0,
      model: () => (st.kind === 'locker' ? lockerModel() : st.kind === 'switch' ? switchModel() : st.kind === 'tool' ? toolModel(st.tool) : st.kind === 'gate' ? gateModel(st.type) : flareModel()) }));
    const m = { type: 'siege', title: '丧尸围城', objectives, kills: 0, plan,
      extraction: { id: 'heli', label: '直升机', where: T.roofName, floor: T.roof, x: +door.x.toFixed(2), z: +door.z.toFixed(2), radius: 1.7, vehicle: pad, closed: true,
        blocked: '直升机还没到', orbit: { center: flight.center, pad }, flight,
        ride: { boardRadio: '上机！机枪交给你：屋顶追上来的、阳台玻璃后面的、楼下冲出来的，全部清掉。先打尖叫的，它们会伤到飞机。', onBoard: startSweep, spawns: sweepTick, targets: () => (S.sweep ? S.sweep.list.filter((z) => z.alive && z.active) : []), keep: () => true, outroCam: (pose) => roofEdge(pose),
          ground: (s0) => landAt(nav, s0.x, s0.z, s0.y)?.y ?? 0 } }, // 坠机落在哪：正下方最高的那层楼面（楼顶 / 商场屋面 / 街上）
      text: (c, ride) => textNow(c, ride), markers: () => [],
      radio: { intro: '这里是指挥中心。商场已经沦陷，地面出不去。你手上只有一把手枪——先去保安室拿步枪，再想办法上公寓楼顶，直升机到那儿接你。别乱开枪，它们听得见。'.replace('公寓楼顶', T.roofName),
        contact: '它们发现你了！', cut: plan.stages.slice(0, -1).map((st, i) => cutLine(plan, i)), all: `信号弹点着了！直升机 ${SIEGE.hold} 秒后到，守住屋顶！`, low: '你被咬伤了，拉开距离。', done: '指挥中心收到。幸存者已撤离云澜汇——干得漂亮。' } };
    S.plan = plan; S.mission = m; S.flight = flight;
    return m;
  }
  const cutLine = (plan, i) => { const st = plan.stages[i], next = plan.stages[i + 1]; return `${st.kind === 'locker' ? '步枪到手。' : st.kind === 'switch' ? '电来了，电梯能用了——动静不小，它们过来了。' : st.kind === 'tool' ? `${st.tool}到手。` : `${GATES[st.type].name}解决了。`}${next ? next.text + '。' : ''}`; };
  function textNow(c, ride) {
    if (ride?.over) return '清扫完毕 · 返航';
    if (ride && S.sweep) { const w = S.sweep; return `清扫 · 屋顶 ${w.kill.roof}/${w.total.roof} · 阳台 ${w.kill.window}/${w.total.window} · 楼下 ${w.kill.ground}/${w.total.ground}`; }
    if (c.allCut) return S.landed ? `登机 · ${tower().roofName}直升机` : S.hold >= 0 ? '守住屋顶，等直升机' : '等直升机';
    return S.plan.stages[Math.min(S.stage, S.plan.stages.length - 1)].text;
  }

  /** 机外镜头架在楼顶边上、离直升机最近的那一点：看着它从楼下绕上来、飞远。贴着女儿墙内侧、比人高一截——退进来站在人眼高度的话，屋面上的花箱、女儿墙会挡掉小半个画面 */
  function roofEdge(pose) {
    const { x0, x1, z0, z1 } = bounds(layout, tower()), c = (v, lo, hi) => Math.max(lo + 0.35, Math.min(hi - 0.35, v));
    return new THREE.Vector3(c(pose.x, x0, x1), padY() + 2.5, c(pose.z, z0, z1));
  }
  /** 结算页、暂停页上的字跟着模式换 */
  function copy() {
    if (typeof document === 'undefined') return;
    const set = (sel, t) => { const el = document.querySelector(sel); if (el) el.textContent = t; };
    set('[data-s="complete"] .m-k', enabled ? '丧尸围城 · 行动简报' : '零点突围 · 行动简报');
    set('[data-s="complete"] .m-h', enabled ? '幸存者已撤离' : '云澜汇已收复');
    set('[data-s="dead"] .m-k', enabled ? '你被尸群淹没了' : '特勤队员倒下');
    set('[data-s="paused"] [data-act="restart"]', enabled ? '重新开始（换一局关卡）' : '重新出击（换一项任务）');
  }
  /** 每局开始（任务系统 roll 完以后调） */
  function loadout() {
    S.loadout = false;
    try { if (G.rifle) { G.rifle.ammo = 0; G.rifle.reserve = 0; } G.weapon?.select?.('pistol'); } catch { /* 步枪的弹药改不了就算了 */ }
  }
  function reset() {
    for (const b of blocks.splice(0)) b.removeFromParent();
    for (const b of balconies.splice(0)) b.g.removeFromParent();
    Object.assign(S, { stage: 0, noise: 0, quietT: 0, hordeCool: 6, spawnT: 2, hold: -1, waveI: 0, land: -1, landed: false, sweep: null, hasSafe: false, tellT: 0, loadout: false });
    noiseEl?.classList.toggle('off', !enabled); clockEl?.classList.add('off'); copy();
    if (flow) {
      // 原游戏自己的巡逻、增援、追兵全停（丧尸由这里放）；换回零点突围时还原
      if (enabled && !savedFlow) { savedFlow = { patrol: flow.patrol, waves: flow.waves, pursuitExtra: flow.pursuitExtra }; Object.assign(flow, { patrol: { gull: 0, hound: 0, soldier: 0 }, waves: flow.waves.map(() => ({ gull: 0, hound: 0, soldier: 0 })), pursuitExtra: 0 }); }
      else if (!enabled && savedFlow) { Object.assign(flow, savedFlow); savedFlow = null; }
    }
    G.liftAllow = enabled ? (link, from, to) => (S.plan ? liftRule(S.plan, S.stage, nav, link.id, from, to) : null) : null;
    G.stairBlock = enabled ? (run, dir) => (S.plan && dir === 'up' ? stairRule(S.plan, S.stage, run) : null) : null;
    // 路线指引也得知道哪些电梯、楼梯现在走不了（不然会指你去坐一部到不了那层的电梯）
    G.physics?.pathfinder?.setBlocked?.(enabled ? (c) => {
      if (!S.plan) return false;
      if (c.kind === 'lift') return !!liftRule(S.plan, S.stage, nav, c.link, c.from, c.to);
      const g = activeGate(S.plan, S.stage); if (!g) return false;
      const id = String(c.id).replace(/:reverse$/, '');
      return (g.slopes ||= new Set(runs.filter((r) => g.runs.includes(r.id)).flatMap((r) => r.slopes))).has(id);
    } : null);
    if (!enabled || !S.plan || director.state.mission !== S.mission) return;
    const heli = director.vehicles.heli; heli.root.visible = false;
    // 关卡的大件摆到楼梯口
    for (const g of S.plan.gates) { const b = gateBlock(g.type); b.position.set(g.model.x, g.model.y, g.model.z); b.rotation.y = g.model.yaw; root.add(b); blocks.push(b); g.block = b; }
    // 开局只有手枪和刀：步枪没子弹，拿到武器柜才有。原游戏在这之后还会把武器重置一遍（装满子弹），所以等开打的第一帧再改（loadout）
    S.loadout = !director.state.restore;
    // 从登机点重来（坐飞机时被打下来 / 阵亡）：前面的都算完成，直升机已经落好
    if (director.state.restore) { S.stage = S.plan.stages.length; for (const g of S.plan.gates) g.block.userData.clear(); S.landed = true; heli.root.visible = true; }
  }

  // ---- 响动、尸群 ----
  function addNoise(n, at = G.player?.pos) {
    if (!playing() || !(n > 0)) return;
    S.noise = Math.min(140, S.noise + n); S.quietT = 0;
    if (at) zombies.alert(at, SIEGE.noise.hear);
  }
  function horde(n, { mix = { walker: 0.5, runner: 0.4, bloater: 0.07, screamer: 0.03 }, at = null } = {}) {
    const p = G.player.pos; let made = 0;
    for (let k = 0; k < n * 6 && made < n; k++) {
      const q = at ? at[k % at.length] : G.physics.nav.randomPoint(p, 32);
      if (!q || (!at && Math.hypot(q.x - p.x, q.z - p.z) < 14)) continue;
      if (spawn(q, { hunt: true, mix, state: 'alert' })) made++;
    }
    zombies.alert(p, 45, true);
    return made;
  }
  function ambient(dt) {
    if ((S.spawnT -= dt) > 0) return;
    S.spawnT = SIEGE.ambient.every;
    const p = G.player.pos, st = G.physics.stateOf?.(p), floor = st?.floor || '', A = SIEGE.ambient;
    const target = floor === tower().roof ? (S.hold >= 0 ? 0 : A.roof) : floor.startsWith(`${tower().id}-`) ? A.tower + Math.min(3, S.stage >> 1) : A.mall + Math.min(4, S.stage);
    let near = 0;
    for (const z of zalive()) {
      const d = Math.hypot(z.pos.x - p.x, z.pos.z - p.z), dy = Math.abs(z.pos.y - p.y);
      if (!z.hunt && z.zs === 'idle' && (d > A.drop || dy > 9)) z._deactivate(); else if (dy < 4 && d < A.drop) near++;
    }
    if (near >= target) return;
    for (let k = 0; k < 6; k++) {
      const q = G.physics.nav.randomPoint(p, A.far), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < A.near) continue;
      const eye = new THREE.Vector3(p.x, p.y + 1.5, p.z), head = new THREE.Vector3(q.x, q.y + 1.5, q.z);
      if (k < 4 && G.physics.lineOfSight?.(eye, head)) continue; // 尽量别在眼前冒出来
      spawn(q, {}); return;
    }
  }

  // ---- 楼顶死守、直升机降落 ----
  const roofDoors = () => runs.filter((r) => r.to === tower().roof).map((r) => new THREE.Vector3(r.b.x, r.b.y, r.b.z));
  function holdTick(dt) {
    const heli = director.vehicles.heli;
    if (S.hold >= 0 && !S.landed && S.land < 0) {
      S.hold += dt;
      while (S.waveI < SIEGE.waves.length && S.hold >= SIEGE.waves[S.waveI]) { S.waveI++; const n = SIEGE.waveSize[0] + Math.floor(rng() * (SIEGE.waveSize[1] - SIEGE.waveSize[0] + 1)); horde(n, { at: roofDoors() }); say(`第 ${S.waveI} 波！楼梯口`, 2.2); }
      const left = Math.max(0, SIEGE.hold - S.hold);
      if (clockEl) { clockEl.classList.remove('off'); clockEl.textContent = `直升机 ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.ceil(left % 60)).padStart(2, '0')}`; }
      if (S.hold >= SIEGE.hold) { S.land = 0; heli.root.visible = true; G.hud?.radio?.('直升机到了，正在降落！到登机门去！', 4); if (clockEl) clockEl.textContent = '直升机降落中'; }
    }
    if (S.land >= 0 && !S.landed) {
      // 从正上方 45 米降下来
      S.land += dt;
      const k = Math.min(1, S.land / SIEGE.land), e = 1 - (1 - k) * (1 - k), pad = S.plan.pad;
      heli.setPose({ x: pad.x, y: padY() + 45 * (1 - e), z: pad.z, yaw: pad.yaw, pitch: 0, roll: 0 }, Math.sin(S.land * 6) * 0.03);
      if (k >= 1) { S.landed = true; heli.reset(); clockEl?.classList.add('off'); director.openExtraction(); G.game?.refreshObjective?.(); }
    }
  }

  // ---- 登机以后：清扫 ----
  function startSweep() {
    for (const z of zalive()) z._deactivate();
    const W = SIEGE.sweep, sw = { list: [], kill: { roof: 0, window: 0, ground: 0 }, total: { roof: W.roof, window: W.window, ground: W.ground }, made: { ground: 0 }, t: 0, tick: 0 };
    const tag = (z, group) => { if (z) { z.sweep = group; sw.list.push(z); } return z; };
    const doors = roofDoors(), pad = S.plan.pad;
    for (let i = 0; i < W.roof; i++) { const d = doors[i % doors.length], a = (i / W.roof) * 6.28; tag(spawn(new THREE.Vector3(d.x + Math.cos(a) * (1 + i * 0.35), d.y, d.z + Math.sin(a) * (1 + i * 0.35)), { hunt: true, kind: i === 0 ? 'screamer' : i % 4 === 1 ? 'runner' : 'walker' }), 'roof'); }
    for (const s of balconySpots(layout, nav, W.window, rng, tower())) {
      const g = balconyModel(); g.position.set(s.x, s.y, s.z); g.rotation.y = Math.atan2(-s.nz, s.nx); root.add(g); // 阳台模型朝 +x 伸出去，转到朝外
      const z = tag(spawn(new THREE.Vector3(s.x, s.y, s.z), { kind: 'walker', fixed: true, yaw: Math.atan2(s.nx, s.nz), passive: true }), 'window');
      balconies.push({ g, z, broken: false });
    }
    sw.ground = groundSpots(nav, layout, W.ground + 6, rng, tower());
    S.sweep = sw; S.noise = 0; noiseEl?.classList.add('off');
    void pad;
  }
  function sweepTick(dt, rideT) {
    const sw = S.sweep; if (!sw) return;
    sw.t = rideT;
    // 地面的分两批冲出来：起飞不久一批，降到低空再来一批（尖叫者混在里面）
    const W = SIEGE.sweep, want = rideT > S.flight.times.ground - 6 ? W.ground : rideT > 6 ? Math.ceil(W.ground / 2) : 0;
    if ((sw.tick -= dt) <= 0 && sw.made.ground < want) {
      sw.tick = 0.35;
      const s = sw.ground[sw.made.ground % sw.ground.length];
      // 尖叫者一共三只（屋顶一只、楼下两只），别的不会随机抽到它
      const z = spawn(new THREE.Vector3(s.x, s.y, s.z), { hunt: true, kind: sw.made.ground === 2 || sw.made.ground === 9 ? 'screamer' : sw.made.ground % 3 === 0 ? 'runner' : undefined, mix: { walker: 0.7, runner: 0.2, bloater: 0.1, screamer: 0 } });
      if (z) { z.sweep = 'ground'; sw.list.push(z); }
      sw.made.ground++;
    }
    // 清完了（该出来的都出来了、一个不剩）：飞走
    if (!S.flight.leaving && sw.made.ground >= W.ground && rideT > 12 && !sw.list.some((z) => z.alive && z.active)) { S.flight.setLeave(rideT + 1.2); G.hud?.radio?.('全部清掉了！返航。', 3); }
    else if (!S.flight.leaving && rideT > W.cap - 8) G.hud?.message?.('油不多了，准备返航', 2);
  }
  G.events?.on?.('enemy:hit', (ev) => { // 打到阳台里的：先把玻璃打碎
    const b = balconies.find((x) => x.z === ev?.enemy && !x.broken); if (!b) return;
    b.broken = true; b.g.userData.pane.visible = false;
    const at = b.g.userData.pane.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 5; i++) G.fx?.smoke?.(at.clone().add(new THREE.Vector3(0, (i - 2) * 0.4, (i % 3 - 1) * 0.6)), { size: 0.35, life: 0.5, color: 0xcfe6f2, rise: -1.2 });
    G.events?.emit?.('impact', { pos: at, surface: 'glass' });
  });
  G.events?.on?.('enemy:killed', (ev) => {
    const z = ev?.enemy; if (!S.sweep || !z?.sweep) return;
    S.sweep.kill[z.sweep]++; z.sweep = null; G.game?.refreshObjective?.();
  });

  // ---- 目标一步步放出来 ----
  function syncStage() {
    const relays = G.game?.run?.relays; if (!relays || !S.mission) return;
    const done = relays.filter((r) => r.cut).length;
    S.mission.objectives.forEach((o, i) => { o.locked = i !== done; if (o.object) o.object.visible = i <= done || o.kind === 'relay' && false; });
    if (done === S.stage) return;
    for (let i = S.stage; i < done; i++) finishStage(i);
    S.stage = done;
    G.game?.refreshObjective?.();
  }
  function finishStage(i) {
    const st = S.plan.stages[i];
    if (st.kind === 'locker') { try { G.rifle.ammo = SIEGE.ammo.rifle; G.rifle.reserve = SIEGE.ammo.reserve; } catch { /* 改不了就不改 */ } G.weapon?.select?.('rifle'); say('拿到步枪 · 30 / 90', 3); }
    if (st.kind === 'gate') S.plan.gates[st.gate].block?.userData.clear();
    if (st.kind === 'flare') { S.hold = 0; S.waveI = 0; }
    if (st.noise) { addNoise(st.noise); if (st.kind === 'switch') horde(7); }
  }
  /** 被堵的那段楼梯走不上去：人一踏进去就退回来 */
  function wall() {
    const g = activeGate(S.plan, S.stage), p = G.player.pos, st = G.physics.stateOf?.(p);
    if (!g || !st) return;
    const blocked = runs.filter((r) => g.runs.includes(r.id)), id = st.slope?.id, inside = blocked.some((r) => (id && r.slopes.includes(id)) || r.landings.includes(st.floor));
    if (!inside) { S.safe.copy(p); S.hasSafe = true; return; }
    if (S.hasSafe) { p.copy(S.safe); G.player.vel?.set?.(0, 0, 0); G.physics.forget?.(p); }
    if (S.tellT <= 0) { S.tellT = 2.5; say(stairRule(S.plan, S.stage, blocked[0]) || '上不去', 2.6); }
  }

  G.events?.on?.('weapon:fire', (e) => addNoise(e?.kind === 'pistol' ? SIEGE.noise.pistol : SIEGE.noise.rifle));
  G.events?.on?.('grenade:explode', (e) => addNoise(SIEGE.noise.grenade, e?.pos));
  G.events?.on?.('zombie:scream', (e) => { if (!playing() || director.riding) return; addNoise(30, e?.pos); horde(3 + Math.floor(rng() * 3)); say('尖叫者！它在招同伴', 2.2); });
  G.events?.on?.('zombie:burst', (e) => addNoise(18, e?.pos));

  const api = {
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; try { storage?.setItem?.('jimao-siege', enabled ? '1' : '0'); } catch { /* 存不了就不存 */ } },
    mission, reset, state: S, addNoise, horde,
    get plan() { return S.plan; },
    update(dt) {
      for (const b of blocks) b.userData.update?.(dt);
      if (enabled && S.loadout && director.state.mission === S.mission && (G.game?.state === 'playing' || G.game?.state === 'intro')) loadout();
      if (!playing() || director.state.mission !== S.mission) { noiseEl?.classList.add('off'); return; }
      S.tellT -= dt;
      syncStage();
      if (director.riding) { clockEl?.classList.add('off'); return; }
      wall(); ambient(dt); holdTick(dt);
      // 响动：安静一会儿才开始往下掉；攒满来一波
      S.hordeCool -= dt;
      if ((S.quietT += dt) > SIEGE.noise.quiet) S.noise = Math.max(0, S.noise - SIEGE.noise.decay * dt);
      if (S.noise >= SIEGE.noise.horde && S.hordeCool <= 0 && S.hold < 0) { S.noise = SIEGE.noise.after; S.hordeCool = SIEGE.noise.cooldown; const n = horde(6 + Math.min(5, S.stage)); if (n) { say('动静太大——尸群过来了！', 2.6); G.player.addShake?.(0.2); } }
      if (noiseEl) { noiseEl.classList.remove('off'); noiseEl.classList.toggle('hot', S.noise > 70); noiseEl.querySelector('b').style.width = `${Math.min(100, S.noise)}%`; }
    },
    dispose() { root.removeFromParent(); noiseEl?.remove(); clockEl?.remove(); G.liftAllow = null; G.stairBlock = null; },
  };
  return api;
}
