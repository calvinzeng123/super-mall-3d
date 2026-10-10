// Shared, immutable residential templates. Floor eviction only drops instances;
// this owner alone disposes their geometries, materials and deduplicated textures.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MOBILE } from './device.js';

const roofPattern = /roof|ceiling|屋顶|天花|顶盖|顶板/i;
const structuralSlab = /^(Structure main floor slab|Balcony structural slab)$/;
const yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0));

/** Decode compressed embedded transport without fetching a URL, even on file://. */
export async function decodeResidentialAsset(record) {
  const binary = atob(record.data), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (record.compression !== 'gzip') throw new Error(`未知住宅模型压缩格式：${record.compression}`);
  if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持住宅模型解压，请使用新版 Chrome、Edge 或 Safari。');
  const buffer = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const view = new DataView(buffer);
  if (buffer.byteLength !== record.modelBytes || view.getUint32(0, true) !== 0x46546c67
      || view.getUint32(8, true) !== buffer.byteLength) throw new Error(`住宅${record.unit}模型解压校验失败`);
  return buffer;
}

function textureKey(texture, hash) {
  return [hash, texture.colorSpace, texture.wrapS, texture.wrapT, texture.magFilter, texture.minFilter,
    texture.flipY, texture.channel, texture.offset.toArray(), texture.repeat.toArray(), texture.center.toArray(), texture.rotation].join('|');
}

