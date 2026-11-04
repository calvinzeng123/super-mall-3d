// 云澜社区住宅（西苑 / 北苑）常驻外壳：楼板与层间线脚、户型立面窗与阳台、核心筒、走廊端玻璃、
// 1F 门禁大堂 / 7F 空中会所、屋顶花园与招牌。只依赖 layout/community-contract.js 列出的字段：
// 每栋一个 BatchSet（7 个材质批次 + 1 块招牌），户内陈设由 residence-interiors.js 按楼层加载。
import * as THREE from 'three';
import { BatchSet, SignBatch } from '../batch.js';
import { rect, toW, toL, subtractInterval } from '../../layout/geom.js';
import { shapeFromPoly } from './shell.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { segment, rectFinish, lobbyFurniture, clipMaterial } from './residential-shell.js';
import { buildTowerStairInstances } from './tower-stairs.js';
import { WEST_CANOPY } from '../../layout/community.js';
import { planter, bench } from './props.js';

export const COMMUNITY_PALETTES = {
  west: { wall: '#ebe5d9', band: '#b6ad9b', accent: '#6f8a7a', frame: '#4f5759', core: '#d8d2c4', stone: '#e6e1d6', slab: '#e2ddd2', sign: '#2f4a40', ink: '#f2ead6', curtain: '#e8dcc4' },
  north: { wall: '#e7e0d3', band: '#8a7a5c', accent: '#8a7a5c', frame: '#3e3b37', core: '#d5ccbc', stone: '#ebe5da', slab: '#e0d9cc', sign: '#3d362b', ink: '#f1e4c6', curtain: '#e4d6bd' },
};
const FULL_HEIGHT = 1e5;
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const EPS = 1e-6;
const OUTWARD = { S: [0, 1], N: [0, -1], W: [-1, 0], E: [1, 0] };
// Helpers written for other shells draw with these keys; the exterior keeps seven batches.
const EXTERIOR_KEYS = { concrete: 'facadePlaster', ext: 'facadePlaster', matte: 'facadePlaster', plaster: 'facadePlaster', wood: 'extSatin', satin: 'extSatin', foliage: 'extSatin', metal: 'extMetal', glow: 'glowSoft' };
const keyed = (B, map) => ({ get: (k) => B.get(map[k] || k), frame: (F, fn) => B.frame(F, fn) });

const along = (a, b, t) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [a[0] + (b[0] - a[0]) * t / l, a[1] + (b[1] - a[1]) * t / l]; };
/** A vertical pane between points a and b (two triangles). */
function pane(B, key, a, b, y0, y1, color = '#ffffff') {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < .02 || y1 - y0 < .02) return;
  _q.setFromAxisAngle(Y, -Math.atan2(dz, dx));
  B.get(key).shape('plane', _p.set((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2), _q, _s.set(len, y1 - y0, 1), color);
}
/** A horizontal light panel facing down (two triangles). */
function lamp(B, x, y, z, w, d, color = '#f6ebcf') {
  _q.setFromAxisAngle(X, Math.PI / 2);
  B.get('glowSoft').shape('plane', _p.set(x, y, z), _q, _s.set(w, d, 1), color);
}
/** Footprint edges in the building frame; t runs along x (N/S) or z (W/E). */
export const footprintEdges = (r) => [
  { side: 'N', axis: 'x', c: r.z0, lo: r.x0, hi: r.x1, n: [0, -1] }, { side: 'S', axis: 'x', c: r.z1, lo: r.x0, hi: r.x1, n: [0, 1] },
  { side: 'W', axis: 'z', c: r.x0, lo: r.z0, hi: r.z1, n: [-1, 0] }, { side: 'E', axis: 'z', c: r.x1, lo: r.z0, hi: r.z1, n: [1, 0] },
];
const at = (e, t, off = 0) => e.axis === 'x' ? [t, e.c + e.n[1] * off] : [e.c + e.n[0] * off, t];
const onEdge = (e, p, q, tol = .35) => e.axis === 'x' ? Math.abs(p[1] - e.c) < tol && Math.abs(q[1] - e.c) < tol : Math.abs(p[0] - e.c) < tol && Math.abs(q[0] - e.c) < tol;
const spanOn = (e, p, q) => e.axis === 'x' ? [Math.min(p[0], q[0]), Math.max(p[0], q[0])] : [Math.min(p[1], q[1]), Math.max(p[1], q[1])];
const rectTouches = (r, e, tol = .05) => e.axis === 'x' ? Math.abs((e.side === 'N' ? r.z0 : r.z1) - e.c) < tol : Math.abs((e.side === 'W' ? r.x0 : r.x1) - e.c) < tol;
const rectSpan = (r, e) => e.axis === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
const clipSpans = (spans, [a, b]) => spans.map(([p, q]) => [Math.max(p, a), Math.min(q, b)]).filter(([p, q]) => q - p > .02);

/**
 * Storey-high walls, panes and core cells that repeat floor after floor are merged
 * into one column per footprint (world coordinates): a 27-storey pier is one box.
 */
