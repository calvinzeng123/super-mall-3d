// 测试共用：Node 里构建塔楼渲染用的最小 ctx（材质按 key 命名的 MeshBasicMaterial 代理、楼层分组、空画布）。
// far-lod / facade-modules / r-render / west-render / core-render 测试共用（supertall P0b）。
import * as THREE from 'three';

const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint, style: {} }) };

export const MATERIAL_KEYS = ['facadePlaster', 'facadeWindow', 'facadeWindowLit', 'facadeTravertine', 'glowSoft', 'glow', 'glass', 'glassTint', 'extMetal', 'extSatin', 'ext',
  'stone', 'concrete', 'metal', 'wood', 'satin', 'matte', 'plaster', 'foliage', 'water'];
/** Batch materials as the app has them: vertex-coloured, named by key (glass ones without vertex colours). */
export function baseMaterials() {
  const base = {};
  for (const k of MATERIAL_KEYS) base[k] = Object.assign(new THREE.MeshBasicMaterial({ vertexColors: !['glass', 'glassTint', 'water'].includes(k) }), { name: k });
  return new Proxy(base, { get: (m, k) => (typeof k === 'string' ? (m[k] ||= Object.assign(new THREE.MeshBasicMaterial({ vertexColors: true }), { name: k })) : undefined) });
}

/** A render ctx over layout L; night hooks are kept so tests can switch to night (ctx.setNight(t)). */
export function renderContext(L) {
  const hooks = [], base = baseMaterials();
  const ctx = {
    layout: L, dynamic: [], renderer: {}, root: new THREE.Group(),
    mats: { base, sign: () => new THREE.MeshBasicMaterial(), onNight: (fn) => { hooks.push(fn); fn(0); } },
    lvById: Object.fromEntries(L.levels.map((l) => [l.id, l])), bById: Object.fromEntries(L.buildings.map((b) => [b.id, b])),
    levels: Object.fromEntries(L.levels.map((lv) => [lv.id, { lv, base: new THREE.Group(), shell: new THREE.Group(), group: new THREE.Group() }])),
    buildings: Object.fromEntries(L.buildings.map((b) => [b.id, { b, group: new THREE.Group(), levels: [] }])),
    hospitality: { buildings: new Map() }, site: { group: new THREE.Group() },
    setNight: (t) => { for (const fn of hooks) fn(t); },
  };
  return ctx;
}

export const triangles = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1);
/** Meshes the renderer would draw: the mesh and every ancestor up to `root` visible. */
export function drawnMeshes(root) {
  const out = [];
  root.traverse((o) => { if (!o.isMesh) return; for (let q = o; q && q !== root.parent; q = q.parent) if (!q.visible) return; out.push(o); });
  return out;
}
/** World bounds of the meshes' vertices (instances included) at or above height y0. */
export function boundsOf(meshes, y0 = -Infinity) {
  const box = new THREE.Box3(), v = new THREE.Vector3(), M = new THREE.Matrix4(), W = new THREE.Matrix4();
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const p = m.geometry.attributes.position, n = m.isInstancedMesh ? m.count : 1;
    for (let k = 0; k < n; k++) {
      if (m.isInstancedMesh) { m.getMatrixAt(k, M); W.multiplyMatrices(m.matrixWorld, M); } else W.copy(m.matrixWorld);
      for (let i = 0; i < p.count; i++) if (v.fromBufferAttribute(p, i).applyMatrix4(W).y >= y0) box.expandByPoint(v);
    }
  }
  return box;
}
/** Vertices of the distinct geometries under the given groups (instanced geometry counted once). */
export function vertices(...groups) {
  const seen = new Set();
  for (const g of groups) g?.traverse((o) => { if (o.isMesh) seen.add(o.geometry); });
  return [...seen].reduce((n, q) => n + q.attributes.position.count, 0);
}
