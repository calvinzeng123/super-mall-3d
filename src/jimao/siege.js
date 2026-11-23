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
import { findPath } from '../fps/pathfinding.js';
import { doorOutside } from './guide.js';
import { createPacing } from './pacing.js';
import { toW } from '../layout/geom.js';
import { RIDE_SPECS, rideLocalToWorld } from './ride-vehicles.js';
import { MALL, mallStages, inMallZone } from './siege-mall.js';
import { pointInPoly } from '../layout/geom.js';
import { DEFENSE, DEFENSE_CSS, sealSegments, buildSeals, createBarricades } from './siege-defense.js';
import { DEMOLISH, DEMOLISH_CSS, createDemolition } from './siege-demolish.js';
import { propMats, buildLocker, lockerDoors, buildSwitchCabinet, switchLever, buildTable, buildTool, buildFuseBox, fuseInserts, buildFlareKit, litFlare, buildDebris, buildFire, buildFireStatic, powderSheet, buildShutterFrame, buildShutterCurtain, buildDoorFrame, buildDoorLeaf, fireStep, SHUTTER, DOOR, FIRE, nosingY, propTop, beaconMesh, pickGlow, faceYaw, warmProps } from './siege-props.js';

export const SIEGE = Object.freeze({
  building: 'A', roof: 'A-RF', power: 'A-B1',
  pad: Object.freeze({ kind: 'helicopter', x: -35, z: -214, yaw: Math.PI }), // 公寓屋顶正中（屋面 38 × 74 米）
  arms: Object.freeze({ floor: 'P1-1F', x: -169, z: -90, where: '商场西翼保安室' }),
  // 开局在商场三层的一家店里（见 siege-mall.js）：先逃出店、三层找撬棍、二层拿手枪和门禁卡、发电，再下一层开武器柜
  // 手里拿什么跑多快（步枪、冲锋枪、榴弹枪是原速）；拿到步枪之前没有尸潮和特殊感染者，只有零星的行尸（quiet：同时最多几只）
  speed: Object.freeze({ knife: 1.16, pistol: 1.08 }), quiet: 5, alarm: 8,
  // 能走的范围：商场只有这几层，加上这一局那栋楼；别的地方走不出去（楼梯间 / 电梯厅经过别的楼层时，离这栋楼的楼梯口、电梯口 core 米以内不算）
  area: Object.freeze({ mall: Object.freeze(['P1-1F', 'P1-B1M', 'P1-B1']), core: 8 }),
  gates: Object.freeze([[4, 6], [9, 12], [15, 18]]), // 三道关各在哪几层里抽（公寓；别的楼见 TOWERS）
  // 楼顶死守：每 8 秒左右一波，一半从楼梯口冲上来、一半翻女儿墙上来（rim）；第 brutes 波各带一只巨尸，单数波再加一只特殊感染者
  hold: 70, waves: Object.freeze([2, 12, 22, 32, 42, 52, 60]), waveSize: [12, 16], rim: 0.35, brutes: Object.freeze([3, 6]), land: 6,
  // 最后 surge 秒：不再一波一波，隔 every 秒从楼梯口和女儿墙一起涌上来 each 只，直到直升机落下
  surge: Object.freeze({ last: 16, every: 1.4, each: 3 }),
  // 一层守点：撬开通往地下的卷帘要 seconds 秒；隔 every 秒从三个方向之一来 each 只
  holdout: Object.freeze({ seconds: 40, every: 6, each: 4 }),
  noise: Object.freeze({ rifle: 7, pistol: 5, smg: 2.5, launcher: 30, grenade: 45, switch: 70, pry: 40, panel: 25, spray: 20, card: 10, flare: 100, decay: 6, quiet: 1.5, horde: 100, after: 35, cooldown: 14, hear: 26 }),
  ambient: Object.freeze({ mall: 9, tower: 6, roof: 4, every: 0.9, near: 12, far: 30, drop: 58 }),
  // 清扫：屋顶（一半在楼梯口、一半沿着女儿墙）、阳台玻璃后面、楼下；它们会朝飞机扔东西（throw：多远以内扔、最快隔几秒一发、飞多久、几成砸中、一发顶几发子弹）
  sweep: Object.freeze({ roof: 14, window: 12, ground: 18, screamers: 3, cap: 150, throw: Object.freeze({ range: 85, every: 0.8, flight: 1.5, hit: 0.6, hits: 1.5, first: 9 }) }),
  ammo: Object.freeze({ rifle: 30, reserve: 90 }),
  // 被拍飞 / 掀飞以后：飞着撞上墙（一帧里速度掉一大半）再掉 wall 点血，落地掉 land 点；最多算 seconds 秒
  fling: Object.freeze({ wall: 12, land: 6, seconds: 2, fast: 5.5, stop: 0.45 }),
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
    pad: SIEGE.pad, gates: SIEGE.gates, weight: 0.65 }),
  T1: Object.freeze({ id: 'T1', name: '北区 1 号楼', roof: 'T1-RF', roofName: '北区 1 号楼楼顶', power: 'P1-B1', powerName: '北区 1 号楼地下一层电梯厅', lift: 'T1-ST-A', stair: 'T1-ST', mall: true,
    pad: Object.freeze({ kind: 'helicopter', x: -249.2, z: -232, yaw: Math.PI / 2 }), gates: Object.freeze([[9, 11], [14, 17], [20, 23]]), around: 'T2', weight: 0.35 }),
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
/** 门牌上的写法：复式写「17–18E」，平层写「10W」，公寓写「0401」（和 residence-interiors.js 的 homePlate 一致，玩家能对着门牌找） */
export function plateOf(code) {
  const id = String(code).replace(/-[LU]$/, '').split('-').at(-1), m = /^(\d{2})(\d{2})([A-Z])$/.exec(id);
  return m ? `${m[1]}–${m[2]}${m[3]}` : id;
}
/**
 * 这一层能放工具的住户房间：只要这一层有入户门的户。
 * 复式的上层在这一层没有门（门在下一层，上层只能从户内楼梯上来）——以前也算进来了，工具放进去玩家在走廊里怎么都找不到入口（用户在北区 17F / 15F 卡关）。
 * 落点在户里挑一个站得住的地方（正中被家具占了就往旁边找）。走不走得进去另外用 siteReachable 验（要寻路，慢，只对抽中的那一户验）。
 */
export function unitSites(layout, nav, floor) {
  const lv = layout.levels.find((l) => l.id === floor), out = [];
  for (const u of lv?.units || []) {
    const r = u.rects?.[0]; if (!r || !u.wfronts?.length || u.residence?.level === 'upper') continue;
    // 候选落点：先是户里靠中间的几处（要走进去找），最后是进门两三米的玄关（里面的门太窄、家具挡路时的保底）
    const spots = [], at = u.residence?.entryDoor?.at, lf = u.fronts?.[0];
    const local = [[0.5, 0.5], [0.5, 0.36], [0.36, 0.5], [0.64, 0.5], [0.5, 0.64], [0.32, 0.32], [0.68, 0.32], [0.32, 0.68], [0.68, 0.68]].map(([fx, fz]) => [r.x0 + (r.x1 - r.x0) * fx, r.z0 + (r.z1 - r.z0) * fz]);
    if (typeof at === 'number' && lf?.side === 'N') for (const d of [2.8, 2.1, 1.5]) local.push([at, r.z0 + d]);
    for (const [lx, lz] of local) {
      const [x, z] = toW(u.frame, lx, lz), st = landAt(nav, x, z, lv.elev + 0.6);
      if (st && st.floor === floor && clear(nav, st)) spots.push({ x: st.x, z: st.z });
    }
    if (!spots.length) continue;
    out.push({ floor, x: spots[0].x, y: lv.elev, z: spots[0].z, unit: u.id, name: `${plateOf(u.code || u.id)} 室`, spots }); // unit：路线指引要靠它找到这户的门
  }
  return out;
}
/** 这一户里第一个「从门外走廊走得到」的落点（门开着、没被家具堵死）；一个都走不到返回 null。要寻路，只对抽中的那一户算 */
export function reachSpot(layout, nav, site) {
  const door = doorOutside(layout, site, nav);
  if (!door) return null;
  for (const q of site.spots || [site]) if (findPath(nav, door, { floor: site.floor, x: q.x, z: q.z, y: site.y, slope: null })) return { floor: site.floor, x: q.x, y: site.y, z: q.z, unit: site.unit, name: site.name };
  return null;
}
export const siteReachable = (layout, nav, site) => !!reachSpot(layout, nav, site);
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
  const a = SIEGE.arms, mall = mallStages(layout, nav, rng);
  stages.push(...mall.stages);
  stages.push({ id: 'arms', kind: 'locker', floor: a.floor, site: { floor: a.floor, x: a.x, y: yOf(a.floor), z: a.z }, label: `武器柜 · ${a.where}`, verb: '打开武器柜', text: `门禁卡到手。下到一层，去${a.where}开武器柜拿步枪`, hud: `到${a.where}开武器柜`, noise: 0 });
  { // 一层守点：保安室门口三米外站得住的一点
    const y = yOf(a.floor); let hs = null;
    for (let k = 0; k < 12 && !hs; k++) { const ang = (k / 12) * Math.PI * 2, q = landAt(nav, a.x + Math.cos(ang) * 3, a.z + Math.sin(ang) * 3, y + 0.6); if (q && q.floor === a.floor && clear(nav, q)) hs = { floor: a.floor, x: q.x, y, z: q.z }; }
    hs ||= { floor: a.floor, x: a.x, y, z: a.z };
    stages.push({ id: 'holdout', kind: 'holdout', floor: a.floor, site: hs, label: '后门卷帘 · 保安室', verb: '开始撬门', text: `保安室后面有道卷帘通往地下，卡死了，撬开要 ${SIEGE.holdout.seconds} 秒。摆好路障，守住三个方向`, hud: `守住保安室 ${SIEGE.holdout.seconds} 秒`, noise: 20 });
  }
  const stop = lift.stops.find((q) => q.floor === tower.power) || lift.stops[0];
  const power = lobbySpot(nav, lift, tower.power, 3) || { floor: tower.power, x: stop.x, y: yOf(tower.power), z: stop.z };
  stages.push({ id: 'power', kind: 'switch', floor: tower.power, site: power, label: `配电柜 · ${tower.powerName}`, verb: '合上电闸', text: `${tower.name}停电了：到${tower.powerName}合闸，电梯才能用`, noise: SIEGE.noise.switch });
  const types = shuffle(Object.keys(GATES), rng).slice(0, tower.gates.length);
  tower.gates.forEach(([lo, hi], i) => {
    // 这一段里有住户房间可找工具的楼层才抽（北区塔楼有几层没有能进的户）
    const ok = []; for (let n = lo; n <= hi; n++) if (unitSites(layout, nav, floorOf(n, tower)).length && runs.some((r) => r.from === floorOf(n, tower) && r.id.startsWith(tower.stair))) ok.push(n);
    const n = ok[Math.floor(rng() * ok.length)], floor = floorOf(n, tower), type = types[i], T = GATES[type];
    // 抽一户：先随机排个序，取第一户从门外走得进去的（都不行就退回第一户，总比没有强）
    let room = null; const rooms = shuffle(unitSites(layout, nav, floor), rng);
    for (const q of rooms) if ((room = reachSpot(layout, nav, q))) break;
    room ||= rooms[0];
    const up = runs.filter((r) => r.from === floor && r.id.startsWith(tower.stair));
    const core = up[Math.floor(rng() * up.length)];
    const at = T.at === 'lobby' ? (lobbySpot(nav, lift, floor) || core.a) : core.a;
    stages.push({ id: `tool${i}`, kind: 'tool', gate: i, tool: T.tool, floor, site: room, label: `${T.tool} · ${n}F ${room.name}`, verb: `拿${T.tool}`, text: `${n}F：${T.name}。到 ${room.name}${T.find}`, hud: `${n}F · 到 ${room.name}${T.find}`, noise: 0 });
    stages.push({ id: `gate${i}`, kind: 'gate', gate: i, type, floor, site: { floor, x: at.x, y: yOf(floor), z: at.z }, label: `${T.name} · ${n}F`, verb: T.verb, text: `带着${T.tool}回${T.at === 'lobby' ? '电梯厅' : '楼梯口'}：${T.verb}`, noise: SIEGE.noise[T.noise] });
    gates.push({ type, floor, n, runs: up.map((r) => r.id), core: core.id, stage: stages.length - 1, model: { x: core.ea.x + core.da.x * 0.7, y: yOf(floor), z: core.ea.z + core.da.z * 0.7, yaw: Math.atan2(core.da.x, core.da.z) } });
  });
  // 信号弹：停机位旁边 7 米多、屋面上站得住的一点（屋顶窄的楼只有一两个方向放得下）
  const pad = tower.pad, ry = yOf(tower.roof);
  let flare = null;
  for (const [dx, dz] of [[7.5, 3], [-7.5, 3], [3, 7.5], [3, -7.5], [-7.5, -3], [7.5, -3], [-3, 7.5], [-3, -7.5]]) { const st = landAt(nav, pad.x + dx, pad.z + dz, ry + 0.6); if (st && st.floor === tower.roof && clear(nav, st)) { flare = { floor: tower.roof, x: pad.x + dx, y: ry, z: pad.z + dz }; break; } }
  flare ||= { floor: tower.roof, x: pad.x, y: ry, z: pad.z + 6 };
  stages.push({ id: 'flare', kind: 'flare', floor: tower.roof, site: flare, label: `信号弹 · ${tower.roofName}`, verb: '点燃信号弹', text: `上到${tower.roofName}，点信号弹叫直升机`, noise: SIEGE.noise.flare });
  const at = (id) => stages.findIndex((q) => q.id === id);
  return { tower, stages, gates, pad, flare, mall, armsStage: at('arms'), powerStage: at('power'), stageOf: at };
}

