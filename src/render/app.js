// 应用主体：渲染器、相机、楼栋 → 楼层分组、构建流程、状态（楼栋 / 楼层 / 爆炸 / 昼夜 / 动线 / 标注）、拾取高亮与主循环。
// 每层分组：base（室内）、shell（楼板）、facade（外立面）、labels、flows、people、picks。
// 园区视角只显示各层 shell + facade（屋面层与街区显示完整内容）；选中某期才显示其室内。
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
import { buildStreet } from './build/street.js';
import { buildBridges } from './build/bridges.js';
import { buildPark } from './build/park.js';
import { buildSquare } from './build/square.js';
import { buildMetro } from './build/metro.js';
import { createPerfMonitor } from './perf.js';
import { MOBILE } from './device.js';
import { createQualityManager } from './quality.js';
import { loadSurfaceTextures } from './pbr.js';
import { buildHospitality, setHospitalityCut, setResidentialDetailLevel } from './build/hospitality.js';
import { buildResidenceFloor } from './build/residence-interiors.js';
import { buildTowerElevators } from './build/tower-elevators.js';
import { loadSuiteAsset } from './suite-asset.js';
import { SUITE_MODEL_URL } from './suite-data.js';
import { createSuiteLighting } from './suite-lighting.js';
import { loadResidentialAssets } from './residential-asset.js';
import { createResidentialLighting } from './residential-lighting.js';
import { toW, frame, IDENTITY } from '../layout/geom.js';
import { createExploreVisibility } from './explore-visibility.js';
import { buildTransitCenter } from './build/transit-center.js';
import { createDeferredResource, createSerialTaskQueue, detailAssetKind, activeDetailFloor } from './deferred-resource.js';

const EXPLODE_GAP = 13;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
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

/** 园区总览（四个地块 + 路口云环） */
const OVERVIEW = [V(125, 480, 590), V(-90, 30, -35)];

