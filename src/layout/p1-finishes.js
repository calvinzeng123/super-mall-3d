// Phase-one finishes belong to the tour. Floor geometry, navigation and the
// compact FPS layout keep their existing dimensions and openings.
import polygonClipping from 'polygon-clipping';

// Imported diagonal slabs and shop bands can differ at floating-point epsilon.
// Snap decoration operands to 0.01mm, well below the original mesh precision,
// so coincident edges stay coincident during boolean operations.
const snap = points => typeof points === 'number' ? Math.round(points * 1e5) / 1e5 : points.map(snap);
export const finishClipping = Object.fromEntries(['union', 'intersection', 'difference'].map(op =>
  [op, (...polys) => polygonClipping[op](...polys.map(snap))]));
const clipping = finishClipping;

export function applyP1Finishes(layout) {
  const buildings = new Set(layout.buildings.filter(b => b.id === 'P1' || b.campusGroup === 'P1').map(b => b.id));
  layout.finishes = { ...layout.finishes, P1: { exterior: 'p1-paving', scheme: '云澜织境' } };
  for (const lv of layout.levels) {
    if (!buildings.has(lv.building) || !['retail', 'food'].includes(lv.kind)) continue;
    const zone = lv.expansion?.zone;
    const accent = zone === 'garden' || ['3F', '5F'].includes(lv.short) ? 'carpet-sage'
      : zone === 'dining' || zone === 'creative' || lv.kind === 'food' ? 'carpet-clay' : 'carpet-ocean';
    lv.finishes = { interior: 'carpet', field: 'carpet-linen', accent, border: 'carpet-flax', exterior: 'p1-paving' };
    lv.theme = { ...lv.theme, floor: lv.finishes.field };
  }
}

export const piecesToPolygons = pieces => pieces.map(p => [p.outer, ...(p.holes || [])]);
export const polygonsToPieces = polys => polys.map(([outer, ...holes]) => ({ outer, holes }));

/** Partition the real slab, including lift/stair/atrium holes. A setback is
 * outside its facade; a sunken courtyard is outside despite being below grade. */
export function floorFinishRegions(lv) {
  const slab = clipping.union(...piecesToPolygons(lv.slab.pieces));
  if (!lv.finishes) return { inside: slab, outside: [] };
  const envelopes = lv.expansion?.facadePolys;
  let inside = envelopes?.length ? clipping.intersection(slab, clipping.union(...envelopes.map(p => [p]))) : slab;
  const outdoor = lv.walk.filter(w => w.outdoor).map(w => [w.poly]);
  if (inside.length && outdoor.length) inside = clipping.difference(inside, ...outdoor);
  const outside = inside.length ? clipping.difference(slab, inside) : slab;
  return { inside, outside };
}
