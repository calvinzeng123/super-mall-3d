// Concept A fidelity (tour only): roof-level forms read from the approved
// aerial. The 06 dome and the 01 square canopy stand on columns above the
// existing roof deck, so floors, tenants, cores and escalators are unchanged;
// their columns are the only new solids walkers meet on the roof.
import { IDENTITY, rect, rectPoly, toW, lrectPoly, polyBounds, pointInPoly, convexOverlap, polysOverlap, polySamples } from './geom.js';

export const ART_DOME = { id: 'P1-ART-DOME', cx: -106, cz: -106, radius: 30, spring: 4.2, rise: 15.5, columns: 12, columnRadius: .45 };
// Columns sit inside the 6F/RF setback cut (z=-180) and clear the escalator pavilion and cinema.
export const SQUARE_CANOPY = { id: 'P1-SQ-CANOPY', rect: rect(-258, -218, -192, -182), eave: 6.6, ridge: 11.2, columnRadius: .35 };
// North-wing axis in wing-local coordinates: a raised glazed ridge with trees either side.
export const NORTH_CANYON = { id: 'P1-N-CANYON', rect: rect(44, -3, 84, 3), trees: { from: 47, to: 82, step: 7, v: 5.5 } };

// Roof features carry their own wing/square frame; compare in world metres.
const near = (f, x, z, d = .5) => { if (f.lu === undefined) return false; const [wx, wz] = toW(f.frame, f.lu, f.lv); return Math.hypot(wx - x, wz - z) < d; };

export function domeColumns(d = ART_DOME) {
  // 30° spacing puts each wing axis (45°, 165°, 225°, 285°) midway between two columns.
  return Array.from({ length: d.columns }, (_, i) => {
    const a = i * 2 * Math.PI / d.columns;
    return [d.cx + d.radius * Math.cos(a), d.cz + d.radius * Math.sin(a)];
  });
}

export function canopyColumns(c = SQUARE_CANOPY) {
  const r = c.rect, out = [];
  for (let k = 0; k <= 6; k++) for (const z of [r.z0, r.z1]) out.push([r.x0 + (r.x1 - r.x0) * k / 6, z]);
  for (const x of [r.x0, r.x1]) for (const z of [-206, -194]) out.push([x, z]);
  return out;
}

export function applyP1Fidelity(layout) {
  const rf = layout.levels.find(l => l.id === 'P1-RF');
  const P1 = layout.buildings.find(b => b.id === 'P1');
  const wing = id => P1.wings.find(w => w.id === id);
  const W = wing('W'), N = wing('N');
  const dome = domeColumns(), canopy = canopyColumns();
  rf.features.push({ type: 'art-dome', frame: IDENTITY, ...ART_DOME, columnsAt: dome, name: '云澜光穹', en: 'YUNLAN ART DOME' });
  rf.features.push({ type: 'glass-canopy', frame: IDENTITY, ...SQUARE_CANOPY, columnsAt: canopy, name: '方庭玻璃天幕', en: 'SQUARE GLASS CANOPY' });
  // The concept aerial has no ferris wheel; its axis becomes the canyon skylight.
  rf.features = rf.features.filter(f => !['ferris', 'ferris-platform'].includes(f.type));
  rf.features.push({ type: 'canyon-skylight', frame: N.F, rect: NORTH_CANYON.rect, id: NORTH_CANYON.id, name: '北翼采光峡谷' });
  const t = NORTH_CANYON.trees;
  for (let u = t.from; u <= t.to; u += t.step) for (const v of [-t.v, t.v]) rf.features.push({ type: 'tree', frame: N.F, lu: u, lv: v });
  // Make room under and beside the new structures.
  const moved = { 'cinema-open': rect(-190, -222, -166, -190), viewdeck: rect(-239, -228, -213, -219.5) };
  for (const f of rf.features) {
    if (moved[f.type]) Object.assign(f, { frame: IDENTITY, rect: moved[f.type] });
    if (f.type === 'playground' && f.frame === W.F) f.rect = rect(33, -20, 45, -9);
  }
  const clear = [[-206, -182], [-230, -220], toW(W.F, 44, -9)];
  rf.features = rf.features.filter(f => !(f.type === 'tree' && clear.some(([x, z]) => near(f, x, z))));
  rf.navObstacles ||= [];
  for (const [x, z] of dome) rf.navObstacles.push({ id: `${ART_DOME.id}-column`, poly: rectPoly(rect(x - ART_DOME.columnRadius, z - ART_DOME.columnRadius, x + ART_DOME.columnRadius, z + ART_DOME.columnRadius)) });
  for (const [x, z] of canopy) rf.navObstacles.push({ id: `${SQUARE_CANOPY.id}-column`, poly: rectPoly(rect(x - SQUARE_CANOPY.columnRadius, z - SQUARE_CANOPY.columnRadius, x + SQUARE_CANOPY.columnRadius, z + SQUARE_CANOPY.columnRadius)) });
  // Pale stone pavers replace the orange timber deck; timber stays under seating.
  rf.theme = { ...rf.theme, floor: 'roof-stone', label: '天台花园 · 餐吧 · 云澜光穹' };
  planRoofGarden(rf, P1);
  for (const lv of layout.levels.filter(l => l.kind === 'roof' && l.expansion && l.building !== 'P1'))
    lv.theme = { ...lv.theme, floor: lv.expansion.zone === 'creative' ? 'wood-warm' : 'roof-stone' };
  layout.fidelity = { version: 1, dome: ART_DOME.id, canopy: SQUARE_CANOPY.id, canyon: NORTH_CANYON.id };
  layout.fidelity.billboards = placeBillboards(layout, P1);
  annexRoofs(layout);
  layout.fidelity.landscape = landscape(layout, P1);
  return layout;
}

