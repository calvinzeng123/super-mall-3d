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

test('改名：游戏里不再出现「几猫」，标题是「断讯 SIGNAL ZERO」，封面入口也改了', async () => {
  const { REBRAND, escapeLikeEsbuild } = await import('../scripts/jimao/rebrand.mjs');
  const code = readFileSync('src/jimao/vendor/game.js', 'utf8');
  assert.ok(!code.includes(escapeLikeEsbuild('几猫')));
  assert.ok(code.includes(escapeLikeEsbuild('断讯<span class="m-subtitle">SIGNAL ZERO</span>')));
  for (const [, to] of REBRAND) assert.ok(code.includes(escapeLikeEsbuild(to)), to);
  assert.match(readFileSync('src/launcher.js', 'utf8'), /data-mode="jimao"><b>断讯 · SIGNAL ZERO<\/b>/);
});
