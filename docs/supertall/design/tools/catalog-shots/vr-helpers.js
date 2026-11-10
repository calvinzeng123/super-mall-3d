(() => {
  const app = window.__mall;
  const ex = () => app.ctx.dynamic.find(d => d.name === 'explore');
  const canvas = app.renderer.domElement;
  const $ = id => document.getElementById(id);
  const hudText = () => ({ where: $('exWhere')?.textContent, mode: $('exMode')?.textContent, prompt: $('exPrompt')?.hidden ? null : $('exPrompt')?.textContent, toast: $('exToast')?.hidden ? null : $('exToast')?.textContent, card: $('exCard')?.hidden ? null : $('exCard')?.textContent });
  const log = [];
  let last = '';
  function watch() {
    const t = $('exToast'); const v = t && !t.hidden ? t.textContent : '';
    if (v && v !== last) log.push('toast: ' + v);
    last = v;
    const pr = $('exPrompt'); const pv = pr && !pr.hidden ? pr.textContent : '';
    if (pv && pv !== watch.p) log.push('prompt: ' + pv.slice(0, 120));
    watch.p = pv;
  }
  function turn(target, pitchTo = null) {
    const st = app.explore.state;
    let d = target - st.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const dx = -d / 0.0024;
    const dy = pitchTo == null ? 0 : -(pitchTo - st.pitch) / 0.0024;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', pointerId: 7, clientX: 600, clientY: 400, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', pointerId: 7, clientX: 600 + dx, clientY: 400 + dy, movementX: dx, movementY: dy }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse', pointerId: 7 }));
    ex().update(0.001);
  }
  const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  function walkTo(tx, tz, { tol = 0.18, max = 4000, run = false } = {}) {
    let best = Infinity, stall = 0, n = 0;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    if (run) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    try {
      for (; n < max; n++) {
        const st = app.explore.state;
        const d = Math.hypot(tx - st.x, tz - st.z);
        if (d < tol) break;
        if (n % 3 === 0) turn(yawTo(st.x, st.z, tx, tz), 0);
        if (d < best - 0.01) { best = d; stall = 0; } else if (++stall > 40) break;
        ex().update(d < 0.5 ? 0.02 : 0.05);
        watch();
      }
    } finally {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
    }
    const st = app.explore.state;
    return { reached: Math.hypot(tx - st.x, tz - st.z) < tol + 0.05, floor: st.floor, x: +st.x.toFixed(2), z: +st.z.toFixed(2), y: +st.y.toFixed(2), n };
  }
  function idle(sec, dt = 0.05) { for (let t = 0; t < sec; t += dt) { ex().update(dt); watch(); } }
  function tick(sec, dt = 0.05) { let el = 0; for (let t = 0; t < sec; t += dt) { app.env.update(dt); for (const d of app.ctx.dynamic) d.update(dt, (el += dt), app); watch(); } }
  window.__vr = {
    log, hudText, turn, walkTo, idle, yawTo, tick,
    pause() { app.renderer.setAnimationLoop(null); return true; },
    go(floor, x, z, tx, tz, y) {
      if (app.explore.active) app.exitExplore();
      const nav = app.explore.navigation;
      const yy = nav ? nav.floors.get(floor).y : (y ?? 0);
      app.enterExplore({ state: { floor, x, z, y: yy, slope: null, yaw: yawTo(x, z, tx, tz) } });
      const s = app.explore.state;
      return { floor: s.floor, x: s.x, z: s.z, y: s.y };
    },
    route(points, opt) {
      const out = [];
      for (const p of points) { const r = walkTo(p[0], p[1], opt); out.push(r); if (!r.reached) break; }
      return out;
    },
    press(key) { window.dispatchEvent(new KeyboardEvent('keydown', { key })); window.dispatchEvent(new KeyboardEvent('keyup', { key })); ex().update(0.001); watch(); return hudText(); },
    look(tx, tz, pitch = 0) {
      const st = app.explore.state, want = yawTo(st.x, st.z, tx, tz);
      for (let i = 0; i < 5; i++) { turn(want, pitch); const s2 = app.explore.state; const dy = Math.atan2(Math.sin(want - s2.yaw), Math.cos(want - s2.yaw)); if (Math.abs(dy) < 0.01 && Math.abs(pitch - s2.pitch) < 0.01) break; }
      const s3 = app.explore.state; return { yaw: +s3.yaw.toFixed(3), pitch: +s3.pitch.toFixed(3), want: +want.toFixed(3) };
    },
    drain() { const l = log.splice(0); return l; },
  };
})();
(() => {
  const app = window.__mall;
  // Hide other buildings' underground levels for above-ground shots (occluded by the ground anyway) to keep swiftshader memory down.
  window.__vr.hideUnder = (on) => {
    const ex = app.state.explore; let n = 0;
    for (const B of Object.values(app.ctx.buildings)) for (const L of B.levels) {
      if (L.lv.elev >= 0 || (ex && B.b.id === ex.building)) continue;
      if (on) { if (L.group.visible) { L.group.userData.__hid = true; L.group.visible = false; n++; } }
      else if (L.group.userData.__hid) { L.group.visible = true; delete L.group.userData.__hid; n++; }
    }
    return n;
  };
  window.__vr.info = () => { const i = app.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; };
})();
(() => { try { window.__mall.renderer.domElement.requestPointerLock = null; } catch {} })();
(() => {
  // look + shot in one evaluate (no async input between them)
  window.__vr.lookShot = (tx, tz, pitch, w = 1280, h = 800) => { const r = window.__vr.look(tx, tz, pitch); const url = window.__mall.debugShot({ w, h, steps: 1 }); const s = window.__mall.explore.state; return { url, look: r, after: { yaw: +s.yaw.toFixed(3), pitch: +s.pitch.toFixed(3) } }; };
})();
