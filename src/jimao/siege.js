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
import { findPath, traceMotion } from '../fps/pathfinding.js';
import { doorOutside } from './guide.js';
import { createPacing } from './pacing.js';
import { toW } from '../layout/geom.js';
import { RIDE_SPECS, rideLocalToWorld } from './ride-vehicles.js';
import { aimAngles, inGunArc } from './door-gun.js';
import { MALL, mallStages, inMallZone } from './siege-mall.js';
import { SQUAD } from './squad.js';
import { pointInPoly } from '../layout/geom.js';
import { PATH, createPathfinder } from './pathfinder.js';
import { DEFENSE, DEFENSE_CSS, sealSegments, buildSeals, createBarricades, segDist } from './siege-defense.js';
import { DEMOLISH, DEMOLISH_CSS, createDemolition } from './siege-demolish.js';
import { buildHoseCabinet, HOSE_BOX, propMats, buildLocker, lockerDoors, buildSwitchCabinet, switchLever, buildTable, buildTool, buildFuseBox, fuseInserts, buildFlareKit, litFlare, buildDebris, buildFire, buildFireStatic, powderSheet, buildShutterFrame, buildShutterCurtain, buildDoorFrame, buildDoorLeaf, fireStep, SHUTTER, DOOR, FIRE, nosingY, propTop, beaconMesh, pickGlow, faceYaw, warmProps } from './siege-props.js';

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
  // 楼顶死守：每 10 秒一波（六波，最后 surge 秒接着不停地涌），一半从楼梯口冲上来、一半翻女儿墙上来（rim）；第 brutes 波各带一只巨尸（血量按 bruteHp 折——守屋顶时一波接一波，
  // 步枪打满血的巨尸要五十来枪），单数波再加一只特殊感染者。第二只巨尸放在第 5 波：别和最后那阵一起压上来。楼顶小的楼另有一份（TOWERS.*.hold）
  hold: 70, waves: Object.freeze([2, 12, 22, 32, 42, 52]), waveSize: [14, 18], rim: 0.35, brutes: Object.freeze([3, 5]), bruteHp: 0.65, land: 6,
  // 楼梯口那一份排队出来：每个口子第一只马上、之后隔 pour 秒一只（一秒四只）；点着信号弹时楼里比屋面低 below 米以上的收掉
  pour: 0.25, below: 7,
  // 守屋顶时从哪儿冒出来（不在人眼皮底下凭空冒出来）：
  //   楼梯口那一份（排队的、巨尸、特殊感染者、尖叫招来的）放在楼梯间里面——楼梯顶到门口那一段、最上面一跑楼梯、休息平台、下一层的楼梯口，
  //   人和队友都看不见、离人 / 队友 doorNear 米以外的那一处，自己从门里走出来（门口摆了路障就被挡在里面）；哪一处都不行就排着等一会儿；
  //   翻女儿墙上来的：离人、离队友 rimNear 米以外，先挑人视野外的（水平视角一半再放宽 view 弧度），视野里的要 rimSeen 米以外，都没有就改走楼梯口；
  //   每个口子最多排 queue 只（再多的不排了：最后那阵涌不上来也不会越攒越多）
  spawn: Object.freeze({ doorNear: 5, rimNear: 10, rimSeen: 18, view: 0.15, queue: 16 }),
  // 池子满了：先收最早倒下的尸体；守屋顶时再收人看不见、离人 near 米以外的活丧尸（最远的先收，巨尸和特殊感染者不收）——人眼前的一只都不收。
  // 还腾不出来（屋面上全是追人的）、楼梯口排着队：每 retire 秒收一只人视野外、离人 retireFar 米以外的，让最后那阵涌得上来
  cull: Object.freeze({ near: 15, retire: 0.6, retireFar: 20 }),
  // 守屋顶时围上来的：贴着人（reach 米内）同时抡、咬的最多 bite 只，其余的围在旁边等着（照样挤成一圈，只是不会一瞬间被十几只一起咬死）；
  // 队友同时挨咬的最多算 mateBite 只、每只按 mate 倍算（守屋顶这一阵他们靠在一起打，不至于开场十几秒就倒）
  crowd: Object.freeze({ bite: 3, reach: 2.4, mateBite: 3, mate: 0.6 }),
  // 信号弹的红光（借灯池里的一盏）：亮度、照多远、衰减、离地多高、颜色
  flare: Object.freeze({ intensity: 5, distance: 24, decay: 1, y: 0.6, color: 0xff3524 }),
  // 最后 surge 秒：不再一波一波，隔 every 秒从楼梯口和女儿墙一起涌上来 each 只（行尸多一点：慢慢压上来，屋面上看得见一大片），直到直升机落下
  surge: Object.freeze({ last: 16, every: 1.4, each: 4, mix: Object.freeze({ walker: 0.4, runner: 0.55, bloater: 0.05, screamer: 0 }) }),
  // 直升机落稳以后（跑去登机那几步）：排着队还没出来的那几波收掉，不再来新的一波、不催尸潮、不放特殊感染者（以前一落地节奏器接着走，一下在眼前冒出十九只）；
  // 楼梯间门里隔 every 秒零零星星出来一只（屋顶上活着的不到 alive 只才放），贴着人同时咬的照样最多 crowd.bite 只——压力还在，跑到登机门是公平的
  board: Object.freeze({ every: 2.5, alive: 10, mix: Object.freeze({ walker: 0.6, runner: 0.4, bloater: 0, screamer: 0 }) }),
  // 一层守点：撬开通往地下的卷帘要 seconds 秒；隔 every 秒从三个方向之一来 each 只
  holdout: Object.freeze({ seconds: 40, every: 6, each: 4 }),
  // axe：消防斧砍中一只、没砍死的动静（只惊动 axeHear 米内的）；一斧砍倒和刀一样没声——潜行时悄悄放倒挡路的行尸不会惊动旁边的
  noise: Object.freeze({ rifle: 7, pistol: 5, smg: 2.5, launcher: 30, grenade: 45, switch: 70, pry: 40, panel: 25, spray: 20, card: 10, flare: 100, decay: 6, quiet: 1.5, horde: 100, after: 35, cooldown: 14, hear: 26, axe: 6, axeHear: 4 }),
  ambient: Object.freeze({ mall: 9, tower: 6, roof: 4, every: 0.9, near: 12, far: 30, drop: 58 }),
  // 爬楼（电梯只到第一道关那层，再往上一层层走楼梯）：每层自己一群——走廊 corridor 只、楼梯口 landing 只、住户家里 flats 只（只放走得出来的户），关卡那层多 gate 只。
  // 人到了这层才摆满（离人 near 米外、看不见的地方），上一层先摆几只（ahead）；北区的楼层小（电梯厅十来米），上一层整层先摆好（aheadFull）。
  // 下面两层以下没在追人的收回去，摆过的层不再摆；关卡那几层没清干净（还剩 left 只以上、或者有一只在上楼梯口 clearNear 米内）往上的楼梯不让走（中间的楼层不拦，见 pass）。
  // 池子：摆的时候至少空着 reserve 个位置（尸体也占位置），爬楼时的尸潮最多 horde 只；每隔 ammo 层楼梯口放一个弹匣、每隔 medkit 层一个医疗包
  // 楼上先摆好的那几层守在自己那层：人不在那层、也不在通往那层的那段楼梯上时，听见枪声每层最多下来 down 只（以前北区整层涌下来，人上去一看是空的）；
  // 人上到一层时，这一层那一群（打死的不算）少了一大截（不到 refill 成）——被回收、走丢了——就从看不见的地方补回来
  // 只有关卡那几层（每栋三层）非清不可：这几层摆得最多（多 gate 只），清干净才放上楼梯；中间的楼层（pass）摆少一点，可以打、也可以直接冲上楼梯
  // （用户：「不用每一层都打完僵尸才走，挑两三层打完就好了」）
  floors: Object.freeze({ A: Object.freeze({ corridor: 8, landing: 1, flats: 2, gate: 4, pass: Object.freeze({ corridor: 5, landing: 1, flats: 1 }) }),
    T1: Object.freeze({ corridor: 2, landing: 1, flats: 6, gate: 2, aheadFull: true, endGap: 1.5, pass: Object.freeze({ corridor: 1, landing: 1, flats: 4 }) }),
    ahead: Object.freeze({ landing: 1, corridor: 4, flats: 0 }), mix: Object.freeze({ walker: 0.65, runner: 0.2, bloater: 0.1, screamer: 0.05 }),
    near: 10, perFrame: 3, sight: 12, reserve: 6, wait: 10, horde: 8, hordeReserve: 2, left: 2, clearNear: 15, wake: 4, ammo: 2, medkit: 4, down: 2, refill: 0.6,
    grid: 2.5, endGap: 3, perFlat: 6, tries: 16, gap: 1.8, budget: 3 }),
  // 回收：寻路连着失败 noPath 次（困在屋里、卡在墙角）、或者追着人却 slow 秒都没靠近（隔着两层以上 / far 米外）的，人看不见时收回池子
  recycle: Object.freeze({ every: 0.5, noPath: 3, far: 60, storeys: 7, slow: 20 }),
  // 清扫：屋顶（一大群，见 surge）、阳台玻璃后面、楼下；它们会朝飞机扔东西（throw：多远以内扔、最快隔几秒一发、飞多久、几成砸中、一发顶几发子弹）
  // 只有飞机上看得见、舱门机枪转得过去的才扔、才叫得着飞机（楼里、楼梯间里、射界外的打不着它们，它们也打不着飞机）；crowd：看得见的不到这么多只，扔得按比例稀一点
  // post：屋顶、楼下的守在一个点上（不追人——人在飞机上，追就钻进楼里了），每 every 秒按 lead 秒以后飞机的位置挪到看得见的点（楼下 groundWalk 米以内；屋顶的见 surge）；
  //   备选点屋顶 roofPool、楼下 groundPool 个；离开自己那一层超过 off 秒的收回重放
  // expose：每只隔 every 秒查一遍看不看得见，连着看得见 on 秒才算露出来、连着看不见 off 秒才算藏起来（HUD 红点、辅助瞄准不闪）
  // post.spread / ms：换点前给备选点重新打分，分到 spread × every 秒里的各帧去做（一帧最多 ms 毫秒），不在一帧里打一百多条跨楼层射线
  // refill：楼下第二批平时降到低空才来；第一批只剩 left 只、或者连着 lull 秒能打的不到 quiet 只（屋顶、阳台都清了），就提前冲出来——不让人干转半圈
  // balcony.front：阳台里的站在离阳台中线往外 front 米（贴着玻璃）；阳台的楼板、挡板挡视线、挡子弹（physics.addOccluder），往里站从飞机上只看得见顶板。
  //   low：降到低空绕楼下那一圈上看得见不到这么几成的（高层、只在一个角上露一下），进了那一段就不挡「清完了」（不让人为最后一只干转大半圈）
  // prep：清扫要用的点在楼里爬楼那一阵就开始分帧算（爬楼的落点算完以后），一帧最多 prep 毫秒
  // surge：屋顶那一拨是一大群、一直在动。起飞时守屋顶剩下的活的接着当屋顶的（最多 peak − min 只），不够 start 只的当场补到 start 只（放在看得见的点上），
  //   其余从楼梯间门里一只只涌出来（每个门 every 秒一只，first 秒以后开始），屋顶同时最多 peak 只、这一拨一共 roof 只左右（剩下的多：再多涌 min 只，最多 max 只）。
  //   每一轮（post.every 秒）按 post.lead 秒以后飞机的位置，在看得见的点里挑离飞机（水平）最接近 near 米的 rally 处集结点（隔 gap 米，一处大约 per 只；飞机在楼外时就是离它最近的），
  //   每只冲向离自己近的那一处、在它周围 r 米里挤着（每轮有 churn 成的换个位置挤、swap 成的换到最远那一处），跟着飞机绕楼转；在楼梯间盒子里待了 house 秒的收回重放。mix：涌出来的是哪几种；
  //   降到低空时屋顶上剩下的最多 down 只下到楼下（别的收掉、从总数里去掉）
  sweep: Object.freeze({ roof: 30, window: 12, ground: 18, screamers: 3, cap: 150, throw: Object.freeze({ range: 85, every: 0.6, flight: 1.5, hit: 0.8, hits: 1.5, first: 9, crowd: 5 }),
    surge: Object.freeze({ start: 12, peak: 26, min: 6, max: 34, down: 10, every: 0.3, first: 0.3, rally: 3, gap: 5, per: 9, near: 14, r: 2.6, churn: 0.4, swap: 0.15, house: 2.5, mix: Object.freeze({ walker: 0.5, runner: 0.45, bloater: 0.05, screamer: 0 }) }),
    post: Object.freeze({ every: 1, lead: 3, groundWalk: 30, roofPool: 80, groundPool: 72, off: 1, spread: 0.8, ms: 1.2 }),
    expose: Object.freeze({ every: 0.25, on: 0.3, off: 0.5 }), refill: Object.freeze({ left: 2, quiet: 2, lull: 3 }), balcony: Object.freeze({ front: 0.4, low: 0.15 }), prep: 2 }),
  ammo: Object.freeze({ rifle: 30, reserve: 90 }),
  // 安全点那句「这儿暂时安全」：等 near 米内没有在追人的丧尸、连着 calm 秒再说（以前清完关卡马上说，常常正被几只围着咬）；等了 cap 秒还在打，换一句不说「安全」的
  safeTalk: Object.freeze({ near: 15, calm: 2, cap: 20 }),
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
    pad: SIEGE.pad, gates: SIEGE.gates, weight: 0.65, parapet: 1.9 }),
  T1: Object.freeze({ id: 'T1', name: '北区 1 号楼', roof: 'T1-RF', roofName: '北区 1 号楼楼顶', power: 'P1-B1', powerName: '北区 1 号楼地下一层电梯厅', lift: 'T1-ST-A', stair: 'T1-ST', mall: true,
    pad: Object.freeze({ kind: 'helicopter', x: -249.2, z: -232, yaw: Math.PI / 2 }), gates: Object.freeze([[9, 11], [14, 17], [20, 23]]), around: 'T2', weight: 0.35, parapet: 1.25,
    // 屋顶只有 36 × 16 米、唯一的出口离信号弹 11 米：门口正对着人，一只只出来就在门口被点名打掉（以前站桩打一整场不掉血）。所以楼梯口出来得密
    // （隔 pour 秒一只、每波 22–25 只，门洞里 lanes 条道并排挤出来）；只有这一个口子，一个口子能排 queue 只（公寓两个口子各 16 只，北区以前一波排不下、多的扔掉了）；
    // 最后那阵每 1.4 秒 surgeEach 只。女儿墙那边离人 10 米外、视野外的地方几乎没有（东半边就 14 × 16 米），翻墙上来的很少，压力全在门口。
    // 巨尸只来一只、晚一点（第 5 波）、血再少一点（一冒头就到跟前了）
    hold: Object.freeze({ waveSize: Object.freeze([22, 25]), brutes: Object.freeze([5]), bruteHp: 0.5, pour: 0.1, lanes: 3, queue: 32, surgeEach: 6 }) }),
});
// parapet：女儿墙（画面上有、导航里没有）顶比屋面高多少（公寓 1.8 米 + 压顶；北区 1.15 米 + 压顶），清扫时看屋顶上的丧尸要越过它
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

// ---------- 爬楼：一层层打上去（每层自己一群丧尸）----------
/** 要一层层打上去的楼层：第一道关那层起、到屋顶下面那层（电梯只到第一道关那层，再往上全走楼梯） */
export function climbFloors(plan, nav) {
  const T = plan?.tower || TOWERS.A, g0 = plan?.gates?.[0], out = [];
  if (g0) for (let n = g0.n; n < 200 && nav.floors.has(floorOf(n, T)); n++) out.push(floorOf(n, T));
  return out;
}
// 算好的落点按「这一层的几何」存（墙、家具、户型、楼梯口位置）：公寓 3F–19F 一模一样，只算一次；换一局、读档都不用重算
const spotCache = new WeakMap(), FLOOD = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function floorSig(F, lv, up, dn) {
  let h1 = 7, h2 = 13, n = 0;
  const mix = (v) => { const q = Math.round(v * 100) | 0; h1 = (Math.imul(h1, 31) + q) | 0; h2 = (Math.imul(h2, 1000003) ^ q) | 0; n++; };
  for (const w of F.walls) { mix(w.x0); mix(w.z0); mix(w.x1); mix(w.z1); mix(w.top ?? -1); }
  for (const o of F.obstacles || []) for (const p of o.outer || []) { mix(p[0]); mix(p[1]); }
  for (const u of lv.units || []) { mix(u.residence?.level === 'upper' ? 1 : 0); mix(u.wfronts?.length || 0); for (const p of u.polys?.[0] || []) { mix(p[0]); mix(p[1]); } }
  for (const r of [...up, ...dn]) { mix(r.a.x); mix(r.a.z); mix(r.b.x); mix(r.b.z); }
  return `${F.walls.length}/${F.obstacles?.length || 0}/${n}/${h1}/${h2}`;
}
/**
 * 一层的落点（生成器：每试一点让出一次，游戏里分帧算；floorSpots 一口气算完）。返回
 * { floor, y, corridor: [{x, z}], landing: [{x, z, run}], flats: [{ unit, name, spots: [{x, z}] }], up, dn（往上 / 从下面上来的那几段楼梯的 id） }。
 *   corridor：2.5 米一格，在这一层的楼面上、站得开（四周 0.6 米都是空地）、不在任何一户里、离梯段口和电梯门 3 米以外；
 *   landing：每个梯段口往楼面退一两米；
 *   flats：这一层有入户门的户（复式上层不算），户里 1.6 米一格挑几点。
 * 每一点都要真的「从这一点走得到这层的楼梯口」（丧尸寻路同一套格子、同一种试走，方向是从这一点往外——以前只验了从门口往里走得进去，
 * 公寓有一半的户门口被玄关家具卡住、门又对不上寻路的格子，放进去的出不来）；走不出来的户一点都不放。
 */
