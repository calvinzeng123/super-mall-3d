// 云澜江景台：一期 3F（+12.0 m）沿方庭北立面与 P1C 的江景露台和两座玻璃挑台（游览布局）。
// 在 applyP1Fidelity 与北苑之后、applyP1Finishes 之前运行，露台按室外铺装。
// 北苑消防登高面前方露台进深不超过 4 m（GB 50016 §7.2.1），登高场地上空不建任何东西。
import clipping from 'polygon-clipping';
import { IDENTITY, rect, rectPoly, polyBounds, polyArea } from './geom.js';
import { expansionFacadeWalls } from './p1-expansion.js';
import { NORTH_SITE } from './community-sites.js';

export const RIVER_TERRACE = Object.freeze({
  level: 'P1-3F', elev: 12.0,
  x0: -280, x1: -153,          // 方庭 north facade up to P1C
  facade: -240,
  band: -244,                  // ≤ 4 m in front of a tower fire frontage
  deck: -252,                  // 12 m deep elsewhere
  prow: -255.5,                // glass prows stop 0.5 m short of the plot line z = -256
  deckMin: 10,                 // free intervals narrower than this keep only the band
  prowWidth: 16, prowInset: 4, prowMin: 6,   // prow width = min(16, w − 4); skipped below 6 m
  frontageMargin: 1,
  p1c: Object.freeze({ level: 'P1C-3F', x1: -105, z: -254, door: Object.freeze({ x0: -131.2, x1: -126.8 }) }),
});
const T = RIVER_TERRACE;
const ring = p => [...p, p[0]];
const piecesOf = res => res.map(p => ({ outer: p[0].slice(0, -1), holes: p.slice(1).map(h => h.slice(0, -1)) }));
const pieceArea = p => Math.abs(polyArea(p.outer)) - p.holes.reduce((s, h) => s + Math.abs(polyArea(h)), 0);
const rectArea = r => (r.x1 - r.x0) * (r.z1 - r.z0);

/** Fire frontages and hardstands of the 北苑 towers; NORTH_SITE until the tower records exist. */
export function riverTerraceFrontages(layout) {
  const towers = layout.buildings.filter(b => b.community === 'north' && b.fireFrontage);
  if (towers.length) return {
    frontages: towers.map(b => [...b.fireFrontage]),
    hardstands: towers.map((b, i) => b.hardstand ? { ...b.hardstand } : { ...NORTH_SITE.towers[i]?.hardstand }).filter(h => Number.isFinite(h.x0)),
  };
  return { frontages: NORTH_SITE.towers.map(t => [...t.plate]), hardstands: NORTH_SITE.towers.map(t => ({ ...t.hardstand })) };
}

/** x-intervals of [x0,x1] that are not within margin of a fire frontage. */
export function freeIntervals(frontages, x0 = T.x0, x1 = T.x1, margin = T.frontageMargin) {
  let out = [[x0, x1]];
  for (const [a, b] of frontages) out = out.flatMap(([c, d]) => {
    const lo = a - margin, hi = b + margin;
    if (hi <= c || lo >= d) return [[c, d]];
    return [[c, Math.min(d, lo)], [Math.max(c, hi), d]].filter(([p, q]) => q - p > 0.5);
  });
  return out.sort((p, q) => p[0] - q[0]);
}

export function riverTerraceGeometry(layout, frontages = riverTerraceFrontages(layout).frontages, hardstands = []) {
  const p1c3 = layout.levels.find(l => l.id === T.p1c.level);
  const free = freeIntervals(frontages);
  const parts = [rectPoly(rect(T.x0, T.band, T.x1, T.facade))], decks = [], prows = [];
  for (const [a, b] of free) {
    if (b - a < T.deckMin) continue;
    decks.push(rect(a, T.deck, b, T.facade));
    const w = Math.min(T.prowWidth, b - a - T.prowInset), c = (a + b) / 2;
    if (w >= T.prowMin) prows.push(rect(c - w / 2, T.prow, c + w / 2, T.deck));
  }
  const p1cDeck = rect(T.x1, T.p1c.z, T.p1c.x1, T.facade);
  parts.push(...decks.map(rectPoly), rectPoly(p1cDeck));
  let poly = clipping.union(...parts.map(p => [ring(p)]));
  if (p1c3) poly = clipping.difference(poly, ...p1c3.slab.pieces.map(s => [ring(s.outer)]));
  // Never over a fire hardstand, whatever the frontages say.
  if (hardstands.length) poly = clipping.difference(poly, ...hardstands.map(h => [ring(rectPoly(h))]));
  const pieces = piecesOf(poly);
  const overHardstand = r => hardstands.some(h => r.x0 < h.x1 && r.x1 > h.x0 && r.z0 < h.z1 && r.z1 > h.z0);
  const glass = prows.filter(r => !overHardstand(r)).map((r, i) => ({ id: `RT-PROW-${i + 1}`, rect: r, poly: rectPoly(r), glassFloor: true, area: rectArea(r) }));
  const area = pieces.reduce((s, p) => s + pieceArea(p), 0), prowArea = glass.reduce((s, p) => s + p.area, 0);
  return { pieces, decks, p1cDeck, free, prows: glass, area, prowArea, total: area + prowArea };
}

