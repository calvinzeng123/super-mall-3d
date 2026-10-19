// The phone runtime owns only the first-phase mall and its attached hotel and
// apartments. The full authoring layout remains available for legacy tools.
import { buildLayout } from './layout.js';
import { rect, rectPoly, clipConvex } from './geom.js';
import { addMissionCollision } from '../fps/mission-layout.js';

const BUILDINGS = new Set(['P1', 'H', 'A']);
export const PLAYABLE_BOUNDS = Object.freeze({ x0: -304, z0: -270, x1: -8, z1: -18 });
const FPS_FLOORS = new Set(['P1-B2', 'P1-B1', 'P1-B1M', 'P1-1F', 'P1-2F',
  'H-B2', 'H-B1', 'H-1F', 'H-2F', 'H-3F', 'A-B2', 'A-B1', 'A-1F', 'A-2F', 'A-3F']);
const inside = ([x, z]) => x >= PLAYABLE_BOUNDS.x0 && x <= PLAYABLE_BOUNDS.x1
  && z >= PLAYABLE_BOUNDS.z0 && z <= PLAYABLE_BOUNDS.z1;
const within = p => p?.length > 2 && p.every(inside);
const clip = p => clipConvex(p, rectPoly(PLAYABLE_BOUNDS));
const clippedRect = item => {
  const r = item.rect;
  if (!r) return null;
  const x0 = Math.max(r.x0, PLAYABLE_BOUNDS.x0), z0 = Math.max(r.z0, PLAYABLE_BOUNDS.z0);
  const x1 = Math.min(r.x1, PLAYABLE_BOUNDS.x1), z1 = Math.min(r.z1, PLAYABLE_BOUNDS.z1);
  if (x1 - x0 < .1 || z1 - z0 < .1) return null;
  const bounds = rect(x0, z0, x1, z1);
  return { ...item, rect: bounds, poly: rectPoly(bounds) };
};

function capFor(building, roof, levels) {
  const last = levels.filter(l => l.building === building.id).at(-1);
  const elev = +(last.elev + last.height).toFixed(3);
  return { ...roof, elev, height: 1.2, name: '封闭屋顶', playableCap: true,
    units: [], rooms: [], walk: [], voids: [], features: [],
    slab: { pieces: [{ outer: building.outline, holes: [] }] } };
}

/** Physically discard unused data before any meshes, physics or people exist.
 * Tour keeps the original P1/H/A floors. FPS has two retail floors and three
 * tower floors, connected basements and solid lightweight caps. */
