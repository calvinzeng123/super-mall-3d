// Which point (crown top or base) of each tower leaves the shadow frustum, today vs decided heights.
const THREE = await import(process.argv[2] + '/node_modules/three/build/three.module.js');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const today = { T1: 100.1, T2: 100.1, W1: 88.7, W2: 88.7, R1: 106.6, R2: 106.6, R3: 106.6, R4: 106.6, H: 74.3, A: 77.4 };
const dec = { T1: 151, T2: 143, W1: 156.5, W2: 156.5, R1: 200, R2: 189.8, R3: 179.6, R4: 169.4, H: 200, A: 184.6 };
const XZ = { T1: [-260, -232], T2: [-212, -232], W1: [-458.3, -236.4], W2: [-392.3, -236.4], R1: [49, -218], R2: [115, -218], R3: [181, -218], R4: [247, -218], H: [-247, -81], A: [-35, -214] };
const sunDir = V(-0.55, 0.78, 0.62).normalize();
const foci = { overview: [V(-90, 30, -35), 380], campus: [V(0, 0, 0), 380], river: [V(-120, 14, -300), 320] };
for (const [k, [c, r]] of Object.entries(foci)) for (const rr of [r, r + 40, r + 60]) {
  const cam = new THREE.OrthographicCamera(-rr, rr, rr, -rr, 20, rr * 4 + 600);
  cam.position.copy(c).addScaledVector(sunDir, rr * 2 + 260); cam.lookAt(c); cam.updateMatrixWorld();
  const row = (H) => Object.entries(XZ).map(([id, [x, z]]) => { const t = V(x, H[id], z).applyMatrix4(cam.matrixWorldInverse), b = V(x, 0, z).applyMatrix4(cam.matrixWorldInverse);
    const tOut = Math.max(Math.abs(t.x), Math.abs(t.y)) > rr, bOut = Math.max(Math.abs(b.x), Math.abs(b.y)) > rr; return tOut || bOut ? `${id}:${tOut ? 'top' : ''}${bOut ? 'base' : ''}` : null; }).filter(Boolean).join(' ') || '—';
  console.log(k.padEnd(9), 'r', rr, '| today:', row(today), '| decided:', row(dec));
}
