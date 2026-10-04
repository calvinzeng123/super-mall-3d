// 总图规则：道路齐全；建筑不压道路与人行道；各期互不重叠（规格第 2 节、第 10 节 15 条）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, levelsOf } from './helpers.js';
import { pointInPoly, polySamples } from '../src/layout/geom.js';

test('总图道路齐全：云澜大道、星湾路、四条外环、星湾北街', () => {
  const ids = L.site.roads.map((r) => r.id);
  for (const id of ['avenue', 'xingwan', 'ring-n', 'ring-s', 'ring-w', 'ring-e', 'service-n']) assert.ok(ids.includes(id), `缺少道路 ${id}`);
});

test('建筑楼板不压道路与人行道', () => {
  const blocked = [...L.site.roads, ...L.site.sidewalks];
  for (const b of L.buildings) {
    for (const lv of levelsOf(b.id)) {
      for (const piece of lv.slab.pieces) {
        for (const p of polySamples(piece.outer, 3, 0.05)) {
          const hit = blocked.find((r) => pointInPoly(p, r.poly));
          if (hit) assert.fail(`${lv.id} 楼板 (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) 压到 ${hit.id}`);
        }
      }
    }
  }
});

test('各期外轮廓互不重叠', () => {
  for (const a of L.buildings) {
    for (const b of L.buildings) {
      if (a === b) continue;
      for (const p of polySamples(a.outline, 4, 0.05)) assert.ok(!pointInPoly(p, b.outline), `${a.id} 与 ${b.id} 重叠`);
    }
  }
});
