// Per-tower resident geometry of the community towers (same method as tests/community-render.test.js).
// Usage: node geo.mjs <worktree-root>
const root = process.argv[2];
const THREE = await import(root + '/node_modules/three/build/three.module.js');
const paint = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
const { buildLayout } = await import(root + '/src/layout/layout.js');
const { buildCommunityTower } = await import(root + '/src/render/build/community.js');
const { buildCommunitySite } = await import(root + '/src/render/build/community-site.js');
const t0 = Date.now();
const L = buildLayout();
const tl = Date.now() - t0;
const base = new Proxy({}, { get: (m, k) => typeof k === 'string' ? (m[k] ||= Object.assign(new THREE.MeshBasicMaterial(), { name: k })) : undefined });
const ctx = { layout: L, dynamic: [], mats: { base, sign: () => new THREE.MeshBasicMaterial(), onNight: () => {} },
  levels: Object.fromEntries(L.levels.map((lv) => [lv.id, { lv, base: new THREE.Group(), shell: new THREE.Group() }])),
  buildings: Object.fromEntries(L.buildings.map((b) => [b.id, { b, group: new THREE.Group() }])), hospitality: { buildings: new Map() }, site: { group: new THREE.Group() } };
const verts = (...groups) => { const seen = new Set(); for (const g of groups) g?.traverse((o) => { if (o.isMesh) seen.add(o.geometry); }); return [...seen].reduce((n, q) => n + q.attributes.position.count, 0); };
const tris = (g, vis = true) => { let n = 0; g.traverse((o) => { if (!o.isMesh) return; for (let q = o; q && q !== g.parent; q = q.parent) if (vis && !q.visible) return; n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };
const calls = (g) => { let n = 0; g.traverse((o) => { if (!o.isMesh) return; for (let q = o; q && q !== g.parent; q = q.parent) if (!q.visible) return; n++; }); return n; };
let total = 0;
const out = [];
for (const b of L.buildings.filter((q) => q.community)) {
  const t1 = Date.now();
  const r = buildCommunityTower(ctx, b, ctx.hospitality.buildings);
  const ms = Date.now() - t1;
  const lod = r.group.children.find((o) => o.isLOD);
  let near = null, far = null;
  if (lod) { near = lod.children[0]; far = lod.children.slice(1); }
  const v = { ext: verts(r.group), lobby: verts(r.groundGroup), base: verts(...r.basements) };
  const sum = v.ext + v.lobby + v.base; total += sum;
  const farV = far ? far.reduce((n, m) => n + m.geometry.attributes.position.count, 0) : 0;
  const farT = far ? far.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0) : 0;
  out.push({ id: b.id, levels: b.levels.length, units: L.levels.filter((l) => l.building === b.id).reduce((n, l) => n + l.units.length, 0),
    vertsExt: v.ext, vertsLobby: v.lobby, vertsBase: v.base, MB: +(sum * 18 / 1e6).toFixed(3), nearVerts: near ? verts(near) : v.ext, farVerts: farV, farTris: farT,
    trisVisible: tris(r.group), drawCalls: calls(r.group), buildMs: ms });
}
const site = buildCommunitySite(ctx), sv = verts(site); total += sv;
console.log(JSON.stringify({ layoutMs: tl, towers: out, siteVerts: sv, siteMB: +(sv * 18 / 1e6).toFixed(3), totalMB: +(total * 18 / 1e6).toFixed(3) }, null, 1));
