// 地铁云澜汇站（v3 规格第 4、6 节）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, levelsOf, inWalk } from './helpers.js';
import { pointInPoly, convexOverlap } from '../src/layout/geom.js';

const M = () => L.buildings.find((b) => b.id === 'M');

test('地铁两层：站台 −12、站厅 −4.5，主题不同', () => {
  assert.ok(M(), '缺少地铁');
  const ls = levelsOf('M');
  assert.deepEqual(ls.map((l) => [l.short, l.elev]), [['B2', -12], ['B1', -4.5]]);
  assert.equal(new Set(ls.map((l) => l.theme.key)).size, 2);
});

test('一期 B1M、二期 B1、三期 B1 各有通往站厅的连接口', () => {
  for (const id of ['P1-B1M', 'P2-B1', 'P3-B1']) {
    const es = L.entrances.filter((e) => e.level === id && e.to === 'M-B1');
    assert.equal(es.length, 1, `${id} 缺少地铁连接口`);
    const e = es[0];
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    assert.ok(inWalk(lvl(id), [mx - e.nx, mz - e.nz]), `${id} 连接口内侧不是走道`);
    assert.ok(inWalk(lvl('M-B1'), [mx + e.nx, mz + e.nz]), `${id} 连接口外侧不在站厅通道`);
  }
});

test('四个地面出入口分属一期、二期、三期与公园，雨棚不压道路与人行道', () => {
  const ex = L.entrances.filter((e) => e.building === 'M' && e.to === 'site');
  assert.ok(ex.length >= 4);
  const plots = new Set(ex.map((e) => (L.site.plots.find((p) => pointInPoly([e.kiosk.x, e.kiosk.z], p.poly)) || {}).id));
  for (const id of ['P1', 'P2', 'P3', 'park']) assert.ok(plots.has(id), `${id} 没有地铁出入口`);
  for (const e of ex) {
    for (const r of [...L.site.roads, ...L.site.sidewalks]) assert.ok(!convexOverlap(e.kiosk.poly, r.poly), `${e.name} 雨棚压到 ${r.id}`);
  }
});

test('站厅 ↔ 站台：上下行扶梯各 ≥2、楼梯 ≥2、客梯 ≥2', () => {
  const es = L.escalators.filter((e) => e.from === 'M-B2' && e.to === 'M-B1');
  assert.ok(es.filter((e) => e.dir === 'up').length >= 2 && es.filter((e) => e.dir === 'down').length >= 2);
  assert.ok(L.stairs.filter((s) => s.serves.includes('M-B1') && s.serves.includes('M-B2')).length >= 2);
  assert.ok(L.elevators.filter((e) => e.serves.includes('M-B1') && e.serves.includes('M-B2')).length >= 2);
});

test('四条通道沿对角线', () => {
  const ang = M().passages.map((p) => Math.round(((p.deg % 360) + 360) % 360)).sort((a, b) => a - b);
  assert.deepEqual(ang, [45, 135, 225, 315]);
});
