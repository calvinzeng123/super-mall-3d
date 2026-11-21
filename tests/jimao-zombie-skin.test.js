// 丧尸贴图的画法（skins/zombie-paint.js）和贴图大小（zombie-skin.js）：纯运算部分，不需要浏览器
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Z from '../src/jimao/skins/zombie-paint.js';
import { zombieTexSizes, ZOMBIE_SKIN, loadZombieKit } from '../src/jimao/zombie-skin.js';
import { MEMORY_PROFILES } from '../src/render/device.js';

// 一个最简单的「人」：一根竖着的方柱（0–1.8 米），四个侧面按 UV 摊在贴图左半边，从上到下对应从头到脚
function pillar() {
  const P = [], UV = [], N = [], I = [];
  const sides = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // 法线方向（x, z）：前、右、后、左
  sides.forEach(([nx, nz], s) => {
    const base = P.length / 3, half = 0.15;
    const tx = -nz, tz = nx; // 沿着这一面的水平方向
    for (const [a, h] of [[-1, 1.8], [1, 1.8], [-1, 0], [1, 0]]) {
      P.push(nx * half + tx * half * a, h, nz * half + tz * half * a); N.push(nx, 0, nz);
      UV.push(s * 0.125 + (a + 1) * 0.0625, 1 - h / 1.8); // v = 0 是头顶
    }
    I.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  });
  return { position: new Float32Array(P), uv: new Float32Array(UV), normal: new Float32Array(N), index: new Uint16Array(I) };
}

test('噪声表：可复现、0–1 拉满、平铺取样不越界', () => {
  const a = Z.noiseTable(64, 7), b = Z.noiseTable(64, 7), c = Z.noiseTable(64, 8);
  assert.deepEqual(a, b, '同一个种子出一样的表');
  assert.notDeepEqual(a, c);
  let lo = 1, hi = 0; for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  assert.ok(lo === 0 && hi === 1, `${lo} ${hi}`);
  for (const [u, v] of [[-5.5, 3], [1e4 + 0.3, -77.2], [63.9, 63.9]]) { const t = Z.tap(a, 64, u, v); assert.ok(t >= 0 && t <= 1, `${u},${v} → ${t}`); }
  assert.ok(Math.abs(Z.tap(a, 64, 3, 5) - Z.tap(a, 64, 3 + 64, 5 - 128)) < 1e-6, '平铺');
});

test('身体网格：三角形按 UV 摊开，每格记下身体上的三维位置；岛边往外补几格', () => {
  const geo = pillar(), body = Z.rasterBody(geo, 64);
  let core = 0, grown = 0; for (const u of body.used) { if (u === 1) core++; else if (u === 2) grown++; }
  assert.ok(core > 64 * 64 * 0.4 && core < 64 * 64 * 0.55, `盖到 ${core} 格（左半边）`);
  assert.ok(grown > 0, '岛边补了格子');
  // 贴图第 k 行对应高度 1.8 × (1 − v)：越往下越低
  const at = (x, y) => body.pos[(y * 64 + x) * 3 + 1];
  assert.ok(Math.abs(at(4, 0) - 1.8 * (1 - 0.5 / 64)) < 0.02, `顶上一行 ${at(4, 0)}`);
  assert.ok(at(4, 60) < at(4, 30) && at(4, 30) < at(4, 3));
  // 正面那一条（第 0 面）法线朝 +z
  assert.ok(body.nrm[(32 * 64 + 4) * 3 + 2] > 0.9);
  const f = Z.bodyFrame(geo.position); assert.ok(Math.abs(f.top - 1.8) < 1e-6 && Math.abs(f.cx) < 1e-6 && f.front > 0.1 && f.back < -0.1);
});

test('伤口落在身体实处；血往下淌：伤口下方的血量远多于上方，过了淌的长度就没了', () => {
  const geo = pillar(), body = Z.rasterBody(geo, 64), frame = Z.bodyFrame(geo.position);
  const plan = Z.planWounds(body, frame, { top: 1.8, front: 0.15, x: 0 }, 3);
  for (const w of plan.fresh) assert.ok(Math.abs(Math.abs(w.x) - 0.15) < 0.02 || Math.abs(Math.abs(w.z) - 0.15) < 0.02, `伤口在柱子表面 ${JSON.stringify(w)}`);
  const w = { x: 0, y: 1.2, z: 0.15, r: 0.05, run: 0.4, wet: 1 };
  assert.equal(Z.soak(0, 1.2, 0.15, w), 1);
  assert.ok(Z.soak(0, 1.12, 0.15, w) > 0.5, '下方 8 厘米还很多');
  assert.ok(Z.soak(0, 1.28, 0.15, w) < 0.1, '上方 8 厘米几乎没有');
  assert.equal(Z.soak(0, 0.7, 0.15, w), 0, '淌完了');
  assert.equal(Z.soak(0.3, 1.2, 0.15, w), 0, '旁边 30 厘米没有');
  // 每种外观的旧血块：落在身体上，back 时第一块在背后
  const st = Z.planStains(body, frame, 5, 2, true);
  assert.equal(st.length, 3); assert.ok(st[0].z < -0.1, '背上那块');
  const field = Z.stainField(body, st); assert.ok(field.some((v) => v > 0.9));
});

