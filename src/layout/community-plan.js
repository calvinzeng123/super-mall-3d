// Procedural home-plan generator for the 云澜·西苑 / 云澜·北苑 community towers.
// Output matches the procedural residence path (render/build/residence-interiors.js,
// layout/nav.js): residence = { kind, type, area, entryDoor, rooms[], partitions[], beds[],
// bathrooms[], kitchen, living, balcony, facadeWalls[], exteriorSides[], obstacles[] }.
// Unit-local frame: x ∈ [0,w] along the entry front, z ∈ [0,d] from the entry front
// (z = 0, corridor/core side) to the rear facade (z = d). Sides: N front, S rear, W x0, E x1.
// Deterministic: a spec (dims, exposure, type, variant) always yields the same plan.
// The layout imports only the frozen data (community-plan-data.js); this module is used by
// scripts/prepare-community-plans.mjs and the tests.

const EPS = 1e-6;
// Internal duplex U-stair: two 1.1 m flights of 10 risers (0.165) and 10 goings (0.26 m)
// with a 1.2 m half landing at the front; block 2.5 (x) × 4.0 (z). Bottom and top are both
// at the block's rear edge (z = 4.0), so the lower level enters from, and the upper level
// arrives into, the public column behind it.
export const DUPLEX_STAIR = { blockW: 2.5, blockD: 4.0, flight: 1.1, gap: 0.1, steps: 10, riser: 0.165, going: 0.26, landing: 1.2, rise: 3.3 };
export const FAIL = {};
const fail = (k) => { FAIL[k] = (FAIL[k] || 0) + 1; return null; };
const r2 = v => Math.round(v * 100) / 100;
export const R = (x0, z0, x1, z1) => ({ x0: r2(Math.min(x0, x1)), z0: r2(Math.min(z0, z1)), x1: r2(Math.max(x0, x1)), z1: r2(Math.max(z0, z1)) });
const W = r => r.x1 - r.x0, D = r => r.z1 - r.z0, A = r => W(r) * D(r);

// Minimum short side / area by kind (GB 50096-2011 §5.2–5.4: 双人卧室 ≥ 9 m², 单人卧室 ≥ 5 m²,
// 起居室 ≥ 10 m², 厨房 ≥ 4 m², 卫生间 ≥ 2.5 m²). Generator targets are larger.
export const MIN = {
  bedroom: { side: 2.8, area: 8.4 }, master: { side: 3.3, area: 12 }, study: { side: 2.4, area: 6 },
  living: { side: 3.6, area: 13 }, family: { side: 3.0, area: 9 }, dining: { side: 2.4, area: 5 },
  kitchen: { side: 1.9, area: 5 }, bathroom: { side: 1.6, area: 3.6 }, powder: { side: 1.2, area: 2.0 },
  closet: { side: 1.4, area: 2.5 }, laundry: { side: 1.2, area: 2 }, storage: { side: .9, area: 1 },
  entry: { side: 1.5, area: 2.5 }, balcony: { side: 1.2, area: 3 }, hall: { side: 1.05, area: 1 },
  stair: { side: 2.3, area: 9 }, void: { side: 2.5, area: 8 },
};
export const NEEDS_WINDOW = new Set(['bedroom', 'living', 'study', 'family']);
const CIRC = new Set(['hall', 'entry', 'dining', 'family', 'living']);
// Open-plan neighbours: no partition on their shared edge.
const OPEN = new Set(['entry|dining', 'dining|living', 'dining|hall', 'entry|hall', 'family|hall', 'family|stair', 'dining|stair',
  'entry|stair', 'family|void', 'family|family', 'hall|hall', 'dining|dining', 'entry|entry', 'dining|family', 'entry|family'].map(k => k.split('|').sort().join('|')));
const isOpen = (a, b) => OPEN.has([a, b].sort().join('|'));

/* ------------------------------------------------------------------ program */
export function program(type, { lux = false, level = 'flat', variant = 0 } = {}) {
  const n = { '2BR': 2, '3BR': 3, '4BR': 4, '5BR': 5 }[type];
  const rooms = [];
  const bed = (id, name, master = false) => rooms.push({ id, kind: 'bedroom', master, name });
  const add = (id, kind, name, extra = {}) => rooms.push({ id, kind, name, ...extra });
  if (level === 'lower') {   // duplex entry level: public life + one guest suite
    bed('bed_guest', variant % 2 ? '长辈房' : '客房');
    add('bath_guest', 'bathroom', '客卫', variant % 2 ? { ensuiteOf: 'bed_guest' } : {});
    add('kitchen', 'kitchen', '中西厨', { closed: true });
    add('study', 'study', '书房');
    if (variant % 3 !== 1) add('tea', 'study', variant % 2 ? '茶室' : '影音室');
    add('laundry', 'laundry', '家务间');
    add('powder', 'powder', '访客卫');
    return { rooms, bedrooms: 1 };
  }
  if (level === 'upper') {   // duplex private level
    bed('bed_master', '主卧套房', true);
    add('bath_master', 'bathroom', '主卫', { ensuiteOf: 'bed_master' });
    add('closet', 'closet', '衣帽间', { ensuiteOf: 'bed_master' });
    const names = ['', '', '次卧套房', '儿童房', '第三卧室', '第四卧室'];
    for (let i = 2; i <= n - 1; i++) bed(`bed_${i}`, names[i]);
    add('bath_2', 'bathroom', '次卫');
    if (n - 1 >= 4) add('bath_common', 'bathroom', '公卫');
    if (n - 1 <= 3 && variant % 2 === 0) add('study', 'study', '家庭书房');
    return { rooms, bedrooms: n - 1 };
  }
  bed('bed_master', lux ? '主卧套房' : '主卧', true);
  if (!(n === 2 && !lux)) add('bath_master', 'bathroom', '主卫', { ensuiteOf: 'bed_master' });
  if (lux) add('closet', 'closet', '衣帽间', { ensuiteOf: 'bed_master' });
  const names = ['', '', '次卧', '儿童房', '老人房', '客卧'];
  for (let i = 2; i <= n; i++) {
    bed(`bed_${i}`, names[i]);
  }
  add('bath_common', 'bathroom', '公卫');
  if (lux && n >= 4) add('bath_2', 'bathroom', '次卫');
  add('kitchen', 'kitchen', lux ? '中西厨' : '厨房', lux ? { closed: true } : {});
  if (lux) { if (n <= 3 || variant % 2) add('study', 'study', '书房'); add('laundry', 'laundry', '家务间'); }
  return { rooms, bedrooms: n };
}

/* -------------------------------------------------------------- generator */
/**
 * spec: { id, type, w, d, exposed:{left,right}, lux, level:'flat'|'lower'|'upper', variant,
 *         entryAt?, view?:'left'|'right', pc?:{p0,pcw}, fz?, stairBlock?, voidRect?, balcony? }
 * Returns { residence, meta } or null.
 */
export function generateHome(spec) {
  for (const out of homeCandidates(spec)) return out;
  return null;
}

/** Duplex = lower + upper level sharing the public column and the stair block.
 * Lower candidates are tried in rank order until an upper level validates. */
