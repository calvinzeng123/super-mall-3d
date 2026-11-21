// 战术刀的模型和贴图（arsenal.js 的 knifeGeometry / createArsenal 用）。
// 原来的刀是一块挤出来的铁片配三个单色材质：刀身一片亮灰、握把一根黑棍，暗场里只看得见一个白条。
// 这里按一把直刃格斗刀重搭：
//   刀身：一节一节的截面放样——刀背、刀面、血槽（真的凹下去）、主刃面（从刃线斜到刃口）、刃口的小斜面、刀尖上半段的假刃，
//         根部留一段不开刃的刀根，主刃面在那儿是一道弧形的起刃线；越往刀尖越薄，最后收成一个尖。
//         截面上每一道棱两边各用各的顶点：棱是硬的，沿刀长方向是顺的。
//   贴图：刀身专用的一套（1024 × 192，横着是刀长、竖着是刃宽，两面共用；两个方向每毫米的像素差不多，纹路不会被拉长），
//         用和模型同一套轮廓函数一个像素一个像素画——刀面是石洗过的缎面钢，顺着刀长的拉丝是一像素宽的细线；
//         主刃面是横向的细磨痕，刃口最亮。拉丝、磨痕主要画在粗糙度里（只在高光里看得出来），颜色里只留很淡的一点——
//         以前颜色里的拉丝又宽又硬，近看像一张被拉长的贴图、刃面上一道黑一道白像斑马纹。
//         白天和停电看起来要是同一把钢：底色是中灰（粗糙的金属靠底色撑起明暗），不是一块只反射环境的黑镜子。
//   护手、尾锤：喷砂的中性钢灰（各向同性的细颗粒，不是拉丝——护手的面朝向各不一样，拉丝贴上去会一块横一块竖），
//         棱是平滑的倒角（法线按折角分开算：倒角顺、大面和侧面之间的棱硬），高光是一条干净的线。
//         尾锤顺着握把的椭圆截面收成一个圆头，底下是铆平的刀柄尾（一个压扁的小圆包）。
//   握把：橡胶，一圈一圈的防滑槽 + 菱形防滑纹。
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseField, fbmField } from '../gun-surface.js';

const hasCanvas = () => typeof document !== 'undefined';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (lo, hi, x) => { const t = clamp01((x - lo) / (hi - lo)); return t * t * (3 - 2 * t); };

/**
 * 刀的尺寸（米）。坐标：y 沿刀长（握把中心在原点，刀尖朝 +y），z 是刃宽方向（刀背在 +z、刃口在 −z），x 是厚度方向。
 * blade：len 刀身长、y0 刀根的位置、half 半厚、spine / edge 刀背和刃口的轮廓（[离刀根多远, z] 的控制点）、clip 假刃从哪儿开始、
 *        bevel 主刃面多宽、plunge [从哪儿, 到哪儿] 起刃线、hone 刃口小斜面多宽、fuller 血槽 [起, 止, 中心 z, 半宽, 深]。
 * pommel：y0 / y1 尾锤的上下沿、flare 比握把末端放大多少、cap 底下圆头的高度、tang 铆平的刀柄尾 [x 半径, z 半径, 高]。
 * tex：刀身贴图的边长，z0 / z1 贴图竖直方向盖住的刃宽范围。
 */
export const KNIFE_SHAPE = Object.freeze({
  blade: Object.freeze({
    len: 0.172, y0: 0.058, half: 0.0023, clip: 0.112, bevel: 0.0092, plunge: Object.freeze([0.006, 0.02]), hone: 0.0011,
    spine: Object.freeze([[0, 0.0125], [0.112, 0.0125], [0.135, 0.0074], [0.156, 0.0028], [0.172, -0.0012]]),
    edge: Object.freeze([[0, -0.014], [0.03, -0.0144], [0.07, -0.0155], [0.105, -0.015], [0.135, -0.0119], [0.158, -0.0066], [0.172, -0.0012]]),
    fuller: Object.freeze([0.022, 0.104, 0.0052, 0.0025, 0.00075]),
  }),
  handle: Object.freeze({ y0: -0.052, y1: 0.0535, a: 0.0113, b: 0.0156, grooves: 6, pitch: 0.0135, depth: 0.075 }),
  guard: Object.freeze({ y: 0.0535, thick: 0.0041, zEdge: -0.0275, zSpine: 0.0205, half: 0.0072, bevel: 0.0007 }),
  pommel: Object.freeze({ y0: -0.0505, y1: -0.0745, flare: 1.13, cap: 0.0075, tang: Object.freeze([0.0042, 0.0026, 0.0017]) }),
  tex: Object.freeze({ w: 1024, h: 192, z0: -0.0172, z1: 0.0134 }),
});

