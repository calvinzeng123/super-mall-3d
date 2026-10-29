import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayableLayout, PLAYABLE_BOUNDS } from '../src/layout/playable.js';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { toW } from '../src/layout/geom.js';
import { findPath, hasLineOfSight, traceMotion, advanceGuide } from '../src/fps/pathfinding.js';
import { FPS_MISSION, createMissionLayout } from '../src/fps/mission-layout.js';
import { buildRoof } from '../src/render/build/roof.js';
import { buildSquare } from '../src/render/build/square.js';
import { buildTowerStairGeometry, buildTowerStairInstances } from '../src/render/build/tower-stairs.js';
import * as THREE from 'three';

const fps = buildPlayableLayout({ mode: 'fps' }), nav = buildNav(fps);
const tour = buildPlayableLayout(), compact = buildLayout({ expansion: false });
const state = (floor, x, z) => ({ floor, x, z, y: nav.floors.get(floor).y, slope: null });

test('only FPS physically trims the campus to P1, hotel and apartments', () => {
  for (const l of [fps]) {
    assert.deepEqual(l.buildings.map(b => b.id), ['P1', 'H', 'A']);
    assert.equal(l.bridges, null);
    for (const key of ['park', 'urban', 'forecourt', 'westParking']) assert.equal(l.site[key], undefined);
    assert.deepEqual(l.site.bounds, PLAYABLE_BOUNDS);
    assert.ok(l.levels.every(v => ['P1', 'H', 'A'].includes(v.building)));
    assert.ok(l.site.plots.every(p => p.id === 'P1'));
    // FPS is cut from the compact authoring layout; the tour's hotel forecourt has a drop-off loop.
    assert.equal(l.extensions.surfaceParking.reduce((n, p) => n + p.stalls.length, 0),
      compact.extensions.surfaceParking.filter(p=>p.id==='hotel-shared-parking').reduce((n,p)=>n+p.stalls.length,0));
    assert.equal(l.extensions.connections.some(c => /P2|P3|R[1-4]|WPG|M-B/.test(`${c.from} ${c.to}`)), false);
    assert.ok(l.site.roads.length < 5);
  }
});

test('tour restores all authoring buildings, transit and floors before scene creation', () => {
  const complete=buildLayout();
  assert.equal(tour.playable,undefined,'full tour must not trigger compact site/traffic code');
  assert.deepEqual(tour.buildings.map(b=>b.id),complete.buildings.map(b=>b.id));
  assert.deepEqual(tour.levels.map(l=>l.id),complete.levels.map(l=>l.id));
  assert.ok(tour.buildings.some(b=>b.id==='P2')&&tour.buildings.some(b=>b.id==='P3'));
  assert.ok(tour.levels.some(l=>l.id==='R4-30F'));
  assert.ok(tour.bridges&&tour.site.westParking&&tour.site.urban);
  assert.deepEqual(tour.extensions.connections,complete.extensions.connections);
});

test('FPS releases upper rooms but preserves physically reachable tower rooftops', () => {
  assert.equal(fps.levels.length, 18);
  assert.equal(fps.playable.walkableLevelIds.length, 17);
  for (const id of ['H', 'A']) {
    const b = fps.buildings.find(b => b.id === id), cap = fps.levels.find(l => l.id === `${id}-RF`);
    assert.equal(b.storeys, 3); assert.equal(b.height, 13.3); assert.equal(cap.elev, 13.3);
    assert.equal(cap.playableRoof, true); assert.equal(cap.units.length, 0);
    assert.ok(cap.voids.some(v=>v.kind==='stair')&&cap.voids.some(v=>v.kind==='shaft'));
    assert.ok(b.access.routes.some(r=>r.from===`${id}-3F`&&r.to===`${id}-RF`));
    assert.ok(fps.elevators.filter(e=>e.building===id).every(e=>e.serves.includes(`${id}-RF`)));
    assert.ok(tour.levels.some(l => l.id === `${id}-20F`));
  }
  assert.ok(!fps.levels.some(l => l.id === 'P1-3F'));
  assert.equal(fps.levels.find(l => l.id === 'P1-RF').elev, 12);
  assert.ok(tour.levels.length>180);
});

test('no remaining navigation link points at a removed floor or inaccessible cap', () => {
  const allowed = new Set(fps.playable.walkableLevelIds);
  for (const s of [...fps.elevators, ...fps.stairs]) for (const id of s.serves) assert.ok(allowed.has(id), `${s.id}: ${id}`);
  for (const p of nav.portals) { assert.ok(nav.floors.has(p.a)); assert.ok(nav.floors.has(p.b)); }
  for (const s of nav.slopes) { assert.ok(nav.floors.has(s.low), s.id); assert.ok(nav.floors.has(s.high), s.id); }
  for (const b of fps.buildings) for (const r of b.access.routes) {
    assert.ok(allowed.has(r.from)); assert.ok(allowed.has(r.to));
    for (const p of r.waypoints) assert.ok(nav.floors.has(p.floor));
  }
  for (const floor of nav.floors.values()) assert.ok(!/^(?:P2|P3|R[1-4]|WPG|M)-/.test(floor.id), floor.id);
});

