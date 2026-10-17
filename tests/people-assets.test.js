import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = new URL('../assets/models/people/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory)));
function parseGLB(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x46546c67);
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  const length = buffer.readUInt32LE(12);
  return { json: JSON.parse(buffer.subarray(20, 20 + length)), binary: buffer.subarray(28 + length) };
}
function positions(gltf, id) {
  const accessor = gltf.json.accessors[id], array = new Float32Array(accessor.count * 3);
  if (accessor.bufferView !== undefined) {
    const view = gltf.json.bufferViews[accessor.bufferView];
    for (let i = 0; i < accessor.count; i++) for (let c = 0; c < 3; c++)
      array[i * 3 + c] = gltf.binary.readFloatLE((view.byteOffset || 0) + (accessor.byteOffset || 0) + i * (view.byteStride || 12) + c * 4);
  }
  if (accessor.sparse) {
    const sparse = accessor.sparse;
    const indexView = gltf.json.bufferViews[sparse.indices.bufferView], valueView = gltf.json.bufferViews[sparse.values.bufferView];
    const indexSize = { 5121: 1, 5123: 2, 5125: 4 }[sparse.indices.componentType];
    for (let i = 0; i < sparse.count; i++) {
      const at = (indexView.byteOffset || 0) + (sparse.indices.byteOffset || 0) + i * indexSize;
      const index = gltf.binary.readUIntLE(at, indexSize);
      for (let c = 0; c < 3; c++) array[index * 3 + c] = gltf.binary.readFloatLE((valueView.byteOffset || 0) + (sparse.values.byteOffset || 0) + i * 12 + c * 4);
    }
  }
  return array;
}

test('People models retain source license, verified files, embedded clothing/face atlases and all walking poses', async () => {
  assert.equal(manifest.license, 'MIT');
  assert.match(await readFile(new URL('LICENSE.txt', directory), 'utf8'), /Copyright \(c\) 2020 Microsoft/);
  assert.equal(manifest.models.length, 2);
  for (const record of manifest.models) {
    const bytes = await readFile(new URL(record.file, directory));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
    const gltf = parseGLB(bytes), { json } = gltf;
    assert.equal(json.meshes.length, 1);
    assert.equal(json.images.length, 1);
    assert.ok(json.images[0].bufferView !== undefined, 'texture must be embedded for offline use');
    assert.equal(json.materials.length, 1);
    assert.equal(json.materials[0].alphaMode, 'MASK');
    assert.ok(json.materials[0].pbrMetallicRoughness.baseColorTexture);
    const primitive = json.meshes[0].primitives[0];
    assert.ok(primitive.attributes.TEXCOORD_0 !== undefined);
    assert.equal(primitive.targets.length, 8);
    assert.ok(json.accessors[primitive.indices].count / 3 < 4500, 'crowd mesh budget');
    const base = positions(gltf, primitive.attributes.POSITION);
    let moving = false;
    for (const target of primitive.targets) {
      const delta = positions(gltf, target.POSITION);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < base.length; i++) {
        const value = base[i] + delta[i], axis = i % 3;
        assert.ok(Number.isFinite(value));
        min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
        if (Math.abs(delta[i]) > .05) moving = true;
      }
      assert.ok(Math.abs(min[1]) < .001, 'supporting shoe stays on the floor');
      assert.ok(max[1] > 1.6 && max[1] < 1.85, 'human-scale height across gait');
      assert.ok(max[0] - min[0] < 1.1 && max[2] - min[2] < 1.25, 'no stretched limbs from mismatched rig transfer');
    }
    assert.ok(moving, 'walk targets must actually move the limbs');
  }
});
