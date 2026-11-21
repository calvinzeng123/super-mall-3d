// 枪械表面的贴图工具：没有高清素材可换，就在加载时现做。
// 两类用法：
//   1) 手搭的模型（榴弹枪、刀）——原来是一个颜色到底的材质，这里给它成套的贴图（颜色、法线、粗糙度）：
//      烤蓝钢（细拉丝 + 零星划痕）、磷化钢（哑光颗粒）、胡桃木（顺纹、棕眼）、聚合物（麻点）、橡胶（横棱）、黄铜。
//      贴图是可平铺的，按部件的大小设重复次数。
//   2) 带贴图的真模型（冲锋枪 1024、手枪只有 512，都是压过的 JPEG）——
//      sharpenTexture：放大一档并锐化（屏幕上放大看不再是一片糊）；
//      edgeWear：从法线贴图量出棱边，把棱边的颜色磨亮一点（金属件用旧了的样子）；
//      addDetail：在着色器里叠一层平铺的细节法线 / 粗糙度——贴近了看，表面有颗粒，不是塑料一样的平。
// 全部在画布上算，没有 document（测试环境）时返回 null / 原样，材质保持原来的样子。
// 贴图按（种类、尺寸、种子）缓存，几把枪共用；disposeSurfaces() 一次清掉。
import * as THREE from 'three';

const hasCanvas = () => typeof document !== 'undefined';
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** 0–1 的可复现随机数 */
export function seeded(seed = 1) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/**
 * 可平铺的值噪声：size × size 的 Float32Array（0–1）。cx / cy：横竖各分几格（格子越少起伏越缓；两个数不一样就是拉长的纹理）。
 */
