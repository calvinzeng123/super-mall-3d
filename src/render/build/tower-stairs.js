import { towerStairPlan, GOING } from '../../layout/tower-stairs.js';
import { landingAt } from '../../layout/elevator-shafts.js';
import { toW } from '../../layout/geom.js';
import * as THREE from 'three';
import { BatchSet, frameMatrix, instanceMatrix, tpl } from '../batch.js';
import { FONT_CN } from '../textures.js';

const WALL = '#dce1d8', STEP = '#c8cec3', METAL = '#607967';
// 收在门洞两边的防火门扇：钢质防火门常见的暗红褐色烤漆（和关卡里那樘反锁的防火门同一类颜色），不再是栏杆的绿色
const FIRE_DOOR = '#6f3a30';
/**
 * 楼梯间细部的顶点色。实例化模板只有两个批次（不加绘制调用）：
 * 刷漆、水泥踏步、木扶手这些不该反光的面走「抹灰」批次（plaster：无缝的细抹灰，没有清水混凝土那种一道道模板缝——
 * 模板缝铺在平台上像木地板、竖在墙上像挂板）；材质表里没有 plaster（单元测试只给 concrete / extMetal）时退回 concrete。
 * 真金属（栏杆、门框、管卡、电梯门套）走 extMetal。
 * 停电时只有手电照明，颜色压在中灰附近：太白的面在手电光斑里会过曝，太黑的又什么都看不见。
 */
export const STAIR_PAINT = Object.freeze({
  // 踏步和平台同一种水泥面（原来踏步偏黄，往下看一跑像换了一种材料）；踢面冷一点、深一点，一级级分得开
  tread: '#aba99f', riser: '#878b8a', landing: '#aba99f', nosing: '#2b2e2c', soffit: '#c4c6bf', soffitEdge: '#8d918b',
  // 墙裙是油漆：和上面墙面的反差留给那道深色腰线，整片色块不要压得太深（太深像贴了一层茶色玻璃）
  dado: '#9aa49a', dadoLine: '#47524b', skirting: '#4a4f4b', wall: '#cfd0c7', threshold: '#8f8c85',
  rail: '#5b4130', baluster: '#3a433e', bracket: '#5f6662',
  pipe: '#952c24', conduit: '#7d827c', lamp: '#ebe3cc', lampBase: '#3f4341', cage: '#2c2f2e',
  // 钢门框是中灰色的烤漆（原来近黑，像一圈描边；#5d625e 在手电下仍然读成黑框，再提亮一档）
  frame: '#787d78', closer: '#6d726e',
  // 防火门扇上的五金：执手、合页、观察窗（夹丝玻璃）、「常闭式防火门」标牌
  lever: '#b8bcbc', hingeKnuckle: '#45403b', wiredGlass: '#3c4547', plate: '#e8e4da', plateText: '#8d231c',
  // 消火栓箱：不锈钢包边、红色烤漆门、玻璃后面是深色箱膛和卷盘；白字
  hydrant: '#a12a22', hydrantFrame: '#b9bebf', hydrantInside: '#2b2d2c', hydrantGlass: '#5e6d72', hoseReel: '#7d241d',
  hydrantLabel: '#ece7da', meter: '#8a918b', meterSeam: '#4c524e', hoseCoil: '#922d25', nozzle: '#9a8452', chrome: '#c4c9cb',
  // 候梯厅：拉丝不锈钢门套和召唤盒、黑色按钮、红色手动报警按钮
  steel: '#a3a9ac', button: '#2c3032', alarm: '#b02a22', lobbySkirting: '#4b4c48', lampRim: '#3b3e3d', panel: '#8f8d86',
});
/** 墙裙（梯段处沿踏步前缘斜着走）、踢脚线的高度。 */
export const DADO_HEIGHT = 1.2, SKIRTING_HEIGHT = .16;

/**
 * 一行短字（「消火栓」「常闭式防火门」）栅格化成若干矩形，好用顶点色的小面片拼出真字：
 * 箱门、门扇上的字都在合批 / 实例化模板里，单独为几个字开一张贴图要多一次绘制调用。
 * 画布上写一次字（几十像素高），逐行找出不透明的横段，上下相同的横段并成一个矩形——一个字二三十块。
 * 返回 { aspect（宽 / 高）, rects: [[x0, y0, x1, y1]…] }，坐标归一化到 0–1、y 向上；同一行字只算一次。
 * 没有 document（node 测试）返回 null，调用方退回一条素色的标签条（空白条也比假字强）。
 */
const RUNS = new Map();
export function textRuns(text, px = 22) {
  const key = `${text}|${px}`;
  if (RUNS.has(key)) return RUNS.get(key);
  let out = null;
  if (typeof document !== 'undefined') {
    try {
      const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
      const font = `bold ${px}px ${FONT_CN}`;
      g.font = font;
      const w = Math.ceil(g.measureText(text).width) + 2, h = Math.ceil(px * 1.2);
      c.width = w; c.height = h;
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(text, 1, h / 2 + px * .04);
      const a = g.getImageData(0, 0, w, h).data, rects = [], open = new Map();
      // 每行的横段；和上一行完全相同的横段接着往下长，不同的就收口成一个矩形
      for (let y = 0; y <= h; y++) {
        const runs = new Set();
        if (y < h) for (let x = 0; x < w;) {
          if (a[(y * w + x) * 4 + 3] < 120) { x++; continue; }
          let e = x; while (e < w && a[(y * w + e) * 4 + 3] >= 120) e++;
          runs.add(`${x},${e}`); x = e;
        }
        for (const [k, y0] of open) if (!runs.has(k)) { const [x0, x1] = k.split(',').map(Number); rects.push([x0 / w, 1 - y / h, x1 / w, 1 - y0 / h]); open.delete(k); }
        for (const k of runs) if (!open.has(k)) open.set(k, y);
      }
      out = rects.length ? { aspect: w / h, rects } : null;
    } catch { out = null; }
  }
  RUNS.set(key, out);
  return out;
}

/**
 * 一行字铺在某个面上：face(cu, cy, su, sy) 在面上画一块小面片（cu 以观察者的右手为正、cy 向上，都从字的中心量）。
 * 字高 height、整行不超过 maxW；没有字形（node）时 strip 为真就画一条字高一半的素色条。
 */
function writeText(face, text, height, maxW, px, strip = true) {
  const t = textRuns(text, px);
  if (!t) { if (strip) face(0, 0, Math.min(maxW, height * text.length * .95), height * .5); return; }
  let hh = height, ww = hh * t.aspect;
  if (ww > maxW) { ww = maxW; hh = ww / t.aspect; }
  for (const [x0, y0, x1, y1] of t.rects) face((x0 + x1 - 1) / 2 * ww, (y0 + y1 - 1) / 2 * hh, (x1 - x0) * ww, (y1 - y0) * hh);
}

const box = (B, key, r, y, height, color) => B.get(key).box((r.x0+r.x1)/2,y+height/2,(r.z0+r.z1)/2,r.x1-r.x0,height,r.z1-r.z0,color);
const rail = (B, a, b) => {
  B.get('extMetal').bar(a,b,.045,METAL);
  const length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(length/.9));
  for(let i=0;i<=n;i++) {
    const t=i/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
    B.get('extMetal').bar({x,y:y-.95,z},{x,y,z},.025,METAL);
  }
};

const protectedFlight = f => f.kind !== 'interior-stair' && !!f.localBottom;

/**
 * 楼梯门外（走廊一侧）门头上的安全出口灯：真实尺寸（30 × 15 cm，原来是一块 85 × 23 cm 的绿色空板），
 * 绿底发光面板上一圈白边、白色的奔跑小人跑向一樘门（门头正上方的牌子不带箭头）。全是 glowSoft 批次里的面片（停电时应急灯照样亮），
 * 一块牌子三十来个三角形，不加绘制调用。zWall：门墙走廊一侧的墙面；dir：楼梯间在 z 的哪个方向（牌面朝 −dir）。
 */
const SIGN_GREEN = '#239a57', SIGN_WHITE = '#f1f8ee';
// 奔跑小人（牌面坐标，米，u 向观察者右手、v 向上；以小人中心为原点）：躯干、两臂、两腿各两节
const RUNNER = [
  [[-.003, -.008], [.012, .028], .017],
  [[.012, .026], [.03, .014], .011], [[.03, .014], [.047, .027], .01],
  [[.01, .026], [-.008, .014], .011], [[-.008, .014], [-.026, .004], .01],
  [[-.002, -.008], [.022, -.026], .013], [[.022, -.026], [.02, -.052], .012],
  [[-.002, -.008], [-.014, -.032], .013], [[-.014, -.032], [-.04, -.04], .012],
];
export function exitSign(G, cx, yc, zWall, dir) {
  const nz = -dir, right = -dir, z = (o) => zWall + nz * o;
  G.box(cx, yc, z(.014), .3, .15, .024, SIGN_GREEN);
  if (!G.shape) return;
  const qFace = new THREE.Quaternion().setFromAxisAngle(UP, nz > 0 ? 0 : Math.PI), qz = new THREE.Quaternion();
  const quad = (u, v, w, h, ang = 0) => {
    qz.setFromAxisAngle(_c2.set(0, 0, 1), ang);
    G.shape('plane', _p.set(cx + right * u, yc + v, z(.0265)), _q.copy(qFace).multiply(qz), _s.set(w, h, 1), SIGN_WHITE);
  };
  // 白边（5 mm，离板边 8 mm）
  for (const v of [-.0625, .0625]) quad(0, v, .275, .005);
  for (const u of [-.135, .135]) quad(u, 0, .005, .13);
  // 小人：头、躯干和四肢，朝右手边那樘门跑
  const mx = -.04, my = -.002;
  quad(mx + .02, my + .046, .021, .021, Math.PI / 4);
  for (const [[u0, v0], [u1, v1], t] of RUNNER) quad(mx + (u0 + u1) / 2, my + (v0 + v1) / 2, Math.hypot(u1 - u0, v1 - v0) + t * .6, t, Math.atan2(v1 - v0, u1 - u0));
  // 门：小人前方一樘敞开的门（白框，中间是绿的）
  const dx = .062;
  quad(dx - .024, -.002, .008, .108); quad(dx + .024, -.002, .008, .108); quad(dx, .05, .056, .008);
}

/**
 * The 分隔 of stair s on level id (stair frame): { doors: [door1, door2], partition } or null, from P0a's
 * towerStairPlan(s).breakAt(id) (s.breakLevels with s.breakDoors[id] = { door2, partition }, else the partition up
 * the middle of the door landing and door2 mirrored about it): the same doors applyStairBreaks() gives the stair room.
 */
export function stairBreak(s, p, id) {
  const at = (p || towerStairPlan(s)).breakAt(id);
  return at ? { doors: at.doors, partition: at.partition } : null;
}