class Columns {
  constructor() { this.m = new Map(); }
  add(kind, key, a, b, y0, y1, t, color) {
    const id = `${kind}|${key}|${a.map((v) => v.toFixed(3))}|${b.map((v) => v.toFixed(3))}|${t}|${color}`;
    let e = this.m.get(id);
    if (!e) this.m.set(id, e = { kind, key, a, b, t, color, spans: [] });
    e.spans.push([y0, y1]);
  }
  wall(F, key, a, b, y0, y1, t, color) { this.add('wall', key, toW(F, ...a), toW(F, ...b), y0, y1, t, color); }
  pane(F, key, a, b, y0, y1, color = '#ffffff') { this.add('pane', key, toW(F, ...a), toW(F, ...b), y0, y1, 0, color); }
  /** An axis-aligned block in frame F (deg 0 / 180 / ±90 only, as all tower frames are). */
  cell(F, key, r, y0, y1, color) {
    const p = toW(F, r.x0, r.z0), q = toW(F, r.x1, r.z1);
    this.add('cell', key, [Math.min(p[0], q[0]), Math.min(p[1], q[1])], [Math.max(p[0], q[0]), Math.max(p[1], q[1])], y0, y1, 0, color);
  }
  flush(B) {
    B.frame(null, () => {
      for (const e of this.m.values()) {
        const spans = e.spans.sort((u, v) => u[0] - v[0]).reduce((out, s) => {
          const last = out.at(-1);
          if (last && s[0] <= last[1] + 1e-4) last[1] = Math.max(last[1], s[1]); else out.push([...s]);
          return out;
        }, []);
        for (const [y0, y1] of spans) {
          if (e.kind === 'wall') segment(B, e.key, e.a, e.b, y0, y1, e.t, e.color);
          else if (e.kind === 'pane') pane(B, e.key, e.a, e.b, y0, y1, e.color);
          else B.get(e.key).box((e.a[0] + e.b[0]) / 2, (y0 + y1) / 2, (e.a[1] + e.b[1]) / 2, e.b[0] - e.a[0], y1 - y0, e.b[1] - e.a[1], e.color);
        }
      }
    });
    this.m.clear();
  }
}

/** Facade spans of every home on a level, per footprint edge (building frame). */
export function facadeCoverage(b, lv) {
  const out = { N: [], S: [], W: [], E: [] };
  for (const u of lv.units) for (const w of u.residence?.facadeWalls || []) {
    const p = toL(b.frame, ...toW(u.frame, ...w.a)), q = toL(b.frame, ...toW(u.frame, ...w.b));
    for (const e of footprintEdges(b.footprint)) if (onEdge(e, p, q)) out[e.side].push(spanOn(e, p, q));
  }
  return out;
}

export function subtractRects(base, cuts) {
  let pieces = [base];
  for (const c of cuts) pieces = pieces.flatMap((p) => {
    const x0 = Math.max(p.x0, c.x0), x1 = Math.min(p.x1, c.x1), z0 = Math.max(p.z0, c.z0), z1 = Math.min(p.z1, c.z1);
    if (x1 - x0 < EPS || z1 - z0 < EPS) return [p];
    return [rect(p.x0, p.z0, x0, p.z1), rect(x1, p.z0, p.x1, p.z1), rect(x0, p.z0, x1, z0), rect(x0, z1, x1, p.z1)]
      .filter((q) => q.x1 - q.x0 > EPS && q.z1 - q.z0 > EPS);
  });
  return pieces;
}
/** Solid core fill: the core minus its lift shafts, stairs and open landings. */
export const coreCells = (cp) => subtractRects(cp.core, [...cp.lifts.map((l) => l.rect), ...cp.stairs.map((s) => s.rect),
  ...cp.landings.filter((q) => q.open).map((q) => q.rect), ...(cp.corridor ? [cp.corridor] : [])])
  .filter((r) => Math.min(r.x1 - r.x0, r.z1 - r.z0) >= .15);

function slab(B, b, lv, color, depth = .28) {
  const top = lv.elev - .03, local = (poly) => poly.map((q) => toL(b.frame, ...q));
  for (const piece of lv.slab.pieces) {
    const g = new THREE.ExtrudeGeometry(shapeFromPoly(local(piece.outer), (piece.holes || []).map(local)), { depth, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2); g.translate(0, -depth, 0);
    const geo = g.index ? g.toNonIndexed() : g;
    B.get('stone').push({ pos: geo.attributes.position.array, nor: geo.attributes.normal.array, count: geo.attributes.position.count },
      new THREE.Matrix4().makeTranslation(0, top, 0), color);
    geo.dispose(); if (geo !== g) g.dispose();
  }
}

/** Thin trim seen face-on: a double-sided plane just proud of the wall (2 triangles). */
const trim = (B, a, b, y0, y1, [ox, oz], color) => pane(B, 'extMetal', [a[0] + ox, a[1] + oz], [b[0] + ox, b[1] + oz], y0, y1, color);

/** One exterior wall of a home: storey-high piers (merged), sills and lintels, framed windows, balcony railings. */
function facadeWall(B, col, F, w, y, h, pal) {
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), t = w.thickness || .2, P = (s) => along(w.a, w.b, s);
  const ops = (w.openings || []).map((o) => ({ ...o, s0: Math.max(0, o.at - o.width / 2), s1: Math.min(len, o.at + o.width / 2) })).filter((o) => o.s1 - o.s0 > .1);
  for (const [s0, s1] of ops.reduce((iv, o) => subtractInterval(iv, [o.s0, o.s1]), [[0, len]])) col.wall(F, 'facadePlaster', P(s0), P(s1), y, y + h, t, pal.wall);
  const n0 = OUTWARD[w.side] || OUTWARD.S, out = [n0[0] * (t / 2 + .012), n0[1] * (t / 2 + .012)];
  for (const o of ops) {
    const a = P(o.s0), b = P(o.s1);
    if (o.type === 'railing') {
      // Balconies open to the slab above; a glass balustrade with a metal rail and end posts.
      pane(B, 'glass', P(o.s0 + .04), P(o.s1 - .04), y + .12, y + 1.05);
      segment(B, 'extMetal', a, b, y + 1.04, y + 1.1, .07, pal.frame);
      for (const s of [o.s0 + .03, o.s1 - .03]) segment(B, 'extMetal', P(s - .03), P(s + .03), y, y + 1.1, .07, pal.frame);
      continue;
    }
    const bottom = Math.max(0, o.bottom ?? .6), top = Math.min(h - .25, o.top ?? 2.4);
    if (bottom > .02) segment(B, 'facadePlaster', a, b, y, y + bottom, t, pal.wall);
    segment(B, 'facadePlaster', a, b, y + top, y + h, t, pal.wall);
    pane(B, 'glassTint', a, b, y + bottom, y + top);
    // A drawn-back curtain inside most windows; a few glow at night.
    const seed = Math.abs(Math.round(o.at * 7 + y * 3 + len)) % 7, inner = [-out[0] * 2.2, -out[1] * 2.2];
    if (seed < 5 && bottom > .02) {
      const cw = Math.min(.5, (o.s1 - o.s0) * .25), s0 = seed % 2 ? o.s0 + .08 : o.s1 - .08 - cw;
      pane(B, seed === 0 ? 'glowSoft' : 'extSatin', [P(s0)[0] + inner[0], P(s0)[1] + inner[1]], [P(s0 + cw)[0] + inner[0], P(s0 + cw)[1] + inner[1]], y + bottom + .05, y + top - .05, seed === 0 ? '#f6dfb4' : pal.curtain);
    }
    trim(B, a, b, y + bottom, y + bottom + .06, out, pal.frame);
    trim(B, a, b, y + top - .05, y + top, out, pal.frame);
    const n = Math.max(1, Math.round((o.s1 - o.s0) / 1.6));
    for (let k = 0; k <= n; k++) {
      const s = o.s0 + (o.s1 - o.s0) * k / n;
      trim(B, P(Math.max(o.s0, s - .035)), P(Math.min(o.s1, s + .035)), y + bottom, y + top, out, pal.frame);
    }
    if (bottom < .3) trim(B, a, b, y + 1.0, y + 1.05, out, pal.frame);   // guard bar of a full-height pane
  }
}