/** 过一串控制点 [x, y] 的平滑曲线（单调的三次插值，不会在拐点外面鼓包），求 x 处的 y；两头之外取端点的值 */
export function curveAt(points, x) {
  const n = points.length; if (x <= points[0][0]) return points[0][1]; if (x >= points[n - 1][0]) return points[n - 1][1];
  let i = 0; while (i < n - 2 && x > points[i + 1][0]) i++;
  const [x0, y0] = points[i], [x1, y1] = points[i + 1], h = x1 - x0;
  const slope = (k) => { if (k <= 0 || k >= n - 1) return k <= 0 ? (points[1][1] - points[0][1]) / (points[1][0] - points[0][0]) : (points[n - 1][1] - points[n - 2][1]) / (points[n - 1][0] - points[n - 2][0]); const a = (points[k][1] - points[k - 1][1]) / (points[k][0] - points[k - 1][0]), b = (points[k + 1][1] - points[k][1]) / (points[k + 1][0] - points[k][0]); return a * b <= 0 ? 0 : 2 * a * b / (a + b); };
  const m0 = slope(i), m1 = slope(i + 1), t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
}
/** 圆头：s 是离端点多远（按血槽半宽算，0–1），返回四分之一圆 √(1 − (1 − s)²)；s ≤ 0 是 0、s ≥ 1 是 1 */
export const roundEnd = (s) => (s <= 0 ? 0 : s >= 1 ? 1 : Math.sqrt(1 - (1 - s) * (1 - s)));
/**
 * 离刀根 t 米处的截面：{ zs 刀背, ze 刃口, zg 刃线（主刃面的上沿）, zh 刃口小斜面的上沿, zw 假刃的下沿（没有假刃时 = zs）,
 *   th 这里的半厚, hs 刀背上的半厚（有假刃时收窄）, he 刃口小斜面上沿的半厚, fz / fw / fd 血槽的中心、半宽、深（不在血槽段时 fd = 0） }。
 * 模型和贴图都用它，所以贴图上的刃线、血槽正好落在模型的棱上。
 */
export function bladeSection(t, B = KNIFE_SHAPE.blade) {
  const u = Math.max(0, Math.min(B.len, t)), zs = curveAt(B.spine, u), ze = curveAt(B.edge, u), wide = Math.max(0, zs - ze);
  const zg = ze + Math.min(B.bevel * sstep(B.plunge[0], B.plunge[1], u), wide * 0.62), zh = ze + Math.min(B.hone * sstep(B.plunge[0], B.plunge[1] - 0.004, u), wide * 0.2);
  const zw = zs - Math.min(0.0036 * sstep(B.clip + 0.002, B.clip + 0.014, u), wide * 0.3);
  const tip = Math.pow(clamp01((B.len - u) / 0.014), 0.7), th = B.half * (1 - 0.45 * sstep(0.08, 0.16, u)) * tip;
  // 血槽两头是球头铣刀走出来的圆头：俯看是一个半圆（宽度按四分之一圆从 0 长到满宽），深度跟着走——起头是一道利落的边，不是一团慢慢变浅的光斑
  const [f0, f1, fz, fwMax, fdep] = B.fuller, fe = roundEnd(Math.min((u - f0) / fwMax, (f1 - u) / fwMax)), fw = fwMax * Math.max(fe, 1e-4), fd = fdep * fe;
  return { zs, ze, zg, zh, zw, th, hs: zw < zs - 1e-6 ? th * 0.3 : th, he: Math.min(0.00032, th * 0.3) * sstep(B.plunge[0], B.plunge[1], u) + th * (1 - sstep(B.plunge[0], B.plunge[1], u)), fz, fw, fd };
}

