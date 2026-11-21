// 丧尸围城的停电场景：手电的亮度曲线、光罩（聚光芯 + 泛光）、近处收光、画之前压暗 / 画完还原、供电开关对灯具材质的作用。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLACKOUT, torchAt, createBlackout, beamAt, beamCookie, torchGain, nearOf } from '../src/jimao/blackout.js';

// 材质库建贴图要画布：给一个什么都不画的替身
const paint = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };

function world() {
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x8899aa, 900, 3000); scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera();
  const hooks = [], mats = { night: 0, power: 1, calls: [], setNight(t) { this.night = t; this.calls.push([+t.toFixed(3), this.power]); for (const h of hooks) h(t); } };
  const env = { night: 0, target: 0, hemi: { intensity: 0.62 }, sun: { intensity: 2.1 }, renderer: { toneMappingExposure: 0.92 }, mats,
    setNight(on) { this.target = on ? 1 : 0; }, step() { this.night = this.target; this.hemi.intensity = 0.62 - 0.5 * this.night; this.sun.intensity = 2.1 - 1.92 * this.night; scene.environmentIntensity = 0.45 - 0.37 * this.night; } };
  const app = { env, ctx: { mats }, state: { night: false }, setNight(on) { this.state.night = on; env.setNight(on); } };
  return { scene, camera, env, mats, app, hooks };
}

test('手电：近处不过曝、二三十米外还有亮度、到照程尽头平滑归零', () => {
  const T = BLACKOUT.torch;
  assert.ok(torchAt(2) < 4 && torchAt(2) > 2, `2 米 ${torchAt(2).toFixed(2)}`);
  assert.ok(torchAt(10) > 0.5 && torchAt(25) > 0.2, `10 米 ${torchAt(10).toFixed(2)}、25 米 ${torchAt(25).toFixed(2)}`);
  for (let d = 1; d < T.distance; d += 3) assert.ok(torchAt(d) >= torchAt(d + 3), `${d} 米往外越来越暗`);
  assert.equal(torchAt(T.distance), 0); assert.equal(torchAt(0), 0);
});

test('停电：开了以后天黑、灯具断电、室内只留应急亮度；画之前把补光和雾压下去、画完原样还原；关掉回到白天', () => {
  const { scene, camera, env, mats, app } = world();
  const b = createBlackout({ app, scene, camera, viewLayer: 5, rng: () => 0.5 });
  assert.equal(b.begin(), null, '没开时不动任何东西'); assert.equal(b.light.intensity, 0);
  b.enabled = true; assert.equal(app.state.night, true, '入夜');
  env.step(); for (let i = 0; i < 90; i++) b.update(1 / 30);
  assert.equal(b.level, 1); assert.equal(mats.power, BLACKOUT.power, '灯具断电');
  assert.ok(Math.abs(mats.night - BLACKOUT.glow) < 0.01, `室内自发光只留 ${mats.night}`);
  assert.ok(Math.abs(b.light.intensity - BLACKOUT.torch.power) < 1e-6 && b.light.visible, '手电亮了');
  assert.equal(b.light.layers.test(new THREE.Layers()), true); { const l = new THREE.Layers(); l.set(5); assert.equal(b.light.layers.test(l), false, '手电不照枪那一层'); }
  assert.equal(b.light.parent, camera, '手电跟着镜头');
  // 画之前 / 画完
  const before = [env.hemi.intensity, env.sun.intensity, scene.environmentIntensity, env.renderer.toneMappingExposure, scene.fog.near, scene.fog.far, scene.fog.color.getHex()];
  const undo = b.begin();
  assert.ok(scene.fog.far <= BLACKOUT.fog.far + 1e-6 && scene.fog.near <= BLACKOUT.fog.near + 1e-6, '雾拉近');
  assert.ok(env.sun.intensity < before[1] && scene.environmentIntensity <= before[2]);
  assert.equal(scene.fog.color.getHex(), BLACKOUT.fog.color);
  undo();
  assert.deepEqual([env.hemi.intensity, env.sun.intensity, scene.environmentIntensity, env.renderer.toneMappingExposure, scene.fog.near, scene.fog.far, scene.fog.color.getHex()], before, '画完原样还原');
  // 坐上直升机：雾退远
  b.open = 1; for (let i = 0; i < 120; i++) b.update(1 / 30);
  const u2 = b.begin(); assert.ok(scene.fog.far > 600, `从天上看得远：${scene.fog.far.toFixed(0)} 米`); u2();
  // 关掉
  b.enabled = false; assert.equal(app.state.night, false); env.step();
  for (let i = 0; i < 90; i++) b.update(1 / 30);
  assert.equal(b.level, 0); assert.equal(mats.power, 1); assert.equal(mats.night, 0); assert.equal(b.begin(), null); assert.equal(b.light.visible, false);
  b.dispose(); assert.equal(b.light.parent, null);
});

