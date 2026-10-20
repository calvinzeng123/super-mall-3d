// Continuous first-phase basement decks. Keep the original floor identities:
// the hotel/apartment B2 and west B2 meet the mall B1 at exactly -8.4 m.
// Every vehicle lane, floor opening, pedestrian connection and parking reserve
// comes from this plan; nothing here relies on a visual-only road.
import {
  IDENTITY, frame, rect, rectPoly, lrectPoly, lseg, toW, toL, polyBounds,
  pointInPoly, convexOverlap, clipConvex, polyArea,
} from './geom.js';
import { lift } from './mall.js';
import { fillRows, markSpecial } from './parking.js';
import { prepareMallStairs, buildMallStairAccess } from './mall-stairs.js';

export const SHARED_GARAGE_BOUNDS = Object.freeze({
  mall: { x0: -286, z0: -256, x1: -14, z1: -28 },
  west: { x0: -482, z0: -250, x1: -301, z1: -33 },
});
const level = (layout, id) => layout.levels.find(l => l.id === id);
const walk = (id, r, kind = 'aisle', extra = {}) => ({
  id, kind, frame: IDENTITY, rect: r, poly: rectPoly(r), ...extra,
});
const near = (a, b) => Math.abs(a - b) < 1e-6;
const samePoly = (a, b) => a.length === b.length && a.every((p, i) => near(p[0], b[i][0]) && near(p[1], b[i][1]));
const center = p => { const b = polyBounds(p); return [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]; };

function addHole(lv, poly, id, kind = 'ramp') {
  if (!lv.voids.some(v => samePoly(v.poly, poly))) lv.voids.push({ id, kind, poly, sharedGarage: true });
  for (const p of lv.slab.pieces) {
    // Stair approach plates are deliberately solid. All other pieces receive
    // the same intersection as navigation instead of a different visual cut.
    if (p.thickness != null || !poly.some(q => pointInPoly(q, p.outer)) && !pointInPoly(center(poly), p.outer)) continue;
    const cut = clipConvex(p.outer, poly);
    if (cut.length >= 3 && Math.abs(polyArea(cut)) > .01 && !p.holes.some(h => samePoly(h, cut))) p.holes.push(cut);
  }
}

function reserve(lv, id, r, kind = 'aisle') {
  const w = walk(id, r, kind);
  lv.walk.push(w);
  if (lv.parking) {
    lv.parking.stalls = lv.parking.stalls.filter(s => !convexOverlap(s.poly, w.poly));
    lv.parking.columns = lv.parking.columns.filter(c => !convexOverlap(
      lrectPoly(c.frame, rect(c.lx - .36, c.lz - .36, c.lx + .36, c.lz + .36)), w.poly));
  }
  return w;
}

function entrance(layout, lv, to, id, seg, nx, nz, options = {}) {
  const e = {
    id, building: lv.building, level: lv.id, to, name: '一期共享车库通道',
    seg, nx, nz, width: Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0),
    main: false, extension: true, sharedGarage: true, ...options,
  };
  layout.entrances.push(e);
  return e;
}

function pairedPortal(layout, from, to, id, seg, nx, nz, name) {
  const a = entrance(layout, from, to.id, `${id}-from`, seg, nx, nz, { name });
  entrance(layout, to, from.id, `${id}-to`, seg, -nx, -nz, { name });
  layout.extensions.connections.push({ id, from: from.id, to: to.id, kind: 'garage', name });
  return a;
}

function garagePath(layout, owner, id, r, to, name, ends) {
  const poly = rectPoly(r);
  const path = {
    id, kind: 'garage', name, building: owner.building, level: owner.id,
    from: owner.id, to, width: Math.min(r.x1 - r.x0, r.z1 - r.z0), height: 3.4,
    points: ends, polys: [poly], slab: { pieces: [{ outer: poly, holes: [] }] },
    sharedGarage: true,
  };
  layout.extensions.paths.push(path);
  reserve(owner, id, r);
  return path;
}

