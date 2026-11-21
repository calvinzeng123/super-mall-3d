// V45 冲锋枪的贴图整理（src/jimao/skins/smg-skin.js）：像素运算是纯函数，这里拿小尺寸的假贴图验；
// 要画布的那一段——没有 document 时必须什么都不做；再用一个假画布跑一遍，验换贴图、释放、着色器挂钩。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SMG_SKIN, smoothstep, boxBlur, processGun, processHands, detailHeights, detailPixels, skinShader, skinSmg } from '../src/jimao/skins/smg-skin.js';
import { createSmg } from '../src/jimao/smg.js';

const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const rgba = (size, fill) => { const d = new Uint8ClampedArray(size * size * 4); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const c = fill(x, y); d.set([c[0], c[1], c[2], 255], (y * size + x) * 4); } return d; };
const px = (d, size, x, y) => [...d.slice((y * size + x) * 4, (y * size + x) * 4 + 3)];

test('调参表：贴图尺寸在手机的预算里（不超过 1024，细节贴图不超过 512，一共三张细节）；粗糙度有下限，没有镜面', () => {
  assert.ok(SMG_SKIN.size <= 1024 && SMG_SKIN.mrSize <= SMG_SKIN.size && SMG_SKIN.detailSize <= 512);
  assert.ok(SMG_SKIN.gun.rough.min >= 0.3 && SMG_SKIN.gun.rough.max <= 1 && SMG_SKIN.hands.rough.fabric >= 0.85, '钢件不反光成镜面，布面不发亮');
  assert.ok(SMG_SKIN.gun.wear.amount <= 0.4, '棱边磨损是点到为止');
  assert.ok(Object.isFrozen(SMG_SKIN) && Object.isFrozen(SMG_SKIN.gun) && Object.isFrozen(SMG_SKIN.hands));
  assert.equal(smoothstep(0, 1, -1), 0); assert.equal(smoothstep(0, 1, 2), 1); assert.equal(smoothstep(2, 4, 3), 0.5);
});

test('盒式模糊：平的还是平的；一个亮点被摊开、总量不变；半径 0 不动；噪声的起伏变小', () => {
  const flat = new Float32Array(16 * 16).fill(0.7); boxBlur(flat, 16, 16, 3, 2); assert.ok(flat.every((v) => Math.abs(v - 0.7) < 1e-5));
  const dot = new Float32Array(16 * 16); dot[8 * 16 + 8] = 9; boxBlur(dot, 16, 16, 1, 1);
  assert.ok(Math.abs(dot[8 * 16 + 8] - 1) < 1e-5 && Math.abs(dot[7 * 16 + 7] - 1) < 1e-5 && dot[8 * 16 + 10] === 0);
  assert.ok(Math.abs(dot.reduce((a, b) => a + b, 0) - 9) < 1e-4);
  const same = new Float32Array([1, 2, 3, 4]); assert.equal(boxBlur(same, 2, 2, 0), same); assert.deepEqual([...same], [1, 2, 3, 4]);
  const r = seeded(5), noise = Float32Array.from({ length: 32 * 32 }, () => r()), sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const before = sd(noise); boxBlur(noise, 32, 32, 2, 1); assert.ok(sd(noise) < before * 0.35);
});

// 假的枪贴图：左半边是钢件（金属度 0.5）、右半边是聚合物（0.12）；颜色是偏暖的深灰，有大片明暗；粗糙度带方块噪声；
// 法线：平面上有压缩噪点，x = 20 和 x = 44 各有一道竖的凸棱；钢件上有一个红点、一道亮划痕
function fakeGun(size = 64) {
  const r = seeded(9), mrSize = size / 2;
  const base = rgba(size, (x, y) => { const v = 30 + (y < size / 2 ? 8 : -6); return x === 10 && y === 10 ? [200, 20, 20] : y === 40 && x > 4 && x < 16 ? [v + 40, v + 38, v + 36] : [v + 4, v, v - 3]; });
  const mr = rgba(mrSize, (x, y) => [255, ((x >> 2) + (y >> 2)) & 1 ? 60 : 200, x < mrSize / 2 ? 128 : 30]);
  const RIDGE = [40, 70, 128, 186, 216]; // 一道凸棱在法线贴图上的样子：左边朝左倒、右边朝右倒，四五个像素宽
  const normal = rgba(size, (x) => { const e = Math.abs(x - 20) <= 2 ? RIDGE[x - 18] : Math.abs(x - 44) <= 2 ? RIDGE[x - 42] : 0; return e ? [e, 128, 255] : [128 + Math.round((r() - 0.5) * 4), 128 + Math.round((r() - 0.5) * 4), 255]; });
  return { base, mr, normal, size, mrSize };
}

