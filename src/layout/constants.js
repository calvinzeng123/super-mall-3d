// 楼层表、建筑范围、核心筒与洞口坐标（单位：米；x 向东，z 向南）。数值来自设计规格第 3、4、6 节。
import { rect } from './geom.js';

export const BUILDING = rect(-60, -40, 60, 40);

export const LEVELS = [
  { id: 'B2', name: 'B2 停车场', short: 'B2', kind: 'parking', elev: -12, height: 3.6,
    theme: { key: 'park-green', floor: 'concrete-green', accent: '#2e9c6a', label: '停车场 · 绿区' } },
  { id: 'B1', name: 'B1 停车场', short: 'B1', kind: 'parking', elev: -8.4, height: 3.9,
    theme: { key: 'park-blue', floor: 'concrete-blue', accent: '#2f6fd6', label: '停车场 · 蓝区 · 车库出入口' } },
  { id: 'B1M', name: 'B1M 美食广场', short: 'B1M', kind: 'food', elev: -4.5, height: 4.5,
    theme: { key: 'food', floor: 'terrazzo-warm', accent: '#dd6b20', label: '美食广场 · 云澜老街 · 精品超市' } },
  { id: '1F', name: '1F 国际精品', short: '1F', kind: 'retail', elev: 0, height: 5.5,
    theme: { key: 'lux', floor: 'marble-white', accent: '#b08d4f', label: '国际精品 · 珠宝腕表 · 美妆' } },
  { id: '2F', name: '2F 潮流服饰', short: '2F', kind: 'retail', elev: 5.5, height: 5.5,
    theme: { key: 'fashion', floor: 'terrazzo-cool', accent: '#2f86b0', label: '潮流服饰 · 运动户外 · 潮玩' } },
  { id: '3F', name: '3F 亲子娱乐', short: '3F', kind: 'retail', elev: 11, height: 5.5,
    theme: { key: 'family', floor: 'wood-warm', accent: '#e0567a', label: '影城 · 儿童乐园 · 主题餐厅' } },
  { id: 'RF', name: 'RF 天台花园', short: 'RF', kind: 'roof', elev: 16.5, height: 6,
    theme: { key: 'roof', floor: 'deck-garden', accent: '#4a9a50', label: '天台花园 · 餐吧 · 摩天轮' } },
];
export const LEVEL_IDS = LEVELS.map((l) => l.id);
export const ALL_LEVELS = LEVEL_IDS;
export const ABOVE_PARKING = ['B1M', '1F', '2F', '3F', 'RF'];

export const CATEGORIES = {
  jewelry: { label: '珠宝腕表', color: '#a8873f' },
  luxury: { label: '精品服饰', color: '#4a4560' },
  beauty: { label: '美妆香氛', color: '#c2577a' },
  tech: { label: '数码科技', color: '#2f6fd6' },
  accessory: { label: '配饰眼镜', color: '#4b6b8a' },
  cafe: { label: '咖啡甜点', color: '#8a5a3c' },
  tea: { label: '茶饮', color: '#3f8f6d' },
  fashion: { label: '潮流服饰', color: '#2f86b0' },
  sports: { label: '运动户外', color: '#2e9c6a' },
  shoes: { label: '鞋履箱包', color: '#7a5c45' },
  toys: { label: '潮玩文创', color: '#e07a2e' },
  home: { label: '家居花艺', color: '#6f7d4c' },
  kids: { label: '亲子儿童', color: '#e8a317' },
  books: { label: '书店文化', color: '#566a8c' },
  cinema: { label: '影城', color: '#b3263b' },
  arcade: { label: '电玩娱乐', color: '#7b4fd6' },
  restaurant: { label: '餐厅', color: '#cf4f2b' },
  food: { label: '美食档口', color: '#dd6b20' },
  snack: { label: '老街小吃', color: '#b23a2a' },
  supermarket: { label: '超市', color: '#2b8a3e' },
  bar: { label: '天台餐吧', color: '#6a3fb5' },
};

// 核心筒：电梯井在侧、电梯厅向走廊开口、楼梯在厅尽头
export const CORE_W = { shafts: rect(-36, -34, -33, -24), lobby: rect(-33, -34, -28, -24), stair: rect(-36, -40, -28, -34) };
export const CORE_E = { shafts: rect(33, 24, 36, 34), lobby: rect(28, 24, 33, 34), stair: rect(28, 34, 36, 40) };
export const SERVICE = { shaft: rect(12, -34, 15.5, -24), lobby: rect(15.5, -34, 20, -24), stair: rect(12, -40, 20, -34) };
export const WC_W = { rect: rect(-28, -40, -20, -24), door: { x0: -25.5, z0: -24, x1: -22.5, z1: -24, side: 'S' } };
export const WC_E = { rect: rect(20, 24, 28, 40), door: { x0: 22.5, z0: 24, x1: 25.5, z1: 24, side: 'N' } };
export const STAIR_S4 = rect(-60, -10, -55, -4);
export const STAIR_S5 = rect(55, 4, 60, 10);

// 中庭洞口
export const VOID_1F = { rect: rect(-5, -8, 5, 8), radius: 0.6 };
export const VOID_UP = { rect: rect(-17, -10, 17, 10), radius: 4 };
export const GLASS_SHAFT = 2.6;
export const GLASS_LIFTS = [
  { id: 'G-W', x: -15.5, z: 0, door: 'W' },
  { id: 'G-E', x: 15.5, z: 0, door: 'E' },
];

// 扶梯：rise·√3 = 水平投影；top/bottom 给出斜段在轴向上的端点坐标
export const ESCALATOR_WIDTH = 1.8;
export const ESCALATOR_LANE = 1.85;
export const ESCALATOR_PAIRS = [
  { pair: 'P0', from: 'B1', to: 'B1M', axis: 'z', sign: 1, top: -24, cross: -16.15, slot: true, label: '停车场 → 美食广场' },
  { pair: 'P1', from: 'B1M', to: '1F', axis: 'z', sign: -1, top: -8, cross: -2.55, slot: false, label: '美食广场 ↔ 1F' },
  { pair: 'P2', from: 'B1M', to: '1F', axis: 'z', sign: 1, top: 8, cross: 2.55, slot: false, label: '美食广场 ↔ 1F' },
  { pair: 'P3', from: '1F', to: '2F', axis: 'z', sign: -1, top: -10, cross: -10.65, slot: false, label: '1F ↔ 2F' },
  { pair: 'P4', from: '1F', to: '2F', axis: 'z', sign: 1, top: 10, cross: 10.65, slot: false, label: '1F ↔ 2F' },
  { pair: 'P5', from: '2F', to: '3F', axis: 'x', sign: 1, centered: true, cross: -15.15, slot: true, label: '2F ↔ 3F' },
  { pair: 'P6', from: '2F', to: '3F', axis: 'x', sign: -1, centered: true, cross: 15.15, slot: true, label: '2F ↔ 3F' },
  { pair: 'P7', from: '3F', to: 'RF', axis: 'x', sign: -1, bottom: -23.5, cross: 0, slot: true, label: '3F → 天台花园' },
];
