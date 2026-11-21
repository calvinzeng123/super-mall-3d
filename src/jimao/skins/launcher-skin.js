// G40 榴弹枪的外形和表面（launcher.js 只管开火、换弹、摆位；这里管它长什么样）。
// 原来的模型是几根圆柱加几个方块、一个颜色到底——暗场里就是一坨黑加一坨棕。这里换成：
//   外形：车出来的枪管（膛口、箍、药室加厚段）、带圆顶的机匣、一整块胡桃木的枪托连握把、包着枪管下半的护木（带指槽）、
//         弯的扳机护圈和扳机、开闩扳把、铰链销、立起来的梯形表尺、带护耳的准星、背带环、橡胶托底、带底缘和底火的弹底；
//   表面：自己的两套贴图配方——胡桃木（细而直、顺着枪托长度方向的木纹，不是斑马纹）和烤蓝钢（很细的顺向抛光纹，没有麻点）；
//         磨损不画在贴图里（贴图是平铺的，画进去每隔一段就重复一次），而是按模型自己的棱角算出来存在顶点上，
//         着色器里再拿一张噪声去咬它的边——棱上、枪口、箍上磨得发亮，凹角里发暗，而且是一块一块的，不是给每条棱描白边。
// 所有几何的 UV 都是按真实尺寸算的（一格贴图对应多少米由 tile 定），所以各个部件上木纹、拉丝的粗细是一样的。
// 没有 document（测试环境）时不做贴图，材质是纯色的，几何照常生成。
import * as THREE from 'three';
import { noiseField, fbmField, heightToNormal, seeded, surface } from '../gun-surface.js';

const hasCanvas = () => typeof document !== 'undefined';
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const sstep = (a, b, x) => smooth((x - a) / (b - a));
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
/** 分段线性表 [[x, y], ...]（x 升序）在 x 处的值，两头夹住 */
export function pw(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (x <= table[i][0]) { const [x0, y0] = table[i - 1], [x1, y1] = table[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0 || 1); }
  return table[table.length - 1][1];
}

// ---------------------------------------------------------------- 贴图配方（纯计算）
/**
 * 胡桃木：木纹顺着 u（贴图的横向）。返回 { color（每像素 r g b，0–255）, height, rough, mask（磨损用的噪声）}，都是 0–1 / 0–255。
 * 上一版的毛病是年轮用 sin 画，一圈一圈粗得像斑马；真的直纹胡桃木是：很细的深浅线（密度有宽有窄）、
 * 几道深色的矿物线、顺纹的棕眼（一小段一小段的细黑道，成片出现在浅色的早材里）。
 * 木纹不是笔直的尺子线：取色带时沿 v 方向挪几个像素（warp），线就有一点缓缓的起伏。
 */
export function walnut(size, seed = 1) {
  const S = size, n = S * S, r = seeded(seed + 17);
  const warp = noiseField(S, 2, 3, seed), band = fbmField(S, 1, 9, 3, seed + 3, 0.62), line = noiseField(S, 2, Math.max(4, S >> 2), seed + 5), hair = noiseField(S, 3, Math.max(4, S >> 1), seed + 6);
  const streak = noiseField(S, 1, 5, seed + 11), tone = noiseField(S, 2, 3, seed + 9), sheen = noiseField(S, 3, 5, seed + 13), mask = fbmField(S, 6, 14, 3, seed + 21, 0.66);
  const color = new Float32Array(n * 3), height = new Float32Array(n), rough = new Float32Array(n), early = new Float32Array(n);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const fy = y + (warp[i] - 0.5) * S * 0.09 + S, y0 = Math.floor(fy), t = fy - y0, a = (y0 % S) * S + x, b = ((y0 + 1) % S) * S + x;
    const ln = line[a] + (line[b] - line[a]) * t, bd = band[a] + (band[b] - band[a]) * t, hr = hair[a] + (hair[b] - hair[a]) * t, sk = streak[a] + (streak[b] - streak[a]) * t;
    const g = clamp01((bd * 0.62 + ln * 0.26 + hr * 0.12 - 0.5) * 1.7 + 0.5), d = sstep(0.6, 0.86, sk); // d：深色矿物线
    const lum = (0.62 + 0.72 * g) * (0.82 + 0.36 * tone[i]) * (1 - 0.42 * d);
    color[i * 3] = 54 * lum + 5 * g; color[i * 3 + 1] = 32 * lum + 4 * g - d; color[i * 3 + 2] = 20 * lum + 2 * g - d;
    height[i] = 0.5 + (ln - 0.5) * 0.2 + (hr - 0.5) * 0.14;
    rough[i] = clamp01(0.54 - (g - 0.5) * 0.1 + (sheen[i] - 0.5) * 0.22); early[i] = g;
  }
  // 棕眼：顺纹的短黑道，浅色（早材）的地方多
  for (let k = 0, count = Math.round(n / 46); k < count; k++) {
    const x0 = Math.floor(r() * S), y0 = Math.floor(r() * S), len = 2 + Math.floor(r() * S / 36), deep = 0.74 + r() * 0.16;
    if (early[y0 * S + x0] < r() * 0.75) continue;
    for (let e = 0; e < len; e++) { const i = y0 * S + ((x0 + e) % S), f = Math.sin((e + 0.5) / len * Math.PI), m = 1 - (1 - deep) * f; color[i * 3] *= m; color[i * 3 + 1] *= m; color[i * 3 + 2] *= m; height[i] -= 0.22 * f; rough[i] = clamp01(rough[i] + 0.1 * f); }
  }
  return { color, height, rough, mask };
}
/**
 * 烤蓝钢：蓝黑，颜色几乎是匀的（只有很缓的云状深浅和一点发褐的老化），顺着 u 的抛光纹极细，粗糙度有手摸过的那种缓缓的深浅——
 * 高光扫过去时有变化，靠的是这个而不是颗粒。上一版满面的麻点在暗场里是一片闪。几道很细的划痕。
 */
export function blued(size, seed = 1) {
  const S = size, n = S * S, r = seeded(seed + 31);
  const cloud = fbmField(S, 3, 3, 3, seed), brown = noiseField(S, 2, 3, seed + 2), brush = noiseField(S, 2, Math.max(4, S >> 1), seed + 3), brush2 = noiseField(S, 4, Math.max(4, S >> 2), seed + 4), smudge = fbmField(S, 4, 5, 2, seed + 9);
  const mask = fbmField(S, 7, 7, 4, seed + 21, 0.68);
  const color = new Float32Array(n * 3), height = new Float32Array(n), rough = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = brush[i] * 0.6 + brush2[i] * 0.4 - 0.5, c = cloud[i] - 0.5, v = 1 + c * 0.3 + b * 0.06, w = (brown[i] - 0.5) * 7;
    color[i * 3] = 41 * v + w; color[i * 3 + 1] = 45 * v + w * 0.4; color[i * 3 + 2] = 55 * v - w * 0.5;
    height[i] = 0.5 + b * 0.4; rough[i] = clamp01(0.38 + (smudge[i] - 0.5) * 0.26 + b * 0.04 + c * 0.06);
  }
  // 划痕：细、短、大多顺着长度方向，亮一点、滑一点
  for (let k = 0; k < 16; k++) {
    let x = r() * S, y = r() * S; const a = (r() - 0.5) * 0.5 + (r() < 0.2 ? 1.2 : 0), len = S * (0.03 + r() * 0.16), deep = 0.3 + r() * 0.7;
    for (let e = 0; e < len; e++) { x += Math.cos(a); y += Math.sin(a); const i = (((Math.round(y) % S) + S) % S) * S + (((Math.round(x) % S) + S) % S), f = deep * Math.sin(e / len * Math.PI); color[i * 3] += 30 * f; color[i * 3 + 1] += 31 * f; color[i * 3 + 2] += 33 * f; rough[i] = clamp01(rough[i] - 0.1 * f); height[i] -= 0.2 * f; }
  }
  return { color, height, rough, mask };
}

