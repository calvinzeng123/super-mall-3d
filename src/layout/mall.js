// 室内商场通用构建器：圆厅 + 翼楼（规格第 3 节）。输入一期 / 二期的 spec，输出该期的楼层与垂直交通。
// 约定：翼楼 frame 原点在圆厅圆心，u 沿翼楼轴线向外，v = u 转 +90°；+v 店铺带门面朝 −v（N），−v 带朝 +v（S）。
import { frame, toW, dirW, rect, lrectPoly, lroundPoly, lpoly, lseg, NORMAL, polyBounds } from './geom.js';
import { HW, SW, END, CORE, SLOT_HW, KIT, ESC, CATEGORIES } from './constants.js';
import { hubOutline, ringPieces } from './hub.js';
import { fillRows, markSpecial } from './parking.js';
import { addDriveway, addTrench, addPlaza } from './campus.js';

const toward = (s) => (s > 0 ? 'N' : 'S');
/** 店铺带矩形：u∈[u0,u1]，v∈[a,b]（s<0 时取镜像 [−b,−a]） */
export const band = (u0, u1, s, a, b) => (s > 0 ? rect(u0, a, u1, b) : rect(u0, -b, u1, -a));
/** 同一条带上沿 u 的门面线段（v = s·a） */
const hFront = (u0, u1, s, a) => ({ x0: u0, z0: s * a, x1: u1, z1: s * a, side: toward(s) });
/** 垂直于 u 的门面（u 固定），v∈[a,b] 按带镜像 */
function vFront(u, s, a, b, side) {
  const [z0, z1] = s > 0 ? [a, b] : [-b, -a];
  return { x0: u, z0, x1: u, z1, side };
}

function makeWing(w, rots, bid) {
  const r = rots[w.rot];
  const F = frame(r.x, r.z, w.deg, `${bid}-${w.id}`);
  const ua = Math.sqrt(r.R * r.R - HW * HW);
  const W = { ...w, F, r, ua, u0: r.R + 1, streetStart: r.R - 5, aisleStart: r.R - 6, spineStart: r.R - 4 };
  if (w.to) {
    const o = rots[w.to];
    const len = Math.hypot(o.x - r.x, o.z - r.z);
    const farUa = Math.sqrt(o.R * o.R - HW * HW);
    Object.assign(W, {
      link: true, len, farR: o.R, farUa, uEnd: len - farUa, bandEnd: len - (o.R + 1),
      streetEnd: len - (o.R - 5), aisleEnd: len - (o.R - 6), spineEnd: len - (o.R - 4), rowEnd: len - farUa,
    });
  } else {
    Object.assign(W, {
      link: false, uEnd: w.uEnd, bandEnd: w.uEnd - END, streetEnd: w.uEnd - END,
      aisleEnd: w.uEnd - END, spineEnd: w.uEnd - 12, rowEnd: w.uEnd - 12,
    });
  }
  // 末端接方庭：店铺、商业街、车道一直通到末端，不设端部区 / 端楼梯 / 端入口
  if (w.annex) Object.assign(W, { bandEnd: w.uEnd, streetEnd: w.uEnd, aisleEnd: w.uEnd, spineEnd: w.uEnd, rowEnd: w.uEnd });
  // 与相邻翼夹角小时，翼楼全宽段从 start 起（之前为喇叭口）
  if (w.start) Object.assign(W, { u0: w.start, aisleStart: w.start, rowStart: w.start + 1.5 });
  return W;
}

/** 把 [a,b] 按宽度序列切成铺位，余量不足 6m 并入最后一间 */
export function split(a, b, pattern, state) {
  const out = [];
  let x = a;
  while (b - x > 1e-6) {
    let w = pattern[state.k++ % pattern.length];
    if (b - x - w < 6) w = b - x;
    if (w > 18) w = (b - x) / 2;
    out.push([x, x + w]);
    x += w;
  }
  return out;
}

const walkL = (F, id, kind, r) => ({ id, kind, poly: lrectPoly(F, r), frame: F, rect: r });
const walkP = (F, id, kind, pts) => ({ id, kind, poly: lpoly(F, pts), frame: F, lpoly: pts });