/** Wing-end and square posters seen in the aerial; each hangs 0.6 m proud of a real
 * facade. Wing ends are flat for |v| ≤ 17; the W poster clears the hotel bridge
 * (v ±4) and the SE poster sits above the 3F LED screen. */
export const BILLBOARDS = [
  { id: 'W-end', wing: 'W', v0: -16.6, v1: -6.6, y0: 12.6, y1: 26.4, title: '云澜艺术季', sub: 'YUNLAN ART SEASON', a: '#5d3426', b: '#d9a24a' },
  { id: 'SE-end', wing: 'SE', v0: 6.6, v1: 16.6, y0: 17.8, y1: 31, title: '城市客厅', sub: 'CITY LIVING ROOM', a: '#1f3a34', b: '#c9a46a' },
  { id: 'SQ-south', x0: -279, x1: -269, z: -160, y0: 4, y1: 16, title: '方庭设计市集', sub: 'SQUARE DESIGN MARKET', a: '#3b2a17', b: '#e0b77a' },
];
function placeBillboards(layout, P1) {
  return BILLBOARDS.map(b => {
    if (b.wing) {
      const w = P1.wings.find(x => x.id === b.wing), v = (b.v0 + b.v1) / 2;
      const [x, z] = toW(w.F, w.uEnd + .6, v);
      return { ...b, x, z, nx: w.F.c, nz: w.F.s, width: b.v1 - b.v0, height: b.y1 - b.y0, face: lrectPoly(w.F, rect(w.uEnd - .01, b.v0, w.uEnd + .01, b.v1)) };
    }
    return { ...b, x: (b.x0 + b.x1) / 2, z: b.z + .6, nx: 0, nz: 1, width: b.x1 - b.x0, height: b.y1 - b.y0, face: rectPoly(rect(b.x0, b.z - .01, b.x1, b.z + .01)) };
  });
}

/** Annex roofs from the aerial: the 02 glass pavilion and garden, the 03 timber
 * lattice over rooftop dining and the 04 garden roofs. Lift cabs, stair rooms
 * and voids stay clear; lattice posts are navigation obstacles. */
