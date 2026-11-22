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
  // sheen：大块的粗糙度起伏（±sheen：应急灯、手电扫过去，有的地方哑、有的地方泛一点光）；
  // repaint：补漆的方块（硬边、略冷或略暖几个百分点——3–8 米外平涂的墙就靠它和 patch 读出「刷过好几遍」）；
  // broad：低频法线（同一张法线贴图放大约 3.7 倍再取一次：抹刀的大起伏，5 米外 mip 以后细纹没了它还在）。电脑档才有。
  matte: { id: 'painted_plaster', strength: 0.9, normal: 0.32, patch: 0.14, sheen: 0.25, repaint: 1, broad: 0.5 },
  ext: { id: 'tunnel_concrete', strength: 0.75, normal: 0.6, patch: 0.1, sheen: 0.16, broad: 0.35 },
  // 吊顶板、清水混凝土的模板缝是规则的格子：转个角度再取一次会出斜缝，不做防重复（antiTile: false）。
  // panels：贴图一格里有几块板（水渍按整块板来，停在板缝上）
  ceiling: { id: 'ceiling_panels', strength: 1, patch: 0.06, sheen: 0.12, antiTile: false, panels: 2 },
  garageSoffit: { id: 'formed_concrete', strength: 1, meters: 2.4, normal: 0.6, patch: 0.1, sheen: 0.16, antiTile: false },
  floorPaint: { id: 'garage_concrete', strength: 0.8, meters: 4, normal: 0.45, patch: 0.06, sheen: 0.22 },
});

/**
 * 自带 UV 的面层（materials.js 的 plaster / concrete 批次：楼梯间的墙、踏步、平台、梯段底板，地下室的清水混凝土墙）：
 * 贴图照旧按批次投的米制 UV 取，这里再叠 uvDetail（见下）。
 * tread：朝上的面（踏步、平台、楼面）换成水泥地面的纹理（墙上的抹灰 / 木模板纹铺在踏步上是一片平的）；
 * panel / contrast：清水混凝土墙按 panel 米一块模板错开贴图（板缝、对拉螺栓孔不再在每面墙同一高度连成一线），
 * 墙上的板缝深浅压到 contrast（原样太深，像刷了漆的木挂板）。
 */
export const UV_SURFACES = Object.freeze({
  plaster: { id: 'painted_plaster', patch: 0.12, sheen: 0.22, repaint: 1, broad: 0.45, tread: 'garage_concrete' },
  concrete: { id: 'formed_concrete', patch: 0.1, sheen: 0.16, panel: 2.4, contrast: 0.5, tread: 'garage_concrete' },
});
/** 踏步、平台上的水泥纹理：铺多大（米）、多深、法线多深 */
export const TREAD = Object.freeze({ meters: 1.6, strength: 0.6, normal: 0.55 });

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
// 每像素多取样几次（基线是 1 次颜色）：compact 不做；standard / rich（手机）+2（法线、大块噪声）；
// full（电脑）+4（颜色两次、细法线 + 低频法线、大块噪声；贴图有粗糙度时再 +1）。
// 自带 UV 的楼梯间 / 混凝土面（uvDetail）：手机 +2（大块噪声；朝上的面再取一次水泥颜色），电脑墙面 +2（大块噪声、低频法线）、
// 朝上的面 +3（大块噪声、水泥颜色和法线）。数一数见 detailFetches()。
// ---------------------------------------------------------------------------------------------------------

/** 大块噪声图铺多大（米）。256 像素铺 16 米：一格 6 厘米，流痕一条 15 厘米宽左右 */
export const MACRO_METERS = 16;
/** 玩家站着时眼睛离地多高（和 layout/nav.js 的 NAV.eye 一致）：用相机高度估脚下地面，墙根的脏按这个算 */
export const DETAIL_EYE = 1.62;
/** 估地面高度时的平滑时间（秒）：跳一下、蹲一下，墙根那圈脏不跟着上下跳 */
export const FLOOR_TAU = 0.45;

/** 相机竖直方向要「停稳」多久（秒）才认新的地面：一路走楼梯、跳起来的时候墙根那圈脏不跟着人往上爬 */
export const FLOOR_STILL = 0.3;
/** 比当前估计低这么多以内（米）的下沉不认：蹲下（眼睛低 0.72 米）、滑铲，脏的那一圈不该跟着往下掉 */
export const FLOOR_DIP = 0.8;

/** 所有细节材质共用的几个 uniform：停电污垢的强度、玩家脚下地面的高度（世界 y）、大块噪声图 */
const WD = { grime: { value: 0 }, floorY: { value: 0 }, macro: { value: null } };
const floorTrack = { y: null, cam: null, still: 0, chase: false, t: 0, frame: -1 };

