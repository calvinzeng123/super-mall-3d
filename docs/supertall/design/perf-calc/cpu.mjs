// CPU time (user+system, less sensitive to a shared machine than wall time) of buildLayout and buildNav.
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const W = process.argv[2];
const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const { buildLayout } = await imp('src/layout/layout.js');
const { buildNav } = await imp('src/layout/nav.js');
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
buildLayout({ expansion: false }); // warm the JIT on the compact layout
let c = cpu(), t = performance.now(); const L = buildLayout({ expansion: true }); const lc = cpu() - c, lw = performance.now() - t;
c = cpu(); t = performance.now(); const nav = buildNav(L); const nc = cpu() - c, nw = performance.now() - t;
console.log(`${L.levels.length} ${Math.round(lc)} ${Math.round(lw)} ${Math.round(nc)} ${Math.round(nw)} ${nav.floors.size}`);