function annexRoofs(layout) {
  const roof = id => layout.levels.find(l => l.id === `${id}-RF`);
  const blocksOf = lv => [...lv.rooms.flatMap(r => r.polys), ...lv.voids.map(v => grow(v.poly, .6)),
    ...layout.elevators.filter(e => e.serves.includes(lv.id)).map(e => rectPoly(rect(e.x - e.w / 2 - 1, e.z - e.d / 2 - 1, e.x + e.w / 2 + 1, e.z + e.d / 2 + 1)))];
  const fits = (lv, r, extra = []) => { const poly = rectPoly(r);
    return polySamples(grow(poly, .5), .7, .05).every(p => onRoof(lv, p)) && ![...blocksOf(lv), ...extra].some(b => convexOverlap(b, poly)); };
  const put = (lv, f, extra = []) => { if (!fits(lv, f.rect, extra)) return false; lv.features.push({ frame: IDENTITY, expansion: true, ...f }); return true; };
  const trees = (lv, pts) => { for (const [x, z] of pts) if (fits(lv, rect(x - 1, z - 1, x + 1, z + 1))) lv.features.push({ type: 'tree', frame: IDENTITY, lu: x, lv: z }); };
  const culture = roof('P1C'), dining = roof('P1S'), garden = roof('P1E'), house = roof('P1E2');
  // The pavilion opens south onto the lawn; its other three glass walls are nav walls.
  const pavilion = rect(-134, -238, -120, -229), pw = pavilion.x1 - pavilion.x0, pcx = (pavilion.x0 + pavilion.x1) / 2, pcz = (pavilion.z0 + pavilion.z1) / 2;
  const fittings = { tablesAt: [[pavilion.x0 + pw * .3, pcz - .8], [pavilion.x0 + pw * .7, pcz - .8]], counter: rect(pcx - pw * .225, pavilion.z0 + .35, pcx + pw * .225, pavilion.z0 + 1.05) };
  if (put(culture, { type: 'glass-pavilion', rect: pavilion, height: 5.4, name: '艺文馆屋顶玻璃亭', ...fittings })) {
    culture.navWalls = [[pavilion.x0, pavilion.z1, pavilion.x0, pavilion.z0], [pavilion.x0, pavilion.z0, pavilion.x1, pavilion.z0], [pavilion.x1, pavilion.z0, pavilion.x1, pavilion.z1]]
      .map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1 }));
    culture.navObstacles = [...tableObstacles('P1C-pavilion-table', fittings.tablesAt), { id: 'P1C-pavilion-counter', poly: rectPoly(fittings.counter) }];
  }
  put(culture, { type: 'lawn', rect: rect(-145, -227, -113, -217) });
  trees(culture, [[-128, -243], [-112, -229], [-140, -215.3], [-118, -215.3]]);
  const lattice = rect(-164, -56, -143, -35);
  const posts = [[lattice.x0, lattice.z0], [lattice.x1, lattice.z0], [lattice.x0, lattice.z1], [lattice.x1, lattice.z1], [(lattice.x0 + lattice.x1) / 2, lattice.z0], [(lattice.x0 + lattice.x1) / 2, lattice.z1]];
  if (put(dining, { type: 'timber-lattice', rect: lattice, height: 4.2, postsAt: posts, name: '南庭木构网格棚架' })) {
    dining.navObstacles = posts.map(([x, z]) => ({ id: 'P1S-lattice-post', poly: rectPoly(rect(x - .25, z - .25, x + .25, z + .25)) }));
    const postBlocks = dining.navObstacles.map(o => grow(o.poly, .4));
    for (const r of [rect(-161, -52, -154.5, -47.4), rect(-152.5, -52, -146, -47.4), rect(-161, -43.6, -154.5, -39), rect(-152.5, -43.6, -146, -39)]) {
      const f = cafe(IDENTITY, r);
      if (put(dining, f, postBlocks)) dining.navObstacles.push(...tableObstacles('P1S-cafe-table', f.tablesAt));
    }
  }
  put(garden, { type: 'lawn', rect: rect(-47, -151, -31, -138) });
  for (const r of [rect(-48, -136.6, -41.5, -132), rect(-38, -136.6, -31.5, -132)]) {
    const f = cafe(IDENTITY, r);
    if (put(garden, f)) garden.navObstacles = [...(garden.navObstacles || []), ...tableObstacles('P1E-cafe-table', f.tablesAt)];
  }
  trees(garden, [[-54, -151], [-29, -151], [-29, -141]]);
  put(house, { type: 'lawn', rect: rect(-48, -109, -36, -100.5) });
  trees(house, [[-52.5, -100.3], [-31, -103]]);
  creativeRoofs(layout, blocksOf);
}

