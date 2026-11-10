// v2 stacks (stack_lifts_v2.py) and the 32 m / 31.8 m tower depths of gaps.mjs. Prototype (not wired into the app): the proposed H / A exteriors built with the real BatchSet, to count meshes,
// vertices (18 B each, the community-render test rate) and triangles. Usage: node proto-exterior.mjs <worktree>
const wt = process.argv[2];
const THREE = await import(`${wt}/node_modules/three/build/three.module.js`);
const { BatchSet } = await import(`${wt}/src/render/batch.js`);
const mats = new Proxy({}, { get: (m, k) => typeof k === 'string' ? (m[k] ||= Object.assign(new THREE.MeshBasicMaterial(), { name: k })) : undefined });
const Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
// Storeys (elev, height, kind) from stack_lifts.py.
const stack = (rows) => { let e = 0; return rows.map(([n, h, kind]) => { const r = { n, elev: +e.toFixed(2), h, kind }; e += h; return r; }); };
const rep = (a, b, h, kind) => Array.from({ length: b - a + 1 }, (_, i) => [a + i, h, kind]);
const H = stack([[1, 6.5, 'lobby'], [2, 5, 'podium'], ...rep(3, 12, 3.4, 'res'), [13, 4.5, 'refuge'], ...rep(14, 25, 3.4, 'res'), [26, 8.6, 'refuge'], [27, 6.8, 'sky'], ...rep(28, 36, 3.4, 'hotel'), [37, 6, 'refuge'], ...rep(38, 46, 3.4, 'hotel'), [47, 6, 'amenity'], [48, 6, 'amenity']]);
const A = stack([[1, 6.5, 'lobby'], [2, 5, 'podium'], ...rep(3, 12, 3.4, 'apt'), [13, 4.5, 'refuge'], ...rep(14, 25, 3.4, 'apt'), [26, 6, 'refuge'], ...rep(27, 38, 3.4, 'apt'), [39, 6, 'refuge'], ...rep(40, 43, 6.5, 'loft'), [44, 5, 'amenity']]);
const roofOf = s => +(s.at(-1).elev + s.at(-1).h).toFixed(2);
// Faces of the tower (tower-local; L along x, D along z). Wings: |x| > core/2; spine (core) |x| < core/2.
function exterior(name, levels, L, D, core, podium, opts) {
  const B = new BatchSet(mats), RF = roofOf(levels), x0 = -L / 2, x1 = L / 2, z0 = -D / 2, z1 = D / 2, c = core / 2;
  const bandKinds = new Set(['refuge']), glassKinds = new Set(['sky', 'amenity', 'lobby', 'podium']);
  const upper = levels.filter(l => l.n >= 2);
  const wings = [[x0, -c], [c, x1]], longZ = [z0, z1], mod = 1.375;
  // 1. mullions / fins: continuous boxes from 2F to the wing parapet, every module on the four wing faces
  const top = RF + 1.2;
  for (const z of longZ) for (const [a, b] of wings) for (let x = a, i = 0; x <= b + 1e-6; x += mod, i++)
    B.get(i % 4 === 0 ? 'extSatin' : 'extMetal').box(x, (6.5 + top) / 2, z + Math.sign(z) * (i % 4 === 0 ? .25 : .06), i % 4 === 0 ? .12 : .06, top - 6.5, i % 4 === 0 ? .5 : .12, '#8e7653');
  // 2. vision glass: one quad per wing face per run of same-kind storeys (merged up the tower)
  const runs = []; for (const l of upper) { const last = runs.at(-1); if (last && last.kind === l.kind) last.y1 = l.elev + l.h; else runs.push({ kind: l.kind, y0: l.elev, y1: l.elev + l.h }); }
  for (const r of runs) { if (bandKinds.has(r.kind)) continue; for (const z of longZ) for (const [a, b] of wings) { P.set((a + b) / 2, (r.y0 + r.y1) / 2, z); Q.setFromAxisAngle(Y, z > 0 ? 0 : Math.PI); S.set(b - a, r.y1 - r.y0, 1); B.get('glassTint').shape('plane', P, Q, S, '#ffffff'); } }
  // 3. spandrel + slab-edge band per typical storey, per wing face (glazed amenity / sky storeys: slab edge only)
  for (const l of upper) for (const z of longZ) for (const [a, b] of wings) {
    if (bandKinds.has(l.kind)) continue;
    B.get('facadeTravertine').box((a + b) / 2, l.elev + (glassKinds.has(l.kind) ? .1 : .4), z, b - a, glassKinds.has(l.kind) ? .45 : 1.0, .14, '#d8cdb8');
  }
  // 4. end walls (山墙, shear walls): solid stone merged up the tower + 4 continuous window slots each
  for (const x of [x0, x1]) {
    B.get('facadeTravertine').box(x, (6.5 + top) / 2, 0, .3, top - 6.5, D, '#efe6d6');
    for (const zz of [-12, -4, 4, 12]) { P.set(x + Math.sign(x) * .16, (6.5 + RF) / 2, zz); Q.setFromAxisAngle(Y, x > 0 ? Math.PI / 2 : -Math.PI / 2); S.set(1.6, RF - 6.5, 1); B.get('glassTint').shape('plane', P, Q, S, '#ffffff'); for (const s of [-1, 1]) B.get('extMetal').box(x + Math.sign(x) * .2, (6.5 + RF) / 2, zz + s * .85, .12, RF - 6.5, .1, '#8e7653'); }
  }
  // 5. core spine on both long faces: stone panel + 8 vertical louvre fins, rising into the crown
  const spineTop = opts.spineTop;
  for (const z of longZ) { B.get('facadeTravertine').box(0, (6.5 + spineTop) / 2, z, core, spineTop - 6.5, .3, '#e6dccb'); for (let i = 0; i < 8; i++) B.get('extMetal').box(-c + (i + .5) * core / 8, (6.5 + spineTop) / 2, z + Math.sign(z) * .35, .18, spineTop - 6.5, .4, '#5d6466'); }
  // 6. refuge bands: 8 louvre blades on every face + 2 rescue-window markers per storey on the hardstand face
  for (const l of upper.filter(l => bandKinds.has(l.kind))) {
    for (const z of longZ) for (const [a, b] of wings) for (let k = 0; k < 8; k++) B.get('extMetal').box((a + b) / 2, l.elev + .3 + k * (l.h - .6) / 7, z + Math.sign(z) * .1, b - a, .08, .25, '#5d6466');
    for (const x of [x0, x1]) for (let k = 0; k < 8; k++) B.get('extMetal').box(x + Math.sign(x) * .1, l.elev + .3 + k * (l.h - .6) / 7, 0, .25, .08, D, '#5d6466');
  }
  for (const l of upper.filter(l => !bandKinds.has(l.kind))) for (const xx of [-20, 20]) { P.set(xx, l.elev + 1.6, z1 + .3); Q.identity(); S.set(.5, .45, 1); B.get('glowSoft').shape('plane', P, Q, S, '#d0302a'); }
  // 7. lived-in panes: 2 curtain / lit quads per unit per storey (8 units), unit rhythm varies by floor
  for (const l of upper.filter(l => ['res', 'hotel', 'apt', 'loft'].includes(l.kind))) for (let u = 0; u < 8; u++) for (let k = 0; k < 2; k++) {
    const z = u < 4 ? z0 - .1 : z1 + .1, x = [-27.5, -16.5, 16.5, 27.5][u % 4] + (k ? 3 : -3);
    P.set(x, l.elev + 1.7, z * .99); Q.setFromAxisAngle(Y, z > 0 ? 0 : Math.PI); S.set(.5, l.h - 1.2, 1); B.get((l.n + u + k) % 4 ? 'ext' : 'glowSoft').shape('plane', P, Q, S, '#eadfc9');
  }
  // 8. slabs (resident, for the cutaway): two wing boxes + the corridor box per level (the core owns its floors)
  for (const l of levels) { for (const [a, b] of wings) B.get('stone').box((a + b) / 2, l.elev - .14, 0, b - a, .28, D, '#ece9e0'); }
  // 9. core walls merged up the tower (outer + lobby + shaft walls) and per-level landing doors as one instanced mesh (counted apart)
  for (const z of [-2, 2, -5, 5, -12, 12]) B.get('concrete').box(0, RF / 2, z, core, RF, .3, '#c9cecb');
  for (const x of [-c, -5.6, 0, 5.6, c]) B.get('concrete').box(x, RF / 2, 0, .3, RF, D, '#c9cecb');
  // 10. sky / amenity storeys: projecting slab fins; podium (1F) glass, canopy and lintel; crown
  for (const l of upper.filter(l => glassKinds.has(l.kind))) for (const z of longZ) B.get('extSatin').box(0, l.elev + l.h - .2, z + Math.sign(z) * .6, L, .3, 1.2, '#8e7653');
  const [pw, pd] = podium; for (const [z, w] of [[-pd / 2, pw], [pd / 2, pw]]) { P.set(0, 3.3, z); Q.setFromAxisAngle(Y, z > 0 ? 0 : Math.PI); S.set(w, 5.6, 1); B.get('glassTint').shape('plane', P, Q, S, '#ffffff'); B.get('stone').box(0, 6.3, z, w, .4, .3, '#c9c8bc'); }
  for (const x of [-pw / 2, pw / 2]) { P.set(x, 3.3, 0); Q.setFromAxisAngle(Y, Math.PI / 2); S.set(pd, 5.6, 1); B.get('glassTint').shape('plane', P, Q, S, '#ffffff'); }
  for (let t = -pw / 2; t <= pw / 2; t += 3.2) for (const z of [-pd / 2, pd / 2]) B.get('extMetal').box(t, 3.2, z, .07, 6.2, .1, '#8e7653');
  B.get('stone').box(0, 6.5 - .14, 0, pw, .28, pd, '#d9d4c7');                         // podium roof deck
  opts.crown(B, RF, L, D, core);
  const g = new THREE.Group(); B.flush(g);
  // far LOD stand-in: wing masses, spine, glass per wing face per run, refuge bands, per-storey spandrel lines, crown
  const F = new BatchSet(mats);
  F.get('facadePlaster').box(0, 3.25, 0, pw, 6.5, pd, '#d6ccb9');
  for (const [a, b] of wings) F.get('facadePlaster').box((a + b) / 2, (6.5 + RF) / 2, 0, b - a, RF - 6.5, D, '#d8cdb8');
  F.get('facadePlaster').box(0, (6.5 + spineTop) / 2, 0, core, spineTop - 6.5, D, '#e6dccb');
  for (const r of runs) for (const z of longZ) for (const [a, b] of wings) { P.set((a + b) / 2, (r.y0 + r.y1) / 2, z * 1.002); Q.setFromAxisAngle(Y, z > 0 ? 0 : Math.PI); S.set(b - a, r.y1 - r.y0, 1); F.get(bandKinds.has(r.kind) ? 'facadePlaster' : 'facadeWindow').shape('plane', P, Q, S, bandKinds.has(r.kind) ? '#5d6466' : '#8c9ca3'); }
  for (const l of upper.filter(l => !bandKinds.has(l.kind) && !glassKinds.has(l.kind))) for (const z of longZ) { P.set(0, l.elev + .3, z * 1.004); Q.setFromAxisAngle(Y, z > 0 ? 0 : Math.PI); S.set(L, .8, 1); F.get('facadePlaster').shape('plane', P, Q, S, '#d8cdb8'); }
  opts.crown(F, RF, L, D, core, true);
  const far = new THREE.Group(); F.flush(far);
  const stat = grp => { let meshes = 0, v = 0; const by = {}; grp.traverse(o => { if (o.isMesh) { meshes++; const n = o.geometry.attributes.position.count; v += n; by[o.material.name] = (by[o.material.name] || 0) + n; } }); return { meshes, v, tris: Math.round(v / 3), MB: +(v * 18 / 1e6).toFixed(3), by }; };
  const near = stat(g), lod = stat(far);
  // landing doors (one InstancedMesh, 3 boxes per door): count stops
  console.log(`${name}: RF ${RF} m, ${levels.length} storeys`);
  console.log('  near', JSON.stringify({ meshes: near.meshes, verts: near.v, tris: near.tris, MB: near.MB }), JSON.stringify(near.by));
  console.log('  far ', JSON.stringify({ meshes: lod.meshes, verts: lod.v, tris: lod.tris, MB: lod.MB }));
  return { near, lod };
}
const hCrown = (B, RF, L, D, core, far = false) => {
  // spine lantern (machine rooms, BMU garage) + helipad deck 22 × 22 m on top + louvred screens on the wing roofs
  const k = far ? 'facadePlaster' : 'extMetal';
  B.get(far ? 'facadePlaster' : 'facadeTravertine').box(0, RF + 5.5, 0, core, 11, D, '#e6dccb');
  B.get(far ? 'facadePlaster' : 'stone').box(0, RF + 11.3, 0, 22, .6, 22, '#9aa0a0');            // pad deck at ≈ RF + 11.6
  if (!far) { for (const s of [-1, 1]) B.get('extMetal').box(s * 11.6, RF + 11.4, 0, 1.2, .1, 22, '#5d6466'); for (const s of [-1, 1]) B.get('extMetal').box(0, RF + 11.4, s * 11.6, 22, .1, 1.2, '#5d6466');
    for (const [x, z] of [[-10.5, -10.5], [10.5, -10.5], [-10.5, 10.5], [10.5, 10.5]]) B.get('glowSoft').box(x, RF + 11.8, z, .3, .3, .3, '#ff3b30');
    B.get('ext').box(0, RF + 11.62, 0, 9, .02, 1.2, '#ffffff'); for (const s of [-1, 1]) B.get('ext').box(s * 3.9, RF + 11.62, 0, 1.2, .02, 9, '#ffffff');
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) B.get('extMetal').box(s * (core / 2 + 11), RF + .5 + i * .9, 0, 21.5, .08, D * .6, '#5d6466');
    B.get('extMetal').cyl(0, RF + 11.6, 0, .08, 2.4, '#5d6466', 6); }
  for (const s of [-1, 1]) B.get(k).box(s * (L / 2 - .2), RF + .6, 0, .4, 1.2, D, '#8e7653');
};
const aCrown = (B, RF, L, D, core, far = false) => {
  B.get(far ? 'facadePlaster' : 'facadeTravertine').box(0, RF + 5, 0, core, 10, D, '#e6dccb');
  if (!far) { for (const s of [-1, 1]) for (let i = 0; i < 5; i++) B.get('extMetal').box(s * (core / 2 + 11), RF + .5 + i * .9, 0, 21.5, .08, D * .6, '#454d50');
    B.get('ext').box(-22, RF + .03, 0, 10, .02, 10, '#e9c14a'); for (const [x, z] of [[-27, -5], [-17, -5], [-27, 5], [-17, 5]]) B.get('glowSoft').box(x, RF + .3, z, .25, .25, .25, '#ff3b30'); }
  for (const s of [-1, 1]) B.get(far ? 'facadePlaster' : 'extMetal').box(s * (L / 2 - .2), RF + .6, 0, .4, 1.2, D, '#454d50');
};
const h = exterior('H v2 (tower 66 × 32, podium 74 × 38)', H, 66, 32, 22, [74, 38], { spineTop: roofOf(H) + 11, crown: hCrown });
const a = exterior('A v2 (tower 66 × 31.8, podium 74 × 38)', A, 66, 31.8, 22, [74, 38], { spineTop: roofOf(A) + 10, crown: aCrown });
const lifts = { H: [[4, 25], [3, 5], [4, 21], [1, 51], [1, 28]], A: [[5, 43], [2, 47]] };   // [cars, stops]
for (const [id, ls] of Object.entries(lifts)) console.log(`${id} landing doors`, ls.reduce((n, [c, s]) => n + c * s, 0), 'instances (one InstancedMesh, ≈ 3 boxes = 108 v each, one draw)');
console.log('today (measured, geo.mjs): H exterior batched 176,202 v / 9 meshes, A 149,166 v / 9 meshes; H lobby 236,484 v, A lobby 238,608 v');
