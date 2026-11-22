// 丧尸围城的「沿途痕迹」：停电两个小时以前这里出过事——玩家一路走过的地方（商场保安室、地下一层电梯厅、
// 三道关所在楼层的楼梯间和走廊、放工具的那一户、关卡之间一路往上的楼梯、屋顶出口）留下血迹、拖痕、手印、弹孔、
// 散落的纸张碎玻璃、丢下的手机、警戒线和幸存者的涂鸦。以前这一路全是干干净净的白墙，一点不像出过事。
//
// 怎么做的（都只是画面，不碰导航、碰撞、射击判定）：
//   1. 每局的关卡计划（siege.plan）一定下来，按导航数据找落点：地面用 landAt / clear（站得住、离墙够远、和热点在同一个房间里），
//      墙面用导航里的墙段（家具、门扇这些障碍物的边不算墙；墙前 0.2 米有家具的也不贴）。
//      场景几何体上传显卡以后顶点数组就释放了（app.js 的 releaseGeometryAfterUpload），没法对着模型打射线，所以落点全靠导航。
//      导航的墙线有的在墙中线、有的在楼梯间外框上（楼梯间的墙内皮在框里 0.1 / 0.2 米，见 wallSkin），贴花按算出来的墙皮放，
//      着色器里再把深度朝镜头挪 3 厘米（屏幕上的位置不变）：墙皮估得差一点也盖得住，又不会盖到墙上凸出来的消火栓箱上。
//      地面贴花按面层高度抬起来（公共区 3 厘米、住户里 5.6 厘米：套房的木地板和地毯）。
//      关卡跟前的招牌痕迹挂在关卡大件上：反锁的防火门门扇上的手印（门开了就撤掉）、火背后熏到天花板的烟、杂物堆背后的弹孔。
//   2. 全部贴花共用一张程序画的图集（血泊、溅血、拖痕、抹痕、手印、鞋印、弹孔、烟熏、碎玻璃、碎石灰、纸、手机、鞋、背包、弹壳、警戒线、涂鸦），
//      一个 InstancedMesh 画完（1 次绘制调用）。图集每格的 UV、透明度、光泽、深度偏移都是逐实例的属性。
//      新鲜的血（暗红、几乎不含绿）在着色器里变光滑，干了的褐色边缘是粗糙的——同一张图，不用另画一张粗糙度图。
//   3. 只画玩家所在的那一层（和楼梯口要预搭的那一层）：别的楼层没搭内装时贴花不会悬在半空；顶点也少。
//   4. 落点计算和画图集都切成小步，每帧最多几毫秒（update 里推进），开局不卡；走廊那几段路线交给分帧寻路（pathfinder）。
//   5. 同一局（同一个计划）结果完全一样（种子来自计划本身）；换一局、换一栋楼重算；退出丧尸围城释放图集和缓冲。
import * as THREE from 'three';
import { landAt, clear, supported } from '../layout/nav.js';
import { pointInPoly } from '../layout/geom.js';
import { lobbySpot } from './siege.js';
import { DOOR } from './siege-props.js';
import { doorOutside } from './guide.js';
import { MEM } from '../render/device.js';

export const ROUTE_DRESS = Object.freeze({
  grid: 16,              // 图集按 16 × 16 小格排（1024 图集一格 64 像素）
  budget: 4,             // 每帧最多算几毫秒
  wallOff: 0.1,          // 墙面贴花离导航墙线多远（墙线在墙中线时正好贴在 0.2 米厚墙的表面）
  wallPull: 0.03,        // 墙面贴花的深度朝镜头挪多少米（屏幕位置不变）：墙皮位置估得差几厘米也盖得住；挪多了会盖到墙上的消火栓箱（凸出 4.5 厘米）、扶手上
  floorLift: 0.03,       // 地面贴花离楼面多高（公共区的地面面层比楼面高 1~3 厘米；以前 6 毫米，斜着看远一点就被面层吃掉）
  homeLift: 0.056,       // 住户里：套房地板在楼面上 3.5 厘米、地毯再高 1.4 厘米
  treadLift: 0.012,      // 楼梯踏步上（踏步是实打实的块，没有面层）
  floorPull: 0.035,      // 地面贴花的深度挪多少（地板面层比楼面高 1~3 厘米）
  margin: 0.4,           // 墙面贴花离墙段两头（门洞、转角）至少多远
  pathWait: 8,           // 走廊路线等寻路最多几秒，等不到就按直线
  maxItems: 1400,
});

/**
 * 图集的格子：[x, y, 宽, 高]（16 × 16 小格；y 从图的上沿往下数）。
 * 涂鸦每格一句：长格 8 × 2、短格 4 × 2。改格子时测试会检查不重叠、不出界。
 */
export const ATLAS_CELLS = Object.freeze({
  pool0: [0, 0, 4, 4], pool1: [4, 0, 4, 4], splat0: [8, 0, 4, 4], splat1: [12, 0, 4, 4],
  gInfected: [0, 4, 8, 2], gRoof: [8, 4, 8, 2],
  gPower: [0, 6, 8, 2], gHelp: [8, 6, 4, 2], gSos: [12, 6, 4, 2],
  gStairs: [0, 8, 6, 2], drag: [6, 8, 6, 2], gTally: [12, 8, 4, 2],
  // 烟熏（scorch）是竖长的一条：火在墙根，烟往上张开一直熏到天花板；地上烧过的那块（burn）另画一格
  holes: [0, 10, 3, 3], burn: [3, 10, 3, 3], scorch: [6, 10, 2, 4], glass: [8, 10, 4, 2], debris: [12, 10, 4, 2],
  smear: [8, 12, 4, 1], tape: [8, 13, 4, 1], shoe: [12, 12, 2, 2], bag: [14, 12, 2, 2],
  // 手机、弹壳横着画（地上的东西本来就随便转）；trail：一串顺着走的方向拉长的血滴
  phone: [0, 13, 2, 1], casings: [2, 13, 2, 1], trail: [4, 13, 2, 1],
  // handDrag：按上去以后往下滑的手印（墙上一半的手印用它）
  handL: [0, 14, 2, 2], handR: [2, 14, 2, 2], handDrag: [4, 14, 2, 2], footL: [6, 14, 2, 2], footR: [8, 14, 2, 2], drops: [10, 14, 2, 2],
  paper0: [12, 14, 2, 2], paper1: [14, 14, 2, 2],
});

/** 涂鸦写什么、用什么画：spray 喷漆（有飞沫、往下流）、marker 记号笔、blood 手指蘸血、paint 刷子刷的白漆（屋顶地面） */
export const GRAFFITI = Object.freeze({
  gInfected: Object.freeze({ text: '里面有感染者', style: 'spray', color: '#a3170f' }),
  gRoof: Object.freeze({ text: '往楼顶走', arrow: 'up', style: 'spray', color: '#151515' }),
  gPower: Object.freeze({ text: 'B1 有电', arrow: 'down', style: 'spray', color: '#a3170f' }),
  gStairs: Object.freeze({ text: '别上楼！', style: 'spray', color: '#a3170f' }),
  gHelp: Object.freeze({ text: '救命', style: 'blood', color: '#5a0507' }),
  gSos: Object.freeze({ text: 'SOS', style: 'paint', color: '#e4e1d8', latin: true }),
  gTally: Object.freeze({ text: '正正正丅', style: 'marker', color: '#1b1b1b', tally: true }),
});

/** 实例的光泽方式：0 哑光；1 按颜色认新鲜血（暗红变亮滑）；2 整块光滑（玻璃、手机屏、弹壳） */
const MATTE = 0, BLOOD = 1, GLOSS = 2;
/** 墙上的手印：一半是按上去就滑下来的（handDrag），干干净净的一只手按在墙上反倒不像 */
const HANDS = Object.freeze(['handL', 'handR', 'handDrag', 'handDrag']);
/** 格子里画的东西比格子小 / 大多少：同一个「手印大小」下 handDrag 那格里手只占上面一半，要放大一点 */
const SIZE_K = Object.freeze({ handDrag: 1.45 });

/** 每格的 UV 矩形 [u0, v0, du, dv]（纹理 flipY：图集上沿是 v = 1） */
export function cellUv(name, grid = ROUTE_DRESS.grid) {
  const c = ATLAS_CELLS[name]; if (!c) return null;
  const [x, y, w, h] = c;
  return [x / grid, 1 - (y + h) / grid, w / grid, h / grid];
}
/** 格子的高宽比（贴花的高 = 宽 × 这个） */
export const cellAspect = (name) => { const c = ATLAS_CELLS[name]; return c ? c[3] / c[2] : 1; };

/** 图集边长：电脑 1024，手机（标准 / 高清 / 省内存）512。null = 不画（目前每一档都画） */
export function atlasSize(mem = MEM) {
  if (!mem) return 512;
  return mem.name === 'full' ? 1024 : 512;
}
/** 各档的贴花密度（省内存档少放一些，顶点、填充都省一点） */
export const densityFor = (mem = MEM) => (mem?.name === 'compact' ? 0.65 : 1);

// ---------------------------------------------------------------------------
// 随机数：同一个种子同样的结果

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** 这一局的种子：楼、每一步的楼层和位置（同一个计划算出来一样；换一局就变） */
export function dressSeed(plan, salt = 0) {
  const key = [plan?.tower?.id || '', ...(plan?.stages || []).map((s) => `${s.id}:${s.floor}:${(+s.site?.x || 0).toFixed(1)}:${(+s.site?.z || 0).toFixed(1)}`)].join('|');
  return (hashString(key) ^ Math.imul(salt | 0, 2654435761)) >>> 0;
}

// ---------------------------------------------------------------------------
// 几何：贴花的局部坐标 → 世界矩阵

/**
 * 地面贴花的三个轴：法线朝上，图上方朝 (sin a, cos a)。返回 { r, u, n }（单位向量）
 * （右 × 上 = 法线，正面朝上，不用双面材质）
 */
export function floorAxes(a) {
  const fx = Math.sin(a), fz = Math.cos(a);
  return { r: [-fz, 0, fx], u: [fx, 0, fz], n: [0, 1, 0] };
}
/** 墙面贴花的三个轴：法线 (nx, 0, nz) 朝走道一侧，图上方朝上，再在墙面内转 phi */
export function wallAxes(nx, nz, phi = 0) {
  const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
  const r0 = [nz, 0, -nx], u0 = [0, 1, 0], c = Math.cos(phi), s = Math.sin(phi);
  return { r: [r0[0] * c + u0[0] * s, r0[1] * c + u0[1] * s, r0[2] * c + u0[2] * s], u: [u0[0] * c - r0[0] * s, u0[1] * c - r0[1] * s, u0[2] * c - r0[2] * s], n: [nx, 0, nz] };
}
/** 贴花的世界矩阵（列主序 16 个数，写进 out 的 o 处）：X 轴 = 右 × 宽，Y 轴 = 上 × 高，Z 轴 = 法线，平移 = 位置 */
export function itemMatrix(it, out = new Float32Array(16), o = 0) {
  const { r, u, n, p, w, h } = it;
  out[o] = r[0] * w; out[o + 1] = r[1] * w; out[o + 2] = r[2] * w; out[o + 3] = 0;
  out[o + 4] = u[0] * h; out[o + 5] = u[1] * h; out[o + 6] = u[2] * h; out[o + 7] = 0;
  out[o + 8] = n[0]; out[o + 9] = n[1]; out[o + 10] = n[2]; out[o + 11] = 0;
  out[o + 12] = p[0]; out[o + 13] = p[1]; out[o + 14] = p[2]; out[o + 15] = 1;
  return out;
}

// ---------------------------------------------------------------------------
// 落点

const levelOf = (nav, id) => { const F = nav.floors.get(id); return F?.parentFloor || F?.level?.id || id; };
const segDist = (px, pz, w) => {
  const dx = w.x1 - w.x0, dz = w.z1 - w.z0, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - w.x0) * dx + (pz - w.z0) * dz) / l2));
  return Math.hypot(px - (w.x0 + dx * t), pz - (w.z0 + dz * t));
};
const cross = (ax, az, bx, bz, w) => {
  const d = (x0, z0, x1, z1, x2, z2) => (x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0);
  const d1 = d(w.x0, w.z0, w.x1, w.z1, ax, az), d2 = d(w.x0, w.z0, w.x1, w.z1, bx, bz);
  const d3 = d(ax, az, bx, bz, w.x0, w.z0), d4 = d(ax, az, bx, bz, w.x1, w.z1);
  return d1 * d2 < 0 && d3 * d4 < 0;
};
const edgeKey = (x0, z0, x1, z1) => { const a = `${x0.toFixed(2)},${z0.toFixed(2)}`, b = `${x1.toFixed(2)},${z1.toFixed(2)}`; return a < b ? `${a}|${b}` : `${b}|${a}`; };

/**
 * 落点工具。items 收集结果；每个热点先取一份局部的墙和障碍物（大楼层上千段墙，逐个点查太慢）。
 * avoid：[{ x, z, r, floor }] 不放地面贴花的圆（关卡的大件、电梯门口）。
 */
