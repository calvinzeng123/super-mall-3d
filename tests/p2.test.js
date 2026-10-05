// 二期 星湾专项规则（规格第 5 节、第 10 节 1、2、5、6、8、9、10、12、13 条）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, levelsOf, inWalk, inSite, inBridge, midOf, directionCount, segProbes } from './helpers.js';
import { convexOverlap, pointInPoly } from '../src/layout/geom.js';

const P = (s) => lvl(`P2-${s}`);

test('二期：六个楼层，标高与规格一致，各层主题不同', () => {
  const ls = levelsOf('P2');
  assert.deepEqual(ls.map((l) => l.short), ['B1', '1F', '2F', '3F', '4F', 'RF']);
  assert.deepEqual(Object.fromEntries(ls.map((l) => [l.short, l.elev])), { B1: -4.2, '1F': 0, '2F': 6.5, '3F': 12, '4F': 17.5, RF: 23 });
  assert.equal(new Set(ls.map((l) => l.theme.key)).size, 6, '每层场景主题应不同');
});

test('二期铺位：1F–4F 每层 ≥20；1F 有汽车展厅与真冰场，4F 有影城', () => {
  for (const s of ['1F', '2F', '3F', '4F']) assert.ok(P(s).units.length >= 20, `${s} 只有 ${P(s).units.length} 个铺位`);
  assert.ok(P('1F').units.some((u) => u.brand.cat === 'auto'), '1F 缺少新能源汽车展厅');
  assert.ok(P('1F').units.some((u) => u.brand.cat === 'rink'), '1F 缺少真冰场');
  assert.ok(P('4F').units.some((u) => u.brand.cat === 'cinema'), '4F 缺少影城');
});

test('二期卫生间：1F–4F 每层 ≥2 组，B1/RF ≥1 组，门口通走道', () => {
  const wc = (s) => P(s).rooms.filter((m) => m.type === 'wc');
  for (const s of ['1F', '2F', '3F', '4F']) assert.ok(wc(s).length >= 2, `${s} 卫生间不足 2 组`);
  for (const s of ['B1', 'RF']) assert.ok(wc(s).length >= 1, `${s} 没有卫生间`);
  for (const lv of levelsOf('P2')) {
    for (const m of lv.rooms.filter((r) => r.type === 'wc')) {
      assert.ok(m.wdoors.some((d) => segProbes(d, 0.5).some((p) => inWalk(lv, p))), `${lv.id} ${m.id} 的门不通走道`);
    }
  }
});

test('二期垂直交通：观光梯 2 部；1F↔2F、2F↔3F、3F↔4F 各 ≥2 对且有上下行', () => {
  assert.equal(L.elevators.filter((e) => e.building === 'P2' && e.type === 'glass').length, 2);
  const E = L.escalators.filter((e) => e.building === 'P2');
  for (const [a, b] of [['1F', '2F'], ['2F', '3F'], ['3F', '4F']]) {
    const es = E.filter((e) => e.from === `P2-${a}` && e.to === `P2-${b}`);
    assert.ok(new Set(es.map((e) => e.pair)).size >= 2, `${a}→${b} 扶梯不足 2 对`);
    assert.ok(es.some((e) => e.dir === 'up') && es.some((e) => e.dir === 'down'), `${a}→${b} 缺少上行或下行扶梯`);
  }
});

test('二期入口：≥4 个、朝向 ≥3 个方向、1 个主入口；内侧是走道，外侧在楼外广场或天桥', () => {
  const ents = L.entrances.filter((e) => e.building === 'P2' && e.level === 'P2-1F');
  assert.ok(ents.length >= 4, `只有 ${ents.length} 个人行入口`);
  assert.equal(ents.filter((e) => e.main).length, 1, '应有 1 个主入口');
  assert.ok(directionCount(ents) >= 3, '入口朝向少于 3 个方向');
  for (const e of L.entrances.filter((x) => x.building === 'P2')) {
    const lv = lvl(e.level);
    const [mx, mz] = midOf(e.seg);
    assert.ok(inWalk(lv, [mx - e.nx, mz - e.nz]), `${e.name} 内侧不是走道`);
    const out = [mx + e.nx, mz + e.nz];
    assert.ok(!lv.slab.pieces.some((s) => pointInPoly(out, s.outer)), `${e.name} 外侧仍在楼内`);
    if (e.to === 'site') assert.ok(inSite(out), `${e.name} 外侧不在场地步行区`);
    else if (e.to === 'bridge') { if (L.bridges) assert.ok(inBridge(out), `${e.name} 外侧不在天桥桥面上`); }
    else assert.ok(inWalk(lvl(e.to), out), `${e.name} 外侧不在 ${e.to} 走道上`);
  }
});

test('二期车库：入口、出口坡道各 1 且不重叠，坡度 ≤15%，两端接车道；B1 车位 ≥150', () => {
  const R = L.ramps.filter((r) => r.building === 'P2');
  const inR = R.filter((r) => r.type === 'street-in');
  const outR = R.filter((r) => r.type === 'street-out');
  assert.equal(inR.length, 1);
  assert.equal(outR.length, 1);
  assert.ok(!convexOverlap(inR[0].poly, outR[0].poly), '入口与出口坡道重叠');
  for (const r of R) {
    const h = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z);
    assert.ok(Math.abs(r.to.y - r.from.y) / h <= 0.15 + 1e-9, `${r.id} 坡度过大`);
    for (const end of [r.from, r.to]) {
      if (end.level === 'street') assert.ok(L.site.driveways.some((d) => pointInPoly([end.x, end.z], d)), `${r.id} 地面端没有接到车道`);
      else assert.ok(inWalk(lvl(end.level), [end.x, end.z]), `${r.id} 在 ${end.level} 的端点没有接到车道`);
    }
  }
  assert.ok(P('B1').parking.stalls.length >= 150, `B1 只有 ${P('B1').parking.stalls.length} 个车位`);
});

test('二期天台：天空跑道与篮球场', () => {
  const types = P('RF').features.map((f) => f.type);
  assert.ok(types.includes('track'), '天台缺少天空跑道');
  assert.ok(types.includes('court'), '天台缺少篮球场');
});
