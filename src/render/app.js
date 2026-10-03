// 应用主体：渲染器、相机、楼层分组、构建流程、状态（聚焦/爆炸/昼夜/动线/标注）、拾取高亮与主循环。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MaterialLib } from './materials.js';
import { Environment } from './env.js';
import { BatchSet, SignBatch } from './batch.js';
import { makeSignAtlas, setAnisotropy, drawWayfinding } from './textures.js';
import { buildShell, clearHeight } from './build/shell.js';
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
import { buildFlows } from './build/flows.js';
import { buildLabels } from './build/labels.js';
import { buildPeople } from './build/people.js';
import { buildTraffic } from './build/traffic.js';
import { NORMAL } from '../layout/geom.js';
import { CORE_W, CORE_E, SERVICE } from '../layout/constants.js';

const EXPLODE_GAP = 13;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// 让出主线程以刷新加载进度；后台标签页没有 rAF，用定时器兜底
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

  const ctx = { layout, mats, scene, root, renderer, camera, levels: {}, atlas: {}, dynamic: [], site: null };
  layout.levels.forEach((lv, index) => {
    const group = new THREE.Group();
    group.name = lv.id;
    const base = new THREE.Group();
    const facade = new THREE.Group();
    const labels = new THREE.Group();
    const flows = new THREE.Group();
    const people = new THREE.Group();
    const picks = new THREE.Group();
    group.add(base, facade, labels, flows, people, picks);
    root.add(group);
    const entries = [
      ...lv.units.map((u) => ({ id: u.id, brand: u.brand })),
      ...WAYFINDING.map((w) => ({ id: w.id, draw: (g, x, y, cw, ch) => drawWayfinding(g, x, y, cw, ch, w.kind, w.text, w.bg) })),
    ];
    const atlas = makeSignAtlas(entries);
    atlas.material = mats.sign(atlas.texture);
    ctx.atlas[lv.id] = atlas;
    ctx.levels[lv.id] = {
      lv, index, group, base, facade, labels, flows, people, picks,
      batch: new BatchSet(mats.base), facadeBatch: new BatchSet(mats.base),
      signs: new SignBatch(), facadeSigns: new SignBatch(),
      offset: 0, offsetTarget: 0, title: null,
    };
  });
  const siteGroup = new THREE.Group();
  siteGroup.name = 'site';
  root.add(siteGroup);
  ctx.site = { group: siteGroup, batch: new BatchSet(mats.base), labels: new THREE.Group(), picks: new THREE.Group(), flows: null };
  siteGroup.add(ctx.site.labels, ctx.site.picks);

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
    ['绘制动线', buildFlows],
    ['添加标注', buildLabels],
    ['安排人流', buildPeople],
    ['安排车流', buildTraffic],
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
  buildPicks(ctx);

  // ---------- 状态与视图 ----------
  const ids = layout.levels.map((l) => l.id);
  const byId = Object.fromEntries(layout.levels.map((l) => [l.id, l]));
  const state = { focus: null, exploded: false, flows: false, labels: true, night: false, selected: null, touring: false };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));
  const highlight = makeHighlight(scene);

  function applyVisibility() {
    const fi = state.focus ? ids.indexOf(state.focus) : ids.length;
    const focusLv = state.focus ? byId[state.focus] : null;
    for (const id of ids) {
      const L = ctx.levels[id];
      L.group.visible = state.exploded || L.index <= fi;
      L.facade.visible = !state.exploded && (!state.focus || L.index < fi);
      L.labels.visible = state.labels && !state.touring && !state.exploded && state.focus === id;
      if (L.title) L.title.visible = state.exploded && state.labels && !state.touring;
      L.flows.visible = state.flows && (state.focus ? id === state.focus : state.exploded || id === 'RF');
      L.offsetTarget = state.exploded ? L.index * EXPLODE_GAP : 0;
    }
    siteGroup.visible = !state.exploded && (!focusLv || focusLv.elev >= 0);
    ctx.site.labels.visible = state.labels && !state.touring && !state.focus && !state.exploded;
    if (ctx.site.flows) ctx.site.flows.visible = state.flows && !state.focus && !state.exploded;
    const sel = state.selected && findUnit(state.selected);
    highlight.show(sel && ctx.levels[sel.level].group.visible ? sel : null, ctx);
    renderer.shadowMap.needsUpdate = true;
  }
  function findUnit(id) {
    for (const lv of layout.levels) { const u = lv.units.find((x) => x.id === id); if (u) return u; }
    return null;
  }

  // ---------- 相机飞行 ----------
  let flight = null;
  function flyTo(position, target, duration = 1.4) {
    const p1 = position.clone();
    if (camera.aspect < 1) p1.sub(target).multiplyScalar(1.22).add(target);
    flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1: target.clone(), time: 0, duration };
  }
  function levelView(id) {
    const L = ctx.levels[id];
    const y = L.lv.elev + (state.exploded ? L.offsetTarget : 0);
    if (L.lv.kind === 'roof') return [new THREE.Vector3(70, y + 62, 92), new THREE.Vector3(6, y + 6, 0)];
    return [new THREE.Vector3(58, y + 74, 92), new THREE.Vector3(0, y, 3)];
  }
  const OVERVIEW = [new THREE.Vector3(150, 105, 185), new THREE.Vector3(0, 4, 0)];
  const EXPLODED = [new THREE.Vector3(178, 118, 214), new THREE.Vector3(0, 44, 0)];

  const app = {
    ctx, state, renderer, scene, camera, controls, env, levelIds: ids, emit,
    refresh() { applyVisibility(); },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setFocus(id) {
      if (state.touring) app.stopTour();
      state.focus = id;
      if (!id || (state.selected && findUnit(state.selected)?.level !== id)) state.selected = null;
      applyVisibility();
      if (id) flyTo(...levelView(id));
      else flyTo(...(state.exploded ? EXPLODED : OVERVIEW));
      emit();
    },
    setExploded(on) {
      if (state.touring) app.stopTour();
      state.exploded = on;
      state.focus = null;
      state.selected = null;
      applyVisibility();
      flyTo(...(on ? EXPLODED : OVERVIEW), 1.6);
      emit();
    },
    setNight(on) { state.night = on; env.setNight(on); emit(); },
    setFlows(on) { state.flows = on; applyVisibility(); emit(); },
    setLabels(on) { state.labels = on; applyVisibility(); emit(); },
    reset(noFly = false) {
      state.focus = null;
      state.exploded = false;
      state.selected = null;
      applyVisibility();
      if (!noFly) flyTo(...OVERVIEW);
      emit();
    },
    flyTo,
    /** 飞到某个铺位门口并高亮 */
    focusUnit(unit) {
      if (state.touring) app.stopTour();
      state.exploded = false;
      state.focus = unit.level;
      state.selected = unit.id;
      applyVisibility();
      const f = unit.fronts[0];
      const [nx, nz] = NORMAL[f.side];
      const lv = byId[unit.level];
      const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2;
      const target = new THREE.Vector3(mx - nx * 3, lv.elev + 2.2, mz - nz * 3);
      const pos = new THREE.Vector3(mx + nx * 16 + nz * 7, lv.elev + 12, mz + nz * 16 - nx * 7);
      flyTo(pos, target, 1.6);
      emit();
    },
    /** 屏幕坐标拾取：返回提示内容 */
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const cands = [];
      for (const id of ids) {
        const L = ctx.levels[id];
        const ok = state.exploded || (state.focus ? state.focus === id : id === 'RF');
        if (ok && L.group.visible) cands.push(...L.picks.children);
      }
      if (!state.focus && !state.exploded) cands.push(...ctx.site.picks.children);
      const hit = raycaster.intersectObjects(cands, false)[0];
      if (!hit) return null;
      const d = hit.object.userData;
      if (d.kind === 'unit') {
        const u = d.unit;
        return { unit: u, html: `<b>${esc(u.brand.name)}</b><div class="en">${esc(u.brand.en)}</div><div class="meta">${esc(u.brand.catLabel)} · ${u.code} · ${esc(byId[u.level].name)}</div>` };
      }
      return { html: `<b>${esc(d.title)}</b><div class="meta">${esc(d.desc)}</div>` };
    },
    /** 调试：立即按给定视角渲染一帧并返回 JPEG dataURL（后台标签页也可用） */
    debugShot({ w = 1280, h = 800, pos, target, dt = 0.016, steps: n = 1 } = {}) {
      const prev = renderer.getSize(new THREE.Vector2());
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      env.resize(w, h);
      flight = null;
      if (pos) camera.position.set(...pos);
      if (target) controls.target.set(...target);
      for (const id of ids) { const L = ctx.levels[id]; L.offset = L.offsetTarget; L.group.position.y = L.offset; }
      controls.update();
      for (let i = 0; i < n; i++) {
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
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // ---------- 主循环 ----------
  const clock = new THREE.Clock();
  let elapsed = 0;
  let degraded = false;
  const perf = { start: performance.now(), t0: performance.now(), frames: 0 };
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 竖屏时加大垂直视场角，保证建筑横向能放下
    camera.fov = camera.aspect < 1 ? Math.min(72, 42 / Math.pow(camera.aspect, 0.62)) : 42;
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
    if (!state.touring) controls.update();
    env.update(dt);
    for (const d of ctx.dynamic) d.update(dt, elapsed, app);
    highlight.update(elapsed, ctx);
    env.render();
    // 帧率持续过低时自动降级：关阴影、泛光，降低像素比（只在页面可见、加载 6 秒后按真实帧率判断）
    if (!degraded) {
      const now = performance.now();
      if (document.hidden || now - perf.start < 6000) { perf.t0 = now; perf.frames = 0; }
      else {
        perf.frames++;
        if (now - perf.t0 > 5000) {
          const fps = (perf.frames * 1000) / (now - perf.t0);
          perf.t0 = now;
          perf.frames = 0;
          if (fps < 22) {
            degraded = true;
            renderer.setPixelRatio(1);
            renderer.shadowMap.enabled = false;
            env.bloomEnabled = false;
            scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
            resize();
            console.info(`性能降级：平均 ${fps.toFixed(1)} fps，已关闭阴影与泛光`);
          }
        }
      }
    }
  });

  applyVisibility();
  resize();
  if (camera.aspect < 1) camera.position.sub(controls.target).multiplyScalar(1.22).add(controls.target);
  renderer.shadowMap.needsUpdate = true;
  return app;
}

