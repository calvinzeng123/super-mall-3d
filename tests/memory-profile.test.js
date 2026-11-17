// 内存档位：贴图大小、装饰几何跟着画质档位走；被系统回收过显存以后自动降档。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MEMORY_PROFILES, memoryProfileFor, configureMemory, compareMemory, MEM, TEX_SCALE } from '../src/render/device.js';
import * as device from '../src/render/device.js';
import { memoryNotice } from '../src/render/memory-notice.js';
import { savedTier } from '../src/runtime.js';
import { BatchSet, FOLIAGE_THIN, packPositions, PACK_STEP } from '../src/render/batch.js';
import { pbrOptions, metricFloor } from '../src/render/pbr.js';
import { QUALITY_STORAGE_KEY } from '../src/render/quality.js';

test('画质档位 → 内存档位：手机 流畅 / 自动 用省内存档，均衡用标准，精细 / 极致放大贴图；电脑用原始大小', () => {
  const m = (tier, lost = 0) => memoryProfileFor(tier, { mobile: true, lost });
  assert.deepEqual(['auto', 'low', 'balanced', 'high', 'ultra'].map((t) => m(t)), ['compact', 'compact', 'standard', 'rich', 'rich']);
  for (const t of ['auto', 'low', 'balanced', 'high', 'ultra']) assert.equal(memoryProfileFor(t, { mobile: false, lost: 0 }), 'full');
  // 被回收过一次：降一档；两次以上：一律最省
  assert.deepEqual(['auto', 'balanced', 'high'].map((t) => m(t, 1)), ['compact', 'compact', 'standard']);
  assert.deepEqual(['auto', 'low', 'high'].map((t) => memoryProfileFor(t, { mobile: false, lost: 1 })), ['standard', 'compact', 'standard']);
  for (const mobile of [true, false]) for (const t of ['auto', 'high', 'ultra']) assert.equal(memoryProfileFor(t, { mobile, lost: 2 }), 'compact');
  // 越省的档位贴图越小、留的楼层越少
  const P = MEMORY_PROFILES;
  assert.ok(P.compact.texScale < P.standard.texScale && P.standard.texScale < P.rich.texScale && P.rich.texScale < P.full.texScale);
  assert.ok(P.compact.pbrSize < P.standard.pbrSize && P.compact.modelTex < P.standard.modelTex && P.compact.floors < P.standard.floors);
  assert.equal(P.compact.pbrMaps, 'color'); assert.equal(P.compact.decor, false);
  assert.equal(compareMemory('compact', 'rich'), -1); assert.equal(compareMemory('full', 'standard'), 1); assert.equal(compareMemory('rich', 'rich'), 0);
});

test('configureMemory：进入模式前定档，MEM / TEX_SCALE 跟着变（别处现取现用）', (t) => {
  t.after(() => configureMemory('auto'));
  assert.equal(configureMemory('low', { mobile: true, lost: 0 }), 'compact');
  assert.equal(device.MEM.name, 'compact'); assert.equal(device.TEX_SCALE, MEMORY_PROFILES.compact.texScale);
  assert.equal(configureMemory('ultra', { mobile: true, lost: 0 }), 'rich');
  assert.equal(device.MEM.pbrColorSize, 1024); assert.equal(device.TEX_SCALE, 0.75);
  void MEM; void TEX_SCALE;
});

test('省内存档：绿植每 3 个只留 1 个；材质只有颜色贴图时不带法线、粗糙度', (t) => {
  t.after(() => configureMemory('auto'));
  const mats = { foliage: new THREE.MeshStandardMaterial(), matte: new THREE.MeshStandardMaterial() };
  const count = () => { const B = new BatchSet(mats); for (let i = 0; i < 30; i++) { B.get('foliage').box(i, 0, 0, 1, 1, 1, '#3a7'); B.get('matte').box(i, 0, 0, 1, 1, 1, '#999'); } return [B.get('foliage').n, B.get('matte').n]; };
  configureMemory('high', { mobile: false, lost: 0 });
  const [fullFoliage, fullMatte] = count();
  configureMemory('low', { mobile: true, lost: 0 });
  const [leanFoliage, leanMatte] = count();
  assert.equal(fullFoliage, fullMatte);
  assert.equal(leanMatte, fullMatte, '别的批次不动');
  assert.equal(leanFoliage, fullFoliage / FOLIAGE_THIN);
  const color = new THREE.Texture();
  const o = pbrOptions({ maps: { color } });
  assert.equal(o.map, color); assert.equal(o.normalMap, null); assert.equal(o.roughnessMap, null);
});

test('改画质换了内存档位才提示；提示里说清是更清楚还是更省', () => {
  const opts = { mobile: true, lost: 0 };
  assert.equal(memoryNotice('low', 'compact', opts), null);
  assert.equal(memoryNotice('auto', 'compact', opts), null);
  const up = memoryNotice('high', 'compact', opts);
  assert.equal(up.to, 'rich'); assert.match(up.text, /调高了.*重新进入后生效/);
  const down = memoryNotice('low', 'rich', opts);
  assert.equal(down.to, 'compact'); assert.match(down.text, /调低了.*更省内存/);
  assert.equal(memoryNotice('ultra', 'full', { mobile: false, lost: 0 }), null, '电脑上各档贴图一样，不提示');
});

