import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, lvl } from './helpers.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { frame, toW, rect, lrectPoly, convexOverlap, pointInPoly } from '../src/layout/geom.js';
import { BatchSet } from '../src/render/batch.js';
import { ceilingLights } from '../src/render/build/shell.js';
import { connections, attachedDockLobbies, buildPublicGarageShells } from '../src/render/build/hospitality.js';
import { buildSharedGarageDetails, rampCeilingCrossings } from '../src/render/build/shared-garages.js';

const paint = new Proxy({}, {
  get: (t,k) => k in t ? t[k] : k === 'measureText' ? () => ({width:10}) : String(k).startsWith('create') ? () => ({addColorStop(){}}) : () => {},
  set: (t,k,v) => {t[k]=v;return true;},
});
globalThis.document ??= {createElement:()=>({width:0,height:0,getContext:()=>paint})};

const nav = buildNav(L);
const DEG = 180 / Math.PI;
function walk(floor, from, to) {
  let s = { floor, x: from[0], z: from[1], y: lvl(floor).elev, slope: null };
  assert.ok(clear(nav, s), `${floor} ${from} not standable`);
  const n = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / .1);
  for (let i = 0; i < n; i++) s = step(nav, s, (to[0] - from[0]) / n, (to[1] - from[1]) / n, 0);
  return s;
}
const reached = (s, to) => Math.hypot(s.x - to[0], s.z - to[1]) < .2;

/** A render context for the hospitality/garage builders, with every mesh
 * flushed and collected for ray casts. */
function scene(build, cameraY = -6) {
  const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) });
  const levels = Object.fromEntries(L.levels.map(lv => [lv.id, { lv, batch: new BatchSet(materials), shellBatch: new BatchSet(materials),
    base: new THREE.Group(), shell: new THREE.Group(), group: new THREE.Group() }]));
  const root = new THREE.Group();
  const ctx = { layout: L, levels, root, renderer: {}, dynamic: [], hospitality: {}, camera: new THREE.PerspectiveCamera(),
    lvById: Object.fromEntries(L.levels.map(l => [l.id, l])), bById: Object.fromEntries(L.buildings.map(b => [b.id, b])),
    mats: { base: materials, onNight() {}, screen: () => materials.screen, sign: () => materials.sign } };
  // Ray casts ignore visibility, so camera-aware ceilings are included.
  ctx.camera.position.set(0, cameraY, 0);
  build(ctx);
  const meshes = [];
  for (const v of Object.values(levels)) { v.batch.flush(v.base); v.shellBatch.flush(v.shell); root.add(v.base, v.shell); }
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const cast = (o, d, far) => new THREE.Raycaster(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize(), 0, far).intersectObjects(meshes, false);
  return { cast, meshes, root, dispose() { root.traverse(o => o.geometry?.dispose()); for (const m of Object.values(materials)) m.dispose?.(); } };
}

test('西侧车库 B1 东墙在西侧连廊处真实开口，扩建后车库内不再残留旧隧道墙', () => {
  const s = scene(ctx => { buildPublicGarageShells(ctx); connections(ctx); });
  // The west-parking tunnel leaves the expanded deck at x=-301.
  for (const dz of [-2.1, 0, 2.1]) for (const h of [.3, 1.6, 2.6])
    assert.equal(s.cast([-304, -4.5 + h, -200 + dz], [1, 0, 0], 6).length, 0, `west tunnel mouth walled at ${dz},${h}`);
  assert.ok(s.cast([-304, -4.5 + 3.4, -200], [1, 0, 0], 6).length > 0, 'wall above the tunnel ceiling missing');
  assert.ok(s.cast([-304, -4.5 + 1.6, -206], [1, 0, 0], 6).length > 0, 'retaining wall beside the tunnel missing');
  // The old street-arrival lanes and the tunnel stub are open deck now.
  for (const z of [-180, -177.5, -175]) for (const h of [.3, 1.6, 2.6])
    assert.equal(s.cast([-370, -4.5 + h, z], [1, 0, 0], 20).length, 0, `legacy tunnel wall inside the deck at z=${z},${h}`);
  assert.equal(s.cast([-304, -2.9, -206], [0, 0, 1], 12).length, 0, 'legacy tunnel stub inside the deck');
  for (const z of [-180, -177.5, -175]) assert.ok(reached(walk('WPG-B1', [-368, z], [-349, z]), [-349, z]));
  assert.ok(reached(walk('WPG-B1', [-310, -200], [-282, -200]), [-282, -200]));
  s.dispose();
});

