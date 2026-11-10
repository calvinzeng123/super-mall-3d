// Vertex cost of the per-storey residential shell template (residential-shell.js) for 2-home families,
// placing the shipped 01 / 02 / 03 plans in the proposed south slots (W x0 = -19.4, E x1 = 19.4, entry on z = 1.6).
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const W = process.argv[2]; const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const THREE = await import(pathToFileURL(path.join(W, 'node_modules/three/build/three.module.js')).href);
const paint = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
const { frame, toW } = await imp('src/layout/geom.js');
const { createResidentialPlan } = await imp('src/layout/residential-plan.js');
const { buildResidentialLevelShells } = await imp('src/render/build/residential-shell.js');
const KEYS = 'concrete ext extMetal extSatin facadePlaster glass glassTint glowSoft stone wood satin metal'.split(' ');
const mats = {}; for (const k of KEYS) mats[k] = Object.assign(new THREE.MeshBasicMaterial(), { name: k });
const F = frame(0, 0, 0, 'T');
const fam = { 'L 01+02': [['01', -19.4], ['02', 3.8]], 'M 03+02': [['03', -19.4], ['02', 3.8]], 'today 01+02+03': [['01', -19.4], ['02', 3.8], ['03r', 8.8]] };
for (const [name, slots] of Object.entries(fam)) {
  const units = slots.map(([p, x]) => { const rot = p === '03r'; const proto = rot ? '03' : p; const plan = createResidentialPlan(proto);
    return { id: name + p, frame: frame(...toW(F, x, rot ? -1.6 : 1.6), rot ? 180 : 0, p), residence: { ...plan, prototype: proto } }; });
  const lv = { id: 'X-2F', elev: 4.8, height: 3.4, units, corePlan: { stairs: [] } };
  const exterior = new THREE.Group();
  buildResidentialLevelShells({}, { frame: F }, [lv], mats, exterior);
  const g = exterior.children[0]; let v = 0; const per = [];
  g.traverse((o) => { if (o.isMesh) { v += o.geometry.attributes.position.count; per.push(o.material.name + ':' + o.geometry.attributes.position.count); } });
  console.log(name.padEnd(16), 'meshes', per.length, 'verts', v, 'MB@18', (v * 18 / 1e6).toFixed(3), per.join(' '));
}