// ---------- 细部几何的小工具：剪切的盒子 / 面片（梯段旁的墙裙、踢脚、底板要顺着坡度走，两端仍是竖直的） ----------
const _m = new THREE.Matrix4(), _c0 = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/**
 * 以中心 c、三根轴向量 a0 / a1 / a2（模板的 x / y / z 方向，含长度）放一个模板。轴不必正交，
 * 所以斜着的墙裙两端仍然竖直、和平台那一段严丝合缝。行列式为负时翻 a0，保持三角形朝外。
 * 测试里的记录器只有 box / bar：没有 push 的批次直接跳过（只是外观，不影响任何实体）。
 */
function sheared(g, name, c, a0, a1, a2, color) {
  if (!g.push) return;
  _c0.copy(a0); _c1.copy(a1); _c2.copy(a2);
  if (_d.crossVectors(_c0, _c1).dot(_c2) < 0) _c0.negate();
  _m.makeBasis(_c0, _c1, _c2).setPosition(c);
  g.push(tpl(name), _m, color);
}
/** 贴墙的一条（墙裙、腰线、踢脚）：沿墙从 a 到 b（[x, z]），底边从 ya 斜到 yb，竖直高 h，面朝 n（[nx, nz]，单位向量）。 */
function wallStrip(g, a, b, ya, yb, h, n, color) {
  _p.set((a[0] + b[0]) / 2, (ya + yb) / 2 + h / 2, (a[1] + b[1]) / 2);
  sheared(g, 'plane', _p, _s.set(b[0] - a[0], yb - ya, b[1] - a[1]), new THREE.Vector3(0, h, 0), new THREE.Vector3(n[0], 0, n[1]), color);
}
/** 竖直的一片面，朝 +z（nz = 1）或 −z；没有 shape 的批次（测试记录器）退回薄盒子。 */
function vface(g, x, y, z, w, h, nz, color, t = .035) {
  if (!g.shape) { g.box(x, y, z, w, h, t, color); return; }
  _q.setFromAxisAngle(UP, nz > 0 ? 0 : Math.PI);
  g.shape('plane', _p.set(x, y, z), _q, _s.set(w, h, 1), color);
}
/** 朝上的一片（防滑条）；没有 flat 的批次退回薄盒子。 */
function upface(g, x, y, z, w, d, color) {
  if (g.flat) g.flat(x, y, z, w, d, color); else g.box(x, y - .003, z, w, .006, d, color);
}
/** 两点之间的圆管（6 棱，扶手、立管）；没有 shape 的批次退回方杆。 */
function tube(g, a, b, r, color) {
  if (!g.shape) { g.bar(a, b, r * 2, color); return; }
  _d.set(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = _d.length();
  if (len < 1e-6) return;
  _q.setFromUnitVectors(UP, _d.divideScalar(len));
  g.shape('cyl6', _p.set(a.x, a.y, a.z), _q, _s.set(r * 2, len, r * 2), color);
}

// 栏杆立杆用的方杆：只有四个侧面（上下两头的端面看不见），8 个三角形，盒子是 12 个——一层楼梯一百多根，省下三成。
let POST = null;
function postTpl() {
  if (POST) return POST;
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), P = g.attributes.position.array, N = g.attributes.normal.array, pos = [], nor = [];
  for (let i = 0; i < P.length / 3; i++) if (Math.abs(N[i * 3 + 1]) < .5) { pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); }
  g.dispose();
  return (POST = { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: null, count: pos.length / 3 });
}
/** 竖直方杆（中心 x, y, z，截面 w × d，高 h）；没有 push 的批次（测试记录器）退回盒子。 */
function post(g, x, y, z, w, h, d, color) {
  if (!g.push) { g.box(x, y, z, w, h, d, color); return; }
  _m.compose(_p.set(x, y, z), _q.identity(), _s.set(w, h, d));
  g.push(postTpl(), _m, color);
}

/**
 * 楼层 lv 上各部楼梯的细部做法（纯数据，决定实例化模板怎么分组）：
 *   inset   墙内皮离楼梯间外框的距离：社区塔楼自己楼层的墙骑在外框线上（0.2 厚 → 0.1），
 *           酒店 / 公寓的围护墙和一期宿主楼层（residential-cores）的墙在外框以内（→ 0.2）
 *   doors   每部楼梯这一层的门（穿越层没有门 → []；分隔层两樘）
 *   lobby   门外前室墙上挂什么：'hydrant'（消火栓 + 灭火器箱）/ 'meter'（电表箱 + 弱电箱）/ null，
 *           只在社区塔楼自己的楼层、而且门外那段墙确实落在候梯厅 / 走廊里时才挂
 *   wellGuard  门口平台临梯井一侧的短护栏（酒店 / 公寓的围护墙那边已经画了，社区塔楼这里补）
 * 同一层高、同一做法的楼层共用一份实例化模板；做法不同（穿越层、分隔层）的另起一组。
 */
export function stairDetailSpec(building, lv, stairs, elevators = null) {
  const own = !!building.community && lv.building === building.id, inset = own ? .1 : .2;
  const cp = lv.corePlan, rooms = [...(cp?.landings || []).map((q) => q.rect), ...(cp?.corridor ? [cp.corridor] : [])];
  const inside = (x0, x1, z) => rooms.some((r) => x0 >= r.x0 + .1 && x1 <= r.x1 - .1 && z > r.z0 + .1 && z < r.z1 - .1);
  const sorted = [...stairs].sort((a, b) => a.rect.x0 - b.rect.x0);
  // 门洞上沿：社区塔楼自己楼层 2.3（community.js 的过梁），一期宿主楼层 2.2（residential-cores 的门头），其余 2.35。
  const head = own ? 2.3 : building.community ? 2.2 : 2.35;
  // lining：楼梯间的墙不是社区塔楼自己的抹灰墙（酒店 / 公寓、一期宿主楼层是清水混凝土或石材），模板里贴一层抹灰面
  // outer：门墙朝走廊的一面也贴抹灰（酒店 / 公寓的走廊、车库）；一期宿主楼层的候梯厅是石材墙面，不贴
  // leaves：酒店 / 公寓的楼梯门扇（enclosures 画的，开着贴在门外墙上）在模板里补五金；社区塔楼的门另有做法
  const out = { inset, head, wellGuard: !!building.community, lining: !own, outer: !building.community, leaves: !building.community, stairs: {} };
  // 社区塔楼自己的楼层：楼梯门正对的候梯厅（lobbySpec）。消火栓箱、表箱挂在出楼梯门迎面那道电梯墙的墙垛上；
  // 楼梯门这道墙上只留手动报警按钮（门边 1.4 m）。
  const lobby = own ? lobbySpec(lv, sorted, elevators) : null;
  sorted.forEach((s, k) => {
    const passes = (s.passLevels || []).includes(lv.id) || !(s.serves || [lv.id]).includes(lv.id);
    const brk = passes ? null : stairBreak(s, null, lv.id);
    const doors = passes ? [] : brk ? brk.doors.map((d) => ({ x0: d.x0, x1: d.x1 })) : [{ x0: s.door.x0, x1: s.door.x1 }];
    let inner = null;
    // 酒店 / 公寓的楼梯门外是走廊或住户门面，没有可挂箱子的整片墙：消火栓箱挂在楼梯间里门口平台的侧墙上
    // （门口平台 2 m 深，第一跑从 2 m 处起步，箱子占 0.74–1.46 m，凸出墙面 4.5 cm，不进梯段也不挡门）。
    if (!building.community && doors.length === 1 && !brk) inner = { kind: 'hydrant', side: k % 2 ? 'R' : 'L', v: 1.1, w: .72 };
    out.stairs[s.id] = { doors, partition: brk ? brk.partition.x0 : null, lobby: null, inner };
  });
  out.lobby = lobby;
  return out;
}

/**
 * 候梯厅（社区塔楼自己的楼层）：电梯墙在候梯厅一边、楼梯门墙在另一边（北苑：电梯门朝南 z = −4.8，楼梯门朝北 z = −1.6）。
 * 只认这种「电梯墙正对楼梯门墙」的核心筒，别的做法返回 null（不画）。
 *   z0 / z1   电梯墙面 / 楼梯门墙面（候梯厅一侧）的 z；nz 从电梯墙指向楼梯门墙（+1：z 增大）
 *   x0 / x1   候梯厅两头
 *   gaps      全部电梯门洞（踢脚线按它让开；停不停靠都让，免得隔层停靠的电梯把模板分成两组）
 *   face      正对楼梯门的那部电梯（门中心落在两樘楼梯门之间、这一层停靠）：拉丝不锈钢门套
 *   boxes     迎面西侧墙垛上的消火栓箱；alarm 两樘楼梯门之间的手动报警按钮
 * 这些都只是外观（导航、碰撞照旧），按「同一层高 + 同一做法」进实例化模板。
 */
function lobbySpec(lv, stairs, elevators) {
  const cp = lv.corePlan;
  if (!cp?.lifts?.length || !cp.landings?.length || !stairs.length) return null;
  const lifts = cp.lifts, side = lifts[0].door, sd = stairs[0].door.side;
  if (!['N', 'S'].includes(side) || !['N', 'S'].includes(sd) || side === sd || lifts.some((L) => L.door !== side) || stairs.some((s) => s.door.side !== sd)) return null;
  const lineOf = (L) => (side === 'S' ? L.rect.z1 : L.rect.z0), line = lineOf(lifts[0]), doorLine = stairs[0].door.z0, nz = Math.sign(doorLine - line);
  if (!nz || lifts.some((L) => Math.abs(lineOf(L) - line) > 1e-3) || stairs.some((s) => Math.abs(s.door.z0 - doorLine) > 1e-3)) return null;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const x0 = Math.min(...cp.landings.map((q) => q.rect.x0)), x1 = Math.max(...cp.landings.map((q) => q.rect.x1));
  const rec = (L) => elevators?.find((e) => e.id === L.id);
  const half = (L) => (L.doorWidth ?? rec(L)?.doorWidth ?? 1.1) / 2, mid = (L) => (L.rect.x0 + L.rect.x1) / 2;
  const kind = (L) => (rec(L) ? landingAt(rec(L), lv.id) : L.landing === false ? null : 'normal');
  const gaps = lifts.map((L) => [r3(mid(L) - half(L)), r3(mid(L) + half(L))]).sort((a, b) => a[0] - b[0]);
  const sx0 = Math.min(...stairs.map((s) => s.door.x0)), sx1 = Math.max(...stairs.map((s) => s.door.x1));
  const faced = lifts.find((L) => mid(L) > sx0 && mid(L) < sx1 && kind(L));
  const face = faced ? { x0: r3(mid(faced) - half(faced)), x1: r3(mid(faced) + half(faced)) } : null;
  // 前室：迎面电梯所在、每层都开着的那块（北苑 x −1.4..1.4）。两边的候梯厅隔层封死（封死的一块是实心核心筒），
  // 所以箱子、召唤盒、报警按钮都只挂在前室里，不然隔一层就有一半埋进墙里。
  const fl = face && cp.landings.find((q) => q.open && q.rect.x0 < (face.x0 + face.x1) / 2 && q.rect.x1 > (face.x0 + face.x1) / 2)?.rect;
  // 西侧墙垛挂消火栓箱（宽 0.66，两边各留 5 cm）。东侧墙垛留给住户楼层自己的呼梯面板（residence-interiors 在每部电梯
  // 门右手 w/2 − 0.18 处画，带楼层指示），这里不再画第二个。
  const boxes = [];
  if (face && fl) {
    const a = fl.x0 + .05, b = face.x0 - .07;
    if (b - a >= .62) { const w = r3(Math.min(.66, b - a - .08)); boxes.push({ kind: 'hydrant', x: r3((a + b) / 2), w }); }
  }
  // 两部楼梯门之间的墙垛（比门两侧的墙退进 10 cm）上一个手动报警按钮 + 消防电话插孔
  const between = stairs.length === 2 ? [stairs[0].door.x1, stairs[1].door.x0].sort((a, b) => a - b) : null;
  const alarm = between && between[1] - between[0] >= .2 ? r3((between[0] + between[1]) / 2) : null;
  return { z0: r3(line + nz * .06), z1: r3(doorLine - nz * .1), nz, x0, x1, gaps, face, boxes, alarm,
    fire: fl ? [fl.x0, fl.x1] : null, stairDoors: stairs.map((s) => [s.door.x0, s.door.x1]), doorLine, ceiling: r3(lv.height - .31) };
}
/** 分组用的签名：层高 + 做法。 */
export const stairDetailKey = (lv, spec) => `${lv.height.toFixed(4)}|${JSON.stringify(spec)}`;

