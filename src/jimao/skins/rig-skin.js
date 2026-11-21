// 队友（阿哲、林医生）和劫持者那副程序骨架（soldier.js buildParts）的「真人装备」质感。
// 骨架本身是圆角方块、胶囊、球拼起来的，每个人一个材质、几个网格（顶点色上色，没有 UV 能用——拼合件的 UV 各管各的，比例不一）。
// 所以这里不画「衣服贴图」，而是：
//   1) 每个顶点带一个 rig 属性（4 个字节）：x 表面种类（布、科迪拉、荧光网布、反光条、皮、橡胶、塑料、皮肤、头发、金属……）、
//      y 这种表面沾脏的倾向；种类决定粗糙度、金属度、细节纹理怎么混、起伏多深。
//      再带一个 rest 属性（8 个字节）：站直时在骨架里的位置 + 这是哪个人。脏和血在着色器里按这个位置逐像素算（越往下越脏、
//      膝盖跪脏、袖口手套上有血），用细节图里的斑驳打散成一块一块——不按顶点算，是因为圆角方块的大平面中间没有顶点。
//   2) 一张共用的小细节图（程序生成，可平铺，256 / 512 像素），四个通道各是一种纹理：
//      R 斜纹布 + 衣褶，G 科迪拉 / 防撕格的粗织纹 + 折痕，B 皮革颗粒 / 毛孔，A 大块斑驳（脏、褪色、划痕的分布）。
//      按物体空间三向投影（triplanar）采样——拼合件没有统一 UV，三向投影不用 UV，接缝只在关节处（本来就有）。
//   3) 法线：细节高度按真实尺寸（米）用屏幕导数求坡度扰动法线（和 three 的 bumpMap 同一个公式，但不归一化导数，
//      远近起伏一致，远处不会越看越糙）。
//   4) 反光条：真的逆反射——光从哪来就往哪反，手电挂在镜头上，所以手电一照，银灰色的反光条就亮起来；白天太阳不在身后就只是银灰。
// 每个人还是一个材质、网格数不变（不加 draw call）。贴图按内存档位：省内存档（compact）不要贴图（只有按种类的粗糙度、反光条），
// 手机两档 256²，电脑 512²。生成分帧做，一帧最多几毫秒；生成好之前用一张 4×4 的中性小图，换图不重新编译着色器。
// 没有 document（node 测试）时不生成贴图，材质照样能建、能用。
import * as THREE from 'three';
import { MEM } from '../../render/device.js';

/** 表面种类（顶点 rig 属性的 x，按 0–255 存） */
export const SURF = Object.freeze({ CLOTH: 0, SCRUBS: 1, CORDURA: 2, HIVIS: 3, RETRO: 4, LEATHER: 5, RUBBER: 6, PLASTIC: 7, SKIN: 8, HAIR: 9, METAL: 10, GLOSS: 11, KNIT: 12, POLYMER: 13 });

/**
 * 每种表面的参数。w：细节图 R G B A 四个通道各占多少（混成高度）；s：每米重复几次（三向投影的缩放）；
 * rough / rv：粗糙度和它随斑驳起伏多少；av：颜色随纹理起伏多少（织纹凹处暗一点）；metal：金属度；
 * bump：起伏深度（米，高度 0–1 对应多少米）；retro：逆反射强度（只有反光条）；glow：荧光布的自发光（黑里也看得出荧光黄）；
 * grime：这种表面沾脏的倾向（布和靴子最容易脏，头发、镜片不沾）；blood：沾不沾血（皮肤、头发、镜片不画——脸上一道血太吓人，也显脏）。
 */
