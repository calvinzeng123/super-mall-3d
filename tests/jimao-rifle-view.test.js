// 新步枪（src/jimao/rifle-view.js）：换弹时间轴和原游戏步枪对得上、左手的关键姿势齐全、切枪时左手先松后托、
// 贴图大小跟内存档位走、两段 IK、照门扩孔、挂到原游戏步枪上 / 拆下来；素材清单和许可。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { RIFLE_VIEW, HAND_KEYS, RELOAD_KEYS, keyAt, reloadParts, supportWeight, rifleTextureCap, solveElbow, apertureRadius, smoother, createRifleView } from '../src/jimao/rifle-view.js';
import { MEMORY_PROFILES } from '../src/render/device.js';
import { DRAW, SWAP } from '../src/jimao/arsenal.js';

const vendor = readFileSync(new URL('../src/jimao/vendor/game.js', import.meta.url), 'utf8');

test('换弹时间轴：和原游戏步枪同一个节拍（弹匣离手 / 插回 / 枪机复进），在换弹时长之内回到护木', () => {
  const m = vendor.match(/me = ([\d.]+), ee = ([\d.]+), B = ([\d.]+), P = ([\d.]+), V = ([\d.]+), Y = new gi\(\)/);
  assert.ok(m, '原游戏的换弹节拍那一行还在');
  const [, magOut, magIn, , , release] = m.map(Number);
  assert.equal(RELOAD_KEYS.magOut, magOut); assert.equal(RELOAD_KEYS.magIn, magIn); assert.equal(RELOAD_KEYS.boltRelease, release);
  const W = +vendor.match(/var W_ = ([\d.]+);/)[1], G = +vendor.match(/var G_ = ([\d.]+);/)[1];
  assert.equal(W, 2.1); assert.equal(G, 2.72); // 换弹时长没动
  for (const [name, keys, T] of [['tactical', RELOAD_KEYS.tactical, W], ['empty', RELOAD_KEYS.empty, G]]) {
    for (let i = 1; i < keys.length; i++) assert.ok(keys[i][0] > keys[i - 1][0], `${name} 时间递增`);
    for (const [, k] of keys) assert.ok(HAND_KEYS[k], `${name} 用到的 ${k} 有定义`);
    assert.equal(keys[0][1], 'guard'); assert.equal(keys.at(-1)[1], 'guard');
    const back = keys.findLast((k, i) => i < keys.length - 1 && k[1] !== 'guard')[0], home = keys.find((k) => k[0] > back && k[1] === 'guard')[0];
    assert.ok(home <= T - 0.05, `${name}：${home} 秒回到护木，换弹 ${T} 秒`);
    // 弹匣离开、插回的时刻，手都在弹匣上
    for (const t of [RELOAD_KEYS.magOut, RELOAD_KEYS.magIn]) { const at = keyAt(keys, t); assert.ok(HAND_KEYS[at.k < 0.5 ? at.a : at.b].at === 'mag', `${name} ${t} 秒手在弹匣上`); }
    // 中途下到腰间拿新弹匣
    assert.ok(keys.some(([, k]) => k === 'pouch'));
  }
  // 打空的多一下：按空仓挂机钮，按下去的时刻 = 枪机复进的声音
  const at = keyAt(RELOAD_KEYS.empty, RELOAD_KEYS.boltRelease - 1e-3); assert.equal(at.b, 'press');
});

test('关键姿势：定位点、手指姿势都有；keyAt 两头夹住、缓动在 0–1', () => {
  for (const [n, K] of Object.entries(HAND_KEYS)) {
    assert.ok(RIFLE_VIEW.anchors[K.at], `${n} 的定位点 ${K.at}`);
    assert.ok(RIFLE_VIEW.fingers[K.fingers] >= 0, `${n} 的手指 ${K.fingers}`);
    assert.equal(K.p.length, 3); assert.equal(K.r.length, 3);
  }
  assert.deepEqual(keyAt(RELOAD_KEYS.tactical, -1), { a: 'guard', b: 'guard', k: 0 });
  const end = keyAt(RELOAD_KEYS.tactical, 99); assert.equal(end.b, 'guard'); assert.ok(end.k <= 1);
  for (let t = 0; t <= 2.8; t += 0.01) { const a = keyAt(RELOAD_KEYS.empty, t); assert.ok(a.k >= 0 && a.k <= 1); }
  assert.equal(smoother(0), 0); assert.equal(smoother(1), 1); assert.equal(smoother(0.5), 0.5);
});

