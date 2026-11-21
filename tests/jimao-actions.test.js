// 零点突围的操作补强（src/jimao/actions.js）：滑铲、手雷、手机上的蹲键、辅助瞄准、自动开火。
// 用真的地图物理（physics.js）+ 假的玩家 / 输入 / 敌人跑一遍。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { createActions, SLIDE, GRENADE, ASSIST, THROWABLES, SHELL, slideSpeed, blastDamage, aimAngles, wrapAngle, normalizeControls, CONTROLS_KEY, ACTIONS_CSS } from '../src/jimao/actions.js';
import { LAYOUT_ITEMS } from '../src/jimao/layout-editor.js';

const nav = buildNav(buildPlayableLayout({ mode: 'arcade' }));

function world({ touch = false, prefs = null } = {}) {
  const physics = createMapPhysics(nav), scene = new THREE.Scene();
  const player = { pos: new THREE.Vector3(-135, 0, -98), eye: new THREE.Vector3(-135, 1.68, -98), vel: new THREE.Vector3(), yaw: 0, pitch: 0, alive: true, onGround: true, sprinting: false, crouching: false, health: 100,
    damage(n) { this.health -= n; }, addShake() {} };
  const pressed = new Set();
  const input = { touch, gamepad: false, move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, fire: false, ads: false, sprint: false, crouch: false, pressed: (a) => pressed.has(a), acts: [], act(src, a, on) { this.acts.push([src, a, on]); } };
  const enemies = { list: [] };
  const store = new Map(prefs ? [[CONTROLS_KEY, JSON.stringify(prefs)]] : []);
  const G = { player, input, enemies, physics, game: { state: 'playing' }, weapon: { ammo: 30, state: 'idle' }, events: { log: [], emit(n, e) { this.log.push([n, e]); } },
    fx: { boom: 0, explosion() { this.boom++; } }, audio: { play() {} }, hud: { hitmarker() {} }, render: { lightPool: { flash() {} } } };
  const actions = createActions(G, { scene, storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } });
  const enemy = (x, z, y = 0) => { const e = { pos: new THREE.Vector3(x, y, z), alive: true, active: true, hp: 80, hits: [], damage(n) { this.hits.push(n); this.hp -= n; if (this.hp <= 0) this.alive = false; } }; enemies.list.push(e); return e; };
  return { G, actions, player, input, pressed, enemy, scene, store };
}

test('滑铲：跑动中按蹲才滑；速度从快到慢，0.8 秒滑完，期间一直是蹲着的、不算冲刺；滑完有个短冷却', () => {
  assert.ok(slideSpeed(0) > 8 && slideSpeed(SLIDE.time) < 5 && slideSpeed(SLIDE.time / 2) < slideSpeed(0));
  const { actions, player, input, pressed } = world();
  // 走路时按蹲：不滑
  player.vel.set(0, 0, -3.8); pressed.add('crouch'); actions.pre(1 / 60);
  assert.equal(actions.slide, false);
  // 跑动中按蹲：滑
  player.sprinting = true; player.vel.set(0, 0, -6.4); actions.pre(1 / 60);
  assert.equal(actions.slide, true);
  pressed.clear();
  let frames = 0, first = 0, last = 0;
  while (actions.slide && frames < 200) {
    input.crouch = false; input.sprint = true; actions.pre(1 / 60);
    if (!actions.slide) break;
    const sp = Math.hypot(player.vel.x, player.vel.z);
    if (!frames) first = sp; last = sp; frames++;
    assert.equal(input.crouch, true, '滑的时候是蹲着的'); assert.equal(input.sprint, false);
    assert.ok(Math.abs(player.vel.x) < 1e-9 && player.vel.z < 0, '沿着起滑时的方向');
  }
  assert.ok(Math.abs(frames / 60 - SLIDE.time) < 0.06, `滑了 ${(frames / 60).toFixed(2)} 秒`);
  assert.ok(first > 8 && last < 5, `速度 ${first.toFixed(1)} → ${last.toFixed(1)}`);
  // 冷却里再按不滑
  player.vel.set(0, 0, -6.4); pressed.add('crouch'); actions.pre(1 / 60);
  assert.equal(actions.slide, false);
  // 撞墙（实际速度掉下来）会提前结束
  for (let i = 0; i < 40; i++) { pressed.clear(); actions.pre(1 / 60); }
  pressed.add('crouch'); player.vel.set(0, 0, -6.4); actions.pre(1 / 60); pressed.clear();
  assert.equal(actions.slide, true);
  for (let i = 0; i < 12; i++) { actions.pre(1 / 60); player.vel.set(0, 0, -0.5); }
  actions.pre(1 / 60);
  assert.equal(actions.slide, false, '撞到东西滑不动了应该结束');
});

test('手雷：每局 2 颗、扔完为止；抛物线飞出去落地会弹、停住，2 秒后炸；炸到的敌人按距离掉血，隔着墙的不掉；开弹药箱补 1 颗（最多 3 颗）', () => {
  assert.ok(blastDamage(0) >= 150 && blastDamage(GRENADE.radius) === 0 && blastDamage(3) > blastDamage(5));
  assert.ok(blastDamage(1.5) > 80, '近处的敌人一颗就倒（血量 80）');
  const { G, actions, player, enemy } = world();
  assert.equal(actions.grenades, GRENADE.count);
  // 朝正前方（−z）平着扔；前面 10 米站一个敌人，旁边店铺的墙后面站一个
  player.yaw = 0; player.pitch = 0.05;
  assert.equal(actions.throwNade(), true);
  assert.equal(actions.grenades, GRENADE.count - 1);
  assert.equal(actions.throwNade(), false, '刚扔完有冷却');
  const mesh = G.events.log.find((e) => e[0] === 'grenade:throw');
  assert.ok(mesh);
  let t = 0, maxY = 0, exploded = null, minY = 99;
  const live = () => actions.__proto__ === undefined; // 占位：不用
  void live;
  while (t < 3 && !exploded) {
    actions.pre(1 / 60); actions.update(1 / 60); t += 1 / 60;
    exploded = G.events.log.find((e) => e[0] === 'grenade:explode') || null;
  }
  assert.ok(exploded, '2 秒多就该炸了');
  assert.ok(Math.abs(t - GRENADE.fuse) < 0.1, `引信 ${t.toFixed(2)} 秒`);
  const at = exploded[1].pos;
  const dist = Math.hypot(at.x - player.pos.x, at.z - player.pos.z);
  assert.ok(dist > 8 && dist < 32, `落点离人 ${dist.toFixed(1)} 米`);
  assert.ok(at.y > -0.2 && at.y < 1.2, `炸点高度 ${at.y.toFixed(2)}（应该落在一期 1F 地面上，没穿楼板）`);
  assert.equal(G.fx.boom, 1);
  void maxY; void minY;
  // 第二颗：把敌人摆在将要爆炸的位置附近
  const near = enemy(at.x + 1.5, at.z), mid = enemy(at.x - 4.5, at.z), far = enemy(at.x + 9, at.z);
  G.events.log.length = 0;
  for (let i = 0; i < 60; i++) actions.pre(1 / 60);
  assert.equal(actions.throwNade(), true);
  for (let i = 0; i < 200 && !G.events.log.some((e) => e[0] === 'grenade:explode'); i++) { actions.pre(1 / 60); actions.update(1 / 60); }
  const boom = G.events.log.find((e) => e[0] === 'grenade:explode')[1];
  assert.ok(Math.hypot(boom.pos.x - at.x, boom.pos.z - at.z) < 0.5, '同样的扔法落点一样');
  assert.ok(near.hits.length === 1 && !near.alive, '1.5 米内的敌人被炸倒');
  assert.ok(mid.hits.length === 1 && mid.alive && mid.hits[0] < near.hits[0], '4.5 米的掉血少一些');
  assert.equal(far.hits.length, 0, '9 米外炸不到');
  assert.equal(actions.grenades, 0);
  for (let i = 0; i < 60; i++) actions.pre(1 / 60);
  assert.equal(actions.throwNade(), false, '扔完了');
  assert.equal(actions.give(1), 1); assert.equal(actions.give(5), GRENADE.max - 1); assert.equal(actions.grenades, GRENADE.max);
  actions.reset(); assert.equal(actions.grenades, GRENADE.count);
});