test('all objective, squad and patrol positions remain usable with tactical cover installed', () => {
  for (const p of [FPS_MISSION.spawn, FPS_MISSION.teammate, ...FPS_MISSION.objectives,
    ...FPS_MISSION.extractions,
    ...FPS_MISSION.enemies, ...FPS_MISSION.enemies.flatMap(e => e.patrol)]) assert.ok(clear(nav, p), `${p.id || 'patrol'}: ${p.floor}/${p.x}/${p.z}`);
  for (const c of FPS_MISSION.cover) {
    assert.equal(clear(nav, c), false, `${c.id} must collide`);
    assert.ok(fps.levels.find(l => l.id === c.floor).features.some(f => f.id === c.id && f.tactical));
  }
  const copy = createMissionLayout(); copy.objectives[0].x = 0;
  assert.notEqual(copy.objectives[0].x, FPS_MISSION.objectives[0].x);
});

test('complete mission route is continuously walkable using player collision and stair transitions', () => {
  const stops = [FPS_MISSION.spawn, ...FPS_MISSION.objectives];
  let usedStair = false, usedConcourse = false;
  for (let i = 0; i < stops.length - 1; i++) {
    const path = findPath(nav, stops[i], stops[i + 1]);
    assert.ok(path?.length > 1, `mission leg ${i} missing`);
    let s = { ...path[0] };
    for (const target of path.slice(1)) {
      const distance = Math.hypot(target.x - s.x, target.z - s.z), count = Math.max(1, Math.ceil(distance / .12));
      const dx = (target.x - s.x) / count, dz = (target.z - s.z) / count;
      for (let j = 0; j < count; j++) {
        s = step(nav, s, dx, dz, 0);
        usedStair ||= s.slope?.id.includes('ST') || false;
        usedConcourse ||= s.floor === 'P1-B1M';
      }
      assert.ok(Math.hypot(target.x - s.x, target.z - s.z) < .08, `route collided at ${target.floor}`);
      assert.equal(s.floor, target.floor);
      assert.ok(clear(nav, s));
    }
  }
  assert.ok(usedStair, 'mission should use real continuous stairs');
  assert.ok(usedConcourse, 'mission should use the original underground mall connection');
});

test('hotel roof helicopter and underground getaway vehicle both have continuous two-way routes',()=>{
  const mission=createMissionLayout(fps);
  for(const extraction of mission.extractions){
    for(const [from,to] of [[mission.objectives[1],extraction],[extraction,mission.objectives[1]]]){
      const route=findPath(nav,from,to);assert.ok(route?.length>1,extraction.id);
      for(let i=1;i<route.length;i++)assert.ok(traceMotion(nav,route[i-1],route[i]),`${extraction.id}: ${route[i].floor}`);
    }
    const v=extraction.vehicle;
    assert.equal(clear(nav,{...extraction,x:v.x,z:v.z}),false,'vehicle hull must collide');
    assert.ok(clear(nav,extraction),'boarding ring must stay unobstructed');
  }
});

test('following the HUD breadcrumb reaches every mission goal without skipping stair approaches', () => {
  const stops = [FPS_MISSION.spawn, ...FPS_MISSION.objectives];
  let player = { ...stops[0] };
  for (let leg = 1; leg < stops.length; leg++) {
    const route = findPath(nav, stops[leg - 1], stops[leg]);
    let index = 0, frames = 0;
    for (; frames < 6000; frames++) {
      index = advanceGuide(nav, route, player, index);
      const target = route[index], dx = target.x - player.x, dz = target.z - player.z;
      const d = Math.hypot(dx, dz), amount = Math.min(d, 3.8 / 30);
      player = step(nav, player, d ? dx / d * amount : 0, d ? dz / d * amount : 0, 1 / 30);
      if (player.floor === stops[leg].floor && Math.hypot(player.x - stops[leg].x, player.z - stops[leg].z) < .1) break;
    }
    assert.ok(frames < 6000, `guide stalled on leg ${leg} at ${player.floor}/${player.x}/${player.z}`);
  }
});

test('HUD recovers a reachable corner after touch steering drifts beside the escalator railing', () => {
  const slope = nav.slopeById.get('P1-K7-U');
  const high = toW(slope.F, slope.len + .5, 0), low = toW(slope.F, -.5, 0);
  const route = [state('P1-2F', -147, -143.5), state('P1-2F', ...high), state('P1-1F', ...low)];
  let player = state('P1-2F', -146.26102242694387, -143.5721823026115);
  assert.ok(clear(nav, player));
  assert.equal(traceMotion(nav, player, route[1]), null, 'the railing blocks the advanced marker');
  assert.equal(advanceGuide(nav, route, player, 1), 0, 'guide must first return to the reachable corner');
  let index = 1, frames = 0, dx = 0, dz = 0;
  for (; frames < 900; frames++) {
    index = advanceGuide(nav, route, player, index);
    // A touch look update can arrive less often than the render/navigation tick.
    if (frames % 2 === 0) {
      const goal = route[index], d = Math.hypot(goal.x - player.x, goal.z - player.z);
      dx = (goal.x - player.x) / Math.max(.01, d) * Math.min(d, 3.8 / 30);
      dz = (goal.z - player.z) / Math.max(.01, d) * Math.min(d, 3.8 / 30);
    }
    player = step(nav, player, dx, dz, 1 / 30);
    if (player.floor === 'P1-1F' && Math.hypot(player.x - low[0], player.z - low[1]) < .2) break;
  }
  assert.ok(frames < 900, 'touch movement must finish the escalator descent without teleporting');
});