test('枪：钢件和聚合物分开（金属度只有两档）；粗糙度去掉方块、落在限幅里；颜色去暖、钢件比聚合物亮、云斑变小；红点留着；划痕更亮也更光', () => {
  const T = fakeGun(), P = SMG_SKIN.gun, orig = { base: T.base.slice(), mr: T.mr.slice() };
  const stats = processGun(T.base, T.mr, T.normal, T.size, P, T.mrSize);
  assert.ok(Math.abs(stats.metalShare - 0.5) < 0.05, `钢件占一半：${stats.metalShare}`);
  assert.ok(stats.roughMin >= P.rough.min - 1e-6 && stats.roughMax <= P.rough.max + 1e-6);
  // 金属度：钢件的平面上 = metalOut，聚合物 = 0
  assert.ok(Math.abs(px(T.mr, 32, 4, 20)[2] - P.metalOut * 255) <= 1); assert.equal(px(T.mr, 32, 28, 20)[2], 0);
  // 粗糙度：原来 60 / 200 的方块（差 140），现在同一种材质里相邻两块的差小得多；聚合物比钢件粗
  const g = (x, y) => px(T.mr, 32, x, y)[1];
  assert.ok(Math.abs(g(2, 26) - g(6, 26)) < 30, `方块压平：${g(2, 26)} / ${g(6, 26)}`);
  assert.ok(g(26, 26) > g(4, 26) + 15, '聚合物更哑');
  // 颜色：原来 r > b（偏暖），现在钢件 b > r（冷），聚合物接近中性；钢件比聚合物亮；上下两半原来差 14，现在更小
  const steel = px(T.base, 64, 8, 20), poly = px(T.base, 64, 56, 20), steelLow = px(T.base, 64, 8, 58), was = px(orig.base, 64, 8, 20), wasLow = px(orig.base, 64, 8, 58);
  assert.ok(was[0] > was[2] && steel[2] > steel[0], `去暖：${was} → ${steel}`); assert.ok(Math.abs(poly[0] - poly[2]) <= 2);
  assert.ok(steel[1] > poly[1] + 5, '钢件比聚合物亮一档');
  assert.ok(Math.abs(steel[1] - steelLow[1]) < Math.abs(was[1] - wasLow[1]), '云斑压小');
  assert.ok(steel[1] < 80, '还是深色的枪黑，不发白');
  // 红点原样
  const dot = px(T.base, 64, 10, 10); assert.ok(dot[0] > 150 && dot[1] < 60, `红点：${dot}`);
  // 划痕：比原来和周围的反差更大（锐化），那一格的粗糙度比旁边低
  const scratch = px(T.base, 64, 10, 40)[1] - px(T.base, 64, 10, 44)[1], scratchWas = px(orig.base, 64, 10, 40)[1] - px(orig.base, 64, 10, 44)[1];
  assert.ok(scratch > scratchWas, `划痕 ${scratchWas} → ${scratch}`);
  assert.ok(g(5, 20) < g(5, 23), '划痕处更光');
});