export function applyRiverTerrace(layout) {
  const lv = layout.levels.find(l => l.id === T.level);
  if (!lv?.expansion || lv.riverTerrace) return layout;
  const { frontages, hardstands } = riverTerraceFrontages(layout);
  const geo = riverTerraceGeometry(layout, frontages, hardstands);
  // Stone deck: real slab, outdoor walk and terrace (paving, railings and furniture come with it).
  // terrace.floorPolys may alias expansion.terraces; never set terrace.pieces (it would hide the others).
  const X = lv.expansion, lists = [...new Set([X.terraces, X.terrace?.floorPolys, X.floorPolys ||= []].filter(Boolean))];
  for (const [i, p] of geo.pieces.entries()) {
    lv.slab.pieces.push({ outer: p.outer, holes: p.holes, riverTerrace: true });
    lv.walk.push({ id: `${lv.id}-river-terrace-${i}`, kind: 'deck', frame: IDENTITY, lpoly: p.outer, poly: p.outer, outdoor: true, riverTerrace: true });
    for (const list of lists) list.push(p.outer);
  }
  // Glass prows are nav-only surfaces: walkable, but no stone slab, paving or slab edge under them.
  // Not in extensions.paths: render/build/hospitality.js connections() would draw them as corridors.
  for (const pr of geo.prows) (lv.navSurfaces ||= []).push({ id: pr.id, kind: 'glass-deck', outer: pr.poly, holes: [], riverTerrace: true });
  // P1C 3F north door onto the terrace: a portal pair, aligned with the 1F P1C-N door.
  const p1c3 = layout.levels.find(l => l.id === T.p1c.level);
  let door = null;
  if (p1c3?.expansion) {
    const zf = polyBounds(p1c3.expansion.facadePoly).z0;
    const seg = { x0: T.p1c.door.x0, z0: zf, x1: T.p1c.door.x1, z1: zf };
    const base = { width: seg.x1 - seg.x0, extension: true, name: '云澜江景台入口', riverTerrace: true };
    layout.entrances.push({ ...base, building: 'P1C', id: 'P1C-3F-river-terrace', level: p1c3.id, to: lv.id, seg, nx: 0, nz: -1 });
    layout.entrances.push({ ...base, building: lv.building, id: 'P1-3F-river-terrace-p1c', level: lv.id, to: p1c3.id, seg: { ...seg }, nx: 0, nz: 1 });
    // Facade collision was baked at the end of applyP1Expansion: re-cut it for the new door.
    p1c3.navWalls = (p1c3.navWalls || []).filter(w => !w.facade).concat(expansionFacadeWalls(p1c3, layout.entrances));
    door = seg;
  }
  const total = Math.round(geo.total).toLocaleString('en-US');
  // The labelled deck is the one nearest the 方庭北门 axis (the gap deck between T1 and T2).
  const axis = (NORTH_SITE.movedNorthDoor.x0 + NORTH_SITE.movedNorthDoor.x1) / 2, mid = d => (d.x0 + d.x1) / 2;
  const gap = [...geo.decks].sort((a, b) => Math.abs(mid(a) - axis) - Math.abs(mid(b) - axis))[0] || geo.p1cDeck;
  lv.features.push({ type: 'river-terrace', frame: IDENTITY, rect: { ...gap }, x: (gap.x0 + gap.x1) / 2, z: (gap.z0 + gap.z1) / 2,
    name: '云澜江景台', en: 'YUNLAN RIVER TERRACE', riverTerrace: true, pickInfo: ['云澜江景台', `3F 江景露台 · ${total}㎡ · 玻璃眺台`] });
  for (const d of geo.decks.filter(d => d !== gap).concat(geo.p1cDeck))
    lv.features.push({ type: 'river-terrace', frame: IDENTITY, rect: { ...d, z1: d === geo.p1cDeck ? -246 : d.z1 }, riverTerrace: true, pickInfo: ['云澜江景台', `3F 江景露台 · ${total}㎡ · 玻璃眺台`] });
  for (const p of geo.prows) lv.features.push({ type: 'glass-prow', frame: IDENTITY, rect: { ...p.rect }, id: p.id, riverTerrace: true,
    pickInfo: ['江景台玻璃挑台', `悬挑玻璃地面 · ${Math.round(p.area)}㎡ · 俯瞰云澜江与星湾桥`] });
  lv.riverTerrace = { ...geo, frontages, hardstands, adjoins: p1c3 ? [p1c3.id] : [], door,
    name: '云澜江景台', en: 'YUNLAN RIVER TERRACE' };
  return layout;
}
