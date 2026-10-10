import * as THREE from 'three';
import { frameMatrix } from '../batch.js';

/** GLB has already converted Blender Z-up to Y-up. Its north entry is z=-11.5. */
export function residentialMatrix(unit, elevation = 0) {
  const transform = unit.residence?.modelTransform;
  if (transform?.scale != null && transform.scale !== 1) throw new Error('住宅样板必须保持1:1比例');
  const matrix = frameMatrix(unit.frame);
  matrix.elements[13] = elevation;
  return matrix.multiply(new THREE.Matrix4().makeTranslation(...(transform?.translate || [0, 0, 11.5])));
}

export function buildResidentialModels(ctx, lv) {
  const units = lv.units.filter(unit => unit.residence?.prototype);
  if (!units.length) return null;
  if (!ctx.residentialAssets) throw new Error('住宅样板资源尚未加载');
  const group = new THREE.Group(); group.name = `residential-prototypes-${lv.id}`;
  const ceilings = new THREE.Group(); ceilings.name = 'residential-ceilings'; group.add(ceilings);
  const interiors = new THREE.Group(); interiors.name = 'residential-interiors'; group.add(interiors);
  const instances = [];
  for (const variant of new Set(units.map(unit => unit.residence.prototype))) {
    const template = ctx.residentialAssets.templates.get(variant);
    if (!template) throw new Error(`缺少住宅${variant}模板`);
    const selected = units.filter(unit => unit.residence.prototype === variant);
    for (const batch of template.batches) {
      const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, selected.length);
      mesh.name = `residential-${variant}-${batch.name}`;
      mesh.userData.sharedResidential = true;
      mesh.userData.prototype = variant;
      mesh.userData.sourceNames = batch.sourceNames;
      mesh.userData.unitIds = selected.map(unit => unit.id);
      mesh.userData.modelScale = 1;
      selected.forEach((unit, i) => mesh.setMatrixAt(i, residentialMatrix(unit, lv.elev)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = !batch.material.transparent;
      mesh.receiveShadow = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      (batch.ceiling ? ceilings : interiors).add(mesh); instances.push(mesh);
    }
  }
  const counters = ctx.residentialAssets.counters;
  counters.floorGroupsCreated++; counters.activeFloorGroups++;
  let disposed = false;
  return { group, units, ceilings, instances,
    update(app) {
      ceilings.visible = app.state.explore?.level === lv.id && ctx.camera.position.y < lv.elev + 2.85;
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const mesh of instances) { mesh.removeFromParent(); mesh.dispose(); }
      group.clear(); group.removeFromParent();
      counters.floorGroupsDisposed++; counters.activeFloorGroups--;
    },
  };
}
