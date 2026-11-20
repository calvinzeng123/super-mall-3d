// 丧尸围城的停电场景：手电的亮度曲线、画之前压暗 / 画完还原、供电开关对灯具材质的作用。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLACKOUT, torchAt, createBlackout } from '../src/jimao/blackout.js';

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
