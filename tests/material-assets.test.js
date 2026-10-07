import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { surfaceUV } from '../src/render/surface-uv.js';

test('CC0 素材完整、哈希相符、彩色与非彩色贴图分开，体积在预算内', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/textures/manifest.json', import.meta.url)));
  assert.equal(manifest.assets.length, 6);
  let total = 0;
  for (const asset of manifest.assets) {
    assert.ok(asset.sourceUrl.startsWith('https://polyhaven.com/a/'));
    assert.ok(asset.licenseUrl.includes('polyhaven.com'));
    assert.ok(asset.meters.every(n => n > 0));
    for (const kind of ['color', 'normal', 'roughness']) {
      const map = asset.maps[kind];
      const data = readFileSync(new URL('../' + map.path, import.meta.url));
      assert.equal(createHash('sha256').update(data).digest('hex'), map.sha256);
      assert.equal(map.width, 1024);
      assert.equal(map.height, 1024);
      assert.equal(map.colorSpace, kind === 'color' ? 'srgb' : 'linear');
      total += data.length;
    }
  }
  assert.ok(total < 8 * 1024 * 1024);
});

test('地面与立面使用真实米制 UV，负向表面法线保持正确方向', () => {
  assert.deepEqual(surfaceUV(3, 4, 5, 0, 1, 0), [3, -5]);
  assert.deepEqual(surfaceUV(3, 4, 5, 0, 0, 1), [3, 4]);
  assert.deepEqual(surfaceUV(3, 4, 5, 1, 0, 0), [-5, 4]);
  assert.deepEqual(surfaceUV(3, 4, 5, -1, 0, 0), [5, 4]);
});
