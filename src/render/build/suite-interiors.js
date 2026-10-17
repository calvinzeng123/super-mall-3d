// Additions around the surveyed user suite. The imported suite keeps its own
// furniture and material resources; this builder owns only its batched geometry.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BatchSet } from '../batch.js';
import { toW } from '../../layout/geom.js';

const C = {
  oak: '#f2e7d5', cream: '#eee6d9', linen: '#e9e2d2', stone: '#faf7ef',
  bronze: '#897252', dark: '#403c33', olive: '#8e9d77', glow: '#ffe1ae',
};
const UP = new THREE.Vector3(0, 1, 0);
const ROT = new THREE.Quaternion();
const POS = new THREE.Vector3();
const SCALE = new THREE.Vector3();
const MATRIX = new THREE.Matrix4();
const ROUNDED = (() => {
  const geometry = new RoundedBoxGeometry(1, 1, 1, 2, .12);
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const result = { pos: g.attributes.position.array, nor: g.attributes.normal.array, uv: g.attributes.uv.array, count: g.attributes.position.count };
  g.dispose();
  if (g !== geometry) geometry.dispose();
  return result;
})();

/** The level caller supplies exploded-floor transforms, never this function. */
export function buildSuiteAdditions(ctx, lv, units = lv.units, asset = null) {
  const group = new THREE.Group(); group.name = `suite-additions-${lv.id}`;
  const lowerGroup = new THREE.Group(); lowerGroup.name = 'suite-lower-additions';
  const upperGroup = new THREE.Group(); upperGroup.name = 'suite-mezzanine';
  const ceilingGroup = new THREE.Group(); ceilingGroup.name = 'suite-addition-ceilings';
  group.add(lowerGroup, upperGroup, ceilingGroup);
  const lower = new BatchSet(ctx.mats.base);
  const upper = new BatchSet(ctx.mats.base);
  const ceilings = new BatchSet(ctx.mats.base);
  const metadata = { units: [], upperBeds: [], lights: [], steps: 0, sourceAsset: Boolean(asset) };
  const height = Math.max(2.72, (lv.height || 3.4) - .30);

  for (const u of units) {
    if (!u.residence?.suitePlan) continue;
    const duplex = u.residence.duplex;
    const apartment = u.residence.kind === 'apartment';
    const info = { unit: u.id, obstacles: [], upperObstacles: [] };
    metadata.units.push(info);
    lower.frame(u.frame, () => {
      const T = localTools(lower, lv.elev);
      // These three patches follow the suite's stepped footprint. The side
      // connection stays at one level with the original entry, without a sill.
      T.box('wood', 8.47, 1.2375, .018, 4.74, 2.325, .03, C.oak);
      T.box('wood', 9.035, 6.45, .018, 3.67, 8.10, .03, C.oak);
      T.box('stone', 6.085, 12.65, .024, 9.57, 4.30, .04, C.stone);
      // Separate neighbouring suites all the way to the terrace. A1F upper
      // wall sections are grouped with the mezzanine for downstairs cutaway.
      const wallTop = duplex ? duplex.height : height;
      wingWalls(T, .03, wallTop);
      for (const z of [2.5, 5.5, 8.8]) {
        T.box('wood', 10.775, z, 1.34, .038, .7, 2.56, C.oak);
        for (let slat = 0; slat < 6; slat++) T.box('wood', 10.745, z - .30 + slat * .12, 1.34, .035, .040, 2.5, '#e2d3bd');
      }
      // Door reveal joins the edited source shell to the new circulation wing.
      for (const z of [.13, 1.17]) T.box('wood', 6.19, z, 1.115, .16, .048, 2.23, C.oak);
      T.box('wood', 6.19, .65, 2.235, .16, 1.09, .05, C.oak);
      T.box('glowSoft', 6.29, .65, 2.19, .022, .83, .025, C.glow);

      if (apartment) {
        const startZ = duplex ? 7.12 : 2.48;
        const length = duplex ? 3.16 : 3.56;
        kitchen(T, startZ, length);
        info.obstacles.push({ id: 'wing-kitchen', rect: { x0: 10.02, x1: 10.80, z0: startZ, z1: startZ + length } });
        if (duplex) {
          laundry(T, 7.67, 8.70, Math.PI);
          info.obstacles.push({ id: 'wing-laundry', rect: { x0: 7.31, x1: 8.03, z0: 8.33, z1: 9.07 } });
        } else {
          laundry(T, 10.40, 8.15, 0);
          wardrobe(T, 10.42, 9.58, 1.45, 2.54, 0);
          info.obstacles.push({ id: 'wing-laundry', rect: { x0: 10.03, x1: 10.78, z0: 7.78, z1: 8.52 } });
          info.obstacles.push({ id: 'wing-wardrobe', rect: { x0: 10.08, x1: 10.78, z0: 8.855, z1: 10.305 } });
        }
      } else {
        // Hotel extension uses fitted tea service and luggage storage, avoiding
        // a second bedroom or bathroom that would contradict the supplied suite.
        if (duplex) {
          hospitalityPantry(T, 8.2);
          luggageBench(T, 7.67, 8.8);
          info.obstacles.push({ id: 'wing-pantry', rect: { x0: 10.02, x1: 10.8, z0: 7.13, z1: 9.27 } },
            { id: 'wing-luggage', rect: { x0: 7.30, x1: 8.04, z0: 8.08, z1: 9.52 } });
        } else {
          hospitalityPantry(T, 3.3);
          wardrobe(T, 10.42, 6.55, 2.4, 2.54, 0);
          luggageBench(T, 10.40, 8.90);
          info.obstacles.push({ id: 'wing-pantry', rect: { x0: 10.02, x1: 10.8, z0: 2.23, z1: 4.37 } });
          info.obstacles.push({ id: 'wing-wardrobe', rect: { x0: 10.08, x1: 10.78, z0: 5.35, z1: 7.75 } });
          info.obstacles.push({ id: 'wing-luggage', rect: { x0: 10.03, x1: 10.77, z0: 8.18, z1: 9.62 } });
        }
      }
      terrace(T);
      info.obstacles.push({ id: 'terrace-sofa', rect: { x0: 2.40, x1: 4.80, z0: 12.84, z1: 13.93 } });
      info.obstacles.push({ id: 'terrace-table', rect: { x0: 5.22, x1: 6.34, z0: 12.84, z1: 13.96 } });
      info.obstacles.push({ id: 'terrace-planter-west', rect: { x0: 1.49, x1: 2.03, z0: 13.78, z1: 14.32 } });
      info.obstacles.push({ id: 'terrace-planter-east', rect: { x0: 9.93, x1: 10.41, z0: 13.74, z1: 14.22 } });

      if (duplex) {
        stair(T, duplex.stair);
        metadata.steps += duplex.stair.steps;
      }
    });

    if (duplex) upper.frame(u.frame, () => {
      const T = localTools(upper, lv.elev);
      const r = duplex.surface.rect, h = duplex.height;
      T.box('matte', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, h - .115, r.x1 - r.x0, r.z1 - r.z0, .23, C.cream);
      T.box('wood', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, h + .013, r.x1 - r.x0 - .035, r.z1 - r.z0 - .035, .025, C.oak);
      // The front edge stops exactly at the staircase opening, including the
      // handrail: walking onto the upper landing never passes through a bar.
      for (const edge of duplex.surface.railings) rail(T, edge, h);
      wingWalls(T, h + .02, height);
      const U = localTools(upper, lv.elev + h);
      study(U, duplex.desk.rect);
      wardrobe(U, 1.67, 8.22, 2.15, 2.38, Math.PI);
      // Low bookcase divides the upper reading corner without blocking views.
      shelf(U, 6.24, 10.1, 1.8, 1.10);
      info.upperObstacles.push({ id: 'upper-wardrobe', rect: { x0: 1.31, x1: 2.03, z0: 7.145, z1: 9.295 } });
      info.upperObstacles.push({ id: 'upper-bookcase', rect: { x0: 6.04, x1: 6.44, z0: 9.2, z1: 11.0 } });
      const deskX = (duplex.desk.rect.x0 + duplex.desk.rect.x1) / 2, chairZ = duplex.desk.rect.z0 - .53;
      info.upperObstacles.push({ id: 'upper-chair', rect: { x0: deskX - .30, x1: deskX + .30, z0: chairZ - .285, z1: chairZ + .285 } });
      for (const bed of duplex.beds) metadata.upperBeds.push({ unit: u.id, frame: u.frame, height: lv.elev + h, ...bed });
    });

    ceilings.frame(u.frame, () => {
      const T = localTools(ceilings, lv.elev);
      const ceiling = duplex ? height : 2.70;
      T.box('matte', 8.47, 1.2375, ceiling, 4.74, 2.325, .12, C.cream);
      if (duplex) {
        T.box('matte', 9.035, 4.40, ceiling, 3.67, 4.0, .12, C.cream);
        T.box('matte', 6.05, 10.60, ceiling, 9.5, 8.4, .12, C.cream);
      } else {
        // Keep the wing soffit beyond the source exterior wall; coincident
        // faces at x7.20 otherwise flicker along the living-room cove.
        T.box('matte', 9.1125, 6.45, ceiling, 3.515, 8.10, .12, C.cream);
        T.box('matte', 6.085, 12.65, ceiling, 9.57, 4.30, .12, C.cream);
      }
      // Cove, concealed strips, and small downlight lenses match the original
      // warm suite language; actual lights are owned by the parent renderer.
      cove(T, { x0: 7.45, x1: 10.58, z0: 1.48, z1: 10.24 }, ceiling);
      cove(T, { x0: 1.55, x1: 10.58, z0: 10.74, z1: 14.55 }, ceiling);
      for (const z of [2.2, 4.8, 7.7, 9.7]) downlight(T, 9.00, z, ceiling);
      for (const x of [2.45, 5.4, 9.1]) downlight(T, x, 12.15, ceiling);
      if (duplex) {
        // Under the real upper floor, these lenses sit clear of the original
        // source ceiling and illuminate the rear garden-room extension.
        for (const x of [2.45, 5.4, 9.1]) downlight(T, x, 12.15, duplex.height - .235);
      }
    });
    for (const [x, y, z, power] of [[8.8, duplex ? 2.65 : 2.45, 3.3, 1], [8.9, 2.45, 8.55, 1], [5.3, 2.45, 12.5, .8]]) {
      const p = toW(u.frame, x, z);
      metadata.lights.push({ unit: u.id, position: [p[0], lv.elev + y, p[1]], power, color: '#ffe8c6' });
    }
    if (duplex) {
      const p = toW(u.frame, 5.4, 11.3);
      metadata.lights.push({ unit: u.id, position: [p[0], lv.elev + height - .2, p[1]], power: 1.2, color: '#ffe8c6' });
    }
  }
  lower.flush(lowerGroup); upper.flush(upperGroup); ceilings.flush(ceilingGroup);
  // Snapshot ownership now: the caller may attach imported upper-bedroom
  // clones later, and their shared source geometries must survive this unload.
  const ownedGeometries = new Set();
  group.traverse(o => { if (o.isMesh) ownedGeometries.add(o.geometry); });
  let disposed = false;
  return { group, lowerGroup, upperGroup, ceilingGroup, metadata,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of ownedGeometries) geometry.dispose();
      ownedGeometries.clear();
      group.clear();
    },
  };
}

