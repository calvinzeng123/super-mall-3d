// 丧尸围城联机的直升机清扫（missions.js 的 crew / ensureGun2 / CABIN + siege.js 的 twin）：真的任务系统接真的围城。
// 两挺舱门机枪（右舷第二挺）、飞机绕楼时调头让右舷那挺朝楼、航线外侧也撒了楼下的点、机舱里的第三个人拿步枪走动（出不了舱门、穿不过机枪手）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { stairRuns } from '../src/jimao/stairs.js';
import { SIEGE, createSiege } from '../src/jimao/siege.js';
import { createMissionDirector, CABIN } from '../src/jimao/missions.js';
import { RIDE_SPECS } from '../src/jimao/ride-vehicles.js';
import { createSupplies } from '../src/jimao/supplies.js';
import { ZOMBIE, addZombies } from '../src/jimao/zombie.js';

// 机枪、耐久条这些 HUD 要往页面上挂：给一个什么都接得住的 document（这个文件单独一个进程跑）
const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === 'width' || k === 'height' ? 64 : any()), apply: () => any(), set: () => true });
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => any(), body: any(), head: any() };

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' }), runs = stairRuns(nav);
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };

function world(twin) {
  const physics = createMapPhysics(nav), scene = new THREE.Scene(), handlers = {};
  const ctx = { rng: seq(11), list: [], retire(m) { m._deactivate(); }, releaseToken() {} };
  const enemies = { debug: { ctx }, list: ctx.list, spawn(type, pos, opts) { const z = ctx.pools[type].find((q) => !q.active); if (!z) return null; z._activate(pos, opts); if (!ctx.list.includes(z)) ctx.list.push(z); return z; } };
  const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, alive: true, health: 100, damage() {}, addShake() {} };
  const weapon = { shown: null, picked: null, ammo: 0, owns: { rifle: true }, lock() {}, unlock() { return true }, select(s) { this.picked = s; }, setMelee() {}, grant() { return true; }, setVisible(v) { this.shown = v; }, addAmmo(n) { this.ammo += n; } };
  const G = { scene, physics, player, enemies, time: { frame: 0 }, level: { playerStart: { pos: new THREE.Vector3(), yaw: 0 } }, input: { move: { x: 0, y: 0 } },
    events: { emit(n, e) { for (const h of handlers[n] || []) h(e); }, on(n, h) { (handlers[n] ||= []).push(h); } }, fx: { smoke() {}, explosion() {}, sparks() {} },
    game: { state: 'playing', run: { relays: [] }, completeAll() { this.run.allCut = true; }, refreshObjective() {} }, hud: { radio() {}, clearRadio() {}, message() {} },
    rifle: { ammo: 30, reserve: 150 }, weapon };
  physics.stateOf = (p) => landAt(nav, p.x, p.z, p.y + 0.6); physics.forget = () => {};
  const zombies = addZombies(G, enemies, { count: ZOMBIE.pool });
  const director = createMissionDirector(G, { scene, layout: L, nav, J: { PLAYER: { eye: 1.62 }, RADIO: {} }, rng: seq(5) });
  const supplies = createSupplies(G, { scene, actions: { countOf: () => 0, give: () => 0 }, ammo: { give: (n) => n }, rng: seq(3) });
  const siege = createSiege(G, { layout: L, nav, scene, zombies, director, runs, rng: seq(7), tower: 'A', supplies, storage: { getItem: () => '1', setItem() {} } });
  G.siege = siege; G.zombies = zombies; G.missions = director;
  siege.twin = twin; // 联机：rules.js 每帧照「房间里有没有两个真人」设
  const reset = () => { director.roll(); siege.reset(); G.game.run.relays = director.state.mission.objectives.map((o) => ({ o, cut: false })); G.game.run.allCut = false; };
  const step = (secs, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { G.time.frame++; each?.(); director.prePlayer(1 / 30); director.update(1 / 30); siege.update(1 / 30); for (const q of [...ctx.list]) q._update(1 / 30); } };
  const atDoor = () => { const x = G.level.extraction; if (!x || !G.game.run.allCut) return false; player.pos.set(x.pos.x, x.pos.y, x.pos.z); G.level.onExtract(); return true; };
  // 一路打到直升机落稳、清扫点算完
  const toPad = () => {
    reset(); siege.prepareFloors(); const S = siege.state;
    for (const r of G.game.run.relays) r.cut = true; G.game.run.allCut = true; step(0.2);
    for (const z of zombies.alive()) z._deactivate();
    S.hold = siege.holdPlan().hold - 0.1; step(SIEGE.land + 0.5);
    for (let i = 0; i < 4000 && !S.prepOut; i++) step(1 / 30);
    for (const z of zombies.alive()) z._deactivate();
    return S;
  };
  return { G, siege, director, zombies, player, weapon, step, atDoor, toPad };
}
// 楼下的点离楼的外轮廓（航线的 box）多远
const outside = (q, B) => Math.hypot(q.x - Math.max(B.x0, Math.min(B.x1, q.x)), q.z - Math.max(B.z0, Math.min(B.z1, q.z)));