function canvasTexture(size, fill, srgb) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size); fill(img.data); g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/**
 * 配方的结果 → { map, normalMap, roughnessMap }。粗糙度贴图的 G、B 是粗糙度（three 读 G），R 通道塞的是磨损噪声（着色器里用）。
 * 没有画布时返回 null。
 */
export function textureSet(R, size, bump = 1) {
  if (!hasCanvas() || !R) return null;
  const n = size * size, normal = heightToNormal(R.height, size, bump);
  return {
    map: canvasTexture(size, (d) => { for (let i = 0; i < n; i++) { d[i * 4] = R.color[i * 3]; d[i * 4 + 1] = R.color[i * 3 + 1]; d[i * 4 + 2] = R.color[i * 3 + 2]; d[i * 4 + 3] = 255; } }, true),
    normalMap: canvasTexture(size, (d) => d.set(normal)),
    roughnessMap: canvasTexture(size, (d) => { for (let i = 0; i < n; i++) { const v = R.rough[i] * 255; d[i * 4] = (R.mask ? R.mask[i] : 0.5) * 255; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } }),
  };
}

// ---------------------------------------------------------------- 几何工具（纯计算）
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function rawGeo(pos, uv) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2)); return g; }
/**
 * 放样：rings 是一串截面，每个截面是同样多个点 [x, y, z]（首尾相接的一圈），相邻截面连成面。
 * UV：u 顺着放样方向、v 绕着截面，都按真实长度除以 tile（米）；uvOf(i, j) 可以自己给。swapUV：把 u、v 对调。
 * vRef：所有截面的 v 都照第 vRef 个截面的弧长算（截面一路变小的件，各算各的话纹路会斜着收拢）。
 * capStart / capEnd：两头封口（平的）。flip：面朝里（枪膛）。返回不带索引的几何（position、uv），法线由 finish() 算。
 */
export function loft(rings, { tileU = 0.1, tileV = tileU, capStart = false, capEnd = false, uvOf = null, swapUV = false, flip = false, vRef = -1 } = {}) {
  const m = rings.length, n = rings[0].length, pos = [], uv = [];
  const cen = rings.map((r) => { const c = [0, 0, 0]; for (const p of r) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return [c[0] / n, c[1] / n, c[2] / n]; });
  const us = [0]; for (let i = 1; i < m; i++) us[i] = us[i - 1] + dist3(cen[i], cen[i - 1]);
  const vs = rings.map((r) => { const a = [0]; for (let j = 1; j <= n; j++) a[j] = a[j - 1] + dist3(r[j % n], r[j - 1]); return a; });
  const UV = (i, j) => { const t = uvOf ? uvOf(i, j) : [us[i] / tileU, vs[vRef >= 0 ? vRef : i][j] / tileV]; return swapUV ? [t[1], t[0]] : t; };
  // 面朝哪边：所有面的法线和「从截面中心指向面」的方向比一比，多数朝外
  let out = 0;
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) {
    const a = rings[i][j], b = rings[i][(j + 1) % n], c = rings[i + 1][j];
    const nx = (c[1] - a[1]) * (b[2] - a[2]) - (c[2] - a[2]) * (b[1] - a[1]), ny = (c[2] - a[2]) * (b[0] - a[0]) - (c[0] - a[0]) * (b[2] - a[2]), nz = (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
    out += nx * (a[0] - cen[i][0]) + ny * (a[1] - cen[i][1]) + nz * (a[2] - cen[i][2]);
  }
  const rev = (out < 0) !== flip;
  const tri = (p, q, s, tp, tq, ts) => { if (rev) { pos.push(...p, ...s, ...q); uv.push(...tp, ...ts, ...tq); } else { pos.push(...p, ...q, ...s); uv.push(...tp, ...tq, ...ts); } };
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) {
    const j1 = (j + 1) % n, a = rings[i][j], b = rings[i][j1], c = rings[i + 1][j], d = rings[i + 1][j1];
    tri(a, c, b, UV(i, j), UV(i + 1, j), UV(i, j + 1)); tri(b, c, d, UV(i, j + 1), UV(i + 1, j), UV(i + 1, j + 1));
  }
  const cap = (i, toward) => {
    const c = cen[i], dir = [c[0] - cen[toward][0], c[1] - cen[toward][1], c[2] - cen[toward][2]], ax = Math.abs(dir[0]), ay = Math.abs(dir[1]), az = Math.abs(dir[2]);
    const flat = (p) => (az >= ax && az >= ay ? [p[0] / tileU, p[1] / tileU] : ay >= ax ? [p[0] / tileU, p[2] / tileU] : [p[2] / tileU, p[1] / tileU]);
    for (let j = 0; j < n; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % n];
      const nx = (a[1] - c[1]) * (b[2] - c[2]) - (a[2] - c[2]) * (b[1] - c[1]), ny = (a[2] - c[2]) * (b[0] - c[0]) - (a[0] - c[0]) * (b[2] - c[2]), nz = (a[0] - c[0]) * (b[1] - c[1]) - (a[1] - c[1]) * (b[0] - c[0]);
      if (((nx * dir[0] + ny * dir[1] + nz * dir[2]) < 0) !== flip) { pos.push(...c, ...b, ...a); uv.push(...flat(c), ...flat(b), ...flat(a)); } else { pos.push(...c, ...a, ...b); uv.push(...flat(c), ...flat(a), ...flat(b)); }
    }
  };
  if (capStart) cap(0, 1); if (capEnd) cap(m - 1, m - 2);
  return rawGeo(pos, uv);
}
/**
 * 车削：profile 是一串 [z, r]（沿着表面走的顺序），绕 z 轴转一圈。长的直段在两头各补一圈点——
 * 磨损、暗角是存在顶点上的，不补的话箍脚下那一点暗会一路渐变到十几厘米外。绕一圈的贴图重复整数次（不留接缝）。
 */
