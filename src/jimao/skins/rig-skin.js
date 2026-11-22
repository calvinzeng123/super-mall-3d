// 队友（阿哲、林医生）和劫持者那副程序骨架（soldier.js buildParts）的「真人装备」质感。
// 骨架本身是圆角方块、胶囊、球拼起来的，每个人一个材质、几个网格（顶点色上色，没有 UV 能用——拼合件的 UV 各管各的，比例不一）。
// 所以这里不画「衣服贴图」，而是：
//   1) 每个顶点带一个 rig 属性（4 个字节）：x 表面种类（布、科迪拉、荧光网布、反光条、皮、橡胶、塑料、皮肤、头发、金属……）、
//      y 这种表面沾脏的倾向、z 贴花槽（脸、背后印字、胸牌；0 = 没有）、w 贴花的浓度（脸往两侧渐隐）。
//      再带一个 rest 属性（8 个字节）：站直时在骨架里的位置 + 这是哪个人。纹理、脏和血在着色器里都按这个位置逐像素算——
//      各部件在站姿里朝向一致，按它投影的斑驳在关节两边接得上；圆角方块的大平面中间没有顶点，按顶点算的话背心正面永远是干净的。
//   2) 两张共用的小细节图（程序生成，可平铺），按物体空间三向投影（triplanar）采样：
//      细图（每种表面自己的尺度，几厘米一块）：R 斜纹、G 平纹 / 网布 / 科迪拉的编织、B 颗粒（皮革粒面、毛孔、反光条的玻璃微珠）、
//        A 防撕格的粗线 + 纤维毛糙——织纹是一两毫米一个周期，近看是布，远了 mipmap 把它平均成一点粗糙度，不闪；
//      粗图（统一 40 厘米一块）：R G 两层拉长的衣褶、B 中等斑驳（脏的边缘）、A 大块褪色。
//      上一版把衣褶和织纹塞在同一张图里：要么织纹粗成 1 厘米的方格，要么衣褶碎成一层「锡纸」，所以拆成两张。
//   3) 法线：高度（米）用屏幕导数求坡度扰动法线（和 three 的 bumpMap 同一个公式，但不归一化导数，远近起伏一致）。
//      关节处（膝盖、肘弯、裆部）另外按站姿位置加几圈褶，比随机的鼓包更像布。
//   4) 反光条：真的逆反射——光从哪来就往哪反，手电挂在镜头上，所以手电一照，银灰色的反光条就亮起来；白天太阳不在身后就只是银灰。
//   5) 脸：一张小贴花图（画在 canvas 上：杏仁眼的眼白、虹膜、上眼睑线、眉毛、鼻翼阴影、唇形、胡茬），
//      按站姿位置从正面平面投影到雕过的头上；同一张图里还有阿哲背后的「保安」印字和林医生的胸牌。
// 每个人还是一个材质、网格数不变（不加 draw call）。贴图按内存档位：省内存档（compact）一张都不要（只有按种类的粗糙度、反光条，
// 脸用小几何体的眼睛眉毛），手机两档细图 256² + 粗图 128² + 贴花 256×192，电脑 512² + 256² + 512×384。
// 生成很快（512² 在桌面上二三十毫秒），所以拿的时候同步生成——人物第一帧就是带纹理的，不会过几秒才「长」出细节；
// 浏览器里本模块一加载就分帧预生成，真到建人的时候多半已经做好。
// 没有 document（node 测试）时不生成贴图，材质照样能建、能用。
import * as THREE from 'three';
import { MEM } from '../../render/device.js';

/** 表面种类（顶点 rig 属性的 x，按 0–255 存） */
export const SURF = Object.freeze({ CLOTH: 0, SCRUBS: 1, CORDURA: 2, HIVIS: 3, RETRO: 4, LEATHER: 5, RUBBER: 6, PLASTIC: 7, SKIN: 8, HAIR: 9, METAL: 10, GLOSS: 11, KNIT: 12, POLYMER: 13 });

/**
 * 每种表面的参数。w：细图 R G B A 四个通道各占多少（混成织纹高度）；s：细图每米重复几次；
 * fold：粗图衣褶 + 关节褶的起伏（米；硬的东西是 0）；rough / rv：粗糙度和它随斑驳起伏多少；av：颜色随织纹起伏多少；
 * metal：金属度；bump：织纹起伏深度（米）；retro：逆反射强度（只有反光条）；glow：荧光布的自发光（黑里也看得出荧光黄）；
 * grime：这种表面沾脏的倾向；blood：沾不沾血（皮肤、头发、镜片不画）；scuff：硬壳上的磨痕（安全帽、头盔、枪）；
 * kind：1 = 针织（面罩：按头一圈的竖罗纹）；2 = 头发（顺着梳的方向一缕缕）；3 = 硬壳（安全帽、头盔：细的划痕）。
 * 织纹周期：细图 R 每块 48 道斜纹、G 每块 64 格编织、A 每块 12 道防撕格——按 s 换算，布料 2.4–3.7 毫米、防撕格 1.3 厘米。
 * 比真布粗一倍：真实的 1–2 毫米在一两米外、720p 下不到一个像素，mipmap 一平均就成了光板（上一版评审：「看不出织纹」）。
 */
export const SURF_PARAMS = Object.freeze([
  /* CLOTH   */ Object.freeze({ w: [1, 0.15, 0.15, 0.25], s: 6.5, fold: 0.0024, rough: 0.86, rv: 0.07, av: 0.3, metal: 0, bump: 0.00045, retro: 0, glow: 0, grime: 1, blood: 1, scuff: 0, kind: 0 }),
  /* SCRUBS  */ Object.freeze({ w: [0.25, 1, 0.1, 0], s: 6.5, fold: 0.0022, rough: 0.85, rv: 0.05, av: 0.22, metal: 0, bump: 0.00035, retro: 0, glow: 0, grime: 0.9, blood: 1, scuff: 0, kind: 0 }),
  /* CORDURA */ Object.freeze({ w: [0, 1, 0.25, 0.2], s: 4.5, fold: 0.0006, rough: 0.75, rv: 0.06, av: 0.35, metal: 0, bump: 0.0006, retro: 0, glow: 0, grime: 1, blood: 1, scuff: 0, kind: 0 }),
  /* HIVIS   */ Object.freeze({ w: [0, 1, 0.1, 0], s: 4.2, fold: 0.0013, rough: 0.66, rv: 0.06, av: 0.3, metal: 0, bump: 0.0005, retro: 0, glow: 0.035, grime: 0.8, blood: 1, scuff: 0, kind: 0 }),
  /* RETRO   */ Object.freeze({ w: [0, 0.15, 1, 0], s: 30, fold: 0.0006, rough: 0.26, rv: 0.08, av: 0.08, metal: 0.6, bump: 0.00004, retro: 1.1, glow: 0, grime: 0.5, blood: 1, scuff: 0, kind: 0 }),
  /* LEATHER */ Object.freeze({ w: [0, 0, 1, 0], s: 10, fold: 0.0012, rough: 0.58, rv: 0.14, av: 0.2, metal: 0, bump: 0.0003, retro: 0, glow: 0, grime: 0.75, blood: 1, scuff: 0.3, kind: 0 }),
  /* RUBBER  */ Object.freeze({ w: [0, 0, 1, 0], s: 20, fold: 0, rough: 0.7, rv: 0.06, av: 0.08, metal: 0, bump: 0.0001, retro: 0, glow: 0, grime: 1, blood: 1, scuff: 0, kind: 0 }),
  /* PLASTIC */ Object.freeze({ w: [0, 0, 1, 0], s: 10, fold: 0, rough: 0.45, rv: 0.12, av: 0.04, metal: 0, bump: 0.00002, retro: 0, glow: 0, grime: 0.6, blood: 1, scuff: 1, kind: 3 }),
  /* SKIN    */ Object.freeze({ w: [0, 0, 1, 0], s: 40, fold: 0, rough: 0.55, rv: 0.06, av: 0.05, metal: 0, bump: 0.00004, retro: 0, glow: 0, grime: 0.3, blood: 0, scuff: 0, kind: 0 }),
  /* HAIR    */ Object.freeze({ w: [0, 0, 0.35, 0], s: 40, fold: 0, rough: 0.55, rv: 0.12, av: 0.45, metal: 0, bump: 0.00016, retro: 0, glow: 0, grime: 0.1, blood: 0, scuff: 0, kind: 2 }),
  /* METAL   */ Object.freeze({ w: [0, 0, 1, 0], s: 10, fold: 0, rough: 0.36, rv: 0.14, av: 0.08, metal: 0.6, bump: 0.00002, retro: 0, glow: 0, grime: 0.3, blood: 0, scuff: 1, kind: 0 }),
  /* GLOSS   */ Object.freeze({ w: [0, 0, 0, 0], s: 1, fold: 0, rough: 0.15, rv: 0, av: 0, metal: 0, bump: 0, retro: 0, glow: 0, grime: 0, blood: 0, scuff: 0, kind: 0 }),
  /* KNIT    */ Object.freeze({ w: [0, 0.6, 0.4, 0], s: 8, fold: 0.0009, rough: 0.95, rv: 0.04, av: 0.24, metal: 0, bump: 0.0004, retro: 0, glow: 0, grime: 0.7, blood: 1, scuff: 0, kind: 1 }),
  /* POLYMER */ Object.freeze({ w: [0, 0, 1, 0], s: 14, fold: 0, rough: 0.55, rv: 0.1, av: 0.08, metal: 0, bump: 0.00004, retro: 0, glow: 0, grime: 0.4, blood: 0, scuff: 0.5, kind: 0 }),
]);

// ---- 顶点：颜色 + rig 属性 ----
/** 一种「漆」：颜色 + 表面种类（soldier.js 的 rbox / ball / limb 接受数字颜色，也接受它） */
export const paint = (hex, surf = SURF.CLOTH) => Object.freeze({ hex, surf });
const _c = new THREE.Color();
/** 给几何体上色、标表面种类（rig.x = 种类，rig.y = 这种表面的沾脏倾向，z / w = 贴花槽和浓度，默认没有） */
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
/** 标贴花：slot 槽号（见 DECAL），weight(x, y, z) → 0–1 浓度（缺省全是 1）。整件同一个槽号，免得插值出别的槽 */
export function decalGeo(geo, slot, weight = null) {
  const r = geo.attributes.rig.array, p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { r[i * 4 + 2] = slot; r[i * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, weight ? weight(p.getX(i), p.getY(i), p.getZ(i)) : 1))); }
  geo.attributes.rig.needsUpdate = true;
  return geo;
}
/** 按位置改沾脏倾向（rig.y）：f(x, y, z) → 0–1（背心下摆、袖口这些边上更脏） */
export function grimeGeo(geo, f) {
  const r = geo.attributes.rig.array, p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) r[i * 4 + 1] = Math.round(255 * Math.max(0, Math.min(1, f(p.getX(i), p.getY(i), p.getZ(i)))));
  return geo;
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
/** 便宜的三维值噪声（搭模型时按顶点算起伏用；0–1，可复现） */
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
export const MAX_SPOTS = 12;
/**
 * 记下每个顶点站直时在骨架里的位置（rest 属性，4 个 16 位整数：x y z + 这个人是谁）。
 * at：这个部件的轴心在骨架里的位置；who：这个外观在材质里的编号（0–3，脏的程度、血迹按它取）。
 */