const onRectEdge = (p, r) => {
  const [a, b] = [p.a, p.b], tol = 1e-3, inX = (x) => x >= r.x0 - tol && x <= r.x1 + tol, inZ = (z) => z >= r.z0 - tol && z <= r.z1 + tol;
  if (Math.abs(a[1] - b[1]) < tol) return [r.z0, r.z1].some((z) => Math.abs(a[1] - z) < tol) && inX(a[0]) && inX(b[0]);
  if (Math.abs(a[0] - b[0]) < tol) return [r.x0, r.x1].some((x) => Math.abs(a[0] - x) < tol) && inZ(a[1]) && inZ(b[1]);
  return false;
};

/** Facade walls, party-wall pilasters, recessed balcony slider and side walls of one home (inside its frame). */
function homeFacade(B, col, u, lv, pal) {
  const res = u.residence, y = lv.elev, h = lv.height, F = u.frame;
  for (const w of res.facadeWalls || []) {
    facadeWall(B, col, F, w, y, h, pal);
    const out = OUTWARD[w.side] || OUTWARD.S;
    for (const end of [w.a, w.b]) {
      const p = [end[0] + out[0] * .09, end[1] + out[1] * .09], half = out[0] ? [0, .15] : [.15, 0];
      col.wall(F, 'extSatin', [p[0] - half[0], p[1] - half[1]], [p[0] + half[0], p[1] + half[1]], y, y + h, .18, pal.band);
    }
  }
  const bal = res.rooms.find((r) => r.kind === 'balcony');
  if (!bal) return;
  for (const p of res.partitions) {
    if (!onRectEdge(p, bal.rect)) continue;
    if (p.role === 'balcony-slider') slider(B, p, y, h, pal);
    else col.wall(F, 'facadePlaster', p.a, p.b, y, y + h, .14, pal.wall);
  }
}

/** Balcony sliding door: fixed glass beside the doorway (nav keeps that span open),
 * the two sliding leaves stand open, stacked either side of the widest fixed panel. */
function slider(B, p, y, h, pal) {
  const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) || 1, d = p.door, n = [-(p.b[1] - p.a[1]) / len, (p.b[0] - p.a[0]) / len];
  const P = (s, off = 0) => along(p.a, p.b, s).map((v, i) => v + n[i] * off);
  const open = d ? [Math.max(0, d.at - d.width / 2), Math.min(len, d.at + d.width / 2)] : null;
  const fixed = open ? subtractInterval([[0, len]], open).filter(([s0, s1]) => s1 - s0 > .02) : [[0, len]];
  for (const [s0, s1] of fixed) pane(B, 'glassTint', P(s0), P(s1), y + .04, y + 2.4);
  if (open) {
    for (const s of open) trim(B, P(s - .03), P(s + .03), y, y + 2.4, [0, 0], pal.frame);
    const park = fixed.reduce((m, s) => !m || s[1] - s[0] > m[1] - m[0] ? s : m, null);
    if (park) {
      const w = Math.min((open[1] - open[0]) / 2, park[1] - park[0]), s0 = park[0] >= open[1] - 1e-6 ? park[0] : park[1] - w;
      for (const off of [-.035, .035]) {
        pane(B, 'glassTint', P(s0, off), P(s0 + w, off), y + .04, y + 2.36);
        for (const s of [s0 + .03, s0 + w - .03]) trim(B, P(s - .03, off), P(s + .03, off), y + .02, y + 2.38, [0, 0], pal.frame);
      }
    }
  }
  trim(B, p.a, p.b, y + 2.38, y + 2.44, [0, 0], pal.frame);
  segment(B, 'facadePlaster', p.a, p.b, y + 2.44, y + h, .14, pal.wall);
}

