// 应用主体：渲染器、相机、楼栋 → 楼层分组、构建流程、状态（楼栋 / 楼层 / 爆炸 / 昼夜 / 动线 / 标注）、拾取高亮与主循环。
// 每层分组：base（室内）、shell（楼板）、facade（外立面）、labels、flows、people、picks。
// 园区视角只显示各层 shell + facade（屋面层与街区显示完整内容）；选中某期才显示其室内。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MaterialLib } from './materials.js';
import { Environment } from './env.js';
import { BatchSet, SignBatch, usePropLibrary } from './batch.js';
import { createPropLibrary } from './props/library.js';
import { floorGuard } from '../layout/access-zones.js';
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
import { buildRefugeFloor } from './build/refuge-floor.js';
import { loadSuiteAsset } from './suite-asset.js';
import { SUITE_MODEL_URL } from './suite-data.js';
import { createSuiteLighting } from './suite-lighting.js';
import { loadResidentialAssets } from './residential-asset.js';
import { createResidentialLighting } from './residential-lighting.js';
import { createIndoorLighting } from './indoor-lighting.js';
import { toW, frame, IDENTITY } from '../layout/geom.js';
import { riverPicks } from './build/river.js';
import { declutterLabels, towerOccluders } from './label-declutter.js';
import { unitFront } from '../layout/nav.js';
import { createExploreVisibility, skyLobbyVisibility } from './explore-visibility.js';
import { buildTransitCenter } from './build/transit-center.js';
import { buildBusStops } from './build/bus-stops.js';
import { buildArcadeMassing } from './build/arcade-massing.js';
import { createDeferredResource, createSerialTaskQueue, detailAssetKind, activeDetailFloor } from './deferred-resource.js';
import { createFloorDetailSelector, createFloorDetailCache } from './floor-detail-streaming.js';
import { buildOwnedFloorDetail, sceneResources, geometryStats } from './floor-detail-scene.js';
import { buildP1ExpansionExterior, buildP1ExpansionLevel, usesExpansionFacade } from './build/p1-expansion.js';
import { buildP1Fidelity } from './build/p1-fidelity.js';
import { buildAccessGates, gatePickInfo } from './build/access-gates.js';
import { buildResidentialCores } from './build/residential-cores.js';

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
// (e) Overview shadow radius (SPEC §0.8-6, perf.md §4.6): 410 also covers W1 at x ≈ −458, which 380 missed.
export const OVERVIEW_SHADOW = 410;

/**
 * 套房和塔楼住宅模型里该是亮面的几种材质（木地板、洞石、石材台面）在「HDR 光影」下的粗糙度。
 * 按材质名登记到材质库，开关 HDR 时跟着切换；模型文件本身不改。
 */
