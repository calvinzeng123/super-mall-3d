// 丧尸贴图的「画法」：纯数据运算（不碰 three.js、不碰 document），zombie-skin.js 负责把它接到贴图和材质上。
// 最早的做法是把行人贴图去色、再往贴图上随机位置扣几个圆血斑——很多落在没用到的空白处，或者在衣服上成了一个个圆圈，
// 远看就是普通路人站在偏色的灯下。这里先把模型的三角形按 UV 光栅化到一张小网格上，于是贴图上每一格都知道
// 自己在身体上的什么位置（基础姿势下的三维坐标、朝向），这样：
//   - 伤口定在身体的实处（脖子侧面、肩胛、肋侧、肚子、前臂、大腿），血从伤口往「世界坐标的下方」淌、越往下越宽越干，
//     到裤腰积成一圈；淌痕是一道道竖着的细流，接缝两边对得上；
//   - 嘴角的血顺着下巴、脖子流到胸口，眼窝、颧骨下、太阳穴按脸的三维位置压暗，脸才是塌的，不是一张白面具；
//   - 越往脚下越脏，膝盖往下明显一层土、鞋上一圈泥。
// 第一轮评审的教训（都在这一版里改掉了）：
//   - 伤口按「模型」定，同一个模型的三套色调伤在同一处、同一个形状，一群看过去像印在制服上的队徽——现在每种外观
//     各自从一组解剖位置里挑一到三处、各自抖位置大小方向和左右，血的形状由这几处决定；
//   - 血斑是硬边的心形、水滴形，条纹从血里透出来——现在边缘按布纹（横向拉长的噪声 + 条纹深浅）洇开，外沿一圈深的
//     「咖啡环」，越往中心越饱和、条纹被压平，旧血发褐、源头暗红，往下挂淌痕；
//   - 抓痕、破口画成了闭合的圈和钩（像字），现在是张开的裂口：里面暗、透出皮肉，一边是翻起的浅色毛边，一边压出阴影；
//   - 嘴上一块口红似的红、脸上几道胡须似的线、一圈熊猫眼——现在嘴唇发暗发紫干裂，嘴血从唇线往下淌，
//     血管是太阳穴、下颌、脖子上分叉的细青纹，眼窝是往颧骨散开的软阴影。
// 第二轮又改的：
//   - 血斑外面加一圈半透的淡渍（血水顺着纱走了一截），浸透的那片里有厚有薄，边按三档噪声碎开——不再是贴上去的一块平涂；
//   - 脖子咬伤往下洇成一大片、左右扭着走，不是一根竖杠；裤腰上只在上面真淌到的地方积（以前会单独冒出两截横杠，整块成倒 T）；
//   - 细流少而长、顺着褶子拐、粗细起伏；喷溅、溅点是转过角度又互相切掉的细点子（单张噪声取高阈值是一个个方块）；
//   - 抓痕连皮划开：口子里是暗红的肉、周围的布吸了血；正面的口子、细流不再画到转过去的侧面上（以前会拉成一个方框）；
//   - 嘴边那一片的噪声跟着细，下巴上不再挂一个方块；特殊感染者的血在皮肤上也往暗褐里收。
// 颜色图每种外观一张；法线和粗糙度每个模型一张、各外观共用（只放布料、皮肤、头发这些「底子」）。
// 每种外观自己的湿血、伤口、涎水、油泥的光泽写在颜色图的透明通道里（见 encodeWet），zombie-skin.js 的着色器读出来
// 改粗糙度、把布纹法线抹平——伤口各外观不同，共用的粗糙度图装不下，又不想多做十几张图。
// 所有大循环都写成生成器：每处理两千来格就 yield 一次，外面按时间预算切片、隔帧继续（不卡开局那几秒）。
// 颜色都按 sRGB 0–255 算（贴图里就是这个），血是「乘」上去的，底下的褶子还透得出来。

/** 画法的常数。layout：身体网格的分辨率（贴图上每格对应身体上一个点）；dilate：岛边往外补几格（接缝处取样不落空） */
export const PAINT = Object.freeze({
  layout: 256,
  dilate: 4,
  chunk: 1024, // 每画这么多格让一次（外面按时间决定要不要隔帧）：一段一两毫秒，外面的时间预算才掐得准；某种外观头一回走到新分支时 V8 会退回解释执行，段小了那一段也短
  // 颜色（sRGB 0–255）：污垢偏灰褐（乘上去），裤脚上的土发灰白，鞋上的泥发暗褐
  grime: Object.freeze([58, 50, 40]),
  dust: Object.freeze([134, 126, 110]),
  mud: Object.freeze([0.5, 0.42, 0.33]),
  // 共用粗糙度图的「底子」：皮肤有点蜡、布料哑光、头发和鞋居中、眼球和口腔湿
  rough: Object.freeze({ cloth: 0.93, skin: 0.58, hair: 0.72, shoe: 0.62, eye: 0.3, mouth: 0.4 }),
  // 原贴图里眼球、口腔那两小块（Rocketbox 行人的通用排布，UV：u0, v0, u1, v1）
  islands: Object.freeze({ eye: Object.freeze([0.595, 0.415, 0.68, 0.5]), mouth: Object.freeze([0.5, 0.3, 0.6, 0.5]) }),
});

// 身体各部分的编号（layers.part）
export const PART = Object.freeze({ none: 0, cloth: 1, skin: 2, hair: 3, shoe: 4, eye: 5, mouth: 6 });

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
/** 一张 S 宽的图，每隔几行 yield 一次 */
const rowsPer = (S) => Math.max(1, Math.round(PAINT.chunk / S));
/** 把一个生成器一口气跑完，返回它的结果（测试和不需要切片的地方用） */
export function finish(gen) { for (;;) { const r = gen.next(); if (r.done) return r.value; } }

/** 可复现的随机数（mulberry32）：同一个种子每次出一样的伤口位置 */
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 三维值噪声：伤口边缘、皮肤斑驳、污垢的大块起伏都按身体上的三维位置取，所以接缝两边连得上
function hash3(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d, seed);
  const x00 = mix(c(0, 0, 0), c(1, 0, 0), fx), x10 = mix(c(0, 1, 0), c(1, 1, 0), fx), x01 = mix(c(0, 0, 1), c(1, 0, 1), fx), x11 = mix(c(0, 1, 1), c(1, 1, 1), fx);
  return mix(mix(x00, x10, fy), mix(x01, x11, fy), fz);
}
/** 三维分形噪声，0–1 左右。纯函数 */
export function fbm3(x, y, z, seed, octaves = 3) {
  let a = 0, w = 0.5, t = 0;
  for (let o = 0; o < octaves; o++) { a += vnoise3(x, y, z, seed + o * 17) * w; t += w; x *= 2.03; y *= 2.03; z *= 2.03; w *= 0.5; }
  return a / t;
}

/**
 * 一张可平铺的二维噪声表（n×n，0–1，分形）：贴图空间里的细节（纤维、血点、脏斑的毛边、血管纹）都从这张表里按不同缩放取，
 * 比逐像素算噪声便宜得多。纯函数
 */
export function noiseTable(n, seed, octaves = 4, base = 8) { return finish(noiseTableSteps(n, seed, octaves, base)); }
/** 同上，按八度 yield（开局切片用） */
export function* noiseTableSteps(n, seed, octaves = 4, base = 8) {
  const out = new Float32Array(n * n), rnd = makeRng(seed);
  let w = 0.5, total = 0;
  for (let o = 0, p = base; o < octaves && p <= n; o++, p *= 2) {
    const lat = new Float32Array(p * p); for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const k = p / n;
    for (let y = 0; y < n; y++) {
      const fy = y * k, yi = Math.floor(fy), ty = fy - yi, sy = ty * ty * (3 - 2 * ty), y0 = (yi % p) * p, y1 = ((yi + 1) % p) * p;
      for (let x = 0; x < n; x++) {
        const fx = x * k, xi = Math.floor(fx), tx = fx - xi, sx = tx * tx * (3 - 2 * tx), x0 = xi % p, x1 = (xi + 1) % p;
        out[y * n + x] += w * mix(mix(lat[y0 + x0], lat[y0 + x1], sx), mix(lat[y1 + x0], lat[y1 + x1], sx), sy);
      }
    }
    total += w; w *= 0.5;
    yield;
  }
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < out.length; i++) { out[i] /= total; lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
  const span = hi - lo || 1; for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / span; // 拉满 0–1，阈值好定
  return out;
}
/** 从噪声表里取一个点（u、v 以表的格子为单位，自动平铺，双线性）。纯函数 */
export function tap(t, n, u, v) {
  const xf = Math.floor(u), yf = Math.floor(v), tx = u - xf, ty = v - yf, m = n - 1;
  const x0 = xf & m, x1 = (xf + 1) & m, y0 = (yf & m) * n, y1 = ((yf + 1) & m) * n;
  return mix(mix(t[y0 + x0], t[y0 + x1], tx), mix(t[y1 + x0], t[y1 + x1], tx), ty);
}

/**
 * 把模型的三角形按 UV 画到 L×L 的网格上：每格记下身体上那一点的三维位置和法线（基础姿势 = 第 0 个走路姿势）。
 * geo：{ position, uv, index?, normal? }（扁平数组）。贴图不翻转（flipY = false），所以 v 直接对应行号。
 * 返回 { L, used（1 = 三角形盖到，2 = 岛边往外补出来的），pos, nrm }。纯函数
 */
export function rasterBody(geo, L = PAINT.layout, dilate = PAINT.dilate) { return finish(rasterBodySteps(geo, L, dilate)); }
/** 同上，每几百个三角形、每圈补边 yield 一次（开局切片用） */
export function* rasterBodySteps(geo, L = PAINT.layout, dilate = PAINT.dilate) {
  const P = geo.position, UV = geo.uv, N = geo.normal, I = geo.index, n = L * L;
  const used = new Uint8Array(n), pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  const tris = I ? I.length / 3 : P.length / 9;
  for (let t = 0; t < tris; t++) {
    const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
    const ax = UV[a * 2] * L, ay = UV[a * 2 + 1] * L, bx = UV[b * 2] * L, by = UV[b * 2 + 1] * L, cx = UV[c * 2] * L, cy = UV[c * 2 + 1] * L;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) continue;
    if ((t & 511) === 511) yield;
    // 面法线兜底（几何没带法线时）
    const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2];
    const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2];
    let fnx = e1y * e2z - e1z * e2y, fny = e1z * e2x - e1x * e2z, fnz = e1x * e2y - e1y * e2x; const fl = Math.hypot(fnx, fny, fnz) || 1; fnx /= fl; fny /= fl; fnz /= fl;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(L - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(L - 1, Math.ceil(Math.max(ay, by, cy)));
    const eps = -0.02; // 稍微放宽一点，细长的三角形也能盖到格子中心
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w2 = 1 - w0 - w1;
      if (w0 < eps || w1 < eps || w2 < eps) continue;
      const k = y * L + x; used[k] = 1;
      for (let d = 0; d < 3; d++) {
        pos[k * 3 + d] = P[a * 3 + d] * w0 + P[b * 3 + d] * w1 + P[c * 3 + d] * w2;
        nrm[k * 3 + d] = N ? N[a * 3 + d] * w0 + N[b * 3 + d] * w1 + N[c * 3 + d] * w2 : d === 0 ? fnx : d === 1 ? fny : fnz;
      }
    }
  }
  // 岛边往外补几圈（取周围已有格子的平均）：贴图采样、双线性插值落在岛边时不会混进空白
  for (let pass = 0; pass < dilate; pass++) {
    const add = [];
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      const k = y * L + x; if (used[k]) continue;
      let cnt = 0; const s = [0, 0, 0, 0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= L || yy >= L) continue;
        const q = yy * L + xx; if (!used[q]) continue;
        cnt++; for (let d = 0; d < 3; d++) { s[d] += pos[q * 3 + d]; s[d + 3] += nrm[q * 3 + d]; }
      }
      if (cnt) add.push(k, cnt, ...s);
    }
    yield;
    for (let i = 0; i < add.length; i += 8) { const k = add[i], c = add[i + 1]; used[k] = 2; for (let d = 0; d < 3; d++) { pos[k * 3 + d] = add[i + 2 + d] / c; nrm[k * 3 + d] = add[i + 5 + d] / c; } }
  }
  return { L, used, pos, nrm };
}

/**
 * 身体的大致尺寸（从顶点直接量）：头顶高度、躯干中心（x、z）、躯干前后各多厚，裤腰和膝盖的高度（按身高比例）。纯函数
 */
export function bodyFrame(position) {
  let top = -Infinity, sx = 0, sz = 0, n = 0, zmin = Infinity, zmax = -Infinity;
  for (let i = 1; i < position.length; i += 3) top = Math.max(top, position[i]);
  for (let i = 0; i < position.length; i += 3) {
    const y = position[i + 1]; if (y < top * 0.6 || y > top * 0.75) continue;
    const x = position[i]; if (Math.abs(x) > 0.16) continue; // 只要躯干，不要垂着的手臂
    sx += x; sz += position[i + 2]; n++; zmin = Math.min(zmin, position[i + 2]); zmax = Math.max(zmax, position[i + 2]);
  }
  return { top, cx: n ? sx / n : 0, cz: n ? sz / n : 0, front: n ? zmax : 0.12, back: n ? zmin : -0.12, waist: top * 0.555, knee: top * 0.29 };
}

/** 网格上离 target 最近的、满足 ok(格子序号) 的那一格的序号（-1 = 没有） */
function snapK(body, [tx, ty, tz], ok = null) {
  const { L, used, pos } = body; let best = -1, bd = Infinity;
  for (let k = 0; k < L * L; k++) {
    if (used[k] !== 1) continue;
    const dx = pos[k * 3] - tx, dy = pos[k * 3 + 1] - ty, dz = pos[k * 3 + 2] - tz, d = dx * dx + dy * dy + dz * dz;
    if (d < bd && (!ok || ok(k))) { bd = d; best = k; }
  }
  return best;
}
/** 网格上的一点：{ x, y, z, nx, nz（水平朝向，归一）, ny } */
function pointAt(body, k, fallback) {
  if (k < 0) return { x: fallback[0], y: fallback[1], z: fallback[2], nx: 0, ny: 0, nz: 1 };
  const P = body.pos, N = body.nrm, h = Math.hypot(N[k * 3], N[k * 3 + 2]) || 1;
  return { x: P[k * 3], y: P[k * 3 + 1], z: P[k * 3 + 2], nx: N[k * 3] / h, ny: N[k * 3 + 1], nz: N[k * 3 + 2] / h };
}
const snapPoint = (body, target, ok) => pointAt(body, snapK(body, target, ok), target);

/**
 * 脸上的几处基准（各外观共用）：眼睛、鼻尖、嘴（嘴唇表面）、下巴、太阳穴、颧骨下凹处。
 * face：zombie-skin.js 的 faceOf（{ top, front, x, eyes?, nose?, mouth? }；后三样从眼球、口腔那两块贴图对应的顶点量，量不到就按比例估）。纯函数
 */