test('枪：棱边磨损只在钢件的凸棱上（聚合物的棱不磨），最多磨到 amount；法线平面上的噪点抹平、棱线原样', () => {
  // 断续：磨不磨看一张低频噪声——整条棱上至少有一段磨了、也不是每一格都磨到头
  const T = fakeGun(), P = SMG_SKIN.gun, plain = fakeGun(); for (let i = 0; i < plain.normal.length; i += 4) { plain.normal[i] = 128; plain.normal[i + 1] = 128; }
  const stats = processGun(T.base, T.mr, T.normal, T.size, P, T.mrSize); processGun(plain.base, plain.mr, plain.normal, plain.size, P, plain.mrSize);
  let steelGain = 0, polyGain = 0, maxGain = 0;
  for (let y = 0; y < 64; y++) {
    const a = px(T.base, 64, 20, y)[1] - px(plain.base, 64, 20, y)[1], b = px(T.base, 64, 44, y)[1] - px(plain.base, 64, 44, y)[1];
    steelGain += Math.max(0, a); polyGain += Math.max(0, b); maxGain = Math.max(maxGain, a);
  }
  if (process.env.SKIN_DEBUG) console.log({ stats, steelGain, polyGain, maxGain });
  assert.ok(stats.wearShare > 0 && stats.wearShare < 0.05, `磨亮的像素很少：${stats.wearShare}`);
  assert.ok(steelGain > 20, `钢件的棱磨亮了：${steelGain}`); assert.equal(polyGain, 0, '聚合物的棱不磨');
  assert.ok(maxGain <= (P.wear.color[1] - 20) * P.wear.amount + 2, `不是白线：最多亮 ${maxGain}`);
  // 磨亮处的金属度比平面高（露出来的钢）
  let mMax = 0; for (let y = 0; y < 32; y++) mMax = Math.max(mMax, px(T.mr, 32, 10, y)[2]); assert.ok(mMax > P.metalOut * 255 + 5);
  // 法线：平面上（原来 ±2 的噪点）回到 128；棱上的 60 / 196 没动
  for (const [x, y] of [[5, 5], [30, 30], [60, 50]]) { const n = px(T.normal, 64, x, y); assert.ok(Math.abs(n[0] - 128) <= 1 && Math.abs(n[1] - 128) <= 1, `平面 ${n}`); }
  assert.equal(px(T.normal, 64, 19, 30)[0], 70); assert.equal(px(T.normal, 64, 22, 30)[0], 216);
});

test('枪：金属粗糙度贴图和颜色一样大也行；全黑、全白的贴图不出 NaN', () => {
  const size = 16, base = rgba(size, () => [0, 0, 0]), mr = rgba(size, () => [255, 255, 255]), normal = rgba(size, () => [128, 128, 255]);
  const s = processGun(base, mr, normal, size); assert.ok(Number.isFinite(s.roughMin) && s.metalShare === 1);
  assert.ok(base.every((v) => Number.isFinite(v))); assert.ok(px(mr, size, 3, 3)[1] <= SMG_SKIN.gun.rough.max * 255 + 1);
  const white = rgba(size, () => [255, 255, 255]); processGun(white, rgba(size, () => [0, 0, 0]), rgba(size, () => [128, 128, 255]), size); assert.deepEqual(px(white, size, 4, 4), [255, 255, 255], '很亮的零件不动调子');
});

test('手：暗的皮面和亮的布面分开——布面粗糙度抬到 0.85 以上（原来 0.45，发亮），皮面略光；B 通道写成皮面的标记', () => {
  const P = SMG_SKIN.hands, small = rgba(16, (x) => (x < 8 ? [18, 18, 18] : [44, 46, 40])), mr = rgba(32, (x) => [255, x < 16 ? 215 : 115, 0]);
  const s = processHands(mr, 32, small, 16, P);
  const leather = px(mr, 32, 4, 10), fabric = px(mr, 32, 28, 10);
  assert.equal(leather[2], 255); assert.equal(fabric[2], 0); assert.ok(Math.abs(s.leatherShare - 0.5) < 0.1);
  assert.ok(fabric[1] / 255 >= 0.8, `布面 ${fabric[1] / 255}`); assert.ok(leather[1] < fabric[1] - 30 && leather[1] / 255 >= P.rough.min, `皮面 ${leather[1] / 255}`);
  assert.equal(leather[0], 255, '遮蔽通道不动');
});

