/** 云澜·北苑 T1/T2 home plans (一梯一户 大平层 + 错层复式): generator and data-file text (≈ 40 s per tower).
 * Moved out of scripts/prepare-community-plans.mjs (P0a, unchanged output); the 北苑 package owns it.
 * Written to src/layout/community-plan-data-north.js by the driver (`--community north`). */
import { generateHome, generateDuplex, validateHome, planSignature as sig } from '../../src/layout/community-plan.js';
import { dataFile } from './text.mjs';

const quiet = () => {};
export const NORTH_TARGET = 'src/layout/community-plan-data-north.js';

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

/** Text of src/layout/community-plan-data-north.js for { T1, T2 }. */
export const northDataText = (north) => dataFile('云澜·北苑 T1/T2 (一梯一户 大平层 + 错层复式) home plans.', 'NORTH_PLANS', north, 'homes');

/** Generate every 北苑 tower. */
export function generateNorth(log = quiet) {
  const out = {};
  for (const T of NORTH.towers) out[T.id] = northTower(T, log);
  return out;
}
