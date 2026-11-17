import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FACADE_SURFACES } from '../src/render/facade-materials.js';
import { FLOOR_SURFACES, DETAIL_SURFACES } from '../src/render/pbr.js';

const read = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url)));
const scans = read('assets/textures/scans/manifest.json'), base = read('assets/textures/manifest.json');
const spec = read('scripts/textures/scans.json');

test('网上的 CC0 扫描贴图：文件与清单一致，出处和授权齐全，体积在预算内', () => {
  assert.deepEqual(scans.assets.map((a) => a.id), spec.sets.map((s) => s.id), '清单要和 scripts/textures/scans.json 对得上；改了就重跑 fetch-scans.py');
  let total = 0;
  for (const asset of scans.assets) {
    assert.equal(asset.license, 'CC0-1.0');
    assert.ok(/^https:\/\/(polyhaven\.com\/a\/|ambientcg\.com\/a\/)/.test(asset.sourceUrl), `${asset.id} 出处 ${asset.sourceUrl}`);
    assert.ok(Object.keys(asset.authors).length > 0, `${asset.id} 要有作者`);
    assert.ok(asset.meters.every((n) => n > 0));
    assert.ok(asset.maps.color, `${asset.id} 至少要有颜色贴图`);
    for (const [kind, map] of Object.entries(asset.maps)) {
      const data = readFileSync(new URL('../' + map.path, import.meta.url));
      assert.equal(createHash('sha256').update(data).digest('hex'), map.sha256, `${asset.id}/${kind} 和清单不一致；重跑 scripts/textures/fetch-scans.py`);
      assert.equal(map.colorSpace, kind === 'color' ? 'srgb' : 'linear');
      assert.ok(map.width <= 1024 && map.width === map.height);
      assert.ok(map.sourceUrl.startsWith('https://'));
      total += data.length;
    }
  }
  assert.equal(total, scans.totalImageBytes);
  assert.ok(total < 8 * 1024 * 1024, `扫描贴图一共 ${(total / 1048576).toFixed(1)} MB`);
});

test('颜色贴图调成了浅中性色：材质的色调由顶点色和 tint 给，贴图不会把颜色带偏', () => {
  for (const asset of scans.assets) {
    const [r, g, b] = asset.meanColor;
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 30, `${asset.id} 平均色 ${asset.meanColor} 偏色太多`);
  }
});

test('地面、立面和纯色面的细纹理用到的贴图都在清单里，清单里的每一套也都有用处', () => {
  const have = new Set([...scans.assets, ...base.assets].map((a) => a.id));
  const used = new Set([...Object.values(FACADE_SURFACES), ...Object.values(FLOOR_SURFACES), ...Object.values(DETAIL_SURFACES)].map((s) => s.id));
  for (const id of used) assert.ok(have.has(id), `${id} 不在贴图清单里`);
  for (const asset of scans.assets) assert.ok(used.has(asset.id), `${asset.id} 没有任何材质在用`);
});
