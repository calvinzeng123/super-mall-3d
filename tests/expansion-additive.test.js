// 游览布局与超高层工作开始前（e6948b9）相比只多了约定的字段（supertall P0a 验收，SPEC §5.3）：
// zones（楼栋）、zone（楼层）、门禁的 releaseOnAlarm / role / leaf，且只出现在游览布局专有的记录上。
// The layout is split into record groups (tests/support/layout-groups.js: one per building, plus each other
// top-level key); with the additive keys stripped, every group must hash as it did at e6948b9
// (tests/campus-deltas/base.js). A package that changes a group on purpose lists it in its delta's expansionChanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { buildLayout } from '../src/layout/layout.js';
import { groupHashes, ADDITIVE } from './support/layout-groups.js';
import { BASE, DELTAS, EXPANSION_BASELINE } from './campus-deltas/index.js';

test('剥去约定字段后，游览布局的每个记录组都与 e6948b9 相同', () => {
  const now = groupHashes(L), changed = new Set(DELTAS.flatMap((d) => d.expansionChanged || []));
  // 超级商业中心（campus-deltas/p1-mega.js）有意改了 site、extensions、expansion 和两座附楼，基线组从 31 降到 26
  assert.ok(Object.keys(EXPANSION_BASELINE).length >= 25);
  for (const [g, sha] of Object.entries(EXPANSION_BASELINE)) assert.equal(now[g], sha, `record group ${g} changed (list it in your campus-deltas expansionChanged if on purpose)`);
  for (const g of Object.keys(now)) assert.ok(g in BASE.expansionGroups || changed.has(g), `new record group ${g}`);
});

test('约定字段只出现在游览布局专有的记录上，取值合法', () => {
  const C = buildLayout({ expansion: false }), compact = new Set(C.buildings.map((b) => b.id));
  assert.deepEqual(ADDITIVE, { building: ['zones'], level: ['zone'], gate: ['releaseOnAlarm', 'role', 'leaf'] });
  for (const b of L.buildings.filter((q) => q.zones)) assert.ok(!compact.has(b.id), `${b.id} exists in the compact layout`);
  const zoned = new Set(L.buildings.filter((q) => q.zones).map((q) => q.id));
  for (const lv of L.levels.filter((l) => 'zone' in l)) assert.ok(zoned.has(lv.building), `${lv.id}.zone on an unzoned building`);
  for (const g of L.accessControl.gates) {
    assert.equal(g.releaseOnAlarm, true); assert.ok(['entry', 'exit', 'reentry'].includes(g.role)); assert.ok(['own', 'existing'].includes(g.leaf));
  }
  assert.equal(C.accessControl, undefined);
});
