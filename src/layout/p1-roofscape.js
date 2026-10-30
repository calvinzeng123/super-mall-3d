// Concept A roofscape (tour only): planter beds and café decks on the main
// roof, the annex roofs (02 glass pavilion, 03 timber lattice, 04 gardens) and
// the 05 西里 pitched roofs. Everything is placed only where the real roof deck
// is free; every solid item is also a navigation obstacle or wall.
import { IDENTITY, rect, rectPoly, toW, lrectPoly, polyBounds, boundsPoly, circlePoly, pointInPoly, convexOverlap, polySamples } from './geom.js';

// A café deck carries two round tables; table and chairs block a 1.15 m disc.
const TABLE_R = 1.15;
const cafe = (frame, r) => ({ type: 'cafe-cluster', frame, rect: r, expansion: true,
  tablesAt: [.27, .73].map(t => toW(frame, r.x0 + (r.x1 - r.x0) * t, (r.z0 + r.z1) / 2)) });
const tableObstacles = (id, tables) => tables.map(([x, z]) => ({ id, poly: circlePoly(x, z, TABLE_R, 10) }));
const onDeck = (lv, p) => lv.slab.pieces.some(s => pointInPoly(p, s.outer) && !s.holes.some(h => pointInPoly(p, h)))
  && !lv.voids.some(v => pointInPoly(p, v.poly));

/** Planter beds along each wing edge and timber-decked café clusters on the
 * main roof. Cores, skylights, lift lobbies, the dome ring, the square canopy
 * and every earlier roof feature are kept clear. */
