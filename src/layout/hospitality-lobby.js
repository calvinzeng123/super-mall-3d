// H/A 首层独立公共层。陈设、门洞和行走目标共享局部坐标；中央五米横廊始终留空。
import { rect } from './geom.js';

const wall = (a, b, door, material = 'stone') => ({ a, b, material, ...(door ? { door } : {}) });

export function createHospitalityLobby(frame, usage) {
  const hotel = usage === 'hotel';
  const zones = [
    { id: 'reception', name: hotel ? '礼宾 · 办理入住' : '公寓接待 · 办理入住', rect: rect(12, -18, 33.2, -3.5), navigationPoint: [25, -6.1] },
    { id: 'restaurant', name: hotel ? '云宴 · 全日制餐厅' : '邻里餐厅 · 共享厨房', rect: rect(-10.8, -18, 10.8, -3.5), navigationPoint: [0, -4.8] },
    { id: 'fitness', name: hotel ? '云境 · 健身与瑜伽' : '住客健身房 · 瑜伽', rect: rect(-28, -18, -13, -3.5), navigationPoint: [-20.5, -5.2] },
    { id: 'lounge', name: hotel ? '悦庭 · 钢琴会客厅' : '共享客厅 · 阅读书廊', rect: rect(-28, 3.5, -11.2, 18), navigationPoint: [-20, 5] },
    { id: 'business', name: hotel ? '行政酒廊 · 商务办公' : '共享办公 · 住客会客厅', rect: rect(-9.6, 3.5, 10.8, 18), navigationPoint: [0, 5] },
    { id: 'guest-service', name: hotel ? '礼宾行李 · 自助服务' : '信报快递 · 洗衣房', rect: rect(12.4, 3.5, 19, 18), navigationPoint: [15.7, 5.1] },
    { id: 'washroom', name: '公共洗手间 · 无障碍', rect: rect(20.5, 8.2, 28.5, 18), navigationPoint: [24.5, 10.2] },
  ];
  const obstacles = [];
  const add = (id, type, x, z, w, d, height, extra = {}) => {
    const item = { id, type, rect: rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2), height, ...extra };
    obstacles.push(item);
    return item;
  };
  const partitions = [
    wall([-28.3, -18.5], [-28.3, -3.5], null, 'glass'),
    wall([-12.5, -18.5], [-12.5, -3.5], null, 'glass'),
    wall([-28.3, -3.5], [-12.5, -3.5], { at: 7.8, width: 3.2 }, 'glass'),
    wall([20.5, 8.2], [28.5, 8.2], { at: 4, width: 1.8 }),
    wall([20.5, 8.2], [20.5, 18.5]),
    wall([28.5, 8.2], [28.5, 18.5]),
    wall([20.5, 18.5], [28.5, 18.5]),
    wall([12, 10], [19.4, 10], { at: 3.7, width: 1.6 }, 'glass'),
    wall([12, 10], [12, 18.5], null, 'glass'),
    wall([19.4, 10], [19.4, 18.5], null, 'glass'),
  ];
  // Solid cubicle dividers and real door openings; the front washroom aisle
  // remains wide enough for turning rather than hiding toilets in a black box.
  for (const x of [23.1, 25.7]) partitions.push(wall([x, 13.8], [x, 18.2]));
  for (const [x0, x1] of [[20.8, 23.1], [23.1, 25.7], [25.7, 28.2]]) {
    partitions.push(wall([x0, 13.8], [x1, 13.8], { at: (x1 - x0) / 2, width: 1.05 }));
  }
  add('check-in-marble-desk', 'reception', 23, -10.6, hotel ? 12.8 : 10.4, 1.65, 1.16);
  add('reception-fluted-backdrop', 'backdrop', 23, -17.1, 16.8, .45, 4.9);
  add('reception-luggage-cart', 'luggage-cart', 31.5, -14.6, 1.15, 1.5, 1.65);
  add('reception-concierge-desk', 'concierge', 14.5, -7.1, 2.4, 1.3, 1.06);
  add('reception-planter-west', 'indoor-tree', 13.6, -15.6, 1.55, 1.55, 3.2);
  add('reception-planter-east', 'indoor-tree', 31.6, -5.5, 1.35, 1.35, 2.8);
  for (const [i, x] of [19.2, 23.1, 27].entries()) add(`staff-chair-${i}`, 'chair', x, -12.2, .64, .65, .95, { rotation: Math.PI });
  add('restaurant-buffet', hotel ? 'buffet' : 'kitchen', 0, -16.5, 17.7, 1.35, 1.1);
  const tables = hotel ? [[-7.3, -11.4], [0, -11.4], [7.3, -11.4], [-7.3, -6.8], [7.3, -6.8]]
    : [[-7, -10.9], [0, -10.9], [7, -10.9], [-6.6, -6.4], [6.6, -6.4]];
  for (const [i, [x, z]] of tables.entries()) {
    add(`restaurant-table-${i}`, 'dining-table', x, z, 2.3, 1.3, .77, { seats: 4 });
    for (const [j, dx, dz, rotation] of [[0, -.65, -.99, 0], [1, .65, -.99, 0], [2, -.65, .99, Math.PI], [3, .65, .99, Math.PI]]) {
      add(`dining-chair-${i}-${j}`, 'chair', x + dx, z + dz, .56, .58, .94, { rotation });
    }
  }
  for (const [i, x] of [-26, -22.8, -19.6].entries()) add(`fitness-treadmill-${i}`, 'treadmill', x, -14.4, 1.25, 2.35, 1.55);
  add('fitness-weights', 'weights', -15.3, -15.9, 2.6, 1.05, 1.15);
  add('fitness-bench', 'weight-bench', -15.5, -11.5, .85, 2.2, .65);
  add('fitness-towels', 'towel-rack', -26.7, -8.4, 1.35, .7, 1.85);
  // Mats are deliberately flush: their renderer is decorative while their
  // surrounding activity area remains walkable.
  const floorDetails = [
    ...[-23, -19].map((x, i) => ({ id: `yoga-${i}`, type: 'yoga-mat', rect: rect(x - .7, -9.7, x + .7, -7.4) })),
  ];
  for (const [i, [x, z]] of [[-10.9, -3.4], [11.4, -3.4], [-10.3, 3.4], [11.4, 3.4]].entries())
    add(`lobby-marble-column-${i}`, 'structure-column', x, z, .34, .34, 6);
  add('fitness-mirror', 'mirror', -20.5, -18.35, 14.3, .08, 3.2);

  const loungeSets = hotel ? [[-23.6, 9.2], [-16.4, 9.2]] : [[-23.5, 10.5], [-16.5, 10.5]];
  for (const [i, [x, z]] of loungeSets.entries()) {
    add(`lounge-sofa-${i}`, 'sofa', x, z + 1.8, 4.5, 1.1, .94, { color: hotel ? '#355c54' : '#bc9b78' });
    add(`lounge-coffee-${i}`, 'coffee-table', x, z, 2.2, 1.15, .44);
    for (const [j, dx] of [-1.35, 1.35].entries()) add(`lounge-armchair-${i}-${j}`, 'armchair', x + dx, z - 1.5, 1.1, 1.05, .9, { rotation: Math.PI });
  }
  if (hotel) {
    add('lounge-grand-piano', 'piano', -14.4, 15.2, 3.5, 2.3, 1.2);
    add('lounge-piano-seat', 'piano-seat', -14.4, 13.5, 1.15, .55, .5);
    add('lounge-feature-wall', 'art-wall', -23.1, 17.5, 7.4, .35, 3.8);
  } else {
    add('lounge-library', 'bookcase', -20, 17.45, 14.7, .9, 3.8);
    add('lounge-reading-table', 'worktable', -20, 14.1, 5.4, 1.05, .77);
  }
  add('lounge-tree', 'indoor-tree', -27, 15.7, 1.45, 1.45, 3.6);
  add('business-cafe-bar', 'cafe-bar', 0, 16.7, 16, 1.25, 1.12);
  if (hotel) {
    for (const [i, x] of [-6, 6].entries()) {
      add(`business-round-table-${i}`, 'round-table', x, 9.1, 2.25, 2.25, .76);
      for (const [j, dx, dz, rotation] of [[0, -1.65, 0, -Math.PI / 2], [1, 1.65, 0, Math.PI / 2], [2, 0, 1.65, Math.PI]]) {
        add(`business-lounge-chair-${i}-${j}`, 'armchair', x + dx, 9.1 + dz, 1.05, 1.05, .9, { rotation });
      }
    }
    add('business-writing-desk', 'worktable', 0, 12.4, 5.2, 1.3, .76);
    for (const [i, x] of [-1.5, 1.5].entries()) add(`business-desk-chair-${i}`, 'chair', x, 11.3, .6, .6, .94);
  } else {
    for (const [i, x] of [-5.1, 5.1].entries()) {
      add(`cowork-table-${i}`, 'worktable', x, 9.5, 5.6, 1.5, .77);
      for (const [j, dx] of [-1.8, 0, 1.8].entries()) for (const side of [-1, 1]) {
        add(`cowork-chair-${i}-${j}-${side}`, 'chair', x + dx, 9.5 + side * 1.17, .6, .6, .94, { rotation: side > 0 ? Math.PI : 0 });
      }
    }
  }
  if (hotel) {
    add('guest-service-luggage', 'luggage-rack', 13, 14.1, .9, 6.3, 2.2);
    add('guest-service-safe', 'lockers', 18.4, 14.2, .9, 6.2, 2.3);
    add('guest-service-console', 'concierge', 15.7, 7.2, 4.6, 1.1, 1.05);
  } else {
    add('guest-service-parcel', 'lockers', 15.7, 7.2, 5.4, .85, 2.25);
    add('guest-service-washers', 'washers', 15.5, 16.7, 4.6, 1.2, 1.3);
    add('guest-service-linen', 'towel-rack', 13, 12.5, 1.1, 1.4, 2.2);
  }
  for (const [i, x] of [21.95, 24.4, 26.95].entries()) add(`washroom-wc-${i}`, 'wc', x, 17.1, .82, 1.12, .9);
  add('washroom-vanity', 'vanity', 27.4, 11.2, 1.2, 2.7, .87, { rotation: Math.PI / 2 });
  const circulation = [
    rect(-37, -2.5, 37, 2.5),
    rect(33.8, -19, 37, 3.3),
    rect(-29.6, -4, 33.5, -2.4),
    rect(-29.6, 2.4, 29.5, 4),
    ...zones.map(z => z.rect),
    rect(19, 2.4, 29.5, 10),
  ];
  return { kind: 'hospitality', usage, frame, height: 6.5, zones, partitions, obstacles, floorDetails, circulation,
    mainAxis: rect(-37, -2.5, 37, 2.5),
    navigationTargets: [...zones.map(z => ({ id: z.id, point: z.navigationPoint })),
      { id: hotel ? 'luggage-room' : 'laundry-room', point: [15.7, 13] },
      { id: 'west-lifts', point: [-32.5, 1.8] }, { id: 'west-stairs', point: [-33, -2.8] },
      { id: 'east-stairs', point: [33, 2.6] }],
    chandelier: { x: 23, z: 0, radius: 2.6, height: 4.6 },
  };
}
