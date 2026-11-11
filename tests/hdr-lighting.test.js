// 「HDR 光影」、细分的画质设置、室内灯光，以及住宅里的吊顶、吸顶灯和亮面做法。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { QUALITY_PRESETS, QUALITY_SWITCHES, QUALITY_CHOICES, normalizeQuality, resolveQuality, createQualityManager } from '../src/render/quality.js';
import { Environment, HDR_GRADE } from '../src/render/env.js';
import { HdrPipeline, AO_SAMPLES } from '../src/render/post.js';
import { decodeRadiance } from '../src/render/sky.js';
import { pickLamps, createIndoorLighting, INDOOR_LIGHT } from '../src/render/indoor-lighting.js';
import { MaterialLib, HDR_FINISH } from '../src/render/materials.js';
import { BatchSet } from '../src/render/batch.js';
import { buildLayout } from '../src/layout/layout.js';
import { buildResidenceFloor } from '../src/render/build/residence-interiors.js';
import { pointInPoly } from '../src/layout/geom.js';

const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };

// ---------- 画质设置 ----------

test('四个档位：流畅和均衡不开 HDR；精细开 HDR 但不开吃显卡的项；极致全开', () => {
  const [low, balanced, high, ultra] = ['low', 'balanced', 'high', 'ultra'].map((preset) => resolveQuality({ preset }, { pixelRatio: 3 }));
  for (const q of [low, balanced]) assert.deepEqual([q.hdr, q.ao, q.dayBloom, q.indoorLights], [false, false, false, 0], q.label);
  assert.deepEqual([high.hdr, high.ao, high.dayBloom, high.indoorLights, high.textures], [true, false, false, 0, 'high']);
  assert.deepEqual([ultra.hdr, ultra.ao, ultra.dayBloom, ultra.indoorLights, ultra.label], [true, true, true, 8, '极致']);
  // 贴地阴影和光斑不花性能，所有档位都开
  for (const q of [low, balanced, high, ultra]) assert.equal(q.decals, true);
  // 手机默认还是「流畅」：新加的效果一个都不开
  const phone = createQualityManager({ mobile: true, pixelRatio: 3 }).current;
  assert.deepEqual([phone.tier, phone.hdr, phone.ao, phone.dayBloom, phone.indoorLights, phone.shadows], ['low', false, false, false, 0, false]);
  // 手机上手动选「极致」：室内灯光最多 4 盏，阴影贴图最多 2048
  const phoneUltra = resolveQuality({ preset: 'ultra' }, { mobile: true });
  assert.deepEqual([phoneUltra.indoorLights, phoneUltra.shadowSize], [4, 2048]);
});

test('细项可以单独调并保存；不认识的值丢掉；遮蔽和高光柔光离不开 HDR 光影', () => {
  const values = new Map(), storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  const q = createQualityManager({ storage });
  q.select('balanced');
  q.customize({ hdr: true, ao: true, shadowSize: 4096, maxFps: 60, textures: 'high', detail: 'low', indoorLights: 4, decals: false });
  const again = createQualityManager({ storage }).current;
  assert.deepEqual([again.preset, again.hdr, again.ao, again.shadowSize, again.maxFps, again.textures, again.detail, again.indoorLights, again.decals, again.custom],
    ['balanced', true, true, 4096, 60, 'high', 'low', 4, false, true]);
  assert.deepEqual(normalizeQuality({ preset: 'ultra', overrides: { shadowSize: 3000, maxFps: 120, textures: 'ultra', detail: 3, indoorLights: 6, hdr: 'yes', ao: false } }),
    { preset: 'ultra', overrides: { ao: false } });
  // HDR 光影关着：遮蔽和高光柔光即使开着也不生效（面板里这两项会置灰）
  const off = resolveQuality({ preset: 'ultra', overrides: { hdr: false } });
  assert.deepEqual([off.hdr, off.ao, off.dayBloom], [false, false, false]);
  // 换档位会把微调清掉
  q.select('high');
  assert.deepEqual([q.current.custom, q.current.ao, q.current.decals], [false, false, true]);
});

