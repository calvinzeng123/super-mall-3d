// 三期 云澜里（开放街区）专项规则（规格第 6 节、第 10 节 1、2、5、6、10、12 条）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, levelsOf, inWalk, segProbes } from './helpers.js';
import { convexOverlap, pointInPoly, polySamples } from '../src/layout/geom.js';

const P = (s) => lvl(`P3-${s}`);
const b3 = () => L.buildings.find((b) => b.id === 'P3');

test('三期：五个楼层，标高与规格一致，各层主题不同', () => {
  const ls = levelsOf('P3');
  assert.deepEqual(ls.map((l) => l.short), ['B2', 'B1', '1F', '2F', '3F']);
  assert.deepEqual(Object.fromEntries(ls.map((l) => [l.short, l.elev])), { B2: -9, B1: -4.5, '1F': 0, '2F': 5, '3F': 9.5 });
  assert.equal(new Set(ls.map((l) => l.theme.key)).size, 5, '每层场景主题应不同');
  assert.ok(P('1F').ground, '三期 1F 应是室外街巷（与场地相连）');
});

test('三期：原有11栋与8栋后街骑楼，层数符合规划，互不重叠', () => {
  const blocks = b3().blocks;
  assert.equal(blocks.length, 19);
  assert.deepEqual(blocks.map((k) => k.floors), [2, 3, 3, 2, 2, 3, 2, 3, 2, 3, 2, ...Array(8).fill(3)]);
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) assert.ok(!convexOverlap(blocks[i].poly, blocks[j].poly, 0.5), `#${i + 1} 与 #${j + 1} 重叠`);
  }
});

test('三期铺位合计 ≥110，卫生间 ≥2 组且门通走道，每层客梯 ≥2 部', () => {
  const n = levelsOf('P3').reduce((k, l) => k + l.units.length, 0);
  assert.ok(n >= 110, `三期只有 ${n} 个铺位`);
  const wcs = levelsOf('P3').flatMap((l) => l.rooms.filter((m) => m.type === 'wc').map((m) => [l, m]));
  assert.ok(wcs.length >= 2, '三期卫生间不足 2 组');
  for (const [lv, m] of wcs) assert.ok(m.wdoors.some((d) => segProbes(d, 0.5).some((p) => inWalk(lv, p))), `${lv.id} ${m.id} 的门不通走道`);
  for (const lv of levelsOf('P3')) {
    const lifts = L.elevators.filter((e) => e.type === 'passenger' && e.serves.includes(lv.id));
    assert.ok(lifts.length >= 2, `${lv.id} 客梯只有 ${lifts.length} 部`);
  }
});

test('三期车库：入口、出口坡道各 2 且不重叠，坡度 ≤15%，两端接车道；B1 车位 ≥200', () => {
  const R = L.ramps.filter((r) => r.building === 'P3');
  const inR = R.filter((r) => r.type === 'street-in');
  const outR = R.filter((r) => r.type === 'street-out');
  assert.equal(inR.length, 2);
  assert.equal(outR.length, 2);
  for (let i=0;i<R.length;i++) for(let j=i+1;j<R.length;j++) assert.ok(!convexOverlap(R[i].poly,R[j].poly), `${R[i].id} 与 ${R[j].id} 坡道重叠`);
  assert.equal(R.filter(r=>['up','down'].includes(r.type)).length,2,'B1/B2需有双向独立坡道');
  for (const r of R) {
    const h = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z);
    assert.ok(Math.abs(r.to.y - r.from.y) / h <= 0.15 + 1e-9, `${r.id} 坡度过大`);
    for (const end of [r.from, r.to]) {
      if (end.level === 'street') assert.ok(L.site.driveways.some((d) => pointInPoly([end.x, end.z], d)), `${r.id} 地面端没有接到车道`);
      else assert.ok(inWalk(lvl(end.level), [end.x, end.z]), `${r.id} 在 ${end.level} 的端点没有接到车道`);
    }
  }
  for(const s of ['B1','B2'])assert.ok(P(s).parking.stalls.length >= 200, `${s} 只有 ${P(s).parking.stalls.length} 个车位`);
});

test('三期楼栋不压道路与人行道，在三期地块内', () => {
  const blocked = [...L.site.roads, ...L.site.sidewalks];
  for (const k of b3().blocks) {
    for (const p of polySamples(k.poly, 3, 0.05)) {
      assert.ok(!blocked.some((r) => pointInPoly(p, r.poly)), `#${k.n} 压到道路或人行道`);
      assert.ok(p[0] < -16 && p[1] > 20, `#${k.n} 超出三期地块`);
    }
  }
});