export const SURF_PARAMS = Object.freeze([
  /* CLOTH   */ Object.freeze({ w: [1, 0, 0.12, 0], s: 4, rough: 0.86, rv: 0.1, av: 0.3, metal: 0, bump: 0.005, retro: 0, glow: 0, grime: 1, blood: 1 }),
  /* SCRUBS  */ Object.freeze({ w: [1, 0, 0.08, 0], s: 3, rough: 0.78, rv: 0.08, av: 0.2, metal: 0, bump: 0.0045, retro: 0, glow: 0, grime: 0.8, blood: 1 }),
  /* CORDURA */ Object.freeze({ w: [0, 1, 0.1, 0], s: 4, rough: 0.8, rv: 0.12, av: 0.3, metal: 0, bump: 0.0036, retro: 0, glow: 0, grime: 1, blood: 1 }),
  /* HIVIS   */ Object.freeze({ w: [0.25, 0.75, 0, 0], s: 6, rough: 0.72, rv: 0.1, av: 0.18, metal: 0, bump: 0.0016, retro: 0, glow: 0.035, grime: 1, blood: 1 }),
  /* RETRO   */ Object.freeze({ w: [0, 0, 0.35, 0.2], s: 6, rough: 0.42, rv: 0.12, av: 0.22, metal: 0, bump: 0.0004, retro: 0.2, glow: 0, grime: 0.7, blood: 1 }),
  /* LEATHER */ Object.freeze({ w: [0.25, 0, 1, 0], s: 5, rough: 0.6, rv: 0.16, av: 0.32, metal: 0, bump: 0.0012, retro: 0, glow: 0, grime: 1, blood: 1 }),
  /* RUBBER  */ Object.freeze({ w: [0, 0, 1, 0], s: 9, rough: 0.72, rv: 0.08, av: 0.15, metal: 0, bump: 0.0006, retro: 0, glow: 0, grime: 0.9, blood: 1 }),
  /* PLASTIC */ Object.freeze({ w: [0, 0, 0.2, 0.35], s: 3, rough: 0.38, rv: 0.24, av: 0.16, metal: 0, bump: 0.0005, retro: 0, glow: 0, grime: 0.6, blood: 1 }),
  /* SKIN    */ Object.freeze({ w: [0, 0, 1, 0], s: 14, rough: 0.55, rv: 0.1, av: 0.1, metal: 0, bump: 0.0003, retro: 0, glow: 0, grime: 0.3, blood: 0 }),
  /* HAIR    */ Object.freeze({ w: [1, 0, 0.2, 0], s: 12, rough: 0.5, rv: 0.16, av: 0.4, metal: 0, bump: 0.0016, retro: 0, glow: 0, grime: 0.1, blood: 0 }),
  /* METAL   */ Object.freeze({ w: [0, 0, 0.3, 0.4], s: 4, rough: 0.42, rv: 0.2, av: 0.25, metal: 0.5, bump: 0.0003, retro: 0, glow: 0, grime: 0.3, blood: 1 }),
  /* GLOSS   */ Object.freeze({ w: [0, 0, 0, 0], s: 1, rough: 0.16, rv: 0, av: 0, metal: 0, bump: 0, retro: 0, glow: 0, grime: 0, blood: 0 }),
  /* KNIT    */ Object.freeze({ w: [1, 0, 0.3, 0], s: 8, rough: 0.95, rv: 0.04, av: 0.26, metal: 0, bump: 0.0024, retro: 0, glow: 0, grime: 0.7, blood: 1 }),
  /* POLYMER */ Object.freeze({ w: [0, 0, 1, 0.2], s: 10, rough: 0.62, rv: 0.12, av: 0.15, metal: 0, bump: 0.0004, retro: 0, glow: 0, grime: 0.4, blood: 1 }),
]);

// ---- 顶点：颜色 + rig 属性 ----
/** 一种「漆」：颜色 + 表面种类（soldier.js 的 rbox / ball / limb 接受数字颜色，也接受它） */
export const paint = (hex, surf = SURF.CLOTH) => Object.freeze({ hex, surf });
const _c = new THREE.Color();
/** 给几何体上色、标表面种类（rig.x = 种类，rig.y = 这种表面的沾脏倾向，等 weather 再按部位细算） */
export function paintGeo(geo, hex, surf = SURF.CLOTH) {
  _c.set(hex);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3), rig = new Uint8Array(n * 4), g = Math.round((SURF_PARAMS[surf]?.grime ?? 1) * 255);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; rig[i * 4] = surf; rig[i * 4 + 1] = g; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('rig', new THREE.BufferAttribute(rig, 4, true));
  return geo;
}
/** 合并前补齐：一组里有的带 rig、有的没带（拿数字颜色搭的零件），没带的当布料。都没带就不动（丧尸的旧模型照旧） */
export function ensureRig(list) {
  if (!list.some((g) => g.attributes.rig)) return list;
  for (const g of list) if (!g.attributes.rig) { const n = g.attributes.position.count, rig = new Uint8Array(n * 4); for (let i = 0; i < n; i++) rig[i * 4 + 1] = 255; g.setAttribute('rig', new THREE.BufferAttribute(rig, 4, true)); }
  return list;
}

/**
 * 把一堆零件合成一个不带索引的几何体（和 toNonIndexed + mergeGeometries 结果一样），但一次分配、紧循环拷贝——
 * 人形几十上百个零件，three 的通用合并要给每个零件先拆一份新数组，开局建人时慢好几倍。
 * 零件要有同样的属性（position、normal、uv、color、rig）；缺 rig 的先用 ensureRig 补。
 */
