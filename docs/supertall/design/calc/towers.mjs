const root = process.argv[2];
const { buildLayout } = await import(root + '/src/layout/layout.js');
const L = buildLayout({ expansion: true });
const ids = ['T1','T2','W1','W2','R1','R2','R3','R4','H','A'];
const lv = new Map(L.levels.map(l => [l.id, l]));
for (const id of ids) {
  const b = L.buildings.find(x => x.id === id);
  if (!b) { console.log(id, 'missing'); continue; }
  const levels = b.levels.map(i => lv.get(i)).filter(Boolean);
  const above = levels.filter(l => l.elev >= 0 && l.kind !== 'roof');
  const rf = levels.find(l => l.kind === 'roof' || l.short === 'RF');
  const units = levels.reduce((s, l) => s + (l.units?.length || 0), 0);
  const homes = new Set(levels.flatMap(l => (l.units||[]).map(u => u.code || u.id))).size;
  const bb = b.bounds;
  const lifts = L.elevators.filter(e => e.building === id);
  const stairs = L.stairs.filter(s => s.building === id);
  console.log(JSON.stringify({ id, name: b.name, usage: b.usage, bounds: bb && { w: +(bb.x1-bb.x0).toFixed(2), d: +(bb.z1-bb.z0).toFixed(2), x0: bb.x0, z0: bb.z0, x1: bb.x1, z1: bb.z1 },
    nLevels: levels.length, lowest: levels[0]?.short, lowestElev: levels[0]?.elev, firstAbove: above[0]?.short, topFloor: above.at(-1)?.short, topFloorElev: above.at(-1)?.elev, topFloorH: above.at(-1)?.height,
    rf: rf && { short: rf.short, elev: rf.elev, h: rf.height }, unitsAllLevels: units, uniqueUnitCodes: homes,
    lifts: lifts.map(e => `${e.id}:${e.role || e.kind || ''}:${(e.serves||[]).length}`), stairs: stairs.length, stackedOn: b.stackedOn || null }));
}
