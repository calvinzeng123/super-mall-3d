// Concept A fidelity (tour only): roof-level forms read from the approved
// aerial. The 06 dome and the 01 square canopy stand on columns above the
// existing roof deck, so floors, tenants, cores and escalators are unchanged;
// their columns are the only new solids walkers meet on the roof. Roof gardens
// and annex roofs live in p1-roofscape.js, the ground landscape in p1-landscape.js.
import { IDENTITY, rect, rectPoly, toW, lrectPoly } from './geom.js';
import { planRoofGarden, planAnnexRoofs } from './p1-roofscape.js';
import { planP1Landscape } from './p1-landscape.js';

export const ART_DOME = { id: 'P1-ART-DOME', cx: -106, cz: -106, radius: 30, spring: 4.2, rise: 15.5, columns: 12, columnRadius: .45 };
// Columns sit inside the 6F/RF setback cut (z=-180) and clear the escalator pavilion and cinema.
export const SQUARE_CANOPY = { id: 'P1-SQ-CANOPY', rect: rect(-258, -218, -192, -182), eave: 6.6, ridge: 11.2, columnRadius: .35 };
// North-wing axis in wing-local coordinates: a raised glazed ridge with trees either side.
export const NORTH_CANYON = { id: 'P1-N-CANYON', rect: rect(44, -3, 84, 3), trees: { from: 47, to: 82, step: 7, v: 5.5 } };

export function domeColumns(d = ART_DOME) {
  // 30° spacing puts each wing axis (45°, 165°, 225°, 285°) midway between two columns.
  return Array.from({ length: d.columns }, (_, i) => {
    const a = i * 2 * Math.PI / d.columns;
    return [d.cx + d.radius * Math.cos(a), d.cz + d.radius * Math.sin(a)];
  });
}

export function canopyColumns(c = SQUARE_CANOPY) {
  const r = c.rect, out = [];
  for (let k = 0; k <= 6; k++) for (const z of [r.z0, r.z1]) out.push([r.x0 + (r.x1 - r.x0) * k / 6, z]);
  for (const x of [r.x0, r.x1]) for (const z of [-206, -194]) out.push([x, z]);
  return out;
}

export function applyP1Fidelity(layout) {
  const rf = layout.levels.find(l => l.id === 'P1-RF');
  const P1 = layout.buildings.find(b => b.id === 'P1');
  roofForms(rf, P1);
  // Pale stone pavers replace the orange timber deck; timber stays under seating.
  rf.theme = { ...rf.theme, floor: 'roof-stone', label: '天台花园 · 餐吧 · 云澜光穹' };
  planRoofGarden(rf, P1, { dome: ART_DOME, canopy: SQUARE_CANOPY.rect });
  for (const lv of layout.levels.filter(l => l.kind === 'roof' && l.expansion && l.building !== 'P1'))
    lv.theme = { ...lv.theme, floor: lv.expansion.zone === 'creative' ? 'wood-warm' : 'roof-stone' };
  layout.fidelity = { version: 1, dome: ART_DOME.id, canopy: SQUARE_CANOPY.id, canyon: NORTH_CANYON.id };
  layout.fidelity.billboards = placeBillboards(P1);
  planAnnexRoofs(layout);
  layout.fidelity.landscape = planP1Landscape(layout, P1);
  return layout;
}

/** Dome, canopy and canyon on the main roof; the ferris wheel goes, and the
 * cinema, view deck, playground and three trees move out of their way. */
