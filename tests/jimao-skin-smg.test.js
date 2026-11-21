// V45 冲锋枪的贴图整理（src/jimao/skins/smg-skin.js）：像素运算是纯函数，这里拿小尺寸的假贴图、假网格验；
// 要画布的那一段——没有 document 时必须什么都不做；再用一个假画布跑一遍，验换贴图、释放、着色器挂钩。
// 着色器本身（GLSL）在 node 里编译不了：这里只验挂钩的位置在 three 里还在、该插的都插上了，真编译靠预览台出图。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SMG_SKIN, SMG_GRIP, PART, ZONE, smoothstep, boxBlur, classifySmg, partMap, processGun, processHands, detailHeights, detailPixels, skinShader, skinSmg, gripPose } from '../src/jimao/skins/smg-skin.js';
import { createSmg } from '../src/jimao/smg.js';

const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const rgba = (size, fill) => { const d = new Uint8ClampedArray(size * size * 4); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const c = fill(x, y); d.set([c[0], c[1], c[2], 255], (y * size + x) * 4); } return d; };
const px = (d, size, x, y) => [...d.slice((y * size + x) * 4, (y * size + x) * 4 + 3)];
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

test('调参表：贴图尺寸在手机的预算里；每类零件的粗糙度有下限（没有镜面）；聚合物不是金属；亮棱只留一小部分；类别编号和表对得上', () => {
  const S = SMG_SKIN, G = S.gun;
  assert.ok(S.size <= 1024 && S.mrSize <= S.size && S.partSize <= S.size && S.detailSize <= 512);
  assert.ok(Object.isFrozen(S) && Object.isFrozen(G) && Object.isFrozen(G.parts) && Object.isFrozen(G.parts[0]) && Object.isFrozen(S.hands));
  for (const [name, i] of Object.entries(PART)) if (i !== PART.NONE) assert.equal(G.parts[i].name, name.toLowerCase(), `PART.${name} 对应 parts[${i}]`);
  assert.equal(G.parts.length, Object.keys(PART).length - 1);
  for (const p of G.parts) {
    assert.ok(p.min >= 0.3 && p.min <= p.rough && p.rough <= G.rough.max && G.rough.max <= 1, `${p.name}：粗糙度 ${p.min} ≤ ${p.rough} ≤ ${G.rough.max}`);
    assert.ok(p.wear >= 0 && p.wear <= 1 && p.metal >= 0 && p.metal <= 1 && p.keep >= 0 && p.keep <= 1 && p.ao >= 0 && p.ao < 1);
    assert.ok(p.tone < 60, `${p.name} 是深色的`);
  }
  for (const k of ['BODY', 'STOCK', 'RUBBER']) assert.equal(G.parts[PART[k]].metal, 0, `${k} 是聚合物 / 橡胶`);
  assert.ok(G.parts[PART.MAG].metal > 0.5 && G.parts[PART.MAG].rough < G.parts[PART.BODY].rough, '弹匣是钢的，比机匣光');
  assert.ok(G.parts[PART.STOCK].stipple > 0 && G.parts[PART.BODY].fine > 0 && G.parts[PART.STEEL].grain > 0, '三种细节各有归属');
  assert.ok(G.edge.max <= 0.7 && G.edge.keep <= 0.2 && G.edge.patch[0] >= 0.45, '烘焙的亮棱：没选中的几乎抹光，选中的也打折，选中的不到一半');
  assert.ok(G.neutral >= 0 && G.neutral <= 1 && G.f90 > 0 && G.f90 <= 1 && G.mottle.scale > 0 && G.mottle.albedo < 0.5 && G.mottle.rough < 0.3 && G.mottle.metal <= 1);
  assert.ok(G.grip.dark < 1 && G.grip.rough >= 0.65, '握把和枪托同一种黑塑料：更深、更哑');
  assert.ok(G.parts[PART.MAG].rough >= 0.55, '弹匣哑光，不是一条镜面');
  assert.ok(G.parts[PART.BODY].tone <= G.parts[PART.STOCK].tone && G.parts[PART.BODY].tint[2] > G.parts[PART.BODY].tint[0], '机匣是冷一点的炭黑，不比枪托浅');
  assert.ok(S.hands.sleeve.B.scale >= 40 && S.hands.sleeve.B.normal <= 0.2, '袖子的织纹细到一根线不到一个像素、法线压低（不起摩尔纹）');
  assert.ok(S.hands.rough.fabric >= 0.85, '布面不发亮');
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
  // 不是方的也行
  const wide = new Float32Array(8 * 4).fill(2); boxBlur(wide, 8, 4, 2, 2); assert.ok(wide.every((v) => Math.abs(v - 2) < 1e-5));
});

test('零件归类：按网格名、按 UV 岛在枪上的位置；不认识的网格不归类', () => {
  const kind = (c) => c & 255, flag = (c) => c >> 8;
  assert.equal(kind(classifySmg('MagazineGeometry', [-2, -15, -2], [2, 14, 3])), PART.MAG); assert.ok(flag(classifySmg('MagazineGeometry', [0, 0, 0], [1, 1, 1])) & ZONE.CONTACT);
  assert.equal(classifySmg('ChamberedRoundGeometry', [0, 0, 0], [1, 1, 1]), PART.BRASS);
  assert.equal(classifySmg('BoltGeometry', [0, 0, 0], [1, 1, 1]), PART.BRIGHT); assert.equal(classifySmg('ChargingHandleGeometry', [0, 0, 0], [1, 1, 1]), PART.BRIGHT);
  assert.equal(classifySmg('TriggerGeometry', [0, 0, 0], [1, 1, 1]), PART.STEEL);
  assert.equal(classifySmg('armmesh', [0, 0, 0], [1, 1, 1]), -1); assert.equal(classifySmg('', [0, 0, 0], [1, 1, 1]), -1);
  // 机身：托底、枪托、铰链、照门、枪口、导轨、弹匣口、握把、其余
  assert.equal(classifySmg('WeaponBody', [-1.5, -5, -38.5], [1.5, 15, -36.5]), PART.RUBBER);
  assert.equal(classifySmg('WeaponBody', [1.3, 9, -30], [1.3, 12, -20]), PART.STOCK);
  assert.equal(classifySmg('WeaponBody', [1, 7, -10], [2, 10, -8]), PART.STEEL + ZONE.CONTACT * 256);
  assert.equal(classifySmg('WeaponBody', [-1, 12, -5], [1, 17.9, -2]), PART.SIGHT);
  assert.equal(classifySmg('WeaponBody', [-1, 7, 39], [1, 10, 42.9]), PART.STEEL);
  assert.equal(classifySmg('WeaponBody', [-1.8, 3.5, 24], [1.8, 6.5, 36]), PART.RAIL);
  assert.equal(classifySmg('WeaponBody', [2.3, 1, 12], [2.3, 6, 18]), PART.BODY + ZONE.CONTACT * 256);
  assert.equal(classifySmg('WeaponBody', [-1, -8, -6], [1, 4, 2]), PART.BODY + ZONE.HANDLED * 256);
  assert.equal(classifySmg('WeaponBody', [2.3, 8, 0], [2.3, 13, 20]), PART.BODY);
});