export function mergeFlat(list) {
  const names = Object.keys(list[0].attributes);
  let total = 0;
  for (const g of list) total += g.index ? g.index.count : g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const a0 = list[0].attributes[name], k = a0.itemSize, dst = new a0.array.constructor(total * k);
    let o = 0;
    for (const g of list) {
      const a = g.attributes[name], src = a.array, idx = g.index ? g.index.array : null;
      if (!a || a.itemSize !== k || a.isInterleavedBufferAttribute) throw new Error('mergeFlat: 零件属性不一致 ' + name);
      if (idx) { for (let i = 0; i < idx.length; i++) { const s = idx[i] * k; for (let j = 0; j < k; j++) dst[o++] = src[s + j]; } }
      else { dst.set(src.subarray(0, a.count * k), o); o += a.count * k; }
    }
    out.setAttribute(name, new THREE.BufferAttribute(dst, k, a0.normalized));
  }
  return out;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 便宜的三维值噪声（搭模型时按顶点算脏污的起伏用；0–1，可复现） */
export function noise3(x, y, z) {
  const h = (i, j, k) => { let n = (i * 374761393 + j * 668265263 + k * 1274126177) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = x - xi, v = y - yi, w = z - zi;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), sw = w * w * (3 - 2 * w);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), su), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), su), sv),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), su), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), su), sv), sw);
}

/** 站姿坐标的范围（米）：rest 属性按 ±REST_RANGE 存成 16 位整数 */
export const REST_RANGE = 2.5;
/** 一个材质里最多几处血迹 */
export const MAX_SPOTS = 8;
/**
 * 记下每个顶点站直时在骨架里的位置（rest 属性，4 个 16 位整数：x y z + 这个人是谁）。
 * at：这个部件的轴心在骨架里的位置；who：这个外观在材质里的编号（0–3，脏的程度、血迹按它取）。
 * 脏和血都在着色器里逐像素按这个位置算——圆角方块的大平面中间没有顶点，按顶点算的话背心正面永远是干净的。
 */
export function weather(geo, { at = [0, 0, 0], who = 0 } = {}) {
  const p = geo.attributes.position.array, n = geo.attributes.position.count, rest = new Int16Array(n * 4), k = 32767 / REST_RANGE;
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) { const x = Math.round((p[i * 3 + j] + at[j]) * k); rest[i * 4 + j] = x > 32767 ? 32767 : x < -32767 ? -32767 : x; }
  for (let i = 0; i < n; i++) rest[i * 4 + 3] = who;
  geo.setAttribute('rest', new THREE.BufferAttribute(rest, 4, true));
  return geo;
}
/**
 * 外观 → 着色器里的做旧参数：rigGrime（按 who 取的整体脏的程度）、rigSpot（血迹中心 xyz + 半径）、rigSpotK（是谁的、浓度）。
 * looks：[{ who, grime, blood: [{ c, r, k }] }]；多出来的血迹丢掉（最多 MAX_SPOTS 处）。
 */
export function lookUniforms(looks = []) {
  const grime = new THREE.Vector4(0.6, 0.6, 0.6, 0.6), spot = [], spotK = [];
  for (const L of looks) {
    const w = Math.max(0, Math.min(3, L.who | 0));
    grime.setComponent(w, L.grime ?? 0.6);
    for (const b of L.blood || []) if (spot.length < MAX_SPOTS) { spot.push(new THREE.Vector4(b.c[0], b.c[1], b.c[2], b.r)); spotK.push(new THREE.Vector2(w, b.k ?? 1)); }
  }
  while (spot.length < MAX_SPOTS) { spot.push(new THREE.Vector4(0, -9, 0, 0.001)); spotK.push(new THREE.Vector2(-1, 0)); }
  return { rigGrime: { value: grime }, rigSpot: { value: spot }, rigSpotK: { value: spotK } };
}

// ---- 细节图 ----
/** 这个内存档位用多大的细节图（0 = 不用） */
export function detailSize(mem = MEM) { return !mem || mem.pbrMaps === 'color' ? 0 : mem.lite ? 256 : 512; }