test('换弹零件：弹匣只在 0.47–1.345 秒在左手里；打空的枪机挂在后面，2.19 秒按钮后 0.035 秒复进', () => {
  assert.equal(reloadParts(0.4, false).held, false); assert.equal(reloadParts(0.5, false).held, true);
  assert.equal(reloadParts(1.3, false).held, true); assert.equal(reloadParts(1.4, false).held, false);
  assert.equal(reloadParts(1.0, false).boltOpen, 0);
  assert.equal(reloadParts(2.0, true).boltOpen, 1);
  assert.ok(reloadParts(2.2, true).boltOpen > 0 && reloadParts(2.2, true).boltOpen < 1);
  assert.equal(reloadParts(2.3, true).boltOpen, 0);
});

test('切枪：放下步枪时左手前 60% 就松开；掏出来时枪先到、左手最后托上；切的不是步枪就不管', () => {
  assert.equal(supportWeight(null, 0), 1);
  assert.equal(supportWeight('lower', 0), 1); assert.equal(supportWeight('lower', 0.6), 0); assert.equal(supportWeight('lower', 1), 0);
  assert.ok(supportWeight('lower', 0.3) < 1 && supportWeight('lower', 0.3) > 0);
  assert.equal(supportWeight('draw', 0.2), 0); assert.equal(supportWeight('draw', 0.85), 1); assert.equal(supportWeight('draw', 1), 1);
  for (let k = 0; k < 1; k += 0.05) assert.ok(supportWeight('draw', k + 0.05) >= supportWeight('draw', k));
  assert.equal(supportWeight('draw', 0.1, false), 1);
  // 掏枪、放下的时长没改（原来的切枪手感）
  assert.equal(DRAW.rifle, 0.46); assert.equal(SWAP.lower, 0.17);
});

test('贴图大小跟内存档位：电脑 / 手机精细 1024，手机标准 / 省内存 512；画质「低」也 512', () => {
  assert.equal(rifleTextureCap(MEMORY_PROFILES.full, { tex: 1024 }), 1024);
  assert.equal(rifleTextureCap(MEMORY_PROFILES.rich, { tex: 1024 }), 1024);
  assert.equal(rifleTextureCap(MEMORY_PROFILES.standard, { tex: 1024 }), 512);
  assert.equal(rifleTextureCap(MEMORY_PROFILES.compact, { tex: 1024 }), 512);
  assert.equal(rifleTextureCap(MEMORY_PROFILES.full, { tex: 512 }), 512);
  assert.equal(rifleTextureCap(null, null), 1024);
});

test('两段 IK：够得着时上臂、前臂长度不变，肘弯向 pole 那一边；够不着时手臂伸直指向目标', () => {
  const s = new THREE.Vector3(0, 0, 0), a = 0.3, b = 0.28, pole = new THREE.Vector3(-1, -1, 0);
  for (const t of [new THREE.Vector3(0.2, 0.1, -0.3), new THREE.Vector3(-0.1, 0.05, -0.4), new THREE.Vector3(0.3, -0.1, -0.2)]) {
    const e = solveElbow(s, a, b, t, pole);
    assert.ok(Math.abs(e.distanceTo(s) - a) < 1e-6); assert.ok(Math.abs(e.distanceTo(t) - b) < 1e-6);
    // 肘在 s→t 连线的 pole 一侧
    const dir = t.clone().sub(s).normalize(), off = e.clone().sub(s), side = off.sub(dir.clone().multiplyScalar(off.dot(dir)));
    const pv = pole.clone().sub(s); pv.sub(dir.clone().multiplyScalar(pv.dot(dir)));
    assert.ok(side.dot(pv) > 0);
  }
  const far = new THREE.Vector3(0, 0, -2), e = solveElbow(s, a, b, far, pole);
  assert.ok(Math.abs(e.z + a) < 1e-3 && Math.abs(e.x) < 1e-2 && Math.abs(e.y) < 1e-2, '伸直');
});

