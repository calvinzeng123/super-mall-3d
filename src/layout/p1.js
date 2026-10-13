// 一期 云澜汇：Y 形三翼 + 圆厅（规格第 4 节）。所有局部坐标见实现计划"一期关键数值"。
import { rect, rectPoly } from './geom.js';
import { KIT, HW } from './constants.js';
import { SQUARE_CHAIN, NW_END, SQUARE_ESCALATORS, SQUARE_ENTRANCES, SQUARE_INFO, squareSetup, squareLevel } from './square.js';

/** 西北翼喇叭口：圆厅弧（西翼、北翼外墙与圆周交点之间）到全宽段起点 u=NW_START 的两块口袋（西北翼局部坐标） */
const NW_START = 39.85;
const NECK = (() => {
  const R = 34, beta = Math.asin(HW / R);
  const rel = Math.PI / 3 - beta;
  const corner = [R * Math.cos(rel), R * Math.sin(rel)];
  const plus = [[Math.sqrt(R * R - 49), 7], [NW_START, 7], [NW_START, HW], corner];
  return { plus, minus: plus.map(([u, v]) => [u, -v]).reverse() };
})();

const HOLE_RAMP = rect(-11.5, -5.25, 11.5, 5.25);
const APARTMENT_SIDE_HALL = [{ u0: 72, u1: 80, band: 1 }];
const SLOTS_2F = { SE: [[40, 52], [58, 72]], W: [[40, 52], [58, 70], [76, 86]], N: [[40, 52], [58, 72]] };

const V1 = {
  '1F': ['NW', 'S1', 'N1', 'INW-a', 'W1', 'S2', 'N2', 'ISW-a', 'W2', 'S3', 'N3', 'INE-a', 'W3', 'S5', 'N5', 'INE-b', 'E1', 'S6', 'N6', 'ISE-a',
    'E2', 'SW', 'N7', 'ISE-b', 'E3', 'NE', 'INW-b', 'SE', 'ISW-b'],
  '2F': ['NW', 'N1', 'S1', 'INW-a', 'W1', 'N2', 'S2', 'INE-a', 'W2', 'N3', 'S3', 'ISW-a', 'W3', 'N4', 'S4', 'ISE-a', 'E1', 'N5', 'S5', 'INW-b',
    'E2', 'N6', 'S6', 'INE-b', 'E3', 'N7', 'SW', 'ISW-b', 'NE', 'SE', 'ISE-b'],
  '3F': ['N2', 'W2', 'N3', 'INE-a', 'S2', 'W3', 'N4', 'ISE-a', 'S3', 'N1', 'N5', 'INW-a', 'S4', 'E2', 'S5', 'INW-b', 'S6', 'ISW-a', 'INE-b', 'ISW-b', 'ISE-b'],
};

