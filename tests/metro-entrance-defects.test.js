// Metro entrance defects (2026-11-04 audit metro-1..8, 10, 11, 14): geometry that is drawn
// but walk-through, walkable space capped by geometry, and see-through gaps to sky or void.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, lvl } from './helpers.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { toW, toL, rect, lrectPoly, pointInPoly, polyBounds } from '../src/layout/geom.js';
import { BatchSet, SignBatch } from '../src/render/batch.js';
import { buildMetro } from '../src/render/build/metro.js';
import { buildPublic } from '../src/render/build/public.js';

const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };

const M = L.buildings.find(b => b.id === 'M'), nav = buildNav(L), y0 = lvl('M-B1').elev;
const exits = M.exits, old = M.passages.filter(p => !p.extension);
const stairY = u => y0 + (-y0 * u) / 9.5;

// Metro render: `solid` = always-visible base/shell batches, `ceiling` = the camera-height-gated ceiling group.
const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) });
const levels = Object.fromEntries(L.levels.map(lv => [lv.id, { lv, batch: new BatchSet(materials), shellBatch: new BatchSet(materials),
  base: new THREE.Group(), shell: new THREE.Group(), group: new THREE.Group() }]));
buildMetro({ layout: L, levels, bById: Object.fromEntries(L.buildings.map(b => [b.id, b])), lvById: Object.fromEntries(L.levels.map(l => [l.id, l])),
  renderer: {}, dynamic: [], mats: { base: materials, screen: () => materials.screen, steps: { up: materials.steps } } });
const solid = [], ceiling = [];
for (const v of Object.values(levels)) {
  v.batch.flush(v.base); v.shellBatch.flush(v.shell); v.group.add(v.base, v.shell); v.group.updateMatrixWorld(true);
  const trains = new Set(); v.group.traverse(o => { if (o.name?.startsWith('M-train-')) o.traverse(q => trains.add(q)); });
  for (const g of [v.base, v.shell]) g.traverse(o => { if (o.isMesh && !trains.has(o)) solid.push(o); });
  for (const g of v.group.children.filter(g => g !== v.base && g !== v.shell)) g.traverse(o => { if (o.isMesh) ceiling.push(o); });
}
const ray = new THREE.Raycaster();
const cast = (meshes, o, d, far) => {
  ray.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize()); ray.near = 0; ray.far = far;
  return ray.intersectObjects(meshes, false)[0] || null;
};
const walk = (floor, a, b, audit = () => {}) => {
  let s = { floor, x: a[0], z: a[1], y: nav.floors.get(floor).y, slope: null };
  assert.ok(clear(nav, s), `${floor} ${a} not standable`);
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05);
  for (let i = 0; i < n; i++) { s = step(nav, s, (b[0] - a[0]) / n, (b[1] - a[1]) / n, 0); audit(s); }
  return s;
};

test('metro-1: the line maps hang on solid wall, not inside the widened PA–PD passage mouths', () => {
  for (const p of old) {
    const sg = Math.sign(p.F.s * p.F.c), mouth = (p.lpoly[0][0] + p.lpoly[3][0]) / 2;
    for (let v = -3; v <= 3; v += 0.75) for (const h of [0.5, 1.2, 1.6, 2.0, 2.3]) {
      const [x, z] = toW(p.F, mouth - sg * v - 1.5, v);
      const hit = cast(solid, [x, y0 + h, z], [p.F.c, 0, p.F.s], 4.5);
      assert.ok(!hit, `${p.id} mouth blocked at v=${v} h=${h} (${hit && hit.point.toArray().map(q => q.toFixed(2))})`);
    }
  }
});