export function weather(geo, { at = [0, 0, 0], who = 0 } = {}) {
  const p = geo.attributes.position.array, n = geo.attributes.position.count, rest = new Int16Array(n * 4), k = 32767 / REST_RANGE;
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) { const x = Math.round((p[i * 3 + j] + at[j]) * k); rest[i * 4 + j] = x > 32767 ? 32767 : x < -32767 ? -32767 : x; }
  for (let i = 0; i < n; i++) rest[i * 4 + 3] = who;
  geo.setAttribute('rest', new THREE.BufferAttribute(rest, 4, true));
  return geo;
}
/**
 * 外观 → 着色器里的做旧参数：rigGrime（按 who 取的整体脏的程度）、rigSpot（血迹中心 xyz + 半径）、
 * rigSpotK（是谁的、浓度、往下拖多长、拖的方向）。
 * looks：[{ who, grime, blood: [{ c, r, k, e, a }] }]——e：顺着 a 的方向拉长几倍（溅上去往下淌、抹出去的一道），
 * a：方向（弧度，0 = 竖直往下，正值往人的左手边斜）。多出来的血迹丢掉（最多 MAX_SPOTS 处）。
 */
export function lookUniforms(looks = []) {
  const grime = new THREE.Vector4(0.6, 0.6, 0.6, 0.6), spot = [], spotK = [];
  for (const L of looks) {
    const w = Math.max(0, Math.min(3, L.who | 0));
    grime.setComponent(w, L.grime ?? 0.6);
    for (const b of L.blood || []) if (spot.length < MAX_SPOTS) { spot.push(new THREE.Vector4(b.c[0], b.c[1], b.c[2], b.r)); spotK.push(new THREE.Vector4(w, b.k ?? 1, Math.max(1, b.e ?? 1), b.a ?? 0)); }
  }
  while (spot.length < MAX_SPOTS) { spot.push(new THREE.Vector4(0, -9, 0, 0.001)); spotK.push(new THREE.Vector4(-1, 0, 1, 0)); }
  return { rigGrime: { value: grime }, rigSpot: { value: spot }, rigSpotK: { value: spotK } };
}

// ---- 细节图 ----
/** 这个内存档位用多大的细图（0 = 不用）；粗图是它的一半 */
export function detailSize(mem = MEM) { return !mem || mem.pbrMaps === 'color' ? 0 : mem.lite ? 256 : 512; }

function lattice(cx, cy, seed) { let s = (seed >>> 0) || 1; const a = new Float32Array(cx * cy); for (let i = 0; i < a.length; i++) a[i] = (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; return a; }
/**
 * 一层可平铺的值噪声（cx × cy 个格子铺满一块图）。按列先算好格子号和插值系数，每行只算一次行系数——
 * 一个像素就是四次取值三次插值，比逐像素调噪声函数快好几倍（512² 的图要叠十来层）。
 */
function layer(size, cx, cy, seed) {
  const a = lattice(cx, cy, seed), x0 = new Int32Array(size), x1 = new Int32Array(size), sx = new Float32Array(size);
  for (let x = 0; x < size; x++) { const f = x / size * cx, i = Math.floor(f), t = f - i; x0[x] = i % cx; x1[x] = (i + 1) % cx; sx[x] = t * t * (3 - 2 * t); }
  return { a, cx, cy, x0, x1, sx };
}
/** 第 y 行的噪声加到 out 上：mode 0 原值，1 折成脊线（1 - |2n - 1|，衣褶、皮革粒面） */
function addRow(Lr, size, y, out, amp, mode = 0) {
  const f = y / size * Lr.cy, i = Math.floor(f), t = f - i, sy = t * t * (3 - 2 * t), ya = (i % Lr.cy) * Lr.cx, yb = ((i + 1) % Lr.cy) * Lr.cx;
  const A = Lr.a, x0 = Lr.x0, x1 = Lr.x1, sx = Lr.sx;
  for (let x = 0; x < size; x++) {
    const p = A[ya + x0[x]] + (A[ya + x1[x]] - A[ya + x0[x]]) * sx[x], q = A[yb + x0[x]] + (A[yb + x1[x]] - A[yb + x0[x]]) * sx[x];
    const n = p + (q - p) * sy;
    out[x] += amp * (mode ? 1 - Math.abs(n * 2 - 1) : n);
  }
}
/** 细图的生成上下文（每次生成一份，按种子可复现） */
export function detailContext(size, seed = 11) {
  return {
    size, data: new Uint8Array(size * size * 4), row: new Float32Array(size * 4),
    fiber: layer(size, Math.max(8, size >> 2), Math.max(8, size >> 2), seed + 3),
    grain1: layer(size, 96, 96, seed + 4), grain2: layer(size, 32, 32, seed + 5), grain3: layer(size, 160 > size >> 1 ? size >> 1 : 160, 160 > size >> 1 ? size >> 1 : 160, seed + 6),
    slub: layer(size, 6, 48, seed + 7),
  };
}
/**
 * 细图：填 y0–y1 行（可以分帧调用）。所有周期都是整数，左右上下无缝。
 * R：斜纹（2/1 斜纹布：45° 的斜向纹路，经纬线交叉的小起伏，纱线粗细不匀）；
 * G：平纹 / 方平编织（经纬一上一下，相邻格错开，像网布和科迪拉；不是上一版那种 1 厘米的大方格）；
 * B：颗粒（皮革粒面、毛孔、玻璃微珠，两层脊线噪声 + 一层细噪声）；A：防撕格（每块 12 道粗线）+ 纤维毛糙。
 */
export function fillDetailRows(ctx, y0, y1) {
  const { size, data } = ctx, TAU = Math.PI * 2, KR = 48, KG = 64, KA = 12, R = ctx.row;
  const fib = R.subarray(0, size), gr = R.subarray(size, size * 2), sl = R.subarray(size * 2, size * 3);
  // 只和列有关的量先算成表（每张图一次）：一个像素就只剩查表和乘加
  if (!ctx.cols) {
    const c = ctx.cols = { cd: new Float32Array(size), sd: new Float32Array(size), cx2: new Float32Array(size), cg: new Float32Array(size), sg: new Float32Array(size), pg: new Float32Array(size), ln: new Float32Array(size) };
    for (let x = 0; x < size; x++) {
      const u = x / size, aG = u * KG, ix = Math.floor(aG), gu = (u * KA) % 1;
      c.cd[x] = Math.cos(TAU * KR * u); c.sd[x] = Math.sin(TAU * KR * u); c.cx2[x] = 0.5 + 0.5 * Math.cos(TAU * KR * 2 * u);
      c.cg[x] = Math.cos(Math.PI * (aG - 0.5)); c.sg[x] = Math.sin(Math.PI * (aG - ix)); c.pg[x] = (ix + 1) & 1 ? -1 : 1; c.ln[x] = Math.exp(-((gu - 0.5) ** 2) / 0.0009);
    }
  }
  const { cd, sd, cx2, cg, sg, pg, ln } = ctx.cols;
  for (let y = y0; y < y1; y++) {
    fib.fill(0); gr.fill(0); sl.fill(0);
    addRow(ctx.fiber, size, y, fib, 1);
    addRow(ctx.grain1, size, y, gr, 0.5, 1); addRow(ctx.grain2, size, y, gr, 0.25); addRow(ctx.grain3, size, y, gr, 0.25, 1);
    addRow(ctx.slub, size, y, sl, 1);
    const v = y / size, bG = v * KG, iyG = Math.floor(bG), gv = (v * KA) % 1;
    const cv = Math.cos(TAU * KR * v), sv = Math.sin(TAU * KR * v), cy2 = 0.5 + 0.5 * Math.cos(TAU * KR * 2 * v);
    const sfb = Math.sin(Math.PI * (bG - iyG)), py = iyG & 1 ? -1 : 1, cb = Math.cos(Math.PI * (bG - 0.5)), lv = Math.exp(-((gv - 0.5) ** 2) / 0.0009);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // R：斜纹——斜向的纹路为主（cos(K(u+v)) 用和角公式拆成行、列两张表），经纬交叉处一点起伏，纱线粗细（slub）让纹路深浅不匀
      const diag = 0.5 + 0.5 * (cd[x] * cv - sd[x] * sv);
      const Rv = (0.62 * diag + 0.2 * cx2[x] * cy2) * (0.75 + 0.25 * sl[x]) + 0.18 * fib[x];
      // G：平纹——横线在第 iy 行、竖线在第 ix 列，格子中心一上一下交替（相邻行错开一格）
      const hx = sfb * (0.72 + 0.28 * cg[x] * py), hy = sg[x] * (0.72 + 0.28 * cb * pg[x]);
      const Gv = 0.85 * (hx > hy ? hx : hy) + 0.15 * fib[x];
      // A：防撕格的粗线（两向）+ 纤维
      const Av = 0.6 * (ln[x] > lv ? ln[x] : lv) + 0.4 * fib[x];
      data[i] = Rv * 255; data[i + 1] = Gv * 255; data[i + 2] = (gr[x] < 1 ? gr[x] : 1) * 255; data[i + 3] = Av * 255;
    }
  }
  return y1;
}
/** 粗图的生成上下文（统一 40 厘米一块） */
export function macroContext(size, seed = 23) {
  return {
    size, data: new Uint8Array(size * size * 4), row: new Float32Array(size * 4),
    fold1: layer(size, 3, 7, seed), fold2: layer(size, 6, 13, seed + 1), crease1: layer(size, 7, 3, seed + 2), crease2: layer(size, 13, 5, seed + 3),
    b1: layer(size, 8, 8, seed + 4), b2: layer(size, 16, 16, seed + 5), b3: layer(size, 32, 32, seed + 6),
    m1: layer(size, 3, 3, seed + 7), m2: layer(size, 6, 6, seed + 8),
  };
}
/**
 * 粗图：R 竖向拉长的衣褶（布垂下来的褶）、G 横向拉长的压痕（坐、蹲出来的褶），两层都折成脊线；
 * B 中等斑驳（脏的边缘、血迹边缘的碎）；A 大块褪色。都是低频，拉开对比存满 0–255。
 */
export function fillMacroRows(ctx, y0, y1) {
  const { size, data } = ctx, R = ctx.row, a = R.subarray(0, size), b = R.subarray(size, size * 2), c = R.subarray(size * 2, size * 3), d = R.subarray(size * 3, size * 4);
  for (let y = y0; y < y1; y++) {
    a.fill(0); b.fill(0); c.fill(0); d.fill(0);
    addRow(ctx.fold1, size, y, a, 0.65, 1); addRow(ctx.fold2, size, y, a, 0.35, 1);
    addRow(ctx.crease1, size, y, b, 0.6, 1); addRow(ctx.crease2, size, y, b, 0.4, 1);
    addRow(ctx.b1, size, y, c, 0.5); addRow(ctx.b2, size, y, c, 0.3); addRow(ctx.b3, size, y, c, 0.2);
    addRow(ctx.m1, size, y, d, 0.65); addRow(ctx.m2, size, y, d, 0.35);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, s = (q, k) => Math.max(0, Math.min(255, ((q - 0.5) * k + 0.5) * 255));
      data[i] = s(a[x], 1.4); data[i + 1] = s(b[x], 1.4); data[i + 2] = s(c[x], 2.2); data[i + 3] = s(d[x], 2.4);
    }
  }
  return y1;
}

