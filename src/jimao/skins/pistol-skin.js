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
// 第二轮（按部件的 UV 岛处理，岛的位置从模型的网格里现算，不写死坐标）：
//   渗色：岛和岛之间缝里烤出来的白边换成岛自己的颜色——放大、mipmap 时不再混进白线（防滑槽上的横线、导轨上的斜亮痕、挂机杆的锯齿）；
//   压平：手动保险的拨片、空仓挂机杆、击锤这几件原图是发白的网纹 / 亮块，明暗压平、不磨；
//   槽壁：套筒防滑槽、减重槽的槽壁（按几何找）压暗、更涩——第一人称从后面看过去不再是一块发白、会闪的斜格子；
//   钢印：原来铭文那块平面上刻一行虚构的型号、编号；高光抗锯齿：法线在一个像素里变化大的地方高光摊开（specularAA）。
// 第三轮（套筒一转过去就是一块黑塑料、停电时瞄具看不清、握把片死黑）：
//   套筒的底色（金属的底色就是反光的颜色）提亮、粗糙度放宽、环境反射加强——转过去也有一片钢的光泽；
//   棱：按模型几何找真的凸棱 / 凹棱（creaseMask），凸棱断续磨亮、更光（暗场里轮廓靠它），凹棱积油泥（只脏凹处，大平面干净）；
//   击锤、握把保险整体压暗（dim）；握把片提亮、防滑纹的法线加深；握把螺帽缩小、外圈一道钢倒角、坐在圆窝里；瞄具加三个荧光点（addSightDots）。
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
 *   calm：哪些部件（网格名）的 UV 岛「压平」——原图在那儿是一块高反差的网纹或亮块（拨片、挂机杆），按原样上色就是全枪最亮、会闪的一块：
 *         明暗只留三成、不磨，网纹留在法线贴图里；
 *   groove：哪些部件上找防滑槽的槽壁（grooveWalls），grooveShade：只给槽壁用的那些像素颜色乘多少；calmShade：calm 部件再整体乘多少；
 *   clip [knee, slope]：颜色贴图的高光软压——亮度超过 knee（0–255）的部分只留 slope（磨出来的钢色也不会发白）；
 *   mark：钢印（见套筒那一项）。
 */