function removeRamps(layout, ids) {
  const old = layout.ramps.filter(r => ids.has(r.id));
  layout.ramps = layout.ramps.filter(r => !ids.has(r.id));
  layout.site.trenches = layout.site.trenches.filter(p => !old.some(r => convexOverlap(p, r.poly)));
  return old;
}

function makeRamp(layout, id, building, high, low, width = 5, out = false, quadrant) {
  const deg = Math.atan2(low.z - high.z, low.x - high.x) * 180 / Math.PI;
  const F = frame(high.x, high.z, deg, id), len = Math.hypot(low.x - high.x, low.z - high.z);
  const lane = rect(0, -width / 2, len, width / 2), poly = lrectPoly(F, lane);
  const street = high.level === 'street';
  const r = {
    id, building, type: street ? out ? 'street-out' : 'street-in' : out ? 'up' : 'down',
    name: `${quadrant || '共享地库'} ${street ? out ? '出口' : '入口' : out ? '上行' : '下行'}`,
    frame: F, lane, poly, width, from: out ? low : high, to: out ? high : low,
    sharedGarage: true, quadrant, headroom: 2.8,
  };
  layout.ramps.push(r);
  if (street) {
    layout.site.trenches.push(poly);
    layout.site.driveways.push(lrectPoly(F, rect(-6, -width / 2, 1, width / 2)));
  } else addHole(level(layout, high.level), poly, `${id}-opening`);
  for (const end of [high, low]) {
    const lv = level(layout, end.level);
    if (!lv) continue;
    const b = polyBounds(lrectPoly(F, rect(-4, -width / 2 - .3, len + 4, width / 2 + .3)));
    reserve(lv, `${id}-reservation`, b);
  }
  return r;
}

function expandDeck(lv, bounds, exclusions = []) {
  const oldOutline = lv.outline;
  lv.sharedGarage = { bounds: { ...bounds }, originalOutline: oldOutline, exclusions };
  lv.outline = rectPoly(bounds);
  const primary = lv.slab.pieces[0];
  // Existing stair openings and their thin entrance landings remain exact.
  primary.outer = lv.outline;
  for (const [i, poly] of exclusions.entries()) {
    primary.holes.push(poly);
    lv.voids.push({ id: `${lv.id}-neighbour-${i}`, kind: 'shared-boundary', poly, sharedGarage: true });
  }
  // Old connector pads become part of the continuous poured deck.
  lv.slab.pieces = [primary, ...lv.slab.pieces.slice(1).filter(p => p.thickness != null)];
}