function localTools(B, baseY) {
  const box = (key, x, z, y, w, d, h, color = C.cream, angle = 0) => B.get(key).box(x, baseY + y, z, w, h, d, color, angle);
  const cylinder = (key, x, z, y, r, h, color = C.cream, segments = 16) => B.get(key).cyl(x, baseY + y, z, r, h, color, segments);
  const line = (key, a, b, thick, color = C.bronze) => B.get(key).bar({ x: a[0], y: baseY + a[1], z: a[2] }, { x: b[0], y: baseY + b[1], z: b[2] }, thick, color);
  const round = (key, x, z, y, w, d, h, color = C.cream, angle = 0) => {
    POS.set(x, baseY + y, z); SCALE.set(w, h, d); ROT.setFromAxisAngle(UP, angle);
    MATRIX.compose(POS, ROT, SCALE); B.get(key).push(ROUNDED, MATRIX, color);
  };
  const sphere = (key, x, z, y, rx, ry, rz, color) => B.get(key).sphere(x, baseY + y, z, rx, color, ry, rz, 'sphereLo');
  const ring = (key, x, z, y, radius, color, angle = Math.PI / 2) => {
    POS.set(x, baseY + y, z); SCALE.set(radius * 2, radius * 2, radius * 2); ROT.setFromAxisAngle(UP, angle);
    B.get(key).shape('torus', POS, ROT, SCALE, color);
  };
  return { B, box, cylinder, line, round, sphere, ring };
}

