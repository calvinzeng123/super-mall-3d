// Splits a layout into record groups and hashes each group, so a test can say which parts of the
// expansion layout changed against a pinned baseline (tests/expansion-additive.test.js).
//
// Groups: one per building id (its building record, levels, escalators, elevators, stairs,
// entrances, ramps, access zones and gates), plus one per remaining top-level key (site, bridges,
// extensions, …). The keys P0a adds on purpose (ADDITIVE) are stripped before hashing.
import { createHash } from 'node:crypto';

/** Keys the supertall P0a engine adds to the expansion layout, by record kind. */
export const ADDITIVE = Object.freeze({
  building: Object.freeze(['zones']),
  level: Object.freeze(['zone']),
  gate: Object.freeze(['releaseOnAlarm', 'role', 'leaf']),
});

const strip = (o, keys) => {
  if (!keys.some((k) => k in o)) return o;
  const out = { ...o };
  for (const k of keys) delete out[k];
  return out;
};

const RECORDS = ['escalators', 'elevators', 'stairs', 'entrances', 'ramps'];

/** Map group → { building?, levels, escalators, … } of the layout's records (additive keys stripped). */
export function layoutGroups(L) {
  const groups = new Map();
  const group = (id) => {
    if (!groups.has(id)) groups.set(id, { building: null, levels: [], escalators: [], elevators: [], stairs: [], entrances: [], ramps: [], zones: [], gates: [] });
    return groups.get(id);
  };
  for (const b of L.buildings) group(b.id).building = strip(b, ADDITIVE.building);
  for (const lv of L.levels) group(lv.building).levels.push(strip(lv, ADDITIVE.level));
  for (const k of RECORDS) for (const r of L[k] || []) group(r.building ?? '(none)')[k].push(r);
  const zoneBuilding = new Map((L.accessControl?.zones || []).map((z) => [z.id, z.building]));
  for (const z of L.accessControl?.zones || []) group(z.building).zones.push(z);
  for (const g of L.accessControl?.gates || []) group(g.building ?? zoneBuilding.get(g.zone) ?? '(none)').gates.push(strip(g, ADDITIVE.gate));
  const rest = Object.keys(L).filter((k) => !['buildings', 'levels', ...RECORDS].includes(k));
  for (const k of rest) {
    if (k === 'accessControl') { const { zones, gates, ...meta } = L[k]; groups.set('accessControl', meta); continue; }
    groups.set(k, L[k]);
  }
  return groups;
}

/** { group: sha256 } of every group. */
export function groupHashes(L) {
  const out = {};
  for (const [id, g] of layoutGroups(L)) out[id] = createHash('sha256').update(JSON.stringify(g) ?? 'undefined').digest('hex');
  return out;
}
