// Protected tower stairs: one surveyed plan drives the slab openings, physical
// flights, intermediate landings and continuous walking routes.
//
// Two optional stair fields (supertall P0a, SPEC §2.1). Only expansion-only builders set them; without
// them every record is byte-identical to before (rule C-13):
//   stair.breakLevels = [levelId]   分隔 at refuge floors (and the 1F split): a lane partition crosses the
//     door landing, so the run from below arrives through one door and the run above leaves through
//     another; going down you leave the stair, cross the floor and re-enter. Per level, optional
//     stair.breakDoors[levelId] = { door2, partition } (stair-frame segments); by default the partition
//     runs up the middle of the landing and door2 mirrors the stair door about it.
//   stair.maxRisers = 18            a storey taller than 2 × maxRisers × 0.17 m gets `loops` pairs of flights
//     with a doorless landing at the door end between loops (a surface with parentFloor lo).
import { rect, lrectPoly, toW, lseg } from './geom.js';

export const RISER = 0.17, GOING = 0.28;
/** Flight pairs ("loops") a storey of `rise` needs with at most maxRisers risers per flight (1 without the field). */
export const stairLoops = (rise, maxRisers) => (maxRisers ? Math.max(1, Math.ceil(rise / (2 * maxRisers * RISER) - 1e-9)) : 1);
/** Risers per flight of one storey (the engine rounds each half-rise up to 0.17 m risers). */
export const flightRisers = (rise, maxRisers) => Math.ceil((rise / stairLoops(rise, maxRisers) / 2 - 1e-7) / RISER);

export function towerStairPlan(stair) {
  const r = stair.rect, direction = stair.door.side === 'S' ? -1 : 1;
  const depth = r.z1 - r.z0, doorZ = stair.door.z0;
  const point = (x, v) => [x, doorZ + direction * v];
  const rectangle = (x0, v0, x1, v1) => {
    const a = point(x0, v0), b = point(x1, v1);
    return rect(a[0], Math.min(a[1], b[1]), b[0], Math.max(a[1], b[1]));
  };
  const width = Math.min(1.6, (r.x1 - r.x0 - 1.2) / 2);
  const centers = [r.x0 + .4 + width / 2, r.x1 - .4 - width / 2];
  /**
   * 分隔 on break level `id`: { partition, doors: [door1, door2], depart, arrive } in the stair frame, or null.
   * depart = the door of the low-x lane (flight 1 leaves upward from it), arrive = the door of the
   * high-x lane (the flight from below arrives there).
   */
  const breakAt = (id) => {
    if (!stair.breakLevels?.includes(id)) return null;
    const cx = (centers[0] + centers[1]) / 2, given = stair.breakDoors?.[id] || {};
    const partition = given.partition || { x0: cx, z0: doorZ, x1: cx, z1: doorZ + direction * 2 };
    const px = partition.x0, d1 = stair.door, mid = (d) => (d.x0 + d.x1) / 2;
    if (Math.abs(partition.x1 - partition.x0) > 1e-6) throw new Error(`${stair.id} ${id}: the break partition runs across the landing (constant x)`);
    if (d1.x0 < px - 1e-6 && d1.x1 > px + 1e-6 && !given.door2) throw new Error(`${stair.id} ${id}: the stair door straddles the break partition; give breakDoors.door2`);
    const door2 = given.door2 || { ...d1, x0: 2 * px - d1.x1, x1: 2 * px - d1.x0 };
    for (const d of [d1, door2]) if (d.x0 < px - 1e-6 && d.x1 > px + 1e-6) throw new Error(`${stair.id} ${id}: a door straddles the break partition`);
    if ((mid(d1) < px) === (mid(door2) < px)) throw new Error(`${stair.id} ${id}: both doors on one side of the break partition`);
    if (Math.abs(door2.z0 - doorZ) > 1e-6 || door2.side !== d1.side) throw new Error(`${stair.id} ${id}: door2 must sit in the stair door wall`);
    const [depart, arrive] = mid(d1) < px ? [d1, door2] : [door2, d1];
    return { partition, doors: [d1, door2], depart, arrive };
  };
  return { direction, depth, point, rectangle, width, centers,
    shaftRect: rectangle(r.x0 + .4, 2, r.x1 - .4, depth - .7),
    landingRect: rectangle(r.x0 + .2, .2, r.x1 - .2, 2), breakAt };
}

/**
 * Records for the 分隔 doors on break levels: for each stair and each of its break levels in `levels`,
 * the stair room on that level gets doors [door1, door2] (+ wdoors), `breakPartition` (stair frame) and
 * the level a world-space nav wall (lv.navWalls) on the partition; a corePlan stair entry gets `door2`
 * and `partition`. Tower builders call it after creating their stair rooms. Returns the touched levels.
 */
export function applyStairBreaks(levels, stairs) {
  const touched = new Set();
  for (const s of stairs) {
    if (!s.breakLevels?.length) continue;
    const plan = towerStairPlan(s);
    for (const lv of levels) {
      const b = plan.breakAt(lv.id);
      if (!b) continue;
      const room = lv.rooms.find((m) => m.id === s.id && m.type === 'stair');
      if (room) { room.doors = b.doors.map((d) => ({ ...d })); room.wdoors = room.doors.map((d) => lseg(s.frame, d)); room.breakPartition = { ...b.partition }; }
      const [x0, z0] = toW(s.frame, b.partition.x0, b.partition.z0), [x1, z1] = toW(s.frame, b.partition.x1, b.partition.z1);
      (lv.navWalls ||= []).push({ x0, z0, x1, z1, stairBreak: s.id });
      const cp = lv.corePlan?.stairs?.find((q) => q.id === s.id);
      if (cp) Object.assign(cp, { door2: { ...b.doors[1] }, partition: { ...b.partition } });
      touched.add(lv);
    }
  }
  return [...touched];
}