test('面板里的开关、多选一和档位按钮，和设置模型一一对应', () => {
  const html = readFileSync('src/shell.html', 'utf8'), panel = html.slice(html.indexOf('id="qualityPanel"'), html.indexOf('</section>', html.indexOf('id="qualityPanel"')));
  const all = (re) => [...panel.matchAll(re)].map((m) => m[1]);
  assert.deepEqual(all(/data-quality-switch="(\w+)"/g).sort(), [...QUALITY_SWITCHES].sort());
  assert.deepEqual(all(/data-quality-choice="(\w+)"/g).sort(), Object.keys(QUALITY_CHOICES).sort());
  for (const [key, allowed] of Object.entries(QUALITY_CHOICES)) {
    const group = panel.slice(panel.indexOf(`data-quality-choice="${key}"`)), values = [...group.slice(0, group.indexOf('</div>')).matchAll(/data-value="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(values, allowed.map(String), key);
  }
  assert.deepEqual(all(/data-quality-preset="(\w+)"/g), ['auto', ...Object.keys(QUALITY_PRESETS)]);
  // 依赖 HDR 光影的两项标了 data-quality-needs，关着时置灰
  for (const key of ['ao', 'dayBloom']) assert.match(panel, new RegExp(`data-quality-switch="${key}" data-quality-needs="hdr"`));
});

// ---------- 天空素材 ----------

test('天空素材：文件和清单里的校验值一致；环境图解得出来，天顶偏蓝、地平线以下是地面，太阳的亮度封了顶', () => {
  const manifest = JSON.parse(readFileSync('assets/sky/manifest.json', 'utf8'));
  for (const part of [manifest.radiance, manifest.sky]) {
    const bytes = readFileSync(`assets/sky/${part.file}`);
    assert.equal(bytes.length, part.bytes, part.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), part.sha256, part.file);
  }
  assert.equal(manifest.license, 'CC0-1.0');
  assert.ok(manifest.source.url.startsWith('https://polyhaven.com/a/'));
  const { width, height, data } = decodeRadiance(readFileSync('assets/sky/day-radiance.hdr'));
  assert.deepEqual([width, height, data.length], [256, 128, 256 * 128 * 4]);
  const px = (x, y) => [0, 1, 2].map((c) => THREE.DataUtils.fromHalfFloat(data[(y * width + x) * 4 + c]));
  // 贴图坐标：最后一行是天顶，第 0 行在地平线以下
  const zenith = px(10, height - 1), ground = px(10, 0);
  assert.ok(zenith[2] > zenith[0] * 1.3, `天顶 ${zenith.map((v) => v.toFixed(2))}`);
  assert.ok(Math.abs(ground[0] - ground[2]) < 0.06 && ground[0] > 0.1, `地面 ${ground.map((v) => v.toFixed(2))}`);
  let peak = 0;
  for (let i = 0; i < width * height; i++) peak = Math.max(peak, THREE.DataUtils.fromHalfFloat(data[i * 4 + 1]));
  assert.ok(peak > 4 && peak <= manifest.processing.sunClamp * 1.05, `最亮 ${peak.toFixed(1)}`);
  assert.throws(() => decodeRadiance(new Uint8Array([1, 2, 3])), /RGBE/);
  // 两个构建脚本都把素材换成内嵌或带校验名的文件，不会留下只有开发时才取得到的相对地址
  for (const file of ['build.mjs', 'scripts/build-netlify.mjs']) assert.match(readFileSync(file, 'utf8'), /sky-data/, file);
});

test('单文件版里天空素材是内嵌的', { skip: !existsSync('dist/mall.html') }, () => {
  const page = readFileSync('dist/mall.html', 'utf8');
  if (!page.includes('SKY_ASSETS') && !page.includes('day-radiance')) assert.ok(page.includes('data:application/octet-stream;base64,Iz9SQURJQU5DRQ'), '没有找到内嵌的 RGBE 文件头');
  assert.ok(!page.includes('./assets/sky/day-radiance.hdr'), '单文件版还在引用仓库里的相对地址');
});

// ---------- 环境渲染 ----------

function fakeRenderer(probe = () => ({})) {
  const calls = [];
  let target = null;
  const renderer = {
    calls, shadowMap: { enabled: true, needsUpdate: false }, autoClear: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.92,
    outputColorSpace: THREE.SRGBColorSpace, state: { buffers: { stencil: { setTest() {} } } },
    getSize: (v) => v.set(1280, 800), getPixelRatio: () => 1, getClearColor: (c) => c.set(0), getClearAlpha: () => 1,
    setClearColor() {}, setClearAlpha() {}, clear() {}, setRenderTarget(t) { target = t; },
    render(what) { calls.push({ to: target ? target.texture.name || 'buffer' : 'screen', scene: !!what.isScene, exposure: renderer.toneMappingExposure, ...probe() }); },
  };
  return renderer;
}
function fakeEnvironment() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), sun = new THREE.DirectionalLight(), hemi = new THREE.HemisphereLight();
  scene.fog = new THREE.Fog(0xffffff, 900, 3000);
  const seen = { hdr: null, sky: [] };
  const renderer = fakeRenderer(() => ({ hemi: hemi.intensity, room: scene.environmentIntensity }));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.ShaderMaterial({ defines: {} }));
  const env = Object.assign(Object.create(Environment.prototype), { scene, camera, renderer, sun, hemi, sky,
    night: 0, target: 0, bloom: null, composer: null, bloomEnabled: false, bloomProfile: { strength: 0, threshold: .8 },
    hdr: false, aoEnabled: false, dayBloom: false, skyReady: false, skyEnv: null, skyRequest: Promise.resolve(), viewDistance: 0, indoor: 0, indoorTarget: 0, lamp: 0, lampTarget: 0,
    mats: { setNight() {}, setHdr(on) { seen.hdr = on; }, setSkyIntensity(v) { seen.sky.push(v); } },
    stars: { position: new THREE.Vector3(), material: {} },
    skyUniforms: Object.fromEntries(['topColor', 'horizonColor', 'bottomColor', 'hazeColor'].map((k) => [k, { value: new THREE.Color() }])
      .concat([['photoMix', { value: 0 }], ['sunGlow', { value: 0 }], ['skyMap', { value: null }]])),
  });
  return { env, renderer, scene, hemi, sky, seen };
}

