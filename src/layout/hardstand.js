// 消防登高场地（fire-rescue hardstands, supertall P0a, SPEC §1.0 / §2.1; GB 55037 §3.4.6–7, GB 50016 §7.2.1–2）.
// Records live in site.fireAccess (北苑 HS1 / HS2 today, then HS-R1…R4, HS-H, HS-A). 西苑's HS-W1 / HS-W2 stay
// in site.westGarden.hardstands, which the community site renderer paints (C-23); hardstandErrors reads both.
import { rect, rectPoly, pointInPoly, convexOverlap, polysOverlap } from './geom.js';

export const HARDSTAND = Object.freeze({ long: 20, short: 10, near: 5, far: 10, label: '消防登高场地', tol: 1e-6 });

/** A hardstand record for site.fireAccess. face: the tower side it serves ('N' | 'S' | 'E' | 'W', world).
 * `tower` mirrors `building` for the readers written before the supertall work (north-residences, render). */
export function hardstandRecord({ id, building, rect: r, face, label = HARDSTAND.label, name }) {
  return { id, building, tower: building, name: name ?? `${building} ${label}`, label, face, rect: { ...r }, poly: rectPoly(r) };
}

/** Every hardstand of the site: site.fireAccess plus site.westGarden.hardstands. */
export const allHardstands = (site) => [...(site?.fireAccess || []), ...(site?.westGarden?.hardstands || [])];

/** The side of building bounds `b` that hardstand rect r lies on. */
export function hardstandFace(r, b) {
  const d = { N: b.z0 - r.z1, S: r.z0 - b.z1, W: b.x0 - r.x1, E: r.x0 - b.x1 };
  return Object.entries(d).sort((p, q) => q[1] - p[1])[0][0];
}

const asPoly = (o) => o.poly || (o.rect ? rectPoly(o.rect) : null);
/**
 * Solid things near hardstands, as [{ id, kind, poly | x, z, r, strip }]. strip: the item also may not stand
 * between the hardstand and the facade. Inside the hardstand nothing may stand; in the strip only what
 * hinders the aerial ladder (GB 50016 §7.2.2-1: 树木、架空管线等障碍和车库出入口): trees and tree beds,
 * open trenches and garage-ramp mouths, parking stalls, buildings. Low beds and canopy posts at a lobby door
 * may stand in the strip (西苑's entrance beds and canopy, kept ✓ by SPEC §1.2).
 */
function siteObstacles(layout, site) {
  const out = [], seen = new Set();
  const push = (kind, list, id = kind, strip = () => true) => (list || []).forEach((o, i) => {
    const key = o.id ?? `${id}-${i}`;
    if (seen.has(key)) return;
    seen.add(key); out.push({ ...o, id: key, kind, strip: strip(o) });
  });
  push('tree', site.urban?.trees, 'urban-tree');
  push('tree', site.transitCenter?.trees, 'transit-tree');
  push('tree', site.river?.furniture?.trees, 'river-tree');
  push('planter', (site.forecourt?.items || []).filter((q) => ['flower-bed', 'garden-island', 'planter'].includes(q.type)), 'forecourt', (q) => q.type === 'garden-island');
  push('planter', site.westGarden?.garden, 'west-garden-bed', (q) => !!q.trees);
  push('planter', (site.westGarden?.obstacles || []).filter((o) => o.kind !== 'fence'), 'west-garden', () => false);
  push('planter', site.westParking?.islands, 'west-parking-island', () => false);
  (site.trenches || []).forEach((poly, i) => out.push({ id: `trench-${i}`, kind: 'trench', poly, strip: true }));
  // A garage ramp counts at its street mouth (the first 6 m); its covered run below grade is structure, not an obstacle.
  for (const r of layout?.ramps || []) {
    const top = [r.from, r.to].find((p) => p?.level === 'street'), low = top === r.from ? r.to : r.from;
    if (!top || !low) continue;
    const len = Math.hypot(low.x - top.x, low.z - top.z) || 1, k = Math.min(1, 6 / len), hw = (r.width || 5) / 2;
    const ux = (low.x - top.x) / len, uz = (low.z - top.z) / len, ex = top.x + (low.x - top.x) * k, ez = top.z + (low.z - top.z) * k;
    out.push({ id: r.id, kind: 'garage ramp mouth', strip: true,
      poly: [[top.x - uz * hw, top.z + ux * hw], [ex - uz * hw, ez + ux * hw], [ex + uz * hw, ez - ux * hw], [top.x + uz * hw, top.z - ux * hw]] });
  }
  for (const lot of layout?.extensions?.surfaceParking || []) for (const s of lot.stalls) out.push({ id: s.id, kind: 'parking stall', poly: s.poly, strip: true });
  for (const lot of site.westParking?.lots || []) for (const s of lot.stalls || []) out.push({ id: s.id, kind: 'parking stall', poly: s.poly, strip: true });
  return out;
}

