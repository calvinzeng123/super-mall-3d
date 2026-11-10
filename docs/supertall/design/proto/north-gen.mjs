// Prototype: generate the ~200 m 北苑 home stack with the existing generator (no generator changes).
// Usage: node north-gen.mjs <worktree> <T1|T2> <out.json>
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [wt, tid, out] = process.argv.slice(2);
const { generateHome, generateDuplex, validateHome, planSignature: sig } = await import(pathToFileURL(path.join(wt, 'src/layout/community-plan.js')).href);
const T = tid === 'T1' ? { id: 'T1', plate: [-278, -242], core: [-264, -256], hTop: 48 } : { id: 'T2', plate: [-228, -196], core: [-216, -208], hTop: 44 };
const ENTRY_W = 4.8, ENTRY_E = 16 - 4.8;
const wingW = T.core[0] - T.plate[0], wingE = T.plate[1] - T.core[1];
const homes = [], used = new Set(), t0 = Date.now(), timing = {};
const base = (side) => ({ w: 16, d: side === 'W' ? wingW : wingE, exposed: { left: true, right: true }, lux: true,
  entryAt: side === 'W' ? ENTRY_W : ENTRY_E, view: side === 'W' ? 'left' : 'right' });
const tick = (k, t) => { timing[k] = (timing[k] || 0) + (Date.now() - t); };
function flat(n, side, type, kind = 'flat') {
  const t = Date.now(), b = { ...base(side), id: `${T.id}-${n}${side}`, type };
  let found = null, tries = 0;
  for (let v = (n * 3 + (side === 'E' ? 7 : 0)) % 16, k = 0; k < 60 && !found; v++, k++) {
    tries++;
    const g = generateHome({ ...b, variant: v, exclude: [...used] });
    if (g && !used.has(g.meta.key) && !used.has(sig(g.residence))) { used.add(g.meta.key); used.add(sig(g.residence)); found = { spec: { ...b, variant: v }, g }; }
  }
  tick(kind, t);
  homes.push({ id: `${T.id}-${String(n).padStart(2, '0')}${side}`, kind, side, levels: [n], parts: [found || { spec: b, g: null }], tries });
}
function duplex(n, side, type, kind, voidAbove) {
  const t = Date.now();
  const spec = { ...base(side), id: `${T.id}-${n}${side}`, type, voidAbove, variant: (n * 5 + side.charCodeAt(0)) % 16 };
  let dup = null, tries = 0;
  for (let v = 0; v < 30 && !dup; v++) {
    tries++;
    const g = generateDuplex({ ...spec, variant: spec.variant + v }, { exclude: [...used] });
    if (g && !used.has(g.key) && !used.has(sig(g.lower.residence) + '|' + sig(g.upper.residence))) dup = g;
    if (!dup && spec.voidAbove && v === 14) spec.voidAbove = false;
  }
  if (dup) { used.add(dup.key); used.add(dup.lower.meta.key); used.add(dup.upper.meta.key); used.add(sig(dup.lower.residence) + '|' + sig(dup.upper.residence)); }
  tick(kind, t);
  homes.push({ id: `${T.id}-${n}${side}`, kind, side, levels: [n, n + 1], voidRect: dup?.voidRect || null, tries,
    parts: dup ? [{ spec: { ...spec, level: 'lower' }, g: dup.lower }, { spec: { ...spec, level: 'upper' }, g: dup.upper }] : [{ spec, g: null }] });
}
const flatTypes = ['3BR', '4BR', '4BR', '3BR', '4BR', '3BR'];
for (const n of [8, 9, ...Array.from({ length: 12 }, (_, i) => 11 + i)]) for (const side of ['W', 'E']) flat(n, side, flatTypes[(n - 8 + (side === 'E' ? 1 : 0)) % 6]);
// M band 24F–36F interlocked: W starts even 24..34, E starts odd 25..35; 24E and 36W single-level.
flat(24, 'E', '3BR', 'end-flat'); flat(36, 'W', '4BR', 'end-flat');
for (let n = 24; n <= 35; n++) { const side = n % 2 === 0 ? 'W' : 'E', k = (n - 24) >> 1; duplex(n, side, ['4BR', '5BR'][k % 2], 'duplex', k % 2 === 0); }
// H band 38F..: aligned two-level 双层大宅, both sides start on even floors; the top pair is the penthouse.
for (let n = 38; n <= T.hTop; n += 2) for (const side of ['W', 'E']) duplex(n, side, '5BR', n === T.hTop ? 'penthouse' : 'sky-mansion', true);
const bad = homes.filter((h) => !h.parts.every((p) => p.g));
const errs = homes.flatMap((h) => h.parts.flatMap((p) => p.g ? validateHome(p.g.residence, { ...p.spec, level: p.spec.level || 'flat' }).map((e) => `${p.spec.id}:${e}`) : []));
const sigs = homes.filter((h) => h.parts.every((p) => p.g)).map((h) => h.parts.map((p) => sig(p.g.residence)).join('|'));
const data = homes.map((h) => ({ id: h.id, kind: h.kind, side: h.side, levels: h.levels, voidRect: h.voidRect || null,
  parts: h.parts.map((p) => ({ id: p.spec.id, level: p.spec.level || 'flat', type: p.spec.type, plan: p.g?.residence || null })) }));
const json = data.map((h) => JSON.stringify(h)).join(',\n');
const summary = { tower: T.id, homes: homes.length, levelPlans: homes.reduce((n, h) => n + h.parts.length, 0), missing: bad.map((h) => h.id), validateErrors: errs.length,
  distinct: new Set(sigs).size, seconds: (Date.now() - t0) / 1000, timingSec: Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, v / 1000])),
  bytes: Buffer.byteLength(json), voids: homes.filter((h) => h.voidRect).length, maxTries: Math.max(...homes.map((h) => h.tries)),
  byKind: Object.fromEntries([...new Set(homes.map((h) => h.kind))].map((k) => [k, homes.filter((h) => h.kind === k).length])),
  areas: Object.fromEntries([...new Set(homes.map((h) => h.kind))].map((k) => { const a = homes.filter((h) => h.kind === k && h.parts.every((p) => p.g)).map((h) => h.parts.reduce((s, p) => s + p.g.residence.area, 0)); return [k, [Math.min(...a), Math.max(...a)]]; })) };
writeFileSync(out, JSON.stringify({ summary, homes: data }));
console.log(JSON.stringify(summary));
