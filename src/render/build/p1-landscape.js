// Concept A ground landscape renderer (tour only): court fountains with
// crystal sculptures, the SE seating steps, tree belts with pits, the 云伞
// canopy sculpture and the hotel drop-off loop. Geometry follows the layout
// records in layout.fidelity.landscape, which are also forecourt obstacles.
import * as THREE from 'three';
import { toW, circlePoly, ellipsePoly, roundedRectPoly } from '../../layout/geom.js';
import { addTrees } from './props.js';
import { addCutSurfaceSlab } from './surface-shapes.js';
import { COLORS } from '../theme.js';

/** Ground landscape from layout.fidelity.landscape: everything here is also a
 * forecourt obstacle, so walkers go round what they see. */
export function buildP1Landscape(ctx) {
  const D = ctx.layout.fidelity.landscape;
  if (!D) return;
  const B = ctx.site.batch, y = -0.14, trees = [];
  for (const f of D.fountains) courtFountain(B, f, y);
  if (D.steps) seatingSteps(B, D.steps, y, trees);
  for (const t of D.trees) {
    B.get('ext').box(t.x, y + .03, t.z, 1.7, .06, 1.7, '#4a4d4c');
    B.get('extMetal').box(t.x, y + .07, t.z, 1.2, .02, 1.2, '#2f3336');
    trees.push({ x: t.x, y, z: t.z, s: t.s });
  }
  if (D.sculpture) cloudUmbrella(B, D.sculpture, y);
  if (D.hotelLoop) dropOffLoop(B, D.hotelLoop, trees);
  if (trees.length) addTrees(ctx.site.group, ctx.mats, trees, 207);
}

function courtFountain(B, f, y) {
  const circle = r => circlePoly(f.x, f.z, r, 40);
  // A low rim round an open basin, so the water surface stays visible.
  addCutSurfaceSlab(B, 'extSatin', circle(f.r), [circle(f.r - .45)], y + .6, .6, '#d6cfc0');
  B.get('extSatin').cyl(f.x, y, f.z, f.r - .45, .2, '#7b8a8c', 32);
  B.get('water').cyl(f.x, y + .2, f.z, f.r - .46, .26, '#ffffff', 32);
  B.get('extSatin').cyl(f.x, y, f.z, 1.6, .85, '#e2dccf', 20);
  // White crystal bloom: six tilted petal plates round a taller central blade.
  const base = y + .85, h = f.sculpture, Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, hh = h * (.62 + (i % 2) * .18), tilt = .2 + (i % 3) * .05;
    const q = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2 - a).multiply(new THREE.Quaternion().setFromAxisAngle(X, tilt));
    const r0 = .75 + Math.sin(tilt) * hh / 2;
    B.get('extSatin').shape('box', new THREE.Vector3(f.x + Math.cos(a) * r0, base + Math.cos(tilt) * hh / 2, f.z + Math.sin(a) * r0), q, new THREE.Vector3(1.5, hh, .16), COLORS.ivory);
  }
  const q = new THREE.Quaternion().setFromAxisAngle(Y, .4);
  B.get('extSatin').shape('box', new THREE.Vector3(f.x, base + h / 2, f.z), q, new THREE.Vector3(1.1, h, .22), COLORS.ivory);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, r = f.r * .66;
    B.get('glass').cyl(f.x + Math.cos(a) * r, y + .46, f.z + Math.sin(a) * r, .07, 1.1 + (i % 3) * .45, '#ffffff', 6);
    B.get('glowSoft').box(f.x + Math.cos(a) * (f.r - .22), y + .62, f.z + Math.sin(a) * (f.r - .22), .3, .04, .3, COLORS.warmLight);
  }
}

