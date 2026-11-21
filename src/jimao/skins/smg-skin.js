// V45 冲锋枪的贴图整理（smg.js 的 attach 里调一次）。
// 模型自带的三套贴图（枪、手套、袖子；颜色 / 金属粗糙度 / 法线，1024 的 JPEG）压得很狠，直接用有这些毛病：
//   1) 粗糙度、金属度上全是 8×8 的压缩方块和大片云斑——高光一块亮一块暗，看着像脏塑料；
//   2) 整把枪的金属度都是 0.3–0.5 的中间值：机匣、弹匣、枪托、导轨一个质感，分不出哪是钢哪是塑料；
//   3) 原作者把「棱边磨亮」烘进了颜色贴图：每条棱、每个 UV 岛的边上都有一条粗细亮度不变的浅线，
//      暗场里看就是给枪描了一圈白边；岛外面的填充色也是这个浅灰，缩小采样时再往里渗一圈；
//   4) 颜色偏暖、糊；法线贴图的平面上有压缩噪点；手套的布面粗糙度只有 0.45（发亮，像橡胶）。
// 这里在加载时把像素重算一遍（只算一次），再在着色器里叠平铺的细节：
//   零件：贴图本身分不出零件（弹匣和机匣在原贴图里是同一种材质），所以从模型的三角形量——
//       按网格名、按 UV 岛在枪上的位置把每个岛归到一类（机匣聚合物 / 枪托 / 托底橡胶 / 弹匣 / 钢件 / 裸钢 / 导轨 / 弹壳），
//       画成一张和贴图一样大的「零件图」，顺带记下每个像素在枪上的位置（合模线、托底横棱、弹匣擦痕靠它定位）。
//   颜色：每类有自己的深浅和色调；大片云斑压掉一半多（机匣留得多一点——全抹平了是一块没有用过的新塑料）；
//       细碎的斑点减半（挪到粗糙度上；机匣只减三成多），划痕留着；
//       凹处（槽、孔、销子周围、弹匣口里）压暗、更哑，凸棱断断续续地亮一点、更光——机匣在腰射的距离上才不是一整块平的深灰；
//       握把和枪托是同一种黑塑料（不磨光、不发亮）；
//       烘进去的亮棱绝大部分抹掉，只在一张低频噪声选中的三四成长度上留一截（亮度打六折），
//       凹槽、散热孔的沿不留；弹匣口、抛壳窗、拉机柄槽、枪托铰链这些真会磨的地方留得多一点；岛外的填充色改成和岛内一样深。
//   粗糙度 / 金属度：按类重定（聚合物金属度 0、哑光；弹匣是烤蓝薄钢、更光、有顺着插拔方向的擦痕；导轨是阳极氧化的缎面；
//       销子、枪机是磨亮的钢），再叠大范围的起伏、手常摸的地方磨光一点、凹处积灰更哑；没有镜面一样的地方。
//   细节（着色器里平铺）：枪托是模压的麻点（疏），机匣是很细的麻点，钢件是磷化颗粒——各类各用多少写在一张「权重图」里。
//       枪上的细节按零件自己坐标里的位置铺、不按 UV：玩家腰射、开镜时看得最多的枪托顶面，在贴图上只是二十个像素宽的一条，
//       贴图里画什么都是糊的，按 UV 铺的颗粒在那儿也又大又扁；按位置铺，整把枪的颗粒一样大（见 skinShader）。
//       大范围的斑驳（颜色、粗糙度）、灯色收敛、环境反射压低也在着色器里。
//       枪托顶面的 UV 是左右镜像的（两半共用一块贴图）：画在贴图里的蹭痕、斑点在开镜时会左右对称地出现两遍，
//       所以枪托上不往贴图里画任何不对称的东西，斑驳按零件坐标在着色器里算。
//   右手：模型自带的握姿食指、中指伸在扳机护圈外面，像在比剪刀手；SMG_GRIP 把它们扣回握把上（gripPose，smg.js 每帧在动画之后套上）。
//   手：布面不反光（粗糙度抬到 0.85 以上）、叠一层平纹织物；手掌的皮面略亮一点、叠细皮纹。颜色和法线贴图不动。
// 贴图里没有任何厂牌字样（逐块放大看过颜色和法线贴图），不需要抹字。
// 耗时是按「第一次跑」（代码还没被引擎优化）控制的：金属粗糙度贴图缩到 512 再算，大范围的平均值在缩小的图上算，
// 没被任何三角形用到的像素（占四成）直接填底色；几个大循环的写法见 inBatches、boxBlur 上面的说明。
// 像素运算全是纯函数（类型数组进、就地改），测试环境没有 document 时 skinSmg 什么都不做。
import * as THREE from 'three';
import { noiseField, fbmField, seeded } from '../gun-surface.js';

const hasCanvas = () => typeof document !== 'undefined';
const BATCH = 8, SPREAD = 32; // 逐像素的循环一批跑几行、先隔几行跑一行（见 boxBlur 上面的说明）
/**
 * 把 rows(K, ya, yb, step)（处理第 ya、ya + step…… 行，不到 yb）对 0 到 h 的每一行各调到一次。
 * 先隔 SPREAD 行跑一行、一次只跑一行，再把其余的按 BATCH 行一批补上：
 *   一张贴图从上到下是不同的零件，照顺序跑的话引擎拿最上面几十行（多半是空白）学到的情况去优化，
 *   往下每碰到一种没见过的零件，优化好的代码就作废重来一次（这个函数编译一次要几十毫秒）；
 *   头几次只跑一行，是让函数从头到尾先完整走过几遍——不然循环后面的收尾还没跑过就被优化，一出循环又作废。
 */
