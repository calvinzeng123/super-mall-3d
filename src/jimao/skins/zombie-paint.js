// 丧尸贴图的「画法」：纯数据运算（不碰 three.js、不碰 document），zombie-skin.js 负责把它接到画布和材质上。
// 以前的做法是把行人贴图去色、再往贴图上随机位置扣几个圆血斑——很多落在没用到的空白处，或者在衣服上成了一个个圆圈，
// 远看就是普通路人站在偏色的灯下。这里先把模型的三角形按 UV 光栅化到一张小网格上，于是贴图上每一格都知道
// 自己在身体上的什么位置（基础姿势下的三维坐标、朝向），这样：
//   - 伤口定在身体的实处（脖子侧面的咬伤、肚子上的豁口、前臂的咬痕、胸前背后的抓痕），血从伤口往「世界坐标的下方」淌、往下洇开；
//   - 嘴角的血顺着下巴、脖子流到胸口，眼窝在眼睛的三维位置上压黑，UV 接缝两边的同一处伤口对得上；
//   - 越往脚下越脏，鞋和裤脚最脏；手又脏又带血。
// 颜色图每种外观一张（几套色调 + 特殊感染者）；法线和粗糙度每个模型只做一张、各外观共用，
// 所以「湿血」（会反光的那部分）对同一个模型的所有外观都一样，各外观之间的差别放在色调、旧血（哑光）、抓痕和脏污上。
// 所有大循环都写成生成器：每处理两千来格就 yield 一次，外面按时间预算切片、隔帧继续（不卡开局那几秒）。
// 颜色都按 sRGB 0–255 算（画布里就是这个），血是「乘」上去的，底下的条纹、褶子还透得出来。

/** 画法的常数。layout：身体网格的分辨率（贴图上每格对应身体上一个点）；dilate：岛边往外补几格（接缝处取样不落空） */
export const PAINT = Object.freeze({
  layout: 256,
  dilate: 4,
  chunk: 2048, // 每画这么多格让一次（外面按时间决定要不要隔帧）：一段一两毫秒，外面的时间预算才掐得准
  // 颜色（sRGB 0–255）：污垢偏灰褐（乘上去），裤脚上的土发灰白，撕口里面是暗的（血的颜色见下面的 WET / DRY）
  grime: Object.freeze([58, 50, 40]),
  dust: Object.freeze([128, 120, 104]),
  rip: Object.freeze([34, 16, 14]), // 撕口里面：暗红褐（皮肉和阴影），不是纯黑
  // 粗糙度：湿血亮、皮肤有点蜡质、布料哑光、头发和鞋居中
  rough: Object.freeze({ cloth: 0.93, skin: 0.6, hair: 0.72, shoe: 0.62, fresh: 0.24, dried: 0.78, rip: 0.98 }),
});

// 身体各部分的编号（layers.part）
export const PART = Object.freeze({ none: 0, cloth: 1, skin: 2, hair: 3, shoe: 4 });

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
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
    // 面法线兜底（几何没带法线时）
    if ((t & 511) === 511) yield;
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
 * 身体的大致尺寸（从顶点直接量）：头顶高度、躯干中心（x、z）、躯干前后各多厚。纯函数
 */
export function bodyFrame(position) {
  let top = -Infinity, sx = 0, sz = 0, n = 0, zmin = Infinity, zmax = -Infinity;
  for (let i = 1; i < position.length; i += 3) top = Math.max(top, position[i]);
  for (let i = 0; i < position.length; i += 3) {
    const y = position[i + 1]; if (y < top * 0.6 || y > top * 0.75) continue;
    const x = position[i]; if (Math.abs(x) > 0.16) continue; // 只要躯干，不要垂着的手臂
    sx += x; sz += position[i + 2]; n++; zmin = Math.min(zmin, position[i + 2]); zmax = Math.max(zmax, position[i + 2]);
  }
  return { top, cx: n ? sx / n : 0, cz: n ? sz / n : 0, front: n ? zmax : 0.12, back: n ? zmin : -0.12 };
}

/** 网格上离 target 最近的、满足 ok(格子序号) 的那一点（伤口要落在身体的实处） */
function snap(body, [tx, ty, tz], ok = null) {
  const { L, used, pos } = body; let best = -1, bd = Infinity;
  for (let k = 0; k < L * L; k++) {
    if (used[k] !== 1) continue;
    const dx = pos[k * 3] - tx, dy = pos[k * 3 + 1] - ty, dz = pos[k * 3 + 2] - tz, d = dx * dx + dy * dy + dz * dz;
    if (d < bd && (!ok || ok(k))) { bd = d; best = k; }
  }
  return best < 0 ? [tx, ty, tz] : [body.pos[best * 3], body.pos[best * 3 + 1], body.pos[best * 3 + 2]];
}

/**
 * 每个模型的伤口（所有外观共用，湿血和撕口都在这里定）：
 *   bite：脖子侧面 / 肩膀的咬伤，血往下洇满半边胸口；gut：肚子上的豁口，往下洇到裤腰；arm：前臂的咬痕，血顺到手上；
 *   mouth：嘴角往下的血（下巴、脖子、前胸）。
 * claws：胸前、背后各一组三道的抓痕（撕口），分开存、由各外观自己挑（背上的那块血在 planStains 里各外观各放各的）——
 * 同一个模型的几套外观伤口要是全一样，一群从背后看过去全是同一处。
 * face：zombie-skin.js 的 faceOf（头顶高度、脸最前面的 z、头的左右中心）。每处 { x, y, z, r（半径）, run（往下淌多远）, wet（湿的程度） }。纯函数
 */