// ---- 模型 ----
/** 一条放样带：rows[i] 是第 i 个截面上这条带的几个点（[x, y, z, u, v]）。带内法线是顺的，带和带之间是硬棱。flip：翻面 */
function strip(rows, flip = false) {
  const n = rows.length, k = rows[0].length, pos = new Float32Array(n * k * 3), uv = new Float32Array(n * k * 2), idx = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) { const p = rows[i][j], o = i * k + j; pos.set([p[0], p[1], p[2]], o * 3); uv.set([p[3], p[4]], o * 2); }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < k - 1; j++) { const a = i * k + j, b = a + k, c = b + 1, d = a + 1; if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const join = (parts) => { const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))); for (const p of parts) p.dispose(); return g; };
/** 按顶点位置写 UV（scale 米铺一格贴图）：每个三角形按自己的朝向挑投影面（三个顶点用同一个，倒角上的平滑法线不会把一个三角形拆到两个投影里） */
function boxUV(g, scale = 0.04) {
  const p = g.attributes.position, uv = g.attributes.uv, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)), ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = i; k < i + 3; k++) {
      if (ax >= ay && ax >= az) uv.setXY(k, p.getY(k) / scale, p.getZ(k) / scale); else if (ay >= az) uv.setXY(k, p.getZ(k) / scale, p.getX(k) / scale); else uv.setXY(k, p.getY(k) / scale, p.getX(k) / scale);
    }
  }
  uv.needsUpdate = true;
  return g;
}
/**
 * 搭刀。返回 { blade, fuller, handle, guard }（都是 BufferGeometry，握把还没倾斜：y 朝上）：
 *   blade 刀身（刀背、刀面、主刃面、刃口、假刃），fuller 两面的血槽（和刀身用同一套贴图），handle 握把，guard 护手和尾锤。
 */
