// P17 手枪的贴图整理（arsenal.js 的 skinPistol 里调一次）。
// 模型自带的贴图只有 512 的 JPEG（套筒、套筒座、弹匣各一套：颜色 / 金属粗糙度 / 法线），原样用有四个毛病：
//   1) 原厂是亮面不锈钢，以前靠材质颜色整体乘暗——成了一把灰蒙蒙的锡器，烤蓝钢该有的「底色深、高光亮」没有；
//      颜色贴图里烤进去的大片云斑、每条棱上的白边也跟着留下来；
//   2) 原厂铭文以前是拿旁边一块贴图盖上去再模糊：盖的那块和周围接不上（一个发白的方块），枪口两侧的口径字样、套筒座的编号没盖到；
//   3) 512 的图在第一人称的距离上是糊的，粗糙度上的压缩方块让高光一块亮一块暗；
//   4) 握把片上的金色圆片（原厂徽标）涂成了一块黄铜色的圆饼。
// 这里在加载时把像素重算一遍（只算一次）：
//   抹字：铭文那一块顺着拉丝的方向，用框外两头的像素一列一列接过去（拉丝从框上边连到框下边，接缝在纹理里看不出来），
//         再把旁边干净面上的细颗粒搬过来；颜色、粗糙度、法线三张图都处理，法线只接不搬——刻进去的笔画填平了。
//   表面：颜色贴图只当「明暗」用（原图本来就是灰的）——除掉大片云斑，按零件分成钢件 / 握把片两类重新上色：
//         套筒是深的烤蓝（蓝黑、半亮），套筒座是哑一点的磷化黑，握把片是黑色橡胶；原图里烤出来的亮棱只在断断续续的地方磨出钢色，凹缝压暗。
//   粗糙度：去方块、往各自的目标值收拢（高光连成片，不再一块一块）；磨亮的棱更光，凹缝更涩。
//   放大：颜色、法线放大到 1024 再锐化；法线贴图平面上的压缩噪点抹平（烤蓝是亮的，噪点会在高光里显出来）。
//   圆片：改成一颗发黑的钢制握把螺帽（车出来的同心纹、一圈倒角、中间一个内六角），颜色 / 粗糙度 / 法线一起画。
//   细节：着色器里再叠一层平铺的细颗粒法线（gun-surface.js 的 addDetail）——贴近了看钢面有质感，不是塑料一样的平。
// 像素运算都是纯函数（Uint8ClampedArray 进、就地改），测试环境没有 document 时 createPistolSkin().dress() 什么都不做。
import * as THREE from 'three';
import { noiseField, fbmField, heightToNormal, addDetail } from '../gun-surface.js';

const hasCanvas = () => typeof document !== 'undefined';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clampI = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);
/** 平滑阶跃：x 从 lo 到 hi，结果从 0 到 1（lo > hi 时反过来） */
export const smoothstep = (lo, hi, x) => { const t = clamp01((x - lo) / (hi - lo)); return t * t * (3 - 2 * t); };

/**
 * 调参表。颜色都是 0–255 的贴图值（sRGB），粗糙度、金属度是 0–1；「相对亮度」= 原图亮度 ÷ 周围大面的平均亮度（平面上是 1，烤出来的亮棱 1.5 以上）。
 * 每种材质：size 颜色、法线贴图放大到多少；split [lo, hi] 原贴图金属度低于 lo 算握把片（非金属）、高于 hi 算钢件；
 *   cloud：算「周围大面」的范围（512 贴图上的像素）；flatten：云斑除掉多少（1 = 全除掉）；sharpen：颜色锐化的量；grain：颜色上的细颗粒（±）；
 *   patch [lo, hi]：磨损是断续的——噪声低于 lo 的棱不磨、高于 hi 的磨足。
 *   steel / poly 两类各自：ref 原图里这类表面的平均亮度；color 新的底色；contrast 原图的明暗留多少；lo / hi 相对亮度限幅；
 *     wearAt [lo, hi] 相对亮度到多少算棱；wear 最多磨掉多少；bare 磨出来的颜色；
 *     rough 目标粗糙度、roughRef 原图这类表面的粗糙度、roughKeep 原图的变化留多少、roughWear 磨亮处降多少、roughCavity 凹缝里升多少；metal 写回去的金属度。
 *   normal：sharpen [握把片, 钢件] 法线锐化的量；flat [lo, hi] 钢件上偏离正上方小于 lo 的当噪点抹平、大于 hi 的原样；size 法线贴图放大到多少（不写 = 和颜色一样）；null = 法线贴图不动。
 *   detail：着色器里叠的细颗粒——scale 在 UV 上铺几次、strength 法线强弱、rough 对粗糙度的影响。
 */
