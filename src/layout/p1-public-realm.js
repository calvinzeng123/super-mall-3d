// Phase-one public arrivals: one real west entrance and an open-air B1M court.
// Path slabs, portals, furniture footprints and the renderer share these records.
import clipping from 'polygon-clipping';
import { IDENTITY, frame, rect, rectPoly, lrectPoly, lseg, toW, circlePoly } from './geom.js';

const strip = (a, b, width) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return lrectPoly(frame(...a, Math.atan2(dz, dx) * 180 / Math.PI), rect(-.03, -width / 2, Math.hypot(dx, dz) + .03, width / 2));
};
const pieces = polygons => clipping.union(...polygons.map(p => [p])).map(([outer, ...holes]) => ({ outer: outer.slice(0, -1), holes: holes.map(p => p.slice(0, -1)) }));
function path(layout, id, name, points, width, extra = {}) {
  const polys = points.slice(1).map((b, i) => strip(points[i], b, width));
  for (const [x, z] of points.slice(1, -1)) polys.push(rectPoly(rect(x - width / 2, z - width / 2, x + width / 2, z + width / 2)));
  const out = { id, name, kind: 'underground', building: 'P1', level: 'P1-B1M', from: 'P1-B1M', to: 'P1-B1M',
    width, height: 3.3, points: points.map(([x, z]) => [x, -4.5, z]), polys, slab: { pieces: pieces(polys) }, expansion: true, ...extra };
  layout.extensions.paths.push(out);
  const lv = layout.levels.find(l => l.id === out.level);
  for (const [i, p] of out.slab.pieces.entries()) lv.walk.push({ id: `${id}-${i}`, kind: 'passage', frame: IDENTITY, lpoly: p.outer, poly: p.outer, extension: true });
  return out;
}
const portal = (layout, id, seg, nx, nz, extra = {}) => {
  const e = { id, building: 'P1', level: 'P1-B1M', to: 'P1-B1M', name: '云谷艺术广场', seg, nx, nz,
    width: Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0), extension: true, ...extra };
  layout.entrances.push(e); return e;
};
const sector = (x, z, r0, r1, a0, a1) => {
  const arc = r => Array.from({ length: 25 }, (_, i) => { const a = (a0 + (a1 - a0) * i / 24) * Math.PI / 180; return [x + Math.cos(a) * r, z + Math.sin(a) * r]; });
  return [...arc(r1), ...arc(r0).reverse()];
};

export function addSunkenArtCourt(layout) {
  const lv = layout.levels.find(l => l.id === 'P1-B1M'), b = layout.buildings.find(b => b.id === 'P1');
  const bounds = rect(-124, -56, -86, -28);
  // Chamfer the northeast corner to leave a real strip of ground beside the SE wing.
  const poly = [[-120, -56], [-96, -56], [-86, -46], [-86, -32], [-90, -28], [-120, -28], [-124, -32], [-124, -52]];
  layout.site.openings.push(poly);
  lv.slab.pieces.push({ outer: poly, holes: [] });
  lv.walk.push({ id: 'P1-sunken-court', kind: 'plaza', frame: IDENTITY, lpoly: poly, poly, outdoor: true });
  const door = layout.entrances.find(e => e.id === 'P1-S'), mid = [(door.seg.x0 + door.seg.x1) / 2, (door.seg.z0 + door.seg.z1) / 2];
  const food = path(layout, 'P1-sunken-food-passage', '云谷艺术广场 · B1M 美食广场', [mid, [-108.5, -64], [-108.5, -56]], 4.8);
  portal(layout, 'P1-sunken-food-door', door.seg, door.nx, door.nz, { architecturalOpening: true, name: food.name });

  const bottom = { x: -108.5, z: -44, y: -4.5, floor: lv.id }, top = { x: -108.5, z: bounds.z1, y: 0, floor: 'ground' };
  const flight = { id: 'P1-SUNKEN-ST', stair: 'P1-SUNKEN-ST', building: 'P1', parentFloor: lv.id, frame: IDENTITY,
    from: lv.id, to: 'ground', bottom, top, localBottom: [bottom.x, bottom.z], localTop: [top.x, top.z], width: 6.4, steps: 28, rise: 4.5, run: top.z - bottom.z, protected: true };
  b.access.flights.push(flight);
  b.access.routes.push({ id: 'P1-SUNKEN-ACCESS', stair: flight.id, from: lv.id, to: 'ground', landings: [],
    waypoints: [{ ...bottom, z: -44.8 }, { ...top, z: top.z + .65 }, { ...top, z: -23.5 }] });

  const PA = layout.buildings.find(b => b.id === 'M').passages.find(p => p.id === 'PA');
  const width = 5.2, at = 62, end = toW(PA.F, at, -PA.hw), turn = toW(PA.F, at, -24);
  const metro = path(layout, 'P1-sunken-metro-passage', '云谷艺术通廊 · 地铁云澜汇站',
    [[-86, -38.5], [-78, -38.5], [-74, turn[1]], turn, end], width, { to: 'M-B1', artGallery: true });
  const seg = lseg(PA.F, { x0: at - width / 2, z0: -PA.hw, x1: at + width / 2, z1: -PA.hw, side: 'S' });
  const entry = portal(layout, `${metro.id}-station`, seg, -PA.F.s, PA.F.c, { to: 'M-B1', name: metro.name, metroPassage: 'PA' });
  (layout.extensions.connections ||= []).push({ id: metro.id, from: lv.id, to: 'M-B1', kind: 'underground' });

  const stage = rect(-122, -52, -116, -44.8);
  const seats = [0, 1, 2].map(i => ({ id: `P1-court-seat-${i}`, poly: sector(-97.5, -42.5, 5.8 + i * .95, 6.65 + i * .95, 45, 135), height: .45 * (i + 1) }));
  const planters = [{ x: -120, z: -32.6, r: 1.1 }, { x: -90.5, z: -32.8, r: 1.05 }];
  const art = { x: -97, z: -47.5, r: 1.8, height: 4.6, name: '回响' };
  (lv.navObstacles ||= []).push({ id: 'P1-court-stage', poly: rectPoly(stage) }, ...seats,
    { id: 'P1-court-art', poly: circlePoly(art.x, art.z, art.r, 24) },
    ...planters.map((p, i) => ({ id: `P1-court-planter-${i}`, poly: circlePoly(p.x, p.z, p.r + .15, 20) })));
  const north = { seg: { x0: -110.9, z0: -56, x1: -106.1, z1: -56 }, level: lv.id };
  const east = { seg: { x0: -86, z0: -38.5 - width / 2, x1: -86, z1: -38.5 + width / 2 }, level: lv.id };
  layout.expansion.sunkenCourt = { id: 'P1-sunken-court', name: '云谷艺术广场', building: 'P1', level: lv.id,
    bounds, poly, elev: -4.5, stair: flight, path: food.id, stage, seats, planters, art, portals: [north, east], metroPath: metro.id,
    metroPortal: entry.id, seating: rect(-104, -38, -89, -31), scheme: 'echo-court',
    routes: { food: [...food.points], metro: [[-108.5, -4.5, -51], [-104, -4.5, -49], [-103, -4.5, -43], [-92, -4.5, -43], [-89, -4.5, -38.5], ...metro.points] } };

  // Keep the existing ground promenade outside the expanded void.
  const fc = layout.site.forecourt, promenade = fc.paths.find(p => p.id === 'rotunda-garden');
  promenade.width = 3;
  promenade.points = [mid, [-123, -62], [-127.2, -56], [-127.2, -23], [-122, -23]];
  promenade.polys = promenade.points.slice(1).map((p, i) => strip(promenade.points[i], p, promenade.width));
  layout.site.walk = layout.site.walk.filter(w => !w.id.startsWith('rotunda-garden-'));
  promenade.polys.forEach((poly, i) => layout.site.walk.push({ id: `rotunda-garden-${i}`, kind: 'promenade', poly, outdoor: true }));
  layout.site.activityExclusions.push(poly, ...promenade.polys);
}

