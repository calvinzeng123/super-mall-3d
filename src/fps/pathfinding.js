// Deterministic tactical navigation. Model/voice commands choose a destination;
// every movement and visibility decision is checked against the venue physics.
import { clear, step, sightBlocked } from '../layout/nav.js';
import { toW } from '../layout/geom.js';

const caches = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const asState = (nav, s) => ({ ...s, y: s.y ?? nav.floors.get(s.floor)?.y ?? 0, slope: s.slope || null });

/** Walk a segment using the same swept-collision solver as the player. */
export function traceMotion(nav, start, target, { stepSize = .24 } = {}) {
  let state = asState(nav, start);
  const dx = target.x - state.x, dz = target.z - state.z;
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / stepSize));
  for (let i = 1; i <= count; i++) {
    const tx = start.x + dx * i / count, tz = start.z + dz * i / count;
    const next = step(nav, state, tx - state.x, tz - state.z, 0);
    if (Math.hypot(next.x - tx, next.z - tz) > .035) return null;
    state = next;
  }
  return distance(state, target) < .04 && (!target.floor || state.floor === target.floor) && !state.slope ? state : null;
}

/** Advance the visible breadcrumb only when its replacement is physically
 * reachable from the player's current state. Proximity alone can skip the
 * aligned approach to a staircase, leaving the guide above a solid wall. */
export function advanceGuide(nav, route, player, index = 0) {
  if (!route?.length) return 0;
  let next = Math.min(index, route.length - 1), nearest = next, best = 3;
  for (let i = next + 1; i < route.length; i++) {
    if (route[i].floor !== player.floor) continue;
    const d = distance(player, route[i]);
    if (d < best && traceMotion(nav, player, route[i])) { best = d; nearest = i; }
  }
  next = nearest;
  while (next < route.length - 1 && route[next].floor === player.floor
    && distance(player, route[next]) < 1.6
    && traceMotion(nav, player, route[next + 1])) next++;
  return next;
}

function segmentCross(a, b, w) {
  const dx = b.x - a.x, dz = b.z - a.z, ex = w.x1 - w.x0, ez = w.z1 - w.z0;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((w.x0 - a.x) * ez - (w.z0 - a.z) * ex) / den;
  const u = ((w.x0 - a.x) * dz - (w.z0 - a.z) * dx) / den;
  return t > 1e-5 && t < 1 - 1e-5 && u >= 0 && u <= 1;
}

/** Conservative visibility: different navigation floors never shoot through
 * a ceiling or a portal boundary. Walls and occupied furniture block fire. */
export function hasLineOfSight(nav, a, b) {
  if (a.floor !== b.floor) return false;
  const floor = nav.floors.get(a.floor);
  if (!floor) return false;
  const ya = (a.y ?? floor.y) + (a.eye ?? 1.45), yb = (b.y ?? floor.y) + (b.eye ?? 1.45);
  if (sightBlocked(nav, [a.x, ya, a.z], [b.x, yb, b.z])) return false;
  for (const wall of floor.walls) if (segmentCross(a, b, wall)) return false;
  // The outer facade is represented by floor support and entrance portals in
  // player physics. Sampling support prevents seeing through its concave wings.
  const count = Math.max(1, Math.ceil(distance(a, b) / .65));
  for (let i = 1; i < count; i++) if (!clear(nav, { floor: a.floor,
    x: a.x + (b.x - a.x) * i / count, z: a.z + (b.z - a.z) * i / count })) return false;
  return true;
}

class Heap {
  constructor() { this.items = []; }
  push(value) {
    const a = this.items; a.push(value); let i = a.length - 1;
    while (i) { const p = (i - 1) >> 1; if (a[p].f <= value.f) break; a[i] = a[p]; i = p; }
    a[i] = value;
  }
  pop() {
    const a = this.items, first = a[0], end = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let j = i * 2 + 1; if (j + 1 < a.length && a[j + 1].f < a[j].f) j++;
        if (a[j].f >= end.f) break; a[i] = a[j]; i = j;
      }
      a[i] = end;
    }
    return first;
  }
  get length() { return this.items.length; }
}

