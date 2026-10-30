// 从游戏布局导出一期总图数据，图纸与游戏同源：
// - 现状取 buildLayout({ fidelity: false })，即本方案之前的完整探索版；
// - 本方案取 buildLayout() 中实际生成的坡道、车行口、屋面造型与景观记录。
// 用法（仓库根目录）：node docs/planning/2026-10-29-p1-concept-fidelity/export-design-data.mjs
// 输出同目录 design-data.json，供 draw-design.py 绘制总图与车行组织图。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLayout } from '../../../src/layout/layout.js';
import { rect, rectPoly, polyBounds, lrectPoly } from '../../../src/layout/geom.js';
import { P1_GARAGE_RAMPS, P1_GARAGE_APRONS, P1_GARAGE_ARRIVALS, WEST_LOT_GATES } from '../../../src/layout/p1-access.js';
import { CREATIVE_ROOFS } from '../../../src/layout/p1-roofscape.js';

const here = dirname(fileURLToPath(import.meta.url));
const before = buildLayout({ fidelity: false }), after = buildLayout();
const level = (L, id) => L.levels.find(l => l.id === id);
const r1 = v => Math.round(v * 10) / 10;
const P = poly => poly.map(([x, z]) => [r1(x), r1(z)]);
const near = poly => poly.some(([x, z]) => x > -520 && x < 30 && z > -280 && z < 30);

// ---------- 现状 ----------
const groundIds = ['P1', 'H', 'A', 'P1C', 'P1S', 'P1E', 'P1E2', 'P1W1', 'P1W2', 'P1W3', 'P1W4'];
const buildings = groundIds.map(id => {
  const levels = before.levels.filter(l => l.building === id && l.elev >= 0);
  const g = levels.find(l => l.short === '1F') || levels[0];
  const roof = Math.max(...levels.map(l => l.elev + (l.kind === 'roof' ? 0 : l.height)));
  return { id, name: before.buildings.find(b => b.id === id).name, floors: levels.filter(l => l.kind !== 'roof').length,
    roof: r1(roof), ground: P(g.outline), top: P(levels.at(-1).expansion?.facadePoly || levels.at(-1).outline) };
});
const stallsOf = L => ({
  'P1-B1': level(L, 'P1-B1').parking.stalls.length, 'P1-B2': level(L, 'P1-B2').parking.stalls.length,
  'WPG-B1': level(L, 'WPG-B1').parking.stalls.length, 'WPG-B2': level(L, 'WPG-B2').parking.stalls.length,
  westSurface: L.site.westParking.stallCount,
  hotelSurface: L.extensions.surfaceParking.find(l => l.id === 'hotel-shared-parking')?.stalls.length || 0,
});
const stalls = stallsOf(before), stallsAfter = stallsOf(after);
const existingRamps = before.ramps.filter(r => r.sharedGarage || ['H', 'A', 'WPG', 'P1'].includes(r.building))
  .map(r => ({ id: r.id, type: r.type, name: r.name, building: r.building, poly: P(r.poly), width: r.width,
    from: { x: r1(r.from.x), z: r1(r.from.z), y: r.from.y, level: r.from.level },
    to: { x: r1(r.to.x), z: r1(r.to.z), y: r.to.y, level: r.to.level } }));
const kiosks = before.levels.flatMap(l => (l.garageKiosks || []).map(k => ({ id: k.id, level: l.id, poly: P(k.poly) })));
const west = before.site.westParking;
const metroTunnel = level(before, 'M-B1').slab.pieces.map(p => p.outer).filter(p => near(p) && polyBounds(p).x0 < -10).map(P);
const metroExits = before.entrances.filter(e => e.building === 'M' && e.to === 'site').map(e => ({ id: e.id, name: e.name,
  seg: [[r1(e.seg.x0), r1(e.seg.z0)], [r1(e.seg.x1), r1(e.seg.z1)]] }));
const bridges = before.extensions.paths.filter(p => p.kind === 'skybridge' && p.expansion).map(p => ({ id: p.id, polys: p.polys.map(P) }));
const ring = before.bridges.links.filter(l => l.id === 'L-P1').map(l => P(l.poly));
const roads = before.site.roads.filter(r => near(r.poly)).map(r => ({ id: r.id, name: r.name, poly: P(r.poly), lanes: r.lanes || null }));

// ---------- 本方案：车行口（读自实际生成的坡道与道路） ----------
const STREET = { 方庭北口: '北外环', 星湾东口: '星湾路' };
const garage = P1_GARAGE_RAMPS.map(d => {
  const r = after.ramps.find(x => x.id === d.id), s = r.from.level === 'street' ? r.from : r.to, low = s === r.from ? r.to : r.from;
  const len = Math.hypot(low.x - s.x, low.z - s.z);
  return { id: r.id, name: r.name, street: STREET[r.quadrant], side: d.out ? 'out' : 'in', width: r.width,
    from: [r1(s.x), r1(s.z)], to: [r1(low.x), r1(low.z)], length: r1(len), slope: Math.round(-low.y / len * 1000) / 10,
    poly: P(r.poly), open: P(r.groundOpening) };
});
const NOTES = {
  'P1-N-apron': '北外环右进右出 · 12m 车道转入', 'P1-E-apron': '星湾路右进右出',
  'P1-N-arrival': '接 B1 北环通道与纵向车道', 'P1-E-arrival': 'B1 南缘到达车道', 'P1-E-arrival-west': '西转接 z=-39 通道',
};
const garageAprons = P1_GARAGE_APRONS.map(a => ({ id: a.id, poly: P(rectPoly(a.rect)), note: NOTES[a.id] }));
const garageArrivals = P1_GARAGE_ARRIVALS.map(a => ({ id: a.id, poly: P(rectPoly(a.rect)), note: NOTES[a.id] }));
const westGates = WEST_LOT_GATES.map(g => {
  const road = after.site.westParking.roads.find(r => r.id === `west-gate-${g.id}`);
  return { id: g.id, name: g.name, street: g.street < -100 ? '北环（西延）' : '云澜大道（西延）', x: g.x, z: g.z, width: road.width, poly: P(road.polys[0]) };
});