// 四个 UV 岛的假枪（64 的贴图）：枪托（左上）、机匣的弹匣口（右上）、托底（左下一条竖的，高度沿 v 变）、弹匣（右下，高度沿 u 变）
function fakeMeshes() {
  const quad = (u0, v0, u1, v1, p) => ({ position: p.flat(), uv: [u0, v0, u1, v0, u1, v1, u0, v1], index: [0, 1, 2, 0, 2, 3] });
  const join = (name, quads) => { const M = { name, position: [], uv: [], index: [] }; for (const q of quads) { const o = M.position.length / 3; M.position.push(...q.position); M.uv.push(...q.uv); M.index.push(...q.index.map((i) => i + o)); } return M; };
  return [
    join('WeaponBody', [
      quad(0.125, 0.125, 0.5, 0.5, [[1.3, 9, -30], [1.3, 9, -20], [1.3, 12, -20], [1.3, 12, -30]]),          // 枪托的侧面
      quad(0.625, 0.125, 0.875, 0.5, [[2.3, 1, 12], [2.3, 1, 18], [2.3, 6, 18], [2.3, 6, 12]]),              // 弹匣口
      quad(0.125, 0.625, 0.25, 0.875, [[-1.5, 15, -38.5], [1.5, 15, -38.5], [1.5, -5, -38.5], [-1.5, -5, -38.5]]), // 托底朝后的面：v 方向 16 个像素走 20 个单位
    ]),
    join('MagazineGeometry', [quad(0.5, 0.625, 0.875, 0.875, [[2, 14, 0], [2, -15, 0], [2, -15, 3], [2, 14, 3]])]),
    join('armmesh_arms_0', [quad(0, 0, 1, 1, [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]])]), // 手：不是枪的零件，不该画进去
  ];
}

test('零件图：一个 UV 岛一类；岛内记类别、标记和位置，岛外补一圈边，没人用的像素留空', () => {
  const size = 64, pm = partMap(fakeMeshes(), size, classifySmg, 1.5), at = (x, y) => y * size + x;
  assert.equal(pm.size, size); assert.equal(pm.islands, 4);
  assert.equal(pm.cls[at(20, 20)], PART.STOCK); assert.equal(pm.zone[at(20, 20)], 0);
  assert.equal(pm.cls[at(48, 20)], PART.BODY); assert.equal(pm.zone[at(48, 20)], ZONE.CONTACT);
  assert.equal(pm.cls[at(12, 48)], PART.RUBBER); assert.equal(pm.cls[at(44, 48)], PART.MAG); assert.ok(pm.zone[at(44, 48)] & ZONE.CONTACT);
  // 没人用的像素：类别是 NONE，标记是 GUTTER（手的那个大方块没画进来）
  assert.equal(pm.cls[at(36, 36)], PART.NONE); assert.equal(pm.zone[at(36, 36)], ZONE.GUTTER); assert.equal(pm.cls[at(2, 2)], PART.NONE);
  // 岛外一个像素：补的边（类别跟着岛，带 GUTTER）；再往外两个像素就没有了
  assert.equal(pm.cls[at(7, 20)], PART.STOCK); assert.ok(pm.zone[at(7, 20)] & ZONE.GUTTER); assert.equal(pm.cls[at(5, 20)], PART.NONE);
  // 岛内的像素数 ≈ 四个矩形的面积
  const area = 24 * 24 + 16 * 24 + 8 * 16 + 24 * 16; assert.ok(Math.abs(pm.covered - area) < area * 0.06, `岛内 ${pm.covered} / ${area}`);
  // 位置（乘 256）：枪托的高度从 9 到 12 沿 v 变；托底的高度从 15 降到 −5
  assert.ok(Math.abs(pm.y[at(20, 8)] / 256 - 9) < 0.2 && Math.abs(pm.y[at(20, 31)] / 256 - 12) < 0.2);
  assert.ok(pm.y[at(12, 41)] > pm.y[at(12, 54)] + 256 * 10); assert.ok(Math.abs(pm.x[at(20, 20)] / 256 - 1.3) < 0.01);
  // 不带索引的网格也行；一个三角形都画不上（全是不认识的网格）返回 null
  const M = fakeMeshes()[0], flat = { name: M.name, position: M.index.flatMap((i) => M.position.slice(i * 3, i * 3 + 3)), uv: M.index.flatMap((i) => M.uv.slice(i * 2, i * 2 + 2)), index: null };
  const pm2 = partMap([flat], size, classifySmg, 1.5); assert.equal(pm2.cls[at(20, 20)], PART.STOCK); assert.equal(pm2.cls[at(12, 48)], PART.RUBBER);
  assert.equal(partMap([fakeMeshes()[2]], size), null); assert.equal(partMap([], size), null); assert.equal(partMap([{ name: 'WeaponBody', position: [], uv: [], index: [] }], size), null);
});

// 假的枪贴图（没有零件图时的退路）：左半边是钢件（金属度 0.5）、右半边是聚合物（0.12）；颜色是偏暖的深灰，有大片明暗；粗糙度带方块噪声；
// 法线：平面上有压缩噪点，x = 20 和 x = 44 各有一道竖的凸棱；钢件上有一个红点、一道亮划痕（平面上）
function fakeGun(size = 64, { line = 0, scratch = true } = {}) {
  const r = seeded(9), mrSize = size / 2;
  const base = rgba(size, (x, y) => { const v = 30 + (y < size / 2 ? 8 : -6) + (line && x === 20 ? line : 0); return x === 10 && y === 10 ? [200, 20, 20] : scratch && y === 40 && x > 4 && x < 16 ? [v + 40, v + 38, v + 36] : [v + 4, v, v - 3]; });
  const mr = rgba(mrSize, (x, y) => [255, ((x >> 2) + (y >> 2)) & 1 ? 150 : 190, x < mrSize / 2 ? 128 : 30]);
  const RIDGE = [40, 70, 128, 186, 216]; // 一道凸棱在法线贴图上的样子：左边朝左倒、右边朝右倒，四五个像素宽
  const normal = rgba(size, (x) => { const e = Math.abs(x - 20) <= 2 ? RIDGE[x - 18] : Math.abs(x - 44) <= 2 ? RIDGE[x - 42] : 0; return e ? [e, 128, 255] : [128 + Math.round((r() - 0.5) * 4), 128 + Math.round((r() - 0.5) * 4), 255]; });
  return { base, mr, normal, size, mrSize };
}

