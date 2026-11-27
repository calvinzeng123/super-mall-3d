// 丧尸围城（src/jimao/siege.js、zombie.js）：抽关卡、电梯 / 楼梯的封锁、清扫航线、丧尸的行为、和任务系统的衔接。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, clear } from '../src/layout/nav.js';
import { findPath } from '../src/fps/pathfinding.js';
import { pointInPoly, toW } from '../src/layout/geom.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { stairRuns } from '../src/jimao/stairs.js';
import { SIEGE, TOWERS, GATES, pickTower, siegePlan, activeGate, liftRule, stairRule, siegeFlight, flightBox, groundSpots, balconySpots, unitSites, lobbySpot, createSiege, gateBlock, balconyModel, balconyBoxes, reachSpot, plateOf, LOOT, lootOf, lootSpots, floorSpots, climbFloors, heliGun } from '../src/jimao/siege.js';
import { aimAngles, inGunArc, createDoorGun, DOOR_GUN, DOOR_GUN_CSS, impactAt } from '../src/jimao/door-gun.js';
import { createSupplies, SUPPLY, healChoice, MEDIC_CSS } from '../src/jimao/supplies.js';
import { createSquad, SQUAD, pickTarget, shotHits, slotOf, SQUAD_CSS } from '../src/jimao/squad.js';
import { DEFENSE } from '../src/jimao/siege-defense.js';
import { createHealthBars, BARS, barWidth, pickBars, BARS_CSS } from '../src/jimao/healthbars.js';
import { doorOutside } from '../src/jimao/guide.js';
import { PACING, createPacing } from '../src/jimao/pacing.js';
import { MALL, inMallZone } from '../src/jimao/siege-mall.js';
import { DEMOLISH, collapseAt, createDemolition } from '../src/jimao/siege-demolish.js';
import { SPECIALS } from '../src/jimao/zombie.js';
import { ZOMBIE, KINDS, pickKind, zombieParts, addZombies } from '../src/jimao/zombie.js';
import { FPS_MISSION } from '../src/fps/mission-layout.js';
import { createPathfinder } from '../src/jimao/pathfinder.js';
import { ROOF_GUN, siteGeom, blockNav, unblockNav, segDist2 } from '../src/jimao/roof-gun.js';

// 游戏里用的是门禁全开的导航（run.js）：北区塔楼的楼梯间、电梯厅要过门禁
const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' }), runs = stairRuns(nav);
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };
const elev = (id) => L.levels.find((l) => l.id === id).elev;

test('抽一局：武器柜 → 合闸 → 三道关（各一件工具、一处关卡）→ 信号弹；三道关种类不同、楼层一道比一道高，每一步的位置都在那一层的空地上', () => {
  const seen = new Set();
  for (const seed of [3, 7, 21, 99, 1234, 4321, 777, 2024]) {
    const plan = siegePlan(seq(seed), L, nav, runs);
    assert.deepEqual(plan.stages.map((s) => s.kind), ['crank', 'shutter', 'crowbar', 'rescue', 'escort', 'pry', 'sneak', 'pistol', 'note', 'card', 'fuel', 'gen', 'open', 'locker', 'holdout', 'switch', 'tool', 'gate', 'tool', 'gate', 'tool', 'gate', 'flare']);
    assert.equal(new Set(plan.gates.map((g) => g.type)).size, 3, '三道关种类不同');
    plan.gates.forEach((g, i) => { const [lo, hi] = SIEGE.gates[i]; assert.ok(g.n >= lo && g.n <= hi, `第 ${i + 1} 道关在 ${g.n}F`); assert.equal(g.runs.length, 2, '两部楼梯都拦着'); assert.equal(plan.stages[g.stage].kind, 'gate'); seen.add(g.type); });
    for (const st of plan.stages) {
      const q = landAt(nav, st.site.x, st.site.z, st.site.y + 0.6);
      assert.ok(q && q.floor === st.floor && clear(nav, q), `${st.id}（${st.label}）站得住`);
      assert.ok(st.text && st.verb && st.label);
    }
    // 工具和关卡在同一层；工具在住户家里，关卡在楼梯口或电梯厅（离工具至少 3 米）
    for (const g of plan.gates) { const tool = plan.stages[g.stage - 1], gate = plan.stages[g.stage]; assert.equal(tool.floor, gate.floor); assert.equal(tool.tool, GATES[g.type].tool); assert.ok(Math.hypot(tool.site.x - gate.site.x, tool.site.z - gate.site.z) > 3); }
  }
  assert.ok(seen.size === 4, `几局下来四种关卡都出现过：${[...seen]}`);
  assert.equal(unitSites(L, nav, 'A-12F').length, 10);
});

test('走得到：开局点 → 武器柜 → 公寓地下配电间；公寓各层的楼梯口、电梯厅互相连着；屋顶停机位 7.5 米内是空地', () => {
  const plan = siegePlan(seq(7), L, nav, runs), s = FPS_MISSION.spawn, start = { floor: s.floor, x: s.x, z: s.z, y: elev(s.floor), slope: null };
  const at = (st) => ({ floor: st.floor, x: st.site.x, z: st.site.z, y: st.site.y, slope: null });
  assert.ok(findPath(nav, start, at(plan.stages[plan.armsStage])), '武器柜走得到');
  assert.ok(findPath(nav, start, at(plan.stages[plan.powerStage])), '配电间走得到');
  for (const g of plan.gates) if (GATES[g.type].at === 'stair') assert.ok(findPath(nav, { ...at(plan.stages[plan.powerStage]) }, at(plan.stages[g.stage])), `${g.n}F 的关卡走得到`);
  assert.ok(findPath(nav, start, at(plan.stages.at(-1))), '屋顶信号弹走得到');
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, q = landAt(nav, SIEGE.pad.x + Math.cos(a) * 7.5, SIEGE.pad.z + Math.sin(a) * 7.5, elev(SIEGE.roof) + 0.6); assert.ok(q && q.floor === SIEGE.roof && clear(nav, q)); }
});

test('封锁：合闸前公寓电梯不动；之后电梯只到眼前这道关所在的层、这一层往上的两部楼梯都不通；解决一道放开一段；商场的电梯不管', () => {
  const plan = siegePlan(seq(7), L, nav, runs), [g0, g1, g2] = plan.gates;
  const up = (g) => runs.find((r) => r.id === g.runs[0]), f = (n) => `A-${n}F`;
  assert.match(liftRule(plan, 0, nav, 'A-ST1', 'A-1F', 'A-2F'), /停电/); assert.match(liftRule(plan, plan.powerStage, nav, 'A-ST1', 'A-B1', 'A-1F'), /停电/, '捡了手枪、开了武器柜都还没电');
  assert.match(liftRule(plan, 0, nav, 'P1-L3', 'P1-1F', 'P1-4F'), /停电/, '商场的电梯一律不走');
  assert.equal(liftRule(plan, plan.powerStage + 1, nav, 'A-ST1', 'A-B1', f(g0.n)), null, '合闸后能到第一道关那层');
  assert.match(liftRule(plan, plan.powerStage + 1, nav, 'A-ST2', 'A-1F', f(g0.n + 1)), new RegExp(`只能到 ${g0.n}F`));
  assert.equal(activeGate(plan, plan.powerStage + 1), g0); assert.equal(activeGate(plan, g0.stage), g0); assert.equal(activeGate(plan, g0.stage + 1), g1);
  assert.match(stairRule(plan, plan.powerStage + 1, up(g0)), /先找/); assert.match(stairRule(plan, g0.stage, up(g0)), /用/, '工具到手以后提示改成「用」');
  assert.equal(stairRule(plan, plan.powerStage + 1, up(g1)), null, '后面的关还没轮到');
  assert.equal(stairRule(plan, g0.stage + 1, up(g0)), null, '解决了就通');
  // 电梯只坐到第一道关那一层：清了关以后往上一律走楼梯（一层层破楼）
  assert.match(liftRule(plan, g0.stage + 1, nav, 'A-ST1', f(g0.n), f(g1.n)), /走楼梯/); assert.equal(liftRule(plan, g0.stage + 1, nav, 'A-ST1', 'A-1F', f(g0.n)), null);
  assert.match(liftRule(plan, g2.stage + 1, nav, 'A-ST1', 'A-1F', 'A-RF'), /走楼梯/, '三道都解决了也不直达屋顶');
  assert.equal(activeGate(plan, g2.stage + 1), null);
  // 被拦的那两段楼梯都记着自己经过的梯段和平台
  for (const id of g0.runs) { const r = runs.find((x) => x.id === id); assert.ok(r.slopes.length >= 2 && r.landings.length >= 1 && r.from === f(g0.n)); }
});

test('清扫航线：从停机位垂直起飞，绕楼顶、边绕边降、再绕楼下；全程不穿楼（高出脚下的楼 8 米以上）、左舷朝着公寓；清完定下离开时刻，沿切线爬升飞走', () => {
  const padY = elev(SIEGE.roof), f = siegeFlight(SIEGE.pad, padY);
  const p0 = f.poseAt(0); assert.ok(Math.hypot(p0.x - SIEGE.pad.x, p0.z - SIEGE.pad.z) < 1e-6 && Math.abs(p0.y - padY) < 1e-6 && p0.phase === 'lift');
  const tops = L.buildings.filter((b) => b.outline?.length).map((b) => ({ id: b.id, outline: b.outline, top: Math.max(...L.levels.filter((l) => l.building === b.id).map((l) => l.elev + (l.kind === 'roof' ? 3 : l.height || 4))) }));
  const phases = []; let prev = null;
  for (let t = 0; t < 140; t += 1 / 30) {
    const p = f.poseAt(t);
    if (phases.at(-1) !== p.phase) phases.push(p.phase);
    if (prev) assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) < 0.6, `t=${t.toFixed(1)} 不跳`);
    prev = p;
    if (p.phase !== 'lift') for (const b of tops) if (pointInPoly([p.x, p.z], b.outline)) assert.ok(p.y > b.top + 8, `t=${t.toFixed(0)} 在 ${b.id} 上空只高出 ${(p.y - b.top).toFixed(0)} 米`);
    if (p.phase === 'windows' || p.phase === 'ground') {
      // 左舷（机身 +x）朝着公寓：机头方向 f = (sin yaw, cos yaw)，左舷 = (cos yaw, −sin yaw)
      // 航线是楼的外轮廓往外推 off 米的圆角矩形：离楼最近的那一点正好 off 米远，左舷正对着它
      const lx = Math.cos(p.yaw), lz = -Math.sin(p.yaw), B = f.box, qx = Math.max(B.x0, Math.min(B.x1, p.x)), qz = Math.max(B.z0, Math.min(B.z1, p.z)), cx = qx - p.x, cz = qz - p.z, d = Math.hypot(cx, cz);
      assert.ok((lx * cx + lz * cz) / d > 0.95, '左舷朝楼');
      assert.ok(Math.abs(d - f.off) < 0.5, `离楼 ${d.toFixed(1)} 米`);
    }
  }
  assert.deepEqual(phases, ['lift', 'roof', 'windows', 'ground']);
  assert.ok(f.poseAt(f.times.roof + 10).y > padY + 8 && f.poseAt(f.times.ground + 5).y < padY - 20, '先在楼顶上方，后来降到楼下');
  assert.equal(f.duration(), SIEGE.sweep.cap + 6); assert.equal(f.leaving, false);
  assert.equal(f.setLeave(90), 90); assert.equal(f.setLeave(120), 90, '定了就不改'); assert.equal(f.duration(), 96);
  const a = f.poseAt(90), b = f.poseAt(93), c = f.poseAt(96);
  assert.equal(b.phase, 'leave'); assert.ok(c.y > b.y && b.y > a.y, '爬升'); assert.ok(Math.hypot(c.x - a.x, c.z - a.z) > 100, '飞远了');
  assert.ok(Math.hypot(f.poseAt(90.03).x - a.x, f.poseAt(90.03).z - a.z) < 0.6, '离开那一刻接得上');
});

test('清扫的目标位置：楼下的一半在街上（室外地面）、一半在紧挨着的商场屋面；阳台挂在公寓东西两面墙外，楼层错开', () => {
  const g = groundSpots(nav, L, 20, seq(5));
  assert.equal(g.length, 20);
  assert.ok(g.filter((q) => q.where === 'street').length >= 8 && g.filter((q) => q.where === 'mall').length >= 8);
  for (const q of g) { const st = landAt(nav, q.x, q.z, q.y + 1); assert.equal(st.floor, q.where === 'mall' ? 'P1-RF' : 'ground'); }
  const b = L.buildings.find((x) => x.id === 'A'), x0 = Math.min(...b.outline.map((p) => p[0])), x1 = Math.max(...b.outline.map((p) => p[0]));
  const bal = balconySpots(L, nav, 6, seq(5));
  assert.equal(bal.length, 6); assert.equal(new Set(bal.map((q) => q.n)).size, 6);
  for (const q of bal) { assert.ok(q.x > x1 || q.x < x0, '在墙外'); assert.equal(Math.sign(q.nx), q.x > x1 ? 1 : -1); assert.ok(Math.abs(q.y - elev(`A-${q.n}F`)) < 1e-6); }
  assert.ok(balconyModel().userData.pane, '阳台有一整面玻璃');
  const blk = gateBlock('debris'); blk.userData.clear(); blk.userData.update(1); assert.ok(blk.children[0].position.x > 1, '撬开以后杂物挪到一边');
});

// ---- 丧尸 ----
function zworld({ count = 12 } = {}) {
  const physics = createMapPhysics(nav), scene = new THREE.Scene(), events = [], hurt = [];
  const handlers = {};
  const ctx = { rng: seq(11), list: [], retire(m) { m._deactivate(); const i = ctx.list.indexOf(m); if (i >= 0) ctx.list.splice(i, 1); }, releaseToken() {} };
  const enemies = { debug: { ctx }, list: ctx.list, spawn(type, pos, opts) { const z = ctx.pools[type].find((q) => !q.active); if (!z) return null; z._activate(pos, opts); ctx.list.push(z); return z; } };
  const s = FPS_MISSION.spawn, y = elev(s.floor);
  const player = { pos: new THREE.Vector3(s.x, y, s.z), vel: new THREE.Vector3(), alive: true, health: 100, damage(n, from) { hurt.push([n, from?.clone?.()]); this.health -= n; }, addShake() {} };
  const G = { scene, physics, player, enemies, time: { frame: 0 }, events: { emit(n, e) { events.push([n, e]); for (const h of handlers[n] || []) h(e); }, on(n, h) { (handlers[n] ||= []).push(h); } }, fx: { smoke() {}, explosion() {} } };
  const zombies = addZombies(G, enemies, { count });
  const run = (secs, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { G.time.frame++; each?.(); for (const z of [...ctx.list]) z._update(1 / 30); } };
  // 离人 d 米、同一层、中间没东西挡着的一点（第 skip 个这样的方向）
  const ahead = (d, skip = 0) => {
    const eye = new THREE.Vector3(s.x, y + 1.5, s.z);
    for (let k = 0, n = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2, q = new THREE.Vector3(s.x + Math.cos(a) * d, y, s.z + Math.sin(a) * d), st = landAt(nav, q.x, q.z, y + 0.6);
      if (!st || st.floor !== s.floor || Math.abs(st.y - y) > 0.1 || !clear(nav, st) || !physics.lineOfSight(eye, new THREE.Vector3(q.x, y + 1.5, q.z))) continue;
      if (n++ === skip * 6) return q;
    }
    throw new Error(`开局点周围 ${d} 米找不到看得见的空地`);
  };
  return { G, zombies, enemies, ctx, player, events, hurt, run, ahead };
}

test('丧尸模型省：一只两千多个顶点、五个网格；四种按比例出场，行尸最多', () => {
  const p = zombieParts({ shirt: 1, pants: 2, shoe: 3, hair: 4 }), n = p.body.attributes.position.count + 2 * p.arm.attributes.position.count + 2 * p.leg.attributes.position.count;
  assert.ok(n < 3000, `一只 ${n} 个顶点`);
  const c = {}; for (let i = 0; i < 1000; i++) { const k = pickKind(i / 1000); c[k] = (c[k] || 0) + 1; }
  assert.ok(c.walker > 600 && c.runner > 100 && c.bloater > 50 && c.screamer > 40);
  assert.equal(pickKind(0.5, { runner: 1, walker: 0, bloater: 0, screamer: 0 }), 'runner');
  const { zombies } = zworld(); assert.equal(zombies.pool[0].rig.group.children[0].children[0].children.length, 5, '躯干 + 两臂 + 两腿');
});

test('行尸：没发现人时待着；看见了扑过来，贴身抡一下再咬（掉 14 血），咬完缓一缓；奔尸快得多；被打会顿一下，打头算弱点', () => {
  const { G, enemies, player, hurt, events, run, ahead } = zworld();
  const far = enemies.spawn('zombie', ahead(40), { kind: 'walker' });
  run(1); assert.equal(far.zs, 'idle', '40 米外没发现');
  const w = enemies.spawn('zombie', ahead(9), { kind: 'walker', yaw: 0 }), d0 = w.pos.distanceTo(player.pos);
  run(1.2); assert.equal(w.zs, 'chase'); assert.equal(w.mode, 'engage');
  run(2); const d1 = w.pos.distanceTo(player.pos); assert.ok(d1 < d0 - 2 && d1 > 1, `走近了 ${(d0 - d1).toFixed(1)} 米`);
  const speed = (d0 - d1) / 2.6; assert.ok(speed < 1.6, '行尸慢');
  run(8); assert.ok(hurt.length >= 1, `咬到了：${JSON.stringify(hurt.map((h) => h[0]))}`);
  assert.equal(hurt[0][0], ZOMBIE.bite); assert.ok(events.some(([n, e]) => n === 'enemy:melee' && e.zombie));
  const n = hurt.length; run(0.5); assert.ok(hurt.length <= n + 1, '不是连着咬');
  // 奔尸
  far._deactivate(); w._deactivate(); hurt.length = 0;
  const r = enemies.spawn('zombie', ahead(14), { kind: 'runner' }), e0 = r.pos.distanceTo(player.pos);
  run(2.2); assert.ok(e0 - r.pos.distanceTo(player.pos) > 6, `奔尸 2 秒跑了 ${(e0 - r.pos.distanceTo(player.pos)).toFixed(1)} 米`);
  // 命中：头是弱点；打一枪顿一下；打死发 enemy:killed
  const out = { dist: Infinity, point: new THREE.Vector3(), normal: new THREE.Vector3() };
  assert.ok(r._raycast(new THREE.Vector3(r.headPos.x, r.headPos.y, r.headPos.z + 5), new THREE.Vector3(0, 0, -1), 20, out)); assert.equal(out.part, 'weak'); assert.equal(out.enemy, r);
  assert.equal(r.damage(20, null, new THREE.Vector3(0, 0, 1), 'weak'), false); assert.ok(r.stagger > 0.3);
  assert.equal(r.damage(999, null, new THREE.Vector3(0, 0, 1), 'body'), true); assert.equal(r.alive, false);
  assert.ok(events.some(([n, e]) => n === 'enemy:killed' && e.enemy === r && e.zombie && e.kind === 'runner'));
  assert.equal(r.type, 'soldier'); assert.equal(r.feedName, '奔尸');
  void G;
});

test('胖尸倒下炸开（人和旁边的丧尸都掉血）；尖叫者隔着八九米站住叫、不上来咬；阳台上的钉在原地；响动能把一片丧尸叫过来', () => {
  const { G, zombies, enemies, player, hurt, events, run, ahead } = zworld();
  const b = enemies.spawn('zombie', ahead(2.2), { kind: 'bloater', passive: true }), mate = enemies.spawn('zombie', ahead(3.4, 1), { kind: 'walker', passive: true });
  assert.equal(b.maxHp, KINDS.bloater.hp);
  b.damage(999, null, null, 'body');
  assert.ok(hurt.length === 1 && hurt[0][0] > 15 && hurt[0][0] <= KINDS.bloater.burst.damage, `炸到人 ${hurt[0]?.[0]}`);
  assert.ok(mate.hp < mate.maxHp || !mate.alive, '旁边的也挨炸'); assert.ok(events.some(([n]) => n === 'zombie:burst'));
  b._deactivate(); mate._deactivate(); hurt.length = 0; events.length = 0;
  const s = enemies.spawn('zombie', ahead(13), { kind: 'screamer' }); // 15 米内看得见才会发现人
  run(9); const d = s.pos.distanceTo(player.pos);
  assert.ok(events.some(([n]) => n === 'zombie:scream'), '叫了'); assert.ok(d > KINDS.screamer.keep - 3.5, `停在 ${d.toFixed(1)} 米`); assert.equal(hurt.length, 0, '尖叫者不咬人');
  // 直升机在飞：冲飞机叫，一声顶 6 发
  // 飞机在 heliRange（85 米）以内才冲它叫；这里飞机离尖叫者五十来米
  const heliC = new THREE.Vector3(player.pos.x + 20, player.pos.y + 45, player.pos.z);
  G.missions = { rideKind: 'helicopter', vehicleCenter: () => heliC.clone() }; events.length = 0;
  player.pos.y += 44; // 人在飞机上：离地四十多米，不在同一层
  // 上一声对人叫完最多再等 7.5 秒 + 叫的那 1.1 秒，所以给 10 秒
  const stand = s.pos.clone(); run(10); player.pos.y -= 44; const shot = events.find(([n, e]) => n === 'enemy:fire' && e.scream);
  assert.ok(s.pos.distanceTo(stand) < 1.5, '站住叫，不乱跑');
  assert.ok(shot && shot[1].hits === KINDS.screamer.scream.heli && shot[1].type === 'screamer' && shot[1].dir.y > 0.5, '朝天上的直升机叫');
  // 一只尖叫者 8 秒叫一声、一声掉 3 × 0.8：三只都不管，100 秒的清扫掉 90 来点耐久——不打会坠机，但来得及先找它们
  assert.ok(KINDS.screamer.scream.heli * 0.8 * 3 * (100 / KINDS.screamer.scream.heliEvery) < 100);
  s._deactivate(); G.missions = null;
  // 钉在原地的
  const fx = enemies.spawn('zombie', ahead(5), { kind: 'walker', fixed: true, yaw: 1 }), at = fx.pos.clone();
  run(2); assert.ok(fx.pos.distanceTo(at) < 1e-6 && fx.yaw === 1); fx._deactivate();
  // 响动
  const idle = [enemies.spawn('zombie', ahead(34), { kind: 'walker', passive: true }), enemies.spawn('zombie', ahead(60), { kind: 'walker', passive: true })];
  assert.equal(zombies.alert(player.pos, 40), 1); assert.equal(idle[0].zs, 'chase'); assert.equal(idle[1].zs, 'idle');
  assert.equal(zombies.alive().length, 2);
});

// ---- 接到游戏上 ----
function sworld({ enabled = true, tower = 'A', seed = 7 } = {}) {
  const z = zworld({ count: ZOMBIE.pool }), { G } = z, msgs = [], store = new Map([['jimao-siege', enabled ? '1' : '0']]);
  const heli = { root: new THREE.Group(), poses: [], setPose(p) { this.poses.push(p); }, reset() { this.parked = true; }, moveTo() {} };
  const director = { state: { mission: null, restore: false, checkpoint: null }, vehicles: { heli }, riding: false, opened: 0, openExtraction() { this.opened++; }, dead: [], deadActions(...a) { this.dead.push(a); } };
  const flow = { patrol: { soldier: 8 }, waves: [{ soldier: 5 }, { soldier: 6 }], pursuitExtra: 5 };
  Object.assign(G, { game: { state: 'playing', run: { relays: [] }, refreshObjective() {} }, hud: { message: (t) => msgs.push(t), radio: (t) => msgs.push('R:' + t) }, rifle: { ammo: 30, reserve: 150 }, weapon: { picked: null, locked: [], melee: 'knife', granted: [], select(s) { this.picked = s; }, lock(l) { this.locked = [...l]; if (l.length) this.picked = 'knife'; }, unlock(s, { equip = true } = {}) { const i = this.locked.indexOf(s); if (i < 0) return false; this.locked.splice(i, 1); if (equip) this.picked = s; return true; },
    setMelee(k) { this.melee = k; return true; }, grant(slot, { equip = true } = {}) { this.granted.push([slot, equip]); return true; } } });
  G.physics.stateOf = (p) => landAt(nav, p.x, p.z, p.y + 0.6); G.physics.forget = () => {};
  const thrown = { frag: 2, fire: 0, lure: 0 };
  const actions = { countOf: (k) => thrown[k] || 0, give(n, k = 'frag') { const b = thrown[k]; thrown[k] = Math.min(k === 'frag' ? 3 : 2, b + n); return thrown[k] - b; } };
  const supplies = createSupplies(G, { scene: G.scene, actions, ammo: { give: (n) => { G.rifle.reserve += n; return n; } }, rng: seq(3) });
  const siege = createSiege(G, { layout: L, nav, scene: G.scene, zombies: z.zombies, director, runs, flow, rng: seq(seed), tower, supplies, storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } });
  const begin = (seed = 7) => { const m = siege.mission(seq(seed)); director.state.mission = m; m.objectives.forEach((o) => { o.object = o.model(); o.pos = new THREE.Vector3(o.site.x, o.site.y, o.site.z); }); G.game.run.relays = m.objectives.map((o) => ({ o, cut: false })); siege.reset(); return m; };
  const cut = (n) => { for (let i = 0; i < n; i++) G.game.run.relays.find((r) => !r.cut).cut = true; };
  const run = (secs, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { G.time.frame++; each?.(); siege.update(1 / 30); for (const q of [...z.ctx.list]) q._update(1 / 30); } };
  return { ...z, siege, director, flow, msgs, store, heli, begin, cut, run, supplies, thrown };
}

test('任务的样子：九个目标一个一个放（后面的锁着）；撤离点先关着、直升机停在公寓楼顶；开局步枪没子弹、换成手枪；原游戏自己的巡逻和增援停掉，关掉模式再还原', () => {
  const { G, siege, director, flow, begin, store } = sworld();
  assert.equal(siege.enabled, true);
  const m = begin();
  assert.equal(m.type, 'siege'); assert.equal(m.objectives.length, m.plan.stages.length); assert.equal(m.plan.stages.length, 23); assert.deepEqual(m.objectives.map((o) => !!o.locked), m.objectives.map((o, i) => i !== 0));
  const x = m.extraction; assert.equal(x.id, 'heli'); assert.equal(x.floor, 'A-RF'); assert.equal(x.closed, true); assert.equal(x.vehicle, SIEGE.pad);
  assert.ok(Math.hypot(x.x - SIEGE.pad.x, x.z - SIEGE.pad.z) < 6 && Math.hypot(x.x - SIEGE.pad.x, x.z - SIEGE.pad.z) > 1, '登机门在机身旁边');
  assert.ok(x.flight.poseAt && x.ride.spawns && x.ride.targets && x.ride.onBoard && x.orbit.center);
  assert.equal(G.rifle.ammo, 30, '原游戏重置武器在后面，这时还没改'); siege.update(1 / 30);
  assert.equal(G.rifle.ammo, 0); assert.equal(G.rifle.reserve, 0); assert.equal(G.weapon.picked, 'knife', '开局只有刀'); assert.deepEqual(G.weapon.locked, ['pistol', 'rifle']);
  assert.equal(director.vehicles.heli.root.visible, false, '直升机还没来');
  assert.deepEqual(flow.patrol, { gull: 0, hound: 0, soldier: 0 }); assert.equal(flow.pursuitExtra, 0);
  assert.match(G.liftAllow({ id: 'A-ST1' }, 'A-1F', 'A-3F'), /停电/); assert.equal(typeof G.stairBlock, 'function');
  assert.equal(m.text({ allCut: false }), m.plan.stages[0].hud); assert.ok(m.plan.stages[m.plan.stageOf('tool0')].site.unit, '住户房间带着户号（路线指引靠它找门）');
  assert.equal(m.radio.cut.length, m.plan.stages.length - 1);
  // 关掉
  siege.enabled = false; assert.equal(store.get('jimao-siege'), '0'); siege.reset();
  assert.deepEqual(flow.patrol, { soldier: 8 }); assert.equal(flow.pursuitExtra, 5); assert.equal(G.liftAllow, null); assert.equal(G.stairBlock, null);
});

test('一步步来：开了武器柜步枪才有子弹；每完成一步放出下一步；解决一道关，挡路的大件挪开；点了信号弹开始守屋顶', () => {
  const { G, siege, begin, cut, run } = sworld();
  const m = begin(), S = siege.state, at = m.plan.stageOf; siege.prepareFloors();
  run(0.1); assert.equal(S.stage, 0);
  cut(at('pistol') + 1); run(0.1); assert.equal(S.stage, at('pistol') + 1); assert.equal(G.weapon.picked, 'pistol', '二层捡到手枪'); assert.equal(G.rifle.ammo, 0); assert.deepEqual(G.weapon.locked, ['rifle']);
  cut(at('arms') - at('pistol')); run(0.1);
  assert.equal(S.stage, at('arms') + 1); assert.equal(G.rifle.ammo, SIEGE.ammo.rifle); assert.equal(G.rifle.reserve, SIEGE.ammo.reserve); assert.equal(G.weapon.picked, 'rifle');
  assert.deepEqual(m.objectives.map((o) => !!o.locked), m.objectives.map((o, i) => i !== at('arms') + 1));
  cut(2); run(0.1); assert.equal(S.stage, at('power') + 1); assert.ok(S.noise > 60, '拉闸动静很大'); assert.equal(G.liftAllow({ id: 'A-ST1' }, 'A-B1', `A-${m.plan.gates[0].n}F`), null);
  const g0 = m.plan.gates[0]; assert.match(G.stairBlock(runs.find((r) => r.id === g0.runs[1]), 'up'), /先找/); assert.equal(G.stairBlock(runs.find((r) => r.id === g0.runs[1]), 'down'), null);
  cut(2); run(1); assert.equal(S.stage, at('power') + 3); assert.ok(g0.block.children[0].position.lengthSq() > 0.5 || g0.block.children[0].scale.x < 0.5 || !g0.block.children[0].visible, '第一道关的大件挪开了');
  // 改过：关卡解决了，第一道关那层（合闸后就摆满了）还没清干净，所以换成「楼梯口还有丧尸」（逐层破楼，见下面爬楼的几个测试）
  assert.match(G.stairBlock(runs.find((r) => r.id === g0.runs[0]), 'up'), /^楼梯口还有丧尸/, '关卡那句没了，换成这一层还没清干净');
  cut(4); run(0.1); assert.equal(S.stage, m.plan.stages.length - 1); assert.equal(S.hold, -1);
  cut(1); run(0.1); assert.equal(S.stage, m.plan.stages.length); assert.ok(S.hold >= 0, '信号弹点着了，开始守');
  assert.equal(m.text({ allCut: true }), '守住屋顶，等直升机');
});

// 改过：以前「解决以后能走」是关卡一解决就放行。现在第一道关那层（爬楼的第一层）也摆着一群丧尸，关卡解决了还得把这层清干净（逐层破楼）才放行
test('被堵的楼梯走不上去：人踏进那一段就退回原地、给一句提示；关卡解决了、这一层的丧尸还在也不让上（还剩几只），清干净（剩两只都离得远也算）才能走', () => {
  const { G, siege, player, msgs, begin, cut, run, zombies } = sworld();
  const m = begin(); siege.prepareFloors(); cut(m.plan.powerStage + 1); run(0.1);
  const g0 = m.plan.gates[0], r = runs.find((x) => x.id === g0.runs[0]);
  player.pos.set(r.a.x, r.a.y, r.a.z); run(0.1); const safe = player.pos.clone();
  const stair = () => player.pos.set(r.ea.x + r.da.x * 1.2, r.ea.y + 0.5, r.ea.z + r.da.z * 1.2); // 走上第一段梯
  stair(); assert.ok(landAt(nav, player.pos.x, player.pos.z, player.pos.y + 0.6)?.slope, '这一点在梯段上');
  run(0.1); assert.ok(player.pos.distanceTo(safe) < 1e-6, '被推回来'); assert.match(msgs.at(-1), /先找/);
  const seeded = () => zombies.alive().filter((z) => z.seed === g0.floor);
  assert.ok(seeded().length >= SIEGE.floors.A.corridor, `第一道关那层合闸后就摆好了 ${seeded().length} 只`);
  cut(2); run(0.1); siege.state.tellT = 0;
  stair(); run(0.1); assert.ok(player.pos.distanceTo(safe) < 0.5, '关卡解决了，这层的丧尸还在：照样推回来');
  assert.match(msgs.at(-1), /楼梯口还有丧尸——先把这层清干净（还剩 \d+ 只）/);
  assert.match(G.stairBlock(r, 'up'), /还剩/, '快速上楼也不行'); assert.equal(G.stairBlock(r, 'down'), null, '往下照走');
  assert.match(m.text({ allCut: false }), /清理 \d+F：还剩 \d+ 只/, '屏幕上的目标写着还剩几只');
  // 打到只剩两只、都离上楼梯口 15 米以外：放行
  const far = seeded().sort((a, b) => Math.hypot(b.pos.x - r.a.x, b.pos.z - r.a.z) - Math.hypot(a.pos.x - r.a.x, a.pos.z - r.a.z)).slice(0, 2);
  assert.ok(far.every((z) => Math.hypot(z.pos.x - r.a.x, z.pos.z - r.a.z) > SIEGE.floors.clearNear), '最远的两只在 15 米外');
  for (const z of seeded()) if (!far.includes(z)) z.damage(9999, null, null, 'body');
  for (const z of far) { z.passive = true; z.zs = 'idle'; z.hunt = false; } // 别让它们这会儿凑过来
  player.pos.set(r.a.x, r.a.y, r.a.z); run(0.1);
  stair(); const on = player.pos.clone(); run(0.1);
  assert.ok(player.pos.distanceTo(on) < 1e-6, '清干净了不拦'); assert.equal(G.stairBlock(r, 'up'), null);
  assert.doesNotMatch(m.text({ allCut: false }), /清理/);
});