export function noiseField(size, cx, cy = cx, seed = 1) {
  const r = seeded(seed), lat = new Float32Array(cx * cy); for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(size * size), sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const fy = y / size * cy, y0 = Math.floor(fy), ty = sm(fy - y0), ya = (y0 % cy) * cx, yb = ((y0 + 1) % cy) * cx;
    for (let x = 0; x < size; x++) {
      const fx = x / size * cx, x0 = Math.floor(fx), tx = sm(fx - x0), xa = x0 % cx, xb = (x0 + 1) % cx;
      const a = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * tx, b = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}
/** 几层噪声叠起来（每层格子翻倍、幅度乘 gain），结果归一到 0–1 */
export function fbmField(size, cx, cy = cx, octaves = 4, seed = 1, gain = 0.5) {
  const out = new Float32Array(size * size); let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) { const n = noiseField(size, Math.min(size, cx << o), Math.min(size, cy << o), seed + o * 101); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; total += amp; amp *= gain; }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
/**
 * 高度图 → 切线空间法线（RGBA 字节，可平铺）。strength 越大起伏越陡。平的高度图得到 (128, 128, 255)。
 */
export function heightToNormal(height, size, strength = 2) {
  const out = new Uint8ClampedArray(size * size * 4), at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength * size / 64, dy = (at(x, y + 1) - at(x, y - 1)) * strength * size / 64;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out[i] = (-dx / l * 0.5 + 0.5) * 255; out[i + 1] = (-dy / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}

/**
 * 各种表面的配方。每个返回 { color（Float32Array，每像素 r g b，0–255）, height, rough（0–1） }。纯计算，不碰画布。
 */
export const RECIPES = {
  // 烤蓝钢：蓝黑色，顺着 u 方向的细拉丝，零星几道亮一点的划痕
  steel(size, seed) {
    const brush = fbmField(size, 4, size / 4, 3, seed, 0.6), pore = noiseField(size, size / 2, size / 2, seed + 7), cloud = fbmField(size, 3, 3, 3, seed + 13);
    const n = size * size, color = new Float32Array(n * 3), height = new Float32Array(n), rough = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const b = brush[i] - 0.5, c = cloud[i] - 0.5, v = 1 + b * 0.5 + c * 0.35 + (pore[i] - 0.5) * 0.12;
      color[i * 3] = 30 * v; color[i * 3 + 1] = 33 * v; color[i * 3 + 2] = 39 * v;
      height[i] = 0.5 + b * 0.5 + (pore[i] - 0.5) * 0.2; rough[i] = clamp01(0.4 + b * 0.25 + c * 0.2);
    }
    scratches(size, seed + 31, 26, (i, k) => { for (let c = 0; c < 3; c++) color[i * 3 + c] += 38 * k; rough[i] = clamp01(rough[i] - 0.18 * k); height[i] -= 0.25 * k; });
    return { color, height, rough };
  },
  // 磷化钢：灰黑、哑光、细颗粒
  parkerized(size, seed) {
    const grain = noiseField(size, size / 2, size / 2, seed), cloud = fbmField(size, 4, 4, 3, seed + 5);
    const n = size * size, color = new Float32Array(n * 3), height = new Float32Array(n), rough = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = 1 + (grain[i] - 0.5) * 0.3 + (cloud[i] - 0.5) * 0.3; color[i * 3] = 44 * v; color[i * 3 + 1] = 46 * v; color[i * 3 + 2] = 45 * v; height[i] = grain[i]; rough[i] = clamp01(0.72 + (cloud[i] - 0.5) * 0.2); }
    scratches(size, seed + 31, 12, (i, k) => { for (let c = 0; c < 3; c++) color[i * 3 + c] += 30 * k; rough[i] = clamp01(rough[i] - 0.2 * k); });
    return { color, height, rough };
  },
  // 胡桃木：顺 u 方向的木纹（年轮被低频噪声带歪）、深色棕眼、上过油的半哑光
  wood(size, seed) {
    const warp = fbmField(size, 2, 3, 3, seed), fine = fbmField(size, 6, size / 8, 3, seed + 3, 0.6), tone = fbmField(size, 2, 2, 2, seed + 9);
    const n = size * size, color = new Float32Array(n * 3), height = new Float32Array(n), rough = new Float32Array(n), r = seeded(seed + 17);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, ring = Math.sin((y / size * 9 + warp[i] * 3.2) * Math.PI * 2) * 0.5 + 0.5, g = ring * 0.6 + fine[i] * 0.4, t = 0.82 + tone[i] * 0.36;
      color[i * 3] = (58 + g * 52) * t; color[i * 3 + 1] = (34 + g * 34) * t; color[i * 3 + 2] = (19 + g * 20) * t;
      height[i] = 0.5 + (fine[i] - 0.5) * 0.5 + (ring - 0.5) * 0.15; rough[i] = clamp01(0.5 + (1 - g) * 0.22);
    }
    // 棕眼：顺纹的小黑道
    for (let k = 0; k < size * 1.6; k++) { const x0 = Math.floor(r() * size), y0 = Math.floor(r() * size), len = 3 + Math.floor(r() * size / 40); for (let d = 0; d < len; d++) { const i = y0 * size + ((x0 + d) % size); for (let c = 0; c < 3; c++) color[i * 3 + c] *= 0.62; height[i] -= 0.35; rough[i] = clamp01(rough[i] + 0.15); } }
    return { color, height, rough };
  },
  // 聚合物：近黑，表面一层麻点（握把、托底）
  polymer(size, seed) {
    const n = size * size, color = new Float32Array(n * 3), height = new Float32Array(n).fill(0.35), rough = new Float32Array(n), cloud = fbmField(size, 4, 4, 2, seed), r = seeded(seed + 3);
    const cell = Math.max(4, Math.round(size / 48));
    for (let gy = 0; gy < size; gy += cell) for (let gx = 0; gx < size; gx += cell) {
      const cx = gx + cell / 2 + (r() - 0.5) * cell * 0.4, cy = gy + cell / 2 + (r() - 0.5) * cell * 0.4, rad = cell * (0.3 + r() * 0.12);
      for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) { const d = Math.hypot(x - cx, y - cy) / rad; if (d < 1) { const i = ((y + size) % size) * size + ((x + size) % size); height[i] = Math.max(height[i], 0.35 + 0.65 * (1 - d * d)); } }
    }
    for (let i = 0; i < n; i++) { const v = 1 + (cloud[i] - 0.5) * 0.3 + (height[i] - 0.35) * 0.5; color[i * 3] = 20 * v; color[i * 3 + 1] = 21 * v; color[i * 3 + 2] = 22 * v; rough[i] = clamp01(0.82 - (height[i] - 0.35) * 0.25); }
    return { color, height, rough };
  },
  // 橡胶：横棱（托底）
  rubber(size, seed) {
    const n = size * size, color = new Float32Array(n * 3), height = new Float32Array(n), rough = new Float32Array(n), grain = noiseField(size, size / 4, size / 4, seed);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * size + x, rib = Math.sin(y / size * Math.PI * 2 * 12) * 0.5 + 0.5, v = 0.85 + rib * 0.2 + (grain[i] - 0.5) * 0.15; color[i * 3] = 17 * v; color[i * 3 + 1] = 17 * v; color[i * 3 + 2] = 18 * v; height[i] = rib * 0.8 + grain[i] * 0.2; rough[i] = 0.9; }
    return { color, height, rough };
  },
  // 黄铜：弹壳、弹底
  brass(size, seed) {
    const brush = fbmField(size, size / 4, 4, 3, seed, 0.6), n = size * size, color = new Float32Array(n * 3), height = new Float32Array(n), rough = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = 0.9 + (brush[i] - 0.5) * 0.4; color[i * 3] = 178 * v; color[i * 3 + 1] = 142 * v; color[i * 3 + 2] = 66 * v; height[i] = brush[i]; rough[i] = clamp01(0.32 + (brush[i] - 0.5) * 0.3); }
    return { color, height, rough };
  },
};
/** 在一张图上划 count 道细划痕：each(像素下标, 深浅 0–1) */
function scratches(size, seed, count, each) {
  const r = seeded(seed);
  for (let k = 0; k < count; k++) {
    let x = r() * size, y = r() * size; const a = (r() - 0.5) * 0.7 + (r() < 0.25 ? Math.PI / 2 : 0), len = size * (0.04 + r() * 0.22), depth = 0.35 + r() * 0.65;
    for (let d = 0; d < len; d++) { x += Math.cos(a); y += Math.sin(a); const i = (((Math.round(y) % size) + size) % size) * size + (((Math.round(x) % size) + size) % size); each(i, depth * Math.sin(d / len * Math.PI)); }
  }
}