export function lathe(profile, { segs = 24, tileU = 0.1, tileV = tileU, refine = 0.003, flip = false } = {}) {
  const pr = [];
  for (let i = 0; i < profile.length; i++) {
    pr.push(profile[i]); if (!refine || i === profile.length - 1) continue;
    const [z0, r0] = profile[i], [z1, r1] = profile[i + 1], len = Math.hypot(z1 - z0, r1 - r0);
    if (len > refine * 2.6) { const t = refine / len; pr.push([z0 + (z1 - z0) * t, r0 + (r1 - r0) * t], [z1 - (z1 - z0) * t, r1 - (r1 - r0) * t]); }
  }
  let rMax = 0; for (const p of pr) rMax = Math.max(rMax, p[1]);
  const us = [0]; for (let i = 1; i < pr.length; i++) us[i] = us[i - 1] + Math.hypot(pr[i][0] - pr[i - 1][0], pr[i][1] - pr[i - 1][1]) / tileU;
  const turns = Math.max(1, Math.round(Math.PI * 2 * rMax / tileV));
  const rings = pr.map(([z, r]) => { const ring = []; for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2 - Math.PI / 2; ring.push([Math.cos(a) * r, Math.sin(a) * r, z]); } return ring; });
  return loft(rings, { uvOf: (i, j) => [us[i], j / segs * turns], flip });
}
/** 一条中线（[[a, b], ...]）加粗成一个封闭的二维轮廓；thick 可以是数，也可以是 (t 0–1) => 数 */
export function stripShape(line, thick) {
  const n = line.length, L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const p = line[Math.max(0, i - 1)], q = line[Math.min(n - 1, i + 1)], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, h = (typeof thick === 'function' ? thick(i / (n - 1)) : thick) / 2;
    L.push(new THREE.Vector2(line[i][0] - dy / l * h, line[i][1] + dx / l * h)); Rr.push(new THREE.Vector2(line[i][0] + dy / l * h, line[i][1] - dx / l * h));
  }
  return new THREE.Shape([...L, ...Rr.reverse()]);
}
/** 过几个点的光滑曲线，取 count 个点 */
export function curve2(points, count) { return new THREE.SplineCurve(points.map((p) => new THREE.Vector2(p[0], p[1]))).getPoints(count - 1).map((v) => [v.x, v.y]); }
/**
 * 把一个二维轮廓挤出厚度（带一圈倒角），再摆到枪的坐标里：
 *   plane 'side'：轮廓画在侧面（横 = z、竖 = y），厚度沿 x，以 x = 0 为中心；
 *   plane 'top' ：轮廓画在俯视（横 = x、竖 = −z），厚度沿 y，从 y = 0 往上；
 *   plane 'back'：轮廓画在后视（横 = x、竖 = y），厚度沿 z，以 z = 0 为中心。
 * 返回不带索引的几何（position、uv 按 tile 米一格）。
 */
export function extrude(shape, width, { bevel = 0.0006, plane = 'side', tile = 0.1, curveSegments = 6 } = {}) {
  const b = Math.min(bevel, width * 0.45), e = new THREE.ExtrudeGeometry(shape, { depth: width - b * 2, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments, steps: 1 });
  if (plane === 'side') e.translate(0, 0, -(width - b * 2) / 2).rotateY(-Math.PI / 2); else if (plane === 'top') e.translate(0, 0, b).rotateX(-Math.PI / 2); else e.translate(0, 0, -(width - b * 2) / 2);
  const uv = e.attributes.uv.array.slice(); for (let i = 0; i < uv.length; i++) uv[i] /= tile;
  const g = rawGeo(e.attributes.position.array, uv); e.dispose();
  return g;
}
/** three 自带的几何（圆环之类）→ 不带索引，UV 乘上 (su, sv) */
export function plain(geo, su = 1, sv = su) {
  const g = geo.index ? geo.toNonIndexed() : geo, uv = g.attributes.uv.array.slice(); for (let i = 0; i < uv.length; i += 2) { uv[i] *= su; uv[i + 1] *= sv; }
  const out = rawGeo(g.attributes.position.array, uv); if (g !== geo) g.dispose(); geo.dispose();
  return out;
}

/**
 * 给一个不带索引的几何算法线和「皮」：
 *   法线：同一个位置上、夹角在 crease（度）以内的面按角度加权平均——圆的地方圆，倒角和平面之间留一条清楚的棱；
 *   aSkin（每个顶点两个数）：x = 暗角（凹进去的棱角、藏污纳垢的地方，0–1），y = 磨损（凸出来的棱角，0–1）。
 *     棱角有多尖 = 1 − |这个位置上各个面的单位法线的平均|（平面是 0，直角棱约 0.29，方块的角约 0.42）；凸还是凹看别的面在不在这个面的背后。
 *     一整块大平面如果三个角都在棱上（挤出件的端面），插值出来会整面都算磨损——这种面只给三成。
 *   edge / occl：棱角换算成磨损、暗角时乘多少；extra(x, y, z, nx, ny, nz) 返回 [加多少磨损, 加多少暗角]（手常摸的地方、枪口之类）。
 * 返回几何本身。
 */
