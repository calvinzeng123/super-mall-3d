// Where do 200 m crowns land in the default views? NDC y > 1 = cut off at the top.
const THREE = await import(process.argv[2] + '/node_modules/three/build/three.module.js');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const views = {
  overview: [V(125, 480, 590), V(-90, 30, -35)],
  campusMeasure: [V(110, 430, 480), V(0, 0, 0)],
  tourCampus: [V(150, 300, 330), V(0, 0, 0)],
  tourNorth: [V(-150, 115, -380), V(-236, 55, -232)],
  tourWest: [V(-315, 105, -335), V(-425, 42, -236)],
  tourRiver: [V(120, 46, -560), V(-120, 14, -300)],
  tourOpposite: [V(-196, 1.7, -446), V(-215, 30, -245)],
};
const towers = { T1: [-260, -232], T2: [-212, -232], W1: [-458.3, -236.4], W2: [-392.3, -236.4], R1: [49, -218], R4: [247, -218], H: [-247, -81], A: [-35, -214] };
for (const aspect of [1280 / 800, 390 / 844]) {
  console.log(`aspect ${aspect.toFixed(2)}`);
  for (const [k, [p, t]] of Object.entries(views)) {
    const cam = new THREE.PerspectiveCamera(42, aspect, 0.3, 12000); cam.position.copy(p); cam.lookAt(t); cam.updateMatrixWorld();
    const row = []; let maxY = -9, minD = 1e9, maxD = 0;
    for (const [id, [x, z]] of Object.entries(towers)) for (const h of [100, 200, 226]) {
      const q = V(x, h, z).project(cam); if (h === 200) row.push(`${id}:${q.x.toFixed(2)},${q.y.toFixed(2)}`);
      if (h === 226) maxY = Math.max(maxY, q.y);
      const d = p.distanceTo(V(x, h / 2, z)); minD = Math.min(minD, d); maxD = Math.max(maxD, d);
    }
    console.log(' ', k.padEnd(13), 'dist', p.distanceTo(t).toFixed(0).padStart(5), 'tower dist', minD.toFixed(0), '-', maxD.toFixed(0), ' max label NDC y', maxY.toFixed(2), ' ', row.join(' '));
  }
}
