// 立面楼层模块（supertall P0b · SPEC §2.2 M0）：重复的楼层只画一次，再按层实例化。
//
//   const mods = moduleSet(ctx, b, materials, { local })
//   mods.build(key, (B) => { ...one storey's direct geometry, at elevation 0... })   写进该模块自己的 BatchSet
//   mods.instance(key, levels)        每个输出材质一个 InstancedMesh，矩阵 = （local 时塔楼坐标系 ×）抬高到 lv.elev
//   mods.primitive(key, geometry, material, levels, place)  由图元（BoxGeometry 等）实例化：材质用无顶点色克隆
//   mods.hide(levelId) / mods.show(levelId)   该层实例矩阵置零缩放 / 恢复（到访楼层隐藏外壳，室内细节接管）
//   mods.handle(levelId)              { visible } 句柄（setResidentialDetailLevel 等旧接口按组的 visible 读写）
//   mods.meshes                       全部 InstancedMesh（加进塔楼外壳组）
//
// 「黑色实例」规则：本项目的批次材质都开着 vertexColors，几何体没有 color 属性时整块画成黑色。所以模块几何一律
// 来自 BatchSet.flush（它写 color），可直接用批次材质；图元几何（立柱、百叶、救援窗标记、灯具）走 primitive()，
// 用 vertexColors = false 的克隆并设 color（每实例着色用 setColorAt）。克隆保留该塔自己的剪切平面，楼层剖切照样
// 切到实例。测试：每个材质开着 vertexColors 的 InstancedMesh 都必须有 geometry.attributes.color。
import * as THREE from 'three';
import { BatchSet, frameMatrix } from '../batch.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** A plain copy of a batch material for primitive instances: no vertex colours, the tower's own clipping plane. */
export function plainInstanceMaterial(material, color = '#ffffff') {
  const m = material.clone();
  m.vertexColors = false;
  m.color?.set?.(color);
  m.onBeforeCompile = material.onBeforeCompile;
  m.customProgramCacheKey = material.customProgramCacheKey;
  m.clippingPlanes = material.clippingPlanes; m.clipShadows = material.clipShadows;
  return m;
}

/** True when an InstancedMesh would draw black: a vertex-colour material on geometry without a colour attribute. */
export const blackInstance = (mesh) => !!mesh.isInstancedMesh && [].concat(mesh.material).some((m) => m?.vertexColors) && !mesh.geometry.attributes.color;

export function moduleSet(ctx, b, materials, { local = false, name = `${b.id}-module` } = {}) {
  const F = local ? frameMatrix(b.frame) : new THREE.Matrix4();
  const groups = new Map();      // key → THREE.Group of flushed meshes (one per material)
  const slots = new Map();       // levelId → [{ mesh, index, matrix }]
  const meshes = [];
  const set = {
    meshes,
    /** One storey's direct geometry for module `key`, drawn at elevation 0 into its own BatchSet. */
    build(key, fn) {
      const B = new BatchSet(materials), g = new THREE.Group();
      fn(B);
      B.flush(g);
      groups.set(key, g);
      return set;
    },
    /** One InstancedMesh per material of module `key`, one instance per level (matrix = frame × elev). */
    instance(key, levels, { elev = (lv) => lv.elev } = {}) {
      const g = groups.get(key);
      if (!g || !levels.length) return [];
      const out = [];
      for (const src of g.children) {
        const im = new THREE.InstancedMesh(src.geometry, src.material, levels.length), m = new THREE.Matrix4();
        levels.forEach((lv, i) => {
          const matrix = m.clone().makeTranslation(0, elev(lv), 0).premultiply(F);
          im.setMatrixAt(i, matrix);
          (slots.get(lv.id) || slots.set(lv.id, []).get(lv.id)).push({ mesh: im, index: i, matrix });
        });
        im.name = `${name}-${key}-${src.name}`;
        im.castShadow = src.castShadow; im.receiveShadow = src.receiveShadow; im.renderOrder = src.renderOrder;
        im.userData.module = key; im.userData.levels = levels.map((lv) => lv.id);
        im.matrixAutoUpdate = false;
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        out.push(im); meshes.push(im);
      }
      g.clear(); groups.delete(key);
      return out;
    },
    /** Instances of a primitive geometry (one per placement): place(lv, i) → Matrix4 in the tower frame (local) or world. */
    primitive(key, geometry, material, levels, place, { color = '#ffffff', colors = null } = {}) {
      const items = levels.flatMap((lv) => [].concat(place(lv)).filter(Boolean).map((matrix) => ({ lv, matrix })));
      if (!items.length) return null;
      const im = new THREE.InstancedMesh(geometry, plainInstanceMaterial(material, color), items.length), c = new THREE.Color();
      items.forEach((q, i) => {
        const matrix = q.matrix.clone().premultiply(F);
        im.setMatrixAt(i, matrix);
        if (colors) im.setColorAt(i, c.set(colors(q.lv, i)));
        (slots.get(q.lv.id) || slots.set(q.lv.id, []).get(q.lv.id)).push({ mesh: im, index: i, matrix });
      });
      im.name = `${name}-${key}`; im.userData.module = key; im.matrixAutoUpdate = false;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      meshes.push(im);
      return im;
    },
    hide(levelId) { set.visible(levelId, false); },
    show(levelId) { set.visible(levelId, true); },
    visible(levelId, on) {
      for (const s of slots.get(levelId) || []) {
        if (!!s.hidden === !on) continue;
        s.mesh.setMatrixAt(s.index, on ? s.matrix : ZERO); s.mesh.instanceMatrix.needsUpdate = true; s.hidden = !on;
      }
    },
    isHidden: (levelId) => (slots.get(levelId) || []).some((s) => s.hidden),
    /** A { visible } handle for one level (the residential shells' detail-level switch reads and writes it). */
    handle(levelId) {
      return { get visible() { return !set.isHidden(levelId); }, set visible(v) { set.visible(levelId, !!v); }, userData: { level: levelId, kind: 'module-instance' } };
    },
    levels: () => [...slots.keys()],
  };
  return set;
}