export function generateDuplex(spec, { tries = 60, exclude = [] } = {}) {
  let n = 0;
  for (const lower of homeCandidates({ ...spec, level: 'lower', duplex: true, exclude, noFront: !!spec.voidAbove })) {
    if (++n > tries) break;
    const m = lower.meta, lr = lower.residence;
    const living = lr.rooms.find(r => r.kind === 'living').rect;
    const widened = living.x0 < m.p0 - EPS || living.x1 > m.p0 + m.pcw + EPS;
    if (spec.voidAbove && widened) continue;        // a 挑空 living must stay inside the public column
    // The double-height zone is the window half of the living room (≤ 5 m deep).
    const voidRect = spec.voidAbove ? R(m.p0, Math.max(living.z0, spec.d - 5.0), m.p0 + m.pcw, spec.d) : null;
    const upper = generateHome({ ...spec, id: `${spec.id}-U`, level: 'upper', pc: { p0: m.p0, pcw: m.pcw }, stairBlock: lr.homeStair.block, voidRect, exclude });
    if (upper) return { lower, upper, voidRect, key: `${m.key}|${upper.meta.key}` };
  }
  return null;
}

export function* homeCandidates(spec) {
  const prog = program(spec.type, spec);
  const cands = [];
  const lux = !!spec.lux;
  const pcWidths = spec.pc ? [spec.pc.pcw] : lux ? [4.4, 5.0, 5.6, 6.2] : [3.9, 4.2, 4.5, 4.8];
  const foyers = spec.fz != null ? [spec.fz] : lux ? [2.5, 2.8] : [1.8, 2.1];
  for (const pcw of pcWidths) {
    let starts = spec.pc ? [spec.pc.p0] : [0, spec.w - pcw, ...[1, 2, 3].map(k => r2((spec.w - pcw) * k / 4))];
    if (!spec.pc && spec.entryAt != null) for (let p = spec.entryAt - pcw + 0.8; p <= spec.entryAt - 0.8 + EPS; p += 0.4) starts.push(r2(p));
    starts = [...new Set(starts.map(r2))].filter(p => p >= -EPS && p + pcw <= spec.w + EPS);
    for (const p0 of starts) for (const fz of foyers) {
      const wl = p0, wr = spec.w - p0 - pcw;
      if ((wl > EPS && wl < 2.8) || (wr > EPS && wr < 2.8)) continue;
      const entryAtPre = spec.level === 'upper' ? null : pickEntry(spec, p0, pcw);
      if (spec.level !== 'upper' && entryAtPre == null) continue;
      let sb = spec.stairBlock;
      if (spec.duplex && !sb) {
        // U-stair block (2.5 × 4.0) in the public column's front band, on the side away from the entry.
        const e = spec.entryAt, leftSide = e != null && e > p0 + pcw / 2;
        sb = leftSide ? R(p0, 0, p0 + DUPLEX_STAIR.blockW, DUPLEX_STAIR.blockD) : R(p0 + pcw - DUPLEX_STAIR.blockW, 0, p0 + pcw, DUPLEX_STAIR.blockD);
        if (pcw < DUPLEX_STAIR.blockW + 2.0) continue;
      }
      if (sb && !(sb.x0 >= p0 - EPS && sb.x1 <= p0 + pcw + EPS)) continue;
      const spec2 = sb === spec.stairBlock ? spec : { ...spec, stairBlock: sb };
      const n = prog.rooms.length;
      if (spec2.level !== 'upper' && pickEntry(spec2, p0, pcw) == null) continue;
      for (let mask = 0; mask < 1 << n; mask++) {
        for (const ml of wingModes(wl, spec, 'left')) for (const mr of wingModes(wr, spec, 'right')) {
          const plan = attempt(spec2, prog, { p0, pcw, fz, mask, entryAt: spec.level === 'upper' ? null : pickEntry(spec2, p0, pcw), ml, mr });
          if (plan) cands.push(plan);
        }
      }
    }
  }
  if (!cands.length) return;
  // Deduplicate by geometry, rank by score, then let the variant pick.
  const uniq = [...new Map(cands.map(c => [c.key, c])).values()];
  uniq.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  // The variant picks a start among the best candidates; the first one whose finished
  // plan passes validateHome (beds placeable, doors valid, ...) is returned.
  const exclude = new Set(spec.exclude || []);
  const top = uniq.slice(0, Math.min(uniq.length, 16));
  const order = [...top.keys()].map(i => (i + (spec.variant || 0)) % top.length);
  for (const i of [...order, ...uniq.slice(16).map((_, k) => k + 16)]) {
    const c = uniq[i];
    if (exclude.has(c.key)) continue;
    const out = finish(spec, c, uniq.length);
    if (!validateHome(out.residence, spec).length) { out.meta.key = c.key; out.meta.rank = i; yield out; }
  }
}
const wingModes = (ww, spec, side) => {
  if (ww < EPS) return ['none'];
  const m = ww >= 8.0 ? ['spine', 'band', 'hall', 'direct'] : ww >= 6.0 ? ['band', 'hall', 'direct'] : ww >= 4.4 ? ['hall', 'direct'] : ['direct'];
  // 'front': a short wing in front of a living room that widens across it (横厅).
  if (spec.exposed?.[side] && spec.level !== 'upper' && !spec.noFront && ww <= 5.2) m.push('front');
  return m;
};

function pickEntry(spec, p0, pcw) {
  const sb = spec.stairBlock;
  let lo = p0 + 0.8, hi = p0 + pcw - 0.8;
  if (sb) { if (sb.x0 <= p0 + EPS) lo = Math.max(lo, sb.x1 + 0.8); else hi = Math.min(hi, sb.x0 - 0.8); }
  if (spec.entryAt != null) return spec.entryAt >= lo - EPS && spec.entryAt <= hi + EPS ? spec.entryAt : null;
  return hi < lo ? null : r2((lo + hi) / 2);
}