/** 拾取盒：铺位、设施、天台打卡点、场地入口 */
function buildPicks(ctx) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const add = (group, r, y0, h, data) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(Math.max(0.5, r.x1 - r.x0), h, Math.max(0.5, r.z1 - r.z0));
    m.position.set((r.x0 + r.x1) / 2, y0 + h / 2, (r.z0 + r.z1) / 2);
    m.userData = data;
    group.add(m);
  };
  const { layout } = ctx;
  for (const lv of layout.levels) {
    const G = ctx.levels[lv.id].picks;
    const H = lv.kind === 'roof' ? 4.2 : clearHeight(lv);
    for (const u of lv.units) for (const r of u.rects) add(G, r, lv.elev, H, { kind: 'unit', unit: u });
    for (const r of lv.rooms) {
      const info = {
        wc: ['洗手间', '男卫 · 女卫 · 无障碍卫生间 · 母婴室'],
        stair: ['消防楼梯 · 安全出口', `${lv.short} 疏散楼梯`],
        core: ['客梯厅', '3 台客梯 · B2–RF 全楼直达'],
        freight: ['货梯', '服务各层商户补货 · B1M–RF'],
        equip: [r.label || '设备房', '非公共区域'],
        mech: ['屋顶设备区', '冷却塔 · 空调机组（格栅围挡）'],
      }[r.type];
      if (info) for (const rr of r.rects) add(G, rr, lv.elev, H, { kind: 'facility', title: info[0], desc: info[1] });
    }
    for (const [lobby, t] of [[CORE_W.lobby, '西客梯厅'], [CORE_E.lobby, '东客梯厅']]) add(G, lobby, lv.elev, 2.5, { kind: 'facility', title: t, desc: '3 台客梯 · B2 至天台全楼直达' });
    if (lv.rooms.some((r) => r.type === 'freight')) add(G, SERVICE.lobby, lv.elev, 2.5, { kind: 'facility', title: '货梯厅', desc: '后勤补货通道，连接北侧卸货区' });
  }
  for (const e of layout.escalators) {
    const xs = [e.bottom.x, e.top.x], zs = [e.bottom.z, e.top.z];
    const r = { x0: Math.min(...xs) - 0.9, x1: Math.max(...xs) + 0.9, z0: Math.min(...zs) - 0.9, z1: Math.max(...zs) + 0.9 };
    const lo = layout.levels.find((l) => l.id === e.from), hi = layout.levels.find((l) => l.id === e.to);
    add(ctx.levels[e.from].picks, r, e.bottom.y, e.top.y - e.bottom.y + 1, { kind: 'facility', title: `扶梯 ${e.dir === 'up' ? '上行' : '下行'}`, desc: `${lo.name} ↔ ${hi.name} · 坡度 30°` });
  }
  for (const g of layout.elevators.filter((x) => x.type === 'glass')) {
    for (const id of g.serves) {
      const lv = layout.levels.find((l) => l.id === id);
      add(ctx.levels[id].picks, { x0: g.x - 1.3, x1: g.x + 1.3, z0: g.z - 1.3, z1: g.z + 1.3 }, lv.elev, lv.height, { kind: 'facility', title: '中庭观光电梯', desc: '停靠 B1M · 1F · 2F · 3F' });
    }
  }
  const rf = layout.levels.find((l) => l.id === 'RF');
  const G = ctx.levels.RF.picks;
  for (const f of rf.features) {
    if (f.type === 'ferris') add(G, { x0: f.x - f.radius, x1: f.x + f.radius, z0: f.z - 3, z1: f.z + 3 }, rf.elev, f.radius * 2 + 4, { kind: 'facility', title: '云澜之眼 摩天轮', desc: '直径 30m · 24 个轿厢 · 天台网红打卡点' });
    if (f.type === 'ip') add(G, { x0: f.x - 3, x1: f.x + 3, z0: f.z - 3, z1: f.z + 3 }, rf.elev, 8, { kind: 'facility', title: 'IP「云宝」', desc: '云澜汇原创形象 · 打卡点' });
    if (f.rect && ['mirror', 'skywalk', 'playground', 'pavilion', 'pergola'].includes(f.type)) add(G, f.rect, rf.elev, f.type === 'pavilion' ? 4.6 : 2.5, { kind: 'facility', title: f.name, desc: { mirror: '浅水镜面 · 拍照打卡', skywalk: '悬挑 6m 的全玻璃观景台', playground: '滑梯 · 秋千 · 攀爬塔', pavilion: '3F → 天台扶梯出口', pergola: '紫藤花架长廊' }[f.type] });
    if (f.type === 'letters') add(G, { x0: f.x - 7, x1: f.x + 7, z0: f.z - 1, z1: f.z + 1 }, rf.elev, 5.6, { kind: 'facility', title: '「云澜汇」立体字', desc: '天台打卡点' });
  }
  for (const e of layout.entrances) {
    const [nx, nz] = NORMAL[e.side];
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    const w = e.width / 2 + 2;
    const r = e.side === 'N' || e.side === 'S'
      ? { x0: mx - w, x1: mx + w, z0: Math.min(mz, mz + nz * 7), z1: Math.max(mz, mz + nz * 7) }
      : { x0: Math.min(mx, mx + nx * 7), x1: Math.max(mx, mx + nx * 7), z0: mz - w, z1: mz + w };
    add(ctx.site.picks, r, 0, 5, { kind: 'facility', title: e.name, desc: e.main ? '16m 宽 · 旋转门 + 自动门 · 服务台在大堂' : '人行入口 · 自动门' });
  }
  for (const r of layout.ramps.filter((x) => x.type.startsWith('street'))) {
    add(ctx.site.picks, r.lane, -2, 4, { kind: 'facility', title: r.name, desc: r.type === 'street-in' ? '西北侧进入 · 15% 坡道下至 B1' : '由 B1 上行 · 东北侧驶出' });
  }
}

