import { buildLayout } from '/home/user/super-mall-3d/src/layout/layout.js';
const L = buildLayout({ expansion: true });
const lot = L.extensions.surfaceParking.find(l => l.id === 'hotel-shared-parking');
const rows = {};
for (const s of lot.stalls) {
  const xs = s.poly.map(p => p[0]), zs = s.poly.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const inHS = cx > -284 && cx < -218 && cz > -57.15 && cz < -47.15;
  (rows[s.row || s.rowId || (cz < -49 ? 'N' : 'S')] ||= []).push([+cx.toFixed(1), +cz.toFixed(1), inHS]);
}
for (const [k, v] of Object.entries(rows)) console.log(k, v.length, 'inHS', v.filter(r => r[2]).length, JSON.stringify(v.map(r => r[0])));
console.log('keys', Object.keys(lot.stalls[0]));
