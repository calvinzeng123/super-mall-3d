// 从当前游戏布局导出一期现状几何，并登记本方案新增的车行口与造型要素。
// 用法（仓库根目录）：node docs/planning/2026-10-29-p1-concept-fidelity/export-design-data.mjs
// 输出同目录 design-data.json，供 draw-design.py 绘制总图与车行组织图。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLayout } from '../../../src/layout/layout.js';
import { rect, rectPoly, polyBounds, frame, lrectPoly, toW } from '../../../src/layout/geom.js';

const here = dirname(fileURLToPath(import.meta.url));
const layout = buildLayout();
const level = id => layout.levels.find(l => l.id === id);
const r1 = v => Math.round(v * 10) / 10;
const P = poly => poly.map(([x, z]) => [r1(x), r1(z)]);
const near = poly => poly.some(([x, z]) => x > -520 && x < 30 && z > -280 && z < 30);

// ---------- 现状 ----------
const groundIds = ['P1', 'H', 'A', 'P1C', 'P1S', 'P1E', 'P1E2', 'P1W1', 'P1W2', 'P1W3', 'P1W4'];
const buildings = groundIds.map(id => {
  const levels = layout.levels.filter(l => l.building === id && l.elev >= 0);
  const g = levels.find(l => l.short === '1F') || levels[0];
  const roof = Math.max(...levels.map(l => l.elev + (l.kind === 'roof' ? 0 : l.height)));
  return { id, name: layout.buildings.find(b => b.id === id).name, floors: levels.filter(l => l.kind !== 'roof').length,
    roof: r1(roof), ground: P(g.outline), top: P(levels.at(-1).expansion?.facadePoly || levels.at(-1).outline) };
});
const B1 = level('P1-B1'), B2 = level('P1-B2'), W1 = level('WPG-B1'), W2 = level('WPG-B2');
const stalls = { 'P1-B1': B1.parking.stalls.length, 'P1-B2': B2.parking.stalls.length,
  'WPG-B1': W1.parking.stalls.length, 'WPG-B2': W2.parking.stalls.length,
  westSurface: layout.site.westParking.stallCount,
  hotelSurface: layout.extensions.surfaceParking.find(l => l.id === 'hotel-shared-parking')?.stalls.length || 0 };
const existingRamps = layout.ramps.filter(r => r.sharedGarage || ['H', 'A', 'WPG', 'P1'].includes(r.building))
  .map(r => ({ id: r.id, type: r.type, name: r.name, building: r.building, poly: P(r.poly), width: r.width,
    from: { x: r1(r.from.x), z: r1(r.from.z), y: r.from.y, level: r.from.level },
    to: { x: r1(r.to.x), z: r1(r.to.z), y: r.to.y, level: r.to.level } }));
const kiosks = layout.levels.flatMap(l => (l.garageKiosks || []).map(k => ({ id: k.id, level: l.id, poly: P(k.poly) })));
const west = layout.site.westParking;
const metroTunnel = level('M-B1').slab.pieces.map(p => p.outer).filter(p => near(p) && polyBounds(p).x0 < -10).map(P);
const metroExits = layout.entrances.filter(e => e.building === 'M' && e.to === 'site').map(e => ({ id: e.id, name: e.name,
  seg: [[r1(e.seg.x0), r1(e.seg.z0)], [r1(e.seg.x1), r1(e.seg.z1)]] }));
const bridges = layout.extensions.paths.filter(p => p.kind === 'skybridge' && p.expansion).map(p => ({ id: p.id, polys: p.polys.map(P) }));
const ring = layout.bridges.links.filter(l => l.id === 'L-P1').map(l => P(l.poly));
const roads = layout.site.roads.filter(r => near(r.poly)).map(r => ({ id: r.id, name: r.name, poly: P(r.poly), lanes: r.lanes || null }));

