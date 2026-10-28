import * as THREE from 'three';
import { BatchSet, SignBatch } from './batch.js';

export function sceneResources(groups) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const group of groups) group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}

export function geometryStats(geometries) {
  let vertices = 0, bufferBytes = 0;
  for (const geometry of geometries) {
    vertices += geometry.attributes.position?.count || 0;
    bufferBytes += geometry.userData.bufferBytes ?? Object.values(geometry.attributes)
      .reduce((sum, a) => sum + (a.array?.byteLength || 0), geometry.index?.array?.byteLength || 0);
  }
  return { geometries: geometries.size, vertices, bufferBytes };
}

function sharedLibraryResources(ctx, protectedResources) {
  const materials = new Set(protectedResources.materials), textures = new Set(protectedResources.textures);
  for (const collection of [ctx.mats.base, ctx.mats.floors, ctx.mats.steps, ctx.mats.flows]) {
    for (const material of Object.values(collection || {})) if (material?.isMaterial) materials.add(material);
  }
  for (const atlas of Object.values(ctx.atlas)) if (atlas?.material) materials.add(atlas.material);
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  return { geometries: protectedResources.geometries, materials, textures };
}

/** The public builders allocate some private LED maps and skater geometry.
 * Track their night hooks and callbacks along with the owned group, but never
 * dispose floor materials, façade atlases or shared PBR textures. */
export function buildOwnedFloorDetail(ctx, level, { build, atlas, protectedResources, release }) {
  const base = new THREE.Group(), people = new THREE.Group(), dynamic = [], hooks = [];
  base.name = `${level.lv.id}-streamed-interior`; people.name = `${level.lv.id}-streamed-people`;
  base.userData.floorDetail = people.userData.floorDetail = level.lv.id;
  const mats = Object.create(ctx.mats);
  mats.onNight = fn => { hooks.push(fn); ctx.mats.onNight(fn); };
  // Lazy caches still belong to the application, even when first requested by
  // this floor. Bind these methods to their permanent MaterialLib instance.
  for (const key of ['floor', 'flow', 'makeStep']) if (typeof ctx.mats[key] === 'function') mats[key] = ctx.mats[key].bind(ctx.mats);
  const L = { ...level, base, people, batch: new BatchSet(ctx.mats.base), signs: new SignBatch() };
  const b = ctx.bById[level.building];
  const local = { ...ctx, mats, dynamic, afterRender: [],
    levels: { ...ctx.levels, [level.lv.id]: L },
    buildings: { ...ctx.buildings, [level.building]: { ...ctx.buildings[level.building], levels: [L] } },
    layout: { ...ctx.layout, buildings: [b], levels: [level.lv] },
    atlas: { ...ctx.atlas },
  };
  let disposed = false, resources;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    base.removeFromParent(); people.removeFromParent();
    for (const group of [base, people]) group.traverse(object => {
      // InstancedMesh owns instanceMatrix/instanceColor GPU buffers in addition
      // to its geometry. Three releases those on the mesh's dispose event.
      if (object.isInstancedMesh) object.dispose();
    });
    const own = resources || sceneResources([base, people]);
    const shared = sharedLibraryResources(ctx, protectedResources);
    for (const geometry of own.geometries) if (!shared.geometries.has(geometry)) geometry.dispose();
    for (const material of own.materials) if (!shared.materials.has(material)) material.dispose();
    for (const texture of own.textures) if (!shared.textures.has(texture)) {
      const image = texture.image;
      if (image?.getContext) { image.width = 1; image.height = 1; }
      texture.dispose();
    }
    for (const hook of hooks) {
      const index = ctx.mats.nightHooks.indexOf(hook);
      if (index >= 0) ctx.mats.nightHooks.splice(index, 1);
    }
    for (const callback of dynamic) {
      const index = ctx.dynamic.indexOf(callback);
      if (index >= 0) ctx.dynamic.splice(index, 1);
    }
    for (const callback of local.afterRender) {
      const index = ctx.afterRender.indexOf(callback);
      if (index >= 0) ctx.afterRender.splice(index, 1);
    }
    base.clear(); people.clear(); dynamic.length = 0; local.afterRender.length = 0;
    // Builders are intentionally transient; only meshes survive in the cache.
    L.batch.sets = {}; L.signs = null;
  };
  try {
    if (atlas) local.atlas[level.lv.id] = atlas(mats);
    build(local, level.lv);
    L.batch.flush(base);
    L.signs.flush(base, local.atlas[level.lv.id].material);
    // Even an empty floor can own a lazily generated atlas.
    resources = sceneResources([base, people]);
    if (atlas) {
      resources.materials.add(local.atlas[level.lv.id].material);
      resources.textures.add(local.atlas[level.lv.id].texture);
    }
    level.base.add(base); level.people.add(people);
    ctx.dynamic.push(...dynamic); ctx.afterRender.push(...local.afterRender);
    release?.(base); release?.(people);
    L.signs = null;
    return { id: level.lv.id, groups: [base, people], stats: geometryStats(resources.geometries), dispose,
      setVisible(visible) { base.visible = people.visible = visible; } };
  } catch (error) {
    // Include an atlas allocated before a failed builder, which may not yet be
    // referenced by any mesh. Failed visits must remain retryable and bounded.
    resources = sceneResources([base, people]);
    if (atlas && local.atlas[level.lv.id] !== ctx.atlas[level.lv.id]) {
      resources.materials.add(local.atlas[level.lv.id].material);
      resources.textures.add(local.atlas[level.lv.id].texture);
    }
    dispose(); throw error;
  }
}
