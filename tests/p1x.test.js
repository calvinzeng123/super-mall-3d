// 一期延展：第四翼（西北翼）+ 方庭（原四方格商场）（v3 规格第 2、3、6 节）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, directionCount } from './helpers.js';
import { convexOverlap, lrectPoly, rect, toW, dist } from '../src/layout/geom.js';

const p1 = () => L.buildings.find((b) => b.id === 'P1');
const wing = (id) => p1().wings.find((w) => w.id === id);

test('一期四翼：西北翼全宽段与西翼、北翼的翼楼矩形互不重叠', () => {
  assert.deepEqual(p1().wings.map((w) => w.id).sort(), ['N', 'NW', 'SE', 'W']);
  const nw = wing('NW');
  const body = (w, u0) => lrectPoly(w.F, rect(u0, -23, w.uEnd, 23));
  for (const id of ['W', 'N']) assert.ok(!convexOverlap(body(nw, nw.start), body(wing(id), wing(id).ua), 0.05), `西北翼与 ${id} 翼重叠`);
});

test('方庭在一期地块内、离道路 ≥5m；东南斜面与西北翼末端重合', () => {
  const sq = p1().square;
  assert.ok(sq, '缺少方庭');
  for (const [x, z] of sq.outline) assert.ok(x >= -281 && x <= -21 && z >= -251 && z <= -25, `方庭顶点 (${x.toFixed(1)}, ${z.toFixed(1)}) 离路太近`);
  const nw = wing('NW');
  for (const v of [-23, 23]) {
    const e = toW(nw.F, nw.uEnd, v);
    assert.ok(sq.chamfer.some((p) => dist(p, e) < 0.05), '斜面端点与西北翼末端不重合');
  }
});

test('方庭与西北翼铺位数量', () => {
  const need = { '1F': 22, '2F': 22, '3F': 14, B1M: 18 };
  for (const [s, n] of Object.entries(need)) {
    const lv = lvl(`P1-${s}`);
    const k = lv.units.filter((u) => u.square).length;
    assert.ok(k >= n, `${lv.id} 方庭只有 ${k} 家`);
    const w = lv.units.filter((u) => u.wing === 'NW').length;
    assert.ok(w >= 6, `${lv.id} 西北翼只有 ${w} 家`);
  }
});

test('方庭 4 个人行入口均非主入口；一期 1F 仍恰有 1 个主入口', () => {
  const sq = L.entrances.filter((e) => e.building === 'P1' && e.square);
  assert.equal(sq.length, 4);
  assert.ok(sq.every((e) => !e.main));
  assert.ok(directionCount(sq) >= 3);
  assert.equal(L.entrances.filter((e) => e.building === 'P1' && e.level === 'P1-1F' && e.main).length, 1);
});

test('方庭垂直交通与天台', () => {
  assert.equal(L.elevators.filter((e) => e.type === 'glass' && e.square).length, 2);
  const pairs = new Set(L.escalators.filter((e) => e.square).map((e) => e.pair));
  assert.ok(pairs.size >= 8, `方庭只有 ${pairs.size} 对扶梯`);
  const rf = lvl('P1-RF');
  for (const t of ['cinema-open', 'farm', 'viewdeck']) assert.ok(rf.features.some((f) => f.type === t), `天台缺少 ${t}`);
  assert.ok(rf.voids.some((v) => v.kind === 'skylight' && v.square), '缺少方庭中庭天窗');
});