export function planRoofGarden(rf, P1, { dome, canopy }) {
  const blocks = [
    ...rf.rooms.flatMap(r => r.polys), ...rf.voids.map(v => boundsPoly(v.poly, .6)),
    ...rf.units.flatMap(u => [...u.polys, ...(u.terrace ? [lrectPoly(u.frame, u.terrace)] : [])]),
    ...(rf.navObstacles || []).map(o => boundsPoly(o.poly, .6)),
    ...rf.features.flatMap(f => f.rect ? [boundsPoly(lrectPoly(f.frame, f.rect), .8)]
      : f.lu !== undefined ? [boundsPoly([toW(f.frame, f.lu, f.lv)], f.type === 'tree' ? 1.4 : f.type === 'ip' || f.type === 'letters' ? 3.5 : 2)] : []),
    // Glass lift vestibules drawn at each wing core.
    ...P1.wings.filter(w => w.core).map(w => lrectPoly(w.F, rect(w.core.u - 1, Math.min(w.core.band * 7.6, w.core.band * 3), w.core.u + 6.6, Math.max(w.core.band * 7.6, w.core.band * 3)))),
  ];
  const placed = [];
  const free = poly => polySamples(boundsPoly(poly, .6), .8, .05).every(p => onDeck(rf, p))
    && !poly.some(([x, z]) => Math.hypot(x - dome.cx, z - dome.cz) < dome.radius + 4.5)
    && !blocks.some(b => convexOverlap(b, poly)) && !placed.some(b => convexOverlap(b, poly));
  // Raised beds and café tables are solid: walkers go round them.
  rf.navObstacles ||= [];
  const add = (f, poly) => {
    rf.features.push(f); placed.push(boundsPoly(poly, .5));
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
  const covered = boundsPoly(rectPoly(canopy), 1.5);
  let n = 0;
  for (let z = -236; z <= -164 && n < 8; z += 9) for (let x = -272; x <= -166 && n < 8; x += 11) {
    const r = rect(x, z, x + 6.5, z + 4.6), poly = rectPoly(r);
    if (convexOverlap(covered, poly) || !free(poly)) continue;
    add(cafe(IDENTITY, r), poly); n++;
  }
}

/** Annex roofs from the aerial: the 02 glass pavilion and garden, the 03 timber
 * lattice over rooftop dining, the 04 garden roofs and the 05 pitched roofs.
 * Lift cabs, stair rooms and voids stay clear. */
export function planAnnexRoofs(layout) {
  const roof = id => layout.levels.find(l => l.id === `${id}-RF`);
  const blocksOf = lv => [...lv.rooms.flatMap(r => r.polys), ...lv.voids.map(v => boundsPoly(v.poly, .6)),
    ...layout.elevators.filter(e => e.serves.includes(lv.id)).map(e => rectPoly(rect(e.x - e.w / 2 - 1, e.z - e.d / 2 - 1, e.x + e.w / 2 + 1, e.z + e.d / 2 + 1)))];
  const fits = (lv, r, extra = []) => { const poly = rectPoly(r);
    return polySamples(boundsPoly(poly, .5), .7, .05).every(p => onDeck(lv, p)) && ![...blocksOf(lv), ...extra].some(b => convexOverlap(b, poly)); };
  const put = (lv, f, extra = []) => { if (!fits(lv, f.rect, extra)) return false; lv.features.push({ frame: IDENTITY, expansion: true, ...f }); return true; };
  const trees = (lv, pts) => { for (const [x, z] of pts) if (fits(lv, rect(x - 1, z - 1, x + 1, z + 1))) lv.features.push({ type: 'tree', frame: IDENTITY, lu: x, lv: z }); };
  const obstacles = (lv, list) => { lv.navObstacles = [...(lv.navObstacles || []), ...list]; };
  const culture = roof('P1C'), dining = roof('P1S'), garden = roof('P1E'), house = roof('P1E2');

  // 02: the pavilion opens south onto the lawn; its other three glass walls are nav walls.
  const pavilion = rect(-134, -238, -120, -229), pw = pavilion.x1 - pavilion.x0, pcx = (pavilion.x0 + pavilion.x1) / 2, pcz = (pavilion.z0 + pavilion.z1) / 2;
  const fittings = { tablesAt: [[pavilion.x0 + pw * .3, pcz - .8], [pavilion.x0 + pw * .7, pcz - .8]], counter: rect(pcx - pw * .225, pavilion.z0 + .35, pcx + pw * .225, pavilion.z0 + 1.05) };
  if (put(culture, { type: 'glass-pavilion', rect: pavilion, height: 5.4, name: '艺文馆屋顶玻璃亭', ...fittings })) {
    culture.navWalls = [[pavilion.x0, pavilion.z1, pavilion.x0, pavilion.z0], [pavilion.x0, pavilion.z0, pavilion.x1, pavilion.z0], [pavilion.x1, pavilion.z0, pavilion.x1, pavilion.z1]]
      .map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1 }));
    obstacles(culture, [...tableObstacles('P1C-pavilion-table', fittings.tablesAt), { id: 'P1C-pavilion-counter', poly: rectPoly(fittings.counter) }]);
  }
  put(culture, { type: 'lawn', rect: rect(-145, -227, -113, -217) });
  trees(culture, [[-128, -243], [-112, -229], [-140, -215.3], [-118, -215.3]]);

  // 03: timber lattice on six posts over four café decks (no umbrellas under it).
  const lattice = rect(-164, -56, -143, -35), mx = (lattice.x0 + lattice.x1) / 2;
  const posts = [[lattice.x0, lattice.z0], [lattice.x1, lattice.z0], [lattice.x0, lattice.z1], [lattice.x1, lattice.z1], [mx, lattice.z0], [mx, lattice.z1]];
  if (put(dining, { type: 'timber-lattice', rect: lattice, height: 4.2, postsAt: posts, name: '南庭木构网格棚架' })) {
    const postObstacles = posts.map(([x, z]) => ({ id: 'P1S-lattice-post', poly: rectPoly(rect(x - .25, z - .25, x + .25, z + .25)) }));
    obstacles(dining, postObstacles);
    const postBlocks = postObstacles.map(o => boundsPoly(o.poly, .4));
    for (const r of [rect(-161, -52, -154.5, -47.4), rect(-152.5, -52, -146, -47.4), rect(-161, -43.6, -154.5, -39), rect(-152.5, -43.6, -146, -39)]) {
      const f = cafe(IDENTITY, r);
      if (put(dining, f, postBlocks)) obstacles(dining, tableObstacles('P1S-cafe-table', f.tablesAt));
    }
  }

  // 04: garden roofs with a lawn, café decks and trees.
  put(garden, { type: 'lawn', rect: rect(-47, -151, -31, -138) });
  for (const r of [rect(-48, -136.6, -41.5, -132), rect(-38, -136.6, -31.5, -132)]) {
    const f = cafe(IDENTITY, r);
    if (put(garden, f)) obstacles(garden, tableObstacles('P1E-cafe-table', f.tablesAt));
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
    const blocks = blocksOf(lv).map(p => boundsPoly(p, .3)), post = ([x, z]) => rectPoly(rect(x - .2, z - .2, x + .2, z + .2));
    const clear = p => polySamples(post(p), .2, .01).every(q => onDeck(lv, q)) && !blocks.some(k => convexOverlap(k, post(p)));
    const posts = [];
    for (let i = 0; i <= 3; i++) for (const z of [r.z0, r.z1]) {
      // Slide a post along its eave line until it clears the stair and lift.
      const x = r.x0 + (r.x1 - r.x0) * i / 3, p = [0, .8, -.8, 1.6, -1.6, 2.4, -2.4].map(dx => [x + dx, z]).find(clear);
      if (p) posts.push(p);
    }
    lv.features.push({ type: 'creative-roof', frame: IDENTITY, rect: r, style, eave: 4.2, rise: style === 'gable' ? 2.6 : 1.5, postsAt: posts, expansion: true });
    lv.navObstacles = [...(lv.navObstacles || []), ...posts.map(p => ({ id: `${id}-roof-post`, poly: post(p) }))];
  }
}
