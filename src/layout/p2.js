// 二期 星湾：三翼两圆厅的折线新月形（规格第 5 节）。
// 圆厅 A=(106.07,−106.07)、B=(210.07,−106.07)，R=30；西翼自 A 以 135° 伸出（轴线经过原点），中翼连接 A、B，东翼自 B 以 45° 伸出。
import { rect, rectPoly } from './geom.js';
import { KIT } from './constants.js';
import { hubOutline } from './hub.js';

const A = { id: 'A', x: 150 / Math.SQRT2, z: -150 / Math.SQRT2, R: 30, kitDeg: 0, glass: ['1F', '2F', '3F', '4F'] };
const B = { id: 'B', x: 150 / Math.SQRT2 + 104, z: -150 / Math.SQRT2, R: 30, kitDeg: 0 };
const RINK = rect(-15, -9, 15, 9);
const RINK_VOID = { rect: rect(-17, -11, 17, 11), r: 4 };
const SLOTS = { W: [[34, 46], [52, 66]], M: [[34, 45], [62, 70]], E: [[34, 42]] };
// A 圆厅的独立双车道：28m 斜坡消化 4.2m 层差，两道各净宽 6m。
// 周边环道避开坡体；只有上层开结构洞，下层保留承接楼板。
const PARK_RAMP_CLEAR = rect(-13.4, -6.8, 13.4, 6.8);
const PARK_RAMP_VOID = rect(-14, -6.25, 14, 6.25);