// ---- 爬楼：每层一群，逐层破楼（用户：「住宅楼和公寓里完全没有敌人……希望每一层都有好多个敌人，逐层去破楼」）----
const inPolys = (lv, x, z) => lv.units.some((u) => (u.polys || []).some((p) => pointInPoly([x, z], p)));
test('爬楼的落点：走廊、楼梯口、住户家里，每一点都真走得到这层的楼梯口（从这一点往外找）；走廊的点不在任何一户里；出不来的户、复式上层不放；公寓各层共用一份', () => {
  const pf = createPathfinder(nav);
  for (const [T, floor] of [[TOWERS.A, 'A-7F'], [TOWERS.T1, 'T1-12F'], [TOWERS.T1, 'T1-15F']]) {
    const sp = floorSpots(L, nav, runs, T, floor), lv = L.levels.find((l) => l.id === floor), y = elev(floor), r = runs.find((q) => q.id === sp.up[0]);
    const goal = { floor, x: r.a.x, z: r.a.z, y, slope: null };
    assert.ok(sp.landing.length >= 1, `${floor} 楼梯口 ${sp.landing.length} 处`);
    for (const q of sp.corridor) assert.ok(!inPolys(lv, q.x, q.z), `${floor} 走廊的点 (${q.x}, ${q.z}) 不在住户家里`);
    for (const f of sp.flats) {
      const u = lv.units.find((x) => x.id === f.unit); assert.ok(u.wfronts.length && u.residence?.level !== 'upper', `${f.name} 这一层有门`);
      for (const q of f.spots) assert.ok(pointInPoly([q.x, q.z], u.polys[0]), `${f.name} 的点在户里`);
    }
    for (const q of [...sp.corridor, ...sp.landing, ...sp.flats.flatMap((f) => f.spots)]) {
      const s = landAt(nav, q.x, q.z, y + 0.6); assert.ok(s && s.floor === floor && clear(nav, s), `${floor} (${q.x.toFixed(1)}, ${q.z.toFixed(1)}) 站得住、就在这一层`);
      assert.ok(pf.findNow({ floor, x: q.x, z: q.z, y, slope: null }, goal), `${floor} (${q.x.toFixed(1)}, ${q.z.toFixed(1)}) 走得到楼梯口`);
    }
  }
  const a7 = floorSpots(L, nav, runs, TOWERS.A, 'A-7F');
  assert.ok(a7.corridor.length >= 60, `公寓走廊 ${a7.corridor.length} 处`);
  assert.ok(a7.flats.length >= 3 && a7.flats.length < 10, `公寓 10 户里有几户的门口被玄关家具卡住、出不来：只放走得出来的 ${a7.flats.length} 户`);
  assert.equal(floorSpots(L, nav, runs, TOWERS.A, 'A-12F').corridor, a7.corridor, '公寓 3F–19F 一模一样：只算一次');
  const t12 = floorSpots(L, nav, runs, TOWERS.T1, 'T1-12F'), t15 = floorSpots(L, nav, runs, TOWERS.T1, 'T1-15F');
  assert.ok(t12.flats.length === 2 && t12.flats.every((f) => f.spots.length >= 3), '北区平层：两户都放得下');
  assert.deepEqual(t15.flats.map((f) => f.name), ['15–16E 室'], '北区 15F：西户是 14–15W 复式的上层（门在 14F），不放');
});

function climbWorld(tower = 'A', seed = 7) {
  const w = sworld({ tower }), m = w.begin(seed); w.siege.prepareFloors();
  const P = m.plan, list = climbFloors(P, nav), T = P.tower;
  w.cut(P.stageOf('tool1')); w.run(0.1); // 第一道关解决了：往上全走楼梯
  for (const z of w.zombies.alive()) z._deactivate(); // 商场段招来的先清掉，只看楼里的
  // 从楼下那一层走楼梯上来，站在这一层的楼梯口
  const arrive = (f) => { const r = runs.find((q) => q.to === f && q.id.startsWith(T.stair)); w.player.pos.set(r.b.x, r.b.y, r.b.z); return r; };
  const onFloor = (f) => w.zombies.alive().filter((z) => landAt(nav, z.pos.x, z.pos.z, z.pos.y + 0.6)?.floor === f);
  return { ...w, m, P, list, T, arrive, onFloor };
}
// 改过：以前每层都摆满一群（公寓 10 只以上、北区 6 只以上）。现在只有关卡那几层摆满、非清不可，中间的楼层（list[1]）按 pass 摆少一点（少一只也算：有的点放不下）
const passN = (t) => { const P = SIEGE.floors[t].pass; return P.corridor + P.landing + P.flats; };
for (const [tower, least] of [['A', passN('A') - 1], ['T1', passN('T1') - 1]]) test(`爬楼（${tower === 'A' ? '公寓' : '北区 1 号楼'}）：人上到中间的一层，两秒内那一层就有 ${least} 只以上（公寓：人到了才在离人十米外、看不见的地方冒出来；北区电梯厅太小：人还在下一层就整层摆好），上一层先摆着几只；同一高度的别的楼层一只都没有；摆出来的都走得到人跟前`, () => {
  const { G, zombies, player, run, list, arrive, onFloor, siege } = climbWorld(tower), f1 = list[1], y1 = elev(f1);
  if (tower === 'T1') { arrive(list[0]); run(0.5); assert.ok(onFloor(f1).length >= least, `人还在 ${list[0]}，${f1} 已经摆好 ${onFloor(f1).length} 只`); }
  arrive(f1); const first = new Map(), eye = new THREE.Vector3(), pre = new Set(zombies.alive());
  run(2, () => { eye.set(player.pos.x, player.pos.y + 1.5, player.pos.z); for (const z of zombies.alive()) if (z.seed === f1 && !first.has(z) && !pre.has(z)) first.set(z, { d: z.pos.distanceTo(player.pos), seen: G.physics.lineOfSight(eye, new THREE.Vector3(z.pos.x, z.pos.y + 1.5, z.pos.z)) }); });
  const here = onFloor(f1);
  assert.ok(here.length >= least, `${f1} 上有 ${here.length} 只`);
  const own = [...first.values()];
  if (tower === 'A') assert.ok(own.length >= least, `人到了才摆的 ${own.length} 只`);
  assert.ok(own.every((q) => q.d >= SIEGE.floors.near - 0.5), `人在这一层时摆的离人都在十米外：${own.map((q) => q.d.toFixed(0))}`);
  assert.ok(own.filter((q) => !q.seen).length >= own.length - 1, '几乎都在看不见的地方冒出来');
  const band = zombies.alive().filter((z) => Math.abs(z.pos.y - y1) < 1.5);
  assert.ok(band.every((z) => landAt(nav, z.pos.x, z.pos.z, z.pos.y + 0.6)?.floor === f1), `同一高度上的都在这栋楼的 ${f1}：${band.map((z) => landAt(nav, z.pos.x, z.pos.z, z.pos.y + 0.6)?.floor)}`);
  assert.ok(zombies.alive().filter((z) => z.seed === list[2]).length >= 1 + SIEGE.floors.ahead.landing, `上一层 ${list[2]} 先摆着几只`);
  const pf = createPathfinder(nav), to = { floor: f1, x: player.pos.x, z: player.pos.z, y: y1, slope: null };
  for (const z of here.slice(0, 6)) { const s = landAt(nav, z.pos.x, z.pos.z, z.pos.y + 0.6); assert.ok(pf.findNow({ ...s, slope: null }, to), `(${z.pos.x.toFixed(1)}, ${z.pos.z.toFixed(1)}) 走得到人跟前`); }
  assert.ok(siege.state.seeded.get(f1)?.done, '这一层摆完了');
});

test('爬楼：上去两层以后，下面那层没在追人的收回池子；摆过的层再回去也不再摆；每隔两层楼梯口有弹匣、四层有医疗包', () => {
  const { zombies, player, run, list, arrive, siege, supplies } = climbWorld('A'), [, f1, f2, f3, f4] = list;
  arrive(f1); run(2);
  const mine = () => zombies.alive().filter((z) => z.seed === f1 && !z.hunt);
  assert.ok(mine().length >= passN('A') - 1);
  arrive(f2); run(1); assert.ok(mine().length >= 1, '只上了一层：下面那层的还在');
  arrive(f3); run(12); // 发现过人的那几只跟丢了才回去发呆，发呆的才收
  assert.equal(mine().length, 0, `下面两层的收回去了（还剩 ${mine().length}）`); assert.ok(siege.state.seeded.has(f1));
  arrive(f1); run(3); assert.equal(mine().length, 0, '摆过的层不再摆');
  const at = (f, kind) => supplies.drops.some((d) => d.kind === kind && Math.abs(d.pos.y - elev(f)) < 0.5);
  assert.ok(at(f2, 'ammo') && !at(f1, 'ammo') && !at(f3, 'ammo'), '第二层楼梯口有弹匣');
  arrive(f4); run(0.5); assert.ok(at(f4, 'ammo') && at(f4, 'medkit'), '第四层有弹匣和医疗包');
  void player;
});

test('爬楼时的池子：尸体也算占位置；尸潮最多 8 只、从这层和上下两层的楼梯口涌出来，只叫醒这一层的（上一层摆着的不认定人）；零零散散的补充不补；一分钟里加起来不超过池子', () => {
  const { enemies, zombies, run, list, arrive, siege, player } = climbWorld('A'), f1 = list[1];
  const log = [], orig = enemies.spawn; enemies.spawn = (t, pos, opts) => { const z = orig.call(enemies, t, pos, opts); if (z) log.push({ opts: { ...opts }, y: pos.y }); return z; };
  arrive(f1); run(2);
  log.length = 0; const made = siege.horde(20);
  assert.ok(made >= 4 && made <= SIEGE.floors.horde, `爬楼时的尸潮 ${made} 只`);
  const ys = [f1, list[0], list[2]].map(elev);
  assert.ok(log.every((q) => ys.some((y) => Math.abs(q.y - y) < 0.5)), '这一层和上下两层');
  assert.ok(zombies.alive().filter((z) => z.seed === list[2]).every((z) => !z.hunt), '上一层摆着的没被叫醒');
  let worst = 0; log.length = 0;
  run(60, () => { const a = zombies.pool.filter((z) => z.active).length; worst = Math.max(worst, a); });
  assert.ok(worst <= ZOMBIE.pool, `活的加尸体最多 ${worst}`);
  assert.equal(log.filter((q) => !q.opts.seed && !q.opts.hunt).length, 0, '爬楼的楼层不零零散散地补');
  // 池子快满了：尸潮按真空着的位置放
  const fill = []; for (const z of zombies.pool) if (!z.active && fill.length < 60) { enemies.spawn('zombie', new THREE.Vector3(player.pos.x + 30, player.pos.y, player.pos.z), { kind: 'walker', passive: true }); fill.push(z); }
  const free = zombies.pool.filter((z) => !z.active).length; assert.ok(free <= SIEGE.floors.hordeReserve);
  assert.equal(siege.horde(8), 0, '池子满了不硬塞');
});

test('读档（第一道关的安全点）：爬楼摆的先收回去，安全点那层算打过了（不再摆、不拦楼梯），上面那层重新摆、不会摆两遍', () => {
  const { G, siege, zombies, director, player, run, list, arrive, P } = climbWorld('A'), [f0, f1] = list;
  arrive(f1); run(2); assert.ok(zombies.alive().filter((z) => z.seed === f1).length >= passN('A') - 1);
  const c = director.state.checkpoint; assert.ok(c && c.stage === P.stageOf('gate0') + 1, '第一道关是安全点');
  director.state.restore = c; director.state.checkpoint = null; G.game.run.relays.forEach((r) => { r.cut = false; });
  siege.reset();
  assert.equal(zombies.pool.filter((z) => z.active && z.seed).length, 0, '摆的先收回去');
  assert.ok(siege.state.seeded.get(f0)?.passed && !siege.state.seeded.has(f1));
  G.game.run.relays.forEach((r, i) => { r.cut = i < c.stage; }); director.state.restore = false; // 任务系统把存档点之前的目标补上
  const gate = P.stages[P.stageOf('gate0')].site; player.pos.set(gate.x, gate.y, gate.z); run(1);
  assert.equal(zombies.alive().filter((z) => z.seed === f0).length, 0, '安全点那层不再摆');
  const up = runs.find((r) => r.from === f0 && r.id.startsWith('A-ST')); assert.equal(G.stairBlock(up, 'up'), null, '安全点那层不拦楼梯');
  arrive(f1); run(2);
  const n = zombies.alive().filter((z) => z.seed === f1).length;
  assert.ok(n >= passN('A') - 1 && n <= passN('A'), `${f1} 重新摆了 ${n} 只（不是两遍）`);
});

test('回收困住的：追人的丧尸连着几次找不到去人那儿的路（困在出不来的户里），人看不见时收回池子', () => {
  const { G, enemies, zombies, player, run, siege } = climbWorld('A'), floor = 'A-3F', y = elev(floor), lv = L.levels.find((l) => l.id === floor);
  // A-3F（第一道关下面，不爬）：找一户走不出来的。游戏里丧尸用分帧寻路（pathfinder.js），这里接一个当场算完的
  const pf = createPathfinder(nav), lob = lobbySpot(nav, nav.links.find((l) => l.id === 'A-ST1'), floor);
  G.physics.pathfinder = { request: (a, b, cb) => { cb(pf.findNow(a, b)); return { cancel() {} }; } };
  const trap = unitSites(L, nav, floor).flatMap((s) => s.spots).find((q) => !pf.findNow({ floor, x: q.x, z: q.z, y, slope: null }, { ...lob, slope: null }));
  assert.ok(trap, 'A-3F 有出不来的户'); assert.ok(inPolys(lv, trap.x, trap.z));
  player.pos.set(lob.x, y, lob.z);
  const z = enemies.spawn('zombie', new THREE.Vector3(trap.x, y, trap.z), { kind: 'walker', hunt: true });
  run(4); assert.ok(z.active && z.noPath >= 1, '一时找不到路还不收');
  let gone = false; run(10, () => { gone ||= !z.active; }); // 收回去以后这一只可能马上被别处放出来再用，所以只看收没收过
  assert.ok(gone, '困住的收回去了');
  void zombies; void siege;
});

// ---- 爬楼第二轮（复查发现的）：楼梯上被定住、北区的楼层人还没到就空了、补给丢了、楼梯上不来尸潮、电梯抢了楼梯的键、安全点那句话 ----
const flightAt = (r, k, at) => { const s = nav.slopeById.get(r.slopes[k]), [x, z] = toW(s.F, s.len * at, 0); return landAt(nav, x, z, s.y0 + (s.y1 - s.y0) * at + 0.6); };
const landingMid = (r) => { const F = nav.floors.get(r.landings[0]), b = F.pieces[0].bb; return { x: (b.x0 + b.x1) / 2, y: F.y, z: (b.z0 + b.z1) / 2 }; };
const syncPaths = (G) => { const pf = createPathfinder(nav); G.physics.pathfinder = { request: (a, b, cb) => { cb(pf.findNow(a, b)); return { cancel() {} }; } }; return pf; };

// 以前每一帧都重新判这一层清没清干净、把人拽回上一帧的位置：走到一半有一只凑到楼梯口，人就被定在楼梯上，上不去也下不来（边挨咬边动不了）
test('爬楼的规则只在人从这一层踏上楼梯的那一下定：放行了，走到休息平台上这一层又凑过来一只，往上往下都照走；回到楼面再踏上去才拦，拦住的退回这一层的楼面上（不是梯段上）', () => {
  const { G, zombies, player, run, list, arrive, siege, enemies, msgs, T } = climbWorld('A'), f1 = list[0], y1 = elev(f1); // 关卡那层（中间的楼层不拦，见下一条）
  arrive(f1); run(2);
  const r = runs.find((q) => q.from === f1 && q.id.startsWith(T.stair));
  for (const z of zombies.alive()) if (z.seed === f1) z.damage(9999, null, null, 'body');
  run(0.2); assert.equal(siege.climbRule(r), null, '这一层清干净了');
  player.pos.set(r.a.x, r.a.y, r.a.z); run(0.1);
  const p1 = flightAt(r, 0, 0.5); player.pos.set(p1.x, p1.y, p1.z); run(0.1);
  assert.ok(Math.hypot(player.pos.x - p1.x, player.pos.z - p1.z) < 1e-6, '踏上去了');
  const mid = landingMid(r); player.pos.set(mid.x, mid.y, mid.z); run(0.1);
  // 人在休息平台上，这一层凑过来一只（楼梯口十来米）：按规则这一层又没清干净了
  const spot = siege.state.spots.get(f1).corridor.find((q) => { const d = Math.hypot(q.x - r.a.x, q.z - r.a.z); return d > 8 && d < 14; });
  const z = enemies.spawn('zombie', new THREE.Vector3(spot.x, y1, spot.z), { kind: 'walker', passive: true }); z.seed = f1;
  assert.match(siege.climbRule(r), /还剩 1 只/);
  const last = r.slopes.length - 1;
  for (const [k, at] of [[0, 0.7], [0, 0.35], [last, 0.3], [last, 0.7]]) {
    const q = flightAt(r, k, at); player.pos.set(q.x, q.y, q.z); run(1 / 30);
    assert.ok(Math.hypot(player.pos.x - q.x, player.pos.z - q.z) < 1e-6, `走在楼梯上（第 ${k + 1} 段的 ${at}）没被拽回去`);
  }
  // 下到楼面，再踏上去：这回拦，退回楼面上
  player.pos.set(r.a.x, r.a.y, r.a.z); run(0.1); siege.state.tellT = 0;
  const q = flightAt(r, 0, 0.3); player.pos.set(q.x, q.y, q.z); run(1 / 30);
  const st = landAt(nav, player.pos.x, player.pos.z, player.pos.y + 0.6);
  assert.ok(st && !st.slope && st.floor === f1, `退回 ${f1} 的楼面上（${st?.floor} ${st?.slope?.id || ''}）`);
  assert.match(msgs.at(-1), /楼梯口还有丧尸/); assert.equal(G.stairBlock(r, 'down'), null, '往下照走');
});

test('人站在楼梯的梯段上：寻路去这段梯离人近的那一头（以前梯段上的一点永远找不到路），追人的不算「找不到路」、不会被回收，照样扑得上来', () => {
  const { G, zombies, player, run, list, arrive, enemies, T, hurt } = climbWorld('A'), f1 = list[1], y1 = elev(f1);
  syncPaths(G); arrive(f1); run(1); for (const z of zombies.alive()) z._deactivate();
  const r = runs.find((q) => q.from === f1 && q.id.startsWith(T.stair)), at = flightAt(r, 0, 0.6), P = new THREE.Vector3(at.x, at.y, at.z);
  const sp = floorSpots(L, nav, runs, T, f1), spots = [...sp.corridor, ...sp.flats.flatMap((x) => x.spots)];
  assert.ok(at.slope, '这一点在梯段上');
  const from = spots.find((q) => Math.hypot(q.x - r.a.x, q.z - r.a.z) > 12);
  let got = null, why = 'none';
  G.physics.nav.requestPath(new THREE.Vector3(from.x, y1, from.z), P, (p, w) => { got = p; why = w; });
  assert.ok(got && got.length >= 2, `找得到路（${why}）`);
  const end = got.at(-1); assert.ok(Math.hypot(end.x - at.x, end.z - at.z) < 3 && Math.abs(end.y - at.y) < 1.2, `路的终点在这段梯的一头（离人 ${Math.hypot(end.x - at.x, end.z - at.z).toFixed(1)} 米）`);
  const zs = spots.filter((q) => Math.hypot(q.x - P.x, q.z - P.z) > 8).slice(0, 3).map((q) => enemies.spawn('zombie', new THREE.Vector3(q.x, y1, q.z), { kind: 'walker', hunt: true, state: 'alert' }));
  let worst = 0, best = Infinity;
  run(15, () => { player.pos.copy(P); for (const z of zs) { worst = Math.max(worst, z.noPath || 0); best = Math.min(best, z.pos.distanceTo(P)); } });
  assert.equal(worst, 0, '一次都没算成找不到路'); assert.ok(zs.every((z) => z.active), '一只都没被回收');
  assert.ok(best < 2.5 || hurt.length > 0, `扑上来了（最近 ${best.toFixed(1)} 米，咬了 ${hurt.length} 下）`);
});

test('爬楼摆的困住了、追不上的（人看不见）：那一层还没打过就不收走，换到那一层别处看不见的地方站好、不追人（一只不少）；打过的那几层照样收', () => {
  const { G, zombies, player, run, list, arrive, siege } = climbWorld('T1'), [f0, f1] = list;
  arrive(f0); run(0.5); arrive(f1); run(1);
  const seeded = (f) => zombies.alive().filter((z) => z.seed === f), n = seeded(f1).length; assert.ok(n >= 6, `${f1} 摆了 ${n} 只`);
  const eye = () => new THREE.Vector3(player.pos.x, player.pos.y + 1.5, player.pos.z), hid = (q) => !G.physics.lineOfSight(eye(), new THREE.Vector3(q.pos.x, q.pos.y + 1.5, q.pos.z));
  const stuck = (z) => { z.hunt = true; z.zs = 'chase'; z.noPath = 5; z.planT = 99; }; // 连着几次找不到路（这 0.6 秒里不再重新找）
  const z = seeded(f1).find(hid); assert.ok(z, '有一只在看不见的地方'); stuck(z); run(0.6);
  assert.equal(seeded(f1).length, n, '一只没少');
  const log = siege.state.recycleLog.at(-1); assert.ok(log && log.seed === f1 && log.moved, `换了地方：${JSON.stringify(log)}`);
  assert.ok(seeded(f1).filter((q) => q.hunt).length === 0, '换了地方的不追人');
  assert.ok(seeded(f1).every((q) => Math.abs(q.pos.y - elev(f1)) < 0.5), '还在自己那一层');
  // f0 已经打过了（人上到了 f1）：f0 剩下的困住了就收走
  const left = seeded(f0).filter(hid); assert.ok(left.length >= 1, `${f0} 还剩看不见的 ${left.length} 只`);
  const m = seeded(f0).length; stuck(left[0]); run(0.6);
  assert.equal(seeded(f0).length, m - 1, '打过的那层：收走'); assert.equal(siege.state.recycleLog.at(-1).moved, false);
});

test('北区：人在下一层开枪，上一层先摆好的那一群最多下来两只，其余守在自己那层；人上去时那一群少了一大截（回收、走丢）就补回来，打死的不补', () => {
  {
    const { G, zombies, run, list, arrive, siege } = climbWorld('T1'), [f0, f1] = list;
    syncPaths(G); arrive(f0); run(0.5);
    const mine = () => zombies.alive().filter((z) => z.seed === f1), home = () => mine().filter((z) => Math.abs(z.pos.y - elev(f1)) < 1.2);
    const n = mine().length; assert.ok(n >= 6);
    run(10, () => { if (G.time.frame % 6 === 0) siege.addNoise(7); }); // 一直在开枪
    assert.ok(home().length >= n - SIEGE.floors.down, `${f1} 的 ${n} 只还有 ${home().length} 只在自己那层`);
    // 被回收了一大截：人上去时补回来（离人十米外、看不见的地方）
    const before = mine().length; for (const z of mine().slice(0, 5)) z._deactivate();
    arrive(f1); run(2.5);
    assert.ok(mine().length >= Math.min(before, Math.ceil(n * SIEGE.floors.refill)), `补回来了：${before} → 丢了 5 只 → ${mine().length}`);
    assert.ok(siege.state.refilled >= 1);
  }
  {
    const { zombies, run, list, arrive, siege } = climbWorld('T1'), [f0, f1] = list;
    arrive(f0); run(0.5);
    const mine = () => zombies.alive().filter((z) => z.seed === f1), n = mine().length, r0 = siege.state.refilled || 0;
    for (const z of mine().slice(0, 5)) z.damage(9999, null, null, 'body');
    run(0.2); arrive(f1); run(2.5);
    assert.equal(mine().length, n - 5, '打死的不补'); assert.equal(siege.state.refilled || 0, r0);
  }
});

test('北区爬楼的补给：第一道关抽到 9F、10F、11F 都一样，每隔两层的弹匣、四层的医疗包一个不少（15F 往上的复式层只有一头有楼梯口落点，以前那几层的悄悄没放）', () => {
  const probe = sworld({ tower: 'T1' }), seeds = new Map();
  for (let s = 1; s < 200 && seeds.size < 3; s++) { const n = probe.siege.mission(seq(s)).plan.gates[0].n; if (!seeds.has(n)) seeds.set(n, s); }
  assert.deepEqual([...seeds.keys()].sort((a, b) => a - b), [9, 10, 11]);
  for (const [n, s] of seeds) {
    const { list, arrive, run, supplies, P, zombies } = climbWorld('T1', s), gates = new Set(P.gates.map((g) => g.floor)), miss = [];
    let want = 0;
    for (let i = 1; i < list.length; i++) {
      const f = list[i]; arrive(f); run(0.1); for (const z of zombies.alive()) z._deactivate();
      const kinds = gates.has(f) ? [] : [...(i % SIEGE.floors.ammo === 0 ? ['ammo'] : []), ...(i % SIEGE.floors.medkit === 0 ? ['medkit'] : [])];
      for (const k of kinds) { want++; if (!supplies.drops.some((d) => d.kind === k && Math.abs(d.pos.y - elev(f)) < 0.5)) miss.push(`${f} ${k}`); }
    }
    assert.ok(want >= 6, `第一道关 ${n}F：该放 ${want} 件`); assert.deepEqual(miss, [], `第一道关 ${n}F：没放的 ${miss}`);
  }
});

test('人在楼梯上（梯段、休息平台）时来的尸潮、巨尸照样出得来：从刚离开的那层和上下两层的楼梯口涌出来，不贴着人冒出来', () => {
  for (const tower of ['A', 'T1']) {
    const { zombies, player, run, list, arrive, siege, T } = climbWorld(tower), f = list[2];
    const r = arrive(f); run(1); // 从下面那层走上来的那段楼梯（下来不拦）：人停在梯段中间、休息平台上
    const a = flightAt(r, 0, 0.5);
    for (const P of [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(landingMid(r).x, landingMid(r).y, landingMid(r).z)]) {
      for (const q of zombies.alive()) if (!q.seed) q._deactivate();
      player.pos.copy(P); run(1 / 30); assert.ok(player.pos.distanceTo(P) < 1e-6, '人还在楼梯上');
      const before = new Set(zombies.alive()), made = siege.horde(8), fresh = zombies.alive().filter((q) => !before.has(q));
      assert.ok(made >= 4, `${tower} 楼梯上来了一波 ${made} 只`);
      assert.ok(fresh.every((q) => q.pos.distanceTo(P) >= 3.9), `离人都在四米外：${fresh.map((q) => q.pos.distanceTo(P).toFixed(1))}`);
      const b = siege.spawnBrute(); assert.ok(b, `${tower} 楼梯上来得了巨尸`); b._deactivate();
    }
  }
});

test('北区电梯厅：站在楼梯口、又在电梯口跟前时（爬楼的楼层电梯哪儿都去不了），Z / X 让给楼梯——楼梯牌亮着、电梯选层不弹；电梯去得了的时候照旧是电梯', async () => {
  const { createLiftControl, liftAt } = await import('../src/jimao/lift.js'), { createStairControl, STAIR } = await import('../src/jimao/stairs.js');
  const { G, player, list } = climbWorld('T1'), f = list[2], y = elev(f), lifts = nav.links.filter((l) => l.kind === 'lift' && l.stops?.length > 1);
  // 找一点：楼梯牌给得出来（离梯段口 2.6 米内），又在电梯口 2.4 米内
  let pt = null;
  for (const r of runs.filter((q) => q.from === f)) for (let dx = -2.4; dx <= 2.4 && !pt; dx += 0.3) for (let dz = -2.4; dz <= 2.4 && !pt; dz += 0.3) {
    const x = r.a.x + dx, z = r.a.z + dz, s = landAt(nav, x, z, y + 0.6);
    if (s && s.floor === f && !s.slope && Math.hypot(r.a.x - x, r.a.z - z, r.ea.y - y) < STAIR.reach - 0.2 && liftAt(lifts, f, x, z)) pt = { x, z };
  }
  assert.ok(pt, `${f} 有一处既在楼梯口又在电梯口`);
  let lift = null; const ref = { get near() { return lift?.near || null; }, get riding() { return !!lift?.riding; } };
  const stairs = createStairControl(G, { nav, runs, lift: ref, blocked: (r, d) => G.stairBlock?.(r, d) || null });
  lift = createLiftControl(G, { nav, layout: L, stairsHere: () => stairs.here() });
  const bare = createLiftControl(G, { nav, layout: L });
  player.pos.set(pt.x, y, pt.z);
  lift.update(0.3); bare.update(0.3); stairs.update(1 / 30);
  assert.ok(G.liftAllow(liftAt(lifts, f, pt.x, pt.z).link, f, list[0]), '爬楼的楼层电梯去不了');
  assert.ok(bare.near, '以前：电梯口抢了这一点（Z 弹出一个只会说「去不了」的选层）');
  assert.equal(lift.near, null, '让给楼梯'); assert.equal(stairs.near, true, '楼梯牌亮着'); assert.ok(stairs.options.up && stairs.options.down);
  // 电梯去得了（不在围城里）：照旧是电梯
  const allow = G.liftAllow; G.liftAllow = null;
  lift.update(0.3); stairs.update(1 / 30); assert.ok(lift.near, '电梯去得了就是电梯'); assert.equal(stairs.near, false);
  G.liftAllow = allow; stairs.dispose();
});

test('安全点那句「这儿暂时安全」：合闸 / 清完关卡时身边还有在追人的就先不说，身边清净两秒再说；一直打个不停，过一阵换一句不说「安全」的', () => {
  const { siege, begin, cut, run, player, msgs, enemies, zombies } = sworld();
  const m = begin(), P = m.plan; siege.prepareFloors();
  cut(P.stageOf('power')); run(0.1);
  const near = () => new THREE.Vector3(player.pos.x + 5, player.pos.y, player.pos.z);
  let z = null; const keep = () => { for (const q of zombies.alive()) if (q !== z) q._deactivate(); if (z) { z.pos.copy(near()); z.zs = 'chase'; z.cool = 9; } };
  z = enemies.spawn('zombie', near(), { kind: 'walker', hunt: true, state: 'alert' });
  const said = () => msgs.filter((t) => t.startsWith('R:这儿暂时安全')).length, other = () => msgs.filter((t) => t.startsWith('R:安全点记下了')).length;
  cut(1); run(3, keep);
  assert.ok(siege.state.stage > P.stageOf('power'), '合了闸'); assert.equal(said(), 0, '身边还有一只在追：先不说');
  z._deactivate(); z = null; run(1, keep); assert.equal(said(), 0, '清净了还不到两秒');
  run(1.5, keep); assert.equal(said(), 1, '清净两秒：说了');
  // 第一道关：一直有一只贴着，过了 20 秒换一句不说「安全」的
  cut(P.stageOf('gate0') + 1 - siege.state.stage); z = enemies.spawn('zombie', near(), { kind: 'walker', hunt: true, state: 'alert' });
  run(SIEGE.safeTalk.cap + 1, keep);
  assert.equal(said(), 1, '没再说「安全」'); assert.equal(other(), 1, '换了一句');
});