test('HDR 光影：换成保色的色调映射；白天没开遮蔽和高光柔光时直接画到屏幕；调校只在画的那一刻生效', () => {
  const { env, renderer, scene, hemi, seen } = fakeEnvironment();
  env.setQuality(resolveQuality({ preset: 'high' }));
  assert.equal(env.hdr, true);
  assert.equal(renderer.toneMapping, THREE.NeutralToneMapping);
  assert.equal(seen.hdr, true);
  env.update(.1); env.render();
  assert.equal(env.composer, null, '白天、只开 HDR：不建后处理缓冲');
  const base = { exposure: renderer.toneMappingExposure, hemi: hemi.intensity, room: scene.environmentIntensity };
  const out = renderer.calls[0];
  assert.deepEqual([out.to, out.scene], ['screen', true]);
  assert.ok(Math.abs(out.exposure - base.exposure * HDR_GRADE.exposureOut) < 1e-9 && Math.abs(out.hemi - base.hemi * HDR_GRADE.hemiOut) < 1e-9 && Math.abs(out.room - base.room * HDR_GRADE.room) < 1e-9);
  // 走进室内：曝光和补光换成室内的倍数
  env.indoorTarget = 1; for (let i = 0; i < 40; i++) env.update(.1);
  assert.equal(env.indoor, 1);
  renderer.calls.length = 0; env.render();
  assert.ok(Math.abs(renderer.calls[0].exposure - base.exposure * HDR_GRADE.exposureIn) < 1e-9 && Math.abs(renderer.calls[0].hemi - base.hemi * HDR_GRADE.hemiIn) < 1e-9);
  // 画完还原：住宅、套房的灯光模块每帧设的数值不会被越乘越小
  assert.deepEqual([renderer.toneMappingExposure, hemi.intensity, scene.environmentIntensity], [base.exposure, base.hemi, base.room]);
  // 室外材质反射天空的强度跟着昼夜走
  assert.equal(seen.sky.at(-1), HDR_GRADE.sky);
  env.night = 1; env.apply();
  assert.ok(Math.abs(seen.sky.at(-1) - HDR_GRADE.skyNight) < 1e-9);
  assert.equal(env.skyUniforms.photoMix.value, 0);
  // 关掉：回到原来的 ACES，画的时候什么也不乘
  env.night = 0; env.apply();
  env.setQuality(resolveQuality({ preset: 'balanced' }));
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  renderer.calls.length = 0; env.render();
  assert.deepEqual([renderer.calls[0].exposure, renderer.calls[0].hemi, renderer.calls[0].room], [renderer.toneMappingExposure, hemi.intensity, scene.environmentIntensity]);
});