export function attempt(spec, prog, { p0, pcw, fz, mask, entryAt, ml, mr }) {
  const { w, d } = spec, lux = !!spec.lux;
  const wl = p0, wr = w - p0 - pcw;
  const Lr = [], Rr = [];
  prog.rooms.forEach((room, i) => ((mask >> i) & 1 ? Rr : Lr).push(room));
  if ((ml === 'none' && Lr.length) || (mr === 'none' && Rr.length)) return null;
  if ((ml !== 'none' && !Lr.length) || (mr !== 'none' && !Rr.length)) return null;
  for (const room of prog.rooms) if (room.ensuiteOf && Lr.includes(room) !== Lr.includes(prog.rooms.find(r => r.id === room.ensuiteOf))) return null;
  const bal = spec.balcony === false || spec.level === 'upper' ? 0 : lux ? 1.8 : 1.5;
  const rooms = [];
  // Public column.
  const pc = { x0: p0, x1: p0 + pcw };
  if (spec.level === 'upper') {
    const v = spec.voidRect;
    rooms.push({ id: 'family', kind: 'family', name: '家庭起居厅', rect: R(pc.x0, 0, pc.x1, v ? v.z0 : d) });
    if (v) rooms.push({ id: 'void', kind: 'void', name: '客厅挑空', rect: R(pc.x0, v.z0, pc.x1, d) });
  } else {
    const livD = Math.min(lux ? 6.0 : 4.8, d - fz - (lux ? 2.4 : 1.6) - bal);
    if (livD < (lux ? 4.8 : 3.6) - EPS) return fail('livD');
    const zl = r2(d - bal - livD);
    rooms.push({ id: 'foyer', kind: 'entry', name: lux ? '入户门厅' : '玄关', rect: R(pc.x0, 0, pc.x1, fz) });
    rooms.push({ id: 'dining', kind: 'dining', name: '餐厅', rect: R(pc.x0, fz, pc.x1, zl) });
    const lx0 = ml === 'front' ? 0 : pc.x0, lx1 = mr === 'front' ? w : pc.x1;
    rooms.push({ id: 'living', kind: 'living', name: lux ? '江景客厅' : '客厅', rect: R(lx0, zl, lx1, d - bal) });
    if (bal) rooms.push({ id: 'balcony', kind: 'balcony', name: lux ? '观江阳台' : '阳台', rect: R(lx0, d - bal, lx1, d) });
    pc.zl = zl;
  }
  if ((ml === 'front' || mr === 'front') && pc.zl == null) return null;
  if (spec.stairBlock) carve(rooms, spec.stairBlock);
  const left = packWing(Lr, { x0: 0, x1: wl, d: ml === 'front' ? pc.zl : d, outer: !!spec.exposed?.left, side: 'left', mode: ml === 'front' ? 'direct' : ml, lux });
  if (!left) return fail('pack:'+ml);
  const right = packWing(Rr, { x0: p0 + pcw, x1: w, d: mr === 'front' ? pc.zl : d, outer: !!spec.exposed?.right, side: 'right', mode: mr === 'front' ? 'direct' : mr, lux });
  if (!right) return fail('pack:'+mr);
  rooms.push(...left, ...right);
  return evaluate(spec, rooms, { p0, pcw, fz, entryAt, ml, mr, bal });
}

/** Carve the fixed duplex stair block out of the public-column room(s) it lies in. */
function carve(rooms, s) {
  for (const host of rooms.filter(r => overlap(r.rect, s))) {
    const h = host.rect, pieces = [];
    if (s.x0 > h.x0 + EPS) pieces.push(R(h.x0, h.z0, s.x0, h.z1));
    if (s.x1 < h.x1 - EPS) pieces.push(R(s.x1, h.z0, h.x1, h.z1));
    const cx0 = Math.max(h.x0, s.x0), cx1 = Math.min(h.x1, s.x1);
    if (s.z0 > h.z0 + EPS) pieces.push(R(cx0, h.z0, cx1, s.z0));
    if (s.z1 < h.z1 - EPS) pieces.push(R(cx0, s.z1, cx1, h.z1));
    rooms.splice(rooms.indexOf(host), 1);
    pieces.filter(p => W(p) > 0.05 && D(p) > 0.05).sort((a, b) => A(b) - A(a))
      .forEach((p, i) => rooms.push({ ...host, id: i ? `${host.id}_${i}` : host.id, rect: p }));
  }
  rooms.push({ id: 'stair', kind: 'stair', name: '套内楼梯', rect: R(s.x0, s.z0, s.x1, s.z1) });
}

/* ------------------------------------------------------------ wing packing */
const rank = r => r.kind === 'bedroom' ? (r.master ? 0 : 1) : r.kind === 'study' ? 2 : r.kind === 'closet' ? 3
  : r.kind === 'bathroom' ? 4 : r.kind === 'laundry' ? 6 : r.kind === 'powder' ? 7 : r.kind === 'kitchen' ? 8 : 9;
function withEnsuites(list) {
  const sorted = [...list].sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1));
  const out = [];
  for (const r of sorted) {
    if (r.ensuiteOf && sorted.some(h => h.id === r.ensuiteOf)) continue;
    out.push(r, ...sorted.filter(e => e.ensuiteOf === r.id));
  }
  return out;
}
const pref = (r, lux) => r.kind === 'bedroom' ? (r.master ? (lux ? 4.8 : 3.9) : (lux ? 4.0 : 3.3)) : r.kind === 'study' ? (lux ? 3.4 : 3.0)
  : r.kind === 'kitchen' ? (lux ? 3.8 : 2.8) : r.kind === 'bathroom' ? (lux ? 2.8 : 2.3) : r.kind === 'closet' ? 2.2
  : r.kind === 'laundry' ? 1.8 : r.kind === 'powder' ? 1.6 : 1.5;
const minLen = (r, other) => {
  const m = MIN[r.master ? 'master' : r.kind] || MIN.storage;
  return r2(Math.max(r.kind === 'bathroom' ? 2.0 : m.side, m.area / Math.max(other, 0.1)));
};
/** Split `total` into lengths for `list` (≥ min, near pref); spare goes to bedrooms. */
function split(list, total, across, lux) {
  if (!list.length) return [];
  const mins = list.map(r => { const m = MIN[r.master ? 'master' : r.kind] || MIN.storage; if (across < m.side - EPS) return null; return minLen(r, across); });
  if (mins.some(v => v == null)) return null;
  const prefs = list.map((r, i) => Math.max(pref(r, lux), mins[i]));
  const sMin = mins.reduce((a, b) => a + b, 0), sPref = prefs.reduce((a, b) => a + b, 0);
  if (sMin > total + EPS) return null;
  let out;
  if (sPref <= total) {
    out = [...prefs];
    let spare = total - sPref;
    for (const [i, r] of list.entries()) if (r.kind === 'bedroom' || r.kind === 'study') { const add = Math.min(spare, r.master ? 1.6 : 1.0); out[i] += add; spare -= add; }
    if (spare > EPS) { const i = list.findIndex(r => r.kind === 'kitchen'); out[i >= 0 ? i : list.length - 1] += spare; }
  } else {
    const k = (total - sMin) / (sPref - sMin);
    out = mins.map((m, i) => m + (prefs[i] - m) * k);
  }
  out = out.map(r2);
  out[out.length - 1] = r2(out[out.length - 1] + total - out.reduce((a, b) => a + b, 0));
  if (out.some((v, i) => v < mins[i] - 0.011)) return null;
  // A bedroom more than 1:1.9 is rejected (corridor-like rooms).
  if (list.some((r, i) => ['bedroom', 'study'].includes(r.kind) && Math.max(out[i], across) / Math.min(out[i], across) > 1.9)) return null;
  return out;
}