test('响动：开枪攒响动（手枪比步枪小），攒满来一波尸群（认定了人、不会跟丢），之后有冷却；安静下来慢慢回落；附近的丧尸听见枪声围过来', () => {
  const { G, siege, zombies, enemies, player, msgs, begin, run, ahead } = sworld();
  begin(); const S = siege.state; S.stage = S.plan.armsStage + 1; run(0.1); // 拿到步枪以后才有尸潮
  const z = enemies.spawn('zombie', ahead(20), { kind: 'walker', passive: true });
  G.events.emit('weapon:fire', { kind: 'pistol' }); assert.equal(S.noise, SIEGE.noise.pistol); assert.equal(z.zs, 'chase', '20 米内听见了');
  G.events.emit('weapon:fire', {}); assert.equal(S.noise, SIEGE.noise.pistol + SIEGE.noise.rifle);
  run(SIEGE.noise.quiet + 1); assert.ok(S.noise < SIEGE.noise.pistol + SIEGE.noise.rifle - 3, '安静了就回落');
  S.hordeCool = 0; for (let i = 0; i < 16; i++) G.events.emit('weapon:fire', {});
  // 响动满了：先预警三秒（提示「尸潮要来了」），到点才冲出来
  const before = zombies.alive().length; run(0.3);
  assert.ok(msgs.some((t) => /尸潮要来了/.test(t)), '先预警'); assert.equal(siege.pacing.phase, 'build'); assert.ok(siege.pacing.warning > 2);
  assert.ok(zombies.alive().filter((q) => q.hunt).length < 4, '预警的三秒里还没来');
  run(PACING.warn - 0.45); const early = new Set(zombies.alive()); run(0.35);
  const now = zombies.alive();
  assert.equal(siege.pacing.phase, 'peak');
  assert.ok(now.length >= before + 4, `尸潮来了 ${now.length - before} 只`); assert.ok(now.filter((q) => q.hunt).length >= 4); assert.ok(msgs.some((t) => /^尸潮！/.test(t)));
  assert.ok(S.noise <= SIEGE.noise.after + 1); assert.ok(S.hordeCool > 10);
  // 只看这一波刚冒出来的（之前被尖叫者招来的已经跑了好几秒，离得近不算）
  for (const q of now.filter((h) => h.hunt && !early.has(h))) assert.ok(Math.hypot(q.pos.x - player.pos.x, q.pos.z - player.pos.z) >= 12, '不在脸上冒出来（14 米外出生，这零点几秒里奔尸最多跑一米多）');
  // 手雷更响
  S.noise = 0; G.events.emit('grenade:explode', { pos: player.pos }); assert.equal(S.noise, SIEGE.noise.grenade);
});

test('守屋顶：一波波从楼梯口上来，倒计时走完直升机从天上降到停机位，落稳了才开放登机；登机后清扫——屋顶、阳台、楼下三处都出齐，全清掉就定下返航', () => {
  const { G, siege, zombies, director, heli, player, begin, cut, run } = sworld();
  const m = begin(); cut(m.plan.stages.length); run(0.1);
  for (const z of zombies.alive()) z._deactivate(); // 前面几步招来的先清掉，只看屋顶上的
  const S = siege.state, roof = elev(SIEGE.roof); player.pos.set(SIEGE.pad.x + 8, roof, SIEGE.pad.z + 3);
  run(4); const wave = zombies.alive().filter((z) => z.hunt);
  assert.ok(wave.length >= SIEGE.waveSize[0], `第一波 ${wave.length} 只`); for (const z of wave) assert.ok(Math.abs(z.pos.y - roof) < 0.5, '在屋顶上');
  assert.equal(director.opened, 0);
  S.hold = SIEGE.hold - 0.2; run(1);
  assert.ok(S.land >= 0 && heli.root.visible && heli.poses.length > 5); assert.ok(heli.poses[0].y > roof + 30 && heli.poses.at(-1).y < heli.poses[0].y, '从天上往下降');
  assert.equal(director.opened, 0, '还没落稳');
  run(SIEGE.land + 0.5); assert.equal(S.landed, true); assert.equal(director.opened, 1); assert.equal(heli.parked, true);
  assert.equal(m.text({ allCut: true }), '登机 · 公寓楼顶直升机');
  // 登机
  director.riding = true; m.extraction.ride.onBoard();
  const sw = S.sweep; assert.ok(sw);
  const U = SIEGE.sweep.surge, roof0 = sw.list.filter((z) => z.sweep === 'roof').length; // 屋顶：守屋顶剩下的 + 当场补到 start 只，其余从门里涌出来
  assert.ok(roof0 >= U.start && sw.total.roof === roof0 + sw.pour.left && sw.total.roof >= SIEGE.sweep.roof && sw.total.roof <= U.max, `屋顶 ${roof0} 只、一共 ${sw.total.roof}`);
  assert.equal(sw.list.filter((z) => z.sweep === 'window').length, SIEGE.sweep.window);
  assert.ok(sw.list.filter((z) => z.sweep === 'window').every((z) => z.fixed), '阳台上的钉在原地');
  let t = 0; const tick = (secs) => { for (let k = 0; k < secs * 30; k++) { t += 1 / 30; m.extraction.ride.spawns(1 / 30, t); } };
  tick(20); assert.ok(sw.screamer && sw.list.some((z) => z.kind === 'screamer' && z.sweep === 'roof' && !z.kept), '屋顶上有尖叫者（当场补的头一只，没补的话从门里头一个出来）');
  const half = sw.list.filter((z) => z.sweep === 'ground').length; assert.ok(half >= 5 && half <= SIEGE.sweep.ground / 2 + 1, `前半程楼下出来 ${half} 只`);
  t = m.extraction.flight.times.ground; tick(8); assert.equal(sw.made.ground, SIEGE.sweep.ground);
  assert.equal(sw.list.filter((z) => z.kind === 'screamer' && !z.kept).length, SIEGE.sweep.screamers, '新放的尖叫者一共三只（守屋顶剩下的不算）');
  assert.equal(m.extraction.ride.targets().length, sw.list.filter((z) => z.alive).length);
  assert.match(m.text({ allCut: true }, { kills: 0 }), new RegExp(`清扫 · 屋顶 0/${sw.total.roof} · 阳台 0/${SIEGE.sweep.window} · 楼下 0/${SIEGE.sweep.ground}`));
  assert.equal(sw.pour.left, 0, '降到低空以后屋顶上不再涌出来');
  // 打一只阳台上的：玻璃先碎
  const bz = sw.list.find((z) => z.sweep === 'window'); bz.damage(10, null, null, 'body');
  assert.equal(m.extraction.flight.leaving, false);
  for (const z of sw.list) if (z.alive) z.damage(9999, null, null, 'body');
  assert.match(m.text({ allCut: true }, { kills: 0 }), new RegExp(`屋顶 ${sw.total.roof}/${sw.total.roof} · 阳台 ${SIEGE.sweep.window}/${SIEGE.sweep.window}`));
  // 清完了：先问要不要炸楼（还不返航）；没选、时间到了才返航
  tick(0.2); assert.equal(siege.demo.offered, true, '清完先问炸不炸'); assert.equal(m.extraction.flight.leaving, false);
  assert.ok(m.extraction.ride.outroCam({ x: SIEGE.pad.x + 30, y: 90, z: SIEGE.pad.z }), '没选：机外镜头照旧架在楼顶边上');
  tick(DEMOLISH.offer + 0.5); assert.equal(siege.demo.offered, false); assert.equal(siege.demo.chosen, false);
  assert.equal(m.extraction.flight.leaving, true, '不炸：定下返航'); assert.ok(m.extraction.flight.duration() < t + 10);
  assert.equal(m.text({ allCut: true }, { kills: 0, over: true }), '清扫完毕 · 返航');
  const cam = m.extraction.ride.outroCam({ x: SIEGE.pad.x + 46, y: 50, z: SIEGE.pad.z }), A = L.buildings.find((b) => b.id === 'A');
  assert.ok(pointInPoly([cam.x, cam.z], A.outline) && Math.abs(cam.y - roof - 2.5) < 1e-6, '机外镜头架在公寓楼顶边上、比女儿墙高');
  assert.ok(cam.x > SIEGE.pad.x + 10, '靠直升机那一侧');
  assert.equal(m.extraction.ride.keep(), true); assert.equal(m.extraction.ride.ground({ x: SIEGE.pad.x, z: SIEGE.pad.z }), roof); assert.equal(m.extraction.ride.ground({ x: SIEGE.pad.x + 60, z: SIEGE.pad.z }), 0);
  void G;
});

// ---- 北区 1 号楼 ----
test('抽楼：公寓多、北区 1 号楼少，可以指定；北区那一局九步都站得住，三道关都在有住户可进的楼层，电梯厅 → 住户门口 / 楼梯口 / 停机位同层走得通', () => {
  const c = { A: 0, T1: 0 }; for (let i = 0; i < 1000; i++) c[pickTower(i / 1000).id]++;
  assert.ok(c.A > 550 && c.T1 > 250, JSON.stringify(c)); assert.equal(pickTower(0.1, 'T1'), TOWERS.T1); assert.equal(pickTower(0.99, 'A'), TOWERS.A);
  const T = TOWERS.T1, lift = nav.links.find((l) => l.id === T.lift), s = FPS_MISSION.spawn, start = { floor: s.floor, x: s.x, z: s.z, y: elev(s.floor), slope: null };
  for (const seed of [5, 77, 4321]) {
    const plan = siegePlan(seq(seed), L, nav, runs, T);
    assert.equal(plan.tower, T); assert.deepEqual(plan.stages.map((q) => q.kind), ['crank', 'shutter', 'crowbar', 'rescue', 'escort', 'pry', 'sneak', 'pistol', 'note', 'card', 'fuel', 'gen', 'open', 'locker', 'holdout', 'switch', 'tool', 'gate', 'tool', 'gate', 'tool', 'gate', 'flare']);
    for (const st of plan.stages) { const q = landAt(nav, st.site.x, st.site.z, st.site.y + 0.6); assert.ok(q && q.floor === st.floor && clear(nav, q), `${st.id}（${st.label}）站得住`); }
    assert.equal(plan.stages[plan.powerStage].floor, 'P1-B1'); assert.match(plan.stages[plan.powerStage].text, /北区 1 号楼停电/); assert.equal(plan.stages.at(-1).floor, 'T1-RF');
    plan.gates.forEach((g, i) => { const [lo, hi] = T.gates[i]; assert.ok(g.n >= lo && g.n <= hi && g.floor === `T1-${g.n}F` && g.runs.length === 2, `第 ${i + 1} 道关在 ${g.n}F`); });
    // 同一层里走得通
    const at = (site) => ({ floor: site.floor, x: site.x, z: site.z, y: site.y, slope: null });
    for (const g of plan.gates) {
      const lob = lobbySpot(nav, lift, g.floor); assert.ok(lob, `${g.n}F 电梯厅`);
      assert.ok(findPath(nav, { ...lob, slope: null }, at(plan.stages[g.stage].site)), `${g.n}F：电梯厅走得到关卡`);
      // 上一层：楼梯口走得到电梯厅（解决以后走一层楼梯，再坐电梯）
      const run = runs.find((r) => r.id === g.core), up = lobbySpot(nav, lift, run.to);
      assert.ok(up && findPath(nav, { floor: run.to, x: run.b.x, z: run.b.z, y: run.b.y, slope: null }, { ...up, slope: null }), `${g.n + 1}F：楼梯口走得到电梯厅`);
    }
    const roofLob = lobbySpot(nav, lift, 'T1-RF'); assert.ok(roofLob && findPath(nav, { ...roofLob, slope: null }, at(plan.stages.at(-1).site)), '屋顶：出电梯走得到信号弹');
    if (seed === 5) assert.ok(findPath(nav, start, at(plan.stages[plan.powerStage].site)), '从商场走得到北区 1 号楼的地下电梯厅');
    assert.match(liftRule(plan, 1, nav, 'T1-LF', 'P1-B1', 'T1-9F'), /北区 1 号楼停电/); assert.match(liftRule(plan, 1, nav, 'A-ST1', 'A-1F', 'A-3F'), /停电/, '别的楼的电梯一律不走');
    assert.equal(liftRule(plan, plan.powerStage + 1, nav, 'T1-ST-A', 'P1-B1', plan.gates[0].floor), null); assert.ok(liftRule(plan, plan.powerStage + 1, nav, 'T1-ST-A', 'P1-B1', `T1-${plan.gates[0].n + 1}F`));
  }
});

test('北区 1 号楼的停机位和航线：屋顶东头 6.5 米内是空地、登机门在屋面上；绕飞不撞楼（旁边 2 号楼隔着 14 米）；阳台挂在南北两面长墙外，楼下的全在商场屋面上', () => {
  const T = TOWERS.T1, y = elev(T.roof), pad = T.pad;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, q = landAt(nav, pad.x + Math.cos(a) * 6.5, pad.z + Math.sin(a) * 6.5, y + 0.6); assert.ok(q && q.floor === T.roof && clear(nav, q)); }
  const f = siegeFlight(pad, y, { box: flightBox(L, T) });
  { const B = L.buildings.find((b) => b.id === 'T2'), x1 = Math.max(...B.outline.map((q) => q[0])); assert.ok(f.box.x1 >= x1, '连旁边的 2 号楼一起绕'); }
  const tops = L.buildings.filter((b) => b.outline?.length).map((b) => ({ id: b.id, outline: b.outline, top: Math.max(...L.levels.filter((l) => l.building === b.id).map((l) => l.elev + (l.kind === 'roof' ? 3 : l.height || 4))) }));
  for (let t = 0; t < 150; t += 0.25) { const p = f.poseAt(t); if (p.phase !== 'lift') for (const b of tops) if (pointInPoly([p.x, p.z], b.outline)) assert.ok(p.y > b.top + 8, `t=${t} 在 ${b.id} 上空只高出 ${(p.y - b.top).toFixed(0)} 米`); }
  const bal = balconySpots(L, nav, 6, seq(5), T), B = L.buildings.find((b) => b.id === 'T1'), z0 = Math.min(...B.outline.map((p) => p[1])), z1 = Math.max(...B.outline.map((p) => p[1]));
  assert.equal(bal.length, 6); for (const q of bal) { assert.ok(q.z > z1 || q.z < z0, '在南北墙外'); assert.equal(q.nx, 0); assert.equal(Math.sign(q.nz), q.z > z1 ? 1 : -1); }
  const g = groundSpots(nav, L, 20, seq(5), T); assert.equal(g.length, 20); assert.ok(g.every((q) => q.where === 'mall' && Math.abs(q.y - elev('P1-RF')) < 0.5), '四周全是商场屋面');
});

test('北区那一局接到游戏上：撤离点在北区 1 号楼楼顶，电梯规则只管北区的电梯，机外镜头站在这栋楼的楼顶边上', () => {
  const { G, siege, begin } = sworld({ tower: 'T1' });
  const m = begin();
  assert.equal(m.plan.tower, TOWERS.T1); assert.equal(m.extraction.floor, 'T1-RF'); assert.equal(m.extraction.where, '北区 1 号楼楼顶'); assert.equal(m.extraction.vehicle, TOWERS.T1.pad);
  assert.match(m.radio.intro, /北区 1 号楼楼顶/); assert.match(G.liftAllow({ id: 'T1-LE' }, 'P1-1F', 'T1-8F'), /停电/); assert.match(G.liftAllow({ id: 'A-ST1' }, 'A-1F', 'A-8F'), /停电/);
  const cam = m.extraction.ride.outroCam({ x: -200, y: 60, z: -232 }), B = L.buildings.find((b) => b.id === 'T1');
  assert.ok(pointInPoly([cam.x, cam.z], B.outline) && Math.abs(cam.y - elev('T1-RF') - 2.5) < 1e-6);
  assert.equal(m.extraction.ride.ground({ x: TOWERS.T1.pad.x, y: 120, z: TOWERS.T1.pad.z }), elev('T1-RF')); { const q = groundSpots(nav, L, 1, seq(9), TOWERS.T1)[0]; assert.equal(m.extraction.ride.ground({ x: q.x, y: 60, z: q.z }), elev('P1-RF'), '掉在商场屋面上'); }
  void siege;
});

test('路线指引认得被锁的电梯：平时从公寓一层到十二层的路线是坐电梯；停电 / 分区锁着的时候这条路不再走那部电梯', () => {
  const pf = createPathfinder(nav), plan = siegePlan(seq(7), L, nav, runs), lift = nav.links.find((l) => l.id === 'A-ST1');
  const a = lobbySpot(nav, lift, 'A-1F'), b = lobbySpot(nav, lift, 'A-12F'), S = (q) => ({ ...q, slope: null });
  const free = pf.findNow(S(a), S(b), { lifts: true });
  assert.ok(free && free.some((q) => q.via === 'lift'), '没锁的时候坐电梯');
  // 第 2 步（已合闸）：电梯只能到第一道关那一层，12F 在它上面
  pf.setBlocked((c) => c.kind === 'lift' && !!liftRule(plan, plan.powerStage + 1, nav, c.link, c.from, c.to));
  const locked = pf.findNow(S(a), S(b), { lifts: true });
  if (locked) for (const q of locked.filter((x) => x.via === 'lift')) assert.ok(elev(q.to) <= elev(plan.gates[0].floor) + 0.1 || !String(q.to).startsWith('A-'), `路线里的电梯只到 ${q.to}`);
  const near = pf.findNow(S(a), S(lobbySpot(nav, lift, plan.gates[0].floor)), { lifts: true });
  assert.ok(near && near.some((q) => q.via === 'lift'), '到第一道关那层还是坐电梯');
  pf.setBlocked(null);
  assert.ok(pf.findNow(S(a), S(b), { lifts: true }).some((q) => q.via === 'lift' && q.to === 'A-12F'), '取消以后恢复');
});

test('回收再用的丧尸在活动列表里只有一份：尖叫者照样按对飞机的节奏叫（不会越回收越快、一秒一声把飞机叫下来）', () => {
  const { G, enemies, player, events, run, ahead } = zworld();
  // 刚起飞：飞机在人头顶 3 米，尖叫者在 9 米外、同一层、看得见人
  G.missions = { rideKind: 'helicopter', vehicleCenter: () => new THREE.Vector3(player.pos.x, player.pos.y + 3, player.pos.z) };
  // 这一只之前被回收过好几回（走远了收回池子、登机时清场，都是直接 _deactivate）
  for (let i = 0; i < 7; i++) enemies.spawn('zombie', ahead(9), { kind: 'walker' })._deactivate();
  const s = enemies.spawn('zombie', ahead(9), { kind: 'screamer', hunt: true });
  assert.equal(enemies.list.filter((z) => z === s).length, 1, '活动列表里只有一份');
  events.length = 0; run(30);
  const shots = events.filter(([n, e]) => n === 'enemy:fire' && e.scream && e.enemy === s);
  const K = KINDS.screamer.scream;
  assert.ok(shots.length >= 2, `30 秒里叫了 ${shots.length} 声`);
  assert.ok(shots.length <= Math.ceil((30 - K.heliFirst) / (K.heliEvery * 0.85)) + 1, `30 秒里叫了 ${shots.length} 声，太密`);
  G.missions = null;
});

test('找工具的房间一定进得去：只选这一层有入户门的户（复式上层的门在下一层，不算），门外走廊从电梯厅走得到，进门走得到工具；房号用门牌上的写法', () => {
  assert.equal(plateOf('T1-1718E-L'), '17–18E'); assert.equal(plateOf('T1-1617W-U'), '16–17W'); assert.equal(plateOf('T1-09E'), '09E'); assert.equal(plateOf('A-0401'), '0401');
  // 用户卡关的两处：北区 17F 的「1701 室」其实是 16–17W 复式的上层，15F 的「1501 室」是 14–15W 的上层，这两层都没有它们的门
  for (const [floor, upper] of [['T1-17F', 'T1-1617W-U'], ['T1-15F', 'T1-1415W-U']]) {
    const lv = L.levels.find((l) => l.id === floor), u = lv.units.find((q) => q.code === upper);
    assert.ok(u && u.residence.level === 'upper' && !u.wfronts.length, `${upper} 在 ${floor} 没有入户门`);
    assert.ok(!unitSites(L, nav, floor).some((q) => q.unit === u.id), `${upper} 不能放工具`);
  }
  assert.deepEqual(unitSites(L, nav, 'T1-17F').map((q) => q.name), ['17–18E 室']);
  // 两栋楼所有可能抽到的楼层、每一户：有门、门外站得住、电梯厅走得到门外、门外走得到工具
  for (const T of Object.values(TOWERS)) {
    const link = nav.links.find((l) => l.id === T.lift), lo = Math.min(...T.gates.flat()), hi = Math.max(...T.gates.flat());
    for (let n = lo; n <= hi; n++) {
      const floor = `${T.id}-${n}F`, lob = lobbySpot(nav, link, floor), sites = unitSites(L, nav, floor);
      assert.ok(lob && sites.length, `${floor} 有电梯厅、有能进的户`);
      for (const q of T.id === 'A' ? sites.slice(0, 3) : sites) {
        const door = doorOutside(L, q, nav); assert.ok(door, `${floor} ${q.name} 门外站得住`);
        assert.ok(findPath(nav, { ...lob, slope: null }, door), `${floor} ${q.name}：电梯厅走得到门口`);
        const sp = reachSpot(L, nav, q); assert.ok(sp, `${floor} ${q.name}：进门走得到工具`);
        assert.ok(Math.hypot(sp.x - door.x, sp.z - door.z) > 2, '工具在户里，不在门口');
      }
    }
  }
  // 整局：随机抽二十局，每道关的工具点都是「这一层有门、进得去」的户
  for (const id of ['A', 'T1']) for (let k = 1; k <= 10; k++) {
    const plan = siegePlan(seq(k * 7 + 3), L, nav, runs, TOWERS[id]);
    for (const st of plan.stages.filter((q) => q.kind === 'tool')) {
      const u = L.levels.find((l) => l.id === st.floor).units.find((q) => q.id === st.site.unit);
      assert.ok(u.wfronts.length && u.residence?.level !== 'upper', `${st.label} 这一层有门`);
      assert.ok(findPath(nav, doorOutside(L, st.site, nav), { floor: st.floor, x: st.site.x, z: st.site.z, slope: null }), `${st.label} 进得去`);
      assert.match(st.text, new RegExp(st.site.name.replace(/[–]/g, '.')));
    }
  }
});

test('丧尸的贴图外形：贴图去色偏灰绿、走路姿势按圈数在相邻两帧之间过渡；换上外形后方块人藏起来、按种类换色调和体型，换回去照旧', async () => {
  const { zombieTone, walkBlend, faceOf, ZOMBIE_SKIN } = await import('../src/jimao/zombie-skin.js');
  // 一块肤色：处理后更灰、偏绿、更暗
  const [r, g, b] = zombieTone(224, 172, 140, ZOMBIE_SKIN.tones[0]);
  assert.ok(r < 224 * 0.75 && g > r * 0.95 && Math.abs(r - b) < 60, `肤色 → ${[r, g, b].map((v) => v.toFixed(0))}`);
  assert.deepEqual(zombieTone(0, 0, 0, ZOMBIE_SKIN.special.pale.tone), [0, 0, 0]);
  assert.deepEqual(walkBlend(0, 8), { a: 0, b: 1, t: 0 }); assert.deepEqual(walkBlend(0.9375, 8), { a: 7, b: 0, t: 0.5 }); assert.equal(walkBlend(-0.125, 8).a, 7);
  // 脸的位置按第 0 个走路姿势量
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1.7, 0, 0.02, 1.6, 0.09, -0.02, 1.6, 0.07], 3));
  geo.morphAttributes.position = [new THREE.Float32BufferAttribute([0, 0, 0, 0, 0.05, 0, 0, 0.05, 0.01, 0, 0.05, 0], 3)]; geo.morphTargetsRelative = true;
  const face = faceOf(geo); assert.ok(Math.abs(face.top - 1.75) < 1e-6 && Math.abs(face.front - 0.1) < 1e-6 && Math.abs(face.x) < 1e-6, JSON.stringify(face));
  // 假的外形套件：记下每只丧尸收到的调用
  const { zombies, enemies, run, ahead } = zworld({ count: 4 });
  const made = [], kit = { create() { const k = { group: new THREE.Group(), looks: [], poses: [], setLook(i, pale) { this.looks.push([i, pale]); }, pose(p) { this.poses.push(p); } }; made.push(k); return k; }, dispose() { kit.gone = true; } };
  assert.equal(zombies.skinned, false);
  zombies.useSkin(kit); assert.equal(zombies.skinned, true); assert.equal(made.length, 4);
  const z = enemies.spawn('zombie', ahead(8), { kind: 'screamer' }), k = made[zombies.pool.indexOf(z)];
  assert.equal(k.looks.at(-1)[1], 'pale', '尖叫者用惨白那套'); assert.ok(k.group.parent, '外形挂在丧尸身上');
  const fat = enemies.spawn('zombie', ahead(10, 1), { kind: 'bloater', passive: true }), kf = made[zombies.pool.indexOf(fat)];
  assert.ok(Math.abs(kf.group.scale.x - KINDS.bloater.girth) < 1e-6 && kf.group.scale.y === 1, '胖尸横向撑开');
  run(1); assert.ok(k.poses.length > 20 && k.poses.every((q) => Number.isFinite(q.phase) && q.moving >= 0 && q.moving <= 1), '每帧摆姿势');
  let boxes = 0; z.rig.group.traverse((o) => { if (o.isMesh) { let vis = true; for (let q = o; q && q !== z.rig.group; q = q.parent) if (!q.visible) vis = false; if (vis) boxes++; } });
  assert.equal(boxes, 0, '方块人藏起来了');
  zombies.useSkin(null); assert.equal(zombies.skinned, false); assert.equal(k.group.parent, null);
  boxes = 0; z.rig.group.traverse((o) => { if (o.isMesh) { let vis = true; for (let q = o; q && q !== z.rig.group; q = q.parent) if (!q.visible) vis = false; if (vis) boxes++; } }); assert.equal(boxes, 5, '换回方块人');
});

test('节奏：平静 → 升温 → 预警三秒 → 尸潮 → 喘息 → 平静；尸潮越往后越大；人已经够呛就跳过这一轮；响动满了立刻催来；各阶段游荡数量和特殊感染者名额不同', () => {
  const P = createPacing(seq(5)), seen = [], log = [];
  let warnAt = -1, hordeAt = -1, t = 0, hordes = [];
  for (; t < 400; t += 0.1) {
    const a = P.update(0.1, { stage: 2, near: 0 });
    if (P.phase !== seen.at(-1)) seen.push(P.phase);
    if (a.warn && warnAt < 0) warnAt = t; if (a.horde) { if (hordeAt < 0) hordeAt = t; hordes.push(a.horde); }
    if (a.special) log.push(P.phase);
  }
  assert.deepEqual(seen.slice(0, 5), ['calm', 'build', 'peak', 'relax', 'calm']);
  assert.ok(Math.abs(hordeAt - warnAt - PACING.warn) < 0.25, `预警 ${warnAt.toFixed(1)} → 尸潮 ${hordeAt.toFixed(1)}`);
  assert.ok(hordes.length >= 3 && hordes.every((n) => n >= 7 && n <= 12), `每轮 ${hordes}`);
  assert.ok(log.length > 3 && !log.includes('calm'), '平静时不出特殊感染者');
  // 越往后越大，有上限
  const big = createPacing(seq(5)); let n9 = 0; for (let k = 0; k < 900 && !n9; k++) n9 = big.update(0.1, { stage: 9 }).horde;
  assert.ok(n9 > hordes[0] && n9 <= Math.ceil(PACING.horde.max * 1.1), `第 9 步 ${n9} 只`);
  // 人已经够呛：升温走到预警点时紧张度很高 → 这一轮不来，直接喘息
  const tired = createPacing(seq(7)); let got = 0;
  for (let k = 0; k < 700 && tired.state.skipped === 0; k++) { if (tired.phase === 'build') for (let j = 0; j < 3; j++) tired.hit(14); got += tired.update(0.1, { stage: 3, near: 3 }).horde; }
  assert.equal(tired.state.skipped, 1); assert.equal(got, 0); assert.equal(tired.phase, 'relax');
  // 响动满了：平静里直接升温、三秒后尸潮
  const loud = createPacing(seq(9)); let lt = 0, ln = 0, lw = false;
  for (; lt < 20 && !ln; lt += 0.1) { const a = loud.update(0.1, { stage: 0, noiseFull: true }); lw ||= a.warn; ln = a.horde; }
  assert.ok(lw && ln >= 6 && lt < PACING.warn + 0.5, `${lt.toFixed(1)} 秒后来了 ${ln} 只`);
  // 死守：波次不归它管，只出特殊感染者
  const hold = createPacing(seq(3)); let hs = 0, hh = 0; for (let k = 0; k < 600; k++) { const a = hold.update(0.1, { hold: true }); hs += a.special ? 1 : 0; hh += a.horde; }
  assert.ok(hs >= 3 && hh === 0);
  assert.ok(PACING.ambient.relax === 0 && PACING.ambient.build > PACING.ambient.calm && PACING.specials.calm === 0);
  P.reset(); assert.equal(P.phase, 'calm'); assert.equal(P.stress, 0);
});

test('特殊感染者：扑袭者蹲下再扑、扑中把人按住撕咬（打死它才松）、扑空踉跄；喷酸者隔着十来米吐酸；巨尸血厚、不吃硬直、一巴掌把人拍飞；这三种不参加随机抽取', () => {
  for (const k of ['lunger', 'spitter', 'brute']) { assert.equal(KINDS[k].weight, 0); assert.ok(SPECIALS.includes(k)); }
  for (let i = 0; i < 200; i++) assert.ok(!['lunger', 'spitter', 'brute'].includes(pickKind(i / 200)));
  { const { G, enemies, player, hurt, events, run, ahead } = zworld();
    // 扑袭者：8 米外、看得见 → 蹲（有预兆）→ 扑 → 按住
    const L = enemies.spawn('zombie', ahead(8), { kind: 'lunger', hunt: true });
    assert.equal(L.special, true); assert.equal(L.feedName, '扑袭者');
    let sawCrouch = false, sawLeap = false, maxSpeed = 0;
    run(4, () => { sawCrouch ||= L.zs === 'crouch'; sawLeap ||= L.zs === 'leap'; maxSpeed = Math.max(maxSpeed, L.speed); });
    assert.ok(sawCrouch && sawLeap, '先蹲后扑'); assert.ok(maxSpeed > 10, `飞扑速度 ${maxSpeed.toFixed(1)}`);
    assert.ok(events.some(([n, e]) => n === 'enemy:telegraph' && e.pounce), '蹲下时有预兆');
    assert.ok(events.some(([n]) => n === 'zombie:pin'), '按住了'); assert.equal(L.zs, 'pin');
    assert.ok(hurt.length >= 2 && hurt[0][0] === KINDS.lunger.pounce.damage, `扑中 ${hurt[0]?.[0]}，之后接着咬`);
    assert.ok(L.pos.distanceTo(player.pos) < 1.2, '贴在人身前');
    const n0 = hurt.length; run(1.2); assert.ok(hurt.length > n0, '按住期间一直咬');
    L.damage(999, null, null, 'body'); assert.ok(events.some(([n, e]) => n === 'zombie:unpin' && e.enemy === L), '打死它就松开');
    // 扑空：人不在那条线上
    events.length = 0; hurt.length = 0;
    const M = enemies.spawn('zombie', ahead(8, 1), { kind: 'lunger', hunt: true });
    let moved = false; run(4, () => { if (M.zs === 'leap' && !moved) { moved = true; player.pos.x += 6; player.pos.z += 6; } });
    assert.ok(moved && !events.some(([n]) => n === 'zombie:pin'), '躲开了就按不住');
    M._deactivate(); void G; }
  { const { enemies, player, events, run, ahead } = zworld();
    const sp = enemies.spawn('zombie', ahead(13), { kind: 'spitter', hunt: true });
    run(6);
    const spit = events.find(([n]) => n === 'zombie:spit');
    assert.ok(spit, '吐了'); assert.ok(spit[1].to.distanceTo(player.pos) < 1 && spit[1].radius === KINDS.spitter.spit.radius && spit[1].dps > 0);
    assert.ok(sp.pos.distanceTo(player.pos) > 6, `不近身（离人 ${sp.pos.distanceTo(player.pos).toFixed(1)} 米）`); }
  { const { enemies, player, hurt, run, ahead } = zworld();
    const B = enemies.spawn('zombie', ahead(5), { kind: 'brute', hunt: true });
    assert.equal(B.maxHp, KINDS.brute.hp); B.damage(60, null, null, 'body'); assert.equal(B.stagger, 0, '不吃硬直'); assert.equal(B.alive, true);
    player.vel.set(0, 0, 0); run(5);
    assert.ok(hurt.some((h) => h[0] === KINDS.brute.bite), '一巴掌 32'); assert.ok(Math.hypot(player.vel.x, player.vel.z) > 5 || player.vel.y > 2, '人被拍飞'); }
});

