// Concept A fidelity (tour only): the 06 diagrid dome, the 01 hipped glass
// canopy, the north-wing canyon skylight, roof gardens, annex roof pavilions,
// wing-end posters and the ground landscape. Frames, columns and footprints
// share their layout records, so navigation obstacles and visible solids match.
import * as THREE from 'three';
import { toW } from '../../layout/geom.js';
import { addTrees, planter, roundTable, umbrella } from './props.js';
import { addCutSurfaceSlab } from './surface-shapes.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';

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

const UMBRELLAS = ['#f4efe4', '#e9dcc4', '#cfd8cc', '#f2e6d2'];
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** Roof garden furniture: raised planters with shrubs and small trees, timber
 * decks with two tables each (umbrellas only in the open), the 02 glass pavilion
 * and the 03 timber lattice. */
function roofFurniture(ctx, L, lv, trees) {
  const B = L.batch, y = lv.elev;
  const lattices = lv.features.filter(f => f.type === 'timber-lattice').map(f => f.rect);
  let k = 0;
  for (const f of lv.features) {
    if (f.type === 'planter-bed') B.frame(f.frame, () => {
      const r = f.rect;
      planter(B, r.x0, r.z0, r.x1, r.z1, y, 41 + k++, false, 'ext');
      if (f.tree) { const [x, z] = toW(f.frame, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); trees.push({ x, y: y + .55, z, s: .72 + (k % 3) * .06, kind: 'round' }); }
    });
    else if (f.type === 'cafe-cluster') {
      const r = f.rect, covered = f.tablesAt.some(([x, z]) => lattices.some(l => inRect(l, x, z)));
      B.frame(f.frame, () => B.get('facadeTimber').box((r.x0 + r.x1) / 2, y + .06, (r.z0 + r.z1) / 2, r.x1 - r.x0, .12, r.z1 - r.z0, '#b89670'));
      for (const [x, z] of f.tablesAt) {
        roundTable(B, x, y + .12, z, 4, { top: '#efe7d8', chair: '#7d6a52' }, 'matte');
        if (!covered) umbrella(B, x, y + .12, z, UMBRELLAS[k % UMBRELLAS.length], 1.55);
        k++;
      }
    }
    else if (f.type === 'glass-pavilion') glassPavilion(B, f, y);
    else if (f.type === 'timber-lattice') timberLattice(B, f, y);
    else if (f.type === 'creative-roof') pitchedRoof(B, f, y);
  }
}

/** Glass box pavilion open to the lawn on its south side; bronze posts and fascia. */
function glassPavilion(B, f, y0) {
  const r = f.rect, h = f.height, top = y0 + h, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  B.get('facadeTimber').box(cx, y0 + .06, cz, w - .2, .12, d - .2, '#c2a27a');
  for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) B.get('extMetal').box(x, y0 + h / 2, z, .24, h, .24, BRONZE);
  // Three glazed sides with mullions every ~1.75 m; the south side stays open.
  B.get('glass').box(cx, y0 + h / 2, r.z0, w, h - .3, .05, '#ffffff');
  for (const x of [r.x0, r.x1]) B.get('glass').box(x, y0 + h / 2, cz, .05, h - .3, d, '#ffffff');
  for (let i = 1, n = Math.round(w / 1.75); i < n; i++) B.get('extMetal').box(r.x0 + w * i / n, y0 + h / 2, r.z0, .07, h, .1, BRONZE);
  for (const x of [r.x0, r.x1]) for (let i = 1, n = Math.round(d / 1.75); i < n; i++) B.get('extMetal').box(x, y0 + h / 2, r.z0 + d * i / n, .1, h, .07, BRONZE);
  // Fascia ring with a glazed roof light and a warm cove line for the night view.
  for (const z of [r.z0, r.z1]) B.get('extMetal').box(cx, top, z, w + 1.2, .42, .5, BRONZE);
  for (const x of [r.x0, r.x1]) B.get('extMetal').box(x, top, cz, .5, .42, d + 1.2, BRONZE);
  B.get('glass').box(cx, top + .1, cz, w - .4, .05, d - .4, '#ffffff');
  B.get('glow').box(cx, top - .26, r.z1 + .2, w, .05, .08, WARM);
  for (const [x, z] of f.tablesAt) roundTable(B, x, y0 + .12, z, 4, { top: '#efe7d8', chair: '#5d4a36' }, 'matte');
  const c = f.counter;
  B.get('facadeTimber').boxMinMax(c.x0, y0 + .1, c.z0, c.x1, y0 + 1.1, c.z1, '#9a7652');
}

