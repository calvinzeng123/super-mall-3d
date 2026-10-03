// 商业层（1F–3F）与美食夹层（B1M）的铺位槽位、合并铺位和公共走廊。
import { rect } from './geom.js';
import { brandFor } from './brands.js';

const NB = (x0, x1) => ({ rects: [rect(x0, -40, x1, -24)], fronts: [{ x0, z0: -24, x1, z1: -24, side: 'S' }] });
const SB = (x0, x1) => ({ rects: [rect(x0, 24, x1, 40)], fronts: [{ x0, z0: 24, x1, z1: 24, side: 'N' }] });
const WB = (z0, z1, x0 = -60) => ({ rects: [rect(x0, z0, -44, z1)], fronts: [{ x0: -44, z0, x1: -44, z1, side: 'E' }] });
const EB = (z0, z1, x1 = 60) => ({ rects: [rect(44, z0, x1, z1)], fronts: [{ x0: 44, z0, x1: 44, z1, side: 'W' }] });
function island(x0, x1, z0, z1, outer) {
  return {
    rects: [rect(x0, z0, x1, z1)],
    fronts: [
      { x0, z0, x1, z1: z0, side: 'N' },
      { x0, z0: z1, x1, z1, side: 'S' },
      outer === 'W' ? { x0, z0, x1: x0, z1, side: 'W' } : { x0: x1, z0, x1, z1, side: 'E' },
    ],
  };
}

/** 外圈 + 岛铺的标准槽位（北带门面朝南，南带朝北，西带朝东，东带朝西） */
export const SLOTS = {
  N1: NB(-44, -36), N2: NB(-20, -12), N3: NB(-12, -4), N4: NB(-4, 4), N5: NB(4, 12), N6: NB(20, 32), N7: NB(32, 44),
  S1: SB(-44, -32), S2: SB(-32, -20), S3: SB(-20, -8), S4: SB(-8, 8), S5: SB(8, 20), S6: SB(36, 44),
  NW: { rects: [rect(-60, -40, -44, -18)], fronts: [{ x0: -44, z0: -24, x1: -44, z1: -18, side: 'E' }] },
  W1: WB(-18, -10), W2: WB(-10, -4, -55), W3: WB(4, 18),
  SW: { rects: [rect(-60, 18, -44, 40)], fronts: [{ x0: -44, z0: 18, x1: -44, z1: 24, side: 'E' }] },
  NE: { rects: [rect(44, -40, 60, -18)], fronts: [{ x0: 44, z0: -24, x1: 44, z1: -18, side: 'W' }] },
  E1: EB(-18, -4), E2: EB(4, 10, 55), E3: EB(10, 18),
  SE: { rects: [rect(44, 18, 60, 40)], fronts: [{ x0: 44, z0: 18, x1: 44, z1: 24, side: 'W' }] },
  'INW-a': island(-38, -30.5, -18, -6, 'W'), 'INW-b': island(-30.5, -23, -18, -6, 'E'),
  'ISW-a': island(-38, -30.5, 6, 18, 'W'), 'ISW-b': island(-30.5, -23, 6, 18, 'E'),
  'INE-a': island(23, 30.5, -18, -6, 'W'), 'INE-b': island(30.5, 38, -18, -6, 'E'),
  'ISE-a': island(23, 30.5, 6, 18, 'W'), 'ISE-b': island(30.5, 38, 6, 18, 'E'),
  // 合并铺位
  cinema: {
    rects: [rect(20, -40, 44, -24), rect(44, -40, 60, -4)],
    fronts: [{ x0: 20, z0: -24, x1: 44, z1: -24, side: 'S' }, { x0: 44, z0: -24, x1: 44, z1: -4, side: 'W' }],
  },
  kids: { rects: [rect(-60, -40, -44, -10)], fronts: [{ x0: -44, z0: -24, x1: -44, z1: -10, side: 'E' }] },
  books: {
    rects: [rect(-60, 18, -44, 40), rect(-44, 24, -32, 40)],
    fronts: [{ x0: -44, z0: 18, x1: -44, z1: 24, side: 'E' }, { x0: -44, z0: 24, x1: -32, z1: 24, side: 'N' }],
  },
  arcade: { rects: [rect(44, 10, 60, 40)], fronts: [{ x0: 44, z0: 10, x1: 44, z1: 24, side: 'W' }] },
  market: {
    rects: [rect(23, -18, 55, 18), rect(55, -18, 60, 4), rect(55, 10, 60, 18)],
    fronts: [{ x0: 23, z0: -18, x1: 23, z1: 18, side: 'W' }],
  },
  S4a: { rects: [rect(-8, 24, 0, 40)], fronts: [{ x0: -8, z0: 24, x1: 0, z1: 24, side: 'N' }] },
  S4b: { rects: [rect(0, 24, 8, 40)], fronts: [{ x0: 0, z0: 24, x1: 8, z1: 24, side: 'N' }] },
};

