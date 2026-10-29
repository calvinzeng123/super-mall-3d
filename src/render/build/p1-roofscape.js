// Concept A roofscape renderer (tour only): planter beds and café decks, the
// 02 glass pavilion, the 03 timber lattice and the 05 pitched roofs. Table,
// counter and post positions come from the layout records, which are also the
// navigation obstacles.
import * as THREE from 'three';
import { toW } from '../../layout/geom.js';
import { addTrees, planter, roundTable, umbrella } from './props.js';
import { COLORS } from '../theme.js';

const UMBRELLAS = ['#f4efe4', '#e9dcc4', '#cfd8cc', '#f2e6d2'];
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

export const ROOFSCAPE_TYPES = new Set(['planter-bed', 'cafe-cluster', 'glass-pavilion', 'timber-lattice', 'creative-roof']);

/** Roof garden furniture and annex roof structures for one roof level: raised
 * planters with shrubs and small trees, timber decks with two tables each
 * (umbrellas only in the open), the 02 glass pavilion, the 03 timber lattice
 * and the 05 pitched roofs. */
export function buildP1Roofscape(ctx, L, lv) {
  const B = L.batch, y = lv.elev, trees = [];
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
  if (trees.length) addTrees(L.base, ctx.mats, trees, 171);
}

/** Glass box pavilion open to the lawn on its south side; bronze posts and fascia. */
function glassPavilion(B, f, y0) {
  const r = f.rect, h = f.height, top = y0 + h, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  B.get('facadeTimber').box(cx, y0 + .06, cz, w - .2, .12, d - .2, '#c2a27a');
  for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) B.get('extMetal').box(x, y0 + h / 2, z, .24, h, .24, COLORS.bronze);
  // Three glazed sides with mullions every ~1.75 m; the south side stays open.
  B.get('glass').box(cx, y0 + h / 2, r.z0, w, h - .3, .05, '#ffffff');
  for (const x of [r.x0, r.x1]) B.get('glass').box(x, y0 + h / 2, cz, .05, h - .3, d, '#ffffff');
  for (let i = 1, n = Math.round(w / 1.75); i < n; i++) B.get('extMetal').box(r.x0 + w * i / n, y0 + h / 2, r.z0, .07, h, .1, COLORS.bronze);
  for (const x of [r.x0, r.x1]) for (let i = 1, n = Math.round(d / 1.75); i < n; i++) B.get('extMetal').box(x, y0 + h / 2, r.z0 + d * i / n, .1, h, .07, COLORS.bronze);
  // Fascia ring with a glazed roof light and a warm cove line for the night view.
  for (const z of [r.z0, r.z1]) B.get('extMetal').box(cx, top, z, w + 1.2, .42, .5, COLORS.bronze);
  for (const x of [r.x0, r.x1]) B.get('extMetal').box(x, top, cz, .5, .42, d + 1.2, COLORS.bronze);
  B.get('glass').box(cx, top + .1, cz, w - .4, .05, d - .4, '#ffffff');
  B.get('glow').box(cx, top - .26, r.z1 + .2, w, .05, .08, COLORS.warmLight);
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
  for (const z of [r.z0 + .3, r.z1 - .3]) B.get('glowSoft').box(cx, top - .47, z, w - 1, .04, .06, COLORS.warmLight);
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
  for (const z of [r.z0 + .1, r.z1 - .1]) B.get('glow').box((r.x0 + r.x1) / 2, eave - .42, z, r.x1 - r.x0 - 1, .03, .08, COLORS.warmLight);
}
