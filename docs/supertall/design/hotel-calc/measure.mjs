// Measure H / A and their neighbours in buildLayout({expansion:true}). Usage: node measure.mjs <worktree>
const wt = process.argv[2];
const { buildLayout } = await import(`${wt}/src/layout/layout.js`);
const geom = await import(`${wt}/src/layout/geom.js`);
const t0 = Date.now();
const L = buildLayout({ expansion: true });
console.log('buildLayout ms', Date.now() - t0);
const B = id => L.buildings.find(b => b.id === id);
const lv = id => L.levels.filter(l => l.building === id).sort((a, b) => a.elev - b.elev);
const segDist = (p, a, b) => { const dx = b[0]-a[0], dz = b[1]-a[1], l2 = dx*dx+dz*dz; const t = l2 ? Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l2)) : 0; return Math.hypot(p[0]-a[0]-dx*t, p[1]-a[1]-dz*t); };
const polyDist = (P, Q) => { let m = Infinity; for (const p of P) for (let i = 0; i < Q.length; i++) m = Math.min(m, segDist(p, Q[i], Q[(i+1)%Q.length])); for (const q of Q) for (let i = 0; i < P.length; i++) m = Math.min(m, segDist(q, P[i], P[(i+1)%P.length])); return m; };
for (const id of ['H', 'A']) {
  const b = B(id), ls = lv(id);
  console.log(`\n== ${id} ${b.name} usage=${b.usage} frame deg=${b.frame.deg} center=${b.center} bounds=${JSON.stringify(b.bounds)} height=${b.height} storeys=${b.storeys}`);
  console.log(' massing', JSON.stringify(b.massing));
  console.log(' levels', ls.length, ls.map(l => `${l.short}@${l.elev}/${l.height}${l.units.length ? ':' + l.units.length : ''}`).join(' '));
  const els = L.elevators.filter(e => e.building === id);
  console.log(' elevators', els.map(e => `${e.id} ${e.kind || e.type} lu=${e.lu} lv=${e.lv} w=${e.w} d=${e.d} door=${e.door} serves=${e.serves.length}`).join(' | '));
  const sts = L.stairs.filter(s => s.building === id);
  console.log(' stairs', sts.map(s => `${s.id} ${JSON.stringify(s.rect)} serves=${s.serves.length}`).join(' | '));
  const ens = L.entrances.filter(e => e.building === id);
  console.log(' entrances', ens.map(e => `${e.id}@${e.level}->${e.to} w=${(+e.width).toFixed(1)}`).join(' | '));
  const units = ls.flatMap(l => l.units);
  console.log(' units', units.length, 'types', [...new Set(units.map(u => u.residence.type))].join(','), 'areas', [...new Set(units.map(u => u.residence.area))].join(','));
  const rf = ls.find(l => l.kind === 'roof');
  console.log(' RF', rf.id, rf.elev, 'roof units', rf.units.length);
  // gaps to other above-grade buildings
  const others = L.buildings.filter(q => q.id !== id && !q.undergroundOnly && q.outline);
  const gaps = others.map(q => [q.id, q.kind, +polyDist(b.outline, q.outline).toFixed(2), +(q.height||0).toFixed(1)]).sort((a, z) => a[2] - z[2]).slice(0, 8);
  console.log(' nearest', JSON.stringify(gaps));
}
const P1 = B('P1');
console.log('\nP1 bounds', JSON.stringify(P1.bounds), 'height', P1.height, 'levels', lv('P1').map(l => `${l.short}@${l.elev}`).join(' '));
for (const id of ['T1', 'T2', 'R1', 'W1', 'W2', 'M', 'P2', 'P3']) { const b = B(id); if (b) console.log(id, JSON.stringify(b.bounds), 'h', b.height); }
// P1 roof garden / roof viewdeck features
const rf = lv('P1').find(l => l.short === 'RF' || l.kind === 'roof');
console.log('P1 RF', rf?.id, rf?.elev, rf?.name, 'walk', rf?.walk.length, 'features', rf?.features?.length);
const wings = P1.wings?.map(w => `${w.id}`).join(',');
console.log('P1 wings', wings);
// dock gateways
for (const g of L.extensions.gateways) console.log('gateway', g.id, g.elev, JSON.stringify(g.innerSeg), JSON.stringify(g.outerSeg));
for (const p of L.extensions.paths.filter(p => ['H', 'A'].includes(p.building))) console.log('path', p.id, p.kind, p.level, '->', p.to, JSON.stringify(p.points), 'w', p.width);
// site fire roads / hardstands records
console.log('roads', (L.extensions.roads || []).map(r => `${r.id}(${r.kind || ''}) ${JSON.stringify(r.points)} w${r.width}`).join('\n '));
console.log('site keys', Object.keys(L.site).join(','));
console.log('layout keys', Object.keys(L).join(','));
console.log('access gates', L.accessControl?.gates?.length, 'zones', L.accessControl?.zones?.length);
console.log('JSON bytes', JSON.stringify(L).length, 'levels', L.levels.length);
const Hjson = JSON.stringify(lv('H')).length, Ajson = JSON.stringify(lv('A')).length;
console.log('H levels JSON', Hjson, 'A levels JSON', Ajson, 'per typical floor', JSON.stringify(lv('H').find(l => l.short === '10F')).length);