test('细节贴图：三张高度图都在 0–1、能平铺；织物的线数对得上；转成像素以后平的地方法线是正上方、B 通道是高度', () => {
  const size = 64, H = detailHeights(size, { threads: 8 });
  for (const k of ['grain', 'pebble', 'weave']) {
    const h = H[k]; assert.equal(h.length, size * size, k); assert.ok(h.every((v) => v >= 0 && v <= 1), `${k} 在范围里`);
    let seam = 0, inner = 0; for (let y = 0; y < size; y++) { seam += Math.abs(h[y * size + size - 1] - h[y * size]); inner += Math.abs(h[y * size + 30] - h[y * size + 31]); }
    assert.ok(seam < inner * 3 + 1, `${k} 接缝 ${seam.toFixed(2)} / 内部 ${inner.toFixed(2)}`);
    const sd = Math.sqrt(h.reduce((a, v) => a + (v - 0.5) ** 2, 0) / h.length); assert.ok(sd > 0.03, `${k} 不是一片平的`);
  }
  // 织物：每根线的边上压到 0——一行里有 threads 个低谷
  let dips = 0; for (let x = 0; x < size; x++) if (H.weave[4 * size + x] < 0.05) dips++; assert.ok(dips >= 4 && dips <= 16, `低谷 ${dips}`);
  assert.deepEqual([...detailHeights(16).grain.slice(0, 8)], [...detailHeights(16).grain.slice(0, 8)], '可复现');
  const flat = detailPixels(new Float32Array(16 * 16).fill(0.25), 16); assert.deepEqual([...flat.slice(0, 4)].map(Math.round), [128, 128, 64, 255]);
  const ramp = new Float32Array(16 * 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) ramp[y * 16 + x] = x / 16;
  const n = detailPixels(ramp, 16, 2), i = (8 * 16 + 8) * 4; assert.ok(n[i] < 126 && Math.abs(n[i + 1] - 128) <= 1, '往 +x 升高：法线朝 −x 倒');
});

test('着色器挂钩：three 的标准材质片元着色器里三处都接上了（细节法线、粗糙度、明暗），参数进了 uniforms', () => {
  const U = { uSkinDetA: { value: null }, uSkinMask: { value: new THREE.Vector2(1, 0) } };
  const shader = skinShader({ uniforms: { a: 1 }, fragmentShader: THREE.ShaderLib.physical.fragmentShader }, U);
  assert.equal(shader.uniforms.uSkinDetA, U.uSkinDetA); assert.equal(shader.uniforms.a, 1);
  const f = shader.fragmentShader;
  assert.ok(f.includes('uniform sampler2D uSkinDetA;') && f.includes('uniform sampler2D uSkinDetB;'));
  assert.ok(f.includes('texelRoughness.b * uSkinMask.x') && f.includes('normal = normalize( normal + tbn * vec3( skinNormal, 0.0 ) );'));
  assert.ok(f.indexOf('uniform vec2 uSkinMask') < f.indexOf('texelRoughness.b * uSkinMask.x') && f.indexOf('texelRoughness.b * uSkinMask.x') < f.indexOf('tbn * vec3( skinNormal'), '先声明、再量、最后用');
  for (const inc of ['#include <normalmap_pars_fragment>', '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>']) assert.ok(THREE.ShaderLib.physical.fragmentShader.includes(inc), `three 里还有 ${inc}`);
});

