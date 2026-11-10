// node list.mjs [--repo /home/user/super-mall-3d] <levelId> [<levelId> ...]
// Prints, per residence unit on each level: unit id, home, plan, world bounds, top camera,
// and the living-room / master-bedroom standing point and look target the shooter would use.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const args = process.argv.slice(2);
let repo = '/home/user/super-mall-3d';
const ri = args.indexOf('--repo');
if (ri >= 0) { repo = args[ri + 1]; args.splice(ri, 2); }
const json = args.includes('--json'); if (json) args.splice(args.indexOf('--json'), 1);
const here = path.dirname(fileURLToPath(import.meta.url));
(0, eval)(fs.readFileSync(path.join(here, 'plan-core.js'), 'utf8'));
const { buildLayout } = await import(path.join(repo, 'src/layout/layout.js'));
const layout = buildLayout({ expansion: true });
const out = {};
for (const id of args) out[id] = globalThis.__catPlan.listLevel(layout, id);
if (json) console.log(JSON.stringify(out, null, 1));
else for (const [id, units] of Object.entries(out)) {
  console.log(`== ${id}`);
  for (const u of units) {
    console.log(`${u.unit}  code=${u.code} home=${u.home} part=${u.part} plan=${u.plan} ${u.label} ${u.area}㎡ ${u.bedrooms}br  floorY=${u.floorY}`);
    console.log(`  bounds x ${u.bounds.x0}..${u.bounds.x1}  z ${u.bounds.z0}..${u.bounds.z1}  ext=${u.exteriorSides.join(',')}`);
    console.log(`  top pos=${JSON.stringify(u.top.pos)} target=${JSON.stringify(u.top.target)}`);
    if (u.living) console.log(`  living ${u.living.room}(${u.living.name}) faces ${u.living.faces} [${u.living.why}] stand=${JSON.stringify(u.living.stand)} look=${JSON.stringify(u.living.look)}`);
    if (u.master) console.log(`  master ${u.master.room}(${u.master.name}) faces ${u.master.faces} [${u.master.why}] stand=${JSON.stringify(u.master.stand)} look=${JSON.stringify(u.master.look)}`);
  }
}