test('供电：灯具、招牌、LED 屏在断电时都暗下去，恢复供电回到原样；昼夜照常起作用', async () => {
  const { MaterialLib } = await import('../src/render/materials.js');
  const mats = new MaterialLib({});
  const sign = mats.sign(new THREE.Texture()), screen = mats.screen(new THREE.Texture());
  mats.setNight(1);
  const on = { glow: mats.base.glow.color.r, soft: mats.base.glowSoft.color.r, sign: sign.emissiveIntensity, screen: screen.color.r };
  assert.equal(mats.power, 1);
  mats.setPower(0);
  assert.ok(mats.base.glow.color.r < on.glow * 0.1, `灯具 ${mats.base.glow.color.r.toFixed(2)}`); assert.ok(mats.base.glowSoft.color.r < on.soft * 0.3);
  assert.ok(sign.emissiveIntensity < on.sign * 0.15, '招牌灭了'); assert.ok(screen.color.r < on.screen * 0.05, 'LED 屏灭了');
  mats.setNight(0.2); assert.ok(mats.base.glow.color.r < 0.2, '断电时昼夜变化也不会把灯点亮');
  mats.setPower(1); mats.setNight(1);
  assert.deepEqual({ glow: mats.base.glow.color.r, soft: mats.base.glowSoft.color.r, sign: sign.emissiveIntensity, screen: screen.color.r }, on, '恢复供电回到原样');
  mats.setPower(7); assert.equal(mats.power, 1); mats.setPower(-1); assert.equal(mats.power, 0);
});

test('光罩：正中最亮、芯外是一圈暗得多的泛光、到光锥外沿收到 0；泛光略偏暖，芯是中性白', () => {
  const P = BLACKOUT.torch.beam, at = (r) => beamAt(r)[0];
  assert.ok(at(0) > 0.97, `正中 ${at(0)}`);
  const spill = at(0.55); assert.ok(spill > P.spill * 0.6 && spill < P.spill * 1.5, `泛光 ${spill.toFixed(3)}`);
  assert.ok(at(P.core * 0.5) > 0.6, '芯里面还很亮');
  assert.ok(at(0.97) < 0.03 && at(1) === 0 && at(1.2) === 0, '外沿收到 0');
  for (let r = 0.65; r < 0.98; r += 0.05) assert.ok(at(r) >= at(r + 0.05) - 1e-6, `${r.toFixed(2)} 往外越来越暗`);
  const [r0, , b0] = beamAt(0), [r1, , b1] = beamAt(0.7); assert.ok(Math.abs(r0 - b0) < 0.02, '芯是中性白'); assert.ok(b1 < r1, '泛光偏暖');
  const c = beamCookie(32); assert.equal(c.size, 32); assert.equal(c.data.length, 32 * 32 * 4);
  const px = (x, y) => c.data[(y * 32 + x) * 4];
  assert.ok(px(16, 16) > 240 && px(0, 0) === 0 && px(31, 16) < 10, '中间亮、角上黑');
});