test('metro-2: every concourse column is drawn from the layout record and blocks walking', () => {
  const cols = (lvl('M-B1').navObstacles || []).filter(o => o.column);
  assert.equal(cols.length, 14);
  for (const { column: c } of cols) {
    let closest = Infinity;
    walk('M-B1', [c.x - 2, c.z], [c.x + 2, c.z], s => { closest = Math.min(closest, Math.hypot(s.x - c.x, s.z - c.z)); });
    assert.ok(closest >= c.base + 0.25, `walked through column ${c.x},${c.z} (${closest.toFixed(2)})`);
    const hit = cast(solid, [c.x - 1.5, y0 + 1.6, c.z], [1, 0, 0], 1.5);
    assert.ok(hit && Math.abs(hit.distance - (1.5 - c.r)) < 0.03, `column ${c.x},${c.z} not drawn at its collision record`);
  }
});

test('metro-3: the A and C shaft heads inside the widened concourse are closed walls, not a walk-in pocket', () => {
  for (const id of ['A', 'C']) {
    const G = exits.find(e => e.id === id).kiosk.frame;
    const s = [1, -1].find(k => Math.abs(toW(G, 9.7, k * 3.45)[1]) < 26);
    const outline = lrectPoly(G, rect(-0.2, -3.45, 9.8, 3.45));
    for (const [tu, tv] of [[9, 2.6], [9.3, 2.2], [8.6, 3]]) {
      const from = toW(G, 11, s * 1.8), to = toW(G, tu, s * tv);
      assert.ok(Math.abs(to[1]) < 26 && Math.abs(from[1]) < 26, 'probe must lie in the concourse');
      const end = walk('M-B1', from, to);
      assert.ok(!pointInPoly([end.x, end.z], outline), `${id}: walked into the shaft at ${tu},${tv}`);
      for (const h of [0.5, 1.6, 2.6]) {
        const d = [to[0] - from[0], 0, to[1] - from[1]], len = Math.hypot(d[0], d[2]);
        const hit = cast(solid, [from[0], y0 + h, from[1]], d, len);
        assert.ok(hit, `${id}: shaft interior open to the concourse at h=${h}`);
      }
    }
  }
});

test('metro-4: the PB end has no open slots beside the B stair', () => {
  const p = M.passages.find(p => p.id === 'PB');
  for (const v of [-3.75, -3.6, 3.6, 3.75]) for (const h of [0.5, 1.6, 3]) {
    const [x, z] = toW(p.F, p.uEnd - 2, v);
    assert.ok(cast(solid, [x, y0 + h, z], [p.F.c, 0, p.F.s], 3), `PB end slot open at v=${v} h=${h}`);
  }
});

test('metro-5: the side landings of A, C and D have a ceiling, so looking up never shows sky', () => {
  const meshes = [...solid, ...ceiling];
  for (const w of lvl('M-B1').walk.filter(w => w.kind === 'exit')) {
    const bb = polyBounds(w.poly); let n = 0;
    for (let x = bb.x0; x <= bb.x1; x += 0.5) for (let z = bb.z0; z <= bb.z1; z += 0.5) {
      if (!pointInPoly([x, z], w.poly) || !clear(nav, { floor: 'M-B1', x, z, y: y0, slope: null })) continue; n++;
      const hit = cast(meshes, [x, y0 + 1.6, z], [0, 1, 0], 300);
      assert.ok(hit && hit.point.y < 0, `${w.id} open to the sky at ${x.toFixed(2)},${z.toFixed(2)}`);
    }
    assert.ok(n > 30, `${w.id}: too few landing samples`);
  }
});

test('metro-6: a lintel closes the band above every stair-bottom opening (looking back down the stair)', () => {
  for (const ex of exits) {
    const G = ex.kiosk.frame;
    for (const u of [1.5, 2.5, 4.5]) for (const v of [-1.5, 0]) for (const ty of [-0.85, -0.55, -0.25]) {
      const [x, z] = toW(G, u, v), cy = stairY(u) + 1.62, [tx, tz] = toW(G, -0.4, v);
      const d = [tx - x, ty - cy, tz - z], dist = Math.hypot(...d);
      const hit = cast(solid, [x, cy, z], d, 300);
      assert.ok(hit && hit.distance < dist, `${ex.id}: open band above the stair bottom (u=${u} v=${v} y=${ty})`);
    }
  }
});