/** Two crossing layers of timber slats on posts and perimeter beams. */
function timberLattice(B, f, y0) {
  const r = f.rect, top = y0 + f.height, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  for (const [x, z] of f.postsAt) B.get('facadeTimber').box(x, y0 + f.height / 2, z, .45, f.height, .45, '#8e6a45');
  for (const z of [r.z0, r.z1]) B.get('facadeTimber').box(cx, top - .22, z, w + .4, .45, .32, '#8e6a45');
  for (const x of [r.x0, r.x1]) B.get('facadeTimber').box(x, top - .22, cz, .32, .45, d + .4, '#8e6a45');
  B.get('facadeTimber').box(cx, top - .22, cz, w, .45, .32, '#8e6a45');
  for (let x = r.x0 + 1.4; x < r.x1 - .2; x += 1.4) B.get('facadeTimber').box(x, top + .14, cz, .14, .28, d + .6, '#a27c55');
  for (let z = r.z0 + 1.4; z < r.z1 - .2; z += 1.4) B.get('facadeTimber').box(cx, top + .42, z, w + .6, .28, .14, '#b58c62');
  for (const z of [r.z0 + .3, r.z1 - .3]) B.get('glowSoft').box(cx, top - .47, z, w - 1, .04, .06, WARM);
}

/** Raw triangles into a batch; each face also gets a reversed copy in the
 * underside colour so the roof reads from below as well as from the air. */
function pushTris(B, key, tris, top, under, drop = .12) {
  const face = (list, flip, dy) => {
    const pos = new Float32Array(list.length * 9), nor = new Float32Array(list.length * 9);
    list.forEach((t, i) => {
      const [a, b, c] = flip ? [t[0], t[2], t[1]] : t;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      [a, b, c].forEach((p, k) => { pos.set([p[0], p[1] - dy, p[2]], i * 9 + k * 3); nor.set(n, i * 9 + k * 3); });
    });
    B.get(key).push({ pos, nor, count: list.length * 3 }, new THREE.Matrix4(), flip ? under : top);
  };
  face(tris, false, 0);
  face(tris, true, drop);
}