export function buildKnife(K = KNIFE_SHAPE) {
  const B = K.blade, T = K.tex, N = 84, vOf = (z) => (z - T.z0) / (T.z1 - T.z0);
  // 截面上从刀背到刃口的 11 个点：[z, 半厚]
  const section = (t) => {
    const s = bladeSection(t, B), f = [];
    for (let k = 0; k <= 4; k++) { const a = k / 4 * Math.PI; f.push([Math.max(s.zg, Math.min(s.zw, s.fz + s.fw * Math.cos(a))), s.th - s.fd * Math.sin(a)]); } // 血槽段以外（刀尖）这几个点收在刀面上
    return [[s.zs, 0], [s.zs, s.hs], [s.zw, s.th], ...f, [s.zg, s.th], [s.zh, s.he], [s.ze, 0]];
  };
  // 截面的位置：均匀的一串，血槽两头的圆头那几毫米再加密（圆头只有一个血槽半宽那么长，均匀的间距在那儿只有一两个截面，圆头会成一个斜角）
  const ts = []; for (let i = 0; i <= N; i++) ts.push(-0.005 + (B.len + 0.005) * i / N);
  const [f0, f1, , fw] = B.fuller; for (const k of [0, 0.03, 0.1, 0.2, 0.35, 0.5, 0.7, 0.85, 1, 1.3]) ts.push(f0 + k * fw, f1 - k * fw);
  ts.sort((a, b) => a - b); const stations = [];
  for (const t of ts) if (!stations.length || t - stations[stations.length - 1].t > 1e-4) stations.push({ t, pts: section(t) });
  const groups = { spine: [0, 1], swedge: [1, 2], flatUp: [2, 3], fuller: [3, 4, 5, 6, 7], flatLow: [7, 8], bevel: [8, 9], hone: [9, 10] };
  const side = (name, sx) => strip(stations.map((s) => groups[name].map((k) => [sx * s.pts[k][1], B.y0 + s.t, s.pts[k][0], clamp01(s.t / B.len), vOf(s.pts[k][0])])), sx < 0);
  const blade = [], fuller = [];
  for (const sx of [1, -1]) { for (const name of ['spine', 'swedge', 'flatUp', 'flatLow', 'bevel', 'hone']) blade.push(side(name, sx)); fuller.push(side('fuller', sx)); }

  // 握把：椭圆截面沿 y 放样，中段略鼓，两头收口，一圈一圈的防滑槽
  const H = K.handle, rings = 132, segs = 28, hl = H.y1 - H.y0, rows = [];
  for (let i = 0; i <= rings; i++) {
    const y = H.y0 + hl * i / rings, k = i / rings;
    let s = 1 + 0.055 * Math.sin(Math.PI * k) + 0.05 * sstep(0.9, 1, k) + 0.04 * sstep(0.1, 0, k);
    for (let g = 0; g < H.grooves; g++) { const yg = (H.y0 + H.y1) / 2 - 0.002 + (g - (H.grooves - 1) / 2) * H.pitch; s -= H.depth * Math.exp(-(((y - yg) / 0.0017) ** 2)); }
    const row = []; for (let j = 0; j <= segs; j++) { const a = j / segs * Math.PI * 2; row.push([H.a * s * Math.cos(a), y, H.b * s * Math.sin(a), j / segs * 7, k * 8]); }
    rows.push(row);
  }
  const handle = strip(rows, true);

  // 护手：一块两头圆的钢板（刃口那一侧长一点），边上倒角
  const Gd = K.guard, gs = new THREE.Shape(), r = Gd.half; // 形状平面：横 = 刀的 z，竖 = 刀的 x
  gs.moveTo(Gd.zEdge + r, -r); gs.lineTo(Gd.zSpine - r, -r); gs.absarc(Gd.zSpine - r, 0, r, -Math.PI / 2, Math.PI / 2, false); gs.lineTo(Gd.zEdge + r, r); gs.absarc(Gd.zEdge + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  // 冲压钢板：薄（四毫米），边上一道 45° 的小倒角（一个面、硬棱），灯下是一条干净的亮线；以前三段圆角的厚板像一块铸出来的垫圈
  const bev = Gd.bevel, guard = new THREE.ExtrudeGeometry(gs, { depth: Gd.thick - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 14 });
  guard.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))); guard.translate(0, Gd.y + bev, 0);
  // 尾锤：顺着握把的椭圆截面放样——上沿一道倒角从握把放大到 flare 倍，往下是直身，底下 cap 高的一段收成圆头（超椭圆：底面比半球平一点）
  const Pm = K.pommel, prow = [], tz = Pm.tang, ybot = Pm.y1 + tz[2] * 0.75, ycap = ybot + Pm.cap, pr = 26;
  const ring = (y, sc) => { const row = []; for (let j = 0; j <= segs; j++) { const a = j / segs * Math.PI * 2; row.push([H.a * sc * Math.cos(a), y, H.b * sc * Math.sin(a), j / segs, 0]); } return row; };
  prow.push(ring(Pm.y0 + 0.0015, 1.0), ring(Pm.y0, 1.03), ring(Pm.y0 - 0.0014, Pm.flare));
  for (let i = 0; i <= pr; i++) { const u = i / pr, y = ycap - (ycap - ybot) * u; prow.push(ring(y, Pm.flare * Math.pow(Math.max(0, 1 - u ** 4), 0.25))); }
  const pommel = strip(prow, false); // 一行一行往下排（握把是往上排的），所以不翻面
  // 铆平的刀柄尾：圆头正中一个压扁的小圆包（刀柄从尾锤里穿出来、敲平）
  const tang = new THREE.SphereGeometry(1, 16, 8); tang.scale(tz[0], tz[2], tz[1]); tang.translate(0, Pm.y1 + tz[2], 0);
  const steel = toCreasedNormals(join([guard, pommel, tang]), Math.PI / 5);
  return { blade: join(blade), fuller: join(fuller), handle, guard: boxUV(steel, 0.035) };
}