test('地下连廊端头只在门口、楼层或坡道处打开，住宅车行主通道东端封堵', () => {
  const s = scene(ctx => connections(ctx));
  for (const dz of [-2.5, 0, 2.5]) for (const h of [.3, 1.6, 2.8])
    assert.ok(s.cast([254, -4.2 + h, -190 + dz], [1, 0, 0], 6).length > 0, `spine dead end open at ${dz},${h}`);
  // Real mouths stay open: the hotel tunnel into its dock, the west tunnel into B1M.
  for (const [o, d] of [[[-209, -2.9, -81.15], [1, 0, 0]], [[-283, -2.9, -200], [1, 0, 0]], [[106.066, -2.6, -139], [0, 0, 1]]])
    assert.equal(s.cast(o, d, 4).length, 0, `tunnel mouth capped at ${o}`);
  s.dispose();
});

test('并入共享车库的 B1 旧接驳厅不再出墙，B1M 接驳厅侧墙直抵顶板', () => {
  const s = scene(ctx => attachedDockLobbies(ctx));
  for (const h of [.3, 1.6, 2.6]) {
    assert.equal(s.cast([-203, -8.4 + h, -89], [0, 0, 1], 10).length, 0, `hotel B1 dock wall at ${h}`);
    assert.equal(s.cast([-60, -8.4 + h, -181], [0, 0, 1], 10).length, 0, `apartment B1 dock wall at ${h}`);
  }
  for (const off of [-3.6, 3.6]) assert.equal(s.cast([-212, -6.8, -81.15 + off], [1, 0, 0], 10).length, 0);
  // No slit between the B1M side walls and the dock ceiling.
  for (const [x, z] of [[-203, -81.15], [-60, -173.46]]) for (const h of [3.1, 3.2, 3.28, 3.33]) for (const dz of [-1, 1])
    assert.ok(s.cast([x, -4.5 + h, z], [0, 0, dz], 6).length > 0, `dock slit at ${x},${h},${dz}`);
  s.dispose();
});