function lattice(cx, cy, seed) { let s = (seed >>> 0) || 1; const a = new Float32Array(cx * cy); for (let i = 0; i < a.length; i++) a[i] = (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; return { a, cx, cy }; }
function vn(L, u, v) { // 可平铺的值噪声，u, v ∈ [0, 1)
  const fx = u * L.cx, fy = v * L.cy, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const xa = x0 % L.cx, xb = (x0 + 1) % L.cx, ya = (y0 % L.cy) * L.cx, yb = ((y0 + 1) % L.cy) * L.cx, A = L.a;
  const p = A[ya + xa] + (A[ya + xb] - A[ya + xa]) * sx, q = A[yb + xa] + (A[yb + xb] - A[yb + xa]) * sx;
  return p + (q - p) * sy;
}
/** 生成细节图要用的格点（每次生成一份，按种子可复现） */
export function detailContext(size, seed = 11) {
  return {
    size, data: new Uint8Array(size * size * 4),
    fold1: lattice(3, 7, seed), fold2: lattice(7, 15, seed + 1), crease: lattice(5, 4, seed + 2), thread: lattice(Math.max(8, size >> 2), Math.max(8, size >> 2), seed + 3),
    grain1: lattice(48, 48, seed + 4), grain2: lattice(16, 16, seed + 5), grain3: lattice(96, 96, seed + 6),
    m1: lattice(4, 4, seed + 7), m2: lattice(8, 8, seed + 8), m3: lattice(16, 16, seed + 9), m4: lattice(32, 32, seed + 10),
  };
}
/**
 * 填 y0–y1 行（分帧调用）。纹理都按整数周期取，左右上下无缝。
 * R：斜纹的纹路（很浅）+ 衣褶（两层拉长的噪声折成脊线，主要起伏）；
 * G：科迪拉粗织（两向线交替的方格）+ 防撕格线 + 折痕；B：颗粒（皮革粒面、毛孔、橡胶麻面）；A：大块斑驳（多层噪声，拉开对比）。
 */
export function fillDetailRows(ctx, y0, y1) {
  const { size, data } = ctx, TAU = Math.PI * 2, ribs = size >> 2, thr = size >> 2, cells = size >> 3, grid = 16;
  for (let y = y0; y < y1; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size, i = (y * size + x) * 4;
      // R：斜纹 + 衣褶
      const rib = 0.5 + 0.5 * Math.cos(TAU * ribs * (u + v)), tn = vn(ctx.thread, u, v);
      const f = vn(ctx.fold1, u, v) * 0.65 + vn(ctx.fold2, u, v) * 0.35, fold = 1 - Math.abs(f * 2 - 1);
      const R = 0.06 * rib * (0.55 + 0.45 * tn) + 0.94 * fold * fold * (3 - 2 * fold);
      // G：粗织方格（每格一个方向的线）+ 防撕格 + 折痕
      const cxI = Math.floor(u * cells), cyI = Math.floor(v * cells), along = (cxI + cyI) & 1;
      const yarn = 0.5 - 0.5 * Math.cos(TAU * thr * (along ? u : v));
      const gu = (u * grid) % 1, gv = (v * grid) % 1, line = Math.max(Math.exp(-((gu - 0.5) ** 2) / 0.0012), Math.exp(-((gv - 0.5) ** 2) / 0.0012));
      const cr = vn(ctx.crease, u, v), crease = 1 - Math.abs(cr * 2 - 1);
      const G = 0.12 * yarn * (0.7 + 0.3 * tn) + 0.07 * line + 0.81 * crease;
      // B：颗粒
      const g1 = vn(ctx.grain1, u, v), g3 = vn(ctx.grain3, u, v), pebble = 1 - Math.abs(g1 * 2 - 1);
      const B = 0.5 * pebble + 0.3 * vn(ctx.grain2, u, v) + 0.2 * g3;
      // A：斑驳
      const m = vn(ctx.m1, u, v) * 0.45 + vn(ctx.m2, u, v) * 0.27 + vn(ctx.m3, u, v) * 0.17 + vn(ctx.m4, u, v) * 0.11;
      const A = Math.max(0, Math.min(1, (m - 0.5) * 2.1 + 0.5));
      data[i] = R * 255; data[i + 1] = G * 255; data[i + 2] = B * 255; data[i + 3] = A * 255;
    }
  }
  return y1;
}

// 共用的细节图：几个人（队友、劫持者）同一张，按引用计数释放
let shared = null;
const NEUTRAL = new Uint8Array(4 * 4 * 4).fill(128);
function dataTex(data, size) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = size > 4;
  t.colorSpace = THREE.NoColorSpace; t.name = 'rig-detail-' + size; t.needsUpdate = true;
  return t;
}
/**
 * 拿共用细节图的 uniform（{ value: 贴图 }）。生成是分帧的：先给 4×4 中性图，生成完把 value 换成真图。
 * 没有 document 或这个档位不用贴图时返回 null。
 */
export function acquireRigDetail(size = detailSize()) {
  if (!size || typeof document === 'undefined') return null;
  // 已经有一份就共用（档位中途换了也用已有的那份：细节图只有几百 KB，不值得为它另起一份）
  if (shared) { shared.refs++; return shared.uniform; }
  const neutral = dataTex(NEUTRAL, 4), ctx = detailContext(size);
  const S = shared = { size, refs: 1, uniform: { value: neutral }, neutral, tex: null, dead: false };
  let row = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const tick = typeof requestAnimationFrame === 'function' ? (f) => requestAnimationFrame(() => setTimeout(f, 0)) : (f) => setTimeout(f, 16);
  const step = () => {
    if (S.dead) return;
    const t0 = now();
    // 一帧最多 6 毫秒（512² 全部大约 100–200 毫秒，分二三十帧做完）
    while (row < size && now() - t0 < 6) row = fillDetailRows(ctx, row, Math.min(size, row + 2));
    if (row < size) { tick(step); return; }
    S.tex = dataTex(ctx.data, size); S.uniform.value = S.tex;
  };
  tick(step);
  return S.uniform;
}
export function releaseRigDetail() {
  if (!shared || --shared.refs > 0) return;
  shared.dead = true; shared.neutral.dispose(); shared.tex?.dispose(); shared = null;
}
/** 调试 / 测试：当前共用细节图的状态 */
export const rigDetailState = () => (shared ? { size: shared.size, refs: shared.refs, ready: !!shared.tex } : null);

