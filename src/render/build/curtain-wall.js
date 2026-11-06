// 幕墙与立面套件（supertall P0b · SPEC §2.2）：与户型无关的单元式幕墙、避难层百叶带、消防救援窗标记、塔冠格栅、
// 航空障碍灯、加强层腰桁架。全部在建筑坐标系里写进调用方的 BatchSet（每塔一套剪切材质），所以不增加绘制调用。
//
//   curtainWall(B, edges, { levels, module, finEvery, spandrel, chamfer, skip, … })
//       竖梃与视窗玻璃沿整段幕墙竖向合并（一根竖梃从最低一层到最高一层是一个盒子），每层一条层间窗槛墙（spandrel）。
//       levels 只给要做幕墙的楼层：混合立面的塔（北苑 100 m 以下保留现在的窗洞立面和开敞阳台、以上做幕墙）把
//       splitFacade(levels, 100) 的 curtain 一半传进来，punched 一半照旧由窗洞立面画，交界处用 transitionBand()。
//   splitFacade(levels, y)                  { punched, curtain }：楼层底标高 < y 的保留窗洞立面
//   transitionBand(B, edges, y, opts)       两种立面交界的一条深色腰线（盖住两种做法的收口）
//   louvreBand(B, edge, y0, y1, { blades, fireWindows, color })   避难层百叶带；fireWindows 段换成乙级防火窗
//   rescueMarks(B, edge, levels, spans)     每层 1.0 × 1.0 m 消防救援窗：红色三角贴标（≥ 2 个 / 层，登高面）
//   crownFins(B, edges, y0, heights, opts)  屋顶以上的塔冠竖向格栅；heights 为数组（每根）或 (t, e) => 高度
//   aviationLights(B, points, opts)         航空障碍灯（glowSoft，红色；夜间泛光）
//   belt(B, edge, y0, y1, diagonals, opts)  加强层腰桁架：上下弦与斜腹杆（在百叶后面）
//
// edges：footprintEdges(rect) 的边（{ side, axis, c, lo, hi, n }，n 为外法线），或直接给一个矩形。
import * as THREE from 'three';

export const CW_COLORS = Object.freeze({
  mullion: '#3e3b37', fin: '#8a7a5c', glass: '#ffffff', spandrel: '#6f5f48', transition: '#4a4440', louvre: '#5f6567', fireFrame: '#a8352c',
  fireGlass: '#ffffff', rescue: '#e0332b', aviation: '#ff2a1f', belt: '#4d5356', crown: '#8a7a5c',
});
export const CW_KEYS = Object.freeze({ mullion: 'extMetal', fin: 'extSatin', glass: 'glassTint', spandrel: 'facadePlaster', louvre: 'extSatin', fire: 'glassTint', mark: 'glowSoft', light: 'glowSoft', belt: 'extMetal' });

export const rectEdges = (r) => [
  { side: 'N', axis: 'x', c: r.z0, lo: r.x0, hi: r.x1, n: [0, -1] }, { side: 'S', axis: 'x', c: r.z1, lo: r.x0, hi: r.x1, n: [0, 1] },
  { side: 'W', axis: 'z', c: r.x0, lo: r.z0, hi: r.z1, n: [-1, 0] }, { side: 'E', axis: 'z', c: r.x1, lo: r.z0, hi: r.z1, n: [1, 0] },
];
const asEdges = (edges) => (Array.isArray(edges) ? edges : rectEdges(edges));
const at = (e, t, off = 0) => (e.axis === 'x' ? [t, e.c + e.n[1] * off] : [e.c + e.n[0] * off, t]);
const Y = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