/** Each GLB is parsed sequentially, avoiding three simultaneous decode peaks. */
export async function loadResidentialAssets(records, anisotropy = 4, onProgress = () => {}) {
  const templates = new Map(), geometries = new Set(), materials = new Set(), textures = new Set();
  const textureCache = new Map(), imageSources = new Map();
  const counters = { floorGroupsCreated: 0, floorGroupsDisposed: 0, activeFloorGroups: 0,
    sharedGeometryDisposals: 0, sharedMaterialDisposals: 0, sharedTextureDisposals: 0, reusedTextures: 0 };
  let disposed = false;
  const manager = { templates, geometries, materials, textures, counters,
    get stats() {
      return { templates: templates.size, geometries: geometries.size, materials: materials.size,
        textures: textures.size, imageSources: imageSources.size,
        geometryBytes: [...geometries].reduce((n, g) => n + g.userData.bufferBytes, 0),
        cpuGeometryBytes: [...geometries].reduce((n, g) => n + Object.values(g.attributes).reduce((sum, a) => sum + (a.array?.byteLength || 0), g.index?.array?.byteLength || 0), 0),
        maxTextureDimension: Math.max(0, ...[...textures].map(t => Math.max(t.image?.width || 0, t.image?.height || 0))),
        sourceBytes: records.reduce((n, r) => n + r.modelBytes, 0), compressedBytes: records.reduce((n, r) => n + r.compressedBytes, 0),
        variants: Object.fromEntries([...templates].map(([key, value]) => [key, value.stats])), ...counters, disposed };
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      for (const source of imageSources.values()) source.data?.close?.();
      textureCache.clear(); imageSources.clear(); templates.clear();
    },
  };

  function shareTexture(texture, gltf, record) {
    const textureIndex = gltf.parser.associations.get(texture)?.textures;
    const imageIndex = record.textureSources[textureIndex];
    const hash = record.imageHashes[imageIndex];
    if (!hash) throw new Error(`住宅${record.unit}缺少贴图来源映射：${texture.name || textureIndex}`);
    texture.anisotropy = Math.max(1, Math.min(anisotropy, MOBILE ? 4 : 8));
    const key = textureKey(texture, hash), existing = textureCache.get(key);
    if (existing) { counters.reusedTextures++; return existing; }
    if (imageSources.has(hash)) texture.source = imageSources.get(hash);
    else {
      const source = texture.image, max = Math.max(source?.width || 0, source?.height || 0);
      if (MOBILE && max > 512) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(source.width * 512 / max));
        canvas.height = Math.max(1, Math.round(source.height * 512 / max));
        canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
        texture.image = canvas;
      }
      imageSources.set(hash, texture.source);
    }
    texture.userData.sharedResidential = true;
    texture.userData.sourceSHA256 = hash;
    texture.addEventListener('dispose', () => { counters.sharedTextureDisposals++; });
    texture.needsUpdate = true;
    textureCache.set(key, texture); textures.add(texture);
    return texture;
  }

  try {
    for (const record of records) {
      onProgress(record.unit);
      await yieldFrame();
      const bytes = await decodeResidentialAsset(record);
      const gltf = await new GLTFLoader().parseAsync(bytes, '');
      gltf.scene.updateMatrixWorld(true);
      const groups = new Map(), originalGeometries = new Set(), originalTextures = new Set(), originalImages = new Set();
      const preparedMaterials = new Set(), variantMaterials = new Set();
      let sourcePrimitives = 0, excludedSlabs = 0, sourceTriangles = 0;
      const variantBounds = new THREE.Box3();
      gltf.scene.traverse(object => {
        if (!object.isMesh) return; // No imported sun/cameras/per-room lamps in the campus.
        originalGeometries.add(object.geometry);
        sourcePrimitives++;
        // GLTFLoader sanitizes spaces in Object3D.name and gives multi-material
        // children generated names. Resolve the original owning node instead.
        let nodeObject = object, association = gltf.parser.associations.get(nodeObject);
        while (association?.nodes == null && nodeObject.parent) {
          nodeObject = nodeObject.parent; association = gltf.parser.associations.get(nodeObject);
        }
        const name = gltf.parser.json.nodes[association?.nodes]?.name || object.name;
        if (structuralSlab.test(name)) { excludedSlabs++; return; }
        const material = object.material;
        if (Array.isArray(material)) throw new Error(`住宅${record.unit}包含未拆分的多材质primitive`);
        if (!preparedMaterials.has(material)) {
          preparedMaterials.add(material);
          material.userData.sharedResidential = true;
          material.addEventListener('dispose', () => { counters.sharedMaterialDisposals++; });
          material.envMapIntensity = .85;
          // Campus glazing does not need a second full-scene transmission pass.
          if (material.transmission > 0) {
            material.transmission = 0; material.transparent = true; material.opacity = .18;
            material.roughness = .12; material.metalness = .02;
          }
          if (material.transparent) { material.depthWrite = false; material.forceSinglePass = true; }
          if (material.emissiveIntensity > 2) material.emissiveIntensity = 2;
          for (const [key, texture] of Object.entries(material)) if (texture?.isTexture) {
            originalTextures.add(texture); originalImages.add(texture.image);
            material[key] = shareTexture(texture, gltf, record);
          }
          materials.add(material); variantMaterials.add(material);
        }
        // Bake the GLB hierarchy exactly once, including the reflected 02 model.
        // No further axis conversion: glTF is already metre-scale, Y up.
        const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        if (name === 'Floor individually jointed oak') geometry.translate(0, .004, 0);
        sourceTriangles += (geometry.index?.count || geometry.attributes.position.count) / 3;
        geometry.computeBoundingBox(); variantBounds.union(geometry.boundingBox);
        const ceiling = roofPattern.test(name) || object.userData.viewerRole === 'roof' || nodeObject.userData.viewerRole === 'roof';
        const signature = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}:${value.itemSize}:${value.normalized}:${value.array.constructor.name}`).join(',');
        const key = `${material.uuid}:${ceiling}:${!!geometry.index}:${signature}`;
        if (!groups.has(key)) groups.set(key, { material, ceiling, geometry: [], names: [] });
        const group = groups.get(key); group.geometry.push(geometry); group.names.push(name);
      });

      const batches = [];
      for (const group of groups.values()) {
        const geometry = mergeGeometries(group.geometry, false);
        if (!geometry) throw new Error(`住宅${record.unit}几何合批失败：${group.material.name}`);
        geometry.userData.sharedResidential = true;
        geometry.addEventListener('dispose', () => { counters.sharedGeometryDisposals++; });
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        geometry.userData.bufferBytes = Object.values(geometry.attributes).reduce((n, a) => n + a.array.byteLength, geometry.index?.array.byteLength || 0);
        // Static shared GPU buffers survive instance eviction. Mobile can drop
        // their CPU copies once uploaded, just like the existing campus batches.
        // Bounds are cached above; future InstancedMeshes never reread vertices.
        if (MOBILE) {
          const release = function () { this.array = null; };
          for (const attribute of Object.values(geometry.attributes)) attribute.onUpload(release);
          geometry.index?.onUpload(release);
        }
        geometries.add(geometry);
        batches.push({ geometry, material: group.material, ceiling: group.ceiling,
          name: `${group.ceiling ? 'ceiling' : 'interior'}-${group.material.name}`, sourceNames: group.names });
        for (const part of group.geometry) part.dispose();
        group.geometry.length = 0;
      }
      // Unuploaded importer buffers are temporary; shared merged buffers survive
      // all floor evictions. Original materials continue to own shared textures.
      for (const geometry of originalGeometries) geometry.dispose();
      for (const texture of originalTextures) if (!textures.has(texture)) texture.dispose();
      const retainedImages = new Set([...imageSources.values()].map(source => source.data));
      for (const image of originalImages) if (!retainedImages.has(image)) image?.close?.();
      gltf.scene.clear();
      const stats = { sourcePrimitives, excludedSlabs, batches: batches.length, triangles: sourceTriangles,
        materials: variantMaterials.size, modelSHA256: record.modelSHA256,
        bounds: { min: variantBounds.min.toArray(), max: variantBounds.max.toArray() } };
      templates.set(record.unit, { unit: record.unit, record, batches, materials: variantMaterials, bounds: variantBounds, stats });
      await yieldFrame();
    }
    return manager;
  } catch (error) { manager.dispose(); throw error; }
}