test('metro-7: the slits beside every stair and escalator look down onto a shaft floor, not void', () => {
  for (const ex of exits) {
    const G = ex.kiosk.frame;
    for (const v of [-3.02, 0.78, 0.95, 2.9, 3.05]) for (const u of [1.5, 4.8, 8]) {
      const [x, z] = toW(G, u, v), top = stairY(u) + 1.2;
      assert.ok(cast(solid, [x, top, z], [0, -1, 0], top - (y0 - 0.35)), `${ex.id}: void below the slit at u=${u} v=${v}`);
    }
  }
});

test('metro-8: every M totem has collision where it is drawn, and E–H totems stand off the approach walk', () => {
  for (const ex of exits) {
    const p = ex.kiosk.pylon;
    assert.ok(p, `${ex.id}: totem not recorded in the layout`);
    const G = ex.kiosk.frame, [x, z] = toW(G, p.u, p.v), floor = nav.groundAt(x, z);
    assert.equal(clear(nav, { floor, x, z, y: 0, slope: null }), false, `${ex.id}: totem centre walkable`);
    for (const [du, dv] of [[1, 0], [0, 1]]) {
      let closest = Infinity;
      walk(floor, toW(G, p.u - du * 1.4, p.v - dv * 1.4), toW(G, p.u + du * 1.4, p.v + dv * 1.4), s => { closest = Math.min(closest, Math.hypot(s.x - x, s.z - z)); });
      assert.ok(closest >= p.w / 2 + 0.25, `${ex.id}: walked through the totem (${closest.toFixed(2)})`);
    }
    if (ex.approach) assert.ok(!pointInPoly([x, z], ex.approach.poly), `${ex.id}: totem stands in its approach walk`);
    const [ox, oz] = toW(G, p.u - 1.5, p.v), hit = cast(solid, [ox, 2, oz], [x - ox, 0, z - oz], 1.5);
    assert.ok(hit && Math.abs(hit.distance - (1.5 - p.w / 2)) < 0.03, `${ex.id}: totem not drawn at its collision record`);
  }
});

test('metro-10: the P1-MT arrival on B1M is clear of lounge furniture that has no collision', () => {
  const lv = lvl('P1-B1M'), b = L.buildings.find(b => b.id === 'P1');
  const level = { lv, batch: new BatchSet(materials), base: new THREE.Group(), signs: new SignBatch() };
  const atlas = { material: materials.sign, get: () => ({ uv: [0, 0, 1, 1], aspect: 4 }), cell: () => [0, 0, 1, 1] };
  buildPublic({ layout: { ...L, buildings: [b] }, levels: { [lv.id]: level }, buildings: { P1: { levels: [level] } }, atlas: { [lv.id]: atlas },
    lvById: Object.fromEntries(L.levels.map(l => [l.id, l])), dynamic: [],
    mats: { base: materials, floor: k => materials[`floor:${k}`], screen: () => materials.screen, onNight() {} } }, { art: false });
  level.batch.flush(level.base); level.base.updateMatrixWorld(true);
  const meshes = []; level.base.traverse(o => { if (o.isMesh) meshes.push(o); });
  const e = L.entrances.find(e => e.id === 'P1-MT'), mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
  for (const lateral of [-3, -1.5, 0, 1.5, 3]) for (const h of [0.3, 0.6]) {
    const hit = cast(meshes, [mx + e.nx * 0.5 - e.nz * lateral, lv.elev + h, mz + e.nz * 0.5 + e.nx * lateral], [-e.nx, 0, -e.nz], 6);
    assert.ok(!hit, `furniture ${hit?.distance.toFixed(2)}m inside P1-MT at lateral ${lateral}, h=${h}`);
  }
  level.base.traverse(o => o.geometry?.dispose());
});

