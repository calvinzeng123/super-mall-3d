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

export const FLOOR_SURFACES = {
  'metro-terrazzo': {id:'metro_terrazzo',tint:'#e5e5df',roughness:.9,normal:.24,glow:.22},
  'metro-platform': {id:'metro_terrazzo',tint:'#cbd4d6',roughness:.92,normal:.24,glow:.22},
  'p1-paving': { id: 'limestone_pavers', tint: '#e6e0d3', roughness: 1, outdoor: true },
  'p1-paving-border': { id: 'limestone_pavers', tint: '#677575', roughness: 1, outdoor: true },
  'p1-paving-inlay': { id: 'limestone_pavers', tint: '#c7b18c', roughness: 1, outdoor: true },
  'carpet-linen': { id: 'woven_carpet', tint: '#c1b5a1', roughness: 1, normal: .38, glow: .18 },
  'carpet-ocean': { id: 'woven_carpet', pattern: 'carpet_jacquard', tint: '#cbb58e', roughness: 1, normal: .38, glow: .18 },
  'carpet-sage': { id: 'woven_carpet', pattern: 'carpet_jacquard', tint: '#d2c19c', roughness: 1, normal: .38, glow: .18 },
  'carpet-clay': { id: 'woven_carpet', pattern: 'carpet_jacquard', tint: '#a27b65', roughness: 1, normal: .38, glow: .18 },
  'carpet-flax': { id: 'woven_carpet', tint: '#d3bd92', roughness: 1, normal: .38, glow: .18 },
  'marble-white': { id: 'marble_01', tint: '#f7f6f2' },
  'terrazzo-cool': { id: 'marble_01', tint: '#dce5e8' },
  'terrazzo-warm': { id: 'marble_01', tint: '#eddbc5' },
  'wood-warm': { id: 'oak_wood_planks' },
  'deck-garden': { id: 'oak_wood_planks', tint: '#e2d1b8' },
  // Pale roof pavers of the concept aerial; timber stays under seating only.
  'roof-stone': { id: 'travertine_panel', tint: '#f4efe6' },
  'concrete-blue': { id: 'concrete_pavement_02', tint: '#bbcddd' },
  'concrete-green': { id: 'concrete_pavement_02', tint: '#c1d0c4' },
  paving: { id: 'concrete_pavement_02' },
  stone: { id: 'concrete_pavement_02', tint: '#c9c4bb' },
  cobble: { id: 'concrete_pavement_02', tint: '#dbcab5' },
  asphalt: { id: 'clean_asphalt' },
  grass: { id: 'grass_ground', tint: '#d2dfa8' },
};

export function pbrOptions(asset, normalStrength = 0.35) {
  // 省内存档没有法线、粗糙度贴图（只有颜色）
  return { map: asset.maps.color, normalMap: asset.maps.normal || null,
    roughnessMap: asset.maps.roughness || null, normalScale: new THREE.Vector2(normalStrength, normalStrength) };
}

/** 楼面一律按米制坐标取样，不受 ShapeGeometry 或旧局部 UV 缩放影响。 */
export function metricFloor(mat, asset, colorAsset = asset) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vec2 surfaceUv = vec2(position.x, -position.z) / vec2(${asset.meters[0].toFixed(3)}, ${asset.meters[1].toFixed(3)});
      vMapUv = vec2(position.x, -position.z) / vec2(${colorAsset.meters[0].toFixed(3)}, ${colorAsset.meters[1].toFixed(3)});
      vNormalMapUv = surfaceUv;
      vRoughnessMapUv = surfaceUv;
      vEmissiveMapUv = vMapUv;
    `);
  };
  mat.customProgramCacheKey = () => `metric-floor-${asset.id}-${colorAsset.id}`;
  return mat;
}
