// 云澜江渲染：水面与河床、南岸防洪墙 + 亲水平台 + 台阶护岸、北岸缓坡 + 芦苇 + 矮路缘、无框玻璃栏杆、
// 滨江铺装与骑行道、树、灯、长椅、江景玻璃眺台、观景亭；星湾桥（双肋系杆拱）与四座城市梁桥。
// 小构件全部进场地批次（已有材质键，不增加绘制调用）；新增网格：水面、河床、缓坡、两种铺装、三组树、芦苇。
import * as THREE from 'three';
import { rect, rectPoly } from '../../layout/geom.js';
import { subtractRect } from '../../layout/urban.js';
import { shapeFromPoly, flatShapeGeometry } from './shell.js';
import { cutSurfaceShapes } from './surface-shapes.js';
import { addTrees, streetLamp, bench } from './props.js';
import { COLORS } from '../theme.js';
import { buildRiverTerrace } from './riverfront.js';

const BED_BOTTOM = -7.4;
const STONE = '#bdb5a5', STONE_LIGHT = '#cfc8b8', STEEL_WHITE = '#eef0f1', GRILLAGE = '#8b949b';
const subtractX = (runs, a, b) => runs.flatMap(([p, q]) => b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([u, v]) => v - u > .1));

/** x-runs of the south bank railing: the whole render width minus every deck and the bank lookout. */
export function riverRailRuns(river) {
  let runs = [[river.render.x0, river.render.x1]];
  for (const r of [...river.bridges.map(b => b.deck), ...river.lookouts.map(l => l.rect)]) runs = subtractX(runs, r.x0, r.x1);
  return runs;
}
/** x-runs of bank works that pass under nothing but water: the render width minus the decks. */
export function riverBankRuns(river) {
  let runs = [[river.render.x0, river.render.x1]];
  for (const b of river.bridges) runs = subtractX(runs, b.deck.x0, b.deck.x1);
  return runs;
}

/** 星湾桥 parabola: springs 0.9 m above the deck at both abutments, crown + rise at mid-span. */
export function archY(b, z) {
  const z0 = b.deck.z0, z1 = b.deck.z1, half = (z1 - z0) / 2, zc = (z0 + z1) / 2;
  return b.deckTop + 0.9 + b.rise * (1 - ((z - zc) / half) ** 2);
}

/** Pure part list of the five bridges, so tests can audit them without three.js meshes.
 * Each part: { bridge, role, key, shape:'box', x,y,z,w,h,d,color } or { shape:'bar', a, b, t, color }. */
