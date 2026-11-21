import * as THREE from 'three';
import { MEM, capImage } from './device.js';
import { SURFACE_ASSETS } from './pbr-data.js';

/** 图片已随构建嵌入。按内存档位（device.js 的 MEM）缩小：省内存档只留 256² 的颜色贴图（不要法线、粗糙度），
 * 标准档 512²，手机的高清档颜色贴图 1024²，电脑原样。材质跨所有楼层共享。 */
export async function loadSurfaceTextures(anisotropy = 4) {
  const entries = await Promise.all(SURFACE_ASSETS.map(async (asset) => {
    const maps = {};
    await Promise.all(Object.entries(asset.maps).map(async ([purpose, url]) => {
      if (MEM.pbrMaps === 'color' && purpose !== 'color') return;
      const img = new Image();
      img.src = url;
      await img.decode();
      const source = capImage(img, purpose === 'color' ? MEM.pbrColorSize : MEM.pbrSize);
      const t = new THREE.Texture(source);
      t.name = `${asset.id}/${purpose}`;
      t.colorSpace = purpose === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
      t.repeat.set(1 / asset.meters[0], 1 / asset.meters[1]);
      t.needsUpdate = true;
      t.userData = { source: asset.sourceUrl, license: 'CC0-1.0', width: source.width, height: source.height };
      maps[purpose] = t;
    }));
    return [asset.id, { ...asset, maps }];
  }));
  return Object.fromEntries(entries);
}

// 楼面种类 → 面层贴图 + 色调。贴图是网上的 CC0 扫描材质（Poly Haven、ambientCG，见 assets/textures/*/manifest.json），
// 颜色贴图都调成了接近中性的浅色，楼面的颜色由这里的 tint 给。
export const FLOOR_SURFACES = {
  'metro-terrazzo': { id: 'terrazzo_grey', tint: '#e5e5df', roughness: .65, glow: .22 },
  'metro-platform': { id: 'terrazzo_grey', tint: '#cbd4d6', roughness: .68, glow: .22 },
  granite: { id: 'granite_speckle', tint: '#eef0f3', roughness: .8, glow: .22 },
  'p1-paving': { id: 'plaza_pavers', tint: '#e6e0d3', roughness: .85, outdoor: true },
  'p1-paving-border': { id: 'plaza_pavers', tint: '#677575', roughness: .85, outdoor: true },
  'p1-paving-inlay': { id: 'plaza_pavers', tint: '#c7b18c', roughness: .85, outdoor: true },
  'carpet-linen': { id: 'carpet_loop', tint: '#c1b5a1', roughness: 1, normal: .5, glow: .18 },
  'carpet-ocean': { id: 'carpet_fleck', tint: '#cbb58e', roughness: 1, normal: .5, glow: .18 },
  'carpet-sage': { id: 'carpet_fleck', tint: '#d2c19c', roughness: 1, normal: .5, glow: .18 },
  'carpet-clay': { id: 'carpet_fleck', tint: '#a27b65', roughness: 1, normal: .5, glow: .18 },
  'carpet-flax': { id: 'carpet_loop', tint: '#d3bd92', roughness: 1, normal: .5, glow: .18 },
  'marble-white': { id: 'marble_01', tint: '#f7f6f2' },
  'terrazzo-cool': { id: 'terrazzo_grey', tint: '#bfc8cc' },
  'terrazzo-warm': { id: 'terrazzo_warm', tint: '#dcc7a6' },
  'wood-warm': { id: 'oak_wood_planks' },
  'deck-garden': { id: 'oak_wood_planks', tint: '#e2d1b8' },
  // Pale roof pavers of the concept aerial; timber stays under seating only.
  'roof-stone': { id: 'stone_slabs', tint: '#f4efe6' },
  'concrete-blue': { id: 'garage_concrete', tint: '#b9c6d3' },
  'concrete-green': { id: 'garage_concrete', tint: '#bccabf' },
  paving: { id: 'concrete_pavement_02' },
  stone: { id: 'stone_slabs', tint: '#766b5f' },
  cobble: { id: 'cobble_fan', tint: '#dbcab5', normal: .5 },
  rubber: { id: 'rubber_track', tint: '#ee7a50', roughness: 1 },
  asphalt: { id: 'clean_asphalt' },
  grass: { id: 'grass_ground', tint: '#d2dfa8' },
};

