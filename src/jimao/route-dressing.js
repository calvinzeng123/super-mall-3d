// 丧尸围城的「沿途痕迹」：停电两个小时以前这里出过事——玩家一路走过的地方（商场保安室、地下一层电梯厅、
// 三道关所在楼层的楼梯间和走廊、放工具的那一户、关卡上面那段楼梯、屋顶出口）留下血迹、拖痕、手印、弹孔、
// 散落的纸张碎玻璃、丢下的手机、警戒线和幸存者的涂鸦。以前这一路全是干干净净的白墙，一点不像出过事。
//
// 怎么做的（都只是画面，不碰导航、碰撞、射击判定）：
//   1. 每局的关卡计划（siege.plan）一定下来，按导航数据找落点：地面用 landAt / clear（站得住、离墙够远、和热点在同一个房间里），
//      墙面用导航里的墙段（家具、门扇这些障碍物的边不算墙；墙前 0.2 米有家具的也不贴）。
//      场景几何体上传显卡以后顶点数组就释放了（app.js 的 releaseGeometryAfterUpload），没法对着模型打射线，所以落点全靠导航。
//      导航的墙线有的在墙中线、有的在墙的外皮（楼梯间的墙往里收 0.2 米），贴花放在墙线外 0.1 米，
//      着色器里再把深度朝镜头挪一点（屏幕上的位置不变）：真墙面在墙线前后 0.1 米以内都能盖住，不会被墙吞掉。
//   2. 全部贴花共用一张程序画的图集（血泊、溅血、拖痕、手印、鞋印、弹孔、焦痕、碎玻璃、碎石灰、纸、手机、弹壳、警戒线、涂鸦），
//      一个 InstancedMesh 画完（1 次绘制调用）。图集每格的 UV、透明度、光泽、深度偏移都是逐实例的属性。
//      新鲜的血（暗红、几乎不含绿）在着色器里变光滑，干了的褐色边缘是粗糙的——同一张图，不用另画一张粗糙度图。
//   3. 只画玩家所在的那一层（和楼梯口要预搭的那一层）：别的楼层没搭内装时贴花不会悬在半空；顶点也少。
//   4. 落点计算和画图集都切成小步，每帧最多几毫秒（update 里推进），开局不卡；走廊那几段路线交给分帧寻路（pathfinder）。
//   5. 同一局（同一个计划）结果完全一样（种子来自计划本身）；换一局、换一栋楼重算；退出丧尸围城释放图集和缓冲。
import * as THREE from 'three';
import { landAt, clear, supported } from '../layout/nav.js';
import { pointInPoly } from '../layout/geom.js';
import { lobbySpot } from './siege.js';
import { doorOutside } from './guide.js';
import { MEM } from '../render/device.js';

export const ROUTE_DRESS = Object.freeze({
  grid: 16,              // 图集按 16 × 16 小格排（1024 图集一格 64 像素）
  budget: 4,             // 每帧最多算几毫秒
  wallOff: 0.1,          // 墙面贴花离导航墙线多远（墙线在墙中线时正好贴在 0.2 米厚墙的表面）
  wallPull: 0.13,        // 墙面贴花的深度朝镜头挪多少米（屏幕位置不变）：真墙面在墙线外 0~0.2 米都盖得住
  floorLift: 0.006,      // 地面贴花离楼面多高
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
  holes: [0, 4, 4, 4], scorch: [4, 4, 4, 4], gInfected: [8, 4, 8, 2], gRoof: [8, 6, 8, 2],
  drag: [0, 8, 8, 2], gPower: [8, 8, 8, 2],
  gStairs: [0, 10, 8, 2], glass: [8, 10, 4, 2], debris: [12, 10, 4, 2],
  gHelp: [0, 12, 4, 2], gSos: [4, 12, 4, 2], gTally: [8, 12, 4, 2], smear: [12, 12, 4, 1], tape: [12, 13, 4, 1],
  handL: [0, 14, 2, 2], handR: [2, 14, 2, 2], footL: [4, 14, 2, 2], footR: [6, 14, 2, 2], drops: [8, 14, 2, 2],
  paper0: [10, 14, 2, 2], paper1: [12, 14, 2, 2], phone: [14, 14, 1, 2], casings: [15, 14, 1, 2],
});

/** 涂鸦写什么、用什么画：spray 喷漆（有飞沫、往下流）、marker 记号笔、blood 手指蘸血、paint 刷子刷的白漆（屋顶地面） */
export const GRAFFITI = Object.freeze({
  gInfected: Object.freeze({ text: '里面有感染者', style: 'spray', color: '#a3170f', cross: true }),
  gRoof: Object.freeze({ text: '往楼顶走', arrow: 'up', style: 'spray', color: '#151515' }),
  gPower: Object.freeze({ text: 'B1 有电', arrow: 'down', style: 'spray', color: '#a3170f' }),
  gStairs: Object.freeze({ text: '别上楼！', style: 'spray', color: '#a3170f' }),
  gHelp: Object.freeze({ text: '救命', style: 'blood', color: '#5a0507' }),
  gSos: Object.freeze({ text: 'SOS', style: 'paint', color: '#e4e1d8', latin: true }),
  gTally: Object.freeze({ text: '正正正丅', style: 'marker', color: '#1b1b1b' }),
});

