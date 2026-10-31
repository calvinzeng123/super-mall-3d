import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, onSlab } from './helpers.js';
import { toW, rect, rectPoly } from '../src/layout/geom.js';
import { mallStairPlan } from '../src/layout/mall-stairs.js';
import { levelPaths, polyline } from '../src/render/paths.js';
import { createPeopleSupport } from '../src/render/people-support.js';

const paths = levelPaths(L);
function samples(path, count = 80) {
  const line = polyline(path.pts, path.loop), point = [0, 0, 0], direction = [0, 0, 1], result = [];
  for (let i = 0; i <= count; i++) {
    line.at(line.total * i / count, point, direction);
    const length = Math.hypot(direction[0], direction[2]) || 1;
    for (const lateral of [-1.1, 0, 1.1]) result.push([
      point[0] - direction[2] / length * lateral, point[2] + direction[0] / length * lateral,
    ]);
  }
  return result;
}

test('all served metro stair openings hide flat-floor walkers but retain entry landings and nearby concourse', () => {
  for (const id of ['M-B1', 'M-B2', 'M-B3', 'M-B4']) {
    const lv = lvl(id), support = createPeopleSupport(lv), centerOnly = createPeopleSupport(lv, [], 0);
    for (const stair of L.stairs.filter(s => s.building === 'M' && s.serves.includes(id))) {
      const plan = mallStairPlan(stair);
      const center = toW(stair.frame, ...plan.point(plan.span / 2, plan.depth / 2));
      assert.equal(support(...center), false, `${stair.id}/${id}: suspended over shaft`);
      const landing = toW(stair.frame, ...plan.point(plan.span / 2, .65));
      assert.equal(support(...landing), true, `${stair.id}/${id}: solid landing vanished`);
      const lip = toW(stair.frame, ...plan.point(plan.span / 2, plan.start + .03 - .1));
      assert.equal(centerOnly(...lip), true);
      assert.equal(support(...lip), false, 'body margin must not overhang a stair opening');
    }
  }
  const support = createPeopleSupport(lvl('M-B1'));
  for (const x of [-55, -40, 0, 40, 55]) assert.equal(support(x, -8), true);
  // These existing gate routes are the screenshot regression: each crosses a
  // new shaft, yet supported sections of the same route must remain populated.
  for (const path of [{pts:[[-30,-4.43,0],[-5,-4.43,0]],loop:false}]) {
    const visible = samples(path).map(p => support(...p));
    assert.ok(visible.some(Boolean));
    assert.ok(visible.some(v => !v));
  }
});

test('mall atrium holes and exterior edges hide walkers while solid ground and upper circulation remain', () => {
  for (const building of L.buildings.filter(b => b.kind === 'mall')) {
    const level = lvl(`${building.id}-2F`), support = createPeopleSupport(level);
    for (const rotunda of building.rotundas) {
      assert.equal(support(rotunda.x, rotunda.z), false, `${building.id}: atrium unsupported`);
      const ring = paths[level.id].people.find(p => p.name === '圆厅回游线');
      assert.ok(samples(ring).some(p => support(...p)), `${level.id}: ring crowd lost`);
    }
    assert.equal(support(5000, 5000), false);
    const ground = lvl(`${building.id}-1F`), groundSupport = createPeopleSupport(ground);
    const normal = paths[ground.id].people.filter(p => !p.escalator).flatMap(p => samples(p));
    assert.ok(normal.filter(p => groundSupport(...p)).length > normal.length / 2, `${ground.id}: normal ground crowd lost`);
  }
});

test('slab-piece holes, global shaft voids and actual lateral offsets are independently respected', () => {
  const hole = rectPoly(rect(4, 4, 6, 6));
  const level = { slab: { pieces: [{ outer: rectPoly(rect(0, 0, 10, 10)), holes: [hole] }] },
    voids: [{ kind: 'shaft', poly: rectPoly(rect(7, 7, 9, 9)) }] };
  const support = createPeopleSupport(level);
  assert.equal(support(5, 5), false);
  assert.equal(support(8, 8), false);
  assert.equal(support(3.5, 5), true);
  assert.equal(support(3.5 + 1.1, 5), false, 'laterally shifted walker lands inside the hole');
  assert.equal(support(.1, 2), false, 'body margin must remain on the outer edge');
  assert.equal(support(.3, 2), true);
  const linked = createPeopleSupport(level, [{ outer: rectPoly(rect(10, 1, 14, 3)), holes: [] }]);
  assert.equal(linked(12, 2), true, 'real connected path slabs remain supported');
  assert.equal(linked(10, 2), true, 'adjacent floor pieces support a body crossing their seam');
});