function wingWalls(T, bottom, top) {
  if (top <= bottom) return;
  const mid = (bottom + top) / 2, h = top - bottom;
  T.box('matte', 10.91, 7.44, mid, .14, 14.76, h, C.cream);
  T.box('matte', 8.485, .065, mid, 4.77, .13, h, C.cream);
  T.box('matte', .07, 7.44, mid, .14, 14.76, h, C.cream);
  T.box('matte', 2.475, .065, mid, 4.67, .13, h, C.cream);
  // The inaccessible strip beside the unchanged source is a service cavity;
  // seal its rear edge so it cannot appear to be a second bedroom entrance.
  T.box('matte', .755, 10.45, mid, 1.23, .14, h, C.cream);
  T.box('wood', 10.824, 7.46, bottom + .045, .032, 14.68, .09, '#d9cbb7');
  T.box('wood', 8.49, .148, bottom + .045, 4.68, .032, .09, '#d9cbb7');
}

function kitchen(T, start, length) {
  const x = 10.42, mid = start + length / 2, sinkZ = start + .66;
  // Recessed toe-kick, a framed carcass and separate doors prevent the kitchen
  // reading as a single rectangular prop, even from the room entrance.
  T.box('matte', x + .03, mid, .105, .60, length - .10, .18, C.dark);
  T.box('wood', x, mid, .485, .72, length, .68, C.oak);
  const doors = Math.ceil(length / .58), module = length / doors;
  for (let i = 0; i < doors; i++) {
    const z = start + module * (i + .5);
    T.box('wood', x - .374, z, .476, .035, module - .017, .637, i % 2 ? '#f0e6d4' : C.oak);
    T.box('metal', x - .398, z, .778, .018, module - .12, .013, C.bronze);
  }
  // Countertop is split around the sink opening, exposing a real basin rim.
  const cut0 = sinkZ - .255, cut1 = sinkZ + .255;
  T.box('stone', x, (start + cut0) / 2, .856, .77, cut0 - start, .06, C.stone);
  T.box('stone', x, (cut1 + start + length) / 2, .856, .77, start + length - cut1, .06, C.stone);
  for (const sx of [x - .315, x + .315]) T.box('stone', sx, sinkZ, .856, .14, .51, .06, C.stone);
  T.box('metal', x, sinkZ, .73, .47, .48, .018, '#888c85');
  for (const sx of [x - .235, x + .235]) T.box('metal', sx, sinkZ, .795, .018, .48, .13, '#adb0a4');
  for (const sz of [cut0 + .02, cut1 - .02]) T.box('metal', x, sz, .795, .47, .018, .13, '#adb0a4');
  T.line('metal', [10.70, .86, sinkZ], [10.70, 1.145, sinkZ], .033, C.bronze);
  T.line('metal', [10.70, 1.145, sinkZ], [10.44, 1.145, sinkZ], .033, C.bronze);
  T.line('metal', [10.44, 1.145, sinkZ], [10.44, 1.08, sinkZ], .033, C.bronze);
  const cookZ = start + length - .65;
  T.round('satin', x - .01, cookZ, .893, .57, .59, .014, '#252c2a');
  for (const dz of [-.155, .155]) {
    T.cylinder('metal', x, cookZ + dz, .902, .11, .005, '#65645c', 20);
    T.cylinder('satin', x, cookZ + dz, .908, .082, .004, '#323835', 20);
  }
  T.box('stone', 10.798, mid, 1.31, .025, length, .82, C.stone);
  T.box('wood', 10.59, mid, 1.985, .40, length, .52, C.oak);
  for (let i = 0; i < doors; i++) T.box('wood', 10.377, start + module * (i + .5), 1.985, .025, module - .022, .48, C.oak);
  T.box('glowSoft', 10.435, mid, 1.712, .028, length - .08, .016, C.glow);
  T.box('metal', 10.54, cookZ, 1.686, .45, .69, .055, '#b6b4a7');
  T.box('wood', 10.43, start + length * .52, .908, .48, .29, .035, '#d3c5a9');
  T.cylinder('satin', 10.57, start + length * .48, .927, .071, .20, '#cdc5b2');
  for (const dz of [-.025, .035]) T.line('wood', [10.57, 1.03, start + length * .48 + dz], [10.57, 1.24, start + length * .48 + dz], .015, '#d8bc8d');
}