function gridFor(nav, floor, cell) {
  if (!caches.has(nav)) caches.set(nav, { grids: new Map(), connectors: null });
  const key = `${floor}/${cell}`, all = caches.get(nav).grids;
  if (!all.has(key)) all.set(key, { walk: new Map(), edges: new Map() });
  return all.get(key);
}

function localPath(nav, a, b, { cellSize = .7, maxNodes = 18000 } = {}) {
  if (a.floor !== b.floor || !clear(nav, a) || !clear(nav, b)) return null;
  if (traceMotion(nav, a, b)) return [asState(nav, a), asState(nav, b)];
  const cache = gridFor(nav, a.floor, cellSize), y = nav.floors.get(a.floor).y;
  const point = (i, j) => ({ floor: a.floor, x: i * cellSize, z: j * cellSize, y, slope: null });
  const key = (i, j) => `${i},${j}`;
  const isOpen = (i, j) => {
    const k = key(i, j);
    if (!cache.walk.has(k)) cache.walk.set(k, clear(nav, point(i, j)));
    return cache.walk.get(k);
  };
  const edge = (i, j, ni, nj) => {
    const k = `${i},${j}>${ni},${nj}`;
    if (!cache.edges.has(k)) cache.edges.set(k, !!traceMotion(nav, point(i, j), point(ni, nj)));
    return cache.edges.get(k);
  };
  const starts = [], ends = new Map();
  for (const [which, s] of [[starts, a], [ends, b]]) {
    const cx = Math.round(s.x / cellSize), cz = Math.round(s.z / cellSize);
    for (let i = cx - 2; i <= cx + 2; i++) for (let j = cz - 2; j <= cz + 2; j++) {
      if (!isOpen(i, j)) continue;
      const p = point(i, j);
      if (!(which === starts ? traceMotion(nav, s, p) : traceMotion(nav, p, s))) continue;
      if (which === starts) starts.push({ i, j, p, cost: distance(s, p) });
      else ends.set(key(i, j), distance(s, p));
    }
  }
  if (!starts.length || !ends.size) return null;
  const open = new Heap(), costs = new Map(), parents = new Map();
  for (const s of starts) { const k = key(s.i, s.j); costs.set(k, s.cost); open.push({ ...s, k, g: s.cost, f: s.cost + distance(s.p, b) }); }
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let visited = 0, found = null;
  while (open.length && visited++ < maxNodes) {
    const cur = open.pop();
    if (cur.g > costs.get(cur.k) + 1e-6) continue;
    if (ends.has(cur.k)) { found = cur; break; }
    for (const [di, dj] of offsets) {
      const i = cur.i + di, j = cur.j + dj, k = key(i, j), g = cur.g + Math.hypot(di, dj) * cellSize;
      if (g >= (costs.get(k) ?? Infinity) || !isOpen(i, j) || !edge(cur.i, cur.j, i, j)) continue;
      costs.set(k, g); parents.set(k, cur.k);
      const p = point(i, j); open.push({ i, j, k, g, f: g + distance(p, b) });
    }
  }
  if (!found) return null;
  const raw = [asState(nav, b)]; let k = found.k;
  while (k) { const [i, j] = k.split(',').map(Number); raw.push(point(i, j)); k = parents.get(k); }
  raw.push(asState(nav, a)); raw.reverse();
  // Keep corner nodes only; never smooth through a wall or across a portal.
  const result = [raw[0]];
  for (let i = 0; i < raw.length - 1;) {
    let j = Math.min(raw.length - 1, i + 18);
    while (j > i + 1 && !traceMotion(nav, raw[i], raw[j])) j--;
    result.push(raw[j]); i = j;
  }
  return result;
}