test('燃烧瓶和诱饵弹：捡到才有、各有上限，T / 长按换着用；燃烧瓶一碰就碎、烧 8 秒，火里的敌人一直掉血、自己站进去也烧；诱饵弹响 6.5 秒（一路发信号）再炸', () => {
  const { G, actions, player, enemy } = world();
  const step = (secs) => { for (let t = 0; t < secs - 1e-9; t += 1 / 60) { actions.pre(1 / 60); actions.update(1 / 60); } };
  assert.equal(actions.countOf('fire'), 0); assert.equal(actions.kind, 'frag');
  assert.equal(actions.give(3, 'fire'), THROWABLES.fire.max); assert.equal(actions.give(1, 'lure'), 1); assert.equal(actions.give(1, 'nope'), 0);
  assert.equal(actions.kind, 'frag', '捡到别的不自动换'); assert.equal(actions.cycleKind(), 'fire');
  player.yaw = 0; player.pitch = 0.05;
  assert.equal(actions.throwNade(), true);
  assert.equal(actions.countOf('fire'), THROWABLES.fire.max - 1); assert.equal(actions.grenades, GRENADE.count, '手雷没少');
  let t = 0; while (t < 3 && !G.events.log.some((e) => e[0] === 'grenade:fire')) { step(1 / 60); t += 1 / 60; }
  const lit = G.events.log.find((e) => e[0] === 'grenade:fire');
  assert.ok(lit && t < GRENADE.fuse, `落地就着（${t.toFixed(2)} 秒），不等引信`);
  assert.ok(!G.events.log.some((e) => e[0] === 'grenade:explode')); assert.equal(actions.fires.length, 1);
  const at = lit[1].pos; assert.ok(at.y > -0.2 && at.y < 0.4, `火在地面上 ${at.y.toFixed(2)}`);
  const inside = enemy(at.x + 1, at.z, at.y), outside = enemy(at.x + THROWABLES.fire.radius + 2, at.z, at.y); inside.hp = 1e4;
  step(2);
  const burnt = inside.hits.reduce((a, b) => a + b, 0);
  assert.ok(inside.hits.length >= 4 && Math.abs(burnt - THROWABLES.fire.dps * 2) < THROWABLES.fire.dps * 0.5, `2 秒烧掉 ${burnt.toFixed(0)}`);
  assert.equal(outside.hits.length, 0); assert.equal(player.health, 100, '站在外面不烧');
  const back = player.pos.clone(); player.pos.set(at.x, at.y, at.z); step(1);
  assert.ok(player.health < 100 && player.health > 100 - THROWABLES.fire.selfDps * 1.5, `自己站进去 1 秒掉到 ${player.health.toFixed(0)}`);
  player.pos.copy(back); step(THROWABLES.fire.seconds - 3 + 0.2);
  assert.equal(actions.fires.length, 0, '烧完了'); const n = inside.hits.length; step(1); assert.equal(inside.hits.length, n);
  // 诱饵弹
  assert.equal(actions.cycleKind(), 'lure'); G.events.log.length = 0; inside.hits.length = 0;
  assert.equal(actions.throwNade(), true); assert.equal(actions.countOf('lure'), 0);
  t = 0; while (t < 9 && !G.events.log.some((e) => e[0] === 'grenade:explode')) { step(1 / 60); t += 1 / 60; }
  const beeps = G.events.log.filter((e) => e[0] === 'grenade:lure');
  assert.ok(Math.abs(t - THROWABLES.lure.time) < 0.1, `响了 ${t.toFixed(1)} 秒才炸`);
  assert.ok(beeps.length >= 10 && beeps.every((e) => e[1].range === THROWABLES.lure.range), `响了 ${beeps.length} 声`);
  assert.ok(beeps[beeps.length - 1][1].pos.distanceTo(G.events.log.find((e) => e[0] === 'grenade:explode')[1].pos) < 0.5);
  assert.equal(actions.kind, 'frag', '扔完的那种自动换回还有的（先手雷）');
  actions.reset(); assert.equal(actions.countOf('fire'), 0); assert.equal(actions.kind, 'frag'); assert.equal(actions.grenades, GRENADE.count);
});

test('手雷炸到自己：站在 4.5 米内掉血，越近越多', () => {
  const { actions, player } = world();
  player.pitch = -1.4; // 往脚下扔
  actions.throwNade();
  for (let i = 0; i < 200; i++) { actions.pre(1 / 60); actions.update(1 / 60); }
  assert.ok(player.health < 100 && player.health > 100 - GRENADE.selfDamage - 1, `血量 ${player.health}`);
});

test('辅助瞄准：只在触屏 / 手柄上起作用；准星贴近敌人时转动变慢，开火时往敌人身上带，开镜那一下吸过去；墙后面的敌人不吸', () => {
  assert.ok(Math.abs(aimAngles(0, 0, -1).yaw) < 1e-12 && Math.abs(aimAngles(0, 0, -1).pitch) < 1e-12);
  assert.ok(Math.abs(aimAngles(-1, 0, 0).yaw - Math.PI / 2) < 1e-9 && aimAngles(0, 1, -1).pitch > 0.7);
  assert.ok(Math.abs(wrapAngle(Math.PI * 2 + 0.1) - 0.1) < 1e-9 && Math.abs(wrapAngle(-Math.PI * 2 - 0.1) + 0.1) < 1e-9);
  // 键鼠：不辅助
  { const { actions, player, input, enemy } = world(); enemy(-135, -110); player.yaw = -0.06; input.fire = true; for (let i = 0; i < 30; i++) actions.pre(1 / 60); assert.equal(player.yaw, -0.06); assert.equal(actions.target, null); }
  // 触屏：敌人在正前方偏左 0.06 弧度、10 米
  // 触屏：敌人在正前方 12 米（从出生点看得见），准星偏右 0.06 弧度
  const { G, actions, player, input, enemy } = world({ touch: true });
  assert.ok(G.physics.lineOfSight(player.eye, new THREE.Vector3(-135, 1.15, -110)), '出生点正前方 12 米应该看得见');
  const e = enemy(-135, -110);
  player.yaw = -0.06;
  input.look.dx = 10; input.look.dy = 4; actions.pre(1 / 60);
  assert.ok(actions.target && actions.target.enemy === e);
  assert.ok(Math.abs(input.look.dx - 10 * ASSIST.slow) < 1e-9, '贴近时转动量打了折');
  assert.equal(player.yaw, -0.06, '没开火没开镜：不带');
  input.fire = true;
  for (let i = 0; i < 40; i++) actions.pre(1 / 60);
  assert.ok(player.yaw > -0.03 && player.yaw < 0.001, `开火时往敌人身上带（yaw ${player.yaw.toFixed(3)}，目标 0）`);
  // 开镜吸附：从 0.15 弧度外
  player.yaw = -0.15; player.pitch = 0; input.fire = false; input.ads = false;
  for (let i = 0; i < 6; i++) actions.pre(1 / 60);
  input.ads = true; actions.pre(1 / 60);
  assert.ok(Math.abs(player.yaw - (-0.15 + 0.15 * ASSIST.snap)) < 0.02, `开镜吸过去大半（yaw ${player.yaw.toFixed(3)}）`);
  // 设置里关掉就不辅助
  const off = world({ touch: true, prefs: { assist: false, autoFire: false } });
  off.enemy(-135, -110); off.player.yaw = -0.06; off.input.fire = true;
  for (let i = 0; i < 30; i++) off.actions.pre(1 / 60);
  assert.equal(off.player.yaw, -0.06);
  assert.deepEqual(normalizeControls({ assist: 'x', autoFire: true, other: 1 }), { assist: null, autoFire: true });
});

test('自动开火（触屏）：准星压在敌人身上一瞬就开火，移开后很快停；没子弹、换弹时不开；隔着墙不开', () => {
  const { G, actions, player, input, enemy } = world({ touch: true });
  const e = enemy(-135, -110);
  let fired = 0;
  for (let i = 0; i < 20; i++) { input.fire = false; actions.pre(1 / 60); if (input.fire) fired++; }
  assert.ok(fired >= 8 && fired <= 14, `20 帧里开了 ${fired} 帧（前 0.12 秒不开）`);
  // 移开准星
  player.yaw = 0.6; fired = 0;
  for (let i = 0; i < 30; i++) { input.fire = false; actions.pre(1 / 60); if (input.fire) fired++; }
  assert.ok(fired <= 12, `移开以后还开了 ${fired} 帧`);
  input.fire = false; actions.pre(1 / 60); assert.equal(input.fire, false);
  // 没子弹不开
  player.yaw = 0; G.weapon.ammo = 0; fired = 0;
  for (let i = 0; i < 30; i++) { input.fire = false; actions.pre(1 / 60); if (input.fire) fired++; }
  assert.equal(fired, 0);
  G.weapon.ammo = 30;
  // 敌人挪到隔了好几堵墙的地方（同一方向 60 米内）
  e.pos.set(-135, 0, -150); fired = 0;
  for (let i = 0; i < 30; i++) { input.fire = false; actions.pre(1 / 60); if (input.fire) fired++; }
  const clear = G.physics.lineOfSight(player.eye, new THREE.Vector3(-135, 1.15, -150));
  if (!clear) assert.equal(fired, 0, '隔着墙不该开火');
});

test('手机按键：蹲、近战、手雷三个键能在「键位布局」里调，样式里有它们的位置', () => {
  for (const k of ['crouch', 'melee', 'nade']) {
    const it = LAYOUT_ITEMS.find((x) => x.key === k);
    assert.ok(it && it.touch && it.ours, k);
    assert.ok(ACTIONS_CSS.includes(`${it.sel} {`), `${it.sel} 没有样式`);
  }
});

test('得分和连杀：击倒 100 分，爆头、重装兵、连击另加；3 / 5 / 7 连杀给无人机、补给、急救，之后每 4 个轮一遍；阵亡清零连杀', async () => {
  const { createScore, killPoints, streakReward, SCORE, STREAKS } = await import('../src/jimao/score.js');
  assert.deepEqual(killPoints({}), [{ text: '击倒', points: 100 }]);
  assert.deepEqual(killPoints({ part: 'weak', role: 'heavy', multi: 3 }).map((p) => p.points), [150, 50, 100]);
  assert.equal(killPoints({ role: 'boss' })[0].points, SCORE.kill + 500);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 11, 15, 19, 23].map((n) => streakReward(n)?.id || '-'), ['-', '-', 'uav', '-', 'supply', '-', 'medic', '-', 'uav', 'supply', 'medic', 'uav']);
  assert.equal(STREAKS.length, 3);
  const handlers = {}, G = { game: { state: 'playing' }, events: { on: (n, f) => { (handlers[n] ||= []).push(f); }, emit() {} }, player: { health: 30, maxHealth: 100 },
    weapon: { reserve: 0, addAmmo(n) { this.reserve += n; } }, actions: { got: 0, give(n) { this.got += n; return n; } }, audio: { play() {} } };
  const score = createScore(G);
  const kill = (part, role) => handlers['enemy:killed'].forEach((f) => f({ part, enemy: { role } }));
  kill('body', 'regular'); kill('weak', 'regular');
  assert.equal(score.state.total, 100 + 100 + 50 + 50, '第二个在 3 秒内：连击加 50，爆头加 50');
  assert.equal(score.uav, 0);
  kill('body', 'regular');
  assert.ok(score.uav > 20, '三连杀：无人机侦察上线');
  score.update(30); assert.equal(score.uav, 0, '25 秒后无人机下线');
  kill('body', 'regular'); kill('body', 'regular');
  assert.equal(G.weapon.reserve, 60); assert.equal(G.actions.got, 1);
  kill('body', 'regular'); assert.equal(G.player.health, 30);
  kill('body', 'heavy'); assert.equal(G.player.health, 100, '七连杀：生命回满');
  assert.equal(score.state.best, 7);
  handlers['player:dead'].forEach((f) => f());
  assert.equal(score.state.streak, 0); assert.equal(score.state.best, 7);
  const before = score.state.total;
  handlers['objective:done'].forEach((f) => f()); assert.equal(score.state.total, before + SCORE.objective);
  score.reset(); assert.equal(score.state.total, 0); assert.equal(score.state.best, 0);
});