test('极致档：场景先画进 HDR 缓冲，再算遮蔽、合成、输出到屏幕；换档位时把缓冲放掉', () => {
  const { env, renderer } = fakeEnvironment();
  env.setQuality(resolveQuality({ preset: 'ultra' }));
  env.update(.1); env.render();
  assert.ok(env.composer instanceof HdrPipeline);
  const post = env.composer, order = renderer.calls.map((c) => `${c.scene ? 'scene' : 'quad'}>${c.to}`);
  assert.equal(order[0], 'scene>hdr-scene');
  assert.equal(order.at(-2), 'quad>screen', '最后一遍后处理输出到屏幕');
  assert.equal(order.at(-1), 'scene>screen', '文字标注单独画在最上面');
  assert.ok(order.indexOf('quad>hdr-color') > 0, '遮蔽乘进颜色后拷到 HDR 缓冲');
  // 场景只画了一遍（遮蔽用的是这一遍的深度图，不重画场景）
  assert.equal(renderer.calls.filter((c) => c.scene && c.to !== 'screen').length, 1);
  assert.ok(post.scene_.depthTexture && post.scene_.samples >= 2 && post.scene_.texture.type === THREE.HalfFloatType);
  assert.equal(post.aoParts.gtao.defines.SAMPLES, AO_SAMPLES);
  assert.equal(post.aoParts.gtao.defines.NORMAL_VECTOR_TYPE, 0, '法线从深度推出来');
  assert.deepEqual([post.ao.enabled, post.ao.radius, post.bloomOn], [true, 0.6, true]);
  // 俯瞰时取样半径跟着相机拉远，封顶 5 米
  env.viewDistance = 200; env.render(); assert.ok(Math.abs(post.ao.radius - 2.4) < 1e-9);
  env.viewDistance = 900; env.render(); assert.equal(post.ao.radius, 5);
  // 白天的高光柔光：阈值比夜里高，白墙不发雾；画完把泛光参数还给灯光模块
  assert.deepEqual([env.bloom.strength, env.bloom.threshold], [0, .8]);
  // 只关遮蔽：深度图和遮蔽的缓冲放掉，管线还在（高光柔光要用）
  env.setQuality(resolveQuality({ preset: 'ultra', overrides: { ao: false } }));
  assert.ok(env.composer instanceof HdrPipeline);
  env.render();
  assert.deepEqual([env.composer.aoParts, env.composer.scene_.depthTexture], [null, null]);
  // 换到不用 HDR 的档位：整条管线放掉
  let disposed = 0; env.composer.scene_.addEventListener('dispose', () => { disposed++; });
  env.setQuality(resolveQuality({ preset: 'balanced' }));
  assert.deepEqual([env.composer, env.bloom, disposed], [null, null, 1]);
  // 精细档的夜景也走 HDR 管线（阈值抬高，只有灯具和招牌发光）
  env.setQuality(resolveQuality({ preset: 'high' }));
  env.night = 1; env.apply(); env.render();
  assert.ok(env.composer instanceof HdrPipeline);
  assert.deepEqual([env.composer.ao.enabled, env.composer.bloomOn], [false, true]);
});

