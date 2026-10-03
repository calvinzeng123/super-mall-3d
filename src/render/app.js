// 应用主体：渲染器、相机、楼层分组、构建流程、状态（聚焦/爆炸/昼夜/动线/标注）、拾取与主循环。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MaterialLib } from './materials.js';
import { Environment } from './env.js';
import { BatchSet, SignBatch } from './batch.js';
import { makeSignAtlas, setAnisotropy, drawWayfinding } from './textures.js';
import { buildShell } from './build/shell.js';
import { buildSite } from './build/site.js';
import { buildWalls } from './build/walls.js';
import { buildStorefronts } from './build/storefronts.js';
import { buildInteriors } from './build/interiors.js';
import { buildRooms } from './build/rooms.js';
import { buildEscalators } from './build/escalators.js';
import { buildElevators } from './build/elevators.js';
import { buildPublic } from './build/public.js';
import { buildParking } from './build/parking.js';
import { buildRoof } from './build/roof.js';
import { NORMAL } from '../layout/geom.js';

const EXPLODE_GAP = 13;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// 让出主线程以刷新加载进度；后台标签页没有 rAF，用定时器兜底
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });

/** 每层图集里除品牌外的通用导视牌 */
const WAYFINDING = [
  { id: 'wf-wc', kind: 'wc', text: '洗手间 WC', bg: '#1f2933' },
  { id: 'wf-lift', kind: 'lift', text: '客梯 Elevator', bg: '#1f2933' },
  { id: 'wf-freight', kind: 'lift', text: '货梯 Freight', bg: '#4b5563' },
  { id: 'wf-exit', kind: 'exit', text: '安全出口 EXIT', bg: '#0f8a4a' },
  { id: 'wf-esc', kind: 'escalator', text: '扶梯 Escalator', bg: '#1f2933' },
  { id: 'wf-info', kind: 'info', text: '服务台 Info', bg: '#0f6f86' },
  { id: 'wf-food', kind: 'food', text: '美食广场 Food', bg: '#b45309' },
  { id: 'wf-park', kind: 'parking', text: '停车场 Parking', bg: '#1d4ed8' },
  { id: 'wf-wheel', kind: 'wheel', text: '摩天轮 Sky Eye', bg: '#6a3fb5' },
];