// ---- 着色器 ----
const f1 = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(5)));
/** 按 SURF_PARAMS 生成 GLSL 的查表函数 rigSurf(t, w, a, b, c) */
export function surfGlsl(params = SURF_PARAMS) {
  const lines = params.map((p, i) => `${i ? 'else ' : ''}if (t == ${i}) { w = vec4(${p.w.map(f1).join(', ')}); a = vec4(${f1(p.s)}, ${f1(p.rough)}, ${f1(p.rv)}, ${f1(p.av)}); b = vec4(${f1(p.metal)}, ${f1(p.bump)}, ${f1(p.retro)}, ${f1(p.glow)}); c = ${f1(p.blood ? 1 : 0)}; }`);
  return `void rigSurf(int t, out vec4 w, out vec4 a, out vec4 b, out float c) {\n  w = vec4(0.0); a = vec4(4.0, 0.8, 0.1, 0.2); b = vec4(0.0); c = 1.0;\n  ${lines.join('\n  ')}\n}`;
}

const VERT_HEAD = `
attribute vec4 rig;
attribute vec4 rest;
varying vec4 vRig;
varying vec4 vRest;
varying vec3 vRigPos;
varying vec3 vRigN;
`;
const VERT_MAIN = `
vRig = rig; vRigPos = position; vRigN = normal;
vRest = vec4(rest.xyz * ${f1(REST_RANGE)}, rest.w * 32767.0);
`;
const FRAG_HEAD = `
varying vec4 vRig;
varying vec4 vRest;
varying vec3 vRigPos;
varying vec3 vRigN;
#ifdef RIG_DETAIL
uniform sampler2D rigDetail;
#endif
uniform vec4 rigGrime;
uniform vec4 rigSpot[${MAX_SPOTS}];
uniform vec2 rigSpotK[${MAX_SPOTS}];
float rigRetro = 0.0;
float rigRough = 0.8;
float rigMetal = 0.0;
float rigGlow = 0.0;
float rigH = 0.0;
`;
// 颜色之后：取细节、混高度、做旧（脏、血）、定粗糙度和金属度
const FRAG_SURF = `
{
  int rigT = int(vRig.x * 255.0 + 0.5);
  vec4 rw, ra, rb; float rc; rigSurf(rigT, rw, ra, rb, rc);
  vec4 rd = vec4(0.5);
  #ifdef RIG_DETAIL
    vec3 bw = pow(abs(normalize(vRigN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    rd = texture2D(rigDetail, vRigPos.zy * ra.x) * bw.x + texture2D(rigDetail, vRigPos.xz * ra.x) * bw.y + texture2D(rigDetail, vRigPos.xy * ra.x) * bw.z;
  #endif
  float wsum = max(1e-3, rw.x + rw.y + rw.z + rw.w), hn = dot(rd, rw) / wsum;
  rigH = hn * rb.y;
  // 织纹 / 颗粒的凹处暗一点；大块斑驳让布料有点褪色不匀
  diffuseColor.rgb *= 1.0 + ra.w * (hn - 0.5) * 1.6;
  diffuseColor.rgb *= 1.0 + 0.16 * ra.w * (rd.a - 0.5);
  float rough = ra.y + ra.z * (rd.a - 0.5) * 2.0 + (hn - 0.5) * 0.08;
  // 做旧按站直时的位置逐像素算：越往下越脏（裤腿、靴子），膝盖前面跪脏了一块；斑驳决定哪里先脏，颗粒让边缘碎
  vec3 rp = vRest.xyz; int who = int(vRest.w + 0.5);
  float gw = who == 0 ? rigGrime.x : who == 1 ? rigGrime.y : who == 2 ? rigGrime.z : rigGrime.w;
  float low = 0.38 + 0.62 * smoothstep(1.05, 0.08, rp.y);
  float knee = exp(-pow((rp.y - 0.5) / 0.08, 2.0)) * smoothstep(0.02, 0.06, rp.z) * 0.5;
  float g = gw * vRig.y * (low + knee);
  float dm = smoothstep(0.0, 0.3, g + rd.a * 0.8 + rd.b * 0.2 - 1.0) * min(1.0, g * 1.6);
  // 深色衣服上是一层浅灰土，浅色衣服上是发暗的污渍
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.062, 0.047), dm * 0.42);
  rough += dm * 0.08;
  // 血：干了的暗红褐色，中心浓、边缘碎成点（颗粒 + 斑驳定形）
  float bl = 0.0;
  for (int i = 0; i < ${MAX_SPOTS}; i++) {
    if (int(rigSpotK[i].x + 0.5) != who) continue;
    bl = max(bl, rigSpotK[i].y * smoothstep(rigSpot[i].w, rigSpot[i].w * 0.2, distance(rp, rigSpot[i].xyz)));
  }
  bl *= rc;
  float sp = rd.b * 0.45 + rd.a * 0.55;
  float bm = bl * smoothstep(0.72 - 0.4 * bl, 0.78 - 0.36 * bl, sp);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.055, 0.005, 0.004), bm * 0.92);
  rough = mix(rough, 0.4, bm);
  rigRough = clamp(rough, 0.05, 1.0);
  rigMetal = rb.x * (1.0 - dm);
  rigRetro = rb.z * (1.0 - dm * 0.7) * (1.0 - bm);
  rigGlow = rb.w * (1.0 - dm * 0.6);
}
`;
// 法线：高度（米）按屏幕导数求坡度（Mikkelsen 的 bump 公式，不归一化，远近一致）
const FRAG_BUMP = `
#ifdef RIG_DETAIL
{
  vec3 rp = -vViewPosition, dpx = dFdx(rp), dpy = dFdy(rp);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1) * faceDirection;
  vec3 grad = sign(det) * (dFdx(rigH) * r1 + dFdy(rigH) * r2);
  normal = normalize(abs(det) * normal - grad);
}
#endif
`;
const RETRO_LINE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';

