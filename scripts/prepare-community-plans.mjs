/** Generate every 云澜·西苑 / 云澜·北苑 home plan, stack them per storey, validate them and
 * write the frozen data file src/layout/community-plan-data.js (≈ 80 s).
 * Usage: node scripts/prepare-community-plans.mjs [--west-only]
 * --west-only regenerates the west section and keeps the north section of the existing file.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateHome, generateDuplex, validateHome, planSignature as sig } from '../src/layout/community-plan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'src/layout/community-plan-data.js');
const quiet = () => {};

/* ------------------------------------------------------------------ 西苑 */
// Slab 43.4 × 19.2 (local: x east, z south, origin at slab centre). North row z[-9.6,-1.2],
// corridor z[-1.2,0.6], south row z[0.6,9.6]. Core (15.7 × 8.4) in the north row.
export const WEST = {
  slab: { w: 43.4, d: 19.2, north: [-9.6, -1.2], corridor: [-1.2, 0.6], south: [0.6, 9.6] },
  towers: [
    { id: 'W1', x: -458.3, z: -236.4, south: [['SW', '4BR', 17.0], ['S', '2BR', 10.6], ['SE', '3BR', 15.8]], north: [['NW', '3BR', 16.7], ['core', null, 15.7], ['NE', '2BR', 11.0]] },
    { id: 'W2', x: -392.3, z: -236.4, south: [['SW', '3BR', 14.6], ['S', '2BR', 11.2], ['SE', '4BR', 17.6]], north: [['NW', '2BR', 11.6], ['core', null, 15.7], ['NE', '3BR', 16.1]] },
  ],
};
/** The five 3梯5户 plans of one 西苑 tower (≈ 0.4 s). */
export function westTower(T, log = quiet) {
  const units = [];
  let x = -21.7;
  for (const [slot, type, w] of T.south) {
    const spec = { id: `${T.id}-${slot}`, type, w, d: 9.0, exposed: { left: slot === 'SW', right: slot === 'SE' }, variant: T.id === 'W1' ? 0 : 3 };
    const g = generateHome(spec);
    units.push({ slot, row: 'S', x0: x, x1: +(x + w).toFixed(2), frame: { ox: +x.toFixed(2), oz: 0.6, deg: 0 }, spec, g });
    x += w;
  }
  x = -21.7;
  let core = null;
  for (const [slot, type, w] of T.north) {
    if (slot === 'core') { core = { x0: +x.toFixed(2), x1: +(x + w).toFixed(2) }; x += w; continue; }
    // North units face north: frame deg 180 at their east end; world W is local right.
    const spec = { id: `${T.id}-${slot}`, type, w, d: 8.4, exposed: { left: slot === 'NE', right: slot === 'NW' }, balcony: false, variant: T.id === 'W1' ? 1 : 2 };
    const g = generateHome(spec);
    units.push({ slot, row: 'N', x0: +x.toFixed(2), x1: +(x + w).toFixed(2), frame: { ox: +(x + w).toFixed(2), oz: -1.2, deg: 180 }, spec, g });
    x += w;
  }
  const keys = new Set();
  for (const u of units) {
    if (!u.g) { log(`${u.spec.id} NO PLAN`); continue; }
    const errs = validateHome(u.g.residence, u.spec);
    keys.add(u.g.meta.key);
    const r = u.g.residence;
    log(`${u.spec.id.padEnd(7)} ${r.label} ${u.spec.w}×${u.spec.d}=${r.area}m² rooms ${r.rooms.length} beds ${r.beds.length} baths ${r.bathrooms.length} kitchen ${r.kitchen.open ? 'open' : 'window'} errs ${errs.length ? errs.join(';') : 'none'}`);
  }
  log(`${T.id}: mirror-invariant types ${new Set(units.filter(u => u.g).map(u => sig(u.g.residence))).size}/5 · core x[${core.x0},${core.x1}] · distinct plans per floor ${keys.size}/5`);
  return { ...T, core, units: units.map(u => ({ slot: u.slot, row: u.row, x0: u.x0, x1: u.x1, frame: u.frame, plan: u.g?.residence })) };
}

