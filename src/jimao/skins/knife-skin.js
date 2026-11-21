// 战术刀的模型和贴图（arsenal.js 的 knifeGeometry / createArsenal 用）。
// 原来的刀是一块挤出来的铁片配三个单色材质：刀身一片亮灰、握把一根黑棍，暗场里只看得见一个白条。
// 这里按一把直刃格斗刀重搭：
//   刀身：一节一节的截面放样——刀背、刀面、血槽（真的凹下去）、主刃面（从刃线斜到刃口）、刃口的小斜面、刀尖上半段的假刃，
//         根部留一段不开刃的刀根，主刃面在那儿是一道弧形的起刃线；越往刀尖越薄，最后收成一个尖。
//         截面上每一道棱两边各用各的顶点：棱是硬的，沿刀长方向是顺的。
//   贴图：刀身专用的一套（1024 × 256，横着是刀长、竖着是刃宽，两面共用），用和模型同一套轮廓函数一个像素一个像素画——
//         刀面是发黑的氧化层（顺着刀长的细拉丝），主刃面磨掉了氧化层、是横向磨痕的缎面钢，刃口最亮；
//         氧化层在刃线、刀背的棱、刀尖上磨穿了露出钢色（断断续续），刀面上有几道进出刀鞘蹭出来的长划痕。
//   护手、尾锤：缎面钢，尾锤上一个真的穿绳孔。握把：橡胶，一圈一圈的防滑槽 + 菱形防滑纹。
// 所有贴图都在画布上现做；没有 document（测试环境）时材质就是几个单色，模型照常生成。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseField, fbmField } from '../gun-surface.js';

const hasCanvas = () => typeof document !== 'undefined';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (lo, hi, x) => { const t = clamp01((x - lo) / (hi - lo)); return t * t * (3 - 2 * t); };

