// 纯色面的世界坐标细节（pbr.js 的 worldDetail / worldWear）：档位、取样次数、着色器补丁的串接、停电污垢的开关、
// 脚下地面高度的估计、大块噪声图。node 里没有 document：贴图那一步什么都不做，也不能抛错。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MEMORY_PROFILES } from '../src/render/device.js';
import {
  worldDetail, worldWear, detailFor, detailVariant, worldDetailTier, worldDetailChunks, trackFloor, stepFloor, setWorldGrime, worldGrime, FLOOR_STILL,
  macroNoise, macroNoiseSteps, macroTexture, MACRO_NEUTRAL, DETAIL_SURFACES, DETAIL_EYE, metricFloor, disposeWorldDetail, detailFrame, hashText,
} from '../src/render/pbr.js';
import { MaterialLib } from '../src/render/materials.js';

const tex = () => new THREE.Texture();
const asset = (normal = true, roughness = false) => ({ id: 'painted_plaster', meters: [2, 2], mean: [242, 241, 239],
  maps: { color: tex(), ...(normal ? { normal: tex() } : {}), ...(roughness ? { roughness: tex() } : {}) } });
const fakeShader = () => ({
  uniforms: {},
  vertexShader: '#include <common>\nvoid main() {\n#include <uv_vertex>\n#include <beginnormal_vertex>\n#include <project_vertex>\n}',
  fragmentShader: '#include <common>\nvoid main() {\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_begin>\n#include <normal_fragment_maps>\n#include <emissivemap_fragment>\n}',
});
// 材质库本身要画几张小贴图（台阶、箭头），要一个假的 document；只在用到的测试里临时装上，用完拿掉
const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
function withDocument(fn) {
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
  try { return fn(); } finally { delete globalThis.document; disposeWorldDetail(); }
}
const fetches = (s) => (s.match(/texture2D\(/g) || []).length;

test('档位：省内存不做，手机（standard / rich）是精简版，电脑是完整版', () => {
  assert.equal(worldDetailTier(MEMORY_PROFILES.compact), 'off');
  assert.equal(worldDetailTier(MEMORY_PROFILES.standard), 'lite');
  assert.equal(worldDetailTier(MEMORY_PROFILES.rich), 'lite');
  assert.equal(worldDetailTier(MEMORY_PROFILES.full), 'full');
  assert.equal(detailVariant(asset(), {}, MEMORY_PROFILES.compact), null);
});

test('每像素多取样几次：手机最多 +2（法线、大块噪声），电脑 +4（颜色、法线各两次 + 大块噪声）', () => {
  for (const [name, budget] of [['standard', 3], ['rich', 3], ['full', 5]]) {
    const v = detailVariant(asset(), DETAIL_SURFACES.matte, MEMORY_PROFILES[name]);
    const c = worldDetailChunks(v), n = fetches(c.color) + fetches(c.normal) + fetches(c.rough);
    assert.equal(n, budget, `${name}：${n} 次`);
    assert.equal(v.normal, true, `${name} 载入了法线贴图，要用上`);
    assert.equal(v.antiTile, name === 'full');
  }
  // 贴图没有法线（吊顶板）：不取法线
  const ceil = detailVariant({ ...asset(false), id: 'ceiling_panels' }, DETAIL_SURFACES.ceiling, MEMORY_PROFILES.full);
  assert.equal(ceil.normal, false);
  assert.equal(worldDetailChunks(ceil).normal, '');
  // 只载入颜色贴图的档位（假设）：不取法线
  assert.equal(detailVariant(asset(), DETAIL_SURFACES.matte, { ...MEMORY_PROFILES.full, pbrMaps: 'color' }).normal, false);
  // 有粗糙度贴图时只在电脑上取
  assert.equal(detailVariant(asset(true, true), DETAIL_SURFACES.matte, MEMORY_PROFILES.full).roughMap, true);
  assert.equal(detailVariant(asset(true, true), DETAIL_SURFACES.matte, MEMORY_PROFILES.rich).roughMap, false);
});

test('着色器补丁：串在前面的补丁后面，各处都插上，缓存键随变体变化', () => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true });
  let prevCalls = 0;
  m.onBeforeCompile = () => { prevCalls++; };
  m.customProgramCacheKey = () => 'vertex-emissive';
  worldDetail(m, asset(), DETAIL_SURFACES.matte);
  assert.equal(m.userData.detail, 'painted_plaster');
  const sh = fakeShader();
  m.onBeforeCompile(sh, null);
  assert.equal(prevCalls, 1, '原来的补丁照样跑');
  for (const k of ['wdMap', 'wdNormalMap', 'wdMacro', 'wdGrime', 'wdFloorY']) assert.ok(k in sh.uniforms, `少了 uniform ${k}`);
  assert.match(sh.vertexShader, /vDetailPos = \(modelMatrix \* detailWorld\)\.xyz/);
  assert.match(sh.vertexShader, /USE_INSTANCING/);
  assert.match(sh.fragmentShader, /mix\(diffuseColor\.rgb \* wdMul/);
  assert.match(sh.fragmentShader, /roughnessFactor = clamp\(roughnessFactor \+ wdRough/);
  assert.match(sh.fragmentShader, /normal = normalize\(normal \+ faceDirection/);
  assert.ok(sh.fragmentShader.indexOf('wdMul') > sh.fragmentShader.indexOf('#include <color_fragment>'));
  const key = m.customProgramCacheKey();
  assert.ok(key.startsWith('vertex-emissive|detail-painted_plaster'), key);
  // 另一种面（外墙）缓存键不同；同一材质再叠一层（楼板先 metricFloor 再 worldWear）也不同
  const m2 = worldDetail(new THREE.MeshStandardMaterial(), { ...asset(), id: 'tunnel_concrete' }, DETAIL_SURFACES.ext);
  assert.notEqual(m2.customProgramCacheKey(), key);
  // 只有颜色的变体和带法线的变体缓存键不同
  const m3 = worldDetail(new THREE.MeshStandardMaterial(), asset(false), DETAIL_SURFACES.matte);
  assert.notEqual(m3.customProgramCacheKey().replace(/^\|/, ''), key.replace(/^vertex-emissive\|/, ''));
});

test('克隆出来的材质（各栋楼带剖切面那份）照样有细节，画之前会更新脚下地面高度', () => {
  const base = worldDetail(new THREE.MeshStandardMaterial({ vertexColors: true }), asset(), DETAIL_SURFACES.matte);
  const m = base.clone();
  m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey; // residential-shell.js 的 clipMaterial 就是这样
  const sh = fakeShader();
  m.onBeforeCompile(sh, null);
  assert.match(sh.fragmentShader, /wdMul/);
  assert.equal(m.customProgramCacheKey(), base.customProgramCacheKey());
  assert.notEqual(m.onBeforeRender, THREE.Material.prototype.onBeforeRender, '克隆自己也挂上了 onBeforeRender');
  // 停电时：画一次就按相机高度估出地面
  setWorldGrime(1);
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 30 + DETAIL_EYE, 0); cam.updateMatrixWorld();
  m.onBeforeRender({ info: { render: { frame: 77 } } }, null, cam);
  assert.ok(Math.abs(sh.uniforms.wdFloorY.value - 30) < 1e-6, `地面估计 ${sh.uniforms.wdFloorY.value}`);
  setWorldGrime(0);
});