function inBatches(rows, K, h) {
  for (let y = 0; y < h; y += SPREAD) rows(K, y, y + 1, 1);
  for (let y = 0; y < h; y += SPREAD) for (let k = 1; k < SPREAD; k += BATCH) rows(K, y + k, Math.min(y + Math.min(k + BATCH, SPREAD), h), 1);
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 平滑阶跃：x 从 lo 到 hi，结果从 0 到 1 */
export const smoothstep = (lo, hi, x) => { const t = clamp01((x - lo) / (hi - lo)); return t * t * (3 - 2 * t); };

/** 零件的类别（零件图里每个像素一个）。NONE：没有三角形用到这个像素 */
export const PART = Object.freeze({ BODY: 0, STOCK: 1, RUBBER: 2, MAG: 3, STEEL: 4, BRIGHT: 5, RAIL: 6, BRASS: 7, SIGHT: 8, NONE: 255 });
/** 零件图里的标记位。CONTACT：经常磕碰摩擦的地方（磨损留得多）；HANDLED：手常握的地方（磨光）；GUTTER：岛外面补的一圈边 */
export const ZONE = Object.freeze({ CONTACT: 1, HANDLED: 2, GUTTER: 128 });

const part = (o) => Object.freeze({ ...o, tint: Object.freeze(o.tint) });
/**
 * 调参表。亮度都是 0–255 的贴图值（sRGB）；粗糙度、金属度是 0–1。
 * size：颜色、法线贴图的边长；mrSize：金属粗糙度贴图、权重图的边长；partSize：零件图的边长；detailSize：细节贴图的边长；pad：岛外补几个像素的边（零件图的像素）。
 * gun.parts：按 PART 的编号排。tone 大面的平均亮度往这个值靠（flatten：靠多少；0 = 不改深浅）；plain 原贴图上几个到十几个像素宽的明暗带抹掉几成（枪托顶上两条浅带，看着像条纹）；tint 去掉原来的暖色以后乘上的色调；
 *     rough / metal 这一类的粗糙度、金属度；min 粗糙度下限；wear 烘焙的亮棱最多留几成（乘 edge.max）；bare 磨亮处露不露钢（金属度往 1 靠多少）；
 *     accent 原贴图标成裸钢的小件（销子、螺丝）算不算数；stipple / fine / grain 三种细节各用多少；
 *     keep 原贴图里细碎的起伏留几成、ao 遮蔽的下限——托底在贴图上只有二十来个像素宽，上面画的东西（一个小方框、烘进去的阴影）放大十倍是几块糊斑，不如不要；
 *     mottle 细碎斑点按 grit 减多少（1 = 照减，机匣只减三成多：原贴图的旧斑是它唯一的「用过」的痕迹）；
 *     cav 凹处的颜色压暗几成（负的是提亮：枪托凹处积的是浅灰）；lit 凸棱见光提亮多少（贴图值，噪声选中的地方才满）。
 * gun.metal：没有零件图时（假模型）的退路——原贴图金属度低于 lo 当聚合物、高于 hi 当钢件。accent：[lo, hi] 摊开以后的金属度高于这个的是裸钢小件。
 * gun.keepSat：[lo, hi] 颜色鲜艳到这个程度的小标记（快慢机的红点、弹壳）不动调子；bright：[拐点, 斜率, 粗糙度下限] 比拐点亮的灰白压下来（快慢机那根白杆子变成磨亮的钢）。
 *     那根杆子其实是画在快慢机平面上的一道白漆：压到磨亮的钢那么亮还不够——平面金属、粗糙度 0.4，主光一扫整条反白，所以粗糙度也抬到下限以上。
 * gun.grit：细碎起伏的处理。小于 soft 的乘 low（斑点减半），大于 hard 的乘 high（划痕锐化），中间过渡。
 * gun.edge：烘焙亮棱。reach 隔几个像素找两侧的暗底；min 比周围亮多少才算；bevel 法线偏多少算在棱上；keep 没被选中的地方留几成；max 选中的地方留几成；
 *     patch [lo, hi] 断续（噪声低于 lo 的不留）；contact 常磕碰处把门槛降多少；recess 旁边比大面暗到这个比例算凹槽、ao 遮蔽低于这个也算——都不留。
 * gun.cloud：大范围起伏。albedo 颜色 ±；rough 粗糙度 ±；polish 磨光处粗糙度降多少、gate [lo, hi] 噪声门槛、handled 手握处把门槛降多少；
 *     cheek 枪托上高于这个高度（模型单位）的是顶上贴腮的那一条，门槛降 cheekBias（磨光的是其中几块，不是一整条）；side 枪托侧面、腹板的疏麻点打几折（贴近看太粗像橘子皮）；dust 凹处粗糙度升多少。
 * gun.rough：flatten 往这一类的值靠多少、blur 去方块的模糊半径（按 1024 的像素算）、max 上限；scratch：亮划痕处降多少；wear：留下的亮棱处降多少。
 * gun.neutral：直接光的颜色往灰里收几成；gun.env：非金属的环境反射压多狠（反射越亮压得越多：白天的黑塑料不泛灰，停电时暗处的那点反光还在）。
 * gun.curv：凹凸（法线贴图的散度，见 curvature）。reach 隔几个像素量；lo / hi 散度从多少到多少算「有」到「满」；ao 遮蔽贴图的暗处颜色压几成；
 *     rough 凹处粗糙度升多少（积灰）；gloss 凸棱粗糙度降多少（磨亮，主光扫过时那条棱先亮）；patch 凸棱见光的最低几成（其余看噪声，不是每条棱都一样亮）。
 * gun.grip：握把（机匣上标 HANDLED 的岛）。和枪托同一种黑塑料：颜色乘 dark、粗糙度不低于 rough、不磨光——磨光了在换弹时是全枪最亮的一块，像一块铝。
 * gun.mottle：着色器里按零件坐标叠的大范围斑驳（见 skinShader）。scale 每个模型单位几个周期；albedo 颜色 ±；rough 粗糙度 ±；metal 金属件上打几折。
 * gun.f90：聚合物掠射角的反光打几折（1 = 不动）。暗场里轮廓光是冷色的，黑塑料的侧面被它一擦就是一片藏蓝。
 * gun.ribs：托底的横棱。pitch 间距（模型单位，1 ≈ 1.5 厘米）；dark 沟里压暗；bump 法线；steep [lo, hi] 高度在贴图上每像素变多少（1/256 模型单位）才算朝后的面。 gun.streak：弹匣的插拔擦痕。light 提亮；rough 降粗糙度。
 * gun.flat：[lo, hi] 法线偏离正上方小于 lo 的当噪点抹平，大于 hi 的原样留着。
 * A / B / C：着色器里叠的三层细节（scale 铺多密——枪是每个模型单位铺几次，手是在 UV 上铺几次；normal 法线强弱、rough 对粗糙度的影响、tint 对颜色的影响）。
 *     枪：A 疏麻点（枪托）、B 磷化颗粒（钢件）、C 细麻点（机匣）；手：A 皮纹、B 织物。
 */
export const SMG_SKIN = Object.freeze({
  size: 1024, mrSize: 512, partSize: 512, detailSize: 256, anisotropy: 8, pad: 1.5,
  gun: Object.freeze({
    parts: Object.freeze([
      // 机匣：冷一点的炭黑，比枪托深半档；原贴图的旧斑留得多（全抹平了像一层灰喷漆），凹处积黑、凸棱见光都最明显
      part({ name: 'body', tone: 32, flatten: 0.22, plain: 0, tint: [0.97, 1, 1.045], rough: 0.68, metal: 0, min: 0.5, wear: 0.6, bare: 0, accent: 1, stipple: 0, fine: 1, grain: 0, keep: 1, ao: 0, mottle: 0.15, cav: 0.34, lit: 6 }),
      // 枪托：凹处（镂空的内沿、铰链根）积的是浅色的灰，不是黑泥——黑塑料上灰尘发白
      part({ name: 'stock', tone: 40, flatten: 0.8, plain: 0.85, tint: [1, 1, 1.01], rough: 0.7, metal: 0, min: 0.52, wear: 0.5, bare: 0, accent: 0, stipple: 1, fine: 0.3, grain: 0, keep: 1, ao: 0, mottle: 1, cav: -0.12, lit: 0 }),
      part({ name: 'rubber', tone: 31, flatten: 0.8, plain: 1, tint: [1, 1, 1], rough: 0.88, metal: 0, min: 0.75, wear: 0, bare: 0, accent: 0, stipple: 0, fine: 0.7, grain: 0, keep: 0, ao: 0.86, mottle: 1, cav: 0, lit: 0 }),
      // 弹匣：磷化的薄钢板，哑光（原来 0.44 的粗糙度在暗场里是一整条镜面反光，像漆过的玻璃）
      part({ name: 'mag', tone: 38, flatten: 0.7, plain: 0, tint: [0.95, 0.99, 1.06], rough: 0.6, metal: 0.55, min: 0.5, wear: 0.8, bare: 1, accent: 0, stipple: 0, fine: 0, grain: 0.6, keep: 1, ao: 0, mottle: 1, cav: 0.25, lit: 4 }),
      part({ name: 'steel', tone: 38, flatten: 0.65, plain: 0, tint: [0.96, 1, 1.05], rough: 0.58, metal: 0.8, min: 0.4, wear: 0.8, bare: 1, accent: 1, stipple: 0, fine: 0, grain: 1, keep: 1, ao: 0, mottle: 1, cav: 0.3, lit: 6 }),
      part({ name: 'bright', tone: 0, flatten: 0, plain: 0, tint: [0.98, 1, 1.03], rough: 0.4, metal: 1, min: 0.32, wear: 1, bare: 1, accent: 0, stipple: 0, fine: 0, grain: 0.6, keep: 1, ao: 0, mottle: 1, cav: 0.25, lit: 0 }),
      // 导轨：缎面，比机匣光一截——齿顶要接得住主光，暗场里才分得出一道一道
      part({ name: 'rail', tone: 34, flatten: 0.7, plain: 0, tint: [0.97, 1, 1.04], rough: 0.52, metal: 0.3, min: 0.42, wear: 0.8, bare: 1, accent: 1, stipple: 0, fine: 0, grain: 0.4, keep: 1, ao: 0, mottle: 1, cav: 0.3, lit: 7 }),
      part({ name: 'brass', tone: 0, flatten: 0, plain: 0, tint: [1, 1, 1], rough: 0.36, metal: 1, min: 0.3, wear: 1, bare: 0, accent: 0, stipple: 0, fine: 0, grain: 0.2, keep: 1, ao: 0, mottle: 1, cav: 0, lit: 0 }),
      // 照门、准星：哑黑（真枪也是，免得反光晃眼）——准星护圈只有一两个像素粗，亮了在暗背景上是一圈虚线；
      // 只在凸棱上留一点见光，轮廓不至于在暗场里化掉
      part({ name: 'sight', tone: 26, flatten: 0.8, plain: 0, tint: [0.98, 1, 1.03], rough: 0.8, metal: 0.1, min: 0.66, wear: 0.3, bare: 0.5, accent: 0, stipple: 0, fine: 0, grain: 0.8, keep: 1, ao: 0, mottle: 1, cav: 0.2, lit: 4 }),
    ]),
    metal: Object.freeze([0.25, 0.4]), accent: Object.freeze([0.64, 0.8]),
    lowRadius: 20, lowClamp: 110, bg: Object.freeze([32, 33, 35]),
    keepSat: Object.freeze([22, 46]), bright: Object.freeze([84, 0.08, 0.55]),
    grit: Object.freeze({ soft: 4, hard: 11, low: 0.5, high: 1.5 }),
    edge: Object.freeze({ reach: 3, min: 1.5, bevel: 0.07, keep: 0.1, max: 0.62, patch: Object.freeze([0.5, 0.64]), contact: 0.18, recess: 0.62, ao: 0.72 }),
    cloud: Object.freeze({ albedo: 0.11, rough: 0.12, polish: 0.2, gate: Object.freeze([0.5, 0.66]), handled: 0.2, cheek: 10.4, cheekBias: 0.05, side: 0.6, dust: 0.1 }),
    rough: Object.freeze({ flatten: 0.7, blur: 3, max: 0.94, scratch: 0.14, wear: 0.12 }),
    neutral: 0.6, env: 10,
    curv: Object.freeze({ reach: 2, lo: 4, hi: 16, ao: 0.5, rough: 0.12, gloss: 0.1, patch: 0.35 }),
    grip: Object.freeze({ dark: 0.84, rough: 0.74 }),
    mottle: Object.freeze({ scale: 0.11, albedo: 0.4, rough: 0.2, metal: 0.45 }),
    ribs: Object.freeze({ pitch: 0.62, dark: 0.3, bump: 0.3, steep: Object.freeze([8, 14]) }),
    streak: Object.freeze({ light: 16, rough: 0.14 }),
    flat: Object.freeze([0.025, 0.08]), f90: 0.8,
    A: Object.freeze({ scale: 0.18, normal: 0.45, rough: 0.14, tint: 0.14 }),  // 枪托：模压的麻点
    B: Object.freeze({ scale: 0.2, normal: 0.16, rough: 0.1, tint: 0.04 }),   // 钢件：磷化颗粒
    C: Object.freeze({ scale: 0.62, normal: 0.1, rough: 0.07, tint: 0.04 }),  // 机匣：细麻点
  }),
  hands: Object.freeze({
    leather: Object.freeze([27, 36]),        // 颜色暗于 lo 的是手掌的皮面，亮于 hi 的是布面
    f90: 0.4,                                // 布、哑光皮：掠射角不泛白
    rough: Object.freeze({ fabric: 0.9, leather: 0.64, keep: 0.25, min: 0.5 }),
    glove: Object.freeze({ A: Object.freeze({ scale: 14, normal: 0.25, rough: 0.12, tint: 0.1 }), B: Object.freeze({ scale: 28, normal: 0.22, rough: 0.05, tint: 0.07 }) }),
    // 袖子的织物：一根线在第一人称的距离上要比一个像素细——铺得粗了近看像麻袋、稍远就是一片斜着爬的摩尔纹；
    // 法线也压一半，袖子的明暗交给褶皱，织纹只是贴近了才看得出的那层布感
    sleeve: Object.freeze({ B: Object.freeze({ scale: 44, normal: 0.15, rough: 0.04, tint: 0.05 }) }),
  }),
});

// 关于写法：下面几个大循环都拆成「一个函数只有一个循环」，逐像素的那两个按几行一批反复调。
// 引擎是按函数热起来的——一个只调一次、里面排着好几个大循环的函数，每个循环都要从解释执行重新热一遍
// （前一个循环热好的代码走到没跑过的下一个循环就作废），第一次跑要多花一两倍的时间；而第一次跑正是玩家等的那一次。
function blurRows(a, b, w, h, r, k) {
  for (let y = 0; y < h; y++) {
    const o = y * w; let s = a[o] * (r + 1); for (let i = 1; i <= r; i++) s += a[o + (i < w ? i : w - 1)];
    for (let x = 0; x < w; x++) { b[o + x] = s * k; const xa = x + r + 1, xb = x - r; s += a[o + (xa < w ? xa : w - 1)] - a[o + (xb > 0 ? xb : 0)]; }
  }
}
function blurCols(b, a, acc, w, h, r, k) { // 按行扫，每列一个累加器
  for (let x = 0; x < w; x++) acc[x] = b[x] * (r + 1);
  for (let i = 1; i <= r; i++) { const o = (i < h ? i : h - 1) * w; for (let x = 0; x < w; x++) acc[x] += b[o + x]; }
  for (let y = 0; y < h; y++) {
    const o = y * w, ya = y + r + 1, yb = y - r, oa = (ya < h ? ya : h - 1) * w, ob = (yb > 0 ? yb : 0) * w;
    for (let x = 0; x < w; x++) { a[o + x] = acc[x] * k; acc[x] += b[oa + x] - b[ob + x]; }
  }
}
/**
 * 盒式模糊（单通道 Float32Array，就地；边上按边缘像素延伸）。r：半径；passes：做几遍（两遍接近高斯）。
 * 用滑动求和，耗时和半径无关。返回 a 本身。
 */
export function boxBlur(a, w, h, r, passes = 1) {
  if (r < 1) return a;
  const b = new Float32Array(a.length), acc = new Float32Array(w), k = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) { blurRows(a, b, w, h, r, k); blurCols(b, a, acc, w, h, r, k); }
  return a;
}

