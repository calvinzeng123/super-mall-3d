import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLayout } from '../src/layout/layout.js';
import { createFloorDetailSelector, createFloorDetailCache } from '../src/render/floor-detail-streaming.js';
import { buildOwnedFloorDetail, sceneResources } from '../src/render/floor-detail-scene.js';

function campus() {
  const buildings = [{ id: 'P1', kind: 'mall' }, { id: 'P1C', kind: 'annex' }, { id: 'H', kind: 'tower' }];
  const levels = buildings.flatMap(b => ['B1', '1F', '2F', '3F', '4F', '5F', '6F', 'RF'].map((short, i) =>
    ({ id: `${b.id}-${short}`, building: b.id, short, elev: i * 5 - 5, kind: i === 0 ? 'parking' : short === 'RF' ? 'roof' : 'retail' })));
  return { buildings, levels, stairs: [], elevators: [{ serves: levels.filter(l => l.building === 'P1').map(l => l.id) }], escalators: [],
    entrances: [{ level: 'P1-2F', to: 'P1C-2F' }], extensions: { connections: [{ from: 'P1C-2F', to: 'H-2F' }] } };
}

test('campus/building overview allocates no interiors; floor focus preloads adjacent storeys without distant bridge ends', () => {
  const selector = createFloorDetailSelector(campus());
  assert.equal(selector.eligible.size, 12);
  assert.deepEqual([...selector.select({})], []);
  assert.deepEqual([...selector.select({ building: 'P1' })], []);
  assert.deepEqual(new Set(selector.select({ building: 'P1', focus: 'P1-2F' })),
    new Set(['P1-2F', 'P1-1F', 'P1-3F']));
  assert.deepEqual([...selector.select({ focus: 'P1-B1' })], ['P1-1F']);
  assert.deepEqual([...selector.select({ focus: 'P1-RF' })], ['P1-6F']);
  assert.equal(selector.select({ building: 'P1', exploded: true }).size, 6);
});

test('walking and elevator journeys preload destinations without recursively constructing the entire mall or tower', () => {
  const selector = createFloorDetailSelector(campus());
  assert.deepEqual(new Set(selector.select({ explore: { level: 'site', near: 'P1C' } })),
    new Set(['P1C-1F', 'P1C-2F']));
  const ids = selector.select({ explore: { level: 'P1-1F', elevator: { from: 'P1-1F', to: 'P1-6F' } } });
  assert.deepEqual(ids, new Set(['P1-1F', 'P1-6F', 'P1-2F', 'P1-5F']));
  assert.ok(!ids.has('P1-3F'));
  assert.ok(![...selector.select({ explore: { level: 'H-2F' } })].some(id => id.startsWith('H-')));
});

test('mobile exploded view keeps four detailed floors and refocuses that window when another floor is selected', () => {
  const selector = createFloorDetailSelector(campus(), { explodedLimit: 4 });
  assert.deepEqual(selector.select({ exploded: true }), new Set());
  assert.deepEqual(selector.select({ building: 'P1', exploded: true }), new Set(['P1-1F', 'P1-2F', 'P1-3F', 'P1-4F']));
  const top = selector.select({ building: 'P1', exploded: true, focus: 'P1-6F' });
  assert.deepEqual(top, new Set(['P1-6F', 'P1-5F', 'P1-4F', 'P1-3F']));
  const cache = createFloorDetailCache({ limit: 4, build: id => ({ id, dispose() {} }) });
  cache.sync(selector.select({ building: 'P1', exploded: true }));
  cache.sync(top); assert.equal(cache.stats.resident.length, 4);
});