const cache = new Map();
function canvasTexture(size, fill, { srgb = false } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size); fill(img.data); g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/**
 * 一套表面贴图：{ map, normalMap, roughnessMap }（共享、可平铺）。kind 见 RECIPES。没有画布时返回 null。
 */
export function surface(kind, { size = 512, seed = 1, bump = 2 } = {}) {
  if (!hasCanvas() || !RECIPES[kind]) return null;
  const key = `${kind}:${size}:${seed}:${bump}`; if (cache.has(key)) return cache.get(key);
  const R = RECIPES[kind](size, seed), n = size * size, normal = heightToNormal(R.height, size, bump);
  const set = {
    map: canvasTexture(size, (d) => { for (let i = 0; i < n; i++) { d[i * 4] = R.color[i * 3]; d[i * 4 + 1] = R.color[i * 3 + 1]; d[i * 4 + 2] = R.color[i * 3 + 2]; d[i * 4 + 3] = 255; } }, { srgb: true }),
    normalMap: canvasTexture(size, (d) => d.set(normal)),
    // three 的粗糙度读 G 通道、金属度读 B 通道：这里三个通道都写粗糙度，金属度由材质的数值定
    roughnessMap: canvasTexture(size, (d) => { for (let i = 0; i < n; i++) { const v = R.rough[i] * 255; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } }),
  };
  cache.set(key, set);
  return set;
}
/**
 * 给一个材质贴上一套表面。repeat：[横, 竖] 平铺几次（按部件大小定：贴图一格大约对应多少厘米由调用的人算）。
 * 贴图对象是克隆的（共用同一张图，各有各的平铺次数）。颜色乘数设回白色，金属度 / 粗糙度的数值当倍数用。返回材质本身。
 */
export function applySurface(material, kind, { repeat = [1, 1], size = 512, seed = 1, bump = 2, normalScale = 1, rotate = 0 } = {}) {
  const set = surface(kind, { size, seed, bump }); if (!set || !material) return material;
  const own = (t) => { const c = t.clone(); c.repeat.set(repeat[0], repeat[1]); c.rotation = rotate; c.needsUpdate = true; return c; };
  material.map = own(set.map); material.normalMap = own(set.normalMap); material.roughnessMap = own(set.roughnessMap);
  material.color?.set(0xffffff); material.roughness = 1; material.normalScale?.set(normalScale, normalScale); material.needsUpdate = true;
  material.userData.surface = kind;
  return material;
}
export function disposeSurfaces() { for (const set of cache.values()) for (const t of Object.values(set)) t.dispose(); cache.clear(); }

// ---- 带贴图的真模型 ----
function pixelsOf(texture, size) {
  const img = texture?.image; if (!hasCanvas() || !img) return null;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  try { g.drawImage(img, 0, 0, size, size); return { canvas: c, g, data: g.getImageData(0, 0, size, size) }; } catch { return null; }
}
/** 把算好的像素包成一张新贴图，沿用原贴图的翻转、平铺、色彩空间、通道 */
function retexture(src, P) {
  P.g.putImageData(P.data, 0, 0);
  const t = new THREE.CanvasTexture(P.canvas);
  t.flipY = src.flipY; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.colorSpace = src.colorSpace; t.channel = src.channel; t.anisotropy = 8; t.name = src.name;
  t.repeat.copy(src.repeat); t.offset.copy(src.offset); t.rotation = src.rotation;
  return t;
}
/** 一遍 3×3 的盒式模糊（就地，RGB 三个通道） */
function boxBlur(d, size) {
  const src = new Uint8ClampedArray(d);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let c = 0; c < 3; c++) {
    let s = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += src[(Math.min(size - 1, Math.max(0, y + j)) * size + Math.min(size - 1, Math.max(0, x + i))) * 4 + c];
    d[(y * size + x) * 4 + c] = s / 9;
  }
}
/**
 * 放大并锐化一张贴图（反锐化掩模：原图 + amount ×（原图 − 模糊））。size：放大到多少（默认原图的两倍，封顶 max）。
 * 返回新贴图（没有画布 / 读不了像素时返回原贴图）。原贴图不动，由调用的人决定要不要释放。
 */