export function addWestArrival(layout) {
  const lv = layout.levels.find(l => l.id === 'P1-1F'), b = layout.buildings.find(b => b.id === 'P1'), F = b.wings.find(w => w.id === 'NW').F;
  // Reserve the end of one existing shop for a real transverse entry hall.
  // Its remaining 3.5 m frontage, id and brand stay in place.
  const unit = lv.units.find(u => u.id === 'P1-1F-NWR4');
  unit.rects[0].x1 = 81.5; unit.fronts[0].x1 = 81.5;
  unit.polys = unit.rects.map(r => lrectPoly(unit.frame, r)); unit.wfronts = unit.fronts.map(s => lseg(unit.frame, s));
  const hall = rect(81.5, -23, 87, -6.8), hallPoly = lrectPoly(F, hall);
  lv.walk.push({ id: 'P1-west-welcome-hall', kind: 'entrance', frame: F, rect: hall, poly: hallPoly });
  const seg = lseg(F, { x0: 81.5, z0: -23, x1: 87, z1: -23, side: 'N' });
  const e = portal(layout, 'P1-WEST-ART', seg, F.s, -F.c, { level: lv.id, to: 'site', name: '西门 · 喷泉艺术街', main: false, westArrival: true });
  const middle = toW(F, 84.25, -23), approach = toW(F, 84.25, -31);
  const points = [[-303, -124.5], [-298, -124.5], [-286, -124.5], [-269, -124.5], [-264, -127.5], [-205, -127.5], [-198, -143.5], approach, middle].reverse();
  const width = 5.6, polys = points.slice(1).map((p, i) => strip(points[i], p, width));
  const P = { id: 'P1-west-art-promenade', name: '西门艺术步道', entrance: e.id, points, width, polys, crossingSegments: [6], pavedBy: 'p1-public-realm' };
  const S = layout.site;
  S.forecourt.paths.push(P);
  polys.forEach((poly, i) => S.walk.push({ id: `${P.id}-${i}`, kind: 'promenade', poly, outdoor: true }));
  const crossing = rect(-298, -127.3, -286, -121.7);
  S.crossings.push({ id: 'west-cross-art-gate', axis: 'x', rect: crossing, poly: rectPoly(crossing) });
  const gate = { x: -283, z: -124.5, width: 10, height: 5.8, name: '西门', en: 'WEST ENTRANCE', piers: [-1, 1].map(s => rect(-283.55, -124.5 + s * 4.65 - .55, -282.45, -124.5 + s * 4.65 + .55)) };
  gate.piers.forEach((r, i) => S.forecourt.obstacles.push({ id: `P1-west-gate-pier-${i}`, poly: rectPoly(r) }));
  gate.canopyPoly = rectPoly(rect(gate.x - 1.5, gate.z - 5.65, gate.x + 1.5, gate.z + 5.65));
  S.activityExclusions.push(...polys, gate.canopyPoly);
  layout.expansion.westArrival = { gate, path: P, entry: e.id, hall: hallPoly, approach, middle, interior: toW(F, 84.25, -3) };
}