function packWing(list, opts) {
  const out = packWingRaw(list, opts);
  if (!out) return out;
  const extra = [];
  for (const r of out) {
    const big = r.kind === 'bedroom' || r.kind === 'study';
    if (!['bathroom', 'laundry', 'closet', 'powder', 'kitchen'].includes(r.kind) && !big) continue;
    const cap = r.kind === 'bedroom' ? (r.master ? (opts.lux ? 30 : 20) : (opts.lux ? 20 : 15)) : r.kind === 'study' ? (opts.lux ? 16 : 10)
      : r.kind === 'kitchen' ? (opts.lux ? 16 : 9) : r.kind === 'bathroom' ? (opts.lux ? 9 : 6.5) : r.kind === 'closet' ? 7 : 5.5;
    const q = r.rect, alongZ = D(q) >= W(q), len = alongZ ? D(q) : W(q), across = alongZ ? W(q) : D(q);
    if (big && (!alongZ || A(q) <= cap)) continue;
    const keep = Math.max(cap / across, r.kind === 'bathroom' ? 2.0 : 1.2);
    if (len - keep < 1.2) continue;
    // Keep the end nearest the rear facade / host; the remainder toward the front is storage.
    const cut = r2(keep);
    const kind = r.kind === 'bedroom' ? 'closet' : 'storage', name = r.kind === 'bedroom' ? '衣帽间' : r.kind === 'study' ? '书房储藏' : '储藏间';
    if (alongZ) { extra.push({ id: `${kind}_${r.id}`, kind, name, ensuiteOf: r.id, rect: R(q.x0, q.z0, q.x1, q.z1 - cut) }); r.rect = R(q.x0, q.z1 - cut, q.x1, q.z1); }
    else { const left = opts.side === 'left'; extra.push({ id: `storage_${r.id}`, kind: 'storage', name: '储藏间', ensuiteOf: r.id, rect: left ? R(q.x0, q.z0, q.x1 - cut, q.z1) : R(q.x0 + cut, q.z0, q.x1, q.z1) }); r.rect = left ? R(q.x1 - cut, q.z0, q.x1, q.z1) : R(q.x0, q.z0, q.x0 + cut, q.z1); }
  }
  return [...out, ...extra];
}
function packWingRaw(list, { x0, x1, d, outer, side, mode, lux }) {
  if (mode === 'none') return [];
  const ww = x1 - x0, order = withEnsuites(list);
  const at = (r, rect) => ({ ...r, rect });
  // x-interval helper: the i-th piece counted from the public column outward.
  const xs = (i, widths) => {
    const a = widths.slice(0, i).reduce((p, q) => p + q, 0), b = a + widths[i];
    return side === 'left' ? [x1 - b, x1 - a] : [x0 + a, x0 + b];
  };
  if (mode === 'direct') {
    // One column of full-width rooms stacked rear → front; each opens on the public column.
    let list = order;
    const need = list.reduce((a, r) => a + Math.max(pref(r, lux) + (r.kind === 'bedroom' ? (r.master ? 1.6 : 1.0) : 0), minLen(r, ww)), 0);
    if (d - need >= 1.4 && !list.some(r => r.kind === 'kitchen')) list = [...list, { id: `storage_${side}`, kind: 'storage', name: '储藏间' }];
    const dz = split(list, d, ww, lux); if (!dz) return null;
    let z = d; return list.map((r, i) => { const q = at(r, R(x0, z - dz[i], x1, z)); z -= dz[i]; return q; });
  }
  if (mode === 'hall') {
    // Rooms column + 1.2 m private hall beside the public column; the rear room spans both.
    const hw = 1.2, cx0 = side === 'left' ? x0 : x0 + hw, cx1 = side === 'left' ? x1 - hw : x1;
    const rear = order[0], rest = order.slice(1);
    if (!rest.length) return null;
    const rd = Math.max(pref(rear, lux), minLen(rear, ww));
    if (d - rd < 2.4) return null;
    const dz = split(rest, d - rd, cx1 - cx0, lux); if (!dz) return null;
    const out = [at(rear, R(x0, d - rd, x1, d))];
    let z = d - rd;
    rest.forEach((r, i) => { out.push(at(r, R(cx0, z - dz[i], cx1, z))); z -= dz[i]; });
    out.push({ id: `hall_${side}`, kind: 'hall', name: '卧室走廊', rect: R(side === 'left' ? x1 - hw : x0, 0, side === 'left' ? x1 : x0 + hw, d - rd) });
    return out;
  }
  if (mode === 'band') {
    // Rear row (rear-facade windows) | 1.3 m hall along x | front row. An exposed outer
    // side lets the outer-most front room be a bedroom or a windowed kitchen.
    const hw = 1.3;
    const windowed = r => ['bedroom', 'study'].includes(r.kind);
    let rearList = order.filter(r => windowed(r) || (r.ensuiteOf && windowed(order.find(h => h.id === r.ensuiteOf) || {})));
    let frontList = order.filter(r => !rearList.includes(r));
    const tries = [[rearList, frontList, null]];
    if (outer) {
      // Move the last secondary bedroom/study (no en-suite) to the front-row outer end.
      const mov = [...rearList].reverse().find(r => windowed(r) && !r.master && !order.some(e => e.ensuiteOf === r.id));
      if (mov) tries.push([rearList.filter(r => r !== mov), [...frontList, mov], mov]);
    }
    for (const [rl, fl0, mov] of tries) {
      if (!rl.length || !fl0.length) continue;
      const rd = Math.max(lux ? 4.6 : 3.9, ...rl.filter(r => r.kind === 'bedroom').map(r => r.master ? (lux ? 5.0 : 4.2) : (lux ? 4.2 : 3.6)));
      const fd = d - rd - hw;
      if (fd < 2.2 - EPS) continue;
      const wx = split(rl, ww, rd, lux); if (!wx) continue;
      // Front row from the public column outward: open/plain services first; the outer
      // end takes the moved bedroom, else the kitchen when the outer side has windows.
      let fl = fl0.filter(r => r !== mov);
      const k = fl.find(r => r.kind === 'kitchen');
      if (k) fl = outer && !mov ? [...fl.filter(r => r !== k), k] : [k, ...fl.filter(r => r !== k)];
      if (mov) fl = [...fl, mov];
      const fx = split(fl, ww, fd, lux); if (!fx) continue;
      const out = [];
      rl.forEach((r, i) => { const [a, b] = xs(i, wx); out.push(at(r, R(a, d - rd, b, d))); });
      fl.forEach((r, i) => { const [a, b] = xs(i, fx); out.push(at(r, R(a, 0, b, fd))); });
      out.push({ id: `hall_${side}`, kind: 'hall', name: '走廊', rect: R(x0, fd, x1, fd + hw) });
      return out;
    }
    return null;
  }
  if (mode === 'spine') {
    // Deep luxury wing: [inner service column][1.3 m spine hall][outer windowed column];
    // the rear room spans spine + outer column, its en-suite rooms sit in the inner column
    // beside it; a 1.3 m cross hall at the front links the spine to the public column.
    if (!outer || ww < 8.0) return null;
    const hw = 1.3, rear = order[0];
    if (!rear || rear.kind !== 'bedroom') return null;
    const ens = order.filter(r => r.ensuiteOf === rear.id);
    const windowed = order.filter(r => r !== rear && !ens.includes(r) && (['bedroom', 'study'].includes(r.kind) || r.kind === 'kitchen'));
    const services = order.filter(r => r !== rear && !ens.includes(r) && !windowed.includes(r));
    for (const ci of [2.6, 3.0, 3.4, 3.8]) {
      const co = ww - ci - hw;
      if (co < 3.3 - EPS) continue;
      const [ix0, ix1] = xs(0, [ci, hw, co]), [sx0, sx1] = xs(1, [ci, hw, co]), [ox0, ox1] = xs(2, [ci, hw, co]);
      const rd = Math.max(lux ? 5.2 : 4.2, minLen(rear, hw + co));
      // Outer column: windowed rooms stacked from the rear room toward the entry.
      const dz = split(windowed, d - rd, co, lux); if (!dz) continue;
      // Inner column: en-suites at the rear (beside the rear room), then services, then the cross hall.
      const innerList = [...ens, ...services];
      const iz = split(innerList, d - hw, ci, lux); if (!iz) continue;
      const ensDepth = iz.slice(0, ens.length).reduce((a, b) => a + b, 0);
      if (ens.length && ensDepth > rd + (d - rd) * 0.5) continue;
      const out = [at(rear, R(Math.min(sx0, ox0), d - rd, Math.max(sx1, ox1), d))];
      let z = d - rd;
      windowed.forEach((r, i) => { out.push(at(r, R(ox0, z - dz[i], ox1, z))); z -= dz[i]; });
      z = d;
      innerList.forEach((r, i) => { out.push(at(r, R(ix0, z - iz[i], ix1, z))); z -= iz[i]; });
      out.push({ id: `hall_${side}`, kind: 'hall', name: '卧室走廊', rect: R(sx0, hw, sx1, d - rd) });
      out.push({ id: `gallery_${side}`, kind: 'hall', name: '入户廊', rect: R(Math.min(ix0, sx0), 0, Math.max(ix1, sx1), hw) });
      // The en-suite pieces must actually touch the rear room.
      if (ens.some(e => { const q = out.find(o => o.id === e.id); return !sharedEdge(q.rect, out[0].rect); })) continue;
      return out;
    }
    return null;
  }
  return null;
}