/** 现在走到第 stage 步（已经完成了 stage 步）时，哪一道关还拦着：没有了返回 null */
export function activeGate(plan, stage) { return plan.gates.find((g) => stage <= g.stage) || null; }
/** 电梯能不能从 from 层到 to 层（只管这一局那栋楼的电梯）。返回一句原因或 null */
export function liftRule(plan, stage, nav, linkId, from, to) {
  const tower = plan.tower || TOWERS.A;
  if (!String(linkId).startsWith(`${tower.id}-`)) return '全楼停电，这部电梯不动'; // 商场和别的楼的电梯一律不走（只能沿路线走）
  if (stage <= (plan.powerStage ?? 1)) return `${tower.name}停电了，电梯不动。先去${tower.powerName}合闸`;
  const g = activeGate(plan, stage), y = (f) => nav.floors.get(f)?.y ?? 0, g0 = plan.gates?.[0];
  if (g && g === g0 && Math.max(y(from), y(to)) > y(g.floor) + 0.1) return `电梯只能到 ${g.n}F：${GATES[g.type].lift}`;
  // 电梯只坐到第一道关那一层：再往上的电梯井被堵死了，一层层走楼梯上去（每层都有丧尸）
  if (g0 && Math.max(y(from), y(to)) > y(g0.floor) + 0.1) return `电梯只能到 ${g0.n}F——再往上井道堵死了，走楼梯一层层上去`;
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
export function siegeFlight(pad, padY, { box = { x0: pad.x - 19, x1: pad.x + 19, z0: pad.z - 37, z1: pad.z + 37 }, off = 24, speed = 7.5, lift = 4.5, out = 9, high = 12, low = 48, descend = 30, leave = 6, cap = SIEGE.sweep.cap } = {}) {
  let leaveAt = null, watch = null;
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  // 航线：楼的外轮廓（box）往外推 off 米的圆角矩形——离每一面墙、每一个角都是 off 米，不会擦着楼角过去。
  // 从东面正中出发往 −z 走（俯视顺时针），左舷一直朝楼
  const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2, hx = (box.x1 - box.x0) / 2, hz = (box.z1 - box.z0) / 2, arc = (Math.PI / 2) * off;
  const segs = [['l', hx + off, 0, 0, -1, hz], ['a', hx, -hz, 0], ['l', hx, -hz - off, -1, 0, 2 * hx], ['a', -hx, -hz, -Math.PI / 2], ['l', -hx - off, -hz, 0, 1, 2 * hz], ['a', -hx, hz, Math.PI], ['l', -hx, hz + off, 1, 0, 2 * hx], ['a', hx, hz, Math.PI / 2], ['l', hx + off, hz, 0, -1, hz]];
  const lap = 4 * (hx + hz) + 4 * arc;
  const pathAt = (d) => {
    d = ((d % lap) + lap) % lap;
    for (const g of segs) {
      const len = g[0] === 'l' ? g[5] : arc;
      if (d > len) { d -= len; continue; }
      if (g[0] === 'l') return { x: cx + g[1] + g[3] * d, z: cz + g[2] + g[4] * d, tx: g[3], tz: g[4] };
      const a = g[3] - d / off; // 圆角：角度从 g[3] 往小里走
      return { x: cx + g[1] + off * Math.cos(a), z: cz + g[2] + off * Math.sin(a), tx: Math.sin(a), tz: -Math.cos(a) };
    }
    return { x: cx + hx + off, z: cz, tx: 0, tz: -1 };
  };
  // 从离停机位最近的那一点切进航线
  let s0 = 0, best = Infinity; for (let d = 0; d < lap; d += 2) { const q = pathAt(d), e = Math.hypot(q.x - pad.x, q.z - pad.z); if (e < best) { best = e; s0 = d; } }
  const turn = lap / speed, top = padY + high, bottom = low; // 地面标高 0
  const orbitAt = (t) => {
    const tau = Math.max(0, t - lift), q = pathAt(s0 + speed * tau), k0 = smooth(tau / out);
    const k = smooth((tau - turn * 0.75) / descend), y = top + (bottom - top) * k + 1.5 * Math.sin(tau * 0.45);
    return { x: pad.x + (q.x - pad.x) * k0, y, z: pad.z + (q.z - pad.z) * k0, yaw: Math.atan2(q.tx, q.tz), pitch: 0.05, roll: -0.14 * Math.min(1, tau / 3), tx: q.tx, tz: q.tz, tau };
  };
  const yaw0 = Math.atan2(pathAt(s0).tx, pathAt(s0).tz), near = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a));
  // 炸楼时的观看圈：从 t0 那一刻的位置先拉高（ky），再往外飞到绕着整片楼慢慢转的大圈上（kx）；左舷（人坐的那一侧）一直朝着圈心
  const watchAt = (t) => {
    const W = watch, p0 = W.p0, u = t - W.t0, a = W.a0 - W.omega * u, tx = W.cx + W.R * Math.cos(a), tz = W.cz + W.R * Math.sin(a);
    const ky = smooth(u / W.climb), kx = smooth((u - W.climb * 0.6) / W.out), x = p0.x + (tx - p0.x) * kx, z = p0.z + (tz - p0.z) * kx;
    const yawT = Math.atan2(-(W.cz - z), W.cx - x);
    return { x, y: p0.y + (W.y - p0.y) * ky, z, yaw: p0.yaw + (near(p0.yaw, yawT) - p0.yaw) * smooth(u / (W.climb + W.out * 0.5)), pitch: 0.04, roll: -0.1, tx: Math.sin(a), tz: -Math.cos(a), phase: 'watch' };
  };
  const poseAt = (t) => {
    if (watch && t >= watch.t0) {
      if (leaveAt === null || t <= leaveAt) return watchAt(t);
      const p = watchAt(leaveAt), u = t - leaveAt, d = 12 * u + 4 * u * u;
      return { x: p.x + p.tx * d, y: p.y + 2 * u + 1.8 * u * u, z: p.z + p.tz * d, yaw: p.yaw, pitch: 0.14 * smooth(u / 1.5), roll: -0.1 * (1 - smooth(u / 2)), phase: 'leave' };
    }
    if (t < lift) { const k = smooth(t / lift); return { x: pad.x, y: padY + high * k, z: pad.z, yaw: pad.yaw + (near(pad.yaw, yaw0) - pad.yaw) * smooth((t - 0.8) / (lift - 0.8)), pitch: 0, roll: 0, phase: 'lift' }; }
    const end = leaveAt ?? cap;
    if (t <= end) { const p = orbitAt(t); return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, roll: p.roll, phase: p.tau < turn * 0.75 ? 'roof' : p.tau < turn * 0.75 + descend ? 'windows' : 'ground' }; }
    const p = orbitAt(end), u = t - end, d = speed * u + 4 * u * u;
    return { x: p.x + p.tx * d, y: p.y + 2 * u + 1.8 * u * u, z: p.z + p.tz * d, yaw: p.yaw, pitch: 0.14 * smooth(u / 1.5), roll: -0.14 * (1 - smooth(u / 2)), phase: 'leave' };
  };
  return { poseAt, center: { x: cx, z: cz }, box, off, lap, padY,
    duration: () => (leaveAt ?? cap) + leave,
    setLeave(t) { if (leaveAt === null) leaveAt = watch ? t : Math.min(cap, t); return leaveAt; },
    /** 炸楼：从 t0 起改飞观看圈（绕 center 半径 R、高 y，转一圈 turn 秒）；climb 秒拉高、out 秒飞到圈上 */
    setWatch(t0, { center, R = 260, y = 135, turn = 110, climb = 4, out = 12 } = {}) {
      if (watch || leaveAt !== null) return false;
      const p0 = poseAt(t0);
      watch = { t0, p0, cx: center.x, cz: center.z, R, y, omega: (Math.PI * 2) / turn, climb, out, a0: Math.atan2(p0.z - center.z, p0.x - center.x) };
      return true;
    },
    get watching() { return !!watch; },
    get leaving() { return leaveAt !== null; },
    phaseAt: (t) => poseAt(t).phase,
    times: { roof: lift, windows: lift + turn * 0.75, ground: lift + turn * 0.75 + descend } };
}