function denseParking(layout, lv) {
  const bounds = lv.sharedGarage.bounds;
  const exclusions = lv.sharedGarage.exclusions || [];
  // The global shaft pass runs after this plan. Reserve its actual opening now
  // so the later floor cut cannot remove support from a newly painted bay.
  const shafts = layout.elevators.filter(e => e.serves.includes(lv.id)).map(e =>
    e.shaftPoly || lrectPoly(e.frame, rect(e.lu - e.w / 2 + .1, e.lv - e.d / 2 + .1,
      e.lu + e.w / 2 - .1, e.lv + e.d / 2 - .1)));
  const rows = [], aisleZ = [];
  for (let z = bounds.z0 + 9; z + 8 < bounds.z1; z += 16) aisleZ.push(z);
  const crossX = [];
  for (let x = bounds.x0 + 5; x < bounds.x1 - 4; x += 44) crossX.push(x);
  crossX.push(bounds.x1 - 5);
  const blockedRects = [...lv.rooms.flatMap(r => r.polys), ...lv.voids.map(v => v.poly), ...exclusions, ...shafts].map(polyBounds);
  const splitRect = (r, c) => {
    const x0 = Math.max(r.x0, c.x0 - .25), x1 = Math.min(r.x1, c.x1 + .25);
    const z0 = Math.max(r.z0, c.z0 - .25), z1 = Math.min(r.z1, c.z1 + .25);
    if (x0 >= x1 || z0 >= z1) return [r];
    return [rect(r.x0, r.z0, x0, r.z1), rect(x1, r.z0, r.x1, r.z1),
      rect(x0, r.z0, x1, z0), rect(x0, z1, x1, r.z1)]
      .filter(p => p.x1 - p.x0 > .1 && p.z1 - p.z0 > .1);
  };
  const aisle = (id, r, dir) => {
    let pieces = [r];
    for (const b of blockedRects) pieces = pieces.flatMap(p => splitRect(p, b));
    for (const [i, p] of pieces.entries()) {
      if (p.x1 - p.x0 < 1.2 || p.z1 - p.z0 < 1.2) continue;
      lv.walk.push(walk(`${id}-${i}`, p, 'aisle', { dir }));
    }
  };
  // Retain the original mall circulation and cores, and repack the whole deck.
  // Every painted aisle is split around structural rooms and actual openings.
  for (const [i, z] of aisleZ.entries()) {
    const r = rect(bounds.x0 + 1, z - 3, bounds.x1 - 1, z + 3);
    aisle(`${lv.id}-shared-aisle-${i}`, r, i % 2 ? [-1, 0] : [1, 0]);
    for (const [suffix, z0, z1, face] of [['N', z - 8, z - 3, 'S'], ['S', z + 3, z + 8, 'N']])
      rows.push({ id: `${lv.id}-shared-${i}${suffix}`, u0: bounds.x0 + 1, u1: bounds.x1 - 1, v0: z0, v1: z1, face });
  }
  for (const [i, x] of crossX.entries()) aisle(`${lv.id}-shared-cross-${i}`,
    rect(x - 3, bounds.z0 + 1, x + 3, bounds.z1 - 1), i % 2 ? [0, -1] : [0, 1]);
  aisle(`${lv.id}-shared-north-perimeter`,
    rect(bounds.x0 + 1, bounds.z0 + 1, bounds.x1 - 1, bounds.z0 + 6), [1, 0]);
  const blocks = [
    ...exclusions, ...lv.rooms.flatMap(r => r.polys), ...lv.voids.map(v => v.poly), ...shafts,
    ...layout.ramps.filter(r => [r.from.level, r.to.level].includes(lv.id)).map(r => r.poly),
    ...lv.walk.map(w => w.poly),
  ];
  const filled = fillRows(IDENTITY, rows, blocks, lv.building === 'WPG' ? '西库' : '共享');
  // A complete rectangle around a concave old outline can produce bays whose
  // vertices lie in excluded cells. Keep only bays wholly supported.
  const supported = p => p.every(q => pointInPoly(q, lv.outline))
    && !exclusions.some(e => convexOverlap(e, p));
  filled.stalls = filled.stalls.filter(s => supported(s.poly));
  filled.columns = filled.columns.filter(c => {
    const p = lrectPoly(c.frame, rect(c.lx - .4, c.lz - .4, c.lx + .4, c.lz + .4));
    return supported(p) && !blocks.some(b => convexOverlap(b, p));
  });
  const lifts = layout.elevators.filter(e => e.serves.includes(lv.id)).map(e => [e.x, e.z]);
  const evRow = rows.find(row => filled.stalls.filter(s => s.row === row.id).length >= 18)?.id
    || filled.stalls[0]?.row;
  markSpecial(filled.stalls, lifts, evRow, 18);
  lv.parking.stalls = filled.stalls;
  lv.parking.columns = filled.columns;
  lv.parking.aisles = lv.walk.filter(w => w.kind === 'aisle');
  lv.parking.sharedAdded = filled.stalls.length;
}

