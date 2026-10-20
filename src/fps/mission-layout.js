// A complete short operation inside the original first-phase geometry. These
// are surveyed walkable positions, not a separate arena placed over the mall.
const point = (floor, x, z, y = 0) => ({ floor, x, z, y, slope: null });
const hotelZ = -81.1533717;
const carExtraction = {
  id: 'extract-car', title: '公寓 B1 · 装甲接应车', description: '穿过一期地下连廊，在接应车旁守住 8 秒撤离；也可切换屋顶直升机路线。',
  ...point('A-B1', -35, -220, -4.5), radius: 3.2, holdSeconds: 8, prop: 'extraction',
  vehicle: { kind: 'car', x: -41, z: -220, yaw: 0, w: 2.4, d: 5.8 },
};
const helicopterExtraction = {
  id: 'extract-heli', title: '酒店 RF · 直升机接应', description: '沿酒店消防梯或玻璃电梯到 RF，抵达直升机侧门并守住 11 秒。',
  ...point('H-RF', -250, hotelZ - 5, 13.3), radius: 3.2, holdSeconds: 11, prop: 'extraction',
  vehicle: { kind: 'helicopter', x: -250, z: hotelZ - 11, yaw: Math.PI / 2, w: 8.8, d: 3 },
};

export const FPS_MISSION = {
  id: 'yunlan-blackout', title: '云澜行动 · 断电撤离', duration: 900,
  briefing: '取得商场终端密钥和酒店二楼情报。选择地下接应车或酒店屋顶直升机，与回声一起撤离。',
  spawn: { ...point('P1-1F', -135, -98), yaw: Math.atan2(34, -8) },
  teammate: { id: 'echo', name: '回声', ...point('P1-1F', -133, -98) },
  objectives: [
    { id: 'terminal', title: '接入商场终端', description: '清理西翼通道，在终端提取酒店访问密钥。',
      ...point('P1-1F', -169, -90), radius: 2.4, holdSeconds: 2.5, prop: 'terminal' },
    { id: 'intel', title: '取回酒店情报', description: '沿酒店消防梯上至 2F，在走廊取回数据箱。',
      ...point('H-2F', -245, hotelZ, 6.5), radius: 2.4, holdSeconds: 3, prop: 'case' },
    carExtraction,
  ],
  extractions: [carExtraction, helicopterExtraction],
  // 可选目标：地下连廊的安防终端。切断监控后敌人视野变短 (.72)。
  bonus: { id: 'security', title: '切断监控', description: '在地下连廊找到安防终端并按住 4 秒，切断商场监控：敌军视野缩小，并补充医疗包与手雷各 1。',
    ...point('P1-B1M', -127, -140, -4.5), radius: 2.4, holdSeconds: 4, prop: 'security' },
  // 5 片情报 + 3 个补给，沿真实行动路线分布以奖励探索。
  pickups: [
    { id: 'intel-1', kind: 'intel', title: '情报碎片 1', ...point('P1-1F', -173, -84) },
    { id: 'intel-2', kind: 'intel', title: '情报碎片 2', ...point('P1-B1M', -87, -168, -4.5) },
    { id: 'intel-3', kind: 'intel', title: '情报碎片 3', ...point('H-1F', -233, -92) },
    { id: 'intel-4', kind: 'intel', title: '情报碎片 4', ...point('H-2F', -222, -73, 6.5) },
    { id: 'intel-5', kind: 'intel', title: '情报碎片 5', ...point('H-RF', -271, -78, 13.3) },
    { id: 'armor-1', kind: 'armor', title: '护甲板', ...point('A-B1', -28, -188, -4.5) },
    { id: 'grenade-1', kind: 'grenade', title: '手雷补给', ...point('P1-1F', -145, -111) },
    { id: 'medkit-1', kind: 'medkit', title: '医疗补给', ...point('H-2F', -217, -88, 6.5) },
  ],
  enemies: [
    { id: 'west-patrol', name: '西翼侦察', type: 'scout', ...point('P1-1F', -179, -87),
      patrol: [point('P1-1F', -178, -87), point('P1-1F', -157, -92)], health: 72 },
    { id: 'hotel-entry', name: '酒店突击', type: 'assault', ...point('H-1F', -220, hotelZ),
      patrol: [point('H-1F', -219, hotelZ), point('H-1F', -241, hotelZ)], health: 98 },
    { id: 'hotel-intel', name: '情报装甲守卫', type: 'heavy', ...point('H-2F', -258, hotelZ, 6.5),
      patrol: [point('H-2F', -259, hotelZ, 6.5), point('H-2F', -243, hotelZ, 6.5)], health: 145 },
    { id: 'concourse-patrol', name: '地下侦察', type: 'scout', ...point('P1-B1M', -130, -100, -4.5),
      patrol: [point('P1-B1M', -130, -100, -4.5), point('P1-B1M', -151, -94, -4.5)], health: 72 },
    { id: 'extraction-guard', name: '车库突击', type: 'assault', ...point('A-B1', -35, -202, -4.5),
      patrol: [point('A-B1', -35, -202, -4.5), point('A-B1', -35, -216, -4.5)], health: 98 },
    { id: 'roof-guard', name: '屋顶装甲守卫', type: 'heavy', ...point('H-RF', -239, hotelZ, 13.3),
      patrol: [point('H-RF', -239, hotelZ, 13.3), point('H-RF', -257, hotelZ, 13.3)], health: 145 },
    { id: 'roof-scout', name: '屋顶侦察', type: 'scout', ...point('H-3F', -220, hotelZ, 9.9),
      patrol: [point('H-3F', -219, hotelZ, 9.9), point('H-3F', -241, hotelZ, 9.9)], health: 72 },
    // 新增远程压制与精英守卫：精英死亡时由 game.js 掉落护甲。
    { id: 'west-marksman', name: '西翼狙击手', type: 'marksman', ...point('P1-1F', -198, -96),
      patrol: [point('P1-1F', -198, -96), point('P1-1F', -190, -90)], health: 64 },
    { id: 'garage-elite', name: '车库精英守卫', type: 'heavy', elite: true, ...point('A-B1', -45, -207, -4.5),
      patrol: [point('A-B1', -45, -207, -4.5), point('A-B1', -45, -219, -4.5)], health: 145 },
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
export function createMissionLayout(layout) {
  const mission = structuredClone(FPS_MISSION);
  if (layout) {
    const elevations = new Map(layout.levels.map(l => [l.id, l.elev]));
    for (const p of [mission.spawn, mission.teammate, ...mission.objectives, ...mission.extractions,
      ...mission.enemies, ...mission.enemies.flatMap(e => e.patrol), ...mission.cover,
      ...(mission.bonus ? [mission.bonus] : []), ...(mission.pickups || [])]) {
      if (elevations.has(p.floor)) p.y = elevations.get(p.floor);
    }
  }
  return mission;
}

/** The existing navigation builder already treats market-stall footprints as
 * solid furniture. Reuse it so tactical props render and collide at one place. */
export function addMissionCollision(layout, mission = createMissionLayout(layout)) {
  for (const c of mission.cover) {
    const level = layout.levels.find(l => l.id === c.floor);
    if (!level) throw new Error(`Missing mission floor: ${c.floor}`);
    if (!level.features.some(f => f.id === c.id)) level.features.push({ ...c, type: 'market-stall', tactical: true });
  }
  for (const exit of mission.extractions) {
    const level = layout.levels.find(l => l.id === exit.floor), v = exit.vehicle;
    if (level && v) level.features.push({ id: `${exit.id}-vehicle`, type: 'market-stall',
      tactical: true, x: v.x, z: v.z, w: v.w, d: v.d, height: v.kind === 'helicopter' ? 2.5 : 2.2 });
  }
  layout.mission = mission;
  return layout;
}
