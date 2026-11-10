import { buildLayout } from '/home/user/super-mall-3d/src/layout/layout.js';
const L = buildLayout({ expansion: true });
const want = process.argv.slice(2);
for (const lv of L.levels) {
  if (!want.includes(lv.id)) continue;
  console.log('LEVEL', lv.id, lv.building, lv.short, 'elev', lv.elev, 'h', lv.height, Object.keys(lv).join(','));
  for (const u of lv.units || []) {
    if (!u.residence) continue;
    const r = u.residence;
    console.log(' unit', u.id, u.code, 'slot', u.slot, 'frame', JSON.stringify({ox:u.frame.ox,oz:u.frame.oz,deg:u.frame.deg}), 'poly', JSON.stringify(u.polys[0].map(p=>p.map(v=>+v.toFixed(2)))));
    console.log('   res keys', Object.keys(r).join(','));
    console.log('   type', r.type, r.plan, r.label, 'w', r.width, 'd', r.depth, 'home', r.home, r.homeLevels, 'level', r.level, 'ext', JSON.stringify(r.exteriorSides));
    for (const rm of r.rooms) console.log('    room', rm.id, rm.kind, rm.name, JSON.stringify(rm.rect), rm.windows ? JSON.stringify(rm.windows).slice(0,200) : '');
  }
}