test('枪（没有零件图的退路）：按原贴图的金属度分钢件和聚合物；粗糙度去方块、落在限幅里；颜色去暖、云斑变小；红点留着；划痕更亮也更光；法线平面抹平、棱线原样', () => {
  const T = fakeGun(), P = SMG_SKIN.gun, orig = { base: T.base.slice(), mr: T.mr.slice() }, steelP = P.parts[PART.STEEL], bodyP = P.parts[PART.BODY];
  const stats = processGun(T.base, T.mr, T.normal, T.size, P, T.mrSize);
  assert.ok(Math.abs(stats.metalShare - 0.5) < 0.05, `钢件占一半：${stats.metalShare}`);
  assert.ok(stats.roughMin >= Math.min(steelP.min, bodyP.min) - 1e-6 && stats.roughMax <= P.rough.max + 1e-6, `粗糙度 ${stats.roughMin}–${stats.roughMax}`);
  assert.equal(stats.ms.length, 3);
  // 金属度：钢件的平面上是钢件那一类的值，聚合物 = 0
  assert.ok(Math.abs(px(T.mr, 32, 4, 20)[2] - steelP.metal * 255) <= 1); assert.equal(px(T.mr, 32, 28, 20)[2], 0);
  // 粗糙度：原来 150 / 190 的方块（差 40），现在同一种材质里相邻两块差不多；聚合物比钢件粗
  // （这么小的贴图上「大范围的起伏」也是几个像素一变，所以按块取平均了比）
  const g = (x, y) => px(T.mr, 32, x, y)[1], blocks = (x0, x1, odd) => { const v = []; for (let y = 2; y < 30; y++) for (let x = x0; x < x1; x++) if ((((x >> 2) + (y >> 2)) & 1) === odd) v.push(g(x, y)); return mean(v); };
  const contrast = Math.abs(blocks(1, 15, 1) - blocks(1, 15, 0)); assert.ok(contrast < 40 * 0.3, `方块压平：原来差 40，现在 ${contrast.toFixed(1)}`);
  // 聚合物比钢件哑：同一张贴图，一次全标成钢、一次全标成聚合物，逐像素比（大范围的起伏两次一样，抵掉了）
  const asSteel = rgba(32, () => [255, 170, 128]), asPoly = rgba(32, () => [255, 170, 30]), flatBase = () => rgba(64, () => [34, 30, 27]), flatN = () => rgba(64, () => [128, 128, 255]);
  processGun(flatBase(), asSteel, flatN(), 64, P, 32); processGun(flatBase(), asPoly, flatN(), 64, P, 32);
  let rougher = 0, n = 0, gap = 0; for (let i = 0; i < 32 * 32; i++) { n++; gap += asPoly[i * 4 + 1] - asSteel[i * 4 + 1]; if (asPoly[i * 4 + 1] >= asSteel[i * 4 + 1]) rougher++; }
  assert.equal(rougher, n, '每个像素上聚合物都不比钢件光'); assert.ok(gap / n > 8, `聚合物平均哑 ${(gap / n).toFixed(1)}`);
  // 颜色：原来 r > b（偏暖），现在钢件 b > r（冷），聚合物接近中性；上下两半原来差 14，现在更小；还是深色
  const steel = px(T.base, 64, 8, 20), poly = px(T.base, 64, 56, 20), steelLow = px(T.base, 64, 8, 58), was = px(orig.base, 64, 8, 20), wasLow = px(orig.base, 64, 8, 58);
  assert.ok(was[0] > was[2] && steel[2] > steel[0], `去暖：${was} → ${steel}`); assert.ok(poly[2] >= poly[0] && poly[2] - poly[0] <= 4, `聚合物是偏冷的炭黑：${poly}`);
  assert.ok(steel[1] > poly[1], '钢件比聚合物亮一点');
  assert.ok(Math.abs(steel[1] - steelLow[1]) < Math.abs(was[1] - wasLow[1]), '云斑压小');
  assert.ok(steel[1] < 70 && poly[1] < 60, '还是深色的枪黑，不发白');
  // 红点原样
  const dot = px(T.base, 64, 10, 10); assert.ok(dot[0] > 150 && dot[1] < 60, `红点：${dot}`);
  // 划痕（平面上的亮线，不在棱上）：留着，和周围的反差不比原来小；那一格的粗糙度比旁边低
  const scratch = px(T.base, 64, 10, 40)[1] - px(T.base, 64, 10, 44)[1], scratchWas = px(orig.base, 64, 10, 40)[1] - px(orig.base, 64, 10, 44)[1];
  assert.ok(scratch >= scratchWas, `划痕 ${scratchWas} → ${scratch}`); const clean = fakeGun(64, { scratch: false }); processGun(clean.base, clean.mr, clean.normal, 64, P, 32);
  assert.ok(g(5, 20) < px(clean.mr, 32, 5, 20)[1] - 3, `划痕处更光：${g(5, 20)} / 没有划痕时 ${px(clean.mr, 32, 5, 20)[1]}`); assert.equal(g(5, 26), px(clean.mr, 32, 5, 26)[1], '别处不变');
  assert.equal(stats.cutShare, 0, '没有烘焙的亮棱可抹');
  // 法线：平面上（原来 ±2 的噪点）回到 128；棱上的 70 / 216 没动
  for (const [x, y] of [[5, 5], [30, 30], [60, 50]]) { const n = px(T.normal, 64, x, y); assert.ok(Math.abs(n[0] - 128) <= 1 && Math.abs(n[1] - 128) <= 1, `平面 ${n}`); }
  assert.equal(px(T.normal, 64, 19, 30)[0], 70); assert.equal(px(T.normal, 64, 22, 30)[0], 216);
});

test('枪：烘进颜色贴图的亮棱（棱上一条细亮线）大部分抹掉、留下的也打了折；平面上同样亮的划痕不抹', () => {
  const P = SMG_SKIN.gun, T = fakeGun(64, { line: 26 }), plain = fakeGun(64);
  const stats = processGun(T.base, T.mr, T.normal, T.size, P, T.mrSize); processGun(plain.base, plain.mr, plain.normal, plain.size, P, plain.mrSize);
  // 这条线在 x = 20（钢件的凸棱上）：逐行量它比没有线的那张亮多少
  const left = []; for (let y = 4; y < 60; y++) if (y !== 40) left.push(px(T.base, 64, 20, y)[1] - px(plain.base, 64, 20, y)[1]);
  if (process.env.SKIN_DEBUG) console.log({ stats, left });
  assert.ok(stats.cutShare > 0.008 && stats.cutShare < 0.03, `认出来的亮棱像素：${stats.cutShare}`);
  assert.ok(mean(left) < 26 * 0.45, `平均只剩 ${mean(left).toFixed(1)} / 26`);
  assert.ok(Math.max(...left) <= 26 * P.edge.max * P.parts[PART.STEEL].wear * 1.25 + 2, `最亮的一截也打了折：${Math.max(...left)}`);
  assert.ok(left.filter((v) => v <= 26 * 0.2).length > left.length * 0.4, '一多半的长度上几乎没有了（不是一圈描边）');
  assert.ok(Math.min(...left) >= -3, '抹掉亮线不留下暗沟');
  assert.ok(stats.wearShare < stats.cutShare, '留下的比抹掉的少');
  // 留下亮棱的地方露一点钢（金属度不低于平面）
  let mMax = 0; for (let y = 2; y < 30; y++) mMax = Math.max(mMax, px(T.mr, 32, 10, y)[2]); assert.ok(mMax >= P.parts[PART.STEEL].metal * 255 - 1);
});

