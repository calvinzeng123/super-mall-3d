// 避难层（refuge floors）：one level record shape and one stack check for every supertall tower type
// (北苑, 西苑, 二期 R, 酒店 H, 服务公寓 A). SPEC §1.0 / §2.1; GB 55037 §7.1.14–15, GB 50016 §5.5.23.
//
// A refuge level is a numbered storey (`16F 避难层`) of kind 'refuge' with no homes. Its plan
// (lv.refugePlan) is drawn in the tower frame: 避难区 (walkable, on the hardstand face), plant rooms
// (solid, behind 2.00 h / 3.00 h walls), 防火隔间 vestibules, fire windows / louvres and fixtures.
import { lrectPoly, toW } from './geom.js';
import { isFireLift } from './elevator-shafts.js';

export const REFUGE = Object.freeze({
  /** GB 55037 §7.1.14: first refuge floor ≤ 50 m above the fire-rescue hardstand; GB 50016 §5.5.23-1: spacing ≤ 50 m. */
  maxFirst: 50, maxGap: 50,
  /** This spec's own stricter check: the top enclosed occupied storey ≤ 50 m above the last refuge floor. */
  maxTop: 50,
  /** Net 避难区 area: 5 persons per m² (GB 50016 §5.5.23-3). */
  density: 5,
  label: '避难层 · 设备层 · 消防电梯停靠', outrigger: ' · 加强层', area: '避难区', vestibule: '防火隔间',
  ratings: Object.freeze(['2.00h', '3.00h']),
  windowKinds: Object.freeze(['fire-window-B', 'louvre']),
  fixtureKinds: Object.freeze(['hydrant', 'hose-reel', 'extinguisher', 'fire-phone', 'pa', 'sign']),
  /** A 避难区 "touches" the hardstand face when its edge is within this of the facade line (wall + finish). */
  faceTolerance: 0.6,
});

const rectArea = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const r2 = (v) => Math.round(v * 100) / 100;
const polyArea = (P) => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/**
 * A refuge level record. Geometry inputs are tower-local rects in `frame`; the record carries world polys.
 *   areas:      [{ id, rect, net? }]              避难区 (walk); net defaults to the rect area
 *   corridors:  [rect]                            other walkable floor on the refuge storey (landings, band, lobby)
 *   plant:      [{ id, name, rect, rating, contents }]  solid plant rooms ('2.00h' | '3.00h')
 *   vestibules: [{ rect, doors }]                 防火隔间 into the plant zone (doors: local door segments)
 *   windows:    [{ edge: 'N'|'S'|'E'|'W', span: [a, b], kind: 'fire-window-B'|'louvre' }]
 *   fixtures:   [{ kind, x, z, label }]           x, z tower-local; the record stores world x, z (+ lx, lz)
 *   face:       the hardstand side of the tower ('N' | 'S' | 'E' | 'W', tower-local)
 *   persons:    occupants the floor serves (sizing: net ≥ persons / 5); serves: the storeys it serves
 *   outrigger:  true on a 加强层 (theme label gains ' · 加强层')
 *   footprint:  local rect of the slab (default: the union of every rect above); slab: explicit slab pieces
 */