/* --------------------------------------------------------------- evaluate */
const overlap = (a, b) => a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.z0 < b.z1 - 0.01 && b.z0 < a.z1 - 0.01;
export function sharedEdge(a, b) {
  for (const [p, q] of [[a, b], [b, a]]) if (Math.abs(p.x1 - q.x0) < EPS) {
    const z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
    if (z1 - z0 > 0.05) return { a: [p.x1, z0], b: [p.x1, z1], axis: 'z' };
  }
  for (const [p, q] of [[a, b], [b, a]]) if (Math.abs(p.z1 - q.z0) < EPS) {
    const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
    if (x1 - x0 > 0.05) return { a: [x0, p.z1], b: [x1, p.z1], axis: 'x' };
  }
  return null;
}
const segLen = s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
function exteriorOf(r, spec) {
  const out = [];
  if (Math.abs(r.z1 - spec.d) < EPS && W(r) >= 1.0) out.push('S');
  if (spec.exposed?.left && Math.abs(r.x0) < EPS && D(r) >= 1.0) out.push('W');
  if (spec.exposed?.right && Math.abs(r.x1 - spec.w) < EPS && D(r) >= 1.0) out.push('E');
  return out;
}

function evaluate(spec, rooms, ctx) {
  const { w, d } = spec;
  const area = rooms.reduce((s, r) => s + A(r.rect), 0);
  if (Math.abs(area - w * d) > 0.05) return fail('area');
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) if (overlap(rooms[i].rect, rooms[j].rect)) return fail('overlap');
  for (const r of rooms) r.exterior = exteriorOf(r.rect, spec);
  const balc = rooms.find(r => r.kind === 'balcony');
  // Rooms opening onto the balcony are lit through its sliding glass wall.
  if (balc) for (const r of rooms) if (r !== balc && !r.exterior.length && sharedEdge(r.rect, balc.rect) && Math.abs(r.rect.z1 - balc.rect.z0) < EPS) r.viaBalcony = true;
  const vd = rooms.find(r => r.kind === 'void');
  if (vd) for (const r of rooms) if (r.kind === 'family' && sharedEdge(r.rect, vd.rect)) r.viaVoid = true;
  for (const r of rooms) if (NEEDS_WINDOW.has(r.kind) && !r.exterior.length && !r.viaBalcony && !r.viaVoid) return fail('window:'+r.kind);
  const by = Object.fromEntries(rooms.map(r => [r.id, r]));
  const doors = [];
  // Open-plan edges.
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    if (!isOpen(a.kind, b.kind)) continue;
    const seg = sharedEdge(a.rect, b.rect);
    // A wing hall meets the public column through a 1.0 m doorless opening, not a missing wall.
    if (seg && (a.kind === 'hall') === (b.kind === 'hall')) doors.push({ rooms: [a.id, b.id], open: true, seg });
  }
  if (by.balcony) {
    const seg = sharedEdge(by.balcony.rect, by.living.rect); if (!seg) return null;
    doors.push({ rooms: ['living', 'balcony'], seg, width: r2(Math.min(segLen(seg) - 0.6, 3.0)), sliding: true });
  }
  const hallLinked = new Set();
  for (const r of rooms.filter(r => r.kind === 'hall')) {
    if (hallLinked.has(r.id)) continue;
    const pri = { entry: 0, dining: 1, family: 1, living: 2, hall: 0 };
    const opts = rooms.filter(q => q !== r && ['entry', 'dining', 'family', 'living'].includes(q.kind)).map(q => ({ q, seg: sharedEdge(r.rect, q.rect) }))
      .filter(o => o.seg && segLen(o.seg) >= 1.3 - 1e-6).sort((a, b) => pri[a.q.kind] - pri[b.q.kind]);
    if (!opts.length) {
      // A hall touching another hall shares its opening.
      if (rooms.some(q => q !== r && q.kind === 'hall' && sharedEdge(r.rect, q.rect))) continue;
      return fail('hallopen');
    }
    doors.push({ rooms: [r.id, opts[0].q.id], seg: opts[0].seg, width: 1.0, opening: true });
    for (const q of rooms) if (q.kind === 'hall' && q !== r && sharedEdge(r.rect, q.rect)) hallLinked.add(q.id);
  }
  for (const r of rooms) {
    if (['entry', 'dining', 'living', 'family', 'balcony', 'stair', 'void', 'hall'].includes(r.kind)) continue;
    if (r.kind === 'kitchen' && !r.exterior.length) {
      // Windowless kitchens are open kitchens: one full open edge to the dining/foyer.
      if (spec.lux) return fail('luxkitchen');
      const q = rooms.find(q => ['dining', 'entry'].includes(q.kind) && sharedEdge(r.rect, q.rect) && segLen(sharedEdge(r.rect, q.rect)) >= 1.6 - 1e-6);
      if (!q) return fail('openkitchen');
      r.open = true; doors.push({ rooms: [r.id, q.id], open: true, seg: sharedEdge(r.rect, q.rect) }); continue;
    }
    const host = r.ensuiteOf && r.kind !== 'storage' ? by[r.ensuiteOf] : null;
    let targets = host ? [host, ...rooms.filter(q => q !== r && q.ensuiteOf === r.ensuiteOf && q.kind !== 'storage')] : rooms.filter(q => q !== r && CIRC.has(q.kind) && !(q.kind === 'living' && ['bathroom', 'powder', 'laundry', 'storage'].includes(r.kind)));
    if (r.kind === 'storage' && by[r.ensuiteOf]) targets = [...targets, by[r.ensuiteOf]];
    const width = ['bathroom', 'powder', 'closet', 'laundry', 'storage'].includes(r.kind) ? 0.8 : 0.9;
    const opts = targets.map(q => ({ q, seg: sharedEdge(r.rect, q.rect) })).filter(o => o.seg && segLen(o.seg) >= width + 0.35 - 1e-6)
      .map(o => ({ ...o, p: host ? (o.q === host ? 0 : 1) : o.q.kind === 'hall' ? 0 : o.q.kind === 'entry' ? 1 : o.q.kind === 'dining' || o.q.kind === 'family' ? 2 : 3 }))
      .sort((a, b) => a.p - b.p || segLen(b.seg) - segLen(a.seg));
    if (!opts.length) return fail('door:'+r.kind);
    doors.push({ rooms: [r.id, opts[0].q.id], seg: opts[0].seg, width });
  }
  const start = spec.level === 'upper' ? 'stair' : 'foyer';
  if (!by[start]) return null;
  const seen = new Set([start]), q = [start];
  while (q.length) { const id = q.pop(); for (const dd of doors) if (dd.rooms.includes(id)) for (const o of dd.rooms) if (!seen.has(o)) { seen.add(o); q.push(o); } }
  if (rooms.some(r => !seen.has(r.id))) { if (spec.debug) console.log('UNREACH', rooms.filter(r=>!seen.has(r.id)).map(r=>r.id), doors.map(d=>d.rooms.join('-')+(d.open?'(o)':''))); return fail('reach'); }
  // Entry door must open into the foyer itself (not a carved stair).
  if (ctx.entryAt != null) {
    const foy = rooms.filter(r => r.kind === 'entry' && r.rect.z0 < EPS);
    if (!foy.some(f => ctx.entryAt - 0.55 >= f.rect.x0 + 0.2 - EPS && ctx.entryAt + 0.55 <= f.rect.x1 - 0.2 + EPS)) return fail('entryfoyer');
  }
  let score = 0;
  for (const r of rooms) {
    const ar = Math.max(W(r.rect), D(r.rect)) / Math.min(W(r.rect), D(r.rect));
    if (['bedroom', 'living', 'study', 'family', 'dining'].includes(r.kind)) score -= Math.max(0, ar - 1.5) * 2;
    if (r.kind === 'kitchen' && r.exterior.length) score += 2;
    if (r.kind === 'bathroom' && r.exterior.length) score += 0.3;
    if (r.kind === 'bedroom' && r.master && r.exterior.length > 1) score += 1.5;
    if (r.kind === 'living') score += r.exterior.length * 1.5 + (spec.view && r.exterior.includes(spec.view === 'left' ? 'W' : 'E') ? 4 : 0);
  }
  if (ctx.ml === 'hall' || ctx.mr === 'hall' || ctx.ml === 'band' || ctx.mr === 'band') score += 0.5;
  const kit = rooms.find(r => r.kind === 'kitchen');
  if (kit) score -= Math.max(0, (spec.lux ? 9 : 5.5) - A(kit.rect)) * 0.8 + Math.max(0, Math.max(W(kit.rect), D(kit.rect)) / Math.min(W(kit.rect), D(kit.rect)) - 2.2);
  const beds = rooms.filter(r => r.kind === 'bedroom');
  const master = beds.find(r => r.master);
  if (master) score += Math.min(A(master.rect), spec.lux ? 30 : 18) * 0.08 - beds.filter(b => b !== master && A(b.rect) > A(master.rect)).length * 2;
  for (const r of rooms) if (['storage', 'laundry'].includes(r.kind)) score -= Math.max(0, A(r.rect) - 6) * 0.3;
  const liv = rooms.find(r => r.kind === 'living');
  if (liv) score += Math.min(A(liv.rect), spec.lux ? 55 : 24) * 0.05;
  const key = rooms.map(r => `${r.kind}:${r.rect.x0},${r.rect.z0},${r.rect.x1},${r.rect.z1}`).sort().join(';');
  return { rooms, doors, score, key, ctx };
}

