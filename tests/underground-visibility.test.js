import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/layout/layout.js';
import { createExploreVisibility } from '../src/render/explore-visibility.js';
import { coreInfill } from '../src/layout/elevator-shafts.js';
import { pointInPoly, toL } from '../src/layout/geom.js';

const layout = buildLayout(), visible = createExploreVisibility(layout);

test('一期地下车库、塔楼及附库在跨门与下坡之前已显示，二三期仍隔离', () => {
  for (const ex of [
    { building: 'P1', level: 'P1-1F', under: false },
    { building: 'P1', level: 'P1-B1', under: true },
    { building: 'H', level: 'H-B1', under: true },
  ]) {
    const ids = visible(ex);
    for (const id of ['P1-B1', 'P1-B2', 'H-B1', 'H-B2', 'A-B1', 'A-B2', 'WPG-B1', 'WPG-B2']) {
      if (layout.levels.some(l => l.id === id)) assert.ok(ids.has(id), `${ex.level} must preview ${id}`);
    }
    assert.ok(!ids.has('P2-B2')); assert.ok(!ids.has('P3-B2'));
  }
});

test('二三期下行前保留相邻地下层，地铁站在连接通道处提前出现', () => {
  for (const building of ['P2', 'P3']) {
    const ids = visible({ building, level: `${building}-1F`, under: false });
    assert.ok(ids.has(`${building}-B1`)); assert.ok(ids.has(`${building}-B2`));
  }
  const ids = visible({ building: 'P1', level: 'P1-B1M', under: true, metro: true });
  for(const id of ['M-B1','M-B2','M-B3','M-B4'])assert.ok(ids.has(id));
});

test('地面坡口接近时预显目的地，升降行程到达层预先显示', () => {
  const r = layout.ramps.find(r => r.from.level === 'street' || r.to.level === 'street');
  const top = r.from.y > r.to.y ? r.from : r.to, low = top === r.from ? r.to : r.from;
  assert.ok(visible({ under: false, level: 'ground', position: top }).has(low.level));
  const e = layout.elevators.find(e => e.building === 'H');
  const ids = visible({ building: 'H', level: 'H-1F', under: false,
    elevator: { id: e.id, from: 'H-1F', to: 'H-20F' } });
  assert.ok(ids.has('H-20F')); assert.ok(ids.has('H-B1'));
});

test('所有电梯的实际井道中心不穿过其服务楼板，包括首层到地下', () => {
  for (const e of layout.elevators) {
    assert.equal(e.rideable, true, e.id);
    for (const id of e.serves) {
      const lv = layout.levels.find(l => l.id === id);
      for (const p of lv.slab.pieces.filter(p => pointInPoly([e.x, e.z], p.outer))) {
        assert.ok(p.holes.some(h => pointInPoly([e.x, e.z], h)), `${e.id} sealed by ${id}`);
      }
    }
  }
});

test('客梯核心筒实体避开轿厢与进舱路线', () => {
  let checked = 0;
  for (const lv of layout.levels) for (const room of lv.rooms.filter(r => r.type === 'core')) {
    const g = room.rects[0];
    const lifts = layout.elevators.filter(e => e.serves.includes(lv.id) && e.frame.id === room.frame.id
      && e.lu > g.x0 && e.lu < g.x1 && e.lv > g.z0 && e.lv < g.z1);
    if (!lifts.length) continue;
    const solids = coreInfill(g, lifts);
    for (const e of lifts) for (let distance = 0; distance <= e.reach + 1; distance += .1) {
      const [x, z] = toL(e.frame, e.x + e.nx * distance, e.z + e.nz * distance);
      assert.ok(!solids.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1), `${e.id}: core blocks boarding`);
    }
    checked++;
  }
  assert.ok(checked > 10);
});