/**
 * 刀的尺寸（米）。坐标：y 沿刀长（握把中心在原点，刀尖朝 +y），z 是刃宽方向（刀背在 +z、刃口在 −z），x 是厚度方向。
 * blade：len 刀身长、y0 刀根的位置、half 半厚、spine / edge 刀背和刃口的轮廓（[离刀根多远, z] 的控制点）、clip 假刃从哪儿开始、
 *        bevel 主刃面多宽、plunge [从哪儿, 到哪儿] 起刃线、hone 刃口小斜面多宽、fuller 血槽 [起, 止, 中心 z, 半宽, 深]。
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
  guard: Object.freeze({ y: 0.0535, thick: 0.0062, zEdge: -0.0275, zSpine: 0.0205, half: 0.0078 }),
  pommel: Object.freeze({ y0: -0.052, y1: -0.0745, thick: 0.0215, hole: Object.freeze([0.0035, -0.0652, 0.0027]) }),
  tex: Object.freeze({ w: 1024, h: 256, z0: -0.0172, z1: 0.0134 }),
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
  const [f0, f1, fz, fw, fdep] = B.fuller, fd = fdep * sstep(f0, f0 + 0.009, u) * sstep(f1, f1 - 0.011, u);
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
/** 按顶点位置写 UV（scale 米铺一格贴图）：面朝哪个轴就按另外两个轴投影 */
function boxUV(g, scale = 0.04) {
  const p = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getY(i) / scale, p.getZ(i) / scale); else if (ay >= az) uv.setXY(i, p.getZ(i) / scale, p.getX(i) / scale); else uv.setXY(i, p.getY(i) / scale, p.getX(i) / scale);
  }
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
  const stations = []; for (let i = 0; i <= N; i++) { const t = -0.005 + (B.len + 0.005) * i / N; stations.push({ t, pts: section(t) }); }
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

  // 护手：一块两头圆的钢板（刃口那一侧长一点），边上倒角；尾锤：侧面是带圆角的梯形，中间一个穿绳孔
  const Gd = K.guard, gs = new THREE.Shape(), r = Gd.half; // 形状平面：横 = 刀的 z，竖 = 刀的 x
  gs.moveTo(Gd.zEdge + r, -r); gs.lineTo(Gd.zSpine - r, -r); gs.absarc(Gd.zSpine - r, 0, r, -Math.PI / 2, Math.PI / 2, false); gs.lineTo(Gd.zEdge + r, r); gs.absarc(Gd.zEdge + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  const bev = 0.0011, guard = new THREE.ExtrudeGeometry(gs, { depth: Gd.thick - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 10 });
  guard.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))); guard.translate(0, Gd.y + bev, 0);
  const Pm = K.pommel, ps = new THREE.Shape(), pw = H.b * 1.04, c = 0.0045; // 形状平面：横 = −z，竖 = y
  ps.moveTo(-pw, Pm.y0); ps.lineTo(pw, Pm.y0); ps.lineTo(pw, Pm.y1 + c * 1.6); ps.quadraticCurveTo(pw, Pm.y1, pw - c * 1.6, Pm.y1); ps.lineTo(-pw + c, Pm.y1 + 0.002); ps.quadraticCurveTo(-pw, Pm.y1 + 0.002, -pw, Pm.y1 + 0.002 + c); ps.lineTo(-pw, Pm.y0);
  const hole = new THREE.Path(); hole.absarc(-Pm.hole[0], Pm.hole[1], Pm.hole[2], 0, Math.PI * 2, true); ps.holes.push(hole);
  const pb = 0.0014, pommel = new THREE.ExtrudeGeometry(ps, { depth: Pm.thick - 2 * pb, bevelEnabled: true, bevelThickness: pb, bevelSize: pb, bevelSegments: 2, curveSegments: 12 });
  pommel.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))); pommel.translate(-Pm.thick / 2 + pb, 0, 0);
  return { blade: join(blade), fuller: join(fuller), handle, guard: boxUV(join([guard, pommel])) };
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
/** 刀身各种表面的颜色（sRGB 0–255）和粗糙度 */
export const BLADE_FINISH = Object.freeze({
  coat: Object.freeze({ color: Object.freeze([66, 68, 73]), rough: 0.5, metal: 0.35 }),    // 发黑的涂层（不是裸钢：有漫反射，暗场里靠主光也看得见上面的拉丝和划痕）
  worn: Object.freeze({ color: Object.freeze([140, 144, 150]), rough: 0.36, metal: 1 }),   // 氧化层磨穿露出来的钢
  bevel: Object.freeze({ color: Object.freeze([116, 120, 127]), rough: 0.46, metal: 1 }),  // 主刃面：缎面
  hone: Object.freeze({ color: Object.freeze([186, 189, 194]), rough: 0.22, metal: 1 }),   // 刃口：磨得最亮
});
/**
 * 刀身的三张图（纯计算）：{ color, mr, height }，都是 w × h。color / mr 是 RGBA 字节（mr：G 粗糙度、B 金属度），height 是 0–1 的高度（拿去算法线）。
 * 横着是刀长（0 = 刀根，w = 刀尖），竖着是刃宽（第 0 行 = z0 那一侧，也就是刃口）。
 */