/** Lift shaft: three walls and door jambs as columns, a lintel and door head on each storey. */
function liftShaft(B, col, F, L, y, h, pal) {
  const r = L.rect, door = L.door;
  const sides = { N: [[r.x0, r.z0], [r.x1, r.z0]], S: [[r.x0, r.z1], [r.x1, r.z1]], W: [[r.x0, r.z0], [r.x0, r.z1]], E: [[r.x1, r.z0], [r.x1, r.z1]] };
  for (const [side, [a, b]] of Object.entries(sides)) {
    if (side !== door) { col.wall(F, 'facadePlaster', a, b, y, y + h, .12, pal.core); continue; }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), d0 = len / 2 - .55, d1 = len / 2 + .55;
    col.wall(F, 'facadePlaster', a, along(a, b, d0), y, y + h, .12, pal.core);
    col.wall(F, 'facadePlaster', along(a, b, d1), b, y, y + h, .12, pal.core);
    segment(B, 'facadePlaster', along(a, b, d0), along(a, b, d1), y + 2.3, y + h, .12, pal.core);
    segment(B, 'extMetal', along(a, b, d0 - .06), along(a, b, d1 + .06), y + 2.24, y + 2.32, .16, pal.frame);
  }
}

/** Protected stair enclosure: side and back walls as columns, the door wall with a lintel and exit sign.
 * A back wall on the outer edge (facade or retaining wall) is left to that wall, so the slot window shows. */
function stairShell(B, col, F, s, y, h, pal, outer) {
  const r = s.rect, d = s.door, front = d.side === 'S' ? r.z1 : d.side === 'N' ? r.z0 : null;
  if (front == null) return;
  const back = d.side === 'S' ? r.z0 : r.z1, dz = d.side === 'S' ? -.08 : .08;
  const onOuter = outer && [outer.z0, outer.z1].some((z) => Math.abs(back - z) < .05) && r.x0 >= outer.x0 - .05 && r.x1 <= outer.x1 + .05;
  for (const x of [r.x0, r.x1]) col.wall(F, 'facadePlaster', [x, r.z0], [x, r.z1], y, y + h, .2, pal.core);
  if (!onOuter) col.wall(F, 'facadePlaster', [r.x0, back], [r.x1, back], y, y + h, .2, pal.core);
  col.wall(F, 'facadePlaster', [r.x0, front], [d.x0, front], y, y + h, .2, pal.core);
  col.wall(F, 'facadePlaster', [d.x1, front], [r.x1, front], y, y + h, .2, pal.core);
  segment(B, 'facadePlaster', [d.x0, front], [d.x1, front], y + 2.3, y + h, .2, pal.core);
  pane(B, 'glowSoft', [(d.x0 + d.x1) / 2 - .4, front - dz * 1.5], [(d.x0 + d.x1) / 2 + .4, front - dz * 1.5], y + 2.42, y + 2.62, '#78b98b');
}

/** Core fill, lift shafts, stair enclosures and the shared circulation finish on one storey. */
function coreStorey(B, col, F, lv, pal, height = lv.height, outer = null) {
  const cp = lv.corePlan, y = lv.elev;
  if (!cp) return;
  for (const L of cp.lifts) liftShaft(B, col, F, L, y, height, pal);
  for (const s of cp.stairs) stairShell(B, col, F, s, y, height, pal, outer);
  for (const c of coreCells(cp)) col.cell(F, 'facadePlaster', c, y, y + height, pal.core);
  for (const q of cp.landings.filter((q) => q.open)) {
    rectFinish(B, q.rect, y + .005, 'stone', pal.stone);
    lamp(B, (q.rect.x0 + q.rect.x1) / 2, y + height - .32, (q.rect.z0 + q.rect.z1) / 2, Math.min(1.4, q.rect.x1 - q.rect.x0 - .4), .3);
  }
  if (cp.corridor) {
    const r = cp.corridor, cz = (r.z0 + r.z1) / 2;
    rectFinish(B, r, y + .005, 'stone', pal.stone);
    for (let x = r.x0 + 2.4; x < r.x1 - 1.5; x += 4.8) lamp(B, x, y + height - .32, cz, 1.3, .22);
  }
}

const entranceSpans = (layout, b, lv, e) => (layout.entrances || []).filter((en) => en.level === lv.id && en.building === b.id)
  .map((en) => [toL(b.frame, en.seg.x0, en.seg.z0), toL(b.frame, en.seg.x1, en.seg.z1)]).filter(([p, q]) => onEdge(e, p, q, .3)).map(([p, q]) => spanOn(e, p, q));

