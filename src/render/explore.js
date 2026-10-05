// 第一人称漫游（v4 规格第 2、4、5 节）：键鼠 / 触屏输入 → 导航模型 step → 相机。
// 步行时由导航模型挡墙、换楼面、上下扶梯与坡道；飞行时自由穿行，关掉飞行落到下方楼面。
// 楼梯 / 电梯 / 落地塔在门口弹出互动面板；目录可传送；准星对准铺位或设施时显示名称。
import * as THREE from 'three';
import { buildNav, step, landAt, linksNear, spawn, floorLabel, sightBlocked, NAV, yawOf } from '../layout/nav.js';
import { pointInPoly, distToPolyEdge } from '../layout/geom.js';

const WALK = 2.8, RUN = 6, FLY = 8, FLY_MAX = 30;
const JUMP = 4.5, GRAVITY = 12;
const LOOK = 0.0024, TOUCH_LOOK = 0.0055;
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
  let lookX = 0, lookY = 0;
  const keys = new Set();
  const input = { stickX: 0, stickY: 0, up: false, down: false, jump: false };
  let near = [];
  let promptOpen = false;
  let shadowAt = null;
  let visTimer = 0, pickTimer = 0;
  let label = '';
  let busy = false;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 25;
  const center = new THREE.Vector2(0, 0);

  // ---------- 进入 / 退出 ----------
  app.enterExplore = (opts = {}) => {
    if (on) return;
    if (app.state.touring && app.stopTour) app.stopTour();
    if (!nav) nav = buildNav(layout);
    saved = { pos: camera.position.clone(), target: controls.target.clone() };
    const st = opts.state || spawn(nav, layout, { building: app.state.building, level: app.state.focus }) || spawn(nav, layout, {});
    on = true;
    app.cancelFlight();
    controls.enabled = false;
    app.state.exploded = false;
    for (const L of Object.values(ctx.levels)) { L.offset = 0; L.offsetTarget = 0; L.group.position.y = 0; }
    flying = false;
    jumpY = 0;
    vy = 0;
    place(st);
    eyeY = s.y + NAV.eye;
    app.state.explore = { building: null, metro: false, near: null, under: false };
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
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    closePrompt();
    keys.clear();
    Object.assign(input, { stickX: 0, stickY: 0, up: false, down: false, jump: false });
    document.body.classList.remove('exploring', 'ex-places');
    hud.root.hidden = true;
    app.state.explore = null;
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
    get state() { return s && { ...s, yaw, pitch, flying, eyeY }; },
    /** 目录传送：楼栋 → 主入口内侧；楼层 → 该层出生点；铺位 → 店门外 2m 面朝店 */
    teleport(t) {
      if (!nav) nav = buildNav(layout);
      let st = null;
      if (t.unit) {
        const u = t.unit;
        const w = u.wfronts[0];
        const x = (w.x0 + w.x1) / 2 + w.nx * 2, z = (w.z0 + w.z1) / 2 + w.nz * 2;
        st = { floor: u.level, x, z, y: nav.floors.get(u.level).y, slope: null, yaw: yawOf(-w.nx, -w.nz) };
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
      flying = false;
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
    let metro = !!F && (F.building === 'M' || METRO_LINKED.has(F.id));
    if (flying) metro = camera.position.y < -1 && Math.abs(x) < 120 && Math.abs(z) < 120;
    let nearB = null;
    if (!building || building === 'P3') {
      let best = 30;
      for (const b of layout.buildings) {
        if (b.kind !== 'mall') continue;
        if (pointInPoly([x, z], b.outline)) { nearB = b.id; break; }
        const d = distToPolyEdge([x, z], b.outline);
        if (d < best) { best = d; nearB = b.id; }
      }
    }
    const under = flying ? camera.position.y < 0 : !!F && F.y < 0;
    const ex = app.state.explore;
    if (force || !ex || ex.building !== building || ex.metro !== metro || ex.near !== nearB || ex.under !== under) {
      app.state.explore = { building, metro, near: nearB, under };
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
      lookX += e.movementX;
      lookY += e.movementY;
    } else if (dragging && dragging.id === e.pointerId) {
      lookX += e.clientX - dragging.x;
      lookY += e.clientY - dragging.y;
      dragging.x = e.clientX;
      dragging.y = e.clientY;
    }
  });
  window.addEventListener('pointerup', (e) => { if (dragging && dragging.id === e.pointerId) dragging = null; });

  // ---------- HUD 按钮 ----------
  $('exExit').addEventListener('click', () => app.exitExplore());
  $('exPlaces').addEventListener('click', () => {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    document.body.classList.toggle('ex-places');
  });

  // ---------- 飞行 ----------
  function toggleFly() {
    if (!flying) {
      flying = true;
      flyY = eyeY;
      jumpY = 0;
      vy = 0;
      toast('飞行模式 · 空格上升 · C 下降 · 再按两下空格落地');
    } else {
      const hit = landAt(nav, camera.position.x, camera.position.z, flyY - NAV.eye + 0.3);
      if (!hit) { toast('下方没有可站立的地方'); return; }
      flying = false;
      place({ ...hit, yaw });
      toast('步行');
    }
    hud.mode.textContent = flying ? '飞行' : '步行';
    updateVisibility(true);
  }

  // ---------- 楼梯 / 电梯互动 ----------
  function togglePrompt() {
    if (promptOpen) { closePrompt(); return; }
    if (!near.length) return;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    promptOpen = true;
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
        out.push({ text: `${verb} · ${name}`, stop: o });
      }
    }
    return out;
  }
  function renderPrompt() {
    const list = on && !flying ? options() : [];
    if (!list.length) { hud.prompt.hidden = true; return; }
    hud.prompt.hidden = false;
    if (!promptOpen) {
      hud.prompt.innerHTML = `<span class="ex-key">E</span>${esc(near[0].link.name)} · 换楼层`;
      return;
    }
    hud.prompt.innerHTML = list.map((o, i) => `<button type="button" class="ex-opt" data-i="${i}"><span class="ex-key">${i + 1}</span>${esc(o.text)}</button>`).join('');
  }
  hud.prompt.addEventListener('click', (e) => {
    const b = e.target.closest('.ex-opt');
    if (b) choose(Number(b.dataset.i));
    else if (!promptOpen) togglePrompt();
  });
  function choose(i) {
    const o = options()[i];
    if (!o) return;
    const st = o.stop;
    jump({ floor: st.floor, x: st.x, z: st.z, y: nav.floors.get(st.floor).y, slope: null, yaw: yawOf(st.face[0], st.face[1]) });
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
      const touchK = app.state.touchLook ? TOUCH_LOOK : LOOK;
      yaw -= lookX * touchK;
      pitch = Math.max(-PITCH, Math.min(PITCH, pitch - lookY * touchK));
      lookX = lookY = 0;
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
        if ((input.jump || input.up) && jumpY === 0 && !s.slope) vy = JUMP;
        input.jump = false;
        if (vy || jumpY) {
          jumpY = Math.max(0, jumpY + vy * dt);
          vy -= GRAVITY * dt;
          if (jumpY === 0) vy = 0;
        }
        const target = s.y + NAV.eye + jumpY;
        eyeY += (target - eyeY) * (1 - Math.exp(-dt * (s.slope || jumpY ? 30 : 10)));
        if (s.floor !== prev) updateVisibility();
      }
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
