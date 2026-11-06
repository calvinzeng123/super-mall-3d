// No-bypass harness (SPEC §1.0 "card zones" rule 4, C-3): flood the real walking model from public places and
// list the residents' floors it reaches. Nobody carries a card: gate readers are never tapped, so with
// buildNav(L) every card gate (entry, exit-only and re-entry door) is a closed leaf, which is exactly what someone
// outside sees; with buildNav(L, { gates: 'open' }) (the fire-alarm model) every gate is open and lifts link
// their fireOnly landings too.
//
// The flood walks the nav itself: 4-neighbour moves of `cell` metres through step() (walls, closed gate leaves,
// door portals, slab edges), stair and ramp flights followed end to end (landings included), and lift / stair
// links between their stops (a stop within NAV.reach of a reached point, as linksNear offers them). Each tower
// package adds its towers to tests/no-bypass.test.js with this harness.
import { step, clear, NAV } from '../../src/layout/nav.js';

const key = (f, x, z, c) => `${f}|${Math.floor(x / c)}|${Math.floor(z / c)}`;

/**
 * Flood nav from starts ([{ floor, x, z }]). Options:
 *   cell (0.5 m), floors(id) → bool (floors the flood may enter; default all),
 *   box(id) → { x0, z0, x1, z1 } | null (limits x / z on that floor; null = unbounded), maxCells (a guard),
 *   until: floor ids; the flood stops as soon as it has reached every one of them (a reachability proof).
 * Returns { floors: Map floorId → cells reached, reached(id), at(id) → [[x, z]…] }.
 */
export function floodNav(nav, starts, { cell = 0.5, floors = () => true, box = () => null, maxCells = 600000, until = null } = {}) {
  const goal = until ? new Set(until) : null;
  const seen = new Map(), queue = [];
  const stops = new Map();
  for (const k of nav.links) {
    if (k.kind !== 'lift' && k.kind !== 'stair') continue;
    k.stops.forEach((st, i) => { if (!stops.has(st.floor)) stops.set(st.floor, []); stops.get(st.floor).push({ link: k, i, x: st.x, z: st.z }); });
  }
  const inBox = (f, x, z) => { const b = box(f); return !b || (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1); };
  const add = (s) => {
    if (!s || s.slope || !floors(s.floor) || !inBox(s.floor, s.x, s.z)) return;
    const k = key(s.floor, s.x, s.z, cell);
    if (seen.has(k)) return;
    if (seen.size >= maxCells) throw new Error(`floodNav: more than ${maxCells} cells; tighten floors / box`);
    seen.set(k, s); queue.push(s);
    if (goal) goal.delete(s.floor);
  };
  const linkTargets = (s) => {
    const out = [];
    for (const st of stops.get(s.floor) || []) {
      if (Math.hypot(st.x - s.x, st.z - s.z) > NAV.reach) continue;
      const list = st.link.kind === 'stair' ? [st.link.stops[st.i - 1], st.link.stops[st.i + 1]].filter(Boolean) : st.link.stops.filter((_, j) => j !== st.i);
      for (const q of list) out.push({ floor: q.floor, x: q.x, z: q.z, y: nav.floors.get(q.floor)?.y ?? 0, slope: null });
    }
    return out;
  };
  /** Ride a slope state to whichever end it leads away from. */
  const ride = (t) => {
    const sl = nav.slopeById.get(t.slope.id), sign = t.slope.u < sl.len / 2 ? 1 : -1, d = 0.25;
    for (let i = 0; t.slope && i < Math.ceil(sl.len / d) + 8; i++) t = step(nav, t, sl.F.c * d * sign, sl.F.s * d * sign, 0);
    return t.slope ? null : t;
  };
  for (const p of starts) {
    const s = { floor: p.floor, x: p.x, z: p.z, y: nav.floors.get(p.floor)?.y ?? 0, slope: null };
    if (!clear(nav, s)) throw new Error(`floodNav: start ${p.floor} (${p.x}, ${p.z}) is not standable`);
    add(s);
  }
  while (queue.length && !(goal && !goal.size)) {
    const s = queue.pop();
    const i = Math.floor(s.x / cell), j = Math.floor(s.z / cell);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = (i + di + 0.5) * cell, cz = (j + dj + 0.5) * cell;
      let t = step(nav, s, cx - s.x, cz - s.z, 0);
      if (t.slope) t = ride(t);
      if (!t || (t.floor === s.floor && Math.hypot(t.x - s.x, t.z - s.z) < 0.05)) continue;
      add(t);
    }
    for (const t of linkTargets(s)) if (clear(nav, t)) add(t);
  }
  const counts = new Map();
  for (const s of seen.values()) counts.set(s.floor, (counts.get(s.floor) || 0) + 1);
  return { floors: counts, reached: (id) => counts.has(id), at: (id) => [...seen.values()].filter((s) => s.floor === id).map((s) => [s.x, s.z]) };
}

/** The floors in `protectedFloors` that a flood from `starts` reaches (empty = no bypass). */
export function bypasses(nav, starts, protectedFloors, opts = {}) {
  const r = floodNav(nav, starts, opts);
  return protectedFloors.filter((id) => r.reached(id));
}

/**
 * The flood setup of one gated tower of a real layout: { starts, floors, box, protectedFloors }.
 *   starts: the reader of every card gate of the tower (always on the side without access) and, when
 *           given, extra public points; protectedFloors: the tower's own levels that hold homes.
 *   floors: the tower's own and host levels, its stair landings, the floors of its gates, the floors its
 *           entrances open onto and 'ground'; box: everything that is not the tower's own is cut to the
 *           tower bounds ± margin, so the flood stays local (a bypass would have to leave and re-enter
 *           the box to be missed).
 */
export function towerFlood(L, nav, bid, { margin = 25, extraStarts = [] } = {}) {
  const b = L.buildings.find((q) => q.id === bid);
  const own = new Set(b.levels), zoneOf = new Map((L.accessControl?.zones || []).map((z) => [z.id, z]));
  const gates = (L.accessControl?.gates || []).filter((g) => (g.building ?? zoneOf.get(g.zone)?.building) === bid);
  const ok = new Set([...own, ...(b.hostLevels || []), ...gates.flatMap((g) => g.floors), 'ground',
    ...(b.access?.surfaces || []).map((s) => s.id),
    ...L.entrances.filter((e) => own.has(e.level) || (b.hostLevels || []).includes(e.level)).map((e) => e.to).filter((t) => nav.floors.has(t))]);
  const bb = b.bounds, area = { x0: bb.x0 - margin, z0: bb.z0 - margin, x1: bb.x1 + margin, z1: bb.z1 + margin };
  const starts = [...gates.map((g) => {
    const [x, z] = [g.frame.ox + g.reader.u * g.frame.c - g.reader.v * g.frame.s, g.frame.oz + g.reader.u * g.frame.s + g.reader.v * g.frame.c];
    return { floor: g.floors[0], x, z, gate: g.id };
  }), ...extraStarts];
  const protectedFloors = L.levels.filter((lv) => own.has(lv.id) && lv.units.some((u) => u.residence)).map((lv) => lv.id);
  return { starts, protectedFloors, floors: (id) => ok.has(id) || (nav.floors.get(id)?.parentFloor != null && ok.has(nav.floors.get(id).parentFloor)),
    box: (id) => (own.has(id) || nav.floors.get(id)?.building === bid ? null : area) };
}