/**
 * 纯色材质上叠的细纹理（worldDetail）：哪种面用哪张贴图、多深、铺多大。
 * matte 是室内的墙和杂项，ext 是室外的墙、路缘和远处的楼，ceiling 是各层天花（楼板底面），
 * garageSoffit 是车库顶板，floorPaint 是车库车道的地坪漆。
 */
export const DETAIL_SURFACES = Object.freeze({
  // normal：法线细节的深浅（贴图有法线、档位载入了法线才有）；patch：大块深浅（补过的漆、晒褪的一片）；
  // sheen：大块的粗糙度起伏（手电扫过去，有的地方哑、有的地方泛一点光）
  matte: { id: 'painted_plaster', strength: 0.9, normal: 0.8, patch: 0.07, sheen: 0.2 },
  ext: { id: 'tunnel_concrete', strength: 0.75, normal: 0.6, patch: 0.08, sheen: 0.12 },
  ceiling: { id: 'ceiling_panels', strength: 1, patch: 0.05, sheen: 0.1 },
  garageSoffit: { id: 'formed_concrete', strength: 1, meters: 2.4, normal: 0.6, patch: 0.08, sheen: 0.12 },
  floorPaint: { id: 'garage_concrete', strength: 0.8, meters: 4, normal: 0.45, patch: 0.06, sheen: 0.22 },
});

export function pbrOptions(asset, normalStrength = 0.35) {
  // 省内存档没有法线、粗糙度贴图（只有颜色）
  return { map: asset.maps.color, normalMap: asset.maps.normal || null,
    roughnessMap: asset.maps.roughness || null, normalScale: new THREE.Vector2(normalStrength, normalStrength) };
}