// 共用的细节图：几个人（队友、劫持者）同一份，按引用计数释放
let shared = null, pre = null;
function dataTex(data, size, name) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.name = name; t.needsUpdate = true;
  return t;
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function bakeJob(size) { return { size, fine: detailContext(size), macro: macroContext(size >> 1), fy: 0, my: 0 }; }
function runJob(J, budget = Infinity) {
  const t0 = now();
  while (J.fy < J.size && now() - t0 < budget) J.fy = fillDetailRows(J.fine, J.fy, Math.min(J.size, J.fy + 8));
  while (J.my < J.size >> 1 && now() - t0 < budget) J.my = fillMacroRows(J.macro, J.my, Math.min(J.size >> 1, J.my + 8));
  return J.fy >= J.size && J.my >= J.size >> 1;
}
// 浏览器里一加载就分帧预生成（一帧最多 4 毫秒）：游戏模块是进模式时才加载的，等到建人多半已经做完
if (typeof document !== 'undefined' && typeof requestAnimationFrame === 'function') {
  setTimeout(() => {
    const size = detailSize(); if (!size || shared) return;
    const J = pre = bakeJob(size);
    const step = () => { if (pre !== J || shared) return; if (!runJob(J, 4)) requestAnimationFrame(() => setTimeout(step, 0)); };
    step();
  }, 0);
}
/**
 * 拿共用细节图的 uniform（{ value: 细图, macro: { value: 粗图 } }）。当场就是做好的图：预生成没做完的部分同步补完，
 * 没有预生成就整张同步生成（512² + 256² 在桌面上二三十毫秒）。没有 document 或这个档位不用贴图时返回 null。
 */
export function acquireRigDetail(size = detailSize()) {
  if (!size || typeof document === 'undefined') return null;
  // 已经有一份就共用（档位中途换了也用已有的那份：细节图只有一两兆，不值得为它另起一份）
  if (shared) { shared.refs++; return shared.uniform; }
  const J = pre && pre.size === size ? pre : bakeJob(size); pre = null;
  const t0 = now(); runJob(J);
  const fine = dataTex(J.fine.data, size, 'rig-detail-' + size), macro = dataTex(J.macro.data, size >> 1, 'rig-macro-' + (size >> 1));
  shared = { size, refs: 1, fine, macro, ms: now() - t0, uniform: { value: fine, macro: { value: macro } } };
  return shared.uniform;
}
export function releaseRigDetail() {
  if (!shared || --shared.refs > 0) return;
  shared.fine.dispose(); shared.macro.dispose(); shared = null;
}
/** 调试 / 测试：当前共用细节图的状态（ms：拿的时候同步补了多少毫秒） */
export const rigDetailState = () => (shared ? { size: shared.size, refs: shared.refs, ready: true, ms: +shared.ms.toFixed(1) } : null);

// ---- 贴花（脸、印字、胸牌）----
/** 贴花槽（rig.z）。脸：阿哲、林医生；印字：阿哲荧光背心背后的「保安」；胸牌：林医生挂在胸前的工作证 */
export const DECAL = Object.freeze({ ZHE_FACE: 1, LIN_FACE: 2, ZHE_BACK: 3, LIN_BADGE: 4 });
const DECAL_SLOTS = 4;
/** 每个槽在站姿坐标里的正面投影框（cx, cy, 半宽, 半高），buildParts 搭模型时写进来（setDecalBox），材质的 uniform 直接引用这个数组 */
const decalBoxes = Array.from({ length: DECAL_SLOTS }, () => new THREE.Vector4(0, -9, 1, 1));
export function setDecalBox(slot, cx, cy, hw, hh) { decalBoxes[slot - 1]?.set(cx, cy, hw, hh); }
export const decalBox = (slot) => decalBoxes[slot - 1];
/** 贴花图的排布（按 512×384 的像素）：两张脸各 256²，下面一条印字、一张胸牌 */
const ATLAS = Object.freeze({ w: 512, h: 384, rect: Object.freeze([[0, 0, 256, 256], [256, 0, 256, 256], [0, 256, 256, 128], [256, 256, 80, 128]]) });
const decalUv = ATLAS.rect.map(([x, y, w, h]) => new THREE.Vector4(x / ATLAS.w, 1 - (y + h) / ATLAS.h, w / ATLAS.w, h / ATLAS.h));
/** 这一档有没有贴花（省内存档和 node 里没有：脸用小几何体的眼睛眉毛） */
export function rigDecalsOn(mem = MEM) { return typeof document !== 'undefined' && detailSize(mem) > 0; }

/**
 * 两张露脸的头型（buildParts 搭头、画脸都按这个）。c：头心（头的局部坐标）、r：三个半径、k：骨相的力度、nose：鼻子大小、
 * stubble：胡茬、line：发际线高度（脸前、两侧、脑后）、slot：脸的贴花槽。
 */
export const FACES = Object.freeze({
  zhe: Object.freeze({ c: [0, 0.09, 0.004], r: [0.083, 0.112, 0.1], k: 1, nose: 1, stubble: 0.8, line: [0.5, 0.12, -0.55], slot: DECAL.ZHE_FACE, male: true }),
  lin: Object.freeze({ c: [0, 0.09, 0.004], r: [0.077, 0.107, 0.097], k: 0.78, nose: 0.85, stubble: 0, line: [0.6, 0.04, -0.62], slot: DECAL.LIN_FACE, male: false }),
});

