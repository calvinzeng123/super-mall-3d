// 丧尸围城（src/jimao/siege.js、zombie.js）：抽关卡、电梯 / 楼梯的封锁、清扫航线、丧尸的行为、和任务系统的衔接。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, clear } from '../src/layout/nav.js';
import { findPath } from '../src/fps/pathfinding.js';
import { pointInPoly } from '../src/layout/geom.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { stairRuns } from '../src/jimao/stairs.js';
import { SIEGE, TOWERS, GATES, pickTower, siegePlan, activeGate, liftRule, stairRule, siegeFlight, groundSpots, balconySpots, unitSites, lobbySpot, createSiege, gateBlock, balconyModel, reachSpot, plateOf } from '../src/jimao/siege.js';
import { doorOutside } from '../src/jimao/guide.js';
import { PACING, createPacing } from '../src/jimao/pacing.js';
import { SPECIALS } from '../src/jimao/zombie.js';
import { ZOMBIE, KINDS, pickKind, zombieParts, addZombies } from '../src/jimao/zombie.js';
import { FPS_MISSION } from '../src/fps/mission-layout.js';
import { createPathfinder } from '../src/jimao/pathfinder.js';

// 游戏里用的是门禁全开的导航（run.js）：北区塔楼的楼梯间、电梯厅要过门禁
const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' }), runs = stairRuns(nav);
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };
const elev = (id) => L.levels.find((l) => l.id === id).elev;

test('抽一局：武器柜 → 合闸 → 三道关（各一件工具、一处关卡）→ 信号弹；三道关种类不同、楼层一道比一道高，每一步的位置都在那一层的空地上', () => {
  const seen = new Set();
  for (const seed of [3, 7, 21, 99, 1234, 4321, 777, 2024]) {
    const plan = siegePlan(seq(seed), L, nav, runs);
    assert.deepEqual(plan.stages.map((s) => s.kind), ['locker', 'switch', 'tool', 'gate', 'tool', 'gate', 'tool', 'gate', 'flare']);
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
  assert.ok(findPath(nav, start, at(plan.stages[0])), '武器柜走得到');
  assert.ok(findPath(nav, start, at(plan.stages[1])), '配电间走得到');
  for (const g of plan.gates) if (GATES[g.type].at === 'stair') assert.ok(findPath(nav, { ...at(plan.stages[1]) }, at(plan.stages[g.stage])), `${g.n}F 的关卡走得到`);
  assert.ok(findPath(nav, start, at(plan.stages.at(-1))), '屋顶信号弹走得到');
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, q = landAt(nav, SIEGE.pad.x + Math.cos(a) * 7.5, SIEGE.pad.z + Math.sin(a) * 7.5, elev(SIEGE.roof) + 0.6); assert.ok(q && q.floor === SIEGE.roof && clear(nav, q)); }
});