test('肤色判断：人的皮肤算，金发、棕发、粉衬衫、卡其裤、牛仔蓝不算', () => {
  for (const c of [[224, 172, 140], [210, 150, 120], [236, 190, 160]]) assert.ok(Z.skinness(...c) > 0.5, `皮肤 ${c}`);
  for (const c of [[200, 170, 120], [90, 60, 40], [200, 110, 130], [180, 170, 120], [60, 90, 130], [30, 30, 30]]) assert.ok(Z.skinness(...c) < 0.5, `不是皮肤 ${c}`);
});

test('整套画法跑通：图层、颜色图、法线和粗糙度；血是往下的、湿血比布料亮', () => {
  const geo = pillar(), body = Z.rasterBody(geo, 64), frame = Z.bodyFrame(geo.position);
  const plan = Z.planWounds(body, frame, { top: 1.8, front: 0.15, x: 0 }, 3);
  const S = 64, src = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) { const x = i % S; src.set(x < S / 2 ? [150, 150, 160, 255] : [255, 255, 255, 255], i * 4); } // 左半边灰布，右半边没用到
  const tables = { n: 64, a: Z.noiseTable(64, 1), b: Z.noiseTable(64, 2, 4, 16) };
  const gen = Z.prepareLayers(src, S, body, plan, tables); let yields = 0, r;
  while (!(r = gen.next()).done) yields++;
  const L = r.value; assert.ok(yields >= 2, `切成了 ${yields} 段`);
  assert.equal(L.part[10 * S + 50], Z.PART.none, '没用到的地方');
  assert.equal(L.part[30 * S + 4], Z.PART.cloth);
  assert.ok(L.grime[60 * S + 4] > L.grime[4 * S + 4], '脚下比头上脏');
  const out = new Uint8ClampedArray(S * S * 4);
  Z.finish(Z.paintColour(src, L, Z.LOOKS.walker[0], ZOMBIE_SKIN.tones[0], Z.stainField(body, []), body, out));
  assert.equal(out[(40 * S + 50) * 4 + 3], 0, '下半张没用到的白底清成透明（头发 mipmap 不泛白）');
  for (let i = 0; i < out.length; i++) assert.ok(Number.isFinite(out[i]));
  const H = S / 2, nrm = new Uint8ClampedArray(H * H * 4), rough = new Uint8ClampedArray(H * H * 4);
  Z.finish(Z.paintSurface(src, L, tables, nrm, rough));
  let wet = 0, cloth = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < H / 2; i++) {
    const o = (j * 2) * S + i * 2, v = rough[(j * H + i) * 4 + 1];
    if (L.fresh[o] > 200) wet = Math.max(wet, 255 - v); else if (L.part[o] === Z.PART.cloth && L.fresh[o] < 60) cloth = Math.max(cloth, 255 - v);
  }
  assert.ok(wet > cloth + 60, `湿血更亮（粗糙度低）：${255 - wet} vs ${255 - cloth}`);
  for (let i = 0; i < H * H; i++) assert.ok(nrm[i * 4 + 2] > 127, '法线朝外');
});

test('各外观：特殊感染者都有自己的一套，颜色互相分得开', () => {
  for (const k of ['pale', 'lunger', 'spitter', 'brute', 'bloater']) assert.ok(Z.LOOKS[k], k);
  assert.equal(Z.LOOKS.walker.length, ZOMBIE_SKIN.tones.length);
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  assert.ok(lum(Z.LOOKS.pale.skinA) > lum(Z.LOOKS.walker[0].skinA) + 40, '尖叫者惨白');
  assert.ok(lum(Z.LOOKS.lunger.skinA) < lum(Z.LOOKS.walker[0].skinA) - 20, '扑袭者发黑');
  assert.ok(Z.LOOKS.spitter.skinA[0] > Z.LOOKS.spitter.skinA[2] * 1.6, '喷酸者发黄');
  assert.ok(Z.LOOKS.brute.skinA[0] > Z.LOOKS.brute.skinA[1] * 1.6, '巨尸暗红');
});

test('贴图大小按内存档位：电脑 1024 + 法线粗糙度 512，手机 512 + 256，省内存 256、不做法线粗糙度；不超过 1024', () => {
  assert.deepEqual(zombieTexSizes(MEMORY_PROFILES.full), { colour: 1024, surface: 512 });
  assert.deepEqual(zombieTexSizes(MEMORY_PROFILES.rich), { colour: 512, surface: 256 });
  assert.deepEqual(zombieTexSizes(MEMORY_PROFILES.standard), { colour: 512, surface: 256 });
  assert.deepEqual(zombieTexSizes(MEMORY_PROFILES.compact), { colour: 256, surface: 0 });
  assert.ok(ZOMBIE_SKIN.special.bloater.optional, '胖尸那套省内存档不做（和以前一样多张）');
});

test('没有 document（测试环境）：载入失败走 reject，不在导入时就抛错', async () => {
  assert.equal(typeof document, 'undefined');
  await assert.rejects(() => loadZombieKit());
});
