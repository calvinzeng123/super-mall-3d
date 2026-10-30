// 全园停车系统数据导出：各地库楼层的车位、车道、柱网、电梯楼梯，坡道与跨库连接，
// 西侧与酒店地面停车场，以及出入口分析（所接道路、坡长坡度、距路口与斑马线距离）。
// 用法（仓库根目录）：node docs/planning/2026-10-29-parking-system/export-parking-data.mjs
// 输出同目录 parking-data.json，供 parking-map.html 绘制“地图式”总图。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLayout } from '../../../src/layout/layout.js';
import { toW, lrectPoly, rectPoly, rect, pointInPoly, clipConvex, distToPolyEdge, convexOverlap } from '../../../src/layout/geom.js';
import { WEST_LOT_GATES } from '../../../src/layout/p1-access.js';

const here = dirname(fileURLToPath(import.meta.url));
const L = buildLayout();
const r1 = v => Math.round(v * 10) / 10;
const P = poly => poly.map(([x, z]) => [r1(x), r1(z)]);
const flat = poly => poly.flatMap(([x, z]) => [r1(x), r1(z)]);
const level = id => L.levels.find(l => l.id === id);
const WEST_GATE_IDS = new Set(WEST_LOT_GATES.map(g => g.id));

const NAMES = { P1: '一期', WPG: '西侧公共车库', H: '酒店', A: '公寓', P2: '二期', P3: '三期', R1: '1号住宅', R2: '2号住宅', R3: '3号住宅', R4: '4号住宅', M: '地铁' };
const SYSTEM = { P1: 'shared', WPG: 'shared', H: 'shared', A: 'shared', P2: 'P2', P3: 'P3', R1: 'R', R2: 'R', R3: 'R', R4: 'R' };
const SYSTEMS = {
  shared: { name: '一期共享地库', note: '一期 B1/B2、西侧公共车库 B1/B2、酒店与公寓 B1/B2 车行互通；不接二期' },
  P2: { name: '二期地库', note: '独立系统' }, P3: { name: '三期地库', note: '独立系统' },
  R: { name: '住宅地库', note: '四栋住宅 B1 经地下车行通道互通' },
};
// Physical depth tiers. Building floor names differ: 一期 B1 is on the -8.4 m tier
// because the 一期 B1M food/metro concourse sits above it at -4.5 m.
const tierOf = y => y >= 0 ? 'ground' : y > -6 ? 't1' : y > -10.5 ? 't2' : 't3';
const TIERS = {
  ground: { name: '地面', elev: '0m' },
  t1: { name: '-4.5m 层', elev: '-4.2 ~ -4.5m', short: '负一' },
  t2: { name: '-8.4m 层', elev: '-8.4 ~ -9m', short: '负二' },
  t3: { name: '-12m 层', elev: '-12m', short: '负三' },
};

// ---------- garage levels ----------
const garageLevels = L.levels.filter(l => l.parking?.stalls?.length || l.id === 'P1-B1M');
const levels = garageLevels.map(lv => {
  const b = lv.building, stalls = lv.parking?.stalls || [];
  const byType = { normal: [], ev: [], accessible: [] };
  for (const s of stalls) (byType[s.type] || byType.normal).push(flat(s.poly));
  const cols = [], seen = new Set();
  for (const c of lv.parking?.columns || []) { const [x, z] = toW(c.frame, c.lx, c.lz), k = `${r1(x)},${r1(z)}`; if (!seen.has(k)) { seen.add(k); cols.push([r1(x), r1(z)]); } }
  const walk = kind => lv.walk.filter(w => w.kind === kind).map(w => flat(w.poly));
  return {
    id: lv.id, building: b, system: SYSTEM[b] || null, name: `${NAMES[b] || b} ${lv.short}`, short: lv.short, elev: lv.elev, height: lv.height, tier: tierOf(lv.elev),
    use: lv.id === 'P1-B1M' ? '美食广场 · 地铁站厅（步行层，无车位）' : '停车',
    stallCount: stalls.length, stallTypes: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])),
    slab: lv.slab.pieces.map(p => ({ outer: flat(p.outer), holes: p.holes.map(flat) })),
    stalls: byType, aisles: walk('aisle'), spines: walk('spine'), lobbies: [...walk('lobby'), ...walk('eschall')],
    walkways: lv.id === 'P1-B1M' ? lv.walk.map(w => flat(w.poly)) : [],
    columns: cols,
    lifts: L.elevators.filter(e => e.serves.includes(lv.id)).map(e => ({ id: e.id, x: r1(e.x), z: r1(e.z), poly: flat(lrectPoly(e.frame, rect(e.lu - e.w / 2, e.lv - e.d / 2, e.lu + e.w / 2, e.lv + e.d / 2))) })),
    stairs: (L.stairs || []).filter(s => s.serves.includes(lv.id)).map(s => ({ id: s.id, poly: flat(lrectPoly(s.frame, s.rect)) })),
  };
});