export function finish(geo, { crease = 40, edge = 0.6, occl = 0.8, extra = null } = {}) {
  const P = geo.attributes.position.array, V = P.length / 3, T = V / 3, fn = new Float32Array(T * 3), ang = new Float32Array(V), cenT = new Float32Array(T * 3), minH = new Float32Array(T);
  const ids = new Int32Array(V), map = new Map(), lists = [];
  for (let v = 0; v < V; v++) { const k = ((Math.round(P[v * 3] * 5e4) + 32768) * 65536 + Math.round(P[v * 3 + 1] * 5e4) + 32768) * 65536 + Math.round(P[v * 3 + 2] * 5e4) + 32768; let id = map.get(k); if (id === undefined) { id = lists.length; map.set(k, id); lists.push([]); } ids[v] = id; lists[id].push(v); }
  for (let t = 0; t < T; t++) {
    const o = t * 9, ax = P[o], ay = P[o + 1], az = P[o + 2], bx = P[o + 3], by = P[o + 4], bz = P[o + 5], cx = P[o + 6], cy = P[o + 7], cz = P[o + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az, nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    cenT[t * 3] = (ax + bx + cx) / 3; cenT[t * 3 + 1] = (ay + by + cy) / 3; cenT[t * 3 + 2] = (az + bz + cz) / 3;
    if (l < 1e-14) continue; // 退化的三角形（车削到轴心的那一圈）：不参与
    fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l;
    const e = [Math.hypot(ux, uy, uz), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(vx, vy, vz)]; minH[t] = l / Math.max(e[0], e[1], e[2]);
    const corner = (p, q, s) => { const d1 = [P[q] - P[p], P[q + 1] - P[p + 1], P[q + 2] - P[p + 2]], d2 = [P[s] - P[p], P[s + 1] - P[p + 1], P[s + 2] - P[p + 2]], l1 = Math.hypot(...d1), l2 = Math.hypot(...d2); return l1 && l2 ? Math.acos(Math.max(-1, Math.min(1, (d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]) / (l1 * l2)))) : 0; };
    ang[t * 3] = corner(o, o + 3, o + 6); ang[t * 3 + 1] = corner(o + 3, o + 6, o); ang[t * 3 + 2] = corner(o + 6, o, o + 3);
  }
  // 每个位置的尖锐程度（带符号：凸为正）
  const sharp = new Float32Array(lists.length);
  for (let id = 0; id < lists.length; id++) {
    let sx = 0, sy = 0, sz = 0, w = 0; for (const v of lists[id]) { const t = (v / 3) | 0, a = ang[v]; sx += fn[t * 3] * a; sy += fn[t * 3 + 1] * a; sz += fn[t * 3 + 2] * a; w += a; }
    if (!w) continue; const l = Math.hypot(sx, sy, sz), v0 = lists[id][0]; let side = 0;
    for (const v of lists[id]) { const t = (v / 3) | 0; side += (sx * (cenT[t * 3] - P[v0 * 3]) + sy * (cenT[t * 3 + 1] - P[v0 * 3 + 1]) + sz * (cenT[t * 3 + 2] - P[v0 * 3 + 2])) * ang[v]; }
    sharp[id] = (1 - l / w) * (side <= 0 ? 1 : -1);
  }
  const cosC = Math.cos(crease * Math.PI / 180), N = new Float32Array(V * 3), skin = new Float32Array(V * 2);
  for (let v = 0; v < V; v++) {
    const t = (v / 3) | 0, nx = fn[t * 3], ny = fn[t * 3 + 1], nz = fn[t * 3 + 2]; let sx = 0, sy = 0, sz = 0;
    for (const v2 of lists[ids[v]]) { const t2 = (v2 / 3) | 0; if (nx * fn[t2 * 3] + ny * fn[t2 * 3 + 1] + nz * fn[t2 * 3 + 2] >= cosC) { sx += fn[t2 * 3] * ang[v2]; sy += fn[t2 * 3 + 1] * ang[v2]; sz += fn[t2 * 3 + 2] * ang[v2]; } }
    const l = Math.hypot(sx, sy, sz) || 1; N[v * 3] = sx / l; N[v * 3 + 1] = sy / l; N[v * 3 + 2] = sz / l;
  }
  for (let t = 0; t < T; t++) {
    const s = [sharp[ids[t * 3]], sharp[ids[t * 3 + 1]], sharp[ids[t * 3 + 2]]], w = s.map((x) => sstep(0.03, 0.13, x)), big = w[0] > 0.5 && w[1] > 0.5 && w[2] > 0.5 && minH[t] > 0.0025 ? 0.3 : 1;
    for (let c = 0; c < 3; c++) {
      const v = t * 3 + c, add = extra ? extra(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) : null;
      skin[v * 2] = clamp01(sstep(0.03, 0.2, -s[c]) * occl + (add ? add[1] || 0 : 0)); skin[v * 2 + 1] = clamp01(w[c] * big * edge + (add ? add[0] || 0 : 0));
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('aSkin', new THREE.BufferAttribute(skin, 2));
  return geo;
}
/** 几个不带索引的几何拼成一个（position、normal、uv、aSkin；还有 color 的话也带上）。拼完把原来的都释放掉 */
export function merge(geos) {
  const list = geos.filter(Boolean), names = ['position', 'normal', 'uv', 'aSkin', 'color'].filter((k) => list.some((g) => g.attributes[k])), out = new THREE.BufferGeometry();
  let V = 0; for (const g of list) V += g.attributes.position.count;
  for (const k of names) {
    const size = k === 'uv' || k === 'aSkin' ? 2 : 3, arr = new Float32Array(V * size); let o = 0;
    for (const g of list) { const a = g.attributes[k]; if (a) arr.set(a.array, o); o += g.attributes.position.count * size; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  for (const g of list) g.dispose();
  return out;
}

// ---------------------------------------------------------------- G40 的尺寸
// 坐标：前 −z、上 +y、右 +x，原点和原来一样（握把、护木的位置不动，步枪上那两只手搬过来还握得住）。
const AX = 0.006;            // 枪膛轴线的高度
const R_BARREL = 0.024, R_CHAMBER = 0.0262, R_BORE = 0.0203, R_BAND = 0.0256, R_MUZZLE = 0.0264;
const R_RECV = 0.0268, W_FRAME = 0.0203; // 机匣上半（圆顶）的半径、下半（机框）的半宽
const SIGHT_Z = -0.12, FRONT_Z = -0.3445;
/** 表尺缺口、准星尖的高度（都要等于 LAUNCHER_VIEW.sightY，开镜时两点一线正好在屏幕中心）；枪托各段的上沿、下沿、半宽 */
export const G40 = Object.freeze({
  axis: AX, notchY: 0.0505, bladeY: 0.0505, sightZ: SIGHT_Z, frontZ: FRONT_Z, leafTop: 0.09,
  // 枪托：上沿从机匣后面一路往后往下斜（贴腮的棱比瞄准线低得多，开镜不挡）；0.092 以前的那一段藏在机匣斜切的尾部下面
  stockTop: Object.freeze([[0.046, -0.044], [0.092, -0.008], [0.0925, 0.023], [0.11, 0.02], [0.135, 0.012], [0.17, 0.002], [0.23, -0.014], [0.292, -0.03]].map(Object.freeze)),
  stockBottom: Object.freeze([[0.046, -0.056], [0.09, -0.056], [0.105, -0.054], [0.13, -0.057], [0.16, -0.066], [0.292, -0.108]].map(Object.freeze)),
  stockHalf: Object.freeze([[0.046, 0.0199], [0.092, 0.0199], [0.0925, 0.0215], [0.11, 0.021], [0.14, 0.0195], [0.2, 0.0205], [0.292, 0.022]].map(Object.freeze)),
  buttZ: 0.292, padZ: 0.3055,
  // 握把：和原来的方块一样的位置和斜度（右手就是照那个摆的），截面改成椭圆
  gripTop: Object.freeze([-0.044, 0.0654]), gripSlant: 0.32, gripLen: 0.12,
  // 护木：包着枪管下半，z 从后到前
  foreZ: Object.freeze([-0.277, -0.036]), foreTop: AX + 0.002,
});
const STOCK_BOX = [[0.046, 0.3], [0.092, 0.3], [0.1, 0.55], [0.14, 0.78]];
const FORE_W = [[-0.277, 0.0225], [-0.27, 0.0252], [-0.255, 0.0262], [-0.16, 0.0275], [-0.06, 0.0268], [-0.036, 0.0262]];
const FORE_B = [[-0.277, -0.027], [-0.271, -0.033], [-0.258, -0.037], [-0.2, -0.0395], [-0.12, -0.04], [-0.06, -0.039], [-0.044, -0.036], [-0.036, -0.03]];
const recvBottom = (z) => pw([[0.042, -0.05], [0.094, -0.012]], z);

function stockRing(z, k = 1, zOut = z, N = 24) {
  const yt = pw(G40.stockTop, z), yb = pw(G40.stockBottom, z), w = pw(G40.stockHalf, z) * k, p = pw(STOCK_BOX, z), yc = (yt + yb) / 2, h = (yt - yb) / 2 * k, comb = sstep(0.0925, 0.13, z), out = [];
  for (let j = 0; j < N; j++) { const a = -Math.PI / 2 + j / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); out.push([w * spow(c, p) * (1 - 0.34 * comb * Math.max(0, s) ** 1.5), yc + h * spow(s, 0.72), zOut]); }
  return out;
}
function gripRing(s, k = 1, N = 16) {
  const sl = G40.gripSlant, cy = G40.gripTop[0] - s * Math.cos(sl), cz = G40.gripTop[1] + s * Math.sin(sl), t = s / G40.gripLen;
  const a = pw([[0, 0.0192], [0.18, 0.0155], [0.5, 0.015], [0.8, 0.015], [1, 0.0155]], t) * k, b = pw([[0, 0.0235], [0.18, 0.0215], [0.5, 0.021], [0.8, 0.021], [1, 0.0216]], t) * k, out = [];
  for (let j = 0; j < N; j++) { const g = Math.PI / 2 + j / N * Math.PI * 2, X = a * spow(Math.cos(g), 0.8), F = b * spow(Math.sin(g), 0.8); out.push([X, cy + F * Math.sin(sl), cz + F * Math.cos(sl)]); }
  return out;
}
function recvRing(z, inset = 0, zOut = z) {
  const R = R_RECV - inset, wl = W_FRAME - inset, y1 = -0.008, y2 = -0.015, c = 0.0016, yb = recvBottom(z) + inset;
  const W = (y) => (y >= y1 ? R : y <= y2 ? wl : wl + (R - wl) * (y - y2) / (y1 - y2));
  const ya1 = Math.max(y1, yb + c + 0.002), ya2 = Math.max(y2, yb + c + 0.001), half = [];
  for (let k = 0; k <= 6; k++) { const f = k * Math.PI / 12; half.push([R * Math.sin(f), AX + R * Math.cos(f)]); }
  // 圆顶接直壁的地方多补一个点：法线的过渡收在这半毫米里，直壁才是真的平面（不然整面是一个渐变，像鼓出来的）
  half.push([R, AX - 0.0005], [R, ya1], [W(ya2), ya2], [W(yb + c), yb + c], [W(yb + c) - c, yb], [0, yb]);
  const ring = half.map((p) => [p[0], p[1], zOut]); for (let i = half.length - 2; i >= 1; i--) ring.push([-half[i][0], half[i][1], zOut]);
  return ring;
}
function foreRing(z) {
  const hw = pw(FORE_W, z), yb = pw(FORE_B, z), yt = G40.foreTop, b = 0.0014, ys = yt - 0.021, fade = sstep(-0.268, -0.24, z) * (1 - sstep(-0.07, -0.045, z));
  const side = (y) => hw - 0.0026 * fade * Math.exp(-(((y - (yt - 0.0105)) / 0.0042) ** 2)); // 指槽：两侧靠上各一道浅槽
  const half = [[hw - b, yt]];
  for (const d of [b, 0.0045, 0.0075, 0.0105, 0.0135, 0.017, 0.021]) half.push([side(yt - d), yt - d]);
  for (let k = 1; k <= 5; k++) { const f = k * Math.PI / 12; half.push([hw * Math.pow(Math.cos(f), 0.75), ys - (ys - yb) * Math.pow(Math.sin(f), 0.75)]); }
  half.push([0, yb]);
  const ring = half.map((p) => [p[0], p[1], z]); for (let i = half.length - 2; i >= 0; i--) ring.push([-half[i][0], half[i][1], z]);
  return ring;
}
const arc = (cx, cy, r, a0, a1, n) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; };
const shapeOf = (pts) => new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));