/** Called inside the building frame, batched into its permanent clipped shell.
 * Mid-flight geometry must survive loading the next visited dwelling floor.
 * detail（只在逐层实例化的模板里传）：stairDetailSpec 的结果；paint：刷漆面用哪个批次（模板里是 plaster，没有就 concrete）。
 * 有了 detail，踏步伸到墙边、梯段下有斜底板，临井一侧是密排方钢栏杆和木扶手，靠墙一侧换成墙上扶手，
 * 再画墙裙、踢脚、门框、闭门器、防潮吸顶灯、立管、门口平台的水泥面层和门槛石（stairDetails），
 * 社区塔楼自己的楼层还有门外候梯厅的电梯门套、召唤盒、消火栓箱、表箱、踢脚和吸顶灯（lobbyDetails）。 */
export function buildTowerStairGeometry(B, building, levels, stairs, { enclosures = true, flights = true, detail = null, paint = 'concrete' } = {}) {
  if (!building.access?.protected) return;
  if (enclosures) for (const s of stairs) {
    const p=towerStairPlan(s),r=s.rect;
    for(const lv of levels.filter(l=>!l.playableCap&&s.serves.includes(l.id))) {
      const y=lv.elev,h=lv.kind==='roof'?2.9:lv.height, dz=s.door.z0;
      box(B,'concrete',{x0:r.x0,z0:r.z0,x1:r.x0+.2,z1:r.z1},y,h,WALL);
      box(B,'concrete',{x0:r.x1-.2,z0:r.z0,x1:r.x1,z1:r.z1},y,h,WALL);
      const back=s.door.side==='S'?r.z0:r.z1-.2;
      box(B,'concrete',{x0:r.x0,z0:back,x1:r.x1,z1:back+.2},y,h,WALL);
      const front=s.door.side==='S'?dz-.2:dz;
      // 分隔 (breakLevels): a second door in the same wall and a lane partition across the door landing, so the run
      // from below arrives through one door and the run above leaves through the other (SPEC §2.2 stairs).
      const brk=stairBreak(s,p,lv.id),doors=brk?brk.doors:[s.door];
      const sorted=[...doors].sort((a,b)=>a.x0-b.x0);
      let x=r.x0;
      for(const d of sorted){box(B,'concrete',{x0:x,z0:front,x1:d.x0,z1:front+.2},y,h,WALL);x=d.x1;}
      box(B,'concrete',{x0:x,z0:front,x1:r.x1,z1:front+.2},y,h,WALL);
      const entryZ=dz-p.direction*.045;
      for(const d of sorted) {
        box(B,'concrete',{x0:d.x0,z0:front,x1:d.x1,z1:front+.2},y+2.35,h-2.35,WALL);
        // Open door leaves are parked against the entry wall, not through the
        // 1.8m clear landing or the route between the two stair flights.
        const leaf=Math.min(.65,(d.x1-d.x0)*.6);
        if(!brk){B.get('extMetal').box(d.x0-.35,y+1.09,entryZ,.65,2.18,.055,FIRE_DOOR);B.get('extMetal').box(d.x1+.35,y+1.09,entryZ,.65,2.18,.055,FIRE_DOOR);}
        else {const out=(d.x0+d.x1)/2<brk.partition.x0?-1:1;B.get('extMetal').box(out<0?d.x0-leaf/2-.03:d.x1+leaf/2+.03,y+1.09,entryZ,leaf,2.18,.055,FIRE_DOOR);}
        exitSign(B.get('glowSoft'),(d.x0+d.x1)/2,y+2.53,dz,p.direction);
      }
      if(brk) {
        const P=brk.partition,z0=Math.min(P.z0,P.z1),z1=Math.max(P.z0,P.z1);
        box(B,'concrete',{x0:P.x0-.06,z0,x1:P.x0+.06,z1},y,h,WALL);
        // A lit 「nF 避难层」 plate on each side of the partition, at the doors.
        for(const sg of [-1,1])B.get('glowSoft').box(P.x0+sg*.075,y+1.9,(z0+z1)/2,.012,.3,.9,'#d9e8d2');
      }
      const cx=(s.door.x0+s.door.x1)/2;
      const q=p.point(cx,1.05);
      B.get('glowSoft').box(q[0],y+h-.13,q[1],1.2,.055,.3,'#f5ebd6');
      const frontEdge=p.point(0,2);
      // 门口平台临梯井的护栏：和梯段栏杆同一做法（深色方钢立杆 + 木色扶手），不再是另一种绿色的管栏。
      const ga={x:p.centers[0]+p.width/2,y:y+1.05,z:frontEdge[1]},gb={x:p.centers[1]-p.width/2,y:y+1.05,z:frontEdge[1]};
      B.get('extMetal').bar(ga,gb,.05,STAIR_PAINT.rail);
      const gn=Math.max(1,Math.round(Math.abs(gb.x-ga.x)/.2));
      for(let i=0;i<=gn;i++){const gx=ga.x+(gb.x-ga.x)*i/gn;B.get('extMetal').bar({x:gx,y:y,z:ga.z},{x:gx,y:y+1.03,z:ga.z},.018,STAIR_PAINT.baluster);}
      if(lv.kind==='roof') box(B,'concrete',r,y+h,.18,'#b2bbae');
    }
  }
  if (!flights) return;
  const plans = new Map(stairs.map((s) => [s.id, towerStairPlan(s)]));
  const own = building.access.flights.filter(protectedFlight);
  // Duplex 套内楼梯 flights belong to the home interiors, not the protected stair shells.
  for(const f of own) {
    const [x0,z0]=f.localBottom,[x1,z1]=f.localTop,dy=f.top.y-f.bottom.y;
    const s = stairs.find((q) => q.id === f.stair), p = plans.get(f.stair), d = detail && s && p && detail.stairs?.[s.id];
    // 靠墙一侧：有细部时踏步伸到墙皮（导航仍按梯段宽，只是看上去顶到墙），否则停在梯段边。
    const well = p ? Math.sign((p.centers[0] + p.centers[1]) / 2 - x0) || 1 : 1;
    const wallX = d ? (well > 0 ? s.rect.x0 + detail.inset : s.rect.x1 - detail.inset) : x0 - well * f.width / 2;
    const edgeX = x0 + well * f.width / 2, tx = (wallX + edgeX) / 2, tw = Math.abs(edgeX - wallX);
    const sz = Math.sign(z1 - z0) || 1, rise = dy / f.steps, run = f.run / f.steps;
    const tread = d ? STAIR_PAINT.tread : STEP, riser = d ? STAIR_PAINT.riser : STEP;
    const C = B.get(d ? paint : 'concrete'), M = B.get('extMetal');
    for(let i=0;i<f.steps;i++) {
      const t=(i+.5)/f.steps,x=x0+(x1-x0)*t,z=z0+(z1-z0)*t,y=f.bottom.y+dy*(i+1)/f.steps;
      const edgeZ=z0+(z1-z0)*i/f.steps;
      if (d) {
        // 水泥踏步 + 冷一点、深一点的踢面；前缘一道 L 形的黑色金刚砂防滑条（两端留 6 cm，像真的嵌条）：
        // 踏面上 5.5 cm 宽一条，再往下包住踢面上沿 2.5 cm——从上往下看下一跑（玩家多半是这么看的）也看得到那道黑边。
        C.box(tx,y-.07,z,tw,.14,f.run/f.steps+.006,tread);
        // 踢面盖住踏步板的前脸（踏步前脸比 edgeZ 外凸 3 mm），整级踢面一个颜色。
        vface(C, tx, y - rise / 2, edgeZ - sz * .0045, tw, rise, -sz, riser);
        upface(C, x, y + .002, edgeZ + sz * .0275, f.width - .12, .055, STAIR_PAINT.nosing);
        vface(C, x, y - .0115, edgeZ - sz * .006, f.width - .12, .027, -sz, STAIR_PAINT.nosing);
      } else {
        B.get('concrete').box(x,y-.07,z,f.width,.14,f.run/f.steps+.006,STEP);
        B.get('concrete').box(x,y-dy/f.steps/2,edgeZ,f.width,dy/f.steps,.035,STEP);
        B.get('extMetal').box(x,y+.006,edgeZ,f.width,.012,.035,'#8e9e8a');
      }
    }
    if (!d) {
      for(const sign of [-1,1]) rail(B,
        {x:x0+sign*f.width/2,y:f.bottom.y+1.05,z:z0},
        {x:x1+sign*f.width/2,y:f.top.y+1.05,z:z1});
      continue;
    }
    // 梯段底板：一块顺坡的现浇板，上皮过每级踏步的后下角，从下面看是一整块斜板而不是一级级悬空的踏步。
    const zA = z0, zB = z1, yA = f.bottom.y - .14, yB = f.top.y - .14, th = .16;
    sheared(C, 'box', _p.set(tx, (yA + yB) / 2 - th / 2, (zA + zB) / 2), new THREE.Vector3(tw, 0, 0), new THREE.Vector3(0, th, 0), new THREE.Vector3(0, yB - yA, zB - zA), STAIR_PAINT.soffit);
    // 梯段临井的一侧：底板外沿一道 5 cm 的深色滴水线，侧面一条和墙裙腰线同色的梯梁面（从底板下皮到踏步前缘连线以上 3.6 cm，
    // 盖住一级级踏步的锯齿端头）。从下一层往上看，头顶的梯段有了边，不再是一整块纸板。
    sheared(C, 'box', _p.set(edgeX - well * .025, (yA + yB) / 2 - th - .003, (zA + zB) / 2), new THREE.Vector3(.05, 0, 0), new THREE.Vector3(0, .006, 0), new THREE.Vector3(0, yB - yA, zB - zA), STAIR_PAINT.soffitEdge);
    {
      const sx = edgeX + well * .004, ya = f.bottom.y - th - .14 - .006, yb = f.top.y - rise - th - .14 - .006;
      // 底边沿底板下皮，顶边沿各级前缘的连线 + 3.6 cm；两端停在起步和最后一级的前缘
      wallStrip(C, [sx, z0], [sx, z1 - sz * run], ya, yb, th + .14 + .006 + rise + .036, [well, 0], STAIR_PAINT.dadoLine);
    }
    // 临井一侧：住宅楼梯的做法——方钢立杆净距不大于 11 cm（每级三根，中距约 9 cm）、离踏步 10 cm 的底横杆、
    // 顶上一根木扶手，两端各一根粗一点的望柱。
    const nose = (k) => ({ z: z0 + (z1 - z0) * k / f.steps, y: f.bottom.y + rise * (k + 1) }), H = .95, bx = edgeX - well * .035;
    const top = (k) => { const n = nose(k); return { x: bx, y: n.y + H, z: n.z }; };
    for (let i = 0; i < f.steps; i++) for (const u of BALUSTERS) {
      // 扶手线过各级前缘 + H：踏步上离前缘 u 级处的立杆比前缘处高 u 级。
      const zc = z0 + (z1 - z0) * (i + u) / f.steps, yb = f.bottom.y + rise * (i + 1), yt = yb + H + rise * u;
      post(M, bx, (yb + yt) / 2, zc, .015, yt - yb, .015, STAIR_PAINT.baluster);
    }
    const a = top(0), b = top(f.steps - 1);
    const ext = (q, dz) => ({ x: q.x, y: q.y + dz / run * rise, z: q.z + sz * dz });
    const ra = ext(a, -run * .5), rb = ext(b, run * .5);
    tube(C, ra, rb, .028, STAIR_PAINT.rail);
    M.bar({ x: bx, y: ra.y - H + .1, z: ra.z }, { x: bx, y: rb.y - H + .1, z: rb.z }, .022, STAIR_PAINT.baluster);
    // 望柱落到所在的楼面（下端门口 / 平台，上端最后一级踏步）。
    for (const [q, foot] of [[ra, f.bottom.y], [rb, f.top.y]]) M.box(bx, (q.y + .03 + foot) / 2, q.z, .045, q.y + .03 - foot, .045, STAIR_PAINT.baluster);
    // 靠墙一侧：墙上一根圆管扶手，三个托架。
    const wx = wallX + well * .075, wa = { x: wx, y: f.bottom.y + rise + .9, z: z0 }, wb = { x: wx, y: f.top.y + .9, z: z1 - sz * run };
    tube(M, wa, wb, .02, STAIR_PAINT.bracket);
    for (const t of [.12, .5, .88]) {
      const y = wa.y + (wb.y - wa.y) * t, z = wa.z + (wb.z - wa.z) * t;
      M.box((wallX + wx) / 2, y - .03, z, .075, .018, .02, STAIR_PAINT.bracket);
    }
  }
  for(const s of building.access.surfaces) {
    const stair=stairs.find(q=>q.id===s.stair);
    if(!stair||!s.rect)continue;
    const dir=towerStairPlan(stair).direction;
    const z=dir<0?s.rect.z0:s.rect.z1;
    const d = detail?.stairs?.[stair.id];
    if (!d) {
      box(B,'concrete',s.rect,s.elev-.15,.15,STEP);
      rail(B,{x:s.rect.x0,y:s.elev+1.05,z},{x:s.rect.x1,y:s.elev+1.05,z});
      continue;
    }
    // 半层平台：伸到两侧墙皮，0.25 厚（接得住梯段底板），水泥面层；临空的一边是密排栏杆（中距约 11 cm）和木扶手。
    const C = B.get(paint), x0 = stair.rect.x0 + detail.inset, x1 = stair.rect.x1 - detail.inset;
    box(B, paint, { ...s.rect, x0, x1 }, s.elev - .25, .25, STAIR_PAINT.landing);
    const gz = z - dir * .04, n = Math.max(2, Math.round((x1 - x0 - .1) / .11));
    for (let k = 1; k < n; k++) post(B.get('extMetal'), x0 + (x1 - x0) * k / n, s.elev + .53, gz, .015, 1.06, .015, STAIR_PAINT.baluster);
    B.get('extMetal').box((x0 + x1) / 2, s.elev + .1, gz, x1 - x0, .022, .022, STAIR_PAINT.baluster);
    tube(C, { x: x0, y: s.elev + 1.07, z: gz }, { x: x1, y: s.elev + 1.07, z: gz }, .028, STAIR_PAINT.rail);
    // 平台前缘一条黑色防滑条，和踏步一样。
    upface(C, (stair.rect.x0 + stair.rect.x1) / 2, s.elev + .002, (dir < 0 ? s.rect.z1 : s.rect.z0) + dir * .045, x1 - x0 - .3, .05, STAIR_PAINT.nosing);
  }
  if (detail) stairDetails(B, building, stairs, detail, own, paint);
  if (detail?.lobby) lobbyDetails(B, detail.lobby, paint);
}
/** 每级踏步上栏杆立杆的位置（离前缘几分之几级）：三根，中距约 9 cm。 */
const BALUSTERS = [1 / 6, .5, 5 / 6];

