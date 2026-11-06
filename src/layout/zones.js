// 楼层分区（zones as data, supertall P0a, SPEC §2.1 / §3.1）：b.zones feeds the floor rail, the directory,
// the lift keypad and the search box; lv.zone names the zone of an own level.
//   b.zones = [{ id, name, from, to, kind, levels, lifts, homes, host? }], bottom-up (the rail lists them
//   top-down). kind: 'basement' | 'lobby' | 'band' | 'refuge' | 'amenity' | 'podium' | 'roof'.
//   from / to: the lowest / highest level id; levels: every level id in the zone; lifts: lifts with a
//   normal-mode landing in the zone; homes: distinct homes on its levels; host: the levels belong to the
//   building the tower stands on (北苑 on 一期: they get no lv.zone).
// Expansion layout only. Towers that define their bands set b.zones themselves; towerZones() derives a
// default from the level kinds for the others, and applyTowerZones() writes it where none is set.
export const ZONE_KINDS = Object.freeze(['basement', 'lobby', 'band', 'refuge', 'amenity', 'podium', 'roof']);
const SINGLE = new Set(['lobby', 'refuge', 'amenity', 'roof']);

const num = (lv) => lv.levelNumber ?? (/^(\d+)F$/.exec(lv.short || '') ? +/^(\d+)F$/.exec(lv.short)[1] : null);
/** The name of a level without its storey prefix ('14F 错层复式' → '错层复式'). */
const tail = (lv) => (lv.name || '').replace(new RegExp(`^${lv.short}\\s*`), '').trim();

/** Zone kind of one level of tower b (host: a level of the building the tower stands on). */
export function levelZoneKind(lv, host = false) {
  if (host) return lv.elev < 0 ? 'basement' : num(lv) === 1 ? 'lobby' : 'podium';
  if (lv.kind === 'refuge') return 'refuge';
  if (lv.kind === 'roof') return 'roof';
  if (lv.elev < 0 || lv.kind === 'parking' || lv.kind === 'garage-lobby') return 'basement';
  if (lv.kind === 'lobby' || num(lv) === 1) return 'lobby';
  if (lv.kind === 'club' || lv.kind === 'amenity' || lv.amenityPlan) return 'amenity';
  return 'band';
}

const range = (list) => {
  const a = num(list[0]), b = num(list.at(-1));
  return a == null || b == null ? list.map((l) => l.short).join(' / ') : a === b ? `${a}F` : `${a}–${b}F`;
};
function zoneName(kind, list, host) {
  if (kind === 'basement') return `${list.filter((l) => !host || !l.passLevel).map((l) => l.short).reverse().join(' / ')} 地下`;
  if (host) return kind === 'lobby' ? `${range(list)} 住户大堂` : `${range(list)} 裙房 · 电梯直达`;
  if (SINGLE.has(kind)) return list[0].name || list[0].short;
  return `${tail(list[0]) || '住宅'} ${range(list)}`;
}

/**
 * Default zones of tower b, bottom-up. levels: the layout's levels (or any list holding the tower's own
 * levels and its host levels); opts.elevators: lift records (their normal-mode stops fill `lifts`);
 * opts.passLevels: host levels its cores pass sealed (named out of the basement title).
 * Bands split where the level kind or the level name changes (8–13F 江景大平层 | 14–24F 错层复式);
 * every refuge, amenity, lobby and roof level is a zone of its own.
 */
export function towerZones(b, levels, { elevators = [], passLevels = [] } = {}) {
  const byId = new Map(levels.map((l) => [l.id, l])), hostIds = new Set(b.hostLevels || []);
  const list = [...(b.hostLevels || []), ...(b.levels || [])].map((id) => byId.get(id)).filter(Boolean)
    .map((lv) => ({ lv, host: hostIds.has(lv.id), kind: levelZoneKind(lv, hostIds.has(lv.id)) }))
    .sort((a, z) => a.lv.elev - z.lv.elev);
  const pass = new Set(passLevels);
  const runs = [];
  for (const q of list) {
    const r = runs.at(-1), key = `${q.host}|${q.kind}|${q.kind === 'band' ? `${q.lv.kind}|${tail(q.lv)}` : ''}`;
    if (r && r.key === key && !SINGLE.has(q.kind)) r.items.push(q);
    else runs.push({ key, kind: q.kind, host: q.host, items: [q] });
  }
  const lifts = elevators.filter((e) => e.building === b.id || e.residentialCore === b.id);
  return runs.map((r) => {
    const lvs = r.items.map((q) => q.lv), ids = lvs.map((l) => l.id), set = new Set(ids);
    const homes = new Set(lvs.flatMap((l) => (l.units || []).filter((u) => u.residence).map((u) => u.residence.home ?? u.id)));
    const named = lvs.map((l) => (pass.has(l.id) ? { ...l, passLevel: true } : l));
    return { id: `${b.id}-${r.kind}-${lvs[0].short}`, name: zoneName(r.kind, named, r.host), from: ids[0], to: ids.at(-1), kind: r.kind,
      levels: ids, lifts: lifts.filter((e) => e.serves.some((id) => set.has(id))).map((e) => e.id), homes: homes.size, ...(r.host ? { host: true } : {}) };
  });
}

/** The zone of level id in b.zones, or null. */
export const zoneOf = (b, id) => (b.zones || []).find((z) => z.levels?.includes(id) || z.from === id || z.to === id) || null;

/**
 * Expansion-only pass: towers matching `filter` (default: the community towers, the only towers that
 * exist only in the expansion layout today) and without b.zones get towerZones(); every own level of a
 * zoned tower gets lv.zone. H / A / R stay unzoned until their supertall builders set zones (they are
 * compared record by record with the compact layout until then).
 */
export function applyTowerZones(layout, { filter = (b) => b.kind === 'tower' && !!b.community } = {}) {
  const byId = new Map(layout.levels.map((l) => [l.id, l]));
  for (const b of layout.buildings.filter(filter)) {
    const pass = [...new Set(layout.stairs.filter((s) => s.building === b.id).flatMap((s) => s.passLevels || []))];
    if (!b.zones) b.zones = towerZones(b, layout.levels, { elevators: layout.elevators, passLevels: pass });
    for (const z of b.zones) if (!z.host) for (const id of z.levels || [z.from, z.to]) { const lv = byId.get(id); if (lv && lv.building === b.id) lv.zone = z.id; }
  }
  return layout;
}
