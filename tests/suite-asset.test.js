import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Vector3, Quaternion } from 'three';

const directory = new URL('../assets/models/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', directory), 'utf8'));
function readGLB(name) {
  const bytes = fs.readFileSync(new URL(name, directory));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12);
  return { bytes, json: JSON.parse(bytes.subarray(20, 20 + length)), bin: bytes.subarray(28 + length) };
}
const original = readGLB('user-suite-original.glb'), asset = readGLB('user-suite-processed.glb');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function view(g, index) { const v = g.json.bufferViews[index]; return g.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); }
function accessor(g, index) {
  const a = g.json.accessors[index], data = view(g, a.bufferView);
  const dim = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
  const [method, size] = a.componentType === 5126 ? ['readFloatLE', 4] : a.componentType === 5123 ? ['readUInt16LE', 2] : ['readUInt32LE', 4];
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: dim }, (_, k) => data[method]((a.byteOffset || 0) + (i * dim + k) * size)));
}

test('user original remains byte-identical and all supplied images survive processing', () => {
  assert.equal(hash(original.bytes), manifest.original.sha256);
  assert.equal(hash(asset.bytes), manifest.processed.sha256);
  assert.equal(asset.json.images.length, 23);
  for (const image of original.json.images) {
    const processed = asset.json.images.find(i => i.name === image.name);
    assert.ok(processed, image.name);
    assert.equal(hash(view(original, image.bufferView)), hash(view(asset, processed.bufferView)), image.name);
  }
  assert.ok(asset.json.meshes.every(mesh => mesh.primitives.length > 0));
  const referenced = asset.json.nodes[60].children.map(i => asset.json.nodes[i]);
  assert.ok(!referenced.some(n => n.name?.includes('[OUT ')));
});

test('shared suite geometry contains restrained contact AO and valid attribute indices', () => {
  let vertices = 0, shaded = 0, triangles = 0;
  for (const mesh of asset.json.meshes) for (const primitive of mesh.primitives) {
    const count = asset.json.accessors[primitive.attributes.POSITION].count;
    for (const a of Object.values(primitive.attributes)) assert.equal(asset.json.accessors[a].count, count);
    const indices = accessor(asset, primitive.indices).flat();
    assert.ok(indices.every(i => i >= 0 && i < count));
    triangles += indices.length / 3;
    for (const color of accessor(asset, primitive.attributes.COLOR_0)) {
      assert.ok(color.every(c => c >= .61999 && c <= 1));
      vertices++; if (color[0] < .97) shaded++;
    }
  }
  assert.equal(triangles, manifest.processed.triangles);
  assert.ok(shaded > vertices * .01, 'Contact shading must be present, not all-white color data');
});

