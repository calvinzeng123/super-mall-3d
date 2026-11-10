// Smallest radius that holds all ten towers (crown + base) for a few candidate focus points (decided heights).
const THREE = await import(process.argv[2] + '/node_modules/three/build/three.module.js');
const V = (x, y, z) => new THREE.Vector3(x, y, z), sunDir = V(-0.55, 0.78, 0.62).normalize();
const T = { T1: [-260, -232, 151], T2: [-212, -232, 143], W1: [-458.3, -236.4, 156.5], W2: [-392.3, -236.4, 156.5], R1: [49, -218, 200], R2: [115, -218, 189.8], R3: [181, -218, 179.6], R4: [247, -218, 169.4], H: [-247, -81, 200], A: [-35, -214, 184.6] };
for (const c of [V(0, 0, 0), V(-60, 0, -90), V(-90, 30, -35), V(-100, 0, -120)]) {
  let r = 300;
  for (; r < 700; r += 10) {
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, 20, r * 4 + 600); cam.position.copy(c).addScaledVector(sunDir, r * 2 + 260); cam.lookAt(c); cam.updateMatrixWorld();
    if (Object.values(T).every(([x, z, h]) => [h, 0].every((y) => { const q = V(x, y, z).applyMatrix4(cam.matrixWorldInverse); return Math.abs(q.x) <= r && Math.abs(q.y) <= r; }))) break;
  }
  console.log(`focus (${c.toArray().join(', ')}) → all ten inside at r = ${r} (texel at 4096: ${(2 * r / 4096).toFixed(2)} m)`);
}