// ---------- roads, intersections, crossings ----------
const near = poly => poly.some(([x, z]) => x > -560 && x < 320 && z > -300 && z < 300);
// City-grid extensions carry a generic name; label the ones that continue a campus road.
const ROAD_NAMES = { 'city-avenue-west': '云澜大道（西延）', 'city-avenue-east': '云澜大道（东延）', 'city-ring-west-262': '北外环（西延）', 'city-ring-east-262': '北外环（东延）',
  'city-ring-west262': '南外环（西延）', 'city-ring-east262': '南外环（东延）', 'city-xingwan-n': '星湾路（北延）', 'city-xingwan-s': '星湾路（南延）' };
const SIDE = { 云澜大道: '南', 星湾路: '东', 北外环: '北', 西外环: '西', 南外环: '南', 东外环: '东', 星湾北街: '北', '北外环（西延）': '北', '云澜大道（西延）': '南' };
const named = L.site.roads.filter(r => near(r.poly)).map(r => ({ ...r, name: ROAD_NAMES[r.id] || r.name }));
const roads = named.map(r => ({ id: r.id, name: r.name, dir: r.dir, lanes: r.lanes ?? null, poly: P(r.poly) }));
const intersections = [];
for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) {
  const a = named[i], b = named[j];
  if (a.dir === b.dir || !convexOverlap(a.poly, b.poly)) continue;
  const box = clipConvex(a.poly, b.poly);
  if (box.length >= 3) intersections.push({ id: `${a.id}×${b.id}`, name: `${a.name} × ${b.name}`, poly: P(box) });
}
const crossings = (L.site.crossings || []).filter(c => near(c.poly)).map(c => ({ id: c.id, poly: P(c.poly) }));
const distTo = (p, poly) => pointInPoly(p, poly) ? 0 : distToPolyEdge(p, poly);
const nearestOf = (p, list) => list.reduce((best, x) => { const d = distTo(p, x.poly); return d < best.d ? { d, item: x } : best; }, { d: Infinity, item: null });
// The city road a gate or ramp mouth serves: the nearest carriageway to a point just outside it.
const roadAt = p => nearestOf(p, named).item;

// ---------- ramps ----------
// The ground opening of a street ramp: its own record, else the site trench over it.
const openingOf = r => r.groundOpening || L.site.trenches.filter(t => convexOverlap(t, r.poly)).sort((a, b) => overlapArea(b, r.poly) - overlapArea(a, r.poly))[0] || r.poly;
const overlapArea = (a, b) => { const c = clipConvex(a, b); let s = 0; for (let i = 0; i < c.length; i++) { const [x0, z0] = c[i], [x1, z1] = c[(i + 1) % c.length]; s += x0 * z1 - x1 * z0; } return Math.abs(s / 2); };
const axisExtent = (poly, [ux, uz]) => { const d = poly.map(([x, z]) => x * ux + z * uz); return Math.max(...d) - Math.min(...d); };
const ramps = L.ramps.map(r => {
  const street = r.from.level === 'street' ? r.from : r.to.level === 'street' ? r.to : null;
  const low = street ? (street === r.from ? r.to : r.from) : (r.from.y < r.to.y ? r.from : r.to), high = low === r.from ? r.to : r.from;
  const len = Math.hypot(high.x - low.x, high.z - low.z), ux = (high.x - low.x) / len, uz = (high.z - low.z) / len;
  return {
    id: r.id, name: r.name || r.id, type: r.type, kind: street ? 'street' : 'inner', building: r.building, system: SYSTEM[r.building] || null,
    from: { level: r.from.level, y: r.from.y, x: r1(r.from.x), z: r1(r.from.z) }, to: { level: r.to.level, y: r.to.y, x: r1(r.to.x), z: r1(r.to.z) },
    low: { level: low.level, y: low.y, x: r1(low.x), z: r1(low.z) }, high: { level: high.level, y: high.y, x: r1(high.x), z: r1(high.z) },
    dir: [Math.round(ux * 1000) / 1000, Math.round(uz * 1000) / 1000], width: r.width, length: r1(len), slope: Math.round((high.y - low.y) / len * 1000) / 10,
    quadrant: r.quadrant || null, poly: flat(r.poly), open: street ? flat(openingOf(r)) : null, openLength: street ? r1(axisExtent(openingOf(r), [ux, uz])) : null, expansion: !!r.expansion,
    tiers: [...new Set([tierOf(r.from.y), tierOf(r.to.y)])],
  };
});

