// 方庭：v1 的原四方格商场（120×80m）放回一期西北空地，楼层与一期共用（v3 规格第 3 节）。
// 局部 frame F_SQ 原点在方庭中心、不旋转，局部坐标即 v1 坐标（x∈[−60,60]、z∈[−40,40]）；
// 东南角沿 x+z=67.47 切成 46m 宽的斜面，与一期西北翼（225°）末端重合，原东南角改为入口大厅。
// 本模块只产出数据：mall.js 在一期构建时调用 setup（电梯、楼梯）与 level（每层的铺位、走道、用房、洞口、车位排、天台要素）。
import { frame, rect, lrectPoly, lroundPoly, lpoly } from './geom.js';

export const F_SQ = frame(-220, -200, 0, 'P1-SQ');
const C = [-106, -106];
const LEG = 46 / Math.SQRT2;
const CORNER = [-160, -160];

/** 斜面两端（世界坐标）：南面端点、东面端点 */
export const CHAMFER = [[CORNER[0] - LEG, CORNER[1]], [CORNER[0], CORNER[1] - LEG]];
/** 西北翼末端到圆厅圆心的距离 */
export const NW_END = Math.hypot(CORNER[0] - LEG / 2 - C[0], CORNER[1] - LEG / 2 - C[1]);
/** 外轮廓拼接折线：西北翼右后角（−v 侧，南面端点）→ 方庭西南角 → 西北角 → 东北角 → 左后角（东面端点） */
export const SQUARE_CHAIN = [CHAMFER[0], [-280, -160], [-280, -240], [-160, -240], CHAMFER[1]];
/** 方庭外轮廓（世界坐标，含斜面） */
export const SQUARE_OUTLINE = [[-280, -240], [-160, -240], CHAMFER[1], CHAMFER[0], [-280, -160]];

/** 局部斜面：x + z = CH（端点 (27.47,40)、(60,7.47)） */
const CH = 60 + 40 - LEG;
const HALL = [[24, 24], [24, 40], [CH - 40, 40], [60, CH - 60], [60, 4], [44, 4], [44, 24]];
/** 斜面以外的三角（停车排遮挡用） */
const BEYOND = [[CH - 40, 40], [60, 40], [60, CH - 60]];

// ---------- 槽位（v1，去掉被斜面切掉的东南角，东客梯核 / 卫生间改到南带） ----------
const NB = (x0, x1) => ({ rects: [rect(x0, -40, x1, -24)], fronts: [{ x0, z0: -24, x1, z1: -24, side: 'S' }] });
const SB = (x0, x1) => ({ rects: [rect(x0, 24, x1, 40)], fronts: [{ x0, z0: 24, x1, z1: 24, side: 'N' }] });
const WB = (z0, z1, x0 = -60) => ({ rects: [rect(x0, z0, -44, z1)], fronts: [{ x0: -44, z0, x1: -44, z1, side: 'E' }] });
const EB = (z0, z1, x1 = 60) => ({ rects: [rect(44, z0, x1, z1)], fronts: [{ x0: 44, z0, x1: 44, z1, side: 'W' }] });
function island(x0, x1, z0, z1, outer) {
  const fronts = [{ x0, z0, x1, z1: z0, side: 'N' }, { x0, z0: z1, x1, z1, side: 'S' }];
  if (outer === 'W' || outer === 'both') fronts.push({ x0, z0, x1: x0, z1, side: 'W' });
  if (outer === 'E' || outer === 'both') fronts.push({ x0: x1, z0, x1, z1, side: 'E' });
  return { rects: [rect(x0, z0, x1, z1)], fronts };
}

