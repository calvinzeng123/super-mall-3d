// 云澜·北苑：一期北侧裙房屋面上的 T1/T2 一梯一户塔楼、穿过一期的独立核心筒与住户门禁（游览布局）。
// 一期手术：拆除核心筒所占铺位与 1F 住户大堂、方庭北门西移 8 m 至 SQ-N3、屋面让出两块塔楼底板，
// 被塔楼底板覆盖的商场电梯与楼梯止于 6F；B1/B2 设地库电梯厅；所有住户入口为刷卡门禁。
// 7F 空中大堂与一期天台同高：每栋朝两塔之间的一翼开南门（天台花园）与缝侧门（空中大堂前庭），
// 两门常开可穿堂而过，刷卡速通闸机后是候梯厅；前庭上方一道玻璃连廊雨棚连接两座大堂。
import { IDENTITY, rect, rectPoly, lseg, convexOverlap, clipConvex, pointInPoly, polyArea, distToPolyEdge } from './geom.js';
import { NORTH_SITE } from './community-sites.js';
import { northTowers } from './north-towers.js';
import { NORTH_ACCESS, addHostCore, addResidentsLobby, residentsStreetDoor, northAccessRecords, fillColumn, setRoomRects, clipWalkX,
  setWalkRect, clearStalls, exposedColumnFaces, skyLobbyAccessRecords } from './residential-access.js';

const CAPPED_LIFTS = ['P1-SQ-W-L1', 'P1-SQ-W-L2', 'P1-SQ-W-L3', 'P1-SQ-F1'];
const CAPPED_STAIRS = ['P1-SQ-ST-W', 'P1-SQ-ST-SV'];
const inside = (p, poly) => pointInPoly(p, poly) || distToPolyEdge(p, poly) < 1e-6;
const within = (P, poly) => P.every((q) => inside(q, poly));

export function applyNorthResidences(layout) {
  const byId = new Map(layout.levels.map((l) => [l.id, l]));
  const hosts = [...NORTH_SITE.hostDoorLevels, ...NORTH_SITE.hostPassLevels].map((id) => byId.get(id)).sort((a, b) => a.elev - b.elev);
  if (hosts.some((l) => !l)) return layout;
  const parts = northTowers(hosts);
  const removedUnits = [];
  const columns = Object.fromEntries(NORTH_SITE.towers.map((t) => [t.id, rect(t.core[0], -240, t.core[1], -224)]));

  // ---------- host levels: cores, lobbies, displaced shops and plant rooms ----------
  for (const lv of hosts) {
    const door = NORTH_SITE.hostDoorLevels.includes(lv.id);
    const gone = lv.units.filter((u) => u.polys.some((p) => Object.values(columns).some((c) => convexOverlap(p, rectPoly(c))))
      || (lv.short === '1F' && ['SQ-NW', 'SQ-N3'].includes(u.slot)));
    removedUnits.push(...gone.map((u) => u.id));
    lv.units = lv.units.filter((u) => !gone.includes(u));
    for (const part of parts) {
      const b = part.building, col = rectPoly(columns[b.id]);
      fillColumn(lv, col);
      addHostCore(lv, part, door);
      // Column faces outside the mall envelope (T2 in the 3F–6F notch) are clad as exterior.
      const faces = exposedColumnFaces(lv, col, b.id);
      if (faces.length) (lv.residentialCoreFaces ||= []).push(...faces);
      if (door) addResidentsLobby(lv, b);
    }
    if (lv.parking) garageSurgery(lv);
    if (lv.short === '3F' || lv.short === '4F') {
      const t = lv.walk.find((w) => w.id === `P1-${lv.short}-terrace-2`);
      if (t) clipWalkX(t, -Infinity, columns.T2.x0);
    }
    if (lv.short === '1F') moveNorthDoor(layout, lv);
  }

  // ---------- street doors, card gates and zones ----------
  for (const part of parts) {
    const { entrance, path } = residentsStreetDoor(part.building);
    layout.entrances.push(entrance);
    layout.extensions.paths.push(path);
    const { gates, zones } = northAccessRecords(part.building);
    layout.accessControl ||= { version: 1, zones: [], gates: [] };
    layout.accessControl.gates.push(...gates);
    layout.accessControl.zones.push(...zones);
    // 7F 空中大堂：两樘门通商场天台（同高门户），速通闸机进候梯厅
    const club = part.levels.find((l) => l.skyLobby);
    if (club) {
      layout.entrances.push(...part.entrances);
      const sky = skyLobbyAccessRecords(part.building, club);
      layout.accessControl.gates.push(...sky.gates);
      layout.accessControl.zones.push(...sky.zones);
    }
  }

  // ---------- P1 roof: the two plates replace the roof deck under the towers ----------
  const skyDoors = parts.flatMap((p) => p.entrances.filter((e) => e.skyLobby));
  const capped = capRoofVerticals(layout, byId.get('P1-RF'), parts, skyDoors);
  if (skyDoors.length) skyForecourt(byId.get('P1-RF'));

  // ---------- fire hardstands on the 北外环 frontage ----------
  layout.site.fireAccess ||= [];
  for (const t of NORTH_SITE.towers) layout.site.fireAccess.push({ id: `HS${t.id.slice(1)}`, tower: t.id, name: `云澜·北苑 ${t.id.slice(1)} 号楼消防登高场地`,
    rect: { ...t.hardstand }, poly: rectPoly(t.hardstand) });
  const hs = layout.site.fireAccess.filter((f) => f.tower).map((f) => f.poly);
  const clearOf = (o) => !hs.some((h) => convexOverlap(o.poly, h));
  for (const key of ['obstacles', 'furniture']) if (Array.isArray(layout.site.forecourt?.[key])) layout.site.forecourt[key] = layout.site.forecourt[key].filter((o) => !o.poly || clearOf(o));

  // ---------- tower records ----------
  for (const part of parts) {
    layout.buildings.push(part.building);
    layout.levels.push(...part.levels);
    layout.elevators.push(...part.elevators);
    layout.stairs.push(...part.stairs);
  }
  layout.northResidences = { towers: parts.map((p) => p.building.id), removedUnits, cappedVerticals: capped,
    hardstands: NORTH_SITE.towers.map((t) => `HS${t.id.slice(1)}`),
    skyLobbies: parts.flatMap((p) => p.levels.filter((l) => l.skyLobby).map((l) => l.id)) };
  return layout;
}