test('围城里的特殊感染者：按节奏的名额放（不连着来同一种、不超名额）；被按住时人钉在原地；酸液落地成一滩、站在里面掉血、过一阵消失；第二道关清掉后来一只巨尸', () => {
  const { G, siege, zombies, player, hurt, msgs, begin, cut, run } = sworld();
  begin(); const S = siege.state; S.stage = S.plan.armsStage + 1; run(0.1);
  // 名额：平静时 0
  assert.equal(siege.spawnSpecial(), null, '平静时不放');
  siege.pacing.state.phase = 'build';
  const a = siege.spawnSpecial(), b = siege.spawnSpecial();
  assert.ok(a && b && a.special && b.special && a.kind !== b.kind, `${a?.kind}、${b?.kind}`); assert.equal(siege.spawnSpecial(), null, '名额满了');
  for (const z of [a, b]) assert.ok(Math.hypot(z.pos.x - player.pos.x, z.pos.z - player.pos.z) >= 13, '离人十几米外');
  a._deactivate(); b._deactivate();
  // 按住：人挪不动
  const L = { alive: true, active: true, zs: 'pin' }; G.events.emit('zombie:pin', { enemy: L });
  const at = player.pos.clone(); player.pos.x += 3; run(0.05);
  assert.ok(Math.abs(player.pos.x - at.x) < 1e-6, '被按住走不了'); assert.ok(msgs.some((t) => /按住/.test(t)));
  L.zs = 'chase'; run(0.05); player.pos.x += 3; run(0.05); assert.ok(Math.abs(player.pos.x - at.x - 3) < 1e-6, '松开了就能走');
  // 酸液
  hurt.length = 0;
  G.events.emit('zombie:spit', { from: new THREE.Vector3(player.pos.x + 10, player.pos.y + 1.6, player.pos.z), to: player.pos.clone(), flight: 0.8, radius: 2.7, seconds: 6.5, dps: 9 });
  const acid = () => hurt.filter((h) => Math.abs(h[0] - 4.5) < 1e-6).length; // 只数酸液的伤害（这期间游荡的丧尸也可能咬人）
  run(0.6); assert.equal(acid(), 0, '还在飞'); run(1.6);
  assert.ok(acid() >= 2, `站在酸里掉血 ${hurt.map((h) => h[0])}`);
  const n = acid(); player.pos.x += 8; run(1.5); assert.equal(acid(), n, '走出来就不掉了');
  player.pos.x -= 8; run(6); const m = acid(); run(2); assert.equal(acid(), m, '过一阵酸液消失');
  // 巨尸：第二道关（第 5 步）清掉后几秒出现
  for (const z of zombies.alive()) z._deactivate();
  cut(siege.plan.stageOf('gate1') + 1); run(0.1);
  assert.ok(S.bruteT > 0, `bruteT ${S.bruteT}`); run(8);
  assert.equal(zombies.alive().filter((z) => z.kind === 'brute').length, 1); assert.ok(msgs.some((t) => /巨尸/.test(t)));
});

// ---- 生存要素：不回血、医疗包 / 止痛药、地上的补给、安全点 ----
test('治疗：轻伤先吃药、重伤用医疗包；医疗包包扎 2.6 秒回 80，开枪 / 被扑倒会打断（东西不扣）；各有携带上限；地上的补给走到跟前自动捡，带满了留在原地', () => {
  assert.equal(healChoice(100, 100, { medkit: 1, pills: 2 }), null);
  assert.equal(healChoice(75, 100, { medkit: 1, pills: 2 }), 'pills'); assert.equal(healChoice(30, 100, { medkit: 1, pills: 2 }), 'medkit');
  assert.equal(healChoice(30, 100, { medkit: 0, pills: 1 }), 'pills'); assert.equal(healChoice(75, 100, { medkit: 1, pills: 0 }), 'medkit'); assert.equal(healChoice(30, 100, { medkit: 0, pills: 0 }), null);
  const { G, player, supplies, thrown } = sworld();
  const step = (secs) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) supplies.update(1 / 30); };
  supplies.enabled = true; player.maxHealth = 100;
  assert.equal(supplies.give('medkit', 3), SUPPLY.medkit.max); assert.equal(supplies.give('pills', 5), SUPPLY.pills.max); assert.equal(supplies.give('medkit'), 0);
  assert.equal(supplies.heal(), null, '满血不用');
  player.health = 15; assert.equal(supplies.heal(), 'medkit'); assert.equal(supplies.heal(), null, '正在包扎');
  step(1); assert.equal(player.health, 15); G.events.emit('weapon:fire', { kind: 'pistol' });
  assert.equal(supplies.busy, null); step(3); assert.equal(player.health, 15); assert.equal(supplies.inv.medkit, 1, '被打断：东西还在');
  supplies.heal(); step(SUPPLY.medkit.time - 0.2); assert.equal(player.health, 15); step(0.3);
  assert.equal(player.health, 15 + SUPPLY.medkit.heal); assert.equal(supplies.inv.medkit, 0);
  assert.equal(supplies.heal(), 'pills'); G.events.emit('weapon:fire', {}); step(SUPPLY.pills.time + 0.1);
  assert.equal(player.health, 100, '吃药不怕开枪；回血不超过上限'); assert.equal(supplies.inv.pills, 1);
  // 地上的
  const p = player.pos, kit = supplies.place('medkit', { x: p.x + 6, y: p.y, z: p.z }), pill = supplies.place('pills', { x: p.x + 0.5, y: p.y, z: p.z }), fire = supplies.place('fire', { x: p.x - 0.5, y: p.y, z: p.z });
  const up = supplies.place('lure', { x: p.x, y: p.y + 4, z: p.z });
  step(0.1); assert.equal(supplies.inv.pills, 2); assert.equal(thrown.fire, 1); assert.equal(supplies.drops.length, 2, '远处的、楼上的没捡');
  assert.ok(supplies.drops.includes(kit) && supplies.drops.includes(up) && !supplies.drops.includes(pill) && !supplies.drops.includes(fire));
  supplies.place('pills', { x: p.x + 0.4, y: p.y, z: p.z }); step(0.2); assert.equal(supplies.drops.length, 3, '带满了：留在原地');
  const snap = supplies.snapshot(); assert.deepEqual({ ...snap }, { medkit: 0, pills: 2, frag: 2, fire: 1, lure: 0, hp: 100, smg: false, shells: -1, melee: 'knife' });
  supplies.reset(); assert.equal(supplies.drops.length, 0); assert.equal(supplies.inv.pills, 0);
  thrown.fire = 0; player.health = 20; supplies.restore(snap); assert.equal(supplies.inv.pills, 2); assert.equal(thrown.fire, 1); assert.equal(player.health, 100);
  player.health = 20; supplies.restore({ ...snap, hp: 12 }); assert.equal(player.health, SUPPLY.restoreHp, '重来时血量至少 60');
  supplies.enabled = false; player.health = 50; supplies.give('pills'); assert.equal(supplies.heal(), null, '零点突围里不开');
  assert.match(MEDIC_CSS, /\.t-heal/);
});

test('围城里的补给和安全点：不回血；武器柜、工具间、楼顶各有补给，合闸 / 清关以后那儿出医疗包并记成安全点；倒下后从安全点重来——前面的关不用再打、不再招一遍尸潮，身上的东西还回来', () => {
  const { G, siege, director, begin, cut, run, supplies, thrown, player } = sworld();
  begin(); siege.reset();
  assert.equal(G.noRegen, true); assert.equal(supplies.enabled, true);
  const plan = siege.plan, kinds = () => supplies.drops.map((d) => d.kind).sort().join(',');
  // 开局：武器柜 1 样 + 三间工具间各 2 样 + 楼顶 2 样 + 店门外消火栓箱里的斧子；合闸、清关的补给还没出来
  assert.equal(supplies.drops.length, LOOT.pistol.length + LOOT.locker.length + LOOT.holdout.length + 6 + LOOT.flare.length + 1);
  assert.ok(!supplies.drops.some((d) => d.kind === 'medkit' && Math.abs(d.pos.y - plan.stages[plan.powerStage].site.y) < 0.5 && Math.hypot(d.pos.x - plan.stages[plan.powerStage].site.x, d.pos.z - plan.stages[plan.powerStage].site.z) < 3));
  for (let i = 0; i < plan.stages.length; i++) {
    const list = lootOf(plan, i), st = plan.stages[i]; if (i < plan.armsStage && st.kind !== 'pistol') { assert.equal(list.length, 0, '商场段的小步骤不出补给'); continue; } assert.ok(list.length >= 1 && list.length <= (st.kind === 'flare' ? 4 : 3), st.id); // 楼顶信号弹旁边多一颗手雷（守屋顶用）
    const spots = lootSpots(nav, st.site, list.length); assert.equal(spots.length, list.length);
    for (const q of spots) { const d = Math.hypot(q.x - st.site.x, q.z - st.site.z); assert.ok(d > 0.4 && d < 2, `${st.id} 的补给离目标 ${d.toFixed(1)} 米`); assert.ok(Math.abs(q.y - st.site.y) < 0.4); }
  }
  for (const i of plan.gates.map((g) => g.stage)) assert.ok(lootOf(plan, i).includes('medkit'), '每个安全点都有医疗包');
  // 拿枪、合闸：出补给、记安全点
  const before = supplies.drops.length;
  cut(plan.powerStage); run(0.1); assert.equal(director.state.checkpoint, null, '拿枪、守点都不算安全点');
  player.pos.set(plan.stages[plan.powerStage].site.x, plan.stages[plan.powerStage].site.y, plan.stages[plan.powerStage].site.z); player.yaw = 1.2;
  supplies.give('pills', 1); thrown.lure = 1; player.health = 64;
  cut(1); run(0.1);
  const c = director.state.checkpoint;
  assert.ok(c && c.kind === 'safe' && c.stage === plan.powerStage + 1 && c.label === '配电室' && c.start.yaw === 1.2 && c.start.pos.distanceTo(player.pos) < 1e-6);
  assert.deepEqual({ ...c.kit }, { medkit: 0, pills: 1, frag: 2, fire: 0, lure: 1, hp: 64, smg: false, shells: -1, melee: 'axe' }, '没拿消火栓箱里的斧子：撬棍那一步给上了');
  assert.ok(supplies.drops.length >= before + LOOT.switch.length - 2, kinds());
  // 倒下：阵亡页换成「回到配电室重来」
  G.events.emit('player:dead', {}); assert.equal(director.dead.length, 1); assert.match(director.dead[0][1], /配电室/);
  // 重来：任务系统把存档点交回来（restore），目标稍后才补上
  const noise0 = siege.state.noise;
  director.state.restore = c; director.state.checkpoint = null; G.game.run.relays.forEach((r) => { r.cut = false; });
  supplies.give('medkit'); thrown.lure = 0; thrown.fire = 2; player.health = 100; G.rifle.ammo = 30; G.rifle.reserve = 150; // 原游戏重置：满弹
  siege.reset();
  assert.equal(siege.state.stage, plan.powerStage + 1); assert.equal(siege.state.noise, 0); assert.ok(noise0 >= 0);
  assert.equal(supplies.inv.medkit, 0, '重来先清空');
  assert.ok(supplies.drops.some((d) => d.kind === 'medkit'), '安全点的医疗包重新摆出来'); assert.ok(!supplies.drops.some((d) => Math.hypot(d.pos.x - plan.stages[plan.armsStage].site.x, d.pos.z - plan.stages[plan.armsStage].site.z) < 2 && Math.abs(d.pos.y - plan.stages[plan.armsStage].site.y) < 1), '武器柜旁的不再摆');
  const zs0 = siege.state.bruteT; thrown.fire = 0;
  run(0.1); assert.equal(siege.state.stage, plan.powerStage + 1, '目标还没补上：不倒退');
  cut(plan.powerStage + 1); director.state.restore = false; run(0.2);
  assert.equal(siege.state.stage, plan.powerStage + 1); assert.equal(siege.state.noise, 0, '不再触发合闸那一下的响动和尸潮'); assert.equal(siege.state.bruteT, zs0);
  assert.equal(director.state.checkpoint, null, '没有重复记（任务系统自己把存档点续上）');
  assert.equal(supplies.inv.pills, 1); assert.equal(thrown.lure, 1); assert.equal(player.health, 64, '身上的东西照存档时的来');
  assert.deepEqual([G.rifle.ammo, G.rifle.reserve], [SIEGE.ammo.rifle, Math.max(60, c.rifle[1])], '步枪弹药不白送');
  // 第一道关：再记一个新的安全点
  cut(2); run(0.1);
  const c2 = director.state.checkpoint; assert.ok(c2 && c2.stage === plan.powerStage + 3 && /F 安全点/.test(c2.label));
  // 关掉模式：恢复回血、补给收起来
  siege.enabled = false; siege.reset(); assert.equal(G.noRegen, false); assert.equal(supplies.enabled, false); assert.equal(supplies.drops.length, 0);
});

test('诱饵弹把丧尸引开：听得到的那几只丢下人朝响的地方凑，响完再回头找人；巨尸不理', () => {
  const { enemies, player, run, ahead, hurt } = zworld();
  const w = enemies.spawn('zombie', ahead(9), { kind: 'runner', hunt: true }), b = enemies.spawn('zombie', ahead(12, 1), { kind: 'brute', hunt: true });
  const lure = ahead(13, 2);
  run(0.3); assert.equal(w.zs, 'chase');
  assert.equal(b.distract(lure, 3), false); assert.equal(w.distract(lure, 3), true);
  const d0 = w.pos.distanceTo(lure), p0 = w.pos.distanceTo(player.pos);
  run(5, () => w.distract(lure, 1.3));
  assert.ok(w.pos.distanceTo(lure) < 3, `朝诱饵去了：${d0.toFixed(1)} → ${w.pos.distanceTo(lure).toFixed(1)}`);
  assert.ok(w.pos.distanceTo(player.pos) > p0 - 3, '没有冲着人来');
  const bitten = hurt.filter((h) => h[0] < 20).length; assert.equal(bitten, 0, '被引开的不咬人');
  run(6); assert.ok(w.pos.distanceTo(player.pos) < 4 || hurt.some((h) => h[0] < 20), '响完又回头找人');
});

test('推搡：近战那一下把贴身的丧尸推开一步多、趔趄近一秒（这段时间不咬人），正按着人的扑袭者被推开；巨尸推不动', async () => {
  const { enemies, player, run, ahead, hurt, events } = zworld();
  const { SHOVE } = await import('../src/jimao/arsenal.js');
  const at = ahead(1.3), dir = at.clone().sub(player.pos).setY(0).normalize();
  const w = enemies.spawn('zombie', at, { kind: 'runner', hunt: true }), b = enemies.spawn('zombie', ahead(1.6, 1), { kind: 'brute', hunt: true });
  run(0.2); const d0 = w.pos.distanceTo(player.pos); hurt.length = 0;
  assert.equal(w.shove(dir.x, dir.z, SHOVE.power), true); assert.equal(b.shove(dir.x, dir.z, SHOVE.power), false);
  run(0.3); const d1 = w.pos.distanceTo(player.pos);
  assert.ok(d1 > d0 + 1, `推开了 ${(d1 - d0).toFixed(1)} 米`); assert.ok(w.stagger > 0.4);
  run(0.4); assert.equal(hurt.filter((h) => h[0] < 20).length, 0, '趔趄着：没咬到');
  run(4); assert.ok(hurt.some((h) => h[0] < 20), '缓过来又上来咬');
  // 扑袭者按着人：一推就松开
  w._deactivate(); b._deactivate(); events.length = 0;
  const l = enemies.spawn('zombie', ahead(7), { kind: 'lunger', hunt: true });
  run(6, () => { if (l.zs === 'pin' && !events.some(([n]) => n === 'zombie:unpin')) l.shove(dir.x, dir.z, SHOVE.power); });
  assert.ok(events.some(([n]) => n === 'zombie:pin'), '扑倒过'); assert.ok(events.some(([n]) => n === 'zombie:unpin')); assert.notEqual(l.zs, 'pin');
});

test('消防斧打真丧尸：身前 0.9–2.4 米的一只、1.5 米并排的两只，劈一下都倒（推搡放在劈中以后，不会先把它们推到够不着的地方）；没砍死的照样被掀开一步多', async () => {
  const { G, enemies, player, ctx, ahead } = zworld();
  const A = await import('../src/jimao/arsenal.js');
  const camera = new THREE.PerspectiveCamera(74, 1.6, 0.01, 10), pressed = new Set();
  Object.assign(G, { game: { state: 'playing' }, input: { look: { dx: 0, dy: 0 }, fire: false, ads: false, pressed: (a) => pressed.has(a), down: () => false },
    weapon: { name: '步枪', ammo: 30, magSize: 30, reserve: 90, state: 'idle', update() {}, reset() {}, setVisible() {}, addAmmo() {}, snap() {} }, render: { lightPool: { flash() {} } } });
  player.onGround = true;
  const arsenal = A.createArsenal(G, { camera }); G.rifle = G.weapon; G.weapon = arsenal;
  const step = (secs) => { for (let t = 0; t < secs - 1e-9; t += 1 / 60) { arsenal.update(1 / 60); pressed.clear(); for (const z of [...ctx.list]) z._update(1 / 60); } };
  arsenal.setMelee('axe'); arsenal.select('knife'); step(A.SWAP.lower + A.DRAW.quick + 0.1); assert.equal(arsenal.current, 'knife'); assert.equal(arsenal.name, '消防斧');
  // 朝着 at 那一点（胸口高）看；side：并排两只各往左右挪多少
  const swing = (at, side = 0) => {
    for (const z of [...ctx.list]) z._deactivate(); ctx.list.length = 0;
    const p = player.pos, dx = at.x - p.x, dz = at.z - p.z, d = Math.hypot(dx, dz), sx = -dz / d, sz = dx / d;
    const list = (side ? [side, -side] : [0]).map((s) => enemies.spawn('zombie', new THREE.Vector3(at.x + sx * s, at.y, at.z + sz * s), { kind: 'walker', hunt: true }));
    camera.position.set(p.x, p.y + 1.68, p.z); camera.lookAt(at.x, at.y + 1.1, at.z);
    step(0.15); const d0 = list.map((z) => Math.hypot(z.pos.x - p.x, z.pos.z - p.z));
    pressed.add('fire'); step(A.AXE.time + 0.2);
    return { list, d0 };
  };
  for (const d of [0.9, 1.5, 2.4]) { const { list, d0 } = swing(ahead(d)); assert.ok(list.every((z) => !z.alive), `${d0[0].toFixed(1)} 米：一斧砍倒`); }
  { const { list, d0 } = swing(ahead(1.5), 0.32); assert.ok(list.every((z) => !z.alive), `并排两只（${d0.map((x) => x.toFixed(1)).join(' / ')} 米）：一下都砍倒`); }
  // 血厚的（这里调成 500）：中一斧没死——劈中以后被掀开一步多
  { const at = ahead(1.5); for (const z of [...ctx.list]) z._deactivate(); ctx.list.length = 0;
    const z = enemies.spawn('zombie', at, { kind: 'walker', hunt: true }); z.hp = 500; const p = player.pos;
    camera.position.set(p.x, p.y + 1.68, p.z); camera.lookAt(at.x, at.y + 1.1, at.z); step(0.15);
    pressed.add('fire'); step(A.AXE.hitAt - 0.05); const d1 = Math.hypot(z.pos.x - p.x, z.pos.z - p.z); assert.equal(z.hp, 500, '还没劈到：没先被推开');
    step(0.4); const d2 = Math.hypot(z.pos.x - p.x, z.pos.z - p.z);
    assert.ok(z.alive && z.hp === 500 - A.AXE.damage, '中了一斧'); assert.ok(d2 > d1 + 1, `劈中以后被掀开 ${(d2 - d1).toFixed(1)} 米`); }
  arsenal.dispose();
});

// ---- 队友 ----
function qworld() {
  const z = zworld({ count: 14 }), { G, player } = z, msgs = [];
  Object.assign(G, { game: { state: 'playing' }, hud: { message: (t) => msgs.push(t), radio: (t) => msgs.push('R:' + t) }, weapon: { state: 'idle' } });
  player.yaw = 0; player.maxHealth = 100; player.onGround = true;
  const siege = { enabled: true, state: { pin: null } }, director = { riding: false };
  const squad = createSquad(G, { scene: G.scene, nav, zombies: z.zombies, siege, director, rng: seq(5) });
  const run = (secs, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { G.time.frame++; each?.(); squad.update(1 / 30); for (const q of [...z.ctx.list]) q._update(1 / 30); } };
  return { ...z, squad, siege, director, msgs, run };
}

test('队友打谁、打不打得中、站哪儿：按着你的最优先，其次特殊感染者，再是离你近的；隔层、太远的不打；越远越难中；站位在你身后两侧', () => {
  const at = (x, z, o = {}) => ({ pos: { x, y: 0, z }, alive: true, active: true, zs: 'chase', ...o });
  const me = { x: 0, y: 0, z: 0 }, mate = { x: 2, y: 0, z: 2 };
  const near = at(3, 0), far = at(15, 0), sp = at(12, 0, { special: true }), pin = at(18, 0), up = at(1, 0, { pos: { x: 1, y: 4, z: 0 } }), out = at(60, 0), idle = at(2.5, 0, { zs: 'idle' });
  assert.equal(pickTarget(mate, me, [far, near]), near); assert.equal(pickTarget(mate, me, [near, far, sp]), sp, '特殊感染者优先');
  assert.equal(pickTarget(mate, me, [near, sp, pin], { pin }), pin, '按着人的最优先');
  assert.equal(pickTarget(mate, me, [up, out]), null); assert.equal(pickTarget(mate, me, [idle, near]), near, '没发现人的先不惹');
  assert.equal(pickTarget(mate, me, [near, far], { sees: (q) => q !== near }), far, '看不见的不打');
  const gun = SQUAD.members[0].gun; assert.ok(shotHits(gun, 2, 0.5) && !shotHits(gun, 2, 0.95)); assert.ok(shotHits(gun, 2, 0.7) && !shotHits(gun, 20, 0.7), '远了打不中');
  // 你朝 −z 看（yaw 0）：身后是 +z；阿哲在左后、林医生在右后更远
  const a = slotOf(me, 0, SQUAD.members[0]), b = slotOf(me, 0, SQUAD.members[1]);
  assert.ok(a.z > 2 && b.z > a.z && Math.sign(a.x) === -Math.sign(b.x), JSON.stringify([a, b]));
  assert.equal(SQUAD.members.filter((q) => !q.guest).length, 2); assert.ok(SQUAD.members[1].heal && SQUAD.members[0].hp > SQUAD.members[1].hp);
  assert.match(SQUAD_CSS, /\.jm-squad/);
});

test('队友跟着走：开局站到你身后；你走远了跟上来，换了层（坐电梯 / 走楼梯）直接跟到身边；坐上直升机就收起来；关掉模式不出场', () => {
  const { G, squad, player, run, ahead, siege, director } = qworld();
  squad.reset(); assert.equal(squad.enabled, true); assert.equal(squad.hordeScale, 1, '还没出场');
  run(0.2);
  for (const m of squad.mates) { const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z); assert.ok(m.root.visible && d < 6 && Math.abs(m.pos.y - player.pos.y) < 0.3, `${m.name} 离你 ${d.toFixed(1)} 米`); }
  assert.equal(squad.hordeScale, SQUAD.horde);
  // 你往前走 13 米
  const to = ahead(13); player.pos.copy(to); run(5);
  for (const m of squad.mates) { const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z); assert.ok(d < 7, `${m.name} 跟上来了（${d.toFixed(1)} 米）`); assert.ok(landAt(nav, m.pos.x, m.pos.z, m.pos.y + 0.6), '站在楼面上'); }
  // 换层：直接到 3F
  const f3 = FPS_MISSION.spawn, y3 = elev('P1-3F'); player.pos.set(f3.x, y3, f3.z);
  const ok3 = landAt(nav, f3.x, f3.z, y3 + 0.6);
  if (ok3 && Math.abs(ok3.y - y3) < 0.3) { run(SQUAD.follow.warpSeconds + 0.6); for (const m of squad.mates) assert.ok(Math.abs(m.pos.y - y3) < 0.4 && Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z) < 6, `${m.name} 跟到了 3F`); }
  // 原地转身：他们不跟着绕圈；站在你正前方的那个往旁边让开
  { run(3); const before = squad.mates.map((m) => m.pos.clone()); player.yaw += Math.PI; run(2);
    for (const [i, m] of squad.mates.entries()) {
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
      assert.ok(d > 4.2 || (fx * dx + fz * dz) / d < 0.9, `${m.name} 没挡在枪口前`); assert.ok(m.pos.distanceTo(before[i]) < 4.5, `${m.name} 没有跟着转圈跑（挪了 ${m.pos.distanceTo(before[i]).toFixed(1)} 米）`);
    } player.yaw -= Math.PI; }
  director.riding = true; run(0.1); assert.ok(squad.mates.every((m) => !m.root.visible)); assert.equal(squad.hordeScale, 1);
  director.riding = false; run(0.1); assert.ok(squad.mates.every((m) => m.root.visible), '下来了又跟上');
  siege.enabled = false; squad.reset(); run(0.2); assert.equal(squad.enabled, false); assert.ok(squad.mates.every((m) => !m.root.visible));
  siege.enabled = true; squad.wanted = false; squad.reset(); assert.equal(squad.enabled, false, '设置里关掉了');
  void G;
});

test('队友打丧尸：看得见就点射，打倒的记在队友名下（不算你的连杀）；丧尸贴上去咬他们会掉血、倒地，你走到跟前三秒扶起来（半血）；到安全点都缓过来', () => {
  const { G, squad, player, run, ahead, enemies, events, msgs } = qworld();
  squad.reset(); run(0.3);
  const zs = [0, 1, 2].map((k) => enemies.spawn('zombie', ahead(9 + k, k), { kind: 'walker', hunt: true }));
  run(7);
  const dead = zs.filter((q) => !q.alive).length, kills = events.filter(([n, e]) => n === 'enemy:killed' && e.by === 'squad').length;
  assert.ok(dead >= 2, `7 秒打倒 ${dead} 只`); assert.equal(kills, dead); assert.equal(squad.mates.reduce((a, m) => a + m.kills, 0), dead);
  assert.ok(squad.mates.every((m) => m.shots > 0), '两个人都开了火'); assert.ok(events.some(([n]) => n === 'squad:fire'));
  for (const q of zs) q._deactivate();
  // 咬队友：五只贴着阿哲（不让他还手：把看得见关掉）
  const zhe = squad.mates[0]; G.physics.lineOfSight = () => false;
  // 丧尸摆在他背后那一侧（离他比离你近）：贴上去就转过去咬他
  const away = Math.atan2(zhe.pos.z - player.pos.z, zhe.pos.x - player.pos.x);
  const pack = [-0.8, -0.4, 0, 0.4, 0.8].map((k) => enemies.spawn('zombie', new THREE.Vector3(zhe.pos.x + Math.cos(away + k) * 0.9, zhe.pos.y, zhe.pos.z + Math.sin(away + k) * 0.9), { kind: 'walker', hunt: true }));
  const hp0 = zhe.hp; run(1.5);
  assert.ok(zhe.hp < hp0 - 8, `一秒半掉了 ${(hp0 - zhe.hp).toFixed(0)}`);
  run(12);
  assert.equal(zhe.down, true, `阿哲还剩 ${zhe.hp.toFixed(0)}，丧尸离他 ${pack.map((q) => (q.alive ? Math.hypot(q.pos.x - zhe.pos.x, q.pos.z - zhe.pos.z).toFixed(1) + q.zs : 'x')).join(' ')}`); assert.ok(events.some(([n, e]) => n === 'squad:down' && e.mate === zhe)); assert.ok(msgs.some((t) => /阿哲倒下了/.test(t)));
  for (const q of pack) q._deactivate();
  player.pos.x += 30; // 你先走开
  // 扶起来：站到跟前
  squad.mates[1].down = true; // 林医生也倒着：没人替你扶
  run(SQUAD.down.revive - 0.5, () => { player.pos.set(zhe.pos.x + 1, zhe.pos.y, zhe.pos.z); }); assert.equal(zhe.down, true, '还差半秒');
  run(0.8, () => { player.pos.set(zhe.pos.x + 1, zhe.pos.y, zhe.pos.z); }); assert.equal(zhe.down, false); assert.equal(zhe.hp, SQUAD.down.hp);
  assert.equal(squad.mates[1].down, true); squad.rally(); assert.equal(squad.mates[1].down, false); assert.ok(zhe.hp > SQUAD.down.hp, '安全点：缓过来、回一截血');
});

test('林医生：你血量见底时跑过来包扎（+35，之后要等一分钟）；阿哲倒了她去扶；阿哲看见特殊感染者先喊出来', () => {
  const { G, squad, player, run, ahead, enemies, msgs, events } = qworld();
  squad.reset(); run(0.3);
  const lin = squad.mates[1], zhe = squad.mates[0], H = SQUAD.members[1].heal;
  lin.healT = 0; player.health = 30;
  run(6);
  assert.equal(player.health, 30 + H.amount); assert.ok(events.some(([n]) => n === 'squad:heal')); assert.ok(msgs.some((t) => /林医生：别动/.test(t)));
  player.health = 20; run(6); assert.equal(player.health, 20, '刚包过：要等');
  assert.ok(lin.healT > H.cooldown - 15);
  // 阿哲倒了：你离得远，林医生去扶
  zhe.goDown(); const far = ahead(9);
  run(SQUAD.down.medic + 6, () => { player.pos.copy(far); });
  assert.equal(zhe.down, false, '林医生把人扶起来了');
  // 喊话
  msgs.length = 0; const b = enemies.spawn('zombie', ahead(12, 1), { kind: 'spitter', passive: true, fixed: true });
  const s0 = FPS_MISSION.spawn; player.pos.set(s0.x, elev(s0.floor), s0.z);
  run(3, () => { zhe.pos.set(s0.x, elev(s0.floor), s0.z); }); assert.ok(msgs.some((t) => /阿哲：喷酸者/.test(t)), JSON.stringify(msgs)); assert.equal(b.called, true);
  void G;
});