test('单人：一挺枪（右舷不造）、航线不调头、楼下的点都在楼边上；机舱走动不生效', () => {
  const { G, siege, director, atDoor, toPad, step } = world(false);
  const S = toPad(); const B = S.flight.box;
  assert.equal(S.flight.twin, false); assert.ok(Math.max(...S.prepOut.groundPool.map((q) => outside(q, B))) < 28, '楼下的点都贴着楼');
  assert.ok(atDoor()); step(3); assert.equal(director.state.phase, 'ride');
  assert.equal(director.doorGun2, null, '单人不造右舷那挺'); assert.equal(director.myGun, director.doorGun); assert.equal(director.gunActive, true, '坐着的时候步枪停用');
  assert.equal(G.weapon.shown, false, '步枪收起来');
  let maxFlip = 0; step(40, () => { maxFlip = Math.max(maxFlip, S.flight.poseAt(director.rideT).flip || 0); }); assert.equal(maxFlip, 0, '单人不调头');
  void siege;
});

test('联机：右舷第二挺、绕楼调头时右舷那挺朝楼打得着、航线外侧也有楼下的点；第三个人在机舱里拿步枪走动，出不了舱门、穿不过两个机枪手', () => {
  const { G, siege, director, player, weapon, atDoor, toPad, step } = world(true);
  const S = toPad(); const B = S.flight.box, H = RIDE_SPECS.helicopter;
  assert.equal(S.flight.twin, true);
  const farN = S.prepOut.groundPool.filter((q) => outside(q, B) > 28).length;
  assert.ok(farN >= 5, `航线外侧撒了 ${farN} 个楼下的点（朝外那挺有东西打）`);
  // 第三个人：坐机舱
  const c = director.crew; c.seat = 'cabin'; c.twin = true; director.ensureGun2();
  assert.ok(atDoor()); step(3); assert.equal(director.state.phase, 'ride');
  assert.ok(director.doorGun2, '右舷那挺装上了'); assert.equal(director.myGun, null, '机舱里的人手上是步枪');
  assert.equal(director.gunActive, false, '步枪照常能用'); assert.equal(weapon.shown, true); assert.equal(weapon.picked, 'rifle'); assert.ok(weapon.ammo > 0, '弹药补满');
  // 往四个方向一直走：出不了机舱那一块，走不进机枪手坐的地方；人跟着机身（在机身里）
  const vv = director.vehicles.heli, tmp = new THREE.Vector3();
  let moved = 0, minGunner = Infinity;
  for (const [mx, my] of [[0, 1], [1, 0], [0, -1], [-1, 0], [0.7, 0.7], [-0.7, -0.7]]) {
    const from = { ...c.cab };
    step(4, () => {
      G.input.move.x = mx; G.input.move.y = my;
      assert.ok(c.cab.x >= CABIN.x0 - 1e-6 && c.cab.x <= CABIN.x1 + 1e-6 && c.cab.z >= CABIN.z0 - 1e-6 && c.cab.z <= CABIN.z1 + 1e-6, `在机舱里 (${c.cab.x.toFixed(2)}, ${c.cab.z.toFixed(2)})`);
      for (const gx of [H.seat[0], -H.seat[0]]) minGunner = Math.min(minGunner, Math.hypot(c.cab.x - gx, c.cab.z - H.seat[2]));
    });
    moved = Math.max(moved, Math.hypot(c.cab.x - from.x, c.cab.z - from.z));
    vv.toWorld([c.cab.x, CABIN.eye, c.cab.z], tmp);
    assert.ok(Math.hypot(player.pos.x - tmp.x, player.pos.z - tmp.z) < 0.6, '人跟着机身走（摆在机舱里那一点）');
  }
  G.input.move.x = 0; G.input.move.y = 0;
  assert.ok(moved > 0.8, `走得动（一个方向最多走了 ${moved.toFixed(2)} 米）`); assert.ok(minGunner > CABIN.gunner - 0.02, `离机枪手最近 ${minGunner.toFixed(2)} 米`);
  // 调头：等到右舷朝楼，楼那一侧打得着的里面有只有右舷那挺够得着的
  const g1 = director.doorGun, g2 = director.doorGun2, e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), at = new THREE.Vector3();
  let flipped = false, only2 = 0, both = 0;
  step(90, () => {
    const p = S.flight.poseAt(director.rideT); if (!(p.flip > 0.99) || director.state.phase !== 'ride') return;
    flipped = true; if (G.time.frame % 15) return;
    g1.eye(e1); g2.eye(e2);
    for (const z of S.sweep?.list || []) {
      if (!z.alive || !z.active || !z.exposeOn) continue;
      at.set(z.pos.x, z.pos.y + 1.15, z.pos.z);
      const a1 = g1.canAim(at, e1), a2 = g2.canAim(at, e2);
      if (a2 && !a1) only2++; if (a1 && a2) both++;
    }
  });
  assert.ok(flipped, '绕楼时调过头');
  assert.ok(only2 > 0, `调头以后右舷那挺够得着、左舷够不着的露头丧尸：${only2} 次（两挺都够得着 ${both} 次）`);
  void siege;
});
