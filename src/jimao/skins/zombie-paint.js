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
// 颜色图每种外观一张；法线和粗糙度每个模型一张、各外观共用（只放布料、皮肤、头发这些「底子」）。
// 每种外观自己的湿血、伤口、涎水、油泥的光泽写在颜色图的透明通道里（见 encodeWet），zombie-skin.js 的着色器读出来
// 改粗糙度、把布纹法线抹平——伤口各外观不同，共用的粗糙度图装不下，又不想多做十几张图。
// 所有大循环都写成生成器：每处理两千来格就 yield 一次，外面按时间预算切片、隔帧继续（不卡开局那几秒）。
// 颜色都按 sRGB 0–255 算（贴图里就是这个），血是「乘」上去的，底下的褶子还透得出来。

/** 画法的常数。layout：身体网格的分辨率（贴图上每格对应身体上一个点）；dilate：岛边往外补几格（接缝处取样不落空） */
export const PAINT = Object.freeze({
  layout: 256,
  dilate: 4,
  chunk: 2048, // 每画这么多格让一次（外面按时间决定要不要隔帧）：一段一两毫秒，外面的时间预算才掐得准
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
/** 两个整数 → 0–1（淌痕一条条的长短粗细、裂口的参数） */
function hash2(a, b) { return hash3(a, b, 7, 3); }
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
 *   spots：特殊感染者的标记（'acid' 喷酸者的酸蚀洞、'lesion' 巨尸的烂疮、'pustule' 胖尸的脓疱）；soot：扑袭者的一身黑灰，ash：肩膀袖子上的浅灰；filth：油泥的光泽；
 *   wounds：伤口几处（[最少, 最多]）；pool：可以挑哪些伤口（不写 = 全都可以）。
 */
export const LOOKS = Object.freeze({
  // 三套普通的：灰绿、发青发灰、蜡黄
  walker: Object.freeze([
    Object.freeze({ skinA: [118, 124, 104], skinB: [112, 102, 110], chroma: 0.16, contrast: 1.25, veins: 0.75, veinCol: [0.62, 0.66, 0.8], bruise: 0.6, sock: [0.42, 0.33, 0.4], lips: [84, 60, 66], blood: 1, grime: 0.9, rips: 3, claws: 0.6, mouth: 1, spray: 1, shins: 0.8, wounds: [2, 3] }),
    Object.freeze({ skinA: [112, 118, 112], skinB: [106, 98, 108], chroma: 0.12, contrast: 1.3, veins: 0.85, veinCol: [0.6, 0.64, 0.82], bruise: 0.8, sock: [0.4, 0.34, 0.42], lips: [78, 62, 72], blood: 0.9, grime: 0.8, rips: 2, claws: 0.5, mouth: 0.8, spray: 1, shins: 0.6, wounds: [1, 3] }),
    Object.freeze({ skinA: [130, 124, 98], skinB: [116, 104, 98], chroma: 0.2, contrast: 1.2, veins: 0.65, veinCol: [0.64, 0.64, 0.78], bruise: 0.55, sock: [0.44, 0.34, 0.36], lips: [88, 62, 62], blood: 1.2, grime: 1, rips: 4, claws: 0.7, mouth: 1.2, spray: 2, shins: 1, wounds: [2, 3] }),
  ]),
  // 尖叫者：失血的灰白，带一点紫；血管发青发紫、看得很清楚；嘴唇灰蓝干裂；血很少
  pale: Object.freeze({ skinA: [164, 164, 170], skinB: [146, 140, 158], chroma: 0.06, contrast: 1.35, veins: 1.6, veinCol: [0.42, 0.42, 0.66], bruise: 0.35, sock: [0.42, 0.4, 0.52], lips: [104, 108, 126], blood: 0.55, grime: 0.5, rips: 2, claws: 0.4, mouth: 0.45, spray: 0, shins: 0.3, wounds: [1, 1], pool: ['forearm', 'neckF', 'neckB'], bloodMul: [0.36, 0.2, 0.22] }),
  // 扑袭者：一身黑灰，肩膀袖子上蒙着浅灰的灰烬，衣服油泥发亮（手电照过去有高光，不至于只剩一双红眼）
  lunger: Object.freeze({ skinA: [84, 84, 86], skinB: [72, 66, 72], chroma: 0.08, contrast: 1.3, veins: 0.5, veinCol: [0.6, 0.6, 0.66], bruise: 0.3, sock: [0.35, 0.3, 0.32], lips: [52, 40, 42], blood: 1, grime: 1.1, rips: 5, claws: 0.8, mouth: 1, spray: 1, shins: 0.6, wounds: [2, 3], soot: 0.62, ash: 0.55, filth: 0.62 }),
  // 喷酸者：蜡黄发灰的黄疸，有斑驳；绿只在血管、眼窝和嘴边；嘴角淌黄绿的涎水；胸口和袖子上一个个酸蚀的洞
  spitter: Object.freeze({ skinA: [150, 146, 108], skinB: [136, 130, 104], chroma: 0.1, contrast: 1.25, veins: 0.9, veinCol: [0.56, 0.72, 0.42], bruise: 0.35, sock: [0.5, 0.56, 0.3], lips: [86, 92, 54], blood: 0.6, grime: 0.8, rips: 2, claws: 0.3, mouth: 1.2, spray: 0, shins: 0.4, wounds: [1, 1], pool: ['gut', 'flank', 'thigh'], fluid: [0.74, 0.86, 0.36], spots: 'acid' }),
  // 巨尸：暗红、生肉似的皮，几块大的烂疮（湿的芯、发黑的边），扎堆在前臂、肩膀和一条大腿上
  brute: Object.freeze({ skinA: [124, 86, 78], skinB: [104, 74, 78], chroma: 0.18, contrast: 1.2, veins: 0.6, veinCol: [0.6, 0.5, 0.58], bruise: 0.4, sock: [0.4, 0.28, 0.28], lips: [64, 34, 34], blood: 1.5, grime: 0.9, rips: 5, claws: 0.8, mouth: 1.3, spray: 2, shins: 1, wounds: [2, 3], spots: 'lesion', bloodMul: [0.42, 0.06, 0.05] }),
  // 胖尸：灰绿发紫，一身脓疱
  bloater: Object.freeze({ skinA: [128, 136, 104], skinB: [106, 92, 112], chroma: 0.12, contrast: 1.2, veins: 1.2, veinCol: [0.52, 0.52, 0.72], bruise: 0.85, sock: [0.4, 0.34, 0.44], lips: [70, 58, 74], blood: 0.9, grime: 0.9, rips: 3, claws: 0, mouth: 0.8, spray: 1, shins: 0.6, wounds: [1, 2], spots: 'pustule' }),
});

// 伤口能落的地方（解剖位置）：躯干的四种当主伤口，前臂和大腿只当附带的
const PRIMARY = Object.freeze(['neckF', 'upperBack', 'gut', 'neckB', 'flank']);
const SECONDARY = Object.freeze(['forearm', 'thigh', 'flank', 'forearm', 'gut']);

/**
 * 一种外观的伤（各外观各不相同）：从一组解剖位置里挑一到三处，各自抖位置、大小、长短和左右；再加抓痕、破口、喷溅、特殊标记。
 * key：这一模型上的第几种外观（主伤口按 key + rot 轮换，同一模型的几套外观主伤口不会落在同一处；rot 让两个模型错开）；part(k)：网格第 k 格是身体哪部分（PART）。
 * 返回 { wounds, claws, rips, sprays, spots, spotKind, shins, mouth }：每处伤口 { x, y, z, nx, nz（朝向）, r, len（往下淌多远）, spread（往下越淌越宽）, wet, open（皮肉翻开）, … }。纯函数
 */
export function planLook(body, frame, face, seed, look, key = 0, part = null, rot = 0) {
  const rnd = makeRng(seed), T = frame.top, cx = frame.cx, cz = frame.cz;
  const J = (a) => (rnd() * 2 - 1) * a;
  const nrm = body.nrm, pos = body.pos;
  const torso = (k) => Math.abs(pos[k * 3] - cx) < 0.15;
  const facing = (x, z, min) => (k) => nrm[k * 3] * x + nrm[k * 3 + 2] * z > min;
  const cloth = (k) => !part || part(k) === PART.cloth;
  const skin = (k) => !part || part(k) === PART.skin;
  const and = (...fs) => (k) => fs.every((f) => f(k));
  const wounds = [], scale = Math.max(0.6, look.blood || 1);
  // 一处伤口：at 落点，len 往下淌多远，spread 越往下越宽多少，open 皮肉翻开多大，wet 源头多湿
  const wound = (p, r, len, spread, open, wet, extra = {}) => wounds.push({ x: p.x, y: p.y, z: p.z, nx: p.nx, nz: p.nz, r: r * (0.8 + rnd() * 0.45), len: len * (0.75 + rnd() * 0.5) * Math.sqrt(scale), spread: spread * (0.8 + rnd() * 0.4), open, wet, amt: 1, seed: (rnd() * 1e6) | 0, slot: 0.013, dens: 0.5 + rnd() * 0.2, width: 0.0042, ...extra });
  const site = {
    // 脖子侧面咬了一口：伤口在颈侧，血从锁骨往前胸（或后背）一路洇下去
    neckF: (s) => { neckBite(s); wound(snapPoint(body, [cx + s * (0.065 + J(0.012)), T * (0.79 + J(0.012)), frame.front], and(facing(0, 1, 0.3), torso)), 0.068, 0.42, 0.3, 0, 0.45); },
    neckB: (s) => { neckBite(s); wound(snapPoint(body, [cx + s * (0.06 + J(0.015)), T * (0.79 + J(0.012)), frame.back], and(facing(0, -1, 0.3), torso)), 0.064, 0.44, 0.28, 0, 0.4); },
    upperBack: (s) => wound(snapPoint(body, [cx + s * (0.07 + J(0.02)), T * (0.74 + J(0.02)), frame.back], and(facing(0, -1, 0.35), torso)), 0.045, 0.36, 0.17, 0.9, 0.9),
    gut: (s) => wound(snapPoint(body, [cx + s * (0.025 + rnd() * 0.04), T * (0.6 + J(0.025)), frame.front], and(facing(0, 1, 0.35), torso)), 0.04, 0.24, 0.16, 1, 1),
    flank: (s) => wound(snapPoint(body, [cx + s * 0.15, T * (0.6 + J(0.03)), cz + J(0.03)], and(facing(s, 0, 0.45), torso)), 0.04, 0.26, 0.15, 1, 0.95),
    forearm: (s) => wound(snapPoint(body, [cx + s * 0.25, T * (0.47 + J(0.03)), cz + 0.03 + J(0.02)], (k) => !torso(k) && pos[k * 3 + 1] < T * 0.56), 0.028, 0.18, 0.06, 1, 0.9, { slot: 0.01 }),
    thigh: (s) => wound(snapPoint(body, [cx + s * (0.09 + J(0.02)), T * (0.36 + J(0.04)), frame.front], and(facing(0, 1, 0.4), (k) => Math.abs(pos[k * 3] - cx) > 0.03)), 0.035, 0.24, 0.08, 0.9, 0.85),
  };
  function neckBite(s) { wound(snapPoint(body, [cx + s * 0.06, T * (0.835 + J(0.008)), cz + 0.01 + J(0.015)], (k) => Math.abs(nrm[k * 3]) > 0.4), 0.028, 0.08, 0.15, 1, 1); }
  // 主伤口：按外观序号轮换（同一模型的几套外观主伤口落在不同处），左右随机；再挑一两处附带的
  const pool = look.pool || null, [lo, hi] = look.wounds || [1, 2], count = lo + Math.floor(rnd() * (hi - lo + 1));
  const primaries = pool ? pool : PRIMARY, primary = primaries[(key + rot) % primaries.length];
  const used = new Set([primary]); let side = rnd() < 0.5 ? -1 : 1;
  site[primary](side);
  for (let i = 1; i < count; i++) {
    const options = (pool || SECONDARY).filter((n) => !used.has(n)); if (!options.length) break;
    const name = options[Math.floor(rnd() * options.length)]; used.add(name); side = rnd() < 0.6 ? -side : side;
    site[name](side);
  }
  // 抓痕：三四道平行的，斜着划过胸口或后背，两头收尖
  const claws = [];
  if (rnd() < (look.claws ?? 0)) {
    const back = rnd() < 0.5, s = rnd() < 0.5 ? -1 : 1;
    const p = snapPoint(body, [cx + s * (0.03 + rnd() * 0.05), T * (0.64 + rnd() * 0.1), back ? frame.back : frame.front], and(facing(0, back ? -1 : 1, 0.4), torso, cloth));
    claws.push(slash(p, (0.55 + rnd() * 0.5) * (rnd() < 0.5 ? 1 : -1), 0.15 + rnd() * 0.08, 3 + (rnd() < 0.4 ? 1 : 0), 0.024 + rnd() * 0.008, 0.0042 + rnd() * 0.002, rnd));
  }
  // 破口：衣服上零星几处撕开的口子（胸口、肚子、袖子、背、大腿、膝盖），方向长短各不一样
  const rips = [], ripSpots = [[0.1, 0.72, 1], [-0.06, 0.62, 1], [0.2, 0.75, 0], [0.05, 0.68, -1], [0.08, 0.38, 1], [-0.1, 0.3, 1], [-0.12, 0.6, -1], [0.1, 0.25, 1]];
  for (let i = 0, n = look.rips || 0; i < n; i++) {
    const [ox, oy, f] = ripSpots[Math.floor(rnd() * ripSpots.length)], s = rnd() < 0.5 ? -1 : 1;
    const target = [cx + s * ox + J(0.03), T * (oy + J(0.04)), f > 0 ? frame.front : f < 0 ? frame.back : cz];
    const p = snapPoint(body, target, f ? and(facing(0, f, 0.3), cloth) : cloth);
    const len = 0.035 + rnd() * 0.07;
    rips.push(slash(p, J(1.4), len, 1, 0, 0.005 + rnd() * 0.007, rnd));
  }
  // 喷溅：一片细血点（常在背上：被咬的时候溅上去的）
  const sprays = [];
  for (let i = 0, n = look.spray || 0; i < n; i++) {
    const back = i === 0 ? rnd() < 0.7 : rnd() < 0.4;
    const p = snapPoint(body, [cx + J(0.12), T * (0.62 + rnd() * 0.18), back ? frame.back : frame.front], facing(0, back ? -1 : 1, 0.3));
    sprays.push({ x: p.x, y: p.y, z: p.z, nx: p.nx, nz: p.nz, r: 0.07 + rnd() * 0.06, u: rnd() * 256, v: rnd() * 256 });
  }
  // 特殊感染者的标记
  const spots = [], kind = look.spots || null;
  if (kind === 'lesion') { // 巨尸：扎堆在两条前臂、一边肩膀和一条大腿上，几块大的
    const s = rnd() < 0.5 ? -1 : 1, groups = [[[cx + 0.24, T * 0.48, cz + 0.03], 3, 0.04], [[cx - 0.24, T * 0.46, cz + 0.03], 2, 0.04], [[cx + s * 0.17, T * 0.8, cz], 2, 0.05], [[cx + s * 0.09, T * 0.33, frame.front], 2, 0.05]];
    for (const [c, n, spreadR] of groups) for (let i = 0; i < n; i++) {
      const p = snapPoint(body, [c[0] + J(spreadR), c[1] + J(spreadR * 1.4), c[2] + J(spreadR)], skin);
      spots.push({ x: p.x, y: p.y, z: p.z, r: 0.016 + rnd() * 0.02 });
    }
  } else if (kind === 'acid') { // 喷酸者：胸口正面和两只袖子上
    for (let i = 0; i < 8; i++) {
      const arm = i >= 5, s = rnd() < 0.5 ? -1 : 1;
      const p = arm ? snapPoint(body, [cx + s * 0.21, T * (0.72 + J(0.04)), cz + 0.02], and(cloth, (k) => !torso(k)))
        : snapPoint(body, [cx + J(0.1), T * (0.7 + J(0.07)), frame.front], and(cloth, facing(0, 1, 0.3), torso));
      spots.push({ x: p.x, y: p.y, z: p.z, r: 0.012 + rnd() * 0.016 });
    }
  }
  // 嘴：唇线往下糊一片，从一边嘴角挂下几道，顺着下巴、脖子淌到胸口
  let mouth = null;
  if (look.mouth > 0) {
    const m = face.mouth, s = rnd() < 0.5 ? -1 : 1, amt = look.mouth;
    mouth = { x: m.x + s * 0.006, y: m.y - 0.007, z: m.z, nx: 0, nz: 1, r: 0.013 * Math.sqrt(amt), len: 0.035 + 0.02 * amt, spread: 0.3, open: 0, wet: 0.9, amt: 1, seed: (rnd() * 1e6) | 0,
      slot: 0.0075, dens: 0.55, width: 0.0028, slen: 0.12 + 0.12 * amt + rnd() * 0.06, sw: 0.022, side: s, fluid: !!look.fluid };
  }
  // 往下淌的细流：每处伤口按水平位置分成一条条（这几个数在画的时候逐像素用）
  for (const W of [...wounds, ...(mouth ? [mouth] : [])]) {
    W.slen ??= W.len * (0.4 + rnd() * 0.5);
    W.sw ??= W.r * 0.8 + W.len * 0.55 * W.spread;
    W.sy0 = W.len * 0.25; W.sy1 = W.len * 0.8 + W.slen;
  }
  return { wounds, claws, rips, sprays, spots, spotKind: kind, shins: look.shins || 0, mouth, shinU: rnd() * 256 };
}

/** 一道裂口（n = 1）或一组抓痕（n = 3–4）：在 p 点的切平面里转 ang 弧度，每一道长短、位置、粗细略有不同 */
function slash(p, ang, len, n, gap, width, rnd) {
  const cuts = [];
  for (let c = 0; c < n; c++) cuts.push({ off: (c - (n - 1) / 2) * gap * (0.85 + rnd() * 0.3), len: len * (0.7 + rnd() * 0.35), shift: (rnd() - 0.5) * 0.25 * len, w: width * (0.75 + rnd() * 0.5) });
  return { x: p.x, y: p.y, z: p.z, nx: p.nx, nz: p.nz, ca: Math.cos(ang), sa: Math.sin(ang), curv: (rnd() - 0.5) * 2.5, reach: len * 0.75 + gap * n, cuts };
}

/** 一处伤口在身体上 p 点（法线水平分量 nx、nz）的血：写进 out [血量, 湿, 皮肉翻开]。na、nb：这一点的两份三维噪声（0–1）。纯函数 */
export function woundAt(W, px, py, pz, nx, nz, na, nb, frame, out) {
  out[0] = out[1] = out[2] = 0;
  const dy = W.y - py; // 正数 = 在伤口下方
  if (dy < -W.r * 3 || dy > W.len * 1.1 + W.r * 2) return out;
  const dx = px - W.x, dz = pz - W.z, hd2 = dx * dx + dz * dz, wmax = W.r * 1.8 + Math.max(0, dy) * W.spread * 1.5;
  if (hd2 > wmax * wmax) return out;
  const g = smooth(-0.25, 0.35, nx * W.nx + nz * W.nz); // 只淌在和伤口朝同一边的那一面
  if (g <= 0) return out;
  const hd = Math.sqrt(hd2), rr = W.r * (0.7 + 0.65 * na);
  const ds = Math.sqrt(hd2 + (dy < 0 ? dy * dy * 2.4 : dy * dy * 0.6)) / rr;
  const src = Math.exp(-ds * ds * 1.3);
  let soakV = 0;
  if (dy > 0) {
    // 往下洇开：越往下越宽，底边参差（按水平位置的噪声，一条条舌头往下伸），过了裤腰就少了（血积在裤腰上）
    const lenE = W.len * (0.5 + 0.8 * nb), t = dy / lenE, hw = W.r * 0.85 + dy * W.spread;
    soakV = (1 - smooth(0.6, 1.05, hd / hw + (na - 0.5) * 0.5)) * (1 - smooth(0.45, 1, t));
    if (W.y > frame.waist + 0.03) {
      const band = py - frame.waist;
      if (band < -0.035) soakV *= 0.35;
      else if (band < 0.02 && W.y - frame.waist < lenE * 1.1) soakV = Math.max(soakV, (1 - smooth(0.6, 1.1, hd / (W.r * 0.85 + (W.y - frame.waist) * W.spread))) * 1.05);
    }
  }
  out[0] = Math.max(src, soakV * 0.95) * g * W.amt;
  out[1] = Math.pow(src, 1.4) * W.wet * g;
  out[2] = W.open > 0 ? W.open * (1 - smooth(0.32, 0.5, ds + (nb - 0.5) * 0.35)) * g : 0;
  return out;
}

/**
 * 一种外观的血在身体网格上的分布（L×L）：pot（血量：0.35 往上就染上了，越大越饱和）、wet（湿）、open（皮肉翻开）、
 * mouth（嘴里淌出来的那一份，喷酸者画成涎水）。生成器，每几千格 yield 一次。
 */
export function* bloodField(body, plan, frame) {
  const { L, used, pos, nrm } = body, n = L * L;
  const pot = new Float32Array(n), wet = new Float32Array(n), open = new Float32Array(n), mouth = new Float32Array(n);
  const all = plan.mouth ? [...plan.wounds, plan.mouth] : plan.wounds, tmp = [0, 0, 0];
  for (let q0 = 0; q0 < n; q0 += 8192) {
    for (let q = q0, q1 = Math.min(n, q0 + 8192); q < q1; q++) {
      if (!used[q]) continue;
      const px = pos[q * 3], py = pos[q * 3 + 1], pz = pos[q * 3 + 2], h = Math.sqrt(nrm[q * 3] * nrm[q * 3] + nrm[q * 3 + 2] * nrm[q * 3 + 2]) || 1, nx = nrm[q * 3] / h, nz = nrm[q * 3 + 2] / h;
      for (let w = 0; w < all.length; w++) {
        const W = all[w], dy = W.y - py;
        if (dy < -W.r * 3 || dy > W.len * 1.1 + W.r * 2) continue;
        const ddx = px - W.x, ddz = pz - W.z, wmax = W.r * 1.8 + Math.max(0, dy) * W.spread * 1.5;
        if (ddx * ddx + ddz * ddz > wmax * wmax || nx * W.nx + nz * W.nz < -0.25) continue;
        // 噪声各伤口各取一份（种子不同），同一模型的几套外观边缘也不一样
        const na = fbm3(px * 34, py * 34, pz * 34, W.seed & 1023, 2), nb = vnoise3(px * 40 + 3, 0.5, pz * 40, (W.seed >> 10) & 1023);
        woundAt(W, px, py, pz, nx, nz, na, nb, frame, tmp);
        if (W === plan.mouth) { if (tmp[0] > mouth[q]) mouth[q] = tmp[0]; }
        else { pot[q] = 1 - (1 - pot[q]) * (1 - Math.min(1, tmp[0])) + Math.max(0, tmp[0] - 1); if (tmp[1] > wet[q]) wet[q] = tmp[1]; if (tmp[2] > open[q]) open[q] = tmp[2]; }
      }
    }
    yield;
  }
  return { pot, wet, open, mouth };
}

/** 往下淌的一道道细流（逐像素）：伤口正下方按水平位置分条，每条长短、粗细、弯曲不同，末端一滴。返回 0–1。纯函数 */
export function streamAt(W, px, py, pz, g) {
  const dy = W.y - py; if (dy < W.sy0 || dy > W.sy1) return 0;
  const lat = (px - W.x) * -W.nz + (pz - W.z) * W.nx; if (lat < -W.sw || lat > W.sw) return 0;
  const slot = W.slot, si = Math.floor(lat / slot);
  let best = 0;
  for (let s = si - 1; s <= si + 1; s++) {
    const h1 = hash2(s, W.seed); if (h1 > W.dens) continue;
    const h2 = hash2(s, W.seed + 1), h3 = hash2(s, W.seed + 2), h4 = hash2(s, W.seed + 3);
    const c = (s + 0.2 + 0.6 * h2) * slot; if (c < -W.sw || c > W.sw) continue;
    const edge = Math.abs(c) / W.sw, y0 = W.len * (0.25 + 0.5 * h3) * (1 - 0.4 * edge), len = W.slen * (0.2 + 0.8 * h4) * (1 - 0.5 * edge);
    const t = (dy - y0) / len; if (t < 0 || t > 1) continue;
    const m = Math.sin(dy * 52 + h2 * 20) * 0.0013 + Math.sin(dy * 17 + h3 * 20) * 0.0024;
    let wd = W.width * (0.55 + 0.9 * h1 / W.dens) * (1 - 0.5 * t);
    if (t > 0.92) wd *= 1.6; // 末端挂一滴
    const v = (1 - smooth(wd * 0.5, wd, Math.abs(lat - c - m))) * (1 - 0.3 * t);
    if (v > best) best = v;
  }
  return best * g;
}

/** 裂口 / 抓痕（逐像素）：写进 out [洞, 上边的毛边, 下边的阴影]；rag：这一点的细噪声（0–1），把边撕毛。纯函数 */
export function slashAt(C, px, py, pz, nx, nz, rag, out) {
  const f = nx * C.nx + nz * C.nz; if (f < 0.15) return out;
  const vy = py - C.y; if (vy > C.reach || vy < -C.reach) return out;
  const dx = px - C.x, dz = pz - C.z, lat = dx * -C.nz + dz * C.nx, depth = dx * C.nx + dz * C.nz;
  if (lat > C.reach || lat < -C.reach || depth < -0.06) return out;
  const a = lat * C.ca + vy * C.sa, b = -lat * C.sa + vy * C.ca;
  for (const cut of C.cuts) {
    const tt = (a - cut.shift) / (cut.len * 0.5); if (tt <= -1 || tt >= 1) continue;
    const off = b - cut.off - a * a * C.curv, wd = cut.w * Math.sqrt(1 - tt * tt) * (0.55 + 0.9 * rag), ad = Math.abs(off);
    const hole = 1 - smooth(wd * 0.7, wd, ad), edge = (1 - smooth(wd, wd + 0.0035, ad)) * (1 - hole);
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
  const layers = { S, part: mk(), skin: mk(), d1: mk(), d2: mk(), d3: mk(), grime: mk(), eye: mk(), lips: mk(), shade: mk().fill(255), vein: mk(), mottle: mk(), bruise: mk(), hand: mk(), low: new Float32Array(L * L), face: fp, frame: fp.frame, skinLum: 160 };
  // 低频三维噪声先在小网格上算好（每格一次），画的时候双线性取
  const lowA = new Float32Array(L * L), lowB = new Float32Array(L * L);
  for (let q = 0; q < L * L; q++) {
    if (!used[q]) continue;
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    lowA[q] = fbm3(x * 9, y * 9, z * 9, 11, 3); lowB[q] = fbm3(x * 4.2 + 7, y * 4.2, z * 4.2, 29, 3);
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
      const u = i * ts, v = j * ts, h1 = tap(tA, NT, u * 2, v * 2), h2 = tap(tB, NT, u * 4, v * 4);
      const r = src[si], g = src[si + 1], bl = src[si + 2], al = src[si + 3], l0 = lum(r, g, bl);
      layers.d1[o] = tap(tA, NT, u * 3 + 7, v * 3 + 3) * 255; layers.d2[o] = tap(tB, NT, u * 11, v * 11) * 255; layers.d3[o] = tap(tA, NT, u * 24 + 5, v * 24 + 9) * 255;
      // 低通（按格子平均原贴图的亮度，后面再糊一下）
      const qc = qy * L + Math.min(L - 1, Math.floor((i + 0.5) * k));
      if (al > 200) { lowSum[qc] += l0; lowN[qc]++; }
      // 哪一块：眼球、口腔（原贴图里固定的两小块）、头发（贴图带透明的那片）、皮肤（看颜色）、鞋（脚下又不是皮肤）、其余是衣服
      const U = (i + 0.5) / S, V = (j + 0.5) / S;
      const sk = al < 250 ? 0 : skinness(r, g, bl);
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
      const knee = frame.knee, below = 1 - smooth(0.03, knee + 0.1, py);
      layers.grime[o] = clamp01(below * below * 0.95 + (1 - smooth(knee, T * 0.62, py)) * 0.18 + (b - 0.45) * 0.55 * (0.4 + below) + (h2 - 0.5) * 0.28 + (h1 - 0.5) * 0.12) * 255;
      if (part !== PART.skin) continue;
      // —— 以下只有皮肤 ——
      if (head) {
        // 眼窝：以眼球为中心、横向宽一点的软阴影，往颧骨、眉骨慢慢散开（不是一圈黑）
        let e = 0;
        for (let s = 0; s < 2; s++) { const E = eyes[s], ex = (px - E.x) / 1.25, ey = py - E.y + 0.002, ez = (pz - E.z) * 0.8; e = Math.max(e, 1 - smooth(0.006, 0.036, Math.sqrt(ex * ex + ey * ey * 1.15 + ez * ez))); }
        layers.eye[o] = e * e * (3 - 2 * e) * 255;
        // 嘴唇：嘴中心一个扁椭圆（只在朝前的面上），边缘软
        const lx = (px - mouth.x) / 0.025, ly = (py - mouth.y + 0.001) / 0.0105;
        layers.lips[o] = nz > 0.15 && pz > mouth.z - 0.03 ? (1 - smooth(0.65, 1.1, Math.sqrt(lx * lx + ly * ly))) * 255 : 0;
        // 塌下去的地方：颧骨下、太阳穴，下巴和下颌底下（法线朝下）
        let hol = 0;
        for (let s = 0; s < 2; s++) {
          const C = cheeks[s], c1 = len3((px - C.x) * 0.9, (py - C.y) * 1.25, pz - C.z); hol = Math.max(hol, (1 - smooth(0.004, 0.03, c1)) * 0.55);
          const Tm = temples[s], c2 = len3(px - Tm.x, (py - Tm.y) * 0.9, pz - Tm.z); hol = Math.max(hol, (1 - smooth(0.004, 0.034, c2)) * 0.45);
        }
        hol = Math.max(hol, smooth(-0.2, -0.75, ny) * 0.55 * (py < mouth.y ? 1 : 0.3));
        layers.shade[o] = (1 - hol) * 255;
      } else {
        layers.shade[o] = 255 - smooth(-0.3, -0.85, ny) * 70; // 脖子底下、手臂下面暗一点
      }
      // 血管：贴图细噪声做「扭过的脊线」——一条条细、带分叉，只在太阳穴、下颌和脖子侧面、前臂和手背上，浓淡不一
      const face = U > 0.5 && V < 0.45, f = face ? 1.6 : 2.6;
      const wu = u * f + (tap(tB, NT, u * 0.9 + 40, v * 0.9) - 0.5) * 9, wv = v * f + (tap(tA, NT, u * 0.9, v * 0.9 + 60) - 0.5) * 9;
      const r1 = 1 - Math.abs(tap(tA, NT, wu, wv) * 2 - 1), r2 = 1 - Math.abs(tap(tB, NT, wu * 2.3 + 17, wv * 2.3 + 5) * 2 - 1);
      const line = Math.max(smooth(0.9, 0.975, r1), smooth(0.93, 0.985, r2) * 0.7);
      let region = 0;
      if (head || py > T * 0.76) {
        for (let s = 0; s < 2; s++) { const Tm = temples[s]; region = Math.max(region, 1 - smooth(0.02, 0.045, len3(px - Tm.x, py - Tm.y, pz - Tm.z))); }
        if (py < mouth.y + 0.01 && py > fp.chinY - 0.13) region = Math.max(region, smooth(0.024, 0.05, Math.abs(px - fx0)) * (py < fp.chinY + 0.01 ? 1 : 0.8), py < fp.chinY - 0.01 ? 0.75 : 0);
        if (py > T * 0.76 && py < fp.chinY - 0.02) region = Math.max(region, 0.6);
      }
      if (Math.abs(px - cx) > 0.17 && py < T * 0.6 && py > T * 0.36) region = Math.max(region, 0.85);
      layers.vein[o] = line * region * smooth(0.3, 0.6, b + (h2 - 0.5) * 0.5) * 255;
      layers.mottle[o] = clamp01(a * 1.35 - 0.18 + (h1 - 0.5) * 0.35) * 255;
      layers.bruise[o] = smooth(0.62, 0.8, b + (h2 - 0.5) * 0.18) * 230;
      layers.hand[o] = Math.abs(px - cx) > 0.16 && py < T * 0.55 && py > T * 0.37 ? 255 : 0;
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
  for (let pass = 0; pass < 2; pass++) {
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
/** 衣服上的脏：先乘一层褐黑，再蒙一层灰土，最后裤脚和鞋上一圈泥（ch：0 1 2 = R G B） */
function dirty(c, ch, dm, dust, mud) { c = mix(c, c * PAINT.grime[ch] / 96, dm); c = mix(c, PAINT.dust[ch], dust * 0.42); return mix(c, c * PAINT.mud[ch], mud); }

// 血染布、染皮肤是「乘」上去的（底下的褶子还透得出来）：外沿干了发褐、往里暗红、源头湿的发红发黑
const DRY = [0.6, 0.43, 0.33], CORE = [0.33, 0.085, 0.07], FRESH = [0.42, 0.05, 0.04];

/**
 * 画一张外观的颜色图。src：原贴图（S×S RGBA）；layers：prepareLayers；look：LOOKS 里的一套；tone：衣服的色调
 * （zombie-skin.js 的 [R, G, B, 保留原色]）；plan：planLook；field：bloodField；body：rasterBody；tables：噪声表；out：S×S RGBA（写进去）。
 * 生成器，按行 yield。透明通道见 encodeWet。
 */
export function* paintColour(src, layers, look, tone, plan, field, body, tables, out) {
  const S = layers.S, { L, pos, nrm } = body, k = L / S, every = rowsPer(S), NT = tables.n, tA = tables.a, tB = tables.b, ts = NT / S;
  const [tr, tg, tb, keep] = tone, G = PAINT.grime;
  const bm = look.bloodMul || null, dryC = bm ? [bm[0] * 1.45, bm[1] * 1.9, bm[2] * 1.9] : DRY, coreC = bm || CORE, freshC = bm ? [bm[0] * 1.1, bm[1] * 0.8, bm[2] * 0.8] : FRESH;
  const fluid = look.fluid || null, soot = look.soot || 0, ash = look.ash || 0, filth = look.filth || 0, spread = look.blood || 1;
  const A = look.skinA, B = look.skinB, skinRef = layers.skinLum, SC = look.sock, LC = look.lips, VC = look.veinCol, frame = layers.frame;
  const { d1, d2, d3, part, skin: skinL, grime: gr, eye, lips, shade, vein, mottle, bruise, hand, low } = layers;
  const { pot: fPot, wet: fWet, open: fOpen, mouth: fMouth } = field;
  const wounds = plan.wounds, mouthW = plan.mouth, claws = plan.claws, rips = plan.rips, sprays = plan.sprays, spots = plan.spots, spotKind = plan.spotKind;
  const allW = mouthW ? [...wounds, mouthW] : wounds, sl = [0, 0, 0], kp = keep;
  const rows = (j0, step) => { // 同 prepareLayers：逐行的活放进普通函数，行隔着取
  for (let j = j0; j < S; j += step) {
    const fy = (j + 0.5) * k - 0.5, yy = Math.floor(fy), y0 = Math.max(0, Math.min(L - 1, yy)), y1 = Math.min(L - 1, Math.max(0, yy + 1)), ty = fy - yy;
    for (let i = 0; i < S; i++) {
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
      const px = bil3(pos, 0, q00, q10, q01, q11, w00, w10, w01, w11), py = bil3(pos, 1, q00, q10, q01, q11, w00, w10, w01, w11), pz = bil3(pos, 2, q00, q10, q01, q11, w00, w10, w01, w11);
      let nx = bil3(nrm, 0, q00, q10, q01, q11, w00, w10, w01, w11), nz = bil3(nrm, 2, q00, q10, q01, q11, w00, w10, w01, w11); const ny = bil3(nrm, 1, q00, q10, q01, q11, w00, w10, w01, w11), nh = Math.sqrt(nx * nx + nz * nz) || 1; nx /= nh; nz /= nh;
      const n1 = d1[o] / 255, n2 = d2[o] / 255, n3 = d3[o] / 255, u = i * ts, v = j * ts;
      const l0 = lum(r, g, b), lowL = bil(low, q00, q10, q01, q11, w00, w10, w01, w11) * 255, grime = gr[o] / 255;
      const isSkin = p === PART.skin || (skinL[o] > 90 && p !== PART.hair && p < PART.eye), hair = p === PART.hair, shoe = p === PART.shoe;
      let wetA = 0, lr = r, lg = g, lb = b; // lr/lg/lb：同一处去掉条纹以后的颜色（血洇透了的地方用）
      if (p === PART.eye) { // 眼球：混浊发灰，缩在眼窝的暗里（发光的那一点在 zombie-skin.js）
        const m = l0 * 0.38; r = m * SC[0] * 1.6; g = m * SC[1] * 1.6; b = m * SC[2] * 1.6; wetA = 0.7;
      } else if (p === PART.mouth) { // 口腔：暗红褐，湿
        r = 30 + l0 * 0.22; g = 10 + l0 * 0.06; b = 10 + l0 * 0.06; if (fluid) { g += 8; r += 4; } wetA = 0.8;
      } else if (isSkin) {
        // 皮肤：原贴图的明暗全留（毛孔、五官的起伏），颜色换成灰绿 ↔ 灰紫的斑驳，原肤色只留一点
        const m = mottle[o] / 255, vv = Math.min(1.45, Math.max(0.35, 1 + (l0 / skinRef - 1) * look.contrast));
        const sh = vv * (1.06 - 0.2 * m) * (shade[o] / 255);
        r = (mix(A[0], B[0], m) + (r - l0) * look.chroma) * sh; g = (mix(A[1], B[1], m) + (g - l0) * look.chroma) * sh; b = (mix(A[2], B[2], m) + (b - l0) * look.chroma) * sh;
        const bz = (bruise[o] / 255) * look.bruise * 0.7; // 淤青：暗紫褐
        if (bz > 0) { r = mix(r, r * 0.66 + 4, bz); g = mix(g, g * 0.56, bz); b = mix(b, b * 0.74 + 6, bz); }
        const vn = Math.min(1, (vein[o] / 255) * look.veins); // 血管：细的青紫纹，乘上去，浓淡随噪声
        if (vn > 0) { r = mix(r, r * VC[0], vn); g = mix(g, g * VC[1], vn); b = mix(b, b * VC[2], vn); }
        if (spotKind === 'pustule') { // 胖尸的脓疱：一粒粒发黄的小鼓包，边上发红
          const core = smooth(0.84, 0.88, n3), rim = smooth(0.76, 0.84, n3) - core;
          r = mix(r, 176, core); g = mix(g, 164, core); b = mix(b, 86, core); r = mix(r, 112, rim * 0.5); g *= 1 - rim * 0.3; b *= 1 - rim * 0.25; wetA = Math.max(wetA, core * 0.6);
        }
        const e = eye[o] / 255; // 眼窝：往里压暗、带一点这套外观的颜色（发紫、喷酸者发黄绿），越靠近眼球越深
        if (e > 0) { const e1 = e * 0.85, e2 = smooth(0.55, 1, e) * 0.6; r *= mix(1, SC[0], e1) * (1 - e2); g *= mix(1, SC[1], e1) * (1 - e2); b *= mix(1, SC[2], e1) * (1 - e2); }
        const lp = lips[o] / 255; // 嘴唇：发暗发紫、去了血色，竖着的干裂纹（一道暗一道起皮的浅）
        if (lp > 0) {
          const ck = tap(tA, NT, u * 9 + 13, v * 1.6), crack = 1 - Math.abs(ck * 2 - 1), dark = smooth(0.86, 0.95, crack), flake = smooth(0.6, 0.75, n3) * (1 - dark) * 0.3;
          const lv = Math.min(1.2, Math.max(0.5, l0 / skinRef));
          r = mix(r, LC[0] * lv * (1 - dark * 0.55) + flake * 40, lp * 0.9); g = mix(g, LC[1] * lv * (1 - dark * 0.55) + flake * 38, lp * 0.9); b = mix(b, LC[2] * lv * (1 - dark * 0.55) + flake * 40, lp * 0.9);
        }
        const hd = hand[o] / 255; // 手：一层黑泥，指头那一截还带着干血
        if (hd > 0) {
          const dirt = hd * smooth(0.3, 0.7, n1 * 0.7 + (1 - py) * 0.6) * 0.7;
          r = mix(r, r * 0.5, dirt); g = mix(g, g * 0.45, dirt); b = mix(b, b * 0.4, dirt);
          const bl = hd * smooth(0.45, 0.55, n2 * 0.6 + (0.98 - py) * 1.1) * 0.9;
          r = mix(r, r * DRY[0] * 0.9, bl); g = mix(g, g * DRY[1] * 0.7, bl); b = mix(b, b * DRY[2] * 0.7, bl);
        }
        // 皮肤也跟着脏（脚踝、小腿），扑袭者一身黑灰
        const gk = Math.min(1, grime * look.grime * 0.6 + soot * 0.3); r = mix(r, r * G[0] / 110, gk); g = mix(g, g * G[1] / 110, gk); b = mix(b, b * G[2] / 110, gk);
        lr = r; lg = g; lb = b;
      } else {
        // 衣服、头发、鞋：去色上色调；lr/lg/lb 是同一处把明暗换成低通以后的（条纹压平、褶子还在）
        const kh = kp * (hair ? 0.6 : 1), dark = hair ? 0.5 : 1; // 头发油腻打绺、发暗
        const L0 = l0, Lw = mix(l0, lowL, 0.85);
        r = Math.min(255, (L0 + (src[si] - l0) * kh) * tr * dark); g = Math.min(255, (L0 + (src[si + 1] - l0) * kh) * tg * dark); b = Math.min(255, (L0 + (src[si + 2] - l0) * kh) * tb * dark);
        lr = Math.min(255, (Lw + (src[si] - l0) * kh * 0.6) * tr * dark); lg = Math.min(255, (Lw + (src[si + 1] - l0) * kh * 0.6) * tg * dark); lb = Math.min(255, (Lw + (src[si + 2] - l0) * kh * 0.6) * tb * dark);
        // 脏：底下发褐发黑，往上是一块块的；膝盖往下蒙一层灰土，裤脚和鞋上一圈泥
        const gk = Math.min(1, grime * look.grime * (shoe ? 1.25 : 1) + soot * 0.45), dm = gk * 0.8;
        const dust = smooth(0.42, 0.7, gk * 0.75 + n1 * 0.45) * (1 - smooth(0.12, 0.58, py)) * (1 - soot) * (shoe ? 0.45 : 1);
        const mud = (1 - smooth(0.035, 0.09 + n1 * 0.05, py)) * (shoe ? 0.85 : 0.6) + (1 - smooth(0.0, 0.025, py)) * 0.2;
        const mu = Math.min(1, mud);
        r = dirty(r, 0, dm, dust, mu); g = dirty(g, 1, dm, dust, mu); b = dirty(b, 2, dm, dust, mu); lr = dirty(lr, 0, dm, dust, mu); lg = dirty(lg, 1, dm, dust, mu); lb = dirty(lb, 2, dm, dust, mu);
        if (soot && !hair) { // 扑袭者：一身黑灰；肩膀上、袖子上蒙着浅灰的灰烬（给手电一点轮廓），布上一层发亮的油泥
          const sm = soot * (0.6 + n1 * 0.4); r *= 1 - sm; g *= 1 - sm; b *= 1 - sm * 0.95; lr *= 1 - sm; lg *= 1 - sm; lb *= 1 - sm * 0.95;
          const top = smooth(0.15, 0.6, ny) + (Math.abs(px - frame.cx) > 0.15 && py > frame.top * 0.62 ? 0.6 : 0);
          const as = ash * smooth(0.45, 0.75, Math.min(1, top) * 0.6 + n1 * 0.55 + (n2 - 0.5) * 0.3);
          r = mix(r, 118 * (0.75 + 0.5 * n2), as); g = mix(g, 115 * (0.75 + 0.5 * n2), as); b = mix(b, 110 * (0.75 + 0.5 * n2), as); lr = r; lg = g; lb = b;
          wetA = Math.max(wetA, filth * smooth(0.45, 0.6, n2 * 0.7 + n1 * 0.4) * (1 - as));
        }
        if (!hair && !shoe) {
          // 破口和抓痕：张开的裂口——里面暗、透出皮肉（或里面那件），一边翻起浅色的毛边，另一边压出一道影子
          sl[0] = sl[1] = sl[2] = 0; const rag = n3 * 0.6 + n2 * 0.4;
          for (let c = 0; c < rips.length; c++) slashAt(rips[c], px, py, pz, nx, nz, rag, sl);
          for (let c = 0; c < claws.length; c++) slashAt(claws[c], px, py, pz, nx, nz, rag, sl);
          if (sl[0] + sl[1] + sl[2] > 0) {
            const fib = smooth(0.4, 0.7, tap(tB, NT, u * 30, v * 30)) * 0.5 + 0.5;
            const hiE = sl[1] * fib * 0.75, loE = sl[2] * 0.6;
            r = mix(r, Math.min(255, r * 1.3 + 16), hiE); g = mix(g, Math.min(255, g * 1.28 + 14), hiE); b = mix(b, Math.min(255, b * 1.25 + 12), hiE);
            r *= 1 - loE * 0.55; g *= 1 - loE * 0.55; b *= 1 - loE * 0.55;
            // 洞里：深处发黑，透出来的皮是暗灰绿的，沾着土和干血
            const sk = smooth(0.35, 0.7, n2 + (n1 - 0.5) * 0.4), h = sl[0];
            const ir = mix(26, A[0] * 0.55, sk), ig = mix(18, A[1] * 0.5, sk), ib = mix(18, A[2] * 0.5, sk);
            r = mix(r, ir * (0.7 + 0.5 * n3), h); g = mix(g, ig * (0.7 + 0.5 * n3), h); b = mix(b, ib * (0.7 + 0.5 * n3), h);
            lr = r; lg = g; lb = b;
          }
          if (spotKind === 'acid') { // 喷酸者：酸烧穿的洞——外面一圈褪色发黄，再往里焦褐的边，洞里是起泡的皮
            for (let c = 0; c < spots.length; c++) {
              const P = spots[c], ex = px - P.x, ey = py - P.y, ez = pz - P.z, dd = Math.sqrt(ex * ex + ey * ey + ez * ez); if (dd > P.r * 1.6) continue;
              const sh = dd / P.r + (n2 - 0.5) * 0.45 + (n3 - 0.5) * 0.2, hole = 1 - smooth(0.5, 0.62, sh), rim = (1 - smooth(0.62, 0.9, sh)) * (1 - hole), bleach = (1 - smooth(0.85, 1.4, sh)) * (1 - hole - rim);
              r = mix(r, r * 0.95 + 26, bleach * 0.7); g = mix(g, g * 0.95 + 22, bleach * 0.7); b = mix(b, b * 0.7, bleach * 0.7);
              r = mix(r, r * 0.4 + 18, rim); g = mix(g, g * 0.3 + 8, rim); b = mix(b, b * 0.2, rim);
              const bub = smooth(0.55, 0.8, n3); r = mix(r, mix(150, 196, bub) * 0.8, hole); g = mix(g, mix(128, 176, bub) * 0.8, hole); b = mix(b, mix(86, 112, bub) * 0.8, hole);
              wetA = Math.max(wetA, hole * 0.55);
              lr = r; lg = g; lb = b;
            }
          }
        }
      }
      // —— 血 ——（乘上去：外沿干了发褐、一圈更深的水线、往里饱和发暗、源头湿的发红）
      const hairK = hair ? 0.65 : 1;
      let pt = bil(fPot, q00, q10, q01, q11, w00, w10, w01, w11) * spread, wt = bil(fWet, q00, q10, q01, q11, w00, w10, w01, w11), op = bil(fOpen, q00, q10, q01, q11, w00, w10, w01, w11), mp = mouthW ? bil(fMouth, q00, q10, q01, q11, w00, w10, w01, w11) : 0;
      // 逐像素的细节：淌痕、喷溅的血点、小腿上的血点
      if (!hair) {
        for (let w = 0; w < allW.length; w++) {
          const W = allW[w]; const st = streamAt(W, px, py, pz, smooth(W === mouthW ? -0.75 : -0.2, W === mouthW ? 0.0 : 0.35, nx * W.nx + nz * W.nz));
          if (st > 0) { if (W === mouthW) mp = Math.max(mp, st * 0.85); else { pt = Math.max(pt, 0.42 + st * 0.5); wt = Math.max(wt, st * 0.35 * W.wet); } }
        }
        for (let c = 0; c < sprays.length; c++) {
          const P = sprays[c], ex = px - P.x, ey = py - P.y, ez = pz - P.z, dd = Math.sqrt(ex * ex + ey * ey + ez * ez); if (dd > P.r * 1.8 || nx * P.nx + nz * P.nz < 0) continue;
          const dens = Math.exp(-(dd / P.r) * (dd / P.r) * 1.5), th = 0.93 - 0.16 * dens, nf = tap(tB, NT, u * 3.2 + P.u, v * 3.2 + P.v);
          pt = Math.max(pt, smooth(th, th + 0.02, nf) * 0.75);
        }
        if (plan.shins && py < 0.52 && py > 0.06 && nz > 0.1) {
          const nf = tap(tA, NT, u * 3.6 + plan.shinU, v * 3.6 + 11), th = 0.935 - 0.05 * plan.shins * (1 - smooth(0.2, 0.52, py));
          pt = Math.max(pt, smooth(th, th + 0.02, nf) * 0.7);
        }
      }
      if (mp > 0 && fluid) { // 喷酸者嘴里淌的是黄绿的涎水：亮、发黏
        const cov = smooth(0.3, 0.42, mp + (n2 - 0.5) * 0.2);
        if (cov > 0) { r = mix(r, r * fluid[0] + 14, cov); g = mix(g, g * fluid[1] + 22, cov); b = mix(b, b * fluid[2], cov); wetA = Math.max(wetA, cov * 0.92); }
        mp = 0;
      }
      const P0 = Math.max(pt, mp);
      if (P0 > 0.12) {
        // 边缘：横向拉长的噪声（顺着布纹洇）+ 条纹深浅（深色的纱吸得多）+ 细噪声把边撕碎
        const an = tap(tB, NT, u * 5, v * 1.1 + 31), wick = isSkin ? 0 : (l0 - lowL) / 255 * 0.45;
        const en = (an - 0.5) * 0.24 + wick + (n3 - 0.5) * 0.1 + (n2 - 0.5) * 0.08;
        const cov = smooth(0.32, 0.4, P0 + en) * hairK, sat = smooth(0.42, 0.95, P0 + en * 0.5), ring = cov * (1 - smooth(0.36, 0.5, P0 + en));
        if (cov > 0) {
          const fr = Math.min(1, wt * 1.2), flat = sat * 0.85; // 洇透了：条纹压平
          r = mix(r, lr, flat); g = mix(g, lg, flat); b = mix(b, lb, flat);
          let mr = mix(dryC[0], coreC[0], sat), mg = mix(dryC[1], coreC[1], sat), mb = mix(dryC[2], coreC[2], sat);
          mr = mix(mr, freshC[0], fr); mg = mix(mg, freshC[1], fr); mb = mix(mb, freshC[2], fr);
          const rk = 1 - ring * 0.38, pool = smooth(1, 1.5, P0) * 0.3; // 外沿那圈水线更深；积在裤腰的更暗
          mr *= rk * (1 - pool); mg *= rk * (1 - pool); mb *= rk * (1 - pool);
          const fl = isSkin ? 12 : 4; // 皮肤上的血不至于乘成死黑
          r = mix(r, r * mr + fl, cov); g = mix(g, g * mg + fl * 0.2, cov); b = mix(b, b * mb + fl * 0.2, cov);
          wetA = Math.max(wetA, cov * (0.12 + 0.88 * fr * fr));
        }
      }
      if (op > 0.02 && !hair) {
        // 伤口里：不再透出布的条纹和褶子——自己的颜色（暗红的肉、坑坑洼洼），边上一圈撕开的浅色毛边（在布上）或发黑的边（在皮上）
        const core = smooth(0.15, 0.7, op), lipE = smooth(0.02, 0.18, op) * (1 - smooth(0.18, 0.4, op));
        if (!isSkin) { r = mix(r, Math.min(255, lr * 1.25 + 18), lipE * 0.7); g = mix(g, Math.min(255, lg * 1.2 + 14), lipE * 0.7); b = mix(b, Math.min(255, lb * 1.15 + 12), lipE * 0.7); }
        else { r *= 1 - lipE * 0.45; g *= 1 - lipE * 0.5; b *= 1 - lipE * 0.45; }
        const pit = smooth(0.45, 0.75, n3 * 0.6 + n2 * 0.4), fat = smooth(0.82, 0.9, n2) * 0.5;
        const mr = mix(88, 36, pit) + fat * 60, mg = mix(22, 8, pit) + fat * 34, mb = mix(20, 9, pit) + fat * 26;
        r = mix(r, mr, core); g = mix(g, mg, core); b = mix(b, mb, core);
        wetA = Math.max(wetA, core * (0.45 + 0.55 * smooth(0.6, 1, op)));
      }
      if (spotKind === 'lesion' && isSkin) { // 巨尸的烂疮：湿亮的生肉芯、发黑坏死的边、外面一圈发炎
        for (let c = 0; c < spots.length; c++) {
          const P = spots[c], ex = px - P.x, ey = py - P.y, ez = pz - P.z, dd = Math.sqrt(ex * ex + ey * ey + ez * ez); if (dd > P.r * 1.7) continue;
          const sh = dd / P.r + (n2 - 0.5) * 0.4 + (n1 - 0.5) * 0.3, core = 1 - smooth(0.42, 0.58, sh), rim = (1 - smooth(0.58, 0.9, sh)) * (1 - core), halo = (1 - smooth(0.9, 1.5, sh)) * (1 - core - rim);
          r *= 1 - halo * 0.12; g *= 1 - halo * 0.3; b *= 1 - halo * 0.25;
          r = mix(r, 34 + n3 * 14, rim * 0.9); g = mix(g, 20 + n3 * 6, rim * 0.9); b = mix(b, 18 + n3 * 6, rim * 0.9);
          const pit = smooth(0.4, 0.8, n3);
          r = mix(r, mix(124, 70, pit), core); g = mix(g, mix(42, 18, pit), core); b = mix(b, mix(38, 18, pit), core);
          wetA = Math.max(wetA, core * 0.85);
        }
      }
      out[si] = r; out[si + 1] = g; out[si + 2] = b; out[si + 3] = encodeWet(al, wetA);
    }
  }
  };
  const chunks = Math.ceil(S / every);
  for (let c = 0; c < chunks; c++) { rows(c, chunks); yield; }
}

/**
 * 每个模型共用的法线图和粗糙度图（尺寸 S/2）：只放「底子」——衣服的褶子（从低通的明暗来，条纹不当成凸起）、布纹、
 * 皮肤的毛孔和血管；粗糙度：皮肤有点蜡、布料哑光、头发和鞋居中、眼球口腔湿。各外观的血、伤口的光泽在颜色图的透明通道里。
 * nrmOut / roughOut：(S/2)² RGBA。生成器
 */
export function* paintSurface(src, layers, tables, nrmOut, roughOut, body) {
  const S = layers.S, H = S >> 1, NT = tables.n, tA = tables.a, ts = NT / H, Rg = PAINT.rough, every = rowsPer(H);
  const L = body ? body.L : 0, low = layers.low, k = L / H;
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
      const weave = tap(tA, NT, i * ts * 16, j * ts * 16);
      // 布：褶子跟着低通的明暗，细的明暗（条纹、印花）只留一点；皮肤：毛孔和血管
      height[h] = p === PART.skin ? l * 0.35 + layers.vein[o] / 255 * 0.1 : p === PART.cloth || p === PART.shoe ? lo * 0.75 + (l - lo) * 0.2 + (weave - 0.5) * 0.08 : l * 0.6;
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