/** 05 西里 pitched roofs on posts over about two thirds of each roof: W1/W3
 * gabled, W2/W4 north-light sawtooth. Eaves at 4.2 m clear the 3.8 m stair
 * bulkheads and lift cabs; the south strip stays an open terrace. */
export const CREATIVE_ROOFS = { P1W1: 'gable', P1W2: 'saw', P1W3: 'gable', P1W4: 'saw' };
function creativeRoofs(layout, blocksOf) {
  for (const [id, style] of Object.entries(CREATIVE_ROOFS)) {
    const lv = layout.levels.find(l => l.id === `${id}-RF`);
    if (!lv) continue;
    const b = polyBounds(lv.slab.pieces[0].outer), r = rect(b.x0 + 1.6, b.z0 + 1.6, b.x1 - 1.6, b.z1 - 3.6);
    const blocks = blocksOf(lv).map(p => grow(p, .3)), post = ([x, z]) => rectPoly(rect(x - .2, z - .2, x + .2, z + .2));
    const clear = p => polySamples(post(p), .2, .01).every(q => onRoof(lv, q)) && !blocks.some(k => convexOverlap(k, post(p)));
    const posts = [];
    for (let i = 0; i <= 3; i++) for (const z of [r.z0, r.z1]) {
      const x = r.x0 + (r.x1 - r.x0) * i / 3, p = [0, .8, -.8, 1.6, -1.6, 2.4, -2.4].map(dx => [x + dx, z]).find(clear);
      if (p) posts.push(p);
    }
    lv.features.push({ type: 'creative-roof', frame: IDENTITY, rect: r, style, eave: 4.2, rise: style === 'gable' ? 2.6 : 1.5, postsAt: posts, expansion: true });
    lv.navObstacles = [...(lv.navObstacles || []), ...posts.map(p => ({ id: `${id}-roof-post`, poly: post(p) }))];
  }
}

export const COURT_FOUNTAINS = [
  { id: 'court-north', name: '北庭艺术喷泉', x: -128, z: -184, r: 6, sculpture: 10 },
  { id: 'court-west', name: '西庭镜面水院', x: -188, z: -132, r: 5, sculpture: 8 },
];
const ellipsePoly = (x, z, a, b, n = 20) => Array.from({ length: n }, (_, i) => [x + a * Math.cos(i * 2 * Math.PI / n), z + b * Math.sin(i * 2 * Math.PI / n)]);
const circlePoly = (x, z, r, n = 20) => ellipsePoly(x, z, r, r, n);
// A café deck carries two round tables; table and chairs block a 1.15 m disc.
const TABLE_R = 1.15;
const cafe = (frame, r) => ({ type: 'cafe-cluster', frame, rect: r, expansion: true,
  tablesAt: [.27, .73].map(t => toW(frame, r.x0 + (r.x1 - r.x0) * t, (r.z0 + r.z1) / 2)) });
const tableObstacles = (id, tables) => tables.map(([x, z]) => ({ id, poly: circlePoly(x, z, TABLE_R, 10) }));

/** Ground landscape: court fountains with sculptures, the SE seating steps, street
 * tree belts, the sunken-court canopy sculpture and the hotel drop-off loop. */
