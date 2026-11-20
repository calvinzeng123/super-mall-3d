// 「零点突围 · ZERO HOUR」模式（原游戏叫「几猫」）：地图用我们现有的 FPS 地图（一期、酒店、公寓），其余全部用用户自己的「几猫」游戏：
// 步枪和双手、手感、声音、弹孔火花弹壳、界面、菜单、操作、任务流程。
// 游戏代码原样抽在 vendor/game.js（scripts/jimao/build-vendor.mjs 生成）；这里只是接线：
//   上下文对象 G（原游戏各模块共用的那一个）里的渲染器、场景、相机换成我们的，
//   物理换成 physics.js（在我们的导航网格上实现原游戏的同一套接口），关卡数据从我们的任务布局来。
import * as THREE from 'three';
import * as J from './vendor/game.js';
import { UI_CSS } from './vendor/ui-css.js';
import { createMapPhysics } from './physics.js';
import { createGrade } from './grade.js';
import { createTouchStick, inStickZone, stickOrigin, TOUCH_STICK_CSS } from './touch-stick.js';
import { createKeybinds, KEYS_CSS } from './keybinds.js';
import { createDiag, DIAG_CSS } from './diag.js';
import { createLiftControl, LIFT_CSS } from './lift.js';
import { applyCover, locCard, COVER_CSS } from './cover.js';
import { playIntro } from './intro.js';
import { createLayoutEditor, LAYOUT_CSS } from './layout-editor.js';
import { addSoldiers } from './soldier.js';
import { buildNav, landAt, clear } from '../layout/nav.js';
import { distToPolyEdge, toW } from '../layout/geom.js';
import { FPS_MISSION } from '../fps/mission-layout.js';
import { createMissionDirector, OPS_SITES, EXTRACTIONS } from './missions.js';
import { rideFootprint } from './ride-vehicles.js';
import { createAmmoSupply } from './ammo.js';
import { createRouteGuide } from './guide.js';
import { createPathfinder, PATH } from './pathfinder.js';
import { createTuning, TUNING_CSS } from './tuning.js';
import { createActions, ACTIONS_CSS } from './actions.js';
import { createMinimap, MINIMAP_CSS } from './minimap.js';
import { createScore, SCORE_CSS } from './score.js';
import { registerDressing, buildDressing } from './dressing.js';
import { createArsenal, ARSENAL_CSS } from './arsenal.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FPS_MODEL_ASSETS } from '../fps/model-data.js';
import { fetchBinary } from '../render/fetch-binary.js';
import { createCutscenes, CUT, CUTSCENE_CSS } from './cutscene.js';
import { createStairControl, STAIRS_CSS } from './stairs.js';
import { addZombies } from './zombie.js';
import { createSiege, SIEGE_CSS } from './siege.js';
import { createBlackout } from './blackout.js';
import { HELI_ORBIT } from './ride-paths.js';
import { DOOR_GUN_CSS } from './door-gun.js';
import { VEHICLE_HP_CSS } from './vehicle-damage.js';
import { MOBILE } from '../render/device.js';

/** 标题是四个字（原游戏是两个字）：字号收小、不换行，手机横屏按高度算 */
const TITLE_CSS = `
.m-word { font-size: clamp(40px, 7.6vw, 108px) !important; white-space: nowrap !important; letter-spacing: .1em !important; }
@media (max-width: 700px) { .m-word { font-size: clamp(34px, 10vw, 60px) !important; } }
@media (max-height: 500px) { .m-word { font-size: clamp(30px, 12vh, 60px) !important; } }
/* 开始界面上下的电影黑边去掉：在手机、折叠屏上看起来像是没全屏 */
.m-bars { display: none !important; }
`;
/** 封面背景镜头的起点（一期 1F 大中庭）、朝向和仰看的高度 */
export const TITLE_SHOT = Object.freeze({ x: -135, y: 0, z: -98, yaw: 2.3, rise: 5.5 });
/** 原游戏的画质名 → 我们的画质档位 */
const VENDOR_TIER = Object.freeze({ low: 'low', medium: 'balanced', high: 'high', ultra: 'ultra' });
/** 玩家在原游戏设置里选过的画质（auto 或没选过返回 null） */
/** 手机上枪和材质的贴图最多 1024：2048 那套要多占约 80MB 显存，iOS 容易回收（手机屏幕上看不出差别） */
const capTex = (q) => (MOBILE && q && q.tex > 1024 ? { ...q, tex: 1024 } : q);
function safeStorage() { try { return window.localStorage; } catch { return null; } }
function savedVendorQuality() {
  try { const q = JSON.parse(localStorage.getItem('saltline.settings.v1') || '{}').quality; return VENDOR_TIER[q] ? q : null; } catch { return null; }
}
/** HUD 上弹药箱的标记：绿色 */
const SUPPLY_CSS = `
.h-cm.supply, .h-wm.supply { color: #7dffb0; }
.h-cm.supply i, .h-wm.supply i { background: #7dffb0; }
.h-cm.enemy, .h-wm.enemy { color: #ff5a4a; }
.h-cm.enemy i, .h-wm.enemy i { background: #ff5a4a; }
.h-wm.enemy span, .h-wm.enemy b { display: none; }
.h-cm.hunt, .h-wm.hunt { color: #ff5a4a; }
.h-cm.hunt i, .h-wm.hunt i { background: #ff5a4a; }
.h-wm.hunt b { display: none; }
/* 拆弹任务的计时牌 */
.jm-bomb-clock { position: absolute; left: 50%; top: calc(78px + var(--sat, 0px)); transform: translateX(-50%); z-index: 3; padding: 5px 14px 6px; background: rgba(40, 8, 6, .72); border: 1px solid rgba(255, 90, 74, .7); color: #ff7a6c; font: 700 20px/1 var(--f-mono, monospace); letter-spacing: .12em; pointer-events: none; }
.jm-bomb-clock.hurry { color: #fff; background: rgba(170, 24, 16, .85); font-size: 24px; animation: jm-bomb-blink .5s steps(2) infinite; }
@keyframes jm-bomb-blink { 50% { opacity: .55; } }
`;
/** 枪画在单独的一层，用自己的相机（视角固定 54°）在世界之后再画一遍，永远不会插进墙里。 */
const VIEW_LAYER = 3;
/** 原游戏的灯光按它自己的亮度标定（太阳 9）；我们的太阳是 2.1，枪口闪光等点光源按这个比例缩。 */
const LIGHT_SCALE = 2.1 / 9;