test('照门扩孔：孔放大到 hole 倍，外圈不动，中间单调连续（三角形不会翻）', () => {
  const A = RIFLE_VIEW.aperture;
  assert.ok(Math.abs(apertureRadius(A.inner) - A.inner * A.hole) < 1e-12);
  assert.equal(apertureRadius(A.ring), A.ring); assert.equal(apertureRadius(A.ring * 2), A.ring * 2);
  let prev = -1; for (let r = 0; r <= A.ring * 1.2; r += A.ring / 400) { const v = apertureRadius(r); assert.ok(v >= prev - 1e-12); prev = v; }
  assert.ok(Math.abs(apertureRadius(A.inner + 1e-9) - apertureRadius(A.inner - 1e-9)) < 1e-6);
});

/** 假的原游戏步枪：根节点下几样零件 + 一个枪口火光（带 uJet / uSeed 的着色器），anim / spec 和真的同名字段 */
function fakeRifle() {
  const root = new THREE.Group(); root.name = 'viewmodel-pac9';
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), new THREE.MeshStandardMaterial()); gun.name = 'pac9-body';
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.ShaderMaterial({ uniforms: { uJet: { value: 1 }, uSeed: { value: 0 } } }));
  flash.position.set(0, 0, -0.531); root.add(gun, flash);
  return { root, gun, flash, anim: { reload: null, reloadW: 0, boltT: 9, boltLocked: false, finger: 0, lastShot: -9 }, spec: { sightY: 0.069, muzzle: [0, 0, -0.531], eject: [0.023, 0.004, -0.028] } };
}
/** 假的 M4 场景：几个要动的零件，名字和真模型一样 */
function fakeM4() {
  const scene = new THREE.Group();
  for (const [n, p] of [['Magazine', [0, -0.2, -0.31]], ['ChargingHandle', [0.075, 0.085, -0.05]], ['M4A1Body_03_Ejector_Lid', [0, 0, 0]], ['M4A1Body_02_Ejector_2', [0, 0, 0]], ['M4A1Body_07_Trigger', [0, 0, 0]]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshStandardMaterial()); m.name = n; m.position.set(...p); scene.add(m);
  }
  return { scene };
}

test('挂到原游戏步枪上：原来的模型收起来（火光留着、挪到新枪口），枪口 / 抛壳口改成新枪的；开镜线对着原游戏的 sightY；拆下来全部复原', () => {
  const R = fakeRifle(), view = createRifleView(R);
  assert.equal(view.attach(fakeM4(), null), true); assert.equal(view.ready, true);
  assert.equal(R.gun.parent.name, 'rifle-vendor-hidden'); assert.equal(R.gun.parent.visible, false);
  assert.equal(R.flash.parent, R.root);
  assert.ok(R.spec.muzzle[2] < -0.5 && R.spec.muzzle[2] !== -0.531, `枪口 ${R.spec.muzzle}`);
  assert.ok(R.flash.position.distanceTo(new THREE.Vector3(...R.spec.muzzle)) < 1e-9);
  // 后照门孔和准星尖：都在 x = 0、y = sightY 那条线上（开镜正对屏幕中心）
  const h = view.holder; h.updateMatrix();
  const rear = new THREE.Vector3(...RIFLE_VIEW.rear).applyMatrix4(h.matrix), front = new THREE.Vector3(...RIFLE_VIEW.front).applyMatrix4(h.matrix);
  assert.ok(Math.abs(rear.y - 0.069) < 1e-6 && Math.abs(front.y - 0.069) < 1e-6, `${rear.y} ${front.y}`);
  assert.ok(Math.abs(rear.z - RIFLE_VIEW.eyeZ) < 1e-6 && front.z < rear.z - 0.3);
  // 换弹中弹匣跟着手走、插回去以后回原位；第一枪以后防尘盖弹开
  const mag = view.parts.Magazine, home = mag.position.clone();
  R.anim.reload = { t: 0.8, T: 2.1, empty: false }; view.update(1 / 60);
  assert.ok(mag.position.distanceTo(home) > 0.05, '弹匣拔出来了');
  R.anim.reload = { t: 1.5, T: 2.1, empty: false }; view.update(1 / 60);
  assert.ok(mag.position.distanceTo(home) < 1e-9, '插回原位');
  R.anim.reload = null; R.anim.boltT = 0.01; R.anim.lastShot = 3; for (let i = 0; i < 30; i++) view.update(1 / 60);
  assert.ok(view.state.dust > 0.8, `防尘盖 ${view.state.dust}`);
  view.reset(); view.update(1 / 60); assert.equal(view.state.dust, 0, '新一局防尘盖合上');
  // 切枪：放下时左手撤开
  view.update(1 / 60, { phase: 'lower', k: 0.8 }); assert.equal(view.state.support, 0);
  view.dispose();
  assert.equal(R.gun.parent, R.root); assert.deepEqual(R.spec.muzzle, [0, 0, -0.531]); assert.equal(view.ready, false);
  assert.ok(!R.root.children.some((c) => c.name === 'rifle-view' || c.name === 'rifle-vendor-hidden'));
  // 没有原游戏的内部状态（anim）就不换
  assert.equal(createRifleView({ root: new THREE.Group() }).attach(fakeM4(), null), false);
});