// ---- 贴图 ----
/** 高度图（w × h）→ 法线（RGBA）。给不翻转的画布贴图用（flipY = false：贴图的 v 朝画布下方）。wrap：可平铺的图，边上绕回去取 */
export function normalFromHeight(height, w, h, strength = 1, wrap = false) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ya = (y > 0 ? y - 1 : wrap ? h - 1 : 0) * w, yb = (y < h - 1 ? y + 1 : wrap ? 0 : h - 1) * w, row = y * w;
    for (let x = 0; x < w; x++) {
      const xa = x > 0 ? x - 1 : wrap ? w - 1 : 0, xb = x < w - 1 ? x + 1 : wrap ? 0 : w - 1;
      const dx = (height[row + xb] - height[row + xa]) * strength, dy = (height[yb + x] - height[ya + x]) * strength, l = 127.5 / Math.sqrt(dx * dx + dy * dy + 1), i = (row + x) * 4;
      out[i] = 127.5 - dx * l; out[i + 1] = 127.5 - dy * l; out[i + 2] = 127.5 + l; out[i + 3] = 255;
    }
  }
  return out;
}
/**
 * 刀身各种表面的颜色（sRGB 0–255）、粗糙度、金属度。刀面是中灰的石洗缎面钢（金属度 0.85：留一点漫反射，
 * 白天、停电看起来是同一把钢，不会白天一片黑镜子、停电一片灰）；所有面的粗糙度都不低于 0.34——假刃、刀面在侧光下不会亮成一片死白（俯视检视时高光也压得住）。
 */
export const BLADE_FINISH = Object.freeze({
  // 刀面比以前暗一档、涩一档：大平面整片对着灯时（俯视、右侧）会亮成一长条死白，像镜面镀铬；缎面 / 喷砂的刀高光是散开的一片灰白。
  // smudge：刀面粗糙度上大片的手汗、油膜（±），高光不是一整块均匀的亮
  coat: Object.freeze({ color: Object.freeze([106, 109, 114]), rough: 0.6, metal: 0.85, smudge: 0.14 }), // 刀面：石洗缎面
  worn: Object.freeze({ color: Object.freeze([124, 127, 132]), rough: 0.48, metal: 0.95 }), // 常被蹭的地方（刃线、刀背的棱、刀尖）：磨得光一点
  bevel: Object.freeze({ color: Object.freeze([130, 133, 138]), rough: 0.46, metal: 1 }),   // 主刃面：横向细磨痕
  hone: Object.freeze({ color: Object.freeze([164, 167, 172]), rough: 0.3, metal: 1 }),      // 刃口：最亮、最光，只有这一窄条闪
  // 血槽两边的棱：一道很窄的暗线（槽口积了油泥、也是凹进去的阴影），槽的轮廓是利落的
  fullerEdge: Object.freeze({ width: 0.00035, shade: 0.24, rough: 0.08 }),
  // 纹路的幅度：颜色只留很淡的一点，主要在粗糙度里（只在高光里看得出来）；height 是拿去算法线的高度
  lines: Object.freeze({ color: 0.03, rough: 0.08, height: 0.08, cross: 0.5 }), // cross：主刃面的磨痕再减半（刃面常是斜着对镜头，起伏会被放大）
});
/** 整数 → 0–1 的哈希（拉丝线、磨痕线每一条的深浅） */
const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
/**
 * 拉丝 / 磨痕：一像素宽的细线。i 是线的序号（拉丝 = 第几行、磨痕 = 第几列），t 是沿着线走到哪儿（像素）。
 * 每条线一个底色深浅，再按不规则的长度分段换一点深浅（真的拉丝不是一根从头到尾一样的线）。返回 0–1。
 */
export function brushLine(i, t, seed = 1) {
  const len = 70 + hash(i * 3 + seed) * 260, seg = Math.floor((t + hash(i * 7 + seed) * 997) / len);
  return 0.6 * hash(i * 131 + seed * 17) + 0.4 * hash(i * 977 + seg * 7919 + seed);
}
/**
 * 刀身的三张图（纯计算）：{ color, mr, height }，都是 w × h。color / mr 是 RGBA 字节（mr：G 粗糙度、B 金属度），height 是 0–1 的高度（拿去算法线）。
 * 横着是刀长（0 = 刀根，w = 刀尖），竖着是刃宽（第 0 行 = z0 那一侧，也就是刃口）。
 */