const STEEL_WEAR = Object.freeze([150, 153, 158]);
export const PISTOL_FINISH = Object.freeze({
  detailSize: 256, anisotropy: 8,
  Slide: Object.freeze({
    size: 1024, split: Object.freeze([0.3, 0.5]), cloud: 10, flatten: 0.8, sharpen: 0.8, grain: 0.05, patch: Object.freeze([0.36, 0.58]),
    steel: Object.freeze({ ref: 138, color: Object.freeze([68, 73, 86]), contrast: 0.9, lo: 0.4, hi: 1.35, wearAt: Object.freeze([1.38, 1.7]), wear: 0.7, bare: STEEL_WEAR,
      rough: 0.34, roughRef: 0.4, roughKeep: 0.3, roughWear: 0.08, roughCavity: 0.22, metal: 1 }),
    poly: null,
    normal: Object.freeze({ sharpen: Object.freeze([0.6, 0.6]), flat: Object.freeze([0.03, 0.09]) }),
    detail: Object.freeze({ scale: 22, strength: 0.07, rough: 0.06 }),
  }),
  MainBody: Object.freeze({
    size: 1024, split: Object.freeze([0.25, 0.5]), cloud: 10, flatten: 0.8, sharpen: 0.8, grain: 0.06, patch: Object.freeze([0.36, 0.58]),
    steel: Object.freeze({ ref: 82, color: Object.freeze([70, 71, 75]), contrast: 0.9, lo: 0.4, hi: 1.35, wearAt: Object.freeze([1.42, 1.85]), wear: 0.6, bare: STEEL_WEAR,
      rough: 0.5, roughRef: 0.47, roughKeep: 0.25, roughWear: 0.12, roughCavity: 0.2, metal: 0.92 }),
    poly: Object.freeze({ ref: 45, color: Object.freeze([23, 23, 24]), contrast: 0.6, lo: 0.5, hi: 1.6, wearAt: Object.freeze([2.2, 3.4]), wear: 0.3, bare: Object.freeze([64, 64, 66]),
      rough: 0.6, roughRef: 0.55, roughKeep: 0.3, roughWear: 0.1, roughCavity: 0.1, metal: 0 }),
    normal: Object.freeze({ sharpen: Object.freeze([1.3, 0.6]), flat: Object.freeze([0.03, 0.09]) }),
    detail: Object.freeze({ scale: 22, strength: 0.18, rough: 0.12 }),
  }),
  Magazine: Object.freeze({
    size: 512, split: Object.freeze([0.25, 0.5]), cloud: 10, flatten: 0.8, sharpen: 0.5, grain: 0.05, patch: Object.freeze([0.36, 0.58]),
    steel: Object.freeze({ ref: 102, color: Object.freeze([58, 59, 62]), contrast: 0.9, lo: 0.4, hi: 1.35, wearAt: Object.freeze([1.45, 1.9]), wear: 0.5, bare: STEEL_WEAR,
      rough: 0.46, roughRef: 0.45, roughKeep: 0.25, roughWear: 0.12, roughCavity: 0.2, metal: 0.95 }),
    poly: null,
    normal: null, // 弹匣只在换弹那一下露出来：法线贴图不放大、不重算
    detail: Object.freeze({ scale: 22, strength: 0.2, rough: 0.12 }),
  }),
});

/** 单通道的盒式模糊（半径 r，边上按最近的像素补）。a：Float32Array（w × h）。返回新数组 */
export function boxBlur(a, w, h, r = 1) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w; let s = 0;
    for (let i = -r; i <= r; i++) s += a[row + clampI(i, w)];
    for (let x = 0; x < w; x++) { t[row + x] = s / n; s += a[row + clampI(x + r + 1, w)] - a[row + clampI(x - r, w)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += t[clampI(i, h) * w + x];
    for (let y = 0; y < h; y++) { o[y * w + x] = s / n; s += t[clampI(y + r + 1, h) * w + x] - t[clampI(y - r, h) * w + x]; }
  }
  return o;
}

// ---- 抹字 ----
/**
 * 把一个框里的像素用框外两头的像素接起来（RGBA，就地改 RGB）。rect = [x, y, 宽, 高]（已经是这张图上的像素）。
 * along：'v' 一列一列从上边接到下边（拉丝是竖的）、'h' 一行一行从左接到右。两头各取框外 2 个像素的平均；
 * soft：沿着边再抹平多少个像素（法线贴图用：只要大的走势，不要噪点）。
 */