test('自带贴图的面只叠停电污垢：平时不多取样（取样在 uniform 分支里），重复调用不叠两次', () => {
  const m = new THREE.MeshStandardMaterial({ map: tex() });
  worldWear(m); worldWear(m);
  const sh = fakeShader();
  m.onBeforeCompile(sh, null);
  const f = sh.fragmentShader;
  assert.equal((f.match(/wdMul/g) || []).length > 0, true);
  const branch = f.indexOf('if (wdGrime > 0.001)'), fetch = f.indexOf('texture2D(wdMacro');
  assert.ok(branch > 0 && fetch > branch, '大块噪声只在停电时取');
  assert.equal((f.match(/float wdRough = 0\.0, wdDust/g) || []).length, 1, '只叠了一次');
  assert.equal(m.customProgramCacheKey(), '|wear', '材质原来没有自定义缓存键：不把默认的（整段函数源码）串进来');
});

test('楼面：metricFloor 之后再叠污垢，旧的只有顶点着色器的测试写法也不出错', () => {
  const m = worldWear(metricFloor(new THREE.MeshStandardMaterial(), { id: 'a', meters: [2, 2] }));
  const shader = { vertexShader: 'void main() {\n#include <uv_vertex>\n}' };
  assert.doesNotThrow(() => m.onBeforeCompile(shader));
  assert.match(shader.vertexShader, /surfaceWorld/);
  assert.match(m.customProgramCacheKey(), /^metric-floor-a-a\|wear$/);
});

test('停电污垢跟着材质库的供电走：停电（blackout.js 的写法）→ 1，来电 → 0', () => {
  const mats = withDocument(() => new MaterialLib({}));
  assert.equal(worldGrime(), 0);
  mats.power = 0; mats.setNight(0.11); // blackout.js update() 就是这样设的
  assert.equal(worldGrime(), 1);
  mats.power = 0.5; mats.setNight(0.3);
  assert.equal(worldGrime(), 0.5);
  mats.setPower(1);
  assert.equal(worldGrime(), 0);
  assert.equal(setWorldGrime(7), 1); assert.equal(setWorldGrime(-1), 0); assert.equal(setWorldGrime(NaN), 0);
});