test('HDR 管线的遮蔽缓冲按像素比缩小；高分屏多重采样减半', () => {
  const renderer = fakeRenderer();
  renderer.getPixelRatio = () => 2;
  const { UnrealBloomPass } = { UnrealBloomPass: class { constructor() { this.strength = 0; } setSize() {} dispose() {} render() {} } };
  const post = new HdrPipeline(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), new UnrealBloomPass(), { samples: 2 });
  post.ao.enabled = true; post.ao.scale = 0.5;
  post.render();
  assert.deepEqual([post.scene_.width, post.scene_.height, post.scene_.samples], [2560, 1600, 2]);
  assert.deepEqual([post.aoTargets.raw.width, post.aoTargets.raw.height], [1280, 800]);
  post.setSize(640, 400);
  assert.deepEqual([post.color.width, post.aoTargets.clean.width], [1280, 640]);
  post.dispose();
  assert.deepEqual([post.scene_, post.color, post.aoParts], [null, null, null]);
});

// ---------- 室内灯光 ----------

test('挑灯：离人最近的几盏；马上要被换下去的那盏权重趋近 0，换灯不跳', () => {
  const lamps = Array.from({ length: 12 }, (_, i) => [i * 4, 4.5, 0]);
  const at = (x) => pickLamps(lamps, { x, y: 1.6, z: 0 }, 4);
  const a = at(10);
  assert.deepEqual(a.map((c) => c.index).sort((p, q) => p - q), [1, 2, 3, 4]);
  for (const c of a) assert.ok(c.weight >= 0 && c.weight <= 1);
  assert.ok(Math.max(...a.map((c) => c.weight)) === 1);
  // 站在一盏灯正下方：两边对称，排第四的那盏和排第五的一样远，权重是 0
  const b = pickLamps(lamps, { x: 8, y: 4.5, z: 0 }, 4).sort((p, q) => p.weight - q.weight);
  assert.ok(b[0].weight < 0.02, `最远一盏的权重 ${b[0].weight}`);
  // 够不着的灯不参与；灯少于盏数时全用上
  assert.deepEqual(pickLamps(lamps, { x: 200, y: 1.6, z: 0 }, 4), []);
  assert.equal(pickLamps(lamps.slice(0, 2), { x: 2, y: 1.6, z: 0 }, 4).length, 2);
});