export function bridgeFill(d, w, h, rect, { along = 'v', soft = 0 } = {}) {
  const x0 = Math.max(2, Math.round(rect[0])), y0 = Math.max(2, Math.round(rect[1])), x1 = Math.min(w - 2, Math.round(rect[0] + rect[2])), y1 = Math.min(h - 2, Math.round(rect[1] + rect[3]));
  const rw = x1 - x0, rh = y1 - y0; if (rw <= 0 || rh <= 0) return 0;
  const vert = along !== 'h', n = vert ? rw : rh, len = vert ? rh : rw;
  // 两头的值：a = 上（左）边外面，b = 下（右）边外面
  let A = new Float32Array(n * 3), B = new Float32Array(n * 3);
  const px = (x, y, c) => d[(y * w + x) * 4 + c];
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) {
    A[k * 3 + c] = vert ? (px(x0 + k, y0 - 1, c) + px(x0 + k, y0 - 2, c)) / 2 : (px(x0 - 1, y0 + k, c) + px(x0 - 2, y0 + k, c)) / 2;
    B[k * 3 + c] = vert ? (px(x0 + k, y1, c) + px(x0 + k, y1 + 1, c)) / 2 : (px(x1, y0 + k, c) + px(x1 + 1, y0 + k, c)) / 2;
  }
  if (soft > 0) {
    const sm = (S) => { const o = new Float32Array(S.length); for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) { let s = 0; for (let j = -soft; j <= soft; j++) s += S[clampI(k + j, n) * 3 + c]; o[k * 3 + c] = s / (2 * soft + 1); } return o; };
    A = sm(A); B = sm(B);
  }
  for (let j = 0; j < len; j++) {
    const t = (j + 0.5) / len;
    for (let k = 0; k < n; k++) {
      const i = ((vert ? y0 + j : y0 + k) * w + (vert ? x0 + k : x0 + j)) * 4;
      for (let c = 0; c < 3; c++) d[i + c] = A[k * 3 + c] + (B[k * 3 + c] - A[k * 3 + c]) * t;
    }
  }
  return rw * rh;
}
/**
 * 把 from 那一块（干净的面）上的细颗粒搬到 rect 里：只搬「细节」（原值 − 周围 5×5 的平均），大的明暗不动。
 * from 比 rect 小就来回镜像着铺。gain：搬多少；框边上 2 个像素渐入（不留一圈印子）。
 */
export function grainFill(d, w, h, rect, from, gain = 1) {
  const x0 = Math.max(0, Math.round(rect[0])), y0 = Math.max(0, Math.round(rect[1])), x1 = Math.min(w, Math.round(rect[0] + rect[2])), y1 = Math.min(h, Math.round(rect[1] + rect[3]));
  const fx = Math.max(0, Math.round(from[0])), fy = Math.max(0, Math.round(from[1])), fw = Math.min(w - fx, Math.round(from[2])), fh = Math.min(h - fy, Math.round(from[3]));
  if (x1 <= x0 || y1 <= y0 || fw < 2 || fh < 2) return 0;
  const hp = new Float32Array(fw * fh * 3), one = new Float32Array(fw * fh);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) one[y * fw + x] = d[((fy + y) * w + fx + x) * 4 + c];
    const lowp = boxBlur(one, fw, fh, 2);
    for (let i = 0; i < one.length; i++) hp[i * 3 + c] = one[i] - lowp[i];
  }
  const mirror = (i, n) => { const m = i % (2 * n - 2); return m < n ? m : 2 * n - 2 - m; };
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const edge = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y), k = gain * Math.min(1, (edge + 1) / 3);
    const s = (mirror(y - y0, fh) * fw + mirror(x - x0, fw)) * 3, i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + hp[s + c] * k;
  }
  return (x1 - x0) * (y1 - y0);
}
/**
 * 按 spec 把一张贴图上的铭文抹掉。spec.rects：[{ at, from, along }]，坐标按 512 × 512 的贴图写，这里换算到 w。
 * kind：'color' / 'data'（金属粗糙度）接上以后搬颗粒；'normal' 只接、抹平（刻痕填平）。返回改了多少像素。
 */
export function scrubRects(d, w, h, spec, kind = 'color') {
  const k = w / 512; let n = 0;
  for (const r of spec?.rects || []) {
    const at = r.at.map((v) => v * k);
    n += bridgeFill(d, w, h, at, { along: r.along || 'v', soft: kind === 'normal' ? Math.round(3 * k) : 0 });
    if (kind !== 'normal' && r.from) grainFill(d, w, h, at, r.from.map((v) => v * k), kind === 'color' ? 0.9 : 0.6);
  }
  return n;
}

// ---- 握把螺帽（原来是带原厂徽标的金色圆片） ----
/** 螺帽正中的内六角孔：r 是到圆心的距离（按 512 贴图的像素），a 是方位角，R 是螺帽半径。孔里是 1、孔外是 0，边上过渡一个像素 */
function capHole(r, a, R) {
  const hexR = 0.36 * R / Math.cos(((a + Math.PI * 2) % (Math.PI / 3)) - Math.PI / 6); // 六角孔的边到圆心的距离
  return smoothstep(hexR + 0.45, hexR - 0.45, r);
}
/** 螺帽的高度剖面：边上一圈倒角、中间一道车出来的环槽、正中的内六角孔 */
function capHeight(r, a, R) { return smoothstep(R, R - 1.5, r) - 0.35 * Math.exp(-(((r - 0.72 * R) / 0.5) ** 2)) - 0.9 * capHole(r, a, R); }
/**
 * 在贴图上画握把螺帽。spec.discs：[[cx, cy, R]]（512 贴图上的像素）。kind：'color' 画发黑的钢色（同心的车纹、倒角磨亮一点、六角孔里是黑的）；
 * 'data' 写金属度 1、粗糙度；'normal' 按高度剖面算法线（glTF 的法线贴图：绿通道朝图的上方）。返回画了多少像素。
 */
