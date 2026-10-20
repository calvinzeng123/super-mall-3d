import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { frame } from '../../layout/geom.js';
import { carGeometry } from './parking.js';
import { addTrees } from './props.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';

const C = { metal: '#53675f', gold: '#c7ac71', paving: '#d0c9b7', wood: '#9d8060', line: '#e4d6a5' };
function sign(ctx, group, text, subtitle, x, y, z, width, angle = 0, light = false) {
  const canvas = makeCanvas(768, 192), g = canvas.getContext('2d');
  g.fillStyle = light ? '#e2dcc7' : '#28453d'; g.fillRect(0, 0, 768, 192);
  g.strokeStyle = '#b39c6e'; g.lineWidth = 3; g.strokeRect(6, 6, 756, 180);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = light ? '#29433a' : '#efe7cb';
  g.font = `600 45px ${FONT_CN}`; g.fillText(text, 384, 70, 735);
  g.font = `500 24px ${FONT_EN}`; g.fillText(subtitle, 384, 137, 725);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), ctx.mats.sign(canvasTexture(canvas, { clamp: true })));
  mesh.position.set(x, y, z); mesh.rotation.y = angle; mesh.name = `transit-sign-${text}`; group.add(mesh);
  return mesh;
}
function coach(B, item) {
  B.frame(frame(item.x, item.z, item.rotation * 180 / Math.PI), () => {
    const half = item.w / 2, color = item.color;
    // Tapered end caps, wheel housings, separate window band and rooftop HVAC.
    B.get('extSatin').box(0, 1.18, 0, item.w - .45, 1.45, item.d, color);
    B.get('extSatin').box(0, 2.25, 0, item.w - .7, 1.05, item.d - .1, color);
    B.get('extSatin').box(0, 2.88, 0, item.w - .75, .22, item.d - .23, '#cfd8ce');
    for (const side of [-1, 1]) {
      B.get('extSatin').box(side * (half - .15), 1.23, 0, .3, 1.3, item.d - .18, color);
      B.get('extMetal').box(side * (half - .03), .56, 0, .08, .2, item.d - .15, '#384b45');
      B.get('glassTint').box(side * (half - .27), 2.19, 0, .04, .86, item.d - .22, '#ffffff');
      B.get('extMetal').box(side * (half - .24), 2.18, 0, .055, .92, .045, C.metal);
      B.get('glowSoft').box(side * (half + .012), 1.05, -.87, .025, .14, .34, side > 0 ? '#e9e2b8' : '#b5523f');
      B.get('glowSoft').box(side * (half + .012), 1.05, .87, .025, .14, .34, side > 0 ? '#e9e2b8' : '#b5523f');
    }
    for (const side of [-1, 1]) {
      const zz = side * (item.d / 2 + .01);
      B.get('extMetal').box(0, 1.69, zz, item.w - .7, .065, .04, C.metal);
      for (let x = -half + .75; x < half - .45; x += 1.28) {
        B.get('glassTint').box(x, 2.19, zz, 1.14, .9, .035, '#ffffff');
        B.get('extMetal').box(x + .59, 2.19, zz + side * .024, .045, 1.03, .04, C.metal);
        if (x < half - 1.8) {
          B.get('satin').box(x, 1.78, side * .72, .7, .85, .43, '#64766c');
          B.get('satin').box(x, 1.41, side * .62, .7, .2, .6, '#64766c');
        }
      }
      B.get('extSatin').box(0, 1.45, zz + side * .02, item.w - .5, .16, .04, C.gold);
      // Panel seams and the luggage-hold handles below the glazing.
      for (const x of [-3.1, -1.1, 1.1, 3.1]) {
        B.get('extMetal').box(x, .98, zz + side * .03, .018, .75, .015, '#62786e');
        B.get('extMetal').box(x - .35, 1.21, zz + side * .035, .3, .04, .02, C.metal);
      }
    }
    for (const x of [-half + 2.2, half - 2.5]) for (const side of [-1, 1]) {
      const z = side * (item.d / 2 + .035), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      B.get('matte').shape('cyl16', new THREE.Vector3(x, .51, z + .12), q, new THREE.Vector3(.92, .26, .92), '#1a2727');
      B.get('extMetal').shape('torus', new THREE.Vector3(x, .51, z + side * .14), new THREE.Quaternion(), new THREE.Vector3(.58, .58, .5), '#b7c1b7');
      B.get('extMetal').sphere(x, .51, z + side * .15, .2, '#80938a', .2, .04, 'sphereLo');
    }
    // Two doors on the north boarding side; tread and handrail details remain
    // inside the bus footprint, not across the passenger platform.
    for (const x of [half - 1.15, .2]) {
      B.get('extMetal').box(x, 1.6, -item.d / 2 - .025, .95, 2.02, .055, '#28453d');
      for (const dx of [-.23, .23]) B.get('glassTint').box(x + dx, 1.75, -item.d / 2 - .065, .39, 1.55, .02, '#ffffff');
      B.get('extMetal').box(x, 1.65, -item.d / 2 - .085, .035, 1.85, .02, '#8c9e8c');
    }
    for (const x of [-2, 2]) {
      B.get('extSatin').box(x, 3.12, 0, 2.4, .4, 1.6, '#d5dacf');
      for (let dx = -.85; dx < .9; dx += .18) B.get('extMetal').box(x + dx, 3.33, 0, .05, .025, 1.2, '#9cac9f');
    }
    for (const z of [-1.52, 1.52]) {
      B.get('extMetal').bar({ x: half - .5, y: 2.6, z: Math.sign(z) * 1.25 }, { x: half - .2, y: 2.6, z }, .045, C.metal);
      B.get('extMetal').box(half - .2, 2.42, z, .17, .43, .1, C.metal);
    }
  });
}
function waitingBench(B, seat) {
  const { x, z, w, d } = seat;
  for (const dx of [-w * .38, w * .38]) B.get('extMetal').box(x + dx, .24, z, .08, .48, d * .8, C.metal);
  for (let dz = -d / 2; dz < d / 2; dz += .11) B.get('wood').box(x, .48, z + dz, w, .09, .08, C.wood);
  for (let yy = .7; yy < 1.1; yy += .13) B.get('wood').box(x, yy, z - d * .4, w, .1, .06, C.wood);
  for (const dx of [-w / 2, -w / 6, w / 6, w / 2]) B.get('extMetal').box(x + dx, .72, z, .04, .1, d, C.metal);
}