export async function createJimaoGame(app, { onProgress = () => {} } = {}) {
  const { camera, renderer, ctx, scene } = app;
  const params = Object.fromEntries(new URLSearchParams(location.search));
  app.cancelFlight?.(); app.controls.enabled = false; app.state.labels = false; app.state.flows = false;

  // ---- 原游戏的地图常量：海、码头、地面那几个值改到够不着，免得「掉进海里」的救援把地下室当成海 ----
  Object.assign(J.LEVEL_BOUNDS, { groundY: -1e4, seaY: -1e4, quayX: 1e9 });
  J.LEVEL_BOUNDS.min.set(-1e5, -1e4, -1e5); J.LEVEL_BOUNDS.max.set(1e5, 1e4, 1e5);

  // 进这个模式之前场景里已有的东西（商场本身）：后面加进来的都是游戏的（预热着色器时用来区分）
  const mallChildren = new Set(scene.children);

  // ---- 界面层 ----
  const style = document.createElement('style'); style.textContent = UI_CSS + LAYOUT_CSS + TITLE_CSS + DOOR_GUN_CSS + SUPPLY_CSS + VEHICLE_HP_CSS + TOUCH_STICK_CSS + DIAG_CSS + KEYS_CSS + LIFT_CSS + COVER_CSS + TUNING_CSS + ACTIONS_CSS + MINIMAP_CSS + SCORE_CSS + ARSENAL_CSS + CUTSCENE_CSS + STAIRS_CSS + SIEGE_CSS; document.head.append(style);
  const ui = document.createElement('div'); ui.id = 'ui'; document.body.append(ui);

  // ---- 共享上下文 ----
  const viewCamera = new THREE.PerspectiveCamera(J.PLAYER.viewFov || 54, camera.aspect, 0.01, 10);
  viewCamera.layers.set(VIEW_LAYER);
  scene.add(camera); // 枪挂在相机下面，相机得在场景里
  const lights = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 12, 2); l.userData = { busy: false, ttl: 0, dur: 0, peak: 0, persistent: false };
    l.layers.enable(VIEW_LAYER); scene.add(l); lights.push(l);
  }
  const lightPool = {
    flash(pos, color = 0xffc880, intensity = 30, range = 10, dur = 0.06) {
      const l = lights.find((q) => !q.userData.busy) || lights.filter((q) => !q.userData.persistent).sort((a, b) => a.userData.ttl - b.userData.ttl)[0];
      if (!l) return;
      l.position.copy(pos); l.color.set(color); l.distance = range; l.intensity = intensity * LIGHT_SCALE;
      Object.assign(l.userData, { busy: true, ttl: dur, dur, peak: intensity * LIGHT_SCALE, persistent: false });
    },
    acquire() {
      const l = lights.find((q) => !q.userData.busy);
      if (!l) return null;
      l.userData.busy = l.userData.persistent = true; l.intensity = 0;
      return { light: l, release() { l.userData.busy = l.userData.persistent = false; l.intensity = 0; } };
    },
    update(dt) {
      for (const l of lights) { const u = l.userData; if (!u.busy || u.persistent) continue; u.ttl -= dt; if (u.ttl <= 0) { u.busy = false; l.intensity = 0; } else l.intensity = u.peak * (u.ttl / u.dur); }
    },
  };
  // 太阳和半球光也照到枪上
  for (const o of [app.env?.sun, app.env?.hemi]) o?.layers.enable(VIEW_LAYER);
  const resolution = new THREE.Vector2();
  const render = {
    renderer, scene, camera, viewCamera, lightPool, resolution, exposure: 1,
    // 原游戏的调色参数（受伤、低血量、开镜、闪白、黑场、饱和度），由 grade.js 画出来
    post: { damage: 0, lowHealth: 0, ads: 0, flash: 0, fade: 0, saturation: 1, focusDist: 0, shake: 0, wet: 0 },
    addPrePass() {}, onLevelReady() {}, frame() {}, renderWorld() {}, stats: () => ({}),
    // 原游戏设置面板里切画质（低 / 中 / 高 / 极致）：接到我们的画质档位（流畅 / 均衡 / 精细 / 极致），
    // 分辨率、阴影、HDR 光影、柔光、环境光遮蔽、室内灯、贴图、模型细节都跟着变（以前这里是空函数，切了没反应）
    // 只改这一局（persist: false）：原游戏自己存了档位，不再顺带改掉漫游存的画质
    setQuality(preset) {
      G.quality = capTex({ ...preset });
      const tier = VENDOR_TIER[preset?.name];
      if (tier) app.setQuality(tier, { persist: false });
      // 换了一档画面质量：性能微调回到这一档的默认值
      G.tuning?.resetToTier();
    },
  };
  const G = {
    THREE, params, events: J.createEvents(), rng: J.createRng(+(params.seed || 4207)), time: { t: 0, dt: 0, frame: 0, real: 0 },
    // 开局按玩家上次在设置里选的档位（原游戏存在 saltline.settings.v1）：枪、材质的贴图分辨率在开局时就按它生成
    quality: capTex(J.resolveQuality(params.q || savedVendorQuality() || (MOBILE ? 'low' : 'medium'))), render, renderer, scene, camera, viewCamera,
  };
  window.__G = G;
  // 画面档位跟原游戏存的档位走；手机上没选过就按流畅（不跟着漫游存的那一档，免得漫游选了极致、这里开局就很重）
  { const q = params.q || savedVendorQuality() || (MOBILE ? 'low' : null); if (VENDOR_TIER[q]) app.setQuality(VENDOR_TIER[q], { persist: false }); }

  onProgress('正在生成涂装、锈迹与金属表面', 0.05);
  G.mats = await J.createMats(G);
  if (G.mats.uniforms?.wet) G.mats.uniforms.wet.value = 0; // 商场里没有雨

  onProgress('正在接入地图碰撞', 0.25);
  addCover(ctx);
  // 战术布置（dressing.js）：任务地点周围的沙袋墙和隔离墩，导航里是实心障碍
  registerDressing(ctx.layout);
  const dressing = buildDressing(scene, ctx.layout);
  // 住宅楼的门禁全部释放（紧急状态，和消防联动一个道理）：北区塔楼的楼梯间、电梯厅才走得进去；门扇也摆成开着的
  const nav = buildNav(ctx.layout, { gates: 'open' });
  for (const g of nav.gates?.values?.() || []) ctx.accessGates?.set?.(g.id, true);
  G.physics = createMapPhysics(nav);
  // 分帧寻路（pathfinder.js）：敌人、路线指引的寻路都排队，每帧只算几毫秒；跨层连接表在加载画面里先建好
  const pathfinder = createPathfinder(nav);
  pathfinder.prepare();
  G.physics.pathfinder = pathfinder; G.pathfinder = pathfinder;
  G.input = J.createInput(G);
  G.level = buildLevel(ctx, nav);
  G.backdrop = J.stubs.backdrop();
  G.ground = { stub: true, update() {}, wetnessAt: () => 0, isPuddle: () => false };

  onProgress('正在加载弹道与烟雾', 0.4);
  G.fx = await guarded('fx', () => J.createFx(G));
  onProgress('正在合成枪声与环境声', 0.55);
  G.audio = params.noaudio ? J.stubs.audio() : await guarded('audio', () => J.createAudio(G));
  G.player = J.createPlayer(G);
  G.combat = J.createCombat(G);
  onProgress('正在检查制式步枪', 0.75);
  G.weapon = await J.createWeapon(G);
  G.weapon.setWetness?.(0);
  // 枪（相机下面的所有东西）挪到自己那一层
  camera.traverse((o) => { if (o !== camera) o.layers.set(VIEW_LAYER); });
  // 第二把枪和刀（arsenal.js）：G.weapon 换成「当前武器」，原来的步枪留在 G.rifle；G.arms 给翻越用（把枪放低）
  G.rifle = G.weapon;
  G.weapon = createArsenal(G, { camera, layer: VIEW_LAYER, ui });
  G.arms = G.weapon;
  // 手枪换上带贴图的真模型（2 MB，后台加载；加载不出来就用 arsenal.js 里手搭的那把，不影响开打）
  { const rec = !params.boxgun && FPS_MODEL_ASSETS.find((a) => a.id === 'pistol'), arsenal = G.weapon;
    if (rec) fetchBinary(rec.url, { label: '手枪模型' }).then((data) => new GLTFLoader().parseAsync(data, ''))
      .then((gltf) => { if (G.weapon === arsenal) arsenal.skinPistol(gltf.scene); })
      .catch((e) => console.warn('[零点突围] 手枪模型没加载出来，用简化模型', e)); }
  // 敌人：原游戏的机械飞鸥、机械猎犬，加上真人敌人「武装劫持者」（soldier.js，登记进同一个敌人模块）
  onProgress('正在部署敌人', 0.85);
  G.enemies = await guarded('enemies', () => J.createEnemies(G));
  // 只有真人敌人（武装劫持者）：机械飞鸥（无人机）和机械猎犬不再出场，真人敌人的池子加大到 18 个
  if (G.enemies.debug) addSoldiers(G, G.enemies, { patrolLines: G.level.patrolLines, count: 18 });
  tuneFlow();
  G.hud = J.createHud(G);
  // 随机任务：每局开始（含重开）抽一种任务和撤离方式，摆装置、物品和载具（missions.js）。网址参数 mission= / exit= 可以指定
  // 过场镜头（cutscene.js）：开局从空中推向商场、切进室内起身举枪；撤离时切到机外 / 车外看载具离开。上下遮幅和字幕也在这里
  const roofElev = ctx.layout.levels.find((l) => l.id === EXTRACTIONS.heli.floor)?.elev ?? 30;
  const cuts = createCutscenes(G, { ui, start: G.level.playerStart, eye: J.PLAYER?.eye ?? 1.62, center: HELI_ORBIT.center, roofY: roofElev, post: render.post });
  const director = createMissionDirector(G, { scene, layout: ctx.layout, nav, J, camera, letterbox: cuts.letterbox,
    force: { type: params.mission, exit: params.exit } });
  // 弹药补给（ammo.js）：备弹打完不会自动补，只能捡敌人掉的弹匣、开弹药箱、完成目标；坐车时击倒敌人补车里的弹药
  const ammo = createAmmoSupply(G, { scene, layout: ctx.layout, nav, isRiding: () => director.riding, rideKind: () => director.rideKind });
  // 地面路线指引（guide.js）：脚下一串淡蓝色小箭头指向最近的目标 / 撤离点，坐载具时不画
  const guide = createRouteGuide(G, { scene, layout: ctx.layout, nav, hidden: () => director.riding, pathfinder });
  // 坐电梯（lift.js）：走到电梯门口，按 Z / X（手机上 ▲ ▼）选楼层，停手就出发，真的走进轿厢坐过去；坐载具时不显示
  const lift = createLiftControl(G, { nav, layout: ctx.layout, root: ui, hidden: () => director.riding, post: render.post, cars: ctx.elevatorCars, guide });
  // 滑铲、手雷、手机上的蹲 / 近战 / 手雷键、辅助瞄准、自动开火（actions.js）；坐载具、坐电梯时不管
  // 消防楼梯（stairs.js）：每层楼梯口挂楼层牌；站在楼梯口按 Z / X（手机 ▲ ▼）快速上 / 下一层，不用自己绕折返梯（用户反馈绕得头晕）
  const stairs = createStairControl(G, { nav, scene, root: ui, hidden: () => director.riding, post: render.post, lift, blocked: (run, dir) => G.stairBlock?.(run, dir) || null });
  G.stairs = stairs;
  const actions = createActions(G, { scene, nav, ui, storage: safeStorage(), hidden: () => director.riding || lift.riding || stairs.riding });
  G.actions = actions;
  // 小地图 + 下一步提示（minimap.js）：左上角；坐载具时不显示
  const minimap = createMinimap(G, { nav, layout: ctx.layout, ui, guide, hidden: () => director.riding });
  G.minimap = minimap;
  // 丧尸围城（zombie.js、siege.js）：封面上切模式；丧尸另有一池（34 只），任务系统改抽「从商场突围到公寓楼顶」这一局
  const zombies = G.enemies.debug ? addZombies(G, G.enemies) : null;
  const siege = zombies ? createSiege(G, { layout: ctx.layout, nav, scene, ui, zombies, director, runs: stairs.runs, flow: J.GAME_FLOW, storage: safeStorage(), tower: params.tower || null }) : null;
  if (siege && params.siege !== undefined) siege.enabled = params.siege !== '0';
  G.siege = siege; G.zombies = zombies;
  G.level.onReset = () => { pathfinder.reset(); director.roll(); siege?.reset(); ammo.reset(); guide.reset(); lift.reset(); stairs.reset(); actions.reset(); minimap.reset(); locCard(document, director.state.mission); };
  G.level.extraMarkers = () => [...ammo.markers(), ...director.markers()];
  director.roll(); siege?.reset();
  G.missions = director; G.ammo = ammo; G.guide = guide; G.lift = lift;
  G.game = J.createGame(G);
  // 新封面和各菜单页的话术（cover.js）：原游戏的菜单建好以后改版面、改文字，按钮照旧
  const cover = applyCover(document);
  actions.buildUi();
  // 得分和连杀奖励（score.js）：菜单建好以后搭（结算页要加一行）
  const score = createScore(G, { ui });
  G.score = score;
  { const reset0 = G.level.onReset; G.level.onReset = () => { reset0(); score.reset(); }; }
  locCard(document, director.state.mission);
  // 封面上的模式切换：零点突围（打武装劫持者，任务随机）/ 丧尸围城（从商场突围到公寓楼顶）
  if (siege) {
    const box = document.querySelector('[data-s="title"] [data-zh="actions"]') || document.querySelector('[data-s="title"] .m-actions');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'jm-mode';
    const paint = () => { b.innerHTML = `<small>模式</small><b>${siege.enabled ? '丧尸围城' : '零点突围'}</b><i>点一下切换</i>`; b.classList.toggle('on', siege.enabled); };
    b.addEventListener('click', (e) => { e.stopPropagation(); siege.enabled = !siege.enabled; director.roll(); siege.reset(); locCard(document, director.state.mission); paint(); });
    paint(); box?.parentElement?.insertBefore(b, box);
  }
  // 备用摇杆（touch-stick.js）：Pointer Events 再跟一遍左半边的拇指，原游戏的摇杆这一帧没给出移动时顶上；没按时左下角显示摇杆的位置
  const stick = createTouchStick({ canvas: renderer.domElement, input: G.input, active: () => G.game?.state === 'playing' && !director.riding, root: ui, geometry: () => G.stickGeo?.() });
  async function guarded(name, make) {
    try { return await make(); } catch (error) { console.error(`[零点突围] ${name} 没有加载成功，改用空模块`, error); return J.stubs[name](); }
  }

  // ---- 每帧 ----
  let visibilityKey = '', prefer = null, preferAt = null, preferFrom = null;
  const levelOf = (id) => { const F = nav.floors.get(id); return F?.parentFloor || F?.level?.id || null; };
  /** 人在楼梯、扶梯上，或离梯口不到 16 米：梯子另一头是哪一层（楼层内装先搭那一层）。离开 22 米才放手，免得两部梯子之间来回换 */
  function preferFloor(s) {
    if (s.slope) { const sl = nav.slopeById.get(s.slope.id); if (sl) { prefer = levelOf(sl.low === s.floor ? sl.high : sl.low); preferAt = { x: s.x, z: s.z }; preferFrom = s.floor; return prefer; } }
    if (preferFrom !== s.floor) { prefer = null; preferFrom = s.floor; } // 换了一层：上一层选的不算数
    let best = prefer && preferAt ? Math.hypot(s.x - preferAt.x, s.z - preferAt.z) - 6 : Infinity, pick = null, at = null;
    if (best > 16) { best = 16; prefer = null; }
    for (const sl of nav.floors.get(s.floor)?.slopes || []) {
      const low = sl.low === s.floor, [x, z] = toW(sl.F, low ? 0 : sl.len, 0), d = Math.hypot(x - s.x, z - s.z);
      if (d < best) { best = d; pick = levelOf(low ? sl.high : sl.low); at = { x, z }; }
    }
    if (pick) { prefer = pick; preferAt = at; }
    return prefer;
  }
  function syncVisibility() {
    // 开局的空中镜头不另选楼层：一开场（还黑着）就按人在的那一层搭好，漫游状态下屋顶、外立面本来都画着，切进室内时不用再搭
    const s = G.physics.stateOf(G.player.pos);
    if (!s) return;
    const F = nav.floors.get(s.floor), level = F?.parentFloor || F?.level?.id || null, building = F?.building || null;
    let near = null;
    if (!building) { let best = 24; for (const b of ctx.layout.buildings) { const d = distToPolyEdge([s.x, s.z], b.outline); if (d < best) { best = d; near = b.id; } } }
    const want = preferFloor(s);
    // 正在坐电梯（真轿厢）：显示轿厢正经过的那一层，两头的楼层都留着（漫游模式坐电梯也是这么选的）
    const r = lift.rideInfo, rideLv = r?.car ? levelOf(r.pass) : null;
    const key = r?.car ? `lift/${r.id}/${r.to}/${rideLv}` : `${building}/${level}/${near}/${s.y < -0.5}/${Math.floor(s.x / 24)}/${Math.floor(s.z / 24)}/${want}`;
    if (key === visibilityKey) return;
    visibilityKey = key;
    // 开打以后楼层内装分帧搭（每帧几毫秒）；标题画面、开局前照旧一次搭完
    if (app.floorBuild) app.floorBuild.incremental = G.game?.state === 'playing';
    if (r?.car) {
      const y = nav.floors.get(r.pass)?.y ?? s.y;
      app.state.explore = { building, level: rideLv || level, near, metro: false, under: y < -0.5, position: { x: s.x, z: s.z }, prefer: levelOf(r.to), elevator: { id: r.id, from: levelOf(r.from), to: levelOf(r.to) } };
    } else app.state.explore = { building, level, near, metro: false, under: s.y < -0.5, position: { x: s.x, z: s.z }, prefer: want && want !== level ? want : null };
    app.refresh();
  }
  // 每个模块各自兜住报错（只打一次控制台）；报错的名字和第一条消息留在 run.err / run.msg，诊断面板里能看到
  const fail = (name, e, what) => { if (!run.err[name]) { run.err[name] = 1; run.msg[name] = String(e?.message || e).slice(0, 60); console.error(`[零点突围] ${what}`, e); } };
  const run = (name, dt) => { const m = G[name]; if (m?.update) try { m.update(dt); } catch (e) { fail(name, e, `${name}.update 出错`); } };
  run.err = {}; run.msg = {};
  // 帧率掉到 20 以下时，每帧的步长封顶 0.05 秒会让人走得比实际时间慢（10fps 只剩一半速度）：
  // 只有玩家按真实间隔（最多 0.15 秒）分几小步走完，敌人、特效照旧一步（不再加重这一帧）。转头只算一次。坐车 / 用机枪时不拆。
  let lastNow = 0, ridingUi = false;
  function stepPlayer(dt, gap) {
    const span = gap > 0.5 ? dt : Math.min(Math.max(gap, dt), 0.15), steps = Math.max(1, Math.ceil(span / 0.05 - 1e-6));
    if (steps === 1 || director.riding || director.gunActive) { run('player', dt); return; }
    const L = G.input.look, dx = L.dx, dy = L.dy;
    for (let i = 0; i < steps; i++) { run('player', span / steps); L.dx = L.dy = 0; }
    L.dx = dx; L.dy = dy; // 枪的晃动还要用这一帧的转头量
  }
  const dynamic = {
    name: 'jimao-session',
    update(rawDt) {
      const dt = Math.min(rawDt, 0.05), now = performance.now(), gap = lastNow ? (now - lastNow) / 1000 : rawDt;
      lastNow = now;
      diag.begin(rawDt, dt);
      Object.assign(G.time, { dt, t: G.time.t + dt, real: performance.now() / 1000, frame: G.time.frame + 1 });
      renderer.getDrawingBufferSize(resolution);
      run('input', dt);
      try { stick.apply(); } catch (e) { fail('stick', e, '备用摇杆出错'); }
      let active = false;
      try { active = G.game.update(dt) !== false && G.game.state !== 'title' && G.game.state !== 'paused'; } catch (e) { fail('game', e, 'game.update 出错'); }
      // 坐在载具上：玩家更新之前先把载具和玩家摆到这一帧的位置；用舱门机枪时步枪不更新（不开火、不显示）
      if (active) { try { director.prePlayer(dt); } catch (e) { fail('ride', e, '载具出错'); } }
      if (active) { try { lift.update(dt); } catch (e) { fail('lift', e, '电梯出错'); } }
      if (active) { try { stairs.update(dt); } catch (e) { fail('stairs', e, '楼梯出错'); } }
      // 寻路每帧最多算 PATH.budget 毫秒（帧率很低时减半，别再雪上加霜）
      if (active) { try { pathfinder.update(rawDt > 0.05 ? PATH.budget / 2 : PATH.budget); } catch (e) { fail('path', e, '寻路出错'); } }
      if (active) { try { actions.pre(dt); } catch (e) { fail('actions', e, '操作补强出错'); } }
      if (active) { stepPlayer(dt, gap); if (!director.gunActive) run('weapon', dt); run('enemies', dt); }
      if (G.game.state !== 'paused') { try { actions.update(dt); } catch (e) { fail('actions', e, '手雷出错'); } }
      if (G.game.state !== 'paused') { try { ammo.update(dt); } catch (e) { fail('ammo', e, '弹药补给出错'); } }
      if (siege && G.game.state !== 'paused') { try { siege.update(dt); } catch (e) { fail('siege', e, '丧尸围城出错'); } }
      blackout.enabled = !!siege?.enabled; blackout.open = director.riding ? 1 : 0; blackout.update(dt);
      if (G.game.state !== 'paused') { try { guide.update(dt); } catch (e) { fail('guide', e, '路线指引出错'); } }
      try { minimap.update(dt); } catch (e) { fail('minimap', e, '小地图出错'); }
      try { G.score?.update(dt); } catch (e) { fail('score', e, '得分出错'); }
      if (G.game.state !== 'paused') { run('fx', dt); run('mats', dt); }
      // 任务物件动画、歼灭任务增援；撤离时镜头登机、坐进直升机 / 接应车里（missions.js 给出位置、朝向和压暗）
      try {
        const view = director.update(dt);
        if (view?.position) {
          camera.position.copy(view.position);
          if (view.quaternion) camera.quaternion.copy(view.quaternion); else camera.lookAt(view.lookAt);
          G.weapon?.setVisible?.(false);
        }
        if (view) render.post.fade = view.fade ?? 0;
      } catch (e) { fail('missions', e, 'missions.update 出错'); }
      // 开局过场：镜头、枪放多低、切镜头时的压黑
      try {
        const cv = cuts.intro.view(dt);
        if (cv) { camera.position.copy(cv.position); camera.quaternion.copy(cv.quaternion); render.post.fade = cv.fade; }
      } catch (e) { fail('cutscene', e, '过场镜头出错'); }
      // 坐在载具上（含登机、返航的过场）：界面换成只有开火键和机枪状态条
      { const riding = !!director.riding; if (riding !== ridingUi) { ridingUi = riding; ui.classList.toggle('jm-riding', riding); } }
      run('audio', dt); run('hud', dt);
      try { cover.tick(); } catch (e) { fail('cover', e, '封面出错'); }
      lightPool.update(dt);
      syncVisibility();
      G.input.endFrame?.();
    },
  };
  ctx.dynamic.push(dynamic);
  // 世界画完以后画枪：清掉深度，用枪自己的相机画枪那一层。环境反射调亮一点（原游戏也这样，暗色金属才看得出质感）
  // 丧尸围城的停电场景（blackout.js）：天黑、室内只留应急亮度、手电、薄雾；零点突围不开
  const blackout = createBlackout({ app, scene, camera, viewLayer: VIEW_LAYER });
  G.blackout = blackout;
  const drawView = () => {
    viewCamera.position.copy(camera.position); viewCamera.quaternion.copy(camera.quaternion);
    if (Math.abs(viewCamera.aspect - camera.aspect) > 1e-4) { viewCamera.aspect = camera.aspect; viewCamera.updateProjectionMatrix(); }
    const undo = blackout.begin(); // 停电时枪也跟着暗（靠手电和枪口火光照亮），不然黑屋子里飘着一把亮枪
    const auto = renderer.autoClear, envI = scene.environmentIntensity, fog = scene.fog;
    renderer.autoClear = false; renderer.clearDepth();
    scene.environmentIntensity = undo ? Math.max(0.42, scene.environmentIntensity * 2.4) : Math.max(1.1, envI * 2.4); scene.fog = null;
    renderer.render(scene, viewCamera);
    scene.environmentIntensity = envI; scene.fog = fog; renderer.autoClear = auto;
    undo?.();
  };
  // 画面反馈：世界和枪先画进离屏图（包一层 env.render），枪画完以后贴回屏幕
  const grade = createGrade(renderer, render.post, { samples: MOBILE ? 2 : 4 });
  const env = app.env, baseRender = env.render;
  env.render = function () { grade.begin(); const undo = blackout.begin(); try { return baseRender.call(this); } finally { undo?.(); } };
  // 诊断面板（diag.js）：设置里「诊断信息 · 显示」或 ?diag=1
  // 性能微调（tuning.js）：设置面板「画面质量」下面加帧率上限、分辨率、阴影、抗锯齿、光影特效、路人、敌人数，标题旁显示当前帧率
  const tuning = createTuning({ app, ui, grade, flow: J.GAME_FLOW, mobile: MOBILE, storage: safeStorage(), baseSamples: MOBILE ? 2 : 4 });
  G.tuning = tuning; tuning.apply();
  const diag = createDiag({ app, G, renderer, grade, stick, run, params });
  const finish = () => { diag.end(grade.end(G.time.t)); tuning.tick(); };
  G.touchStick = stick; G.diag = diag;
  ctx.afterRender.push(drawView, finish);
  // 键位布局：设置面板里加一行「键位布局 · 拖动调整」（摇杆、触屏按键、HUD 的位置和大小，摇杆跟随拇指 / 固定位置）
  const layoutEditor = createLayoutEditor(ui);
  // 原游戏的摇杆（补丁）按这里给的摇杆区、中心、缩放走；备用摇杆也用同一套
  G.stickGeo = () => layoutEditor.stick();
  G.stickZone = (x, y) => inStickZone(layoutEditor.stick(), x, y);
  G.stickAnchor = (x, y) => stickOrigin(layoutEditor.stick(), x, y);
  Object.defineProperty(G, 'stickScale', { configurable: true, get: () => layoutEditor.stickScale() });
  // 键盘按键可改（keybinds.js）：设置面板里「键盘按键 · 修改」，手机上不显示
  const keybinds = createKeybinds(G);
  const fsRow = ui.querySelector('[data-row="fs"]');
  if (fsRow) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = '<label id="l-layout">键位布局</label><button class="btn small" data-act="jm-layout" aria-labelledby="l-layout">拖动调整</button>';
    row.querySelector('button').addEventListener('click', () => layoutEditor.open());
    fsRow.after(row);
    if (keybinds.available && !MOBILE) {
      const kRow = document.createElement('div'); kRow.className = 'row';
      kRow.innerHTML = '<label id="l-keys">键盘按键</label><button class="btn small" data-act="jm-keys" aria-labelledby="l-keys">修改</button>';
      kRow.querySelector('button').addEventListener('click', () => keybinds.open());
      row.after(kRow);
    }
    const dRow = document.createElement('div'); dRow.className = 'row';
    dRow.innerHTML = '<label id="l-diag">诊断信息</label><button class="btn small" data-act="jm-diag" aria-labelledby="l-diag"></button>';
    const dBtn = dRow.querySelector('button'), dLabel = () => { dBtn.textContent = diag.on ? '隐藏' : '显示'; };
    dLabel(); dBtn.addEventListener('click', () => { diag.toggle(); dLabel(); });
    row.after(dRow);
  }

  // 预热：敌人、特效、任务物件、载具开局时都藏着，第一次出现才编译着色器、上传贴图——每种材质卡一下（第一个敌人露头、第一次开枪时最明显）。
  // 这里趁加载画面把后来加进场景的东西（mallChildren 之外的）临时显示出来编译一遍，再藏回去。
  onProgress('正在预热着色器', 0.95);
  try {
    const shown = [], textures = new Set();
    for (const root of scene.children) {
      if (mallChildren.has(root)) continue;
      root.traverse((o) => {
        if (!o.visible) { o.visible = true; shown.push(o); }
        for (const m of [].concat(o.material || [])) for (const v of Object.values(m)) if (v?.isTexture && v.image) textures.add(v);
      });
    }
    camera.traverse((o) => { if (!o.visible) { o.visible = true; shown.push(o); } });
    renderer.compile(scene, camera);
    renderer.compile(scene, viewCamera);
    for (const tex of textures) { try { renderer.initTexture(tex); } catch { /* 还没准备好的贴图等用到时再传 */ } }
    for (const o of shown) o.visible = false;
    G.warm = { objects: shown.length, textures: textures.size, programs: renderer.info.programs?.length || 0 };
  } catch (e) { console.error('[零点突围] 预热着色器出错', e); }

  if (params.autostart || params.shot) G.game.start({ skipIntro: true });
  // 入场动画：盖在标题菜单上面放一次（自动开局、截图时不放）
  else if (!params.nointro) playIntro({ volume: 0.5 });
  onProgress('准备就绪', 1);
  return {
    G, layoutEditor,
    dispose() {
      ctx.dynamic.splice(ctx.dynamic.indexOf(dynamic), 1);
      for (const f of [drawView, finish]) ctx.afterRender.splice(ctx.afterRender.indexOf(f), 1);
      env.render = baseRender; grade.dispose(); tuning.dispose(); layoutEditor.dispose(); keybinds.dispose(); diag.dispose(); stick.dispose();
      ui.remove(); style.remove(); for (const l of lights) l.removeFromParent(); actions.dispose(); minimap.dispose(); cuts.dispose(); stairs.dispose(); siege?.dispose(); blackout.dispose(); zombies?.dispose(); G.score?.dispose(); dressing.dispose(); G.arms?.dispose?.(); director.dispose(); ammo.dispose(); guide.dispose();
    },
  };
}

