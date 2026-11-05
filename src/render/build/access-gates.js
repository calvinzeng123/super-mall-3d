// 住户刷卡门禁的渲染：闸机机柜、门轨与侧挡玻璃、读卡器写入所在楼层的批次；
// 每个有门禁的楼层只有两个实例化网格（门扇、指示灯），门扇开合 0.35 s 动画。
// 关闭的门扇横跨通道，与导航中的实体墙一致；“所见即所挡”。
import * as THREE from 'three';
import { toW } from '../../layout/geom.js';

export const GATE_COLORS = Object.freeze({ idle: 0x3aa0ff, granted: 0x3ddc84, denied: 0xff5a4f });
const OPEN_TIME = 0.35, DENIED = 0.6;

/**
 * Leaf boxes of one gate in its own frame (u along the line, v > 0 residents' side)
 * at openness t ∈ [0, 1]: { u, v, w (along u), d (along v), h, y, ry }.
 * Speed gates: two swing flaps per lane hinged at the cabinet faces, swinging 90° to the
 * residents' side. Glass doors: two sliding leaves per lane, sliding behind the sidelights.
 */
export function gateLeafBoxes(g, t) {
  const out = [];
  for (const l of g.lanes) {
    const w = l.u1 - l.u0, c = (l.u0 + l.u1) / 2;
    if (g.kind === 'speed-gates') {
      // Each flap reaches 1 cm past the lane centre (the pair overlaps, offset ±1.5 cm), so a
      // closed lane reads as shut exactly where navigation blocks it.
      const len = w / 2, a = t * Math.PI / 2;
      for (const [pu, sign] of [[l.u0, 1], [l.u1, -1]]) {
        const du = sign * Math.cos(a), dv = Math.sin(a), off = sign * .015 * (1 - t);
        out.push({ u: pu + sign * .01 + du * len / 2, v: dv * len / 2 + off, w: len, d: .02, h: .9, y: .65, ry: Math.atan2(dv, du) });
      }
    } else {
      const lw = w / 2 + .06, slide = t * w / 2;
      out.push({ u: l.u0 - .05 + lw / 2 - slide, v: -.03, w: lw, d: .02, h: 2.2, y: 1.12, ry: 0 });
      out.push({ u: l.u1 + .05 - lw / 2 + slide, v: .03, w: lw, d: .02, h: 2.2, y: 1.12, ry: 0 });
    }
    void c;
  }
  return out;
}

/** Static parts of a gate in its frame (cabinets, track, sidelights, reader) into the level batch. */
function gateStatics(B, g, y0) {
  B.frame(g.frame, () => {
    if (g.kind === 'speed-gates') {
      for (const c of g.cabinets) {
        const u = (c.u0 + c.u1) / 2, w = c.u1 - c.u0, d = c.v1 - c.v0, v = (c.v0 + c.v1) / 2;
        B.get('satin').box(u, y0 + .5, v, w, 1.0, d, '#d7dce1');
        B.get('metal').box(u, y0 + 1.025, v, w + .02, .05, d + .02, '#2b3036');
        B.get('metal').box(u, y0 + 1.06, c.v0 + .12, .12, .02, .16, '#1b2026');
      }
    } else {
      const span = g.line.u1 - g.line.u0, cu = (g.line.u0 + g.line.u1) / 2;
      B.get('metal').box(cu, y0 + 2.32, 0, span, .1, .14, '#5f666d');
      B.get('metal').box(cu, y0 + .01, 0, span, .02, .1, '#8a9198');
      let u = g.line.u0;
      for (const l of [...g.lanes].sort((a, b) => a.u0 - b.u0)) {
        if (l.u0 - u > .05) B.get('glass').box((u + l.u0) / 2, y0 + 1.15, 0, l.u0 - u, 2.26, .02, 0xffffff);
        for (const e of [l.u0, l.u1]) B.get('metal').box(e, y0 + 1.15, 0, .05, 2.3, .07, '#5f666d');
        u = l.u1;
      }
      if (g.line.u1 - u > .05) B.get('glass').box((u + g.line.u1) / 2, y0 + 1.15, 0, g.line.u1 - u, 2.26, .02, 0xffffff);
    }
    // Glass doors: card reader on the sidelight frame beside the leaf, facing the public side.
    // (Speed gates carry their readers on the cabinet tops.)
    const m = readerMount(g);
    if (m) B.get('metal').box(m.u, y0 + 1.25, m.v, .1, .16, .04, '#11161b');
  });
}

/** Wall-mounted reader of a glass door: on the static glass next to the lane nearest the reader stand. */
function readerMount(g) {
  if (g.kind === 'speed-gates') return null;
  const l = [...g.lanes].sort((a, b) => Math.abs((a.u0 + a.u1) / 2 - g.reader.u) - Math.abs((b.u0 + b.u1) / 2 - g.reader.u))[0];
  const left = l.u0 - .22, right = l.u1 + .22;
  const u = g.reader.u <= (l.u0 + l.u1) / 2 && left > g.line.u0 + .05 ? left : right < g.line.u1 - .05 ? right : left;
  return { u, v: -.06 };
}

/**
 * LED quads of a gate, local {u, v, y}. Speed gates: one per lane, on the top of the cabinet
 * to the lane's left, behind its reader pad; glass doors: on the wall reader.
 */
export const gateLeds = (g) => g.kind === 'speed-gates' ? g.lanes.map((l) => {
  const c = g.cabinets.reduce((a, q) => (Math.abs(q.u1 - l.u0) < Math.abs(a.u1 - l.u0) ? q : a));
  return { u: (c.u0 + c.u1) / 2, v: c.v0 + .32, y: 1.065 };
}) : [{ ...readerMount(g), v: readerMount(g).v - .025, y: 1.29 }];