/** B1/B2: plant rooms reshaped round the cores and foyers, two aisles shortened, stalls cleared. */
function garageSurgery(lv) {
  const room = (id) => lv.rooms.find((r) => r.id === id);
  setRoomRects(room('SQ-EQ-1'), [rect(-280, -240, -270, -229)]);
  if (lv.short === 'B1') setRoomRects(room('SQ-EQ-3'), [rect(-226, -240, -221, -224)]);
  // SQ-EQ-4 moves into the corner west of the T2 column; two small plant rooms close the
  // pocket north of the T1 foyer and the strip east of the T2 column, so no public point
  // stands within reach of a residential lift through a wall (linksNear ignores walls).
  setRoomRects(room('SQ-EQ-4'), [rect(-221, -240, -216, -236.8)]);
  for (const [id, q] of [['SQ-EQ-1N', GARAGE_PLANT.T1], ['SQ-EQ-4E', GARAGE_PLANT.T2]])
    lv.rooms.push({ id, type: 'equip', label: '北苑核心筒旁设备间', frame: IDENTITY, rects: [q], polys: [rectPoly(q)], doors: [], wdoors: [] });
  for (const id of ['SQ-AN', `${lv.id}-shared-aisle-1-3`]) {
    const w = lv.walk.find((q) => q.id === id);
    if (w && !clipWalkX(w, GARAGE_PLANT.T2.x1)) lv.walk = lv.walk.filter((q) => q !== w);
  }
  const blocked = [...Object.values(NORTH_ACCESS).flatMap((A) => [A.band, A.foyer]),
    ...NORTH_SITE.towers.map((t) => rect(t.core[0], -240, t.core[1], -224)), ...Object.values(GARAGE_PLANT), rect(-221, -240, -216, -236.8)];
  lv.northStallsRemoved = clearStalls(lv, blocked);
  if (lv.parking) lv.parking.aisles = lv.walk.filter((w) => w.kind === 'aisle');
}
const GARAGE_PLANT = { T1: rect(-270, -240, -264, -236.8), T2: rect(-208, -239, -206.5, -233.6) };

/** 方庭北门 moves 8 m west into slot SQ-N3; its old hall becomes the T2 residents' lobby. */
function moveNorthDoor(layout, lv) {
  const d = NORTH_SITE.movedNorthDoor, e = layout.entrances.find((q) => q.id === d.id);
  if (e) {
    e.seg = lseg(IDENTITY, { x0: d.x0, z0: d.z, x1: d.x1, z1: d.z, side: 'N' });
    e.nx = 0; e.nz = -1; e.width = d.x1 - d.x0; e.moved = { from: [-224, -216], by: 'north-residences' };
  }
  const hall = lv.walk.find((w) => w.id === 'SQ-entN');
  if (hall) setWalkRect(hall, rect(d.x0, -240, d.x1, -224));
}

/**
 * 空中大堂前庭 on P1-RF between the two gap doors (HUD name), and the 连廊雨棚 over the walk
 * from door to door: glass hung from the two tower façades (tie rods to the 8F slab edge,
 * no posts, so no nav obstacles), south of the 4F–RF notch edge (z −228) and over no hardstand.
 */
export const SKY_FORECOURT = Object.freeze({ name: '云澜·北苑 空中大堂前庭', rect: rect(-242, -228, -228, -218) });
function skyForecourt(rf) {
  rf.skyForecourt = { name: SKY_FORECOURT.name, rect: { ...SKY_FORECOURT.rect } };
  rf.features.push({ type: 'sky-link-canopy', frame: IDENTITY, rect: rect(-242, -228, -228, -224.6), y: 4.3, name: '空中大堂连廊雨棚',
    pickInfo: ['空中大堂连廊雨棚', '连接北苑 1、2 号楼空中大堂 · 玻璃雨棚'] });
}