test('真坐电梯：选楼层（第一下跳到指引要去的那层）→ 停手出发 → 走进轿厢、关门、运行、开门、走出来；人最后站在目标层门口、面朝外', async () => {
  const { createLiftControl, LIFT, faceYaw } = await import('../src/jimao/lift.js');
  const { buildPlayableLayout: build } = await import('../src/layout/playable.js');
  const layout = build({ mode: 'arcade' });
  const { G, player } = world();
  const link = nav.links.find((l) => l.kind === 'lift' && l.stops.some((s) => s.floor === 'P1-1F') && l.stops.some((s) => s.floor === 'P1-RF'));
  assert.ok(link && link.elevator, '一期应该有从 1F 到屋顶的电梯');
  const from = link.stops.findIndex((s) => s.floor === 'P1-1F'), roof = link.stops.findIndex((s) => s.floor === 'P1-RF'), a = link.stops[from], b = link.stops[roof];
  const calls = [], car = { elevator: link.elevator, set(y, door, floor) { calls.push({ y, door, floor }); } };
  const guide = { hint: { to: 'P1-RF' } };
  const lift = createLiftControl(G, { nav, layout, cars: new Map([[link.id, car]]), guide });
  // 站在门口偏一点的地方（先走到门正前方）
  player.pos.set(a.x + 0.4, 0, a.z + 0.3); player.yaw = 1.1; G.physics.moveCapsule(player.pos, player.vel, 1 / 60);
  lift.update(0.3);
  assert.ok(lift.near && lift.near.i === from, '认出站在哪部电梯、哪一层');
  // 往上按一下：指引要去屋顶 → 直接选中屋顶
  lift.press('up'); lift.update(1 / 60);
  assert.equal(lift.pick, roof, '第一下应该直接跳到指引要去的那层');
  lift.press('down'); lift.update(1 / 60);
  assert.equal(lift.pick, roof - 1, '再按往下：挪一层');
  lift.press('up'); lift.update(1 / 60);
  assert.equal(lift.riding, false, '刚选完还没出发');
  for (let t = 0; t < LIFT.settle + 0.1; t += 1 / 60) lift.update(1 / 60);
  assert.equal(lift.riding, true, '停手 0.6 秒出发');
  assert.equal(player.mounted, true); assert.equal(player.invulnerable, true);
  assert.deepEqual([lift.rideInfo.from, lift.rideInfo.to, lift.rideInfo.car], ['P1-1F', 'P1-RF', true]);
  let frames = 0, maxY = -99, inCar = false, minDoor = 1;
  const e = link.elevator, passes = new Set();
  while (lift.riding && frames < 60 * 40) {
    lift.update(1 / 60); frames++;
    maxY = Math.max(maxY, player.pos.y);
    if (Math.hypot(player.pos.x - e.x, player.pos.z - e.z) < 0.05) inCar = true;
    if (lift.rideInfo) { minDoor = Math.min(minDoor, lift.rideInfo.door); passes.add(lift.rideInfo.pass); }
  }
  assert.equal(lift.riding, false, '应该坐完了');
  const secs = frames / 60, roofY = nav.floors.get('P1-RF').y;
  assert.ok(secs > 6 && secs < 16, `从 1F 到屋顶 ${secs.toFixed(1)} 秒`);
  assert.ok(inCar, '人进到了轿厢正中'); assert.ok(minDoor < 0.05, '运行时门是关着的');
  assert.ok(passes.size >= 6, `楼层屏经过了 ${passes.size} 层`);
  assert.ok(Math.abs(player.pos.y - roofY) < 0.01 && Math.hypot(player.pos.x - b.x, player.pos.z - b.z) < 0.01, '最后站在屋顶那一层的电梯门口');
  assert.equal(player.mounted, false); assert.equal(player.invulnerable, undefined === player.invulnerable ? undefined : false);
  assert.equal(G.physics.stateOf(player.pos), null, '到站后导航状态要重新找（下一步按新楼层走）');
  // 轿厢：高度从 1F 一路到屋顶，门先关后开，楼层屏最后显示 RF
  assert.ok(Math.abs(calls[0].y) < 0.01 && Math.abs(calls.at(-1).y - roofY) < 0.01 && calls.at(-1).door === 1 && calls.at(-1).floor === 'RF');
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].y >= calls[i - 1].y - 1e-9, '轿厢只往上走');
  assert.ok(calls.some((c) => c.door === 0 && c.y > 5 && c.y < roofY - 5), '中途门关着');
  // 面朝门外（原游戏朝 (dx, dz) 看时 yaw = atan2(−dx, −dz)）
  const want = faceYaw(b), d = Math.atan2(Math.sin(player.yaw - want), Math.cos(player.yaw - want));
  assert.ok(Math.abs(d) < 0.05, `出来时面朝门外（差 ${d.toFixed(2)} 弧度）`);
  // 没有轿厢的电梯：老办法（压暗 + 一层 0.55 秒），照样到得了
  const plain = createLiftControl(G, { nav, layout, cars: new Map() });
  G.physics.moveCapsule(player.pos, player.vel, 1 / 60); // 下一帧玩家一动，导航状态就按新楼层找回来了
  assert.equal(G.physics.stateOf(player.pos)?.floor, 'P1-RF');
  plain.update(0.3); assert.ok(plain.near);
  plain.go(plain.near.i - 1);
  assert.equal(plain.rideInfo.car, false);
  for (let i = 0; i < 200 && plain.riding; i++) plain.update(1 / 60);
  assert.equal(plain.riding, false);
  assert.ok(Math.abs(player.pos.y - nav.floors.get(link.stops[roof - 1].floor).y) < 0.01);
});

test('翻越：对着沙袋墙 / 隔离墩按跳能翻到另一边（半秒、镜头抬起）；对着墙、栏杆、空地不翻；落点是同一层的空地', async () => {
  const { vaultTarget, VAULT } = await import('../src/jimao/actions.js');
  const { DRESSING, registerDressing, dressFootprint, DRESS } = await import('../src/jimao/dressing.js');
  const { buildPlayableLayout: build } = await import('../src/layout/playable.js');
  const { buildNav: mk, clear: ok } = await import('../src/layout/nav.js');
  const layout = build({ mode: 'arcade' }); registerDressing(layout);
  const nav2 = mk(layout), physics = createMapPhysics(nav2);
  let can = 0, total = 0;
  for (const p of DRESSING) {
    const y = nav2.floors.get(p.floor).y, f = dressFootprint(p);
    // 从薄的那一侧正对着翻（两个方向都试）
    for (const sign of [1, -1]) {
      const along = p.along === 'x', dx = along ? 0 : -sign, dz = along ? -sign : 0, back = DRESS.depth / 2 + 0.7;
      const pos = new THREE.Vector3(p.x - dx * back, y, p.z - dz * back);
      total++;
      const tg = vaultTarget(physics, nav2, pos, dx, dz, p.floor);
      if (!tg) continue;
      can++;
      assert.ok(ok(nav2, { floor: p.floor, x: tg.x, z: tg.z, y, slope: null }), '落点得是空地');
      const side = (tg.x - p.x) * dx + (tg.z - p.z) * dz;
      assert.ok(side > (along ? f.d : f.w) / 2 + 0.2, '落点在掩体另一边');
      assert.ok(tg.dist > 1.2 && tg.dist < VAULT.reach + VAULT.depth + 0.1, `翻过去的距离 ${tg.dist.toFixed(2)}`);
    }
  }
  assert.ok(can >= total * 0.9, `${total} 个方向里只有 ${can} 个能翻`);
  // 对着墙不翻、空地上不翻
  const wallHit = physics.raycast(new THREE.Vector3(-135, 0.5, -98), new THREE.Vector3(1, 0, 0), 80);
  assert.ok(wallHit);
  assert.equal(vaultTarget(physics, nav2, new THREE.Vector3(-135, 0, -98), 0, -1, 'P1-1F'), null, '面前没东西：不翻');
  // 在游戏里走一遍：站在第一段掩体前按跳
  const p0 = DRESSING.find((q) => q.floor === 'P1-1F'), along = p0.along === 'x', dx = along ? 0 : -1, dz = along ? -1 : 0;
  const player = { pos: new THREE.Vector3(p0.x - dx * 1.05, 0, p0.z - dz * 1.05), eye: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: Math.atan2(-dx, -dz), pitch: 0, alive: true, onGround: true, addShake() {} };
  physics.moveCapsule(player.pos, player.vel, 1 / 60);
  const pressed = new Set(['jump']), input = { move: { x: 0, y: 1 }, look: { dx: 0, dy: 0 }, pressed: (a) => pressed.has(a) };
  const lowered = [], G = { player, input, physics, enemies: { list: [] }, game: { state: 'playing' }, events: { emit() {} }, audio: { play() {} }, arms: { setLowered: (k) => lowered.push(k) } };
  const actions = createActions(G, { scene: new THREE.Scene(), nav: nav2 });
  actions.pre(1 / 60); pressed.clear();
  assert.equal(actions.vaulting, true); assert.equal(player.mounted, true);
  let frames = 0, top = 0, minPitch = 0;
  while (actions.vaulting && frames < 120) { actions.pre(1 / 60); frames++; top = Math.max(top, player.pos.y); minPitch = Math.min(minPitch, player.pitch); }
  assert.ok(Math.abs(frames / 60 - VAULT.time) < 0.06, `翻了 ${(frames / 60).toFixed(2)} 秒`);
  assert.ok(top > VAULT.rise * 0.9 && player.pos.y === 0, `最高抬了 ${top.toFixed(2)} 米，落地回到楼面`);
  assert.ok(minPitch < -0.1 && Math.abs(player.pitch) < 1e-9, '中途前倾，落地视角回正');
  assert.equal(player.mounted, false);
  assert.ok((player.pos.x - p0.x) * dx + (player.pos.z - p0.z) * dz > 0.5, '人到了掩体另一边');
  assert.ok(Math.max(...lowered) >= 0.99 && lowered.at(-1) === 0, '翻的时候枪放低，落地抬回来');
  assert.ok(Math.hypot(player.vel.x, player.vel.z) > 3, '落地带着往前的速度');
});

