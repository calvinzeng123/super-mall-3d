// Per-frame cost of scene.updateMatrixWorld() (three traverses every object, visible or not) vs object count.
const THREE = await import(process.argv[2] + '/node_modules/three/build/three.module.js');
for (const n of [11284 + 338 * 8, 17025 + 614 * 8]) {
  const scene = new THREE.Scene(), geo = new THREE.BoxGeometry(), mat = new THREE.MeshBasicMaterial();
  let g = null;
  for (let i = 0; i < n; i++) { if (i % 8 === 0) { g = new THREE.Group(); g.visible = i % 3 === 0; scene.add(g); } else g.add(new THREE.Mesh(geo, mat)); }
  for (let i = 0; i < 50; i++) scene.updateMatrixWorld();
  const t = performance.now(); for (let i = 0; i < 200; i++) scene.updateMatrixWorld(); const ms = (performance.now() - t) / 200;
  scene.traverse((o) => { o.matrixAutoUpdate = false; });
  const t2 = performance.now(); for (let i = 0; i < 200; i++) scene.updateMatrixWorld(); const ms2 = (performance.now() - t2) / 200;
  console.log(JSON.stringify({ objects: n, updateMatrixWorldMs: +ms.toFixed(3), withAutoUpdateOffMs: +ms2.toFixed(3) }));
}