export function sharpenTexture(texture, { size = 0, amount = 0.7, max = 1024 } = {}) {
  const w = texture?.image?.width || 0; if (!w) return texture;
  const target = Math.min(max, size || w * 2), P = pixelsOf(texture, target); if (!P) return texture;
  const d = P.data.data, blur = new Uint8ClampedArray(d); boxBlur(blur, target);
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (d[i + c] - blur[i + c]) * amount;
  return retexture(texture, P);
}
/**
 * 棱边磨损：从法线贴图量曲率（法线朝外发散的地方是凸棱），把那儿的颜色往 color 提亮。
 * strength：提亮多少；threshold：多陡才算棱；invert：法线贴图的绿通道方向相反时设 true（磨到凹槽里去了就翻一下）。
 * 返回新的颜色贴图（原贴图不动）。
 */
export function edgeWear(baseTexture, normalTexture, { size = 0, strength = 0.55, threshold = 0.05, color = [150, 152, 158], invert = false, seed = 5 } = {}) {
  const w = baseTexture?.image?.width || 0; if (!w || !normalTexture?.image) return baseTexture;
  const s = size || w, B = pixelsOf(baseTexture, s), N = pixelsOf(normalTexture, s); if (!B || !N) return baseTexture;
  const b = B.data.data, n = N.data.data, at = (x, y, c) => n[(Math.min(s - 1, Math.max(0, y)) * s + Math.min(s - 1, Math.max(0, x))) * 4 + c] / 255 * 2 - 1;
  const mask = fbmField(s, 8, 8, 3, seed), sy = (baseTexture.flipY ? -1 : 1) * (invert ? -1 : 1);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const curv = (at(x + 1, y, 0) - at(x - 1, y, 0)) * (invert ? -1 : 1) + (at(x, y + 1, 1) - at(x, y - 1, 1)) * sy;
    const k = clamp01((curv - threshold) / 0.25) * strength * (0.45 + mask[y * s + x] * 0.9); if (k <= 0) continue;
    const i = (y * s + x) * 4; for (let c = 0; c < 3; c++) b[i + c] = b[i + c] + (color[c] - b[i + c]) * Math.min(1, k);
  }
  return retexture(baseTexture, B);
}
/**
 * 在一个带法线贴图的材质上再叠一层平铺的细节：detail = surface(...) 得到的那一套（用它的法线和粗糙度）。
 * scale：细节贴图在模型的 UV 上平铺几次；strength：细节法线的强弱；rough：细节对粗糙度的影响（±）。
 * 没有法线贴图的材质不处理（没有切线空间可用）。返回材质本身。
 */
export function addDetail(material, detail, { scale = 12, strength = 0.45, rough = 0.18 } = {}) {
  if (!material || !detail?.normalMap || !material.normalMap) return material;
  const U = { uDetailNormal: { value: detail.normalMap }, uDetailRough: { value: detail.roughnessMap }, uDetailScale: { value: scale }, uDetailStrength: { value: strength }, uDetailRoughK: { value: rough } };
  material.userData.detail = U;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normalmap_pars_fragment>', '#include <normalmap_pars_fragment>\nuniform sampler2D uDetailNormal;\nuniform sampler2D uDetailRough;\nuniform float uDetailScale;\nuniform float uDetailStrength;\nuniform float uDetailRoughK;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef USE_NORMALMAP\n\troughnessFactor = clamp( roughnessFactor + ( texture2D( uDetailRough, vNormalMapUv * uDetailScale ).g - 0.5 ) * uDetailRoughK, 0.045, 1.0 );\n#endif')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n#ifdef USE_NORMALMAP_TANGENTSPACE\n\t{ vec3 dn = texture2D( uDetailNormal, vNormalMapUv * uDetailScale ).xyz * 2.0 - 1.0; normal = normalize( normal + tbn * vec3( dn.xy * uDetailStrength, 0.0 ) ); }\n#endif');
  };
  material.customProgramCacheKey = () => 'gun-detail';
  material.needsUpdate = true;
  return material;
}