test('一期 B1 永久顶板为街道坡道和共享楼梯真实开洞，洞口四周封闭，灯具不挂在坡道净空内', () => {
  const s = scene(ctx => buildSharedGarageDetails(ctx));
  const lv = lvl('P1-B1'), ceilingY = lv.elev + lv.height - .48;
  const crossings = rampCeilingCrossings(L, lv, ceilingY);
  assert.deepEqual(new Set(crossings.map(c => c.ramp.id)), new Set(['P1-N-IN', 'P1-N-OUT', 'P1-E-IN', 'P1-E-OUT']));
  for (const c of crossings) {
    const r = c.ramp, H = r.headroom;
    for (let u = c.u0 + .2; u < c.u1; u += .5) for (const v of [-r.width / 2 + .3, 0, r.width / 2 - .3]) {
      const [x, z] = toW(c.F, u, v), y = c.hi.y - c.drop * u / c.len;
      const hits = s.cast([x, y + .1, z], [0, 1, 0], H - .1);
      assert.equal(hits.length, 0, `${r.id} capped ${hits[0]?.object.parent?.name} at u=${u.toFixed(1)}`);
    }
    // Above the roof plane the lane is walled in, never open to the void.
    const top = Math.max(0, c.len * (c.hi.y - (lv.elev + lv.height)) / c.drop);
    for (let u = top + .3; u < c.u1; u += 1.5) for (const side of [-1, 1]) {
      const [x, z] = toW(c.F, u, 0), [ox, oz] = toW(c.F, u, side), y = Math.max(c.hi.y - c.drop * u / c.len + 1.6, ceilingY + .3);
      assert.ok(s.cast([x, y, z], [ox - x, 0, oz - z], c.half + 1).length > 0, `${r.id} open sideways at u=${u.toFixed(1)}`);
    }
    const [x, z] = toW(c.F, (top + c.u1) / 2, 0);
    assert.ok(s.cast([x, ceilingY + .2, z], [0, 1, 0], 6).length > 0, `${r.id} opening has no lid`);
  }
  const P1 = L.buildings.find(b => b.id === 'P1');
  for (const id of ['P1-SHARED-ST1', 'P1-SHARED-ST2', 'P1-SHARED-ST3', 'P1-SHARED-ST4']) {
    const st = L.stairs.find(st => st.id === id), f = P1.access.flights.find(f => f.stair === id && f.from === 'P1-B1');
    for (const t of [.1, .2, .3, .4]) {
      const p = ['x', 'y', 'z'].map(k => f.bottom[k] + (f.top[k] - f.bottom[k]) * t);
      assert.equal(s.cast([p[0], p[1] + .15, p[2]], [0, 1, 0], 2.2).length, 0, `${id} flight capped at ${t}`);
    }
    const cx = (st.rect.x0 + st.rect.x1) / 2, cz = (st.rect.z0 + st.rect.z1) / 2;
    for (const y of [-3.5, -1.5]) for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]])
      assert.ok(s.cast([cx, y, cz], d, 7).length > 0, `${id} well open at ${y} ${d}`);
  }
  // The punched roof still closes the deck right beside each opening.
  const roof = s.meshes.filter(m => m.name === 'P1-B1-permanent-parking-roof');
  assert.equal(roof.length, 1);
  const holes = crossings.map(c => c.poly);
  assert.ok(holes.every((p, i) => holes.every((q, j) => i === j || !convexOverlap(p, q, .001))), 'ramp openings overlap');
  const roofAt = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, ceilingY - .5, z), new THREE.Vector3(0, 1, 0), 0, 1).intersectObjects(roof).length > 0;
  for (const c of crossings) for (const v of [-c.half - .6, c.half + .6]) {
    const [x, z] = toW(c.F, (c.u0 + c.u1) / 2, v);
    if (pointInPoly([x, z], lv.outline) && !holes.some(p => pointInPoly([x, z], p))) assert.ok(roofAt(x, z), `${c.ramp.id} roof missing beside its opening`);
  }
  for (const [x, z] of [[-130, -225], [-28, -132], [-279, -246]]) assert.ok(roofAt(x, z), `roof missing at ${x},${z}`);
  // No fixture hangs in a sloped lane short of headroom (west deck ramps included).
  for (const id of ['WPG-B1', 'P1-B1']) {
    const g = lvl(id), y = g.elev + g.height - .48;
    for (const c of rampCeilingCrossings(L, g, y)) for (let u = c.u0; u < c.u1; u += .5) for (const v of [-1.5, 0, 1.5]) {
      const [x, z] = toW(c.F, u, v), sy = c.hi.y - c.drop * u / c.len;
      const hits = s.cast([x, sy + .1, z], [0, 1, 0], (c.ramp.headroom ?? 2.6) - .1).filter(h => /permanent-lighting/.test(h.object.parent?.name));
      assert.equal(hits.length, 0, `${c.ramp.id} light fixture at u=${u.toFixed(1)}`);
    }
  }
  s.dispose();
});

