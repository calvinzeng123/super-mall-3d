const wt = process.argv[2];
const { buildLayout } = await import(`${wt}/src/layout/layout.js`);
const L = buildLayout({ expansion: true });
const P1 = L.buildings.find(b => b.id === 'P1');
console.log('P1 outline', JSON.stringify(P1.outline.map(p => p.map(v => +v.toFixed(2)))));
for (const id of ['P1E', 'P1W3', 'P1W4', 'P1C', 'P1E2']) {
  const ls = L.levels.filter(l => l.building === id).sort((a, b) => a.elev - b.elev);
  console.log(id, ls.map(l => `${l.short}@${l.elev}/${l.height}`).join(' '), 'theme', ls[1]?.theme?.label || '');
}
// site roads near A east side and H south
for (const r of L.site.roads || []) { const xs = (r.poly || []).map(p => p[0]), zs = (r.poly || []).map(p => p[1]); if (!xs.length) continue; const bb = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)].map(v => +v.toFixed(1)); if ((bb[0] < 20 && bb[2] > -60 && bb[1] < -170 && bb[3] > -260) || (bb[0] < -200 && bb[2] > -300 && bb[1] < -40 && bb[3] > -110)) console.log('road', r.id, r.name || '', JSON.stringify(bb)); }
for (const s of L.site.sidewalks || []) { const P = s.poly || []; if (!P.length) continue; const xs = P.map(p => p[0]), zs = P.map(p => p[1]); const bb = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)].map(v => +v.toFixed(1)); if (bb[0] < 20 && bb[2] > -20 && bb[1] < -170 && bb[3] > -260) console.log('sidewalk', s.id, JSON.stringify(bb)); }
const lot = L.extensions.surfaceParking.find(l => l.id === 'hotel-shared-parking');
console.log('hotel lot stalls', lot.stalls.length, 'north row', lot.stalls.filter(s => s.z < -50).length, 'types', JSON.stringify(lot.stalls.reduce((m, s) => (m[s.type] = (m[s.type] || 0) + 1, m), {})));
const H = L.buildings.find(b => b.id === 'H'), A = L.buildings.find(b => b.id === 'A');
console.log('H plot', JSON.stringify(H.plot), 'A plot', JSON.stringify(A.plot));
console.log('categories', JSON.stringify(L.categories).slice(0, 600));