export function paintCaps(d, w, h, spec, kind = 'color') {
  const k = w / 512; let n = 0;
  for (const [cx, cy, R] of spec?.discs || []) {
    const X = cx * k, Y = cy * k, x0 = Math.max(0, Math.floor(X - (R + 2) * k)), x1 = Math.min(w - 1, Math.ceil(X + (R + 2) * k)), y0 = Math.max(0, Math.floor(Y - (R + 2) * k)), y1 = Math.min(h - 1, Math.ceil(Y + (R + 2) * k));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - X) / k, dy = (y + 0.5 - Y) / k, r = Math.hypot(dx, dy); if (r > R + 1.6) continue;
      const a = Math.atan2(dy, dx), i = (y * w + x) * 4, cover = smoothstep(R + 0.5, R - 0.3, r), seat = smoothstep(R + 1.6, R + 0.2, r) * (1 - cover); // seat：螺帽外面一圈压进握把片的阴影
      if (kind === 'normal') {
        const e = 0.25, gx = (capHeight(Math.hypot(dx + e, dy), Math.atan2(dy, dx + e), R) - capHeight(Math.hypot(dx - e, dy), Math.atan2(dy, dx - e), R)) / (2 * e),
          gy = (capHeight(Math.hypot(dx, dy + e), Math.atan2(dy + e, dx), R) - capHeight(Math.hypot(dx, dy - e), Math.atan2(dy - e, dx), R)) / (2 * e);
        const s = 0.9, nx = -gx * s, ny = gy * s, l = Math.hypot(nx, ny, 1), m = Math.max(cover, seat * 0.6);
        d[i] += ((nx / l * 0.5 + 0.5) * 255 - d[i]) * m; d[i + 1] += ((ny / l * 0.5 + 0.5) * 255 - d[i + 1]) * m; d[i + 2] += ((1 / l * 0.5 + 0.5) * 255 - d[i + 2]) * m;
      } else if (kind === 'data') {
        const hole = capHole(r, a, R), rim = smoothstep(R - 2.4, R - 1.2, r) * smoothstep(R, R - 0.8, r);
        const rough = 0.36 - 0.1 * rim + 0.3 * hole + 0.05 * Math.sin(r * 5.2);
        d[i + 1] += (rough * 255 - d[i + 1]) * cover; d[i + 2] += (255 - d[i + 2]) * cover;
      } else {
        const hole = capHole(r, a, R), rim = smoothstep(R - 2.4, R - 1.2, r) * smoothstep(R, R - 0.8, r) * (0.55 + 0.45 * Math.sin(a * 3 + 1.3));
        const lathe = 1 + 0.07 * Math.sin(r * 5.2) - 0.25 * Math.exp(-(((r - 0.72 * R) / 0.5) ** 2));
        const base = [50 * lathe, 52 * lathe, 57 * lathe], out = [0, 0, 0];
        for (let c = 0; c < 3; c++) out[c] = (base[c] + (132 - base[c]) * rim * 0.6) * (1 - 0.72 * hole);
        for (let c = 0; c < 3; c++) { d[i + c] *= 1 - 0.55 * seat; d[i + c] += (out[c] - d[i + c]) * cover; }
      }
      n++;
    }
  }
  return n;
}
/** 一步做完：抹字 + 画螺帽（不走整套表面处理、只想去掉铭文的时候用） */
export function scrubPixels(d, w, h, spec, kind = 'color') { return scrubRects(d, w, h, spec, kind) + paintCaps(d, w, h, spec, kind); }

// ---- 表面 ----
// 耗时是按「第一次跑」控制的（代码还没被引擎优化、手机比台式机慢好几倍）：1024 的图每个像素只走一遍，
// 明暗 → 上色 / 磨损的曲线先算成查找表；「周围大面的平均亮度」在缩到 1/4 的图上算。
const VQ = 64, VMAX = 4, VN = VQ * VMAX; // 相对亮度的查找表：每 1/64 一格，到 4 为止
/** 一类表面的查找表：shade 底色的明暗倍数、wear 磨掉多少（还没乘断续的噪声）、cav 凹缝（相对亮度明显低于平面）。下标 = 相对亮度 × VQ */
export function toneTables(C) {
  const shade = new Float32Array(VN + 1), wear = new Float32Array(VN + 1), cav = new Float32Array(VN + 1);
  for (let k = 0; k <= VN; k++) { const v = k / VQ; shade[k] = 1 + (Math.max(C.lo, Math.min(C.hi, v)) - 1) * C.contrast; wear[k] = smoothstep(C.wearAt[0], C.wearAt[1], v) * C.wear; cav[k] = smoothstep(0.8, 0.45, v); }
  return { shade, wear, cav };
}
/**
 * 量一遍原图（颜色 base、金属粗糙度 mr，都是 n × n 的 RGBA；n 是 4 的倍数）。返回：
 *   steel：每个像素是不是钢件（Uint8，1 / 0；材质没有握把片这一类时是 null = 全是钢件）；
 *   kref： 每个像素「平面该有多亮」的倒数 × VQ（亮度乘上它就是查找表的下标）——参考亮度在这类表面的平均亮度和周围大面的平均亮度之间，按 flatten 取（除掉云斑用）；
 *   kwref：判断棱用的参考亮度（同样是倒数 × VQ）——基本就是这类表面的平均亮度，只有周围一大片都亮（扳机这种整件偏亮的零件）才跟着抬高，免得整件都算成磨损。
 */
