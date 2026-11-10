// Per-frame explore costs that scale with the level / stop count: linksNear (every frame), floorLabel, step.
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const W = process.argv[2];
const imp = (p) => import(pathToFileURL(path.join(W, p)).href);
const { buildLayout } = await imp('src/layout/layout.js');
const { buildNav, linksNear, spawn, step, floorLabel } = await imp('src/layout/nav.js');
const L = buildLayout({ expansion: true }), nav = buildNav(L);
const lift = nav.links.filter((k) => k.kind === 'lift').sort((a, b) => b.stops.length - a.stops.length)[0];
const st = lift.stops[Math.floor(lift.stops.length / 2)];
let t = performance.now(), n = 0;
for (let i = 0; i < 20000; i++) n += linksNear(nav, st.floor, st.x, st.z).length;
const linksUs = (performance.now() - t) / 20000 * 1000;
let s = { floor: st.floor, x: st.x, z: st.z, y: nav.floors.get(st.floor).y, slope: null };
t = performance.now();
for (let i = 0; i < 20000; i++) s = step(nav, s, (i % 40 < 20 ? 0.01 : -0.01), 0, 0.016);
const stepUs = (performance.now() - t) / 20000 * 1000;
t = performance.now(); for (let i = 0; i < 20000; i++) floorLabel(nav, L, s); const labelUs = (performance.now() - t) / 20000 * 1000;
console.log(JSON.stringify({ links: nav.links.length, stops: nav.links.reduce((a, k) => a + k.stops.length, 0), maxLift: lift.id, maxStops: lift.stops.length, optionsAtStop: linksNear(nav, st.floor, st.x, st.z).reduce((a, q) => a + q.options.length, 0), linksNearUs: +linksUs.toFixed(1), stepUs: +stepUs.toFixed(1), floorLabelUs: +labelUs.toFixed(1) }));
