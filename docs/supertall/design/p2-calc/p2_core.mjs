// Proposed R typical plate (tower-local, x east, z south, metres): rect overlap, areas, code distances,
// and which shipped 01/02/03 north-wall windows face open air, the enclosed band, or the core.
// usage: node p2_core.mjs <worktree>
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const W = process.argv[2];
const { RESIDENTIAL_PLAN_DATA: P } = await import(pathToFileURL(path.join(W, 'src/layout/residential-plan-data.js')).href);
const R = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 }), A = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const PLATE = {
  core: R(-8.8, -15.9, 8.8, -1.6),            // RC core (the old 03 north wing footprint)
  band: R(-12.0, -1.6, 12.0, 1.6),           // enclosed lift lobby + home corridor (候梯厅 / 入户走道)
  wingW: R(-19.4, 1.6, -1.8, 15.9),           // 03, or 01 + a 2.0 m louvred AC-platform strip x[-3.8,-1.8]
  wingE: R(3.8, 1.6, 19.4, 15.9),             // 02
};
const CORE = {
  ST1: R(-8.6, -15.7, -4.8, -7.0), ST2: R(4.8, -15.7, 8.6, -7.0),           // smoke-proof stairs, doors S at z -7.0
  LF: R(-1.4, -10.0, 1.4, -7.0),                                              // fire lift, door S into the 前室
  shaftW: R(-4.6, -15.7, -1.6, -7.0), shaftE: R(1.6, -15.7, 4.6, -7.0), shaftN: R(-1.4, -15.7, 1.4, -10.2),
  antechamber: R(-8.6, -7.0, 8.6, -4.6),                                      // 三合一前室 (stairs + fire lift)
  antechamberLeg: R(-8.6, -4.6, -4.3, -1.6),                                  // its door to the band at z -1.6
  L1: R(-4.1, -4.5, -1.5, -1.6), L2: R(-1.3, -4.5, 1.3, -1.6), L3: R(1.5, -4.5, 4.1, -1.6),   // passenger lifts, doors S
  riserE: R(4.3, -4.6, 8.6, -1.6),                                            // electrical / water risers
};
const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-6;
const inside = (o, i) => i.x0 >= o.x0 - 1e-6 && i.x1 <= o.x1 + 1e-6 && i.z0 >= o.z0 - 1e-6 && i.z1 <= o.z1 + 1e-6;
const ks = Object.keys(CORE); let bad = 0;
for (let i = 0; i < ks.length; i++) { if (!inside(PLATE.core, CORE[ks[i]])) { console.log('outside core', ks[i]); bad++; }
  for (let j = i + 1; j < ks.length; j++) if (overlap(CORE[ks[i]], CORE[ks[j]])) { console.log('overlap', ks[i], ks[j]); bad++; } }
console.log('core rect checks:', bad ? `${bad} problems` : 'ok');
const ante = A(CORE.antechamber) + A(CORE.antechamberLeg);
console.log(`areas m2: core ${A(PLATE.core).toFixed(1)}, band ${A(PLATE.band).toFixed(1)}, wings ${(A(PLATE.wingW) + A(PLATE.wingE)).toFixed(1)}, plate ${(A(PLATE.core) + A(PLATE.band) + A(PLATE.wingW) + A(PLATE.wingE)).toFixed(1)}`);
console.log(`三合一前室 ${ante.toFixed(1)} m2 (>= 12, short side ${Math.min(CORE.antechamber.z1 - CORE.antechamber.z0, 4.3).toFixed(1)} >= 2.4); lift lobby depth ${(PLATE.band.z1 - PLATE.band.z0).toFixed(1)} m (>= 1.5 x 2.1 car = 3.15)`);
console.log(`stair box ${(CORE.ST1.x1 - CORE.ST1.x0).toFixed(1)} x ${(CORE.ST1.z1 - CORE.ST1.z0).toFixed(1)} m (towerStairPlan needs depth >= 8.28 for a 5.4 m storey); stair doors ${(Math.abs(-6.7 - 6.7)).toFixed(1)} m apart (>= 5)`);
// Homes: x0 of each slot, entry door and north-wall windows (shipped plan data; 02 is a baked mirror).
const slots = [['01', -19.4, false], ['03', -19.4, false], ['02', 3.8, true]];
for (const [p, x0, mirrored] of slots) {
  const plan = P[p], north = plan.facadeWalls.find((w) => w.id === 'outer_north');
  const along = (at) => mirrored ? x0 + (north.a[0] - at) : x0 + north.a[0] + at - 0.1 + 0.1;
  const out = [];
  for (const o of north.openings) {
    const a = along(o.at - o.width / 2), b = along(o.at + o.width / 2), lo = Math.min(a, b), hi = Math.max(a, b);
    const where = hi <= PLATE.band.x0 + 1e-6 || lo >= PLATE.band.x1 - 1e-6 ? 'open air' : (lo >= PLATE.core.x0 && hi <= PLATE.core.x1 ? 'band (in front of core)' : 'band');
    out.push(`${o.type}[${lo.toFixed(2)},${hi.toFixed(2)}] ${where}`);
  }
  const door = plan.entryDoor, dx = x0 + door.at;   // entryDoor.at is already in the unit frame (02 baked mirror)
  console.log(`${p} @ x0 ${x0}: entry x ${dx.toFixed(2)} (band ${dx > PLATE.band.x0 && dx < PLATE.band.x1 ? 'ok' : 'MISSING'}), door->前室 door ~${Math.hypot(dx - (dx < 0 ? -6.9 : 6.9), 1.6 + 1.6).toFixed(1)} m, door->stair ~${Math.hypot(dx - (dx < 0 ? -6.7 : 6.7), 1.6 + 7.0).toFixed(1)} m`);
  console.log('   north wall:', out.join(' | '));
}
// Centroid vs core (eccentricity, rough: slabs 1.0, core counted at 3x for walls).
const parts = [[PLATE.wingW, 1], [PLATE.wingE, 1], [PLATE.band, 1], [PLATE.core, 1]];
const cz = (r) => (r.z0 + r.z1) / 2, m = parts.reduce((s, [r, w]) => s + A(r) * w, 0), zc = parts.reduce((s, [r, w]) => s + A(r) * w * cz(r), 0) / m;
console.log(`plate centroid z ${zc.toFixed(2)}, core centre z ${cz(PLATE.core).toFixed(2)} -> offset ${(zc - cz(PLATE.core)).toFixed(1)} m = ${((zc - cz(PLATE.core)) / 31.8 * 100).toFixed(0)} % of the 31.8 m depth`);
console.log(`core share of the storey: ${(A(PLATE.core) / (A(PLATE.core) + A(PLATE.band) + A(PLATE.wingW) + A(PLATE.wingE)) * 100).toFixed(0)} %; homes (inc. balconies) share ${((A(PLATE.wingW) + A(PLATE.wingE)) / (A(PLATE.core) + A(PLATE.band) + A(PLATE.wingW) + A(PLATE.wingE)) * 100).toFixed(0)} %`);