export function bladePixels(K = KNIFE_SHAPE, F = BLADE_FINISH, seed = 5) {
  const { w, h, z0, z1 } = K.tex, B = K.blade, color = new Uint8ClampedArray(w * h * 4), mr = new Uint8ClampedArray(w * h * 4), height = new Float32Array(w * h);
  const S = 256, blot = fbmField(S, 5, 5, 3, seed + 9), scr = noiseField(S, 2, 64, seed + 17), smear = fbmField(S, 3, 3, 3, seed + 31);
  const SM = F.coat.smudge || 0, FE = F.fullerEdge || null;
  const mm = (z1 - z0) / h, e = mm * 0.6; // 一个像素多少米（竖直方向）；e：两种面交界处过渡的半宽
  // 刀面的拉丝是一行一条线（沿刀长），主刃面的磨痕是一列一条线（横着、略斜）——先把每个像素的线值算好
  const longL = new Float32Array(w * h), crossL = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { longL[y * w + x] = brushLine(y, x, seed); crossL[y * w + x] = brushLine(x + ((y * 0.3) | 0), y, seed + 3); }
  const LC = F.lines.color, LR = F.lines.rough, LH = F.lines.height, LX = F.lines.cross ?? 1;
  const [c0, c1, c2] = F.coat.color, [w0, w1, w2] = F.worn.color, [b0, b1, b2] = F.bevel.color, [h0, h1, h2] = F.hone.color;
  const cR = F.coat.rough, wR = F.worn.rough, bR = F.bevel.rough, hR = F.hone.rough, cM = F.coat.metal, wM = F.worn.metal, bM = F.bevel.metal, hM = F.hone.metal;
  for (let x = 0; x < w; x++) {
    const t = (x + 0.5) / w * B.len, s = bladeSection(t, B), nx = (x * S / w) | 0, nb = ((x * S * 2 / w) | 0) & (S - 1), tipK = sstep(0.8 * B.len, B.len, t), root = sstep(0.004, 0, t), fk = s.fd / B.fuller[4];
    const zs = s.zs, zg = s.zg, zh = s.zh, zw = s.zw, fz = s.fz, fw = s.fw, swedge = zw < zs - 1e-5, hasF = s.fd > 0;
    for (let y = 0; y < h; y++) {
      let z = z0 + (y + 0.5) * mm; if (z < s.ze) z = s.ze; else if (z > zs) z = zs;
      const ny = ((y * S / h) | 0) * S, i = y * w + x, o = i * 4, nBlot = blot[ny + nb], lc = (crossL[i] - 0.5) * LX;
      let r, g, bl, rough, metal, hgt;
      if (z < zh - e) { r = h0; g = h1; bl = h2; rough = hR; metal = hM; hgt = 0.3; }
      else if (z > zh + e && z < zg - e) { const k = 1 + lc * LC + (nBlot - 0.5) * 0.05; r = b0 * k; g = b1 * k; bl = b2 * k; rough = bR + lc * LR; metal = bM; hgt = 0.3 + lc * LH; }
      else {
        const ll = longL[i] - 0.5;
        const wHone = z < zh + e ? sstep(zh + e, zh - e, z) : 0, wBevel = z < zg + e ? sstep(zg + e, zg - e, z) * (1 - wHone) : 0, wSw = swedge && z > zw - e ? sstep(zw - e, zw + e, z) : 0;
        const inF = hasF ? 1 - Math.abs(z - fz) / fw : -1, fShade = inF > 0 ? sstep(0, 0.5, inF) * fk : 0;
        const fEdge = hasF && FE ? sstep(FE.width, 0, Math.abs(Math.abs(z - fz) - fw)) * sstep(0, 0.2, fk) : 0, smudge = (smear[ny + nx] - 0.5) * SM;
        // 磨光的地方：刃线上、刀背的棱上、刀尖，断续的；刀面上几道进出刀鞘蹭出来的细长划痕
        let wear = tipK > 0 ? tipK * sstep(0.35, 0.7, nBlot + 0.4 * tipK) * 0.6 : 0;
        if (z - zg < 0.0016) wear = Math.max(wear, sstep(0.0016, 0.0002, z - zg) * sstep(0.25, 0.55, nBlot + 0.25 * tipK));
        if (zw - z < 0.0011) wear = Math.max(wear, sstep(0.0011, 0, zw - z) * sstep(0.3, 0.6, nBlot));
        const nScr = scr[ny + nx]; if (nScr > 0.82) wear = Math.max(wear, sstep(0.82, 0.9, nScr) * 0.45 * (1 - fShade));
        const flat = (1 - wBevel - wHone) * (1 - wSw), wCoat = flat * (1 - wear), wWorn = flat * wear, wBev = wBevel + (1 - wBevel - wHone) * wSw;
        // 明暗：刀面顺刀长的细拉丝（很淡）+ 一点大片的深浅；血槽里暗一点；贴着护手的一小段积了灰
        const kc = (1 + ll * LC + (nBlot - 0.5) * 0.07) * (1 - 0.16 * fShade) * (1 - 0.2 * root) * (1 - (FE ? FE.shade : 0) * fEdge) * wCoat;
        const kb = (1 + lc * LC + (nBlot - 0.5) * 0.05) * wBev, kw = (1 + ll * LC) * wWorn;
        r = c0 * kc + w0 * kw + b0 * kb + h0 * wHone; g = c1 * kc + w1 * kw + b1 * kb + h1 * wHone; bl = c2 * kc + w2 * kw + b2 * kb + h2 * wHone;
        rough = (cR + ll * LR + (nBlot - 0.5) * 0.06 + smudge + 0.06 * fShade + (FE ? FE.rough : 0) * fEdge) * wCoat + (wR + ll * LR * 0.6) * wWorn + (bR + lc * LR) * wBev + hR * wHone;
        metal = cM * wCoat + wM * wWorn + bM * wBev + hM * wHone;
        hgt = (0.3 + ll * LH) * (wCoat + wWorn) + (0.3 + lc * LH) * wBev + 0.3 * wHone; // 底高度各面一样：面和面的分界交给模型的棱，法线里不再多出一道
      }
      color[o] = r; color[o + 1] = g; color[o + 2] = bl; color[o + 3] = 255;
      mr[o] = 255; mr[o + 1] = rough * 255; mr[o + 2] = metal * 255; mr[o + 3] = 255; height[i] = hgt;
    }
  }
  return { color, mr, height, w, h };
}
/** 握把的橡胶防滑纹（可平铺，size × size）：菱形的小凸点。返回 { color, mr, height } */
export function gripPixels(size = 256, cells = 8, seed = 3) {
  const n = size * size, color = new Uint8ClampedArray(n * 4), mr = new Uint8ClampedArray(n * 4), height = new Float32Array(n), grain = noiseField(size, size / 2, size / 2, seed), cloud = fbmField(size, 4, 4, 2, seed + 5);
  const tri = (v) => 1 - Math.abs(2 * (v - Math.floor(v)) - 1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * cells, v = y / size * cells, p = Math.min(tri(u + v), tri(u - v)), top = sstep(0.12, 0.62, p), i = y * size + x, o = i * 4;
    const k = (0.8 + 0.5 * top) * (1 + (grain[i] - 0.5) * 0.2 + (cloud[i] - 0.5) * 0.18);
    color[o] = 25 * k; color[o + 1] = 25 * k; color[o + 2] = 26.5 * k; color[o + 3] = 255;
    mr[o] = 255; mr[o + 1] = (0.86 - 0.26 * top + (grain[i] - 0.5) * 0.08) * 255; mr[o + 2] = 0; mr[o + 3] = 255;
    height[i] = top * 0.85 + grain[i] * 0.15;
  }
  return { color, mr, height, w: size, h: size };
}
/**
 * 护手、尾锤的喷砂钢（可平铺）：各向同性的细颗粒（不分方向：护手的面朝向各不一样，有方向的拉丝贴上去会一块横一块竖、绕边一圈成斑马条），
 * 中性的钢灰（不偏蓝），零星几处手汗、油泥的暗斑。返回 { color, mr, height }。
 */
