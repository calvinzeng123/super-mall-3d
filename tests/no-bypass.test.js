// 门禁不可绕过（SPEC §1.0「card zones」第 4 条，C-3）：门禁全关（buildNav(L)，没有人刷卡）时，从园区、商场、
// 公共楼层出发，走不进任何住户层；门禁全开（buildNav(L, { gates: 'open' })，火灾报警释放）时每个住户层都能走到。
// The harness (tests/support/no-bypass.js) floods the real walking model: step() through walls, closed gate
// leaves and door portals, stair flights end to end, lift and stair links as linksNear offers them.
// P0a: the harness on a synthetic tower, and today's gated towers (北苑 T1/T2, 西苑 W1/W2). Each supertall
// package lists its own towers in its tests/campus-deltas file (noBypass).
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { buildNav } from '../src/layout/nav.js';
import { GATE } from '../src/layout/access-records.js';
import { floodNav, bypasses, towerFlood } from './support/no-bypass.js';
import { syntheticTower } from './fixtures/synthetic-tower.js';
import { NO_BYPASS } from './campus-deltas/index.js';

const STREET = [{ floor: 'ground', x: 0, z: 20 }];
const HOMES = ['S-2F', 'S-3F', 'S-4F', 'S-RF'];
const flood = (opts, navOpts = {}) => floodNav(buildNav(syntheticTower(opts), navOpts), STREET);

test('合成塔楼：门禁关闭时街上的人只能到首层门禁外，火灾释放后每一层都能到', () => {
  const closed = flood({});
  assert.deepEqual(HOMES.filter((id) => closed.reached(id)), [], '门禁关闭却走进了住户层');
  assert.ok(closed.reached('S-1F') && closed.at('S-1F').every(([, z]) => z > 5 - 0.31), '首层门禁内侧不应可达');
  const open = flood({}, { gates: 'open' });
  assert.deepEqual(HOMES.filter((id) => !open.reached(id)), [], '火灾释放后仍有楼层到不了');
  // symmetric model: every home floor reaches the street again with the gates released
  const nav = buildNav(syntheticTower(), { gates: 'open' });
  for (const id of HOMES) {
    const [x, z] = floodNav(nav, STREET).at(id)[0];
    assert.ok(floodNav(nav, [{ floor: id, x, z }], { until: ['ground'] }).reached('ground'), `${id} 疏散不到室外`);
  }
});

test('合成塔楼：检测器能发现绕过门禁的电梯、过近的楼梯停靠点；fireOnly 层站只在火灾模式开门', () => {
  // a passenger lift with a normal landing on the public side is a bypass
  assert.deepEqual(bypasses(buildNav(syntheticTower({ publicLift: 'L1' })), STREET, HOMES).sort(), ['S-2F', 'S-3F', 'S-4F', 'S-RF']);
  // a stair stop within reach of the public side of the gate line is one too (why GATE.reachClear exists)
  assert.ok(GATE.reachClear >= 2);
  assert.ok(bypasses(buildNav(syntheticTower({ gateZ: 3 })), STREET, HOMES).length > 0, '楼梯停靠点离门线太近也应算绕过');
  // a fire lift whose public landing is fire-mode only: sealed in normal mode, open in fire mode (C-3 rule 1)
  const fireOnly = { publicLift: 'LF', lfServes: ['2F', '3F', '4F', 'RF'], lfFireOnly: ['1F'] };
  assert.deepEqual(bypasses(buildNav(syntheticTower(fireOnly)), STREET, HOMES), [], 'fireOnly 层站在平时不应开门');
  assert.deepEqual(bypasses(buildNav(syntheticTower(fireOnly), { gates: 'open' }), STREET, HOMES).sort(), HOMES);
  // the same landing as a normal stop is a bypass
  assert.ok(bypasses(buildNav(syntheticTower({ publicLift: 'LF' })), STREET, HOMES).length > 0);
});

// ---------- real towers (today: 北苑 T1/T2, 西苑 W1/W2; each package adds its own in tests/campus-deltas) ----------
const navClosed = buildNav(L), navOpen = buildNav(L, { gates: 'open' });
const CELL = 0.6, MARGIN = 10;

test('真实塔楼：门禁关闭时从每道门禁外侧出发走不进任何住户层，火灾释放后每个住户层都能到达', () => {
  assert.ok(NO_BYPASS.length >= 4);
  for (const entry of NO_BYPASS) {
    const f = towerFlood(L, navClosed, entry.tower, { margin: MARGIN, extraStarts: entry.starts || [] });
    const floors = entry.floors || f.protectedFloors;
    assert.ok(floors.length > 0 && f.starts.length > 0, `${entry.tower}: nothing to check`);
    const closed = floodNav(navClosed, f.starts, { cell: CELL, floors: f.floors, box: f.box });
    assert.deepEqual(floors.filter((id) => closed.reached(id)), [], `${entry.tower}: 门禁关闭却能走进住户层`);
    const o = towerFlood(L, navOpen, entry.tower, { margin: MARGIN, extraStarts: entry.starts || [] });
    const open = floodNav(navOpen, o.starts, { cell: CELL, floors: o.floors, box: o.box, until: floors });
    assert.deepEqual(floors.filter((id) => !open.reached(id)), [], `${entry.tower}: 火灾释放后仍有住户层到不了`);
  }
});

test('真实塔楼：每一道门禁都是唯一屏障，单独常开任何一道即可走进住户层（检测器在真实数据上有效）', () => {
  for (const bid of ['T2', 'W1']) {
    const f = towerFlood(L, navClosed, bid, { margin: MARGIN });
    for (const s of f.starts.filter((q) => q.gate)) {
      const g = navClosed.gates.get(s.gate);
      g.open = true;
      try {
        const r = floodNav(navClosed, f.starts, { cell: CELL, floors: f.floors, box: f.box, until: f.protectedFloors.slice(0, 1) });
        assert.ok(r.reached(f.protectedFloors[0]), `${s.gate} 常开后仍走不进 ${bid}：检测器失效或门禁多余`);
      } finally { g.open = false; }
    }
  }
});
