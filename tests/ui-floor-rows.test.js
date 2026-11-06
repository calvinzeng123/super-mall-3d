// 楼层牌（ui.js renderFloors → floor-rows.js floorRows）。塔楼按分区列出（supertall P0b · SPEC §3.1）：
// 北苑 T1 收起时是 RF、错层复式 14–24F、江景大平层 8–13F、7F 空中大堂，最下面一行不可点的「1–6F 一期商场 · 住户电梯直达 7F」；
// 聚焦楼层所在的分区展开；避难层是带斜纹的「避难层 · 设备层」按钮（合成超高层 ST）；每栋塔楼全部收起时 ≤ 30 行，
// 每一层都能点到；楼层 / 房号搜索；楼栋副标题来自数据。其余楼栋照旧逐层列出。目录也有裙房那一行（禁用按钮）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { floorRows, podiumOf, podiumDirectoryRow, towerRailZones, railZonesFallback, zoneChips, railSearch, towerSub, towerFacts } from '../src/render/floor-rows.js';
import { stLayout } from './fixtures/supertall-records.js';

const rows = (html) => [...html.matchAll(/<(button|div) class="(floor[^"]*)"[^>]*>(?:<span class="fl-num">([^<]*)<\/span>)<span class="fl-name">([^<]*)<\/span><\/\1>/g)]
  .map(([, tag, cls, num, name]) => ({ tag, cls, num, name }));
const levelIds = (html) => [...html.matchAll(/data-level="([^"]+)"/g)].map((m) => m[1]).filter(Boolean);

test('北苑塔楼楼层牌（收起）：全楼、RF、错层复式 14–24F、江景大平层 8–13F、7F 空中大堂，最后是一期商场 1–6F 的说明行', () => {
  for (const id of ['T1', 'T2']) {
    const r = rows(floorRows(L, id));
    assert.equal(r[0].num, '全楼');
    assert.deepEqual(r.slice(1, -1).map((q) => [q.cls, q.num]), [['floor zone-single', 'RF'], ['floor-zone', '14–24F'], ['floor-zone', '8–13F'], ['floor zone-single', '7F']]);
    assert.equal(r[2].name, '错层复式 · 12 户');   // 11 storeys of interlocked duplexes: 12 homes (24 per tower in all)
    assert.equal(r[3].name, '江景大平层 · 12 户');
    const seven = r.find((q) => q.num === '7F');
    assert.ok(seven && seven.tag === 'button' && seven.name === '空中大堂', JSON.stringify(seven));
    const podium = r.at(-1);
    assert.deepEqual(podium, { tag: 'div', cls: 'floor-podium', num: '1–6F', name: '一期商场 · 住户电梯直达 7F' });
    // The podium row is not a floor button: no data-level, never pressed, not clickable.
    assert.ok(!/floor-podium"[^>]*data-level/.test(floorRows(L, id)));
    assert.match(podiumDirectoryRow(L, id), /<button class="shop podium" disabled/);
  }
  assert.deepEqual(podiumOf(L, 'T1'), { num: '1–6F', name: '一期商场 · 住户电梯直达 7F', title: '一期商场 1–6F：住户电梯从 1F 直达 7F（与商场天台同层），不停商场楼层' });
});

test('聚焦楼层所在分区展开（其余收起）；全部展开时与以前一样逐层列出 RF、24F…7F，副标题分得清大平层与错层复式', () => {
  const focused = rows(floorRows(L, 'T1', { focus: 'T1-16F' }));
  assert.ok(focused.some((q) => q.cls === 'floor-zone' && q.num === '14–24F'));
  assert.deepEqual(focused.filter((q) => q.cls === 'floor in-zone').map((q) => q.num), Array.from({ length: 11 }, (_, i) => `${24 - i}F`));
  assert.ok(!focused.some((q) => q.num === '9F'), '江景大平层没有收起');
  assert.match(floorRows(L, 'T1', { focus: 'T1-16F' }), /data-zone="[^"]+" aria-expanded="true"><span class="fl-num">14–24F/);
  const all = rows(floorRows(L, 'T1', { all: true })).filter((q) => q.cls.startsWith('floor ') || q.cls === 'floor');
  assert.deepEqual(all.slice(1).map((q) => q.num), ['RF', ...Array.from({ length: 18 }, (_, i) => `${24 - i}F`)]);
  for (let n = 8; n <= 13; n++) assert.equal(all.find((q) => q.num === `${n}F`).name, '江景大平层');
  for (let n = 14; n <= 24; n++) assert.equal(all.find((q) => q.num === `${n}F`).name, '错层复式');
  const opened = rows(floorRows(L, 'T1', { expanded: new Set([towerRailZones(L, 'T1').find((z) => z.range === '8–13F').id]) }));
  assert.deepEqual(opened.filter((q) => q.cls === 'floor in-zone').map((q) => q.num), ['13F', '12F', '11F', '10F', '9F', '8F']);
});

test('每栋塔楼全部收起时 ≤ 30 行，且每一层都在某个分区里（展开它就能点到）；分区小标签条每区一个', () => {
  for (const b of [...L.buildings.filter((q) => q.kind === 'tower'), stLayout().buildings[0]]) {
    const layout = b.id === 'ST' ? stLayout() : L;
    const collapsed = rows(floorRows(layout, b.id));
    assert.ok(collapsed.length <= 30, `${b.id} 收起后 ${collapsed.length} 行`);
    const own = layout.levels.filter((l) => l.building === b.id).map((l) => l.id).sort();
    assert.deepEqual(levelIds(floorRows(layout, b.id, { all: true })).sort(), own, `${b.id} 展开后不是每层都能点`);
    const zones = towerRailZones(layout, b.id);
    assert.deepEqual(zones.flatMap((z) => z.levels.map((l) => l.id)).sort(), own);
    assert.equal((zoneChips(layout, b.id).match(/class="zone-chip[ "]/g) || []).length, zones.length);
  }
});