test('室内灯光：走到有灯位的楼层才亮，盏数跟着设置走，关掉后不占灯位', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const ctx = { scene, camera, dynamic: [], quality: { indoorLights: 4 },
    levels: { mall: { lamps: Array.from({ length: 9 }, (_, i) => [i * 5, 4.4, 0]), offset: 0 }, home: { lamps: [[100, 2.5, 0, 8]], offset: 0 }, bare: {} } };
  const lights = createIndoorLighting(ctx), env = {}, app = { state: { explore: { level: 'mall' } }, env };
  assert.equal(ctx.dynamic.includes(lights), true);
  camera.position.set(0, 1.6, 0);
  for (let i = 0; i < 60; i++) lights.update(.05, 0, app);
  const pool = scene.getObjectByName('indoor-light-pool'), spots = pool.children.filter((o) => o.isSpotLight);
  assert.deepEqual([pool.visible, lights.lightCount, spots.length, env.lampTarget], [true, 4, 4, 1]);
  const lit = spots.filter((s) => s.intensity > 1);
  assert.ok(lit.length >= 3 && Math.max(...spots.map((s) => s.intensity)) === INDOOR_LIGHT.power, `亮着 ${lit.length} 盏`);
  assert.ok(spots.every((s) => !s.castShadow), '这些灯不投影');
  // 灯头都在灯位上，照向正下方
  for (const s of lit) { assert.equal(s.position.y, 4.4); assert.ok(ctx.levels.mall.lamps.some((l) => l[0] === s.position.x)); assert.equal(s.target.position.x, s.position.x); }
  // 走到走道另一头：灯跟过去
  camera.position.set(40, 1.6, 0);
  for (let i = 0; i < 80; i++) lights.update(.05, 0, app);
  assert.ok(spots.filter((s) => s.intensity > 1).every((s) => s.position.x >= 25));
  // 住宅的灯位带着自己的光强
  app.state.explore = { level: 'home' }; camera.position.set(100, 1.6, 0);
  for (let i = 0; i < 40; i++) lights.update(.05, 0, app);
  assert.equal(Math.max(...spots.map((s) => s.intensity)), 8);
  // 没有灯位的楼层、退出漫游、把盏数调成 0：整池隐藏（隐藏的灯不占着色器里的灯位）
  for (const [state, quality] of [[{ explore: { level: 'bare' } }, 4], [{}, 4], [{ explore: { level: 'mall' } }, 0]]) {
    app.state = state; ctx.quality = { indoorLights: quality }; lights.update(.05, 0, app);
    assert.deepEqual([pool.visible, lights.lightCount, env.lampTarget], [false, 0, 0]);
  }
  // 盏数改成 8：灯池跟着变
  app.state = { explore: { level: 'mall' } }; ctx.quality = { indoorLights: 8 }; lights.update(.05, 0, app);
  assert.equal(pool.children.filter((o) => o.isSpotLight).length, 8);
  lights.dispose();
  assert.equal(scene.getObjectByName('indoor-light-pool'), undefined);
});

test('灯亮着时把没有方向的补光压一些；不开 HDR 也生效，灯灭了画面和原来一样', () => {
  const { env, renderer, hemi, scene } = fakeEnvironment();
  env.setQuality(resolveQuality({ preset: 'balanced' }));
  env.lampTarget = 1; for (let i = 0; i < 40; i++) env.update(.1);
  env.render();
  assert.ok(Math.abs(renderer.calls[0].hemi - hemi.intensity * HDR_GRADE.lampHemi) < 1e-9 && Math.abs(renderer.calls[0].room - scene.environmentIntensity * HDR_GRADE.lampRoom) < 1e-9);
  assert.equal(renderer.calls[0].exposure, renderer.toneMappingExposure, '不开 HDR 时曝光不动');
  env.lampTarget = 0; for (let i = 0; i < 40; i++) env.update(.1);
  renderer.calls.length = 0; env.render();
  assert.deepEqual([renderer.calls[0].hemi, renderer.calls[0].room], [hemi.intensity, scene.environmentIntensity]);
});

// ---------- 材质 ----------

