// 西停车场南口交通中心。主车道 z=-53 和 x=-427 步行脊原位保留。
import { rect, rectPoly, frame, lrectPoly, convexOverlap } from './geom.js';
import { addPlaza } from './campus.js';

export function addTransitCenter(site, extensions) {
  if (site.transitCenter) return site.transitCenter;
  if (!site.westParking) return null;
  const bounds = rect(-478, -66, -379, -32), poly = rectPoly(bounds);
  const plan = { id: 'P1-transit-center', name: '云澜交通中心 · 大巴与的士', rect: bounds, poly,
    platforms: [], vehicles: [], shelters: [], seats: [], kiosks: [], signs: [], trees: [], obstacles: [],
    throughLane: rect(-480, -56.5, -375, -49.5), pedestrianSpine: rect(-428.5, -66, -425.5, -32),
    busBays: [rect(-474, -62.2, -454, -57.3), rect(-452, -62.2, -432, -57.3)],
    taxiBays: [], paths: [] };
  const retired = new Set(['WP-A9', 'WP-B9']);
  const west = site.westParking;
  // Replace a deliberate pair of surface rows, rather than placing transport
  // props over the existing cars, charging points or the underground ramps.
  extensions.surfaceParking = extensions.surfaceParking.filter(lot => !retired.has(lot.id));
  west.lots = west.lots.filter(lot => !retired.has(lot.id));
  west.islands = west.islands.filter(island => !convexOverlap(island.poly, poly));
  const retiredRoads = new Set([...retired].map(id => `west-aisle-${id}`));
  extensions.roads = extensions.roads.filter(r => !retiredRoads.has(r.id));
  west.roads = west.roads.filter(r => !retiredRoads.has(r.id));
  site.walk = site.walk.filter(w => ![...retired].some(id => w.id === `${id}-aisle`));
  west.stallCount = west.lots.reduce((n, lot) => n + lot.stalls.length, 0);
  west.evCount = west.lots.flatMap(lot => lot.stalls).filter(s => s.type === 'ev').length;
  west.accessibleCount = west.lots.flatMap(lot => lot.stalls).filter(s => s.type === 'accessible').length;
  const platform = (id, r, name) => {
    const p = { id, name, rect: r, poly: rectPoly(r) }; plan.platforms.push(p); addPlaza(site, id, p.poly, null); return p;
  };
  platform('transit-bus-platform', rect(-476, -65.8, -431, -62.4), '大巴站 · 01 / 02');
  platform('transit-taxi-platform', rect(-423, -40.4, -380, -32.8), '的士 · 网约车上客区');
  platform('transit-service-plaza', rect(-423, -65.5, -380, -57.2), '交通咨询 · 候车广场');
  const path = (id, r) => {
    const p = { id, kind: 'promenade', rect: r, poly: rectPoly(r), outdoor: true };
    plan.paths.push(p); site.walk.push(p); return p;
  };
  path('transit-bus-boardwalk', rect(-432, -65.8, -425.5, -62.4));
  path('transit-service-boardwalk', rect(-428.5, -65.5, -420, -62.4));
  path('transit-taxi-boardwalk', rect(-428.5, -40.4, -419, -32.8));
  const road = (id, r, name) => {
    const record = { id, name, width: r.z1 - r.z0, points: [[r.x0, 0, (r.z0 + r.z1) / 2], [r.x1, 0, (r.z0 + r.z1) / 2]], polys: [rectPoly(r)] };
    extensions.roads.push(record); return record;
  };
  road('transit-coach-bays', rect(-476, -62.3, -431, -57.1), '大巴停靠港湾');
  road('transit-taxi-bays', rect(-423, -49.2, -380, -40.4), '出租车 · 网约车港湾');
  // Short tapered-looking entries are on asphalt and connect to the retained
  // seven-metre west entrance lane, outside the pedestrian waiting platforms.
  for (const r of [rect(-476, -60.8, -472, -53), rect(-435, -60.8, -431, -53),
    rect(-423, -53, -419, -44.8), rect(-384, -53, -380, -44.8)]) road(`transit-bay-link-${r.x0}`, r, '交通中心港湾接驳');
  const block = (id, r) => plan.obstacles.push({ id, poly: rectPoly(r) });
  const vehicle = (id, type, x, z, w, d, rotation = 0, extra = {}) => {
    const item = { id, type, x, z, w, d, rotation, ...extra };
    item.poly = lrectPoly(frame(x, z, rotation * 180 / Math.PI), rect(-w / 2, -d / 2, w / 2, d / 2));
    plan.vehicles.push(item); plan.obstacles.push({ id, poly: item.poly }); return item;
  };
  vehicle('transit-coach-01', 'coach', -464.2, -59.8, 12.2, 2.6, 0, { route: '机场快线', color: '#d7dfd6' });
  vehicle('transit-coach-02', 'coach', -442.2, -59.8, 12.2, 2.6, 0, { route: '云澜接驳', color: '#39746c' });
  for (const [i, x] of [-414.5, -407, -399.5, -392, -384.5].entries()) {
    plan.taxiBays.push({ id: `taxi-bay-${i + 1}`, rect: rect(x - 2, -49.1, x + 2, -41.2), accessible: i === 4 });
    if (i !== 3) vehicle(`transit-taxi-${i + 1}`, 'taxi', x, -45.25, 1.8, 4.4, Math.PI, { color: i % 2 ? '#d3c19b' : '#537f71' });
  }
  const shelter = (id, x, z, w, d, name) => {
    const s = { id, x, z, w, d, name, posts: [-w / 2 + .25, -w / 6, w / 6, w / 2 - .25].map(dx => [x + dx, z - d / 2 + .15]) };
    plan.shelters.push(s);
    for (const [i, [px, pz]] of s.posts.entries()) block(`${id}-post-${i}`, rect(px - .11, pz - .11, px + .11, pz + .11));
    // Glass wind screens sit at the back, with a full open boarding edge.
    block(`${id}-wind-screen`, rect(x - w / 2, z - d / 2, x + w / 2, z - d / 2 + .08));
  };
  shelter('transit-bus-shelter', -454, -64.1, 42, 2.8, '大巴 01 · 机场快线 / 02 · 云澜接驳');
  shelter('transit-taxi-shelter', -402, -36.1, 39, 4.7, '的士 / 网约车 · 上车点 T1—T5');
  for (const [i, x, z] of [[1, -469, -64.25], [2, -458, -64.25], [3, -447, -64.25], [4, -436, -64.25],
    [5, -415, -36.7], [6, -404, -36.7], [7, -393, -36.7]]) {
    const item = { id: `transit-seat-${i}`, x, z, w: 3, d: .65 };
    plan.seats.push(item); block(item.id, rect(x - 1.5, z - .325, x + 1.5, z + .325));
  }
  plan.kiosks.push({ id: 'transit-information', x: -416.2, z: -61.4, w: 6.4, d: 5.4, name: '交通咨询 · 行李寄存' });
  // A counter and three shell walls leave the front doorway and staff area open.
  block('transit-info-back', rect(-419.4, -64.1, -413, -63.9));
  block('transit-info-west', rect(-419.4, -64.1, -419.2, -58.7));
  block('transit-info-east', rect(-413.2, -64.1, -413, -58.7));
  block('transit-info-counter', rect(-418.7, -60, -415.2, -59.2));
  for (const [i, x] of [-407, -398, -386].entries()) {
    const item = { id: `transit-tree-${i}`, x, z: -62.7, r: 1.1 };
    plan.trees.push(item); block(item.id, rect(x - 1.1, -63.8, x + 1.1, -61.6));
  }
  plan.signs = [
    { x: -425, z: -33.5, width: 4, text: '云澜交通中心', subtitle: 'BUS · TAXI · RIDE HAILING', rotation: Math.PI },
    { x: -430.6, z: -62.8, width: 2.5, text: '大巴 01 / 02', subtitle: 'AIRPORT / SHUTTLE', rotation: Math.PI / 2 },
    { x: -421, z: -39.6, width: 2.5, text: '的士 T1—T5', subtitle: 'TAXI / PICK-UP', rotation: Math.PI / 2 },
    { x: -410.5, z: -57.8, width: 3.7, text: '商场 →  酒店 →', subtitle: 'MALL · HOTEL · PARKING', rotation: 0 },
  ];
  for (const [i, s] of plan.signs.entries()) block(`transit-sign-${i}`, rect(s.x - .09, s.z - .09, s.x + .09, s.z + .09));
  site.activityExclusions = [...(site.activityExclusions || []), poly];
  site.transitCenter = plan;
  return plan;
}
