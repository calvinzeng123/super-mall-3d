// Floor selection and cache policy are independent from Three.js. Structural
// geometry is never evicted; only complete, privately owned interior groups are.
import { pointInPoly } from '../layout/geom.js';

export function isStreamableFloor(level, building) {
  return ['mall', 'annex', 'street'].includes(building?.kind)
    && level.elev >= 0 && level.kind !== 'roof';
}

const segmentDistance = (position, seg) => {
  const dx = seg.x1 - seg.x0, dz = seg.z1 - seg.z0, length2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((position.x - seg.x0) * dx + (position.z - seg.z0) * dz) / (length2 || 1)));
  return Math.hypot(position.x - seg.x0 - dx * t, position.z - seg.z0 - dz * t);
};

export function createFloorDetailSelector(layout, { limit = 6, explodedLimit = 8, portalDistance = 40 } = {}) {
  const levels = new Map(layout.levels.map(l => [l.id, l]));
  const buildings = new Map(layout.buildings.map(b => [b.id, b]));
  const eligible = new Set(layout.levels.filter(l => isStreamableFloor(l, buildings.get(l.building))).map(l => l.id));
  const adjacent = new Map(), portals = new Map(), paths = layout.extensions?.paths || [];
  for (const b of layout.buildings) {
    const sorted = layout.levels.filter(l => l.building === b.id).sort((a, b) => a.elev - b.elev);
    sorted.forEach((level, i) => adjacent.set(level.id, [sorted[i - 1]?.id, sorted[i + 1]?.id].filter(Boolean)));
  }
  const connect = (a, b, seg, path) => {
    if (!levels.has(a) || !levels.has(b) || levels.get(a).building === levels.get(b).building) return;
    for (const [from, to] of [[a, b], [b, a]]) {
      if (!portals.has(from)) portals.set(from, new Map());
      if (!portals.get(from).has(to)) portals.get(from).set(to, { id: to, segments: [], paths: new Set() });
      const link = portals.get(from).get(to);
      if (seg) link.segments.push(seg);
      if (path) link.paths.add(path);
    }
  };
  for (const e of layout.entrances || []) connect(e.level, e.to, e.seg);
  for (const c of layout.extensions?.connections || []) connect(c.from, c.to, c.seg);
  for (const path of paths) {
    const from = path.from || path.level, to = path.to;
    connect(from, to, null, path);
    // Source architectural openings often point back to the source floor, so
    // include them explicitly: preload before stepping onto a long bridge.
    for (const e of layout.entrances || []) if (e.id?.startsWith(`${path.id}-`)) connect(from, to, e.seg, path);
  }
  let lastPrimary = null, lastRemote = null;

  const select = state => {
    const wanted = new Set();
    const add = id => { if (eligible.has(id) && wanted.size < limit) wanted.add(id); };
    // The building overview keeps façades and shells only. Exploded view still
    // draws every structural storey, but detail is a bounded window around the
    // selected floor (ground floors initially), including on mobile devices.
    if (!state.explore && state.exploded && state.building) {
      const center = levels.get(state.focus)?.elev ?? 0;
      const nearby = [...eligible].filter(id => levels.get(id).building === state.building)
        .sort((a, b) => Math.abs(levels.get(a).elev - center) - Math.abs(levels.get(b).elev - center)
          || levels.get(a).elev - levels.get(b).elev);
      lastPrimary = lastRemote = null;
      return new Set(nearby.slice(0, explodedLimit));
    }
    const ex = state.explore;
    const route = ex && paths.find(path => path.id === ex.level);
    const near = ex?.near && layout.levels.find(l => l.building === ex.near && l.short === '1F')?.id;
    const primary = levels.get(ex ? ex.level : state.focus)?.id || route?.level || ex?.elevator?.from || near;
    add(primary);
    for (const id of adjacent.get(primary) || []) add(id);
    // Preserve the current glass-elevator view and both immediate landings.
    // Only its explicit destination is required, not every served floor or
    // the now-distant departure floor throughout the whole ride.
    if (ex?.elevator?.to) {
      add(ex.elevator.to);
      for (const id of adjacent.get(ex.elevator.to) || []) add(id);
      lastPrimary = primary; lastRemote = null;
      return wanted;
    }
    if (ex && (ex.position || route)) {
      const preferred = primary === lastPrimary ? lastRemote : primary === lastRemote ? lastPrimary : null;
      const candidates = [];
      for (const link of portals.get(primary)?.values() || []) {
        if (!eligible.has(link.id)) continue;
        const onBridge = [...link.paths].some(path => path === route || ex.position && (path.slab?.pieces || [])
          .some(piece => pointInPoly([ex.position.x, ex.position.z], piece.outer)
            && !(piece.holes || []).some(hole => pointInPoly([ex.position.x, ex.position.z], hole))));
        const distance = ex.position ? Math.min(...link.segments.map(seg => segmentDistance(ex.position, seg))) : Infinity;
        if (!onBridge && distance > portalDistance + (link.id === preferred ? 12 : 0)) continue;
        // Keep a chosen bridge destination while traversing it. At a junction,
        // an 8m preference band avoids swapping on tiny movements; turning
        // toward a different doorway still selects it before crossing.
        candidates.push({ id: link.id, score: (onBridge ? -1000 : 0) + distance - (link.id === preferred ? 8 : 0) });
      }
      candidates.sort((a, b) => a.score - b.score);
      const remote = candidates[0]?.id;
      add(remote);
      lastPrimary = primary; lastRemote = remote || null;
    } else { lastPrimary = primary; lastRemote = null; }
    return wanted;
  };
  return { eligible, select };
}