test('枪（有零件图）：没人用的像素填底色、法线放平；各类零件各有金属度和粗糙度；托底的横棱只画在朝后的面上；权重图按类分细节', () => {
  const size = 64, mrSize = 32, P = SMG_SKIN.gun, parts = partMap(fakeMeshes(), size, classifySmg, 1.5), r = seeded(3);
  const base = rgba(size, () => { const v = 34 + Math.round(r() * 4); return [v + 4, v, v - 3]; }), mr = rgba(mrSize, () => [120, 150, 110]), normal = rgba(size, () => [131, 126, 255]);
  const weights = new Uint8ClampedArray(mrSize * mrSize * 4), stats = processGun(base, mr, normal, size, P, mrSize, parts, weights);
  // 没人用的像素：底色、法线正上方、权重全 0
  assert.deepEqual(px(base, size, 36, 36), [...P.bg]); assert.deepEqual(px(normal, size, 36, 36).slice(0, 2), [128, 128]); assert.deepEqual(px(weights, mrSize, 18, 18), [0, 0, 0]);
  // 岛外补的边：和岛内一样深（不是底色，也不是原来的颜色）
  const gutter = px(base, size, 7, 20), inside = px(base, size, 12, 20); assert.ok(Math.abs(gutter[1] - inside[1]) <= 6, `补的边 ${gutter} / 岛内 ${inside}`);
  // 金属度：聚合物 0，弹匣是钢；粗糙度：弹匣比机匣光，托底最哑
  const m = (x, y) => px(mr, mrSize, x, y);
  assert.equal(m(10, 10)[2], 0); assert.equal(m(24, 10)[2], 0); assert.equal(m(6, 24)[2], 0); assert.ok(m(22, 24)[2] >= P.parts[PART.MAG].metal * 255 - 1, `弹匣金属度 ${m(22, 24)[2]}`);
  assert.ok(m(22, 24)[1] < m(24, 10)[1] && m(24, 10)[1] < m(6, 24)[1], `粗糙度 弹匣 ${m(22, 24)[1]} < 机匣 ${m(24, 10)[1]} < 托底 ${m(6, 24)[1]}`);
  assert.ok(stats.roughMin >= 0.3 - 1e-6 && stats.roughMax <= P.rough.max + 1e-6); assert.ok(stats.metalShare > 0.05 && stats.metalShare < 0.2, `金属占比 ${stats.metalShare}`);
  // 遮蔽：托底有下限（原来 120），别的类不动（只去方块）
  assert.ok(m(6, 24)[0] >= P.parts[PART.RUBBER].ao * 255 - 1); assert.ok(Math.abs(m(10, 10)[0] - 120) <= 1);
  // 颜色：弹匣偏蓝（烤蓝），枪托、机匣接近中性
  const mag = px(base, size, 44, 48), stock = px(base, size, 20, 20); assert.ok(mag[2] >= mag[0] + 3, `弹匣 ${mag}`); assert.ok(Math.abs(stock[2] - stock[0]) <= 2, `枪托 ${stock}`);
  // 托底：横棱（沟里压暗、法线有起伏）——高度沿 v 变得快，是朝后的面
  const col = []; for (let y = 42; y < 55; y++) col.push(px(base, size, 12, y)[1]);
  assert.ok(Math.max(...col) - Math.min(...col) >= 4, `托底的沟：${col}`);
  let bump = 0; for (let y = 42; y < 55; y++) bump = Math.max(bump, Math.abs(px(normal, size, 12, y)[1] - 128)); assert.ok(bump > 10, `托底法线起伏 ${bump}`);
  // 权重图：R 疏麻点（枪托）、G 磷化颗粒（钢件）、B 细麻点（机匣）
  const wS = px(weights, mrSize, 10, 10), wB = px(weights, mrSize, 24, 10), wM = px(weights, mrSize, 22, 24), wR = px(weights, mrSize, 6, 24);
  assert.ok(wS[0] > 50 && wS[1] === 0, `枪托 ${wS}`); assert.ok(wB[0] === 0 && wB[2] > 90, `机匣 ${wB}`); assert.ok(wM[1] > 50 && wM[0] === 0 && wM[2] === 0, `弹匣 ${wM}`); assert.ok(wR[0] === 0 && wR[1] === 0 && wR[2] > 0, `托底 ${wR}`);
  // 托底的顶面（高度在贴图上几乎不变）：不画横棱——同样的岛，换成一块水平的面
  const top = fakeMeshes(); top[0].position.splice(24, 12, -1.5, 11, -38.5, 1.5, 11, -38.5, 1.5, 11.2, -36.5, -1.5, 11.2, -36.5);
  const parts2 = partMap(top, size, classifySmg, 1.5); assert.equal(parts2.cls[48 * size + 12], PART.RUBBER);
  const base2 = rgba(size, () => [38, 34, 31]), normal2 = rgba(size, () => [128, 128, 255]); processGun(base2, rgba(mrSize, () => [120, 150, 110]), normal2, size, P, mrSize, parts2);
  const col2 = []; for (let y = 42; y < 55; y++) col2.push(px(base2, size, 12, y)[1]); assert.ok(Math.max(...col2) - Math.min(...col2) <= 1, `顶面是平的：${col2}`);
  // 零件图小一号（32 对 64 的贴图）也行；尺寸对不上的零件图当没有
  const half = partMap(fakeMeshes(), 32, classifySmg, 1.5), base3 = rgba(size, () => [38, 34, 31]), mr3 = rgba(mrSize, () => [120, 150, 110]);
  processGun(base3, mr3, rgba(size, () => [128, 128, 255]), size, P, mrSize, half); assert.deepEqual(px(base3, size, 2, 2), [...P.bg]); assert.equal(px(mr3, mrSize, 10, 10)[2], 0); assert.ok(px(mr3, mrSize, 22, 24)[2] > 150);
  const odd = { ...half, size: 24 }, base4 = rgba(size, () => [38, 34, 31]); processGun(base4, rgba(mrSize, () => [120, 150, 110]), rgba(size, () => [128, 128, 255]), size, P, mrSize, odd); assert.notDeepEqual(px(base4, size, 36, 36), [...P.bg]);
});

