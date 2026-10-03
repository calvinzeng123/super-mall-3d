// 垂直交通：扶梯、电梯、楼梯，以及每层的核心筒/卫生间用房。
import { rect } from './geom.js';
import {
  ALL_LEVELS, CORE_W, CORE_E, SERVICE, WC_W, WC_E, STAIR_S4, STAIR_S5, GLASS_LIFTS, GLASS_SHAFT,
  ESCALATOR_PAIRS, ESCALATOR_WIDTH, ESCALATOR_LANE,
} from './constants.js';

const FREIGHT_LEVELS = ['B1M', '1F', '2F', '3F', 'RF'];
const WC_E_LEVELS = ['B1M', '1F', '2F', '3F', 'RF'];
const GLASS_LEVELS = ['B1M', '1F', '2F', '3F'];

/** 电梯：西/东客梯核各 3 台（B2–RF），中庭观光梯 2 部，货梯 1 部 */
export const ELEVATORS = [
  ...[-32.1, -29.5, -26.9].map((z, i) => ({ id: `L-W${i + 1}`, type: 'passenger', core: 'W', x: -34.5, z, w: 3, d: 2.6, door: 'E', serves: ALL_LEVELS })),
  ...[26.9, 29.5, 32.1].map((z, i) => ({ id: `L-E${i + 1}`, type: 'passenger', core: 'E', x: 34.5, z, w: 3, d: 2.6, door: 'W', serves: ALL_LEVELS })),
  ...GLASS_LIFTS.map((g) => ({ id: g.id, type: 'glass', x: g.x, z: g.z, w: GLASS_SHAFT, d: GLASS_SHAFT, door: g.door, serves: GLASS_LEVELS })),
  { id: 'F-1', type: 'freight', x: 13.75, z: -29, w: 3.5, d: 4, door: 'E', serves: FREIGHT_LEVELS },
];

/** 楼梯：核心筒内 3 部 + 西、东两端各 1 部 */
export const STAIRS = [
  { id: 'ST-W', rect: CORE_W.stair, serves: ALL_LEVELS, door: { x0: -33, z0: -34, x1: -28, z1: -34, side: 'S' } },
  { id: 'ST-E', rect: CORE_E.stair, serves: ALL_LEVELS, door: { x0: 28, z0: 34, x1: 33, z1: 34, side: 'N' } },
  { id: 'ST-SV', rect: SERVICE.stair, serves: FREIGHT_LEVELS, door: { x0: 15.5, z0: -34, x1: 20, z1: -34, side: 'S' } },
  {
    id: 'ST-S4', rect: STAIR_S4, serves: ALL_LEVELS, door: { x0: -60, z0: -4, x1: -55, z1: -4, side: 'S' },
    doorByLevel: { B1: { x0: -55, z0: -10, x1: -55, z1: -4, side: 'E' }, B2: { x0: -55, z0: -10, x1: -55, z1: -4, side: 'E' } },
  },
  {
    id: 'ST-S5', rect: STAIR_S5, serves: ALL_LEVELS, door: { x0: 55, z0: 4, x1: 60, z1: 4, side: 'N' },
    doorByLevel: { B1: { x0: 55, z0: 4, x1: 55, z1: 10, side: 'W' }, B2: { x0: 55, z0: 4, x1: 55, z1: 10, side: 'W' } },
  },
];

export const stairDoor = (s, levelId) => (s.doorByLevel && s.doorByLevel[levelId]) || s.door;

/** 某层的核心筒、卫生间、楼梯用房，以及电梯厅走廊 */
export function coreRooms(levelId) {
  const rooms = [];
  const walk = [];
  rooms.push({ id: 'Core-W', type: 'core', rects: [CORE_W.shafts], doors: [], label: '客梯' });
  walk.push({ id: 'lobbyW', kind: 'lobby', rect: CORE_W.lobby });
  rooms.push({ id: 'Core-E', type: 'core', rects: [CORE_E.shafts], doors: [], label: '客梯' });
  walk.push({ id: 'lobbyE', kind: 'lobby', rect: CORE_E.lobby });
  if (FREIGHT_LEVELS.includes(levelId)) {
    rooms.push({ id: 'Freight', type: 'freight', rects: [SERVICE.shaft], doors: [], label: '货梯' });
    walk.push({ id: 'lobbySV', kind: 'service', rect: SERVICE.lobby });
  }
  rooms.push({ id: 'WC-W', type: 'wc', rects: [WC_W.rect], doors: [WC_W.door], label: '洗手间' });
  if (WC_E_LEVELS.includes(levelId)) rooms.push({ id: 'WC-E', type: 'wc', rects: [WC_E.rect], doors: [WC_E.door], label: '洗手间' });
  for (const s of STAIRS) {
    if (s.serves.includes(levelId)) rooms.push({ id: s.id, type: 'stair', rects: [s.rect], doors: [stairDoor(s, levelId)], label: '安全出口' });
  }
  return { rooms, walk };
}

/** 由成对定义生成 16 部扶梯（每对：上行 + 下行） */
export function buildEscalators(levelsById) {
  const out = [];
  for (const p of ESCALATOR_PAIRS) {
    const lo = levelsById[p.from];
    const hi = levelsById[p.to];
    const rise = +(hi.elev - lo.elev).toFixed(3);
    const run = rise * Math.sqrt(3);
    let b;
    let t;
    if (p.top !== undefined) { t = p.top; b = t - p.sign * run; }
    else if (p.bottom !== undefined) { b = p.bottom; t = b + p.sign * run; }
    else { b = (-p.sign * run) / 2; t = (p.sign * run) / 2; }
    const lanes = [p.cross - ESCALATOR_LANE / 2, p.cross + ESCALATOR_LANE / 2];
    lanes.forEach((c, i) => {
      const P = (along) => (p.axis === 'z' ? { x: c, z: along } : { x: along, z: c });
      out.push({
        id: `${p.pair}-${i ? 'D' : 'U'}`, pair: p.pair, from: p.from, to: p.to, dir: i ? 'down' : 'up',
        bottom: { ...P(+b.toFixed(4)), y: lo.elev }, top: { ...P(+t.toFixed(4)), y: hi.elev },
        width: ESCALATOR_WIDTH, rise, run, axis: p.axis, sign: p.sign, label: p.label, slot: p.slot,
      });
    });
  }
  return out;
}

/** 扶梯洞口（上层楼板开口），覆盖整对扶梯的斜段 */
export function escalatorSlot(pairEscalators) {
  const [a] = pairEscalators;
  const half = ESCALATOR_LANE / 2 + ESCALATOR_WIDTH / 2 + 0.075;
  const cross = pairEscalators.reduce((s, e) => s + (a.axis === 'z' ? e.bottom.x : e.bottom.z), 0) / pairEscalators.length;
  if (a.axis === 'z') return rect(cross - half, a.bottom.z, cross + half, a.top.z);
  return rect(a.bottom.x, cross - half, a.top.x, cross + half);
}