export function createFloorDetailCache({ build, limit = 4, hardLimit = Infinity, onError = () => {} }) {
  const resident = new Map(), errors = new Map();
  let wanted = new Set();
  let requests = 0, builds = 0, hits = 0, evictions = 0, disposed = 0;
  const remove = (id, eviction = true) => {
    const item = resident.get(id);
    if (!item) return;
    item.dispose(); resident.delete(id); disposed++;
    if (eviction) evictions++;
  };
  const cache = {
    sync(ids) {
      const next = new Set([...ids].slice(0, hardLimit));
      const capacity = Math.min(hardLimit, Math.max(limit, next.size));
      // Free old GPU buffers before allocating the next large floor, so moving
      // between buildings does not briefly double the memory high-water mark.
      const missing = [...next].filter(id => !resident.has(id) && !errors.has(id)).length;
      for (const id of resident.keys()) {
        if (resident.size + missing <= capacity) break;
        if (!next.has(id)) remove(id);
      }
      for (const id of next) {
        if (!wanted.has(id)) { requests++; if (resident.has(id)) hits++; }
        if (resident.has(id)) {
          const item = resident.get(id); resident.delete(id); resident.set(id, item);
        } else if (!errors.has(id)) {
          try { resident.set(id, build(id)); builds++; }
          catch (error) { errors.set(id, error); onError(error, id); }
        }
      }
      wanted = next;
      for (const [id, item] of resident) item.setVisible?.(wanted.has(id));
      // Leaving exploded view immediately returns to the bounded cache.
      for (const id of resident.keys()) {
        if (resident.size <= capacity) break;
        if (!wanted.has(id)) remove(id);
      }
      return wanted;
    },
    retry(id) { errors.delete(id); },
    clear() { for (const id of [...resident.keys()]) remove(id, false); wanted.clear(); errors.clear(); },
    has: id => resident.has(id),
    active: id => wanted.has(id) && resident.has(id),
    get records() { return [...resident.values()]; },
    get stats() {
      return { limit, hardLimit, required: [...wanted], resident: [...resident.keys()], errors: [...errors.keys()],
        requests, builds, hits, evictions, disposed };
    },
  };
  return cache;
}
