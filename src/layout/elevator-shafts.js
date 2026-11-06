import { rect, lrectPoly, pointInPoly, distToPolyEdge } from './geom.js';

const inside = (p, poly) => pointInPoly(p, poly) || distToPolyEdge(p, poly) < 1e-6;

// ---------------------------------------------------------------------------
// Lift record fields (supertall P0a). Only expansion-only builders write them; readers use defaults,
// so the compact FPS layout never carries them (SPEC §2.1, rule C-13):
//   e.speed      m/s, read as e.speed ?? LIFT_SPEED_DEFAULT
//   e.role       one of LIFT_ROLES (absent = an ordinary passenger lift)
//   e.zone       'low' | 'high' | null   (西苑 banks)
//   e.card       'resident' | 'room-key' | null   (cosmetic 梯控 text)
//   e.serves     normal-mode landing doors (existing)
//   e.shaftLevels every level the shaft passes (existing)
//   e.fireOnly   levels with a landing door used only in fire mode (消防专用: no call button, a nav link
//                only with buildNav(L, { gates: 'open' }))
export const LIFT_SPEED_DEFAULT = 3.5;
export const LIFT_ROLES = Object.freeze(['private-w', 'private-e', 'fire', 'fire-service', 'passenger', 'residence', 'shuttle', 'hotel', 'service-fire']);
/** Roles of fire lifts (消防电梯): they may, and must, open on refuge floors. */
export const FIRE_LIFT_ROLES = Object.freeze(['fire', 'fire-service', 'service-fire']);
export const isFireLift = (e) => FIRE_LIFT_ROLES.includes(e.role);
/** Landing doors of lift e: normal-mode stops, plus the fire-only ones when fire is set. */
export const liftStops = (e, { fire = false } = {}) => (fire && e.fireOnly?.length ? [...e.serves, ...e.fireOnly.filter((id) => !e.serves.includes(id))] : e.serves);
/** What lift e has on level id: 'normal' (a landing door), 'fire' (消防专用 door, fire mode only) or null (passes, blank wall).
 * corePlan.lifts[i].landing = landingAt(e, lv.id) != null. */
export const landingAt = (e, id) => (e.serves.includes(id) ? 'normal' : e.fireOnly?.includes(id) ? 'fire' : null);

/** All lift cars follow the same real shaft, including the G to B1 segment. */
export function prepareRideableElevators(layout) {
  const levels = new Map(layout.levels.map(l => [l.id, l]));
  for (const e of layout.elevators) {
    e.rideable = true;
    const r = rect(e.lu - e.w / 2 + .1, e.lv - e.d / 2 + .1,
      e.lu + e.w / 2 - .1, e.lv + e.d / 2 - .1);
    const poly = lrectPoly(e.frame, r);
    e.shaftPoly = poly;
    // Fire-only landings are real doors too: the shaft reaches them (absent fireOnly = today's stops).
    const stops = liftStops(e, { fire: true }).map(id => levels.get(id)).filter(Boolean);
    if (!stops.length) continue;
    e.shaftBottom = Math.min(...stops.map(l => l.elev));
    e.shaftTop = Math.max(...stops.map(l => l.elev));
    // A residential core can rise through host levels of another building.
    const shaft = e.shaftLevels && new Set(e.shaftLevels);
    for (const lv of layout.levels) {
      if ((shaft ? !shaft.has(lv.id) : lv.building !== e.building) || lv.elev < e.shaftBottom || lv.elev > e.shaftTop) continue;
      const hosts = lv.slab.pieces.filter(p => poly.every(q => pointInPoly(q, p.outer)));
      for (const piece of hosts) {
        if (!piece.holes.some(h => poly.every(q => inside(q, h)))) {
          // Nested duplicate holes make Earcut fill parts of the shaft back in.
          piece.holes = piece.holes.filter(h => !h.every(q => inside(q, poly)));
          piece.holes.push(poly);
        }
      }
      if (hosts.length && !lv.voids.some(v => v.elevator === e.id
        || poly.every(q => inside(q, v.poly)))) {
        lv.voids.push({ id: `${e.id}-ride-shaft-${lv.id}`, kind: 'shaft',
          elevator: e.id, frame: e.frame, rect: r, poly });
      }
    }
    // Independent ground kiosks are outside the main building outline.
    if (e.shaftBottom < 0 && e.shaftTop >= 0
      && !layout.buildings.some(b => !b.undergroundOnly && poly.every(p => pointInPoly(p, b.outline)))) {
      layout.site.openings ||= [];
      if (!layout.site.openings.some(h => poly.every(p => pointInPoly(p, h)))) layout.site.openings.push(poly);
    }
  }
  return layout;
}

/** Rectangular core infill, excluding the actual cabin and its door approach. */
export function coreInfill(g, elevators) {
  let pieces = [{ ...g }];
  for (const e of elevators) {
    const r = { x0: e.lu - e.w / 2, x1: e.lu + e.w / 2,
      z0: e.lv - e.d / 2, z1: e.lv + e.d / 2 };
    if (e.door === 'N') r.z0 = Math.min(r.z0, g.z0);
    if (e.door === 'S') r.z1 = Math.max(r.z1, g.z1);
    if (e.door === 'W') r.x0 = Math.min(r.x0, g.x0);
    if (e.door === 'E') r.x1 = Math.max(r.x1, g.x1);
    pieces = pieces.flatMap(p => {
      const x0 = Math.max(p.x0, r.x0), x1 = Math.min(p.x1, r.x1);
      const z0 = Math.max(p.z0, r.z0), z1 = Math.min(p.z1, r.z1);
      if (x0 >= x1 || z0 >= z1) return [p];
      return [rect(p.x0, p.z0, x0, p.z1), rect(x1, p.z0, p.x1, p.z1),
        rect(x0, p.z0, x1, z0), rect(x0, z1, x1, p.z1)]
        .filter(q => q.x1 - q.x0 > .015 && q.z1 - q.z0 > .015);
    });
  }
  return pieces;
}
