// 丧尸围城的登机：真的任务系统（missions.js createMissionDirector）接真的围城（siege.js），不用假的 director。
// 坐飞机时被打下来 / 在飞机上阵亡，点「回到登机点重来」：任务系统重抽时把关着的撤离点清掉了，
// 平时只在直升机落稳那一下才开——以前从登机点重来以后登机门永远不开，人站在飞机旁边上不去（卡死）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { stairRuns } from '../src/jimao/stairs.js';
import { SIEGE, createSiege } from '../src/jimao/siege.js';
import { createMissionDirector } from '../src/jimao/missions.js';
import { createSupplies } from '../src/jimao/supplies.js';
import { ZOMBIE, addZombies } from '../src/jimao/zombie.js';

// 机枪、耐久条这些 HUD 要往页面上挂：给一个什么都接得住、查什么都查不到的 document（这个文件单独一个进程跑，不影响别的测试）
const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === 'width' || k === 'height' ? 64 : any()), apply: () => any(), set: () => true });
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => any(), body: any(), head: any() };

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' }), runs = stairRuns(nav);
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };

/** 一局：真的任务系统 + 真的围城。原游戏那几步（onReset 里重抽、重置目标、走到登机门）照 vendor/game.js 的顺序做 */
function world(tower) {
  const physics = createMapPhysics(nav), scene = new THREE.Scene(), handlers = {};
  const ctx = { rng: seq(11), list: [], retire(m) { m._deactivate(); }, releaseToken() {} };
  const enemies = { debug: { ctx }, list: ctx.list, spawn(type, pos, opts) { const z = ctx.pools[type].find((q) => !q.active); if (!z) return null; z._activate(pos, opts); if (!ctx.list.includes(z)) ctx.list.push(z); return z; } };
  const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: true, health: 100, damage() {}, addShake() {} };
  const G = { scene, physics, player, enemies, time: { frame: 0 }, level: { playerStart: { pos: new THREE.Vector3(), yaw: 0 } },
    events: { emit(n, e) { for (const h of handlers[n] || []) h(e); }, on(n, h) { (handlers[n] ||= []).push(h); } }, fx: { smoke() {}, explosion() {}, sparks() {} },
    game: { state: 'playing', run: { relays: [] }, completeAll() { this.run.allCut = true; }, refreshObjective() {} }, hud: { q: [], radio(t) { this.q.push(t); }, clearRadio() { this.q.length = 0; }, message() {} }, // 无线电照原游戏一句接一句排队
    rifle: { ammo: 30, reserve: 150 }, weapon: { lock() {}, unlock() { return true; }, select() {}, setMelee() {}, grant() { return true; }, setVisible() {} } };
  physics.stateOf = (p) => landAt(nav, p.x, p.z, p.y + 0.6); physics.forget = () => {};
  const zombies = addZombies(G, enemies, { count: ZOMBIE.pool });
  const director = createMissionDirector(G, { scene, layout: L, nav, J: { PLAYER: { eye: 1.62 }, RADIO: {} }, rng: seq(5) });
  const supplies = createSupplies(G, { scene, actions: { countOf: () => 0, give: () => 0 }, ammo: { give: (n) => n }, rng: seq(3) });
  const siege = createSiege(G, { layout: L, nav, scene, zombies, director, runs, rng: seq(7), tower, supplies, storage: { getItem: () => '1', setItem() {} } });
  G.siege = siege; G.zombies = zombies; G.missions = director;
  // 原游戏的重置（H()）：onReset（重抽任务 → 围城重置）→ 目标全部变回没完成
  const reset = () => { director.roll(); siege.reset(); G.game.run.relays = director.state.mission.objectives.map((o) => ({ o, cut: false })); G.game.run.allCut = false; };
  const step = (secs) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { G.time.frame++; director.prePlayer(1 / 30); director.update(1 / 30); siege.update(1 / 30); for (const q of [...ctx.list]) q._update(1 / 30); } };
  // 原游戏每帧：走到登机门半径里、目标全完成就登机（onExtract）
  const atDoor = () => { const x = G.level.extraction; if (!x || !G.game.run.allCut) return false; player.pos.set(x.pos.x, x.pos.y, x.pos.z); G.level.onExtract(); return true; };
  return { G, siege, director, zombies, player, reset, step, atDoor };
}

