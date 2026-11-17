// Phase-one vehicle access for the full tour (concept A fidelity pass).
// Two shared-garage ramp pairs reach P1-B1 straight from 北外环 and 星湾路;
// the west surface lot gains gates on its north and south streets. A ramp is
// open only until its surface is 3.05 m below grade; beyond that the plaza
// continues over a covered tunnel, as at the surveyed hotel and apartment gates.
import { IDENTITY, frame, rect, rectPoly, lrectPoly, toW, polyBounds, convexOverlap, pointInPoly } from './geom.js';
import { subtractRect } from './urban.js';

const DECK = 'P1-B1', DECK_Y = -8.4, OPEN_DEPTH = 3.05, SLAB_DEPTH = 4.1;

/** street: ground-level end; deck: arrival on P1-B1. gate.side puts the
 * ticket post and booth on the outer side of a paired lane. */
export const P1_GARAGE_RAMPS = [
  // 北口：北外环贴着地块的车道往东开。入口坡道口朝西（东行的车右转一把就下坡），在出口的上游；
  // 出口从方庭下面往东上来，右转并入东行车道。以前两条坡道口都朝东，进库要先右转再掉头 180°。
  { id: 'P1-N-IN', quadrant: '方庭北口', street: [-186, -252.75], deck: [-126, -252.75], width: 5.5, gate: { side: -1, booth: false, sign: -1 } },
  { id: 'P1-N-OUT', quadrant: '方庭北口', out: true, street: [-166, -246.75], deck: [-226, -246.75], width: 5.5, gate: { side: 1, booth: false, sign: 1 } },
  // 东口：两条坡道贴着星湾路西侧并排往南下。入口在西（x −24.5）、出口在东（x −19）：进车沿硬地往西开到头左转下坡，
  // 出车上来右转就到路边，两条轨迹不交叉（以前入口在东，进车左转时横穿出车的路线）。
  { id: 'P1-E-IN', quadrant: '星湾东口', street: [-24.5, -90.5], deck: [-24.5, -34.5], width: 5, gate: { side: -1, booth: true, sign: -1 } },
  { id: 'P1-E-OUT', quadrant: '星湾东口', out: true, street: [-19, -90.5], deck: [-19, -34.5], width: 5, gate: { side: 1, booth: false, sign: 1 } },
];
// Right-in/right-out aprons from the street edge to both lane heads.
export const P1_GARAGE_APRONS = [
  { id: 'P1-N-in-apron', street: '北外环', rect: rect(-192, -256, -186, -250) },
  // 出口的硬地是个「L」：入口坡道的敞开段到 x −164.2 才盖上，硬地在那以东才伸到路边
  { id: 'P1-N-apron', street: '北外环', rect: rect(-167, -250, -155, -244) },
  { id: 'P1-N-apron-street', street: '北外环', rect: rect(-164, -256, -155, -250) },
  { id: 'P1-E-apron', street: '星湾路', rect: rect(-27.3, -97.5, -10, -90.5) },
];
// Deck lanes joining each ramp foot to the existing aisle grid. The east foot
// turns west along the deck edge and meets the z=-39 aisle short of the SE stair core.
export const P1_GARAGE_ARRIVALS = [
  { id: 'P1-N-arrival', rect: rect(-240, -255.5, -226, -242.5) },
  { id: 'P1-N-in-arrival', rect: rect(-126, -255.5, -116, -250) },
  { id: 'P1-E-arrival', rect: rect(-27.3, -34.5, -16, -29) },
  { id: 'P1-E-arrival-west', rect: rect(-56, -36, -27.3, -29) },
];

// WP-G4 is also the 云澜·西苑 community gate; the former 北环东口 (x −375) would end on W2's north face.
export const WEST_LOT_GATES = [
  { id: 'WP-G4', name: '北环西口', x: -422, street: -256, lot: -246, z: -251 },
  { id: 'WP-G6', name: '大道口', x: -375, street: -14, lot: -37, z: -28 },
];

const seg = (F, u0, v0, u1, v1) => { const [x0, z0] = toW(F, u0, v0), [x1, z1] = toW(F, u1, v1); return { x0, z0, x1, z1 }; };