function laundry(T, x, z, angle) {
  const face = angle ? 1 : -1;
  T.box('wood', x, z, 1.01, .72, .75, 1.96, C.oak);
  for (const y of [.50, 1.38]) {
    T.round('satin', x + face * .018, z, y, .65, .65, .80, '#f0eee5');
    T.box('satin', x + face * .342, z, y + .278, .021, .57, .14, '#d7d9d1');
    T.box('matte', x + face * .357, z - .115, y + .278, .016, .18, .066, '#354841');
    T.sphere('metal', x + face * .364, z + .15, y + .28, .020, .043, .043, '#babeb5');
    T.ring('metal', x + face * .355, z, y - .032, .234, '#9faaa5');
    T.sphere('satin', x + face * .354, z, y - .032, .019, .203, .203, '#384b4a');
    T.sphere('glass', x + face * .379, z, y - .032, .016, .184, .184, '#7faaa9');
  }
  T.box('wood', x, z, 1.936, .72, .75, .06, C.oak);
  for (let k = 0; k < 3; k++) T.round('matte', x, z + .14, 2.007 + k * .055, .49, .30, .055, k % 2 ? '#bcb59f' : '#efeadc');
}

function wardrobe(T, x, z, length, height, angle) {
  const face = angle ? 1 : -1;
  T.box('wood', x, z, height / 2 + .035, .66, length, height, C.oak);
  const n = Math.ceil(length / .6), span = length / n;
  for (let k = 0; k < n; k++) {
    const p = z - length / 2 + span * (k + .5);
    T.box('wood', x + face * .346, p, height / 2 + .035, .032, span - .012, height - .045, '#eee1cc');
    T.line('metal', [x + face * .371, .87, p + span * .30], [x + face * .371, 1.29, p + span * .30], .018, C.bronze);
  }
  T.box('matte', x + face * .350, z, .064, .016, length - .07, .085, '#97836b');
}