/** A face-on pane on edge e from t0 to t1, `off` proud of the edge line (2 triangles). */
function pane(B, key, e, t0, t1, y0, y1, off, color) {
  if (t1 - t0 < .01 || y1 - y0 < .01) return;
  const a = at(e, t0, off), b = at(e, t1, off), dx = b[0] - a[0], dz = b[1] - a[1];
  _q.setFromAxisAngle(Y, -Math.atan2(dz, dx));
  B.get(key).shape('plane', _p.set((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2), _q, _s.set(Math.hypot(dx, dz), y1 - y0, 1), color);
}
/** A box on edge e: `w` along the edge at t, `d` deep centred `off` out of the line. */
function bar(B, key, e, t, w, y0, y1, off, d, color) {
  if (y1 - y0 < .01) return;
  const [x, z] = at(e, t, off);
  B.get(key).box(x, (y0 + y1) / 2, z, e.axis === 'x' ? w : d, y1 - y0, e.axis === 'x' ? d : w, color);
}
/** A horizontal box along the edge from t0 to t1. */
function rail(B, key, e, t0, t1, y0, y1, off, d, color) { bar(B, key, e, (t0 + t1) / 2, t1 - t0, y0, y1, off, d, color); }

/** Contiguous runs of levels (sorted by elevation, touching storeys): [[lv…], …]. */
function runs(levels) {
  const sorted = [...levels].sort((a, b) => a.elev - b.elev), out = [];
  for (const lv of sorted) {
    const r = out.at(-1), last = r?.at(-1);
    if (last && Math.abs(last.elev + last.height - lv.elev) < .05) r.push(lv); else out.push([lv]);
  }
  return out;
}

/** Storeys of a mixed façade: below elevation y they keep the punched windows, from y up they get the curtain wall. */
export function splitFacade(levels, y = 100) {
  const storeys = levels.filter((l) => l.kind !== 'roof');
  return { punched: storeys.filter((l) => l.elev < y - 1e-6), curtain: storeys.filter((l) => l.elev >= y - 1e-6) };
}

/**
 * Unitized curtain wall on `edges` over `levels` (building frame). Options:
 *   module (m between mullions, 1.5), finEvery (every n-th mullion gets a fin, 2; 0 = none), fin (fin depth, .35),
 *   spandrel (height of the per-storey spandrel band, .9), chamfer (corner chamfer, 0), mullion (width, .06),
 *   skip(lv, e) → true omits that storey's spandrel on edge e (a duplex 挑空 meets the façade),
 *   colors / keys overrides (CW_COLORS / CW_KEYS), span(e) → [t0, t1] to clad only part of an edge.
 * Returns { mullions, spandrels, panes } counts.
 */
export function curtainWall(B, edges, { levels, module = 1.5, finEvery = 2, fin = .35, spandrel = .9, chamfer = 0, mullion = .06, skip = null, colors = {}, keys = {}, span = null } = {}) {
  const C = { ...CW_COLORS, ...colors }, K = { ...CW_KEYS, ...keys }, stats = { mullions: 0, spandrels: 0, panes: 0 };
  const list = asEdges(edges);
  for (const run of runs(levels || [])) {
    const y0 = run[0].elev, y1 = run.at(-1).elev + run.at(-1).height;
    for (const e of list) {
      const [a0, b0] = span ? span(e) : [e.lo, e.hi], t0 = a0 + chamfer, t1 = b0 - chamfer, len = t1 - t0;
      if (len < .5) continue;
      // Vision glass merged vertically over the whole run, just behind the mullion line.
      pane(B, K.glass, e, t0, t1, y0, y1, .01, C.glass); stats.panes++;
      const n = Math.max(1, Math.round(len / module));
      for (let k = 0; k <= n; k++) {
        const t = t0 + len * k / n, finned = finEvery > 0 && k % finEvery === 0;
        bar(B, K.mullion, e, t, mullion, y0, y1, .06, .12, C.mullion); stats.mullions++;
        if (finned && k > 0 && k < n) bar(B, K.fin, e, t, mullion * 1.2, y0, y1, .12 + fin / 2, fin, C.fin);
      }
      // One spandrel per storey at the slab line (back-painted glass / bronze panel), proud of the glass.
      for (const lv of run) {
        if (skip?.(lv, e)) continue;
        pane(B, K.spandrel, e, t0, t1, lv.elev - spandrel * .35, lv.elev + spandrel * .65, .03, C.spandrel); stats.spandrels++;
      }
    }
    // Chamfered corners: a diagonal glass pane per corner over the run.
    if (chamfer > 0 && !Array.isArray(edges)) {
      const r = edges;
      for (const [x, z, sx, sz] of [[r.x0, r.z0, 1, 1], [r.x1, r.z0, -1, 1], [r.x0, r.z1, 1, -1], [r.x1, r.z1, -1, -1]]) {
        const a = [x + sx * chamfer, z], b = [x, z + sz * chamfer], dx = b[0] - a[0], dz = b[1] - a[1];
        _q.setFromAxisAngle(Y, -Math.atan2(dz, dx));
        B.get(K.glass).shape('plane', _p.set((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2), _q, _s.set(Math.hypot(dx, dz), y1 - y0, 1), C.glass);
        stats.panes++;
      }
    }
  }
  return stats;
}

/** The band where a punched façade meets the curtain wall above it: a dark 0.6 m band proud of both. */
export function transitionBand(B, edges, y, { height = .6, depth = .3, color = CW_COLORS.transition, key = 'extSatin' } = {}) {
  for (const e of asEdges(edges)) rail(B, key, e, e.lo - .08, e.hi + .08, y - height / 2, y + height / 2, depth / 2, depth, color);
}

/** Refuge-floor louvre band on edge e from y0 to y1: `blades` horizontal blades; fireWindows [[t0, t1]] become 乙级 fire windows. */
export function louvreBand(B, edge, y0, y1, { blades = 8, fireWindows = [], color = CW_COLORS.louvre, span = null } = {}) {
  const [t0, t1] = span || [edge.lo, edge.hi], h = (y1 - y0) / blades, stats = { blades: 0, fireWindows: 0 };
  const solid = fireWindows.reduce((iv, [a, b]) => iv.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, Math.max(p, a)], [Math.min(q, b), q]].filter(([u, v]) => v - u > .05))), [[t0, t1]]);
  for (const [a, b] of solid) for (let k = 0; k < blades; k++) { rail(B, 'extSatin', edge, a, b, y0 + h * k + h * .2, y0 + h * k + h * .75, .08, .16, color); stats.blades++; }
  for (const [a, b] of fireWindows) {
    pane(B, 'glassTint', edge, a, b, y0 + .9, y1 - .5, .02, CW_COLORS.fireGlass);
    for (const yy of [y0 + .9, y1 - .5]) rail(B, 'extMetal', edge, a, b, yy - .04, yy + .04, .05, .08, CW_COLORS.fireFrame);
    for (const t of [a, b]) bar(B, 'extMetal', edge, t, .08, y0 + .9, y1 - .5, .05, .08, CW_COLORS.fireFrame);
    stats.fireWindows++;
  }
  return stats;
}