function addGarageLift(layout, building, id, x, z, serves, surfaceId) {
  const e = { ...lift(id, building, 'passenger', IDENTITY, x, z, 3, 3, 'S', serves),
    exterior: true, sharedGarage: true, animated: true,
    shaftPoly: rectPoly(rect(x - 1.4, z - 1.4, x + 1.4, z + 1.4)),
  };
  layout.elevators.push(e);
  const kiosk = rect(x - 3.6, z - 2.5, x + 3.6, z + 5.5), poly = rectPoly(kiosk);
  for (const id of serves) {
    const lv = level(layout, id);
    reserve(lv, `${e.id}-${id}-lobby`, rect(x - 3.6, z + 1.5, x + 3.6, z + 5.5), 'lobby');
    if (id === surfaceId) {
      lv.slab.pieces.push({ outer: poly, holes: [] });
      lv.garageKiosks ||= [];
      lv.garageKiosks.push({ id: e.id, rect: kiosk, poly, elevator: e.id });
      layout.site.openings.push(poly);
      layout.site.walk.push({ id: `${e.id}-approach`, kind: 'plaza',
        poly: rectPoly(rect(x - 4, z + 5.4, x + 4, z + 10)), outdoor: true });
      entrance(layout, lv, 'site', `${e.id}-entry`,
        { x0: x - 2, z0: z + 5.5, x1: x + 2, z1: z + 5.5 }, 0, 1,
        { name: '共享地库观光电梯厅', coveredConnection: true });
    }
  }
  return e;
}

function addGarageStair(layout, bid, id, x, z, serves, surfaceId) {
  const r = rect(x - 6, z - 3, x + 6, z + 3);
  const door = { x0: r.x0 + 1, z0: r.z1, x1: r.x0 + 2.4, z1: r.z1, side: 'S' };
  const s = { id, building: bid, frame: IDENTITY, rect: r, poly: rectPoly(r), door,
    doorByLevel: {}, wdoorByLevel: {}, serves, sharedGarage: true };
  prepareMallStairs([s]); s.wdoor = lseg(s.frame, s.door);
  layout.stairs.push(s);
  for (const floor of serves) {
    const lv = level(layout, floor);
    lv.rooms.push({ id, type: 'stair', label: '共享车库安全楼梯', frame: IDENTITY,
      rects: [r], polys: [s.poly], doors: [s.door], wdoors: [s.wdoor] });
    const lobby = rect(x - 6.5, z + 3, x + 6.5, z + 6.5);
    reserve(lv, `${id}-lobby-${floor}`, lobby, 'lobby');
    if (floor === surfaceId) {
      const kiosk = rect(x - 6.5, z - 3.5, x + 6.5, z + 6.5), poly = rectPoly(kiosk);
      lv.slab.pieces.push({ outer: poly, holes: [] });
      lv.garageKiosks ||= [];
      lv.garageKiosks.push({ id, rect: kiosk, poly, stair: id });
      layout.site.openings.push(poly);
      layout.site.walk.push({ id: `${id}-approach`, kind: 'plaza',
        poly: rectPoly(rect(x - 7, z + 6.4, x + 7, z + 9)), outdoor: true });
      entrance(layout, lv, 'site', `${id}-entry`,
        { x0: x - 5.8, z0: z + 6.5, x1: x - 1.8, z1: z + 6.5 }, 0, 1,
        { name: '共享车库安全楼梯出口', coveredConnection: true });
    }
  }
  const b = layout.buildings.find(b => b.id === bid);
  const access = buildMallStairAccess(b, layout.levels.filter(l => l.building === bid), [s]);
  b.access ||= { protected: true, routes: [], flights: [], surfaces: [] };
  for (const k of ['routes', 'flights', 'surfaces']) b.access[k].push(...access[k]);
  return s;
}

function groundReservations(layout) {
  const all = [...layout.site.trenches, ...layout.site.openings];
  for (const lot of layout.extensions.surfaceParking) {
    lot.stalls = lot.stalls.filter(s => !all.some(p => convexOverlap(s.poly, p, .01)));
    if (!lot.stalls.some(s => s.type === 'ev'))
      for (const s of lot.stalls.filter(s => s.type === 'normal').slice(-2)) s.type = 'ev';
  }
  const west = layout.site.westParking;
  west.islands = west.islands.filter(i => !all.some(p => convexOverlap(i.poly, p, .01)));
  west.stallCount = west.lots.reduce((n, l) => n + l.stalls.length, 0);
  west.evCount = west.lots.flatMap(l => l.stalls).filter(s => s.type === 'ev').length;
  west.accessibleCount = west.lots.flatMap(l => l.stalls).filter(s => s.type === 'accessible').length;
}