let decals = null;
const hexCss = (hex, m = 1) => { _c.set(hex); return `rgb(${Math.round(Math.min(1, _c.r * m) * 255)},${Math.round(Math.min(1, _c.g * m) * 255)},${Math.round(Math.min(1, _c.b * m) * 255)})`; };
/** 画一张脸（单位脸面坐标 → 画布像素：按 facePoint 的真实位置投到正面，和着色器里的平面投影一致） */
function drawFace(g, x0, y0, S, F, look) {
  const head = { c: F.c, r: F.r, k: F.k };
  const P = (nx, ny) => { const [x, y] = facePoint(head, nx, ny); return [x0 + ((x - F.c[0]) / F.r[0] * 0.5 + 0.5) * S, y0 + (0.5 - (y - F.c[1]) / F.r[1] * 0.5) * S]; };
  const u = S / 256; // 线宽按 256 的画布定，小图等比
  g.save(); g.beginPath(); g.rect(x0, y0, S, S); g.clip();
  const skin = look.skin, hair = look.hair ?? 0x1a1410, lip = look.lip ?? 0x8a5446;
  const soft = (cx, cy, rx, ry, color, a) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, color.replace('rgb', 'rgba').replace(')', `,${a})`)); gr.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ',0)')); g.save(); g.translate(cx, cy); g.scale(rx, ry); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore(); };
  const dark = hexCss(skin, 0.55), deep = hexCss(skin, 0.4), warm = hexCss(skin, 1.08);
  // 胡茬：下半脸一层发青的底色（不点黑点——上一版的随机黑点像痣）
  if (F.stubble) {
    const [mx, my] = P(0, -0.62);
    soft(mx, my, 62 * u, 46 * u, 'rgb(52,48,52)', 0.3 * F.stubble);
    for (const s of [-1, 1]) { const [jx, jy] = P(s * 0.62, -0.55); soft(jx, jy, 26 * u, 30 * u, 'rgb(48,44,48)', 0.2 * F.stubble); } // 两腮
    const [lx, ly] = P(0, -0.43); soft(lx, ly - 2 * u, 22 * u, 6 * u, 'rgb(40,36,38)', 0.18 * F.stubble); // 上唇的胡子
  } else {
    for (const s of [-1, 1]) { const [cx, cy] = P(s * 0.5, -0.22); soft(cx, cy, 18 * u, 12 * u, 'rgb(200,110,100)', 0.12); } // 脸颊一点血色
  }
  // 眼窝和眼袋的阴影、鼻梁两侧、鼻唇沟、下唇下面的阴影——都很淡，形体主要还是几何体给
  for (const s of [-1, 1]) {
    const [ex, ey] = P(s * 0.34, 0.08);
    soft(ex, ey - 2 * u, 22 * u, 14 * u, dark, 0.3);
    soft(ex - s * 10 * u, ey - 3 * u, 8 * u, 9 * u, deep, 0.14); // 眼窝内角（鼻梁旁边）最深
    soft(ex + s * 1 * u, ey + 9 * u, 14 * u, 5 * u, deep, 0.12);
    const [nx, ny] = P(s * 0.12, -0.05); soft(nx, ny, 4 * u, 16 * u, dark, 0.14);
    // 鼻唇沟：从鼻翼斜下去的一道软阴影（不画线：上一版那两笔把嘴圈成一个「O」）
    for (let t = 0; t <= 1.001; t += 0.25) { const [qx, qy] = P(s * (0.17 + 0.09 * t), -0.25 - 0.2 * t); soft(qx, qy, 6 * u, 7 * u, deep, 0.07 * (1 - 0.5 * t)); }
  }
  { const [cx, cy] = P(0, -0.7); soft(cx, cy, 14 * u, 4 * u, deep, 0.1); }
  // 眼睛：杏仁形的眼白（偏暖灰，不是纯白）、虹膜（上眼睑压住一截）、瞳孔、一道上眼睑线（外眼角拖出一点）、淡淡的下眼睑
  for (const s of [-1, 1]) {
    const [ex, ey] = P(s * 0.34, 0.07), w = (F.male ? 16.5 : 16) * u, h = (F.male ? 5.4 : 6) * u;
    const inn = [ex - s * w, ey + 0.6 * u], out = [ex + s * w, ey - 0.8 * u];
    const almond = () => { g.beginPath(); g.moveTo(...inn); g.bezierCurveTo(ex - s * w * 0.4, ey - h * 1.5, ex + s * w * 0.55, ey - h * 1.45, ...out); g.bezierCurveTo(ex + s * w * 0.45, ey + h * 1.05, ex - s * w * 0.45, ey + h * 1.15, ...inn); g.closePath(); };
    g.save(); almond(); g.clip();
    g.fillStyle = 'rgb(206,196,184)'; g.fillRect(ex - w * 1.2, ey - h * 2, w * 2.4, h * 4);
    const ir = h * 1.15, ix = ex - s * 0.6 * u, iy = ey + 0.2 * u;
    g.fillStyle = hexCss(look.iris ?? 0x2a1c14, 1.25); g.beginPath(); g.arc(ix, iy, ir, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgb(14,10,9)'; g.beginPath(); g.arc(ix, iy, ir * 0.45, 0, Math.PI * 2); g.fill();
    // 上眼睑在眼球上投的影
    const sh = g.createLinearGradient(0, ey - h * 1.4, 0, ey); sh.addColorStop(0, 'rgba(40,24,18,0.55)'); sh.addColorStop(1, 'rgba(40,24,18,0)'); g.fillStyle = sh; g.fillRect(ex - w * 1.2, ey - h * 2, w * 2.4, h * 2);
    g.restore();
    g.strokeStyle = 'rgba(24,16,13,0.92)'; g.lineWidth = (F.male ? 2.1 : 2.4) * u; g.lineCap = 'round';
    g.beginPath(); g.moveTo(inn[0] + s * 1 * u, inn[1] - 0.5 * u); g.bezierCurveTo(ex - s * w * 0.4, ey - h * 1.5, ex + s * w * 0.55, ey - h * 1.45, out[0] + s * 1.6 * u, out[1] - 0.6 * u); g.stroke();
    g.strokeStyle = 'rgba(60,36,28,0.35)'; g.lineWidth = 1.2 * u;
    g.beginPath(); g.moveTo(...out); g.bezierCurveTo(ex + s * w * 0.45, ey + h * 1.05, ex - s * w * 0.45, ey + h * 1.15, ...inn); g.stroke();
    // 双眼皮的褶：上眼睑线上面一道淡的
    g.strokeStyle = deep.replace('rgb', 'rgba').replace(')', ',0.3)'); g.lineWidth = 1.3 * u;
    g.beginPath(); g.moveTo(ex - s * w * 0.6, ey - h * 1.5); g.quadraticCurveTo(ex + s * w * 0.1, ey - h * 2.5, ex + s * w * 0.95, ey - h * 1.2); g.stroke();
    // 眉毛：一根根短笔触，眉头淡、眉峰浓、眉尾收细（阿哲粗平，林医生细、有弧度）
    const b0 = P(s * 0.12, F.male ? 0.25 : 0.27), b1 = P(s * 0.37, F.male ? 0.31 : 0.335), b2 = P(s * 0.57, F.male ? 0.26 : 0.27);
    g.lineCap = 'round';
    for (let k = 0; k <= 22; k++) {
      const t = k / 22, q = t < 0.6 ? t / 0.6 : (t - 0.6) / 0.4, A = t < 0.6 ? b0 : b1, B = t < 0.6 ? b1 : b2;
      const x = A[0] + (B[0] - A[0]) * q, y = A[1] + (B[1] - A[1]) * q, th = (F.male ? 5.5 : 3) * u * (t < 0.15 ? 0.6 + t * 2.6 : 1 - Math.max(0, t - 0.6) * 1.6);
      g.strokeStyle = hexCss(hair, 1.15).replace('rgb', 'rgba').replace(')', `,${(0.5 + 0.4 * Math.min(1, t * 3)) * (F.male ? 0.9 : 0.62)})`);
      g.lineWidth = 1.1 * u;
      for (let j = -1; j <= 1; j++) { g.beginPath(); g.moveTo(x, y + j * th * 0.45 + th * 0.2); g.lineTo(x + s * 3.2 * u, y + j * th * 0.45 - th * 0.35); g.stroke(); }
    }
  }
  // 嘴：闭着的一道唇缝（中性的表情，嘴角略往下收），唇宽按真人（约五厘米，脸宽的三分之一）；
  // 唇色只比皮肤深一点、偏红——上唇在阴影里深一些，下唇受光，下面一道唇下沟的影
  {
    const [mx, my] = P(0, -0.5), [cx] = P(0.29, -0.5), w = (cx - mx) * (F.male ? 1 : 0.92);
    const lipC = hexCss(lip, 0.92), lipD = hexCss(lip, 0.5);
    g.fillStyle = lipC.replace('rgb', 'rgba').replace(')', `,${F.male ? 0.38 : 0.6})`);
    g.beginPath(); g.moveTo(mx - w, my + 0.5 * u); g.bezierCurveTo(mx - w * 0.55, my - 3 * u, mx - w * 0.2, my - 5 * u, mx, my - 3.6 * u); g.bezierCurveTo(mx + w * 0.2, my - 5 * u, mx + w * 0.55, my - 3 * u, mx + w, my + 0.5 * u); g.closePath(); g.fill();
    g.fillStyle = lipC.replace('rgb', 'rgba').replace(')', `,${F.male ? 0.3 : 0.5})`);
    g.beginPath(); g.moveTo(mx - w * 0.92, my + 0.6 * u); g.bezierCurveTo(mx - w * 0.5, my + 6.5 * u, mx + w * 0.5, my + 6.5 * u, mx + w * 0.92, my + 0.6 * u); g.closePath(); g.fill();
    // 唇缝：中间略往上弯（上唇的唇珠压一点），两头往嘴角收，嘴角一点暗
    g.strokeStyle = lipD.replace('rgb', 'rgba').replace(')', ',0.85)'); g.lineWidth = 1.5 * u; g.lineCap = 'round';
    g.beginPath(); g.moveTo(mx - w, my + 1.2 * u); g.bezierCurveTo(mx - w * 0.45, my - 0.4 * u, mx - w * 0.12, my + 0.6 * u, mx, my + 0.2 * u); g.bezierCurveTo(mx + w * 0.12, my + 0.6 * u, mx + w * 0.45, my - 0.4 * u, mx + w, my + 1.2 * u); g.stroke();
    for (const s of [-1, 1]) soft(mx + s * w, my + 1.2 * u, 3 * u, 2.2 * u, deep, 0.35);
    soft(mx, my + 3.5 * u, w * 0.45, 1.6 * u, warm, 0.22); // 下唇受光
    soft(mx, my + 10 * u, w * 0.5, 3 * u, deep, 0.16); // 唇下沟
    soft(mx, my - 9 * u, 3 * u, 4.5 * u, dark, 0.14); // 人中
  }
  g.restore();
}
/** 阿哲背后的「保安」印字（从背后看，所以左右镜像着画）：反光银灰的字，底色透明 */
function drawBackPrint(g, x0, y0, W, H) {
  g.save(); g.translate(x0 + W, y0); g.scale(-1, 1);
  g.fillStyle = 'rgba(28,30,34,0.85)'; g.fillRect(W * 0.08, H * 0.18, W * 0.84, H * 0.64);
  g.fillStyle = 'rgba(214,216,210,1)'; g.font = `700 ${Math.round(H * 0.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('保 安', W / 2, H * 0.52);
  g.restore();
}
/** 林医生的工作证：白卡、顶上一条医院的墨绿色带、证件照、两行字（全是虚构的） */
function drawBadge(g, x0, y0, W, H) {
  g.save(); g.translate(x0, y0);
  g.fillStyle = 'rgb(222,224,218)'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgb(38,104,92)'; g.fillRect(0, 0, W, H * 0.22);
  g.fillStyle = 'rgb(236,238,232)'; g.font = `700 ${Math.round(H * 0.11)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('急诊科', W / 2, H * 0.115);
  g.fillStyle = 'rgb(150,160,168)'; g.fillRect(W * 0.26, H * 0.28, W * 0.48, H * 0.36);
  g.fillStyle = 'rgb(40,32,30)'; g.beginPath(); g.arc(W / 2, H * 0.43, W * 0.13, 0, Math.PI * 2); g.fill(); g.fillRect(W * 0.32, H * 0.53, W * 0.36, H * 0.11);
  g.fillStyle = 'rgb(34,36,40)'; g.font = `600 ${Math.round(H * 0.12)}px sans-serif`; g.fillText('林 医生', W / 2, H * 0.76);
  g.fillStyle = 'rgb(120,124,128)'; g.fillRect(W * 0.18, H * 0.87, W * 0.64, H * 0.03);
  g.restore();
}
/** 拿共用的贴花图（{ value: 贴图 }）：canvas 画两张脸、印字、胸牌，几毫秒。手机两档半尺寸 */
export function acquireRigDecals(looks = []) {
  if (!rigDecalsOn()) return null;
  if (decals) { decals.refs++; return decals.uniform; }
  const k = MEM.lite ? 0.5 : 1, cv = document.createElement('canvas'); cv.width = ATLAS.w * k; cv.height = ATLAS.h * k;
  const g = cv.getContext('2d');
  if (!g) return null;
  const byFace = { zhe: looks.find((L) => L.face === 'zhe') || { skin: 0xa8765a, lip: 0x8a5446, hair: 0x17130f }, lin: looks.find((L) => L.face === 'lin') || { skin: 0xc99a7c, lip: 0xa0605a, hair: 0x1f1714 } };
  const R = (i) => ATLAS.rect[i].map((q) => q * k);
  drawFace(g, R(0)[0], R(0)[1], R(0)[2], FACES.zhe, byFace.zhe);
  drawFace(g, R(1)[0], R(1)[1], R(1)[2], FACES.lin, byFace.lin);
  drawBackPrint(g, ...R(2)); drawBadge(g, ...R(3));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4; tex.name = 'rig-decals';
  decals = { refs: 1, tex, uniform: { value: tex } };
  return decals.uniform;
}
export function releaseRigDecals() {
  if (!decals || --decals.refs > 0) return;
  decals.tex.dispose(); decals = null;
}

// ---- 着色器 ----
const f1 = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(6)));
/** 按 SURF_PARAMS 生成 GLSL 的查表函数 rigSurf(t, w, a, b, x) */
export function surfGlsl(params = SURF_PARAMS) {
  const lines = params.map((p, i) => `${i ? 'else ' : ''}if (t == ${i}) { w = vec4(${p.w.map(f1).join(', ')}); a = vec4(${f1(p.s)}, ${f1(p.rough)}, ${f1(p.rv)}, ${f1(p.av)}); b = vec4(${f1(p.metal)}, ${f1(p.bump)}, ${f1(p.retro)}, ${f1(p.glow)}); x = vec4(${f1(p.fold)}, ${f1(p.blood ? 1 : 0)}, ${f1(p.scuff)}, ${f1(p.kind)}); }`);
  return `void rigSurf(int t, out vec4 w, out vec4 a, out vec4 b, out vec4 x) {\n  w = vec4(0.0); a = vec4(4.0, 0.8, 0.1, 0.2); b = vec4(0.0); x = vec4(0.0, 1.0, 0.0, 0.0);\n  ${lines.join('\n  ')}\n}`;
}

