import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Batcher, BatchSet, SignBatch } from '../src/render/batch.js';

const material = new THREE.MeshBasicMaterial();
function fixture() {
  const b = new Batcher(null, true);
  b.box(2, 3, 4, 5, 6, 7, '#8194a5', .27);
  b.cyl(-3, 0, 2, .8, 4, '#c8ad91', 8);
  return b;
}
for (const fallback of [false, true]) {
  test(`consuming a batch preserves vertices, UVs and bounds (${fallback ? 'legacy copy' : 'buffer transfer'})`, () => {
    const b = fixture(), snapshot = b.mesh(material);
    const buffers = ['pos','nor','col','uv'].map(k => b[k].buffer);
    const transferSupported = typeof buffers[0].transferToFixedLength === 'function';
    if (fallback) for (const buffer of buffers) buffer.transferToFixedLength = undefined;
    const mesh = b.mesh(material, {consume:true});
    for (const [key,a] of Object.entries(snapshot.geometry.attributes)) {
      const actual = mesh.geometry.attributes[key];
      assert.deepEqual(actual.array, a.array);
      assert.equal(actual.normalized, a.normalized);
      assert.equal(actual.array.byteLength, actual.array.buffer.byteLength, 'no unused capacity retained');
    }
    assert.deepEqual(mesh.geometry.boundingBox, snapshot.geometry.boundingBox);
    assert.deepEqual(mesh.geometry.boundingSphere, snapshot.geometry.boundingSphere);
    if (!fallback && transferSupported) for (const buffer of buffers) assert.equal(buffer.byteLength,0);
    const preserved = mesh.geometry.attributes.position.array.slice();
    b.box(100, 0, 0, 1, 1, 1, 'red');
    assert.deepEqual(mesh.geometry.attributes.position.array, preserved, 'subsequent writes cannot mutate the flushed mesh');
    assert.equal(b.mesh(material).geometry.attributes.position.count,36);
    assert.equal(snapshot.geometry.attributes.position.count,mesh.geometry.attributes.position.count);
  });
}

test('consecutive material/sign flushes keep only new geometry and preserve direct snapshots', () => {
  const direct = fixture(), original = direct.mesh(material);
  direct.box(10, 0, 0, 1, 1, 1, 'red');
  assert.equal(direct.mesh(material).geometry.attributes.position.count, original.geometry.attributes.position.count + 36);
  const group = new THREE.Group(), batch = new BatchSet({base:material});
  batch.get('base').box(0,0,0,1,1,1,'white'); batch.flush(group);
  batch.get('base').box(3,0,0,1,1,1,'white'); batch.flush(group);
  assert.deepEqual(group.children.map(m=>m.geometry.attributes.position.count),[36,36]);
  const signs = new SignBatch(), signGroup = new THREE.Group();
  signs.place(0,0,0,2,1,'N',[0,0,1,1]); signs.flush(signGroup,material);
  signs.place(3,0,0,2,1,'N',[0,0,1,1]); signs.flush(signGroup,material);
  assert.deepEqual(signGroup.children.map(m=>m.geometry.attributes.position.count),[6,6]);
});
