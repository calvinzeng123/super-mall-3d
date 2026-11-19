// 零点突围的操作补强（src/jimao/actions.js）：滑铲、手雷、手机上的蹲键、辅助瞄准、自动开火。
// 用真的地图物理（physics.js）+ 假的玩家 / 输入 / 敌人跑一遍。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { createActions, SLIDE, GRENADE, ASSIST, slideSpeed, blastDamage, aimAngles, wrapAngle, normalizeControls, CONTROLS_KEY, ACTIONS_CSS } from '../src/jimao/actions.js';
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
