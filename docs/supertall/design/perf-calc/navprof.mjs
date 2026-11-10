import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { Session } from 'node:inspector/promises';
import fs from 'node:fs';
const W = process.argv[2];
const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const { buildLayout } = await imp('src/layout/layout.js');
const { buildNav } = await imp('src/layout/nav.js');
const which = process.argv[3] || 'nav';
const s = new Session(); s.connect();
let L;
if (which === 'nav') L = buildLayout({ expansion: true });
await s.post('Profiler.enable'); await s.post('Profiler.start');
let t = performance.now();
if (which === 'nav') buildNav(L); else L = buildLayout({ expansion: true });
const ms = performance.now() - t;
const { profile } = await s.post('Profiler.stop');
// self time by function+url
const self = new Map(); const dt = profile.timeDeltas; const idx = new Map(profile.nodes.map((n, i) => [n.id, n]));
const counts = new Map();
for (let i = 0; i < profile.samples.length; i++) counts.set(profile.samples[i], (counts.get(profile.samples[i]) || 0) + (dt[i] || 0));
for (const [id, us] of counts) { const n = idx.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${path.basename(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + us); }
const byFile = new Map(); for (const [k, us] of self) { const f = k.split(' ')[1].split(':')[0]; byFile.set(f, (byFile.get(f) || 0) + us); }
console.log(which, 'ms', Math.round(ms));
console.log('top self:'); for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(' ', (us / 1e3).toFixed(0).padStart(6), 'ms', k);
console.log('by file:'); for (const [k, us] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(' ', (us / 1e3).toFixed(0).padStart(6), 'ms', k);
