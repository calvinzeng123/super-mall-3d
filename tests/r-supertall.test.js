// 云澜汇楼盘 R1–R4（游览布局）。P0a stub: the 二期 R package (P-R) owns this file and replaces these pins with the
// supertall ones (SPEC §4 r-supertall.test.js: 53 / 50 / 47 / 44 storeys, refuge floors 14F / 27F / 40F, …).
// Until then the expansion R1–R4 are today's 30-storey towers, identical to the compact layout (the FPS truth in
// hospitality.test.js); this pins them in the expansion layout too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { COMPACT_IDENTICAL } from './campus-deltas/index.js';

test('游览布局的 R1–R4（P-R 接手前）：30 层，2–30F 各 3 户（87 户），屋面 103.4 m，与紧凑布局一致', () => {
  for (const id of ['R1', 'R2', 'R3', 'R4']) {
    const b = L.buildings.find((q) => q.id === id), levels = L.levels.filter((l) => l.building === id);
    assert.equal(b.storeys, 30); assert.equal(b.height, 103.4);
    assert.equal(levels.filter((l) => l.levelNumber).length, 30);
    assert.equal(levels.flatMap((l) => l.units).length, 87);
    assert.equal(levels.filter((l) => l.kind === 'refuge').length, 0);
    assert.ok(COMPACT_IDENTICAL.includes(id), `${id} is no longer compact-identical: pin the supertall tower here`);
  }
});
