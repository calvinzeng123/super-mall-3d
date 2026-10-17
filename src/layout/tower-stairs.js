// Protected tower stairs: one surveyed plan drives the slab openings, physical
// flights, intermediate landings and continuous walking routes.
import { rect, lrectPoly, toW } from './geom.js';

export function towerStairPlan(stair) {
  const r = stair.rect, direction = stair.door.side === 'S' ? -1 : 1;
  const depth = r.z1 - r.z0, doorZ = stair.door.z0;
  const point = (x, v) => [x, doorZ + direction * v];
  const rectangle = (x0, v0, x1, v1) => {
    const a = point(x0, v0), b = point(x1, v1);
    return rect(a[0], Math.min(a[1], b[1]), b[0], Math.max(a[1], b[1]));
  };
  const width = Math.min(1.6, (r.x1 - r.x0 - 1.2) / 2);
  return { direction, depth, point, rectangle, width,
    centers: [r.x0 + .4 + width / 2, r.x1 - .4 - width / 2],
    shaftRect: rectangle(r.x0 + .4, 2, r.x1 - .4, depth - .7),
    landingRect: rectangle(r.x0 + .2, .2, r.x1 - .2, 2) };
}

export function buildTowerStairAccess(building, levels, stairs) {
  const access = { surfaces: [], flights: [], routes: [], protected: true };
  for (const stair of stairs) {
    const plan = towerStairPlan(stair), [left, right] = plan.centers;
    const world = (x, v, y, floor) => {
      const [wx, wz] = toW(stair.frame, ...plan.point(x, v));
      return { x: wx, z: wz, y, floor };
    };
    for (let i = 0; i < levels.length - 1; i++) {
      const lo = levels[i], hi = levels[i + 1], rise = hi.elev - lo.elev;
      const half = rise / 2, steps = Math.ceil((half - 1e-7) / .17);
      const start = 1.85, end = start + steps * .28, landingDepth = 1.35;
      if (end + landingDepth > plan.depth - .6) throw new Error(`${stair.id}: insufficient stair depth`);
      const id = `${stair.id}-${lo.short}-${hi.short}`, landing = `${id}-landing`, mid = lo.elev + half;
      const landingRect = plan.rectangle(stair.rect.x0 + .4, end, stair.rect.x1 - .4, end + landingDepth);
      const common = { stair: stair.id, building: building.id, parentFloor: lo.id, frame: stair.frame };
      const surface = { ...common, id: landing, elev: mid, rect: landingRect, poly: lrectPoly(stair.frame, landingRect) };
      access.surfaces.push(surface);
      const flight = (suffix, x, a, b, y0, y1, from, to) => ({ ...common, id: `${id}-${suffix}`, from, to,
        bottom: world(x, a, y0, from), top: world(x, b, y1, to),
        localBottom: plan.point(x, a), localTop: plan.point(x, b), width: plan.width,
        steps, rise: half, run: end - start });
      access.flights.push(flight('flight-1', left, start, end, lo.elev, mid, lo.id, landing),
        flight('flight-2', right, end, start, mid, hi.elev, landing, hi.id));
      const center = (stair.door.x0 + stair.door.x1) / 2;
      access.routes.push({ id, stair: stair.id, from: lo.id, to: hi.id, landing, waypoints: [
        world(center, -.8, lo.elev, lo.id), world(center, .95, lo.elev, lo.id),
        world(left, .95, lo.elev, lo.id), world(left, end + .7, mid, landing),
        world(right, end + .7, mid, landing), world(right, .95, hi.elev, hi.id),
        world(center, .95, hi.elev, hi.id), world(center, -.8, hi.elev, hi.id),
      ] });
    }
  }
  return access;
}