export async function createApp(layout, canvas, { onProgress = () => {} } = {}) {
  const fps = layout.playable?.mode === 'fps';
  let storage;
  try { storage = window.localStorage; } catch { /* Storage can be blocked in an embedded preview. */ }
  const qualityManager = createQualityManager({ mobile: MOBILE, pixelRatio: window.devicePixelRatio, storage: fps ? undefined : storage });
  // FPS has its own controls. Always begin inside the phone budget, even when
  // a previous sightseeing session saved high quality on this device.
  if (fps) { qualityManager.select('low'); qualityManager.customize({ resolution: .9, shadows: false, bloom: false, crowdDensity: 0 }); }
  const initialQuality = qualityManager.current;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(initialQuality.pixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = initialQuality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  if (fps) renderer.info.autoReset = false;
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.3, 12000);
  camera.position.copy(OVERVIEW[0]);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 3;
  controls.maxDistance = 3600;
  controls.target.copy(OVERVIEW[1]);
  controls.screenSpacePanning = true;

  onProgress('加载石材、木纹与街区铺装', 0);
  const surfaces = await loadSurfaceTextures(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const mats = new MaterialLib(surfaces);
  const env = new Environment(renderer, scene, camera, mats, initialQuality);
  const root = new THREE.Group();
  scene.add(root);

  const ctx = { layout, mats, scene, root, renderer, camera, levels: {}, buildings: {}, atlas: {}, dynamic: [], afterRender: [], site: null, quality: initialQuality };
  const detailQueue = createSerialTaskQueue();
  const assetAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let residentialProgress = '';
  ctx.suiteAsset = null;
  const suiteResource = createDeferredResource(async () => {
    ctx.suiteAsset = await loadSuiteAsset(SUITE_MODEL_URL, assetAnisotropy);
    return ctx.suiteAsset;
  }, detailQueue);
  // FPS keeps its compact-map startup contract. The complete tour only parses
  // interiors on a first room-floor visit, not alongside every campus builder.
  if (fps) {
    onProgress('载入你的套房家具、材质与灯具', .015);
    await suiteResource.request();
  }
  ctx.suiteLighting = createSuiteLighting(ctx);
  ctx.residentialAssets = { stats: { models: 0, templates: 0 }, templates: new Map() };
  ctx.residentialLighting = null;
  const residentialResource = createDeferredResource(async () => {
    const assets = await loadResidentialAssets((await import('./residential-data.js')).RESIDENTIAL_ASSETS,
      assetAnisotropy, unit => { residentialProgress = `正在展开 ${unit} 户型家具与材质`; syncDetailStatus(); });
    ctx.residentialAssets = assets;
    ctx.residentialLighting = createResidentialLighting(ctx);
    return assets;
  }, detailQueue);
  const detailResources = { suite: suiteResource, residential: residentialResource };
  ctx.lvById = Object.fromEntries(layout.levels.map((l) => [l.id, l]));
  ctx.bById = Object.fromEntries(layout.buildings.map((b) => [b.id, b]));
  for (const b of layout.buildings) {
    const bg = new THREE.Group();
    bg.name = b.id;
    root.add(bg);
    const B = { b, group: bg, levels: [] };
    ctx.buildings[b.id] = B;
    layout.levels.filter((l) => l.building === b.id).forEach((lv, index) => {
      const group = new THREE.Group();
      group.name = lv.id;
      const parts = ['base', 'shell', 'facade', 'labels', 'flows', 'people', 'picks'].map(() => new THREE.Group());
      const [base, shell, facade, labels, flows, people, picks] = parts;
      group.add(...parts);
      bg.add(group);
      const entries = [
        ...lv.units.map((u) => ({ id: u.id, brand: u.brand })),
        ...WAYFINDING.map((w) => ({ id: w.id, draw: (g, x, y, cw, ch) => drawWayfinding(g, x, y, cw, ch, w.kind, w.text, w.bg) })),
      ];
      // 高层房号按当前楼层生成，避免为160层常驻数百张招牌图集。
      const atlas = b.kind === 'tower' ? null : makeSignAtlas(entries);
      if (atlas) atlas.material = mats.sign(atlas.texture);
      ctx.atlas[lv.id] = atlas;
      const L = {
        lv, index, building: b.id, group, base, shell, facade, labels, flows, people, picks,
        batch: new BatchSet(mats.base), shellBatch: new BatchSet(mats.base), facadeBatch: new BatchSet(mats.base),
        signs: b.kind === 'tower' ? null : new SignBatch(), facadeSigns: b.kind === 'tower' ? null : new SignBatch(),
        offset: 0, offsetTarget: 0, title: null,
      };
      ctx.levels[lv.id] = L;
      B.levels.push(L);
    });
  }
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
    ['布置方庭影院与农场', buildSquare],
    ['营造三期街区', buildStreet],
    ['架设云环天桥', buildBridges],
    ['种植中央公园', buildPark],
    ['开通地铁云澜汇站', buildMetro],
    ['铺设道路与广场', buildSite],
    ['绘制动线', buildFlows],
    ['添加标注', buildLabels],
    ['安排人流', buildPeople],
    ['安排车流', buildTraffic],
  ];
  const originalIds = new Set(layout.buildings.filter(b => b.kind !== 'tower').map(b => b.id));
  const legacyLayout = { ...layout, buildings: layout.buildings.filter(b => originalIds.has(b.id)),
    levels: layout.levels.filter(l => originalIds.has(l.building)) };
  for (const key of ['elevators', 'stairs', 'entrances', 'ramps']) legacyLayout[key] = layout[key].filter(v => originalIds.has(v.building));
  const legacyCtx = { ...ctx, layout: legacyLayout };
  for (let i = 0; i < steps.length; i++) {
    if (layout.playable && steps[i][1] === buildTraffic) continue;
    if (fps && [buildPeople, buildTraffic, buildFlows, buildLabels].includes(steps[i][1])) continue;
    onProgress(steps[i][0], i / steps.length);
    await nextFrame();
    const currentCtx = steps[i][1] === buildSite ? ctx : legacyCtx;
    await steps[i][1](currentCtx);
    // 构建器注册的动态接口（outlineEdges、metroSync等）回传给完整场景。
    if (currentCtx === legacyCtx) for (const key of ['outlineEdges', 'metroSync', 'bridgeGroup', 'paths', 'ferris', 'carGeo', 'carMat', 'peopleQuality', 'mallStairStats']) if (legacyCtx[key]) ctx[key] = legacyCtx[key];
  }
  onProgress('建造云澜汇酒店、公寓与住宅', 0.96);
  await nextFrame();
  buildHospitality(ctx);
  buildTransitCenter(ctx);
  const towerIds = new Set(layout.buildings.filter(b => b.kind === 'tower').map(b => b.id));
  buildParking({ ...ctx, layout: { ...layout,
    buildings: layout.buildings.filter(b => towerIds.has(b.id)),
    levels: layout.levels.filter(l => towerIds.has(l.building)),
    ramps: layout.ramps.filter(r => towerIds.has(r.building)),
    elevators: layout.elevators.filter(e => towerIds.has(e.building)),
  } });
  buildTowerElevators(ctx);
  onProgress('整理场景', 0.98);
  await nextFrame();
  let flushedLevels = 0;
  for (const L of Object.values(ctx.levels)) {
    L.batch.flush(L.base);
    L.shellBatch.flush(L.shell);
    L.facadeBatch.flush(L.facade);
    if (L.signs) L.signs.flush(L.base, ctx.atlas[L.lv.id].material);
    if (L.facadeSigns) L.facadeSigns.flush(L.facade, ctx.atlas[L.lv.id].material);
    // Give mobile engines a chance to reclaim consumed builders between groups
    // instead of retaining every transient allocation until the final frame.
    if (MOBILE && ++flushedLevels % 8 === 0) await nextFrame();
  }
  ctx.site.batch.flush(siteGroup);
  buildPicks(ctx);
  releaseGeometryAfterUpload(scene);
  // 系统回收了 WebGL 上下文（多见于手机切后台）：顶点数据已释放，无法恢复，提示刷新
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (window.__mallFail) window.__mallFail('显示资源被系统回收了', '手机切到后台较久时会这样，刷新页面即可恢复。');
  });

  // ---------- 状态与视图 ----------
  const state = { building: null, focus: null, exploded: false, flows: false, labels: !MOBILE, night: false, selected: null, touring: false, explore: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));
  const highlight = makeHighlight(scene);
  const residenceCache = new Map();
  const detailErrors = new Map();
  let detailPanel = null, detailMessage = null, detailRetry = null;
  function syncDetailStatus() {
    if (fps) return;
    const id = activeDetailFloor(state), kind = detailAssetKind(ctx.lvById[id]);
    const resource = detailResources[kind];
    if (!resource || residenceCache.has(id)) {
      if (detailPanel) detailPanel.hidden = true;
      return;
    }
    if (!detailPanel) {
      detailPanel = document.createElement('aside'); detailPanel.id = 'residenceLoadStatus';
      detailPanel.setAttribute('role', 'status'); detailPanel.setAttribute('aria-live', 'polite');
      detailPanel.style.cssText = 'position:fixed;z-index:18;left:50%;top:calc(60px + env(safe-area-inset-top,0px));transform:translateX(-50%);width:min(360px,calc(100vw - 28px));box-sizing:border-box;padding:12px 15px;border:1px solid #ffffff66;border-radius:15px;background:#173442ed;color:#fff;font:13px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 24px #0003';
      detailMessage = document.createElement('span'); detailMessage.style.display = 'block';
      detailRetry = document.createElement('button'); detailRetry.type = 'button'; detailRetry.textContent = '重试加载';
      detailRetry.style.cssText = 'min-height:44px;margin-top:8px;padding:8px 16px;border:1px solid #bcd7db;border-radius:10px;color:#173442;background:#e8f2ed;font:inherit;cursor:pointer';
      detailRetry.addEventListener('click', () => {
        const floor = activeDetailFloor(state), type = detailAssetKind(ctx.lvById[floor]);
        if (!type) return;
        detailErrors.delete(floor);
        if (detailResources[type].status === 'error') requestDetailResource(type, true);
        else ensureTowerFloor(floor);
        syncDetailStatus();
      });
      detailPanel.append(detailMessage, detailRetry);
      (document.getElementById('app') || document.body).append(detailPanel);
    }
    const failed = resource.status === 'error' || detailErrors.has(id);
    const name = ctx.lvById[id]?.name || id;
    detailMessage.textContent = failed ? `${name} 的房间细节暂未载入，请重试。园区仍可继续浏览。`
      : `${name} · ${kind === 'residential' ? residentialProgress || '正在载入 01 / 02 / 03 完整户型' : '正在载入套房家具与材质'}。首次进入需要片刻。`;
    detailRetry.hidden = !failed;
    detailPanel.hidden = false;
  }
  function requestDetailResource(kind, retry = false) {
    const resource = detailResources[kind];
    if (!resource || resource.status === 'loading' || resource.status === 'ready' || (resource.status === 'error' && !retry)) return;
    resource.request({ retry }).then(() => {
      // applyVisibility resolves the current destination again. A stale request
      // never builds or reactivates the floor that originally started it.
      applyVisibility(); emit();
    }).catch(error => {
      console.error('Room detail loading failed', error);
      syncDetailStatus();
    });
    syncDetailStatus();
  }
  const resolveExploreVisibility = createExploreVisibility(layout);
  let visibleExploreLevels = new Set();
  ctx.dynamic.push({ name: 'suite-floor-visibility', update(dt, elapsed, app) {
    for (const result of residenceCache.values()) result.update?.(app);
  } });
  function ensureTowerFloor(id) {
    const L = ctx.levels[id];
    if (!L || ctx.bById[L.building]?.kind !== 'tower' || !L.lv.units.some(u => u.residence)) return;
    const kind = detailAssetKind(L.lv), resource = detailResources[kind];
    if (resource && resource.status !== 'ready') { requestDetailResource(kind); return; }
    if (detailErrors.has(id)) return;
    if (!residenceCache.has(id)) {
      try {
        const result = buildResidenceFloor(ctx, L);
        L.base.add(result.group);
        residenceCache.set(id, result);
      } catch (error) {
        detailErrors.set(id, error); console.error('Room detail construction failed', error);
        syncDetailStatus(); return;
      }
    } else {
      const cached = residenceCache.get(id); residenceCache.delete(id); residenceCache.set(id, cached);
    }
    // 最多保留三个访问楼层，进入任意楼层仍可完整加载该层全部房间。
    for (const [key, result] of residenceCache) {
      if (residenceCache.size <= 3) break;
      if (key === id) continue;
      result.group.removeFromParent(); result.dispose(); residenceCache.delete(key);
    }
  }
  function towerVisibility(B, explore = null) {
    const selected = state.building === B.b.id;
    const inside = explore?.building === B.b.id;
    const focus = selected && state.focus;
    const wanted = explore ? inside ? explore.level : explore.near === B.b.id ? `${B.b.id}-1F` : null
      : selected ? focus || `${B.b.id}-1F` : null;
    if (wanted) ensureTowerFloor(wanted);
    setResidentialDetailLevel(ctx, B.b.id, residenceCache.has(wanted) ? wanted : null);
    const selectedLevel = ctx.levels[focus]?.lv;
    setHospitalityCut(ctx, B.b.id, !explore && selectedLevel && selectedLevel.kind !== 'roof' ? selectedLevel.elev + 0.05 : Infinity);
    if (B.exterior) B.exterior.visible = true;
    for (const L of B.levels) {
      const active = L.lv.id === wanted || (!!explore && visibleExploreLevels.has(L.lv.id) && L.lv.elev <= 0);
      const common = (!explore && !focus && (L.lv.short === '1F' || L.lv.kind === 'roof'))
        || (!!explore && !explore.under && L.lv.kind === 'roof');
      L.group.visible = active || common;
      L.base.visible = active || common;
      L.shell.visible = active; L.facade.visible = active;
      L.labels.visible = active && state.labels && !explore;
      L.people.visible = active; L.flows.visible = active && state.flows;
      L.offset = L.offsetTarget = 0; L.group.position.y = 0;
    }
    for (const car of ctx.elevatorCars?.values() || []) if (car.elevator.building === B.b.id) {
      car.group.visible = !selectedLevel || !!explore || car.group.position.y <= selectedLevel.elev + 0.1;
    }
  }

  function connectionVisibility() {
    const ex = state.explore;
    const lv = ctx.lvById[ex ? ex.level : state.focus];
    const under = ex ? ex.under : !!lv && lv.elev < 0;
    const elevation = lv?.elev ?? camera.position.y - 1.62;
    if (ctx.hospitality?.connections) ctx.hospitality.connections.visible = !!ex || !under;
    for (const record of ctx.hospitality?.underground || []) {
      const path = record.paths?.[0] || record.path;
      const y = path?.points?.[0]?.[1];
      record.group.visible = ex
        ? (record.paths || [record.path]).some(p => visibleExploreLevels.has(p?.level)
          || visibleExploreLevels.has(p?.from) || visibleExploreLevels.has(p?.to))
        : !!under && Math.abs(y - elevation) < 0.6;
    }
  }

  /**
   * 第一人称漫游：人所在的楼完整显示（不剖切），在地面以上时车库层看不到、不画；
   * 室外时附近那栋楼只显示地上各层的室内（透过玻璃能看到）；在地铁或相连地下层时显示地铁。
   */
  function applyExploreVisibility() {
    const ex = state.explore;
    visibleExploreLevels = resolveExploreVisibility(ex);
    for (const B of Object.values(ctx.buildings)) {
      if (B.b.kind === 'tower') { towerVisibility(B, ex); continue; }
      const metro = B.b.kind === 'metro';
      const inside = B.b.id === ex.building || (metro && ex.metro);
      const peek = B.b.id === ex.near;
      for (const L of B.levels) {
        const lv = L.lv;
        const connected = visibleExploreLevels.has(lv.id);
        L.group.visible = B.b.undergroundOnly ? connected || lv.elev >= 0 : metro ? inside || connected || lv.short === 'B1' : true;
        L.base.visible = (inside && (ex.under || lv.kind !== 'parking')) || (peek && lv.elev >= 0)
          || connected || lv.kind === 'roof' || (B.b.kind === 'street' && lv.elev >= 0);
        L.facade.visible = !metro;
        L.shell.visible = true;
        L.people.visible = L.base.visible;
        L.labels.visible = false;
        if (L.title) L.title.visible = false;
        L.flows.visible = false;
        L.offsetTarget = 0;
      }
    }
    siteGroup.visible = true;
    ctx.site.labels.visible = false;
    if (ctx.site.flows) ctx.site.flows.visible = false;
    connectionVisibility();
    highlight.show(null, ctx);
    renderer.shadowMap.needsUpdate = true;
  }

  function applyVisibility() {
    if (state.explore) { applyExploreVisibility(); syncDetailStatus(); return; }
    const focusLv0 = state.focus ? ctx.lvById[state.focus] : null;
    // 聚焦某期与站厅同高的地下层（一期 B1M、二期 B1、三期 B1）时，一并显示相连的地铁站厅与通道
    const metroLink = !!focusLv0 && focusLv0.elev < 0 && ctx.bById[focusLv0.building].kind !== 'metro' && Math.abs(focusLv0.elev + 4.5) < 0.5;
    for (const B of Object.values(ctx.buildings)) {
      if (B.b.kind === 'tower') { towerVisibility(B); continue; }
      const sel = state.building === B.b.id;
      const fi = sel && state.focus ? B.levels.findIndex((L) => L.lv.id === state.focus) : B.levels.length;
      for (const L of B.levels) {
        const id = L.lv.id;
        const exterior = !sel;
        if (state.exploded) {
          L.group.visible = sel;
          L.base.visible = sel;
          L.facade.visible = false;
        } else if (sel) {
          L.group.visible = L.index <= fi;
          L.base.visible = true;
          L.facade.visible = !state.focus || L.index < fi;
        } else if (B.b.undergroundOnly) {
          // A public garage may sit below a park: it has no above-ground mass.
          L.group.visible = L.lv.elev >= 0 || (!!focusLv0 && focusLv0.elev < 0 && L.lv.elev <= focusLv0.elev + .1);
          L.base.visible = L.group.visible;
          L.facade.visible = false;
        } else if (B.b.kind === 'metro') {
          // 地铁未选中：只显示地面出入口（shell 组）；与所聚焦地下层相连时显示站厅层
          const link = metroLink && L.lv.short === 'B1';
          L.group.visible = L.lv.short === 'B1';
          L.base.visible = link;
          L.facade.visible = false;
        } else {
          L.group.visible = true;
          L.base.visible = L.lv.kind === 'roof' || (B.b.kind === 'street' && L.lv.elev >= 0);
          L.facade.visible = true;
        }
        // 爆炸视图里街区的 1F 室外铺装让开，露出下面的地库
        L.shell.visible = !(state.exploded && B.b.kind === 'street' && L.lv.ground);
        L.people.visible = L.base.visible;
        L.labels.visible = state.labels && !state.touring && !state.exploded && state.focus === id;
        if (L.title) L.title.visible = state.exploded && sel && state.labels && !state.touring;
        L.flows.visible = state.flows && !exterior && (state.focus ? id === state.focus : state.exploded || L.lv.kind === 'roof');
        L.offsetTarget = state.exploded && sel ? L.index * EXPLODE_GAP : 0;
      }
    }
    const focusLv = focusLv0;
    // 地铁选中时撤去地面，露出站厅、通道与站台
    siteGroup.visible = !state.exploded && (!focusLv || focusLv.elev >= 0) && ctx.bById[state.building]?.kind !== 'metro' && (!ctx.bById[state.building]?.undergroundOnly || focusLv?.elev >= 0);
    ctx.site.labels.visible = state.labels && !state.touring && !state.focus && !state.exploded;
    if (ctx.site.flows) ctx.site.flows.visible = state.flows && !state.focus && !state.exploded;
    connectionVisibility();
    const sel = state.selected && findUnit(state.selected);
    highlight.show(sel && ctx.levels[sel.level].group.visible ? sel : null, ctx);
    renderer.shadowMap.needsUpdate = true;
    syncDetailStatus();
  }
  function findUnit(id) {
    for (const lv of layout.levels) {
      const u = lv.units.find((x) => x.id === id);
      if (u) return u;
    }
    return null;
  }

  // ---------- 相机飞行与阴影范围 ----------
  let flight = null;
  function flyTo(position, target, duration = 1.4, shadowRadius = null) {
    const p1 = position.clone();
    if (camera.aspect < 1) p1.sub(target).multiplyScalar(1.22).add(target);
    flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1: target.clone(), time: 0, duration };
    env.setShadowFocus(target, shadowRadius ?? Math.min(340, Math.max(90, p1.distanceTo(target) * 0.6)));
  }
  // 用户一开始拖动 / 缩放就交还控制权：取消正在进行的镜头飞行（慢设备上飞行会持续数秒，期间拖不动）
  controls.addEventListener('start', () => { flight = null; });
  const bCenter = (b, y = 8) => V(b.center[0], y, b.center[1]);
  function buildingView(bid) {
    const b = ctx.bById[bid];
    if (b.kind === 'tower') {
      const height = Math.max(...ctx.buildings[bid].levels.map(L => L.lv.elev + L.lv.height));
      const c = bCenter(b, height * 0.42);
      return [c.clone().add(V(0.7, 0.38, 1).normalize().multiplyScalar(Math.max(b.radius * 2.8, height * 1.8))), c, Math.max(height, b.radius)];
    }
    const c = bCenter(b, b.kind === 'metro' ? -6 : 10);
    return [c.clone().add(V(0.5, 0.66, 0.62).normalize().multiplyScalar(b.radius * 2.25)), c, b.radius * 1.25];
  }
  function explodedView(bid) {
    const b = ctx.bById[bid];
    const n = ctx.buildings[bid].levels.length;
    const c = bCenter(b, b.kind === 'metro' ? -2 : (n * EXPLODE_GAP) / 2 + 4);
    return [c.clone().add(V(0.55, 0.5, 0.68).normalize().multiplyScalar(b.radius * 2.6)), c, b.radius * 1.3];
  }
  function levelView(id) {
    const L = ctx.levels[id];
    const b = ctx.bById[L.building];
    const y = L.lv.elev + (state.exploded ? L.offsetTarget : 0);
    const c = bCenter(b, y);
    if (L.lv.kind === 'roof') return [c.clone().add(V(0.45, 0.7, 0.6).normalize().multiplyScalar(b.radius * 1.75)), c.clone().add(V(0, 6, 0)), b.radius * 1.15];
    return [c.clone().add(V(0.3, 0.95, 0.5).normalize().multiplyScalar(b.radius * 2.0)), c, b.radius * 1.15];
  }
  // 竖屏时总览再拉远一些，让四个地块都在画面里（flyTo 自身还会按竖屏放大 1.22 倍）
  const overview = () => {
    if (layout.playable) {
      const r = layout.site.bounds, c = V((r.x0+r.x1)/2, 14, (r.z0+r.z1)/2);
      const size = Math.max(r.x1-r.x0, r.z1-r.z0);
      return [c.clone().add(V(size*.46, size*(camera.aspect<1?1.35:.86), size*.92)), c, size];
    }
    return [OVERVIEW[0].clone().sub(OVERVIEW[1]).multiplyScalar(camera.aspect < 1 ? 1.2 : 1).add(OVERVIEW[1]), OVERVIEW[1], 380];
  };

  const flyView = ([position, target, radius], duration = 1.4) => flyTo(position, target, duration, radius);

  const app = {
    ctx, state, renderer, scene, camera, controls, env, emit,
    get quality() { return qualityManager.current; },
    setQuality(preset) { return qualityManager.select(preset); },
    customizeQuality(patch) { return qualityManager.customize(patch); },
    onQuality(fn) { return qualityManager.subscribe(fn); },
    ensureTowerFloor,
    get residenceCache() { return [...residenceCache.keys()]; },
    get residentialStats() { return { ...ctx.residentialAssets.stats, loadStatus: residentialResource.status }; },
    get detailLoading() { return { suite: suiteResource.status, residential: residentialResource.status,
      floor: activeDetailFloor(state), errors: [...detailErrors.keys()] }; },
    get flying() { return !!flight; },
    cancelFlight() { flight = null; },
    fitFov() { fitFov(); },
    buildingIds: layout.buildings.map((b) => b.id),
    levelsOf: (bid) => ctx.buildings[bid].levels.map((L) => L.lv),
    refresh() { applyVisibility(); },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setBuilding(bid) {
      if (state.touring) app.stopTour();
      state.building = bid || null;
      state.focus = ctx.bById[bid]?.undergroundOnly ? ctx.buildings[bid].levels.find(L => L.lv.short === 'B1').lv.id : null;
      state.exploded = false;
      state.selected = null;
      applyVisibility();
      flyView(state.focus ? levelView(state.focus) : bid ? buildingView(bid) : overview(), 1.6);
      emit();
    },
    viewCity() { app.setBuilding(null); if (!layout.playable) flyTo(V(0, 2450, 1500), V(0, 0, 0), 1.6, 850); },
    setFocus(id) {
      if (state.touring) app.stopTour();
      if (id) state.building = ctx.levels[id].building;
      state.focus = id || (ctx.bById[state.building]?.undergroundOnly ? ctx.buildings[state.building].levels.find(L => L.lv.short === 'B1').lv.id : null);
      if (!id || (state.selected && findUnit(state.selected)?.level !== id)) state.selected = null;
      applyVisibility();
      if (state.focus) flyView(levelView(state.focus));
      else flyView(state.building ? (state.exploded ? explodedView(state.building) : buildingView(state.building)) : overview());
      emit();
    },
    setExploded(on) {
      if (ctx.bById[state.building]?.kind === 'tower') return;
      if (state.touring) app.stopTour();
      if (on && !state.building) state.building = layout.buildings[0].id;
      state.exploded = on;
      state.focus = !on && ctx.bById[state.building]?.undergroundOnly ? ctx.buildings[state.building].levels.find(L => L.lv.short === 'B1').lv.id : null;
      state.selected = null;
      applyVisibility();
      flyView(on ? explodedView(state.building) : state.focus ? levelView(state.focus) : buildingView(state.building), 1.6);
      emit();
    },
    setNight(on) { state.night = on; env.setNight(on); emit(); },
    setFlows(on) { state.flows = on; applyVisibility(); emit(); },
    setLabels(on) { state.labels = on; applyVisibility(); emit(); },
    reset(noFly = false) {
      state.building = null;
      state.focus = null;
      state.exploded = false;
      state.selected = null;
      applyVisibility();
      if (!noFly) flyView(overview());
      emit();
    },
    flyTo,
    /** 飞到某个铺位门口并高亮 */
    focusUnit(unit) {
      if (state.touring) app.stopTour();
      state.exploded = false;
      state.building = unit.building;
      state.focus = unit.level;
      state.selected = unit.id;
      applyVisibility();
      const f = unit.wfronts[0];
      const lv = ctx.lvById[unit.level];
      const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2;
      const target = V(mx - f.nx * 3, lv.elev + 2.2, mz - f.nz * 3);
      const pos = V(mx + f.nx * 16 + f.nz * 7, lv.elev + 12, mz + f.nz * 16 - f.nx * 7);
      flyTo(pos, target, 1.6, 90);
      emit();
    },
    /** 屏幕坐标拾取：返回提示内容 */
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const cands = [];
      for (const B of Object.values(ctx.buildings)) {
        if (state.building !== B.b.id) continue;
        for (const L of B.levels) {
          const ok = state.exploded || (state.focus ? state.focus === L.lv.id : L.lv.kind === 'roof');
          if (ok && L.group.visible) cands.push(...L.picks.children);
        }
      }
      if (!state.focus && !state.exploded) cands.push(...ctx.site.picks.children.filter((m) => m.userData.kind !== 'building' || m.userData.id !== state.building));
      const hit = raycaster.intersectObjects(cands, false)[0];
      if (!hit) return null;
      const d = hit.object.userData;
      if (d.kind === 'unit') {
        const u = d.unit;
        return { unit: u, html: `<b>${esc(u.brand.name)}</b><div class="en">${esc(u.brand.en)}</div><div class="meta">${esc(u.brand.catLabel)} · ${u.code} · ${esc(ctx.bById[u.building].short)} ${esc(ctx.lvById[u.level].name)}</div>` };
      }
      if (d.kind === 'building') return { building: d.id, html: `<b>${esc(d.title)}</b><div class="meta">${esc(d.desc)}</div>` };
      return { html: `<b>${esc(d.title)}</b><div class="meta">${esc(d.desc)}</div>` };
    },
    /** 调试：立即按给定视角渲染一帧并返回 JPEG dataURL（后台标签页也可用） */
    debugShot({ w = 1280, h = 800, pos, target, dt = 0.016, steps: n = 1, shadow = null } = {}) {
      const prev = renderer.getSize(new THREE.Vector2());
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      env.resize(w, h);
      flight = null;
      if (pos) camera.position.set(...pos);
      if (target) controls.target.set(...target);
      if (shadow) env.setShadowFocus(controls.target.clone(), shadow);
      for (const L of Object.values(ctx.levels)) { L.offset = L.offsetTarget; L.group.position.y = L.offset; }
      // 漫游时相机由漫游控制器摆放，OrbitControls 的俯仰限制会把视线掰走
      if (!state.explore) controls.update();
      updateNear();
      for (let i = 0; i < n; i++) {
        env.night = env.target;
        env.apply();
        env.update(dt);
        for (const d of ctx.dynamic) d.update(dt, (elapsed += dt), app);
      }
      renderer.shadowMap.needsUpdate = true;
      if (fps) renderer.info.reset();
      env.render();
      for (const draw of ctx.afterRender) draw();
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

  // 近裁剪面随视距调整：远景时抬高 near，提高深度精度，避免大面积铺装与楼板顶面在远处闪烁
  function updateNear() {
    // 漫游时人离墙至少 0.29m（身体半径），近裁剪面取 0.15m：贴墙不穿帮，远处深度精度也够
    const near = state.explore ? 0.15 : Math.min(4, Math.max(0.3, camera.position.distanceTo(controls.target) / 120));
    if (Math.abs(near - camera.near) > 0.05) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  }

  // ---------- 主循环 ----------
  const clock = new THREE.Clock();
  let elapsed = 0;
  let perfMon = createPerfMonitor(performance.now());
  let lastFrame = -Infinity;
  /** 垂直视场角：俯瞰 42°，第一人称 60°（横屏时横向约 90°）；竖屏时加大，保证横向能放下 */
  function fitFov() {
    const [base, max, k] = state.explore ? [60, 85, 0.35] : [42, 72, 0.62];
    camera.fov = camera.aspect < 1 ? Math.min(max, base / Math.pow(camera.aspect, k)) : base;
    camera.updateProjectionMatrix();
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    fitFov();
    env.resize(w, h);
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);

  qualityManager.subscribe(quality => {
    const shadowsChanged = ctx.quality.shadows !== quality.shadows;
    ctx.quality = quality;
    renderer.setPixelRatio(quality.pixelRatio);
    env.setQuality(quality);
    ctx.peopleQuality?.setDensity(quality.crowdDensity);
    if (shadowsChanged) scene.traverse(o => {
      if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
    });
    perfMon = createPerfMonitor(performance.now());
    lastFrame = -Infinity;
    resize();
  });

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const interval = 1000 / ctx.quality.maxFps;
    if (now - lastFrame < interval - 1) return;
    lastFrame = now - ((now - lastFrame) % interval || 0);
    if (!Number.isFinite(lastFrame)) lastFrame = now;
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
    for (const L of Object.values(ctx.levels)) {
      if (Math.abs(L.offset - L.offsetTarget) > 0.01) {
        L.offset += (L.offsetTarget - L.offset) * Math.min(1, dt * 4);
        L.group.position.y = L.offset;
        moving = true;
      }
    }
    if (moving) renderer.shadowMap.needsUpdate = true;
    if (!state.touring && !state.explore) controls.update();
    updateNear();
    env.update(dt);
    for (const d of ctx.dynamic) d.update(dt, elapsed, app);
    highlight.update(elapsed, ctx);
    if (fps) renderer.info.reset();
    env.render();
    for (const draw of ctx.afterRender) draw();
    // Only automatic mode changes itself; a manual choice remains in effect.
    if (perfMon.tick(now, document.hidden)) qualityManager.degrade();
  });

  applyVisibility();
  if (layout.playable) { const [pos, target] = overview(); camera.position.copy(pos); controls.target.copy(target); controls.update(); }
  resize();
  if (camera.aspect < 1) camera.position.sub(controls.target).multiplyScalar(1.22 * 1.2).add(controls.target);
  env.setShadowFocus(controls.target.clone(), 380);
  return app;
}

