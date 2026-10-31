import * as THREE from 'three';
import { frame, rect, rectPoly, lrectPoly, circlePoly } from '../../layout/geom.js';
import { finishClipping as clipping } from '../../layout/p1-finishes.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { addFinishMesh } from './floor-finishes.js';
import { addCutSurfaceSlab } from './surface-shapes.js';

const C = { stone: '#e3dfd2', bronze: '#96774f', teal: '#466d70', ink: '#243f44', wood: '#b29169', light: '#ffe2ac' };

function sign(group, text, sub, x, y, z, width, height, angle = 0) {
  if (typeof document === 'undefined' || !group) return;
  const canvas = makeCanvas(1024, 240), c = canvas.getContext('2d');
  c.fillStyle = C.ink; c.fillRect(0, 0, 1024, 240);
  c.fillStyle = '#f7f3e9'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `600 80px ${FONT_CN}`; c.fillText(text, 512, 88);
  c.fillStyle = '#d8c9a8'; c.font = `500 36px ${FONT_EN}`; c.fillText(sub, 512, 180);
  const material = new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(x, y, z); mesh.rotation.y = angle; mesh.name = text; group.add(mesh);
}

export function buildWestArrival(ctx) {
  const D = ctx.layout.expansion?.westArrival;
  if (!D || ctx.layout.playable) return;
  const B = ctx.site.batch, G = ctx.site.group, g = D.gate, path = D.path;
  const strips = width => path.points.slice(1).flatMap((b, i) => {
    if (path.crossingSegments.includes(i)) return [];
    const a = path.points[i], dx = b[0] - a[0], dz = b[1] - a[1];
    return [[lrectPoly(frame(...a, Math.atan2(dz, dx) * 180 / Math.PI), rect(-.02, -width / 2, Math.hypot(dx, dz) + .02, width / 2))]];
  });
  const outer = clipping.union(...strips(path.width)), inner = clipping.union(...strips(path.width - .65));
  addFinishMesh(G, outer, ctx.mats.floor('p1-paving-border'), -.071, 'P1-west-entry-stone-border');
  addFinishMesh(G, inner, ctx.mats.floor('p1-paving'), -.065, 'P1-west-entry-paved-axis');
  for (const r of g.piers) {
    B.get('facadeTravertine').box((r.x0 + r.x1) / 2, g.height / 2 - .15, (r.z0 + r.z1) / 2, r.x1 - r.x0, g.height, r.z1 - r.z0, C.stone);
    B.get('facadeBronze').box(g.x - .57, 2.65, (r.z0 + r.z1) / 2, .045, 5.2, .12, C.bronze);
  }
  B.get('facadeTravertine').box(g.x, g.height - .35, g.z, 2.8, .7, g.width + 1, C.stone);
  B.get('facadeBronze').box(g.x, g.height + .06, g.z, 3.0, .12, g.width + 1.3, C.bronze);
  B.get('glowSoft').box(g.x, g.height - .73, g.z, .1, .035, g.width - 1.4, C.light);
  for (let z = g.z - 4.1; z <= g.z + 4.1; z += .5) B.get('facadeBronze').box(g.x + .4, g.height - .55, z, 1.8, .18, .06, C.bronze);
  sign(G, '西 门', 'WEST ENTRANCE · 艺术街 / 一期商场', g.x - 1.415, g.height - .36, g.z, 5.9, .84, -Math.PI / 2);
  sign(G, '西 门', 'WEST EXIT · 西外环 / 地面停车场', g.x + 1.415, g.height - .36, g.z, 5.9, .84, Math.PI / 2);
}

/** Shared between the outdoor preview and the streamed B1M interior. */
export function buildCourtFurniture(B, court) {
  const y = court.elev;
  for (const seat of court.seats) {
    addCutSurfaceSlab(B, 'facadeTravertine', seat.poly, [], y + seat.height, seat.height, C.stone);
    addCutSurfaceSlab(B, 'facadeTimber', seat.poly, [], y + seat.height + .045, .045, C.wood);
    const arc = seat.poly.slice(0, 25);
    for (let i = 1; i < arc.length; i++) B.get('glowSoft').bar({ x: arc[i - 1][0], y: y + seat.height - .07, z: arc[i - 1][1] },
      { x: arc[i][0], y: y + seat.height - .07, z: arc[i][1] }, .025, C.light);
  }
  for (const p of court.planters) {
    B.get('facadeTravertine').cyl(p.x, y, p.z, p.r + .12, .65, C.stone, 24);
    B.get('ext').cyl(p.x, y + .61, p.z, p.r - .12, .08, '#514a3b', 24);
    B.get('wood').cyl(p.x, y + .66, p.z, .11, 1.5, '#77634a', 10);
    B.get('foliage').sphere(p.x, y + 2.35, p.z, 1.15, '#74865c', .95, 1.15, 'ico');
  }
  const a = court.art;
  B.get('facadeTravertine').cyl(a.x, y, a.z, a.r, .24, C.stone, 32);
  for (const k of [-1, 1]) {
    const point = i => { const t = i / 48 * Math.PI * 2; return { x: a.x + Math.cos(t) * 1.35,
      y: y + .24 + a.height / 2 + Math.sin(t) * a.height / 2, z: a.z + Math.cos(t) * .72 * k }; };
    for (let i = 0; i < 48; i++) B.get(k > 0 ? 'facadeBronze' : 'extSatin').bar(point(i), point(i + 1), .24, k > 0 ? C.bronze : C.teal);
  }
}

export function buildCourtInlaysAndSigns(ctx, court) {
  const L = ctx.levels[court.level], B = L.shellBatch, y = court.elev;
  const disc = r => circlePoly(court.art.x, court.art.z, r, 64);
  for (const [inner, outer, color] of [[2.1, 2.4, C.teal], [2.65, 2.72, C.bronze], [3.05, 3.1, C.bronze]])
    addCutSurfaceSlab(B, 'extSatin', disc(outer), [disc(inner)], y + .012, .012, color);
  // Fine bronze curves echo both the sculpture and the fan-shaped timber seating.
  for (const radius of [9.1, 9.4]) {
    for (let i = 0; i < 32; i++) {
      const p = t => ({ x: -97.5 + Math.cos(t) * radius, y: y + .015, z: -42.5 + Math.sin(t) * radius });
      B.get('extSatin').bar(p((48 + i * 84 / 32) * Math.PI / 180), p((48 + (i + 1) * 84 / 32) * Math.PI / 180), .035, C.bronze);
    }
  }
  sign(L.shell, '云谷艺术广场', 'ECHO COURT · B1M', -123.72, y + 2.45, -44, 7, 1.45, Math.PI / 2);
  sign(L.shell, 'B1M 美食广场', 'FOOD HALL ↑', -108.5, y + 3.55, -55.69, 4.3, .75);
  sign(L.shell, '地铁云澜汇站 →', 'METRO · 7 / 12 号线', -86.31, y + 3.55, -38.5, 4.8, .75, -Math.PI / 2);
}
