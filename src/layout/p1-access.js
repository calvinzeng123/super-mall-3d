// Phase-one vehicle access for the full tour (concept A fidelity pass).
// Two shared-garage ramp pairs reach P1-B1 straight from 北外环 and 星湾路;
// the west surface lot gains gates on its north and south streets. A ramp is
// open only until its surface is 3.05 m below grade; beyond that the plaza
// continues over a covered tunnel, as at the surveyed hotel and apartment gates.
import { IDENTITY, frame, rect, rectPoly, lrectPoly, toW, polyBounds, convexOverlap } from './geom.js';
import { subtractRect } from './urban.js';

const DECK = 'P1-B1', DECK_Y = -8.4, OPEN_DEPTH = 3.05, SLAB_DEPTH = 4.1;

/** street: ground-level end; deck: arrival on P1-B1. gate.side puts the
 * ticket post and booth on the outer side of a paired lane. */
export const P1_GARAGE_RAMPS = [
  { id: 'P1-N-IN', quadrant: '方庭北口', street: [-166, -252.75], deck: [-226, -252.75], width: 5.5, gate: { side: -1, booth: false, sign: -1 } },
  { id: 'P1-N-OUT', quadrant: '方庭北口', out: true, street: [-166, -246.75], deck: [-226, -246.75], width: 5.5, gate: { side: 1, booth: false, sign: 1 } },
  { id: 'P1-E-IN', quadrant: '星湾东口', street: [-19, -90.5], deck: [-19, -34.5], width: 5, gate: { side: 1, booth: false, sign: 1 } },
  { id: 'P1-E-OUT', quadrant: '星湾东口', out: true, street: [-24.5, -90.5], deck: [-24.5, -34.5], width: 5, gate: { side: -1, booth: true, sign: -1 } },
];
// Right-in/right-out aprons from the street edge to both lane heads.
const APRONS = [rect(-167, -256, -155, -244), rect(-27.3, -97.5, -10, -90.5)];
// Deck lanes joining each ramp foot to the existing aisle grid. The east foot
// turns west along the deck edge and meets the z=-39 aisle short of the SE stair core.
const ARRIVALS = [
  { id: 'P1-N-arrival', rect: rect(-240, -255.5, -226, -242.5) },
  { id: 'P1-E-arrival', rect: rect(-27.3, -34.5, -16, -29) },
  { id: 'P1-E-arrival-west', rect: rect(-56, -36, -27.3, -29) },
];

export const WEST_LOT_GATES = [
  { id: 'WP-G4', name: '北环西口', x: -422, street: -256, lot: -246, z: -251 },
  { id: 'WP-G5', name: '北环东口', x: -375, street: -256, lot: -246, z: -251 },
  { id: 'WP-G6', name: '大道口', x: -375, street: -14, lot: -37, z: -28 },
];

const seg = (F, u0, v0, u1, v1) => { const [x0, z0] = toW(F, u0, v0), [x1, z1] = toW(F, u1, v1); return { x0, z0, x1, z1 }; };

function addGarageRamps(layout) {
  const deck = layout.levels.find(l => l.id === DECK);
  const under = [];
  deck.navWalls ||= [];
  for (const d of P1_GARAGE_RAMPS) {
    const [sx, sz] = d.street, [dx, dz] = d.deck, len = Math.hypot(dx - sx, dz - sz);
    const F = frame(sx, sz, Math.atan2(dz - sz, dx - sx) * 180 / Math.PI, d.id);
    const half = d.width / 2, open = len * OPEN_DEPTH / -DECK_Y, deep = len * SLAB_DEPTH / -DECK_Y;
    const street = { x: sx, z: sz, y: 0, level: 'street' }, low = { x: dx, z: dz, y: DECK_Y, level: DECK };
    const lane = rect(0, -half, len, half), trench = lrectPoly(F, rect(0, -half, open, half));
    layout.ramps.push({
      id: d.id, building: 'P1', type: d.out ? 'street-out' : 'street-in', name: `${d.quadrant} ${d.out ? '出口' : '入口'}`,
      frame: F, lane, poly: lrectPoly(F, lane), width: d.width, from: d.out ? low : street, to: d.out ? street : low,
      sharedGarage: true, quadrant: d.quadrant, headroom: 2.8, groundOpening: trench, gate: d.gate,
      cover: { open, deep, length: len }, expansion: true,
    });
    layout.site.trenches.push(trench);
    // Where the slab drops into the deck storey nobody walks beneath it; the
    // low end stays open onto the arrival lane.
    under.push(lrectPoly(F, rect(deep, -half - .3, len, half + .3)));
    for (const v of [-half - .15, half + .15]) deck.navWalls.push(seg(F, deep, v, len - .2, v));
    deck.navWalls.push(seg(F, deep, -half - .15, deep, half + .15));
  }
  for (const r of APRONS) layout.site.driveways.push(rectPoly(r));
  const cuts = [...under, ...ARRIVALS.map(a => rectPoly(a.rect))];
  deck.parking.stalls = deck.parking.stalls.filter(s => !cuts.some(c => convexOverlap(s.poly, c)));
  deck.parking.columns = deck.parking.columns.filter(c => !cuts.some(p =>
    convexOverlap(lrectPoly(c.frame, rect(c.lx - .4, c.lz - .4, c.lx + .4, c.lz + .4)), p)));
  // Shared aisles are world rectangles; trim them where a slab now stands.
  const blocked = under.map(polyBounds);
  deck.walk = deck.walk.flatMap(w => {
    if (!w.rect || w.frame !== IDENTITY || !blocked.some(b => convexOverlap(w.poly, rectPoly(b)))) return [w];
    let pieces = [w.rect];
    for (const b of blocked) pieces = pieces.flatMap(p => subtractRect(p, b));
    return pieces.filter(p => p.x1 - p.x0 >= 1.2 && p.z1 - p.z0 >= 1.2)
      .map((p, i) => ({ ...w, id: `${w.id}-ramp-${i}`, rect: p, poly: rectPoly(p) }));
  });
  for (const a of ARRIVALS) deck.walk.push({ id: a.id, kind: 'aisle', frame: IDENTITY, rect: a.rect, poly: rectPoly(a.rect), dir: [1, 0] });
  deck.parking.aisles = deck.walk.filter(w => w.kind === 'aisle');
  layout.sharedGarages?.rampIds.push(...P1_GARAGE_RAMPS.map(d => d.id));
}

function addWestLotGates(layout) {
  const plan = layout.site.westParking, ext = layout.extensions;
  if (!plan) return;
  for (const g of WEST_LOT_GATES) {
    const r = rect(g.x - 3.5, Math.min(g.street, g.lot), g.x + 3.5, Math.max(g.street, g.lot)), poly = rectPoly(r);
    // Facing points from the gantry to the public street.
    plan.gates.push({ id: g.id, name: g.name, x: g.x, z: g.z, width: 7, facing: [0, Math.sign(g.street - g.lot)] });
    layout.site.driveways.push(poly);
    const road = { id: `west-gate-${g.id}`, name: '西侧停车场城市道路接入', width: 7, points: [[g.x, 0, g.street], [g.x, 0, g.lot]], polys: [poly] };
    ext.roads.push(road); plan.roads.push(road);
  }
}

export function applyP1VehicleAccess(layout) {
  addGarageRamps(layout);
  addWestLotGates(layout);
  return layout;
}
