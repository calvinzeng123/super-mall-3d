// Pure planner for home catalog shots. No THREE, no DOM: it runs inside the page (on
// window.__mall.ctx.layout) and in Node (on buildLayout({expansion:true})), so both agree.
// Sets globalThis.__catPlan = { findUnit, unitGeom, topCamera, roomPick, standCandidates, listLevel }.
(() => {
  const SIDES = ['N', 'S', 'W', 'E'];
  const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
  const r2 = (v) => Math.round(v * 100) / 100;
  const toW = (F, u, v) => [F.ox + u * F.c - v * F.s, F.oz + u * F.s + v * F.c];
  const frameOf = (f) => {
    const a = (f.deg * Math.PI) / 180;
    return { ox: f.ox, oz: f.oz, deg: f.deg, c: f.c ?? Math.cos(a), s: f.s ?? Math.sin(a) };
  };
  // Unit-local side -> world compass (north = -z, east = +x).
  const compass = (F, side) => {
    const d = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[side];
    const wx = d[0] * F.c - d[1] * F.s, wz = d[0] * F.s + d[1] * F.c;
    return Math.abs(wx) > Math.abs(wz) ? (wx > 0 ? 'east' : 'west') : (wz > 0 ? 'south' : 'north');
  };
  const rectW = (F, r) => {
    const pts = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].map(([u, v]) => toW(F, u, v));
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    return { x0: r2(Math.min(...xs)), x1: r2(Math.max(...xs)), z0: r2(Math.min(...zs)), z1: r2(Math.max(...zs)) };
  };

  /** Find a residence unit: spec.unit (unit id, e.g. 'W1-12F-SW' / 'T1-17F-W'),
   *  or spec.home + spec.level (residence.home, e.g. 'T1-16W' on 'T1-17F'). */
  function findUnit(layout, spec) {
    for (const lv of layout.levels) {
      if (spec.level && lv.id !== spec.level) continue;
      for (const u of lv.units || []) {
        if (!u.residence) continue;
        if (spec.unit ? u.id === spec.unit : spec.home && u.residence.home === spec.home) return { lv, u };
      }
    }
    return null;
  }

  function unitGeom(layout, spec) {
    const hit = findUnit(layout, spec);
    if (!hit) throw new Error('unit not found: ' + JSON.stringify(spec));
    const { lv, u } = hit, res = u.residence, F = frameOf(u.frame);
    const xs = u.polys[0].map((p) => p[0]), zs = u.polys[0].map((p) => p[1]);
    const bounds = { x0: r2(Math.min(...xs)), x1: r2(Math.max(...xs)), z0: r2(Math.min(...zs)), z1: r2(Math.max(...zs)) };
    return {
      unit: u.id, code: u.code, level: lv.id, building: u.building, floorY: lv.elev, height: lv.height,
      plan: res.plan, label: res.label, type: res.type, part: res.level, home: res.home, homeLevels: res.homeLevels,
      area: res.area, bedrooms: res.bedrooms, frame: { ox: F.ox, oz: F.oz, deg: F.deg },
      bounds, center: [r2((bounds.x0 + bounds.x1) / 2), r2((bounds.z0 + bounds.z1) / 2)],
      exteriorSides: (res.exteriorSides || []).map((s) => `${s}(${compass(F, s)})`),
      rooms: res.rooms.map((r) => ({ id: r.id, kind: r.kind, name: r.name, local: r.rect, world: rectW(F, r.rect),
        windows: r.windows || [] })),
    };
  }

  /** Orbit camera for the top-down cutaway: north up, tilted `tilt` degrees from vertical,
   *  framing `bounds` so that it fills `fill` of the frame (vfov in degrees, aspect w/h). */
  function topCamera(bounds, floorY, { fill = 0.85, tilt = 15, vfov = 42, aspect = 1.6, lift = 0 } = {}) {
    const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.z0 + bounds.z1) / 2;
    const W = bounds.x1 - bounds.x0, D = bounds.z1 - bounds.z0, t = (tilt * Math.PI) / 180;
    const tv = Math.tan((vfov * Math.PI) / 360), th = tv * aspect;
    // Distance along the view line so the width / depth fill `fill` of the frame (the tilt
    // foreshortens the depth by cos t). Aimed at the floor (lift 0): pos = (cx, floorY + H, cz + H tan t).
    const dist = Math.max(W / (2 * th * fill), (D * Math.cos(t)) / (2 * tv * fill));
    const H = dist * Math.cos(t), ty = floorY + lift;
    return { pos: [r2(cx), r2(ty + H), r2(cz + H * Math.tan(t))], target: [r2(cx), r2(ty), r2(cz)], H: r2(H), dist: r2(dist) };
  }

  const overlapLen = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  /** Room for an interior shot: 'living' (default: largest living, else family room, else the
   *  largest room that is not a hall/stair/void), 'master', or an explicit room id. */
  function roomPick(res, which = 'living') {
    const area = (r) => (r.rect.x1 - r.rect.x0) * (r.rect.z1 - r.rect.z0);
    const by = (kinds) => res.rooms.filter((r) => kinds.includes(r.kind)).sort((a, b) => area(b) - area(a))[0];
    if (which === 'living') return by(['living']) || by(['family']) || res.rooms.filter((r) => !['hall', 'stair', 'void', 'balcony'].includes(r.kind)).sort((a, b) => area(b) - area(a))[0];
    if (which === 'master') return res.rooms.find((r) => r.id === 'bed_master') || res.rooms.find((r) => r.kind === 'bedroom' && /主卧/.test(r.name)) || by(['bedroom']);
    return res.rooms.find((r) => r.id === which) || null;
  }
  /** Local side of the room to look at: its exterior windows (longest edge), else a balcony it
   *  opens onto, else the side facing the home's exterior. */
  function viewSide(res, room) {
    const r = room.rect, len = (s) => (s === 'N' || s === 'S' ? r.x1 - r.x0 : r.z1 - r.z0);
    const ext = new Set(res.exteriorSides || []);
    const wins = (room.windows || []).filter((s) => !ext.size || ext.has(s));
    if (wins.length) return { side: wins.sort((a, b) => len(b) - len(a))[0], why: 'window' };
    const balc = [];
    for (const b of res.rooms.filter((q) => q.kind === 'balcony')) {
      const q = b.rect;
      if (Math.abs(q.z0 - r.z1) < .05 && overlapLen(q.x0, q.x1, r.x0, r.x1) > .8) balc.push(['S', overlapLen(q.x0, q.x1, r.x0, r.x1)]);
      if (Math.abs(q.z1 - r.z0) < .05 && overlapLen(q.x0, q.x1, r.x0, r.x1) > .8) balc.push(['N', overlapLen(q.x0, q.x1, r.x0, r.x1)]);
      if (Math.abs(q.x0 - r.x1) < .05 && overlapLen(q.z0, q.z1, r.z0, r.z1) > .8) balc.push(['E', overlapLen(q.z0, q.z1, r.z0, r.z1)]);
      if (Math.abs(q.x1 - r.x0) < .05 && overlapLen(q.z0, q.z1, r.z0, r.z1) > .8) balc.push(['W', overlapLen(q.z0, q.z1, r.z0, r.z1)]);
    }
    if (balc.length) return { side: balc.sort((a, b) => b[1] - a[1])[0][0], why: 'balcony' };
    const edge = { N: r.z0, S: res.depth - r.z1, W: r.x0, E: res.width - r.x1 };
    const cands = SIDES.filter((s) => ext.has(s)).sort((a, b) => edge[a] - edge[b]);
    return { side: cands[0] || 'S', why: 'nearest-exterior' };
  }

  /** Standing points (world [x,z]) inside the room, best first, each with a look target beyond
   *  the window side. Keeps clear of beds and obstacles from the plan data. */
  function standCandidates(layout, spec, which = 'living', forceSide = null, mode = which === 'master' ? 'diag' : 'face') {
    const { lv, u } = findUnit(layout, spec), res = u.residence, F = frameOf(u.frame);
    const room = roomPick(res, which);
    if (!room) return { room: null, list: [] };
    const vs = forceSide ? { side: forceSide, why: 'forced' } : viewSide(res, room);
    const r = room.rect, side = vs.side, horiz = side === 'N' || side === 'S';
    const [a0, a1] = horiz ? [r.x0, r.x1] : [r.z0, r.z1]; // along the window edge
    const winLine = { N: r.z0, S: r.z1, W: r.x0, E: r.x1 }[side];
    const farLine = { N: r.z1, S: r.z0, W: r.x1, E: r.x0 }[side];
    const out = side === 'N' || side === 'W' ? -1 : 1; // local direction toward the window
    const depth = Math.abs(winLine - farLine), mid = (a0 + a1) / 2, half = (a1 - a0) / 2;
    const blockers = [
      ...(res.beds || []).map((b) => ({ x0: b.x - b.w / 2 - .3, x1: b.x + b.w / 2 + .3, z0: b.z - b.d / 2 - .3, z1: b.z + b.d / 2 + .3, why: 'bed' })),
      ...(res.obstacles || []).map((o) => ({ ...o.rect, x0: o.rect.x0 - .3, x1: o.rect.x1 + .3, z0: o.rect.z0 - .3, z1: o.rect.z1 + .3, why: 'obstacle' })),
    ];
    // (bed.w is its x extent and bed.d its z extent whatever the head side, as in roomPlanner.)
    const list = [];
    if (mode === 'diag') {
      // Bedroom view: from a corner on the far (door) side, aimed between the bed and the
      // window-side centre, so the bed, the window and the room all read in one frame.
      const bed = (res.beds || []).find((b) => b.room === room.id);
      const wm = horiz ? [mid, winLine] : [winLine, mid];
      const aim = bed ? [(bed.x + wm[0]) / 2, (bed.z + wm[1]) / 2] : [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
      const corners = [];
      for (const inset of [.55, .8, 1.1]) for (const s of [-1, 1]) {
        const along = s < 0 ? a0 + inset : a1 - inset;
        for (const dIn of [inset, inset + .5, 1.6]) {
          const across = farLine + out * dIn;
          corners.push(horiz ? [along, across] : [across, along]);
        }
      }
      for (const [lu, lvv] of corners) {
        if (lu < r.x0 + .35 || lu > r.x1 - .35 || lvv < r.z0 + .35 || lvv > r.z1 - .35) continue;
        if (blockers.some((q) => lu > q.x0 && lu < q.x1 && lvv > q.z0 && lvv < q.z1)) continue;
        const key = `${r2(lu)},${r2(lvv)}`;
        if (list.some((c) => c.key === key)) continue;
        // Prefer the corner from which the aim point is farthest (sees the most of the room).
        list.push({ key, inset: 'diag', lat: null, local: [r2(lu), r2(lvv)], far: Math.hypot(aim[0] - lu, aim[1] - lvv),
          stand: toW(F, lu, lvv).map(r2), look: toW(F, aim[0] + (aim[0] - lu) * 2, aim[1] + (aim[1] - lvv) * 2).map(r2) });
      }
      list.sort((a, b) => b.far - a.far);
    }
    const insets = [.7, 1.1, 1.5, .45, 2.0].filter((d) => d < depth - .4);
    const lats = [0, -.3, .3, -.55, .55];
    for (const inset of insets) for (const lf of lats) {
      const along = mid + lf * Math.max(0, half - .55);
      const across = farLine + out * inset;
      const [lu, lvv] = horiz ? [along, across] : [across, along];
      if (lu < r.x0 + .35 || lu > r.x1 - .35 || lvv < r.z0 + .35 || lvv > r.z1 - .35) continue;
      const blocked = blockers.find((q) => lu > q.x0 && lu < q.x1 && lvv > q.z0 && lvv < q.z1);
      if (blocked) continue;
      const tAcross = winLine + out * 5, tAlong = mid;
      const [tu, tv] = horiz ? [tAlong, tAcross] : [tAcross, tAlong];
      const key = `${r2(lu)},${r2(lvv)}`;
      if (list.some((c) => c.key === key)) continue;
      list.push({ key, inset, lat: lf, local: [r2(lu), r2(lvv)], stand: toW(F, lu, lvv).map(r2), look: toW(F, tu, tv).map(r2) });
    }
    // Fallback grid (e.g. a bed filling the middle of the room): any free point, farthest from
    // the window first, then nearest the room's centre line; it still looks at the window centre.
    const grid = [];
    for (let gu = r.x0 + .4; gu <= r.x1 - .4 + 1e-6; gu += .3) for (let gv = r.z0 + .4; gv <= r.z1 - .4 + 1e-6; gv += .3) {
      if (blockers.some((q) => gu > q.x0 && gu < q.x1 && gv > q.z0 && gv < q.z1)) continue;
      const across = horiz ? gv : gu, along = horiz ? gu : gv;
      const fromWin = Math.abs(across - winLine);
      if (fromWin < 1.2) continue;
      grid.push({ gu, gv, score: Math.min(fromWin, depth - .45) * 2 - Math.abs(along - mid) });
    }
    grid.sort((a, b) => b.score - a.score);
    for (const g of grid.slice(0, 12)) {
      const key = `${r2(g.gu)},${r2(g.gv)}`;
      if (list.some((c) => c.key === key)) continue;
      const [tu, tv] = horiz ? [mid, winLine + out * 5] : [winLine + out * 5, mid];
      list.push({ key, inset: 'grid', lat: null, local: [r2(g.gu), r2(g.gv)], stand: toW(F, g.gu, g.gv).map(r2), look: toW(F, tu, tv).map(r2) });
    }
    return { level: lv.id, unit: u.id, room: { id: room.id, kind: room.kind, name: room.name, local: room.rect, world: rectW(F, room.rect) },
      side, faces: compass(F, side), why: vs.why, list };
  }

  function listLevel(layout, levelId) {
    const lv = layout.levels.find((l) => l.id === levelId);
    if (!lv) throw new Error('no level ' + levelId);
    return (lv.units || []).filter((u) => u.residence).map((u) => {
      const g = unitGeom(layout, { unit: u.id });
      const liv = standCandidates(layout, { unit: u.id }, 'living');
      const mas = standCandidates(layout, { unit: u.id }, 'master');
      return { unit: g.unit, code: g.code, home: g.home, part: g.part, plan: g.plan, label: g.label, area: g.area, bedrooms: g.bedrooms,
        level: g.level, floorY: g.floorY, bounds: g.bounds, center: g.center, exteriorSides: g.exteriorSides,
        top: topCamera(g.bounds, g.floorY),
        living: liv.room && { room: liv.room.id, name: liv.room.name, faces: liv.faces, why: liv.why, stand: liv.list[0]?.stand, look: liv.list[0]?.look },
        master: mas.room && { room: mas.room.id, name: mas.room.name, faces: mas.faces, why: mas.why, stand: mas.list[0]?.stand, look: mas.list[0]?.look } };
    });
  }

  globalThis.__catPlan = { findUnit, unitGeom, topCamera, roomPick, viewSide, standCandidates, listLevel, toW, compass };
})();
