// 小游戏合集的地图范围（src/layout/arcade-scope.js）：裁掉二期、三期后，数据自洽、寻路完整。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav } from '../src/layout/nav.js';
import { ARCADE_CUT, isCutId } from '../src/layout/arcade-scope.js';
import { pointInPoly } from '../src/layout/geom.js';

const full = buildPlayableLayout({ mode: 'tour' });
const arcade = buildPlayableLayout({ mode: 'arcade' });

/** 楼层连通图：门洞（portal）、坡道 / 扶梯 / 楼梯（slope）、电梯和楼梯互动点（link）都算一条边。 */
function reachableLevels(layout) {
  const nav = buildNav(layout);
  const next = new Map();
  const join = (a, b) => { for (const [p, q] of [[a, b], [b, a]]) { if (!next.has(p)) next.set(p, new Set()); next.get(p).add(q); } };
  for (const F of nav.floors.values()) for (const p of F.portals) join(p.a, p.b);
  for (const sl of nav.slopes) join(sl.low, sl.high);
  for (const k of nav.links) for (let i = 1; i < k.stops.length; i++) join(k.stops[0].floor, k.stops[i].floor);
  assert.ok(nav.floors.has('ground'));
  const seen = new Set(['ground']), queue = ['ground'];
  while (queue.length) for (const n of next.get(queue.pop()) || []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  const levelIds = new Set(layout.levels.map((l) => l.id));
  return { nav, levels: new Set([...seen].filter((id) => levelIds.has(id))) };
}

test('keeps phase one, its towers, R1–R4 and the metro; drops phases two and three', () => {
  assert.deepEqual(ARCADE_CUT, ['P2', 'P3']);
  const ids = arcade.buildings.map((b) => b.id);
  assert.deepEqual(ids, full.buildings.map((b) => b.id).filter((id) => !ARCADE_CUT.includes(id)));
  for (const id of ['P1', 'P1C', 'H', 'A', 'R1', 'R2', 'R3', 'R4', 'W1', 'W2', 'T1', 'T2', 'M', 'WPG']) assert.ok(ids.includes(id), id);
  const cutLevels = full.levels.filter((l) => ARCADE_CUT.includes(l.building)).length;
  assert.equal(arcade.levels.length, full.levels.length - cutLevels);
  assert.deepEqual(arcade.arcade.kept, { buildings: ids.length, levels: arcade.levels.length });
  assert.deepEqual(arcade.arcade.full, { buildings: full.buildings.length, levels: full.levels.length });
  // 不是 FPS 的紧凑地图：渲染按完整园区的方式搭建
  assert.equal(arcade.playable, undefined);
  assert.equal(full.arcade, undefined);
});

test('no kept record points at a cut building or level', () => {
  // 允许留下的：地块和广场的名字、地铁站厅通往二期 / 三期的通道残端（入口已删，走不过去）、体块自身。
  const allowed = [/^site\.plots\[\]\.id$/, /^site\.walk\[\]\.id$/, /^site\.plazas\[\]\.(id|building)$/,
    /^buildings\[\]\.passages\[\]\.to$/, /^arcade\./];
  const left = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { if (isCutId(v) && !allowed.some((re) => re.test(path))) left.push(`${path} = ${v}`); return; }
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walk(x, `${path}[]`); return; }
    for (const [k, x] of Object.entries(v)) { assert.ok(!isCutId(k), `key ${path}.${k}`); walk(x, path ? `${path}.${k}` : k); }
  };
  walk(arcade, '');
  assert.deepEqual(left, []);
  for (const key of ['elevators', 'stairs', 'escalators', 'ramps', 'entrances']) {
    assert.ok(arcade[key].length > 0, key);
    assert.ok(arcade[key].length < full[key].length, key);
  }
});

test('navigation is complete: no dangling link, and every kept level is as reachable as in the full campus', () => {
  const a = reachableLevels(arcade), f = reachableLevels(full);
  for (const k of a.nav.links) for (const s of k.stops) assert.ok(a.nav.floors.has(s.floor), `${k.id} → ${s.floor}`);
  for (const F of a.nav.floors.values()) for (const p of F.portals) assert.ok(a.nav.floors.has(p.a) && a.nav.floors.has(p.b), `${p.a} | ${p.b}`);
  const lost = [...f.levels].filter((id) => !isCutId(id) && !a.levels.has(id));
  assert.deepEqual(lost, []);
  assert.ok(a.levels.size > 300, `only ${a.levels.size} levels reachable`);
  for (const id of ['P1-1F', 'P1-RF', 'P1C-4F', 'M-B1', 'M-B2', 'H-RF', 'A-RF', 'R4-RF', 'W2-RF', 'T1-RF', 'WPG-B1']) assert.ok(a.levels.has(id), id);
});

test('low-detail blocks stand on the plots of the cut buildings', () => {
  const blocks = arcade.arcade.massing;
  const of = (id) => blocks.filter((b) => b.building === id);
  assert.equal(of('P2').length, 1);
  assert.ok(of('P3').length >= 10, 'phase three keeps its lane pattern as separate blocks');
  const plot = (id) => arcade.site.plots.find((p) => p.id === id).poly;
  for (const b of blocks) {
    assert.ok(b.poly.length >= 3 && b.y0 === 0 && b.y1 > 8 && b.y1 < 40, `${b.id} ${b.y0}–${b.y1}`);
    for (const pt of b.poly) assert.ok(pointInPoly(pt, plot(b.building)), `${b.id} leaves the ${b.building} plot`);
  }
  // 体块顶和原楼屋面齐平
  const roofOf = (id) => Math.max(...full.levels.filter((l) => l.building === id).map((l) => (l.kind === 'roof' ? l.elev : l.elev + l.height)));
  assert.equal(of('P2')[0].y1, roofOf('P2'));
  assert.equal(of('P3')[0].y1, roofOf('P3'));
});
