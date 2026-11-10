// Tower level counts and tops for a worktree + env config.
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const W = process.argv[2];
const { buildLayout } = await import(pathToFileURL(path.join(W, 'src/layout/layout.js')).href);
const L = buildLayout({ expansion: true });
const byId = new Map(L.levels.map((l) => [l.id, l]));
const rows = [];
for (const b of L.buildings.filter((b) => b.kind === 'tower' || ['H', 'A', 'R1', 'R2', 'R3', 'R4', 'T1', 'T2', 'W1', 'W2'].includes(b.id))) {
  const lv = b.levels.map((id) => byId.get(id)).filter(Boolean);
  const top = Math.max(...lv.map((l) => l.elev + l.height));
  rows.push([b.id, lv.length, lv.reduce((n, l) => n + l.units.length, 0), +top.toFixed(1), lv.filter((l) => l.kind === 'refuge').length].join(' '));
}
console.log('levels', L.levels.length, 'units', L.levels.reduce((n, l) => n + l.units.length, 0), 'elevators', L.elevators.length);
console.log(rows.join('\n'));