export const P1 = {
  id: 'P1', code: 'A', name: '一期 · 云澜汇', short: '一期', en: 'YUNLAN MALL', plot: rect(-286, -256, -16, -20),
  rotundas: [{ id: 'C', x: -106, z: -106, R: 34, kitDeg: 45, glass: ['B1M', '1F', '2F', '3F'] }],
  wings: [
    { id: 'SE', rot: 'C', deg: 45, uEnd: 84, core: { band: -1, u: 51 }, zone: 'A', name: '东南翼' },
    { id: 'W', rot: 'C', deg: 165, uEnd: 96, core: { band: 1, u: 55 }, zone: 'B', name: '西翼' },
    { id: 'N', rot: 'C', deg: 285, uEnd: 88, core: { band: -1, u: 35 }, zone: 'C', name: '北翼' },
    { id: 'NW', rot: 'C', deg: 225, uEnd: NW_END, start: NW_START, neck: NECK, annex: SQUARE_CHAIN, core: { band: -1, u: 62 }, zone: 'J', name: '西北翼' },
  ],
  pocketStairs: [{ wing: 'SE', band: 1 }, { wing: 'SE', band: -1 }, { wing: 'N', band: -1 }],
  levels: [
    {
      short: 'B2', name: 'B2 停车场', kind: 'parking', elev: -12, height: 3.6,
      theme: { key: 'park-green', floor: 'concrete-green', accent: '#2e9c6a', label: '停车场 · 绿区' },
      rot: { C: { hole: HOLE_RAMP } }, parkWc: { wing: 'SE', u: 59 }, evRow: 'SE-r1',
    },
    {
      short: 'B1', name: 'B1 停车场', kind: 'parking', elev: -8.4, height: 3.9,
      theme: { key: 'park-blue', floor: 'concrete-blue', accent: '#2f6fd6', label: '停车场 · 蓝区 · 车库出入口' },
      rot: { C: { hole: HOLE_RAMP, rampVoid: rect(-12, -4.75, 12, 4.75) } },
      wings: { N: { end: 'aisle', sideHalls: APARTMENT_SIDE_HALL }, W: { eschall: [42, 60] } },
      parkWc: { wing: 'SE', u: 59 }, evRow: 'SE-r1',
    },
    {
      short: 'B1M', name: 'B1M 美食广场', kind: 'food', elev: -4.5, height: 4.5,
      theme: { key: 'food', floor: 'terrazzo-warm', accent: '#dd6b20', label: '美食广场 · 云澜老街 · 精品超市' },
      rot: { C: { kind: 'foodcourt' } },
      widths: [7, 6, 8, 7, 9], cats: ['food', 'restaurant', 'snack', 'tea'],
      wings: {
        SE: { brands: ['B1M', 'N1', 'N3', 'S1', 'N4', 'S2', 'N5', 'S3', 'N6', 'S5', 'N7', 'S6', 'NE', 'SE', 'S4a', 'S4b'], cats: ['food', 'restaurant'] },
        W: { style: 'oldstreet', widths: [6, 7, 6, 8], brands: ['B1M', 'NW', 'W1', 'W2', 'W3', 'SW', 'INW-a', 'INW-b', 'ISW-a', 'ISW-b'], cats: ['snack', 'tea', 'restaurant'] },
        N: { anchors: [{ slot: 'market', band: -1, u0: 51, u1: 70, v1: ['B1M', 'market'], style: 'market' }], end: 'service', streetEnd: 82, sideHalls: APARTMENT_SIDE_HALL },
        NW: { cats: ['food', 'snack', 'tea'] },
      },
    },
    {
      short: '1F', name: '1F 国际精品', kind: 'retail', elev: 0, height: 6.5,
      theme: { key: 'lux', floor: 'marble-white', accent: '#b08d4f', label: '国际精品 · 珠宝腕表 · 美妆' },
      rot: { C: { void: KIT.void1F, shafts: true } },
      widths: [8, 7, 9, 8, 10, 7], brands: ['1F', ...V1['1F']], cats: ['beauty', 'jewelry', 'luxury', 'accessory', 'cafe'],
      wings: { SE: { end: 'entrance' }, W: { end: 'entrance' }, N: { end: 'service', sideHalls: APARTMENT_SIDE_HALL } },
    },
    {
      short: '2F', name: '2F 潮流服饰', kind: 'retail', elev: 6.5, height: 5.5,
      theme: { key: 'fashion', floor: 'terrazzo-cool', accent: '#2f86b0', label: '潮流服饰 · 运动户外 · 潮玩' },
      rot: { C: { void: KIT.voidUp } },
      widths: [9, 8, 10, 7, 11, 8], brands: ['2F', ...V1['2F']], cats: ['fashion', 'sports', 'shoes', 'toys'],
      wings: { SE: { end: 'bridge', slots: SLOTS_2F.SE }, W: { slots: SLOTS_2F.W }, N: { slots: SLOTS_2F.N, sideHalls: APARTMENT_SIDE_HALL }, NW: { slots: [[59, 67]] } },
    },
    {
      short: '3F', name: '3F 亲子娱乐', kind: 'retail', elev: 12, height: 5.5,
      theme: { key: 'family', floor: 'wood-warm', accent: '#e0567a', label: '影城 · 儿童乐园 · 主题餐厅' },
      rot: { C: { void: KIT.voidUp } },
      widths: [9, 8, 10, 8], brands: ['3F', ...V1['3F']], cats: ['restaurant', 'kids', 'cafe', 'toys'],
      wings: {
        SE: {
          slots: [[40, 52], [58, 72]],
          anchors: [
            { slot: 'books', band: -1, u0: 35, u1: 51, v1: ['3F', 'books'] },
            { slot: 'arcade', band: 1, u0: 60, u1: 78, v1: ['3F', 'arcade'] },
          ],
        },
        W: { slots: [[58, 70]], streetEnd: 71, end: 'service', anchors: [{ slot: 'cinema', band: 0, u0: 71, u1: 90, v1: ['3F', 'cinema'], style: 'cinema' }] },
        N: { slots: [[40, 52], [58, 72]], anchors: [{ slot: 'kids', band: 1, u0: 60, u1: 82, v1: ['3F', 'kids'] }] },
        NW: { slots: [[44, 56]] },
      },
    },
    {
      short: 'RF', name: 'RF 天台花园', kind: 'roof', elev: 17.5, height: 6,
      theme: { key: 'roof', floor: 'deck-garden', accent: '#4a9a50', label: '天台花园 · 餐吧 · 摩天轮' },
      rot: { C: { void: KIT.voidUp, voidKind: 'skylight' } },
      wings: { SE: { skylights: [[40, 52], [58, 72]] }, W: { skylights: [[58, 70]] }, NW: { skylights: [[44, 56]] } },
      roof: p1Roof,
    },
  ],
  escalators: [
    { pair: 'K1', rot: 'C', from: 'B1M', to: '1F', axis: 'z', sign: -1, top: -8, cross: -2.55, label: '美食广场 ↔ 1F' },
    { pair: 'K2', rot: 'C', from: 'B1M', to: '1F', axis: 'z', sign: 1, top: 8, cross: 2.55, label: '美食广场 ↔ 1F' },
    { pair: 'K3', rot: 'C', from: '1F', to: '2F', axis: 'z', sign: -1, top: -10, cross: -10.65, label: '1F ↔ 2F' },
    { pair: 'K4', rot: 'C', from: '1F', to: '2F', axis: 'z', sign: 1, top: 10, cross: 10.65, label: '1F ↔ 2F' },
    { pair: 'K5', rot: 'C', from: '2F', to: '3F', axis: 'x', sign: 1, cross: -15.15, slot: true, label: '2F ↔ 3F' },
    { pair: 'K6', rot: 'C', from: '2F', to: '3F', axis: 'x', sign: -1, cross: 15.15, slot: true, label: '2F ↔ 3F' },
    { pair: 'P0', wing: 'W', from: 'B1', to: 'B1M', axis: 'x', sign: 1, bottom: 48, cross: 0, slot: true, label: '停车场 → 美食广场' },
    { pair: 'P7', wing: 'W', from: '3F', to: 'RF', axis: 'x', sign: 1, bottom: 42, cross: 0, slot: true, label: '3F → 天台花园' },
    { pair: 'K7', wing: 'NW', from: '1F', to: '2F', axis: 'x', sign: 1, bottom: 44, cross: 0, slot: true, label: '1F ↔ 2F' },
    { pair: 'K8', wing: 'NW', from: '2F', to: '3F', axis: 'x', sign: 1, bottom: 70, cross: 0, slot: true, label: '2F ↔ 3F' },
    ...SQUARE_ESCALATORS,
  ],
  square: { setup: squareSetup, level: squareLevel, info: SQUARE_INFO },
  entrances: [
    { id: 'SE', name: '东南主入口', level: '1F', wing: 'SE', v0: -8, v1: 8, main: true },
    { id: 'W', name: '西门', level: '1F', wing: 'W', v0: -4, v1: 4 },
    { id: 'S', name: '南门', level: '1F', rot: 'C', a0: 99, a1: 111 },
    { id: 'E', name: '东门', level: '1F', rot: 'C', a0: 339, a1: 351 },
    { id: 'BR', name: '天桥入口', level: '2F', wing: 'SE', v0: -5, v1: 5, to: 'bridge' },
    { id: 'MT', name: '地铁通道口', level: 'B1M', wing: 'SE', v0: -4, v1: 4, to: 'M-B1' },
    ...SQUARE_ENTRANCES,
  ],
  ramps: [
    { id: 'IN', type: 'street-in', name: '车库入口', wing: 'N', lane: rect(85, -5.5, 141, -0.5), from: [141, -3, 'street'], to: [85, -3, 'B1'] },
    { id: 'OUT', type: 'street-out', name: '车库出口', wing: 'N', lane: rect(85, 0.5, 141, 5.5), from: [85, 3, 'B1'], to: [141, 3, 'street'] },
    { id: 'DN', type: 'down', name: 'B1→B2 下行坡道', rot: 'C', lane: rect(-12, -4.6, 12, -0.1), from: [12, -2.35, 'B1'], to: [-12, -2.35, 'B2'] },
    { id: 'UP', type: 'up', name: 'B2→B1 上行坡道', rot: 'C', lane: rect(-12, 0.1, 12, 4.6), from: [-12, 2.35, 'B2'], to: [12, 2.35, 'B1'] },
  ],
  driveways: [{ wing: 'N', rect: rect(139, -8, 162, 8) }],
  trenches: [{ wing: 'N', rect: rect(100, -6, 141, 6) }],
  plazas: [{ id: 'plaza', poly: rectPoly(rect(-286, -256, -16, -20)) }],
};