/**
 * Errors of hardstand `rec` (a record or an id in either list) serving `building` (a record or an id):
 * ≥ 20 × 10 m; on a long side; its near edge 5–10 m off that facade; covering the full long side; no tree,
 * planter, trench, ramp, parking stall or other building inside it or between it and the facade.
 * ctx: the layout (preferred: ramps, surface parking and buildings are checked too) or the site alone.
 */
export function hardstandErrors(rec, building, ctx) {
  const layout = ctx?.site ? ctx : null, site = layout ? layout.site : ctx;
  if (typeof rec === 'string') rec = allHardstands(site).find((h) => h.id === rec);
  if (typeof building === 'string') building = layout?.buildings.find((b) => b.id === building);
  if (!rec) return ['hardstand: missing'];
  if (!building) return [`${rec.id}: building missing`];
  const errs = [], err = (m) => errs.push(`${rec.id} (${building.id}): ${m}`), r = rec.rect, b = building.bounds, t = HARDSTAND.tol;
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (Math.max(w, d) < HARDSTAND.long - t || Math.min(w, d) < HARDSTAND.short - t) err(`size ${w.toFixed(2)} × ${d.toFixed(2)} m (≥ ${HARDSTAND.long} × ${HARDSTAND.short})`);
  const face = rec.face || hardstandFace(r, b), ns = face === 'N' || face === 'S';
  const along = ns ? b.x1 - b.x0 : b.z1 - b.z0, across = ns ? b.z1 - b.z0 : b.x1 - b.x0;
  if (along < across - t) err(`face ${face} is a short side (${along.toFixed(2)} m against ${across.toFixed(2)} m)`);
  const off = { N: b.z0 - r.z1, S: r.z0 - b.z1, W: b.x0 - r.x1, E: r.x0 - b.x1 }[face];
  if (off < HARDSTAND.near - t || off > HARDSTAND.far + t) err(`near edge ${off.toFixed(2)} m off the ${face} facade (${HARDSTAND.near}–${HARDSTAND.far} m)`);
  const covers = ns ? r.x0 <= b.x0 + 0.05 && r.x1 >= b.x1 - 0.05 : r.z0 <= b.z0 + 0.05 && r.z1 >= b.z1 - 0.05;
  if (!covers) err(`does not cover the full ${face} side`);
  // The hardstand itself and the strip between it and the facade, each shrunk 2 cm so touching edges pass.
  const strip = { N: rect(r.x0, r.z1, r.x1, b.z0), S: rect(r.x0, b.z1, r.x1, r.z0), W: rect(r.x1, r.z0, b.x0, r.z1), E: rect(b.x1, r.z0, r.x0, r.z1) }[face];
  const shrink = (q) => rect(q.x0 + .02, q.z0 + .02, q.x1 - .02, q.z1 - .02);
  const zones = [['inside it', shrink(r), () => true], ['between it and the facade', shrink(strip), (o) => o.strip]];
  for (const o of siteObstacles(layout, site)) for (const [where, z, applies] of zones) {
    if (!applies(o) || !(z.x1 > z.x0 && z.z1 > z.z0)) continue;
    const zp = rectPoly(z), poly = asPoly(o);
    const hit = poly ? convexOverlap(zp, poly, 0) || poly.some((p) => pointInPoly(p, zp))
      : Number.isFinite(o.x) && o.x + (o.r ?? .6) > z.x0 && o.x - (o.r ?? .6) < z.x1 && o.z + (o.r ?? .6) > z.z0 && o.z - (o.r ?? .6) < z.z1;
    if (hit) { err(`${o.kind} ${o.id} ${where}`); break; }
  }
  for (const q of layout?.buildings || []) {
    if (q.id === building.id || q.undergroundOnly || !q.outline || q.id === building.stackedOn) continue;
    if (polysOverlap(rectPoly(shrink(r)), q.outline) || polysOverlap(rectPoly(shrink(strip)), q.outline)) err(`building ${q.id} on it or between it and the facade`);
  }
  return errs;
}