function landscape(layout, P1) {
  const S = layout.site, fc = S.forecourt, SE = P1.wings.find(w => w.id === 'SE');
  // Building outlines are concave (the Y-shaped mall), so they get the exact test.
  const outlines = layout.buildings.filter(b => !b.undergroundOnly && b.kind !== 'metro').map(b => b.outline);
  const solids = [...S.trenches, ...S.openings, ...S.driveways, ...(S.crossings || []).map(c => c.poly),
    // The avenue belt is planted inside the south promenade, so that path is not a solid.
    ...fc.paths.filter(p => p.id !== 'south-promenade').flatMap(p => p.polys), ...fc.obstacles.map(o => o.poly),
    ...layout.extensions.paths.filter(p => p.kind === 'ground').flatMap(p => p.polys),
    ...layout.levels.flatMap(l => l.garageKiosks || []).map(k => k.poly),
    ...layout.entrances.filter(e => e.kiosk).map(e => e.kiosk.poly),
    ...layout.extensions.surfaceParking.map(l => l.poly), ...layout.bridges.supports.map(s => rectPoly(rect(s.x - 1.2, s.z - 1.2, s.x + 1.2, s.z + 1.2)))];
  const out = { fountains: [], steps: null, trees: [], sculpture: null, hotelLoop: null };
  const block = (id, poly) => fc.obstacles.push({ id, poly });
  for (const f of COURT_FOUNTAINS) { out.fountains.push({ ...f, poly: circlePoly(f.x, f.z, f.r + .4) }); block(f.id, circlePoly(f.x, f.z, f.r + .4)); }
  // Seating steps on the north-east half of the SE end face, clear of the main door and metro exit A.
  const steps = lrectPoly(SE.F, rect(SE.uEnd + 2, -21, SE.uEnd + 9, -10));
  out.steps = { id: 'SE-steps', name: '东南大台阶', frame: SE.F, rect: rect(SE.uEnd + 2, -21, SE.uEnd + 9, -10), tiers: 3, poly: steps };
  block('SE-steps', steps);
  const treeOk = (x, z) => { const p = rectPoly(rect(x - 1.3, z - 1.3, x + 1.3, z + 1.3));
    return !outlines.some(q => polysOverlap(q, p)) && !solids.some(q => convexOverlap(q, p)) && !out.fountains.some(f => convexOverlap(f.poly, p)) && !convexOverlap(steps, p); };
  for (let x = -276; x <= -60; x += 8) if (treeOk(x, -21.4)) out.trees.push({ x, z: -21.4, s: 1.05 });
  for (let z = -172; z <= -26; z += 8) if (treeOk(-18.6, z)) out.trees.push({ x: -18.6, z, s: 1.05 });
  for (const [u, v] of [[SE.uEnd + 13, -18], [SE.uEnd + 13, -11], [SE.uEnd + 19, -18], [SE.uEnd + 19, -11]]) { const [x, z] = toW(SE.F, u, v); if (treeOk(x, z)) out.trees.push({ x, z, s: 1.15 }); }
  for (const t of out.trees) block(`belt-tree-${t.x.toFixed(1)}-${t.z.toFixed(1)}`, rectPoly(rect(t.x - .45, t.z - .45, t.x + .45, t.z + .45)));
  // Tree-canopy sculpture beside the sunken amphitheatre (base stays on solid ground).
  out.sculpture = { id: 'sunken-canopy', name: '云伞', x: -108.5, z: -59.2, height: 11.5, crown: 7.5 };
  block('sunken-canopy', circlePoly(-108.5, -59.2, 1.1, 12));
  // Hotel forecourt: the parking aisle becomes the north leg of a drop-off loop
  // round an oval planter; only the south-row bays inside the loop give way, so
  // the north short-stay row and the west bays stay (still ≥20 stalls). The loop
  // stops 3 m short of the lot's east edge, where the lot sign and lamp stand.
  const lot = layout.extensions.surfaceParking.find(l => l.id === 'hotel-shared-parking');
  if (lot) {
    const loop = { id: 'H-dropoff', name: '酒店落客环岛', rect: rect(-235.2, -46, -216.7, -31.5), corner: 5, cx: -225.95, cz: -38.75, planter: [4.25, 2.25] };
    loop.poly = rectPoly(loop.rect);
    loop.planterPoly = ellipsePoly(loop.cx, loop.cz, loop.planter[0], loop.planter[1], 28);
    lot.stalls = lot.stalls.filter(s => !convexOverlap(s.poly, loop.poly));
    block('H-dropoff-planter', loop.planterPoly);
    out.hotelLoop = loop;
  }
  return out;
}