function addGarageRamps(layout) {
  const deck = layout.levels.find(l => l.id === DECK);
  const under = [];
  deck.navWalls ||= [];
  for (const d of P1_GARAGE_RAMPS) {
    const [sx, sz] = d.street, [dx, dz] = d.deck, len = Math.hypot(dx - sx, dz - sz);
    const F = frame(sx, sz, Math.atan2(dz - sz, dx - sx) * 180 / Math.PI, d.id);
    const half = d.width / 2, open = len * OPEN_DEPTH / -DECK_Y, deep = len * SLAB_DEPTH / -DECK_Y;
    const street = { x: sx, z: sz, y: 0, level: 'street' }, low = { x: dx, z: dz, y: DECK_Y, level: DECK };
    const lane = rect(0, -half, len, half), trench = lrectPoly(F, rect(0, -half, open, half));
    layout.ramps.push({
      id: d.id, building: 'P1', type: d.out ? 'street-out' : 'street-in', name: `${d.quadrant} ${d.out ? '出口' : '入口'}`,
      frame: F, lane, poly: lrectPoly(F, lane), width: d.width, from: d.out ? low : street, to: d.out ? street : low,
      sharedGarage: true, quadrant: d.quadrant, headroom: 2.8, groundOpening: trench, gate: d.gate,
      cover: { open, deep, length: len }, expansion: true,
    });
    layout.site.trenches.push(trench);
    // Where the slab drops into the deck storey nobody walks beneath it; the
    // low end stays open onto the arrival lane.
    under.push(lrectPoly(F, rect(deep, -half - .3, len, half + .3)));
    for (const v of [-half - .15, half + .15]) deck.navWalls.push(seg(F, deep, v, len - .2, v));
    deck.navWalls.push(seg(F, deep, -half - .15, deep, half + .15));
  }
  for (const a of P1_GARAGE_APRONS) layout.site.driveways.push(rectPoly(a.rect));
  const cuts = [...under, ...P1_GARAGE_ARRIVALS.map(a => rectPoly(a.rect))];
  deck.parking.stalls = deck.parking.stalls.filter(s => !cuts.some(c => convexOverlap(s.poly, c)));
  deck.parking.columns = deck.parking.columns.filter(c => !cuts.some(p =>
    convexOverlap(lrectPoly(c.frame, rect(c.lx - .4, c.lz - .4, c.lx + .4, c.lz + .4)), p)));
  // Shared aisles are world rectangles; trim them where a slab now stands.
  const blocked = under.map(polyBounds);
  deck.walk = deck.walk.flatMap(w => {
    if (!w.rect || w.frame !== IDENTITY || !blocked.some(b => convexOverlap(w.poly, rectPoly(b)))) return [w];
    let pieces = [w.rect];
    for (const b of blocked) pieces = pieces.flatMap(p => subtractRect(p, b));
    return pieces.filter(p => p.x1 - p.x0 >= 1.2 && p.z1 - p.z0 >= 1.2)
      .map((p, i) => ({ ...w, id: `${w.id}-ramp-${i}`, rect: p, poly: rectPoly(p) }));
  });
  for (const a of P1_GARAGE_ARRIVALS) deck.walk.push({ id: a.id, kind: 'aisle', frame: IDENTITY, rect: a.rect, poly: rectPoly(a.rect), dir: [1, 0] });
  deck.parking.aisles = deck.walk.filter(w => w.kind === 'aisle');
  layout.sharedGarages?.rampIds.push(...P1_GARAGE_RAMPS.map(d => d.id));
}

function addWestLotGates(layout) {
  const plan = layout.site.westParking, ext = layout.extensions;
  if (!plan) return;
  for (const g of WEST_LOT_GATES) {
    const r = rect(g.x - 3.5, Math.min(g.street, g.lot), g.x + 3.5, Math.max(g.street, g.lot)), poly = rectPoly(r);
    // With 云澜·西苑 on the north strip, G4 opens into the community: its 门楼 (community-site.js)
    // replaces the parking gantry, so the record carries no gantry posts.
    const community = plan.northStrip && g.id === 'WP-G4' ? { community: 'west-garden', posts: [] } : {};
    // Facing points from the gantry to the public street.
    plan.gates.push({ id: g.id, name: g.name, x: g.x, z: g.z, width: 7, facing: [0, Math.sign(g.street - g.lot)], ...community });
    layout.site.driveways.push(poly);
    const road = { id: `west-gate-${g.id}`, name: community.community ? '云澜·西苑 北门 · 城市道路接入' : '西侧停车场城市道路接入', width: 7, points: [[g.x, 0, g.street], [g.x, 0, g.lot]], polys: [poly] };
    ext.roads.push(road); plan.roads.push(road);
  }
}

/**
 * 并排的进出坡道里左右放反的几组（顺着进库方向看，入口应该在右手边）：住宅 R1、酒店、西侧公共车库北口。
 * 园区靠右行驶，放反的话进库右转的车和出库右转的车在路口交叉。坡道本身不动，只把入口 / 出口对调。
 */
export const KEEP_RIGHT_SWAPS = ['R1', 'H', 'WPG'];

/** 把 key-IN / key-OUT 两条坡道的角色对调（位置、宽度、岗亭侧向都跟着坡道本身，不跟着名字）。 */
function swapPair(layout, key) {
  const a = layout.ramps.find(r => r.id === `${key}-IN`), b = layout.ramps.find(r => r.id === `${key}-OUT`);
  if (!a || !b) return;
  for (const [r, out] of [[a, true], [b, false]]) {
    const street = r.from.level === 'street' ? r.from : r.to, low = street === r.from ? r.to : r.from;
    r.id = `${key}-${out ? 'OUT' : 'IN'}`;
    r.type = out ? 'street-out' : 'street-in';
    r.from = out ? low : street; r.to = out ? street : low;
    r.name = (r.name || '').replace(out ? '入口' : '出口', out ? '出口' : '入口');
  }
}

/**
 * 靠右行驶的出入口：对调放反的几组；公寓出口的硬地改成往东接星湾路（出坡道直行，右转并入南行车道——
 * 在北外环路口的驶离一侧），不再只接北外环、把出库的车送到路口停车线前。只在完整游览布局里做，紧凑 FPS 布局不动。
 */
function keepRightEntrances(layout) {
  for (const key of KEEP_RIGHT_SWAPS) swapPair(layout, key);
  const out = layout.ramps.find(r => r.id === 'A-OUT');
  if (out) {
    const s = out.from.level === 'street' ? out.from : out.to, half = out.width / 2;
    const old = layout.site.driveways.findIndex(d => pointInPoly([s.x + 2.5, s.z], d) && polyBounds(d).x1 < -10.5);
    if (old >= 0) layout.site.driveways[old] = rectPoly(rect(s.x, s.z - half, -10, s.z + half));
  }
}

export function applyP1VehicleAccess(layout) {
  addGarageRamps(layout);
  addWestLotGates(layout);
  keepRightEntrances(layout);
  return layout;
}
