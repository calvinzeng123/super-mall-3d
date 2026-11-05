// 住户门禁记录：刷卡闸机 / 玻璃门与住户区。闸机坐标系中 u 沿门线，v > 0 为住户一侧，
// 读卡器站位在 v < 0 的公共一侧。layout.accessControl 只存在于游览布局。
import { frame as makeFrame } from './geom.js';

/** hold: open seconds after a tap; exitHold / exitSensor: free egress from the residents' side;
 * pinch: never close on someone this close to the line; reachClear: residential stops this far
 * from any public standable point (linksNear measures a radius and ignores walls). */
export const GATE = Object.freeze({ hold: 4, exitHold: 1.5, exitSensor: 1.4, pinch: 0.6, reachClear: 2.0 });
// 3.5 m speed-gate bank: three 0.9 m lanes (the last one accessible) between four cabinets.
export const SPEED_LANES = Object.freeze([{ u0: .2, u1: 1.1 }, { u0: 1.3, u1: 2.2 }, { u0: 2.4, u1: 3.3, accessible: true }].map(Object.freeze));
export const SPEED_CABINETS = Object.freeze([[0, .2], [1.1, 1.3], [2.2, 2.4], [3.3, 3.5]].map(([u0, u1]) => Object.freeze({ u0, u1, v0: -.7, v1: .7 })));

const asFrame = (F) => (Array.isArray(F) ? makeFrame(...F) : F);

export function gateRecord({ id, zone, kind /* 'speed-gates' | 'glass-door' */, name, floor, frame, length, lanes, cabinets = [], reader /* {u, v}, v < 0 */, sign }) {
  return { id, zone, kind, name, floors: [floor], frame: asFrame(frame), line: { u0: 0, u1: length },
    lanes: lanes.map((l) => ({ ...l })), cabinets: cabinets.map((c) => ({ ...c })), reader: { ...reader }, hold: GATE.hold, sign };
}

export function zoneRecord({ id, building, name, label, floor, polys }) {
  return { id, building, name, label, floors: [floor], polys };
}

/** Geometry rules of a gate record (lanes and cabinets on the line, reader on the public side). */
export function gateRecordErrors(g) {
  const errs = [], { u0, u1 } = g.line || {};
  if (!['speed-gates', 'glass-door'].includes(g.kind)) errs.push(`${g.id}: kind ${g.kind}`);
  if (!(u1 > u0)) errs.push(`${g.id}: line`);
  if (!g.lanes?.length) errs.push(`${g.id}: no lanes`);
  for (const q of [...(g.lanes || []), ...(g.cabinets || [])]) if (!(q.u0 >= u0 - 1e-6 && q.u1 <= u1 + 1e-6 && q.u1 > q.u0)) errs.push(`${g.id}: lane/cabinet [${q.u0},${q.u1}] outside the line`);
  if (!(g.reader?.v < 0)) errs.push(`${g.id}: reader must stand at v < 0`);
  if (g.floors?.length !== 1) errs.push(`${g.id}: single-floor gate`);
  return errs;
}