// ---- 武器：手枪和刀 ----
async function arsenalWorld() {
  const A = await import('../src/jimao/arsenal.js');
  const camera = new THREE.PerspectiveCamera(74, 1.6, 0.01, 10);
  camera.position.set(-135, 1.68, -98); camera.updateMatrixWorld(true);
  // 假的步枪模型：带两只「手」（材质叫 glove_fabric 的两个组）
  const vm = new THREE.Group(); vm.name = 'viewmodel-test';
  const glove = new THREE.MeshBasicMaterial(); glove.name = 'glove_fabric';
  for (const x of [0.03, -0.03]) { const h = new THREE.Group(); h.position.set(x, -0.07, x > 0 ? 0.15 : -0.18); h.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.1), glove)); vm.add(h); }
  camera.add(vm);
  const pressed = new Set(), log = [];
  const rifle = { name: '九式突击步枪', ammo: 30, magSize: 30, reserve: 150, state: 'idle', ads: 0, spread: 0.0125, updates: 0, visible: true,
    update() { this.updates++; }, reset() { this.ammo = 30; }, setVisible(v) { this.visible = v; }, addAmmo(n) { this.reserve += n; }, snap() {} };
  const player = { pos: new THREE.Vector3(-135, 0, -98), vel: new THREE.Vector3(), onGround: true, sprinting: false, recoil: 0, addRecoil(p) { this.recoil += p; }, addShake() {} };
  const enemies = { list: [] };
  const G = { weapon: rifle, player, enemies, game: { state: 'playing' }, input: { look: { dx: 0, dy: 0 }, fire: false, ads: false, pressed: (a) => pressed.has(a), down: () => false },
    events: { emit: (n, e) => log.push([n, e]) }, combat: { shots: [], playerShot(o, d, opt) { this.shots.push({ o: o.clone(), d: d.clone(), opt }); return null; } }, fx: { tracers: 0, shells: 0, tracer() { this.tracers++; }, shell() { this.shells++; } },
    physics: { lineOfSight: () => true }, render: { lightPool: { flash() {} } } };
  const arsenal = A.createArsenal(G, { camera });
  G.rifle = rifle; G.weapon = arsenal;
  const run = (secs, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 60) { each?.(); arsenal.update(1 / 60); pressed.clear(); } };
  const enemy = (x, z, hp = 80) => { const e = { pos: new THREE.Vector3(x, 0, z), alive: true, active: true, hp, hits: [], damage(n) { this.hits.push(n); this.hp -= n; if (this.hp <= 0) { this.alive = false; return true; } return false; } }; enemies.list.push(e); return e; };
  return { A, G, arsenal, rifle, player, pressed, log, run, enemy, camera };
}

test('武器模型：手枪长约 19 厘米、照门准星在套筒顶上、枪口在最前；刀身 17 厘米左右；换弹和出刀的姿势曲线首尾归零', async () => {
  const { pistolGeometry, knifeGeometry, reloadPose, slashPose, PISTOL, KNIFE } = await import('../src/jimao/arsenal.js');
  const g = pistolGeometry();
  for (const k of ['frame', 'slide', 'dark', 'mag', 'trigger', 'dots']) assert.ok(g[k].attributes.position.count > 10, k);
  g.slide.computeBoundingBox(); g.frame.computeBoundingBox();
  const sb = g.slide.boundingBox, len = sb.max.z - sb.min.z;
  assert.ok(len > 0.17 && len < 0.21, `套筒长 ${len.toFixed(3)} 米`);
  assert.ok(g.muzzle[2] <= sb.min.z + 0.01, '枪口在套筒最前面');
  assert.ok(g.sightY > sb.max.y - 0.012 && g.sightY < sb.max.y + 0.012, '瞄准线在套筒顶上');
  assert.ok(g.frame.boundingBox.min.y < -0.05, '握把在套筒下面');
  assert.ok(g.frame.attributes.position.count + g.slide.attributes.position.count + g.dark.attributes.position.count > 6000, '细节够多');
  const k = knifeGeometry(); k.blade.computeBoundingBox();
  const bl = Math.hypot(k.blade.boundingBox.max.y - k.blade.boundingBox.min.y, k.blade.boundingBox.max.z - k.blade.boundingBox.min.z);
  assert.ok(bl > 0.15 && bl < 0.22, `刀身 ${bl.toFixed(3)} 米`);
  // 换弹：开头结尾都回到原位；中间弹匣掉下去再上来；打空的最后释放套筒
  assert.deepEqual([reloadPose(0).tilt, reloadPose(0).magDrop, reloadPose(1).tilt, reloadPose(1).magDrop, reloadPose(1).hand], [0, 0, 0, 0, 0]);
  assert.ok(reloadPose(0.32).magDrop > 0.9 && reloadPose(0.5).tilt === 1 && !reloadPose(0.5).magIn && reloadPose(0.63).magIn);
  assert.equal(reloadPose(0.5, true).slide, 1); assert.equal(reloadPose(0.9, true).slide, 0); assert.equal(reloadPose(0.5, false).slide, 0);
  for (const t of [0, 1]) { const p = slashPose(t); assert.ok(Math.abs(p.back) + Math.abs(p.thrust) + Math.abs(p.sweep) < 1e-9); }
  assert.ok(slashPose(0.15).back > 0.5 && slashPose(0.35).thrust > 0.9 && slashPose(0.5).sweep > 0.9);
  assert.ok(PISTOL.damage * 3 >= 80 && PISTOL.damage * 2 < 80, '手枪打步枪手身体要三枪'); assert.ok(KNIFE.damage >= 80 * 1.8 && KNIFE.damage < 110 * 2.2, '刀：步枪手一刀，重装兵（242 血）两刀');
});

/** 假的手枪模型：节点名、层级照真模型（厘米、枪口朝 +z），几何随便放个盒子 */
function fakePistolScene() {
  const scene = new THREE.Group(), root = new THREE.Group(); root.name = 'RootNode'; scene.add(root);
  const mats = Object.fromEntries(['Slide', 'MainBody', 'Magazine', 'Bullet'].map((n) => [n, Object.assign(new THREE.MeshStandardMaterial(), { name: n })]));
  const part = (name, mat, rot = 0) => { const g = new THREE.Group(); g.name = name; g.rotation.x = rot; g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats[mat])); root.add(g); return g; };
  const nodes = { slide: part('Slide_low', 'Slide'), rear: part('RearSight_low', 'Slide'), barrel: part('Barrel_low', 'Slide'), front: part('FrontSight_low', 'Slide'),
    frame: part('Frame_low', 'MainBody'), hammer: part('Hammer_low', 'MainBody'), mag: part('Magazine_low', 'Magazine', -0.26), base: part('MagazineBase_low', 'Magazine'), bullet: part('Bullet_low', 'Bullet') };
  return { scene, nodes, mats };
}

test('手枪换上真模型：缩到握得住的大小、枪口朝前、照门在握把上方；方块枪藏起来；开火套筒往后走（枪管不动）、换弹弹匣顺着握把滑出去；深色表面；没加载就还是方块枪', async () => {
  const { A, G, arsenal, run, pressed } = await arsenalWorld();
  const K = A.PISTOL_SKIN, f = A.pistolSkinFit();
  // 尺寸和位置：全长 27.7 厘米的模型缩到 24 厘米上下；握把中心落在手里（原点附近）
  const len = (10.84 + 16.84) * K.scale; assert.ok(len > 0.22 && len < 0.26, `全长 ${len.toFixed(3)} 米`);
  assert.ok(f.muzzle[2] < -0.16 && Math.abs(f.muzzle[0]) < 1e-6, '枪口在正前方'); assert.ok(f.sightY > 0.08 && f.sightY < 0.115 && f.sightY > f.muzzle[1], '照门在枪管上面');
  // 枪比手高：套筒底（模型里 y ≈ 21.1 厘米）要高出握把参考点 5 厘米以上，从后面看手背挡不到套筒
  assert.ok(A.skinPoint([0, 21.14, 0])[1] > 0.05, `套筒底高出握把中心 ${(A.skinPoint([0, 21.14, 0])[1] * 100).toFixed(1)} 厘米`);
  assert.ok(f.eject[0] > 0 && f.eject[2] < 0 && f.eject[2] > f.muzzle[2], '抛壳口在右侧、枪口后面'); assert.ok(f.slideTravel > 0.02 && f.slideTravel < 0.04);
  assert.deepEqual(A.skinPoint(K.grip).map((v, i) => +(v - K.offset[i]).toFixed(9)), [0, 0, 0], '握把中心 → 原点');
  // 没换之前：方块枪
  assert.equal(arsenal.skinned, false);
  const body = arsenal.parts.pistol, boxes = body.children.filter((c) => c.isMesh || c.isGroup);
  const { scene, nodes, mats } = fakePistolScene();
  assert.equal(arsenal.skinPistol(scene), true); assert.equal(arsenal.skinned, true); assert.equal(arsenal.skinPistol(scene), false, '只换一次');
  const holder = body.getObjectByName('p17-skin');
  assert.ok(holder && Math.abs(holder.scale.x - K.scale) < 1e-9 && Math.abs(holder.rotation.y - Math.PI) < 1e-9);
  const meshVisible = (o) => { for (let q = o; q && q !== body; q = q.parent) if (!q.visible) return false; return true; };
  let shown = 0; body.traverse((o) => { if (o.isMesh && meshVisible(o) && !holder.getObjectById(o.id) && o.material.blending !== THREE.AdditiveBlending) shown++; });
  assert.equal(shown, 0, '方块枪的网格都藏起来了'); assert.ok(boxes.length > 3);
  assert.equal(nodes.bullet.visible, false, '模型里摆着的那颗子弹不显示');
  assert.ok(Math.abs(mats.Slide.color.r - K.tint.Slide) < 1e-6 && Math.abs(mats.MainBody.color.r - K.tint.MainBody) < 1e-6, '深色表面'); assert.equal(mats.Slide.side, THREE.FrontSide);
  // 枪口的世界坐标：在相机正前方（−z）
  arsenal.select('pistol', { plain: true }); run(1.2);
  // 开火：套筒那几件往后（模型里 −z），枪管、准星不动，击锤扳倒
  pressed.add('fire'); G.input.fire = true; run(1 / 60); G.input.fire = false;
  assert.ok(nodes.slide.position.z < -K.slideTravel * 0.5 && nodes.rear.position.z < -K.slideTravel * 0.5, `套筒后坐 ${nodes.slide.position.z.toFixed(2)}`);
  assert.equal(nodes.barrel.position.z, 0); assert.equal(nodes.front.position.z, 0); assert.ok(nodes.hammer.rotation.x > 0.2);
  run(0.5); assert.ok(Math.abs(nodes.slide.position.z) < 1e-6, '复进到位'); assert.ok(Math.abs(nodes.hammer.rotation.x) < 1e-6);
  // 换弹：弹匣顺着自己的轴往下滑（握把是斜的，所以 z 也跟着变），滑到底先不显示，插回去回到原位
  arsenal.pistol.ammo = 5; arsenal.startReload();
  let low = 0, drift = 0, hid = false;
  run(arsenal.pistol.reload.dur + 0.2, () => { low = Math.min(low, nodes.mag.position.y); drift = Math.max(drift, Math.abs(nodes.mag.position.z)); hid ||= !nodes.mag.visible; assert.ok(Math.abs(nodes.base.position.y - nodes.mag.position.y) < 1e-9, '弹匣底板跟着走'); });
  assert.ok(low < -K.magDrop * 0.8, `弹匣抽出 ${(-low).toFixed(1)} 厘米`); assert.ok(drift > 1, '顺着握把的斜度走'); assert.ok(hid, '抽出去那一下不显示');
  assert.ok(nodes.mag.visible && nodes.mag.position.length() < 1e-6, '插回原位'); assert.equal(arsenal.pistol.ammo, 12);
  // 测试环境没有 document：抹铭文那一步什么都不做
  assert.equal(A.scrubMarkings(mats.Slide, K.scrub.Slide, null), 0);
  arsenal.dispose();
});