export function createPlacer({ nav, rng, items = [], avoid = [], density = 1, layout = null }) {
  /** 一圈障碍物（家具、门扇）的边：导航的墙线里和它重合的那些不算墙。只取热点附近的（大楼层上千件家具，全取一遍要几十毫秒） */
  /**
   * 墙面贴花离导航墙线多远才正好落在真墙面上：楼梯间的墙按 tower-stairs.js 的做法——社区塔楼自己楼层的墙骑在外框线上
   * （0.2 厚，内皮在框内 0.1），酒店 / 公寓的围护墙整个在框里（内皮在框内 0.2、外皮就在框线上）；别的墙按中线算（0.1）。
   * 以前一律 0.1：公寓楼梯间里贴花比墙面还靠后 0.1 米，斜着看就被墙吞掉了
   */
  // 楼梯间不只在自己那栋楼的楼层上：北区塔楼的楼梯一直下到商场的地下一层（宿主楼层），所以不按楼号筛，按位置找
  let stairPolys = null;
  const stairsNear = () => (stairPolys ||= (layout?.stairs || []).filter((q) => q.poly?.length));
  const onPoly = (x, z, P) => { let d = Infinity; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; d = Math.min(d, segDist(x, z, { x0: a[0], z0: a[1], x1: b[0], z1: b[1] })); } return d; };
  const inStair = (x, z) => stairsNear().some((st) => pointInPoly([x, z], st.poly));
  function wallSkin(F, w, nx, nz) {
    for (const st of stairsNear()) {
      if (onPoly(w.x0, w.z0, st.poly) > 0.08 || onPoly(w.x1, w.z1, st.poly) > 0.08) continue;
      const mx = (w.x0 + w.x1) / 2, mz = (w.z0 + w.z1) / 2, inward = pointInPoly([mx + nx * 0.3, mz + nz * 0.3], st.poly);
      // 社区塔楼自己的楼层：墙骑在框线上；别的（酒店、公寓、商场里的宿主楼层）：墙整个在框里
      const b = layout.buildings?.find((q) => q.id === st.building), own = !!b?.community && (F.level?.building ?? F.building) === st.building;
      return inward ? (own ? 0.1 : 0.2) : (own ? 0.1 : 0.0);
    }
    return ROUTE_DRESS.wallOff;
  }
  /** 这一点的地面面层有多高：住户里（套房的木地板、地毯）比公共区高 */
  const homesOf = new Map();
  function liftAt(lvId, x, z) {
    if (!layout?.levels) return ROUTE_DRESS.floorLift;
    if (!homesOf.has(lvId)) homesOf.set(lvId, (layout.levels.find((l) => l.id === lvId)?.units || []).filter((u) => u.residence && u.polys?.length).flatMap((u) => u.polys));
    return homesOf.get(lvId).some((P) => pointInPoly([x, z], P)) ? ROUTE_DRESS.homeLift : ROUTE_DRESS.floorLift;
  }
  const edgesOf = (obst) => {
    const s = new Set();
    for (const o of obst) for (const P of [o.outer, ...(o.holes || []).map((h) => h.poly)]) for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s.add(edgeKey(a[0], a[1], b[0], b[1])); }
    return s;
  };
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const range = (a, b) => a + (b - a) * rng();
  const count = (n) => { const v = n * density; return Math.floor(v) + (rng() < v - Math.floor(v) ? 1 : 0); };
  const wallRects = []; // 墙上已经贴了的（各热点共用：两个热点挨着时也不叠在一起）
  // 血一处一处深浅不一（有的干透发暗、有的还新）：逐实例乘一个明度
  const toneFor = (mode) => (mode === BLOOD ? 0.72 + rng() * 0.36 : 1);

  /** 热点：一层楼上的一个中心点和半径。返回在这个热点上放东西的方法 */
  function spot(floorId, cx, cz, R, { level = null } = {}) {
    const F = nav.floors.get(floorId);
    if (!F) return null;
    const lv = level || levelOf(nav, floorId), y = F.y;
    const walls = [], usable = [], obst = [];
    const box = (x0, z0, x1, z1, pad) => !(x0 > cx + pad || x1 < cx - pad || z0 > cz + pad || z1 < cz - pad);
    for (const o of F.obstacles) if (box(o.bb.x0, o.bb.z0, o.bb.x1, o.bb.z1, R + 1.5)) obst.push(o);
    const edges = edgesOf(obst);
    for (const w of F.walls) {
      if (w.gate?.open) continue; // 开着的门扇不是墙
      if (!box(Math.min(w.x0, w.x1), Math.min(w.z0, w.z1), Math.max(w.x0, w.x1), Math.max(w.z0, w.z1), R + 1.5)) continue;
      walls.push(w);
      const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
      // 能贴的墙：够长、不是矮掩体（沙袋墙有 top）、不是门禁闸门、不是家具 / 门扇的轮廓
      if (len >= 0.9 && !w.top && !w.gate && !edges.has(edgeKey(w.x0, w.z0, w.x1, w.z1))) usable.push({ w, len });
    }
    const inObstacle = (x, z) => obst.some((o) => x >= o.bb.x0 && x <= o.bb.x1 && z >= o.bb.z0 && z <= o.bb.z1 && pointInPoly([x, z], o.outer));
    const blocked = (ax, az, bx, bz, except = null) => walls.some((w) => w !== except && cross(ax, az, bx, bz, w));
    const wallGap = (x, z) => { let d = Infinity; for (const w of walls) d = Math.min(d, segDist(x, z, w)); return d; };
    const near = (x, z, r) => avoid.some((a) => (!a.floor || a.floor === floorId) && Math.hypot(a.x - x, a.z - z) < a.r + r);
    const big = [];

    /** 地面上一个站得住、离墙至少 gap、热点看得见（同一个房间）的点；放不下返回 null */
    function floorPoint(r0, r1, gap, { from = null, spread = 0 } = {}) {
      for (let k = 0; k < 14; k++) {
        const a = rng() * Math.PI * 2, d = r0 + (r1 - r0) * Math.sqrt(rng());
        const bx = from ? from[0] : cx, bz = from ? from[1] : cz;
        const x = bx + Math.cos(a) * (spread || d), z = bz + Math.sin(a) * (spread || d);
        const st = landAt(nav, x, z, y + 0.6);
        if (!st || st.floor !== floorId || Math.abs(st.y - y) > 0.05 || st.slope) continue;
        if (!clear(nav, st) || inObstacle(x, z) || near(x, z, gap * 0.6)) continue;
        if (wallGap(x, z) < gap) continue;
        if (blocked(cx, cz, x, z)) continue;
        return [x, z];
      }
      return null;
    }
    function addFloor(cell, x, z, size, { a = rng() * Math.PI * 2, mode = MATTE, alpha = 1, h = null, tone = toneFor(mode) } = {}) {
      const ax = floorAxes(a);
      items.push({ lv, cell, p: [x, y + liftAt(lv, x, z), z], ...ax, w: size, h: h ?? size * cellAspect(cell), mode, alpha, pull: ROUTE_DRESS.floorPull, tone });
      return items[items.length - 1];
    }
    /** 地面撒 n 个（cells 里随机挑格子） */
    function floor(cells, n, { r0 = 0, r1 = R, size = [0.3, 0.5], gap = null, mode = MATTE, alpha = [0.85, 1], spaced = 0, keep = false } = {}) {
      let put = 0;
      for (let i = 0, want = keep ? n : count(n); i < want; i++) {
        const s = range(size[0], size[1]), cell = Array.isArray(cells) ? pick(cells) : cells;
        const q = floorPoint(r0, r1, gap ?? Math.max(0.25, s * 0.45));
        if (!q) continue;
        if (spaced && big.some((b) => Math.hypot(b[0] - q[0], b[1] - q[1]) < spaced)) continue;
        if (spaced) big.push(q);
        addFloor(cell, q[0], q[1], s, { mode, alpha: range(alpha[0], alpha[1]) }); put++;
      }
      return put;
    }
    /**
     * 一串脚印：从 a 走向 b（世界 x, z），左右脚交替、步长 0.62 米，越走越淡（鞋底的血蹭没了）。
     * 每一步都要落在这层楼面上、不进家具；踩不到的那步就跳过（脚印断断续续本来也自然）。
     */
    function footsteps(ax, az, bx, bz, { n = 8, size = 0.31, fade = true } = {}) {
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.5) return 0;
      const fx = (bx - ax) / L, fz = (bz - az) / L, step = 0.62, steps = Math.min(n, Math.floor(L / step));
      let put = 0;
      for (let i = 0; i < steps; i++) {
        const side = i % 2 ? 1 : -1, d = 0.3 + i * step + range(-0.04, 0.04);
        const x = ax + fx * d - fz * side * 0.11, z = az + fz * d + fx * side * 0.11;
        const st = landAt(nav, x, z, y + 0.6);
        if (!st || st.floor !== floorId || Math.abs(st.y - y) > 0.05 || inObstacle(x, z) || wallGap(x, z) < 0.16) continue;
        const a = Math.atan2(fx, fz) + range(-0.12, 0.12);
        addFloor(side < 0 ? 'footL' : 'footR', x, z, size, { a, mode: BLOOD, alpha: fade ? Math.max(0.25, 0.95 - i * 0.09) : Math.max(0.3, 0.9 - i * 0.025) * range(0.8, 1) });
        put++;
      }
      return put;
    }
    /** 一段直线上每个点都踩得住、离墙够远、不进家具 */
    const lineOk = (pts, gap) => pts.every(([px, pz]) => { const st = landAt(nav, px, pz, y + 0.6); return st && st.floor === floorId && Math.abs(st.y - y) < 0.05 && !inObstacle(px, pz) && wallGap(px, pz) > gap; });
    /**
     * 拖痕：从 (x, z) 往 a 方向拖 len 米，一段 2.1 米、接着下一段。前面撞墙、进家具就拐个弯（左右各试两个角度）——
     * 拖着人绕过墙角、拐进门里本来就是这样；实在拐不过去就停
     */
    function drag(x, z, a, len = 2.2, { alpha = 0.9 } = {}) {
      const seg = 2.1;
      let put = 0, d = 0;
      while (d < len - 0.3) {
        let ok = null;
        for (const da of [0, 0.35, -0.35, 0.75, -0.75]) {
          const b = a + da, fx = Math.sin(b), fz = Math.cos(b), ex = x + fx * seg, ez = z + fz * seg, mx = x + fx * seg / 2, mz = z + fz * seg / 2;
          if (lineOk([[mx, mz], [ex, ez], [x + fx * seg * 0.25, z + fz * seg * 0.25], [x + fx * seg * 0.75, z + fz * seg * 0.75]], 0.22) && !blocked(x, z, ex, ez)) { ok = { b, mx, mz, ex, ez }; break; }
        }
        if (!ok) break;
        // 拖痕格子横着画（x 方向长）：图的「右」顺着拖的方向
        addFloor('drag', ok.mx, ok.mz, seg, { a: ok.b + Math.PI / 2, mode: BLOOD, alpha: alpha * (d ? 0.8 : 1), h: seg * cellAspect('drag') * 0.85 });
        put++; a = ok.b;
        // 下一段从这段的 92% 处接上（两头淡出的地方叠在一起）
        x += Math.sin(a) * seg * 0.92; z += Math.cos(a) * seg * 0.92; d += seg * 0.92;
      }
      return put;
    }
    /** 一串边走边滴的血：从 a 到 b 每隔一两米一小串（trail 格子，拉长的方向就是走的方向） */
    function trail(ax, az, bx, bz, { every = 1.6, size = [0.3, 0.4], alpha = [0.7, 0.95], skip = 0.25 } = {}) {
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.5) return 0;
      const a = Math.atan2(bx - ax, bz - az); let put = 0;
      for (let d = range(0.2, every); d < L; d += every * range(0.7, 1.3)) {
        if (rng() < skip) continue;
        const side = range(-0.18, 0.18), x = ax + (bx - ax) * d / L + Math.cos(a) * side, z = az + (bz - az) * d / L - Math.sin(a) * side;
        if (!lineOk([[x, z]], 0.18)) continue;
        addFloor('trail', x, z, range(size[0], size[1]), { a: a + Math.PI / 2 + range(-0.2, 0.2), mode: BLOOD, alpha: range(alpha[0], alpha[1]) });
        put++;
      }
      return put;
    }

    /**
     * 贴花整个宽度都露在外面：两头往墙外 0.12 米的点从中间看过去不隔着别的墙（T 字形接上来的隔墙会把字挡掉一半），
     * 两头前面也都是楼面（不伸到门洞、楼梯井上）
     */
    /** 人能到的地方：这层的楼板，或者从这层往上两米以内的楼面 / 梯段（梯段两边的墙也能贴） */
    // 公寓、北区塔楼的消防楼梯在导航里是「楼梯连接」（一按就上下楼），梯段那块地方不在导航里：落在楼梯间框里也算
    const reach = (sx, sz) => { if (supported(F, sx, sz) || inStair(sx, sz)) return true; const st = landAt(nav, sx, sz, y + 2.2); return !!st && st.y > y - 0.3 && st.y < y + 2.2; };
    function spanFree(q, width) {
      const cx0 = q.x + q.nx * 0.12, cz0 = q.z + q.nz * 0.12;
      for (const s of [-1, 1]) {
        const ex = cx0 + q.dx * s * width / 2, ez = cz0 + q.dz * s * width / 2;
        if (blocked(cx0, cz0, ex, ez, q.w) || !reach(ex + q.nx * 0.3, ez + q.nz * 0.3)) return false;
      }
      return true;
    }
    /** 墙上一处：返回 { x, z, nx, nz, w }（贴花中心在墙线上的位置和朝走道的法线），找不到返回 null */
    function wallPoint(width, { r1 = R, prefer = null, minLen = 0, inner = false, toward = null, spread = 0.6, behind = false } = {}) {
      // behind 的（贴在关卡大件背后的）不要求从热点直接看得见：火在梯段上，梯段和平台之间隔着栏杆那道线
      const list = usable.filter((q) => q.len >= Math.max(minLen, width + 2 * ROUTE_DRESS.margin) && segDist(cx, cz, q.w) < r1);
      // 挑中的墙这一处不行（离大件太近、前面有家具），换个位置再试几次再放弃这面墙——
      // 以前一次不行就把整面墙划掉，最该贴的那面墙常常第一下就被划掉了
      const fails = new Map(), miss = (w) => { if (!prefer) return; const f = (fails.get(w) || 0) + 1; fails.set(w, f); if (f >= 6) list.splice(list.findIndex((q) => q.w === w), 1); };
      for (let k = 0, tries = prefer ? 48 : 16; k < tries && list.length; k++) {
        const { w, len } = prefer ? list.reduce((a, b) => (prefer(a) > prefer(b) ? a : b)) : pick(list);
        const dx = (w.x1 - w.x0) / len, dz = (w.z1 - w.z0) / len;
        // 墙段上取一点：离两头至少 margin + 半宽（门洞、转角不贴）
        const m = ROUTE_DRESS.margin + width / 2;
        // toward：贴在墙上离这一点最近的地方附近（关卡的门框、火堆背后），不是整面墙上随便一处
        let t = m + (len - 2 * m) * rng();
        if (toward) t = Math.max(m, Math.min(len - m, (toward[0] - w.x0) * dx + (toward[1] - w.z0) * dz + range(-spread, spread)));
        const px = w.x0 + dx * t, pz = w.z0 + dz * t;
        // 法线朝热点那一边，而且那一侧 0.45 米处得是人能到的地方（楼板，或者楼梯的梯段——梯段两边的墙也算）。
        // 以前先看哪边有楼板：梯段边上的墙，楼板在墙的另一边（别的楼梯间、电梯井），手印就贴到墙背面去了
        let nx = -dz, nz = dx;
        if ((cx - px) * nx + (cz - pz) * nz < 0) { nx = -nx; nz = -nz; }
        // inner：只要两边都是楼面的隔墙（户内朝外的那面墙是落地窗、纱帘，不在导航里，贴上去就成了写在窗帘上）
        if (!reach(px + nx * 0.45, pz + nz * 0.45) || (inner && !supported(F, px - nx * 0.45, pz - nz * 0.45))) { miss(w); continue; }
        // 热点看得见这面墙（同一个房间 / 走廊里），墙前面没有家具、门扇挡着
        const fx = px + nx * 0.06, fz = pz + nz * 0.06;
        if (Math.hypot(fx - cx, fz - cz) > r1 || (!behind && blocked(cx, cz, fx, fz, w))) { miss(w); continue; }
        let free = !avoid.some((a) => a.wall && (!a.floor || a.floor === floorId) && Math.hypot(a.x - px, a.z - pz) < a.wall + width / 2);
        // behind：关卡大件背后那面墙（杂物堆后面的弹孔、火后面的烟）本来就有一半被挡着，不用让
        if (!behind) for (const s of [-0.5, 0, 0.5]) for (const d of [0.2, 0.42]) if (inObstacle(px + dx * s * width + nx * d, pz + dz * s * width + nz * d)) free = false;
        if (free && !spanFree({ x: px, z: pz, nx, nz, dx, dz, w }, width)) free = false;
        if (!free) { miss(w); continue; }
        return { x: px, z: pz, nx, nz, w, t, len, dx, dz, off: wallSkin(F, w, nx, nz) + 0.008 };
      }
      return null;
    }
    function addWall(cell, q, size, yc, { phi = 0, mode = MATTE, alpha = 1, h = null, off = q.off ?? ROUTE_DRESS.wallOff, pull = ROUTE_DRESS.wallPull, tone = toneFor(mode), until = -1 } = {}) {
      const ax = wallAxes(q.nx, q.nz, phi);
      items.push({ lv, cell, p: [q.x + q.nx * off, y + yc, q.z + q.nz * off], ...ax, w: size, h: h ?? size * cellAspect(cell), mode, alpha, pull, tone, until });
      return items[items.length - 1];
    }
    /** 墙上贴 n 个：高度 yc = [低, 高]（贴花中心离地） */
    /** 这一处和已经贴在墙上的东西压得太多（左右、上下都挨着一半以上） */
    const crowded = (q, w, h, c) => wallRects.some((r) => Math.abs(r.y - (y + c)) < (r.h + h) * 0.42 && Math.hypot(r.x - q.x, r.z - q.z) < (r.w + w) * 0.42);
    function wall(cells, n, { size = [0.25, 0.4], yc = [0.9, 1.5], mode = MATTE, alpha = [0.85, 1], tilt = 0.25, r1 = R, keep = false, prefer = null, inner = false, toward = null, spread = 0.6, until = -1, behind = false } = {}) {
      let put = 0;
      for (let i = 0, want = keep ? n : count(n); i < want; i++) {
        const cell = Array.isArray(cells) ? pick(cells) : cells, s = range(size[0], size[1]) * (SIZE_K[cell] || 1), hgt = s * cellAspect(cell);
        // 墙上的东西不叠成一坨：和已经贴了的离得太近就换个地方（试几次；一定要放的最后一次不管）
        let q = null, k = 1, c = 0;
        for (let t = 0; t < 5; t++) {
          k = 1; q = wallPoint(s, { r1, prefer, inner, toward, spread: spread + t * 0.25, behind });
          // 一定要放的（关卡的招牌痕迹、留言）：整面墙放不下就缩小一点再找
          if (!q && keep) { k = 0.72; q = wallPoint(s * k, { r1: r1 + 1.5, prefer, inner, toward, spread: spread + t * 0.25, behind }); }
          if (!q) break;
          // 贴花上沿不过 2.3 米（天花板 2.6~2.9），下沿不进踢脚线
          c = Math.min(2.3 - hgt * k / 2, Math.max(0.14 + hgt * k / 2, range(yc[0], yc[1])));
          if (!crowded(q, s * k, hgt * k, c) || (keep && t === 4)) break;
          q = null;
        }
        if (!q) continue;
        wallRects.push({ x: q.x, z: q.z, y: y + c, w: s * k, h: hgt * k });
        // 往下滑的手印不歪（是顺着重力滑下去的）
        addWall(cell, q, s * k, c, { phi: cell === 'handDrag' ? range(-0.1, 0.1) : range(-tilt, tilt), mode, alpha: range(alpha[0], alpha[1]), until }); put++;
      }
      return put;
    }
    return { F, lv, y, walls: usable, floor, footsteps, drag, trail, wall, wallPoint, addWall, addFloor, floorPoint, wallGap, inObstacle, spanFree, lineOk, blocked, range, pick, count };
  }
  return { spot, items, rng, range, pick, count };
}

/**
 * 这一局要等寻路的几段走廊：[{ key, floor, from, to }]。
 * 每道关那层：电梯厅 → 放工具那户的门口、门口 → 关卡（楼梯口）。纯函数。
 */
export function routeLegs(plan, nav, layout) {
  const legs = [];
  if (!plan?.stages) return legs;
  const tower = plan.tower, lift = tower ? nav.links.find((l) => l.id === tower.lift) : null;
  for (const st of plan.stages) {
    if (st.kind !== 'tool') continue;
    const gate = plan.stages.find((s) => s.kind === 'gate' && s.gate === st.gate);
    const door = st.site?.unit ? doorOutside(layout, st.site, nav) : null;
    if (!door) continue;
    const lob = lift ? lobbySpot(nav, lift, st.floor) : null;
    if (lob) legs.push({ key: `lobby${st.gate}`, floor: st.floor, from: { ...lob, slope: null }, to: door });
    if (gate) legs.push({ key: `gate${st.gate}`, floor: st.floor, from: door, to: { floor: gate.floor, x: gate.site.x, y: gate.site.y, z: gate.site.z, slope: null } });
  }
  return legs;
}

/** 路线点按 spacing 米重新取样（只要 x, z） */
export function resampleLine(points, spacing = 0.8) {
  const out = [];
  if (!points || points.length < 2) return out;
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], L = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = carry; d < L; d += spacing) out.push({ x: a.x + (b.x - a.x) * d / L, z: a.z + (b.z - a.z) * d / L, a: Math.atan2(b.x - a.x, b.z - a.z) });
    carry = Math.max(0, ((carry - L) % spacing + spacing) % spacing);
  }
  return out;
}

/** 楼梯间（核心筒）的名字：梯段 id「T1-ST-B-11F-12F-flight-1」去掉后四节 →「T1-ST-B」 */
export const coreOf = (id) => String(id).split('-').slice(0, -4).join('-');
/**
 * 要滴血的梯段：[{ ...梯段, lv, heavy }]。
 * heavy：关卡那层往上那一段、和从下面上到关卡那层的那一段（人在这儿打过、逃过）；
 * 其余是关卡之间（和最后一道关到屋顶）一路爬上去的梯段：只零星几滴，告诉玩家「有人受着伤从这儿上去了」。
 */
export function routeFlights(plan, layout, nav, runs) {
  const out = [], seen = new Set();
  const byId = new Map();
  for (const b of layout.buildings) for (const f of b.access?.flights || []) byId.set(f.id, f);
  const add = (r, heavy) => { for (const id of r?.slopes || []) { const f = byId.get(id); if (!f?.steps || seen.has(id)) continue; seen.add(id); out.push({ ...f, lv: levelOf(nav, f.from), heavy }); } };
  const gates = plan.gates || [], yOf = (f) => nav.floors.get(f)?.y ?? 0, roof = plan.tower?.roof;
  for (const g of gates) {
    const core = coreOf(g.core);
    add(runs.find((r) => r.id === g.core), true);
    add(runs.find((r) => r.to === g.floor && coreOf(r.id) === core), true);
  }
  gates.forEach((g, i) => {
    const core = coreOf(g.core), y0 = yOf(g.floor), next = gates[i + 1], y1 = next ? yOf(next.floor) : (roof ? yOf(roof) : y0);
    for (const r of runs) if (coreOf(r.id) === core && yOf(r.from) >= y0 - 0.1 && yOf(r.from) < y1 - 0.1) add(r, false);
  });
  return out;
}