// ---------- links between garages and levels ----------
const pathLinks = L.extensions.paths.filter(p => ['garage', 'underground'].includes(p.kind))
  .map(p => ({ id: p.id, kind: p.kind === 'garage' ? 'vehicle' : 'pedestrian', name: p.name, level: p.level || null, tier: tierOf(level(p.level)?.elev ?? -4.5), polys: p.polys.map(flat) }));
const gateways = (L.extensions.gateways || []).filter(g => g.kind === 'garage' || g.kind === 'underground')
  .map(g => ({ id: g.id, kind: g.kind === 'garage' ? 'vehicle' : 'pedestrian', name: g.name, level: g.level, tier: tierOf(g.elev), poly: flat(g.poly) }));
const connections = [];
for (const c of L.extensions.connections || []) {
  if (!c.from || !c.to || c.id.endsWith('-from')) continue;
  const a = level(c.from), b = level(c.to);
  if (!a || !b || a.elev >= 0 || b.elev >= 0) continue;
  const vehicle = (a.parking?.stalls?.length && b.parking?.stalls?.length) || c.kind === 'garage';
  connections.push({ id: c.id.replace(/-to$/, ''), from: c.from, to: c.to, fromElev: a.elev, toElev: b.elev, kind: vehicle ? 'vehicle' : 'pedestrian', name: c.name || null,
    at: c.seg ? [r1((c.seg.x0 + c.seg.x1) / 2), r1((c.seg.z0 + c.seg.z1) / 2)] : null, width: c.seg ? r1(Math.hypot(c.seg.x1 - c.seg.x0, c.seg.z1 - c.seg.z0)) : null });
}

// ---------- surface lots ----------
const W = L.site.westParking, hotel = L.extensions.surfaceParking.find(l => l.id === 'hotel-shared-parking');
const westStalls = { normal: [], ev: [], accessible: [] };
for (const lot of W.lots) for (const s of lot.stalls) (westStalls[s.type] || westStalls.normal).push(flat(s.poly));
const hotelStalls = { normal: [], ev: [], accessible: [] };
for (const s of hotel.stalls) (hotelStalls[s.type] || hotelStalls.normal).push(flat(s.poly));
const tc = L.site.transitCenter;
const surface = {
  west: { name: W.name || '西侧地面停车场', rect: W.rect, poly: flat(W.poly), stallCount: W.stallCount, evCount: W.evCount, accessibleCount: W.accessibleCount,
    lots: W.lots.map(l => ({ id: l.id, name: l.name, poly: flat(l.poly), stalls: l.stalls.length })), stalls: westStalls,
    roads: W.roads.map(r => ({ id: r.id, width: r.width, polys: r.polys.map(flat) })), walks: W.walks.map(w => ({ id: w.id, name: w.name, polys: w.polys.map(flat) })),
    islands: (W.islands || []).map(i => flat(i.poly)), gates: W.gates.map(g => ({ id: g.id, name: g.name, x: g.x, z: g.z, width: g.width, facing: g.facing || [1, 0] })),
    transit: { name: tc.name, poly: flat(tc.poly) } },
  hotel: { name: hotel.name, poly: flat(hotel.poly), aisle: flat(hotel.aislePoly), stallCount: hotel.stalls.length, stalls: hotelStalls,
    loop: L.fidelity?.landscape?.hotelLoop ? { rect: L.fidelity.landscape.hotelLoop.rect, corner: L.fidelity.landscape.hotelLoop.corner, planter: flat(L.fidelity.landscape.hotelLoop.planterPoly) } : null },
};

