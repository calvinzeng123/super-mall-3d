// 手枪、战术刀的贴图和模型（src/jimao/skins/pistol-skin.js、knife-skin.js）。
// 像素运算是纯函数，拿小尺寸的假贴图验；要画布的那一段——没有 document 时必须什么都不做，再用一个假画布跑一遍，验换贴图、释放旧贴图。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PISTOL_FINISH, smoothstep, boxBlur, bridgeFill, grainFill, scrubRects, paintCaps, scrubPixels, toneTables, analyse, patchMask, finishMR, finishBase, finishNormal, rowSampler, grainHeight, scrubMarkings, createPistolSkin } from '../src/jimao/skins/pistol-skin.js';
import { KNIFE_SHAPE, BLADE_FINISH, curveAt, bladeSection, buildKnife, normalFromHeight, bladePixels, gripPixels, satinPixels, createKnifeMaterials } from '../src/jimao/skins/knife-skin.js';
import { PISTOL_SKIN, knifeGeometry, scrubMarkings as arsenalScrub } from '../src/jimao/arsenal.js';

const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const rgba = (w, h, fill) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fill(x, y); d.set([c[0], c[1], c[2], 255], (y * w + x) * 4); } return d; };
const px = (d, w, x, y) => [...d.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];

test('手枪调参表：贴图不超过 1024、细节贴图 256；抹字的框都在 512 贴图里、有干净面可借；套筒比套筒座亮（半亮的烤蓝 / 哑的磷化），握把片不是金属', () => {
  for (const name of ['Slide', 'MainBody', 'Magazine']) {
    const P = PISTOL_FINISH[name]; assert.ok(P.size <= 1024 && P.size % 4 === 0 && (P.normal?.size || 0) <= 1024, name); assert.ok(Object.isFrozen(P) && Object.isFrozen(P.steel));
    assert.ok(P.steel.wear <= 0.75 && P.steel.wearAt[0] >= 1.3, '平面上不磨、棱上也只是点到为止'); assert.ok(P.steel.rough >= 0.28 && P.steel.rough <= 0.6, '没有镜面');
    assert.ok(P.detail.strength <= 0.3, '细颗粒要轻：不是砂纸');
  }
  assert.ok(PISTOL_FINISH.detailSize <= 256); assert.equal(PISTOL_FINISH.Magazine.size, 512, '弹匣只在换弹时露一下：不放大');
  assert.ok(PISTOL_FINISH.Slide.steel.rough < PISTOL_FINISH.MainBody.steel.rough, '套筒比套筒座亮');
  const [r, g, b] = PISTOL_FINISH.Slide.steel.color; assert.ok(b > r && b > g && b < 110, '烤蓝：偏蓝的深色');
  assert.equal(PISTOL_FINISH.MainBody.poly.metal, 0); assert.equal(PISTOL_FINISH.Slide.poly, null);
  let rects = 0;
  for (const spec of Object.values(PISTOL_SKIN.scrub)) {
    for (const q of spec.rects) { rects++; for (const box of [q.at, q.from]) assert.ok(box[0] >= 2 && box[1] >= 2 && box[0] + box[2] <= 510 && box[1] + box[3] <= 510, JSON.stringify(box)); assert.ok(!q.along || q.along === 'h'); }
    for (const [x, y, rad] of spec.discs || []) assert.ok(x - rad > 0 && y - rad > 0 && x + rad < 512 && y + rad < 512 && rad > 8);
  }
  assert.ok(rects >= 6, '两侧铭文、三处口径、编号都在表里'); assert.equal(PISTOL_SKIN.scrub.MainBody.discs.length, 2);
  assert.equal(smoothstep(0, 1, -1), 0); assert.equal(smoothstep(0, 1, 2), 1); assert.equal(smoothstep(2, 4, 3), 0.5); assert.equal(smoothstep(4, 2, 5), 0, '反过来也行');
});

test('盒式模糊：平的还是平的；一个亮点摊开、总量不变', () => {
  const flat = boxBlur(new Float32Array(12 * 12).fill(0.7), 12, 12, 3); assert.ok(flat.every((v) => Math.abs(v - 0.7) < 1e-5));
  const dot = new Float32Array(16 * 16); dot[8 * 16 + 8] = 9; const out = boxBlur(dot, 16, 16, 1);
  assert.ok(Math.abs(out[8 * 16 + 8] - 1) < 1e-5 && Math.abs(out[7 * 16 + 7] - 1) < 1e-5 && out[8 * 16 + 10] === 0); assert.ok(Math.abs(out.reduce((a, b) => a + b, 0) - 9) < 1e-4);
  assert.equal(dot[8 * 16 + 8], 9, '原数组不动');
});