/**
 * 搭 G40 的全部几何。hinge：枪管撅下去绕的轴（tube 那一组的几何是相对它的）。
 * 返回 { body: { steel, dark, wood, rubber, ink }, tube: { steel, dark, wood, bore, ink }, shell, triangles }——每一项是一个拼好的几何。
 * steel 烤蓝的大件；dark 哑光的小件（表尺、销、背带环）；ink 是带顶点色的小东西（表尺刻度的白漆、螺丝孔的黑）。
 */
export function buildG40({ hinge = [0, -0.032, -0.012] } = {}) {
  const TS = 0.12, TWU = 0.3, TWV = 0.15; // 钢一格贴图 12 厘米；木头顺纹 30 厘米一格、横纹 15 厘米一格（木纹横着看才密）
  const B = { steel: [], dark: [], wood: [], rubber: [], ink: [] }, Tb = { steel: [], dark: [], wood: [], bore: [], ink: [] };
  const [hx, hy, hz] = hinge;
  const at = (g, x = 0, y = 0, z = 0) => g.translate(x, y, z);
  const pinX = (y, z, r, len, segs = 8) => at(lathe(segs > 8 ? [[-len / 2, 0], [-len / 2, r - 0.0005], [-len / 2 + 0.0005, r], [len / 2 - 0.0005, r], [len / 2, r - 0.0005], [len / 2, 0]] : [[-len / 2, 0], [-len / 2, r], [len / 2, r], [len / 2, 0]], { segs, tileU: TS, refine: 0 }).rotateY(Math.PI / 2), 0, y, z);
  const ink = (g, v) => { const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(v); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); return g; };

  // ---- 机匣（不动的部分）
  // 圆顶、直壁、下半收窄成机框；底面在握把上方斜着往上切（木头从这个斜口里接出来），尾端收一圈肩
  B.steel.push(finish(loft([recvRing(0, 0.0012), recvRing(0.0012), recvRing(0.005), recvRing(0.04), recvRing(0.046), recvRing(0.068), recvRing(0.088), recvRing(0.0925), recvRing(0.0925, 0.0008, 0.0942), recvRing(0.0925, 0.0028, 0.0955)], { tileU: TS, capStart: true, capEnd: true, vRef: 1 }),
    { crease: 36, edge: 0.5 }));
  // 机框前端夹着枪管耳座的两片颊板，铰链销从中间穿过去
  const cheek = shapeOf([[0.002, -0.0495], ...arc(hz, -0.0328, 0.0167, -Math.PI / 2, -Math.PI * 1.5, 10), [0.002, -0.0161]]);
  for (const sx of [-1, 1]) B.steel.push(finish(at(extrude(cheek, 0.006, { bevel: 0.0008, tile: TS }), sx * (W_FRAME - 0.003), 0, 0), { edge: 0.5 }));
  // 机框两侧的侧板（发火机构装在里面）：比机框高出半毫米的一块，后沿顺着机匣尾部的斜切走
  const plate = shapeOf([[0.007, -0.0465], [0.04, -0.0465], [0.066, -0.0275], [0.062, -0.0185], [0.007, -0.0185]]);
  for (const sx of [-1, 1]) B.steel.push(finish(at(extrude(plate, 0.0012, { bevel: 0.0005, tile: TS }), sx * (W_FRAME + 0.0001), 0, 0), { edge: 0.45 }));
  B.dark.push(finish(pinX(hy, hz, 0.0046, W_FRAME * 2 + 0.0026, 12), { crease: 50, edge: 0.7 }));
  for (const [y, z] of [[-0.031, 0.02], [-0.027, 0.054], [-0.0015, 0.078]]) B.dark.push(finish(pinX(y, z, 0.0026, (y > -0.008 ? R_RECV : W_FRAME + 0.0006) * 2 + 0.0012), { crease: 50, edge: 0.6 }));
  // 闭锁面上的击针孔座（撅开时看得见）
  B.dark.push(finish(at(lathe([[0, 0.0052], [-0.0005, 0.0048], [-0.0005, 0.0015], [-0.0013, 0.001], [-0.0013, 0]], { segs: 12, tileU: TS, refine: 0 }), 0, AX, 0), { edge: 0.5 }));
  // 扳机护圈：一条弯的扁钢，前端进机框、后端进握把
  const guard = curve2([[-0.004, -0.046], [-0.0045, -0.062], [0.003, -0.0765], [0.016, -0.0806], [0.044, -0.0806], [0.066, -0.0806]], 20);
  B.steel.push(finish(extrude(stripShape(guard, 0.0024), 0.0105, { bevel: 0.0006, tile: TS }), { crease: 50, edge: 0.38 }));
  // 扳机：往前弯的月牙
  const trig = curve2([[0.041, -0.046], [0.0398, -0.055], [0.0366, -0.0635], [0.031, -0.0705]], 9);
  B.dark.push(finish(extrude(stripShape(trig, (t) => 0.0042 - 0.0012 * t), 0.006, { bevel: 0.0009, tile: TS }), { crease: 50, edge: 0.4 }));
  // 开闩扳把：机匣顶上靠后，轴座 + 往右后方甩出去的柄，柄尾是带棱的拇指垫
  B.dark.push(finish(at(lathe([[0, 0.0058], [-0.003, 0.0058], [-0.0038, 0.005], [-0.0038, 0]], { segs: 14, tileU: TS, refine: 0 }).rotateX(Math.PI / 2), 0, AX + R_RECV - 0.0006, 0.066), { edge: 0.5 }));
  const lever = shapeOf([[-0.0042, -0.0635], [0.0042, -0.0635], [0.0056, -0.07], [0.0096, -0.083], [0.0118, -0.0905], [0.0066, -0.0925], [0.0028, -0.084], [-0.0036, -0.071]]);
  B.dark.push(finish(at(extrude(lever, 0.0026, { bevel: 0.0007, plane: 'top', tile: TS }), 0, AX + R_RECV + 0.0008, 0), { edge: 0.55 }));
  for (let k = 0; k < 3; k++) B.dark.push(finish(at(extrude(shapeOf([[0.0062 + k * 0.0009, -0.0842 - k * 0.0026], [0.0098 + k * 0.0009, -0.0858 - k * 0.0026], [0.0102 + k * 0.0009, -0.0846 - k * 0.0026], [0.0066 + k * 0.0009, -0.083 - k * 0.0026]]), 0.0011, { bevel: 0.0003, plane: 'top', tile: TS }), 0, AX + R_RECV + 0.0033, 0), { edge: 0.6 }));

  // ---- 枪托、握把（一整块胡桃木）和橡胶托底
  const wearStock = (x, y, z) => {
    const top = pw(G40.stockTop, z), bot = pw(G40.stockBottom, z), nearButt = sstep(0.262, 0.29, z);
    // 磨白：托底那一圈，托踵托趾最重（枪托杵在地上磨的）；发黑：握手的地方、贴着铁的地方
    return [nearButt * (0.3 + sstep(top - 0.012, top, y) * 0.3 + sstep(bot + 0.014, bot, y) * 0.35), (1 - sstep(0.094, 0.112, z)) * 0.55 + sstep(0.15, 0.1, z) * 0.25];
  };
  const stockZ = [0.046, 0.07, 0.092, 0.0925, 0.1, 0.11, 0.125, 0.14, 0.16, 0.19, 0.22, 0.25, 0.275, 0.292];
  B.wood.push(finish(loft(stockZ.map((z) => stockRing(z)), { tileU: TWU, tileV: TWV, capStart: true }), { crease: 75, edge: 0, extra: wearStock }));
  const gs = [0, 0.012, 0.024, 0.04, 0.058, 0.076, 0.094, 0.11];
  B.wood.push(finish(loft([...gs.map((s) => gripRing(s)), gripRing(0.117, 0.94), gripRing(G40.gripLen, 0.78)], { tileU: TWU, tileV: TWV, capStart: true, capEnd: true }),
    { crease: 75, edge: 0.15, extra: (x, y) => [sstep(-0.15, -0.16, y) * 0.3, 0.2 + sstep(-0.075, -0.055, y) * 0.3] }));
  // 托底：两指厚的黑橡胶，侧面和后面都是横棱（贴图的棱是沿 v 排的，所以侧面把 u、v 对调）
  B.rubber.push(finish(loft([stockRing(G40.buttZ, 1.004), stockRing(G40.buttZ, 1.004, 0.3035), stockRing(G40.buttZ, 0.975, 0.305), stockRing(G40.buttZ, 0.93, G40.padZ)], { tileU: 0.06, tileV: 0.06, swapUV: true, capEnd: true }), { crease: 50, edge: 0, occl: 0 }));
  for (const y of [-0.043, -0.088]) B.ink.push(ink(at(new THREE.CircleGeometry(0.0032, 10).toNonIndexed(), 0, y, G40.padZ + 0.0002), 0.012)); // 托底螺丝孔
  // 后背带环：托腹上的座 + 一个扁环
  const swivel = (y, z, lean) => [at(lathe([[0, 0.0034], [-0.0045, 0.003], [-0.0052, 0.0022], [-0.0052, 0]], { segs: 10, tileU: TS, refine: 0 }).rotateX(-Math.PI / 2), 0, y, z),
    at(plain(new THREE.TorusGeometry(0.0078, 0.0013, 5, 12), 2, 1).scale(1.35, 1, 1).rotateX(lean), 0, y - 0.0052 - 0.0074 * Math.cos(lean), z - 0.0074 * Math.sin(lean)), pinX(y - 0.0048, z, 0.0016, 0.0125)];
  for (const g of swivel(pw(G40.stockBottom, 0.248) + 0.001, 0.248, -0.5)) B.dark.push(finish(g, { crease: 50, edge: 0.35 }));

  // ---- 枪管那一截（绕铰链往下撅；下面的坐标先按整枪写，最后统一减去铰链的位置）
  const bandAt = (z0, z1) => [[z0 + 0.001, R_BARREL], [z0, R_BAND], [z1, R_BAND], [z1 - 0.001, R_BARREL]];
  const barrel = [[0, 0.0206], [0, R_CHAMBER - 0.001], [-0.001, R_CHAMBER], [-0.05, R_CHAMBER], [-0.055, R_BARREL + 0.0009], [-0.06, R_BARREL],
    ...bandAt(SIGHT_Z + 0.008, SIGHT_Z - 0.008), ...bandAt(-0.279, -0.293),
    [-0.327, R_BARREL], [-0.3315, R_MUZZLE], [-0.357, R_MUZZLE], [-0.3592, R_MUZZLE - 0.001], [-0.36, R_MUZZLE - 0.0032], [-0.36, R_BORE + 0.0016], [-0.3584, R_BORE], [-0.352, R_BORE]];
  const wearBarrel = (x, y, z) => { const r = Math.hypot(x, y); return [sstep(-0.335, -0.358, z) * 0.42 + (r > R_BAND - 0.0002 && z > -0.3 ? 0.22 : 0), 0]; };
  Tb.steel.push(finish(at(lathe(barrel, { segs: 24, tileU: TS, tileV: TS }), 0, AX, 0), { edge: 0.7, extra: wearBarrel }));
  // 枪膛：朝里的一截管子，颜色存在顶点上——一条阳线一条阴线交替、每往里四五厘米错一格（膛线的缠度很缓），越往里越黑
  { const segs = 24, zs = [-0.3584, -0.3465, -0.3285, -0.3135, -0.27, -0.225, -0.18, -0.135, -0.09, -0.052, -0.046, -0.002], pos = [], col = [];
    for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < segs; j++) {
      const chamber = zs[i] > -0.06, r0 = zs[i] >= -0.05 ? 0.0206 : R_BORE, r1 = zs[i + 1] >= -0.05 ? 0.0206 : R_BORE, a0 = j / segs * Math.PI * 2, a1 = (j + 1) / segs * Math.PI * 2;
      const p = (a, r, z) => [Math.cos(a) * r, AX + Math.sin(a) * r, z], A = p(a0, r0, zs[i]), Bq = p(a1, r0, zs[i]), C = p(a0, r1, zs[i + 1]), D = p(a1, r1, zs[i + 1]);
      pos.push(...A, ...C, ...Bq, ...Bq, ...C, ...D);
      const depth = Math.min(zs[i] + 0.36, -zs[i]), land = chamber ? 1 : ((j + Math.floor(depth / 0.045)) % 4 < 2 ? 1 : 0.62), v = (0.004 + 0.045 * Math.exp(-depth / 0.03)) * land;
      for (let k = 0; k < 6; k++) col.push(v, v * 1.02, v * 1.08);
    }
    const g = rawGeo(pos, new Array(pos.length / 3 * 2).fill(0)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3)); g.computeVertexNormals(); Tb.bore.push(g); }
  // 枪管下面的耳座：铰链销穿过它，底下是圆的（转的时候不顶机框），往前伸一段压在护木里
  const lug = shapeOf([[0, -0.016], [0, hy], ...arc(hz, hy, 0.012, 0, -Math.PI, 8).slice(1), [-0.062, -0.0225], [-0.062, -0.016]]);
  Tb.steel.push(finish(extrude(lug, 0.028, { bevel: 0.0009, tile: TS }), { edge: 0.6 }));
  // 护木
  const foreZ = [-0.036, -0.04, -0.048, -0.06, -0.09, -0.12, -0.16, -0.2, -0.235, -0.258, -0.268, -0.274, -0.277];
  const wearFore = (x, y, z) => [sstep(G40.foreTop - 0.004, G40.foreTop, y) * 0.2 + sstep(-0.262, -0.276, z) * 0.35 + sstep(-0.044, -0.037, z) * 0.25,
    Math.exp(-(((y - (G40.foreTop - 0.0105)) / 0.004) ** 2)) * 0.5 * sstep(-0.268, -0.24, z) * (1 - sstep(-0.07, -0.045, z)) + (y < -0.02 ? 0.12 : 0)];
  Tb.wood.push(finish(loft(foreZ.map(foreRing), { tileU: TWU, tileV: TWV, capStart: true, capEnd: true }), { crease: 55, edge: 0.35, extra: wearFore }));
  // 表尺：箍上的座 + 立着的梯形尺框 + 带缺口的游标 + 右侧的调节钮；尺框朝后的那面两边有刻度
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  Tb.dark.push(finish(at(extrude(shapeOf([[-0.011, 0.028], [0.011, 0.028], [0.011, 0.0362], [0.0085, 0.0388], [-0.0085, 0.0388], [-0.011, 0.0362]]), 0.014, { bevel: 0.0007, plane: 'back', tile: TS }), 0, 0, SIGHT_Z), { edge: 0.8 }));
  const leaf = shapeOf(rect(-0.0105, 0.0375, 0.0105, G40.leafTop)); leaf.holes.push(new THREE.Path(rect(-0.0077, 0.0415, 0.0077, G40.leafTop - 0.003).map((p) => new THREE.Vector2(p[0], p[1]))));
  Tb.dark.push(finish(at(extrude(leaf, 0.0022, { bevel: 0.0004, plane: 'back', tile: TS }), 0, 0, SIGHT_Z), { edge: 0.5 }));
  const nb = G40.notchY - 0.002, nt = G40.notchY + 0.0028; // 缺口：底在 notchY 下面 2 毫米，游标上沿在上面不到 3 毫米——准星尖正好卡在缺口里
  Tb.dark.push(finish(at(extrude(shapeOf([[-0.0122, nb - 0.0045], [0.0122, nb - 0.0045], [0.0122, nt], [0.0025, nt], [0.0019, nb], [-0.0019, nb], [-0.0025, nt], [-0.0122, nt]]), 0.0036, { bevel: 0.0004, plane: 'back', tile: TS }), 0, 0, SIGHT_Z + 0.0004), { edge: 0.5 }));
  Tb.dark.push(finish(at(lathe([[-0.002, 0], [-0.002, 0.0026], [0.002, 0.0026], [0.002, 0]], { segs: 10, tileU: TS, refine: 0 }).rotateY(Math.PI / 2), 0.0142, nb - 0.001, SIGHT_Z + 0.0004), { edge: 0.5 }));
  Tb.dark.push(finish(pinX(0.0388, SIGHT_Z, 0.0019, 0.0236), { crease: 50, edge: 0.5 }));
  { const pos = [], zf = SIGHT_Z + 0.0011 + 0.00015; // 刻度：白漆填的细线，长短相间
    for (let k = 0; k < 7; k++) for (const sx of [-1, 1]) { const y = 0.0575 + k * 0.0042, len = k % 2 ? 0.0013 : 0.0022, x0 = sx * 0.0081, x1 = sx * (0.0081 + len), h = 0.00032; const q = sx > 0 ? [[x0, y - h], [x1, y - h], [x1, y + h], [x0, y + h]] : [[x1, y - h], [x0, y - h], [x0, y + h], [x1, y + h]]; for (const i of [0, 1, 2, 0, 2, 3]) pos.push(q[i][0], q[i][1], zf); }
    // 缺口正下方一道白线、准星背上一个白点：暗处举枪时眼睛有地方落
    for (const [x0, y0, x1, y1, z0, z1] of [[-0.00045, nb - 0.0034, 0.00045, nb - 0.0008, SIGHT_Z + 0.0024, SIGHT_Z + 0.0024], [-0.0007, G40.bladeY - 0.0046, 0.0007, G40.bladeY - 0.0008, FRONT_Z + 0.0033, FRONT_Z + 0.0018]]) pos.push(x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z1);
    Tb.ink.push(ink(rawGeo(pos, new Array(pos.length / 3 * 2).fill(0)), 0.5)); }
  // 准星：枪口箍上的座、一片斜背的刀形准星、两边的护耳
  Tb.dark.push(finish(at(extrude(shapeOf([[-0.0085, 0.03], [0.0085, 0.03], [0.0085, 0.0352], [0.0068, 0.0366], [-0.0068, 0.0366], [-0.0085, 0.0352]]), 0.017, { bevel: 0.0007, plane: 'back', tile: TS }), 0, 0, FRONT_Z), { edge: 0.8 }));
  Tb.dark.push(finish(extrude(shapeOf([[FRONT_Z + 0.007, 0.036], [FRONT_Z + 0.0012, G40.bladeY], [FRONT_Z - 0.0012, G40.bladeY], [FRONT_Z - 0.003, 0.036]]), 0.0022, { bevel: 0.0003, tile: TS }), { edge: 0.5 }));
  const ear = shapeOf([[FRONT_Z + 0.0075, 0.036], [FRONT_Z + 0.0065, 0.047], ...arc(FRONT_Z, 0.0492, 0.0046, 0.35, Math.PI - 0.35, 6), [FRONT_Z - 0.0065, 0.047], [FRONT_Z - 0.0075, 0.036]]);
  for (const sx of [-1, 1]) Tb.dark.push(finish(at(extrude(ear, 0.0018, { bevel: 0.0004, tile: TS }), sx * 0.0074, 0, 0), { edge: 0.45 }));
  // 前背带环：枪口箍后面、枪管底下
  for (const g of swivel(AX - R_BARREL + 0.001, -0.312, 0.45)) Tb.dark.push(finish(g, { crease: 50, edge: 0.35 }));

  // ---- 弹底（撅开时露在药室口外面一截）：弹体、抽壳槽、底缘、底火
  const shell = finish(at(lathe([[-0.03, 0.02], [0.0075, 0.02], [0.0082, 0.0186], [0.0102, 0.0186], [0.0108, 0.0214], [0.0132, 0.0214], [0.0138, 0.0207], [0.0138, 0.0162], [0.0133, 0.0158], [0.0133, 0.0148], [0.0138, 0.0144], [0.0138, 0.0066], [0.013, 0.0062], [0.013, 0.0056], [0.0134, 0.0052], [0.0135, 0]], { segs: 20, tileU: 0.06, refine: 0 }), 0, AX - hy, -hz), { edge: 0.5, occl: 1 });

  const pack = (set, shift) => { const out = {}; for (const [k, list] of Object.entries(set)) { out[k] = list.length ? merge(list) : null; if (out[k] && shift) out[k].translate(-hx, -hy, -hz); } return out; };
  const body = pack(B, false), tube = pack(Tb, true);
  let triangles = shell.attributes.position.count / 3; for (const g of [...Object.values(body), ...Object.values(tube)]) if (g) triangles += g.attributes.position.count / 3;
  return { body, tube, shell, triangles };
}