test('封锁：合闸前公寓电梯不动；之后电梯只到眼前这道关所在的层、这一层往上的两部楼梯都不通；解决一道放开一段；商场的电梯不管', () => {
  const plan = siegePlan(seq(7), L, nav, runs), [g0, g1, g2] = plan.gates;
  const up = (g) => runs.find((r) => r.id === g.runs[0]), f = (n) => `A-${n}F`;
  assert.match(liftRule(plan, 0, nav, 'A-ST1', 'A-1F', 'A-2F'), /停电/); assert.match(liftRule(plan, 1, nav, 'A-ST1', 'A-B1', 'A-1F'), /停电/);
  assert.equal(liftRule(plan, 0, nav, 'P1-L3', 'P1-1F', 'P1-4F'), null);
  assert.equal(liftRule(plan, 2, nav, 'A-ST1', 'A-B1', f(g0.n)), null, '合闸后能到第一道关那层');
  assert.match(liftRule(plan, 2, nav, 'A-ST2', 'A-1F', f(g0.n + 1)), new RegExp(`只能到 ${g0.n}F`));
  assert.equal(activeGate(plan, 2), g0); assert.equal(activeGate(plan, g0.stage), g0); assert.equal(activeGate(plan, g0.stage + 1), g1);
  assert.match(stairRule(plan, 2, up(g0)), /先找/); assert.match(stairRule(plan, g0.stage, up(g0)), /用/, '工具到手以后提示改成「用」');
  assert.equal(stairRule(plan, 2, up(g1)), null, '后面的关还没轮到');
  assert.equal(stairRule(plan, g0.stage + 1, up(g0)), null, '解决了就通');
  assert.equal(liftRule(plan, g0.stage + 1, nav, 'A-ST1', f(g0.n), f(g1.n)), null); assert.ok(liftRule(plan, g0.stage + 1, nav, 'A-ST1', f(g0.n), f(g1.n + 1)));
  assert.equal(liftRule(plan, g2.stage + 1, nav, 'A-ST1', 'A-1F', 'A-RF'), null, '三道都解决：直达屋顶');
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
      const lx = Math.cos(p.yaw), lz = -Math.sin(p.yaw), cx = f.center.x - p.x, cz = f.center.z - p.z, d = Math.hypot(cx, cz);
      assert.ok((lx * cx + lz * cz) / d > 0.95, '左舷朝楼');
      assert.ok(Math.abs(d - f.R) < 0.5);
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
  G.missions = { rideKind: 'helicopter', vehicleCenter: () => new THREE.Vector3(player.pos.x + 20, player.pos.y + 45, player.pos.z) }; events.length = 0;
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
function sworld({ enabled = true, tower = 'A' } = {}) {
  const z = zworld({ count: ZOMBIE.pool }), { G } = z, msgs = [], store = new Map([['jimao-siege', enabled ? '1' : '0']]);
  const heli = { root: new THREE.Group(), poses: [], setPose(p) { this.poses.push(p); }, reset() { this.parked = true; }, moveTo() {} };
  const director = { state: { mission: null, restore: false }, vehicles: { heli }, riding: false, opened: 0, openExtraction() { this.opened++; } };
  const flow = { patrol: { soldier: 8 }, waves: [{ soldier: 5 }, { soldier: 6 }], pursuitExtra: 5 };
  Object.assign(G, { game: { state: 'playing', run: { relays: [] }, refreshObjective() {} }, hud: { message: (t) => msgs.push(t), radio: (t) => msgs.push('R:' + t) }, rifle: { ammo: 30, reserve: 150 }, weapon: { picked: null, select(s) { this.picked = s; } } });
  G.physics.stateOf = (p) => landAt(nav, p.x, p.z, p.y + 0.6); G.physics.forget = () => {};
  const siege = createSiege(G, { layout: L, nav, scene: G.scene, zombies: z.zombies, director, runs, flow, rng: seq(7), tower, storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } });
  const begin = () => { const m = siege.mission(seq(7)); director.state.mission = m; m.objectives.forEach((o) => { o.object = o.model(); o.pos = new THREE.Vector3(o.site.x, o.site.y, o.site.z); }); G.game.run.relays = m.objectives.map((o) => ({ o, cut: false })); siege.reset(); return m; };
  const cut = (n) => { for (let i = 0; i < n; i++) G.game.run.relays.find((r) => !r.cut).cut = true; };
  const run = (secs, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { G.time.frame++; each?.(); siege.update(1 / 30); for (const q of [...z.ctx.list]) q._update(1 / 30); } };
  return { ...z, siege, director, flow, msgs, store, heli, begin, cut, run };
}

test('任务的样子：九个目标一个一个放（后面的锁着）；撤离点先关着、直升机停在公寓楼顶；开局步枪没子弹、换成手枪；原游戏自己的巡逻和增援停掉，关掉模式再还原', () => {
  const { G, siege, director, flow, begin, store } = sworld();
  assert.equal(siege.enabled, true);
  const m = begin();
  assert.equal(m.type, 'siege'); assert.equal(m.objectives.length, 9); assert.deepEqual(m.objectives.map((o) => !!o.locked), [false, true, true, true, true, true, true, true, true]);
  const x = m.extraction; assert.equal(x.id, 'heli'); assert.equal(x.floor, 'A-RF'); assert.equal(x.closed, true); assert.equal(x.vehicle, SIEGE.pad);
  assert.ok(Math.hypot(x.x - SIEGE.pad.x, x.z - SIEGE.pad.z) < 6 && Math.hypot(x.x - SIEGE.pad.x, x.z - SIEGE.pad.z) > 1, '登机门在机身旁边');
  assert.ok(x.flight.poseAt && x.ride.spawns && x.ride.targets && x.ride.onBoard && x.orbit.center);
  assert.equal(G.rifle.ammo, 30, '原游戏重置武器在后面，这时还没改'); siege.update(1 / 30);
  assert.equal(G.rifle.ammo, 0); assert.equal(G.rifle.reserve, 0); assert.equal(G.weapon.picked, 'pistol');
  assert.equal(director.vehicles.heli.root.visible, false, '直升机还没来');
  assert.deepEqual(flow.patrol, { gull: 0, hound: 0, soldier: 0 }); assert.equal(flow.pursuitExtra, 0);
  assert.match(G.liftAllow({ id: 'A-ST1' }, 'A-1F', 'A-3F'), /停电/); assert.equal(typeof G.stairBlock, 'function');
  assert.equal(m.text({ allCut: false }), m.plan.stages[0].text); assert.ok(m.plan.stages[2].site.unit, '住户房间带着户号（路线指引靠它找门）');
  assert.equal(m.radio.cut.length, 8);
  // 关掉
  siege.enabled = false; assert.equal(store.get('jimao-siege'), '0'); siege.reset();
  assert.deepEqual(flow.patrol, { soldier: 8 }); assert.equal(flow.pursuitExtra, 5); assert.equal(G.liftAllow, null); assert.equal(G.stairBlock, null);
});

test('一步步来：开了武器柜步枪才有子弹；每完成一步放出下一步；解决一道关，挡路的大件挪开；点了信号弹开始守屋顶', () => {
  const { G, siege, begin, cut, run } = sworld();
  const m = begin(), S = siege.state;
  run(0.1); assert.equal(S.stage, 0);
  cut(1); run(0.1);
  assert.equal(S.stage, 1); assert.equal(G.rifle.ammo, SIEGE.ammo.rifle); assert.equal(G.rifle.reserve, SIEGE.ammo.reserve); assert.equal(G.weapon.picked, 'rifle');
  assert.deepEqual(m.objectives.map((o) => !!o.locked), [true, false, true, true, true, true, true, true, true]);
  cut(1); run(0.1); assert.equal(S.stage, 2); assert.ok(S.noise > 60, '拉闸动静很大'); assert.equal(G.liftAllow({ id: 'A-ST1' }, 'A-B1', `A-${m.plan.gates[0].n}F`), null);
  const g0 = m.plan.gates[0]; assert.match(G.stairBlock(runs.find((r) => r.id === g0.runs[1]), 'up'), /先找/); assert.equal(G.stairBlock(runs.find((r) => r.id === g0.runs[1]), 'down'), null);
  cut(2); run(1); assert.equal(S.stage, 4); assert.ok(g0.block.children[0].position.lengthSq() > 0.5 || g0.block.children[0].scale.x < 0.5 || !g0.block.children[0].visible, '第一道关的大件挪开了');
  assert.equal(G.stairBlock(runs.find((r) => r.id === g0.runs[0]), 'up'), null);
  cut(4); run(0.1); assert.equal(S.stage, 8); assert.equal(S.hold, -1);
  cut(1); run(0.1); assert.equal(S.stage, 9); assert.ok(S.hold >= 0, '信号弹点着了，开始守');
  assert.equal(m.text({ allCut: true }), '守住屋顶，等直升机');
});

test('被堵的楼梯走不上去：人踏进那一段就退回原地、给一句提示；解决以后能走', () => {
  const { G, siege, player, msgs, begin, cut, run } = sworld();
  const m = begin(); cut(2); run(0.1);
  const g0 = m.plan.gates[0], r = runs.find((x) => x.id === g0.runs[0]);
  player.pos.set(r.a.x, r.a.y, r.a.z); run(0.1); const safe = player.pos.clone();
  player.pos.set(r.ea.x + r.da.x * 1.2, r.ea.y + 0.5, r.ea.z + r.da.z * 1.2); // 走上第一段梯
  assert.ok(landAt(nav, player.pos.x, player.pos.z, player.pos.y + 0.6)?.slope, '这一点在梯段上');
  run(0.1); assert.ok(player.pos.distanceTo(safe) < 1e-6, '被推回来'); assert.match(msgs.at(-1), /先找/);
  cut(2); run(0.1);
  player.pos.set(r.ea.x + r.da.x * 1.2, r.ea.y + 0.5, r.ea.z + r.da.z * 1.2); const on = player.pos.clone(); run(0.1);
  assert.ok(player.pos.distanceTo(on) < 1e-6, '解决以后不拦');
  void siege; void G;
});

test('响动：开枪攒响动（手枪比步枪小），攒满来一波尸群（认定了人、不会跟丢），之后有冷却；安静下来慢慢回落；附近的丧尸听见枪声围过来', () => {
  const { G, siege, zombies, enemies, player, msgs, begin, run, ahead } = sworld();
  begin(); const S = siege.state; run(0.1);
  const z = enemies.spawn('zombie', ahead(20), { kind: 'walker', passive: true });
  G.events.emit('weapon:fire', { kind: 'pistol' }); assert.equal(S.noise, SIEGE.noise.pistol); assert.equal(z.zs, 'chase', '20 米内听见了');
  G.events.emit('weapon:fire', {}); assert.equal(S.noise, SIEGE.noise.pistol + SIEGE.noise.rifle);
  run(SIEGE.noise.quiet + 1); assert.ok(S.noise < SIEGE.noise.pistol + SIEGE.noise.rifle - 3, '安静了就回落');
  S.hordeCool = 0; for (let i = 0; i < 16; i++) G.events.emit('weapon:fire', {});
  // 响动满了：先预警三秒（提示「尸潮要来了」），到点才冲出来
  const before = zombies.alive().length; run(0.3);
  assert.ok(msgs.some((t) => /尸潮要来了/.test(t)), '先预警'); assert.equal(siege.pacing.phase, 'build'); assert.ok(siege.pacing.warning > 2);
  assert.ok(zombies.alive().filter((q) => q.hunt).length < 4, '预警的三秒里还没来');
  run(PACING.warn - 0.1);
  const now = zombies.alive();
  assert.equal(siege.pacing.phase, 'peak');
  assert.ok(now.length >= before + 4, `尸潮来了 ${now.length - before} 只`); assert.ok(now.filter((q) => q.hunt).length >= 4); assert.ok(msgs.some((t) => /^尸潮！/.test(t)));
  assert.ok(S.noise <= SIEGE.noise.after + 1); assert.ok(S.hordeCool > 10);
  for (const q of now.filter((h) => h.hunt)) assert.ok(Math.hypot(q.pos.x - player.pos.x, q.pos.z - player.pos.z) >= 12, '不在脸上冒出来（14 米外出生，这 0.2 秒里奔尸已经跑了一米）');
  // 手雷更响
  S.noise = 0; G.events.emit('grenade:explode', { pos: player.pos }); assert.equal(S.noise, SIEGE.noise.grenade);
});

test('守屋顶：一波波从楼梯口上来，倒计时走完直升机从天上降到停机位，落稳了才开放登机；登机后清扫——屋顶、阳台、楼下三处都出齐，全清掉就定下返航', () => {
  const { G, siege, zombies, director, heli, player, begin, cut, run } = sworld();
  const m = begin(); cut(9); run(0.1);
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
  assert.equal(sw.list.filter((z) => z.sweep === 'roof').length, SIEGE.sweep.roof); assert.equal(sw.list.filter((z) => z.sweep === 'window').length, SIEGE.sweep.window);
  assert.ok(sw.list.filter((z) => z.sweep === 'window').every((z) => z.fixed), '阳台上的钉在原地');
  assert.ok(sw.list.some((z) => z.kind === 'screamer'), '屋顶上有尖叫者');
  let t = 0; const tick = (secs) => { for (let k = 0; k < secs * 30; k++) { t += 1 / 30; m.extraction.ride.spawns(1 / 30, t); } };
  tick(20); const half = sw.list.filter((z) => z.sweep === 'ground').length; assert.ok(half >= 5 && half <= SIEGE.sweep.ground / 2 + 1, `前半程楼下出来 ${half} 只`);
  t = m.extraction.flight.times.ground; tick(8); assert.equal(sw.made.ground, SIEGE.sweep.ground);
  assert.equal(sw.list.filter((z) => z.kind === 'screamer').length, SIEGE.sweep.screamers, '尖叫者一共三只');
  assert.equal(m.extraction.ride.targets().length, sw.list.filter((z) => z.alive).length);
  assert.match(m.text({ allCut: true }, { kills: 0 }), /清扫 · 屋顶 0\/8 · 阳台 0\/6 · 楼下 0\/14/);
  // 打一只阳台上的：玻璃先碎
  const bz = sw.list.find((z) => z.sweep === 'window'); bz.damage(10, null, null, 'body');
  assert.equal(m.extraction.flight.leaving, false);
  for (const z of sw.list) if (z.alive) z.damage(9999, null, null, 'body');
  assert.match(m.text({ allCut: true }, { kills: 0 }), /屋顶 8\/8 · 阳台 6\/6/);
  tick(0.2); assert.equal(m.extraction.flight.leaving, true, '清完了：定下返航'); assert.ok(m.extraction.flight.duration() < t + 10);
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
    assert.equal(plan.tower, T); assert.deepEqual(plan.stages.map((q) => q.kind), ['locker', 'switch', 'tool', 'gate', 'tool', 'gate', 'tool', 'gate', 'flare']);
    for (const st of plan.stages) { const q = landAt(nav, st.site.x, st.site.z, st.site.y + 0.6); assert.ok(q && q.floor === st.floor && clear(nav, q), `${st.id}（${st.label}）站得住`); }
    assert.equal(plan.stages[1].floor, 'P1-B1'); assert.match(plan.stages[1].text, /北区 1 号楼停电/); assert.equal(plan.stages.at(-1).floor, 'T1-RF');
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
    if (seed === 5) assert.ok(findPath(nav, start, at(plan.stages[1].site)), '从商场走得到北区 1 号楼的地下电梯厅');
    assert.match(liftRule(plan, 1, nav, 'T1-LF', 'P1-B1', 'T1-9F'), /北区 1 号楼停电/); assert.equal(liftRule(plan, 1, nav, 'A-ST1', 'A-1F', 'A-3F'), null, '这一局不管公寓的电梯');
    assert.equal(liftRule(plan, 2, nav, 'T1-ST-A', 'P1-B1', plan.gates[0].floor), null); assert.ok(liftRule(plan, 2, nav, 'T1-ST-A', 'P1-B1', `T1-${plan.gates[0].n + 1}F`));
  }
});

