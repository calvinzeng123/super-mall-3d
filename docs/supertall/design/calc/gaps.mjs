const root = process.argv[2];
const { buildLayout } = await import(root + '/src/layout/layout.js');
const L = buildLayout({ expansion: true });
const B = Object.fromEntries(L.buildings.map(b => [b.id, b]));
const segs = (P) => P.map((p, i) => [p, P[(i + 1) % P.length]]);
const pt = (p) => Array.isArray(p) ? p : [p.x, p.z];
const dps = (p, a, b) => { const [px, pz] = p, [ax, az] = a, [bx, bz] = b; const dx = bx-ax, dz = bz-az; const t = Math.max(0, Math.min(1, ((px-ax)*dx + (pz-az)*dz) / (dx*dx + dz*dz || 1))); return Math.hypot(px - ax - t*dx, pz - az - t*dz); };
const dist = (P, Q) => { P = P.map(pt); Q = Q.map(pt); let m = Infinity; for (const p of P) for (const [a, b] of segs(Q)) m = Math.min(m, dps(p, a, b)); for (const q of Q) for (const [a, b] of segs(P)) m = Math.min(m, dps(q, a, b)); return m; };
const outlineOf = (b) => b.outline || (b.bounds && [[b.bounds.x0,b.bounds.z0],[b.bounds.x1,b.bounds.z0],[b.bounds.x1,b.bounds.z1],[b.bounds.x0,b.bounds.z1]]);
const pairs = [['H','P1'],['A','P1'],['T1','T2'],['R1','R2'],['W1','W2'],['W2','WPG'],['A','R1'],['H','WPG'],['W2','P1'],['A','T2']];
for (const [a, c] of pairs) { if (!B[a] || !B[c]) { console.log(a, c, 'missing'); continue; } console.log(a, c, dist(outlineOf(B[a]), outlineOf(B[c])).toFixed(2)); }
console.log('P1 height', B.P1?.height, 'P1 bounds', JSON.stringify(B.P1?.bounds));