export function riverBridgeParts(river) {
  const parts = [];
  const box = (bridge, role, key, x, y, z, w, h, d, color) => parts.push({ bridge, role, key, shape: 'box', x, y, z, w, h, d, color });
  const bar = (bridge, role, key, a, b, t, color) => parts.push({ bridge, role, key, shape: 'bar', a, b, t, color });
  const rail = (id, role, x0, z0, x1, z1, y0, h = 1.2) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.max(.04, x1 - x0), d = Math.max(.04, z1 - z0);
    box(id, role, 'glass', cx, y0 + .05 + h / 2, cz, w, h, d, '#ffffff');
    box(id, `${role}-cap`, 'extMetal', cx, y0 + h + .08, cz, x1 - x0 > .1 ? w : .07, .06, z1 - z0 > .1 ? d : .07, COLORS.steel);
  };
  for (const b of river.bridges) {
    const d = b.deck, cx = (d.x0 + d.x1) / 2, w = d.x1 - d.x0, zc = (d.z0 + d.z1) / 2, len = d.z1 - d.z0, top = b.deckTop;
    if (b.kind === 'tied-arch') {
      const xr = b.ribs.map(r => r.x), half = Math.abs(xr[0]);
      box(b.id, 'deck', 'ext', 0, top - .21, zc, 2 * (half + .8), .4, len, '#cfcac0');
      for (const x of xr) box(b.id, 'tie', 'extMetal', x, top - b.girderDepth / 2, zc, b.ribWidth, b.girderDepth, len, STEEL_WHITE);
      for (let z = d.z0 + 3; z < d.z1; z += 6) box(b.id, 'cross-girder', 'extMetal', 0, top - 1.15, z, 2 * half, .5, .5, '#d8dadb');
      const SEG = 28;
      for (const x of xr) for (let i = 0; i < SEG; i++) {
        const za = d.z0 + len * i / SEG, zb = d.z0 + len * (i + 1) / SEG;
        bar(b.id, 'rib', 'extMetal', { x, y: archY(b, za), z: za }, { x, y: archY(b, zb), z: zb }, 1.6, '#f4f5f5');
        bar(b.id, 'rib-led', 'glow', { x, y: archY(b, za) + .83, z: za }, { x, y: archY(b, zb) + .83, z: zb }, .12, '#bfe8ff');
      }
      // Hangers every 6 m from 7 m inside each abutment; none in the lookout openings.
      const open = z => b.lookouts.some(r => z >= r.z0 - .5 && z <= r.z1 + .5);
      for (const x of xr) for (let z = d.z0 + 7; z < d.z1 - 6; z += b.hangerPitch) if (!open(z))
        bar(b.id, 'hanger', 'extMetal', { x, y: top, z }, { x, y: archY(b, z) - .8, z }, .12, '#d0d4d6');
      for (const dz of [-14, 0, 14]) box(b.id, 'strut', 'extMetal', 0, archY(b, zc + dz), zc + dz, 2 * half, .9, .9, STEEL_WHITE);
      for (const x of [-10.2, 10.2]) box(b.id, 'barrier', 'extMetal', x, top + .45, zc, .3, .9, len, '#9aa0a4');
      // Glass balustrade at the walk edge, open at both lookouts.
      for (const x of [d.x0, d.x1]) {
        let runs = [[d.z0, d.z1]];
        for (const r of b.lookouts.filter(r => Math.abs((x < 0 ? r.x1 : r.x0) - x) < .01)) runs = runs.flatMap(([p, q]) => [[p, r.z0], [r.z1, q]].filter(([u, v]) => v - u > .1));
        for (const [p, q] of runs) {
          rail(b.id, 'balustrade', x, p, x, q, top);
          box(b.id, 'balustrade-led', 'glow', x + (x < 0 ? .1 : -.1), top + .03, (p + q) / 2, .05, .03, q - p, COLORS.led);
        }
      }
      for (const r of b.lookouts) {
        const lx = (r.x0 + r.x1) / 2, lz = (r.z0 + r.z1) / 2, out = r.x0 < 0 ? r.x0 : r.x1;
        box(b.id, 'lookout-glass', 'glass', lx, top - .03, lz, r.x1 - r.x0, .06, r.z1 - r.z0, '#ffffff');
        for (const z of [r.z0 + .12, r.z1 - .12]) box(b.id, 'lookout-frame', 'extMetal', lx, top - .26, z, r.x1 - r.x0, .4, .22, GRILLAGE);
        box(b.id, 'lookout-frame', 'extMetal', out, top - .26, lz, .22, .4, r.z1 - r.z0, GRILLAGE);
        for (let z = r.z0 + 3; z < r.z1 - 1; z += 3) box(b.id, 'lookout-frame', 'extMetal', lx, top - .2, z, r.x1 - r.x0, .26, .08, GRILLAGE);
        rail(b.id, 'lookout-rail', out, r.z0, out, r.z1, top);
        for (const z of [r.z0, r.z1]) rail(b.id, 'lookout-rail', r.x0, z, r.x1, z, top);
        box(b.id, 'lookout-led', 'glow', out + (r.x0 < 0 ? .1 : -.1), top + .03, lz, .05, .03, r.z1 - r.z0, COLORS.led);
      }
      for (const z of [d.z0, d.z1]) {
        const s = z === d.z1 ? 1 : -1;
        box(b.id, 'abutment', 'facadeStone', 0, (BED_BOTTOM + b.soffit) / 2, z - s * 5.5, 2 * half + 4, b.soffit - BED_BOTTOM, 11, STONE);
        for (const x of xr) box(b.id, 'uplight', 'glow', x, top + .06, z - s * 1.2, .5, .1, .5, '#ffe9bf');
        box(b.id, 'nameplate', 'facadeStone', d.x1 - .4, top + .6, z - s * .4, .5, 1.2, .5, '#8b8478');
        box(b.id, 'nameplate', 'facadeStone', d.x0 + .4, top + .6, z - s * .4, .5, 1.2, .5, '#8b8478');
      }
    } else {
      box(b.id, 'girder', 'ext', cx, top - .02 - b.girderDepth / 2, zc, w, b.girderDepth, len, '#cfcac0');
      for (const x of [d.x0 + .2, d.x1 - .2]) box(b.id, 'parapet', 'ext', x, top + .55, zc, .4, 1.1, len, '#d8d3c9');
      const bottom = top - .02 - b.girderDepth;
      for (const z of b.piers) {
        for (const dx of [-w / 4, w / 4]) box(b.id, 'pier', 'ext', cx + dx, (BED_BOTTOM + bottom - 1) / 2, z, 2.4, bottom - 1 - BED_BOTTOM, 2.4, '#bdb6a6');
        box(b.id, 'pier-cap', 'ext', cx, bottom - .5, z, w - 2, 1, 3, '#c5bfb2');
      }
      for (const z of [d.z0, d.z1]) {
        const s = z === d.z1 ? 1 : -1;
        box(b.id, 'abutment', 'facadeStone', cx, (BED_BOTTOM + bottom) / 2, z - s * 5.5, w + 3, bottom - BED_BOTTOM, 11, STONE);
      }
    }
  }
  return parts;
}