test('北区 1 号楼的停机位和航线：屋顶东头 6.5 米内是空地、登机门在屋面上；绕飞不撞楼（旁边 2 号楼隔着 14 米）；阳台挂在南北两面长墙外，楼下的全在商场屋面上', () => {
  const T = TOWERS.T1, y = elev(T.roof), pad = T.pad;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, q = landAt(nav, pad.x + Math.cos(a) * 6.5, pad.z + Math.sin(a) * 6.5, y + 0.6); assert.ok(q && q.floor === T.roof && clear(nav, q)); }
  const f = siegeFlight(pad, y, { R: T.R });
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
  assert.match(m.radio.intro, /北区 1 号楼楼顶/); assert.match(G.liftAllow({ id: 'T1-LE' }, 'P1-1F', 'T1-8F'), /停电/); assert.equal(G.liftAllow({ id: 'A-ST1' }, 'A-1F', 'A-8F'), null);
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
  pf.setBlocked((c) => c.kind === 'lift' && !!liftRule(plan, 2, nav, c.link, c.from, c.to));
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
  begin(); const S = siege.state; run(0.1);
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
  cut(6); run(0.1);
  assert.ok(S.bruteT > 0, `bruteT ${S.bruteT}`); run(8);
  assert.equal(zombies.alive().filter((z) => z.kind === 'brute').length, 1); assert.ok(msgs.some((t) => /巨尸/.test(t)));
});
