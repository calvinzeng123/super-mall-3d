// CPU time and retained heap of buildNav with and without NAV_SHARE; checks that walking still works.
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const W = process.argv[2];
const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const { buildLayout } = await imp('src/layout/layout.js');
const { buildNav, step, linksNear } = await imp('src/layout/nav.js');
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed; };
const L = buildLayout({ expansion: true });
const h0 = heap(); let c = cpu(); const nav = buildNav(L); const nc = cpu() - c; const h1 = heap();
let shared = 0; for (const F of nav.floors.values()) if (F.sharedPlan) shared++;
// smoke: from every lift stop, walk 1 m out along the stop's facing and back; count blocked moves
let moves = 0, sum = 0;
for (const k of nav.links.filter((x) => x.kind === 'lift')) for (const st of k.stops) {
  let s = { floor: st.floor, x: st.x, z: st.z, y: nav.floors.get(st.floor).y, slope: null };
  for (let i = 0; i < 10; i++) s = step(nav, s, st.face[0] * 0.1, st.face[1] * 0.1, 0.016);
  sum += Math.round(s.x * 100) + Math.round(s.z * 100); moves++;
}
console.log(JSON.stringify({ share: !!process.env.NAV_SHARE, levels: L.levels.length, floors: nav.floors.size, shared, navCpuMs: Math.round(nc), navHeapMB: +((h1 - h0) / 1e6).toFixed(1), smokeMoves: moves, smokeChecksum: sum }));