export function buildTowerStairAccess(building, levels, stairs) {
  const access = { surfaces: [], flights: [], routes: [], protected: true };
  for (const stair of stairs) {
    // Sealed host storeys keep flights and landings but have no door: their
    // storey routes chain through the doorless landing to the next door level.
    const passes = new Set(stair.passLevels || []), routes = passes.size ? [] : access.routes;
    const plan = towerStairPlan(stair), [left, right] = plan.centers;
    const world = (x, v, y, floor) => {
      const [wx, wz] = toW(stair.frame, ...plan.point(x, v));
      return { x: wx, z: wz, y, floor };
    };
    const doorCenter = (d) => (d.x0 + d.x1) / 2;
    for (let i = 0; i < levels.length - 1; i++) {
      const lo = levels[i], hi = levels[i + 1], rise = hi.elev - lo.elev;
      const loops = stairLoops(rise, stair.maxRisers), sub = rise / loops;
      const half = sub / 2, steps = Math.ceil((half - 1e-7) / RISER);
      const start = 1.85, end = start + steps * GOING, landingDepth = 1.35;
      if (end + landingDepth > plan.depth - .6) throw new Error(`${stair.id}: insufficient stair depth`);
      const id = `${stair.id}-${lo.short}-${hi.short}`, landing = `${id}-landing`;
      const landingRect = plan.rectangle(stair.rect.x0 + .4, end, stair.rect.x1 - .4, end + landingDepth);
      const common = { stair: stair.id, building: building.id, parentFloor: lo.id, frame: stair.frame };
      // A doorless landing at the door end between two loops (maxRisers): same width as the half landings.
      const doorEndRect = loops > 1 ? plan.rectangle(stair.rect.x0 + .4, .25, stair.rect.x1 - .4, start + .15) : null;
      const flight = (suffix, x, a, b, y0, y1, from, to) => ({ ...common, id: `${id}-${suffix}`, from, to,
        bottom: world(x, a, y0, from), top: world(x, b, y1, to),
        localBottom: plan.point(x, a), localTop: plan.point(x, b), width: plan.width,
        steps, rise: half, run: end - start });
      const halfIds = [], doorEnds = [];
      let floor = lo.id;
      for (let k = 0; k < loops; k++) {
        const y0 = lo.elev + k * sub, mid = y0 + half, top = k === loops - 1;
        const hl = k ? `${landing}-${k + 1}` : landing, next = top ? hi.id : `${id}-loop-${k + 1}`;
        access.surfaces.push({ ...common, id: hl, elev: mid, rect: landingRect, poly: lrectPoly(stair.frame, landingRect) });
        if (!top) access.surfaces.push({ ...common, id: next, elev: y0 + sub, rect: doorEndRect, poly: lrectPoly(stair.frame, doorEndRect), doorless: true });
        access.flights.push(flight(`flight-${2 * k + 1}`, left, start, end, y0, mid, floor, hl),
          flight(`flight-${2 * k + 2}`, right, end, start, mid, top ? hi.elev : y0 + sub, hl, next));
        halfIds.push([hl, mid]); if (!top) doorEnds.push([next, y0 + sub]);
        floor = next;
      }
      // 分隔: at a break level the run leaves through the low-x lane's door and arrives through the other.
      const dLo = plan.breakAt(lo.id)?.depart || stair.door, dHi = plan.breakAt(hi.id)?.arrive || stair.door;
      const cLo = doorCenter(dLo), cHi = doorCenter(dHi);
      const waypoints = [world(cLo, -.8, lo.elev, lo.id), world(cLo, .95, lo.elev, lo.id), world(left, .95, lo.elev, lo.id)];
      for (let k = 0; k < loops; k++) {
        const [hl, mid] = halfIds[k];
        waypoints.push(world(left, end + .7, mid, hl), world(right, end + .7, mid, hl));
        if (k < loops - 1) { const [de, y] = doorEnds[k]; waypoints.push(world(right, .95, y, de), world(left, .95, y, de)); }
      }
      waypoints.push(world(right, .95, hi.elev, hi.id), world(cHi, .95, hi.elev, hi.id), world(cHi, -.8, hi.elev, hi.id));
      routes.push({ id, stair: stair.id, from: lo.id, to: hi.id, landing,
        ...(loops > 1 ? { landings: [...halfIds, ...doorEnds].sort((a, b) => a[1] - b[1]).map(([sid]) => sid), loops } : {}), waypoints });
    }
    if (passes.size) access.routes.push(...chainRoutes(stair, routes, passes));
  }
  return access;
}

/** Merge storey routes across pass levels: route(lo→p) loses its two door waypoints
 * at p, route(p→hi) its two; the merged route runs door level to door level. */
function chainRoutes(stair, routes, passes) {
  const out = [];
  let cur = null;
  for (const r of routes) {
    if (!cur) cur = { ...r, landings: [...(r.landings || [r.landing])], waypoints: [...r.waypoints] };
    else {
      cur.waypoints = [...cur.waypoints.slice(0, -2), ...r.waypoints.slice(2)];
      cur.landings.push(...(r.landings || [r.landing]));
      cur.to = r.to;
    }
    if (!passes.has(r.to)) {
      const [lo, hi] = [cur.from, cur.to].map((id) => id.slice(id.lastIndexOf('-') + 1));
      out.push({ ...cur, id: `${stair.id}-${lo}-${hi}` });
      cur = null;
    }
  }
  return out;
}
