// 云澜江：一期北侧横贯全图的城市河道（游览布局）。北外环以北是南岸滨江步道与亲水平台，
// 星湾路 x = 0 上是 146 m 系杆拱星湾桥，四条城市南北路上是梁桥，北岸是缓坡、芦苇和对岸滨江公园。
// 坐标为世界米制 [x, z]，北为 −z；河面 y = −5.0。
import { rect, rectPoly } from './geom.js';
import { subtractRect } from './urban.js';
import { NORTH_SITE } from './community-sites.js';

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

export const RIVER = deepFreeze({
  name: '云澜江', en: 'YUNLAN RIVER',
  render: { x0: -1500, x1: 1500 },     // the full grass plane (render/build/site.js)
  nav: { x0: -960, x1: 960 },          // just beyond site.bounds x[-940,940]
  south: {
    road: -268,                        // 北外环 north curb
    sidewalk: [-274, -268],            // tree verge + sidewalk
    cycle: [-281, -277.5],             // cycle track
    promenade: [-290, -274],           // 南岸滨江步道
    bankTop: -290,                     // flood wall + frameless glass railing, y = 0
    terrace: [-296, -290], terraceY: -2.6,   // 亲水平台 (visual only)
    revetment: [-300, -296],           // three stone steps down to the water
  },
  water: { z0: -412, z1: -300, y: -5.0, bed: -7.2 },
  north: {
    slope: [-436, -412],               // soft bank, water → y 0 (1:4.8)
    bankTop: -436,                     // low kerb + reed line
    greenway: [-452, -436],            // 北岸滨江绿道
    park: [-484, -452],                // 对岸滨江公园 (city park blocks)
    road: -500,                        // 滨江北路 (city-h-500)
  },
  // 星湾桥: single-span tied arch, flat deck at road level
  arch: { deckTop: -0.12, girderDepth: 1.7, soffit: -1.9, ribX: 17, ribWidth: 1.4, ribDepth: 2.0, rise: 30,
    segments: 28, hangerPitch: 6, hangerStart: 7, struts: [-14, 0, 14] },
  girder: { deckTop: -0.12, girderDepth: 2.2, soffit: -2.4, piers: [-339, -387], lampPitch: 30 },
  furniture: { treePitch: 12, secondRowPitch: 24, northPitch: 15, lampPitch: 24, benchPitch: 48, reedPitch: 6, reedHalf: 600 },
});
const CH = { z0: RIVER.north.bankTop, z1: RIVER.south.bankTop };   // channel between the bank tops
const GIRDER_NAMES = { 'city-v-890': '城西二桥', 'city-v-540': '城西桥', 'city-v540': '城东桥', 'city-v890': '城东二桥' };
// 方庭北门 axis (D3: the mall door moved 8 m west into SQ-N3)
export const RIVER_AXIS = (NORTH_SITE.movedNorthDoor.x0 + NORTH_SITE.movedNorthDoor.x1) / 2;

/** Every 'z' road crossing the channel gets a deck = carriageway + both 6 m sidewalks. */
function crossingsOf(site) {
  // 星湾路 is two records (campus xingwan z[-298,298] + city-xingwan-n) on the same x range.
  const groups = new Map();
  for (const r of site.roads.filter(r => r.dir === 'z' && r.rect.z0 < CH.z1 && r.rect.z1 > CH.z0)) {
    const key = `${r.rect.x0}:${r.rect.x1}`;
    if (!groups.has(key)) groups.set(key, { roads: [], carriage: { x0: r.rect.x0, x1: r.rect.x1 } });
    groups.get(key).roads.push(r.id);
  }
  return [...groups.values()].sort((a, b) => a.carriage.x0 - b.carriage.x0).map(g => ({ ...g,
    road: g.roads.find(id => id.startsWith('city-')) || g.roads[0],
    deck: rect(g.carriage.x0 - 6, CH.z0, g.carriage.x1 + 6, CH.z1) }));
}

const cut = (r0, list) => list.reduce((ps, c) => ps.flatMap(p => subtractRect(p, c)), [r0]);
const zr = (id, x0, x1, z0 = -268, z1 = -256, axis = 'z') => ({ id, rect: rect(x0, z0, x1, z1), poly: rectPoly(rect(x0, z0, x1, z1)), axis, river: true });
// Deterministic jitter, so tests and renders see the same furniture.
const jitter = (i) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s) - 0.5; };