/**
 * 静态网格的顶点数据上传显卡后就不再需要留在内存里：七百多万个顶点在手机上会把网页进程撑爆。
 * 拾取盒（不可见材质，只给射线用）例外：渲染器对视锥内的网格不管材质可不可见都会上传顶点，
 * 而射线拾取要读顶点，所以先把它们的几何体排除；实例化矩阵（行人）每帧更新，也跳过。
 */
function releaseGeometryAfterUpload(scene) {
  const drop = function () { this.array = null; };
  const seen = new Set();
  scene.traverse((o) => { if (o.geometry && o.material && o.material.visible === false) seen.add(o.geometry); });
  scene.traverse((o) => {
    const g = o.geometry;
    if (!g || seen.has(g) || !(o.isMesh || o.isLine || o.isPoints)) return;
    seen.add(g);
    g.userData.bufferBytes = Object.values(g.attributes).reduce((n, a) => n + (a.array?.byteLength || 0), g.index?.array?.byteLength || 0);
    // 视锥剔除、透明排序要用的包围体先算好（之后数组就没了，渲染器不能再临时去算）
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingBox) g.computeBoundingBox();
    for (const a of Object.values(g.attributes)) if (a.isBufferAttribute && !a.isInstancedBufferAttribute) a.onUpload(drop);
    if (g.index) g.index.onUpload(drop);
  });
}