test('mobile cache hard limit bounds actual builds even if a future caller requests too many floors', () => {
  const built = new Set(); let live = 0, peak = 0;
  const cache = createFloorDetailCache({ limit: 4, hardLimit: 4, build(id) {
    built.add(id); peak = Math.max(peak, ++live); return { dispose() { live--; } };
  } });
  cache.sync(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(built, new Set(['a', 'b', 'c', 'd'])); assert.equal(cache.records.length, 4);
  cache.sync(['e', 'f', 'g', 'h', 'i', 'j']);
  assert.equal(live, 4); assert.equal(peak, 4); assert.equal(cache.records.length, 4);
});

test('long elevator rides retain the current three-storey window and explicit arrival with at most four actual residents', () => {
  const layout = campus(), selector = createFloorDetailSelector(layout, { limit: 4, explodedLimit: 4 });
  const counts = new Map();
  const cache = createFloorDetailCache({ limit: 4, hardLimit: 4, build(id) {
    counts.set(id, (counts.get(id) || 0) + 1); return { dispose() {} };
  } });
  for (let floor = 1; floor <= 6; floor++) {
    const wanted = selector.select({ explore: { level: `P1-${floor}F`, elevator: { from: 'P1-1F', to: 'P1-6F' } } });
    assert.ok(wanted.has(`P1-${floor}F`)); assert.ok(wanted.has('P1-6F'));
    if (floor > 1) assert.ok(wanted.has(`P1-${floor - 1}F`));
    if (floor < 6) assert.ok(wanted.has(`P1-${floor + 1}F`));
    assert.ok(wanted.size <= 4); cache.sync(wanted); assert.ok(cache.records.length <= 4);
  }
  assert.equal(counts.get('P1-6F'), 1, 'arrival geometry stays resident from initial preload through landing');
});

test('all surveyed art bridges preload their destination before its portal and retain both ends during handoff', () => {
  const layout = buildLayout(), paths = layout.extensions.paths.filter(path => path.expansion && path.kind === 'skybridge');
  const cache = createFloorDetailCache({ limit: 4, hardLimit: 4, build: id => ({ id, dispose() {} }) });
  let probes = 0;
  for (const path of paths) {
    const selector = createFloorDetailSelector(layout, { limit: 4, explodedLimit: 4 });
    for (let index = 1; index < path.points.length; index++) {
      const a = path.points[index - 1], b = path.points[index], dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.ceil(length / 3));
      for (let step = 0; step <= steps; step++) {
        const t = step / steps, position = { x: a[0] + dx * t, z: a[2] + dz * t };
        const wanted = selector.select({ explore: { level: path.level, position } });
        assert.ok(wanted.has(path.level)); assert.ok(wanted.size <= 4);
        // At the shared east junction either branch can be selected until a
        // turn is made; the final 3m must always contain the actual destination.
        if (index === path.points.length - 1 && length * (1 - t) <= 3) {
          assert.ok(wanted.has(path.to), `${path.id}: destination missing before doorway`);
        }
        cache.sync(wanted); assert.ok(cache.records.length <= 4); probes++;
      }
    }
    const p = path.points.at(-1), prior = path.points.at(-2), dx = p[0] - prior[0], dz = p[2] - prior[2], length = Math.hypot(dx, dz);
    const after = selector.select({ explore: { level: path.to, position: { x: p[0] + dx / length * .7, z: p[2] + dz / length * .7 } } });
    assert.ok(after.has(path.to)); assert.ok(after.has(path.level), `${path.id}: source disappears on portal handoff`);
    cache.sync(after); assert.ok(cache.records.length <= 4);
  }
  assert.ok(probes > 70);
  const selected = createFloorDetailSelector(layout, { limit: 4 }).select({ building: 'P1', focus: 'P1-2F' });
  assert.deepEqual(selected, new Set(['P1-2F', 'P1-1F', 'P1-3F']));
});

test('cache evicts before building, reuses nearby visits and returns to budget after exploded view', () => {
  const events = [], visibility = new Map();
  const cache = createFloorDetailCache({ limit: 2, build(id) {
    events.push(`build:${id}`);
    return { id, dispose: () => events.push(`dispose:${id}`), setVisible: value => visibility.set(id, value) };
  } });
  cache.sync(['a']); cache.sync(['b']); cache.sync(['a']);
  assert.equal(cache.stats.builds, 2); assert.equal(cache.stats.hits, 1);
  assert.equal(visibility.get('b'), false);
  cache.sync(['c']);
  assert.deepEqual(events.slice(-2), ['dispose:b', 'build:c']);
  cache.sync(['a', 'b', 'c', 'd']);
  assert.equal(cache.stats.resident.length, 4);
  cache.sync([]); assert.equal(cache.stats.resident.length, 2);
  cache.clear(); assert.equal(cache.stats.resident.length, 0);
  assert.equal(cache.stats.disposed, cache.stats.builds);
});

test('failed builds stay dormant across refreshes until explicitly retried', () => {
  let calls = 0, errors = 0;
  const cache = createFloorDetailCache({ build() {
    if (++calls === 1) throw new Error('test failure');
    return { dispose() {} };
  }, onError() { errors++; } });
  cache.sync(['a']); cache.sync(['a']); cache.sync([]); cache.sync(['a']);
  assert.equal(calls, 1); assert.equal(errors, 1); assert.deepEqual(cache.stats.errors, ['a']);
  cache.retry('a'); cache.sync(['a']); assert.equal(calls, 2); assert.ok(cache.has('a'));
});