export function planFace(body, frame, face) {
  const T = frame.top;
  const eyes = face.eyes?.length === 2 ? face.eyes : [-1, 1].map((s) => ({ x: face.x + s * 0.031, y: T - 0.108, z: face.front - 0.012 }));
  const ex = (eyes[0].x + eyes[1].x) / 2, ey = (eyes[0].y + eyes[1].y) / 2, ez = Math.max(eyes[0].z, eyes[1].z);
  const nose = face.nose || { x: ex, y: ey - 0.045, z: ez + 0.035 };
  const m0 = face.mouth || { x: ex, y: nose.y - 0.033 };
  const front = (k) => body.nrm[k * 3 + 2] > 0.25;
  const lip = snapPoint(body, [m0.x, m0.y, nose.z], front);
  const mouth = { x: m0.x, y: m0.y, z: lip.z };
  const at = (x, y, z) => snapPoint(body, [x, y, z]);
  return {
    eyes, nose, mouth, x: ex, eyeY: ey, eyeZ: ez, chinY: mouth.y - 0.044, frame,
    temples: [-1, 1].map((s) => at(ex + s * 0.07, ey + 0.014, ez - 0.06)),
    cheeks: [-1, 1].map((s) => at(ex + s * 0.046, mouth.y + 0.017, nose.z - 0.02)),
  };
}

/**
 * 每种外观怎么画（颜色都是 sRGB 0–255，乘色是 0–1）：
 *   skinA / skinB：皮肤斑驳的两种底色（灰绿 ↔ 灰紫），按三维低频噪声过渡；chroma：原肤色的颜色留多少（明暗细节全留）；contrast：脸上明暗再拉开一点；
 *   veins / veinCol：血管多重、什么颜色（乘上去）；bruise：淤青；sock：眼窝颜色（乘）；lips：嘴唇的颜色；
 *   blood：血洇开得多大；grime：多脏；rips：破口几处；claws：抓痕的概率；mouth：嘴边的血多少（0 = 没有）；spray：喷溅的血点几片；shins：小腿上的血点；
 *   fluid：嘴里淌出来的是什么（喷酸者的黄绿涎水，乘色）；bloodMul：血的颜色（尖叫者发黑、巨尸更红）；
 *   spots：特殊感染者的标记（'acid' 喷酸者往下淌的酸液、'lesion' 巨尸的烂疮、'pustule' 胖尸的脓疱）；soot：扑袭者的一身黑，ash：肩膀上的浅灰；filth：油泥的光泽；
 *   ooze：胖尸渗出来的脓水把衣服洇成什么色（乘色）；hair：头发亮度再乘多少；
 *   front / back：正面、背后那一大片血要不要（不写 = 要）；wounds：附带的伤几处（[最少, 最多]）；pool：附带的伤可以挑哪些（不写 = 全都可以）。
 */
export const LOOKS = Object.freeze({
  // 三套普通的：灰绿、发青发灰、蜡黄。正面、背后各一大片血（front / back），再一两处附带的
  walker: Object.freeze([
    Object.freeze({ skinA: [120, 128, 106], skinB: [116, 99, 120], chroma: 0.04, contrast: 1.25, veins: 1, veinCol: [0.5, 0.56, 0.74], bruise: 0.85, sock: [0.36, 0.27, 0.33], lips: [54, 34, 46], blood: 1, grime: 1, rips: 4, claws: 0.6, mouth: 1, spray: 1, shins: 0.8, wounds: [1, 2] }),
    Object.freeze({ skinA: [114, 124, 114], skinB: [112, 96, 118], chroma: 0.03, contrast: 1.3, veins: 1.1, veinCol: [0.48, 0.54, 0.76], bruise: 0.95, sock: [0.34, 0.27, 0.36], lips: [50, 34, 50], blood: 0.95, grime: 0.95, rips: 4, claws: 0.5, mouth: 0.9, spray: 1, shins: 0.6, wounds: [1, 2] }),
    Object.freeze({ skinA: [130, 128, 100], skinB: [120, 100, 110], chroma: 0.05, contrast: 1.2, veins: 0.95, veinCol: [0.52, 0.55, 0.72], bruise: 0.8, sock: [0.38, 0.28, 0.32], lips: [58, 34, 42], blood: 1.15, grime: 1.05, rips: 5, claws: 0.7, mouth: 1.2, spray: 2, shins: 1, wounds: [1, 2] }),
  ]),
  // 尖叫者：失血的灰白，带一点紫；血管发青发紫、看得很清楚；嘴唇灰蓝干裂；血很少（只有后颈一口）
  pale: Object.freeze({ skinA: [150, 150, 160], skinB: [128, 120, 146], chroma: 0.02, contrast: 1.35, veins: 1.25, veinCol: [0.44, 0.42, 0.62], bruise: 0.5, sock: [0.36, 0.34, 0.48], lips: [72, 74, 96], blood: 0.55, grime: 0.5, rips: 3, claws: 0.4, mouth: 0.45, spray: 0, shins: 0.3, wounds: [1, 1], front: 0, back: 1, pool: ['forearm', 'gut'], bloodMul: [0.36, 0.2, 0.22] }),
  // 扑袭者：一身黑（皮、衣服都压到一两成亮），胳膊上一道道发亮的黑油泥，手电下只有红眼和湿亮的地方勾出轮廓
  lunger: Object.freeze({ skinA: [52, 50, 50], skinB: [44, 39, 42], chroma: 0.02, contrast: 1.2, veins: 0.35, veinCol: [0.6, 0.6, 0.66], bruise: 0.3, sock: [0.32, 0.22, 0.22], lips: [30, 22, 24], blood: 1, grime: 1.2, rips: 5, claws: 0.8, mouth: 1, spray: 1, shins: 0.6, wounds: [1, 2], soot: 0.86, ash: 0.2, filth: 0.65, hair: 0.6 }),
  // 喷酸者：蜡黄发灰的黄疸，有斑驳；绿只在血管、眼窝和嘴边；嘴角淌黄绿的涎水；酸液从嘴里、胸口往下淌着烧
  spitter: Object.freeze({ skinA: [152, 148, 96], skinB: [130, 126, 90], chroma: 0.03, contrast: 1.25, veins: 1, veinCol: [0.6, 0.72, 0.5], bruise: 0.4, sock: [0.48, 0.54, 0.26], lips: [70, 80, 40], blood: 0.6, grime: 0.8, rips: 2, claws: 0, mouth: 1.2, spray: 0, shins: 0.4, wounds: [1, 1], front: 0, back: 1, pool: ['gut', 'flank', 'thigh'], fluid: [0.62, 0.7, 0.36], spots: 'acid' }),
  // 巨尸：暗红褐、生肉似的皮，大块露出肌肉的烂疮（发黑的芯、湿亮的肉、发黄的边）在前臂、上臂、脖子、脸和小腿上，皮撑裂几道
  brute: Object.freeze({ skinA: [98, 46, 38], skinB: [76, 36, 36], chroma: 0.02, contrast: 1.2, veins: 0.7, veinCol: [0.55, 0.4, 0.5], bruise: 0.5, sock: [0.36, 0.2, 0.2], lips: [40, 16, 16], blood: 1.4, grime: 0.9, rips: 5, claws: 0.8, mouth: 1.3, spray: 2, shins: 1, wounds: [1, 2], spots: 'lesion', bloodMul: [0.42, 0.06, 0.05] }),
  // 胖尸：病黄发绿、大块发紫的斑，鼓起来的青紫血管，一身脓疱；腋下、肚子渗出的脓水把衣服洇湿一大片，侧缝撑裂
  bloater: Object.freeze({ skinA: [148, 152, 90], skinB: [118, 98, 124], chroma: 0.03, contrast: 1.2, veins: 1.8, veinCol: [0.48, 0.42, 0.78], bruise: 1, sock: [0.4, 0.34, 0.44], lips: [62, 46, 70], blood: 0.85, grime: 0.9, rips: 3, claws: 0, mouth: 0.8, spray: 1, shins: 0.6, wounds: [0, 1], spots: 'pustule', ooze: [0.84, 0.72, 0.4] }),
});

// 伤口能落的地方（解剖位置）。第二轮评审：主伤口按一张单子轮换、有的落在背后有的落在正面，六套里两套前襟几乎干净、
// 两套后背干净，5–15 米一群里三分之一还像逛街的人。现在每套外观「定额」：正面一大片（脖子 / 肩膀的咬伤、胸口的伤，
// 一路洇到下摆，占前襟三四成）+ 背后一大片，各自按外观轮换落点，再加一两处附带的（前臂、大腿、肋侧、肚子）。
const FRONT = Object.freeze(['neckF', 'shoulderF', 'chest', 'collar']);
const BACK = Object.freeze(['neckB', 'shoulderB', 'upperBack']);
const SECONDARY = Object.freeze(['forearm', 'thigh', 'flank', 'gut', 'forearm']);

/**
 * 一种外观的伤（各外观各不相同）：正面、背后各一大片（look.front / look.back = 0 的不做），再挑几处附带的；
 * 再加嘴边的血（一片糊开的 + 往下淌的几道）、抓痕、破口（从这个模型的几处固定破口里挑，见 bodyTears）、喷溅、特殊标记。
 * key：这一模型上的第几种外观（正面、背后的落点按 key + rot 轮换，同一模型的几套外观不落在同一处；rot 让两个模型错开）；
 * part(k)：网格第 k 格是身体哪部分（PART）；tears：bodyTears 的结果（不给就按这个模型现算一份）。
 * 返回 { wounds, runs, claws, rips, sprays, spots, spotKind, acid, shins, mouth, smear }：每处伤口 { x, y, z, nx, nz（朝向）, r, len（往下淌多远）,
 * spread（往下越淌越宽）, wet, open（皮肉翻开）, … }；runs：往下淌的一道道（mkRun）。纯函数
 */