/**
 * 楼梯间的墙面和门口（只在实例化模板里画，y 以本层楼面为 0）：
 *   两侧墙：墙裙（灰绿色，1.2 m，梯段处沿踏步前缘斜着走）、上沿一道深色腰线、踢脚线；
 *   lining：酒店 / 公寓、一期宿主楼层的楼梯间墙是清水混凝土（一道道模板缝），整面贴一层抹灰面；
 *   门所在的墙：门两边的墙裙和踢脚，钢门框两面都有，楼梯间一侧装闭门器，门上方一盏防潮吸顶灯；
 *   门口平台：水泥面层盖住楼层的地砖（地砖停在门口），门洞下一条门槛石；
 *   半层平台上方一盏防潮吸顶灯（不亮）和一段穿线管，靠墙一根红色消防立管（逐层接起来是一根）；
 *   酒店 / 公寓：门口平台侧墙上的消火栓箱。
 * 梯段数不是标准两跑（maxRisers 拆成多个回合）的楼梯只画门口那部分。
 */
function stairDetails(B, building, stairs, detail, flights, paint) {
  const C = B.get(paint), M = B.get('extMetal'), inset = detail.inset;
  for (const s of stairs) {
    const d = detail.stairs?.[s.id];
    if (!d) continue;
    const p = towerStairPlan(s), dir = p.direction, r = s.rect, dz = s.door.z0;
    const Z = (v) => dz + dir * v, vf = inset, vo = inset - .2, vBack = p.depth - inset;
    const xl = r.x0 + inset, xr = r.x1 - inset;
    const mine = flights.filter((f) => f.stair === s.id);
    const f1 = mine.find((f) => f.id.endsWith('-flight-1')), f2 = mine.find((f) => f.id.endsWith('-flight-2'));
    const V = (z) => (z - dz) * dir;
    const doors = [...d.doors].sort((a, b) => a.x0 - b.x0), nIn = [0, dir];
    const standard = f1 && f2 && mine.length === 2, h = standard ? f2.top.y : null;
    // ---- 抹灰面层（贴在混凝土墙上，3 mm）：两侧墙、后墙、门墙（让开门洞，门头以上补满）----
    if (detail.lining && h) {
      const W = STAIR_PAINT.wall;
      for (const [x, n] of [[xl, 1], [xr, -1]]) wallStrip(C, [x + n * .003, Z(vf)], [x + n * .003, Z(vBack)], 0, 0, h, [n, 0], W);
      wallStrip(C, [xl, Z(vBack - .003)], [xr, Z(vBack - .003)], 0, 0, h, [0, -dir], W);
      let x = xl;
      for (const q of doors) {
        if (q.x0 - x > .02) wallStrip(C, [x, Z(vf + .003)], [q.x0, Z(vf + .003)], 0, 0, h, nIn, W);
        wallStrip(C, [q.x0, Z(vf + .003)], [q.x1, Z(vf + .003)], detail.head, detail.head, h - detail.head, nIn, W);
        x = q.x1;
      }
      if (xr - x > .02) wallStrip(C, [x, Z(vf + .003)], [xr, Z(vf + .003)], 0, 0, h, nIn, W);
      // 门墙朝走廊的一面也贴（走廊、车库里看过来是这一面），左右到楼梯间外框为止
      const nOut = [0, -dir], zo = Z(vo - .003);
      x = r.x0;
      if (detail.outer) for (const q of doors) {
        if (q.x0 - x > .02) wallStrip(C, [x, zo], [q.x0, zo], 0, 0, h, nOut, W);
        wallStrip(C, [q.x0, zo], [q.x1, zo], detail.head, detail.head, h - detail.head, nOut, W);
        x = q.x1;
      }
      if (detail.outer && r.x1 - x > .02) wallStrip(C, [x, zo], [r.x1, zo], 0, 0, h, nOut, W);
    }
    // ---- 两侧墙：沿行走面（门口平台 0、梯段前缘线、半层平台）的折线画墙裙 / 腰线 / 踢脚 ----
    let vE = null, vEnd = null, mid = null;
    if (standard) {
      const run = GOING, land = building.access.surfaces.find((q) => q.stair === s.id && Math.abs(q.elev - f1.top.y) < 1e-6);
      mid = f1.top.y;
      vEnd = land ? Math.max(V(land.rect.z0), V(land.rect.z1)) : V(f1.localTop[1]) + 1.35;
      const vS = V(f1.localBottom[1]);
      vE = V(f1.localTop[1]);
      // 折线的斜段过每级踏步前缘，往两头延长到与平台标高相交（差一级的水平距离），两端接平台的水平段。
      const left = [[vf, 0], [vS - run, 0], [vE - run, mid], [vEnd, mid]];
      // 右墙（第二跑）：门口平台那段属于本层（下一层的第二跑在这里落地），本层第二跑从半层平台升到上一层。
      const rightOwn = [[vf, 0], [vS + run, 0]], rightRun = [[vE + run, mid], [vS + run, h]], rightLand = [[vE + run, mid], [vEnd, mid]];
      const paintWall = (x, n, pts) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const [va, ya] = pts[i], [vb, yb] = pts[i + 1];
          if (Math.abs(vb - va) < 1e-3) continue;
          const a = [x + n * .006, Z(va)], b = [x + n * .006, Z(vb)], nn = [n, 0];
          wallStrip(C, a, b, ya - .03, yb - .03, DADO_HEIGHT + .03, nn, STAIR_PAINT.dado);
          wallStrip(C, [a[0] + n * .003, a[1]], [b[0] + n * .003, b[1]], ya + DADO_HEIGHT - .035, yb + DADO_HEIGHT - .035, .035, nn, STAIR_PAINT.dadoLine);
          wallStrip(C, [a[0] + n * .006, a[1]], [b[0] + n * .006, b[1]], ya - .03, yb - .03, SKIRTING_HEIGHT + .03, nn, STAIR_PAINT.skirting);
        }
      };
      paintWall(xl, 1, left);
      paintWall(xr, -1, rightOwn);
      paintWall(xr, -1, rightRun);
      paintWall(xr, -1, rightLand);
      // 半层平台上方的防潮吸顶灯：贴左墙、平台中间，离平台 2.2 m（第一跑往上走时在前方左手边，转身上第二跑时在身后）；
      // 一根穿线管从灯顶上到上一层平台底。不吸在上一层半层平台的板底：最顶上一层往上是屋面，板底不存在，
      // 而它和下面的楼层共用一份模板（分出去要多存一份模板）。
      const lz = Z((vE + vEnd) / 2), ly = mid + Math.min(2.2, h - .7), top = mid + h - .25;
      bulkhead(C, M, [xl, lz], [1, 0], ly);
      conduit(M, [[xl, lz, ly + .1], [xl, lz, top]], [1, 0]);
      // 红色消防立管：半层平台外沿再往里 15 cm，贴左墙，整层高（上下层接成一根），两道管卡。
      const pv = Math.min(vEnd + .16, p.depth - inset - .1), px = xl + .09;
      tube(M, { x: px, y: 0, z: Z(pv) }, { x: px, y: h, z: Z(pv) }, .055, STAIR_PAINT.pipe);
      for (const y of [.6, mid + .6]) M.box(xl + .04, y, Z(pv), .08, .05, .13, STAIR_PAINT.bracket);
    }
    // ---- 门口平台：水泥面层（楼层地砖停在门口，楼梯间里是水泥地），门洞下一条门槛石 ----
    if (doors.length) {
      // 一直铺到楼板开洞处（梯井洞口从 2 m 起，towerStairPlan.shaftRect），第一级踏步下面那一小条也盖住
      const vEdge = 2;
      upface(C, (xl + xr) / 2, .008, Z((vf + vEdge) / 2), xr - xl, vEdge - vf, STAIR_PAINT.landing);
      for (const q of doors) C.box((q.x0 + q.x1) / 2, .007, Z((vf + vo) / 2), q.x1 - q.x0, .014, vf - vo + .04, STAIR_PAINT.threshold);
    }
    // ---- 门所在的墙（楼梯间一侧）：门两边的墙裙和踢脚 ----
    let x = xl;
    const spans = [];
    for (const q of doors) { spans.push([x, q.x0 - .07]); x = q.x1 + .07; }
    spans.push([x, xr]);
    for (const [a, b] of spans) {
      if (b - a < .05) continue;
      if (d.partition != null && a < d.partition && b > d.partition) continue;
      const z = Z(vf + .006);
      wallStrip(C, [a, z], [b, z], -.03, -.03, DADO_HEIGHT + .03, nIn, STAIR_PAINT.dado);
      wallStrip(C, [a, Z(vf + .009)], [b, Z(vf + .009)], DADO_HEIGHT - .035, DADO_HEIGHT - .035, .035, nIn, STAIR_PAINT.dadoLine);
      wallStrip(C, [a, Z(vf + .012)], [b, Z(vf + .012)], -.03, -.03, SKIRTING_HEIGHT + .03, nIn, STAIR_PAINT.skirting);
    }
    // ---- 钢门框（两面各一圈贴脸，中灰烤漆）、楼梯间一侧的闭门器、门上方的防潮吸顶灯 ----
    // 门框、闭门器走刷漆批次：金属批次在停电的暗处没有东西可反射，整圈框会变成一道黑描边
    const headY = detail.head;
    for (const q of doors) {
      const w = q.x1 - q.x0, cx = (q.x0 + q.x1) / 2;
      for (const v of [vf + .012, vo - .012]) {
        const z = Z(v);
        for (const jx of [q.x0 - .03, q.x1 + .03]) C.box(jx, headY / 2, z, .06, headY, .024, STAIR_PAINT.frame);
        C.box(cx, headY + .03, z, w + .12, .06, .024, STAIR_PAINT.frame);
      }
      // 门洞的侧壁和顶面包一圈门框（墙厚那一段），不然门洞里露出白色墙芯，看着像墙上挖了个洞而不是装了樘门；
      // 只贴 4 mm，不进门洞净宽。
      const vm = (vf + vo) / 2, dv = vf - vo;
      for (const [jx, s] of [[q.x0, 1], [q.x1, -1]]) C.box(jx + s * .001, headY / 2, Z(vm), .006, headY, dv, STAIR_PAINT.frame);
      C.box(cx, headY - .003, Z(vm), w, .006, dv, STAIR_PAINT.frame);
      const hinge = d.partition != null && cx > d.partition ? q.x1 : q.x0;
      const cz = Z(vf + .045), sx = hinge === q.x0 ? 1 : -1;
      C.box(hinge + sx * .3, headY + .14, cz, .3, .07, .06, STAIR_PAINT.closer);
      C.box(hinge + sx * .48, headY + .1, Z(vf + .07), .26, .02, .02, STAIR_PAINT.closer);
      if (h && h - headY > .75) {
        // 灯底离门头 18 cm（原来挂在门头上方 40 cm、底下拖一截竖管，像一面挂钟）；
        // 穿线管从灯侧面横着走到墙角，再沿墙角竖上去，横管上两只管卡
        const ly = headY + .28, ceilY = h - .3, corner = Math.abs(xr - cx) <= Math.abs(cx - xl) ? xr - .03 : xl + .03;
        bulkhead(C, M, [cx, Z(vf)], nIn, ly);
        const side = Math.sign(corner - cx) || 1;
        conduit(M, [[cx + side * .14, Z(vf), ly], [corner, Z(vf), ly], [corner, Z(vf), ceilY]], nIn);
      }
    }
    // ---- 防火门扇（酒店 / 公寓：门扇开着贴在门外的墙上，enclosures 里画的那两扇）：执手、夹丝玻璃观察窗、
    // 三个合页、眼睛高度一块白底红字「常闭式防火门」标牌——从走廊过来第一眼要认得出是樘防火门 ----
    if (detail.leaves) for (const q of doors) fireLeafDetails(C, q, d.partition, Z, dir);
    // 门口平台临梯井的一侧：社区塔楼没有围护墙那边画的护栏，这里补一段短栏杆。
    if (detail.wellGuard && f1 && f2) {
      const gx0 = p.centers[0] + p.width / 2 + .02, gx1 = p.centers[1] - p.width / 2 - .02, gz = Z(2 - .03);
      if (gx1 - gx0 > .1) {
        tube(C, { x: gx0, y: 1.07, z: gz }, { x: gx1, y: 1.07, z: gz }, .028, STAIR_PAINT.rail);
        const n = Math.max(1, Math.round((gx1 - gx0) / .11));
        for (let k = 0; k <= n; k++) post(M, gx0 + (gx1 - gx0) * k / n, .53, gz, .015, 1.06, .015, STAIR_PAINT.baluster);
      }
    }
    // ---- 门口平台侧墙上的消火栓箱（酒店 / 公寓）：盖在墙裙外面（墙裙、腰线、踢脚最外 1.2 cm） ----
    if (d.inner) {
      const n = d.inner.side === 'L' ? 1 : -1, wx = (n > 0 ? xl : xr) + n * .014;
      // u 沿墙朝里（离门越来越远）；箱子把手在离门远的一边。
      lobbyBox(B, d.inner, (u, o) => [wx + n * o, Z(d.inner.v + u)], false, paint);
    }
  }
}