function sceneFixture() {
  const group = new THREE.Group(), base = new THREE.Group(), people = new THREE.Group(); group.add(base, people);
  const sharedGeometry = new THREE.BoxGeometry(), sharedTexture = new THREE.Texture();
  const sharedMaterial = new THREE.MeshBasicMaterial({ map: sharedTexture });
  group.add(new THREE.Mesh(sharedGeometry, sharedMaterial));
  const mats = { base: { matte: sharedMaterial }, floors: {}, steps: {}, flows: {}, night: .5, nightHooks: [],
    onNight(fn) { this.nightHooks.push(fn); fn(this.night); },
    sign(texture) { const material = new THREE.MeshBasicMaterial({ map: texture }); this.onNight(() => {}); return material; },
    floor() { return this.floors.test ||= new THREE.MeshBasicMaterial(); },
  };
  const lv = { id: 'P1C-1F', building: 'P1C' }, b = { id: 'P1C' };
  const level = { lv, building: b.id, group, base, people };
  const ctx = { mats, levels: { [lv.id]: level }, bById: { [b.id]: b }, buildings: { [b.id]: { levels: [level] } },
    layout: { levels: [lv], buildings: [b] }, atlas: { [lv.id]: { material: sharedMaterial } }, dynamic: [], afterRender: [] };
  return { ctx, level, group, sharedGeometry, sharedMaterial, sharedTexture };
}

test('owned detail eviction releases private geometry, atlas, materials and callbacks but preserves shared resources', () => {
  const f = sceneFixture(), disposed = new Set();
  const watch = (value, key) => { value.addEventListener('dispose', () => disposed.add(key)); return value; };
  watch(f.sharedGeometry, 'sharedGeometry'); watch(f.sharedMaterial, 'sharedMaterial'); watch(f.sharedTexture, 'sharedTexture');
  const record = buildOwnedFloorDetail(f.ctx, f.level, {
    protectedResources: sceneResources([f.group]),
    atlas(mats) { const texture = watch(new THREE.Texture(), 'atlasTexture'); return { texture, material: watch(mats.sign(texture), 'atlasMaterial') }; },
    build(ctx, lv) {
      const L = ctx.levels[lv.id];
      L.base.add(new THREE.Mesh(f.sharedGeometry, f.sharedMaterial));
      L.base.add(new THREE.Mesh(watch(new THREE.BoxGeometry(), 'ownedGeometry'),
        watch(ctx.mats.sign(watch(new THREE.Texture(), 'screenTexture')), 'screenMaterial')));
      L.base.add(new THREE.Mesh(new THREE.BoxGeometry(), watch(ctx.mats.floor(), 'cachedFloorMaterial')));
      L.batch.get('matte').box(0, 0, 0, 1, 1, 1, 'white');
      L.people.add(watch(new THREE.InstancedMesh(f.sharedGeometry, f.sharedMaterial, 2), 'skaterInstanceBuffers'));
      ctx.dynamic.push({ update() {} }); ctx.afterRender.push(() => {});
    },
  });
  assert.equal(f.ctx.mats.nightHooks.length, 2); assert.equal(f.ctx.dynamic.length, 1); assert.equal(f.ctx.afterRender.length, 1);
  assert.ok(record.stats.vertices > 0);
  record.dispose(); record.dispose();
  assert.deepEqual(disposed, new Set(['atlasTexture', 'atlasMaterial', 'ownedGeometry', 'screenTexture', 'screenMaterial', 'skaterInstanceBuffers']));
  assert.equal(f.ctx.mats.nightHooks.length, 0); assert.equal(f.ctx.dynamic.length, 0); assert.equal(f.ctx.afterRender.length, 0);
  assert.equal(f.level.base.children.length, 0); assert.equal(f.level.people.children.length, 0);
  assert.ok(f.sharedGeometry.attributes.position.array);
});

test('a failed floor builder releases its already-created atlas and hooks without touching persistent content', () => {
  const f = sceneFixture(); let disposed = 0;
  assert.throws(() => buildOwnedFloorDetail(f.ctx, f.level, {
    protectedResources: sceneResources([f.group]),
    atlas(mats) { const texture = new THREE.Texture(); texture.addEventListener('dispose', () => disposed++);
      return { texture, material: mats.sign(texture) }; },
    build() { throw new Error('broken fixture'); },
  }), /broken fixture/);
  assert.equal(disposed, 1); assert.equal(f.ctx.mats.nightHooks.length, 0);
  assert.equal(f.level.base.children.length, 0); assert.equal(f.ctx.dynamic.length, 0);
});