test('枪：凹槽压暗、更哑，凸棱亮一点、更光（法线贴图的散度）；量到岛外的不算（不描边）', () => {
  // 64 × 64、全是聚合物（机匣）：x = 20 一道凸棱，x = 40 一道凹槽（法线反过来倒）
  const P = SMG_SKIN.gun, size = 64, RIDGE = [40, 70, 128, 186, 216];
  const normal = () => rgba(size, (x) => (Math.abs(x - 20) <= 2 ? [RIDGE[x - 18], 128, 255] : Math.abs(x - 40) <= 2 ? [RIDGE[42 - x], 128, 255] : [128, 128, 255]));
  const run = (n) => { const base = rgba(size, () => [34, 34, 34]), mr = rgba(32, () => [255, 170, 30]); processGun(base, mr, n, size, P, 32); return { base, mr }; };
  const A = run(normal()), F = run(rgba(size, () => [128, 128, 255]));
  const lum = (T, x) => { let v = 0; for (let y = 8; y < 56; y++) v += px(T.base, size, x, y)[1]; return v / 48; };
  const rough = (T, x) => { let v = 0; for (let y = 4; y < 28; y++) v += px(T.mr, 32, x, y)[1]; return v / 24; };
  assert.ok(lum(A, 40) < lum(F, 40) * 0.85, `凹槽压暗：${lum(A, 40).toFixed(1)} / 平面 ${lum(F, 40).toFixed(1)}`);
  assert.ok(lum(A, 20) > lum(F, 20) + 1, `凸棱亮一点：${lum(A, 20).toFixed(1)} / ${lum(F, 20).toFixed(1)}`);
  assert.ok(lum(A, 20) < lum(F, 20) + P.parts[PART.BODY].lit + 1, '只是亮一点，不是白边');
  assert.ok(rough(A, 20) > rough(F, 20) + 5, `凹槽更哑：${rough(A, 20)} / ${rough(F, 20)}`); // 粗糙度贴图小一半：x = 40 在 20
  assert.ok(rough(A, 10) < rough(F, 10) - 3, `凸棱更光：${rough(A, 10)} / ${rough(F, 10)}`);
  assert.ok(Math.abs(lum(A, 30) - lum(F, 30)) < 0.5, '平面上不动');
  // 有零件图：一个岛的边贴着岛外，边上的法线台阶不当凸棱量
  const quad = (u0, v0, u1, v1, p) => ({ position: p.flat(), uv: [u0, v0, u1, v0, u1, v1, u0, v1], index: [0, 1, 2, 0, 2, 3] });
  const body = { name: 'WeaponBody', ...quad(0.25, 0.125, 0.75, 0.875, [[-1, 7, 0], [1, 7, 0], [1, 10, 8], [-1, 10, 8]]) };
  const parts = partMap([body], size, classifySmg, 1.5), edged = (on) => {
    const base = rgba(size, () => [34, 34, 34]), n = rgba(size, (x) => (on && x >= 14 && x <= 18 ? [RIDGE[x - 14], 128, 255] : [128, 128, 255])); // 台阶正好跨在岛的左边（x = 16）上
    processGun(base, rgba(32, () => [255, 170, 30]), n, size, P, 32, parts); return base;
  };
  const E = edged(true), N = edged(false);
  for (const x of [16, 17, 18]) assert.ok(px(E, size, x, 30)[1] <= px(N, size, x, 30)[1] + 1, `岛边上不描亮：x = ${x} ${px(E, size, x, 30)} / 没有台阶时 ${px(N, size, x, 30)}`);
});

test('枪：握把（机匣上手握的岛）和枪托一样深、一样哑，不磨光；别的机匣照旧', () => {
  const P = SMG_SKIN.gun, size = 64;
  const quad = (u0, v0, u1, v1, p) => ({ position: p.flat(), uv: [u0, v0, u1, v0, u1, v1, u0, v1], index: [0, 1, 2, 0, 2, 3] });
  const M = { name: 'WeaponBody', position: [], uv: [], index: [] };
  for (const q of [quad(0.0625, 0.0625, 0.4375, 0.9375, [[-1, -8, -6], [1, -8, -6], [1, 4, 2], [-1, 4, 2]]), quad(0.5625, 0.0625, 0.9375, 0.9375, [[-1, 7, 0], [1, 7, 0], [1, 10, 8], [-1, 10, 8]])]) {
    const o = M.position.length / 3; M.position.push(...q.position); M.uv.push(...q.uv); M.index.push(...q.index.map((i) => i + o));
  }
  const parts = partMap([M], size, classifySmg, 1.5); assert.ok(parts.zone[20 * size + 16] & ZONE.HANDLED); assert.ok(!(parts.zone[20 * size + 48] & ZONE.HANDLED));
  const base = rgba(size, () => [34, 34, 34]), mr = rgba(32, () => [255, 100, 30]); processGun(base, mr, rgba(size, () => [128, 128, 255]), size, P, 32, parts);
  let gl = 0, ol = 0, gr = 1, orr = 0; for (let y = 8; y < 56; y++) { gl += px(base, size, 16, y)[1]; ol += px(base, size, 48, y)[1]; }
  for (let y = 4; y < 28; y++) { gr = Math.min(gr, px(mr, 32, 8, y)[1] / 255); orr += px(mr, 32, 24, y)[1] / 255 / 24; }
  assert.ok(gl < ol * (P.grip.dark + 0.04), `握把更深：${gl / 48} / ${ol / 48}`);
  assert.ok(gr >= P.grip.rough - 0.01, `握把粗糙度不低于 ${P.grip.rough}：${gr.toFixed(2)}`); assert.ok(orr < P.grip.rough, '别的机匣不受影响');
  assert.equal(px(mr, 32, 8, 10)[2], 0, '握把不是金属');
});

test('右手握姿：中指、食指绕模型的轴转进握把；动画不重写骨骼时不越乘越多；没有骨骼、没有动画、骨骼不归动画管都不动', () => {
  const model = new THREE.Group(); model.rotation.y = Math.PI; // 和 smg.js 一样转了半圈：轴是模型自己的
  const wrist = new THREE.Bone(); wrist.name = 'R_wrist_026'; wrist.quaternion.setFromEuler(new THREE.Euler(0.4, -0.7, 0.2));
  const mid = new THREE.Bone(); mid.name = 'R_middle1_035'; mid.position.set(0, 0, -3); mid.quaternion.setFromEuler(new THREE.Euler(-0.3, 0.5, 0.9));
  const pt = new THREE.Bone(); pt.name = 'R_point1_031'; pt.position.set(1, 0, -3);
  model.add(wrist); wrist.add(mid, pt);
  const q0 = mid.quaternion.toArray(), clip = new THREE.AnimationClip('reload', 1, [new THREE.QuaternionKeyframeTrack('R_middle1_035.quaternion', [0, 1], [...q0, ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.5, 0.9)).toArray()])]);
  const mixer = new THREE.AnimationMixer(model), action = mixer.clipAction(clip); action.play(); action.paused = true; action.time = 0; mixer.update(0);
  const before = mid.getWorldQuaternion(new THREE.Quaternion()), mq = model.getWorldQuaternion(new THREE.Quaternion());
  const grip = gripPose(model, clip); assert.ok(grip); assert.deepEqual(grip.bones, [mid], '食指不归动画管：不动');
  grip.apply(); model.updateMatrixWorld(true);
  // 世界里的变化 = 绕「模型的 y 轴」转 SMG_GRIP 里写的角度
  const g = SMG_GRIP.find((e) => mid.name.startsWith(e.bone)), axis = new THREE.Vector3(...g.axis).applyQuaternion(mq);
  const want = new THREE.Quaternion().setFromAxisAngle(axis, g.angle).multiply(before), got = mid.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(Math.abs(Math.abs(want.dot(got)) - 1) < 1e-6, '绕模型的轴转');
  const once = mid.quaternion.clone(); for (let i = 0; i < 5; i++) { mixer.update(0); grip.apply(); } assert.ok(mid.quaternion.equals(once), '动画值没变：不再乘');
  action.time = 0.5; mixer.update(0); const anim = mid.quaternion.clone(); grip.apply(); assert.ok(!mid.quaternion.equals(anim), '动画写了新值：乘一次'); const twice = mid.quaternion.clone(); grip.apply(); assert.ok(mid.quaternion.equals(twice));
  assert.equal(gripPose(model, null), null); assert.equal(gripPose(new THREE.Group(), clip), null); assert.equal(gripPose(null, clip), null);
  // 经 smg.js：attach 以后中指转过了，update 多少帧都一样（不累积）
  const m2 = model.clone(true), camera = new THREE.PerspectiveCamera(), smg = createSmg({}, { camera });
  assert.equal(smg.attach({ scene: m2, animations: [clip] }), true);
  const b2 = m2.getObjectByName('R_middle1_035'), end = new THREE.Quaternion().fromArray(clip.tracks[0].values, 4); assert.ok(Math.abs(Math.abs(b2.quaternion.dot(end)) - 1) > 1e-4, '握姿修正套上了');
  const fixed = b2.quaternion.clone(); for (let i = 0; i < 10; i++) smg.update(1 / 60, false, false); assert.ok(b2.quaternion.equals(fixed), '每帧不累积'); smg.dispose();
});