export function planLook(body, frame, face, seed, look, key = 0, part = null, rot = 0, tears = null) {
  const rnd = makeRng(seed), T = frame.top, cx = frame.cx, cz = frame.cz;
  const J = (a) => (rnd() * 2 - 1) * a;
  const nrm = body.nrm, pos = body.pos;
  const torso = (k) => Math.abs(pos[k * 3] - cx) < 0.15;
  const facing = (x, z, min) => (k) => nrm[k * 3] * x + nrm[k * 3 + 2] * z > min;
  const cloth = (k) => !part || part(k) === PART.cloth;
  const skin = (k) => !part || part(k) === PART.skin;
  const above = (y) => (k) => pos[k * 3 + 1] > y;
  const and = (...fs) => (k) => fs.every((f) => f(k));
  const wounds = [], scale = Math.max(0.6, look.blood || 1);
  // 一处伤口：at 落点，len 往下淌多远，spread 越往下越宽多少，open 皮肉翻开多大，wet 源头多湿；jit：大小长短抖多少（大片的抖得少，保证够大）
  const wound = (p, r, len, spread, open, wet, jit = 1) => { const W = mkWound(p.x, p.y, p.z, p.nx, p.nz, r * (1 + J(0.2 * jit)), len * (1 + J(0.22 * jit)) * Math.sqrt(scale), spread * (1 + J(0.18 * jit)), open, wet, J(1.2), (rnd() * 1e6) | 0, false); wounds.push(W); return W; };
  const front = (min = 0.3) => and(facing(0, 1, min), torso), back = (min = 0.3) => and(facing(0, -1, min), torso);
  const site = {
    // 正面的大片：脖子侧面咬了一口（颈侧的伤 + 从锁骨往前胸一路洇到下摆）
    neckF: (s) => { neckBite(s, 1); return wound(snapPoint(body, [cx + s * (0.07 + J(0.012)), T * (0.79 + J(0.01)), frame.front], and(front(), cloth)), 0.075, 0.46, 0.3, 0, 0.6, 0.4); },
    // 肩膀上面咬穿：血从肩头顺着前胸外侧和袖子往下
    shoulderF: (s) => wound(snapPoint(body, [cx + s * (0.1 + J(0.012)), T * (0.8 + J(0.01)), frame.front * 0.7], and(facing(0, 1, 0.2), cloth, (k) => Math.abs(pos[k * 3] - cx) < 0.16)), 0.078, 0.5, 0.34, 0.7, 0.8, 0.4),
    // 胸口一处豁开的伤，往下洇到裤腰
    chest: (s) => wound(snapPoint(body, [cx + s * (0.05 + J(0.02)), T * (0.71 + J(0.015)), frame.front], and(front(0.4), cloth)), 0.065, 0.38, 0.32, 1, 0.95, 0.4),
    // 领口正中：喉咙被咬开，整片前襟浸透（围嘴似的一大片）
    collar: (s) => { neckBite(s * 0.4, 0.8); return wound(snapPoint(body, [cx + s * 0.02, T * 0.8, frame.front], and(front(0.35), cloth)), 0.075, 0.44, 0.3, 0, 0.6, 0.4); },
    // 背后的大片
    neckB: (s) => { neckBite(s, 0.8); return wound(snapPoint(body, [cx + s * (0.06 + J(0.015)), T * (0.79 + J(0.01)), frame.back], and(back(), cloth)), 0.085, 0.5, 0.36, 0, 0.55, 0.4); },
    shoulderB: (s) => wound(snapPoint(body, [cx + s * (0.11 + J(0.015)), T * (0.79 + J(0.01)), frame.back * 0.6], and(facing(0, -1, 0.1), cloth, (k) => Math.abs(pos[k * 3] - cx) < 0.17)), 0.08, 0.48, 0.34, 0.6, 0.75, 0.4),
    upperBack: (s) => wound(snapPoint(body, [cx + s * (0.07 + J(0.02)), T * (0.74 + J(0.02)), frame.back], and(back(0.35), cloth)), 0.075, 0.44, 0.36, 0.9, 0.9, 0.4),
    // 附带的小伤
    gut: (s) => wound(snapPoint(body, [cx + s * (0.025 + rnd() * 0.04), T * (0.6 + J(0.025)), frame.front], front(0.35)), 0.045, 0.24, 0.28, 1, 1),
    flank: (s) => wound(snapPoint(body, [cx + s * 0.15, T * (0.62 + J(0.03)), cz + J(0.03)], and(facing(s, 0, 0.45), torso)), 0.045, 0.28, 0.24, 1, 0.95),
    forearm: (s) => wound(snapPoint(body, [cx + s * 0.25, T * (0.47 + J(0.03)), cz + 0.03 + J(0.02)], (k) => !torso(k) && pos[k * 3 + 1] < T * 0.56), 0.03, 0.18, 0.06, 1, 0.9),
    thigh: (s) => wound(snapPoint(body, [cx + s * (0.09 + J(0.02)), T * (0.36 + J(0.04)), frame.front], and(facing(0, 1, 0.4), (k) => Math.abs(pos[k * 3] - cx) > 0.03)), 0.04, 0.26, 0.1, 0.9, 0.85),
  };
  function neckBite(s, amt) { const W = wound(snapPoint(body, [cx + s * 0.06, T * (0.835 + J(0.008)), cz + 0.01 + J(0.015)], (k) => Math.abs(nrm[k * 3]) > 0.4), 0.03, 0.1, 0.15, amt, 1); W.bite = 1; }
  const pool = look.pool || null, [lo, hi] = look.wounds || [1, 2], count = lo + Math.floor(rnd() * (hi - lo + 1));
  let side = rnd() < 0.5 ? -1 : 1, main = null;
  const used = new Set();
  if ((look.front ?? 1) > 0) { const name = FRONT[(key + rot) % FRONT.length]; used.add(name); main = site[name](side); }
  if ((look.back ?? 1) > 0) { const name = BACK[(key + rot + 1) % BACK.length]; used.add(name); site[name](rnd() < 0.6 ? -side : side); }
  for (let i = 0; i < count; i++) {
    const options = (pool || SECONDARY).filter((n) => !used.has(n)); if (!options.length) break;
    const name = options[Math.floor(rnd() * options.length)]; used.add(name); side = rnd() < 0.6 ? -side : side;
    const W = site[name](side); if (!main && pool) main = W;
  }
  // 往下淌的几道：每处伤口从浸透那片的下半截挂下一到三道，随机游走、粗细不一、末端一滴（以前是一排等宽的竖线，像条形码）
  const runs = [];
  for (const W of wounds) {
    if (W.bite) continue;
    const n = 1 + Math.floor(rnd() * (W.len > 0.35 ? 3 : 2));
    for (let i = 0; i < n; i++) {
      const dy = W.len * (0.3 + rnd() * 0.35), hw = W.r * 0.9 + dy * W.spread;
      runs.push(mkRun(rnd, W.x, W.y - dy, W.z, W.nx, W.nz, J(hw * 0.7), W.len * (0.25 + rnd() * 0.45), 0.0045 + rnd() * 0.003, 0.0016 + rnd() * 0.001));
    }
  }
  // 嘴：先是一片糊开的（比嘴唇宽、唇线上最暗、嘴角是新鲜的红），再从下巴挂下一到三道（世界坐标里随机游走往下，长短不一，最长的一道淌到领口）；
  // 领口那里积成一片洇进衣服（collar 那片正面伤口的样子，小一点）
  let smear = null; const mouthRuns = [];
  if (look.mouth > 0) {
    const m = face.mouth, amt = look.mouth, s = rnd() < 0.5 ? -1 : 1;
    smear = { x: m.x + s * 0.004, y: m.y, z: m.z, hw: 0.026 + 0.008 * amt, up: 0.008, down: 0.03 + 0.016 * amt, corner: s, seed: (rnd() * 256) | 0, fluid: !!look.fluid };
    const nr = look.fluid ? 2 : 1 + Math.min(2, Math.floor(rnd() * 2 + amt));
    for (let i = 0; i < nr; i++) {
      const lat = (i === 0 ? s * 0.012 : J(0.02)) + J(0.004), long = i === 0;
      mouthRuns.push(mkRun(rnd, m.x, m.y - 0.014 - rnd() * 0.014, m.z, 0, 1, -lat, (long ? 0.12 + 0.05 * amt : 0.035 + rnd() * 0.07) * (look.fluid ? 0.8 : 1), (look.fluid ? 0.0065 : 0.0036) + rnd() * 0.002, look.fluid ? 0.003 : 0.0012, 0.0026));
    }
    if (!look.fluid && amt >= 0.7 && !(main && main.y > T * 0.77 && Math.abs(main.x - m.x) < 0.06)) { const W = wound(snapPoint(body, [m.x + s * 0.012, face.chinY - 0.1, frame.front], and(front(0.3), cloth, above(T * 0.72))), 0.03 + 0.01 * amt, 0.22, 0.22, 0, 0.7, 0.5); W.bib = 1; }
  }
  // 抓痕：三四道平行的，斜着划过胸口或后背，两头收尖
  const claws = [];
  if (rnd() < (look.claws ?? 0)) {
    const bk = rnd() < 0.5, s = rnd() < 0.5 ? -1 : 1;
    const p = snapPoint(body, [cx + s * (0.03 + rnd() * 0.05), T * (0.64 + rnd() * 0.1), bk ? frame.back : frame.front], and(facing(0, bk ? -1 : 1, 0.4), torso, cloth));
    claws.push(slash(p, (0.55 + rnd() * 0.5) * (rnd() < 0.5 ? 1 : -1), 0.15 + rnd() * 0.08, 3 + (rnd() < 0.4 ? 1 : 0), 0.024 + rnd() * 0.008, 0.0042 + rnd() * 0.002, rnd, 0.8));
  }
  // 破口：从这个模型固定的几处（袖口、下摆、膝盖……法线图里也压了这几处，手电扫过有一道高光）按外观挑几处；
  // 正面那片伤口上再撕开一道（只在颜色图里：伤各外观不同，共用的法线图装不下）
  const rips = [], all = tears || bodyTears(body, frame, face, part, 7), nRip = Math.min(all.length, look.rips || 0);
  for (let i = 0; i < nRip; i++) rips.push(all[(key * 3 + rot * 2 + i * 3) % all.length]);
  if (main && main.open < 1 && (look.rips || 0) > 0) rips.push(slash({ x: main.x, y: main.y - 0.02, z: main.z, nx: main.nx, nz: main.nz }, J(0.6) + Math.PI / 2 * (rnd() < 0.5 ? 1 : 0.3), 0.08 + rnd() * 0.04, 1, 0, 0.008 + rnd() * 0.004, rnd, 1));
  // 喷溅：一片细血点（常在背上：被咬的时候溅上去的）
  const sprays = [];
  for (let i = 0, n = look.spray || 0; i < n; i++) {
    const bk = i === 0 ? rnd() < 0.7 : rnd() < 0.4;
    const p = snapPoint(body, [cx + J(0.12), T * (0.62 + rnd() * 0.18), bk ? frame.back : frame.front], facing(0, bk ? -1 : 1, 0.3));
    sprays.push({ x: p.x, y: p.y, z: p.z, nx: p.nx, nz: p.nz, r: 0.07 + rnd() * 0.06, u: rnd() * 256, v: rnd() * 256 });
  }
  // 特殊感染者的标记
  const spots = [], acid = [], splits = [], kind = look.spots || null;
  if (kind === 'lesion') { // 巨尸：大块的烂疮，扎堆在两条前臂、上臂、脖子、脸颊和小腿上（都在露着的皮上）
    const s = rnd() < 0.5 ? -1 : 1;
    const groups = [[[cx + 0.25, T * 0.52, cz + 0.04], 4, 0.07, 0.042], [[cx - 0.25, T * 0.5, cz + 0.04], 3, 0.07, 0.042], [[cx + s * 0.21, T * 0.68, cz], 2, 0.03, 0.028], [[cx + s * 0.05, T * 0.81, frame.front * 0.4], 1, 0.015, 0.022], [[face.x - s * 0.05, face.mouth.y + 0.02, face.mouth.z - 0.03], 1, 0.008, 0.016], [[cx - s * 0.1, T * 0.2, frame.front * 0.5], 2, 0.04, 0.026]];
    for (const [c, n, spreadR, r0] of groups) for (let i = 0; i < n; i++) {
      const p = snapPoint(body, [c[0] + J(spreadR), c[1] + J(spreadR * 1.4), c[2] + J(spreadR)], and(skin, (k) => nrm[k * 3 + 2] > -0.1)); // 落在看得见的那面（前面、外侧）
      spots.push({ x: p.x, y: p.y, z: p.z, r: r0 * (0.8 + rnd() * 0.6) });
    }
    // 皮撑裂的几道细长口子（前臂顺着、脖子横着）
    for (const [t, ang, len] of [[[cx + 0.25, T * 0.5, cz + 0.05], 1.4, 0.08], [[cx - 0.25, T * 0.47, cz + 0.05], 1.7, 0.07], [[cx + s * 0.045, T * 0.82, frame.front * 0.4], 0.15, 0.05], [[cx - s * 0.24, T * 0.55, cz], 1.5, 0.06]]) {
      splits.push(slash(snapPoint(body, t, skin), ang + J(0.3), len, 1, 0, 0.0032, rnd, 0));
    }
  } else if (kind === 'acid') { // 喷酸者：酸液从嘴里、胸口往下淌着烧（一道道不规则的，不是一个个圆）
    for (let i = 0; i < 5; i++) {
      const p = snapPoint(body, [cx + J(0.11), T * (0.74 + J(0.04)), frame.front], and(cloth, facing(0, 1, 0.3), torso));
      acid.push(mkRun(rnd, p.x, p.y, p.z, 0, 1, 0, 0.05 + rnd() * 0.2, 0.014 + rnd() * 0.014, 0.0035 + rnd() * 0.003, 0.004)); // 起头溅上去的一大块，往下越淌越细、长短不一
    }
    for (const R of mouthRuns) acid.push(R); // 嘴里淌出来的那几道也烧（下巴、脖子上起泡，淌到领口的烧穿）
    const p = snapPoint(body, [cx + (rnd() < 0.5 ? -1 : 1) * 0.2, T * 0.73, cz + 0.03], and(cloth, (k) => !torso(k)));
    acid.push(mkRun(rnd, p.x, p.y, p.z, p.nx, p.nz, 0, 0.07, 0.009, 0.004, 0.002)); // 袖子上溅到的一道
  } else if (kind === 'pustule') { // 胖尸：腋下、肚子上渗出来的脓水把衣服洇湿一大片（黄褐、发亮），侧缝撑裂
    for (const s of [-1, 1]) { const p = snapPoint(body, [cx + s * 0.16, T * 0.7, cz], and(cloth, facing(s, 0, 0.3), torso)); const W = mkWound(p.x, p.y, p.z, p.nx, p.nz, 0.05, 0.3, 0.2, 0, 0.6, 0, (rnd() * 1e6) | 0, true); wounds.push(W); }
    const p = snapPoint(body, [cx + J(0.04), T * 0.62, frame.front], and(cloth, front(0.4))); wounds.push(mkWound(p.x, p.y, p.z, p.nx, p.nz, 0.07, 0.2, 0.3, 0, 0.6, 0, (rnd() * 1e6) | 0, true));
    for (const s of [-1, 1]) { const q = snapPoint(body, [cx + s * 0.16, T * (0.64 + J(0.03)), cz], and(cloth, facing(s, 0, 0.5))); rips.push(slash({ ...q, nx: q.nx, nz: q.nz }, Math.PI / 2 + J(0.25), 0.12 + rnd() * 0.05, 1, 0, 0.012, rnd, 0.2)); }
  }
  return { wounds, runs, claws, rips, sprays, spots, spotKind: kind, acid, splits, shins: look.shins || 0, mouth: smear, mouthRuns, shinU: rnd() * 256 };
}

/**
 * 一处伤口（所有字段一次建全、顺序固定：画的时候逐像素读它们，对象形状一样 V8 才能走快路）。
 * fluid：不是血，是胖尸腋下、肚子上渗出来的脓水（黄褐、发亮）；bite / bib：咬伤、领口积血（只做标记）
 */
function mkWound(x, y, z, nx, nz, r, len, spread, open, wet, ang, seed, fluid) {
  return { x, y, z, nx, nz, r, len, spread, open, wet, amt: 1, ang, seed, fluid, bite: 0, bib: 0 };
}

/** 一道裂口（n = 1）或一组抓痕（n = 3–4）：在 p 点的切平面里转 ang 弧度，每一道长短、位置、粗细略有不同；blood：口子边上沾多少血 */
function slash(p, ang, len, n, gap, width, rnd, blood = 0.4) {
  const cuts = [];
  for (let c = 0; c < n; c++) cuts.push({ off: (c - (n - 1) / 2) * gap * (0.85 + rnd() * 0.3), len: len * (0.7 + rnd() * 0.35), shift: (rnd() - 0.5) * 0.25 * len, w: width * (0.75 + rnd() * 0.5) });
  return { x: p.x, y: p.y, z: p.z, nx: p.nx, nz: p.nz, ca: Math.cos(ang), sa: Math.sin(ang), curv: (rnd() - 0.5) * 2.5, reach: len * 0.75 + gap * n + width * 2, cuts, blood };
}

/**
 * 一个模型固定的几处破口（各外观从里面挑，共用的法线图里把这几处全压出来）：两只袖口、前后下摆、胸口、后背、
 * 两边膝盖（男的是短裤裤脚上面一截）。口子 6–14 厘米长、张开 1.5–3 厘米（第二轮是几厘米长的细缝，像笔划的，远看看不见）。纯函数
 */
export function bodyTears(body, frame, face, part, seed = 7) {
  const rnd = makeRng(seed), T = frame.top, cx = frame.cx, cz = frame.cz, nrm = body.nrm, pos = body.pos;
  const J = (a) => (rnd() * 2 - 1) * a;
  const cloth = (k) => !part || part(k) === PART.cloth;
  const facing = (x, z, min) => (k) => nrm[k * 3] * x + nrm[k * 3 + 2] * z > min;
  const torso = (k) => Math.abs(pos[k * 3] - cx) < 0.15;
  const and = (...fs) => (k) => fs.every((f) => f(k));
  const s = rnd() < 0.5 ? -1 : 1;
  // [目标点, 筛选, 方向（0 竖、1 横）, 长]
  const spec = [
    [[cx + s * 0.21, T * 0.72, cz + 0.04], and(cloth, (k) => !torso(k), facing(0, 1, -0.2)), 0.2, 0.08],
    [[cx + s * 0.08, frame.waist + 0.07, frame.front], and(cloth, torso, facing(0, 1, 0.4)), 0.1, 0.11],
    [[cx - s * 0.09, frame.knee + 0.06, frame.front], and(cloth, facing(0, 1, 0.4)), 0.85, 0.1],
    [[cx - s * 0.06, T * 0.7, frame.back], and(cloth, torso, facing(0, -1, 0.4)), 0.4, 0.13],
    [[cx - s * 0.21, T * 0.72, cz], and(cloth, (k) => !torso(k), facing(0, -1, -0.2)), 0.25, 0.08],
    [[cx + s * 0.07, T * 0.68, frame.front], and(cloth, torso, facing(0, 1, 0.4)), 0.55, 0.1],
    [[cx - s * 0.07, frame.waist + 0.06, frame.back], and(cloth, torso, facing(0, -1, 0.4)), 0.15, 0.11],
    [[cx + s * 0.09, frame.knee + 0.1, frame.front], and(cloth, facing(0, 1, 0.4)), 0.9, 0.09],
  ];
  const out = [];
  for (const [target, ok, horiz, len] of spec) {
    const k = snapK(body, target, ok); if (k < 0) continue;
    const p = pointAt(body, k, target), ang = (1 - horiz) * Math.PI / 2 + J(0.45); // 0 = 横着的口子（膝盖），1 = 竖着从下摆、袖口往上撕
    out.push(slash(p, ang, len * (0.8 + rnd() * 0.5), 1, 0, 0.009 + rnd() * 0.006, rnd, 0.25 + rnd() * 0.35));
  }
  return out;
}

/**
 * 一道往下淌的液体（伤口、嘴角挂下来的血，喷酸者的酸液）：从 (x, y, z) 按世界坐标往下走，每 step 米一个节点——
 * 横向偏移是随机游走（顺着褶子左右拐，起点偏 lat0），宽度从 w0 一路收到 w1、中间一两处鼓起（挂住的血珠），末端一滴圆的。
 * 朝向 (nx, nz)：只画在朝这边的面上。纯函数（rnd：随机数）
 */
export function mkRun(rnd, x, y, z, nx, nz, lat0, len, w0, w1, wander = 0.0014, step = 0.004) {
  const n = Math.max(3, Math.ceil(len / step) + 1), off = new Float32Array(n), wid = new Float32Array(n);
  let o = lat0, v = 0, lo = lat0, hi = lat0;
  for (let i = 0; i < n; i++) {
    v = v * 0.72 + (rnd() - 0.5) * wander; o += v; off[i] = o; lo = Math.min(lo, o); hi = Math.max(hi, o);
    wid[i] = mix(w0, w1, Math.pow(i / (n - 1), 0.8)) * (0.7 + 0.6 * rnd());
  }
  for (let p = 0; p < 2; p++) for (let i = 1; i < n - 1; i++) wid[i] = (wid[i - 1] + wid[i] * 2 + wid[i + 1]) / 4; // 抹匀：不是一节一节的锯齿
  const bead = Math.floor(n * (0.35 + rnd() * 0.45)); for (let i = Math.max(0, bead - 2); i <= Math.min(n - 1, bead + 2); i++) wid[i] *= 1.4 - Math.abs(i - bead) * 0.13;
  const drop = Math.max(wid[n - 1] * 1.9, w1 * 1.6), pad = Math.max(w0, drop) * 2;
  return { x, y, z, nx, nz, len: (n - 1) * step, step, n, off, wid, drop, top: w0, latLo: lo - pad, latHi: hi + pad };
}