test('地库车道灯管不悬在敞开坡道槽和净空不足的坡道上方', () => {
  const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) });
  const levels = Object.fromEntries(L.levels.map(lv => [lv.id, { lv, batch: new BatchSet(materials) }]));
  const ids = ['H', 'A', 'WPG'], buildings = Object.fromEntries(ids.map(id => [id, { b: L.buildings.find(b => b.id === id),
    levels: L.levels.filter(l => l.building === id).map(lv => levels[lv.id]) }]));
  // As in the app, the shell pass sees only the original buildings' ramps.
  const towers = new Set(L.buildings.filter(b => b.kind === 'tower').map(b => b.id));
  ceilingLights({ layout: { ...L, ramps: L.ramps.filter(r => !towers.has(r.building)) }, levels, buildings });
  const group = new THREE.Group();
  for (const v of Object.values(levels)) v.batch.flush(group);
  group.updateMatrixWorld(true);
  let checked = 0;
  for (const id of ['H-IN', 'H-OUT', 'WPG-SOUTH-IN', 'WPG-SOUTH-OUT', 'WPG-IN', 'WPG-OUT', 'A-IN', 'A-OUT']) {
    const r = L.ramps.find(r => r.id === id), [hi, lo] = r.from.y > r.to.y ? [r.from, r.to] : [r.to, r.from];
    const len = Math.hypot(lo.x - hi.x, lo.z - hi.z), F = frame(hi.x, hi.z, Math.atan2(lo.z - hi.z, lo.x - hi.x) * DEG);
    for (let u = .25; u < len; u += .5) for (const v of [-r.width / 2 + .3, 0, r.width / 2 - .3]) {
      const [x, z] = toW(F, u, v), y = hi.y + (lo.y - hi.y) * u / len;
      const hits = new THREE.Raycaster(new THREE.Vector3(x, y + .1, z), new THREE.Vector3(0, 1, 0), 0, 2.5).intersectObjects(group.children, false);
      assert.equal(hits.length, 0, `${id} light tube ${hits[0]?.point.y.toFixed(2)} above u=${u.toFixed(1)}`);
      checked++;
    }
  }
  assert.ok(checked > 400);
  assert.ok(group.children.some(m => m.name === 'glow'), 'garage lights were not built at all');
  for (const m of group.children) m.geometry.dispose();
});

test('坡道低端楼面上不能从坡道板下横穿，坡脚仍可上坡', () => {
  let n = 0;
  for (const r of L.ramps) {
    const [lo, hi] = r.from.y <= r.to.y ? [r.from, r.to] : [r.to, r.from];
    if (lo.level === 'street') continue;
    const len = Math.hypot(hi.x - lo.x, hi.z - lo.z), F = frame(lo.x, lo.z, Math.atan2(hi.z - lo.z, hi.x - lo.x) * DEG);
    for (const clearance of [.8, 1.5]) {
      const u = len * (clearance + .4) / (hi.y - lo.y);
      if (u > len - .5) continue;
      for (const s of [-1, 1]) {
        const a = toW(F, u, -s * (r.width / 2 + 2.5)), b = toW(F, u, s * (r.width / 2 + 2.5));
        const start = { floor: lo.level, x: a[0], z: a[1], y: lo.y, slope: null };
        if (!clear(nav, start)) continue;
        const end = walk(lo.level, a, b);
        assert.ok(!reached(end, b), `${r.id}: walked under the ramp slab (${clearance} m) on ${lo.level}`);
        n++;
      }
    }
  }
  assert.ok(n >= 40, `only ${n} under-ramp crossings checked`);
});

