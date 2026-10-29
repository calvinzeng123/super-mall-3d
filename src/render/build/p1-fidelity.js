// Concept A roof forms: the 06 diagrid dome, the 01 hipped glass canopy and the
// north-wing canyon skylight. Frames and columns share their layout records,
// so navigation obstacles and visible solids stay identical.
import * as THREE from 'three';
import { toW } from '../../layout/geom.js';

const BRONZE = '#8f7553', STEEL = '#c9cdc8', WARM = '#ffe0a8';

/** Spherical cap on a ring beam carried by columns; diagrid of meridians, rings and diagonals. */
function artDome(ctx, L, f, y0) {
  const B = L.batch, a = f.radius, h = f.rise, spring = y0 + f.spring;
  const Rs = (a * a + h * h) / (2 * h), cy = spring + h - Rs, theta0 = Math.asin(a / Rs);
  const rings = 7, meridians = 24;
  const at = (i, j) => {
    const t = theta0 * (1 - i / rings), p = (j / meridians) * Math.PI * 2;
    return { x: f.cx + Rs * Math.sin(t) * Math.cos(p), y: cy + Rs * Math.cos(t), z: f.cz + Rs * Math.sin(t) * Math.sin(p) };
  };
  const glass = new THREE.Mesh(new THREE.SphereGeometry(Rs - .05, 48, 14, 0, Math.PI * 2, 0, theta0), domeGlass(ctx));
  glass.position.set(f.cx, cy, f.cz);
  glass.name = 'P1-art-dome-glass';
  glass.renderOrder = 2;
  L.base.add(glass);
  for (let i = 0; i < rings; i++) for (let j = 0; j < meridians; j++) {
    const p = at(i, j), up = at(i + 1, j), next = at(i, j + 1);
    B.get('extMetal').bar(p, up, i ? .16 : .24, STEEL);
    if (i) B.get('extMetal').bar(p, next, .14, STEEL);
    // Alternate diagonals give the woven lattice read in the aerial.
    if (i < rings - 1) B.get('extMetal').bar(p, at(i + 1, j + ((i + j) % 2 ? 1 : -1)), .09, STEEL);
  }
  for (let j = 0; j < meridians; j++) {
    const p = at(0, j), q = at(0, j + 1);
    B.get('extMetal').bar(p, q, .55, BRONZE);
    B.get('glow').bar({ ...p, y: p.y - .36 }, { ...q, y: q.y - .36 }, .08, WARM);
  }
  for (const [x, z] of f.columnsAt) {
    B.get('extMetal').cyl(x, y0, z, f.columnRadius, f.spring, BRONZE, 12);
    B.get('extMetal').cyl(x, y0, z, f.columnRadius + .12, .35, '#6c5a43', 12);
  }
  // A small oculus crown at the apex.
  const top = at(rings, 0);
  B.get('extMetal').cyl(f.cx, top.y - .2, f.cz, 1.6, .45, BRONZE, 24);
  B.get('glow').cyl(f.cx, top.y + .22, f.cz, 1.1, .06, WARM, 24);
}

function domeGlass(ctx) {
  if (ctx.fidelityGlass) return ctx.fidelityGlass;
  const m = ctx.mats.base.glass.clone();
  m.color.set('#b9d3d0'); m.opacity = .34; m.side = THREE.DoubleSide; m.envMapIntensity = 2.0;
  m.name = 'P1 dome glass';
  ctx.mats.onNight?.((t) => { m.emissive.set('#ffcf8a').multiplyScalar(t * .22); });
  return (ctx.fidelityGlass = m);
}