// ---------- 本方案新增：车行口 ----------
// 共享地库坡道直接落到 P1-B1（-8.4m）；坡长与坡度按实际高差计算。
const ramp = (id, name, street, from, to, width, side) => {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]), deg = Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI;
  const F = frame(from[0], from[1], deg), drop = 8.4;
  return { id, name, street, side, width, from, to, length: r1(len), slope: Math.round(drop / len * 1000) / 10,
    poly: P(lrectPoly(F, rect(0, -width / 2, len, width / 2))),
    open: P(lrectPoly(F, rect(0, -width / 2, Math.min(len, len * 3.05 / drop), width / 2))) };
};
const garage = [
  ramp('P1-N-IN', '方庭北口 入口', '北外环', [-166, -252], [-226, -252], 5.5, 'in'),
  ramp('P1-N-OUT', '方庭北口 出口', '北外环', [-166, -246], [-226, -246], 5.5, 'out'),
  ramp('P1-E-IN', '星湾东口 入口', '星湾路', [-19, -90.5], [-19, -34.5], 5, 'in'),
  ramp('P1-E-OUT', '星湾东口 出口', '星湾路', [-24.5, -90.5], [-24.5, -34.5], 5, 'out'),
];
const garageAprons = [
  { id: 'P1-N-drive', poly: P(rectPoly(rect(-167, -256, -155, -243.25))), note: '北外环右进右出 · 12m 车道转入' },
  { id: 'P1-E-drive', poly: P(rectPoly(rect(-27.3, -97.5, -10, -90.5))), note: '星湾路右进右出 · 距云澜大道红线 70.5m' },
];
const garageArrivals = [
  { id: 'P1-N-arrival', poly: P(rectPoly(rect(-238, -255, -226, -243))), note: '接 B1 北环通道与 x=-237 纵向车道' },
  { id: 'P1-E-arrival', poly: P(rectPoly(rect(-64, -35, -16, -29))), note: 'B1 南缘到达车道，西接 x=-61 纵向车道' },
];
// 西侧地面停车场：北接城市北环（city-ring-west），南接云澜大道西延段。
const gate = (id, name, street, x, z, z0, z1) => ({ id, name, street, x, z, axis: 'x', width: 7,
  poly: P(rectPoly(rect(x - 3.5, z0, x + 3.5, z1))) });
const westGates = [
  gate('WP-G4', '北环西口', '北环（西延）', -422, -251, -256, -246),
  gate('WP-G5', '北环东口', '北环（西延）', -375, -251, -256, -246),
  gate('WP-G6', '大道口', '云澜大道（西延）', -375, -28, -37, -14),
];

// ---------- 本方案新增：造型与景观 ----------
const N = layout.buildings.find(b => b.id === 'P1').wings.find(w => w.id === 'N');
const canyon = P(lrectPoly(N.F, rect(44, -3, 84, 3)));
const design = {
  dome: { id: 'P1-ART-DOME', name: '云澜光穹', cx: -106, cz: -106, radius: 30, spring: 38.2, rise: 15.5, apex: 53.7,
    columns: Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return [r1(-106 + 30 * Math.cos(a)), r1(-106 + 30 * Math.sin(a))]; }) },
  squareRoof: { id: 'P1-SQ-CANOPY', name: '方庭玻璃天幕', rect: rect(-258, -218, -182, -182), eave: 40.6, ridge: 45.2 },
  canyon: { id: 'P1-N-CANYON', name: '北翼采光峡谷', poly: canyon, removed: ['ferris', 'ferris-platform'] },
  relocate: [
    { type: 'cinema-open', to: rect(-180, -234, -162, -202) },
    { type: 'viewdeck', to: rect(-239, -228, -213, -219.5) },
  ],
  courtyards: [
    { id: 'court-north', name: '北庭艺术喷泉', x: -128, z: -184, r: 6, sculpture: 10 },
    { id: 'court-west', name: '西庭镜面水院', x: -188, z: -132, r: 5, sculpture: 8 },
  ],
  hotelLoop: { id: 'H-dropoff', name: '酒店落客环岛', cx: -224, cz: -46, planter: [8.5, 4.5], road: 6, removesStalls: stalls.hotelSurface },
  seSteps: { id: 'SE-steps', name: '东南大台阶广场', along: [[-63.1, -30.3], [-30.3, -63.1]], offset: 9, tiers: 3 },
  treeBelts: [
    { id: 'avenue-belt', from: [-276, -21.4], to: [-60, -21.4], step: 8 },
    { id: 'xingwan-belt', from: [-18.6, -172], to: [-18.6, -26], step: 8 },
  ],
};

const out = {
  generated: new Date().toISOString().slice(0, 10), plot: rect(-286, -256, -16, -20),
  roads, buildings, stalls, existingRamps, kiosks, metroTunnel, metroExits, bridges, ring,
  sunken: P(layout.expansion.sunkenCourt.poly),
  b1Deck: polyBounds(B1.outline), wpgDeck: polyBounds(W1.outline),
  west: { bounds: west.rect, gates: west.gates, roads: west.roads.map(r => ({ id: r.id, polys: r.polys.map(P) })),
    lots: west.lots.map(l => ({ id: l.id, rect: l.rect })), walks: west.walks.map(w => ({ id: w.id, polys: w.polys.map(P) })),
    transit: P(layout.site.transitCenter.poly) },
  proposal: { garage, garageAprons, garageArrivals, westGates, design },
};
writeFileSync(join(here, 'design-data.json'), JSON.stringify(out));
console.log(JSON.stringify({ stalls, newRamps: garage.map(g => [g.id, g.length, g.slope]), westGates: westGates.map(g => g.id) }));