/**
 * 敌人的数量和组成（原游戏是开局 2 飞鸥 + 1 猎犬，三波 3+1、3+2、4+3）。
 * 我们的地图是室内为主、楼层多，真人敌人当主力，机器穿插：开局 4 人 + 1 猎犬 + 1 飞鸥在各处巡逻，
 * 每切断一个中继来一波，撤离时有追兵。同时在场最多 10 个。
 */
function tuneFlow() {
  // 只有真人敌人：开局 8 人分散巡逻，每完成一个目标来一波（5、6、7 人），撤离时还有追兵；同时在场最多 14 个
  Object.assign(J.GAME_FLOW, {
    patrol: { gull: 0, hound: 0, soldier: 8 },
    waves: [{ gull: 0, hound: 0, soldier: 5 }, { gull: 0, hound: 0, soldier: 6 }, { gull: 0, hound: 0, soldier: 7 }],
    maxAlive: 14, spawnMax: 60,
    pursuitMix: () => 'soldier',
    introSeconds: CUT.intro, // 开局过场（cutscene.js）；重新出击还是原来的 1.3 秒
  });
}

/** 掩体（旧 FPS 任务的五组设备箱、货箱、行李箱）：导航里算实心家具（market-stall），画成箱子 */
function addCover(ctx) {
  const dark = new THREE.MeshStandardMaterial({ color: '#2b343a', metalness: 0.4, roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: '#7d878c', metalness: 0.75, roughness: 0.4 });
  const wood = ctx.mats?.base?.wood || new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.8 });
  const group = new THREE.Group(); group.name = '零点突围掩体'; ctx.scene.add(group);
  for (const c of FPS_MISSION.cover) {
    const lv = ctx.layout.levels.find((l) => l.id === c.floor);
    if (!lv) continue;
    if (!lv.features.some((f) => f.id === c.id)) lv.features.push({ ...c, y: lv.elev, type: 'market-stall', tactical: true });
    const box = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.height, c.d), c.style === 'cargo' ? wood : dark);
    box.position.set(c.x, lv.elev + c.height / 2, c.z); group.add(box);
    for (const y of [0.12, c.height - 0.12]) { const band = new THREE.Mesh(new THREE.BoxGeometry(c.w + 0.04, 0.07, c.d + 0.04), metal); band.position.set(c.x, lv.elev + y, c.z); group.add(band); }
  }
  // 两台撤离载具的机身 / 车身是导航障碍（人走不穿；上去是走到门口登机，见 missions.js）
  for (const [id, x] of Object.entries(EXTRACTIONS)) {
    const lv = ctx.layout.levels.find((l) => l.id === x.floor), r = rideFootprint(x.vehicle);
    if (lv && !lv.features.some((f) => f.id === `ride-${id}`)) lv.features.push({ id: `ride-${id}`, type: 'market-stall', tactical: true, floor: x.floor, y: lv.elev,
      x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, d: r.z1 - r.z0, height: 2.4, ride: true });
  }
}