test('亮面做法和天空反射：克隆出来的材质跟着切换，自己改过粗糙度的不动，室内材质不反射天空', () => {
  const mats = new MaterialLib({});
  const facade = mats.base.extSatin.clone(), again = facade.clone(), steel = mats.base.extMetal.clone();
  steel.roughness = 0.35; // 像社区电梯门那样自己定了粗糙度
  const before = { satin: mats.base.satin.roughness, stone: mats.base.stone.roughness, ext: mats.base.extSatin.roughness };
  const sky = new THREE.Texture();
  mats.setHdr(true, sky); mats.setSkyIntensity(1.5);
  assert.deepEqual([mats.base.satin.roughness, mats.base.stone.roughness, facade.roughness, again.roughness], [HDR_FINISH.base.satin, HDR_FINISH.base.stone, HDR_FINISH.base.extSatin, HDR_FINISH.base.extSatin]);
  assert.equal(steel.roughness, 0.35);
  for (const m of [mats.base.ext, mats.base.glassTint, mats.base.water, facade, again, steel]) assert.equal(m.envMap, sky, m.name);
  assert.deepEqual([facade.envMapIntensity, mats.base.water.envMapIntensity > 1.5], [1.5, true]);
  // 开着的时候才克隆出来的（走到新的一栋楼）也接得上
  const late = mats.base.glassTint.clone();
  assert.deepEqual([late.envMap, late.envMapIntensity], [sky, 1.5]);
  // 入夜：所有室外材质（包括克隆的）一起暗下来，楼不会被白天的天空照得发白
  mats.setSkyIntensity(0.1);
  for (const m of [facade, again, late, mats.base.ext]) assert.equal(m.envMapIntensity, 0.1);
  // 室内材质用的还是场景的室内环境图
  for (const key of ['matte', 'satin', 'stone', 'wood', 'glass']) assert.equal(mats.base[key].envMap, null, key);
  // 灯具：HDR 光影下白天也是亮着的（亮度超过 1）
  assert.ok(mats.base.glow.color.r > 1.4);
  mats.setHdr(false, null);
  assert.deepEqual([mats.base.satin.roughness, mats.base.stone.roughness, facade.roughness, again.roughness, steel.roughness], [before.satin, before.stone, before.ext, before.ext, 0.35]);
  assert.deepEqual([facade.envMap, late.envMap, mats.base.glow.color.r], [null, null, 0.85]);
});

test('地面的亮面做法：抛光石材和木地板登记了，地毯和室外铺装不动', () => {
  const mats = new MaterialLib({});
  const marble = mats.floor('marble-white'), wood = mats.floor('wood-warm'), carpet = mats.floor('carpet-ocean'), paving = mats.floor('paving');
  const base = [marble.roughness, wood.roughness, carpet.roughness, paving.roughness];
  mats.setHdr(true, null);
  assert.deepEqual([marble.roughness, wood.roughness], [HDR_FINISH.floor['marble-white'], HDR_FINISH.floor['wood-warm']]);
  assert.deepEqual([carpet.roughness, paving.roughness], [base[2], base[3]]);
  assert.ok(marble.roughness < base[0] && wood.roughness < base[1]);
  assert.equal(mats.outdoorMats.has(paving), true);
  assert.equal(mats.outdoorMats.has(marble), false);
});

// ---------- 住宅 ----------

const LAYOUT = buildLayout();
const base = new Proxy({}, { get: (m, k) => typeof k === 'string' ? (m[k] ||= Object.assign(new THREE.MeshBasicMaterial(), { name: k })) : undefined });