test('脚下地面高度：第一次直接取，跳一下只动一点，坐电梯一下差很多就直接跳过去', () => {
  assert.ok(Math.abs(trackFloor(null, 10 + DETAIL_EYE, 0.016) - 10) < 1e-9);
  // 起跳 0.3 秒（相机抬高 0.8 米）：估计只抬一点点
  let y = 10;
  for (let i = 0; i < 18; i++) y = trackFloor(y, 10 + DETAIL_EYE + 0.8 * Math.sin(Math.PI * i / 36), 1 / 60);
  assert.ok(y - 10 < 0.45, `跳起来估计抬了 ${(y - 10).toFixed(2)} 米`);
  // 站定两秒：回到真实地面
  for (let i = 0; i < 120; i++) y = trackFloor(y, 10 + DETAIL_EYE, 1 / 60);
  assert.ok(Math.abs(y - 10) < 0.02);
  // 一下高出 3.4 米（一层）：直接到
  assert.ok(Math.abs(trackFloor(10, 13.4 + DETAIL_EYE, 1 / 60) - 13.4) < 1e-9);
  // 卡了一帧（dt 很大）也不会冲过头
  assert.ok(trackFloor(10, 11 + DETAIL_EYE, 5) <= 11);
});

test('脚下地面（真正用的那个）：爬楼梯一路不动、停稳才挪过去；跳、蹲不动；传送直接跳过去', () => {
  const run = (s, ys, dt = 1 / 60) => { for (const y of ys) s = stepFloor(s, y, dt); return s; };
  const eye = DETAIL_EYE, still = (y, n) => Array(n).fill(y + eye);
  let s = stepFloor(null, 20 + eye, 1 / 60);
  assert.equal(s.y, 20);
  // 一口气爬一跑楼梯（2 秒升 1.5 米）：估计一直留在出发那层
  s = run(s, Array.from({ length: 120 }, (_, i) => 20 + eye + 1.5 * (i + 1) / 120));
  assert.ok(Math.abs(s.y - 20) < 1e-9, `爬楼梯时挪了：${s.y}`);
  // 到了平台站住：停稳 FLOOR_STILL 秒以后再过两秒，到了平台的高度
  s = run(s, still(21.5, Math.ceil(FLOOR_STILL * 60) + 120));
  assert.ok(Math.abs(s.y - 21.5) < 0.05, `平台 ${s.y}`);
  // 跳一下（0.6 秒）：不动
  const y0 = s.y;
  s = run(s, Array.from({ length: 36 }, (_, i) => 21.5 + eye + 0.9 * Math.sin(Math.PI * i / 36)));
  assert.ok(Math.abs(s.y - y0) < 1e-3, '跳起来不该挪');
  // 蹲下停住三秒（眼睛低 0.72 米）：不认
  s = run(s, still(21.5 - 0.72, 180));
  assert.ok(Math.abs(s.y - 21.5) < 0.05, `蹲下挪了 ${s.y}`);
  // 传送到别的楼层（一帧差 30 米）：直接跳过去
  s = stepFloor(s, 51.5 + eye, 1 / 60);
  assert.equal(s.y, 51.5);
  // 坐电梯下 3 层（连续移动）：路上不动，停稳以后挪过去，不冲过头
  s = run(s, Array.from({ length: 240 }, (_, i) => 51.5 + eye - 9 * (i + 1) / 240));
  assert.equal(s.y, 51.5);
  s = run(s, still(42.5, 400));
  assert.ok(s.y >= 42.5 - 1e-9 && s.y - 42.5 < 0.06, `电梯 ${s.y}`);
  // 卡了一帧（dt 很大）也不出错；NaN 原样返回
  assert.ok(Number.isFinite(stepFloor(s, 42.5 + eye, 50).y));
  assert.equal(stepFloor(s, NaN, 1 / 60), s);
});