// ---- 零件图：从三角形量 ----
/**
 * 这把枪的一个 UV 岛归哪一类。name：网格名；lo / hi：岛在网格自己坐标里的包围盒（[x, y, z]）。
 * 机身（WeaponBody）的坐标：z 朝枪口为正（托底 −38、枪口 +43），y 朝上（握把底 −8.6、照门顶 +17.9），x 左右对称（±2）；1 ≈ 1.5 厘米。
 * 返回 类别 + 标记 × 256；不认识的网格返回 −1（假模型：不画零件图，按原贴图的金属度分）。
 */
export function classifySmg(name, lo, hi) {
  if (/magazine|clip/i.test(name)) return PART.MAG + ZONE.CONTACT * 256;
  if (/round|bullet|cartridge/i.test(name)) return PART.BRASS;
  if (/bolt|charging|carrier/i.test(name)) return PART.BRIGHT; // 「拉机柄」那个网格其实是抛壳窗里露出来的枪机
  if (/trigger/i.test(name)) return PART.STEEL;
  if (!/body/i.test(name)) return -1;
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2;
  if (hi[2] <= -36) return PART.RUBBER;                                   // 托底
  if (cz < -12.5) return PART.STOCK;                                      // 枪托（骨架、腹板）
  if (cz < -6.5 && cy > 5 && cy < 12.5) return PART.STEEL + ZONE.CONTACT * 256; // 枪托铰链、锁扣
  if (lo[1] >= 11 && hi[1] > 14.2) return PART.SIGHT;                     // 照门、准星
  if (lo[2] >= 38.2 || (cz > 22 && Math.abs(cx) < 0.4 && hi[0] - lo[0] < 2.6 && lo[1] > 7.4 && hi[1] < 10.4)) return PART.STEEL; // 枪口、枪管
  if (cz > 22 && cy >= 3.3 && cy < 7 && hi[1] <= 7.8) return PART.RAIL;   // 护木下面的导轨
  let zone = 0;
  if (cz > 10 && cz < 21 && hi[1] <= 7.1 && lo[1] >= 0.4) zone |= ZONE.CONTACT;                    // 弹匣口
  if (lo[0] <= -2.2 && cz > 8 && cz < 19 && cy > 7 && cy < 12) zone |= ZONE.CONTACT;               // 抛壳窗
  if (cz > 22 && cy > 11.5 && cy < 14.2 && Math.abs(cx) > 0.5) zone |= ZONE.CONTACT;               // 拉机柄槽
  if (hi[1] <= 5.4 && ((cz > -8 && cz < 4) || cz > 26)) zone |= ZONE.HANDLED;                      // 握把、前握把
  return PART.BODY + zone * 256;
}

/**
 * partMap 里填一个三角形（S：partMap 的数组和当前网格的顶点；ia / ib / ic：三个顶点的编号；code：类别 + 标记 × 256）。
 * 单独一个函数、一个三角形调一次：几千次调用下来各种朝向的三角形都见过了，引擎优化出来的代码不会半路作废。
 */
function fillTriangle(S, ia, ib, ic, code) {
  const { cls, zone, X, Y, size, pad, pos, uv } = S;
  // 像素中心在 (i + 0.5) / size；glTF 的贴图不翻转，v = 0 是最上面一行
  const ax = uv[ia * 2] * size - 0.5, ay = uv[ia * 2 + 1] * size - 0.5, bx = uv[ib * 2] * size - 0.5, by = uv[ib * 2 + 1] * size - 0.5, cx = uv[ic * 2] * size - 0.5, cy = uv[ic * 2 + 1] * size - 0.5;
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (!(Math.abs(area) > 1e-6)) return;
  const s = area > 0 ? 1 : -1, inv = 1 / (area * s);
  const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - pad)), x1 = Math.min(size - 1, Math.floor(Math.max(ax, bx, cx) + pad)), y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - pad)), y1 = Math.min(size - 1, Math.floor(Math.max(ay, by, cy) + pad));
  if (x1 < x0 || y1 < y0) return;
  // 三条边的边函数（朝里为正）和「岛外 pad 像素以内」的门槛
  const e0x = (by - cy) * s, e0y = (cx - bx) * s, e1x = (cy - ay) * s, e1y = (ax - cx) * s, e2x = (ay - by) * s, e2y = (bx - ax) * s;
  const m0 = -pad * Math.hypot(e0x, e0y), m1 = -pad * Math.hypot(e1x, e1y), m2 = -pad * Math.hypot(e2x, e2y);
  const kind = code & 255, flag = (code >> 8) & 127;
  const pax = pos[ia * 3] * 256, pay = pos[ia * 3 + 1] * 256, dbx = pos[ib * 3] * 256 - pax, dby = pos[ib * 3 + 1] * 256 - pay, dcx = pos[ic * 3] * 256 - pax, dcy = pos[ic * 3 + 1] * 256 - pay;
  S.drawn++; let covered = 0;
  for (let y = y0; y <= y1; y++) {
    const o = y * size;
    const r0 = e0x * (x0 - bx) + e0y * (y - by), r1 = e1x * (x0 - cx) + e1y * (y - cy), r2 = e2x * (x0 - ax) + e2y * (y - ay);
    // 这一行里三条边都不低于门槛的那一段（细长的斜三角形，包围盒里大半是空的）
    let xa = x0, xb = x1;
    if (e0x > 0) { const t = x0 + Math.ceil((m0 - r0) / e0x); if (t > xa) xa = t; } else if (e0x < 0) { const t = x0 + Math.floor((m0 - r0) / e0x); if (t < xb) xb = t; } else if (r0 < m0) continue;
    if (e1x > 0) { const t = x0 + Math.ceil((m1 - r1) / e1x); if (t > xa) xa = t; } else if (e1x < 0) { const t = x0 + Math.floor((m1 - r1) / e1x); if (t < xb) xb = t; } else if (r1 < m1) continue;
    if (e2x > 0) { const t = x0 + Math.ceil((m2 - r2) / e2x); if (t > xa) xa = t; } else if (e2x < 0) { const t = x0 + Math.floor((m2 - r2) / e2x); if (t < xb) xb = t; } else if (r2 < m2) continue;
    let w0 = r0 + e0x * (xa - x0), w1 = r1 + e1x * (xa - x0), w2 = r2 + e2x * (xa - x0);
    for (let x = xa; x <= xb; x++, w0 += e0x, w1 += e1x, w2 += e2x) {
      const inside = w0 >= 0 && w1 >= 0 && w2 >= 0, i = o + x;
      if (!inside && (cls[i] !== PART.NONE || w0 < m0 || w1 < m1 || w2 < m2)) continue;
      if (inside && zone[i] & ZONE.GUTTER) covered++;
      cls[i] = kind; zone[i] = inside ? flag : flag | ZONE.GUTTER;
      const u = w1 * inv, v = w2 * inv, px = pax + dbx * u + dcx * v, py = pay + dby * u + dcy * v;
      X[i] = px < -32767 ? -32767 : px > 32767 ? 32767 : px; Y[i] = py < -32767 ? -32767 : py > 32767 ? 32767 : py;
    }
  }
  S.covered += covered;
}

/**
 * 把几个网格的三角形按 UV 画成零件图（纯计算）。
 * meshes：[{ name, position, uv, index }]（数组或类型数组；index 可以没有）；classify(name, lo, hi)：见 classifySmg。
 * 先按顶点连通把三角形分成 UV 岛（UV 接缝处顶点是拆开的，所以连通的就是一个岛），一个岛一类；
 * 再逐个三角形填像素：岛内的像素记类别、标记和它在网格里的位置（x、y，乘 256 存成整数）；岛外 pad 个像素以内补一圈边（标 GUTTER）。
 * 没有三角形用到的像素：cls 是 NONE、zone 也标 GUTTER。
 * 返回 { size, cls, zone, x, y, covered（岛内像素数）, islands }；一个三角形都没画上就返回 null。
 */
export function partMap(meshes, size, classify = classifySmg, pad = 3) {
  const n = size * size, cls = new Uint8Array(n).fill(PART.NONE), zone = new Uint8Array(n).fill(ZONE.GUTTER), X = new Int16Array(n), Y = new Int16Array(n);
  let islands = 0;
  const S = { cls, zone, X, Y, size, pad, pos: null, uv: null, covered: 0, drawn: 0 };
  for (const M of meshes) {
    const pos = M.position, uv = M.uv, idx = M.index, nv = Math.floor(pos.length / 3), nt = Math.floor((idx ? idx.length : nv) / 3);
    if (!nv || !nt || !uv || uv.length < nv * 2) continue;
    // UV 岛：并查集
    const par = new Int32Array(nv); for (let i = 0; i < nv; i++) par[i] = i;
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let t = 0; t < nt; t++) { const a = find(idx ? idx[t * 3] : t * 3), b = find(idx ? idx[t * 3 + 1] : t * 3 + 1), c = find(idx ? idx[t * 3 + 2] : t * 3 + 2); if (b !== a) par[b] = a; const c2 = find(c); if (c2 !== a) par[c2] = a; }
    const box = new Map();
    for (let i = 0; i < nv; i++) {
      const k = find(i); let e = box.get(k); if (!e) box.set(k, e = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], code: -1 });
      for (let a = 0; a < 3; a++) { const v = pos[i * 3 + a]; if (v < e.lo[a]) e.lo[a] = v; if (v > e.hi[a]) e.hi[a] = v; }
    }
    for (const e of box.values()) { e.code = classify(M.name || '', e.lo, e.hi); if (e.code >= 0) islands++; }
    S.pos = pos; S.uv = uv;
    for (let t = 0; t < nt; t++) {
      const ia = idx ? idx[t * 3] : t * 3, code = box.get(find(ia)).code;
      if (code >= 0) fillTriangle(S, ia, idx ? idx[t * 3 + 1] : t * 3 + 1, idx ? idx[t * 3 + 2] : t * 3 + 2, code);
    }
  }
  return S.drawn ? { size, cls, zone, x: X, y: Y, covered: S.covered, islands } : null;
}

/** 金属粗糙度贴图（R 遮蔽、G 粗糙度、B 金属度）拆成三张 0–1 的 */
function splitMr(mr, ao, rough, metal) { for (let i = 0, j = 0; i < ao.length; i++, j += 4) { ao[i] = mr[j] / 255; rough[i] = mr[j + 1] / 255; metal[i] = mr[j + 2] / 255; } }
function writeAo(mr, ao) { for (let i = 0, j = 0; i < ao.length; i++, j += 4) mr[j] = ao[i] * 255; }
/** 亮度（lum）和缩小 4 倍的亮度之和 / 个数（low / cnt）。zone：零件图的标记（没有就传 null），岛外的像素不计入 low */
function lumLow(base, lum, low, cnt, w, qw, cap, zone, psh, pw) {
  for (let y = 0; y < w; y++) {
    const qo = (y >> 2) * qw, yo = y * w, pro = (y >> psh) * pw;
    for (let x = 0; x < w; x++) {
      const i = yo + x, j = i * 4, l = base[j] * 0.299 + base[j + 1] * 0.587 + base[j + 2] * 0.114; lum[i] = l;
      if (zone === null || zone[pro + (x >> psh)] < 128) { low[qo + (x >> 2)] += l < cap ? l : cap; cnt[qo + (x >> 2)]++; }
    }
  }
}
function lowMean(low, cnt) { for (let i = 0; i < low.length; i++) low[i] = cnt[i] > 0.05 ? low[i] / cnt[i] : -1; }

