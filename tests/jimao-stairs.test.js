// 消防楼梯的楼层牌和快速上下楼（src/jimao/stairs.js）。用真的地图导航跑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { STAIR, stairRuns, stairSigns, buildStairSigns, floorLabel, createStairControl } from '../src/jimao/stairs.js';

const nav = buildNav(buildPlayableLayout({ mode: 'arcade' }));
const runs = stairRuns(nav);

test('楼梯分段：公寓、酒店、北区塔楼、商场的防烟楼梯都串成「一层到上一层」；两头的站位都在各自那层的楼面上', () => {
  assert.ok(runs.length > 600, `共 ${runs.length} 段`);
  for (const b of ['A', 'H', 'T1', 'T2', 'P1']) assert.ok(runs.some((r) => r.from.startsWith(b + '-')), `${b} 有楼梯`);
  for (const r of runs) {
    assert.ok(!nav.floors.get(r.from).stairLanding && !nav.floors.get(r.to).stairLanding, '两头都是正式楼层，不是休息平台');
    assert.ok(r.y1 > r.y0 + 2, `${r.id} 往上走`);
    for (const [floor, p] of [[r.from, r.a], [r.to, r.b]]) {
      const s = landAt(nav, p.x, p.z, p.y + 0.6);
      assert.ok(s && s.floor === floor && Math.abs(s.y - p.y) < 0.3, `${r.id} 的站位落在 ${floor} 上`);
    }
  }
  // 公寓那部主楼梯：从 B2 一层层接到屋面，不断档
  const chain = ['A-B2']; for (let i = 0; i < 40; i++) { const next = runs.find((r) => r.from === chain.at(-1) && r.id.startsWith('A-ST1')); if (!next) break; chain.push(next.to); }
  assert.equal(chain.at(-1), 'A-RF', chain.join('>')); assert.ok(chain.length >= 22);
  assert.equal(floorLabel(nav, 'A-3F'), '3F'); assert.equal(floorLabel(nav, 'A-RF'), 'RF');
});

test('楼层牌：每段楼梯的两头各能看到一块写着本层的牌子，离地两米多、牌面朝着梯段；所有牌子合成按楼梯间分组的网格', () => {
  const signs = stairSigns(nav, runs);
  for (const r of runs.filter((x, i) => i % 7 === 0)) {
    for (const [floor, e, toward] of [[r.to, r.eb, { x: -r.db.x, z: -r.db.z }], [r.from, r.ea, r.da]]) {
      const s = signs.find((q) => q.floor === floor && Math.hypot(q.x - e.x, q.z - e.z) < 2.3);
      assert.ok(s, `${r.id} 在 ${floor} 的口上有牌子`);
      assert.equal(s.label, floorLabel(nav, floor));
      assert.ok(Math.abs(s.y - e.y - STAIR.signUp) < 1e-6);
    }
    // 上行到顶的那块：牌面朝着走上来的人（法线和上行方向相反）
    const top = signs.find((q) => q.floor === r.to && Math.hypot(q.x - r.eb.x - r.db.x * STAIR.signOut, q.z - r.eb.z - r.db.z * STAIR.signOut) < 1e-6);
    if (top) assert.ok(top.nx * r.db.x + top.nz * r.db.z < -0.99);
  }
  const built = buildStairSigns(nav, { runs, doc: null });
  assert.equal(built.signs.length, signs.length);
  assert.ok(built.root.children.length > 20 && built.root.children.length < signs.length / 3, `分成 ${built.root.children.length} 组`);
  assert.equal(built.root.children.reduce((n, m) => n + m.geometry.index.count / 6, 0), signs.length, '每块牌子一个四边形');
  // 只画人附近的
  built.update({ x: -29.8, z: -248.8 });
  const shown = built.root.children.filter((m) => m.visible).length;
  assert.ok(shown >= 1 && shown < 12, `公寓楼梯口附近亮着 ${shown} 组`);
  built.dispose();
});

function world() {
  const physics = createMapPhysics(nav), msgs = [], events = [];
  const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0.3, alive: true, mounted: false, invulnerable: false };
  const G = { player, physics, game: { state: 'playing' }, enemies: { list: [] }, input: { touch: false }, hud: { message: (t) => msgs.push(t) }, events: { emit: (n, e) => events.push([n, e]) }, arms: { low: 0, setLowered(k) { this.low = k; } } };
  const post = { fade: 0 }, lift = { near: false, riding: false };
  let reason = null;
  const stairs = createStairControl(G, { nav, post, lift, runs, blocked: () => reason });
  const run = (secs) => { for (let t = 0; t < secs - 1e-9; t += 1 / 60) { post.fade = 0; stairs.update(1 / 60); } };
  return { G, player, stairs, post, lift, msgs, events, run, block: (r) => { reason = r; } };
}