test('抹字：框里的字没了、和框外接得上（竖拉丝：每一列还是它自己的亮度）；横着接也行；框外一个像素都不动；法线只接不搬', () => {
  // 竖拉丝的面：每一列一个亮度，从上到下慢慢变暗；框里写了一行深色的「字」
  const W = 48, col = (x) => 120 + ((x * 37) % 40), make = () => rgba(W, W, (x, y) => { const v = col(x) - y * 0.5; const ink = x >= 16 && x < 30 && y >= 14 && y < 26 && (x + y) % 3 === 0; return ink ? [30, 30, 30] : [v, v, v]; });
  const d = make(), before = d.slice();
  assert.equal(bridgeFill(d, W, W, [14, 12, 18, 16]), 18 * 16);
  for (let y = 12; y < 28; y++) for (let x = 14; x < 32; x++) assert.ok(Math.abs(d[(y * W + x) * 4] - (col(x) - y * 0.5)) < 1.6, `(${x},${y}) ${d[(y * W + x) * 4]}`);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (x < 14 || x >= 32 || y < 12 || y >= 28) assert.equal(d[(y * W + x) * 4], before[(y * W + x) * 4]);
  // 横着接：一行一个亮度
  const h = rgba(W, W, (x, y) => { const v = 100 + ((y * 29) % 50); return x >= 20 && x < 28 && y >= 20 && y < 30 ? [10, 10, 10] : [v, v, v]; });
  bridgeFill(h, W, W, [18, 18, 12, 14], { along: 'h' });
  for (let y = 18; y < 32; y++) assert.ok(Math.abs(h[(y * W + 24) * 4] - (100 + ((y * 29) % 50))) < 1.01);
  assert.equal(bridgeFill(d, W, W, [10, 10, 0, 5]), 0, '空框不动');
  // 搬颗粒：平的框里搬进来的是干净面上的起伏（平均亮度不变、不再是死平）；干净面是平的就什么都没搬
  const r = seeded(7), g = rgba(W, W, (x, y) => { if (x >= 4 && x < 20 && y >= 4 && y < 20) return [128, 128, 128]; const v = 128 + (r() - 0.5) * 40; return [v, v, v]; });
  grainFill(g, W, W, [4, 4, 16, 16], [26, 26, 16, 16]);
  let sum = 0, dev = 0; for (let y = 6; y < 18; y++) for (let x = 6; x < 18; x++) { const v = g[(y * W + x) * 4]; sum += v; dev += Math.abs(v - 128); }
  assert.ok(Math.abs(sum / 144 - 128) < 4 && dev / 144 > 3, `平均 ${(sum / 144).toFixed(1)}，起伏 ${(dev / 144).toFixed(1)}`);
  const f = rgba(W, W, () => [90, 90, 90]); grainFill(f, W, W, [4, 4, 16, 16], [26, 26, 16, 16]); assert.ok(f.every((v, i) => i % 4 === 3 || v === 90));
  // 按表抹：坐标是 512 贴图上的，换算到实际尺寸；法线贴图上刻的字填平成周围的朝向
  const spec = { rects: [{ at: [128, 128, 96, 96], from: [128, 16, 96, 96] }] }, S = 64;
  const nrm = rgba(S, S, (x, y) => (x >= 18 && x < 26 && y >= 18 && y < 26 ? [200, 60, 200] : [128, 128, 255]));
  assert.equal(scrubRects(nrm, S, S, spec, 'normal'), 12 * 12); assert.deepEqual(px(nrm, S, 22, 22), [128, 128, 255]);
  assert.equal(scrubRects(nrm, S, S, null, 'normal'), 0); assert.equal(scrubRects(nrm, S, S, {}, 'color'), 0);
});