/** 绕飞要绕开的范围：这栋楼的外轮廓；旁边紧挨着的楼（tower.around，北区 2 号楼离 1 号楼只有 14 米）一起绕 */
export function flightBox(layout, tower) {
  const b = bounds(layout, tower); if (!tower.around) return b;
  const o = bounds(layout, { id: tower.around });
  return { x0: Math.min(b.x0, o.x0), x1: Math.max(b.x1, o.x1), z0: Math.min(b.z0, o.z0), z1: Math.max(b.z1, o.z1) };
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
  const floors = shuffle(all.filter((n, i) => i % 4 !== 3), rng).slice(0, count);
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
/** 物件上方一道细光柱：隔着半个大厅也看得见该去哪。从物件最高处往上一点起（不穿过物件本身），顶到离地 h + 0.2 米（至少 0.7 米长） */
function beacon(g, color = 'glow', h = 2.6, r = 0.05) { const y0 = propTop(g, r) + 0.1, b = beaconMesh(y0, Math.max(y0 + 0.7, h + 0.2), mats()[color].color.getHex()); g.add(b); return b; }
function setState(g, on) { g.traverse((o) => { if (o.userData.beacon) o.visible = on !== 'cut'; if (o.userData.cutHide) o.visible = on !== 'cut'; if (o.userData.cutShow) o.visible = on === 'cut'; }); }

// 物件本身怎么搭见 siege-props.js（按材质合并、共用图集）；这里只管各自的状态：cutHide / cutShow、灯的颜色、关卡解决时的动画。
const lens = () => (M.lens ||= new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12).rotateX(Math.PI / 2));
/** 一对指示灯：没完成时红灯亮，完成（cut）后绿灯亮；灭着的那只换成暗灯罩。green 不给：只有一只灯，红换绿（读卡器上那种双色灯） */
function lamps(g, red, green = null) {
  const P = propMats(), r = new THREE.Mesh(lens(), P.ledRed), gr = green ? new THREE.Mesh(lens(), P.lamp) : null;
  r.position.set(...red); g.add(r); if (gr) { gr.position.set(...green); g.add(gr); }
  const set = (s) => { const done = s === 'cut'; if (!gr) { r.material = done ? P.ledGreen : P.ledRed; return; } r.material = done ? P.lamp : P.ledRed; gr.material = done ? P.ledGreen : P.lamp; };
  set.meshes = gr ? [r, gr] : [r]; return set;
}
export function lockerModel() {
  const g = new THREE.Group(); g.name = '武器柜';
  buildLocker(g);
  const d = lockerDoors(); d.closed.userData.cutHide = true; d.open.userData.cutShow = true; d.open.visible = false; g.add(d.closed, d.open);
  const led = lamps(g, [0.065, 1.31, 0.3], [0.095, 1.31, 0.3]); led('in'); for (const m of led.meshes) m.userData.cutHide = true; // 电子锁在门上：门开了跟着门走
  beacon(g); g.userData.setState = (s) => { setState(g, s); led(s); }; return g;
}
export function switchModel() {
  const g = new THREE.Group(); g.name = '配电柜';
  buildSwitchCabinet(g);
  const off = switchLever(false); off.userData.cutHide = true; const on = switchLever(true); on.userData.cutShow = true; on.visible = false; g.add(off, on);
  const led = lamps(g, [0.22, 1.66, 0.258], [0.29, 1.66, 0.258]); led('in');
  beacon(g); g.userData.setState = (s) => { setState(g, s); led(s); }; return g;
}
/** 半路的手枪：搁在小边桌上 */
export function pistolModel() {
  const g = new THREE.Group(); g.name = '手枪';
  buildTable(g);
  const item = new THREE.Group(); item.position.set(0, 0.7175, 0); item.userData.cutHide = true; g.add(item);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.5, metalness: 0.6 }), grip = new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 0.85 });
  const part = (w, hh, d, x, y, z, m, rz = 0) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); q.position.set(x, y, z); q.rotation.z = rz; item.add(q); return q; };
  // 平放在桌上：套筒、握把、一个备用弹匣
  part(0.19, 0.03, 0.028, 0, 0.016, 0, dark); part(0.045, 0.03, 0.1, -0.06, 0.016, 0.055, grip); part(0.03, 0.02, 0.085, 0.13, 0.011, 0.03, dark);
  item.add(pickGlow(0.5)); beacon(g, 'glow', 2.6, 0.05);
  g.userData.setState = (st) => setState(g, st); return g;
}
/** 商场段那些小物件：桌上一件东西 / 墙边一个盒子 / 一个储物柜。只求看得出是什么，都带一道光柱（柜子除外：三个里哪个是对的不能让光柱说出来） */
const _pm = {};
const pm = (hex, o = {}) => (_pm[hex + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.3, ...o }));
const pbox = (g, w, h, d, x, y, z, m, ry = 0, rz = 0) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); q.rotation.set(0, ry, rz); g.add(q); return q; };
export function mallModel(kind, st = null, plan = null) {
  const g = new THREE.Group(); g.name = st?.label || kind;
  const item = new THREE.Group(); item.userData.cutHide = true; g.add(item);
  const steel = pm(0x8b9299, { metalness: 0.7, roughness: 0.4 }), dark = pm(0x1e2024), red = pm(0xb3261e), yellow = pm(0xd9a521), paper = pm(0xe9e4d4, { metalness: 0 });
  if (kind === 'crank') { // 手摇柄：一根 Z 形的曲柄，搁在小桌上
    buildTable(g); item.position.y = 0.7175;
    pbox(item, 0.3, 0.022, 0.022, 0, 0.012, 0, steel); pbox(item, 0.022, 0.022, 0.14, 0.15, 0.012, 0.06, steel); pbox(item, 0.12, 0.03, 0.03, 0.2, 0.014, 0.13, dark); pbox(item, 0.04, 0.03, 0.04, -0.15, 0.014, 0, dark);
  } else if (kind === 'shutter' || kind === 'open') { // 门边墙上的一个盒子：卷帘的摇把座 / 按钮盒
    const box = pbox(g, 0.2, 0.26, 0.1, 0, 1.2, 0, kind === 'open' ? yellow : steel);
    box.userData.keep = true; pbox(g, 0.05, 1.1, 0.05, 0, 0.55, 0, dark);
    pbox(item, 0.06, 0.06, 0.03, 0, 1.24, 0.06, kind === 'open' ? red : dark); const on = pbox(g, 0.06, 0.06, 0.03, 0, 1.24, 0.06, pm(0x35d07f, { emissive: 0x1c8a4c })); on.userData.cutShow = true; on.visible = false;
  } else if (kind === 'pry') { // 防火卷帘的锁座：地上一个挂锁盒
    pbox(g, 0.3, 0.14, 0.18, 0, 0.07, 0, dark); pbox(item, 0.12, 0.1, 0.05, 0, 0.19, 0, yellow);
  } else if (kind === 'note') { // 收银台上的值班表：一块写字板
    buildTable(g); item.position.y = 0.7175;
    pbox(item, 0.24, 0.012, 0.32, 0, 0.008, 0, pm(0x5b3d24, { metalness: 0 })); pbox(item, 0.2, 0.004, 0.27, 0, 0.017, 0.005, paper); pbox(item, 0.08, 0.02, 0.03, 0, 0.022, -0.14, steel);
  } else if (kind === 'rescue' || kind === 'holdout') { // 卷帘底下的锁座：撬的地方（地上一个挂锁盒，旁边一根撬棍）
    pbox(g, 0.34, 0.14, 0.18, 0, 0.07, 0, dark); pbox(item, 0.12, 0.1, 0.05, 0, 0.19, 0, red); pbox(g, 0.03, 0.03, 0.8, 0.28, 0.02, 0.1, steel, 0.4);
  } else if (kind === 'fuel') { // 油桶：一个红色的方桶，带提手和桶嘴
    pbox(item, 0.36, 0.46, 0.18, 0, 0.23, 0, red); pbox(item, 0.2, 0.04, 0.04, 0, 0.5, 0, dark); pbox(item, 0.05, 0.08, 0.05, 0.13, 0.5, 0, steel);
  } else if (kind === 'gen') { // 备用发电机：一个带把手的机箱，启动以后顶上的灯亮
    pbox(g, 0.9, 0.55, 0.55, 0, 0.36, 0, yellow); pbox(g, 0.96, 0.08, 0.6, 0, 0.05, 0, dark); pbox(g, 0.5, 0.2, 0.4, -0.1, 0.72, 0, dark); pbox(g, 0.06, 0.3, 0.06, 0.34, 0.78, 0.15, steel);
    pbox(item, 0.08, 0.05, 0.02, 0.2, 0.45, 0.285, red); const on = pbox(g, 0.1, 0.06, 0.1, 0.34, 0.96, 0.15, pm(0x35d07f, { emissive: 0x1c8a4c })); on.userData.cutShow = true; on.visible = false;
  }
  if (kind === 'card') return lockersModel(plan, g);
  beacon(g, 'glow', 2.6, 0.05);
  g.userData.setState = (q) => setState(g, q); return g;
}
/** 三个储物柜：模型的原点在对的那个柜子上（它是这一步的交互点），另外两个按 plan.mall.lockers 摆在旁边。柜门上各有一块号牌 */
function lockersModel(plan, g) {
  const L = plan?.mall?.lockers || [{ x: 0, z: 0, n: 1, right: true }], win = L.find((q) => q.right) || L[0];
  const body = pm(0x4f6b7a), door = pm(0x5f8194), plate = pm(0xf2efe6, { metalness: 0 });
  g.userData.lockers = [];
  for (const q of L) {
    const one = new THREE.Group(); one.position.set(q.x - win.x, 0, q.z - win.z); g.add(one);
    pbox(one, 0.5, 1.8, 0.45, 0, 0.9, 0, body); const d = pbox(one, 0.44, 1.7, 0.03, 0, 0.9, 0.235, door); pbox(one, 0.03, 0.12, 0.03, 0.16, 0.95, 0.26, pm(0x1e2024));
    // 号牌：几个小点（1、2、3 号各 1、2、3 个点；没有贴图也认得出）
    pbox(one, 0.2, 0.11, 0.01, 0, 1.5, 0.255, plate); for (let i = 0; i < q.n; i++) pbox(one, 0.03, 0.05, 0.012, (i - (q.n - 1) / 2) * 0.05, 1.5, 0.262, pm(0x1e2024));
    if (q.right) d.userData.cutHide = true; // 对的那个：拿了卡柜门开着
    g.userData.lockers.push({ group: one, door: d, n: q.n, right: q.right });
  }
  g.userData.plain = true; // 不转向（三个柜子的相对位置是按世界坐标摆的）
  g.userData.setState = (q) => setState(g, q); return g;
}
export function toolModel(tool) {
  const g = new THREE.Group(); g.name = tool;
  // 灭火器立在地上（放桌上反而假）；别的工具搁在小边桌上
  const floor = tool === '灭火器';
  if (!floor) buildTable(g);
  const item = new THREE.Group(); item.position.set(floor ? 0.22 : 0, floor ? 0 : 0.7175, 0); item.userData.cutHide = true; g.add(item);
  buildTool(item, tool); item.add(pickGlow(floor ? 0.7 : 0.5)); // 底下一小片光：拿走了跟着没
  beacon(g, 'glow', 2.6, floor ? 0.3 : 0.05); // 灭火器立在交互点旁边：光柱从瓶顶往上起，不从地面起
  g.userData.setState = (s) => setState(g, s); return g;
}
/** 关卡挡在那儿的东西：type 是 GATES 的键。交互点上只放小件（真正的大件摆在楼梯口，见 gateBlock）：
 * 跳闸 → 电梯厅里一个落地的分区配电箱（门敞着，熔断器座空着）；反锁 → 读卡器在防火门的门框上，交互点只留光柱 */
export function gateModel(type) {
  const g = new THREE.Group(); g.name = GATES[type].name;
  let led = null;
  if (type === 'fuse') { buildFuseBox(g); const f = fuseInserts(); f.userData.cutShow = true; f.visible = false; g.add(f); led = lamps(g, [0.17, 1.835, 0.06], [0.23, 1.835, 0.06]); led('in'); }
  beacon(g, 'glow', 2.2); g.userData.setState = (s) => { setState(g, s); led?.(s); }; return g;
}
/** 堵在楼梯口的大件：杂物 / 火 / 落下的卷帘栅门 / 关死的防火门。clear() 以后：杂物推到一边（+x）、火灭（烟再飘一会儿、地上留下干粉）、栅门收上去、门朝人这边转开。
 * 第一个子节点一直是会动的那一组（junk）。update(dt, G)：G 给了的话，火会照亮周围——人走近时借游戏灯池里的一盏灯（那四盏灯本来就一直在场景里、
 * 每个像素都在算，借一盏不多花一分钱；新加一盏灯则全场的着色器都要重编、每个像素多算一遍），走远了、火灭了还回去；dispose() 也还。 */
export function gateBlock(type) {
  const g = new THREE.Group(); g.name = `${GATES[type].name}（挡路）`;
  const junk = new THREE.Group(); g.add(junk);
  let fire = [], powder = null, led = null, coals = null, lamp = null, fade = 1;
  if (type === 'debris') buildDebris(junk);
  else if (type === 'fire') { fire = buildFire(junk); coals = junk.getObjectByName('coals'); buildFireStatic(g); powder = powderSheet(); powder.visible = false; g.add(powder); }
  else if (type === 'fuse') { buildShutterFrame(g); junk.position.y = SHUTTER.top; buildShutterCurtain(junk); }
  else { buildDoorFrame(g); junk.position.set(-DOOR.half, 0, DOOR.z); buildDoorLeaf(junk); led = lamps(g, [DOOR.half + 0.04, DOOR.bottom + 1.405, DOOR.z - 0.11]); led('in'); }
  const base = junk.position.clone(), at = new THREE.Vector3();
  let cleared = false, t = 0;
  const drop = () => { lamp?.release?.(); lamp = null; };
  /** 火光：借灯、摆到火堆上方、跟火苗一起闪；烟的亮度跟着停电 / 手电走 */
  function fireLight(G) {
    const L = FIRE.light, me = G?.player?.pos, B = G?.blackout;
    for (const m of fire) if (m.uniforms.uTorch) { const lv = B ? B.level : 0; m.uniforms.uTorch.value = lv * Math.min(1, (B?.gain ?? 1) * 1.6); m.uniforms.uDay.value = 1 - lv; }
    at.set(0, nosingY(L.z) + L.y, L.z); if (g.parent) { g.updateWorldMatrix(true, false); at.applyMatrix4(g.matrixWorld); }
    const want = !!(G?.render?.lightPool && me && g.parent && junk.visible && fade > 0.02 && Math.abs(me.y - at.y) < 3.5 && Math.hypot(me.x - at.x, me.z - at.z) < L.near);
    if (want && !lamp) lamp = G.render.lightPool.acquire?.() || null; // 池里没空的灯就算了，火照样烧
    if (!want) { drop(); return; }
    if (!lamp?.light) return;
    const flick = 0.78 + 0.12 * Math.sin(t * 9.7) + 0.06 * Math.sin(t * 23.3 + 1.1) + 0.04 * Math.sin(t * 41.0);
    lamp.light.color.set(L.color); lamp.light.distance = L.distance; lamp.light.position.copy(at);
    lamp.light.intensity = L.intensity * fade * flick;
  }
  g.userData.update = (dt, G = null) => {
    t += dt;
    if (type === 'fire' && junk.visible) fireStep(fire, t, cleared ? (m) => (m.name === 'siege-smoke' ? 1 - Math.min(1, g.userData.clearT / 6) : 1 - Math.min(1, g.userData.clearT / 1.2)) : null);
    if (type === 'fire') { fade = cleared ? 1 - Math.min(1, g.userData.clearT / 1.2) : 1; fireLight(G); }
    if (!cleared || !junk.visible) return;
    const c = (g.userData.clearT += dt), k = Math.min(1, c / 0.8), e = 1 - (1 - k) ** 3;
    if (type === 'debris') { junk.position.x = 1.6 * k; junk.rotation.z = -0.5 * k; }
    else if (type === 'fire') { if (c > 0.4) powder.visible = true; if (c > 0.7) coals.visible = false; if (c >= 6) junk.visible = false; }
    else if (type === 'fuse') junk.scale.y = 1 - 0.96 * Math.min(1, c / 1.6); // 卷帘慢慢收进卷筒箱
    else junk.rotation.y = 1.7 * e;
  };
  g.userData.clear = () => { cleared = true; g.userData.clearT = 0; led?.('cut'); };
  g.userData.reset = () => { cleared = false; t = 0; fade = 1; junk.visible = true; junk.position.copy(base); junk.rotation.set(0, 0, 0); junk.scale.setScalar(1); if (powder) powder.visible = false; if (coals) coals.visible = true; if (fire.length) fireStep(fire, 0, 1); led?.('in'); };
  g.userData.dispose = drop;
  return g;
}
export function flareModel() {
  const g = new THREE.Group(); g.name = '信号弹';
  buildFlareKit(g);
  const lit = litFlare(); lit.userData.cutShow = true; lit.visible = false; g.add(lit);
  let t = 0; g.userData.update = (dt) => { if (!lit.visible) return; t += dt; fireStep(lit.userData.mats, t); };
  beacon(g); g.userData.setState = (s) => setState(g, s); return g;
}
/** 一个阳台：楼板、两侧挡板、整面玻璃（pane）。朝 +x 伸出去 */
export function balconyModel() {
  const m = mats(), g = new THREE.Group(); g.name = '阳台';
  box(g, 1.5, 0.14, 2.6, 0, -0.07, 0, m.slab); box(g, 1.5, 0.1, 2.6, 0, 2.5, 0, m.slab); box(g, 1.5, 2.5, 0.08, 0, 1.25, -1.3, m.white); box(g, 1.5, 2.5, 0.08, 0, 1.25, 1.3, m.white); box(g, 0.06, 2.5, 2.6, -0.72, 1.25, 0, m.dark);
  const pane = box(g, 0.03, 2.4, 2.5, 0.72, 1.25, 0, m.glass); pane.castShadow = false; pane.renderOrder = 3;
  g.userData.pane = pane; return g;
}