test('枪：金属粗糙度贴图和颜色一样大也行；全黑、全白的贴图不出 NaN；很小的贴图不越界', () => {
  const size = 16, base = rgba(size, () => [0, 0, 0]), mr = rgba(size, () => [255, 255, 255]), normal = rgba(size, () => [128, 128, 255]);
  const s = processGun(base, mr, normal, size); assert.ok(Number.isFinite(s.roughMin) && s.metalShare === 1);
  assert.ok(base.every((v) => Number.isFinite(v))); assert.ok(px(mr, size, 3, 3)[1] <= SMG_SKIN.gun.rough.max * 255 + 1);
  const white = rgba(size, () => [255, 255, 255]);
  const whiteMr = rgba(size, () => [0, 0, 0]); processGun(white, whiteMr, rgba(size, () => [128, 128, 255]), size);
  const w = px(white, size, 4, 4); assert.ok(w[0] === w[1] && w[1] === w[2] && w[0] >= SMG_SKIN.gun.bright[0] && w[0] < 128, `很亮的灰白压成磨亮的钢，不是不吃光的纯白：${w}`);
  assert.ok(px(whiteMr, size, 4, 4)[1] >= SMG_SKIN.gun.bright[2] * 255 - 1, '压过的灰白粗糙度不低于下限：平面金属不会被主光扫成一条白');
  const tiny = rgba(4, () => [40, 40, 40]); processGun(tiny, rgba(4, () => [200, 128, 0]), rgba(4, () => [128, 128, 255]), 4); assert.ok(tiny.every((v) => Number.isFinite(v)));
  // 每一行都算到了、只算了一遍：两张一样的贴图结果一样（先隔行跑、再补其余的那个顺序不漏不重）
  const A = fakeGun(64), B = fakeGun(64); processGun(A.base, A.mr, A.normal, 64, SMG_SKIN.gun, 32); processGun(B.base, B.mr, B.normal, 64, SMG_SKIN.gun, 32);
  assert.deepEqual(A.base, B.base); assert.deepEqual(A.mr, B.mr);
  const C = fakeGun(64), was = C.base.slice(); processGun(C.base, C.mr, C.normal, 64, SMG_SKIN.gun, 32);
  for (let y = 0; y < 64; y++) assert.notDeepEqual(px(C.base, 64, 56, y), px(was, 64, 56, y), `第 ${y} 行算过`);
});

test('手：暗的皮面和亮的布面分开——布面粗糙度抬到 0.8 以上（原来 0.45，发亮），皮面略光；权重图 R 皮纹、G 织物', () => {
  const P = SMG_SKIN.hands, small = rgba(16, (x) => (x < 8 ? [18, 18, 18] : [44, 46, 40])), mr = rgba(32, (x) => [255, x < 16 ? 215 : 115, 0]), weights = new Uint8ClampedArray(16 * 16 * 4);
  const s = processHands(mr, 32, small, 16, P, weights);
  const leather = px(mr, 32, 4, 10), fabric = px(mr, 32, 28, 10);
  assert.ok(Math.abs(s.leatherShare - 0.5) < 0.1);
  assert.ok(fabric[1] / 255 >= 0.8, `布面 ${fabric[1] / 255}`); assert.ok(leather[1] < fabric[1] - 30 && leather[1] / 255 >= P.rough.min, `皮面 ${leather[1] / 255}`); assert.ok(s.roughMin >= P.rough.min - 1e-6);
  assert.equal(leather[0], 255, '遮蔽通道不动'); assert.equal(leather[2], 0, '金属度通道不动');
  assert.deepEqual(px(weights, 16, 2, 5), [255, 0, 0]); assert.deepEqual(px(weights, 16, 13, 5), [0, 255, 0]);
  processHands(rgba(32, () => [255, 115, 0]), 32, small, 16); // 不要权重图也行
});

test('细节贴图：四张高度图都在 0–1、能平铺、平均值在正中；织物的线数对得上；转成像素以后平的地方法线是正上方、B 通道是高度', () => {
  const size = 64, H = detailHeights(size, { threads: 8, dots: 8 });
  for (const k of ['grain', 'stipple', 'pebble', 'weave']) {
    const h = H[k]; assert.equal(h.length, size * size, k); assert.ok(h.every((v) => v >= 0 && v <= 1), `${k} 在范围里`);
    let seam = 0, inner = 0; for (let y = 0; y < size; y++) { seam += Math.abs(h[y * size + size - 1] - h[y * size]); inner += Math.abs(h[y * size + 30] - h[y * size + 31]); }
    assert.ok(seam < inner * 3 + 1, `${k} 接缝 ${seam.toFixed(2)} / 内部 ${inner.toFixed(2)}`);
    const sd = Math.sqrt(h.reduce((a, v) => a + (v - 0.5) ** 2, 0) / h.length); assert.ok(sd > 0.03, `${k} 不是一片平的`);
    assert.ok(Math.abs(mean([...h]) - 0.5) < 0.06, `${k} 平均 ${mean([...h]).toFixed(3)}：缩小以后粗糙度不跟着偏`);
  }
  // 织物：每根线的边上压到 0——一行里有 threads 个低谷
  let dips = 0; for (let x = 0; x < size; x++) if (H.weave[4 * size + x] < 0.05) dips++; assert.ok(dips >= 4 && dips <= 16, `低谷 ${dips}`);
  assert.deepEqual([...detailHeights(16).grain.slice(0, 8)], [...detailHeights(16).grain.slice(0, 8)], '可复现');
  const flat = detailPixels(new Float32Array(16 * 16).fill(0.25), 16); assert.deepEqual([...flat.slice(0, 4)].map(Math.round), [128, 128, 64, 255]);
  const ramp = new Float32Array(16 * 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) ramp[y * 16 + x] = x / 16;
  const n = detailPixels(ramp, 16, 2), i = (8 * 16 + 8) * 4; assert.ok(n[i] < 126 && Math.abs(n[i + 1] - 128) <= 1, '往 +x 升高：法线朝 −x 倒');
});