test('握把螺帽：只画在圆片里；颜色是发黑的钢（不再是金色）、中间的内六角孔更黑；金属度写满；法线在倒角上朝外斜、平的地方朝上', () => {
  const S = 512, spec = { discs: [[256, 256, 60]] }, k = S / 512, c = 256;
  const col = rgba(S, S, () => [150, 120, 40]), data = rgba(S, S, () => [255, 140, 10]), nrm = rgba(S, S, () => [128, 128, 255]);
  assert.ok(paintCaps(col, S, S, spec, 'color') > 0); paintCaps(data, S, S, spec, 'data'); paintCaps(nrm, S, S, spec, 'normal');
  assert.deepEqual(px(col, S, 4, 4), [150, 120, 40], '圆片外不动'); assert.deepEqual(px(nrm, S, 4, 4), [128, 128, 255]); assert.deepEqual(px(data, S, 4, 4), [255, 140, 10]);
  const face = px(col, S, c + Math.round(32 * k), c), hole = px(col, S, c, c);
  assert.ok(face[0] < 80 && Math.abs(face[0] - face[2]) < 12, `钢色 ${face}`); assert.ok(hole[0] < face[0] * 0.5, '孔里是黑的');
  assert.equal(px(data, S, c + Math.round(32 * k), c)[2], 255, '金属'); assert.ok(px(data, S, c, c)[1] > px(data, S, c + Math.round(32 * k), c)[1], '孔里更涩');
  // 倒角：右边缘的法线朝右（红通道 > 128）、左边缘朝左；上边缘朝图的上方（glTF：绿通道 > 128）
  const rim = 59; // 倒角在半径 58.5–60 之间
  assert.ok(px(nrm, S, c + rim, c)[0] > 140 && px(nrm, S, c - rim - 1, c)[0] < 116, `${px(nrm, S, c + rim, c)} / ${px(nrm, S, c - rim - 1, c)}`);
  assert.ok(px(nrm, S, c, c - rim - 1)[1] > 140 && px(nrm, S, c, c + rim)[1] < 116);
  const flat = px(nrm, S, c + Math.round(30 * k), c); assert.ok(Math.abs(flat[0] - 128) < 6 && Math.abs(flat[1] - 128) < 6 && flat[2] > 250);
  assert.equal(paintCaps(col, S, S, {}, 'color'), 0); assert.equal(scrubPixels(col, S, S, null, 'color'), 0);
});

/** 一块 n × n 的假原图：平面亮度 flat，x = edge 那两列是烤出来的亮棱，y = groove 那两行是凹缝；右半边（握把片）金属度是 0 */
function fakeMaps(n, { flat = 138, edge = 20, groove = 40, poly = false } = {}) {
  const r = seeded(11);
  const base = rgba(n, n, (x, y) => { const v = (x === edge || x === edge + 1 ? 250 : y === groove || y === groove + 1 ? 45 : flat + (r() - 0.5) * 16); return [v, v, v]; });
  const mr = rgba(n, n, (x) => [255, 100 + (r() - 0.5) * 50, poly && x >= n / 2 ? 10 : 245]);
  const nrm = rgba(n, n, (x, y) => (x === edge || x === edge + 1 ? [215, 128, 190] : [128 + (r() - 0.5) * 5, 128 + (r() - 0.5) * 5, 254]));
  return { base, mr, nrm };
}

test('表面：量原图（钢件 / 握把片分开，平面的相对亮度是 1）；查找表——平面不磨、棱上磨、凹缝算凹缝', () => {
  const n = 64, P = PISTOL_FINISH.MainBody, { base, mr } = fakeMaps(n, { flat: 82, poly: true });
  const A = analyse(base, mr, n, P);
  assert.equal(A.steel[10 * n + 10], 1); assert.equal(A.steel[10 * n + 50], 0); assert.equal(analyse(base, mr, n, PISTOL_FINISH.Slide).steel, null, '套筒整个是钢件');
  const v = base[(10 * n + 10) * 4] * A.kref[10 * n + 10] / 64; assert.ok(v > 0.8 && v < 1.25, `平面的相对亮度 ${v.toFixed(2)}`);
  assert.ok(base[(30 * n + 20) * 4] * A.kwref[30 * n + 20] / 64 > 2, '亮棱的相对亮度远高于 1');
  const T = toneTables(P.steel), at = (x) => Math.round(x * 64);
  assert.equal(T.wear[at(1)], 0); assert.equal(T.wear[at(1.25)], 0); assert.ok(Math.abs(T.wear[at(2.5)] - P.steel.wear) < 1e-6); assert.ok(T.wear[at(1.6)] > 0 && T.wear[at(1.6)] < P.steel.wear);
  assert.ok(Math.abs(T.shade[at(1)] - 1) < 1e-6 && T.shade[at(0.2)] < 0.6 && T.shade[at(3)] <= 1 + (P.steel.hi - 1) * P.steel.contrast + 1e-6, '明暗限幅');
  assert.equal(T.cav[at(1)], 0); assert.equal(T.cav[at(0.3)], 1);
  const m = patchMask(Float32Array.from([0, 0.36, 0.47, 0.58, 1]), [0.36, 0.58]); assert.ok(m[0] === 0 && m[1] < 1e-9 && m[4] === 1 && Math.abs(m[2] - 0.5) < 1e-5);
});

