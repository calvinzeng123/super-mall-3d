// 住户独立核心筒穿过宿主楼层（一期 B2…6F）与刷卡门禁：核心筒用房、梯井、宿主楼层手术工具，
// 以及北苑住户大堂、地库电梯厅的走道、墙、礼宾台与门禁记录。坐标为世界米制。
import polygonClipping from 'polygon-clipping';
import { IDENTITY, rect, rectPoly, lrectPoly, lseg, toL, polyBounds, convexOverlap, pointInPoly, distToPolyEdge } from './geom.js';
import { gateRecord, zoneRecord, SPEED_LANES, SPEED_CABINETS } from './access-records.js';
import { NORTH_CORE, SKY_LOBBY, ringRects, coreRoom } from './north-towers.js';

const EPS = 1e-6;
export const wrect = (P) => { const b = polyBounds(P); return rect(b.x0, b.z0, b.x1, b.z1); };
const seg = (x0, z0, x1, z1, extra = {}) => ({ x0, z0, x1, z1, ...extra });
/** World rect → local rect of a deg-0 frame (all 方庭 records use F_SQ or the world frame). */
function localRect(F, r) {
  if (Math.abs(F.deg % 360) > EPS) throw new Error(`${F.id}: rotated frame`);
  return rect(r.x0 - F.ox, r.z0 - F.oz, r.x1 - F.ox, r.z1 - F.oz);
}
/** Replace a room's rects with world rects (kept in its own frame). */
export function setRoomRects(room, worldRects) {
  room.rects = worldRects.map((r) => localRect(room.frame, r));
  room.polys = room.rects.map((r) => lrectPoly(room.frame, r));
}
/** Replace a walk's area with a world rect (kept in its own frame). */
export function setWalkRect(w, r) {
  if (w.rect) { w.rect = localRect(w.frame || IDENTITY, r); w.poly = lrectPoly(w.frame || IDENTITY, w.rect); }
  else { w.poly = rectPoly(r); if (w.lpoly) w.lpoly = w.poly.map((p) => toL(w.frame || IDENTITY, ...p)); }
}
/** Keep the part of a walk with x in [x0, x1] (null when nothing remains). */
export function clipWalkX(w, x0 = -Infinity, x1 = Infinity) {
  const b = wrect(w.poly), r = rect(Math.max(b.x0, x0), b.z0, Math.min(b.x1, x1), b.z1);
  if (r.x1 - r.x0 < .3) return null;
  setWalkRect(w, r);
  return w;
}
/** Hole for poly in the slab piece that contains it. */
export function addHole(lv, poly) {
  const c = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
  const piece = lv.slab.pieces.find((p) => !p.stair && poly.every((q) => pointInPoly(q, p.outer)))
    || lv.slab.pieces.find((p) => !p.stair && pointInPoly(c, p.outer));
  if (!piece) throw new Error(`${lv.id}: no slab under residential core`);
  piece.holes.push(poly);
}

/**
 * Where the column stands partly outside the host slab (the T2 column in the
 * 4F–6F north notch), extend the host outline over it, so every shaft and
 * stair of the column lies inside one piece. Holes keep their identity.
 */
export function fillColumn(lv, column) {
  const main = lv.slab.pieces.find((p) => !p.stair && convexOverlap(p.outer, column));
  if (!main || column.every((q) => pointInPoly(q, main.outer) || distToPolyEdge(q, main.outer) < 1e-6)) return false;
  const snap = (v) => Math.round(v * 1e5) / 1e5;
  const ring = (P) => [...P, P[0]].map(([x, z]) => [snap(x), snap(z)]);
  const out = polygonClipping.union([ring(main.outer)], [ring(column)]);
  if (out.length !== 1) throw new Error(`${lv.id}: residential column does not join the slab`);
  const exact = (q) => main.outer.find((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-4) || q;
  main.outer = out[0][0].slice(0, -1).map(exact);
  main.filledColumn = true;
  return true;
}

/**
 * Faces of the column that stand outside the host's enclosed envelope (the T2
 * column in the 3F–6F north notch): world segments on the column outline with
 * the outward normal, for the exterior cladding drawn with the façade.
 */
export function exposedColumnFaces(lv, column, building) {
  const env = lv.expansion?.facadePolys || [lv.expansion?.facadePoly || lv.outline];
  const snap = (v) => Math.round(v * 1e5) / 1e5, ring = (P) => [...P, P[0]].map(([x, z]) => [snap(x), snap(z)]);
  const out = polygonClipping.difference([ring(column)], ...env.map((P) => [ring(P)]));
  const b = polyBounds(column), on = (v, a) => Math.abs(v - a) < 1e-4, faces = [];
  for (const poly of out) for (const r of poly) for (let i = 0; i + 1 < r.length; i++) {
    const [[x0, z0], [x1, z1]] = [r[i], r[i + 1]];
    if (Math.hypot(x1 - x0, z1 - z0) < .05) continue;
    const n = on(x0, x1) && on(x0, b.x0) ? [-1, 0] : on(x0, x1) && on(x0, b.x1) ? [1, 0]
      : on(z0, z1) && on(z0, b.z0) ? [0, -1] : on(z0, z1) && on(z0, b.z1) ? [0, 1] : null;
    if (n) faces.push({ building, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), nx: n[0], nz: n[1] });
  }
  return faces;
}