/**
 * 身体上 p 点离一道 run 的中线有多远（按那一处的宽度归一：0 = 正中，1 = 边上；不沾边返回 9）。
 * jag：这一点的噪声（-0.5–0.5 左右），把边缘揉得参差。纯函数
 */
export function runAt(R, px, py, pz, nx, nz, jag = 0) {
  if (nx * R.nx + nz * R.nz < 0.15) return 9;
  const dy = R.y - py; if (dy < -R.top * 2 || dy > R.len + R.drop * 1.2) return 9;
  const dx = px - R.x, dz = pz - R.z, lat = dx * -R.nz + dz * R.nx; if (lat < R.latLo || lat > R.latHi || dx * R.nx + dz * R.nz < -0.12) return 9;
  const f = Math.min(R.n - 1, Math.max(0, dy / R.step)), i = Math.floor(f), t = f - i, j = Math.min(R.n - 1, i + 1);
  const c = R.off[i] + (R.off[j] - R.off[i]) * t, w = (R.wid[i] + (R.wid[j] - R.wid[i]) * t) * (1 + jag);
  let d = dy > R.len ? 9 : Math.abs(lat - c) / w;
  if (dy < 0) d = Math.sqrt(d * d + (dy / w) * (dy / w)); // 上头是圆的
  const ex = (lat - R.off[R.n - 1]) / R.drop, ey = (dy - R.len + R.drop * 0.3) / R.drop; // 末端一滴
  return Math.min(d, Math.sqrt(ex * ex + ey * ey) * (1 - jag * 0.5));
}

/** 一处伤口在身体上 p 点（法线水平分量 nx、nz）的血：写进 out [血量, 湿, 皮肉翻开]。na、nb：这一点的两份三维噪声（0–1）。纯函数 */
export function woundAt(W, px, py, pz, nx, nz, na, nb, frame, out, nc = 0.5) {
  out[0] = out[1] = out[2] = 0;
  const dy = W.y - py; // 正数 = 在伤口下方
  if (dy < -W.r * 3 || dy > W.len * 1.1 + W.r * 2) return out;
  // nc：沿高度变化的噪声，让往下洇的那一片左右扭着走（不是一根直筒）
  const sway = (nc - 0.5) * 0.22 * smooth(0, 0.16, dy), dx = px - W.x + sway * -W.nz, dz = pz - W.z + sway * W.nx, hd2 = dx * dx + dz * dz, wmax = W.r * 1.8 + Math.max(0, dy) * W.spread * 1.5 + 0.03;
  if (hd2 > wmax * wmax) return out;
  const g = smooth(-0.25, 0.35, nx * W.nx + nz * W.nz); // 只淌在和伤口朝同一边的那一面
  if (g <= 0) return out;
  const hd = Math.sqrt(hd2), rr = W.r * (0.75 + 0.5 * na);
  const ds = Math.sqrt(hd2 + (dy < 0 ? dy * dy * 2.4 : dy * dy * 0.6)) / rr;
  const src = Math.exp(-ds * ds * 1.3);
  let soakV = 0, fresh = 0;
  if (dy > 0) {
    // 往下洇开：越往下越宽、越淡，底边参差（按水平位置的噪声，一条条舌头往下伸）；过了裤腰就少了（血积在裤腰上）
    const lenE = W.len * (0.55 + 0.7 * nb * nb + 0.15 * nb), t = dy / lenE, hw = W.r * 0.9 + dy * W.spread, q = hd / hw; // 底边按水平位置参差（舌头），但不让某一条独自伸得老长——那样远看是一根竖杠
    soakV = Math.exp(-q * q * 1.5) * (1 - smooth(0.1, 1, t)) * 1.2;
    fresh = soakV * (1 - smooth(0.05, 0.55, t + (nb - 0.5) * 0.25)) * 0.8; // 靠伤口的上半截还是湿的新血，往下、往外是干了的
    if (W.y > frame.waist + 0.03) {
      // 裤腰：淌到这里的血往两边洇开积成一圈（上下边都是软的、参差的），再往下裤子上只透过去一部分
      const band = py - frame.waist + (nb - 0.5) * 0.02, reach = 1 - smooth(0.7, 1.15, (W.y - frame.waist) / lenE);
      soakV *= 0.4 + 0.6 * smooth(-0.09, -0.01, band);
      // 只在上面那片真淌到裤腰的水平位置上积（按同一个宽度、同一个参差的底边算到裤腰那一高度）：不然裤腰上会单独冒出两截横杠，整块成了一个倒 T
      if (reach > 0 && band < 0.05 && band > -0.05) { const dw = W.y - frame.waist, qw = hd / ((W.r * 0.9 + dw * W.spread) * 1.15), above = Math.exp(-qw * qw * 1.5) * (1 - smooth(0.1, 1, dw / lenE)); soakV = Math.max(soakV, Math.exp(-(band / 0.02) * (band / 0.02)) * Math.min(1.15, above * 1.6) * reach); }
    }
  }
  const s = Math.max(src, soakV);
  // 边缘用三维噪声揉得很不规则（各伤口的噪声种子不同）：等值线一扭，形状就不是心形水滴了
  out[0] = Math.max(0, s + (na - 0.5) * 0.95 * Math.min(1, s * 2.5)) * g * W.amt;
  out[1] = Math.max(Math.pow(src, 1.4), Math.min(1, fresh)) * W.wet * g;
  if (W.open > 0) {
    // 皮肉翻开：顺着伤口方向拉长的一道豁口（不是圆），边缘参差
    const a = W.ang || 0, ca = Math.cos(a), sa = Math.sin(a), lat = dx * -W.nz + dz * W.nx, al = (lat * ca + dy * sa) / (rr * 0.55), ac = (-lat * sa + dy * ca) / (rr * 0.28);
    out[2] = W.open * (1 - smooth(0.75, 1.15, Math.sqrt(al * al + ac * ac) + (nb - 0.5) * 0.7 + (na - 0.5) * 0.4)) * g;
  }
  return out;
}

/**
 * 一种外观的血在身体网格上的分布（L×L）：pot（血量：0.35 往上就染上了，越大越饱和）、wet（湿：新血）、open（皮肉翻开）、
 * fluid（胖尸渗出来的脓水，和血分开画）。生成器，每几千格 yield 一次。
 */
export function* bloodField(body, plan, frame) {
  const { L, used, pos, nrm } = body, n = L * L;
  const pot = new Float32Array(n), wet = new Float32Array(n), open = new Float32Array(n), fluid = new Float32Array(n);
  const all = plan.wounds, tmp = [0, 0, 0];
  for (let q0 = 0; q0 < n; q0 += 8192) {
    for (let q = q0, q1 = Math.min(n, q0 + 8192); q < q1; q++) {
      if (!used[q]) continue;
      const px = pos[q * 3], py = pos[q * 3 + 1], pz = pos[q * 3 + 2], h = Math.sqrt(nrm[q * 3] * nrm[q * 3] + nrm[q * 3 + 2] * nrm[q * 3 + 2]) || 1, nx = nrm[q * 3] / h, nz = nrm[q * 3 + 2] / h;
      for (let w = 0; w < all.length; w++) {
        const W = all[w], dy = W.y - py;
        if (dy < -W.r * 3 || dy > W.len * 1.1 + W.r * 2) continue;
        const ddx = px - W.x, ddz = pz - W.z, wmax = W.r * 1.8 + Math.max(0, dy) * W.spread * 1.5 + 0.03;
        if (ddx * ddx + ddz * ddz > wmax * wmax || nx * W.nx + nz * W.nz < -0.25) continue;
        // 噪声各伤口各取一份（种子不同），同一模型的几套外观边缘也不一样；噪声不能比网格还细（每格一厘米多），不然等值线成了一格格的台阶
        const na = fbm3(px * 15, py * 15, pz * 15, W.seed & 1023, 2) * 0.6 + vnoise3(px * 36, py * 36, pz * 36, (W.seed + 5) & 1023) * 0.4, nb = vnoise3(px * 20 + 3, 0.5, pz * 20, (W.seed >> 10) & 1023);
        woundAt(W, px, py, pz, nx, nz, na, nb, frame, tmp, vnoise3(0.5, py * 5.5, 0.5, (W.seed >> 4) & 1023)); // 往下一路左右扭（低频：一扭十几厘米，不是一根直筒）
        if (W.fluid) { if (tmp[0] > fluid[q]) fluid[q] = tmp[0]; }
        else { pot[q] = 1 - (1 - pot[q]) * (1 - Math.min(1, tmp[0])) + Math.max(0, tmp[0] - 1); if (tmp[1] > wet[q]) wet[q] = tmp[1]; if (tmp[2] > open[q]) open[q] = tmp[2]; }
      }
    }
    yield;
  }
  return { pot, wet, open, fluid };
}

/**
 * 一片细血点的遮罩（0–1）：两张噪声表各转一个角度取、取交集——单张值噪声取高阈值出来的是一个个顺着格子的方块，
 * 转过角度再互相切掉一部分，点子才是大小不一、形状不规则的。f：密度（越大点越小），ou / ov：错开，th：阈值（越低点越多）。纯函数
 */
export function dropAt(tA, tB, NT, u, v, f, ou, ov, th) {
  const a = tap(tB, NT, (u * 0.8 + v * 0.6) * f + ou, (v * 0.8 - u * 0.6) * f + ov);
  if (a < th) return 0;
  const b = tap(tA, NT, (u * 0.5 - v * 0.87) * f * 1.4 + ov, (v * 0.5 + u * 0.87) * f * 1.4 + ou);
  return smooth(th, th + 0.025, a) * smooth(0.42, 0.52, b);
}

/** 裂口 / 抓痕（逐像素）：写进 out [洞, 上边的毛边, 下边的阴影]；rag：这一点的细噪声（0–1），把边撕毛。纯函数 */
export function slashAt(C, px, py, pz, nx, nz, rag, out) {
  const f = nx * C.nx + nz * C.nz; if (f < 0.5) return out; // 转过去的侧面不画：投到切平面上那一面的横向位置几乎不变，一道口子会被拉成一个方框
  const vy = py - C.y; if (vy > C.reach || vy < -C.reach) return out;
  const dx = px - C.x, dz = pz - C.z, lat = dx * -C.nz + dz * C.nx, depth = dx * C.nx + dz * C.nz;
  if (lat > C.reach || lat < -C.reach || depth < -0.06) return out;
  const a = lat * C.ca + vy * C.sa, b = -lat * C.sa + vy * C.ca;
  for (const cut of C.cuts) {
    const tt = (a - cut.shift) / (cut.len * 0.5); if (tt <= -1 || tt >= 1) continue;
    // 撕开的口子两头不那么尖（布是扯开的，不是刀划的），边按噪声参差；毛边的宽度跟着口子大小
    const off = b - cut.off - a * a * C.curv, wd = cut.w * Math.pow(1 - tt * tt, 0.4) * (0.45 + 1.1 * rag), ad = Math.abs(off);
    const hole = 1 - smooth(wd * 0.7, wd, ad), edge = (1 - smooth(wd, wd + Math.max(0.0035, cut.w * 0.45), ad)) * (1 - hole);
    if (hole > out[0]) out[0] = hole;
    if (off > 0) { if (edge > out[1]) out[1] = edge; } else if (edge > out[2]) out[2] = edge;
  }
  return out;
}

/** 肤色有多像（0–1）：偏红、绿比蓝高、不太暗——金发、棕发、粉衬衫、卡其裤都不算。纯函数 */
export function skinness(r, g, b) {
  const rg = r - g, gb = g - b;
  return smooth(85, 120, r) * smooth(10, 24, rg) * smooth(-0.15, 0.25, (rg - gb) / (rg + 1)) * smooth(-14, -2, gb) * (1 - smooth(85, 120, rg));
}

const inBox = (b, u, v) => u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3];

/**
 * 每个模型的共用图层（尺寸 S×S，各外观的颜色图和共用的法线、粗糙度图都从这里出）。
 * src：原贴图缩到 S 的 RGBA；body：rasterBody；fp：planFace；tables：{ n, a, b } 两张 noiseTable。
 * 生成器：每 PAINT.chunk 格左右 yield 一次，最后 return 图层。
 * 图层（S×S，0–255）：part（PART 编号）、skin（像皮肤的程度）、d1–d3（三档细噪声）、grime（脏：越往脚下越重）、
 * eye（眼窝：往颧骨散开的软阴影）、lips（嘴唇）、shade（脸上凹处的暗：颧骨下、太阳穴、下巴底下；255 = 不压）、
 * vein（血管：太阳穴、下颌、脖子、前臂和手背上分叉的细纹）、mottle（斑驳）、bruise（淤青）、hand（手）；
 * low（L×L，原贴图明暗的低通：布的褶子还在、条纹没了——血里压平条纹、做法线都用它）。
 */
