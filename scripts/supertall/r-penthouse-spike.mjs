/** Spike (SPEC §1.3 / §2.1, C-16): can generateDuplex() build the 二期 R 顶层复式 on the two R wings?
 * Read-only: nothing is written. Run: node scripts/supertall/r-penthouse-spike.mjs [--json]
 *
 * Wings (p2.md §3.2, tower-local; unit-local x runs along the entry front, z from the front to the rear facade):
 *   W  x[-19.4, -1.8] z[1.6, 15.9] = 17.6 × 14.3: exterior W (plate end), S (rear), E (the 5.6 m slot) and
 *      N beyond tower x -12 (the NW void), i.e. unit-local N over [0, 7.4]; the band covers the rest of N.
 *   E  x[3.8, 19.4]  z[1.6, 15.9] = 15.6 × 14.3: exterior W (slot), S, E (plate end) and N beyond tower x 12
 *      (the NE void), i.e. unit-local N over [8.2, 15.6].
 * The entry door sits on the band part of the front. Program: luxury (lux), 挑空 living (voidAbove), duplex
 * stair rise 3.4 m (the R storey). Four towers × two wings = 8 penthouses, all different (signature).
 */
import { generateDuplex, validateHome, planSignature as sig, pickRefugeRoom, refugeRoomErrors } from '../../src/layout/community-plan.js';

export const R_WINGS = Object.freeze({
  W: { w: 17.6, d: 14.3, exteriorEdges: { S: true, W: true, E: true, N: [[0, 7.4]] }, rise: 3.4, entryAt: [15.4, 14.2, 12.6, 10.8] },
  E: { w: 15.6, d: 14.3, exteriorEdges: { S: true, W: true, E: true, N: [[8.2, 15.6]] }, rise: 3.4, entryAt: [2.2, 3.4, 5.0, 6.6] },
});
const TYPES = ['5BR', '4BR'];

/** Try to make `count` distinct penthouses on wing `side`; returns { homes, attempts, failures }. */
export function spikeWing(side, { count = 4, tries = 24 } = {}) {
  const Wg = R_WINGS[side], used = new Set(), homes = [];
  let attempts = 0, failures = 0;
  for (let k = 0; k < count; k++) {
    let got = null;
    for (const voidAbove of [true, false]) {
      for (const entryAt of Wg.entryAt) for (const type of TYPES) for (let v = 0; v < tries && !got; v++) {
        attempts++;
        const spec = { id: `R${k + 1}-PH-${side}`, w: Wg.w, d: Wg.d, lux: true, type, entryAt, voidAbove, variant: (k * 7 + v) % 16,
          view: side === 'W' ? 'left' : 'right' };
        const g = generateDuplex(spec, { exclude: [...used], wing: { w: Wg.w, d: Wg.d, exteriorEdges: Wg.exteriorEdges, rise: Wg.rise } });
        if (!g) { failures++; continue; }
        const key = `${sig(g.lower.residence)}|${sig(g.upper.residence)}`;
        if (used.has(g.key) || used.has(key)) continue;
        got = { spec, g, key };
      }
      if (got) break;
    }
    if (!got) { homes.push({ k, ok: false }); continue; }
    const { spec, g } = got;
    used.add(g.key); used.add(g.lower.meta.key); used.add(g.upper.meta.key); used.add(got.key);
    const L = g.lower.residence, U = g.upper.residence, specL = { ...spec, level: 'lower' }, specU = { ...spec, level: 'upper' };
    const errs = [...validateHome(L, specL).map((e) => `lower:${e}`), ...validateHome(U, specU).map((e) => `upper:${e}`)];
    const refuge = pickRefugeRoom(L, 'S') ?? pickRefugeRoom(U, 'S');
    const refugeLevel = pickRefugeRoom(L, 'S') ? L : U;
    homes.push({ k, ok: true, type: spec.type, entryAt: spec.entryAt, variant: spec.variant, voidAbove: !!g.voidRect,
      area: +(L.area + U.area).toFixed(1), bedrooms: L.bedrooms + U.bedrooms, rise: L.homeStair?.rise,
      stairSame: JSON.stringify(L.homeStair?.block) === JSON.stringify(U.homeStair?.block),
      frontWindows: (L.facadeWalls || []).filter((f) => f.side === 'N').reduce((n, f) => n + f.openings.length, 0),
      refugeRoom: refuge, refugeErrors: refuge ? refugeRoomErrors({ ...refugeLevel, refugeRoom: refuge }) : ['none'], errs });
  }
  return { side, homes, attempts, failures };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const t0 = Date.now(), out = ['W', 'E'].map((s) => spikeWing(s));
  const ok = out.every((w) => w.homes.every((h) => h.ok && !h.errs.length && h.stairSame));
  const result = { ok, seconds: +((Date.now() - t0) / 1000).toFixed(1), wings: out };
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 1));
  else {
    for (const w of out) {
      console.log(`wing ${w.side}: ${w.homes.filter((h) => h.ok).length}/4 distinct duplexes (${w.attempts} attempts, ${w.failures} generator nulls)`);
      for (const h of w.homes) console.log(h.ok ? `  #${h.k} ${h.type} entry ${h.entryAt} v${h.variant} ${h.voidAbove ? '挑空' : 'flat ceiling'} ${h.area} m² ${h.bedrooms} beds rise ${h.rise} stair ${h.stairSame ? 'aligned' : 'MISMATCH'} N-windows ${h.frontWindows} refuge ${h.refugeRoom} errs ${h.errs.join(';') || 'none'}` : `  #${h.k} FAILED`);
    }
    console.log(`spike ${ok ? 'PASSED' : 'FAILED'} in ${result.seconds} s`);
  }
}