export function planWounds(body, frame, face, seed) {
  const rnd = makeRng(seed), side = rnd() < 0.5 ? -1 : 1, T = frame.top, cx = frame.cx;
  const front = (k) => body.nrm[k * 3 + 2] > 0.3, back = (k) => body.nrm[k * 3 + 2] < -0.3;
  const torso = (k) => Math.abs(body.pos[k * 3] - cx) < 0.15;
  const w = (p, r, run, wet) => ({ x: p[0], y: p[1], z: p[2], r, run, wet });
  const bite = w(snap(body, [cx + side * 0.085, T * 0.82, frame.cz + 0.02]), 0.06, 0.58 + rnd() * 0.1, 1);
  const gut = w(snap(body, [cx - side * (0.03 + rnd() * 0.05), T * (0.645 + rnd() * 0.035), frame.front], (k) => front(k) && torso(k)), 0.046, 0.26, 0.85);
  const arm = w(snap(body, [cx - side * 0.24, T * 0.5, frame.cz + 0.03], (k) => !torso(k)), 0.035, 0.22, 0.9);
  const mouthY = face.top - 0.18, mouth = { x: face.x + (rnd() - 0.5) * 0.012, y: mouthY, z: face.front - 0.012, r: 0.017, run: 0.34, wet: 1 };
  const claw = (isBack) => ({ ...w(snap(body, [cx + side * (isBack ? -0.05 : 0.04), T * (isBack ? 0.7 : 0.66), isBack ? frame.back : frame.front], (k) => (isBack ? back(k) : front(k)) && torso(k)), 0.1, 0, 0),
    angle: (rnd() - 0.5) * 0.9 + side * (isBack ? -0.5 : 0.5), gap: 0.026 + rnd() * 0.006 });
  const eyes = [-1, 1].map((s) => ({ x: face.x + s * 0.031, y: face.top - 0.108, z: face.front - 0.012 }));
  return { side, fresh: [bite, gut, arm], mouth, claws: [claw(false), claw(true)], eyes, frame };
}

/**
 * 每种外观自己的旧血块（哑光的褐色，不进共用的粗糙度图）：在衣服上随机找几处实点，往下洇开；back：先在背上放一大块。纯函数
 */
export function planStains(body, frame, seed, count, back = false) {
  const rnd = makeRng(seed), out = [], T = frame.top;
  if (back) {
    const p = snap(body, [frame.cx + (rnd() - 0.5) * 0.16, T * (0.62 + rnd() * 0.14), frame.back], (k) => body.nrm[k * 3 + 2] < -0.3 && Math.abs(body.pos[k * 3] - frame.cx) < 0.15);
    out.push({ x: p[0], y: p[1], z: p[2], r: 0.06 + rnd() * 0.02, run: 0.3 + rnd() * 0.12, wet: 0 });
  }
  for (let i = 0; i < count; i++) {
    const p = snap(body, [frame.cx + (rnd() - 0.5) * 0.5, T * (0.3 + rnd() * 0.5), rnd() < 0.6 ? frame.front : frame.back]);
    out.push({ x: p[0], y: p[1], z: p[2], r: 0.035 + rnd() * 0.06, run: 0.12 + rnd() * 0.3, wet: 0 });
  }
  return out;
}

/**
 * 一处伤口在身体上 p 点的「血量」（0–1 左右）：伤口上方很快就没了，下方顺着往下淌、越往下越窄越淡。纯函数
 */
export function soak(px, py, pz, w) {
  const dx = px - w.x, dz = pz - w.z, dy = py - w.y, h2 = dx * dx + dz * dz, r2 = w.r * w.r;
  if (dy > 0 || !w.run) { const d2 = (h2 + dy * dy * (dy > 0 ? 3 : 1)) / r2; return d2 > 9 ? 0 : Math.exp(-d2); }
  const t = -dy / w.run; if (t > 0.7) return 0;
  // 伤口那一团往下坠一点、收窄；再往下的淌痕是一道道的（prepareLayers 里按水平位置分条）
  const width = w.r * (1 - 0.55 * smooth(0, 0.45, t)), d2 = h2 / (width * width);
  return d2 > 9 ? 0 : Math.exp(-d2) * (1 - smooth(0.15, 0.6, t));
}

/** 肤色有多像（0–1）：偏红、绿比蓝高、不太暗——金发、棕发、粉衬衫、卡其裤都不算。纯函数 */
export function skinness(r, g, b) {
  const rg = r - g, gb = g - b;
  return smooth(85, 120, r) * smooth(10, 24, rg) * smooth(-0.15, 0.25, (rg - gb) / (rg + 1)) * smooth(-14, -2, gb) * (1 - smooth(85, 120, rg));
}

/**
 * 每个模型的共用图层（尺寸 S×S，各外观的颜色图和共用的法线、粗糙度图都从这里出）。
 * src：原贴图缩到 S 的 RGBA；body：rasterBody；plan：planWounds；tables：{ n, a, b } 两张 noiseTable。
 * 生成器：每 PAINT.chunk 格左右 yield 一次，最后 return 图层。
 * 图层（都是 0–255）：part（PART 编号）、skin（像皮肤的程度）、y（高度，每格 1 厘米）、front（朝前的程度）、fresh（血量：越大越湿越深）、
 * tear（撕口：0.5 以上是破洞，往外一圈是毛边）、grime（脏）、eye（眼窝）、lips（嘴唇）、vein（血管）、mottle（斑驳）、bruise（淤青）、hand（手）。
 */