export function analyse(base, mr, n, P) {
  const q = n >> 2, low = new Float32Array(q * q);
  for (let y = 0; y < q; y++) for (let x = 0; x < q; x++) {
    let s = 0; for (let j = 0; j < 4; j++) { const r = ((y * 4 + j) * n + x * 4) * 4; s += base[r] + base[r + 4] + base[r + 8] + base[r + 12]; }
    low[y * q + x] = s / 16;
  }
  const r = Math.max(1, Math.round(P.cloud / 4)), local = boxBlur(boxBlur(low, q, q, r), q, q, r);
  const S = P.steel, Q = P.poly, f = P.flatten, N = n * n;
  const mk = (C) => { const t = new Float32Array(q * q), w = new Float32Array(q * q), k = Math.pow(C.ref, 1 - f); for (let i = 0; i < t.length; i++) { const l = Math.max(8, local[i]); t[i] = k * Math.pow(l, f); w[i] = C.ref * Math.pow(Math.max(1, l / C.ref), 0.6); } return [t, w]; };
  const [ts, ws] = mk(S), [tp, wp] = Q ? mk(Q) : [ts, ws];
  const steel = Q ? new Uint8Array(N) : null, kref = new Float32Array(N), kwref = new Float32Array(N), cut = (P.split[0] + P.split[1]) / 2 * 255;
  for (let y = 0; y < n; y++) {
    const ly = (y >> 2) * q;
    for (let x = 0; x < n; x++) {
      const i = y * n + x, l = ly + (x >> 2), st = !Q || mr[i * 4 + 2] > cut;
      if (steel) steel[i] = st ? 1 : 0;
      kref[i] = VQ / (st ? ts[l] : tp[l]); kwref[i] = VQ / (st ? ws[l] : wp[l]);
    }
  }
  return { steel, kref, kwref };
}
/** 磨损断续用的噪声（size × size，可平铺）按 patch = [lo, hi] 变成 0–1 的遮罩 */
export function patchMask(noise, patch) { const o = new Float32Array(noise.length); for (let i = 0; i < o.length; i++) o[i] = smoothstep(patch[0], patch[1], noise[i]); return o; }
/**
 * 重写金属粗糙度贴图（n × n，就地）：粗糙度去方块、往目标值收拢，磨亮处更光、凹缝更涩；金属度按类别写。
 * base：同尺寸的颜色贴图（抹过字的原图）；A：analyse 的结果；mask：patchMask 的结果（边长 ms）。
 */
export function finishMR(mr, base, n, A, P, mask = null, ms = 0) {
  const N = n * n, g = new Uint8Array(N); for (let i = 0; i < N; i++) g[i] = mr[i * 4 + 1];
  const S = P.steel, Q = P.poly || P.steel, TS = toneTables(S), TQ = P.poly ? toneTables(Q) : TS, mq = ms / n, steel = A.steel, kref = A.kref, kwref = A.kwref;
  // 每类表面的常数排成一行：[目标粗糙度, 原图粗糙度, 留多少, 磨亮处降多少（已经除掉 wear）, 凹缝升多少, 金属度 × 255]
  const row = (C) => [C.rough, C.roughRef, C.roughKeep, C.wear > 0 ? C.roughWear / C.wear : 0, C.roughCavity, (C.metal * 255) | 0], K = new Float32Array([...row(S), ...row(Q)]);
  const wS = TS.wear, wQ = TQ.wear, cS = TS.cav, cQ = TQ.cav, k6 = 1 / (6 * 255);
  for (let y = 0; y < n; y++) {
    const up = y > 0 ? -n : 0, dn = y < n - 1 ? n : 0, my = ((y * mq) | 0) * ms;
    for (let x = 0; x < n; x++) {
      const i = y * n + x, st = !steel || steel[i] === 1, c = st ? 0 : 6, l = base[i * 4];
      const r0 = (g[i] * 2 + g[i + (x > 0 ? -1 : 0)] + g[i + (x < n - 1 ? 1 : 0)] + g[i + up] + g[i + dn]) * k6;
      let k = (l * kref[i]) | 0, kw = (l * kwref[i]) | 0; if (k > VN) k = VN; if (kw > VN) kw = VN;
      const w = (st ? wS[kw] : wQ[kw]) * (mask ? mask[my + ((x * mq) | 0)] : 1), cav = st ? cS[k] : cQ[k];
      const rough = K[c] + (r0 - K[c + 1]) * K[c + 2] - w * K[c + 3] + cav * K[c + 4], o = i * 4;
      mr[o] = 255; mr[o + 1] = ((rough < 0.16 ? 0.16 : rough > 0.96 ? 0.96 : rough) * 255) | 0; mr[o + 2] = K[c + 5];
    }
  }
}
/**
 * 放大用的工具：把 n × n 的 RGBA 图按双线性放大到 size × size，一行一行给。返回 row(y, ch, out, scale, bias)——把放大后第 y 行的第 ch 个通道写进 out（Float32Array(size)）。
 * 自己算而不是让画布放大：只要一两个通道，而且不用「画到大画布上再整张读回来」。
 */