test('原游戏补丁：步枪露出 anim / spec（patches.mjs 里登记了，game.js 里打上了）', async () => {
  const { PATCHES } = await import('../scripts/jimao/patches.mjs');
  assert.ok(PATCHES.some(([, , to]) => to.includes('anim: k, spec: mi')));
  assert.match(vendor, /root: e, debug: ce, anim: k, spec: mi, info: \{/);
});

test('素材：M4A1 文件、清单、哈希、许可（CC0，nisu）、来源记录；运行时清单里有它，旧射击模式不加载它', async () => {
  const dir = new URL('../assets/models/fps/', import.meta.url);
  const file = new URL('m4a1-mobile.glb', dir); assert.ok(existsSync(file));
  const bytes = readFileSync(file), man = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  const rec = man.files.find((f) => f.file === 'm4a1-mobile.glb');
  assert.ok(rec); assert.equal(rec.bytes, bytes.length); assert.equal(rec.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(rec.license, 'CC0-1.0'); assert.equal(rec.author, 'nisu');
  assert.ok(rec.triangles < 12000, `三角形 ${rec.triangles}`);
  for (const t of rec.textures) assert.ok(Math.max(...t.runtime) <= 1024 && t.bytes < 400000, `贴图 ${t.name}`);
  assert.ok(bytes.length < 1200000, `文件 ${bytes.length}`);
  // glb 里没有上游拼上去的 Quaternius 零件
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  const names = json.nodes.map((n) => n.name);
  for (const n of ['Foregrip', 'Suppressor', 'OpticMount', 'SpareMagazine']) assert.ok(!names.includes(n), n);
  for (const n of ['Magazine', 'ChargingHandle', 'RearIronSightGeometry_Sight_2', 'M4A1Body_03_Ejector_Lid']) assert.ok(names.includes(n), n);
  assert.equal(json.materials.length, 1); assert.ok(json.images.every((i) => i.mimeType === 'image/jpeg'));
  const src = JSON.parse(readFileSync(new URL('sources.json', dir), 'utf8'));
  const d = src.rifleDownloads.find((x) => x.sourceFile === 'steel_tide_m4a1.glb');
  assert.equal(d.sha256, rec.sourceSha256); assert.equal(d.license, 'CC0-1.0');
  assert.match(src.rifleSourceEvidence[0].sourceUrl, /opengameart\.org\/content\/m4a1-assault-rifle/);
  assert.equal(src.rifleSourceEvidence[0].author, 'nisu');
  const credits = readFileSync(new URL('CREDITS.txt', dir), 'utf8');
  assert.match(credits, /M4A1 Assault Rifle” by nisu/); assert.match(credits, /CC0 1\.0/);
  const { FPS_MODEL_ASSETS } = await import('../src/fps/model-data.js');
  const a = FPS_MODEL_ASSETS.find((x) => x.id === 'm4a1'); assert.ok(a); assert.equal(a.bytes, bytes.length); assert.equal(a.license, 'CC0-1.0');
  // 旧射击模式（src/fps/viewmodel.js）只加载它自己那三件
  assert.match(readFileSync(new URL('../src/fps/viewmodel.js', import.meta.url), 'utf8'), /FPS_MODEL_ASSETS\.filter\(\(a\) => \['rifle', 'pistolHands', 'pistol'\]\.includes\(a\.id\)\)/);
  // 「项目介绍」里写了出处
  const { ABOUT_COPY } = await import('../src/jimao/cover.js');
  assert.ok(ABOUT_COPY.some((s) => /nisu/.test(s) && /CC0/.test(s)));
});