/* ------------------------------------------------------------------ 北苑 */
// Plate z[-240,-224]; core column 8 × 16 at the north facade line; homes W/E of the core.
export const NORTH = {
  towers: [
    { id: 'T1', plate: [-278, -242], core: [-264, -256] },
    { id: 'T2', plate: [-228, -196], core: [-216, -208] },
  ],
};
const ENTRY_W = 4.8, ENTRY_E = 16 - 4.8; // core landing at core z[4.25,5.35] (world z -235.2)
/** The 24 homes (大平层 + interlocking duplexes) of one 北苑 tower (≈ 40 s). */
export function northTower(T, log = quiet) {
  const wingW = T.core[0] - T.plate[0], wingE = T.plate[1] - T.core[1];
  const homes = [], used = new Set();
  const make = (side, spec) => {
    const base = { w: 16, d: side === 'W' ? wingW : wingE, exposed: { left: true, right: true }, lux: true,
      entryAt: side === 'W' ? ENTRY_W : ENTRY_E, view: side === 'W' ? 'left' : 'right', ...spec };
    for (let v = base.variant || 0; v < (base.variant || 0) + 40; v++) {
      const g = generateHome({ ...base, variant: v, exclude: [...used] });
      if (g && !used.has(g.meta.key) && !used.has(sig(g.residence))) { used.add(g.meta.key); used.add(sig(g.residence)); return { spec: { ...base, variant: v }, g }; }
    }
    return { spec: base, g: null };
  };
  // 大平层: 8F–13F both sides, 14F east, 24F west (penthouse).
  const flatTypes = ['3BR', '4BR', '4BR', '3BR', '4BR', '3BR'];
  for (let n = 8; n <= 13; n++) for (const side of ['W', 'E']) {
    const type = flatTypes[(n - 8 + (side === 'E' ? 1 : 0)) % 6];
    const h = make(side, { id: `${T.id}-${n}${side}`, type, variant: (n * 3 + (side === 'E' ? 7 : 0)) % 16 });
    homes.push({ id: `${T.id}-${String(n).padStart(2, '0')}${side}`, kind: 'flat', side, levels: [n], parts: [h] });
  }
  for (const [n, side, type] of [[14, 'E', '3BR'], [24, 'W', '4BR']]) {
    const h = make(side, { id: `${T.id}-${n}${side}`, type, variant: n % 16 });
    homes.push({ id: `${T.id}-${n}${side}`, kind: n === 24 ? 'penthouse-flat' : 'flat', side, levels: [n], parts: [h] });
  }
  // Interlocking duplexes: W homes start on even floors, E homes on odd floors.
  for (let n = 14; n <= 23; n++) {
    const side = n % 2 === 0 ? 'W' : 'E';
    const k = (n - 14) >> 1;
    const type = ['4BR', '5BR', '4BR', '5BR', '4BR'][k];
    const spec = { id: `${T.id}-${n}${side}`, w: 16, d: side === 'W' ? wingW : wingE, exposed: { left: true, right: true }, lux: true,
      entryAt: side === 'W' ? ENTRY_W : ENTRY_E, view: side === 'W' ? 'left' : 'right', type, voidAbove: k % 2 === 0, variant: (n * 5 + k) % 16 };
    let dup = null;
    for (let v = 0; v < 24 && !dup; v++) {
      const g = generateDuplex({ ...spec, variant: spec.variant + v }, { exclude: [...used] });
      if (g && !used.has(g.key) && !used.has(sig(g.lower.residence) + '|' + sig(g.upper.residence))) dup = g;
      if (!dup && spec.voidAbove && v === 11) spec.voidAbove = false;   // fall back to a flat ceiling
    }
    if (dup) { used.add(dup.key); used.add(dup.lower.meta.key); used.add(dup.upper.meta.key); used.add(sig(dup.lower.residence) + '|' + sig(dup.upper.residence)); }
    const parts = dup ? [{ spec: { ...spec, level: 'lower' }, g: dup.lower }, { spec: { ...spec, level: 'upper' }, g: dup.upper }] : [{ spec: { ...spec, level: 'lower' }, g: null }];
    homes.push({ id: `${T.id}-${n}${side}`, kind: 'duplex', side, levels: [n, n + 1], parts, voidRect: dup?.voidRect || null });
  }
  for (const hm of homes) {
    const ok = hm.parts.every(p => p.g);
    const errs = hm.parts.flatMap(p => p.g ? validateHome(p.g.residence, p.spec).map(e => `${p.spec.id}:${e}`) : [`${p.spec.id}:NO PLAN`]);
    const stairSame = hm.parts.length === 2 && ok ? JSON.stringify(hm.parts[0].g.residence.homeStair.block) === JSON.stringify(hm.parts[1].g.residence.homeStair.block) : null;
    const area = hm.parts.reduce((n, p) => n + (p.g?.residence.area || 0), 0);
    log(`${hm.id.padEnd(8)} ${hm.kind.padEnd(14)} ${hm.levels.map(n => n + 'F').join('+').padEnd(8)} ${String(area.toFixed(0)).padStart(4)}m²${hm.voidRect ? ' 挑空' : ''}${stairSame === false ? ' STAIR-MISMATCH' : ''} errs ${errs.length ? errs.join(';') : 'none'}`);
  }
  const sigs = homes.filter(h => h.parts.every(p => p.g)).map(h => h.parts.map(p => sig(p.g.residence)).join('|'));
  log(`${T.id}: wings W ${wingW} / E ${wingE} m · homes ${homes.length} · unit records ${homes.reduce((n, h) => n + h.parts.length, 0)} · distinct home types ${new Set(sigs).size}/${homes.length}`);
  return { ...T, homes: homes.map(h => ({ id: h.id, kind: h.kind, side: h.side, levels: h.levels, voidRect: h.voidRect || null,
    parts: h.parts.map(p => ({ id: p.spec.id, level: p.spec.level || 'flat', type: p.spec.type, plan: p.g?.residence || null })) })) };
}
// One line per unit / home keeps the generated file diffable.
const j = v => JSON.stringify(v);
const tower = (T, key) => { const { [key]: list, ...rest } = T; return `${j(rest).slice(0, -1)},${j(key)}:[\n${list.map(j).join(',\n')}\n]}`; };
const section = (towers, key) => Object.entries(towers).map(([id, T]) => `    ${id}: ${tower(T, key)}`).join(',\n');
export const planDataText = (out) => `// Generated by scripts/prepare-community-plans.mjs; do not hand-edit.
// 云澜·西苑 W1/W2 (3梯5户) and 云澜·北苑 T1/T2 (一梯一户 大平层 + 错层复式) home plans.
export const COMMUNITY_PLANS = Object.freeze({
  west: {
${section(out.west, 'units')},
  },
  north: {
${section(out.north, 'homes')},
  },
});
`;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const t0 = Date.now(), log = (...a) => console.log(...a);
  const out = { west: {}, north: {} };
  for (const T of WEST.towers) out.west[T.id] = westTower(T, log);
  if (process.argv.includes('--west-only')) Object.assign(out.north, (await import('../src/layout/community-plan-data.js')).COMMUNITY_PLANS.north);
  else for (const T of NORTH.towers) out.north[T.id] = northTower(T, log);
  const text = planDataText(out);
  writeFileSync(target, text);
  log(`wrote ${path.relative(root, target)} (${(Buffer.byteLength(text) / 1024).toFixed(1)} kB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