/** Three-tier seating steps in front of the SE end face, timber seat edges, trees behind. */
function seatingSteps(B, s, y, trees) {
  const r = s.rect, depth = (r.x1 - r.x0) / s.tiers;
  B.frame(s.frame, () => {
    for (let i = 0; i < s.tiers; i++) {
      const u0 = r.x0 + i * depth, hgt = (s.tiers - i) * .45;
      B.get('facadeStone').boxMinMax(u0, y, r.z0, u0 + depth, y + hgt, r.z1, '#e4ddcf');
      B.get('facadeTimber').boxMinMax(u0 + depth - .65, y + hgt, r.z0 + .3, u0 + depth - .05, y + hgt + .06, r.z1 - .3, '#b48d62');
      B.get('glowSoft').box(u0 + depth - .02, y + hgt - .08, (r.z0 + r.z1) / 2, .03, .04, r.z1 - r.z0 - .6, COLORS.warmLight);
    }
  });
  for (const v of [r.z0 + 1.6, r.z1 - 1.6]) { const [x, z] = toW(s.frame, r.x0 + .9, v); trees.push({ x, y: y + 3 * .45, z, s: .7 }); }
}

/** Sunken-court tree sculpture: a white trunk forks into branches that carry
 * hexagonal leaf plates; warm lights under the plates at night. */
function cloudUmbrella(B, s, y) {
  const h = s.height, top = y + h, fork = y + .5 + h * .48;
  B.get('extSatin').cyl(s.x, y, s.z, 1.1, .5, '#d8d2c6', 16);
  B.get('extSatin').cyl(s.x, y + .5, s.z, .4, h * .48, COLORS.ivory, 12);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + .3, r1 = s.crown * .5, mid = { x: s.x + Math.cos(a) * r1, y: top - 2.2 - (i % 2) * .6, z: s.z + Math.sin(a) * r1 };
    B.get('extSatin').bar({ x: s.x, y: fork, z: s.z }, mid, .26, COLORS.ivory);
    for (const da of [-.32, .32]) {
      const r2 = s.crown * (.8 + (i % 2) * .15), tip = { x: s.x + Math.cos(a + da) * r2, y: top - .5 - ((i + (da > 0)) % 2) * .7, z: s.z + Math.sin(a + da) * r2 };
      B.get('extSatin').bar(mid, tip, .16, COLORS.ivory);
      B.get('extSatin').cyl(tip.x, tip.y, tip.z, 1.45, .1, COLORS.ivory, 6);
      B.get('glowSoft').cyl(tip.x, tip.y - .03, tip.z, .5, .03, COLORS.warmLight, 8);
    }
    B.get('extSatin').cyl(mid.x, mid.y + .2, mid.z, 1.15, .1, COLORS.ivory, 6);
  }
  B.get('extSatin').cyl(s.x, top - .2, s.z, 1.7, .12, COLORS.ivory, 6);
}

/** Hotel drop-off: asphalt loop off the parking aisle round an oval planter. */
function dropOffLoop(B, loop, trees) {
  addCutSurfaceSlab(B, 'ext', roundedRectPoly(loop.rect, loop.corner, 6), [], .046, .05, '#5c6260');
  const [a, b] = loop.planter, ellipse = da => ellipsePoly(loop.cx, loop.cz, a + da, b + da, 36);
  addCutSurfaceSlab(B, 'extSatin', ellipse(.3), [ellipse(0)], .5, .45, '#d9d2c3');
  addCutSurfaceSlab(B, 'ext', ellipse(0), [], .42, .1, '#5b4532');
  for (let i = 0; i < 14; i++) {
    const t = i / 14 * Math.PI * 2, rr = .35 + (i % 3) * .2;
    B.get('foliage').sphere(loop.cx + a * .72 * Math.cos(t), .5 + rr * .6, loop.cz + b * .62 * Math.sin(t), rr, i % 4 ? '#5e9a44' : '#e9c46a', rr * .8, rr, 'ico0');
  }
  trees.push({ x: loop.cx, y: .42, z: loop.cz, s: .8 });
  // Dashed lane line midway round the planter.
  for (let i = 0; i < 40; i += 2) {
    const t = i / 40 * Math.PI * 2, x = loop.cx + (a + 2.6) * Math.cos(t), z = loop.cz + (b + 2.6) * Math.sin(t);
    const tx = -(a + 2.6) * Math.sin(t), tz = (b + 2.6) * Math.cos(t);
    B.get('ext').box(x, .1, z, .9, .012, .12, '#efefe1', Math.atan2(-tz, tx));
  }
}
