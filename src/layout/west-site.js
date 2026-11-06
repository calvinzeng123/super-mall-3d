// 云澜·西苑 W1/W2 的场地几何（唯一来源）：两栋板楼位于西停车场北排。
// 坐标为世界米制 [x, z]，北为 −z。由 community-sites.js 拆出（P0a，内容不变），西苑包维护本文件。
const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

export const WEST_SITE = deepFreeze({
  plot: { x0: -482, z0: -250, x1: -368, z1: -204 },
  towers: [
    { id: 'W1', center: [-458.3, -236.4], core: [-5.0, 10.7] },   // core = local x-range
    { id: 'W2', center: [-392.3, -236.4], core: [-10.1, 5.6] },
  ],
  slab: { w: 43.4, d: 19.2 },
  fireRoad: { x0: -482, z0: -221.8, x1: -368, z1: -211.8 },
  levels: { B2: -8.4, B1: -4.5, lobbyHeight: 4.5, floorHeight: 3.0, top: 28, roof: 85.5 },
});