function connectorsFor(nav) {
  if (!caches.has(nav)) caches.set(nav, { grids: new Map(), connectors: null });
  const cache = caches.get(nav);
  if (cache.connectors) return cache.connectors;
  const connectors = [], add = (id, a, b, points, kind) => {
    connectors.push({ id, a, b, points, kind });
    connectors.push({ id: `${id}:reverse`, a: b, b: a, points: [...points].reverse(), kind });
  };
  for (const [index, p] of nav.portals.entries()) {
    if (p.a === p.b) continue;
    const { x0, z0, x1, z1 } = p.seg, length = Math.hypot(x1 - x0, z1 - z0);
    const nx = -(z1 - z0) / length, nz = (x1 - x0) / length, x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    let found = false;
    for (const sign of [-1, 1]) for (const d of [.75, 1.1]) {
      if (found) continue;
      const a = asState(nav, { floor: p.a, x: x + nx * d * sign, z: z + nz * d * sign });
      const b = asState(nav, { floor: p.b, x: x - nx * d * sign, z: z - nz * d * sign });
      if (clear(nav, a) && clear(nav, b) && traceMotion(nav, a, b) && traceMotion(nav, b, a)) { add(`portal-${index}`, a, b, [a, b], 'portal'); found = true; }
    }
  }
  for (const sl of nav.slopes) {
    let found = false;
    for (const d of [.5, .7, .9]) {
      if (found) continue;
      const lo = toW(sl.F, -d, 0), hi = toW(sl.F, sl.len + d, 0);
      const a = asState(nav, { floor: sl.low, x: lo[0], z: lo[1] }), b = asState(nav, { floor: sl.high, x: hi[0], z: hi[1] });
      if (clear(nav, a) && clear(nav, b) && traceMotion(nav, a, b) && traceMotion(nav, b, a)) { add(sl.id, a, b, [a, b], sl.kind); found = true; }
    }
  }
  cache.connectors = connectors;
  return connectors;
}

function connectorRoute(nav, start, target, banned) {
  const all = connectorsFor(nav), floors = new Map();
  all.forEach((c, i) => { c.index = i; if (!floors.has(c.a.floor)) floors.set(c.a.floor, []); floors.get(c.a.floor).push(c); });
  const heap = new Heap(), costs = new Map(), parents = new Map();
  heap.push({ id: -1, p: start, g: 0, f: distance(start, target) }); costs.set(-1, 0);
  while (heap.length) {
    const cur = heap.pop(); if (cur.g > costs.get(cur.id) + 1e-6) continue;
    if (cur.p.floor === target.floor && !banned.has(`${cur.id}>target`)) {
      const route = []; let id = cur.id;
      while (id !== -1) { route.unshift(all[id]); id = parents.get(id); }
      return route;
    }
    for (const c of floors.get(cur.p.floor) || []) {
      if (banned.has(`${cur.id}>${c.index}`)) continue;
      const g = cur.g + distance(cur.p, c.a) + distance(c.a, c.b) + Math.abs(c.a.y - c.b.y) * 2;
      if (g >= (costs.get(c.index) ?? Infinity)) continue;
      costs.set(c.index, g); parents.set(c.index, cur.id);
      heap.push({ id: c.index, p: c.b, g, f: g + distance(c.b, target) + Math.abs(c.b.y - (target.y ?? 0)) * 2 });
    }
  }
  return null;
}

/** Returns [start, ...waypoints, target], or null when no physical route exists.
 * Routes contain ordinary states only. Feed their positions to nav.step; the
 * solver handles the intervening continuous slope/portal state transitions. */
export function findPath(nav, start, target, options = {}) {
  const a = asState(nav, start), b = asState(nav, target);
  if (!clear(nav, a) || !clear(nav, b)) return null;
  if (a.floor === b.floor) return localPath(nav, a, b, options);
  const banned = new Set();
  for (let attempt = 0; attempt < 8; attempt++) {
    const route = connectorRoute(nav, a, b, banned);
    if (!route) return null;
    let result = [a], current = a, previous = -1, failed = false;
    for (const c of route) {
      const local = localPath(nav, current, c.a, options);
      if (!local) { banned.add(`${previous}>${c.index}`); failed = true; break; }
      result.push(...local.slice(1), ...c.points.slice(1)); current = c.b; previous = c.index;
    }
    if (failed) continue;
    const last = localPath(nav, current, b, options);
    if (last) return [...result, ...last.slice(1)];
    banned.add(`${previous}>target`);
  }
  return null;
}

export function clearPathfindingCache(nav) { caches.delete(nav); }
