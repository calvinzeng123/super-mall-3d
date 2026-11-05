// 楼层牌（ui.js renderFloors → floor-rows.js floorRows）：北苑塔楼自上而下列出 RF、24F … 7F，最下面一行不可点的
// 「1–6F 一期商场 · 住户电梯直达 7F」；副标题分得清大平层与错层复式；其余楼栋没有这一行。目录也有同一行（禁用按钮）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { floorRows, podiumOf, podiumDirectoryRow } from '../src/render/floor-rows.js';

const rows = (html) => [...html.matchAll(/<(button|div) class="(floor[^"]*)"[^>]*>(?:<span class="fl-num">([^<]*)<\/span>)<span class="fl-name">([^<]*)<\/span><\/\1>/g)]
  .map(([, tag, cls, num, name]) => ({ tag, cls, num, name }));

test('北苑塔楼楼层牌：全楼、RF、24F…7F，最后是一期商场 1–6F 的说明行；7F 空中大堂、8F–13F 江景大平层、14F–24F 错层复式', () => {
  for (const id of ['T1', 'T2']) {
    const r = rows(floorRows(L, id));
    assert.equal(r[0].num, '全楼');
    assert.deepEqual(r.slice(1, -1).map((q) => q.num), ['RF', ...Array.from({ length: 18 }, (_, i) => `${24 - i}F`)]);
    const seven = r.find((q) => q.num === '7F');
    assert.ok(seven && seven.tag === 'button' && seven.name === '空中大堂', JSON.stringify(seven));
    for (let n = 8; n <= 13; n++) assert.equal(r.find((q) => q.num === `${n}F`).name, '江景大平层');
    for (let n = 14; n <= 24; n++) assert.equal(r.find((q) => q.num === `${n}F`).name, '错层复式');
    const podium = r.at(-1);
    assert.deepEqual(podium, { tag: 'div', cls: 'floor-podium', num: '1–6F', name: '一期商场 · 住户电梯直达 7F' });
    // The podium row is not a floor button: no data-level, never pressed, not clickable.
    assert.ok(!/floor-podium"[^>]*data-level/.test(floorRows(L, id)));
    assert.match(podiumDirectoryRow(L, id), /<button class="shop podium" disabled/);
  }
  assert.deepEqual(podiumOf(L, 'T1'), { num: '1–6F', name: '一期商场 · 住户电梯直达 7F', title: '一期商场 1–6F：住户电梯从 1F 直达 7F（与商场天台同层），不停商场楼层' });
});

test('其他楼栋没有裙房说明行；一期楼层牌照旧', () => {
  for (const id of ['P1', 'P2', 'W1', 'W2', 'H', 'A', 'WPG']) {
    if (!L.buildings.some((b) => b.id === id)) continue;
    assert.equal(podiumOf(L, id), null, id);
    assert.ok(!floorRows(L, id).includes('floor-podium'), id);
    assert.equal(podiumDirectoryRow(L, id), '');
  }
  const p1 = rows(floorRows(L, 'P1'));
  assert.equal(p1.length, L.levels.filter((l) => l.building === 'P1').length + 1);
  assert.equal(p1[1].num, 'RF');
  assert.equal(floorRows(L, 'nope'), '');
});