// 一个带三种材质、六张贴图的假模型（枪的金属粗糙度贴图一张图三个槽共用；手套和袖子共用三张图）
function fakeModel(size = 64) {
  const closed = [], disposed = [];
  const image = (fill) => ({ width: size, height: size, data: rgba(size, fill), close() { closed.push(this); } });
  const tex = (fill, srgb) => { const t = new THREE.Texture(image(fill)); t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.addEventListener('dispose', () => disposed.push(t)); return t; };
  const gunMr = tex((x) => [255, 120, x < size / 2 ? 128 : 30]);
  const gun = new THREE.MeshStandardMaterial({ name: 'smg45', map: tex(() => [34, 32, 30], true), roughnessMap: gunMr, metalnessMap: gunMr, aoMap: gunMr, normalMap: tex(() => [128, 128, 255]) });
  const hb = tex((x) => (x < size / 2 ? [18, 18, 18] : [44, 46, 40]), true), hm = tex(() => [255, 115, 0]), hn = tex(() => [128, 128, 255]);
  const glove = new THREE.MeshStandardMaterial({ name: 'HandsGlove', map: hb, roughnessMap: hm, metalnessMap: hm, aoMap: hm, normalMap: hn });
  const sleeve = new THREE.MeshStandardMaterial({ name: 'HandsSleeve', map: hb, roughnessMap: hm, metalnessMap: hm, aoMap: hm, normalMap: hn });
  const other = new THREE.MeshStandardMaterial({ name: 'strap' });
  const scene = new THREE.Group(), geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  scene.add(new THREE.Mesh(geo, gun), new THREE.Mesh(geo, [glove, sleeve]), new THREE.Mesh(geo, other), new THREE.Mesh(geo, gun));
  return { scene, gun, glove, sleeve, other, closed, disposed, gunMr, hb, hm, hn };
}
/** 假画布：drawImage 记下源图（最近邻缩放）、getImageData 给出像素、putImageData 存回去 */
function fakeDocument() {
  const canvases = [];
  return { canvases, createElement(tag) {
    assert.equal(tag, 'canvas'); const c = { width: 0, height: 0, pixels: null };
    c.getContext = () => ({
      drawImage(img, x, y, w, h) { const d = new Uint8ClampedArray(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const s = (Math.floor(j * img.height / h) * img.width + Math.floor(i * img.width / w)) * 4; d.set(img.data.subarray(s, s + 4), (j * w + i) * 4); } c.pixels = d; },
      getImageData: (x, y, w, h) => ({ data: c.pixels.slice(), width: w, height: h }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData(img) { c.pixels = img.data; },
    });
    canvases.push(c); return c;
  } };
}

test('没有画布（测试环境）：skinSmg 什么都不改、不报错；没有贴图的假模型也照常挂上、释放', () => {
  assert.equal(typeof document, 'undefined');
  const M = fakeModel(16), before = { map: M.gun.map, rough: M.gun.roughnessMap, metal: M.glove.metalnessMap, hook: M.gun.onBeforeCompile };
  const s = skinSmg(M.scene);
  assert.equal(s.applied, false); assert.equal(s.textures.size, 0); assert.equal(M.gun.map, before.map); assert.equal(M.gun.roughnessMap, before.rough); assert.equal(M.glove.metalnessMap, before.metal); assert.equal(M.gun.onBeforeCompile, before.hook);
  assert.equal(M.disposed.length, 0); s.dispose();
  assert.equal(skinSmg(null).applied, false); assert.equal(skinSmg({}).applied, false);
  // smg.js：假模型（没贴图的标准材质）
  const camera = new THREE.PerspectiveCamera(), smg = createSmg({}, { camera }), scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial({ name: 'smg45' })));
  assert.equal(smg.attach({ scene }), true); assert.equal(smg.ready, true); assert.equal(smg.attach({ scene }), false);
  assert.deepEqual(Object.keys(smg).sort(), ['addAmmo', 'attach', 'dispose', 'muzzleWorld', 'ready', 'reset', 'root', 'spec', 'startReload', 'state', 'update'].sort(), '对外的接口没变');
  smg.dispose(); assert.equal(smg.root.parent, null);
});

