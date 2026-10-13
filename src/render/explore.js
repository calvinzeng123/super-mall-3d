// 第一人称漫游（v4 规格第 2、4、5 节）：键鼠 / 触屏输入 → 导航模型 step → 相机。
// 步行时由导航模型挡墙、换楼面、上下扶梯与坡道；飞行时自由穿行，关掉飞行落到下方楼面。
// 楼梯 / 电梯 / 落地塔在门口弹出互动面板；目录可传送；准星对准铺位或设施时显示名称。
import * as THREE from 'three';
import { buildNav, step, clear, landAt, linksNear, spawn, floorLabel, sightBlocked, NAV, yawOf } from '../layout/nav.js';
import { pointInPoly, distToPolyEdge } from '../layout/geom.js';
import { createElevatorRide, sampleElevatorRide } from '../layout/elevator-ride.js';

const WALK = 2.8, RUN = 6, FLY = 8, FLY_MAX = 30;
const JUMP = 4.5, GRAVITY = 12;
const LOOK = 0.0024, TOUCH_LOOK = 0.0055; // 每像素转多少弧度
const STICK_R = 56; // 摇杆行程（px），推过 80% 为跑
const PITCH = (85 * Math.PI) / 180;
/** 与站厅同高、通过连接口相连的地下层：在这些楼面时也显示地铁 */
const METRO_LINKED = new Set(['P1-B1M', 'P2-B1', 'P3-B1']);

