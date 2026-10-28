import test from 'node:test';
import assert from 'node:assert/strict';
import { L, inWalk, inSite, midOf } from './helpers.js';
import { HOSPITALITY } from '../src/layout/hospitality.js';
import { convexOverlap, rect, rectPoly, polyBounds, polySamples, pointInPoly } from '../src/layout/geom.js';
import { buildWalkGraph, components } from '../src/layout/walk.js';

const towers = L.buildings.filter(b => b.kind === 'tower');
const floors = bid => L.levels.filter(l => l.building === bid);
const within = (outer, inner, eps = 1e-6) => inner.x0 >= outer.x0 - eps && inner.x1 <= outer.x1 + eps && inner.z0 >= outer.z0 - eps && inner.z1 <= outer.z1 + eps;

test('酒店公寓各20层且首层为大堂、上层10套，四栋30层住宅2至30层各01/02/03三户', () => {
  assert.deepEqual(towers.map(b => b.id), ['H', 'A', 'R1', 'R2', 'R3', 'R4']);
  for (const b of towers) {
    const live = floors(b.id).filter(l => l.levelNumber);
    const n = b.usage === 'residential' ? 30 : 20;
    assert.equal(live.length, n, `${b.id} 层数`);
    for (const [i, lv] of live.entries()) {
      assert.equal(lv.levelNumber, i + 1);
      assert.equal(lv.units.length, lv.levelNumber === 1 ? 0 : b.usage === 'residential' ? 3 : 10, lv.id);
      if (b.usage === 'residential' && lv.levelNumber > 1) {
        assert.deepEqual(lv.units.map(u => u.residence.prototype), ['01', '02', '03']);
        assert.deepEqual(lv.units.map(u => u.residence.type), ['three-bedroom', 'three-bedroom', 'four-bedroom']);
        assert.deepEqual(lv.units.map(u => u.residence.area), [179.4, 179.4, 202.4]);
        assert.deepEqual(lv.units.map(u => u.residence.beds.length), [3, 3, 4]);
        assert.notDeepEqual(lv.units[0].residence.partitions, lv.units[1].residence.partitions, `${lv.id} 01/02必须保留不同实际布局`);
      }
    }
    const bounds = polyBounds(b.outline);
    assert.ok(within(b.usage === 'residential' ? HOSPITALITY.residential : b.id === 'A' ? HOSPITALITY.east : HOSPITALITY.west, bounds));
    // Mall outlines are concave: SAT convexOverlap would incorrectly reject a
    // tower fitted into the existing west-wing recess. Probe the true polygon.
    for (const old of L.buildings.filter(q => q.kind === 'mall' || q.kind === 'street'))
      for (const p of polySamples(b.outline,.75,.03)) assert.ok(!pointInPoly(p,old.outline), `${b.id} 不应改占原商场`);
  }
  assert.equal(towers.flatMap(b => floors(b.id)).flatMap(l => l.units).length, 728);
});