export function rowSampler(src, n, size) {
  const q = n / size, x0 = new Int32Array(size), x1 = new Int32Array(size), tx = new Float32Array(size);
  for (let x = 0; x < size; x++) { const f = Math.max(0, Math.min(n - 1, (x + 0.5) * q - 0.5)), i = Math.min(n - 1, f | 0); x0[x] = i * 4; x1[x] = Math.min(n - 1, i + 1) * 4; tx[x] = f - i; }
  return (y, ch, out, scale = 1, bias = 0) => {
    const f = Math.max(0, Math.min(n - 1, (Math.max(0, Math.min(size - 1, y)) + 0.5) * q - 0.5)), j = Math.min(n - 1, f | 0), ty = f - j, ra = j * n * 4 + ch, rb = Math.min(n - 1, j + 1) * n * 4 + ch;
    for (let x = 0; x < size; x++) {
      const t = tx[x], a = src[ra + x0[x]], b = src[rb + x0[x]], top = a + (src[ra + x1[x]] - a) * t, bot = b + (src[rb + x1[x]] - b) * t;
      out[x] = (top + (bot - top) * ty) * scale + bias;
    }
    return out;
  };
}
/**
 * 重新上色：src 是抹过字的原图（n × n 的 RGBA，只用它的明暗），放大到 size × size 写进 d（RGBA，连不透明度一起写；d 和 src 可以是同一个数组，前提是 size = n）。
 * A：analyse 在 n × n 上量出来的；grain：256 × 256 的细颗粒（0–1）；mask：patchMask（边长 ms）。
 * 放大后先锐化明暗（和上下左右四个像素的平均比），再按类别：底色 ×（原图的相对明暗，限幅、压缩），棱上断续地磨出钢色。
 */
export function finishBase(d, size, src, A, n, P, grain = null, mask = null, ms = 0) {
  const q = n / size, mq = ms / size, S = P.steel, Q = P.poly || P.steel, TS = toneTables(S), TQ = P.poly ? toneTables(Q) : TS, sh = P.sharpen, gk = grain ? P.grain : 0;
  const col = new Float32Array([...S.color, ...S.bare, ...Q.color, ...Q.bare]), steel = A.steel, kref = A.kref, kwref = A.kwref, last = size - 1;
  const wS = TS.wear, wQ = TQ.wear, sS = TS.shade, sQ = TQ.shade, row = rowSampler(src, n, size);
  // 只留三行放大后的明暗（上一行、这一行、下一行）：锐化要看上下左右
  let prev = row(0, 0, new Float32Array(size)), cur = row(0, 0, new Float32Array(size)), next = row(1, 0, new Float32Array(size));
  for (let y = 0; y < size; y++) {
    const jy = ((y * q) | 0) * n, my = ((y * mq) | 0) * ms, gy = (y & 255) * 256;
    for (let x = 0; x < size; x++) {
      const j = jy + ((x * q) | 0), st = !steel || steel[j] === 1, c = st ? 0 : 6;
      let l = cur[x]; l += (l - (cur[x > 0 ? x - 1 : x] + cur[x < last ? x + 1 : x] + prev[x] + next[x]) * 0.25) * sh; if (l < 0) l = 0;
      let k = (l * kref[j]) | 0, kw = (l * kwref[j]) | 0; if (k > VN) k = VN; if (kw > VN) kw = VN;
      let w = st ? wS[kw] : wQ[kw]; if (w > 0 && mask) w *= mask[my + ((x * mq) | 0)];
      let a = (st ? sS[k] : sQ[k]) * (1 - w); if (gk) a *= 1 + (grain[gy + (x & 255)] - 0.5) * gk;
      const o = (y * size + x) * 4;
      d[o] = (col[c] * a + col[c + 3] * w + 0.5) | 0; d[o + 1] = (col[c + 1] * a + col[c + 4] * w + 0.5) | 0; d[o + 2] = (col[c + 2] * a + col[c + 5] * w + 0.5) | 0; d[o + 3] = 255;
    }
    const t = prev; prev = cur; cur = next; next = row(y + 2, 0, t);
  }
}
/**
 * 法线贴图：src 是抹过字的原图（n × n 的 RGBA），放大到 size × size 写进 d（RGBA）。
 * 放大后锐化（握把片的防滑纹多锐一点），钢件平面上的压缩噪点抹平，重新归一。
 */