test('大块噪声图：大小对、首尾能接上、各通道分布合理；分步算和一次算结果一样', () => {
  const size = 64, d = macroNoise(size, 5);
  assert.equal(d.length, size * size * 4);
  const mean = [0, 0, 0, 0];
  for (let i = 0; i < d.length; i++) mean[i % 4] += d[i] / (size * size);
  for (const c of [0, 1, 3]) assert.ok(Math.abs(mean[c] - 127.5) < 6, `通道 ${c} 平均 ${mean[c]}（拉平以后应在中间）`);
  assert.ok(mean[2] > 1 && mean[2] < 40, `流痕应稀疏：平均 ${mean[2]}`);
  // 可平铺：左右边缘、上下边缘之间的差和内部相邻像素的差差不多（低频通道 R）
  const at = (x, y, c) => d[(y * size + x) * 4 + c];
  let seam = 0, inner = 0;
  for (let y = 0; y < size; y++) { seam += Math.abs(at(size - 1, y, 0) - at(0, y, 0)); inner += Math.abs(at(size / 2, y, 0) - at(size / 2 - 1, y, 0)); }
  assert.ok(seam < inner * 2.5 + size, `左右接缝 ${seam} / 内部 ${inner}`);
  seam = 0; inner = 0;
  for (let x = 0; x < size; x++) { seam += Math.abs(at(x, size - 1, 0) - at(x, 0, 0)); inner += Math.abs(at(x, size / 2, 0) - at(x, size / 2 - 1, 0)); }
  assert.ok(seam < inner * 2.5 + size, `上下接缝 ${seam} / 内部 ${inner}`);
  // 分步生成：最后一步之前 out 一个字节都不写
  const out = new Uint8Array(size * size * 4).fill(9), steps = macroNoiseSteps(size, 5, out);
  let n = 0;
  for (let r = steps.next(); !r.done; r = steps.next()) { n++; assert.ok(out.every((v) => v === 9), '中途写了半张图'); }
  assert.ok(n >= 10, `分了 ${n} 步`);
  // 最后那一步把像素整张写进去（下一次 next 才结束）
  assert.deepEqual(out, d);
  assert.deepEqual([...MACRO_NEUTRAL], [128, 128, 0, 128]);
});

test('有 document 时：大块噪声图先放中性值，空闲时分步算完；材质库带贴图照常建', async () => {
  const mats = withDocument(() => {
    const t = macroTexture();
    assert.ok(t?.isDataTexture && t.image.width === 256 && t.wrapS === THREE.RepeatWrapping);
    assert.deepEqual([...t.image.data.subarray(0, 4)], [...MACRO_NEUTRAL]);
    assert.equal(macroTexture(), t, '全页共用一张');
    return new MaterialLib({ painted_plaster: asset(), tunnel_concrete: { ...asset(), id: 'tunnel_concrete' } });
  });
  assert.equal(mats.base.matte.userData.detail, 'painted_plaster');
  assert.equal(mats.base.ext.userData.detail, 'tunnel_concrete');
  assert.equal(mats.base.homeMatte.userData.wear, true);
});

test('没有 document（node）：贴图那一步什么都不做，材质照常叠', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(macroTexture(), null);
  assert.equal(macroTexture(), null, '还是没有');
  const m = detailFor(new THREE.MeshStandardMaterial(), { painted_plaster: asset() }, 'matte');
  assert.equal(m.userData.detail, 'painted_plaster');
  assert.equal(detailFor(new THREE.MeshStandardMaterial(), {}, 'matte').userData.detail, undefined, '没有贴图：原样返回');
  assert.equal(detailFor(new THREE.MeshBasicMaterial(), { painted_plaster: asset() }, 'matte').userData.detail, undefined, '不是标准材质：原样返回');
});

test('三向投影的切线：六个面都是右手系（T × B = 面法线），着色器里也按同样的规则翻 u', () => {
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const n of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.3, 0.9, 0.1], [-0.8, 0.2, 0.5]]) {
    const f = detailFrame(n), c = cross(f.T, f.B);
    const axis = { x: 0, y: 1, z: 2 }[f.axis];
    assert.equal(c[axis], Math.sign(n[axis]), `法线 ${n}：T×B = ${c}`);
  }
  const { color } = worldDetailChunks(detailVariant(asset(), DETAIL_SURFACES.matte, MEMORY_PROFILES.full));
  assert.match(color, /wdN\.y >= 0\.0 \? -1\.0 : 1\.0/);
  assert.match(color, /wdN\.x >= 0\.0 \? -1\.0 : 1\.0/);
  assert.match(color, /wdN\.z >= 0\.0 \? 1\.0 : -1\.0/);
});

test('缓存键：前面的补丁没给缓存键时，按它的源码区分；同一份材质不叠两层', () => {
  const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
  a.onBeforeCompile = (s) => { s.fragmentShader += '//a'; };
  b.onBeforeCompile = (s) => { s.fragmentShader += '//b'; };
  worldDetail(a, asset(), DETAIL_SURFACES.matte); worldDetail(b, asset(), DETAIL_SURFACES.matte);
  assert.notEqual(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
  // 已经叠过细节的材质再叠污垢 / 再叠一次细节：原样返回，不重复声明变量
  const key = a.customProgramCacheKey(), hook = a.onBeforeCompile;
  worldWear(a); worldDetail(a, asset(), DETAIL_SURFACES.matte);
  assert.equal(a.onBeforeCompile, hook);
  assert.equal(a.customProgramCacheKey(), key);
  const w = worldWear(new THREE.MeshStandardMaterial());
  worldDetail(w, asset(), DETAIL_SURFACES.matte);
  assert.equal(w.userData.detail, undefined);
});