/**
 * 防潮吸顶灯（楼梯间常见的那种椭圆形壁灯，不亮）：深灰铸铝灯座（椭圆，28 × 20 cm）、比灯座凸出 2 cm 的乳白磨砂灯罩
 * （比墙面暖、亮一点，手电一扫就看得出是盏灯）、灯罩前三道平行的黑色护栏（原来是圆盘上一个叉，看着像挂钟）。
 * at：墙面上的点 [x, z]；n：墙面朝外的法线 [nx, nz]，y：灯中心高度；n 为 null 时吸顶，y 是板底标高。
 */
function bulkhead(C, M, at, n, y) {
  const [x, z] = at;
  if (!n) {
    // 吸顶：y 是板底，灯往下挂
    ceilingDisc(M, x, y, z, .15, .024, STAIR_PAINT.lampBase);
    ceilingDisc(C, x, y - .022, z, .12, .055, STAIR_PAINT.lamp);
    for (const o of [-.045, 0, .045]) M.box(x, y - .083, z + o, .26, .01, .01, STAIR_PAINT.cage);
    return;
  }
  const [nx, nz] = n, P = (o) => [x + nx * o, z + nz * o];
  puck(M, P(0), n, y, .14, .035, STAIR_PAINT.lampBase, .1);
  puck(C, P(.012), n, y, .112, .043, STAIR_PAINT.lamp, .074);
  // 护栏是朝外的三片细条（4 个顶点一片；盒子 24 个，模板的顶点预算吃不消）
  const [cx, cz] = P(.057);
  for (const dy of [-.045, 0, .045]) wface(M, cx, y + dy, cz, .25, .011, n, STAIR_PAINT.cage);
}
/** 竖直的一片面，法线 n = [nx, nz]（任意水平方向）；没有 shape 的批次退回薄盒子。 */
function wface(g, x, y, z, w, h, n, color) {
  if (!g.shape) { const across = Math.abs(n[0]) > .5; g.box(x, y, z, across ? .004 : w, h, across ? w : .004, color); return; }
  _q.setFromUnitVectors(_c1.set(0, 0, 1), _d.set(n[0], 0, n[1]));
  g.shape('plane', _p.set(x, y, z), _q, _s.set(w, h, 1), color);
}
/** 贴墙走的穿线管：pts 是 [x, z, y] 的折线，n 是墙面法线；管心离墙 2 cm，横着走的每段两只管卡 */
function conduit(M, pts, n) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1], ox = n[0] * .02, oz = n[1] * .02;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (len < .02) continue;
    // 拐角两头各多出半个管径，接得上
    const ex = (bx - ax) / len * .011, ey = (by - ay) / len * .011, ez = (bz - az) / len * .011;
    M.bar({ x: ax + ox - ex, y: ay - ey, z: az + oz - ez }, { x: bx + ox + ex, y: by + ey, z: bz + oz + ez }, .022, STAIR_PAINT.conduit);
    // 管卡：盖在管子外面的一片（比管子宽、凸出管面 2 mm）
    if (Math.abs(by - ay) < .01) for (const t of [.25, .75]) wface(M, ax + (bx - ax) * t + n[0] * .033, ay, az + (bz - az) * t + n[1] * .033, .026, .04, n, STAIR_PAINT.bracket);
  }
}
/**
 * 防火门扇上的五金（门扇本身在 enclosures 里画：开着贴在门外墙上，扇面朝走廊，扇厚 5.5 cm，中心离门墙外皮 4.5 cm）。
 * 门扇位置和 enclosures 一样算：不分隔时门洞两边各一扇（宽 0.65，中心离门边 0.35），分隔时只有外侧一扇。
 * 全走刷漆批次（浅色五金在手电下才读得出来），只是外观，凸出扇面不到 4 cm。
 */