/** 05 roofs: tiled gables with brick gable ends, or timber north-light sawtooth bays. */
function pitchedRoof(B, f, y0) {
  const r = f.rect, eave = y0 + f.eave, o = .55, cz = (r.z0 + r.z1) / 2, half = (r.z1 - r.z0) / 2;
  for (const [x, z] of f.postsAt) B.get('facadeTimber').box(x, y0 + f.eave / 2, z, .4, f.eave, .4, '#6f5139');
  for (const z of [r.z0, r.z1]) B.get('facadeTimber').box((r.x0 + r.x1) / 2, eave - .2, z, r.x1 - r.x0 + .4, .4, .3, '#6f5139');
  for (const x of [r.x0, r.x1]) B.get('facadeTimber').box(x, eave - .2, cz, .3, .4, r.z1 - r.z0 + .4, '#6f5139');
  if (f.style === 'gable') {
    const ridge = eave + f.rise, k = f.rise / half, lo = eave - k * o, x0 = r.x0 - o, x1 = r.x1 + o;
    const P = (x, y, z) => [x, y, z], N = [P(x0, lo, r.z0 - o), P(x1, lo, r.z0 - o), P(x1, ridge, cz), P(x0, ridge, cz)];
    const S = [P(x1, lo, r.z1 + o), P(x0, lo, r.z1 + o), P(x0, ridge, cz), P(x1, ridge, cz)];
    pushTris(B, 'facadeBrick', [[N[0], N[2], N[1]], [N[0], N[3], N[2]], [S[0], S[2], S[1]], [S[0], S[3], S[2]]], '#9a5b40', '#8a6a4e');
    // Brick gable ends sit on the eave beams, above head height.
    for (const x of [r.x0, r.x1]) pushTris(B, 'facadeBrick', [x === r.x0 ? [P(x, eave, r.z1), P(x, eave, r.z0), P(x, ridge, cz)] : [P(x, eave, r.z0), P(x, eave, r.z1), P(x, ridge, cz)]], '#b07454', '#a06a4c', 0);
    B.get('extMetal').bar({ x: x0, y: ridge + .08, z: cz }, { x: x1, y: ridge + .08, z: cz }, .22, '#5c4632');
    for (let x = r.x0 + 3; x < r.x1 - 1.5; x += 6) B.get('glass').shape('box', new THREE.Vector3(x, eave + f.rise * .55 + .06, cz + half * .45),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.atan(k)), new THREE.Vector3(1.6, .05, 2.2), '#ffffff');
  } else {
    const bays = 3, w = (r.x1 - r.x0) / bays;
    for (let i = 0; i < bays; i++) {
      const a = r.x0 + i * w, b = a + w, P = (x, y, z) => [x, y, z];
      const q = [P(a, eave, r.z0 - o), P(b, eave + f.rise, r.z0 - o), P(b, eave + f.rise, r.z1 + o), P(a, eave, r.z1 + o)];
      pushTris(B, 'facadeTimber', [[q[0], q[2], q[1]], [q[0], q[3], q[2]]], '#9c7a58', '#7f6247');
      B.get('glass').box(b, eave + f.rise / 2, cz, .05, f.rise, r.z1 - r.z0 + 2 * o, '#ffffff');
      B.get('extMetal').box(b, eave + f.rise + .05, cz, .16, .12, r.z1 - r.z0 + 2 * o, '#4f4a42');
    }
  }
  // Warm cove lights under the two long eave beams.
  for (const z of [r.z0 + .1, r.z1 - .1]) B.get('glow').box((r.x0 + r.x1) / 2, eave - .42, z, r.x1 - r.x0 - 1, .03, .08, WARM);
}

const ROOF_TYPES = new Set(['art-dome', 'glass-canopy', 'canyon-skylight', 'planter-bed', 'cafe-cluster', 'glass-pavilion', 'timber-lattice', 'creative-roof']);
export function buildP1FidelityRoof(ctx) {
  if (ctx.layout.playable || !ctx.layout.fidelity) return;
  for (const lv of ctx.layout.levels.filter(l => l.kind === 'roof' && l.features.some(f => ROOF_TYPES.has(f.type)))) {
    const L = ctx.levels[lv.id], trees = [];
    if (!L) continue;
    for (const f of lv.features) {
      if (f.type === 'art-dome') artDome(ctx, L, f, lv.elev);
      else if (f.type === 'glass-canopy') glassCanopy(ctx, L, f, lv.elev);
      else if (f.type === 'canyon-skylight') canyonSkylight(L, f, lv.elev);
    }
    roofFurniture(ctx, L, lv, trees);
    if (trees.length) addTrees(L.base, ctx.mats, trees, 171);
  }
  posters(ctx);
  ground(ctx);
}