const SLOTS = {
  N1: NB(-44, -36), N2: NB(-20, -12), N3: NB(-12, -4), N4: NB(-4, 4), N5: NB(4, 12), N6: NB(20, 32), N7: NB(32, 44),
  S1: SB(-44, -32), S2: SB(-32, -20), S3: SB(-20, -8), S4: SB(-8, 8),
  S4a: SB(-8, 0), S4b: SB(0, 8),
  NW: { rects: [rect(-60, -40, -44, -18)], fronts: [{ x0: -44, z0: -24, x1: -44, z1: -18, side: 'E' }] },
  W1: WB(-18, -10), W2: WB(-10, -4, -55), W3: WB(4, 18),
  SW: { rects: [rect(-60, 18, -44, 40)], fronts: [{ x0: -44, z0: 18, x1: -44, z1: 24, side: 'E' }] },
  NE: { rects: [rect(44, -40, 60, -18)], fronts: [{ x0: 44, z0: -24, x1: 44, z1: -18, side: 'W' }] },
  E1: EB(-18, -10),
  'INW-a': island(-38, -30.5, -18, -6, 'W'), 'INW-b': island(-30.5, -23, -18, -6, 'E'),
  'ISW-a': island(-38, -30.5, 6, 18, 'W'), 'ISW-b': island(-30.5, -23, 6, 18, 'E'),
  'INE-a': island(23, 30.5, -18, -6, 'W'), 'INE-b': island(30.5, 38, -18, -6, 'E'),
  'ISE-a': island(23, 30.5, 6, 18, 'W'), 'ISE-b': island(30.5, 38, 6, 18, 'E'),
  arcade: island(23, 38, 6, 18, 'both'),
  cinema: {
    rects: [rect(20, -40, 44, -24), rect(44, -40, 60, -10)],
    fronts: [{ x0: 20, z0: -24, x1: 44, z1: -24, side: 'S' }, { x0: 44, z0: -24, x1: 44, z1: -10, side: 'W' }],
  },
  kids: { rects: [rect(-60, -40, -44, -10)], fronts: [{ x0: -44, z0: -24, x1: -44, z1: -10, side: 'E' }] },
  books: {
    rects: [rect(-60, 18, -44, 40), rect(-44, 24, -32, 40)],
    fronts: [{ x0: -44, z0: 18, x1: -44, z1: 24, side: 'E' }, { x0: -44, z0: 24, x1: -32, z1: 24, side: 'N' }],
  },
  market: { rects: [rect(23, -18, 49, 18)], fronts: [{ x0: 23, z0: -18, x1: 23, z1: 18, side: 'W' }] },
};
/** 锚点铺位的业态（其余按楼层业态轮换） */
const SLOT_CAT = { cinema: 'arcade', kids: 'kids', books: 'books', market: 'supermarket', arcade: 'toys' };

const RING = ['N1', 'N2', 'N3', 'N5', 'N6', 'N7', 'S1', 'S2', 'S3', 'NW', 'W1', 'W2', 'W3', 'SW', 'NE', 'E1'];
const ISLANDS = ['INW-a', 'INW-b', 'ISW-a', 'ISW-b', 'INE-a', 'INE-b', 'ISE-a', 'ISE-b'];
const LEVEL_SLOTS = {
  '1F': [...RING, ...ISLANDS],
  '2F': [...RING, 'N4', 'S4', ...ISLANDS],
  '3F': ['cinema', 'kids', 'books', 'W2', 'W3', 'N1', 'N2', 'N3', 'N4', 'N5', 'S2', 'S3', 'S4', 'INW-a', 'INW-b', 'ISW-a', 'ISW-b', 'INE-a', 'INE-b', 'arcade'],
  B1M: ['N1', 'N3', 'N4', 'N5', 'N6', 'N7', 'S1', 'S2', 'S3', 'S4a', 'S4b', 'NW', 'W1', 'W2', 'W3', 'SW', 'NE', 'market', 'INW-a', 'INW-b', 'ISW-a', 'ISW-b'],
};

// ---------- 核心筒、卫生间、楼梯 ----------
const CORE_W = { shafts: rect(-36, -34, -33, -24), lobby: rect(-33, -34, -28, -24), stair: rect(-36, -40, -28, -34) };
const CORE_E = { shafts: rect(12.5, 24, 16, 33), lobby: rect(8, 24, 12.5, 33), stair: rect(8, 33, 16, 40) };
const SERVICE = { shaft: rect(12, -34, 15.5, -24), lobby: rect(15.5, -34, 20, -24), stair: rect(12, -40, 20, -34) };
const WC_W = { rect: rect(-28, -40, -20, -24), door: { x0: -25.5, z0: -24, x1: -22.5, z1: -24, side: 'S' } };
const WC_E = { rect: rect(16, 24, 24, 40), door: { x0: 18.5, z0: 24, x1: 21.5, z1: 24, side: 'N' } };
const ABOVE = ['B1M', '1F', '2F', '3F', 'RF'];