/** 楼面一律按米制坐标取样，不受 ShapeGeometry 或旧局部 UV 缩放影响。 */
export function metricFloor(mat, asset, colorAsset = asset) {
  mat.onBeforeCompile = (shader) => {
    // 按世界坐标取样（乘 modelMatrix）：省内存档把批次的顶点坐标压成了归一化整数，position 不再是米。
    // 省内存档没有法线、粗糙度贴图：对应的 varying 不存在，要按宏判断，不然着色器编译失败、整块地面不画。
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vec4 surfaceWorld = modelMatrix * vec4(position, 1.0);
      vec2 surfaceUv = vec2(surfaceWorld.x, -surfaceWorld.z) / vec2(${asset.meters[0].toFixed(3)}, ${asset.meters[1].toFixed(3)});
      vec2 surfaceColorUv = vec2(surfaceWorld.x, -surfaceWorld.z) / vec2(${colorAsset.meters[0].toFixed(3)}, ${colorAsset.meters[1].toFixed(3)});
      #ifdef USE_MAP
        vMapUv = surfaceColorUv;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = surfaceUv;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = surfaceUv;
      #endif
      #ifdef USE_EMISSIVEMAP
        vEmissiveMapUv = surfaceColorUv;
      #endif
    `);
  };
  mat.customProgramCacheKey = () => `metric-floor-${asset.id}-${colorAsset.id}`;
  return mat;
}

const srgbToLinear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

// ---------------------------------------------------------------------------------------------------------
// 纯色面的世界坐标细节（worldDetail / worldWear）。
// 楼里的墙、天花、楼板、混凝土大多是按顶点色画的盒子，没有 UV。以前只按世界坐标投一张颜色贴图：手电一照还是一片平涂。
// 现在按档位叠几层，全部在像素着色器里算，不加顶点数据：
//   · 法线：同一套 CC0 扫描的法线贴图，按投影轴给出切线（投影 u 方向 = 切线，v 方向 = 副切线，正好是 dP/du、dP/dv），
//     贴图法线的 xy 沿切线、副切线叠到几何法线上（UDN 混合）——手电斜着扫过墙面，抹灰、混凝土的起伏会拉出明暗。
//   · 粗糙度：贴图深的地方（坑、毛面）粗一点，再按大块噪声上下浮动——光斑里有的地方哑、有的地方泛一点光。
//   · 防重复：电脑档在另一个比例、转过一个角度的位置再取一次，按低频噪声混合，长走廊的墙上看不出一格格的重复。
//     手机档不多取样，靠大块深浅和细纹理深浅的起伏把重复打散。
//   · 大块变化：一张程序生成的 256² 低频噪声图（macroNoise），通道分别是 补漆斑块 / 水渍与污斑 / 竖向流痕 / 防重复权重。
//   · 停电污垢（只在丧尸围城）：materials.js 按供电（power）设 wdGrime。墙根一圈脏（离脚下地面越近越脏）、竖向流痕、
//     天花上的水渍圈、地面的灰；整体旧一点、黄一点、哑一点。漫游、白天 wdGrime 是 0，画面和以前一样干净。
// 每像素多取样几次（基线是 1 次颜色）：compact 不做；standard / rich（手机）+2（法线、大块噪声）；full（电脑）+4（颜色、法线各两次、大块噪声）。
// ---------------------------------------------------------------------------------------------------------

/** 大块噪声图铺多大（米）。256 像素铺 16 米：一格 6 厘米，流痕一条 15 厘米宽左右 */
export const MACRO_METERS = 16;
/** 玩家站着时眼睛离地多高（和游戏里的站姿眼高一致）：用相机高度估脚下地面，墙根的脏按这个算 */
export const DETAIL_EYE = 1.68;
/** 估地面高度时的平滑时间（秒）：跳一下、蹲一下，墙根那圈脏不跟着上下跳 */
export const FLOOR_TAU = 0.45;

/** 所有细节材质共用的几个 uniform：停电污垢的强度、玩家脚下地面的高度（世界 y）、大块噪声图 */
const WD = { grime: { value: 0 }, floorY: { value: 0 }, macro: { value: null } };
const floorTrack = { y: null, t: 0, frame: -1 };

/** 停电污垢的强度（0 = 干净，1 = 断电的楼）。materials.js 按供电设。 */
export function setWorldGrime(v) {
  WD.grime.value = Math.max(0, Math.min(1, +v || 0));
  if (!(WD.grime.value > 0)) floorTrack.y = null;
  return WD.grime.value;
}
export const worldGrime = () => WD.grime.value;

/**
 * 按相机高度估玩家脚下地面的高度：目标 = 相机 y − 站姿眼高，指数平滑（跳、蹲、上楼梯不会让墙根的脏忽上忽下）；
 * 一下差出 2.5 米以上（坐电梯、传送、过场镜头）直接跳过去。纯函数，返回新的估计值。
 */
export function trackFloor(prev, cameraY, dt, tau = FLOOR_TAU, eye = DETAIL_EYE) {
  const target = cameraY - eye;
  if (prev == null || !Number.isFinite(prev) || Math.abs(target - prev) > 2.5) return target;
  return prev + (target - prev) * (1 - Math.exp(-Math.max(0, Math.min(0.1, dt)) / tau));
}

/** 画每个细节材质之前（每帧只算一次）：停电时更新脚下地面的高度。不停电什么都不做。 */
function updateFloor(renderer, scene, camera) {
  if (!(WD.grime.value > 0) || !camera?.matrixWorld) return;
  const frame = renderer?.info?.render?.frame ?? 0;
  if (frame === floorTrack.frame && floorTrack.y != null) return;
  floorTrack.frame = frame;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  floorTrack.y = trackFloor(floorTrack.y, camera.matrixWorld.elements[13], (now - floorTrack.t) / 1000);
  floorTrack.t = now;
  WD.floorY.value = floorTrack.y;
}

/** 可复现的随机数（mulberry32） */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 一层可平铺的值噪声：横向 px 格、纵向 py 格铺满整张图，按权重 w 加到 acc 上（平滑插值，首尾相接） */
function addNoise(acc, size, px, py, w, rand) {
  const lat = new Float32Array(px * py);
  for (let i = 0; i < lat.length; i++) lat[i] = rand();
  const axis = (cells) => {
    const i0 = new Int32Array(size), i1 = new Int32Array(size), f = new Float32Array(size);
    for (let x = 0; x < size; x++) { const u = (x + 0.5) * cells / size, i = Math.floor(u), t = u - i; i0[x] = i % cells; i1[x] = (i + 1) % cells; f[x] = t * t * (3 - 2 * t); }
    return { i0, i1, f };
  };
  const X = axis(px), Y = axis(py);
  for (let y = 0; y < size; y++) {
    const r0 = Y.i0[y] * px, r1 = Y.i1[y] * px, fy = Y.f[y], row = y * size;
    for (let x = 0; x < size; x++) {
      const a = lat[r0 + X.i0[x]], b = lat[r0 + X.i1[x]], c = lat[r1 + X.i0[x]], d = lat[r1 + X.i1[x]], fx = X.f[x];
      const top = a + (b - a) * fx, bottom = c + (d - c) * fx;
      acc[row + x] += w * (top + (bottom - top) * fy);
    }
  }
  return acc;
}

/** 按直方图拉平到 0–1 均匀分布：着色器里的阈值就是百分位（0.9 = 最高的一成），各通道好调 */
function equalize(acc) {
  const n = acc.length;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const v = acc[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const bins = 1024, cdf = new Float32Array(bins + 1), k = (bins - 1) / Math.max(1e-6, hi - lo);
  for (let i = 0; i < n; i++) cdf[((acc[i] - lo) * k + 0.5) | 0]++;
  // cdf[b] = 落在 b 之前（不含 b）的个数 + 半个 b 本身：拉平后的值在格子中间，不偏
  let run = 0;
  for (let b = 0; b <= bins; b++) { const c = cdf[b]; cdf[b] = (run + c * 0.5) / n; run += c; }
  for (let i = 0; i < n; i++) {
    const p = (acc[i] - lo) * k, b = p | 0, f = p - b;
    acc[i] = cdf[b] + (cdf[b + 1 > bins ? bins : b + 1] - cdf[b]) * f;
  }
  return acc;
}

const smooth01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * 分步生成大块噪声（每一步是一层噪声，几毫秒）：先在 out 里填好「中性值」，最后一步才写真正的像素。
 * R：补漆斑块、深浅不匀（低频）；G：水渍、污斑（中低频，另一组随机数）；
 * B：竖向流痕（横向很密、纵向很疏的噪声，取最高的一小撮，再按一层低频噪声成片出现）；A：防重复的混合权重（低频）。
 * 纵向（图的行）对应墙上的世界 y：流痕是竖的。
 */
export function* macroNoiseSteps(size, seed, out) {
  const rand = mulberry(seed), n = size * size;
  const spec = { R: [[3, 3, 0.5], [6, 6, 0.25], [12, 12, 0.15], [24, 24, 0.1]], G: [[4, 4, 0.45], [8, 8, 0.3], [16, 16, 0.15], [32, 32, 0.1]],
    S: [[104, 5, 0.75], [104, 13, 0.25]], Sg: [[9, 3, 0.7], [18, 6, 0.3]], A: [[3, 3, 0.7], [6, 6, 0.3]] };
  const ch = {};
  for (const [name, octaves] of Object.entries(spec)) {
    const acc = new Float32Array(n);
    for (const [px, py, w] of octaves) { addNoise(acc, size, px, py, w, rand); yield; }
    ch[name] = equalize(acc); yield;
  }
  const { R, G, S, Sg, A } = ch;
  for (let i = 0; i < n; i++) {
    const streak = smooth01(0.8, 0.97, S[i]) * smooth01(0.35, 0.8, Sg[i]);
    out[i * 4] = (R[i] * 255 + 0.5) | 0; out[i * 4 + 1] = (G[i] * 255 + 0.5) | 0;
    out[i * 4 + 2] = (streak * 255 + 0.5) | 0; out[i * 4 + 3] = (A[i] * 255 + 0.5) | 0;
  }
}

/** 中性值：没有斑块、没有水渍和流痕、防重复权重一半——噪声还没算完时画面和不加这层差不多 */
export const MACRO_NEUTRAL = Object.freeze([128, 128, 0, 128]);
function neutralFill(out) { for (let i = 0; i < out.length; i += 4) out.set(MACRO_NEUTRAL, i); return out; }

/** 大块噪声图的像素（RGBA，size×size，可平铺），一次算完。纯函数，测试直接用。 */
export function macroNoise(size = 256, seed = 1207) {
  const out = neutralFill(new Uint8Array(size * size * 4));
  const steps = macroNoiseSteps(size, seed, out);
  while (!steps.next().done);
  return out;
}

/**
 * 大块噪声贴图（全页共用一张，256²，约 340 KB 显存含 mipmap）。没有 DOM（node 测试）时返回 null。
 * 一次算完要二三十毫秒（手机更久），所以先放中性值，再分十几步（每步一层噪声）在空闲时算完、上传一次。
 */
export function macroTexture() {
  if (WD.macro.value || typeof document === 'undefined') return WD.macro.value;
  const size = 256, data = neutralFill(new Uint8Array(size * size * 4));
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.name = 'world-detail/macro'; t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  WD.macro.value = t;
  // 写到另一块缓冲里，算完再整块换上：中途不会上传半张图
  const buffer = new Uint8Array(size * size * 4), work = macroNoiseSteps(size, 1207, buffer);
  const tick = () => {
    if (WD.macro.value !== t) return; // 中途被释放了
    if (!work.next().done) { setTimeout(tick, 0); return; }
    data.set(buffer); t.needsUpdate = true;
  };
  setTimeout(tick, 0);
  return t;
}
/** 释放大块噪声图（材质库一起不用了的时候；之后再要会重新生成） */
export function disposeWorldDetail() { WD.macro.value?.dispose(); WD.macro.value = null; floorTrack.y = null; }

/** 这一档做到哪一步：'off'（省内存档，材质照旧纯色）/ 'lite'（手机：+2 次取样）/ 'full'（电脑：+4 次取样）。用的时候现读 MEM。 */
export function worldDetailTier(mem = MEM) {
  if (!mem?.decor) return 'off';
  return mem.lite ? 'lite' : 'full';
}

const f3 = (v) => (+v).toFixed(4);
const ROT = [Math.cos(0.66), Math.sin(0.66)]; // 防重复的第二次取样转过的角度（约 38°）

/**
 * 着色器片段（纯函数，测试直接看）。v：{ map, normal, roughMap, antiTile, wearOnly, strength, inv, gain, ns, patch, sheen }。
 * 返回 { pars, color, rough, normal }：分别插在 <common>、<color_fragment>、<roughnessmap_fragment>、<normal_fragment_maps> 后面。
 */
export function worldDetailChunks(v) {
  const [c, s] = ROT;
  const pars = ['varying vec3 vDetailPos;', 'varying vec3 vDetailNormal;', 'uniform sampler2D wdMacro;', 'uniform float wdGrime;', 'uniform float wdFloorY;',
    v.map ? 'uniform sampler2D wdMap;' : '', v.normal ? 'uniform sampler2D wdNormalMap;' : '', v.roughMap ? 'uniform sampler2D wdRoughMap;' : ''].filter(Boolean).join('\n');
  // 停电污垢：墙根（离脚下地面 0–1.1 米，往下 0.4 米以外——楼下那层的墙——不算）、竖向流痕、成片的污斑；天花的水渍圈；地面的灰
  const grime = `
    float wdH = vDetailPos.y - wdFloorY;
    float wdLow = (1.0 - smoothstep(0.0, 1.1, wdH)) * smoothstep(-0.4, -0.05, wdH);
    float wdBlot = smoothstep(0.45, 0.95, wdM.g);
    float wdDirt = wdWall * (wdLow * wdLow * (0.3 + 0.45 * wdBlot) + wdM.b * (0.22 + 0.2 * smoothstep(0.3, 2.2, wdH)) + wdBlot * 0.12)
      + wdDown * (wdStain * 0.3 + wdBlot * 0.16)
      + wdUp * (wdBlot * 0.22 + smoothstep(0.5, 0.9, wdM.r) * 0.1);
    wdDirt *= wdGrime;
    wdMul *= mix(vec3(1.0), vec3(0.93, 0.89, 0.81), wdGrime);
    wdMul *= 1.0 - min(wdDirt, 0.62);
    wdRough += wdDirt * 0.45 + wdGrime * 0.04;`;
  const faces = `
    vec3 wdN = normalize(vDetailNormal);
    vec3 wdA = abs(wdN);
    vec2 wdP; vec3 wdT; vec3 wdB;
    if (wdA.y > max(wdA.x, wdA.z)) { wdP = vDetailPos.xz; wdT = vec3(1.0, 0.0, 0.0); wdB = vec3(0.0, 0.0, 1.0); }
    else if (wdA.x > wdA.z) { wdP = vDetailPos.zy; wdT = vec3(0.0, 0.0, 1.0); wdB = vec3(0.0, 1.0, 0.0); }
    else { wdP = vDetailPos.xy; wdT = vec3(1.0, 0.0, 0.0); wdB = vec3(0.0, 1.0, 0.0); }
    float wdUp = smoothstep(0.6, 0.8, wdN.y), wdDown = smoothstep(0.6, 0.8, -wdN.y), wdWall = 1.0 - wdUp - wdDown;`;
  const macro = `vec4 wdM = texture2D(wdMacro, wdP * ${f3(1 / MACRO_METERS)} + vec2(0.13, 0.41));
    float wdStain = smoothstep(0.86, 0.9, wdM.g) * (1.0 - 0.6 * smoothstep(0.9, 0.97, wdM.g));`;
  let color;
  if (v.wearOnly) {
    // 自带贴图的材质（清水混凝土、抹灰、楼面）：只在停电时叠污垢，平时不多取样（按 uniform 分支，整批像素走同一边）
    color = `${faces}
    float wdRough = 0.0;
    vec3 wdMul = vec3(1.0);
    if (wdGrime > 0.001) {
      ${macro}
      ${grime}
    }
    diffuseColor.rgb *= wdMul;`;
  } else {
    color = `${faces}
    ${macro}
    float wdRough = 0.0;
    vec2 wdUv = wdP * ${f3(v.inv)};
    vec3 wdC = texture2D(wdMap, wdUv).rgb;
    ${v.antiTile ? `vec2 wdUv2 = mat2(${f3(c)}, ${f3(s)}, ${f3(-s)}, ${f3(c)}) * wdUv * 0.73 + vec2(0.31, 0.57);
    float wdW = smoothstep(0.4, 0.6, wdM.a);
    wdC = mix(wdC, texture2D(wdMap, wdUv2).rgb, wdW);` : ''}
    wdC *= vec3(${v.gain.map(f3).join(', ')});
    float wdLum = dot(wdC, vec3(0.2126, 0.7152, 0.0722));
    // 细纹理本身的深浅也成片起伏：有的地方抹得平、有的地方糙
    vec3 wdMul = mix(vec3(1.0), wdC, ${f3(v.strength)} * (0.7 + 0.6 * wdM.r));
    wdMul *= 1.0 + (wdM.r - 0.5) * ${f3(v.patch * 2)};
    // 天花上淡淡的水渍圈（漫游里几乎看不出，停电时深一些）
    wdMul *= mix(vec3(1.0), vec3(0.93, 0.89, 0.8), wdStain * wdDown * 0.5);
    wdRough += (1.0 - wdLum) * 0.18 + (wdM.r - 0.5) * ${f3(v.sheen * 2)} - wdStain * wdDown * 0.08;
    ${v.roughMap ? `wdRough += (texture2D(wdRoughMap, wdUv).g - 0.5) * 0.3;` : ''}
    if (wdGrime > 0.001) {
      ${grime}
    }
    diffuseColor.rgb *= wdMul;`;
  }
  const rough = `roughnessFactor = clamp(roughnessFactor + wdRough, 0.05, 1.0);`;
  // 法线：切线、副切线先投到这个面上（斜墙也对），离相机远了逐渐收掉（远处 mip 之后只剩闪烁）
  const normal = v.normal ? `{
      vec3 wdNm = texture2D(wdNormalMap, wdUv).xyz * 2.0 - 1.0;
      ${v.antiTile ? `vec3 wdNm2 = texture2D(wdNormalMap, wdUv2).xyz * 2.0 - 1.0;
      wdNm2.xy = mat2(${f3(c)}, ${f3(-s)}, ${f3(s)}, ${f3(c)}) * wdNm2.xy;
      wdNm = mix(wdNm, wdNm2, wdW);` : ''}
      float wdNs = ${f3(v.ns)} * (1.0 - smoothstep(14.0, 40.0, distance(vDetailPos, cameraPosition)));
      vec3 wdTt = normalize(wdT - wdN * dot(wdN, wdT)), wdBt = normalize(wdB - wdN * dot(wdN, wdB));
      vec3 wdBump = (wdTt * wdNm.x + wdBt * wdNm.y) * wdNs;
      normal = normalize(normal + faceDirection * (viewMatrix * vec4(wdBump, 0.0)).xyz);
    }` : '';
  return { pars, color, rough, normal };
}

/** 世界坐标和世界法线传给像素着色器（实例化、批次坐标压缩都已经算进 modelMatrix / instanceMatrix 里） */
const DETAIL_VERTEX = `#include <project_vertex>
      vec4 detailWorld = vec4(transformed, 1.0);
      vec3 detailN = objectNormal;
      #ifdef USE_INSTANCING
        detailWorld = instanceMatrix * detailWorld;
        detailN = mat3(instanceMatrix) * detailN;
      #endif
      vDetailPos = (modelMatrix * detailWorld).xyz;
      vDetailNormal = mat3(modelMatrix) * detailN;`;

/** 给材质挂上着色器补丁：前面已有的补丁（夜间自发光、楼面米制坐标……）照样先跑；克隆出来的材质（各栋楼带剖切面那份）也对 */
function hookDetail(mat, variant, textures, key) {
  // 材质上原来的补丁和缓存键：只认自己挂上去的（原型上的默认缓存键是整段 onBeforeCompile 的源码，不串进来）
  const own = (k) => Object.prototype.hasOwnProperty.call(mat, k) ? mat[k] : null;
  const prev = own('onBeforeCompile'), prevKey = own('customProgramCacheKey');
  mat.onBeforeCompile = function (shader, renderer) {
    prev?.call(this, shader, renderer);
    if (typeof shader.fragmentShader !== 'string' || typeof shader.vertexShader !== 'string') return;
    const chunks = worldDetailChunks(variant);
    shader.uniforms ||= {};
    Object.assign(shader.uniforms, { wdMacro: WD.macro, wdGrime: WD.grime, wdFloorY: WD.floorY });
    for (const [name, t] of Object.entries(textures)) shader.uniforms[name] = { value: t };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos;\nvarying vec3 vDetailNormal;')
      .replace('#include <project_vertex>', DETAIL_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${chunks.pars}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${chunks.color}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${chunks.rough}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${chunks.normal}`);
    // 这份材质（也可能是克隆）画之前更新脚下地面的高度；材质自己原来的 onBeforeRender 照样调
    if (this && this.onBeforeRender !== detailBeforeRender && !this.userData?.detailBeforeRender) {
      const own = this.onBeforeRender;
      this.onBeforeRender = own && own !== THREE.Material.prototype.onBeforeRender
        ? function (...a) { detailBeforeRender(...a); return own.apply(this, a); } : detailBeforeRender;
      if (this.userData) this.userData.detailBeforeRender = true;
    }
  };
  mat.customProgramCacheKey = function () { return `${prevKey ? prevKey.call(this) : ''}|${key}`; };
  return mat;
}
function detailBeforeRender(renderer, scene, camera) { updateFloor(renderer, scene, camera); }