function fireLeafDetails(C, q, partition, Z, dir) {
  const w = q.x1 - q.x0, leaf = Math.min(.65, w * .6), o = -.045 - .0275;   // 扇面离门墙外皮的 v（负：走廊一侧）
  const leaves = partition == null ? [[q.x0 - .35, .65, 1], [q.x1 + .35, .65, -1]]
    : [((q.x0 + q.x1) / 2 < partition ? [q.x0 - leaf / 2 - .03, leaf, 1] : [q.x1 + leaf / 2 + .03, leaf, -1])];
  // 站在走廊里面朝门墙的人，右手是 −dir·x（楼梯间在 z 的 dir 方向）；扇面朝 −dir
  const right = -dir, nz = -dir;
  // 五金多是朝走廊的一片面（4 个顶点），不用盒子（24 个）：模板常驻显存，整栋楼的楼梯模板有顶点预算
  const F = (x, y, v, w, h, color) => vface(C, x, y, Z(v), w, h, nz, color, .004);
  for (const [lc, lw, toward] of leaves) {
    // toward：合页那一边（靠门洞）在 lc 的哪一侧（+1：x 增大一侧）
    const hingeX = lc + toward * (lw / 2 - .012), freeX = lc - toward * (lw / 2 - .075);
    // 合页：三节深色合页管，贴在门扇靠门洞的边上
    for (const y of [.25, 1.1, 1.93]) F(hingeX, y, o - .006, .02, .11, STAIR_PAINT.hingeKnuckle);
    // 执手：底板一片，加一根横把手（离地 1.07 m，盒子，侧面看得出凸出来），朝门扇中间
    F(freeX, 1.03, o - .003, .05, .17, STAIR_PAINT.lever);
    C.box(freeX + toward * .05, 1.07, Z(o - .03), .14, .022, .02, STAIR_PAINT.lever);
    // 观察窗：窄长的夹丝玻璃（15 × 60 cm），后面一片浅灰压条框
    const gx = lc + toward * .07;
    F(gx, 1.55, o - .002, .17, .62, STAIR_PAINT.frame);
    F(gx, 1.55, o - .003, .15, .6, STAIR_PAINT.wiredGlass);
    // 标牌：观察窗下面、执手上方，白底红字
    const px = lc - toward * .08;
    F(px, 1.16, o - .002, .2, .05, STAIR_PAINT.plate);
    writeText((cu, cy, su, sy) => F(px + right * cu, 1.16 + cy, o - .0035, su, sy, STAIR_PAINT.plateText), '常闭式防火门', .034, .184, 16, false);
  }
}
/** 贴墙的扁圆柱（底面在墙上，轴线沿法线 n，半宽 r、半高 rv）；没有 shape 的批次（测试记录器）退回盒子。 */
function puck(g, at, n, y, r, depth, color, rv = r) {
  if (!g.shape) { g.box(at[0] + n[0] * depth / 2, y, at[1] + n[1] * depth / 2, Math.abs(n[0]) > .5 ? depth : 2 * r, 2 * rv, Math.abs(n[0]) > .5 ? 2 * r : depth, color); return; }
  _q.setFromUnitVectors(UP, _d.set(n[0], 0, n[1]));
  // 转过去以后圆柱本地的 x 轴是竖直还是水平（看法线朝哪边）：椭圆的长轴总是水平
  const vx = Math.abs(_c0.set(1, 0, 0).applyQuaternion(_q).y) > .5;
  g.shape('cyl12', _p.set(at[0], y, at[1]), _q, _s.set(vx ? 2 * rv : 2 * r, depth, vx ? 2 * r : 2 * rv), color);
}

/**
 * 候梯厅（社区塔楼自己的楼层，lobbySpec 的结果）：
 *   迎面电梯：拉丝不锈钢门套（6.5 cm 宽，压在原来的门头上）；呼梯面板是 residence-interiors 画的，不重复；
 *   电梯墙垛：消火栓箱（西侧），出楼梯门迎面就看得到；两樘楼梯门之间：手动报警按钮和消防电话插孔；
 *   踢脚：电梯墙、楼梯门墙沿墙一圈（让开电梯门洞和楼梯门）；
 *   吊顶：两盏 36 cm 圆形吸顶灯（深色边框 + 乳白灯罩，停电时手电照得出来）和一块 60 cm 检修口。
 */
function lobbyDetails(B, L, paint) {
  const C = B.get(paint), M = B.get('extMetal'), { z0, z1, nz } = L;
  const skirt = (z, n, ranges, gaps) => {
    for (const [a0, b0] of ranges) {
      let ivs = [[a0, b0]];
      for (const [a, b] of gaps) ivs = ivs.flatMap(([p, q]) => [[p, Math.min(q, a)], [Math.max(p, b), q]]).filter(([p, q]) => q - p > .05);
      for (const [a, b] of ivs) C.box((a + b) / 2, .06, z + n * .008, b - a, .12, .016, STAIR_PAINT.lobbySkirting);
    }
  };
  // 电梯墙：门洞两边各让 0.1 m（门套）；楼梯门墙：只在两部楼梯各自的墙段上（中间那道缝是核心筒的墙垛，退进 10 cm）
  skirt(z0, nz, [[L.x0, L.x1]], L.gaps.map(([a, b]) => [a - .1, b + .1]));
  const doorWall = L.stairDoors.map(([a, b]) => [a, b]);
  skirt(z1, -nz, [[L.x0, Math.min(...doorWall.map((q) => q[1])) + .05], [Math.max(...doorWall.map((q) => q[0])) - .05, L.x1]], doorWall.map(([a, b]) => [a - .07, b + .07]));
  if (L.face) {
    const { x0, x1 } = L.face, w = x1 - x0, zf = z0 + nz * .015;
    // 门套同理走刷漆批次（浅钢灰），手电照上去是一圈亮边
    for (const jx of [x0 - .035, x1 + .035]) C.box(jx, 1.17, zf, .065, 2.34, .03, STAIR_PAINT.steel);
    C.box((x0 + x1) / 2, 2.37, zf, w + .135, .07, .03, STAIR_PAINT.steel);
  }
  for (const b of L.boxes) lobbyBox(B, b, (u, o) => [b.x + u, z0 + nz * o], true, paint);
  // 手动报警按钮 + 消防电话插孔：两部楼梯门之间那道墙垛上（1.4 m / 1.25 m 高）
  if (L.alarm != null) {
    const zf = L.doorLine - nz * .012;
    C.box(L.alarm, 1.4, zf, .1, .1, .024, STAIR_PAINT.alarm);
    M.box(L.alarm, 1.4, zf - nz * .013, .05, .05, .004, STAIR_PAINT.hydrantLabel);
    C.box(L.alarm, 1.25, zf, .07, .07, .02, STAIR_PAINT.alarm);
  }
  // 吊顶：灯在候梯厅中线、迎面电梯两侧（让开 community 那三条灯带），检修口在两灯之间靠楼梯门一侧
  const cy = L.ceiling, zc = (z0 + z1) / 2, lampX = L.face && L.fire ? [(L.fire[0] + L.face.x0) / 2, (L.face.x1 + L.fire[1]) / 2] : [];
  for (const x of lampX) {
    ceilingDisc(M, x, cy, zc, .18, .03, STAIR_PAINT.lampRim);
    ceilingDisc(C, x, cy - .03, zc, .145, .018, STAIR_PAINT.lamp);
  }
  if (L.face) {
    const px = (L.face.x0 + L.face.x1) / 2, pz = z1 - nz * .55;
    // 检修口：和吊顶差不多的灰，只有一圈深色缝看得出来（抹灰批次夜里有一点自发光，太浅会像一块灯片）
    C.box(px, cy - .004, pz, .62, .008, .62, STAIR_PAINT.lampRim);
    C.box(px, cy - .009, pz, .58, .004, .58, STAIR_PAINT.panel);
  }
}
/** 吸顶的扁圆柱（顶面贴在 y 处的吊顶上，往下 depth）；没有 shape 的批次退回盒子。 */
function ceilingDisc(g, x, y, z, r, depth, color) {
  if (!g.shape) { g.box(x, y - depth / 2, z, 2 * r, depth, 2 * r, color); return; }
  _q.identity();
  g.shape('cyl8', _p.set(x, y - depth, z), _q, _s.set(2 * r, depth, 2 * r), color);
}

/**
 * 嵌墙箱子。坐标按墙走：u 沿墙（箱子中心 0），o 离墙面往外；at(u, o) 换成模板的 [x, z]，
 * alongX 表示墙沿 x 走（门所在的墙、电梯墙）还是沿 z 走（楼梯间侧墙）。
 * paint / metal：刷漆面 / 金属的批次（模板里是 plaster / extMetal；一期宿主楼层的候梯厅用 satin / metal）；y0：楼面标高。
 */