const VERT_HEAD = `
attribute vec4 rig;
attribute vec4 rest;
varying vec4 vRig;
varying vec4 vRest;
varying vec3 vRigN;
`;
const VERT_MAIN = `
vRig = rig; vRigN = normal;
vRest = vec4(rest.xyz * ${f1(REST_RANGE)}, rest.w * 32767.0);
`;
const FRAG_HEAD = `
varying vec4 vRig;
varying vec4 vRest;
varying vec3 vRigN;
#ifdef RIG_DETAIL
uniform sampler2D rigDetail;
uniform sampler2D rigMacro;
#endif
#ifdef RIG_DECAL
uniform sampler2D rigDecal;
uniform vec4 rigDecalBox[${DECAL_SLOTS}];
uniform vec4 rigDecalUv[${DECAL_SLOTS}];
#endif
uniform vec4 rigGrime;
uniform vec4 rigSpot[${MAX_SPOTS}];
uniform vec4 rigSpotK[${MAX_SPOTS}];
float rigRetro = 0.0;
float rigRough = 0.8;
float rigMetal = 0.0;
float rigGlow = 0.0;
float rigH = 0.0;
vec3 rigTint = vec3(0.5);
`;
// 颜色之后：贴花、取细节、混高度、做旧（脏、血）、定粗糙度和金属度
const FRAG_SURF = `
{
  int rigT = int(vRig.x * 255.0 + 0.5);
  vec4 rw, ra, rb, rx; rigSurf(rigT, rw, ra, rb, rx);
  vec3 rp = vRest.xyz; int who = int(vRest.w + 0.5);
  #ifdef RIG_DECAL
  {
    // 贴花：按站姿位置从正面平面投影（脸、背后印字、胸牌）；槽号整件一样，浓度按顶点（脸往两侧渐隐）
    int slot = int(vRig.z * 255.0 + 0.5);
    vec4 box = vec4(0.0, -9.0, 1.0, 1.0), ruv = vec4(0.0, 0.0, 1.0, 1.0);
    for (int i = 0; i < ${DECAL_SLOTS}; i++) { if (i + 1 == slot) { box = rigDecalBox[i]; ruv = rigDecalUv[i]; } }
    vec2 duv = (rp.xy - box.xy) / box.zw * 0.5 + 0.5;
    float din = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0) * step(0.5, float(slot));
    vec4 dc = texture2D(rigDecal, ruv.xy + clamp(duv, 0.002, 0.998) * ruv.zw);
    diffuseColor.rgb = mix(diffuseColor.rgb, dc.rgb, dc.a * vRig.w * din);
  }
  #endif
  vec4 fd = vec4(0.5), md = vec4(0.5);
  #ifdef RIG_DETAIL
    // 三向投影的混合收得紧一些：圆柱（腿、胳膊）上两个投影交叠的那一窄条，拉长的衣褶会叠成「V」「X」（上一版大腿上的人字纹）
    vec3 bw = pow(abs(normalize(vRigN)), vec3(6.0)); bw /= (bw.x + bw.y + bw.z);
    vec3 qf = rp * ra.x, qm = rp * 2.5;
    fd = texture2D(rigDetail, qf.zy) * bw.x + texture2D(rigDetail, qf.xz) * bw.y + texture2D(rigDetail, qf.xy) * bw.z;
    md = texture2D(rigMacro, qm.zy) * bw.x + texture2D(rigMacro, qm.xz) * bw.y + texture2D(rigMacro, qm.xy) * bw.z;
  #endif
  float wsum = max(1e-3, rw.x + rw.y + rw.z + rw.w), hn = dot(fd, rw) / wsum;
  // 针织（面罩）：绕头一圈的竖罗纹，按屏幕上一个周期占几个像素淡出，不闪
  if (rx.w > 0.5 && rx.w < 1.5) {
    float ph = atan(rp.x, rp.z - 0.004) * 150.0, fw = fwidth(ph);
    hn = mix(hn, 0.5 + 0.5 * cos(ph), 0.7 * (1.0 - smoothstep(0.6, 1.6, fw)));
  }
  // 头发：顺着梳的方向一缕一缕（往后梳：发丝是绕前后轴的一圈圈经线，同一缕上 atan(x, y) 不变），深浅和粗糙度跟着走
  if (rx.w > 1.5 && rx.w < 2.5) {
    vec3 hq = rp - vec3(0.0, 1.62, 0.0);
    float ph = atan(hq.x, hq.y) * 70.0 + (md.b - 0.5) * 5.0, fw = fwidth(ph);
    float st = (0.5 + 0.5 * sin(ph)) * 0.6 + (0.5 + 0.5 * sin(ph * 2.7 + md.r * 4.0)) * 0.4;
    hn = mix(hn, st, 1.0 - smoothstep(0.8, 2.0, fw));
  }
  // 衣褶：粗图（竖向的垂褶为主，顺着肢体走）+ 关节处的褶（膝盖后面、肘弯），只在软布上
  float fold = 0.0;
  if (rx.x > 0.0) {
    fold = (md.g - 0.5) * 0.65 + (md.r - 0.5) * 0.35;
    float jk = exp(-pow((rp.y - 0.48) / 0.045, 2.0)) * smoothstep(0.02, -0.05, rp.z);
    float je = max(exp(-dot(rp - vec3(-0.25, 1.28, 0.09), rp - vec3(-0.25, 1.28, 0.09)) / 0.0036), exp(-dot(rp - vec3(0.17, 1.3, 0.26), rp - vec3(0.17, 1.3, 0.26)) / 0.0036));
    fold += (0.16 * jk * sin(rp.y * 230.0 + md.b * 9.0) + 0.3 * je * sin(length(rp - vec3(0.0, 1.29, 0.17)) * 280.0 + md.r * 7.0)) * (0.4 + md.g);
  }
  rigH = (hn - 0.5) * rb.y + fold * rx.x;
  // 织纹凹处暗一点；大块褪色让布料不那么匀（很轻）
  rigTint = diffuseColor.rgb;
  diffuseColor.rgb *= 1.0 + ra.w * (hn - 0.5) * 1.3;
  // 纱线的深浅不匀（一厘米上下的斑驳）：一两米外看不清一根根经纬了，布还是「花」的，不是一块塑料
  diffuseColor.rgb *= 1.0 + 0.14 * ra.w * (md.a - 0.5) + 0.4 * ra.w * (md.b - 0.5) * step(0.5, rx.x * 1000.0) + fold * 0.3;
  float rough = ra.y + ra.z * (md.a - 0.5) * 2.0 + (hn - 0.5) * 0.08;
  // 夹角里的暗（AO）：腋下、裆部、膝盖后面、背心下摆底下、腰带底下、下巴底下——按站姿位置算，跟着部件走
  float ao = 0.0;
  { vec3 dl = rp - vec3(0.17, 1.39, 0.0), dr = rp - vec3(-0.17, 1.39, 0.0);
    ao = max(ao, exp(-dot(dl, dl) / 0.0028)); ao = max(ao, exp(-dot(dr, dr) / 0.0028));
    ao = max(ao, exp(-pow(rp.y - 0.87, 2.0) / 0.0025) * exp(-rp.x * rp.x / 0.004));
    ao = max(ao, 0.8 * exp(-pow((rp.y - 0.475) / 0.04, 2.0)) * smoothstep(0.02, -0.05, rp.z));
    ao = max(ao, 0.7 * exp(-pow((rp.y - 1.155) / 0.022, 2.0)) * step(float(rigT), 1.5));
    ao = max(ao, 0.6 * exp(-pow((rp.y - 1.03) / 0.018, 2.0)) * step(float(rigT), 1.5));
    ao = max(ao, 0.7 * exp(-pow((rp.y - 1.6) / 0.03, 2.0)) * exp(-(rp.x * rp.x) / 0.004) * step(7.5, float(rigT)) * step(float(rigT), 8.5)); }
  diffuseColor.rgb *= 1.0 - 0.42 * ao;
  // 皮肤：凹处（毛孔、眼窝、鼻翼这些夹角）偏一点暖红——皮下的血色，不是一层灰
  if (rigT == ${SURF.SKIN}) diffuseColor.rgb *= mix(vec3(1.0), vec3(1.06, 0.9, 0.86), clamp(ao * 0.8 + (0.5 - hn) * 0.6, 0.0, 1.0));
  // 硬壳上的磨痕：一片片发白发毛的地方 + 细的划痕（颗粒层里脊线的细线）
  float sc = rx.z * smoothstep(0.62, 0.7, fd.b + (md.b - 0.5) * 0.25) * smoothstep(0.45, 0.75, md.a);
  if (rx.w > 2.5) sc = max(sc, smoothstep(0.9, 0.97, fd.b) * smoothstep(0.35, 0.6, md.b) * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * 1.15 + 0.01, sc * 0.35);
  rough += sc * 0.2;
  // 脏：按站直时的位置逐像素算——越往下越脏（裤腿、鞋），膝盖前面跪脏一块、袖口手套蹭脏、背心前面枪托蹭的一片；
  // 是一层渐变的浮土，竖着拉长的纹理让浓淡顺着往下淌，不是一块块的霉斑
  float gw = who == 0 ? rigGrime.x : who == 1 ? rigGrime.y : who == 2 ? rigGrime.z : rigGrime.w;
  float low = smoothstep(0.95, 0.03, rp.y);
  float knee = exp(-pow((rp.y - 0.5) / 0.09, 2.0)) * smoothstep(0.0, 0.08, rp.z);
  float cuff = max(exp(-dot(rp - vec3(-0.1, 1.34, 0.21), rp - vec3(-0.1, 1.34, 0.21)) / 0.006), exp(-dot(rp - vec3(-0.07, 1.38, 0.44), rp - vec3(-0.07, 1.38, 0.44)) / 0.006));
  float rub = exp(-pow((rp.x + 0.03) / 0.09, 2.0) - pow((rp.y - 1.24) / 0.09, 2.0)) * smoothstep(0.08, 0.13, rp.z);
  float g = gw * vRig.y * (0.1 + 0.95 * low * low + 0.55 * knee + 0.3 * cuff + 0.35 * rub);
  float dm = clamp(g * (1.0 + (md.g - 0.5) * 0.6 + (md.a - 0.5) * 0.5), 0.0, 1.0);
  // 深色衣服上是一层浅的灰土，浅色的（刷手服、白鞋）上是发暗的褐色污渍：往同一个土色拉
  float lum = dot(rigTint, vec3(0.3, 0.55, 0.15));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.105, 0.085) * (0.85 + 0.3 * md.a), dm * mix(0.34, 0.55, smoothstep(0.02, 0.25, lum)));
  rough += dm * 0.06;
  // 血：干了的暗红褐色（#5a1812 到 #3a0e0b，氧化了的颜色，不是颜料红）——溅上去顺着往下淌（拉长的一道），中心积得深，边缘红一点、碎成点；新的地方湿一点（粗糙度低）
  float bl = 0.0, spr = 0.0;
  for (int i = 0; i < ${MAX_SPOTS}; i++) {
    vec4 K = rigSpotK[i];
    if (int(K.x + 0.5) != who) continue;
    vec3 rel = rp - rigSpot[i].xyz, dir = vec3(sin(K.w), -cos(K.w), 0.0);
    float al = dot(rel, dir); vec3 pp = rel - dir * al;
    al /= al > 0.0 ? K.z : 1.3;
    float d = sqrt(al * al + dot(pp, pp)) / rigSpot[i].w;
    bl = max(bl, K.y * (1.0 - smoothstep(0.25, 1.0, d)));
    spr = max(spr, K.y * (1.0 - smoothstep(0.9, 2.2, d)));
  }
  float brk = (md.b - 0.5) * 0.7 + (fd.b - 0.5) * 0.5;
  float bm = smoothstep(0.4, 0.48, bl + brk * 0.5);
  bm = max(bm, spr * smoothstep(0.76, 0.82, fd.b + (md.b - 0.5) * 0.4)) * rx.y;
  vec3 bc = mix(vec3(0.062, 0.011, 0.007), vec3(0.03, 0.006, 0.004), smoothstep(0.55, 0.95, bl));
  diffuseColor.rgb = mix(diffuseColor.rgb, bc, bm * 0.92);
  rough = mix(rough, 0.28 + 0.35 * (1.0 - bl), bm);
  rigRough = clamp(rough, 0.05, 1.0);
  rigMetal = rb.x * (1.0 - dm) * (1.0 - bm);
  rigRetro = rb.z * (1.0 - dm * 0.8) * (1.0 - bm);
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
 * looks：用这个材质的几种外观（脏的程度、血迹，见 lookUniforms）；decal：acquireRigDecals 的返回值（null = 没有贴花）。
 */
export function patchRigShader(material, detail, looks = [], decal = null) {
  const uniforms = lookUniforms(looks);
  material.defines = Object.assign(material.defines || {}, detail ? { RIG_DETAIL: '' } : {}, decal ? { RIG_DECAL: '' } : {});
  material.customProgramCacheKey = () => 'rig-skin-3' + (detail ? 'd' : '') + (decal ? 'f' : '');
  material.userData.rigUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (detail) { shader.uniforms.rigDetail = detail; shader.uniforms.rigMacro = detail.macro || detail; }
    if (decal) { shader.uniforms.rigDecal = decal; shader.uniforms.rigDecalBox = { value: decalBoxes }; shader.uniforms.rigDecalUv = { value: decalUv }; }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + VERT_MAIN);
    const pars = THREE.ShaderChunk.lights_physical_pars_fragment.replace(RETRO_LINE,
      // 逆反射：光源方向和视线越重合越亮（手电挂在镜头上，几乎重合）；按反光条自己的银灰色反回去
      `${RETRO_LINE}\n\treflectedLight.directSpecular += rigRetro * rigTint * irradiance * pow( saturate( dot( directLight.direction, geometryViewDir ) ), 16.0 );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + FRAG_HEAD + surfGlsl())
      .replace('#include <lights_physical_pars_fragment>', pars)
      .replace('#include <color_fragment>', '#include <color_fragment>' + FRAG_SURF)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rigRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = rigMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + FRAG_BUMP)
      // 自发光按颜色走（原来的整体提亮会把黑衣服也抬成一层灰）；荧光布自己亮一点；
      // 反光条正对镜头时留一丝亮（N·V 越正越亮），黑里认得出人
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.3 + 2.4 * diffuseColor.rgb;\ntotalEmissiveRadiance += diffuseColor.rgb * rigGlow + rigRetro * rigTint * 0.03 * pow( saturate( dot( normal, normalize( vViewPosition ) ) ), 3.0 );');
  };
  return material;
}