/**
 * 法线贴图（w × w）的散度，写进小一号的 cur（mw × mw，和金属粗糙度贴图一样大；sh：差几档）：
 * 正的是凸棱（法线向外散开），负的是凹槽、孔沿、零件根部（法线往里收）。R：在原图上隔几个像素量。
 * 只在小图上量：倒角在原图上四五个像素宽，小一号照样量得出来，这一遍和后面的模糊都只有四分之一的量（加载时间省二三十毫秒）。
 * 量到岛外（零件图上标 GUTTER）的不算：岛外的填充色接在棱上，会量出一圈假的凸棱——那就又是描白边了。
 */
function curvature(normal, cur, w, mw, sh, R, zone, psh, pw) {
  const o = R * 4, ow = R * w * 4, k = 1 / (2 * R);
  for (let Y = 0; Y < mw; Y++) {
    const y = Y << sh; if (y < R || y >= w - R) continue;
    const pr = (y >> psh) * pw, pa = ((y - R) >> psh) * pw, pb = ((y + R) >> psh) * pw;
    for (let X = 0; X < mw; X++) {
      const x = X << sh; if (x < R || x >= w - R) continue;
      if (zone && (zone[pr + ((x - R) >> psh)] | zone[pr + ((x + R) >> psh)] | zone[pa + (x >> psh)] | zone[pb + (x >> psh)]) & 128) continue;
      const j = (y * w + x) * 4;
      cur[Y * mw + X] = (normal[j + o] - normal[j - o] + normal[j + ow + 1] - normal[j - ow + 1]) * k;
    }
  }
}
/** 法线贴图上一个像素偏离正上方多少（|x| + |y|，0–255 的刻度） */
function slopeAt(normal, q) { const nx = normal[q] - 127.5, ny = normal[q + 1] - 127.5; return (nx < 0 ? -nx : nx) + (ny < 0 ? -ny : ny); }
/**
 * processGun 的第一遍：颜色、法线贴图的第 ya、ya + step…… 行（不到 yb；K：processGun 备好的数组和参数；先取成局部变量，循环里才快）。
 * 顺带记下每个像素的划痕深浅（scr）、留下的亮棱（edg）、压过的灰白（brt），第二遍定粗糙度要用；计数累加在 K.wearCount / K.cutCount 上。
 */
function paintRows(K, ya, yb, step) {
  const { base, normal, lum, low, metal, ao, patch, cloud, rows, scr, edg, brt, cur, cav, vex, cls, zone, PY, w, mw, N, ps, qw, sh, psh, pw, pk2, NP, tTone, tFlat, tR, tG, tB, tWear, tAcc, tPlain, tKeep, tMott, tCav, tLit, cLo, cK, cAo, cPatch, gDark, m0, mk, a0, ak, s0, sk, knee, slope, gSoft, gk, gLow, gHigh, D, eMin, bevel, eKeep, eMax, p0, pk, eContact, eRecess, eAo, f0, fk, f0q, f1q, bgR, bgG, bgB, cAlb, RB, ST, ribK, tapDX, tapDY, a2, b2 } = K;
  let wearCount = 0, cutCount = 0;
  for (let y = ya; y < yb; y += step) {
    const yo = y * w, ym = (y > 0 ? y - 1 : 0) * w, yp = (y < w - 1 ? y + 1 : y) * w, po = ((y * ps) | 0) * N, qo = (y >> 2) * qw, mo = (y >> sh) * mw, rowOk = y >= D && y < w - D, pro = (y >> psh) * pw;
    for (let x = 0; x < w; x++) {
      const i = yo + x, j = i * 4, pc = pro + (x >> psh);
      let c = 255, z = 0;
      if (cls) {
        c = cls[pc];
        // 没有三角形用到的像素：填底色、法线放平（缩小采样时渗进来的就是和枪一样深的颜色）
        if (c === 255) { base[j] = bgR; base[j + 1] = bgG; base[j + 2] = bgB; normal[j] = 128; normal[j + 1] = 128; continue; }
        z = zone[pc];
      }
      const L = lum[i], mi = mo + (x >> sh), pi = po + ((x * ps) | 0);
      // 这个像素是哪一类、往另一类混多少：有零件图时是「本类 → 裸钢小件」，没有时是「聚合物 → 钢件」
      let A = c, B = PART.BRIGHT, wB;
      if (cls) { wB = tAcc[c] > 0 ? (metal[mi] - a0) * ak : 0; if (c >= NP) A = PART.BODY; } else { A = PART.BODY; B = PART.STEEL; wB = (metal[mi] - m0) * mk; }
      wB = wB <= 0 ? 0 : wB >= 1 ? 1 : wB * wB * (3 - 2 * wB);
      let r = base[j], g = base[j + 1], b = base[j + 2];
      // 彩色的小标记（快慢机的红点、弹壳的黄铜）和很亮的零件不动调子
      const hi = r > g ? (r > b ? r : b) : (g > b ? g : b), lo = r < g ? (r < b ? r : b) : (g < b ? g : b);
      let tone = 1;
      if (hi - lo > s0 || L > 90) { let k = (hi - lo - s0) * sk, k2 = (L - 90) / 50; if (k2 > k) k = k2; k = k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k); tone = 1 - k; }
      // 大面的平均亮度往这一类的目标靠：云斑压掉一多半，各类有各的深浅
      // （目标写 0 的类——裸钢、弹壳——不改深浅，原来多亮还多亮）
      const lv = low[qo + (x >> 2)], tA = tTone[A], lvs = lv > 6 ? lv : lv < 0 ? (tA > 0 ? tA : 40) : 6;
      let target = tA > 0 ? tA : lvs, flat = tFlat[A], tr = tR[A], tg = tG[A], tb = tB[A], wearK = tWear[A], plain = tPlain[A];
      if (wB > 0) { target += ((tTone[B] > 0 ? tTone[B] : lvs) - target) * wB; flat += (tFlat[B] - flat) * wB; tr += (tR[B] - tr) * wB; tg += (tG[B] - tg) * wB; tb += (tB[B] - tb) * wB; wearK += (tWear[B] - wearK) * wB; plain *= 1 - wB; }
      const gain = 1 + (target / lvs - 1) * flat * tone;
      if (z >= 128) {
        // 岛外补的那圈边：不要原来的浅色填充，填成岛内大面的颜色（遮蔽也照岛内一样压——不然遮蔽重的地方岛比边暗，缩小采样时渗出一圈浅边）
        const v = lvs * gain * (1 - cAo * (1 - ao[mi]) * tone) * (z & ZONE.HANDLED && A === PART.BODY ? gDark : 1); base[j] = v * tr; base[j + 1] = v * tg; base[j + 2] = v * tb;
        continue;
      }
      const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : x;
      // 和周围 3×3 的平均值比：正的是比周围亮的细节
      let d = L - (lum[ym + xm] + lum[ym + x] + lum[ym + xp] + lum[yo + xm] + L + lum[yo + xp] + lum[yp + xm] + lum[yp + x] + lum[yp + xp]) / 9;
      let cut = 0, kept = 0;
      if (d > eMin && tone > 0.5 && rowOk && x >= D && x < w - D) {
        // 是不是烘进去的亮棱：四个方向各看两侧隔 D 个像素的亮度，有一个方向两侧都暗就是一条细亮线（台阶的亮侧不算）；
        // 落在岛外的那一侧不看。还要在棱上——贴着岛的边，或者法线贴图在这儿有倒角；平面上的细亮线是划痕，留着
        let bg = 1e9, dark = 1e9, border = false;
        for (let k = 0; k < 4; k++) {
          const dx = tapDX[k] * D, dy = tapDY[k] * D, o = dy * w + dx;
          let la = lum[i + o], lb = lum[i - o];
          if (cls) { // 岛外的像素在零件图上是「没人用」或者「补的边」（没人用的标记也是 GUTTER）
            if (zone[((y + dy) >> psh) * pw + ((x + dx) >> psh)] >= 128) { la = -1; border = true; }
            if (zone[((y - dy) >> psh) * pw + ((x - dx) >> psh)] >= 128) { lb = -1; border = true; }
          }
          const m = la > lb ? la : lb; if (m < 0) continue;
          if (m < bg) bg = m;
          if (la >= 0 && la < dark) dark = la; if (lb >= 0 && lb < dark) dark = lb;
        }
        const ridge = L - bg;
        if (ridge > eMin) {
          let onEdge = border;
          if (!onEdge) onEdge = slopeAt(normal, j) > bevel || slopeAt(normal, j + a2) > bevel || slopeAt(normal, j - a2) > bevel || slopeAt(normal, j + b2) > bevel || slopeAt(normal, j - b2) > bevel;
          if (onEdge) {
            // 留几成：噪声选中的那几截留得多（常磕碰的地方门槛低一点）；挨着凹槽（旁边比大面暗一大截）、遮蔽重的地方不留
            let keep = 0;
            if (dark > lvs * eRecess && ao[mi] > eAo) {
              let pt = (patch[pi] - p0 + ((z & 1) ? eContact : 0)) * pk; pt = pt <= 0 ? 0 : pt >= 1 ? 1 : pt * pt * (3 - 2 * pt);
              keep = (eKeep + eMax * pt) * wearK;
            }
            kept = ridge * keep; cut = ridge - kept; cutCount++;
            const kg = kept * gain; if (kg > 5) wearCount++; const e = kg / 30; if (e > edg[mi]) edg[mi] = e > 1 ? 1 : e;
          }
        }
      }
      // 细碎的起伏减半（斑点挪到粗糙度上），大的（划痕）锐化；抹掉的亮棱从细节里扣掉
      d -= cut;
      const ad = d < 0 ? -d : d; let gk2 = (ad - gSoft) * gk; gk2 = gk2 <= 0 ? 0 : gk2 >= 1 ? 1 : gk2 * gk2 * (3 - 2 * gk2);
      const keepD = tKeep[A];
      let add = (d > kept ? d - kept : d < 0 ? d : 0) * (gLow + gHigh * gk2 - 1) * tMott[A] * tone * keepD - cut;
      if (d * keepD > scr[mi]) scr[mi] = d * keepD;
      // 这一类的中等宽度的明暗带抹掉：往「大面的平均 + 细节」靠
      if (plain > 0) add += (lvs + d * keepD - (L - cut)) * plain * tone;
      r = (r + add) * gain; g = (g + add) * gain; b = (b + add) * gain;
      // 去暖色：往灰度靠，再乘上这一类的色调；大范围的深浅起伏
      let grey = r * 0.299 + g * 0.587 + b * 0.114;
      const shade = 1 + (cloud[pi] - 0.5) * cAlb * tone;
      r += (grey * tr * shade - r) * tone; g += (grey * tg * shade - g) * tone; b += (grey * tb * shade - b) * tone;
      // 凹处压暗（枪托是提亮：浅灰的积灰）、遮蔽贴图的暗处跟着暗；凸棱断断续续地亮一点（噪声选中的那几截亮得多）
      const cv = cur[mi]; let f = 1 - cAo * (1 - ao[mi]) * tone;
      if (cv < -cLo) { let k = (-cv - cLo) * cK; k = k >= 1 ? 1 : k * k * (3 - 2 * k); f -= tCav[A] * k * tone; if (k > cav[mi]) cav[mi] = k; }
      else if (cv > cLo && tLit[A] > 0) {
        let k = (cv - cLo) * cK; k = (k >= 1 ? 1 : k * k * (3 - 2 * k)) * (cPatch + (1 - cPatch) * patch[pi]);
        const v = tLit[A] * k * tone; r += v; g += v; b += v * 1.03; if (k > vex[mi]) vex[mi] = k;
      }
      // 握把：和枪托一样深的黑塑料
      if (z & ZONE.HANDLED && A === PART.BODY) f *= gDark;
      r *= f; g *= f; b *= f;
      // 很亮的灰白（快慢机的杆子、准星的白点）压到磨亮的钢那么亮：不然暗场里是一根不吃光的白棍
      grey = r * 0.299 + g * 0.587 + b * 0.114;
      if (grey > knee && hi - lo < s0) { const k = (knee + (grey - knee) * slope) / grey; r *= k; g *= k; b *= k; if (grey > knee * 1.3) brt[mi] = 1; }
      // 法线：平面上的压缩噪点抹平（陡的棱线原样留着）
      let nx = normal[j] - 127.5, ny = normal[j + 1] - 127.5; const nq = nx * nx + ny * ny;
      if (nq <= f0q) { nx = 0; ny = 0; } else if (nq < f1q) { let nk = (Math.sqrt(nq) - f0) * fk; nk = nk * nk * (3 - 2 * nk); nx *= nk; ny *= nk; }
      if (PY && pc > pw && pc < pw * pw - pw - 1) {
        if (c === PART.RUBBER) {
          // 托底的横棱：按高度（y）一道一道的沟
          const gx = (PY[pc + 1] - PY[pc - 1]) * 0.5 * pk2, gy = (PY[pc + pw] - PY[pc - pw]) * 0.5 * pk2, gl = Math.sqrt(gx * gx + gy * gy);
          // 只画在朝后的那一面上（高度在贴图上变得快的地方）：顶面、圆角上高度几乎不变，横棱在那儿会被拉成一坨一坨的暗斑
          if (gl > RB.steep[0] && cls[pc - 1] === c && cls[pc + 1] === c && cls[pc - pw] === c && cls[pc + pw] === c) {
            let py = PY[pc]; if (psh > 0) { const h = (1 << psh) * 0.5 - 0.5; py += gx * ((x & ((1 << psh) - 1)) - h) + gy * ((y & ((1 << psh) - 1)) - h); }
            const amt = gl >= RB.steep[1] ? 1 : (gl - RB.steep[0]) / (RB.steep[1] - RB.steep[0]);
            const ph = py * ribK, f = ph - Math.floor(ph), groove = f < 0.3 ? Math.sin(f / 0.3 * Math.PI) * amt : 0, slopeN = f < 0.3 ? Math.cos(f / 0.3 * Math.PI) * amt : 0, k = 1 - RB.dark * groove;
            r *= k; g *= k; b *= k; nx += gx / gl * slopeN * RB.bump * 127; ny += gy / gl * slopeN * RB.bump * 127;
          }
        } else if (c === PART.MAG) {
          // 弹匣的插拔擦痕：顺着弹匣的长边（在贴图上是横的）一道一道磨亮，靠上（插进弹匣口的那一段）更重
          const gx = PY[pc + 1] - PY[pc - 1], gy = PY[pc + pw] - PY[pc - pw];
          if ((gx < 0 ? -gx : gx) > (gy < 0 ? -gy : gy) * 2) {
            const up = 0.35 + 0.65 * clamp01((PY[pc] / 256 + 8) / 14), s = rows[y] * (0.4 + 0.6 * patch[pi]) * up;
            if (s > 0.02) { const v = ST.light * s; r += v; g += v; b += v * 1.05; if (s > edg[mi]) edg[mi] = s; }
          }
        }
      }
      base[j] = r; base[j + 1] = g; base[j + 2] = b; normal[j] = 127.5 + nx; normal[j + 1] = 127.5 + ny;
    }
  }
  K.wearCount += wearCount; K.cutCount += cutCount;
}
/**
 * processGun 的第二遍：金属粗糙度贴图和权重图的第 ya、ya + step…… 行（不到 yb）。按类重定，叠大范围的起伏、磨光、积灰；亮划痕和留下的亮棱更光一点；最后限幅。
 * 统计累加在 K.metalCount / K.rMin / K.rMax 上。
 */