const STEEL_WEAR = Object.freeze([142, 145, 150]);
// 棱线（creaseMask）的参数：wear / grime 凸棱、凹棱的带宽（厘米）；angle 两面夹角多少开始算棱；maxPx 带宽最多几个像素；
// amount 凸棱最多磨掉多少；floor 噪声不放行的地方留几成（整条棱隐约有一道亮线，磨穿的地方断断续续）；rough 凸棱粗糙度降多少；
// dirt / dirtRough 凹棱压暗多少、粗糙度升多少；skip 不画的部件（弹匣卡笋这种小件一圈都是棱，画了就是一个亮点；握把片是橡胶，不磨也不算）；
// res 遮罩画多大（512：省一大半时间，用的时候双线性放大，带子还是顺的；maxPx 按这个尺寸算）
const CREASE = Object.freeze({ res: 512, wear: 0.075, grime: 0.15, angle: Object.freeze([0.42, 0.95]), maxPx: 3, amount: 0.5, floor: 0.32, rough: 0.16, dirt: 0.38, dirtRough: 0.1, skip: /(^|\|)(Button_0\d|BoltButton|SideSwitchHolder|GripBolt|Grip)_low/ });
export const PISTOL_FINISH = Object.freeze({
  detailSize: 256, anisotropy: 8, saa: 1.5, // saa：高光抗锯齿的倍数（见 specularAA）
  // 套筒：烤蓝是「蓝黑」，不是蓝漆——底色几乎是中性的深灰，只带一点冷色（饱和度以前那版的四成），冷色主要靠反光；
  // 平面粗糙度 0.4，棱和导轨磨得更光（roughWear）；手动保险的拨片（Safety）原图是一块发白的网纹，在腰射视角里是全枪最亮的一块、
  // 一动就闪：那几块 UV 岛按「calm」处理——颜色往套筒的底色压、不磨，网纹交给法线贴图
  Slide: Object.freeze({
    size: 1024, split: Object.freeze([0.3, 0.5]), cloud: 10, flatten: 0.8, sharpen: 0.7, grain: 0.05, patch: Object.freeze([0.3, 0.52]),
    steel: Object.freeze({ ref: 138, color: Object.freeze([86, 89, 97]), contrast: 0.85, lo: 0.4, hi: 1.3, wearAt: Object.freeze([1.36, 1.68]), wear: 0.7, bare: STEEL_WEAR,
      rough: 0.46, roughRef: 0.4, roughKeep: 0.3, roughWear: 0.14, roughCavity: 0.2, metal: 0.92 }),
    poly: null, env: 2.4,
    crease: CREASE,
    calm: /(^|\|)Safety_low/, groove: /(^|\|)(Slide|Safety)_low/, grooveShade: 0.62, calmShade: 0.9, clip: Object.freeze([112, 0.4]),
    normal: Object.freeze({ sharpen: Object.freeze([0.6, 0.6]), flat: Object.freeze([0.03, 0.09]) }),
    detail: Object.freeze({ scale: 22, strength: 0.08, rough: 0.08 }),
    // 套筒左侧原来铭文那块平面上打一行虚构的钢印（型号 + 编号），刻进去的：颜色压暗、粗糙度升高、法线是凹的字。
    // at：[x, y, 宽, 高]（512 贴图上的像素，和抹字的框同一块）；rot：字的方向（贴图上这块是竖着的）；size：字高（占框宽的几成）
    mark: Object.freeze({ at: Object.freeze([127, 142, 17, 84]), lines: Object.freeze(['P17', 'SN 0417-3326']), rot: -Math.PI / 2, flip: true, size: 0.27 }),
  }),
  // 套筒座：磷化的钢灰（比套筒浅一档、哑一档，金属度只有一半——磷化膜是一层有漫反射的结晶），握把片是黑橡胶（更暗、更涩、不反光）：
  // 两者明暗和光泽都分得开，停电时下半截不再是一整块黑。空仓挂机杆（SlideHolder）原图整块发白、边上一道锯齿亮线：也按 calm 压下去
  MainBody: Object.freeze({
    size: 1024, split: Object.freeze([0.25, 0.5]), cloud: 10, flatten: 0.92, sharpen: 0.7, grain: 0.06, patch: Object.freeze([0.34, 0.56]),
    steel: Object.freeze({ ref: 82, color: Object.freeze([70, 71, 74]), contrast: 0.62, lo: 0.4, hi: 1.3, wearAt: Object.freeze([1.42, 1.85]), wear: 0.55, bare: STEEL_WEAR,
      rough: 0.55, roughRef: 0.47, roughKeep: 0.25, roughWear: 0.12, roughCavity: 0.18, metal: 0.55 }),
    poly: Object.freeze({ ref: 45, color: Object.freeze([56, 56, 59]), contrast: 0.55, lo: 0.5, hi: 1.6, wearAt: Object.freeze([2.2, 3.4]), wear: 0.25, bare: Object.freeze([78, 78, 80]),
      rough: 0.7, roughRef: 0.55, roughKeep: 0.3, roughWear: 0.1, roughCavity: 0.08, metal: 0 }),
    calm: /(^|\|)(SlideHolder|Hammer|BackPart)_low/, clip: Object.freeze([112, 0.4]),
    dim: Object.freeze([Object.freeze([/(^|\|)Hammer_low/, 0.55]), Object.freeze([/(^|\|)BackPart_low/, 0.6])]), crease: CREASE,
    cap: Object.freeze({ head: 0.6, recess: Object.freeze([47, 47, 50]) }),
    normal: Object.freeze({ sharpen: Object.freeze([1.7, 0.6]), gain: Object.freeze([1.7, 1]), flat: Object.freeze([0.03, 0.09]) }),
    detail: Object.freeze({ scale: 22, strength: 0.2, rough: 0.12 }),
  }),
  Magazine: Object.freeze({
    size: 512, split: Object.freeze([0.25, 0.5]), cloud: 10, flatten: 0.8, sharpen: 0.5, grain: 0.05, patch: Object.freeze([0.36, 0.58]),
    steel: Object.freeze({ ref: 102, color: Object.freeze([60, 61, 64]), contrast: 0.85, lo: 0.4, hi: 1.3, wearAt: Object.freeze([1.45, 1.9]), wear: 0.5, bare: STEEL_WEAR,
      rough: 0.46, roughRef: 0.45, roughKeep: 0.25, roughWear: 0.12, roughCavity: 0.2, metal: 0.9 }),
    poly: null,
    calm: null, islands: false, clip: Object.freeze([112, 0.4]), // islands：弹匣只在换弹时露一下，不做 UV 岛那一步（省时间）
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
/**
 * 高度剖面。head = 1（老画法）：整个圆片是螺帽——边上一圈倒角、中间一道车出来的环槽、正中的内六角孔。
 * head < 1：螺帽只有 head × R 那么大，坐在握把片上一个沉下去的圆窝里（窝的外沿一道斜坡）——
 *   原来的圆片有一枚硬币那么大，整个画成黑螺帽就像握把片上被打穿了一个洞；实物的握把螺丝头不到一厘米。
 */
function capHeight(r, a, R, head = 1) {
  if (head >= 1) return smoothstep(R, R - 1.5, r) - 0.35 * Math.exp(-(((r - 0.72 * R) / 0.5) ** 2)) - 0.9 * capHole(r, a, R);
  const Rh = R * head;
  return -0.55 * smoothstep(R + 0.2, R - 1.4, r) + 1.1 * smoothstep(Rh + 0.3, Rh - 1.1, r) - 0.9 * capHole(r, a, Rh);
}
/**
 * 在贴图上画握把螺帽。spec.discs：[[cx, cy, R]]（512 贴图上的像素）。kind：'color' 画钢色（同心的车纹、倒角磨亮、六角孔里是黑的）；
 * 'data' 写金属度、粗糙度；'normal' 按高度剖面算法线（glTF 的法线贴图：绿通道朝图的上方）。返回画了多少像素。
 * opt.head：螺帽占圆片的几成（1 = 老画法：整片都是螺帽）；小于 1 时螺帽外面那一圈是握把片上的圆窝：颜色 opt.recess、粗糙度 opt.recessRough、不是金属。
 *   小螺帽：外圈一道磨亮的钢倒角（停电时它接住光，一看就是个金属件），里面是发黑的钢面和内六角。
 */
export function paintCaps(d, w, h, spec, kind = 'color', { head = 1, recess = [40, 40, 42], recessRough = 0.74 } = {}) {
  const k = w / 512; let n = 0;
  for (const [cx, cy, R] of spec?.discs || []) {
    const X = cx * k, Y = cy * k, x0 = Math.max(0, Math.floor(X - (R + 2) * k)), x1 = Math.min(w - 1, Math.ceil(X + (R + 2) * k)), y0 = Math.max(0, Math.floor(Y - (R + 2) * k)), y1 = Math.min(h - 1, Math.ceil(Y + (R + 2) * k));
    const small = head < 1, Rh = small ? R * head : R;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - X) / k, dy = (y + 0.5 - Y) / k, r = Math.hypot(dx, dy); if (r > R + 1.6) continue;
      const a = Math.atan2(dy, dx), i = (y * w + x) * 4, cover = smoothstep(R + 0.5, R - 0.3, r), seat = smoothstep(R + 1.6, R + 0.2, r) * (1 - cover); // seat：圆片外面一圈压进握把片的阴影
      const screw = small ? smoothstep(Rh + 0.5, Rh - 0.3, r) : 1; // 螺帽本身（小螺帽外面是圆窝）
      if (kind === 'normal') {
        const e = 0.25, H = (u, v) => capHeight(Math.hypot(u, v), Math.atan2(v, u), R, head);
        const gx = (H(dx + e, dy) - H(dx - e, dy)) / (2 * e), gy = (H(dx, dy + e) - H(dx, dy - e)) / (2 * e);
        const s = 0.9, nx = -gx * s, ny = gy * s, l = Math.hypot(nx, ny, 1), m = Math.max(cover, seat * 0.6);
        d[i] += ((nx / l * 0.5 + 0.5) * 255 - d[i]) * m; d[i + 1] += ((ny / l * 0.5 + 0.5) * 255 - d[i + 1]) * m; d[i + 2] += ((1 / l * 0.5 + 0.5) * 255 - d[i + 2]) * m;
      } else if (kind === 'data') {
        const hole = capHole(r, a, Rh), rim = smoothstep(Rh - 2.4 * (small ? 0.6 : 1), Rh - 1.2 * (small ? 0.6 : 1), r) * smoothstep(Rh, Rh - 0.8 * (small ? 0.6 : 1), r);
        const rough = 0.36 - 0.1 * rim + 0.3 * hole + 0.05 * Math.sin(r * 5.2 / (small ? head : 1));
        const R1 = rough * screw + recessRough * (1 - screw), M1 = 255 * screw;
        d[i + 1] += (R1 * 255 - d[i + 1]) * cover; d[i + 2] += (M1 - d[i + 2]) * cover;
      } else {
        const hole = capHole(r, a, Rh);
        let out;
        if (small) {
          // 钢圈：外沿 1.4 个像素宽的倒角，按方位明暗起伏一点（车出来的倒角在灯下不是一样亮）
          const ring = smoothstep(Rh - 2.2, Rh - 1.1, r) * smoothstep(Rh + 0.2, Rh - 0.5, r) * (0.75 + 0.25 * Math.sin(a * 2 + 0.9));
          const lathe = 1 + 0.06 * Math.sin(r * 9);
          const face = [64 * lathe, 66 * lathe, 70 * lathe], sc = [0, 0, 0];
          for (let c = 0; c < 3; c++) sc[c] = (face[c] + (128 - face[c]) * ring) * (1 - 0.78 * hole);
          const lip = 0.78 + 0.22 * smoothstep(R - 1.6, R, r); // 圆窝底下暗一点、外沿的斜坡接着握把片
          out = [0, 1, 2].map((c) => sc[c] * screw + recess[c] * lip * (1 - screw));
        } else {
          const rim = smoothstep(R - 2.4, R - 1.2, r) * smoothstep(R, R - 0.8, r) * (0.55 + 0.45 * Math.sin(a * 3 + 1.3));
          const lathe = 1 + 0.07 * Math.sin(r * 5.2) - 0.25 * Math.exp(-(((r - 0.72 * R) / 0.5) ** 2));
          const base = [50 * lathe, 52 * lathe, 57 * lathe]; out = [0, 0, 0];
          for (let c = 0; c < 3; c++) out[c] = (base[c] + (132 - base[c]) * rim * 0.6) * (1 - 0.72 * hole);
        }
        for (let c = 0; c < 3; c++) { d[i + c] *= 1 - 0.55 * seat * (small ? 0.4 : 1); d[i + c] += (out[c] - d[i + c]) * cover; }
      }
      n++;
    }
  }
  return n;
}
/** 一步做完：抹字 + 画螺帽（不走整套表面处理、只想去掉铭文的时候用） */
export function scrubPixels(d, w, h, spec, kind = 'color') { return scrubRects(d, w, h, spec, kind) + paintCaps(d, w, h, spec, kind); }

// ---- UV 岛 ----
/**
 * 把网格的 UV 三角形画成一张 n × n 的岛图（贴图像素坐标；glTF 的贴图不翻转，u、v 直接对应像素的 x、y）。
 * parts：[{ uv（Float32Array，每个顶点两个数）, index（可以没有）, code, pick（可以没有：每个三角形一个数，1 = 画、0 = 跳过） }]。
 * 按数组的顺序画，像素中心落在三角形里就写上 code（后画的盖住先画的）；0 = 不在任何岛上。贴图是平铺的：整个三角形先挪回 0–1 那一格。
 */
export function rasterParts(parts, n) {
  const out = new Uint8Array(n * n);
  for (const { uv, index, code, pick } of parts || []) {
    const count = index ? index.length : uv.length / 2;
    for (let t = 0; t + 2 < count; t += 3) {
      if (pick && !pick[t / 3]) continue;
      const a = index ? index[t] : t, b = index ? index[t + 1] : t + 1, c = index ? index[t + 2] : t + 2;
      const ox = Math.floor((uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3), oy = Math.floor((uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3);
      const ax = (uv[a * 2] - ox) * n, ay = (uv[a * 2 + 1] - oy) * n, bx = (uv[b * 2] - ox) * n, by = (uv[b * 2 + 1] - oy) * n, cx = (uv[c * 2] - ox) * n, cy = (uv[c * 2 + 1] - oy) * n;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(area) < 1e-9) continue;
      const s = area > 0 ? 1 : -1;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(n - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(n - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          if (s * ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) < 0 || s * ((cx - bx) * (py - by) - (cy - by) * (px - bx)) < 0 || s * ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) < 0) continue;
          out[y * n + x] = code;
        }
      }
    }
  }
  return out;
}
/**
 * 防滑槽、减重槽的槽壁：沿着部件长轴朝前 / 朝后的小三角形（pos：网格自己坐标里的顶点，每个顶点三个数）。返回每个三角形一个数（1 = 槽壁）。
 * 判断用相对尺寸：长轴 = 包围盒最长的那一边；「小」= 面积不到包围盒对角线平方的 0.08%（这把枪上一条槽壁不到 0.3 平方厘米）；
 * 同一个平面上这种小三角形的面积加起来超过对角线平方的 0.4%（约 2 平方厘米），是一整块端面，不算。
 */
export function grooveWalls(pos, index, { lean = 0.35, small = 8e-4, plane = 4e-3 } = {}) {
  const nv = pos.length / 3, count = index ? index.length : nv, nt = Math.floor(count / 3), pick = new Uint8Array(nt), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { const v = pos[i * 3 + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  const ext = [0, 1, 2].map((k) => hi[k] - lo[k]), ax = ext.indexOf(Math.max(...ext)), d2 = ext[0] ** 2 + ext[1] ** 2 + ext[2] ** 2, lim = small * d2, q = Math.sqrt(d2) * 0.004;
  // 先把朝长轴的小三角形按「在哪个平面上」分组：同一个平面上的面积加起来大的是端面（套筒后端面拆成一扇一扇的小三角形），不是槽壁
  const keys = new Array(nt), areaOf = new Map();
  for (let t = 0; t < nt; t++) {
    const a = (index ? index[t * 3] : t * 3) * 3, b = (index ? index[t * 3 + 1] : t * 3 + 1) * 3, c = (index ? index[t * 3 + 2] : t * 3 + 2) * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const cr = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(cr[0], cr[1], cr[2]); if (l <= 0) continue;
    if (Math.abs(cr[ax]) / l <= lean || l / 2 >= lim) continue;
    const n = cr.map((v) => v / l), dist = n[0] * pos[a] + n[1] * pos[a + 1] + n[2] * pos[a + 2];
    keys[t] = `${n.map((v) => Math.round(v * 20)).join(',')}|${Math.round(dist / q)}`; areaOf.set(keys[t], (areaOf.get(keys[t]) || 0) + l / 2);
  }
  for (let t = 0; t < nt; t++) if (keys[t] !== undefined && areaOf.get(keys[t]) < plane * d2) pick[t] = 1;
  return pick;
}
/**
 * 往岛外面「渗」几圈（RGBA，就地改 RGB）：岛外的像素取周围已经有值的像素的平均，一圈一圈往外推 passes 圈。
 * 原图岛和岛之间的缝里是烤出来的白边：放大、缩小（mipmap）的时候它们会被混进岛边上，第一人称里就是一道道白线
 * （套筒防滑槽上横穿的那条亮线、套筒座导轨上那道斜的亮痕、挂机杆上的锯齿）。缝里换成岛自己的颜色，就混不进白色了。
 * maps：一张或几张同尺寸的图（颜色、金属粗糙度、法线一起渗，邻居只找一遍）。返回改了多少像素。
 */
export function bleed(maps, n, cover, passes = 4) {
  const list = Array.isArray(maps) ? maps : [maps], L = list.length, N = n * n, have = new Uint8Array(N);
  for (let i = 0; i < N; i++) have[i] = cover[i] ? 1 : 0;
  // 这一圈要填的像素（front）和下一圈（next）：定长的整数数组，不用 JS 数组（只跑一次、引擎来不及优化）
  let front = new Int32Array(N), next = new Int32Array(N), nf = 0, changed = 0;
  for (let i = 0; i < N; i++) {
    if (have[i]) continue; const x = i % n;
    if ((x > 0 && have[i - 1] === 1) || (x < n - 1 && have[i + 1] === 1) || (i >= n && have[i - n] === 1) || (i < N - n && have[i + n] === 1)) { front[nf++] = i; have[i] = 2; }
  }
  let vals = new Float32Array(0);
  for (let p = 0; p < passes && nf > 0; p++) {
    if (vals.length < nf * 3 * L) vals = new Float32Array(nf * 3 * L);
    for (let k = 0; k < nf; k++) {
      const i = front[k], x = i % n, l = x > 0 && have[i - 1] === 1, r = x < n - 1 && have[i + 1] === 1, u = i >= n && have[i - n] === 1, dn = i < N - n && have[i + n] === 1, m = l + r + u + dn;
      for (let M = 0; M < L; M++) {
        const d = list[M], o = (k * L + M) * 3;
        for (let c = 0; c < 3; c++) { let s = 0; if (l) s += d[(i - 1) * 4 + c]; if (r) s += d[(i + 1) * 4 + c]; if (u) s += d[(i - n) * 4 + c]; if (dn) s += d[(i + n) * 4 + c]; vals[o + c] = s / m; }
      }
    }
    let nn = 0;
    for (let k = 0; k < nf; k++) {
      const i = front[k], o4 = i * 4; have[i] = 1;
      for (let M = 0; M < L; M++) { const d = list[M], o = (k * L + M) * 3; d[o4] = vals[o]; d[o4 + 1] = vals[o + 1]; d[o4 + 2] = vals[o + 2]; }
    }
    for (let k = 0; k < nf; k++) {
      const i = front[k], x = i % n;
      if (x > 0 && have[i - 1] === 0) { have[i - 1] = 2; next[nn++] = i - 1; } if (x < n - 1 && have[i + 1] === 0) { have[i + 1] = 2; next[nn++] = i + 1; }
      if (i >= n && have[i - n] === 0) { have[i - n] = 2; next[nn++] = i - n; } if (i < N - n && have[i + n] === 0) { have[i + n] = 2; next[nn++] = i + n; }
    }
    changed += nf; const t = front; front = next; next = t; nf = nn;
  }
  return changed;
}

// ---- 棱线（按模型的几何找） ----
/**
 * 棱线遮罩：按模型的几何找出凸棱（两个面折过去、往外拱）和凹棱（往里折），在贴图上沿着棱画一条窄带。
 * 为什么要：原图里烤出来的亮棱只在正侧面对着光时看得出来，枪一转（四分之三侧、俯视、腰射）套筒就是一整块黑——
 *   磨损要落在真的棱上（防滑槽的齿尖、枪口一圈、抛壳窗的边、套筒顶上的两条角），宽度按实物算（毫米），不随 UV 岛的大小变；
 *   凹棱是积灰、油泥的地方：只脏凹处，大平面干净（以前的大片云斑像是低分辨率的脏）。
 * parts：[{ pos, uv, index, nrm?, unit? }]（unit：这件网格的 1 个单位在模型里是几厘米，节点有缩放时要它）；n：遮罩边长（像素）。
 * 判断：两个面的夹角超过 angle[0] 开始算、到 angle[1] 算满；两边共用同一套顶点（法线是顺的：圆柱、圆弧）的门槛再抬高一半——
 *   低模的圆柱一圈都是 20° 上下的折面，按硬棱画就是一圈斑马条。
 * wear / grime：凸棱、凹棱的带宽（厘米）；带宽换成像素以后最多 maxPx。返回 { convex, concave, n }（Float32Array n × n，0–1）。
 */
export function creaseMask(parts, n, { wear = 0.08, grime = 0.16, angle = [0.4, 0.9], maxPx = 6 } = {}) {
  const convex = new Float32Array(n * n), concave = new Float32Array(n * n);
  for (const { pos, uv, index, nrm, unit = 1 } of parts || []) {
    if (!pos || !uv) continue;
    const nv = pos.length / 3, count = index ? index.length : nv, nt = Math.floor(count / 3), vi = (t, k) => (index ? index[t * 3 + k] : t * 3 + k);
    // 位置相同的顶点焊成一个（硬棱、UV 接缝处顶点是拆开的）
    const weld = new Int32Array(nv), keys = new Map();
    for (let i = 0; i < nv; i++) { const k = `${Math.round(pos[i * 3] * 2000)},${Math.round(pos[i * 3 + 1] * 2000)},${Math.round(pos[i * 3 + 2] * 2000)}`; let w = keys.get(k); if (w === undefined) { w = keys.size; keys.set(k, w); } weld[i] = w; }
    const fn = new Float32Array(nt * 3), fc = new Float32Array(nt * 3), fa = new Float32Array(nt);
    for (let t = 0; t < nt; t++) {
      const a = vi(t, 0) * 3, b = vi(t, 1) * 3, c = vi(t, 2) * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, l = Math.hypot(cx, cy, cz) || 1;
      fn[t * 3] = cx / l; fn[t * 3 + 1] = cy / l; fn[t * 3 + 2] = cz / l; fa[t] = l / 2;
      for (let k = 0; k < 3; k++) fc[t * 3 + k] = (pos[a + k] + pos[b + k] + pos[c + k]) / 3;
    }
    // 在一个三角形里沿它的第 e 条边（顶点 e → e+1）画带：离边越近越满，出了三角形不画。
    // 只扫带子盖到的像素：每一行先按「到这条直线的距离 ≤ 带宽」算出一段 x（斜的长边不再扫整个包围盒——那样一条斜棱就是几万个像素）
    const T = new Float64Array(6), E = new Float64Array(9);
    const band = (t, e, s, out, widthCm) => {
      const ia = vi(t, 0), ib = vi(t, 1), ic = vi(t, 2), ox = Math.floor((uv[ia * 2] + uv[ib * 2] + uv[ic * 2]) / 3), oy = Math.floor((uv[ia * 2 + 1] + uv[ib * 2 + 1] + uv[ic * 2 + 1]) / 3);
      T[0] = (uv[ia * 2] - ox) * n; T[1] = (uv[ia * 2 + 1] - oy) * n; T[2] = (uv[ib * 2] - ox) * n; T[3] = (uv[ib * 2 + 1] - oy) * n; T[4] = (uv[ic * 2] - ox) * n; T[5] = (uv[ic * 2 + 1] - oy) * n;
      const cr = (T[2] - T[0]) * (T[5] - T[1]) - (T[3] - T[1]) * (T[4] - T[0]), uvArea = Math.abs(cr) / 2;
      if (uvArea < 1e-6 || fa[t] <= 0) return;
      const wpx = Math.min(maxPx, (widthCm / unit) * Math.sqrt(uvArea / fa[t])); if (wpx < 0.3) return;
      const ax = T[e * 2], ay = T[e * 2 + 1], bx = T[((e + 1) % 3) * 2], by = T[((e + 1) % 3) * 2 + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; if (L2 <= 0) return;
      const L = Math.sqrt(L2), nx = -dy / L, ny = dx / L, W = wpx + 0.5, sg = cr > 0 ? 1 : -1, tol = 0.7, lo = wpx * 0.35, span = W - lo;
      // 三条边的内侧判断（带一点容差，接缝上的像素也算进来）：e·(p − p0) ≥ −tol
      for (let k = 0; k < 3; k++) { const px0 = T[k * 2], py0 = T[k * 2 + 1], ex = T[((k + 1) % 3) * 2] - px0, ey = T[((k + 1) % 3) * 2 + 1] - py0, el = Math.sqrt(ex * ex + ey * ey) || 1; E[k * 3] = -sg * ey / el; E[k * 3 + 1] = sg * ex / el; E[k * 3 + 2] = -(E[k * 3] * px0 + E[k * 3 + 1] * py0); }
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - W)), y1 = Math.min(n - 1, Math.ceil(Math.max(ay, by) + W)), bx0 = Math.max(0, Math.floor(Math.min(ax, bx) - W)), bx1 = Math.min(n - 1, Math.ceil(Math.max(ax, bx) + W));
      const c0 = -(nx * ax + ny * ay);
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5, c = ny * py + c0; let x0 = bx0, x1 = bx1;
        if (Math.abs(nx) > 1e-6) { const u0 = (-c - W) / nx - 0.5, u1 = (-c + W) / nx - 0.5; x0 = Math.max(bx0, Math.floor(Math.min(u0, u1))); x1 = Math.min(bx1, Math.ceil(Math.max(u0, u1))); }
        else if (Math.abs(c) > W) continue;
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          if (E[0] * px + E[1] * py + E[2] < -tol || E[3] * px + E[4] * py + E[5] < -tol || E[6] * px + E[7] * py + E[8] < -tol) continue;
          let u = ((px - ax) * dx + (py - ay) * dy) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
          const qx = px - ax - u * dx, qy = py - ay - u * dy, d = Math.sqrt(qx * qx + qy * qy); if (d > W) continue;
          let k = (d - lo) / span; k = k < 0 ? 0 : k > 1 ? 1 : k; const v = s * (1 - k * k * (3 - 2 * k)), i = y * n + x; if (v > out[i]) out[i] = v;
        }
      }
    };
    const seen = new Map(), nw = keys.size;
    for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
      const wa = weld[vi(t, e)], wb = weld[vi(t, (e + 1) % 3)]; if (wa === wb) continue;
      const key = wa < wb ? wa * nw + wb : wb * nw + wa, other = seen.get(key);
      if (other === undefined) { seen.set(key, t * 3 + e); continue; }
      if (other < 0) continue; seen.set(key, -1); // 三个以上的面共一条边（非流形）不管
      const t2 = (other / 3) | 0, e2 = other % 3, cos = fn[t * 3] * fn[t2 * 3] + fn[t * 3 + 1] * fn[t2 * 3 + 1] + fn[t * 3 + 2] * fn[t2 * 3 + 2], ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      // 顺滑：两边用的是同一对顶点（没拆开），或者拆开了但法线一样（只是 UV 接缝）
      const ra = vi(t, e), rb = vi(t, (e + 1) % 3), sa = vi(t2, e2), sb = vi(t2, (e2 + 1) % 3);
      let smooth = (ra === sa || ra === sb) && (rb === sa || rb === sb);
      if (!smooth && nrm) { const same = (i, j) => nrm[i * 3] * nrm[j * 3] + nrm[i * 3 + 1] * nrm[j * 3 + 1] + nrm[i * 3 + 2] * nrm[j * 3 + 2] > 0.97; smooth = same(ra, weld[sa] === weld[ra] ? sa : sb) && same(rb, weld[sb] === weld[rb] ? sb : sa); }
      const s = smooth ? smoothstep(angle[0] * 1.5, angle[1] * 1.5, ang) : smoothstep(angle[0], angle[1], ang); if (s <= 0.02) continue;
      const dx = fc[t2 * 3] - fc[t * 3], dy = fc[t2 * 3 + 1] - fc[t * 3 + 1], dz = fc[t2 * 3 + 2] - fc[t * 3 + 2], out = fn[t * 3] * dx + fn[t * 3 + 1] * dy + fn[t * 3 + 2] * dz < 0;
      band(t, e, s, out ? convex : concave, out ? wear : grime); band(t2, e2, s, out ? convex : concave, out ? wear : grime);
    }
  }
  return { convex, concave, n };
}

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
export function analyse(base, mr, n, P, islands = null) {
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
  // 钢件 / 握把片按金属度分：先在 7 × 7 里取平均再分——原图金属度通道上有 JPEG 的零星黑点，逐像素分的话钢件上会冒出一撮一撮「橡胶黑」（击锤背面那块黑斑）
  let metal = null; if (Q) { metal = new Float32Array(N); for (let i = 0; i < N; i++) metal[i] = mr[i * 4 + 2]; metal = boxBlur(metal, n, n, 3); }
  for (let y = 0; y < n; y++) {
    const ly = (y >> 2) * q;
    for (let x = 0; x < n; x++) {
      const i = y * n + x, l = ly + (x >> 2), st = !Q || metal[i] > cut;
      if (steel) steel[i] = st ? 1 : 0;
      kref[i] = VQ / (st ? ts[l] : tp[l]); kwref[i] = VQ / (st ? ws[l] : wp[l]);
    }
  }
  // calm（0–1）：落在 calm 部件 UV 岛上（islands 是 rasterParts 的结果：2 = calm、3 = 槽壁）的像素「压平」——明暗只留三成、不磨，纹路交给法线
  const calm = new Float32Array(N); if (islands) for (let i = 0; i < N; i++) calm[i] = islands[i] >= 2 ? 1 : 0;
  // groove：只给槽壁用的像素（3）。第一人称从后面看过去，一排槽壁正对着镜头、每一面都映着亮处，就是一块发白的斜格子——颜色压暗、更涩
  let groove = null; if (islands) { groove = new Uint8Array(N); for (let i = 0; i < N; i++) groove[i] = islands[i] === 3 ? 1 : 0; }
  return { steel, kref, kwref, calm, groove };
}
/** 磨损断续用的噪声（size × size，可平铺）按 patch = [lo, hi] 变成 0–1 的遮罩 */
export function patchMask(noise, patch) { const o = new Float32Array(noise.length); for (let i = 0; i < o.length; i++) o[i] = smoothstep(patch[0], patch[1], noise[i]); return o; }
/**
 * 重写金属粗糙度贴图（n × n，就地）：粗糙度去方块、往目标值收拢，磨亮处更光、凹缝更涩；金属度按类别写。
 * base：同尺寸的颜色贴图（抹过字的原图）；A：analyse 的结果；mask：patchMask 的结果（边长 ms）。
 */