function hospitalityPantry(T, z) {
  T.box('wood', 10.42, z, .47, .74, 2.14, .86, C.oak);
  for (const dz of [-.71, 0, .71]) T.box('wood', 10.028, z + dz, .46, .035, .69, .81, C.oak);
  T.box('stone', 10.41, z, .93, .79, 2.20, .062, C.stone);
  T.round('satin', 10.44, z - .63, 1.18, .39, .35, .43, '#373e39');
  T.box('metal', 10.22, z - .63, 1.12, .045, .25, .13, '#aea894');
  T.box('metal', 10.18, z - .63, .973, .11, .29, .018, C.bronze);
  for (const dz of [.32, .59]) {
    T.cylinder('satin', 10.36, z + dz, .972, .095, .012, C.stone);
    T.cylinder('satin', 10.36, z + dz, .988, .058, .103, C.stone);
    T.ring('satin', 10.43, z + dz, 1.044, .037, C.stone, 0);
  }
  T.box('wood', 10.60, z, 1.80, .34, 2.14, .06, C.oak);
  T.box('glowSoft', 10.46, z, 1.761, .026, 1.92, .018, C.glow);
  for (const dz of [-.65, -.4, -.15]) T.cylinder('satin', 10.58, z + dz, 1.83, .055, .23, '#d9d3b3');
}

function luggageBench(T, x, z) {
  T.box('wood', x, z, .24, .72, 1.42, .36, C.oak);
  for (let k = 0; k < 8; k++) T.box('wood', x, z - .63 + k * .18, .45, .76, .085, .055, '#d3c4aa');
  T.round('matte', x, z + .15, .74, .42, .55, .49, '#6d786b');
  T.line('metal', [x, .99, z + .01], [x, 1.08, z + .01], .021, C.bronze);
  T.line('metal', [x, 1.08, z + .01], [x, 1.08, z + .29], .021, C.bronze);
  T.line('metal', [x, 1.08, z + .29], [x, .99, z + .29], .021, C.bronze);
}