function roofForms(rf, P1) {
  const wing = id => P1.wings.find(w => w.id === id), W = wing('W'), N = wing('N');
  const dome = domeColumns(), canopy = canopyColumns();
  rf.features.push({ type: 'art-dome', frame: IDENTITY, ...ART_DOME, columnsAt: dome, name: '云澜光穹', en: 'YUNLAN ART DOME' });
  rf.features.push({ type: 'glass-canopy', frame: IDENTITY, ...SQUARE_CANOPY, columnsAt: canopy, name: '方庭玻璃天幕', en: 'SQUARE GLASS CANOPY' });
  // The concept aerial has no ferris wheel; its axis becomes the canyon skylight.
  rf.features = rf.features.filter(f => !['ferris', 'ferris-platform'].includes(f.type));
  rf.features.push({ type: 'canyon-skylight', frame: N.F, rect: NORTH_CANYON.rect, id: NORTH_CANYON.id, name: '北翼采光峡谷' });
  const t = NORTH_CANYON.trees;
  for (let u = t.from; u <= t.to; u += t.step) for (const v of [-t.v, t.v]) rf.features.push({ type: 'tree', frame: N.F, lu: u, lv: v });
  const moved = { 'cinema-open': rect(-190, -222, -166, -190), viewdeck: rect(-239, -228, -213, -219.5) };
  for (const f of rf.features) {
    if (moved[f.type]) Object.assign(f, { frame: IDENTITY, rect: moved[f.type] });
    if (f.type === 'playground' && f.frame === W.F) f.rect = rect(33, -20, 45, -9);
  }
  // Roof trees carry their own wing/square frame; compare in world metres.
  const clear = [[-206, -182], [-230, -220], toW(W.F, 44, -9)];
  const near = f => f.lu !== undefined && clear.some(([x, z]) => { const [wx, wz] = toW(f.frame, f.lu, f.lv); return Math.hypot(wx - x, wz - z) < .5; });
  rf.features = rf.features.filter(f => !(f.type === 'tree' && near(f)));
  const column = (id, [x, z], r) => ({ id, poly: rectPoly(rect(x - r, z - r, x + r, z + r)) });
  rf.navObstacles ||= [];
  for (const p of dome) rf.navObstacles.push(column(`${ART_DOME.id}-column`, p, ART_DOME.columnRadius));
  for (const p of canopy) rf.navObstacles.push(column(`${SQUARE_CANOPY.id}-column`, p, SQUARE_CANOPY.columnRadius));
}

/** Wing-end and square posters seen in the aerial; each hangs 0.6 m proud of a real
 * facade. Wing ends are flat for |v| ≤ 17; the W poster clears the hotel bridge
 * (v ±4) and the SE poster sits above the 3F LED screen. */
export const BILLBOARDS = [
  { id: 'W-end', wing: 'W', v0: -16.6, v1: -6.6, y0: 12.6, y1: 26.4, title: '云澜艺术季', sub: 'YUNLAN ART SEASON', a: '#5d3426', b: '#d9a24a' },
  { id: 'SE-end', wing: 'SE', v0: 6.6, v1: 16.6, y0: 17.8, y1: 31, title: '城市客厅', sub: 'CITY LIVING ROOM', a: '#1f3a34', b: '#c9a46a' },
  { id: 'SQ-south', x0: -279, x1: -269, z: -160, y0: 4, y1: 16, title: '方庭设计市集', sub: 'SQUARE DESIGN MARKET', a: '#3b2a17', b: '#e0b77a' },
];
function placeBillboards(P1) {
  return BILLBOARDS.map(b => {
    if (b.wing) {
      const w = P1.wings.find(x => x.id === b.wing), v = (b.v0 + b.v1) / 2;
      const [x, z] = toW(w.F, w.uEnd + .6, v);
      return { ...b, x, z, nx: w.F.c, nz: w.F.s, width: b.v1 - b.v0, height: b.y1 - b.y0, face: lrectPoly(w.F, rect(w.uEnd - .01, b.v0, w.uEnd + .01, b.v1)) };
    }
    return { ...b, x: (b.x0 + b.x1) / 2, z: b.z + .6, nx: 0, nz: 1, width: b.x1 - b.x0, height: b.y1 - b.y0, face: rectPoly(rect(b.x0, b.z - .01, b.x1, b.z + .01)) };
  });
}