// ---------------------------------------------------------------- 材质
/**
 * 让一个材质认 aSkin：磨损的地方颜色往 color 靠、粗糙度往 rough 靠（边缘被粗糙度贴图 R 通道里的噪声咬成一块一块的），暗角的地方压暗。
 * 只有带粗糙度贴图的材质才装（噪声在那张图里）。返回材质本身。
 */
export function wearable(material, { color = 0x6f7278, rough = 0.34, amount = 1, occl = 0.6 } = {}) {
  if (!material?.roughnessMap) return material;
  const U = { uWearColor: { value: new THREE.Color(color) }, uWearRough: { value: rough }, uWearAmount: { value: amount }, uOccl: { value: occl } };
  material.userData.wear = U;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aSkin;\nvarying vec2 vSkin;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = aSkin;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSkin;\nuniform vec3 uWearColor;\nuniform float uWearRough;\nuniform float uWearAmount;\nuniform float uOccl;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat skinWear = 0.0;\n#ifdef USE_ROUGHNESSMAP\n\tskinWear = smoothstep( 0.0, 0.4, vSkin.y - 0.08 - ( 1.0 - clamp( ( texture2D( roughnessMap, vRoughnessMapUv ).r - 0.3 ) * 2.5, 0.0, 1.0 ) ) * 0.9 ) * uWearAmount;\n#endif\ndiffuseColor.rgb = mix( diffuseColor.rgb, uWearColor, skinWear ) * ( 1.0 - vSkin.x * uOccl );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, uWearRough, skinWear );');
  };
  material.customProgramCacheKey = () => 'g40-wear';
  material.needsUpdate = true;
  return material;
}
/**
 * G40 用的全部材质。有画布时带贴图（胡桃木、烤蓝钢各一套 512，托底用公用的橡胶 256）；没有时是纯色。
 * 返回 { M: { steel, dark, wood, rubber, brass, bore, ink }, textures, ms（做贴图花了多少毫秒）, dispose() }。
 */