/** Perimeter not covered by homes: core facade with stair slots, corridor-end glazing, lobby curtain walls. */
function perimeter(B, col, layout, b, lv, pal) {
  const y = lv.elev, h = lv.height, cp = lv.corePlan, cover = facadeCoverage(b, lv), F = b.frame;
  for (const e of footprintEdges(b.footprint)) {
    let free = cover[e.side].reduce((iv, s) => subtractInterval(iv, s), [[e.lo, e.hi]]);
    if (!free.length) continue;
    const core = cp && rectTouches(cp.core, e) ? rectSpan(cp.core, e) : null;
    const corridor = cp?.corridor && rectTouches(cp.corridor, e) ? rectSpan(cp.corridor, e) : null;
    const P = (t, off = 0) => at(e, t, off);
    if (core) {
      for (const [t0, t1] of clipSpans(free, core)) {
        // Each stair reads from outside through one tall slot window.
        const slots = cp.stairs.filter((s) => rectTouches(s.rect, e)).map((s) => { const [a, z] = rectSpan(s.rect, e), m = (a + z) / 2; return clipSpans([[m - .5, m + .5]], [t0, t1])[0]; }).filter(Boolean);
        for (const [a, z] of slots.reduce((iv, s) => subtractInterval(iv, s), [[t0, t1]])) col.wall(F, 'facadePlaster', P(a), P(z), y, y + h, .24, pal.core);
        for (const [a, z] of slots) {
          col.pane(F, 'glassTint', P(a), P(z), y, y + h);
          for (const s of [a, z]) col.pane(F, 'extMetal', P(s - .04, .13), P(s + .04, .13), y, y + h, pal.frame);
        }
      }
      // Accent fins frame the core on the facade.
      for (const t of core) if (t > e.lo + .5 && t < e.hi - .5) col.wall(F, 'extSatin', P(t - .18, .12), P(t + .18, .12), y, y + h, .3, pal.accent);
      free = subtractInterval(free, core).filter(([a, z]) => z - a > .02);
    }
    if (corridor && !lv.lobbyPlan) {
      for (const [a, z] of clipSpans(free, corridor)) {
        col.pane(F, 'glassTint', P(a), P(z), y, y + h);
        for (const s of [a + .04, (a + z) / 2, z - .04]) col.pane(F, 'extMetal', P(s - .04, .02), P(s + .04, .02), y, y + h, pal.frame);
        trim(B, P(a), P(z), y + 1.02, y + 1.08, [e.n[0] * .02, e.n[1] * .02], pal.frame);
      }
      free = subtractInterval(free, corridor).filter(([a, z]) => z - a > .02);
    }
    const doors = entranceSpans(layout, b, lv, e);
    for (const [t0, t1] of free) {
      if (!lv.lobbyPlan) { col.wall(F, 'facadePlaster', P(t0), P(t1), y, y + h, .24, pal.wall); continue; }
      // Lobby / club curtain wall; doors are full-height openings with a glass transom.
      const doorsHere = clipSpans(doors, [t0, t1]);
      for (const [a, z] of doorsHere.reduce((iv, s) => subtractInterval(iv, s), [[t0, t1]])) {
        segment(B, 'stone', P(a), P(z), y, y + .16, .22, pal.stone);
        pane(B, 'glassTint', P(a), P(z), y + .16, y + h - .4);
        const n = Math.max(1, Math.round((z - a) / 3));
        for (let k = 0; k <= n; k++) { const s = a + (z - a) * k / n; trim(B, P(Math.max(a, s - .04)), P(Math.min(z, s + .04)), y, y + h - .35, [e.n[0] * .03, e.n[1] * .03], pal.frame); }
      }
      for (const [a, z] of doorsHere) {
        pane(B, 'glass', P(a), P(z), y + 3.05, y + h - .4);
        segment(B, 'extMetal', P(a), P(z), y + 3.0, y + 3.08, .16, pal.frame);
        for (const s of [a, z]) segment(B, 'extMetal', P(s - .05), P(s + .05), y, y + 3.08, .16, pal.frame);
      }
      segment(B, 'extSatin', P(t0), P(t1), y + h - .4, y + h, .3, pal.band);
    }
  }
}

/** Slab edge band of a storey, slightly proud of the facade. */
function band(B, b, y, pal, color = pal.band, y0 = -.22, y1 = .04) {
  for (const e of footprintEdges(b.footprint)) segment(B, 'extSatin', at(e, e.lo - .06, .03), at(e, e.hi + .06, .03), y + y0, y + y1, .3, color);
}

/** Parapet, accent cornice and the lift / stair penthouse over the core. */
function crown(B, b, lv, pal) {
  const y = lv.elev, cp = lv.corePlan;
  band(B, b, y, pal, pal.accent, -.35, 1.15);
  for (const e of footprintEdges(b.footprint)) segment(B, 'extMetal', at(e, e.lo - .12, .05), at(e, e.hi + .12, .05), y + 1.15, y + 1.23, .42, pal.frame);
  if (!cp) return;
  const c = cp.core, H = 4.2;
  // Penthouse walls open where the stair doors, open landings and the corridor meet the roof.
  for (const e of footprintEdges(c)) {
    const gaps = [...cp.stairs.map((s) => s.door).filter((d) => d && onEdge(e, [d.x0, d.z0], [d.x1, d.z1], .05)).map((d) => spanOn(e, [d.x0, d.z0], [d.x1, d.z1])),
      ...cp.landings.filter((q) => q.open && rectTouches(q.rect, e)).map((q) => rectSpan(q.rect, e))];
    for (const [a, z] of gaps.reduce((iv, g) => subtractInterval(iv, g), [[e.lo, e.hi]])) segment(B, 'facadePlaster', at(e, a), at(e, z), y, y + H, .24, pal.wall);
    for (const [a, z] of gaps) segment(B, 'facadePlaster', at(e, a), at(e, z), y + 2.4, y + H, .24, pal.wall);
  }
  B.get('stone').box((c.x0 + c.x1) / 2, y + H + .1, (c.z0 + c.z1) / 2, c.x1 - c.x0 + .3, .2, c.z1 - c.z0 + .3, pal.slab);
  for (const e of footprintEdges(c)) segment(B, 'extSatin', at(e, e.lo - .15, .15), at(e, e.hi + .15, .15), y + H - .1, y + H + .3, .1, pal.accent);
  for (const L of cp.lifts) { const r = L.rect; B.get('facadePlaster').box((r.x0 + r.x1) / 2, y + H + .8, (r.z0 + r.z1) / 2, r.x1 - r.x0, 1.2, r.z1 - r.z0, pal.core); }
}

function canopy(B, layout, b, lv, pal) {
  for (const en of (layout.entrances || []).filter((q) => q.building === b.id && q.level === lv.id && q.to === 'site')) {
    const p = toL(b.frame, en.seg.x0, en.seg.z0), q = toL(b.frame, en.seg.x1, en.seg.z1), e = footprintEdges(b.footprint).find((x) => onEdge(x, p, q, .3));
    if (!e) continue;
    // Same constants as the layout's canopy-post obstacles (layout/community.js WEST_CANOPY).
    const { overhang, depth, post } = WEST_CANOPY, [a, z] = spanOn(e, p, q), m = (a + z) / 2, half = (z - a) / 2 + overhang;
    const c = at(e, m, depth / 2), w = e.axis === 'x' ? 2 * half : depth, d = e.axis === 'x' ? depth : 2 * half;
    B.get('extMetal').box(c[0], 3.62, c[1], w, .18, d, pal.frame);
    lamp(B, c[0], 3.52, c[1], w - .5, d - .5, '#f7e8c4');
    for (const s of [m - half + post, m + half - post]) { const o = at(e, s, depth - post); B.get('extMetal').box(o[0], 1.8, o[1], .14, 3.6, .14, pal.frame); }
  }
}