/**
 * 建一个人形用的材质（几个人共用一个）：MeshStandardMaterial + 顶点色 + 上面那套着色。looks：用它的外观（who 编号、脏、血；
 * 有 face 的外观会顺带拿贴花图）。释放材质时（material.dispose()）顺带归还共用的细节图和贴花图。
 */
export function createRigMaterial({ name = 'rig', emissive = 0x000000, looks = [], detail = true } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, emissive, name });
  const uniform = detail ? acquireRigDetail() : null, decal = looks.some((L) => L.face) ? acquireRigDecals(looks) : null;
  patchRigShader(mat, uniform, looks, decal);
  if (uniform || decal) { let done = false; mat.addEventListener('dispose', () => { if (done) return; done = true; if (uniform) releaseRigDetail(); if (decal) releaseRigDecals(); }); }
  return mat;
}

// ---- 人头 ----
const gauss = (a, s) => Math.exp(-((a / s) ** 2));
/**
 * 头型：单位球上的方向 (nx, ny, nz)（+z 是脸）→ 雕过的点（还是单位尺度，之后乘三个半径）。
 * 下颌：两侧的下颌角保持宽、往前到下巴收窄（侧面、斜侧面看得出下颌角），下巴底下压平成一个面接脖子；
 * 脸面略平；眉骨一道横梁；眼窝凹进去、里面一点眼球的鼓；颧骨往外往前顶、颧骨下面微凹；嘴部（牙床）微微前凸；下巴前凸；太阳穴微凹。
 * k：雕刻的力度（面罩里的头用一半，女的柔和些）。
 */
export function sculpt(nx, ny, nz, k = 1) {
  let x = nx, y = ny, z = nz;
  const ax = Math.abs(nx), sx = nx < 0 ? -1 : 1;
  const front = smooth(0.1, 0.8, nz), low = smooth(-0.12, -0.85, ny), face = smooth(-0.15, 0.45, nz);
  // 下颌：越往下越窄，越往前越窄（正面看是下颌角到下巴的两条斜线，不是蛋的圆弧）
  x *= 1 - k * low * (0.05 + 0.4 * front * front);
  // 脸分成几个面：脸前压平，两颊（颧骨以下）往里收一个面——交界那条线就是颧骨到下颌角，侧光下明暗分得开
  z *= 1 - 0.09 * k * front * smooth(0.72, 0.1, ax) * smooth(0.55, -0.15, ny);
  x *= 1 - 0.07 * k * face * smooth(0.5, 0.88, ax) * gauss(ny + 0.32, 0.28);
  // 后脑往下收进脖子，枕骨往后鼓一点
  if (nz < 0) z *= 1 - 0.22 * low * k;
  z -= 0.05 * k * gauss(ny - 0.12, 0.3) * smooth(-0.35, -0.85, nz);
  // 下颌骨下缘：下巴底下到下颌角是一个往上斜的面（下颌线以下往上压、往里收），和脸面交在一道棱上
  const J = -0.6 - 0.3 * smooth(-0.05, 0.9, nz);
  if (ny < J) { const d = J - ny, w = k * smooth(-0.5, -0.05, nz); y += d * 0.62 * w; x *= 1 - 0.55 * d * w; z -= d * 0.3 * w * smooth(0.2, 0.9, nz); }
  // 眉骨：一道横梁，眉弓外侧收
  z += k * front * 0.09 * gauss(ny - 0.25, 0.07) * smooth(0.64, 0.14, ax);
  // 眼窝 + 眼球（眼窝深一些：上面眉骨压着，下面颧骨托着）
  z -= k * front * (0.135 * gauss(ax - 0.34, 0.13) * gauss(ny - 0.08, 0.085) - 0.05 * gauss(ax - 0.34, 0.07) * gauss(ny - 0.07, 0.048));
  // 鼻梁两侧（眼窝内角）往里，鼻根略凹
  z -= k * front * 0.03 * gauss(ax - 0.17, 0.07) * gauss(ny + 0.05, 0.12);
  // 颧骨：往外往前顶；下面一道凹（颊）
  const cheek = k * gauss(ax - 0.6, 0.12) * gauss(ny + 0.08, 0.11) * smooth(0.05, 0.55, nz);
  x += sx * 0.06 * cheek; z += 0.05 * cheek;
  z -= 0.05 * k * gauss(ax - 0.5, 0.12) * gauss(ny + 0.42, 0.12) * front;
  // 嘴部（牙床）微凸、上唇到鼻底一道浅沟；下巴前凸成一块（方下巴的人更宽）
  z += k * front * 0.055 * gauss(nx, 0.3) * gauss(ny + 0.52, 0.15);
  z += k * 0.095 * gauss(nx, 0.2 + 0.05 * k) * gauss(ny + 0.8, 0.09) * smooth(0.25, 0.85, nz);
  // 下颌角：侧面往外鼓一点（看得出下颌角的棱）
  x += sx * 0.04 * k * gauss(ny + 0.58, 0.1) * gauss(nz - 0.2, 0.25) * smooth(0.6, 0.85, ax);
  // 太阳穴
  x -= sx * k * 0.04 * gauss(ax - 0.85, 0.12) * gauss(ny - 0.3, 0.16) * smooth(-0.2, 0.4, nz);
  return [x, y, z];
}
/**
 * 脸朝前的单位球（雕人头用）：极点在脸前（往下偏一点，落在鼻子底下被鼻子挡住），纬圈从脸往后由密到疏——
 * 五官那一块网格密（五六毫米一圈），后脑勺（头发盖着）疏。接缝从脸中间往上过头顶（发际线以上）。
 */
export function faceSphere(seg = 48, rings = 38, pw = 1.45, tilt = 0.16) {
  const nv = (seg + 1) * (rings + 1), p = new Float32Array(nv * 3), idx = [], ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let j = 0; j <= rings; j++) {
    const th = Math.PI * Math.pow(j / rings, pw), s = Math.sin(th), c = Math.cos(th);
    for (let i = 0; i <= seg; i++) {
      const ph = Math.PI / 2 + i / seg * Math.PI * 2, x = s * Math.cos(ph), y = s * Math.sin(ph), k = (j * (seg + 1) + i) * 3;
      p[k] = x; p[k + 1] = y * ct - c * st; p[k + 2] = y * st + c * ct;
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, d, b, a, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2)); g.setIndex(idx);
  return g;
}
/** 位置重合的顶点（球的接缝、极点）法线取平均：雕过以后重算法线，接缝上不出一道棱 */
export function weldNormals(g) {
  const p = g.attributes.position, n = g.attributes.normal, map = new Map();
  for (let i = 0; i < p.count; i++) { const key = `${Math.round(p.getX(i) * 1e5)},${Math.round(p.getY(i) * 1e5)},${Math.round(p.getZ(i) * 1e5)}`; const l = map.get(key); if (l) l.push(i); else map.set(key, [i]); }
  for (const l of map.values()) {
    if (l.length < 2) continue;
    let x = 0, y = 0, z = 0; for (const i of l) { x += n.getX(i); y += n.getY(i); z += n.getZ(i); }
    const len = Math.hypot(x, y, z) || 1; for (const i of l) n.setXYZ(i, x / len, y / len, z / len);
  }
  return g;
}
/** 脸上某一点（单位方向 → 头的局部坐标，米） */
export function facePoint(head, nx, ny) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), [x, y, z] = sculpt(nx, ny, nz, head.k ?? 1);
  return [head.c[0] + x * head.r[0], head.c[1] + y * head.r[1], head.c[2] + z * head.r[2]];
}
/** 雕过的球（顶点按单位方向雕、再按 scaleAt 缩放）；geo.userData.dir 留着每个顶点的单位方向，上色要用 */
function sculptedSphere(head, seg, ring, scaleAt = null, sphere = null) {
  const g = sphere || new THREE.SphereGeometry(1, seg, ring), p = g.attributes.position, k = head.k ?? 1, dir = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i), [x, y, z] = sculpt(nx, ny, nz, k), s = scaleAt ? scaleAt(nx, ny, nz) : 1;
    dir[i * 3] = nx; dir[i * 3 + 1] = ny; dir[i * 3 + 2] = nz;
    p.setXYZ(i, head.c[0] + x * head.r[0] * s, head.c[1] + y * head.r[1] * s, head.c[2] + z * head.r[2] * s);
  }
  g.computeVertexNormals(); weldNormals(g);
  g.userData.dir = dir;
  return g;
}
function shade(geo, fn) { // 顶点色逐点乘一个 (r, g, b) 系数
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) { const m = fn(p.getX(i), p.getY(i), p.getZ(i), i); c.setXYZ(i, c.getX(i) * m[0], c.getY(i) * m[1], c.getZ(i) * m[2]); }
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
/** 发际线：按脸前（nz = 1）到脑后（nz = -1）插值出的高度（ny） */
const hairT = (line, nz) => { const [front, side, back] = line; return nz >= 0 ? side + (front - side) * nz : side + (back - side) * -nz; };

/**
 * 一颗真人的头：雕过的头型（皮肤；顶点色里有眼窝、下巴底下的暗，颧骨的暖，男的下半脸发青；头发区域直接涂成发色，
 * 发际线是顶点色的软边，不会像头发壳和头皮相交那样一格一格地锯齿）、鼻子（鼻梁、鼻头、两侧鼻翼，鼻孔底下压暗）、
 * 嘴唇的体积、耳朵（压扁的半椭球，约 6 厘米高，耳甲腔压暗）。
 * 有贴花（o.decal = 槽号）时眼睛、眉毛、唇形、阴影画在脸的贴花里；没有（省内存档、node）时用小几何体的眼白、虹膜、眼睑、眉毛。
 * 都合进头那个网格（不另加材质和 draw call）。
 * o：{ c, r, k, nose, stubble, skin, lip, brow, iris, hair（发色）, line（发际线）, decal（脸的贴花槽，0 = 没有）}
 */
