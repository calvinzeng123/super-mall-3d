// Tour re-frames with a capped target height: lift the target to at most maxT, then pull the eye back.
const THREE = await import(process.argv[2] + '/node_modules/three/build/three.module.js');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const T = { T1: [-260, -232], T2: [-212, -232], W1: [-458.3, -236.4], W2: [-392.3, -236.4], R1: [49, -218], R2: [115, -218], R3: [181, -218], R4: [247, -218], H: [-247, -81], A: [-35, -214] };
const views = {
  overview: [V(125, 480, 590), V(-90, 30, -35), Object.keys(T), 60],
  measureCampus: [V(110, 430, 480), V(0, 0, 0), Object.keys(T), 60],
  tourCampus: [V(150, 300, 330), V(0, 0, 0), Object.keys(T), 60],
  north: [V(-150, 115, -380), V(-236, 55, -232), ['T1', 'T2'], 100],
  west: [V(-315, 105, -335), V(-425, 42, -236), ['W1', 'W2'], 100],
  river: [V(120, 46, -560), V(-120, 14, -300), ['T1', 'T2', 'R1', 'A'], 80],
  opposite: [V(-196, 1.7, -446), V(-215, 30, -245), ['T1', 'T2', 'H'], 110],
};
for (const [k, [p0, t0, ids, maxT]] of Object.entries(views)) {
  const res = [];
  for (const aspect of [1.6, 0.46]) {
    let best = null;
    for (let s = 1; s <= 4.01 && !best; s += 0.05) for (let ty = t0.y; ty <= maxT && !best; ty += 5) {
      const t = V(t0.x, ty, t0.z), off = p0.clone().sub(t0).multiplyScalar(s), p = V(t0.x + off.x, p0.y < 3 ? p0.y : ty + off.y, t0.z + off.z);
      const cam = new THREE.PerspectiveCamera(42, aspect, 0.3, 12000); cam.position.copy(p); cam.lookAt(t); cam.updateMatrixWorld();
      let ok = true, my = -9;
      for (const id of ids) { const [x, z] = T[id]; const q = V(x, 226, z).project(cam); my = Math.max(my, q.y); if (q.y > 0.88 || q.z > 1) ok = false; }
      if (ok) best = `pos (${p.toArray().map(Math.round).join(', ')}) → target (${t.toArray().map(Math.round).join(', ')}), dist ${Math.round(p.distanceTo(t))} m (×${s.toFixed(2)}), crown+label NDC y ${my.toFixed(2)}`;
    }
    res.push(`${aspect === 1.6 ? 'desktop' : 'phone'}: ${best}`);
  }
  console.log(k.padEnd(14), res.join(' | '));
}