function emit(B, p) {
  if (p.shape === 'bar') B.get(p.key).bar(p.a, p.b, p.t, p.color);
  else B.get(p.key).box(p.x, p.y, p.z, p.w, p.h, p.d, p.color);
}

/** Axis-aligned frameless glass railing (curb, pane, stainless cap) from (x0,z0) to (x1,z1). */
export function glassRail(B, x0, z0, x1, z1, y0, { h = 1.1, curb = .3, curbKey = 'facadeStone', led = true } = {}) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const len = Math.hypot(x1 - x0, z1 - z0), sx = t => alongX ? len : t, sz = t => alongX ? t : len;
  if (curb > 0) B.get(curbKey).box(cx, y0 + curb / 2, cz, sx(.3), curb, sz(.3), STONE_LIGHT);
  B.get('glass').box(cx, y0 + curb + (h - curb + .1) / 2, cz, sx(.04), h - curb + .1, sz(.04), '#ffffff');
  B.get('extMetal').box(cx, y0 + h + .13, cz, sx(.07), .06, sz(.07), COLORS.steel);
  if (led && curb > 0) B.get('glow').box(cx, y0 + curb + .02, cz, sx(.05), .03, sz(.05), COLORS.led);
}

/** Bank slope ribbon (grass) from the north kerb down to the bed, one mesh over the render width. */
function slopeGeometry(river) {
  const x0 = river.render.x0, x1 = river.render.x1, N = river.north, W = river.water;
  const rows = [[N.bankTop, -0.32], [W.z0, W.y - 0.05], [W.z0 + 8, BED_BOTTOM + .2]];
  const pos = [], uv = [], idx = [];
  for (const [z, y] of rows) for (const x of [x0, x1]) { pos.push(x, y, z); uv.push(x, -z); }
  for (let r = 0; r < rows.length - 1; r++) { const a = r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Faces must look up (+y); flip the winding if needed.
  if (g.attributes.normal.getY(0) < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + 2 - (i % 3)])); g.computeVertexNormals(); }
  return g;
}