test('避难层（合成记录 b.zones）：单独一行、斜纹按钮「避难层 · 设备层」、可选；分区表头写范围与户数；分区自上而下', () => {
  const SL = stLayout(), html = floorRows(SL, 'ST');
  const r = rows(html);
  const refuge = r.filter((q) => q.cls.includes('refuge'));
  assert.deepEqual(refuge.map((q) => [q.num, q.name]), [['20F', '避难层 · 设备层'], ['10F', '避难层 · 设备层']]);
  assert.match(html, /class="floor refuge zone-single" data-level="ST-10F"/);
  assert.deepEqual(r.filter((q) => q.cls === 'floor-zone').map((q) => [q.num, q.name]), [['21–22F', '高区 · 4 户'], ['11–19F', '中区 云端大平层 · 18 户'], ['2–9F', '低区 江景大平层 · 16 户']]);
  assert.match(zoneChips(SL, 'ST'), /zone-chip refuge[^>]*>避 10F</);
  // Without b.zones the rail derives the same bands from the level kinds.
  const fb = railZonesFallback(SL.buildings[0], SL.levels);
  assert.deepEqual(fb.map((z) => z.kind), ['basement', 'lobby', 'band', 'refuge', 'band', 'refuge', 'band', 'roof']);
  const noZones = stLayout({ zones: false });
  assert.equal(towerRailZones(noZones, 'ST').length, 8);
});

test('楼层 / 房号搜索：37 / 37F 聚焦楼层，0901 / ST-0901 选中住户，「避难」列出避难层；楼栋副标题与目录事实来自数据', () => {
  const SL = stLayout();
  assert.deepEqual(railSearch(SL, 'ST', '12'), { level: 'ST-12F' });
  assert.deepEqual(railSearch(SL, 'ST', '12f'), { level: 'ST-12F' });
  assert.deepEqual(railSearch(SL, 'ST', 'ST-0901'), { level: 'ST-9F', unit: 'ST-9F-W' });
  assert.deepEqual(railSearch(SL, 'ST', '0902'), { level: 'ST-9F', unit: 'ST-9F-E' });
  assert.deepEqual(railSearch(SL, 'ST', '避难'), { levels: ['ST-10F', 'ST-20F'] });
  assert.equal(railSearch(SL, 'ST', 'zz'), null);
  assert.deepEqual(railSearch(L, 'T1', '16F'), { level: 'T1-16F' });
  // 楼栋副标题：社区名与实际最高层；酒店 / 公寓 / 住宅按数据的最高层（不再写死 20层 / 30层）。
  const sub = (id) => towerSub(L, L.buildings.find((b) => b.id === id));
  assert.equal(sub('T1'), '云澜·北苑 · 24层');
  assert.equal(sub('W1'), '云澜·西苑 · 28层');
  assert.equal(sub('H'), '20层酒店');
  assert.equal(sub('R1'), '30层住宅');
  assert.equal(towerSub(SL, { ...SL.buildings[0], sub: '合成 · 22层' }), '合成 · 22层');
  const facts = Object.fromEntries(towerFacts(SL, 'ST'));
  assert.equal(facts['避难层'], 2);
  assert.match(String(facts['电梯']), /低区 2 · 高区 1/);
  assert.match(facts['最高'], /^75\.2 m$/);
});

test('其他楼栋没有裙房说明行；一期楼层牌照旧逐层列出', () => {
  for (const id of ['P1', 'P2', 'W1', 'W2', 'H', 'A', 'WPG']) {
    if (!L.buildings.some((b) => b.id === id)) continue;
    assert.equal(podiumOf(L, id), null, id);
    assert.ok(!floorRows(L, id).includes('floor-podium'), id);
    assert.equal(podiumDirectoryRow(L, id), '');
  }
  const p1 = rows(floorRows(L, 'P1'));
  assert.equal(p1.length, L.levels.filter((l) => l.building === 'P1').length + 1);
  assert.equal(p1[1].num, 'RF');
  assert.equal(towerRailZones(L, 'P1'), null);
  assert.equal(floorRows(L, 'nope'), '');
});