export function buildPlayableLayout({ mode = 'tour' } = {}) {
  if (!['tour', 'fps'].includes(mode)) throw new Error(`Unknown playable mode: ${mode}`);
  const layout = buildLayout(), full = {
    buildings: layout.buildings.length, levels: layout.levels.length,
    dwellings: layout.levels.reduce((n, l) => n + l.units.filter(u => u.residence).length, 0),
  };
  const buildings = layout.buildings.filter(b => BUILDINGS.has(b.id));
  let levels = layout.levels.filter(l => BUILDINGS.has(l.building) && (mode === 'tour' || FPS_FLOORS.has(l.id)));
  for (const level of levels) if (['H-B1', 'A-B1'].includes(level.id)) {
    level.name = 'B1 住客车库与商场连廊';
    level.theme = { ...level.theme, label: '独立车库出入口 · 商场地下连通' };
  }
  const walkableIds = new Set(levels.map(l => l.id));
  if (mode === 'fps') {
    for (const b of buildings) {
      const roof = layout.levels.find(l => l.building === b.id && l.kind === 'roof');
      levels.push(capFor(b, roof, levels));
    }
    levels.sort((a, b) => buildings.findIndex(v => v.id === a.building) - buildings.findIndex(v => v.id === b.building) || a.elev - b.elev);
  }
  const levelIds = new Set(levels.map(l => l.id));
  const validEnd = id => id === 'site' || id === 'street' || id === 'ground' || walkableIds.has(id);
  for (const b of buildings) {
    const owned = levels.filter(l => l.building === b.id);
    b.levels = owned.map(l => l.id);
    if (mode === 'fps') {
      b.height = owned.at(-1).elev;
      if (b.kind === 'tower') { b.storeys = 3; b.massing = { ...b.massing, top: b.height }; }
    }
    if (b.access) {
      const routes = b.access.routes.filter(r => walkableIds.has(r.from) && walkableIds.has(r.to));
      const surfaceIds = new Set(routes.flatMap(r => r.landings || [r.landing]).filter(Boolean));
      const supports = new Set([...walkableIds, ...surfaceIds]);
      b.access = { ...b.access, routes,
        surfaces: b.access.surfaces.filter(s => surfaceIds.has(s.id)),
        flights: b.access.flights.filter(f => supports.has(f.from) && supports.has(f.to)),
      };
    }
  }
  layout.buildings = buildings; layout.levels = levels;
  for (const key of ['stairs', 'elevators']) layout[key] = layout[key]
    .filter(item => BUILDINGS.has(item.building))
    .map(item => ({ ...item, serves: item.serves.filter(id => walkableIds.has(id)),
      ...(item.wdoorByLevel ? { wdoorByLevel: Object.fromEntries(Object.entries(item.wdoorByLevel).filter(([id]) => walkableIds.has(id))) } : {}),
      ...(item.doorByLevel ? { doorByLevel: Object.fromEntries(Object.entries(item.doorByLevel).filter(([id]) => walkableIds.has(id))) } : {}),
      ...(item.originalDoorByLevel ? { originalDoorByLevel: Object.fromEntries(Object.entries(item.originalDoorByLevel).filter(([id]) => walkableIds.has(id))) } : {}),
    })).filter(item => item.serves.length);
  layout.escalators = layout.escalators.filter(e => walkableIds.has(e.from) && walkableIds.has(e.to));
  layout.ramps = layout.ramps.filter(r => BUILDINGS.has(r.building) && validEnd(r.from.level) && validEnd(r.to.level));
  layout.entrances = layout.entrances.filter(e => BUILDINGS.has(e.building) && walkableIds.has(e.level) && validEnd(e.to));
  layout.bridges = null;
  const ext = layout.extensions;
  layout.extensions = {
    districts: ext.districts.filter(d => d.buildingIds.every(id => BUILDINGS.has(id))),
    paths: ext.paths.filter(p => p.level ? walkableIds.has(p.level) && validEnd(p.from) && validEnd(p.to)
      : p.kind === 'ground' && p.polys.every(within)),
    roads: ext.roads.filter(r => r.polys.every(within)),
    connections: ext.connections.filter(c => walkableIds.has(c.from) && walkableIds.has(c.to)),
    gateways: ext.gateways.filter(g => walkableIds.has(g.level)),
    surfaceParking: ext.surfaceParking.filter(p => p.id === 'hotel-shared-parking'),
  };
  for (const item of [...layout.entrances, ...layout.extensions.paths]) {
    if (item.name?.includes('地铁')) item.name = item.name.replace(' · 地铁', '').replace('地铁', '地下');
  }
  const old = layout.site;
  const roads = old.roads.filter(r => ['ring-w', 'ring-n', 'xingwan'].includes(r.id)).map(clippedRect).filter(Boolean);
  const sidewalks = old.sidewalks.map(clippedRect).filter(Boolean);
  const crossings = old.crossings.filter(c => ['x-av-w', 'x-xw-n'].includes(c.id)).map(clippedRect).filter(Boolean);
  const plazas = old.plazas.filter(p => BUILDINGS.has(p.building)).map(p => ({ ...p, poly: clip(p.poly) })).filter(p => p.poly.length >= 3);
  layout.site = {
    bounds: { ...PLAYABLE_BOUNDS }, roads, sidewalks, crossings,
    plots: old.plots.filter(p => p.id === 'P1'), plazas,
    walk: [...sidewalks, ...crossings].map(p => ({ id: p.id, kind: 'sidewalk', poly: p.poly, outdoor: true })),
    driveways: old.driveways.filter(within), trenches: old.trenches.filter(within),
    openings: [], features: [], activityExclusions: [],
  };
  layout.playable = { mode, bounds: { ...PLAYABLE_BOUNDS }, buildingIds: [...BUILDINGS],
    walkableLevelIds: [...walkableIds], full, levels: levelIds.size, capped: mode === 'fps' };
  if (mode === 'fps') addMissionCollision(layout);
  return layout;
}
