import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PEOPLE_ASSETS } from './people-data.js';
import { MOBILE } from './device.js';
import { fetchBinary } from './fetch-binary.js';

let pending;
/** Two locally bundled, MIT-licensed humanoids; geometry/texture/morph poses are
 * shared by every level. No per-walker skeleton or animation mixer is allocated. */
export function loadPeopleAssets(anisotropy = 4) {
  if (!pending) pending = Promise.all(PEOPLE_ASSETS.map(async record => {
    const loader = new GLTFLoader();
    let gltf;
    if (record.url.startsWith('data:')) {
      const binary = atob(record.url.slice(record.url.indexOf(',') + 1));
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      gltf = await loader.parseAsync(bytes.buffer, '');
    } else gltf = await loader.parseAsync(await fetchBinary(record.url, { label: '人物模型' }), THREE.LoaderUtils.extractUrlBase(record.url));
    const parts = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry;
      // The prepared asset has identity transforms. Apply any future source
      // transform consistently to its relative morph position/normal targets.
      if (!object.matrixWorld.equals(new THREE.Matrix4())) throw new Error('People asset must be baked to identity transforms');
      if (geometry.morphAttributes.position?.length !== record.poses) throw new Error('People walking poses are missing');
      const material = object.material;
      material.transparent = false;
      material.alphaTest = .45;
      material.depthWrite = true;
      material.side = THREE.DoubleSide;
      material.roughness = .86;
      material.metalness = 0;
      material.envMapIntensity = .2;
      if (material.map) {
        const image = material.map.image;
        if (MOBILE && Math.max(image.width, image.height) > 512) {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 512;
          canvas.getContext('2d').drawImage(image, 0, 0, 512, 512);
          material.map.image = canvas;
          material.map.needsUpdate = true;
          image.close?.();
        }
        material.map.anisotropy = Math.min(4, anisotropy);
      }
      parts.push({ geometry, material, source: object });
    });
    if (parts.length !== 1) throw new Error('People asset must have one atlas material');
    return { ...record, ...parts[0] };
  })).catch(error => { pending = null; throw error; });
  return pending;
}
