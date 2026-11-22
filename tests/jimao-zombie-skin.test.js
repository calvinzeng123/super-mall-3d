// 丧尸贴图的画法（skins/zombie-paint.js）和贴图大小、脸的量法（zombie-skin.js）：纯运算部分，不需要浏览器
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as Z from '../src/jimao/skins/zombie-paint.js';
import { zombieTexSizes, ZOMBIE_SKIN, loadZombieKit, faceOf } from '../src/jimao/zombie-skin.js';
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
const FACE = { top: 1.8, front: 0.15, x: 0 };
function setup(L = 64) {
  const geo = pillar(), body = Z.rasterBody(geo, L), frame = Z.bodyFrame(geo.position), fp = Z.planFace(body, frame, FACE);
  return { geo, body, frame, fp };
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

test('身体网格：三角形按 UV 摊开，每格记下身体上的三维位置；岛边往外补几格；身体尺寸带裤腰和膝盖高度', () => {
  const { geo, body } = setup();
  let core = 0, grown = 0; for (const u of body.used) { if (u === 1) core++; else if (u === 2) grown++; }
  assert.ok(core > 64 * 64 * 0.4 && core < 64 * 64 * 0.55, `盖到 ${core} 格（左半边）`);
  assert.ok(grown > 0, '岛边补了格子');
  const at = (x, y) => body.pos[(y * 64 + x) * 3 + 1];
  assert.ok(Math.abs(at(4, 0) - 1.8 * (1 - 0.5 / 64)) < 0.02, `顶上一行 ${at(4, 0)}`);
  assert.ok(at(4, 60) < at(4, 30) && at(4, 30) < at(4, 3));
  assert.ok(body.nrm[(32 * 64 + 4) * 3 + 2] > 0.9, '正面那一条法线朝 +z');
  const f = Z.bodyFrame(geo.position);
  assert.ok(Math.abs(f.top - 1.8) < 1e-6 && Math.abs(f.cx) < 1e-6 && f.front > 0.1 && f.back < -0.1);
  assert.ok(f.waist > f.knee && f.waist < f.top * 0.6 && f.knee > 0.3, `裤腰 ${f.waist} 膝盖 ${f.knee}`);
});

test('伤口按外观各挑各的：同一个模型的几套外观主伤口不在同一处，同一套每次一样', () => {
  const { body, frame, fp } = setup(96);
  const plans = [0, 1, 2].map((k) => Z.planLook(body, frame, fp, 1000 + k * 131, Z.LOOKS.walker[k], k));
  const again = Z.planLook(body, frame, fp, 1000, Z.LOOKS.walker[0], 0);
  assert.deepEqual(again.wounds.map((w) => [w.x, w.y, w.z]), plans[0].wounds.map((w) => [w.x, w.y, w.z]), '可复现');
  const key = (p) => p.wounds.map((w) => `${w.x.toFixed(2)},${w.y.toFixed(2)},${w.z.toFixed(2)}`).join('|');
  assert.equal(new Set(plans.map(key)).size, 3, '三套外观的伤口各不相同');
  // 主伤口（每套的第一处）落点互相隔开
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const a = plans[i].wounds[0], b = plans[j].wounds[0];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.05, `外观 ${i}、${j} 的主伤口离得太近`);
  }
  for (const p of plans) {
    assert.ok(p.wounds.length >= 1 && p.wounds.length <= 4, `${p.wounds.length} 处`);
    for (const w of p.wounds) assert.ok(Math.abs(Math.abs(w.x) - 0.15) < 0.03 || Math.abs(Math.abs(w.z) - 0.15) < 0.03, `伤口在柱子表面 ${w.x},${w.z}`);
    assert.ok(p.mouth && p.mouth.y < fp.eyeY, '嘴在眼睛下面');
  }
});