/** 中庭洞口与天窗 */
const VOID_1F = { rect: rect(-5, -8, 5, 8), r: 0.6 };
const VOID_UP = { rect: rect(-17, -10, 17, 10), r: 4 };

/** 扶梯（v1 位置；斜段长度随一期层高重算） */
export const SQUARE_ESCALATORS = [
  { pair: 'SQ-P0', from: 'B1', to: 'B1M', axis: 'z', sign: 1, top: -24, cross: -16.15, slot: true, label: '停车场 → 美食广场' },
  { pair: 'SQ-P1', from: 'B1M', to: '1F', axis: 'z', sign: -1, top: -8, cross: -2.55, label: '美食广场 ↔ 1F' },
  { pair: 'SQ-P2', from: 'B1M', to: '1F', axis: 'z', sign: 1, top: 8, cross: 2.55, label: '美食广场 ↔ 1F' },
  { pair: 'SQ-P3', from: '1F', to: '2F', axis: 'z', sign: -1, top: -10, cross: -10.65, label: '1F ↔ 2F' },
  { pair: 'SQ-P4', from: '1F', to: '2F', axis: 'z', sign: 1, top: 10, cross: 10.65, label: '1F ↔ 2F' },
  { pair: 'SQ-P5', from: '2F', to: '3F', axis: 'x', sign: 1, cross: -15.15, slot: true, label: '2F ↔ 3F' },
  { pair: 'SQ-P6', from: '2F', to: '3F', axis: 'x', sign: -1, cross: 15.15, slot: true, label: '2F ↔ 3F' },
  { pair: 'SQ-P7', from: '3F', to: 'RF', axis: 'x', sign: -1, bottom: -23.5, cross: 0, slot: true, label: '3F → 天台' },
].map((p) => ({ ...p, frame: F_SQ, square: true }));

/** 人行入口（1F，均非主入口）：局部门段 + 局部外法线 */
export const SQUARE_ENTRANCES = [
  { id: 'SQ-S', name: '方庭南门', seg: { x0: -8, z0: 40, x1: 8, z1: 40 }, n: [0, 1] },
  { id: 'SQ-N', name: '方庭北门', seg: { x0: -4, z0: -40, x1: 4, z1: -40 }, n: [0, -1] },
  { id: 'SQ-W', name: '方庭西门', seg: { x0: -60, z0: -4, x1: -60, z1: 4 }, n: [-1, 0] },
  { id: 'SQ-E', name: '方庭东门', seg: { x0: 60, z0: -4, x1: 60, z1: 4 }, n: [1, 0] },
].map((e) => ({ ...e, level: '1F', frame: F_SQ, square: true }));