/**
 * P1-RF under the plates: the slab gives way to T-7F (holes clipped to the
 * roof outline), mall lifts and stairs below the plates stop at 6F, roof rooms,
 * walks and features under the plates go, and the farm and view deck move.
 * The plate edges are roof walls except at the 空中大堂 door spans (doors).
 */
function capRoofVerticals(layout, rf, parts, doors = []) {
  const plates = NORTH_SITE.towers.map((t) => rectPoly(rect(t.plate[0], -240, t.plate[1], -224)));
  const under = (P) => plates.some((pl) => within(P, pl));
  const hits = (P) => plates.some((pl) => convexOverlap(P, pl));
  // slab: drop nested holes and landing pieces under the plates, then cut the plates
  rf.slab.pieces = rf.slab.pieces.filter((p) => !under(p.outer));
  for (const p of rf.slab.pieces) {
    p.holes = p.holes.filter((h) => !under(h));
    for (const pl of plates) {
      if (!convexOverlap(p.outer, pl)) continue;
      const cut = clipConvex(p.outer, pl).filter((q, i, a) => !i || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 1e-6);
      if (cut.length >= 3 && Math.abs(polyArea(cut)) > .01) p.holes.push(cut);
    }
  }
  rf.voids = rf.voids.filter((v) => !under(v.poly));
  for (const id of CAPPED_LIFTS) { const e = layout.elevators.find((q) => q.id === id); if (e) e.serves = e.serves.filter((l) => l !== rf.id); }
  for (const id of CAPPED_STAIRS) { const s = layout.stairs.find((q) => q.id === id); if (s) s.serves = s.serves.filter((l) => l !== rf.id); }
  const P1 = layout.buildings.find((b) => b.id === 'P1');
  if (P1?.access) {
    const roofRun = (o) => CAPPED_STAIRS.includes(o.stair) && (o.to === rf.id || o.from === rf.id || o.id.startsWith(`${o.stair}-6F-RF`));
    for (const k of ['routes', 'flights', 'surfaces']) P1.access[k] = P1.access[k].filter((o) => !roofRun(o));
  }
  const goneRooms = ['SQ-coreW', 'SQ-freight', 'SQ-wcW', ...CAPPED_STAIRS];
  rf.rooms = rf.rooms.filter((r) => !goneRooms.includes(r.id));
  rf.walk = rf.walk.filter((w) => !['SQ-lobbyW-setback-0', 'SQ-lobbySV-setback-0', 'P1-RF-terrace-north-access'].includes(w.id));
  const np = rf.walk.find((w) => w.id === 'SQ-NP-setback-0'), ne = rf.walk.find((w) => w.id === 'SQ-NE-setback-0');
  if (np && !clipWalkX(np, -Infinity, NORTH_SITE.towers[1].plate[0])) rf.walk = rf.walk.filter((w) => w !== np);
  if (ne && !clipWalkX(ne, NORTH_SITE.towers[1].plate[1])) rf.walk = rf.walk.filter((w) => w !== ne);
  rf.walk = rf.walk.filter((w) => !under(w.poly));
  for (const f of rf.features) {
    if (f.type === 'farm') Object.assign(f, { frame: IDENTITY, rect: rect(-278, -222.5, -260, -211), movedBy: 'north-residences' });
    // Between the two sky lobbies, flush with the roof (nav walks it as level ground), 3.5 m clear of each façade.
    if (f.type === 'viewdeck') Object.assign(f, { frame: IDENTITY, rect: rect(-238.5, -228, -231.5, -221.5), movedBy: 'north-residences', flush: true });
  }
  rf.navObstacles = (rf.navObstacles || []).filter((o) => !hits(o.poly));
  rf.navWalls ||= [];
  // Plate edges are walls on the roof, except where a 空中大堂 door opens onto it.
  for (const P of plates) for (let i = 0; i < 4; i++) {
    const [a, b] = [P[i], P[(i + 1) % 4]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = (q) => ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / len;
    const off = (q) => Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) / len;
    let spans = [[0, len]];
    for (const d of doors) {
      const p = [d.seg.x0, d.seg.z0], q = [d.seg.x1, d.seg.z1];
      if (off(p) > 1e-6 || off(q) > 1e-6) continue;
      const [g0, g1] = [t(p), t(q)].sort((u, v) => u - v);
      spans = spans.flatMap(([u, v]) => [[u, Math.min(v, g0)], [Math.max(u, g1), v]]).filter(([u, v]) => v - u > 1e-6);
    }
    for (const [u, v] of spans) {
      const A = [a[0] + (b[0] - a[0]) * u / len, a[1] + (b[1] - a[1]) * u / len], B = [a[0] + (b[0] - a[0]) * v / len, a[1] + (b[1] - a[1]) * v / len];
      rf.navWalls.push({ x0: A[0], z0: A[1], x1: B[0], z1: B[1], towerPlate: true });
    }
  }
  rf.towerPlates = parts.map((p) => ({ building: p.building.id, poly: plates[parts.indexOf(p)] }));
  return [...CAPPED_LIFTS, ...CAPPED_STAIRS];
}