/**
 * 摆这一局的痕迹（生成器：每摆完一处 yield 一次，调用方按时间切片）。
 * ctx = { plan, nav, layout, runs, rng, legs: { key → 路线点 [{x, z}] }, density }。返回 items。
 * 每个 item：{ lv（属于哪一层，按层显示）, cell, p, r, u, n, w, h, mode, alpha, pull }。
 */
export function* planDressing({ plan, nav, layout, runs = [], rng = Math.random, legs = {}, density = 1, start = null }) {
  const items = [];
  if (!plan?.stages?.length) return items;
  const avoid = [];
  // 关卡的大件（杂物堆、火、配电箱、防火门）占的地方：地面贴花不压进去
  // 着火那道关例外：墙上的烟熏就该紧挨着火（熏黑的墙在火后面，挡不住也不会穿帮）
  // 墙上只让开大件本身一点点（以前让开 0.9 米，关卡那几面墙上反倒什么都没有——玩家在关卡前面站得最久）
  for (const g of plan.gates || []) if (g.model) avoid.push({ floor: g.floor, x: g.model.x, z: g.model.z, r: 1.02, wall: g.type === 'fire' ? 0.05 : 0.3 });
  // 电梯门口：门是会动的，墙上、地上都不贴（候梯厅里的血留到离门一米多的地方）
  const tower = plan.tower, lift = tower ? nav.links.find((l) => l.id === tower.lift) : null;
  // 这一层所有电梯（不只这栋楼那部：商场的电梯厅里并排好几部），门扇会开，贴在门上的血会悬在半空
  const routeFloors = new Set(plan.stages.map((s) => s.floor));
  for (const k of nav.links) if (k.kind === 'lift') for (const s of k.stops || []) if (k === lift || routeFloors.has(s.floor)) avoid.push({ floor: s.floor, x: s.x, z: s.z, r: 0.9, wall: 1.3 });
  // 每一步的目标物件（武器柜、配电柜、工具、信号弹）站的地方：地上不压、背后的墙也不贴（深度前移会盖到物件上）。
  // 关卡的「目标点」只是玩家站着操作的地方（东西是上面那个大件），不用让
  for (const st of plan.stages) if (st.site && st.kind !== 'gate') avoid.push({ floor: st.floor, x: st.site.x, z: st.site.z, r: 0.7, wall: st.kind === 'flare' ? 0.6 : 1.1 });
  const P = createPlacer({ nav, rng, items, avoid, density, layout });
  const { range, pick } = P;
  const stage = (id) => plan.stages.find((s) => s.id === id);

  // ---- 1. 商场保安室：守在这儿的保安打过一仗——墙上成片弹孔，地上弹壳、一大滩血拖进角落，「B1 有电」 ----
  const arms = stage('arms');
  if (arms) {
    const S = P.spot(arms.floor, arms.site.x, arms.site.z, 8);
    if (S) {
      S.wall('holes', 6, { size: [0.6, 0.85], yc: [0.9, 1.6], tilt: 0.6 });
      yield;
      S.wall(['splat0', 'splat1'], 2, { size: [0.75, 1.05], yc: [0.8, 1.3], mode: BLOOD });
      S.wall(HANDS, 3, { size: [0.2, 0.24], yc: [0.9, 1.4], mode: BLOOD, r1: 5 });
      S.wall('gPower', 1, { size: [2.0, 2.3], yc: [1.45, 1.6], tilt: 0.05, keep: true, prefer: (q) => q.len });
      yield;
      S.floor('casings', 16, { r1: 3.2, size: [0.16, 0.2], mode: GLOSS, gap: 0.2 });
      const pool = S.floorPoint(1.2, 4, 0.6);
      if (pool) { S.addFloor(pick(['pool0', 'pool1']), pool[0], pool[1], range(1.2, 1.6), { mode: BLOOD }); S.drag(pool[0], pool[1], Math.atan2(pool[0] - arms.site.x, pool[1] - arms.site.z), 4); }
      S.floor(['pool0', 'pool1'], 1, { r1: 6, size: [0.6, 0.8], mode: BLOOD, spaced: 2.5, keep: true });
      yield;
      S.floor(['paper0', 'paper1'], 10, { r1: 5.5, size: [0.32, 0.4] });
      S.floor('glass', 2, { r1: 4.5, size: [0.9, 1.1], mode: GLOSS, alpha: [0.8, 1] });
      S.floor('drops', 7, { r1: 5.5, size: [0.22, 0.32], mode: BLOOD });
      S.floor('phone', 1, { r1: 4, size: [0.16, 0.17], mode: GLOSS, keep: true });
      S.floor(['shoe', 'bag'], 2, { r1: 6, size: [0.32, 0.4], mode: BLOOD, gap: 0.35 });
      const a = S.floorPoint(1, 3, 0.4), b = S.floorPoint(5, 7.5, 0.4);
      if (a && b) S.footsteps(a[0], a[1], b[0], b[1], { n: 10 });
    }
    yield;
  }

  // ---- 2. 地下一层电梯厅：人往电梯跑——拖痕、墙上手印抹痕、「往楼顶走」 ----
  const power = stage('power');
  if (power) {
    const S = P.spot(power.floor, power.site.x, power.site.z, 7);
    if (S) {
      S.wall(HANDS, 6, { size: [0.2, 0.25], yc: [0.8, 1.5], mode: BLOOD, r1: 5, tilt: 0.4 });
      S.wall('smear', 2, { size: [0.8, 1.0], yc: [1.0, 1.25], mode: BLOOD, tilt: 0.15 });
      yield;
      S.wall(['splat0', 'splat1'], 2, { size: [0.75, 1.05], yc: [0.7, 1.3], mode: BLOOD });
      S.wall('gRoof', 1, { size: [1.9, 2.2], yc: [1.45, 1.6], tilt: 0.05, keep: true, prefer: (q) => q.len });
      S.wall('holes', 2, { size: [0.55, 0.75], yc: [1.0, 1.6], tilt: 0.6 });
      yield;
      // 一大滩血拖向电梯：在配电柜前 1.5~3 米、看得见的地方（窄的电梯厅里离墙 0.5 米就行，血泊边上压到墙根也自然）
      const pool = S.floorPoint(1.4, 3.2, 0.5) || S.floorPoint(1, 4.5, 0.4);
      if (pool) { S.addFloor(pick(['pool0', 'pool1']), pool[0], pool[1], range(1.2, 1.5), { mode: BLOOD }); S.drag(pool[0], pool[1], Math.atan2(pool[0] - power.site.x, pool[1] - power.site.z) + range(-0.6, 0.6), 4); }
      S.floor(['pool0', 'pool1'], 1, { r1: 6, size: [0.6, 0.85], mode: BLOOD, spaced: 2.5, keep: true });
      S.floor('drops', 5, { r1: 6, size: [0.22, 0.3], mode: BLOOD });
      if (pool) { const b = S.floorPoint(4, 6.5, 0.3); if (b) S.trail(pool[0], pool[1], b[0], b[1]); }
      S.floor(['paper0', 'paper1'], 6, { r1: 6, size: [0.32, 0.4] });
      S.floor('glass', 1, { r1: 5, size: [0.8, 1.0], mode: GLOSS });
      S.floor(['shoe', 'bag'], 2, { r1: 6, size: [0.32, 0.4], mode: BLOOD, gap: 0.35 });
      yield;
      for (let k = 0; k < 2; k++) { const a = S.floorPoint(0.5, 2.5, 0.4), b = S.floorPoint(4, 6.5, 0.4); if (a && b) S.footsteps(a[0], a[1], b[0], b[1], { n: 8 }); }
    }
    yield;
  }

  // ---- 3. 每道关那一层 ----
  const words = ['gStairs', 'gTally', 'gRoof']; // 第几道关：「别上楼！」「正正正丅」（数日子）「往楼顶走」
  for (const g of plan.gates || []) {
    const i = (plan.gates || []).indexOf(g), gate = plan.stages[g.stage], tool = plan.stages[g.stage - 1];
    // 3a. 楼梯口（关卡）：类型不同，痕迹不同。招牌痕迹都挂在关卡的大件上（门框两边、杂物堆背后、火堆背后的墙），
    //     玩家拿着工具回来、站在关卡前面操作的那几秒正对着它们
    const S = P.spot(gate.floor, gate.site.x, gate.site.z, 5);
    if (S) {
      const M = g.model, until = g.stage, toM = [M.x, M.z];
      // 大件的横向（门框宽度方向）和往楼上的方向（模型的 +z）
      const ax = [Math.cos(M.yaw), -Math.sin(M.yaw)], az = [Math.sin(M.yaw), Math.cos(M.yaw)];
      const nearM = (q) => -segDist(M.x, M.z, q.w);
      if (g.type === 'lock') { // 防火门反锁：有人拼命拍门——门扇上、门框两边一片血手印，往下滑的手指印
        leafPrints(S, M, ax, az, until, rng);
        S.wall(HANDS, 3, { size: [0.2, 0.24], yc: [0.9, 1.6], mode: BLOOD, r1: 3, tilt: 0.4, keep: true, prefer: nearM, toward: toM, spread: 0.7 });
        S.wall('smear', 1, { size: [0.7, 0.9], yc: [0.95, 1.35], mode: BLOOD, tilt: 1.2, r1: 3, keep: true, prefer: nearM, toward: toM, spread: 1 });
      } else if (g.type === 'debris') { // 杂物堵楼梯：有人在这儿守过——杂物堆背后、两边的墙上成片弹孔，地上弹壳、碎石灰
        S.wall('holes', 3, { size: [0.6, 0.85], yc: [0.9, 1.7], tilt: 0.6, r1: 3.5, keep: true, prefer: nearM, toward: toM, spread: 1.2, behind: true });
        S.wall('holes', 1, { size: [0.55, 0.75], yc: [1.0, 1.7], tilt: 0.6, r1: 4.5 });
        S.wall(HANDS, 1, { size: [0.2, 0.24], yc: [0.9, 1.4], mode: BLOOD, r1: 3, keep: true, prefer: nearM, toward: toM, spread: 1.4 });
        S.floor('debris', 3, { r1: 3, size: [0.9, 1.3], alpha: [0.8, 1] });
        S.floor('casings', 12, { r1: 3.2, size: [0.16, 0.2], mode: GLOSS, gap: 0.2 });
      } else if (g.type === 'fire') { // 楼梯间着火：火背后那面墙从墙根熏黑到天花板，地上烧焦一块
        fireSoot(S, M, until, rng);
        S.wall('scorch', 1, { size: [0.9, 1.1], yc: [1.15, 1.2], tilt: 0.03, r1: 3.5, alpha: [0.55, 0.7] });
        const b = S.floorPoint(0, 0.5, 0.45, { from: [M.x - az[0] * 1.25, M.z - az[1] * 1.25] });
        if (b) S.addFloor('burn', b[0], b[1], range(1.4, 1.7), { alpha: 0.92 });
        S.floor('debris', 1, { r1: 3, size: [0.8, 1.0], alpha: [0.6, 0.8] });
      } else { // 配电箱跳闸：楼梯口的卷帘栅门落下来了，人想从底下掀起来——栅门两边墙上的手印、抹痕（配电箱在电梯厅，栅门在楼梯口，各算各的）
        const SM = Math.hypot(M.x - gate.site.x, M.z - gate.site.z) > 2.5 ? P.spot(gate.floor, M.x - az[0] * 0.8, M.z - az[1] * 0.8, 3.5) || S : S;
        SM.wall(HANDS, 4, { size: [0.2, 0.24], yc: [0.7, 1.5], mode: BLOOD, r1: 3, tilt: 0.4, keep: true, prefer: nearM, toward: toM, spread: 0.9 });
        SM.wall('smear', 1, { size: [0.7, 0.9], yc: [1.0, 1.3], mode: BLOOD, r1: 3.5, keep: true, prefer: nearM, toward: toM, spread: 1 });
        if (SM !== S) { SM.floor('drops', 3, { r1: 2.5, size: [0.22, 0.28], mode: BLOOD }); S.wall(HANDS, 2, { size: [0.2, 0.24], yc: [0.9, 1.5], mode: BLOOD, r1: 4, keep: true }); }
        S.floor('glass', 1, { r1: 3, size: [0.8, 1.0], mode: GLOSS });
      }
      yield;
      // 这一层的留言：从楼梯口看得见的最长那面墙上，眼睛高度
      const word = words[i % words.length];
      S.wall(word, 1, { size: word === 'gTally' ? [0.9, 1.0] : [1.6, 1.9], yc: [1.5, 1.6], tilt: 0.05, keep: true, prefer: (q) => q.len - segDist(gate.site.x, gate.site.z, q.w) * 0.4 });
      S.wall(['splat0', 'splat1'], 1, { size: [0.65, 0.95], yc: [0.8, 1.3], mode: BLOOD, r1: 3.5, keep: true, prefer: nearM, toward: toM, spread: 1.5 });
      S.wall(HANDS, 1, { size: [0.19, 0.24], yc: [0.9, 1.5], mode: BLOOD, r1: 4, tilt: 0.4 });
      // 关卡前面一大滩血（有人在这儿倒下），拖痕往走廊里去、一串血脚印从血泊里走出来
      // 大件就在目标点跟前的（楼梯口）：放在门前 2 米左右；配电箱那种目标点离大件远的：放在目标点旁边
      const close = Math.hypot(M.x - gate.site.x, M.z - gate.site.z) < 2.5;
      const front = close ? [M.x - az[0] * range(1.9, 2.6), M.z - az[1] * range(1.9, 2.6)] : [gate.site.x + range(-1.2, 1.2), gate.site.z + range(-1.2, 1.2)];
      let size = range(1.2, 1.5), pool = null;
      // 窄的电梯厅、门口平台：离墙的要求一档一档放宽（血泊边缘压到墙根本来也自然），还放不下就小一点
      for (const k of [0.36, 0.3, 0.24]) { pool = S.floorPoint(0, 0.9, size * k, { from: front }) || S.floorPoint(0.6, 3, size * k); if (pool) break; }
      if (!pool) { size = 1.12; pool = S.floorPoint(0.3, 3, 0.22); }
      if (pool) {
        S.addFloor(pick(['pool0', 'pool1']), pool[0], pool[1], size, { mode: BLOOD, alpha: 0.95 });
        const away = close ? Math.atan2(pool[0] - M.x, pool[1] - M.z) : rng() * Math.PI * 2;
        if (g.type !== 'fire') S.drag(pool[0], pool[1], away + range(-0.5, 0.5), range(3, 4), { alpha: 0.85 });
        const fa = away + (rng() < 0.5 ? 0.9 : -0.9), fx = pool[0] + Math.sin(fa) * size * 0.4, fz = pool[1] + Math.cos(fa) * size * 0.4;
        S.footsteps(fx, fz, fx + Math.sin(fa) * 5, fz + Math.cos(fa) * 5, { n: 8 });
      }
      S.floor('drops', 4, { r1: 4.5, size: [0.2, 0.28], mode: BLOOD });
      S.floor(['paper0', 'paper1'], 4, { r1: 4.5, size: [0.32, 0.4] });
      if (rng() < 0.7) S.floor(['shoe', 'bag'], 1, { r1: 4, size: [0.32, 0.4], mode: BLOOD, gap: 0.35, keep: true });
    }
    yield;
    // 3b. 走廊：电梯厅 → 那户门口 → 楼梯口。一路零星的血滴、门口一串血脚印走进去、一段拖痕从门里拖出来
    for (const key of [`lobby${i}`, `gate${i}`]) {
      const line = resampleLine(legs[key] || [], 0.8);
      if (line.length < 2) {
        // 没有走廊路线（寻路没算出来）：至少在那户门口留一段拖痕和几只脚印
        const leg = key.startsWith('gate') && tool?.site ? doorOutside(layout, tool.site, nav) : null;
        if (leg) { const D = P.spot(gate.floor, leg.x, leg.z, 3); if (D) { D.drag(leg.x, leg.z, Math.atan2(gate.site.x - leg.x, gate.site.z - leg.z), 2.2); } }
        continue;
      }
      const C = P.spot(gate.floor, (line[0].x + line[line.length - 1].x) / 2, (line[0].z + line[line.length - 1].z) / 2, Math.hypot(line[0].x - line[line.length - 1].x, line[0].z - line[line.length - 1].z) / 2 + 4);
      if (!C) continue;
      // 一路滴过去的血：一小串一小串、顺着走的方向拉长（不再是满地乱撒的小点）
      for (let k = 1; k < line.length; k++) {
        if (rng() > 0.3 * density) continue;
        const q = line[k], side = range(-0.25, 0.25), x = q.x + Math.cos(q.a) * side, z = q.z - Math.sin(q.a) * side;
        if (C.lineOk([[x, z]], 0.2)) C.addFloor('trail', x, z, range(0.3, 0.42), { a: q.a + Math.PI / 2 + range(-0.15, 0.15), mode: BLOOD, alpha: range(0.65, 0.95) });
      }
      if (key.startsWith('gate')) {
        // 门口（路线起点）往楼梯口拖：拖痕顺着路线方向
        const s = line[Math.min(1, line.length - 1)];
        C.drag(line[0].x, line[0].z, s.a, Math.min(4.2, line.length * 0.8));
        const e = line[Math.min(line.length - 1, 6)];
        C.footsteps(e.x, e.z, line[0].x, line[0].z, { n: 7 });
      }
      yield;
    }
    // 3c. 那户里面：一摊血、翻乱的纸、掉在地上的手机、碎玻璃，墙上蘸血写的「救命」
    if (tool?.site) {
      const T = P.spot(tool.floor, tool.site.x, tool.site.z, 4);
      if (T) {
        // 有人躲在这儿、死在这儿：一大滩血（户里家具多、地方窄，离墙的要求放宽一点），血从这儿拖向门口
        const pool = T.floorPoint(0.9, 2.2, 0.5) || T.floorPoint(0.6, 3, 0.4) || T.floorPoint(0.4, 3.5, 0.3) || T.floorPoint(0.2, 3.5, 0.24) || T.floorPoint(0.2, 3.8, 0.2);
        if (pool) {
          T.addFloor(pick(['pool0', 'pool1']), pool[0], pool[1], range(1.15, 1.4), { mode: BLOOD, alpha: 0.92 });
          const door = doorOutside(layout, tool.site, nav);
          if (door) { T.drag(pool[0], pool[1], Math.atan2(door.x - pool[0], door.z - pool[1]), 3); T.footsteps(pool[0], pool[1], door.x, door.z, { n: 7 }); }
        }
        T.floor(['paper0', 'paper1'], 6, { r1: 2.8, size: [0.32, 0.4] });
        T.floor('phone', 1, { r1: 3, size: [0.16, 0.17], mode: GLOSS, keep: true });
        T.floor('glass', 1, { r1: 3.5, size: [0.8, 1.0], mode: GLOSS });
        T.floor('drops', 5, { r1: 3.5, size: [0.2, 0.3], mode: BLOOD });
        if (rng() < 0.6) T.floor(['shoe', 'bag'], 1, { r1: 3.5, size: [0.32, 0.4], mode: BLOOD, gap: 0.35, keep: true });
        // 户内的墙上挂着画、电视，窗台以上是玻璃和窗帘（这些都不在导航里）：墙上的东西压低，放在窗台、画框以下——
        // 「救命」是靠着墙坐在地上的人蘸血写的，本来也就这么高
        if (i === 1) T.wall('gHelp', 1, { size: [0.85, 0.95], yc: [0.55, 0.7], mode: BLOOD, tilt: 0.1, keep: true, inner: true });
        T.wall(['splat0', 'splat1'], 1, { size: [0.55, 0.75], yc: [0.45, 0.7], mode: BLOOD, inner: true });
        T.wall(HANDS, 2, { size: [0.19, 0.24], yc: [0.35, 0.85], mode: BLOOD, tilt: 0.5, inner: true });
      }
      yield;
    }
    // 3d. 别的住户门口：门上打着 X 形警戒线，旁边喷着「里面有感染者」（每局挑一户，离路线不太远）
    if (i === 0 || rng() < 0.7) {
      const lv = layout.levels.find((l) => l.id === gate.floor);
      const units = (lv?.units || []).filter((u) => u.id !== tool?.site?.unit && u.wfronts?.length && u.residence?.entryDoor && u.residence?.level !== 'upper');
      const ref = tool?.site || gate.site, sorted = units.map((u) => ({ u, d: doorOf(u) })).filter((q) => q.d).sort((a, b) => Math.hypot(a.d.x - ref.x, a.d.z - ref.z) - Math.hypot(b.d.x - ref.x, b.d.z - ref.z));
      // 离路线近的几户里挑：先随机从最近两户之一开始，门边那面墙写不下整句的就换下一户；都不行就只拉警戒线
      const start = Math.floor(rng() * Math.min(2, sorted.length)), order = [...sorted.slice(start, 5), ...sorted.slice(0, start)];
      let done = false;
      for (const hit of order) if ((done = tapeDoor(P, nav, gate.floor, hit.d, rng, false))) break;
      if (!done && order[0]) tapeDoor(P, nav, gate.floor, order[0].d, rng, true);
      // 那户门口附近哪儿都写不下：写到这一层电梯厅 / 楼梯口一带随便一面够长的墙上
      const has = () => items.some((it) => it.cell === 'gInfected' && it.lv === levelOf(nav, gate.floor));
      for (const [R, size] of [[7, [1.8, 2.1]], [10, [1.3, 1.5]]]) if (!has()) P.spot(gate.floor, gate.site.x, gate.site.z, R)?.wall('gInfected', 1, { size, yc: [1.45, 1.55], tilt: 0.05, keep: true, alpha: [0.9, 0.95], prefer: (q) => q.len });
      yield;
    }
  }

  // ---- 4. 关卡往上那段楼梯（和下面上来那段）：踏步上滴着血，休息平台上一摊、墙上一只手印 ----
  let light = 0;
  const flights = routeFlights(plan, layout, nav, runs);
  yield;
  for (const f of flights) {
    const dx = f.top.x - f.bottom.x, dz = f.top.z - f.bottom.z, dy = f.top.y - f.bottom.y, L = Math.hypot(dx, dz) || 1, a = Math.atan2(dx, dz);
    if (!f.heavy) light++;
    for (let s = 0; s < f.steps; s++) {
      if (rng() > (f.heavy ? 0.32 : 0.09) * density) continue;
      const t = (s + 0.5) / f.steps, side = range(-1, 1) * Math.max(0, f.width / 2 - 0.2);
      const x = f.bottom.x + dx * t - (dz / L) * side, z = f.bottom.z + dz * t + (dx / L) * side, y = f.bottom.y + dy * (s + 1) / f.steps;
      // 踏步只有二十几厘米深：只放小的血滴
      items.push({ lv: f.lv, cell: 'drops', p: [x, y + ROUTE_DRESS.treadLift, z], ...floorAxes(a + range(-0.6, 0.6)), w: range(0.15, 0.2), h: 0, mode: BLOOD, alpha: range(0.6, 0.95), pull: 0.02, tone: 0.75 + rng() * 0.3 });
      items[items.length - 1].h = items[items.length - 1].w;
    }
    // 休息平台
    if (/-landing$/.test(f.to) && (f.heavy || light % 3 === 1)) {
      const F = nav.floors.get(f.to);
      if (F) {
        const S = P.spot(f.to, f.top.x + (dx / L) * 0.9, f.top.z + (dz / L) * 0.9, 2.2, { level: f.lv });
        if (S && f.heavy) { S.floor('drops', 2, { r1: 1.6, size: [0.2, 0.28], mode: BLOOD }); if (rng() < 0.5) S.floor(['pool0', 'pool1'], 1, { r1: 1.2, size: [0.55, 0.75], mode: BLOOD, keep: true }); }
        // 一路往上的休息平台：隔两三层一只扶着墙歇脚留下的手印，或者几滴血
        else if (S) { if (rng() < 0.55) S.wall(HANDS, 1, { size: [0.19, 0.23], yc: [0.95, 1.3], mode: BLOOD, r1: 2, keep: true }); else S.floor('drops', 1, { r1: 1.4, size: [0.2, 0.26], mode: BLOOD, keep: true }); }
      }
    }
    yield;
  }

  // ---- 5. 屋顶：楼梯间出来一串血脚印往停机位走，门口一摊；离停机位一段地方用白漆刷着大大的 SOS ----
  const flare = stage('flare');
  if (flare && tower) {
    const exits = nav.links.filter((k) => k.kind === 'stair' && String(k.id).startsWith(tower.stair)).map((k) => k.stops.find((s) => s.floor === flare.floor)).filter(Boolean);
    for (const e of exits) {
      const S = P.spot(flare.floor, e.x, e.z, 4);
      if (!S) continue;
      S.floor('drops', 3, { r1: 2.5, size: [0.22, 0.3], mode: BLOOD });
      if (e === exits[0]) {
        const pool = S.floorPoint(0.8, 2.4, 0.6);
        if (pool) S.addFloor(pick(['pool0', 'pool1']), pool[0], pool[1], range(0.8, 1.1), { mode: BLOOD });
        S.wall(['handL', 'handR', 'splat0'], 2, { size: [0.22, 0.6], yc: [0.9, 1.4], mode: BLOOD, r1: 3 });
      }
      // 从楼梯间出来一路走到放信号弹的地方：脚印越走越淡、断断续续，旁边滴着血；走到信号弹跟前才停（拍信号弹那一下看得见）
      const ex = e.x + e.face[0] * 0.9, ez = e.z + e.face[1] * 0.9, L = Math.hypot(flare.site.x - ex, flare.site.z - ez), k = Math.max(0, (L - 0.9) / (L || 1));
      const tx = ex + (flare.site.x - ex) * k, tz = ez + (flare.site.z - ez) * k;
      if (e === exits[0]) {
        S.footsteps(ex, ez, tx, tz, { n: Math.min(28, Math.ceil(L / 0.62)), fade: false });
        S.trail(ex, ez, tx, tz, { every: 1.4, skip: 0.15 });
        const F2 = P.spot(flare.floor, flare.site.x, flare.site.z, 3);
        if (F2) { F2.floor('drops', 3, { r0: 0.8, r1: 2.2, size: [0.24, 0.3], mode: BLOOD, keep: true }); F2.floor(['paper0', 'shoe'], 1, { r0: 1, r1: 2.5, size: [0.3, 0.36], keep: true }); }
      } else S.footsteps(ex, ez, tx, tz, { n: 6 });
      yield;
    }
    const pad = plan.pad, R = P.spot(flare.floor, pad.x, pad.z, 14);
    if (R) {
      // 找一块 5 × 2.5 米的空地（四角、中心都站得住），离停机位 7~12 米
      for (let k = 0; k < 60; k++) {
        const a = rng() * Math.PI * 2, d = range(5, 13), x = pad.x + Math.cos(a) * d, z = pad.z + Math.sin(a) * d, yaw = Math.atan2(pad.x - x, pad.z - z);
        const ax = floorAxes(yaw), W = k < 20 ? 5 : 3.6, H = W / 2, pts = [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([s, t]) => [x + ax.r[0] * s * W + ax.u[0] * t * H, z + ax.r[2] * s * W + ax.u[2] * t * H]);
        if (pts.every(([px, pz]) => { const st = landAt(nav, px, pz, R.y + 0.6); return st && st.floor === flare.floor && Math.abs(st.y - R.y) < 0.05 && clear(nav, st); })) {
          // 字朝着停机位（从直升机上看是正的）
          R.addFloor('gSos', x, z, W, { a: yaw + Math.PI, alpha: 0.9, h: H });
          break;
        }
      }
    }
    yield;
  }
  // ---- 6. 开局那一点（商场大厅）到保安室：几滴血、几张纸、一只扔下的包——一开场就看得出这里出过事。
  //         放在最后算：开局点会变（存档点），不影响前面那些的随机数 ----
  if (arms && start && Number.isFinite(start.x)) {
    const S0 = P.spot(arms.floor, start.x, start.z, 9);
    if (S0) {
      const L = Math.hypot(arms.site.x - start.x, arms.site.z - start.z), dx = (arms.site.x - start.x) / (L || 1), dz = (arms.site.z - start.z) / (L || 1);
      // 沿着往保安室的方向（直线穿墙的那段不画：trail 每一处都要站得住、离墙够远）
      S0.trail(start.x + dx * 1.5, start.z + dz * 1.5, start.x + dx * Math.min(L, 12), start.z + dz * Math.min(L, 12), { every: 1.8, skip: 0.2 });
      S0.floor(['paper0', 'paper1'], 4, { r0: 1.5, r1: 7, size: [0.32, 0.4] });
      S0.floor('bag', 1, { r0: 2, r1: 5, size: [0.36, 0.42], gap: 0.4, keep: true });
      S0.floor('drops', 2, { r0: 1.5, r1: 6, size: [0.22, 0.28], mode: BLOOD });
    }
    yield;
  }

  if (items.length > ROUTE_DRESS.maxItems) items.length = ROUTE_DRESS.maxItems;
  return items;
}