/** Two sign cells per tower in one texture: the crown name and the lobby / entrance plate.
 * A thin third strip carries the painted 消防登高场地 legend of the tower's hardstand. */
function signAtlas(b, pal) {
  const c = makeCanvas(1024, 512), g = c.getContext('2d'), west = b.community === 'west';
  g.fillStyle = pal.sign; g.fillRect(0, 0, 1024, 416);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = pal.ink;
  g.font = `600 92px ${FONT_CN}`; g.fillText(b.name, 512, 80, 980);
  g.font = `500 38px ${FONT_EN}`; g.fillText(b.en, 512, 168, 980);
  g.fillStyle = pal.accent; g.fillRect(0, 204, 1024, 6); g.fillStyle = pal.ink;
  g.font = `600 76px ${FONT_CN}`; g.fillText(west ? '云澜·西苑 · 社区大堂' : '云澜·北苑 · 空中会所', 512, 284, 980);
  g.font = `400 32px ${FONT_EN}`; g.fillText(`云澜物业 · YUNLAN PROPERTY · ${west ? 'RESIDENTS ONLY' : 'SKY CLUB'}`, 512, 368, 980);
  g.fillStyle = '#50585b'; g.fillRect(0, 416, 1024, 96);
  g.fillStyle = '#f2c230'; g.font = `700 64px ${FONT_CN}`; g.fillText('消防登高场地  禁止占用', 512, 466, 980);
  return canvasTexture(c, { clamp: true });
}
export const SIGN_CELLS = Object.freeze({ crown: [0, 1 - 208 / 512, 1, 1], plate: [0, 96 / 512, 1, 1 - 208 / 512], hardstand: [0, 0, 1, 96 / 512] });
const CELL = [SIGN_CELLS.crown, SIGN_CELLS.plate];

/** Main facade for the crown sign: the entrance side (west) or the river side (north). */
function signFacade(layout, b) {
  const main = (layout.entrances || []).find((en) => en.building === b.id && en.main);
  if (main) {
    const p = toL(b.frame, (main.seg.x0 + main.seg.x1) / 2, (main.seg.z0 + main.seg.z1) / 2);
    return footprintEdges(b.footprint).find((e) => Math.abs((e.axis === 'x' ? p[1] : p[0]) - e.c) < .3) || footprintEdges(b.footprint)[1];
  }
  return footprintEdges(b.footprint)[b.community === 'north' ? 0 : 1];
}

/** Permanent exterior of one community tower, plus its lobby / club, roof garden and basement lobbies. */
export function buildCommunityTower(ctx, b, records) {
  const pal = COMMUNITY_PALETTES[b.community] || COMMUNITY_PALETTES.west, layout = ctx.layout;
  const byId = new Map(layout.levels.map((l) => [l.id, l]));
  const levels = (b.levels || []).map((id) => byId.get(id)).filter(Boolean).sort((a, z) => a.elev - z.elev);
  const group = new THREE.Group(); group.name = `${b.id}-community-exterior`;
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), FULL_HEIGHT);
  const materials = new Proxy({}, { get: (m, k) => typeof k !== 'string' || !ctx.mats.base[k] ? undefined : (m[k] ||= clipMaterial(ctx, k, ctx.mats.base[k], plane)) });
  const B = new BatchSet(materials), col = new Columns(), XB = keyed(B, EXTERIOR_KEYS);
  const above = levels.filter((l) => l.elev >= 0), below = levels.filter((l) => l.elev < 0);
  const stairs = layout.stairs.filter((s) => s.building === b.id);
  for (const u of above.flatMap((l) => l.units)) B.frame(u.frame, () => homeFacade(B, col, u, byId.get(u.level), pal));
  B.frame(b.frame, () => {
    for (const lv of above) {
      slab(B, b, lv, pal.slab);
      if (lv.kind === 'roof') { crown(B, b, lv, pal); coreStorey(B, col, b.frame, lv, pal, 4.2, b.footprint); roofGarden(XB, b, lv, pal); continue; }
      if (lv.elev > 0) band(B, b, lv.elev, pal);
      perimeter(B, col, layout, b, lv, pal);
      coreStorey(B, col, b.frame, lv, pal, lv.height, b.footprint);
      canopy(B, layout, b, lv, pal);
    }
  });
  col.flush(B);
  B.flush(group);
  // One sign mesh: the crown name on the main facade and the plate over the street door.
  const signMat = ctx.mats.sign(signAtlas(b, pal));
  signMat.clippingPlanes = [plane];
  const signs = new SignBatch(), roof = levels.find((l) => l.kind === 'roof');
  signs.frame(b.frame, () => {
    const e = signFacade(layout, b), m = (e.lo + e.hi) / 2, p = at(e, m, .3), w = Math.min(9, (e.hi - e.lo) * .4);
    if (roof) signs.place(p[0], roof.elev + .62, p[1], w, w * 208 / 1024, e.side, CELL[0]);
    for (const en of layout.entrances.filter((q) => q.building === b.id && q.main && q.to === 'site')) {
      const a = toL(b.frame, en.seg.x0, en.seg.z0), z = toL(b.frame, en.seg.x1, en.seg.z1), f = footprintEdges(b.footprint).find((x) => onEdge(x, a, z, .3));
      if (!f) continue;
      const [s0, s1] = spanOn(f, a, z), q = at(f, (s0 + s1) / 2, 3.32);
      signs.place(q[0], 4.08, q[1], 3.6, .73, f.side, CELL[1]);
    }
  });
  signs.flush(group, signMat);
  // Protected stair flights are built and shown only once a floor this core serves is visited.
  const stairLevels = (b.stairLevelIds || b.levels).map((id) => byId.get(id)).filter(Boolean).sort((a, z) => a.elev - z.elev);
  buildTowerStairInstances(ctx, b, stairLevels, stairs, materials, group, { idle: [], follow: b.community === 'north', lazy: true });
  const B0 = ctx.buildings?.[b.id];
  if (B0) { B0.group.add(group); B0.exterior = group; B0.exteriorClip = plane; }
  const lobbyLevel = levels.find((l) => l.lobbyPlan);
  const groundGroup = lobbyLevel ? buildCommunityLobby(ctx, b, lobbyLevel, pal, signMat) : null;
  const roofGroup = group;   // the roof garden rides the exterior batches (+0 draw calls)
  const basements = below.map((lv) => buildCommunityBasement(ctx, b, lv, pal, stairs));
  const record = { group, plane, groundGroup, roofGroup, basements, materials, signMaterial: signMat, residentialShells: null, detailLevel: null, community: b.community };
  records?.set(b.id, record);
  return record;
}

