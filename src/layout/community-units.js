// 云澜社区住宅（西苑 / 北苑）户型单元工厂：由生成的户型数据（community-plan-data.js）
// 生成一个楼层单元记录。复式下层围合套内楼梯、上层在楼梯洞口与挑空边设栏杆，
// nav.js 的分隔墙代码直接把它们当作墙，不需要额外导航代码。
import { rect, lrectPoly, lseg } from './geom.js';

export const COMMUNITY_CATEGORY = Object.freeze({ label: '云澜社区住宅', color: '#6f8a7a' });
export const COMMUNITY_ACCENT = Object.freeze({ west: '#6f8a7a', north: '#8a7a5c' });

const EPS = 1e-6;
const r2 = (v) => Math.round(v * 100) / 100;

// Axis-aligned unit-local segments as { axis, c, lo, hi }: axis 'x' runs along x at z = c.
const rectEdges = (r) => [
  { axis: 'x', c: r.z0, lo: r.x0, hi: r.x1 }, { axis: 'z', c: r.x1, lo: r.z0, hi: r.z1 },
  { axis: 'x', c: r.z1, lo: r.x0, hi: r.x1 }, { axis: 'z', c: r.x0, lo: r.z0, hi: r.z1 },
];
const segOf = ({ a, b }) => Math.abs(a[1] - b[1]) < EPS
  ? { axis: 'x', c: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) }
  : Math.abs(a[0] - b[0]) < EPS ? { axis: 'z', c: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) } : null;
const onOutline = (e, w, d, tol = EPS) => e.axis === 'x'
  ? Math.abs(e.c) < tol || Math.abs(e.c - d) < tol
  : Math.abs(e.c) < tol || Math.abs(e.c - w) < tol;
/** Parts of edge e not covered by the collinear cuts (within tol of its line). */
function uncovered(e, cuts, tol = EPS) {
  let ivs = [[e.lo, e.hi]];
  for (const s of cuts) {
    if (!s || s.axis !== e.axis || Math.abs(s.c - e.c) > tol) continue;
    ivs = ivs.flatMap(([a, b]) => [[a, Math.min(b, s.lo)], [Math.max(a, s.hi), b]]).filter(([a, b]) => b - a > 0.02);
  }
  return ivs;
}
const segment = (e, [lo, hi]) => e.axis === 'x'
  ? { a: [r2(lo), r2(e.c)], b: [r2(hi), r2(e.c)] }
  : { a: [r2(e.c), r2(lo)], b: [r2(e.c), r2(hi)] };

/** Duplex partitions and obstacles added on top of the generated plan (all unit-local). */
function duplexParts(res) {
  const s = res.homeStair, w = res.width, d = res.depth;
  const existing = res.partitions.map(segOf);
  const out = [], push = (prefix, role, e, ivs) => ivs.forEach((iv) => out.push({ id: `${prefix}-${out.length}`, ...segment(e, iv), role }));
  if (s?.role === 'lower') {
    // Walls round the stair block except flight A's foot (where the generator left the edge open).
    const opening = segOf(s.lowerOpening);
    for (const e of rectEdges(s.block)) if (!onOutline(e, w, d)) push('home-stair/wall', 'stair-wall', e, uncovered(e, [...existing, opening]));
    const B = s.flights.find((f) => f.id === 'B'), hw = B.width / 2;
    const z0 = Math.min(B.bottom[1], B.top[1]), z1 = Math.max(B.bottom[1], B.top[1]);
    res.obstacles = [...(res.obstacles || []), { id: 'home-stair-under-B', rect: rect(r2(B.x - hw + .05), r2(z0 + .05), r2(B.x + hw - .05), r2(z1 - .05)) }];
  }
  if (s?.role === 'upper') {
    // 1.1 m railing round the slab opening (0.1 m inside the block); flight B's head arrives
    // through the rear edge, and an edge already guarded by the outline or a wall needs none.
    const arrival = segOf(s.upperArrival);
    for (const e of rectEdges(s.upperHole)) if (!onOutline(e, w, d, .15)) push('home-stair/railing', 'railing', e, uncovered(e, [...existing, arrival], .15));
  }
  for (const v of res.voids || []) for (const e of rectEdges(v)) {
    if (!onOutline(e, w, d)) push('home-void/railing', 'railing', e, uncovered(e, existing));
  }
  res.partitions = [...res.partitions, ...out];
}

/**
 * One level-unit from a generated plan (unit-local: x along the entry front, z from the
 * front to the rear). fronts defaults to the entry front; an upper duplex level has none.
 */
export function communityUnit({ lv, building, id, code, slot, frame, plan, name, en, catLabel, accent,
  fronts, home, homeLevels, partner, community }) {
  const residence = structuredClone(plan);
  const bid = building ?? lv.building;
  residence.community = community || residence.community || (/^T/.test(bid) ? 'north' : 'west');
  residence.home = home ?? residence.home ?? id;
  residence.homeLevels = [...(homeLevels ?? residence.homeLevels ?? [lv.id])];
  if (partner != null) residence.partner = partner;
  if (residence.homeStair || residence.voids?.length) duplexParts(residence);
  const upper = residence.level === 'upper' || residence.entryDoor == null;
  const fr = (fronts ?? (upper ? [] : [{ x0: 0, z0: 0, x1: plan.width, z1: 0, side: 'N' }])).map((f) => ({ ...f }));
  const r = rect(0, 0, plan.width, plan.depth);
  return {
    id, code, slot: String(slot), building: bid, level: lv.id, frame,
    rects: [r], polys: [lrectPoly(frame, r)], fronts: fr, wfronts: fr.map((f) => lseg(frame, f)),
    style: 'residence', area: plan.area,
    brand: { name, en, cat: 'community', catLabel: catLabel ?? `${plan.label} · ${Math.round(plan.area)}㎡`,
      bg: accent ?? COMMUNITY_ACCENT[residence.community], fg: '#ffffff', logo: 'diamond' },
    residence,
  };
}
