/** Driver: generate the community home plans, stack them per storey, validate them and write the
 * frozen data files. Each community has its own module and its own data file, so the 北苑 and
 * 西苑 packages never touch the same generated file:
 *   scripts/plans/west.mjs  → src/layout/community-plan-data-west.js   (≈ 1 s)
 *   scripts/plans/north.mjs → src/layout/community-plan-data-north.js  (≈ 80 s)
 *   scripts/plans/r-penthouse.mjs → src/layout/r-penthouse-plan-data.js (二期 R 顶层复式, added by the R package)
 * src/layout/community-plan-data.js re-exports the west and north files as COMMUNITY_PLANS.
 *
 * Usage: node scripts/prepare-community-plans.mjs [--community west|north|r]…
 *   no flag: west + north (as before); --west-only = --community west (kept for HANDOFF).
 */
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateWest, westDataText, WEST_TARGET } from './plans/west.mjs';
import { generateNorth, northDataText, NORTH_TARGET } from './plans/north.mjs';

export { WEST, westTower, westDataText } from './plans/west.mjs';
export { NORTH, northTower, northDataText } from './plans/north.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Communities named on the command line (default west + north). */
export function communitiesOf(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--west-only') out.push('west');
    else if (argv[i] === '--community') out.push(...String(argv[++i] || '').split(','));
    else if (argv[i].startsWith('--community=')) out.push(...argv[i].slice(12).split(','));
  }
  const list = out.length ? [...new Set(out)] : ['west', 'north'];
  for (const c of list) if (!['west', 'north', 'r'].includes(c)) throw new Error(`unknown community ${c} (west | north | r)`);
  return list;
}

const write = (rel, text, log, t0) => {
  writeFileSync(path.join(root, rel), text);
  log(`wrote ${rel} (${(Buffer.byteLength(text) / 1024).toFixed(1)} kB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const log = (...a) => console.log(...a);
  for (const c of communitiesOf(process.argv.slice(2))) {
    const t0 = Date.now();
    if (c === 'west') write(WEST_TARGET, westDataText(generateWest(log)), log, t0);
    else if (c === 'north') write(NORTH_TARGET, northDataText(generateNorth(log)), log, t0);
    else {
      const mod = path.join(root, 'scripts/plans/r-penthouse.mjs');
      if (!existsSync(mod)) throw new Error('scripts/plans/r-penthouse.mjs does not exist yet (the 二期 R package adds it)');
      const { generateR, rDataText, R_TARGET } = await import(pathToFileURL(mod).href);
      write(R_TARGET, rDataText(generateR(log)), log, t0);
    }
  }
}