/** Hipped glass roof on perimeter columns: two trapezoids, two triangles, rafters and purlins. */
function glassCanopy(ctx, L, f, y0) {
  const B = L.batch, r = f.rect, eave = y0 + f.eave, ridge = y0 + f.ridge;
  const cz = (r.z0 + r.z1) / 2, hw = (r.z1 - r.z0) / 2, rx0 = r.x0 + hw, rx1 = r.x1 - hw;
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const c = [P(r.x0, eave, r.z0), P(r.x1, eave, r.z0), P(r.x1, eave, r.z1), P(r.x0, eave, r.z1)];
  const k0 = P(rx0, ridge, cz), k1 = P(rx1, ridge, cz);
  const tris = [[c[0], c[1], k1], [c[0], k1, k0], [c[2], c[3], k0], [c[2], k0, k1], [c[1], c[2], k1], [c[3], c[0], k0]];
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((v, k) => pos.set([v.x, v.y, v.z], i * 9 + k * 3)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const glass = new THREE.Mesh(g, domeGlass(ctx));
  glass.name = 'P1-square-canopy-glass';
  glass.renderOrder = 2;
  L.base.add(glass);
  const V = v => ({ x: v.x, y: v.y, z: v.z });
  for (let i = 0; i < 4; i++) B.get('extMetal').bar(V(c[i]), V(c[(i + 1) % 4]), .42, BRONZE);
  for (const [a, b] of [[c[0], k0], [c[3], k0], [c[1], k1], [c[2], k1], [k0, k1]]) B.get('extMetal').bar(V(a), V(b), .26, STEEL);
  // Rafters every ~2.2 m on all four faces and purlins at fifths of the slope:
  // from the aerial the pane grid is what reads as a glass roof.
  const n = Math.round((r.x1 - r.x0) / 2.2), m = Math.round((r.z1 - r.z0) / 2.2);
  for (let i = 1; i < n; i++) {
    const x = r.x0 + (r.x1 - r.x0) * i / n, kx = Math.min(rx1, Math.max(rx0, x));
    for (const z of [r.z0, r.z1]) B.get('extMetal').bar({ x, y: eave, z }, { x: kx, y: ridge, z: cz }, .08, STEEL);
  }
  for (let i = 1; i < m; i++) {
    // Hip-end faces converge on the ridge ends.
    const z = r.z0 + (r.z1 - r.z0) * i / m;
    for (const [x, kx] of [[r.x0, rx0], [r.x1, rx1]]) B.get('extMetal').bar({ x, y: eave, z }, { x: kx, y: ridge, z: cz }, .08, STEEL);
  }
  for (const t of [.2, .4, .6, .8]) {
    const y = eave + (ridge - eave) * t, dz = hw * (1 - t), x0 = r.x0 + hw * t, x1 = r.x1 - hw * t;
    const ring = [P(x0, y, cz - dz), P(x1, y, cz - dz), P(x1, y, cz + dz), P(x0, y, cz + dz)];
    for (let i = 0; i < 4; i++) B.get('extMetal').bar(V(ring[i]), V(ring[(i + 1) % 4]), .1, STEEL);
  }
  for (const [x, z] of f.columnsAt) {
    B.get('extMetal').cyl(x, y0, z, f.columnRadius, f.eave, BRONZE, 10);
    B.get('glow').box(x, eave - .3, z, .9, .05, .9, WARM);
  }
}

/** Raised glazed ridge along the north-wing street, read from above as an open canyon. */
function canyonSkylight(L, f, y0) {
  const B = L.batch, r = f.rect, len = r.x1 - r.x0, half = (r.z1 - r.z0) / 2, curb = .7, rise = 1.7;
  B.frame(f.frame, () => {
    const cu = (r.x0 + r.x1) / 2, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      B.get('facadeStone').box(cu, y0 + curb / 2, s * (half - .2), len, curb, .4, '#d8d2c4');
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s * ang);
      B.get('glass').shape('box', new THREE.Vector3(cu, y0 + curb + rise / 2, s * half / 2), q, new THREE.Vector3(len, .04, slope), '#ffffff');
      for (let u = r.x0; u <= r.x1 + .01; u += 2.5)
        B.get('extMetal').bar({ x: u, y: y0 + curb, z: s * half }, { x: u, y: y0 + curb + rise, z: 0 }, .08, STEEL);
    }
    for (const u of [r.x0, r.x1]) B.get('facadeStone').box(u, y0 + curb / 2, 0, .4, curb, half * 2, '#d8d2c4');
    B.get('extMetal').box(cu, y0 + curb + rise, 0, len, .16, .2, BRONZE);
    B.get('glow').box(cu, y0 + curb + .05, 0, len - .6, .05, .14, WARM);
  });
}

export function buildP1FidelityRoof(ctx) {
  if (ctx.layout.playable) return;
  for (const lv of ctx.layout.levels.filter(l => l.kind === 'roof' && l.building === 'P1')) {
    const L = ctx.levels[lv.id];
    for (const f of lv.features) {
      if (f.type === 'art-dome') artDome(ctx, L, f, lv.elev);
      else if (f.type === 'glass-canopy') glassCanopy(ctx, L, f, lv.elev);
      else if (f.type === 'canyon-skylight') canyonSkylight(L, f, lv.elev);
    }
  }
}

/** Camera targets for tours and labels. */
export const domeCenter = (f, y0) => ({ x: f.cx, y: y0 + f.spring + f.rise * .6, z: f.cz });
export const featureWorld = (f, u, v) => toW(f.frame, u, v);