export function* prepareLayers(src, S, body, plan, tables) {
  const n = S * S, { L, used, pos, nrm } = body, k = L / S, every = rowsPer(S);
  const mk = () => new Uint8Array(n);
  const layers = { S, part: mk(), skin: mk(), y: mk(), front: mk(), fresh: mk(), mouth: mk(), clawF: mk(), clawB: mk(), d1: mk(), d2: mk(), d3: mk(), tear: mk(), grime: mk(), eye: mk(), lips: mk(), vein: mk(), mottle: mk(), bruise: mk(), hand: mk(), plan, skinLum: 160 };
  // 低频三维噪声先在小网格上算好（每格一次），画的时候双线性取
  const lowA = new Float32Array(L * L), lowB = new Float32Array(L * L);
  for (let q = 0; q < L * L; q++) {
    if (!used[q]) continue;
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    lowA[q] = fbm3(x * 9, y * 9, z * 9, 11, 3); lowB[q] = fbm3(x * 4.2 + 7, y * 4.2, z * 4.2, 29, 3);
    if ((q & 1023) === 1023) yield;
  }
  const { fresh: wounds0, mouth, claws: clawSets, eyes, frame } = plan, T = frame.top, cx = frame.cx;
  const wounds = wounds0, nw = wounds.length;
  const reach = wounds.map((w) => [w.y - w.run - 0.02, w.y + w.r * 2.2, w.r * w.r * 2.6]); // 每处伤口管到的高度范围（之外直接跳过）
  const NT = tables.n, tA = tables.a, tB = tables.b, ts = NT / S; // 贴图空间的细噪声：S 越大，噪声表铺得越密，几档贴图上的细节一样大
  const clawK = clawSets.map((c) => [Math.cos(c.angle), Math.sin(c.angle), c.r * c.r * 2.5]);

  const e0 = eyes[0], e1 = eyes[1];
  let skinSum = 0, skinN = 0;
  // 逐行的活放进普通函数（生成器里的浮点临时变量 V8 优化得不好，会大量装箱、频繁垃圾回收，一段拖到几十毫秒）
  const rows = (j0, step) => {
  let sum = 0, cnt = 0;
  for (let j = j0; j < S; j += step) {
    const fy = (j + 0.5) * k - 0.5, yy = Math.floor(fy), y0 = Math.max(0, Math.min(L - 1, yy)), y1 = Math.min(L - 1, Math.max(0, yy + 1)), ty = fy - yy;
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
      const nz = (nrm[q00 * 3 + 2] * w00 + nrm[q10 * 3 + 2] * w10 + nrm[q01 * 3 + 2] * w01 + nrm[q11 * 3 + 2] * w11) * iw;
      const a = (lowA[q00] * w00 + lowA[q10] * w10 + lowA[q01] * w01 + lowA[q11] * w11) * iw;
      const b = (lowB[q00] * w00 + lowB[q10] * w10 + lowB[q01] * w01 + lowB[q11] * w11) * iw;
      const u = i * ts, v = j * ts, h1 = tap(tA, NT, u * 2, v * 2), h2 = tap(tB, NT, u * 4, v * 4), h3 = tap(tA, NT, u * 8 + 31, v * 8 + 17);
      const r = src[si], g = src[si + 1], bl = src[si + 2], al = src[si + 3];
      // 上色时各外观都要用的三档细噪声，先存下来（每张颜色图少取三次噪声表）
      layers.d1[o] = tap(tA, NT, u * 3 + 7, v * 3 + 3) * 255; layers.d2[o] = tap(tB, NT, u * 11, v * 11) * 255; layers.d3[o] = tap(tA, NT, u * 24 + 5, v * 24 + 9) * 255;
      // 哪一块：头发（贴图带透明的那片）、皮肤（看颜色）、鞋（脚下又不是皮肤）、其余是衣服
      const sk = al < 250 ? 0 : skinness(r, g, bl);
      const head = py > T - 0.27 && Math.abs(px - cx) < 0.13;
      let part = PART.cloth;
      if (al < 250) part = PART.hair;
      else if (sk > 0.5) part = PART.skin;
      else if (head) part = PART.hair; // 头上不像皮肤的：头发、眉毛
      else if (py < 0.13) part = PART.shoe;
      if (part === PART.skin) { sum += 0.2126 * r + 0.7152 * g + 0.0722 * bl; cnt++; }
      layers.part[o] = part; layers.skin[o] = sk * 255; layers.y[o] = Math.min(255, py * 100); layers.front[o] = clamp01(nz * 0.5 + 0.5) * 255;
      // 血：几处伤口 + 嘴角往下（嘴只淌在朝前的面上）；边缘用三维低频噪声和贴图细噪声揉毛，伤口下方再挂几道细的血道子
      let f = 0;
      // 往下淌的血按水平位置分条：粗的一两厘米宽，细的几毫米，每条长短不一
      const dq = px + pz * 0.7, run = tap(tB, NT, dq * 540, 3.7), runLen = tap(tA, NT, dq * 700 + 40, 9.1), drip = tap(tB, NT, dq * 1700 + 90, 21.3), dripLen = tap(tA, NT, dq * 1900, 33.3);
      for (let w = 0; w < nw; w++) {
        const R = reach[w]; if (py < R[0] || py > R[1]) continue;
        const W = wounds[w], hx = px - W.x, hz = pz - W.z, hh = hx * hx + hz * hz; if (hh > R[2] * 3) continue;
        let s = soak(px, py, pz, W) * W.wet;
        // 淌痕：只在伤口正下方，越往下越少；粗的那几道颜色深，细的血道子浅一点
        const dy = W.y - py;
        if (dy > 0 && hh < R[2]) {
          const fall = 1 - Math.sqrt(hh / R[2]) * 0.6;
          if (run > 0.6) { const len = W.run * (0.3 + runLen * 0.8) * fall; if (dy < len) s = Math.max(s, 0.72 * smooth(0.6, 0.7, run) * (1 - smooth(len * 0.6, len, dy) * 0.55)); }
          if (drip > 0.7) { const len = W.run * (0.4 + dripLen * 0.9) * fall; if (dy < len) s = Math.max(s, 0.6 * smooth(0.7, 0.78, drip) * (1 - smooth(len * 0.7, len, dy) * 0.4)); }
        }
        if (s > f) f = s;
      }
      // 边缘：大的起伏（三维低频）决定轮廓，细噪声把边撕碎——布料吸血是顺着纤维毛毛糙糙洇开的
      if (f > 0) f += ((a - 0.5) * 0.6 + (h1 - 0.5) * 0.3 + (h2 - 0.5) * 0.34 + (h3 - 0.5) * 0.26) * smooth(0.02, 0.2, f);
      // 嘴：嘴角和下巴糊一片，再顺着下巴、脖子挂下几道到胸口（只在朝前的那半边）
      const mx = px - mouth.x, my = py - mouth.y;
      if (my < 0.03 && my > -mouth.run && pz > mouth.z - 0.09 && Math.abs(mx) < 0.06) {
        const down = -my, cw = 0.017 * (1 - 0.4 * smooth(0, 0.05, down)), side = mx * (mouth.x > 0 ? 1 : -1); // 偏一边嘴角淌得多
        let m = Math.exp(-((mx / 0.022) ** 2 + ((my + 0.009) / 0.011) ** 2)) * (0.45 + h2 * 0.55); // 嘴边糊的不是一整片，主要在下唇和下巴
        if (down > 0) m = Math.max(m, Math.exp(-(((mx - side * 0.15) / cw) ** 2)) * (1 - smooth(0.02, 0.06, down)) * 0.9);
        m += ((h2 - 0.5) * 0.45 + (h3 - 0.5) * 0.25) * smooth(0.05, 0.3, m);
        const md = tap(tB, NT, mx * 300 + 11, 1.3), ml = tap(tA, NT, mx * 47, 5.5);
        if (down > 0.01 && Math.abs(mx) < 0.03 && md > 0.6 && down < mouth.run * (0.25 + ml)) m = Math.max(m, 0.7 * smooth(0.6, 0.68, md) * (1 - smooth(0.2, 1, down / mouth.run) * 0.4));
        m *= smooth(-0.6, -0.2, nz);
        layers.mouth[o] = clamp01(m) * 255;
        if (m > f) f = m;
      }
      layers.fresh[o] = clamp01(f) * 255;
      // 撕口：衣服上零星的破口（共用）；胸前、背后两组抓痕（三道，长短、宽窄不一，边缘撕得毛糙）各存一层，外观自己挑
      if (part === PART.cloth) {
        layers.tear[o] = smooth(0.76, 0.86, b * 0.5 + a * 0.5 + (h2 - 0.5) * 0.3) * (py < T * 0.62 ? 1 : 0.6) * 255;
        for (let q = 0; q < 2; q++) {
          const C = clawSets[q], K = clawK[q], dx = px - C.x, dy = py - C.y, dz = pz - C.z;
          if (dx * dx + dy * dy + dz * dz > K[2]) continue;
          const hu = dx + dz * 0.4, along = hu * K[0] + dy * K[1], across = -hu * K[1] + dy * K[0];
          let tear = 0;
          for (let c = -1; c <= 1; c++) {
            // 三道长短不一、略弯、不完全平行；宽窄随细噪声抖
            const half = C.r * (0.72 + 0.25 * c * c - 0.14 * c), lenT = 1 - smooth(half * 0.4, half, Math.abs(along + c * 0.014));
            const off = across - c * C.gap * (1 + 0.15 * c) - along * 0.1 * c - along * along * 2.2, wid = (0.004 + (h2 - 0.5) * 0.007 + (h3 - 0.5) * 0.004) * lenT;
            if (wid > 0) tear = Math.max(tear, lenT * (1 - smooth(wid * 0.5, wid * 1.8, Math.abs(off))));
          }
          (q ? layers.clawB : layers.clawF)[o] = clamp01(tear) * 255;
        }
      }

      // 污垢：越靠近地面越脏（膝盖往下一路加重），再叠低频的大块
      const low = 1 - smooth(0.05, 1.05, py);
      layers.grime[o] = clamp01(low * low * 0.85 + (b - 0.45) * 0.6 + (h2 - 0.5) * 0.3) * 255;
      // 眼窝、嘴唇（按三维位置；脸以外都是 0）
      if (head && al === 255) {
        const ax = px - e0.x, bx = px - e1.x, ey = (py - e0.y) * 1.2 + 0.005, ez = pz - e0.z;
        const d = Math.sqrt(Math.min(ax * ax, bx * bx) + ey * ey + ez * ez);
        layers.eye[o] = (1 - smooth(0.012, 0.032, d)) * 255;
        const lx = (px - mouth.x) / 0.026, ly = (py - (mouth.y + 0.002)) / 0.0105;
        layers.lips[o] = nz > 0 ? (1 - smooth(0.7, 1.15, Math.sqrt(lx * lx + ly * ly))) * 255 : 0;
      }
      // 皮肤：血管（贴图细噪声的「零线」——一条条细纹，只在脖子、太阳穴、前臂和伤口附近），斑驳、淤青
      if (part === PART.skin) {
        const ridge = 1 - Math.abs(h3 * 2 - 1);
        const near = Math.max(Math.min(1, f * 1.6), py > T - 0.36 && py < T - 0.14 ? 0.75 : 0, Math.abs(px - cx) > 0.17 && py > T * 0.38 ? 0.55 : 0) * smooth(0.35, 0.65, b + (a - 0.5) * 0.6);
        layers.vein[o] = smooth(0.9, 0.975, ridge) * near * 255;
        layers.mottle[o] = clamp01(a * 1.3 - 0.15 + (h1 - 0.5) * 0.3) * 255;
        // 淤青，再加上脸上凹下去的地方（眼下、颧骨下面）发暗——脸看着是塌的
        let hollow = 0;
        if (head) for (let c = -1; c <= 1; c += 2) { const hx = px - (e0.x + e1.x) / 2 - c * 0.048, hy = py - (e0.y - 0.048), hz = pz - (e0.z - 0.02); hollow = Math.max(hollow, 1 - smooth(0.006, 0.03, Math.sqrt(hx * hx + hy * hy * 1.6 + hz * hz))); }
        layers.bruise[o] = Math.max(smooth(0.62, 0.78, b + (h2 - 0.5) * 0.16), hollow * 0.8) * 230;
        layers.hand[o] = Math.abs(px - cx) > 0.16 && py < T * 0.55 && py > T * 0.37 ? 255 : 0;
      }
    }
  }
  skinSum += sum; skinN += cnt;
  };
  // 行是隔着取的（第 c 段画第 c、c+段数、c+2×段数……行）：第一段就把脸、手、伤口各种情况都走一遍，
  // V8 优化时类型信息齐全，后面不会一碰到新分支就退回解释执行（那样一段会慢上几十倍）
  const chunks = Math.ceil(S / every);
  for (let c = 0; c < chunks; c++) { rows(c, chunks); yield; }
  if (skinN) layers.skinLum = skinSum / skinN;
  return layers;
}