// ---------- 本方案：造型与景观（读自屋面要素与 layout.fidelity） ----------
const rf = level(after, 'P1-RF'), feature = t => rf.features.find(f => f.type === t), D = after.fidelity.landscape;
const dome = feature('art-dome'), canopy = feature('glass-canopy'), canyon = feature('canyon-skylight');
const annex = id => level(after, `${id}-RF`).features;
const design = {
  dome: { id: dome.id, name: dome.name, cx: dome.cx, cz: dome.cz, radius: dome.radius, spring: r1(rf.elev + dome.spring), rise: dome.rise,
    apex: r1(rf.elev + dome.spring + dome.rise), columns: P(dome.columnsAt) },
  squareRoof: { id: canopy.id, name: canopy.name, rect: canopy.rect, eave: r1(rf.elev + canopy.eave), ridge: r1(rf.elev + canopy.ridge), columns: P(canopy.columnsAt) },
  canyon: { id: canyon.id, name: canyon.name, poly: P(lrectPoly(canyon.frame, canyon.rect)), removed: ['ferris', 'ferris-platform'] },
  relocate: ['cinema-open', 'viewdeck'].map(type => ({ type, to: feature(type).rect })),
  roofGarden: { planters: rf.features.filter(f => f.type === 'planter-bed').length, cafes: rf.features.filter(f => f.type === 'cafe-cluster').length },
  annexRoofs: [
    ...annex('P1C').filter(f => f.type === 'glass-pavilion').map(f => ({ id: 'P1C', type: f.type, rect: f.rect })),
    ...annex('P1S').filter(f => f.type === 'timber-lattice').map(f => ({ id: 'P1S', type: f.type, rect: f.rect })),
    ...Object.keys(CREATIVE_ROOFS).map(id => { const lv = level(after, `${id}-RF`), f = lv.features.find(f => f.type === 'creative-roof');
      return { id, type: f.type, style: f.style, rect: f.rect, cover: Math.round((f.rect.x1 - f.rect.x0) * (f.rect.z1 - f.rect.z0) / Math.abs(polyArea(lv.slab.pieces[0].outer)) * 100) }; }),
  ],
  billboards: after.fidelity.billboards.map(b => ({ id: b.id, title: b.title, face: P(b.face), width: r1(b.width), y0: b.y0, y1: b.y1 })),
  courtyards: D.fountains.map(f => ({ id: f.id, name: f.name, x: f.x, z: f.z, r: f.r, sculpture: f.sculpture })),
  sculpture: D.sculpture,
  hotelLoop: { ...D.hotelLoop, poly: undefined, planterPoly: P(D.hotelLoop.planterPoly), stallsBefore: stalls.hotelSurface, stallsAfter: stallsAfter.hotelSurface },
  seSteps: { id: D.steps.id, name: D.steps.name, poly: P(D.steps.poly), tiers: D.steps.tiers },
  trees: D.trees.map(t => [r1(t.x), r1(t.z)]),
  treeBelts: { avenue: D.trees.filter(t => t.z === -21.4).length, xingwan: D.trees.filter(t => t.x === -18.6).length },
};

function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; a += x0 * z1 - x1 * z0; } return a / 2; }

const out = {
  generated: new Date().toISOString().slice(0, 10), plot: rect(-286, -256, -16, -20),
  roads, buildings, stalls, stallsAfter, existingRamps, kiosks, metroTunnel, metroExits, bridges, ring,
  sunken: P(before.expansion.sunkenCourt.poly),
  b1Deck: polyBounds(level(before, 'P1-B1').outline), wpgDeck: polyBounds(level(before, 'WPG-B1').outline),
  west: { bounds: west.rect, gates: west.gates, roads: west.roads.map(r => ({ id: r.id, polys: r.polys.map(P) })),
    lots: west.lots.map(l => ({ id: l.id, rect: l.rect })), walks: west.walks.map(w => ({ id: w.id, polys: w.polys.map(P) })),
    transit: P(before.site.transitCenter.poly) },
  proposal: { garage, garageAprons, garageArrivals, westGates, design },
};
writeFileSync(join(here, 'design-data.json'), JSON.stringify(out));
console.log(JSON.stringify({ stalls, stallsAfter, newRamps: garage.map(g => [g.id, g.length, g.slope]), westGates: westGates.map(g => g.id),
  roofGarden: design.roofGarden, creative: design.annexRoofs.filter(a => a.cover).map(a => [a.id, a.cover]), trees: design.treeBelts }));