test('进入模式时读这个模式存下来的画质：漫游读我们的设置，零点突围读原游戏的设置', () => {
  const store = (data) => ({ getItem: (k) => data[k] ?? null });
  assert.equal(savedTier('tour', store({})), 'auto');
  assert.equal(savedTier('tour', store({ [QUALITY_STORAGE_KEY]: JSON.stringify({ preset: 'high' }) })), 'high');
  assert.equal(savedTier('tour', store({ [QUALITY_STORAGE_KEY]: JSON.stringify({ preset: 'auto' }) })), 'auto');
  assert.equal(savedTier('arcade', store({ [QUALITY_STORAGE_KEY]: '{坏的' })), 'auto');
  assert.equal(savedTier('jimao', store({ 'saltline.settings.v1': JSON.stringify({ quality: 'medium' }) })), 'balanced');
  assert.equal(savedTier('jimao', store({ 'saltline.settings.v1': JSON.stringify({ quality: 'ultra' }) })), 'ultra');
  assert.equal(savedTier('jimao', store({ [QUALITY_STORAGE_KEY]: JSON.stringify({ preset: 'high' }) })), 'auto', '零点突围不跟漫游的设置');
  // 进入模式之前就定档（建场景、加载贴图之前）
  const src = readFileSync(new URL('../src/runtime.js', import.meta.url), 'utf8');
  assert.ok(src.indexOf('configureMemory(tier)') > 0 && src.indexOf('configureMemory(tier)') < src.indexOf('await createApp('));
});

test('省内存档：顶点坐标压成 16 位，画出来的位置不变（误差不超过半格）；范围太大的批次不压', (t) => {
  t.after(() => configureMemory('auto'));
  const mats = { matte: new THREE.MeshStandardMaterial() };
  const build = () => { const B = new BatchSet(mats), g = new THREE.Group(); B.get('matte').box(-120, 3, 40, 2, 6, 0.3, '#999'); B.get('matte').box(95.25, 0.5, -130.4, 0.05, 1, 4, '#888', 0.7); B.flush(g); return g.children[0]; };
  configureMemory('high', { mobile: false, lost: 0 });
  const plain = build();
  configureMemory('low', { mobile: true, lost: 0 });
  const packed = build();
  assert.ok(plain.geometry.attributes.position.array instanceof Float32Array);
  const a = packed.geometry.attributes.position;
  assert.ok(a.array instanceof Int16Array && a.normalized, '坐标是归一化的 16 位整数');
  assert.equal(a.array.byteLength * 2, plain.geometry.attributes.position.array.byteLength, '坐标占的内存减半');
  packed.updateMatrixWorld(true);
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  let worst = 0;
  for (let i = 0; i < a.count; i++) { p.fromBufferAttribute(a, i).applyMatrix4(packed.matrixWorld); q.fromBufferAttribute(plain.geometry.attributes.position, i); worst = Math.max(worst, p.distanceTo(q)); }
  assert.ok(worst < PACK_STEP, `最大偏差 ${(worst * 1000).toFixed(2)} 毫米`);
  // 包围球跟着换算：视锥剔除照常
  const sphere = packed.geometry.boundingSphere.clone().applyMatrix4(packed.matrixWorld);
  assert.ok(sphere.containsPoint(new THREE.Vector3(-120, 3, 40)));
  // 范围上千米的一批：每格会超过 5 毫米，不压
  assert.equal(packPositions(new Float32Array([0, 0, 0, 900, 10, 900])), null);
  assert.ok(packPositions(new Float32Array([0, 0, 0, 300, 10, 300])));
});

test('地面材质的着色器：没有法线 / 粗糙度贴图也能编译（按宏判断），按世界坐标取样（顶点坐标压缩后照样对）', () => {
  // 省内存档第一版：地面材质直接写 vNormalMapUv，没有法线贴图时这个 varying 不存在 → 编译失败 → 整块地砖、地毯不画
  const mat = metricFloor(new THREE.MeshStandardMaterial(), { id: 'a', meters: [2, 2] });
  const shader = { vertexShader: 'void main() {\n#include <uv_vertex>\n}' };
  mat.onBeforeCompile(shader);
  const v = shader.vertexShader;
  for (const [macro, name] of [['USE_MAP', 'vMapUv'], ['USE_NORMALMAP', 'vNormalMapUv'], ['USE_ROUGHNESSMAP', 'vRoughnessMapUv'], ['USE_EMISSIVEMAP', 'vEmissiveMapUv']]) {
    const at = v.indexOf(name), guard = v.lastIndexOf('#ifdef', at);
    assert.ok(at > 0 && guard > 0 && v.slice(guard, at).includes(macro) && !v.slice(guard, at).includes('#endif'), `${name} 没有包在 #ifdef ${macro} 里`);
  }
  assert.match(v, /modelMatrix \* vec4\(position, 1\.0\)/);
  assert.ok(!/vec2\(position\.x/.test(v), '不能直接用 position 当世界坐标');
});
