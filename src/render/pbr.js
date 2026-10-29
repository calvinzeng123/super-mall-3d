import * as THREE from 'three';
import { MOBILE } from './device.js';
import { SURFACE_ASSETS } from './pbr-data.js';

/** 图片已随构建嵌入；手机只保留 512² 纹理，六类材质跨所有楼层共享。 */
export async function loadSurfaceTextures(anisotropy = 4) {
  const entries = await Promise.all(SURFACE_ASSETS.map(async (asset) => {
    const maps = {};
    await Promise.all(Object.entries(asset.maps).map(async ([purpose, url]) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      let source = img;
      if (MOBILE) {
        source = document.createElement('canvas');
        source.width = source.height = 512;
        source.getContext('2d').drawImage(img, 0, 0, 512, 512);
      }
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
  return { map: asset.maps.color, normalMap: asset.maps.normal,
    roughnessMap: asset.maps.roughness, normalScale: new THREE.Vector2(normalStrength, normalStrength) };
}

/** 楼面一律按米制坐标取样，不受 ShapeGeometry 或旧局部 UV 缩放影响。 */
export function metricFloor(mat, asset) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vec2 surfaceUv = vec2(position.x, -position.z) / vec2(${asset.meters[0].toFixed(3)}, ${asset.meters[1].toFixed(3)});
      vMapUv = surfaceUv;
      vNormalMapUv = surfaceUv;
      vRoughnessMapUv = surfaceUv;
      vEmissiveMapUv = surfaceUv;
    `);
  };
  mat.customProgramCacheKey = () => `metric-floor-${asset.id}`;
  return mat;
}