function terrace(T) {
  // Low lounge forms leave both the source window and the east-side path open.
  T.round('matte', 3.60, 13.40, .32, 2.30, 1.02, .36, '#dbd5c5');
  T.round('matte', 3.60, 13.79, .64, 2.35, .25, .64, C.linen);
  for (const x of [2.48, 4.72]) T.round('matte', x, 13.38, .59, .20, 1.03, .48, C.linen);
  for (const x of [3.08, 4.10]) T.round('matte', x, 13.30, .54, .97, .83, .20, '#f1eada');
  T.round('matte', 2.90, 13.62, .79, .48, .22, .42, C.olive, -.11);
  T.round('matte', 4.27, 13.62, .79, .43, .24, .43, '#bfb195', .13);
  for (const x of [2.65, 4.55]) for (const z of [13.06, 13.71]) T.cylinder('metal', x, z, .035, .025, .16, C.bronze, 8);
  T.cylinder('stone', 5.78, 13.40, .52, .55, .065, C.stone, 24);
  T.cylinder('metal', 5.78, 13.40, .055, .21, .466, C.bronze, 16);
  T.cylinder('metal', 5.78, 13.40, .035, .36, .025, '#82785e', 20);
  T.box('matte', 5.61, 13.44, .61, .30, .40, .035, '#8c9477', .15);
  T.cylinder('satin', 5.94, 13.30, .589, .067, .108, '#ddd4bf');
  for (const [x, z, size] of [[1.76, 14.05, 1], [10.17, 13.98, .9]]) plant(T, x, z, size);
  // Side screen joins the room divider to the exterior bay, below eye height.
  T.box('wood', 1.355, 12.73, .49, .075, 3.82, .91, C.oak);
  for (let k = 0; k < 18; k++) T.box('wood', 1.307, 10.98 + k * .20, .62, .035, .035, 1.17, '#d6c6ae');
}

function plant(T, x, z, size) {
  T.cylinder('stone', x, z, .025, .26 * size, .45 * size, '#d4ccbb', 16);
  T.cylinder('matte', x, z, .464 * size, .23 * size, .013, '#534c36');
  for (let k = 0; k < 7; k++) {
    const a = k * 2.399, lx = x + Math.cos(a) * .25 * size, lz = z + Math.sin(a) * .25 * size;
    const y = (.73 + k % 3 * .16) * size;
    T.line('wood', [x, .40 * size, z], [lx, y, lz], .012 * size, '#8d8053');
    T.sphere('foliage', lx, lz, y, .18 * size, .095 * size, .27 * size, k % 2 ? '#80946a' : '#9dab81');
  }
}

function stair(T, s) {
  const dx = s.top[0] - s.bottom[0], dz = s.top[1] - s.bottom[1], run = Math.hypot(dx, dz);
  const ux = dx / run, uz = dz / run, nx = uz, nz = -ux;
  const angle = Math.atan2(-uz, ux) + Math.PI / 2;
  const depth = run / s.steps;
  for (let k = 0; k < s.steps; k++) {
    const t = (k + .5) / s.steps, y = (k + 1) / s.steps * s.rise;
    const x = s.bottom[0] + dx * t, z = s.bottom[1] + dz * t;
    T.box('wood', x, z, y - .045, s.width, depth + .012, .09, C.oak, angle);
    // Closed, warm-white risers and bronze nosing read as a real stair flight.
    T.box('matte', x - ux * depth * .48, z - uz * depth * .48, y - s.rise / s.steps / 2, s.width - .04, .025, s.rise / s.steps, C.cream, angle);
    T.box('metal', x - ux * depth * .44, z - uz * depth * .44, y + .002, s.width - .055, .02, .006, C.bronze, angle);
    if (k % 3 === 1) T.box('glowSoft', x - ux * depth * .49, z - uz * depth * .49, y - .055, .23, .012, .022, C.glow, angle);
  }
  for (const sign of [-1, 1]) {
    const off = sign * (s.width / 2 - .035);
    const a = [s.bottom[0] + nx * off, s.rise / s.steps - .08, s.bottom[1] + nz * off];
    const b = [s.top[0] + nx * off, s.rise - .08, s.top[1] + nz * off];
    T.line('metal', a, b, .075, '#978367');
    T.line('wood', [a[0], a[1] + 1.02, a[2]], [b[0], b[1] + 1.02, b[2]], .045, C.oak);
    for (let k = 0; k <= 9; k++) {
      const t = k / 9, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, y = a[1] + (b[1] - a[1]) * t;
      T.line('metal', [x, y, z], [x, y + .98, z], .022, C.bronze);
    }
  }
}

