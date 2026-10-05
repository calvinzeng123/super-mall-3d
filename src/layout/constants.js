// 业态表、翼楼通用尺寸、中庭套件（套件局部坐标，数值沿用 v1 已验证的中庭）。单位：米。
import { rect } from './geom.js';

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
  auto: { label: '新能源汽车', color: '#2d6a8f' },
  edu: { label: '教育培训', color: '#3f8f6d' },
  studio: { label: '设计工作室', color: '#8a6f5a' },
  rink: { label: '真冰场', color: '#4aa3df' },
  convenience: { label: '便利店', color: '#1c7c54' },
  bakery: { label: '面包烘焙', color: '#b7791f' },
};

/** 翼楼半宽、商业街半宽、端部区长度、核心筒长度、商业街通高缝半宽 */
export const HW = 23;
export const SW = 7;
export const END = 6;
export const CORE = 16;
export const SLOT_HW = 2.5;

/** 中庭套件（套件 frame 局部坐标）：1F 洞口、2F 以上洞口、观光梯 */
export const KIT = {
  void1F: { rect: rect(-5, -8, 5, 8), r: 0.6 },
  voidUp: { rect: rect(-17, -10, 17, 10), r: 4 },
  glass: [
    { id: 'GW', x: -15.5, z: 0, door: 'W' },
    { id: 'GE', x: 15.5, z: 0, door: 'E' },
  ],
  shaft: 2.6,
};

/** 扶梯：梯级宽、两条梯道中心距、楼板洞口半宽 */
export const ESC = { width: 1.8, lane: 1.85, slotHalf: 1.85 / 2 + 1.8 / 2 + 0.075 };
