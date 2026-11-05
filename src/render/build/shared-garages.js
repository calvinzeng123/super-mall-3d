// Permanent roof/lighting and ground access pavilions for the shared garages.
// Geometry is assigned to the occupied floor, so a lower deck never disappears
// merely because the upper mall/parking group has been culled.
import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { shapeFromPoly, flatShapeGeometry } from './shell.js';
import { pointInPoly, polyBounds, distToPolyEdge, polyArea, frame, rect, rectPoly, lrectPoly, convexOverlap } from '../../layout/geom.js';

const inside = (p, q) => pointInPoly(p, q) || distToPolyEdge(p, q) < .001;
function outerHoles(polys) {
  const sorted = polys.filter(p => p?.length >= 3).sort((a, b) => Math.abs(polyArea(b)) - Math.abs(polyArea(a)));
  const result = [];
  for (const p of sorted) if (!result.some(q => p.every(v => inside(v, q)))) result.push(p);
  return result;
}

/** Ramps of this deck whose lane meets the ceiling plane with less than the
 * ramp headroom beneath it. u runs from the high end; the surface reaches the
 * ceiling at u0 and has full headroom below it again from u1. */
export function rampCeilingCrossings(layout, lv, ceilingY) {
  const out = [];
  for (const r of layout.ramps) {
    if (r.from.level !== lv.id && r.to.level !== lv.id) continue;
    const [hi, lo] = r.from.y > r.to.y ? [r.from, r.to] : [r.to, r.from];
    const drop = hi.y - lo.y, len = Math.hypot(lo.x - hi.x, lo.z - hi.z);
    if (drop < .01) continue;
    const u0 = Math.max(0, len * (hi.y - ceilingY) / drop);
    const u1 = Math.min(len, len * (hi.y - ceilingY + (r.headroom ?? 2.6)) / drop);
    if (u1 - u0 < .05) continue;
    const F = frame(hi.x, hi.z, Math.atan2(lo.z - hi.z, lo.x - hi.x) * 180 / Math.PI);
    // The lane plus its guard walls (centred at w/2 + .12, .24 thick).
    const half = r.width / 2 + .24;
    out.push({ ramp: r, F, hi, len, drop, u0, u1, half, poly: lrectPoly(F, rect(u0, -half, u1, half)) });
  }
  return out;
}

/** Stairs that leave this deck for a floor more than one storey up: their
 * well is open between this ceiling and the next served floor. */
export function stairWellsThrough(layout, lv) {
  const top = lv.elev + lv.height;
  return layout.stairs.filter(s => s.serves.includes(lv.id)).map(s => {
    const up = s.serves.map(id => layout.levels.find(l => l.id === id)).filter(l => l && l.elev > lv.elev + .01)
      .sort((a, b) => a.elev - b.elev)[0];
    return up && up.elev > top + .01 ? { stair: s, poly: s.poly || lrectPoly(s.frame, s.rect), y0: top, y1: up.elev } : null;
  }).filter(Boolean);
}

/** Box in each roof opening up to grade. A street ramp keeps its covered
 * approach (lid at the cover soffit, grade - .57) from where the lane enters
 * this storey to where the roof again clears its headroom, with side walls
 * and an end wall standing on the roof; a stair well gets its shaft walls up
 * to the floor it serves. Walls stay visible; lids show from below only. */
function roofOpeningEnclosures(ctx, L, lv, ceilingY, ramps, wells) {
  const W = new BatchSet(ctx.mats.base), C = new BatchSet(ctx.mats.base), top = lv.elev + lv.height;
  let soffit = Infinity;
  for (const c of ramps.filter(c => c.hi.level === 'street')) {
    const uTop = Math.max(0, Math.min(c.u0, c.len * (c.hi.y - top) / c.drop)), u1 = c.u1;
    const lid = c.hi.y - .57, v = c.half + .06, h = lid - ceilingY, run = u1 + .3 - uTop;
    soffit = Math.min(soffit, lid);
    W.frame(c.F, () => {
      for (const s of [-v, v]) W.get('concrete').box(uTop + run / 2, ceilingY + h / 2, s, run, h, .3, '#a9b1ad');
      W.get('concrete').box(u1 + .15, ceilingY + h / 2, 0, .3, h, 2 * v + .3, '#a9b1ad');
    });
    C.frame(c.F, () => C.get('concrete').box(uTop + run / 2, lid + .15, 0, run, .3, 2 * v + .3, '#a4aca8'));
  }
  for (const w of wells) {
    const b = polyBounds(w.poly), h = w.y1 - w.y0, y = (w.y0 + w.y1) / 2, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    for (const z of [b.z0, b.z1]) W.get('concrete').box(cx, y, z, b.x1 - b.x0 + .15, h, .15, '#c3cbc6');
    for (const x of [b.x0, b.x1]) W.get('concrete').box(x, y, cz, .15, h, b.z1 - b.z0, '#c3cbc6');
  }
  const walls = new THREE.Group(), lids = new THREE.Group();
  walls.name = `${lv.id}-roof-opening-walls`; lids.name = `${lv.id}-roof-opening-lids`;
  lids.userData.soffit = soffit;
  W.flush(walls); C.flush(lids); L.shell.add(walls, lids);
  return lids;
}