test('着色器挂钩：按 UV 铺（手）和按位置铺（枪）两种，three 的标准材质里该插的地方都还在、都插上了，参数进了 uniforms', () => {
  const L = THREE.ShaderLib.physical;
  for (const inc of ['#include <normalmap_pars_fragment>', '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>', '#include <lights_physical_fragment>', '#include <lights_fragment_end>']) assert.ok(L.fragmentShader.includes(inc), `three 的片元着色器里还有 ${inc}`);
  for (const inc of ['#include <common>', '#include <begin_vertex>']) assert.ok(L.vertexShader.includes(inc), `three 的顶点着色器里还有 ${inc}`);
  assert.ok(L.fragmentShader.indexOf('#include <roughnessmap_fragment>') < L.fragmentShader.indexOf('#include <normal_fragment_maps>') && L.fragmentShader.indexOf('#include <normal_fragment_maps>') < L.fragmentShader.indexOf('#include <lights_fragment_end>'), '先量细节、再改法线、最后收灯色');
  // 按 UV 铺
  const U = { uSkinDetA: { value: null }, uSkinF90: { value: 0.4 } };
  const uv = skinShader({ uniforms: { a: 1 }, vertexShader: L.vertexShader, fragmentShader: L.fragmentShader }, U);
  assert.equal(uv.uniforms.uSkinDetA, U.uSkinDetA); assert.equal(uv.uniforms.a, 1); assert.equal(uv.vertexShader, L.vertexShader, '顶点着色器不动');
  let f = uv.fragmentShader;
  assert.ok(f.includes('uniform sampler2D uSkinDetA;') && f.includes('uniform sampler2D uSkinDetB;') && f.includes('uniform sampler2D uSkinPart;'));
  assert.ok(f.includes('texture2D( uSkinDetA, vRoughnessMapUv * uSkinA.x )') && f.includes('normal = normalize( normal + tbn * vec3( skinNormal, 0.0 ) );') && f.includes('material.specularF90 = mix( uSkinF90, 1.0, metalnessFactor );'));
  assert.ok(!f.includes('vSkinPos') && !f.includes('uSkinNeutral'));
  assert.ok(f.indexOf('vec2 skinNormal') < f.indexOf('skinNormal = (') && f.indexOf('skinNormal = (') < f.indexOf('tbn * vec3( skinNormal'), '先声明、再量、最后用');
  // 按位置铺
  const pos = skinShader({ uniforms: {}, vertexShader: L.vertexShader, fragmentShader: L.fragmentShader }, { uSkinMottle: { value: 1 } }, true);
  assert.ok(pos.vertexShader.includes('varying vec3 vSkinPos;') && pos.vertexShader.includes('vSkinPos = position;') && pos.vertexShader.includes('vSkinNrm = normal;'));
  assert.ok(pos.vertexShader.indexOf('varying vec3 vSkinPos;') < pos.vertexShader.indexOf('void main()') && pos.vertexShader.indexOf('void main()') < pos.vertexShader.indexOf('vSkinPos = position;'));
  f = pos.fragmentShader;
  assert.ok(f.includes('varying vec3 vSkinPos;') && f.includes('uniform vec4 uSkinMottle;') && f.includes('uniform float uSkinNeutral;'));
  assert.equal((f.match(/textureGrad\( uSkinDet[AB], suv \* uSkin[ABC]\.x, skinDx \* uSkin[ABC]\.x, skinDy \* uSkin[ABC]\.x \)/g) || []).length, 3, '三层细节都带着自己的导数取样（换投影的那条线上不出缝）');
  assert.ok(f.includes('reflectedLight.directDiffuse = mix(') && f.includes('reflectedLight.directSpecular = mix(') && f.includes('skinNoise( smp )') && f.includes('uSkinMottle.y'));
  assert.ok(!f.includes('sin('), '噪声散列不用 sin（手机上精度不够）'); assert.ok(f.indexOf('float skinNoise') < f.indexOf('skinNoise( smp )'), '先定义再用');
  assert.ok(!f.includes('tbn * vec3( skinNormal'), '不用贴图 UV 的切线');
  assert.ok(f.indexOf('skinDx = spx') < f.indexOf('sq1p * skinDx.x'), '先定投影、再用它的导数搭切线');
  for (const s of [uv.fragmentShader, pos.fragmentShader, pos.vertexShader]) { let depth = 0; for (const ch of s) { if (ch === '{') depth++; else if (ch === '}') depth--; assert.ok(depth >= 0); } assert.equal(depth, 0, '花括号配平'); }
  // 没有顶点着色器的（别的调用方只给了片元）不报错
  skinShader({ uniforms: {}, fragmentShader: L.fragmentShader }, {}, true);
});