test('近处收光：越近收得越多（但墙上照度仍随距离单调）、ref 米以外不收；几条射线取最亮的那块', () => {
  const A = BLACKOUT.torch.adapt;
  assert.equal(torchGain(A.ref), 1); assert.equal(torchGain(30), 1); assert.equal(torchGain(0.05), A.min); assert.equal(torchGain(NaN), A.min);
  assert.ok(torchGain(1) < 0.35 && torchGain(2.5) > torchGain(1), `1 米 ${torchGain(1).toFixed(2)}`);
  // 墙上的照度 ∝ 光强 ÷ 距离：近了还是更亮一点（不然像手电自己没电了），但比不收的时候暗得多
  const lit = (d) => torchGain(d) / d;
  assert.ok(lit(0.8) > lit(2) && lit(2) > lit(4), '照度仍随距离单调');
  assert.ok(lit(0.8) / lit(A.ref) < 2.5, `0.8 米处只比 ${A.ref} 米处亮 ${(lit(0.8) / lit(A.ref)).toFixed(1)} 倍（不收是 ${(A.ref / 0.8).toFixed(1)} 倍）`);
  assert.equal(nearOf([10, 10, 10], [1, 0.6, 0.6], 58), 10);
  assert.ok(Math.abs(nearOf([10, 1, 10], [1, 0.5, 0.5], 58) - 2) < 1e-9, '侧边一条打到 1 米的墙，按权重折成 2 米');
  assert.equal(nearOf([null, 0, -1], [1, 1, 1], 58), 58, '都没打到');
});

test('手电：探到墙就收光（变暗快、变亮慢），挪开回到原来的亮度；光罩挂在灯上，dispose 一起释放', () => {
  const { scene, camera, env, app } = world();
  let wall = 0.8; const probe = (o, d, max) => (wall < max ? wall : null);
  const b = createBlackout({ app, scene, camera, rng: () => 0.5, probe });
  assert.ok(b.light.map?.isDataTexture, '光罩'); assert.equal(b.light.castShadow, false, '不投影');
  b.enabled = true; env.step();
  for (let i = 0; i < 60; i++) b.update(1 / 30);
  assert.ok(Math.abs(b.near - 0.8) < 1e-6, `探到 ${b.near}`);
  assert.ok(Math.abs(b.gain - torchGain(0.8)) < 0.02, `收到 ${b.gain.toFixed(2)}`);
  assert.ok(b.light.intensity < BLACKOUT.torch.power * 0.4, `光强 ${b.light.intensity.toFixed(2)}`);
  wall = 40; for (let i = 0; i < 4; i++) b.update(1 / 30);
  assert.ok(b.gain < 0.8, '移开以后慢慢放亮，不是一下子'); for (let i = 0; i < 90; i++) b.update(1 / 30);
  assert.ok(Math.abs(b.light.intensity - BLACKOUT.torch.power) < 0.05, `远处照人还是原来的亮度：${b.light.intensity.toFixed(2)}`);
  wall = 0.6; for (let i = 0; i < 9; i++) b.update(1 / 30); assert.ok(b.gain < 0.45, `挡到墙上很快收：0.3 秒后 ${b.gain.toFixed(2)}`);
  // 探测出错不影响手电
  const bad = createBlackout({ app, scene, camera: new THREE.PerspectiveCamera(), probe: () => { throw new Error('x'); } }); bad.enabled = true; for (let i = 0; i < 30; i++) bad.update(1 / 30); assert.ok(bad.gain > 0.99);
  const map = b.light.map; let gone = false; map.addEventListener('dispose', () => { gone = true; });
  b.dispose(); assert.ok(gone, '光罩释放了'); bad.dispose();
});