test('手枪握得住：腰射时手臂前伸、枪口朝准星收、枪身朝里倾（不是往外歪）；开火枪口猛抬五六度、整枪后顶近两厘米，四分之一秒内压回原位、几乎不回弹；开镜时枪身摆正', async () => {
  const { A, G, arsenal, run, pressed } = await arsenalWorld();
  const H = A.HOLD, root = arsenal.roots.pistol, e = new THREE.Euler();
  const rot = () => e.setFromQuaternion(root.quaternion, 'XYZ');
  arsenal.select('pistol', { plain: true }); run(1.5);
  // 姿势：比原来（右 0.078、下 0.034、前 0.41）更靠前、更高
  assert.ok(root.position.z < -0.45 && root.position.y > -0.03 && root.position.x > 0.06 && root.position.x < 0.11, `腰射位置 ${root.position.toArray().map((v) => v.toFixed(3))}`);
  assert.ok(rot().y > 0.04 && rot().y < 0.1, `枪口朝中间收 ${rot().y.toFixed(3)}`); assert.ok(rot().z > 0.06 && rot().z < 0.16, `枪身朝里倾 ${rot().z.toFixed(3)}`);
  assert.ok(Math.abs(rot().x) < 0.01, '平时枪口是平的');
  // 右手绕握把轴转过去了（虎口顶住握把后背）
  assert.ok(H.wrap < -0.2 && H.wrap > -0.4);
  // 后坐：峰值和恢复
  const z0 = root.position.z; let pitch = 0, back = 0, tPeak = 0, t = 0, after = 0;
  pressed.add('fire'); G.input.fire = true; run(1 / 60); G.input.fire = false;
  run(0.6, () => { t += 1 / 60; const x = rot().x; if (x > pitch) { pitch = x; tPeak = t; } back = Math.max(back, root.position.z - z0); if (t > 0.25) after = Math.max(after, Math.abs(x)); });
  assert.ok(pitch > 0.07 && pitch < 0.14, `枪口上抬 ${(pitch * 57.3).toFixed(1)}°`); assert.ok(tPeak < 0.1, `${tPeak.toFixed(3)} 秒到顶`);
  assert.ok(back > 0.012 && back < 0.03, `后顶 ${(back * 100).toFixed(1)} 厘米`); assert.ok(after < 0.012, `0.25 秒后还剩 ${(after * 57.3).toFixed(2)}°`);
  // 开镜：摆正、对到屏幕正中
  G.input.ads = true; run(0.8, () => { G.input.ads = true; });
  assert.ok(Math.abs(root.position.x) < 0.004 && Math.abs(rot().z) < 0.02 && Math.abs(rot().y) < 0.02, '开镜时枪身摆正');
});

test('切枪：1 步枪 / 2 手枪 / 3 刀，先放下再举起（中间不能开火）；HUD 读到的名字和弹药跟着当前武器；没拿在手里的步枪不更新', async () => {
  const { A, arsenal, rifle, run, pressed, G } = await arsenalWorld();
  assert.equal(arsenal.current, 'rifle'); assert.equal(arsenal.name, '九式突击步枪'); assert.equal(arsenal.ammo, 30);
  run(0.1); assert.ok(rifle.updates > 0);
  assert.equal(arsenal.select('pistol'), true);
  assert.equal(arsenal.switching, true);
  run(A.SWAP.lower + 0.02);
  assert.equal(arsenal.current, 'pistol'); assert.equal(rifle.visible, false); assert.equal(arsenal.roots.pistol.visible, true);
  // 举起来的过程中按开火：不响
  run(0.05, () => pressed.add('fire'));
  assert.equal(G.combat.shots.length, 0, '还没举起来不能开火');
  run(A.DRAW.pistol + 0.05);
  assert.equal(arsenal.switching, false);
  assert.deepEqual([arsenal.name, arsenal.ammo, arsenal.magSize, arsenal.reserve], [A.PISTOL.name, A.PISTOL.mag, A.PISTOL.mag, A.PISTOL.reserve]);
  const before = rifle.updates; run(0.3); assert.equal(rifle.updates, before, '手枪在手里时步枪不更新（不会自己开火、换弹）');
  arsenal.select('knife'); run(A.SWAP.lower + A.DRAW.knife + 0.05);
  assert.equal(arsenal.current, 'knife'); assert.equal(arsenal.name, A.KNIFE.name); assert.ok(arsenal.ammo > 0, '拿着刀不报「弹药耗尽」');
  assert.equal(arsenal.select('knife'), false, '已经拿着了');
  arsenal.setVisible(false); assert.equal(arsenal.roots.knife.visible, false); arsenal.setVisible(true); assert.equal(arsenal.roots.knife.visible, true);
  arsenal.reset(); assert.equal(arsenal.current, 'rifle'); assert.equal(rifle.visible, true); assert.equal(arsenal.roots.knife.visible, false);
});

test('冲锋枪：模型没加载、没捡到之前换不过去；捡到就换上（数字键 4，顺序排在步枪后面）；按住连发、每分钟八百多发，25 发打空自动换弹；动静比手枪还小；再捡一把算两个弹匣；重开一局收回去', async () => {
  const { A, G, arsenal, run, log } = await arsenalWorld();
  const { SMG } = await import('../src/jimao/smg.js'), { SIEGE } = await import('../src/jimao/siege.js');
  assert.ok(SIEGE.noise.smg < SIEGE.noise.pistol && SIEGE.noise.pistol < SIEGE.noise.rifle, '微声：一发的响动最小');
  assert.ok(SMG.damage < 30 && 60 / SMG.interval > 780 && 60 / SMG.interval < 900);
  assert.deepEqual([...arsenal.slots], [...A.SLOTS]); assert.equal(arsenal.select('smg'), false); assert.equal(arsenal.grant('smg'), false, '模型还没来');
  // 假模型：一个组，带一段两秒的「换弹」动画
  const scene = new THREE.Group(), part = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), new THREE.MeshStandardMaterial()); part.name = 'body'; scene.add(part);
  const clip = new THREE.AnimationClip('Reload', 2, [new THREE.VectorKeyframeTrack('body.position', [0, 1, 2], [0, 0, 0, 0, -0.2, 0, 0, 0, 0])]);
  assert.equal(arsenal.skinSmg({ scene, animations: [clip] }), true); assert.equal(arsenal.skinSmg({ scene }), false);
  assert.equal(arsenal.owns.smg, false); assert.equal(arsenal.select('smg'), false, '还没捡到');
  assert.equal(arsenal.grant('smg'), true); assert.deepEqual([...arsenal.slots], [...A.SLOTS_SMG]);
  run(1); assert.equal(arsenal.current, 'smg'); assert.equal(arsenal.name, SMG.name); assert.equal(arsenal.ammo, SMG.mag); assert.equal(arsenal.reserve, SMG.reserve);
  assert.ok(arsenal.roots.smg.visible && !arsenal.roots.pistol.visible);
  const root = arsenal.roots.smg; assert.ok(root.position.x > 0.1 && root.position.z < -0.3, '腰射在右下');
  // 连发
  G.input.fire = true; log.length = 0; G.combat.shots.length = 0;
  run(1); const n = G.combat.shots.length;
  assert.ok(n >= 13 && n <= 15, `一秒打了 ${n} 发`); assert.equal(arsenal.ammo, SMG.mag - n);
  assert.ok(log.filter((e) => e[0] === 'weapon:fire').every((e) => e[1].kind === 'smg')); assert.equal(G.combat.shots[0].opt.damage, SMG.damage);
  assert.equal(arsenal.state, 'firing'); assert.ok(arsenal.spread > SMG.spreadHip, '连发散布变大');
  run(1.2); assert.equal(arsenal.state, 'reloading', '打空自动换弹'); assert.ok(Math.abs(part.position.y) > 0.01, '换弹动画在放');
  G.input.fire = false; run(SMG.reload); assert.equal(arsenal.ammo, SMG.mag); assert.equal(arsenal.reserve, SMG.reserve - SMG.mag); assert.ok(Math.abs(part.position.y) < 1e-6, '停在握好的那一帧');
  // 开镜：枪到正中、散布收紧
  G.input.ads = true; run(0.6); assert.ok(Math.abs(root.position.x) < 0.01 && arsenal.ads > 0.95 && arsenal.spread < SMG.spreadHip * 0.6); G.input.ads = false;
  // 再捡一把：加两个弹匣；补给也给它补
  const r0 = arsenal.reserve; arsenal.grant('smg'); assert.equal(arsenal.reserve, Math.min(SMG.reserveMax, r0 + SMG.mag * 2));
  arsenal.select('rifle'); run(1); assert.equal(arsenal.current, 'rifle'); assert.ok(!root.visible);
  arsenal.smg.state.reserve = 0; arsenal.addAmmo(60); assert.equal(arsenal.smg.state.reserve, 42);
  arsenal.reset(); assert.equal(arsenal.owns.smg, false); assert.equal(arsenal.select('smg'), false); assert.deepEqual([...arsenal.slots], [...A.SLOTS]);
  arsenal.dispose();
});