function finishRows(K, ya, yb, step) {
  const { mr, weights, metal, rough, ao, cloud, scr, edg, brt, cav, vex, cls, zone, PY, mw, N, msk, pm, pw, NP, tAcc, tRough, tMetal, tMin, tBare, tStip, tFine, tGrain, tAo, m0, mk, a0, ak, gSoft, R, CL, ST, CV, GP, cRough, g0, gkk, bMin } = K;
  let metalCount = 0, rMin = K.rMin, rMax = K.rMax;
  for (let y = ya; y < yb; y += step) {
    const so = (((y + 0.5) * pm) | 0) * pw, po = ((y * msk) | 0) * N, po2 = (((mw - 1 - y) * msk) | 0) * N;
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x, j = i * 4, si = so + (((x + 0.5) * pm) | 0);
      let c = 255, z = 0;
      if (cls) { c = cls[si]; z = zone[si]; if (c === 255) { mr[j + 1] = 0.7 * 255; mr[j + 2] = 0; if (weights) { weights[j] = weights[j + 1] = weights[j + 2] = 0; weights[j + 3] = 255; } continue; } }
      let A = c, B = PART.BRIGHT, wB;
      if (cls) { wB = tAcc[c] > 0 ? (metal[i] - a0) * ak : 0; if (c >= NP) A = PART.BODY; } else { A = PART.BODY; B = PART.STEEL; wB = (metal[i] - m0) * mk; }
      wB = brt[i] ? 1 : wB <= 0 ? 0 : wB >= 1 ? 1 : wB * wB * (3 - 2 * wB);
      const pi = po + ((x * msk) | 0), mt = tMetal[A] + (tMetal[B] - tMetal[A]) * wB, d = scr[i], edge = edg[i];
      let q = rough[i]; q += (tRough[A] + (tRough[B] - tRough[A]) * wB - q) * R.flatten;
      q += (cloud[pi] - 0.5) * cRough;
      // 磨光：另取一处的噪声（不和深浅的起伏重合）；手握的地方、枪托顶上贴腮的地方门槛低
      let pz = cloud[po2 + (((mw - 1 - x) * msk) | 0)] - g0, top = 1;
      const grip = (z & ZONE.HANDLED) !== 0 && A === PART.BODY;
      if (z & ZONE.HANDLED) pz += CL.handled; else if (c === PART.STOCK) { if (PY[si] > CL.cheek * 256) pz += CL.cheekBias; else top = CL.side; }
      pz *= gkk; pz = grip || pz <= 0 ? 0 : pz >= 1 ? 1 : pz * pz * (3 - 2 * pz);
      q -= pz * CL.polish;
      // 凹处积灰更哑，凸棱磨得更光（主光扫过时先亮的是棱）
      q += cav[i] * CV.rough - vex[i] * CV.gloss;
      if (grip && q < GP.rough) q = GP.rough;
      const dust = (0.92 - ao[i]) * 2; if (dust > 0) q += (dust > 1 ? 1 : dust) * CL.dust;
      if (d > gSoft) q -= (d > 14 ? 1 : d / 14) * R.scratch * (0.5 + 0.5 * mt);
      if (edge > 0) q -= edge * (c === PART.MAG ? ST.rough : R.wear);
      if (mr[j] < tAo[A]) mr[j] = tAo[A];
      let qmin = tMin[A] + (tMin[B] - tMin[A]) * wB; if (brt[i] && qmin < bMin) qmin = bMin;
      q = q < qmin ? qmin : q > R.max ? R.max : q; if (q < rMin) rMin = q; if (q > rMax) rMax = q;
      mr[j + 1] = q * 255;
      const mo = mt + (1 - mt) * edge * (tBare[A] + (tBare[B] - tBare[A]) * wB); mr[j + 2] = mo * 255; if (mo > 0.5) metalCount++;
      if (weights) { const soft = 1 - 0.6 * pz; weights[j] = tStip[A] * (1 - wB) * soft * top * 255; weights[j + 1] = (tGrain[A] + (tGrain[B] - tGrain[A]) * wB) * 255; weights[j + 2] = tFine[A] * (1 - wB) * soft * 255; weights[j + 3] = 255; }
    }
  }
  K.metalCount += metalCount; K.rMin = rMin; K.rMax = rMax;
}

/**
 * 枪的三张贴图就地重算。base / normal：size × size 的 RGBA 字节；mr：mrSize × mrSize（R 遮蔽、G 粗糙度、B 金属度），
 * mrSize 可以比 size 小（size 的 1/2、1/4……）。
 * parts：零件图（partMap 的结果，边长是 size 或者 size 的 1/2、1/4）；没有就按原贴图的金属度分成聚合物、钢件两类（假模型的退路）。
 * weights：mrSize × mrSize 的 RGBA，写出细节的权重（R 疏麻点、G 磷化颗粒、B 细麻点）；不要就不传。
 * 返回统计数（测试、调参用）：{ metalShare 金属度过半的占比, wearShare 留下亮棱的像素占比, cutShare 抹掉亮棱的像素占比, roughMin, roughMax, ms [准备, 颜色和法线, 金属粗糙度] 各段耗时 }。
 */