// ---- 血条、拍飞 ----
test('血条：打中过的丧尸头顶亮两秒多，没打过的不显示；特殊感染者发现人以后 26 米内常亮；血越厚条越长；队友名牌下有一条；关掉模式全收起来', () => {
  assert.ok(barWidth(60) > 0.45 && barWidth(60) < 0.6 && barWidth(1300) === BARS.max && barWidth(1) === BARS.min);
  const mk = (x, o = {}) => ({ pos: { x, y: 0, z: 0 }, alive: true, active: true, hp: 30, maxHp: 60, zs: 'chase', ...o });
  const eye = { x: 0, y: 1.6, z: 0 }, fresh = mk(5), hit = mk(8, { hitAt: 9 }), old = mk(6, { hitAt: 1 }), sp = mk(20, { special: true }), far = mk(40, { special: true }), idle = mk(10, { special: true, zs: 'idle' });
  assert.deepEqual(pickBars([fresh, hit, old, sp, far, idle], eye, 10).map((b) => b.z), [hit, sp]);
  assert.equal(pickBars(Array.from({ length: 30 }, (_, i) => mk(i + 2, { hitAt: 10 })), eye, 10).length, BARS.pool);
  const { G, squad, enemies, ahead, run, player } = qworld();
  const camera = new THREE.PerspectiveCamera(); camera.position.set(player.pos.x, player.pos.y + 1.6, player.pos.z); camera.updateMatrixWorld(true);
  const bars = createHealthBars(G, { scene: G.scene, camera, zombies: G.zombiesApi || { alive: () => enemies.list.filter((q) => q.alive && q.active) }, squad });
  squad.reset(); for (const m of squad.mates) m.cool = 999; run(0.2);
  const z = enemies.spawn('zombie', ahead(6), { kind: 'walker', passive: true, fixed: true }), b = enemies.spawn('zombie', ahead(9, 1), { kind: 'brute', passive: true, fixed: true });
  bars.enabled = true; bars.update(0.1);
  assert.ok(bars.bars.every((q) => !q.back.visible), '没打过：不显示');
  z.damage(20, null, null, 'body'); bars.update(0.1);
  const on = bars.bars.filter((q) => q.back.visible); assert.equal(on.length, 1);
  const wWalker = on[0].back.scale.x;
  assert.ok(Math.abs(on[0].fill.scale.x / on[0].back.scale.x - 40 / 60) < 0.01, '按剩下的血量画'); assert.ok(on[0].back.position.y > z.pos.y + 1.8, '在头顶上');
  for (let i = 0; i < 30; i++) bars.update(0.1); assert.ok(bars.bars.every((q) => !q.back.visible), '过了两秒多收起来');
  b.zs = 'chase'; bars.update(0.1); const sb = bars.bars.filter((q) => q.back.visible);
  assert.equal(sb.length, 1); assert.ok(sb[0].back.scale.x > wWalker * 1.8, '巨尸的条长得多');
  assert.ok(bars.mateBars.every((q) => q.back.visible), '队友有血条'); squad.mates[0].hp = squad.mates[0].maxHp / 2; bars.update(0.1);
  assert.ok(Math.abs(bars.mateBars[0].fill.scale.x / bars.mateBars[0].back.scale.x - 0.5) < 0.01);
  bars.enabled = false; assert.ok([...bars.bars, ...bars.mateBars].every((q) => !q.back.visible && !q.fill.visible));
  assert.match(BARS_CSS, /\.jm-boss/);
});

test('拍飞：巨尸一巴掌把人打飞出去（比咬人的伤害另算），飞着撞墙再掉 12、平安落地掉 6；胖尸炸开的气浪也把人掀飞；队友被巨尸拍飞、摔在地上一秒多才起来', () => {
  const { G, siege, enemies, player, hurt, events, begin, run, ahead, msgs } = sworld();
  begin(); siege.reset(); run(0.1); player.onGround = true;
  const stop = () => { for (const z of enemies.list.filter((q) => q.alive && q.active)) z._deactivate(); siege.pacing.state.phase = 'relax'; siege.pacing.state.left = 999; siege.state.spawnT = 999; };
  stop();
  // 巨尸贴身抡一下
  const b = enemies.spawn('zombie', ahead(1.6), { kind: 'brute', hunt: true }); hurt.length = 0;
  let v0 = 0; run(1.6, () => { v0 = Math.max(v0, Math.hypot(player.vel.x, player.vel.z)); if (events.some(([n]) => n === 'zombie:knock')) b._deactivate(); });
  const k = events.find(([n]) => n === 'zombie:knock');
  assert.ok(k && k[1].power === KINDS.brute.knock, '拍飞了'); assert.ok(v0 > 10, `飞出去的速度 ${v0.toFixed(1)} 米 / 秒`); assert.ok(player.vel.y >= 5, '人离地');
  assert.equal(hurt[0][0], KINDS.brute.bite); assert.ok(msgs.some((t) => /拍飞/.test(t)));
  // 飞着撞墙：速度一下没了
  hurt.length = 0; siege.state.fling = { t: 0, air: false, wall: false, prev: 0 };
  player.onGround = false; player.vel.set(11, 2, 0); run(0.1); player.vel.set(0.5, 1, 0); run(0.1);
  assert.deepEqual(hurt.map((h) => h[0]), [SIEGE.fling.wall], '撞墙掉血'); assert.ok(events.some(([n, e]) => n === 'player:slam' && e.kind === 'wall'));
  player.onGround = true; run(0.4); assert.equal(siege.state.fling, null); assert.equal(hurt.length, 1, '撞过墙的落地不再算一次');
  // 没撞墙：落地掉 6
  hurt.length = 0; siege.state.fling = { t: 0, air: false, wall: false, prev: 0 };
  player.onGround = false; player.vel.set(9, 3, 0); run(0.4); player.vel.set(7, 0, 0); player.onGround = true; run(0.1);
  assert.deepEqual(hurt.map((h) => h[0]), [SIEGE.fling.land]); assert.equal(siege.state.fling, null);
  // 胖尸炸开
  stop(); events.length = 0; player.vel.set(0, 0, 0);
  const fat = enemies.spawn('zombie', ahead(2), { kind: 'bloater', passive: true }); fat.damage(999, null, null, 'body');
  assert.ok(events.some(([n, e]) => n === 'zombie:knock' && e.burst)); assert.ok(Math.hypot(player.vel.x, player.vel.z) > 3 && player.vel.y > 4, '被气浪掀出去');
  void G;
});

test('队友被巨尸拍飞：掉 28 血、往后滑出去几米、躺一秒多再爬起来；三秒半内不挨第二下', () => {
  const { squad, enemies, run, events, player } = qworld();
  squad.reset(); for (const m of squad.mates) m.cool = 999; run(0.3);
  const zhe = squad.mates[0], at = zhe.pos.clone(), hp0 = zhe.hp;
  const away = Math.atan2(zhe.pos.z - player.pos.z, zhe.pos.x - player.pos.x);
  enemies.spawn('zombie', new THREE.Vector3(zhe.pos.x + Math.cos(away) * 1.2, zhe.pos.y, zhe.pos.z + Math.sin(away) * 1.2), { kind: 'brute', hunt: true });
  run(0.2); assert.ok(events.some(([n, e]) => n === 'squad:fling' && e.mate === zhe)); assert.equal(zhe.hp, hp0 - SQUAD.fling.damage); assert.ok(zhe.stun > 0.8);
  run(0.8); assert.ok(zhe.pos.distanceTo(at) > 1.5, `滑出去 ${zhe.pos.distanceTo(at).toFixed(1)} 米`); assert.ok(zhe.fallK > 0.9, '摔在地上');
  run(1.2); assert.ok(zhe.stun <= 0 && !zhe.down); assert.equal(events.filter(([n]) => n === 'squad:fling').length, 1, '冷却里不挨第二下');
});

test('商场段：锁在三层的店里 → 手摇柄、摇开卷帘 → 撬棍、撬开扶梯口 → 二层：手枪、值班表、三个储物柜选对的、发电机守 25 秒、按开卷帘 → 一层武器柜；一步放开一片', () => {
  const { G, siege, zombies, begin, cut, run, player, msgs } = sworld();
  const m = begin(), S = siege.state, plan = m.plan, M = plan.mall, at = plan.stageOf;
  assert.deepEqual(plan.stages.slice(0, 16).map((s) => s.id), ['crank', 'exit', 'crowbar', 'rescue', 'escort', 'pry', 'sneak', 'pistol', 'note', 'card', 'fuel', 'gen', 'open', 'arms', 'holdout', 'power']);
  assert.equal(plan.armsStage, 13); assert.equal(plan.powerStage, 15);
  // 开局在三层那家店里；每一步都站得住；三层的在三层、二层的在二层
  assert.equal(M.start.floor, 'P1-3F'); assert.ok(pointInPoly([M.start.x, M.start.z], M.shop.poly), '开局点在店里'); assert.ok(m.start.pos.y > 10);
  for (const st of plan.stages.slice(0, at('arms'))) { const q = landAt(nav, st.site.x, st.site.z, st.site.y + 0.6); assert.ok(q && q.floor === st.floor && clear(nav, q), `${st.id} 站得住`); assert.ok(st.text && st.hud && st.verb); }
  assert.deepEqual(plan.stages.slice(0, at('arms')).map((s) => s.floor), [...Array(6).fill('P1-3F'), ...Array(7).fill('P1-2F')]);
  assert.ok(pointInPoly([plan.stages[0].site.x, plan.stages[0].site.z], M.shop.poly), '手摇柄在店里');
  // 三个储物柜：一个对的，就是「门禁卡」那一步的位置；提示里写着几号
  assert.equal(M.lockers.length, 3); assert.equal(M.lockers.filter((q) => q.right).length, 1);
  const win = M.lockers.find((q) => q.right), card = plan.stages[at('card')]; assert.ok(Math.hypot(win.x - card.site.x, win.z - card.site.z) < 1e-6); assert.match(card.text, new RegExp(`${win.n} 号`));
  // 范围：一步放开一片
  run(0.2); assert.deepEqual(G.weapon.locked, ['pistol', 'rifle']);
  const s0 = plan.stages[0].site, s2 = plan.stages[at('crowbar')].site, s4 = plan.stages[at('pistol')].site;
  assert.equal(siege.inArea({ floor: 'P1-3F', x: s0.x, z: s0.z }), true); assert.equal(siege.inArea({ floor: 'P1-3F', x: s2.x, z: s2.z }), false, '卷帘没开：出不了店');
  assert.equal(zombies.alive().length, 0, '锁在店里的时候没有丧尸进来');
  cut(2); run(0.2); // 手摇柄 + 摇开卷帘
  assert.equal(siege.inArea({ floor: 'P1-3F', x: s2.x, z: s2.z }), true); assert.equal(siege.inArea({ floor: 'P1-2F', x: s4.x, z: s4.z }), false, '扶梯口没撬开：下不了二层');
  assert.equal(siege.inArea({ floor: 'P1-3F', x: -270, z: -230 }), false, '三层只开放任务周围那一片');
  assert.equal(zombies.alive().filter((z) => z.hunt).length, 3, '门外拍门的那几只进来了');
  cut(4); run(0.2); // 撬棍 + 救人 + 护送 + 撬开
  assert.equal(siege.inArea({ floor: 'P1-2F', x: s4.x, z: s4.z }), true); assert.equal(siege.inArea({ floor: 'P1-1F', x: -169, z: -90 }), false, '二层的卷帘没开：下不了一层');
  cut(2); run(0.2); assert.deepEqual(G.weapon.locked, ['rifle']); assert.equal(G.weapon.picked, 'pistol'); // 潜行 + 手枪
  // 没看值班表就去开柜子：走到不对的那个跟前，蹦出一只
  const wrong = M.lockers.find((q) => !q.right), n0 = zombies.alive().length;
  player.pos.set(wrong.x + 0.5, wrong.y, wrong.z); run(0.1);
  assert.equal(zombies.alive().length, n0 + 1); assert.ok(msgs.some((t) => /柜子里扑出来/.test(t))); run(0.3); assert.equal(zombies.alive().length, n0 + 1, '同一个柜子只蹦一次');
  // 对的那个不蹦
  player.pos.set(win.x + 0.5, win.y, win.z); run(0.1); assert.equal(zombies.alive().length, n0 + 1);
  cut(2); run(0.1); // 值班表 + 门禁卡
  // 发电机：打着以后倒计时，期间下一步（按开卷帘）锁着、一拨拨来；走完才放开
  cut(2); run(0.2); assert.ok(S.genT > MALL.gen.seconds - 1); // 油桶 + 发电机 assert.equal(m.objectives[at('open')].locked, true, '发电机没带起来，卷帘按不动');
  const h0 = zombies.alive().filter((z) => z.hunt).length; run(MALL.gen.every + 2); assert.ok(zombies.alive().filter((z) => z.hunt).length > h0, '发电机的动静招来几只');
  run(MALL.gen.seconds); assert.equal(S.genT, 0); assert.equal(m.objectives[at('open')].locked, false); assert.ok(msgs.some((t) => /发电机带起来了/.test(t)));
  cut(1); run(0.2);
  assert.equal(siege.inArea({ floor: 'P1-1F', x: -169, z: -90 }), true, '卷帘开了：能下一层'); assert.equal(siege.inArea({ floor: 'ground', x: 0, z: 0 }), false);
  assert.equal(inMallZone(plan.stages, 'P1-4F', s0.x, s0.z), false);
  // 一层武器柜：步枪到手，警报，尸潮
  cut(1); run(0.2); assert.deepEqual(G.weapon.locked, []); assert.equal(G.weapon.picked, 'rifle'); assert.equal(S.stage, at('arms') + 1);
  // 拿什么跑多快
  G.weapon.current = 'knife'; run(0.05); assert.equal(G.speedMul, SIEGE.speed.knife); G.weapon.current = 'pistol'; run(0.05); assert.equal(G.speedMul, SIEGE.speed.pistol); G.weapon.current = 'rifle'; run(0.05); assert.equal(G.speedMul, 1);
});

test('清扫时丧尸会还手：轮流朝飞机扔东西，砸中了掉耐久；阳台里的扔之前先把玻璃砸了', () => {
  const { G, siege, zombies, director, player, begin, cut, run } = sworld();
  const m = begin(); cut(m.plan.stages.length); run(0.1); for (const z of zombies.alive()) z._deactivate();
  siege.state.hold = SIEGE.hold - 0.2; run(SIEGE.land + 2); director.riding = true; m.extraction.ride.onBoard();
  const fires = []; G.events.on('enemy:fire', (e) => fires.push(e));
  // 飞机就在楼顶边上（都在 range 以内）
  G.missions = { ...(G.missions || {}), vehicleCenter: () => new THREE.Vector3(SIEGE.pad.x + 20, elev(SIEGE.roof) + 12, SIEGE.pad.z), rideKind: 'helicopter' };
  let t = 0; const tick = (secs) => { for (let k = 0; k < secs * 30; k++) { t += 1 / 30; m.extraction.ride.spawns(1 / 30, t); } };
  tick(SIEGE.sweep.throw.first - 0.5); assert.equal(fires.filter((e) => e.type === 'zombie').length, 0, '头几秒不扔');
  tick(30); const hits = fires.filter((e) => e.type === 'zombie');
  assert.ok(hits.length >= 6, `半分钟砸中 ${hits.length} 次`); assert.ok(hits.every((e) => e.hits === SIEGE.sweep.throw.hits && e.enemy?.sweep));
  // 全打死以后就没人扔了
  for (const z of siege.state.sweep.list) if (z.alive) z.damage(9999, null, null, 'body');
  tick(3); const n = fires.length; tick(6); assert.equal(fires.length, n, '死光了不再扔');
  void player;
});

test('炸楼结局：清完选了以后机外镜头换到远处、拉长；炸弹落地后楼往下垮、压扁，垮完藏起来；重开一局原样放回去', () => {
  // 时间线是纯函数
  assert.deepEqual(collapseAt('tower', 0.2, { delay: 0.5, height: 70 }), { sink: 0, squash: 1, tilt: 0, shake: 0, gone: false });
  let prev = 0; for (let u = 0; u < 12; u += 0.25) { const c = collapseAt('tower', u, { delay: 0.5, height: 70 }); assert.ok(c.sink >= prev - 1e-9, '只往下不回弹'); prev = c.sink; assert.ok(c.squash <= 1 && c.squash > 0.3); }
  assert.equal(collapseAt('tower', 12, { delay: 0.5, height: 70 }).gone, true); assert.ok(prev > 55, `沉了 ${prev.toFixed(0)} 米`);
  assert.equal(collapseAt('mall', 9, { delay: 0.6, height: 37 }).gone, true);
  // 楼的模型：场景里按名字找
  const scene = new THREE.Scene(), all = new THREE.Group(); scene.add(all);
  for (const id of [...DEMOLISH.towers, ...DEMOLISH.mall, 'H']) { const g = new THREE.Group(); g.name = id; g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))); all.add(g); }
  const G = { fx: {}, events: { emit() {} }, player: { addShake() {} } }, d = createDemolition(G, { scene, layout: L });
  assert.equal(d.accept(), false, '没问之前按了没用');
  d.offer(); assert.equal(d.offered, true); d.tick(1); assert.equal(d.accept(), true); assert.equal(d.chosen, true); assert.equal(d.offered, false);
  d.start(); for (let k = 0; k < 30 * (DEMOLISH.bomb.fall - 0.1); k++) d.tick(1 / 30);
  const A = d.parts.find((p) => p.id === 'A'); assert.equal(A.g.position.y, 0, '炸弹落地之前楼不动');
  for (let k = 0; k < 30 * 3; k++) d.tick(1 / 30);
  assert.ok(A.g.position.y < -3 && A.g.scale.y < 1, '开始往下垮'); assert.equal(scene.getObjectByName('H').position.y, 0, '酒店不在范围里');
  for (let k = 0; k < 30 * 11; k++) d.tick(1 / 30);
  assert.equal(d.done, true); assert.ok(d.parts.every((p) => !p.g.visible), '垮完都藏起来');
  assert.equal(d.parts.length, DEMOLISH.towers.length + DEMOLISH.mall.length);
  assert.ok(d.fade(DEMOLISH.seconds) > 0.99 && d.fade(DEMOLISH.seconds - DEMOLISH.fade - 0.1) === 0, '最后压黑');
  d.reset(); assert.ok(d.parts.every((p) => p.g.visible && p.g.position.y === 0 && p.g.scale.y === 1 && p.g.rotation.z === 0), '重开：楼回来了'); assert.equal(d.chosen, false);
  d.dispose();
});

test('炸楼时在飞机上看：航线改飞观看圈（先拉高、再飞到绕整片楼的大圈上），不撞楼、不跳；左舷对着圈心；之后照常离开', () => {
  const W = DEMOLISH.watch, C = { x: W.center[0], z: W.center[1] };
  const tops = L.buildings.filter((b) => b.outline?.length).map((b) => ({ id: b.id, outline: b.outline, top: Math.max(...L.levels.filter((l) => l.building === b.id).map((l) => l.elev + (l.kind === 'roof' ? 3 : l.height || 4))) }));
  for (const id of ['A', 'T1']) for (const t0 of [40, 77, 120]) {
    const T = TOWERS[id], f = siegeFlight(T.pad, elev(T.roof), { box: flightBox(L, T) });
    assert.equal(f.watching, false);
    assert.equal(f.setWatch(t0, { center: C, R: W.R, y: W.y, turn: W.turn }), true); f.setLeave(t0 + W.seconds);
    assert.equal(f.watching, true); assert.equal(f.setWatch(t0 + 1, { center: C }), false, '只设一次');
    let prev = f.poseAt(t0 - 0.05);
    for (let t = t0; t < t0 + W.seconds; t += 0.05) {
      const p = f.poseAt(t); assert.equal(p.phase, 'watch');
      assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) < 2.1, `${id} t=${(t - t0).toFixed(1)} 不跳`); prev = p;
      for (const b of tops) if (pointInPoly([p.x, p.z], b.outline)) assert.ok(p.y > b.top + 8, `${id} 在 ${b.id} 上空只高出 ${(p.y - b.top).toFixed(0)} 米`);
    }
    const p = f.poseAt(t0 + 16), lx = Math.cos(p.yaw), lz = -Math.sin(p.yaw), cx = C.x - p.x, cz = C.z - p.z, d = Math.hypot(cx, cz);
    assert.ok(Math.abs(d - W.R) < 1 && Math.abs(p.y - W.y) < 0.01, '到了观看圈上'); assert.ok((lx * cx + lz * cz) / d > 0.95, '左舷对着圈心');
    assert.equal(f.poseAt(t0 + W.seconds + 1).phase, 'leave'); assert.equal(f.duration(), t0 + W.seconds + 6);
  }
});

test('商场段的新玩法：救人以后护送到扶梯口才算完；潜行时跑动会把尸群吵醒、走到门口自动过；抬着油桶开不了枪、跑得慢、能放下再抬；一层守点倒计时没完合闸锁着；没用上的店卷帘拉下进不去', () => {
  const { G, siege, zombies, begin, cut, run, player, msgs } = sworld();
  const m = begin(), S = siege.state, plan = m.plan, at = plan.stageOf, M = plan.mall;
  G.game.debugCut = () => { const r = G.game.run.relays.find((q) => !q.cut); if (r) r.cut = true; };
  run(0.1);
  // 卷帘拉下的店：站进去就退回来
  const lv = L.levels.find((l) => l.id === 'P1-3F'), shut = lv.units.find((u) => !u.residence && !M.shops.includes(u.id) && u.id !== M.shop.id && u.polys?.[0] && !plan.stages.some((q) => q.floor === 'P1-3F' && pointInPoly([q.site.x, q.site.z], u.polys[0])));
  const c = shut.polys[0].reduce((a, q) => [a[0] + q[0] / shut.polys[0].length, a[1] + q[1] / shut.polys[0].length], [0, 0]);
  assert.equal(siege.inArea({ floor: 'P1-3F', x: c[0], z: c[1] }, 3), false, '没用上的店进不去');
  // 救人 → 护送：标在 HUD 上但不能按；人走到扶梯口（这里没有队友模块，按你自己算）才完成
  cut(at('rescue') + 1); run(0.2); assert.equal(S.stage, at('escort'));
  assert.equal(m.objectives[at('escort')].ghost, true); assert.ok(zombies.alive().some((z) => z.hunt), '撬门的动静招来几只');
  const e = plan.stages[at('escort')].site; player.pos.set(e.x + 1, e.y, e.z); run(0.2);
  assert.equal(S.stage, at('pry'), '到了扶梯口：护送完成');
  // 潜行：进到这一步摆好尸群；蹲着慢走不吵；跑起来响动满了全醒
  for (const z of zombies.alive()) z._deactivate();
  cut(1); run(0.2); assert.equal(S.stage, at('sneak'));
  const sl = S.sleepers; assert.ok(sl.length >= 8, `摆了 ${sl.length} 只`); assert.ok(sl.every((z) => z.passive && z.sleeper));
  const a = M.sneak.from; player.pos.set(a.x, a.y, a.z); player.vel?.set?.(0, 0, 0);
  S.noise = 0; G.input = { crouch: true }; player.vel.set(2, 0, 0); run(1, () => { player.pos.set(a.x, a.y, a.z); player.vel.set(2, 0, 0); }); assert.ok(S.noise < 1, '蹲着走不出声');
  G.input = { crouch: false }; player.vel.set(6, 0, 0); run(3, () => { player.pos.set(a.x, a.y, a.z); player.vel.set(6, 0, 0); });
  assert.ok(sl.filter((z) => z.alive).every((z) => !z.sleeper), '跑起来全吵醒了'); assert.ok(msgs.some((t) => /醒了/.test(t)));
  player.vel.set(0, 0, 0); const to = M.sneak.to; player.pos.set(to.x, to.y, to.z); run(0.2); assert.equal(S.stage, at('pistol'), '摸到门口自动过');
  // 油桶：抬着走得慢、gen 那一步标着但按不了；V 放下以后能开枪，回来走到跟前自动抬起
  for (const z of zombies.alive()) z._deactivate();
  cut(at('fuel') + 1 - S.stage); run(0.2); assert.equal(S.stage, at('gen')); assert.equal(S.carry, true);
  G.weapon.current = 'pistol'; run(0.05); assert.ok(Math.abs(G.speedMul - SIEGE.speed.pistol * MALL.fuel.speed) < 1e-9, '抬着油桶跑得慢');
  assert.equal(m.objectives[at('gen')].ghost, false);
  // 测试环境没有键盘：直接放下（和按 V 一样的状态）
  S.carry = false; S.canAt = player.pos.clone(); S.dropT = 1.2;
  run(0.05); assert.equal(m.objectives[at('gen')].ghost, true, '油桶不在手上：发电机按不了'); assert.equal(G.speedMul, SIEGE.speed.pistol);
  run(1.4); assert.equal(S.carry, true, '站在桶跟前：抬起来了');
  cut(1); run(0.2); assert.equal(S.carry, false, '加了油：桶放下了'); assert.equal(S.stage, at('open'));
  // 一层守点：开始以后倒计时，没撬开合闸那一步锁着；三个方向轮流来
  cut(at('holdout') + 1 - S.stage); run(0.2); assert.equal(S.stage, at('power'));
  assert.ok(S.holdT > SIEGE.holdout.seconds - 1); assert.equal(m.objectives[at('power')].locked, true, '后门没撬开：合闸锁着'); assert.ok(S.holdDirs.length >= 2, `${S.holdDirs.length} 个方向`);
  const h0 = zombies.alive().filter((z) => z.hunt).length; run(SIEGE.holdout.every + 1); assert.ok(zombies.alive().filter((z) => z.hunt).length > h0, '一拨来了');
  run(SIEGE.holdout.seconds); assert.equal(S.holdT, 0); assert.equal(m.objectives[at('power')].locked, false); assert.ok(msgs.some((t) => /卷帘撬开了/.test(t)));
});

// ---- 清扫：楼里、楼梯间里的看不见也打不着，也打不着飞机 ----
test('跨楼层的视线：从楼外看楼顶楼梯间里面，原来的射线（只查起点那一层的墙）看得穿，sightAcross 挡住；隔着楼板也挡；露天的屋面看得见。舱门机枪的射界：左右 ±77°、上 26° 下 69°', () => {
  const P = createMapPhysics(nav), roof = elev('A-RF'), run = runs.find((r) => r.to === 'A-RF'), inside = new THREE.Vector3(run.b.x, roof + 1.15, run.b.z);
  const A = L.buildings.find((b) => b.id === 'A'), x1 = Math.max(...A.outline.map((p) => p[0]));
  const eye = new THREE.Vector3(x1 + 24, roof + 2.5, run.b.z);
  assert.equal(P.lineOfSight(eye, inside), true, '原来的射线：从楼外看进楼梯间不挡（楼里的丧尸隔着墙打得中）');
  assert.equal(P.sightAcross(eye, inside), false, '跨楼层：楼梯间的墙挡住');
  const hit = P.castAcross(eye, inside.clone().sub(eye).normalize(), 200); assert.ok(hit && hit.dist < eye.distanceTo(inside) - 1 && hit.point, '射程截到墙上');
  assert.equal(P.sightAcross(new THREE.Vector3(SIEGE.pad.x + 2, roof + 12, SIEGE.pad.z), new THREE.Vector3(SIEGE.pad.x + 2, elev('A-15F') + 1.2, SIEGE.pad.z)), false, '隔着屋面的楼板');
  assert.equal(P.sightAcross(new THREE.Vector3(x1 + 24, roof + 12, SIEGE.pad.z), new THREE.Vector3(SIEGE.pad.x + 8, roof + 1.15, SIEGE.pad.z)), true, '露天的屋面看得见');
  // 射界：枪架朝世界 +x
  const mount = new THREE.Object3D(); mount.rotation.y = Math.PI / 2; mount.updateMatrixWorld(true);
  const gun = createDoorGun({}, mount), at = (x, y, z) => new THREE.Vector3(x, y, z);
  assert.equal(gun.canAim(at(20, 0, 0)), true, '正前方'); assert.equal(gun.canAim(at(-20, 0, 0)), false, '背后');
  assert.equal(gun.canAim(at(10, 10, 0)), false, '仰 45° 仰不上去'); assert.equal(gun.canAim(at(10, -10, 0)), true, '俯 45° 打得着');
  assert.equal(gun.canAim(at(2, 0, 20)), false, '侧面 84° 转不过去'); assert.equal(gun.canAim(at(10, 0, 20)), true, '侧面 63°');
  assert.equal(gun.canAim(at(200, 0, 0)), false, '太远');
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), a = aimAngles(q, at(0, 0, 0), at(10, -10, 0));
  assert.ok(Math.abs(a.pitch - Math.PI / 4) < 1e-6 && Math.abs(a.yaw) < 1e-6 && inGunArc(a) && !inGunArc({ ...a, yaw: DOOR_GUN.yaw }));
  gun.dispose();
});

/** 一趟假的清扫：直升机按航线飞（人眼、枪架按 heliGun 算），不开枪；返回推进的办法。survivors：登机时屋顶上再多放几只追人的（守屋顶剩下的）；clear：登机前清场（屋顶上只有当场补的） */
function fakeRide(tower, { survivors = 0, clear = false } = {}) {
  const w = sworld({ tower }), { G, siege, director, begin, cut, run, zombies, player } = w;
  const m = begin(); cut(m.plan.stages.length); run(0.1); for (const z of zombies.alive()) z._deactivate();
  siege.state.hold = SIEGE.hold - 0.2; run(SIEGE.land + 2); director.riding = true;
  const F = m.extraction.flight, frame = heliGun(F.poseAt(0)), aa = { yaw: 0, pitch: 0, dist: 0 };
  let t = 0;
  G.missions = { rideKind: 'helicopter', vehicleCenter: () => { const p = F.poseAt(t); return new THREE.Vector3(p.x, p.y + 1.4, p.z); },
    doorGun: { eye: (o) => o.copy(frame.eye), canAim: (p, from) => inGunArc(aimAngles(frame.q, from || frame.eye, p, aa)) }, rideCanAttack: (z, fresh) => m.extraction.ride.canAttack(z, fresh) };
  if (clear) for (const z of zombies.alive()) z._deactivate();
  for (const q of siege.roofOpen(survivors)) G.enemies.spawn('zombie', q.clone(), { kind: 'walker', hunt: true, state: 'alert' });
  m.extraction.ride.onBoard();
  const step = (secs, each) => { for (let k = 0; k < secs * 30; k++) { t += 1 / 30; G.time.frame++; heliGun(F.poseAt(t), frame); player.pos.copy(frame.eye).y -= 1.62; m.extraction.ride.spawns(1 / 30, t); for (const q of [...w.ctx.list]) q._update(1 / 30); each?.(t); } };
  return { ...w, m, F, frame, step, aa, sw: siege.state.sweep, time: () => t };
}
const inBox = (b, p, pad = 0) => p.x > b.x0 - pad && p.x < b.x1 + pad && p.z > b.z0 - pad && p.z < b.z1 + pad;

test('清扫的屋顶：当场补的那十几只全在露天的屋面上（不在楼梯间、电梯井里），屋顶那一段航线上大多看得见；守屋顶时尸群从楼梯间门外出来，那些点站得住、看得见停机位', () => {
  for (const tower of ['A', 'T1']) {
    const { siege, m, F, sw } = fakeRide(tower, { clear: true }), T = TOWERS[tower], roof = elev(T.roof), boxes = siege.housings(), P = createMapPhysics(nav);
    const lv = L.levels.find((l) => l.id === T.roof), stairs = lv.rooms.filter((r) => r.type === 'stair');
    assert.ok(boxes.length >= stairs.length && stairs.every((r) => boxes.some((b) => r.polys[0].every(([x, z]) => x >= b.x0 - 1e-6 && x <= b.x1 + 1e-6 && z >= b.z0 - 1e-6 && z <= b.z1 + 1e-6))), `${tower} 楼梯间都算进去了`);
    const top = sw.list.filter((z) => z.sweep === 'roof');
    assert.equal(top.length, SIEGE.sweep.surge.start); assert.equal(sw.total.roof, SIEGE.sweep.roof);
    const frames = []; for (let t = F.times.roof + 1; t < F.times.windows; t += 2.5) frames.push(heliGun(F.poseAt(t)));
    const shares = top.map((z) => {
      const st = landAt(nav, z.pos.x, z.pos.z, z.pos.y + 0.6); assert.equal(st.floor, T.roof, `${tower} 在屋面上`); assert.ok(!boxes.some((b) => inBox(b, z.pos, 0.5)), `${tower} (${z.pos.x.toFixed(1)}, ${z.pos.z.toFixed(1)}) 在楼梯间外面`);
      assert.equal(z.post && z.anchor, T.roof, '守在屋面上');
      const c = new THREE.Vector3(z.pos.x, z.pos.y + 1.15, z.pos.z); let n = 0; for (const f of frames) if (P.sightAcross(f.eye, c) && inGunArc(aimAngles(f.q, f.eye, c))) n++;
      return n / frames.length;
    });
    assert.ok(Math.min(...shares) >= 0.2 && shares.reduce((a, b) => a + b, 0) / shares.length >= 0.5, `${tower} 屋顶那一段看得见几成：${shares.map((x) => x.toFixed(2)).join(' ')}`);
    // 楼梯间里面那一点（以前放尖叫者的地方）：看不见、打不着飞机
    const z0 = top[1], r = runs.find((q) => q.to === T.roof); z0.pos.set(r.b.x, roof, r.b.z);
    assert.equal(m.extraction.ride.canAttack(z0, true), false, `${tower} 楼梯间里的打不着飞机`);
    // 守屋顶的出口：楼梯间门外，屋面上站得住、离楼梯间有一段、从信号弹那儿看得见
    const ex = siege.roofExits(), eye = new THREE.Vector3(m.plan.flare.x, roof + 1.6, m.plan.flare.z);
    assert.ok(ex.length >= 1 && ex.every((e) => e.spots.length >= 4), `${tower} 出口 ${ex.length} 个`);
    for (const e of ex) for (const q of e.spots) {
      const st = landAt(nav, q.x, q.z, q.y + 0.6); assert.ok(st && st.floor === T.roof && clear(nav, st));
      assert.ok(!boxes.some((b) => inBox(b, q, 0.5)), `${tower} 出口 (${q.x.toFixed(1)}, ${q.z.toFixed(1)}) 在楼梯间外面`);
      assert.ok(P.lineOfSight(eye, new THREE.Vector3(q.x, q.y + 1.5, q.z)), `${tower} 出口从信号弹那儿看得见`);
    }
    if (tower === 'T1') assert.ok(ex.every((e) => e.x > Math.max(...boxes.map((b) => b.x1)) - 0.5), '北区：出口在机房朝停机位那一头');
    for (const q of siege.roofRim(8)) assert.ok(!boxes.some((b) => inBox(b, q, 0.5)) && P.nav.clearLine(q, { x: T.pad.x, y: roof, z: T.pad.z }), `${tower} 翻墙上来的点和停机位之间没墙`);
  }
});