/** Wing-end and square posters: programmatic abstract portraits in bronze frames. */
function posters(ctx) {
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
    for (const yy of [b.y0 - .18, b.y1 + .18]) F.get('extMetal').bar({ x: b.x - tx * hw, y: yy, z: b.z - tz * hw }, { x: b.x + tx * hw, y: yy, z: b.z + tz * hw }, .2, BRONZE);
    for (const s of [-1, 1]) F.get('extMetal').bar({ x: b.x + s * tx * hw, y: b.y0 - .18, z: b.z + s * tz * hw }, { x: b.x + s * tx * hw, y: b.y1 + .18, z: b.z + s * tz * hw }, .2, BRONZE);
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

/** Ground landscape from layout.fidelity.landscape: everything here is also a
 * forecourt obstacle, so walkers go round what they see. */
function ground(ctx) {
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

const IVORY = '#f4f1ea';
function courtFountain(B, f, y) {
  const circle = (r, n = 40) => Array.from({ length: n }, (_, i) => [f.x + r * Math.cos(i * 2 * Math.PI / n), f.z + r * Math.sin(i * 2 * Math.PI / n)]);
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
    B.get('extSatin').shape('box', new THREE.Vector3(f.x + Math.cos(a) * r0, base + Math.cos(tilt) * hh / 2, f.z + Math.sin(a) * r0), q, new THREE.Vector3(1.5, hh, .16), IVORY);
  }
  const q = new THREE.Quaternion().setFromAxisAngle(Y, .4);
  B.get('extSatin').shape('box', new THREE.Vector3(f.x, base + h / 2, f.z), q, new THREE.Vector3(1.1, h, .22), IVORY);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, r = f.r * .66;
    B.get('glass').cyl(f.x + Math.cos(a) * r, y + .46, f.z + Math.sin(a) * r, .07, 1.1 + (i % 3) * .45, '#ffffff', 6);
    B.get('glowSoft').box(f.x + Math.cos(a) * (f.r - .22), y + .62, f.z + Math.sin(a) * (f.r - .22), .3, .04, .3, WARM);
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
      B.get('glowSoft').box(u0 + depth - .02, y + hgt - .08, (r.z0 + r.z1) / 2, .03, .04, r.z1 - r.z0 - .6, WARM);
    }
  });
  for (const v of [r.z0 + 1.6, r.z1 - 1.6]) { const [x, z] = toW(s.frame, r.x0 + .9, v); trees.push({ x, y: y + 3 * .45, z, s: .7 }); }
}

/** Sunken-court tree sculpture: a white trunk forks into branches that carry
 * hexagonal leaf plates; warm lights under the plates at night. */
function cloudUmbrella(B, s, y) {
  const h = s.height, top = y + h, fork = y + .5 + h * .48;
  B.get('extSatin').cyl(s.x, y, s.z, 1.1, .5, '#d8d2c6', 16);
  B.get('extSatin').cyl(s.x, y + .5, s.z, .4, h * .48, IVORY, 12);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + .3, r1 = s.crown * .5, mid = { x: s.x + Math.cos(a) * r1, y: top - 2.2 - (i % 2) * .6, z: s.z + Math.sin(a) * r1 };
    B.get('extSatin').bar({ x: s.x, y: fork, z: s.z }, mid, .26, IVORY);
    for (const da of [-.32, .32]) {
      const r2 = s.crown * (.8 + (i % 2) * .15), tip = { x: s.x + Math.cos(a + da) * r2, y: top - .5 - ((i + (da > 0)) % 2) * .7, z: s.z + Math.sin(a + da) * r2 };
      B.get('extSatin').bar(mid, tip, .16, IVORY);
      B.get('extSatin').cyl(tip.x, tip.y, tip.z, 1.45, .1, IVORY, 6);
      B.get('glowSoft').cyl(tip.x, tip.y - .03, tip.z, .5, .03, WARM, 8);
    }
    B.get('extSatin').cyl(mid.x, mid.y + .2, mid.z, 1.15, .1, IVORY, 6);
  }
  B.get('extSatin').cyl(s.x, top - .2, s.z, 1.7, .12, IVORY, 6);
}

/** Hotel drop-off: asphalt loop off the parking aisle round an oval planter. */
function dropOffLoop(B, loop, trees) {
  const r = loop.rect, k = loop.corner, ring = [];
  for (const [cx, cz, a0] of [[r.x1 - k, r.z1 - k, 0], [r.x0 + k, r.z1 - k, Math.PI / 2], [r.x0 + k, r.z0 + k, Math.PI], [r.x1 - k, r.z0 + k, Math.PI * 1.5]])
    for (let i = 0; i <= 6; i++) { const a = a0 + i * Math.PI / 12; ring.push([cx + k * Math.cos(a), cz + k * Math.sin(a)]); }
  addCutSurfaceSlab(B, 'ext', ring, [], .046, .05, '#5c6260');
  const [a, b] = loop.planter, ellipse = (da, n = 36) => Array.from({ length: n }, (_, i) => [loop.cx + (a + da) * Math.cos(i * 2 * Math.PI / n), loop.cz + (b + da) * Math.sin(i * 2 * Math.PI / n)]);
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

/** Camera targets for tours and labels. */
export const domeCenter = (f, y0) => ({ x: f.cx, y: y0 + f.spring + f.rise * .6, z: f.cz });
export const featureWorld = (f, u, v) => toW(f.frame, u, v);