/* ----------------------------------------------------------------- finish */
function finish(spec, plan, candidates) {
  const { rooms, doors, ctx } = plan;
  const { w, d } = spec;
  const partitions = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j], seg = sharedEdge(a.rect, b.rect);
    if (!seg) continue;
    const dd = doors.find(x => x.rooms.includes(a.id) && x.rooms.includes(b.id));
    if (dd?.open) continue;
    const p = { id: `${a.id}/${b.id}`, a: seg.a.map(r2), b: seg.b.map(r2), role: 'partition' };
    if (a.kind === 'stair' || b.kind === 'stair') p.role = 'stair-wall';
    if (dd) {
      p.door = { at: r2(doorAt(seg, dd.width, a, b)), width: dd.width };
      if (dd.sliding) p.role = 'balcony-slider';
      if (dd.opening) p.role = 'opening';
    }
    partitions.push(p);
  }
  const beds = [], obstacles = [];
  for (const r of rooms.filter(r => r.kind === 'bedroom')) {
    const b = placeBed(r, partitions, spec);
    if (b) { beds.push(b); obstacles.push({ id: `${r.id}-bed`, rect: R(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2) }); }
  }
  const doorOf = r => { const p = partitions.find(p => p.door && p.id.split('/').includes(r.id)); return p ? doorSide(r.rect, p) : null; };
  const bathrooms = rooms.filter(r => r.kind === 'bathroom' || r.kind === 'powder').map(r => ({ id: r.id, rect: r.rect, door: doorOf(r), ...(r.kind === 'powder' ? { powder: true } : {}) }));
  const k = rooms.find(r => r.kind === 'kitchen');
  const liv = rooms.find(r => r.kind === 'living') || rooms.find(r => r.kind === 'family');
  const bal = rooms.find(r => r.kind === 'balcony');
  const stair = rooms.find(r => r.kind === 'stair');
  const typeLabel = { '2BR': '两房一厅', '3BR': '三房一厅', '4BR': '四房一厅', '5BR': '五房两厅' }[spec.type];
  const residence = {
    kind: 'community', type: spec.typeId || spec.type.toLowerCase(), plan: spec.id, label: spec.label || typeLabel,
    level: spec.level || 'flat', width: w, depth: d, area: r2(w * d),
    bedrooms: rooms.filter(r => r.kind === 'bedroom').length,
    entryDoor: ctx.entryAt == null ? null : { at: ctx.entryAt, width: 1.1 },
    exteriorSides: ['S', ...(spec.exposed?.left ? ['W'] : []), ...(spec.exposed?.right ? ['E'] : [])],
    rooms: rooms.map(r => ({ id: r.id, kind: r.kind, name: r.name, rect: r.rect, ...(r.master ? { master: true } : {}),
      ...(r.exterior.length ? { windows: r.exterior } : {}), ...(r.open ? { open: true } : {}) })),
    partitions, beds, bathrooms,
    kitchen: k ? { rect: k.rect, open: !!k.open, door: doorOf(k) } : null,
    living: liv ? { rect: liv.rect } : null,
    balcony: bal ? bal.rect : null,
    facadeWalls: facade(spec, rooms), obstacles,
    ...(stair ? { homeStair: homeStair(stair.rect, spec.level) } : {}),
    ...(rooms.some(r => r.kind === 'void') ? { voids: rooms.filter(r => r.kind === 'void').map(r => r.rect) } : {}),
  };
  return { residence, meta: { p0: ctx.p0, pcw: ctx.pcw, fz: ctx.fz, modes: [ctx.ml, ctx.mr], candidates, score: r2(plan.score) } };
}