export function buildSharedGarageDetails(ctx) {
  for (const lv of ctx.layout.levels) {
    const L = ctx.levels[lv.id];
    if (lv.sharedGarage) {
      const ceilingY = lv.elev + lv.height - .48;
      const above = ctx.layout.levels.filter(v => Math.abs(v.elev - (lv.elev + lv.height)) < .01);
      const supportedRoof = above.some(v => lv.outline.every(p => inside(p, v.outline)))
        || lv.building === 'WPG' && lv.short === 'B1';
      // Street ramps and stair wells that pass up through the ceiling plane.
      const ramps = rampCeilingCrossings(ctx.layout, lv, ceilingY);
      const wells = stairWellsThrough(ctx.layout, lv);
      const cuts = [
        ...(lv.sharedGarage.exclusions || []),
        // Original upper slabs already provide their own ceilings. Only fill
        // the newly excavated footprint around them, never duplicate a slab.
        ...above.map(v => v.outline),
        ...ctx.layout.elevators.filter(e => e.shaftPoly && e.serves.some(id => {
          const l = ctx.layout.levels.find(v => v.id === id); return l && l.elev < ceilingY;
        }) && e.serves.some(id => {
          const l = ctx.layout.levels.find(v => v.id === id); return l && l.elev > ceilingY;
        })).map(e => e.shaftPoly),
        ...(supportedRoof ? [] : [...ramps.filter(c => c.hi.level === 'street').map(c => c.poly), ...wells.map(w => w.poly)]),
      ].filter(p => p.every(q => inside(q, lv.outline)));
      const holes = outerHoles(cuts);
      const material = new THREE.MeshStandardMaterial({
        color: '#b7bfbd', roughness: .94, side: THREE.DoubleSide,
      });
      ctx.mats.onNight(t => material.emissive.setRGB(.12 * t, .12 * t, .12 * t));
      const ceiling = supportedRoof ? null : new THREE.Mesh(flatShapeGeometry(shapeFromPoly(lv.outline, holes), ceilingY), material);
      let lids = null;
      if (ceiling) {
        ceiling.name = `${lv.id}-permanent-parking-roof`;
        ceiling.receiveShadow = true; L.shell.add(ceiling);
        lids = roofOpeningEnclosures(ctx, L, lv, ceilingY, ramps.filter(c => holes.includes(c.poly)),
          wells.filter(w => holes.includes(w.poly)));
      } else material.dispose();
      const fixtures = new THREE.Group(), B = new BatchSet(ctx.mats.base);
      fixtures.name = `${lv.id}-permanent-lighting`;
      const bounds = polyBounds(lv.outline);
      // A fixture (housing, bar and hangers) never hangs over an opening, a
      // ramp lane short of headroom, an open trench or a stair well.
      const clearOf = [...ramps.map(c => c.poly), ...wells.map(w => w.poly), ...(ctx.layout.site?.trenches || [])];
      for (let x = bounds.x0 + 8; x < bounds.x1 - 3; x += 14) for (let z = bounds.z0 + 9; z < bounds.z1 - 3; z += 16) {
        if (holes.some(p => pointInPoly([x, z], p))) continue;
        const reach = rectPoly(rect(x - 5.45, z - .2, x + 5.45, z + 1.4));
        if (clearOf.some(p => convexOverlap(reach, p, .01))) continue;
        B.get('metal').box(x, ceilingY - .12, z, 3.7, .09, .19, '#727c7d');
        B.get('glow').box(x, ceilingY - .18, z, 3.4, .045, .13, '#e7f4ee');
        B.get('metal').box(x, ceilingY - .05, z + 1.2, 10.8, .12, .34, '#7e8784');
        for (const dx of [-4.2, 4.2]) B.get('metal').box(x + dx, ceilingY - .3, z + 1.2, .08, .5, .08, '#727a76');
      }
      B.flush(fixtures); L.shell.add(fixtures);
      const update = () => {
        const visible = ctx.camera.position.y < ceilingY + L.group.position.y - .1;
        if (ceiling) ceiling.visible = visible;
        fixtures.visible = visible;
        if (lids) lids.visible = ctx.camera.position.y < lids.userData.soffit + L.group.position.y;
      };
      update(); ctx.dynamic.push({ name: `${lv.id}-parking-ceiling`, update });
    }
    for (const kiosk of lv.garageKiosks || []) {
      const B = new BatchSet(ctx.mats.base), r = kiosk.rect, y = lv.elev;
      const h = kiosk.stair && lv.building === 'P1' ? 6.5 : 3.6;
      const doorX = kiosk.stair ? (r.x0 + r.x1) / 2 - 3.8 : (r.x0 + r.x1) / 2;
      const middleX = (r.x0 + r.x1) / 2, middleZ = (r.z0 + r.z1) / 2;
      const wall = (x, z, w, d) => {
        B.get('metal').box(x, y + .12, z, w, .24, d, '#64766e');
        B.get('glass').box(x, y + h / 2, z, w, h - .4, d, '#90b6b8');
      };
      wall(middleX, r.z0, r.x1 - r.x0, .12);
      wall(r.x0, middleZ, .12, r.z1 - r.z0);
      wall(r.x1, middleZ, .12, r.z1 - r.z0);
      for (const [a, b] of [[r.x0, doorX - 2], [doorX + 2, r.x1]]) if (b - a > .05) wall((a + b) / 2, r.z1, b - a, .12);
      for (const x of [r.x0, r.x1]) for (const z of [r.z0, r.z1]) B.get('metal').box(x, y + h / 2, z, .16, h, .16, '#536c63');
      B.get('metal').box(middleX, y + h, middleZ, r.x1 - r.x0 + .35, .2, r.z1 - r.z0 + .35, '#4d665c');
      B.get('glow').box(doorX, y + 2.7, r.z1 + .1, 2.6, .16, .08, kiosk.stair ? '#83c6a0' : '#a1d0e6');
      B.get('metal').box(doorX, y + .02, r.z1 + .35, 4, .04, .7, '#71867a');
      const group = new THREE.Group(); group.name = `${kiosk.id}-access-pavilion`;
      B.flush(group); L.shell.add(group);
    }
  }
}