export const P2 = {
  id: 'P2', code: 'B', name: '二期 · 星湾', short: '二期', en: 'XINGWAN', plot: rect(16, -164, 286, -20),
  rotundas: [A, B],
  wings: [
    { id: 'W', rot: 'A', deg: 135, uEnd: 86, core: { band: 1, u: 40 }, zone: 'D', name: '西翼' },
    { id: 'M', rot: 'A', to: 'B', deg: 0, core: { band: -1, u: 31 }, zone: 'E', name: '中翼' },
    { id: 'E', rot: 'B', deg: 45, uEnd: 72, core: { band: -1, u: 31 }, zone: 'F', name: '东翼' },
  ],
  pocketStairs: [{ wing: 'W', band: 1 }, { wing: 'M', band: 1 }, { wing: 'M', band: -1, far: true }, { wing: 'E', band: 1 }],
  levels: [
    {
      short: 'B2', name: 'B2 停车场', kind: 'parking', elev: -8.4, height: 4.2,
      theme: { key: 'park-jade', floor: 'concrete-green', accent: '#3a8c75', label: '停车场 · 翡翠区 · 接 B1 双车道坡道' },
      rot: { A: { hole: PARK_RAMP_CLEAR } },
      parkWc: { wing: 'W', u: 48 }, evRow: 'W-r1',
    },
    {
      short: 'B1', name: 'B1 停车场', kind: 'parking', elev: -4.2, height: 4.2,
      theme: { key: 'park-amber', floor: 'concrete-blue', accent: '#d9a21b', label: '停车场 · 琥珀区 · 车库出入口' },
      rot: { A: { hole: PARK_RAMP_CLEAR, rampVoid: PARK_RAMP_VOID } },
      wings: { M: { throat: rect(48, -23, 60, -12) } },
      parkWc: { wing: 'W', u: 48 }, evRow: 'W-r1',
    },
    {
      short: '1F', name: '1F 国潮旗舰', kind: 'retail', elev: 0, height: 6.5,
      theme: { key: 'guochao', floor: 'marble-white', accent: '#c2402f', label: '国潮旗舰 · 新能源汽车展厅 · 真冰场' },
      rot: {
        B: {
          hole: RINK,
          units: [{
            slot: 'rink', rect: RINK, cat: 'rink', style: 'rink',
            fronts: [
              { x0: -15, z0: -9, x1: 15, z1: -9, side: 'N' }, { x0: -15, z0: 9, x1: 15, z1: 9, side: 'S' },
              { x0: -15, z0: -9, x1: -15, z1: 9, side: 'W' }, { x0: 15, z0: -9, x1: 15, z1: 9, side: 'E' },
            ],
          }],
        },
      },
      widths: [8, 7, 9, 8, 7, 10], cats: ['fashion', 'beauty', 'tea', 'accessory', 'cafe', 'jewelry'],
      wings: {
        W: { end: 'entrance' },
        M: { anchors: [{ slot: 'auto', band: 1, u0: 31, u1: 73, cat: 'auto', style: 'showroom' }] },
        E: { end: 'entrance' },
      },
    },
    {
      short: '2F', name: '2F 运动户外', kind: 'retail', elev: 6.5, height: 5.5,
      theme: { key: 'sport', floor: 'terrazzo-cool', accent: '#1f9d6b', label: '运动户外 · 球鞋 · 潮流' },
      rot: { A: { void: KIT.voidUp }, B: { void: RINK_VOID } },
      widths: [9, 7, 8, 10, 7, 8], cats: ['sports', 'shoes', 'sports', 'fashion', 'accessory'],
      wings: { W: { end: 'bridge', slots: SLOTS.W }, M: { slots: [[34, 46], [52, 66]] }, E: { slots: SLOTS.E } },
    },
    {
      short: '3F', name: '3F 亲子教育', kind: 'retail', elev: 12, height: 5.5,
      theme: { key: 'edu', floor: 'wood-warm', accent: '#6d5bd0', label: '亲子教育 · 科技潮玩 · 书店' },
      rot: { A: { void: KIT.voidUp }, B: { void: RINK_VOID } },
      widths: [8, 9, 7, 10, 8], cats: ['edu', 'kids', 'toys', 'tech', 'books'],
      wings: {
        W: { slots: SLOTS.W, anchors: [{ slot: 'kidsclub', band: -1, u0: 58, u1: 80, cat: 'kids' }] },
        M: { slots: SLOTS.M },
        E: {},
      },
    },
    {
      short: '4F', name: '4F 餐饮影城', kind: 'retail', elev: 17.5, height: 5.5,
      theme: { key: 'dining', floor: 'terrazzo-warm', accent: '#b5651d', label: '餐饮 · IMAX 影城 · 观景餐厅' },
      rot: { A: { void: KIT.voidUp }, B: { void: RINK_VOID } },
      widths: [9, 8, 10, 8, 7], cats: ['restaurant', 'restaurant', 'cafe', 'tea', 'restaurant', 'bar'],
      wings: {
        W: { slots: SLOTS.W },
        M: { slots: [[34, 45]] },
        E: { streetEnd: 47, end: 'service', anchors: [{ slot: 'imax', band: 0, u0: 47, u1: 66, cat: 'cinema', style: 'cinema' }] },
      },
    },
    {
      short: 'RF', name: 'RF 天空跑道', kind: 'roof', elev: 23, height: 6,
      theme: { key: 'track', floor: 'deck-garden', accent: '#d9482b', label: '天空跑道 · 篮球场 · 屋顶花园' },
      rot: { A: { void: KIT.voidUp, voidKind: 'skylight' }, B: { void: RINK_VOID, voidKind: 'skylight' } },
      wings: { W: { skylights: SLOTS.W } },
      roof: p2Roof,
    },
  ],
  escalators: [
    { pair: 'KA3', rot: 'A', from: '1F', to: '2F', axis: 'z', sign: -1, top: -10, cross: -10.65, label: '1F ↔ 2F' },
    { pair: 'KA4', rot: 'A', from: '1F', to: '2F', axis: 'z', sign: 1, top: 10, cross: 10.65, label: '1F ↔ 2F' },
    { pair: 'KA5', rot: 'A', from: '2F', to: '3F', axis: 'x', sign: 1, cross: -15.15, slot: true, label: '2F ↔ 3F' },
    { pair: 'KA6', rot: 'A', from: '2F', to: '3F', axis: 'x', sign: -1, cross: 15.15, slot: true, label: '2F ↔ 3F' },
    { pair: 'KB1', rot: 'B', from: '1F', to: '2F', axis: 'x', sign: 1, cross: -15.15, slot: true, label: '冰场 · 1F ↔ 2F' },
    { pair: 'KB2', rot: 'B', from: '1F', to: '2F', axis: 'x', sign: -1, cross: 15.15, slot: true, label: '冰场 · 1F ↔ 2F' },
    { pair: 'PM', wing: 'M', from: '3F', to: '4F', axis: 'x', sign: 1, bottom: 50, cross: 0, slot: true, label: '3F ↔ 4F 餐饮影城' },
    { pair: 'PE', wing: 'E', from: '3F', to: '4F', axis: 'x', sign: -1, top: 36, cross: 0, slot: true, label: '3F ↔ 4F 餐饮影城' },
  ],
  entrances: [
    { id: 'W', name: '西门 · 主入口', level: '1F', wing: 'W', v0: -8, v1: 8, main: true },
    { id: 'E', name: '东门', level: '1F', wing: 'E', v0: -5, v1: 5 },
    { id: 'SA', name: '星湾广场门', level: '1F', rot: 'A', a0: 60, a1: 72 },
    { id: 'SB', name: '冰场门', level: '1F', rot: 'B', a0: 105, a1: 117 },
    { id: 'N', name: '北门', level: '1F', rot: 'A', a0: 264, a1: 276 },
    { id: 'BR', name: '天桥入口', level: '2F', wing: 'W', v0: -5, v1: 5, to: 'bridge' },
    { id: 'MT', name: '地铁通道口', level: 'B1', wing: 'W', v0: -4, v1: 4, to: 'M-B1' },
  ],
  ramps: [
    { id: 'IN', type: 'street-in', name: '车库入口', wing: 'M', lane: rect(48.5, -50, 53.5, -22), from: [51, -50, 'street'], to: [51, -22, 'B1'] },
    { id: 'OUT', type: 'street-out', name: '车库出口', wing: 'M', lane: rect(54.5, -50, 59.5, -22), from: [57, -22, 'B1'], to: [57, -50, 'street'] },
    { id: 'DN', type: 'down', name: 'B1→B2 下行坡道', rot: 'A', lane: rect(-14, -6.15, 14, -.15), from: [14, -3.15, 'B1'], to: [-14, -3.15, 'B2'] },
    { id: 'UP', type: 'up', name: 'B2→B1 上行坡道', rot: 'A', lane: rect(-14, .15, 14, 6.15), from: [-14, 3.15, 'B2'], to: [14, 3.15, 'B1'] },
  ],
  driveways: [{ wing: 'M', rect: rect(46, -62, 62, -48) }],
  trenches: [{ wing: 'M', rect: rect(48, -50, 60, -41.5) }],
  plazas: [{ id: 'plaza', poly: rectPoly(rect(16, -164, 286, -20)) }],
};