export function satinPixels(size = 256, seed = 7) {
  const n = size * size, color = new Uint8ClampedArray(n * 4), mr = new Uint8ClampedArray(n * 4), height = new Float32Array(n);
  const fine = noiseField(size, size / 2, size / 2, seed), mid = noiseField(size, size / 8 | 0, size / 8 | 0, seed + 5), cloud = fbmField(size, 4, 4, 3, seed + 3);
  for (let i = 0; i < n; i++) {
    // 喷砂：细颗粒为主（颜色只有一点点起伏），大片的深浅压到很淡——以前的云斑在护手上是一块一块的脏，像铸件
    const f = fine[i] - 0.5, m = mid[i] - 0.5, dark = sstep(0.72, 0.88, cloud[i]) * 0.07, k = (1 + f * 0.07 + m * 0.025 + (cloud[i] - 0.5) * 0.03) * (1 - dark), o = i * 4;
    color[o] = 118 * k; color[o + 1] = 119 * k; color[o + 2] = 121 * k; color[o + 3] = 255;
    mr[o] = 255; mr[o + 1] = clamp01(0.47 + f * 0.08 + m * 0.03 + dark * 0.4) * 255; mr[o + 2] = 255; mr[o + 3] = 255;
    height[i] = clamp01(0.5 + f * 0.85 + m * 0.06);
  }
  return { color, mr, height, w: size, h: size };
}