/** 这种材质在当前档位下的变体（哪些贴图、几次取样）。纯函数（mem 可以传进来测）。 */
export function detailVariant(asset, { strength = 1, meters = asset?.meters?.[0] || 2, normal = 0, patch = 0.06, sheen = 0.15 } = {}, mem = MEM) {
  const tier = worldDetailTier(mem);
  if (tier === 'off' || !asset?.maps?.color) return null;
  const mean = asset.mean || [255, 255, 255];
  const all = mem.pbrMaps === 'all';
  return {
    tier, map: true, strength, inv: 1 / meters, patch, sheen,
    gain: mean.map((v) => 1 / Math.max(0.05, srgbToLinear(v))),
    normal: !!(all && normal > 0 && asset.maps.normal), ns: normal,
    roughMap: !!(all && tier === 'full' && asset.maps.roughness),
    antiTile: tier === 'full',
  };
}

/**
 * 纯色材质上的细纹理：墙、天花、楼板、外墙这些面是按顶点色画的，没有 UV。这里按世界坐标把一张面层贴图投上去
 * （看面朝哪边，取另外两个坐标），乘到底色上，再除掉贴图的平均色——平均下来颜色不变，只多了真实材质的深浅纹理；
 * 再按档位叠法线、粗糙度、防重复、大块变化和停电污垢（见上面的说明）。不加顶点数据；法线贴图是已经载入的那一张。
 * strength：纹理的深浅（1 是贴图原样）；meters：贴图铺多大（默认用贴图自己的尺寸）；normal / patch / sheen 见 DETAIL_SURFACES。
 * 省内存档没有这层，材质照旧是纯色。surfaces 是 loadSurfaceTextures 的结果，kind 是 DETAIL_SURFACES 里的一项。
 */