export function finishNormal(d, size, src, A, n, P) {
  const q = n / size, [sp, ss] = P.normal.sharpen, f0 = P.normal.flat[0] ** 2, f1 = P.normal.flat[1] ** 2, fk = 1 / (f1 - f0), steel = A.steel, last = size - 1, row = rowSampler(src, n, size), K = 1 / 127.5;
  const buf = () => new Float32Array(size);
  let px = row(0, 0, buf(), K, -1), cx = row(0, 0, buf(), K, -1), nx_ = row(1, 0, buf(), K, -1), py = row(0, 1, buf(), K, -1), cy = row(0, 1, buf(), K, -1), ny_ = row(1, 1, buf(), K, -1);
  for (let y = 0; y < size; y++) {
    const jy = ((y * q) | 0) * n;
    for (let x = 0; x < size; x++) {
      const st = !steel || steel[jy + ((x * q) | 0)] === 1, amt = st ? ss : sp, xl = x > 0 ? x - 1 : x, xr = x < last ? x + 1 : x;
      let nx = cx[x], ny = cy[x];
      nx += (nx - (cx[xl] + cx[xr] + px[x] + nx_[x]) * 0.25) * amt; ny += (ny - (cy[xl] + cy[xr] + py[x] + ny_[x]) * 0.25) * amt;
      let l2 = nx * nx + ny * ny;
      if (st && l2 < f1) { const t = l2 <= f0 ? 0 : (l2 - f0) * fk, keep = t * t * (3 - 2 * t); nx *= keep; ny *= keep; l2 *= keep * keep; }
      if (l2 > 0.98) { const s = Math.sqrt(0.98 / l2); nx *= s; ny *= s; l2 = 0.98; }
      const o = (y * size + x) * 4; d[o] = (nx * 127.5 + 128) | 0; d[o + 1] = (ny * 127.5 + 128) | 0; d[o + 2] = (Math.sqrt(1 - l2) * 127.5 + 128) | 0; d[o + 3] = 255;
    }
    let t = px; px = cx; cx = nx_; nx_ = row(y + 2, 0, t, K, -1);
    t = py; py = cy; cy = ny_; ny_ = row(y + 2, 1, t, K, -1);
  }
}
/** 细颗粒的高度图（可平铺，0–1）：两层细噪声，像喷砂 / 磷化过的钢面 */
export function grainHeight(size = 256, seed = 11) {
  const a = noiseField(size, size / 2, size / 2, seed), b = noiseField(size, size / 5 | 0, size / 5 | 0, seed + 7), o = new Float32Array(size * size);
  for (let i = 0; i < o.length; i++) o[i] = a[i] * 0.6 + b[i] * 0.4;
  return o;
}

// ---- 画布、贴图 ----
function readPixels(texture, size = texture?.image?.width, doc = hasCanvas() ? document : null) {
  const img = texture?.image; if (!doc || !img?.width) return null;
  const canvas = doc.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d', { willReadFrequently: true }); if (!g) return null;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  try { g.drawImage(img, 0, 0, size, size); const img2 = g.getImageData(0, 0, size, size); return { canvas, g, img: img2, d: img2.data, size }; } catch { return null; }
}
/** 一张空白的 size × size 画布（放大后的结果往里写） */
function blank(size) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'), img = g.createImageData(size, size);
  return { canvas, g, img, d: img.data, size };
}
const release = (P) => { P.canvas.width = P.canvas.height = 0; }; // 用完的画布马上放掉（手机上画布的内存是有限额的）
/** 算好的像素包成新贴图，沿用原贴图的翻转、平铺、色彩空间、通道 */
function wrap(src, P, anisotropy) {
  P.g.putImageData(P.img, 0, 0);
  const t = new THREE.CanvasTexture(P.canvas);
  t.flipY = src.flipY; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.colorSpace = src.colorSpace; t.channel = src.channel; t.anisotropy = anisotropy; t.name = src.name;
  t.repeat.copy(src.repeat); t.offset.copy(src.offset); t.rotation = src.rotation;
  return t;
}
const retire = (t) => { t.dispose(); t.image?.close?.(); };

/**
 * 只抹字、画螺帽，别的不动（整套表面处理做不了的时候退到这一步；老接口，测试也用它）。
 * 贴图的图换成画布（glTF 贴图不翻转，画布坐标就是贴图文件的像素坐标）。返回换了几张；没有 document（测试环境）什么都不做、返回 0。
 */