/** Stair and core rooms of a residential column on a host level, plus the stair shaft voids and holes. */
export function addHostCore(lv, part, door) {
  const b = part.building, F = b.frame, C = NORTH_CORE;
  for (const s of part.stairs) {
    lv.rooms.push(coreRoom(s.id, 'stair', F, [s.rect], door ? [s.door] : [], { label: '北苑住宅疏散楼梯', continuous: true,
      shaftRect: s.shaftRect, landingRect: s.landingRect, residentialCore: b.id, hostLevel: true }));
    const poly = lrectPoly(F, s.shaftRect);
    lv.voids.push({ id: `${s.id}-${lv.short}-shaft`, kind: 'stair', frame: F, rect: s.shaftRect, poly, stair: s.id, residentialCore: b.id });
    addHole(lv, poly);
  }
  const lifts = part.elevators.flatMap((e) => ringRects(rect(e.lu - e.w / 2, e.lv - e.d / 2, e.lu + e.w / 2, e.lv + e.d / 2)));
  lv.rooms.push(coreRoom(`${b.id}-core`, 'core', F, [...lifts, ...C.fillers, ...(door ? [] : [C.band])], [], {
    label: door ? '北苑住户电梯井' : '北苑核心筒（封闭穿越）', residentialCore: b.id, solid: !door, hostLevel: true,
    pickInfo: ['云澜·北苑住户核心筒', door ? '住户刷卡乘梯 · 不停靠商场楼层' : '住户电梯与疏散楼梯穿越本层 · 不开门'] }));
}

// ---------------------------------------------------------------------------
// 北苑住户大堂、地库电梯厅与门禁（世界坐标，§5.2 / §5.3）

const sign = { cn: '云澜·北苑 住户通道 · RESIDENTS', en: 'YUNLAN NORTH RESIDENCE · RESIDENTS', sub: '住户刷卡通行 · 访客请至礼宾台' };
export const NORTH_ACCESS = {
  T1: {
    band: rect(-264, -236.8, -256, -233.6),
    foyer: rect(-270, -236.8, -264, -224),
    lobby: [rect(-280, -237.6, -264, -218), rect(-280, -240, -275, -237.6), rect(-269, -240, -264, -237.6)],
    vestibule: rect(-275, -240, -269, -237.6),
    street: { x0: -273.2, x1: -270.8 },
    lobbyWalls: [seg(-280, -240, -280, -218), seg(-280, -218, -264, -218), seg(-280, -240, -273.2, -240), seg(-270.8, -240, -264, -240),
      seg(-275, -240, -275, -237.6), seg(-269, -240, -269, -237.6),
      seg(-264, -240, -264, -236.6), seg(-264, -233.8, -264, -223.4), seg(-264, -219.9, -264, -218), seg(-256, -236.8, -256, -233.6)],
    garageWalls: [seg(-270, -236.8, -270, -224), seg(-270, -236.8, -264, -236.8), seg(-264, -236.8, -264, -236.6), seg(-264, -233.8, -264, -233.6),
      seg(-256, -236.8, -256, -233.6)],
    fixtures: [['desk', '礼宾台', rect(-272.5, -231.5, -268.5, -230.7)], ['lockers', '信报与快递柜', rect(-279.8, -229, -279.2, -221)]],
    gates: {
      street: { frame: [-275, -237.6, 0], length: 6, lanes: [{ u0: 2.2, u1: 3.8 }], reader: { u: 1.2, v: -0.8 } },
      mall: { frame: [-264, -223.4, 90], length: 3.5, reader: { u: 1.75, v: -1.2 } },
      garage: { frame: [-264, -224, 180], length: 6, lanes: [{ u0: 2.2, u1: 3.8 }], reader: { u: 3.0, v: -1.2 } },
    },
  },
  T2: {
    band: rect(-216, -236.8, -208, -233.6),
    foyer: rect(-221, -236.8, -216, -224),
    lobby: [rect(-224, -237.6, -216, -224)],
    vestibule: rect(-224, -240, -216, -237.6),
    street: { x0: -221.2, x1: -218.8 },
    lobbyWalls: [seg(-224, -240, -224, -224), seg(-224, -240, -221.2, -240), seg(-218.8, -240, -216, -240),
      seg(-216, -240, -216, -236.6), seg(-216, -233.8, -216, -224), seg(-224, -224, -221.75, -224), seg(-218.25, -224, -216, -224),
      seg(-208, -236.8, -208, -233.6)],
    garageWalls: [seg(-221, -236.8, -221, -224), seg(-221, -236.8, -216, -236.8), seg(-216, -236.8, -216, -236.6), seg(-216, -233.8, -216, -233.6),
      seg(-208, -236.8, -208, -233.6)],
    fixtures: [['desk', '礼宾台', rect(-222.5, -230, -219.5, -229.2)], ['lockers', '信报与快递柜', rect(-223.8, -236, -223.4, -226)]],
    gates: {
      street: { frame: [-224, -237.6, 0], length: 8, lanes: [{ u0: 3.2, u1: 4.8 }], reader: { u: 2.2, v: -0.8 } },
      mall: { frame: [-218.25, -224, 180], length: 3.5, reader: { u: 1.75, v: -1.2 } },
      garage: { frame: [-216, -224, 180], length: 5, lanes: [{ u0: 1.7, u1: 3.3 }], reader: { u: 2.5, v: -1.2 } },
    },
  },
};

