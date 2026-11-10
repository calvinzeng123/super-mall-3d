// Measure R1–R4 render cost in Node three (the community-render.test.js context method).
// usage: node r-render.mjs <worktree>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const W = process.argv[2];
const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const THREE = await import(pathToFileURL(path.join(W, 'node_modules/three/build/three.module.js')).href);
const paint = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
const { buildLayout } = await imp('src/layout/layout.js');
const { buildHospitality } = await imp('src/render/build/hospitality.js');
const t0 = Date.now();
const L = buildLayout({ expansion: true });
console.log('layout ms', Date.now() - t0);
const KEYS='bronze concrete ext extMetal extSatin facadeBronze facadeConcrete facadeFrame facadePlaster facadeStone facadeTimber facadeTravertine facadeWindow foliage forecourtStone glass glassTint glow glowSoft matte metal metroTile metroTunnel mirror satin stone water wood brick plaster slat travertine carpet'.split(' ');
const base = {}; for (const k of KEYS) base[k] = Object.assign(new THREE.MeshBasicMaterial({ transparent: k==='glass'||k==='glassTint' }), { name: k });
const ctx = { layout: L, dynamic: [], renderer: { localClippingEnabled: false }, camera: new THREE.PerspectiveCamera(),
  mats: { base, sign: () => new THREE.MeshBasicMaterial(), onNight: () => {} },
  levels: Object.fromEntries(L.levels.map((lv) => [lv.id, { lv, base: new THREE.Group(), shell: new THREE.Group() }])),
  buildings: Object.fromEntries(L.buildings.map((b) => [b.id, { b, group: new THREE.Group() }])),
  site: { group: new THREE.Group() }, scene: new THREE.Group() };
try { buildHospitality(ctx); } catch (e) { console.log('buildHospitality threw (continuing with what was built):', e.message.split('\n')[0]); }
const verts = (m) => m.geometry.attributes.position.count;
const tris = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
function stats(group, filter = () => true) {
  let meshes = 0, v = 0, t = 0, inst = 0, byName = {};
  group.traverse((o) => { if (o.isMesh && filter(o)) { meshes++; const n = o.isInstancedMesh ? o.count : 1; v += verts(o); t += tris(o) * n; if (o.isInstancedMesh) inst++; } });
  return { meshes, inst, verts: v, tris: Math.round(t), mb18: +(v * 18 / 1e6).toFixed(3) };
}
for (const id of ['R1', 'H', 'A']) {
  const rec = ctx.hospitality.buildings.get(id); if (!rec) { console.log(id, 'no record'); continue; }
  const g = rec.group;
  const lods = g.children.filter((c) => c.userData?.kind === 'residential-lod');
  const coreLods = g.children.filter((c) => c.userData?.kind === 'residential-core-lod');
  const all = stats(g);
  const lodMeshesEach = lods.length ? stats(lods[0]).meshes : 0;
  const batchedOnly = stats(g, (o) => !lods.some((l) => { let p = o; while (p) { if (p === l) return true; p = p.parent; } return false; }) && !coreLods.some((l) => { let p = o; while (p) { if (p === l) return true; p = p.parent; } return false; }));
  console.log(id, 'all', all, 'lodGroups', lods.length, 'meshes/lod', lodMeshesEach, 'coreLods', coreLods.length, 'withoutLods', batchedOnly);
  if (lods.length) { const names = []; lods[0].traverse((o) => o.isMesh && names.push(o.material.name + ':' + verts(o))); console.log('  lod template meshes', names.join(' ')); }
  const top = g.children.filter((c) => c.isMesh).map((m) => m.material.name + ':' + verts(m)); console.log('  direct meshes', top.length, top.join(' '));
  const instm = []; g.traverse((o) => o.isInstancedMesh && instm.push(o.name + ' n=' + o.count + ' vis=' + o.visible)); console.log('  instanced', instm.join(' | '));
  if (rec.groundGroup) console.log('  ground', stats(rec.groundGroup)); if (rec.roofGroup) console.log('  roof', stats(rec.roofGroup));
}
const R = ['R1', 'R2', 'R3', 'R4'].map((id) => ctx.hospitality.buildings.get(id)).filter(Boolean);
let tot = { meshes: 0, verts: 0 }; for (const r of R) { const s = stats(r.group); tot.meshes += s.meshes; tot.verts += s.verts; }
console.log('R1-R4 total exterior meshes', tot.meshes, 'verts', tot.verts, 'MB@18', (tot.verts * 18 / 1e6).toFixed(2));