/** 天台：天空跑道（沿建筑形状的闭合环线）、篮球场、屋顶花园、卫生间、设备区 */
function p2Roof(api) {
  const W = api.wing('W'), M = api.wing('M'), E = api.wing('E');
  const rots = [{ id: 'A', x: A.x, z: A.z, R: A.R - 5 }, { id: 'B', x: B.x, z: B.z, R: B.R - 5 }];
  const arms = [
    { id: 'W', rot: 'A', deg: 135, uEnd: 86 - 5 },
    { id: 'M', rot: 'A', to: 'B', deg: 0 },
    { id: 'E', rot: 'B', deg: 45, uEnd: 72 - 5 },
  ];
  api.feature({ type: 'track', path: hubOutline(rots, arms, 17, 4), width: 3.6, frame: W.F, lu: 66, lv: 17, name: '星湾天空跑道', en: 'SKY TRACK' });
  api.feature({ type: 'court', frame: M.F, rect: rect(38, -7.5, 66, 7.5), name: '屋顶篮球场' });
  api.feature({ type: 'lawn', frame: W.F, rect: rect(56, -12, 78, 0), name: '屋顶花园' });
  api.feature({ type: 'lawn', frame: E.F, rect: rect(34, 2, 56, 12), name: '观景草坪' });
  api.room(W.F, 'RF-WC', 'wc', '洗手间', rect(60, 4, 68, 12), [{ x0: 62.5, z0: 4, x1: 65.5, z1: 4, side: 'N' }]);
  api.room(E.F, 'MECH', 'mech', '设备区', rect(48, -14, 60, -4));
  for (const [u, v] of [[30, 8], [40, -10], [48, 10], [58, 12], [72, -8], [76, 6]]) api.feature({ type: 'tree', frame: W.F, lu: u, lv: v });
  for (const [u, v] of [[28, -10], [28, 10], [72, -10], [72, 10]]) api.feature({ type: 'tree', frame: M.F, lu: u, lv: v });
  for (const [u, v] of [[30, -8], [62, 8], [40, -2]]) api.feature({ type: 'tree', frame: E.F, lu: u, lv: v });
}