test('有画布：枪换三张贴图（颜色、法线 1024 档，金属粗糙度小一号）、手换一张粗糙度；共用的图只算一遍；换下来的原贴图释放并关掉位图；手摘掉金属度贴图；释放时新贴图全清', () => {
  const doc = fakeDocument(); globalThis.document = doc;
  try {
    const M = fakeModel(64), S = { ...SMG_SKIN, size: 64, mrSize: 32, detailSize: 32 }, old = { map: M.gun.map, normal: M.gun.normalMap };
    const s = skinSmg(M.scene, { S });
    assert.equal(s.applied, true); assert.ok(s.stats.gun && s.stats.hands); assert.ok(s.ms >= 0);
    // 新建的贴图：枪 3 + 手 1 + 细节 3
    assert.equal(s.textures.size, 7); assert.deepEqual([...s.textures].map((t) => t.image.width).sort((a, b) => a - b), [32, 32, 32, 32, 32, 64, 64]);
    assert.ok(M.gun.map !== old.map && M.gun.map.isCanvasTexture && M.gun.map.colorSpace === THREE.SRGBColorSpace && M.gun.map.flipY === false, '颜色贴图换了，色彩空间、翻转沿用');
    assert.equal(M.gun.map.image.width, 64); assert.equal(M.gun.roughnessMap.image.width, 32);
    assert.ok(M.gun.roughnessMap === M.gun.metalnessMap && M.gun.roughnessMap === M.gun.aoMap && M.gun.roughnessMap !== M.gunMr, '三个槽还是共用一张');
    assert.equal(M.gun.normalMap.colorSpace, THREE.NoColorSpace);
    // 手：颜色、法线不动；粗糙度换了，两种材质共用；金属度贴图摘掉
    assert.equal(M.glove.map, M.hb); assert.equal(M.glove.normalMap, M.hn); assert.ok(M.glove.roughnessMap !== M.hm && M.glove.roughnessMap === M.sleeve.roughnessMap && M.glove.aoMap === M.glove.roughnessMap);
    assert.equal(M.glove.metalnessMap, null); assert.equal(M.sleeve.metalnessMap, null); assert.equal(M.glove.metalness, 0);
    // 原贴图：枪的三张、手的粗糙度那张释放了，位图也关了；没换的（手的颜色、法线）留着
    assert.deepEqual(new Set(M.disposed), new Set([old.map, old.normal, M.gunMr, M.hm])); assert.equal(M.closed.length, 4); assert.ok(!M.closed.includes(M.hb.image));
    // 着色器：三种材质都挂了；枪按金属度选细节（倍数 = 1 / metalOut），手套看皮面标记，袖子不看
    for (const m of [M.gun, M.glove, M.sleeve]) { assert.ok(m.userData.skin.uSkinDetA.value.isTexture && m.userData.skin.uSkinDetB.value.isTexture); assert.equal(m.customProgramCacheKey(), 'smg-skin-1'); const sh = { uniforms: {}, fragmentShader: THREE.ShaderLib.physical.fragmentShader }; m.onBeforeCompile(sh); assert.equal(sh.uniforms.uSkinA, m.userData.skin.uSkinA); }
    assert.ok(Math.abs(M.gun.userData.skin.uSkinMask.value.x - 1 / S.gun.metalOut) < 1e-9); assert.equal(M.glove.userData.skin.uSkinMask.value.x, 1); assert.equal(M.sleeve.userData.skin.uSkinMask.value.x, 0);
    assert.equal(M.gun.userData.skin.uSkinDetB.value, M.glove.userData.skin.uSkinDetA.value, '麻点和皮纹是同一张');
    assert.equal(M.gun.userData.skin.uSkinDetA.value.flipY, false);
    assert.equal(M.other.userData.skin, undefined, '不认识的材质不碰');
    // 写回去的像素：钢件那半边的金属度 = metalOut，手的布面粗糙度抬起来了
    const mrPx = M.gun.roughnessMap.image.pixels; assert.ok(Math.abs(mrPx[(10 * 32 + 4) * 4 + 2] - S.gun.metalOut * 255) <= 1); assert.equal(mrPx[(10 * 32 + 28) * 4 + 2], 0);
    assert.ok(M.glove.roughnessMap.image.pixels[(10 * 32 + 28) * 4 + 1] / 255 > 0.8);
    // 释放
    let gone = 0; for (const t of s.textures) t.addEventListener('dispose', () => gone++); s.dispose(); assert.equal(gone, 7); assert.equal(s.textures.size, 0);

    // 经 smg.js 走一遍：attach 里整理贴图，dispose 时原来的、新建的都释放
    const M2 = fakeModel(64), camera = new THREE.PerspectiveCamera(), smg = createSmg({}, { camera });
    assert.equal(smg.attach({ scene: M2.scene }), true); assert.ok(M2.gun.map.isCanvasTexture && M2.gun.map.anisotropy === SMG_SKIN.anisotropy); assert.equal(M2.hb.anisotropy, 4, '没换的贴图照旧设各向异性');
    const live = new Set(); for (const m of [M2.gun, M2.glove, M2.sleeve]) for (const v of [...Object.values(m), ...Object.values(m.userData.skin).map((u) => u.value)]) if (v?.isTexture) live.add(v);
    let freed = 0; for (const t of live) t.addEventListener('dispose', () => freed++);
    smg.dispose(); assert.ok(freed >= live.size, `全部释放：${freed} / ${live.size}`); assert.ok(M2.closed.includes(M2.hb.image), '留用的原贴图在 dispose 时关位图');
  } finally { delete globalThis.document; }
});

test('有画布但材质缺贴图：缺哪套就跳过哪套，不报错', () => {
  globalThis.document = fakeDocument();
  try {
    const M = fakeModel(32); M.gun.normalMap = null; // 枪缺法线：枪不处理，手照常
    const s = skinSmg(M.scene, { S: { ...SMG_SKIN, size: 32, mrSize: 16, detailSize: 16 } });
    assert.equal(s.applied, true); assert.equal(s.stats.gun, undefined); assert.ok(s.stats.hands); assert.equal(M.gun.userData.skin, undefined); assert.equal(M.gun.roughnessMap, M.gunMr);
    const bare = new THREE.Group(); bare.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial({ name: 'smg45' })));
    const s2 = skinSmg(bare); assert.equal(s2.applied, false); assert.equal(s2.textures.size, 0);
  } finally { delete globalThis.document; }
});