test('成对车库坡道的岗亭、票箱和立牌位于外侧，不占另一条车道的坡口，岗亭不落在道路上', () => {
  const street = L.ramps.filter(r => r.type.startsWith('street'));
  const gateFrame = r => { const [s, o] = r.from.level === 'street' ? [r.from, r.to] : [r.to, r.from]; return frame(s.x, s.z, Math.atan2(s.z - o.z, s.x - o.x) * DEG); };
  const roads = [...L.site.roads.flatMap(r => r.poly ? [r.poly] : []), ...L.extensions.roads.flatMap(r => r.polys)];
  let paired = 0;
  for (const r of street) {
    const F = gateFrame(r), hw = r.width / 2, side = r.gate?.side ?? 1, sign = r.gate?.sign ?? -1;
    const box = (u, v, h) => lrectPoly(F, rect(u - h, v - h, u + h, v + h));
    const items = [['post', box(1.5, side * (hw + .6), .225)], ['pole', box(7, sign * (hw + 1.2), .12)]];
    if (r.gate?.booth !== false) items.push(['booth', box(1.6, side * (hw + 2.4), 1.1)]);
    const partners = street.filter(q => q !== r && Math.hypot(gateFrame(q).ox - F.ox, gateFrame(q).oz - F.oz) < 15);
    paired += partners.length > 0;
    for (const q of partners) {
      const head = lrectPoly(gateFrame(q), rect(-2, -q.width / 2, 8, q.width / 2));
      for (const [name, p] of items) assert.ok(!convexOverlap(p, head, .01) && !convexOverlap(p, q.poly, .01), `${r.id} ${name} stands in ${q.id}`);
    }
    if (partners.length && r.gate?.booth !== false) assert.ok(!roads.some(p => convexOverlap(items.at(-1)[1], p, .01)), `${r.id} booth on a road`);
  }
  assert.ok(paired >= 14, `only ${paired} paired gates`);
});

test('西侧共享车库隧道 12 米全宽进入一期 B1，储藏间不占隧道到达区', () => {
  const B1 = lvl('P1-B1'), arrival = B1.walk.find(w => w.id === 'shared-mall-tunnel-arrival');
  for (const room of B1.rooms) for (const p of room.polys) assert.ok(!convexOverlap(p, arrival.poly), `${room.id} blocks the tunnel arrival`);
  for (const dz of [-5.55, -3.7, 0, 3.7, 5.55]) {
    const end = walk('WPG-B2', [-307, -179 + dz], [-272, -179 + dz]);
    assert.ok(reached(end, [-272, -179 + dz]) && end.floor === 'P1-B1', `stopped at ${end.x.toFixed(2)},${end.z.toFixed(2)}`);
  }
});

test('酒店接驳内门不被翼端休息区沙发茶几挡住', () => {
  const docks = L.extensions.gateways.filter(g => !g.openDeck);
  let checked = 0;
  for (const g of docks) {
    const lv = lvl(g.level), s = g.innerSeg, len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const e = L.entrances.find(e => e.level === g.level && e.architecturalOpening && Math.hypot(e.seg.x0 - s.x0, e.seg.z0 - s.z0) < .01);
    // The approach strip runs 6 m into the mall from the doorway.
    const F = frame(s.x0, s.z0, Math.atan2(s.z1 - s.z0, s.x1 - s.x0) * DEG), inward = -Math.sign(e.nx * -F.s + e.nz * F.c) || 1;
    const strip = lrectPoly(F, rect(0, Math.min(0, inward * 6), len, Math.max(0, inward * 6)));
    for (const w of lv.walk.filter(w => w.kind === 'lounge' && w.rect)) {
      const r = w.rect, cu = (r.x0 + r.x1) / 2, cv = (r.z0 + r.z1) / 2;
      if (r.x1 - r.x0 < 4 || r.z1 - r.z0 < 4) continue;
      // lounges(): two 3.2 m sofas and a 1 m table about the rect centre.
      const pieces = [rect(cu - 1.07, cv - 4, cu - .15, cv - .8), rect(cu - 1.07, cv + .8, cu - .15, cv + 4), rect(cu + .3, cv - .5, cu + 1.3, cv + .5)];
      for (const p of pieces) assert.ok(!convexOverlap(lrectPoly(w.frame, p), strip, .01), `${w.id} furniture in the ${g.id} doorway`);
    }
    checked++;
  }
  assert.equal(checked, 6);
  for (const id of ['P1-2F', 'P1-B1M']) assert.ok(lvl(id).walk.filter(w => w.kind === 'lounge' && w.id.startsWith('W-end')).length === 2, `${id} W-end seating`);
});