test('社区住宅：每个房间有平顶和吸顶灯，灯位记在楼层上；从上往下看时和门楣一起隐藏；预算不变', () => {
  for (const id of ['W1-12F', 'T1-10F']) {
    const lv = LAYOUT.levels.find((l) => l.id === id), record = { lv };
    const floor = buildResidenceFloor({ layout: LAYOUT, mats: { base } }, record);
    const rooms = lv.units.flatMap((u) => u.residence.rooms.filter((r) => !['stair', 'void', 'balcony'].includes(r.kind)).map((r) => ({ u, r })));
    const big = rooms.filter(({ r }) => Math.min(r.rect.x1 - r.rect.x0, r.rect.z1 - r.rect.z0) >= 1.5);
    assert.equal(floor.lamps.length, big.length, `${id} 灯位`);
    assert.equal(record.lamps, floor.lamps);
    for (const [x, y, z, power] of floor.lamps) {
      assert.ok(lv.units.some((u) => u.polys.some((p) => pointInPoly([x, z], p))), `${id} 灯在户外 ${x.toFixed(1)}, ${z.toFixed(1)}`);
      assert.ok(y > lv.elev + 2.3 && y < lv.elev + (lv.height || 3.5) - .3, `${id} 灯高 ${(y - lv.elev).toFixed(2)}`);
      assert.ok(power >= 6 && power <= 13);
    }
    // 平顶在门楣那一批里：朝下的水平面，每个房间一块
    const pos = floor.lintel.geometry.attributes.position, nor = floor.lintel.geometry.attributes.normal;
    let ceilings = 0;
    for (let i = 0; i < pos.count; i++) if (nor.getY(i) < -.99 && pos.getY(i) > lv.elev + 2.5) ceilings++;
    assert.ok(ceilings >= rooms.length * 4, `${id} 平顶顶点 ${ceilings}，房间 ${rooms.length}`);
    // 从楼上往下看：门楣这一批隐藏，不挡住户内；走进去又显示
    floor.update({ state: {}, camera: { position: { y: lv.elev + 30 } } });
    assert.equal(floor.lintel.visible, false);
    floor.update({ state: { explore: {} }, camera: { position: { y: lv.elev + 1.6 } } });
    assert.equal(floor.lintel.visible, true);
    let meshes = 0, tris = 0;
    floor.group.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : pos.count && o.geometry.attributes.position.count) / 3; } });
    assert.ok(meshes <= 8 && tris / 12 <= 1500, `${id} ${meshes} 网格 / ${(tris / 12).toFixed(0)} 盒`);
    floor.dispose();
    assert.equal(record.lamps, undefined, '楼层细节换出后灯位一起摘掉');
  }
});

test('住宅的落地阴影、墙根渐暗和窗边天光：有贴花材质时才画，各自一个网格，不改家具和墙', () => {
  const lv = LAYOUT.levels.find((l) => l.id === 'W1-12F');
  const decal = (name) => Object.assign(new THREE.MeshBasicMaterial({ transparent: true }), { name, userData: { decal: true } });
  const table = Object.create(base, Object.fromEntries(['aoBlob', 'aoEdge', 'dayPool'].map((k) => [k, { value: decal(k) }])));
  const plain = buildResidenceFloor({ layout: LAYOUT, mats: { base } }, { lv });
  const rich = buildResidenceFloor({ layout: LAYOUT, mats: { base: table } }, { lv });
  const count = (floor) => { const by = {}; floor.group.traverse((o) => { if (o.isMesh) by[o.material.name] = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return by; };
  const a = count(plain), b = count(rich);
  for (const key of ['aoBlob', 'aoEdge', 'dayPool']) { assert.equal(a[key], undefined); assert.ok(b[key] >= 10, `${key} ${b[key]} 个三角形`); }
  // 家具、墙、地面一个三角形都没变
  for (const key of Object.keys(a)) assert.equal(b[key], a[key], key);
  // 贴花都贴在楼面上（离楼面不到 8 厘米），不投影
  rich.group.traverse((o) => {
    if (!o.isMesh || !o.material.userData?.decal) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) assert.ok(Math.abs(pos.getY(i) - lv.elev) < .08, `${o.material.name} 离楼面 ${(pos.getY(i) - lv.elev).toFixed(3)}`);
    assert.equal(o.castShadow, false);
  });
  plain.dispose(); rich.dispose();
});

test('光斑贴花：没有那种材质（FPS、单元测试）时什么也不画', () => {
  const B = new BatchSet({ matte: new THREE.MeshBasicMaterial() });
  B.pool(0, 0, 0, 4); B.edge(0, 0, 4, 0, 0, 2, 1, 'dayPool', 0xffffff);
  assert.deepEqual(Object.keys(B.sets), []);
  const lit = new BatchSet({ lightPool: Object.assign(new THREE.MeshBasicMaterial(), { userData: { decal: true } }) });
  lit.pool(1, 2, 3, 4);
  const group = new THREE.Group(); lit.flush(group);
  assert.equal(group.children.length, 1);
  assert.deepEqual([group.children[0].castShadow, group.children[0].renderOrder], [false, 1]);
});
