// How many nav floors are geometric duplicates (same walls, obstacles, pieces in X/Z)?
// The potential of sharing one nav "plan" between identical storeys.
import path from 'node:path'; import { pathToFileURL } from 'node:url'; import { createHash } from 'node:crypto';
const W = process.argv[2];
const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const { buildLayout } = await imp('src/layout/layout.js');
const { buildNav } = await imp('src/layout/nav.js');
const L = buildLayout({ expansion: true }), nav = buildNav(L);
const r = (v) => Math.round(v * 1000);
const sig = (F) => { const h = createHash('sha1');
  for (const w of F.walls) h.update(`${r(w.x0)},${r(w.z0)},${r(w.x1)},${r(w.z1)}${w.gate ? 'g' : ''};`);
  h.update('|'); for (const o of F.obstacles) h.update(o.outer.map((p) => `${r(p[0])},${r(p[1])}`).join(' ') + ';');
  h.update('|'); for (const p of F.pieces) h.update(p.outer.map((q) => `${r(q[0])},${r(q[1])}`).join(' ') + '/' + p.holes.length + ';');
  return h.digest('hex'); };
const groups = new Map(); let walls = 0, wallsUnique = 0;
for (const F of nav.floors.values()) { const k = `${F.building || F.kind}:${sig(F)}`; const g = groups.get(k) || groups.set(k, { n: 0, walls: F.walls.length, b: F.building || F.kind }).get(k); g.n++; walls += F.walls.length; }
for (const g of groups.values()) wallsUnique += g.walls;
const byB = {};
for (const g of groups.values()) { const x = (byB[g.b] ||= { floors: 0, unique: 0, walls: 0, wallsUnique: 0 }); x.floors += g.n; x.unique++; x.walls += g.walls * g.n; x.wallsUnique += g.walls; }
console.log(JSON.stringify({ floors: nav.floors.size, uniqueFloors: groups.size, walls, wallsUnique, towers: Object.fromEntries(Object.entries(byB).filter(([b]) => /^(R\d|W\d|T\d|H|A)$/.test(b))) }));
