// Campus totals = base.js + every package delta file in this folder (SPEC §2.1 "campus deltas", C-6 / C-7).
// A delta file exports default { levels, lifts, records, homes, west, north, gates, zones, residenceAccess,
// stairs, shops (numbers, added to the base), hardstands: [[id, building]] (added to site.fireAccess),
// compactIdentical: { remove: [building ids] }, expansionChanged: [record groups changed on purpose],
// noBypass: [{ tower, floors?, starts? }] (gated towers for tests/no-bypass.test.js) }.
// Every field is optional. Each package edits only its own file, so the pinned totals never conflict:
//   north.js (P-north), west.js (P-west), r.js (P-R), ha.js (P-HA).
// Readers: riverside-integration (counts, site.fireAccess), residence-access, suite-nav, p1-expansion-layout,
// expansion-additive.
import { readdirSync } from 'node:fs';
import base from './base.js';

export const COUNTS = Object.freeze(['levels', 'lifts', 'stairs', 'shops', 'records', 'homes', 'west', 'north', 'gates', 'zones', 'residenceAccess']);
const FIELDS = new Set([...COUNTS, 'hardstands', 'compactIdentical', 'expansionChanged', 'noBypass']);

const here = new URL('./', import.meta.url);
const files = readdirSync(here).filter((f) => f.endsWith('.js') && f !== 'index.js' && f !== 'base.js').sort();
/** [{ file, ...delta }] of every package delta, in file order. */
export const DELTAS = Object.freeze(await Promise.all(files.map(async (file) => {
  const d = (await import(new URL(file, here))).default || {};
  for (const k of Object.keys(d)) if (!FIELDS.has(k)) throw new Error(`tests/campus-deltas/${file}: unknown field ${k}`);
  for (const k of COUNTS) if (d[k] != null && !Number.isInteger(d[k])) throw new Error(`tests/campus-deltas/${file}: ${k} must be an integer`);
  return Object.freeze({ file, ...d });
})));

/** The campus totals of the expansion layout: { levels, lifts, …, residenceAccess }. */
export const CAMPUS = Object.freeze(Object.fromEntries(COUNTS.map((k) => [k, DELTAS.reduce((n, d) => n + (d[k] || 0), base[k])])));
/** [id, building] pairs that site.fireAccess holds (any order), sorted by id. */
export const HARDSTANDS = Object.freeze([...base.hardstands, ...DELTAS.flatMap((d) => d.hardstands || [])]
  .map(([id, b]) => Object.freeze([id, b])).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
const removed = new Set(DELTAS.flatMap((d) => d.compactIdentical?.remove || []));
/** Buildings still identical between the compact and expansion layouts. */
export const COMPACT_IDENTICAL = Object.freeze(base.compactIdentical.keep.filter((id) => !removed.has(id)));
const changed = new Set(DELTAS.flatMap((d) => d.expansionChanged || []));
/** { group: sha256 } that the expansion layout must still match (base groups minus every expansionChanged). */
export const EXPANSION_BASELINE = Object.freeze(Object.fromEntries(Object.entries(base.expansionGroups).filter(([g]) => !changed.has(g))));
/** Gated towers the no-bypass test walks: base.noBypass plus every package's own entries. */
export const NO_BYPASS = Object.freeze([...base.noBypass, ...DELTAS.flatMap((d) => d.noBypass || [])].map((e) => Object.freeze({ ...e })));
export { base as BASE };