/** 选中铺位的高亮框（脉动） */
function makeHighlight(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mat = new THREE.LineBasicMaterial({ color: 0xffc83d, transparent: true, depthTest: false });
  const fill = new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  let current = null;
  return {
    show(unit, ctx) {
      if (current === unit) { group.visible = !!unit; return; }
      group.clear();
      current = unit;
      group.visible = !!unit;
      if (!unit) return;
      const lv = ctx.levels[unit.level];
      const H = lv.lv.kind === 'roof' ? 4.2 : clearHeight(lv.lv);
      for (const r of unit.rects) {
        const box = new THREE.BoxGeometry(r.x1 - r.x0, H, r.z1 - r.z0);
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(box), mat);
        lines.position.set((r.x0 + r.x1) / 2, lv.lv.elev + H / 2, (r.z0 + r.z1) / 2);
        lines.renderOrder = 30;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2), fill);
        floor.position.set((r.x0 + r.x1) / 2, lv.lv.elev + 0.06, (r.z0 + r.z1) / 2);
        group.add(lines, floor);
      }
      group.userData.level = unit.level;
    },
    update(time, ctx) {
      if (!current) return;
      group.position.y = ctx.levels[group.userData.level].offset;
      mat.opacity = 0.65 + Math.sin(time * 4) * 0.35;
      fill.opacity = 0.12 + Math.sin(time * 4) * 0.08;
    },
  };
}
