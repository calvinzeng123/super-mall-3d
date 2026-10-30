// Concept A fidelity renderer (tour only): the 06 diagrid dome, the 01 hipped
// glass canopy, the north-wing canyon skylight and the three facade posters, plus
// the roofscape (p1-roofscape.js) and ground landscape (p1-landscape.js).
// Frames, columns and footprints share their layout records, so navigation
// obstacles and visible solids match.
import * as THREE from 'three';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { COLORS } from '../theme.js';
import { buildP1Roofscape, ROOFSCAPE_TYPES } from './p1-roofscape.js';
import { buildP1Landscape } from './p1-landscape.js';

const STEEL = '#c9cdc8';
const FORM_TYPES = new Set(['art-dome', 'glass-canopy', 'canyon-skylight']);

export function buildP1Fidelity(ctx) {
  if (ctx.layout.playable || !ctx.layout.fidelity) return;
  for (const lv of ctx.layout.levels.filter(l => l.kind === 'roof' && l.features.some(f => FORM_TYPES.has(f.type) || ROOFSCAPE_TYPES.has(f.type)))) {
    const L = ctx.levels[lv.id];
    if (!L) continue;
    for (const f of lv.features) {
      if (f.type === 'art-dome') artDome(ctx, L, f, lv.elev);
      else if (f.type === 'glass-canopy') glassCanopy(ctx, L, f, lv.elev);
      else if (f.type === 'canyon-skylight') canyonSkylight(L, f, lv.elev);
    }
    buildP1Roofscape(ctx, L, lv);
  }
  buildPosters(ctx);
  buildP1Landscape(ctx);
}

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
    B.get('facadeBronze').bar(p, q, .55, COLORS.bronze);
    B.get('glow').bar({ ...p, y: p.y - .36 }, { ...q, y: q.y - .36 }, .08, COLORS.warmLight);
  }
  for (const [x, z] of f.columnsAt) {
    B.get('facadeBronze').cyl(x, y0, z, f.columnRadius, f.spring, COLORS.bronze, 12);
    B.get('extMetal').cyl(x, y0, z, f.columnRadius + .12, .35, '#6c5a43', 12);
  }
  // A small oculus crown at the apex.
  const top = at(rings, 0);
  B.get('facadeBronze').cyl(f.cx, top.y - .2, f.cz, 1.6, .45, COLORS.bronze, 24);
  B.get('glow').cyl(f.cx, top.y + .22, f.cz, 1.1, .06, COLORS.warmLight, 24);
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
  for (let i = 0; i < 4; i++) B.get('facadeBronze').bar(V(c[i]), V(c[(i + 1) % 4]), .42, COLORS.bronze);
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
    B.get('facadeBronze').cyl(x, y0, z, f.columnRadius, f.eave, COLORS.bronze, 10);
    B.get('glow').box(x, eave - .3, z, .9, .05, .9, COLORS.warmLight);
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
    B.get('facadeBronze').box(cu, y0 + curb + rise, 0, len, .16, .2, COLORS.bronze);
    B.get('glow').box(cu, y0 + curb + .05, 0, len - .6, .05, .14, COLORS.warmLight);
  });
}

