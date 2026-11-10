// Per-material vertex counts of the W1 near exterior (to see what scales per floor).
const root = process.argv[2];
const THREE = await import(root + '/node_modules/three/build/three.module.js');
const paint = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
const { buildLayout } = await import(root + '/src/layout/layout.js');
const { buildCommunityTower } = await import(root + '/src/render/build/community.js');
const L = buildLayout();
const base = new Proxy({}, { get: (m, k) => typeof k === 'string' ? (m[k] ||= Object.assign(new THREE.MeshBasicMaterial(), { name: k })) : undefined });
const ctx = { layout: L, dynamic: [], mats: { base, sign: () => new THREE.MeshBasicMaterial(), onNight: () => {} },
  levels: Object.fromEntries(L.levels.map((lv) => [lv.id, { lv, base: new THREE.Group(), shell: new THREE.Group() }])),
  buildings: Object.fromEntries(L.buildings.map((b) => [b.id, { b, group: new THREE.Group() }])), hospitality: { buildings: new Map() }, site: { group: new THREE.Group() } };
const b = L.buildings.find((q) => q.id === 'W1');
const r = buildCommunityTower(ctx, b, ctx.hospitality.buildings);
const lod = r.group.children.find((o) => o.isLOD), near = lod.children[0];
const per = {};
near.traverse((o) => { if (o.isMesh) per[o.material.name + (o.isInstancedMesh ? '(inst)' : '')] = (per[o.material.name] || 0) + o.geometry.attributes.position.count; });
const attrs = []; near.traverse((o) => { if (o.isMesh && !attrs.length) attrs.push(Object.entries(o.geometry.attributes).map(([k, a]) => `${k}:${a.itemSize}x${a.array.constructor.name}`).join(' ')); });
console.log(JSON.stringify({ stack: process.env.WEST_STACK || 'today', per, attrs: attrs[0], others: r.group.children.filter((o) => !o.isLOD).map((o) => o.name || o.type) }));