function doorAt(seg, width, a, b) {
  const len = segLen(seg), lo = width / 2 + 0.15, hi = len - width / 2 - 0.15;
  if (hi <= lo) return len / 2;
  // Bedroom doors near the circulation end that is closer to the entry (z small / PC side).
  if (seg.axis === 'z') return lo;
  const circ = [a, b].find(r => CIRC.has(r.kind));
  if (circ && circ.kind === 'hall') return Math.min(hi, Math.max(lo, len / 2));
  return lo;
}
function doorSide(r, p) {
  const [ax, az] = p.a, [bx, bz] = p.b;
  const side = Math.abs(ax - bx) < EPS ? (Math.abs(ax - r.x0) < EPS ? 'W' : 'E') : (Math.abs(az - r.z0) < EPS ? 'N' : 'S');
  const len = Math.hypot(bx - ax, bz - az), t = p.door.at / len;
  const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
  return { side, at: r2(side === 'W' || side === 'E' ? cz - r.z0 : cx - r.x0), width: p.door.width };
}

/** Facade walls (unit-local, on the exposed unit edges) with one opening per room.
 * `at` is measured from point a: S wall a=[0,d]→b=[w,d]; W wall a=[0,0]→b=[0,d]; E wall a=[w,0]→b=[w,d]. */
function facade(spec, rooms) {
  const { w, d } = spec;
  const sides = [{ side: 'S', a: [0, d], b: [w, d], along: 'x' }];
  if (spec.exposed?.left) sides.push({ side: 'W', a: [0, 0], b: [0, d], along: 'z' });
  if (spec.exposed?.right) sides.push({ side: 'E', a: [w, 0], b: [w, d], along: 'z' });
  return sides.map(s => {
    const openings = [];
    for (const r of rooms.filter(r => r.exterior.includes(s.side))) {
      const [lo, hi] = s.along === 'x' ? [r.rect.x0, r.rect.x1] : [r.rect.z0, r.rect.z1], span = hi - lo, c = (lo + hi) / 2, k = r.kind;
      if (k === 'balcony') { openings.push({ id: `${r.id}-${s.side}`, type: 'railing', at: r2(c), width: r2(span - 0.1), bottom: 0, top: 1.1, room: r.id }); continue; }
      const width = k === 'living' || k === 'family' || k === 'void' ? span - 0.5 : k === 'dining' ? span - 0.8 : k === 'bedroom' ? Math.min(span - 0.6, spec.lux ? 3.2 : 2.4)
        : k === 'study' ? Math.min(span - 0.6, 2.0) : k === 'kitchen' ? Math.min(span - 0.7, 1.6) : ['bathroom', 'powder', 'laundry', 'closet'].includes(k) ? Math.min(span - 0.6, 0.9)
        : k === 'stair' ? Math.min(span - 0.6, 1.2) : k === 'hall' || k === 'entry' ? Math.min(span - 0.6, 1.0) : 0;
      if (width < 0.6) continue;
      const tall = ['living', 'family', 'dining', 'void'].includes(k) || (spec.lux && k === 'bedroom');
      const wet = ['bathroom', 'powder', 'laundry', 'closet'].includes(k);
      openings.push({ id: `${r.id}-${s.side}`, type: 'window', at: r2(c), width: r2(width), bottom: tall ? 0.1 : wet ? 1.5 : 0.6, top: 2.6, room: r.id,
        ...(wet ? { frosted: true } : {}), ...(tall ? { style: 'floor-to-ceiling' } : {}) });
    }
    return { id: `facade-${s.side}`, side: s.side, a: s.a, b: s.b, thickness: 0.2, type: 'exterior', openings };
  });
}

/** Bed: headboard on a solid wall, ≥ 0.55 m clear on both long sides, door swing clear. */
function placeBed(r, partitions, spec) {
  const bw = r.master ? (spec.lux ? 2.0 : 1.8) : (Math.min(W(r.rect), D(r.rect)) < 3.0 ? 1.2 : 1.5), bl = 2.1;
  const doors = partitions.filter(p => p.door && p.id.split('/').includes(r.id)).map(p => {
    const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]), t = p.door.at / len;
    return [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t];
  });
  const rr = r.rect, out = [];
  for (const head of ['N', 'W', 'E', 'S']) {
    if (r.exterior.includes(head === 'N' ? '-' : head)) continue;          // never against a window wall
    const alongX = head === 'N' || head === 'S';
    const span = alongX ? W(rr) : D(rr), depth = alongX ? D(rr) : W(rr);
    if (span < bw + 1.1 || depth < bl + 0.7) continue;
    for (const t of [0.5, 0.35, 0.65]) {
      const c = alongX ? rr.x0 + W(rr) * t : rr.z0 + D(rr) * t;
      const x = alongX ? c : head === 'W' ? rr.x0 + .1 + bl / 2 : rr.x1 - .1 - bl / 2;
      const z = alongX ? (head === 'N' ? rr.z0 + .1 + bl / 2 : rr.z1 - .1 - bl / 2) : c;
      const bwx = alongX ? bw : bl, bdz = alongX ? bl : bw;
      const fp = R(x - bwx / 2, z - bdz / 2, x + bwx / 2, z + bdz / 2);
      const side = alongX ? Math.min(fp.x0 - rr.x0, rr.x1 - fp.x1) : Math.min(fp.z0 - rr.z0, rr.z1 - fp.z1);
      if (side < 0.55 - EPS || fp.x0 < rr.x0 || fp.x1 > rr.x1 || fp.z0 < rr.z0 || fp.z1 > rr.z1) continue;
      const blocked = doors.some(([px, pz]) => Math.hypot(Math.max(fp.x0 - px, 0, px - fp.x1), Math.max(fp.z0 - pz, 0, pz - fp.z1)) < 0.65);
      if (blocked) continue;
      out.push({ x: r2(x), z: r2(z), w: r2(bwx), d: r2(bdz), head, room: r.id, s: (head === 'N' ? 0.2 : 0) - Math.abs(t - .5) });
    }
  }
  out.sort((a, b) => b.s - a.s);
  if (!out.length) return null;
  const { s, ...bed } = out[0]; void s;
  return bed;
}