// 一个带三种材质、六张贴图的假模型（枪的金属粗糙度贴图一张图三个槽共用；手套和袖子共用三张图）。gunName：枪的网格叫什么（认识的名字才画零件图）
function fakeModel(size = 64, gunName = '') {
  const closed = [], disposed = [];
  const image = (fill) => ({ width: size, height: size, data: rgba(size, fill), close() { closed.push(this); } });
  const tex = (fill, srgb) => { const t = new THREE.Texture(image(fill)); t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.addEventListener('dispose', () => disposed.push(t)); return t; };
  const gunMr = tex((x) => [255, 120, x < size / 2 ? 128 : 30]);
  const gun = new THREE.MeshStandardMaterial({ name: 'smg45', map: tex(() => [34, 32, 30], true), roughnessMap: gunMr, metalnessMap: gunMr, aoMap: gunMr, normalMap: tex(() => [128, 128, 255]) });
  const hb = tex((x) => (x < size / 2 ? [18, 18, 18] : [44, 46, 40]), true), hm = tex(() => [255, 115, 0]), hn = tex(() => [128, 128, 255]);
  const glove = new THREE.MeshStandardMaterial({ name: 'HandsGlove', map: hb, roughnessMap: hm, metalnessMap: hm, aoMap: hm, normalMap: hn });
  const sleeve = new THREE.MeshStandardMaterial({ name: 'HandsSleeve', map: hb, roughnessMap: hm, metalnessMap: hm, aoMap: hm, normalMap: hn });
  const other = new THREE.MeshStandardMaterial({ name: 'strap' });
  const scene = new THREE.Group(), geo = new THREE.BoxGeometry(0.1, 0.1, 0.1), body = new THREE.Mesh(geo, gun); body.name = gunName;
  scene.add(body, new THREE.Mesh(geo, [glove, sleeve]), new THREE.Mesh(geo, other), new THREE.Mesh(geo, gun));
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

test('有画布：枪换三张贴图（颜色、法线原尺寸，金属粗糙度小一号）、手换一张粗糙度；共用的图只算一遍；换下来的原贴图释放并关掉位图；着色器按枪 / 手两种铺法挂上；释放时新贴图全清', () => {
  const doc = fakeDocument(); globalThis.document = doc;
  try {
    const M = fakeModel(64), S = { ...SMG_SKIN, size: 64, mrSize: 32, partSize: 32, detailSize: 32 }, old = { map: M.gun.map, normal: M.gun.normalMap };
    const s = skinSmg(M.scene, { S });
    assert.equal(s.applied, true); assert.ok(s.stats.gun && s.stats.hands); assert.ok(s.ms >= 0); assert.equal(s.stats.gun.islands, 0, '网格没名字：不画零件图，按金属度分');
    // 新建的贴图：枪 3 + 手 1，权重图 2（枪 32、手 16）+ 袖子的 2×2，细节 4
    assert.equal(s.textures.size, 11); assert.deepEqual([...s.textures].map((t) => t.image.width).sort((a, b) => a - b), [2, 16, 32, 32, 32, 32, 32, 32, 32, 64, 64]);
    for (const t of s.textures) assert.ok(t.image.width <= 1024);
    assert.ok(M.gun.map !== old.map && M.gun.map.isCanvasTexture && M.gun.map.colorSpace === THREE.SRGBColorSpace && M.gun.map.flipY === false, '颜色贴图换了，色彩空间、翻转沿用');
    assert.equal(M.gun.map.image.width, 64); assert.equal(M.gun.roughnessMap.image.width, 32);
    assert.ok(M.gun.roughnessMap === M.gun.metalnessMap && M.gun.roughnessMap === M.gun.aoMap && M.gun.roughnessMap !== M.gunMr, '三个槽还是共用一张');
    assert.equal(M.gun.normalMap.colorSpace, THREE.NoColorSpace);
    // 手：颜色、法线不动；粗糙度换了，两种材质、三个槽共用
    assert.equal(M.glove.map, M.hb); assert.equal(M.glove.normalMap, M.hn); assert.ok(M.glove.roughnessMap !== M.hm && M.glove.roughnessMap === M.sleeve.roughnessMap && M.glove.aoMap === M.glove.roughnessMap && M.glove.metalnessMap === M.glove.roughnessMap);
    // 原贴图：枪的三张、手的粗糙度那张释放了，位图也关了；没换的（手的颜色、法线）留着
    assert.deepEqual(new Set(M.disposed), new Set([old.map, old.normal, M.gunMr, M.hm])); assert.equal(M.closed.length, 4); assert.ok(!M.closed.includes(M.hb.image));
    // 着色器：三种材质都挂了；枪按位置铺（改顶点着色器），手按 UV 铺
    const L = THREE.ShaderLib.physical;
    for (const m of [M.gun, M.glove, M.sleeve]) {
      const U = m.userData.skin, isGun = m === M.gun; assert.ok(U.uSkinDetA.value.isTexture && U.uSkinDetB.value.isTexture && U.uSkinPart.value.isTexture);
      assert.equal(m.customProgramCacheKey(), isGun ? 'smg-skin-4-pos' : 'smg-skin-4-uv');
      const sh = { uniforms: {}, vertexShader: L.vertexShader, fragmentShader: L.fragmentShader }; m.onBeforeCompile(sh);
      assert.equal(sh.uniforms.uSkinA, U.uSkinA); assert.equal(sh.vertexShader.includes('vSkinPos'), isGun); assert.equal(sh.fragmentShader.includes('textureGrad( uSkinDetA'), isGun);
      assert.equal(U.uSkinDetA.value.flipY, false); assert.equal(U.uSkinDetA.value.wrapS, THREE.RepeatWrapping); assert.equal(U.uSkinPart.value.wrapS, THREE.ClampToEdgeWrapping);
    }
    const G = M.gun.userData.skin;
    assert.equal(G.uSkinNeutral.value, S.gun.neutral); assert.deepEqual(G.uSkinMottle.value.toArray(), [S.gun.mottle.scale, S.gun.mottle.albedo, S.gun.mottle.rough, S.gun.mottle.metal]); assert.equal(G.uSkinF90.value, S.gun.f90);
    assert.deepEqual(G.uSkinA.value.toArray(), [S.gun.A.scale, S.gun.A.normal, S.gun.A.rough, S.gun.A.tint]); assert.equal(G.uSkinC.value.x, S.gun.C.scale);
    assert.equal(G.uSkinPart.value.image.width, 32); assert.equal(M.glove.userData.skin.uSkinPart.value.image.width, 16); assert.equal(M.sleeve.userData.skin.uSkinPart.value.image.width, 2, '袖子全是布：一张 2×2 的权重图');
    assert.equal(M.glove.userData.skin.uSkinMottle, undefined); assert.equal(M.glove.userData.skin.uSkinF90.value, S.hands.f90);
    assert.equal(M.glove.userData.skin.uSkinDetB.value, M.sleeve.userData.skin.uSkinDetB.value, '手套和袖子的织物是同一张'); assert.notEqual(G.uSkinDetA.value, M.glove.userData.skin.uSkinDetA.value);
    assert.deepEqual([...M.sleeve.userData.skin.uSkinPart.value.image.pixels.slice(0, 4)], [0, 255, 0, 255]);
    assert.ok(M.sleeve.polygonOffset && M.sleeve.polygonOffsetFactor < 0 && !M.glove.polygonOffset, '袖口压在手套上：袖子往前挪一点深度，手套不动');
    assert.equal(M.other.userData.skin, undefined, '不认识的材质不碰');
    // 写回去的像素：钢件那半边的金属度是钢件那一类的，聚合物 0；手的布面粗糙度抬起来了
    const mrPx = M.gun.roughnessMap.image.pixels; assert.ok(Math.abs(mrPx[(10 * 32 + 4) * 4 + 2] - S.gun.parts[PART.STEEL].metal * 255) <= 1); assert.equal(mrPx[(10 * 32 + 28) * 4 + 2], 0);
    assert.ok(M.glove.roughnessMap.image.pixels[(10 * 32 + 28) * 4 + 1] / 255 > 0.8);
    // 释放
    let gone = 0; for (const t of s.textures) t.addEventListener('dispose', () => gone++); s.dispose(); assert.equal(gone, 11); assert.equal(s.textures.size, 0);

    // 网格叫得出名字：画零件图（盒子六个面六个岛，全归机匣——聚合物；另一个没名字的网格不画）
    const M3 = fakeModel(64, 'WeaponBody'), s3 = skinSmg(M3.scene, { S });
    assert.equal(s3.stats.gun.islands, 6, '叫得出名字的那个网格：盒子六个面'); assert.equal(s3.stats.gun.metalShare, 0); assert.ok(s3.timing.parts >= 0 && s3.timing.gun >= 0 && s3.timing.detail >= 0); s3.dispose();

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
    const s = skinSmg(M.scene, { S: { ...SMG_SKIN, size: 32, mrSize: 16, partSize: 16, detailSize: 16 } });
    assert.equal(s.applied, true); assert.equal(s.stats.gun, undefined); assert.ok(s.stats.hands); assert.equal(M.gun.userData.skin, undefined); assert.equal(M.gun.roughnessMap, M.gunMr);
    const bare = new THREE.Group(); bare.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial({ name: 'smg45' })));
    const s2 = skinSmg(bare); assert.equal(s2.applied, false); assert.equal(s2.textures.size, 0);
  } finally { delete globalThis.document; }
});
