// A synthetic gated tower for the supertall P0a engine tests (refuge floor, 分隔 stair, maxRisers loops, lift
// fireOnly landings, card gates, no-bypass harness). It is a complete layout that buildNav() accepts, built with
// the real engine builders (refugeLevel, towerStairPlan / applyStairBreaks / buildTowerStairAccess, lift,
// gateRecord / segmentGate), so the record shapes are exactly the SPEC §2.1 ones. P0b's render fixtures live in
// tests/fixtures/supertall-records.js (P0b); this file is P0a's and builds layout records only.
//
// Plan (world = tower frame, x east, z south; the hardstand and the street door are on the south face z = 12):
//   plate x[-12, 12] z[-8, 12]; ST1 x[-11, -6.6] z[-8, 1.6] (9.6 m deep), door on its south side z = 1.6 in the
//   low-x lane x[-10.4, -9.2]; L1 (passenger) x[2, 4.6] and LF (fire) x[5, 7.6], z[-8, -5], doors south.
//   1F: the street door x[-2, 2] at z = 12, a card gate S-1F-GATE across the plate at z = 5 (residents north;
//   the stair stop at z 2.6 keeps GATE.reachClear from the gate line, as the real towers do).
//   2F home floor · 3F 避难层 (8.6 m storey: two stair loops) · 4F home floor · RF roof.
import { frame, rect, rectPoly, lrectPoly, lseg, toW } from '../../src/layout/geom.js';
import { lift } from '../../src/layout/mall.js';
import { towerStairPlan, applyStairBreaks, buildTowerStairAccess } from '../../src/layout/tower-stairs.js';
import { refugeLevel } from '../../src/layout/refuge.js';
import { gateRecord, zoneRecord } from '../../src/layout/access-records.js';

export const PLATE = rect(-12, -8, 12, 12);
export const STAIR = rect(-11, -8, -6.6, 1.6);
export const STAIR_DOOR = { x0: -10.4, z0: 1.6, x1: -9.2, z1: 1.6, side: 'S' };
export const GATE_Z = 5;

/**
 * options:
 *   heights: storey heights of [1F, 2F, 3F, 4F] (RF follows); default [4.5, 3.0, 8.6, 3.0]
 *   refuge:  build 3F as a refuge level (default true)
 *   breakLevels: stair break levels (default ['S-3F']); maxRisers: stair maxRisers (default 18)
 *   l1Serves / lfServes / lfFireOnly: short names of the lifts' normal / fire-only landings
 *   publicLift: 'L1' | 'LF' puts that lift in front of the gate, its landings on the public side
 *   gateZ: the gate line (default GATE_Z; closer to the stair door than GATE.reachClear is a bypass)
 *   gate: false builds no card gate (everything public)
 */
