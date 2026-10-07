// 用户套房：共享原始几何与材质，按访问楼层实例化；退层仅释放实例矩阵。
import * as THREE from 'three';
import { frameMatrix } from '../batch.js';
import { buildSuiteAdditions } from './suite-interiors.js';

const SOURCE_TO_UNIT = new THREE.Matrix4().makeTranslation(1.45, .035, 10.35)
  .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));

export function suiteMatrix(unit, elevation = 0) {
  const m = frameMatrix(unit.frame);
  m.elements[13] = elevation;
  return m.multiply(SOURCE_TO_UNIT);
}

export function buildSuiteModels(ctx, lv) {
  const units = lv.units.filter(u => u.residence?.suitePlan);
  if (!units.length || !ctx.suiteAsset) return null;
  const group = new THREE.Group();
  group.name = `user-suite-models-${lv.id}`;
  const ceilings = new THREE.Group(); ceilings.name = 'suite-ceilings'; group.add(ceilings);
  const imported = new THREE.Group(); imported.name = 'original-suite-furnishings'; group.add(imported);
  const upperFurniture = new THREE.Group(); upperFurniture.name = 'duplex-source-bedroom'; group.add(upperFurniture);
  const instances = [];
  const make = (primitive, target, selected, upper = false) => {
    if (!selected.length) return;
    const mesh = new THREE.InstancedMesh(primitive.geometry, primitive.material, selected.length);
    mesh.name = `${upper ? 'upper-' : ''}${primitive.name}`;
    mesh.userData.sourceSuite = true;
    mesh.userData.sourceNode = primitive.nodeIndex;
    for (let i = 0; i < selected.length; i++) {
      const u = selected[i];
      let matrix = suiteMatrix(u, lv.elev);
      if (upper) {
        // 套房床组原中心unit(2.64,6.90)，移至夹层指定卧区；尺寸始终1:1。
        const bed = u.residence.duplex.beds[0];
        const sourceBed = u.residence.beds[0];
        const localShift = new THREE.Matrix4().makeTranslation(bed.x - sourceBed.x, u.residence.duplex.height, bed.z - sourceBed.z);
        const frame = frameMatrix(u.frame); frame.elements[13] = lv.elev;
        matrix = frame.multiply(localShift).multiply(SOURCE_TO_UNIT);
      }
      mesh.setMatrixAt(i, matrix.multiply(primitive.matrix));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = !primitive.material.transparent;
    mesh.receiveShadow = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    target.add(mesh); instances.push(mesh);
  };
  for (const p of ctx.suiteAsset.primitives) {
    make(p, p.ceiling ? ceilings : imported, units);
    if (/^(Bed |BedroomRug |Nightstands |BedWall )/.test(p.name) && !p.ceiling) {
      make(p, upperFurniture, units.filter(u => u.residence.duplex), true);
    }
  }
  const additions = buildSuiteAdditions(ctx, lv, units, ctx.suiteAsset);
  group.add(additions.group);
  let disposed = false;
  return {
    group, ceilings, upperFurniture, units,
    update(app) {
      const inside = app.state.explore?.level === lv.id;
      const belowCeiling = ctx.camera.position.y < lv.elev + 2.75;
      ceilings.visible = inside && belowCeiling;
      // 普通俯视展示夹层；查看楼下时楼板存在，保持真实室内遮挡。
      if (additions.ceilingGroup) additions.ceilingGroup.visible = inside;
      additions.update?.(app);
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const mesh of instances) { mesh.removeFromParent(); mesh.dispose(); }
      additions.dispose();
      group.clear(); group.removeFromParent();
    },
  };
}
