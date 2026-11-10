// Separation of the proposed tower parts (above the 1F–2F podium) from every neighbouring outline. Usage: node gaps.mjs <worktree>
const wt = process.argv[2];
const { buildLayout } = await import(`${wt}/src/layout/layout.js`);
const L = buildLayout({ expansion: true });
const segDist = (p, a, b) => { const dx = b[0]-a[0], dz = b[1]-a[1], l2 = dx*dx+dz*dz; const t = l2 ? Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l2)) : 0; return Math.hypot(p[0]-a[0]-dx*t, p[1]-a[1]-dz*t); };
const polyDist = (P, Q) => { let m = Infinity; for (const p of P) for (let i = 0; i < Q.length; i++) m = Math.min(m, segDist(p, Q[i], Q[(i+1)%Q.length])); for (const q of Q) for (let i = 0; i < P.length; i++) m = Math.min(m, segDist(q, P[i], P[(i+1)%P.length])); return m; };
const box = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const towers = { 'H tower 66×32 (3F+)': box(-284, -94.15, -218, -62.15), 'H podium 1F–2F': box(-284, -100.15, -210, -62.15),
  'A tower 31.8×66 (3F+)': box(-47.8, -247, -16, -181), 'A podium 1F–2F': box(-54, -251, -16, -177) };
const top = id => Math.max(...L.levels.filter(l => l.building === id && l.kind === 'roof').map(l => l.elev), 0);
for (const [name, P] of Object.entries(towers)) {
  const rows = L.buildings.filter(b => b.outline && !b.undergroundOnly && !['H', 'A'].includes(b.id)).map(b => [b.id, +polyDist(P, b.outline).toFixed(2), top(b.id)]).sort((a, z) => a[1] - z[1]).slice(0, 6);
  console.log(name.padEnd(24), rows.map(([id, d, h]) => `${id} ${d} m (roof ${h})`).join(' | '));
}
// the hotel lot stalls under the proposed south hardstand z[-57.15,-47.15], x[-284,-218]
const lot = L.extensions.surfaceParking.find(l => l.id === 'hotel-shared-parking');
const hs = s => s.x > -284 && s.x < -218 && s.z > -57.15 - 2.5 && s.z < -47.15 + 2.5 && Math.abs(s.z + 52.15) < 5 + s.d / 2;
console.log('hotel lot stalls', lot.stalls.length, 'under the H hardstand', lot.stalls.filter(hs).length);
// 星湾路 / sidewalk east of A
for (const r of L.site.roads) if (r.id === 'xingwan') console.log('星湾路 x', JSON.stringify([Math.min(...r.poly.map(p => p[0])), Math.max(...r.poly.map(p => p[0]))]));