test('血往下淌：伤口下方的血远多于上方，越往下越宽，过了淌的长度就没了，背面不沾', () => {
  const frame = { waist: 0.2 };
  const W = { x: 0, y: 1.2, z: 0.15, nx: 0, nz: 1, r: 0.05, len: 0.4, spread: 0.2, open: 1, wet: 1, amt: 1, ang: 0 }, o = [0, 0, 0];
  const pot = (x, y, nz = 1) => Z.woundAt(W, x, y, 0.15, 0, nz, 0.5, 0.5, frame, o)[0];
  assert.ok(pot(0, 1.2) > 0.9, '伤口上');
  assert.ok(pot(0, 1.1) > 0.5, '下方 10 厘米还很多');
  assert.ok(pot(0, 1.3) < 0.05, '上方 10 厘米几乎没有');
  assert.equal(pot(0, 0.6), 0, '淌完了');
  assert.equal(pot(0, 1.1, -1), 0, '背面不沾');
  assert.ok(pot(0.07, 1.0) > pot(0.07, 1.18), '往下洇得更宽');
  assert.ok(Z.woundAt(W, 0, 1.2, 0.15, 0, 1, 0.5, 0.5, frame, o)[2] > 0.5 && Z.woundAt(W, 0.06, 1.2, 0.15, 0, 1, 0.5, 0.5, frame, o)[2] === 0, '皮肉只在伤口那一小处翻开');
  // 细流：伤口上方没有，下方某些水平位置有
  const S = { ...W, seed: 7, slot: 0.013, dens: 0.6, width: 0.004, slen: 0.2, sw: 0.1, sy0: 0.1, sy1: 0.52 };
  assert.equal(Z.streamAt(S, 0, 1.25, 0.15, 1), 0);
  let hit = 0; for (let x = -0.08; x <= 0.08; x += 0.001) if (Z.streamAt(S, x, 0.95, 0.15, 1) > 0.5) hit++;
  assert.ok(hit > 0 && hit < 120, `细流是一条条的（${hit} / 161）`);
});

test('裂口和抓痕：中间是洞，边上一边毛边一边阴影，离远了没有', () => {
  const C = { x: 0, y: 1.2, z: 0.15, nx: 0, nz: 1, ca: 1, sa: 0, curv: 0, reach: 0.1, cuts: [{ off: 0, len: 0.1, shift: 0, w: 0.006 }] };
  const out = [0, 0, 0];
  Z.slashAt(C, 0, 1.2, 0.15, 0, 1, 0.5, out); assert.ok(out[0] > 0.9, '洞');
  out.fill(0); Z.slashAt(C, 0, 1.2 + 0.0075, 0.15, 0, 1, 0.5, out); assert.ok(out[1] > 0 && out[0] < 0.5, '上边毛边');
  out.fill(0); Z.slashAt(C, 0, 1.2 - 0.0075, 0.15, 0, 1, 0.5, out); assert.ok(out[2] > 0 && out[1] === 0, '下边阴影');
  out.fill(0); Z.slashAt(C, 0.2, 1.2, 0.15, 0, 1, 0.5, out); assert.deepEqual(out, [0, 0, 0], '远处');
  out.fill(0); Z.slashAt(C, 0, 1.2, 0.15, 0, -1, 0.5, out); assert.deepEqual(out, [0, 0, 0], '背面');
});

test('肤色判断：人的皮肤算，金发、棕发、粉衬衫、卡其裤、牛仔蓝不算', () => {
  for (const c of [[224, 172, 140], [210, 150, 120], [236, 190, 160]]) assert.ok(Z.skinness(...c) > 0.5, `皮肤 ${c}`);
  for (const c of [[200, 170, 120], [90, 60, 40], [200, 110, 130], [180, 170, 120], [60, 90, 130], [30, 30, 30]]) assert.ok(Z.skinness(...c) < 0.5, `不是皮肤 ${c}`);
});

test('透明通道的湿度编码：头发半透明照旧能裁掉，不透明的 0.5 往上越湿越大', () => {
  assert.equal(Z.encodeWet(255, 0), 128);
  assert.equal(Z.encodeWet(255, 1), 255);
  assert.ok(Z.encodeWet(255, 0.12) > 128 && Z.encodeWet(255, 0.12) < 150);
  assert.ok(Z.encodeWet(80, 1) < 0.225 * 255, '原来会被 alphaTest 0.45 裁掉的，现在照样裁掉');
  assert.ok(Z.encodeWet(200, 0) >= 0.225 * 255 && Z.encodeWet(200, 0) < 128, '原来留下的半透明，现在也留下、而且不当成湿');
});