/** 出生点朝哪：16 个方向里顺着导航往前直走最远（最多 30 米）的那个；一样远时选离原朝向近的 */
export function openYaw(nav, st) {
  let best = st.yaw, bestD = -1;
  for (let k = 0; k < 16; k++) {
    const yaw = st.yaw + (k / 16) * Math.PI * 2, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    let d = 0;
    while (d < 30 && clear(nav, { floor: st.floor, x: st.x + dx * (d + 0.5), z: st.z + dz * (d + 0.5), y: st.y, slope: null })
      && clear(nav, { floor: st.floor, x: st.x + dx * (d + 0.5) - dz * 0.4, z: st.z + dz * (d + 0.5) + dx * 0.4, y: st.y, slope: null })
      && clear(nav, { floor: st.floor, x: st.x + dx * (d + 0.5) + dz * 0.4, z: st.z + dz * (d + 0.5) - dx * 0.4, y: st.y, slope: null })) d += 0.5;
    if (d > bestD + 0.25) { bestD = d; best = yaw; }
  }
  return best;
}

/** 原游戏的关卡数据：出生点、敌人出生点、室内范围、标题画面的镜头路线。目标和撤离点由 missions.js 每局填进来 */
function buildLevel(ctx, nav) {
  const elev = (f) => ctx.layout.levels.find((l) => l.id === f)?.elev ?? 0;
  const v = (p, dy = 0) => new THREE.Vector3(p.x, (p.y ?? 0) + dy, p.z);
  const s = { ...FPS_MISSION.spawn, y: elev(FPS_MISSION.spawn.floor) };
  s.yaw = openYaw(nav, s); // 开局正对最空的方向（原朝向 2 米外就是咖啡外摆桌椅，一推摇杆就顶住，手机上像是走不动）
  const interiorBoxes = ctx.layout.buildings.filter((b) => b.outline?.length).map((b) => {
    const xs = b.outline.map((p) => p[0]), zs = b.outline.map((p) => p[1]);
    return { min: new THREE.Vector3(Math.min(...xs), -30, Math.min(...zs)), max: new THREE.Vector3(Math.max(...xs), 80, Math.max(...zs)) };
  });
  const mission = { enemies: FPS_MISSION.enemies.map((e) => ({ ...e, y: elev(e.floor), patrol: e.patrol.map((p) => ({ ...p, y: elev(p.floor) })) })),
    cover: FPS_MISSION.cover.map((c) => ({ ...c, y: elev(c.floor) })) };
  const anchors = [...OPS_SITES, ...Object.values(EXTRACTIONS)].map((p) => ({ ...p, y: elev(p.floor) }));
  const { enemySpawns, coverPoints, patrolLines } = buildSpawns(mission, nav, anchors, ctx.layout);
  // 封面背景的镜头：在一期大中庭里低机位慢慢往前推，仰看一圈圈退台和天窗（以前对着开局点前面的一堵墙）
  const T = TITLE_SHOT, fx = -Math.sin(T.yaw), fz = -Math.cos(T.yaw);
  const cinematicPath = [0, 5, 10, 15].map((d, i) => ({
    pos: [T.x + fx * d + (i % 2 ? 0.5 : -0.5), T.y + 1.9 + d * 0.05, T.z + fz * d],
    look: [T.x + fx * (d + 14), T.y + 1.9 + T.rise, T.z + fz * (d + 14)],
  }));
  return {
    stub: false, playerStart: { pos: v(s), yaw: s.yaw }, objectives: [],
    extraction: null, enemySpawns, zones: [], coverPoints, patrolLines, interiorBoxes, cinematicPath,
    groundSurfaceAt: () => 'concrete', update() {},
  };
}