/** 停电污垢的强度（0 = 干净，1 = 断电的楼）。materials.js 按供电设。 */
export function setWorldGrime(v) {
  WD.grime.value = Math.max(0, Math.min(1, +v || 0));
  if (!(WD.grime.value > 0)) floorTrack.y = floorTrack.cam = null;
  return WD.grime.value;
}
export const worldGrime = () => WD.grime.value;
/** 调试 / 测试：当前停电污垢强度和估出来的脚下地面高度 */
export const worldDetailState = () => ({ grime: WD.grime.value, floorY: WD.floorY.value, tracked: floorTrack.y });

/**
 * 指数平滑一步：目标 = 相机 y − 站姿眼高。一下差出 2.5 米以上直接跳过去。纯函数，返回新的估计值。
 */
export function trackFloor(prev, cameraY, dt, tau = FLOOR_TAU, eye = DETAIL_EYE) {
  const target = cameraY - eye;
  if (prev == null || !Number.isFinite(prev) || Math.abs(target - prev) > 2.5) return target;
  return prev + (target - prev) * (1 - Math.exp(-Math.max(0, Math.min(0.1, dt)) / tau));
}

/**
 * 按相机高度估玩家脚下的地面（墙根那圈停电污垢按它画）。只在相机竖直方向停稳 FLOOR_STILL 秒以后才慢慢挪过去：
 * 爬楼梯的一路上，脏的那一圈留在出发那层的墙根，不会顺着梯段的墙跟人一起往上滑；跳起来、落地也不动。
 * 比估计低一点点（蹲下、滑铲）不认。一帧里差出 1.2 米以上（传送、过场镜头切回）直接跳过去；
 * 坐电梯是连续移动，停稳后慢慢挪过去——差得远的时候新楼层墙根的脏是从无到有淡入的，不会一条线扫过墙面。
 * 纯函数：s = { y, cam, still, chase }（第一次传 null），返回新的状态。
 */
export function stepFloor(s, cameraY, dt, eye = DETAIL_EYE) {
  const target = cameraY - eye;
  if (!Number.isFinite(target)) return s;
  if (!s || s.y == null || !Number.isFinite(s.y) || s.cam == null) return { y: target, cam: cameraY, still: 0, chase: false };
  const step = Math.max(0, Math.min(0.1, +dt || 0));
  const dy = cameraY - s.cam;
  if (Math.abs(dy) > 1.2) return { y: target, cam: cameraY, still: 0, chase: false };
  const still = Math.abs(dy) <= 0.3 * Math.max(step, 1e-3) ? s.still + step : 0;
  let y = s.y, chase = !!s.chase;
  // chase：已经认了新地面、正在挪过去——从上往下挪到最后那 0.8 米也要挪完（不然坐电梯下楼会停在半空）
  if (still >= FLOOR_STILL && (chase || target > y || y - target >= FLOOR_DIP)) {
    y += (target - y) * (1 - Math.exp(-step / FLOOR_TAU));
    chase = Math.abs(target - y) > 0.05;
  }
  return { y, cam: cameraY, still, chase };
}