/** 电梯与楼梯（一期构建前调用；ids 为一期楼层 id 映射） */
export function squareSetup(bid, byShort, lift) {
  const all = ['B2', 'B1', 'B1M', '1F', '2F', '3F', 'RF'].map((s) => byShort[s].id);
  const ids = (list) => list.map((s) => byShort[s].id);
  const elevators = [
    ...[-32.1, -29.5, -26.9].map((z, i) => lift(`${bid}-SQ-W-L${i + 1}`, bid, 'passenger', F_SQ, -34.5, z, 3, 2.6, 'E', all)),
    ...[25.5, 28.5, 31.5].map((z, i) => lift(`${bid}-SQ-E-L${i + 1}`, bid, 'passenger', F_SQ, 14.25, z, 3, 2.6, 'W', all)),
    ...[['GW', -15.5, 'W'], ['GE', 15.5, 'E']].map(([id, x, door]) => lift(`${bid}-SQ-${id}`, bid, 'glass', F_SQ, x, 0, 2.6, 2.6, door, ids(['B1M', '1F', '2F', '3F']))),
    lift(`${bid}-SQ-F1`, bid, 'freight', F_SQ, 13.75, -29, 3.5, 4, 'E', ids(ABOVE)),
  ].map((e) => ({ ...e, square: true }));
  const park = (side, x0, z0, x1, z1) => ({ x0, z0, x1, z1, side });
  const parkLevels = ids(['B2', 'B1']);
  const st = (id, r, door, serves, parkDoor) => ({
    id: `${bid}-SQ-${id}`, building: bid, frame: F_SQ, rect: r, door, serves, square: true,
    doorByLevel: parkDoor ? Object.fromEntries(parkLevels.filter((l) => serves.includes(l)).map((l) => [l, parkDoor])) : {},
  });
  const stairs = [
    st('ST-W', CORE_W.stair, { x0: -33, z0: -34, x1: -28, z1: -34, side: 'S' }, all),
    st('ST-E', CORE_E.stair, { x0: 8.5, z0: 33, x1: 12, z1: 33, side: 'N' }, all),
    st('ST-SV', SERVICE.stair, { x0: 15.5, z0: -34, x1: 20, z1: -34, side: 'S' }, ids(ABOVE)),
    st('ST-S4', rect(-60, -10, -55, -4), { x0: -60, z0: -4, x1: -55, z1: -4, side: 'S' }, all, park('E', -55, -10, -55, -4)),
    st('ST-S5', rect(55, -10, 60, -4), { x0: 55, z0: -4, x1: 60, z1: -4, side: 'S' }, all, park('W', 55, -10, 55, -4)),
  ];
  return { elevators, stairs };
}

// ---------- 每层 ----------
const W = (id, kind, r) => ({ id: `SQ-${id}`, kind, poly: lrectPoly(F_SQ, r), frame: F_SQ, rect: r });
const WP = (id, kind, pts) => ({ id: `SQ-${id}`, kind, poly: lpoly(F_SQ, pts), frame: F_SQ, lpoly: pts });

