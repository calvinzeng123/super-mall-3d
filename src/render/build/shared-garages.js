// Permanent roof/lighting and ground access pavilions for the shared garages.
// Geometry is assigned to the occupied floor, so a lower deck never disappears
// merely because the upper mall/parking group has been culled.
import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { shapeFromPoly, flatShapeGeometry } from './shell.js';
import { pointInPoly, polyBounds, distToPolyEdge, polyArea } from '../../layout/geom.js';

const inside = (p, q) => pointInPoly(p, q) || distToPolyEdge(p, q) < .001;
function outerHoles(polys) {
  const sorted = polys.filter(p => p?.length >= 3).sort((a, b) => Math.abs(polyArea(b)) - Math.abs(polyArea(a)));
  const result = [];
  for (const p of sorted) if (!result.some(q => p.every(v => inside(v, q)))) result.push(p);
  return result;
}

export function buildSharedGarageDetails(ctx) {
  for (const lv of ctx.layout.levels) {
    const L = ctx.levels[lv.id];
    if (lv.sharedGarage) {
      const ceilingY = lv.elev + lv.height - .48;
      const above = ctx.layout.levels.filter(v => Math.abs(v.elev - (lv.elev + lv.height)) < .01);
      const supportedRoof = above.some(v => lv.outline.every(p => inside(p, v.outline)))
        || lv.building === 'WPG' && lv.short === 'B1';
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
      ].filter(p => p.every(q => inside(q, lv.outline)));
      const holes = outerHoles(cuts);
      const material = new THREE.MeshStandardMaterial({
        color: '#b7bfbd', roughness: .94, side: THREE.DoubleSide,
      });
      ctx.mats.onNight(t => material.emissive.setRGB(.12 * t, .12 * t, .12 * t));
      const ceiling = supportedRoof ? null : new THREE.Mesh(flatShapeGeometry(shapeFromPoly(lv.outline, holes), ceilingY), material);
      if (ceiling) {
        ceiling.name = `${lv.id}-permanent-parking-roof`;
        ceiling.receiveShadow = true; L.shell.add(ceiling);
      } else material.dispose();
      const fixtures = new THREE.Group(), B = new BatchSet(ctx.mats.base);
      fixtures.name = `${lv.id}-permanent-lighting`;
      const bounds = polyBounds(lv.outline);
      for (let x = bounds.x0 + 8; x < bounds.x1 - 3; x += 14) for (let z = bounds.z0 + 9; z < bounds.z1 - 3; z += 16) {
        if (holes.some(p => pointInPoly([x, z], p))) continue;
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