export function scrubMarkings(material, spec, doc = typeof document === 'undefined' ? null : document) {
  if (!doc || !spec || !material) return 0;
  let n = 0;
  for (const [key, kind] of [['map', 'color'], ['normalMap', 'normal'], ['roughnessMap', 'data'], ['metalnessMap', 'data']]) {
    const tex = material[key];
    if (!tex?.image?.width || tex.userData?.scrubbed) continue;
    const P = readPixels(tex, tex.image.width, doc); if (!P) continue;
    scrubPixels(P.d, P.size, P.size, spec, kind); P.g.putImageData(P.img, 0, 0);
    tex.image.close?.(); tex.image = P.canvas; tex.userData = { ...tex.userData, scrubbed: true }; tex.needsUpdate = true; n++;
  }
  return n;
}

/**
 * 手枪贴图的整理器。dress(material, scrub)：对一种材质（Slide / MainBody / Magazine）做上面那一整套——
 * 成功返回 true（颜色、金属粗糙度、法线换成新贴图，旧的已经释放；材质的颜色乘数改回白色：深色已经画进贴图里了）；
 * 没有 document、材质缺贴图、或者不是这三种材质，返回 false、材质不动。
 * ms：累计花了多少毫秒（steps：按步骤分的）；textures：整理器自己的贴图（细颗粒，几种材质共用）；dispose() 释放它们（材质上的新贴图由调用的人跟着材质一起释放）。
 */
export function createPistolSkin({ F = PISTOL_FINISH } = {}) {
  const own = new Set(), NOISE = 256, steps = {}; let detail = null, grain = null, noise = null, ms = 0;
  const scratch = () => {
    if (!grain) grain = grainHeight(256, 11);
    if (!noise) noise = fbmField(NOISE, 8, 8, 3, 23);
    if (!detail) {
      const s = F.detailSize, hgt = s === 256 ? grain : grainHeight(s, 11), nrm = heightToNormal(hgt, s, 1.2);
      const make = (fill) => { const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'), img = g.createImageData(s, s); fill(img.data); g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = F.anisotropy; own.add(t); return t; };
      detail = { normalMap: make((d) => d.set(nrm)), roughnessMap: make((d) => { for (let i = 0; i < s * s; i++) { const v = hgt[i] * 255; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } }) };
    }
  };
  return {
    get ms() { return ms; }, steps, textures: own,
    dress(material, scrub = null) {
      const P = F[material?.name], now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
      if (!hasCanvas() || !P || !material.map?.image?.width || !material.normalMap?.image?.width || !material.roughnessMap?.image?.width) return false;
      const t0 = now(), n = material.map.image.width; if (n % 4) return false;
      let tm = t0; const mark = (k) => { const t = now(); steps[k] = (steps[k] || 0) + t - tm; tm = t; };
      const B = readPixels(material.map, n), M = readPixels(material.roughnessMap, n), N = P.normal || scrub ? readPixels(material.normalMap, n) : null;
      if (!B || !M || ((P.normal || scrub) && !N)) return false;
      mark('read'); scratch(); mark('noise');
      if (scrub) { scrubRects(B.d, n, n, scrub, 'color'); scrubRects(M.d, n, n, scrub, 'data'); scrubRects(N.d, n, n, scrub, 'normal'); }
      mark('scrub'); const A = analyse(B.d, M.d, n, P), mask = patchMask(noise, P.patch); mark('analyse');
      finishMR(M.d, B.d, n, A, P, mask, NOISE); paintCaps(M.d, n, n, scrub, 'data'); mark('mr');
      const B2 = P.size === n ? B : blank(P.size); finishBase(B2.d, P.size, P.size === n ? B.d.slice() : B.d, A, n, P, grain, mask, NOISE); paintCaps(B2.d, P.size, P.size, scrub, 'color'); mark('base');
      const old = new Set([material.map, material.roughnessMap, material.metalnessMap].filter(Boolean));
      const mr = wrap(material.roughnessMap, M, F.anisotropy);
      material.map = wrap(material.map, B2, F.anisotropy); material.roughnessMap = mr; material.metalnessMap = mr;
      if (B2 !== B) release(B);
      if (N) {
        const ns = P.normal ? P.normal.size || P.size : n, N2 = ns !== n ? blank(ns) : N;
        if (P.normal) finishNormal(N2.d, N2.size, N2 === N ? N.d.slice() : N.d, A, n, P);
        paintCaps(N2.d, N2.size, N2.size, scrub, 'normal'); mark('normal');
        old.add(material.normalMap); material.normalMap = wrap(material.normalMap, N2, F.anisotropy);
        if (N2 !== N) release(N);
      }
      for (const t of old) retire(t);
      material.color.setScalar(1); material.metalness = 1; material.roughness = 1;
      addDetail(material, detail, P.detail);
      material.needsUpdate = true; material.userData.dressed = true;
      mark('wrap'); ms += now() - t0;
      return true;
    },
    /** 处理完所有材质以后调：放掉只在处理时用的大数组 */
    seal() { grain = null; noise = null; },
    dispose() { for (const t of own) t.dispose(); own.clear(); detail = null; grain = null; noise = null; },
  };
}
