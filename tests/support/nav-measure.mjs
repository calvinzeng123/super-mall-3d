// Retained heap, CPU time and a walking smoke checksum of buildNav on the expansion layout.
// Run in its own process with --expose-gc (tests/nav-share.test.js does):
//   node --expose-gc tests/support/nav-measure.mjs [share|noshare]
// Smoke: from every lift stop walk 1 m out along the stop's facing (10 steps of 0.1 m) and sum the
// end positions in centimetres; any change in walls, obstacles or the wall grid moves the sum.
import { buildLayout } from '../../src/layout/layout.js';
import { buildNav, step } from '../../src/layout/nav.js';

const mode = process.argv[2] || 'share';
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const heap = () => { globalThis.gc?.(); globalThis.gc?.(); return process.memoryUsage().heapUsed; };

const L = buildLayout();
const h0 = heap(), c0 = cpu();
const nav = buildNav(L, { share: mode !== 'noshare' });
const navCpuMs = cpu() - c0, h1 = heap();
let shared = 0;
for (const F of nav.floors.values()) if (F.sharedPlan) shared++;
let moves = 0, checksum = 0;
for (const k of nav.links.filter((x) => x.kind === 'lift')) for (const st of k.stops) {
  let s = { floor: st.floor, x: st.x, z: st.z, y: nav.floors.get(st.floor).y, slope: null };
  for (let i = 0; i < 10; i++) s = step(nav, s, st.face[0] * 0.1, st.face[1] * 0.1, 0.016);
  checksum += Math.round(s.x * 100) + Math.round(s.z * 100); moves++;
}
let walls = 0;
for (const F of nav.floors.values()) walls += F.walls.length;
console.log(JSON.stringify({ mode, levels: L.levels.length, floors: nav.floors.size, shared, walls,
  navCpuMs: Math.round(navCpuMs), navHeapMB: +((h1 - h0) / 1e6).toFixed(1), moves, checksum, gc: !!globalThis.gc }));
