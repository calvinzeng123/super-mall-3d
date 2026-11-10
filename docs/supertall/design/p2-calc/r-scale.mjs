// Layout + nav + render cost of R1–R4 as a function of storeys (the shipped plan scaled, no redesign).
// usage: node r-scale.mjs <worktree>   (run once per storeys value after editing HOSPITALITY in the worktree)
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const W = process.argv[2]; const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const THREE = await import(pathToFileURL(path.join(W, 'node_modules/three/build/three.module.js')).href);
const paint = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
const { buildLayout } = await imp('src/layout/layout.js');
const { buildNav } = await imp('src/layout/nav.js');
const { buildHospitality } = await imp('src/render/build/hospitality.js');
let t = Date.now(); const L = buildLayout({ expansion: true }); const tl = Date.now() - t;
t = Date.now(); const nav = buildNav(L); const tn = Date.now() - t;
const R = L.levels.filter((l) => /^R\d$/.test(l.building));
const homes = R.reduce((n, l) => n + l.units.length, 0);
const KEYS = 'bronze concrete ext extMetal extSatin facadeBronze facadeConcrete facadeFrame facadePlaster facadeStone facadeTimber facadeTravertine facadeWindow foliage forecourtStone glass glassTint glow glowSoft matte metal metroTile metroTunnel mirror satin stone water wood brick plaster slat travertine carpet'.split(' ');
const base = {}; for (const k of KEYS) base[k] = Object.assign(new THREE.MeshBasicMaterial({ transparent: k === 'glass' || k === 'glassTint' }), { name: k });
const ctx = { layout: L, dynamic: [], renderer: { localClippingEnabled: false }, camera: new THREE.PerspectiveCamera(), mats: { base, sign: () => new THREE.MeshBasicMaterial(), onNight: () => {} },
  levels: Object.fromEntries(L.levels.map((lv) => [lv.id, { lv, base: new THREE.Group(), shell: new THREE.Group() }])),
  buildings: Object.fromEntries(L.buildings.map((b) => [b.id, { b, group: new THREE.Group() }])), site: { group: new THREE.Group() }, scene: new THREE.Group() };
t = Date.now(); try { buildHospitality(ctx); } catch (e) { /* later site parts need a full ctx; the tower records are complete */ } const tr = Date.now() - t;
const rec = ctx.hospitality.buildings.get('R1');
let meshes = 0, uniq = new Set(), drawn = 0, sheer = 0;
rec.group.traverse((o) => { if (!o.isMesh) return; if (o.isInstancedMesh && (!o.visible || !o.count)) return; meshes++; uniq.add(o.geometry); if (['glass', 'glassTint'].includes(o.material.name)) sheer++; });
const v = [...uniq].reduce((n, g) => n + g.attributes.position.count, 0);
let triDrawn = 0; rec.group.traverse((o) => { if (o.isMesh && o.visible && !(o.isInstancedMesh && !o.count)) triDrawn += o.geometry.attributes.position.count / 3 * (o.isInstancedMesh ? o.count : 1); });
console.log(JSON.stringify({ storeys: L.buildings.find((b) => b.id === 'R1').storeys, Rlevels: R.length, homes, layoutMs: tl, navMs: tn, renderMs: tr, navFloors: nav.floors ? Object.keys(nav.floors).length : undefined,
  R1: { meshes, browserCallsEst: meshes + sheer, uniqueVerts: v, uniqueMB18: +(v * 18 / 1e6).toFixed(2), tris: Math.round(triDrawn) }, totalLevels: L.levels.length }));
