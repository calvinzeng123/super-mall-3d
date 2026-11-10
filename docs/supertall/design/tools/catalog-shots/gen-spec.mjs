// node gen-spec.mjs <levelId> [<levelId> ...] [--master-min 4] [--repo DIR] > shots.json
// One top + one living interior per residence unit on each level (+ master if bedrooms >= N).
// File names: <plan>-<floor>-top / -interior / -master (plan = residence.plan, e.g. W1-SW, T1-16W-U).
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const a = process.argv.slice(2);
const take = (k, d) => { const i = a.indexOf('--' + k); if (i < 0) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
const repo = take('repo', '/home/user/super-mall-3d'), minBr = +take('master-min', 4);
(0, eval)(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'plan-core.js'), 'utf8'));
const { buildLayout } = await import(path.join(repo, 'src/layout/layout.js'));
const L = buildLayout({ expansion: true }), out = [];
for (const id of a) {
  const lv = L.levels.find((l) => l.id === id), fl = lv.short;
  for (const u of lv.units.filter((q) => q.residence)) {
    const base = `${u.residence.plan}-${fl}`;
    out.push({ name: `${base}-top`, kind: 'top', unit: u.id });
    out.push({ name: `${base}-interior`, kind: 'interior', unit: u.id });
    if ((u.residence.bedrooms || 0) >= minBr) out.push({ name: `${base}-master`, kind: 'master', unit: u.id });
  }
}
console.log(JSON.stringify(out, null, 1));