const grow = (p, d) => { const b = polyBounds(p); return rectPoly(rect(b.x0 - d, b.z0 - d, b.x1 + d, b.z1 + d)); };
const onRoof = (lv, p) => lv.slab.pieces.some(s => pointInPoly(p, s.outer) && !s.holes.some(h => pointInPoly(p, h)))
  && !lv.voids.some(v => pointInPoly(p, v.poly));

/** Planter beds along each wing edge and timber-decked café clusters, placed
 * only where the real roof deck is free: cores, skylights, lift lobbies, the
 * dome ring, the canopy, the canyon and every earlier roof feature are kept clear. */
function planRoofGarden(rf, P1) {
  const blocks = [
    ...rf.rooms.flatMap(r => r.polys), ...rf.voids.map(v => grow(v.poly, .6)),
    ...rf.units.flatMap(u => [...u.polys, ...(u.terrace ? [lrectPoly(u.frame, u.terrace)] : [])]),
    ...(rf.navObstacles || []).map(o => grow(o.poly, .6)),
    ...rf.features.flatMap(f => f.rect ? [grow(lrectPoly(f.frame, f.rect), .8)]
      : f.lu !== undefined ? [grow([toW(f.frame, f.lu, f.lv)], f.type === 'tree' ? 1.4 : f.type === 'ip' || f.type === 'letters' ? 3.5 : 2)] : []),
    // Glass lift vestibules drawn at each wing core.
    ...P1.wings.filter(w => w.core).map(w => lrectPoly(w.F, rect(w.core.u - 1, Math.min(w.core.band * 7.6, w.core.band * 3), w.core.u + 6.6, Math.max(w.core.band * 7.6, w.core.band * 3)))),
  ];
  const dome = ART_DOME, placed = [];
  const free = poly => polySamples(grow(poly, .6), .8, .05).every(p => onRoof(rf, p))
    && !poly.some(([x, z]) => Math.hypot(x - dome.cx, z - dome.cz) < dome.radius + 4.5)
    && !blocks.some(b => convexOverlap(b, poly)) && !placed.some(b => convexOverlap(b, poly));
  // Raised beds and café tables are solid: walkers go round them.
  const add = (f, poly) => {
    rf.features.push(f); placed.push(grow(poly, .5));
    rf.navObstacles.push(...(f.type === 'planter-bed' ? [{ id: 'P1-RF-planter', poly }] : tableObstacles('P1-RF-cafe-table', f.tablesAt)));
  };
  for (const w of P1.wings) {
    const u1 = (w.uEnd || 80) - 5;
    for (const s of [-1, 1]) for (let u = 38, i = 0; u + 4.2 < u1; u += 9, i++) {
      const r = rect(u, s * 19.3 - .75, u + 4.2, s * 19.3 + .75), poly = lrectPoly(w.F, r);
      if (free(poly)) add({ type: 'planter-bed', frame: w.F, rect: r, tree: i % 2 === 0, expansion: true }, poly);
    }
    for (const s of [-1, 1]) for (let u = 41; u + 6.5 < u1; u += 15) {
      const r = rect(u, s * 12 - 2.4, u + 6.5, s * 12 + 2.4), poly = lrectPoly(w.F, r);
      if (free(poly)) add(cafe(w.F, r), poly);
    }
  }
  // The square ring around the glass canopy: the dining terrace of the concept aerial.
  let n = 0;
  for (let z = -236; z <= -164 && n < 8; z += 9) for (let x = -272; x <= -166 && n < 8; x += 11) {
    const r = rect(x, z, x + 6.5, z + 4.6), poly = rectPoly(r);
    if (convexOverlap(grow(rectPoly(SQUARE_CANOPY.rect), 1.5), poly) || !free(poly)) continue;
    add(cafe(IDENTITY, r), poly); n++;
  }
}