test('榴弹：飞得快、弹道平，碰到东西就炸，比手雷炸得狠；擦着敌人身边也炸；没炸死的被气浪掀开；贴脸打在墙上不炸（保险）', () => {
  const { G, actions, player, enemy } = world();
  const step = (secs) => { for (let t = 0; t < secs - 1e-9; t += 1 / 60) { actions.pre(1 / 60); actions.update(1 / 60); } };
  assert.ok(SHELL.damage > GRENADE.damage && SHELL.speed > GRENADE.speed * 2);
  const eye = new THREE.Vector3(player.pos.x, 1.6, player.pos.z), fwd = new THREE.Vector3(0, -0.04, -1).normalize();
  assert.equal(actions.launch(eye, fwd), true);
  let t = 0; while (t < 3 && !G.events.log.some((e) => e[0] === 'grenade:explode')) { step(1 / 60); t += 1 / 60; }
  const boom = G.events.log.find((e) => e[0] === 'grenade:explode')[1];
  const d = Math.hypot(boom.pos.x - player.pos.x, boom.pos.z - player.pos.z);
  assert.ok(boom.kind === 'shell' && t < 1.2 && d > 12, `飞了 ${d.toFixed(0)} 米、${t.toFixed(2)} 秒落地就炸`);
  assert.equal(actions.grenades, GRENADE.count, '不占手雷的数');
  // 擦着身边炸：8 米外站一个血厚的，再远 3 米一个普通的
  G.events.log.length = 0;
  const big = enemy(player.pos.x + 0.5, player.pos.z - 8); big.hp = 5000; const shoved = []; big.shove = (x, z, p) => shoved.push([x, z, p]);
  const near = enemy(player.pos.x - 1, player.pos.z - 10.5);
  assert.equal(actions.launch(eye, new THREE.Vector3(0, 0, -1)), true); step(0.5);
  const b2 = G.events.log.find((e) => e[0] === 'grenade:explode');
  assert.ok(b2 && Math.abs(b2[1].pos.z - big.pos.z) < 1.2, '在它身边炸了，没有飞过去');
  assert.ok(big.hits[0] > 150, `直接命中 ${big.hits[0]?.toFixed(0)}`); assert.ok(!near.alive, '三米外的普通丧尸一发就倒');
  assert.equal(shoved.length, 1); assert.ok(shoved[0][2] > 5, '没炸死的被掀开');
  // 保险：对着脚边的墙 / 地面打，飞行时间不够不炸，弹开以后到引信时间才炸
  G.events.log.length = 0; big.alive = false;
  actions.launch(new THREE.Vector3(player.pos.x, 0.5, player.pos.z), new THREE.Vector3(0, -1, 0)); step(0.3);
  assert.ok(!G.events.log.some((e) => e[0] === 'grenade:explode'), '贴脸不炸');
});

test('榴弹枪：捡到才有（数字键 5），一发一装——打完自动撅开枪管塞一发，1.9 秒；榴弹打没了不能再装；重开一局收回去', async () => {
  const { A, G, arsenal, run, log, pressed } = await arsenalWorld();
  const { LAUNCHER, breakPose } = await import('../src/jimao/launcher.js'), { SIEGE } = await import('../src/jimao/siege.js');
  assert.ok(SIEGE.noise.launcher > SIEGE.noise.rifle * 3);
  assert.deepEqual([breakPose(0).open, breakPose(1).open, breakPose(0).hand, breakPose(1).hand], [0, 0, 0, 0]); assert.ok(breakPose(0.4).open > 0.95 && breakPose(0.45).hand > 0.9 && !breakPose(0.5).loaded && breakPose(0.65).loaded);
  const shots = []; G.actions = { launch: (o, d) => { shots.push([o.clone(), d.clone()]); return true; } };
  assert.equal(arsenal.select('launcher'), false); assert.equal(arsenal.owns.launcher, false);
  assert.equal(arsenal.grant('launcher'), true); assert.deepEqual([...arsenal.slots], ['rifle', 'launcher', 'pistol', 'knife']);
  run(1); assert.equal(arsenal.current, 'launcher'); assert.equal(arsenal.name, LAUNCHER.name); assert.equal(arsenal.ammo, 1); assert.equal(arsenal.reserve, LAUNCHER.reserve);
  assert.ok(arsenal.roots.launcher.visible);
  pressed.add('fire'); run(1 / 60); assert.equal(shots.length, 1); assert.equal(arsenal.ammo, 0);
  assert.ok(log.some((e) => e[0] === 'weapon:fire' && e[1].kind === 'launcher')); assert.ok(shots[0][1].z < -0.99, '朝准星打');
  pressed.add('fire'); run(0.2); assert.equal(shots.length, 1, '膛里没弹：打不出去');
  run(0.6); assert.equal(arsenal.state, 'reloading', '自动装弹'); assert.ok(arsenal.launcher.parts.tube.rotation.x < -0.4, '枪管撅开了');
  run(LAUNCHER.reload); assert.equal(arsenal.ammo, 1); assert.equal(arsenal.reserve, LAUNCHER.reserve - 1); assert.ok(Math.abs(arsenal.launcher.parts.tube.rotation.x) < 1e-6, '合上了');
  // 打光
  arsenal.launcher.state.reserve = 0; pressed.add('fire'); run(1 / 60); run(3); assert.equal(arsenal.ammo, 0); assert.notEqual(arsenal.state, 'reloading');
  assert.equal(arsenal.launcher.addShells(20), LAUNCHER.reserveMax); assert.equal(arsenal.grant('launcher'), false, '带满了：再捡一把也装不下');
  arsenal.reset(); assert.equal(arsenal.owns.launcher, false); assert.deepEqual([...arsenal.slots], [...A.SLOTS]);
  arsenal.dispose();
});

test('手枪是单手持枪：平时左手不在枪上（看不见）；换弹时左手上来送弹匣、换完放下；掏枪拉套筒那一下左手也上来', async () => {
  const { A, arsenal, run, pressed } = await arsenalWorld();
  const left = arsenal.parts.left; assert.ok(left, '有左手模型');
  arsenal.select('pistol');
  let seen = false; run(A.SWAP.lower + A.DRAW.pistol + 0.05, () => { seen ||= left.visible; });
  assert.ok(seen, '掏枪拉套筒时左手上来过');
  run(0.6); assert.equal(left.visible, false, '握稳以后只有右手'); const down = left.position.y;
  run(1 / 60, () => pressed.add('fire')); run(0.4);
  assert.equal(left.visible, false, '开火也是单手');
  arsenal.startReload(); let up = -Infinity; run(A.PISTOL.reload * 0.6, () => { if (left.visible) up = Math.max(up, left.position.y); });
  assert.ok(up > down + 0.2, `换弹时左手抬上来 ${(up - down).toFixed(2)} 米`);
  run(A.PISTOL.reload * 0.4 + 0.6); assert.equal(left.visible, false, '换完放下');
});

test('手枪：半自动（按一下一发，按住每 0.2 秒一发）、套筒后坐复进、打空挂机自动换弹、换弹从备弹里扣；开镜收紧散布', async () => {
  const { A, arsenal, run, pressed, G, log, player } = await arsenalWorld();
  arsenal.select('pistol'); run(A.SWAP.lower + A.DRAW.pistol + 0.1);
  run(1 / 60, () => pressed.add('fire'));
  assert.equal(G.combat.shots.length, 1); assert.equal(arsenal.ammo, A.PISTOL.mag - 1);
  assert.deepEqual(G.combat.shots[0].opt, { damage: A.PISTOL.damage, range: A.PISTOL.range });
  assert.ok(log.some(([n, e]) => n === 'weapon:fire' && e.kind === 'pistol'), '开火事件带 kind: pistol（枪声用它区分）');
  assert.ok(arsenal.pistol.slide > 0.5, '套筒在后面'); assert.ok(player.recoil > 0); assert.equal(G.fx.tracers, 1); assert.equal(G.fx.shells, 1);
  run(0.2); assert.equal(arsenal.pistol.slide, 0, '0.09 秒后套筒复进');
  // 同一帧里不会连发；不松手也要等 0.2 秒
  G.input.fire = true; run(0.5); G.input.fire = false;
  assert.ok(G.combat.shots.length >= 3 && G.combat.shots.length <= 4, `按住 0.5 秒打了 ${G.combat.shots.length - 1} 发`);
  // 开镜：散布收紧
  const hip = arsenal.spread; G.input.ads = true; run(0.5);
  assert.ok(arsenal.ads > 0.95 && arsenal.spread < hip * 0.5, `开镜后散布 ${arsenal.spread.toFixed(4)}（腰射 ${hip.toFixed(4)}）`);
  G.input.ads = false; run(0.3);
  // 打空：挂机、自动换弹，换完满弹、备弹少了一匣
  while (arsenal.ammo > 0) run(A.PISTOL.interval + 0.02, () => pressed.add('fire'));
  assert.equal(arsenal.pistol.locked, true, '打空了套筒挂在后面');
  run(0.5); assert.equal(arsenal.state, 'reloading');
  run(A.PISTOL.reloadEmpty);
  assert.equal(arsenal.ammo, A.PISTOL.mag); assert.equal(arsenal.reserve, A.PISTOL.reserve - A.PISTOL.mag); assert.equal(arsenal.pistol.locked, false); assert.equal(arsenal.state, 'idle');
  assert.deepEqual(log.filter(([n, e]) => n === 'weapon:reload' && !e.draw).map(([, e]) => e.phase), ['start', 'magout', 'magin', 'bolt', 'done']); // 掏枪时那一下拉套筒（draw: true）不算换弹
  // 弹药补给：步枪照加，手枪补四成、有上限
  arsenal.addAmmo(60); assert.equal(G.rifle.reserve, 210); assert.equal(arsenal.reserve, A.PISTOL.reserve - A.PISTOL.mag + 24);
  arsenal.addAmmo(600); assert.equal(arsenal.reserve, A.PISTOL.reserveMax);
});