test('每套有床和独卫，套内隔间、门洞与床均在实际房间范围内', () => {
  for (const b of towers) for (const lv of floors(b.id)) for (const u of lv.units) {
    const home = u.residence, outer = u.rects[0];
    assert.equal(u.style, 'residence');
    assert.ok(home.beds.length >= 1 && home.bathrooms.length >= 1, u.id);
    assert.equal(home.entryDoor.width, home.suitePlan ? .91 : 1.1);
    assert.ok(home.entryDoor.at - home.entryDoor.width / 2 > 0 && home.entryDoor.at + home.entryDoor.width / 2 < outer.x1);
    for (const z of home.rooms) assert.ok(within(outer, z.rect), `${u.id}/${z.id} 超出套内`);
    for (const bath of home.bathrooms) {
      // Residential bathrooms use the surveyed Blender plans rather than the
      // superseded 2.6 x 3m rectangular placeholder; actual navigation is tested.
      const minWidth = home.prototype ? 2 : 2.6, minDepth = home.prototype ? 2.2 : 3;
      assert.ok(bath.rect.x1 - bath.rect.x0 >= minWidth - 1e-6 && bath.rect.z1 - bath.rect.z0 >= minDepth - 1e-6, `${u.id} 卫浴尺寸超出已核验样板范围`);
      assert.ok(home.rooms.some(r => r.id === bath.id && r.kind === 'bathroom'));
    }
    for (const bed of home.beds) {
      const room = home.rooms.find(r => r.id === bed.room && r.kind === 'bedroom');
      assert.ok(room, `${u.id} 床没有所属卧室`);
      const footprint = rect(bed.x - bed.w / 2, bed.z - bed.d / 2, bed.x + bed.w / 2, bed.z + bed.d / 2);
      assert.ok(within(room.rect, footprint), `${u.id} 床穿出卧室`);
      for (const bath of home.bathrooms) assert.ok(!convexOverlap(rectPoly(footprint), rectPoly(bath.rect)), `${u.id} 床压到卫浴`);
    }
    for (const p of home.partitions) {
      for (const q of [p.a, p.b]) assert.ok(within(outer, rect(q[0], q[1], q[0], q[1])), `${u.id} 隔墙超界`);
      if (p.door) {
        const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
        const minDoor = home.suitePlan ? .7 : p.role === 'measured-shower' ? .75 : .8;
        assert.ok(p.door.width >= minDoor - 1e-6 && p.door.at - p.door.width / 2 >= -1e-6 && p.door.at + p.door.width / 2 <= len + 1e-6, `${u.id} 隔间门不成立`);
      }
    }
    assert.ok(!lv.rooms.some(r => r.type === 'wc'), `${lv.id} 私卫不应登记为公共独立用房`);
  }
});

test('地下、空中连接为真实连续宽度的通道，门户两侧等标高且都能落到走道', () => {
  const paths = L.extensions.paths.filter(p => p.level);
  const accessible=(lv,p)=>inWalk(lv,p)||paths.some(path=>path.level===lv.id&&path.slab.pieces.some(s=>pointInPoly(p,s.outer)&&!s.holes.some(h=>pointInPoly(p,h))));
  assert.ok(paths.some(p => p.kind === 'skybridge'));
  assert.ok(paths.some(p => p.id === 'hotel-mall-metro'));
  assert.ok(paths.some(p => p.id === 'residential-mall-metro'));
  assert.ok(paths.some(p => p.id === 'shared-west-tunnel'));
  assert.ok(paths.some(p => p.id === 'H-shared-south-collector'));
  assert.ok(L.entrances.some(e => e.sharedGarage && e.level === 'H-B2' && e.to === 'P1-B1'));
  for (const p of paths) {
    const lv = L.levels.find(l => l.id === p.level);
    assert.ok(p.width >= (p.expansion ? 2.2 : 5));
    assert.ok(p.slab.pieces.length >= (p.expansion ? 1 : p.points.length - 1));
    assert.ok(p.points.every(q => Math.abs(q[1] - lv.elev) < 1e-6));
    for (let i = 0; i < p.points.length - 1; i++) {
      const a = p.points[i], b = p.points[i + 1];
      if(!p.expansion) assert.ok(Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[2] - b[2]) < 1e-6, `${p.id} 应是可构建正交通道`);
      assert.ok(accessible(lv, [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2]), `${p.id} 只有图没有路`);
    }
  }
  for (const e of L.entrances.filter(e => e.extension)) {
    const a = L.levels.find(l => l.id === e.level), b = L.levels.find(l => l.id === e.to), [x, z] = midOf(e.seg);
    if (e.to === 'site') {
      assert.equal(a.elev, 0);
      assert.ok(inWalk(a, [x - e.nx, z - e.nz]) && inSite([x + e.nx, z + e.nz]), `${e.id} 地面入口未接通`);
      continue;
    }
    assert.equal(a.elev, b.elev, `${e.id} 门户有高差`);
    // A façade opening may coincide with the bridge portal. Its outward
    // threshold is then physically on a connected source-owned bridge plate.
    const support=(lv,q)=>accessible(lv,q)||(e.architecturalOpening&&paths.some(path=>
      [path.from,path.to].includes(lv.id)&&path.slab.pieces.some(s=>pointInPoly(q,s.outer)&&!s.holes.some(h=>pointInPoly(q,h)))));
    assert.ok(support(a, [x - e.nx, z - e.nz]) && support(b, [x + e.nx, z + e.nz]), `${e.id} 门两侧没有实体走道`);
  }
  const comp = components(buildWalkGraph(L));
  const first = comp.get(`ent:${L.entrances.find(e => e.building === 'M').id}`);
  assert.notEqual(first, undefined);
  for (const b of towers) for (const lv of floors(b.id)) for (const u of lv.units) assert.equal(comp.get(`unit:${u.id}`), first, `${u.id} 到不了地铁网络`);
});