/** Fill missing street-level cuts, including the third-phase street slab.
 * Use lane-local headroom, so a ramp can enter a covered garage only after
 * enough vertical clearance is available. B1/B2 openings remain full lanes. */
function auditRampOpenings(layout) {
  layout.site.trenches = layout.ramps.filter(r => r.type.startsWith('street')).map(r => r.poly);
  for (const r of layout.ramps) {
    const [high, low] = r.from.y > r.to.y ? [r.from, r.to] : [r.to, r.from];
    const len = Math.hypot(low.x - high.x, low.z - high.z);
    const F = frame(high.x, high.z, Math.atan2(low.z - high.z, low.x - high.x) * 180 / Math.PI);
    if (high.level !== 'street') {
      const hi = level(layout, high.level);
      r.opening = hi.voids.find(v => v.kind === 'ramp' && pointInPoly(
        [(high.x + low.x) / 2, (high.z + low.z) / 2], v.poly))?.poly;
      if (!r.opening) { addHole(hi, r.poly, `${r.id}-opening`); r.opening = r.poly; }
    } else {
      const cut = r.poly;
      r.groundOpening = cut;
      const headroom = lrectPoly(F, rect(0, -r.width / 2,
        Math.min(len, len * 3.05 / (high.y - low.y)), r.width / 2));
      for (const lv of layout.levels.filter(l => Math.abs(l.elev) < .001)) {
        if (!lv.slab.pieces.some(p => convexOverlap(p.outer, headroom))) continue;
        addHole(lv, headroom, `${r.id}-headroom`);
      }
    }
    // Existing parking rows also reserve the full sloped lane and arrival.
    for (const end of [high, low]) {
      const lv = level(layout, end.level);
      if (!lv?.parking) continue;
      lv.parking.stalls = lv.parking.stalls.filter(s => !convexOverlap(s.poly, r.poly));
      lv.parking.columns = lv.parking.columns.filter(c => !convexOverlap(lrectPoly(c.frame,
        rect(c.lx - .4, c.lz - .4, c.lx + .4, c.lz + .4)), r.poly));
    }
  }
}

