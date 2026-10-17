import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualityManager, normalizeQuality, resolveQuality, QUALITY_STORAGE_KEY } from '../src/render/quality.js';
import { Environment } from '../src/render/env.js';
import * as THREE from 'three';
import { createSuiteLighting } from '../src/render/suite-lighting.js';
import { createResidentialLighting } from '../src/render/residential-lighting.js';
import { frame } from '../src/layout/geom.js';

function store(seed) {
  const values = new Map(seed ? [[QUALITY_STORAGE_KEY, seed]] : []);
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
}

test('phone automatic startup avoids desktop shadows and bloom before scene allocation', () => {
  const q = createQualityManager({ mobile: true, pixelRatio: 3 }).current;
  assert.equal(q.preset, 'auto');
  assert.equal(q.tier, 'low');
  assert.equal(q.pixelRatio, 0.85);
  assert.equal(q.shadows, false);
  assert.equal(q.bloom, false);
  assert.equal(q.maxFps, 30);
  assert.equal(q.crowdDensity, 0.22);
});

test('quality tiers change real render budgets while preserving desktop precision', () => {
  const profiles = ['low', 'balanced', 'high'].map(preset => resolveQuality({ preset }, { pixelRatio: 3 }));
  assert.deepEqual(profiles.map(q => q.pixelRatio), [0.85, 1.25, 2]);
  assert.deepEqual(profiles.map(q => q.crowdDensity), [0.22, 0.55, 1]);
  assert.deepEqual(profiles.map(q => q.maxFps), [30, 45, 60]);
  assert.equal(createQualityManager().current.tier, 'high');
  assert.equal(resolveQuality({ preset: 'high' }, { mobile: true }).shadowSize, 2048);
  assert.equal(resolveQuality({ preset: 'high' }).shadowSize, 4096);
});

test('manual choice and controls survive reload, with selecting a preset resetting overrides', () => {
  const storage = store();
  const q = createQualityManager({ storage, mobile: true, pixelRatio: 3 });
  q.select('balanced');
  q.customize({ resolution: 1.1, bloom: true, shadows: false, crowdDensity: 0 });
  const restored = createQualityManager({ storage, mobile: true, pixelRatio: 3 });
  assert.equal(restored.current.preset, 'balanced');
  assert.equal(restored.current.pixelRatio, 1.1);
  assert.equal(restored.current.bloom, true);
  assert.equal(restored.current.shadows, false);
  assert.equal(restored.current.crowdDensity, 0);
  assert.equal(restored.current.custom, true);
  restored.select('high');
  assert.equal(restored.current.custom, false);
  assert.equal(restored.current.shadows, true);
});

test('automatic reductions notify rendering subscribers and stop at low without persisting a transient measurement', () => {
  const storage = store(), q = createQualityManager({ storage });
  const applied = [];
  q.subscribe(value => applied.push(value));
  assert.equal(q.degrade(), true);
  assert.equal(q.current.tier, 'balanced');
  assert.equal(q.degrade(), true);
  assert.equal(q.current.tier, 'low');
  assert.equal(q.current.autoReduced, true);
  assert.equal(q.degrade(), false);
  assert.deepEqual(applied.map(value => value.crowdDensity), [0.55, 0.22]);
  assert.equal(createQualityManager({ storage }).current.tier, 'high');
});

test('automatic monitoring never overrides a manual quality or slider choice', () => {
  const q = createQualityManager();
  q.select('high');
  assert.equal(q.degrade(), false);
  q.select('auto');
  q.customize({ resolution: 1.2 });
  assert.equal(q.degrade(), false);
  assert.equal(q.current.pixelRatio, 1);
  assert.equal(q.current.resolution, 1.2);
});

test('corrupt, out-of-range and unavailable storage cannot prevent loading', () => {
  assert.equal(createQualityManager({ storage: store('{broken') }).current.preset, 'auto');
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(createQualityManager({ storage: blocked }).select('low').tier, 'low');
  assert.deepEqual(normalizeQuality({ preset: 'unknown', overrides: { resolution: 88, crowdDensity: -3, shadows: 'no', bloom: true, random: 'ignored' } }),
    { preset: 'auto', overrides: { bloom: true, resolution: 2, crowdDensity: 0 } });
});

