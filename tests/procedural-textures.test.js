import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PROCEDURAL_SURFACES, surfacePixels } from '../scripts/procedural-surfaces.mjs';
import { FACADE_SURFACES } from '../src/render/facade-materials.js';
import { FLOOR_SURFACES } from '../src/render/pbr.js';

const manifest = JSON.parse(readFileSync(new URL('../assets/textures/procedural/manifest.json', import.meta.url)));

test('程序化面层文件与清单一致，彩色/非彩色分开，体积在预算内', () => {
  assert.deepEqual(manifest.assets.map(a => a.id).sort(), Object.keys(PROCEDURAL_SURFACES).sort());
  let total = 0;
  for (const asset of manifest.assets) {
    assert.deepEqual(asset.meters, PROCEDURAL_SURFACES[asset.id].meters);
    for (const kind of ['color', 'normal', 'roughness']) {
      const map = asset.maps[kind], data = readFileSync(new URL('../' + map.path, import.meta.url));
      assert.equal(createHash('sha256').update(data).digest('hex'), map.sha256, `${asset.id}/${kind} is stale; rerun scripts/procedural-textures.mjs`);
      assert.equal(map.colorSpace, kind === 'color' ? 'srgb' : 'linear');
      total += data.length;
    }
  }
  assert.ok(total < 2 * 1024 * 1024);
});

test('程序化面层可复现，颜色接近中性、不会把顶点色压暗，法线朝外', () => {
  for (const id of Object.keys(PROCEDURAL_SURFACES)) {
    const a = surfacePixels(id, 64), b = surfacePixels(id, 64);
    assert.deepEqual(a.color, b.color, `${id} must be deterministic`);
    let lum = 0, nz = 0;
    for (let i = 0; i < a.color.length; i += 4) { lum += (a.color[i] + a.color[i + 1] + a.color[i + 2]) / 765; nz += a.normal[i + 2] / 255; }
    const n = a.color.length / 4;
    assert.ok(lum / n > 0.6 && lum / n < 1, `${id} mean albedo ${lum / n}`);
    assert.ok(nz / n > 0.85, `${id} normals must face out`);
  }
});

test('每个程序化面层都有对应的建筑或地面材质', () => {
  const used = new Set([...Object.values(FACADE_SURFACES), ...Object.values(FLOOR_SURFACES)].flatMap(s => [s.id, s.pattern].filter(Boolean)));
  for (const id of Object.keys(PROCEDURAL_SURFACES)) assert.ok(used.has(id), id);
});
