// Node three: exterior meshes / vertices of H and A today (18 B/vertex, as tests/community-render.test.js). Usage: node geo.mjs <worktree>
const wt = process.argv[2];
const THREE = await import(`${wt}/node_modules/three/build/three.module.js`);
const paint = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
const { buildLayout } = await import(`${wt}/src/layout/layout.js`);
const { buildHospitality } = await import(`${wt}/src/render/build/hospitality.js`);
const L = buildLayout({ expansion: true });
const KEYS = 'concrete stone extSatin extMetal glass glassTint ext glowSoft glow facadeTravertine facadePlaster facadeWindow wood satin foliage metal water brick terrazzo paint plaster fabric leather marble rubber asphalt grass sand gravel steel chrome mirror'.split(' ');
const store = {};
const base = new Proxy(store, {
  get: (m, k) => typeof k === 'string' ? (m[k] ||= Object.assign(new THREE.MeshBasicMaterial(), { name: k })) : undefined,
  ownKeys: () => [...new Set([...KEYS, ...Object.keys(store)])],
  getOwnPropertyDescriptor: (m, k) => ({ enumerable: true, configurable: true, value: base[k] }),
});
const ctx = { layout: L, dynamic: [], renderer: {}, root: new THREE.Group(), camera: { position: new THREE.Vector3(0, 50, 0) },
  mats: { base, sign: () => new THREE.MeshBasicMaterial(), onNight: () => {}, floor: () => new THREE.MeshBasicMaterial() },
  levels: Object.fromEntries(L.levels.map(lv => [lv.id, { lv, base: new THREE.Group(), shell: new THREE.Group(), batch: null }])),
  buildings: Object.fromEntries(L.buildings.map(b => [b.id, { b, group: new THREE.Group() }])),
  site: { group: new THREE.Group() } };
const t0 = Date.now();
try { buildHospitality(ctx); } catch (e) { console.log('buildHospitality threw (partial results ok):', e.message.split('\n')[0]); }
console.log('build ms', Date.now() - t0);
const stats = g => { let meshes = 0, verts = 0, tris = 0; const byMat = {}; g.traverse(o => { if (!o.isMesh) return; const n = o.geometry.attributes.position.count * (o.isInstancedMesh ? o.count : 1); meshes++; verts += n; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); byMat[o.material.name || '?'] = (byMat[o.material.name || '?'] || 0) + n; }); return { meshes, verts, tris: Math.round(tris), MB: +(verts * 18 / 1e6).toFixed(3), byMat }; };
for (const id of ['H', 'A', 'R1']) {
  const rec = ctx.hospitality.buildings.get(id);
  if (!rec) { console.log(id, 'no record'); continue; }
  const vis=[]; rec.group.traverse(o=>{ if(o.isMesh) vis.push(`${o.name||o.material.name}${o.isInstancedMesh?'[inst x'+o.count+']':''}${o.visible?'':'(hidden)'}:${o.geometry.attributes.position.count}`); });
  console.log(id,'meshes', vis.join(' | '));
  const ex = stats(rec.group), lob = rec.groundGroup ? stats(rec.groundGroup) : null, roof = rec.roofGroup ? stats(rec.roofGroup) : null;
  console.log(`${id} exterior`, JSON.stringify({ meshes: ex.meshes, verts: ex.verts, tris: ex.tris, MB: ex.MB }), 'byMat', JSON.stringify(ex.byMat));
  console.log(`${id} lobby`, JSON.stringify(lob && { meshes: lob.meshes, verts: lob.verts, MB: lob.MB }), 'roof', JSON.stringify(roof && { meshes: roof.meshes, verts: roof.verts }));
  const lv = L.levels.filter(l => l.building === id && l.units.length).length;
  console.log(`${id} per unit floor ≈`, Math.round(ex.verts / Math.max(1, lv)), 'verts (exterior / unit floors', lv, ')');
}