export function lift(id, bid, type, F, lu, lv, w, d, door, serves) {
  const [x, z] = toW(F, lu, lv);
  const [nx, nz] = dirW(F, ...NORMAL[door]);
  const reach = door === 'E' || door === 'W' ? w / 2 : d / 2;
  return { id, building: bid, type, frame: F, lu, lv, w, d, door, x, z, nx, nz, reach, serves };
}

export function buildMall(spec, site, picker) {
  const bid = spec.id;
  const rots = Object.fromEntries(spec.rotundas.map((r) => [r.id, { ...r, kitF: frame(r.x, r.z, r.kitDeg || 0, `${bid}-${r.id}`) }]));
  const wings = spec.wings.map((w) => makeWing(w, rots, bid));
  const wingById = Object.fromEntries(wings.map((w) => [w.id, w]));
  const outline = hubOutline(spec.rotundas, spec.wings, HW);
  const levels = spec.levels.map((c) => ({
    id: `${bid}-${c.short}`, building: bid, short: c.short, name: c.name, kind: c.kind, elev: c.elev, height: c.height,
    theme: { ...c.theme }, outline, units: [], rooms: [], walk: [], voids: [], features: [], slab: null, cfg: c,
  }));
  const byShort = Object.fromEntries(levels.map((l) => [l.short, l]));
  const allIds = levels.map((l) => l.id);
  const ctx = { bid, spec, rots, wings, wingById, levels, byShort, picker, site, slotSpans: {}, state: {} };

  // ---------- 扶梯（先算，商业街走道要绕开扶梯洞口） ----------
  const escalators = [];
  for (const p of spec.escalators) {
    const pair = escalatorPair(p, ctx);
    escalators.push(...pair);
    if (p.slot) {
      const e = pair[0];
      const hi = levels.find((l) => l.id === e.to);
      hi.voids.push({ id: `slot-${p.pair}`, kind: 'escalator', poly: lrectPoly(e.frame, e.slotRect), frame: e.frame, rect: e.slotRect });
      if (p.wing) {
        const m = (ctx.slotSpans[hi.id] = ctx.slotSpans[hi.id] || {});
        (m[p.wing] = m[p.wing] || []).push([e.slotRect.x0, e.slotRect.x1]);
      }
    }
  }

  // ---------- 电梯与楼梯 ----------
  const elevators = [];
  const stairs = [];
  const stair = (id, F, r, door, parkDoor) => {
    const doorByLevel = {};
    if (parkDoor) for (const l of levels) if (l.kind === 'parking') doorByLevel[l.id] = parkDoor;
    stairs.push({ id: `${bid}-${id}`, building: bid, frame: F, rect: r, door, doorByLevel, serves: allIds });
  };
  for (const w of wings) {
    if (w.core) {
      const s = w.core.band, c = w.core.u;
      for (const [k, lu] of [[1, c + 1.3], [2, c + 4.3]]) elevators.push(lift(`${bid}-${w.id}-L${k}`, bid, 'passenger', w.F, lu, s * 8.5, 2.6, 3, toward(s), allIds));
      stair(`${w.id}-ST`, w.F, band(c, c + 8, s, 18, HW), hFront(c + 1.5, c + 6.5, s, 18));
    }
    if (!w.link && !w.annex) {
      for (const s of [1, -1]) {
        stair(`${w.id}-ST${s > 0 ? 'L' : 'R'}`, w.F, band(w.uEnd - END, w.uEnd, s, 17, HW), hFront(w.uEnd - 5, w.uEnd - 1, s, 17),
          vFront(w.uEnd - END, s, 18.5, 22.5, 'W'));
      }
    }
  }
  ctx.pocketStairs = spec.pocketStairs || [];
  for (const p of ctx.pocketStairs) {
    const w = wingById[p.wing];
    const [a, b] = p.far ? [w.len - (w.farR + 1), w.len - (w.farR - 5)] : [w.r.R - 5, w.r.R + 1];
    stair(`${w.id}-PS${p.band > 0 ? 'L' : 'R'}${p.far ? 'B' : ''}`, w.F, band(a, b, p.band, 18, HW), hFront(a + 0.5, b - 0.5, p.band, 18));
  }
  for (const r of Object.values(rots)) {
    if (!r.glass) continue;
    const serves = r.glass.map((s) => byShort[s].id);
    for (const g of KIT.glass) elevators.push(lift(`${bid}-${r.id}-${g.id}`, bid, 'glass', r.kitF, g.x, g.z, KIT.shaft, KIT.shaft, g.door, serves));
  }
  if (spec.square) {
    const sq = spec.square.setup(bid, byShort, lift);
    elevators.push(...sq.elevators);
    stairs.push(...sq.stairs);
  }
  ctx.stairs = stairs;

  // ---------- 各层 ----------
  for (const lv of levels) {
    if (lv.kind === 'parking') parkingLevel(ctx, lv);
    else if (lv.kind === 'roof') roofLevel(ctx, lv);
    else retailLevel(ctx, lv);
    if (spec.square) {
      const r = spec.square.level(lv, picker, ctx.state);
      if (r.rows) ctx.state[`rows-${lv.id}`].push(r.rows);
      ctx.state[`blocks-${lv.id}`] = r.blocks;
    }
    commonRooms(ctx, lv);
    if (lv.kind === 'parking') fillParking(ctx, lv, elevators);
  }

  // ---------- 入口、坡道、场地登记 ----------
  const entrances = spec.entrances.map((e) => entrance(e, ctx));
  const ramps = (spec.ramps || []).map((r) => {
    const F = r.rot ? rots[r.rot].kitF : wingById[r.wing].F;
    const end = ([u, v, s]) => {
      const [x, z] = toW(F, u, v);
      return s === 'street' ? { x, z, y: 0, level: 'street' } : { x, z, y: byShort[s].elev, level: byShort[s].id };
    };
    const width = Math.min(r.lane.x1 - r.lane.x0, r.lane.z1 - r.lane.z0);
    return { id: `${bid}-${r.id}`, building: bid, type: r.type, name: r.name, width, frame: F, lane: r.lane, poly: lrectPoly(F, r.lane), from: end(r.from), to: end(r.to) };
  });
  const wf = (x) => (x.rot ? rots[x.rot].kitF : wingById[x.wing].F);
  for (const d of spec.driveways || []) addDriveway(site, lrectPoly(wf(d), d.rect));
  for (const t of spec.trenches || []) addTrench(site, lrectPoly(wf(t), t.rect));
  for (const p of spec.plazas || []) addPlaza(site, `${bid}-${p.id}`, p.poly, bid);

  // ---------- 世界坐标与编号 ----------
  for (const s of stairs) {
    s.poly = lrectPoly(s.frame, s.rect);
    s.wdoor = lseg(s.frame, s.door);
    s.wdoorByLevel = Object.fromEntries(Object.entries(s.doorByLevel).map(([k, d]) => [k, lseg(s.frame, d)]));
  }
  for (const lv of levels) finalize(ctx, lv);

  const b = polyBounds(outline);
  const center = [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
  const radius = Math.max(...outline.map(([x, z]) => Math.hypot(x - center[0], z - center[1])));
  const building = {
    id: bid, code: spec.code, name: spec.name, short: spec.short, en: spec.en, kind: 'mall', levels: allIds, outline, center, radius, plot: spec.plot,
    rotundas: Object.values(rots).map((r) => ({ id: r.id, x: r.x, z: r.z, R: r.R, kitF: r.kitF })),
    square: spec.square ? spec.square.info : null,
    wings: wings.map((w) => ({ id: w.id, rot: w.rot, to: w.to || null, deg: w.deg, F: w.F, ua: w.ua, u0: w.u0, uEnd: w.uEnd, bandEnd: w.bandEnd, link: w.link, len: w.len, core: w.core, zone: w.zone, R: w.r.R, start: w.start || null, annex: !!w.annex })),
  };
  for (const lv of levels) delete lv.cfg;
  return { building, levels, escalators, elevators, stairs, entrances, ramps };
}

// ---------------------------------------------------------------------------

function escalatorPair(p, ctx) {
  const F = p.frame || (p.rot ? ctx.rots[p.rot].kitF : ctx.wingById[p.wing].F);
  const lo = ctx.byShort[p.from];
  const hi = ctx.byShort[p.to];
  const rise = +(hi.elev - lo.elev).toFixed(3);
  const run = rise * Math.sqrt(3);
  let b;
  let t;
  if (p.top !== undefined) { t = p.top; b = t - p.sign * run; }
  else if (p.bottom !== undefined) { b = p.bottom; t = b + p.sign * run; }
  else { b = (-p.sign * run) / 2; t = (p.sign * run) / 2; }
  const h = ESC.slotHalf;
  const slotRect = p.axis === 'z' ? rect(p.cross - h, b, p.cross + h, t) : rect(b, p.cross - h, t, p.cross + h);
  return [-1, 1].map((k, i) => {
    const c = p.cross + (k * ESC.lane) / 2;
    const P = (along) => (p.axis === 'z' ? toW(F, c, along) : toW(F, along, c));
    const [bx, bz] = P(b);
    const [tx, tz] = P(t);
    return {
      id: `${ctx.bid}-${p.pair}-${i ? 'D' : 'U'}`, building: ctx.bid, pair: `${ctx.bid}-${p.pair}`, from: lo.id, to: hi.id, dir: i ? 'down' : 'up',
      bottom: { x: bx, y: lo.elev, z: bz }, top: { x: tx, y: hi.elev, z: tz }, width: ESC.width, rise, run, slot: !!p.slot, label: p.label,
      frame: F, axis: p.axis, wing: p.wing || null, rot: p.rot || null, slotRect, square: !!p.square,
    };
  });
}

function entrance(e, ctx) {
  const lv = ctx.byShort[e.level];
  let seg;
  let nx;
  let nz;
  if (e.frame) {
    const [x0, z0] = toW(e.frame, e.seg.x0, e.seg.z0);
    const [x1, z1] = toW(e.frame, e.seg.x1, e.seg.z1);
    seg = { x0, z0, x1, z1 };
    [nx, nz] = dirW(e.frame, e.n[0], e.n[1]);
  } else if (e.wing) {
    const w = ctx.wingById[e.wing];
    const [x0, z0] = toW(w.F, w.uEnd, e.v0);
    const [x1, z1] = toW(w.F, w.uEnd, e.v1);
    seg = { x0, z0, x1, z1 };
    [nx, nz] = dirW(w.F, 1, 0);
  } else {
    const r = ctx.rots[e.rot];
    const P = (deg) => [r.x + Math.cos((deg * Math.PI) / 180) * r.R, r.z + Math.sin((deg * Math.PI) / 180) * r.R];
    const [x0, z0] = P(e.a0);
    const [x1, z1] = P(e.a1);
    seg = { x0, z0, x1, z1 };
    const m = ((e.a0 + e.a1) / 2) * (Math.PI / 180);
    nx = Math.cos(m);
    nz = Math.sin(m);
  }
  const width = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
  return { id: `${ctx.bid}-${e.id}`, building: ctx.bid, name: e.name, level: lv.id, seg, nx, nz, width, main: !!e.main, to: e.to || 'site', square: !!e.square };
}

/** 楼层品牌来源：翼楼队列 → 楼层队列（v1 槽位）→ 按业态取用 */
function nextBrand(ctx, lv, wc) {
  for (const q of [wc && wc.brandQ, lv.cfg.brandQ]) {
    while (q && q.i < q.list.length) {
      const b = ctx.picker.v1(q.level, q.list[q.i++]);
      if (b) return b;
    }
  }
  const cats = (wc && wc.cats) || lv.cfg.cats || ['fashion'];
  const st = (ctx.state[`cat-${lv.id}`] = ctx.state[`cat-${lv.id}`] || { k: 0 });
  return ctx.picker.take(cats[st.k++ % cats.length]);
}
function anchorBrand(ctx, a) {
  if (a.v1) return ctx.picker.v1(a.v1[0], a.v1[1]);
  return ctx.picker.take(a.cat);
}

function addUnit(lv, F, slot, rects, fronts, brand, extra = {}) {
  const u = { id: `${lv.id}-${slot}`, slot, level: lv.id, building: lv.building, brand, frame: F, rects, fronts, style: 'glass', ...extra };
  lv.units.push(u);
  return u;
}

function prepareQueues(lv) {
  const c = lv.cfg;
  if (c.brands && !c.brandQ) c.brandQ = { level: c.brands[0], list: c.brands.slice(1), i: 0 };
  for (const wc of Object.values(c.wings || {})) if (wc.brands && !wc.brandQ) wc.brandQ = { level: wc.brands[0], list: wc.brands.slice(1), i: 0 };
}

function rotundaFloor(ctx, lv, kindDefault) {
  const c = lv.cfg;
  for (const r of Object.values(ctx.rots)) {
    const rc = (c.rot && c.rot[r.id]) || {};
    const F = r.kitF;
    if (rc.void) {
      lv.voids.push({ id: `${r.id}-void`, kind: rc.voidKind || 'atrium', poly: lroundPoly(F, rc.void.rect, rc.void.r), frame: F, rect: rc.void.rect, radius: rc.void.r });
    }
    if (rc.rampVoid) lv.voids.push({ id: `${r.id}-ramp`, kind: 'ramp', poly: lrectPoly(F, rc.rampVoid), frame: F, rect: rc.rampVoid });
    if (rc.shafts) {
      const h = KIT.shaft / 2;
      for (const g of KIT.glass) lv.voids.push({ id: `${r.id}-shaft-${g.id}`, kind: 'shaft', poly: lrectPoly(F, rect(g.x - h, g.z - h, g.x + h, g.z + h)), frame: F });
    }
    const hole = rc.hole || (rc.void && rc.void.rect) || null;
    ringPieces(r, F, hole).forEach((poly, k) => lv.walk.push({ id: `${r.id}-${k}`, kind: rc.kind || kindDefault, poly, rot: r.id }));
    for (const u of rc.units || []) addUnit(lv, F, u.slot, [u.rect], u.fronts, anchorBrand(ctx, u), { style: u.style || 'glass', rot: r.id });
  }
}

function retailLevel(ctx, lv) {
  prepareQueues(lv);
  rotundaFloor(ctx, lv, lv.kind === 'food' ? 'foodcourt' : 'atrium');
  for (const w of ctx.wings) wingRetail(ctx, lv, w, (lv.cfg.wings && lv.cfg.wings[w.id]) || {});
}

function pocketHasStair(ctx, w, s, far) {
  return ctx.pocketStairs.some((p) => p.wing === w.id && p.band === s && !!p.far === far);
}

function wingRetail(ctx, lv, w, wc) {
  const F = w.F;
  // 端部区
  if (!w.link && !w.annex) lv.walk.push(walkL(F, `${w.id}-end`, wc.end || 'lounge', rect(w.bandEnd, -17, w.uEnd, 17)));
  // 核心筒电梯厅
  if (w.core) {
    const s = w.core.band, c = w.core.u;
    lv.walk.push(walkL(F, `${w.id}-lobby`, 'lobby', band(c, c + 8, s, 10, 18)));
    lv.walk.push(walkL(F, `${w.id}-passage`, 'lobby', band(c + 5.6, c + 8, s, SW, 10)));
  }
  // 口袋（翼楼与圆厅之间）；喇叭口翼用多边形口袋
  if (w.neck) {
    for (const [s, poly] of [[1, w.neck.plus], [-1, w.neck.minus]]) lv.walk.push(walkP(F, `${w.id}-neck${s > 0 ? 'L' : 'R'}`, 'pocket', poly));
  }
  const pockets = w.neck ? [] : [[false, w.ua, w.u0]];
  if (w.link) pockets.push([true, w.bandEnd, w.uEnd]);
  for (const [far, pa, pb] of pockets) {
    for (const s of [1, -1]) {
      const tag = `${w.id}-pocket${s > 0 ? 'L' : 'R'}${far ? 'B' : ''}`;
      if (pocketHasStair(ctx, w, s, far)) {
        const [sa, sb] = far ? [w.len - (w.farR + 1), w.len - (w.farR - 5)] : [w.r.R - 5, w.r.R + 1];
        lv.walk.push(walkL(F, tag, 'pocket', band(pa, pb, s, SW, 18)));
        const [ca, cb] = far ? [sb, pb] : [pa, sa];
        if (cb - ca > 0.5) lv.walk.push(walkL(F, `${tag}c`, 'pocket', band(ca, cb, s, 18, HW)));
      } else lv.walk.push(walkL(F, tag, 'pocket', band(pa, pb, s, SW, HW)));
    }
  }
  // 商业街（通高缝与扶梯洞口处拆成两侧条带 + 段间连桥）
  for (const [a, b] of wc.slots || []) {
    const r = rect(a, -SLOT_HW, b, SLOT_HW);
    lv.voids.push({ id: `${w.id}-slot-${a}`, kind: 'street', poly: lrectPoly(F, r), frame: F, rect: r });
  }
  const spans = [...(wc.slots || []), ...((ctx.slotSpans[lv.id] || {})[w.id] || [])].sort((p, q) => p[0] - q[0]);
  const s0 = w.streetStart;
  const s1 = wc.streetEnd ?? w.streetEnd;
  if (!spans.length) lv.walk.push(walkL(F, `${w.id}-street`, 'street', rect(s0, -SW, s1, SW)));
  else {
    lv.walk.push(walkL(F, `${w.id}-streetL`, 'street', rect(s0, SLOT_HW, s1, SW)));
    lv.walk.push(walkL(F, `${w.id}-streetR`, 'street', rect(s0, -SW, s1, -SLOT_HW)));
    let x = s0;
    spans.forEach(([a, b], k) => {
      if (a - x > 0.5) lv.walk.push(walkL(F, `${w.id}-street${k}`, 'street', rect(x, -SW, a, SW)));
      x = Math.max(x, b);
    });
    if (s1 - x > 0.5) lv.walk.push(walkL(F, `${w.id}-streetE`, 'street', rect(x, -SW, s1, SW)));
  }
  // Side connections reserve actual shop-band floor area, with the same
  // rectangles used for the walk graph and retail subdivision.
  for (const [i, hall] of (wc.sideHalls || []).entries()) lv.walk.push(walkL(F, `${w.id}-side-hall-${i}`, 'passage', band(hall.u0, hall.u1, hall.band, SW, HW)));
  // 店铺带
  const pattern = wc.widths || lv.cfg.widths || [9, 8, 10, 7];
  const st = (ctx.state[`split-${lv.id}`] = ctx.state[`split-${lv.id}`] || { k: 0 });
  const style = wc.style || 'glass';
  for (const s of [1, -1]) {
    const reserved = (wc.sideHalls || []).filter(h => h.band === s).map(h => [h.u0, h.u1]);
    if (w.core && w.core.band === s) reserved.push([w.core.u, w.core.u + CORE]);
    for (const a of wc.anchors || []) if (a.band === s || a.band === 0) reserved.push([a.u0, a.u1]);
    reserved.sort((p, q) => p[0] - q[0]);
    const free = [];
    let x = w.u0;
    for (const [a, b] of reserved) {
      if (a - x > 0.5) free.push([x, a]);
      x = Math.max(x, b);
    }
    if (w.bandEnd - x > 0.5) free.push([x, w.bandEnd]);
    let n = 0;
    for (const [a, b] of free) {
      for (const [p, q] of split(a, b, pattern, st)) {
        const fronts = [hFront(p, q, s, SW)];
        if (Math.abs(p - w.u0) < 1e-6) fronts.push(vFront(p, s, SW, pocketHasStair(ctx, w, s, false) ? 18 : HW, 'W'));
        if (Math.abs(q - w.bandEnd) < 1e-6) {
          if (w.link) fronts.push(vFront(q, s, SW, pocketHasStair(ctx, w, s, true) ? 18 : HW, 'E'));
          else fronts.push(vFront(q, s, SW, 16, 'E'));
        }
        addUnit(lv, F, `${w.id}${s > 0 ? 'L' : 'R'}${++n}`, [band(p, q, s, SW, HW)], fronts, nextBrand(ctx, lv, wc), { style, wing: w.id });
      }
    }
  }
  // 主力店
  for (const a of wc.anchors || []) {
    const brand = anchorBrand(ctx, a);
    if (a.band === 0) {
      const fronts = [{ x0: a.u0, z0: -SW, x1: a.u0, z1: SW, side: 'W' }];
      if (!w.link && Math.abs(a.u1 - w.bandEnd) < 1e-6) fronts.push({ x0: a.u1, z0: -16, x1: a.u1, z1: 16, side: 'E' });
      addUnit(lv, F, a.slot, [rect(a.u0, -HW, a.u1, HW)], fronts, brand, { style: a.style || 'glass', wing: w.id, anchor: true });
    } else {
      const fronts = [hFront(a.u0, a.u1, a.band, SW)];
      addUnit(lv, F, a.slot, [band(a.u0, a.u1, a.band, SW, HW)], fronts, brand, { style: a.style || 'glass', wing: w.id, anchor: true });
    }
  }
}

function parkingLevel(ctx, lv) {
  const c = lv.cfg;
  rotundaFloor(ctx, lv, 'aisle');
  ctx.state[`rows-${lv.id}`] = [];
  for (const w of ctx.wings) {
    const wc = (c.wings && c.wings[w.id]) || {};
    const F = w.F;
    lv.walk.push(walkL(F, `${w.id}-aisle1`, 'aisle', rect(w.aisleStart, -18, w.aisleEnd, -12)));
    lv.walk.push(walkL(F, `${w.id}-aisle2`, 'aisle', rect(w.aisleStart, 12, w.aisleEnd, 18)));
    if (!w.link && !w.annex) {
      lv.walk.push(walkL(F, `${w.id}-cross`, 'aisle', rect(w.uEnd - 12, -HW, w.uEnd - END, HW)));
      lv.walk.push(walkL(F, `${w.id}-endzone`, wc.end || 'spine', rect(w.uEnd - END, -17, w.uEnd, 17)));
    }
    // 中央步行脊（停车层卫生间所在翼扣出卫生间）
    const pw = c.parkWc && c.parkWc.wing === w.id ? c.parkWc.u : null;
    if (pw === null) lv.walk.push(walkL(F, `${w.id}-spine`, 'spine', rect(w.spineStart, -SW, w.spineEnd, SW)));
    else {
      lv.walk.push(walkL(F, `${w.id}-spine`, 'spine', rect(w.spineStart, -SW, pw, SW)));
      lv.walk.push(walkL(F, `${w.id}-spineWc`, 'spine', rect(pw, 3, pw + 8, SW)));
      lv.walk.push(walkL(F, `${w.id}-spine2`, 'spine', rect(pw + 8, -SW, w.spineEnd, SW)));
      lv.rooms.push({ id: `${w.id}-pwc`, type: 'wc', label: '洗手间', frame: F, rects: [rect(pw, -SW, pw + 8, 3)], doors: [{ x0: pw + 2.5, z0: 3, x1: pw + 5.5, z1: 3, side: 'S' }] });
    }
    if (wc.eschall) lv.walk.push(walkL(F, `${w.id}-eschall`, 'eschall', rect(wc.eschall[0], -SW, wc.eschall[1], SW)));
    for (const [i, hall] of (wc.sideHalls || []).entries()) lv.walk.push(walkL(F, `${w.id}-side-hall-${i}`, 'aisle', band(hall.u0,hall.u1,hall.band,SW,HW)));
    if (wc.throat) lv.walk.push(walkL(F, `${w.id}-throat`, 'aisle', wc.throat));
    ctx.state[`rows-${lv.id}`].push({
      F, zone: w.zone || w.id, rows: [
        { id: `${w.id}-r1`, u0: w.rowStart ?? w.ua, u1: w.rowEnd, v0: 18, v1: HW, face: 'N' },
        { id: `${w.id}-r2`, u0: w.rowStart ?? w.ua, u1: w.rowEnd, v0: SW, v1: 12, face: 'S' },
        { id: `${w.id}-r3`, u0: w.rowStart ?? w.ua, u1: w.rowEnd, v0: -12, v1: -SW, face: 'N' },
        { id: `${w.id}-r4`, u0: w.rowStart ?? w.ua, u1: w.rowEnd, v0: -HW, v1: -18, face: 'S' },
      ],
    });
  }
}

function fillParking(ctx, lv, elevators) {
  const blocks = [...lv.walk.map((w) => w.poly), ...lv.rooms.flatMap((m) => m.rects.map((r) => lrectPoly(m.frame, r))), ...lv.voids.map((v) => v.poly), ...(ctx.state[`blocks-${lv.id}`] || [])];
  const stalls = [];
  const columns = [];
  for (const g of ctx.state[`rows-${lv.id}`]) {
    const res = fillRows(g.F, g.rows, blocks, g.zone);
    stalls.push(...res.stalls);
    columns.push(...res.columns);
  }
  const lifts = elevators.filter((e) => e.type === 'passenger' && e.serves.includes(lv.id)).map((e) => [e.x, e.z]);
  markSpecial(stalls, lifts, lv.cfg.evRow || `${ctx.wings[0].id}-r1`);
  lv.parking = { stalls, columns, aisles: lv.walk.filter((w) => w.kind === 'aisle').map((w) => w.poly) };
}

function roofLevel(ctx, lv) {
  prepareQueues(lv);
  rotundaFloor(ctx, lv, 'deck');
  for (const w of ctx.wings) {
    const wc = (lv.cfg.wings && lv.cfg.wings[w.id]) || {};
    lv.walk.push(walkL(w.F, `${w.id}-roof`, 'deck', rect(w.ua, -HW, w.uEnd, HW)));
    for (const [a, b] of wc.skylights || []) {
      const r = rect(a, -SLOT_HW, b, SLOT_HW);
      lv.voids.push({ id: `${w.id}-sky-${a}`, kind: 'skylight', poly: lrectPoly(w.F, r), frame: w.F, rect: r });
    }
  }
  if (lv.cfg.roof) lv.cfg.roof(roofApi(ctx, lv));
}

/** 天台要素回调使用的小工具 */
function roofApi(ctx, lv) {
  return {
    lv, wing: (id) => ctx.wingById[id], rot: (id) => ctx.rots[id], picker: ctx.picker,
    unit(F, slot, r, fronts, brand, extra) { return addUnit(lv, F, slot, [r], fronts, brand, extra); },
    room(F, id, type, label, r, doors = []) { lv.rooms.push({ id, type, label, frame: F, rects: [r], doors }); },
    walk(F, id, kind, r) { lv.walk.push(walkL(F, id, kind, r)); },
    feature(f) { lv.features.push(f); return f; },
    v1: (level, slot) => ctx.picker.v1(level, slot),
  };
}

function commonRooms(ctx, lv) {
  for (const s of ctx.stairs) {
    if (!s.serves.includes(lv.id)) continue;
    lv.rooms.push({ id: s.id, type: 'stair', label: '安全出口', frame: s.frame, rects: [s.rect], doors: [s.doorByLevel[lv.id] || s.door] });
  }
  for (const w of ctx.wings) {
    if (!w.core) continue;
    const s = w.core.band, c = w.core.u;
    lv.rooms.push({ id: `${w.id}-core`, type: 'core', label: '客梯', frame: w.F, rects: [band(c, c + 5.6, s, SW, 10)], doors: [] });
    if (lv.kind === 'retail' || lv.kind === 'food') {
      lv.rooms.push({ id: `${w.id}-wc`, type: 'wc', label: '洗手间', frame: w.F, rects: [band(c + 8, c + CORE, s, SW, HW)], doors: [hFront(c + 10.5, c + 13.5, s, SW)] });
    }
  }
}

function finalize(ctx, lv) {
  for (const u of lv.units) {
    u.polys = u.rects.map((r) => lrectPoly(u.frame, r));
    u.wfronts = u.fronts.map((f) => lseg(u.frame, f));
    u.brand.catLabel = (CATEGORIES[u.brand.cat] || {}).label || u.brand.cat;
  }
  for (const m of lv.rooms) {
    m.polys = m.rects.map((r) => lrectPoly(m.frame, r));
    m.wdoors = m.doors.map((d) => lseg(m.frame, d));
  }
  lv.slab = { pieces: [{ outer: lv.outline, holes: lv.voids.map((v) => v.poly) }] };
  // 铺位号：按翼楼顺序、带、u 排序
  const order = Object.fromEntries(ctx.wings.map((w, i) => [w.id, i]));
  const key = (u) => {
    const r = u.rects[0];
    return [u.rot ? -1 : order[u.wing] ?? 9, r.z0 < 0 ? 1 : 0, r.x0];
  };
  const sorted = [...lv.units].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
  sorted.forEach((u, i) => { u.code = `${ctx.spec.code}${lv.short}-${String(i + 1).padStart(2, '0')}`; });
}