function corridors(short) {
  const out = [];
  const add = (id, kind, r) => out.push(W(id, kind, r));
  add('ringN', 'corridor', rect(-44, -24, 44, -18));
  add('ringS', 'corridor', rect(-44, 18, CH - 24, 24));
  add('ringW', 'corridor', rect(-44, -24, -38, 24));
  add('passW', 'corridor', rect(-38, -6, -23, 6));
  if (short !== 'B1M') {
    add('ringE', 'corridor', rect(38, -24, 44, CH - 44));
    add('passE', 'corridor', rect(23, -6, 38, 6));
  }
  if (short === '1F') {
    add('entS', 'entrance', rect(-8, 24, 8, 40));
    add('entN', 'entrance', rect(-4, -40, 4, -24));
    add('entW', 'entrance', rect(-60, -4, -44, 4));
    add('entE', 'entrance', rect(44, -4, 60, 4));
    add('innerN', 'atrium', rect(-23, -18, 23, -8));
    add('innerS', 'atrium', rect(-23, 8, 23, 18));
    add('innerW', 'atrium', rect(-23, -8, -5, 8));
    add('innerE', 'atrium', rect(5, -8, 23, 8));
  } else if (short === 'B1M') {
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
  if (short !== 'B1M') add('eNook', 'lounge', rect(44, -10, 55, -4));
  out.push(WP('hall', 'entrance', HALL));
  return out;
}

/** 车位排（v1），斜面以外的车位由遮挡三角挡掉 */
const ROWS = [
  { id: 'SQ-R0', u0: 12, u1: 49, v0: -40, v1: -35, face: 'S' },
  { id: 'SQ-R1', u0: -55, u1: 55, v0: -29, v1: -24, face: 'S' },
  { id: 'SQ-R2', u0: -49, u1: 49, v0: -18, v1: -13, face: 'N' },
  { id: 'SQ-R3', u0: -49, u1: 49, v0: -13, v1: -8, face: 'S' },
  { id: 'SQ-R4', u0: -49, u1: 49, v0: -2.5, v1: 2.5, face: 'N' },
  { id: 'SQ-R5', u0: -49, u1: 49, v0: 2.5, v1: 7.5, face: 'S' },
  { id: 'SQ-R6', u0: -49, u1: 49, v0: 13, v1: 18, face: 'N' },
  { id: 'SQ-R7', u0: -55, u1: 55, v0: 24, v1: 29, face: 'N' },
  { id: 'SQ-RW', u0: -60, u1: -55, v0: -24, v1: 24, face: 'E' },
  { id: 'SQ-RE', u0: 55, u1: 60, v0: -40, v1: 24, face: 'W' },
];

function parking(short) {
  const isB1 = short === 'B1';
  const walk = [
    W('A1', 'aisle', rect(-55, -24, 55, -18)), W('A2', 'aisle', rect(-55, -8, 55, -2.5)), W('A3', 'aisle', rect(-55, 7.5, 55, 13)),
    W('A4', 'aisle', rect(-55, 18, 55, 24)), W('AW', 'aisle', rect(-55, -24, -49, 24)), W('AE', 'aisle', rect(49, -40, 55, 24)),
    W('C', 'aisle', rect(-3, -24, 3, 24)), W('AN', 'aisle', rect(3, -35, 49, -29)), WP('hall', 'aisle', HALL),
  ];
  if (isB1) walk.push(W('escLobby', 'eschall', rect(-20, -40, -6, -24)));
  const eq = [
    ['EQ-1', rect(-60, -40, -36, -29), '配电房'], ['EQ-2', rect(-60, -29, -55, -24), '风机房'],
    ['EQ-5', rect(-60, 24, -55, 29), '储藏间'], ['EQ-6', rect(-60, 29, 8, 40), '水泵房 · 消防水池'],
    ...(isB1 ? [['EQ-3', rect(-6, -40, 3, -24), '管井'], ['EQ-4', rect(3, -40, 12, -35), '变配电室']]
      : [['EQ-3', rect(-20, -40, -3, -29), '设备房'], ['EQ-4', rect(3, -40, 12, -35), '变配电室']]),
  ];
  const rooms = eq.map(([id, r, label]) => ({ id: `SQ-${id}`, type: 'equip', label, frame: F_SQ, rects: [r], doors: [] }));
  return { walk, rooms };
}

function roof() {
  const walk = [
    W('D1', 'deck', rect(-58, -24, -19, 24)), W('D2', 'deck', rect(-19, -24, 40, -12)), W('D3', 'deck', rect(-19, 12, CH - 24, 24)),
    W('D4', 'deck', rect(21, -12, CH - 12, 12)), W('SKn', 'deck', rect(-21, -14, 21, -10)), W('SKs', 'deck', rect(-21, 10, 21, 14)),
    W('SKw', 'deck', rect(-21, -14, -17, 14)), W('SKe', 'deck', rect(17, -14, 21, 14)), W('NP', 'deck', rect(-20, -40, 12, -24)),
    W('NE', 'deck', rect(20, -40, 40, -24)), W('SD', 'deck', rect(-58, 24, 8, 38)), WP('hall', 'deck', HALL),
  ];
  const features = [
    { type: 'pavilion', frame: F_SQ, rect: rect(-37, -5, -19, 5), name: '方庭扶梯玻璃亭', square: true },
    { type: 'cinema-open', frame: F_SQ, rect: rect(22, -22, 46, 10), screen: 'E', name: '星空露天影院', en: 'ROOFTOP CINEMA' },
    { type: 'farm', frame: F_SQ, rect: rect(-56, -22, -26, 20), name: '屋顶农场', en: 'SKY FARM' },
    { type: 'viewdeck', frame: F_SQ, rect: rect(-18, -40, 10, -27), name: '方庭观景台' },
  ];
  for (const [x, z] of [[-14, 30], [-2, 30], [-38, 30], [-50, 30], [26, -34], [34, -34], [14, 18], [-10, -20]]) features.push({ type: 'tree', frame: F_SQ, lu: x, lv: z });
  return { walk, features };
}

/** 往一期某层写入方庭内容；返回该层额外的停车排与车位遮挡 */
export function squareLevel(lv, picker, state) {
  const s = lv.short;
  const out = { rows: null, blocks: [] };
  const cats = (lv.cfg && lv.cfg.cats) || ['fashion'];
  const brand = (slot) => {
    if (SLOT_CAT[slot]) return picker.take(SLOT_CAT[slot]);
    const k = (state[`sq-${lv.id}`] = (state[`sq-${lv.id}`] || 0) + 1);
    return picker.take(cats[(k - 1) % cats.length]);
  };
  for (const slot of LEVEL_SLOTS[s] || []) {
    const t = SLOTS[slot];
    lv.units.push({
      id: `${lv.id}-SQ-${slot}`, slot: `SQ-${slot}`, level: lv.id, building: lv.building, brand: brand(slot), frame: F_SQ,
      rects: t.rects.map((r) => ({ ...r })), fronts: t.fronts.map((f) => ({ ...f })), style: slot === 'market' ? 'market' : 'glass',
      square: true, anchor: !!SLOT_CAT[slot],
    });
  }
  if (lv.kind === 'parking') {
    const p = parking(s);
    lv.walk.push(...p.walk);
    lv.rooms.push(...p.rooms);
    out.rows = { F: F_SQ, zone: 'K', rows: ROWS };
    out.blocks.push(lpoly(F_SQ, BEYOND));
  } else if (lv.kind === 'roof') {
    const r = roof();
    lv.walk.push(...r.walk);
    lv.features.push(...r.features);
    lv.voids.push({ id: 'SQ-sky', kind: 'skylight', poly: lroundPoly(F_SQ, VOID_UP.rect, VOID_UP.r), frame: F_SQ, rect: VOID_UP.rect, radius: VOID_UP.r, square: true });
  } else {
    lv.walk.push(...corridors(s));
    if (s === '1F') lv.voids.push({ id: 'SQ-void', kind: 'atrium', poly: lroundPoly(F_SQ, VOID_1F.rect, VOID_1F.r), frame: F_SQ, rect: VOID_1F.rect, radius: VOID_1F.r, square: true });
    if (s === '2F' || s === '3F') lv.voids.push({ id: 'SQ-void', kind: 'atrium', poly: lroundPoly(F_SQ, VOID_UP.rect, VOID_UP.r), frame: F_SQ, rect: VOID_UP.rect, radius: VOID_UP.r, square: true });
    if (s === 'B1M') {
      lv.rooms.push({ id: 'SQ-store', type: 'equip', label: '超市仓储', frame: F_SQ, rects: [rect(49, -18, 55, 4)], doors: [] });
      lv.walk.push(W('svcE', 'service', rect(55, -4, 60, 4)));
    }
  }
  // 核心筒电梯厅（各层）、服务核电梯厅（B1M 以上）
  lv.walk.push(W('lobbyW', 'lobby', CORE_W.lobby), W('lobbyE', 'lobby', CORE_E.lobby));
  if (ABOVE.includes(s)) lv.walk.push(W('lobbySV', 'service', SERVICE.lobby));
  lv.rooms.push({ id: 'SQ-coreW', type: 'core', label: '客梯', frame: F_SQ, rects: [CORE_W.shafts], doors: [] });
  lv.rooms.push({ id: 'SQ-coreE', type: 'core', label: '客梯', frame: F_SQ, rects: [CORE_E.shafts], doors: [] });
  if (ABOVE.includes(s)) {
    lv.rooms.push({ id: 'SQ-freight', type: 'core', label: '货梯', frame: F_SQ, rects: [SERVICE.shaft], doors: [] });
    lv.rooms.push({ id: 'SQ-wcW', type: 'wc', label: '洗手间', frame: F_SQ, rects: [WC_W.rect], doors: [WC_W.door] });
    lv.rooms.push({ id: 'SQ-wcE', type: 'wc', label: '洗手间', frame: F_SQ, rects: [WC_E.rect], doors: [WC_E.door] });
  }
  return out;
}

/** 楼栋上的方庭信息（渲染、测试用） */
export const SQUARE_INFO = { F: F_SQ, outline: SQUARE_OUTLINE, chamfer: CHAMFER, zone: 'K', hall: HALL, ch: CH };
