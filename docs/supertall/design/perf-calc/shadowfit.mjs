// Light-space position of 200 m crowns for the shadow focus used by each view (env.setShadowFocus replica).
const THREE = await import(process.argv[2] + '/node_modules/three/build/three.module.js');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sunDir = V(-0.55, 0.78, 0.62).normalize();
const towers = { T1: [-260, -232, 200], T2: [-212, -232, 185], W1: [-458.3, -236.4, 200], W2: [-392.3, -236.4, 200], R1: [49, -218, 200], R4: [247, -218, 170], H: [-247, -81, 200], A: [-35, -214, 200] };
const foci = { overview: [V(-90, 30, -35), 340], tourCampus: [V(0, 0, 0), 380], north: [V(-236, 55, -232), 180], west: [V(-425, 42, -236), 180], river: [V(-120, 14, -300), 320] };
for (const [k, [c, r]] of Object.entries(foci)) {
  const cam = new THREE.OrthographicCamera(-r, r, r, -r, 20, r * 4 + 600);
  cam.position.copy(c).addScaledVector(sunDir, r * 2 + 260); cam.lookAt(c); cam.updateMatrixWorld();
  const out = []; let need = 0;
  for (const [id, [x, z, h]] of Object.entries(towers)) {
    const top = V(x, h, z).applyMatrix4(cam.matrixWorldInverse), base = V(x, 0, z).applyMatrix4(cam.matrixWorldInverse);
    const m = Math.max(Math.abs(top.x), Math.abs(top.y), Math.abs(base.x), Math.abs(base.y));
    need = Math.max(need, m); out.push(`${id}:${Math.round(top.x)},${Math.round(top.y)}${m > r ? '✗' : ''}`);
  }
  console.log(k.padEnd(10), 'r', r, 'needed', Math.round(need), out.join(' '));
}