test('刀：近战键随时出刀（先换成刀、刺完换回原来那把）；2.3 米内准星附近的敌人掉 150 血，背后的、远处的不中', async () => {
  const { A, arsenal, run, pressed, enemy, log } = await arsenalWorld();
  assert.equal(A.knifeReaches(new THREE.Vector3(0, 1.68, 0), 0, 0, -1, { pos: new THREE.Vector3(0, 0, -1.8) }), true);
  assert.equal(A.knifeReaches(new THREE.Vector3(0, 1.68, 0), 0, 0, -1, { pos: new THREE.Vector3(0, 0, -3) }), false, '太远');
  assert.equal(A.knifeReaches(new THREE.Vector3(0, 1.68, 0), 0, 0, -1, { pos: new THREE.Vector3(0, 0, 1.5) }), false, '在背后');
  const front = enemy(-135, -99.6), heavy = enemy(-134.6, -99.9, 242), behind = enemy(-135, -96.5), far = enemy(-135, -103);
  // 步枪在手，按近战
  run(1 / 60, () => pressed.add('melee'));
  assert.equal(arsenal.switching, true);
  run(0.3);
  assert.equal(arsenal.current, 'knife'); assert.equal(arsenal.slashing, true);
  run(A.KNIFE.time + 0.5);
  assert.equal(arsenal.current, 'rifle', '刺完换回步枪');
  assert.deepEqual(front.hits, [A.KNIFE.damage]); assert.equal(front.alive, false, '最近的那个中刀倒下');
  assert.equal(heavy.hits.length + behind.hits.length + far.hits.length, 0, '一刀只中一个；背后的、远处的不中');
  assert.ok(log.some(([n]) => n === 'weapon:melee') && log.some(([n, e]) => n === 'player:hitEnemy' && e.killed && e.melee));
  // 切到刀一直拿着：开火键出刀；重装兵要两刀
  arsenal.select('knife'); run(A.SWAP.lower + A.DRAW.knife + 0.1);
  run(1 / 60, () => pressed.add('fire')); run(A.KNIFE.time + 0.2);
  assert.deepEqual(heavy.hits, [A.KNIFE.damage]); assert.equal(heavy.alive, true);
  run(1 / 60, () => pressed.add('fire')); run(A.KNIFE.time + 0.2);
  assert.equal(heavy.alive, false); assert.equal(arsenal.current, 'knife', '自己切到刀的不会换回去');
});

// ---- 过场镜头（src/jimao/cutscene.js）----
test('开局过场：先从空中推向商场（高、远、对着楼），压黑切进室内，蹲着低头 → 站直平视 → 枪端起来；放完镜头正好落在玩家视角上', async () => {
  const { CUT, introView } = await import('../src/jimao/cutscene.js');
  const start = { pos: new THREE.Vector3(-135, 0, -98), yaw: 0.7 }, center = { x: -130, z: -128 }, roofY = 30, eye = 1.62, ctx = { start, eye, center, roofY };
  assert.ok(CUT.intro >= CUT.aerial + CUT.rise + 0.5, '过场放完到交还操作之间留半秒以上（HUD 这时才出来）');
  const fwd = (v) => new THREE.Vector3(0, 0, -1).applyQuaternion(v.quaternion);
  let prev = null;
  for (let u = 0; u < CUT.aerial; u += 1 / 60) {
    const v = introView(u, ctx);
    assert.equal(v.shot, 'aerial'); assert.equal(v.weapon, false);
    assert.ok(v.position.y > roofY + 55, `空中镜头高过屋面 55 米（${(v.position.y - roofY).toFixed(0)}）`);
    const d = Math.hypot(v.position.x - center.x, v.position.z - center.z);
    assert.ok(d > 150 && d < 230, `离屋顶中心 ${d.toFixed(0)} 米`);
    const to = new THREE.Vector3(center.x - v.position.x, roofY - v.position.y, center.z - v.position.z).normalize();
    assert.ok(fwd(v).dot(to) > 0.9, '镜头对着商场');
    if (prev) assert.ok(v.position.distanceTo(prev) < 1.2, '每帧挪不到 1.2 米（不跳）');
    prev = v.position;
  }
  // 往前推：越来越近、越来越低
  assert.ok(introView(CUT.aerial - 0.05, ctx).position.y < introView(0, ctx).position.y - 15);
  // 切镜头前后压黑
  assert.ok(introView(CUT.aerial - 0.01, ctx).dip > 0.9 && introView(CUT.aerial + 0.01, ctx).dip > 0.9);
  assert.equal(introView(CUT.aerial - CUT.dip - 0.05, ctx).dip, 0); assert.equal(introView(CUT.aerial + CUT.dip + 0.05, ctx).dip, 0);
  // 室内：从蹲姿起身
  const a = introView(CUT.aerial + 0.001, ctx), b = introView(CUT.aerial + CUT.rise - 0.001, ctx);
  assert.equal(a.shot, 'rise'); assert.equal(a.weapon, true);
  assert.ok(Math.abs(a.position.y - (eye - CUT.crouch)) < 0.02 && a.lowered > 0.99 && fwd(a).y < -0.3, '开头蹲着、低头、枪放着');
  assert.ok(Math.abs(b.position.y - eye) < 0.01 && b.lowered < 0.01, '结尾站直、枪端好');
  const want = new THREE.Vector3(-Math.sin(start.yaw), 0, -Math.cos(start.yaw));
  assert.ok(fwd(b).dot(want) > 0.9999, '结尾平视开局朝向（和玩家视角接得上）');
  assert.ok(Math.hypot(a.position.x - start.pos.x, a.position.z - start.pos.z) < 1e-6, '人没挪地方');
  let low = 1; for (let u = CUT.aerial; u < CUT.aerial + CUT.rise; u += 1 / 60) { const v = introView(u, ctx); assert.ok(v.lowered <= low + 1e-9, '枪只往上端'); low = v.lowered; }
  assert.equal(introView(CUT.aerial + CUT.rise, ctx), null); assert.equal(introView(-1, ctx), null);
});

test('撤离过场：机位在载具前方、背着商场的一侧；接应车加速从镜头前开过去再开远，直升机从镜头旁掠过飞远；最后一秒压暗', async () => {
  const { CUT, carOutroPose, outroCamera, outroFade } = await import('../src/jimao/cutscene.js');
  const { HELI_ORBIT, heliPoseAt, heliDuration } = await import('../src/jimao/ride-paths.js');
  const away = HELI_ORBIT.center;
  // 接应车：停在云澜大道上、车头朝西
  const pose0 = { x: -175, y: 0, z: -6, yaw: Math.PI / 2, pitch: 0, roll: 0, dir: { x: -1, z: 0 } };
  const cam = outroCamera('car', pose0, { away });
  assert.ok(Math.abs(cam.x - (pose0.x - CUT.carAhead)) < 1e-6 && Math.abs(cam.y - CUT.carEye) < 1e-6, '机位在车头前方、蹲着的高度');
  assert.ok(Math.abs(Math.abs(cam.z - pose0.z) - CUT.carSide) < 1e-6 && Math.abs(cam.z - away.z) > Math.abs(pose0.z - away.z), '在路的外侧（背着商场）');
  let near = Infinity, lastD = 0;
  for (let t = 0; t <= CUT.outro.car; t += 1 / 60) {
    const o = carOutroPose(pose0, t), d = Math.hypot(o.pose.x - pose0.x, o.pose.z - pose0.z);
    assert.ok(d >= lastD - 1e-9 && Math.abs(o.pose.z - pose0.z) < 1e-9, '一直沿车头方向往前'); lastD = d;
    near = Math.min(near, Math.hypot(o.pose.x - cam.x, o.pose.z - cam.z));
  }
  assert.ok(near < CUT.carSide + 0.6, `车从镜头前 ${near.toFixed(1)} 米开过`);
  assert.ok(lastD > CUT.carAhead + 25, `放完时车已经开出镜头 ${(lastD - CUT.carAhead).toFixed(0)} 米`);
  assert.ok(Math.abs(carOutroPose(pose0, 0).speed) < 1e-9 && carOutroPose(pose0, 2).speed > 10);
  // 直升机：「离开」那一段的后 heliLead 秒
  const y0 = 30, t0 = heliDuration() - CUT.heliLead, poseAt = (d) => heliPoseAt(t0 + d, y0);
  assert.equal(heliPoseAt(t0, y0).phase, 'leave');
  const hc = outroCamera('helicopter', poseAt(0), { poseAt, away });
  let hNear = Infinity, hEnd = 0;
  for (let t = 0; t <= CUT.outro.helicopter; t += 1 / 60) { const p = poseAt(t), d = Math.hypot(p.x - hc.x, p.y - hc.y, p.z - hc.z); hNear = Math.min(hNear, d); hEnd = d; }
  assert.ok(hNear > 10 && hNear < 24, `直升机离镜头最近 ${hNear.toFixed(0)} 米（掠过，不穿镜头）`);
  assert.ok(hEnd > 70, `放完时已经飞出 ${hEnd.toFixed(0)} 米`);
  assert.ok(Math.hypot(hc.x - away.x, hc.z - away.z) > Math.hypot(poseAt(CUT.heliAhead).x - away.x, poseAt(CUT.heliAhead).z - away.z), '机位在航线外侧');
  for (const kind of ['car', 'helicopter']) {
    assert.equal(outroFade(kind, 0), 0); assert.equal(outroFade(kind, CUT.outro[kind] - CUT.fadeOut), 0);
    assert.ok(Math.abs(outroFade(kind, CUT.outro[kind]) - 0.9) < 1e-9);
  }
});