function rail(T, edge, y) {
  const [a, b] = [edge.a, edge.b];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  const spans = edge.door ? [[0, edge.door.at - edge.door.width / 2], [edge.door.at + edge.door.width / 2, len]] : [[0, len]];
  for (const [start, end] of spans) {
    const p = t => [a[0] + ux * t, a[1] + uz * t];
    const s = p(start), e = p(end);
    T.line('wood', [s[0], y + 1.04, s[1]], [e[0], y + 1.04, e[1]], .045, C.oak);
    T.line('metal', [s[0], y + .075, s[1]], [e[0], y + .075, e[1]], .028, C.bronze);
    const n = Math.max(1, Math.ceil((end - start) / .14));
    for (let k = 0; k <= n; k++) {
      const v = p(start + (end - start) * k / n);
      T.line('metal', [v[0], y + .065, v[1]], [v[0], y + 1.02, v[1]], .018, C.bronze);
    }
  }
}

function study(T, r) {
  const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
  T.round('wood', x, z, .758, r.x1 - r.x0, r.z1 - r.z0, .065, C.oak);
  for (const sx of [r.x0 + .1, r.x1 - .1]) for (const sz of [r.z0 + .065, r.z1 - .065]) T.line('metal', [sx, .03, sz], [sx, .74, sz], .025, C.bronze);
  T.box('wood', r.x0 + .31, z, .46, .50, .52, .47, C.oak);
  for (const h of [.36, .58]) T.box('metal', r.x0 + .31, r.z0 - .004, h, .28, .018, .015, C.bronze);
  T.round('satin', x + .14, z - .04, .805, .54, .35, .025, '#80867b');
  T.box('matte', x + .14, z + .1, 1.006, .53, .025, .38, '#414a42');
  T.box('satin', x + .14, z + .082, 1.01, .47, .005, .31, '#93a29a');
  T.cylinder('metal', r.x1 - .28, z + .04, .792, .12, .019, C.bronze);
  T.line('metal', [r.x1 - .28, .8, z + .04], [r.x1 - .28, 1.17, z + .04], .018, C.bronze);
  T.round('metal', r.x1 - .28, z, 1.20, .27, .16, .055, C.bronze);
  T.box('glowSoft', r.x1 - .28, z - .005, 1.168, .22, .12, .008, C.glow);
  const cz = r.z0 - .53;
  T.round('matte', x, cz, .48, .58, .54, .12, C.olive);
  T.round('matte', x, cz - .23, .76, .59, .095, .48, C.olive);
  for (const sx of [-.22, .22]) for (const sz of [-.19, .19]) T.line('metal', [x + sx * 1.1, .035, cz + sz * 1.1], [x + sx, .43, cz + sz], .026, C.bronze);
}

function shelf(T, x, z, length, height) {
  for (const h of [.08, .56, height]) T.box('wood', x, z, h, .4, length, .05, C.oak);
  for (const dz of [-length / 2 + .022, 0, length / 2 - .022]) T.box('wood', x, z + dz, height / 2, .4, .04, height, C.oak);
  for (let k = 0; k < 8; k++) T.box('matte', x, z - length * .35 + k * .085, .30, .30, .055, .36 + k % 3 * .035, [C.olive, '#c5b18e', '#d8d1bf'][k % 3]);
  T.cylinder('satin', x, z + .50, height + .029, .11, .22, '#c2b9a1');
}

function cove(T, r, y) {
  for (const x of [r.x0, r.x1]) {
    T.box('matte', x, (r.z0 + r.z1) / 2, y - .095, .10, r.z1 - r.z0, .10, C.cream);
    T.box('glowSoft', x + (x === r.x0 ? .055 : -.055), (r.z0 + r.z1) / 2, y - .045, .022, r.z1 - r.z0 - .08, .016, C.glow);
  }
  for (const z of [r.z0, r.z1]) {
    T.box('matte', (r.x0 + r.x1) / 2, z, y - .095, r.x1 - r.x0, .10, .10, C.cream);
    T.box('glowSoft', (r.x0 + r.x1) / 2, z + (z === r.z0 ? .055 : -.055), y - .045, r.x1 - r.x0 - .08, .022, .016, C.glow);
  }
}

function downlight(T, x, z, y) {
  T.cylinder('metal', x, z, y - .074, .061, .012, C.bronze, 12);
  T.cylinder('glow', x, z, y - .080, .047, .01, C.glow, 12);
}