function canvasTexture(pixels, w, h, { srgb = false, repeat = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h); img.data.set(pixels); g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  return t;
}
/**
 * 刀的三种材质：{ blade, handle, steel, textures, ms, dispose() }。
 * 有画布时各配一套贴图（刀身 1024 × 192，握把、钢件 256 × 256 可平铺）；没有（测试环境）就是单色。ms：做贴图花了多少毫秒。
 * defer：先只建材质，贴图等调 dress() 再做（一百多毫秒的同步计算，不和开局的其他活儿挤在同一帧里）；ready：贴图做好了没有。
 */
export function createKnifeMaterials({ K = KNIFE_SHAPE, defer = false } = {}) {
  const blade = new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.9, roughness: 0.38, name: 'knife-blade' });
  const handle = new THREE.MeshStandardMaterial({ color: 0x1b1c1c, metalness: 0, roughness: 0.78, name: 'knife-handle' });
  const steel = new THREE.MeshStandardMaterial({ color: 0x767779, metalness: 1, roughness: 0.48, name: 'knife-steel' });
  const textures = []; let ms = 0, ready = !hasCanvas(), gone = false;
  const paint = () => {
    if (ready || gone) return false; ready = true;
    const t0 = performance.now();
    const dress = (m, P, { repeat, bump, wrap, env = 1 }) => {
      const map = canvasTexture(P.color, P.w, P.h, { srgb: true, repeat }), data = canvasTexture(P.mr, P.w, P.h, { repeat }), nrm = canvasTexture(normalFromHeight(P.height, P.w, P.h, bump, wrap), P.w, P.h, { repeat });
      textures.push(map, data, nrm);
      m.map = map; m.roughnessMap = data; m.metalnessMap = data; m.normalMap = nrm; m.color.set(0xffffff); m.metalness = 1; m.roughness = 1; m.envMapIntensity = env; m.needsUpdate = true;
    };
    dress(blade, bladePixels(K), { repeat: false, bump: 1.2, wrap: false, env: 0.65 }); blade.normalScale.set(0.35, 0.35); // env：环境反射略收，大平面正对亮处时不至于整片发白
    dress(handle, gripPixels(256, 8), { repeat: true, bump: 3.2, wrap: true });
    dress(steel, satinPixels(256), { repeat: true, bump: 0.5, wrap: true }); steel.normalScale.set(0.4, 0.4);
    ms = performance.now() - t0;
    return true;
  };
  if (!defer) paint();
  return { blade, handle, steel, textures, get ms() { return ms; }, get ready() { return ready; }, dress: paint,
    dispose() { gone = true; for (const t of textures) t.dispose(); textures.length = 0; for (const m of [blade, handle, steel]) m.dispose(); } };
}