export function finishMR(mr, base, n, A, P, mask = null, ms = 0) {
  const N = n * n, g = new Uint8Array(N); for (let i = 0; i < N; i++) g[i] = mr[i * 4 + 1];
  const S = P.steel, Q = P.poly || P.steel, TS = toneTables(S), TQ = P.poly ? toneTables(Q) : TS, mq = ms / n, steel = A.steel, kref = A.kref, kwref = A.kwref, calm = A.calm, groove = A.groove || null;
  // 每类表面的常数排成一行：[目标粗糙度, 原图粗糙度, 留多少, 磨亮处降多少（已经除掉 wear）, 凹缝升多少, 金属度 × 255]
  const row = (C) => [C.rough, C.roughRef, C.roughKeep, C.wear > 0 ? C.roughWear / C.wear : 0, C.roughCavity, (C.metal * 255) | 0], K = new Float32Array([...row(S), ...row(Q)]);
  const wS = TS.wear, wQ = TQ.wear, cS = TS.cav, cQ = TQ.cav, k6 = 1 / (6 * 255);
  // 棱线（creaseMask）：凸棱磨得更光（暗场里套筒的轮廓靠这一圈高光撑起来）、凹棱里积了油泥更涩
  const E = A.crease && P.crease ? A.crease : null, Ec = E ? E.convex : null, Ed = E ? E.concave : null, En = E ? E.n : 0, eq = En / n, EK = P.crease || {};
  for (let y = 0; y < n; y++) {
    const up = y > 0 ? -n : 0, dn = y < n - 1 ? n : 0, my = ((y * mq) | 0) * ms, ey = E ? (((y + 0.5) * eq) | 0) * En : 0;
    for (let x = 0; x < n; x++) {
      const i = y * n + x, st = !steel || steel[i] === 1, c = st ? 0 : 6, l = base[i * 4];
      const r0 = (g[i] * 2 + g[i + (x > 0 ? -1 : 0)] + g[i + (x < n - 1 ? 1 : 0)] + g[i + up] + g[i + dn]) * k6;
      let k = (l * kref[i]) | 0, kw = (l * kwref[i]) | 0; if (k > VN) k = VN; if (kw > VN) kw = VN;
      const cm = calm ? calm[i] : 0, w = (st ? wS[kw] : wQ[kw]) * (mask ? mask[my + ((x * mq) | 0)] : 1) * (1 - cm), cav = st ? cS[k] : cQ[k];
      let rough = K[c] + (r0 - K[c + 1]) * K[c + 2] - w * K[c + 3] + cav * K[c + 4] + 0.1 * cm + (groove !== null && groove[i] ? 0.2 : 0); const o = i * 4; // 细纹区、槽壁涩一点：一排棱的高光不再连成一片
      if (E !== null && st) { const ei = ey + (((x + 0.5) * eq) | 0), ev = Ec[ei], dv = Ed[ei]; if (ev > 0) rough -= ev * EK.rough * (EK.floor + (1 - EK.floor) * (mask ? mask[my + ((x * mq) | 0)] : 1)) * (1 - cm); if (dv > 0) rough += dv * EK.dirtRough; }
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
 * 放大后先锐化明暗（和上下左右四个像素的平均比），再按类别：底色 ×（原图的相对明暗，限幅、压缩），棱上断续地磨出钢色；
 * calm 的像素明暗再压、不磨；最后按 P.clip 把高光软压一道。
 */
export function finishBase(d, size, src, A, n, P, grain = null, mask = null, ms = 0) {
  const q = n / size, mq = ms / size, S = P.steel, Q = P.poly || P.steel, TS = toneTables(S), TQ = P.poly ? toneTables(Q) : TS, sh = P.sharpen, gk = grain ? P.grain : 0;
  const col = new Float32Array([...S.color, ...S.bare, ...Q.color, ...Q.bare]), steel = A.steel, kref = A.kref, kwref = A.kwref, calm = A.calm || null, groove = A.groove || null, last = size - 1;
  const knee = P.clip ? P.clip[0] : 255, slope = P.clip ? P.clip[1] : 1, gShade = P.grooveShade ?? 1, cShade = P.calmShade ?? 1;
  const wS = TS.wear, wQ = TQ.wear, sS = TS.shade, sQ = TQ.shade, row = rowSampler(src, n, size), dim = A.dim || null;
  const E = A.crease && P.crease ? A.crease : null, Ec = E ? E.convex : null, Ed = E ? E.concave : null, En = E ? E.n : 0, eq = En / size, EK = P.crease || {};
  // 棱线遮罩比这张图小（512 上画、1024 上用）：双线性取值，带子的边是顺的、不是两个像素一级的台阶
  let ex0 = null, ex1 = null, etx = null;
  if (E) { ex0 = new Int32Array(size); ex1 = new Int32Array(size); etx = new Float32Array(size); for (let x = 0; x < size; x++) { const f = Math.max(0, Math.min(En - 1, (x + 0.5) * eq - 0.5)), i = Math.min(En - 1, f | 0); ex0[x] = i; ex1[x] = Math.min(En - 1, i + 1); etx[x] = f - i; } }
  // 只留三行放大后的明暗（上一行、这一行、下一行）：锐化要看上下左右
  let prev = row(0, 0, new Float32Array(size)), cur = row(0, 0, new Float32Array(size)), next = row(1, 0, new Float32Array(size));
  for (let y = 0; y < size; y++) {
    const jy = ((y * q) | 0) * n, my = ((y * mq) | 0) * ms, gy = (y & 255) * 256;
    let ey0 = 0, ey1 = 0, ety = 0; if (E) { const f = Math.max(0, Math.min(En - 1, (y + 0.5) * eq - 0.5)), i = Math.min(En - 1, f | 0); ey0 = i * En; ey1 = Math.min(En - 1, i + 1) * En; ety = f - i; }
    for (let x = 0; x < size; x++) {
      const j = jy + ((x * q) | 0), st = !steel || steel[j] === 1, c = st ? 0 : 6;
      let l = cur[x]; l += (l - (cur[x > 0 ? x - 1 : x] + cur[x < last ? x + 1 : x] + prev[x] + next[x]) * 0.25) * sh; if (l < 0) l = 0;
      let k = (l * kref[j]) | 0, kw = (l * kwref[j]) | 0; if (k > VN) k = VN; if (kw > VN) kw = VN;
      const cm = calm !== null ? calm[j] : 0;
      let w = st ? wS[kw] : wQ[kw]; if (w > 0 && mask) w *= mask[my + ((x * mq) | 0)];
      let a = st ? sS[k] : sQ[k];
      if (cm > 0) { w *= 1 - cm; a += (0.9 + (a - 1) * 0.3 - a) * cm; a *= groove !== null && groove[j] === 1 ? gShade : cShade; } // 压平：明暗只留三成、整体略暗一点（纹路在法线里）
      // 真的棱上断续地磨出钢色（floor：噪声不放行的地方也留一点，整条棱的走向看得出来，但不是一圈白边）；凹棱里压暗（油泥）
      let dirt = 0;
      if (E !== null && st) {
        const a0 = ey0 + ex0[x], a1 = ey0 + ex1[x], b0 = ey1 + ex0[x], b1 = ey1 + ex1[x], tx = etx[x];
        const t0 = Ec[a0] + (Ec[a1] - Ec[a0]) * tx, ev = t0 + (Ec[b0] + (Ec[b1] - Ec[b0]) * tx - t0) * ety;
        const d0 = Ed[a0] + (Ed[a1] - Ed[a0]) * tx; dirt = d0 + (Ed[b0] + (Ed[b1] - Ed[b0]) * tx - d0) * ety;
        if (ev > 0) { const we = ev * EK.amount * (EK.floor + (1 - EK.floor) * (mask ? mask[my + ((x * mq) | 0)] : 1)) * (1 - 0.6 * cm); if (we > w) w = we; }
      }
      a *= 1 - w; if (gk) a *= 1 + (grain[gy + (x & 255)] - 0.5) * gk;
      if (dirt > 0) a *= 1 - dirt * EK.dirt;
      if (dim !== null) a *= dim[j];
      let r = col[c] * a + col[c + 3] * w, g = col[c + 1] * a + col[c + 4] * w, b = col[c + 2] * a + col[c + 5] * w;
      const lum = (r + g + b) * (1 / 3); if (lum > knee) { const f = (knee + (lum - knee) * slope) / lum; r *= f; g *= f; b *= f; }
      const o = (y * size + x) * 4;
      d[o] = (r + 0.5) | 0; d[o + 1] = (g + 0.5) | 0; d[o + 2] = (b + 0.5) | 0; d[o + 3] = 255;
    }
    const t = prev; prev = cur; cur = next; next = row(y + 2, 0, t);
  }
}
/**
 * 法线贴图：src 是抹过字的原图（n × n 的 RGBA），放大到 size × size 写进 d（RGBA）。
 * 放大后锐化（握把片的防滑纹多锐一点），钢件平面上的压缩噪点抹平，重新归一。
 */
export function finishNormal(d, size, src, A, n, P) {
  const q = n / size, [sp, ss] = P.normal.sharpen, [gp, gs] = P.normal.gain || [1, 1], f0 = P.normal.flat[0] ** 2, f1 = P.normal.flat[1] ** 2, fk = 1 / (f1 - f0), steel = A.steel, last = size - 1, row = rowSampler(src, n, size), K = 1 / 127.5;
  const buf = () => new Float32Array(size);
  let px = row(0, 0, buf(), K, -1), cx = row(0, 0, buf(), K, -1), nx_ = row(1, 0, buf(), K, -1), py = row(0, 1, buf(), K, -1), cy = row(0, 1, buf(), K, -1), ny_ = row(1, 1, buf(), K, -1);
  for (let y = 0; y < size; y++) {
    const jy = ((y * q) | 0) * n;
    for (let x = 0; x < size; x++) {
      const st = !steel || steel[jy + ((x * q) | 0)] === 1, amt = st ? ss : sp, xl = x > 0 ? x - 1 : x, xr = x < last ? x + 1 : x;
      let nx = cx[x], ny = cy[x];
      nx += (nx - (cx[xl] + cx[xr] + px[x] + nx_[x]) * 0.25) * amt; ny += (ny - (cy[xl] + cy[xr] + py[x] + ny_[x]) * 0.25) * amt;
      if (!st && gp !== 1) { nx *= gp; ny *= gp; } else if (st && gs !== 1) { nx *= gs; ny *= gs; } // gain：握把片的防滑点、斜纹起伏加深（停电时只有它们接得住光）
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

// ---- 钢印 ----
/**
 * 钢印的「刻深」遮罩：在一块小画布上按 spec 写字（转到 spec.rot 的方向），读回来当 0–1 的深度。k：贴图边长 ÷ 512。
 * 返回 { x, y, w, h, a }（贴图像素坐标里的框和深度）；没有画布时返回 null。
 */
export function markMask(spec, k, doc = hasCanvas() ? document : null) {
  if (!doc || !spec?.lines?.length) return null;
  const x = Math.round(spec.at[0] * k), y = Math.round(spec.at[1] * k), w = Math.max(1, Math.round(spec.at[2] * k)), h = Math.max(1, Math.round(spec.at[3] * k));
  const c = doc.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); if (!g?.fillText) return null;
  const across = Math.abs(Math.sin(spec.rot || 0)) > 0.5 ? w : h, along = across === w ? h : w, px = Math.max(5, spec.size * across), L = spec.lines.length;
  let img;
  try {
    g.clearRect(0, 0, w, h); g.translate(w / 2, h / 2); g.rotate(spec.rot || 0); if (spec.flip) g.scale(-1, 1); // flip：这块 UV 岛是镜像的，字要反着写才正
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `500 ${px.toFixed(1)}px sans-serif`;
    spec.lines.forEach((line, i) => g.fillText(line, 0, (i - (L - 1) / 2) * px * 1.3, along * 0.92));
    img = g.getImageData(0, 0, w, h).data;
  } catch { return null; } // 画不了字（假画布、跨域）就不打钢印
  const a = new Float32Array(w * h); for (let i = 0; i < a.length; i++) a[i] = img[i * 4 + 3] / 255;
  c.width = c.height = 0;
  return { x, y, w, h, a };
}
/**
 * 把钢印刻进一张图（RGBA，边长 n；mask 是 markMask 在同一尺寸上的结果）。kind：
 *   'color' 字里压暗（刻痕里存了油泥、没有反光）；'data' 字里粗糙度升高；'normal' 按刻深算出字边上朝里的斜面，叠到原法线上。
 */
export function applyMark(d, n, mask, kind = 'color') {
  if (!mask) return 0;
  const { x: X, y: Y, w, h, a } = mask, at = (x, y) => a[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  let hit = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = a[y * w + x], gx = (at(x + 1, y) - at(x - 1, y)) * 0.5, gy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
    if (v <= 0.01 && Math.abs(gx) + Math.abs(gy) <= 0.01) continue;
    const tx = X + x, ty = Y + y; if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
    const o = (ty * n + tx) * 4; hit++;
    if (kind === 'color') { const f = 1 - 0.3 * v; d[o] *= f; d[o + 1] *= f; d[o + 2] *= f; }
    else if (kind === 'data') d[o + 1] = Math.min(255, d[o + 1] + 0.16 * 255 * v);
    else {
      // 刻进去：高度 = −v。和握把螺帽同一个约定（绿通道朝图的上方）
      let nx = d[o] / 127.5 - 1 + gx * 0.9, ny = d[o + 1] / 127.5 - 1 - gy * 0.9; const l2 = Math.min(0.98, nx * nx + ny * ny), s = l2 < nx * nx + ny * ny ? Math.sqrt(l2 / (nx * nx + ny * ny)) : 1;
      nx *= s; ny *= s; d[o] = nx * 127.5 + 128; d[o + 1] = ny * 127.5 + 128; d[o + 2] = Math.sqrt(1 - nx * nx - ny * ny) * 127.5 + 128;
    }
  }
  return hit;
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
 * 高光抗锯齿：three 本来就按「这个像素里几何法线变化多大」给粗糙度加一点（geometryRoughness），这里再加 k 倍。
 * 为什么要：套筒后部那排防滑槽、顶上前端的减重槽是真的模型细节，第一人称的距离上一道槽不到一个像素宽——
 * 每道槽朝后的那面都接住主光，就成了一块发白的斜格子，枪一动就闪（换贴图救不了，它们在贴图上散在几十个小岛里）。
 * 法线在像素里变化大的地方高光摊开、变暗；大平面上这一项是 0，不受影响。只改着色器里的一行，每帧没有额外的贴图读取。
 */
export function specularAA(material, k = 1.5) {
  if (!material || !(k > 0)) return material;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n{ float gA = clamp( geometryRoughness * ${k.toFixed(2)}, 0.0, 1.0 );\n#ifdef USE_NORMALMAP_TANGENTSPACE\ngA = max( gA, clamp( ( 1.0 - length( texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0 ) ) * ${(k * 4).toFixed(2)}, 0.0, 1.0 ) );\n#endif\n material.roughness = min( material.roughness + gA * 0.5, 1.0 ); material.specularColor *= 1.0 - 0.55 * gA; material.diffuseColor *= 1.0 - 0.55 * gA; }`);
  };
  const key = material.customProgramCacheKey?.call(material) || '';
  material.customProgramCacheKey = () => `${key}|saa${k}`; // 和别的枪共用 addDetail 的材质分开编译
  material.needsUpdate = true;
  return material;
}

/**
 * 瞄具的荧光点（准星一个、照门两个）：一圈白漆、中间一点发光的绿（夜光管）。
 * 为什么要：原模型的照门、准星和套筒一样黑，开镜时照门是一块黑砖、准星是缺口里看不清的小黑点——停电时根本瞄不了；
 * 白天看到的是白圈（漆），停电时看到的是三个绿点（自己发光，不靠灯）。
 * spec：{ glow 发光的颜色（线性 RGB，别太亮：过了色调映射会发白、看不出是绿的），items: [{ node 挂在哪个节点上（准星不动、照门跟着套筒走）,
 *   at 点的中心（模型坐标，厘米）, normal 点朝哪边（模型坐标）, r [发光的半径, 白圈外半径]（厘米）, glow 这一个点单独的颜色（可以不写） }] }。
 * 返回 { meshes, geometries, materials }（调用的人负责释放）；找不到节点的跳过；没有 spec 什么都不加。
 */
export function addSightDots(scene, spec) {
  const made = { meshes: [], geometries: [], materials: [] };
  if (!scene || !spec?.items?.length) return made;
  scene.updateMatrixWorld(true);
  // polygonOffset：点贴在面上（只抬起一点点），往镜头这边让一下深度，不和瞄具的面打架
  const off = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const paint = new THREE.MeshStandardMaterial({ name: 'sight-paint', color: 0xd2d4ca, roughness: 0.55, metalness: 0, ...off });
  made.materials.push(paint);
  const glows = new Map(), glowOf = (c) => { const k = c.join(','); if (!glows.has(k)) { const m = new THREE.MeshBasicMaterial({ name: 'sight-glow', color: new THREE.Color(...c), ...off }); glows.set(k, m); made.materials.push(m); } return glows.get(k); };
  const geo = new Map(), shape = (kind, a, b) => { const k = `${kind}${a}|${b}`; if (!geo.has(k)) { const g = kind === 'ring' ? new THREE.RingGeometry(a, b, 28) : new THREE.CircleGeometry(a, 20); geo.set(k, g); made.geometries.push(g); } return geo.get(k); };
  const Z = new THREE.Vector3(0, 0, 1), inv = new THREE.Matrix4(), p = new THREE.Vector3(), nv = new THREE.Vector3();
  for (const it of spec.items) {
    const node = scene.getObjectByName(it.node); if (!node) continue;
    inv.copy(node.matrixWorld).invert().multiply(scene.matrixWorld);
    const s = inv.getMaxScaleOnAxis(); p.set(...it.at).applyMatrix4(inv); nv.set(...it.normal).transformDirection(inv);
    const g = new THREE.Group(); g.name = `${it.node}-dot`; g.position.copy(p).addScaledVector(nv, 0.012 * s); g.quaternion.setFromUnitVectors(Z, nv); g.scale.setScalar(s);
    const ring = new THREE.Mesh(shape('ring', it.r[0], it.r[1]), paint), dot = new THREE.Mesh(shape('disc', it.r[0], 0), glowOf(it.glow || spec.glow || [0.2, 0.75, 0.15]));
    for (const m of [ring, dot]) { m.castShadow = m.receiveShadow = false; m.frustumCulled = false; g.add(m); made.meshes.push(m); }
    node.add(g);
  }
  return made;
}

/**
 * 手枪贴图的整理器。dress(material, scrub, parts)：对一种材质（Slide / MainBody / Magazine）做上面那一整套——
 * parts：用这个材质的网格 [{ name, uv, index }]（UV 岛的白边渗掉、calm 部件压平都靠它；没有就跳过这两步）；
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
    dress(material, scrub = null, parts = null) {
      const P = F[material?.name], now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
      if (!hasCanvas() || !P || !material.map?.image?.width || !material.normalMap?.image?.width || !material.roughnessMap?.image?.width) return false;
      const t0 = now(), n = material.map.image.width; if (n % 4) return false;
      let tm = t0; const mark = (k) => { const t = now(); steps[k] = (steps[k] || 0) + t - tm; tm = t; };
      const B = readPixels(material.map, n), M = readPixels(material.roughnessMap, n), N = P.normal || scrub ? readPixels(material.normalMap, n) : null;
      if (!B || !M || ((P.normal || scrub) && !N)) return false;
      mark('read'); scratch(); mark('noise');
      if (scrub) { scrubRects(B.d, n, n, scrub, 'color'); scrubRects(M.d, n, n, scrub, 'data'); scrubRects(N.d, n, n, scrub, 'normal'); }
      mark('scrub');
      // UV 岛：缝里的白边换成岛自己的颜色（三张图都换），顺便标出要「压平」的部件
      let isl = null;
      if (parts?.length && P.islands !== false) {
        // 先画槽壁（3），再把其余三角形盖上去（普通 1、calm 部件 2）：和平面共用的那几块贴图保持原样，只有专给槽壁用的像素才压暗
        const walls = parts.map((p) => (P.groove && p.pos && P.groove.test(p.name) ? grooveWalls(p.pos, p.index) : null));
        const list = [];
        parts.forEach((p, i) => { if (walls[i]) list.push({ uv: p.uv, index: p.index, code: 3, pick: walls[i] }); });
        parts.forEach((p, i) => list.push({ uv: p.uv, index: p.index, code: P.calm && P.calm.test(p.name) ? 2 : 1, pick: walls[i] ? walls[i].map((v) => 1 - v) : null }));
        isl = rasterParts(list, n);
        bleed(N ? [B.d, N.d] : [B.d], n, isl); // 金属粗糙度不渗：缝里混进来的只是一点粗糙度，看不出来，省下三分之一的时间
      }
      mark('islands'); const A = analyse(B.d, M.d, n, P, isl), mask = patchMask(noise, P.patch); mark('analyse');
      // 个别部件整体压暗（dim：[[部件名, 乘数]]）——击锤、海狸尾朝后上方，腰射、开镜时正对着灯，是全枪最亮的一块，把视线从准星上拉走
      if (P.dim && parts?.length) {
        const list = []; parts.forEach((p) => { const k = P.dim.findIndex(([re]) => re.test(p.name)); if (k >= 0) list.push({ uv: p.uv, index: p.index, code: k + 1 }); });
        if (list.length) { const r = rasterParts(list, n); A.dim = new Float32Array(n * n).fill(1); for (let i = 0; i < r.length; i++) if (r[i]) A.dim[i] = P.dim[r[i] - 1][1]; }
      }
      // 真的棱（按几何找）：凸棱磨、凹棱脏。遮罩按颜色贴图的尺寸画（带宽一两个毫米，512 上画会糊成一片）
      if (P.crease && parts?.length) A.crease = creaseMask(parts.filter((p) => p.pos && !(P.crease.skip && P.crease.skip.test(p.name))), P.crease.res || P.size, P.crease);
      mark('crease');
      const stamp = (k) => (P.mark ? markMask(P.mark, k / 512) : null), capOpt = P.cap || {};
      finishMR(M.d, B.d, n, A, P, mask, NOISE); paintCaps(M.d, n, n, scrub, 'data', capOpt); applyMark(M.d, n, stamp(n), 'data'); mark('mr');
      const B2 = P.size === n ? B : blank(P.size); finishBase(B2.d, P.size, P.size === n ? B.d.slice() : B.d, A, n, P, grain, mask, NOISE); paintCaps(B2.d, P.size, P.size, scrub, 'color', capOpt); applyMark(B2.d, P.size, stamp(P.size), 'color'); mark('base');
      const old = new Set([material.map, material.roughnessMap, material.metalnessMap].filter(Boolean));
      const mr = wrap(material.roughnessMap, M, F.anisotropy);
      material.map = wrap(material.map, B2, F.anisotropy); material.roughnessMap = mr; material.metalnessMap = mr;
      if (B2 !== B) release(B);
      if (N) {
        const ns = P.normal ? P.normal.size || P.size : n, N2 = ns !== n ? blank(ns) : N;
        if (P.normal) finishNormal(N2.d, N2.size, N2 === N ? N.d.slice() : N.d, A, n, P);
        paintCaps(N2.d, N2.size, N2.size, scrub, 'normal', capOpt); applyMark(N2.d, N2.size, stamp(N2.size), 'normal'); mark('normal');
        old.add(material.normalMap); material.normalMap = wrap(material.normalMap, N2, F.anisotropy);
        if (N2 !== N) release(N);
      }
      for (const t of old) retire(t);
      material.color.setScalar(1); material.metalness = 1; material.roughness = 1; if (P.env) material.envMapIntensity = P.env;
      addDetail(material, detail, P.detail); specularAA(material, F.saa);
      material.needsUpdate = true; material.userData.dressed = true;
      mark('wrap'); ms += now() - t0;
      return true;
    },
    /** 处理完所有材质以后调：放掉只在处理时用的大数组 */
    seal() { grain = null; noise = null; },
    dispose() { for (const t of own) t.dispose(); own.clear(); detail = null; grain = null; noise = null; },
  };
}
