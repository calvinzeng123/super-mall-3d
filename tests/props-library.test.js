// 贴图小模型：素材包的完整性和出处、摆放接口、分块与细节范围、没有模型库时退回程序化几何。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { BatchSet, usePropLibrary, getPropLibrary, frameMatrix } from '../src/render/batch.js';
import { PROP_ASSETS, PROP_PACK } from '../src/render/props/prop-data.js';
import { chunkPlacements, propRange, PROP_DETAIL, PROP_CELL } from '../src/render/props/library.js';
import { PROP_CATALOG } from '../scripts/props/catalog.mjs';
import { packProps } from '../scripts/props/pack.mjs';
import { tableSet, roundTable, planter, streetLamp, addTrees } from '../src/render/build/props.js';
import { crownGeometry, coneCrownGeometry } from '../src/render/build/tree-kit.js';
import { uniformRegion } from '../src/arcade/guard-uniform.js';
import { frame } from '../src/layout/geom.js';

const manifest = JSON.parse(readFileSync('assets/models/props/manifest.json', 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const materials = () => Object.fromEntries(['matte', 'metal', 'ext', 'extMetal', 'glow', 'foliage', 'satin', 'stone'].map((k) => [k, new THREE.MeshBasicMaterial()]));
/** 假的模型库：什么模型都有，只把交过来的摆放记录收下。 */
const fakeLibrary = (known = null) => {
  const batches = [];
  return { batches, has: (id) => !known || known.includes(id), instantiate: (group, placed) => batches.push({ group, placed }),
    resources: () => ({ geometries: new Set(), materials: new Set(), textures: new Set() }) };
};
const vertices = (B) => Object.values(B.sets).reduce((n, b) => n + b.n, 0);

test('every catalogue entry has a model file, a far level of detail and a provenance record', () => {
  assert.equal(PROP_PACK, null, 'the dev catalogue points at files; only the builds pack them');
  assert.equal(PROP_ASSETS.length, PROP_CATALOG.length);
  assert.equal(manifest.props.length, PROP_CATALOG.length);
  assert.equal(new Set(PROP_ASSETS.map((p) => p.id)).size, PROP_ASSETS.length, 'ids are unique');
  assert.equal(manifest.license, 'CC0-1.0');
  for (const [i, record] of manifest.props.entries()) {
    const asset = PROP_ASSETS[i], entry = PROP_CATALOG[i];
    assert.equal(record.id, entry.id); assert.equal(asset.id, entry.id);
    for (const [file, meta] of [[record.file, record], [record.lod.file, record.lod]]) {
      const bytes = readFileSync(`assets/models/props/${file}`);
      assert.equal(bytes.length, meta.bytes, `${file} size`);
      assert.equal(sha256(bytes), meta.sha256, `${file} hash`);
      assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${file} is a GLB`);
      assert.equal(bytes.readUInt32LE(8), bytes.length, `${file} is complete`);
    }
    assert.equal(asset.bytes, record.bytes + record.lod.bytes);
    assert.equal(record.source.license, 'CC0-1.0', `${record.id} licence`);
    assert.equal(record.source.url, `https://polyhaven.com/a/${entry.src}`);
    assert.ok(record.source.authors.length > 0, `${record.id} has authors`);
    assert.ok(record.source.files.every((f) => /^https:\/\/dl\.polyhaven\.org\//.test(f.url) && /^[0-9a-f]{32}$/.test(f.md5)), `${record.id} source files`);
    assert.ok(asset.size.every((v) => v > 0.01 && v < 5), `${record.id} size ${asset.size}`);
  }
});

test('the pack stays inside the download and triangle budgets', () => {
  const total = manifest.props.reduce((n, p) => n + p.bytes + p.lod.bytes, 0);
  assert.equal(total, manifest.totalBytes);
  // 单文件版内嵌整包（base64 再大三分之一）；整包控制在 6 MiB 以内
  assert.ok(total < 6 * 1024 * 1024, `${(total / 1048576).toFixed(2)} MiB`);
  for (const p of manifest.props) {
    assert.ok(p.triangles <= 4000, `${p.id} near ${p.triangles}`);
    assert.ok(p.lod.triangles <= 320, `${p.id} far ${p.lod.triangles}`);
    assert.ok(p.lod.triangles <= p.triangles, `${p.id} far is not heavier than near`);
    assert.ok(p.texture.size <= 1024 && p.texture.format === 'webp');
  }
  // 成百上千摆放的那几种要特别省
  for (const id of ['shell_chair', 'dining_chair', 'cafe_table', 'plant_fern', 'plant_calathea', 'plant_anthurium']) {
    const p = manifest.props.find((x) => x.id === id);
    assert.ok(p.triangles <= 720 && p.lod.triangles <= 250, `${id} ${p.triangles}/${p.lod.triangles}`);
  }
});

test('the published builds pack every model into one file with exact offsets', async () => {
  const { bytes, assets } = await packProps();
  assert.equal(assets.length, PROP_ASSETS.length);
  let cursor = 0;
  for (const [i, a] of assets.entries()) {
    assert.equal(a.url, undefined);
    assert.equal(a.offset, cursor); assert.equal(a.lodOffset, a.offset + a.length);
    cursor = a.lodOffset + a.lodLength;
    const record = manifest.props[i];
    assert.equal(sha256(bytes.subarray(a.offset, a.offset + a.length)), record.sha256);
    assert.equal(sha256(bytes.subarray(a.lodOffset, a.lodOffset + a.lodLength)), record.lod.sha256);
  }
  assert.equal(cursor, bytes.length);
});

test('the single-file builds stay under the 100 MB per-file limit of the Git host', { skip: !existsSync('dist/mall.html') }, () => {
  for (const file of ['dist/mall.html', 'dist/artifact.html']) assert.ok(statSync(file).size < 95e6, `${file} ${(statSync(file).size / 1e6).toFixed(1)} MB`);
});

test('without a model library BatchSet.prop() declines and the furniture is procedural', () => {
  usePropLibrary(null);
  assert.equal(getPropLibrary(), null);
  const B = new BatchSet(materials());
  assert.equal(B.hasProp('cafe_table'), false);
  assert.equal(B.prop('cafe_table', 0, 0, 0), false);
  tableSet(B, 0, 0, 0, 0); roundTable(B, 4, 0, 0, 4); planter(B, 0, 0, 3, 1.5); streetLamp(B, 9, 9);
  assert.ok(vertices(B) > 1500, 'boxes, cylinders and foliage blobs were pushed');
  assert.equal(B.placed, undefined);
  const group = new THREE.Group();
  const trees = addTrees(group, {}, [{ x: 0, y: 0, z: 0, kind: 'round' }, { x: 5, y: 0, z: 0, kind: 'cone' }]);
  assert.equal(trees.crowns.material.map, null, 'the polyhedron tree has no texture');
  assert.equal(trees.crowns.geometry.attributes.position.count, new THREE.IcosahedronGeometry(1, 1).attributes.position.count);
});

test('with a model library the shared furniture helpers place models instead of boxes', () => {
  const library = fakeLibrary();
  usePropLibrary(library);
  try {
    const B = new BatchSet(materials());
    tableSet(B, 10, 2, -4, Math.PI / 2, { chair: '#c0392b' });
    assert.deepEqual(B.placed.map((p) => p.id), ['cafe_table', 'shell_chair', 'shell_chair', 'shell_chair', 'shell_chair']);
    assert.ok(B.placed.slice(1).every((p) => p.color === '#c0392b' && !p.outdoor), 'shell chairs take the stall colour');
    assert.equal(vertices(B), 0, 'no procedural table or chairs');
    // 四把椅子都朝向桌子：椅子正面（+Z）转到世界坐标后指向桌心
    for (const p of B.placed.slice(1)) {
      const m = new THREE.Matrix4().fromArray(p.m), at = new THREE.Vector3().setFromMatrixPosition(m);
      const front = new THREE.Vector3(0, 0, 1).transformDirection(m), toTable = new THREE.Vector3(10 - at.x, 0, -4 - at.z).normalize();
      assert.ok(front.dot(toTable) > 0.85, `chair at ${at.x.toFixed(2)},${at.z.toFixed(2)} faces the table`);
      assert.ok(Math.abs(at.y - 2) < 1e-6);
    }
    const ext = new BatchSet(materials());
    tableSet(ext, 0, 0, 0, 0, {}, 'ext'); roundTable(ext, 5, 0, 5, 3);
    assert.deepEqual(ext.placed.map((p) => p.id), ['cafe_table', ...Array(4).fill('outdoor_chair'), 'outdoor_table', ...Array(3).fill('outdoor_chair')]);
    const bed = new BatchSet(materials());
    planter(bed, 0, 0, 6, 3, 0, 5, true);
    assert.ok(bed.placed.length >= 5 && bed.placed.every((p) => /^(plant_|flower_)/.test(p.id)), 'real plants in the bed');
    assert.ok(vertices(bed) > 0 && !bed.sets.foliage, 'the stone edging stays, the foliage blobs are gone');
    for (const p of bed.placed) { const at = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(p.m)); assert.ok(at.x > 0 && at.x < 6 && at.z > 0 && at.z < 3, 'inside the bed'); }
    // flush 把摆放记录交给模型库，交完清空
    const group = new THREE.Group();
    bed.flush(group);
    assert.equal(library.batches.at(-1).group, group);
    assert.equal(bed.placed, null);
  } finally { usePropLibrary(null); }
});

test('prop placements honour the batch frame, the outdoor default and unknown ids', () => {
  usePropLibrary(fakeLibrary(['armchair']));
  try {
    const B = new BatchSet(materials());
    assert.equal(B.prop('no_such_model', 0, 0, 0), false);
    const F = frame(100, -50, 90);
    B.frame(F, () => B.prop('armchair', 2, 1, 3, 0.4, [1, 2, 3]));
    const expected = frameMatrix(F).multiply(new THREE.Matrix4().compose(new THREE.Vector3(2, 1, 3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4), new THREE.Vector3(1, 2, 3)));
    for (const [i, v] of expected.toArray().entries()) assert.ok(Math.abs(v - B.placed[0].m[i]) < 1e-9, `matrix[${i}]`);
    assert.equal(B.placed[0].outdoor, false);
    B.outdoor = true;
    B.prop('armchair', 0, 0, 0);
    B.prop('armchair', 0, 0, 0, 0, 1, { outdoor: false });
    assert.deepEqual(B.placed.slice(1).map((p) => p.outdoor), [true, false]);
  } finally { usePropLibrary(null); }
});

test('placements are chunked by model, indoor or outdoor and a 12 m grid cell', () => {
  const at = (id, x, z, outdoor = false) => ({ id, outdoor, m: new THREE.Matrix4().makeTranslation(x, 0, z).toArray() });
  const lots = chunkPlacements([at('a', 1, 1), at('a', 11, 11), at('a', 13, 1), at('a', -1, 1), at('b', 1, 1), at('a', 2, 2, true)]);
  assert.equal(PROP_CELL, 12);
  assert.deepEqual([...lots.values()].map((l) => l.length).sort(), [1, 1, 1, 1, 2]);
  assert.equal(lots.get('a|0|0|0').length, 2);
  assert.ok(lots.has('a|0|1|0') && lots.has('a|0|-1|0') && lots.has('b|0|0|0') && lots.has('a|1|0|0'));
});

test('detail ranges shrink with the quality tier and grow with the size of the model', () => {
  const chair = [0.6, 1, 0.7], apple = [0.1, 0.09, 0.1], lamp = [0.7, 3.87, 0.39];
  for (const tier of ['low', 'balanced', 'high']) {
    const d = PROP_DETAIL[tier];
    assert.equal(propRange(apple, d), d.floor, 'small things use the floor');
    assert.ok(propRange(chair, d) < propRange(lamp, d));
    assert.ok(propRange(lamp, d) <= d.ceiling);
    assert.ok(d.near < propRange(apple, d), 'the near range is inside every far range');
  }
  assert.ok(PROP_DETAIL.low.near < PROP_DETAIL.balanced.near && PROP_DETAIL.balanced.near < PROP_DETAIL.high.near);
  assert.ok(propRange(chair, PROP_DETAIL.low) < propRange(chair, PROP_DETAIL.high));
});

test('tree crowns are light, bounded and shade as one volume', () => {
  const crown = crownGeometry(), cone = coneCrownGeometry();
  assert.ok(crown.index.count / 3 <= 70, `${crown.index.count / 3} triangles`);
  assert.ok(cone.index.count / 3 <= 80);
  assert.ok(crown.boundingSphere.radius < 1.75 && crown.boundingSphere.radius > 0.9);
  assert.ok(cone.boundingBox.min.y >= 0 && cone.boundingBox.max.y < 2.4);
  const n = crown.attributes.normal, p = crown.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    a.fromBufferAttribute(n, i); b.fromBufferAttribute(p, i).normalize();
    assert.ok(Math.abs(a.length() - 1) < 1e-4 && a.dot(b) > 0.999, 'normals point away from the crown centre');
  }
  const uv = crown.attributes.uv;
  for (let i = 0; i < uv.count; i++) assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1);
});

test('the guard uniform covers shoes, long trousers and shirt but not the head, forearms or hands', () => {
  assert.equal(uniformRegion(0.1, 0.03), 'shoes');
  assert.equal(uniformRegion(0.12, 0.4), 'trousers');
  assert.equal(uniformRegion(-0.15, 0.95), 'trousers');
  assert.equal(uniformRegion(0.27, 0.85), null, 'a hand hanging beside the hip');
  assert.equal(uniformRegion(0.19, 0.8), null, 'the wrist');
  assert.equal(uniformRegion(0, 1.3), 'shirt');
  assert.equal(uniformRegion(0.26, 1.3), 'shirt', 'the sleeve');
  assert.equal(uniformRegion(0.27, 1.08), null, 'the forearm');
  assert.equal(uniformRegion(0, 1.62), null, 'the head');
  // 别的身高按比例
  assert.equal(uniformRegion(0.1, 0.5 * 1.69 / 1.8, 1.69), 'trousers');
});