test('表面：重新上色——放大一倍；平面是烤蓝的深色（偏蓝）、亮棱磨出钢色但只在噪声放行的地方、凹缝更暗；握把片是黑的', () => {
  const n = 64, size = 128, P = PISTOL_FINISH.Slide, { base, mr } = fakeMaps(n), A = analyse(base, mr, n, P);
  const on = new Float32Array(256 * 256).fill(1), off = new Float32Array(256 * 256), out = new Uint8ClampedArray(size * size * 4), bare = new Uint8ClampedArray(size * size * 4);
  finishBase(out, size, base, A, n, P, grainHeight(256, 11), on, 256); finishBase(bare, size, base, A, n, P, null, off, 256);
  assert.ok(out.every((v, i) => i % 4 !== 3 || v === 255), '不透明度写满');
  const flat = px(out, size, 90, 20), edge = px(out, size, 41, 20), cav = px(out, size, 90, 81), [cr, cg, cb] = P.steel.color;
  assert.ok(Math.abs(flat[0] - cr) < cr * 0.3 && flat[2] > flat[0] + 8, `平面 ${flat}`); assert.ok(edge[0] > flat[0] + 35, `棱 ${edge}`); assert.ok(cav[0] < flat[0] * 0.75, `凹缝 ${cav}`);
  assert.ok(px(bare, size, 41, 20)[0] < edge[0] - 20, '噪声不放行的地方棱不磨'); assert.ok(px(bare, size, 41, 20)[0] <= cr * 1.45, '没磨的棱只比平面亮一点：不是一圈白边');
  // 握把片：黑的、不发蓝
  const B = PISTOL_FINISH.MainBody, M = fakeMaps(n, { flat: 45, poly: true }), AB = analyse(M.base, M.mr, n, B), o2 = new Uint8ClampedArray(n * n * 4);
  finishBase(o2, n, M.base.slice(), AB, n, B, null, on, 256);
  const grip = px(o2, n, 54, 10); assert.ok(grip[0] < 40 && Math.abs(grip[0] - grip[2]) < 6, `握把片 ${grip}`);
  // 放大：不改尺寸时每个像素取的就是原图那个像素
  const src = rgba(4, 4, (x, y) => [x * 10 + y, 0, 0]), row = rowSampler(src, 4, 4), buf = row(2, 0, new Float32Array(4)); assert.deepEqual([...buf], [2, 12, 22, 32]);
  const up = rowSampler(src, 4, 8)(0, 0, new Float32Array(8)); assert.ok(up[0] === 0 && up[7] === 30 && up[3] > up[2] && up[2] > up[1], '放大是平滑过渡的');
});

