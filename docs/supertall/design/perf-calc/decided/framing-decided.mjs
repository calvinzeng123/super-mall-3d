// Decided heights (DECISIONS.md): crown tops and title-label heights (labels.js: max level elev + 26, i.e. RF + 26).
// 1) shadow frustum fit per focus (env.setShadowFocus replica), 2) NDC y of crowns/labels in today's views,
// 3) re-frames with a capped target height. usage: node framing-decided.mjs <worktree>
const THREE = await import(process.argv[2] + '/node_modules/three/build/three.module.js');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// id: [x, z, crown top, RF]
const T = { T1: [-260, -232, 151, 141], T2: [-212, -232, 143, 133], W1: [-458.3, -236.4, 156.5, 145.5], W2: [-392.3, -236.4, 156.5, 145.5],
  R1: [49, -218, 200, 186.7], R2: [115, -218, 189.8, 176.5], R3: [181, -218, 179.6, 166.3], R4: [247, -218, 169.4, 156.1],
  H: [-247, -81, 200, 186.2], A: [-35, -214, 184.6, 174.6] };
const label = (id) => T[id][3] + 26;
const sunDir = V(-0.55, 0.78, 0.62).normalize();
console.log('== shadow frustum (|light-space x|,|y| of crown and base must be <= r)');
const foci = { overview: [V(-90, 30, -35), 380], campusStep: [V(0, 0, 0), 380], panorama: [V(0, 0, 0), 380], north: [V(-236, 55, -232), 180], west: [V(-425, 42, -236), 180], river: [V(-120, 14, -300), 320], opposite: [V(-215, 30, -245), 220] };
for (const [k, [c, r]] of Object.entries(foci)) {
  const fit = (rr) => { const cam = new THREE.OrthographicCamera(-rr, rr, rr, -rr, 20, rr * 4 + 600);
    cam.position.copy(c).addScaledVector(sunDir, rr * 2 + 260); cam.lookAt(c); cam.updateMatrixWorld(); return cam; };
  const cam = fit(r); const out = []; let need = 0;
  for (const [id, [x, z, h]] of Object.entries(T)) {
    const top = V(x, h, z).applyMatrix4(cam.matrixWorldInverse), base = V(x, 0, z).applyMatrix4(cam.matrixWorldInverse);
    const m = Math.max(Math.abs(top.x), Math.abs(top.y), Math.abs(base.x), Math.abs(base.y)); need = Math.max(need, m);
    if (m > r) out.push(`${id}✗(${Math.round(m)})`);
  }
  console.log(' ', k.padEnd(11), 'r', r, 'needed for all ten', Math.round(need), 'outside:', out.join(' ') || '—');
}
console.log('== today\'s views: max NDC y of crown / label (desktop 1.6, phone 0.46)');
const views = { overview: [V(125, 480, 590), V(-90, 30, -35), Object.keys(T)], measureCampus: [V(110, 430, 480), V(0, 0, 0), Object.keys(T)],
  tourCampus: [V(150, 300, 330), V(0, 0, 0), Object.keys(T)], north: [V(-150, 115, -380), V(-236, 55, -232), ['T1', 'T2']],
  west: [V(-315, 105, -335), V(-425, 42, -236), ['W1', 'W2']], river: [V(120, 46, -560), V(-120, 14, -300), ['T1', 'T2', 'R1', 'A']],
  opposite: [V(-196, 1.7, -446), V(-215, 30, -245), ['T1', 'T2', 'H']] };
for (const [k, [p, t, ids]] of Object.entries(views)) {
  const row = [];
  for (const aspect of [1.6, 0.46]) {
    const pp = aspect < 1 ? p.clone().sub(t).multiplyScalar(1.22).add(t) : p;   // flyTo pulls back 1.22x on portrait
    const cam = new THREE.PerspectiveCamera(42, aspect, 0.3, 12000); cam.position.copy(pp); cam.lookAt(t); cam.updateMatrixWorld();
    let cy = -9, ly = -9, worst = '';
    for (const id of ids) { const [x, z, h] = T[id]; const q = V(x, h, z).project(cam), l = V(x, label(id), z).project(cam); if (l.y > ly) worst = id; cy = Math.max(cy, q.y); ly = Math.max(ly, l.y); }
    row.push(`${aspect === 1.6 ? 'desktop' : 'phone'} crown ${cy.toFixed(2)} label ${ly.toFixed(2)} (${worst})`);
  }
  console.log(' ', k.padEnd(13), row.join(' | '));
}
console.log('== re-frames (target y capped; crown and label NDC y <= 0.88 on desktop and phone)');
const caps = { overview: 60, measureCampus: 60, tourCampus: 60, north: 90, west: 90, river: 80, opposite: 110 };
for (const [k, [p0, t0, ids]] of Object.entries(views)) {
  let best = null;
  for (let s = 1; s <= 4.01 && !best; s += 0.05) for (let ty = t0.y; ty <= caps[k] && !best; ty += 5) {
    const t = V(t0.x, ty, t0.z), off = p0.clone().sub(t0).multiplyScalar(s), p = V(t0.x + off.x, p0.y < 3 ? p0.y : ty + off.y, t0.z + off.z);
    let ok = true, my = -9;
    for (const aspect of [1.6, 0.46]) {
      const pp = aspect < 1 ? p.clone().sub(t).multiplyScalar(1.22).add(t) : p;
      const cam = new THREE.PerspectiveCamera(42, aspect, 0.3, 12000); cam.position.copy(pp); cam.lookAt(t); cam.updateMatrixWorld();
      for (const id of ids) { const [x, z, h] = T[id]; for (const y of [h, label(id)]) { const q = V(x, y, z).project(cam); my = Math.max(my, q.y); if (q.y > 0.88 || q.z > 1) ok = false; } }
    }
    if (ok) best = `pos (${p.toArray().map(Math.round).join(', ')}) → target (${t.toArray().map(Math.round).join(', ')}), ${Math.round(p.distanceTo(t))} m (×${s.toFixed(2)}), max NDC y ${my.toFixed(2)}`;
  }
  console.log(' ', k.padEnd(13), best || 'none within ×4');
}