const LOBBY_KEYS = { satin: 'matte', extSatin: 'matte', extMetal: 'metal', plaster: 'matte', glassTint: 'glass', glowSoft: 'glow', foliage: 'matte', concrete: 'stone', ext: 'matte' };
const WOOD_ZONES = new Set(['lounge', 'reading', 'kids', 'management', 'gym', 'dining', 'library']);
/** 1F 社区大堂 / 7F 空中会所 from lobbyPlan: zone floors, partitions, furniture and lighting. */
export function buildCommunityLobby(ctx, b, lv, pal, signMat) {
  const group = new THREE.Group(); group.name = `${b.id}-community-${lv.lobbyPlan.kind}`;
  const plan = lv.lobbyPlan, raw = new BatchSet(ctx.mats.base), B = keyed(raw, LOBBY_KEYS), y = lv.elev, h = lv.height;
  B.frame(plan.frame || b.frame, () => {
    for (const z of plan.zones) {
      const wood = WOOD_ZONES.has(z.kind), r = z.rect;
      rectFinish(B, r, y + .012, wood ? 'wood' : 'stone', wood ? '#d6c3a2' : z.kind === 'vestibule' ? '#cfc8b8' : '#e7e1d4');
      // Linear ceiling lights, one row per 2.4 m of zone depth.
      const w = r.x1 - r.x0, d = r.z1 - r.z0, rows = Math.max(1, Math.round(d / 2.4));
      for (let k = 0; k < rows; k++) lamp(B, (r.x0 + r.x1) / 2, y + h - .32, r.z0 + d * (k + .5) / rows, Math.max(.6, w - 1.6), .14, '#f7ead0');
    }
    for (const w of plan.partitions) {
      if (w.role === 'glass') {
        pane(B, 'glass', w.a, w.b, y + .05, y + 3.2);
        segment(B, 'metal', w.a, w.b, y + 3.2, y + 3.3, .08, pal.frame);
        segment(B, 'metal', w.a, w.b, y, y + .08, .08, pal.frame);
        continue;
      }
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), d = w.door;
      const spans = d ? subtractInterval([[0, len]], [d.at - d.width / 2, d.at + d.width / 2]) : [[0, len]];
      for (const [s0, s1] of spans) segment(B, 'plaster', along(w.a, w.b, s0), along(w.a, w.b, s1), y, y + 3.3, .14, '#efebe2');
      if (d) segment(B, 'plaster', along(w.a, w.b, d.at - d.width / 2), along(w.a, w.b, d.at + d.width / 2), y + 2.3, y + 3.3, .14, '#efebe2');
    }
    for (const o of plan.obstacles) lobbyFurniture(B, o, y);
  });
  raw.flush(group);
  // 大堂 / 会所标识（招牌图集第二格，与外立面共用一张贴图）：接待处背墙，否则挂在核心筒墙面上。
  const spot = lobbySignSpot(lv, plan, b);
  if (spot && signMat) {
    const signs = new SignBatch();
    signs.frame(spot.frame, () => signs.place(spot.x, y + 2.75, spot.z, 3.2, .65, spot.side, CELL[1]));
    signs.flush(group, signMat);
  }
  // Seen only when the floor is visited or the tower selected; the campus view pays nothing.
  const L = ctx.levels?.[lv.id];
  (L?.shell || L?.base)?.add(group);
  return group;
}

/** Where the lobby / club sign hangs: on the reception back cabinet, else centred on the longest
 * solid stretch (≥ 3.4 m, clear of stair doors, lift doors and open landings) of the core wall
 * that faces the most club floor area. Null when no such wall exists. */
