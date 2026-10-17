import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFacadeMaterials, FACADE_SURFACES } from '../src/render/facade-materials.js';
import { BatchSet } from '../src/render/batch.js';
import { contextFacadeSpec, buildContextBuildings } from '../src/render/build/context-buildings.js';
import { buildLayout } from '../src/layout/layout.js';

function library() {
  const surfaces = Object.fromEntries(Object.values(FACADE_SURFACES).map(({ id }) => [id,
    { id, sourceUrl: `https://polyhaven.com/a/${id}`, maps: Object.fromEntries(['color', 'normal', 'roughness'].map(k => [k, new THREE.Texture()])) }]));
  const hooks = [], base = createFacadeMaterials(surfaces, fn => hooks.push(fn));
  base.ext = new THREE.MeshStandardMaterial({ vertexColors: true });
  return { surfaces, base, hooks };
}

test('exterior finishes reuse local image objects and retain physical roughness without illuminating walls', () => {
  const { base, surfaces, hooks } = library();
  for (const [key, spec] of Object.entries(FACADE_SURFACES)) {
    assert.equal(base[key].map, surfaces[spec.id].maps.color);
    assert.equal(base[key].normalMap, surfaces[spec.id].maps.normal);
    assert.equal(base[key].roughnessMap, surfaces[spec.id].maps.roughness);
    assert.equal(base[key].roughness, spec.roughness);
    assert.equal(base[key].transparent, false);
    assert.equal(base[key].emissive.getHex(), 0);
  }
  assert.equal(base.facadeFrame.map, null);
  assert.equal(base.facadeFrame.normalMap, null);
  assert.equal(base.facadeFrame.roughnessMap, surfaces.concrete_pavement_02.maps.roughness);
  hooks.forEach(fn => fn(1));
  assert.equal(base.facadeWindowLit.emissiveIntensity, 0.65);
  assert.equal(base.facadeStone.emissive.getHex(), 0);
  assert.equal(base.facadeWindow.transparent, false, 'distant panes must not add transparency sorting');
});

test('roughness-only aluminium batches get metre-scale UVs on both vertical and horizontal faces', () => {
  const { base } = library(), B = new BatchSet(base);
  B.get('facadeFrame').box(0, 2, 0, 6, 4, 2, '#aaaaaa');
  const group = new THREE.Group(); B.flush(group);
  const uv = group.children[0].geometry.attributes.uv;
  assert.ok(uv, 'roughness-map sampling requires a UV attribute');
  assert.ok(Math.max(...uv.array) > 1, 'UVs must repeat in metres, not stretch 0–1 across a facade');
});

test('all window openings have real sill/head intervals inside the existing building envelope', () => {
  for (const b of buildLayout().site.urban.buildings) {
    const { rows, sides } = contextFacadeSpec(b);
    assert.equal(rows.at(-1).top, b.h);
    for (const row of rows) {
      assert.ok(row.bottom < row.sill && row.sill < row.head && row.head < row.top);
      assert.ok(row.head - row.sill >= 2);
    }
    for (const s of sides) assert.ok(s.width / s.bays > 2);
  }
});

test('context glass is physically inset behind the wall plane and frame, with no full-facade window wallpaper', () => {
  const { base } = library(), site = { group: new THREE.Group() };
  const b = { x: 10, z: 20, w: 30, d: 24, h: 24, tint: 0 };
  const ctx = { mats: { base }, site };
  const stats = buildContextBuildings(ctx, [b]);
  assert.ok(stats.windows > 100);
  const windowMeshes = site.group.children[0].children.filter(m => m.material.name.includes('window') || m.material.name.includes('glass'));
  assert.equal(windowMeshes.length, 2);
  let frontVertices = 0;
  for (const mesh of windowMeshes) {
    assert.equal(mesh.material.map, null);
    const p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      if (n.getZ(i) < 0.9) continue;
      frontVertices++;
      assert.ok(Math.abs(p.getZ(i) - (b.z + b.d / 2 - 0.145)) < 0.0001);
      assert.ok(p.getY(i) > 0 && p.getY(i) < b.h);
    }
  }
  assert.ok(frontVertices > 0);
});

test('all 84 city buildings retain spatial batching within a measured geometry budget', () => {
  const { base } = library(), layout = buildLayout(), before = JSON.stringify(layout.site.urban.buildings);
  const ctx = { mats: { base }, site: { group: new THREE.Group() } };
  const stats = buildContextBuildings(ctx, layout.site.urban.buildings);
  assert.equal(stats.buildings, 84);
  assert.ok(stats.windows > 15000);
  assert.ok(stats.batches <= 128, `${stats.batches} draw batches`);
  assert.ok(stats.bufferBytes < 20 * 1024 * 1024, `${(stats.bufferBytes / 1024 / 1024).toFixed(2)} MiB`);
  assert.equal(JSON.stringify(layout.site.urban.buildings), before, 'no navigation footprint mutation');
  ctx.site.group.traverse(o => {
    if (!o.isMesh) return;
    assert.equal(o.castShadow, false);
    for (const a of Object.values(o.geometry.attributes)) for (const n of a.array) assert.ok(Number.isFinite(n));
  });
});