/**
 * 各种外观怎么上色（颜色都是 sRGB 0–255）：
 *   skinA / skinB：皮肤斑驳的两种底色（灰绿 ↔ 灰紫），按三维低频噪声在两者之间过渡；skinKeep：留多少原贴图的明暗细节；
 *   veins / bruise：血管、淤青有多重；blood：旧血洇开得多大（湿血的位置各外观一样）；grime：多脏；rips：撕口多不多；stains：额外的旧血块数；
 *   fluid：嘴里淌出来的是什么（血 / 喷酸者的黄绿涎水）；bloodTint：血染上去乘的颜色（尖叫者发黑、巨尸更红）；
 *   claws：抓痕画哪组（1 胸前、2 背后、3 两组都画）；back：背上放不放一大块旧血（位置各外观自己随机）；
 *   acid（喷酸者的酸蚀斑）、lesion（巨尸的烂疮）、soot（扑袭者的一身黑灰）、pustule（胖尸的脓疱）：特殊感染者各自的标记。
 */
export const LOOKS = Object.freeze({
  // 三套普通的：灰绿、发青发灰、蜡黄
  walker: Object.freeze([
    Object.freeze({ claws: 1, back: 1, skinA: [104, 112, 92], skinB: [100, 92, 98], skinKeep: 0.7, veins: 0.6, bruise: 0.6, blood: 1, grime: 0.8, rips: 1, stains: 3 }),
    Object.freeze({ claws: 2, back: 0, skinA: [100, 105, 99], skinB: [96, 88, 94], skinKeep: 0.65, veins: 0.75, bruise: 0.8, blood: 0.85, grime: 0.7, rips: 0.8, stains: 2 }),
    Object.freeze({ claws: 3, back: 1, skinA: [120, 112, 86], skinB: [104, 94, 88], skinKeep: 0.75, veins: 0.5, bruise: 0.5, blood: 1.25, grime: 0.9, rips: 1.2, stains: 5 }),
  ]),
  pale: Object.freeze({ claws: 2, back: 0, skinA: [176, 178, 172], skinB: [150, 146, 156], skinKeep: 0.55, veins: 1.25, bruise: 0.3, blood: 0.5, grime: 0.45, rips: 0.8, stains: 1, bloodTint: [0.32, 0.2, 0.22] }),
  lunger: Object.freeze({ claws: 3, back: 1, skinA: [76, 76, 78], skinB: [66, 60, 66], skinKeep: 0.6, veins: 0.5, bruise: 0.3, blood: 1, grime: 1, rips: 1.6, stains: 4, soot: 0.6 }),
  spitter: Object.freeze({ claws: 1, back: 0, skinA: [158, 150, 76], skinB: [122, 136, 66], skinKeep: 0.65, veins: 0.65, bruise: 0.3, blood: 0.6, grime: 0.7, rips: 1, stains: 2, fluid: [0.72, 0.8, 0.2], acid: 1 }),
  brute: Object.freeze({ claws: 3, back: 1, skinA: [110, 64, 56], skinB: [88, 54, 58], skinKeep: 0.65, veins: 0.6, bruise: 0.4, blood: 1.6, grime: 0.8, rips: 1.4, stains: 6, lesion: 1, bloodTint: [0.5, 0.06, 0.05] }),
  bloater: Object.freeze({ claws: 0, back: 1, skinA: [124, 134, 96], skinB: [98, 82, 106], skinKeep: 0.6, veins: 1.2, bruise: 0.85, blood: 0.9, grime: 0.8, rips: 1.3, stains: 4, pustule: 1 }),
});