export function refugeLevel({ id, building, short, elev, height, frame, footprint, slab, outline,
  areas = [], corridors = [], plant = [], vestibules = [], windows = [], fixtures = [],
  face = null, persons = 0, serves = [], outrigger = false, theme = {} }) {
  const m = /^(\d+)F$/.exec(short || '');
  if (!m) throw new Error(`refugeLevel ${id}: a refuge floor is a numbered storey (short '${short}')`);
  const poly = (r) => lrectPoly(frame, r);
  const fp = footprint || [...areas.map((a) => a.rect), ...corridors, ...plant.map((p) => p.rect), ...vestibules.map((v) => v.rect)]
    .reduce((a, r) => ({ x0: Math.min(a.x0, r.x0), z0: Math.min(a.z0, r.z0), x1: Math.max(a.x1, r.x1), z1: Math.max(a.z1, r.z1) }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
  const plan = {
    frame, face,
    areas: areas.map((a) => ({ id: a.id, name: REFUGE.area, rect: { ...a.rect }, poly: poly(a.rect), net: r2(a.net ?? rectArea(a.rect)) })),
    plant: plant.map((p) => ({ id: p.id, name: p.name, rect: { ...p.rect }, poly: poly(p.rect), rating: p.rating || '2.00h', contents: [...(p.contents || [])] })),
    vestibules: vestibules.map((v, i) => ({ id: v.id || `${id}-vestibule-${i}`, name: REFUGE.vestibule, rect: { ...v.rect }, poly: poly(v.rect), doors: (v.doors || []).map((d) => ({ ...d })) })),
    windows: windows.map((w) => ({ edge: w.edge, span: [...w.span], kind: w.kind })),
    fixtures: fixtures.map((f) => { const [x, z] = toW(frame, f.x, f.z); return { kind: f.kind, x, z, lx: f.x, lz: f.z, label: f.label }; }),
    serves: [...serves], persons, netRequired: r2(persons / REFUGE.density), outrigger: !!outrigger,
  };
  const walk = [...plan.areas.map((a) => ({ id: a.id, kind: 'refuge', frame, rect: a.rect, poly: a.poly })),
    ...corridors.map((r, i) => ({ id: `${id}-corridor-${i}`, kind: 'corridor', frame, rect: { ...r }, poly: poly(r) }))];
  // Plant rooms are solid (nav walls round them, no door); the 防火隔间 is drawn, not walked.
  const rooms = plan.plant.map((p) => ({ id: p.id, type: 'plant', label: p.name, frame, rects: [p.rect], polys: [p.poly], doors: [], wdoors: [] }));
  return {
    id, building, short, levelNumber: +m[1], name: `${short} 避难层`, kind: 'refuge', elev, height,
    theme: { key: 'refuge', floor: 'concrete-blue', label: `${REFUGE.label}${outrigger ? REFUGE.outrigger : ''}`, ...theme },
    outline: outline || poly(fp), units: [], rooms, walk, voids: [], features: [],
    slab: slab || { pieces: [{ outer: poly(fp), holes: [], localRect: { ...fp } }] },
    refugePlan: plan,
  };
}

/** Shape errors of one refuge level record (the community contract and checkRefugeStack use it). */
export function refugeLevelErrors(lv) {
  const errs = [], at = `level ${lv.id}`, p = lv.refugePlan;
  if (lv.kind !== 'refuge') errs.push(`${at} kind: expected 'refuge'`);
  if (!/^\d+F$/.test(lv.short || '') || lv.name !== `${lv.short} 避难层`) errs.push(`${at} name: expected '${lv.short} 避难层'`);
  if (lv.units?.length) errs.push(`${at} units: a refuge floor has no homes (${lv.units.length})`);
  if (!lv.theme?.label?.startsWith(REFUGE.label)) errs.push(`${at} theme.label: expected '${REFUGE.label}…'`);
  if (!p) { errs.push(`${at} refugePlan: required`); return errs; }
  if (!Array.isArray(p.areas) || !p.areas.length) errs.push(`${at} refugePlan.areas: at least one 避难区`);
  for (const a of p.areas || []) if (a.name !== REFUGE.area || !Array.isArray(a.poly) || !(a.net > 0)) errs.push(`${at} refugePlan.areas ${a.id}: {name:'避难区', poly, net > 0}`);
  for (const q of p.plant || []) if (!REFUGE.ratings.includes(q.rating) || !Array.isArray(q.poly)) errs.push(`${at} refugePlan.plant ${q.id}: rating 2.00h | 3.00h and poly`);
  for (const w of p.windows || []) if (!['N', 'S', 'E', 'W'].includes(w.edge) || !REFUGE.windowKinds.includes(w.kind)) errs.push(`${at} refugePlan.windows: edge N|S|E|W, kind fire-window-B | louvre`);
  for (const f of p.fixtures || []) if (!REFUGE.fixtureKinds.includes(f.kind)) errs.push(`${at} refugePlan.fixtures: unexpected ${f.kind}`);
  if (!['N', 'S', 'E', 'W'].includes(p.face)) errs.push(`${at} refugePlan.face: the hardstand side N | S | E | W`);
  if (!(p.netRequired >= 0)) errs.push(`${at} refugePlan.netRequired: required`);
  return errs;
}

/** Does some 避难区 of plan reach the facade line of the hardstand face of footprint (tower-local)? */
function touchesFace(plan, footprint) {
  const t = REFUGE.faceTolerance;
  return plan.areas.some((a) => {
    const r = a.rect || null;
    if (!r) return false;
    return plan.face === 'N' ? r.z0 <= footprint.z0 + t : plan.face === 'S' ? r.z1 >= footprint.z1 - t
      : plan.face === 'W' ? r.x0 <= footprint.x0 + t : r.x1 >= footprint.x1 - t;
  });
}

/**
 * Refuge-floor errors of one tower (strings; empty = clean).
 * building: the tower record (id, footprint); levels: its levels (own, and host levels if any), any order;
 * opts.elevators: the tower's lift records (role / serves / fireOnly); opts.ground: the hardstand level (0.0 m).
 * Checks: the first refuge floor > 50 m above the ground; a gap > 50 m between refuge floors; the top enclosed
 * occupied storey > 50 m above the last refuge floor (also when the tower has no refuge floor at all);
 * net 避难区 < persons / 5; no fire lift landing on it (normal or fire-only); a passenger / private lift
 * landing on it in normal mode; a unit on it; no 避难区 on the hardstand face.
 * Open-air `kind: 'roof'` levels are exempt from the top check: a roof garden is not an enclosed storey,
 * so 西苑's RF garden 52.5 m above 31F passes while 47F is 49.5 m above it (SPEC §0.5, C-17).
 */
export function checkRefugeStack(building, levels, { ground = 0, elevators = [] } = {}) {
  const errs = [], err = (lv, msg) => errs.push(`${building.id}${lv ? ` ${lv.id}` : ''}: ${msg}`);
  const sorted = [...levels].sort((a, b) => a.elev - b.elev);
  const refuges = sorted.filter((l) => l.kind === 'refuge');
  const occupied = sorted.filter((l) => l.kind !== 'refuge' && l.kind !== 'roof' && l.elev > ground + 1e-6);
  const fmt = (v) => `${(+v.toFixed(2))} m`;
  if (!refuges.length) {
    const top = occupied.at(-1);
    if (top && top.elev - ground > REFUGE.maxFirst) err(top, `no refuge floor, yet the top occupied storey is ${fmt(top.elev - ground)} above the hardstand (first refuge floor ≤ ${REFUGE.maxFirst} m)`);
    return errs;
  }
  if (refuges[0].elev - ground > REFUGE.maxFirst + 1e-6) err(refuges[0], `first refuge floor ${fmt(refuges[0].elev - ground)} above the hardstand (> ${REFUGE.maxFirst} m)`);
  for (let i = 1; i < refuges.length; i++) {
    const gap = refuges[i].elev - refuges[i - 1].elev;
    if (gap > REFUGE.maxGap + 1e-6) err(refuges[i], `gap ${fmt(gap)} to ${refuges[i - 1].id} (> ${REFUGE.maxGap} m)`);
  }
  const last = refuges.at(-1), top = occupied.filter((l) => l.elev > last.elev).at(-1);
  if (top && top.elev - last.elev > REFUGE.maxTop + 1e-6) err(top, `top occupied storey ${fmt(top.elev - last.elev)} above the last refuge floor ${last.id} (> ${REFUGE.maxTop} m)`);
  for (const lv of refuges) {
    const p = lv.refugePlan;
    for (const e of refugeLevelErrors(lv)) errs.push(`${building.id} ${e}`);
    if (lv.units?.length) err(lv, `unit on a refuge floor (${lv.units.map((u) => u.id).join(', ')})`);
    if (p?.areas?.length) {
      const net = p.areas.reduce((s, a) => s + (a.net ?? polyArea(a.poly)), 0);
      if (net + 1e-6 < (p.persons || 0) / REFUGE.density) err(lv, `net 避难区 ${r2(net)} m² < ${r2(p.persons / REFUGE.density)} m² (${p.persons} persons at ${REFUGE.density} per m²)`);
      if (building.footprint && !touchesFace(p, building.footprint)) err(lv, `no 避难区 on the hardstand face ${p.face}`);
    }
    const landing = (e) => e.serves.includes(lv.id) || !!e.fireOnly?.includes(lv.id);
    if (!elevators.some((e) => isFireLift(e) && landing(e))) err(lv, 'no fire lift lands on it');
    for (const e of elevators.filter((q) => !isFireLift(q) && q.serves.includes(lv.id))) err(lv, `passenger lift ${e.id} lands on it (passenger and private lifts pass refuge floors)`);
  }
  return errs;
}