export function createG40Materials({ size = 512 } = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const wood = textureSet(hasCanvas() ? walnut(size, 4) : null, size, 0.08), steel = textureSet(hasCanvas() ? blued(size, 2) : null, size, 0.045), rubber = surface('rubber', { size: 256, seed: 3, bump: 2 });
  const mk = (color, roughness, metalness, env) => { const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); m.envMapIntensity = env; return m; };
  const tex = (m, set, ns, withMap = true) => { if (!set) return m; if (withMap) { m.map = set.map; m.color.set(0xffffff); } m.normalMap = set.normalMap; m.normalScale.set(ns, ns); m.roughnessMap = set.roughnessMap; return m; };
  const M = {
    // 烤蓝的大件：金属感要有（高光是窄的一道），但环境反射压着——枪那一层的环境光很亮，放开了整把枪发白
    steel: wearable(tex(mk(0x17191c, hasCanvas() ? 1 : 0.5, 0.55, 0.75), steel, 1), { color: 0x5e626a, rough: 0.33, amount: 0.72, occl: 0.6 }),
    // 哑光的小件：同一套贴图，颜色压暗、粗糙度乘大
    dark: wearable(tex(mk(0x131416, hasCanvas() ? 1.6 : 0.72, 0.45, 0.5), steel, 1), { color: 0x6a6d72, rough: 0.42, occl: 0.6 }),
    wood: wearable(tex(mk(0x4a2f1c, hasCanvas() ? 1 : 0.6, 0.0, 0.5), wood, 1), { color: 0x7a5a3c, rough: 0.7, amount: 0.5, occl: 0.5 }),
    rubber: tex(mk(0x0e0f10, hasCanvas() ? 1 : 0.85, 0.0, 0.3), rubber, 0.3),
    // 黄铜：没有自己的贴图，借钢的法线和粗糙度（有一点拉丝和深浅就够了）
    brass: wearable(tex(mk(0x7c5f2a, hasCanvas() ? 1.1 : 0.4, 0.85, 0.45), steel, 1, false), { color: 0xb8964e, rough: 0.3, occl: 0.85 }),
    // 枪膛不受光：里面本来就照不进去，受光的话专用灯（没有阴影）会把膛壁打得比枪身还亮
    bore: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }),
    ink: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 }),
  };
  if (steel) M.dark.color.set(0xb4b4b4);
  M.ink.envMapIntensity = 0.2;
  for (const [k, m] of Object.entries(M)) m.name = `g40-${k}`;
  const textures = [wood, steel].filter(Boolean).flatMap((s) => Object.values(s));
  return {
    M, textures, ms: (typeof performance !== 'undefined' ? performance.now() : 0) - t0,
    // 橡胶那一套是 gun-surface.js 缓存里公用的，不归这里释放
    dispose() { for (const t of textures) t.dispose(); for (const m of Object.values(M)) m.dispose(); },
  };
}