export function processGun(base, mr, normal, size, P = SMG_SKIN.gun, mrSize = size, parts = null, weights = null) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0), T0 = now();
  const w = size, n = w * w, mw = mrSize, mn = mw * mw, sh = Math.max(0, Math.round(Math.log2(w / mw))), R = P.rough, E = P.edge, CL = P.cloud, C = P.parts;
  // 零件图可以比颜色贴图小一号（边长是 size 的 1/2、1/4……）：psh 是差几档，pw 是它的边长
  const psh = parts ? Math.round(Math.log2(w / parts.size)) : -1, pw = psh >= 0 && parts.size << psh === w ? parts.size : 0;
  const cls = pw ? parts.cls : null, zone = cls ? parts.zone : null, PY = cls ? parts.y : null;
  // 每一类的参数摊成数组（循环里按类别取）
  const NP = C.length, tTone = new Float32Array(NP), tFlat = new Float32Array(NP), tR = new Float32Array(NP), tG = new Float32Array(NP), tB = new Float32Array(NP), tWear = new Float32Array(NP), tAcc = new Float32Array(NP), tPlain = new Float32Array(NP),
    tRough = new Float32Array(NP), tMetal = new Float32Array(NP), tMin = new Float32Array(NP), tBare = new Float32Array(NP), tStip = new Float32Array(NP), tFine = new Float32Array(NP), tGrain = new Float32Array(NP), tKeep = new Float32Array(NP), tAo = new Float32Array(NP),
    tMott = new Float32Array(NP), tCav = new Float32Array(NP), tLit = new Float32Array(NP);
  for (let k = 0; k < NP; k++) { const c = C[k]; tTone[k] = c.tone; tFlat[k] = c.flatten; tR[k] = c.tint[0]; tG[k] = c.tint[1]; tB[k] = c.tint[2]; tWear[k] = c.wear; tAcc[k] = c.accent; tPlain[k] = c.plain || 0; tRough[k] = c.rough; tMetal[k] = c.metal; tMin[k] = c.min; tBare[k] = c.bare; tStip[k] = c.stipple; tFine[k] = c.fine; tGrain[k] = c.grain; tKeep[k] = c.keep ?? 1; tAo[k] = (c.ao || 0) * 255; tMott[k] = c.mottle ?? 1; tCav[k] = c.cav || 0; tLit[k] = c.lit || 0; }
  // 金属度、粗糙度、遮蔽：去 JPEG 方块。有零件图时金属度多摊开一点——烘进去的亮棱（细线）被冲淡，成片的裸钢（销子、螺丝）留着
  const metal = new Float32Array(mn), rough = new Float32Array(mn), ao = new Float32Array(mn), br = Math.max(1, Math.round(R.blur * mw / w));
  splitMr(mr, ao, rough, metal);
  boxBlur(metal, mw, mw, cls ? br : 1, cls ? 2 : 1); boxBlur(rough, mw, mw, br, 1); boxBlur(ao, mw, mw, br, 1);
  writeAo(mr, ao); // 遮蔽也有压缩方块（托底上一块亮一块暗），去过方块的写回去
  // 亮度；顺手攒出缩小 4 倍的一张，大片云斑在它上面量。只算岛内的像素（岛外的填充是亮的，会把边上的平均值带高）
  const lum = new Float32Array(n), qw = (w + 3) >> 2, low = new Float32Array(qw * qw), cnt = new Float32Array(qw * qw);
  lumLow(base, lum, low, cnt, w, qw, P.lowClamp, zone, psh, pw);
  const lr = Math.max(1, Math.round(P.lowRadius / 4)); boxBlur(low, qw, qw, lr, 2); boxBlur(cnt, qw, qw, lr, 2);
  lowMean(low, cnt);
  // 低频噪声（128 一张，铺满整张贴图）：patch 管亮棱留哪几截，cloud 管大范围的深浅和粗糙度；rows 是弹匣擦痕（一行一个数）
  const N = 128, patch = fbmField(N, 14, 14, 2, 41), cloud = fbmField(N, 5, 5, 3, 57), ps = N / w, rnd = seeded(77), rows = new Float32Array(w);
  for (let y = 0; y < w; y++) { const v = rnd(); rows[y] = v > 0.55 ? (v - 0.55) / 0.45 : 0; }
  for (let y = w - 1; y > 0; y--) rows[y] = rows[y] * 0.65 + rows[y - 1] * 0.35;
  // 下面这个循环一百万次：参数先取到局部变量里，分支能跳过的就跳过；按 BATCH 行一批调（paint），引擎几批以后就换上优化过的代码
  const m0 = P.metal[0], mk = 1 / (P.metal[1] - m0), a0 = P.accent[0], ak = 1 / (P.accent[1] - a0), s0 = P.keepSat[0], sk = 1 / (P.keepSat[1] - s0), knee = P.bright[0], slope = P.bright[1];
  const gSoft = P.grit.soft, gk = 1 / (P.grit.hard - gSoft), gLow = P.grit.low, gHigh = P.grit.high - gLow;
  const D = E.reach, eMin = E.min, bevel = E.bevel * 255, eKeep = E.keep, eMax = E.max - E.keep, p0 = E.patch[0], pk = 1 / (E.patch[1] - p0), eContact = E.contact, eRecess = E.recess, eAo = E.ao;
  const f0 = P.flat[0] * 127.5, fk = 1 / ((P.flat[1] - P.flat[0]) * 127.5), [bgR, bgG, bgB] = P.bg, cAlb = CL.albedo * 2;
  const RB = P.ribs, ST = P.streak, ribK = 1 / (RB.pitch * 256);
  const scr = new Float32Array(mn), edg = new Float32Array(mn), brt = new Uint8Array(mn); // 划痕、留下的亮棱、压过的灰白：给粗糙度那张（小一号）用
  // 凹凸：先在法线贴图还没被改之前整张量一遍（paintRows 会把平面上的噪点抹平，边算边量的话量到的一半是改过的）
  const CV = P.curv, cur = new Float32Array(mn), cav = new Float32Array(mn), vex = new Float32Array(mn);
  curvature(normal, cur, w, mw, sh, CV.reach, zone, psh, pw); boxBlur(cur, mw, mw, 1, 1);
  const tapDX = [1, 0, 1, -1], tapDY = [0, 1, 1, 1], a2 = 2 * 4, b2 = 2 * w * 4, f0q = f0 * f0, f1q = P.flat[1] * 127.5 * P.flat[1] * 127.5, pk2 = 1 / (1 << (psh > 0 ? psh : 0));
  const T1 = now();
  const K = { base, normal, lum, low, metal, ao, patch, cloud, rows, scr, edg, brt, cur, cav, vex, tMott, tCav, tLit, cLo: CV.lo, cK: 1 / (CV.hi - CV.lo), cAo: CV.ao, cPatch: CV.patch, gDark: P.grip.dark, cls, zone, PY, w, mw, N, ps, qw, sh, psh, pw, pk2, NP, tTone, tFlat, tR, tG, tB, tWear, tAcc, tPlain, tKeep, m0, mk, a0, ak, s0, sk, knee, slope, gSoft, gk, gLow, gHigh, D, eMin, bevel, eKeep, eMax, p0, pk, eContact, eRecess, eAo, f0, fk, f0q, f1q, bgR, bgG, bgB, cAlb, RB, ST, ribK, tapDX, tapDY, a2, b2, wearCount: 0, cutCount: 0 };
  inBatches(paintRows, K, w);
  // 金属粗糙度：按类重定，叠大范围的起伏、磨光、积灰；亮划痕和留下的亮棱更光一点；最后限幅。权重图：各类用哪种细节、用多少
  const T2 = now();
  const cRough = CL.rough * 2, g0 = CL.gate[0], gkk = 1 / (CL.gate[1] - g0), msk = N / mw, pm = pw / mw;
  Object.assign(K, { mr, weights, rough, msk, pm, tRough, tMetal, tMin, tBare, tStip, tFine, tGrain, tAo, R, CL, CV, GP: P.grip, cRough, g0, gkk, bMin: P.bright[2] || 0, metalCount: 0, rMin: 1, rMax: 0 });
  inBatches(finishRows, K, mw);
  return { metalShare: K.metalCount / mn, wearShare: K.wearCount / n, cutShare: K.cutCount / n, roughMin: K.rMin, roughMax: K.rMax, ms: [T1 - T0, T2 - T1, now() - T2] };
}

/**
 * 手（手套 + 袖子，共用一套贴图）的粗糙度就地重算。mr：mrSize × mrSize 的 RGBA；small：颜色贴图缩到 smallSize 的 RGBA（只用来分皮面和布面）。
 * weights：smallSize × smallSize 的 RGBA，写出细节的权重（R 皮纹：手掌的皮面；G 织物：布面）；不要就不传。
 * 返回 { leatherShare, roughMin }。
 */
export function processHands(mr, mrSize, small, smallSize, P = SMG_SKIN.hands, weights = null) {
  const mw = mrSize, mn = mw * mw, sw = smallSize, lum = new Float32Array(sw * sw), rough = new Float32Array(mn);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = small[j] * 0.299 + small[j + 1] * 0.587 + small[j + 2] * 0.114;
  for (let i = 0, j = 0; i < mn; i++, j += 4) rough[i] = mr[j + 1] / 255;
  boxBlur(lum, sw, sw, 1, 1); boxBlur(rough, mw, mw, Math.max(1, mw >> 7), 1); // 粗糙度只留大范围的起伏
  const R = P.rough, l0 = P.leather[0], lk = 1 / (P.leather[1] - l0), ks = sw / mw; let leather = 0, rMin = 1;
  // 皮面的标记：颜色暗的是皮
  const flag = lum; for (let i = 0; i < flag.length; i++) { const m = (lum[i] - l0) * lk; flag[i] = m <= 0 ? 1 : m >= 1 ? 0 : 1 - m * m * (3 - 2 * m); }
  if (weights) for (let i = 0, j = 0; i < flag.length; i++, j += 4) { weights[j] = flag[i] * 255; weights[j + 1] = (1 - flag[i]) * 255; weights[j + 2] = 0; weights[j + 3] = 255; }
  for (let y = 0; y < mw; y++) {
    const so = ((y * ks) | 0) * sw;
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x, j = i * 4, m = flag[so + ((x * ks) | 0)]; if (m > 0.5) leather++;
      // 原贴图里布面反而比皮面光：按材质重定，只留一点原来的起伏
      let q = R.fabric + (R.leather - R.fabric) * m + (rough[i] - 0.8) * R.keep; q = q < R.min ? R.min : q > 1 ? 1 : q; if (q < rMin) rMin = q;
      mr[j + 1] = q * 255;
    }
  }
  return { leatherShare: leather / mn, roughMin: rMin };
}

// ---- 平铺的细节 ----
/**
 * 四种细节的高度图（0–1，可平铺，平均值调到 0.5——缩小以后粗糙度不跟着偏）：
 *   grain 磷化钢——很细的颗粒，掺一点大一号的起伏（稍远一点细颗粒被缩没了，还剩这一层）；
 *   stipple 模压的麻点——一格一个圆鼓的小点，位置、大小略有出入（聚合物枪托、机匣）；
 *   pebble 皮纹——圆鼓的小颗粒，颗粒之间是细缝（手套的皮面）；
 *   weave 平纹织物——经线、纬线一上一下（threads：一格里横竖各多少根线，要能整除 size）。
 * 几层噪声是共用的（少算几遍）。
 */
export function detailHeights(size, { seed = 3, threads = 32, dots = 32 } = {}) {
  const q = (k) => Math.max(2, Math.round(size / k)), n = size * size;
  const fine = noiseField(size, q(2), q(2), seed), mid = noiseField(size, q(5), q(5), seed + 1), wide = noiseField(size, q(16), q(16), seed + 2), spots = noiseField(size, q(3), q(3), seed + 3);
  const grain = new Float32Array(n), pebble = new Float32Array(n), weave = new Float32Array(n), stipple = new Float32Array(n), p = size / threads;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    grain[i] = fine[i] * 0.45 + mid[i] * 0.35 + wide[i] * 0.2;
    const v = mid[i] * 0.6 + spots[i] * 0.25 + wide[i] * 0.15; pebble[i] = clamp01(0.15 + (1 - Math.abs(v * 2 - 1)) * 0.85);
    // 这一格是经线在上还是纬线在上：在上的那根沿自己的方向鼓起来，到格子边上压下去；线有粗有细
    const u = x / p, t = y / p, iu = Math.floor(u), it = Math.floor(t), su = Math.sin(Math.PI * (u - iu)), st = Math.sin(Math.PI * (t - it));
    weave[i] = clamp01(((iu + it) & 1 ? su * (0.5 + 0.5 * st) : st * (0.5 + 0.5 * su)) * (0.8 + wide[i] * 0.4));
  }
  // 麻点：一格一个，但在格子里随便放、大小不一——排整齐了看着像编织网格，远看还起摩尔纹
  const cell = size / dots, rnd = seeded(seed + 9);
  for (let gy = 0; gy < dots; gy++) for (let gx = 0; gx < dots; gx++) {
    const cx = (gx + 0.5 + (rnd() - 0.5) * 0.9) * cell, cy = (gy + 0.5 + (rnd() - 0.5) * 0.9) * cell, rad = cell * (0.34 + rnd() * 0.3), top = 0.55 + rnd() * 0.45;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const dd = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) / (rad * rad); if (dd >= 1) continue;
      const i = ((y + size) % size) * size + ((x + size) % size), h = top * (1 - dd) * (1 - dd * 0.5); if (h > stipple[i]) stipple[i] = h;
    }
  }
  for (const h of [grain, pebble, weave, stipple]) { let s = 0; for (let i = 0; i < n; i++) s += h[i]; s = 0.5 - s / n; for (let i = 0; i < n; i++) h[i] = clamp01(h[i] + s); }
  return { grain, pebble, weave, stipple };
}
/**
 * 细节贴图的像素（RGBA 字节）：R、G 是切线空间法线的 x、y（朝低处倒；平的是 128），B 是高度（着色器拿它调粗糙度和明暗）。纯计算。
 * 贴图不翻转（flipY = false）时 G 的方向才对。
 */