/** 每种外观的旧血块，先在小网格上算好「血量」（各外观不一样，所以不进共用的粗糙度图）。纯函数 */
export function stainField(body, stains) {
  const { L, used, pos } = body, out = new Float32Array(L * L);
  for (let q = 0; q < L * L; q++) {
    if (!used[q]) continue;
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    let s = 0; for (let i = 0; i < stains.length; i++) { const v = soak(x, y, z, stains[i]); if (v > s) s = v; }
    out[q] = s;
  }
  return out;
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// 血染布、染皮肤是「乘」上去的（底下的条纹、褶子还透得出来）：湿的发黑发红，干的发褐
const WET = [0.36, 0.07, 0.06], DRY = [0.52, 0.36, 0.28];

/**
 * 画一张外观的颜色图。src：原贴图（S×S RGBA）；layers：prepareLayers 的结果；look：LOOKS 里的一套；tone：衣服的色调
 * （zombie-skin.js 的 [R, G, B, 保留原色]）；stain：stainField（小网格）；body：rasterBody；out：S×S RGBA（写进去）。生成器，按行 yield。
 */
export function* paintColour(src, layers, look, tone, stain, body, out) {
  const S = layers.S, { L } = body, k = L / S, every = rowsPer(S);
  const [tr, tg, tb, keep] = tone, G = PAINT.grime, U = PAINT.dust, R = PAINT.rip;
  const wet = look.bloodTint || WET, fluid = look.fluid || null, spread = look.blood, soot = look.soot || 0;
  // 旧血的颜色：一般是褐的；尖叫者、巨尸跟着各自的血色；胖尸身上洇开的多是发黄的脓水
  const dry = look.pustule ? [0.72, 0.64, 0.36] : look.bloodTint ? [wet[0] * 1.3, wet[1] * 1.3, wet[2] * 1.3] : DRY;
  const A = look.skinA, B = look.skinB, sKeep = look.skinKeep, skinRef = layers.skinLum, mouthTop = layers.plan.frame.top - 0.5;
  const { d1, d2, d3, part, skin: skinL, mouth: mouthL, clawF, clawB, y: yL, fresh: fr, tear: te, grime: gr, eye, lips, vein, mottle, bruise, hand, front } = layers;
  const rows = (j0, step) => { // 同 prepareLayers：逐行的活放进普通函数，行隔着取
  for (let j = j0; j < S; j += step) {
    const fy = (j + 0.5) * k - 0.5, yy = Math.floor(fy), y0 = Math.max(0, Math.min(L - 1, yy)), y1 = Math.min(L - 1, Math.max(0, yy + 1)), ty = fy - yy;
    for (let i = 0; i < S; i++) {
      const o = j * S + i, si = o * 4, p = part[o];
      let r = src[si], g = src[si + 1], b = src[si + 2]; const al = src[si + 3];
      if (p === PART.none || (j >= S / 2 && al === 255 && r > 235 && g > 235 && b > 235)) {
        // 没用到的地方：压成暗色；下半张（头发那一片）连透明度一起清掉，免得远处取到低级 mipmap 时头发边上泛白
        out[si] = r * 0.15; out[si + 1] = g * 0.15; out[si + 2] = b * 0.15; out[si + 3] = j >= S / 2 ? 0 : al;
        continue;
      }
      const fx = (i + 0.5) * k - 0.5, xx = Math.floor(fx), x0 = Math.max(0, Math.min(L - 1, xx)), x1 = Math.min(L - 1, Math.max(0, xx + 1)), tx = fx - xx;
      const st = (stain[y0 * L + x0] * (1 - tx) + stain[y0 * L + x1] * tx) * (1 - ty) + (stain[y1 * L + x0] * (1 - tx) + stain[y1 * L + x1] * tx) * ty;
      const n1 = d1[o] / 255, n2 = d2[o] / 255, n3 = d3[o] / 255;
      const yM = yL[o] / 100, fresh = fr[o] / 255, grime = gr[o] / 255;
      const tear = Math.max(te[o] / 255 * Math.min(1.6, look.rips), clawF[o] / 255 * (look.claws & 1), clawB[o] / 255 * ((look.claws >> 1) & 1));
      const l0 = lum(r, g, b), isSkin = p === PART.skin || (skinL[o] > 90 && p !== PART.hair);
      if (isSkin) {
        // 皮肤：原贴图的明暗留一部分（毛孔、五官的起伏），颜色换成灰绿 ↔ 灰紫的斑驳
        const m = mottle[o] / 255, d = Math.min(1.12, Math.max(0.5, Math.pow(Math.max(0.05, l0 / skinRef), sKeep))); // 脸比四肢亮得多，压一压，免得脸一片白
        const sh = d * (1.08 - 0.22 * m); // 斑驳也带明暗：发紫的那几块更暗
        r = mix(A[0], B[0], m) * sh; g = mix(A[1], B[1], m) * sh; b = mix(A[2], B[2], m) * sh;
        const bz = (bruise[o] / 255) * look.bruise; // 淤青：暗紫褐
        if (bz > 0) { r = mix(r, r * 0.62 + 6, bz * 0.75); g = mix(g, g * 0.5, bz * 0.75); b = mix(b, b * 0.7 + 8, bz * 0.75); }
        const vn = Math.min(1, (vein[o] / 255) * look.veins); // 血管：发青发紫的细纹
        if (vn > 0) { r = mix(r, r * 0.42, vn * 0.8); g = mix(g, g * 0.42, vn * 0.8); b = mix(b, b * 0.62, vn * 0.8); }
        if (look.lesion) { // 巨尸的烂疮：一块块发亮的鲜红，边上一圈发黑
          const ls = n2 * 0.6 + m * 0.4;
          const core = smooth(0.64, 0.7, ls), rim = smooth(0.56, 0.64, ls) - core;
          r = mix(r, 150 + n3 * 30, core); g = mix(g, 52, core); b = mix(b, 48, core); r *= 1 - rim * 0.5; g *= 1 - rim * 0.55; b *= 1 - rim * 0.5;
        }
        if (look.pustule) { // 胖尸的脓疱：一粒粒发黄的小鼓包，边上发红
          const core = smooth(0.84, 0.88, n3), rim = smooth(0.76, 0.84, n3) - core;
          r = mix(r, 176, core); g = mix(g, 164, core); b = mix(b, 86, core); r = mix(r, 112, rim * 0.5); g *= 1 - rim * 0.3; b *= 1 - rim * 0.25;
        }
        const e = eye[o] / 255; // 眼窝：深陷发黑，边上一圈发红
        if (e > 0) { const rim = e * (1 - e) * 4; r = mix(r, 84, rim * 0.3); g = mix(g, 40, rim * 0.3); b = mix(b, 46, rim * 0.3); const e2 = e * e * 0.95; r = mix(r, 18, e2); g = mix(g, 12, e2); b = mix(b, 15, e2); }
        const lp = lips[o] / 255; // 嘴唇：发黑发紫，干裂（细噪声的亮纹）
        if (lp > 0) { const crack = smooth(0.62, 0.7, n3) * 0.3; r = mix(r, 40 + crack * 50, lp * 0.9); g = mix(g, 18 + crack * 34, lp * 0.9); b = mix(b, 22 + crack * 34, lp * 0.9); }
        const hd = hand[o] / 255; // 手：一层黑泥，指头那一截还带着干血
        if (hd > 0) {
          const dirt = hd * smooth(0.3, 0.7, n1 * 0.7 + (1 - yM) * 0.6) * 0.7;
          r = mix(r, r * 0.5, dirt); g = mix(g, g * 0.45, dirt); b = mix(b, b * 0.4, dirt);
          const bl = hd * smooth(0.45, 0.55, n2 * 0.6 + (0.98 - yM) * 1.1) * 0.9;
          r = mix(r, r * DRY[0], bl); g = mix(g, g * DRY[1] * 0.8, bl); b = mix(b, b * DRY[2] * 0.8, bl);
        }
        // 皮肤也跟着脏（脚踝、小腿），扑袭者一身黑灰
        const gk = Math.min(1, grime * look.grime * 0.55 + soot * 0.3); r = mix(r, r * G[0] / 110, gk); g = mix(g, g * G[1] / 110, gk); b = mix(b, b * G[2] / 110, gk);
      } else {
        // 衣服、头发、鞋：去色上色调，再一层脏
        const hair = p === PART.hair, shoe = p === PART.shoe, kp = keep * (hair ? 0.6 : 1);
        const dark = hair ? 0.5 : 1; // 头发油腻打绺、发暗
        r = Math.min(255, (l0 + (r - l0) * kp) * tr * dark); g = Math.min(255, (l0 + (g - l0) * kp) * tg * dark); b = Math.min(255, (l0 + (b - l0) * kp) * tb * dark);
        // 脏：底下发褐发黑，往上是一块块的；膝盖、裤脚上再蒙一层灰土
        const gk = Math.min(1, grime * look.grime * (shoe ? 1.3 : 1) + soot * 0.45);
        const dm = gk * 0.85; r = mix(r, r * G[0] / 96, dm); g = mix(g, g * G[1] / 96, dm); b = mix(b, b * G[2] / 96, dm);
        const dust = smooth(0.55, 0.78, gk * 0.7 + n1 * 0.5) * (1 - smooth(0.15, 0.6, yM)) * (1 - soot) * (shoe ? 0.5 : 1);
        r = mix(r, U[0], dust * 0.35); g = mix(g, U[1], dust * 0.35); b = mix(b, U[2], dust * 0.35);
        if (soot) { const sm = soot * (0.55 + n1 * 0.45); r *= 1 - sm; g *= 1 - sm; b *= 1 - sm * 0.95; }
        if (look.acid && !hair) { // 喷酸者：衣服上一块块被酸烧过——褪色发黄，边缘焦黑
          const ac = n1 * 0.55 + n2 * 0.45 + (yM > 1.0 ? 0.06 : -0.1);
          const core = smooth(0.68, 0.72, ac), rim = smooth(0.62, 0.68, ac) - core;
          r = mix(r, 138, core * 0.75); g = mix(g, 128, core * 0.75); b = mix(b, 64, core * 0.75); r *= 1 - rim * 0.65; g *= 1 - rim * 0.65; b *= 1 - rim * 0.7;
        }
        // 撕口：里面是暗的（看进去是皮肉和阴影），边上一圈毛边稍亮
        const t = tear;
        if (t > 0.25) {
          const hole = smooth(0.5, 0.6, t + (n3 - 0.5) * 0.25), fray = (smooth(0.25, 0.5, t + (n3 - 0.5) * 0.3) - hole) * 0.55;
          r = mix(r, Math.min(255, r * 1.2 + 14), fray); g = mix(g, Math.min(255, g * 1.18 + 12), fray); b = mix(b, Math.min(255, b * 1.14 + 10), fray);
          r = mix(r, R[0] + n2 * 30, hole); g = mix(g, R[1] + n2 * 8, hole); b = mix(b, R[2] + n2 * 6, hole);
          const smear = fray * 0.8 * smooth(0.3, 0.7, n1); // 抓破的地方边上沾着血
          r = mix(r, r * DRY[0], smear); g = mix(g, g * DRY[1], smear); b = mix(b, b * DRY[2], smear);
        }
      }
      // 血（乘上去）：最外一圈和这套外观自己的几块是干了的褐色，往里是暗红，中心湿得发黑（湿的那块各外观同一处，和共用的粗糙度对上）
      const hairK = p === PART.hair ? 0.7 : 1;
      const dpot = Math.max(fresh * (0.75 + 0.35 * spread), st * spread + (n1 - 0.5) * 0.3 * Math.min(1, st * 4));
      const dpn = dpot + (n2 - 0.5) * 0.16 + (n3 - 0.5) * 0.08;
      const dcov = smooth(0.38, 0.47, dpn) * hairK * (0.72 + n1 * 0.28);
      if (dcov > 0) {
        // 干血洇开的外沿有一圈更深的「水线」，里面反而淡一点——像真的血渍
        const tide = 1 + 0.2 * (smooth(0.38, 0.43, dpn) - smooth(0.43, 0.5, dpn)) * n3 * 2;
        r = mix(r, r * dry[0] / tide, dcov); g = mix(g, g * dry[1] / tide, dcov); b = mix(b, b * dry[2] / tide, dcov);
      }
      const drop = smooth(0.84, 0.88, n3) * smooth(0.1, 0.3, Math.max(fresh, st)) * (1 - dcov) * Math.min(1, spread);
      if (drop > 0) { r = mix(r, r * wet[0], drop); g = mix(g, g * wet[1], drop); b = mix(b, b * wet[2], drop); }
      const fcov = smooth(0.48, 0.56, fresh) * hairK;
      if (fcov > 0) {
        const mf = fluid && mouthL[o] >= fr[o]; // 喷酸者嘴里淌的是涎水
        const c = mf ? fluid : wet, deep = smooth(0.6, 0.85, fresh) * (yM > mouthTop + 0.3 ? 0.15 : 0.5);
        if (isSkin && !mf) { // 皮肤上的血是红的一层（皮肤本来就浅，乘上去会发黑）
          const dk = 1 - deep * 0.5; r = mix(r, (64 + n2 * 22) * dk, fcov); g = mix(g, (9 + n2 * 4) * dk, fcov); b = mix(b, 8 * dk, fcov);
        } else { r = mix(r, r * c[0] * (1 - deep), fcov); g = mix(g, g * c[1] * (1 - deep), fcov); b = mix(b, b * c[2] * (1 - deep), fcov); }
        if (!mf) { r = mix(r, 56, fcov * deep * 0.7); g = mix(g, 6, fcov * deep * 0.7); b = mix(b, 6, fcov * deep * 0.7); }
      }
      const lp2 = isSkin ? lips[o] / 255 : 0; // 嘴唇压在血上面：发黑、干裂，不是一抹红
      if (lp2 > 0) { r = mix(r, 34, lp2 * 0.55); g = mix(g, 14, lp2 * 0.55); b = mix(b, 16, lp2 * 0.55); }
      out[si] = r; out[si + 1] = g; out[si + 2] = b; out[si + 3] = al;
    }
  }
  };
  const chunks = Math.ceil(S / every);
  for (let c = 0; c < chunks; c++) { rows(c, chunks); yield; }
}

/**
 * 每个模型共用的法线图和粗糙度图（尺寸 S/2）：起伏从原贴图的明暗来（衣服的褶子、布纹），再加撕口的凹陷、血痂的边、血管；
 * 粗糙度：湿血亮、皮肤有点蜡、布料哑光。nrmOut / roughOut：(S/2)² RGBA。生成器
 */
export function* paintSurface(src, layers, tables, nrmOut, roughOut) {
  const S = layers.S, H = S >> 1, NT = tables.n, tA = tables.a, ts = NT / H, Rg = PAINT.rough, every = rowsPer(H);
  const height = new Float32Array(H * H);
  for (let j0 = 0; j0 < H; j0 += every) {
  ((j1) => { for (let j = j0; j < j1; j++) {
    for (let i = 0; i < H; i++) {
      const o = (j * 2) * S + i * 2, o2 = o + 1, o3 = o + S, o4 = o + S + 1, h = j * H + i;
      let l = 0; for (const q of [o, o2, o3, o4]) l += lum(src[q * 4], src[q * 4 + 1], src[q * 4 + 2]);
      l /= 4 * 255;
      const p = layers.part[o], fresh = layers.fresh[o] / 255, tear = layers.tear[o] / 255;
      const weave = tap(tA, NT, i * ts * 16, j * ts * 16);
      let z = p === PART.skin ? l * 0.35 + layers.vein[o] / 255 * 0.12 : l * 0.75 + (p === PART.cloth ? (weave - 0.5) * 0.08 : 0);
      z -= smooth(0.5, 0.58, tear) * 0.35; // 撕口往里凹
      z += smooth(0.46, 0.52, fresh) * 0.025; // 血干了结成一层痂，边上微微鼓起
      height[h] = z;
      // 粗糙度
      const base = p === PART.skin ? Rg.skin : p === PART.hair ? Rg.hair : p === PART.shoe ? Rg.shoe : Rg.cloth;
      let rough = base + (weave - 0.5) * 0.06;
      rough = mix(rough, Rg.rip, smooth(0.5, 0.58, tear));
      rough = mix(rough, Rg.dried, smooth(0.4, 0.5, fresh) * 0.6);
      rough = mix(rough, mix(0.5, Rg.fresh, smooth(0.62, 0.85, fresh) * (1 - layers.mouth[o] / 400)), smooth(0.5, 0.6, fresh)); // 只有血最厚的中心是湿亮的（嘴边的半干，不反光得像口红）
      const rv = clamp01(rough) * 255, ro = h * 4;
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