const MODEL_FINISH = Object.freeze({ floor: 0.36, trav: 0.3, oak: 0.5, 'Yunlan oak': 0.72, 'Yunlan stone': 0.55 });
function glossFinish(mats, materials) {
  for (const material of materials || []) if (MODEL_FINISH[material.name] != null) mats.finish(material, MODEL_FINISH[material.name]);
}

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
  // 贴图清晰度：standard 是 8 倍各向异性过滤（原来的做法），high 用到显卡支持的上限（最多 16 倍），斜着看地面和墙面更清楚
  const anisotropyFor = (level) => Math.min(level === 'high' ? 16 : 8, renderer.capabilities.getMaxAnisotropy());
  setAnisotropy(anisotropyFor(initialQuality.textures));

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
  const surfaces = await loadSurfaceTextures(anisotropyFor(initialQuality.textures));
  const mats = new MaterialLib(surfaces, { depthCues: !fps });
  const env = new Environment(renderer, scene, camera, mats, initialQuality);
  const root = new THREE.Group();
  scene.add(root);

  // 贴图小模型（家具、绿植、摆件）。FPS 不用：它的地图和开场流程保持原样。
  let props = fps ? null : createPropLibrary({ mats, anisotropy: renderer.capabilities.getMaxAnisotropy(), tier: initialQuality.detail,
    onChange: () => { renderer.shadowMap.needsUpdate = true; } });
  if (props) {
    onProgress('加载家具、绿植与摆件模型', 0.01);
    try { await props.warm(); } catch (error) { console.warn('贴图模型包没有加载成功，改用程序化家具。', error); props = null; }
  }
  usePropLibrary(props);

  // depthCues：贴地假阴影、天花分格这些增加立体感的细节。完整园区和小游戏有；FPS 没有，画面保持原样。
  const ctx = { layout, mats, scene, root, renderer, camera, levels: {}, buildings: {}, atlas: {}, dynamic: [], afterRender: [], site: null, quality: initialQuality, props, depthCues: !fps };
  const detailQueue = createSerialTaskQueue();
  const assetAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let residentialProgress = '';
  ctx.suiteAsset = null;
  const suiteResource = createDeferredResource(async () => {
    ctx.suiteAsset = await loadSuiteAsset(SUITE_MODEL_URL, assetAnisotropy);
    glossFinish(mats, ctx.suiteAsset.materials);
    return ctx.suiteAsset;
  }, detailQueue);
  // FPS keeps its compact-map startup contract. The complete tour only parses
  // interiors on a first room-floor visit, not alongside every campus builder.
  if (fps) {
    onProgress('载入你的套房家具、材质与灯具', .015);
    await suiteResource.request();
  }
  ctx.suiteLighting = createSuiteLighting(ctx);
  // 室内灯光（商场走道、社区住宅）：FPS 不用
  if (!fps) ctx.indoorLighting = createIndoorLighting(ctx);
  ctx.residentialAssets = { stats: { models: 0, templates: 0 }, templates: new Map() };
  ctx.residentialLighting = null;
  const residentialResource = createDeferredResource(async () => {
    const assets = await loadResidentialAssets((await import('./residential-data.js')).RESIDENTIAL_ASSETS,
      assetAnisotropy, unit => { residentialProgress = `正在展开 ${unit} 户型家具与材质`; syncDetailStatus(); });
    ctx.residentialAssets = assets;
    glossFinish(mats, assets.materials);
    ctx.residentialLighting = createResidentialLighting(ctx);
    return assets;
  }, detailQueue);
  const detailResources = { suite: suiteResource, residential: residentialResource };
  ctx.lvById = Object.fromEntries(layout.levels.map((l) => [l.id, l]));
  ctx.bById = Object.fromEntries(layout.buildings.map((b) => [b.id, b]));
  const floorSelector = fps ? null : createFloorDetailSelector(layout, { limit: MOBILE ? 4 : 6, explodedLimit: MOBILE ? 4 : 8 });
  const lazyAtlasLevels = new Set(layout.levels.filter(l => floorSelector?.eligible.has(l.id)
    && (ctx.bById[l.building].kind === 'annex' || usesExpansionFacade(l))).map(l => l.id));
  const wayfindingEntries = WAYFINDING.map(w => ({ id: w.id,
    draw: (g, x, y, cw, ch) => drawWayfinding(g, x, y, cw, ch, w.kind, w.text, w.bg) }));
  // 北苑住户通道、大堂与地库电梯厅导视（只加在设住户门禁的一期楼层）
  const residentSigns = (lv) => (lv.residentsLobbies || []).flatMap(({ building }) => {
    const n = building.slice(1), sign = (kind, text) => ({ id: `res-${building}-${kind}`,
      draw: (g, x, y, cw, ch) => drawWayfinding(g, x, y, cw, ch, 'lift', text, '#3b3226') });
    return lv.elev < 0 ? [sign('garage', `北苑 ${n} 号楼 · 住户电梯厅 · 刷卡进入`)]
      : [sign('mall', '云澜·北苑 住户通道 · RESIDENTS'), sign('lobby', `北苑 ${n} 号楼 · 住户大堂`), sign('name', `云澜·北苑 ${n} 号楼`)];
  }).concat((lv.residentsLobbies || []).length ? [['private-w', '住户电梯 W'], ['fire', '消防电梯'], ['private-e', '住户电梯 E']].map(([role, text]) => ({ id: `res-lift-${role}`,
    draw: (g, x, y, cw, ch) => drawWayfinding(g, x, y, cw, ch, 'lift', text, role === 'fire' ? '#7a2c1c' : '#3b3226') })) : [])
    // 一期天台 → 北苑 7F 空中大堂（与天台同层）：立杆双面箭头牌与方庭雨棚北柱上的一对牌（square.js skySigns）
    .concat(lv.skySigns?.length ? [['res-sky-l', '← 云澜·北苑 空中大堂'], ['res-sky-r', '云澜·北苑 空中大堂 →'], ['res-sky-u', '↑ 云澜·北苑 空中大堂'],
      ['res-sky-pair-s', '← 1 号楼 · 北苑空中大堂 · 2 号楼 →'], ['res-sky-pair-n', '← 2 号楼 · 北苑空中大堂 · 1 号楼 →']].map(([id, text]) => ({ id,
      draw: (g, x, y, cw, ch) => drawWayfinding(g, x, y, cw, ch, 'lift', text, '#3b3226') })) : []);
  const makeFloorAtlas = (lv, materials = mats) => {
    const atlas = makeSignAtlas([...lv.units.map(u => ({ id: u.id, brand: u.brand })), ...wayfindingEntries, ...residentSigns(lv)]);
    atlas.material = materials.sign(atlas.texture);
    return atlas;
  };
  // Custom expansion façades need only shared exit/elevator signs. Their large
  // brand atlas belongs to the interior and is freed when that floor is evicted.
  let sharedWayfindingAtlas = null;
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
      // (c) Static matrices (SPEC §2.2 app.js hooks): the sub-groups never move; the level group moves only in the
      // exploded view, and syncLevelMatrices() re-derives its matrix when its offset changes.
      for (const q of parts) q.matrixAutoUpdate = false;
      group.matrixAutoUpdate = false;
      bg.add(group);
      // 高层房号按当前楼层生成，避免为160层常驻数百张招牌图集。
      if (lazyAtlasLevels.has(lv.id) && !sharedWayfindingAtlas) {
        sharedWayfindingAtlas = makeSignAtlas(wayfindingEntries);
        sharedWayfindingAtlas.material = mats.sign(sharedWayfindingAtlas.texture);
      }
      const atlas = b.kind === 'tower' ? null : lazyAtlasLevels.has(lv.id) ? sharedWayfindingAtlas : makeFloorAtlas(lv);
      ctx.atlas[lv.id] = atlas;
      const L = {
        lv, index, building: b.id, group, base, shell, facade, labels, flows, people, picks,
        batch: new BatchSet(mats.base), shellBatch: new BatchSet(mats.base), facadeBatch: new BatchSet(mats.base),
        signs: b.kind === 'tower' ? null : new SignBatch(), facadeSigns: b.kind === 'tower' ? null : new SignBatch(),
        offset: 0, offsetTarget: 0, title: null,
      };
      L.batch.outdoor = lv.kind === 'roof' || (lv.kind === 'street' && !!lv.ground);
      L.batch.floorY = lv.elev;
      // 这一层摆东西的约束（留出店门、扶梯口、电梯门、出入口；要在楼板上；不被墙穿过）。FPS 不设，保持原样。
      if (!fps && b.kind !== 'tower') L.batch.guard = floorGuard(layout, lv);
      // 退台和屋面的外摆桌椅画在楼板那一批里：同样要守摆放约束，而且是露天的
      L.shellBatch.guard = L.batch.guard; L.shellBatch.floorY = lv.elev; L.shellBatch.outdoor = true;
      ctx.levels[lv.id] = L;
      B.levels.push(L);
    });
  }
  /** Level groups have static matrices: re-derive one only when its exploded-view offset moved it. */
  const syncLevelMatrices = () => {
    for (const L of Object.values(ctx.levels)) if (L.group.position.y !== L.matrixY) { L.group.updateMatrix(); L.matrixY = L.group.position.y; }
  };
  const siteGroup = new THREE.Group();
  siteGroup.name = 'site';
  root.add(siteGroup);
  ctx.site = { group: siteGroup, batch: new BatchSet(mats.base), labels: new THREE.Group(), picks: new THREE.Group(), flows: null };
  ctx.site.batch.outdoor = true;
  siteGroup.add(ctx.site.labels, ctx.site.picks);
  // Orbit-view labels: drop the ones behind a tower and keep one per overlap (re-run only when the view changes).
  const labelOccluders = towerOccluders(layout);
  let labelView = '';
  ctx.dynamic.push({ name: 'site-label-declutter', update() {
    if (!ctx.site.labels.visible) { labelView = ''; return; }
    const key = `${camera.position.toArray().map((n) => n.toFixed(1))}|${controls.target.toArray().map((n) => n.toFixed(1))}|${camera.aspect.toFixed(3)}|${camera.fov}`;
    if (key === labelView) return;
    labelView = key;
    declutterLabels(ctx.site.labels.children.filter((s) => s.isSprite), camera, labelOccluders, { reach: Math.max(500, 4 * camera.position.distanceTo(controls.target)) });
  } });

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
  const eagerLevels = legacyLayout.levels.filter(l => !floorSelector?.eligible.has(l.id));
  const eagerLevelIds = new Set(eagerLevels.map(l => l.id));
  const eagerCtx = { ...legacyCtx, layout: { ...legacyLayout, levels: eagerLevels },
    buildings: Object.fromEntries(Object.entries(ctx.buildings).map(([id, B]) => [id,
      { ...B, levels: B.levels.filter(L => eagerLevelIds.has(L.lv.id)) }])) };
  const deferredBuilders = new Set([buildWalls, buildStorefronts, buildInteriors]);
  for (let i = 0; i < steps.length; i++) {
    if (layout.playable && steps[i][1] === buildTraffic) continue;
    if (fps && [buildPeople, buildTraffic, buildFlows, buildLabels].includes(steps[i][1])) continue;
    onProgress(steps[i][0], i / steps.length);
    await nextFrame();
    const builder = steps[i][1];
    const currentCtx = builder === buildSite ? ctx : floorSelector && deferredBuilders.has(builder) ? eagerCtx : legacyCtx;
    if (floorSelector && builder === buildPublic) {
      buildPublic(legacyCtx, { details: false });
      buildPublic(eagerCtx, { art: false });
    } else await builder(currentCtx);
    // 构建器注册的动态接口（outlineEdges、metroSync等）回传给完整场景。
    if (currentCtx === legacyCtx) for (const key of ['outlineEdges', 'metroSync', 'metroServices', 'bridgeGroup', 'paths', 'ferris', 'carGeo', 'carMat', 'peopleQuality', 'mallStairStats']) if (legacyCtx[key]) ctx[key] = legacyCtx[key];
  }
  buildP1ExpansionExterior(ctx);
  buildP1Fidelity(ctx);
  for (const lv of legacyLayout.levels) if (!floorSelector?.eligible.has(lv.id)) buildP1ExpansionLevel(ctx, lv);
  onProgress('建造云澜汇酒店、公寓与住宅', 0.96);
  await nextFrame();
  buildHospitality(ctx);
  // 北苑：一期内的住户核心筒、大堂与刷卡门禁（常驻，不随楼层细节流式加载）
  buildResidentialCores(ctx);
  buildAccessGates(ctx);
  buildTransitCenter(ctx);
  buildBusStops(ctx);
  // 小游戏版：被裁掉的二期、三期原地放低细节体块
  if (layout.arcade) buildArcadeMassing(ctx);
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
  // 开场用到的模型都解析完、补进场景后再继续，免得家具一件件冒出来
  if (props) {
    onProgress('摆放家具与绿植', 0.99); await props.idle();
    // 按相机距离切换精细版 / 简化版 / 不画
    ctx.dynamic.push({ name: 'props-lod', update() { props.update(camera); } });
  }
  releaseGeometryAfterUpload(scene);
  // 系统回收了 WebGL 上下文（多见于手机切后台）：顶点数据已释放，无法恢复，提示刷新
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (window.__mallFail) window.__mallFail('显示资源被系统回收了', '手机切到后台较久时会这样，刷新页面即可恢复。');
  });

  // ---------- 状态与视图 ----------
  const state = { building: null, focus: null, exploded: false, flows: false, labels: !MOBILE, night: false, selected: null, touring: false, explore: null };
  const persistentResources = sceneResources([root]);
  const persistentGeometry = geometryStats(persistentResources.geometries);
  const floorCache = floorSelector ? createFloorDetailCache({ limit: MOBILE ? 4 : 6, hardLimit: MOBILE ? 4 : 8,
    build: id => buildOwnedFloorDetail(ctx, ctx.levels[id], {
      protectedResources: persistentResources, release: releaseGeometryAfterUpload,
      atlas: lazyAtlasLevels.has(id) ? materials => makeFloorAtlas(ctx.lvById[id], materials) : null,
      build(local, lv) {
        buildWalls(local); buildStorefronts(local); buildInteriors(local);
        buildPublic(local, { art: false }); buildP1ExpansionLevel(local, lv);
      },
    }),
    onError: (error, id) => console.error(`Floor interior construction failed: ${id}`, error),
  }) : null;
  let detailPosition = null;
  if (floorCache) ctx.dynamic.push({ name: 'nearby-floor-detail', update() {
    const ex = state.explore;
    if (!ex) { detailPosition = null; return; }
    const x = camera.position.x, z = camera.position.z, key = `${ex.level}/${ex.near}/${ex.elevator?.to}`;
    // Explore's general visibility refresh uses 24m sectors. A short bridge
    // branch can fit inside one sector, so check its actual approach every 3m.
    if (detailPosition?.key === key && Math.hypot(x - detailPosition.x, z - detailPosition.z) < 3) return;
    detailPosition = { x, z, key, explore: ex };
    const wanted = floorSelector.select({ ...state, explore: { ...ex, position: { x, z } } });
    const previous = floorCache.stats.required;
    if (wanted.size === previous.length && previous.every(id => wanted.has(id))) return;
    floorCache.sync(wanted);
    applyExploreVisibility();
  } });
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
  // A duplex floor shows its companion storeys through the stair opening and the 挑空:
  // they load together and the LRU never evicts a floor of the current set.
  const companionsOf = (id) => [...new Set([id, ...(ctx.lvById[id]?.units || []).flatMap(u => u.residence?.homeLevels || [])])];
  // (a) A tower floor gets a lazily built interior when it has homes, is a refuge floor, or carries a lobby /
  // amenity plan that a tower package registers a builder for (ctx.towerFloorBuilders: [(ctx, L) => result | null]).
  const towerFloorBuilder = (lv) => lv.units.some(u => u.residence) ? buildResidenceFloor
    : lv.kind === 'refuge' && lv.refugePlan ? buildRefugeFloor
    : (lv.lobbyPlan || lv.amenityPlan) && ctx.towerFloorBuilders?.length ? (c, L) => { for (const f of c.towerFloorBuilders) { const r = f(c, L); if (r) return r; } return null; }
    : null;
  function ensureTowerFloor(id, keep = null) {
    const L = ctx.levels[id];
    if (!L || ctx.bById[L.building]?.kind !== 'tower') return;
    const build = towerFloorBuilder(L.lv);
    if (!build) return;
    const set = keep || new Set(companionsOf(id));
    if (!keep) for (const other of set) if (other !== id) ensureTowerFloor(other, set);
    const kind = build === buildResidenceFloor ? detailAssetKind(L.lv) : null, resource = detailResources[kind];
    if (resource && resource.status !== 'ready') { requestDetailResource(kind); return; }
    if (detailErrors.has(id)) return;
    if (!residenceCache.has(id)) {
      try {
        const result = build(ctx, L);
        if (!result) return;
        L.base.add(result.group);
        residenceCache.set(id, result);
      } catch (error) {
        detailErrors.set(id, error); console.error('Room detail construction failed', error);
        syncDetailStatus(); return;
      }
    } else {
      const cached = residenceCache.get(id); residenceCache.delete(id); residenceCache.set(id, cached);
    }
    if (keep) return;
    // 最多保留三个访问楼层（复式的同户楼层一并保留），进入任意楼层仍可完整加载该层全部房间。
    for (const [key, result] of residenceCache) {
      if (residenceCache.size <= Math.max(3, set.size)) break;
      if (set.has(key)) continue;
      result.group.removeFromParent(); result.dispose(); residenceCache.delete(key);
    }
  }
  // 7F 空中大堂 that should draw although its tower is not entered (seen from the mall roof, or P1 selected).
  const skyLobbyFor = skyLobbyVisibility(layout);
  // A tower stacked on the mall: P1 selected and cut below its roof, or exploded, hides it.
  const stackedHidden = (b, explore) => !explore && b.stackedOn && state.building === b.stackedOn
    && (state.exploded || (ctx.lvById[state.focus]?.elev ?? Infinity) < (ctx.lvById[b.levels[0]]?.elev ?? 0));
  function towerVisibility(B, explore = null) {
    const b = B.b, selected = state.building === b.id;
    // Riding a 北苑 lift up from P1 passes the tower's own floors before arrival.
    const inside = explore?.building === b.id || (!!explore?.level && ctx.lvById[explore.level]?.building === b.id);
    const focus = selected && state.focus;
    // A tower whose entry is another building's floor (北苑 on P1-1F) has no own default floor.
    const entry = b.entryLevel || `${b.id}-1F`, own = ctx.lvById[entry]?.building === b.id ? entry : null;
    // 7F 空中大堂与一期天台同高相通：站在天台或另一座空中大堂（60 m 内）、或俯瞰时选中一期 / 本塔且未聚焦楼层，
    // 空中大堂室内透过玻璃可见（漫游时作为想看的楼层，俯瞰时直接显示）。
    const sky = skyLobbyFor(b, { explore, building: state.building, focus: state.focus });
    const wanted = explore ? inside ? explore.level : explore.near === b.id ? own : sky
      : selected ? focus || own : null;
    const skyOrbit = !explore && sky;
    if (wanted) ensureTowerFloor(wanted);
    const companions = new Set(wanted ? companionsOf(wanted) : []);
    setResidentialDetailLevel(ctx, b.id, residenceCache.has(wanted) ? wanted : null);
    const selectedLevel = ctx.levels[focus]?.lv;
    const hidden = stackedHidden(b, explore);
    B.group.visible = !hidden;
    setHospitalityCut(ctx, b.id, !explore && selectedLevel && selectedLevel.kind !== 'roof' ? selectedLevel.elev + 0.05 : Infinity);
    if (B.exterior) B.exterior.visible = true;
    // In the orbit cutaway a duplex's upper storey would cover the focused floor (its rooms sit above
    // the cut, its lift lobby is cut away): companions show only from inside, or below the focus.
    const companionShown = (lv) => !!explore || !selectedLevel || lv.elev <= selectedLevel.elev;
    for (const L of B.levels) {
      const active = L.lv.id === wanted || L.lv.id === skyOrbit || (companions.has(L.lv.id) && companionShown(L.lv)) || (!!explore && visibleExploreLevels.has(L.lv.id) && L.lv.elev <= 0
        && !(L.lv.elev < 0 && !inside && !explore.under && (ctx.lvById[explore.level]?.elev ?? 0) > 4));
      const common = (!explore && !focus && (L.lv.short === '1F' || L.lv.kind === 'roof'))
        || (!!explore && !explore.under && L.lv.kind === 'roof');
      L.group.visible = active || common;
      L.base.visible = active || common;
      L.shell.visible = active; L.facade.visible = active;
      L.labels.visible = L.lv.id === wanted && state.labels && !explore;
      L.people.visible = active; L.flows.visible = active && state.flows;
      L.offset = L.offsetTarget = 0; L.group.position.y = 0;
    }
    for (const car of ctx.elevatorCars?.values() || []) if (car.elevator.building === b.id) {
      // Tower lift cars show only for their own tower (selected, explored or being ridden): the community rule,
      // extended to R / H / A by M1 (SPEC §2.2 near-branch groups), so far towers draw no cars.
      const mine = selected || inside || explore?.elevator?.id === car.elevator.id;
      car.group.visible = mine && (!selectedLevel || !!explore || car.group.position.y <= selectedLevel.elev + 0.1);
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
    // Up on an upper floor the ground hides every other building's basements: skip drawing them
    // (at street level they stay, for the views down ramps and stairwells).
    const high = !ex.under && (ctx.lvById[ex.level]?.elev ?? 0) > 4;
    for (const B of Object.values(ctx.buildings)) {
      if (B.b.kind === 'tower') { towerVisibility(B, ex); continue; }
      const metro = B.b.kind === 'metro';
      const inside = B.b.id === ex.building || (metro && ex.metro);
      const peek = B.b.id === ex.near;
      for (const L of B.levels) {
        const lv = L.lv;
        const connected = visibleExploreLevels.has(lv.id);
        L.group.visible = high && !inside && lv.elev < 0 ? false
          : B.b.undergroundOnly ? connected || lv.elev >= 0 : metro ? inside || connected || lv.short === 'B1' : true;
        L.base.visible = (inside && (ex.under || lv.kind !== 'parking')) || (peek && lv.elev >= 0)
          || connected || floorCache?.active(lv.id) || lv.kind === 'roof' || (B.b.kind === 'street' && lv.elev >= 0);
        L.facade.visible = !metro;
        L.shell.visible = true;
        L.people.visible = L.base.visible && (!floorSelector?.eligible.has(lv.id) || floorCache.active(lv.id));
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
    if (floorCache) {
      // A non-movement refresh (labels/quality/etc.) should not rewind the
      // approach check to the last 24m sector's old position.
      const ex = state.explore;
      const current = ex && detailPosition?.explore === ex
        ? { ...state, explore: { ...ex, position: { x: camera.position.x, z: camera.position.z } } } : state;
      floorCache.sync(floorSelector.select(current));
    }
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
          L.base.visible = fps || !!state.focus || L.lv.kind === 'roof' || B.b.kind === 'street';
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
        L.people.visible = L.base.visible && (!floorSelector?.eligible.has(id) || floorCache.active(id));
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
    return [OVERVIEW[0].clone().sub(OVERVIEW[1]).multiplyScalar(camera.aspect < 1 ? 1.2 : 1).add(OVERVIEW[1]), OVERVIEW[1], OVERVIEW_SHADOW];
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
    get floorStreaming() {
      const records = floorCache?.records || [];
      return { mode: fps ? 'eager-fps' : 'streamed-tour', eligible: floorSelector?.eligible.size || 0,
        ...(floorCache?.stats || {}), deferred: [...floorSelector?.eligible || []].filter(id => !floorCache.has(id)),
        lazyAtlasLevels: [...lazyAtlasLevels], persistentGeometry,
        detailGeometry: records.reduce((total, item) => ({ geometries: total.geometries + item.stats.geometries,
          vertices: total.vertices + item.stats.vertices, bufferBytes: total.bufferBytes + item.stats.bufferBytes }),
        { geometries: 0, vertices: 0, bufferBytes: 0 }) };
    },
    retryFloorDetail(id = state.explore?.level || state.focus) { floorCache?.retry(id); applyVisibility(); },
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
      // 复式上层没有门面：借用同户下层的入户门面，镜头仍对准本层
      const f = unitFront(layout, unit);
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
      // 漫游时相机由漫游控制器摆放，OrbitControls 的俯仰限制会把视线掰走；同时给了机位与目标时
      // 直接按导览的方式摆相机（lookAt），不经 controls.update() 的俯仰夹角，仰视镜头与导览一致。
      if (pos && target) camera.lookAt(controls.target);
      else if (!state.explore) controls.update();
      updateNear();
      describeView();
      env.indoor = env.indoorTarget;
      for (let i = 0; i < n; i++) {
        env.night = env.target;
        env.apply();
        env.update(dt);
        for (const d of ctx.dynamic) d.update(dt, (elapsed += dt), app);
      }
      renderer.shadowMap.needsUpdate = true;
      syncLevelMatrices();
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

  /** 告诉环境这一帧相机的处境：离焦点多远（俯瞰）、在不在室内（漫游走进了楼里，或者俯瞰时聚焦着某一层）。 */
  const describeView = () => {
    const ex = state.explore, lv = ctx.lvById[ex ? ex.level : state.focus];
    env.viewDistance = ex ? 0 : camera.position.distanceTo(controls.target);
    env.indoorTarget = (ex && (ex.under || ex.metro)) || (lv && lv.kind !== 'roof') ? 1 : 0;
  };
  /** 贴地阴影、灯下光斑这些贴花的开关。 */
  const applyDecals = (on) => {
    for (const m of Object.values(mats.base)) if (m.userData?.decal) m.visible = on;
    mats.setNight(mats.night); // 各栋楼克隆的那份材质在昼夜回调里和原件对齐
  };
  applyDecals(initialQuality.decals);
  qualityManager.subscribe(quality => {
    const shadowsChanged = ctx.quality.shadows !== quality.shadows;
    const texturesChanged = ctx.quality.textures !== quality.textures;
    ctx.quality = quality;
    renderer.setPixelRatio(quality.pixelRatio);
    env.setQuality(quality);
    ctx.peopleQuality?.setDensity(quality.crowdDensity);
    props?.setTier(quality.detail);
    applyDecals(quality.decals);
    if (texturesChanged) {
      const anisotropy = anisotropyFor(quality.textures);
      setAnisotropy(anisotropy);
      for (const asset of Object.values(surfaces)) for (const texture of Object.values(asset.maps)) {
        if (texture.anisotropy !== anisotropy) { texture.anisotropy = anisotropy; texture.needsUpdate = true; }
      }
    }
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
    // state.arcadeCamera：小游戏自己摆相机（无人机追尾视角等），轨道控制器让开
    if (!state.touring && !state.explore && !state.arcadeCamera) controls.update();
    updateNear();
    describeView();
    env.update(dt);
    for (const d of ctx.dynamic) d.update(dt, elapsed, app);
    highlight.update(elapsed, ctx);
    syncLevelMatrices();
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
  env.setShadowFocus(controls.target.clone(), OVERVIEW_SHADOW);
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
  // (c) Pick boxes never move: a static matrix keeps them out of the per-frame updateMatrixWorld cost.
  m.matrixAutoUpdate = false; m.updateMatrix();
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
    // (d) Tower core and refuge pick texts come from the layout (b.coreCard, lv.pickText) when a package sets them.
    const bt = ctx.bById[lv.building];
    for (const m of lv.rooms) {
      const info = m.pickInfo || (m.type === 'core' && bt?.coreCard ? (Array.isArray(bt.coreCard) ? bt.coreCard : ['电梯', bt.coreCard]) : null) || INFO[m.type];
      if (info) for (const r of m.rects) pickBox(G, geo, mat, m.frame, r, lv.elev, H, { kind: 'facility', title: info[0], desc: m.label && m.type === 'equip' ? m.label : info[1] });
    }
    if (lv.pickText) {
      const [title, desc] = Array.isArray(lv.pickText) ? lv.pickText : [lv.name, lv.pickText];
      for (const w of lv.walk.filter((q) => q.rect && q.frame)) pickBox(G, geo, mat, w.frame, w.rect, lv.elev, H, { kind: 'facility', title, desc });
    }
    for (const f of lv.features) {
      const t = f.pickInfo || {
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
        viewdeck: f.flush ? ['方庭观景台', '木平台 · 望远镜 · 俯瞰北苑空中大堂与云澜江'] : ['方庭观景台', '抬高木平台 · 望远镜 · 俯瞰园区'],
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
      if (f.rect) pickBox(G, geo, mat, f.frame, f.rect, lv.elev, f.type === 'pavilion' || f.type === 'sky-link-canopy' ? 4.6 : 2.5, { kind: 'facility', title: t[0], desc: t[1] });
      else if (f.type === 'ferris') pickBox(G, geo, mat, f.frame, { x0: f.lu - f.radius, x1: f.lu + f.radius, z0: f.lv - 3, z1: f.lv + 3 }, lv.elev, f.radius * 2 + 4, { kind: 'facility', title: t[0], desc: t[1] });
      else pickBox(G, geo, mat, f.frame, { x0: f.lu - 3, x1: f.lu + 3, z0: f.lv - 3, z1: f.lv + 3 }, lv.elev, 7, { kind: 'facility', title: t[0], desc: t[1] });
    }
  }
  // 住户门禁：读卡器与门线的拾取卡片
  for (const g of layout.accessControl?.gates || []) for (const id of g.floors) {
    const G = ctx.levels[id]?.picks, lv = ctx.lvById[id];
    if (!G || !lv) continue;
    const [title, desc] = gatePickInfo(layout, g);
    // The cabinets and leaves only (v ±0.75), up to the header: a camera at the reader (v −1.2) stands
    // outside the box, so the crosshair on the gate reads the gate, not a pick behind the core wall.
    pickBox(G, geo, mat, g.frame, { x0: g.line.u0, x1: g.line.u1, z0: -.75, z1: .75 }, lv.elev, 3.3, { kind: 'facility', title, desc });
  }
  // 7F 空中大堂: the reception desk and the halls (zones seen from inside too: double-sided, 2 cm inside their
  // edges), so the crosshair inside the lobby names the room it looks at, not a stair or the roof farm beyond it.
  const room = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const SKY_PICKS = {
    'reception-desk': ['礼宾台', '访客登记 · 住户服务'],
    'sky-hall': ['空中大堂', '商场天台南门 / 缝侧门进出 · 对公众开放'],
    'sky-river-lounge': ['江景休息区', '对公众开放'],
    'sky-lift-hall': ['住户候梯厅', '刷卡后乘住户电梯直达 8F–24F'],
    lounge: ['住户会所 · 江景会客厅', '住户专属'], library: ['住户会所 · 住户阅览室', '住户专属'],
    dining: ['住户会所 · 住户私宴厅', '住户专属'], gym: ['住户会所 · 健身房', '住户专属'],
  };
  for (const lv of layout.levels.filter((l) => l.skyLobby && l.lobbyPlan)) {
    const G = ctx.levels[lv.id]?.picks, plan = lv.lobbyPlan, H = (lv.height || 5) - .31;
    if (!G) continue;
    for (const o of plan.obstacles) if (SKY_PICKS[o.id]) {
      const [title, desc] = SKY_PICKS[o.id];
      pickBox(G, geo, mat, plan.frame, o.rect, lv.elev, o.height + .1, { kind: 'facility', title, desc });
    }
    for (const z of plan.zones) if (SKY_PICKS[z.id]) {
      const [title, desc] = SKY_PICKS[z.id], r = z.rect;
      pickBox(G, geo, room, plan.frame, { x0: r.x0 + .02, x1: r.x1 - .02, z0: r.z0 + .02, z1: r.z1 - .02 }, lv.elev, H, { kind: 'facility', title, desc });
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
  for (const [r, y0, h, data] of riverPicks(layout)) pickBox(ctx.site.picks, geo, mat, IDENTITY, r, y0, h, data);
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