export const SIEGE_CSS = DEFENSE_CSS + DEMOLISH_CSS + `
.jm-drop { position: absolute; z-index: 6; right: calc(24px + env(safe-area-inset-right)); top: 38%; width: 64px; height: 64px; border-radius: 50%; border: 2px solid #e0a33a; background: rgba(60, 36, 8, .78); color: #ffe7b8; font: 800 16px/1 'PingFang SC', ui-sans-serif, sans-serif; pointer-events: auto; touch-action: none; }
.jm-drop.off { display: none; }

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
/**
 * 补给放在哪（supplies.js 管捡和用）：武器柜旁一瓶止痛药；每间放工具的屋里一件投掷物加一样小东西；
 * 合闸、每清掉一道关——那儿就是安全点（倒下了从这里重来），柜子里有医疗包（配电室还有一把微声冲锋枪，第二道关那儿有一把榴弹枪——清掉这道关巨尸就来了）；楼顶信号弹旁边一个医疗包、一个弹匣。
 */
export const LOOT = Object.freeze({
  pistol: Object.freeze(['pills']), locker: Object.freeze(['pills']), holdout: Object.freeze(['ammo', 'frag']), switch: Object.freeze(['medkit', 'smg', 'pills']), flare: Object.freeze(['medkit', 'ammo', 'shell']),
  tool: Object.freeze([['fire', 'pills'], ['lure', 'ammo'], ['frag', 'pills'], ['fire', 'ammo']]),
  gate: Object.freeze([['medkit', 'ammo'], ['medkit', 'launcher', 'lure'], ['medkit', 'shell', 'fire']]),
});
/** 第 i 步的补给清单。纯函数 */
export function lootOf(plan, i) {
  const st = plan.stages[i]; if (!st) return [];
  if (st.kind === 'tool') return LOOT.tool[(Object.keys(GATES).indexOf(plan.gates[st.gate].type) + st.gate) % LOOT.tool.length];
  if (st.kind === 'gate') return LOOT.gate[st.gate % LOOT.gate.length];
  return LOOT[st.kind] || [];
}
/** site 旁边站得住的 n 个点（围着它转一圈找；找不到的就挨着放） */
export function lootSpots(nav, site, n) {
  const out = [];
  for (let k = 0; k < 12 && out.length < n; k++) {
    const a = k * 2.4 + 0.6, r = 0.95 + (k % 3) * 0.3, x = site.x + Math.cos(a) * r, z = site.z + Math.sin(a) * r, st = landAt(nav, x, z, site.y + 0.6);
    if (st && st.floor === site.floor && Math.abs(st.y - site.y) < 0.4 && clear(nav, st) && !out.some((q) => Math.hypot(q.x - x, q.z - z) < 0.5)) out.push({ x, y: st.y, z });
  }
  for (let k = out.length; k < n; k++) out.push({ x: site.x + 0.45 * (k + 1), y: site.y, z: site.z + 0.3 });
  return out;
}

export function createSiege(G, { layout, nav, scene, ui = null, zombies, director, runs, flow = null, rng = Math.random, storage = null, tower: forceTower = null, supplies = null }) {
  const root = new THREE.Group(); root.name = '丧尸围城'; scene?.add(root);
  const S = { bombAt: -1, plan: null, mission: null, stage: 0, noise: 0, quietT: 0, hordeCool: 0, spawnT: 0, hold: -1, waveI: 0, land: -1, landed: false, flight: null, sweep: null, safe: new THREE.Vector3(), hasSafe: false, tellT: 0, pin: null, bruteT: -1, brutes: 0, lastSpecial: '' };
  const blocks = [], balconies = [], acids = [];
  // 路障（人自己摆的沙袋墙）和封门的卷帘（见 siege-defense.js）
  const walls = createBarricades(G, { scene, zombies, ui });
  const demo = createDemolition(G, { scene, layout, ui });
  // 搬油桶：放在地上的那只桶（抬着的时候藏起来）；V 键 / 手机上的「放下」按钮
  const canMesh = mallModel('fuel'); canMesh.visible = false; root.add(canMesh);
  let wantDrop = false, dropBtn = null;
  const onDropKey = (e) => { if (e.code === 'KeyV' && !e.repeat && enabled && G.game?.state === 'playing') wantDrop = true; };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onDropKey);
  if (ui && typeof document !== 'undefined') {
    dropBtn = document.createElement('button'); dropBtn.type = 'button'; dropBtn.className = 'jm-drop off'; dropBtn.textContent = '放下';
    const down = (e) => { e.preventDefault(); e.stopPropagation(); wantDrop = true; };
    dropBtn.addEventListener('touchstart', down, { passive: false }); dropBtn.addEventListener('click', down); ui.append(dropBtn);
  }
  const rocks = [];
  let seals = null, steps = [], shopSeal = null, closedShops = [];
  /** 这一点在卷帘拉下的店里（丧尸不从那儿冒出来） */
  const shut = (q) => !!q && closedShops.some((c) => Math.abs((nav.floors.get(c.floor)?.y ?? 0) - q.y) < 2 && pointInPoly([q.x, q.z], c.poly));
  // 尸潮的节奏（pacing.js）：平静 → 升温 → 尸潮 → 喘息；特殊感染者按名额放
  const pacing = createPacing(rng);
  let enabled = false, noiseEl = null, clockEl = null, savedFlow = null;
  try { enabled = storage?.getItem?.('jimao-siege') === '1'; } catch { enabled = false; }
  if (enabled) warmProps(); // 物件的几何体趁加载时分帧建好（见 siege-props.js warmProps）
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

  /** 物件转个向（见 faceYaw）：正面朝人过来的那边（from：开局点 / 同一层的另一个目标），量不出来就背靠墙、或者朝开阔的一边。
   * 在交互点离地 1 米处往一圈方向打物理射线量能走多远；没有物理（节点测试）就不转 */
  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  function orient(g, site, from = null) {
    const P = G.physics;
    if (!P?.raycast || !site) return g;
    _o.set(site.x, (site.y ?? 0) + 1.0, site.z);
    const dx = from ? from.x - site.x : 0, dz = from ? from.z - site.z : 0, toward = from && Math.hypot(dx, dz) > 1 && Math.hypot(dx, dz) < 60 ? Math.atan2(dx, dz) : null;
    g.rotation.y = faceYaw((x, z) => { const h = P.raycast(_o, _d.set(x, 0, z), 4); return h && Number.isFinite(h.dist) ? h.dist : 4; }, { toward });
    return g;
  }
  /** 人多半从哪边走到这个目标：武器柜——开局点；配电柜——这层的电梯口；工具和关卡——同一层的另一个（到了这层先经过关卡处，再进屋找工具，拿了再回来） */
  const cameFrom = (plan, st) => {
    if (st.kind === 'locker' || st.kind === 'pistol') return G.level?.playerStart?.pos || null;
    if (st.kind === 'switch') return nav?.links?.find((l) => l.id === plan.tower?.lift)?.stops?.find((q) => q.floor === st.floor) || null; // 配电柜：人从这层的电梯口过来
    return plan.stages.find((q) => q !== st && q.floor === st.floor && (q.kind === 'tool' || q.kind === 'gate'))?.site || null;
  };
  /** 任务系统每局来要一次 */
  function mission(r = rng) {
    const T = pickTower(r(), forceTower), plan = siegePlan(r, layout, nav, runs, T), pad = plan.pad;
    S.plan = plan;
    const flight = siegeFlight(pad, padY(), { box: flightBox(layout, T) });
    const door = rideLocalToWorld(pad, 0, RIDE_SPECS.helicopter.doorOut);
    const objectives = plan.stages.map((st, i) => ({ id: st.id, label: st.label, verb: st.verb, kind: (st.obj || (st.kind === 'tool' ? 'item' : 'relay')) === 'item' ? 'item' : 'relay', site: st.site, locked: i > 0,
      model: () => (st.kind === 'card' ? mallModel('card', st, plan) : ['crank', 'shutter', 'open', 'pry', 'note', 'gen', 'rescue', 'holdout', 'fuel', 'escort', 'sneak'].includes(st.kind) ? orient(mallModel(st.kind, st, plan), st.site, cameFrom(plan, st)) : st.kind === 'crowbar' ? orient(toolModel('撬棍'), st.site, cameFrom(plan, st)) : null) || orient(st.kind === 'pistol' ? pistolModel() : st.kind === 'locker' ? lockerModel() : st.kind === 'switch' ? switchModel() : st.kind === 'tool' ? toolModel(st.tool) : st.kind === 'gate' ? gateModel(st.type) : flareModel(), st.site, cameFrom(plan, st)) }));
    const s0 = plan.mall.start;
    const m = { type: 'siege', title: '丧尸围城', objectives, kills: 0, plan, start: { pos: new THREE.Vector3(s0.x, s0.y, s0.z), yaw: Math.atan2(-(plan.stages[1].site.x - s0.x), -(plan.stages[1].site.z - s0.z)) },
      extraction: { id: 'heli', label: '直升机', where: T.roofName, floor: T.roof, x: +door.x.toFixed(2), z: +door.z.toFixed(2), radius: 1.7, vehicle: pad, closed: true,
        blocked: '直升机还没到', orbit: { center: flight.center, pad }, flight,
        ride: { boardRadio: '上机！机枪交给你：屋顶上的、阳台玻璃后面的、楼下冲出来的，全部清掉。它们会朝飞机扔东西，尖叫的伤得最重，先打。', onBoard: startSweep, spawns: sweepTick, targets: () => (S.sweep ? S.sweep.list.filter((z) => z.alive && z.active) : []), keep: () => true, outroCam: (pose) => (demo.chosen ? null : roofEdge(pose)),
          // 选了炸楼：机外镜头换到远处、时间拉长，看着楼垮完
          // 炸楼是在飞机上看完的（观看圈）；最后离开那几秒照常切机外镜头（楼都垮了，不用再架在楼顶边上）
          outroTick: (dt) => { if (demo.running) demo.tick(dt); }, outroTitle: () => (demo.chosen ? '<b>大楼已炸毁</b>直升机已离开云澜汇上空' : null),
          ground: (s0) => landAt(nav, s0.x, s0.z, s0.y)?.y ?? 0 } }, // 坠机落在哪：正下方最高的那层楼面（楼顶 / 商场屋面 / 街上）
      text: (c, ride) => textNow(c, ride), markers: () => [],
      radio: { intro: '这里是指挥中心。商场已经沦陷，地面出不去。你们被困在三层的店里，手上只有刀。先想办法出去，一层一层往下摸到保安室拿枪，再上公寓楼顶，直升机到那儿接你。'.replace('公寓楼顶', T.roofName) + (G.squad?.wanted ? '保安阿哲和林医生跟你一起走，互相照应。' : ''),
        contact: '它们发现你了！', cut: plan.stages.slice(0, -1).map((st, i) => cutLine(plan, i)), all: `信号弹点着了！直升机 ${SIEGE.hold} 秒后到，守住屋顶！`, low: '你被咬伤了，拉开距离。', done: '指挥中心收到。幸存者已撤离云澜汇——干得漂亮。' } };
    S.plan = plan; S.mission = m; S.flight = flight;
    return m;
  }
  const cutLine = (plan, i) => { const st = plan.stages[i], next = plan.stages[i + 1]; return `${({ crank: '手摇柄找到了。', shutter: '卷帘起来了——它们进来了！', crowbar: '撬棍到手。', pry: '撬开了，下二层。', note: '值班表找到了。', card: '门禁卡到手。', gen: `发电机打着了，动静不小——守住 ${MALL.gen.seconds} 秒，等它带起来！`, open: '卷帘开了。', rescue: '卷帘撬开了，里面是个店员，叫小许——他吓坏了，跟紧你。', escort: '到扶梯口了，小许安全了。', sneak: '摸过来了。', fuel: '油桶抬起来了——抬着不能开枪，按 V 放下。', holdout: `开始撬了，${SIEGE.holdout.seconds} 秒——它们从三个方向过来了！` })[st.kind] || ''}${st.kind === 'pistol' ? '手枪到手，跑得比拿刀慢一点。' : st.kind === 'locker' ? '步枪到手——柜子的警报响了，它们全过来了！守住！' : st.kind === 'switch' ? '电来了，电梯能用了——动静不小，它们过来了。' : st.kind === 'tool' ? `${st.tool}到手。` : st.kind === 'gate' ? `${GATES[st.type].name}解决了。` : ''}${next ? next.text + '。' : ''}`; };
  function textNow(c, ride) {
    if (ride?.over) return demo.chosen ? '大楼已炸毁 · 返航' : '清扫完毕 · 返航';
    if (ride && S.sweep) { const w = S.sweep; return `清扫 · 屋顶 ${w.kill.roof}/${w.total.roof} · 阳台 ${w.kill.window}/${w.total.window} · 楼下 ${w.kill.ground}/${w.total.ground}`; }
    if (c.allCut) return S.landed ? `登机 · ${tower().roofName}直升机` : S.hold >= 0 ? '守住屋顶，等直升机' : '等直升机';
    // 屏幕上的目标用短句（长句在平板上折成两行，压住罗盘和响动条）；完整的那句无线电里会说
    const st = S.plan.stages[Math.min(S.stage, S.plan.stages.length - 1)]; return st.hud || st.text;
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
    // 只有刀：手枪要到服务台捡，步枪在武器柜里（从安全点重来时前面拿过的照给）
    const P = S.plan, lock = []; if (S.stage <= P.stages.findIndex((q) => q.kind === 'pistol')) lock.push('pistol'); if (S.stage <= P.armsStage) lock.push('rifle');
    try { if (G.rifle && lock.includes('rifle')) { G.rifle.ammo = 0; G.rifle.reserve = 0; } G.weapon?.lock?.(lock); if (!lock.length) G.weapon?.select?.('rifle'); } catch { /* 改不了就算了 */ }
  }
  function reset() {
    for (const b of blocks.splice(0)) { b.userData.dispose?.(); b.removeFromParent(); }
    for (const b of balconies.splice(0)) b.g.removeFromParent();
    for (const a of acids.splice(0)) a.dispose();
    for (const r of rocks.splice(0)) r.m.removeFromParent();
    demo.reset();
    pacing.reset();
    walls.reset(); walls.enabled = enabled; seals?.dispose(); seals = null; for (const q of steps.splice(0)) q.seal.dispose(); shopSeal?.dispose(); shopSeal = null; closedShops = []; canMesh.visible = false; G.squad?.leave?.('xu'); G.arms?.setLowered?.(0);
    // 血不会自己回（原游戏的缓慢回血只在零点突围里留着）；医疗包、止痛药、地上的补给只有这个模式有
    G.noRegen = enabled; G.speedMul = 1; if (!enabled) G.weapon?.lock?.([]);
    if (supplies) { supplies.enabled = enabled; supplies.reset(); }
    Object.assign(S, { bombAt: -1, look: null, carry: false, canAt: null, dropT: 0, carryT: 0, sleepers: null, sneakSaid: false, escortT: 0, holdT: 0, holdSpawn: 0, holdDirs: null, holdK: 0, surgeT: 0, surgeSaid: false, stage: 0, noise: 0, quietT: 0, hordeCool: 6, spawnT: 2, hold: -1, waveI: 0, land: -1, landed: false, sweep: null, hasSafe: false, hasInside: false, cores: null, genT: 0, genSpawn: 0, popped: null, tellT: 0, loadout: false, pin: null, fling: null, bruteT: -1, brutes: 0, lastSpecial: '' });
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
    // 范围往外的门口、扶梯口全部落闸
    {
      const T = tower(), A = SIEGE.area, F = MALL.floors, M = S.plan.mall;
      const all = (f) => A.mall.includes(f) || f === F.top || f === F.mid || f === T.power || String(f).startsWith(`${T.id}-`);
      seals = buildSeals(root, sealSegments(nav, all));
      // 一步步放开的三处：开局那家店的店面；三层下二层的扶梯口；二层下一层的扶梯口
      const slopesAt = (lo, hi) => sealSegments({ floors: nav.floors, portals: [], slopes: nav.slopes.filter((q) => q.low === lo && q.high === hi) }, (f) => f === hi);
      const y3 = nav.floors.get(F.top)?.y ?? 0;
      steps = [
        { until: 'exit', seal: buildSeals(root, M.shop.fronts.map((f) => ({ x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, y: y3, h: DEFENSE.seal.height, kind: 'door' }))) },
        { until: 'pry', seal: buildSeals(root, slopesAt(F.mid, F.top)) },
        { until: 'open', seal: buildSeals(root, slopesAt(F.ground, F.mid)) },
      ];
      // 商场这几层没用上的店：卷帘全拉下来，进不去（以前店面是敞着的，哪家都能钻进去）
      const sites = S.plan.stages.map((q) => q.site), keep = new Set([M.shop.id, ...(M.shops || [])]), segs = [], rescueSegs = [];
      for (const lv of layout.levels) {
        if (![F.top, F.mid, F.ground].includes(lv.id)) continue;
        for (const u of lv.units) {
          if (u.residence || keep.has(u.id) && u.id !== M.rescue?.unit) continue;
          const poly = u.polys?.[0]; if (!poly) continue;
          if (u.id !== M.rescue?.unit && sites.some((q) => q.floor === lv.id && pointInPoly([q.x, q.z], poly))) continue;
          closedShops.push({ floor: lv.id, poly });
          for (const f of u.wfronts || []) (u.id === M.rescue?.unit ? rescueSegs : segs).push({ x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, y: lv.elev, h: DEFENSE.seal.height, kind: 'door' });
        }
      }
      shopSeal = buildSeals(root, segs);
      if (rescueSegs.length) steps.push({ until: 'rescue', seal: buildSeals(root, rescueSegs) });
    }
    // 关卡的大件摆到楼梯口
    for (const g of S.plan.gates) { const b = gateBlock(g.type); b.position.set(g.model.x, g.model.y, g.model.z); b.rotation.y = g.model.yaw; root.add(b); blocks.push(b); g.block = b; }
    // 开局只有手枪和刀：步枪没子弹，拿到武器柜才有。原游戏在这之后还会把武器重置一遍（装满子弹），所以等开打的第一帧再改（loadout）
    S.loadout = !director.state.restore; S.kit = null;
    const keep = director.state.restore;
    if (keep?.kind === 'safe') {
      // 从安全点重来：存档那一步之前的都算完成（不再触发当时的响动、尸潮），那之前的关卡已经清开；身上的东西等开打第一帧再还（S.kit）
      S.stage = Math.min(S.plan.stages.length, keep.stage);
      for (const g of S.plan.gates) if (g.stage < S.stage) g.block.userData.clear();
      S.kit = keep.kit || null; S.rifleKeep = keep.rifle || null; S.hordeCool = 14;
      stock(S.stage - 1); for (let i = S.stage; i < S.plan.stages.length; i++) if (S.plan.stages[i].kind !== 'switch' && S.plan.stages[i].kind !== 'gate') stock(i);
      return;
    }
    if (!keep) for (let i = 0; i < S.plan.stages.length; i++) if (S.plan.stages[i].kind !== 'switch' && S.plan.stages[i].kind !== 'gate') stock(i);
    // 从登机点重来（坐飞机时被打下来 / 阵亡）：前面的都算完成，直升机已经落好
    if (director.state.restore) { S.stage = S.plan.stages.length; for (const g of S.plan.gates) g.block.userData.clear(); S.landed = true; heli.root.visible = true; }
  }

  /** 把第 i 步的补给摆出来 */
  function stock(i) {
    const st = S.plan?.stages[i]; if (!supplies || !st) return;
    const list = lootOf(S.plan, i), spots = lootSpots(nav, st.site, list.length);
    list.forEach((kind, k) => supplies.place(kind, spots[k]));
  }
  /** 合闸、清掉一道关：这里就是安全点。记下位置和身上的东西，倒下了从这儿重来 */
  function checkpoint(i) {
    const p = G.player, st = S.plan.stages[i]; if (!p?.pos) return;
    director.state.checkpoint = { kind: 'safe', stage: i + 1, start: { pos: p.pos.clone(), yaw: p.yaw || 0 }, label: st.kind === 'switch' ? '配电室' : `${S.plan.gates[st.gate].n}F 安全点`, kit: supplies?.snapshot?.() || null, rifle: G.rifle ? [G.rifle.ammo | 0, G.rifle.reserve | 0] : null };
    stock(i); G.squad?.rally?.();
    G.hud?.radio?.('这儿暂时安全。倒下了从这里重来——柜子里有补给，拿上再走。', 4.5);
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
      if (!q || (!at && (Math.hypot(q.x - p.x, q.z - p.z) < 14 || shut(q)))) continue;
      if (spawn(q, { hunt: true, mix, state: 'alert' })) made++;
    }
    zombies.alert(p, 45, true);
    return made;
  }
  function ambient(dt) {
    if ((S.spawnT -= dt) > 0) return;
    S.spawnT = SIEGE.ambient.every;
    const p = G.player.pos, st = G.physics.stateOf?.(p), floor = st?.floor || '', A = SIEGE.ambient;
    const base = floor === tower().roof ? (S.hold >= 0 ? 0 : A.roof) : floor.startsWith(`${tower().id}-`) ? A.tower + Math.min(3, S.stage >> 1) : A.mall + Math.min(4, S.stage);
    const calm = S.stage <= S.plan.armsStage; // 还没拿到步枪：只有零星的行尸
    const target = calm ? (phase() === 0 || S.plan.stages[S.stage]?.kind === 'sneak' ? 0 : SIEGE.quiet) : Math.round(base * pacing.ambient); // 平静时少、升温时多、喘息时不补
    let near = 0;
    for (const z of zalive()) {
      const d = Math.hypot(z.pos.x - p.x, z.pos.z - p.z), dy = Math.abs(z.pos.y - p.y);
      if (!z.hunt && z.zs === 'idle' && (d > A.drop || dy > 9)) z._deactivate(); else if (dy < 4 && d < A.drop) near++;
    }
    if (near >= target) return;
    for (let k = 0; k < 6; k++) {
      const q = G.physics.nav.randomPoint(p, A.far), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < A.near || shut(q)) continue;
      const eye = new THREE.Vector3(p.x, p.y + 1.5, p.z), head = new THREE.Vector3(q.x, q.y + 1.5, q.z);
      if (k < 4 && G.physics.lineOfSight?.(eye, head)) continue; // 尽量别在眼前冒出来
      spawn(q, calm ? { kind: 'walker' } : {}); return;
    }
  }

  // ---- 特殊感染者 ----
  const specialsAlive = () => zalive().filter((z) => z.special).length;
  /** 在人周围找一个看不见的地方放一只（near–far 米）；都看得见就退而求其次 */
  function hidden(nearD = 14, farD = 30) {
    const p = G.player.pos, eye = new THREE.Vector3(p.x, p.y + 1.5, p.z); let fallback = null;
    for (let k = 0; k < 10; k++) {
      const q = G.physics.nav.randomPoint(p, farD); if (!q) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < nearD || Math.abs(q.y - p.y) > 4 || shut(q)) continue;
      fallback ||= q;
      if (!G.physics.lineOfSight?.(eye, new THREE.Vector3(q.x, q.y + 1.5, q.z))) return q;
    }
    return fallback;
  }
  function spawnSpecial() {
    const cap = S.hold >= 0 ? 2 : pacing.specialCap;
    if (specialsAlive() >= cap) return null;
    // 商场里先见到胖尸、尖叫者、扑袭者；进了楼再加喷酸者。不连着来同一种
    const kinds = (S.stage >= 2 ? ['bloater', 'screamer', 'lunger', 'lunger', 'spitter', 'spitter'] : ['bloater', 'screamer', 'lunger']).filter((k) => k !== S.lastSpecial);
    const kind = kinds[Math.floor(rng() * kinds.length)], q = hidden();
    if (!q) return null;
    const z = spawn(q, { kind, hunt: true, state: 'alert' });
    if (z) S.lastSpecial = kind;
    return z;
  }
  function spawnBrute(at = null) {
    const q = at || hidden(16, 30); if (!q) return null;
    const z = spawn(q, { kind: 'brute', hunt: true, state: 'alert' });
    if (z) { S.brutes++; G.hud?.radio?.('巨尸！别让它近身——打头，边退边打。', 4); say('巨尸来了', 2.6); G.player.addShake?.(0.3); G.events?.emit?.('enemy:telegraph', { enemy: z, pos: z.pos, type: 'soldier', scream: true }); }
    return z;
  }
  /** 被扑袭者按住：人钉在原地（还能转头、开枪、出刀），它死了或咬够了才松 */
  /** 被巨尸拍飞 / 被胖尸掀飞：飞着撞墙、落地各再掉一次血 */
  function flingTick(dt) {
    const f = S.fling; if (!f) return;
    const p = G.player, F = SIEGE.fling, sp = Math.hypot(p.vel?.x || 0, p.vel?.z || 0);
    f.t += dt;
    if (p.onGround === false) f.air = true;
    if (!f.wall && f.prev > F.fast && sp < f.prev * F.stop) { f.wall = true; p.damage?.(F.wall, null); p.addShake?.(0.5); say('撞到墙上了！', 1.4); G.events?.emit?.('player:slam', { kind: 'wall', damage: F.wall }); }
    else if (f.air && f.t > 0.25 && p.onGround !== false) { if (!f.wall) { p.damage?.(F.land, null); p.addShake?.(0.3); G.events?.emit?.('player:slam', { kind: 'land', damage: F.land }); } S.fling = null; return; }
    f.prev = sp;
    if (f.t > F.seconds) S.fling = null;
  }
  function pinTick() {
    const pin = S.pin; if (!pin) return;
    if (!pin.by.alive || !pin.by.active || pin.by.zs !== 'pin') { S.pin = null; return; }
    const p = G.player.pos; p.x = pin.x; p.z = pin.z; G.player.vel?.set?.(0, G.player.vel.y < 0 ? G.player.vel.y : 0, 0);
    if ((pin.tell -= 1 / 60) <= 0) { pin.tell = 1.2; say('被扑袭者按住了！近战键捅它，或者开枪', 1.3); }
  }
  /** 喷酸者的一口酸：先飞一段抛物线，落地成一滩，人站在里面每半秒掉一次血 */
  const acidMat = new THREE.MeshBasicMaterial({ color: 0x4f9a1c, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const acidBall = new THREE.SphereGeometry(0.16, 8, 6), acidDisc = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  function spit(e) {
    const ball = new THREE.Mesh(acidBall, acidMat), pool = new THREE.Mesh(acidDisc, acidMat);
    pool.visible = false; pool.position.set(e.to.x, e.to.y + 0.04, e.to.z); pool.scale.setScalar(0.01); root.add(ball, pool);
    acids.push({ from: e.from.clone(), to: e.to.clone(), t: 0, flight: e.flight, radius: e.radius, seconds: e.seconds, dps: e.dps, ball, pool, tick: 0,
      dispose() { ball.removeFromParent(); pool.removeFromParent(); } });
  }
  function acidTick(dt) {
    const p = G.player.pos;
    for (let i = acids.length - 1; i >= 0; i--) {
      const a = acids[i]; a.t += dt;
      if (a.t < a.flight) { const k = a.t / a.flight; a.ball.position.lerpVectors(a.from, a.to, k); a.ball.position.y += Math.sin(k * Math.PI) * 2.2; continue; }
      if (!a.pool.visible) { a.ball.visible = false; a.pool.visible = true; G.fx?.smoke?.(a.to, { size: 0.9, life: 1.1, color: 0x6fae2a, rise: 0.5 }); addNoise(6, a.to); }
      const age = a.t - a.flight, grow = Math.min(1, age / 0.35), fade = Math.min(1, (a.seconds - age) / 1.2);
      a.pool.scale.setScalar(a.radius * grow * (0.94 + 0.06 * Math.sin(a.t * 7)));
      if (age >= a.seconds) { a.dispose(); acids.splice(i, 1); continue; }
      a.pool.visible = fade > 0.02;
      if (Math.hypot(p.x - a.to.x, p.z - a.to.z) < a.radius && Math.abs(p.y - a.to.y) < 1.4 && (a.tick -= dt) <= 0) { a.tick = 0.5; G.player.damage?.(a.dps * 0.5, a.to); if (S.tellT <= 0) { S.tellT = 2.5; say('酸液！别站在里面', 1.6); } }
    }
  }

  // ---- 楼顶死守、直升机降落 ----
  const roofDoors = () => runs.filter((r) => r.to === tower().roof).map((r) => new THREE.Vector3(r.b.x, r.b.y, r.b.z));
  /** 屋顶四边、女儿墙里侧站得住的 n 个点（翻墙上来的、清扫时站在边上朝飞机扔东西的） */
  function roofRim(n) {
    const { x0, x1, z0, z1 } = bounds(layout, tower()), y = padY(), out = [], pad = S.plan?.pad;
    for (let k = 0; k < n * 14 && out.length < n; k++) {
      const side = Math.floor(rng() * 4), u = rng(), x = side === 0 ? x0 + 1.4 : side === 1 ? x1 - 1.4 : x0 + 2 + u * (x1 - x0 - 4), z = side === 2 ? z0 + 1.4 : side === 3 ? z1 - 1.4 : z0 + 2 + u * (z1 - z0 - 4);
      const st = landAt(nav, x, z, y + 0.6);
      if (!st || st.floor !== tower().roof || !clear(nav, st) || (pad && Math.hypot(x - pad.x, z - pad.z) < 7) || out.some((o) => Math.hypot(o.x - x, o.z - z) < 1.6)) continue;
      out.push(new THREE.Vector3(x, st.y, z));
    }
    return out;
  }
  function holdTick(dt) {
    const heli = director.vehicles.heli;
    if (S.hold >= 0 && !S.landed && S.land < 0) {
      S.hold += dt;
      while (S.waveI < SIEGE.waves.length && S.hold >= SIEGE.waves[S.waveI]) {
        S.waveI++;
        const n = SIEGE.waveSize[0] + Math.floor(rng() * (SIEGE.waveSize[1] - SIEGE.waveSize[0] + 1)), over = Math.round(n * SIEGE.rim), rim = roofRim(over);
        // 越往后奔尸越多；一半从楼梯口冲上来，一半翻女儿墙上来（四面都有，守不住一个口子）
        const mix = { walker: Math.max(0.2, 0.45 - S.waveI * 0.03), runner: 0.45 + S.waveI * 0.03, bloater: 0.07, screamer: 0.03 };
        horde(n - rim.length, { at: roofDoors(), mix }); if (rim.length) horde(rim.length, { at: rim, mix });
        say(rim.length ? `第 ${S.waveI} 波！楼梯口和女儿墙` : `第 ${S.waveI} 波！楼梯口`, 2.2);
        if (SIEGE.brutes.includes(S.waveI)) spawnBrute(roofDoors()[S.waveI % roofDoors().length]);
        else if (S.waveI % 2 === 1 && S.waveI > 1) spawnSpecial();
      }
      // 最后十几秒：一刻不停地涌上来
      if (S.hold > SIEGE.hold - SIEGE.surge.last && (S.surgeT -= dt) <= 0) {
        S.surgeT = SIEGE.surge.every; const mix = { walker: 0.25, runner: 0.7, bloater: 0.05, screamer: 0 }, rim = roofRim(1);
        horde(SIEGE.surge.each - rim.length, { at: roofDoors(), mix }); if (rim.length) horde(rim.length, { at: rim, mix });
        if (!S.surgeSaid) { S.surgeSaid = true; say('它们全涌上来了——顶住！', 2.6); G.player.addShake?.(0.3); }
      }
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
    const W = SIEGE.sweep, sw = { list: [], kill: { roof: 0, window: 0, ground: 0 }, total: { roof: 0, window: 0, ground: W.ground }, made: { ground: 0 }, t: 0, tick: 0, throwT: W.throw.first, offered: false };
    const tag = (z, group) => { if (z) { z.sweep = group; sw.list.push(z); sw.total[group] += group === 'ground' ? 0 : 1; } return z; };
    // 屋顶：一半从楼梯口追出来，一半已经站在女儿墙边上（都在露天，飞机上看得见）
    const doors = roofDoors(), rim = roofRim(Math.floor(W.roof / 2)), atDoor = W.roof - rim.length;
    for (let i = 0; i < atDoor; i++) { const d = doors[i % doors.length], a = (i / atDoor) * 6.28; tag(spawn(new THREE.Vector3(d.x + Math.cos(a) * (1 + i * 0.35), d.y, d.z + Math.sin(a) * (1 + i * 0.35)), { hunt: true, kind: i === 0 ? 'screamer' : i % 4 === 1 ? 'runner' : 'walker' }), 'roof'); }
    rim.forEach((q, i) => tag(spawn(q, { hunt: true, kind: i % 3 === 0 ? 'runner' : 'walker' }), 'roof'));
    // 楼里的：都在阳台的玻璃后面（窗边），不在看不见的屋里
    for (const s of balconySpots(layout, nav, W.window, rng, tower())) {
      const g = balconyModel(); g.position.set(s.x, s.y, s.z); g.rotation.y = Math.atan2(-s.nz, s.nx); root.add(g); // 阳台模型朝 +x 伸出去，转到朝外
      const z = tag(spawn(new THREE.Vector3(s.x, s.y, s.z), { kind: 'walker', fixed: true, yaw: Math.atan2(s.nx, s.nz), passive: true }), 'window');
      balconies.push({ g, z, broken: false });
    }
    sw.ground = groundSpots(nav, layout, W.ground + 6, rng, tower());
    S.sweep = sw; S.noise = 0; noiseEl?.classList.add('off');
  }
  const rockGeo = new THREE.DodecahedronGeometry(0.28, 0), rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.95 }), gobMat = new THREE.MeshBasicMaterial({ color: 0x86c53a, toneMapped: false });
  /** 一只丧尸朝飞机扔一块东西（楼上的扔碎砖，楼下的吐酸）：飞 flight 秒，砸中了掉耐久 */
  function hurl(z, rideT) {
    const T = SIEGE.sweep.throw, c = G.missions?.vehicleCenter?.(); if (!c) return;
    const b = balconies.find((x) => x.z === z && !x.broken); if (b) breakPane(b); // 阳台里的先把玻璃砸了
    const at = S.flight.poseAt(rideT + T.flight), hit = rng() < T.hit, miss = hit ? 0 : 5 + rng() * 5, a = rng() * 6.28;
    const from = new THREE.Vector3(z.pos.x, z.pos.y + 1.7, z.pos.z), to = new THREE.Vector3(at.x + Math.cos(a) * miss, at.y + 1.2 + (hit ? 0 : -2), at.z + Math.sin(a) * miss);
    const m = new THREE.Mesh(rockGeo, z.sweep === 'ground' ? gobMat : rockMat); m.position.copy(from); root.add(m);
    rocks.push({ m, from, to, t: 0, life: T.flight, hit, by: z });
  }
  function rocksTick(dt) {
    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i]; r.t += dt; const k = Math.min(1, r.t / r.life);
      r.m.position.lerpVectors(r.from, r.to, k); r.m.position.y += Math.sin(k * Math.PI) * 4; r.m.rotation.x += dt * 9; r.m.rotation.z += dt * 6;
      if (k < 1) continue;
      const c = G.missions?.vehicleCenter?.();
      if (r.hit && c) { // 砸在机身上：从来的方向算一发（顶 hits 发子弹）
        const dir = c.clone().sub(r.from).normalize();
        G.events?.emit?.('enemy:fire', { enemy: r.by, pos: c.clone().addScaledVector(dir, -3.5), dir, type: 'zombie', hits: SIEGE.sweep.throw.hits });
        G.player?.addShake?.(0.12);
      }
      r.m.removeFromParent(); rocks.splice(i, 1);
    }
  }
  function sweepTick(dt, rideT) {
    const sw = S.sweep; if (!sw) return;
    sw.t = rideT; rocksTick(dt); demo.tick(dt);
    if (S.bombAt >= 0 && rideT >= S.bombAt && !demo.running) { demo.start(); G.hud?.radio?.('炸弹投下！', 2.5); }
    if (S.flight.watching) watchLook(dt);
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
    const live = sw.list.filter((z) => z.alive && z.active);
    // 它们会还手：离飞机 range 米以内的轮流朝飞机扔东西，剩得越少扔得越稀
    if (!S.flight.leaving && (sw.throwT -= dt) <= 0) {
      const c = G.missions?.vehicleCenter?.(), T = W.throw;
      const near = c ? live.filter((z) => z.kind !== 'screamer' && Math.hypot(z.pos.x - c.x, z.pos.y - c.y, z.pos.z - c.z) < T.range) : [];
      if (near.length) { hurl(near[Math.floor(rng() * near.length)], rideT); sw.throwT = T.every * Math.max(1, 8 / near.length) * (0.8 + rng() * 0.4); if (!sw.told) { sw.told = true; G.hud?.radio?.('它们在朝飞机扔东西！先打扔得凶的。', 3); } }
      else sw.throwT = 0.5;
    }
    // 清完了（该出来的都出来了、一个不剩）：先问要不要炸楼，不炸（或者时间到了）就返航；炸的话拉高飞走，机外镜头看着楼垮
    if (!S.flight.leaving && sw.made.ground >= W.ground && rideT > 12 && !live.length) {
      if (!sw.offered) { sw.offered = true; demo.offer(); G.hud?.radio?.('全部清掉了！指挥中心授权空袭——要不要把这几栋楼一起炸掉？', 4); }
      else if (demo.chosen) { // 不切机外镜头：飞机拉高、绕着整片楼转一大圈，人坐在机舱门口自己转头看
        const W = DEMOLISH.watch; S.flight.setWatch(rideT, { center: { x: W.center[0], z: W.center[1] }, R: W.R, y: W.y, turn: W.turn }); S.flight.setLeave(rideT + W.seconds); S.bombAt = rideT + W.delay;
        G.hud?.radio?.('空袭批准！拉高，离开爆炸范围——从舱门往外看。', 4);
      }
      else if (!demo.offered) { S.flight.setLeave(rideT + 1.2); G.hud?.radio?.('返航。', 3); }
    }
    else if (!S.flight.leaving && rideT > W.cap - 8) G.hud?.message?.('油不多了，准备返航', 2);
  }
  /** 炸楼时：视角慢慢转向正在垮的楼（人一动鼠标 / 手指就让开，停手 1.5 秒后再慢慢转回去） */
  function watchLook(dt) {
    const p = G.player, eye = G.camera?.position, W = DEMOLISH.watch; if (!p || !eye) return;
    const L = S.look ||= { set: null, idle: 9 };
    if (L.set && (Math.abs(p.yaw - L.set.yaw) > 1e-4 || Math.abs(p.pitch - L.set.pitch) > 1e-4)) L.idle = 0; // 自己转过头了
    L.idle += dt;
    if (L.idle > 1.5) {
      const dx = W.center[0] - eye.x, dz = W.center[1] - eye.z, dy = 25 - eye.y, yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const k = 1 - Math.exp(-dt * 1.6 * Math.min(1, (L.idle - 1.5) / 1.5));
      p.yaw += Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)) * k; p.pitch += (pitch - p.pitch) * k;
    }
    L.set = { yaw: p.yaw, pitch: p.pitch };
  }
  function breakPane(b) {
    b.broken = true; b.g.userData.pane.visible = false;
    const at = b.g.userData.pane.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 5; i++) G.fx?.smoke?.(at.clone().add(new THREE.Vector3(0, (i - 2) * 0.4, (i % 3 - 1) * 0.6)), { size: 0.35, life: 0.5, color: 0xcfe6f2, rise: -1.2 });
    G.events?.emit?.('impact', { pos: at, surface: 'glass' });
  }
  G.events?.on?.('enemy:hit', (ev) => { const b = balconies.find((x) => x.z === ev?.enemy && !x.broken); if (b) breakPane(b); }); // 打到阳台里的：先把玻璃打碎
  G.events?.on?.('enemy:killed', (ev) => {
    const z = ev?.enemy; if (!S.sweep || !z?.sweep) return;
    S.sweep.kill[z.sweep]++; z.sweep = null; G.game?.refreshObjective?.();
  });

  // ---- 目标一步步放出来 ----
  function syncStage() {
    const relays = G.game?.run?.relays; if (!relays || !S.mission) return;
    const done = relays.filter((r) => r.cut).length;
    S.mission.objectives.forEach((o, i) => { const k = S.plan.stages[i]?.kind; o.locked = i !== done || (S.genT > 0 && k === 'open') || (S.holdT > 0 && k === 'switch'); o.ghost = k === 'escort' || k === 'sneak' || (k === 'gen' && !!S.plan.mall.fuel && !S.carry); if (o.object) o.object.visible = i <= done || S.plan.stages[i]?.kind === 'card'; }); // 三个储物柜一直看得见（没看值班表也能去开——开错了后果自负）
    if (done <= S.stage) return; // 少了：还没来得及把存档点之前的目标补上（missions.js 的 restoreCheckpoint），等它
    for (let i = S.stage; i < done; i++) finishStage(i);
    S.stage = done;
    G.game?.refreshObjective?.();
  }
  function finishStage(i) {
    const st = S.plan.stages[i];
    if (st.kind === 'pistol') { G.weapon?.unlock?.('pistol'); say('拿到手枪', 2.6); }
    // 分阶段的卷帘：这一步做完，对应的那一道收起来
    for (const q of steps) if (q.until === st.id && q.seal.mesh) q.seal.mesh.visible = false;
    if (st.kind === 'shutter') { // 门外拍门的那几只进来了
      const sh = S.plan.mall.shop, f = sh.fronts[0];
      if (f) for (let i = 0; i < MALL.out; i++) { const t = (i + 1) / (MALL.out + 1); spawn({ x: f.x0 + (f.x1 - f.x0) * t + f.nx * (2.5 + i * 0.6), y: st.site.y, z: f.z0 + (f.z1 - f.z0) * t + f.nz * (2.5 + i * 0.6) }, { kind: 'walker', hunt: true, state: 'alert' }); }
      say('它们进来了！', 2.2);
    }
    if (st.kind === 'gen') { S.genT = MALL.gen.seconds; S.genSpawn = 1.5; S.carry = false; S.canAt = null; canMesh.visible = false; G.arms?.setLowered?.(0); }
    if (st.kind === 'rescue') { // 小许从店里出来，跟着你；门外几只听见动静过来了
      const R = S.plan.mall.rescue; G.squad?.join?.('xu', R.inside);
      for (let k = 0; k < 3; k++) { const q = hidden(9, 22); if (q) spawn(q, { kind: k ? 'walker' : 'runner', hunt: true, state: 'alert' }); }
      S.escortT = MALL.rescue.every;
    }
    if (st.kind === 'pry' && G.squad?.guest) { G.hud?.radio?.('小许：我就躲在扶梯底下等直升机……你们小心！', 4); G.squad.leave?.('xu'); }
    if (st.kind === 'fuel') { S.carry = true; S.carryT = MALL.fuel.every; }
    if (st.kind === 'holdout') { S.holdT = SIEGE.holdout.seconds; S.holdSpawn = 1; S.holdK = 0; S.holdDirs = holdDirs(st.site); }
    { const n = DEFENSE.give[st.kind === 'gate' && st.gate === S.plan.gates.length - 1 ? 'flare' : st.kind] || 0; if (n && walls.give(n)) G.hud?.radio?.(`拿到 ${n} 个路障（按 B 摆在面前）：丧尸冲过来会被挡一阵。`, 4); }
    if (st.kind === 'locker') {
      try { G.rifle.ammo = SIEGE.ammo.rifle; G.rifle.reserve = SIEGE.ammo.reserve; } catch { /* 改不了就不改 */ }
      G.weapon?.unlock?.('pistol', { equip: false }); if (!G.weapon?.unlock?.('rifle')) G.weapon?.select?.('rifle'); say('拿到步枪 · 30 / 90', 3);
      // 柜子的警报：第一波尸潮从这儿开始（之前只有零星的行尸）
      addNoise(60); horde(SIEGE.alarm); S.hordeCool = SIEGE.noise.cooldown; say('警报响了——尸潮！', 2.6); G.player.addShake?.(0.25);
    }
    if (st.kind === 'gate') S.plan.gates[st.gate].block?.userData.clear();
    if (st.kind === 'gate' && st.gate === 1) S.bruteT = 7; // 第二道关一清：楼里有个大家伙被惊动了
    if (st.kind === 'flare') { S.hold = 0; S.waveI = 0; }
    if (st.noise) { addNoise(st.noise); if (st.kind === 'switch') horde(7); }
    if (st.kind === 'switch' || st.kind === 'gate') checkpoint(i);
  }
  /** 只能在路线上走：商场那几层和这一局的那栋楼。走出去了（上了商场二层、出了大门、进了别的楼）就退回刚才站的地方 */
  const cores = () => (S.cores ||= [...nav.links.filter((l) => String(l.id).startsWith(`${tower().id}-`)).flatMap((l) => l.stops), ...runs.filter((r) => r.id.startsWith(tower().stair)).flatMap((r) => [{ floor: r.from, x: r.a.x, z: r.a.z }, { floor: r.to, x: r.b.x, z: r.b.z }])]);
  /** 走到哪一步，能去哪儿：还没摇开卷帘——只在那家店里；没撬开扶梯口——只在三层那一片；没按开二层的卷帘——二、三层；之后加上商场一层往下和这栋楼 */
  const phase = () => { const P = S.plan, at = P.stageOf; return S.stage <= at('exit') ? 0 : S.stage <= at('pry') ? 1 : S.stage <= at('open') ? 2 : 3; };
  function inArea(st, ph = phase()) {
    const f = st?.floor; if (!f) return true; // 在坡道 / 楼梯上：算
    if (closedShops.some((c) => c.floor === f && pointInPoly([st.x, st.z], c.poly))) return false; // 卷帘拉下的店
    const T = tower(), A = SIEGE.area, M = S.plan.mall, F = MALL.floors;
    if (ph === 0) return f === F.top && (!M.shop.poly || pointInPoly([st.x, st.z], M.shop.poly));
    if (f === F.top && inMallZone(S.plan.stages, f, st.x, st.z)) return true;
    if (f === F.mid && ph >= 2 && inMallZone(S.plan.stages, f, st.x, st.z)) return true;
    if (ph < 3) return false;
    if (A.mall.includes(f) || f === T.power || f.startsWith(`${T.id}-`)) return true;
    return cores().some((c) => c.floor === f && Math.hypot(c.x - st.x, c.z - st.z) < A.core);
  }
  function leash() {
    const p = G.player.pos, st = G.physics.stateOf?.(p); if (!st) return;
    if (inArea({ floor: st.floor, x: p.x, z: p.z })) { (S.inside ||= new THREE.Vector3()).copy(p); S.hasInside = true; return; }
    if (S.hasInside) { p.copy(S.inside); G.player.vel?.set?.(0, 0, 0); G.physics.forget?.(p); }
    if (S.tellT <= 0) { S.tellT = 2.5; const shut = closedShops.some((c) => c.floor === st.floor && pointInPoly([p.x, p.z], c.poly)); say(phase() === 0 ? '卷帘落着，出不去——先找手摇柄' : shut ? '卷帘锁着，进不去' : '这边出不去——照着路线走', 2.4); }
  }
  /** 发电机带起来之前：轰隆隆地响，隔几秒从看不见的地方来几只；倒计时走完才能去按卷帘 */
  function genTick(dt) {
    if (!(S.genT > 0)) return;
    S.genT -= dt;
    if (clockEl) { clockEl.classList.remove('off'); clockEl.textContent = `发电机 00:${String(Math.max(0, Math.ceil(S.genT))).padStart(2, '0')}`; }
    if ((S.genSpawn -= dt) <= 0) { S.genSpawn = MALL.gen.every; for (let i = 0; i < MALL.gen.each; i++) { const q = hidden(10, 26); if (q) spawn(q, { kind: i ? 'walker' : 'runner', hunt: true, state: 'alert' }); } }
    if (S.genT <= 0) { S.genT = 0; clockEl?.classList.add('off'); G.hud?.radio?.('发电机带起来了！回扶梯口按开卷帘。', 4); G.game?.refreshObjective?.(); }
  }
  /** 三个储物柜：走到不对的那个跟前（值班表看没看都一样），柜门弹开、里面扑出来一只 */
  function lockersTick() {
    const P = S.plan, i = P.stageOf('card'); if (S.stage > i) return;
    const p = G.player.pos, obj = S.mission?.objectives[i]?.object;
    for (const q of P.mall.lockers) {
      if (q.right || (S.popped ||= new Set()).has(q.n) || Math.abs(p.y - q.y) > 1.5 || Math.hypot(p.x - q.x, p.z - q.z) > 1.0) continue;
      S.popped.add(q.n);
      const L = obj?.userData?.lockers?.find((k) => k.n === q.n); if (L) L.door.visible = false;
      spawn({ x: q.x, y: q.y, z: q.z }, { kind: 'runner', hunt: true, state: 'alert' }); addNoise(20, q);
      say(S.stage < i ? '柜子里扑出来一只！先看值班表再开' : `不是这个——是 ${P.mall.lockers.find((k) => k.right).n} 号`, 2.6); G.player.addShake?.(0.2);
    }
  }
  // ---- 商场段的几种玩法 ----
  const curKind = () => S.plan?.stages[S.stage]?.kind;
  const autoCut = () => { G.game?.debugCut?.(); syncStage(); };
  /** 护送：小许跟着你；隔一阵从看不见的地方来两只，附近追着人的丧尸先扑他；他到了扶梯口（没倒地）就算到 */
  function escortTick(dt) {
    if (curKind() !== 'escort') return;
    const st = S.plan.stages[S.stage], R = MALL.rescue, xu = G.squad?.guest;
    if (G.squad?.join && !xu) G.squad.join('xu', G.player.pos); // 读档 / 重开：人跟回来
    const who = xu || { pos: G.player.pos, down: false };
    if ((S.escortT -= dt) <= 0) {
      S.escortT = R.every;
      for (let k = 0; k < R.each; k++) { const q = hidden(10, 24); if (q) spawn(q, { kind: k ? 'walker' : 'runner', hunt: true, state: 'alert' }); }
    }
    if (xu && !xu.down) for (const z of zalive()) if (z.zs === 'chase' && Math.abs(z.pos.y - xu.pos.y) < 2 && Math.hypot(z.pos.x - xu.pos.x, z.pos.z - xu.pos.z) < 12) z.distract?.(xu.pos, 0.5);
    if (xu?.down && S.tellT <= 0) { S.tellT = 3; say('小许倒了！过去扶他', 2.4); }
    if (!who.down && Math.abs(who.pos.y - st.site.y) < 1.5 && Math.hypot(who.pos.x - st.site.x, who.pos.z - st.site.z) < R.arrive) autoCut();
  }
  /** 潜行：一路站着发呆的丧尸。跑、不蹲着走、开枪都会攒响动；攒满全醒；走到哪只跟前，那只和旁边几只醒 */
  function sneakTick(dt) {
    if (curKind() !== 'sneak') return;
    const K = MALL.sneak, st = S.plan.stages[S.stage], p = G.player, P = p.pos;
    if (!S.sleepers) { // 进到这一步：摆好尸群
      S.sleepers = [];
      const a = S.plan.mall.sneak.from, b = S.plan.mall.sneak.to, L = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      for (let k = 0; k < K.count * 12 && S.sleepers.length < K.count; k++) {
        const t = 0.2 + rng() * 0.7, off = (rng() * 2 - 1) * K.band, x = a.x + ux * L * t - uz * off, z = a.z + uz * L * t + ux * off;
        const q = landAt(nav, x, z, a.y + 0.6); if (!q || q.floor !== a.floor || !clear(nav, q)) continue;
        if (S.sleepers.some((o) => Math.hypot(o.pos.x - q.x, o.pos.z - q.z) < K.gap) || Math.hypot(q.x - b.x, q.z - b.z) < 3 || Math.hypot(q.x - a.x, q.z - a.z) < 4) continue;
        const z0 = spawn(new THREE.Vector3(q.x, q.y, q.z), { kind: 'walker', passive: true, yaw: rng() * Math.PI * 2 });
        if (z0) { z0.sleeper = true; S.sleepers.push(z0); }
      }
      if (!S.sneakSaid) { S.sneakSaid = true; G.hud?.radio?.('前面一大片……都站着不动。蹲下（C）慢慢摸过去，别跑、别开枪。', 5); }
    }
    const v = Math.hypot(p.vel?.x || 0, p.vel?.z || 0), crouch = !!(p.crouching || G.input?.crouch);
    if (!crouch && v > 1.2) { S.noise = Math.min(140, S.noise + (v > 5 ? K.run : K.walk) * dt); S.quietT = 0; }
    const wake = (z) => { if (!z.sleeper || !z.alive) return; z.sleeper = false; z.passive = false; z.alert?.(P, true); };
    if (S.noise >= K.wake) { let n = 0; for (const z of S.sleepers) if (z.sleeper && z.alive) { wake(z); n++; } if (n) { say('它们醒了——快跑！', 2.6); G.player.addShake?.(0.2); } }
    for (const z of S.sleepers) {
      if (!z.sleeper || !z.alive || Math.abs(z.pos.y - P.y) > 1.5) continue;
      if (Math.hypot(z.pos.x - P.x, z.pos.z - P.z) < (crouch ? K.closeCrouch : K.close)) { for (const o of S.sleepers) if (Math.hypot(o.pos.x - z.pos.x, o.pos.z - z.pos.z) < K.group) wake(o); say('惊醒了几只！', 1.8); break; }
    }
    if (Math.abs(P.y - st.site.y) < 1.5 && Math.hypot(P.x - st.site.x, P.z - st.site.z) < K.arrive) autoCut();
  }
  /** 搬油桶：抬着放低武器（开不了枪）、走得慢；V 放下，回来走到跟前自动抬起；抬着的时候隔几秒来两只 */
  function carryTick(dt) {
    const fuelAt = S.plan.stageOf('fuel'), genAt = S.plan.stageOf('gen');
    const busy = S.plan.mall.fuel && S.stage > fuelAt && S.stage <= genAt;
    dropBtn?.classList.toggle('off', !(busy && S.carry && G.input?.touch));
    if (!busy) { wantDrop = false; return; }
    const P = G.player.pos;
    if (S.carry) {
      G.arms?.setLowered?.(1);
      if (wantDrop) { wantDrop = false; S.carry = false; S.dropT = 1.2; S.canAt = P.clone(); canMesh.position.copy(P); canMesh.visible = true; G.arms?.setLowered?.(0); say('油桶放下了——打完回来抬', 2); G.game?.refreshObjective?.(); }
      if ((S.carryT -= dt) <= 0) { S.carryT = MALL.fuel.every; for (let k = 0; k < MALL.fuel.each; k++) { const q = hidden(10, 24); if (q) spawn(q, { kind: k ? 'walker' : 'runner', hunt: true, state: 'alert' }); } }
    } else {
      wantDrop = false; S.dropT -= dt;
      if (S.canAt && S.dropT <= 0 && Math.abs(P.y - S.canAt.y) < 1.5 && Math.hypot(P.x - S.canAt.x, P.z - S.canAt.z) < MALL.fuel.pick) { S.carry = true; canMesh.visible = false; S.canAt = null; say('油桶抬起来了', 1.6); G.game?.refreshObjective?.(); }
      if (S.tellT <= 0 && curKind() === 'gen') { S.tellT = 4; say('油桶在地上——回去抬起来', 2.2); }
    }
  }
  /** 一层守点：三个方向（离门口 16–28 米、站得住的地方）轮流来 */
  function holdDirs(site) {
    const out = [], a0 = rng() * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      let got = null;
      for (const r of [24, 20, 28, 16]) for (let j = 0; j < 5 && !got; j++) { const ang = a0 + (k * Math.PI * 2) / 3 + (j - 2) * 0.25, q = landAt(nav, site.x + Math.cos(ang) * r, site.z + Math.sin(ang) * r, site.y + 0.6); if (q && q.floor === site.floor && clear(nav, q)) got = new THREE.Vector3(q.x, q.y, q.z); }
      if (got) out.push(got);
    }
    return out;
  }
  function holdoutTick(dt) {
    if (!(S.holdT > 0)) return;
    if (S.stage > S.plan.stageOf('holdout') + 1) { S.holdT = 0; clockEl?.classList.add('off'); return; } // 已经走过去了（读档 / 调试跳步）
    S.holdT -= dt;
    if (clockEl) { clockEl.classList.remove('off'); clockEl.textContent = `后门 00:${String(Math.max(0, Math.ceil(S.holdT))).padStart(2, '0')}`; }
    if ((S.holdSpawn -= dt) <= 0) {
      S.holdSpawn = SIEGE.holdout.every; const dirs = S.holdDirs?.length ? S.holdDirs : null, at = dirs ? dirs[S.holdK++ % dirs.length] : hidden(14, 26);
      if (at) { for (let k = 0; k < SIEGE.holdout.each; k++) spawn(new THREE.Vector3(at.x + (k % 2) * 0.8, at.y, at.z + (k >> 1) * 0.8), { kind: k % 2 ? 'walker' : 'runner', hunt: true, state: 'alert' }); say(['左边来了！', '正面来了！', '右边来了！'][(S.holdK - 1) % 3] || '又来了！', 1.6); }
    }
    if (S.holdT <= 0) { S.holdT = 0; clockEl?.classList.add('off'); G.hud?.radio?.('卷帘撬开了！下到地下去。', 4); G.game?.refreshObjective?.(); }
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

  // 倒下了：有安全点就能从那儿重来（阵亡页上的按钮和说明换掉）
  G.events?.on?.('player:dead', () => {
    const c = director.state.checkpoint;
    if (enabled && c?.kind === 'safe') director.deadActions?.(true, `回到${c.label}重来`, '前面清掉的关卡都还在，身上的东西照到这儿时的算。', '换一局重来');
  });
  G.events?.on?.('zombie:knock', (e) => { if (!playing() || director.riding) return; S.fling = { t: 0, air: false, wall: false, prev: Math.hypot(G.player.vel?.x || 0, G.player.vel?.z || 0) }; say(e?.burst ? '被气浪掀飞了！' : '被巨尸拍飞了！', 1.6); });
  G.events?.on?.('grenade:lure', (e) => { if (!playing() || !e?.pos) return; for (const z of zalive()) if (Math.abs(z.pos.y - e.pos.y) < 3.2 && Math.hypot(z.pos.x - e.pos.x, z.pos.z - e.pos.z) < e.range) z.distract?.(e.pos, 1.3); });
  G.events?.on?.('grenade:fire', (e) => addNoise(18, e?.pos));
  G.events?.on?.('weapon:fire', (e) => addNoise(SIEGE.noise[e?.kind] ?? SIEGE.noise.rifle));
  G.events?.on?.('grenade:explode', (e) => addNoise(SIEGE.noise.grenade, e?.pos));
  G.events?.on?.('zombie:scream', (e) => { if (!playing() || director.riding || S.stage <= S.plan.armsStage) return; addNoise(30, e?.pos); horde(3 + Math.floor(rng() * 3)); say('尖叫者！它在招同伴', 2.2); });
  G.events?.on?.('zombie:burst', (e) => addNoise(18, e?.pos));
  G.events?.on?.('zombie:pin', (e) => { if (playing() && e?.enemy) { S.pin = { by: e.enemy, x: G.player.pos.x, z: G.player.pos.z, tell: 0 }; pacing.hit(20); } });
  G.events?.on?.('zombie:unpin', (e) => { if (S.pin?.by === e?.enemy) S.pin = null; });
  G.events?.on?.('zombie:spit', (e) => { if (playing() && !director.riding) spit(e); });
  G.events?.on?.('player:hit', (e) => { if (playing()) pacing.hit(e?.amount); });

  const api = {
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; if (enabled) warmProps(); try { storage?.setItem?.('jimao-siege', enabled ? '1' : '0'); } catch { /* 存不了就不存 */ } },
    mission, reset, state: S, walls, demo, get seals() { return seals; }, addNoise, horde, pacing, spawnSpecial, spawnBrute, supplies, inArea,
    get plan() { return S.plan; },
    update(dt) {
      for (const b of blocks) b.userData.update?.(dt, G);
      if (playing() && !director.riding) walls.update(dt);
      if (enabled && S.loadout && director.state.mission === S.mission && (G.game?.state === 'playing' || G.game?.state === 'intro')) loadout();
      if (enabled && S.kit && G.game?.state === 'playing') { supplies?.restore?.(S.kit); S.kit = null; }
      // 步枪弹药也照存档时的来（原游戏重置时给的是满的；至少留两个弹匣，不至于回来就没子弹）
      if (enabled && S.rifleKeep && G.game?.state === 'playing') { try { G.rifle.ammo = SIEGE.ammo.rifle; G.rifle.reserve = Math.max(60, S.rifleKeep[1]); } catch { /* 改不了就算了 */ } S.rifleKeep = null; }
      if (!playing() || director.state.mission !== S.mission) { noiseEl?.classList.add('off'); G.speedMul = 1; return; }
      G.speedMul = (SIEGE.speed[G.weapon?.current] || 1) * (S.carry ? MALL.fuel.speed : 1); // 拿刀跑得最快，手枪其次，长枪原速；抬着油桶慢
      S.tellT -= dt;
      syncStage();
      if (director.riding) { clockEl?.classList.add('off'); return; }
      wall(); leash(); genTick(dt); lockersTick(); escortTick(dt); sneakTick(dt); carryTick(dt); holdoutTick(dt); pinTick(); flingTick(dt); acidTick(dt); ambient(dt); holdTick(dt);
      // 响动：安静一会儿才开始往下掉；攒满会把下一波尸潮催来
      S.hordeCool -= dt;
      if ((S.quietT += dt) > SIEGE.noise.quiet) S.noise = Math.max(0, S.noise - SIEGE.noise.decay * dt);
      // 节奏：平静 → 升温 → 预警三秒 → 尸潮 → 喘息；特殊感染者隔一阵来一只
      const p = G.player.pos; let near = 0;
      for (const z of zalive()) if (z.zs !== 'idle' && Math.abs(z.pos.y - p.y) < 3 && Math.hypot(z.pos.x - p.x, z.pos.z - p.z) < 6) near++;
      const armed = S.stage > S.plan.armsStage;
      // 拿到步枪之前没有尸潮、没有特殊感染者；队友也不开枪（大家手里都只有刀，一开枪就把尸群招来了）
      if (!armed) { const sneaking = curKind() === 'sneak'; if (noiseEl) { noiseEl.classList.toggle('off', !sneaking); noiseEl.classList.toggle('hot', S.noise > MALL.sneak.wake * 0.7); noiseEl.querySelector('b').style.width = `${Math.min(100, S.noise / MALL.sneak.wake * 100)}%`; } for (const m of G.squad?.mates || []) m.cool = Math.max(m.cool || 0, 0.6); return; }
      const loud = S.noise >= SIEGE.noise.horde && S.hordeCool <= 0 && S.hold < 0;
      const act = pacing.update(dt, { stage: S.stage, near, noiseFull: loud, hold: S.hold >= 0 && !S.landed });
      if (act.warn) { say(loud ? '动静太大——尸潮要来了！' : '远处一阵嚎叫——尸潮要来了！', 3); G.player.addShake?.(0.15); G.events?.emit?.('enemy:telegraph', { pos: p, type: 'soldier', scream: true }); }
      if (act.horde) { S.noise = Math.min(S.noise, SIEGE.noise.after); S.hordeCool = SIEGE.noise.cooldown; if (horde(Math.round(act.horde * (G.squad?.hordeScale || 1)))) { say('尸潮！', 2.2); G.player.addShake?.(0.25); } }
      if (act.special) spawnSpecial();
      if (S.bruteT >= 0 && (S.bruteT -= dt) < 0) spawnBrute();
      if (noiseEl) { noiseEl.classList.remove('off'); noiseEl.classList.toggle('hot', S.noise > 70); noiseEl.querySelector('b').style.width = `${Math.min(100, S.noise)}%`; }
    },
    dispose() { if (typeof window !== 'undefined') window.removeEventListener('keydown', onDropKey); dropBtn?.remove(); for (const a of acids.splice(0)) a.dispose(); acidMat.dispose(); acidBall.dispose(); acidDisc.dispose(); walls.dispose(); seals?.dispose(); for (const q of steps.splice(0)) q.seal.dispose(); root.removeFromParent(); noiseEl?.remove(); clockEl?.remove(); G.liftAllow = null; G.stairBlock = null; },
  };
  return api;
}