/** 实例的光泽方式：0 哑光；1 按颜色认新鲜血（暗红变亮滑）；2 整块光滑（玻璃、手机屏、弹壳） */
const MATTE = 0, BLOOD = 1, GLOSS = 2;

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
export function createPlacer({ nav, rng, items = [], avoid = [], density = 1 }) {
  const obstacleEdges = new Map();
  const edgesOf = (F) => {
    let s = obstacleEdges.get(F.id);
    if (!s) {
      s = new Set();
      for (const o of F.obstacles) for (const P of [o.outer, ...(o.holes || []).map((h) => h.poly)]) for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s.add(edgeKey(a[0], a[1], b[0], b[1])); }
      obstacleEdges.set(F.id, s);
    }
    return s;
  };
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const range = (a, b) => a + (b - a) * rng();
  const count = (n) => { const v = n * density; return Math.floor(v) + (rng() < v - Math.floor(v) ? 1 : 0); };

  /** 热点：一层楼上的一个中心点和半径。返回在这个热点上放东西的方法 */
  function spot(floorId, cx, cz, R, { level = null } = {}) {
    const F = nav.floors.get(floorId);
    if (!F) return null;
    const lv = level || levelOf(nav, floorId), y = F.y;
    const edges = edgesOf(F), walls = [], usable = [], obst = [];
    const box = (x0, z0, x1, z1, pad) => !(x0 > cx + pad || x1 < cx - pad || z0 > cz + pad || z1 < cz - pad);
    for (const w of F.walls) {
      if (w.gate?.open) continue; // 开着的门扇不是墙
      if (!box(Math.min(w.x0, w.x1), Math.min(w.z0, w.z1), Math.max(w.x0, w.x1), Math.max(w.z0, w.z1), R + 1.5)) continue;
      walls.push(w);
      const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
      // 能贴的墙：够长、不是矮掩体（沙袋墙有 top）、不是门禁闸门、不是家具 / 门扇的轮廓
      if (len >= 0.9 && !w.top && !w.gate && !edges.has(edgeKey(w.x0, w.z0, w.x1, w.z1))) usable.push({ w, len });
    }
    for (const o of F.obstacles) if (box(o.bb.x0, o.bb.z0, o.bb.x1, o.bb.z1, R + 1.5)) obst.push(o);
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
    function addFloor(cell, x, z, size, { a = rng() * Math.PI * 2, mode = MATTE, alpha = 1, h = null } = {}) {
      const ax = floorAxes(a);
      items.push({ lv, cell, p: [x, y + ROUTE_DRESS.floorLift, z], ...ax, w: size, h: h ?? size * cellAspect(cell), mode, alpha, pull: ROUTE_DRESS.floorPull });
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
        addFloor(side < 0 ? 'footL' : 'footR', x, z, size, { a, mode: BLOOD, alpha: fade ? Math.max(0.25, 0.95 - i * 0.09) : range(0.6, 0.9) });
        put++;
      }
      return put;
    }
    /** 拖痕：从 (x, z) 沿 a 方向拖 len 米（一段 2.2 米，长的接着画下一段）。路过墙、家具就停 */
    function drag(x, z, a, len = 2.2, { alpha = 0.9 } = {}) {
      const fx = Math.sin(a), fz = Math.cos(a), seg = 2.1;
      let put = 0;
      for (let d = 0; d < len - 0.3; d += seg * 0.92) {
        const mx = x + fx * (d + seg / 2), mz = z + fz * (d + seg / 2), ex = x + fx * (d + seg), ez = z + fz * (d + seg);
        const ok = [[x + fx * d, z + fz * d], [mx, mz], [ex, ez]].every(([px, pz]) => { const st = landAt(nav, px, pz, y + 0.6); return st && st.floor === floorId && Math.abs(st.y - y) < 0.05 && !inObstacle(px, pz) && wallGap(px, pz) > 0.22; });
        if (!ok || blocked(x, z, ex, ez)) break;
        // 拖痕格子横着画（x 方向长）：图的「右」顺着拖的方向
        addFloor('drag', mx, mz, seg, { a: a + Math.PI / 2, mode: BLOOD, alpha: alpha * (d ? 0.8 : 1), h: seg * cellAspect('drag') * 1.15 });
        put++;
      }
      return put;
    }

    /** 墙上一处：返回 { x, z, nx, nz, w }（贴花中心在墙线上的位置和朝走道的法线），找不到返回 null */
    function wallPoint(width, { r1 = R, prefer = null, minLen = 0 } = {}) {
      const list = usable.filter((q) => q.len >= Math.max(minLen, width + 2 * ROUTE_DRESS.margin) && segDist(cx, cz, q.w) < r1);
      for (let k = 0; k < 16 && list.length; k++) {
        const { w, len } = prefer ? list.reduce((a, b) => (prefer(a) > prefer(b) ? a : b)) : pick(list);
        const dx = (w.x1 - w.x0) / len, dz = (w.z1 - w.z0) / len;
        // 墙段上取一点：离两头至少 margin + 半宽（门洞、转角不贴）
        const m = ROUTE_DRESS.margin + width / 2, t = m + (len - 2 * m) * rng();
        const px = w.x0 + dx * t, pz = w.z0 + dz * t;
        // 法线朝哪边：那一侧 0.45 米处有楼板（走道 / 房间）的那边；两边都有就朝热点
        let nx = -dz, nz = dx;
        const sideA = supported(F, px + nx * 0.45, pz + nz * 0.45), sideB = supported(F, px - nx * 0.45, pz - nz * 0.45);
        if (!sideA && !sideB) { if (prefer) list.splice(list.findIndex((q) => q.w === w), 1); continue; }
        if (!sideA || (sideB && (cx - px) * nx + (cz - pz) * nz < 0)) { nx = -nx; nz = -nz; }
        // 热点看得见这面墙（同一个房间 / 走廊里），墙前面没有家具、门扇挡着
        const fx = px + nx * 0.06, fz = pz + nz * 0.06;
        if (Math.hypot(fx - cx, fz - cz) > r1 || blocked(cx, cz, fx, fz, w)) { if (prefer) list.splice(list.findIndex((q) => q.w === w), 1); continue; }
        let free = !avoid.some((a) => a.wall && (!a.floor || a.floor === floorId) && Math.hypot(a.x - px, a.z - pz) < a.wall + width / 2);
        for (const s of [-0.5, 0, 0.5]) for (const d of [0.2, 0.42]) if (inObstacle(px + dx * s * width + nx * d, pz + dz * s * width + nz * d)) free = false;
        if (!free) { if (prefer) list.splice(list.findIndex((q) => q.w === w), 1); continue; }
        return { x: px, z: pz, nx, nz, w, t, len, dx, dz };
      }
      return null;
    }
    function addWall(cell, q, size, yc, { phi = 0, mode = MATTE, alpha = 1, h = null, off = ROUTE_DRESS.wallOff, pull = ROUTE_DRESS.wallPull } = {}) {
      const ax = wallAxes(q.nx, q.nz, phi);
      items.push({ lv, cell, p: [q.x + q.nx * off, y + yc, q.z + q.nz * off], ...ax, w: size, h: h ?? size * cellAspect(cell), mode, alpha, pull });
      return items[items.length - 1];
    }
    /** 墙上贴 n 个：高度 yc = [低, 高]（贴花中心离地） */
    function wall(cells, n, { size = [0.25, 0.4], yc = [0.9, 1.5], mode = MATTE, alpha = [0.85, 1], tilt = 0.25, r1 = R, keep = false, prefer = null } = {}) {
      let put = 0;
      for (let i = 0, want = keep ? n : count(n); i < want; i++) {
        const cell = Array.isArray(cells) ? pick(cells) : cells, s = range(size[0], size[1]), hgt = s * cellAspect(cell);
        const q = wallPoint(s, { r1, prefer });
        if (!q) continue;
        // 贴花上沿不过 2.3 米（天花板 2.6~2.9），下沿不进踢脚线
        const c = Math.min(2.3 - hgt / 2, Math.max(0.14 + hgt / 2, range(yc[0], yc[1])));
        addWall(cell, q, s, c, { phi: range(-tilt, tilt), mode, alpha: range(alpha[0], alpha[1]) }); put++;
      }
      return put;
    }
    return { F, lv, y, walls: usable, floor, footsteps, drag, wall, wallPoint, addWall, addFloor, floorPoint, wallGap, inObstacle, range, pick, count };
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
export function* planDressing({ plan, nav, layout, runs = [], rng = Math.random, legs = {}, density = 1 }) {
  const items = [];
  if (!plan?.stages?.length) return items;
  const avoid = [];
  // 关卡的大件（杂物堆、火、配电箱、防火门）占的地方：地面贴花不压进去
  for (const g of plan.gates || []) if (g.model) avoid.push({ floor: g.floor, x: g.model.x, z: g.model.z, r: 1.25, wall: 0.9 });
  // 电梯门口：门是会动的，墙上、地上都不贴（候梯厅里的血留到离门一米多的地方）
  const tower = plan.tower, lift = tower ? nav.links.find((l) => l.id === tower.lift) : null;
  for (const s of lift?.stops || []) avoid.push({ floor: s.floor, x: s.x, z: s.z, r: 0.9, wall: 1.3 });
  // 每一步的目标物件（武器柜、配电柜、工具、信号弹）站的地方：地上不压、背后的墙也不贴（深度前移会盖到物件上）
  for (const st of plan.stages) if (st.site) avoid.push({ floor: st.floor, x: st.site.x, z: st.site.z, r: 0.7, wall: 1.4 });
  const P = createPlacer({ nav, rng, items, avoid, density });
  const { range, pick } = P;
  const stage = (id) => plan.stages.find((s) => s.id === id);

  // ---- 1. 商场保安室：守在这儿的保安打过一仗——墙上成片弹孔，地上弹壳、一大滩血拖进角落，「B1 有电」 ----
  const arms = stage('arms');
  if (arms) {
    const S = P.spot(arms.floor, arms.site.x, arms.site.z, 8);
    if (S) {
      S.wall('holes', 4, { size: [0.55, 0.8], yc: [0.9, 1.6], tilt: 0.6 });
      S.wall(['splat0', 'splat1'], 1, { size: [0.7, 1.0], yc: [0.8, 1.3], mode: BLOOD });
      S.wall(['handL', 'handR'], 2, { size: [0.2, 0.24], yc: [0.9, 1.4], mode: BLOOD, r1: 5 });
      S.wall('gPower', 1, { size: [1.5, 1.7], yc: [1.4, 1.6], tilt: 0.05, keep: true, prefer: (q) => q.len });
      S.floor('casings', 9, { r1: 3, size: [0.09, 0.12], mode: GLOSS, gap: 0.2 });
      const pool = S.floorPoint(1.2, 4, 0.6);
      if (pool) { S.addFloor(pick(['pool0', 'pool1']), pool[0], pool[1], range(1.1, 1.5), { mode: BLOOD }); S.drag(pool[0], pool[1], Math.atan2(pool[0] - arms.site.x, pool[1] - arms.site.z), 3); }
      S.floor(['paper0', 'paper1'], 6, { r1: 5, size: [0.3, 0.36] });
      S.floor('glass', 1, { r1: 4, size: [0.9, 1.1], mode: GLOSS, alpha: [0.8, 1] });
      S.floor('drops', 4, { r1: 5, size: [0.2, 0.3], mode: BLOOD });
      S.floor('phone', 1, { r1: 4, size: [0.085, 0.09], mode: GLOSS, keep: true });
      const a = S.floorPoint(1, 3, 0.4), b = S.floorPoint(5, 7.5, 0.4);
      if (a && b) S.footsteps(a[0], a[1], b[0], b[1], { n: 9 });
    }
    yield;
  }

  // ---- 2. 地下一层电梯厅：人往电梯跑——拖痕、墙上手印抹痕、「往楼顶走」 ----
  const power = stage('power');
  if (power) {
    const S = P.spot(power.floor, power.site.x, power.site.z, 7);
    if (S) {
      S.wall(['handL', 'handR'], 3, { size: [0.2, 0.25], yc: [0.8, 1.5], mode: BLOOD, r1: 5 });
      S.wall('smear', 1, { size: [0.8, 1.0], yc: [1.0, 1.25], mode: BLOOD, tilt: 0.15 });
      S.wall(['splat0', 'splat1'], 1, { size: [0.7, 1.0], yc: [0.7, 1.3], mode: BLOOD });
      S.wall('gRoof', 1, { size: [1.5, 1.7], yc: [1.4, 1.6], tilt: 0.05, keep: true, prefer: (q) => q.len });
      S.wall('holes', 1, { size: [0.5, 0.7], yc: [1.0, 1.6], tilt: 0.6 });
      const pool = S.floorPoint(1.5, 4.5, 0.7);
      if (pool) { S.addFloor(pick(['pool0', 'pool1']), pool[0], pool[1], range(1.0, 1.4), { mode: BLOOD }); S.drag(pool[0], pool[1], rng() * Math.PI * 2, 4.4); }
      S.floor('drops', 5, { r1: 6, size: [0.2, 0.32], mode: BLOOD });
      S.floor(['paper0', 'paper1'], 3, { r1: 6, size: [0.3, 0.36] });
      S.floor('glass', 1, { r1: 5, size: [0.8, 1.0], mode: GLOSS });
      const a = S.floorPoint(0.5, 2, 0.4), b = S.floorPoint(4, 6.5, 0.4);
      if (a && b) S.footsteps(a[0], a[1], b[0], b[1], { n: 8 });
    }
    yield;
  }

  // ---- 3. 每道关那一层 ----
  const words = ['gStairs', 'gTally', 'gRoof']; // 第几道关：「别上楼！」「正正正丅」（数日子）「往楼顶走」
  for (const g of plan.gates || []) {
    const i = (plan.gates || []).indexOf(g), gate = plan.stages[g.stage], tool = plan.stages[g.stage - 1];
    // 3a. 楼梯口（关卡）：类型不同，痕迹不同
    const S = P.spot(gate.floor, gate.site.x, gate.site.z, 5);
    if (S) {
      if (g.type === 'lock') { // 防火门反锁：有人拼命拍门——门边一片血手印、往下抹的手指印
        S.wall(['handL', 'handR'], 6, { size: [0.19, 0.24], yc: [0.9, 1.7], mode: BLOOD, r1: 3, tilt: 0.5 });
        S.wall('smear', 2, { size: [0.7, 0.9], yc: [0.9, 1.4], mode: BLOOD, tilt: 1.2, r1: 3 });
      } else if (g.type === 'debris') { // 杂物堵楼梯：有人在这儿守过——弹孔、碎石灰
        S.wall('holes', 2, { size: [0.55, 0.75], yc: [0.9, 1.7], tilt: 0.6, r1: 4 });
        S.floor('debris', 3, { r1: 3, size: [0.9, 1.2], alpha: [0.8, 1] });
        S.floor('casings', 5, { r1: 3, size: [0.09, 0.12], mode: GLOSS, gap: 0.2 });
      } else if (g.type === 'fire') { // 楼梯间着火：熏黑的墙、烧过的碎屑
        S.wall('scorch', 2, { size: [1.6, 2.1], yc: [1.15, 1.25], tilt: 0.05, r1: 3.5, alpha: [0.8, 0.95] });
        S.floor('scorch', 1, { r1: 2.5, size: [1.4, 1.8], alpha: [0.6, 0.8] });
        S.floor('debris', 2, { r1: 3, size: [0.8, 1.0], alpha: [0.7, 0.9] });
      } else { // 配电箱跳闸：电梯厅里的人想撬开电动栅门
        S.wall(['handL', 'handR'], 3, { size: [0.19, 0.24], yc: [0.9, 1.6], mode: BLOOD, r1: 3.5 });
        S.wall('smear', 1, { size: [0.7, 0.9], yc: [1.0, 1.3], mode: BLOOD, r1: 3.5 });
        S.floor('glass', 1, { r1: 3, size: [0.8, 1.0], mode: GLOSS });
      }
      S.wall(words[i % words.length], 1, { size: words[i % words.length] === 'gTally' ? [0.8, 0.9] : [1.4, 1.6], yc: [1.4, 1.6], tilt: 0.05, keep: true, prefer: (q) => q.len - segDist(gate.site.x, gate.site.z, q.w) * 0.5 });
      S.wall(['splat0', 'splat1'], 1, { size: [0.6, 0.9], yc: [0.7, 1.3], mode: BLOOD, r1: 4 });
      const pool = S.floorPoint(0.8, 3.2, 0.55);
      if (pool) S.addFloor(pick(['pool0', 'pool1']), pool[0], pool[1], range(0.8, 1.15), { mode: BLOOD, alpha: 0.95 });
      S.floor('drops', 5, { r1: 4, size: [0.2, 0.3], mode: BLOOD });
      S.floor(['paper0', 'paper1'], 2, { r1: 4, size: [0.3, 0.36] });
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
      for (const q of line) {
        if (rng() > 0.16 * density) continue;
        const a = rng() * Math.PI * 2, d = range(0, 0.45), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d;
        const st = landAt(nav, x, z, C.y + 0.6);
        if (st && st.floor === gate.floor && !C.inObstacle(x, z) && C.wallGap(x, z) > 0.2) C.addFloor('drops', x, z, range(0.18, 0.28), { mode: BLOOD, alpha: range(0.6, 0.95) });
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
        const pool = T.floorPoint(0.8, 3, 0.6);
        if (pool) T.addFloor(pick(['pool0', 'pool1']), pool[0], pool[1], range(0.9, 1.3), { mode: BLOOD, alpha: 0.92 });
        T.floor(['paper0', 'paper1'], 4, { r1: 3.5, size: [0.3, 0.36] });
        T.floor('phone', 1, { r1: 3, size: [0.085, 0.09], mode: GLOSS, keep: true });
        T.floor('glass', 1, { r1: 3.5, size: [0.8, 1.0], mode: GLOSS });
        T.floor('drops', 3, { r1: 3.5, size: [0.2, 0.3], mode: BLOOD });
        if (i === 1) T.wall('gHelp', 1, { size: [0.8, 0.9], yc: [1.2, 1.45], mode: BLOOD, tilt: 0.08, keep: true });
        T.wall(['splat0', 'splat1', 'handL', 'handR'], 2, { size: [0.22, 0.7], yc: [0.8, 1.4], mode: BLOOD });
      }
      yield;
    }
    // 3d. 别的住户门口：门上打着 X 形警戒线，旁边喷着「里面有感染者」（每局挑一户，离路线不太远）
    if (i === 0 || rng() < 0.7) {
      const lv = layout.levels.find((l) => l.id === gate.floor);
      const units = (lv?.units || []).filter((u) => u.id !== tool?.site?.unit && u.wfronts?.length && u.residence?.entryDoor && u.residence?.level !== 'upper');
      const ref = tool?.site || gate.site, sorted = units.map((u) => ({ u, d: doorOf(u) })).filter((q) => q.d).sort((a, b) => Math.hypot(a.d.x - ref.x, a.d.z - ref.z) - Math.hypot(b.d.x - ref.x, b.d.z - ref.z));
      const hit = sorted[Math.floor(rng() * Math.min(2, sorted.length))];
      if (hit) tapeDoor(P, nav, gate.floor, hit.d, rng);
      yield;
    }
  }

  // ---- 4. 关卡往上那段楼梯（和下面上来那段）：踏步上滴着血，休息平台上一摊、墙上一只手印 ----
  let light = 0;
  for (const f of routeFlights(plan, layout, nav, runs)) {
    const dx = f.top.x - f.bottom.x, dz = f.top.z - f.bottom.z, dy = f.top.y - f.bottom.y, L = Math.hypot(dx, dz) || 1, a = Math.atan2(dx, dz);
    if (!f.heavy) light++;
    for (let s = 0; s < f.steps; s++) {
      if (rng() > (f.heavy ? 0.32 : 0.09) * density) continue;
      const t = (s + 0.5) / f.steps, side = range(-1, 1) * Math.max(0, f.width / 2 - 0.2);
      const x = f.bottom.x + dx * t - (dz / L) * side, z = f.bottom.z + dz * t + (dx / L) * side, y = f.bottom.y + dy * (s + 1) / f.steps;
      // 踏步只有二十几厘米深：只放小的血滴
      items.push({ lv: f.lv, cell: 'drops', p: [x, y + ROUTE_DRESS.floorLift, z], ...floorAxes(a + range(-0.6, 0.6)), w: range(0.15, 0.2), h: 0, mode: BLOOD, alpha: range(0.6, 0.95), pull: 0.02 });
      items[items.length - 1].h = items[items.length - 1].w;
    }
    // 休息平台
    if (/-landing$/.test(f.to) && (f.heavy || light % 3 === 1)) {
      const F = nav.floors.get(f.to);
      if (F) {
        const S = P.spot(f.to, f.top.x + (dx / L) * 0.9, f.top.z + (dz / L) * 0.9, 2.2, { level: f.lv });
        if (S && f.heavy) { S.floor('drops', 2, { r1: 1.6, size: [0.2, 0.28], mode: BLOOD }); if (rng() < 0.5) S.floor(['pool0', 'pool1'], 1, { r1: 1.2, size: [0.55, 0.75], mode: BLOOD, keep: true }); }
        // 一路往上的休息平台：隔两三层一只扶着墙歇脚留下的手印，或者几滴血
        else if (S) { if (rng() < 0.55) S.wall(['handL', 'handR'], 1, { size: [0.19, 0.23], yc: [0.95, 1.3], mode: BLOOD, r1: 2, keep: true }); else S.floor('drops', 1, { r1: 1.4, size: [0.2, 0.26], mode: BLOOD, keep: true }); }
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
      S.footsteps(e.x + e.face[0] * 0.9, e.z + e.face[1] * 0.9, flare.site.x, flare.site.z, { n: 10 });
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
  if (items.length > ROUTE_DRESS.maxItems) items.length = ROUTE_DRESS.maxItems;
  return items;
}

/** 一户的入户门：门洞中心（墙线上）、朝走廊的法线、门宽 */
function doorOf(u) {
  const f = u.wfronts?.[0], lf = u.fronts?.[0], e = u.residence?.entryDoor;
  if (!f || !lf || typeof e?.at !== 'number') return null;
  const k = (e.at - lf.x0) / ((lf.x1 - lf.x0) || 1), x = f.x0 + (f.x1 - f.x0) * k, z = f.z0 + (f.z1 - f.z0) * k;
  return { x, z, nx: f.nx, nz: f.nz, w: e.width || 0.9, dx: (f.x1 - f.x0) / (Math.hypot(f.x1 - f.x0, f.z1 - f.z0) || 1), dz: (f.z1 - f.z0) / (Math.hypot(f.x1 - f.x0, f.z1 - f.z0) || 1) };
}
/** 门洞上贴两条交叉的警戒线、门边墙上喷「里面有感染者」、门口地上几只往外逃的血脚印 */
function tapeDoor(P, nav, floorId, d, rng) {
  // 法线朝走廊那一侧（门外 0.6 米有楼板、站得住的那边）
  let nx = d.nx, nz = d.nz;
  const F = nav.floors.get(floorId); if (!F) return;
  const out = (s) => { const st = landAt(nav, d.x + nx * s * 0.7, d.z + nz * s * 0.7, F.y + 0.6); return st && st.floor === floorId && clear(nav, st); };
  if (!out(1)) { if (!out(-1)) return; nx = -nx; nz = -nz; }
  const S = P.spot(floorId, d.x + nx * 0.8, d.z + nz * 0.8, 3.2);
  if (!S) return;
  const w = d.w, x = d.x + nx * 0.13, z = d.z + nz * 0.13;
  // 两条斜着交叉的胶带：从门框一边 0.7 米高拉到另一边 1.7 米高
  const span = Math.hypot(w + 0.16, 1.0), phi = Math.atan2(1.0, w + 0.16);
  for (const s of [1, -1]) {
    const ax = wallAxes(nx, nz, s * phi);
    P.items.push({ lv: S.lv, cell: 'tape', p: [x, S.y + 1.2 + (s > 0 ? 0 : 0.03), z], ...ax, w: span + 0.12, h: 0.075, mode: GLOSS, alpha: 0.95, pull: 0.0 });
  }
  // 门边的墙：和门脸共线的墙段里，离门洞边 0.45 米以外、墙段两头留够余量的一处
  const gw = 1.5, need = d.w / 2 + 0.45 + gw / 2;
  const cand = [];
  for (const { w, len } of S.walls) {
    const ux = (w.x1 - w.x0) / len, uz = (w.z1 - w.z0) / len;
    if (Math.abs(ux * d.dz - uz * d.dx) > 0.02) continue; // 不平行
    if (Math.abs((d.x - w.x0) * uz - (d.z - w.z0) * ux) > 0.05) continue; // 不在同一条线上
    const td = (d.x - w.x0) * ux + (d.z - w.z0) * uz, m = ROUTE_DRESS.margin + gw / 2;
    for (const t of [td + need, td - need]) if (t >= m && t <= len - m) cand.push({ x: w.x0 + ux * t, z: w.z0 + uz * t, nx, nz });
  }
  const q = cand.length ? cand[Math.floor(rng() * cand.length)] : null;
  if (q) S.addWall('gInfected', q, gw, 1.5, { phi: (rng() - 0.5) * 0.08, alpha: 0.95 });
  const side = rng() < 0.5 ? 1 : -1;
  S.footsteps(d.x + nx * 0.5, d.z + nz * 0.5, d.x + nx * 0.5 + d.dx * side * -3.5, d.z + nz * 0.5 + d.dz * side * -3.5, { n: 5 });
}

// ---------------------------------------------------------------------------
// 图集（canvas 程序画）

const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const C = Object.freeze({
  fresh: [86, 5, 7], dark: [42, 2, 3], dry: [62, 26, 17], rim: [40, 15, 10],
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
    const k = x / W, half = H * (0.2 + 0.12 * N(k * 4, 2.5, 3)), dense = 0.1 + 0.18 * N(k * 6, 7.5, 2);
    const yc = mid(x);
    g.fillStyle = rgba(N(k * 9, 4.5, 2) > 0.52 ? C.fresh : C.dry, dense);
    g.beginPath(); g.ellipse(x, yc, Math.max(1.5, W / 160), half, 0, 0, Math.PI * 2); g.fill();
  }
  // 布料、头发拖出来的细纹：顺着方向的一道道亮缝（透出地面）和几道更深的细线
  g.save(); g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x0 = W * rng() * 0.8, x1 = Math.min(W, x0 + W * (0.12 + rng() * 0.4)), off = (rng() - 0.5) * H * 0.44;
    g.strokeStyle = `rgba(0,0,0,${0.25 + rng() * 0.45})`; g.lineWidth = Math.max(1, H * (0.01 + rng() * 0.025));
    g.beginPath(); g.moveTo(x0, mid(x0) + off); g.quadraticCurveTo((x0 + x1) / 2, mid((x0 + x1) / 2) + off + (rng() - 0.5) * H * 0.04, x1, mid(x1) + off); g.stroke();
  }
  g.restore();
  for (let i = 0; i < 14; i++) {
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
  const x0 = W * 0.1, y0 = H * 0.5;
  pathPts(g, blobPts(x0 + W * 0.05, y0, H * 0.32, rng, 0.25, 30)); g.fillStyle = rgba(C.fresh, 0.85); g.fill();
  for (let f = 0; f < 4; f++) {
    const y = y0 + (f - 1.5) * H * 0.17, len = W * (0.55 + rng() * 0.3), x1 = x0 + len;
    const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, rgba(C.fresh, 0.9)); gr.addColorStop(0.6, rgba(C.dry, 0.55)); gr.addColorStop(1, rgba(C.dry, 0));
    g.strokeStyle = gr; g.lineCap = 'round'; g.lineWidth = H * (0.09 + rng() * 0.04); g.beginPath(); g.moveTo(x0 + W * 0.06, y); g.quadraticCurveTo(x0 + len * 0.5, y + H * (0.05 + rng() * 0.08), x1, y + H * (0.1 + rng() * 0.12)); g.stroke();
  }
  // 指痕里的细丝（指纹、皮肤纹路刮出来的空隙）
  g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) { const y = H * (0.15 + rng() * 0.7); g.strokeStyle = `rgba(0,0,0,${0.3 + rng() * 0.4})`; g.beginPath(); g.moveTo(W * (0.2 + rng() * 0.2), y); g.lineTo(W * (0.6 + rng() * 0.35), y + H * 0.08); g.stroke(); }
  g.restore();
}
/** 血手印（左手；右手镜像画）：手掌、四指、拇指，按得不均匀，皮肤纹路留白 */
function paintHand(g, W, H, rng, mirror = false) {
  g.save(); if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
  const s = W / 100;
  // 比例照真手：手掌宽 ≈ 手掌高，四指和手掌差不多长、细；拇指从掌根侧面斜出去（指头短粗就成了爪印）
  g.fillStyle = rgba(C.fresh, 0.9);
  g.beginPath(); g.moveTo(37 * s, 52 * s); g.quadraticCurveTo(36 * s, 80 * s, 46 * s, 90 * s); g.quadraticCurveTo(58 * s, 94 * s, 64 * s, 84 * s); g.quadraticCurveTo(68 * s, 66 * s, 66 * s, 50 * s); g.quadraticCurveTo(52 * s, 46 * s, 37 * s, 52 * s); g.fill();
  // 四指：根部在掌上沿，指尖分开一点；每节之间按得浅（指节横纹）
  const fingers = [[39.5, 52, 3.6, 25, -0.2], [47, 49, 3.9, 31, -0.06], [55, 49, 3.9, 32, 0.06], [62.5, 51, 3.4, 26, 0.2], [66, 72, 4.2, 24, 1.05]];
  for (const [x, y, r, len, a] of fingers) {
    g.save(); g.translate(x * s, y * s); g.rotate(a + (rng() - 0.5) * 0.08); g.beginPath();
    g.moveTo(-r * s, 2 * s); g.lineTo(-r * s * 0.92, -len * s + r * s); g.arc(0, -len * s + r * s, r * s * 0.92, Math.PI, 0); g.lineTo(r * s, 2 * s); g.closePath(); g.fill();
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.55)';
    for (const k of [0.38, 0.68]) g.fillRect(-r * s, -len * s * k, r * s * 2, Math.max(1, 0.9 * s));
    g.restore(); g.restore();
  }
  // 按压不匀：掌心中间凹下去没沾到、指尖最浓；皮纹空隙
  g.globalCompositeOperation = 'destination-out';
  const gr = g.createRadialGradient(52 * s, 70 * s, 2 * s, 52 * s, 70 * s, 13 * s); gr.addColorStop(0, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 110; i++) drop(g, (30 + rng() * 42) * s, (18 + rng() * 74) * s, (0.4 + rng() * 1.2) * s, [0, 0, 0], 0.25 + rng() * 0.5);
  g.globalCompositeOperation = 'source-over';
  // 往下淌的两三道（墙上的手印是竖着按的）
  for (let i = 0, n = 1 + Math.floor(rng() * 3); i < n; i++) { const x = (40 + rng() * 24) * s, y0 = 86 * s; g.strokeStyle = rgba(C.fresh, 0.8); g.lineWidth = 1.4 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + (4 + rng() * 9) * s); g.stroke(); }
  g.restore();
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
function paintDrops(g, W, H, rng) {
  for (let i = 0, n = 6 + Math.floor(rng() * 4); i < n; i++) {
    const x = W * (0.2 + rng() * 0.6), y = H * (0.2 + rng() * 0.6), r = W * (0.025 + rng() * 0.06);
    pathPts(g, blobPts(x, y, r, rng, 0.12, 20)); g.fillStyle = rgba(rng() < 0.4 ? C.dry : C.fresh, 0.92); g.fill();
    g.strokeStyle = rgba(C.rim, 0.6); g.lineWidth = Math.max(1, r * 0.15); g.stroke();
    // 落下来溅出的小刺
    for (let k = 0; k < 7; k++) { const a = rng() * Math.PI * 2; drop(g, x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3, r * 0.15, C.fresh, 0.85); }
  }
}
/** 一片弹孔：打掉的抹灰露出灰色的底、坑、黑洞、细裂纹 */
function paintHoles(g, W, H, rng) {
  const n = 6 + Math.floor(rng() * 4), cx = W / 2, cy = H / 2;
  for (let i = 0; i < n; i++) {
    const x = cx + (rng() - 0.5) * W * 0.62, y = cy + (rng() - 0.5) * H * 0.62, r = W * (0.035 + rng() * 0.025);
    pathPts(g, blobPts(x, y, r, rng, 0.35, 18)); g.fillStyle = rgba(C.plaster, 0.75); g.fill();
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 0.75); gr.addColorStop(0, rgba(C.crater, 0.95)); gr.addColorStop(1, rgba(C.crater, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 0.75, 0, Math.PI * 2); g.fill();
    drop(g, x, y, r * 0.28, C.hole, 1);
    g.strokeStyle = rgba([40, 37, 33], 0.55); g.lineWidth = Math.max(1, W * 0.003);
    for (let k = 0, m = 3 + Math.floor(rng() * 3); k < m; k++) { let a = rng() * Math.PI * 2, px = x + Math.cos(a) * r * 0.6, py = y + Math.sin(a) * r * 0.6; g.beginPath(); g.moveTo(px, py); for (let j = 0; j < 3; j++) { a += (rng() - 0.5) * 0.8; px += Math.cos(a) * r * 0.5; py += Math.sin(a) * r * 0.5; g.lineTo(px, py); } g.stroke(); }
    // 崩下来的碎屑落在下面
    for (let k = 0; k < 6; k++) drop(g, x + (rng() - 0.5) * r * 2, y + r * (1 + rng() * 1.5), W * 0.003, C.plaster, 0.6);
  }
}
/** 平滑的值噪声（格点哈希 + 平滑插值），几层叠起来；画烟熏这种大片柔和的东西用 */
function valueNoise(seed) {
  const h = (i, j) => { let t = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2246822519); t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
  const s = (t) => t * t * (3 - 2 * t);
  const n = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = s(x - i), fy = s(y - j); const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  return (x, y, oct = 4) => { let v = 0, A = 0.5, f = 1, sum = 0; for (let o = 0; o < oct; o++) { v += n(x * f, y * f) * A; sum += A; A *= 0.5; f *= 2.03; } return v / sum; };
}
/**
 * 熏黑：火从墙根往上舔出来的烟痕——底下一段最黑、往上散成一缕一缕，边缘被噪声啃得不齐。
 * 逐像素算（渐变叠很多层在画布上会抖出网点），画在单独的小画布上（putImageData 不认裁剪和平移）。
 */