/**
 * 反锁的防火门门扇上的血手印（朝人这一面，门扇左边是合页）：上面两只按着拍门的、一只按着往下滑的、门脚一只（人瘫坐在门前）。
 * 门开了以后门扇转开，这些就不画了（until = 这道关的步数）
 */
function leafPrints(S, M, ax, az, until, rng) {
  const D = { half: 0.64, bottom: 0.17, leaf: 0.86, ...DOOR }, f = -0.04, x0 = -D.half;
  const at = (lx) => ({ x: M.x + ax[0] * lx + az[0] * f, z: M.z + ax[1] * lx + az[1] * f, nx: -az[0], nz: -az[1] });
  const r = (a, b) => a + (b - a) * rng();
  // 门扇是深红褐色的漆：血印照常的颜色贴上去几乎看不出来，这里提亮（更红、更湿），手电一照还有反光
  const put = (cell, lx, ly, size, phi = 0) => S.addWall(cell, at(lx + r(-0.03, 0.03)), size * (SIZE_K[cell] || 1), D.bottom + ly + r(-0.04, 0.04), { phi, mode: BLOOD, alpha: r(0.85, 0.98), off: 0, pull: 0.008, until, tone: r(1.45, 1.75) });
  // 观察窗在门扇正中 1.27~1.83 米高、推杠在 1 米高：手印让开它们
  put(rng() < 0.5 ? 'handL' : 'handR', x0 + 0.17, 1.62, r(0.2, 0.23), r(-0.4, 0.2));
  put('handDrag', x0 + 0.17, 1.22, r(0.21, 0.24));
  put(rng() < 0.5 ? 'handR' : 'handL', x0 + D.leaf - 0.15, 1.48, r(0.2, 0.23), r(-0.2, 0.4));
  put(rng() < 0.5 ? 'handDrag' : 'handR', x0 + D.leaf - 0.2, 0.62, r(0.2, 0.23), 0);
}
/** 着火的那道关：火背后（离火堆最近的那面墙）一道从墙根熏到天花板的烟，底下窄、往上张开 */
function fireSoot(S, M, until, rng) {
  const w = 1.25 + rng() * 0.3, h = 2.3;
  const q = S.wallPoint(w, { r1: 3, prefer: (c) => -segDist(M.x, M.z, c.w), toward: [M.x, M.z], spread: 0.1, behind: true });
  if (q) S.addWall('scorch', q, w, 0.04 + h / 2, { h, alpha: 0.92, phi: (rng() - 0.5) * 0.03 });
  void until;
}
/** 一户的入户门：门洞中心（墙线上）、朝走廊的法线、门宽 */
function doorOf(u) {
  const f = u.wfronts?.[0], lf = u.fronts?.[0], e = u.residence?.entryDoor;
  if (!f || !lf || typeof e?.at !== 'number') return null;
  const k = (e.at - lf.x0) / ((lf.x1 - lf.x0) || 1), x = f.x0 + (f.x1 - f.x0) * k, z = f.z0 + (f.z1 - f.z0) * k;
  return { x, z, nx: f.nx, nz: f.nz, w: e.width || 0.9, dx: (f.x1 - f.x0) / (Math.hypot(f.x1 - f.x0, f.z1 - f.z0) || 1), dz: (f.z1 - f.z0) / (Math.hypot(f.x1 - f.x0, f.z1 - f.z0) || 1) };
}
/** 门洞上贴两条交叉的警戒线、门边墙上喷「里面有感染者」、门口地上几只往外逃的血脚印 */
function tapeDoor(P, nav, floorId, d, rng, force = true) {
  // 法线朝走廊那一侧（门外 0.6 米有楼板、站得住的那边）
  let nx = d.nx, nz = d.nz;
  const F = nav.floors.get(floorId); if (!F) return false;
  const out = (s) => { const st = landAt(nav, d.x + nx * s * 0.7, d.z + nz * s * 0.7, F.y + 0.6); return st && st.floor === floorId && clear(nav, st); };
  if (!out(1)) { if (!out(-1)) return false; nx = -nx; nz = -nz; }
  const S = P.spot(floorId, d.x + nx * 0.8, d.z + nz * 0.8, 3.2);
  if (!S) return false;
  // 门边的墙：和门脸共线的墙段里，离门洞边 0.45 米以外、墙段两头留够余量、整句都露在外面的一处
  const gw = 2.3, need = d.w / 2 + 0.35 + gw / 2;
  const cand = [];
  for (const { w, len } of S.walls) {
    const ux = (w.x1 - w.x0) / len, uz = (w.z1 - w.z0) / len;
    if (Math.abs(ux * d.dz - uz * d.dx) > 0.02) continue; // 不平行
    if (Math.abs((d.x - w.x0) * uz - (d.z - w.z0) * ux) > 0.05) continue; // 不在同一条线上
    const td = (d.x - w.x0) * ux + (d.z - w.z0) * uz, m = ROUTE_DRESS.margin + gw / 2;
    for (const t of [td + need, td - need]) if (t >= m && t <= len - m) { const q = { x: w.x0 + ux * t, z: w.z0 + uz * t, nx, nz, dx: ux, dz: uz, w }; if (S.spanFree(q, gw)) cand.push(q); }
  }
  const q = cand.length ? cand[Math.floor(rng() * cand.length)] : null;
  if (!q && !force) return false;
  const w = d.w, x = d.x + nx * 0.13, z = d.z + nz * 0.13;
  // 两条斜着交叉的胶带：从门框一边 0.7 米高拉到另一边 1.7 米高
  const span = Math.hypot(w + 0.16, 1.0), phi = Math.atan2(1.0, w + 0.16);
  for (const s of [1, -1]) {
    const ax = wallAxes(nx, nz, s * phi);
    P.items.push({ lv: S.lv, cell: 'tape', p: [x, S.y + 1.2 + (s > 0 ? 0 : 0.03), z], ...ax, w: span + 0.12, h: 0.075, mode: GLOSS, alpha: 0.95, pull: 0.0 });
  }
  if (q) S.addWall('gInfected', q, gw, 1.5, { phi: (rng() - 0.5) * 0.08, alpha: 0.95 });
  // 门边写不下（北区塔楼的入户门开在小小的电梯厅里）：写在这个厅里别的墙上，字小一点
  else S.wall('gInfected', 1, { size: [1.6, 1.9], yc: [1.45, 1.55], tilt: 0.05, keep: true, r1: 3.2, alpha: [0.9, 0.95] });
  // 门上、门框边几只血手印（里面的人想出来）
  S.wall(HANDS, 2, { size: [0.19, 0.23], yc: [0.9, 1.5], mode: BLOOD, r1: 1.6, tilt: 0.5 });
  const side = rng() < 0.5 ? 1 : -1;
  S.footsteps(d.x + nx * 0.5, d.z + nz * 0.5, d.x + nx * 0.5 + d.dx * side * -3.5, d.z + nz * 0.5 + d.dz * side * -3.5, { n: 5 });
  return true;
}

// ---------------------------------------------------------------------------
// 图集（canvas 程序画）