test('整套画法跑通：图层、血、颜色图、法线和粗糙度；血往下、湿血写进透明通道、没用到的下半张透明', () => {
  const { body, frame, fp } = setup();
  const S = 64, src = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) { const x = i % S, y = Math.floor(i / S); src.set(x < S / 2 ? [150 + (y % 4 < 2 ? 60 : 0), 150, 160, 255] : [255, 255, 255, 255], i * 4); } // 左半边条纹布，右半边没用到
  const tables = { n: 64, a: Z.noiseTable(64, 1), b: Z.noiseTable(64, 2, 4, 16) };
  const gen = Z.prepareLayers(src, S, body, fp, tables); let yields = 0, r;
  while (!(r = gen.next()).done) yields++;
  const L = r.value; assert.ok(yields >= 2, `切成了 ${yields} 段`);
  assert.equal(L.part[10 * S + 50], Z.PART.none, '没用到的地方');
  assert.equal(L.part[30 * S + 4], Z.PART.cloth);
  assert.ok(L.grime[62 * S + 4] > L.grime[4 * S + 4] + 60, '脚下比头上脏得多');
  assert.ok(L.low.every((v) => v >= 0 && v <= 1), '低通的明暗在 0–1');
  // 一处正面的伤：在柱子正面一半高的地方，往下淌
  const W = Z.planLook(body, frame, fp, 3, Z.LOOKS.walker[0], 0);
  W.wounds = [{ ...W.wounds[0], x: 0, y: 1.0, z: 0.15, nx: 0, nz: 1, r: 0.06, len: 0.4, spread: 0.2, open: 1, wet: 1, sy0: 0.1, sy1: 0.5 }];
  W.claws = []; W.rips = []; W.sprays = [];
  const field = Z.finish(Z.bloodField(body, W, frame));
  const fAt = (y) => { let m = 0; for (let x = 0; x < 8; x++) m = Math.max(m, field.pot[y * 64 + x]); return m; };
  const row = (h) => Math.round((1 - h / 1.8) * 64);
  assert.ok(fAt(row(0.92)) > fAt(row(1.08)) + 0.3, `下方血多：${fAt(row(0.92))} vs ${fAt(row(1.08))}`);
  const out = new Uint8ClampedArray(S * S * 4);
  Z.finish(Z.paintColour(src, L, Z.LOOKS.walker[0], ZOMBIE_SKIN.tones[0], W, field, body, tables, out));
  assert.equal(out[(40 * S + 50) * 4 + 3], 0, '下半张没用到的白底清成透明（头发 mipmap 不泛白）');
  for (let i = 0; i < out.length; i++) assert.ok(Number.isFinite(out[i]));
  let wetMax = 0, dryCloth = 255; for (let j = 0; j < S; j++) for (let i = 0; i < 8; i++) { const a = out[(j * S + i) * 4 + 3]; wetMax = Math.max(wetMax, a); if (j < 6) dryCloth = Math.min(dryCloth, a); }
  assert.ok(wetMax > 200, `伤口处湿（透明通道 ${wetMax}）`); assert.equal(dryCloth, 128, '没血的布不改粗糙度');
  // 伤口处比旁边同高度没血的布暗、偏红
  const px = (x, y) => [...out.slice((y * S + x) * 4, (y * S + x) * 4 + 3)], wound = px(4, row(1.0)), clean = px(4, row(1.6));
  assert.ok(wound[0] + wound[1] + wound[2] < (clean[0] + clean[1] + clean[2]) * 0.6 && wound[0] > wound[1] * 1.5, `伤口 ${wound} 干净 ${clean}`);
  const H = S / 2, nrm = new Uint8ClampedArray(H * H * 4), rough = new Uint8ClampedArray(H * H * 4);
  Z.finish(Z.paintSurface(src, L, tables, nrm, rough, body));
  for (let i = 0; i < H * H; i++) assert.ok(nrm[i * 4 + 2] > 127, '法线朝外');
  const clothR = rough[(10 * H + 2) * 4 + 1]; assert.ok(clothR > 200, `布哑光 ${clothR}`);
});