const ISLANDS = ['INW-a', 'INW-b', 'ISW-a', 'ISW-b', 'INE-a', 'INE-b', 'ISE-a', 'ISE-b'];
const RING = ['N1', 'N2', 'N3', 'N5', 'N6', 'N7', 'S1', 'S2', 'S3', 'S5', 'S6', 'NW', 'W1', 'W2', 'W3', 'SW', 'NE', 'E1', 'E2', 'E3', 'SE'];

/** 每层使用的槽位 */
export const LEVEL_SLOTS = {
  '1F': [...RING, ...ISLANDS],
  '2F': [...RING, 'N4', 'S4', ...ISLANDS],
  '3F': ['cinema', 'kids', 'books', 'arcade', 'W2', 'W3', 'N1', 'N2', 'N3', 'N4', 'N5', 'S2', 'S3', 'S4', 'S5', 'S6', 'E2', ...ISLANDS],
  B1M: ['N1', 'N3', 'N4', 'N5', 'N6', 'N7', 'S1', 'S2', 'S3', 'S4a', 'S4b', 'S5', 'S6', 'NW', 'W1', 'W2', 'W3', 'SW', 'NE', 'SE', 'market',
    'INW-a', 'INW-b', 'ISW-a', 'ISW-b'],
};

/** 公共走廊、入口大堂、中庭回廊 */
export function corridors(levelId) {
  const W = [];
  const add = (id, kind, r) => W.push({ id, kind, rect: r });
  add('ringN', 'corridor', rect(-44, -24, 44, -18));
  add('ringS', 'corridor', rect(-44, 18, 44, 24));
  add('ringW', 'corridor', rect(-44, -24, -38, 24));
  add('passW', 'corridor', rect(-38, -6, -23, 6));
  if (levelId !== 'B1M') {
    add('ringE', 'corridor', rect(38, -24, 44, 24));
    add('passE', 'corridor', rect(23, -6, 38, 6));
  }
  if (levelId === '1F') {
    add('entS', 'entrance', rect(-8, 24, 8, 40));
    add('entN', 'entrance', rect(-4, -40, 4, -24));
    add('entW', 'entrance', rect(-60, -4, -44, 4));
    add('entE', 'entrance', rect(44, -4, 60, 4));
    add('innerN', 'atrium', rect(-23, -18, 23, -8));
    add('innerS', 'atrium', rect(-23, 8, 23, 18));
    add('innerW', 'atrium', rect(-23, -8, -5, 8));
    add('innerE', 'atrium', rect(5, -8, 23, 8));
  } else if (levelId === 'B1M') {
    add('court', 'foodcourt', rect(-23, -18, 23, 18));
    add('plazaW', 'plaza', rect(-60, -4, -44, 4));
    add('escHall', 'eschall', rect(-20, -40, -12, -24));
  } else {
    add('loungeW', 'lounge', rect(-60, -4, -44, 4));
    add('loungeE', 'lounge', rect(44, -4, 60, 4));
    add('promN', 'atrium', rect(-23, -18, 23, -10));
    add('promS', 'atrium', rect(-23, 10, 23, 18));
    add('surrW', 'atrium', rect(-23, -10, -17, 10));
    add('surrE', 'atrium', rect(17, -10, 23, 10));
  }
  return W;
}

/** 填充商业层或美食夹层：铺位 + 走廊 */
export function fillRetail(lv) {
  for (const slot of LEVEL_SLOTS[lv.id]) {
    const s = SLOTS[slot];
    lv.units.push({
      id: `${lv.id}-${slot}`, slot, level: lv.id, brand: brandFor(lv.id, slot),
      rects: s.rects.map((r) => ({ ...r })), fronts: s.fronts.map((f) => ({ ...f })),
    });
  }
  lv.walk.push(...corridors(lv.id));
}
