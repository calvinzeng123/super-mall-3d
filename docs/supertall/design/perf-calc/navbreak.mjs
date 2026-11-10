// Per-building nav cost and heap (fresh process, one run).
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const W = process.argv[2];
const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const { buildLayout } = await imp('src/layout/layout.js');
const { buildNav } = await imp('src/layout/nav.js');
const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed; };
const h0 = heap();
let t = performance.now(); const L = buildLayout({ expansion: true }); const tl = performance.now() - t;
const h1 = heap();
t = performance.now(); const nav = buildNav(L); const tn = performance.now() - t;
const h2 = heap();
const by = {};
for (const F of nav.floors.values()) {
  const b = F.building || (F.level && F.level.building) || F.kind;
  const r = (by[b] ||= { floors: 0, mezz: 0, walls: 0, obstacles: 0, cells: 0, pieces: 0 });
  r.floors++; if (F.kind === 'mezzanine') r.mezz++; r.walls += F.walls.length; r.obstacles += F.obstacles.length; r.cells += F.grid.size; r.pieces += F.pieces.length;
}
const lvJson = {};
for (const lv of L.levels) lvJson[lv.building] = (lvJson[lv.building] || 0) + JSON.stringify(lv).length;
for (const b in by) by[b].levelJsonKB = Math.round((lvJson[b] || 0) / 1e3);
console.log(JSON.stringify({ layoutMs: Math.round(tl), navMs: Math.round(tn), layoutHeapMB: +((h1 - h0) / 1e6).toFixed(1), navHeapMB: +((h2 - h1) / 1e6).toFixed(1), rssMB: Math.round(process.memoryUsage().rss / 1e6), by }, null, 0).replace(/\},"/g, '},\n"'));