const triangles = asset.json.meshes.flatMap(mesh => mesh.primitives.flatMap(p => {
  const positions = accessor(asset, p.attributes.POSITION), indices = accessor(asset, p.indices).flat();
  const result = [];
  for (let i = 0; i < indices.length; i += 3) result.push([positions[indices[i]], positions[indices[i + 1]], positions[indices[i + 2]]]);
  return result;
}));
function segmentHits(a, b, t) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const e1x = t[1][0] - t[0][0], e1y = t[1][1] - t[0][1], e1z = t[1][2] - t[0][2];
  const e2x = t[2][0] - t[0][0], e2y = t[2][1] - t[0][1], e2z = t[2][2] - t[0][2];
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
  const determinant = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(determinant) < 1e-9) return false;
  const inv = 1 / determinant, sx = a[0] - t[0][0], sy = a[1] - t[0][1], sz = a[2] - t[0][2];
  const u = inv * (sx * hx + sy * hy + sz * hz);
  if (u < -1e-7 || u > 1.0000001) return false;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = inv * (dx * qx + dy * qy + dz * qz);
  if (v < -1e-7 || u + v > 1.0000001) return false;
  const distance = inv * (e2x * qx + e2y * qy + e2z * qz);
  return distance >= -1e-7 && distance <= 1.0000001;
}
test('processed mesh doorways pass a real width/height ray grid while adjacent walls stay solid', () => {
  const checks = [
    { name: 'entry', axis: 2, center: 4.05, spread: .30, a: [10.8, 0, 0], b: [9.95, 0, 0] },
    { name: 'side', axis: 0, center: 9.7, spread: .30, a: [0, 0, 5.05], b: [0, 0, 4.25] },
    { name: 'bath', axis: 2, center: 2.5, spread: .25, a: [5.55, 0, 0], b: [6.05, 0, 0] },
    { name: 'wet', axis: 0, center: 6.925, spread: .25, a: [0, 0, 2.35], b: [0, 0, 1.8] },
    { name: 'wc', axis: 2, center: 2.55, spread: .23, a: [7.4, 0, 0], b: [8, 0, 0] },
  ];
  for (const check of checks) for (const y of [.65, 1.4, 1.95]) for (const offset of [-check.spread, 0, check.spread]) {
    const a = [...check.a], b = [...check.b]; a[1] = b[1] = y; a[check.axis] = b[check.axis] = check.center + offset;
    assert.ok(!triangles.some(t => segmentHits(a, b, t)), `${check.name},y=${y},offset=${offset}`);
  }
  for (const ray of manifest.geometryChecks.filter(r => !r.expectedOpen)) assert.ok(triangles.some(t => segmentHits(ray.from, ray.to, t)), ray.name);
});

test('processed standalone model has eight real warm lights with correct downward spot orientations', () => {
  const lights = asset.json.extensions.KHR_lights_punctual.lights;
  assert.equal(lights.length, 8);
  assert.equal(lights.filter(l => l.type === 'spot').length, 6);
  for (const [i, light] of lights.entries()) {
    assert.ok(light.intensity > 0 && light.range > 0);
    assert.ok(light.color[0] > light.color[2]);
    const node = asset.json.nodes.find(n => n.extensions?.KHR_lights_punctual?.light === i);
    assert.ok(node && asset.json.nodes[60].children.includes(asset.json.nodes.indexOf(node)));
    if (light.type === 'spot') {
      const direction = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(...node.rotation));
      assert.ok(direction.y < -.9, light.name);
      assert.ok(light.spot.outerConeAngle > light.spot.innerConeAngle);
    }
  }
});

test('west window opens toward the terrace and only shell facades receive the warm plaster material', () => {
  const blackOriginal = original.json.materials.find(m => m.name === 'black');
  assert.deepEqual(asset.json.materials.find(m => m.name === 'black'), blackOriginal, 'Interior black material is preserved');
  let plasterFacades = 0;
  const opaque = [];
  for (const mesh of asset.json.meshes) for (const primitive of mesh.primitives) {
    const material = asset.json.materials[primitive.material];
    if (primitive.extras.sourceName.startsWith('Shell ')) {
      assert.notEqual(material.name, 'black');
      if (material.name === 'suiteExteriorPlaster') plasterFacades++;
    } else assert.notEqual(material.name, 'suiteExteriorPlaster', 'Only the source exterior shell changes finish');
    if (material.alphaMode === 'BLEND') continue;
    const positions = accessor(asset, primitive.attributes.POSITION), indices = accessor(asset, primitive.indices).flat();
    for (let i = 0; i < indices.length; i += 3) opaque.push([positions[indices[i]], positions[indices[i + 1]], positions[indices[i + 2]]]);
  }
  assert.equal(plasterFacades, 4);
  for (const y of [1.2, 1.6]) for (const z of [1, 2.4, 3.7, 4.85]) {
    assert.ok(!opaque.some(t => segmentHits([-.4, y, z], [.4, y, z], t)), `Window view y${y}/z${z}`);
  }
  for (const [y, z] of [[.08, 2.4], [2.55, 2.4], [1.6, .1]]) assert.ok(opaque.some(t => segmentHits([-.4, y, z], [.4, y, z], t)), 'Sill, header and side jamb remain');
});