test('住宅独立双坡道连接住客停车层，酒店公寓地库通过既有一期车道抵达', () => {
  const ramps = L.ramps.filter(r => r.building === 'R1');
  assert.deepEqual(new Set(ramps.map(r => r.type)), new Set(['street-in', 'street-out']));
  assert.ok(!convexOverlap(ramps[0].poly, ramps[1].poly));
  for (const r of ramps) {
    const run = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z);
    assert.ok(Math.abs(r.to.y - r.from.y) / run <= 0.150001);
    const low = r.from.y < r.to.y ? r.from : r.to;
    assert.equal(low.level, 'R1-B1');
    assert.ok(inWalk(L.levels.find(l => l.id === low.level), [low.x, low.z]));
  }
  for (const b of towers) {
    const park = floors(b.id).find(l => l.kind === 'parking');
    assert.ok(park && park.parking.stalls.length >= 6, `${b.id} 缺真实停车位`);
  }
  assert.ok(L.entrances.some(e => e.level === 'H-B2' && e.to === 'P1-B1'));
  assert.ok(L.entrances.some(e => e.level === 'A-B2' && e.to === 'P1-B1'));
});

test('地下车行连廊和空桥整条中心线可实际步行，转角平台没有掉落缺口', async () => {
  const { buildNav, clear, step } = await import('../src/layout/nav.js');
  const nav = buildNav(L);
  for (const p of L.extensions.paths.filter(p => p.level)) {
    let s = { floor: p.level, x: p.points[0][0], y: p.points[0][1], z: p.points[0][2], slope: null };
    assert.ok(clear(nav, s), `${p.id} 起点不可站立`);
    for (let i = 1; i < p.points.length; i++) {
      const q = p.points[i], prev = p.points[i - 1], len = Math.hypot(q[0] - prev[0], q[2] - prev[2]);
      // 最后一个点是门线或栏杆端，留0.6m站位；穿门另由所有entrances双向测试覆盖。
      const inset = i === p.points.length - 1 ? 0.6 : 0;
      const tx = q[0] - (q[0] - prev[0]) / len * inset, tz = q[2] - (q[2] - prev[2]) / len * inset;
      const dx = tx - s.x, dz = tz - s.z, n = Math.ceil(Math.hypot(dx, dz) / 0.1);
      for (let j = 0; j < n; j++) s = step(nav, s, dx / n, dz / n, 0);
      assert.ok(Math.hypot(s.x - tx, s.z - tz) < 0.03, `${p.id} 段${i}中途被挡在${s.x},${s.z}`);
      assert.ok(clear(nav, s), `${p.id} 转角或终点不可站立`);
    }
  }
});

test('12部塔楼电梯逐层贯通井道，轿厢尺度在楼板洞内有余量', () => {
  const lifts = L.elevators.filter(e => e.tower);
  assert.equal(lifts.length, 12);
  for (const e of lifts) {
    for (const id of e.serves) {
      const lv = L.levels.find(l => l.id === id), hole = lv.voids.find(v => v.elevator === e.id);
      assert.ok(hole && hole.kind === 'shaft', `${e.id}/${id} 缺少贯通井道`);
      assert.ok(hole.rect.x1 - hole.rect.x0 > e.w - 0.26 && hole.rect.z1 - hole.rect.z0 > e.d - 0.26, `${e.id}/${id} 轿厢擦楼板`);
      assert.ok(lv.slab.pieces.some(p => p.holes.includes(hole.poly)), `${e.id}/${id} 洞口只写在说明中`);
    }
  }
});