/** Flights in unit-local metres (y relative to the lower floor). */
export function homeStair(b, level) {
  const S = DUPLEX_STAIR, z1 = b.z1 - 0.1, zl = b.z0 + 0.1 + S.landing;
  const xa = [b.x0 + 0.1, b.x0 + 0.1 + S.flight], xb = [xa[1] + S.gap, xa[1] + S.gap + S.flight];
  return { block: b, role: level, rise: S.rise, steps: S.steps * 2,
    landing: R(b.x0 + 0.1, b.z0 + 0.1, b.x1 - 0.1, zl), landingY: S.rise / 2,
    flights: [
      { id: 'A', x: r2((xa[0] + xa[1]) / 2), width: S.flight, bottom: [r2((xa[0] + xa[1]) / 2), r2(z1)], top: [r2((xa[0] + xa[1]) / 2), r2(zl)], y0: 0, y1: S.rise / 2, steps: S.steps },
      { id: 'B', x: r2((xb[0] + xb[1]) / 2), width: S.flight, bottom: [r2((xb[0] + xb[1]) / 2), r2(zl)], top: [r2((xb[0] + xb[1]) / 2), r2(z1)], y0: S.rise / 2, y1: S.rise, steps: S.steps },
    ],
    // Lower level: walls round the block except flight A's foot; upper level: an opening in the
    // slab over the block except flight B's head, guarded by a 1.1 m railing.
    lowerOpening: { a: [r2(xa[0]), b.z1], b: [r2(xa[1]), b.z1] },
    upperArrival: { a: [r2(xb[0]), b.z1], b: [r2(xb[1]), b.z1] },
    upperHole: R(b.x0 + 0.1, b.z0 + 0.1, b.x1 - 0.1, b.z1 - 0.1) };
}

/* --------------------------------------------------------------- validate */
/** Independent checks (proposed unit-test content). */
export function validateHome(home, spec) {
  const errs = [];
  const { width: w, depth: d } = home, rooms = home.rooms;
  const area = rooms.reduce((s, r) => s + A(r.rect), 0);
  if (Math.abs(area - w * d) > 0.05) errs.push(`tiling ${area.toFixed(2)}≠${(w * d).toFixed(2)}`);
  for (const r of rooms) if (r.rect.x0 < -EPS || r.rect.z0 < -EPS || r.rect.x1 > w + EPS || r.rect.z1 > d + EPS) errs.push(`${r.id} outside`);
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) if (overlap(rooms[i].rect, rooms[j].rect)) errs.push(`${rooms[i].id}×${rooms[j].id}`);
  // Graph: rooms connect through a door or a wall-less shared edge.
  const adj = new Map(rooms.map(r => [r.id, new Set()]));
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    if (!sharedEdge(a.rect, b.rect)) continue;
    const p = home.partitions.find(p => p.id === `${a.id}/${b.id}` || p.id === `${b.id}/${a.id}`);
    if (!p || p.door) { adj.get(a.id).add(b.id); adj.get(b.id).add(a.id); }
  }
  let start = null;
  if (home.entryDoor) {
    const e = home.entryDoor;
    start = rooms.find(r => r.kind === 'entry' && r.rect.z0 < EPS && e.at - e.width / 2 >= r.rect.x0 - EPS && e.at + e.width / 2 <= r.rect.x1 + EPS)?.id;
    if (!start) errs.push('entry door not into foyer');
    if (e.at - e.width / 2 < 0 || e.at + e.width / 2 > w) errs.push('entry outside front');
  } else start = rooms.find(r => r.kind === 'stair')?.id;
  if (start) {
    const seen = new Set([start]), q = [start];
    while (q.length) for (const o of adj.get(q.pop())) if (!seen.has(o)) { seen.add(o); q.push(o); }
    for (const r of rooms) if (!seen.has(r.id)) errs.push(`${r.id} unreachable`);
  } else errs.push('no start room');
  const openings = home.facadeWalls.flatMap(f => f.openings.map(o => ({ ...o, side: f.side })));
  const viaBalcony = r => home.partitions.some(p => p.role === 'balcony-slider' && p.id.split('/').includes(r.id));
  const viaVoid = r => r.kind === 'family' && rooms.some(v => v.kind === 'void' && sharedEdge(v.rect, r.rect));
  for (const r of rooms.filter(r => NEEDS_WINDOW.has(r.kind))) if (!openings.some(o => o.room === r.id && o.type === 'window') && !viaBalcony(r) && !viaVoid(r)) errs.push(`${r.id} no window`);
  for (const o of openings) if (!home.exteriorSides.includes(o.side)) errs.push(`window on interior side ${o.side}`);
  if (home.kitchen && !home.kitchen.open && !openings.some(o => o.room === 'kitchen')) errs.push('closed kitchen without window');
  const nb = spec.level === 'lower' ? 1 : spec.level === 'upper' ? { '3BR': 2, '4BR': 3, '5BR': 4 }[spec.type] : { '2BR': 2, '3BR': 3, '4BR': 4, '5BR': 5 }[spec.type];
  const bedrooms = rooms.filter(r => r.kind === 'bedroom').length;
  if (bedrooms !== nb) errs.push(`bedrooms ${bedrooms}≠${nb}`);
  if (home.beds.length !== bedrooms) errs.push(`beds ${home.beds.length}≠${bedrooms}`);
  const baths = home.bathrooms.filter(b => !b.powder).length;
  const needBaths = spec.level === 'lower' ? 1 : spec.type === '2BR' && !spec.lux ? 1 : 2;
  if (baths < needBaths) errs.push(`baths ${baths}<${needBaths}`);
  if (spec.level !== 'upper' && !home.kitchen) errs.push('no kitchen');
  if (spec.level !== 'upper' && rooms.filter(r => r.kind === 'living').length !== 1) errs.push('living≠1');
  if (spec.level === 'upper' && !rooms.some(r => r.kind === 'family')) errs.push('no family hall');
  for (const b of home.beds) {
    const room = rooms.find(r => r.id === b.room).rect;
    if (b.x - b.w / 2 < room.x0 - EPS || b.x + b.w / 2 > room.x1 + EPS || b.z - b.d / 2 < room.z0 - EPS || b.z + b.d / 2 > room.z1 + EPS) errs.push(`${b.room} bed outside`);
  }
  for (const p of home.partitions.filter(p => p.door)) {
    const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
    if (p.door.width < 0.8 - EPS || p.door.at - p.door.width / 2 < -EPS || p.door.at + p.door.width / 2 > len + EPS) errs.push(`${p.id} door invalid`);
  }
  for (const r of rooms) {
    const m = MIN[r.master ? 'master' : r.kind];
    if (!m || ['hall', 'entry', 'dining', 'stair', 'family'].includes(r.kind)) continue;
    if (Math.min(W(r.rect), D(r.rect)) < m.side - 0.011) errs.push(`${r.id} narrow ${Math.min(W(r.rect), D(r.rect)).toFixed(2)}`);
    if (A(r.rect) < m.area - 0.05) errs.push(`${r.id} small ${A(r.rect).toFixed(1)}`);
  }
  return errs;
}

/** Mirror-invariant type signature: room kinds with rounded areas (a mirrored twin is the same type). */
export const planSignature = r => r.rooms.map(q => `${q.kind}:${Math.round((q.rect.x1 - q.rect.x0) * (q.rect.z1 - q.rect.z0))}`).sort().join(',');
