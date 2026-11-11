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
import { playIntro } from './intro.js';
import { createLayoutEditor, LAYOUT_CSS } from './layout-editor.js';
import { addSoldiers } from './soldier.js';
import { buildNav, landAt } from '../layout/nav.js';
import { distToPolyEdge } from '../layout/geom.js';
import { createMissionLayout } from '../fps/mission-layout.js';
import { MOBILE } from '../render/device.js';

/** 标题是四个字（原游戏是两个字）：字号收小、不换行，手机横屏按高度算 */
const TITLE_CSS = `
.m-word { font-size: clamp(40px, 7.6vw, 108px) !important; white-space: nowrap !important; letter-spacing: .1em !important; }
@media (max-width: 700px) { .m-word { font-size: clamp(34px, 10vw, 60px) !important; } }
@media (max-height: 500px) { .m-word { font-size: clamp(30px, 12vh, 60px) !important; } }
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

  // ---- 界面层 ----
  const style = document.createElement('style'); style.textContent = UI_CSS + LAYOUT_CSS + TITLE_CSS; document.head.append(style);
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
    addPrePass() {}, setQuality() {}, onLevelReady() {}, frame() {}, renderWorld() {}, stats: () => ({}),
  };
  const G = {
    THREE, params, events: J.createEvents(), rng: J.createRng(+(params.seed || 4207)), time: { t: 0, dt: 0, frame: 0, real: 0 },
    quality: J.resolveQuality(params.q || (MOBILE ? 'low' : 'medium')), render, renderer, scene, camera, viewCamera,
  };
  window.__G = G;

  onProgress('正在生成涂装、锈迹与金属表面', 0.05);
  G.mats = await J.createMats(G);
  if (G.mats.uniforms?.wet) G.mats.uniforms.wet.value = 0; // 商场里没有雨

  onProgress('正在接入地图碰撞', 0.25);
  const nav = buildNav(ctx.layout);
  G.physics = createMapPhysics(nav);
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
  // 敌人：原游戏的机械飞鸥、机械猎犬，加上真人敌人「武装劫持者」（soldier.js，登记进同一个敌人模块）
  onProgress('正在部署敌人', 0.85);
  G.enemies = await guarded('enemies', () => J.createEnemies(G));
  if (G.enemies.debug) addSoldiers(G, G.enemies, { patrolLines: G.level.patrolLines });
  tuneFlow();
  G.hud = J.createHud(G);
  G.game = J.createGame(G);
  async function guarded(name, make) {
    try { return await make(); } catch (error) { console.error(`[零点突围] ${name} 没有加载成功，改用空模块`, error); return J.stubs[name](); }
  }

  // ---- 每帧 ----
  let visibilityKey = '';
  function syncVisibility() {
    const s = G.physics.stateOf(G.player.pos);
    if (!s) return;
    const F = nav.floors.get(s.floor), level = F?.parentFloor || F?.level?.id || null, building = F?.building || null;
    let near = null;
    if (!building) { let best = 24; for (const b of ctx.layout.buildings) { const d = distToPolyEdge([s.x, s.z], b.outline); if (d < best) { best = d; near = b.id; } } }
    const key = `${building}/${level}/${near}/${s.y < -0.5}/${Math.floor(s.x / 24)}/${Math.floor(s.z / 24)}`;
    if (key === visibilityKey) return;
    visibilityKey = key;
    app.state.explore = { building, level, near, metro: false, under: s.y < -0.5, position: { x: s.x, z: s.z } };
    app.refresh();
  }
  const run = (name, dt) => { const m = G[name]; if (m?.update) try { m.update(dt); } catch (e) { if (!run.err[name]) { run.err[name] = 1; console.error(`[零点突围] ${name}.update 出错`, e); } } };
  run.err = {};
  const dynamic = {
    name: 'jimao-session',
    update(rawDt) {
      const dt = Math.min(rawDt, 0.05);
      Object.assign(G.time, { dt, t: G.time.t + dt, real: performance.now() / 1000, frame: G.time.frame + 1 });
      renderer.getDrawingBufferSize(resolution);
      run('input', dt);
      let active = false;
      try { active = G.game.update(dt) !== false && G.game.state !== 'title' && G.game.state !== 'paused'; } catch (e) { if (!run.err.game) { run.err.game = 1; console.error('[零点突围] game.update 出错', e); } }
      if (active) { run('player', dt); run('weapon', dt); run('enemies', dt); }
      if (G.game.state !== 'paused') { run('fx', dt); run('mats', dt); }
      run('audio', dt); run('hud', dt);
      lightPool.update(dt);
      syncVisibility();
      G.input.endFrame?.();
    },
  };
  ctx.dynamic.push(dynamic);
  // 世界画完以后画枪：清掉深度，用枪自己的相机画枪那一层。环境反射调亮一点（原游戏也这样，暗色金属才看得出质感）
  const drawView = () => {
    viewCamera.position.copy(camera.position); viewCamera.quaternion.copy(camera.quaternion);
    if (Math.abs(viewCamera.aspect - camera.aspect) > 1e-4) { viewCamera.aspect = camera.aspect; viewCamera.updateProjectionMatrix(); }
    const auto = renderer.autoClear, envI = scene.environmentIntensity, fog = scene.fog;
    renderer.autoClear = false; renderer.clearDepth();
    scene.environmentIntensity = Math.max(1.1, envI * 2.4); scene.fog = null;
    renderer.render(scene, viewCamera);
    scene.environmentIntensity = envI; scene.fog = fog; renderer.autoClear = auto;
  };
  // 画面反馈：世界和枪先画进离屏图（包一层 env.render），枪画完以后贴回屏幕
  const grade = createGrade(renderer, render.post, { samples: MOBILE ? 2 : 4 });
  const env = app.env, baseRender = env.render;
  env.render = function () { grade.begin(); return baseRender.call(this); };
  const finish = () => grade.end(G.time.t);
  ctx.afterRender.push(drawView, finish);
  // 界面布局：设置面板里加一行「界面布局 · 调整」
  const layoutEditor = createLayoutEditor(ui);
  const fsRow = ui.querySelector('[data-row="fs"]');
  if (fsRow) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = '<label id="l-layout">界面布局</label><button class="btn small" data-act="jm-layout" aria-labelledby="l-layout">拖动调整</button>';
    row.querySelector('button').addEventListener('click', () => layoutEditor.open());
    fsRow.after(row);
  }

  if (params.autostart || params.shot) G.game.start({ skipIntro: true });
  // 入场动画：盖在标题菜单上面放一次（自动开局、截图时不放）
  else if (!params.nointro) playIntro({ volume: 0.5 });
  onProgress('准备就绪', 1);
  return {
    G, layoutEditor,
    dispose() {
      ctx.dynamic.splice(ctx.dynamic.indexOf(dynamic), 1);
      for (const f of [drawView, finish]) ctx.afterRender.splice(ctx.afterRender.indexOf(f), 1);
      env.render = baseRender; grade.dispose(); layoutEditor.dispose();
      ui.remove(); style.remove(); for (const l of lights) l.removeFromParent();
    },
  };
}

/**
 * 敌人的数量和组成（原游戏是开局 2 飞鸥 + 1 猎犬，三波 3+1、3+2、4+3）。
 * 我们的地图是室内为主、楼层多，真人敌人当主力，机器穿插：开局 4 人 + 1 猎犬 + 1 飞鸥在各处巡逻，
 * 每切断一个中继来一波，撤离时有追兵。同时在场最多 10 个。
 */
function tuneFlow() {
  // 猎犬原来每 0.6 秒重新找一次路；我们的路跨楼层、算得慢，放宽到 1.5 秒
  J.ENEMY_TUNE.hound.replan = 1.5;
  Object.assign(J.GAME_FLOW, {
    patrol: { gull: 1, hound: 1, soldier: 4 },
    waves: [{ gull: 1, hound: 1, soldier: 3 }, { gull: 2, hound: 1, soldier: 4 }, { gull: 2, hound: 2, soldier: 5 }],
    maxAlive: 10, spawnMax: 40,
    pursuitMix: (r) => (r < 0.3 ? 'gull' : r < 0.75 ? 'soldier' : 'hound'),
  });
}

/** 原游戏的关卡数据，从我们的任务布局换算：出生点、三个中继、撤离点、室内范围、标题画面的镜头路线。 */
function buildLevel(ctx, nav) {
  const mission = createMissionLayout(ctx.layout);
  const v = (p, dy = 0) => new THREE.Vector3(p.x, (p.y ?? 0) + dy, p.z);
  const [terminal, intel] = mission.objectives, car = mission.extractions[0];
  const third = { x: -151, y: -4.5, z: -94 }; // 一期 B1M 地下大厅（原来的地下侦察巡逻线上）
  const relays = [
    { id: 'relay_a', label: '甲号中继 · 商场西翼', zone: 'mall', pos: v(terminal), object: null },
    { id: 'relay_b', label: '乙号中继 · 酒店二楼', zone: 'hotel', pos: v(intel), object: null },
    { id: 'relay_c', label: '丙号中继 · 地下大厅', zone: 'concourse', pos: v(third), object: null },
  ];
  const interiorBoxes = ctx.layout.buildings.filter((b) => b.outline?.length).map((b) => {
    const xs = b.outline.map((p) => p[0]), zs = b.outline.map((p) => p[1]);
    return { min: new THREE.Vector3(Math.min(...xs), -30, Math.min(...zs)), max: new THREE.Vector3(Math.max(...xs), 12.5, Math.max(...zs)) };
  });
  const { enemySpawns, coverPoints, patrolLines } = buildSpawns(mission, nav, [terminal, intel, third]);
  const s = mission.spawn, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), eye = 1.7;
  const cinematicPath = [0, 6, 12, 18].map((d, i) => ({
    pos: [s.x + fx * d + (i % 2 ? 0.6 : -0.6), s.y + eye + 0.4, s.z + fz * d],
    look: [s.x + fx * (d + 10), s.y + eye, s.z + fz * (d + 10)],
  }));
  return {
    stub: false, playerStart: { pos: v(s), yaw: s.yaw }, objectives: relays,
    extraction: { pos: v(car), radius: 3.2 }, enemySpawns, zones: [], coverPoints, patrolLines, interiorBoxes, cinematicPath,
    groundSurfaceAt: () => 'concrete', update() {},
  };
}

/**
 * 敌人出生点：原 FPS 任务里的七个守卫位置和它们的巡逻点、三个中继周围、掩体旁边。
 * 地面的（猎犬、真人）就站在楼面上；空中的（飞鸥）只取头顶有 3.8 米以上净空的地上楼层，高度定在离地 2.5–4.5 米。
 */
export function buildSpawns(mission, nav, relays) {
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
  const enemySpawns = ground.map((pos) => ({ type: 'ground', pos }));
  for (const pos of ground) {
    if (pos.y < -0.5) continue;
    const F = [...nav.floors.values()].find((f) => Math.abs(f.y - pos.y) < 0.3 && f.level?.height);
    const clear = F ? F.level.height - 0.4 : 0;
    if (clear < 3.8) continue;
    const y = pos.y + Math.min(4.5, clear - 1.3);
    if (y >= 2.5) enemySpawns.push({ type: 'air', pos: new THREE.Vector3(pos.x, y, pos.z) });
  }
  const patrolLines = mission.enemies.map((e) => e.patrol.map((p) => ({ x: p.x, y: p.y, z: p.z })));
  return { enemySpawns, coverPoints, patrolLines };
}