const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const C = Object.freeze({
  fresh: [86, 5, 7], dark: [42, 2, 3], dry: [62, 26, 17], rim: [40, 15, 10],
  // 薄薄一层的血（拖痕、抹痕）是透光的，颜色比厚的那滩亮、饱和；用暗色低透明度画出来会是一层灰
  thin: [132, 14, 11], thinDry: [104, 36, 22],
  plaster: [168, 163, 152], crater: [74, 70, 64], hole: [18, 16, 14], soot: [14, 12, 10],
});
/** 不规则的圆：半径按几个随机相位的正弦起伏 */
function blobPts(cx, cy, r, rng, amp = 0.2, n = 56) {
  const k = [2, 3, 4, 5, 7, 9].map((f, i) => ({ f, a: amp * (rng() * 0.8 + 0.2) / (1 + i * 0.6), p: rng() * Math.PI * 2 }));
  const pts = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; let s = 1; for (const q of k) s += q.a * Math.sin(q.f * t + q.p); pts.push([cx + Math.cos(t) * r * s, cy + Math.sin(t) * r * s]); }
  return pts;
}
function pathPts(g, pts) {
  g.beginPath();
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let p0 = m(pts[pts.length - 1], pts[0]); g.moveTo(p0[0], p0[1]);
  for (let i = 0; i < pts.length; i++) { const q = m(pts[i], pts[(i + 1) % pts.length]); g.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
  g.closePath();
}
function drop(g, x, y, r, col, a = 1) { g.fillStyle = rgba(col, a); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }

/** 一滩血：外圈干了发褐、中间还是暗红发亮（亮不亮由着色器按颜色认），边上一圈深色的干痕，周围溅出的小血点 */
function paintPool(g, W, H, rng) {
  const cx = W / 2, cy = H / 2, R = W * 0.3;
  // 主体和两三个连着的小滩
  const lobes = [[cx, cy, R]];
  for (let i = 0, n = 2 + Math.floor(rng() * 2); i < n; i++) { const a = rng() * Math.PI * 2, d = R * (0.7 + rng() * 0.35); lobes.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.3 + rng() * 0.25)]); }
  for (const [x, y, r] of lobes) { pathPts(g, blobPts(x, y, r, rng, 0.22)); g.fillStyle = rgba(C.dry, 0.88); g.fill(); g.lineWidth = Math.max(1, W * 0.006); g.strokeStyle = rgba(C.rim, 0.65); g.stroke(); }
  for (const [x, y, r] of lobes) {
    const gr = g.createRadialGradient(x - r * 0.15, y - r * 0.1, r * 0.05, x, y, r * 0.9);
    gr.addColorStop(0, rgba(C.dark, 0.97)); gr.addColorStop(0.65, rgba(C.fresh, 0.95)); gr.addColorStop(1, rgba([78, 12, 9], 0.9));
    pathPts(g, blobPts(x + (rng() - 0.5) * r * 0.1, y + (rng() - 0.5) * r * 0.1, r * 0.8, rng, 0.18)); g.fillStyle = gr; g.fill();
  }
  // 表面的结块和颜色起伏（不至于一整片平涂）
  for (let i = 0; i < 40; i++) { const a = rng() * Math.PI * 2, d = R * Math.sqrt(rng()) * 0.85; drop(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, W * (0.004 + rng() * 0.012), rng() < 0.5 ? C.dark : [100, 10, 10], 0.35); }
  // 周围的小血点（带一点往外的拖尾）
  for (let i = 0, n = 18 + Math.floor(rng() * 12); i < n; i++) {
    const a = rng() * Math.PI * 2, d = R * (1.15 + rng() * 0.6), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, r = W * (0.003 + rng() * 0.01);
    if (x < W * 0.06 || x > W * 0.94 || y < H * 0.06 || y > H * 0.94) continue;
    drop(g, x, y, r, rng() < 0.6 ? C.dry : C.fresh, 0.9);
    g.strokeStyle = rgba(C.dry, 0.7); g.lineWidth = r * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 3, y + Math.sin(a) * r * 3); g.stroke();
  }
}
/** 墙上的溅血：一团、往一个方向放射的长条血点、细密的飞沫，较大的血点往下流成几道 */
function paintSplat(g, W, H, rng) {
  const cx = W * (0.42 + rng() * 0.12), cy = H * 0.38, R = W * 0.12, dir = -Math.PI / 2 + (rng() - 0.5) * 1.6;
  pathPts(g, blobPts(cx, cy, R, rng, 0.35)); g.fillStyle = rgba(C.fresh, 0.92); g.fill();
  for (let i = 0; i < 46; i++) {
    const a = dir + (rng() - 0.5) * 2.4, d = R * (0.8 + rng() * 2.6), len = W * (0.01 + rng() * 0.05) * (1.4 - d / (R * 3.5)), r = W * (0.004 + rng() * 0.012) * (1.5 - d / (R * 3.4));
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    if (x < W * 0.05 || x > W * 0.95 || y < H * 0.05 || y > H * 0.7) continue;
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = rgba(rng() < 0.7 ? C.fresh : C.dry, 0.88); g.beginPath(); g.ellipse(0, 0, Math.max(r, len), Math.max(1, r), 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  for (let i = 0; i < 160; i++) { const a = dir + (rng() - 0.5) * 3, d = R * (1 + rng() * 3.2), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; if (x > W * 0.04 && x < W * 0.96 && y > H * 0.04 && y < H * 0.75) drop(g, x, y, W * (0.0015 + rng() * 0.004), C.fresh, 0.8); }
  // 往下流：几道细线，末端一个小血珠
  for (let i = 0, n = 4 + Math.floor(rng() * 4); i < n; i++) {
    const x = cx + (rng() - 0.5) * R * 1.8, y0 = cy + R * (0.2 + rng() * 0.5), len = H * (0.12 + rng() * 0.38), w = W * (0.005 + rng() * 0.009);
    const gr = g.createLinearGradient(0, y0, 0, y0 + len); gr.addColorStop(0, rgba(C.fresh, 0.92)); gr.addColorStop(1, rgba(C.dry, 0.85));
    g.strokeStyle = gr; g.lineCap = 'round'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x + (rng() - 0.5) * w * 2, y0 + len * 0.4, x + (rng() - 0.5) * w * 3, y0 + len * 0.7, x, Math.min(H * 0.95, y0 + len)); g.stroke();
    drop(g, x, Math.min(H * 0.95, y0 + len), w * 0.9, C.dry, 0.9);
  }
}
/** 拖痕：两道宽的抹痕（身体）+ 很多顺着方向的细丝，中间时断时续；两头淡出，可以一段接一段 */
function paintDrag(g, W, H, rng) {
  // 身体蹭出来的一整条：沿一条微微摆动的中线，宽窄、浓淡一路变（衣服吸走的地方淡、停顿的地方浓）
  const N = valueNoise(Math.floor(rng() * 1e6)), mid = (x) => H * (0.5 + 0.06 * Math.sin(x / W * 5.5 + 1.3) + 0.05 * (N(x / W * 3, 0.5, 2) - 0.5));
  for (let x = W * 0.02; x < W * 0.98; x += Math.max(1, W / 220)) {
    const k = x / W, half = H * (0.18 + 0.12 * N(k * 4, 2.5, 3)), dense = 0.16 + 0.26 * N(k * 6, 7.5, 2);
    const yc = mid(x);
    g.fillStyle = rgba(N(k * 9, 4.5, 2) > 0.5 ? C.thin : C.thinDry, dense);
    g.beginPath(); g.ellipse(x, yc, Math.max(1.5, W / 160), half, 0, 0, Math.PI * 2); g.fill();
  }
  // 布料、头发拖出来的细纹：顺着方向的一道道亮缝（透出地面）和几道更深的细线
  g.save(); g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const x0 = W * rng() * 0.8, x1 = Math.min(W, x0 + W * (0.12 + rng() * 0.4)), off = (rng() - 0.5) * H * 0.44;
    g.strokeStyle = `rgba(0,0,0,${0.2 + rng() * 0.3})`; g.lineWidth = Math.max(1, H * (0.012 + rng() * 0.03));
    g.beginPath(); g.moveTo(x0, mid(x0) + off); g.quadraticCurveTo((x0 + x1) / 2, mid((x0 + x1) / 2) + off + (rng() - 0.5) * H * 0.04, x1, mid(x1) + off); g.stroke();
  }
  g.restore();
  for (let i = 0; i < 6; i++) {
    const x0 = W * rng() * 0.85, x1 = Math.min(W, x0 + W * (0.06 + rng() * 0.25)), off = (rng() - 0.5) * H * 0.36;
    g.strokeStyle = rgba(rng() < 0.5 ? C.dark : C.rim, 0.25 + rng() * 0.3); g.lineWidth = Math.max(1, H * 0.012);
    g.beginPath(); g.moveTo(x0, mid(x0) + off); g.lineTo(x1, mid(x1) + off); g.stroke();
  }
  // 拖的时候手按下去、衣角蹭出来的几块浓的
  for (let i = 0; i < 3; i++) { const x = W * (0.15 + rng() * 0.7), y = mid(x) + (rng() - 0.5) * H * 0.3; pathPts(g, blobPts(x, y, H * (0.06 + rng() * 0.05), rng, 0.3, 24)); g.fillStyle = rgba(C.fresh, 0.45 + rng() * 0.3); g.fill(); }
  // 边上零星的血点
  for (let i = 0; i < 30; i++) { const x = W * (0.05 + rng() * 0.9), y = mid(x) + (rng() < 0.5 ? -1 : 1) * H * (0.25 + rng() * 0.18); drop(g, x, y, Math.max(0.8, H * (0.006 + rng() * 0.012)), rng() < 0.5 ? C.dry : C.fresh, 0.75); }
  // 两头淡出（接缝处不显）
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (const [a, b] of [[0, W * 0.12], [W, W * 0.88]]) { const gr = g.createLinearGradient(a, 0, b, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(Math.min(a, b), 0, Math.abs(b - a), H); }
  g.restore();
}
/** 手指往一边抹出去的血痕：起头一块掌印，四道指痕越抹越淡 */
function paintSmear(g, W, H, rng) {
  // 整只手按在墙上往一边抹：起头是浓的一块（手掌按下去的地方），后面是一整片越抹越薄的血，四根手指在里面拖出四道深一点的痕，
  // 指缝之间只留很细的空隙（不是四道分开的线）
  const x0 = W * 0.08, xe = W * (0.82 + rng() * 0.14), top = H * 0.14, bot = H * 0.86, drift = H * (0.06 + rng() * 0.1);
  const yAt = (x, y) => y + drift * ((x - x0) / (xe - x0)) ** 1.5;
  // 底下那一片：一列一列竖着的小段，透明度往后递减，上下边缘随机进退
  for (let x = x0; x < xe; x += Math.max(1, W / 260)) {
    const k = (x - x0) / (xe - x0), a = 0.55 * (1 - k) ** 1.3 + 0.04;
    const t0 = yAt(x, top + (rng() - 0.5) * H * 0.06 + k * H * 0.08), t1 = yAt(x, bot + (rng() - 0.5) * H * 0.06 - k * H * 0.1);
    g.fillStyle = rgba(k < 0.35 ? C.thin : C.thinDry, a); g.fillRect(x, t0, Math.max(1.5, W / 240), t1 - t0);
  }
  // 四道指痕：宽、挨着，越往后越淡
  for (let f = 0; f < 4; f++) {
    const y = top + (f + 0.5) * (bot - top) / 4, len = (xe - x0) * (0.75 + rng() * 0.25);
    const gr = g.createLinearGradient(x0, 0, x0 + len, 0); gr.addColorStop(0, rgba(C.fresh, 0.8)); gr.addColorStop(0.5, rgba(C.thin, 0.45)); gr.addColorStop(1, rgba(C.thinDry, 0));
    g.strokeStyle = gr; g.lineCap = 'round'; g.lineWidth = (bot - top) / 4 * 0.78;
    g.beginPath(); g.moveTo(x0 + W * 0.04, y); g.quadraticCurveTo(x0 + len * 0.5, yAt(x0 + len * 0.5, y) + (rng() - 0.5) * H * 0.04, x0 + len, yAt(x0 + len, y)); g.stroke();
  }
  // 手掌按下去的那块
  pathPts(g, blobPts(x0 + W * 0.04, H * 0.5, H * 0.36, rng, 0.18, 30)); g.fillStyle = rgba(C.fresh, 0.85); g.fill();
  // 皮纹刮出来的细丝空隙
  g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = 1;
  for (let i = 0; i < 18; i++) { const y = top + rng() * (bot - top), xa = x0 + W * (0.05 + rng() * 0.2), xb = xa + W * (0.2 + rng() * 0.4); g.strokeStyle = `rgba(0,0,0,${0.2 + rng() * 0.35})`; g.beginPath(); g.moveTo(xa, yAt(xa, y)); g.lineTo(xb, yAt(xb, y)); g.stroke(); }
  g.restore();
}
/** 手的轮廓（左手，100 × 100 的格子里）：手掌、四指、拇指。on[i] = 第 i 根手指沾没沾到墙 */
function handShape(g, s, rng, on = [1, 1, 1, 1, 1]) {
  g.beginPath(); g.moveTo(37 * s, 52 * s); g.quadraticCurveTo(36 * s, 80 * s, 46 * s, 90 * s); g.quadraticCurveTo(58 * s, 94 * s, 64 * s, 84 * s); g.quadraticCurveTo(68 * s, 66 * s, 66 * s, 50 * s); g.quadraticCurveTo(52 * s, 46 * s, 37 * s, 52 * s); g.fill();
  const fingers = [[39.5, 52, 3.1, 25, -0.3], [47, 49, 3.3, 31, -0.09], [55, 49, 3.3, 32, 0.08], [62.5, 51, 2.9, 26, 0.3], [66, 72, 3.7, 24, 1.1]];
  fingers.forEach(([x, y, r, len, a], i) => {
    if (!on[i]) return;
    // 手指按下去的长短不一：只有前两节沾到、或者指尖没碰到墙
    const L = len * (0.86 + rng() * 0.16);
    g.save(); g.translate(x * s, y * s); g.rotate(a + (rng() - 0.5) * 0.12); g.beginPath();
    g.moveTo(-r * s, 2 * s); g.lineTo(-r * s * 0.9, -L * s + r * s); g.arc(0, -L * s + r * s, r * s * 0.9, Math.PI, 0); g.lineTo(r * s, 2 * s); g.closePath(); g.fill();
    g.restore();
  });
}
/**
 * 按压的明暗：先把手形画成白色的遮罩，再逐像素上色——边缘一圈干了的深色（血往边上收、先干），中间湿的亮一点；
 * 按没按实用噪声决定（掌心中间凹下去、手指有的只沾到半截），不再是盖章一样整整齐齐的一只手
 */
function shadeBlood(g, W, H, rng, { streak = 0, contact = 0.38, hollow = null } = {}) {
  if (typeof g.getImageData !== 'function') return;
  let img = null; try { img = g.getImageData(0, 0, W, H); } catch { img = null; }
  if (!img?.data) return;
  const d = img.data, N = valueNoise(Math.floor(rng() * 1e6)), M = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) M[i] = d[i * 4 + 3] / 255;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : M[y * W + x]);
  const k = W / 110, dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  const wet = [96, 10, 9], dry = [44, 10, 7], brown = [64, 26, 15];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, m = M[i]; if (m <= 0) continue;
    // 离边多近：往八个方向 2、4 像素看出没出手形
    let out = 0; for (const [dx, dy] of dirs) out += (1 - at(Math.round(x + dx * 2 * k), Math.round(y + dy * 2 * k))) + 0.6 * (1 - at(Math.round(x + dx * 4 * k), Math.round(y + dy * 4 * k)));
    const edge = Math.min(1, out / 5);
    // 沾没沾上：低频噪声 + 往下拉长的噪声（滑下去的那种）
    const nx = x / W, ny = y / H, n = N(nx * 7 + 3, ny * (streak ? 2.2 : 7), 3), fine = N(nx * 26, ny * (streak ? 6 : 26) + 9, 2);
    let c = n * 0.75 + fine * 0.35;
    if (hollow) { const hd = Math.hypot(nx - hollow[0], ny - hollow[1]) / hollow[2]; c -= Math.max(0, 1 - hd) * 0.35; }
    const a = m * Math.max(0, Math.min(1, (c - contact) / 0.14)) * (0.78 + 0.2 * edge);
    const dz = N(nx * 4 + 17, ny * 4, 2); // 有的地方已经干成褐色
    const t = Math.min(1, smooth(0.15, 0.7, edge) + Math.max(0, dz - 0.6) * 1.6);
    const base = dz > 0.62 ? brown : dry;
    d[i * 4] = wet[0] + (base[0] - wet[0]) * t; d[i * 4 + 1] = wet[1] + (base[1] - wet[1]) * t; d[i * 4 + 2] = wet[2] + (base[2] - wet[2]) * t; d[i * 4 + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
}
/** 血手印（左手；右手镜像画）：按得不实——有的指尖、掌心没沾到，一两根手指往下蹭出一道，边缘干得深、中间湿 */
function paintHand(g, W, H, rng, mirror = false) {
  const s = W / 100;
  g.save(); if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
  g.fillStyle = '#fff';
  const on = [rng() < 0.9, 1, 1, rng() < 0.85, rng() < 0.6].map(Number);
  if (!on.slice(0, 4).some(Boolean)) on[1] = 1;
  handShape(g, s, rng, on);
  // 一根手指往下滑了一点
  if (rng() < 0.6) { g.save(); g.globalAlpha = 0.5; g.translate(0, (4 + rng() * 6) * s); handShape(g, s, rng, on.map((v, i) => (i === 1 + Math.floor(rng() * 2) ? v : 0))); g.restore(); }
  g.restore();
  shadeBlood(g, W, H, rng, { contact: 0.3 + rng() * 0.08, hollow: [mirror ? 0.48 : 0.52, 0.7, 0.14] });
  // 往下淌的一两道（墙上的手印是竖着按的）
  for (let i = 0, n = Math.floor(rng() * 3); i < n; i++) {
    const x = (mirror ? 100 - (40 + rng() * 24) : 40 + rng() * 24) * s, y0 = (78 + rng() * 8) * s, L = (5 + rng() * 12) * s;
    g.strokeStyle = rgba([92, 12, 10], 0.75); g.lineWidth = (0.9 + rng() * 0.7) * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (rng() - 0.5) * s, y0 + L); g.stroke();
    drop(g, x, y0 + L, 1.1 * s, [70, 14, 10], 0.8);
  }
}
/** 按上去以后整只手往下滑：上面一只按得浓的手，四指拖成往下的几道，越往下越淡越窄 */
function paintHandDrag(g, W, H, rng) {
  const s = W / 100, mirror = rng() < 0.5, k = 0.74;
  g.save(); if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
  g.fillStyle = '#fff';
  const on = [rng() < 0.85, 1, 1, rng() < 0.8, rng() < 0.4].map(Number);
  // 起手那一下按得最实，往下每挪一点画一遍、越来越淡（遮罩是累加的，拖出来是连着的一片）
  const steps = 26, drop0 = (30 + rng() * 10) * s, shape = Math.floor(rng() * 1e6);
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    g.save(); g.globalAlpha = i === 0 ? 1 : 0.16 * (1 - t) + 0.05; g.translate(13 * s + (rng() - 0.5) * 0.6 * s + t * (rng() - 0.5) * 3 * s, -8 * s + t * drop0); g.scale(k, k * (1 + t * 0.15));
    handShape(g, s, mulberry32(shape), on);
    g.restore();
  }
  g.restore();
  shadeBlood(g, W, H, rng, { streak: 1, contact: 0.3 });
}
/** 血鞋印（左脚；右脚镜像）：前掌和鞋跟，横纹鞋底，前掌重、跟淡 */
function paintFoot(g, W, H, rng, mirror = false) {
  g.save(); if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
  const s = W / 100;
  g.fillStyle = rgba(C.fresh, 0.8);
  g.beginPath(); g.ellipse(52 * s, 30 * s, 16 * s, 22 * s, 0.08, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(48 * s, 50 * s, 11 * s, 14 * s, 0.05, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(47 * s, 76 * s, 12 * s, 14 * s, 0, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'destination-out';
  // 鞋底的横纹和人字纹
  g.lineWidth = 1.6 * s; g.strokeStyle = 'rgba(0,0,0,0.85)';
  for (let y = 10; y < 94; y += 5.2) { g.beginPath(); g.moveTo(28 * s, y * s); g.lineTo(52 * s, (y + 2.5) * s); g.lineTo(72 * s, y * s); g.stroke(); }
  // 足弓那段几乎没沾到；整只越往跟越淡
  g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(30 * s, 56 * s, 40 * s, 8 * s);
  const gr = g.createLinearGradient(0, 20 * s, 0, 95 * s); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) drop(g, (30 + rng() * 44) * s, (8 + rng() * 86) * s, (0.6 + rng() * 1.8) * s, [0, 0, 0], 0.5);
  g.restore();
}
/** 地上的几滴血：少、大、圆；外圈一道干了的深色边，中间湿的（着色器认暗红变光滑），只有大的那滴边上溅出两三个小点（离远了 mipmap 自然把它们抹掉） */
function bloodDrop(g, x, y, r, rng, { stretch = 1, dir = 0, spikes = true } = {}) {
  g.save(); g.translate(x, y); g.rotate(dir); g.scale(stretch, 1);
  pathPts(g, blobPts(0, 0, r, rng, 0.07, 24)); g.fillStyle = rgba([58, 14, 9], 0.92); g.fill();
  pathPts(g, blobPts(-r * 0.08, -r * 0.06, r * 0.78, rng, 0.06, 20)); g.fillStyle = rgba([96, 8, 8], 0.95); g.fill();
  g.restore();
  if (stretch > 1.05) { // 顺着走的方向甩出去的尾巴（落下去时人还在往前走）
    const tx = x + Math.cos(dir) * r * stretch, ty = y + Math.sin(dir) * r * stretch;
    g.strokeStyle = rgba([80, 10, 9], 0.85); g.lineCap = 'round'; g.lineWidth = r * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(tx + Math.cos(dir) * r * 0.8, ty + Math.sin(dir) * r * 0.8); g.stroke();
    drop(g, tx + Math.cos(dir) * r * 1.4, ty + Math.sin(dir) * r * 1.4, r * 0.22, [70, 12, 9], 0.85);
  }
  if (spikes) for (let k = 0, n = 2 + Math.floor(rng() * 3); k < n; k++) { const a = rng() * Math.PI * 2, d = r * (1.25 + rng() * 0.5); drop(g, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.07 + rng() * 0.08), [70, 10, 9], 0.85); }
}
function paintDrops(g, W, H, rng) {
  const spots = [[0.32, 0.34], [0.68, 0.4], [0.45, 0.7], [0.75, 0.76]];
  for (let i = 0, n = 3 + Math.floor(rng() * 2); i < n; i++) {
    const [u, v] = spots[i], r = W * (i ? 0.065 + rng() * 0.04 : 0.11 + rng() * 0.03);
    bloodDrop(g, W * (u + (rng() - 0.5) * 0.08), H * (v + (rng() - 0.5) * 0.08), r, rng, { spikes: i === 0 || rng() < 0.4 });
  }
}
/** 一串边走边滴的血（2 : 1 的格子，往 +x 方向走）：一滴滴拉长、尾巴朝前，大小不一、间距不匀 */
function paintTrail(g, W, H, rng) {
  let x = W * 0.07;
  while (x < W * 0.9) {
    const r = H * (0.07 + rng() * 0.07);
    bloodDrop(g, x, H * (0.5 + (rng() - 0.5) * 0.3), r, rng, { stretch: 1.2 + rng() * 0.6, dir: (rng() - 0.5) * 0.3, spikes: false });
    x += W * (0.12 + rng() * 0.1);
  }
}
/** 一片弹孔：每个孔崩掉一圈抹灰，露出灰色的水泥（下沿一道软的阴影），黑洞大小不一、裂纹短而曲折；一片孔下面一扇落下来的灰 */
function paintHoles(g, W, H, rng) {
  const n = 5 + Math.floor(rng() * 4), cx = W / 2, cy = H * 0.42, pts = [];
  for (let i = 0; i < n; i++) pts.push([cx + (rng() - 0.5) * W * 0.62, cy + (rng() - 0.5) * H * 0.52, W * (0.03 + rng() * rng() * 0.055)]);
  // 先画落灰（在孔的下面，扇形往下散开）
  for (let i = 0; i < 260; i++) {
    const p = pts[Math.floor(rng() * pts.length)], t = rng(), y = p[1] + p[2] + t * (H * 0.96 - p[1] - p[2]) * 0.8, x = p[0] + (rng() - 0.5) * (p[2] * 2 + t * W * 0.25);
    drop(g, x, y, W * (0.002 + rng() * 0.004), [150, 148, 142], 0.18 * (1 - t) + 0.04);
  }
  for (const [x, y, r] of pts) {
    const chip = blobPts(x, y, r * (1.5 + rng() * 0.7), rng, 0.4, 14);
    g.save(); g.translate(r * 0.1, r * 0.18); pathPts(g, chip); g.fillStyle = 'rgba(40,38,36,0.35)'; g.fill(); g.restore(); // 崩口下沿的阴影
    pathPts(g, chip); g.fillStyle = rgba([132, 131, 128], 0.85); g.fill();
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 1.1); gr.addColorStop(0, rgba([62, 61, 59], 0.95)); gr.addColorStop(0.6, rgba([92, 91, 88], 0.6)); gr.addColorStop(1, rgba([92, 91, 88], 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.1, 0, Math.PI * 2); g.fill();
    pathPts(g, blobPts(x, y, r * (0.3 + rng() * 0.15), rng, 0.3, 10)); g.fillStyle = rgba(C.hole, 1); g.fill();
    // 一两道短裂纹，一折一折的
    g.strokeStyle = rgba([46, 44, 42], 0.55); g.lineWidth = Math.max(1, W * 0.004); g.lineJoin = 'miter';
    for (let k = 0, m = Math.floor(rng() * 3); k < m; k++) { let a = rng() * Math.PI * 2, px = x + Math.cos(a) * r * 1.3, py = y + Math.sin(a) * r * 1.3; g.beginPath(); g.moveTo(px, py); for (let j = 0; j < 4; j++) { a += (rng() - 0.5) * 1.6; px += Math.cos(a) * r * 0.35; py += Math.sin(a) * r * 0.35; g.lineTo(px, py); } g.stroke(); }
    for (let k = 0; k < 5; k++) drop(g, x + (rng() - 0.5) * r * 3, y + r * (1.4 + rng() * 2), W * (0.003 + rng() * 0.004), [120, 119, 116], 0.7); // 崩下来的碎渣
  }
}
/** 平滑的值噪声（格点哈希 + 平滑插值），几层叠起来；画烟熏这种大片柔和的东西用 */
function valueNoise(seed) {
  const h = (i, j) => { let t = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2246822519); t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
  const s = (t) => t * t * (3 - 2 * t);
  const n = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = s(x - i), fy = s(y - j); const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  return (x, y, oct = 4) => { let v = 0, A = 0.5, f = 1, sum = 0; for (let o = 0; o < oct; o++) { v += n(x * f, y * f) * A; sum += A; A *= 0.5; f *= 2.03; } return v / sum; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * 熏黑（竖长的一格，贴在火后面的墙上，下沿在地面、上沿到天花板）：墙根一段几乎全黑，往上张开成一缕一缕的烟舌，
 * 到顶也不收（烟是顶着天花板往两边散的），边缘被噪声啃得不齐。
 * 逐像素算（渐变叠很多层在画布上会抖出网点），按一半分辨率算再放大（烟是软的）；画在单独的小画布上（putImageData 不认裁剪和平移）。
 */
function paintScorch(g, W0, H0, rng) {
  if (typeof g.createImageData !== 'function') return;
  const W = Math.max(8, Math.round(W0 / 2)), H = Math.max(8, Math.round(H0 / 2));
  const img = g.createImageData(W, H); if (!img?.data) return;
  const d = img.data, N = valueNoise(Math.floor(rng() * 1e6)), lean = (rng() - 0.5) * 0.12;
  for (let y = 0; y < H; y++) {
    const t = 1 - y / H; // 0 = 墙根（火在这儿），1 = 顶
    const half = 0.1 + 0.3 * Math.pow(t, 0.7); // 烟柱半宽：墙根窄、往上张开（到顶也不碰格子两边，不然看得出一条竖直的边）
    for (let x = 0; x < W; x++) {
      const u = x / W - 0.5 - lean * t * t;
      const tongue = N(x / W * 3.2, y / H * 2.2 + 3, 3), fine = N(x / W * 9 + 11, y / H * 9, 2);
      const edge = 1 - Math.abs(u) / (half * (0.72 + 0.55 * tongue));
      let a = smooth(0, 0.4, edge) * (0.35 + 0.8 * tongue) * (1 - 0.45 * smooth(0.3, 1, t)) * (0.85 + 0.3 * fine);
      a += smooth(0.22, 0, t) * smooth(-0.1, 0.5, edge) * 0.55; // 墙根最黑的那一段
      // 顶上一截慢慢淡掉（顶着天花板散开的烟本来就是一层灰，不是一刀切齐的边），边缘按噪声进退
      a *= smooth(0, 0.15 + 0.1 * fine, y / H) * smooth(1, 0.985, y / H) * smooth(0, 0.1, x / W) * smooth(1, 0.9, x / W);
      a = Math.max(0, Math.min(0.94, a));
      const i = (y * W + x) * 4, c = 6 + 22 * fine * (1 - a);
      d[i] = c + 4; d[i + 1] = c + 3; d[i + 2] = c; d[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.save(); g.globalCompositeOperation = 'copy'; g.imageSmoothingEnabled = true; g.drawImage(g.canvas, 0, 0, W, H, 0, 0, W0, H0); g.restore();
}
/**
 * 地上烧过的一块：中间焦黑、往外一圈炭化的深褐、最外一道硬的焦边，外面一层淡淡的烟灰；里面落着灰白的灰烬、几粒暗红的余烬和几片卷起来的烧焦纸片。
 * 着色器里按哑光算（焦炭不反光）
 */
function paintBurn(g, W, H, rng) {
  if (typeof g.createImageData !== 'function' || typeof g.putImageData !== 'function') return;
  const img = g.createImageData(W, H); if (!img?.data) return;
  const d = img.data, N = valueNoise(Math.floor(rng() * 1e6)), cx = W / 2, cy = H / 2, R = W * 0.37;
  // 轮廓的起伏按角度先算一圈（逐像素算三层噪声太慢）
  const A = 256, wob = new Float32Array(A);
  for (let k = 0; k < A; k++) { const a = (k / A) * Math.PI * 2; wob[k] = 0.74 + 0.36 * N(Math.cos(a) * 1.4 + 5, Math.sin(a) * 1.4 + 5, 3) + 0.12 * (N(Math.cos(a) * 5 + 9, Math.sin(a) * 5, 1) - 0.5); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy, k = Math.floor(((Math.atan2(dy, dx) / (Math.PI * 2)) + 1) * A) % A;
    const r = Math.hypot(dx, dy) / (R * wob[k]), fine = N(x / W * 14, y / H * 14, 2);
    let col, a;
    if (r < 1) {
      const t = smooth(0.5, 0.97, r + (fine - 0.5) * 0.3);
      // 火光底下很亮：焦黑要真黑（底色比别的痕迹都暗），不然一照就成了一摊咖啡渍
      col = [5 + 16 * t, 4 + 10 * t, 4 + 6 * t];
      if (r > 0.93) col = [30 + 12 * fine, 19 + 6 * fine, 12]; // 焦边：一道窄的褐色硬边
      a = 0.95 - 0.1 * t;
      if (r < 0.75) { const ash = N(x / W * 34 + 7, y / H * 34, 1); if (ash > 0.78) { const q = smooth(0.78, 0.9, ash) * 0.6; col = col.map((c, j) => c + ([92, 90, 86][j] - c) * q); } }
    } else { col = [18, 15, 13]; a = 0.32 * smooth(1.16, 1.0, r) * (0.5 + 0.7 * fine); }
    const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.max(0, Math.min(1, a)) * 255 * smooth(0, 0.04, Math.min(x, y, W - x, H - y) / W);
  }
  g.putImageData(img, 0, 0);
  // 烧剩的纸片：卷起来的黑片，边缘一圈焦褐
  for (let i = 0, n = 4 + Math.floor(rng() * 3); i < n; i++) {
    const a = rng() * Math.PI * 2, dd = R * (0.3 + rng() * 0.9), x = cx + Math.cos(a) * dd, y = cy + Math.sin(a) * dd, r = W * (0.025 + rng() * 0.03);
    pathPts(g, blobPts(x, y, r, rng, 0.5, 7)); g.fillStyle = 'rgba(16,13,11,0.95)'; g.fill(); g.strokeStyle = 'rgba(84,48,24,0.75)'; g.lineWidth = Math.max(1, W * 0.006); g.stroke();
  }
  for (let i = 0; i < 70; i++) { const a = rng() * Math.PI * 2, dd = R * Math.sqrt(rng()) * 1.1; drop(g, cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, W * (0.002 + rng() * 0.003), [120, 117, 110], 0.5); } // 灰烬
  for (let i = 0; i < 6; i++) { const a = rng() * Math.PI * 2, dd = R * Math.sqrt(rng()) * 0.8; drop(g, cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, W * 0.004, [128, 46, 18], 0.75); } // 余烬（暗红，不是发光的橙）
}
/** 碎玻璃：一片片几乎透明，只有一两条边亮（手电一照会闪）、里面一圈暗的折射线、几个小亮点 */
function paintGlass(g, W, H, rng) {
  for (let i = 0; i < 46; i++) {
    const t = rng(), x = W * (0.5 + (rng() - 0.5) * 0.85 * Math.sqrt(t + 0.1)), y = H * (0.5 + (rng() - 0.5) * 0.75 * Math.sqrt(t + 0.1)), r = H * (0.02 + rng() * rng() * 0.12);
    const k = 3 + Math.floor(rng() * 2), a0 = rng() * 6.28, P = [];
    for (let j = 0; j < k; j++) { const a = a0 + (j / k) * 6.28 + (rng() - 0.5) * 0.9, dd = r * (0.5 + rng() * 0.7); P.push([x + Math.cos(a) * dd, y + Math.sin(a) * dd]); }
    const poly = (s = 1) => { g.beginPath(); P.forEach(([px, py], j) => { const qx = x + (px - x) * s, qy = y + (py - y) * s; j ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }); g.closePath(); };
    poly(); g.fillStyle = `rgba(120,140,148,${0.05 + rng() * 0.07})`; g.fill();
    poly(0.8); g.strokeStyle = `rgba(14,18,20,${0.35 + rng() * 0.2})`; g.lineWidth = 1; g.stroke();
    // 亮边：只挑一两条
    g.strokeStyle = `rgba(232,242,248,${0.6 + rng() * 0.35})`; g.lineWidth = 1;
    for (let e = 0, m = 1 + Math.floor(rng() * 2); e < m; e++) { const j = Math.floor(rng() * k), A = P[j], B = P[(j + 1) % k]; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); }
  }
  for (let i = 0; i < 10; i++) { const x = W * (0.15 + rng() * 0.7), y = H * (0.15 + rng() * 0.7), r = H * 0.012; g.fillStyle = 'rgba(245,250,252,0.9)'; g.fillRect(x - r, y - 0.5, r * 2, 1); g.fillRect(x - 0.5, y - r, 1, r * 2); }
}
/** 碎石灰、水泥块和一层白灰 */
function paintDebris(g, W, H, rng) {
  for (let i = 0; i < 500; i++) { const x = W * (0.5 + (rng() - 0.5) * (rng() + 0.2) * 0.9), y = H * (0.5 + (rng() - 0.5) * (rng() + 0.2) * 0.9); drop(g, x, y, H * (0.004 + rng() * 0.008), [196, 192, 182], 0.18 + rng() * 0.25); }
  for (let i = 0; i < 32; i++) {
    const x = W * (0.12 + rng() * 0.76), y = H * (0.18 + rng() * 0.64), r = H * (0.02 + rng() * rng() * 0.11), c = 150 + Math.floor(rng() * 60);
    const pts = blobPts(x, y, r, rng, 0.45, 7);
    g.save(); g.translate(r * 0.18, r * 0.2); pathPts(g, pts); g.fillStyle = 'rgba(20,18,16,0.45)'; g.fill(); g.restore(); // 块下面的影子
    pathPts(g, pts); g.fillStyle = `rgb(${c},${c - 4},${c - 12})`; g.fill();
    g.save(); g.clip(); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x - r, y - r, r * 2, r * 0.8); g.restore();
  }
}
/** 一张纸（A4 比例）：脏白、折痕两边明暗不同、几行字、一角踩上去的鞋印灰；variant 1 是红头的通知 */
function paintPaper(g, W, H, rng, variant = 0) {
  const pw = W * 0.6, ph = pw * 1.414, x0 = (W - pw) / 2, y0 = (H - ph) / 2;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 + 1.5, y0 + 2, pw, ph);
  g.fillStyle = variant ? '#dcd8cc' : '#d3cfc2'; g.fillRect(x0, y0, pw, ph);
  // 折痕
  const fy = y0 + ph * (0.35 + rng() * 0.3); g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x0, fy, pw, ph - (fy - y0));
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0, fy - 1, pw, 1);
  if (variant) { g.fillStyle = '#9c2a22'; g.fillRect(x0 + pw * 0.08, y0 + ph * 0.06, pw * 0.84, ph * 0.09); }
  g.fillStyle = 'rgba(55,55,60,0.42)';
  for (let i = 0, y = y0 + ph * (variant ? 0.22 : 0.1); y < y0 + ph * 0.9; i++, y += ph * 0.052) { const L = pw * (0.5 + rng() * 0.32); g.fillRect(x0 + pw * 0.1, y, i % 7 === 6 ? L * 0.4 : L, Math.max(1, ph * 0.012)); }
  // 踩过的灰鞋印、一点血
  g.fillStyle = 'rgba(80,66,52,0.22)'; g.beginPath(); g.ellipse(x0 + pw * (0.3 + rng() * 0.4), y0 + ph * (0.5 + rng() * 0.3), pw * 0.18, ph * 0.12, rng(), 0, Math.PI * 2); g.fill();
  if (rng() < 0.6) drop(g, x0 + pw * rng(), y0 + ph * rng(), pw * 0.04, C.dry, 0.8);
}
/** 掉在地上的手机（横着的格子）：深色机身、屏幕碎成蛛网 */
function paintPhone(g, W, H, rng) {
  // 按竖着的样子画，转 90 度放进横格
  g.save(); g.translate(W / 2, H / 2); g.rotate(Math.PI / 2); g.translate(-H / 2, -W / 2);
  const w0 = H, h0 = W, x0 = w0 * 0.12, y0 = h0 * 0.08, w = w0 * 0.76, h = h0 * 0.84, r = w * 0.18;
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.roundRect ? g.roundRect(x0 + 1, y0 + 2, w, h, r) : g.rect(x0 + 1, y0 + 2, w, h); g.fill();
  g.fillStyle = '#16181b'; g.beginPath(); g.roundRect ? g.roundRect(x0, y0, w, h, r) : g.rect(x0, y0, w, h); g.fill();
  g.fillStyle = '#0b1217'; g.fillRect(x0 + w * 0.07, y0 + h * 0.05, w * 0.86, h * 0.9);
  const gr = g.createLinearGradient(x0, y0, x0 + w, y0 + h); gr.addColorStop(0, 'rgba(120,150,170,0.18)'); gr.addColorStop(0.5, 'rgba(120,150,170,0)'); g.fillStyle = gr; g.fillRect(x0 + w * 0.07, y0 + h * 0.05, w * 0.86, h * 0.9);
  const ix = x0 + w * (0.3 + rng() * 0.4), iy = y0 + h * (0.3 + rng() * 0.4); g.strokeStyle = 'rgba(220,230,235,0.55)'; g.lineWidth = 1;
  for (let k = 0; k < 9; k++) { let a = rng() * 6.28, px = ix, py = iy; g.beginPath(); g.moveTo(px, py); for (let j = 0; j < 4; j++) { a += (rng() - 0.5) * 0.6; px += Math.cos(a) * h * 0.1; py += Math.sin(a) * h * 0.1; g.lineTo(px, py); } g.stroke(); }
  g.restore();
}
/** 跑掉的一只鞋（俯视，侧倒着）：深色鞋面、白鞋底露出一圈、鞋带，鞋头蹭了血；底下一圈影子 */
function paintShoe(g, W, H, rng) {
  const s = W / 100;
  g.save(); g.translate(50 * s, 50 * s); g.rotate(-0.5 + (rng() - 0.5) * 0.4);
  const outline = (k) => { g.beginPath(); g.moveTo(-38 * s * k, -2 * s); g.bezierCurveTo(-38 * s * k, -15 * s * k, -18 * s, -16 * s * k, 4 * s, -14 * s * k); g.bezierCurveTo(26 * s, -13 * s * k, 40 * s * k, -11 * s * k, 40 * s * k, 0); g.bezierCurveTo(40 * s * k, 11 * s * k, 24 * s, 13 * s * k, 4 * s, 13 * s * k); g.bezierCurveTo(-18 * s, 14 * s * k, -38 * s * k, 12 * s * k, -38 * s * k, -2 * s); g.closePath(); };
  g.save(); g.translate(2.5 * s, 3.5 * s); outline(1.04); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill(); g.restore(); // 影子
  outline(1); g.fillStyle = '#9d9991'; g.fill(); // 鞋底（脏了的白）
  outline(0.84); const gr = g.createLinearGradient(0, -14 * s, 0, 12 * s); gr.addColorStop(0, '#4a4d55'); gr.addColorStop(0.5, '#33363d'); gr.addColorStop(1, '#1d1f24'); g.fillStyle = gr; g.fill(); // 鞋面
  // 鞋口（脚伸进去的洞）和鞋带
  g.fillStyle = '#121214'; g.beginPath(); g.ellipse(-20 * s, -1 * s, 10 * s, 6.5 * s, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(160,158,150,0.7)'; g.lineWidth = 1.3 * s; g.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const x = -6 * s + i * 5.5 * s; g.beginPath(); g.moveTo(x, -5 * s); g.lineTo(x + 3 * s, 5 * s); g.moveTo(x + 3 * s, -5 * s); g.lineTo(x, 5 * s); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.ellipse(14 * s, -6 * s, 18 * s, 3 * s, 0, 0, Math.PI * 2); g.fill(); // 鞋面的一点反光
  // 鞋头蹭的血
  g.save(); outline(1); g.clip(); pathPts(g, blobPts(30 * s, 4 * s, 9 * s, rng, 0.35, 20)); g.fillStyle = rgba(C.fresh, 0.8); g.fill(); g.restore();
  g.restore();
}
/** 扔下的双肩包（俯视）：鼓起来的包身、盖布、拉链、一条背带甩在一边 */
function paintBag(g, W, H, rng) {
  const s = W / 100;
  g.save(); g.translate(50 * s, 52 * s); g.rotate((rng() - 0.5) * 0.8);
  const body = () => { g.beginPath(); g.roundRect ? g.roundRect(-24 * s, -30 * s, 48 * s, 60 * s, 14 * s) : g.rect(-24 * s, -30 * s, 48 * s, 60 * s); };
  g.save(); g.translate(3 * s, 4 * s); body(); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill(); g.restore();
  // 背带：一条甩出去的弧
  g.strokeStyle = '#1b1e24'; g.lineWidth = 6 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(-14 * s, -26 * s); g.bezierCurveTo(-44 * s, -30 * s, -46 * s, 10 * s, -22 * s, 22 * s); g.stroke();
  body(); const gr = g.createRadialGradient(-6 * s, -8 * s, 4 * s, 0, 0, 40 * s); gr.addColorStop(0, '#3e5068'); gr.addColorStop(1, '#1c2533'); g.fillStyle = gr; g.fill();
  // 盖布和拉链
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(-24 * s, -10 * s); g.quadraticCurveTo(0, 2 * s, 24 * s, -10 * s); g.lineTo(24 * s, -16 * s); g.quadraticCurveTo(0, -4 * s, -24 * s, -16 * s); g.fill();
  g.strokeStyle = 'rgba(170,175,180,0.7)'; g.lineWidth = 1.2 * s; g.beginPath(); g.moveTo(-18 * s, 14 * s); g.lineTo(18 * s, 14 * s); g.stroke();
  g.fillStyle = '#9aa0a6'; g.fillRect(12 * s, 12 * s, 4 * s, 6 * s);
  g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.ellipse(-8 * s, -20 * s, 12 * s, 5 * s, -0.3, 0, Math.PI * 2); g.fill();
  if (rng() < 0.7) { g.save(); body(); g.clip(); pathPts(g, blobPts(14 * s, 22 * s, 8 * s, rng, 0.3, 18)); g.fillStyle = rgba(C.dark, 0.75); g.fill(); g.restore(); }
  g.restore();
}
/** 几颗弹壳：发暗、不饱和的旧黄铜，口部一个黑洞、一道一像素的高光；有的侧躺、有的口朝上 */
function paintCasings(g, W, H, rng) {
  for (let i = 0, n = 4 + Math.floor(rng() * 2); i < n; i++) {
    const x = W * (0.12 + (i + rng() * 0.6) / (n + 0.4) * 0.8), y = H * (0.3 + rng() * 0.4), r = H * (0.06 + rng() * 0.015);
    if (rng() < 0.2) { // 立着的：从上面看是个圈
      drop(g, x + 1, y + 1, r * 1.2, [0, 0, 0], 0.35); drop(g, x, y, r * 1.1, [118, 98, 60], 1); drop(g, x, y, r * 0.75, [26, 20, 12], 1);
      continue;
    }
    const l = r * (5 + rng() * 2.5), a = rng() * Math.PI;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-l / 2 + 1, -r + 1.5, l, r * 2);
    const gr = g.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, '#4c3f26'); gr.addColorStop(0.35, '#8b7a52'); gr.addColorStop(0.5, '#a89670'); gr.addColorStop(1, '#3e3220');
    g.fillStyle = gr; g.fillRect(-l / 2, -r, l, r * 2);
    g.fillStyle = 'rgba(214,200,160,0.8)'; g.fillRect(-l / 2 + r * 0.6, -r * 0.42, l - r * 1.4, Math.max(1, r * 0.22)); // 一道高光
    g.fillStyle = '#2e2516'; g.fillRect(-l / 2, -r * 1.05, r * 0.45, r * 2.1); // 底缘
    g.fillStyle = '#120e08'; g.beginPath(); g.ellipse(l / 2, 0, r * 0.35, r * 0.85, 0, 0, Math.PI * 2); g.fill(); // 口
    g.restore();
  }
}
/** 警戒线：黄底黑斜纹（拉长了也看得出） */
function paintTape(g, W, H, rng) {
  g.fillStyle = '#d9b414'; g.fillRect(0, H * 0.18, W, H * 0.64);
  g.fillStyle = '#1a1a18';
  for (let x = -H; x < W + H; x += H * 1.2) { g.beginPath(); g.moveTo(x, H * 0.82); g.lineTo(x + H * 0.5, H * 0.82); g.lineTo(x + H * 1.0, H * 0.18); g.lineTo(x + H * 0.5, H * 0.18); g.closePath(); g.fill(); }
  g.save(); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 30; i++) drop(g, rng() * W, H * (0.18 + rng() * 0.64), H * 0.05, [0, 0, 0], 0.3); g.restore();
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, H * 0.2, W, H * 0.08);
}
/**
 * 把画布内容按行左右错、按列上下错（两层正弦叠出来的低频抖动）。直接改像素：
 * 用 drawImage 一条一条地挪，画布在显卡和内存之间来回倒，手机上一句字要好几秒。没有像素（测试）就不动
 */