export function lobbySignSpot(lv, plan, b) {
  const desk = plan.obstacles.find((o) => o.id === 'reception-back-cabinet');
  if (desk) return { frame: plan.frame || b.frame, x: (desk.rect.x0 + desk.rect.x1) / 2, z: desk.rect.z0 - .02, side: 'N' };
  const cp = lv.corePlan, F = cp?.frame || b.frame, P = plan.frame || b.frame;
  if (!cp || ['ox', 'oz', 'deg'].some((k) => Math.abs((F[k] || 0) - (P[k] || 0)) > 1e-6)) return null;
  let best = null;
  for (const e of footprintEdges(cp.core)) {
    const beyond = (r) => e.axis === 'x' ? e.n[1] * ((r.z0 + r.z1) / 2 - e.c) > 0 : e.n[0] * ((r.x0 + r.x1) / 2 - e.c) > 0;
    const area = plan.zones.filter((z) => beyond(z.rect)).reduce((n, z) => n + (z.rect.x1 - z.rect.x0) * (z.rect.z1 - z.rect.z0), 0);
    const busy = [...cp.stairs.map((s) => s.door).filter((d) => d && onEdge(e, [d.x0, d.z0], [d.x1, d.z1], .05)).map((d) => spanOn(e, [d.x0, d.z0], [d.x1, d.z1])),
      ...cp.lifts.filter((l) => l.door === e.side && rectTouches(l.rect, e)).map((l) => rectSpan(l.rect, e)),
      ...cp.landings.filter((q) => q.open && rectTouches(q.rect, e)).map((q) => rectSpan(q.rect, e))];
    const span = busy.reduce((iv, [a, z]) => subtractInterval(iv, [a - .2, z + .2]), [[e.lo, e.hi]])
      .reduce((m, s) => !m || s[1] - s[0] > m[1] - m[0] ? s : m, null);
    if (!area || !span || span[1] - span[0] < 3.4) continue;
    if (!best || area > best.area) best = { area, e, t: (span[0] + span[1]) / 2 };
  }
  if (!best) return null;
  const [x, z] = at(best.e, best.t, .02);
  return { frame: F, x, z, side: best.e.side };
}

/** Roof garden (inside the building frame, exterior batches): deck, planters along the parapet
 * (layout planters where given), pergola and benches. */
function roofGarden(B, b, lv, pal) {
  const y = lv.elev, r = b.footprint, core = lv.corePlan?.core;
  const planters = lv.roofGarden?.planters?.map((p) => p.rect) || footprintEdges(r).flatMap((e) => {
    const spans = core && rectTouches(core, e, 1.5) ? subtractInterval([[e.lo + 1, e.hi - 1]], [rectSpan(core, e)[0] - 1, rectSpan(core, e)[1] + 1]) : [[e.lo + 1, e.hi - 1]];
    return spans.filter(([a, z]) => z - a > 2).map(([a, z]) => { const p = at(e, a, -.7), q = at(e, z, -1.2); return rect(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])); });
  });
  {
    for (const p of planters) planter(B, p.x0, p.z0, p.x1, p.z1, y, Math.round(Math.abs(p.x0 * 7 + p.z0)) + 1, true, 'stone');
    // Timber deck and pergola on the sunny (south) half.
    const deck = rect(r.x0 + 3, (r.z0 + r.z1) / 2 + 1.6, r.x1 - 3, r.z1 - 2.2);
    if (deck.z1 - deck.z0 > 1.5) {
      B.get('wood').box((deck.x0 + deck.x1) / 2, y + .02, (deck.z0 + deck.z1) / 2, deck.x1 - deck.x0, .04, deck.z1 - deck.z0, '#cdb894');
      const px0 = deck.x0 + 2, px1 = Math.min(deck.x1 - 2, px0 + 9), pz = (deck.z0 + deck.z1) / 2;
      for (const x of [px0, px1]) for (const z of [deck.z0 + .3, deck.z1 - .3]) B.get('metal').box(x, y + 1.45, z, .1, 2.9, .1, pal.frame);
      for (let x = px0; x <= px1; x += .6) B.get('wood').box(x, y + 2.95, pz, .1, .14, deck.z1 - deck.z0, '#d4c19f');
      for (const x of [px0 + 2.2, px1 - 2.2]) bench(B, x, y, pz, 0, 'wood');
    }
  }
}

/** Basement lobby (west B1/B2): slab, retaining walls with the deck portal, glass vestibule and core. */
export function buildCommunityBasement(ctx, b, lv, pal, stairs) {
  const group = new THREE.Group(); group.name = `${lv.id}-community-basement`;
  const B = new BatchSet(ctx.mats.base), col = new Columns(), y = lv.elev, h = lv.height, cp = lv.corePlan;
  B.frame(b.frame, () => {
    slab(B, b, lv, '#c9cdc9', .3);
    for (const piece of lv.slab.pieces) {
      const r = piece.localRect;
      if (!r) continue;
      for (const e of footprintEdges(r)) {
        const gaps = entranceSpans(ctx.layout, b, lv, e);
        for (const [a, z] of gaps.reduce((iv, s) => subtractInterval(iv, s), [[e.lo, e.hi]])) segment(B, 'matte', at(e, a), at(e, z), y, y + h - .3, .25, '#cdd1cc');
        for (const [a, z] of gaps) {
          segment(B, 'matte', at(e, a), at(e, z), y + 2.6, y + h - .3, .25, '#cdd1cc');
          segment(B, 'metal', at(e, a - .06), at(e, z + .06), y + 2.52, y + 2.62, .3, pal.frame);
        }
      }
    }
    coreStorey(B, col, b.frame, lv, pal, h - .3, lv.slab.pieces[0]?.localRect);
    const same = (a, z) => ['x0', 'z0', 'x1', 'z1'].every((k) => Math.abs(a[k] - z[k]) < 1e-6);
    for (const w of lv.walk.filter((q) => q.rect && q.frame && !cp?.landings.some((l) => same(l.rect, q.rect)) && !(cp?.corridor && same(cp.corridor, q.rect))))
      rectFinish(B, w.rect, y + .005, 'stone', '#dcd8cd');
  });
  for (const s of lv.navWalls || []) if (s.glass) {
    pane(B, 'glass', [s.x0, s.z0], [s.x1, s.z1], y + .05, y + 2.6);
    segment(B, 'metal', [s.x0, s.z0], [s.x1, s.z1], y + 2.6, y + 2.7, .08, pal.frame);
  }
  col.flush(B);
  B.flush(group);
  ctx.levels?.[lv.id]?.base.add(group);
  return group;
}

