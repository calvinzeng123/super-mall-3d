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

test('天桥：桥面 6.5m、桥下净空 ≥5m；四条连廊落在一、二期 2F 走道或落地塔上', () => {
  assert.ok(L.bridges, '缺少天桥');
  assert.equal(L.bridges.y, 6.5);
  assert.ok(L.bridges.y - L.bridges.thick >= 5.0, '桥下净空不足 5m');
  assert.equal(L.bridges.links.length, 4);
  for (const k of L.bridges.links) {
    if (k.building) {
      const lv = L.levels.find((l) => l.id === `${k.building}-2F`);
      assert.ok(lv.walk.some((w) => pointInPoly(k.end, w.poly)), `${k.id} 的落点不在 ${lv.id} 走道上`);
    } else {
      assert.ok(L.bridges.walk.some((w) => w.kind === 'tower' && pointInPoly(k.end, w.poly)), `${k.id} 的落点不在落地塔上`);
    }
  }
});

test('天桥：支柱不压车行道（大道隔离带除外）；落地塔把桥面与地面连起来', () => {
  const median = (p) => Math.abs(p[1]) <= 2;
  for (const s of L.bridges.supports) {
    const road = L.site.roads.find((r) => pointInPoly([s.x, s.z], r.poly));
    assert.ok(!road || (road.id === 'avenue' && median([s.x, s.z])), `支柱 (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) 压在 ${road && road.id} 上`);
  }
  const towers = L.bridges.walk.filter((w) => w.kind === 'tower');
  assert.equal(towers.length, 2);
  for (const t of towers) {
    const vs = L.bridges.verticals.filter((v) => pointInPoly(v.deck, t.poly));
    assert.ok(vs.length >= 2, `${t.id} 的上下交通不足（楼梯 + 扶梯 / 电梯）`);
    for (const v of vs) assert.ok(L.site.walk.some((w) => pointInPoly(v.ground, w.poly)), `${t.id} 的 ${v.type} 地面端不在场地步行区`);
  }
});

test('中央公园与地铁站', () => {
  assert.ok(L.site.park && L.site.park.lake.length >= 8, '缺少公园湖面');
  assert.ok(L.site.park.metro, '缺少地铁站出入口');
  assert.ok(L.site.walk.some((w) => w.id === 'park'), '公园不在步行网络里');
});