export function humanHead(o) {
  const head = { c: o.c, r: o.r, k: o.k ?? 1 }, out = [], ns = o.nose ?? 1, slot = o.decal | 0;
  const skull = paintGeo(sculptedSphere(head, 0, 0, null, faceSphere()), o.skin, SURF.SKIN), dir = skull.userData.dir;
  const hc = o.hair != null && o.line ? new THREE.Color(o.hair) : null, sk = new THREE.Color(o.skin), col = skull.attributes.color, rig = skull.attributes.rig.array;
  for (let i = 0; i < col.count; i++) {
    const nx = dir[i * 3], ny = dir[i * 3 + 1], nz = dir[i * 3 + 2], ax = Math.abs(nx);
    const socket = gauss(ax - 0.34, 0.16) * gauss(ny - 0.1, 0.12) * smooth(0.3, 0.9, nz);
    const cheek = gauss(ax - 0.5, 0.18) * gauss(ny + 0.2, 0.16) * smooth(0.2, 0.8, nz);
    const beard = (o.stubble || 0) * smooth(-0.25, -0.5, ny) * smooth(-0.1, 0.4, nz) * (1 - 0.6 * gauss(nx, 0.2) * gauss(ny + 0.52, 0.07));
    const under = smooth(-0.6, -0.95, ny) * 0.3 + gauss(ny + 0.3, 0.12) * gauss(ax - 0.75, 0.2) * 0.06; // 下巴底下、下颌角后面背光
    const kk = (1 - 0.18 * socket) * (1 - under) * (1 - 0.22 * beard);
    let r = sk.r * kk * (1 + 0.06 * cheek) * (1 - 0.06 * beard), g = sk.g * kk * (1 - 0.01 * cheek) * (1 - 0.02 * beard), b = sk.b * kk * (1 - 0.03 * cheek) * (1 + 0.04 * beard);
    let hw = 0;
    if (hc) {
      // 头发涂在头皮上：发际线是跨两排顶点的软边（只跨一排的话三角形的斜边会把它切成锯齿），再往里是头发壳盖住的地方
      // 发际线不是一条齐线：抖一点（鬓角、额角），最外一圈头发稀，透出一点头皮
      const t = hairT(o.line, nz) + 0.06 * (noise3(nx * 11 + 3, ny * 11, nz * 11) - 0.5) + 0.025 * (noise3(nx * 37, ny * 37, nz * 37) - 0.5);
      hw = smooth(t - 0.06, t + 0.07, ny) * (0.8 + 0.2 * smooth(t, t + 0.12, ny));
      const n = 0.92 + 0.1 * noise3(nx * 14, ny * 30, nz * 14);
      r += (hc.r * n - r) * hw; g += (hc.g * n - g) * hw; b += (hc.b * n - b) * hw;
    }
    col.setXYZ(i, r, g, b);
    if (slot) { rig[i * 4 + 2] = slot; rig[i * 4 + 3] = Math.round(255 * smooth(0.22, 0.55, nz) * (1 - hw)); }
  }
  out.push(skull);
  // 鼻子：一整块变形的球（不再是一根锥 + 几个球拼起来，接缝处不会有一圈一圈的明暗）——鼻梁窄、往下渐宽，
  // 鼻头最往前，两侧鼻翼鼓出来，后半截埋进脸里；朝下的面压暗（鼻孔）
  const br = facePoint(head, 0, 0.04), bs = facePoint(head, 0, -0.3), H = (br[1] - bs[1]) * 1.02, cy = (br[1] + bs[1]) / 2;
  const nose = new THREE.SphereGeometry(1, 14, 12), np = nose.attributes.position;
  for (let i = 0; i < np.count; i++) {
    const x = np.getX(i), y = np.getY(i), z = np.getZ(i), t = (1 - y) / 2; // t：0 鼻根 → 1 鼻底
    const w = (0.0052 + 0.0085 * t * t + 0.0042 * gauss(t - 0.84, 0.1)) * (0.7 + 0.3 * ns);
    const fwd = (0.003 + 0.0135 * Math.pow(t, 1.3) * (1 - 0.55 * smooth(0.86, 1, t))) * ns;
    const fz = br[2] + (bs[2] - br[2]) * t - 0.004; // 脸面（鼻子后半截埋在这里面）
    np.setXYZ(i, x * w, cy + y * H / 2, fz + (z > 0 ? z * fwd : z * 0.006));
  }
  paintGeo(nose, o.skin, SURF.SKIN); nose.computeVertexNormals();
  { const nn = nose.attributes.normal; shade(nose, (x, y, z, i) => { const d = Math.max(0, -nn.getY(i)), m = 1 - 0.5 * d * d * smooth(cy - H * 0.2, cy - H * 0.45, y); return [m, m * 0.95, m * 0.94]; }); }
  out.push(nose);
  // 嘴唇的体积（只在没有贴花时用）
  const m = facePoint(head, 0, -0.5), lipHex = o.lip;
  const lips = [ellip(lipHex, SURF.SKIN, [0.019, 0.0045, 0.0045], [m[0], m[1] + 0.0042, m[2] - 0.0025]), ellip(lipHex, SURF.SKIN, [0.0165, 0.0058, 0.005], [m[0], m[1] - 0.0048, m[2] - 0.003])];
  if (!slot) out.push(...lips); // 有贴花时唇形画在贴花里，嘴部的体积由头型给（单独的两块唇会像两个泡）
  if (!slot) {
    // 没有贴花：眼睛（眼白偏暖灰、虹膜、上眼皮压一点）、睫毛线、两段眉毛
    for (const s of [-1, 1]) {
      const e = facePoint(head, s * 0.34, 0.07);
      out.push(ellip(0xb9afa2, SURF.GLOSS, [0.0118, 0.0068, 0.008], [e[0], e[1], e[2] - 0.004]));
      out.push(ellip(o.iris ?? 0x2a1c14, SURF.GLOSS, [0.0058, 0.006, 0.003], [e[0] - s * 0.0005, e[1] - 0.0004, e[2] + 0.0025]));
      out.push(rod(o.skin, SURF.SKIN, [e[0] - 0.0125, e[1] + 0.0058, e[2] - 0.0028], [e[0] + 0.0125, e[1] + 0.0058, e[2] - 0.0028], 0.0038, 6));
      out.push(rod(o.brow, SURF.HAIR, [e[0] - 0.0118, e[1] + 0.003, e[2] - 0.0004], [e[0] + 0.0118, e[1] + 0.0034, e[2] - 0.0011], 0.0013, 4));
      const b0 = facePoint(head, s * 0.13, 0.26), b1 = facePoint(head, s * 0.35, 0.31), b2 = facePoint(head, s * 0.54, 0.25);
      out.push(rod(o.brow, SURF.HAIR, [b0[0], b0[1], b0[2] - 0.001], [b1[0], b1[1], b1[2] - 0.001], 0.0022, 5), rod(o.brow, SURF.HAIR, [b1[0], b1[1], b1[2] - 0.001], [b2[0], b2[1], b2[2] - 0.0025], 0.0018, 5));
    }
  }
  // 耳朵：一片压扁的椭球（耳甲，后缘往外翻，看得出耳朵立在头两侧）+ 一圈耳轮（从前上方绕过头顶、顺着后缘下到耳垂）；
  // 朝外那面中间（耳甲腔）压暗
  for (const s of [-1, 1]) {
    const E = new THREE.Vector3(o.c[0] + s * o.r[0] * 0.95, o.c[1] - 0.012, o.c[2] - 0.012), turn = new THREE.Matrix4().makeRotationY(s * 0.5);
    const g = new THREE.SphereGeometry(1, 12, 10); g.scale(0.0065, 0.03, 0.019);
    const pe = g.attributes.position;
    for (let i = 0; i < pe.count; i++) { const y = pe.getY(i), zz = pe.getZ(i); pe.setZ(i, zz * (1 - 0.3 * smooth(0, -0.03, y))); } // 耳垂收窄
    g.rotateZ(-s * 0.06); g.applyMatrix4(turn); g.translate(E.x + s * 0.003, E.y, E.z);
    paintGeo(g, o.skin, SURF.SKIN); g.computeVertexNormals();
    const nn = g.attributes.normal;
    shade(g, (x, y, z, i) => { const side = Math.max(0, nn.getX(i) * s), c = side * gauss(Math.hypot(y - E.y - 0.002, z - E.z) / 0.016, 0.75); const m = 1 - 0.42 * c; return [m * 1.03, m * 0.96, m * 0.95]; });
    out.push(g);
    const rim = [];
    for (let k = 0; k <= 13; k++) {
      const th = -0.9 + 3.5 * k / 13, q = new THREE.Vector3(s * (0.006 + 0.003 * Math.sin(Math.max(0, th))), 0.027 * Math.cos(th) + 0.001, -0.0165 * Math.sin(th)).applyMatrix4(turn).add(E);
      rim.push({ p: [q.x, q.y, q.z], n: [s, 0, 0] });
    }
    const rg = edgeTube(rim, 0.0033, o.skin, SURF.SKIN, { closed: false, sides: 4, inset: 0 });
    out.push(rg);
  }
  return out;
}

/**
 * 头发：比头大一圈的同形壳。发际线往里 1–12 厘米的一段从头皮里慢慢「长」出来（头皮那一圈已经涂成发色，
 * 壳和头皮的交线落在发色里看不出来），发际线以外缩进头里藏起来。
 * line：发际线高度（同 humanHead）；inflate：头顶头发的厚度。
 */
export function hairShell(o) {
  const head = { c: o.c, r: o.r, k: o.k ?? 1 };
  const at = (nx, ny, nz) => {
    const t = hairT(o.line, nz), w = smooth(t + 0.07, t + 0.22, ny);
    // 头顶最厚，往两边收（贴头皮的短发 / 扎起来的长发）
    return 0.93 + (o.inflate - 0.93 + 0.02 * smooth(0.3, 0.95, ny) + 0.012 * (noise3(nx * 6, ny * 9, nz * 6) - 0.5)) * w;
  };
  const g = paintGeo(sculptedSphere(head, 36, 26, at), o.hair, SURF.HAIR), dir = g.userData.dir;
  // 发丝的深浅：沿着头发梳的方向（从发际线往后）拉长的噪声
  return shade(g, (x, y, z, i) => { const nx = dir[i * 3], ny = dir[i * 3 + 1], nz = dir[i * 3 + 2]; const n = 0.86 + 0.26 * noise3(nx * 26, ny * 5, nz * 26); return [n, n, n * 1.02]; });
}

/**
 * 拉到下巴底下的外科口罩：一片略弯的长方形（三道横褶），上沿贴着下巴底下，下沿松松地垂在脖子前面；
 * 两面都有（单面材质，从侧面、下面看不会透），上下沿一道包边，四个角各一根白色耳挂绕到耳朵后面。
 * o：{ c（头心）, hex（口罩颜色）, loop（耳挂颜色）, ear: [x, y, z]（右耳的位置，左耳镜像）}
 */