export function detailPixels(height, size, bump = 0.5) {
  const out = new Uint8ClampedArray(size * size * 4), k = bump * size / 64;
  for (let y = 0; y < size; y++) {
    const yo = y * size, ya = ((y + size - 1) % size) * size, yb = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const dx = (height[yo + (x + 1) % size] - height[yo + (x + size - 1) % size]) * k, dy = (height[yb + x] - height[ya + x]) * k, l = 1 / Math.sqrt(dx * dx + dy * dy + 1), j = (yo + x) * 4;
      out[j] = (-dx * l * 0.5 + 0.5) * 255; out[j + 1] = (-dy * l * 0.5 + 0.5) * 255; out[j + 2] = height[yo + x] * 255; out[j + 3] = 255;
    }
  }
  return out;
}

/**
 * 着色器里叠细节：改 shader.fragmentShader（three 的标准材质）；object = true 时还改 shader.vertexShader。
 * 三层：uSkinDetA 按 uSkinA 的密度铺、uSkinDetB 按 uSkinB、uSkinDetA 再按 uSkinC 铺一遍（同一张图，更密）；
 * 每层用多少看权重图 uSkinPart 的 R、G、B（和粗糙度贴图同一套 UV）。uSkinF90：非金属掠射角的反光打几折（金属不动）。
 * 细节贴图带多级渐远：离远了自动变平，不闪。
 * 两种铺法：
 *   object = false（手）：按贴图的 UV 铺——手是蒙皮的，UV 跟着皮肤走，密度也匀。
 *   object = true（枪）：按零件自己坐标里的位置铺（朝哪个轴就从哪个轴正投影），密度的单位是「每个模型单位铺几次」。
 *     这把枪各个 UV 岛的贴图密度差好几倍——腰射、开镜时占了半个画面的枪托顶面，在贴图上只是一条二十个像素宽的窄条，
 *     而且横竖密度差一倍：按 UV 铺的麻点在那儿又大又扁，托底上更是摊成一坨一坨。按位置铺，整把枪的颗粒一样大。
 *     换投影方向的那条线上 UV 是断的：导数要用断开之前的（textureGrad），不然那条线上取到最糊的一级，是一道平的缝。
 *     顺带只有按位置才画得对的东西——
 *     大范围的斑驳（uSkinMottle：x 每个模型单位几个周期、y 颜色 ±、z 粗糙度 ±、w 金属件上打几折）：两个八度的三维值噪声，按零件坐标算，
 *       所以枪托顶面那块左右镜像的 UV 上不会出现两遍对称的斑；颜色浅的地方粗糙度偏高（积了灰、发哑），深的偏光（手摸出来的油光），高光在大平面上才会游走。
 *       噪声用的是不带 sin 的散列（手机上 sin 大数精度不够，会出成格子）。
 *     灯色打几折（uSkinNeutral）：枪是黑的，没有自己的颜色——冷色的轮廓光照在只有它照得到的面上，那个面就成了藏蓝色，像阳极氧化的蓝件。
 *       直接光的颜色往灰里收一截（亮度不变），冷暖还在，只是不像染了色。
 *     环境反射压低（uSkinEnv，只管非金属）：黑塑料的漫反射几乎是零，白天整把枪的亮度全是它反射的天光——一片均匀的浅灰，像没上色的塑料件。
 *       反射越亮压得越多（除以 1 + uSkinEnv × 亮度）：白天压掉近一半，停电时本来就暗、几乎不动（暗场里枪的轮廓还要靠它）。
 */
export function skinShader(shader, U, object = false) {
  Object.assign(shader.uniforms, U);
  const pars = '\nuniform sampler2D uSkinDetA;\nuniform sampler2D uSkinDetB;\nuniform sampler2D uSkinPart;\nuniform vec4 uSkinA;\nuniform vec4 uSkinB;\nuniform vec4 uSkinC;\nuniform float uSkinF90;\nvec2 skinNormal = vec2( 0.0 );';
  const mix3 = `
		vec3 sa = sw.r * uSkinA.yzw, sb = sw.g * uSkinB.yzw, sc = sw.b * uSkinC.yzw;
		skinNormal = ( da.xy * sa.x + db.xy * sb.x + dc.xy * sc.x ) * 2.0;
		roughnessFactor = clamp( roughnessFactor - ( da.z * sa.y + db.z * sb.y + dc.z * sc.y ), 0.05, 1.0 );
		diffuseColor.rgb *= 1.0 + da.z * sa.z + db.z * sb.z + dc.z * sc.z;`;
  let f = shader.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n\tmaterial.specularF90 = mix( uSkinF90, 1.0, metalnessFactor );');
  if (!object) {
    f = f.replace('#include <normalmap_pars_fragment>', `#include <normalmap_pars_fragment>${pars}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef USE_ROUGHNESSMAP
	{
		vec3 sw = texture2D( uSkinPart, vRoughnessMapUv ).rgb;
		vec3 da = texture2D( uSkinDetA, vRoughnessMapUv * uSkinA.x ).xyz - 0.5;
		vec3 db = texture2D( uSkinDetB, vRoughnessMapUv * uSkinB.x ).xyz - 0.5;
		vec3 dc = texture2D( uSkinDetA, vRoughnessMapUv * uSkinC.x ).xyz - 0.5;${mix3}
	}
#endif`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n#ifdef USE_NORMALMAP_TANGENTSPACE\n\tnormal = normalize( normal + tbn * vec3( skinNormal, 0.0 ) );\n#endif');
  } else {
    if (shader.vertexShader) shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinPos;\nvarying vec3 vSkinNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSkinPos = position;\n\tvSkinNrm = normal;');
    f = f.replace('#include <normalmap_pars_fragment>', `#include <normalmap_pars_fragment>${pars}\nvarying vec3 vSkinPos;\nvarying vec3 vSkinNrm;\nuniform vec4 uSkinMottle;\nuniform float uSkinNeutral;\nuniform float uSkinEnv;\nvec2 skinDx = vec2( 0.0 );\nvec2 skinDy = vec2( 0.0 );
float skinHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float skinNoise( vec3 x ) {
	vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( skinHash( i ), skinHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( skinHash( i + vec3( 0.0, 1.0, 0.0 ) ), skinHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
		mix( mix( skinHash( i + vec3( 0.0, 0.0, 1.0 ) ), skinHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( skinHash( i + vec3( 0.0, 1.0, 1.0 ) ), skinHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z );
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef USE_ROUGHNESSMAP
	{
		vec3 sw = texture2D( uSkinPart, vRoughnessMapUv ).rgb;
		vec3 sn = abs( normalize( vSkinNrm ) ), spx = dFdx( vSkinPos ), spy = dFdy( vSkinPos );
		vec2 suv;
		if ( sn.x > max( sn.y, sn.z ) ) { suv = vSkinPos.zy; skinDx = spx.zy; skinDy = spy.zy; }
		else if ( sn.y > sn.z ) { suv = vSkinPos.xz; skinDx = spx.xz; skinDy = spy.xz; }
		else { suv = vSkinPos.xy; skinDx = spx.xy; skinDy = spy.xy; }
		vec3 da = textureGrad( uSkinDetA, suv * uSkinA.x, skinDx * uSkinA.x, skinDy * uSkinA.x ).xyz - 0.5;
		vec3 db = textureGrad( uSkinDetB, suv * uSkinB.x, skinDx * uSkinB.x, skinDy * uSkinB.x ).xyz - 0.5;
		vec3 dc = textureGrad( uSkinDetA, suv * uSkinC.x, skinDx * uSkinC.x, skinDy * uSkinC.x ).xyz - 0.5;${mix3}
		vec3 smp = vSkinPos * uSkinMottle.x;
		float sm1 = skinNoise( smp ), sm2 = skinNoise( smp * 3.7 + 17.0 );
		float smk = mix( uSkinMottle.w, 1.0, clamp( sw.r + sw.b, 0.0, 1.0 ) );
		diffuseColor.rgb *= 1.0 + ( sm1 * 0.7 + sm2 * 0.3 - 0.5 ) * uSkinMottle.y * smk;
		roughnessFactor = clamp( roughnessFactor + ( sm1 * 0.45 + sm2 * 0.55 - 0.5 ) * uSkinMottle.z * smk, 0.05, 1.0 );
	}
#endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef USE_NORMALMAP_TANGENTSPACE
	{
		vec3 sq0 = dFdx( - vViewPosition ), sq1 = dFdy( - vViewPosition );
		vec3 sq1p = cross( sq1, normal ), sq0p = cross( normal, sq0 );
		vec3 st = sq1p * skinDx.x + sq0p * skinDy.x, sb = sq1p * skinDx.y + sq0p * skinDy.y;
		float sdet = max( dot( st, st ), dot( sb, sb ) );
		normal = normalize( normal + ( st * skinNormal.x + sb * skinNormal.y ) * ( sdet == 0.0 ? 0.0 : inversesqrt( sdet ) ) );
	}
#endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
	reflectedLight.indirectSpecular *= mix( 1.0 / ( 1.0 + uSkinEnv * dot( reflectedLight.indirectSpecular, vec3( 0.2126, 0.7152, 0.0722 ) ) ), 1.0, metalnessFactor );
	reflectedLight.directDiffuse = mix( reflectedLight.directDiffuse, vec3( dot( reflectedLight.directDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) ) ), uSkinNeutral );
	reflectedLight.directSpecular = mix( reflectedLight.directSpecular, vec3( dot( reflectedLight.directSpecular, vec3( 0.2126, 0.7152, 0.0722 ) ) ), uSkinNeutral );`);
  }
  shader.fragmentShader = f;
  return shader;
}

// ---- 右手的握姿 ----
/**
 * 右手扣回握把上的修正（模型自带的握姿：食指伸在扳机护圈外面，中指平伸在护圈下面，两根手指张成一个 V，看着像在朝枪挥手）。
 * bone：骨骼名；axis：绕哪根轴转（模型自己的坐标：y 朝上、z 朝枪口），angle：转多少（弧度）。
 *   中指绕竖轴（握把的方向）往里转，指肚贴到握把前面——无名指、小指本来就是这么包着的；
 *   食指绕横轴往下压，进到护圈里、搭在扳机上。
 * 轴取模型坐标而不是骨骼自己的：几根指骨的本地轴各朝各的方向，按模型坐标说「绕握把转」才是一个意思。
 */
export const SMG_GRIP = Object.freeze([
  Object.freeze({ bone: 'R_middle1', axis: Object.freeze([0, 1, 0]), angle: 0.8 }),
  Object.freeze({ bone: 'R_point1', axis: Object.freeze([1, 0, 0]), angle: 0.45 }),
]);
/**
 * 按 SMG_GRIP 准备好右手的修正：在模型当前的姿势（握好的那一帧）上把「绕模型坐标轴转」折算成骨骼自己坐标里的一个旋转，
 * 以后每次动画写完骨骼就乘在后面——换弹时手指跟着动画走，修正跟着手指走。
 * clip：动画；只修正动画管着的骨骼。没有骨骼、没有动画（测试里的假模型）返回 null。
 * 返回 { bones, apply() }。apply 每帧在 mixer.update 之后调：
 *   动画值没变时 three 的混合器不重写骨骼（PropertyMixer 只在值变了才写），所以骨骼还是上一帧乘好的——这时不能再乘一遍，
 *   记下自己写进去的值，骨骼还是它就跳过。
 */
export function gripPose(model, clip, G = SMG_GRIP) {
  if (!model?.traverse || !clip?.tracks) return null;
  model.updateMatrixWorld(true);
  const mq = model.getWorldQuaternion(new THREE.Quaternion()).invert(), items = [];
  for (const g of G) {
    let bone = null; model.traverse((o) => { if (!bone && o.isBone && o.name.startsWith(g.bone)) bone = o; });
    if (!bone?.parent || !clip.tracks.some((t) => t.name === `${bone.name}.quaternion`)) continue;
    const P = mq.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()));
    const R = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...g.axis).normalize(), g.angle);
    const W = P.clone().invert().multiply(R).multiply(P); // 父骨骼坐标里的旋转
    items.push({ bone, O: bone.quaternion.clone().invert().multiply(W).multiply(bone.quaternion), last: null });
  }
  if (!items.length) return null;
  return {
    bones: items.map((it) => it.bone),
    apply() {
      for (const it of items) {
        if (it.last && it.bone.quaternion.equals(it.last)) continue;
        it.bone.quaternion.multiply(it.O); it.last = (it.last || new THREE.Quaternion()).copy(it.bone.quaternion);
      }
    },
  };
}