test('光罩贴着墙也有效：灯的投影相机近平面只有几厘米（默认 0.5 米以内光罩失效，近墙一片均匀死白）', () => {
  const { scene, camera, app } = world();
  const b = createBlackout({ app, scene, camera, probe: () => null });
  assert.ok(b.light.shadow.camera.near <= 0.05, `近平面 ${b.light.shadow.camera.near}`);
  b.light.shadow.updateMatrices(b.light);
  // 灯前 0.3 米的一个点：投到光罩坐标里要落在 0–1 之内（z 也是），着色器才会去采光罩
  camera.updateMatrixWorld(true); b.light.updateMatrixWorld(true); b.light.target.updateMatrixWorld(true);
  const w = new THREE.Vector4(0, 0, -0.3, 1).applyMatrix4(b.light.matrixWorld);
  const c = w.clone().applyMatrix4(b.light.shadow.matrix); const z = c.z / c.w;
  assert.ok(z > 0 && z < 1, `0.3 米处的深度 ${z.toFixed(3)}`);
  b.dispose();
});

test('猛一转身：不等下一次定时探测，马上重探（脸贴着墙不会先白一下）', () => {
  const { scene, camera, env, app } = world();
  let n = 0, wall = 40; const probe = (o, d, max) => { n++; return wall < max ? wall : null; };
  const b = createBlackout({ app, scene, camera, rng: () => 0.5, probe });
  b.enabled = true; env.step(); for (let i = 0; i < 40; i++) b.update(1 / 30);
  const before = n; b.update(1 / 120); assert.equal(n, before, '镜头没动、没到时间：不探');
  wall = 0.4; camera.rotation.y += Math.PI; camera.updateMatrixWorld(true);
  b.update(1 / 120); assert.ok(n > before, '转身以后同一帧就探'); assert.ok(Math.abs(b.near - 0.4) < 1e-6);
  for (let i = 0; i < 3; i++) b.update(1 / 30); // 0.1 秒
  assert.ok(b.gain < torchGain(0.4) + 0.3, `0.1 秒后已经收到 ${b.gain.toFixed(2)}`);
  assert.ok(torchGain(0.4) / 0.4 < 1.6 * torchGain(BLACKOUT.torch.adapt.ref) / BLACKOUT.torch.adapt.ref, '0.4 米的墙不比 5 米的墙亮多少');
  b.dispose();
});

test('内存档：省内存档不挂光罩（光锥边缘改软），其余档 128²；换了档下一次打开手电时按新档重做', async () => {
  const { MEMORY_PROFILES, configureMemory, MEM } = await import('../src/render/device.js');
  const { beamSize } = await import('../src/jimao/blackout.js');
  const T = BLACKOUT.torch;
  assert.equal(beamSize(T, MEMORY_PROFILES.compact), 0);
  for (const k of ['standard', 'rich', 'full']) assert.equal(beamSize(T, MEMORY_PROFILES[k]), T.beam.size, k);
  const keep = MEM.name;
  try {
    configureMemory('low', { mobile: true, lost: 0 });
    const dev = await import('../src/render/device.js'); assert.equal(dev.MEM.name, 'compact');
    const { scene, camera, env, app } = world();
    const b = createBlackout({ app, scene, camera, probe: () => null });
    assert.equal(b.light.map, null, '省内存档没有光罩'); assert.equal(b.light.penumbra, T.plain.penumbra); assert.equal(b.light.angle, T.plain.angle);
    configureMemory('ultra', { mobile: false, lost: 0 });
    b.enabled = true; env.step(); b.update(1 / 30);
    assert.ok(b.light.map?.isDataTexture, '换到高档：打开时挂上光罩'); assert.equal(b.light.penumbra, T.penumbra);
    b.dispose();
  } finally { configureMemory(keep === 'full' ? 'ultra' : keep === 'compact' ? 'low' : 'balanced', { mobile: keep !== 'full', lost: 0 }); }
});