/**
 * 给材质装上这套着色（onBeforeCompile）。detail：acquireRigDetail 的返回值（null = 不用细节图）；
 * looks：用这个材质的几种外观（脏的程度、血迹，见 lookUniforms）。
 */
export function patchRigShader(material, detail, looks = []) {
  const uniforms = lookUniforms(looks);
  material.defines = Object.assign(material.defines || {}, detail ? { RIG_DETAIL: '' } : {});
  material.customProgramCacheKey = () => 'rig-skin-2' + (detail ? 'd' : '');
  material.userData.rigUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (detail) shader.uniforms.rigDetail = detail;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + VERT_MAIN);
    const pars = THREE.ShaderChunk.lights_physical_pars_fragment.replace(RETRO_LINE,
      // 逆反射：光源方向和视线越重合越亮（手电挂在镜头上，几乎重合）
      `${RETRO_LINE}\n\treflectedLight.directSpecular += rigRetro * irradiance * pow( saturate( dot( directLight.direction, geometryViewDir ) ), 12.0 );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + FRAG_HEAD + surfGlsl())
      .replace('#include <lights_physical_pars_fragment>', pars)
      .replace('#include <color_fragment>', '#include <color_fragment>' + FRAG_SURF)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rigRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = rigMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + FRAG_BUMP)
      // 自发光按颜色走（原来的整体提亮会把黑衣服也抬成一层灰）；荧光布自己亮一点；反光条留一丝亮，黑里认得出人
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.3 + 2.4 * diffuseColor.rgb;\ntotalEmissiveRadiance += diffuseColor.rgb * rigGlow + rigRetro * vec3(0.004, 0.0045, 0.005);');
  };
  return material;
}

/**
 * 建一个人形用的材质（几个人共用一个）：MeshStandardMaterial + 顶点色 + 上面那套着色。looks：用它的外观（who 编号、脏、血）。
 * 释放材质时（material.dispose()）顺带归还共用细节图。
 */
export function createRigMaterial({ name = 'rig', emissive = 0x000000, looks = [], detail = true } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, emissive, name });
  const uniform = detail ? acquireRigDetail() : null;
  patchRigShader(mat, uniform, looks);
  if (uniform) { let done = false; mat.addEventListener('dispose', () => { if (!done) { done = true; releaseRigDetail(); } }); }
  return mat;
}

// ---- 人头 ----
const gauss = (a, s) => Math.exp(-((a / s) ** 2));
/**
 * 头型：单位球上的方向 (nx, ny, nz)（+z 是脸）→ 雕过的点（还是单位尺度，之后乘三个半径）。
 * 下颌收窄、后颈收进、脸面略平、眉骨、眼窝、鼻梁、颧骨、下巴。k：雕刻的力度（面罩里的头用一半）。
 */
export function sculpt(nx, ny, nz, k = 1) {
  let x = nx, z = nz;
  const front = smooth(0.15, 0.85, nz), low = smooth(0.05, -0.85, ny);
  x *= 1 - 0.2 * low * k;
  if (nz < 0) z *= 1 - 0.25 * low * k;
  z *= 1 - 0.08 * front * (1 - Math.abs(nx)) * k;
  z += k * front * (0.085 * gauss(ny - 0.22, 0.08) * gauss(nx, 0.55)
    - 0.095 * (gauss(nx - 0.33, 0.13) + gauss(nx + 0.33, 0.13)) * gauss(ny - 0.07, 0.085)
    + 0.05 * gauss(nx, 0.09) * gauss(ny - 0.02, 0.14)
    + 0.06 * gauss(nx, 0.3) * gauss(ny + 0.8, 0.13));
  const cheek = k * 0.065 * gauss(Math.abs(nx) - 0.6, 0.15) * gauss(ny + 0.1, 0.15) * smooth(0, 0.6, nz);
  x += Math.sign(nx) * cheek; z += cheek * 0.5;
  return [x, ny, z];
}
/** 脸上某一点（单位方向 → 头的局部坐标，米） */
export function facePoint(head, nx, ny) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), [x, y, z] = sculpt(nx, ny, nz, head.k ?? 1);
  return [head.c[0] + x * head.r[0], head.c[1] + y * head.r[1], head.c[2] + z * head.r[2]];
}
function sculptedSphere(head, seg, ring, scaleAt = null) {
  const g = new THREE.SphereGeometry(1, seg, ring), p = g.attributes.position, k = head.k ?? 1;
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i), [x, y, z] = sculpt(nx, ny, nz, k), s = scaleAt ? scaleAt(nx, ny, nz) : 1;
    p.setXYZ(i, head.c[0] + x * head.r[0] * s, head.c[1] + y * head.r[1] * s, head.c[2] + z * head.r[2] * s);
  }
  g.computeVertexNormals();
  return g;
}
function shade(geo, fn) { // 顶点色逐点乘一个 (r, g, b) 系数
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) { const m = fn(p.getX(i), p.getY(i), p.getZ(i)); c.setXYZ(i, c.getX(i) * m[0], c.getY(i) * m[1], c.getZ(i) * m[2]); }
  return geo;
}
const ellip = (hex, surf, r, at, rot = null) => { const g = new THREE.SphereGeometry(1, 12, 9); g.scale(r[0], r[1], r[2]); if (rot) g.rotateX(rot); g.translate(at[0], at[1], at[2]); return paintGeo(g, hex, surf); };
function rod(hex, surf, a, b, r, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return paintGeo(g, hex, surf);
}

/**
 * 一颗真人的头：雕过的头型（皮肤，顶点色里有眼窝的暗、颧骨的暖、男的下半脸胡茬青），鼻子、眼睛（眼白 + 虹膜 + 上眼皮）、
 * 眉毛、嘴唇、耳朵。都是小几何体，合进头那个网格（不另加材质和 draw call）。
 * o：{ c 头心, r 三个半径, skin, lip, brow（眉毛颜色）, iris, stubble（胡茬，0–1）, k（骨相的力度，女的柔和些）, nose（鼻子大小）}
 */
export function humanHead(o) {
  const head = { c: o.c, r: o.r, k: o.k ?? 1 }, out = [], ns = o.nose ?? 1;
  const skull = paintGeo(sculptedSphere(head, 40, 30), o.skin, SURF.SKIN);
  shade(skull, (x, y, z) => {
    const nx = (x - o.c[0]) / o.r[0], ny = (y - o.c[1]) / o.r[1], nz = (z - o.c[2]) / o.r[2];
    const socket = (gauss(nx - 0.33, 0.17) + gauss(nx + 0.33, 0.17)) * gauss(ny - 0.08, 0.12) * smooth(0.3, 0.9, nz);
    const cheek = gauss(Math.abs(nx) - 0.5, 0.18) * gauss(ny + 0.2, 0.16) * smooth(0.2, 0.8, nz);
    const beard = (o.stubble || 0) * smooth(-0.25, -0.5, ny) * smooth(-0.1, 0.4, nz) * (1 - 0.6 * gauss(nx, 0.2) * gauss(ny + 0.52, 0.07));
    const under = smooth(-0.55, -0.95, ny) * 0.25; // 下巴底下背光
    const k = (1 - 0.22 * socket) * (1 - under) * (1 - 0.28 * beard);
    return [k * (1 + 0.06 * cheek) * (1 - 0.06 * beard), k * (1 - 0.01 * cheek) * (1 - 0.02 * beard), k * (1 - 0.03 * cheek) * (1 + 0.04 * beard)];
  });
  out.push(skull);
  // 鼻子：鼻梁窄、往下渐宽到鼻头的一段锥（顺着鼻梁斜出脸面），鼻头一个小球，两侧鼻翼贴在脸上
  const br = facePoint(head, 0, 0.0), tp = facePoint(head, 0, -0.26);
  const bridge = [br[0], br[1], br[2] - 0.003], tip = [tp[0], tp[1] + 0.002, tp[2] + 0.012 * ns];
  const nose = rod(o.skin, SURF.SKIN, bridge, tip, 1, 8); // 先按单位半径搭，再逐点按长度收窄
  { const p = nose.attributes.position, L = Math.hypot(tip[1] - bridge[1], tip[2] - bridge[2]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = Math.max(0, Math.min(1, ((bridge[1] - y) * (bridge[1] - tip[1]) + (z - bridge[2]) * (tip[2] - bridge[2])) / (L * L)));
      const ax = bridge[0], ay = bridge[1] + (tip[1] - bridge[1]) * t, az = bridge[2] + (tip[2] - bridge[2]) * t, r = (0.0042 + 0.0035 * t) * (0.6 + 0.4 * ns);
      p.setXYZ(i, ax + (x - ax) * r, ay + (y - ay) * r, az + (z - az) * r * 0.9);
    }
    nose.computeVertexNormals(); }
  out.push(nose, ellip(o.skin, SURF.SKIN, [0.0072 * ns, 0.0068 * ns, 0.0068 * ns], [tip[0], tip[1] - 0.001, tip[2] - 0.0035]));
  for (const s of [-1, 1]) out.push(ellip(o.skin, SURF.SKIN, [0.0052 * ns, 0.0045 * ns, 0.0055], [tip[0] + s * 0.0072 * ns, tip[1] - 0.0022, tip[2] - 0.0088]));
  // 眼睛：眼白（不是纯白，偏暖灰）、虹膜、上眼皮压一点
  for (const s of [-1, 1]) {
    const e = facePoint(head, s * 0.33, 0.07);
    out.push(ellip(0xa49a8e, SURF.GLOSS, [0.0115, 0.0095, 0.008], [e[0], e[1], e[2] - 0.0045]));
    out.push(ellip(o.iris ?? 0x2a1c14, SURF.GLOSS, [0.0064, 0.0066, 0.003], [e[0] - s * 0.0005, e[1] - 0.0006, e[2] + 0.0024]));
    out.push(rod(o.skin, SURF.SKIN, [e[0] - 0.012, e[1] + 0.0062, e[2] - 0.0032], [e[0] + 0.012, e[1] + 0.0062, e[2] - 0.0032], 0.0042, 6));
    out.push(rod(o.brow, SURF.HAIR, [e[0] - 0.0115, e[1] + 0.0032, e[2] - 0.0005], [e[0] + 0.0115, e[1] + 0.0036, e[2] - 0.0012], 0.0014, 4)); // 睫毛线
    // 眉毛：两段，外端略低
    const b0 = facePoint(head, s * 0.15, 0.27), b1 = facePoint(head, s * 0.33, 0.3), b2 = facePoint(head, s * 0.52, 0.24);
    out.push(rod(o.brow, SURF.HAIR, [b0[0], b0[1], b0[2] - 0.001], [b1[0], b1[1], b1[2] - 0.001], 0.0024, 5), rod(o.brow, SURF.HAIR, [b1[0], b1[1], b1[2] - 0.001], [b2[0], b2[1], b2[2] - 0.0025], 0.002, 5));
  }
  // 嘴唇：上唇薄、下唇厚一点，颜色比皮肤深、偏红
  const m = facePoint(head, 0, -0.5);
  out.push(ellip(o.lip, SURF.SKIN, [0.019, 0.0048, 0.007], [m[0], m[1] + 0.0042, m[2] - 0.003]), ellip(o.lip, SURF.SKIN, [0.017, 0.0058, 0.0075], [m[0], m[1] - 0.0048, m[2] - 0.0035]));
  // 耳朵
  for (const s of [-1, 1]) { const g = new THREE.SphereGeometry(1, 10, 8); g.scale(0.008, 0.026, 0.017); g.rotateY(s * 0.35); g.translate(o.c[0] + s * o.r[0] * 0.93, o.c[1] - 0.004, o.c[2] - 0.006); out.push(paintGeo(g, o.skin, SURF.SKIN)); }
  return out;
}

/**
 * 头发：比头大一圈的同形壳，发际线以外的顶点缩进头里藏起来（边缘自然收薄）。
 * line(nz)：发际线在什么高度（ny），按脸前（nz = 1）到脑后（nz = -1）插值；inflate：头发厚度。
 */
export function hairShell(o) {
  const head = { c: o.c, r: o.r, k: o.k ?? 1 }, [front, side, back] = o.line;
  const at = (nx, ny, nz) => {
    const t = nz >= 0 ? side + (front - side) * nz : side + (back - side) * -nz;
    const w = smooth(t - 0.05, t + 0.06, ny);
    // 头顶最厚，往两边收（贴头皮的短发 / 扎起来的长发）
    return 0.94 + (o.inflate - 0.94 + 0.02 * smooth(0.3, 0.95, ny) + 0.018 * (noise3(nx * 6, ny * 9, nz * 6) - 0.5)) * w;
  };
  const g = paintGeo(sculptedSphere(head, 30, 22, at), o.hair, SURF.HAIR);
  return shade(g, (x, y, z) => { const n = 0.88 + 0.24 * noise3(x * 90, y * 40, z * 90); return [n, n, n * 1.02]; });
}
