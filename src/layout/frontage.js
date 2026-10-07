// 店面样式与门洞：渲染（storefronts.js、street.js）与第一人称导航（nav.js）共用，保证"看到的门"就是"走得进去的门"。

/** 店面样式：布局数据里的 style 为准；美食层的档口与小吃改为开敞柜台 */
export function storeStyle(lv, u) {
  const cat = u.brand.cat;
  if (u.style === 'showroom') return 'glass';
  if (u.style && u.style !== 'glass') return u.style;
  if (lv.kind === 'food' && ['food', 'snack'].includes(cat)) return 'stall';
  if (cat === 'cinema') return 'cinema';
  return 'glass';
}

/** 玻璃店面的门：宽度与门中心（门面局部坐标，从门面起点量）；门面不足 3m 时没有门（宽度 0） */
export function glassDoors(style, len) {
  const width = len >= 5 ? Math.min(3.2, len * 0.3) : len >= 3 ? 1.8 : 0;
  const at = style === 'market' ? [len * 0.25, len * 0.75] : [len / 2];
  return { width, at };
}

/** 三期街巷店面的门宽（居中） */
export const streetDoor = (len) => Math.min(2.2, len * 0.3);

const GLASS = new Set(['glass', 'cinema', 'market']);

/**
 * 门面上可以走过去的区间 [[a, b], ...]（门面局部坐标）。
 * 玻璃店面只有门洞可过；没有门的窄门面整段放开（否则这家店进不去）；
 * 档口、老街、餐吧、酒吧亭整段敞开；冰场四周封闭。
 */
export function doorGaps(style, len) {
  if (style === 'residence') return [[(len - 1.25) / 2, (len + 1.25) / 2]];
  if (style === 'rink') return [];
  if (GLASS.has(style)) {
    const { width, at } = glassDoors(style, len);
    return width ? at.map((c) => [c - width / 2, c + width / 2]) : [[0, len]];
  }
  if (style === 'street') {
    const w = streetDoor(len);
    return [[(len - w) / 2, (len + w) / 2]];
  }
  return [[0, len]];
}
