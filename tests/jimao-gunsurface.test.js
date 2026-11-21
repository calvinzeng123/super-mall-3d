// 枪械表面贴图的工具（src/jimao/gun-surface.js）和枪那一层的专用打光（src/jimao/view-light.js）：纯计算的部分。
// 真正的贴图要画布，测试环境没有 document——那几条路都应该原样返回、不报错。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { seeded, noiseField, fbmField, heightToNormal, RECIPES, surface, applySurface, sharpenTexture, edgeWear, addDetail } from '../src/jimao/gun-surface.js';
import { VIEW_LIGHT, viewLightLevel, createViewLight } from '../src/jimao/view-light.js';

test('噪声：可复现、落在 0–1、左右上下接得上（平铺不露缝）；拉长的格子得到拉丝一样的纹理', () => {
  const a = noiseField(64, 8, 8, 3), b = noiseField(64, 8, 8, 3), c = noiseField(64, 8, 8, 4);
  assert.deepEqual([...a.slice(0, 20)], [...b.slice(0, 20)]); assert.notDeepEqual([...a.slice(0, 20)], [...c.slice(0, 20)]);
  assert.ok(a.every((v) => v >= 0 && v <= 1));
  // 接缝：最后一列到第一列的跳变不比相邻两列的大多少
  let seam = 0, inner = 0; for (let y = 0; y < 64; y++) { seam += Math.abs(a[y * 64 + 63] - a[y * 64]); inner += Math.abs(a[y * 64 + 31] - a[y * 64 + 32]); }
  assert.ok(seam < inner * 3 + 0.5, `接缝 ${seam.toFixed(2)} / 内部 ${inner.toFixed(2)}`);
  // 横向 2 格、纵向 32 格：竖着变化快、横着变化慢
  const s = noiseField(64, 2, 32, 5); let dx = 0, dy = 0; for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) { dx += Math.abs(s[y * 64 + x + 1] - s[y * 64 + x]); dy += Math.abs(s[(y + 1) * 64 + x] - s[y * 64 + x]); }
  assert.ok(dy > dx * 4, '拉丝方向对');
  const f = fbmField(32, 2, 2, 3, 1); assert.ok(f.every((v) => v >= 0 && v <= 1));
  const r = seeded(9), r2 = seeded(9); assert.equal(r(), r2());
});

test('高度图转法线：平的是正上方 (128,128,255)，斜坡的法线朝低处倒；每种表面的配方都给出颜色、高度、粗糙度', () => {
  const flat = heightToNormal(new Float32Array(16 * 16).fill(0.5), 16, 2);
  assert.deepEqual([flat[0], flat[1], flat[2], flat[3]].map(Math.round), [128, 128, 255, 255]);
  const ramp = new Float32Array(16 * 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) ramp[y * 16 + x] = x / 16;
  const n = heightToNormal(ramp, 16, 2), i = (8 * 16 + 8) * 4; assert.ok(n[i] < 126 && Math.abs(n[i + 1] - 128) <= 1, '往 +x 升高：法线朝 −x 倒');
  for (const kind of Object.keys(RECIPES)) {
    const R = RECIPES[kind](32, 1);
    assert.equal(R.color.length, 32 * 32 * 3, kind); assert.equal(R.height.length, 32 * 32); assert.ok(R.rough.every((v) => v >= 0 && v <= 1), kind);
    assert.ok(R.color.every((v) => v >= 0 && v < 256), `${kind} 颜色在范围里`);
  }
  // 木头比钢亮、偏红；聚合物最暗
  const mean = (R, c) => { let s = 0; for (let k = c; k < R.color.length; k += 3) s += R.color[k]; return s / (R.color.length / 3); };
  const wood = RECIPES.wood(32, 1), steel = RECIPES.steel(32, 1), poly = RECIPES.polymer(32, 1);
  assert.ok(mean(wood, 0) > mean(wood, 2) * 1.8 && mean(wood, 0) > mean(steel, 0)); assert.ok(mean(poly, 0) < mean(steel, 0) + 5);
});

test('没有画布（测试环境）：贴图一律不做，材质保持原样，不报错', () => {
  assert.equal(surface('steel'), null); assert.equal(surface('nope'), null);
  const m = new THREE.MeshStandardMaterial({ color: 0x123456, roughness: 0.6 });
  assert.equal(applySurface(m, 'wood', { repeat: [2, 1] }), m); assert.equal(m.map, null); assert.equal(m.color.getHex(), 0x123456); assert.equal(m.roughness, 0.6);
  const t = new THREE.Texture(); assert.equal(sharpenTexture(t), t); assert.equal(edgeWear(t, t), t);
  assert.equal(addDetail(m, null), m); assert.equal(addDetail(m, { normalMap: t }), m, '材质没有法线贴图：不处理'); assert.equal(m.userData.detail, undefined);
  m.normalMap = t; addDetail(m, { normalMap: t, roughnessMap: t }, { scale: 9 }); assert.equal(m.userData.detail.uDetailScale.value, 9); assert.equal(typeof m.onBeforeCompile, 'function');
});

test('枪的专用打光：三盏灯挂在镜头上、只开枪那一层；停电时比白天亮（那时候枪全靠它）；可以整体调暗、关掉', () => {
  for (const spec of Object.values(VIEW_LIGHT)) assert.ok(viewLightLevel(spec, 1) > viewLightLevel(spec, 0));
  assert.equal(viewLightLevel(VIEW_LIGHT.key, 0.5), (VIEW_LIGHT.key.day + VIEW_LIGHT.key.dark) / 2); assert.equal(viewLightLevel(VIEW_LIGHT.key, 9), VIEW_LIGHT.key.dark);
  const camera = new THREE.PerspectiveCamera(), rig = createViewLight({ camera, layer: 3 });
  assert.equal(Object.keys(rig.lights).length, 3);
  for (const l of Object.values(rig.lights)) { assert.equal(l.parent, camera); assert.equal(l.layers.mask, 1 << 3, '只照枪那一层'); assert.equal(l.castShadow, false); }
  rig.update(1); assert.equal(rig.lights.key.intensity, VIEW_LIGHT.key.dark); rig.update(0); assert.equal(rig.lights.key.intensity, VIEW_LIGHT.key.day);
  rig.scale = 0; rig.update(1); assert.ok(Object.values(rig.lights).every((l) => l.intensity === 0));
  rig.dispose(); assert.equal(camera.children.length, 0);
});