/** Wing-end and square posters: programmatic abstract portraits in bronze frames. */
function buildPosters(ctx) {
  const P1 = ctx.layout.levels.filter(l => l.building === 'P1' && l.kind !== 'roof');
  ctx.layout.fidelity.billboards.forEach((b, i) => {
    const lv = P1.find(l => b.y0 >= l.elev && b.y0 < l.elev + l.height), L = lv && ctx.levels[lv.id];
    if (!L) return;
    const W = 512, H = Math.round(W * b.height / b.width), c = makeCanvas(W, H), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, W * .3, H);
    grd.addColorStop(0, b.a); grd.addColorStop(1, b.b);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    portrait(g, W, H, i);
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, H * .8, W, H * .2);
    g.fillStyle = '#fbf4e6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${Math.round(W * .13)}px ${FONT_CN}`; g.fillText(b.title, W / 2, H * .865, W * .9);
    g.font = `600 ${Math.round(W * .05)}px ${FONT_EN}`; g.fillText(b.sub, W / 2, H * .94, W * .9);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.width, b.height), ctx.mats.sign(canvasTexture(c, { clamp: true })));
    const ry = Math.atan2(b.nx, b.nz), cy = (b.y0 + b.y1) / 2;
    mesh.position.set(b.x, cy, b.z); mesh.rotation.y = ry; mesh.name = `P1-poster-${b.id}`;
    L.facade.add(mesh);
    // Backing panel and frame, aligned with the plane's own width axis.
    const F = L.facadeBatch, tx = b.nz, tz = -b.nx, hw = b.width / 2 + .18;
    F.get('extMetal').box(b.x - b.nx * .1, cy, b.z - b.nz * .1, b.width + .5, b.height + .5, .14, '#2e2822', ry);
    for (const yy of [b.y0 - .18, b.y1 + .18]) F.get('facadeBronze').bar({ x: b.x - tx * hw, y: yy, z: b.z - tz * hw }, { x: b.x + tx * hw, y: yy, z: b.z + tz * hw }, .2, COLORS.bronze);
    for (const s of [-1, 1]) F.get('facadeBronze').bar({ x: b.x + s * tx * hw, y: b.y0 - .18, z: b.z + s * tz * hw }, { x: b.x + s * tx * hw, y: b.y1 + .18, z: b.z + s * tz * hw }, .2, COLORS.bronze);
  });
}

/** Three abstract portrait compositions (no external imagery). */
function portrait(g, W, H, kind) {
  const cx = W / 2, head = W * .2;
  g.save();
  g.globalAlpha = .22; g.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc((i * 173) % W, (i * 97) % (H * .7), W * (.08 + (i % 3) * .05), 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  if (kind === 0) {
    // Profile facing left: head, neck and shoulder in warm ivory.
    g.fillStyle = '#f3e3c8';
    g.beginPath(); g.ellipse(cx + W * .04, H * .34, head * .95, head * 1.18, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(cx - head * 1.05, H * .33); g.lineTo(cx - head * 1.25, H * .38); g.lineTo(cx - head * .9, H * .4); g.fill();
    g.fillRect(cx - head * .25, H * .44, head * .75, H * .12);
    g.beginPath(); g.ellipse(cx + W * .05, H * .8, W * .42, H * .24, 0, Math.PI, 0); g.fill();
    g.strokeStyle = '#d9a24a'; g.lineWidth = W * .012;
    g.beginPath(); g.arc(cx + W * .04, H * .34, head * 1.55, -.6, 2.2); g.stroke();
  } else if (kind === 1) {
    // Frontal figure inside concentric rings.
    g.strokeStyle = 'rgba(255,244,224,.55)'; g.lineWidth = W * .01;
    for (let r = head * 1.3; r < W * .55; r += W * .07) { g.beginPath(); g.arc(cx, H * .36, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#efe4d0';
    g.beginPath(); g.arc(cx, H * .33, head, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx, H * .8, W * .38, H * .27, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#c9a46a'; g.fillRect(cx - W * .02, H * .45, W * .04, H * .1);
  } else {
    // Market grid: a figure of stacked colour blocks.
    const cols = ['#e0b77a', '#f2e6d2', '#9c6b3f', '#d8c2a0'];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 7; j++) {
      if ((i * 3 + j) % 4 === 0) continue;
      g.fillStyle = cols[(i + j) % cols.length]; g.globalAlpha = .35 + ((i * j) % 3) * .2;
      g.fillRect(W * (.1 + i * .16), H * (.06 + j * .1), W * .14, H * .085);
    }
    g.globalAlpha = 1; g.fillStyle = '#f6ecdc';
    g.beginPath(); g.arc(cx, H * .3, head * .9, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx, H * .78, W * .34, H * .22, 0, Math.PI, 0); g.fill();
  }
  g.restore();
}