export function* prepareLayers(src, S, body, fp, tables) {
  const n = S * S, { L, used, pos, nrm } = body, k = L / S, every = rowsPer(S);
  const mk = () => new Uint8Array(n);
  const layers = { S, part: mk(), skin: mk(), d1: mk(), d2: mk(), d3: mk(), grime: mk(), streak: mk(), eye: mk(), lips: mk(), shade: mk().fill(255), vein: mk(), mottle: mk(), bruise: mk(), hand: mk(), low: new Float32Array(L * L), face: fp, frame: fp.frame, skinLum: 160 };
  // 低频三维噪声先在小网格上算好（每格一次），画的时候双线性取。lowC：竖着拉长的一条条（上下几十厘米、左右两三厘米）——
  // 手上的脏往胳膊上蹭的道子、裤腿上的泥道子、扑袭者胳膊上的油泥，都按它走；按三维位置取，UV 接缝两边对得上
  const lowA = new Float32Array(L * L), lowB = new Float32Array(L * L), lowC = new Float32Array(L * L);
  for (let q = 0; q < L * L; q++) {
    if (!used[q]) continue;
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    lowA[q] = fbm3(x * 9, y * 9, z * 9, 11, 3); lowB[q] = fbm3(x * 4.2 + 7, y * 4.2, z * 4.2, 29, 3); lowC[q] = fbm3(x * 34, y * 3.4, z * 34, 41, 2);
    if ((q & 1023) === 1023) yield;
  }
  const lowSum = new Float32Array(L * L), lowN = new Float32Array(L * L);
  const { eyes, mouth, temples, cheeks, frame } = fp, T = frame.top, cx = frame.cx, fx0 = fp.x;
  const NT = tables.n, tA = tables.a, tB = tables.b, ts = NT / S; // 贴图空间的细噪声：S 越大，噪声表铺得越密，几档贴图上的细节一样大
  const IE = PAINT.islands.eye, IM = PAINT.islands.mouth;
  let skinSum = 0, skinN = 0;
  // 逐行的活放进普通函数（生成器里的浮点临时变量 V8 优化得不好，会大量装箱、频繁垃圾回收，一段拖到几十毫秒）
  const rows = (j0, step) => {
  let sum = 0, cnt = 0;
  for (let j = j0; j < S; j += step) {
    const fy = (j + 0.5) * k - 0.5, yy = Math.floor(fy), y0 = Math.max(0, Math.min(L - 1, yy)), y1 = Math.min(L - 1, Math.max(0, yy + 1)), ty = fy - yy;
    const qy = Math.min(L - 1, Math.floor((j + 0.5) * k));
    for (let i = 0; i < S; i++) {
      const o = j * S + i, si = o * 4;
      const fx = (i + 0.5) * k - 0.5, xx = Math.floor(fx), x0 = Math.max(0, Math.min(L - 1, xx)), x1 = Math.min(L - 1, Math.max(0, xx + 1)), tx = fx - xx;
      const q00 = y0 * L + x0, q10 = y0 * L + x1, q01 = y1 * L + x0, q11 = y1 * L + x1;
      const w00 = used[q00] ? (1 - tx) * (1 - ty) : 0, w10 = used[q10] ? tx * (1 - ty) : 0, w01 = used[q01] ? (1 - tx) * ty : 0, w11 = used[q11] ? tx * ty : 0, ws = w00 + w10 + w01 + w11;
      if (ws < 1e-4) continue; // 没用到的格子：part 0，什么都不画
      const iw = 1 / ws;
      const px = (pos[q00 * 3] * w00 + pos[q10 * 3] * w10 + pos[q01 * 3] * w01 + pos[q11 * 3] * w11) * iw;
      const py = (pos[q00 * 3 + 1] * w00 + pos[q10 * 3 + 1] * w10 + pos[q01 * 3 + 1] * w01 + pos[q11 * 3 + 1] * w11) * iw;
      const pz = (pos[q00 * 3 + 2] * w00 + pos[q10 * 3 + 2] * w10 + pos[q01 * 3 + 2] * w01 + pos[q11 * 3 + 2] * w11) * iw;
      const ny = (nrm[q00 * 3 + 1] * w00 + nrm[q10 * 3 + 1] * w10 + nrm[q01 * 3 + 1] * w01 + nrm[q11 * 3 + 1] * w11) * iw;
      const nz = (nrm[q00 * 3 + 2] * w00 + nrm[q10 * 3 + 2] * w10 + nrm[q01 * 3 + 2] * w01 + nrm[q11 * 3 + 2] * w11) * iw;
      const a = (lowA[q00] * w00 + lowA[q10] * w10 + lowA[q01] * w01 + lowA[q11] * w11) * iw;
      const b = (lowB[q00] * w00 + lowB[q10] * w10 + lowB[q01] * w01 + lowB[q11] * w11) * iw;
      const sc = (lowC[q00] * w00 + lowC[q10] * w10 + lowC[q01] * w01 + lowC[q11] * w11) * iw;
      layers.streak[o] = clamp01(sc * 1.5 - 0.25) * 255;
      const u = i * ts, v = j * ts, h1 = tap(tA, NT, u * 2, v * 2), h2 = tap(tB, NT, u * 4, v * 4);
      const r = src[si], g = src[si + 1], bl = src[si + 2], al = src[si + 3], l0 = lum(r, g, bl);
      layers.d1[o] = tap(tA, NT, u * 3 + 7, v * 3 + 3) * 255; layers.d2[o] = tap(tB, NT, u * 11, v * 11) * 255; layers.d3[o] = tap(tA, NT, u * 24 + 5, v * 24 + 9) * 255;
      // 低通（按格子平均原贴图的亮度，后面再糊一下）
      const qc = qy * L + Math.min(L - 1, Math.floor((i + 0.5) * k));
      if (al > 200) { lowSum[qc] += l0; lowN[qc]++; }
      // 哪一块：眼球、口腔（原贴图里固定的两小块）、头发（贴图带透明的那片）、皮肤（看颜色）、鞋（脚下又不是皮肤）、其余是衣服
      const U = (i + 0.5) / S, V = (j + 0.5) / S;
      // 肤色要和周围一起看（条纹布的边上偶尔有几颗像素颜色像皮肤，单看会被当成皮肤画成一颗颗白点）
      let sk = al < 250 ? 0 : skinness(r, g, bl);
      if (sk > 0) { const d = 2 * 4, sa = Math.max(0, si - S * d), sb = Math.min(n * 4 - 4, si + S * d), sl = Math.max(0, si - d), sr = Math.min(n * 4 - 4, si + d); sk = Math.min(sk, skinness((r + src[sa] + src[sb] + src[sl] + src[sr]) / 5, (g + src[sa + 1] + src[sb + 1] + src[sl + 1] + src[sr + 1]) / 5, (bl + src[sa + 2] + src[sb + 2] + src[sl + 2] + src[sr + 2]) / 5)); }
      const head = py > T - 0.27 && Math.abs(px - cx) < 0.13;
      let part = PART.cloth;
      if (inBox(IE, U, V) && head) part = PART.eye;
      else if (inBox(IM, U, V) && head && pz < mouth.z - 0.006 && Math.abs(py - mouth.y) < 0.04) part = PART.mouth;
      else if (al < 250) part = PART.hair;
      else if (sk > 0.5) part = PART.skin;
      else if (head) part = PART.hair; // 头上不像皮肤的：头发、眉毛
      else if (py < 0.13) part = PART.shoe;
      if (part === PART.skin) { sum += l0; cnt++; }
      layers.part[o] = part; layers.skin[o] = sk * 255;
      // 污垢：膝盖往下一路加重（到脚踝最重），再叠低频的大块和细碎的斑；上身只有零星一点
      // 分界按竖道子的噪声上下错开（土是一道道往上溅、往上蹭的，不是齐齐一条横线）
      const knee = frame.knee, py2 = py - (sc - 0.5) * 0.12, below = 1 - smooth(0.02, knee + 0.22, py2);
      layers.grime[o] = clamp01(below * 0.95 + (1 - smooth(knee, T * 0.62, py2)) * 0.18 + (b - 0.45) * 0.55 * (0.4 + below) + (h2 - 0.5) * 0.28 + (h1 - 0.5) * 0.12) * 255;
      if (part !== PART.skin) continue;
      // —— 以下只有皮肤 ——
      if (head) {
        // 眼窝：以眼球为中心、横向宽一点的软阴影，往颧骨、眉骨慢慢散开（不是一圈黑）
        let e = 0;
        for (let s = 0; s < 2; s++) { const E = eyes[s], ex = (px - E.x) / 1.25, dy = py - E.y + 0.002, ey = dy > 0 ? dy * 1.5 : dy * 0.8, ez = (pz - E.z) * 0.8; e = Math.max(e, 1 - smooth(0.006, 0.036, Math.sqrt(ex * ex + ey * ey + ez * ez))); } // 往上收在眉骨下，往下慢慢散进颧骨
        layers.eye[o] = e * e * (3 - 2 * e) * 255;
        // 嘴唇：嘴中心一个扁椭圆（只在朝前的面上），边缘软
        const lx = (px - mouth.x) / 0.025, ly = (py - mouth.y + 0.001) / 0.0105;
        layers.lips[o] = nz > 0.15 && pz > mouth.z - 0.03 ? (1 - smooth(0.65, 1.1, Math.sqrt(lx * lx + ly * ly))) * 255 : 0;
        // 塌下去的地方：颧骨下、太阳穴，下巴和下颌底下（法线朝下）
        let hol = 0;
        for (let s = 0; s < 2; s++) {
          const C = cheeks[s], c1 = len3((px - C.x) * 0.9, (py - C.y) * 1.25, pz - C.z); hol = Math.max(hol, (1 - smooth(0.004, 0.032, c1)) * 0.32);
          const Tm = temples[s], c2 = len3(px - Tm.x, (py - Tm.y) * 0.9, pz - Tm.z); hol = Math.max(hol, (1 - smooth(0.004, 0.036, c2)) * 0.28);
        }
        hol = Math.max(hol, smooth(-0.2, -0.75, ny) * 0.45 * (py < mouth.y ? 1 : 0.3));
        layers.shade[o] = (1 - hol) * 255;
      } else {
        layers.shade[o] = 255 - smooth(-0.3, -0.85, ny) * 70; // 脖子底下、手臂下面暗一点
      }
      // 血管：贴图细噪声做「扭过的脊线」——一条条细、带分叉，只在太阳穴、下颌和脖子侧面、前臂和手背上，浓淡不一
      const face = U > 0.5 && V < 0.45, f = face ? 1.6 : 2.6;
      const wu = u * f + (tap(tB, NT, u * 0.9 + 40, v * 0.9) - 0.5) * 9, wv = v * f + (tap(tA, NT, u * 0.9, v * 0.9 + 60) - 0.5) * 9;
      const r1 = 1 - Math.abs(tap(tA, NT, wu, wv) * 2 - 1), r2 = 1 - Math.abs(tap(tB, NT, wu * 2.3 + 17, wv * 2.3 + 5) * 2 - 1);
      // 第二轮评审：血管太淡——主干粗一点、对比高一点，分叉的细支也留着
      const line = Math.max(smooth(0.9, 0.975, r1), smooth(0.93, 0.985, r2) * 0.75);
      const arm = Math.abs(px - cx) > 0.165 && py < T * 0.62;
      let region = 0;
      if (head || py > T * 0.76) {
        for (let s = 0; s < 2; s++) { const Tm = temples[s]; region = Math.max(region, 1 - smooth(0.025, 0.05, len3(px - Tm.x, py - Tm.y, pz - Tm.z))); }
        if (py < mouth.y + 0.01 && py > fp.chinY - 0.13) region = Math.max(region, smooth(0.024, 0.05, Math.abs(px - fx0)) * (py < fp.chinY + 0.01 ? 1 : 0.8), py < fp.chinY - 0.01 ? 0.85 : 0);
        if (py > T * 0.76 && py < fp.chinY - 0.02) region = Math.max(region, 0.55);
      }
      // 前臂内侧（朝着身体那面）血管最显
      // 胳膊在贴图上摊得稀（一格比脸上大两三倍）：同样的脊线到胳膊上粗成一片片的墨迹，所以只留主干、收细
      let ln = line;
      if (arm && py > T * 0.36) { const inner = (cx - px) * (nrm[q00 * 3] * w00 + nrm[q10 * 3] * w10 + nrm[q01 * 3] * w01 + nrm[q11 * 3] * w11) * iw > 0 ? 0.8 : 0.45; region = Math.max(region, inner); if (!head) ln = smooth(0.955, 0.99, r1); }
      // 只留一段段的（脊线噪声本来连成一张网，像大理石纹；按另一份噪声只露出零星几截，才像皮下的血管）
      layers.vein[o] = ln * region * smooth(0.45, 0.62, b + (h2 - 0.5) * 0.6) * 255;
      // 斑驳：三档低频（十几厘米、几厘米、一两厘米）叠起来，灰绿 ↔ 灰紫之间过渡
      layers.mottle[o] = clamp01(0.5 + (a - 0.5) * 1.7 + (b - 0.5) * 1.1 + (h1 - 0.5) * 0.4) * 255;
      // 淤青：下颌两侧、太阳穴、指节上一块块紫青（按位置），再加零星几块随噪声的
      let bz = smooth(0.66, 0.82, b + (h2 - 0.5) * 0.18) * 0.7;
      if (head) for (let s = 0; s < 2; s++) {
        const Tm = temples[s]; bz = Math.max(bz, (1 - smooth(0.01, 0.03, len3(px - Tm.x, (py - Tm.y) * 1.2, pz - Tm.z) + (h2 - 0.5) * 0.02)) * 0.8);
        const jx = fx0 + (s ? 1 : -1) * 0.048, jd = len3((px - jx) * 0.8, (py - fp.chinY - 0.012) * 1.1, Math.max(0, pz - mouth.z + 0.02)); bz = Math.max(bz, (1 - smooth(0.008, 0.03, jd + (h1 - 0.5) * 0.02)) * 0.85);
      }
      if (arm && py < T * 0.46 && py > T * 0.36) bz = Math.max(bz, smooth(0.72, 0.86, h2 + a * 0.2) * 0.8); // 指节、手背零星几块
      layers.bruise[o] = bz * 255;
      // 手：前臂往下（软的边，按竖道子的噪声上下错开、拉出往上蹭的道子，十几二十厘米慢慢淡掉，不是一只手套的齐边）
      layers.hand[o] = smooth(0.145, 0.175, Math.abs(px - cx)) * (1 - smooth(T * 0.47, T * 0.58, py - (sc - 0.5) * 0.14)) * 255;
    }
  }
  skinSum += sum; skinN += cnt;
  };
  // 行是隔着取的（第 c 段画第 c、c+段数、c+2×段数……行）：第一段就把脸、手、衣服各种情况都走一遍，
  // V8 优化时类型信息齐全，后面不会一碰到新分支就退回解释执行（那样一段会慢上几十倍）
  const chunks = Math.ceil(S / every);
  for (let c = 0; c < chunks; c++) { rows(c, chunks); yield; }
  if (skinN) layers.skinLum = skinSum / skinN;
  // 低通：格子平均以后再按格子糊两遍（只在用到的格子之间糊，不混进岛外的黑）
  const low = layers.low; for (let q = 0; q < L * L; q++) low[q] = lowN[q] ? lowSum[q] / lowN[q] / 255 : -1;
  for (let pass = 0; pass < 4; pass++) { // 糊四遍：条纹（一厘米上下一道）基本糊没了，褶子（几厘米）还在
    const prev = low.slice();
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= L || yy >= L) continue; const v = prev[yy * L + xx]; if (v >= 0) { s += v; c++; } }
      if (prev[y * L + x] >= 0 || c >= 3) low[y * L + x] = c ? s / c : -1;
    }
    yield;
  }
  for (let q = 0; q < L * L; q++) if (low[q] < 0) low[q] = 0.5;
  return layers;
}

/**
 * 透明通道怎么编码（zombie-skin.js 的着色器按这个读）：头发半透明的那些像素是 原透明度 × 0.5（< 0.5，0.225 以下扔掉，
 * 和原来 alphaTest 0.45 一样）；不透明的像素是 0.5 + 0.5 × 湿（0 = 不改，越湿越亮：干血痂 ~0.1、油泥 ~0.6、刚淌的血 ~1）。纯函数
 */
export function encodeWet(alpha, wet) { return alpha < 250 ? alpha * 0.5 : 128 + Math.round(clamp01(wet) * 127); }

// 网格上双线性取值（画颜色图时逐像素用；写成普通函数，不在热循环里建闭包）
function bil(arr, q00, q10, q01, q11, w00, w10, w01, w11) { return arr[q00] * w00 + arr[q10] * w10 + arr[q01] * w01 + arr[q11] * w11; }
function bil3(arr, d, q00, q10, q01, q11, w00, w10, w01, w11) { return arr[q00 * 3 + d] * w00 + arr[q10 * 3 + d] * w10 + arr[q01 * 3 + d] * w01 + arr[q11 * 3 + d] * w11; }

// 血染布是「乘」上去的（底下的褶子还透得出来）：外沿干了发褐发灰（哑光），往里暗红、源头和上半截是新血（深红、湿亮），
// 干透的边上一圈更深的水线（毛细管把血带到边上才干）
const DRY = [0.56, 0.4, 0.31], CORE = [0.3, 0.075, 0.065], FRESH = [0.36, 0.035, 0.03];
// 皮肤上的血不乘（皮肤浅，乘上去发橙发艳；乘深了又是一撮黑胡子）：直接往血的颜色里混，再按原来的明暗压一压
const SKIN_DRY = [64, 31, 25], SKIN_CORE = [42, 11, 10], SKIN_FRESH = [78, 12, 11];

