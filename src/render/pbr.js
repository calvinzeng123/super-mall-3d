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

/**
 * 纯色材质上的细纹理：墙、天花、楼板、外墙这些面是按顶点色画的，没有 UV。这里按世界坐标把一张面层贴图投上去
 * （看面朝哪边，取另外两个坐标，每个像素只多取样一次），乘到底色上，再除掉贴图的平均色——平均下来颜色不变，
 * 只多了真实材质的深浅纹理。不加顶点数据，不多占显存（贴图是已经载入的那一张）。
 * strength：纹理的深浅（1 是贴图原样）；meters：贴图铺多大（默认用贴图自己的尺寸）。
 * 省内存档没有这层，材质照旧是纯色。surfaces 是 loadSurfaceTextures 的结果，kind 是 DETAIL_SURFACES 里的一项。
 */
export function worldDetail(mat, asset, { strength = 1, meters = asset?.meters?.[0] || 2 } = {}) {
  if (!MEM.decor) return mat;
  const map = asset?.maps?.color;
  if (!map || !mat?.isMeshStandardMaterial) return mat;
  const mean = asset.mean || [255, 255, 255];
  const gain = mean.map((v) => 1 / Math.max(0.05, srgbToLinear(v)));
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.uniforms.detailMap = { value: map };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos;\nvarying vec3 vDetailNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 detailWorld = vec4(transformed, 1.0);
      vec3 detailN = objectNormal;
      #ifdef USE_INSTANCING
        detailWorld = instanceMatrix * detailWorld;
        detailN = mat3(instanceMatrix) * detailN;
      #endif
      vDetailPos = (modelMatrix * detailWorld).xyz;
      vDetailNormal = mat3(modelMatrix) * detailN;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos;\nvarying vec3 vDetailNormal;\nuniform sampler2D detailMap;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 detailA = abs(vDetailNormal);
      vec2 detailUv = detailA.y > max(detailA.x, detailA.z) ? vDetailPos.xz : (detailA.x > detailA.z ? vDetailPos.zy : vDetailPos.xy);
      vec3 detailT = texture2D(detailMap, detailUv * ${(1 / meters).toFixed(4)}).rgb * vec3(${gain.map((g) => g.toFixed(4)).join(', ')});
      diffuseColor.rgb *= mix(vec3(1.0), detailT, ${strength.toFixed(3)});`);
  };
  const key = `detail-${asset.id}-${strength}-${meters}`;
  mat.customProgramCacheKey = () => `${prevKey ? prevKey.call(mat) : ''}|${key}`;
  mat.userData.detail = asset.id;
  return mat;
}

/** 按 DETAIL_SURFACES 给一种纯色材质叠细纹理。 */
export function detailFor(mat, surfaces, kind) {
  const def = DETAIL_SURFACES[kind];
  return def ? worldDetail(mat, surfaces?.[def.id], def) : mat;
}
