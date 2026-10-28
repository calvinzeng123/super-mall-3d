import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLayout } from '../src/layout/layout.js';
import { pointInPoly, polyBounds, distToPolyEdge } from '../src/layout/geom.js';
import { BatchSet } from '../src/render/batch.js';
import { expansionConnectionNetworks, buildExpansionConnectionGeometry, buildExpansionConnections,
  expansionConnectionVisible } from '../src/render/build/expansion-connections.js';

const layout = buildLayout();
const networks = expansionConnectionNetworks(layout);
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const materials = Object.fromEntries(['concrete', 'stone', 'glassTint', 'glass', 'extMetal', 'extSatin', 'wood', 'glowSoft'].map(key => [key, material]));
function geometry(network) {
  const batch = new BatchSet(materials), ceilingBatch = new BatchSet(materials);
  const group = new THREE.Group(), ceiling = new THREE.Group();
  buildExpansionConnectionGeometry(batch, ceilingBatch, network);
  batch.flush(group); ceilingBatch.flush(ceiling);
  group.updateMatrixWorld(true); ceiling.updateMatrixWorld(true);
  return { group, ceiling, dispose() { for (const root of [group, ceiling]) root.traverse(o => o.geometry?.dispose()); } };
}

test('new diagonal/kinked connections form exact polygon components and merge shared junctions only', () => {
  const paths = networks.flatMap(n => n.paths.map(p => p.id));
  const source = layout.extensions.paths.filter(p => p.expansion && ['skybridge', 'underground', 'garage'].includes(p.kind));
  assert.deepEqual(new Set(paths), new Set(source.map(p => p.id)));
  assert.equal(paths.length, source.length, 'each connected path belongs to one union component');
  const east = networks.find(n => n.paths.some(p => p.id === 'P1-ART-E'));
  assert.ok(east.paths.some(p => p.id === 'P1-ART-E2'), 'east branch must not keep a wall across its shared junction');
  assert.ok(networks.some(n => n.below && n.paths[0].id === 'P1-sunken-food-passage'));
  assert.ok(!paths.includes('hotel-mall-metro'), 'legacy tunnel geometry is not rerouted');
  assert.ok(networks.some(n => n.boundary.some(e => Math.abs(e.x1 - e.x0) > .1 && Math.abs(e.z1 - e.z0) > .1)),
    'at least one real diagonal boundary must survive');
});

test('rendered slabs match surveyed navigation polygons at diagonal sides and turns without bounding-box fill', () => {
  let samples = 0, supportedSamples = 0, emptySamples = 0;
  for (const network of networks) {
    const built = geometry(network);
    const floor = built.group.children.filter(m => m.name === (network.below ? 'concrete' : 'stone'));
    const source = network.paths.flatMap(p => p.slab.pieces), outlines = source.flatMap(p => [p.outer, ...(p.holes || [])]);
    const bounds = polyBounds(source.flatMap(p => p.outer));
    for (let x = bounds.x0 + .43; x < bounds.x1; x += .83) for (let z = bounds.z0 + .37; z < bounds.z1; z += .89) {
      const q = [x, z];
      if (outlines.some(p => distToPolyEdge(q, p) < .22)) continue;
      const expected = source.some(p => pointInPoly(q, p.outer) && !(p.holes || []).some(h => pointInPoly(q, h)));
      const hits = new THREE.Raycaster(new THREE.Vector3(x, network.y + .1, z), new THREE.Vector3(0, -1, 0), 0, .7)
        .intersectObjects(floor, false);
      assert.equal(hits.length > 0, expected, `${network.paths[0].id} ${x.toFixed(2)},${z.toFixed(2)}: wrong slab footprint`);
      samples++; expected ? supportedSamples++ : emptySamples++;
    }
    built.dispose();
  }
  assert.ok(samples > 1500); assert.ok(supportedSamples > 500); assert.ok(emptySamples > 500);
});

test('actual bridge/tunnel meshes preserve two-way body clearance through endpoints, kinks and merged junctions', () => {
  let probes = 0, walls = 0;
  for (const network of networks) {
    const built = geometry(network);
    for (const path of network.paths) for (let index = 1; index < path.points.length; index++) {
      const a = path.points[index - 1], b = path.points[index], dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
      const nx = -dz / length, nz = dx / length;
      for (const side of [-.32, 0, .32]) for (const height of [.2, .6, 1.62, 2.4]) for (const reverse of [false, true]) {
        const first = reverse ? b : a, last = reverse ? a : b;
        const from = new THREE.Vector3(first[0] + nx * side, network.y + height, first[2] + nz * side);
        const to = new THREE.Vector3(last[0] + nx * side, network.y + height, last[2] + nz * side);
        const direction = to.clone().sub(from).normalize();
        from.addScaledVector(direction, -.35);
        const hits = new THREE.Raycaster(from, direction, .001, length + .7).intersectObjects(built.group.children, false);
        assert.equal(hits.length, 0, `${path.id} segment${index} side${side} h${height} ${reverse ? 'back' : 'out'}: blocked by ${hits[0]?.object.name}`);
        probes++;
      }
    }
    const edge = network.boundary.find(e => Math.hypot(e.x1 - e.x0, e.z1 - e.z0) > 2);
    if (edge) {
      const dx = edge.x1 - edge.x0, dz = edge.z1 - edge.z0, length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length;
      const middle = new THREE.Vector3((edge.x0 + edge.x1) / 2, network.y + 1.62, (edge.z0 + edge.z1) / 2);
      const hits = new THREE.Raycaster(middle.clone().add(new THREE.Vector3(nx, 0, nz)), new THREE.Vector3(-nx, 0, -nz), 0, 2)
        .intersectObjects(built.group.children, false);
      assert.ok(hits.length > 0, `${network.paths[0].id} must keep real perimeter glazing/walls`); walls++;
    }
    built.dispose();
  }
  assert.ok(probes > 300); assert.equal(walls, networks.length);
});

test('connection groups belong to source shells and never float between exploded or cut endpoint floors', () => {
  const levels = Object.fromEntries(layout.levels.map(lv => [lv.id, { lv, shell: new THREE.Group() }]));
  const ctx = { layout, levels, mats: { base: materials }, hospitality: {}, dynamic: [], camera: { position: { y: 20 } } };
  const records = buildExpansionConnections(ctx);
  for (const record of records) assert.equal(record.group.parent, levels[record.level].shell);
  const culture = records.find(n => n.paths.some(p => p.id === 'P1-ART-C-RETURN'));
  assert.equal(expansionConnectionVisible(culture, {}, levels), true);
  assert.equal(expansionConnectionVisible(culture, { exploded: true, building: 'P1C' }, levels), false);
  assert.equal(expansionConnectionVisible(culture, { building: 'P1C', focus: 'P1C-1F' }, levels), false);
  assert.equal(expansionConnectionVisible(culture, { building: 'P1', focus: 'P1-1F' }, levels), false);
  assert.equal(expansionConnectionVisible(culture, { building: 'P1C', focus: 'P1C-2F' }, levels), true);
  assert.equal(expansionConnectionVisible(culture, { explore: { level: 'P1-B1M', under: true } }, levels), false);
  for (const callback of ctx.dynamic) callback.update(0, 0, { state: { exploded: true } });
  assert.ok(records.every(record => !record.group.visible));
  for (const record of records) record.group.traverse(o => o.geometry?.dispose());
});