test('patrols use real floor paths and visibility never passes through cover or ceilings', () => {
  for (const enemy of FPS_MISSION.enemies) {
    const [a, b] = enemy.patrol, path = findPath(nav, a, b);
    assert.ok(path, enemy.id);
    for (let i = 1; i < path.length; i++) assert.ok(traceMotion(nav, path[i - 1], path[i]), enemy.id);
  }
  const a = state('H-2F', -250, -81.1533717), b = state('H-2F', -245, -81.1533717);
  assert.ok(hasLineOfSight(nav, a, b));
  assert.equal(hasLineOfSight(nav, a, { ...b, floor: 'H-1F', y: 0 }), false);
  const c = FPS_MISSION.cover[0];
  assert.equal(hasLineOfSight(nav, state(c.floor, c.x - 3, c.z), state(c.floor, c.x + 3, c.z)), false);
  assert.equal(findPath(nav, a, state('H-2F', FPS_MISSION.cover[3].x, FPS_MISSION.cover[3].z)), null);
  let checkedWalls = 0;
  for (const wall of nav.floors.get('H-2F').walls) {
    const length = Math.hypot(wall.x1 - wall.x0, wall.z1 - wall.z0);
    if (length < 1.8) continue;
    const x = (wall.x0 + wall.x1) / 2, z = (wall.z0 + wall.z1) / 2;
    const nx = -(wall.z1 - wall.z0) / length, nz = (wall.x1 - wall.x0) / length;
    const left = state('H-2F', x + nx * .8, z + nz * .8), right = state('H-2F', x - nx * .8, z - nz * .8);
    if (!clear(nav, left) || !clear(nav, right)) continue;
    assert.equal(hasLineOfSight(nav, left, right), false, 'existing hotel room partition allowed a shot');
    if (++checkedWalls === 8) break;
  }
  assert.ok(checkedWalls >= 4, 'verify several actual suite walls with usable positions on both sides');
});

test('FPS roof decoration is absent and the square pendant fixtures stay below the cap', () => {
  // A cap must not request materials or create roof props at all.
  buildRoof({ layout: { levels: fps.levels.filter(l => l.playableCap) } });
  const fixtures = [], batch = {
    frame: (_, fn) => fn(), get: () => ({
      box: (x, y, z, w, h, d) => fixtures.push({ y, top: y + h / 2 }),
      sphere: (x, y, z, radius, color, ry = radius) => fixtures.push({ y, top: y + ry }),
    }),
  };
  const levels = Object.fromEntries(fps.levels.map(l => [l.id, { batch }]));
  buildSquare({ layout: fps, levels });
  assert.ok(fixtures.length > 30);
  for (const fixture of fixtures) assert.ok(fixture.top < 11.4, `fixture pierces the 12m cap: ${fixture.top}`);
});

test('the top hotel floor renders its real RF staircase and roof exit enclosure', () => {
  const building = fps.buildings.find(b => b.id === 'H');
  const levels = fps.levels.filter(l => l.building === 'H'), stairs = fps.stairs.filter(s => s.building === 'H');
  const solids = [], recorder = { get: () => ({
    box: (x, y, z, w, h, d) => solids.push({ y, h }), bar: () => {},
  }) };
  buildTowerStairGeometry(recorder, building, levels, stairs, { flights: false });
  for (const solid of solids) assert.ok(solid.y + solid.h / 2 <= 16.5, 'roof enclosure exceeds its authored headroom');
  const materials = Object.fromEntries(['concrete', 'extMetal', 'glowSoft'].map(key => [key, new THREE.MeshStandardMaterial()]));
  const exterior = new THREE.Group(), ctx = { dynamic: [] };
  buildTowerStairInstances(ctx, building, levels, stairs, materials, exterior);
  ctx.dynamic[0].update(0, 0, { state: { explore: { building: 'H', level: 'H-3F' } } });
  let count = 0; const matrix = new THREE.Matrix4();
  exterior.traverse(mesh => {
    if (!mesh.isInstancedMesh || !mesh.visible) return;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); assert.ok(matrix.elements[13] <= 9.91, '3F staircase must start at its actual floor'); count++;
    }
    mesh.geometry.dispose();
  });
  Object.values(materials).forEach(m => m.dispose());
  assert.ok(count > 0, 'descending access must remain visible from 3F');
});