export function attachExplore(app, ui) {
  const { ctx, camera, controls, renderer } = app;
  const layout = ctx.layout;
  const canvas = renderer.domElement;
  const $ = (id) => document.getElementById(id);
  const hud = {
    root: $('exHud'), where: $('exWhere'), mode: $('exMode'), card: $('exCard'), prompt: $('exPrompt'),
    help: $('exHelp'), toast: $('exToast'), fade: $('exFade'),
    stick: $('exStick'), knob: $('exKnob'), up: $('exUp'), down: $('exDown'), fly: $('exFly'),
  };

  let nav = null;
  let on = false;
  let s = null; // 导航状态 { floor, x, z, y, slope }
  let yaw = 0, pitch = 0;
  let flying = false, flyY = 0, flyHold = 0;
  let jumpY = 0, vy = 0;
  let eyeY = 0;
  let saved = null;
  let lastSpace = 0;
  let lookYaw = 0, lookPitch = 0; // 本帧累计的视角增量（弧度）
  const keys = new Set();
  const input = { stickX: 0, stickY: 0, up: false, down: false, jump: false };
  let near = [];
  let promptOpen = false;
  let shadowAt = null;
  let visTimer = 0, pickTimer = 0;
  let label = '';
  let busy = false;
  let liftRide = null;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 25;
  const center = new THREE.Vector2(0, 0);

  // ---------- 进入 / 退出 ----------
  app.enterExplore = (opts = {}) => {
    if (on) return;
    if (app.state.touring && app.stopTour) app.stopTour();
    if (!nav) nav = buildNav(layout);
    // 退出时回到进入前的俯瞰视角与选择（漫游中目录会跟着传送切换分期、楼层）
    const { building, focus, selected } = app.state;
    saved = { pos: camera.position.clone(), target: controls.target.clone(), building, focus, selected };
    const st = opts.state || spawn(nav, layout, { building: app.state.building, level: app.state.focus }) || spawn(nav, layout, {});
    on = true;
    app.cancelFlight();
    controls.enabled = false;
    app.state.exploded = false;
    for (const L of Object.values(ctx.levels)) { L.offset = 0; L.offsetTarget = 0; L.group.position.y = 0; }
    setFlying(false);
    jumpY = 0;
    vy = 0;
    place(st);
    eyeY = s.y + NAV.eye;
    app.state.explore = { building: null, metro: false, near: null, under: false };
    app.fitFov();
    document.body.classList.add('exploring');
    hud.root.hidden = false;
    hud.help.hidden = false;
    updateVisibility(true);
    syncCamera();
    app.emit();
  };

  app.exitExplore = () => {
    if (!on) return;
    on = false;
    liftRide = null;
    busy = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    closePrompt();
    keys.clear();
    endStick();
    lookTouch = null;
    Object.assign(input, { up: false, down: false, jump: false });
    document.body.classList.remove('exploring', 'ex-places');
    hud.root.hidden = true;
    app.state.explore = null;
    app.fitFov();
    Object.assign(app.state, { building: saved.building, focus: saved.focus, selected: saved.selected });
    controls.enabled = true;
    camera.position.copy(saved.pos);
    controls.target.copy(saved.target);
    controls.update();
    app.refresh();
    app.emit();
  };

  app.explore = {
    get active() { return on; },
    /** 调试：当前位置与视角 */
    get state() { return s && { ...s, yaw, pitch, flying, eyeY, riding: liftRide?.link.id || null }; },
    get navigation() { return nav; },
    rideLift(id, floor) {
      if (!on || busy || flying) return false;
      const n = linksNear(nav, s.floor, s.x, s.z).find(n => n.link.id === id);
      const stop = n?.options.find(o => o.floor === floor);
      return stop ? startLift(n.link, stop) : false;
    },
    /** 目录传送：楼栋 → 主入口内侧；楼层 → 该层出生点；铺位 → 店门外 2m 面朝店 */
    teleport(t) {
      if (!nav) nav = buildNav(layout);
      let st = null;
      if (t.unit) {
        // 店门外 2m 面朝店；门口外是中庭洞口或窄走道时往近处找可站立的点
        const u = t.unit;
        const w = u.wfronts[0];
        const y = nav.floors.get(u.level).y;
        const entry = u.residence?.entryDoor;
        const tDoor = entry ? entry.at / Math.hypot(w.x1-w.x0,w.z1-w.z0) : .5;
        const doorX = w.x0 + (w.x1-w.x0)*tDoor, doorZ = w.z0 + (w.z1-w.z0)*tDoor;
        for (const d of entry ? [.85, 1.15, 1.5, 2] : [2, 1.5, 1, 2.5, 3]) {
          const q = { floor: u.level, x: doorX + w.nx * d, z: doorZ + w.nz * d, y, slope: null, yaw: yawOf(-w.nx, -w.nz) };
          if (clear(nav, q)) { st = q; break; }
        }
      } else st = spawn(nav, layout, t);
      if (!st) return;
      if (!on) app.enterExplore({ state: st });
      else jump(st);
    },
  };

  function place(st) {
    s = { floor: st.floor, x: st.x, z: st.z, y: st.y, slope: st.slope || null };
    if (st.yaw !== undefined) yaw = st.yaw;
    pitch = 0;
  }

  /** 黑场传送（楼梯、电梯、目录） */
  function jump(st) {
    if (busy) return;
    busy = true;
    closePrompt();
    hud.fade.classList.add('on');
    setTimeout(() => {
      setFlying(false);
      place(st);
      eyeY = s.y + NAV.eye;
      updateVisibility(true);
      syncCamera();
      hud.fade.classList.remove('on');
      busy = false;
    }, 200);
  }

  // ---------- 显示规则 ----------
  function updateVisibility(force = false) {
    // 在坡道上按低端楼面算：走下地铁出入口、车库坡道时，下面的空间已经显示出来
    const F = s && !flying ? nav.floors.get(s.slope ? nav.slopeById.get(s.slope.id).low : s.floor) : null;
    let building = F && F.building ? F.building : null;
    const x = flying ? camera.position.x : s.x, z = flying ? camera.position.z : s.z;
    if (flying) {
      const b = layout.buildings.find((q) => q.kind !== 'metro' && pointInPoly([x, z], q.outline));
      building = b ? b.id : null;
    }
    const sourceLevel = F?.parentFloor || F?.level?.id || F?.id;
    let metro = !!F && (F.building === 'M' || METRO_LINKED.has(sourceLevel) || (F.building && ctx.bById[F.building]?.kind === 'tower' && F.y < 0));
    if (flying) metro = camera.position.y < -1 && Math.abs(x) < 120 && Math.abs(z) < 120;
    let nearB = null;
    if (!building || building === 'P3') {
      let best = 30;
      for (const b of layout.buildings) {
        if (b.kind !== 'mall' && b.kind !== 'tower') continue;
        if (pointInPoly([x, z], b.outline)) { nearB = b.id; break; }
        const d = distToPolyEdge([x, z], b.outline);
        if (d < best) { best = d; nearB = b.id; }
      }
    }
    const under = flying ? camera.position.y < 0 : !!F && F.y < 0;
    const level = F?.parentFloor || F?.level?.id || (building && ctx.bById[building]?.kind === 'tower'
      ? ctx.buildings[building].levels.filter(L => L.lv.elev <= camera.position.y - 0.8).at(-1)?.lv.id : null);
    const ex = app.state.explore;
    if (force || !ex || ex.building !== building || ex.metro !== metro || ex.near !== nearB || ex.under !== under || ex.level !== level) {
      app.state.explore = { building, metro, near: nearB, under, level };
      app.refresh();
    }
  }

  // ---------- 输入：键盘 ----------
  const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  window.addEventListener('keydown', (e) => {
    if (!on || typing(e)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (e.repeat) { keys.add(k); return; }
    keys.add(k);
    if (k === ' ') {
      const now = performance.now();
      if (now - lastSpace < 300) { toggleFly(); lastSpace = 0; } else { lastSpace = now; input.jump = true; }
    } else if (k === 'f') toggleFly();
    else if (k === 'e') togglePrompt();
    else if (/^[1-9]$/.test(k) && promptOpen) choose(Number(k) - 1);
    else if (k === 'Escape' && promptOpen) closePrompt();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.delete(k);
  });
  window.addEventListener('blur', () => keys.clear());

  // ---------- 输入：鼠标（指针锁定；锁不上时按住拖动） ----------
  let dragging = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!on || e.pointerType !== 'mouse') return;
    hud.help.hidden = true;
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      try {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch { /* 有的嵌入环境不允许锁定鼠标，退回拖动 */ }
    }
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointermove', (e) => {
    if (!on || e.pointerType !== 'mouse') return;
    if (document.pointerLockElement === canvas) {
      lookYaw += e.movementX * LOOK;
      lookPitch += e.movementY * LOOK;
    } else if (dragging && dragging.id === e.pointerId) {
      lookYaw += (e.clientX - dragging.x) * LOOK;
      lookPitch += (e.clientY - dragging.y) * LOOK;
      dragging.x = e.clientX;
      dragging.y = e.clientY;
    }
  });
  window.addEventListener('pointerup', (e) => { if (dragging && dragging.id === e.pointerId) dragging = null; });

  // ---------- 输入：触屏（屏幕左侧 40% 是摇杆，右侧拖动转视角；按 pointerId 区分多指） ----------
  const isTouch = () => document.body.classList.contains('touch');
  document.body.classList.toggle('touch', navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
  let stick = null; // { id, cx, cy }：按下时的摇杆中心
  let lookTouch = null; // { id, x, y }
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { document.body.classList.remove('touch'); return; }
    if (!on) return;
    document.body.classList.add('touch');
    const onStick = hud.stick.contains(e.target);
    if (e.target !== canvas && !onStick) return;
    hud.help.hidden = true;
    if (!stick && (onStick || e.clientX < window.innerWidth * 0.4)) {
      const r = hud.stick.getBoundingClientRect();
      if (onStick) stick = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      else {
        // 浮动摇杆：底座移到手指下，松手回原位
        stick = { id: e.pointerId, cx: e.clientX, cy: e.clientY };
        Object.assign(hud.stick.style, { left: `${e.clientX - r.width / 2}px`, top: `${e.clientY - r.height / 2}px`, bottom: 'auto' });
      }
      moveStick(e);
    } else if (!lookTouch && !onStick) lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointermove', (e) => {
    if (!on || e.pointerType === 'mouse') return;
    if (stick && e.pointerId === stick.id) moveStick(e);
    else if (lookTouch && e.pointerId === lookTouch.id) {
      lookYaw += (e.clientX - lookTouch.x) * TOUCH_LOOK;
      lookPitch += (e.clientY - lookTouch.y) * TOUCH_LOOK;
      lookTouch.x = e.clientX;
      lookTouch.y = e.clientY;
    }
  });
  const endTouch = (e) => {
    if (stick && e.pointerId === stick.id) endStick();
    if (lookTouch && e.pointerId === lookTouch.id) lookTouch = null;
  };
  window.addEventListener('pointerup', endTouch);
  window.addEventListener('pointercancel', endTouch);
  function moveStick(e) {
    let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    hud.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.stickX = dx / STICK_R;
    input.stickY = dy / STICK_R;
  }
  function endStick() {
    stick = null;
    input.stickX = input.stickY = 0;
    hud.knob.style.transform = '';
    Object.assign(hud.stick.style, { left: '', top: '', bottom: '' });
  }
  /** 按住型按钮（▲ ▼）：按下 on、松开 off */
  const hold = (el, down, up) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      down();
      try { el.setPointerCapture(e.pointerId); } catch { /* 手指已抬起等情况下捕获会失败，不影响按下 */ }
    });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, up);
  };
  hold(hud.up, () => { input.up = true; input.jump = true; }, () => { input.up = false; });
  hold(hud.down, () => { input.down = true; }, () => { input.down = false; });
  hud.fly.addEventListener('click', () => toggleFly());

  // ---------- HUD 按钮 ----------
  $('exExit').addEventListener('click', () => app.exitExplore());
  $('exPlaces').addEventListener('click', () => {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    document.body.classList.toggle('ex-places');
  });

  // ---------- 飞行 ----------
  function setFlying(v) {
    flying = v;
    hud.mode.textContent = v ? '飞行' : '步行';
    hud.down.hidden = !v;
    hud.fly.setAttribute('aria-pressed', String(v));
  }
  function toggleFly() {
    if (busy) return;
    if (!flying) {
      setFlying(true);
      flyY = eyeY;
      jumpY = 0;
      vy = 0;
      toast(isTouch() ? '飞行模式 · ▲ 上升 · ▼ 下降 · 再点「飞」落地' : '飞行模式 · 空格上升 · C 下降 · 再按两下空格落地');
    } else {
      const hit = landAt(nav, camera.position.x, camera.position.z, flyY - NAV.eye + 0.3);
      if (!hit) { toast('下方没有可站立的地方'); return; }
      setFlying(false);
      place({ ...hit, yaw });
      toast('步行');
    }
    updateVisibility(true);
  }

  // ---------- 楼梯 / 电梯互动 ----------
  function togglePrompt() {
    if (promptOpen) { closePrompt(); return; }
    if (!near.length) return;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    promptOpen = true;
    hud.card.hidden = true; // 选楼层时名称卡会和面板叠在一起（横屏尤其）
    renderPrompt();
  }
  function closePrompt() {
    promptOpen = false;
    renderPrompt();
  }
  function options() {
    const out = [];
    for (const n of near) {
      for (const o of n.options) {
        const F = nav.floors.get(o.floor);
        const here = nav.floors.get(n.stop.floor);
        const name = F.kind === 'level' ? F.level.short : F.kind === 'bridge' ? '天桥' : '地面';
        const verb = n.link.kind === 'stair' ? (F.y > here.y ? '上楼' : '下楼') : n.link.name;
        out.push({ text: `${verb} · ${name}`, stop: o, link: n.link });
      }
    }
    return out;
  }
  function renderPrompt() {
    const list = on && !flying ? options() : [];
    if (!list.length) { hud.prompt.hidden = true; return; }
    hud.prompt.hidden = false;
    // 触屏上面板本身就是「互动」按钮：点开选楼层，再点空白处收起
    const touch = isTouch();
    if (!promptOpen) {
      hud.prompt.innerHTML = `<span class="ex-key">${touch ? '⇅' : 'E'}</span>${esc(near[0].link.name)} · 换楼层`;
      return;
    }
    hud.prompt.innerHTML = list.map((o, i) => `<button type="button" class="ex-opt" data-i="${i}">${touch ? '' : `<span class="ex-key">${i + 1}</span>`}${esc(o.text)}</button>`).join('');
  }
  hud.prompt.addEventListener('click', (e) => {
    const b = e.target.closest('.ex-opt');
    if (b) choose(Number(b.dataset.i));
    else togglePrompt();
  });
  function choose(i) {
    const o = options()[i];
    if (!o) return;
    const st = o.stop;
    if (o.link.kind === 'lift' && ctx.elevatorCars?.has(o.link.id)) { startLift(o.link, st); return; }
    jump({ floor: st.floor, x: st.x, z: st.z, y: nav.floors.get(st.floor).y, slope: null, yaw: yawOf(st.face[0], st.face[1]) });
  }

  function startLift(link, stop) {
    const car = ctx.elevatorCars?.get(link.id);
    if (!car || busy) return false;
    const entry = link.stops.find(st => st.floor === s.floor);
    if (!entry) return false;
    // 在候梯厅先走到门中央，禁止从斜侧方向穿过玻璃门框进舱。
    const distance = Math.hypot(entry.x - s.x, entry.z - s.z);
    let approach = null;
    if (distance > 0.05) {
      let check = { ...s };
      const count = Math.ceil(distance / 0.1);
      for (let i = 0; i < count; i++) check = step(nav, check, (entry.x - s.x) / count, (entry.z - s.z) / count, 0);
      if (Math.hypot(check.x - entry.x, check.z - entry.z) > 0.05) { toast('请走到电梯门正前方再选层'); return false; }
      approach = { ...entry, y: s.y };
    }
    closePrompt();
    near = []; hud.prompt.hidden = true; hud.card.hidden = true;
    keys.clear(); endStick(); setFlying(false);
    busy = true;
    const to = { ...stop, y: nav.floors.get(stop.floor).y };
    liftRide = { ...createElevatorRide({ ...s }, to, { x: car.elevator.x, z: car.elevator.z }, approach), link, car };
    app.ensureTowerFloor?.(stop.floor);
    yaw = yawOf(car.elevator.nx, car.elevator.nz); pitch = 0;
    hud.help.hidden = true;
    return true;
  }

  function updateLift(dt) {
    const r = liftRide;
    r.elapsed += dt;
    const p = sampleElevatorRide(r, r.elapsed);
    Object.assign(s, { x: p.x, y: p.y, z: p.z, slope: null });
    // 经过哪层就显示哪层的真实内饰，观光梯外不会出现整栋空壳。
    // 每次仅切换当前经过层，仍使用全局三层缓存上限。
    const passFloor = r.link.stops.filter(st => nav.floors.get(st.floor).y <= p.y + 0.05).at(-1)?.floor;
    if (passFloor && passFloor !== r.viewFloor) {
      r.viewFloor = passFloor;
      app.state.explore = { ...app.state.explore, level: passFloor, under: p.y < 0 };
      app.refresh();
    }
    if (p.arrived) {
      s.floor = r.to.floor;
      if (!r.landed) { r.landed = true; updateVisibility(true); }
    }
    eyeY = p.y + NAV.eye;
    r.car.set(p.y, p.door, `${Math.round(p.y)}m`);
    hud.mode.textContent = p.phase;
    hud.where.textContent = `观光电梯 · ${nav.floors.get(r.to.floor).level.short} · ${Math.round(p.y)}m`;
    syncCamera();
    if (p.done) {
      r.car.set(r.to.y, 1, nav.floors.get(r.to.floor).level.short);
      liftRide = null; busy = false; label = '';
      hud.mode.textContent = '步行';
      Object.assign(app.state, { building: nav.floors.get(s.floor).building, focus: s.floor, selected: null });
      updateVisibility(true); app.emit();
      toast('已到达，可走出电梯探索本层');
    }
  }

  // ---------- 提示 ----------
  let toastTimer = 0;
  function toast(text) {
    hud.toast.textContent = text;
    hud.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { hud.toast.hidden = true; }, 2200);
  }

  // ---------- 准星拾取 ----------
  function pickCenter() {
    if (promptOpen) return;
    const cands = [];
    for (const B of Object.values(ctx.buildings)) {
      for (const L of B.levels) if (L.group.visible && L.base.visible) cands.push(...L.picks.children);
    }
    cands.push(...ctx.site.picks.children.filter((m) => m.userData.kind !== 'building' || m.userData.id === 'M'));
    camera.updateMatrixWorld();
    raycaster.setFromCamera(center, camera);
    // 拾取盒不挡射线：最近的命中若隔着楼板（看的是脚下或头顶另一层），就不显示——更远的命中同样隔着这块楼板
    const hit = raycaster.intersectObjects(cands, false)[0];
    const p = camera.position;
    if (!hit || sightBlocked(nav, [p.x, p.y, p.z], [hit.point.x, hit.point.y, hit.point.z])) { hud.card.hidden = true; return; }
    const d = hit.object.userData;
    if (d.kind === 'unit') {
      const u = d.unit;
      hud.card.innerHTML = `<b>${esc(u.brand.name)}</b><span>${esc(u.brand.en)}</span><em>${esc(u.brand.catLabel)} · ${u.code}</em>`;
    } else hud.card.innerHTML = `<b>${esc(d.title)}</b><em>${esc(d.desc || '')}</em>`;
    hud.card.hidden = false;
  }

  // ---------- 每帧 ----------
  function syncCamera() {
    const x = flying ? camera.position.x : s.x, z = flying ? camera.position.z : s.z;
    camera.position.set(x, eyeY, z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    controls.target.set(x + fx * 4, eyeY + fy * 4, z + fz * 4);
  }

  ctx.dynamic.push({
    name: 'explore',
    update(dt) {
      if (!on) return;
      dt = Math.min(dt, 0.05);
      // 视角
      yaw -= lookYaw;
      pitch = Math.max(-PITCH, Math.min(PITCH, pitch - lookPitch));
      lookYaw = lookPitch = 0;
      if (liftRide) { updateLift(dt); return; }
      if (busy) return;
      // 移动输入（局部：前进 f、右移 r）
      let f = 0, r = 0;
      if (keys.has('w') || keys.has('ArrowUp')) f += 1;
      if (keys.has('s') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('d') || keys.has('ArrowRight')) r += 1;
      if (keys.has('a') || keys.has('ArrowLeft')) r -= 1;
      f -= input.stickY;
      r += input.stickX;
      const mag = Math.min(1, Math.hypot(f, r));
      const k = mag > 1e-3 ? mag / Math.hypot(f, r) : 0;
      f *= k;
      r *= k;
      const run = keys.has('Shift') || Math.hypot(input.stickX, input.stickY) > 0.8;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      const wx = -sy * f + cy * r, wz = -cy * f - sy * r;
      if (flying) {
        const moving = mag > 0.05 || keys.has(' ') || input.up || input.down || keys.has('c') || keys.has('Control');
        flyHold = moving ? flyHold + dt : 0;
        const sp = Math.min(FLY_MAX, FLY + flyHold * 5);
        camera.position.x += wx * sp * dt;
        camera.position.z += wz * sp * dt;
        const up = (keys.has(' ') || input.up ? 1 : 0) - (keys.has('c') || keys.has('Control') || input.down ? 1 : 0);
        flyY = Math.max(-14, Math.min(400, flyY + up * sp * 0.7 * dt));
        eyeY = flyY;
      } else {
        const sp = run ? RUN : WALK;
        const dx = wx * sp * dt, dz = wz * sp * dt;
        const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
        const prev = s.floor;
        for (let i = 0; i < n; i++) s = step(nav, s, dx / n, dz / n, dt / n);
        if (input.jump && jumpY === 0 && !s.slope) vy = JUMP;
        if (vy || jumpY) {
          jumpY = Math.max(0, jumpY + vy * dt);
          vy -= GRAVITY * dt;
          if (jumpY === 0) vy = 0;
        }
        const target = s.y + NAV.eye + jumpY;
        eyeY += (target - eyeY) * (1 - Math.exp(-dt * (s.slope || jumpY ? 30 : 10)));
        if (s.floor !== prev) updateVisibility();
      }
      input.jump = false; // 跳是一次性的：飞行中按的不留到落地
      syncCamera();
      // 互动点、显示、拾取、阴影、位置名称
      visTimer += dt;
      pickTimer += dt;
      if (!flying) {
        const list = s.slope ? [] : linksNear(nav, s.floor, s.x, s.z);
        const changed = list.length !== near.length || list.some((q, i) => q.link !== near[i].link);
        near = list;
        if (changed) { if (!near.length) promptOpen = false; renderPrompt(); }
      } else if (near.length) { near = []; promptOpen = false; renderPrompt(); }
      if (visTimer > 0.5) { visTimer = 0; updateVisibility(); }
      if (pickTimer > 0.2) { pickTimer = 0; pickCenter(); }
      const p = camera.position;
      if (!shadowAt || shadowAt.distanceTo(p) > 20) {
        shadowAt = p.clone();
        app.env.setShadowFocus(new THREE.Vector3(p.x, flying ? 0 : s.y, p.z), 70);
      }
      const text = flying ? `飞行中 · ${Math.round(p.y)}m` : floorLabel(nav, layout, s);
      if (text !== label) { label = text; hud.where.textContent = text; }
    },
  });

  void ui;
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