test('表面：金属粗糙度——粗糙度收拢到目标值附近（不再一块一块）、磨亮的棱更光、凹缝更涩；金属度按类别写', () => {
  const n = 64, P = PISTOL_FINISH.MainBody, { base, mr } = fakeMaps(n, { flat: 82, poly: true }), A = analyse(base, mr, n, P), before = mr.slice();
  finishMR(mr, base, n, A, P, new Float32Array(256 * 256).fill(1), 256);
  const rough = (x, y) => mr[(y * n + x) * 4 + 1] / 255, spread = (d, x0) => { let lo = 1, hi = 0; for (let y = 4; y < 36; y++) for (let x = x0; x < x0 + 12; x++) { const v = d[(y * n + x) * 4 + 1] / 255; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
  assert.ok(Math.abs(rough(8, 10) - P.steel.rough) < 0.08, `钢件 ${rough(8, 10).toFixed(2)}`); assert.ok(Math.abs(rough(52, 10) - P.poly.rough) < 0.08, `握把片 ${rough(52, 10).toFixed(2)}`);
  assert.ok(spread(mr, 4) < spread(before, 4) * 0.4, '起伏小多了'); assert.ok(rough(20, 10) < rough(8, 10) - 0.05, '棱更光'); assert.ok(rough(8, 40) > rough(8, 10) + 0.1, '凹缝更涩');
  assert.equal(mr[(10 * n + 8) * 4 + 2], Math.floor(P.steel.metal * 255)); assert.equal(mr[(10 * n + 52) * 4 + 2], 0); assert.equal(mr[0], 255);
});

test('表面：法线——平面上的压缩噪点抹平，棱还在、而且更陡；每个像素都是单位长度', () => {
  const n = 64, size = 128, P = PISTOL_FINISH.Slide, { base, mr, nrm } = fakeMaps(n), A = analyse(base, mr, n, P), out = new Uint8ClampedArray(size * size * 4);
  finishNormal(out, size, nrm, A, n, P);
  const flat = px(out, size, 90, 20); assert.ok(Math.abs(flat[0] - 128) <= 1 && Math.abs(flat[1] - 128) <= 1 && flat[2] >= 254, `平面 ${flat}`);
  assert.ok(px(out, size, 41, 20)[0] > 205, `棱 ${px(out, size, 41, 20)}`);
  for (const [x, y] of [[90, 20], [41, 20], [3, 100], [127, 127]]) { const [r, g, b] = px(out, size, x, y).map((v) => v / 127.5 - 1); assert.ok(Math.abs(Math.hypot(r, g, b) - 1) < 0.03); }
  const h = grainHeight(64, 3); assert.equal(h.length, 64 * 64); assert.ok(h.every((v) => v >= 0 && v <= 1));
});

/** 假画布：够 pistol-skin.js 读像素、写像素、包成贴图用 */
function fakeDocument() {
  const made = [];
  const createElement = () => {
    const c = { width: 0, height: 0, _d: null };
    c.getContext = () => ({
      drawImage(img) { c._d = new Uint8ClampedArray(c.width * c.height * 4); if (img.data && img.width === c.width) c._d.set(img.data); },
      getImageData: () => ({ data: c._d.slice(), width: c.width, height: c.height }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData(img) { c._d = img.data; },
    });
    made.push(c); return c;
  };
  return { createElement, made };
}
function fakeMaterial(name, n = 64) {
  const M = fakeMaps(n), closed = [], disposed = [];
  const tex = (data, tag) => { const t = new THREE.Texture({ width: n, height: n, data, close() { closed.push(tag); } }); t.flipY = false; t.addEventListener('dispose', () => disposed.push(tag)); return t; };
  const m = new THREE.MeshStandardMaterial({ name }); m.map = tex(M.base, 'map'); m.normalMap = tex(M.nrm, 'normal'); m.roughnessMap = m.metalnessMap = tex(M.mr, 'mr'); m.color.setScalar(0.38);
  return { m, closed, disposed };
}

test('没有 document（测试环境）：整理器什么都不做、材质原样；抹字返回 0；arsenal.js 导出的 scrubMarkings 还是老约定', () => {
  assert.equal(typeof document, 'undefined');
  const { m, closed } = fakeMaterial('Slide'), old = m.map, dr = createPistolSkin();
  assert.equal(dr.dress(m, PISTOL_SKIN.scrub.Slide), false); assert.equal(m.map, old); assert.equal(m.color.r, 0.38); assert.equal(m.userData.dressed, undefined); assert.equal(closed.length, 0);
  assert.equal(dr.dress(null), false); assert.equal(dr.dress(new THREE.MeshStandardMaterial({ name: 'Slide' })), false, '没贴图的材质（测试里的假模型）');
  assert.equal(dr.textures.size, 0); assert.equal(dr.ms, 0); dr.seal(); dr.dispose();
  assert.equal(scrubMarkings(m, PISTOL_SKIN.scrub.Slide), 0); assert.equal(arsenalScrub(m, PISTOL_SKIN.scrub.Slide, null), 0); assert.equal(scrubMarkings(null, PISTOL_SKIN.scrub.Slide, {}), 0); assert.equal(scrubMarkings(m, null, {}), 0);
});

test('有画布：三张贴图换成新的（颜色、法线放大，金属粗糙度一张两用），旧贴图释放、图也关掉；颜色乘数回到白；不认识的材质不动；单独抹字只换图不换贴图', () => {
  const doc = fakeDocument(); globalThis.document = doc;
  try {
    const F = { ...PISTOL_FINISH, Slide: { ...PISTOL_FINISH.Slide, size: 128 }, Magazine: { ...PISTOL_FINISH.Magazine, size: 64 } }, dr = createPistolSkin({ F }), { m, closed, disposed } = fakeMaterial('Slide'), old = [m.map, m.normalMap, m.roughnessMap];
    assert.equal(dr.dress(m, { rects: [{ at: [300, 300, 60, 60], from: [300, 200, 60, 60] }] }), true);
    assert.ok(!old.includes(m.map) && !old.includes(m.normalMap) && !old.includes(m.roughnessMap)); assert.equal(m.roughnessMap, m.metalnessMap);
    assert.deepEqual([m.map.image.width, m.normalMap.image.width, m.roughnessMap.image.width], [128, 128, 64]);
    assert.deepEqual(closed.sort(), ['map', 'mr', 'normal']); assert.deepEqual(disposed.sort(), ['map', 'mr', 'normal'], '旧贴图各释放一次');
    assert.equal(m.color.r, 1); assert.equal(m.userData.dressed, true); assert.equal(m.map.flipY, false); assert.equal(typeof m.onBeforeCompile, 'function'); assert.ok(m.userData.detail, '叠了细颗粒');
    const d = m.map.image._d, i = (40 * 128 + 180 % 128) * 4; assert.ok(d[i + 2] > d[i] && d[i] < 120, `新颜色贴图是烤蓝的深色 ${[d[i], d[i + 1], d[i + 2]]}`);
    assert.equal(dr.textures.size, 2, '细颗粒：法线 + 粗糙度，几种材质共用'); assert.ok(dr.ms >= 0 && dr.steps.base >= 0);
    const second = fakeMaterial('Magazine'); assert.equal(dr.dress(second.m), true); assert.equal(dr.textures.size, 2); assert.equal(second.m.map.image.width, 64); assert.deepEqual(second.closed.sort(), ['map', 'mr'], '弹匣的法线贴图不动');
    const other = fakeMaterial('Bullet'); assert.equal(dr.dress(other.m), false); assert.equal(other.closed.length, 0);
    const own = [...dr.textures], gone = []; for (const t of own) t.addEventListener('dispose', () => gone.push(t)); dr.seal(); dr.dispose(); assert.equal(gone.length, 2); assert.equal(dr.textures.size, 0);
    // 只抹字
    const plain = fakeMaterial('Slide'), keep = plain.m.map;
    assert.equal(scrubMarkings(plain.m, { rects: [{ at: [300, 300, 60, 60], from: [300, 200, 60, 60] }] }, doc), 3, '颜色、法线、金属粗糙度（一张两用，只算一次）');
    assert.equal(plain.m.map, keep); assert.equal(plain.m.map.userData.scrubbed, true); assert.deepEqual(plain.closed.sort(), ['map', 'mr', 'normal']);
    assert.equal(scrubMarkings(plain.m, { rects: [] }, doc), 0, '抹过的不再抹');
  } finally { delete globalThis.document; }
});

// ---- 战术刀 ----
test('刀的轮廓：曲线过控制点、不鼓包；截面从刀背到刃口的顺序不乱；根部不开刃、中段有主刃面和血槽、刀尖收成一个点', () => {
  const B = KNIFE_SHAPE.blade;
  for (const [x, y] of B.edge) assert.ok(Math.abs(curveAt(B.edge, x) - y) < 1e-9);
  assert.equal(curveAt(B.spine, -1), B.spine[0][1]); assert.equal(curveAt(B.spine, 9), B.spine.at(-1)[1]);
  for (let t = 0; t <= B.clip; t += 0.004) assert.ok(Math.abs(curveAt(B.spine, t) - 0.0125) < 1e-9, '刀背前一大段是平的');
  let prev = Infinity; for (let t = B.clip; t <= B.len; t += 0.002) { const z = curveAt(B.spine, t); assert.ok(z <= prev + 1e-9, '假刃一路往下收'); prev = z; }
  for (let t = -0.005; t <= B.len + 1e-9; t += 0.001) {
    const s = bladeSection(t);
    assert.ok(s.zs >= s.zw - 1e-9 && s.zw >= s.zg - 1e-9 && s.zg >= s.zh - 1e-9 && s.zh >= s.ze - 1e-9, `t=${t.toFixed(3)}`); assert.ok(s.th >= 0 && s.th <= B.half + 1e-9 && s.hs <= s.th + 1e-9 && s.he <= s.th + 1e-9);
  }
  const root = bladeSection(0.002), mid = bladeSection(0.06), tip = bladeSection(B.len);
  assert.ok(root.zg - root.ze < 1e-9 && Math.abs(root.he - root.th) < 1e-9 && root.fd === 0, '刀根：整厚、没有刃面、没有血槽');
  assert.ok(Math.abs(mid.zg - mid.ze - B.bevel) < 1e-6 && mid.he < 0.0005 && mid.fd > 0.0006 && mid.zw === mid.zs, '中段：主刃面、血槽，没有假刃');
  assert.ok(bladeSection(0.14).zw < bladeSection(0.14).zs - 0.002, '刀尖那段有假刃'); assert.ok(tip.th < 1e-9 && Math.abs(tip.zs - tip.ze) < 1e-9, '刀尖是一个点');
  assert.ok(mid.zs - mid.ze > 0.026 && mid.zs - mid.ze < 0.03, '刃宽不到三厘米'); assert.ok(bladeSection(0.13).th < mid.th, '越往刀尖越薄');
});

test('刀的模型：四件都有、没有坏数；刀身 17 厘米、五毫米厚，法线朝外；血槽真的凹进去；握把有防滑槽；尾锤在握把下面、护手两边伸出刀身；贴图坐标在 0–1 里', () => {
  const k = buildKnife(), B = KNIFE_SHAPE.blade;
  for (const [name, g] of Object.entries(k)) {
    assert.ok(['blade', 'fuller', 'handle', 'guard'].includes(name)); assert.ok(g.attributes.position.count > 300, name);
    for (const a of ['position', 'normal', 'uv']) assert.ok(g.attributes[a] && g.attributes[a].array.every(Number.isFinite), `${name}.${a}`);
    g.computeBoundingBox();
  }
  const bb = k.blade.boundingBox;
  assert.ok(Math.abs(bb.max.y - (B.y0 + B.len)) < 1e-6 && bb.min.y < B.y0, '刀根伸进护手里'); assert.ok(Math.abs(bb.max.x - B.half) < 1e-6 && Math.abs(bb.min.x + B.half) < 1e-6);
  assert.ok(bb.max.z > 0.012 && bb.min.z < -0.015, '刀背在 +z、刃口在 −z');
  const p = k.blade.attributes.position, nrm = k.blade.attributes.normal, uv = k.blade.attributes.uv; let wrong = 0;
  for (let i = 0; i < p.count; i++) { if (Math.abs(p.getX(i)) > 2e-4 && Math.sign(p.getX(i)) * nrm.getX(i) < -0.05) wrong++; assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1); }
  assert.equal(wrong, 0, '两面的法线都朝外');
  const fp = k.fuller.attributes.position; let deep = B.half; for (let i = 0; i < fp.count; i++) if (fp.getY(i) > B.y0 + 0.05 && fp.getY(i) < B.y0 + 0.08) deep = Math.min(deep, Math.abs(fp.getX(i)));
  assert.ok(deep < B.half - 0.0006, `血槽凹进去 ${((B.half - deep) * 1000).toFixed(2)} 毫米`);
  const hp = k.handle.attributes.position, hn = k.handle.attributes.normal, radii = []; let inward = 0;
  for (let i = 0; i < hp.count; i++) { if (hp.getX(i) * hn.getX(i) + hp.getZ(i) * hn.getZ(i) < 0) inward++; if (Math.abs(hp.getZ(i)) < 1e-6 && hp.getX(i) > 0 && i % 29 === 0) radii.push([hp.getY(i), hp.getX(i)]); } // 每圈 29 个点，取每圈的第一个
  assert.equal(inward, 0); radii.sort((a, b) => a[0] - b[0]);
  let dips = 0; for (let i = 1; i < radii.length - 1; i++) if (radii[i][1] < radii[i - 1][1] && radii[i][1] < radii[i + 1][1] && radii[i][1] < KNIFE_SHAPE.handle.a * 0.985) dips++;
  assert.equal(dips, KNIFE_SHAPE.handle.grooves, '防滑槽的条数');
  const gb = k.guard.boundingBox; assert.ok(Math.abs(gb.min.y - KNIFE_SHAPE.pommel.y1) < 0.002 && gb.max.y > KNIFE_SHAPE.guard.y + 0.005, '尾锤在最下面（倒角往外多出一毫米多）'); assert.ok(gb.min.z < bb.min.z - 0.008 && gb.max.z > bb.max.z + 0.005, '护手伸出刀身');
  for (const g of Object.values(k)) g.dispose();
  // arsenal.js 那一层：倾到握把的角度，老测试量的「刀身长」还在 15–22 厘米
  const tilted = knifeGeometry(); tilted.blade.computeBoundingBox(); const tb = tilted.blade.boundingBox, len = Math.hypot(tb.max.y - tb.min.y, tb.max.z - tb.min.z);
  assert.ok(len > 0.15 && len < 0.22, `刀身 ${len.toFixed(3)} 米`); assert.deepEqual(Object.keys(tilted).sort(), ['blade', 'fuller', 'guard', 'handle']);
});

test('刀的贴图：刀面是深色涂层、主刃面是亮的缎面钢、刃口最亮也最光；涂层不是纯金属；血槽里暗一点；法线贴图平的地方朝上；握把、钢件的图可平铺', () => {
  const P = bladePixels(), { w, h, z0, z1 } = KNIFE_SHAPE.tex; assert.deepEqual([P.w, P.h, P.color.length, P.mr.length, P.height.length], [w, h, w * h * 4, w * h * 4, w * h]);
  assert.ok(w <= 1024 && h <= 1024);
  const at = (t, z) => { const x = Math.round(t / KNIFE_SHAPE.blade.len * w), y = Math.round((z - z0) / (z1 - z0) * h), o = (y * w + x) * 4; return { c: P.color[o], rough: P.mr[o + 1] / 255, metal: P.mr[o + 2] / 255 }; };
  const s = bladeSection(0.06), avg = (z, key) => { let a = 0; for (let t = 0.05; t < 0.09; t += 0.002) a += at(t, z)[key]; return a / 20; };
  const coat = avg(s.fz + s.fw + 0.0012, 'c'), bevel = avg((s.zg + s.zh) / 2, 'c'), hone = avg(s.ze + 0.0003, 'c'), groove = avg(s.fz, 'c');
  assert.ok(coat < 90 && bevel > coat + 25 && hone > bevel + 30, `涂层 ${coat.toFixed(0)} / 刃面 ${bevel.toFixed(0)} / 刃口 ${hone.toFixed(0)}`); assert.ok(groove < coat, '血槽里暗');
  assert.ok(avg(s.ze + 0.0003, 'rough') < avg((s.zg + s.zh) / 2, 'rough') && avg((s.zg + s.zh) / 2, 'rough') < avg(s.fz + s.fw + 0.0012, 'rough'), '越磨越光');
  assert.ok(avg(s.fz + s.fw + 0.0012, 'metal') < 0.6 && avg((s.zg + s.zh) / 2, 'metal') > 0.98, '涂层有漫反射，钢是金属');
  assert.ok(P.mr.every((v, i) => i % 4 !== 1 || (v >= 0.12 * 255 && v <= 0.8 * 255)), '没有镜面、也没有粉笔');
  assert.ok(BLADE_FINISH.hone.rough < BLADE_FINISH.bevel.rough && BLADE_FINISH.bevel.rough < BLADE_FINISH.coat.rough);
  const flat = normalFromHeight(new Float32Array(8 * 4).fill(0.4), 8, 4, 2); assert.deepEqual([flat[0], flat[1], flat[2], flat[3]], [128, 128, 255, 255]);
  const ramp = normalFromHeight(Float32Array.from({ length: 16 }, (_, i) => (i % 4) * 0.25), 4, 4, 1); assert.ok(ramp[(1 * 4 + 1) * 4] < 110 && Math.abs(ramp[(1 * 4 + 1) * 4 + 1] - 127.5) <= 1, '往右升高的坡：法线朝左');
  for (const T of [gripPixels(64, 4), satinPixels(64)]) {
    assert.equal(T.color.length, 64 * 64 * 4); assert.ok(T.height.every((v) => v >= 0 && v <= 1.0001));
    const n = normalFromHeight(T.height, 64, 64, 1, true); assert.ok(n.every(Number.isFinite));
  }
  const G = gripPixels(64, 4); assert.ok(G.mr.every((v, i) => i % 4 !== 2 || v === 0), '橡胶不是金属'); assert.ok(G.color[0] < 60);
});

test('刀的材质：没有 document 时是三个单色材质、没有贴图；dispose 不出错', () => {
  const M = createKnifeMaterials();
  assert.equal(M.textures.length, 0); assert.equal(M.ms, 0);
  for (const m of [M.blade, M.handle, M.steel]) { assert.ok(m.isMeshStandardMaterial); assert.equal(m.map, null); assert.equal(m.normalMap, null); }
  assert.equal(M.blade.metalness, 1); assert.equal(M.handle.metalness, 0); assert.ok(M.handle.color.r < M.steel.color.r && M.steel.color.r < M.blade.color.r);
  M.dispose();
});
