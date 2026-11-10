// 无人机送外卖：从商场天台取餐，飞到各栋楼顶投递。规则在 drone-rules.js，这里是画面、相机和 HUD。
import * as THREE from 'three';
import { buildAirspace } from '../airspace.js';
import { DRONE, DRONE_LEVELS, dronePads, buildOrders, windAt, newRun, stepRun, runTarget, runResult, pilotAxes } from './drone-rules.js';

const CSS = `
.dr-order{position:absolute;left:calc(12px + env(safe-area-inset-left,0px));top:calc(10px + env(safe-area-inset-top,0px));max-width:min(360px,62vw);background:#0c1a25d9;border:1px solid #8da9ba55;border-radius:13px;padding:9px 13px}
.dr-order b{display:block;color:#e8b876;font-size:12.5px;letter-spacing:.04em}.dr-order span{display:block;font-size:15px;font-weight:600}.dr-order em{display:block;font-style:normal;color:#a9bac6;font-size:12.5px}
.dr-stats{position:absolute;left:50%;top:calc(58px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:flex;gap:12px;align-items:center;background:#0c1a25d9;border:1px solid #8da9ba55;border-radius:13px;padding:7px 14px;white-space:nowrap;font-variant-numeric:tabular-nums}
.dr-time{font-size:19px;font-weight:700}.dr-time[data-low="1"]{color:#ff8f7a}
.dr-batt{width:92px;height:10px;border-radius:6px;background:#22394a;overflow:hidden;display:inline-block}.dr-batt i{display:block;height:100%;background:#7be0a3}.dr-batt[data-low="1"] i{background:#ff8f7a}
.dr-arrow{position:absolute;left:50%;top:calc(106px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:flex;align-items:center;gap:9px;font-variant-numeric:tabular-nums;text-shadow:0 1px 3px #000}
.dr-arrow i{width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:23px solid #4fd8ff;filter:drop-shadow(0 1px 2px #000)}
.dr-hold{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);width:150px;height:8px;border-radius:5px;background:#0c1a25cc;overflow:hidden}.dr-hold i{display:block;height:100%;width:0;background:#e8b876}
@media(max-width:600px){.dr-stats{gap:8px;padding:6px 10px;font-size:12.5px}.dr-batt{width:64px}.dr-arrow{top:calc(98px + env(safe-area-inset-top,0px))}}
`;

const mmss = (sec) => { const s = Math.max(0, Math.ceil(sec)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const CAM_BACK = 11.5, CAM_UP = 4.4; // 追尾相机在机身后上方多远
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function droneModel() {
  const group = new THREE.Group(), tilt = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 1.1), dark);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xffb648 }));
  nose.position.set(0, 0.04, -0.62); // 机头朝 −Z
  tilt.add(body, nose);
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0xdfe9f0, transparent: true, opacity: 0.45, depthWrite: false });
  const rotors = [];
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 1.3), dark);
    arm.position.set(x / 2, 0, z / 2); arm.rotation.y = Math.atan2(x, z);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 18), rotorMat);
    rotor.position.set(x, 0.14, z);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: z < 0 ? 0x7dffb0 : 0xff5a4a }));
    led.position.set(x, -0.05, z);
    tilt.add(arm, rotor, led); rotors.push(rotor);
  }
  const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), new THREE.MeshStandardMaterial({ color: 0xf2a23a, roughness: 0.8 }));
  parcel.position.y = -0.42; parcel.visible = false;
  tilt.add(parcel);
  group.add(tilt);
  group.scale.setScalar(1.15);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, tilt, rotors, parcel };
}

function padMarker(pad, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(DRONE.padRadius * 0.74, DRONE.padRadius, 40), mat);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(DRONE.padRadius * 0.28, 24), mat);
  ring.rotation.x = dot.rotation.x = -Math.PI / 2;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 110, 14, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 55;
  g.add(ring, dot, beam);
  g.position.set(pad.x, pad.y + 0.14, pad.z);
  g.renderOrder = 5;
  return { group: g, beam, mat };
}