/** 画每个细节材质之前（每帧只算一次）：停电时更新脚下地面的高度。不停电什么都不做。 */
function updateFloor(renderer, scene, camera) {
  if (!(WD.grime.value > 0) || !camera?.matrixWorld) return;
  const frame = renderer?.info?.render?.frame ?? 0;
  if (frame === floorTrack.frame && floorTrack.y != null) return;
  floorTrack.frame = frame;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const next = stepFloor(floorTrack, camera.matrixWorld.elements[13], (now - floorTrack.t) / 1000);
  floorTrack.y = next.y; floorTrack.cam = next.cam; floorTrack.still = next.still; floorTrack.chase = next.chase;
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
 * B：竖向流痕（横向密、纵向很疏的噪声，取最高的一小撮，再按一层低频噪声成片出现；一格约 17 厘米宽——太细会像一道道划痕，不像水流过的印子）；
 * A：防重复的混合权重（低频）。
 * 纵向（图的行）对应墙上的世界 y：流痕是竖的。
 */
export function* macroNoiseSteps(size, seed, out) {
  const rand = mulberry(seed), n = size * size;
  const spec = { R: [[3, 3, 0.5], [6, 6, 0.25], [12, 12, 0.15], [24, 24, 0.1]], G: [[4, 4, 0.45], [8, 8, 0.3], [16, 16, 0.15], [32, 32, 0.1]],
    S: [[96, 6, 0.7], [96, 17, 0.3]], Sg: [[9, 3, 0.7], [18, 6, 0.3]], A: [[3, 3, 0.7], [6, 6, 0.3]] };
  const ch = {};
  for (const [name, octaves] of Object.entries(spec)) {
    const acc = new Float32Array(n);
    for (const [px, py, w] of octaves) { addNoise(acc, size, px, py, w, rand); yield; }
    ch[name] = equalize(acc); yield;
  }
  const { R, G, S, Sg, A } = ch;
  for (let i = 0; i < n; i++) {
    const streak = smooth01(0.86, 0.98, S[i]) * smooth01(0.45, 0.85, Sg[i]);
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

/**
 * 世界法线 n 对应的投影：取哪根轴（'x' / 'y' / 'z'）、u 翻不翻号（s）、切线 T、副切线 B。
 * 和着色器里 faces 那段一一对应（测试用它验证六个面都是右手系：T × B = 面的法线）。
 */
export function detailFrame([x, y, z]) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ay > Math.max(ax, az)) { const s = y >= 0 ? -1 : 1; return { axis: 'y', s, T: [s, 0, 0], B: [0, 0, 1] }; }
  if (ax > az) { const s = x >= 0 ? -1 : 1; return { axis: 'x', s, T: [0, 0, s], B: [0, 1, 0] }; }
  const s = z >= 0 ? 1 : -1;
  return { axis: 'z', s, T: [s, 0, 0], B: [0, 1, 0] };
}

const f3 = (v) => (+v).toFixed(4);
const v3 = (a) => `vec3(${a.map(f3).join(', ')})`;
const ROT = [Math.cos(0.66), Math.sin(0.66)]; // 防重复的第二次取样转过的角度（约 38°）
/** 低频法线：同一张法线贴图铺大约 3.7 倍（抹灰 2 米一格 → 7.4 米），5 米外细纹 mip 掉了，这层大起伏还在 */
export const BROAD_SCALE = 0.27;

/** 着色器里的小工具：按格子取一个 0–1 的随机数（格子编号是整数，sin 的精度够用，不闪） */
const HASH = 'float wdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }';

/** 投影轴、切线、朝向（朝上 / 朝下 / 墙）：放在 <map_fragment> 前面（清水混凝土按模板块错开贴图要先知道是哪面墙） */
function facesChunk(v) {
  return `
    vec3 wdN = normalize(vDetailNormal);
    vec3 wdA = abs(wdN);
    vec2 wdP; vec3 wdT; vec3 wdB; float wdAxis;
    // 投影的 u 按面朝向翻个号，让 (切线, 副切线, 法线) 在六个面上都是右手系、切线正好是 dP/du：
    // 不翻的话一半的面（朝 +x、+y、-z）法线贴图的凹凸是反的，手电从一边照过来，坑看着像鼓包
    if (wdA.y > max(wdA.x, wdA.z)) { float s = wdN.y >= 0.0 ? -1.0 : 1.0; wdP = vec2(vDetailPos.x * s, vDetailPos.z); wdT = vec3(s, 0.0, 0.0); wdB = vec3(0.0, 0.0, 1.0); wdAxis = 0.0; }
    else if (wdA.x > wdA.z) { float s = wdN.x >= 0.0 ? -1.0 : 1.0; wdP = vec2(vDetailPos.z * s, vDetailPos.y); wdT = vec3(0.0, 0.0, s); wdB = vec3(0.0, 1.0, 0.0); wdAxis = 1.0 + step(0.0, wdN.x); }
    else { float s = wdN.z >= 0.0 ? 1.0 : -1.0; wdP = vec2(vDetailPos.x * s, vDetailPos.y); wdT = vec3(s, 0.0, 0.0); wdB = vec3(0.0, 1.0, 0.0); wdAxis = 3.0 + step(0.0, wdN.z); }
    float wdUp = smoothstep(0.6, 0.8, wdN.y), wdDown = smoothstep(0.6, 0.8, -wdN.y), wdWall = 1.0 - wdUp - wdDown;
    float wdDist = distance(vDetailPos, cameraPosition);${v.panel ? `
    // 清水混凝土：每 ${v.panel} 米一块模板，各块的贴图上下左右错开——板缝、螺栓孔不再在每面墙的同一高度连成一线；
    // 错开的地方是一道竖缝，正好是模板块之间的拼缝
    float wdPn = floor(wdP.x / ${f3(v.panel)} + 0.37) + wdAxis * 37.0;
    vec2 wdOff = vec2(wdHash(vec2(wdPn, 3.1)), wdHash(vec2(wdPn, 8.7))) * step(0.5, wdWall);` : ''}`;
}

/** 清水混凝土墙：错开后的 UV 取颜色，墙上的板缝深浅压一压（朝上、朝下的面不动） */
function panelMapChunk(v) {
  return `#ifdef USE_MAP
    vec4 sampledDiffuseColor = texture2D( map, vMapUv + wdOff );
    sampledDiffuseColor.rgb = mix(${v3(v.meanLin)}, sampledDiffuseColor.rgb, mix(1.0, ${f3(v.contrast)}, step(0.5, wdWall)));
    diffuseColor *= sampledDiffuseColor;
  #endif`;
}

/** 补漆的方块：墙面按 1.7 × 1.15 米分格（各面墙错开），约六分之一的格子里有一块随机大小的补漆——硬边、略冷或略暖、漆面新一点 */
function repaintChunk(amount) {
  return `{
      vec2 wdQ = wdP / vec2(1.7, 1.15) + vec2(wdAxis * 0.37, wdAxis * 0.61);
      vec2 wdCell = floor(wdQ), wdF = fract(wdQ);
      float wdR1 = wdHash(wdCell), wdR2 = wdHash(wdCell + 17.3), wdR3 = wdHash(wdCell + 41.9);
      vec2 wdLo = vec2(0.04 + 0.3 * wdR2, 0.06 + 0.3 * wdR3), wdHi = min(wdLo + vec2(0.35 + 0.55 * wdR3, 0.3 + 0.6 * wdR2), vec2(0.97));
      vec2 wdIn2 = step(wdLo, wdF) * step(wdF, wdHi);
      float wdRep = wdIn2.x * wdIn2.y * step(0.84, wdR1) * wdWall * ${f3(amount)};
      wdMul *= mix(vec3(1.0), wdR2 > 0.5 ? vec3(1.045, 1.025, 0.985) : vec3(0.98, 1.0, 1.035), wdRep);
      wdRough -= 0.1 * wdRep;
    }`;
}

/** 大块深浅：补漆斑块（R）带一点色相（深的一片略暖、浅的一片略冷），粗糙度按另一个通道（A）上下浮动 ±sheen */
const patchChunk = (v) => `
    wdMul *= (1.0 + (wdM.r - 0.5) * ${f3(v.patch * 2)}) * mix(vec3(1.0), vec3(0.985, 1.0, 1.02), smoothstep(0.6, 0.95, wdM.r)) * mix(vec3(1.0), vec3(1.02, 1.0, 0.975), 1.0 - smoothstep(0.05, 0.4, wdM.r));
    wdRough += (wdM.a - 0.5) * ${f3(v.sheen * 2)};`;

/** 吊顶板的水渍：按整块板来（停在板缝上），一块板里一团淡黄褐、边上一圈深一点的水线。平时淡，停电时深 */
const panelStainChunk = (v) => `{
      vec2 wdTq = wdUv * ${f3(v.panels)}; vec2 wdTc = floor(wdTq), wdTf = fract(wdTq);
      vec2 wdSc = vec2(0.3) + 0.4 * vec2(wdHash(wdTc + 9.1), wdHash(wdTc + 5.3));
      float wdSr = 0.2 + 0.28 * wdHash(wdTc + 12.7);
      float wdSd = length(wdTf - wdSc) + (wdM.g - 0.5) * 0.32;
      float wdSin = (1.0 - smoothstep(wdSr - 0.012, wdSr, wdSd)) * step(0.86, wdHash(wdTc + 3.7)) * wdDown;
      float wdTide = smoothstep(wdSr - 0.055, wdSr - 0.01, wdSd) * wdSin;
      float wdSk = 0.3 + 0.7 * wdGrime;
      wdMul *= mix(vec3(1.0), vec3(0.94, 0.9, 0.8), wdSin * wdSk);
      wdMul *= mix(vec3(1.0), vec3(0.8, 0.71, 0.58), wdTide * wdSk);
      wdRough -= 0.06 * wdSin;
    }`;

/**
 * 停电污垢：墙根一圈脏（离脚下地面 0–0.8 米，高低不齐，带棕灰色——深绿的墙裙、深色地砖上也看得出来），
 * 墙地交接处最深；竖向流痕（高处浓、往下淡，矮处也有一点）；成片的污斑；天花水渍、整体发灰；
 * 地面的灰积成一片一片（大块噪声高的地方），常走的地方（大块噪声低）干净些。
 */
const GRIME = `
    float wdH = vDetailPos.y - wdFloorY;
    // 只算脚下这一层的墙根（往下 0.4 米以外是楼下那层、中庭里看到的下面几层，不算）
    float wdIn = smoothstep(-0.4, -0.05, wdH);
    // 脏的那一圈高低不齐：拖把水、鞋踢、靠墙堆过东西——高度按大块噪声在 0.18–0.78 米之间起伏，上沿是一团一团的
    float wdBand = 0.18 + 0.6 * wdM.g * (0.35 + 0.65 * wdM.r);
    float wdLow = (1.0 - smoothstep(0.0, wdBand, wdH)) * wdIn;
    float wdHaze = (1.0 - smoothstep(0.0, 1.4, wdH)) * wdIn;
    // 墙和地面交接的那一线积灰最深（10 厘米内）
    float wdContact = (1.0 - smoothstep(0.0, 0.1, wdH)) * wdIn;
    float wdBlot = smoothstep(0.45, 0.95, wdM.g);
    // 流痕：高处的浓（从窗台、管井、楼板缝漏下来），往下淡；矮处留一点（溅上去的泥水）
    float wdStreak = wdM.b * (0.14 + 0.3 * smoothstep(0.2, 2.0, wdH));
    wdDirt = wdWall * (wdLow * (0.3 + 0.25 * wdBlot) + wdHaze * 0.12 + wdContact * 0.3 + wdStreak + wdBlot * 0.12)
      + wdDown * (wdStain * 0.2 + wdBlot * 0.12 + 0.06);
    wdDirt = min(wdDirt, 0.75) * wdGrime;
    // 地面的灰：一片一片（R 高的地方），常走的路上（A 低）干净；整片只有薄薄一层
    float wdDrift = smoothstep(0.5, 0.92, wdM.r) * (0.55 + 0.45 * wdBlot) * smoothstep(0.2, 0.55, wdM.a);
    wdDust = wdUp * wdGrime * (0.03 + 0.34 * wdDrift + 0.06 * wdBlot);
    wdMul *= mix(vec3(1.0), vec3(0.93, 0.9, 0.84), wdGrime);
    wdRough += wdDirt * 0.45 + wdDust * 0.6 + wdGrime * 0.05;`;

/** 最后上色：细纹理 / 大块变化（wdMul），污垢往棕灰色上混（深色面也变色，不只是更黑），地面的灰往灰褐色上混 */
const APPLY = `
    vec3 wdCol = diffuseColor.rgb * wdMul;
    wdCol = mix(wdCol, wdCol * vec3(0.5, 0.44, 0.36) + vec3(0.03, 0.025, 0.018), wdDirt);
    diffuseColor.rgb = mix(wdCol, vec3(0.3, 0.28, 0.25), wdDust);`;

/**
 * 着色器片段（纯函数，测试直接看）。三种：
 *   detail（纯色材质，worldDetail）：v = { map, normal, roughMap, antiTile, broad, strength, inv, gain, ns, patch, sheen, repaint, panels, cavity }；
 *   wear（自带贴图的楼面、住宅墙，worldWear）：v = { wearOnly: true }；
 *   uv（楼梯间的抹灰 / 清水混凝土批次，uvDetail）：v = { uv: true, patch, sheen, repaint, broad, tread, treadNormal, gainT, panel, contrast, meanLin }。
 * 返回 { pars, faces, map, color, rough, normal, normalMap }：pars 插在 <common> 后；faces 插在 <map_fragment> 前（没有就并进 color）；
 * map 非空时替换 <map_fragment>；color、rough、normal 分别插在 <color_fragment>、<roughnessmap_fragment>、<normal_fragment_maps> 后；
 * normalMap 为真时 <normal_fragment_maps> 本身也换掉（法线贴图按错开后的 UV 取）。
 */
export function worldDetailChunks(v) {
  const [c, s] = ROT;
  const pars = ['varying vec3 vDetailPos;', 'varying vec3 vDetailNormal;', 'uniform sampler2D wdMacro;', 'uniform float wdGrime;', 'uniform float wdFloorY;', HASH,
    v.map ? 'uniform sampler2D wdMap;' : '', v.normal ? 'uniform sampler2D wdNormalMap;' : '', v.roughMap ? 'uniform sampler2D wdRoughMap;' : '',
    v.tread ? 'uniform sampler2D wdTreadMap;' : '', v.treadNormal ? 'uniform sampler2D wdTreadNormal;' : ''].filter(Boolean).join('\n');
  const faces = facesChunk(v);
  const macro = `vec4 wdM = texture2D(wdMacro, wdP * ${f3(1 / MACRO_METERS)} + vec2(0.13, 0.41));
    float wdStain = smoothstep(0.83, 0.9, wdM.g) * (1.0 - 0.55 * smoothstep(0.9, 0.98, wdM.g));`;
  const head = 'float wdRough = 0.0, wdDust = 0.0, wdDirt = 0.0;';
  let color, normal = '';
  if (v.wearOnly) {
    // 自带贴图的材质（楼面、住宅墙）：只在停电时叠污垢，平时不多取样（按 uniform 分支跳过，整批像素走同一边）
    color = `
    ${head}
    vec3 wdMul = vec3(1.0);
    if (wdGrime > 0.001) {
      ${macro}
      ${GRIME}
    }${APPLY}`;
  } else if (v.uv) {
    // 楼梯间的抹灰、清水混凝土（批次投好的米制 UV，贴图在 <map_fragment> 里已经取了）：叠大块变化、补漆、踏步的水泥纹理、低频法线、停电污垢
    color = `
    ${macro}
    ${head}
    vec3 wdMul = vec3(1.0);${patchChunk(v)}
    ${v.repaint ? repaintChunk(v.repaint) : ''}
    vec2 wdTn = vec2(0.0), wdNb = vec2(0.0);
    ${v.tread ? `// 朝上的面（踏步、平台、楼面）：水泥地面的深浅和抹痕（只有朝上的像素取样）
    if (wdUp > 0.01) {
      vec2 wdTuv = wdP * ${f3(1 / TREAD.meters)} + vec2(0.21, 0.63);
      vec3 wdTc = texture2D(wdTreadMap, wdTuv).rgb * ${v3(v.gainT)};
      wdMul *= mix(vec3(1.0), wdTc, ${f3(TREAD.strength)} * wdUp * (0.75 + 0.5 * wdM.r));
      wdRough += (0.5 - 0.5 * dot(wdTc, vec3(0.2126, 0.7152, 0.0722))) * 0.3 * wdUp;
      ${v.treadNormal ? 'wdTn = (texture2D(wdTreadNormal, wdTuv).xy * 2.0 - 1.0) * wdUp;' : ''}
    }` : ''}
    ${v.broad ? `#ifdef USE_NORMALMAP
    // 低频法线：墙上的抹灰按 ${f3(1 / BROAD_SCALE)} 倍再取一次（远处还看得出抹刀的大起伏）
    if (wdWall > 0.5 && wdDist < 45.0) wdNb = texture2D(normalMap, wdP * ${f3(BROAD_SCALE * v.inv)} + vec2(0.37, 0.71)).xy * 2.0 - 1.0;
    #endif` : ''}
    if (wdGrime > 0.001) {
      ${GRIME}
    }${APPLY}`;
    if (v.treadNormal || v.broad) normal = `{
      vec2 wdXY = wdTn * ${f3(TREAD.normal)} + wdNb * ${f3(v.broad || 0)} * (1.0 - smoothstep(25.0, 45.0, wdDist));
      vec3 wdTt = normalize(wdT - wdN * dot(wdN, wdT)), wdBt = normalize(wdB - wdN * dot(wdN, wdB));
      normal = normalize(normal + faceDirection * (viewMatrix * vec4(wdTt * wdXY.x + wdBt * wdXY.y, 0.0)).xyz);
    }`;
  } else {
    color = `
    ${macro}
    ${head}
    vec2 wdUv = wdP * ${f3(v.inv)};
    vec3 wdC = texture2D(wdMap, wdUv).rgb;
    ${v.antiTile ? `vec2 wdUv2 = mat2(${f3(c)}, ${f3(s)}, ${f3(-s)}, ${f3(c)}) * wdUv * 0.73 + vec2(0.31, 0.57);
    float wdW = smoothstep(0.4, 0.6, wdM.a);
    wdC = mix(wdC, texture2D(wdMap, wdUv2).rgb, wdW);` : ''}
    wdC *= ${v3(v.gain)};
    float wdLum = dot(wdC, vec3(0.2126, 0.7152, 0.0722));
    vec2 wdNb = vec2(0.0);
    ${v.normal ? `// 法线贴图在这里就取（下面法线那段接着用）：抹灰、混凝土的颜色贴图几乎是平的（白漆墙标准差不到 2%），
    // 起伏全在法线里——坡度大的地方（坑边、刮痕、抹刀印）压暗一点、粗一点，手电正对着照也看得出质感
    vec3 wdNm = texture2D(wdNormalMap, wdUv).xyz * 2.0 - 1.0;
    ${v.broad ? `// 低频法线：同一张法线贴图铺大 ${f3(1 / BROAD_SCALE)} 倍（墙上的大起伏、抹刀的波浪，5 米外还在；也顺带把重复打散）
    if (wdDist < 45.0) wdNb = texture2D(wdNormalMap, wdUv * ${f3(BROAD_SCALE)} + vec2(0.37, 0.71)).xy * 2.0 - 1.0;` : ''}
    float wdSlope = smoothstep(0.04, 0.4, length(wdNm.xy)) * (1.0 - smoothstep(10.0, 30.0, wdDist));
    float wdCav = wdSlope * ${f3(v.cavity ?? 0)};` : 'float wdCav = 0.0;'}
    // 细纹理本身的深浅也成片起伏：有的地方抹得平、有的地方糙
    vec3 wdMul = mix(vec3(1.0), wdC, ${f3(v.strength)} * (0.7 + 0.6 * wdM.r));${patchChunk(v)}
    ${v.repaint ? repaintChunk(v.repaint) : ''}
    wdMul *= 1.0 - wdCav;
    ${v.panels ? panelStainChunk(v) : `// 天花上淡淡的水渍圈（漫游里几乎看不出，停电时深一些）
    wdMul *= mix(vec3(1.0), vec3(0.93, 0.88, 0.78), wdStain * wdDown * (0.45 + 0.55 * wdGrime));
    wdRough -= wdStain * wdDown * 0.08;`}
    wdRough += (1.0 - wdLum) * 0.18 + wdCav * 1.5;
    ${v.roughMap ? `wdRough += (texture2D(wdRoughMap, wdUv).g - 0.5) * 0.3;` : ''}
    if (wdGrime > 0.001) {
      ${GRIME}
    }${APPLY}`;
    // 法线：切线、副切线先投到这个面上（斜墙也对）；细纹离相机远了逐渐收掉（远处 mip 之后只剩闪烁），低频的留到 25–45 米
    if (v.normal) normal = `{
      float wdNs = ${f3(v.ns)} * (1.0 - smoothstep(14.0, 40.0, wdDist));
      vec3 wdTt = normalize(wdT - wdN * dot(wdN, wdT)), wdBt = normalize(wdB - wdN * dot(wdN, wdB));
      vec2 wdXY = wdNm.xy * wdNs + wdNb * ${f3((v.broad || 0) * v.ns)} * (1.0 - smoothstep(25.0, 45.0, wdDist));
      vec3 wdBump = wdTt * wdXY.x + wdBt * wdXY.y;
      normal = normalize(normal + faceDirection * (viewMatrix * vec4(wdBump, 0.0)).xyz);
    }`;
  }
  const rough = `roughnessFactor = clamp(roughnessFactor + wdRough, 0.05, 1.0);`;
  return { pars, faces, map: v.panel ? panelMapChunk(v) : '', color, rough, normal, normalMap: !!v.panel };
}

/** 一个变体每像素多取样几次（朝上的面 / 墙面分开数；不含材质自己原来就取的贴图）。报告和测试用 */
export function detailFetches(v) {
  if (!v) return { wall: 0, up: 0 };
  if (v.wearOnly) return { wall: 0, up: 0, blackout: 1 };
  if (v.uv) return { wall: 1 + (v.broad ? 1 : 0), up: 1 + (v.tread ? 1 : 0) + (v.treadNormal ? 1 : 0) };
  const n = (v.antiTile ? 2 : 1) - 1 + 1 + (v.normal ? 1 + (v.broad ? 1 : 0) : 0) + (v.roughMap ? 1 : 0);
  return { wall: n, up: n };
}

/** 世界坐标和世界法线传给像素着色器（实例化、批次坐标压缩都已经算进 modelMatrix / instanceMatrix 里） */
const DETAIL_VERTEX = `#include <project_vertex>
      vec4 detailWorld = vec4(transformed, 1.0);
      vec3 detailN = objectNormal;
      // 顺序和 three 的 project_vertex 一样：先批次矩阵，再实例矩阵，最后模型矩阵
      #ifdef USE_BATCHING
        detailWorld = batchingMatrix * detailWorld;
        detailN = mat3(batchingMatrix) * detailN;
      #endif
      #ifdef USE_INSTANCING
        detailWorld = instanceMatrix * detailWorld;
        detailN = mat3(instanceMatrix) * detailN;
      #endif
      vDetailPos = (modelMatrix * detailWorld).xyz;
      vDetailNormal = mat3(modelMatrix) * detailN;`;

/** 短字符串哈希（FNV-1a），只用来区分缓存键 */
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** 给材质挂上着色器补丁：前面已有的补丁（夜间自发光、楼面米制坐标……）照样先跑；克隆出来的材质（各栋楼带剖切面那份）也对 */
function hookDetail(mat, variant, textures, key) {
  // 材质上原来的补丁和缓存键：只认自己挂上去的（原型上的默认缓存键是整段 onBeforeCompile 的源码，不串进来）
  const own = (k) => Object.prototype.hasOwnProperty.call(mat, k) ? mat[k] : null;
  const prev = own('onBeforeCompile'), ownKey = own('customProgramCacheKey');
  // 前面的补丁没给自己的缓存键（three 默认拿 onBeforeCompile 的源码当键）：把它的源码折成短哈希串进来，
  // 不然两种不同补丁的材质叠上同一种细节，会被当成同一个着色器程序
  const prevKey = ownKey || (prev ? ((h) => () => h)(`p${hashText(String(prev))}`) : null);
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
    let frag = shader.fragmentShader.replace('#include <common>', `#include <common>\n${chunks.pars}`);
    // 投影轴、朝向放在 <map_fragment> 前（清水混凝土按模板块错开 UV 取颜色要用）；没有这一段（测试里的假着色器）就并进颜色那段
    const early = frag.includes('#include <map_fragment>');
    if (early) frag = frag.replace('#include <map_fragment>', `${chunks.faces}\n${chunks.map || '#include <map_fragment>'}`);
    // 法线贴图也按错开后的 UV 取（切线框架仍按原 UV 的导数算，错开只是平移，方向不变）
    const maps = chunks.normalMap ? THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )', 'texture2D( normalMap, vNormalMapUv + wdOff )') : '#include <normal_fragment_maps>';
    shader.fragmentShader = frag
      .replace('#include <color_fragment>', `#include <color_fragment>\n${early ? '' : chunks.faces}${chunks.color}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${chunks.rough}`)
      .replace('#include <normal_fragment_maps>', `${maps}\n${chunks.normal}`);
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
export function detailVariant(asset, { strength = 1, meters = asset?.meters?.[0] || 2, normal = 0, patch = 0.06, sheen = 0.15, cavity = 0.06, antiTile = true,
  repaint = 0, broad = 0, panels = 0 } = {}, mem = MEM) {
  const tier = worldDetailTier(mem);
  if (tier === 'off' || !asset?.maps?.color) return null;
  const mean = asset.mean || [255, 255, 255];
  const all = mem.pbrMaps === 'all', hasNormal = !!(all && normal > 0 && asset.maps.normal);
  return {
    tier, map: true, strength, inv: 1 / meters, patch, sheen, repaint, panels,
    gain: mean.map((v) => 1 / Math.max(0.05, srgbToLinear(v))),
    normal: hasNormal, ns: normal, cavity,
    // 低频法线多一次取样：只给电脑档（手机档守 +2）
    broad: hasNormal && tier === 'full' ? broad : 0,
    roughMap: !!(all && tier === 'full' && asset.maps.roughness),
    antiTile: tier === 'full' && antiTile !== false,
  };
}

/**
 * 自带 UV 的面层（UV_SURFACES）在当前档位下的变体。base：材质自己的贴图（painted_plaster / formed_concrete）；
 * tread：踏步用的水泥贴图。纯函数。
 */
export function uvVariant(def, base, tread, mem = MEM) {
  const tier = worldDetailTier(mem);
  if (tier === 'off' || !def) return null;
  const all = mem.pbrMaps === 'all', full = tier === 'full';
  const mean = base?.mean || [255, 255, 255];
  return {
    uv: true, tier, patch: def.patch, sheen: def.sheen, repaint: def.repaint || 0,
    inv: 1 / (base?.meters?.[0] || 2),
    broad: full && all && def.broad && base?.maps?.normal ? def.broad : 0,
    tread: !!tread?.maps?.color, treadNormal: !!(full && all && tread?.maps?.normal),
    gainT: (tread?.mean || [128, 128, 128]).map((v) => 1 / Math.max(0.05, srgbToLinear(v))),
    panel: def.panel && base?.maps?.color ? def.panel : 0, contrast: def.contrast ?? 1,
    meanLin: mean.map(srgbToLinear),
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
  // 同一份材质只叠一层（两层会重复声明 wdN 这些变量，着色器编译失败、整批不画）
  if (mat.userData?.detail || mat.userData?.wear) return mat;
  const v = detailVariant(asset, opts);
  if (!v) return mat;
  macroTexture();
  const textures = { wdMap: asset.maps.color };
  if (v.normal) textures.wdNormalMap = asset.maps.normal;
  if (v.roughMap) textures.wdRoughMap = asset.maps.roughness;
  const key = `detail-${asset.id}-${v.strength}-${(1 / v.inv).toFixed(3)}-${v.tier}-${v.normal ? `n${v.ns}` : 'c'}${v.roughMap ? 'r' : ''}${v.antiTile ? 'a' : ''}`
    + `${v.broad ? `b${v.broad}` : ''}-${v.patch}-${v.sheen}${v.normal ? `-c${v.cavity}` : ''}${v.repaint ? `-p${v.repaint}` : ''}${v.panels ? `-t${v.panels}` : ''}`;
  hookDetail(mat, v, textures, key);
  mat.userData.detail = asset.id;
  return mat;
}

/**
 * 自带贴图（有 UV）的面——清水混凝土墙、抹灰墙、楼面——只叠停电污垢：平时一次也不多取样（按 uniform 分支跳过），
 * 丧尸围城断电时 +1 次（大块噪声图）。省内存档不叠。
 */
export function worldWear(mat) {
  if (!MEM.decor || !mat?.isMeshStandardMaterial || mat.userData?.wear || mat.userData?.detail) return mat;
  macroTexture();
  hookDetail(mat, { wearOnly: true }, {}, 'wear');
  mat.userData.wear = true;
  return mat;
}

/**
 * 自带 UV 的面层（materials.js 的 plaster / concrete）：大块深浅和粗糙度、补漆、踏步和平台的水泥纹理、低频法线、
 * 清水混凝土按模板块错开，再加停电污垢（见 UV_SURFACES）。平时手机 +1–2 次取样、电脑 +2–3 次；省内存档不叠。
 * kind 是 UV_SURFACES 里的一项，surfaces 是 loadSurfaceTextures 的结果。
 */
export function uvDetail(mat, surfaces, kind) {
  const def = UV_SURFACES[kind];
  if (!def || !MEM.decor || !mat?.isMeshStandardMaterial || mat.userData?.wear || mat.userData?.detail) return mat;
  const base = surfaces?.[def.id], tread = surfaces?.[def.tread];
  const v = uvVariant(def, base, tread);
  if (!v) return mat;
  macroTexture();
  const textures = {};
  if (v.tread) textures.wdTreadMap = tread.maps.color;
  if (v.treadNormal) textures.wdTreadNormal = tread.maps.normal;
  const key = `uv-${kind}-${v.tier}-${v.tread ? 't' : ''}${v.treadNormal ? 'n' : ''}${v.broad ? `b${v.broad}` : ''}${v.panel ? `p${v.panel}-${v.contrast}` : ''}-${v.patch}-${v.sheen}-${v.repaint}`;
  hookDetail(mat, v, textures, key);
  mat.userData.wear = true; mat.userData.uvDetail = kind;
  return mat;
}

/** 按 DETAIL_SURFACES 给一种纯色材质叠细纹理。 */
export function detailFor(mat, surfaces, kind) {
  const def = DETAIL_SURFACES[kind];
  return def ? worldDetail(mat, surfaces?.[def.id], def) : mat;
}
