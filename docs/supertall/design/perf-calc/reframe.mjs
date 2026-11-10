// Re-frame views so the subject towers' 200 m crowns (and 226 m labels) fit: scale the eye
// away from the target along the same direction and lift the target until max NDC y <= 0.85.
const THREE = await import(process.argv[2] + '/node_modules/three/build/three.module.js');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const T = { T1: [-260, -232], T2: [-212, -232], W1: [-458.3, -236.4], W2: [-392.3, -236.4], R1: [49, -218], R2: [115, -218], R3: [181, -218], R4: [247, -218], H: [-247, -81], A: [-35, -214] };
const views = {
  overview: [V(125, 480, 590), V(-90, 30, -35), Object.keys(T)],
  campus: [V(150, 300, 330), V(0, 0, 0), Object.keys(T)],
  north: [V(-150, 115, -380), V(-236, 55, -232), ['T1', 'T2']],
  west: [V(-315, 105, -335), V(-425, 42, -236), ['W1', 'W2']],
  river: [V(120, 46, -560), V(-120, 14, -300), ['T1', 'T2', 'R1', 'A']],
  opposite: [V(-196, 1.7, -446), V(-215, 30, -245), ['T1', 'T2', 'H']],
};
for (const aspect of [1.6, 0.46]) for (const [k, [p0, t0, ids]] of Object.entries(views)) {
  let best = null;
  for (let s = 1; s <= 3.01 && !best; s += 0.05) for (let ty = t0.y; ty <= 160 && !best; ty += 5) {
    const t = V(t0.x, ty, t0.z), off = p0.clone().sub(t0).multiplyScalar(s), p = V(t0.x + off.x, p0.y < 3 ? p0.y : t0.y + off.y, t0.z + off.z);
    const cam = new THREE.PerspectiveCamera(42, aspect, 0.3, 12000); cam.position.copy(p); cam.lookAt(t); cam.updateMatrixWorld();
    let ok = true, my = -9, mx = 0;
    for (const id of ids) { const [x, z] = T[id]; const q = V(x, 226, z).project(cam), g = V(x, 0, z).project(cam);
      my = Math.max(my, q.y); mx = Math.max(mx, Math.abs(q.x)); if (q.y > 0.85 || q.z > 1 || g.y < -1 || (aspect > 1 && Math.abs(q.x) > 0.95)) ok = false; }
    if (ok) best = { pos: p.toArray().map((v) => Math.round(v)), target: t.toArray().map((v) => Math.round(v)), scale: +s.toFixed(2), dist: Math.round(p.distanceTo(t)), maxNdcY: +my.toFixed(2), maxNdcX: +mx.toFixed(2) };
  }
  console.log(aspect, k.padEnd(9), JSON.stringify(best));
}
