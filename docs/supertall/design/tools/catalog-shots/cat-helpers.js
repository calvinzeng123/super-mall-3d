// In-page catalog helpers (evaluated after vr-helpers.js and plan-core.js). window.__cat.
(() => {
  const app = window.__mall, P = globalThis.__catPlan, V = window.__vr;
  const layout = app.ctx.layout;
  // JPEG quality for debugShot (it asks for 0.86; the catalog uses window.__catJpegQ).
  if (!HTMLCanvasElement.prototype.__catPatched) {
    const orig = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (type, q) {
      return orig.call(this, type, type === 'image/jpeg' && window.__catJpegQ ? window.__catJpegQ : q);
    };
    HTMLCanvasElement.prototype.__catPatched = true;
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  const pointIn = (poly, x, z) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  /** Residence unit (on the given level) whose footprint contains (x, z). */
  function unitAt(levelId, x, z) {
    const lv = app.ctx.lvById[levelId];
    const u = (lv?.units || []).find((q) => q.residence && q.polys?.some((p) => pointIn(p, x, z)));
    return u ? { unit: u.id, code: u.code, home: u.residence.home, plan: u.residence.plan } : null;
  }
  /** Room (plan data) of a unit containing world (x, z). */
  function roomAt(unitId, x, z) {
    const hit = P.findUnit(layout, { unit: unitId });
    if (!hit) return null;
    const F = hit.u.frame, dx = x - F.ox, dz = z - F.oz, c = F.c ?? Math.cos(F.deg * Math.PI / 180), s = F.s ?? Math.sin(F.deg * Math.PI / 180);
    const u = dx * c + dz * s, v = -dx * s + dz * c;
    const r = hit.u.residence.rooms.find((q) => u >= q.rect.x0 && u <= q.rect.x1 && v >= q.rect.z0 && v <= q.rect.z1);
    return r ? { id: r.id, name: r.name, kind: r.kind } : null;
  }

  // ---- Ray probe without THREE: Mesh.raycast only needs ray.origin / ray.direction (Vector3s).
  const Vec = app.camera.position.constructor;
  /** Visible meshes whose bounding sphere comes within `reach` m of origin. */
  function meshesNear(origin, reach = 12) {
    const out = [];
    app.scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isInstancedMesh) || !o.material) return;
      const b = o.isInstancedMesh ? o.boundingSphere : o.geometry?.boundingSphere;
      if (!b) { out.push(o); return; }
      const c = b.center.clone().applyMatrix4(o.matrixWorld), r = b.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (c.distanceTo(origin) - r < reach) out.push(o);
    });
    return out;
  }
  function castFrom(meshes, origin, dir, maxDist = 12) {
    const rc = { ray: { origin, direction: dir }, near: 0, far: maxDist, camera: app.camera, layers: app.camera.layers,
      params: { Mesh: {}, Line: { threshold: 1 }, LOD: {}, Points: { threshold: 1 }, Sprite: {} }, firstHitOnly: false };
    let best = null;
    for (const o of meshes) {
      const hits = [];
      try { o.raycast(rc, hits); } catch { continue; }
      for (const h of hits) {
        if (h.distance > maxDist) continue;
        const m = Array.isArray(o.material) ? o.material[h.face?.materialIndex ?? 0] || o.material[0] : o.material;
        if (m && (m.visible === false || (m.transparent && m.opacity < 0.35))) continue; // glass / invisible pick boxes
        if (!best || h.distance < best.distance) best = { distance: h.distance, name: o.name || o.parent?.name || o.type };
      }
    }
    return best ? { d: r2(best.distance), obj: String(best.name).slice(0, 40) } : { d: null };
  }
  /** Clearance from the current explore eye: forward (and +-25 deg), down. */
  function probe() {
    app.camera.updateMatrixWorld(true);
    const o = app.camera.position.clone();
    const fwd = new Vec(0, 0, -1).applyQuaternion(app.camera.quaternion).normalize();
    const yawOnly = new Vec(fwd.x, 0, fwd.z).normalize();
    const rot = (v, a) => new Vec(v.x * Math.cos(a) + v.z * Math.sin(a), 0, -v.x * Math.sin(a) + v.z * Math.cos(a)).normalize();
    const ms = meshesNear(o, 12);
    return {
      fwd: castFrom(ms, o, fwd), left: castFrom(ms, o, rot(yawOnly, 0.45)), right: castFrom(ms, o, rot(yawOnly, -0.45)),
      down: castFrom(ms, o, new Vec(0, -1, 0), 3), meshes: ms.length,
    };
  }
  const probeOk = (p, eye) => (p.fwd.d == null || p.fwd.d >= 1.3) && (p.left.d == null || p.left.d >= 0.6) && (p.right.d == null || p.right.d >= 0.6)
    && (p.down.d == null || p.down.d >= eye - 0.17);

  /** Mean / std of luma of a JPEG dataURL (64x40 sample). */
  async function stats(url) {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = 64; c.height = 40;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 40);
    const d = g.getImageData(0, 0, 64, 40).data;
    let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; s += y; s2 += y * y; n++; }
    const mean = s / n, std = Math.sqrt(Math.max(0, s2 / n - mean * mean));
    return { mean: r2(mean), std: r2(std), blank: mean < 10 || std < 6 };
  }

  const hidden = [];
  function hideBuildings(ids) {
    for (const id of ids) { const B = app.ctx.buildings[id]; if (B && B.group.visible) { B.group.visible = false; hidden.push(B); } }
  }
  function restore() { while (hidden.length) hidden.pop().group.visible = true; }
  /** Towers (other than `bid`) whose footprint lies within `radius` m of (cx, cz). */
  function nearTowers(bid, cx, cz, radius = 60) {
    const out = [];
    for (const b of layout.buildings) {
      if (b.id === bid || b.kind !== 'tower') continue;
      const lvs = layout.levels.filter((l) => l.building === b.id && l.outline?.length);
      const pts = lvs.flatMap((l) => l.outline);
      if (!pts.length) continue;
      const d = Math.min(...pts.map(([x, z]) => Math.hypot(x - cx, z - cz)));
      if (d < radius) out.push(b.id);
    }
    return out;
  }

  window.__cat = {
    unitAt, roomAt, probe, stats, restore, nearTowers,
    geom: (spec) => P.unitGeom(layout, spec),
    /** Step 1 of a top shot: orbit mode, daytime, labels off, focus the unit's level. */
    focusFor(spec) {
      const g = P.unitGeom(layout, spec);
      if (app.explore.active) app.exitExplore();
      app.setNight(false); app.setLabels(false);
      app.setFocus(g.level); app.cancelFlight();
      return { level: g.level, building: app.state.building, focus: app.state.focus, fov: app.camera.fov };
    },
    /** Step 2: frame, hide neighbouring towers, render. Returns { url, cam, ... }. */
    topShot(spec) {
      const g = P.unitGeom(layout, spec);
      const b = spec.bounds || g.bounds;
      const cam = spec.pos && spec.target ? { pos: spec.pos, target: spec.target }
        : P.topCamera(b, g.floorY, { fill: spec.fill ?? 0.85, tilt: spec.tilt ?? 15, vfov: app.camera.fov, aspect: (spec.w || 1280) / (spec.h || 800), lift: spec.lift ?? 0 });
      const hide = spec.hide ?? (spec.hideOthers === false ? [] : nearTowers(g.building, g.center[0], g.center[1]));
      app.setFocus(g.level); app.cancelFlight();
      V.tick(0.3);
      hideBuildings(hide);
      let url;
      try { url = app.debugShot({ w: spec.w || 1280, h: spec.h || 800, steps: spec.steps ?? 2, pos: cam.pos, target: cam.target }); }
      finally { restore(); }
      // Where the home's floor rectangle and its wall tops land in the image (0..1, y down).
      app.camera.updateMatrixWorld(true);
      const box = (y) => {
        const pts = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]].map(([x, z]) => new Vec(x, y, z).project(app.camera));
        const xs = pts.map((p) => (p.x + 1) / 2), ys = pts.map((p) => (1 - p.y) / 2);
        return { x0: r2(Math.min(...xs)), x1: r2(Math.max(...xs)), y0: r2(Math.min(...ys)), y1: r2(Math.max(...ys)) };
      };
      const screen = { floor: box(g.floorY), wallTop: box(g.floorY + g.height) };
      return { url, cam, hidden: hide, focus: app.state.focus, bounds: b, screen, unit: g.unit, code: g.code, plan: g.plan, label: g.label };
    },
    /** Step 1 of an interior shot: enter explore at the first candidate (so the floor loads). */
    enterFor(spec) {
      const c = window.__cat.candidates(spec);
      const first = c.list[0];
      if (!first) return { err: 'no standing point', room: c.room };
      V.go(c.level, first.stand[0], first.stand[1], first.look[0], first.look[1], app.ctx.lvById[c.level].elev);
      return { level: c.level, room: c.room, side: c.side, faces: c.faces, why: c.why, n: c.list.length };
    },
    candidates(spec) {
      if (spec.stand) {
        const g = spec.unit || spec.home ? P.unitGeom(layout, spec) : null;
        const level = spec.level || g?.level;
        if (!level || !app.ctx.lvById[level]) throw new Error('explore shot needs level (or unit/home): ' + JSON.stringify(spec));
        return { level, unit: g?.unit || null, room: { id: spec.room || 'custom' }, side: null, faces: null, why: 'given',
          list: [{ stand: spec.stand, look: spec.look || (g ? g.center : [spec.stand[0], spec.stand[1] - 5]) }] };
      }
      return P.standCandidates(layout, spec, spec.room || 'living', spec.side || null, spec.mode || (spec.room === 'master' ? 'diag' : 'face'));
    },
    /** Step 2: try candidates in order until the probe is clear, then render. */
    interiorShot(spec) {
      const c = window.__cat.candidates(spec);
      const pitch = spec.pitch ?? -0.08, tries = [];
      let pick = null;
      for (const cand of c.list.slice(0, spec.maxTries ?? 14)) {
        V.go(c.level, cand.stand[0], cand.stand[1], cand.look[0], cand.look[1], app.ctx.lvById[c.level].elev);
        V.idle(0.25);
        V.look(cand.look[0], cand.look[1], pitch);
        V.tick(0.15);
        const st = app.explore.state;
        const pr = probe();
        const ok = probeOk(pr, st.eyeY - st.y) && st.floor === c.level && Math.hypot(st.x - cand.stand[0], st.z - cand.stand[1]) < 0.3;
        tries.push({ stand: cand.stand, ok, probe: pr, floor: st.floor });
        if (ok || spec.stand) { pick = cand; break; }
      }
      if (!pick) { // none clear: fall back to the first candidate (logged as unclear)
        pick = c.list[0];
        V.go(c.level, pick.stand[0], pick.stand[1], pick.look[0], pick.look[1], app.ctx.lvById[c.level].elev); V.idle(0.25); V.look(pick.look[0], pick.look[1], pitch); V.tick(0.15);
      }
      V.hideUnder(true);
      V.idle(0.3); // let the HUD label / centre pick refresh
      V.look(pick.look[0], pick.look[1], pitch);
      const st = app.explore.state;
      const hud = V.hudText();
      const at = unitAt(c.level, st.x, st.z);
      const url = app.debugShot({ w: spec.w || 1280, h: spec.h || 800, steps: spec.steps ?? 1 });
      return { url, level: c.level, room: c.room, side: c.side, faces: c.faces, why: c.why,
        stand: [r2(st.x), r2(st.z)], look: pick.look, eye: r2(st.eyeY - st.y), floorY: r2(st.y), yaw: r2(st.yaw), pitch: r2(st.pitch),
        clear: tries.length ? tries[tries.length - 1].ok : null, tries: tries.length, probe: tries[tries.length - 1]?.probe,
        hud, unitAt: at, roomAt: at ? roomAt(at.unit, st.x, st.z) : null };
    },
  };
})();