function warp(g, W, H, rng, amp) {
  if (!(amp > 0.5) || typeof g.getImageData !== 'function') return;
  let img = null; try { img = g.getImageData(0, 0, W, H); } catch { img = null; }
  if (!img?.data) return;
  // 频率要低：行与行之间错得太急，笔画边缘就成了撕开的锯齿
  const wave = (a, b) => { const f1 = a + rng() * a, f2 = b + rng() * b, p1 = rng() * 6.3, p2 = rng() * 6.3; return (u) => Math.sin(u * f1 * 6.283 + p1) * 0.7 + Math.sin(u * f2 * 6.283 + p2) * 0.3; };
  const wx = wave(0.7, 1.8), wy = wave(1.5, 4), src = new Uint32Array(img.data.buffer), tmp = new Uint32Array(src.length);
  for (let y = 0; y < H; y++) { const dx = Math.round(wx(y / H) * amp), r = y * W; for (let x = 0; x < W; x++) { const sx = x - dx; tmp[r + x] = sx >= 0 && sx < W ? src[r + sx] : 0; } }
  for (let x = 0; x < W; x++) { const dy = Math.round(wy(x / W) * amp * 0.7); for (let y = 0; y < H; y++) { const sy = y - dy; src[y * W + x] = sy >= 0 && sy < H ? tmp[sy * W + x] : 0; } }
  g.putImageData(img, 0, 0);
}
/**
 * 滚筒刷的白漆（屋顶地上的 SOS）：顺着滚的方向一道道深浅、漆薄的地方露底、边缘被粗糙的地面啃得参差，再落一层灰。
 * 逐像素改透明度和颜色；没有像素（测试）就不动
 */