export async function createGame({ app, layout, level, hud, input, rng, toast, finish }) {
  const cfg = DRONE_LEVELS[level.id] || DRONE_LEVELS.lunch;
  const air = buildAirspace(layout);
  const pads = dronePads(layout, air), hubPad = pads[0];
  const orders = buildOrders(layout, pads, cfg, rng);
  const { camera, controls, scene, state } = app;

  // 接管视角：回到园区总览（外观全开）、关标注、相机归游戏
  if (app.explore?.active) app.exitExplore();
  if (state.touring) app.stopTour?.();
  if (state.building || state.focus) app.setBuilding(null);
  app.cancelFlight();
  const saved = { pos: camera.position.clone(), target: controls.target.clone(), labels: state.labels, night: state.night, enabled: controls.enabled };
  app.setLabels(false);
  app.setNight(cfg.night);
  state.arcadeCamera = true;
  controls.enabled = false;
  input.enable({ sticks: true });

  const world = new THREE.Group();
  world.name = 'arcade-drone';
  const model = droneModel();
  world.add(model.group);
  const markers = new Map();
  for (const pad of new Set([hubPad, ...orders.map((o) => o.to)])) {
    const m = padMarker(pad, pad.hub ? 0xffb648 : 0x4fd8ff);
    markers.set(pad.id, m); world.add(m.group);
  }
  scene.add(world);

  const style = document.createElement('style'); style.textContent = CSS;
  const ui = document.createElement('div');
  ui.innerHTML = `<div class="dr-order"><b></b><span></span><em></em></div>
    <div class="dr-stats"><span class="dr-time"></span><span class="dr-batt"><i></i></span><span class="dr-alt"></span><span class="dr-wind"></span></div>
    <div class="dr-arrow"><i></i><span></span></div><div class="dr-hold" hidden><i></i></div>`;
  hud.append(style, ui);
  const $ = (sel) => ui.querySelector(sel);
  const dom = { no: $('.dr-order b'), route: $('.dr-order span'), task: $('.dr-order em'), time: $('.dr-time'), batt: $('.dr-batt'), battFill: $('.dr-batt i'),
    alt: $('.dr-alt'), wind: $('.dr-wind'), arrow: $('.dr-arrow i'), dist: $('.dr-arrow span'), hold: $('.dr-hold'), holdFill: $('.dr-hold i') };

  const run = newRun(cfg, orders, hubPad), s = run.drone;
  s.yaw = Math.atan2(-(orders[0].to.x - hubPad.x), -(orders[0].to.z - hubPad.z)); // 机头先朝第一单的方向
  let hudClock = 0, shadowClock = 0, autopilot = false;
  const camPos = new THREE.Vector3(s.x + Math.sin(s.yaw) * CAM_BACK, s.y + CAM_UP, s.z + Math.cos(s.yaw) * CAM_BACK);
  const want = new THREE.Vector3(), look = new THREE.Vector3(), focus = new THREE.Vector3();

  function end() {
    const r = runResult(run);
    finish({
      success: r.success, stars: r.stars, score: r.score, seconds: r.seconds,
      title: r.success ? '全部送达' : run.reason === 'time' ? '时间到' : '收工',
      lines: [`送达 ${r.delivered} / ${r.total} 单`, `用时 ${mmss(r.seconds)}，还剩 ${mmss(r.timeLeft)}`, `碰撞 ${r.crashes} 次${r.swaps ? `，中途换电 ${r.swaps} 次` : ''}`],
    });
  }

  function drawHud() {
    const pad = runTarget(run), { index, delivered, phase, hold, timeLeft, t } = run, o = orders[Math.min(index, orders.length - 1)];
    dom.no.textContent = `第 ${Math.min(index + 1, orders.length)} / ${orders.length} 单 · 已送达 ${delivered}`;
    dom.route.textContent = `${o.shop.name} → ${o.to.name}`;
    dom.task.textContent = phase === 'pickup' ? '回商场天台的取餐点（橙色光柱），悬停取餐' : '飞到蓝色光柱下的停机坪，悬停投递';
    dom.time.textContent = mmss(timeLeft); dom.time.dataset.low = timeLeft < 30 ? '1' : '0';
    dom.battFill.style.width = `${s.battery.toFixed(0)}%`; dom.batt.dataset.low = s.battery < 25 ? '1' : '0';
    dom.alt.textContent = `高 ${Math.round(s.y)} m`;
    const w = windAt(t, cfg.wind, s.y);
    dom.wind.textContent = cfg.wind ? `风 ${Math.hypot(w.x, w.z).toFixed(1)} m/s` : `速 ${Math.round(Math.hypot(s.vx, s.vz))} m/s`;
    const dx = pad.x - s.x, dz = pad.z - s.z, rel = wrapPi(Math.atan2(-dx, -dz) - s.yaw), dy = pad.y - (s.y - DRONE.radius);
    dom.arrow.style.transform = `rotate(${(-rel * 180 / Math.PI).toFixed(0)}deg)`;
    dom.arrow.style.borderBottomColor = pad.hub ? '#ffb648' : '#4fd8ff';
    dom.dist.textContent = `${Math.round(Math.hypot(dx, dz))} m · ${Math.abs(dy) < 2 ? '高度正好' : dy > 0 ? `↑ ${Math.round(dy)} m` : `↓ ${Math.round(-dy)} m`}`;
    dom.hold.hidden = hold <= 0; dom.holdFill.style.width = `${Math.min(100, hold / DRONE.holdSeconds * 100)}%`;
  }

  function update(dt) {
    if (run.ended) return;
    for (const e of stepRun(run, autopilot ? pilotAxes(run) : input.axes(), dt, air)) {
      if (e.type === 'crash') toast(`撞到了 · 电量 −${DRONE.crashBattery}%`, 1.4);
      else if (e.type === 'swap') {
        camPos.set(s.x + Math.sin(s.yaw) * CAM_BACK, s.y + CAM_UP, s.z + Math.cos(s.yaw) * CAM_BACK);
        toast(`电量耗尽 · 已自动返航换电（−${DRONE.swapPenalty} 秒）`, 3);
      } else if (e.type === 'pickup') toast(`已取餐：${e.order.shop.name} → ${e.order.to.name}`);
      else if (e.type === 'deliver') toast(`送达 · ${run.delivered} / ${orders.length}`);
      else if (e.type === 'end') { drawHud(); end(); return; }
    }
    const pad = runTarget(run), t = run.t;

    // 画面：机身、桨、光柱
    model.group.position.set(s.x, s.y, s.z);
    model.group.rotation.y = s.yaw;
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const fwd = s.vx * fx + s.vz * fz, side = s.vx * Math.cos(s.yaw) - s.vz * Math.sin(s.yaw);
    model.tilt.rotation.x += (-fwd / DRONE.speed * 0.38 - model.tilt.rotation.x) * Math.min(1, dt * 6);
    model.tilt.rotation.z += (-side / DRONE.strafe * 0.3 - model.tilt.rotation.z) * Math.min(1, dt * 6);
    for (const r of model.rotors) r.rotation.y += dt * 40;
    model.parcel.visible = run.phase === 'deliver';
    for (const [id, m] of markers) {
      const active = id === pad.id;
      m.beam.visible = active; m.mat.opacity = active ? 0.95 : 0.35;
      if (active) m.beam.material.opacity = 0.16 + 0.08 * Math.sin(t * 4);
    }
    // 追尾相机：在机身后上方，钻进楼里时往前收
    want.set(s.x - fx * CAM_BACK, s.y + CAM_UP, s.z - fz * CAM_BACK);
    camPos.lerp(want, 1 - Math.exp(-dt * 5));
    for (let i = 0; i < 6 && (air.hit(camPos.x, camPos.y, camPos.z, 0.5) || camPos.y < air.ground(camPos.x, camPos.z) + 0.6); i++) {
      camPos.lerp(focus.set(s.x, s.y + 1.2, s.z), 0.3);
    }
    camera.position.copy(camPos);
    camera.lookAt(look.set(s.x + fx * 5, s.y + 0.4, s.z + fz * 5));
    controls.target.set(s.x, s.y, s.z);
    if ((shadowClock -= dt) <= 0) { shadowClock = 0.6; app.env.setShadowFocus(focus.set(s.x, 0, s.z).clone(), 240); }
    if ((hudClock -= dt) <= 0) { hudClock = 0.1; drawHud(); }
  }

  update(0);
  toast(`${orders.length} 单 · ${mmss(cfg.seconds)} · 先在取餐点悬停取餐`, 3.2);

  return {
    update,
    dispose() {
      scene.remove(world);
      world.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) m.dispose(); });
      input.disable();
      state.arcadeCamera = false;
      controls.enabled = saved.enabled;
      camera.position.copy(saved.pos); controls.target.copy(saved.target); controls.update();
      app.setNight(saved.night); app.setLabels(saved.labels);
      app.setBuilding(null);
    },
    /** 调试 / 自动化 */
    setAutopilot(on) { autopilot = !!on; },
    get debug() { return { drone: { ...s }, phase: run.phase, index: run.index, delivered: run.delivered, crashes: run.crashes, swaps: run.swaps, timeLeft: run.timeLeft, target: runTarget(run).id, pads: pads.map((p) => p.id), orders: orders.map((o) => `${o.shop.name}→${o.to.id}`) }; },
  };
}
