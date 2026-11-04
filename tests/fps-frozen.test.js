// 紧凑 FPS 布局（expansion:false）冻结：社区住宅、云澜江与门禁只进入游览布局，FPS 布局逐字节不变。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildLayout } from '../src/layout/layout.js';

const FPS_LAYOUT_SHA256 = 'f363c8b26e46d88e21eedfce4d9569bf77aafc0b3bfd7dd6321f38c61020f684';

test('FPS 紧凑布局的 JSON 哈希保持不变，且不含门禁与社区住宅分类', () => {
  const L = buildLayout({ expansion: false });
  assert.equal(L.accessControl, undefined);
  assert.equal(L.categories.community, undefined);
  assert.ok(!L.buildings.some((b) => b.community));
  const json = JSON.stringify(L);
  assert.equal(createHash('sha256').update(json).digest('hex'), FPS_LAYOUT_SHA256, `FPS 布局已改变（${json.length} 字节）`);
});

test('游览布局：门禁记录与社区住宅分类为新增的空记录', () => {
  const L = buildLayout();
  assert.equal(L.accessControl.version, 1);
  assert.ok(Array.isArray(L.accessControl.zones) && Array.isArray(L.accessControl.gates));
  assert.deepEqual(L.categories.community, { label: '云澜社区住宅', color: '#6f8a7a' });
});