const TRI = { pos: new Float32Array([-.5, .5, 0, .5, .5, 0, 0, -.5, 0]), nor: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), count: 3 };
/** 消防救援窗 marks: a red downward triangle (0.4 m) at the head of each 1.0 × 1.0 m panel; spans [[t0, t1]] per storey. */
export function rescueMarks(B, edge, levels, spans, { size = .4, color = CW_COLORS.rescue } = {}) {
  let n = 0;
  const m = new THREE.Matrix4();
  for (const lv of levels) for (const [a, b] of spans) {
    const t = (a + b) / 2, [x, z] = at(edge, t, .07);
    _q.setFromAxisAngle(Y, Math.atan2(edge.n[0], edge.n[1]));
    B.get('glowSoft').push(TRI, m.compose(_p.set(x, lv.elev + 2.1, z), _q, _s.set(size, size, 1)), color);
    rail(B, 'extMetal', edge, a, b, lv.elev + .9, lv.elev + .96, .05, .06, color);
    n++;
  }
  return n;
}

/** Crown fins above the roof: one fin every `spacing` m on each edge, height heights[k] or heights(t, e) above y0. */
export function crownFins(B, edges, y0, heights, { spacing = 2.8, depth = .35, width = .12, color = CW_COLORS.crown, key = 'extSatin' } = {}) {
  let n = 0;
  for (const e of asEdges(edges)) {
    const len = e.hi - e.lo, count = Math.max(2, Math.round(len / spacing));
    for (let k = 0; k <= count; k++) {
      const t = e.lo + len * k / count, h = typeof heights === 'function' ? heights(t, e) : Array.isArray(heights) ? heights[k % heights.length] : heights;
      if (h > .05) { bar(B, key, e, t, width, y0, y0 + h, depth / 2, depth, color); n++; }
    }
  }
  return n;
}

/** Obstruction lights: small red glowSoft boxes at points [{ x, y, z }] (building frame). */
export function aviationLights(B, points, { size = .45, color = CW_COLORS.aviation } = {}) {
  for (const p of points) B.get('glowSoft').box(p.x, p.y, p.z, size, size, size, color);
  return points.length;
}

/** Belt / outrigger truss behind a refuge band: top and bottom chords and `diagonals` diagonal members on edge e. */
export function belt(B, edge, y0, y1, diagonals = 6, { inset = .6, color = CW_COLORS.belt, size = .35 } = {}) {
  const t0 = edge.lo + .5, t1 = edge.hi - .5;
  for (const yy of [y0 + size / 2, y1 - size / 2]) rail(B, 'extMetal', edge, t0, t1, yy - size / 2, yy + size / 2, -inset, size, color);
  const step = (t1 - t0) / diagonals, m = new THREE.Matrix4();
  for (let k = 0; k < diagonals; k++) {
    const a = t0 + step * k, b = a + step, up = k % 2 === 0;
    const [x0, z0] = at(edge, a, -inset), [x1, z1] = at(edge, b, -inset), lo = y0 + size * 1.2, hi = y1 - size * 1.2, ya = up ? lo : hi, yb = up ? hi : lo;   // between the chords
    const len = Math.hypot(x1 - x0, yb - ya, z1 - z0);
    _q.setFromUnitVectors(Y, new THREE.Vector3(x1 - x0, yb - ya, z1 - z0).normalize());
    B.get('extMetal').push({ ...boxTemplate() }, m.compose(_p.set((x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2), _q, _s.set(size, len, size)), color);
  }
  return diagonals;
}
let BOX = null;
function boxTemplate() {
  if (BOX) return BOX;
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  return (BOX = { pos: g.attributes.position.array, nor: g.attributes.normal.array, uv: null, count: g.attributes.position.count });
}
