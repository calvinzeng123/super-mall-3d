// 云澜物业社区住宅的场地几何（唯一来源）：云澜·北苑 T1/T2 立于一期北侧裙房屋面（34.0 m），
// 云澜·西苑 W1/W2 位于西停车场北排。坐标为世界米制 [x, z]，北为 −z。
const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};
const r2 = (v) => Math.round(v * 100) / 100;

// 7F 空中会所 · 8F–13F 大平层（3.6 m）· 14F–24F 错层复式（3.3 m）· RF 屋顶花园
const northLevels = [
  { short: '7F', levelNumber: 7, elev: 34.0, height: 5.0, kind: 'club' },
  ...Array.from({ length: 6 }, (_, i) => ({ short: `${8 + i}F`, levelNumber: 8 + i, elev: r2(39.0 + i * 3.6), height: 3.6, kind: 'community' })),
  ...Array.from({ length: 11 }, (_, i) => ({ short: `${14 + i}F`, levelNumber: 14 + i, elev: r2(60.6 + i * 3.3), height: 3.3, kind: 'community' })),
  { short: 'RF', elev: 96.9, height: 3.2, kind: 'roof' },
];

export const NORTH_SITE = deepFreeze({
  plateZ: [-240, -224], podiumRoof: 34.0,
  // 方庭北门西移 8 m 至 SQ-N3，原北门厅让给 T2 住户大堂
  movedNorthDoor: { id: 'P1-SQ-N', x0: -232, x1: -224, z: -240 },
  towers: [
    { id: 'T1', frame: [-260, -232], plate: [-278, -242], core: [-264, -256],
      hardstand: { x0: -278, z0: -255, x1: -242, z1: -245 } },
    { id: 'T2', frame: [-212, -232], plate: [-228, -196], core: [-216, -208],
      hardstand: { x0: -228, z0: -255, x1: -196, z1: -245 } },
  ],
  levels: northLevels,
  // The tower owns no level below 34 m: its cores rise through these P1 host levels.
  hostDoorLevels: ['P1-B2', 'P1-B1', 'P1-1F'],
  hostPassLevels: ['P1-B1M', 'P1-2F', 'P1-3F', 'P1-4F', 'P1-5F', 'P1-6F'],
});

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