/** Pick card [title, description] of a gate: named after the tower its zone belongs to (北苑 / 西苑). */
export function gatePickInfo(layout, g) {
  const zone = layout.accessControl?.zones?.find((z) => z.id === g.zone);
  const b = layout.buildings.find((q) => q.id === (g.building || zone?.building));
  return [b ? `${b.name} · 住户门禁` : '住户门禁', `${g.name} · 刷卡通行 · 出门自动感应 · 访客请联系礼宾`];
}

/**
 * Build all card gates of layout.accessControl. Static parts ride the existing
 * ctx.levels[floor].batch; two InstancedMesh per gated level go into its base group.
 */
export function buildAccessGates(ctx) {
  const gates = ctx.layout.accessControl?.gates || [];
  const leafGeo = new THREE.BoxGeometry(1, 1, 1), ledGeo = new THREE.BoxGeometry(1, 1, 1);
  // Tinted flaps (like smoked acrylic) so a closed lane reads at a glance; open flaps fold against the cabinets.
  const leafMat = ctx.mats.base.glassTint || ctx.mats.base.glass, ledMat = ctx.accessGateLedMaterial ||= new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const byFloor = new Map();
  for (const g of gates) for (const f of g.floors) {
    if (!ctx.levels[f]) continue;
    if (!byFloor.has(f)) byFloor.set(f, []);
    byFloor.get(f).push(g);
  }
  const states = new Map(), meshes = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  for (const [floor, list] of byFloor) {
    const L = ctx.levels[floor], y0 = ctx.lvById?.[floor]?.elev ?? L.lv?.elev ?? 0;
    for (const g of list) gateStatics(L.batch, g, y0);
    const leafCount = list.reduce((n, g) => n + gateLeafBoxes(g, 0).length, 0), ledCount = list.reduce((n, g) => n + gateLeds(g).length, 0);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount), leds = new THREE.InstancedMesh(ledGeo, ledMat, ledCount);
    leaves.name = `access-gate-leaves ${floor}`; leds.name = `access-gate-leds ${floor}`;
    leaves.renderOrder = 2; leaves.castShadow = false; leds.castShadow = false;
    leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    let li = 0, di = 0;
    for (const g of list) {
      const st = states.get(g.id) || { id: g.id, record: g, t: 0, target: 0, flashUntil: 0, flashKind: null, parts: [] };
      states.set(g.id, st);
      const n = gateLeafBoxes(g, 0).length, ledList = gateLeds(g);
      st.parts.push({ leaves, first: li, count: n, leds, ledFirst: di, ledList, y0 });
      li += n; di += ledList.length;
      const [cx, cz] = toW(g.frame, (g.line.u0 + g.line.u1) / 2, 0);
      st.center = new THREE.Vector3(cx, y0 + 1, cz);
    }
    L.base.add(leaves, leds);
    meshes.push({ floor, leaves, leds });
  }
  const place = (st) => {
    const g = st.record;
    for (const part of st.parts) {
      gateLeafBoxes(g, st.t).forEach((b, i) => {
        const [x, z] = toW(g.frame, b.u, b.v);
        q.setFromAxisAngle(Y, -(g.frame.a + b.ry));
        p.set(x, part.y0 + b.y, z); sc.set(b.w, b.h, b.d);
        part.leaves.setMatrixAt(part.first + i, m4.compose(p, q, sc));
      });
      part.leaves.instanceMatrix.needsUpdate = true;
    }
  };
  const paint = (st, now) => {
    const kind = st.flashUntil > now ? st.flashKind : st.target > 0 ? 'granted' : 'idle';
    col.setHex(GATE_COLORS[kind]);
    for (const part of st.parts) {
      part.ledList.forEach((d, i) => {
        const [x, z] = toW(st.record.frame, d.u, d.v);
        q.setFromAxisAngle(Y, -st.record.frame.a); p.set(x, part.y0 + d.y, z); sc.set(.09, .03, .015);
        part.leds.setMatrixAt(part.ledFirst + i, m4.compose(p, q, sc));
        part.leds.setColorAt(part.ledFirst + i, col);
      });
      part.leds.instanceMatrix.needsUpdate = true;
      if (part.leds.instanceColor) part.leds.instanceColor.needsUpdate = true;
    }
    st.painted = kind;
  };
  for (const st of states.values()) { place(st); paint(st, 0); }
  let clock = 0;
  const api = {
    states, meshes,
    set(id, open) { const st = states.get(id); if (st) st.target = open ? 1 : 0; },
    flash(id, kind) { const st = states.get(id); if (st) { st.flashKind = kind; st.flashUntil = clock + DENIED; paint(st, clock); } },
    resetAll() { for (const st of states.values()) { st.target = 0; st.t = 0; st.flashUntil = 0; place(st); paint(st, clock); } },
    /** Advance the animation (exposed for tests). */
    step(dt) {
      clock += dt;
      for (const st of states.values()) {
        const t = Math.max(0, Math.min(1, st.t + Math.sign(st.target - st.t) * dt / OPEN_TIME));
        if (t !== st.t) { st.t = Math.abs(t - st.target) < 1e-6 ? st.target : t; place(st); }
        const kind = st.flashUntil > clock ? st.flashKind : st.target > 0 ? 'granted' : 'idle';
        if (kind !== st.painted) paint(st, clock);
      }
    },
  };
  ctx.accessGates = api;
  ctx.dynamic?.push({ name: 'access-gates', update(dt, elapsed, app) {
    // The tour camera is non-physical: gates open visually as it passes within 6 m.
    if (app?.state?.touring) for (const st of states.values()) st.target = st.center.distanceTo(app.camera.position) < 6 ? 1 : 0;
    api.step(dt);
  } });
  return api;
}
