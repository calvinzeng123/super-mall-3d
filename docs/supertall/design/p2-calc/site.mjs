// Site facts around 二期住宅区: P2 bounds, river, roads, R footprints, heights, neighbours.
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const W = process.argv[2]; const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const { buildLayout } = await imp('src/layout/layout.js');
const { polyBounds } = await imp('src/layout/geom.js');
const L = buildLayout({ expansion: true });
for (const b of L.buildings) {
  const lv = L.levels.filter((l) => l.building === b.id); const top = Math.max(...lv.map((l) => l.elev + l.height));
  const bb = b.bounds || (b.outline && polyBounds(b.outline));
  console.log(b.id.padEnd(5), (b.kind||'').padEnd(8), (b.usage||'').padEnd(12), 'levels', String(lv.length).padStart(3), 'top', top.toFixed(1).padStart(6), 'bounds', bb ? [bb.x0, bb.x1, bb.z0, bb.z1].map((v) => v.toFixed(1)).join(',') : '-', b.community||'');
}
const R = L.site.river; if (R) console.log('river keys', Object.keys(R).join(','));
if (R?.water) console.log('river water bounds', JSON.stringify(polyBounds(R.water.poly || R.water)));
for (const k of ['bridges','promenade','banks']) if (R?.[k]) console.log(k, Array.isArray(R[k]) ? R[k].length : typeof R[k]);
const roads = (L.site.roads || []).filter((r) => { const p = r.points || r.poly || []; return JSON.stringify(r).includes('星湾') || JSON.stringify(r).includes('北外环'); });
for (const r of roads.slice(0, 12)) console.log('road', r.id, r.name, r.width, JSON.stringify(r.points || r.poly).slice(0, 160));
console.log('site keys', Object.keys(L.site).join(','));
const ext = L.extensions; if (ext) console.log('ext keys', Object.keys(ext).join(','), (ext.districts||[]).map((d) => d.id + JSON.stringify(d.rect)).join(' '));