export function lobbyBox(B, lobby, at, alongX, paint = 'concrete', metal = 'extMetal', y0 = 0) {
  const C = B.get(paint), M = B.get(metal), w = lobby.w;
  const put = (g, u, y, o, su, sy, so, color) => { const [x, z] = at(u, o); g.box(x, y0 + y, z, alongX ? su : so, sy, alongX ? so : su, color); };
  const ring = (g, u, y, o, wu, hy, t, depth, color) => {
    put(g, u, y + hy / 2 - t / 2, o, wu, t, depth, color); put(g, u, y - hy / 2 + t / 2, o, wu, t, depth, color);
    put(g, u - wu / 2 + t / 2, y, o, t, hy - 2 * t, depth, color); put(g, u + wu / 2 - t / 2, y, o, t, hy - 2 * t, depth, color);
  };
  // 贴在箱面上的一片（白字的笔画）：只画朝外的一面，2 个三角形
  const [ox, oz] = at(0, 0), [nx1, nz1] = at(0, 1), out = new THREE.Vector3(nx1 - ox, 0, nz1 - oz).normalize();
  const faceQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
  const face = (g, u, y, o, su, sy, color) => {
    if (!g.shape) { put(g, u, y, o, su, sy, .002, color); return; }
    const [x, z] = at(u, o); g.shape('plane', _p.set(x, y0 + y, z), faceQ, _s.set(su, sy, 1), color);
  };
  const P = STAIR_PAINT;
  // 面朝箱子的人，右手是 +u 还是 −u（at 的 u 轴可能和观察者的右手反向）：字从左往右写，不能写成镜像
  const [ux, uz] = at(1, 0), right = Math.sign((ux - ox) * out.z - (uz - oz) * out.x) || 1;
  const write = (g, text, u, y, o, height, maxW, color, px, strip = true) =>
    writeText((cu, cy, su, sy) => face(g, u + right * cu, y + cy, o, su, sy, color), text, height, maxW, px, strip);
  if (lobby.kind === 'hydrant') {
    // 消火栓 + 灭火器组合箱（嵌墙，凸出不到 4 cm）：一圈 3.5 cm 不锈钢包边，红色烤漆门分上下两樘（中间 2 cm 缝）。
    // 上樘消火栓门：玻璃窗（退进 6 mm），窗里是深色箱膛和盘好的水带卷盘（一圈深红的水带、浅色盘心），
    // 窗上方红门板上白字「消火栓」；下樘灭火器门：白字「灭火器」。两樘门离门轴远的一边各一个镀铬拉手。
    // 原来的字是几个方块拼的假字（像「壬壬壬」），卷盘是一块八边形红板加个黑点（像停车标志），现在都换成真的。
    const H0 = .1, H1 = 1.9, hu = .02, split = .78, f = .035;
    // 包边用刷漆批次的浅灰：金属批次在停电的暗处没有东西可反射，会变成一圈发蓝的黑框，读不出是不锈钢
    ring(C, 0, (H0 + H1) / 2, .018, w, H1 - H0, f, .036, P.hydrantFrame);
    put(C, 0, (H0 + H1) / 2, .004, w - 2 * f + .004, H1 - H0 - 2 * f + .004, .008, P.hydrantInside);   // 箱膛（门缝里看得到）
    const iw = w - 2 * f - .006, upper = [split + hu / 2, H1 - f - .003], lower = [H0 + f + .003, split - hu / 2];
    // 门板：正面在 3.6 cm
    put(C, 0, (lower[0] + lower[1]) / 2, .028, iw, lower[1] - lower[0], .016, P.hydrant);
    // 上樘门：窗框四边是门板，中间开窗；窗上沿留 11 cm 写字
    const gy0 = upper[0] + .2, gy1 = upper[1] - .12, gw = iw - .12;
    put(C, 0, (upper[0] + gy0) / 2, .028, iw, gy0 - upper[0], .016, P.hydrant);
    put(C, 0, (gy1 + upper[1]) / 2, .028, iw, upper[1] - gy1, .016, P.hydrant);
    for (const s of [-1, 1]) put(C, s * (gw / 2 + (iw - gw) / 4), (gy0 + gy1) / 2, .028, (iw - gw) / 2, gy1 - gy0, .016, P.hydrant);
    // 窗里的卷盘：深色圆底板、一圈盘好的水带（圆环）、浅色盘心，再斜挂一支铜色水枪。卷盘只有 2 cm 进深，圆环压扁了画
    const ry = (gy0 + gy1) / 2 + .01, rr = Math.min(.15, gw / 2 - .05, (gy1 - gy0) / 2 - .04), ru = -right * .02;
    if (C.shape) {
      // 叠三片圆盘（12 边）：深红的一整盘水带、盘中间一圈深色缝、浅色盘心——正面看是一圈盘好的水带。
      // 圆环（torus）一个就要 240 个三角形，模板的顶点预算吃不消
      _q.setFromUnitVectors(UP, out);
      for (const [r0, o0, dep, color] of [[rr + .015, .004, .004, P.hydrantInside], [rr, .008, .012, P.hoseReel], [rr * .58, .02, .002, P.hoseCoil], [.045, .021, .006, P.hydrantFrame]]) {
        const [cx, cz] = at(ru, o0);
        C.shape('cyl12', _p.set(cx, y0 + ry, cz), _q, _s.set(2 * r0, dep, 2 * r0), color);
      }
      face(C, ru + right * rr * .9, ry - rr * .75, .0215, .022, .12, P.nozzle);
    } else put(C, ru, ry, .017, 2 * rr, 2 * rr, .014, P.hoseReel);
    ring(C, 0, (gy0 + gy1) / 2, .028, gw, gy1 - gy0, .01, .006, P.hydrantGlass);
    // 白字：上樘窗上方「消火栓」，下樘门上部「灭火器」（画布栅格化的真字；没有画布时是一条白色标签条）
    write(C, '消火栓', 0, (gy1 + upper[1]) / 2, .0365, .072, iw - .1, P.hydrantLabel, 20);
    write(C, '灭火器', 0, lower[1] - .15, .0365, .085, iw - .1, P.hydrantLabel, 20);
    // 镀铬拉手：离门轴远的一边（站在箱前的右手），一根竖条
    for (const yc of [(upper[0] + upper[1]) / 2, (lower[0] + lower[1]) / 2 + .05]) put(C, right * (iw / 2 - .045), yc, .0385, .018, .14, .006, P.chrome);
  } else {
    // 电表箱 + 弱电箱：灰色钢门，上大下小两樘，一圈分缝，门锁和百叶。
    for (const [y, h] of [[1.55, .72], [.82, .58]]) {
      put(C, 0, y, .012, w, h, .024, P.meter);
      put(M, 0, y + h / 2 - .012, .026, w, .01, .006, P.meterSeam);
      put(M, 0, y - h / 2 + .012, .026, w, .01, .006, P.meterSeam);
      put(M, w / 2 - .08, y, .03, .025, .07, .02, P.bracket);
      for (let k = 0; k < 4; k++) put(M, -.1, y - h / 2 + .1 + k * .035, .026, w * .4, .012, .006, P.meterSeam);
    }
    // 上樘的观察窗（看电表读数）
    put(M, .08, 1.68, .025, .26, .12, .004, P.hydrantGlass);
  }
}

/**
 * 模板几何去重成带索引的几何：合批出来的盒子每个面各自 6 个顶点（一个盒子 36 个），位置、法线、颜色、UV 完全相同的
 * 顶点其实只要存一份（盒子 24 个、平面 4 个、圆柱侧面共用）。模板常驻显存、每层实例都要过一遍顶点着色器，
 * 去重后顶点少三成多，画面一个像素都不变。键是各属性的原始数值，完全相等才合并。
 */
function indexTemplate(g) {
  const n = g.attributes.position.count;
  if (g.index || n < 3) return g;
  // 每个顶点的各属性按原始位打包成几个 32 位字（浮点取位模式，8 / 16 位整数挤进一个字），哈希表开放寻址，逐字比较确认。
  // 一份模板一两万个顶点，几毫秒（拼字符串做键要几十毫秒，酒店、公寓建楼时会卡一下）。
  const parts = Object.values(g.attributes).map((a) => {
    const arr = a.array, k = a.itemSize;
    if (arr instanceof Float32Array) return { words: k, get: (i, out, o) => { for (let c = 0; c < k; c++) { F32[0] = arr[i * k + c]; out[o + c] = U32[0]; } } };
    const bits = arr.BYTES_PER_ELEMENT * 8, per = Math.floor(32 / bits), words = Math.ceil(k / per), mask = bits === 32 ? -1 : (1 << bits) - 1;
    return { words, get: (i, out, o) => { for (let w = 0; w < words; w++) { let v = 0; for (let c = w * per; c < Math.min(k, (w + 1) * per); c++) v |= (arr[i * k + c] & mask) << ((c - w * per) * bits); out[o + w] = v >>> 0; } } };
  });
  const W = parts.reduce((t, q) => t + q.words, 0), words = new Uint32Array(n * W);
  for (let i = 0; i < n; i++) { let o = i * W; for (const q of parts) { q.get(i, words, o); o += q.words; } }
  let size = 1; while (size < n * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1), remap = new Uint32Array(n), keep = [];
  for (let i = 0; i < n; i++) {
    let h = 2166136261;
    for (let c = 0; c < W; c++) h = Math.imul(h ^ words[i * W + c], 16777619);
    let slot = (h >>> 0) & (size - 1), j;
    for (;;) {
      j = table[slot];
      if (j < 0) { j = keep.length; table[slot] = j; keep.push(i); break; }
      const a = keep[j] * W, b = i * W; let same = true;
      for (let c = 0; c < W; c++) if (words[a + c] !== words[b + c]) { same = false; break; }
      if (same) break;
      slot = (slot + 1) & (size - 1);
    }
    remap[i] = j;
  }
  if (keep.length > n * .9) return g;
  for (const [name, a] of Object.entries(g.attributes)) {
    const out = new a.array.constructor(keep.length * a.itemSize), k = a.itemSize;
    for (let j = 0; j < keep.length; j++) for (let c = 0; c < k; c++) out[j * k + c] = a.array[keep[j] * k + c];
    g.setAttribute(name, new THREE.BufferAttribute(out, k, a.normalized));
  }
  g.setIndex(new THREE.BufferAttribute(keep.length < 65536 ? new Uint16Array(remap) : remap, 1));
  return g;
}
const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);

/** Repeated 3.4m flights share one geometry per material. Only the current,
 * preceding and following floors need visible flights inside an enclosed shaft;
 * the protective walls and roof housings remain in the permanent facade batch.
 * 同一层高、同一细部做法（stairDetailKey）的楼层共用一份模板：墙裙、扶手、门框这些逐层重复的细部都在模板里，
 * 不会逐层复制。 */
export function buildTowerStairInstances(ctx, building, levels, stairs, materials, exterior, { idle = null, follow = false, lazy = false } = {}) {
  if (!building.access?.protected) return;
  const buckets=new Map(),flightsOf=id=>building.access.flights.filter(f=>f.parentFloor===id&&protectedFlight(f));
  for(const lv of levels.filter(l=>flightsOf(l.id).length)) {
    const spec=stairDetailSpec(building,lv,stairs,ctx.layout?.elevators),key=stairDetailKey(lv,spec);
    if(!buckets.has(key))buckets.set(key,{spec,members:[]});
    buckets.get(key).members.push(lv);
  }
  levelInstances(ctx,building,levels,buckets,materials,exterior,{name:'protected-stairs',flag:'towerStairs',idle,follow,lazy,build:(batch,{members,spec})=>{
    const lv=members[0],offset=lv.elev;
    const access={protected:true,
      flights:flightsOf(lv.id).map(f=>({...f,
        bottom:{...f.bottom,y:f.bottom.y-offset},top:{...f.top,y:f.top.y-offset}})),
      surfaces:building.access.surfaces.filter(s=>s.parentFloor===lv.id).map(s=>({...s,elev:s.elev-offset})),
    };
    // 刷漆面走 plaster（无缝抹灰）；材质表里没有就退回 concrete，模板仍然只有两个批次。
    buildTowerStairGeometry(batch,{...building,access},[],stairs,{enclosures:false,detail:spec,paint:materials.plaster?'plaster':'concrete'});
  }});
}