export function surgicalMask(o) {
  const [cx, cy, cz] = o.c, cols = 14, rows = 12, out = [];
  // 宽度只包到下巴两侧（不绕到下颌角——那样就成了一圈护颈），往下 4 厘米多（褶被耳挂往上拽着，没完全拉开）
  const T = (u) => [cx + 0.052 * u, cy - 0.086 + 0.016 * u * u, cz + 0.05 - 0.018 * u * u];
  const B = (u) => [cx + 0.058 * u, cy - 0.13 + 0.022 * u * u, cz + 0.07 - 0.032 * u * u];
  const at = (u, v, inset) => {
    const a = T(u), b = B(u), p = [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v, a[2] + (b[2] - a[2]) * v];
    const nx = p[0] - cx, nz = p[2] - cz + 0.01, l = Math.hypot(nx, nz) || 1, f = v * 3 - Math.floor(v * 3 - 1e-6);
    // 三道褶：每道往外鼓一点再折回来（锯齿）；中间整片微微鼓起（不是贴着脖子的一圈）
    const d = 0.0032 * f + 0.005 * Math.sin(Math.PI * v) * (1 - u * u) - inset;
    return [p[0] + nx / l * d, p[1] - 0.0015 * f, p[2] + nz / l * d];
  };
  const front = gridGeo(cols, rows, (i, j) => at(-1 + 2 * i / cols, j / rows, 0), o.hex, SURF.SCRUBS);
  const back = gridGeo(cols, rows, (i, j) => at(1 - 2 * i / cols, j / rows, 0.0012), o.hex, SURF.SCRUBS);
  // 褶的折线处压暗一点，褶面受光那一侧亮一点
  for (const g of [front, back]) {
    const c = g.attributes.color;
    for (let j = 0; j <= rows; j++) { const f = (j / rows) * 3 % 1, m = j % 4 === 0 && j % rows ? 0.72 : 0.92 + 0.1 * f; for (let i = 0; i <= cols; i++) { const k = j * (cols + 1) + i; c.setXYZ(k, c.getX(k) * m, c.getY(k) * m, c.getZ(k) * m); } }
    out.push(grimeGeo(g, () => 0.55));
  }
  for (const v of [0, 1]) out.push(edgeTube(Array.from({ length: cols + 1 }, (_, i) => ({ p: at(-1 + 2 * i / cols, v, 0.0006), n: [0, v ? -1 : 1, 0] })), 0.0016, o.hex, SURF.SCRUBS, { closed: false, sides: 4, inset: 0 }));
  // 耳挂：从四个角绕过耳朵上面、挂在耳朵后面
  for (const s of [-1, 1]) {
    const [ex, ey, ez] = o.ear, X = cx + s * Math.abs(ex - cx);
    const top = [at(s, 0, 0), [X + s * 0.006, ey + 0.01, ez + 0.012], [X + s * 0.004, ey + 0.032, ez - 0.006], [X - s * 0.002, ey + 0.012, ez - 0.022]];
    const bot = [at(s, 1, 0), [X + s * 0.008, ey - 0.03, ez + 0.006], [X + s * 0.004, ey - 0.012, ez - 0.02], [X - s * 0.002, ey + 0.012, ez - 0.022]];
    for (const q of [top, bot]) out.push(edgeTube(q.map((p) => ({ p, n: [s, 0, 0] })), 0.0013, o.loop, SURF.SCRUBS, { closed: false, sides: 4, inset: 0 }));
  }
  return out;
}

// ---- 衣服：贴着身体的一层（背心、肩带、包边），搭模型用 ----
/** 一个 (rows+1)×(cols+1) 的网格几何体（pos(i, j) → [x, y, z]），带 uv（全 0，合并时属性要一致）、法线、颜色和 rig */
function gridGeo(cols, rows, pos, hex, surf, wrap = false) {
  const nv = (cols + 1) * (rows + 1), p = new Float32Array(nv * 3), idx = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const q = pos(i, j), k = (j * (cols + 1) + i) * 3; p[k] = q[0]; p[k + 1] = q[1]; p[k + 2] = q[2]; }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2)); g.setIndex(idx);
  g.computeVertexNormals();
  if (wrap) { // 首尾两列是同一圈：法线取平均，接缝不出棱
    const n = g.attributes.normal;
    for (let j = 0; j <= rows; j++) { const a = j * (cols + 1), b = a + cols; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); }
  }
  return paintGeo(g, hex, surf);
}
/**
 * 躯干外面的一层壳（贴身背心）：躯干是圆角方块（半宽 hw、半深 hd、圆角 rc，上下 yb–yt），壳按周长参数 s（0 = 胸口正中，
 * 往人的左手边绕一圈）和高度 y 取点，离躯干 off 米；到了躯干顶上的圆角区，截面跟着收（肩膀处背心是往里包的）。
 * 返回 point(s, y, extra) → { p, n }，和 sAt(x, front) 按 x 找 s。
 */
export function torsoSurface({ hw = 0.18, hd = 0.11, rc = 0.08, yb = 0.02, yt = 0.46, off = 0.013 } = {}) {
  const Ai = hw - rc, Bi = hd - rc, L = 4 * Ai + 4 * Bi + 2 * Math.PI * rc;
  const point = (s, y, extra = 0) => {
    // 偏移后的圆角方块在这个高度的截面：内框 Ai × Bi，圆角半径 R（顶上、底下的圆角区里 R 变小，截面往里收）
    const o = off + extra, ro = rc + o, d = Math.max(0, y - (yt - rc), (yb + rc) - y), R = Math.sqrt(Math.max(0, ro * ro - Math.min(d, ro) ** 2));
    let t = (((s % 1) + 1) % 1) * L, k = 0;
    const seg = [Ai, Math.PI * rc / 2, 2 * Bi, Math.PI * rc / 2, 2 * Ai, Math.PI * rc / 2, 2 * Bi, Math.PI * rc / 2, Ai];
    while (k < seg.length - 1 && t > seg[k]) { t -= seg[k]; k++; }
    // 每一段：圆心（直边就是直边上的点）+ 外法线方向
    let cx, cz, a;
    switch (k) {
      case 0: cx = t; cz = Bi; a = Math.PI / 2; break;
      case 1: cx = Ai; cz = Bi; a = Math.PI / 2 - t / rc; break;
      case 2: cx = Ai; cz = Bi - t; a = 0; break;
      case 3: cx = Ai; cz = -Bi; a = -t / rc; break;
      case 4: cx = Ai - t; cz = -Bi; a = -Math.PI / 2; break;
      case 5: cx = -Ai; cz = -Bi; a = -Math.PI / 2 - t / rc; break;
      case 6: cx = -Ai; cz = -Bi + t; a = Math.PI; break;
      case 7: cx = -Ai; cz = Bi; a = Math.PI - t / rc; break;
      default: cx = -Ai + t; cz = Bi; a = Math.PI / 2;
    }
    const nx = Math.cos(a), nz = Math.sin(a), ny = d > 0 ? (y > (yt + yb) / 2 ? 1 : -1) * Math.min(d, ro) / ro : 0, nl = Math.sqrt(1 - ny * ny);
    return { p: [cx + nx * R, y, cz + nz * R], n: [nx * nl, ny, nz * nl] };
  };
  const table = Array.from({ length: 721 }, (_, i) => { const q = point(i / 720, (yt + yb) / 2).p; return [i / 720, q[0], q[2]]; });
  const sAt = (x, front = true) => { let best = 0, bd = Infinity; for (const [s, px, pz] of table) { if ((pz > 0) !== front) continue; const d = Math.abs(px - x); if (d < bd) { bd = d; best = s; } } return best; };
  return { point, sAt, L, hw, hd, rc, yb, yt, off };
}
/** 壳上的一块（s0–s1 × y0–y1，y1 可以是 s 的函数），离躯干再远 extra 米；cols / rows 网格数 */
export function shellPatch(T, { s0 = 0, s1 = 1, y0, y1, cols = 64, rows = 8, extra = 0, hex, surf = SURF.CLOTH, flare = 0, wrap = false }) {
  const top = typeof y1 === 'function' ? y1 : () => y1;
  return gridGeo(cols, rows, (i, j) => {
    const s = s0 + (s1 - s0) * i / cols, yt = top(s), y = y0 + (yt - y0) * j / rows, q = T.point(s, y, extra + flare * Math.max(0, 1 - j / 2));
    return q.p;
  }, hex, surf, wrap);
}
/** 沿一圈点拉一根细管（衣服的包边、绳）：pts = [{ p, n }]（n：往外的法线，管子往里收一点盖住壳和身体的缝） */
export function edgeTube(pts, r, hex, surf = SURF.CLOTH, { closed = true, sides = 5, inset = 0.003 } = {}) {
  const n = pts.length, rows = closed ? n : n - 1, T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  const ring = pts.map((q, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)].p, b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)].p;
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); N.set(...q.n); N.addScaledVector(T, -N.dot(T)).normalize(); B.crossVectors(T, N);
    const c = [q.p[0] - N.x * inset, q.p[1] - N.y * inset, q.p[2] - N.z * inset];
    return Array.from({ length: sides + 1 }, (_, k) => { const a2 = k / sides * Math.PI * 2, cs = Math.cos(a2) * r, sn = Math.sin(a2) * r; return [c[0] + N.x * cs + B.x * sn, c[1] + N.y * cs + B.y * sn, c[2] + N.z * cs + B.z * sn]; });
  });
  return gridGeo(sides, rows, (k, i) => ring[i % n][k], hex, surf);
}
/**
 * 搭在肩上的带子（背心肩带、反光条）：x0–x1 宽，顺着躯干顶上的圆角从胸前 yFront 绕到背后，离躯干 off 米，带两侧的边（厚 thick）。
 */
export function shoulderArch(T, { x0, x1, yFront = 0.42, off, thick = 0.004, hex, surf = SURF.CLOTH, steps = 14 }) {
  const yc = T.yt - T.rc, zc = T.hd - T.rc, path = (x, o) => {
    const dx = Math.max(0, Math.abs(x) - (T.hw - T.rc)), R = Math.sqrt(Math.max(0, T.rc * T.rc - dx * dx)) + o;
    const a0 = Math.asin(Math.max(-1, Math.min(1, (yFront - yc) / R))), pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = a0 + (Math.PI - 2 * a0) * t; // 前面 a0 → 头顶 π/2 → 背后 π - a0
      pts.push([x, yc + Math.sin(a) * R, Math.cos(a) * (R) + Math.sign(Math.cos(a)) * zc]);
    }
    return pts;
  };
  const xs = [x0, (x0 + x1) / 2, x1], top = xs.map((x) => path(x, off)), low = xs.map((x) => path(x, off - thick));
  const face = gridGeo(2, steps, (i, j) => top[i][j], hex, surf);
  const sideA = gridGeo(1, steps, (i, j) => (i ? top[0][j] : low[0][j]), hex, surf), sideB = gridGeo(1, steps, (i, j) => (i ? low[2][j] : top[2][j]), hex, surf);
  return [face, sideA, sideB];
}
/** 按半径曲线车出来的肢体（a → b；profile：[[t, r], …]，t 从 0 到 1）——三角肌、二头肌、小臂、手腕粗细不一样 */
export function lathe(a, b, profile, hex, surf = SURF.CLOTH, seg = 12) {
  const d = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z), len = d.length();
  const g = new THREE.LatheGeometry(profile.map(([t, r]) => new THREE.Vector2(r, t * len)), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return paintGeo(g, hex, surf);
}