export function bladePixels(K = KNIFE_SHAPE, F = BLADE_FINISH, seed = 5) {
  const { w, h, z0, z1 } = K.tex, B = K.blade, color = new Uint8ClampedArray(w * h * 4), mr = new Uint8ClampedArray(w * h * 4), height = new Float32Array(w * h);
  const S = 256, long = fbmField(S, 3, 96, 2, seed, 0.6), cross = noiseField(S, 128, 3, seed + 3), blot = fbmField(S, 5, 5, 3, seed + 9), scr = noiseField(S, 2, 64, seed + 17), fine = noiseField(S, 6, 128, seed + 23);
  const mm = (z1 - z0) / h, e = mm * 0.6; // 一个像素多少米（竖直方向）；e：两种面交界处过渡的半宽
  // 四种表面的常数摊平成局部变量（这个循环只跑一次，引擎来不及优化，越直白越快）
  const [c0, c1, c2] = F.coat.color, [w0, w1, w2] = F.worn.color, [b0, b1, b2] = F.bevel.color, [h0, h1, h2] = F.hone.color;
  const cR = F.coat.rough, wR = F.worn.rough, bR = F.bevel.rough, hR = F.hone.rough, cM = F.coat.metal, wM = F.worn.metal, bM = F.bevel.metal, hM = F.hone.metal;
  for (let x = 0; x < w; x++) {
    const t = (x + 0.5) / w * B.len, s = bladeSection(t, B), nx = (x * S / w) | 0, nt = x & (S - 1), nb = ((x * S * 2 / w) | 0) & (S - 1), tipK = sstep(0.8 * B.len, B.len, t), root = sstep(0.004, 0, t), fk = s.fd / B.fuller[4];
    const zs = s.zs, ze = s.ze, zg = s.zg, zh = s.zh, zw = s.zw, fz = s.fz, fw = s.fw, swedge = zw < zs - 1e-5, hasF = s.fd > 0;
    for (let y = 0; y < h; y++) {
      let z = z0 + (y + 0.5) * mm; if (z < ze) z = ze; else if (z > zs) z = zs;
      const ny = ((y * S / h) | 0) * S, i = y * w + x, o = i * 4, nCross = cross[ny + nt], nBlot = blot[ny + nb];
      let r, g, bl, rough, metal, hgt;
      // 大部分像素整个落在一种面里：刃口、主刃面直接写，省掉后面那一串
      if (z < zh - e) { r = h0; g = h1; bl = h2; rough = hR; metal = hM; hgt = 0.1; }
      else if (z > zh + e && z < zg - e) { const k = 1 + (nCross - 0.5) * 0.09 + (nBlot - 0.5) * 0.08; r = b0 * k; g = b1 * k; bl = b2 * k; rough = bR + (nCross - 0.5) * 0.07; metal = bM; hgt = nCross * 0.16; }
      else {
        const nLong = long[ny + nx], nFine = fine[ny + nx];
        // 各个面占多少（边界上过渡一个像素）
        const wHone = z < zh + e ? sstep(zh + e, zh - e, z) : 0, wBevel = z < zg + e ? sstep(zg + e, zg - e, z) * (1 - wHone) : 0, wSw = swedge && z > zw - e ? sstep(zw - e, zw + e, z) : 0;
        const inF = hasF ? 1 - Math.abs(z - fz) / fw : -1, fShade = inF > 0 ? sstep(0, 0.5, inF) * fk : 0;
        // 涂层磨穿：刃线上、刀背的棱上、刀尖、假刃的棱、血槽的两条边，都是断续的；刀面上几道顺刀长的划痕（进出刀鞘蹭的）
        let wear = tipK > 0 ? tipK * sstep(0.35, 0.7, nBlot + 0.4 * tipK) : 0;
        if (z - zg < 0.0016) wear = Math.max(wear, sstep(0.0016, 0.0002, z - zg) * sstep(0.25, 0.55, nBlot + 0.25 * tipK));
        if (zw - z < 0.0011) wear = Math.max(wear, sstep(0.0011, 0, zw - z) * sstep(0.3, 0.6, nBlot));
        if (inF > -0.3 && inF < 0.3) wear = Math.max(wear, sstep(0.3, 0, Math.abs(inF)) * sstep(0.5, 0.75, nBlot) * 0.6 * fk);
        const nScr = scr[ny + nx]; if (nScr > 0.8) wear = Math.max(wear, sstep(0.8, 0.88, nScr) * sstep(0.3, 0.6, nLong) * 0.55 * (1 - fShade));
        const flat = (1 - wBevel - wHone) * (1 - wSw), wCoat = flat * (1 - wear), wWorn = flat * wear, wBev = wBevel + (1 - wBevel - wHone) * wSw;
        // 明暗：涂层顺刀长的细拉丝 + 大片的深浅；主刃面横向的磨痕；血槽里暗一点；贴着护手的一小段积了灰
        const kc = (1 + (nLong - 0.5) * 0.1 + (nFine - 0.5) * 0.06 + (nBlot - 0.5) * 0.14) * (1 - 0.2 * fShade) * (1 - 0.25 * root) * wCoat;
        const kb = (1 + (nCross - 0.5) * 0.09 + (nBlot - 0.5) * 0.08) * wBev, kw = (1 + (nFine - 0.5) * 0.14) * wWorn;
        r = c0 * kc + w0 * kw + b0 * kb + h0 * wHone; g = c1 * kc + w1 * kw + b1 * kb + h1 * wHone; bl = c2 * kc + w2 * kw + b2 * kb + h2 * wHone;
        rough = (cR + (nBlot - 0.5) * 0.12 + 0.08 * fShade) * wCoat + (wR + (nFine - 0.5) * 0.1) * wWorn + (bR + (nCross - 0.5) * 0.07) * wBev + hR * wHone;
        metal = cM * wCoat + wM * wWorn + bM * wBev + hM * wHone;
        hgt = (nFine * 0.6 + nLong * 0.4) * (wCoat + wWorn) * 0.22 + nCross * wBev * 0.16 + 0.1 * wHone + 0.05 * wCoat;
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
/** 护手、尾锤的缎面钢（可平铺）：顺一个方向的细拉丝，零星几道浅划痕。返回 { color, mr, height } */
export function satinPixels(size = 256, seed = 7) {
  const n = size * size, color = new Uint8ClampedArray(n * 4), mr = new Uint8ClampedArray(n * 4), height = new Float32Array(n), brush = fbmField(size, 4, size / 4, 2, seed, 0.6), cloud = fbmField(size, 4, 4, 3, seed + 3), pit = noiseField(size, size / 3 | 0, size / 3 | 0, seed + 11);
  for (let i = 0; i < n; i++) {
    const b = brush[i] - 0.5, c = cloud[i] - 0.5, dark = sstep(0.62, 0.8, cloud[i]) * 0.3, k = (1 + b * 0.12 + c * 0.16) * (1 - dark), o = i * 4; // dark：手汗、油泥留下的暗斑
    color[o] = 104 * k; color[o + 1] = 107 * k; color[o + 2] = 113 * k; color[o + 3] = 255;
    mr[o] = 255; mr[o + 1] = clamp01(0.38 + b * 0.1 + dark * 0.6 + (pit[i] - 0.5) * 0.06) * 255; mr[o + 2] = 255; mr[o + 3] = 255;
    height[i] = brush[i] * 0.8 + pit[i] * 0.2;
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
 * 有画布时各配一套贴图（刀身 1024 × 256，握把、钢件 256 × 256 可平铺）；没有（测试环境）就是单色。ms：做贴图花了多少毫秒。
 */
export function createKnifeMaterials({ K = KNIFE_SHAPE } = {}) {
  const blade = new THREE.MeshStandardMaterial({ color: 0x8f949b, metalness: 1, roughness: 0.34, name: 'knife-blade' });
  const handle = new THREE.MeshStandardMaterial({ color: 0x1b1c1c, metalness: 0, roughness: 0.78, name: 'knife-handle' });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a6d73, metalness: 1, roughness: 0.4, name: 'knife-steel' });
  const textures = []; let ms = 0;
  if (hasCanvas()) {
    const t0 = performance.now();
    const dress = (m, P, { repeat, bump, wrap }) => {
      const map = canvasTexture(P.color, P.w, P.h, { srgb: true, repeat }), data = canvasTexture(P.mr, P.w, P.h, { repeat }), nrm = canvasTexture(normalFromHeight(P.height, P.w, P.h, bump, wrap), P.w, P.h, { repeat });
      textures.push(map, data, nrm);
      m.map = map; m.roughnessMap = data; m.metalnessMap = data; m.normalMap = nrm; m.color.set(0xffffff); m.metalness = 1; m.roughness = 1; m.needsUpdate = true;
    };
    dress(blade, bladePixels(K), { repeat: false, bump: 1.6, wrap: false }); blade.normalScale.set(0.4, 0.4);
    dress(handle, gripPixels(256, 8), { repeat: true, bump: 3.2, wrap: true });
    dress(steel, satinPixels(256), { repeat: true, bump: 0.45, wrap: true });
    ms = performance.now() - t0;
  }
  return { blade, handle, steel, textures, ms, dispose() { for (const t of textures) t.dispose(); textures.length = 0; for (const m of [blade, handle, steel]) m.dispose(); } };
}