export function applySharedGarages(layout) {
  if (layout.sharedGarages) return layout;
  const P1 = level(layout, 'P1-B1'), P2 = level(layout, 'P1-B2');
  const W1 = level(layout, 'WPG-B1'), W2 = level(layout, 'WPG-B2');
  const H1 = level(layout, 'H-B1'), H2 = level(layout, 'H-B2');
  const A2 = level(layout, 'A-B2');
  const originalP1 = P1.outline;
  const oldPaths = new Set(['H-street-arrival-0', 'H-street-arrival-1',
    'west-parking-garage', 'H-mall-garage', 'A-mall-garage']);
  const replaced = layout.extensions.paths.filter(p => oldPaths.has(p.id)
    || p.kind === 'garage' && ['H', 'A'].includes(p.building) && p.to === 'P1-B1');
  const replacedIds = new Set(replaced.map(p => p.id));
  layout.extensions.paths = layout.extensions.paths.filter(p => !replacedIds.has(p.id));
  layout.extensions.connections = layout.extensions.connections.filter(c => !replacedIds.has(c.id));
  layout.entrances = layout.entrances.filter(e => ![...replacedIds].some(id => e.id.startsWith(`${id}-`)));
  for (const lv of layout.levels) lv.walk = lv.walk.filter(w => ![...replacedIds].some(id => w.id.startsWith(id)));
  removeRamps(layout, new Set(['P1-IN', 'P1-OUT', 'H-IN', 'H-OUT']));

  expandDeck(P1, SHARED_GARAGE_BOUNDS.mall, [H2.outline, A2.outline]);
  expandDeck(P2, SHARED_GARAGE_BOUNDS.mall);
  expandDeck(W1, SHARED_GARAGE_BOUNDS.west);
  expandDeck(W2, SHARED_GARAGE_BOUNDS.west);
  const westBuilding = layout.buildings.find(b => b.id === 'WPG');
  westBuilding.outline = rectPoly(SHARED_GARAGE_BOUNDS.west);
  const wl = westBuilding.outline.map(p => toL(westBuilding.frame, ...p));
  westBuilding.footprint = polyBounds(wl);
  westBuilding.bounds = { ...SHARED_GARAGE_BOUNDS.west };
  westBuilding.center = [-391.5, -141.5];
  westBuilding.radius = Math.hypot(181, 217) / 2;
  westBuilding.name = '一期共享地下车库 · 西侧停车区';
  for (const lv of [P1, P2, W1, W2, H1, H2, A2, level(layout, 'A-B1')]) {
    lv.garageNetwork = 'phase-one';
    lv.theme = { ...lv.theme, label: '一期 · 酒店 · 公寓 · 西侧停车共享地库' };
  }

  // Open the tower basement walls into the shared -8.4 m deck. Each old tower
  // still owns its own floor and cores, with no coplanar duplicate floor.
  for (const [lv, id, seg, nx, nz, inner, outer] of [
    [H2, 'shared-hotel', { x0: -210, z0: -85.2, x1: -210, z1: -77.1 }, 1, 0,
      rect(-222, -85.2, -210, -77.1), rect(-210, -85.2, -196, -77.1)],
    [A2, 'shared-apartment', { x0: -54, z0: -218, x1: -54, z1: -210 }, -1, 0,
      rect(-54, -218, -32, -210), rect(-69, -218, -54, -210)],
  ]) {
    reserve(lv, `${id}-inner`, inner); reserve(P1, `${id}-outer`, outer);
    pairedPortal(layout, lv, P1, id, seg, nx, nz, '酒店 · 公寓 · 商场共享车库');
  }
  // Cross the western ring road below ground; phase two has no garage link.
  const tunnel = rect(-301, -185, -286, -173);
  garagePath(layout, W2, 'shared-west-tunnel', tunnel, P1.id, '一期共享车库 · 西侧地下通车隧道',
    [[-301, -8.4, -179], [-286, -8.4, -179]]);
  entrance(layout, W2, W2.id, 'shared-west-wall-opening',
    { x0: -301, z0: -185, x1: -301, z1: -173 }, 1, 0,
    { architecturalOpening: true, name: '西侧共享车库隧道口' });
  reserve(W2, 'shared-west-tunnel-arrival', rect(-317, -185, -301, -173));
  reserve(P1, 'shared-mall-tunnel-arrival', rect(-286, -185, -270, -173));
  pairedPortal(layout, W2, P1, 'shared-west-mall', { x0: -286, z0: -185, x1: -286, z1: -173 }, 1, 0, '西侧停车与一期共享地下车库');

  // The hotel gate is south of the hotel; its former pair cut across the mall
  // frontage. Straight, parallel ramps have separate surface approaches.
  for (const [i, z] of [-45, -37].entries()) {
    makeRamp(layout, `H-${i ? 'OUT' : 'IN'}`, 'H',
      { x: -280, z, y: 0, level: 'street' }, { x: -244, z, y: -4.5, level: H1.id }, 5, !!i, '东南酒店口');
    const r = rect(-244, z - 2.5, -235, z + 2.5);
    garagePath(layout, H1, `H-shared-south-arrival-${i}`, r, H1.id, '酒店南侧共享地库进出车道',
      [[-244, -4.5, z], [-238, -4.5, z]]);
  }
  garagePath(layout, H1, 'H-shared-south-collector', rect(-241, -62.1533717, -235, -33.5),
    H1.id, '酒店南侧共享地库汇流通道', [[-238, -4.5, -62.1533717], [-238, -4.5, -35]]);
  reserve(H1, 'H-shared-south-turn', rect(-244, -84, -232, -62.1533717));
  entrance(layout, H1, H1.id, 'H-shared-south-opening',
    { x0: -241, z0: -62.1533717, x1: -235, z1: -62.1533717 }, 0, 1,
    { architecturalOpening: true, name: '酒店共享车库南口' });
  // Southwest pair leaves the new bus/taxi hub at z > -66 unobstructed.
  for (const [i, z] of [-88, -80].entries()) makeRamp(layout, `WPG-SOUTH-${i ? 'OUT' : 'IN'}`, 'WPG',
    { x: -381, z, y: 0, level: 'street' }, { x: -411, z, y: -4.5, level: W1.id }, 5, !!i, '西南公共口');
  for (const r of layout.ramps.filter(r => ['A-IN', 'A-OUT', 'WPG-IN', 'WPG-OUT'].includes(r.id))) {
    r.sharedGarage = true; r.quadrant = r.building === 'A' ? '东北公寓口' : '西北公共口';
    r.name = `${r.quadrant} ${r.type === 'street-in' ? '入口' : '出口'}`;
  }
  // Additional separated vertical routes avoid sending the whole enlarged
  // basement through the original central rotunda ramp.
  for (const [i, z] of [-247, -239].entries()) makeRamp(layout, `P1-SHARED-N-${i ? 'UP' : 'DN'}`, 'P1',
    { x: -150, z, y: -8.4, level: P1.id }, { x: -182, z, y: -12, level: P2.id }, 6, !!i);
  for (const [i, z] of [-141, -133].entries()) makeRamp(layout, `WPG-SHARED-${i ? 'UP' : 'DN'}`, 'WPG',
    { x: -428, z, y: -4.5, level: W1.id }, { x: -460, z, y: -8.4, level: W2.id }, 6, !!i);

  // Surface lift lobbies are real independent slabs/portals on existing 1F/G
  // identities, not teleport buttons floating over an uncut ground plane.
  for (const [i, x, z] of [[1, -138, -228], [2, -190, -42], [3, -274, -133], [4, -38, -147]])
    addGarageLift(layout, 'P1', `P1-SHARED-L${i}`, x, z, ['P1-B2', 'P1-B1', 'P1-1F'], 'P1-1F');
  for (const [i, x, z] of [[1, -439, -227], [2, -439, -109]])
    addGarageLift(layout, 'WPG', `WPG-SHARED-L${i}`, x, z, ['WPG-B2', 'WPG-B1', 'WPG-G'], 'WPG-G');
  for (const [i, x, z] of [[1, -65, -245], [2, -276, -57], [3, -274, -146], [4, -38, -160]])
    addGarageStair(layout, 'P1', `P1-SHARED-ST${i}`, x, z, ['P1-B2', 'P1-B1', 'P1-1F'], 'P1-1F');
  for (const [i, x, z] of [[1, -470, -228], [2, -391, -228], [3, -470, -155],
    [4, -458, -87], [5, -361, -41], [6, -318, -87], [7, -318, -228]])
    addGarageStair(layout, 'WPG', `WPG-SHARED-ST${i}`, x, z, ['WPG-B2', 'WPG-B1', 'WPG-G'], 'WPG-G');
  // Keep the extraction staging aisle and vehicle rectangle free of parked
  // cars/columns. The FPS layer owns the actual pickup car.
  reserve(level(layout, 'A-B1'), 'A-extraction-arrival', rect(-43, -225, -32, -214));
  for (const lv of [P1, P2, W1, W2]) denseParking(layout, lv);
  auditRampOpenings(layout);
  groundReservations(layout);
  layout.sharedGarages = {
    version: 1, buildingIds: ['P1', 'H', 'A', 'WPG'],
    levels: [P1.id, P2.id, W1.id, W2.id, H1.id, H2.id, 'A-B1', A2.id],
    bounds: SHARED_GARAGE_BOUNDS, mainElevation: -8.4,
    rampIds: layout.ramps.filter(r => r.sharedGarage).map(r => r.id),
    liftIds: layout.elevators.filter(e => e.sharedGarage).map(e => e.id),
    isolatedFrom: ['P2', 'P3'], originalMallOutline: originalP1,
  };
  return layout;
}