/** Walks, walls and fixtures of a tower's residents' areas on a host door level. */
export function addResidentsLobby(lv, b) {
  const A = NORTH_ACCESS[b.id], n = b.id.slice(1), walk = (id, kind, r) => lv.walk.push({ id, kind, frame: IDENTITY, rect: r, poly: rectPoly(r), residentialCore: b.id });
  lv.navWalls ||= []; lv.navObstacles ||= [];
  walk(`${b.id}-lift-lobby`, 'lobby', A.band);
  if (lv.short === '1F') {
    A.lobby.forEach((r, i) => walk(i ? `${b.id}-lobby-${i}` : `${b.id}-lobby`, 'lobby', r));
    walk(`${b.id}-vestibule`, 'lobby', A.vestibule);
    lv.navWalls.push(...A.lobbyWalls.map((s) => ({ ...s, residentialCore: b.id })));
    for (const [k, name, r] of A.fixtures) lv.navObstacles.push({ id: `${b.id}-lobby-${k}`, name, poly: rectPoly(r), residentialCore: b.id, rect: r });
    lv.residentsLobbies ||= [];
    lv.residentsLobbies.push({ building: b.id, name: `云澜·北苑 ${n} 号楼 · 住户大堂`, walks: [...A.lobby, A.vestibule], band: A.band,
      vestibule: A.vestibule, street: A.street, fixtures: A.fixtures.map(([kind, name, r]) => ({ kind, name, rect: r })) });
  } else {
    walk(`${b.id}-garage-foyer`, 'lobby', A.foyer);
    lv.navWalls.push(...A.garageWalls.map((s) => ({ ...s, residentialCore: b.id })));
    lv.residentsLobbies ||= [];
    lv.residentsLobbies.push({ building: b.id, name: `云澜·北苑 ${n} 号楼 · 地库电梯厅`, walks: [A.foyer], band: A.band, foyer: A.foyer });
  }
}

/** Street door on the 北外环 façade with its ground approach (site-clearance needs the cover). */
export function residentsStreetDoor(b) {
  const A = NORTH_ACCESS[b.id], n = b.id.slice(1), x = (A.street.x0 + A.street.x1) / 2;
  const s = lseg(IDENTITY, { x0: A.street.x0, z0: -240, x1: A.street.x1, z1: -240, side: 'N' });
  const entrance = { id: `${b.id}-STREET`, building: 'P1', level: 'P1-1F', to: 'site', name: `云澜·北苑 ${n} 号楼 · 住户大堂`, seg: s, nx: 0, nz: -1,
    width: A.street.x1 - A.street.x0, main: false, coveredConnection: true, residentialCore: b.id };
  const r = rect(x - 2.2, -246, x + 2.2, -240);
  const path = { id: `${b.id}-street-approach`, kind: 'ground', name: `云澜·北苑 ${n} 号楼 入户步道`, width: 4.4, points: [[x, 0, -246], [x, 0, -240]],
    polys: [rectPoly(r)], residentialCore: b.id };
  return { entrance, path };
}