function paintScorch(g, W, H, rng) {
  if (typeof g.createImageData !== 'function') return;
  const img = g.createImageData(W, H); if (!img?.data) return;
  const d = img.data, N = valueNoise(Math.floor(rng() * 1e6)), sx = 4 / W, lean = (rng() - 0.5) * 0.25;
  for (let y = 0; y < H; y++) {
    const t = 1 - y / H; // 0 = 底，1 = 顶
    const half = 0.16 + 0.3 * Math.pow(t, 0.8); // 烟柱半宽（相对 W）往上变宽
    for (let x = 0; x < W; x++) {
      const u = x / W - 0.5 - lean * t;
      const n = N(x * sx, y * sx * 0.55 - t * 1.5, 4), w = N(x * sx * 2.5 + 9, y * sx * 0.9, 2);
      // 柱形 × 噪声：边缘按噪声进退，往上越来越淡、越来越碎
      const edge = 1 - Math.min(1, Math.abs(u) / (half * (0.75 + 0.5 * n)));
      let a = Math.pow(Math.max(0, edge), 0.7) * (1.05 - 0.9 * t) * (0.55 + 0.75 * n) - (t > 0.55 ? (w - 0.45) * 0.6 * t : 0);
      a *= Math.min(1, y / (H * 0.04 + 1)) * Math.min(1, (H - y) / (H * 0.08)); // 上下两头收住，不出格
      a = Math.max(0, Math.min(0.92, a));
      const i = (y * W + x) * 4, c = 10 + 22 * n * (1 - a);
      d[i] = c + 4; d[i + 1] = c + 2; d[i + 2] = c; d[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
}
/** 碎玻璃：一堆小三角、四边形，边缘亮一点（着色器里整块光滑，手电一照会闪） */
function paintGlass(g, W, H, rng) {
  for (let i = 0; i < 70; i++) {
    const t = rng(), x = W * (0.5 + (rng() - 0.5) * 0.85 * Math.sqrt(t + 0.1)), y = H * (0.5 + (rng() - 0.5) * 0.75 * Math.sqrt(t + 0.1)), r = H * (0.015 + rng() * rng() * 0.12);
    g.beginPath(); const k = 3 + Math.floor(rng() * 2), a0 = rng() * 6.28;
    for (let j = 0; j < k; j++) { const a = a0 + (j / k) * 6.28 + (rng() - 0.5) * 0.9, d = r * (0.5 + rng() * 0.7); j ? g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath(); g.fillStyle = `rgba(196,212,218,${0.18 + rng() * 0.2})`; g.fill(); g.strokeStyle = `rgba(236,244,248,${0.45 + rng() * 0.4})`; g.lineWidth = 1; g.stroke();
  }
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
/** 掉在地上的手机：深色机身、屏幕碎成蛛网 */
function paintPhone(g, W, H, rng) {
  const x0 = W * 0.12, y0 = H * 0.08, w = W * 0.76, h = H * 0.84, r = w * 0.18;
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.roundRect ? g.roundRect(x0 + 1, y0 + 2, w, h, r) : g.rect(x0 + 1, y0 + 2, w, h); g.fill();
  g.fillStyle = '#16181b'; g.beginPath(); g.roundRect ? g.roundRect(x0, y0, w, h, r) : g.rect(x0, y0, w, h); g.fill();
  g.fillStyle = '#0b1217'; g.fillRect(x0 + w * 0.07, y0 + h * 0.05, w * 0.86, h * 0.9);
  const gr = g.createLinearGradient(x0, y0, x0 + w, y0 + h); gr.addColorStop(0, 'rgba(120,150,170,0.18)'); gr.addColorStop(0.5, 'rgba(120,150,170,0)'); g.fillStyle = gr; g.fillRect(x0 + w * 0.07, y0 + h * 0.05, w * 0.86, h * 0.9);
  const ix = x0 + w * (0.3 + rng() * 0.4), iy = y0 + h * (0.3 + rng() * 0.4); g.strokeStyle = 'rgba(220,230,235,0.55)'; g.lineWidth = 1;
  for (let k = 0; k < 9; k++) { let a = rng() * 6.28, px = ix, py = iy; g.beginPath(); g.moveTo(px, py); for (let j = 0; j < 4; j++) { a += (rng() - 0.5) * 0.6; px += Math.cos(a) * h * 0.1; py += Math.sin(a) * h * 0.1; g.lineTo(px, py); } g.stroke(); }
}
/** 几颗弹壳（黄铜，着色器里光滑） */
function paintCasings(g, W, H, rng) {
  for (let i = 0; i < 3; i++) {
    const x = W * (0.3 + rng() * 0.4), y = H * (0.2 + i * 0.28), a = rng() * Math.PI, l = W * 0.42, r = W * 0.11;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-l / 2 + 1, -r + 1.5, l, r * 2);
    const gr = g.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, '#7a5a20'); gr.addColorStop(0.4, '#e3c46e'); gr.addColorStop(1, '#6a4c18'); g.fillStyle = gr; g.fillRect(-l / 2, -r, l, r * 2);
    g.fillStyle = '#3a2a10'; g.fillRect(l / 2 - r * 0.5, -r * 0.8, r * 0.5, r * 1.6);
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
/** 字体：手写感靠逐字的旋转、大小、高低起伏 */
const FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei","WenQuanYi Micro Hei",sans-serif';
/** 涂鸦：逐字画（每个字转一点、大小高低不一），喷漆带飞沫和往下流的漆，记号笔干净，血字往下淌，白漆有刷痕 */
function paintGraffiti(g, W, H, rng, spec) {
  const chars = [...spec.text], arrow = spec.arrow ? 1 : 0, fs0 = H * (spec.latin ? 0.74 : 0.72);
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
        if (style !== 'paint') { g.lineWidth = fs * (style === 'spray' ? 0.07 : 0.05); g.lineJoin = 'round'; g.strokeStyle = g.fillStyle; g.strokeText(ch, 0, 0); }
        g.fillText(ch, 0, 0); g.restore();
      }
      cx += widths[i] * k;
    });
    if (arrow) {
      const ax = cx + fs * 0.42, ay = base, L = fs * 0.4, dir = spec.arrow === 'down' ? 1 : -1;
      g.save(); g.lineWidth = fs * 0.12; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = g.fillStyle; g.beginPath(); g.moveTo(ax, ay - dir * L); g.lineTo(ax, ay + dir * L); g.moveTo(ax - L * 0.6, ay + dir * L * 0.35); g.lineTo(ax, ay + dir * L); g.lineTo(ax + L * 0.6, ay + dir * L * 0.35); g.stroke(); g.restore();
    }
    if (spec.cross) { // 「里面有感染者」上打一个大叉（有人写完又划掉？不——是标记：这户别进）
      g.save(); g.lineWidth = fs * 0.07; g.lineCap = 'round'; g.strokeStyle = g.fillStyle; g.beginPath(); g.moveTo(x - fs * 0.2, H * 0.12); g.lineTo(x + total * k + fs * 0.1, H * 0.9); g.stroke(); g.restore();
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
  if (style === 'paint') { // 刷子刷的：横向的刷痕、边缘不齐
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + rng() * 0.35})`; g.fillRect(rng() * W, rng() * H, W * (0.05 + rng() * 0.2), 1 + rng() * 2); }
    g.restore();
  }
  if (style === 'marker') { g.save(); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 120; i++) drop(g, rng() * W, rng() * H, 0.6, [0, 0, 0], 0.35); g.restore(); }
}

/** 要先画在单独小画布上的格子（逐像素写的） */
const OFFSCREEN = new Set(['scorch']);
const PAINTERS = {
  pool0: paintPool, pool1: paintPool, splat0: paintSplat, splat1: paintSplat, holes: paintHoles, scorch: paintScorch, drag: paintDrag, smear: paintSmear,
  glass: paintGlass, debris: paintDebris, tape: paintTape, drops: paintDrops, phone: paintPhone, casings: paintCasings,
  handL: (g, W, H, r) => paintHand(g, W, H, r, false), handR: (g, W, H, r) => paintHand(g, W, H, r, true),
  footL: (g, W, H, r) => paintFoot(g, W, H, r, false), footR: (g, W, H, r) => paintFoot(g, W, H, r, true),
  paper0: (g, W, H, r) => paintPaper(g, W, H, r, 0), paper1: (g, W, H, r) => paintPaper(g, W, H, r, 1),
};

/**
 * 画图集（生成器：每画完一格 yield 一次）。g 是 size × size 画布的 2D 上下文。
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
          if (GRAFFITI[name]) paintGraffiti(q, W, H, rng, GRAFFITI[name]); else PAINTERS[name](q, W, H, rng);
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
      .replace('#include <common>', '#include <common>\nattribute vec4 dUv;\nattribute vec4 dPar;\nvarying vec2 vDPar;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = dUv.xy + uv * dUv.zw;\n#endif\nvDPar = dPar.xy;')
      // 深度朝镜头挪 dPar.z 米：沿视线挪，屏幕上的位置不变，光照、雾还按原来的位置算
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ float dl = length(mvPosition.xyz); vec4 mvP = mvPosition; mvP.xyz *= max(0.25, 1.0 - dPar.z / max(dl, 1e-3)); gl_Position = projectionMatrix * mvP; }');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDPar;')
      // 图集按预乘透明度上传（mipmap 边缘不发黑）：这里先还原成直的颜色，三角形的预乘输出在最后再乘回去
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb /= max(diffuseColor.a, 1e-3);\ndiffuseColor.a *= vDPar.y;\nfloat dGloss = 0.0;\nif (vDPar.x > 1.5) dGloss = 0.9 * smoothstep(0.05, 0.6, diffuseColor.a);\nelse if (vDPar.x > 0.5) { float gr = diffuseColor.g / max(diffuseColor.r, 1e-3); dGloss = (1.0 - smoothstep(0.05, 0.2, gr)) * smoothstep(0.004, 0.02, diffuseColor.r) * smoothstep(0.55, 0.85, diffuseColor.a); }')
      // 新鲜的血、玻璃、手机屏：粗糙度压低（手电一照有高光）；干了的褐色边缘、纸、墙上的东西照旧粗糙
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.14, dGloss);');
  };
  m.customProgramCacheKey = () => 'siege-route-dressing-v1';
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

  /** 按层分组：每层一组实例数据（矩阵、UV、参数），换层时拷进实例缓冲 */
  function group(items) {
    const by = new Map();
    for (const it of items) { if (!by.has(it.lv)) by.set(it.lv, []); by.get(it.lv).push(it); }
    const out = new Map();
    for (const [lv, list] of by) {
      const n = list.length, m = new Float32Array(n * 16), uv = new Float32Array(n * 4), par = new Float32Array(n * 4);
      list.forEach((it, i) => { itemMatrix(it, m, i * 16); uv.set(cellUv(it.cell), i * 4); par.set([it.mode, it.alpha, it.pull, 0], i * 4); });
      out.set(lv, { n, m, uv, par });
    }
    return out;
  }
  function activeKey() {
    const ex = explore?.() || null;
    if (!ex) return '';
    const ids = new Set([ex.level, ex.prefer, ex.elevator?.from, ex.elevator?.to].filter(Boolean));
    return [...ids].sort().join('|');
  }
  function sync() {
    const k = activeKey();
    if (k === key) return;
    key = k;
    let n = 0;
    for (const id of k.split('|')) {
      const c = clusters.get(id); if (!c) continue;
      const take = Math.min(c.n, cap - n); if (take <= 0) break;
      mesh.instanceMatrix.array.set(c.m.subarray(0, take * 16), n * 16); aUv.array.set(c.uv.subarray(0, take * 4), n * 4); aPar.array.set(c.par.subarray(0, take * 4), n * 4);
      n += take;
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
      planner = planDressing({ plan, nav, layout, runs, rng: mulberry32(dressSeed(plan)), legs, density: densityFor(mem()) });
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
    /** 这一局摆好的贴花（调试、实拍用；只读） */
    get items() { return built; },
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