test('lowering quality disposes GPU shadow and bloom buffers instead of merely hiding effects', () => {
  const disposed = [];
  const env = Object.assign(Object.create(Environment.prototype), {
    renderer: { shadowMap: { enabled: true, needsUpdate: false } },
    sun: { castShadow: true, shadow: {
      map: { dispose() { disposed.push('shadow'); } }, mapPass: { dispose() { disposed.push('shadowPass'); } },
      mapSize: { x: 4096, set(x, y) { this.x = x; this.y = y; } },
    } },
    composer: { passes: [{ dispose() { disposed.push('bloom'); } }], dispose() { disposed.push('composer'); } },
    bloom: {},
  });
  env.setQuality(resolveQuality({ preset: 'low' }));
  assert.deepEqual(disposed, ['shadow', 'shadowPass', 'bloom', 'composer']);
  assert.equal(env.renderer.shadowMap.enabled, false);
  assert.equal(env.sun.castShadow, false);
  assert.equal(env.sun.shadow.map, null);
  assert.equal(env.composer, null);
  assert.equal(env.bloomEnabled, false);
  env.setQuality(resolveQuality({ preset: 'high' }));
  assert.equal(env.renderer.shadowMap.enabled, true);
  assert.equal(env.sun.castShadow, true);
  assert.equal(env.bloomEnabled, true);
  assert.equal(env.composer, null, 'night rendering allocates postprocessing lazily');
});

test('daytime lighting and quality switches tolerate absent bloom, and lazy creation retains room parameters', () => {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),sun=new THREE.DirectionalLight(),hemi=new THREE.HemisphereLight();
  scene.fog=new THREE.Fog(0xffffff,900,3000);
  const renderer={shadowMap:{},autoClear:true,getSize:v=>v.set(390,844),getPixelRatio:()=>1,render(){}};
  const env=Object.assign(Object.create(Environment.prototype),{scene,camera,renderer,sun,hemi,
    night:0,target:0,bloom:null,composer:null,bloomEnabled:true,
    mats:{setNight(){}},sky:new THREE.Group(),stars:{position:new THREE.Vector3(),material:{}},
    skyUniforms:Object.fromEntries(['topColor','horizonColor','bottomColor'].map(k=>[k,{value:new THREE.Color()}])),
  });
  const unit={id:'suite',frame:frame(0,0,0),rects:[{x0:0,z0:0,x1:11,z1:15}],residence:{suitePlan:{}}};
  const home={id:'home',frame:frame(0,0,0),rects:[{x0:0,z0:0,x1:18,z1:15}],residence:{prototype:'03'}};
  const ctx={scene,camera,renderer,dynamic:[],lvById:{suite:{id:'suite',kind:'hotel',elev:0,height:6.5,units:[unit]},
    home:{id:'home',kind:'residential',elev:0,height:3.4,units:[home]}},
    residentialAssets:{templates:new Map([['03',{record:{lighting:{roomLamps:[['living',5,4,10]]}}}]])}};
  const suite=createSuiteLighting(ctx),residential=createResidentialLighting(ctx);
  const app={env,state:{},controls:{target:new THREE.Vector3(5,0,5)}};
  camera.position.set(5,1.62,5);
  const update=()=>{env.update(.1);suite.update(.1,0,app);residential.update(.1,0,app);};
  update();env.render();assert.equal(env.composer,null,'daylight must not allocate postprocessing');
  app.state.explore={level:'suite'};update();
  assert.deepEqual(env.bloomProfile,{strength:0,threshold:1.25});assert.equal(env.bloom,null);
  env.setNight(true);update();
  assert.ok(env.bloomProfile.strength>0);assert.equal(env.bloom,null,'lighting must not allocate GPU buffers');
  env.ensureComposer();
  assert.equal(env.bloom.strength,env.night*.1);assert.equal(env.bloom.threshold,1.25);
  env.setQuality(resolveQuality({preset:'low'}));assert.equal(env.bloom,null);
  app.state.explore={level:'home'};update();
  assert.equal(residential.mode,'dwelling');assert.equal(env.bloomProfile.threshold,1.25);
  env.setQuality(resolveQuality({preset:'high'}));assert.equal(env.bloom,null);
  env.ensureComposer();assert.equal(env.bloom.strength,env.night*.1);assert.equal(env.bloom.threshold,1.25);
  app.state={};update();assert.equal(env.bloom.threshold,.8);assert.equal(env.bloom.strength,env.night*.85);
  env.setQuality(resolveQuality({preset:'low'}));suite.dispose();residential.dispose();
});