/**
 * 逐层重复的几何按「同一层高 + 同一做法」分组，每组一份模板（InstancedMesh，每种材质一个），只在当前楼层和上下各一层显示。
 * buckets：key → { spec, members: [楼层] }；build(batch, record) 往 BatchSet 里画一份（y 以该层楼面为 0）。
 * lazy：一组的模板等它的某一层第一次要显示时才建。
 */
function levelInstances(ctx, building, levels, buckets, materials, exterior, { name, flag, idle = null, follow = false, lazy = false, build }) {
  const records=[];
  const instance=record=>{
    const {members}=record,lv=members[0];
    const batch=new BatchSet(materials),template=new THREE.Group();
    build(batch,record);
    batch.flush(template);
    const meshes=[];
    for(const source of [...template.children]) {
      indexTemplate(source.geometry);
      const mesh=new THREE.InstancedMesh(source.geometry,source.material,members.length);
      mesh.name=`${building.id}-${name}-${lv.height}-${source.name}`;
      mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
      mesh.userData[flag]=true;mesh.sourceMesh=source;mesh.count=0;mesh.visible=false;
      exterior.add(mesh);meshes.push(mesh);
    }
    template.clear();record.meshes=meshes;
  };
  for(const {members,spec} of buckets.values()){const record={members,spec,meshes:null};if(!lazy)instance(record);records.push(record);}
  let last='';
  const update=app=>{
    // follow: a core rising through host levels shows its flights wherever the visitor walks them.
    const state=app.state,inside=state.explore?.building===building.id||(follow&&!!state.explore&&levels.some(l=>l.id===state.explore.level));
    const current=inside?state.explore.level:state.building===building.id?state.focus:null;
    const index=levels.findIndex(l=>l.id===current);
    const active=index>=0?levels.slice(Math.max(0,index-1),index+(inside?2:1)).map(l=>l.id)
      : idle||[levels.find(l=>l.short==='1F')?.id,levels.at(-2).id];
    const signature=active.join('|');if(signature===last)return;last=signature;
    for(const record of records) {
      const selected=record.members.filter(l=>active.includes(l.id));
      if(!record.meshes&&selected.length)instance(record);
      for(const mesh of record.meshes||[]) {
        for(const [i,lv] of selected.entries()) {
          const matrix=frameMatrix(building.frame);matrix.elements[13]=lv.elev;
          mesh.setMatrixAt(i,instanceMatrix(mesh.sourceMesh,matrix));
        }
        mesh.count=selected.length;mesh.visible=selected.length>0;
        mesh.instanceMatrix.needsUpdate=true;
        if(mesh.visible){mesh.boundingSphere=null;mesh.computeBoundingSphere();}
      }
    }
  };
  update({state:{}});
  ctx.dynamic.push({name:`${building.id}-${name}`,update:(dt,time,app)=>update(app)});
}

// ---------- 酒店 / 公寓的公共走廊（双面走廊，两侧是套房的户门墙；墙和门洞是逐层加载的套房模型） ----------
/** 走廊细部的顶点色：踢脚、烟感 */
export const CORRIDOR_PAINT = Object.freeze({
  skirting: '#4d4a45', skirtingTop: '#5d5a54', smoke: '#e6e3dc', smokeRing: '#b9b6ae',
});
/** 户门墙墙面相对走廊净宽线（walk 的 corridor 矩形边）的位置：套房模型的前墙面正好落在线上（实测） */
export const CORRIDOR_FACE = 0;
/**
 * 一层走廊的细部做法（纯数据；同一层高、同一做法的楼层共用一份实例化模板）：
 *   sides   两侧户门墙：{ z（墙面）, n（朝走廊的法线 z 分量）, x0 / x1（户门墙从哪到哪）, doors: [[a, b]…]（入户门洞，踢脚在这里断开） }
 *   boxes   嵌墙的箱子：{ kind: 'hydrant' | 'meter', side（sides 的下标）, x, w }——一头一个消火栓箱，旁边一对表箱
 *   smoke   吊顶上烟感的 x；ceiling 吊顶标高（相对楼面）
 * 只认套房（suitePlan）的户门正好开在走廊两条长边上的做法，别的楼层返回 null（不画）。
 */
export function corridorSpec(building, lv) {
  if (building.community || !lv?.walk || !lv.units?.length) return null;
  const hall = lv.walk.find((w) => w.kind === 'corridor' && w.rect && w.id === `${building.id}-hall`);
  if (!hall) return null;
  const F = building.frame, r = hall.rect, r3 = (v) => Math.round(v * 1000) / 1000;
  const L = (u, x, z) => { const w = toW(u.frame, x, z), dx = w[0] - F.ox, dz = w[1] - F.oz; return [dx * F.c + dz * F.s, -dx * F.s + dz * F.c]; };
  const sides = [{ z: r3(r.z0 - CORRIDOR_FACE), n: 1, x0: Infinity, x1: -Infinity, doors: [] }, { z: r3(r.z1 + CORRIDOR_FACE), n: -1, x0: Infinity, x1: -Infinity, doors: [] }];
  for (const u of lv.units) {
    const e = u.residence?.entryDoor, f = u.fronts?.[0];
    if (!u.residence?.suitePlan || !e || !f) continue;
    const ux = Math.sign(f.x1 - f.x0) || 1;
    const a = L(u, f.x0, f.z0), b = L(u, f.x1, f.z1), d0 = L(u, f.x0 + ux * (e.at - e.width / 2), f.z0), d1 = L(u, f.x0 + ux * (e.at + e.width / 2), f.z0);
    const side = sides.findIndex((s, k) => Math.abs(a[1] - [r.z0, r.z1][k]) < .3 && Math.abs(b[1] - [r.z0, r.z1][k]) < .3);
    if (side < 0) return null;
    const s = sides[side];
    s.x0 = Math.min(s.x0, a[0], b[0]); s.x1 = Math.max(s.x1, a[0], b[0]);
    s.doors.push([r3(Math.min(d0[0], d1[0])), r3(Math.max(d0[0], d1[0]))]);
  }
  if (sides.some((s) => !s.doors.length)) return null;
  for (const s of sides) { s.x0 = r3(s.x0); s.x1 = r3(s.x1); s.doors.sort((p, q) => p[0] - q[0]); }
  // 两头各一个消火栓箱（走廊 50 多米，一个箱子的水带够不着另一头）：东头挂北墙、西头挂南墙，各离户门墙尽头 0.9 m，
  // 旁边一对电表 / 弱电箱。都不压门洞、门套。
  const boxes = [];
  const place = (side, x, w, kind) => {
    const s = sides[side];
    if (x - w / 2 < s.x0 + .15 || x + w / 2 > s.x1 - .15) return;
    if (s.doors.some(([a, b]) => x + w / 2 > a - .2 && x - w / 2 < b + .2)) return;
    boxes.push({ kind, side, x: r3(x), w });
  };
  place(0, sides[0].x1 - .9, .72, 'hydrant'); place(0, sides[0].x1 - 2.0, .6, 'meter');
  place(1, sides[1].x0 + .9, .72, 'hydrant'); place(1, sides[1].x0 + 2.0, .6, 'meter');
  const smoke = [];
  for (let x = Math.ceil((r.x0 + 4) / 10) * 10 - 5.5; x < r.x1 - 3; x += 10) smoke.push(r3(x));
  return { sides, boxes, smoke, ceiling: r3(lv.height - .28) };
}

/** 酒店 / 公寓走廊的细部：每组模板只有一个批次（刷漆面，plaster），只在当前楼层上下显示，+1 个绘制调用。 */
export function buildCorridorInstances(ctx, building, levels, materials, exterior) {
  const paint = materials.plaster ? 'plaster' : 'concrete', buckets = new Map();
  for (const lv of levels) {
    const spec = corridorSpec(building, lv);
    if (!spec) continue;
    const key = `${lv.height.toFixed(4)}|${JSON.stringify(spec)}`;
    if (!buckets.has(key)) buckets.set(key, { spec, members: [] });
    buckets.get(key).members.push(lv);
  }
  if (!buckets.size) return;
  levelInstances(ctx, building, levels, buckets, materials, exterior, { name: 'corridor', flag: 'towerCorridor', lazy: true, idle: [], build: (batch, { spec }) => corridorDetails(batch, spec, paint) });
}

/**
 * 走廊两侧（y 以楼面为 0，楼栋坐标）：
 *   踢脚：10 cm 深灰，户门墙全长、在门洞和箱子处断开，上口一条 1 cm 的小平台（侧面看得出是贴上去的一条）；
 *   户门的门套、门牌套房模型里本来就有（浅色门套凸出墙面），这里不再叠一圈（叠上去也被挡住，还白占顶点）；
 *   嵌墙箱子：消火栓箱（lobbyBox 同一做法）、表箱；吊顶：每 10 m 一个烟感。
 * 全是朝外的面片和薄盒子，不进行走身体（凸出墙面不到 4 cm）。
 */
export function corridorDetails(B, spec, paint = 'plaster') {
  const C = B.get(paint), P = CORRIDOR_PAINT;
  spec.sides.forEach((s, k) => {
    const n = s.n, z = (o) => s.z + n * o, nn = [0, n];
    const gaps = [...s.doors.map(([a, b]) => [a - .075, b + .075]), ...spec.boxes.filter((q) => q.side === k).map((q) => [q.x - q.w / 2 - .01, q.x + q.w / 2 + .01])];
    let ivs = [[s.x0, s.x1]];
    for (const [a, b] of gaps) ivs = ivs.flatMap(([p, q]) => [[p, Math.min(q, a)], [Math.max(p, b), q]]).filter(([p, q]) => q - p > .04);
    for (const [a, b] of ivs) {
      wface(C, (a + b) / 2, .05, z(.012), b - a, .1, nn, P.skirting);
      if (C.flat) C.flat((a + b) / 2, .1, z(.006), b - a, .012, P.skirtingTop); else C.box((a + b) / 2, .1, z(.006), b - a, .004, .012, P.skirtingTop);
    }
  });
  for (const q of spec.boxes) {
    const s = spec.sides[q.side], zf = s.z + s.n * .003;
    lobbyBox(B, q, (u, o) => [q.x + u, zf + s.n * o], true, paint, paint);
  }
  // 烟感偏开走廊中线 0.9 m，不和中线上的灯盒、检修口排成一串
  for (const x of spec.smoke) {
    ceilingDisc(C, x, spec.ceiling, .9, .06, .03, P.smokeRing);
    ceilingDisc(C, x, spec.ceiling - .03, .9, .035, .012, P.smoke);
  }
}
