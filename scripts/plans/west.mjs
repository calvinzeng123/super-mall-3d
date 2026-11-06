/** 云澜·西苑 W1/W2 home plans (3梯5户): generator and data-file text (≈ 1 s).
 * Moved out of scripts/prepare-community-plans.mjs (P0a, unchanged output); the 西苑 package owns it.
 * Written to src/layout/community-plan-data-west.js by the driver (`--community west`). */
import { generateHome, validateHome, planSignature as sig } from '../../src/layout/community-plan.js';
import { dataFile } from './text.mjs';

const quiet = () => {};
export const WEST_TARGET = 'src/layout/community-plan-data-west.js';

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

/** Text of src/layout/community-plan-data-west.js for { W1, W2 }. */
export const westDataText = (west) => dataFile('云澜·西苑 W1/W2 (3梯5户) home plans.', 'WEST_PLANS', west, 'units');

/** Generate every 西苑 tower. */
export function generateWest(log = quiet) {
  const out = {};
  for (const T of WEST.towers) out[T.id] = westTower(T, log);
  return out;
}