export function buildTransitCenter(ctx) {
  const plan = ctx.layout.site.transitCenter;
  if (!plan) return null;
  const group = new THREE.Group(); group.name = 'P1-transport-center';
  group.userData = { vehicleCount: plan.vehicles.length, busBays: plan.busBays.length, taxiBays: plan.taxiBays.length, accessible: true };
  const B = new BatchSet(ctx.mats.base);
  for (const platform of plan.platforms) {
    const r = platform.rect, w = r.x1 - r.x0, d = r.z1 - r.z0;
    B.get('concrete').box((r.x0 + r.x1) / 2, .035, (r.z0 + r.z1) / 2, w, .055, d, C.paving);
    // Tactile edging is raised only a few millimetres so it stays traversable.
    const z = platform.id.includes('bus') ? r.z1 - .28 : r.z0 + .28;
    B.get('extSatin').box((r.x0 + r.x1) / 2, .07, z, w - .3, .012, .3, C.gold);
    for (let x = r.x0 + .2; x < r.x1; x += .33) B.get('extSatin').box(x, .081, z, .018, .007, .23, '#ae935d');
  }
  for (const r of plan.busBays) {
    for (const z of [r.z0, r.z1]) B.get('matte').box((r.x0 + r.x1) / 2, .026, z, r.x1 - r.x0, .012, .12, C.line);
    for (const x of [r.x0, r.x1]) B.get('matte').box(x, .026, (r.z0 + r.z1) / 2, .12, .012, r.z1 - r.z0, C.line);
  }
  for (const bay of plan.taxiBays) {
    const r = bay.rect, x = (r.x0 + r.x1) / 2;
    if (bay.accessible) B.get('matte').box(x, .024, (r.z0 + r.z1) / 2, r.x1 - r.x0 - .2, .01, r.z1 - r.z0 - .2, '#3f847b');
    for (const xx of [r.x0, r.x1]) B.get('matte').box(xx, .03, (r.z0 + r.z1) / 2, .1, .012, r.z1 - r.z0, C.line);
    B.get('matte').box(x, .03, r.z1, r.x1 - r.x0, .012, .1, C.line);
    B.get('extSatin').box(x, .12, r.z1 - .25, 1.7, .19, .19, '#777d6e');
  }
  for (const shelter of plan.shelters) {
    const { x, z, w, d } = shelter;
    for (const [px, pz] of shelter.posts) {
      B.get('extMetal').box(px, 1.62, pz, .16, 3.24, .16, C.metal);
      B.get('extMetal').bar({ x: px, y: 2.85, z: pz }, { x: px, y: 3.25, z: z + d / 2 }, .07, C.metal);
    }
    B.get('glass').box(x, 1.56, z - d / 2, w, 2.75, .055, '#ffffff');
    B.get('extMetal').box(x, 3.3, z, w + .3, .16, d + .3, C.metal);
    for (let xx = x - w / 2 + .25; xx < x + w / 2; xx += .25) B.get('wood').box(xx, 3.2, z, .065, .055, d, '#b89d75');
    B.get('glowSoft').box(x, 3.155, z + d * .2, w - .5, .025, .08, '#f1dfb2');
    sign(ctx, group, shelter.name, 'PLEASE WAIT BEHIND THE LINE · YUNLAN TRANSPORT', x, 2.88, z + d / 2 + .16, Math.min(13, w - 1));
  }
  for (const seat of plan.seats) waitingBench(B, seat);
  for (const item of plan.vehicles.filter(v => v.type === 'coach')) {
    coach(B, item);
    sign(ctx, group, item.route, 'YUNLAN · ELECTRIC COACH', item.x + item.w / 2 + .025, 2.69, item.z, 1.9, Math.PI / 2);
  }
  const taxis = plan.vehicles.filter(v => v.type === 'taxi');
  if (taxis.length) {
    const mesh = new THREE.InstancedMesh(ctx.carGeo || carGeometry(), ctx.carMat || ctx.mats.base.extSatin, taxis.length);
    mesh.name = 'transit-taxis'; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    taxis.forEach((car, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation); m.compose(p.set(car.x, .03, car.z), q, s);
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, new THREE.Color(car.color));
      B.get('glowSoft').box(car.x, 1.53, car.z, .65, .2, .28, '#ede4b2');
      sign(ctx, group, 'TAXI', '云澜的士', car.x, 1.54, car.z - .145, .57, Math.PI);
    });
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  for (const kiosk of plan.kiosks) {
    const { x, z, w, d } = kiosk;
    B.get('stone').box(x, 3.12, z, w + .25, .2, d + .25, '#ddd5be');
    B.get('wood').box(x, 1.4, z - d / 2, w, 2.8, .18, '#997d58');
    for (const xx of [x - w / 2, x + w / 2]) B.get('glass').box(xx, 1.4, z, .1, 2.8, d, '#ffffff');
    for (const xx of [x - w / 2, x + w / 2]) for (const zz of [z - d / 2, z + d / 2]) B.get('extMetal').box(xx, 1.5, zz, .12, 3, .12, C.metal);
    B.get('wood').box(x - .75, .53, z + 1.8, 3.5, 1.06, .8, '#9c825e');
    B.get('stone').box(x - .75, 1.1, z + 1.8, 3.65, .08, .93, '#e3d8bd');
    B.get('extMetal').box(x - 1.2, 1.32, z + 1.7, .65, .4, .08, '#2a3f38');
    B.get('glowSoft').box(x - 1.2, 1.32, z + 1.75, .57, .31, .01, '#9ab3a4');
    sign(ctx, group, kiosk.name, 'INFORMATION · BAGGAGE · ACCESSIBILITY', x, 2.55, z + d / 2 + .08, 5.4);
    sign(ctx, group, '机场 · 商场 · 酒店', '01 AIRPORT   /   02 CAMPUS SHUTTLE', x, 1.97, z - d / 2 + .13, 4.8);
  }
  for (const s of plan.signs) {
    B.get('extMetal').box(s.x, 1.35, s.z, .12, 2.7, .12, C.metal);
    sign(ctx, group, s.text, s.subtitle, s.x, 2.85, s.z, s.width, s.rotation);
  }
  for (const t of plan.trees) {
    B.get('stone').cyl(t.x, 0, t.z, t.r, .4, '#beb49a', 16);
    B.get('matte').cyl(t.x, .4, t.z, t.r - .08, .025, '#625b40', 16);
  }
  B.flush(group);
  addTrees(group, ctx.mats, plan.trees.map(t => ({ x: t.x, z: t.z, y: .42, s: .72, kind: 'round' })), 286);
  ctx.site.group.add(group);
  ctx.transitCenter = { group, plan };
  return group;
}