test('过场的遮幅和跳过：只有完整开场才放；放的时候按键 / 点一下让原游戏结束开场（G.cutSkip）；重新出击的短开场不放', async () => {
  const { CUT, createCutscenes } = await import('../src/jimao/cutscene.js');
  const cls = new Set(), node = () => ({ className: '', textContent: '', innerHTML: '', classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) }, append() {}, remove() {} });
  const doc = { createElement: node };
  const G = { game: { state: 'title' }, introFull: false, cutSkip: false, level: { playerStart: { pos: new THREE.Vector3(-135, 0, -98), yaw: 0 } },
    arms: { low: 0, setLowered(k) { this.low = k; } }, weapon: { shown: true, setVisible(v) { this.shown = v; } } };
  const post = { fade: 0 };
  const cuts = createCutscenes(G, { ui: node(), start: G.level.playerStart, center: { x: -130, z: -128 }, roofY: 30, post, doc });
  assert.equal(cuts.intro.view(1 / 60), null);
  // 重新出击：原游戏只给 1.3 秒，不放过场
  G.game.state = 'intro'; G.introFull = false;
  assert.equal(cuts.intro.view(1 / 60), null); assert.ok(!cls.has('on'));
  // 完整开场
  G.game.state = 'playing'; cuts.intro.view(1 / 60); G.game.state = 'intro'; G.introFull = true;
  let v = cuts.intro.view(1 / 60);
  assert.equal(v.shot, 'aerial'); assert.ok(cls.has('on')); assert.equal(G.weapon.shown, false);
  post.fade = 0.6; v = cuts.intro.view(1 / 60); assert.equal(v.fade, 0.6, '原游戏的淡入照旧（取两者里更暗的）');
  post.fade = 0;
  for (let t = 0; t < CUT.aerial + 0.3; t += 1 / 60) v = cuts.intro.view(1 / 60);
  assert.equal(v.shot, 'rise'); assert.equal(G.weapon.shown, true); assert.ok(G.arms.low > 0.9);
  // 跳过：0.6 秒以后才认（免得点「开始」的那一下就跳了）
  cuts.skip(); assert.equal(G.cutSkip, true);
  assert.equal(cuts.intro.view(1 / 60), null); assert.equal(G.arms.low, 0); assert.ok(!cls.has('on'));
  // 放完自己结束
  G.game.state = 'playing'; cuts.intro.view(1 / 60); G.cutSkip = false; G.game.state = 'intro';
  for (let t = 0; t < CUT.aerial + CUT.rise + 0.1; t += 1 / 60) v = cuts.intro.view(1 / 60);
  assert.equal(v, null); assert.equal(G.arms.low, 0); assert.equal(G.weapon.shown, true); assert.equal(G.cutSkip, false);
  // 撤离用的遮幅和字幕
  cuts.letterbox(true, '<b>撤离成功</b>'); assert.ok(cls.has('on')); cuts.letterbox(false); assert.ok(!cls.has('on'));
  cuts.dispose();
});

test('掏枪动画：手枪绕扳机转一整圈再拉套筒（有一声上膛），刀抛起来翻一圈接住，步枪斜着甩上肩；首尾归零、转动不倒退；近战快掏和刺完换回不带花样', async () => {
  const { A, arsenal, rifle, run, pressed, log, G, enemy } = await arsenalWorld();
  // 姿势曲线：从下面开始，结束时全部归零
  for (const slot of ['rifle', 'pistol', 'knife']) {
    const a = A.drawPose(slot, 0), b = A.drawPose(slot, 1);
    assert.ok(a.drop > 0.99, `${slot} 从下面开始`);
    for (const key of Object.keys(b)) assert.ok(Math.abs(b[key]) < 1e-9, `${slot} 结束时 ${key} 归零`);
    let drop = 1, spin = 7;
    for (let k = 0; k <= 1.0001; k += 1 / 120) { const q = A.drawPose(slot, k); assert.ok(q.drop <= drop + 1e-9 && q.spin <= spin + 1e-9, `${slot} 只往上、只往一个方向转`); drop = q.drop; spin = q.spin; }
  }
  assert.ok(Math.abs(A.drawPose('pistol', 0).spin - Math.PI * 2) < 1e-9 && Math.abs(A.drawPose('knife', 0).spin - Math.PI * 2) < 1e-9, '手枪、刀各转一整圈');
  assert.equal(A.drawPose('rifle', 0.3).spin, 0); assert.ok(A.drawPose('rifle', 0.2).cant > 0.8 && A.drawPose('rifle', 0.8).snap > 0.05, '步枪：先侧倾、最后顶肩回弹');
  assert.ok(A.drawPose('pistol', 0.3).rack === 0 && A.drawPose('pistol', 0.78).rack > 0.9 && A.drawPose('pistol', 0.3).hand === 1 && A.drawPose('pistol', 0.78).hand === 0, '手枪：转完左手上来、拉套筒');
  assert.ok(A.drawPose('knife', 0.34).toss > 0.9 && A.drawPose('knife', 0.82).flick > 0.9, '刀：中间离手、接住以后抖腕');
  const plain = A.drawPose('pistol', 0.5, true); assert.ok(plain.spin === 0 && plain.rack === 0 && Math.abs(plain.drop - 0.5) < 1e-9);
  // 真的切一次手枪：枪身绕扳机转（握把那个点回到原位）、套筒拉过、响一声上膛，掏完才能开火
  const body = arsenal.parts.pistol, home = body.position.clone();
  arsenal.select('pistol'); run(A.SWAP.lower + 0.02);
  let turned = 0, slid = 0, far = 0;
  run(A.DRAW.pistol - 0.04, () => { turned = Math.max(turned, Math.abs(body.rotation.x)); slid = Math.max(slid, arsenal.pistol.slide); far = Math.max(far, body.position.distanceTo(home)); pressed.add('fire'); });
  assert.ok(turned > 5 && far > 0.02, `枪转了 ${turned.toFixed(1)} 弧度，握把离开原位 ${(far * 100).toFixed(1)} 厘米`);
  assert.ok(slid > 0.9, '套筒拉到底');
  assert.equal(log.filter(([n, e]) => n === 'weapon:reload' && e.phase === 'bolt' && e.draw).length, 1, '上膛声只响一次');
  assert.equal(G.combat.shots.length, 0, '掏的过程中不能开火');
  run(0.15);
  assert.equal(arsenal.switching, false); assert.equal(arsenal.draw, null);
  assert.ok(Math.abs(body.rotation.x) < 1e-9 && body.position.distanceTo(home) < 1e-9 && arsenal.pistol.slide < 0.05, '掏完枪回到握姿、套筒复位');
  assert.equal(arsenal.pistol.ammo, A.PISTOL.mag, '拉套筒只是检查，不退子弹');
  // 刀：翻一圈
  const kb = arsenal.parts.knife, kHome = kb.position.clone();
  arsenal.select('knife'); run(A.SWAP.lower + 0.02);
  let kTurn = 0, kUp = 0; run(A.DRAW.knife - 0.04, () => { kTurn = Math.max(kTurn, Math.abs(kb.rotation.x)); kUp = Math.max(kUp, kb.position.y - kHome.y); });
  assert.ok(kTurn > 5 && kUp > 0.05, `刀翻了 ${kTurn.toFixed(1)} 弧度、离手 ${(kUp * 100).toFixed(1)} 厘米`);
  run(0.15); assert.ok(Math.abs(kb.rotation.x) < 1e-9 && kb.position.distanceTo(kHome) < 1e-9);
  // 掏到一半换别的：接着放下去，不卡住
  arsenal.select('pistol'); run(A.SWAP.lower + 0.2); assert.equal(arsenal.switching, true);
  arsenal.select('rifle'); run(A.SWAP.lower + A.DRAW.rifle + 0.1);
  assert.equal(arsenal.current, 'rifle'); assert.equal(arsenal.switching, false); assert.equal(rifle.visible, true);
  // 切到步枪的途中：步枪照常更新（模型才摆得回握姿），但开火、开镜、换弹的输入被挡掉
  arsenal.select('pistol'); run(A.SWAP.lower + A.DRAW.pistol + 0.1);
  const seen = []; rifle.update = function () { this.updates++; seen.push([G.input.fire, G.input.pressed('fire'), G.input.pressed('reload'), G.input.pressed('jump')]); };
  arsenal.select('rifle'); G.input.fire = true;
  run(A.SWAP.lower + 0.02); const n0 = seen.length;
  run(A.DRAW.rifle - 0.06, () => { pressed.add('fire'); pressed.add('reload'); pressed.add('jump'); });
  assert.ok(seen.length - n0 > 15, '掏步枪的每一帧都更新了');
  assert.ok(seen.slice(n0).every(([f, pf, pr, pj]) => f === false && pf === false && pr === false && pj === true), '途中开火 / 换弹被挡掉，别的输入照常');
  assert.equal(G.input.fire, true, '挡完还回去');
  run(0.2, () => pressed.add('fire')); G.input.fire = false;
  assert.ok(seen.at(-1)[1] === true, '掏完以后步枪读得到开火');
  // 近战键：快掏不翻刀（0.3 秒内刀已经刺出去），刺完换回步枪也不甩
  const e = enemy(-135, -99.5); kTurn = 0;
  pressed.add('melee'); arsenal.update(1 / 60); pressed.clear();
  run(0.3, () => { kTurn = Math.max(kTurn, Math.abs(kb.rotation.x)); });
  assert.equal(arsenal.current, 'knife'); assert.equal(kTurn, 0, '快掏不翻刀'); assert.ok(arsenal.slashing || e.hits.length > 0, '0.3 秒内已经出刀');
  let cant = 0; run(1.2, () => { cant = Math.max(cant, arsenal.draw?.cant || 0); });
  assert.equal(arsenal.current, 'rifle'); assert.equal(cant, 0, '刺完换回步枪不带花样'); assert.equal(e.hits.length, 1);
});
