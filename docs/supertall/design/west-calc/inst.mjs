// Instancing prototype check: per-tower vertices (distinct geometries), draw calls and drawn triangles of the near exterior.
const root = process.argv[2];
const THREE = await import(root + '/node_modules/three/build/three.module.js');
const paint = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
const { buildLayout } = await import(root + '/src/layout/layout.js');
const { buildCommunityTower } = await import(root + '/src/render/build/community.js');
const { buildCommunitySite } = await import(root + '/src/render/build/community-site.js');
const L = buildLayout();
const base = new Proxy({}, { get: (m, k) => typeof k === 'string' ? (m[k] ||= Object.assign(new THREE.MeshBasicMaterial(), { name: k })) : undefined });
const ctx = { layout: L, dynamic: [], mats: { base, sign: () => new THREE.MeshBasicMaterial(), onNight: () => {} },
  levels: Object.fromEntries(L.levels.map((lv) => [lv.id, { lv, base: new THREE.Group(), shell: new THREE.Group() }])),
  buildings: Object.fromEntries(L.buildings.map((b) => [b.id, { b, group: new THREE.Group() }])), hospitality: { buildings: new Map() }, site: { group: new THREE.Group() } };
const verts = (...gs) => { const seen = new Set(); for (const g of gs) g?.traverse((o) => { if (o.isMesh) seen.add(o.geometry); }); return [...seen].reduce((n, q) => n + q.attributes.position.count, 0); };
let all = 0; const rows = [];
for (const b of L.buildings.filter((q) => q.community)) {
  const r = buildCommunityTower(ctx, b, ctx.hospitality.buildings);
  const v = verts(r.group) + verts(r.groundGroup) + verts(...r.basements); all += v;
  if (b.community !== 'west') continue;
  let calls = 0, tris = 0;
  r.group.traverse((o) => { if (!o.isMesh) return; for (let q = o; q && q !== r.group.parent; q = q.parent) if (!q.visible) return; calls++; tris += o.geometry.attributes.position.count / 3 * (o.isInstancedMesh ? o.count : 1); });
  rows.push(`${b.id}: exterior ${verts(r.group)} verts, tower total ${(v * 18 / 1e6).toFixed(2)} MB, near calls ${calls}, near drawn tris ${tris}`);
}
all += verts(buildCommunitySite(ctx));
console.log(`[${process.env.WEST_STACK || 'today'} inst=${process.env.WEST_INSTANCE || 0} fam=${process.env.WEST_FAMILIES || 0}] ${rows.join(' | ')} | community ${(all * 18 / 1e6).toFixed(2)} MB`);
