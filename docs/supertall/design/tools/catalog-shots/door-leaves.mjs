// node door-leaves.mjs [levelIds...]  — where each community door leaf is drawn (mirrors
// communityHome() in residence-interiors.js: open 90 deg, hinge at d0+.03, on the (dz,-dx) side of a->b).
import { buildLayout } from '/home/user/super-mall-3d/src/layout/layout.js';
const L = buildLayout({ expansion: true });
const ids = process.argv.slice(2);
const PRIV = new Set(['bedroom', 'bathroom', 'kitchen', 'storage', 'closet', 'study', 'laundry', 'powder']);
const toW = (F, u, v) => [F.ox + u * F.c - v * F.s, F.oz + u * F.s + v * F.c];
const seen = new Set(); let n = 0, bad = 0; const byKind = {};
for (const lv of L.levels) {
  if (ids.length ? !ids.includes(lv.id) : !/^(W1|W2|T1|T2)-/.test(lv.id)) continue;
  for (const u of lv.units || []) {
    const res = u.residence; if (!res) continue;
    if (seen.has(res.plan) && !ids.length) continue; seen.add(res.plan);
    for (const p of res.partitions) {
      if (!p.door || ['opening', 'railing', 'balcony-slider'].includes(p.role)) continue;
      const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]), dx = (p.b[0] - p.a[0]) / len, dz = (p.b[1] - p.a[1]) / len;
      const d0 = Math.max(0, p.door.at - p.door.width / 2), d1 = Math.min(len, p.door.at + p.door.width / 2), w = d1 - d0 - .06;
      const hx = p.a[0] + dx * (d0 + .03), hz = p.a[1] + dz * (d0 + .03), cx = hx + dz * w / 2, cz = hz - dx * w / 2;
      const room = res.rooms.find((r) => cx > r.rect.x0 && cx < r.rect.x1 && cz > r.rect.z0 && cz < r.rect.z1);
      const [A, B] = p.id.split('/'), ra = res.rooms.find((r) => r.id === A), rb = res.rooms.find((r) => r.id === B);
      const served = ra && PRIV.has(ra.kind) && !(rb && PRIV.has(rb.kind)) ? ra : rb && PRIV.has(rb.kind) && !(ra && PRIV.has(ra.kind)) ? rb : null;
      const intoPublic = served && room && room.id !== served.id;
      const span = room ? (Math.abs(dz) > .5 ? room.rect.x1 - room.rect.x0 : room.rect.z1 - room.rect.z0) : 0; // room width along the leaf
      n++;
      const k = intoPublic ? `into ${room.kind}` : 'into served room';
      byKind[k] = (byKind[k] || 0) + 1;
      if (intoPublic || ids.length) {
        if (intoPublic) bad++;
        const [wx, wz] = toW(u.frame, cx, cz);
        console.log(`${lv.id} ${u.id} plan=${res.plan} door ${p.id} (${p.role}) leaf ${w.toFixed(2)}m stands in ${room?.id}(${room?.name}) ${intoPublic ? '<-- not the room it serves (' + served.name + ')' : ''}  leaf centre local (${cx.toFixed(2)},${cz.toFixed(2)}) world (${wx.toFixed(2)},${wz.toFixed(2)}) y=${lv.elev}+1.05; room depth along leaf ${span.toFixed(2)}m`);
      }
    }
  }
}
console.log('leaves', n, 'standing outside the room they serve', bad, JSON.stringify(byKind));
