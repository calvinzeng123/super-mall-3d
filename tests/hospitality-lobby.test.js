import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, clear } from '../src/layout/nav.js';
import { findPath, traceMotion } from '../src/fps/pathfinding.js';
import { frame, toW, rect, rectPoly, convexOverlap, pointInPoly } from '../src/layout/geom.js';
import { garageCeilingPanels } from '../src/layout/garage-ceiling.js';
import { addTransitCenter } from '../src/layout/transit-center.js';

const layout = buildLayout(), nav = buildNav(layout);
const state = (level, point) => {
  const [x, z] = toW(level.lobbyPlan.frame, ...point);
  return { floor: level.id, x, z, y: level.elev, slope: null };
};
test('酒店、公寓首层为独立七区大堂，二层以上真实套房及公寓顶层复式保留', () => {
  for (const id of ['H', 'A']) {
    const levels = layout.levels.filter(lv => lv.building === id), ground = levels.find(lv => lv.short === '1F');
    assert.equal(ground.kind, 'lobby');
    assert.equal(ground.units.length, 0);
    assert.equal(ground.lobbyPlan.kind, 'hospitality');
    assert.equal(ground.lobbyPlan.zones.length, 7);
    assert.ok(ground.lobbyPlan.obstacles.length > 70);
    assert.equal(levels.flatMap(lv => lv.units).length, 190);
    for (const lv of levels.filter(lv => lv.levelNumber > 1)) assert.equal(lv.units.length, 10, lv.id);
    assert.ok(levels.find(lv => lv.short === '2F').units.every(u => u.residence.suitePlan), `${id} 真实模型不可替换成简模`);
    for (const obstacle of ground.lobbyPlan.obstacles) {
      assert.ok(!convexOverlap(rectPoly(obstacle.rect), rectPoly(ground.lobbyPlan.mainAxis)), `${id} ${obstacle.id} 占用主通廊`);
    }
  }
  assert.equal(layout.levels.find(lv => lv.id === 'A-20F').units.filter(u => u.residence.duplex).length, 10);
  assert.notDeepEqual(layout.levels.find(lv => lv.id === 'A-1F').lobbyPlan.obstacles.map(o => o.type),
    layout.levels.find(lv => lv.id === 'H-1F').lobbyPlan.obstacles.map(o => o.type));
});

test('两栋大堂全部功能区及原双梯双电梯可从主门真正走到并返回', () => {
  for (const id of ['H', 'A']) {
    const lv = layout.levels.find(lv => lv.id === `${id}-1F`), start = state(lv, [35.5, 0]);
    assert.ok(clear(nav, start), `${id} 主入口可站立`);
    for (const target of lv.lobbyPlan.navigationTargets) {
      const destination = state(lv, target.point);
      assert.ok(clear(nav, destination), `${id}/${target.id} 目标在家具或墙内`);
      for (const [a, b] of [[start, destination], [destination, start]]) {
        const route = findPath(nav, a, b, { cellSize: .45, maxNodes: 30000 });
        assert.ok(route?.length, `${id}/${target.id} 没有实体路线`);
        let s = a;
        for (const waypoint of route.slice(1)) {
          s = traceMotion(nav, s, waypoint, { stepSize: .1 });
          assert.ok(s, `${id}/${target.id} 实走被挡`);
        }
        assert.ok(Math.hypot(s.x - b.x, s.z - b.z) < .04);
      }
    }
    // A north-side entrance has a different facade and must still reach the
    // reception without crossing the new desk, fitness glazing or a suite.
    if (id === 'A') assert.ok(traceMotion(nav, state(lv, [35.5, -18.2]), start));
  }
});

test('西停车交通中心替换指定车位，巴士出租车与候车设施不占七米主车道或步行脊', () => {
  const plan = layout.site.transitCenter || addTransitCenter(layout.site, layout.extensions);
  assert.ok(plan);
  assert.equal(addTransitCenter(layout.site, layout.extensions), plan, '二次调用不得复制车辆或撤两次车位');
  assert.equal(plan.vehicles.filter(v => v.type === 'coach').length, 2);
  assert.equal(plan.vehicles.filter(v => v.type === 'taxi').length, 4);
  assert.equal(plan.taxiBays.length, 5);
  assert.ok(plan.taxiBays.some(bay => bay.accessible));
  assert.ok(!layout.extensions.surfaceParking.some(lot => ['WP-A9', 'WP-B9'].includes(lot.id)));
  assert.equal(layout.site.westParking.stallCount, layout.site.westParking.lots.reduce((n, lot) => n + lot.stalls.length, 0));
  for (const object of plan.obstacles) {
    assert.ok(!convexOverlap(object.poly, rectPoly(plan.throughLane)), `${object.id} 占用主进出车道`);
    assert.ok(!convexOverlap(object.poly, rectPoly(plan.pedestrianSpine)), `${object.id} 占用连续步行脊`);
    for (const trench of layout.site.trenches) assert.ok(!convexOverlap(object.poly, trench), `${object.id} 与地下坡口交叉`);
  }
  for (const bus of plan.vehicles.filter(v => v.type === 'coach')) assert.ok(plan.busBays.some(bay => bus.poly.every(p => pointInPoly(p, rectPoly(bay)))));
});

test('西库顶盖扣除地面小厅、所有坡口及升降井，重复或重叠开洞不会生成重叠楼板', () => {
  const building = layout.buildings.find(b => b.id === 'WPG'), levels = layout.levels.filter(lv => lv.building === 'WPG');
  const panels = garageCeilingPanels(building, layout.site, levels);
  assert.ok(panels.length > 1);
  for (let i = 0; i < panels.length; i++) {
    const poly = rectPoly(panels[i]).map(p => toW(building.frame, ...p));
    for (const cut of [...layout.site.trenches, ...layout.site.openings]) assert.ok(!convexOverlap(poly, cut), '结构顶盖覆盖坡口/小厅');
    for (let j = i + 1; j < panels.length; j++) assert.ok(!convexOverlap(rectPoly(panels[i]), rectPoly(panels[j])), '顶盖面片互相重叠');
  }
  const fake = { frame: frame(0, 0, 0), footprint: rect(0, 0, 20, 20), accessKiosks: [rect(3, 3, 7, 7)] };
  const base = garageCeilingPanels(fake, { trenches: [rectPoly(rect(5, 5, 10, 10))], openings: [rectPoly(rect(3, 3, 7, 7))] }, []);
  const area = base.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  assert.equal(area, 400 - 16 - 25 + 4);
});