/** Reed clumps at the waterline: one instanced cone mesh, three blades per clump. */
function reeds(river) {
  const list = river.furniture.reeds, N = river.north, W = river.water;
  const geo = new THREE.ConeGeometry(.5, 1, 7).translate(0, .5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length * 3));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
  const yAt = z => N.bankTop === z ? -0.32 : -0.32 + (W.y + .32) * (N.bankTop - z) / (N.bankTop - W.z0);
  let i = 0;
  for (const r of list) for (let k = 0; k < 3; k++) {
    const dx = (k - 1) * .55, dz = (k % 2 ? .35 : -.3), h = (1.5 + .45 * k) * r.s;
    e.set((k - 1) * .12, k * 2.1, (k % 2 ? .1 : -.08));
    m.compose(p.set(r.x + dx, yAt(r.z + dz) - .05, r.z + dz), q.setFromEuler(e), s.set(.5 * r.s, h, .5 * r.s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(k === 1 ? '#a6a35d' : '#7f9450').offsetHSL(0, 0, (r.s - 1) * .08));
    i++;
  }
  mesh.count = i;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = 'river-reeds';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildRiver(ctx) {
  const R = ctx.layout.site?.river;
  if (!R) return null;
  const G = ctx.site.group, B = ctx.site.batch, mats = ctx.mats;
  const S = R.south, N = R.north, W = R.water;
  const meshes = [];
  const add = (geo, mat, name, order = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.receiveShadow = true; m.renderOrder = order;
    G.add(m); meshes.push(m);
    return m;
  };
  // Water sorts below every glass railing and floor (renderOrder 1 vs 2). On a 112 m sheet the park-lake
  // mirror finish shows the room environment's light panels as hard white patches: soften it.
  const water = mats.base.water.clone();
  Object.assign(water, { roughness: .3, metalness: .2, envMapIntensity: .3, opacity: .95 });
  water.color?.set?.(0x245a72);
  add(flatShapeGeometry(shapeFromPoly(W.poly), W.y), water, 'river-water', 1);
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x1f3d46, roughness: .95 });
  add(flatShapeGeometry(shapeFromPoly(rectPoly(rect(R.render.x0, W.z0 + 6, R.render.x1, W.z1 + .5))), W.bed), bedMat, 'river-bed');
  add(slopeGeometry(R), mats.floor('grass', 0.95), 'river-north-slope');

  // South bank: flood wall, 亲水平台, three stone steps, frameless glass railing (7 runs).
  const runs = riverBankRuns(R), railRuns = riverRailRuns(R);
  const stone = B.get('facadeStone');
  const span = ([a, b]) => [(a + b) / 2, b - a];
  for (const r of railRuns) glassRail(B, r[0], S.bankTop - .2, r[1], S.bankTop - .2, -.14);
  const steps = [[S.terrace[0], S.terrace[1] - .6, S.terraceY], [-297.33, S.terrace[0], -3.2], [-298.67, -297.33, -3.9], [S.revetment[0], -298.67, -4.6]];
  for (const r of runs) {
    const [cx, w] = span(r);
    // Flood wall face; its top stays 2 cm under the paving (and under the lookout ring).
    stone.box(cx, (S.terraceY - .2 - .16) / 2, S.bankTop - .3, w, -.16 - (S.terraceY - .2), .6, STONE);
    for (const [z0, z1, y] of steps) stone.box(cx, (BED_BOTTOM + y) / 2, (z0 + z1) / 2, w, y - BED_BOTTOM, z1 - z0, y === S.terraceY ? STONE_LIGHT : '#b3ab9b');
    // North kerb and a low stone toe where the slope meets the water.
    stone.box(cx, -.04, N.bankTop - .2, w, .56, .4, '#bdb6a6');
  }
  const rand = (i) => { const s = Math.sin(i * 91.17 + 3.3) * 1e4; return s - Math.floor(s); };
  for (let i = 0; i < 90; i++) {
    const x = -900 + i * 20 + rand(i) * 12, z = N.slope[0] + 6 + rand(i + 50) * 12;
    if (R.bridges.some(b => x > b.deck.x0 - 3 && x < b.deck.x1 + 3)) continue;
    const y = -0.32 + (W.y + .32) * (N.bankTop - z) / (N.bankTop - W.z0);
    B.get('ext').sphere(x, y + .15, z, .5 + rand(i + 9) * .6, '#9d968a', .35 + rand(i + 3) * .3, .5 + rand(i + 7) * .5, 'ico0');
  }
  const reedMesh = reeds(R);
  G.add(reedMesh); meshes.push(reedMesh);

  // Promenade paving: limestone pavers in front of 一期 (x[-298,-16]), concrete pavers elsewhere.
  const p1 = rect(-298, -300, -16, -260), cityShapes = [], p1Shapes = [];
  const lk = R.lookouts[0];
  for (const p of R.promenades.filter(p => p.kind === 'promenade')) {
    const inner = p.bank === 'S' && p.rect.x1 > p1.x0 && p.rect.x0 < p1.x1;
    if (inner) p1Shapes.push(shapeFromPoly(rectPoly(rect(Math.max(p.rect.x0, p1.x0), p.rect.z0, Math.min(p.rect.x1, p1.x1), p.rect.z1))));
    for (const r of inner ? subtractRect(p.rect, p1) : [p.rect]) cityShapes.push(shapeFromPoly(rectPoly(r)));
  }
  if (lk) p1Shapes.push(...cutSurfaceShapes(rectPoly(lk.rect), [rectPoly(lk.glass)]));
  if (cityShapes.length) add(flatShapeGeometry(cityShapes, -0.14), mats.floor('paving', 0.8), 'river-promenade');
  if (p1Shapes.length) add(flatShapeGeometry(p1Shapes, -0.14), mats.floor('p1-paving', 0.8), 'river-promenade-p1');
  // Red cycle track along the south promenade.
  for (const p of R.promenades.filter(p => p.bank === 'S' && p.kind === 'promenade' && p.rect.z0 <= S.cycle[0] && p.rect.z1 >= S.cycle[1])) {
    const [cx, w] = span([p.rect.x0 + .3, p.rect.x1 - .3]);
    B.get('ext').box(cx, -.128, (S.cycle[0] + S.cycle[1]) / 2, w, .02, S.cycle[1] - S.cycle[0], '#b5553f');
    for (const z of S.cycle) B.get('ext').box(cx, -.126, z, w, .02, .12, '#efe9dc');
  }

  // 江景玻璃眺台 at grade on the 方庭北门 axis: stone ring + glass floor cantilevered over the water.
  if (lk) {
    const r = lk.rect, g = lk.glass;
    for (const q of [rect(r.x0, r.z0, g.x0, r.z1), rect(g.x1, r.z0, r.x1, r.z1), rect(g.x0, g.z1, g.x1, r.z1)])
      stone.box((q.x0 + q.x1) / 2, -.41, (q.z0 + q.z1) / 2, q.x1 - q.x0, .5, q.z1 - q.z0, STONE_LIGHT);
    B.get('glass').box((g.x0 + g.x1) / 2, -.17, (g.z0 + g.z1) / 2, g.x1 - g.x0, .06, g.z1 - g.z0, '#ffffff');
    for (let x = g.x0 + 3; x < g.x1 - 1; x += 3) B.get('extMetal').box(x, -.36, (g.z0 + g.z1) / 2, .08, .3, g.z1 - g.z0, GRILLAGE);
    B.get('extMetal').box((g.x0 + g.x1) / 2, -.38, g.z0 + .12, g.x1 - g.x0, .36, .24, GRILLAGE);
    glassRail(B, r.x0, r.z0 + .1, r.x1, r.z0 + .1, -.14, { h: 1.2 });
    for (const x of [r.x0 + .1, r.x1 - .1]) glassRail(B, x, r.z0, x, r.z1, -.14, { h: 1.2 });
    for (const x of [g.x0 + 3, (g.x0 + g.x1) / 2, g.x1 - 3]) bench(B, x, -.14, g.z1 + 1.6, Math.PI);
  }
  // 观景亭 on the north greenway: four columns (nav obstacles) under a timber roof.
  const pv = R.pavilion;
  if (pv) {
    const r = pv.rect, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    stone.box(cx, -.09, cz, r.x1 - r.x0, .1, r.z1 - r.z0, STONE_LIGHT);
    for (const [x, z] of pv.columns) B.get('facadeTimber').box(x, 1.66, z, .4, 3.6, .4, '#8a6a48');
    B.get('facadeTimber').box(cx, 3.6, cz, r.x1 - r.x0 + 1.2, .28, r.z1 - r.z0 + 1.2, '#7a5a3a');
    B.get('extMetal').box(cx, 3.82, cz, r.x1 - r.x0 + 1.4, .12, r.z1 - r.z0 + 1.4, '#3f4448');
    for (const dx of [-6, 0, 6]) bench(B, cx + dx, -.14, cz + .6, 0);
  }

  // Street trees, lamps and benches (computed in the layout; none of them block people).
  const trees = addTrees(G, mats, R.furniture.trees, 31);
  if (trees) meshes.push(trees.trunks, trees.crowns, trees.crownsC);
  for (const l of R.furniture.lamps) streetLamp(B, l.x, l.z, l.y, l.dir, l.h);
  for (const b of R.furniture.benches) bench(B, b.x, b.y, b.z, b.ry);

  for (const p of riverBridgeParts(R)) emit(B, p);
  buildRiverTerrace(ctx);
  return { meshes };
}