test('all populated levels retain normal path coverage and original escalator paths bypass flat-floor filtering', () => {
  let bypassed = 0;
  for (const level of L.levels) {
    const levelPaths = paths[level.id]?.people || [];
    if (!levelPaths.length) continue;
    const support = createPeopleSupport(level);
    const normal = levelPaths.filter(p => !p.escalator).flatMap(p => samples(p, 24));
    if (normal.length) {
      const visible = normal.filter(p => support(...p));
      assert.ok(visible.length > normal.length / 4, `${level.id}: normal crowd was filtered away`);
      assert.ok(visible.every(p => onSlab(level, p)), `${level.id}: visible actor lacks its own floor`);
    }
    for (const path of levelPaths.filter(p => p.escalator)) for (const p of samples(path, 12)) {
      assert.equal(support(...p, true), true, `${level.id}: original escalator passenger removed`);
      if (!support(...p)) bypassed++;
    }
  }
  assert.ok(bypassed > 0, 'test must cover actual escalator positions over slots or beyond their lower floor');
});

test('rendered walkers resume after crossing an opening and low density retains supported people', async t => {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { buildPeople } = await import('../src/render/build/people.js');
  const imported = [];
  // Replace model parsing only: this test runs the real crowd placement,
  // instance compaction, density switch and animation clock without a GPU.
  t.mock.method(GLTFLoader.prototype, 'parseAsync', async () => {
    const geometry = new THREE.BoxGeometry(.3, 1.7, .3);
    geometry.morphAttributes.position = Array.from({ length: 8 }, () => geometry.attributes.position.clone());
    const material = new THREE.MeshStandardMaterial(), scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, material)); imported.push({ geometry, material });
    return { scene };
  });
  const level = lvl('M-B1'), people = new THREE.Group(), support = createPeopleSupport(level);
  const route = {pts:[[-30,-4.43,0],[-5,-4.43,0]],loop:false,name:'opening regression'};
  const ctx = {
    layout: { levels: [level] }, paths: { levels: { [level.id]: { people: [route] } } },
    levels: { [level.id]: { people, offset: 0 } }, camera: { position: new THREE.Vector3(-45, -3, 0) },
    renderer: { capabilities: { getMaxAnisotropy: () => 1 } }, dynamic: [], quality: { crowdDensity: 1 },
  };
  await buildPeople(ctx);
  const matrix = new THREE.Matrix4();
  const rendered = () => {
    const ids = new Set();
    for (const mesh of people.children) for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      assert.ok(support(matrix.elements[12], matrix.elements[14]), 'rendered person is over a real opening');
      // Each actor keeps its seeded scale and model when instance slots compact.
      ids.add(`${mesh.name}/${matrix.elements[5]}`);
    }
    return ids;
  };
  try {
    const initial = rendered();
    assert.ok(initial.size > 0 && initial.size < ctx.peopleQuality.stats.capacity);
    let resumed = false;
    for (let tick = 1; tick <= 200; tick++) {
      ctx.dynamic[0].update(.05, tick * .05);
      for (const id of rendered()) if (!initial.has(id)) resumed = true;
    }
    assert.ok(resumed, 'actors hidden over the opening must keep moving and reappear on the other side');
    ctx.peopleQuality.setDensity(.22);
    assert.ok(rendered().size > 0, 'mobile low density still shows normal supported walkers');
  } finally {
    for (const mesh of people.children) { mesh.morphTexture?.dispose(); mesh.dispose(); }
    for (const { geometry, material } of imported) { geometry.dispose(); material.dispose(); }
  }
});
