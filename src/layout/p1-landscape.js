// Concept A ground landscape (tour only): court fountains with sculptures, the
// SE seating steps, street tree belts, the sunken-court canopy sculpture and
// the hotel drop-off loop. Each solid piece is a forecourt obstacle.
import { rect, rectPoly, toW, lrectPoly, circlePoly, ellipsePoly, convexOverlap, polysOverlap } from './geom.js';

export const COURT_FOUNTAINS = [
  { id: 'court-north', name: '北庭艺术喷泉', x: -128, z: -184, r: 6, sculpture: 10 },
  { id: 'court-west', name: '西庭镜面水院', x: -188, z: -132, r: 5, sculpture: 8 },
];
export const CANOPY_SCULPTURE = { id: 'sunken-canopy', name: '云伞', x: -108.5, z: -59.2, height: 11.5, crown: 7.5 };

export function planP1Landscape(layout, P1) {
  const S = layout.site, fc = S.forecourt, SE = P1.wings.find(w => w.id === 'SE');
  const block = (id, poly) => fc.obstacles.push({ id, poly });
  const out = { fountains: [], steps: null, trees: [], sculpture: null, hotelLoop: null };
  for (const f of COURT_FOUNTAINS) { const poly = circlePoly(f.x, f.z, f.r + .4, 20); out.fountains.push({ ...f, poly }); block(f.id, poly); }
  // Seating steps on the north-east half of the SE end face, clear of the main door and metro exit A.
  const stepsRect = rect(SE.uEnd + 2, -21, SE.uEnd + 9, -10), steps = lrectPoly(SE.F, stepsRect);
  out.steps = { id: 'SE-steps', name: '东南大台阶', frame: SE.F, rect: stepsRect, tiers: 3, poly: steps };
  block('SE-steps', steps);
  out.trees = treeBelts(layout, SE, [...out.fountains.map(f => f.poly), steps]);
  for (const t of out.trees) block(`belt-tree-${t.x.toFixed(1)}-${t.z.toFixed(1)}`, rectPoly(rect(t.x - .45, t.z - .45, t.x + .45, t.z + .45)));
  // Tree-canopy sculpture beside the sunken amphitheatre (base stays on solid ground).
  const c = CANOPY_SCULPTURE;
  out.sculpture = { ...c };
  block(c.id, circlePoly(c.x, c.z, 1.1, 12));
  out.hotelLoop = hotelDropOff(layout, block);
  return out;
}

/** Avenue and 星湾路 belts every 8 m plus a grove on the SE plaza, wherever
 * a 2.6 m tree pit misses buildings, ramps, gates, crossings, paths and kiosks. */
function treeBelts(layout, SE, taken) {
  const S = layout.site, fc = S.forecourt;
  // Building outlines are concave (the Y-shaped mall), so they get the exact test.
  const outlines = layout.buildings.filter(b => !b.undergroundOnly && b.kind !== 'metro').map(b => b.outline);
  const solids = [...S.trenches, ...S.openings, ...S.driveways, ...(S.crossings || []).map(c => c.poly),
    // The avenue belt is planted inside the south promenade, so that path is not a solid.
    ...fc.paths.filter(p => p.id !== 'south-promenade').flatMap(p => p.polys), ...fc.obstacles.map(o => o.poly),
    ...layout.extensions.paths.filter(p => p.kind === 'ground').flatMap(p => p.polys),
    ...layout.levels.flatMap(l => l.garageKiosks || []).map(k => k.poly),
    ...layout.entrances.filter(e => e.kiosk).map(e => e.kiosk.poly),
    ...layout.extensions.surfaceParking.map(l => l.poly), ...layout.bridges.supports.map(s => rectPoly(rect(s.x - 1.2, s.z - 1.2, s.x + 1.2, s.z + 1.2))),
    ...taken];
  const ok = (x, z) => { const p = rectPoly(rect(x - 1.3, z - 1.3, x + 1.3, z + 1.3));
    return !outlines.some(q => polysOverlap(q, p)) && !solids.some(q => convexOverlap(q, p)); };
  const trees = [];
  for (let x = -276; x <= -60; x += 8) if (ok(x, -21.4)) trees.push({ x, z: -21.4, s: 1.05 });
  for (let z = -172; z <= -26; z += 8) if (ok(-18.6, z)) trees.push({ x: -18.6, z, s: 1.05 });
  for (const [u, v] of [[SE.uEnd + 13, -18], [SE.uEnd + 13, -11], [SE.uEnd + 19, -18], [SE.uEnd + 19, -11]]) {
    const [x, z] = toW(SE.F, u, v);
    if (ok(x, z)) trees.push({ x, z, s: 1.15 });
  }
  return trees;
}

/** Hotel forecourt: the parking aisle becomes the north leg of a drop-off loop
 * round an oval planter; only the south-row bays inside the loop give way, so
 * the north short-stay row and the west bays stay (still ≥20 stalls). The loop
 * stops 3 m short of the lot's east edge, where the lot sign and lamp stand. */
function hotelDropOff(layout, block) {
  const lot = layout.extensions.surfaceParking.find(l => l.id === 'hotel-shared-parking');
  if (!lot) return null;
  const loop = { id: 'H-dropoff', name: '酒店落客环岛', rect: rect(-235.2, -46, -216.7, -31.5), corner: 5, cx: -225.95, cz: -38.75, planter: [4.25, 2.25] };
  loop.poly = rectPoly(loop.rect);
  loop.planterPoly = ellipsePoly(loop.cx, loop.cz, loop.planter[0], loop.planter[1], 28);
  lot.stalls = lot.stalls.filter(s => !convexOverlap(s.poly, loop.poly));
  block('H-dropoff-planter', loop.planterPoly);
  return loop;
}
