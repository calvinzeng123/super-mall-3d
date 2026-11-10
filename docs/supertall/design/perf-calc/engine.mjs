// Engine baselines: buildLayout / buildNav time + heap, level counts, links.
// usage: node --expose-gc engine.mjs <worktree> [runs]
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const W = process.argv[2], RUNS = +(process.argv[3] || 3);
const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const { buildLayout } = await imp('src/layout/layout.js');
const { buildNav } = await imp('src/layout/nav.js');
const gc = globalThis.gc || (() => {});
const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed; };
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const out = { layoutMs: [], layoutFpsMs: [], navMs: [], navOpenMs: [] };
let L, nav;
// warm import cost
let t = performance.now(); buildLayout({ expansion: false }); out.firstFpsMs = Math.round(performance.now() - t);
for (let i = 0; i < RUNS; i++) {
  const h0 = heap();
  t = performance.now(); L = buildLayout({ expansion: true }); out.layoutMs.push(Math.round(performance.now() - t));
  const h1 = heap();
  t = performance.now(); nav = buildNav(L); out.navMs.push(Math.round(performance.now() - t));
  const h2 = heap();
  out.layoutHeapMB = +((h1 - h0) / 1e6).toFixed(1); out.navHeapMB = +((h2 - h1) / 1e6).toFixed(1);
  t = performance.now(); buildNav(L, { gates: 'open' }); out.navOpenMs.push(Math.round(performance.now() - t));
  t = performance.now(); buildLayout({ expansion: false }); out.layoutFpsMs.push(Math.round(performance.now() - t));
}
const byB = {};
for (const lv of L.levels) (byB[lv.building] ||= { levels: 0, units: 0 }), byB[lv.building].levels++, byB[lv.building].units += lv.units.length;
let walls = 0, pieces = 0, obstacles = 0, gridCells = 0;
const floorsByKind = {};
for (const F of nav.floors.values()) { walls += F.walls.length; pieces += F.pieces.length; obstacles += F.obstacles.length; gridCells += F.grid.size; floorsByKind[F.kind] = (floorsByKind[F.kind] || 0) + 1; }
const links = {}; let stops = 0;
for (const k of nav.links) { links[k.kind] = (links[k.kind] || 0) + 1; stops += k.stops.length; }
const maxStops = Math.max(...nav.links.filter(k => k.kind === 'lift').map(k => k.stops.length));
const json = JSON.stringify(L).length;
const lvJson = JSON.stringify(L.levels).length;
console.log(JSON.stringify({
  layoutMs: med(out.layoutMs), layoutRuns: out.layoutMs, layoutFpsMs: med(out.layoutFpsMs), firstFpsMs: out.firstFpsMs,
  navMs: med(out.navMs), navRuns: out.navMs, navOpenMs: med(out.navOpenMs), layoutHeapMB: out.layoutHeapMB, navHeapMB: out.navHeapMB,
  levels: L.levels.length, buildings: L.buildings.length, elevators: L.elevators.length, stairs: L.stairs.length,
  navFloors: nav.floors.size, floorsByKind, walls, pieces, obstacles, gridCells, links, stops, maxLiftStops: maxStops,
  gates: L.accessControl?.gates?.length, zones: L.accessControl?.zones?.length,
  layoutJsonMB: +(json / 1e6).toFixed(2), levelsJsonMB: +(lvJson / 1e6).toFixed(2),
  byBuilding: byB,
}, null, 1));