export function syntheticTower(options = {}) {
  const { heights = [4.5, 3.0, 8.6, 3.0], refuge = true, breakLevels = ['S-3F'], maxRisers = 18,
    l1Serves = ['1F', '2F', '4F'], lfServes = ['1F', '2F', '3F', '4F', 'RF'], lfFireOnly = null, publicLift = null, gateZ = GATE_Z, gate = true } = options;
  const F = frame(0, 0, 0, 'S'), outline = rectPoly(PLATE), bid = 'S';
  const shorts = ['1F', '2F', '3F', '4F', 'RF'];
  let y = 0;
  const elevs = shorts.map((_, i) => { const e = +y.toFixed(3); y += heights[i] ?? 3.2; return e; });
  const id = (s) => `${bid}-${s}`;
  const plain = (short, i, kind, name) => ({ id: id(short), building: bid, short, levelNumber: short === 'RF' ? undefined : i + 1,
    name, kind, elev: elevs[i], height: heights[i] ?? 3.2, theme: { key: 'test', floor: 'terrazzo', label: name }, outline,
    units: [], rooms: [], walk: [{ id: `${id(short)}-plate`, kind: 'corridor', poly: outline }], voids: [], features: [],
    slab: { pieces: [{ outer: outline, holes: [], localRect: { ...PLATE } }] } });
  const levels = shorts.map((short, i) => {
    if (short === '3F' && refuge) {
      const lv = refugeLevel({ id: id(short), building: bid, short, elev: elevs[i], height: heights[i], frame: F, footprint: PLATE, face: 'S',
        areas: [{ id: `${id(short)}-refuge`, rect: rect(-12, 1.6, 12, 12) }],
        corridors: [rect(-6.6, -5, 8.5, 1.6)],
        plant: [{ id: `${id(short)}-pumps`, name: '消防水泵房', rect: rect(8.5, -8, 12, 0), rating: '2.00h', contents: ['pumps'] }],
        vestibules: [{ rect: rect(8.5, 0, 12, 1.6), doors: [] }],
        windows: [{ edge: 'S', span: [-10, 10], kind: 'fire-window-B' }],
        fixtures: [{ kind: 'hydrant', x: 0, z: 2, label: '消火栓' }, { kind: 'sign', x: -9.8, z: 2, label: '3F 避难层' }],
        persons: 100, serves: ['S-2F', 'S-4F'] });
      lv.levelNumber = 3;
      return lv;
    }
    const kind = short === '1F' ? 'lobby' : short === 'RF' ? 'roof' : 'community';
    return plain(short, i, kind, short === '1F' ? '1F 大堂' : short === 'RF' ? 'RF 屋顶' : `${short} 住宅`);
  });
  const ids = levels.map((l) => l.id);
  // ---------- stair ST1: 分隔 at the break levels, maxRisers loops ----------
  const st = { id: 'S-ST1', building: bid, frame: F, rect: { ...STAIR }, poly: lrectPoly(F, STAIR), door: { ...STAIR_DOOR }, wdoor: lseg(F, STAIR_DOOR),
    wdoorByLevel: {}, serves: ids, ...(breakLevels?.length ? { breakLevels: [...breakLevels] } : {}), ...(maxRisers ? { maxRisers } : {}) };
  const plan = towerStairPlan(st);
  Object.assign(st, { continuous: true, shaftRect: plan.shaftRect, landingRect: plan.landingRect });
  // ---------- lifts ----------
  const pick = (list) => list.map(id);
  // publicLift: that lift stands in front of the gate (shaft z 6.5 … 9.5), its landings on the public side
  const lv0 = (k) => (publicLift === k ? 8 : -6.5);
  const L1 = { ...lift('S-L1', bid, 'passenger', F, 3.3, lv0('L1'), 2.6, 3, 'S', pick(l1Serves)), tower: true, role: 'passenger', speed: 3.5 };
  const LF = { ...lift('S-LF', bid, 'passenger', F, 6.3, lv0('LF'), 2.6, 3, 'S', pick(lfServes)), tower: true, role: 'fire', speed: 4,
    label: '消防电梯', ...(lfFireOnly ? { fireOnly: pick(lfFireOnly) } : {}) };
  const elevators = [L1, LF];
  for (const lv of levels) {
    const room = { id: st.id, type: 'stair', label: '楼梯', frame: F, rects: [{ ...STAIR }], polys: [lrectPoly(F, STAIR)], doors: [{ ...STAIR_DOOR }],
      wdoors: [lseg(F, STAIR_DOOR)], continuous: true, shaftRect: st.shaftRect, landingRect: st.landingRect };
    lv.rooms.push(room);
    const holes = [lrectPoly(F, st.shaftRect), ...elevators.map((e) => lrectPoly(F, rect(e.lu - e.w / 2 + .09, e.lv - e.d / 2 + .09, e.lu + e.w / 2 - .09, e.lv + e.d / 2 - .09)))];
    lv.voids.push({ id: `${st.id}-void`, kind: 'stair', frame: F, rect: st.shaftRect, poly: holes[0], stair: st.id },
      ...elevators.map((e, i) => ({ id: `${e.id}-void`, kind: 'shaft', frame: F, poly: holes[i + 1], elevator: e.id })));
    lv.slab.pieces[0].holes.push(...holes);
    // lift shaft walls (a solid core room round each shaft, open at its door)
    for (const e of elevators) {
      const r = rect(e.lu - e.w / 2, e.lv - e.d / 2, e.lu + e.w / 2, e.lv + e.d / 2);
      lv.rooms.push({ id: `${e.id}-shaft`, type: 'core', frame: F, rects: [r], polys: [lrectPoly(F, r)], doors: [{ x0: r.x0 + .3, z0: r.z1, x1: r.x1 - .3, z1: r.z1, side: 'S' }],
        wdoors: [], publicAccess: true });
    }
  }
  applyStairBreaks(levels, [st]);
  const b = { id: bid, code: bid, name: '测试塔', short: '测试塔', kind: 'tower', usage: 'residential', frame: F, footprint: { ...PLATE }, bounds: { ...PLATE },
    outline, center: [0, 0], radius: 15, height: elevs.at(-1), storeys: 4, levels: ids, rotundas: [], wings: [] };
  b.access = buildTowerStairAccess(b, levels, [st]);
  // ---------- street door, card gate and residents' zone ----------
  const door = lseg(F, { x0: -2, z0: 12, x1: 2, z1: 12, side: 'S' });
  const entrances = [{ seg: door, nx: door.nx, nz: door.nz, id: 'S-MAIN', building: bid, level: id('1F'), name: '测试塔主入口', width: 4, main: true, to: 'site' }];
  const zones = [], gates = [];
  if (gate) {
    zones.push(zoneRecord({ id: 'S-RES-1F', building: bid, name: '住户区', label: '测试塔 · 住户区', floor: id('1F'), polys: [rectPoly(rect(-12, -8, 12, gateZ))] }));
    // gate frame: u along the line from x = 12 to x = -12, v > 0 toward the residents (−z): frame(12, 5, 180°)
    gates.push(gateRecord({ id: 'S-1F-GATE', zone: 'S-RES-1F', kind: 'glass-door', name: '住户门禁', floor: id('1F'), frame: [12, gateZ, 180], length: 24,
      lanes: [{ u0: 11.4, u1: 12.6 }], reader: { u: 12, v: -0.8 }, sign: { cn: '住户专用', en: 'RESIDENTS' } }));
  }
  return {
    buildings: [b], levels, stairs: [st], elevators, escalators: [], ramps: [], entrances,
    site: { bounds: rect(-16, -10, 16, 26), trenches: [], openings: [], walk: [{ id: 'street', poly: rectPoly(rect(-16, 12, 16, 26)) }], plots: [], crossings: [] },
    extensions: { paths: [] }, accessControl: { zones, gates },
  };
}

/** World point 0.8 m outside the stair door of level id (the low-x door; door2 on break levels when `second`). */
export function outsideDoor(layout, id, { second = false } = {}) {
  const st = layout.stairs[0], plan = towerStairPlan(st), br = plan.breakAt(id);
  const d = second && br ? br.doors[1] : st.door;
  return toW(st.frame, ...plan.point((d.x0 + d.x1) / 2, -0.8));
}