export function worldDetail(mat, asset, opts = {}) {
  if (!MEM.decor) return mat;
  if (!asset?.maps?.color || !mat?.isMeshStandardMaterial) return mat;
  const v = detailVariant(asset, opts);
  if (!v) return mat;
  macroTexture();
  const textures = { wdMap: asset.maps.color };
  if (v.normal) textures.wdNormalMap = asset.maps.normal;
  if (v.roughMap) textures.wdRoughMap = asset.maps.roughness;
  const key = `detail-${asset.id}-${v.strength}-${(1 / v.inv).toFixed(3)}-${v.tier}-${v.normal ? `n${v.ns}` : 'c'}${v.roughMap ? 'r' : ''}${v.antiTile ? 'a' : ''}-${v.patch}-${v.sheen}`;
  hookDetail(mat, v, textures, key);
  mat.userData.detail = asset.id;
  return mat;
}

/**
 * 自带贴图（有 UV）的面——清水混凝土墙、抹灰墙、楼面——只叠停电污垢：平时一次也不多取样（按 uniform 分支跳过），
 * 丧尸围城断电时 +1 次（大块噪声图）。省内存档不叠。
 */
export function worldWear(mat) {
  if (!MEM.decor || !mat?.isMeshStandardMaterial || mat.userData?.wear) return mat;
  macroTexture();
  hookDetail(mat, { wearOnly: true }, {}, 'wear');
  mat.userData.wear = true;
  return mat;
}

/** 按 DETAIL_SURFACES 给一种纯色材质叠细纹理。 */
export function detailFor(mat, surfaces, kind) {
  const def = DETAIL_SURFACES[kind];
  return def ? worldDetail(mat, surfaces?.[def.id], def) : mat;
}