test('快速上下楼：站在楼梯口两个方向都给；按一下，一秒多以后人在上一层的楼梯口、面朝楼面；中途压黑、人不能动不挨打；再按回得来', () => {
  const { G, player, stairs, post, events, run } = world();
  const up = runs.find((r) => r.from === 'A-3F' && r.id.startsWith('A-ST1')), down = runs.find((r) => r.to === 'A-3F' && r.id.startsWith('A-ST1'));
  player.pos.set(up.a.x, up.a.y, up.a.z); run(0.1);
  assert.equal(stairs.near, true);
  assert.equal(stairs.options.up, up); assert.equal(stairs.options.down, down, '上去的口和下去的口隔着三四米，站一头两个方向都给');
  assert.equal(stairs.press('up'), true); assert.equal(stairs.press('up'), false, '已经在走了');
  assert.equal(stairs.riding, true); assert.equal(player.mounted, true); assert.equal(player.invulnerable, true); assert.equal(G.arms.low, 1);
  assert.deepEqual(events.at(-1), ['stair:quick', { from: 'A-3F', to: 'A-4F', dir: 'up' }]);
  let dark = 0; for (let t = 0; t < STAIR.time / 2 - 0.05; t += 1 / 60) { post.fade = 0; stairs.update(1 / 60); dark = Math.max(dark, post.fade); }
  assert.ok(dark > 0.99, '中途全黑'); assert.ok(player.pos.distanceTo(new THREE.Vector3(up.a.x, up.a.y, up.a.z)) < 1e-6, '黑透以后才换位置');
  run(STAIR.time / 2 + 0.1);
  assert.equal(stairs.riding, false); assert.equal(player.mounted, false); assert.equal(player.invulnerable, false); assert.equal(G.arms.low, 0);
  assert.ok(player.pos.distanceTo(new THREE.Vector3(up.b.x, up.b.y, up.b.z)) < 1e-6);
  assert.equal(landAt(nav, player.pos.x, player.pos.z, player.pos.y + 0.6).floor, 'A-4F');
  const f = { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
  assert.ok(f.x * up.db.x + f.z * up.db.z > 0.999 && player.pitch === 0, '面朝楼面、平视');
  assert.ok(post.fade < 0.05, '亮回来了');
  assert.equal(stairs.press('down'), true); run(STAIR.time + 0.1);
  assert.ok(player.pos.distanceTo(new THREE.Vector3(up.a.x, up.a.y, up.a.z)) < 1e-6, '下来回到 3F 的口');
  assert.equal(landAt(nav, player.pos.x, player.pos.z, player.pos.y + 0.6).floor, 'A-3F');
});

test('快速上下楼不让用的时候：附近有敌人、这段被堵了（丧尸围城）、正在电梯口、不在楼梯口、已经在梯段上', () => {
  const { G, player, stairs, lift, msgs, run, block } = world();
  const up = runs.find((r) => r.from === 'A-3F' && r.id.startsWith('A-ST1'));
  player.pos.set(up.a.x, up.a.y, up.a.z); run(0.1);
  const foe = { pos: new THREE.Vector3(up.a.x + 5, up.a.y, up.a.z), alive: true, active: true };
  G.enemies.list.push(foe);
  assert.equal(stairs.press('up'), false); assert.match(msgs.at(-1), /附近有敌人/);
  foe.pos.y += 3.5; assert.equal(stairs.press('up'), true, '隔着一层楼的敌人不算'); stairs.reset(); assert.equal(player.mounted, false);
  G.enemies.list.length = 0;
  block('楼梯被杂物堵死了'); assert.equal(stairs.press('up'), false); assert.equal(msgs.at(-1), '楼梯被杂物堵死了'); block(null);
  lift.near = true; run(0.05); assert.equal(stairs.near, false); assert.equal(stairs.press('up'), false); lift.near = false;
  G.game.state = 'paused'; assert.equal(stairs.press('up'), false); G.game.state = 'playing';
  // 走开 8 米
  player.pos.set(up.a.x - 8, up.a.y, up.a.z); run(0.05); assert.equal(stairs.near, false); assert.equal(stairs.press('up'), false);
  // 站在梯段中间
  player.pos.set((up.ea.x + up.da.x * 1.5), up.ea.y + 0.9, (up.ea.z + up.da.z * 1.5)); run(0.05);
  assert.ok(landAt(nav, player.pos.x, player.pos.z, player.pos.y + 0.6)?.slope, '这一点在梯段上'); assert.equal(stairs.near, false);
  stairs.dispose();
});