/**
 * 画一张外观的颜色图。src：原贴图（S×S RGBA）；layers：prepareLayers；look：LOOKS 里的一套；tone：衣服的色调
 * （zombie-skin.js 的 [R, G, B, 保留原色]）；plan：planLook；field：bloodField；body：rasterBody；tables：噪声表；out：S×S RGBA（写进去）。
 * 生成器，按行 yield。透明通道见 encodeWet。
 */
export function* paintColour(src, layers, look, tone, plan, field, body, tables, out) {
  const S = layers.S, { L, pos, nrm } = body, k = L / S, every = rowsPer(S), NT = tables.n, tA = tables.a, tB = tables.b, ts = NT / S;
  const [tr, tg, tb, keep] = tone, G = PAINT.grime, G0 = G[0] / 96, G1 = G[1] / 96, G2 = G[2] / 96, U0 = PAINT.dust[0], U1 = PAINT.dust[1], U2 = PAINT.dust[2], M0 = PAINT.mud[0], M1 = PAINT.mud[1], M2 = PAINT.mud[2];
  const bm = look.bloodMul || null, dryC = bm ? [Math.min(0.62, bm[0] * 1.5), bm[1] * 1.9, bm[2] * 1.9] : DRY, coreC = bm || CORE, freshC = bm ? [bm[0] * 1.05, bm[1] * 0.7, bm[2] * 0.7] : FRESH;
  const sDry = bm ? [dryC[0] * 150, dryC[1] * 150, dryC[2] * 150] : SKIN_DRY, sCore = bm ? [coreC[0] * 150, coreC[1] * 150, coreC[2] * 150] : SKIN_CORE, sFresh = bm ? [freshC[0] * 200, freshC[1] * 200, freshC[2] * 200] : SKIN_FRESH;
  const fluid = look.fluid || null, soot = look.soot || 0, ash = look.ash || 0, filth = look.filth || 0, spread = look.blood || 1, ooze = look.ooze || null;
  const A = look.skinA, B = look.skinB, skinRef = layers.skinLum, SC = look.sock, LC = look.lips, VC = look.veinCol, frame = layers.frame, T = frame.top, fcx = frame.cx;
  // 逐像素要用的外观参数先取成局部变量（几套外观的对象形状不同，在热循环里取属性会变成多态访问，慢好几倍）
  const kContrast = look.contrast, kChroma = look.chroma, kBruise = look.bruise, kVeins = look.veins, kGrime = look.grime, shins = plan.shins, shinU = plan.shinU, hairK0 = look.hair ?? 1;
  const { d1, d2, d3, part, skin: skinL, grime: gr, streak: stk, eye, lips, shade, vein, mottle, bruise, hand, low } = layers;
  const { pot: fPot, wet: fWet, open: fOpen, fluid: fFluid } = field;
  const runs = fluid ? plan.runs : plan.runs.concat(plan.mouthRuns), acid = plan.acid, sm = plan.mouth, claws = plan.claws, rips = plan.rips, sprays = plan.sprays, spots = plan.spots, spotKind = plan.spotKind, splits = plan.splits || [];
  const sl = [0, 0, 0], sc = [0, 0, 0], kp = keep;
  const rows = (j0, step, i0, i1) => { // 同 prepareLayers：逐行的活放进普通函数，行隔着取
  for (let j = j0; j < S; j += step) {
    const fy = (j + 0.5) * k - 0.5, yy = Math.floor(fy), y0 = Math.max(0, Math.min(L - 1, yy)), y1 = Math.min(L - 1, Math.max(0, yy + 1)), ty = fy - yy;
    for (let i = i0; i < i1; i++) {
      const o = j * S + i, si = o * 4, p = part[o];
      let r = src[si], g = src[si + 1], b = src[si + 2]; const al = src[si + 3];
      if (p === PART.none || (j >= S / 2 && al === 255 && r > 235 && g > 235 && b > 235)) {
        // 没用到的地方：压成暗色；下半张（头发那一片）连透明度一起清掉，免得远处取到低级 mipmap 时头发边上泛白
        out[si] = r * 0.15; out[si + 1] = g * 0.15; out[si + 2] = b * 0.15; out[si + 3] = j >= S / 2 ? 0 : encodeWet(al, 0);
        continue;
      }
      const fx = (i + 0.5) * k - 0.5, xx = Math.floor(fx), x0 = Math.max(0, Math.min(L - 1, xx)), x1 = Math.min(L - 1, Math.max(0, xx + 1)), tx = fx - xx;
      const q00 = y0 * L + x0, q10 = y0 * L + x1, q01 = y1 * L + x0, q11 = y1 * L + x1;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      // 身体上的三维位置和朝向（头发用不上：头发上不画淌痕、破口这些逐像素的细节，省掉这几次取值）
      let px = 0, py = 2, pz = 0, nx = 0, ny = 0, nz = 1;
      if (p !== PART.hair) {
        px = bil3(pos, 0, q00, q10, q01, q11, w00, w10, w01, w11); py = bil3(pos, 1, q00, q10, q01, q11, w00, w10, w01, w11); pz = bil3(pos, 2, q00, q10, q01, q11, w00, w10, w01, w11);
        nx = bil3(nrm, 0, q00, q10, q01, q11, w00, w10, w01, w11); nz = bil3(nrm, 2, q00, q10, q01, q11, w00, w10, w01, w11); ny = bil3(nrm, 1, q00, q10, q01, q11, w00, w10, w01, w11);
        const nh = Math.sqrt(nx * nx + nz * nz) || 1; nx /= nh; nz /= nh;
      }
      const n1 = d1[o] / 255, n2 = d2[o] / 255, n3 = d3[o] / 255, u = i * ts, v = j * ts, st = stk[o] / 255;
      const l0 = lum(r, g, b), lowL = bil(low, q00, q10, q01, q11, w00, w10, w01, w11) * 255, grime = gr[o] / 255;
      const isSkin = p === PART.skin || (skinL[o] > 90 && p !== PART.hair && p < PART.eye), hair = p === PART.hair, shoe = p === PART.shoe;
      const jag = (n1 - 0.5) * 0.5 + (n3 - 0.5) * 0.25; // 淌痕、酸液边上的参差
      let wetA = 0, bleed = 0, lr = r, lg = g, lb = b; // lr/lg/lb：同一处去掉条纹以后的颜色（血洇透了的地方用）
      let acidD = 9; if (acid.length && !hair) for (let c = 0; c < acid.length; c++) { const d = runAt(acid[c], px, py, pz, nx, nz, jag); if (d < acidD) acidD = d; }
      if (p === PART.eye) { // 眼球：混浊发灰，缩在眼窝的暗里（发光的那一点在 zombie-skin.js）
        const m = l0 * 0.32; r = m * SC[0] * 1.6; g = m * SC[1] * 1.6; b = m * SC[2] * 1.6; wetA = 0.7;
      } else if (p === PART.mouth) { // 口腔：暗红褐，湿
        r = 30 + l0 * 0.22; g = 10 + l0 * 0.06; b = 10 + l0 * 0.06; if (fluid) { g += 8; r += 4; } wetA = 0.8;
      } else if (isSkin) {
        // 皮肤：原贴图的明暗留着（五官的起伏），颜色换成灰绿 ↔ 灰紫的斑驳；原肤色几乎不留（第二轮女脸颊上还是暖的奶油色，像活人）
        const m = mottle[o] / 255, vv = Math.min(1.18, Math.max(0.35, 1 + (l0 / skinRef - 1) * kContrast)); // 脸比四肢亮得多，顶住，免得成一张白面具
        const sh = vv * (1.13 - 0.3 * m) * (0.93 + 0.14 * n1) * (shade[o] / 255); // 斑驳也带明暗：发紫的那几块更暗
        const wr = Math.min(0, (r - l0) * kChroma - 4), wg = (g - l0) * kChroma, wb = (b - l0) * kChroma + 3; // 原肤色只留一点、红的那份往回收（脸颊不再泛暖）
        r = (mix(A[0], B[0], m) + wr) * sh; g = (mix(A[1], B[1], m) + wg) * sh; b = (mix(A[2], B[2], m) + wb) * sh;
        const bz = (bruise[o] / 255) * kBruise; // 淤青：紫青
        if (bz > 0) { r = mix(r, r * 0.64 + 4, bz); g = mix(g, g * 0.54, bz); b = mix(b, b * 0.72 + 8, bz); }
        const vn = Math.min(1, (vein[o] / 255) * kVeins); // 血管：青紫的纹，乘上去
        if (vn > 0) { r = mix(r, r * VC[0], vn); g = mix(g, g * VC[1], vn); b = mix(b, b * VC[2], vn); }
        if (spotKind === 'pustule') { // 胖尸的脓疱：一粒粒发黄的小鼓包，边上发红
          const pz2 = smooth(0.45, 0.7, m), core = smooth(0.79, 0.82, n3) * pz2, rim = (smooth(0.73, 0.79, n3) - smooth(0.79, 0.82, n3)) * pz2; // 一簇簇长在发紫的斑上（满脸撒的一层黄点像麻子）
          r = mix(r, 186, core); g = mix(g, 170, core); b = mix(b, 84, core); r = mix(r, 120, rim * 0.5); g *= 1 - rim * 0.3; b *= 1 - rim * 0.25; wetA = Math.max(wetA, core * 0.6);
        }
        const e = eye[o] / 255; // 眼窝：往里压到快黑，外圈一点发红的眼睑
        if (e > 0) {
          const e1 = e * 0.6, e2 = smooth(0.5, 1, e) * 0.78, rim = smooth(0.2, 0.45, e) * (1 - smooth(0.55, 0.85, e));
          r *= mix(1, SC[0], e1) * (1 - e2); g *= mix(1, SC[1], e1) * (1 - e2); b *= mix(1, SC[2], e1) * (1 - e2);
          r = mix(r, r * 1.15 + 6, rim * 0.4); g *= 1 - rim * 0.1; b *= 1 - rim * 0.06;
        }
        const lp = lips[o] / 255; // 嘴唇：发黑发紫、去了血色，竖着的干裂纹（一道暗一道起皮的浅）
        if (lp > 0) {
          const ck = tap(tA, NT, u * 9 + 13, v * 1.6), crack = 1 - Math.abs(ck * 2 - 1), dark = smooth(0.84, 0.94, crack), flake = smooth(0.62, 0.76, n3) * (1 - dark) * 0.35;
          const lv = Math.min(1.15, Math.max(0.55, l0 / skinRef));
          r = mix(r, LC[0] * lv * (1 - dark * 0.6) + flake * 36, lp * 0.95); g = mix(g, LC[1] * lv * (1 - dark * 0.6) + flake * 34, lp * 0.95); b = mix(b, LC[2] * lv * (1 - dark * 0.6) + flake * 36, lp * 0.95);
        }
        const hd = hand[o] / 255; // 手和前臂：一层黑泥（往上一道道蹭淡），指头、手背上是干血
        if (hd > 0) {
          const dirt = hd * smooth(0.25, 0.7, n1 * 0.5 + st * 0.4 + (T * 0.47 - py) * 2.2) * 0.75;
          r = mix(r, r * 0.48, dirt); g = mix(g, g * 0.43, dirt); b = mix(b, b * 0.38, dirt);
          const bl = hd * smooth(0.4, 0.58, n2 * 0.45 + st * 0.3 + (T * 0.5 - py) * 2.6) * 0.92, fr = smooth(0.62, 0.8, n1 + (T * 0.44 - py) * 2);
          r = mix(r, mix(SKIN_DRY[0], SKIN_FRESH[0], fr), bl); g = mix(g, mix(SKIN_DRY[1], SKIN_FRESH[1], fr), bl); b = mix(b, mix(SKIN_DRY[2], SKIN_FRESH[2], fr), bl); wetA = Math.max(wetA, bl * fr * 0.7);
          if (soot) { const gs = hd * smooth(0.35, 0.6, st + (n1 - 0.5) * 0.3 + hd * 0.3); r = mix(r, 14, gs * 0.85); g = mix(g, 12, gs * 0.85); b = mix(b, 11, gs * 0.85); wetA = Math.max(wetA, gs * 0.75); } // 扑袭者：手上到前臂一道道发亮的黑油泥
        }
        // 皮肤也跟着脏（脚踝、小腿：一层灰土、往上溅的泥点），扑袭者一身黑灰
        const gk = Math.min(1, grime * kGrime * 0.9 + soot * 0.3); r = mix(r, r * G[0] / 110, gk); g = mix(g, g * G[1] / 110, gk); b = mix(b, b * G[2] / 110, gk);
        const ds = (1 - smooth(0.1, 0.42, py + (st - 0.5) * 0.12)) * smooth(0.35, 0.65, n1 * 0.6 + st * 0.5) * 0.45 * (1 - soot);
        r = mix(r, 118, ds); g = mix(g, 108, ds); b = mix(b, 92, ds);
        lr = r; lg = g; lb = b;
      } else {
        // 衣服、头发、鞋：去色上色调；lr/lg/lb 是同一处把明暗换成低通以后的（条纹压平、褶子还在）
        if (hair) {
          // 头发：亮度压进一条窄带（原图头发那一条条的梳齿亮暗看不出来），发暗、去色、油腻打绺；几绺结着干血
          const Lh = mix(l0, 58 + l0 * 0.15, 0.78) * hairK0, kh = kp * 0.35;
          r = Math.min(255, (Lh + (src[si] - l0) * kh) * (0.3 + tr * 0.4)); g = Math.min(255, (Lh + (src[si + 1] - l0) * kh) * (0.3 + tg * 0.4)); b = Math.min(255, (Lh + (src[si + 2] - l0) * kh) * (0.3 + tb * 0.4));
          const clump = smooth(0.62, 0.74, n1 * 0.65 + n2 * 0.35) * (soot ? 0.3 : 0.8);
          r = mix(r, 46 + n3 * 14, clump * 0.7); g = mix(g, 14 + n3 * 4, clump * 0.7); b = mix(b, 12 + n3 * 4, clump * 0.7); wetA = Math.max(wetA, clump * 0.45);
          if (soot) { r *= 0.55; g *= 0.55; b *= 0.55; }
          lr = r; lg = g; lb = b;
        } else {
          const L0 = l0, Lw = lowL;
          r = Math.min(255, (L0 + (src[si] - l0) * kp) * tr); g = Math.min(255, (L0 + (src[si + 1] - l0) * kp) * tg); b = Math.min(255, (L0 + (src[si + 2] - l0) * kp) * tb);
          lr = Math.min(255, (Lw + (src[si] - l0) * kp * 0.6) * tr); lg = Math.min(255, (Lw + (src[si + 1] - l0) * kp * 0.6) * tg); lb = Math.min(255, (Lw + (src[si + 2] - l0) * kp * 0.6) * tb);
          // 脏：底下发褐发黑，往上是一块块的；脚下 40 厘米蒙一层灰土（一道道往上溅），裤脚和鞋上一圈泥，鞋头最黑
          const gk = Math.min(1, grime * kGrime * (shoe ? 1.25 : 1) + soot * 0.45), dm = gk * 0.8;
          const dust = smooth(0.3, 0.62, gk * 0.6 + n1 * 0.4 + st * 0.2) * (1 - smooth(0.12, 0.44, py + (st - 0.5) * 0.12)) * (1 - soot) * (shoe ? 0.5 : 1);
          const mud = (1 - smooth(0.035, 0.1 + n1 * 0.06 + st * 0.04, py)) * (shoe ? 0.85 : 0.65) + (1 - smooth(0.0, 0.025, py)) * 0.2 + (shoe && nz > 0.35 ? smooth(0.35, 0.8, nz) * 0.45 : 0);
          const mu = Math.min(1, mud), d42 = dust * 0.62;
          // 先乘一层褐黑，再蒙一层灰土，最后裤脚和鞋上一圈泥（r/g/b 和去条纹的 lr/lg/lb 一样处理）
          const kr = (1 - dm + dm * G0) * (1 - d42), kg = (1 - dm + dm * G1) * (1 - d42), kb = (1 - dm + dm * G2) * (1 - d42), ar = U0 * d42, ag = U1 * d42, ab = U2 * d42, mr = 1 - mu + mu * M0, mg = 1 - mu + mu * M1, mb = 1 - mu + mu * M2;
          r = (r * kr + ar) * mr; g = (g * kg + ag) * mg; b = (b * kb + ab) * mb; lr = (lr * kr + ar) * mr; lg = (lg * kg + ag) * mg; lb = (lb * kb + ab) * mb;
          // 小腿、裤腿下半截溅上去的干泥点（褐色，一两厘米）
          if (py < 0.48 && !soot) { const sp = dropAt(tA, tB, NT, u, v, 3.6, 77, 13, 0.775 - 0.05 * (1 - smooth(0.1, 0.48, py))) * 0.75; if (sp > 0) { r = mix(r, r * 0.55 + 20, sp); g = mix(g, g * 0.5 + 14, sp); b = mix(b, b * 0.42 + 8, sp); lr = r; lg = g; lb = b; } }
          if (soot) { // 扑袭者：一身黑（手电下整个轮廓是黑的，只剩红眼和油泥的亮）；肩膀上一点浅灰的灰烬
            const sm2 = Math.min(0.92, soot * (0.75 + n1 * 0.25 + (st - 0.5) * 0.2)); r *= 1 - sm2; g *= 1 - sm2; b *= 1 - sm2 * 0.96; lr *= 1 - sm2; lg *= 1 - sm2; lb *= 1 - sm2 * 0.96;
            // 灰烬只在朝上的肩膀、袖子上（边是软的、按噪声碎开——第二轮这里按身体网格硬切，成了一级级台阶）
            const top = smooth(0.15, 0.6, ny) + smooth(0.13, 0.17, Math.abs(px - fcx)) * smooth(T * 0.58, T * 0.68, py) * 0.6;
            const as = ash * smooth(0.5, 0.78, Math.min(1, top) * 0.6 + n1 * 0.5 + (n2 - 0.5) * 0.3);
            r = mix(r, 96 * (0.75 + 0.5 * n2), as); g = mix(g, 93 * (0.75 + 0.5 * n2), as); b = mix(b, 90 * (0.75 + 0.5 * n2), as); lr = r; lg = g; lb = b;
            wetA = Math.max(wetA, filth * smooth(0.45, 0.75, st + (n1 - 0.5) * 0.25) * (1 - as)); // 油泥：顺着竖道子一道道发亮（不是一块块迷彩）
          }
        }
        if (!hair && !shoe) {
          // 破口和抓痕：撕开的口子——里面是皮（或者黑洞），一圈浅色的毛边（扯断的纱），口子边上沾血
          sl[0] = sl[1] = sl[2] = 0; const rag = n1 * 0.55 + n3 * 0.3 + n2 * 0.15; let ripBlood = 0;
          for (let c = 0; c < rips.length; c++) { const h0 = sl[0], e0 = sl[1] + sl[2]; slashAt(rips[c], px, py, pz, nx, nz, rag, sl); if (sl[0] > h0 || sl[1] + sl[2] > e0) ripBlood = Math.max(ripBlood, rips[c].blood); }
          sc[0] = sc[1] = sc[2] = 0;
          for (let c = 0; c < claws.length; c++) slashAt(claws[c], px, py, pz, nx, nz, rag, sc);
          // 抓痕连皮一起划开了：口子里是暗红的肉，周围的布吸了血（下面按血画，边是软的）；破口只是布撕开，里面是皮
          const clawK = sc[0] > sl[0] ? 1 : 0; bleed = sc[0] * 0.55 + sc[2] * 0.3 + (sl[1] + sl[2]) * ripBlood * 0.3;
          sl[0] = Math.max(sl[0], sc[0]); sl[1] = Math.max(sl[1], sc[1] * 0.6); sl[2] = Math.max(sl[2], sc[2]);
          if (sl[0] + sl[1] + sl[2] > 0) {
            // 毛边：扯断的纱，浅色、一丝丝的（上边翻起来的多，下边少一点、压着一道影子）
            const fib = smooth(0.35, 0.65, tap(tB, NT, u * 30, v * 30)), fr = (sl[1] * 0.95 + sl[2] * 0.45) * (0.3 + 0.7 * fib) * (1 - clawK * 0.5), loE = sl[2] * (1 - fib) * 0.45;
            r = mix(r, Math.min(255, lr * 1.2 + 40), fr); g = mix(g, Math.min(255, lg * 1.18 + 37), fr); b = mix(b, Math.min(255, lb * 1.15 + 32), fr);
            r *= 1 - loE; g *= 1 - loE; b *= 1 - loE;
            // 洞里：贴着边一圈是黑的阴影（布有厚度、底下陷进去），中间透出灰绿的皮（沾着土）；抓痕里是暗红的肉
            const h = sl[0], dark = 1 - smooth(0.55, 0.95, h + (n3 - 0.5) * 0.25), mot = smooth(0.3, 0.7, n2);
            let ir = mix(A[0], B[0], mot) * (0.7 + 0.2 * n1), ig = mix(A[1], B[1], mot) * (0.68 + 0.2 * n1), ib = mix(A[2], B[2], mot) * (0.68 + 0.2 * n1);
            if (clawK) { ir = 66 + 24 * n3; ig = 16 + 6 * n3; ib = 14 + 5 * n3; }
            ir = mix(ir, 20, dark * 0.9); ig = mix(ig, 16, dark * 0.9); ib = mix(ib, 15, dark * 0.9);
            const hk = smooth(0, 0.3, h); r = mix(r, ir, hk); g = mix(g, ig, hk); b = mix(b, ib, hk);
            lr = r; lg = g; lb = b;
          }
        }
      }
      if (acidD < 1.7) { // 喷酸者的酸液：一道道往下淌着烧——正中烧穿（布上是个毛边的洞，里面是起泡的皮）、焦黑的芯、黄褐的焦边、外面一圈褪色
        const d = acidD;
        if (isSkin || p === PART.mouth) {
          // 皮上：起泡、发红发黄的生皮，一颗颗水泡，外圈发红；湿亮
          const raw = 1 - smooth(0.8, 1.25, d), rim = (1 - smooth(1.1, 1.6, d)) * (1 - raw), bub = smooth(0.58, 0.7, n3) * raw;
          r = mix(r, 176 + 20 * n2, raw * 0.85); g = mix(g, 112 + 26 * n2, raw * 0.85); b = mix(b, 86, raw * 0.85);
          r = mix(r, 206, bub * 0.7); g = mix(g, 186, bub * 0.7); b = mix(b, 112, bub * 0.7);
          r = mix(r, r * 1.05 + 14, rim * 0.6); g *= 1 - rim * 0.18; b *= 1 - rim * 0.22;
          wetA = Math.max(wetA, raw * 0.8);
        } else if (!hair && !shoe) {
          const hole = 1 - smooth(0.16, 0.28, d), char = (1 - smooth(0.3, 0.62, d)) * (1 - hole), halo = (1 - smooth(0.62, 1.25, d)) * (1 - hole - char), bleach = (1 - smooth(1.2, 1.7, d)) * (1 - hole - char - halo);
          r = mix(r, r * 0.9 + 26, bleach * 0.55); g = mix(g, g * 0.9 + 22, bleach * 0.55); b = mix(b, b * 0.7, bleach * 0.55);
          r = mix(r, r * 0.66 + 52, halo); g = mix(g, g * 0.56 + 36, halo); b = mix(b, b * 0.2 + 4, halo); // 焦黄的边
          r = mix(r, 27 + n3 * 12, char); g = mix(g, 20 + n3 * 8, char); b = mix(b, 12 + n3 * 4, char); // 焦黑的芯
          const bub = smooth(0.5, 0.75, n3), skc = 0.55 + 0.5 * bub; // 烧穿的洞：深处发黑，透出一点起泡的皮
          r = mix(r, 78 * skc, hole); g = mix(g, 50 * skc, hole); b = mix(b, 30 * skc, hole);
          wetA = Math.max(wetA, hole * 0.75 + char * 0.55);
          lr = r; lg = g; lb = b;
        }
      }
      // —— 血 ——
      const hairK = hair ? 0.65 : 1;
      let pt = bil(fPot, q00, q10, q01, q11, w00, w10, w01, w11) * spread, wt = bil(fWet, q00, q10, q01, q11, w00, w10, w01, w11), op = bil(fOpen, q00, q10, q01, q11, w00, w10, w01, w11), fl = ooze ? bil(fFluid, q00, q10, q01, q11, w00, w10, w01, w11) : 0;
      if (bleed > 0) pt = Math.max(pt, 0.22 + bleed * 0.45);
      let mp = 0, mfr = 0; // mp：皮肤上的血（嘴边糊的、淌下来的）；mfr：其中多新鲜
      if (!hair) {
        // 往下淌的一道道（伤口挂下来的、嘴里淌下来的）：随机游走、粗细不一、末端一滴
        for (let c = 0; c < runs.length; c++) {
          const d = runAt(runs[c], px, py, pz, nx, nz, jag * 0.6); if (d >= 1) continue;
          const sv = 1 - smooth(0.65, 1, d);
          if (isSkin) { if (sv > mp) { mp = sv; mfr = 0.55 + 0.4 * (1 - smooth(0, 0.6, d)); } } else { pt = Math.max(pt, 0.42 + sv * 0.5); wt = Math.max(wt, sv * 0.5); }
        }
        // 嘴边糊开的一片：比嘴唇宽、往下巴拖，边按噪声参差、有的地方抹薄了；唇线上最暗，嘴角最新鲜
        if (sm && isSkin && nz > 0.05 && pz > sm.z - 0.05 && py > sm.y - sm.down * 1.6 && py < sm.y + sm.up * 3) {
          const ex = (px - sm.x) / sm.hw, dyS = py - sm.y, ey = dyS > 0 ? dyS / sm.up : -dyS / sm.down;
          const dist = Math.sqrt(ex * ex + ey * ey) + (tap(tB, NT, u * 2.2 + sm.seed, v * 2.2) - 0.5) * 1.1 + (tap(tA, NT, u * 6 + sm.seed, v * 6) - 0.5) * 0.45 + (n3 - 0.5) * 0.15;
          const sv = (1 - smooth(0.55, 1, dist)) * (0.3 + 0.7 * smooth(0.3, 0.7, tap(tA, NT, u * 4 + sm.seed, v * 1.5))); // 抹开的地方有厚有薄
          const corner = Math.min(Math.hypot(px - sm.x - 0.022, dyS * 1.3), Math.hypot(px - sm.x + 0.022, dyS * 1.3)), cf = 1 - smooth(0.003, 0.014, corner);
          if (sm.fluid) { // 喷酸者：嘴边糊的是黄绿的涎水（亮、发黏）
            const cv = sv * 0.85; r = mix(r, r * fluid[0] * 1.2, cv); g = mix(g, g * fluid[1] * 1.25, cv); b = mix(b, b * fluid[2], cv); wetA = Math.max(wetA, cv * 0.9);
          } else if (sv > mp * 0.8) { mfr = Math.max(sv > mp ? 0.25 : mfr, cf); mp = Math.max(mp, sv); }
          if (!sm.fluid) { const ll = (1 - smooth(0.0, 0.006, Math.abs(dyS + 0.001))) * (1 - smooth(0.5, 1, Math.abs(ex))); r *= 1 - ll * 0.55; g *= 1 - ll * 0.7; b *= 1 - ll * 0.65; } // 唇线上一道发黑的
        }
        for (let c = 0; c < sprays.length; c++) {
          const P = sprays[c], ex = px - P.x, ey = py - P.y, ez = pz - P.z, dd = Math.sqrt(ex * ex + ey * ey + ez * ez); if (dd > P.r * 1.8 || nx * P.nx + nz * P.nz < 0) continue;
          const dens = Math.exp(-(dd / P.r) * (dd / P.r) * 1.5), th = 0.8 - 0.14 * dens; // 噪声表 99% 的值在 0.84 以下
          pt = Math.max(pt, dropAt(tA, tB, NT, u, v, 7.5, P.u, P.v, th) * 0.75); // 喷上去的是细点子（一两毫米到一厘米），不是一块块
        }
        if (shins && py < 0.52 && py > 0.06 && nz > 0.1) {
          const th = 0.79 - 0.06 * shins * (1 - smooth(0.2, 0.52, py));
          pt = Math.max(pt, dropAt(tA, tB, NT, u, v, 4.2, shinU, 11, th) * 0.7);
        }
      }
      if (fl > 0.1 && !hair && !isSkin) { // 胖尸：腋下、肚子渗出来的脓水把衣服洇湿（黄褐、外沿一圈深的水线、发亮）
        // 边按三档噪声碎开、里面有浓有淡（一块平涂的黄斑像打了个补丁），外沿一圈深的水线，几处干成发褐的硬壳
        const am = tap(tA, NT, u * 1.3 + 13, v * 1.3 + 57), en = (tap(tB, NT, u * 5, v * 1.1 + 31) - 0.5) * 0.34 + (am - 0.5) * 0.3 + (n2 - 0.5) * 0.14 + (n3 - 0.5) * 0.08;
        const cov = smooth(0.3, 0.44, fl + en), ring = smooth(0.3, 0.35, fl + en) * (1 - smooth(0.36, 0.46, fl + en)), dens = cov * (0.45 + 0.55 * smooth(0.25, 0.75, am + (n1 - 0.5) * 0.5));
        r = mix(r, lr * ooze[0], dens); g = mix(g, lg * ooze[1], dens); b = mix(b, lb * ooze[2], dens);
        const crust = cov * smooth(0.62, 0.78, n1 * 0.6 + am * 0.4) * 0.6; r = mix(r, r * 0.62, crust); g = mix(g, g * 0.55, crust); b = mix(b, b * 0.5, crust);
        r *= 1 - ring * 0.4; g *= 1 - ring * 0.44; b *= 1 - ring * 0.5; wetA = Math.max(wetA, dens * 0.6 * (1 - crust));
      }
      if (isSkin && pt > 0.3) { mp = Math.max(mp, smooth(0.3, 0.6, pt)); mfr = Math.max(mfr, Math.min(1, wt * 1.2)); pt = 0; } // 皮肤上的伤血按皮肤的画法
      if (mp > 0.02 && isSkin) {
        // 皮肤上的血：往血的颜色里混（干的发褐、新的深红、厚的发黑红），原来的明暗压一点进去（五官的起伏还在）
        const thick = smooth(0.35, 1, mp + (n2 - 0.5) * 0.3), kd = smooth(0.05, 0.4, mp) * 0.94, shd = Math.min(1.15, Math.max(0.55, l0 / skinRef));
        let cr = mix(sDry[0], sCore[0], thick), cg = mix(sDry[1], sCore[1], thick), cb = mix(sDry[2], sCore[2], thick);
        cr = mix(cr, sFresh[0], mfr); cg = mix(cg, sFresh[1], mfr); cb = mix(cb, sFresh[2], mfr);
        r = mix(r, cr * shd, kd); g = mix(g, cg * shd, kd); b = mix(b, cb * shd, kd);
        wetA = Math.max(wetA, kd * (0.15 + 0.7 * mfr * mfr));
      }
      const P0 = pt;
      if (P0 > 0.08) {
        // 边缘：三档噪声叠起来——顺着布纹横向拉长的、几厘米一块的、细碎的——再加条纹深浅（深色的纱吸得多），等值线又碎又顺着布走
        const an = tap(tB, NT, u * 5, v * 1.1 + 31), am = tap(tA, NT, u * 1.3 + 71, v * 1.3 + 19), wick = (l0 - lowL) / 255 * 0.08;
        const en = (an - 0.5) * 0.3 + (am - 0.5) * 0.24 + wick + (n3 - 0.5) * 0.12 + (n2 - 0.5) * 0.1;
        const cov = smooth(0.29, 0.43, P0 + en) * hairK, sat = smooth(0.38, 1.05, P0 + en * 0.6 + (n1 - 0.5) * 0.35), ring = smooth(0.29, 0.34, P0 + en) * (1 - smooth(0.35, 0.47, P0 + en));
        // 浸透的那片外面一圈淡渍：血水顺着纱往外走了一截，浅褐、半透
        const halo = smooth(0.1, 0.3, P0 + en * 1.4) * (1 - cov) * hairK;
        if (halo > 0) { r *= 1 - halo * 0.2; g *= 1 - halo * 0.36; b *= 1 - halo * 0.44; lr *= 1 - halo * 0.2; lg *= 1 - halo * 0.36; lb *= 1 - halo * 0.44; }
        if (cov > 0) {
          // 新血：靠伤口、上半截（wt），按几厘米一块的噪声碎开——不是一整片均匀的亮
          const fr = Math.min(1, wt * 1.25) * smooth(0.25, 0.55, am + 0.25), flat = Math.min(1, cov * 0.45 + sat * 0.75); // 洇透了：条纹压平
          r = mix(r, lr, flat); g = mix(g, lg, flat); b = mix(b, lb, flat);
          let mr = mix(dryC[0], coreC[0], sat), mg = mix(dryC[1], coreC[1], sat), mb = mix(dryC[2], coreC[2], sat);
          mr = mix(mr, freshC[0], fr); mg = mix(mg, freshC[1], fr); mb = mix(mb, freshC[2], fr);
          const rk = 1 - ring * 0.55 * (1 - fr), pool = smooth(1, 1.5, P0) * 0.3; // 干了的外沿一圈深的水线；积在裤腰的更暗
          mr *= rk * (1 - pool); mg *= rk * (1 - pool); mb *= rk * (1 - pool);
          // 浸透的一片里也有厚有薄（几厘米一块的起伏）：不是一块平涂的色
          const kd = Math.min(1, cov * (0.8 + 0.2 * smooth(0.3, 0.7, am + (n1 - 0.5) * 0.4) + 0.2 * sat));
          r = mix(r, r * mr + 4, kd); g = mix(g, g * mg + 0.8, kd); b = mix(b, b * mb + 0.8, kd);
          wetA = Math.max(wetA, cov * (0.1 + 0.8 * fr)); // 新血湿亮（粗糙度 0.3 左右），干了的那圈哑光
        }
      }
      // 血斑外面零星的溅点（离血斑越近越多）
      if (P0 > 0.1 && P0 < 0.42 && !hair) {
        const fd = smooth(0.1, 0.3, P0) * dropAt(tA, tB, NT, u, v, 5.2, 50, 20, 0.76);
        if (fd > 0) { r = mix(r, r * coreC[0] + 6, fd * 0.9); g = mix(g, g * coreC[1] + 2, fd * 0.9); b = mix(b, b * coreC[2] + 2, fd * 0.9); wetA = Math.max(wetA, fd * 0.12); }
      }
      if (op > 0.02 && !hair) {
        // 伤口里：不再透出布的条纹和褶子——自己的颜色（暗红的肉、坑坑洼洼），边上一圈发黑的翻边，布上偶尔露出几根浅色的断纱
        const core = smooth(0.15, 0.7, op), lipE = smooth(0.02, 0.18, op) * (1 - smooth(0.18, 0.4, op)) * (0.35 + 0.65 * smooth(0.3, 0.7, n1)); // 翻边断断续续（一整圈像一只眼睛）
        r *= 1 - lipE * 0.5; g *= 1 - lipE * 0.55; b *= 1 - lipE * 0.5;
        if (!isSkin) { const fr2 = lipE * smooth(0.62, 0.72, n3) * 0.4; r = mix(r, Math.min(255, lr * 0.9 + 18), fr2); g = mix(g, Math.min(255, lg * 0.88 + 14), fr2); b = mix(b, Math.min(255, lb * 0.85 + 12), fr2); }
        const pit = smooth(0.4, 0.8, n3 * 0.6 + n2 * 0.4), fat = smooth(0.74, 0.8, n2) * 0.25, deep = smooth(0.55, 1, op);
        const mr = mix(70, 30, pit) * (1 - deep * 0.35) + fat * 50, mg = mix(14, 6, pit) * (1 - deep * 0.3) + fat * 30, mb = mix(13, 7, pit) * (1 - deep * 0.3) + fat * 24;
        r = mix(r, mr, core); g = mix(g, mg, core); b = mix(b, mb, core);
        wetA = Math.max(wetA, core * (0.55 + 0.45 * smooth(0.6, 1, op))); // 伤口里湿亮
      }
      if (spotKind === 'lesion' && isSkin) { // 巨尸的烂疮：发黑的芯、一圈湿亮的生肉（肌肉的纹路）、发黄的腐皮边、外面一圈发炎的暗红
        for (let c = 0; c < spots.length; c++) {
          const P = spots[c], ex = px - P.x, ey = py - P.y, ez = pz - P.z, dd = Math.sqrt(ex * ex + ey * ey + ez * ez); if (dd > P.r * 1.8) continue;
          const sh = dd / P.r + (n2 - 0.5) * 0.45 + (n1 - 0.5) * 0.5 + (n3 - 0.5) * 0.12;
          // 巨尸的皮本来就是暗红：烂疮靠「黑」和「亮」分出来——大块发黑的坏死芯、一圈湿亮的鲜红肌肉、零碎发黄的腐皮、外面一圈发黑的坏死边
          const pitC = 1 - smooth(0.22, 0.4, sh), meat = (1 - smooth(0.55, 0.7, sh)) * (1 - pitC), rimY = (1 - smooth(0.7, 0.88, sh)) * (1 - meat - pitC) * smooth(0.35, 0.6, n2 * 0.6 + n1 * 0.4), halo = (1 - smooth(0.8, 1.5, sh)) * (1 - meat - pitC - rimY);
          r *= 1 - halo * 0.45; g *= 1 - halo * 0.5; b *= 1 - halo * 0.45;
          r = mix(r, 150 + n3 * 24, rimY * 0.8); g = mix(g, 122 + n3 * 18, rimY * 0.8); b = mix(b, 64, rimY * 0.8);
          const fib = 0.82 + 0.18 * Math.sin((ey * 700 + ex * 200) + n2 * 9 + n3 * 4); // 肌肉一条条的纹（隐约的，不是一排齐整的条纹）
          r = mix(r, mix(168, 110, n3) * fib, meat); g = mix(g, mix(30, 18, n3) * fib, meat); b = mix(b, mix(26, 16, n3) * fib, meat);
          r = mix(r, 22 + n3 * 10, pitC); g = mix(g, 7, pitC); b = mix(b, 7, pitC);
          wetA = Math.max(wetA, meat * 0.95 + pitC * 0.7 + rimY * 0.45);
        }
        // 撑裂的皮：几道细长的口子，里面湿红，两边绷得发白发粉
        sl[0] = sl[1] = sl[2] = 0; for (let c = 0; c < splits.length; c++) slashAt(splits[c], px, py, pz, nx, nz, n1 * 0.6 + n3 * 0.4, sl);
        if (sl[0] + sl[1] + sl[2] > 0) {
          const ed = Math.max(sl[1], sl[2]); r = mix(r, 184, ed * 0.6); g = mix(g, 132, ed * 0.6); b = mix(b, 122, ed * 0.6);
          r = mix(r, 104, sl[0]); g = mix(g, 16, sl[0]); b = mix(b, 14, sl[0]); wetA = Math.max(wetA, sl[0] * 0.9);
        }
      }
      out[si] = r; out[si + 1] = g; out[si + 2] = b; out[si + 3] = encodeWet(al, wetA);
    }
  }
  };
  const chunks = Math.ceil(S / every);
  // 一段画半行：某种外观头一回走到自己的分支（烂疮、酸蚀、灰烬）时 V8 会退回解释执行，那一段慢几十倍；段小一半，最长的一段也短一半
  const half = S >= 1024 ? S >> 1 : S;
  for (let c = 0; c < chunks; c++) for (let i0 = 0; i0 < S; i0 += half) { rows(c, chunks, i0, i0 + half); yield; }
}

