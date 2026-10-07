import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MOBILE } from './device.js';

let cachedPromise = null;
let cachedSource = null;

/**
 * Load the prepared user asset once. The caller embeds the GLB as a data URL in
 * the offline build and passes it here. Every returned geometry/material is
 * shared: floor-cache eviction must NEVER dispose these resources.
 *
 * @returns {Promise<{primitives:Array, bounds:THREE.Box3, materials:Set,
 * textures:Set, stats:Object, dispose:Function}>}
 */
export function loadSuiteAsset(dataUrl, anisotropy = 4) {
  if (!dataUrl) throw new Error('loadSuiteAsset requires the prepared GLB data URL');
  if (cachedPromise && cachedSource === dataUrl) return cachedPromise;
  cachedSource = dataUrl;
  cachedPromise = prepare(dataUrl, anisotropy).catch(error => { cachedPromise = null; cachedSource = null; throw error; });
  return cachedPromise;
}

async function prepare(dataUrl, anisotropy) {
  const loader = new GLTFLoader();
  let gltf;
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const binary = atob(encoded), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    gltf = await loader.parseAsync(bytes.buffer, '');
  } else if (dataUrl instanceof ArrayBuffer) gltf = await loader.parseAsync(dataUrl, '');
  else gltf = await loader.loadAsync(dataUrl);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const primitives = [], geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse(object => {
    if (!object.isMesh) return;
    const association = gltf.parser.associations.get(object) || {};
    const geometry = object.geometry;
    const primitiveDef = gltf.parser.json.meshes[association.meshes]?.primitives[association.primitives ?? 0];
    const extra = primitiveDef?.extras || {};
    const nodeIndex = extra.sourceNode ?? association.nodes ?? object.userData.sourceNode;
    const sourceName = extra.sourceName || gltf.parser.json.nodes[nodeIndex]?.name || object.name;
    geometry.userData.sharedSuite = true;
    geometries.add(geometry);
    const material = object.material;
    material.userData.sharedSuite = true;
    material.envMapIntensity = /bronze|mirror|alu/.test(material.name) ? .55 : .3;
    if (material.emissiveIntensity > 1) material.emissiveIntensity = Math.min(material.emissiveIntensity, material.name === 'lampDisc' ? 3 : 1.8);
    if (material.name === 'winGlass') {
      material.color.set('#b9d4d5'); material.transparent = true; material.opacity = .16;
      material.roughness = .12; material.metalness = .02; material.side = THREE.DoubleSide;
    }
    if (material.transparent) material.depthWrite = false;
    materials.add(material);
    for (const value of Object.values(material)) if (value?.isTexture) {
      value.userData.sharedSuite = true;
      value.anisotropy = Math.max(1, anisotropy); textures.add(value);
    }
    primitives.push({ geometry, material, matrix: object.matrixWorld.clone(), name: sourceName,
      nodeIndex, primitiveIndex: extra.sourcePrimitive ?? association.primitives ?? 0,
      ceiling: sourceName.includes('[C 天花]'), shell: sourceName.startsWith('Shell '),
      window: sourceName.startsWith('Window '), shared: true });
  });
  // 原图保留在GLB中；手机只在解码后缩小共享纹理，避免400户重复占用。
  if (MOBILE) {
    const resized = new Map();
    for (const texture of textures) {
      const source = texture.image;
      const max = Math.max(source?.width || 0, source?.height || 0);
      if (max <= 512) continue;
      if (!resized.has(source)) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(source.width * 512 / max));
        canvas.height = Math.max(1, Math.round(source.height * 512 / max));
        canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
        resized.set(source, canvas);
      }
      texture.image = resized.get(source); texture.needsUpdate = true;
    }
  }
  const bounds = new THREE.Box3().setFromObject(scene);
  const lightsSpec = (gltf.parser.json.extensions?.KHR_lights_punctual?.lights || []).map((light, index) => {
    const node = gltf.parser.json.nodes.find(n => n.extensions?.KHR_lights_punctual?.light === index);
    return { ...light, position: node?.translation || [0, 0, 0], quaternion: node?.rotation || [0, 0, 0, 1] };
  });
  const stats = { primitives: primitives.length, geometries: geometries.size, materials: materials.size, textures: textures.size,
    lights: lightsSpec.length, triangles: primitives.reduce((n, p) => n + (p.geometry.index?.count || p.geometry.attributes.position.count) / 3, 0) };
  let disposed = false;
  return { primitives, bounds, geometries, materials, textures, lightsSpec, stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      scene.clear();
      if (cachedSource === dataUrl) { cachedPromise = null; cachedSource = null; }
    },
  };
}
