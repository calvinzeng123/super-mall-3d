// A complete short operation inside the original first-phase geometry. These
// are surveyed walkable positions, not a separate arena placed over the mall.
const point = (floor, x, z, y = 0) => ({ floor, x, z, y, slope: null });
const hotelZ = -81.1533717;

export const FPS_MISSION = {
  id: 'yunlan-blackout', title: '云澜行动 · 断电撤离', duration: 900,
  briefing: '取得商场终端密钥，进入酒店二楼取回情报，前往公寓 B1 接应点撤离。',
  spawn: { ...point('P1-1F', -135, -98), yaw: Math.atan2(34, -8) },
  teammate: { id: 'echo', name: '回声', ...point('P1-1F', -133, -98) },
  objectives: [
    { id: 'terminal', title: '接入商场终端', description: '清理西翼通道，在终端提取酒店访问密钥。',
      ...point('P1-1F', -169, -90), radius: 2.4, holdSeconds: 2.5, prop: 'terminal' },
    { id: 'intel', title: '取回酒店情报', description: '沿酒店消防梯上至 2F，在走廊取回数据箱。',
      ...point('H-2F', -245, hotelZ, 6.5), radius: 2.4, holdSeconds: 3, prop: 'case' },
    { id: 'extract', title: '抵达公寓 B1 撤离点', description: '通过商场地下连廊前往公寓 B1，守住接应区完成撤离。',
      ...point('A-B1', -35, -220, -4.5), radius: 3.2, holdSeconds: 8, prop: 'extraction' },
  ],
  enemies: [
    { id: 'west-patrol', name: '西翼巡逻', ...point('P1-1F', -179, -87),
      patrol: [point('P1-1F', -178, -87), point('P1-1F', -157, -92)], health: 70 },
    { id: 'hotel-entry', name: '酒店警戒', ...point('H-1F', -220, hotelZ),
      patrol: [point('H-1F', -219, hotelZ), point('H-1F', -241, hotelZ)], health: 70 },
    { id: 'hotel-intel', name: '情报守卫', ...point('H-2F', -258, hotelZ, 6.5),
      patrol: [point('H-2F', -259, hotelZ, 6.5), point('H-2F', -243, hotelZ, 6.5)], health: 90 },
    { id: 'concourse-patrol', name: '地下巡逻', ...point('P1-B1M', -130, -100, -4.5),
      patrol: [point('P1-B1M', -130, -100, -4.5), point('P1-B1M', -151, -94, -4.5)], health: 70 },
    { id: 'extraction-guard', name: '撤离点警戒', ...point('A-B1', -35, -202, -4.5),
      patrol: [point('A-B1', -35, -202, -4.5), point('A-B1', -35, -216, -4.5)], health: 90 },
  ],
  cover: [
    { id: 'west-equipment', ...point('P1-1F', -151, -98.4), w: 2.4, d: 1.15, height: 1.75, style: 'equipment' },
    { id: 'west-freight', ...point('P1-1F', -180, -82.8), w: 2.4, d: 1.15, height: 1.7, style: 'cargo' },
    { id: 'hotel-luggage', ...point('H-1F', -225, hotelZ - 2), w: 2.2, d: 1.1, height: 1.7, style: 'luggage' },
    { id: 'intel-equipment', ...point('H-2F', -236, hotelZ + 2.35, 6.5), w: 2.2, d: 1.1, height: 1.75, style: 'equipment' },
    { id: 'garage-cargo', ...point('A-B1', -32, -204, -4.5), w: 1.2, d: 2.5, height: 1.75, style: 'cargo' },
  ],
};

export const MISSION = FPS_MISSION;
export function createMissionLayout() { return structuredClone(FPS_MISSION); }

/** The existing navigation builder already treats market-stall footprints as
 * solid furniture. Reuse it so tactical props render and collide at one place. */
export function addMissionCollision(layout, mission = FPS_MISSION) {
  for (const c of mission.cover) {
    const level = layout.levels.find(l => l.id === c.floor);
    if (!level) throw new Error(`Missing mission floor: ${c.floor}`);
    if (!level.features.some(f => f.id === c.id)) level.features.push({ ...c, type: 'market-stall', tactical: true });
  }
  layout.mission = mission;
  return layout;
}