/** 天台：东南翼餐吧 + 卫生间 + 观景台 + 立体字；西翼花园；北翼摩天轮、IP、设备区 */
function p1Roof(api) {
  const SE = api.wing('SE'), W = api.wing('W'), N = api.wing('N');
  const tree = (F, u, v) => api.feature({ type: 'tree', frame: F, lu: u, lv: v });
  // 餐吧：+v 侧两家、−v 侧两家，门面朝商业街中线，外摆在门前
  const bars = [
    ['R1', 36, 48, 1], ['R2', 52, 64, 1], ['R3', 36, 48, -1], ['R4', 62, 74, -1],
  ];
  for (const [slot, u0, u1, s] of bars) {
    const r = s > 0 ? rect(u0, 13, u1, 21) : rect(u0, -21, u1, -13);
    const front = { x0: u0, z0: s * 13, x1: u1, z1: s * 13, side: s > 0 ? 'N' : 'S' };
    api.unit(SE.F, slot, r, [front], api.v1('RF', slot), { style: 'bar', wing: 'SE', terrace: s > 0 ? rect(u0, 7, u1, 13) : rect(u0, -13, u1, -7) });
  }
  api.room(SE.F, 'RF-WC', 'wc', '洗手间', rect(66, 13, 74, 21), [{ x0: 68.5, z0: 13, x1: 71.5, z1: 13, side: 'N' }]);
  api.walk(SE.F, 'skywalk', 'skywalk', rect(SE.uEnd - 1, -4, SE.uEnd + 6, 4));
  api.feature({ type: 'skywalk', frame: SE.F, rect: rect(SE.uEnd, -4, SE.uEnd + 6, 4), name: '玻璃悬挑观景台' });
  api.feature({ type: 'letters', frame: SE.F, lu: 76.5, lv: 0, face: 'E', text: '云澜汇', name: '云澜汇立体字' });
  for (const [u, v] of [[34, 8], [34, -8], [50, 8], [50, -8], [66, -8], [76, 10], [76, -10]]) tree(SE.F, u, v);

  // 西翼花园
  api.feature({ type: 'pavilion', frame: W.F, rect: rect(39.5, -4.5, 54.5, 4.5), name: '扶梯玻璃亭' });
  api.feature({ type: 'mirror', frame: W.F, rect: rect(64, -18, 86, -7), name: '天空之镜' });
  api.feature({ type: 'lawn', frame: W.F, rect: rect(64, 7, 86, 16), name: '阳光草坪' });
  api.feature({ type: 'playground', frame: W.F, rect: rect(28, -20, 40, -9), name: '天台儿童乐园' });
  api.feature({ type: 'pergola', frame: W.F, rect: rect(66, 18.5, 88, 21.5), name: '花架长廊' });
  api.feature({ type: 'arch', frame: W.F, lu: 57, lv: 0, axis: 'u', name: '花艺拱门' });
  for (const [u, v] of [[30, 6], [44, 9], [44, -9], [60, 9], [60, -9], [74, 3], [88, 9], [88, -12], [72, -3]]) tree(W.F, u, v);

  // 北翼：摩天轮（轮面沿翼楼轴线）、IP、设备区
  api.feature({ type: 'ferris', frame: N.F, lu: 62, lv: 0, radius: 15, clearance: 2.2, gondolas: 24, name: '云澜之眼摩天轮', en: 'SKY EYE' });
  api.feature({ type: 'ferris-platform', frame: N.F, rect: rect(58, -3, 66, 3), name: '摩天轮登乘台' });
  api.feature({ type: 'ip', frame: N.F, lu: 80, lv: 10, scale: 1.2, name: 'IP「云宝」', en: 'YUNBAO' });
  api.room(N.F, 'MECH', 'mech', '设备区', rect(70, -21, 80, -10));
  for (const [u, v] of [[44, 10], [44, -12], [76, 18], [52, 16]]) tree(N.F, u, v);
}