export async function createApp(layout, canvas, { onProgress = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.3, 4000);
  camera.position.set(150, 105, 185);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 3;
  controls.maxDistance = 650;
  controls.target.set(0, 4, 0);
  controls.screenSpacePanning = true;

  const mats = new MaterialLib();
  const env = new Environment(renderer, scene, camera, mats);
  const root = new THREE.Group();
  scene.add(root);

  const ctx = { layout, mats, scene, root, renderer, camera, levels: {}, atlas: {}, dynamic: [], picks: [], labels: [], site: null };
  layout.levels.forEach((lv, index) => {
    const group = new THREE.Group();
    group.name = lv.id;
    const base = new THREE.Group();
    const facade = new THREE.Group();
    const labels = new THREE.Group();
    const flows = new THREE.Group();
    const people = new THREE.Group();
    group.add(base, facade, labels, flows, people);
    root.add(group);
    const entries = [
      ...lv.units.map((u) => ({ id: u.id, brand: u.brand })),
      ...WAYFINDING.map((w) => ({ id: w.id, draw: (g, x, y, cw, ch) => drawWayfinding(g, x, y, cw, ch, w.kind, w.text, w.bg) })),
    ];
    const atlas = makeSignAtlas(entries);
    atlas.material = mats.sign(atlas.texture);
    ctx.atlas[lv.id] = atlas;
    ctx.levels[lv.id] = {
      lv, index, group, base, facade, labels, flows, people,
      batch: new BatchSet(mats.base), facadeBatch: new BatchSet(mats.base),
      signs: new SignBatch(), facadeSigns: new SignBatch(),
      offset: 0, offsetTarget: 0,
    };
  });
  const siteGroup = new THREE.Group();
  siteGroup.name = 'site';
  root.add(siteGroup);
  ctx.site = { group: siteGroup, batch: new BatchSet(mats.base), labels: new THREE.Group() };
  siteGroup.add(ctx.site.labels);

  const steps = [
    ['搭建楼板与外立面', buildShell],
    ['砌筑隔墙', buildWalls],
    ['安装店面与招牌', buildStorefronts],
    ['布置店内陈设', buildInteriors],
    ['建造核心筒与卫生间', buildRooms],
    ['安装扶梯', buildEscalators],
    ['安装观光电梯', buildElevators],
    ['布置美食广场与公共区', buildPublic],
    ['划设停车位', buildParking],
    ['打造天台花园与摩天轮', buildRoof],
    ['铺设道路与广场', buildSite],
  ];
  for (let i = 0; i < steps.length; i++) {
    onProgress(steps[i][0], i / steps.length);
    await nextFrame();
    steps[i][1](ctx);
  }
  onProgress('整理场景', 0.98);
  await nextFrame();
  for (const L of Object.values(ctx.levels)) {
    L.batch.flush(L.base);
    L.facadeBatch.flush(L.facade);
    L.signs.flush(L.base, ctx.atlas[L.lv.id].material);
    L.facadeSigns.flush(L.facade, ctx.atlas[L.lv.id].material);
  }
  ctx.site.batch.flush(siteGroup);

  // ---------- 状态与视图 ----------
  const ids = layout.levels.map((l) => l.id);
  const state = { focus: null, exploded: false, flows: false, labels: true, night: false, selected: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));

  function applyVisibility() {
    const fi = state.focus ? ids.indexOf(state.focus) : ids.length;
    const focusLv = state.focus ? ctx.levels[state.focus].lv : null;
    for (const id of ids) {
      const L = ctx.levels[id];
      const visible = state.exploded || L.index <= fi;
      L.group.visible = visible;
      L.facade.visible = !state.exploded && (!state.focus || L.index < fi);
      L.labels.visible = state.labels && (state.focus ? id === state.focus : state.exploded ? true : id === 'RF');
      L.flows.visible = state.flows && (state.focus ? id === state.focus : true);
      L.offsetTarget = state.exploded ? L.index * EXPLODE_GAP : 0;
    }
    siteGroup.visible = !state.exploded && (!focusLv || focusLv.elev >= 0);
    ctx.site.labels.visible = state.labels && !state.focus && !state.exploded;
    renderer.shadowMap.needsUpdate = true;
  }

  // ---------- 相机飞行 ----------
  let flight = null;
  function flyTo(position, target, duration = 1.4) {
    flight = {
      p0: camera.position.clone(), t0: controls.target.clone(),
      p1: position.clone(), t1: target.clone(), time: 0, duration,
    };
  }
  function levelView(id) {
    const L = ctx.levels[id];
    const y = L.lv.elev + (state.exploded ? L.offsetTarget : 0);
    if (L.lv.kind === 'roof') return [new THREE.Vector3(70, y + 62, 92), new THREE.Vector3(6, y + 6, 0)];
    return [new THREE.Vector3(58, y + 74, 92), new THREE.Vector3(0, y, 3)];
  }
  const OVERVIEW = [new THREE.Vector3(150, 105, 185), new THREE.Vector3(0, 4, 0)];
  const EXPLODED = [new THREE.Vector3(205, 120, 245), new THREE.Vector3(0, 30, 0)];

  const app = {
    ctx, state, renderer, scene, camera, controls, env,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setFocus(id) {
      state.focus = id;
      applyVisibility();
      if (state.exploded && id) {
        const [p, t] = levelView(id);
        flyTo(p, t);
      } else if (id) {
        const [p, t] = levelView(id);
        flyTo(p, t);
      } else {
        flyTo(...(state.exploded ? EXPLODED : OVERVIEW));
      }
      emit();
    },
    setExploded(on) {
      state.exploded = on;
      if (on) state.focus = null;
      applyVisibility();
      flyTo(...(on ? EXPLODED : OVERVIEW));
      emit();
    },
    setNight(on) { state.night = on; env.setNight(on); emit(); },
    setFlows(on) { state.flows = on; applyVisibility(); emit(); },
    setLabels(on) { state.labels = on; applyVisibility(); emit(); },
    reset() {
      state.focus = null;
      state.exploded = false;
      applyVisibility();
      flyTo(...OVERVIEW);
      emit();
    },
    flyTo,
    /** 飞到某个铺位门口 */
    focusUnit(unit) {
      if (state.exploded) app.setExploded(false);
      state.focus = unit.level;
      state.selected = unit.id;
      applyVisibility();
      const f = unit.fronts[0];
      const [nx, nz] = NORMAL[f.side];
      const lv = ctx.levels[unit.level].lv;
      const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2;
      const target = new THREE.Vector3(mx - nx * 3, lv.elev + 2.2, mz - nz * 3);
      const pos = new THREE.Vector3(mx + nx * 15 + nz * 6, lv.elev + 11, mz + nz * 15 - nx * 6);
      flyTo(pos, target, 1.6);
      emit();
    },
    levelIds: ids,
    /** 调试：立即按给定视角渲染一帧并返回 JPEG dataURL（后台标签页也可用） */
    debugShot({ w = 1280, h = 800, pos, target, dt = 0.016, steps = 1 } = {}) {
      const prev = renderer.getSize(new THREE.Vector2());
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      env.resize(w, h);
      flight = null;
      if (pos) camera.position.set(...pos);
      if (target) controls.target.set(...target);
      for (const id of ids) {
        const L = ctx.levels[id];
        L.offset = L.offsetTarget;
        L.group.position.y = L.offset;
      }
      controls.update();
      for (let i = 0; i < steps; i++) {
        env.night = env.target;
        env.apply();
        env.update(dt);
        for (const d of ctx.dynamic) d.update(dt, (elapsed += dt), app);
      }
      renderer.shadowMap.needsUpdate = true;
      env.render();
      const url = renderer.domElement.toDataURL('image/jpeg', 0.86);
      renderer.setSize(prev.x, prev.y, false);
      camera.aspect = prev.x / prev.y;
      camera.updateProjectionMatrix();
      env.resize(prev.x, prev.y);
      return url;
    },
  };

  // ---------- 主循环 ----------
  const clock = new THREE.Clock();
  let elapsed = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    env.resize(w, h);
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    if (flight) {
      flight.time += dt;
      const k = ease(Math.min(1, flight.time / flight.duration));
      camera.position.lerpVectors(flight.p0, flight.p1, k);
      controls.target.lerpVectors(flight.t0, flight.t1, k);
      if (k >= 1) flight = null;
    }
    let moving = false;
    for (const id of ids) {
      const L = ctx.levels[id];
      if (Math.abs(L.offset - L.offsetTarget) > 0.01) {
        L.offset += (L.offsetTarget - L.offset) * Math.min(1, dt * 4);
        L.group.position.y = L.offset;
        moving = true;
      }
    }
    if (moving) renderer.shadowMap.needsUpdate = true;
    controls.update();
    env.update(dt);
    for (const d of ctx.dynamic) d.update(dt, elapsed, app);
    env.render();
  });

  applyVisibility();
  renderer.shadowMap.needsUpdate = true;
  return app;
}