function rollerPaint(g, W, H, rng) {
  if (typeof g.getImageData !== 'function') return;
  let img = null; try { img = g.getImageData(0, 0, W, H); } catch { img = null; }
  if (!img?.data) return;
  const d = img.data, N = valueNoise(Math.floor(rng() * 1e6));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, a = d[i + 3] / 255; if (a <= 0) continue;
    const u = x / W, v = y / H, streak = N(u * 2, v * 22, 2), thin = N(u * 5 + 3, v * 3, 3), grit = N(u * 60, v * 30, 1), dirt = N(u * 9 + 7, v * 6, 2);
    // 边缘：薄的那圈按噪声断开；里面：一道道的滚痕和几块漆薄的
    const k = smooth(0.35, 0.62, a * 0.75 + grit * 0.45) * (0.55 + 0.45 * smooth(0.25, 0.6, streak)) * (0.6 + 0.4 * smooth(0.3, 0.55, thin));
    d[i + 3] = 255 * Math.min(1, a * k * 1.1);
    const m = 0.78 + 0.2 * dirt - 0.12 * smooth(0.55, 0.8, dirt);
    d[i] *= m; d[i + 1] *= m * 0.98; d[i + 2] *= m * 0.94;
  }
  g.putImageData(img, 0, 0);
}
/** 字体：手写感靠逐字的旋转、大小、高低起伏 */
const FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
/** 「正」字的五笔（单位方格里）：横、中竖、中间短横、左短竖、底横；「丅」是前两笔 */
const ZHENG = [[[0.12, 0.1], [0.88, 0.1]], [[0.5, 0.1], [0.5, 0.92]], [[0.5, 0.5], [0.84, 0.5]], [[0.2, 0.46], [0.2, 0.92]], [[0.03, 0.92], [0.97, 0.92]]];
/**
 * 记号笔一笔：折线上下抖、宽窄随力道变（起笔一个墨点、收笔带出去一点），两头比该停的地方多划出去一截。
 * 字库的字笔画是直的、一样粗，一看就是打印的
 */