/**
 * 每个模型共用的法线图和粗糙度图（尺寸 S/2）：只放「底子」——衣服的褶子（从低通的明暗来，条纹不当成凸起）、布纹、
 * 皮肤的毛孔和血管；粗糙度：皮肤有点蜡、布料哑光、头发和鞋居中、眼球口腔湿。各外观的血、伤口的光泽在颜色图的透明通道里。
 * nrmOut / roughOut：(S/2)² RGBA。生成器
 */
export function* paintSurface(src, layers, tables, nrmOut, roughOut, body, tears = null) {
  const S = layers.S, H = S >> 1, NT = tables.n, tA = tables.a, ts = NT / H, Rg = PAINT.rough, every = rowsPer(H);
  const L = body ? body.L : 0, low = layers.low, k = L / H, pos = body ? body.pos : null, nrm = body ? body.nrm : null, tl = L && tears ? tears : [], sl = [0, 0, 0];
  const height = new Float32Array(H * H);
  for (let j0 = 0; j0 < H; j0 += every) {
  ((j1) => { for (let j = j0; j < j1; j++) {
    const fy = (j + 0.5) * k - 0.5, yy = Math.floor(fy), y0 = Math.max(0, Math.min(L - 1, yy)), y1 = Math.min(L - 1, Math.max(0, yy + 1)), ty = fy - yy;
    for (let i = 0; i < H; i++) {
      const o = (j * 2) * S + i * 2, o2 = o + 1, o3 = o + S, o4 = o + S + 1, h = j * H + i;
      const l = (lum(src[o * 4], src[o * 4 + 1], src[o * 4 + 2]) + lum(src[o2 * 4], src[o2 * 4 + 1], src[o2 * 4 + 2]) + lum(src[o3 * 4], src[o3 * 4 + 1], src[o3 * 4 + 2]) + lum(src[o4 * 4], src[o4 * 4 + 1], src[o4 * 4 + 2])) / (4 * 255);
      let lo = l;
      if (L) { const fx = (i + 0.5) * k - 0.5, xx = Math.floor(fx), x0 = Math.max(0, Math.min(L - 1, xx)), x1 = Math.min(L - 1, Math.max(0, xx + 1)), tx = fx - xx; lo = (low[y0 * L + x0] * (1 - tx) + low[y0 * L + x1] * tx) * (1 - ty) + (low[y1 * L + x0] * (1 - tx) + low[y1 * L + x1] * tx) * ty; }
      const p = layers.part[o];
      const weave = tap(tA, NT, i * ts * 2.6 + 0.37, j * ts * 2.6 + 0.61); // 布纹：每格一点几个噪声格（以前按整数倍取，取到的总是格点，排成一行行规则的小鼓包）
      // 布：褶子跟着低通的明暗，细的明暗（条纹、印花）只留一点；皮肤：毛孔和血管
      // 头发只留一点起伏：原图头发那一条条梳齿压进法线，手电一照头顶又是一排亮暗相间的条纹（颜色里已经压平了）
      height[h] = p === PART.skin ? l * 0.35 + layers.vein[o] / 255 * 0.1 : p === PART.cloth || p === PART.shoe ? lo * 0.75 + (l - lo) * 0.025 + (weave - 0.5) * 0.06 : p === PART.hair ? lo * 0.3 + (weave - 0.5) * 0.04 : l * 0.6;
      // 这个模型固定的几处破口（bodyTears）：洞往下凹一级、毛边翘起一点——手电扫过，口子边上有一道高光、一道影子
      if (tl.length && p === PART.cloth) {
        const fx = (i + 0.5) * k - 0.5, xx = Math.floor(fx), x0 = Math.max(0, Math.min(L - 1, xx)), x1 = Math.min(L - 1, Math.max(0, xx + 1)), tx = fx - xx;
        const q00 = y0 * L + x0, q10 = y0 * L + x1, q01 = y1 * L + x0, q11 = y1 * L + x1, w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        const px = bil3(pos, 0, q00, q10, q01, q11, w00, w10, w01, w11), py = bil3(pos, 1, q00, q10, q01, q11, w00, w10, w01, w11), pz = bil3(pos, 2, q00, q10, q01, q11, w00, w10, w01, w11);
        let nx = bil3(nrm, 0, q00, q10, q01, q11, w00, w10, w01, w11), nz = bil3(nrm, 2, q00, q10, q01, q11, w00, w10, w01, w11); const nh = Math.sqrt(nx * nx + nz * nz) || 1; nx /= nh; nz /= nh;
        sl[0] = sl[1] = sl[2] = 0; const rag = layers.d1[o] / 255 * 0.55 + layers.d3[o] / 255 * 0.3 + layers.d2[o] / 255 * 0.15;
        for (let c = 0; c < tl.length; c++) slashAt(tl[c], px, py, pz, nx, nz, rag, sl);
        height[h] += -sl[0] * 0.05 + (sl[1] + sl[2]) * 0.014;
      }
      const base = p === PART.skin ? Rg.skin : p === PART.hair ? Rg.hair : p === PART.shoe ? Rg.shoe : p === PART.eye ? Rg.eye : p === PART.mouth ? Rg.mouth : Rg.cloth;
      const rv = clamp01(base + (weave - 0.5) * 0.06) * 255, ro = h * 4;
      roughOut[ro] = rv; roughOut[ro + 1] = rv; roughOut[ro + 2] = rv; roughOut[ro + 3] = 255;
    }
  } })(Math.min(H, j0 + every));
  yield;
  }
  const strength = H / 64; // 同样的起伏，贴图越大每格的坡度越小：按尺寸放大，几档贴图看起来一样凹凸
  for (let j0 = 0; j0 < H; j0 += every) {
  ((j1) => { for (let j = j0; j < j1; j++) {
    for (let i = 0; i < H; i++) {
      const xl = height[j * H + Math.max(0, i - 1)], xr = height[j * H + Math.min(H - 1, i + 1)];
      const yu = height[Math.max(0, j - 1) * H + i], yd = height[Math.min(H - 1, j + 1) * H + i];
      let nx = -(xr - xl) * strength, ny = -(yd - yu) * strength, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const o = (j * H + i) * 4;
      nrmOut[o] = (nx * 0.5 + 0.5) * 255; nrmOut[o + 1] = (ny * 0.5 + 0.5) * 255; nrmOut[o + 2] = (nz * 0.5 + 0.5) * 255; nrmOut[o + 3] = 255;
    }
  } })(Math.min(H, j0 + every));
  yield;
  }
}