const GAME_FLOORS = new Set(['P1-B1M', 'P1-1F', 'P1-2F', 'P1-3F', 'P1-RF', 'H-1F', 'H-2F', 'H-3F', 'H-4F', 'H-5F', 'H-6F', 'A-B1', 'A-1F', 'A-2F', 'A-3F', 'A-4F',
  // 任务地点铺到全图以后加的：商场地库和 4–6F、艺文馆、酒店和公寓的高层、地铁三层
  'P1-B1', 'P1-4F', 'P1-5F', 'P1-6F', 'P1C-1F', 'H-7F', 'H-8F', 'H-12F', 'A-5F', 'A-6F', 'M-B1', 'M-B2', 'M-B3']);

/**
 * 敌人出生点：原 FPS 任务里的七个守卫位置和它们的巡逻点、三个中继周围、掩体旁边。
 * 地面的（猎犬、真人）就站在楼面上；空中的（飞鸥）只取头顶有 3.8 米以上净空的地上楼层，高度定在离地 2.5–4.5 米。
 */
export function buildSpawns(mission, nav, relays, layout = null) {
  const ground = [], seen = new Set();
  const add = (x, y, z) => {
    const st = landAt(nav, x, z, y + 0.6);
    if (!st || Math.abs(st.y - y) > 0.6) return;
    const key = `${Math.round(st.x / 2)},${Math.round(st.y)},${Math.round(st.z / 2)}`;
    if (seen.has(key)) return;
    seen.add(key); ground.push(new THREE.Vector3(st.x, st.y, st.z));
  };
  for (const e of mission.enemies) { add(e.x, e.y, e.z); for (const p of e.patrol) add(p.x, p.y, p.z); }
  // 中继周围（同一层）：近处 6–16 米一圈，波次敌人常用的 22–34 米再一圈
  for (const r of relays) for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2 + (k % 2) * 0.13, d = [6, 11, 16, 22, 28, 34][k % 6];
    add(r.x + Math.cos(a) * d, r.y, r.z + Math.sin(a) * d);
  }
  const coverPoints = [];
  for (const c of mission.cover) for (const [dx, dz] of [[c.w / 2 + 0.7, 0], [-(c.w / 2 + 0.7), 0], [0, c.d / 2 + 0.7], [0, -(c.d / 2 + 0.7)]]) {
    const st = landAt(nav, c.x + dx, c.z + dz, c.y + 0.6);
    if (st && Math.abs(st.y - c.y) < 0.6) coverPoints.push(new THREE.Vector3(st.x, st.y, st.z));
  }
  for (const p of coverPoints) add(p.x, p.y, p.z);
  // 任务会去的楼层（商场 B1M–3F、酒店 1F–6F、公寓 B1–4F、商场屋顶）的走道上每 9 米一个点：任务地点每局不同，敌人哪儿都可能来
  if (layout) for (const lv of layout.levels.filter((l) => GAME_FLOORS.has(l.id))) for (const w of lv.walk) {
    const xs = w.poly.map((p) => p[0]), zs = w.poly.map((p) => p[1]);
    for (let x = Math.ceil(Math.min(...xs) / 9) * 9; x <= Math.max(...xs); x += 9) for (let z = Math.ceil(Math.min(...zs) / 9) * 9; z <= Math.max(...zs); z += 9) add(x, lv.elev, z);
  }
  // 只有地面敌人（没有会飞的机械飞鸥了）
  const enemySpawns = ground.map((pos) => ({ type: 'ground', pos }));
  const patrolLines = mission.enemies.map((e) => e.patrol.map((p) => ({ x: p.x, y: p.y, z: p.z })));
  return { enemySpawns, coverPoints, patrolLines };
}
