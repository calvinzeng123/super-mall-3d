// 导航楼层共享（supertall P0a, SPEC §2.1 "nav plan sharing", perf.md §6.1）：墙与障碍物逐元素相同（1 mm）的楼层
// 共用 walls / obstacles / grid；行走冒烟校验和与不共享时完全相同，导航常驻内存 ≤ 30 MB（今天的高度）。
// The heap is measured in child processes with --expose-gc (tests/support/nav-measure.mjs), one per mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildNav, step, clear } from '../src/layout/nav.js';
import { syntheticTower } from './fixtures/synthetic-tower.js';

const script = fileURLToPath(new URL('./support/nav-measure.mjs', import.meta.url));
const measure = (mode) => JSON.parse(execFileSync(process.execPath, ['--expose-gc', script, mode], { encoding: 'utf8' }).trim().split('\n').at(-1));

test('共享与不共享：行走冒烟校验和、墙数、楼层数完全相同；共享后导航常驻 ≤ 30 MB', () => {
  const share = measure('share'), plain = measure('noshare');
  assert.ok(share.gc && plain.gc, 'run with --expose-gc');
  assert.equal(share.checksum, plain.checksum, 'walking differs with sharing');
  assert.equal(share.moves, plain.moves); assert.ok(share.moves > 500);
  assert.equal(share.walls, plain.walls); assert.equal(share.floors, plain.floors);
  assert.equal(plain.shared, 0);
  assert.ok(share.shared > share.floors / 2, `only ${share.shared} of ${share.floors} floors share a plan`);
  assert.ok(share.navHeapMB <= 30, `nav heap ${share.navHeapMB} MB > 30 MB`);
  assert.ok(share.navHeapMB < plain.navHeapMB * 0.7, `sharing saved too little (${share.navHeapMB} / ${plain.navHeapMB} MB)`);
});

test('共享只发生在逐元素相同的楼层之间；有门禁门扇的楼层不共享门扇；lv.navPlan 复用同一标准层的墙', () => {
  const S = syntheticTower(), nav = buildNav(S), solo = buildNav(S, { share: false });
  const F2 = nav.floors.get('S-2F'), F4 = nav.floors.get('S-4F'), F3 = nav.floors.get('S-3F');
  assert.equal(F4.sharedPlan, 'S-2F', 'two identical home floors share one plan');
  assert.equal(F4.walls, F2.walls); assert.equal(F4.grid, F2.grid); assert.equal(F4.obstacles, F2.obstacles);
  assert.notEqual(F3.walls, F2.walls, 'the refuge floor (plant rooms, 分隔 partition) has its own plan');
  assert.equal(nav.floors.get('S-1F').sharedPlan, undefined, 'the gated lobby keeps its own walls');
  for (const [id, F] of nav.floors) {
    const G = solo.floors.get(id);
    assert.equal(F.walls.length, G.walls.length, id);
    F.walls.forEach((w, i) => { const v = G.walls[i]; assert.ok(Math.abs(w.x0 - v.x0) < 1e-3 && Math.abs(w.z1 - v.z1) < 1e-3 && !!w.gate === !!v.gate, `${id} wall ${i}`); });
  }
  // the same walk on both models
  let a = { floor: 'S-2F', x: -4, z: 4, y: 4.5, slope: null }, b = { ...a };
  for (let i = 0; i < 120; i++) { a = step(nav, a, -.1, -.05); b = step(solo, b, -.1, -.05); }
  assert.deepEqual([a.x, a.z, a.floor], [b.x, b.z, b.floor]); assert.ok(clear(nav, a));
  // lv.navPlan: the 4F repeat copies the walls built for 2F instead of rebuilding them
  const K = syntheticTower();
  for (const id of ['S-2F', 'S-4F']) K.levels.find((l) => l.id === id).navPlan = 'typical';
  const kn = buildNav(K, { share: false });
  assert.deepEqual(kn.floors.get('S-4F').walls.map((w) => [w.x0, w.z0, w.x1, w.z1]), kn.floors.get('S-2F').walls.map((w) => [w.x0, w.z0, w.x1, w.z1]));
  assert.deepEqual(kn.floors.get('S-4F').walls.map((w) => [w.x0, w.z0]), solo.floors.get('S-4F').walls.map((w) => [w.x0, w.z0]));
});