export function* floorSpotsJob(layout, nav, runs, tower, floor) {
  const F = nav.floors.get(floor), lv = layout.levels.find((l) => l.id === floor), FL = SIEGE.floors;
  if (!F || !lv || F.stairLanding) return null;
  const mine = (r) => r.id.startsWith(tower.stair), byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const up = runs.filter((r) => r.from === floor && mine(r)).sort(byId), dn = runs.filter((r) => r.to === floor && mine(r)).sort(byId);
  const land0 = up[0] ? { p: up[0].a, d: { x: -up[0].da.x, z: -up[0].da.z } } : dn[0] ? { p: dn[0].b, d: dn[0].db } : null;
  if (!land0) return null;
  const remap = (t) => ({ floor, y: F.y, corridor: t.corridor, landing: t.landing.map((q) => ({ x: q.x, z: q.z, run: (q.up ? up : dn)[q.i]?.id || null, up: q.up })),
    flats: t.flats.map((f) => ({ unit: lv.units[f.k].id, name: `${plateOf(lv.units[f.k].code || lv.units[f.k].id)} 室`, spots: f.spots })), up: up.map((r) => r.id), dn: dn.map((r) => r.id) });
  let cache = spotCache.get(nav); if (!cache) spotCache.set(nav, cache = new Map());
  const sig = floorSig(F, lv, up, dn); yield;
  if (cache.has(sig)) return remap(cache.get(sig));
  const y = F.y, polys = (lv.units || []).flatMap((u) => u.polys || []), inUnit = (x, z) => polys.some((p) => pointInPoly([x, z], p));
  const at = (x, z) => { const s = landAt(nav, x, z, y + 0.6); return !!s && s.floor === floor && !s.slope && Math.abs(s.y - y) < 0.3 && clear(nav, s); };
  const roomy = (x, z, r) => at(x + r, z) && at(x - r, z) && at(x, z + r) && at(x, z - r);
  // 「走不走得到楼梯口」：从楼梯口往外倒着漫一遍（丧尸寻路同一套 0.8 米格子、同一种试走 traceMotion，方向是从外面那格走向里面这格）。
  // 漫到的格子都有路走到楼梯口；一个点能走进旁边哪个漫到的格子，它就出得去。一层漫一遍，每展开几格让出一次
  const C = PATH.cell, key = (i, j) => (i + 32768) * 65536 + (j + 32768), pt = (i, j) => ({ floor, x: i * C, z: j * C, y, slope: null });
  const cells = new Map(), isOpen = (i, j) => { const k = key(i, j); let v = cells.get(k); if (v === undefined) cells.set(k, v = clear(nav, pt(i, j)) ? 1 : 0); return v === 1; };
  const goal = { floor, x: land0.p.x, z: land0.p.z, y, slope: null }, reached = new Set(), queue = [];
  { const gi = Math.round(goal.x / C), gj = Math.round(goal.z / C); for (let i = gi - 2; i <= gi + 2; i++) for (let j = gj - 2; j <= gj + 2; j++) { if (isOpen(i, j) && traceMotion(nav, pt(i, j), goal)) { reached.add(key(i, j)); queue.push(i, j); } yield; } }
  for (let q = 0; q < queue.length; q += 2) {
    const i = queue[q], j = queue[q + 1], here = pt(i, j);
    for (const [di, dj] of FLOOD) { const a = i + di, b = j + dj, k = key(a, b); if (reached.has(k) || !isOpen(a, b) || !traceMotion(nav, pt(a, b), here)) continue; reached.add(k); queue.push(a, b); }
    yield;
  }
  function* reach(x, z) {
    const s = { floor, x, z, y, slope: null }, ci = Math.round(x / C), cj = Math.round(z / C);
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) if (reached.has(key(i, j)) && traceMotion(nav, s, pt(i, j))) return true;
    yield; return false;
  }
  const ends = [...up.flatMap((r) => [r.a, r.ea]), ...dn.flatMap((r) => [r.b, r.eb]), ...nav.links.flatMap((l) => (l.kind === 'lift' ? (l.stops || []).filter((s) => s.floor === floor) : []))];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of F.pieces || []) { x0 = Math.min(x0, p.bb.x0); x1 = Math.max(x1, p.bb.x1); z0 = Math.min(z0, p.bb.z0); z1 = Math.max(z1, p.bb.z1); }
  const corridor = [], g = FL.grid; let n = 0; yield;
  for (let x = Math.ceil(x0 / g) * g; x <= x1; x += g) for (let z = Math.ceil(z0 / g) * g; z <= z1; z += g) {
    if (inUnit(x, z) || ends.some((e) => Math.hypot(e.x - x, e.z - z) < (FL[tower.id]?.endGap ?? FL.endGap))) { if ((++n & 15) === 0) yield; continue; }
    yield;
    if (!at(x, z) || !roomy(x, z, 0.6)) continue;
    if (yield* reach(x, z)) corridor.push({ x, z });
  }
  const landing = [];
  for (const L of [...up.map((r, i) => ({ p: r.a, d: { x: -r.da.x, z: -r.da.z }, up: true, i })), ...dn.map((r, i) => ({ p: r.b, d: r.db, up: false, i }))]) {
    for (const d of [1.6, 1.1, 2.2]) {
      const x = L.p.x + L.d.x * d, z = L.p.z + L.d.z * d;
      if (landing.some((q) => Math.hypot(q.x - x, q.z - z) < 1.5) || inUnit(x, z) || !at(x, z)) continue;
      if (yield* reach(x, z)) { landing.push({ x, z, up: L.up, i: L.i }); break; }
    }
  }
  const flats = [];
  for (let k = 0; k < lv.units.length; k++) {
    // 和 unitSites 一样：只要这一层有入户门的户（复式上层的门在下一层）
    const u = lv.units[k], poly = u.polys?.[0]; if (!poly || !u.rects?.[0] || !u.wfronts?.length || u.residence?.level === 'upper') continue;
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity; for (const [px, pz] of poly) { bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); bz0 = Math.min(bz0, pz); bz1 = Math.max(bz1, pz); }
    const cand = [];
    for (let i = 0, x = bx0 + 0.8; x < bx1; x += 1.6, i++) for (let j = 0, z = bz0 + 0.8; z < bz1; z += 1.6, j++) if (pointInPoly([x, z], poly)) cand.push({ x, z, o: (i * 7919 + j * 104729) % 97 });
    cand.sort((a, b) => a.o - b.o); yield; // 打散（不全挤在一个角上）
    const spots = []; let tries = 0, fails = 0;
    for (const c of cand) {
      if (spots.length >= FL.perFlat || tries >= FL.tries || (fails >= 3 && !spots.length)) break;
      if (spots.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < FL.gap)) continue;
      yield;
      if (!at(c.x, c.z) || !roomy(c.x, c.z, 0.45)) continue;
      tries++;
      if (yield* reach(c.x, c.z)) spots.push({ x: c.x, z: c.z }); else fails++;
    }
    if (spots.length) flats.push({ k, spots });
  }
  const t = { corridor, landing, flats }; cache.set(sig, t);
  return remap(t);
}
/** 一口气算完一层的落点（测试、加载时用；游戏里走 floorSpotsJob 分帧算） */
export function floorSpots(layout, nav, runs, tower, floor) {
  const g = floorSpotsJob(layout, nav, runs, tower, floor);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
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
export function groundSpots(nav, layout, count, rng, tower = TOWERS.A, lo = 8, hi = 34, mallFirst = false) {
  const { x0, x1, z0, z1 } = bounds(layout, tower), out = [];
  const mallY = nav.floors.get('P1-RF')?.y ?? 34;
  for (let k = 0; k < count * 80 && out.length < count; k++) {
    const mall = tower.mall || (out.length + (mallFirst ? 1 : 0)) % 2 === 1; // mallFirst：一次只撒一个点时轮着来（这次先撒商场屋面上的）
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

const _hv = new THREE.Vector3(), _hb = new THREE.Quaternion(), _he = new THREE.Euler();
/**
 * 直升机在 pose（siegeFlight 的 poseAt）这一刻：人眼（座位）在哪、舱门机枪的枪架朝哪。和载具一样的挂法：机身绕 y 转 yaw，再 pitch / roll，
 * 座位、枪架在机身里（RIDE_SPECS.helicopter.seat / gunYaw）。返回 { eye, q }（out 复用）；清扫时按航线算哪儿看得见
 */
export function heliGun(pose, out = { eye: new THREE.Vector3(), q: new THREE.Quaternion() }) {
  const H = RIDE_SPECS.helicopter;
  out.q.setFromEuler(_he.set(0, pose.yaw || 0, 0)).multiply(_hb.setFromEuler(_he.set(pose.pitch || 0, 0, pose.roll || 0)));
  out.eye.set(H.seat[0], H.seat[1], H.seat[2]).applyQuaternion(out.q).add(_hv.set(pose.x, pose.y, pose.z));
  out.q.multiply(_hb.setFromEuler(_he.set(0, H.gunYaw, 0)));
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
/** 一个阳台：楼板、两侧挡板、整面玻璃（pane）。朝 +x 伸出去。solid：不透光的那几块（清扫时登记成挡视线、挡子弹的方盒） */
export function balconyModel() {
  const m = mats(), g = new THREE.Group(); g.name = '阳台';
  const solid = [box(g, 1.5, 0.14, 2.6, 0, -0.07, 0, m.slab), box(g, 1.5, 0.1, 2.6, 0, 2.5, 0, m.slab), box(g, 1.5, 2.5, 0.08, 0, 1.25, -1.3, m.white), box(g, 1.5, 2.5, 0.08, 0, 1.25, 1.3, m.white), box(g, 0.06, 2.5, 2.6, -0.72, 1.25, 0, m.dark)];
  const pane = box(g, 0.03, 2.4, 2.5, 0.72, 1.25, 0, m.glass); pane.castShadow = false; pane.renderOrder = 3;
  g.userData.pane = pane; g.userData.solid = solid; return g;
}
/** 摆好（position / rotation 设过）的阳台模型里不透光那几块的世界包围盒 [{ x0, y0, z0, x1, y1, z1 }]（阳台只转 90° 的倍数，包围盒就是原样） */
export function balconyBoxes(g) {
  g.updateWorldMatrix(true, true);
  return (g.userData.solid || []).map((o) => { const b = new THREE.Box3().setFromObject(o); return { x0: b.min.x, y0: b.min.y, z0: b.min.z, x1: b.max.x, y1: b.max.y, z1: b.max.z }; });
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
 * 合闸、每清掉一道关——那儿就是安全点（倒下了从这里重来），柜子里有医疗包（配电室还有一把微声冲锋枪，第二道关那儿摆着一把榴弹枪——清掉这道关巨尸就来了；
 * 榴弹枪其实在一层武器柜里就给了（finishStage），这一把是保底：没有的补上，有了的当两发榴弹）；楼顶信号弹旁边一个医疗包、一个弹匣、两发榴弹、一颗手雷（守屋顶那七十秒用得上）。
 * 消防斧不走这张表：开局店门外的消火栓箱里挂着一把（siege-mall.js 的 axe），没拿的话撬棍那一步顺手给上。
 */
export const LOOT = Object.freeze({
  pistol: Object.freeze(['pills']), locker: Object.freeze(['pills']), holdout: Object.freeze(['ammo', 'frag']), switch: Object.freeze(['medkit', 'smg', 'pills']), flare: Object.freeze(['medkit', 'ammo', 'shell', 'frag']),
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
  const S = { bombAt: -1, plan: null, mission: null, stage: 0, noise: 0, quietT: 0, hordeCool: 0, spawnT: 0, hold: -1, waveI: 0, land: -1, landed: false, flight: null, sweep: null, safe: new THREE.Vector3(), hasSafe: false, floorPos: new THREE.Vector3(), hasFloor: false, run: null, tellT: 0, pin: null, bruteT: -1, brutes: 0, lastSpecial: '' };
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
  let seals = null, steps = [], shopSeal = null, closedShops = [], hoseBox = null;
  /** 这一点在卷帘拉下的店里（丧尸不从那儿冒出来；救人那家撬开以后也一样不出） */
  const shut = (q) => !!q && closedShops.some((c) => Math.abs((nav.floors.get(c.floor)?.y ?? 0) - q.y) < 2 && pointInPoly([q.x, q.z], c.poly));
  /** 人进不去的店：卷帘拉下的那些；救人那家撬开以后人能进（小许万一卡在里面、倒在里面，一个人玩也能进去把他扶出来） */
  const sealed = (c) => !c.rescue || S.stage <= (S.plan?.stageOf?.('rescue') ?? Infinity);
  /** (x, z) 在卷帘拉下（还锁着）的店里，或者离它不到 pad 米 */
  const nearShut = (f, x, z, pad = 0) => closedShops.some((c) => {
    if (c.floor !== f || !sealed(c)) return false;
    const b = (c.bb ||= c.poly.reduce((o, [px, pz]) => ({ x0: Math.min(o.x0, px), z0: Math.min(o.z0, pz), x1: Math.max(o.x1, px), z1: Math.max(o.z1, pz) }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity }));
    if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) return false;
    if (pointInPoly([x, z], c.poly)) return true;
    return pad > 0 && c.poly.some((q, i) => { const r = c.poly[(i + 1) % c.poly.length]; return segDist(x, z, q[0], q[1], r[0], r[1]).d < pad; });
  });
  /** (x, z) 离门对面那个消火栓箱（连壁柱，没有碰撞体）不到 pad 米：人走到跟前就停、寻路绕开，不从箱子里穿过去 */
  const nearHose = (f, x, z, pad) => {
    const A = S.plan?.mall.axe; if (!A?.across || f !== A.floor) return false;
    const fx = Math.sin(A.wall.yaw), fz = Math.cos(A.wall.yaw), dx = x - A.wall.x, dz = z - A.wall.z, v = dx * fx + dz * fz - MALL.axe.depth / 2, u = dx * fz - dz * fx;
    return Math.hypot(Math.max(0, Math.abs(u) - MALL.axe.wide / 2), Math.max(0, Math.abs(v) - MALL.axe.depth / 2)) < pad;
  };
  /** 寻路绕开卷帘拉下的店（路线指引以前从救人那家店的店角斜穿过去，人照着走就被拦在卷帘上）和门口的消火栓箱；救人那家撬开以后再设一次（缓存清掉） */
  const avoidShut = () => G.physics?.pathfinder?.setAvoid?.(enabled && S.plan ? (f, x, z) => nearShut(f, x, z, MALL.pad.path) || nearHose(f, x, z, MALL.pad.path) : null, (f, x, z) => nearShut(f, x, z) || nearHose(f, x, z, 0.01));
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
  // seed：爬楼时摆在哪一层的（池子里的丧尸回收再用，每次放出来都重记）；_best / _slowT：追人时离人最近的那一下、多久没靠近（回收卡住的用）
  const spawn = (pos, opts = {}) => { let z = null; try { z = G.enemies.spawn('zombie', pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z), opts); } catch { z = null; } if (z) { z.seed = opts.seed || null; z._best = Infinity; z._slowT = 0; z.exitRoute = null; } return z; };
  /** 池子里还空着几个位置（倒下的尸体躺 6 秒才收，也占位置） */
  const freeSlots = () => { let n = 0; for (const z of zombies.pool) if (z.active) n++; return zombies.pool.length - n; };

  // ---- 爬楼：每层一群，逐层破楼 ----
  // 落点（floorSpotsJob）开局就分帧算（每帧 FL.budget 毫秒），人走到楼里早就算好了；算好的按几何签名缓存，换一局不重算
  const FL = SIEGE.floors;
  const climbList = () => (S.climb ||= S.plan ? climbFloors(S.plan, nav) : []);
  const climbIdx = (f) => (f ? climbList().indexOf(f) : -1);
  const floorY = (f) => nav.floors.get(f)?.y ?? 0;
  const towerCfg = () => FL[tower().id] || FL.A;
  function* spotsJob(plan) {
    for (const f of climbFloors(plan, nav)) { const s = yield* floorSpotsJob(layout, nav, runs, plan.tower || TOWERS.A, f); if (s) S.spots.set(f, s); }
    S.spotJob = null;
  }
  function prepTick() {
    if (!S.spotJob) return;
    const t0 = performance.now(), end = t0 + FL.budget;
    do { if (S.spotJob.next().done) S.spotJob = null; } while (S.spotJob && performance.now() < end);
    S.prepWorst = Math.max(S.prepWorst || 0, performance.now() - t0); // 调试看：最长的一帧算了多久
  }
  /** 楼里的楼梯间（梯段、中间的休息平台）：人在这上面不算哪一层 */
  const stairBits = () => (S.stairBits ||= (() => { const T = tower(), mine = runs.filter((r) => r.id.startsWith(T.stair)); return { slopes: new Set(mine.flatMap((r) => r.slopes)), landings: new Set(mine.flatMap((r) => r.landings)) }; })());
  const onTowerStairs = (st) => !!st && (st.slope ? stairBits().slopes.has(st.slope.id) : stairBits().landings.has(st.floor));
  const upRuns = (f) => runs.filter((r) => r.from === f && r.id.startsWith(tower().stair));
  /** 这一层上还活着的、爬楼时摆出来的那些（尸潮不算）：还拦着往上的楼梯 */
  const blockers = (f) => { const y = floorY(f), out = []; for (const z of zombies.pool) if (z.active && z.alive && z.seed && Math.abs(z.pos.y - y) < 1.5) out.push(z); return out; };
  /** 非清不可的那几层：关卡那几层（每栋三道关、三层）。别的楼层照样有丧尸，但不拦楼梯 */
  const mustClear = (f) => !!S.plan?.gates?.some((g) => g.floor === f);
  /** 往上这一段楼梯（从 run.from 那层出发）现在拦不拦：关卡那几层摆过、还剩 left 只以上（或者有一只就在上楼梯口 clearNear 米内）就拦。返回一句话或 null */
  function climbRule(run) {
    if (!S.plan || S.stage <= S.plan.armsStage || !mustClear(run.from)) return null;
    const rec = S.seeded.get(run.from); if (!rec || rec.passed || climbIdx(run.from) < 0) return null;
    const left = blockers(run.from), near = left.some((z) => Math.hypot(z.pos.x - run.a.x, z.pos.z - run.a.z) < FL.clearNear);
    if (rec.done && (!left.length || (left.length <= FL.left && !near))) return null;
    return `楼梯口还有丧尸——先把这层清干净（还剩 ${left.length} 只）`;
  }
  /** 被拦在楼梯口：剩下没几只了就把它们叫过来（找不着的那几只自己过来；过不来的寻路失败几次就回收） */
  function wake(f) {
    if ((S.wakeT || 0) > 0) return; S.wakeT = 2.5;
    const left = blockers(f); if (left.length && left.length <= FL.wake) for (const z of left) z.alert?.(G.player.pos, true);
  }
  /** 这一层该摆多少只：full 摆满（人在这一层 / 北区的上一层 / 第一道关那层）——关卡那几层摆满一群，中间的楼层按 pass 摆少一点；否则只是上一层先放的几只 */
  function quota(f, full) {
    const C = towerCfg();
    if (!mustClear(f)) { const P = C.pass || C; return full ? { landing: P.landing, corridor: P.corridor, flats: P.flats } : { landing: Math.min(FL.ahead.landing, P.landing), corridor: Math.min(FL.ahead.corridor, P.corridor), flats: Math.min(FL.ahead.flats, P.flats) }; }
    return full ? { landing: C.landing, corridor: C.corridor + C.gate, flats: C.flats } : { ...FL.ahead };
  }
  /** 挑一个落点：没用过（离已经放的 gap 米以外）；人在这一层就只要离人 near 米外、看不见的。
   * 返回点 / null（都离人太近、看得见）/ undefined（这一帧的视线检查用完了，下一帧再挑）/ false（这一类用完了） */
  const _eye = new THREE.Vector3(), _head = new THREE.Vector3();
  function pickSpot(list, rec, own, y) {
    const free = list.filter((q) => !rec.used.some((u) => Math.hypot(u.x - q.x, u.z - q.z) < FL.gap));
    if (!free.length) return false;
    if (!own) return free[Math.floor(rng() * free.length)];
    const p = G.player.pos; _eye.set(p.x, p.y + 1.5, p.z);
    for (let k = 0, i0 = Math.floor(rng() * free.length); k < free.length; k++) {
      const q = free[(i0 + k) % free.length];
      if (Math.hypot(q.x - p.x, y - p.y, q.z - p.z) < FL.near) continue;
      if (S.losN++ >= FL.sight) return undefined;
      if (!G.physics.lineOfSight?.(_eye, _head.set(q.x, y + 1.5, q.z))) return q;
    }
    return null;
  }
  /** 摆这一层（每帧最多 perFrame 只，池子至少留 reserve 个空位）。摆过的层记在 S.seeded 里，不再重摆 */
  function seedFloor(f, full, own, dt) {
    const sp = S.spots.get(f); if (!sp) return;
    let rec = S.seeded.get(f);
    if (!rec) { rec = { floor: f, cnt: { landing: 0, corridor: 0, flats: 0 }, used: [], flat: new Map(), full: false, done: false, passed: false, t: 0 }; S.seeded.set(f, rec); stockClimb(f, sp); }
    if (rec.done || rec.passed) return;
    if (full) rec.full = true;
    if (own) rec.t += dt;
    const q = quota(f, rec.full); let carry = 0, short = 0, seen = 0;
    for (const c of ['landing', 'corridor', 'flats']) {
      const want = q[c] + carry; carry = 0;
      while (rec.cnt[c] < want) {
        if (S.seedN >= FL.perFrame || (freeSlots() <= FL.reserve && !(own && spareRoom()))) { short += want - rec.cnt[c]; break; } // 人这一层的那一群优先：池子满了腾位置（spareRoom）
        let spot = null;
        if (c === 'flats') { // 住户家里：哪户放得少先放哪户
          const order = [...sp.flats].sort((a, b) => (rec.flat.get(a.unit) || 0) - (rec.flat.get(b.unit) || 0)); let any = false;
          for (const fl of order) { const s = pickSpot(fl.spots, rec, own, sp.y); if (s === false) continue; any = true; if (s) { spot = s; rec.flat.set(fl.unit, (rec.flat.get(fl.unit) || 0) + 1); break; } if (s === undefined) { spot = undefined; break; } }
          if (!any) spot = false;
        } else spot = pickSpot(sp[c], rec, own, sp.y);
        if (spot === false) { carry = want - rec.cnt[c]; break; } // 这一类没地方了：剩下的挪给下一类
        if (spot === null) { seen += want - rec.cnt[c]; break; } // 剩下的地方都离人太近、看得见：人走开了再放
        if (!spot) { short += want - rec.cnt[c]; break; } // 这一帧来不及：下一帧接着放
        const z = spawn({ x: spot.x, y: sp.y, z: spot.z }, { mix: FL.mix, yaw: rng() * Math.PI * 2, seed: f });
        if (!z) { short += want - rec.cnt[c]; break; }
        rec.used.push(spot); rec.cnt[c]++; S.seedN++;
      }
    }
    // 摆满了就不再摆。人在这一层：剩下的只差「都在眼前」过了两秒、池子满着等了 wait 秒，也就这么多了——不能一直拦着楼梯
    if (rec.full && ((!short && (!seen || !own || rec.t > 2)) || (own && rec.t > FL.wait))) rec.done = true;
  }
  /** 池子满着、人这一层那一群还没摆齐：先收一具尸体，再收一只不在人这一层、人看不见、离人最远的尸潮里的（巨尸、扑袭者、喷酸者不收）。
   * 以前尸潮一波波没打完就占满了池子，人上到一层，那一层一只都摆不出来 */
  function spareRoom() {
    if (makeRoom()) return true;
    if (holding()) return false; // 守屋顶时人退到楼里：只按 makeRoom 的规矩收（人看不见、离人 15 米以外的），不从头顶上那层屋面收
    const p = G.player.pos; let far = null, fk = 0;
    for (const z of zombies.pool) {
      if (!z.active || !z.alive || z.seed || z.fixed || z.sweep || z.post || ['brute', 'lunger', 'spitter'].includes(z.kind)) continue;
      const dy = Math.abs(z.pos.y - p.y); if (dy < 2.5) continue;
      const k = Math.hypot(z.pos.x - p.x, z.pos.z - p.z) + dy * 3; if (k > fk) { far = z; fk = k; }
    }
    if (!far || G.physics.lineOfSight?.(_eye.set(p.x, p.y + 1.5, p.z), _head.set(far.pos.x, far.pos.y + 1.5, far.pos.z))) return false;
    far._deactivate(); return true;
  }
  /** 爬楼的补给：每隔 ammo 层上楼梯口放一个弹匣、每隔 medkit 层再放一个医疗包（关卡那层有自己的） */
  function stockClimb(f, sp) {
    const k = climbIdx(f); if (!supplies || k <= 0 || S.plan.gates.some((g) => g.floor === f)) return;
    const kinds = [...(k % FL.ammo === 0 ? ['ammo'] : []), ...(k % FL.medkit === 0 ? ['medkit'] : [])]; if (!kinds.length) return;
    // 放在上楼梯口；没有上楼梯口的落点（北区 15F 往上的复式层只有一头有）就放在别的楼梯口，再没有就放在离上楼梯口最近的走廊 / 住户里——不能悄悄地不放
    const up = upRuns(f)[0]?.a, by = (list) => (up ? [...list].sort((a, b) => Math.hypot(a.x - up.x, a.z - up.z) - Math.hypot(b.x - up.x, b.z - up.z)) : list);
    const ups = sp.landing.filter((l) => l.up), src = ups.length ? ups : sp.landing.length ? sp.landing : by([...sp.corridor, ...sp.flats.flatMap((q) => q.spots)]).slice(0, 1);
    const at = []; for (const q of src) if (!at.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 6)) at.push(q);
    if (!at.length && up) at.push(up);
    for (const q of at) { const spots = lootSpots(nav, { floor: f, x: q.x, y: sp.y, z: q.z }, kinds.length); kinds.forEach((kind, i) => supplies.place(kind, spots[i])); }
  }
  /** 人现在在爬楼的哪一层：{ f, i } 或 null。在楼梯上不算哪一层；
   * stairs（刷怪用）：在楼里的楼梯间上（梯段、休息平台）时算刚离开的那层（S.safeFloor），那层不爬楼就算高度差一层以内最近的那层——
   * 以前人在楼梯上时来的尸潮、特殊感染者、巨尸一只都出不来（警告喊了、名额用了、巨尸那一只就没了） */
  function climbHere(stairs = false) {
    const st = G.physics.stateOf?.(G.player.pos); if (!st) return null;
    if (!st.slope) { const i = climbIdx(st.floor); if (i >= 0) return { f: st.floor, i }; }
    if (!stairs || !onTowerStairs(st)) return null;
    const i = climbIdx(S.safeFloor); if (i >= 0) return { f: S.safeFloor, i };
    const list = climbList(); let best = -1, bd = 4;
    for (let k = 0; k < list.length; k++) { const d = Math.abs(floorY(list[k]) - st.y); if (d < bd) { bd = d; best = k; } }
    return best >= 0 ? { f: list[best], i: best } : null;
  }
  /** 人上到（回到）爬楼的一层：
   *   往上走到的：下面那几层算打过了（再下去、再上来不拦）；
   *   这一层那一群（打死的不算）少了一大截——被回收、走丢了——就把少了的那些从这层看不见的地方补回来（只补一次） */
  function arrived(here) {
    const list = climbList(), pi = climbIdx(S.hereF); S.hereF = here.f;
    if (pi >= 0 && pi < here.i) for (let k = 0; k < here.i; k++) { const r = S.seeded.get(list[k]); if (r) r.passed = true; }
    // 头一回走到中间的楼层：说一声这几层不用清（只有关卡那几层非清不可）
    if (pi >= 0 && pi < here.i && !mustClear(here.f) && !S.passTold) { S.passTold = true; say('这几层不用清干净，冲上楼梯也行——到了关卡那层再清场', 3.5); }
    const rec = S.seeded.get(here.f), sp = S.spots.get(here.f); if (!rec || !sp || rec.passed || rec.topped) return;
    rec.topped = true;
    const q = quota(here.f, true), want = q.landing + q.corridor + q.flats, mine = zalive().filter((z) => z.seed === here.f), dead = rec.killed || 0;
    const add = Math.min(rec.cnt.landing + rec.cnt.corridor + rec.cnt.flats - mine.length - dead, want - mine.length - dead);
    if (mine.length >= FL.refill * want || add <= 0) return;
    let left = add; for (const c of ['flats', 'corridor', 'landing']) { const k = Math.min(left, rec.cnt[c]); rec.cnt[c] -= k; left -= k; }
    rec.done = false; rec.t = 0; rec.used = mine.filter((z) => Math.abs(z.pos.y - sp.y) < 1.5).map((z) => ({ x: z.pos.x, z: z.pos.z }));
    S.refilled = (S.refilled || 0) + add;
  }
  /** 楼上先摆好的那几层守在自己那层（人不在那层、也不在通往那层的那段楼梯上时）：听见动静扑出来的每层最多 FL.down 只，其余的原地站住。
   * 以前北区整层先摆好，人在下一层一开枪整层都涌下来（再被回收掉），人上去一看是空的，楼梯口也不拦 */
  function leashTick(dt, here, st) {
    if ((S.leashT -= dt) > 0) return;
    S.leashT = 0.25;
    const at = here ? here.i : climbIdx(S.safeFloor), id = st?.slope?.id, stairs = onTowerStairs(st);
    const near = (f) => !!st && ((!id && st.floor === f) || (stairs && runs.some((r) => (r.from === f || r.to === f) && ((id && r.slopes.includes(id)) || r.landings.includes(st.floor)))));
    for (const z of zombies.pool) {
      if (!z.active || !z.alive || !z.seed || z.zs !== 'chase' || climbIdx(z.seed) <= at) continue;
      const rec = S.seeded.get(z.seed), y = floorY(z.seed); if (!rec || Math.abs(z.pos.y - y) > 1.2 || near(z.seed)) continue;
      const down = (rec.down ||= new Set());
      for (const q of down) if (!q.active || !q.alive || q.seed !== z.seed || (q.zs === 'idle' && Math.abs(q.pos.y - y) < 1.2)) down.delete(q);
      if (down.has(z)) continue;
      if (down.size < FL.down) down.add(z); else z.calm?.();
    }
  }
  /** 调试看：爬楼摆的被收走 / 换地方的记一笔（最近 40 笔） */
  function logRecycle(z, why, moved, y = z.pos.y) { if (!z.seed) return; S.recycleLog.push({ seed: z.seed, kind: z.kind, why, moved, y: +y.toFixed(1) }); if (S.recycleLog.length > 40) S.recycleLog.shift(); }
  /** 爬楼摆的、那一层还没打过的：困住了 / 追不上的不收走，换到这一层别处看不见的地方（离人 near 米外）重新站好、不追人——那一层的那一群不会少。找不到地方返回 false */
  function reseat(z) {
    const f = z.seed, rec = f && S.hold < 0 && S.seeded.get(f), sp = rec && !rec.passed ? S.spots.get(f) : null; if (!sp) return false; // 守屋顶时楼里的不管
    const p = G.player.pos, list = [...sp.corridor, ...sp.landing, ...sp.flats.flatMap((q) => q.spots)]; _eye.set(p.x, p.y + 1.5, p.z);
    for (let k = 0, i0 = Math.floor(rng() * list.length); k < Math.min(list.length, 16); k++) {
      const q = list[(i0 + k) % list.length];
      if (Math.hypot(q.x - p.x, sp.y - p.y, q.z - p.z) < FL.near || Math.hypot(q.x - z.pos.x, sp.y - z.pos.y, q.z - z.pos.z) < 1.5) continue;
      if (G.physics.lineOfSight?.(_eye, _head.set(q.x, sp.y + 1.5, q.z))) continue;
      const kind = z.kind; z._deactivate();
      spawn({ x: q.x, y: sp.y, z: q.z }, { kind, yaw: rng() * Math.PI * 2, seed: f });
      return true;
    }
    return false;
  }
  function floorsTick(dt) {
    S.wakeT = Math.max(0, (S.wakeT || 0) - dt);
    if (!S.plan || S.stage <= S.plan.armsStage) return;
    const list = climbList(), here = climbHere(), st = G.physics.stateOf?.(G.player.pos);
    S.seedN = 0; S.losN = 0;
    if (here) {
      if (here.f !== S.hereF) arrived(here);
      seedFloor(here.f, true, true, dt); // 自己这一层摆满（离人 near 米外、看不见的地方）
      // 上一层先摆几只（北区整层先摆好）；这一层的关卡还拦着就不摆（上不去）
      const next = list[here.i + 1], g = activeGate(S.plan, S.stage);
      if (next && !(g && g.floor === here.f)) seedFloor(next, !!towerCfg().aheadFull, false, dt);
    } else if (S.stage > S.plan.powerStage && S.hold < 0 && list[0] && !onTowerStairs(st) && G.player.pos.y < floorY(list[0]) - 1) seedFloor(list[0], true, false, dt); // 合闸以后、人还没上来：第一道关那层整层先摆好（人已经在楼顶上了就不摆：池子留给守屋顶的尸群）
    leashTick(dt, here, st);
    // 下面两层以下没在追人的收回去（摆过的层还记着，不会再摆）；上了屋顶，楼里的全收
    if ((S.dropT2 = (S.dropT2 || 0) - dt) <= 0) {
      S.dropT2 = 0.5;
      const roof = st?.floor === tower().roof, lim = roof ? floorY(tower().roof) - 1 : here && here.i >= 1 ? floorY(list[here.i - 1]) - 1.2 : -Infinity;
      for (const z of zombies.pool) if (z.active && z.alive && z.seed && !z.hunt && z.zs === 'idle' && z.pos.y < lim) { logRecycle(z, 'below', false); z._deactivate(); }
    }
    // 屏幕上的目标：这一层还拦着楼梯时写还剩几只（这一层的关卡还没解决就照旧写关卡的事）
    let text = '';
    if (here && S.seeded.get(here.f) && !(activeGate(S.plan, S.stage)?.floor === here.f)) {
      const ups = upRuns(here.f);
      if (ups.length && ups.every((r) => climbRule(r))) text = `清理 ${here.f.split('-').at(-1)}：还剩 ${blockers(here.f).length} 只`;
    }
    if (text !== S.climbText) { S.climbText = text; G.game?.refreshObjective?.(); }
  }
  /** 爬楼的楼层上找刷怪的地方（尸潮、特殊感染者）：这一层的走廊和住户家里（离人 lo–hi 米），加上上下两层的楼梯口（从楼梯间涌出来）。
   * hide：看不见的排在前面（最多试 24 处）。不在爬楼的楼层返回 null */
  function climbSpawns(lo, hi, hide = false) {
    const here = climbHere(true); if (!here) return null;
    const p = G.player.pos, sp = S.spots.get(here.f); if (!sp) return null;
    const out = [], g = activeGate(S.plan, S.stage), add = (q, y) => out.push(new THREE.Vector3(q.x, y, q.z));
    for (const q of [...sp.corridor, ...sp.flats.flatMap((f) => f.spots)]) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d >= lo && d <= hi) add(q, sp.y); }
    for (const n of [here.i - 1, here.i + 1]) {
      const f = climbList()[n], s2 = f && S.spots.get(f); if (!s2 || (n > here.i && g && g.floor === here.f)) continue; // 关卡还拦着：楼上的下不来
      for (const q of s2.landing) if (Math.hypot(q.x - p.x, s2.y - p.y, q.z - p.z) >= 4) add(q, s2.y); // 人在楼梯上时：别贴着人冒出来
    }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    if (hide && out.length) { _eye.set(p.x, p.y + 1.5, p.z); const seen = out.slice(0, 24).map((q) => !!G.physics.lineOfSight?.(_eye, _head.set(q.x, q.y + 1.5, q.z))); const hid = out.filter((q, i) => i < 24 && !seen[i]); if (hid.length) return hid; }
    return out.length ? out : null;
  }
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
        ride: { boardRadio: '上机！机枪交给你：屋顶上的、阳台玻璃后面的、楼下冲出来的，全部清掉。它们会朝飞机扔东西，尖叫的伤得最重，先打。', onBoard: startSweep, spawns: sweepTick, targets: () => (S.sweep ? S.sweep.list.filter((z) => z.alive && z.active) : []), keep: () => true,
          // HUD 红点、辅助瞄准只给飞机上看得见的；敌人开火 / 尖叫先问 canAttack（楼里、楼梯间里、射界外的打不着飞机）
          aimTargets: () => (S.sweep ? S.sweep.list.filter((z) => z.alive && z.active && z.exposeOn) : []), canAttack, outroCam: (pose) => (demo.chosen ? null : roofEdge(pose)),
          // 选了炸楼：机外镜头换到远处、时间拉长，看着楼垮完
          // 炸楼是在飞机上看完的（观看圈）；最后离开那几秒照常切机外镜头（楼都垮了，不用再架在楼顶边上）
          outroTick: (dt) => { if (demo.running) demo.tick(dt); }, outroTitle: () => (demo.chosen ? '<b>大楼已炸毁</b>直升机已离开云澜汇上空' : null),
          ground: (s0) => landAt(nav, s0.x, s0.z, s0.y)?.y ?? 0 } }, // 坠机落在哪：正下方最高的那层楼面（楼顶 / 商场屋面 / 街上）
      text: (c, ride) => textNow(c, ride), markers: () => guestMarks(),
      radio: { intro: '这里是指挥中心。商场已经沦陷，地面出不去。你们被困在三层的店里，手上只有一把刀、两颗手雷。先想办法出去，一层一层往下摸到保安室拿枪，再上公寓楼顶，直升机到那儿接你。'.replace('公寓楼顶', T.roofName) + (G.squad?.wanted ? '保安阿哲和林医生跟你一起走，互相照应。' : ''),
        contact: '它们发现你了！', cut: plan.stages.slice(0, -1).map((st, i) => cutLine(plan, i)), all: `信号弹点着了！直升机 ${SIEGE.hold} 秒后到，守住屋顶！`, low: '你被咬伤了，拉开距离。', done: '指挥中心收到。幸存者已撤离云澜汇——干得漂亮。' } };
    S.plan = plan; S.mission = m; S.flight = flight;
    // 爬楼那几层的落点：从现在起分帧算（商场那段要走好几分钟，进楼时早算好了）
    S.climb = null; S.stairBits = null; S.spots = new Map(); S.spotJob = spotsJob(plan);
    // 清扫要用的点跟着这一局的航线走：换了一局才扔掉重算（从登机点重来是同一局、同一条航线，算好的留着——不然登机那一帧要一口气算完）
    S.prep = null; S.prepOut = null;
    return m;
  }
  const cutLine = (plan, i) => { const st = plan.stages[i], next = plan.stages[i + 1]; return `${({ crank: '手摇柄找到了。', shutter: '卷帘起来了——它们进来了！', crowbar: '撬棍到手。', pry: '撬开了，下二层。', note: '值班表找到了。', card: '门禁卡到手。', gen: `发电机打着了，动静不小——守住 ${MALL.gen.seconds} 秒，等它带起来！`, open: '卷帘开了。', rescue: '卷帘撬开了，里面是个店员，叫小许——他吓坏了，跟紧你。', escort: '到扶梯口了，小许安全了。', sneak: '摸过来了。', fuel: '油桶抬起来了——抬着不能开枪，按 V 放下。', holdout: `开始撬了，${SIEGE.holdout.seconds} 秒——它们从三个方向过来了！` })[st.kind] || ''}${st.kind === 'pistol' ? '手枪到手，跑得比拿刀慢一点。' : st.kind === 'locker' ? '步枪到手——柜子的警报响了，它们全过来了！守住！' : st.kind === 'switch' ? '电来了，电梯能用了——动静不小，它们过来了。' : st.kind === 'tool' ? `${st.tool}到手。` : st.kind === 'gate' ? `${GATES[st.type].name}解决了。` : ''}${next ? next.text + '。' : ''}`; };
  function textNow(c, ride) {
    if (ride?.over) return demo.chosen ? '大楼已炸毁 · 返航' : '清扫完毕 · 返航';
    if (ride && S.sweep) { const w = S.sweep; return `清扫 · 屋顶 ${w.kill.roof}/${w.total.roof} · 阳台 ${w.kill.window}/${w.total.window} · 楼下 ${w.kill.ground}/${w.total.ground}`; }
    if (c.allCut) return S.landed ? `登机 · ${tower().roofName}直升机` : S.hold >= 0 ? '守住屋顶，等直升机' : '等直升机';
    // 屏幕上的目标用短句（长句在平板上折成两行，压住罗盘和响动条）；完整的那句无线电里会说
    if (S.climbText) return S.climbText; // 爬楼：这一层还没清干净
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
    for (const b of balconies.splice(0)) { b.g.removeFromParent(); for (const o of b.occ || []) G.physics?.removeOccluder?.(o); }
    for (const a of acids.splice(0)) a.dispose();
    for (const r of rocks.splice(0)) r.m.removeFromParent();
    if (S.flareLamp) { S.flareLamp.light.decay = 2; S.flareLamp.release(); }
    demo.reset();
    pacing.reset();
    walls.reset(); walls.enabled = enabled; seals?.dispose(); seals = null; for (const q of steps.splice(0)) q.seal.dispose(); shopSeal?.dispose(); shopSeal = null; closedShops = []; hoseBox?.removeFromParent(); hoseBox = null; canMesh.visible = false; G.squad?.leave?.('xu'); G.arms?.setLowered?.(0);
    // 血不会自己回（原游戏的缓慢回血只在零点突围里留着）；医疗包、止痛药、地上的补给只有这个模式有
    G.noRegen = enabled; G.speedMul = 1; if (!enabled) G.weapon?.lock?.([]);
    if (supplies) { supplies.enabled = enabled; supplies.reset(); }
    Object.assign(S, { bombAt: -1, look: null, carry: false, canAt: null, dropT: 0, carryT: 0, sleepers: null, sneakSaid: false, escortT: 0, holdT: 0, holdSpawn: 0, holdDirs: null, holdK: 0, surgeT: 0, surgeSaid: false, stage: 0, noise: 0, quietT: 0, hordeCool: 6, spawnT: 2, hold: -1, waveI: 0, land: -1, landed: false, sweep: null, hasSafe: false, hasInside: false, cores: null, genT: 0, genSpawn: 0, popped: null, tellT: 0, loadout: false, pin: null, fling: null, bruteT: -1, brutes: 0, lastSpecial: '', seeded: new Map(), passTold: false, climbText: '', safeFloor: null, hasFloor: false, run: null, hereF: null, leashT: 0, safeTalk: null, recycleLog: [], bruteTry: 0, refilled: 0, recycleT: 0, wakeT: 0, dropT2: 0, pourQ: null, pourK: 0, retireT: 0, retired: 0, surgeWave: null, flareLamp: null, flareT: 0, trickleT: null });
    // 爬楼摆的丧尸收回去、重新记（读档以后按人站的地方重新摆，不会摆两遍）
    for (const z of zombies.pool) if (z.seed) { if (z.active) z._deactivate(); z.seed = null; }
    // 近战：新开一局只有刀（消防斧在店门外的消火栓箱里）；从存档点重来的等开打第一帧再给（只给不收，见 update 的 meleeSync）
    if (!enabled || !director.state.restore) G.weapon?.setMelee?.('knife'); S.meleeSync = true;
    noiseEl?.classList.toggle('off', !enabled); clockEl?.classList.add('off'); copy();
    if (flow) {
      // 原游戏自己的巡逻、增援、追兵全停（丧尸由这里放）；换回零点突围时还原
      if (enabled && !savedFlow) { savedFlow = { patrol: flow.patrol, waves: flow.waves, pursuitExtra: flow.pursuitExtra }; Object.assign(flow, { patrol: { gull: 0, hound: 0, soldier: 0 }, waves: flow.waves.map(() => ({ gull: 0, hound: 0, soldier: 0 })), pursuitExtra: 0 }); }
      else if (!enabled && savedFlow) { Object.assign(flow, savedFlow); savedFlow = null; }
    }
    G.liftAllow = enabled ? (link, from, to) => (S.plan ? liftRule(S.plan, S.stage, nav, link.id, from, to) : null) : null;
    // 往上的楼梯（快速上楼也一样）：关卡拦着、或者这一层还没清干净（逐层破楼）都不让走；往下照走
    G.stairBlock = enabled ? (run, dir) => { if (!S.plan || dir !== 'up') return null; const g = stairRule(S.plan, S.stage, run); if (g) return g; const c = climbRule(run); if (c) wake(run.from); return c; } : null;
    // 路线指引也得知道哪些电梯、楼梯现在走不了（不然会指你去坐一部到不了那层的电梯）
    G.physics?.pathfinder?.setBlocked?.(enabled ? (c) => {
      if (!S.plan) return false;
      if (c.kind === 'lift') return !!liftRule(S.plan, S.stage, nav, c.link, c.from, c.to);
      const g = activeGate(S.plan, S.stage); if (!g) return false;
      const id = String(c.id).replace(/:reverse$/, '');
      return (g.slopes ||= new Set(runs.filter((r) => g.runs.includes(r.id)).flatMap((r) => r.slopes))).has(id);
    } : null);
    avoidShut();
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
          closedShops.push({ floor: lv.id, poly, rescue: u.id === M.rescue?.unit });
          for (const f of u.wfronts || []) (u.id === M.rescue?.unit ? rescueSegs : segs).push({ x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, y: lv.elev, h: DEFENSE.seal.height, kind: 'door' });
        }
      }
      shopSeal = buildSeals(root, segs);
      if (rescueSegs.length) steps.push({ until: 'rescue', seal: buildSeals(root, rescueSegs) });
      // 店门外的消火栓箱（斧子是补给那边的捡拾物，新开一局才挂进去：placeAxe）
      const AX = M.axe;
      if (AX) { hoseBox = new THREE.Group(); hoseBox.name = '消火栓箱'; hoseBox.position.set(AX.wall.x, AX.y, AX.wall.z); hoseBox.rotation.y = AX.wall.yaw; buildHoseCabinet(hoseBox); root.add(hoseBox); }
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
      S.kit = keep.kit || null; S.rifleKeep = keep.rifle || null; S.hordeCool = 14; syncSeals();
      stock(S.stage - 1); for (let i = S.stage; i < S.plan.stages.length; i++) if (S.plan.stages[i].kind !== 'switch' && S.plan.stages[i].kind !== 'gate') stock(i);
      passBelow(S.plan.stages[S.stage - 1]?.floor);
      return;
    }
    if (!keep) { for (let i = 0; i < S.plan.stages.length; i++) if (S.plan.stages[i].kind !== 'switch' && S.plan.stages[i].kind !== 'gate') stock(i); placeAxe(); }
    // 从登机点重来（坐飞机时被打下来 / 阵亡）：前面的都算完成，直升机已经落好
    // 登机门要重新打开：任务系统重抽时关着的撤离点一律清掉，平时只在直升机落稳那一下（holdTick）开——这里不开就永远上不了飞机
    if (director.state.restore) { S.stage = S.plan.stages.length; for (const g of S.plan.gates) g.block.userData.clear(); S.landed = true; heli.root.visible = true; passBelow(tower().roof); syncSeals(); director.openExtraction?.(); }
  }
  /** 分阶段的卷帘（开局店面、救人那家、两处扶梯口）：那一步已经做完的收起来。读档直接跳到后面的步数（不走 finishStage），也得收——不然看着落着、人却走得过去 */
  function syncSeals() { for (const q of steps) { const k = S.plan?.stageOf?.(q.until) ?? -1; if (q.seal.mesh) q.seal.mesh.visible = !(k >= 0 && k < S.stage); } }
  /** 读档：存档那层（安全点）和它下面爬楼的楼层算已经打过了（不再摆、不拦楼梯；往下走也不会冒出一层新的） */
  function passBelow(floor) {
    const y = floor ? floorY(floor) : -Infinity;
    for (const f of climbList()) if (floorY(f) < y + 0.5) S.seeded.set(f, { floor: f, cnt: { landing: 0, corridor: 0, flats: 0 }, used: [], flat: new Map(), full: true, done: true, passed: true, t: 0 });
  }

  /** 消火栓箱里挂一把斧子（捡拾物：人站到箱子跟前就拿到，近战换成斧子） */
  function placeAxe() {
    const A = S.plan?.mall.axe; if (!supplies || !A || G.weapon?.melee === 'axe') return;
    const [hx, hy, hz] = HOSE_BOX.hang, c = Math.cos(A.wall.yaw), sn = Math.sin(A.wall.yaw);
    const hang = { x: A.wall.x + hx * c + hz * sn, y: A.y + hy, z: A.wall.z - hx * sn + hz * c, yaw: A.wall.yaw }, at = new THREE.Vector3(hang.x, hang.y, hang.z), eye = new THREE.Vector3();
    // 卷帘还落着不能拿；起来了也要真看得见斧子（人在店里隔着墙够不着——以前站在店里贴着墙也捡得到）
    const ready = () => phase() > 0 && (!G.physics?.lineOfSight || G.physics.lineOfSight(eye.set(G.player.pos.x, G.player.pos.y + 1.2, G.player.pos.z), at));
    supplies.place('axe', A, { hang, ready });
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
    S.safeTalk = { t: 0, calm: 0 }; // 「这儿暂时安全」等身边没有在追人的了再说（safeTalkTick）
  }
  /** 安全点那句话：near 米内（上下一层以内）没有在追人的丧尸、连着 calm 秒才说；等了 cap 秒还在打，换一句不说「安全」的 */
  function safeTalkTick(dt) {
    const w = S.safeTalk; if (!w) return;
    const T = SIEGE.safeTalk, p = G.player.pos; let hot = false; w.t += dt;
    for (const z of zombies.pool) if (z.active && z.alive && !z.fixed && z.zs !== 'idle' && Math.abs(z.pos.y - p.y) < 3 && Math.hypot(z.pos.x - p.x, z.pos.z - p.z) < T.near) { hot = true; break; }
    w.calm = hot ? 0 : w.calm + dt;
    if (w.calm >= T.calm) { S.safeTalk = null; G.hud?.radio?.('这儿暂时安全。倒下了从这里重来——柜子里有补给，拿上再走。', 4.5); }
    else if (w.t >= T.cap) { S.safeTalk = null; G.hud?.radio?.('安全点记下了：倒下了从这里重来。柜子里有补给，腾出手再拿。', 4.5); }
  }

  // ---- 响动、尸群 ----
  function addNoise(n, at = G.player?.pos, hear = SIEGE.noise.hear) {
    if (!playing() || !(n > 0)) return;
    S.noise = Math.min(140, S.noise + n); S.quietT = 0;
    if (at) zombies.alert(at, hear);
  }
  function horde(n, { mix = { walker: 0.5, runner: 0.4, bloater: 0.07, screamer: 0.03 }, at = null } = {}) {
    const p = G.player.pos; let made = 0;
    if (!at) {
      // 爬楼的楼层：最多 horde 只，从这层的走廊、住户家里和上下两层的楼梯口涌出来（以前随便撒点，大半落进进不去的住户家里）；
      // 人数按池子里真空着的位置算（尸体也占位置），给每层摆的那群留着；不够的先收最早倒下的尸体腾位置（makeRoom），还不够再截断
      const c = climbSpawns(14, 60, true); if (c) { at = c; n = Math.min(n, FL.horde); }
      while (freeSlots() - FL.hordeReserve < n && makeRoom()) { /* 收一具尸体 */ }
      n = Math.min(n, freeSlots() - FL.hordeReserve);
    }
    for (let k = 0; k < n * 6 && made < n; k++) {
      const q = at ? at[k % at.length] : G.physics.nav.randomPoint(p, 32);
      if (!q || (!at && (Math.hypot(q.x - p.x, q.z - p.z) < 14 || shut(q)))) continue;
      if (spawn(q, { hunt: true, mix, state: 'alert' })) made++;
      else if (!makeRoom()) break; // 池子满了、也腾不出来：别再白试 n × 6 次
    }
    zombies.alert(p, 45, true, 2); // 只叫醒人这一层的（以前上下两层的都认定了人，困在屋里的也一直追、一直占着位置）
    return made;
  }
  /** 住户家里（零零散散地补的时候不往里放：大半的户门太窄，放进去出不来） */
  const homePolys = new Map();
  const inHome = (st) => { let list = homePolys.get(st.floor); if (!list) homePolys.set(st.floor, list = (layout.levels.find((l) => l.id === st.floor)?.units || []).filter((u) => u.residence).flatMap((u) => u.polys || [])); return list.some((p) => pointInPoly([st.x, st.z], p)); };
  const floorAt = (pos) => (G.physics.stateOf?.(pos) || landAt(nav, pos.x, pos.z, pos.y + 0.6))?.floor || null;
  function ambient(dt) {
    if ((S.spawnT -= dt) > 0) return;
    S.spawnT = SIEGE.ambient.every;
    const p = G.player.pos, st = G.physics.stateOf?.(p), floor = st?.floor || '', A = SIEGE.ambient;
    if (climbIdx(floor) >= 0 || onTowerStairs(st)) return; // 爬楼的楼层、楼里的楼梯间：每层自己那一群（floorsTick），不再零零散散地补
    const base = floor === tower().roof ? (S.hold >= 0 || S.landed ? 0 : A.roof) : floor.startsWith(`${tower().id}-`) ? A.tower + Math.min(3, S.stage >> 1) : A.mall + Math.min(4, S.stage);
    const calm = S.stage <= S.plan.armsStage; // 还没拿到步枪：只有零星的行尸
    const target = calm ? (phase() === 0 || S.plan.stages[S.stage]?.kind === 'sneak' ? 0 : SIEGE.quiet) : Math.round(base * pacing.ambient); // 平静时少、升温时多、喘息时不补
    let near = 0; // 只数人这一层的（以前上下一层、同一高度别的楼层上的都算，数够了就不补，人这一层其实是空的）
    for (const z of zalive()) if (!z.seed && !z.fixed && Math.hypot(z.pos.x - p.x, z.pos.z - p.z) < A.drop && Math.abs(z.pos.y - p.y) < 4 && floorAt(z.pos) === floor) near++;
    if (near >= target) return;
    for (let k = 0; k < 6; k++) {
      const q = G.physics.nav.randomPoint(p, A.far), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < A.near || shut(q)) continue;
      // 只放在人这一层、走得到的地方：不在同一高度的别的楼层上、不在范围外、不在住户家里
      const at = landAt(nav, q.x, q.z, q.y + 0.6);
      if (!at || at.floor !== floor || !inArea(at) || inHome(at)) continue;
      const eye = new THREE.Vector3(p.x, p.y + 1.5, p.z), head = new THREE.Vector3(q.x, q.y + 1.5, q.z);
      if (k < 4 && G.physics.lineOfSight?.(eye, head)) continue; // 尽量别在眼前冒出来
      spawn(q, calm ? { kind: 'walker' } : {}); return;
    }
  }
  /**
   * 回收（每 0.5 秒，哪儿都跑，不只是商场）：走远了还在发呆的；寻路连着失败好几次的（困在屋里、卡在墙角）；
   * 追着人却老半天没靠近的（隔着两层以上 / 60 米外）。人看得见的不收。阳台上的、清扫的不归这里管；
   * 爬楼摆的：走远了发呆的由 floorsTick 收；困住的、追不上的，那一层还没打过就换个地方站好（reseat），打过了才收
   */
  function recycle(dt) {
    if ((S.recycleT -= dt) > 0) return;
    S.recycleT = SIEGE.recycle.every;
    const p = G.player.pos, A = SIEGE.ambient, R = SIEGE.recycle; _eye.set(p.x, p.y + 1.5, p.z);
    for (const z of zalive()) {
      if (z.fixed || z.sweep) continue;
      const d = Math.hypot(z.pos.x - p.x, z.pos.z - p.z), dy = Math.abs(z.pos.y - p.y);
      if (!z.seed && !z.hunt && z.zs === 'idle' && (d > A.drop || dy > 9)) { z._deactivate(); continue; }
      let slow = false;
      if (z.hunt && (dy > R.storeys || d > R.far)) { const k = d + dy * 2; if (k < z._best - 2) { z._best = k; z._slowT = 0; } else slow = (z._slowT += R.every) > R.slow; }
      else { z._best = Infinity; z._slowT = 0; }
      // 爬楼摆的、那一层还没打过：不收走，换到那一层别处看不见的地方站好（reseat）；以前直接收掉，北区好几层的那一群人还没到就没了，楼梯口也不拦
      if (((z.noPath || 0) >= R.noPath || slow) && !G.physics.lineOfSight?.(_eye.set(p.x, p.y + 1.5, p.z), _head.set(z.pos.x, z.pos.y + 1.5, z.pos.z))) { const y = z.pos.y, moved = !!z.seed && reseat(z); logRecycle(z, slow ? 'slow' : 'noPath', moved, y); if (!moved) z._deactivate(); }
    }
  }

  // ---- 特殊感染者 ----
  const specialsAlive = () => zalive().filter((z) => z.special).length;
  /** 在人周围找一个看不见的地方放一只（near–far 米）；都看得见就退而求其次 */
  function hidden(nearD = 14, farD = 30) {
    const p = G.player.pos, eye = new THREE.Vector3(p.x, p.y + 1.5, p.z); let fallback = null;
    const c = climbSpawns(nearD, farD); // 爬楼的楼层：这层的走廊、住户家里、上下两层的楼梯口（randomPoint 常挑到进不去的住户家里、同一高度的别的楼层）
    if (c) { for (const q of c.slice(0, 10)) { fallback ||= q; if (!G.physics.lineOfSight?.(eye, new THREE.Vector3(q.x, q.y + 1.5, q.z))) return q; } return fallback; }
    for (let k = 0; k < 10; k++) {
      const q = G.physics.nav.randomPoint(p, farD); if (!q) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < nearD || Math.abs(q.y - p.y) > 4 || shut(q)) continue;
      fallback ||= q;
      if (!G.physics.lineOfSight?.(eye, new THREE.Vector3(q.x, q.y + 1.5, q.z))) return q;
    }
    return fallback;
  }
  /** 排着队还没从楼梯间出来的特殊感染者 */
  const queuedSpecials = () => (S.pourQ || []).reduce((n, e) => n + e.q.filter((it) => it.kind && it.kind !== 'brute').length, 0);
  function spawnSpecial() {
    const cap = S.hold >= 0 ? 2 : pacing.specialCap;
    if (specialsAlive() + queuedSpecials() >= cap) return null;
    // 商场里先见到胖尸、尖叫者、扑袭者；进了楼再加喷酸者。不连着来同一种
    const kinds = (S.stage >= 2 ? ['bloater', 'screamer', 'lunger', 'lunger', 'spitter', 'spitter'] : ['bloater', 'screamer', 'lunger']).filter((k) => k !== S.lastSpecial);
    const kind = kinds[Math.floor(rng() * kinds.length)];
    // 守屋顶时排进楼梯口的队，从楼梯间里面走出来（不在人眼皮底下冒出来）；这一下就出来了返回它
    if (holding()) { let made = null; S.lastSpecial = kind; pour(1, null, null, { kind, then: (z) => { made = z; } }); return made; }
    const q = hidden(); if (!q) return null;
    const z = spawn(q, { kind, hunt: true, state: 'alert' });
    if (z) S.lastSpecial = kind;
    return z;
  }
  /** 巨尸出来了：喊一声、震一下 */
  function bruteSaid(z) { S.brutes++; G.hud?.radio?.('巨尸！别让它近身——打头，边退边打。', 4); say('巨尸来了', 2.6); G.player.addShake?.(0.3); G.events?.emit?.('enemy:telegraph', { enemy: z, pos: z.pos, type: 'soldier', scream: true }); }
  function spawnBrute(at = null) {
    // 守屋顶：排在这一波后面，等这一波从楼梯间涌出来了它再出来（出来了才喊）
    if (holding() && !at) { let made = null; pour(1, null, null, { kind: 'brute', then: (z) => { made = z; z.maxHp = z.hp = Math.round(z.maxHp * holdCfg().bruteHp); bruteSaid(z); } }); return made; }
    const q = at || hidden(16, 30); if (!q) return null;
    const z = spawn(q, { kind: 'brute', hunt: true, state: 'alert' }) || (holding() && makeRoom() ? spawn(q, { kind: 'brute', hunt: true, state: 'alert' }) : null);
    if (z) bruteSaid(z);
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
      if (Math.hypot(p.x - a.to.x, p.z - a.to.z) < a.radius && Math.abs(p.y - a.to.y) < 1.4 && !G.roofGun?.active && (a.tick -= dt) <= 0) { a.tick = 0.5; G.player.damage?.(a.dps * 0.5, a.to); if (S.tellT <= 0) { S.tellT = 2.5; say('酸液！别站在里面', 1.6); } }
    }
  }

  // ---- 楼顶：楼梯间、电梯井占的地方 ----
  /** 这栋楼的外轮廓（缓存） */
  const tb = () => (S.tb?.id === tower().id ? S.tb : (S.tb = { id: tower().id, ...bounds(layout, tower()) }));
  /**
   * 楼顶上楼梯间 / 电梯井（core）的包围盒：用房间那几块多边形合起来的包围盒（电梯井登记成几条 0.1 米宽的墙线，一块块按多边形算等于没有），
   * 再加上到屋顶那几段楼梯的占地。屋顶上画出来的楼梯间、北区的机房是封闭的盒子，里面的从外面看不见
   */
  function housings() {
    const T = tower(); if (S.housings?.roof === T.roof) return S.housings.list;
    const lv = layout.levels.find((l) => l.id === T.roof), list = [];
    const add = (pts, pad = 0) => { if (!pts.length) return; const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]); list.push({ x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad }); };
    for (const r of lv?.rooms || []) if ((r.type === 'stair' || r.type === 'core') && r.polys?.length) add(r.polys.flat());
    for (const r of runs) if (r.to === T.roof) add([r.a, r.b, r.ea, r.eb].filter(Boolean).map((q) => [q.x, q.z]), 0.6);
    S.housings = { roof: T.roof, list };
    return list;
  }
  const inHousing = (x, z, pad = 0) => housings().some((b) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad);
  /** 人站在这栋楼的屋面上（露天：不在楼梯间里）。run.js 拿它把雾退远（屋顶是室外） */
  function onRoof(pos = G.player?.pos) {
    if (!enabled || !S.plan || !pos) return false;
    const st = G.physics.stateOf?.(pos);
    return !!st && !st.slope && st.floor === tower().roof && !inHousing(pos.x, pos.z);
  }
  /** 屋面上露天、站得住的点（step 米一格）：楼顶那一层、站得开、离楼梯间 / 电梯井 0.8 米以外、离停机位 7 米以外、女儿墙里侧 1.4 米以内 */
  function roofGrid(step = 1.5) {
    const { x0, x1, z0, z1 } = tb(), y = padY(), pad = S.plan.pad, out = [];
    for (let x = x0 + 1.4; x <= x1 - 1.4 + 1e-6; x += step) for (let z = z0 + 1.4; z <= z1 - 1.4 + 1e-6; z += step) {
      if (Math.hypot(x - pad.x, z - pad.z) < 7 || inHousing(x, z, 0.8)) continue;
      const st = landAt(nav, x, z, y + 0.6);
      if (st && st.floor === tower().roof && Math.abs(st.y - y) < 0.3 && clear(nav, st)) out.push(Object.assign(new THREE.Vector3(x, st.y, z), { floor: st.floor }));
    }
    return out;
  }
  /** 从 list 里挑 n 个分得开的点（score 给了就先挑分高的）：先要隔 gap 米，不够再放宽到 gap2 */
  function spread(list, n, score = null, gap = 4, gap2 = 1.6) {
    const order = score ? [...list].sort((a, b) => score(b) - score(a)) : shuffle(list, rng), out = [];
    for (const g of [gap, gap2]) for (const q of order) { if (out.length >= n) break; if (!out.includes(q) && !out.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < g)) out.push(q); }
    return out;
  }
  /** 屋面上露天的 n 个点（清扫时屋顶上的丧尸都放在这些点上；以前一半放在楼梯口——那是楼梯间盒子里面，飞机上看不见） */
  const roofOpen = (n, score = null) => spread(roofGrid(), n, score, 1.6, 1.6);
  /**
   * 楼梯间出口：每段上到屋顶的楼梯，沿着从楼梯顶到停机位的路走，第一处离开楼梯间 / 电梯井 1.2 米、看得见停机位的点，周围再撒几个站得住的点
   * （同一个口子出来的不叠在一起）。公寓是两个楼梯间的门口；北区 1 号楼的楼梯间门开在电梯厅里，出口是机房朝停机位那头的过道口
   * （另一头的过道绕回来还得挤 0.9 米的门，不用）。
   * door：这条路离开楼梯间盒子的那一点和往外的方向；gap：门洞（doorGap）；inner：门里头的出生点（innerSpots）——守屋顶时尸群在这些点上冒出来、自己从门里涌出来
   * 要几十条寻路（公寓冷启动五六十毫秒、手机上要卡两三百毫秒）：开局起在后台分帧算（exitsTick，和清扫的点共用每帧的预算），
   * 到用的时候（清掉最后一道关、第一波）还没算完才在这一帧一口气算完
   */
  function roofExits() {
    const T = tower(); if (S.exits?.roof === T.roof) return S.exits.list;
    const it = exitJob(T); while (!it.next().done) { /* 后台没赶上：这一帧算完 */ }
    return S.exits.list;
  }
  /** 楼顶出口那几十条路用自己的一份分帧寻路（和丧尸的同一套算法，格子缓存各管各的）：每展开一个格子就能停，一帧里算多少由 exitsTick 的预算定 */
  const roofPf = createPathfinder(nav);
  function* slicedPath(a, b) {
    let out = null, done = false; roofPf.request(a, b, (p) => { out = p; done = true; });
    while (!done) { roofPf.update(0.25); if (!done) yield; }
    return out;
  }
  /** 这栋楼的出口那一套还在算的那一份（换了楼就扔掉重来） */
  function exitJob(T) { if (S.exitJob?.roof !== T.roof) S.exitJob = { roof: T.roof, it: exitsJob(T) }; return S.exitJob.it; }
  /** 后台分帧算出口：最多 ms 毫秒（一小步就是一条寻路，公寓屋面上一条要几毫秒，超了也只走一步）。返回这一帧花了多少毫秒 */
  function exitsTick(ms) {
    const T = tower(); if (S.exits?.roof === T.roof) return 0;
    const it = exitJob(T), t0 = performance.now();
    while (!it.next().done) if (performance.now() - t0 > ms) break;
    return performance.now() - t0;
  }
  function* exitsJob(T) {
    const y = padY(), pad = S.plan.pad, list = [], eye = new THREE.Vector3(pad.x, y + 1.5, pad.z), head = new THREE.Vector3();
    const sees = (x, z) => G.physics.lineOfSight ? G.physics.lineOfSight(eye, head.set(x, y + 1.5, z)) : true;
    for (const r of runs) {
      if (r.to !== T.roof) continue;
      const path = yield* slicedPath({ floor: T.roof, x: r.b.x, z: r.b.z, y, slope: null }, { floor: T.roof, x: pad.x, z: pad.z, y, slope: null });
      let at = null, door = null;
      for (let i = 1; path && i < path.length && !at; i++) {
        const a = path[i - 1], b = path[i], L = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6;
        for (let u = 0; u <= L && !at; u += 0.2) {
          const x = a.x + (b.x - a.x) * u / L, z = a.z + (b.z - a.z) * u / L;
          if (!door && !inHousing(x, z)) door = { x, z, dx: (b.x - a.x) / L, dz: (b.z - a.z) / L };
          if (!inHousing(x, z, 1.2) && sees(x, z)) at = { x, z };
        }
      }
      if (!at) continue;
      const inner = yield* innerSpots(r, path, door, at);
      const same = list.find((e) => Math.hypot(e.x - at.x, e.z - at.z) < 3); // 北区两个楼梯间走的是同一个过道口
      if (same) { same.inner.push(...inner); same.inner.sort(byExit); continue; }
      const spots = [];
      for (let k = 0; k < 30 && spots.length < 8; k++) {
        const a = k * 2.4, rr = k ? 0.6 + (k % 4) * 0.45 : 0, x = at.x + Math.cos(a) * rr, z = at.z + Math.sin(a) * rr, st = landAt(nav, x, z, y + 0.6);
        if (!st || st.floor !== T.roof || !clear(nav, st) || inHousing(x, z, 0.5) || spots.some((q) => Math.hypot(q.x - x, q.z - z) < 0.6)) continue;
        if (k && G.physics.nav?.clearLine && !G.physics.nav.clearLine({ x: at.x, y, z: at.z }, st)) continue;
        spots.push(new THREE.Vector3(x, st.y, z));
      }
      if (spots.length) list.push({ x: at.x, z: at.z, spots, door, gap: door && doorGap(door), inner });
      yield;
    }
    S.exits = { roof: T.roof, list }; S.exitJob = null;
  }
  /** 门洞：door 那一点挨着的楼梯间盒子的那条边上，往两头量到墙（导航里的墙线）为止。返回 { x, z（门洞正中）, nx, nz（朝外）, w（宽）}；找不着返回 null */
  function doorGap(door) {
    const F = nav.floors.get(tower().roof); if (!F) return null;
    let e = null;
    for (const b of housings()) for (const [ex, ez, nx, nz] of [[b.x0, null, -1, 0], [b.x1, null, 1, 0], [null, b.z0, 0, -1], [null, b.z1, 0, 1]]) {
      const d = ex !== null ? Math.abs(door.x - ex) + Math.max(0, b.z0 - door.z, door.z - b.z1) : Math.abs(door.z - ez) + Math.max(0, b.x0 - door.x, door.x - b.x1);
      if (!e || d < e.d) e = { d, x: ex ?? door.x, z: ez ?? door.z, nx, nz };
    }
    if (!e || e.d > 0.6) return null;
    const ux = Math.abs(e.nz), uz = Math.abs(e.nx); // 沿着这条边
    const wall = (x, z) => (F.walls || []).some((w) => { const dx = w.x1 - w.x0, dz = w.z1 - w.z0, L = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - w.x0) * dx + (z - w.z0) * dz) / L)); return Math.hypot(x - w.x0 - dx * t, z - w.z0 - dz * t) < 0.12; });
    let lo = 0, hi = 0;
    while (lo < 6 && !wall(e.x - ux * lo, e.z - uz * lo)) lo += 0.1;
    while (hi < 6 && !wall(e.x + ux * hi, e.z + uz * hi)) hi += 0.1;
    const c = (hi - lo) / 2;
    return { x: e.x + ux * c, z: e.z + uz * c, nx: e.nx, nz: e.nz, w: lo + hi };
  }
  /**
   * 门里头的出生点（由浅到深，depth 0–3）：0 楼梯顶那块平台上（屋面那一层、楼梯间里、离门洞 0.5 米以上）；1 最上面一跑楼梯的上半段；
   * 2 休息平台、下面一跑楼梯；3 下一层的楼梯口。每一处带一条走出门的路（route，每 0.3 米一个点，到门外 at 那一点）：
   * 平台上的照寻路的结果；楼梯上的顺着楼梯往上走到楼梯顶、再接楼梯顶出门那条（寻路从梯段中间出发会先下到平台再折回来）。走不出去的不要
   */
  function* innerSpots(r, path, door, at) {
    const T = tower(), out = [], y = padY(), goal = landAt(nav, at.x, at.z, y + 0.6), top0 = landAt(nav, r.b.x, r.b.z, y + 0.6);
    const up = goal && top0 && (yield* exitRoute(top0, goal)); if (!up) return out;
    const sl = r.slopes.map((id) => nav.slopeById?.get(id)).filter(Boolean), top = sl.at(-1), low = sl.length > 1 ? sl[0] : null;
    // 楼梯上那一串点：下一层楼梯口 → 下面一跑 → 休息平台 → 上面一跑 → 楼梯顶
    const chain = [], line = (x, yy, z) => {
      const a = chain.at(-1); if (!a) { chain.push(new THREE.Vector3(x, yy, z)); return; }
      const n = Math.max(1, Math.ceil(Math.hypot(x - a.x, z - a.z) / 0.3)); for (let i = 1; i <= n; i++) chain.push(new THREE.Vector3(a.x + (x - a.x) * i / n, a.y + (yy - a.y) * i / n, a.z + (z - a.z) * i / n));
    };
    // 平台上转弯走平台正中（两跑楼梯之间是空的，贴着梯段的头直着横过去会掉进楼梯井）：从梯段的头往外量到平台边，取一半
    const land = r.landings.at(-1), mid = (s, sign) => { let d = 0.1; while (d < 3 && landAt(nav, ...toW(s.F, sign > 0 ? s.len + d : -d, 0), (sign > 0 ? s.y1 : s.y0) + 0.6)?.floor === land) d += 0.1; return Math.max(0.2, (d - 0.1) / 2); };
    for (const s of [low, top]) if (s) {
      const [x0, z0] = toW(s.F, 0, 0), [x1, z1] = toW(s.F, s.len, 0);
      if (s === top && low && land) { const [mx, mz] = toW(s.F, -mid(s, -1), 0); line(mx, s.y0, mz); }
      line(x0, s.y0, z0); line(x1, s.y1, z1);
      if (s === low && top && land) { const [mx, mz] = toW(s.F, s.len + mid(s, 1), 0); line(mx, s.y1, mz); }
    }
    const stairRoute = (q) => { let k = 0, best = Infinity; chain.forEach((c, i) => { const d = Math.hypot(c.x - q.x, c.z - q.z) + Math.abs(c.y - q.y) * 2; if (d < best) { best = d; k = i; } }); return [...chain.slice(k), ...up]; };
    const add = function* (x, z, yy, ok, depth) {
      const st = landAt(nav, x, z, yy + 0.6); if (!st || !ok(st) || !clear(nav, st)) return;
      if (out.some((q) => Math.hypot(q.x - x, q.z - z) < 0.55 && Math.abs(q.y - st.y) < 0.6)) return;
      const route = depth ? stairRoute(st) : yield* exitRoute(st, goal); yield; if (!route) return;
      out.push(Object.assign(new THREE.Vector3(x, st.y, z), { depth, route }));
    };
    const onRoofIn = (st) => st.floor === T.roof && !st.slope, b0 = { x: r.b.x, y, z: r.b.z };
    for (let i = 1; path && i < path.length; i++) {
      const a = path[i - 1], b = path[i], L = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6; let left = false;
      for (let u = 0; u <= L; u += 0.5) { const x = a.x + (b.x - a.x) * u / L, z = a.z + (b.z - a.z) * u / L; if (!inHousing(x, z)) { left = true; break; } if (!door || Math.hypot(x - door.x, z - door.z) > 0.5) yield* add(x, z, y, onRoofIn, 0); }
      if (left) break;
    }
    // 楼梯顶那块平台上别的地方（楼梯间里、屋面那一层、和楼梯顶之间没有墙）：门口看得见楼梯顶的时候（公寓 2 号楼梯间的门正对着信号弹）还有别处可放
    for (let k = 0; k < 24; k++) {
      const a = k * 2.39996, rr = 0.7 + (k % 4) * 0.55, x = r.b.x + Math.cos(a) * rr, z = r.b.z + Math.sin(a) * rr;
      if (!inHousing(x, z, -0.3) || (door && Math.hypot(x - door.x, z - door.z) < 0.9)) continue;
      yield* add(x, z, y, (st) => onRoofIn(st) && (!G.physics.nav?.clearLine || G.physics.nav.clearLine(st, b0)), 0);
    }
    const onSlope = (s) => (st) => st.slope?.id === s.id, yAt = (s, u) => s.y0 + (s.y1 - s.y0) * u / s.len;
    if (top) for (const k of [0.75, 0.45]) { const [x, z] = toW(top.F, top.len * k, 0); yield* add(x, z, yAt(top, top.len * k), onSlope(top), 1); }
    // 休息平台上（两跑楼梯的头各往外一点）
    if (land) for (const s of [top, low]) if (s) { const [x, z] = toW(s.F, s === top ? -0.5 : s.len + 0.5, 0); yield* add(x, z, nav.floors.get(land)?.y ?? 0, (st) => st.floor === land && !st.slope, 2); }
    if (low) { const [x, z] = toW(low.F, low.len * 0.5, 0); yield* add(x, z, yAt(low, low.len * 0.5), onSlope(low), 2); }
    if (r.from !== T.roof) yield* add(r.a.x, r.a.z, nav.floors.get(r.from)?.y ?? 0, (st) => st.floor === r.from && !st.slope, 3);
    return out.sort(byExit);
  }
  /** 出生点的先后：先浅后深，同一层里离门近（出门那条路短）的先用 */
  const byExit = (a, b) => a.depth - b.depth || a.route.length - b.route.length;
  /** 从 st 走到门外 goal 的路，每 0.3 米一个点（丧尸自己寻路时盯着 0.6 米外的下一个拐点抄近道，在门框的墙角上卡住；跟着这么密的点走贴着路走） */
  function* exitRoute(st, goal) {
    const path = yield* slicedPath(st, goal); if (!path?.length) return null;
    const out = [new THREE.Vector3(st.x, st.y, st.z)];
    for (const q of path) {
      const a = out.at(-1), qy = q.y ?? a.y, L = Math.hypot(q.x - a.x, q.z - a.z), n = Math.ceil(L / 0.3);
      for (let i = 1; i <= n; i++) out.push(new THREE.Vector3(a.x + (q.x - a.x) * i / n, a.y + (qy - a.y) * i / n, a.z + (q.z - a.z) * i / n));
    }
    return out;
  }
  /**
   * 守屋顶：贴着人的同时最多 SIEGE.crowd.bite 只在抡、在咬（巨尸一只顶两只）；再贴上来的压着出手的冷却（cool），围在旁边等前面的咬完——
   * 尸群照样挤成一圈，人有时间开枪、往外挤（以前站着不动的人被十几只同时咬，一两秒就没了）
   */
  function biteCap() {
    const p = G.player?.pos; if (!p) return;
    const C = SIEGE.crowd, near = []; let n = 0;
    for (const z of zalive()) {
      if (Math.abs(z.pos.y - p.y) > 1.4) continue;
      const d = Math.hypot(z.pos.x - p.x, z.pos.z - p.z); if (d > C.reach * (z.scale || 1)) continue;
      const w = z.kind === 'brute' ? 2 : 1;
      if (z.zs === 'attack' || z.zs === 'leap' || z.zs === 'pin') n += w; else near.push([d, z, w]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, z, w] of near) { if (n + w <= C.bite) { n += w; continue; } z.cool = Math.max(z.cool || 0, 0.2); }
  }
  /** 守屋顶时队友挨咬：同时最多算 SIEGE.crowd.mateBite 只、每只打 mate 折（squad.js 问这一句）；别的时候照实算 */
  const mateBites = (n) => (holding() ? Math.min(n, SIEGE.crowd.mateBite) * SIEGE.crowd.mate : n);
  /**
   * 从楼梯间里放出来的（exitRoute）：还在楼梯间里、楼梯上的时候照着那条路走出门；出了门（离开楼梯间盒子、上了屋面）交回去自己追人。
   * 每帧压着它自己的重新寻路（planT），被墙挡住清掉的路下一帧再装回去、从离它最近的那个点接着走
   */
  function usherTick(dt) {
    const y = padY();
    for (const z of zalive()) {
      const r = z.exitRoute; if (!r) continue;
      if ((!inHousing(z.pos.x, z.pos.z, 0.3) && Math.abs(z.pos.y - y) < 0.4) || (z.exitT = (z.exitT || 0) + dt) > 20) { z.exitRoute = null; continue; }
      if (z.path !== r) {
        z.pathJob?.cancel?.(); z.pathJob = null; z.path = r;
        let best = Infinity; z.wp = 0; for (let i = 0; i < r.length; i++) { const d = Math.hypot(r[i].x - z.pos.x, r[i].z - z.pos.z) + Math.abs(r[i].y - z.pos.y) * 2; if (d < best) { best = d; z.wp = i; } }
      }
      z.planT = Math.max(z.planT || 0, 0.3);
    }
  }
  /** 在场的队友 */
  const mateList = () => (G.squad?.mates || []).filter((m) => m.active && m.pos);
  /** 这一点在不在人的视野里：只看水平方向（相机水平视角的一半再放宽 SIEGE.spawn.view），不管远近、挡没挡 */
  function inView(q) {
    const p = G.player; if (!p?.pos) return false;
    const cam = G.camera, half = Math.atan(Math.tan(((cam?.fov || 74) * Math.PI) / 360) * (cam?.aspect || 16 / 9)) + SIEGE.spawn.view;
    const dx = q.x - p.pos.x, dz = q.z - p.pos.z, d = Math.hypot(dx, dz); if (d < 1e-6) return true;
    return (-Math.sin(p.yaw || 0) * dx - Math.cos(p.yaw || 0) * dz) / d > Math.cos(Math.min(Math.PI, half));
  }
  /**
   * 守屋顶时这个口子这一只从哪儿出来：门里头的出生点里，人和队友都看不见（头、腰两处都挡着；队友跟着人站进了楼梯间也不在他眼前冒）、离人和队友 SIEGE.spawn.doorNear 米以外、
   * 跟前没有刚出来还没走开的那一处，离门最近的先用（前一只还没走开就放后一处：一只跟着一只从门里出来，不叠在一起）。都不行返回 null（人堵在门口 / 楼梯间里：等一会儿）
   */
  function doorSpot(ex) {
    const list = ex?.inner; if (!list?.length || !G.player?.pos) return null;
    const p = G.player.pos, near = SIEGE.spawn.doorNear, mates = mateList(), live = zalive();
    const eye = new THREE.Vector3(p.x, p.y + 1.6, p.z), meye = new THREE.Vector3(), at = new THREE.Vector3();
    for (const q of list) {
      if (q.distanceTo(p) < near || mates.some((m) => q.distanceTo(m.pos) < near)) continue;
      if (live.some((z) => Math.hypot(z.pos.x - q.x, z.pos.z - q.z) < 0.5 && Math.abs(z.pos.y - q.y) < 1)) continue;
      if (sight(eye, at.set(q.x, q.y + 1.55, q.z)) || sight(eye, at.set(q.x, q.y + 0.8, q.z))) continue;
      if (mates.some((m) => sight(meye.set(m.pos.x, m.pos.y + 1.5, m.pos.z), at.set(q.x, q.y + 1.2, q.z)))) continue;
      return q;
    }
    return null;
  }
  /**
   * 屋顶四边、女儿墙里侧站得住的 n 个点（翻墙上来的）：不在楼梯间里，和停机位之间没有墙（北区只在机房朝停机位那一半——另一半绕过来得挤 0.9 米的门）；
   * 离人、离队友 SIEGE.spawn.rimNear 米以外；先挑人视野外的，再挑视野里、离人 rimSeen 米以外的。凑不够 n 个就少给（差的那几只走楼梯口）
   */
  function roofRim(n) {
    const { x0, x1, z0, z1 } = tb(), y = padY(), pad = S.plan?.pad, at = pad && { x: pad.x, y, z: pad.z }, P = SIEGE.spawn, p = G.player?.pos, mates = mateList(), cand = [];
    const far = (q, d) => (!p || Math.hypot(q.x - p.x, q.z - p.z) >= d) && !mates.some((m) => Math.hypot(q.x - m.pos.x, q.z - m.pos.z) < P.rimNear);
    for (let k = 0; k < n * 14 + 24 && cand.length < n * 4; k++) {
      const side = Math.floor(rng() * 4), u = rng(), x = side === 0 ? x0 + 1.4 : side === 1 ? x1 - 1.4 : x0 + 2 + u * (x1 - x0 - 4), z = side === 2 ? z0 + 1.4 : side === 3 ? z1 - 1.4 : z0 + 2 + u * (z1 - z0 - 4);
      if (!far({ x, z }, P.rimNear)) continue;
      const st = landAt(nav, x, z, y + 0.6);
      if (!st || st.floor !== tower().roof || !clear(nav, st) || inHousing(x, z, 0.8) || (pad && Math.hypot(x - pad.x, z - pad.z) < 7) || cand.some((o) => Math.hypot(o.x - x, o.z - z) < 1.6)) continue;
      if (at && G.physics.nav?.clearLine && !G.physics.nav.clearLine(st, at)) continue;
      cand.push(new THREE.Vector3(x, st.y, z));
    }
    const out = [];
    for (const pass of [0, 1]) for (const q of cand) {
      if (out.length >= n) break;
      if (out.includes(q) || out.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 1.6)) continue;
      const seen = inView(q); if (pass === 0 ? seen : !seen || !far(q, P.rimSeen)) continue;
      out.push(q);
    }
    return out;
  }
  // ---- 楼顶死守、直升机降落 ----
  const holding = () => S.hold >= 0 && !S.landed;
  /** 这栋楼守屋顶的波次：每波几只、第几波带巨尸（楼顶小的楼另有一份，见 TOWERS.*.hold） */
  const holdCfg = () => ({ waveSize: SIEGE.waveSize, brutes: SIEGE.brutes, bruteHp: SIEGE.bruteHp, pour: SIEGE.pour, lanes: 1, laneGap: 0.85, laneIn: 2.5, ...(tower().hold || {}) });
  /**
   * 池子满了：先收最早倒下的尸体；守屋顶时再收人看不见、离人 SIEGE.cull.near 米以外的活丧尸（最远的先收；巨尸、特殊感染者不收）——
   * 人眼前的、追到跟前的一只都不收（以前收的是比屋面低的，人下一层楼就当着面一只只没了）。腾出一个返回 true
   */
  function makeRoom() {
    let old = null;
    for (const z of zombies.pool) if (z.active && !z.alive && (!old || z.dieT > old.dieT)) old = z;
    if (old) { old._deactivate(); return true; }
    if (!holding()) return false;
    const p = G.player.pos, eye = new THREE.Vector3(p.x, p.y + 1.6, p.z), at = new THREE.Vector3(); let far = null, fd = SIEGE.cull.near;
    for (const z of zalive()) {
      if (z.kind === 'brute' || z.special) continue;
      const d = Math.hypot(z.pos.x - p.x, z.pos.y - p.y, z.pos.z - p.z);
      if (d > fd && !sight(eye, at.set(z.pos.x, z.pos.y + 1.5 * (z.scale || 1), z.pos.z)) && !sight(eye, at.set(z.pos.x, z.pos.y + 0.8, z.pos.z))) { far = z; fd = d; }
    }
    if (far) { far._deactivate(); return true; }
    return false;
  }
  /**
   * 楼梯口排着队、池子里全是活着追人的（屋面上的人都看得见，makeRoom 收不了）：每 SIEGE.cull.retire 秒收一只人视野外、离人 retireFar 米以外的
   * （最远的先收；巨尸、特殊感染者不收），最后那阵才涌得上来。腾出一个返回 true
   */
  function retire() {
    if (!holding() || S.retireT > 0) return false;
    const p = G.player.pos; let far = null, fd = SIEGE.cull.retireFar;
    for (const z of zalive()) { if (z.kind === 'brute' || z.special) continue; const d = Math.hypot(z.pos.x - p.x, z.pos.z - p.z); if (d > fd && !inView(z.pos)) { far = z; fd = d; } }
    if (!far) return false;
    far._deactivate(); S.retireT = SIEGE.cull.retire; S.retired = (S.retired || 0) + 1;
    return true;
  }
  /** 点着信号弹：楼里远远落在下面的（比屋面低 below 米以上）收回池子——赶不上来、看不见，还占着名额 */
  function clearBelow() { const y = padY(); for (const z of zalive()) if (y - z.pos.y > SIEGE.below) z._deactivate(); }
  /**
   * 守屋顶：从楼梯间口子出来的那一份排队，每个口子第一只马上出来、之后隔 SIEGE.pour 秒一只——在门里头看不见的地方冒出来（doorSpot），
   * 自己从门里涌出来。wave：{ msg, said }，这一波第一只真出来了才说（池子满了一只都没出来就不说）；尖叫招来的、特殊感染者没有 wave。
   * extra：{ kind（巨尸、特殊感染者：队排满了也照样排上）, then(z)（真出来了以后）}
   */
  function pour(n, mix, wave, extra = null) {
    const ex = roofExits();
    if (!ex.some((e) => e.inner?.length)) { if (horde(n, { mix }) && wave && !wave.said) { wave.said = true; say(wave.msg, 2.2); } return; }
    const Q = (S.pourQ ||= ex.map(() => ({ q: [], t: 0 }))), ok = Q.filter((e, i) => ex[i].inner?.length);
    for (let i = 0; i < n; i++) {
      const e = ok[(S.pourK = (S.pourK || 0) + 1) % ok.length], it = { mix, wave, ...extra };
      if (e.q.length < (holdCfg().queue || SIEGE.spawn.queue) || extra?.kind) e.q.push(it);
    }
    pourTick(0);
  }
  function pourTick(dt) {
    const ex = roofExits(), Q = S.pourQ; if (!Q) return;
    S.retireT = Math.max(0, (S.retireT || 0) - dt);
    Q.forEach((e, i) => {
      e.t -= dt;
      while (e.q.length && e.t <= 0) {
        const it = e.q[0], q = doorSpot(ex[i]), opts = { hunt: true, mix: it.mix, kind: it.kind, state: 'alert' };
        if (!q) { e.t = 0.3; break; } // 门里头每一处都在人眼皮底下（人堵在门口 / 楼梯间里）：过一会儿再看
        const z = spawn(q, opts) || ((makeRoom() || retire()) && spawn(q, opts));
        if (!z) { e.t = 0.3; break; } // 池子满了：过一会儿再试
        z.exitRoute = laneRoute(ex[i], q, (e.lane = (e.lane || 0) + 1)); z.exitT = 0; // 照着算好的路走出门（usherTick），按道并排出门（laneRoute）
        e.q.shift(); e.t += holdCfg().pour; it.then?.(z);
        const w = it.wave; if (w && !w.said) { w.said = true; if (S.land < 0) { say(w.msg, w.secs || 2.2); if (w.shake) G.player.addShake?.(w.shake); } } // 直升机已经在降了：不再喊「第几波」
      }
      if (!e.q.length) e.t = Math.max(0, e.t); // 排空了：下一波的第一只马上出来
    });
  }
  /**
   * 门洞里并排走（holdCfg().lanes 条道）：出门那条路在门里 laneIn 米到门外这一段横着挪到门洞的另一处，几只一排挤出来——
   * 北区只有一个口子、正对着人，以前一只跟着一只出来，在门口就被一枪一个点名打掉。挪过去站不住、穿墙的那条道不用，照原路走
   */
  function laneRoute(ex, q, k) {
    const H = holdCfg(), n = H.lanes || 1, g = ex?.gap, r = q.route; if (n < 2 || !g || !r?.length) return r;
    const lane = k % n; q.lanes ||= [];
    if (q.lanes[lane] !== undefined) return q.lanes[lane] || r;
    const ux = Math.abs(g.nz), uz = Math.abs(g.nx), spread = Math.min(Math.max(0, g.w / 2 - 0.55), H.laneGap * (n - 1) / 2);
    const want = -spread + (2 * spread * lane) / (n - 1), inner = (p) => -((p.x - g.x) * g.nx + (p.z - g.z) * g.nz); // 这条道在门洞里的横向位置；这一点在门里多深
    let ci = 0, cd = Infinity; r.forEach((p, i) => { const d = Math.abs(inner(p)); if (d < cd) { cd = d; ci = i; } }); // 原路穿过门洞的那一点
    const off = want - ((r[ci].x - g.x) * ux + (r[ci].z - g.z) * uz);
    const out = r.map((p, i) => { const w = i >= ci ? 1 : Math.max(0, 1 - inner(p) / H.laneIn); return w > 0 ? new THREE.Vector3(p.x + ux * off * w, p.y, p.z + uz * off * w) : p; });
    const stand = (p) => { const st = landAt(nav, p.x, p.z, p.y + 0.6); return !!st && Math.abs(st.y - p.y) < 0.5 && clear(nav, st); };
    const ok = Math.abs(off) < 0.15 || out.every((p, i) => p === r[i] || (stand(p) && (!i || !G.physics.nav?.clearLine || G.physics.nav.clearLine(out[i - 1], p))));
    q.lanes[lane] = ok ? out : null;
    return q.lanes[lane] || r;
  }
  /** 信号弹的红光：守屋顶、等飞机那一阵人在楼顶上，借灯池里的一盏（不新加灯：加一盏全场着色器都要重编），坐上飞机 / 下了楼顶还回去 */
  function flareLight(dt) {
    const pool = G.render?.lightPool, f = S.plan?.flare, want = !!(pool && f && playing() && S.hold >= 0 && !director.riding && onRoof());
    if (!want) { if (S.flareLamp) { S.flareLamp.light.decay = 2; S.flareLamp.release(); S.flareLamp = null; } return; }
    S.flareLamp ||= pool.acquire?.() || null;
    const L = S.flareLamp?.light, F = SIEGE.flare; if (!L) return;
    S.flareT = (S.flareT || 0) + dt; const t = S.flareT, flick = 0.8 + 0.12 * Math.sin(t * 11.3) + 0.08 * Math.sin(t * 27.1 + 0.7);
    L.color.set(F.color); L.distance = F.distance; L.decay = F.decay; L.position.set(f.x + 0.45, f.y + F.y, f.z + 0.1); L.intensity = F.intensity * flick;
  }
  function holdTick(dt) {
    const heli = director.vehicles.heli;
    if ((S.hold >= 0 || S.landed) && !S.prepOut) prepStep(2); // 清扫要用的点趁守屋顶的时候一点点算
    if (S.hold >= 0 && !S.landed && S.land < 0) {
      S.hold += dt;
      const H = holdCfg();
      while (S.waveI < SIEGE.waves.length && S.hold >= SIEGE.waves[S.waveI]) {
        S.waveI++;
        const n = H.waveSize[0] + Math.floor(rng() * (H.waveSize[1] - H.waveSize[0] + 1)), over = Math.round(n * SIEGE.rim), rim = roofRim(over);
        // 越往后奔尸越多；一半从楼梯口冲上来（排着队从门里涌出来），一半翻女儿墙上来（四面都有，守不住一个口子）
        const r = H.runner || 0, mix = { walker: Math.max(0.2 - r, 0.45 - S.waveI * 0.03 - r), runner: 0.45 + S.waveI * 0.03 + r, bloater: 0.07, screamer: 0.03 };
        const wave = { msg: rim.length ? `第 ${S.waveI} 波！楼梯口和女儿墙` : `第 ${S.waveI} 波！楼梯口`, said: false };
        if (rim.length && horde(rim.length, { at: rim, mix })) { wave.said = true; say(wave.msg, 2.2); }
        pour(n - rim.length, mix, wave);
        if (H.brutes.includes(S.waveI)) spawnBrute();
        else if (S.waveI % 2 === 1 && S.waveI > 1) spawnSpecial();
      }
      // 最后十几秒：一刻不停地涌上来
      if (S.hold > SIEGE.hold - SIEGE.surge.last && (S.surgeT -= dt) <= 0) {
        S.surgeT = SIEGE.surge.every; const mix = SIEGE.surge.mix, rim = roofRim(1);
        const w = (S.surgeWave ||= { msg: '它们全涌上来了——顶住！', secs: 2.6, shake: 0.3, said: false });
        if (rim.length && horde(rim.length, { at: rim, mix }) && !w.said) { w.said = true; say(w.msg, w.secs); G.player.addShake?.(w.shake); }
        pour((H.surgeEach || SIEGE.surge.each) - rim.length, mix, w);
        S.surgeSaid = w.said;
      }
      pourTick(dt); usherTick(dt); biteCap();
      const left = Math.max(0, SIEGE.hold - S.hold);
      if (clockEl) { clockEl.classList.remove('off'); clockEl.textContent = `直升机 ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.ceil(left % 60)).padStart(2, '0')}`; }
      if (S.hold >= SIEGE.hold) { S.land = 0; heli.root.visible = true; G.hud?.radio?.('直升机到了，正在降落！到登机门去！', 4); if (clockEl) clockEl.textContent = '直升机降落中'; }
    }
    if (S.land >= 0 && !S.landed) {
      // 从正上方 45 米降下来
      S.land += dt;
      pourTick(dt); usherTick(dt); biteCap();
      const k = Math.min(1, S.land / SIEGE.land), e = 1 - (1 - k) * (1 - k), pad = S.plan.pad;
      heli.setPose({ x: pad.x, y: padY() + 45 * (1 - e), z: pad.z, yaw: pad.yaw, pitch: 0, roll: 0 }, Math.sin(S.land * 6) * 0.03);
      if (k >= 1) { S.landed = true; heli.reset(); clockEl?.classList.add('off'); for (const e of S.pourQ || []) e.q.length = 0; director.openExtraction(); G.game?.refreshObjective?.(); }
    } else if (S.landed) boardTick(dt);
  }
  /** 落稳了、人还没上飞机（从登机点重来的也一样）：门里零零星星出来几只（SIEGE.board），贴着人同时咬的照样封顶 */
  function boardTick(dt) {
    const B = SIEGE.board, y = padY();
    if ((S.trickleT = (S.trickleT ?? B.every) - dt) <= 0) {
      S.trickleT = B.every; let n = 0; for (const z of zalive()) if (Math.abs(z.pos.y - y) < 1.5) n++;
      if (onRoof() && n < B.alive) pour(1, B.mix, null);
    }
    pourTick(dt); usherTick(dt); biteCap();
  }

  // ---- 登机以后：清扫 ----
  const _gunEye = new THREE.Vector3(), _chest = new THREE.Vector3(), _aim = { yaw: 0, pitch: 0, dist: 0 };
  const chestOf = (q, out = _chest, k = 1) => out.set(q.x, q.y + 1.15 * k, q.z);
  const sight = (a, b) => (G.physics.sightAcross ? G.physics.sightAcross(a, b) : G.physics.lineOfSight ? G.physics.lineOfSight(a, b) : true);
  /** 楼顶上的：视线从楼外进来，过女儿墙那一处要高过墙顶（女儿墙只画在画面上，导航里没有） */
  function overParapet(eye, at) {
    const { x0, x1, z0, z1 } = tb(), top = padY() + (tower().parapet ?? 1.2);
    if (eye.x > x0 && eye.x < x1 && eye.z > z0 && eye.z < z1) return true; // 飞机在楼顶正上方
    const dx = eye.x - at.x, dz = eye.z - at.z; let t = 1;
    if (dx > 1e-9) t = Math.min(t, (x1 - at.x) / dx); else if (dx < -1e-9) t = Math.min(t, (x0 - at.x) / dx);
    if (dz > 1e-9) t = Math.min(t, (z1 - at.z) / dz); else if (dz < -1e-9) t = Math.min(t, (z0 - at.z) / dz);
    return at.y + (eye.y - at.y) * Math.max(0, t) >= top;
  }
  /** 从 f（heliGun 算的人眼、枪架）看 at：在机枪射界里、楼顶上的越得过女儿墙、中间没有墙和楼板（跨楼层） */
  function seenFrom(f, at, roof = false) { return inGunArc(aimAngles(f.q, f.eye, at, _aim)) && (!roof || overParapet(f.eye, at)) && sight(f.eye, at); }
  /** 还在自己那一层（屋面 / 街上 / 商场屋面；上了楼梯、进了楼就不算）。刚放出来还没走过一步的按高度看 */
  function onAnchor(z) {
    if (!z.anchor) return true;
    const st = G.physics.stateOf?.(z.pos);
    return st ? !st.slope && st.floor === z.anchor : Math.abs(z.pos.y - z.anchorY) < 0.6;
  }
  const balconyOf = (z) => balconies.find((b) => b.z === z) || null;
  /**
   * 飞机上这一刻从 at 那一点（z 的胸口，或者它扔东西出手的地方）看不看得见、机枪转不转得过去：阳台上的——飞机在阳台外面那一侧；
   * 守点的——还在自己那一层、不在楼梯间里；中间没有墙、楼板挡着（跨楼层查）；在射界里；楼顶上的越得过女儿墙。没有机枪（测试）就从机身中心看、不管射界
   */
  function exposedAt(at, z) {
    const gun = G.missions?.doorGun, eye = gun?.eye ? gun.eye(_gunEye) : G.missions?.vehicleCenter?.();
    if (!eye) return false;
    const b = z && balconyOf(z);
    if (b) { if ((eye.x - b.s.x) * b.s.nx + (eye.z - b.s.z) * b.s.nz <= 0.5) return false; }
    else if (z?.pouring || (z?.post && (!onAnchor(z) || (z.anchor === tower().roof && inHousing(z.pos.x, z.pos.z))))) return false; // 还在楼梯间里往外涌的也不算
    if (gun?.canAim && !gun.canAim(at, eye)) return false;
    if (z?.anchor === tower().roof && !overParapet(eye, at)) return false;
    return sight(eye, at);
  }
  const exposedNow = (z) => !!z?.alive && !!z.active && exposedAt(chestOf(z.pos, _chest, z.scale || 1), z);
  /**
   * 坐飞机时这只能不能打飞机（missions.js 的敌人开火、尖叫者叫之前都问这一句）：清扫的丧尸要飞机上看得见、机枪够得着。
   * how 不给：看缓存（露没露出来）；true：当场算；事件（砸过来的东西带着出手的点 from）：从那一点当场算
   */
  function canAttack(z, how) {
    if (!S.sweep || !z?.zombie || !S.sweep.list.includes(z)) return true;
    if (how?.from) return exposedAt(how.from, z);
    return how ? exposedNow(z) : !!z.exposeOn;
  }
  /** 每帧轮着查几只（一只 every 秒左右查一遍）：连着看得见 on 秒才算露出来、连着看不见 off 秒才算藏起来 */
  function exposeTick(dt, live) {
    const X = SIEGE.sweep.expose, sw = S.sweep;
    if (!live.length) return;
    for (const z of live) z.expDt = (z.expDt || 0) + dt;
    const n = Math.min(live.length, Math.ceil(live.length * dt / X.every - 1e-9) || 1);
    for (let k = 0; k < n; k++) {
      const z = live[(sw.rr = (sw.rr + 1) % live.length)], raw = exposedNow(z), el = z.expDt; z.expDt = 0;
      if (raw === z.expRaw) z.expRun = (z.expRun || 0) + el; else { z.expRaw = raw; z.expRun = 0; }
      if (raw && !z.exposeOn && z.expRun >= X.on - 1e-6) z.exposeOn = true;
      else if (!raw && z.exposeOn && z.expRun >= X.off - 1e-6) z.exposeOn = false;
    }
  }
  /** 放一只守点的：q 是它的点（带 floor），group 是哪一拨（roof / ground）。看不看得见从头算 */
  function spawnPosted(q, group, kind, mix = null) {
    const z = spawn(new THREE.Vector3(q.x, q.y, q.z), { kind, mix, post: q, anchor: q.floor });
    if (!z) return null;
    Object.assign(z, { sweep: group, offT: 0, houseT: 0, pouring: false, kept: false, exposeOn: false, expRaw: false, expRun: 0, expDt: 0, postQ: q }); // postQ：它守的那个备选点本身（z.post 是拷贝），换点时直接看那一点这一轮的 seen
    if (group === 'roof') { z.side = q.side ?? sideOf(q); if (kind === 'screamer') S.sweep.screamer = true; }
    if (!S.sweep.list.includes(z)) S.sweep.list.push(z);
    return z;
  }
  /** 打死、收回的：飞着的那块东西还会落下来，但不再算砸中 */
  const disarm = (z) => { for (const r of rocks) if (r.by === z) r.by = null; };
  /** 离开了自己那一层（钻进楼梯、楼里）：收回来，在同一拨的点上重放一只同样的（不算打死）。down：屋顶上的换到楼下 */
  function respawnPosted(z, down = false) {
    const sw = S.sweep, group = z.sweep, kind = z.kind, roof = !down && z.anchor === tower().roof, anchor = z.anchor, kept = z.kept;
    const i = sw.list.indexOf(z); if (i >= 0) sw.list.splice(i, 1);
    z.sweep = null; disarm(z); z._deactivate();
    const pool = roof ? sw.roofPool : sw.groundPool.filter((q) => down || q.floor === anchor), taken = sw.list.map((o) => o.post).filter(Boolean);
    const free = pool.filter((q) => !taken.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < 1.2));
    const q = free.find((p) => p.seen) || free[Math.floor(rng() * free.length)] || pool[0], o = q && spawnPosted(q, group, kind);
    if (!o && group) sw.total[group]--; // 放不回去了（池子满了）：从总数里去掉，HUD 和「全部清掉了」对得上
    if (o) o.kept = kept;
    return o || null;
  }
  /** 楼下守点的跟着飞机挪：按 lead 秒以后飞机的位置，现在的点那时看不见了，就换到走得到、那时看得见、没人占着的最近一点；屋顶那一拨往集结点涌（surge） */
  // 每 every 秒一轮：先按 lead 秒以后飞机的位置给备选点打分（分到 spread × every 秒里的各帧，一帧最多 ms 毫秒——以前一帧里打一百多条跨楼层射线，
  // 清扫时每秒卡一下），打完分再挪人（它守的点这一轮的分直接用，不再打一遍）
  function repostTick(dt, rideT, live) {
    const sw = S.sweep, P = SIEGE.sweep.post, roofId = tower().roof;
    sw.postT -= dt;
    if (!sw.rp) {
      if (sw.postT > 0) return;
      // 还在停机位上方往上拔的时候（机枪对着天、看不着脚下）按刚飞出去那一会儿的位置算：屋顶那一拨先往飞机要去的那一边涌
      const h = S.flight.poseAt(Math.max(rideT, S.flight.times.roof) + P.lead); sw.postT = P.every; heliGun(h, sw.frame); sw.foot = { x: h.x, z: h.z };
      sw.rp = { k: 0, pass: (sw.pass = (sw.pass || 0) + 1) };
    }
    const f = sw.frame, R = sw.rp, nr = sw.roofPool.length, all = nr + sw.groundPool.length;
    const n = Math.max(1, Math.ceil(all * dt / (P.every * P.spread))), t0 = performance.now();
    for (let c = 0; c < n && R.k < all; c++) {
      const roof = R.k < nr, q = roof ? sw.roofPool[R.k] : sw.groundPool[R.k - nr]; R.k++;
      q.seen = seenFrom(f, chestOf(q), roof); q.pass = R.pass;
      if (performance.now() - t0 > P.ms) break;
    }
    if (R.k < all) return;
    sw.rp = null;
    surge(live.filter((z) => z.post && z.anchor === roofId));
    const taken = live.map((z) => z.post).filter(Boolean);
    for (const z of live) {
      if (!z.post || z.anchor === roofId) continue;
      const mine = z.postQ?.pooled && z.postQ.pass === R.pass && Math.hypot(z.postQ.x - z.post.x, z.postQ.z - z.post.z) < 1e-6;
      if (mine ? z.postQ.seen : seenFrom(f, chestOf(z.post))) continue;
      const near = sw.groundPool.filter((q) => q.seen && q.floor === z.anchor && !taken.some((p) => p !== z.post && Math.hypot(p.x - q.x, p.z - q.z) < 1.2))
        .map((q) => [q, Math.hypot(q.x - z.pos.x, q.z - z.pos.z)]).filter(([, d]) => d < P.groundWalk).sort((a, b) => a[1] - b[1]);
      if (near.length && z.repost(near[0][0])) z.postQ = near[0][0];
    }
  }
  /**
   * 屋顶那一拨往飞机那一边涌：每一块屋面（side）上挑几处集结点——这一轮看得见的点里离 lead 秒以后的飞机最近的（隔 gap 米；那一块一处都看不见就挑离飞机最近的），
   * 一处大约 per 只；每只冲向离自己近、还没挤满的那一处，在它周围 r 米里挤着（每轮 churn 成的换个位置）。飞机绕着楼转，集结点跟着转，尸群就一直追着飞机跑
   */
  function surge(mob) {
    const U = SIEGE.sweep.surge, sw = S.sweep, h = sw.foot || S.flight.poseAt(S.flight.times.roof + SIEGE.sweep.post.lead), by = new Map(), R = new Map();
    for (const q of sw.roofPool) { if (!by.has(q.side)) by.set(q.side, []); by.get(q.side).push(q); }
    // 离飞机（水平）near 米上下最好：飞机还在屋面上方的时候不挤到它正下方（机枪俯不下去、被枪身挡着），一圈站在斜下方
    const d = (q) => Math.abs(Math.hypot(q.x - h.x, q.z - h.z) - U.near);
    for (const [side, l] of by) {
      const n = mob.filter((z) => z.side === side).length, k = Math.max(1, Math.min(U.rally, Math.ceil(n / U.per))), seen = l.filter((q) => q.seen), pick = [];
      for (const q of (seen.length ? seen : l).sort((a, b) => d(a) - d(b))) { if (pick.length >= k) break; if (!pick.some((o) => Math.hypot(o.q.x - q.x, o.q.z - q.z) < U.gap)) pick.push({ q, n: 0, cap: Math.ceil(n / k) + 1 }); }
      R.set(side, pick);
    }
    sw.rally = R;
    const e = (p) => Math.hypot(p.x - h.x, p.z - h.z);
    for (const z of [...mob].sort((a, b) => e(a.pos) - e(b.pos))) surgeOne(z);
  }
  /** 一只冲向它那一块屋面上离它近、还没挤满的集结点，在周围挤着（刚出门的、刚编进来的不等下一轮，马上冲） */
  function surgeOne(z) {
    const U = SIEGE.sweep.surge, l = S.sweep.rally?.get(z.side); if (!l?.length || !z.post) return;
    let best = null, bd = Infinity; const hop = rng() < U.swap; // 有几成换到另一处去挤（屋面小、飞机一直在同一头的时候也不站死）
    for (const r of l) { const e = Math.hypot(r.q.x - z.pos.x, r.q.z - z.pos.z) * (hop ? -1 : 1) + (r.n >= r.cap ? 1e3 : 0); if (e < bd) { bd = e; best = r; } }
    best.n++;
    if (z.surgeR === undefined || rng() < U.churn) { z.surgeA = rng() * Math.PI * 2; z.surgeR = Math.sqrt(rng()) * U.r; }
    const q = surgeSpot(best.q, z.surgeA, z.surgeR);
    if (Math.hypot(q.x - z.post.x, q.z - z.post.z) < 1.5) z.post.copy(q); else z.repost(q); // 挪得不多：只改目标，不打断它正走的路
  }
  /** 集结点 c 周围 r 米、a 方向那一点：屋面上露天、站得住、离女儿墙 1 米、离楼梯间 0.6 米、离停机位 6 米以外，和 c 之间直线走得通；不行就近一半，再不行就 c */
  const _sp = new THREE.Vector3();
  function surgeSpot(c, a, r) {
    const y = padY(), { x0, x1, z0, z1 } = tb(), pad = S.plan.pad;
    for (const k of [1, 0.5]) {
      const x = c.x + Math.cos(a) * r * k, z = c.z + Math.sin(a) * r * k;
      if (x < x0 + 1 || x > x1 - 1 || z < z0 + 1 || z > z1 - 1 || inHousing(x, z, 0.6) || Math.hypot(x - pad.x, z - pad.z) < 6) continue;
      const st = landAt(nav, x, z, y + 0.6);
      if (st && st.floor === tower().roof && Math.abs(st.y - y) < 0.3 && clear(nav, st) && (!G.physics.nav?.clearLine || G.physics.nav.clearLine(c, st))) return _sp.set(x, st.y, z);
    }
    return c;
  }
  /** 屋面上的这一点属于哪一块（side）：离它最近、直线走得通的备选点那一块 */
  function sideOf(p) {
    const l = S.sweep.roofPool.map((q) => [q, Math.hypot(q.x - p.x, q.z - p.z)]).sort((a, b) => a[1] - b[1]).slice(0, 6);
    const hit = l.find(([q]) => !G.physics.nav?.clearLine || G.physics.nav.clearLine(p, q));
    return (hit || l[0])?.[0].side ?? 0;
  }
  /**
   * 守屋顶剩下的、刚从门里出来的编进屋顶那一拨。pouring：还在楼梯间里、楼梯上，照着出门的路往外走（usherTick），出了门再改成守点的（roofPour）；
   * kept：起飞时守屋顶剩下的（不是新放的）
   */
  function enlist(z, { pouring = false, kept = false } = {}) {
    Object.assign(z, { sweep: 'roof', offT: 0, houseT: 0, pouring, kept, exposeOn: false, expRaw: false, expRun: 0, expDt: 0, postQ: null, surgeR: undefined });
    if (!pouring && z.guard(z.pos, tower().roof)) { z.side = sideOf(z.pos); surgeOne(z); }
    if (!S.sweep.list.includes(z)) S.sweep.list.push(z);
  }
  /**
   * 屋顶那一拨还没出来的：从楼梯间门里一只只涌出来（每个门 every 秒一只，在门里头的出生点冒出来、照着出门的路走出来）；屋顶上已经 peak 只了就等打掉几只。
   * 出了门的改成守点的、马上冲向集结点。这栋楼没有门里的出生点：放在屋面上的备选点上
   */
  function roofPour(dt, live) {
    const U = SIEGE.sweep.surge, sw = S.sweep, P = sw.pour, roofId = tower().roof;
    for (const z of live) if (z.pouring && !z.exitRoute) { z.pouring = false; if (z.guard(z.pos, roofId)) { z.side = sideOf(z.pos); surgeOne(z); } }
    if (P.left <= 0) return;
    let up = live.filter((z) => z.sweep === 'roof').length;
    const ex = roofExits().filter((e) => e.inner?.length), born = (z) => { P.left--; up++; live.push(z); };
    if (!ex.length) {
      if ((P.t -= dt) > 0 || up >= U.peak) return;
      P.t = U.every; const q = sw.roofPool[Math.floor(rng() * sw.roofPool.length)], z = q && (spawnPosted(q, 'roof', sw.screamer ? undefined : 'screamer', U.mix) || (makeRoom() && spawnPosted(q, 'roof', undefined, U.mix)));
      if (z) born(z);
      return;
    }
    P.ts ||= ex.map((_, i) => U.first + (i * U.every) / ex.length);
    ex.forEach((e, i) => {
      if (P.left <= 0 || (P.ts[i] -= dt) > 0) return;
      P.ts[i] = 0.2; if (up >= U.peak) return;
      const q = e.inner.find((p) => !live.some((z) => Math.hypot(z.pos.x - p.x, z.pos.z - p.z) < 0.6 && Math.abs(z.pos.y - p.y) < 1)); if (!q) return; // 门里头每一处都还站着刚出来的：等它走开
      const opts = { hunt: true, state: 'alert', mix: U.mix, kind: sw.screamer ? undefined : 'screamer' }, z = spawn(q, opts) || (makeRoom() && spawn(q, opts));
      if (!z) return;
      if (z.kind === 'screamer') sw.screamer = true;
      z.exitRoute = laneRoute(e, q, (P.lane = (P.lane || 0) + 1)); z.exitT = 0;
      enlist(z, { pouring: true }); born(z); P.ts[i] = U.every;
    });
  }
  /**
   * 清扫要用的点：屋面上露天的点、楼下（街上、商场屋面）离外墙 6–22 米一圈的点，各按航线上看得见几成打分；还有航线上隔几秒的飞机（人眼、枪架）。
   * 算起来要几百毫秒：守屋顶、等登机那一阵每帧算一小段（不卡），登机时没算完的一次算完（prepStep）
   */
  function* sweepPrep() {
    const W = SIEGE.sweep, F = S.flight, T = tower(), out = {};
    // 楼下撒点用自己的随机数（种子取这一局的关卡位置）：开局就在后台算，不能搅乱这一局别处要用的随机序列
    let seed = 7; for (const st of S.plan?.stages || []) seed = (seed * 31 + Math.round(st.site.x * 10) * 7 + Math.round(st.site.z * 10)) % 2147483647;
    seed = (Math.abs(seed) % 2147483646) + 1; const prng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lapT = (F.times.windows - F.times.roof) / 0.75, frames = (t0, t1, every) => { const l = []; for (let t = t0; t < t1; t += every) l.push(heliGun(F.poseAt(t))); return l; };
    // 看得见几成：每查两帧（两条跨楼层射线，长的一条半毫秒）让一下
    function* share(q, list, roof = false) { let n = 0, k = 0; const at = chestOf(q, new THREE.Vector3()); for (const f of list) { if (seenFrom(f, at, roof)) n++; if (++k % 2 === 0 || k === list.length) yield; } return list.length ? n / list.length : 0; }
    out.roofFrames = frames(F.times.roof + 1, F.times.windows, 2.5); out.lowFrames = frames(F.times.ground, F.times.ground + lapT, 2.5); out.allFrames = frames(6, F.times.ground + lapT, 5);
    yield;
    // 屋顶：露天的点（不在楼梯间里），按屋顶那一段航线上看得见几成
    const grid = roofGrid(2.5); yield;
    for (const q of grid) q.score = yield* share(q, out.roofFrames, true);
    // 先隔 5 米铺满整个屋面（屋顶那一拨要往飞机那一边涌，哪一边都得有点），再按分数补到 roofPool 个（以前只挑分高的，全挤在西边一条上）
    out.roofPool = spread(grid, W.post.roofPool, (q) => q.score, 5, 2.4);
    // 屋面被机房、楼梯间（以后还有架机枪的台子）隔开的几块：相邻（7 米内）两点直线走得通就算同一块（side），屋顶那一拨只往自己那一块的集结点冲
    const rp = out.roofPool, up = rp.map((_, i) => i), find = (i) => (up[i] === i ? i : (up[i] = find(up[i])));
    for (let i = 0; i < rp.length; i++) {
      for (let j = i + 1; j < rp.length; j++) if (find(i) !== find(j) && Math.hypot(rp[i].x - rp[j].x, rp[i].z - rp[j].z) < 7 && (!G.physics.nav?.clearLine || G.physics.nav.clearLine(rp[i], rp[j]))) up[find(i)] = find(j);
      yield;
    }
    rp.forEach((q, i) => { q.side = find(i); });
    // 楼下：一次只撒一个点（撒点要找落脚的楼面，一个点就要一两毫秒），分得开的收下
    const ground = [];
    for (let k = 0; k < 160 && ground.length < W.post.groundPool; k++) {
      for (const q of groundSpots(nav, layout, 1, prng, T, 6, 22, k % 2 === 1)) if (!ground.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 2.5)) ground.push(Object.assign(new THREE.Vector3(q.x, q.y, q.z), { floor: q.where === 'mall' ? 'P1-RF' : 'ground', where: q.where }));
      yield;
    }
    for (const q of ground) q.score = yield* share(q, out.allFrames);
    out.groundPool = ground;
    for (const q of [...out.roofPool, ...ground]) q.pooled = true; // 备选点：repostTick 每一轮给它们打 seen
    S.prepOut = out;
  }
  /** 往下算 ms 毫秒（Infinity：算完）。每一小步最多查两条跨楼层视线、撒一个点，预算守得住 */
  function prepStep(ms) {
    if (S.prepOut || !S.flight) return;
    S.prep ||= sweepPrep();
    const t0 = performance.now();
    while (!S.prep.next().done) if (performance.now() - t0 > ms) return;
  }
  function startSweep() {
    const W = SIEGE.sweep, U = W.surge, T = tower();
    prepStep(Infinity);
    const P = S.prepOut;
    // 守屋顶剩下的活的：屋面上露天的（普通的几种，巨尸、特殊感染者不算）接着当屋顶那一拨；还在楼梯间里、楼梯上照着出门的路往外走的接着往外涌；别的收掉。
    // 最多留 peak − min 只：起飞时门里总还有 min 只涌得出来（头一只是尖叫者）
    const keep = [], out = [];
    for (const z of zalive()) {
      const st = G.physics.stateOf?.(z.pos), ok = !z.special && z.kind !== 'brute' && !z.fixed && !z.post && keep.length + out.length < U.peak - U.min && typeof z.guard === 'function';
      if (ok && st && !st.slope && st.floor === T.roof && !inHousing(z.pos.x, z.pos.z)) keep.push(z);
      else if (ok && z.exitRoute) out.push(z);
      else z._deactivate();
    }
    const sw = { list: [], kill: { roof: 0, window: 0, ground: 0 }, total: { roof: 0, window: 0, ground: W.ground }, made: { ground: 0 }, t: 0, tick: 0, throwT: W.throw.first, offered: false,
      roofPool: P.roofPool, groundPool: P.groundPool, rr: 0, postT: 0.5, down: false, frame: { eye: new THREE.Vector3(), q: new THREE.Quaternion() }, pour: { left: 0, t: U.first }, screamer: false, foot: null };
    S.sweep = sw;
    for (const z of keep) enlist(z, { kept: true });
    for (const z of out) enlist(z, { pouring: true, kept: true });
    // 不够 start 只：当场补到 start 只，放在露天、看得见得多的点上、互相分开（以前一半在楼梯口——那是楼梯间的盒子里面，飞机上看不见、打不着）；头一只是尖叫者
    const n0 = Math.max(0, U.start - keep.length - out.length), roofAt = spread(sw.roofPool.filter((q) => q.score > 0), n0, (q) => q.score, 4, 1.6);
    if (roofAt.length < n0) for (const q of roofOpen(n0 * 3)) { if (roofAt.length >= n0) break; if (!roofAt.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 1.6)) roofAt.push(q); }
    let made = 0; roofAt.slice(0, n0).forEach((q, i) => { if (spawnPosted(q, 'roof', i === 0 ? 'screamer' : i % 3 === 1 ? 'runner' : 'walker')) made++; });
    // 其余的从楼梯间门里涌出来（roofPour）：这一拨一共 roof 只左右，剩下的多就再多涌 min 只，最多 max 只
    const have = keep.length + out.length + made;
    sw.pour.left = Math.max(0, Math.min(U.max - have, Math.max(U.min, W.roof - have)));
    sw.total.roof = have + sw.pour.left;
    surge(sw.list.filter((z) => z.post && z.anchor === T.roof)); // 一上来就往飞机那边冲（飞机还在停机位上方往上拔）
    // 楼里的：都在阳台的玻璃后面（窗边），不在看不见的屋里；钉在原地不动。
    // 阳台的楼板、挡板挡视线也挡子弹（登记成跨楼层射线的方盒）；人贴着玻璃站（往里站，飞机从上面看下来只看得见顶板——以前标着红点、扔着东西，人却看不见）
    const fr = W.balcony.front;
    for (const s of balconySpots(layout, nav, W.window, rng, T)) {
      const g = balconyModel(); g.position.set(s.x, s.y, s.z); g.rotation.y = Math.atan2(-s.nz, s.nx); root.add(g); // 阳台模型朝 +x 伸出去，转到朝外
      const occ = G.physics?.addOccluder ? balconyBoxes(g).map((q) => G.physics.addOccluder(q, { tag: 'balcony' })) : [];
      const z = spawn(new THREE.Vector3(s.x + s.nx * fr, s.y, s.z + s.nz * fr), { kind: 'walker', fixed: true, yaw: Math.atan2(s.nx, s.nz), passive: true });
      if (z) { Object.assign(z, { sweep: 'window', exposeOn: false, expRaw: false, expRun: 0, expDt: 0 }); sw.list.push(z); sw.total.window++; }
      const b = { g, z, s, occ, broken: false }; balconies.push(b);
      // 绕楼下转的那一圈上还看不看得见：看不见的（高层、机枪仰不上去）进了那一段就不挡「清完了」
      const at = new THREE.Vector3(s.x + s.nx * fr, s.y + 1.15, s.z + s.nz * fr); let k = 0;
      for (const f of P.lowFrames) if ((f.eye.x - s.x) * s.nx + (f.eye.z - s.z) * s.nz > 0.5 && seenFrom(f, at)) k++;
      b.low = P.lowFrames.length ? k / P.lowFrames.length : 0;
    }
    // 楼下的分两批冲出来（sweepTick）：先出来的放在看得见得多的点上
    sw.ground = spread(sw.groundPool, W.ground + 6, (q) => q.score, 5, 2.5);
    S.noise = 0; noiseEl?.classList.add('off');
  }
  const rockGeo = new THREE.DodecahedronGeometry(0.28, 0), rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.95 }), gobMat = new THREE.MeshBasicMaterial({ color: 0x86c53a, toneMapped: false });
  /** 一只丧尸朝飞机扔一块东西（楼上的扔碎砖，楼下的吐酸）：飞 flight 秒，砸中了掉耐久 */
  function hurl(z, rideT) {
    const T = SIEGE.sweep.throw, c = G.missions?.vehicleCenter?.(); if (!c) return;
    const b = balconyOf(z); if (b && !b.broken) breakPane(b); // 阳台里的先把玻璃砸了
    const at = S.flight.poseAt(rideT + T.flight), hit = rng() < T.hit, miss = hit ? 0 : 5 + rng() * 5, a = rng() * 6.28;
    // 出手的地方：阳台里的从胸口扔出来（落下来时飞机上还看得见它的胸口才算砸着——不会躲在顶板、挡板后面砸人）
    const from = b ? chestOf(z.pos, new THREE.Vector3(), z.scale || 1) : new THREE.Vector3(z.pos.x, z.pos.y + 1.7, z.pos.z);
    const to = new THREE.Vector3(at.x + Math.cos(a) * miss, at.y + 1.2 + (hit ? 0 : -2), at.z + Math.sin(a) * miss);
    const m = new THREE.Mesh(rockGeo, z.sweep === 'ground' ? gobMat : rockMat); m.position.copy(from); root.add(m);
    rocks.push({ m, from, to, t: 0, life: T.flight, hit, by: z });
  }
  function rocksTick(dt) {
    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i]; r.t += dt; const k = Math.min(1, r.t / r.life);
      r.m.position.lerpVectors(r.from, r.to, k); r.m.position.y += Math.sin(k * Math.PI) * 4; r.m.rotation.x += dt * 9; r.m.rotation.z += dt * 6;
      if (k < 1) continue;
      const c = G.missions?.vehicleCenter?.();
      // 砸在机身上：从来的方向算一发（顶 hits 发子弹）。飞的这一秒半里飞机绕到楼后面去了（出手那一点看不见了）、扔的那只已经被打死了（disarm），就算没砸着
      if (r.hit && c && r.by?.alive && exposedAt(r.from, r.by)) {
        const dir = c.clone().sub(r.from).normalize();
        G.events?.emit?.('enemy:fire', { enemy: r.by, pos: c.clone().addScaledVector(dir, -3.5), dir, type: 'zombie', hits: SIEGE.sweep.throw.hits, from: r.from.clone() });
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
    // 地面的分两批冲出来：起飞不久一批，降到低空再来一批（尖叫者混在里面）；第一批快打光了、或者好几秒没东西可打，第二批提前来（sw.early，见下面）
    const W = SIEGE.sweep, want = sw.early || rideT > S.flight.times.ground - 6 ? W.ground : rideT > 6 ? Math.ceil(W.ground / 2) : 0;
    if ((sw.tick -= dt) <= 0 && sw.made.ground < want) {
      sw.tick = 0.35;
      const s = sw.ground[sw.made.ground % sw.ground.length];
      // 尖叫者一共三只（屋顶一只、楼下两只），别的不会随机抽到它。池子满了先收尸体，还放不下等下一下（不白算一只——以前 HUD 会挂着「楼下 17/18」）
      const kind = sw.made.ground === 2 || sw.made.ground === 9 ? 'screamer' : sw.made.ground % 3 === 0 ? 'runner' : undefined, mix = { walker: 0.7, runner: 0.2, bloater: 0.1, screamer: 0 };
      if (spawnPosted(s, 'ground', kind, mix) || (makeRoom() && spawnPosted(s, 'ground', kind, mix))) sw.made.ground++;
    }
    // 屋顶那一拨：从楼梯间门里涌出来、出了门冲向集结点
    roofPour(dt, sw.list.filter((z) => z.alive && z.active)); usherTick(dt);
    // 降到低空以后屋顶就看不见了（机枪仰不上去、楼板挡着）：屋顶上剩下的从楼里下来，冲到街上
    // 还没涌出来的不出来了；下来的最多 surge.down 只（屋顶那一大群都下来，楼下的池子就不够放了），别的收掉、从总数里去掉
    if (!sw.down && rideT >= S.flight.times.ground) {
      sw.down = true; let n = 0; sw.total.roof -= sw.pour.left; sw.pour.left = 0;
      for (const z of sw.list.filter((q) => q.alive && q.active && q.sweep === 'roof').sort((a, b) => (b.kind === 'screamer') - (a.kind === 'screamer'))) { // 尖叫者先下来
        if (n < W.surge.down && respawnPosted(z, true)) { n++; continue; }
        if (z.sweep) { sw.total.roof--; const i = sw.list.indexOf(z); if (i >= 0) sw.list.splice(i, 1); z.sweep = null; disarm(z); z._deactivate(); }
      }
      if (n) G.hud?.radio?.(`屋顶上剩下的 ${n} 只从楼里下来了，在楼下！`, 3.5);
      G.game?.refreshObjective?.();
    }
    // 钻进楼梯、楼里的（离开自己那一层一秒多）、屋顶上的在楼梯间盒子里待了 house 秒（看不见、打不着）：收回来，在同一拨的点上重放（不算打死）
    for (const z of sw.list.filter((q) => q.alive && q.active && q.post)) {
      if (!onAnchor(z)) { if ((z.offT = (z.offT || 0) + dt) > W.post.off) respawnPosted(z); continue; }
      z.offT = 0;
      if (z.anchor === tower().roof && inHousing(z.pos.x, z.pos.z)) { if ((z.houseT = (z.houseT || 0) + dt) > W.surge.house) respawnPosted(z); } else z.houseT = 0;
    }
    const live = sw.list.filter((z) => z.alive && z.active);
    repostTick(dt, rideT, live);
    exposeTick(dt, live);
    // 不干转：第一批都出来了以后，楼下的只剩 left 只、或者连着 lull 秒露出来能打的不到 quiet 只，第二批马上冲出来（以前要等到降到低空，中间四十来秒没东西打，HUD 还挂着「楼下 9/18」）
    if (!sw.early && rideT < S.flight.times.ground - 6 && sw.made.ground >= Math.ceil(W.ground / 2)) {
      const R = W.refill, shown = live.reduce((n, z) => n + (z.exposeOn ? 1 : 0), 0), eye = !!(G.missions?.doorGun || G.missions?.vehicleCenter); // 没有飞机（测试）谈不上露不露出来
      sw.lull = eye && shown < R.quiet ? (sw.lull || 0) + dt : 0;
      if (live.filter((z) => z.sweep === 'ground').length <= R.left || sw.lull >= R.lull) { sw.early = true; G.hud?.radio?.('楼下又冲出来一批！', 2.5); }
    }
    // 它们会还手：飞机上看得见的、离飞机 range 米以内的轮流朝飞机扔东西，剩得越少扔得越稀（先按缓存挑，扔之前当场再看一眼）
    if (!S.flight.leaving && (sw.throwT -= dt) <= 0) {
      const c = G.missions?.vehicleCenter?.(), T = W.throw;
      const near = c ? live.filter((z) => z.kind !== 'screamer' && z.exposeOn && Math.hypot(z.pos.x - c.x, z.pos.y - c.y, z.pos.z - c.z) < T.range) : [];
      const n = near.length; let who = null;
      for (let k = 0; k < 3 && near.length && !who; k++) { const i = Math.floor(rng() * near.length); if (exposedNow(near[i])) who = near[i]; else near.splice(i, 1); }
      if (who) { hurl(who, rideT); sw.throwT = T.every * Math.max(1, T.crowd / n) * (0.8 + rng() * 0.4); if (!sw.told) { sw.told = true; G.hud?.radio?.('它们在朝飞机扔东西！先打扔得凶的。', 3); } }
      else sw.throwT = 0.5;
    }
    // 清完了（该出来的都出来了、一个不剩）：先问要不要炸楼，不炸（或者时间到了）就返航；炸的话拉高飞走，机外镜头看着楼垮。
    // 绕楼下转圈的时候还剩在高层阳台上的（机枪仰不上去、再也打不着）不挡
    const left = live.filter((z) => !(z.sweep === 'window' && rideT >= S.flight.times.ground && !(balconyOf(z)?.low >= W.balcony.low)));
    if (!S.flight.leaving && sw.made.ground >= W.ground && !sw.pour.left && rideT > 12 && !left.length) {
      if (!sw.offered) {
        // 够不着的那几只（高层阳台）这会儿收掉、从总数里去掉：HUD 和「全部清掉了」对得上（以前清完了 HUD 还挂着「阳台 9/12」）
        if (live.length) { for (const z of live) { if (z.sweep) sw.total[z.sweep]--; z.sweep = null; disarm(z); z._deactivate(); } G.game?.refreshObjective?.(); }
        sw.offered = true; demo.offer(); G.hud?.radio?.('全部清掉了！指挥中心授权空袭——要不要把这几栋楼一起炸掉？', 4);
      }
      else if (demo.chosen) { // 不切机外镜头：飞机拉高、绕着整片楼转一大圈，人坐在机舱门口自己转头看
        const W = DEMOLISH.watch; S.flight.setWatch(rideT, { center: { x: W.center[0], z: W.center[1] }, R: W.R, y: W.y, turn: W.turn }); S.flight.setLeave(rideT + W.seconds); S.bombAt = rideT + W.delay;
        G.hud?.radio?.('空袭批准！拉高，离开爆炸范围——从舱门往外看。', 4);
      }
      else if (!demo.offered) { S.flight.setLeave(rideT + 1.2); G.hud?.radio?.('返航。', 3); }
    }
    else if (!S.flight.leaving && rideT > W.cap - 8 && !S.flight.fuelSaid) { S.flight.fuelSaid = true; G.hud?.message?.('油不多了，准备返航', 2); } // 只说一次（以前每帧都发）
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
    G.events?.emit?.('impact', { point: at, normal: new THREE.Vector3(b.s.nx, 0, b.s.nz), surface: 'glass' }); // 原游戏的火花、声音按 point 读（以前写成 pos，玻璃碎了没声音）
  }
  G.events?.on?.('enemy:hit', (ev) => { const b = balconies.find((x) => x.z === ev?.enemy && !x.broken); if (b) breakPane(b); }); // 打到阳台里的：先把玻璃打碎
  G.events?.on?.('enemy:killed', (ev) => {
    const z = ev?.enemy; if (z && rocks.length) disarm(z);
    if (!S.sweep || !z?.sweep) return;
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
      if (S.plan.mall.axe && G.weapon?.melee !== 'axe') G.hud?.radio?.(S.plan.mall.axe.across ? '门对面栏杆边上那个消防箱里有把消防斧——比刀好使，先去拿上。' : '门外墙上的消防箱里有把消防斧——比刀好使，先去拿上。', 4.5);
    }
    if (st.kind === 'crowbar' && G.weapon?.setMelee && G.weapon.melee !== 'axe') { // 消火栓箱里的斧子没拿：撬棍到手的时候一起给上（不会错过）
      G.weapon.setMelee('axe'); supplies?.take?.('axe');
      // 说的要和看见的一样：给的就是开局那家店门口消防箱里那把（箱子里的跟着收走）
      G.hud?.radio?.(`${G.squad?.enabled ? '阿哲把门口消防箱里那把消防斧给你捎上了' : '出门时顺手把门口消防箱里那把消防斧带上了'}——比刀好使，一下能砍倒两只（${G.input?.touch ? '近战键' : 'V / F'}）。`, 4.5);
    }
    if (st.kind === 'gen') { S.genT = MALL.gen.seconds; S.genSpawn = 1.5; S.carry = false; S.canAt = null; canMesh.visible = false; G.arms?.setLowered?.(0); }
    if (st.kind === 'rescue') { // 小许从店里出来，跟着你；门外几只听见动静过来了
      const R = S.plan.mall.rescue; G.squad?.join?.('xu', R.inside, { exit: R.exit }); // 从店里走出来，先到门外偏开一点的地方（不挡在你跟前），再跟着你
      avoidShut(); // 这家店不锁了：寻路不用再绕
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
      // 柜子里还有一把榴弹枪（以前要到第二道关才有）：不换到手上，告诉人怎么换
      if (G.weapon?.grant?.('launcher', { equip: false })) G.hud?.radio?.(`柜子里还有一把榴弹枪，带 5 发——${G.input?.touch ? '点换枪键切换' : '按 5 换'}。炸得狠，别对着跟前打。`, 5);
      // 柜子的警报：第一波尸潮从这儿开始（之前只有零星的行尸）
      addNoise(60); horde(SIEGE.alarm); S.hordeCool = SIEGE.noise.cooldown; say('警报响了——尸潮！', 2.6); G.player.addShake?.(0.25);
    }
    if (st.kind === 'gate') S.plan.gates[st.gate].block?.userData.clear();
    if (st.kind === 'gate' && st.gate === 1) S.bruteT = 7; // 第二道关一清：楼里有个大家伙被惊动了
    if (st.kind === 'gate' && st.gate === S.plan.gates.length - 1) roofExits(); // 楼梯间门里头的出生点、走出门的路：后台早就分帧算好了，这里只是兜底（没算完才在这一帧算完，别压在第一波那一帧）
    if (st.kind === 'flare') { S.hold = 0; S.waveI = 0; clearBelow(); }
    if (st.noise) { addNoise(st.noise); if (st.kind === 'switch') horde(7); }
    if (st.kind === 'switch' || st.kind === 'gate') checkpoint(i);
  }
  /** 只能在路线上走：商场那几层和这一局的那栋楼。走出去了（上了商场二层、出了大门、进了别的楼）就退回刚才站的地方 */
  const cores = () => (S.cores ||= [...nav.links.filter((l) => String(l.id).startsWith(`${tower().id}-`)).flatMap((l) => l.stops), ...runs.filter((r) => r.id.startsWith(tower().stair)).flatMap((r) => [{ floor: r.from, x: r.a.x, z: r.a.z }, { floor: r.to, x: r.b.x, z: r.b.z }])]);
  /** 走到哪一步，能去哪儿：还没摇开卷帘——只在那家店里；没撬开扶梯口——只在三层那一片；没按开二层的卷帘——二、三层；之后加上商场一层往下和这栋楼 */
  const phase = () => { const P = S.plan, at = P.stageOf; return S.stage <= at('exit') ? 0 : S.stage <= at('pry') ? 1 : S.stage <= at('open') ? 2 : 3; };
  function inArea(st, ph = phase()) {
    const f = st?.floor; if (!f) return true; // 在坡道 / 楼梯上：算
    if (closedShops.some((c) => c.floor === f && sealed(c) && pointInPoly([st.x, st.z], c.poly))) return false; // 卷帘拉下的店
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
    // 卷帘（锁着的店、开局店面）跟前 pad 米就停：再往前镜头站进卷帘那一层里，看不见它，像撞上一堵空气墙
    const pad = MALL.pad.leash, ph = phase(), fronts = ph === 0 ? S.plan.mall.shop.fronts || [] : [];
    const door = (f, x, z) => f === MALL.floors.top && fronts.some((q) => segDist(x, z, q.x0, q.z0, q.x1, q.z1).d < pad);
    const ok = (f, x, z) => !nearShut(f, x, z, pad) && !door(f, x, z) && !nearHose(f, x, z, MALL.pad.hose) && inArea({ floor: f, x, z }, ph);
    if (ok(st.floor, p.x, p.z) || !st.floor) { (S.inside ||= new THREE.Vector3()).copy(p); S.hasInside = true; return; }
    // 提示按退回去之前的位置挑（以前退回来以后再看，推着卷帘也说「这边出不去」）
    const shut = nearShut(st.floor, p.x, p.z, pad), why = ph === 0 ? '卷帘落着，出不去——先找手摇柄' : shut ? '卷帘锁着，进不去' : '这边出不去——照着路线走';
    if (S.hasInside) {
      // 斜着推卷帘：顺着卷帘滑过去（和撞上真墙一样），不是一下钉在原地。沿最近那道卷帘的方向、再试横竖两个方向；滑过去的那一段也要真走得通
      const A = S.inside, dx = p.x - A.x, dz = p.z - A.z, from = landAt(nav, A.x, A.z, A.y + 0.6), dirs = [[1, 0], [0, 1]];
      const e = shut || door(st.floor, p.x, p.z) ? edgeNear(st.floor, p.x, p.z, fronts) : null; if (e) dirs.unshift(e);
      for (const [tx, tz] of dirs) {
        const k = dx * tx + dz * tz, x = A.x + tx * k, z = A.z + tz * k; if (Math.abs(k) < 1e-3 || !from) continue;
        const to = landAt(nav, x, z, A.y + 0.6);
        if (to && to.floor === st.floor && ok(to.floor, x, z) && traceMotion(nav, from, { ...to, slope: null })) { p.x = x; p.z = z; A.copy(p); G.physics.forget?.(p); return; }
      }
      p.copy(A); G.player.vel?.set?.(0, 0, 0); G.physics.forget?.(p);
    }
    if (S.tellT <= 0 && !nearHose(st.floor, p.x, p.z, MALL.pad.hose)) { S.tellT = 2.5; say(why, 2.4); } // 顶着消火栓箱不用提示：看得见是个箱子
  }
  /** (x, z) 跟前那道卷帘（锁着的店的边、开局店面）的方向 [tx, tz]；没有返回 null */
  function edgeNear(f, x, z, fronts) {
    let best = null, bd = 1.5;
    const look = (x0, z0, x1, z1) => { const d = segDist(x, z, x0, z0, x1, z1).d, l = Math.hypot(x1 - x0, z1 - z0); if (d < bd && l > 0.1) { bd = d; best = [(x1 - x0) / l, (z1 - z0) / l]; } };
    for (const c of closedShops) if (c.floor === f && sealed(c)) c.poly.forEach((q, i) => { const r = c.poly[(i + 1) % c.poly.length]; look(q[0], q[1], r[0], r[1]); });
    for (const q of fronts) look(q.x0, q.z0, q.x1, q.z1);
    return best;
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
    // 追人的先扑小许——最多 mob 只（离他近的先）：这时你手里只有斧子，一下子全扑上去十几秒就把他啃倒了，剩下的照样冲你来
    if (xu && !xu.down) { let n = 0; for (const z of zalive().filter((q) => q.zs === 'chase' && Math.abs(q.pos.y - xu.pos.y) < 2 && Math.hypot(q.pos.x - xu.pos.x, q.pos.z - xu.pos.z) < 12).sort((a, b) => a.pos.distanceTo(xu.pos) - b.pos.distanceTo(xu.pos))) if (n++ < R.mob) z.distract?.(xu.pos, 0.5); }
    if (xu?.down) helpTell(xu);
    // 到了：小许到了扶梯口；或者你到了扶梯口、他就跟在你身后（站位离你三四米，你差一步没踩到点上也算）
    const near = (q, at, r) => Math.abs(q.y - at.y) < 1.5 && Math.hypot(q.x - at.x, q.z - at.z) < r, P = G.player.pos;
    if (!who.down && (near(who.pos, st.site, R.arrive) || (xu && near(P, st.site, R.arrive) && near(xu.pos, P, SQUAD.follow.far + 1)))) autoCut();
  }
  /** 小许倒了：一直标在 HUD 上（「扶」），按你离他多远 / 身边有没有丧尸 / 扶到几成说清楚该干什么（squad.js 给的 help） */
  function helpTell(xu) {
    const d = Math.hypot(xu.pos.x - G.player.pos.x, xu.pos.z - G.player.pos.z);
    if (xu.help === 'up' && xu.reviveT > 0.02) { if (S.tellT <= 2.6) { S.tellT = 3; say(`正在扶起小许… ${Math.min(99, Math.round(xu.reviveT * 100))}%`, 0.5); } return; }
    if (S.tellT > 0) return;
    S.tellT = 2.2; say(xu.help === 'busy' ? '身边有丧尸，扶不了——先把它们砍开！' : `小许倒了！走到他跟前扶起来（${Math.max(1, Math.round(d))} 米）`, 2);
  }
  const xuMark = new THREE.Vector3();
  /** HUD 标记：护送时小许倒了，在他头顶标一个「扶」 */
  const guestMarks = () => { const xu = G.squad?.guest; return curKind() === 'escort' && xu?.down ? [{ id: 'xu', short: '扶', label: '小许倒地 · 走到跟前扶起来', pos: xuMark.set(xu.pos.x, xu.pos.y + 1.1, xu.pos.z), kind: 'relay' }] : []; };
  /** 小许挨一口打几折（squad.js 问）：你手里还没枪、只有刀 / 斧子时打 MALL.rescue.soft 折 */
  const guestHurt = () => ((G.weapon?.slots || []).some((s) => s !== 'knife') ? 1 : MALL.rescue.soft);
  /** 小许躲的时候偏向哪边（squad.js 问）：护送时是扶梯口那一点 */
  const refuge = () => (curKind() === 'escort' ? S.plan.stages[S.stage].site : null);
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
      if (!S.sneakSaid) { S.sneakSaid = true; G.hud?.radio?.('前面一大片……都站着不动。蹲下（C）慢慢摸过去，别跑、别开枪。挡路的隔两步一斧子砍倒，没声；贴太近会惊醒。', 6); }
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
    if (!st) return;
    const id = st.slope?.id, on = (r) => (id && r.slopes.includes(id)) || r.landings.includes(st.floor);
    const blocked = g ? runs.filter((r) => g.runs.includes(r.id)) : [], inside = blocked.some(on);
    // 爬楼：这一层没清干净，往上的那段楼梯不让走（只拦从这层往上走的；从楼上下来照走）。
    // 拦不拦只在人从这一层踏上那段楼梯的那一下定（每踏上一次定一次）：放行了，走在梯段、休息平台上就一直放行；拦住的退回这一层的楼面上。
    // 以前每一帧都重新判、拽回上一帧的位置：走到一半有一只凑到楼梯口，人就被定在楼梯上，上不去也下不来（边挨咬边动不了）
    let climb = null;
    if (!inside && !id && !stairBits().landings.has(st.floor)) { S.run = null; S.safeFloor = st.floor; S.floorPos.copy(p); S.hasFloor = true; }
    else if (!inside && !S.run) { const r = S.safeFloor ? upRuns(S.safeFloor).find(on) : null; if (r && climbRule(r)) climb = r; else S.run = r?.id || id || st.floor; }
    if (!inside && !climb) { S.safe.copy(p); S.hasSafe = true; return; }
    const back = climb ? (S.hasFloor ? S.floorPos : null) : S.hasSafe ? S.safe : null;
    if (back) { p.copy(back); G.player.vel?.set?.(0, 0, 0); G.physics.forget?.(p); }
    if (climb) wake(climb.from);
    if (S.tellT <= 0) { S.tellT = 2.5; say((inside ? stairRule(S.plan, S.stage, blocked[0]) : climbRule(climb)) || '上不去', 2.6); }
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
  G.events?.on?.('player:hitEnemy', (e) => { if (e?.melee && e.tool === 'axe' && !e.killed && e.enemy?.pos) addNoise(SIEGE.noise.axe, e.enemy.pos, SIEGE.noise.axeHear); }); // 斧子砍中没砍死才有动静（一斧砍倒和刀一样没声：潜行时照样能悄悄放倒挡路的）
  G.events?.on?.('grenade:explode', (e) => addNoise(SIEGE.noise.grenade, e?.pos));
  G.events?.on?.('zombie:scream', (e) => { if (!playing() || director.riding || S.stage <= S.plan.armsStage) return; addNoise(30, e?.pos); const n = 3 + Math.floor(rng() * 3); if (holding() || S.landed) pour(S.landed ? 1 : n, { walker: 0.5, runner: 0.4, bloater: 0.07, screamer: 0.03 }, null); else horde(n); say('尖叫者！它在招同伴', 2.2); }); // 守屋顶时招来的排进楼梯口的队，从楼梯间里面走出来；直升机落稳以后只招来一只
  G.events?.on?.('zombie:burst', (e) => addNoise(18, e?.pos));
  G.events?.on?.('enemy:killed', (e) => { const rec = e?.enemy?.seed && S.seeded?.get(e.enemy.seed); if (rec) rec.killed = (rec.killed || 0) + 1; }); // 爬楼摆的打死了几只（人上到那层时补不补看这个）
  G.events?.on?.('zombie:pin', (e) => { if (playing() && e?.enemy) { S.pin = { by: e.enemy, x: G.player.pos.x, z: G.player.pos.z, tell: 0 }; pacing.hit(20); } });
  G.events?.on?.('zombie:unpin', (e) => { if (S.pin?.by === e?.enemy) S.pin = null; });
  G.events?.on?.('zombie:spit', (e) => { if (playing() && !director.riding) spit(e); });
  G.events?.on?.('player:hit', (e) => { if (playing()) pacing.hit(e?.amount); });

  const api = {
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; if (enabled) warmProps(); try { storage?.setItem?.('jimao-siege', enabled ? '1' : '0'); } catch { /* 存不了就不存 */ } },
    mission, reset, state: S, walls, demo, get seals() { return seals; }, addNoise, horde, pacing, spawnSpecial, spawnBrute, supplies, inArea, climbRule, mustClear, onRoof, roofExits, roofRim, roofOpen, housings, exposedNow, mateBites, guestHurt, refuge, makeRoom, inView,
    /** 爬楼那几层的落点一口气算完（测试、调试跳关用；游戏里开局起分帧算） */
    prepareFloors() { while (S.spotJob) if (S.spotJob.next().done) S.spotJob = null; return S.spots; },
    get plan() { return S.plan; },
    update(dt) {
      if (enabled && S.plan) prepTick(); // 爬楼那几层的落点：开局起分帧算（标题页、商场那段都在算）
      // 落点算完接着在后台算：先算楼顶的出口（守屋顶的出生点、出门的路），再算清扫要用的点（点了信号弹以后 holdTick 接着算），两样共用每帧的预算
      if (enabled && S.plan && !S.spotJob && S.hold < 0 && !S.landed) prepStep(Math.max(0, SIEGE.sweep.prep - exitsTick(SIEGE.sweep.prep)));
      for (const b of blocks) b.userData.update?.(dt, G);
      flareLight(dt);
      if (playing() && !director.riding) walls.update(dt);
      if (enabled && S.loadout && director.state.mission === S.mission && (G.game?.state === 'playing' || G.game?.state === 'intro')) loadout();
      if (enabled && S.kit && G.game?.state === 'playing') { supplies?.restore?.(S.kit); S.kit = null; }
      // 近战：从存档点 / 登机点重来的，过了撬棍那一步就一定有斧子（finishStage）——只给不收
      if (enabled && S.meleeSync && S.plan && G.game?.state === 'playing') { S.meleeSync = false; if (S.stage > S.plan.stageOf('crowbar') && G.weapon?.melee !== 'axe') G.weapon?.setMelee?.('axe'); }
      // 步枪弹药也照存档时的来（原游戏重置时给的是满的；至少留两个弹匣，不至于回来就没子弹）
      if (enabled && S.rifleKeep && G.game?.state === 'playing') { try { G.rifle.ammo = SIEGE.ammo.rifle; G.rifle.reserve = Math.max(60, S.rifleKeep[1]); } catch { /* 改不了就算了 */ } S.rifleKeep = null; }
      if (!playing() || director.state.mission !== S.mission) { noiseEl?.classList.add('off'); G.speedMul = 1; return; }
      G.speedMul = (SIEGE.speed[G.weapon?.current] || 1) * (S.carry ? MALL.fuel.speed : 1); // 拿刀跑得最快，手枪其次，长枪原速；抬着油桶慢
      S.tellT -= dt;
      syncStage();
      if (director.riding) { clockEl?.classList.add('off'); return; }
      wall(); leash(); genTick(dt); lockersTick(); escortTick(dt); sneakTick(dt); carryTick(dt); holdoutTick(dt); pinTick(); flingTick(dt); acidTick(dt); recycle(dt); floorsTick(dt); ambient(dt); holdTick(dt); safeTalkTick(dt);
      // 响动：安静一会儿才开始往下掉；攒满会把下一波尸潮催来
      S.hordeCool -= dt;
      if ((S.quietT += dt) > SIEGE.noise.quiet) S.noise = Math.max(0, S.noise - SIEGE.noise.decay * dt);
      // 节奏：平静 → 升温 → 预警三秒 → 尸潮 → 喘息；特殊感染者隔一阵来一只
      const p = G.player.pos; let near = 0;
      for (const z of zalive()) if (z.zs !== 'idle' && Math.abs(z.pos.y - p.y) < 3 && Math.hypot(z.pos.x - p.x, z.pos.z - p.z) < 6) near++;
      const armed = S.stage > S.plan.armsStage;
      // 拿到步枪之前没有尸潮、没有特殊感染者；队友也不开枪（大家手里都只有刀，一开枪就把尸群招来了）
      if (!armed) { const sneaking = curKind() === 'sneak'; if (noiseEl) { noiseEl.classList.toggle('off', !sneaking); noiseEl.classList.toggle('hot', S.noise > MALL.sneak.wake * 0.7); noiseEl.querySelector('b').style.width = `${Math.min(100, S.noise / MALL.sneak.wake * 100)}%`; } for (const m of G.squad?.mates || []) m.cool = Math.max(m.cool || 0, 0.6); return; }
      // 守屋顶、直升机落稳以后（从登机点重来的也算）：尸潮不归节奏器管；落稳以后也不再放特殊感染者（SIEGE.board）
      const loud = S.noise >= SIEGE.noise.horde && S.hordeCool <= 0 && S.hold < 0 && !S.landed;
      const act = pacing.update(dt, { stage: S.stage, near, noiseFull: loud, hold: S.hold >= 0 || S.landed });
      if (act.warn) { say(loud ? '动静太大——尸潮要来了！' : '远处一阵嚎叫——尸潮要来了！', 3); G.player.addShake?.(0.15); G.events?.emit?.('enemy:telegraph', { pos: p, type: 'soldier', scream: true }); }
      if (act.horde) { S.noise = Math.min(S.noise, SIEGE.noise.after); S.hordeCool = SIEGE.noise.cooldown; if (horde(Math.round(act.horde * (G.squad?.hordeScale || 1)))) { say('尸潮！', 2.2); G.player.addShake?.(0.25); } }
      if (act.special && !S.landed) spawnSpecial();
      // 这一回没出来（人在楼梯上找不着地方）：隔半秒再试，半分钟内不丢。守屋顶时 spawnBrute 是排进楼梯口的队（这一下没出来也排上了），不再试——不然一只排成几十只
      if (S.bruteT >= 0 && (S.bruteT -= dt) < 0 && !spawnBrute() && !holding() && (S.bruteTry = (S.bruteTry || 0) + 1) < 60) S.bruteT = 0.5;
      if (noiseEl) { noiseEl.classList.remove('off'); noiseEl.classList.toggle('hot', S.noise > 70); noiseEl.querySelector('b').style.width = `${Math.min(100, S.noise)}%`; }
    },
    dispose() { if (typeof window !== 'undefined') window.removeEventListener('keydown', onDropKey); dropBtn?.remove(); for (const a of acids.splice(0)) a.dispose(); acidMat.dispose(); acidBall.dispose(); acidDisc.dispose(); walls.dispose(); seals?.dispose(); for (const q of steps.splice(0)) q.seal.dispose(); root.removeFromParent(); noiseEl?.remove(); clockEl?.remove(); G.liftAllow = null; G.stairBlock = null; },
  };
  return api;
}