test('各外观：特殊感染者都有自己的一套，颜色互相分得开', () => {
  for (const k of ['pale', 'lunger', 'spitter', 'brute', 'bloater']) assert.ok(Z.LOOKS[k], k);
  assert.equal(Z.LOOKS.walker.length, ZOMBIE_SKIN.tones.length);
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  assert.ok(lum(Z.LOOKS.pale.skinA) > lum(Z.LOOKS.walker[0].skinA) + 15, '尖叫者惨白');
  assert.ok(Z.LOOKS.pale.skinA[2] >= Z.LOOKS.pale.skinA[0], '尖叫者偏冷（灰紫）');
  assert.ok(lum(Z.LOOKS.lunger.skinA) < lum(Z.LOOKS.walker[0].skinA) - 20, '扑袭者发黑');
  const [sr, sg, sb] = Z.LOOKS.spitter.skinA;
  assert.ok(sr > sb * 1.25 && sg > sb * 1.25 && Math.abs(sr - sg) < 20, '喷酸者蜡黄（不是一片绿）');
  assert.ok(Z.LOOKS.brute.skinA[0] > Z.LOOKS.brute.skinA[1] * 1.3, '巨尸暗红');
  assert.equal(Z.LOOKS.spitter.spots, 'acid'); assert.equal(Z.LOOKS.brute.spots, 'lesion');
  assert.ok(ZOMBIE_SKIN.special.lunger.env > ZOMBIE_SKIN.envMapIntensity, '扑袭者环境反射多一点');
});

test('脸的量法：带 UV 时从眼球、口腔那两小块的顶点量；没有 UV 照旧（头顶、最前面、中心）', () => {
  const pos = [], uv = [];
  const add = (x, y, z, u, v) => { pos.push(x, y, z); uv.push(u, v); };
  add(0, 0, 0, 0.1, 0.9); add(0, 1.8, 0, 0.7, 0.1); add(0, 1.62, 0.15, 0.75, 0.15); // 脚、头顶、鼻尖
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) add(s * 0.032, 1.66 + k * 0.002, 0.1 + k * 0.004, 0.62, 0.45); // 眼球
  add(0, 1.59, 0.1, 0.55, 0.4); add(0.01, 1.595, 0.1, 0.56, 0.41); // 口腔
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const f = faceOf(geo);
  assert.equal(f.eyes.length, 2); assert.ok(f.eyes[0].x < 0 && f.eyes[1].x > 0);
  assert.ok(Math.abs(f.eyes[0].y - 1.662) < 1e-3 && Math.abs(f.eyes[0].front - 0.108) < 1e-6, JSON.stringify(f.eyes[0]));
  assert.ok(Math.abs(f.mouth.y - 1.5925) < 1e-3, JSON.stringify(f.mouth));
  assert.ok(Math.abs(f.nose.z - 0.15) < 1e-6);
  geo.deleteAttribute('uv'); const g = faceOf(geo); assert.equal(g.eyes, undefined); assert.ok(Math.abs(g.top - 1.8) < 1e-6);
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

test('第二轮：细血点是零星不规则的小点；侧面不画正面的口子（不会拉成方框）；转到侧面的细流几乎不染色', () => {
  const tA = Z.noiseTable(256, 5), tB = Z.noiseTable(256, 6, 4, 16);
  let on = 0, n = 0, hi = 0;
  for (let y = 0; y < 256; y += 0.5) for (let x = 0; x < 256; x += 0.5) { const d = Z.dropAt(tA, tB, 256, x, y, 7.5, 3, 4, 0.76); assert.ok(d >= 0 && d <= 1); n++; if (d > 0.5) on++; if (d > hi) hi = d; }
  assert.ok(hi > 0.9 && on / n > 0.001 && on / n < 0.08, `血点占 ${(on / n * 100).toFixed(2)}%`);
  // 正面的一道口子，侧面（法线转了 90 度）上同一横向位置不画
  const C = { x: 0, y: 1.2, z: 0.15, nx: 0, nz: 1, ca: 1, sa: 0, curv: 0, reach: 0.1, cuts: [{ off: 0, len: 0.1, shift: 0, w: 0.006 }] }, out = [0, 0, 0];
  Z.slashAt(C, 0.0, 1.2, 0.1, 1, 0.2, 0.5, out); assert.deepEqual(out, [0, 0, 0], '侧面');
  // 细流：朝向权重很小（g = 0.01）时贡献也很小
  const S = { x: 0, y: 1.2, z: 0.15, nx: 0, nz: 1, len: 0.4, seed: 7, slot: 0.013, dens: 0.6, width: 0.004, slen: 0.2, sw: 0.1, sy0: 0.1, sy1: 0.52 };
  let mx = 0; for (let x = -0.08; x <= 0.08; x += 0.001) mx = Math.max(mx, Z.streamAt(S, x, 0.95, 0.15, 0.01));
  assert.ok(mx <= 0.01 + 1e-9);
});