export function addRiver(site) {
  const A = RIVER.arch, G = RIVER.girder, Fu = RIVER.furniture;
  const crossings = crossingsOf(site);
  const hero = crossings.find(c => c.road === 'city-xingwan-n');
  const bridges = crossings.map(c => c === hero ? {
    id: 'XW-BR', name: '星湾桥', en: 'XINGWAN BRIDGE', road: c.road, kind: 'tied-arch',
    roads: c.roads, carriage: c.carriage, deck: c.deck, walk: rect(c.deck.x0, CH.z0, c.deck.x1, CH.z1), span: CH.z1 - CH.z0,
    deckTop: A.deckTop, girderDepth: A.girderDepth, soffit: A.soffit,
    ribs: [{ x: -A.ribX }, { x: A.ribX }], ribWidth: A.ribWidth, ribDepth: A.ribDepth, rise: A.rise, hangerPitch: A.hangerPitch,
    abutments: [CH.z1, CH.z0], lookouts: [rect(-24, -369, -16, -357), rect(16, -369, 24, -357)],
  } : {
    id: `${c.road}-BR`, name: GIRDER_NAMES[c.road] || '城市桥', road: c.road, kind: 'girder',
    roads: c.roads, carriage: c.carriage, deck: c.deck, span: CH.z1 - CH.z0,
    deckTop: G.deckTop, girderDepth: G.girderDepth, soffit: G.soffit, piers: [...G.piers],
  });
  // South bank glass lookout on the 方庭北门 axis: at grade, cantilevered 6 m over the water.
  const ax = RIVER_AXIS;
  const lookoutS = { id: 'RV-LOOK-S', name: '江景玻璃眺台', en: 'RIVER GLASS LOOKOUT',
    rect: rect(ax - 16, -306, ax + 16, CH.z1), glass: rect(ax - 12, -306, ax + 12, -294) };
  // Ground nav: the channel is a hole except where a deck or lookout carries people.
  const solid = [...bridges.flatMap(b => [b.deck, ...(b.lookouts || [])]), lookoutS.rect];
  const navHoles = cut(rect(RIVER.nav.x0, CH.z0, RIVER.nav.x1, CH.z1), solid).map(rectPoly);

  // Campus sidewalks along 星湾路 from 北外环 onto the bridge (city sidewalks start at z = -298).
  const newSidewalks = [['sw-xw-nr', -16, -10], ['sw-xe-nr', 10, 16]].map(([id, x0, x1]) => {
    const r = rect(x0, -298, x1, RIVER.south.road); return { id, rect: r, poly: rectPoly(r), river: true };
  });
  // Promenades: the strips minus 'z' roads and every existing sidewalk, so nothing is paved twice.
  const roadsZ = site.roads.filter(r => r.dir === 'z').map(r => r.rect);
  const paved = [...site.sidewalks, ...(site.urban?.sidewalks || []), ...newSidewalks].map(s => s.rect);
  const S = RIVER.south, N = RIVER.north;
  const strip = (z0, z1) => cut(rect(RIVER.nav.x0, z0, RIVER.nav.x1, z1), [...roadsZ, ...paved]).sort((a, b) => a.x0 - b.x0 || a.z0 - b.z0);
  const pavilion = { id: 'RV-PAVILION', name: '观景亭', en: 'RIVER PAVILION', rect: rect(ax - 12, -449, ax + 12, -441),
    columns: [[ax - 11.5, -448.5], [ax + 11.5, -448.5], [ax - 11.5, -441.5], [ax + 11.5, -441.5]] };
  const promenades = [
    ...strip(S.promenade[0], S.road).map((r, i) => ({ id: `river-prom-s-${i}`, kind: 'promenade', bank: 'S', rect: r, poly: rectPoly(r), outdoor: true })),
    ...strip(N.greenway[0], N.greenway[1]).map((r, i) => ({ id: `river-prom-n-${i}`, kind: 'promenade', bank: 'N', rect: r, poly: rectPoly(r), outdoor: true })),
    { id: lookoutS.id, kind: 'lookout', bank: 'S', rect: lookoutS.rect, poly: rectPoly(lookoutS.rect), outdoor: true },
    ...bridges.filter(b => b.lookouts).flatMap(b => b.lookouts.map((r, i) => ({ id: `${b.id}-look-${i}`, kind: 'lookout', rect: r, poly: rectPoly(r), outdoor: true }))),
  ];
  // Zebras over 北外环 (P1 / R1–R4 to the promenade), over 城市外环西段 for 西苑, and over 星湾路 at the bridgehead.
  const crossingsNew = [
    zr('x-rn-sq', ax - 3, ax + 3), zr('x-rn-p1c', -132, -126), zr('x-rn-bt', -104, -98), zr('x-rn-r12', 79, 85), zr('x-rn-r34', 211, 217),
    zr('x-xw-river', -10, 10, -283, -277, 'x'), zr('x-rw-xy', -431, -425),
  ];
  site.crossings.push(...crossingsNew);
  site.sidewalks.push(...newSidewalks);
  site.walk.push(...newSidewalks.map(s => ({ id: s.id, kind: 'sidewalk', poly: s.poly, outdoor: true })),
    ...promenades.map(p => ({ id: p.id, kind: p.kind, poly: p.poly, outdoor: true })),
    ...crossingsNew.map(c => ({ id: c.id, kind: 'crossing', poly: c.poly, outdoor: true })));

  // Furniture is computed here so tests can check clearance; none of it blocks people.
  const decks = bridges.map(b => b.deck);
  const near = (x, list, pad) => list.some(r => x > r.x0 - pad && x < r.x1 + pad);
  const zebraX = crossingsNew.filter(c => c.axis === 'z').map(c => c.rect);
  const xs = (pitch, off = 0) => { const out = []; for (let x = RIVER.nav.x0 + off + pitch / 2; x < RIVER.nav.x1 - 4; x += pitch) out.push(x); return out; };
  const trees = [];
  for (const x of xs(Fu.treePitch)) if (!near(x, decks, 2.6) && !near(x, zebraX, 3)) trees.push({ x, z: -271.5, y: -0.14, s: 1.05 + jitter(x) * 0.2, kind: 'round', row: 'south' });
  // Second row skipped in front of the 方庭 terrace so its sightline to the water stays open.
  for (const x of xs(Fu.secondRowPitch, 6)) if (!near(x, decks, 2.6) && !(x >= -290 && x <= -100)) trees.push({ x, z: -285, y: -0.14, s: 1.15 + jitter(x + 1) * 0.2, kind: 'round', row: 'south-2' });
  for (const [i, x] of xs(Fu.northPitch).entries()) if (!near(x, decks, 2.6) && !near(x, [pavilion.rect], 3)) trees.push({ x, z: -447, y: -0.14, s: 1.2 + jitter(x + 2) * 0.25, kind: i % 3 === 2 ? 'cone' : 'round', row: 'north' });
  const lamps = [], benches = [];
  for (const x of xs(Fu.lampPitch)) {
    if (!near(x, decks, 2) && !near(x, [lookoutS.rect], 1.5)) lamps.push({ x, z: -288.6, y: -0.14, dir: [0, 1], h: 6, bank: 'S' });
    if (!near(x, decks, 2) && !near(x, [pavilion.rect], 1.5)) lamps.push({ x, z: -438, y: -0.14, dir: [0, -1], h: 6, bank: 'N' });
  }
  for (const x of xs(Fu.benchPitch)) if (!near(x, decks, 2) && !near(x, [lookoutS.rect], 2)) benches.push({ x, z: -287, y: -0.14, ry: Math.PI });
  for (const b of bridges) {
    if (b.kind === 'tied-arch') {
      for (let z = b.deck.z0 + 9; z < b.deck.z1; z += 18) for (const x of [b.deck.x0 + 0.8, b.deck.x1 - 0.8]) lamps.push({ x, z, y: A.deckTop, dir: [x < 0 ? 1 : -1, 0], h: 6, bridge: b.id });
      for (const r of b.lookouts) benches.push({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, y: A.deckTop, ry: r.x0 < 0 ? -Math.PI / 2 : Math.PI / 2, bridge: b.id });
    } else for (let z = b.deck.z0 + 15; z < b.deck.z1; z += G.lampPitch) for (const x of [b.deck.x0 + 0.8, b.deck.x1 - 0.8]) lamps.push({ x, z, y: G.deckTop, dir: [x < b.deck.x0 + 16 ? 1 : -1, 0], h: 6, bridge: b.id });
  }
  const reeds = [];
  for (let x = -Fu.reedHalf; x <= Fu.reedHalf; x += Fu.reedPitch) {
    if (near(x, decks, 3)) continue;
    reeds.push({ x: x + jitter(x) * 3, z: -414 + jitter(x + 5) * 3, s: 0.8 + (jitter(x + 9) + 0.5) * 0.5 });
  }
  // Only the pavilion columns block people; hangers stay outside the walk (none in the lookout openings).
  const obstacles = pavilion.columns.map(([x, z]) => ({ id: 'RV-PAVILION-col', poly: rectPoly(rect(x - 0.2, z - 0.2, x + 0.2, z + 0.2)) }));

  site.river = {
    ...RIVER,
    water: { ...RIVER.water, poly: rectPoly(rect(RIVER.render.x0, RIVER.water.z0 - 2, RIVER.render.x1, RIVER.water.z1)) },
    channel: rectPoly(rect(RIVER.render.x0, CH.z0, RIVER.render.x1, CH.z1)),
    axis: ax, navHoles, bridges, promenades, lookouts: [lookoutS], pavilion, obstacles,
    furniture: { trees, lamps, benches, reeds },
    sidewalks: newSidewalks.map(s => s.id), crossings: crossingsNew.map(c => c.id),
  };
  // Name the opposite-bank park blocks.
  for (const b of site.urban?.blocks || []) if (b.kind === 'park' && b.rect.z0 >= -486 && b.rect.z1 <= -450) b.name = '对岸滨江公园';
  return site.river;
}