// ---- 以下要画布 ----
/** 把贴图画到 size × size 的画布上读出像素（缩小时浏览器自己取平均） */
function readPixels(texture, size) {
  const img = texture?.image; if (!img || !(img.width > 0)) return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d', { willReadFrequently: true }); if (!g) return null;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  try { g.drawImage(img, 0, 0, size, size); return { canvas, g, image: g.getImageData(0, 0, size, size) }; } catch { return null; }
}
/** 算好的像素包成新贴图：翻转、平铺方式、色彩空间、UV 通道沿用原来的 */
function rebuild(src, P, anisotropy) {
  P.g.putImageData(P.image, 0, 0);
  const t = new THREE.CanvasTexture(P.canvas);
  t.flipY = src.flipY; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.colorSpace = src.colorSpace; t.channel = src.channel; t.name = src.name; t.anisotropy = anisotropy;
  t.repeat.copy(src.repeat); t.offset.copy(src.offset); t.rotation = src.rotation;
  return t;
}
/** 一块像素（RGBA 字节）做成贴图。repeat：平铺（细节）还是不平铺（权重图） */
function pixelTexture(pixels, size, anisotropy, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size); img.data.set(pixels); g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = false; t.anisotropy = anisotropy;
  return t;
}
const SLOTS = ['map', 'roughnessMap', 'metalnessMap', 'aoMap', 'normalMap'];
/** 网格的顶点数据（零件图要用）：位置、UV 都得是普通的浮点属性，不是就不要 */
function meshData(o) {
  const g = o.geometry, p = g?.attributes?.position, u = g?.attributes?.uv;
  if (!p || !u || p.isInterleavedBufferAttribute || u.isInterleavedBufferAttribute || p.itemSize !== 3 || u.itemSize !== 2 || u.normalized) return null;
  return { name: o.name, position: p.array, uv: u.array, index: g.index ? g.index.array : null };
}

/**
 * 给模型（gltf.scene）的材质换上整理过的贴图、叠上细节。按材质名分：带 smg 的是枪，带 hand / glove / sleeve 的是手。
 * 没有画布、材质没有贴图（测试里的假模型）时什么都不改。
 * 返回 { applied, ms（总耗时）, timing（各段耗时）, stats, textures（这里新建的贴图）, dispose() }。
 * 换下来的原贴图在这里释放（连同它的 ImageBitmap），显存不翻倍。
 */
export function skinSmg(model, { S = SMG_SKIN } = {}) {
  const made = new Set(), out = { applied: false, ms: 0, timing: {}, stats: {}, textures: made, dispose() { for (const t of made) t.dispose(); made.clear(); } };
  if (!hasCanvas() || !model?.traverse) return out;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0), t0 = now();
  const gun = [], hands = [], meshes = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    let isGun = false;
    for (const m of [].concat(o.material)) { if (!m?.isMeshStandardMaterial) continue; if (/smg/i.test(m.name)) { isGun = true; if (!gun.includes(m)) gun.push(m); } else if (/hand|glove|sleeve/i.test(m.name) && !hands.includes(m)) hands.push(m); }
    if (isGun) { const d = meshData(o); if (d) meshes.push(d); }
  });
  const swap = new Map(); // 原贴图的图像 → 新贴图（几个材质、几个槽共用一张图的，只算一遍）
  const full = (m) => m.map?.image && m.roughnessMap?.image && m.normalMap?.image;
  const part = new Map(); // 粗糙度贴图的图像 → 权重图
  const g = gun.find(full);
  if (g) {
    const B = readPixels(g.map, S.size), R = readPixels(g.roughnessMap, S.mrSize), N = readPixels(g.normalMap, S.size), t1 = now();
    if (B && R && N) {
      const parts = partMap(meshes, S.partSize, classifySmg, S.pad), t2 = now(), weights = new Uint8ClampedArray(S.mrSize * S.mrSize * 4);
      out.stats.gun = processGun(B.image.data, R.image.data, N.image.data, S.size, S.gun, S.mrSize, parts, weights); out.stats.gun.islands = parts ? parts.islands : 0;
      out.timing.parts = t2 - t1; out.timing.gun = now() - t2;
      swap.set(g.map.image, rebuild(g.map, B, S.anisotropy)); swap.set(g.roughnessMap.image, rebuild(g.roughnessMap, R, 4)); swap.set(g.normalMap.image, rebuild(g.normalMap, N, S.anisotropy));
      part.set(g.roughnessMap.image, pixelTexture(weights, S.mrSize, 4, false));
    }
  }
  const h = hands.find((m) => full(m) && !swap.has(m.roughnessMap.image));
  if (h) {
    const ss = S.mrSize >> 1, small = readPixels(h.map, ss), R = readPixels(h.roughnessMap, S.mrSize), t1 = now();
    if (small && R) {
      const weights = new Uint8ClampedArray(ss * ss * 4);
      out.stats.hands = processHands(R.image.data, S.mrSize, small.image.data, ss, S.hands, weights); out.timing.hands = now() - t1;
      swap.set(h.roughnessMap.image, rebuild(h.roughnessMap, R, 4)); part.set(h.roughnessMap.image, pixelTexture(weights, ss, 4, false));
    }
  }
  if (!swap.size) return out;
  // 袖子全是布：权重图上皮面那几块对袖子是别的东西，给它一张 2×2 的「全是织物」
  const cloth = pixelTexture(new Uint8ClampedArray(16).map((_, i) => (i % 4 === 0 || i % 4 === 2 ? 0 : 255)), 2, 1, false);
  for (const t of swap.values()) made.add(t);
  for (const t of part.values()) made.add(t);
  made.add(cloth);
  // 细节贴图：四张（磷化颗粒、麻点、皮纹、织物）
  const t2 = now(), ds = S.detailSize, H = detailHeights(ds), det = (h, bump) => { const t = pixelTexture(detailPixels(h, ds, bump), ds, S.anisotropy, true); made.add(t); return t; };
  const grain = det(H.grain, 0.5), stipple = det(H.stipple, 0.35), pebble = det(H.pebble, 0.5), weave = det(H.weave, 0.5); out.timing.detail = now() - t2;
  const vec = (d) => (d ? new THREE.Vector4(d.scale, d.normal, d.rough, d.tint) : new THREE.Vector4(1, 0, 0, 0));
  const old = new Set();
  for (const m of [...gun, ...hands]) {
    if (!m.normalMap || !m.roughnessMap || !swap.has(m.roughnessMap.image)) continue;
    const isGun = gun.includes(m), sleeve = !isGun && /sleeve/i.test(m.name), weights = part.get(m.roughnessMap.image);
    for (const k of SLOTS) { const t = m[k], nt = t && swap.get(t.image); if (nt && nt !== t) { old.add(t); m[k] = nt; } }
    let U;
    if (isGun) U = { uSkinDetA: { value: stipple }, uSkinDetB: { value: grain }, uSkinPart: { value: weights }, uSkinA: { value: vec(S.gun.A) }, uSkinB: { value: vec(S.gun.B) }, uSkinC: { value: vec(S.gun.C) }, uSkinF90: { value: S.gun.f90 },
      uSkinMottle: { value: new THREE.Vector4(S.gun.mottle.scale, S.gun.mottle.albedo, S.gun.mottle.rough, S.gun.mottle.metal) }, uSkinNeutral: { value: S.gun.neutral }, uSkinEnv: { value: S.gun.env } };
    else {
      const D = sleeve ? S.hands.sleeve : S.hands.glove;
      // 左手腕上手套的袖口从袖子里穿出来一块（模型本身的穿插，原样就有），腰射时正好在画面里，是一块锯齿边的浅色布。
      // 袖子往镜头挪一点点深度就盖住了；穿插只有几毫米，手套真正在袖子外面的地方差得远，不受影响
      if (sleeve) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4; }
      U = { uSkinDetA: { value: pebble }, uSkinDetB: { value: weave }, uSkinPart: { value: sleeve ? cloth : weights }, uSkinA: { value: vec(D.A) }, uSkinB: { value: vec(D.B) }, uSkinC: { value: vec(null) }, uSkinF90: { value: S.hands.f90 } };
    }
    m.userData.skin = U;
    m.onBeforeCompile = (shader) => { skinShader(shader, U, isGun); };
    m.customProgramCacheKey = () => (isGun ? 'smg-skin-4-pos' : 'smg-skin-4-uv');
    m.needsUpdate = true;
  }
  for (const t of old) { t.dispose(); t.image?.close?.(); }
  out.applied = true; out.ms = now() - t0;
  return out;
}