/** The four card gates of a tower (street door, mall speed gates, two garage doors) and its zones. */
export function northAccessRecords(b) {
  const A = NORTH_ACCESS[b.id], n = b.id.slice(1), G = A.gates;
  const gates = [
    gateRecord({ id: `${b.id}-STREET-GATE`, zone: `${b.id}-1F`, kind: 'glass-door', name: `北苑 ${n} 号楼住户大堂 · 刷卡`, floor: 'P1-1F', ...G.street, sign }),
    gateRecord({ id: `${b.id}-1F-GATE`, zone: `${b.id}-1F`, kind: 'speed-gates', name: `北苑 ${n} 号楼住户通道 · 刷卡`, floor: 'P1-1F', ...G.mall,
      lanes: SPEED_LANES, cabinets: SPEED_CABINETS, sign }),
    ...['B1', 'B2'].map((s) => gateRecord({ id: `${b.id}-${s}-GATE`, zone: `${b.id}-${s}`, kind: 'glass-door', name: `北苑 ${n} 号楼地库电梯厅 · 刷卡`,
      floor: `P1-${s}`, ...G.garage, sign: { cn: `北苑 ${n} 号楼 · 住户电梯厅`, en: `YUNLAN NORTH RESIDENCE ${n} · LIFT LOBBY`, sub: '住户刷卡进入' } })),
  ];
  const zones = [
    zoneRecord({ id: `${b.id}-1F`, building: b.id, name: `云澜·北苑 ${n} 号楼住户区`, label: `北苑 ${n} 号楼 · 住户大堂`, floor: 'P1-1F',
      polys: [...A.lobby, A.band].map(rectPoly) }),
    ...['B1', 'B2'].map((s) => zoneRecord({ id: `${b.id}-${s}`, building: b.id, name: `云澜·北苑 ${n} 号楼住户区`, label: `北苑 ${n} 号楼 · 地库电梯厅`,
      floor: `P1-${s}`, polys: [A.foyer, A.band].map(rectPoly) })),
  ];
  return { gates, zones };
}

/** Remove parking stalls and columns overlapping any of the world rects. */
export function clearStalls(lv, rects) {
  if (!lv.parking) return 0;
  const hit = (P) => rects.some((r) => convexOverlap(P, rectPoly(r)));
  const n = lv.parking.stalls.length;
  lv.parking.stalls = lv.parking.stalls.filter((s) => !hit(s.poly));
  lv.parking.columns = (lv.parking.columns || []).filter((c) => !hit(lrectPoly(c.frame, rect(c.lx - .4, c.lz - .4, c.lx + .4, c.lz + .4))));
  return n - lv.parking.stalls.length;
}

// ---------------------------------------------------------------------------
// 7F 空中大堂：商场天台进出（两樘外门常开，对公众开放），速通闸机是安防线，闸机后是候梯厅
// （塔楼层，世界坐标由 lv.skyLobby 给出，闸机坐标系与渲染共用 lv.skyLobby.gateFrame）。

const skySign = { cn: '云澜·北苑 空中大堂 · SKY LOBBY', en: 'YUNLAN NORTH RESIDENCE · SKY LOBBY', sub: '住户刷卡乘梯 · 访客请至礼宾台' };
/** Speed gates between the sky lobby and the lift hall, and the residents' zone (lift hall + landing band).
 * The kept club wing is deliberately outside the zone: it is reached from the band, behind the gates. */
export function skyLobbyAccessRecords(b, lv) {
  const S = lv.skyLobby, n = b.id.slice(1), band = lrectPoly(b.frame, NORTH_CORE.band);
  const gates = [gateRecord({ id: S.gate, zone: lv.id, kind: 'speed-gates', name: `北苑 ${n} 号楼空中大堂 · 刷卡`, floor: lv.id,
    frame: S.gateFrame, length: 3.5 /* = SKY_LOBBY.gateZ span */, lanes: SPEED_LANES, cabinets: SPEED_CABINETS,
    reader: { ...SKY_LOBBY.reader }, sign: skySign })];
  const zones = [zoneRecord({ id: lv.id, building: b.id, name: `云澜·北苑 ${n} 号楼住户区`, label: `北苑 ${n} 号楼 · 空中大堂候梯厅`, floor: lv.id,
    polys: [rectPoly(S.liftHall), band] })];
  return { gates, zones };
}
