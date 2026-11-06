// 住户门禁记录：刷卡闸机 / 玻璃门与住户区。闸机坐标系中 u 沿门线，v > 0 为住户一侧，
// 读卡器站位在 v < 0 的公共一侧。layout.accessControl 只存在于游览布局。
//
// Supertall P0a (SPEC §1.0 "card zones", §2.1 gates; GB 55037 §7.1.7): every gate releases on alarm and
// opens from the protected side without a card (GATE.exitSensor). role:
//   'entry'   a residents' entrance: v > 0 is the residents' side, the reader stands on the public side;
//   'exit'    an exit-only door: the stair or terrace is the v > 0 side (free egress), the reader is outside;
//   'reentry' a stair re-entry door: the gated floor is the v > 0 side (free into the stair), the reader is
//             on the stair side, so nobody re-enters the residents' floor from the stair without a card.
// leaf: 'own' (the gate has its own glass leaf / lanes) or 'existing' (it sits in an existing stair or fire
// door opening: the render draws the reader and the sign only).
import { frame as makeFrame, toW, dirW, NORMAL } from './geom.js';

/** hold: open seconds after a tap; exitHold / exitSensor: free egress from the residents' side;
 * pinch: never close on someone this close to the line; reachClear: residential stops this far
 * from any public standable point (linksNear measures a radius and ignores walls). */
export const GATE = Object.freeze({ hold: 4, exitHold: 1.5, exitSensor: 1.4, pinch: 0.6, reachClear: 2.0 });
// 3.5 m speed-gate bank: three 0.9 m lanes (the last one accessible) between four cabinets.
export const SPEED_LANES = Object.freeze([{ u0: .2, u1: 1.1 }, { u0: 1.3, u1: 2.2 }, { u0: 2.4, u1: 3.3, accessible: true }].map(Object.freeze));
export const SPEED_CABINETS = Object.freeze([[0, .2], [1.1, 1.3], [2.2, 2.4], [3.3, 3.5]].map(([u0, u1]) => Object.freeze({ u0, u1, v0: -.7, v1: .7 })));
export const GATE_ROLES = Object.freeze(['entry', 'exit', 'reentry']);
export const GATE_LEAVES = Object.freeze(['own', 'existing']);
/** Sign sub-text of every released-on-alarm gate (the render adds it to the gate sign). */
export const GATE_ALARM_TEXT = '火灾时自动释放';

const asFrame = (F) => (Array.isArray(F) ? makeFrame(...F) : F);

export function gateRecord({ id, zone, kind /* 'speed-gates' | 'glass-door' */, name, floor, frame, length, lanes, cabinets = [], reader /* {u, v}, v < 0 */, sign,
  releaseOnAlarm = true, role = 'entry', leaf = 'own' }) {
  return { id, zone, kind, name, floors: [floor], frame: asFrame(frame), line: { u0: 0, u1: length },
    lanes: lanes.map((l) => ({ ...l })), cabinets: cabinets.map((c) => ({ ...c })), reader: { ...reader }, hold: GATE.hold, sign,
    releaseOnAlarm, role, leaf };
}

export function zoneRecord({ id, building, name, label, floor, polys }) {
  return { id, building, name, label, floors: [floor], polys };
}

/** Geometry rules of a gate record (lanes and cabinets on the line, reader on the public side) and its role / leaf. */
export function gateRecordErrors(g) {
  const errs = [], { u0, u1 } = g.line || {};
  if (!['speed-gates', 'glass-door'].includes(g.kind)) errs.push(`${g.id}: kind ${g.kind}`);
  if (!(u1 > u0)) errs.push(`${g.id}: line`);
  if (!g.lanes?.length) errs.push(`${g.id}: no lanes`);
  for (const q of [...(g.lanes || []), ...(g.cabinets || [])]) if (!(q.u0 >= u0 - 1e-6 && q.u1 <= u1 + 1e-6 && q.u1 > q.u0)) errs.push(`${g.id}: lane/cabinet [${q.u0},${q.u1}] outside the line`);
  if (!(g.reader?.v < 0)) errs.push(`${g.id}: reader must stand at v < 0`);
  if (g.floors?.length !== 1) errs.push(`${g.id}: single-floor gate`);
  if (g.releaseOnAlarm !== true) errs.push(`${g.id}: releaseOnAlarm must be true (GB 55037 §7.1.7)`);
  if (!GATE_ROLES.includes(g.role)) errs.push(`${g.id}: role ${g.role} (entry | exit | reentry)`);
  if (!GATE_LEAVES.includes(g.leaf)) errs.push(`${g.id}: leaf ${g.leaf} (own | existing)`);
  if (g.leaf === 'existing' && g.kind !== 'glass-door') errs.push(`${g.id}: leaf 'existing' is a door in an existing opening (kind glass-door)`);
  if (g.leaf === 'existing' && g.cabinets?.length) errs.push(`${g.id}: leaf 'existing' has no cabinets`);
  return errs;
}

/**
 * A door gate on a segment of a local frame F (a stair or room frame): the gate line runs along seg, and
 * v > 0 points to the `toward` side of the segment (local side letter: the protected side). The whole
 * opening is one lane; the reader stands 0.8 m out on the other side, mid-door.
 */
export function segmentGate({ id, zone, name, floor, frame: F, seg, toward, role = 'entry', leaf = 'existing', sign, building, readerV = -0.8 }) {
  let a = toW(F, seg.x0, seg.z0), b = toW(F, seg.x1, seg.z1);
  const n = dirW(F, ...NORMAL[toward]);
  // gate frame: u from a to b; v axis = u rotated +90° (geom.frame convention). Flip so v points `toward`.
  if (-(b[1] - a[1]) * n[0] + (b[0] - a[0]) * n[1] < 0) [a, b] = [b, a];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), deg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  const g = gateRecord({ id, zone, kind: 'glass-door', name, floor, frame: [a[0], a[1], deg], length: len, lanes: [{ u0: 0, u1: len }],
    reader: { u: len / 2, v: readerV }, sign, role, leaf });
  return building ? { ...g, building } : g;
}

/**
 * The re-entry card doors of one stair (SPEC §1.0 card zones rule 3; H: `H-ST1-nF` on the 22 酒店公寓 floors):
 * one 'reentry' gate per level in `levels`, in the stair door opening of that level (stair.doorByLevel[id] or
 * stair.door, or opts.door(lv)), free from the floor into the stair, a resident card from the stair side,
 * released on alarm. zoneOf(lv) names the residents' zone of the floor (one zoneRecord per floor).
 */
export function stairReentryGates(stair, levels, zoneOf, opts = {}) {
  return levels.map((lv) => {
    const seg = opts.door?.(lv) || stair.doorByLevel?.[lv.id] || stair.door;
    return segmentGate({ id: `${stair.id}-${lv.short}`, zone: zoneOf(lv), name: opts.name ?? '住户楼层 · 刷卡进入', floor: lv.id,
      frame: stair.frame, seg, toward: seg.side, role: 'reentry', leaf: 'existing', building: stair.building,
      sign: opts.sign ?? { cn: '住户楼层 · 刷卡进入', en: 'RESIDENTS FLOOR · CARD ENTRY', sub: GATE_ALARM_TEXT } });
  });
}