test('清扫时守点：八十秒假航线上屋顶、楼下的丧尸不往楼里钻（离开自己那一层的马上收回重放）；不开枪时打着飞机的每一下都是飞机上看得见、机枪转得过去的；HUD 只标看得见的', () => {
  for (const tower of ['A', 'T1']) {
    const { G, m, sw, step, frame, aa } = fakeRide(tower), P = createMapPhysics(nav);
    const hits = [], bad = [];
    G.events.on('enemy:fire', (e) => {
      const z = e.enemy; if (!z?.zombie) return;
      const at = e.from || new THREE.Vector3(z.pos.x, z.pos.y + 1.15 * (z.scale || 1), z.pos.z);
      hits.push(e); if (!(P.sightAcross(frame.eye, at) && inGunArc(aimAngles(frame.q, frame.eye, at, aa)))) bad.push([e.type, z.sweep, at.toArray().map((v) => +v.toFixed(1))]);
    });
    let samples = 0, off = 0, maxOff = 0, marks = 0, markBad = 0;
    step(80, (t) => {
      for (const z of sw.list) if (z.alive && z.active && z.post) maxOff = Math.max(maxOff, z.offT || 0);
      if (Math.round(t * 30) % 30) return;
      for (const z of sw.list) {
        if (!z.alive || !z.active || !z.post) continue;
        const st = landAt(nav, z.pos.x, z.pos.z, z.pos.y + 0.6); samples++; if (!st || st.slope || st.floor !== z.anchor) off++;
      }
      const aim = m.extraction.ride.aimTargets(); marks += aim.length; markBad += aim.filter((z) => !z.exposeOn || !z.alive).length;
      assert.ok(aim.length <= m.extraction.ride.targets().length);
    });
    assert.ok(samples > 1000 && off <= samples * 0.01, `${tower} 离开自己那一层 ${off} / ${samples}`);
    assert.ok(maxOff <= SIEGE.sweep.post.off + 0.1, `${tower} 最久离开 ${maxOff.toFixed(2)} 秒`);
    assert.ok(hits.length >= 10, `${tower} 八十秒打着飞机 ${hits.length} 下`);
    assert.deepEqual(bad, [], `${tower} 看不见 / 射界外的打着了飞机`);
    assert.ok(marks > 100 && markBad === 0, `${tower} HUD 标记 ${marks}`);
    assert.ok(sw.list.filter((z) => z.sweep === 'roof').every((z) => !z.alive || z.anchor !== TOWERS[tower].roof), `${tower} 降到低空以后屋顶上剩下的都下到楼下了`);
  }
});

test('清扫的屋顶是一大群、一直在动：守屋顶剩下的接着当屋顶的，再从楼梯间门里涌出来，起飞十几秒屋顶上二十只以上；跟着飞机挪、挤成几堆，不进楼梯间、不离开屋面；HUD 的总数对得上', () => {
  for (const tower of ['A', 'T1']) {
    const { siege, m, sw, step, F, time } = fakeRide(tower, { survivors: 5 }), T = TOWERS[tower], boxes = siege.housings(), U = SIEGE.sweep.surge;
    const kept = sw.list.filter((z) => z.kept);
    // 守屋顶最后那几波、加上这 5 只：屋面上露天的都留下（还在楼梯间里往外走的接着往外走），不够 start 只的当场补
    const outNow = kept.filter((z) => !z.pouring);
    assert.ok(outNow.length >= 5 && kept.every((z) => z.sweep === 'roof' && (z.pouring ? !!z.exitRoute : !z.hunt && z.post && z.anchor === T.roof)), `${tower} 守屋顶剩下的 ${kept.length} 只接着当屋顶的`);
    assert.equal(sw.list.filter((z) => z.sweep === 'roof').length, Math.max(U.start, kept.length), `${tower} 当场补到 ${U.start} 只`);
    assert.ok(sw.total.roof === Math.max(U.start, kept.length) + sw.pour.left && sw.total.roof >= SIEGE.sweep.roof && sw.total.roof <= U.max && sw.pour.left >= U.min, `${tower} 这一拨一共 ${sw.total.roof} 只、还要涌出来 ${sw.pour.left} 只`);
    assert.match(m.text({ allCut: true }, {}), new RegExp(`屋顶 0/${sw.total.roof} `));
    const top = () => sw.list.filter((z) => z.alive && z.active && z.sweep === 'roof' && !z.pouring);
    const open = (z) => { const st = landAt(nav, z.pos.x, z.pos.z, z.pos.y + 0.6); return !!st && !st.slope && st.floor === T.roof && !boxes.some((b) => inBox(b, z.pos)); };
    let most = 0, mostAt = 0, bad = 0, samples = 0, clump = 0, nearer = 0, looks = 0, poured = 0;
    const look = (t) => {
      if (Math.round(t * 30) % 15) return;
      const l = top(), h = F.poseAt(t); most < l.length && (most = l.length, mostAt = t);
      for (const z of l) { samples++; if (!open(z)) bad++; clump = Math.max(clump, l.filter((o) => o !== z && Math.hypot(o.pos.x - z.pos.x, o.pos.z - z.pos.z) < 3).length); }
      poured = Math.max(poured, sw.list.filter((z) => z.sweep === 'roof' && !z.kept && z.pouring === false && !z.postQ).length);
      // 往飞机那一边涌：离飞机（水平）比屋面上的点平均近 3 米以上
      if (t > 8 && l.length) { looks++; const d = (p) => Math.hypot(p.x - h.x, p.z - h.z), a = l.reduce((s, z) => s + d(z.pos), 0) / l.length, b = sw.roofPool.reduce((s, q) => s + d(q), 0) / sw.roofPool.length; if (a < b - 3) nearer++; }
    };
    step(15, look);
    assert.ok(most >= 20 && mostAt <= 15, `${tower} 屋顶上最多同时 ${most} 只（${mostAt.toFixed(1)} 秒）`);
    assert.ok(poured >= Math.min(8, U.peak - U.start - 2), `${tower} 从门里涌出来 ${poured} 只`); // 起飞时当场补到 start 只，门里再涌到 peak 只
    // 一直在动：接下来 8 秒里大多数走了好几米（每 0.5 秒量一次、加起来），公寓屋面大、离开原地也有好几米
    const p0 = new Map(top().map((z) => [z, z.pos.clone()])), last = new Map(top().map((z) => [z, z.pos.clone()])), walk = new Map();
    step(8, (t) => { look(t); if (Math.round(t * 30) % 15) return; for (const [z, p] of last) { walk.set(z, (walk.get(z) || 0) + Math.hypot(z.pos.x - p.x, z.pos.z - p.z)); p.copy(z.pos); } });
    const live = [...p0.keys()].filter((z) => z.alive && z.active), mid = (l) => l.sort((a, b) => a - b)[Math.floor(l.length / 2)];
    const d = live.map((z) => Math.hypot(z.pos.x - p0.get(z).x, z.pos.z - p0.get(z).z)), w = live.map((z) => walk.get(z));
    assert.ok(live.length >= 15 && mid(w) > 4 && (tower !== 'A' || mid(d) > 3), `${tower} 8 秒走了 ${w.map((x) => x.toFixed(1)).join(' ')}，离开原地 ${d.map((x) => x.toFixed(1)).join(' ')}`);
    assert.ok(bad <= samples * 0.02, `${tower} 不在露天屋面上 ${bad} / ${samples}`);
    assert.ok(clump >= 5, `${tower} 挤成堆：一只身边 3 米内最多 ${clump} 只`);
    assert.ok(nearer >= looks * 0.7, `${tower} 往飞机那边涌 ${nearer} / ${looks}`);
    // 打掉屋顶上的，门里接着涌，直到这一拨出齐；HUD 的分子分母对得上
    while (time() < 60 && (sw.pour.left || sw.list.some((z) => z.alive && z.active && z.sweep === 'roof'))) step(1, () => { for (const z of top()) if (z.exposeOn || Math.round(time() * 30) % 30 === 0) z.damage(9999, null, null, 'body'); });
    const hud = /屋顶 (\d+)\/(\d+)/.exec(m.text({ allCut: true }, {}));
    assert.equal(sw.pour.left, 0); assert.ok(hud && +hud[1] === sw.kill.roof && +hud[2] === sw.total.roof && sw.kill.roof === sw.total.roof, `${tower} ${hud?.[0]} 还剩 ${JSON.stringify(sw.list.filter((z) => z.alive && z.sweep === 'roof').map((z) => [z.pouring, !!z.exitRoute, z.exitT?.toFixed(1), z.kept, z.zs, z.pos.toArray().map((v) => +v.toFixed(1))]))} t=${time().toFixed(1)}`);
  }
});

/** 守屋顶开场：前面几步一口气做完、清掉招来的，人站到 at（默认信号弹往停机位走 15%），点着信号弹。seed：这一局的随机序列（默认同 sworld）。返回 { ...sworld, m, T, roof, px, pz, S } */
function holdWorld(tower, at = null, seed = 7) {
  const w = sworld({ tower, seed }), { siege, zombies, player, begin, cut, run } = w;
  const m = begin(), T = TOWERS[tower], roof = elev(T.roof), f = m.plan.flare;
  cut(m.plan.stages.length - 1); run(0.1); for (const z of zombies.alive()) z._deactivate();
  Object.assign(siege.state, { genT: 0, holdT: 0, bruteT: -1 }); // 一口气做完前面几步：商场段发电机、一层守点的倒计时别带到楼顶上来
  const px = at ? at.x : f.x + (m.plan.pad.x - f.x) * 0.15, pz = at ? at.z : f.z + (m.plan.pad.z - f.z) * 0.15; player.pos.set(px, roof, pz);
  return { ...w, m, T, roof, px, pz, S: siege.state, light: () => { cut(1); run(1 / 30); } };
}
/** 楼梯间里（屋面上的楼梯间盒子里，或者通到屋顶的那几跑楼梯、休息平台、下一层的楼梯口上） */
const inStairs = (siege, roof, q) => q.y < roof - 0.3 || siege.housings().some((b) => inBox(b, q));
test('清扫时楼顶摆着机枪阵地（台子、沙袋墙在导航里）：屋顶那一拨照样一大群——起飞时露天的屋面上就有 26 只以上、一拨一共 40 只左右、同时最多 34 只；都在屋面上、不在台子和沙袋墙里，跟着飞机挤成几堆', () => {
  const U = SIEGE.sweep.surge;
  assert.ok(SIEGE.sweep.roof >= 40 && U.peak >= 34 && U.start >= 26, `一拨 ${SIEGE.sweep.roof}、同时 ${U.peak}、起飞时 ${U.start}`);
  assert.ok(ZOMBIE.pool >= U.peak + SIEGE.sweep.window + Math.ceil(SIEGE.sweep.ground / 2), `池子 ${ZOMBIE.pool} 放得下屋顶 + 阳台 + 楼下第一批`);
  for (const tower of ['A', 'T1']) {
    const T = TOWERS[tower], g = siteGeom(ROOF_GUN.sites[tower][0], elev(T.roof));
    const bl = [blockNav(nav, T.roof, g.poly, ROOF_GUN.deck.h), ...g.walls.map((w) => blockNav(nav, T.roof, w.poly, ROOF_GUN.bags.top))];
    try {
      const { sw, step } = fakeRide(tower, { clear: true });
      const top = () => sw.list.filter((z) => z.alive && z.active && z.sweep === 'roof' && !z.pouring);
      const inWorks = (z) => (z.pos.x > g.bb.x0 && z.pos.x < g.bb.x1 && z.pos.z > g.bb.z0 && z.pos.z < g.bb.z1) || g.walls.some((w) => { let pos = 0, neg = 0; for (let i = 0; i < 4; i++) { const a = w.poly[i], b = w.poly[(i + 1) % 4], c = (b[0] - a[0]) * (z.pos.z - a[1]) - (b[1] - a[1]) * (z.pos.x - a[0]); if (c > 0) pos++; else neg++; } return !pos || !neg; });
      assert.ok(top().length >= U.start, `${tower} 起飞时屋面上 ${top().length} 只`);
      assert.ok(sw.total.roof >= SIEGE.sweep.roof && sw.total.roof <= U.max, `${tower} 这一拨一共 ${sw.total.roof} 只`);
      let most = 0, bad = 0, n = 0, clump = 0, wired = 0;
      step(20, (t) => {
        if (Math.round(t * 30) % 15) return;
        const l = top(); most = Math.max(most, l.length);
        for (const z of l) { n++; if (inWorks(z)) bad++; if (g.wire.some((w) => segDist2(z.pos.x, z.pos.z, w.a, w.b) < ROOF_GUN.wire.r)) wired++; clump = Math.max(clump, l.filter((o) => o !== z && Math.hypot(o.pos.x - z.pos.x, o.pos.z - z.pos.z) < 3).length); }
      });
      assert.ok(most >= U.peak - 6, `${tower} 屋顶上最多同时 ${most} 只`);
      assert.equal(bad, 0, `${tower} 没有一只在台子 / 沙袋墙里（${n} 次）`);
      assert.ok(clump >= 6, `${tower} 挤成堆：一只身边 3 米里最多 ${clump} 只`);
    } finally { for (const b of bl.reverse()) unblockNav(nav, b); }
  }
});


test('只挡跨楼层射线的方盒（清扫时的阳台）：castAcross / sightAcross 挡、法线朝来的方向；raycast（走路、丧尸看人、平时的子弹）照旧不挡；撤掉就不挡。打在楼板上的法线朝上', () => {
  const P = createMapPhysics(nav), roof = elev('A-RF'), sky = new THREE.Vector3(SIEGE.pad.x + 80, 400, SIEGE.pad.z), east = new THREE.Vector3(1, 0, 0);
  assert.equal(P.castAcross(sky, east, 50), null, '天上什么都没有');
  const box = P.addOccluder({ x0: sky.x + 10, y0: 399, z0: sky.z - 1, x1: sky.x + 11, y1: 401, z1: sky.z + 1 }, { tag: 'balcony' });
  const hit = P.castAcross(sky, east, 50);
  assert.ok(hit && Math.abs(hit.dist - 10) < 1e-6 && hit.normal.x === -1 && hit.box === box && Math.abs(hit.point.x - sky.x - 10) < 1e-6, '截在方盒朝人那一面上');
  assert.equal(P.sightAcross(sky, new THREE.Vector3(sky.x + 20, 400, sky.z)), false);
  assert.equal(P.raycast(sky, east, 50), null, 'raycast 不查它');
  assert.equal(P.castAcross(new THREE.Vector3(sky.x + 10.5, 400, sky.z), east, 50), null, '起点在盒子里不算');
  P.removeOccluder(box); assert.equal(P.castAcross(sky, east, 50), null, '撤掉了');
  // 往下打在屋面上：法线朝上（以前跨楼层射线打在楼板上法线是零，火花朝哪都不知道）；中间隔着一块方盒，截在它顶面
  const eye = new THREE.Vector3(SIEGE.pad.x + 2, roof + 12, SIEGE.pad.z), down = new THREE.Vector3(0, -1, 0);
  const floor = P.castAcross(eye, down, 50); assert.ok(floor && Math.abs(floor.dist - 12) < 1e-6 && floor.normal.y === 1, `打在屋面上 ${floor?.dist} ${floor?.normal.toArray()}`);
  P.addOccluder({ x0: eye.x - 1, y0: roof + 5, z0: eye.z - 1, x1: eye.x + 1, y1: roof + 6, z1: eye.z + 1 });
  const top = P.castAcross(eye, down, 50); assert.ok(Math.abs(top.dist - 6) < 1e-6 && top.normal.y === 1);
});

test('舱门机枪（零点突围的车顶机枪也是它）：子弹截在 castAcross 找到的墙 / 阳台顶板上，那儿照样冒火花（impact 事件带 point、朝着来的方向的 normal——原游戏的火花、声音按 point 读）；打中了敌人的不另报', () => {
  const P = createMapPhysics(nav), roof = elev('A-RF'), run = runs.find((r) => r.to === 'A-RF'), A = L.buildings.find((b) => b.id === 'A'), x1 = Math.max(...A.outline.map((p) => p[0]));
  const ev = [], ranges = []; let reply = null;
  const G = { physics: P, events: { emit(n, e) { if (n === 'impact') ev.push(e); }, on() {} }, combat: { playerShot: (o, d, opt) => { ranges.push(opt.range); return reply; } }, fx: {} };
  const mount = new THREE.Object3D(), cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000), gun = createDoorGun(G, mount);
  const fire = (eye, at) => { for (const o of [mount, cam]) { o.position.copy(eye); o.lookAt(at); o.updateMatrixWorld(true); } ev.length = 0; ranges.length = 0; for (let k = 0; k < 30; k++) gun.update(1 / 30, { active: true, firing: true, camera: cam }); };
  // 楼梯间外墙（raycast 从楼外看不见它，以前 playerShot 什么都不报：曳光弹停在墙上，没火花没弹孔）
  const eye = new THREE.Vector3(x1 + 24, roof + 2.5, run.b.z), inside = new THREE.Vector3(run.b.x, roof + 1.15, run.b.z);
  fire(eye, inside);
  assert.ok(ranges.length >= 8 && ev.length === ranges.length, `开了 ${ranges.length} 枪，火花 ${ev.length} 处`);
  for (const e of ev) {
    assert.ok(e.point && e.normal && e.surface && e.from === 'player' && e.enemy === null);
    assert.ok(Math.abs(e.normal.y) < 1e-6 && e.normal.dot(e.dir) < 0, '墙的法线朝着开枪的人');
    assert.ok(eye.distanceTo(e.point) < eye.distanceTo(inside) - 0.5, '截在墙上，没进楼梯间');
  }
  // 阳台：顶板挡着里面的人（飞机在正上方往下打）——子弹截在顶板上（range 不超过顶板），顶板上冒火花、法线朝上
  const y = elev('A-20F'), s = { x: x1 + 0.75, y, z: SIEGE.pad.z + 6 }, g = balconyModel(); g.position.set(s.x, s.y, s.z); g.updateMatrixWorld(true);
  for (const q of balconyBoxes(g)) P.addOccluder(q);
  const chest = new THREE.Vector3(s.x + SIEGE.sweep.balcony.front, y + 1.15, s.z);
  fire(chest.clone().setY(y + 40), chest);
  assert.ok(ranges.length >= 8 && ranges.every((r) => r < 40 - 1.15 - 1.3 + 0.01), `子弹截在顶板上：${ranges.map((r) => r.toFixed(2)).join(' ')}`);
  assert.ok(ev.length === ranges.length && ev.every((e) => Math.abs(e.point.y - (y + 2.55)) < 0.02 && e.normal.y === 1), '顶板上冒火花');
  // playerShot 打中了东西（它自己报过 impact）：不再另报
  reply = { point: chest.clone(), dist: 1 }; fire(chest.clone().setY(y + 40), chest); assert.ok(ranges.length > 0 && ev.length === 0);
  // 法线没有（老数据）就朝着来的方向
  const d = new THREE.Vector3(0, -1, 0), e = impactAt({ point: new THREE.Vector3(1, 2, 3), normal: new THREE.Vector3(), dist: 5 }, d);
  assert.deepEqual([e.normal.toArray().map((v) => v + 0), e.surface, e.point.toArray()], [[0, 1, 0], 'concrete', [1, 2, 3]]);
  gun.dispose();
});

test('清扫时阳台里的：阳台的楼板、挡板登记成挡跨楼层射线的方盒（下一局撤掉）；人贴着玻璃站——算成露出来（红点、能扔）的那一刻，对着真的阳台网格从机枪那儿看胸口不挡；每一只航线上都有一两成时间露出来；换点前的打分分到各帧（一帧最多二十来条跨楼层射线）', () => {
  for (const tower of ['A', 'T1']) {
    const { G, m, sw, step, frame, siege } = fakeRide(tower);
    const win = sw.list.filter((z) => z.sweep === 'window');
    assert.equal(win.length, SIEGE.sweep.window); assert.equal(G.physics.occluders.length, win.length * 5, `${tower} 每个阳台五块（楼板、顶板、两块挡板、背板）`);
    const meshes = []; G.scene.updateMatrixWorld(true);
    G.scene.traverse((o) => { if (o.isMesh && o.parent?.name === '阳台' && !o.material.transparent) meshes.push(o); });
    assert.equal(meshes.length, win.length * 5);
    let casts = 0, maxCasts = 0, n = 0; const bad = [], seen = new Map(win.map((z) => [z, 0])), rc = new THREE.Raycaster();
    const orig = G.physics.castAcross; G.physics.castAcross = function (...a) { casts++; return orig.apply(this, a); };
    step(70, (t) => {
      maxCasts = Math.max(maxCasts, casts);
      if (Math.round(t * 30) % 15 === 0) {
        n++;
        for (const z of win) {
          if (!z.alive || !m.extraction.ride.canAttack(z, true)) continue;
          seen.set(z, seen.get(z) + 1);
          const c = new THREE.Vector3(z.pos.x, z.pos.y + 1.15, z.pos.z), d = c.clone().sub(frame.eye), len = d.length();
          rc.set(frame.eye, d.normalize()); rc.near = 0.1; rc.far = len - 0.05;
          if (rc.intersectObjects(meshes, false).length) bad.push([+t.toFixed(1), +z.pos.y.toFixed(1)]);
        }
      }
      casts = 0;
    });
    assert.deepEqual(bad, [], `${tower} 算成露出来、其实被阳台挡着`);
    const share = win.map((z) => seen.get(z) / n);
    assert.ok(Math.min(...share) >= 0.1, `${tower} 每只露出来几成：${share.map((x) => x.toFixed(2)).join(' ')}`);
    assert.ok(maxCasts <= 24, `${tower} 一帧最多 ${maxCasts} 条跨楼层射线`);
    G.physics.castAcross = orig;
    siege.reset(); assert.equal(G.physics.occluders.length, 0, `${tower} 下一局撤掉`);
  }
});

test('清扫打得快的：楼下第一批打光了第二批马上冲出来（不干转几十秒）；被打死的扔出来的东西落下来不再砸飞机；高层阳台够不着的那几只清完的时候从总数里去掉，HUD 和「全部清掉了」对得上', () => {
  const fires = [];
  for (const [tower, passive] of [['A', 0], ['T1', 45]]) {
    const { G, m, sw, step, msgs, time } = fakeRide(tower), F = m.extraction.flight;
    G.events.on('enemy:fire', (e) => { if (e.enemy?.zombie) fires.push(!!e.enemy.alive); });
    let kt = 0, empty = 0, maxEmpty = 0, earlyAt = null;
    const each = (t) => {
      if (t > passive && (kt += 1 / 30) > 0.6) { kt = 0; const a = m.extraction.ride.aimTargets(); if (a.length) a[Math.floor(a.length / 2)].damage(9999, null, null, 'body'); }
      if (sw.early && earlyAt === null) earlyAt = t;
      if (t > 10 && !sw.offered) { empty = m.extraction.ride.targets().length ? 0 : empty + 1 / 30; maxEmpty = Math.max(maxEmpty, empty); }
    };
    while (!sw.offered && time() < 140) step(1, each);
    assert.ok(sw.offered, `${tower} 清完了 ${JSON.stringify(sw.kill)} / ${JSON.stringify(sw.total)}`);
    assert.ok(maxEmpty <= 3, `${tower} 最长 ${maxEmpty.toFixed(1)} 秒一只都没有`);
    if (!passive) assert.ok(earlyAt !== null && earlyAt < F.times.ground - 6, `${tower} 第二批 ${earlyAt?.toFixed(1)} 秒就来了`);
    assert.ok(msgs.includes('R:楼下又冲出来一批！') || !sw.early);
    assert.ok(fires.every(Boolean), `${tower} 砸着飞机的 ${fires.length} 下里有已经死了的`);
    // 清完的那一刻：HUD 的每一项都是满的（够不着的去掉了），场上一只都不剩
    const hud = /屋顶 (\d+)\/(\d+) · 阳台 (\d+)\/(\d+) · 楼下 (\d+)\/(\d+)/.exec(m.text({ allCut: true }, {}));
    assert.ok(hud && hud[1] === hud[2] && hud[3] === hud[4] && hud[5] === hud[6], `${tower} ${hud?.[0]}`);
    assert.equal(m.extraction.ride.targets().length, 0);
    assert.ok(sw.total.window <= SIEGE.sweep.window && sw.total.roof === sw.kill.roof && (passive || sw.total.roof >= 20) && sw.total.ground === SIEGE.sweep.ground, `${tower} ${JSON.stringify(sw.total)}`);
  }
  assert.ok(fires.length >= 3, `一共砸着飞机 ${fires.length} 下`);
});

test('清扫要用的点：开局（爬楼的落点算完）就在后台分帧算，点信号弹以前就算好了；每一小步最多两条跨楼层视线；楼下的点街上、商场屋面都有', () => {
  const { G, siege, begin, run } = sworld();
  begin(); siege.prepareFloors(); const S = siege.state;
  assert.equal(S.prepOut, null); run(1 / 30); assert.ok(S.prep, '开局就开始算');
  let casts = 0, worst = 0; const orig = G.physics.castAcross; G.physics.castAcross = function (...a) { casts++; return orig.apply(this, a); };
  for (let i = 0; i < 40000 && !S.prepOut; i++) { casts = 0; S.prep.next(); worst = Math.max(worst, casts); }
  G.physics.castAcross = orig;
  assert.ok(S.prepOut && worst <= 2, `每一小步最多 ${worst} 条`);
  assert.equal(S.hold, -1, '还没点信号弹');
  const P = S.prepOut;
  assert.ok(P.roofPool.length >= 30 && P.groundPool.length >= 50, `屋顶 ${P.roofPool.length}、楼下 ${P.groundPool.length}`);
  assert.ok(P.groundPool.some((q) => q.where === 'street') && P.groundPool.some((q) => q.where === 'mall'));
  assert.ok([...P.roofPool, ...P.groundPool].every((q) => q.pooled));
});

