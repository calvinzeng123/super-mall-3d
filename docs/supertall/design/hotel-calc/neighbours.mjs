// P1 outline near H/A, annexes, P1 roof zones. Usage: node neighbours.mjs <worktree>
const wt = process.argv[2];
const { buildLayout } = await import(`${wt}/src/layout/layout.js`);
const L = buildLayout({ expansion: true });
const pb = P => { const xs = P.map(p => p[0]), zs = P.map(p => p[1]); return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)].map(v => +v.toFixed(2)); };
const lv = id => L.levels.filter(l => l.building === id).sort((a, b) => a.elev - b.elev);
for (const b of L.buildings.filter(b => ['annex', 'mall', 'street', 'metro'].includes(b.kind) || /^P1/.test(b.id))) {
  const ls = lv(b.id), top = ls.length ? Math.max(...ls.map(l => l.elev + (l.height || 0))) : null;
  console.log(b.id, b.kind, b.name, 'bbox', JSON.stringify(b.outline ? pb(b.outline) : null), 'levels', ls.map(l => l.short).join(','), 'top', top, 'height', b.height, 'attachedTo', b.attachedTo || b.parent || '');
}
const P1 = L.buildings.find(b => b.id === 'P1');
console.log('P1 outline vertices', P1.outline.length);
// P1 outline vertices within 40 m of H east face (x -210) and A west face (x -54)
console.log('P1 pts near H', JSON.stringify(P1.outline.filter(p => p[0] > -215 && p[0] < -170 && p[1] > -130 && p[1] < -30).map(p => p.map(v => +v.toFixed(2)))));
console.log('P1 pts near A', JSON.stringify(P1.outline.filter(p => p[0] > -110 && p[0] < -50 && p[1] > -260 && p[1] < -150).map(p => p.map(v => +v.toFixed(2)))));
const rf = lv('P1').find(l => l.short === 'RF');
const zones = (rf.walk || []).map(w => `${w.id}:${w.kind}:${JSON.stringify(w.poly ? pb(w.poly) : w.rect)}`);
console.log('P1-RF walks', zones.join('\n  '));
console.log('P1-RF features', [...new Set((rf.features || []).map(f => f.kind || f.type))].join(','));
const roofscape = L.fidelity?.roofscape || L.site?.features?.filter?.(f => /roof|deck|garden/i.test(f.id || f.kind || ''));
console.log('roofscape-ish', JSON.stringify(roofscape)?.slice(0, 800));
// fire access records
console.log('fireAccess', JSON.stringify(L.site.fireAccess)?.slice(0, 1500));
