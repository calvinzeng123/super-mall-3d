// Heap held by buildLayout() and the JSON size of the 西苑 levels (node --expose-gc heap.mjs <root>).
const root = process.argv[2];
const { buildLayout } = await import(root + '/src/layout/layout.js');
gc(); const h0 = process.memoryUsage().heapUsed;
const L = buildLayout();
gc(); const h1 = process.memoryUsage().heapUsed;
const west = L.levels.filter((l) => /^W[12]-/.test(l.id));
const json = JSON.stringify(west).length;
console.log(JSON.stringify({ stack: process.env.WEST_STACK || 'today', heapMB: +((h1 - h0) / 1e6).toFixed(1), westLevels: west.length, westUnits: west.reduce((n, l) => n + l.units.length, 0), westJsonMB: +(json / 1e6).toFixed(2) }));
