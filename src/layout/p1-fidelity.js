// Concept A fidelity (tour only): roof-level forms read from the approved
// aerial. The 06 dome and the 01 square canopy stand on columns above the
// existing roof deck, so floors, tenants, cores and escalators are unchanged;
// their columns are the only new solids walkers meet on the roof.
import { IDENTITY, rect, rectPoly, toW } from './geom.js';

export const ART_DOME = { id: 'P1-ART-DOME', cx: -106, cz: -106, radius: 30, spring: 4.2, rise: 15.5, columns: 12, columnRadius: .45 };
// Columns sit inside the 6F/RF setback cut (z=-180) and clear the escalator pavilion and cinema.
export const SQUARE_CANOPY = { id: 'P1-SQ-CANOPY', rect: rect(-258, -218, -192, -182), eave: 6.6, ridge: 11.2, columnRadius: .35 };
// North-wing axis in wing-local coordinates: a raised glazed ridge with trees either side.
export const NORTH_CANYON = { id: 'P1-N-CANYON', rect: rect(44, -3, 84, 3), trees: { from: 47, to: 82, step: 7, v: 5.5 } };

// Roof features carry their own wing/square frame; compare in world metres.
const near = (f, x, z, d = .5) => { if (f.lu === undefined) return false; const [wx, wz] = toW(f.frame, f.lu, f.lv); return Math.hypot(wx - x, wz - z) < d; };

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
  const wing = id => P1.wings.find(w => w.id === id);
  const W = wing('W'), N = wing('N');
  const dome = domeColumns(), canopy = canopyColumns();
  rf.features.push({ type: 'art-dome', frame: IDENTITY, ...ART_DOME, columnsAt: dome, name: '云澜光穹', en: 'YUNLAN ART DOME' });
  rf.features.push({ type: 'glass-canopy', frame: IDENTITY, ...SQUARE_CANOPY, columnsAt: canopy, name: '方庭玻璃天幕', en: 'SQUARE GLASS CANOPY' });
  // The concept aerial has no ferris wheel; its axis becomes the canyon skylight.
  rf.features = rf.features.filter(f => !['ferris', 'ferris-platform'].includes(f.type));
  rf.features.push({ type: 'canyon-skylight', frame: N.F, rect: NORTH_CANYON.rect, id: NORTH_CANYON.id, name: '北翼采光峡谷' });
  const t = NORTH_CANYON.trees;
  for (let u = t.from; u <= t.to; u += t.step) for (const v of [-t.v, t.v]) rf.features.push({ type: 'tree', frame: N.F, lu: u, lv: v });
  // Make room under and beside the new structures.
  const moved = { 'cinema-open': rect(-190, -222, -166, -190), viewdeck: rect(-239, -228, -213, -219.5) };
  for (const f of rf.features) {
    if (moved[f.type]) Object.assign(f, { frame: IDENTITY, rect: moved[f.type] });
    if (f.type === 'playground' && f.frame === W.F) f.rect = rect(33, -20, 45, -9);
  }
  const clear = [[-206, -182], [-230, -220], toW(W.F, 44, -9)];
  rf.features = rf.features.filter(f => !(f.type === 'tree' && clear.some(([x, z]) => near(f, x, z))));
  rf.navObstacles ||= [];
  for (const [x, z] of dome) rf.navObstacles.push({ id: `${ART_DOME.id}-column`, poly: rectPoly(rect(x - ART_DOME.columnRadius, z - ART_DOME.columnRadius, x + ART_DOME.columnRadius, z + ART_DOME.columnRadius)) });
  for (const [x, z] of canopy) rf.navObstacles.push({ id: `${SQUARE_CANOPY.id}-column`, poly: rectPoly(rect(x - SQUARE_CANOPY.columnRadius, z - SQUARE_CANOPY.columnRadius, x + SQUARE_CANOPY.columnRadius, z + SQUARE_CANOPY.columnRadius)) });
  layout.fidelity = { version: 1, dome: ART_DOME.id, canopy: SQUARE_CANOPY.id, canyon: NORTH_CANYON.id };
  return layout;
}