for (const tower of ['A', 'T1']) {
  test(`${tower}：坐飞机时阵亡，点「回到登机点重来」——登机门是开着的，走过去就能上飞机、开始清扫；清扫要用的点不用在登机那一帧重算`, () => {
    const { G, siege, director, zombies, reset, step, atDoor } = world(tower);
    reset(); siege.prepareFloors(); const S = siege.state;
    assert.equal(G.level.extraction, null, '开局登机门关着（直升机还没到）');
    // 一路打到信号弹，守完屋顶，直升机落稳：登机门开了
    for (const r of G.game.run.relays) r.cut = true; G.game.run.allCut = true; step(0.2);
    for (const z of zombies.alive()) z._deactivate();
    assert.ok(S.hold >= 0, '点了信号弹');
    S.hold = SIEGE.hold - 0.1; step(SIEGE.land + 0.5);
    assert.equal(S.landed, true); assert.ok(G.level.extraction, '落稳了登机门开了');
    for (let i = 0; i < 4000 && !S.prepOut; i++) step(1 / 30); // 等飞机那一阵分帧算完
    const prep = S.prepOut; assert.ok(prep);
    // 登机门旁边围着几只（人跑过去的时候它们也在）：照样上得去，上了飞机屋顶上的收掉
    const door = G.level.extraction.pos, near = []; for (const z of zombies.alive()) z._deactivate();
    for (let k = 0; k < 6; k++) { const a = k * 1.05, z = G.enemies.spawn('zombie', new THREE.Vector3(door.x + Math.cos(a) * 1.3, door.y, door.z + Math.sin(a) * 1.3), { kind: 'walker', hunt: true, state: 'alert' }); if (z) near.push(z); }
    assert.ok(near.length >= 4); step(0.5);
    // 守屋顶时队友喊的、楼里的台词还排着没播：上了飞机不再播
    G.hud.q.push('阿哲：尖叫者！先打它！', '楼里的台词');
    // 登机、起飞，在飞机上阵亡
    assert.ok(atDoor()); assert.equal(director.state.phase, 'board'); assert.ok(S.sweep, '登机就开始清扫');
    assert.ok(near.every((z) => !z.active || z.sweep), '登机门旁边那几只收掉了（池子里的同一只可能被清扫重新用上）');
    assert.ok(!G.hud.q.some((t) => t.includes('先打它') || t === '楼里的台词'), `地上的无线电登机时清掉：${G.hud.q.join(' / ')}`);
    step(3); assert.equal(director.state.phase, 'ride');
    G.events.emit('player:dead', {}); assert.equal(director.state.checkpoint?.kind, 'helicopter');
    // 点「回到登机点重来」
    director.state.retryArmed = true; reset();
    assert.equal(director.state.restore, true); assert.equal(S.landed, true);
    step(1);
    assert.equal(G.game.run.allCut, true, '前面的目标都算完成');
    assert.ok(G.level.extraction, '登机门开着');
    assert.equal(S.prepOut, prep, '同一局、同一条航线：算好的清扫点留着');
    assert.ok(atDoor(), '走到登机门就上飞机'); assert.equal(director.state.phase, 'board');
    assert.ok(S.sweep && S.sweep.list.length > 0, '清扫开始了');
    // 再换一局（不是从登机点重来）：清扫点扔掉重算
    director.state.retryArmed = false; G.player.alive = true; reset();
    assert.equal(director.state.restore, false); assert.equal(S.prepOut, null); assert.equal(G.level.extraction, null, '新的一局登机门照旧关着');
  });
}