function markerStroke(g, ax, ay, bx, by, w, rng) {
  const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L, over0 = L * (rng() * 0.04), over1 = L * (0.03 + rng() * 0.09);
  const x0 = ax - ux * over0, y0 = ay - uy * over0, x1 = bx + ux * over1, y1 = by + uy * over1, n = 6, ph = rng() * 6.3, amp = w * (0.2 + rng() * 0.25), bow = (rng() - 0.5) * w * 1.4;
  const P = []; for (let i = 0; i <= n; i++) { const t = i / n, off = Math.sin(t * 4 + ph) * amp * 0.5 + Math.sin(t * Math.PI) * bow; P.push([x0 + (x1 - x0) * t - uy * off, y0 + (y1 - y0) * t + ux * off]); }
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w * (0.85 + rng() * 0.3);
  g.beginPath(); g.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < n; i++) { const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2; g.quadraticCurveTo(P[i][0], P[i][1], mx, my); }
  g.lineTo(P[n][0], P[n][1]); g.stroke();
  // 收笔笔压轻了：最后一截细一点再画一遍（盖不住的那半边就是变细的尾巴）
  g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = w * 0.35; g.beginPath(); g.moveTo(P[n][0] - uy * w * 0.55, P[n][1] + ux * w * 0.55); g.lineTo(P[n - 1][0] - uy * w * 0.55, P[n - 1][1] + ux * w * 0.55); g.stroke(); g.restore();
  g.beginPath(); g.arc(P[0][0], P[0][1], g.lineWidth * 0.56, 0, Math.PI * 2); g.fill(); // 起笔停顿洇出来的墨点
}
/** 数日子的「正」字：一笔一笔用记号笔画，每个字往右歪一点、大小不一 */
function paintTally(g, W, H, rng, spec) {
  const rgb = [parseInt(spec.color.slice(1, 3), 16), parseInt(spec.color.slice(3, 5), 16), parseInt(spec.color.slice(5, 7), 16)];
  const chars = [...spec.text], cw = (W * 0.92) / chars.length, ch = H * 0.56, w = ch * 0.085, lean = 0.04 + rng() * 0.08;
  g.fillStyle = rgba(rgb, 0.92); g.strokeStyle = rgba(rgb, 0.92);
  chars.forEach((c, i) => {
    const strokes = c === '正' ? ZHENG : ZHENG.slice(0, 2), s = 0.86 + rng() * 0.16;
    g.save(); g.translate(W * 0.05 + cw * (i + 0.5), H * 0.5 + (rng() - 0.5) * H * 0.06 + i * H * 0.012); g.rotate(lean + (rng() - 0.5) * 0.1); g.transform(1, 0, -0.06 - rng() * 0.08, 1, 0, 0);
    const bw = cw * 0.86 * s, bh = ch * s;
    for (const [[ax, ay], [bx, by]] of strokes) markerStroke(g, (ax - 0.5) * bw, (ay - 0.5) * bh, (bx - 0.5) * bw, (by - 0.5) * bh, w, rng);
    g.restore();
  });
  g.save(); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 160; i++) drop(g, rng() * W, rng() * H, 0.5 + rng() * 0.5, [0, 0, 0], 0.4); g.restore();
}
/** 涂鸦：逐字画（每个字转一点、大小高低不一），喷漆带飞沫和往下流的漆，记号笔干净，血字往下淌，白漆有刷痕 */
function* paintGraffiti(g, W, H, rng, spec) {
  if (spec.tally) { paintTally(g, W, H, rng, spec); return; }
  const chars = [...spec.text], arrow = spec.arrow ? 1 : 0, fs0 = H * (spec.latin ? 0.74 : 0.8);
  const style = spec.style, col = spec.color;
  g.font = `${spec.latin ? 900 : 500} ${fs0}px ${FONT}`;
  const widths = chars.map((ch) => (ch === ' ' ? fs0 * 0.35 : g.measureText(ch).width * (spec.latin ? 1.05 : 0.96)));
  const total = widths.reduce((a, b) => a + b, 0) + (arrow ? fs0 * 0.85 : 0);
  const k = Math.min(1, (W * 0.9) / total), fs = fs0 * k;
  g.font = `${spec.latin ? 900 : 500} ${fs}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  let x = (W - total * k) / 2, slope = (rng() - 0.5) * H * 0.12;
  const base = H * 0.5;
  const ink = (rng) => {
    let cx = x;
    chars.forEach((ch, i) => {
      if (ch !== ' ') {
        g.save(); g.translate(cx, base + slope * (cx / W - 0.5) + (rng() - 0.5) * fs * 0.1); g.rotate((rng() - 0.5) * 0.16); g.transform(1, 0, (rng() - 0.6) * 0.3, 1, 0, 0); g.scale(0.88 + rng() * 0.2, 0.9 + rng() * 0.2);
        if (style !== 'paint') { g.lineWidth = fs * (style === 'spray' ? 0.09 : 0.06); g.lineJoin = 'round'; g.strokeStyle = g.fillStyle; g.strokeText(ch, 0, 0); }
        else { g.save(); g.globalAlpha = 0.45; g.lineWidth = fs * 0.07; g.lineJoin = 'round'; g.strokeStyle = g.fillStyle; g.strokeText(ch, 0, 0); g.restore(); } // 滚筒压出边线的那一圈薄漆
        g.fillText(ch, 0, 0); g.restore();
      }
      cx += widths[i] * k;
    });
    if (arrow) {
      const ax = cx + fs * 0.42, ay = base, L = fs * 0.4, dir = spec.arrow === 'down' ? 1 : -1;
      g.save(); g.lineWidth = fs * 0.12; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = g.fillStyle; g.beginPath(); g.moveTo(ax, ay - dir * L); g.lineTo(ax, ay + dir * L); g.moveTo(ax - L * 0.6, ay + dir * L * 0.35); g.lineTo(ax, ay + dir * L); g.lineTo(ax + L * 0.6, ay + dir * L * 0.35); g.stroke(); g.restore();
    }
  };
  const rgb = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
  // 两遍用同一串抖动（同一个种子），虚的那层正好包着实的那层
  const jitter = Math.floor(rng() * 4294967296);
  if (style === 'spray') {
    // 喷漆：先一层虚的（飞散的漆雾），再一层实的
    g.save(); g.shadowColor = rgba(rgb, 0.5); g.shadowBlur = fs * 0.045; g.fillStyle = rgba(rgb, 0.35); ink(mulberry32(jitter)); g.restore();
  }
  g.fillStyle = rgba(rgb, style === 'paint' ? 0.92 : 0.95);
  ink(mulberry32(jitter));
  // 一句话分三步画完（写字 / 抖 / 往下流），每步之间让出这一帧：长句子一口气画完在慢的机器上要几十毫秒
  yield null;
  // 手写的抖：整句字按横条左右错一点、按竖条上下错一点（低频的波），笔画就不再是字库里那么直
  if (style !== 'paint') { warp(g, W, H, rng, fs * 0.035); yield null; }
  // 往下流的漆 / 血：在字的像素里挑几处往下画细线
  if (style === 'spray' || style === 'blood') {
    let img = null; try { img = g.getImageData(0, 0, W, H); } catch { img = null; }
    if (img) {
      const n = style === 'blood' ? 10 : 7;
      for (let t = 0, got = 0; t < 400 && got < n; t++) {
        const px = Math.floor(W * 0.05 + rng() * W * 0.9), py = Math.floor(H * 0.35 + rng() * H * 0.4);
        if (img.data[(py * W + px) * 4 + 3] < 200) continue;
        let yb = py; while (yb < H - 2 && img.data[(yb * W + px) * 4 + 3] > 120) yb++;
        const len = H * (0.06 + rng() * (style === 'blood' ? 0.35 : 0.22)), w = fs * (style === 'blood' ? 0.035 : 0.022);
        g.strokeStyle = rgba(rgb, 0.85); g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(px, yb - 2); g.lineTo(px + (rng() - 0.5) * 2, Math.min(H * 0.96, yb + len)); g.stroke();
        drop(g, px, Math.min(H * 0.96, yb + len), w * 0.75, rgb, 0.85); got++;
      }
    }
  }
  if (style === 'spray') for (let i = 0; i < 260; i++) drop(g, W * (0.04 + rng() * 0.92), H * (0.12 + rng() * 0.76), 0.5 + rng() * 0.9, rgb, 0.12 + rng() * 0.2);
  if (style === 'paint') rollerPaint(g, W, H, rng);
  if (style === 'marker') { g.save(); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 120; i++) drop(g, rng() * W, rng() * H, 0.6, [0, 0, 0], 0.35); g.restore(); }
}

/** 要先画在单独小画布上的格子（逐像素写的） */
const OFFSCREEN = new Set(['scorch', 'burn', 'handL', 'handR', 'handDrag']);
const PAINTERS = {
  pool0: paintPool, pool1: paintPool, splat0: paintSplat, splat1: paintSplat, holes: paintHoles, scorch: paintScorch, burn: paintBurn, drag: paintDrag, smear: paintSmear,
  trail: paintTrail, handDrag: paintHandDrag,
  glass: paintGlass, debris: paintDebris, tape: paintTape, drops: paintDrops, phone: paintPhone, casings: paintCasings, shoe: paintShoe, bag: paintBag,
  handL: (g, W, H, r) => paintHand(g, W, H, r, false), handR: (g, W, H, r) => paintHand(g, W, H, r, true),
  footL: (g, W, H, r) => paintFoot(g, W, H, r, false), footR: (g, W, H, r) => paintFoot(g, W, H, r, true),
  paper0: (g, W, H, r) => paintPaper(g, W, H, r, 0), paper1: (g, W, H, r) => paintPaper(g, W, H, r, 1),
};

/**
 * 画图集（生成器：每画完一格 yield 一次格子名；涂鸦一句分几步画，中间 yield null）。g 是 size × size 画布的 2D 上下文。
 * 每格四周留几个像素的透明边：mipmap 缩小时不会把隔壁格子的颜色混进来。
 */
export function* paintAtlas(g, size, seed = 1) {
  const unit = size / ROUTE_DRESS.grid, pad = Math.max(2, Math.round(unit * 0.06));
  g.clearRect(0, 0, size, size);
  for (const [name, [cx, cy, cw, ch]] of Object.entries(ATLAS_CELLS)) {
    const x = cx * unit + pad, y = cy * unit + pad, W = cw * unit - pad * 2, H = ch * unit - pad * 2, rng = mulberry32(seed ^ hashString(name));
    g.save(); g.beginPath(); g.rect(x, y, W, H); g.clip(); g.translate(x, y);
    try {
      if (GRAFFITI[name] || OFFSCREEN.has(name)) {
        // 涂鸦要读回像素找往下流的位置、烟熏逐像素写：先画在一张小画布上，再贴进图集
        const doc = g.canvas?.ownerDocument || (typeof document !== 'undefined' ? document : null), c = doc?.createElement('canvas');
        if (c) {
          c.width = W; c.height = H; const q = c.getContext('2d', { willReadFrequently: true });
          if (GRAFFITI[name]) yield* paintGraffiti(q, W, H, rng, GRAFFITI[name]); else PAINTERS[name](q, W, H, rng);
          g.drawImage(c, 0, 0); c.width = c.height = 1;
        }
      } else PAINTERS[name]?.(g, W, H, rng);
    } finally { g.restore(); }
    yield name;
  }
}

// ---------------------------------------------------------------------------
// 材质：MeshStandardMaterial 加几行——逐实例的 UV、透明度、光泽方式、深度前移

function makeMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.86, metalness: 0, premultipliedAlpha: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  m.name = 'siege-route-dressing';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 dUv;\nattribute vec4 dPar;\nvarying vec3 vDPar;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = dUv.xy + uv * dUv.zw;\n#endif\nvDPar = vec3(dPar.xy, dPar.w > 0.0 ? dPar.w : 1.0);')
      // 深度朝镜头挪 dPar.z 米：沿视线挪，屏幕上的位置不变，光照、雾还按原来的位置算
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ float dl = length(mvPosition.xyz); vec4 mvP = mvPosition; mvP.xyz *= max(0.25, 1.0 - dPar.z / max(dl, 1e-3)); gl_Position = projectionMatrix * mvP; }');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDPar;')
      // 图集按预乘透明度上传（mipmap 边缘不发黑）：这里先还原成直的颜色，三角形的预乘输出在最后再乘回去
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb /= max(diffuseColor.a, 1e-3);\ndiffuseColor.a *= vDPar.y;\ndiffuseColor.rgb *= vDPar.z;\nfloat dGloss = 0.0;\nif (vDPar.x > 1.5) dGloss = 0.9 * smoothstep(0.05, 0.6, diffuseColor.a);\nelse if (vDPar.x > 0.5) { float gr = diffuseColor.g / max(diffuseColor.r, 1e-3); dGloss = (1.0 - smoothstep(0.05, 0.2, gr)) * smoothstep(0.004, 0.02, diffuseColor.r) * smoothstep(0.55, 0.85, diffuseColor.a); }')
      // 新鲜的血、玻璃、手机屏：粗糙度压低（手电一照有高光）；干了的褐色边缘、纸、墙上的东西照旧粗糙
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.14, dGloss);');
  };
  m.customProgramCacheKey = () => 'siege-route-dressing-v2';
  return m;
}

// ---------------------------------------------------------------------------
// 接到游戏上

/**
 * G：游戏上下文（G.siege、G.game、G.pathfinder）；scene；nav、layout、runs（stairs.runs）；
 * explore()：现在显示哪一层（app.state.explore：{ level, prefer, elevator }），按它挑要画的贴花。
 * 返回 { update(dt), dispose(), stats, mesh }。没有 document（node 测试）时什么都不建，update / dispose 都是空操作。
 */
export function createRouteDressing(G, { scene, nav, layout, runs = [], explore = () => null, renderer = null, mem = () => MEM, doc = typeof document === 'undefined' ? null : document } = {}) {
  const stats = { items: 0, active: 0, clusters: 0, atlas: 0, bytes: 0, buildMs: 0, worstMs: 0, paintMs: 0, builds: 0, drawCalls: 0 };
  if (!doc || !scene) return { update() {}, dispose() {}, stats, mesh: null, get ready() { return false; } };
  const root = new THREE.Group(); root.name = '丧尸围城沿途痕迹'; scene.add(root);
  const geo = new THREE.PlaneGeometry(1, 1);
  // 占位贴图（1 × 1 透明）：开局预热着色器时就把这个材质编译好，第一次出现不卡一下
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); blank.needsUpdate = true;
  const mat = makeMaterial(blank);
  const cap = ROUTE_DRESS.maxItems;
  const aUv = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4), aPar = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  aUv.setUsage(THREE.DynamicDrawUsage); aPar.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('dUv', aUv); geo.setAttribute('dPar', aPar);
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'route-dressing';
  mesh.raycast = () => {}; // 只是画面：子弹、视线、点选都不碰它
  mesh.renderOrder = 2;
  mesh.visible = false; root.add(mesh);
  let atlas = null, canvas = null, painter = null, planner = null, built = null, plan = null, clusters = new Map(), key = '', legs = null, legWait = 0, pending = 0;

  function freeAtlas() {
    if (atlas) { atlas.dispose(); atlas = null; }
    if (canvas) { canvas.width = canvas.height = 1; canvas = null; }
    painter = null; mat.map = blank; stats.atlas = 0; stats.bytes = 0;
  }
  function clearPlan() { planner = null; built = null; plan = null; legs = null; clusters = new Map(); key = ''; mesh.count = 0; mesh.visible = false; stats.items = stats.active = stats.clusters = 0; }

  /** 开始画图集（一局里只画一次；档位变了重画） */
  function startAtlas() {
    const size = atlasSize(mem());
    if (!size) return;
    canvas = doc.createElement('canvas'); canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    if (!g) { canvas = null; return; }
    painter = { gen: paintAtlas(g, size, 0x51e6e), size, t0: 0 };
  }
  function finishAtlas() {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.premultiplyAlpha = true; tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    // 传上显卡以后画布就不要了（iOS 上画布内存有总量限制）
    const cv = canvas;
    tex.onUpdate = () => { tex.onUpdate = null; tex.image = { width: cv.width, height: cv.height }; cv.width = cv.height = 1; };
    atlas = tex; mat.map = tex;
    stats.atlas = painter.size; stats.bytes = Math.round(painter.size * painter.size * 4 * 4 / 3);
    canvas = null; painter = null;
  }

  /** 这一局的走廊路线：交给分帧寻路，等不到就用直线 */
  function requestLegs(p) {
    const list = routeLegs(p, nav, layout), out = {};
    pending = list.length; legWait = 0;
    for (const leg of list) {
      // 寻路失败（null）记成空路线：不在走廊里乱撒（直线会穿墙），只留门口那几样
      const done = (path) => { if (legs !== out) return; out[leg.key] = path && path.length > 1 ? path : []; pending--; };
      if (G.pathfinder?.request) G.pathfinder.request(leg.from, leg.to, done);
      else done(null);
    }
    legs = out; legs.__list = list;
  }

  function startPlan(p) {
    clearPlan(); plan = p;
    requestLegs(p);
  }

  /** 按层分组：每层一组实例数据（矩阵、UV、参数、到第几步为止），换层、过了一道关时拷进实例缓冲 */
  function group(items) {
    const by = new Map();
    for (const it of items) { if (!by.has(it.lv)) by.set(it.lv, []); by.get(it.lv).push(it); }
    const out = new Map();
    for (const [lv, list] of by) {
      const n = list.length, m = new Float32Array(n * 16), uv = new Float32Array(n * 4), par = new Float32Array(n * 4), until = new Int16Array(n);
      list.forEach((it, i) => { itemMatrix(it, m, i * 16); uv.set(cellUv(it.cell), i * 4); par.set([it.mode, it.alpha, it.pull, it.tone ?? 1], i * 4); until[i] = it.until ?? -1; });
      out.set(lv, { n, m, uv, par, until, gated: until.some((u) => u >= 0) });
    }
    return out;
  }
  function activeKey() {
    const ex = explore?.() || null;
    if (!ex) return '';
    const ids = new Set([ex.level, ex.prefer, ex.elevator?.from, ex.elevator?.to].filter(Boolean));
    // 关卡解决了（门开了），贴在门扇上的那几个要撤掉：步数也算进键里
    return [...ids].sort().join('|') + `#${G.siege?.state?.stage ?? 0}`;
  }
  function sync() {
    const k = activeKey();
    if (k === key) return;
    key = k;
    const stage = G.siege?.state?.stage ?? 0;
    let n = 0;
    for (const id of k.split('#')[0].split('|')) {
      const c = clusters.get(id); if (!c) continue;
      if (!c.gated) {
        const take = Math.min(c.n, cap - n); if (take <= 0) break;
        mesh.instanceMatrix.array.set(c.m.subarray(0, take * 16), n * 16); aUv.array.set(c.uv.subarray(0, take * 4), n * 4); aPar.array.set(c.par.subarray(0, take * 4), n * 4);
        n += take; continue;
      }
      for (let i = 0; i < c.n && n < cap; i++) {
        if (c.until[i] >= 0 && stage > c.until[i]) continue;
        mesh.instanceMatrix.array.set(c.m.subarray(i * 16, i * 16 + 16), n * 16); aUv.array.set(c.uv.subarray(i * 4, i * 4 + 4), n * 4); aPar.array.set(c.par.subarray(i * 4, i * 4 + 4), n * 4);
        n++;
      }
    }
    mesh.count = n; stats.active = n;
    if (n) {
      mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true;
      for (const [a, s] of [[aUv, 4], [aPar, 4]]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * s); a.needsUpdate = true; }
      mesh.computeBoundingSphere();
    }
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function step(budget) {
    const t0 = now(), end = t0 + budget;
    if (painter) {
      const p0 = now();
      while (now() < end) { const r = painter.gen.next(); if (r.done) { finishAtlas(); break; } }
      stats.paintMs += now() - p0;
    }
    if (plan && !planner && !built && legs && (pending <= 0 || legWait > ROUTE_DRESS.pathWait)) {
      // 等不到的路线按直线
      for (const leg of legs.__list || []) if (!legs[leg.key]) legs[leg.key] = [];
      const sp = G.level?.playerStart?.pos;
      planner = planDressing({ plan, nav, layout, runs, rng: mulberry32(dressSeed(plan)), legs, density: densityFor(mem()), start: sp ? { x: sp.x, z: sp.z } : null });
    }
    if (planner) {
      const p0 = now();
      while (now() < end) { const r = planner.next(); if (r.done) { built = r.value || []; planner = null; clusters = group(built); stats.items = built.length; stats.clusters = clusters.size; stats.builds++; key = ''; break; } }
      stats.buildMs += now() - p0;
    }
    stats.worstMs = Math.max(stats.worstMs, now() - t0);
  }

  return {
    stats, mesh,
    get ready() { return !!(built && atlas); },
    /** 这一局摆好的贴花、用的导航（调试、实拍用；只读） */
    get items() { return built; },
    nav,
    update(dt) {
      const siege = G.siege, on = !!siege?.enabled && !!siege?.plan;
      if (!on) { if (plan || atlas || painter) { clearPlan(); freeAtlas(); } return; }
      // 开局以后才算（标题画面上算的路线会被开局时的寻路重置清掉）
      if (siege.plan !== plan && G.game?.state !== 'title') startPlan(siege.plan);
      if (!atlas && !painter) startAtlas();
      if (painter && painter.size !== atlasSize(mem())) { freeAtlas(); startAtlas(); }
      legWait += dt || 0;
      if (painter || planner || (!built && plan)) step(ROUTE_DRESS.budget);
      if (!plan) { mesh.visible = false; return; }
      const show = !!(built && atlas) && G.game?.state !== 'title';
      if (show) sync();
      mesh.visible = show && mesh.count > 0;
      stats.drawCalls = mesh.visible ? 1 : 0;
    },
    dispose() { clearPlan(); freeAtlas(); root.removeFromParent(); geo.dispose(); mat.dispose(); blank.dispose(); },
  };
}