// ---------- entrances: street ramps and surface gates ----------
const COMPASS = (x, z) => Math.abs(x) > Math.abs(z) ? (x > 0 ? '东' : '西') : (z > 0 ? '南' : '北');
const entrances = [];
for (const r of ramps.filter(r => r.kind === 'street')) {
  const mouth = [r.high.x, r.high.z], outside = [r.high.x + r.dir[0] * 4, r.high.z + r.dir[1] * 4];
  const lot = pointInPoly(outside, W.poly) ? W.name || '西侧地面停车场' : pointInPoly(outside, hotel.poly) ? hotel.name : null;
  const road = roadAt(outside);
  const x = nearestOf(mouth, intersections), zc = nearestOf(mouth, crossings);
  entrances.push({ id: r.id, kind: 'ramp', name: r.name, system: r.system, garage: NAMES[r.building], landing: r.low.level, landingElev: r.low.y, inOut: r.type === 'street-in' ? '入口' : '出口',
    x: mouth[0], z: mouth[1], dir: r.dir, opens: COMPASS(r.dir[0], r.dir[1]), via: lot || road?.name || null, side: lot ? '场内' : SIDE[road?.name] || null,
    length: r.length, slope: r.slope, width: r.width, openLength: r.openLength,
    toIntersection: r1(x.d), intersection: x.item?.name || null, toCrossing: r1(zc.d), expansion: r.expansion });
}
for (const g of W.gates) {
  // The three original gates face east onto 西外环 (the renderer's default facing).
  const facing = g.facing || [1, 0], outside = [g.x + facing[0] * 10, g.z + facing[1] * 10], road = roadAt(outside);
  const x = nearestOf([g.x, g.z], intersections), zc = nearestOf([g.x, g.z], crossings);
  entrances.push({ id: g.id, kind: 'gate', name: `${W.name || '西侧地面停车场'} ${g.name}`, system: 'surface', garage: '西侧地面停车场', landing: 'surface', landingElev: 0, inOut: '双向',
    x: g.x, z: g.z, dir: facing, opens: COMPASS(facing[0], facing[1]), via: road?.name || null, side: SIDE[road?.name] || null, width: g.width, length: null, slope: null,
    toIntersection: r1(x.d), intersection: x.item?.name || null, toCrossing: r1(zc.d), expansion: WEST_GATE_IDS.has(g.id) });
}

// ---------- context: plots and building footprints ----------
const plots = (L.site.plots || []).filter(p => near(p.poly || rectPoly(p.rect))).map(p => ({ id: p.id, poly: flat(p.poly || rectPoly(p.rect)) }));
const footprints = L.buildings.filter(b => !b.undergroundOnly && b.kind !== 'metro' && near(b.outline)).map(b => ({ id: b.id, name: b.name, kind: b.kind, poly: flat(b.outline) }));

// ---------- summary ----------
const sum = (list, f) => list.reduce((n, x) => n + f(x), 0);
const sharedRamps = ramps.filter(r => r.system === 'shared'), widths = sharedRamps.map(r => r.width);
const summary = {
  systems: Object.fromEntries(Object.entries(SYSTEMS).map(([k, s]) => [k, { ...s, levels: levels.filter(l => l.system === k).map(l => l.id),
    stalls: sum(levels.filter(l => l.system === k), l => l.stallCount), streetRamps: ramps.filter(r => r.system === k && r.kind === 'street').length,
    innerRamps: ramps.filter(r => r.system === k && r.kind === 'inner').length }])),
  surface: { west: W.stallCount, hotel: hotel.stalls.length },
  dims: { stall: '2.5 × 5.0 m', aisle: '主车道 6 m（局部 4–5 m 支路）', columnGrid: '8 m', rampWidth: `${Math.min(...widths)}–${Math.max(...widths)} m`, maxSlope: `${Math.max(...sharedRamps.map(r => r.slope))}%`, headroom: 'B1 层高 3.9m / B2 3.6m（一期）' },
};

const out = { generated: new Date().toISOString().slice(0, 10), tiers: TIERS, systems: SYSTEMS, names: NAMES, summary,
  roads, intersections, crossings, plots, footprints, levels, ramps, links: [...pathLinks, ...gateways], connections, surface, entrances };
writeFileSync(join(here, 'parking-data.json'), JSON.stringify(out));
console.log(JSON.stringify({ levels: levels.length, ramps: ramps.length, links: out.links.length, connections: connections.length, entrances: entrances.length,
  intersections: intersections.length, kb: Math.round(JSON.stringify(out).length / 1024), summary: summary.systems }, null, 1));
