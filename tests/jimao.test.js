// 几猫模式：抽出来的游戏代码完整、能在本项目的 three 上加载；物理接口在我们的地图上表现正确。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import * as J from '../src/jimao/vendor/game.js';
import { UI_CSS } from '../src/jimao/vendor/ui-css.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav } from '../src/layout/nav.js';
import { createMissionLayout } from '../src/fps/mission-layout.js';

const layout = buildPlayableLayout({ mode: 'fps' });
const nav = buildNav(layout);
const mission = createMissionLayout(layout);

test('抽出来的模块：来源文件的校验值和报告一致，原游戏各模块都在，three 的名字全部找得到', () => {
  const report = JSON.parse(readFileSync('vendor/jimao/extract-report.json', 'utf8'));
  assert.equal(createHash('sha256').update(readFileSync('vendor/jimao/source.html')).digest('hex'), report.source.htmlSha256);
  for (const name of ['createMats', 'createPhysics', 'createFx', 'createAudio', 'createInput', 'createPlayer', 'createCombat', 'createWeapon', 'createEnemies', 'createHud', 'createGame', 'createProps'])
    assert.equal(typeof J[name], 'function', name);
  assert.deepEqual([report.targetThree.missing, report.nonPublicThreeInternals, report.unknownGlobals], [[], [], []]);
  // 没有自动带上的顶层语句只能是导出表（br(...)），道具登记已经手工补上
  for (const s of report.sideEffectStatements.notCarried) assert.match(s, /br\(/);
  assert.match(readFileSync('src/jimao/vendor/game.js', 'utf8'), /\nJ3\(_i\);\neb\(_i\);\nsb\(_i\);\n$/);
  // 界面样式不带页面级规则，变量挂在 #ui 上
  assert.ok(!/^(html, body|#app|#view|#boot) \{/m.test(UI_CSS));
  assert.match(UI_CSS, /^#ui \{\n  color-scheme: dark;/m);
});

test('物理接口：在出生点往前走、撞墙停下贴墙滑；跳起来会落回楼面', () => {
  const physics = createMapPhysics(nav), s = mission.spawn;
  const pos = new THREE.Vector3(s.x, s.y, s.z), vel = new THREE.Vector3();
  let r = physics.moveCapsule(pos, vel, 0.016);
  assert.equal(r.onGround, true);
  assert.equal(pos.y, s.y);
  // 往前走 1 秒
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  for (let i = 0; i < 60; i++) { vel.set(fx * 3.8, 0, fz * 3.8); physics.moveCapsule(pos, vel, 1 / 60); }
  assert.ok(Math.hypot(pos.x - s.x, pos.z - s.z) > 3, '走出去 3 米以上');
  // 一直往一个方向走，最后一定会被墙挡住，速度被削成实际走出去的那部分
  let blocked = null;
  for (let i = 0; i < 4000 && !blocked; i++) { vel.set(4, 0, 0.3); const res = physics.moveCapsule(pos, vel, 1 / 60); if (res.hitWall) blocked = { vx: vel.x }; }
  assert.ok(blocked, '撞到墙');
  assert.ok(Math.abs(blocked.vx) < 4);
  // 跳
  vel.set(0, 6.48, 0);
  physics.moveCapsule(pos, vel, 0.05);
  assert.ok(pos.y > s.y + 0.2);
  for (let i = 0; i < 60; i++) { vel.y -= 21 / 60; physics.moveCapsule(pos, vel, 1 / 60); }
  assert.equal(pos.y, s.y);
});

test('射线：朝下打到楼面，朝着墙打到墙，视线被墙挡住', () => {
  const physics = createMapPhysics(nav), s = mission.spawn;
  const eye = new THREE.Vector3(s.x, s.y + 1.68, s.z);
  const down = physics.raycast(eye, new THREE.Vector3(0, -1, 0), 50);
  assert.ok(down && Math.abs(down.point.y - s.y) < 1e-6 && down.normal.y === 1);
  // 八个方向里至少有一个方向 60 米内打到竖直的墙
  let wall = null;
  for (let k = 0; k < 8 && !wall; k++) { const h = physics.raycast(eye, new THREE.Vector3(Math.cos(k * 0.785), 0, Math.sin(k * 0.785)), 60); if (h && h.normal.y === 0) wall = h; }
  assert.ok(wall, '打到墙');
  const behind = wall.point.clone().addScaledVector(new THREE.Vector3().subVectors(wall.point, eye).normalize(), 1);
  assert.equal(physics.lineOfSight(eye, behind), false);
  assert.equal(physics.lineOfSight(eye, eye.clone().addScaledVector(new THREE.Vector3().subVectors(wall.point, eye).normalize(), wall.dist * 0.5)), true);
  // 地下层的楼面高度
  assert.equal(physics.groundHeight(-151, -94, -4), -4.5);
});

test('界面布局：读出来的设置逐项检查，坏数据退回默认，越界的值夹回范围', async () => {
  const { normalizeLayout, LAYOUT_ITEMS } = await import('../src/jimao/layout-editor.js');
  assert.deepEqual(normalizeLayout(null), { landscape: {}, portrait: {}, opacity: 1 });
  const v = normalizeLayout({ opacity: 0.1, landscape: { fire: { dx: 3, dy: -0.2, s: 9 }, nope: { dx: 0, dy: 0, s: 1 }, ads: { dx: 'x' } }, portrait: { ammo: { dx: 0.1, dy: 0.1, s: 0.8 } } });
  assert.deepEqual(v, { landscape: { fire: { dx: 1, dy: -0.2, s: 1.8 } }, portrait: { ammo: { dx: 0.1, dy: 0.1, s: 0.8 } }, opacity: 0.25 });
  // 每一项都对得上原游戏样式里的选择器
  for (const it of LAYOUT_ITEMS) assert.ok(UI_CSS.includes(it.sel + ' {') || UI_CSS.includes(it.sel + ' '), it.sel);
});

test('改名：游戏里不再出现「几猫」，标题是「零点突围 ZERO HOUR」，封面入口也改了', async () => {
  const { REBRAND, escapeLikeEsbuild } = await import('../scripts/jimao/rebrand.mjs');
  const code = readFileSync('src/jimao/vendor/game.js', 'utf8');
  assert.ok(!code.includes(escapeLikeEsbuild('几猫')));
  assert.ok(code.includes(escapeLikeEsbuild('零点突围<span class="m-subtitle">ZERO HOUR</span>')));
  for (const [, to] of REBRAND) assert.ok(code.includes(escapeLikeEsbuild(to)), to);
  assert.match(readFileSync('src/launcher.js', 'utf8'), /data-mode="jimao"><b>零点突围 · ZERO HOUR<\/b>/);
});

test('补丁：每一条都打上了；关卡流程和敌人参数导出来了', async () => {
  const { PATCHES } = await import('../scripts/jimao/patches.mjs');
  const { escapeLikeEsbuild } = await import('../scripts/jimao/rebrand.mjs');
  const code = readFileSync('src/jimao/vendor/game.js', 'utf8');
  for (const [why, from, to] of PATCHES) {
    assert.equal(code.split(escapeLikeEsbuild(to)).length - 1, 1, why);
    if (!to.includes(from)) assert.ok(!code.includes(escapeLikeEsbuild(from)), why + '（原文已经换掉）');
  }
  assert.ok(Array.isArray(J.GAME_FLOW.waves) && J.ENEMY_TUNE.hound && J.ENEMY_TUNE.gull);
});

test('敌人出生点：地面的都站在楼面上，空中的都在头顶够高的地上楼层；每个中继 18–40 米内都有同层的出生点', async () => {
  globalThis.location ??= { search: '' };
  const { buildSpawns } = await import('../src/jimao/run.js');
  const { landAt } = await import('../src/layout/nav.js');
  const relays = [mission.objectives[0], mission.objectives[1], { x: -151, y: -4.5, z: -94 }];
  const { enemySpawns, coverPoints, patrolLines } = buildSpawns(mission, nav, relays);
  const ground = enemySpawns.filter((s) => s.type === 'ground'), air = enemySpawns.filter((s) => s.type === 'air');
  assert.ok(ground.length >= 60 && air.length >= 20, `${ground.length} / ${air.length}`);
  for (const { pos } of ground) assert.ok(Math.abs(landAt(nav, pos.x, pos.z, pos.y + 0.6).y - pos.y) < 1e-6);
  for (const { pos } of air) assert.ok(pos.y >= 2.5);
  for (const r of relays) {
    const near = ground.filter(({ pos }) => Math.abs(pos.y - r.y) < 0.5 && Math.hypot(pos.x - r.x, pos.z - r.z) >= 18 && Math.hypot(pos.x - r.x, pos.z - r.z) <= 40);
    assert.ok(near.length >= 4, `中继 ${r.x},${r.z}：${near.length}`);
  }
  assert.ok(coverPoints.length >= 10 && patrolLines.length === mission.enemies.length);
});

/** 不开浏览器也能跑的真人敌人：原游戏敌人模块的共享部分（ctx）照它的规则写一份最小的 */
async function soldierRig() {
  const { addSoldiers, SOLDIER } = await import('../src/jimao/soldier.js');
  const events = [], player = { pos: new THREE.Vector3(1e4, 0, 1e4), alive: true, damage() {} };
  const G = {
    scene: new THREE.Scene(), time: { frame: 0 }, player, level: { coverPoints: [] },
    events: { emit: (name, e) => events.push([name, e]), on() {} },
    physics: createMapPhysics(nav),
    fx: { smoke() {}, tracer() {}, muzzleFlash() {} }, combat: { enemyShot: () => false },
  };
  let seed = 7; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ctx = { G, rng, list: [], t: 0, playerSpeed: 0, retired: [],
    think(e) { e.los = false; }, requestToken: () => true, releaseToken(e) { e.hasToken = false; }, provoke() {}, rally() {},
    retire(e) { e._deactivate(); ctx.retired.push(e); ctx.list.splice(ctx.list.indexOf(e), 1); } };
  const pool = addSoldiers(G, { debug: { ctx } }, { count: 3 });
  const spawn = (at, opts) => { const s = ctx.pools.soldier.find((q) => !q.active); ctx.list.push(s); s._activate(at, opts); return s; };
  return { G, ctx, pool, spawn, events, SOLDIER };
}

test('真人敌人：打头是弱点、打胸是身体，血打光倒地、播报「soldier」，尸体过一会儿收回池子', async () => {
  const { pool, spawn, events, ctx, SOLDIER } = await soldierRig();
  assert.equal(pool.length, 3);
  const s = spawn(new THREE.Vector3(mission.spawn.x, mission.spawn.y, mission.spawn.z), { yaw: 0, passive: true });
  assert.equal(s.alive, true); assert.equal(s.pos.y, mission.spawn.y);
  // 头在 1.6–1.8 米之间
  assert.ok(s.headPos.y - s.pos.y > 1.55 && s.headPos.y - s.pos.y < 1.8, String(s.headPos.y - s.pos.y));
  const shoot = (target) => {
    const o = new THREE.Vector3(s.pos.x, target.y, s.pos.z + 8), d = target.clone().sub(o).normalize();
    const out = { dist: Infinity, point: new THREE.Vector3(), normal: new THREE.Vector3(), enemy: null, part: null };
    return s._raycast(o, d, 50, out) ? out : null;
  };
  assert.equal(shoot(s.headPos.clone()).part, 'weak');
  assert.equal(shoot(new THREE.Vector3(s.pos.x, s.pos.y + 1.25, s.pos.z)).part, 'body');
  assert.equal(shoot(new THREE.Vector3(s.pos.x + 1.2, s.pos.y + 1.25, s.pos.z)), null);
  assert.equal(s.damage(30, null, new THREE.Vector3(0, 0, -1), 'body'), false);
  assert.equal(s.damage(SOLDIER.heavyHp, null, new THREE.Vector3(0, 0, -1), 'body'), true);
  assert.equal(s.alive, false);
  assert.ok(events.some(([n, e]) => n === 'enemy:killed' && e.type === 'soldier'));
  // 倒下去：两秒后身体是横的；过了停尸时间收回池子
  for (let i = 0; i < 60; i++) s._update(1 / 30);
  assert.ok(Math.abs(s.rig.group.children[0].rotation.x) > 1.2 || s.crumple);
  for (let i = 0; i < 30 * (SOLDIER.corpseSeconds + 4); i++) s._update(1 / 30);
  assert.equal(ctx.retired.length, 1); assert.ok(ctx.retired[0] === s); assert.equal(s.active, false);
});

test('真人敌人：巡逻沿着导航网格走，不穿墙、不掉层', async () => {
  const { G, spawn } = await soldierRig();
  const s = spawn(new THREE.Vector3(mission.spawn.x, mission.spawn.y, mission.spawn.z), { yaw: 0 });
  const start = s.pos.clone();
  let maxStep = 0, prev = s.pos.clone();
  for (let i = 0; i < 30 * 20; i++) {
    G.time.frame++; s._update(1 / 30);
    maxStep = Math.max(maxStep, Math.hypot(s.pos.x - prev.x, s.pos.z - prev.z)); prev.copy(s.pos);
    // 每一帧脚下都是这一层的楼面
    assert.equal(G.physics.groundHeight(s.pos.x, s.pos.z, s.pos.y + 0.6), s.pos.y);
  }
  assert.ok(s.pos.distanceTo(start) > 1, '走动了');
  assert.ok(maxStep < 0.2, '没有瞬移：' + maxStep);
});

test('机械猎犬贴地走（moveFeet）：被墙挡住，不会从楼梯井掉下去', () => {
  const physics = createMapPhysics(nav), s = mission.spawn;
  const pos = new THREE.Vector3(s.x, s.y, s.z);
  for (let i = 0; i < 4000; i++) physics.moveFeet(pos, pos.x + 0.1, pos.z + 0.01, 1 / 60);
  assert.equal(pos.y, s.y);
  assert.ok(physics.lineOfSight(new THREE.Vector3(s.x, s.y + 1, s.z), new THREE.Vector3(pos.x, pos.y + 1, pos.z)) || Math.hypot(pos.x - s.x, pos.z - s.z) > 1);
});