/** 在局部坐标系 F 内放一个拾取盒（局部矩形 r，底标高 y0，高 h） */
function pickBox(group, geo, mat, F, r, y0, h, data) {
  const m = new THREE.Mesh(geo, mat);
  const [x, z] = toW(F, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
  m.scale.set(Math.max(0.5, r.x1 - r.x0), h, Math.max(0.5, r.z1 - r.z0));
  m.position.set(x, y0 + h / 2, z);
  m.rotation.y = -F.a;
  m.userData = data;
  group.add(m);
  return m;
}

/** 拾取盒：铺位、设施、扶梯、观光梯、天台打卡点、场地入口、车库、整栋楼 */
function buildPicks(ctx) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const { layout } = ctx;
  const INFO = {
    wc: ['洗手间', '男卫 · 女卫 · 无障碍卫生间 · 母婴室'],
    stair: ['消防楼梯 · 安全出口', '疏散楼梯'],
    core: ['客梯', '2 台客梯 · 全楼直达'],
    equip: ['设备房', '非公共区域'],
    service: ['客服中心', '票务 · 问询 · 失物招领 · 一卡通充值'],
    mech: ['屋顶设备区', '冷却塔 · 空调机组（格栅围挡）'],
  };
  for (const lv of layout.levels) {
    const G = ctx.levels[lv.id].picks;
    const H = lv.kind === 'roof' ? 4.2 : clearHeight(lv);
    for (const u of lv.units) for (const r of u.rects) pickBox(G, geo, mat, u.frame, r, lv.elev, H, { kind: 'unit', unit: u });
    for (const m of lv.rooms) {
      const info = INFO[m.type];
      if (info) for (const r of m.rects) pickBox(G, geo, mat, m.frame, r, lv.elev, H, { kind: 'facility', title: info[0], desc: m.label && m.type === 'equip' ? m.label : info[1] });
    }
    for (const f of lv.features) {
      const t = {
        ferris: ['云澜之眼 摩天轮', '直径 30m · 24 个轿厢 · 天台网红打卡点'],
        ip: ['IP「云宝」', '云澜汇原创形象 · 打卡点'],
        mirror: ['天空之镜', '浅水镜面 · 拍照打卡'],
        skywalk: ['玻璃悬挑观景台', '悬挑 6m 的全玻璃观景台'],
        playground: ['天台儿童乐园', '滑梯 · 秋千 · 攀爬塔'],
        pavilion: ['扶梯玻璃亭', '3F → 天台扶梯出口'],
        pergola: ['花架长廊', '紫藤花架长廊'],
        letters: ['「云澜汇」立体字', '天台打卡点'],
        track: ['星湾天空跑道', '沿屋面一圈的环形跑道 · 三条分道 · 夜间灯带'],
        court: ['屋顶篮球场', '标准全场 · 围网 · 夜间灯光'],
        'cinema-open': ['星空露天影院', '方庭天台 · LED 银幕 · 每晚 20:00 放映'],
        farm: ['屋顶农场', '方庭天台 · 种植池 · 玻璃温室 · 亲子采摘'],
        viewdeck: ['方庭观景台', '抬高木平台 · 望远镜 · 俯瞰园区'],
        plaza: ['云澜里中心广场', '街区舞台 · 旱喷水景 · 周末市集'],
        stage: ['街区舞台', '每周五 19:30 街区音乐节 · LED 背景屏'],
        fountain: ['旱喷水景', '16 组喷头 · 夜间灯光'],
        grove: ['梧桐小广场', '树阵 · 环形座椅'],
      }[f.type];
      if (!t) continue;
      if (!f.frame) {
        const r = f.r || Math.max(f.w || 6, f.d || 6) / 2;
        pickBox(G, geo, mat, IDENTITY, { x0: f.x - r, x1: f.x + r, z0: f.z - r, z1: f.z + r }, lv.elev, f.type === 'stage' ? 7 : 2, { kind: 'facility', title: t[0], desc: t[1] });
        continue;
      }
      if (f.rect) pickBox(G, geo, mat, f.frame, f.rect, lv.elev, f.type === 'pavilion' ? 4.6 : 2.5, { kind: 'facility', title: t[0], desc: t[1] });
      else if (f.type === 'ferris') pickBox(G, geo, mat, f.frame, { x0: f.lu - f.radius, x1: f.lu + f.radius, z0: f.lv - 3, z1: f.lv + 3 }, lv.elev, f.radius * 2 + 4, { kind: 'facility', title: t[0], desc: t[1] });
      else pickBox(G, geo, mat, f.frame, { x0: f.lu - 3, x1: f.lu + 3, z0: f.lv - 3, z1: f.lv + 3 }, lv.elev, 7, { kind: 'facility', title: t[0], desc: t[1] });
    }
  }
  for (const e of layout.escalators) {
    const lo = ctx.lvById[e.from], hi = ctx.lvById[e.to];
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const F = frame(e.bottom.x, e.bottom.z, (Math.atan2(e.top.z - e.bottom.z, e.top.x - e.bottom.x) * 180) / Math.PI);
    pickBox(ctx.levels[e.from].picks, geo, mat, F, { x0: -0.9, x1: run + 0.9, z0: -0.95, z1: 0.95 }, e.bottom.y, e.top.y - e.bottom.y + 1,
      { kind: 'facility', title: `扶梯 ${e.dir === 'up' ? '上行' : '下行'}`, desc: `${lo.name} ↔ ${hi.name} · 坡度 30°` });
  }
  for (const g of layout.elevators.filter((x) => x.building === 'M')) {
    for (const id of g.serves) {
      const lv = ctx.lvById[id];
      pickBox(ctx.levels[id].picks, geo, mat, g.frame, { x0: g.lu - 1.6, x1: g.lu + 1.6, z0: g.lv - 1.4, z1: g.lv + 1.4 }, lv.elev, clearHeight(lv),
        { kind: 'facility', title: '无障碍电梯', desc: '站厅 ↔ 站台 · 玻璃井道' });
    }
  }
  for (const g of layout.elevators.filter((x) => x.type === 'glass')) {
    for (const id of g.serves) {
      const lv = ctx.lvById[id];
      pickBox(ctx.levels[id].picks, geo, mat, g.frame, { x0: g.lu - 1.3, x1: g.lu + 1.3, z0: g.lv - 1.3, z1: g.lv + 1.3 }, lv.elev, lv.height,
        { kind: 'facility', title: '中庭观光电梯', desc: `停靠 ${g.serves.map((s) => ctx.lvById[s].short).join(' · ')}` });
    }
  }
  for (const e of layout.entrances.filter((x) => x.to === 'site')) {
    // 地铁出入口：整个雨棚可点击，进入地铁站
    if (e.kiosk) {
      const r = { x0: -0.5, x1: 12, z0: -3.5, z1: 3.5 };
      pickBox(ctx.site.picks, geo, mat, e.kiosk.frame, r, 0, 3.4, { kind: 'building', id: e.building, title: e.name, desc: '地铁 7 号线 · 云澜汇站 · 楼梯 + 上行扶梯 · 点击进入站厅' });
      continue;
    }
    const F = frame((e.seg.x0 + e.seg.x1) / 2, (e.seg.z0 + e.seg.z1) / 2, (Math.atan2(e.nz, e.nx) * 180) / Math.PI);
    pickBox(ctx.site.picks, geo, mat, F, { x0: 0, x1: 7, z0: -e.width / 2 - 2, z1: e.width / 2 + 2 }, 0, 5,
      { kind: 'facility', title: e.name, desc: e.main ? `${ctx.bById[e.building].name} · 主入口` : `${ctx.bById[e.building].name} · 人行入口` });
  }
  for (const r of layout.ramps.filter((x) => x.type.startsWith('street'))) {
    pickBox(ctx.site.picks, geo, mat, r.frame, r.lane, -2, 4, { kind: 'facility', title: r.name, desc: r.type === 'street-in' ? '15% 坡道下至 B1' : '由 B1 上行驶出' });
  }
  // 整栋楼：园区视角点击进入该期（街区按各楼栋体量 + 街巷地面拾取，避免挡住上空的天桥）
  for (const b of layout.buildings) {
    if (b.kind === 'metro' || b.undergroundOnly) continue;
    const top = Math.max(...layout.levels.filter((l) => l.building === b.id).map((l) => l.elev));
    const vols = b.kind === 'street' ? [...b.blocks.map((k) => [k.poly, k.top + 1]), [b.outline, 0.6]] : [[b.outline, top + 2]];
    for (const [poly, h] of vols) {
      const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.userData = { kind: 'building', id: b.id, title: b.name, desc: '点击进入这一期' };
      ctx.site.picks.add(m);
    }
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
      const L = ctx.levels[unit.level];
      const H = L.lv.kind === 'roof' ? 4.2 : clearHeight(L.lv);
      const F = unit.frame;
      for (const r of unit.rects) {
        const [x, z] = toW(F, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
        const box = new THREE.BoxGeometry(r.x1 - r.x0, H, r.z1 - r.z0);
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(box), mat);
        lines.position.set(x, L.lv.elev + H / 2, z);
        lines.rotation.y = -F.a;
        lines.renderOrder = 30;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2), fill);
        floor.position.set(x, L.lv.elev + 0.06, z);
        floor.rotation.y = -F.a;
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
