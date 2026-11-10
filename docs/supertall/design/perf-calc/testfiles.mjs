// Per-file test time from a TAP log: map test names to files by source grep.
import fs from 'node:fs';
const [log, dir] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));
const nameToFile = new Map();
for (const f of files) {
  const src = fs.readFileSync(`${dir}/${f}`, 'utf8');
  for (const m of src.matchAll(/test\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) nameToFile.set(m[2], f);
}
const lines = fs.readFileSync(log, 'utf8').split('\n');
const per = {}; let name = null, miss = 0;
for (const l of lines) {
  const m = l.match(/^(?:not )?ok \d+ - (.*)$/); if (m) { name = m[1]; continue; }
  const d = l.match(/^\s+duration_ms: ([\d.]+)/);
  if (d && name != null) { const f = nameToFile.get(name) || (miss++, '?'); (per[f] ||= { n: 0, ms: 0, max: 0 }); per[f].n++; per[f].ms += +d[1]; per[f].max = Math.max(per[f].max, +d[1]); name = null; }
}
const rows = Object.entries(per).sort((a, b) => b[1].ms - a[1].ms);
console.log('unmatched', miss);
for (const [f, r] of rows.slice(0, +(process.argv[4] || 40))) console.log((r.ms / 1000).toFixed(1).padStart(7), 's', String(r.n).padStart(3), 'tests  max', (r.max / 1000).toFixed(1).padStart(6), ' ', f);