test('住宅两条独立坡道均可从地面步行下库及反向上行，标高连续变化', async () => {
  const { buildNav, clear, step } = await import('../src/layout/nav.js');
  const nav = buildNav(L);
  for (const r of L.ramps.filter(r => r.building === 'R1')) for (const reverse of [false, true]) {
    const a = reverse ? r.to : r.from, b = reverse ? r.from : r.to;
    const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    let s = { floor: a.level === 'street' ? 'ground' : a.level, x: a.x - ux, z: a.z - uz, y: a.y, slope: null }, slopeSeen = false;
    assert.ok(clear(nav, s), `${r.id} ${reverse} 坡前无站位`);
    const n = Math.ceil((len + 2) / 0.1);
    for (let i = 0; i < n; i++) {
      const prevY = s.y;
      s = step(nav, s, ux * (len + 2) / n, uz * (len + 2) / n, 0);
      slopeSeen ||= !!s.slope;
      assert.ok(Math.abs(s.y - prevY) <= 0.016, `${r.id} 高差跳跃`);
      assert.ok(s.y >= -4.20001 && s.y <= 0.00001);
    }
    assert.ok(slopeSeen, `${r.id} 只传送并未经过坡道`);
    assert.equal(s.floor, b.level === 'street' ? 'ground' : b.level);
    assert.equal(s.slope, null);
    assert.ok(Math.hypot(s.x - b.x - ux, s.z - b.z - uz) < 0.01 && clear(nav, s), `${r.id} 未走出坡道`);
    assert.equal(s.y, b.y);
  }
});

test('住宅→二期→地铁→一期→西侧公共停车附库完整地下链路可连续双向步行', async () => {
  const { buildNav, clear, step } = await import('../src/layout/nav.js');
  const nav = buildNav(L);
  // 实际走道内的转点：绕 A 圆厅西侧环道避开新 B1/B2 双车坡，
  // 再避开原商场核心筒和站厅设施，不穿墙或借助传送/飞行。
  const route = [[49, -218], [57.5, -218], [57.5, -190], [106.066, -190], [106.066, -134.402], [90.066, -124.066], [90.066, -106.066], [69.266, -74.066], [50.066, -54.866], [46.668, -46.668], [43.84, -43.84], [5.44, -10.24], [-5.76, -10.24], [-45.19, -45.19], [-48.02, -48.02], [-109.62, -97.62], [-149.62, -141.62], [-152.82, -144.02], [-180.82, -172.02], [-250.42, -194.42], [-278.5, -200], [-281.5, -200], [-304, -200], [-342, -200]];
  const order = ['R1-B1', 'P2-B1', 'M-B1', 'P1-B1M', 'WPG-B1'];
  for (const reverse of [false, true]) {
    const points = reverse ? [...route].reverse() : route, expected = reverse ? [...order].reverse() : order;
    let s = { floor: expected[0], x: points[0][0], z: points[0][1], y: nav.floors.get(expected[0]).y, slope: null };
    const visited = [s.floor];
    assert.ok(clear(nav, s));
    for (const [x, z] of points.slice(1)) {
      const dx = x - s.x, dz = z - s.z, n = Math.ceil(Math.hypot(dx, dz) / 0.1);
      for (let j = 0; j < n; j++) {
        s = step(nav, s, dx / n, dz / n, 0);
        if (visited[visited.length - 1] !== s.floor) visited.push(s.floor);
      }
      assert.ok(Math.hypot(s.x - x, s.z - z) < 0.03, `${reverse ? '反向' : '正向'} ${s.floor} 去${x},${z}中途被挡`);
      assert.ok(clear(nav, s), `${s.floor} 经过点不可站立`);
    }
    assert.deepEqual(visited, expected);
    assert.equal(s.slope, null);
  }
});