test('坐飞机时（看炸楼那一段也是）治疗、路障键收起来（手机上拖着转视角老按到）；手机上的无线电字幕挪到屏幕最底下，不挡准星', () => {
  assert.match(DOOR_GUN_CSS, /\.jm-riding \.t-heal, \.jm-riding \.t-wall[^{]*\{ display: none !important; \}/);
  assert.match(DOOR_GUN_CSS, /\.is-touch \.jm-riding \.comms \{ top: auto !important; bottom: calc\(8px/);
});

test('守屋顶：人隔 0.7 秒打死一只，每一波都出得满、最后那阵也出得来；楼梯口那一份在楼梯间里、人看不见的地方冒出来，自己走出门上了露天的屋面；翻墙的离人 10 米以外；屋面上看得见一大群；点信号弹时楼里落在下面的收掉；没出来就不喊「第几波」', () => {
  for (const tower of ['A', 'T1']) {
    const { G, siege, zombies, enemies, player, run, msgs, T, roof, px, pz, S, light } = holdWorld(tower);
    // 楼里还有一群追上来的（落在十五层）
    const deep = []; for (let k = 0; k < 40 && deep.length < 10; k++) { const q = G.physics.nav.randomPoint({ x: T.pad.x, y: elev(`${T.id}-15F`), z: T.pad.z }, 14); if (Math.abs(q.y - elev(`${T.id}-15F`)) < 0.3) { const z = enemies.spawn('zombie', q, { hunt: true, state: 'alert' }); if (z) deep.push(z); } }
    assert.ok(deep.length >= 5);
    const born = [], spawn0 = enemies.spawn.bind(enemies), P = createMapPhysics(nav), eye = new THREE.Vector3(px, roof + 1.6, pz), at = new THREE.Vector3();
    enemies.spawn = (type, pos, opts) => {
      const z = spawn0(type, pos, opts);
      if (z) born.push({ t: S.hold, x: pos.x, y: pos.y, z: pos.z, zb: z, id: (z.__life = (z.__life || 0) + 1), door: inStairs(siege, roof, pos), seen: P.sightAcross(eye, at.set(pos.x, pos.y + 1.55, pos.z)) || P.sightAcross(eye, at.set(pos.x, pos.y + 0.8, pos.z)), d: Math.hypot(pos.x - px, pos.y - roof, pos.z - pz) });
      return z;
    };
    light(); assert.ok(S.hold >= 0, '点着了');
    assert.ok(deep.every((z) => !z.active), '楼里落在下面的收回池子');
    const chest = new THREE.Vector3(), out = new Map(), seenN = [], aliveN = []; let k = 0;
    run(SIEGE.hold - 0.5, () => {
      player.pos.set(px, roof, pz);
      for (const b of born) if (b.door && !out.has(b) && b.zb.__life === b.id && b.zb.alive && b.zb.active && !inStairs(siege, roof, b.zb.pos)) out.set(b, S.hold - b.t);
      if (++k % 30 === 0) { seenN.push([S.hold, zombies.alive().filter((z) => Math.abs(z.pos.y - roof) < 1 && G.physics.lineOfSight(eye, chest.set(z.pos.x, z.pos.y + 1.2, z.pos.z))).length]); aliveN.push([S.hold, zombies.alive().length]); }
      if (k % 21) return; // 0.7 秒打死一只看得见的（最近的）
      let best = null, bd = Infinity;
      for (const z of zombies.alive()) { if (Math.abs(z.pos.y - roof) > 1) continue; chest.set(z.pos.x, z.pos.y + 1.2, z.pos.z); const d = eye.distanceTo(chest); if (d < bd && G.physics.lineOfSight(eye, chest)) { bd = d; best = z; } }
      best?.damage(9999, null, null, 'body');
    });
    const inWin = (a, b) => born.filter((q) => q.t >= a && q.t < b).length;
    // 北区一波 22–25 只、只有一个口子：人打得慢（这里 0.7 秒才打死一只）的话屋顶上活着的就把池子占满了，那一波等腾出位置再出来——只有这时候才许出不满
    const packed = (a, b) => aliveN.some(([t, n]) => t >= a && t < b && n >= ZOMBIE.pool - 4);
    SIEGE.waves.slice(0, 5).forEach((w, i) => assert.ok(inWin(w, w + 7) >= SIEGE.waveSize[0] || (tower === 'T1' && packed(w, w + 7)), `${tower} 第 ${i + 1} 波出来 ${inWin(w, w + 7)} 只`));
    const surge = inWin(SIEGE.hold - SIEGE.surge.last, SIEGE.hold);
    assert.ok(surge >= SIEGE.surge.each * 4, `${tower} 最后那阵出来 ${surge} 只`);
    // 楼梯口那一份：楼梯间里、人看不见、离人 5 米以外冒出来；翻墙上来的：屋面上、楼梯间外、离人 10 米以外
    const door = born.filter((q) => q.door), rim = born.filter((q) => !q.door);
    assert.ok(door.length > born.length * 0.5, `${tower} 大半从楼梯口来（${door.length} / ${born.length}）`);
    for (const q of door) { assert.equal(q.seen, false, `${tower} (${q.x.toFixed(1)}, ${q.y.toFixed(1)}, ${q.z.toFixed(1)}) 冒出来的时候人看得见`); assert.ok(q.d >= SIEGE.spawn.doorNear, `${tower} 离人 ${q.d.toFixed(1)} 米就冒出来`); }
    for (const q of rim) {
      const st = landAt(nav, q.x, q.z, q.y + 0.6);
      assert.ok(st && st.floor === T.roof && Math.abs(q.y - roof) < 0.3 && !siege.housings().some((b) => inBox(b, q)), `${tower} 翻墙上来的在露天的屋面上`);
      assert.ok(Math.hypot(q.x - px, q.z - pz) >= SIEGE.spawn.rimNear, `${tower} 翻墙上来的离人 ${Math.hypot(q.x - px, q.z - pz).toFixed(1)} 米`);
    }
    // 门里冒出来的自己走出门（以前放在楼梯顶的卡在门框的墙角上出不来）：活过 15 秒的九成以上 15 秒内上了露天的屋面
    const lived = door.filter((q) => q.t < SIEGE.hold - 16 && (out.has(q) || (q.zb.__life === q.id && q.zb.alive && q.zb.active)));
    assert.ok(lived.length > 20 && lived.filter((q) => out.has(q) && out.get(q) < 15).length >= lived.length * 0.9, `${tower} 门里出来的 ${lived.filter((q) => out.has(q)).length} / ${lived.length} 走出了门`);
    // 屋面上看得见一大群：每一波都有好几只同时看得见，最后那阵更多
    const peak = (a, b) => Math.max(0, ...seenN.filter(([t]) => t >= a && t < b).map(([, n]) => n));
    SIEGE.waves.forEach((w, i) => assert.ok(peak(w, w + 10) >= 4, `${tower} 第 ${i + 1} 波同时看得见的最多 ${peak(w, w + 10)} 只`));
    assert.ok(peak(SIEGE.hold - SIEGE.surge.last, SIEGE.hold) >= 12, `${tower} 最后那阵同时看得见 ${peak(SIEGE.hold - SIEGE.surge.last, SIEGE.hold)} 只`);
    // 楼梯口那一份是一只只出来的：同一帧里每个口子最多一只（巨尸、特殊感染者、尖叫招来的也排在同一个队里）
    const exits = siege.roofExits().filter((e) => e.inner?.length).length, byD = {};
    for (const q of door) { const key = Math.round(q.t * 30); byD[key] = (byD[key] || 0) + 1; }
    assert.ok(Math.max(0, ...Object.values(byD)) <= exits, `${tower} 同一帧从 ${exits} 个楼梯口出来 ${Math.max(0, ...Object.values(byD))} 只`);
    // 同一帧一共最多几只：翻墙的那几只是一起上来的（一波最多 round(18 × 0.35) = 6 只，北区翻墙的点少），加上每个口子各一只。
    // 上限 10 留了余量：清扫的点改成开局就在后台算、不再从这一局的随机序列里取数以后，守屋顶这段的随机数换了一串（合并时量到公寓 8 只、北区 2 只）
    const byT = {}; for (const q of born) { const key = Math.round(q.t * 30); byT[key] = (byT[key] || 0) + 1; }
    assert.ok(Math.max(...Object.values(byT)) <= 10, `${tower} 同一帧出来 ${Math.max(...Object.values(byT))} 只`);
    // 喊「第几波」要真出来了才喊（最后一两波池子里全是活着的、一只都出不来就不喊）
    // 北区一波 26–30 只、人打得慢的时候池子满了，后面那一波排在队里出不来——那就不喊（照样只许在池子满了的时候）
    for (let i = 1; i <= 5; i++) assert.ok(msgs.some((t) => String(t).startsWith(`第 ${i} 波`)) || (tower === 'T1' && packed(SIEGE.waves[i - 1], SIEGE.hold)), `${tower} 喊了第 ${i} 波`);
    SIEGE.waves.forEach((w, i) => { if (msgs.some((t) => String(t).startsWith(`第 ${i + 1} 波`))) assert.ok(born.some((q) => q.t >= w), `${tower} 第 ${i + 1} 波喊了就有出来的`); });
    assert.ok(siege.onRoof(player.pos), '人在露天的屋面上（雾退远）');
  }
});

test('守屋顶时不在人眼皮底下冒出来：人堵在楼梯间门口、站在出口上、站在登机门口，旁边站着队友——楼梯口的一只都不在人、队友 5 米内冒出来，人看不见；翻墙上来的离人、离队友 10 米以外；巨尸、特殊感染者、尖叫招来的也走楼梯口', () => {
  for (const tower of ['A', 'T1']) {
    const probe = holdWorld(tower), ex = probe.siege.roofExits(), pad = probe.m.plan.pad;
    const spots = [{ name: '出口', ...ex[0] }, { name: '门洞', x: ex[0].door.x + ex[0].door.dx * 0.6, z: ex[0].door.z + ex[0].door.dz * 0.6 }, { name: '登机门', x: pad.x - 0.25, z: pad.z - 1.75 }];
    for (const at of spots) {
      const { G, siege, enemies, player, run, roof, S, light } = holdWorld(tower, at);
      const mate = { active: true, pos: new THREE.Vector3(at.x + 2.5, roof, at.z + 1.5) }; G.squad = { mates: [mate] };
      const born = [], spawn0 = enemies.spawn.bind(enemies), P = createMapPhysics(nav), eye = new THREE.Vector3(at.x, roof + 1.6, at.z), h = new THREE.Vector3();
      enemies.spawn = (type, pos, opts) => { const z = spawn0(type, pos, opts); if (z) born.push({ kind: z.kind, x: pos.x, y: pos.y, z: pos.z, door: inStairs(siege, roof, pos), seen: P.sightAcross(eye, h.set(pos.x, pos.y + 1.55, pos.z)) || P.sightAcross(eye, h.set(pos.x, pos.y + 0.8, pos.z)), d: Math.hypot(pos.x - at.x, pos.y - roof, pos.z - at.z), dm: Math.hypot(pos.x - mate.pos.x, pos.y - roof, pos.z - mate.pos.z) }); return z; };
      light();
      siege.spawnSpecial(); G.events.emit('zombie:scream', { pos: player.pos.clone() }); // 守屋顶时的特殊感染者、尖叫招来的
      const bw = (TOWERS[tower].hold?.brutes || SIEGE.brutes)[0]; S.hold = SIEGE.waves[bw - 1] - 0.1; S.waveI = bw - 1; // 下一波带巨尸
      run(24, () => player.pos.set(at.x, roof, at.z));
      assert.ok(born.length > 20, `${tower} ${at.name} 出来了 ${born.length} 只`);
      assert.ok(born.some((q) => q.kind === 'brute' && q.door), `${tower} ${at.name} 巨尸从楼梯口来`);
      for (const q of born) {
        if (q.door) { assert.ok(q.d >= SIEGE.spawn.doorNear && q.dm >= SIEGE.spawn.doorNear, `${tower} ${at.name}：楼梯口那只离人 ${q.d.toFixed(1)}、离队友 ${q.dm.toFixed(1)} 米`); assert.equal(q.seen, false, `${tower} ${at.name}：楼梯口那只冒出来时人看得见`); }
        else assert.ok(Math.hypot(q.x - at.x, q.z - at.z) >= SIEGE.spawn.rimNear && Math.hypot(q.x - mate.pos.x, q.z - mate.pos.z) >= SIEGE.spawn.rimNear, `${tower} ${at.name}：翻墙那只离人 ${q.d.toFixed(1)} 米`);
      }
    }
  }
});

test('守屋顶：楼梯间门口横一道路障，门里出来的被挡在里面（挡到路障被冲垮，至少挡三秒）；不摆的话同一阵早就涌出来了', () => {
  const outBy = (tower, wall, seed) => {
    const { siege, zombies, player, run, roof, px, pz, S, light } = holdWorld(tower, null, seed), walls = siege.walls;
    // 人站在门洞正中外面两米，朝门里摆：沙袋墙横在门洞外 0.3 米
    if (wall) { walls.enabled = true; walls.give(4); for (const e of siege.roofExits()) { const g = e.gap; assert.ok(g && g.w > 1 && g.w < 4.4, `${tower} 门洞 ${g?.w?.toFixed(1)} 米宽`); player.pos.set(g.x + g.nx * 2, roof, g.z + g.nz * 2); player.yaw = Math.atan2(g.nx, g.nz); assert.ok(walls.place(), `${tower} 门口摆得下`); } player.pos.set(px, roof, pz); }
    light();
    const door = new Set(), out = new Set(), line = []; let first = null, broke = null;
    run(14, () => {
      player.pos.set(px, roof, pz);
      for (const z of zombies.alive()) { if (z.exitRoute) door.add(z); if (door.has(z) && !out.has(z) && !inStairs(siege, roof, z.pos)) { out.add(z); first ??= S.hold; } }
      if (wall && broke === null && walls.walls.some((w) => w.fallT >= 0)) broke = S.hold;
      line.push([S.hold, out.size]);
    });
    return { first, broke, door: door.size, by: (t) => (line.filter(([h]) => h <= t).at(-1) || [0, 0])[1], hurt: walls.walls.some((w) => w.hp < DEFENSE.wall.hp) || walls.walls.length < siege.roofExits().length };
  };
  // 出了门的只有几只到十几只，差一只比例就跳一截（北区一局 5 / 10 和 6 / 10 只差随机序列换了一串）：按几串随机序列加起来比
  for (const tower of ['A', 'T1']) {
    let heldN = 0, openN = 0; const each = [];
    for (const seed of [7, 11, 13, 17, 19, 23]) {
      const open = outBy(tower, false, seed), held = outBy(tower, true, seed), t = held.broke ?? 14;
      assert.ok(open.door >= 6 && open.by(t) >= 2, `${tower}#${seed} 不摆：${t.toFixed(1)} 秒内 ${open.by(t)} / ${open.door} 只出了门`);
      assert.ok(t >= 3, `${tower}#${seed} 路障挡了 ${t.toFixed(1)} 秒`);
      assert.ok(held.hurt, `${tower}#${seed} 路障被它们磨掉了耐久`);
      heldN += held.by(t); openN += open.by(t); each.push(`${held.by(t)}/${open.by(t)}`);
    }
    assert.ok(heldN <= openN * 0.5, `${tower} 路障冲垮之前出了门 ${heldN} 只（不摆的话同一阵 ${openN} 只；每串 ${each.join(' ')}）`);
  }
});

test('守屋顶池子满了：先收尸体，再收人看不见、离人 15 米以外的（最远的先收）；人退到下一层楼，追到跟前、看得见的一只都不收；排着队出不来时隔一阵收一只人视野外、20 米外的', () => {
  // 人退到公寓 20 层（屋面下 6.5 米）：五十秒里收掉的没有一只在人 15 米内、也没有一只看得见（以前当着面一只只没了）
  {
    const { G, siege, zombies, player, run, T, roof, S, light } = holdWorld('A');
    light();
    const r = runs.find((q) => q.to === T.roof && q.id.startsWith(T.stair)), below = r.a, eye = new THREE.Vector3(), h = new THREE.Vector3(); let culled = 0, bad = [];
    for (const z of zombies.pool) { const d0 = z._deactivate; z._deactivate = function () { if (this.alive && this.active) { culled++; eye.set(player.pos.x, player.pos.y + 1.6, player.pos.z); const d = this.pos.distanceTo(player.pos); if (d < SIEGE.cull.near || createMapPhysics(nav).sightAcross(eye, h.set(this.pos.x, this.pos.y + 1.5, this.pos.z))) bad.push(d.toFixed(1)); } return d0.call(this); }; }
    run(50, () => player.pos.set(below.x, elev(r.from), below.z));
    assert.ok(culled > 5, `池子满了也收了 ${culled} 只（远处看不见的）`);
    assert.deepEqual(bad, [], '收掉的里面有人跟前 / 看得见的');
    assert.ok(roof - player.pos.y > 6 && S.hold > 40);
    void G;
  }
  // 直接看 makeRoom：池子塞满活的——人跟前看得见的、远处看不见的；只收后者，收完了就不收
  {
    const { siege, zombies, enemies, player, roof, px, pz, light } = holdWorld('A');
    light(); for (const z of zombies.alive()) z._deactivate();
    const near = [], far = [];
    for (let i = 0; near.length < 30 && i < 200; i++) { const a = i * 0.7, q = new THREE.Vector3(px + Math.cos(a) * (3 + (i % 5)), roof, pz + Math.sin(a) * (3 + (i % 5))); const st = landAt(nav, q.x, q.z, roof + 0.6); if (!st || st.floor !== 'A-RF' || !clear(nav, st)) continue; const z = enemies.spawn('zombie', q, { kind: 'walker', hunt: true, state: 'alert' }); if (z) near.push(z); }
    const ex = siege.roofExits(); for (const q of ex.flatMap((e) => e.inner)) { const z = enemies.spawn('zombie', q.clone(), { kind: 'walker', hunt: true, state: 'alert' }); if (z) far.push(z); }
    while (zombies.pool.some((z) => !z.active)) { const z = enemies.spawn('zombie', new THREE.Vector3(px + 1, roof, pz + 1), { kind: 'walker' }); if (!z) break; near.push(z); }
    const P = createMapPhysics(nav), eye = new THREE.Vector3(px, roof + 1.6, pz), h = new THREE.Vector3();
    const hidden = far.filter((z) => z.pos.distanceTo(player.pos) > SIEGE.cull.near && !P.sightAcross(eye, h.set(z.pos.x, z.pos.y + 1.5, z.pos.z)) && !P.sightAcross(eye, h.set(z.pos.x, z.pos.y + 0.8, z.pos.z))).length;
    assert.ok(hidden >= 4, `楼梯间里看不见的 ${hidden} 只`);
    let n = 0; while (siege.makeRoom()) n++;
    assert.equal(n, hidden, '楼梯间里看不见、15 米外的都收了');
    assert.ok(near.every((z) => z.active && z.alive), '人跟前看得见的一只没收');
  }
  // 排着队出不来：池子里全是活的、都看得见（屋面上）；人背后 20 米外的隔一阵收一只，面前的不收
  {
    const { siege, zombies, enemies, player, run, roof, px, pz, S, light } = holdWorld('A');
    light(); for (const z of zombies.alive()) z._deactivate();
    player.yaw = 0; // 面朝 −z（北）
    const front = [], back = [];
    const grid = []; for (let x = -52; x <= -18; x += 2.2) for (let z = -250; z <= -180; z += 2.2) { const st = landAt(nav, x, z, roof + 0.6); if (st && st.floor === 'A-RF' && clear(nav, st) && !siege.housings().some((b) => inBox(b, { x, z }, 0.8))) grid.push(new THREE.Vector3(x, st.y, z)); }
    for (const q of grid) { if (zombies.pool.every((z) => z.active)) break; const d = Math.hypot(q.x - px, q.z - pz); if (d < 21) continue; const z = enemies.spawn('zombie', q, { kind: 'walker', fixed: true }); if (z) (siege.inView(q) ? front : back).push(z); } // 钉在原地（看收的是哪些）
    assert.ok(zombies.pool.every((z) => z.active) && back.length >= 4 && front.length >= 4, `前 ${front.length} 后 ${back.length}`);
    S.waveI = SIEGE.waves.length; S.hold = 30; // 不再来新的波次，只看排着的队
    const t0 = S.retired || 0, gone = [], P = createMapPhysics(nav), eye = new THREE.Vector3(px, roof + 1.6, pz), h = new THREE.Vector3();
    for (const z of zombies.pool) { const d0 = z._deactivate; z._deactivate = function () { if (this.alive && this.active) gone.push({ view: siege.inView(this.pos), seen: P.sightAcross(eye, h.set(this.pos.x, this.pos.y + 1.5, this.pos.z)), d: Math.hypot(this.pos.x - px, this.pos.z - pz) }); return d0.call(this); }; }
    // 往楼梯口塞几只排队
    S.pourQ = siege.roofExits().map(() => ({ q: Array.from({ length: 4 }, () => ({ mix: { walker: 1 }, wave: null })), t: 0 }));
    run(3, () => { player.pos.set(px, roof, pz); player.yaw = 0; S.waveI = SIEGE.waves.length; });
    const retired = (S.retired || 0) - t0;
    assert.ok(gone.length >= 3, `三秒腾出来 ${gone.length} 个位置（收 ${retired} 只人背后的）`);
    assert.ok(retired <= Math.ceil(3 / SIEGE.cull.retire) + 1, `隔一阵才收一只：三秒收了 ${retired} 只`);
    assert.deepEqual(gone.filter((q) => (q.view && q.seen) || q.d < SIEGE.cull.near), [], '收掉的里面有人面前看得见的、离人近的');
    assert.ok(front.filter((z) => P.sightAcross(eye, h.set(z.pos.x, z.pos.y + 1.5, z.pos.z))).every((z) => z.active), '人面前看得见的一只没收');
  }
});

test('第二道关清了以后惊动的那只巨尸赶上守屋顶：排进楼梯口的队，这一下没出来也不隔半秒再排一只（队里只有一只）', () => {
  const { enemies, run, S, light } = holdWorld('A');
  light(); assert.ok(S.hold >= 0, '点着了');
  const spawn0 = enemies.spawn; enemies.spawn = () => null; // 一只都放不出来（池子满着、门里全在人眼皮底下）
  Object.assign(S, { bruteT: 0.01, bruteTry: 0 });
  run(3);
  const queued = (S.pourQ || []).reduce((n, e) => n + e.q.filter((it) => it.kind === 'brute').length, 0);
  assert.equal(queued, 1, `排了 ${queued} 只巨尸`);
  assert.ok(S.bruteT < 0, '不再重试');
  enemies.spawn = spawn0;
});

test('守屋顶围上来的：贴着人同时抡、咬的最多三只（巨尸算两只），别的围在旁边等；队友同时挨咬的算三只、打六折；不在守屋顶时照实算', () => {
  const { siege, zombies, enemies, player, run, roof, px, pz, S, light } = holdWorld('A');
  light(); S.waveI = SIEGE.waves.length; for (const z of zombies.alive()) z._deactivate();
  const ring = []; for (let k = 0; k < 10; k++) { const a = k * 0.63, z = enemies.spawn('zombie', new THREE.Vector3(px + Math.cos(a) * 1.0, roof, pz + Math.sin(a) * 1.0), { kind: k ? 'walker' : 'brute', hunt: true, state: 'alert' }); if (z) ring.push(z); }
  let most = 0;
  const weight = (z) => (z.kind === 'brute' ? 2 : 1);
  run(6, () => { player.pos.set(px, roof, pz); player.health = 100; player.alive = true; S.waveI = SIEGE.waves.length; most = Math.max(most, ring.filter((z) => z.alive && z.zs === 'attack').reduce((n, z) => n + weight(z), 0)); });
  assert.ok(most >= 2 && most <= SIEGE.crowd.bite, `同时在咬的最多 ${most}`);
  assert.equal(siege.mateBites(10), SIEGE.crowd.mateBite * SIEGE.crowd.mate); assert.equal(siege.mateBites(1), SIEGE.crowd.mate);
  S.landed = true; assert.equal(siege.mateBites(10), 10, '不在守屋顶照实算');
});

test('北区守屋顶：只有一个口子正对着人——一整波都排得下（不扔掉多的），门洞里几只并排挤出来（不是一只跟着一只在门口被点名）；公寓照旧一条道', () => {
  const T1 = holdWorld('T1'), H = TOWERS.T1.hold;
  assert.ok(H.lanes >= 2 && H.queue >= H.waveSize[1], '北区的口子排得下一整波、几条道并排');
  const { siege, zombies, enemies, player, run, roof, px, pz, S, light } = T1;
  const born = [], sp = enemies.spawn.bind(enemies);
  enemies.spawn = (t, pos, o) => { const z = sp(t, pos, o); if (z) born.push({ t: S.hold, door: inStairs(siege, roof, pos) }); return z; };
  light();
  const ex = siege.roofExits()[0], g = ex.gap, ux = Math.abs(g.nz), uz = Math.abs(g.nx), side = new Set(); let abreast = 0;
  run(SIEGE.waves[1] - 0.5, () => {
    player.pos.set(px, roof, pz); player.health = 100; player.alive = true;
    // 刚出门的（门洞外 0–1.5 米）横着分在门洞的哪一段
    const at = zombies.alive().filter((z) => { const o = (z.pos.x - g.x) * g.nx + (z.pos.z - g.z) * g.nz; return Math.abs(z.pos.y - roof) < 0.4 && o > 0 && o < 1.5; }).map((z) => (z.pos.x - g.x) * ux + (z.pos.z - g.z) * uz);
    for (const v of at) side.add(Math.round(v / 0.8));
    abreast = Math.max(abreast, at.length && Math.max(...at) - Math.min(...at));
  });
  const wave1 = born.filter((b) => b.door && b.t < SIEGE.waves[1]).length;
  assert.ok(wave1 >= H.waveSize[0] - 4, `第一波从楼梯间里出来 ${wave1} 只（一个口子以前最多排 ${SIEGE.spawn.queue} 只）`);
  assert.ok(side.size >= 3 && abreast >= 1.2, `出门时横着散开 ${abreast.toFixed(1)} 米、占了门洞 ${side.size} 段`);
  assert.ok(zombies.alive().length + born.length > 0);
  // 公寓：两个口子各排 16 只、一条道（这一份没动）
  const A = holdWorld('A'); A.light(); A.run(1); assert.ok(A.siege.roofExits().every((e) => e.inner.every((q) => !q.lanes)), '公寓不分道');
});

test('楼顶的出口（守屋顶的出生点、出门的路，几十条寻路）开局起在后台分帧算：落点算完以后一两秒就好了，清掉最后一道关那一帧不用再算；和一口气算的一样', () => {
  for (const tower of ['A', 'T1']) {
    const { siege, begin, run } = sworld({ tower });
    begin(); siege.prepareFloors(); const S = siege.state, roofId = TOWERS[tower].roof;
    let frames = 0; while (S.exits?.roof !== roofId && frames < 150) { run(1 / 30); frames++; }
    assert.ok(S.exits?.roof === roofId && frames > 3, `${tower} 分 ${frames} 帧算完`);
    assert.equal(S.stage, 0, '还在开局那家店里');
    const w = sworld({ tower }); w.begin(); const sync = w.siege.roofExits(), bg = siege.roofExits();
    assert.equal(bg, S.exits.list, '算好了直接用');
    assert.deepEqual(bg.map((e) => [e.x, e.z, e.inner.length, e.spots.length]), sync.map((e) => [e.x, e.z, e.inner.length, e.spots.length]), `${tower} 分帧算的和一口气算的一样`);
    assert.ok(bg.length && bg.every((e) => e.inner.length >= 5), `${tower} 门里头的出生点 ${bg.map((e) => e.inner.length).join('/')}`);
  }
});

test('直升机落稳以后（跑去登机那几步）：排着队的那几波收掉，不再来新的一波、不催尸潮、不放特殊感染者，只从楼梯间门里零零星星出来几只', () => {
  for (const tower of ['A', 'T1']) {
    const { siege, zombies, enemies, player, run, roof, px, pz, S, light } = holdWorld(tower);
    light(); S.hold = SIEGE.hold - 0.1; run(SIEGE.land + 0.3);
    assert.equal(S.landed, true);
    assert.ok((S.pourQ || []).every((e) => !e.q.length), `${tower} 排着队还没出来的收掉了`);
    for (const z of zombies.alive()) z._deactivate();
    // 节奏器正要催一波尸潮、马上该放一只特殊感染者，响动条也满着：落稳以后都不算
    Object.assign(siege.pacing.state, { phase: 'build', warned: true, left: 0.2, specialT: 0.1 }); S.noise = 140; S.hordeCool = 0;
    const born = [], sp = enemies.spawn.bind(enemies);
    enemies.spawn = (t, pos, o) => { const z = sp(t, pos, o); if (z) born.push({ z, pos: pos.clone() }); return z; };
    run(10, () => { player.pos.set(px, roof, pz); player.health = 100; player.alive = true; });
    assert.ok(born.length >= 2 && born.length <= Math.ceil(10 / SIEGE.board.every) + 1, `${tower} 落稳以后 10 秒出来 ${born.length} 只`);
    assert.ok(born.every((b) => inStairs(siege, roof, b.pos)), `${tower} 都是从楼梯间门里出来的`);
    assert.ok(born.every((b) => !b.z.special), `${tower} 不放特殊感染者`);
  }
});

// ---- 救人：小许出得来、跟得上 ----
/** 被困的那家店：店面多边形、门面、开局 / 撬棍 / 救人 / 扶梯口几处地点 */
function rescueScene() {
  const plan = siegePlan(seq(7), L, nav, runs), M = plan.mall, R = M.rescue, at = plan.stageOf;
  const poly = L.levels.find((l) => l.id === 'P1-3F').units.find((u) => u.id === R.unit).polys[0];
  return { plan, M, R, poly, site: plan.stages[at('rescue')].site, bike: plan.stages[at('crowbar')].site, mark: plan.stages[at('escort')].site };
}
/** 玩家从 route 的起点按 4 米 / 秒走到终点（朝着走的方向），每帧都跑 tick */
function walk(player, route, tick, speed = 4) {
  player.pos.set(route[0].x, player.pos.y, route[0].z);
  for (let wi = 1, i = 0; i < 30 * 60 && wi < route.length; i++) {
    const w = route[wi], dx = w.x - player.pos.x, dz = w.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { wi++; continue; }
    const k = Math.min(1, speed / 30 / d); player.pos.x += dx * k; player.pos.z += dz * k; player.yaw = Math.atan2(-dx, -dz); tick();
  }
}

test('救出来的小许从店里走出来跟着你：不给你让枪线、不隔着店面玻璃站住；从四个方向走到门口、他从店里正中或者玻璃后面出发，两秒内都出了店', () => {
  const { R, poly, site, bike } = rescueScene(), f = R.front, len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0), tx = (f.x1 - f.x0) / len, tz = (f.z1 - f.z0) / len;
  // 门外那一点：在店外、站得住、从里面走得到，不在撬门的人的视线上
  assert.ok(R.exit && !pointInPoly([R.exit.x, R.exit.z], poly)); const ex = landAt(nav, R.exit.x, R.exit.z, R.exit.y + 0.6); assert.ok(ex && clear(nav, ex));
  assert.ok(findPath(nav, landAt(nav, R.inside.x, R.inside.z, R.inside.y + 0.6), ex), '从店里走得到门外那一点');
  { const dx = R.exit.x - site.x, dz = R.exit.z - site.z, d = Math.hypot(dx, dz); assert.ok(d > 0.8 && -(dx * f.nx + dz * f.nz) / d < 0.87, '不挡在撬门的人跟前'); }
  const from = landAt(nav, bike.x, bike.z, bike.y + 0.6), to = landAt(nav, site.x, site.z, site.y + 0.6);
  const routes = { bike: findPath(nav, from, to).map((p) => ({ x: p.x, z: p.z })), front: [{ x: site.x + f.nx * 7, z: site.z + f.nz * 7 }, site], sideA: [{ x: site.x + tx * 7, z: site.z + tz * 7 }, site], sideB: [{ x: site.x - tx * 7, z: site.z - tz * 7 }, site] };
  const { squad, player, run } = qworld(); squad.wanted = false;
  const cases = [];
  for (const name of Object.keys(routes)) for (const start of ['inside', 'glass', 'exit']) cases.push([name, start]);
  cases.push(['bike', 'mates']);
  for (const [name, start] of cases) {
    squad.wanted = start === 'mates'; squad.reset(); player.pos.set(site.x, site.y, site.z);
    const tick = () => squad.update(1 / 30);
    walk(player, routes[name], tick);
    // 撬卷帘：对着店门站两秒多
    player.yaw = Math.atan2(-(R.inside.x - player.pos.x), -(R.inside.z - player.pos.z)); run(2.4);
    const at = start === 'glass' ? { x: f.x0 + (f.x1 - f.x0) * 0.18 - f.nx * 0.3, y: R.inside.y, z: f.z0 + (f.z1 - f.z0) * 0.18 - f.nz * 0.3 } : R.inside; // glass：贴着店面玻璃里侧（以前就在这儿站住不动了；救人那家换了店，按门面算）
    assert.ok(pointInPoly([at.x, at.z], poly));
    const xu = squad.join('xu', at, start === 'exit' || start === 'mates' ? { exit: R.exit } : {});
    let out = null;
    for (let t = 0; t < 4; t += 1 / 30) { run(1 / 30); if (out === null && !pointInPoly([xu.pos.x, xu.pos.z], poly)) out = t; }
    const d = Math.hypot(xu.pos.x - player.pos.x, xu.pos.z - player.pos.z);
    assert.ok(out !== null && out < 2, `${name}/${start}：${out === null ? '一直没出店' : `${out.toFixed(1)} 秒出店`}`);
    assert.ok(!pointInPoly([xu.pos.x, xu.pos.z], poly) && d < SQUAD.follow.far + 1, `${name}/${start}：四秒后离你 ${d.toFixed(1)} 米、${pointInPoly([xu.pos.x, xu.pos.z], poly) ? '在店里' : '在店外'}`);
    assert.ok(xu.holdT <= 0, '小许不会为了让枪线站住');
    squad.leave('xu');
  }
});

test('小许卡在你看不见、他自己又走不出来的地方（店里玻璃后面）：两秒多以后直接跟到你身后；救人那家店撬开以后人进得去（单人也能进去扶他），丧尸照样不从里面冒', () => {
  const { R, poly, site, mark } = rescueScene();
  const { G, squad, player, run } = qworld(); squad.wanted = false; squad.reset();
  player.pos.set(site.x, site.y, site.z); player.yaw = Math.atan2(-(site.x - mark.x), -(site.z - mark.z)); run(0.2);
  // 店里一处你看不见的地方（隔着玻璃），而且寻路不给他路（模拟走不出来）
  const eye = new THREE.Vector3(site.x, site.y + 1.4, site.z), c = poly.reduce((a, q) => [a[0] + q[0] / poly.length, a[1] + q[1] / poly.length], [0, 0]);
  let hide = null;
  for (let i = 0; i < 400 && !hide; i++) {
    const a = (i * 2.39996) % (Math.PI * 2), r = 0.3 + (i % 20) * 0.25, x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r, st = landAt(nav, x, z, site.y + 0.6);
    if (st && clear(nav, st) && pointInPoly([x, z], poly) && !G.physics.lineOfSight(eye, new THREE.Vector3(x, site.y + 1.4, z))) hide = { x, y: site.y, z };
  }
  assert.ok(hide, '店里有你看不见的地方');
  G.physics.nav.requestPath = (a, b, cb) => { cb(null); return { cancel() {} }; };
  const xu = squad.join('xu', hide);
  run(1.5); assert.ok(pointInPoly([xu.pos.x, xu.pos.z], poly), '刚看不见一会儿：先不动他');
  run(SQUAD.follow.lost);
  const d = Math.hypot(xu.pos.x - player.pos.x, xu.pos.z - player.pos.z);
  assert.ok(!pointInPoly([xu.pos.x, xu.pos.z], poly) && d < SQUAD.follow.far + 1, `跟到你身后了（离你 ${d.toFixed(1)} 米）`);
  squad.leave('xu');
  // 单人：救人那家店撬开以前进不去，撬开以后进得去；不管撬没撬开，尸潮都不从店里冒
  const { siege, begin, cut, run: srun, player: p2, zombies } = sworld();
  const m = begin(), at = m.plan.stageOf, inside = m.plan.mall.rescue.inside;
  srun(0.1); cut(at('crowbar') + 1); srun(0.1);
  assert.equal(siege.inArea({ floor: 'P1-3F', x: inside.x, z: inside.z }), false, '还没撬开：进不去');
  cut(1); srun(0.1); assert.equal(siege.state.stage, at('escort'));
  assert.equal(siege.inArea({ floor: 'P1-3F', x: inside.x, z: inside.z }), true, '撬开了：人进得去');
  p2.pos.set(mark.x, mark.y, mark.z);
  for (let k = 0; k < 3; k++) { for (const z of zombies.alive()) z._deactivate(); siege.horde(40); assert.ok(!zombies.alive().some((z) => Math.abs(z.pos.y - inside.y) < 2 && pointInPoly([z.pos.x, z.pos.z], poly)), '尸潮不从救人那家店里冒'); }
});

test('护送：你走到扶梯口差一步（1.5 米）没踩到点上，小许跟在你身后也算到；没有队友模块时按你自己算', () => {
  const { G, siege, begin, cut, run, player, zombies } = sworld();
  const squad = createSquad(G, { scene: G.scene, nav, zombies, siege, director: { riding: false }, rng: seq(5) }); G.squad = squad; squad.wanted = false; squad.reset();
  G.game.debugCut = () => { const r = G.game.run.relays.find((q) => !q.cut); if (r) r.cut = true; };
  const m = begin(), at = m.plan.stageOf, S = siege.state, site = m.plan.stages[at('rescue')].site, mark = m.plan.stages[at('escort')].site, R = m.plan.mall.rescue;
  const calm = () => { for (const z of zombies.alive()) z._deactivate(); squad.update(1 / 30); };
  run(0.1, calm); cut(at('crowbar') + 1); run(0.1, calm);
  player.pos.set(site.x, site.y, site.z); player.yaw = Math.atan2(-(R.inside.x - site.x), -(R.inside.z - site.z)); run(0.5, calm);
  cut(1); run(0.2, calm); assert.equal(S.stage, at('escort')); const xu = squad.guest; assert.ok(xu, '小许出来了');
  // 走到离扶梯口那一点 1.5 米的地方（从救人那边过来）
  const dx = site.x - mark.x, dz = site.z - mark.z, dl = Math.hypot(dx, dz), short = { x: mark.x + dx / dl * 1.5, z: mark.z + dz / dl * 1.5 };
  const route = findPath(nav, landAt(nav, site.x, site.z, site.y + 0.6), landAt(nav, short.x, short.z, site.y + 0.6)).map((q) => ({ x: q.x, z: q.z }));
  walk(player, route, () => { G.time.frame++; siege.update(1 / 30); calm(); }, 3);
  run(6, calm);
  assert.equal(S.stage, at('pry'), `护送完成（小许离扶梯口 ${Math.hypot(xu.pos.x - mark.x, xu.pos.z - mark.z).toFixed(1)} 米、离你 ${Math.hypot(xu.pos.x - player.pos.x, xu.pos.z - player.pos.z).toFixed(1)} 米）`);
  squad.dispose();
});

test('撬棍那家（以前是骑行家，现在是影城）→ 救人那家：路线指引绕着锁着的店走（不从店角穿），照着走一路不被退回来；顶着卷帘时说「卷帘锁着」，斜着推顺着卷帘滑过去；寻路的人（队友、丧尸）也绕开', async () => {
  const { createRouteGuide } = await import('../src/jimao/guide.js');
  for (const tower of ['A', 'T1']) {
    const { G, siege, begin, cut, run, player, msgs } = sworld({ tower });
    const pf = createPathfinder(nav); pf.prepare(); G.physics.pathfinder = pf;
    const m = begin(), at = m.plan.stageOf, R = m.plan.mall.rescue, site = m.plan.stages[at('rescue')].site, bike = m.plan.stages[at('crowbar')].site;
    const poly = L.levels.find((l) => l.id === 'P1-3F').units.find((u) => u.id === R.unit).polys[0];
    cut(at('crowbar') + 1); run(0.1); assert.equal(siege.state.stage, at('rescue'));
    assert.equal(doorOutside(L, site, nav), null, '撬卷帘的那一点本来就在店门外：不用先找门（以前找到了店里面）');
    // 路线指引（真的分帧寻路）
    const guide = createRouteGuide(G, { scene: G.scene, layout: L, nav, pathfinder: pf });
    G.game.state = 'playing'; player.pos.set(bike.x, bike.y, bike.z); guide.update(1 / 30); for (let i = 0; i < 400 && pf.pending; i++) pf.update(50); guide.update(1 / 30);
    const route = guide.route; assert.ok(route.length > 5, `${tower}：路线画出来了`);
    assert.ok(route.every((q) => !pointInPoly([q.x, q.z], poly)), `${tower}：路线不从锁着的店里穿`);
    assert.ok(route.every((q) => siege.inArea({ floor: 'P1-3F', x: q.x, z: q.z })), '路线上每一点都走得到');
    // 照着路线走（每帧朝前面的路线点走 4.5 米 / 秒、真的碰撞），离点 1.2 米算到
    msgs.length = 0; let wp = 0, t = 0, stuck = 0; const vel = new THREE.Vector3();
    for (; t < 25 && Math.hypot(site.x - player.pos.x, site.z - player.pos.z) > 1.2; t += 1 / 30) {
      while (wp < route.length - 1 && Math.hypot(route[wp].x - player.pos.x, route[wp].z - player.pos.z) < 1) wp++;
      const q = route[wp], d = Math.hypot(q.x - player.pos.x, q.z - player.pos.z) || 1, p0 = player.pos.clone();
      vel.set((q.x - player.pos.x) / d * 4.5, 0, (q.z - player.pos.z) / d * 4.5); G.physics.moveCapsule(player.pos, vel, 1 / 30, 0.32, 1.8); siege.update(1 / 30);
      if (player.pos.distanceTo(p0) < 1e-3) stuck++;
    }
    assert.ok(t < 12, `${tower}：${t.toFixed(1)} 秒走到卷帘跟前`); assert.equal(stuck, 0, '一帧都没被钉在原地'); assert.ok(!msgs.some((x) => /这边出不去/.test(x)), msgs.join(' | '));
    // 直直地往卷帘里推：停在卷帘外面一点（不站进卷帘里），说「卷帘锁着」
    const f = R.front, mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2, inward = pointInPoly([mx - f.nx * 0.5, mz - f.nz * 0.5], poly) ? -1 : 1;
    player.pos.set(mx + f.nx * inward * -1.2, site.y, mz + f.nz * inward * -1.2); run(0.1); msgs.length = 0; siege.state.tellT = 0;
    for (let k = 0; k < 60; k++) { vel.set(f.nx * inward * 3, 0, f.nz * inward * 3); G.physics.moveCapsule(player.pos, vel, 1 / 30, 0.32, 1.8); siege.update(1 / 30); }
    const gap = Math.abs((player.pos.x - mx) * f.nx + (player.pos.z - mz) * f.nz);
    assert.ok(!pointInPoly([player.pos.x, player.pos.z], poly) && gap > 0.3, `停在卷帘外 ${gap.toFixed(2)} 米`); assert.ok(msgs.includes('卷帘锁着，进不去'), msgs.join(' | '));
    // 斜着推（45°）：顺着卷帘滑过去
    const tx = (f.x1 - f.x0) / Math.hypot(f.x1 - f.x0, f.z1 - f.z0), tz = (f.z1 - f.z0) / Math.hypot(f.x1 - f.x0, f.z1 - f.z0), s0 = (player.pos.x - mx) * tx + (player.pos.z - mz) * tz;
    for (let k = 0; k < 15; k++) { vel.set((f.nx * inward + tx) * 2.1, 0, (f.nz * inward + tz) * 2.1); G.physics.moveCapsule(player.pos, vel, 1 / 30, 0.32, 1.8); siege.update(1 / 30); }
    assert.ok((player.pos.x - mx) * tx + (player.pos.z - mz) * tz - s0 > 0.8, '斜着推卷帘：顺着滑出去了'); assert.ok(!pointInPoly([player.pos.x, player.pos.z], poly));
    // 别人的寻路也绕开（队友、丧尸都走 pathfinder）；撬开以后就不绕了
    const a = landAt(nav, bike.x, bike.z, bike.y + 0.6), b = landAt(nav, R.inside.x + (site.x - R.inside.x) * 0.2, R.inside.z + (site.z - R.inside.z) * 0.2, site.y + 0.6);
    const p1 = pf.findNow(a, landAt(nav, site.x, site.z, site.y + 0.6)); assert.ok(p1 && p1.every((q) => !pointInPoly([q.x, q.z], poly)), '绕着店走');
    cut(1); run(0.1); assert.equal(siege.state.stage, at('escort')); assert.ok(pf.findNow(a, b), '撬开了：店里也能去');
  }
});

test('读档回到配电室：前面已经过去的那几道分阶段卷帘（开局店面、救人那家、两处扶梯口）都收起来——不会看着落着、人却走得过去', () => {
  const { siege, begin, director, G } = sworld();
  const m = begin(), at = m.plan.stageOf, R = m.plan.mall.rescue, f = R.front, mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2;
  const seals = () => { const out = []; G.scene.traverse((o) => { if (o.name === '丧尸围城 · 卷帘') out.push(o); }); return out; };
  const over = (x, z) => seals().filter((o) => { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; return x > b.min.x - 0.2 && x < b.max.x + 0.2 && z > b.min.z - 0.2 && z < b.max.z + 0.2 && b.max.x - b.min.x < 15 && b.max.z - b.min.z < 15; });
  assert.ok(over(mx, mz).length && over(mx, mz).every((o) => o.visible), '新开一局：救人那家的卷帘落着');
  director.state.restore = { kind: 'safe', stage: m.plan.powerStage + 1, kit: null }; siege.reset(); siege.update(1 / 30);
  assert.ok(siege.state.stage > at('rescue') && siege.inArea({ floor: 'P1-3F', x: R.inside.x, z: R.inside.z }), '读档以后救人那家进得去');
  assert.ok(over(mx, mz).length && over(mx, mz).every((o) => !o.visible), '……它的卷帘也收起来了');
  const shop = m.plan.mall.shop.fronts[0]; assert.ok(over((shop.x0 + shop.x1) / 2, (shop.z0 + shop.z1) / 2).every((o) => !o.visible), '开局那家店的卷帘也收了');
  director.state.restore = false; siege.reset(); assert.ok(over(mx, mz).every((o) => o.visible), '再新开一局又落下来');
});

test('小许跟丢了直接跟到你身后时，不落在去不了的地方（楼梯顶、锁着的店里、范围外）；都不行就落在你脚下', () => {
  const { G, siege, begin, cut, run, player, zombies } = sworld();
  const squad = createSquad(G, { scene: G.scene, nav, zombies, siege, director: { riding: false }, rng: seq(5) }); G.squad = squad; squad.wanted = false; squad.reset();
  const m = begin(), at = m.plan.stageOf, R = m.plan.mall.rescue;
  const calm = () => { for (const z of zombies.alive()) z._deactivate(); squad.update(1 / 30); };
  run(0.1, calm); cut(at('rescue') + 1); run(0.2, calm); assert.equal(siege.state.stage, at('escort'));
  const xu = squad.guest; assert.ok(xu);
  // 复现的那个姿势：人站在三层西边、朝西——以前小许被放到消防楼梯顶上（范围外），每一帧又被拉回同一点
  for (const [x, z, yaw] of [[-165, -111.5, 4.71], [-164, -136.5, 4.71], [R.exit.x, R.exit.z, 0]]) {
    player.pos.set(x, 12, z); player.yaw = yaw; xu.warp();
    const st = landAt(nav, xu.pos.x, xu.pos.z, xu.pos.y + 0.6);
    assert.ok(siege.inArea({ floor: st?.floor, x: xu.pos.x, z: xu.pos.z }) !== false, `(${x}, ${z})：小许落在 (${xu.pos.x.toFixed(1)}, ${xu.pos.z.toFixed(1)})，在范围里`);
  }
  squad.dispose();
});

/** 护送刚开始：单人，人站在撬开的卷帘门口，小许出来了；门口来的那几只先收掉，之后不再刷（escortT 拉长） */
function escortWorld({ tower = 'A' } = {}) {
  const w = sworld({ tower }), { G, siege, begin, cut, run, player, zombies } = w;
  const squad = createSquad(G, { scene: G.scene, nav, zombies, siege, director: { riding: false }, rng: seq(5) }); G.squad = squad; squad.wanted = false; squad.reset();
  const m = begin(), at = m.plan.stageOf, site = m.plan.stages[at('rescue')].site, mark = m.plan.stages[at('escort')].site;
  const calm = () => { for (const z of zombies.alive()) z._deactivate(); squad.update(1 / 30); };
  run(0.1, calm); cut(at('crowbar') + 1); run(0.1, calm);
  player.pos.set(site.x, site.y, site.z); run(0.3, calm); cut(1); run(1.5, calm);
  assert.equal(siege.state.stage, at('escort')); siege.state.escortT = 999;
  return { ...w, squad, m, at, site, mark, xu: squad.guest, calm };
}

test('护送：小许身边围着六只，同时最多两只咬得到（其余的等着），每只贴上半秒才咬第一口、之后一口隔 1.4 秒；你手里还没枪时一口打六折，四秒下来他还站着（以前六只一起算，四秒掉 156）', () => {
  const { G, siege, run, enemies, xu } = escortWorld(), B = SQUAD.guest;
  assert.equal(siege.guestHurt(), MALL.rescue.soft, '只有刀 / 斧子：打折'); G.weapon.slots = ['knife', 'pistol']; assert.equal(siege.guestHurt(), 1, '有枪了：照实算'); delete G.weapon.slots;
  const ring = []; for (let k = 0; k < 6; k++) ring.push(enemies.spawn('zombie', xu.pos.clone(), { kind: 'walker', hunt: true, state: 'alert' }));
  assert.equal(ring.filter(Boolean).length, 6);
  // 一直围着他一圈（他躲到哪儿跟到哪儿）
  const pin = () => ring.forEach((z, k) => { const a = (k / 6) * Math.PI * 2; z.pos.set(xu.pos.x + Math.cos(a) * 0.9, xu.pos.y, xu.pos.z + Math.sin(a) * 0.9); });
  let t = 0, most = 0; const bites = [], hp0 = xu.hp;
  G.events.on('squad:bite', (e) => { if (e.mate === xu) bites.push([t, e.by, e.damage]); });
  run(4, () => { pin(); G.squad.update(1 / 30); t += 1 / 30; most = Math.max(most, xu.biters.length); });
  assert.equal(most, B.cap, `同时咬得到的最多 ${most} 只`);
  assert.ok(bites.length >= 4 && bites.length <= B.cap * (1 + Math.floor((4 - B.windup) / B.every)), `四秒咬了 ${bites.length} 口`);
  assert.ok(bites[0][0] >= B.windup - 1 / 30, `第一口在 ${bites[0][0].toFixed(2)} 秒（贴上要先抡一下）`);
  for (const z of ring) { const ts = bites.filter((b) => b[1] === z).map((b) => b[0]); for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= B.every - 1e-6, `同一只两口隔 ${(ts[i] - ts[i - 1]).toFixed(2)} 秒`); }
  assert.ok(bites.every((b) => Math.abs(b[2] - B.hit * MALL.rescue.soft) < 1e-9), '一口打了折');
  assert.ok(Math.abs(hp0 - xu.hp - bites.length * B.hit * MALL.rescue.soft) < 1e-6 && !xu.down, `还剩 ${xu.hp.toFixed(0)} 血、没倒`);
  G.squad.dispose();
});

test('护送：附近一群离小许比离你近的，最多两只（MALL.rescue.mob）转去扑他——以前队友那一句「离他近就扑他」把六只全招过去', () => {
  const { G, run, enemies, player, xu } = escortWorld();
  const at = xu.pos.clone(), dx = at.x - player.pos.x, dz = at.z - player.pos.z, dl = Math.hypot(dx, dz) || 1;
  const pack = [];
  for (let k = 0; k < 6; k++) { const a = Math.atan2(dz, dx) + (k - 2.5) * 0.35, r = 3 + (k % 2) * 1.2; pack.push([enemies.spawn('zombie', at.clone(), { kind: 'walker', hunt: true, state: 'alert' }), at.x + Math.cos(a) * r, at.z + Math.sin(a) * r]); }
  for (const [, x, z] of pack) assert.ok(Math.hypot(x - at.x, z - at.z) < Math.hypot(x - player.pos.x, z - player.pos.z) - 0.5, '离他比离你近');
  run(1.5, () => { xu.pos.copy(at); for (const [z, x, zz] of pack) z.pos.set(x, at.y, zz); G.squad.update(1 / 30); });
  // 1.2 米：小许这一帧可能已经往你身后躲了一步（救人那家换到南边那排以后，他身后有地方躲）——引过去的点跟着他走
  const lured = pack.filter(([z]) => z.lureT > 0 && Math.hypot(z.lure.x - at.x, z.lure.z - at.z) < 1.2).length;
  assert.ok(lured >= 1 && lured <= MALL.rescue.mob, `扑他的有 ${lured} 只`);
  G.squad.dispose();
});

test('护送：丧尸凑到小许三米内，他往你身后（尸群的另一边、栏杆里侧）躲开，不站在尸群里等着挨咬；躲完还在你身边、在范围里', () => {
  const { G, siege, run, enemies, player, xu } = escortWorld();
  const P = player.pos; let tried = 0;
  for (const [ox, oz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    // 小许站在你旁边 1.5 米，三只从他外侧贴上来（离他 1.2 米、隔着他在你对面）
    const st = landAt(nav, P.x + ox * 1.5, P.z + oz * 1.5, P.y + 0.6); if (!st || Math.abs(st.y - P.y) > 0.3 || !clear(nav, st) || siege.inArea({ floor: st.floor, x: st.x, z: st.z }) === false) continue;
    xu.place({ x: st.x, y: P.y, z: st.z }); xu.hide = null; xu.senseT = 0; tried++;
    const pack = [-0.5, 0, 0.5].map((k) => { const a = Math.atan2(oz, ox) + k; return [enemies.spawn('zombie', xu.pos.clone(), { kind: 'walker', hunt: true, state: 'alert' }), st.x + Math.cos(a) * 1.2, st.z + Math.sin(a) * 1.2]; });
    const room = () => Math.min(...pack.map(([, x, z]) => Math.hypot(x - xu.pos.x, z - xu.pos.z)));
    const r0 = room();
    run(1.5, () => { for (const [z, x, zz] of pack) z.pos.set(x, P.y, zz); G.squad.update(1 / 30); });
    const cx = pack.reduce((a, q) => a + q[1], 0) / 3, cz = pack.reduce((a, q) => a + q[2], 0) / 3, side = ((xu.pos.x - P.x) * (cx - P.x) + (xu.pos.z - P.z) * (cz - P.z)) / (Math.hypot(xu.pos.x - P.x, xu.pos.z - P.z) * Math.hypot(cx - P.x, cz - P.z) || 1);
    const here = landAt(nav, xu.pos.x, xu.pos.z, xu.pos.y + 0.6);
    assert.ok(room() > r0 + 1.2 && room() >= SQUAD.guest.flee - 0.6, `(${ox}, ${oz})：离尸群 ${r0.toFixed(1)} → ${room().toFixed(1)} 米`);
    assert.ok(side < 0.3, `(${ox}, ${oz})：躲到了你另一边（${side.toFixed(2)}）`);
    assert.ok(Math.hypot(xu.pos.x - P.x, xu.pos.z - P.z) < SQUAD.follow.far, '还在你身边');
    assert.ok(here && Math.abs(here.y - P.y) < 0.3 && siege.inArea({ floor: here.floor, x: xu.pos.x, z: xu.pos.z }) !== false, '站在这一层、范围里（没往中庭栏杆外跑）');
    for (const [z] of pack) z._deactivate();
  }
  assert.ok(tried >= 2, `试了 ${tried} 个方向`);
  G.squad.dispose();
});

test('护送：小许倒了——头顶标「扶」、提示走过去多远；你身边贴着丧尸扶不起来（说先砍开）；腾出手站到他跟前一秒多就起来（比扶队友快），标记撤掉', () => {
  const { G, siege, run, enemies, player, xu, mark, director, msgs } = escortWorld(), B = SQUAD.guest;
  const mk = () => director.state.mission.markers();
  assert.deepEqual(mk(), [], '没倒：不标');
  xu.goDown(); assert.ok(msgs.some((t) => /小许倒下了！把你身边的丧尸砍开/.test(t)));
  const m0 = mk(); assert.equal(m0.length, 1); assert.equal(m0[0].short, '扶'); assert.ok(Math.hypot(m0[0].pos.x - xu.pos.x, m0[0].pos.z - xu.pos.z) < 1e-6);
  player.pos.set(mark.x, mark.y, mark.z); msgs.length = 0; siege.state.tellT = 0; run(1, () => G.squad.update(1 / 30));
  assert.ok(msgs.some((t) => /小许倒了！走到他跟前扶起来（\d+ 米）/.test(t)), msgs.join(' | ')); assert.equal(xu.help, 'far');
  // 走到他跟前，可身边贴着一只
  const by = new THREE.Vector3(xu.pos.x + 1, xu.pos.y, xu.pos.z), z = enemies.spawn('zombie', by.clone(), { kind: 'walker', hunt: true, state: 'alert' });
  msgs.length = 0; siege.state.tellT = 0;
  run(3, () => { player.pos.copy(by); z.pos.set(by.x + 0.9, by.y, by.z); G.squad.update(1 / 30); });
  assert.equal(xu.down, true, '贴着丧尸：扶不起来'); assert.equal(xu.help, 'busy'); assert.ok(msgs.some((t) => /身边有丧尸，扶不了/.test(t)), msgs.join(' | '));
  z._deactivate(); msgs.length = 0;
  let t = 0; run(B.revive + 0.3, () => { player.pos.copy(by); if (xu.down) t += 1 / 30; G.squad.update(1 / 30); });
  assert.equal(xu.down, false, '腾出手：扶起来了'); assert.ok(t <= B.revive + 0.1 && t < SQUAD.down.revive, `扶了 ${t.toFixed(1)} 秒`);
  assert.ok(msgs.some((t) => /正在扶起小许… \d+%/.test(t)), '扶的时候报进度'); assert.deepEqual(mk(), [], '起来了：标记撤掉');
  G.squad.dispose();
});

test('队友打谁：正在扑小许的（离他 2.4 米内、醒着的）排在特殊感染者和离你近的前面；按着你的还是最先', () => {
  const at = (x, z, o = {}) => ({ pos: { x, y: 0, z }, alive: true, active: true, zs: 'chase', ...o });
  const me = { x: 0, y: 0, z: 0 }, mate = { x: 2, y: 0, z: 2 }, xu = { x: -4, y: 0, z: 0 };
  const near = at(1.5, 0), onXu = at(-5, 0.5), sp = at(6, 0, { special: true }), pin = at(3, 3), dozing = at(-4.5, 0, { zs: 'idle' });
  assert.equal(pickTarget(mate, me, [near, onXu, sp], { guard: xu }), onXu, '扑小许的先打');
  assert.equal(pickTarget(mate, me, [near, onXu, sp]), sp, '没有要护着的：照旧');
  assert.equal(pickTarget(mate, me, [onXu, pin], { pin, guard: xu }), pin, '按着你的最先');
  assert.equal(pickTarget(mate, me, [near, dozing], { guard: xu }), near, '他身边发呆的不算扑他');
});

test('消防斧：开局店门对面（栏杆边）立着消火栓箱，正面朝门——卷帘一起来从门里就看得见、走得到；站过去就把近战换成斧子；没拿的话撬棍那一步顺手给上；斧子砍中没砍死有一点动静（砍倒了和刀一样没声）；新开一局又只有刀，从存档点回来斧子还在', () => {
  const { G, siege, begin, cut, run, player, supplies, msgs, director } = sworld();
  const m = begin(), at = m.plan.stageOf, M = m.plan.mall, A = M.axe, S = siege.state;
  run(0.1); assert.equal(G.weapon.melee, 'knife', '开局只有刀');
  assert.ok(A && A.wall && G.scene.getObjectByName('消火栓箱'), '箱子挂上了');
  // 改过：以前挂在门洞旁边的实墙上，从门里看被门框挡住；现在在门对面、正面朝门
  const door = m.plan.stages[at('exit')].site, ds = landAt(nav, door.x, door.z, door.y + 0.6), as = landAt(nav, A.x, A.z, A.y + 0.6);
  assert.ok(A.across && !pointInPoly([A.x, A.z], M.shop.poly), '在店门对面'); assert.ok(Math.hypot(A.wall.x - door.x, A.wall.z - door.z) < 6.5, '出门几步就到');
  const face = new THREE.Vector3(A.wall.x + Math.sin(A.wall.yaw) * 0.3, door.y + 1.2, A.wall.z + Math.cos(A.wall.yaw) * 0.3);
  assert.ok(G.physics.lineOfSight(new THREE.Vector3(door.x, door.y + 1.6, door.z), face), '卷帘一起来，从门里（摇卷帘那一点）看得见箱子正面');
  assert.ok((door.x - A.wall.x) * Math.sin(A.wall.yaw) + (door.z - A.wall.z) * Math.cos(A.wall.yaw) > 2, '正面朝着门');
  assert.ok(as && clear(nav, as) && findPath(nav, ds, as), '从门口走得到');
  const drop = supplies.drops.find((d) => d.kind === 'axe'); assert.ok(drop, '斧子挂在箱子里');
  assert.ok(Math.hypot(drop.pos.x - A.x, drop.pos.z - A.z) < 1e-6 && drop.model.position.y > 0.8, '人站在箱子跟前捡，斧子挂在箱子里（离地一米上下）');
  // 卷帘没开：站到箱子跟前（直接挪过去）也捡不到——卷帘落着
  player.pos.set(A.x, A.y, A.z); for (let k = 0; k < 6; k++) supplies.update(1 / 30); assert.equal(G.weapon.melee, 'knife', '卷帘没开：捡不到'); assert.ok(supplies.drops.some((d) => d.kind === 'axe'));
  player.pos.set(door.x, door.y, door.z); run(0.1);
  // 卷帘开了以后无线电提醒，走过去就拿到
  cut(2); run(0.1); assert.ok(msgs.some((t) => /消防箱里有把消防斧/.test(t)), '卷帘一开就提醒');
  player.pos.set(A.x, A.y, A.z); run(0.2, () => supplies.update(1 / 30));
  assert.equal(G.weapon.melee, 'axe'); assert.ok(!supplies.drops.some((d) => d.kind === 'axe')); assert.ok(msgs.some((t) => /捡到消防斧/.test(t)));
  // 斧子砍中有动静，刀没有
  S.noise = 0; G.events.emit('player:hitEnemy', { enemy: { pos: player.pos.clone() }, melee: true, tool: 'knife' }); assert.equal(S.noise, 0);
  G.events.emit('player:hitEnemy', { enemy: { pos: player.pos.clone() }, melee: true, tool: 'axe' }); assert.equal(S.noise, SIEGE.noise.axe);
  // 一斧砍倒的：和刀一样没声，旁边站着睡的也不惊动（潜行时悄悄放倒挡路的）
  { S.noise = 0;
    const near = G.enemies.spawn('zombie', player.pos.clone().add(new THREE.Vector3(1.5, 0, 0)), { kind: 'walker', passive: true });
    G.events.emit('player:hitEnemy', { enemy: { pos: player.pos.clone() }, melee: true, tool: 'axe', killed: true });
    assert.equal(S.noise, 0, '砍倒了没声'); assert.equal(near.zs, 'idle', '旁边的没惊动');
    G.events.emit('player:hitEnemy', { enemy: { pos: player.pos.clone() }, melee: true, tool: 'axe', killed: false }); assert.notEqual(near.zs, 'idle', '没砍死的那一下：旁边的惊动了'); near._deactivate(); }
  const n0 = msgs.length; cut(1); run(0.1); assert.equal(S.stage, at('crowbar') + 1); assert.ok(!msgs.slice(n0).some((t) => /门口消防箱里那把消防斧/.test(t)), '已经有了：不再给');
  // 新开一局：又只有刀，斧子挂回箱子里；这回不去拿——撬棍那一步给上，箱子里那把收走
  begin(); run(0.1); assert.equal(G.weapon.melee, 'knife'); assert.equal(supplies.drops.filter((d) => d.kind === 'axe').length, 1);
  cut(at('crowbar') + 1); run(0.1); assert.equal(G.weapon.melee, 'axe', '没拿也不会错过'); assert.equal(supplies.drops.filter((d) => d.kind === 'axe').length, 0); assert.ok(msgs.some((t) => /出门时顺手把门口消防箱里那把消防斧带上了/.test(t)), '说的是门口箱子里那把（箱子里的收走了）');
  // 从合闸那个存档点回来（原游戏重置了武器、近战换回了刀）：开打第一帧斧子还给你
  director.state.restore = { kind: 'safe', stage: m.plan.powerStage + 1, kit: null }; G.weapon.melee = 'knife'; siege.reset(); run(0.1);
  assert.equal(G.weapon.melee, 'axe', '存档点在撬棍之后：斧子还在'); assert.ok(!supplies.drops.some((d) => d.kind === 'axe'), '不再挂一把');
  director.state.restore = false; siege.enabled = false; siege.reset(); assert.equal(G.weapon.melee, 'knife', '零点突围里还是刀');
});

test('榴弹枪提前：一层武器柜一开就给（不换到手上，告诉人按什么换）；第二道关那把还在，已经有了再捡只算两发榴弹', () => {
  const { G, siege, begin, cut, run, msgs, supplies, player } = sworld();
  const m = begin(), at = m.plan.stageOf;
  cut(at('arms')); run(0.1); assert.equal(G.weapon.granted.length, 0, '武器柜之前没有');
  cut(1); run(0.1); assert.deepEqual(G.weapon.granted, [['launcher', false]], '和步枪一起给，不换到手上'); assert.equal(G.weapon.picked, 'rifle');
  assert.ok(msgs.some((t) => /榴弹枪.*按 5 换/.test(t)), msgs.filter((t) => /榴弹/.test(t)).join(' | '));
  assert.ok(lootOf(m.plan, m.plan.gates[1].stage).includes('launcher'), '第二道关的保底还在');
  // 换成手机：说「点换枪键」
  const { G: G2, begin: b2, cut: c2, run: r2, msgs: m2 } = sworld(); const mm = b2(); G2.input = { touch: true }; c2(mm.plan.stageOf('arms') + 1); r2(0.1); assert.ok(m2.some((t) => /榴弹枪.*点换枪键切换/.test(t)));
  // 第二把：已经有了 → 「榴弹 +2」；没有 → 「捡到榴弹枪」
  supplies.enabled = true; const p = player.pos;
  G.weapon.owns = { launcher: true }; supplies.place('launcher', { x: p.x + 0.3, y: p.y, z: p.z }); for (let k = 0; k < 6; k++) supplies.update(1 / 30);
  assert.ok(msgs.includes('榴弹 +2') && !msgs.some((t) => /捡到榴弹枪/.test(t)), msgs.slice(-3).join(' | '));
  assert.equal(msgs.filter((t) => t === '榴弹 +2').length, 1, '只说一次（实测里看到的两条是日志里同一条打了两遍）'); assert.equal(lootOf(m.plan, m.plan.gates[1].stage).filter((k) => k === 'launcher' || k === 'shell').length, 1, '第二道关只放一把');
  G.weapon.owns = { launcher: false }; supplies.place('launcher', { x: p.x + 0.3, y: p.y, z: p.z }); for (let k = 0; k < 6; k++) supplies.update(1 / 30);
  assert.ok(msgs.some((t) => /捡到榴弹枪 · 一发一装，按 5 换/.test(t)));
});

// 用户：「不用每一层都打完僵尸才走，挑两三层打完就好了」——只有关卡那三层非清不可，中间的楼层照样有丧尸、但楼梯不拦
test('逐层破楼只拦关卡那几层：中间的楼层还剩一群也能直接上楼梯（快速上楼也行）；关卡那层（关卡解决了）还剩一群照样拦；关卡那层摆得比中间的楼层多', () => {
  for (const tower of ['A', 'T1']) {
    const { G, zombies, run, list, arrive, siege, P, T } = climbWorld(tower);
    const mid = list.find((f) => !siege.mustClear(f)), g0 = P.gates[0].floor;
    assert.deepEqual(list.filter((f) => siege.mustClear(f)), P.gates.map((g) => g.floor), `${tower}：非清不可的就是三道关那三层`);
    // 先在关卡那层（第一道关已经解决）：还剩一群，拦（上到楼上以后，下面的楼层算打过了，所以先看这一层）
    arrive(g0); run(2);
    const here = zombies.alive().filter((z) => z.seed === g0).length, F = SIEGE.floors[tower];
    const r0 = runs.find((r) => r.from === g0 && r.id.startsWith(T.stair));
    assert.ok(here > SIEGE.floors.left, `${tower}：关卡那层 ${here} 只`); assert.match(siege.climbRule(r0), /先把这层清干净/);
    arrive(mid); run(2);
    const left = zombies.alive().filter((z) => z.seed === mid).length; assert.ok(left >= 3, `${mid} 有 ${left} 只`);
    const up = runs.find((r) => r.from === mid && r.id.startsWith(T.stair));
    assert.equal(siege.climbRule(up), null, `${mid} 还剩 ${left} 只也不拦`); assert.equal(G.stairBlock(up, 'up'), null);
    assert.ok(F.corridor + F.gate + F.landing + F.flats > F.pass.corridor + F.pass.landing + F.pass.flats, '关卡那层摆得多');
  }
});