test('metro-11: exit stairs are bounded by their handrails and the up escalator is its own 30° lane', () => {
  for (const ex of exits) {
    const G = ex.kiosk.frame, stair = nav.slopeById.get(`exit-${ex.id}`), esc = nav.slopeById.get(`exit-${ex.id}-escalator`);
    // Walking sideways on the stair stops at the central handrail (v=0.85) instead of crossing the escalator.
    const [sx, sz] = toW(G, 4, -1.5), [u0, v0] = toL(stair.F, sx, sz);
    let s = { floor: 'M-B1', x: sx, z: sz, y: 0, slope: { id: stair.id, u: u0, v: v0 } };
    for (let i = 0; i < 80; i++) s = step(nav, s, -G.s * 0.05, G.c * 0.05, 0);
    assert.ok(toL(G, s.x, s.z)[1] <= 0.85 - 0.3 + 0.01, `${ex.id}: walked through the stair handrail`);
    assert.ok(esc && esc.kind === 'escalator' && esc.belt === 1 && esc.low === 'M-B1', `${ex.id}: no escalator lane`);
    // The lane follows the drawn treads, then a ride from B1 reaches the surface without a jump.
    for (const u of [3, 6, 8]) {
      const [x, z] = toW(G, u, 1.9), hit = cast(solid.filter(m => m.material === materials.steps), [x, 2.5, z], [0, -1, 0], 10);
      const [lu, lv] = toL(esc.F, x, z), y = esc.y0 + (esc.y1 - esc.y0) * lu / esc.len;
      assert.ok(Math.abs(lv) < 1e-6 && hit && Math.abs(hit.point.y - 0.03 - y) < 0.06, `${ex.id}: lane ${y.toFixed(2)} vs treads at u=${u}`);
    }
    let r = { floor: 'M-B1', x: toW(G, -0.6, 1.9)[0], z: toW(G, -0.6, 1.9)[1], y: y0, slope: null }, rode = false;
    assert.ok(clear(nav, r));
    for (let i = 0; i < 800 && !(rode && !r.slope); i++) {
      const prev = r; r = step(nav, r, G.c * 0.04, G.s * 0.04, 0.02);
      assert.ok(Math.abs(r.y - prev.y) < 0.04, `${ex.id}: vertical jump on the escalator`);
      if (r.slope) { assert.equal(r.slope.id, esc.id); rode = true; }
    }
    assert.ok(rode && !r.slope && r.floor === esc.high && Math.abs(r.y) < 1e-9, `${ex.id}: escalator ride did not reach the surface`);
  }
});

test('metro-14: the P2-MT ramp plate is walked as a ramp in both directions, without a 0.3 m jump', () => {
  const e = L.entrances.find(e => e.id === 'P2-MT'), mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
  const lv = lvl(e.level), dy = lv.elev - y0;
  assert.ok(Math.abs(dy) > 0.05);
  for (const lateral of [-3, 0, 3]) for (const dir of [1, -1]) {
    const tx = -e.nz * lateral, tz = e.nx * lateral;
    const a = [mx + e.nx * 6 * dir + tx, mz + e.nz * 6 * dir + tz], b = [mx - e.nx * 6 * dir + tx, mz - e.nz * 6 * dir + tz];
    let prev = null;
    const end = walk(dir > 0 ? 'M-B1' : e.level, a, b, s => {
      if (prev) assert.ok(Math.abs(s.y - prev.y) < 0.05, `P2-MT vertical jump ${(s.y - prev.y).toFixed(2)}`);
      const u = (s.x - mx) * e.nx + (s.z - mz) * e.nz;   // drawn plate: lv.elev at the doorway → M-B1 3 m into the passage
      if (u > 0 && u < 3) assert.ok(Math.abs(lv.elev - dy * u / 3 - s.y) < 0.1, `nav ${s.y.toFixed(2)} under the plate at ${u.toFixed(2)}`);
      prev = s;
    });
    assert.equal(end.floor, dir > 0 ? e.level : 'M-B1');
    assert.ok(Math.hypot(end.x - b[0], end.z - b[1]) < 0.02, 'blocked crossing P2-MT');
  }
});
