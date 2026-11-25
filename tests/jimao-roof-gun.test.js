// 丧尸围城的楼顶机枪阵地（src/jimao/roof-gun.js，枪是 twin-hmg.js 的双联重机枪）：每栋楼一座——公寓在中间那一条、360 度，北区在东南角、只打正面 180 度；
// 摆在哪（不碰停机位 / 旋翼 / 登机门 / 信号弹 / 楼梯口）、工事（沙袋墙进导航、铁丝网减速掉血）、丧尸绕到口子还是够得着人、架着枪时咬人有上限、
// 落点炸开把一堆掀开、过热、上下台子、直升机落稳 / 读档 / 阵亡 / 被掀下来都会下来、换楼收干净。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, clear } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { createPathfinder } from '../src/jimao/pathfinder.js';
import { stairRuns } from '../src/jimao/stairs.js';
import { TOWERS, siegePlan } from '../src/jimao/siege.js';
import { RIDE_SPECS, rideLocalToWorld, rideFootprint } from '../src/jimao/ride-vehicles.js';
import { ROOF_GUN, siteGeom, blockNav, unblockNav, createRoofGun, ringWalls, wallsBetween, segDist2 } from '../src/jimao/roof-gun.js';
import { TWIN_HMG } from '../src/jimao/twin-hmg.js';
import { addZombies, ZOMBIE } from '../src/jimao/zombie.js';

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' }), runs = stairRuns(nav);
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };
const roofY = (T) => nav.floors.get(T.roof).y;
const st = (T, x, z) => ({ floor: T.roof, x, z, y: roofY(T), slope: null });
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
/** 点到轴对齐方框的水平距离 */
const toBox = (b, x, z) => Math.hypot(Math.max(0, b.x0 - x, x - b.x1), Math.max(0, b.z0 - z, z - b.z1));
/** 点到凸多边形的水平距离：在里面给 0 */
function toPoly(p, x, z) {
  let pos = 0, neg = 0, d = Infinity;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c > 0) pos++; else if (c < 0) neg++; d = Math.min(d, segDist2(x, z, a, b)); }
  return pos === 0 || neg === 0 ? 0 : d;
}
/** 屋顶上楼梯间 / 电梯井的方框（和 siege.js housings() 一样算） */
function housings(T) {
  const lv = L.levels.find((l) => l.id === T.roof), out = [];
  const add = (pts, pad = 0) => { const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]); out.push({ x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad }); };
  for (const r of lv.rooms || []) if ((r.type === 'stair' || r.type === 'core') && r.polys?.length) add(r.polys.flat());
  for (const r of runs) if (r.to === T.roof) add([r.a, r.b, r.ea, r.eb].filter(Boolean).map((q) => [q.x, q.z]), 0.6);
  return out;
}
/** 这栋楼的阵地整个摆进导航（台子 + 沙袋墙，和 roof-gun.js 摆的一样），返回撤掉的函数 */
function placeAll(T) {
  const g = siteGeom(ROOF_GUN.sites[T.id][0], roofY(T)), bl = [blockNav(nav, T.roof, g.poly, ROOF_GUN.deck.h), ...g.walls.map((w) => blockNav(nav, T.roof, w.poly, ROOF_GUN.bags.top))];
  return { g, undo() { for (const b of bl.reverse()) unblockNav(nav, b); } };
}
const pathLen = (p) => { let n = 0; for (let i = 1; i < p.length; i++) n += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return n; };
/** 一条路线有多长一段踩在铁丝网里 */
function wireLen(g, p) {
  let n = 0;
  for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i], L0 = Math.hypot(b.x - a.x, b.z - a.z), k = Math.max(1, Math.ceil(L0 / 0.2)); for (let j = 0; j < k; j++) { const t = (j + 0.5) / k, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (g.wire.some((w) => segDist2(x, z, w.a, w.b) < ROOF_GUN.wire.r)) n += L0 / k; } }
  return n;
}
const FLARE_TRY = [[7.5, 3], [-7.5, 3], [3, 7.5], [3, -7.5], [-7.5, -3], [7.5, -3], [-3, 7.5], [-3, -7.5]];

test('摆在哪：每栋楼只有一座。公寓在屋顶中间那一条（停机位让开旋翼、登机门）、360 度；北区只打一面（射界 180 度、正中朝楼梯间出口）；工事不压停机位、旋翼、登机门、信号弹、楼梯间', () => {
  assert.equal(ROOF_GUN.sites.A.length, 1, '公寓楼顶只有一座');
  assert.equal(ROOF_GUN.sites.T1.length, 1, '北区 1 号楼只有一座');
  assert.equal(ROOF_GUN.sites.A[0].arc, Infinity, '公寓那座 360 度');
  assert.ok(Math.abs(ROOF_GUN.sites.T1[0].arc - Math.PI) < 1e-9, '北区那座射界 180 度');
  for (const T of Object.values(TOWERS)) {
    const y = roofY(T), H = housings(T), b0 = L.buildings.find((b) => b.id === T.id), zs = b0.outline.map((p) => p[1]), fp = rideFootprint(T.pad);
    const site = ROOF_GUN.sites[T.id][0], g = siteGeom(site, y), b = g.bb;
    const hub = rideLocalToWorld(T.pad, y, [0, 0, -0.45]), door = rideLocalToWorld(T.pad, y, RIDE_SPECS.helicopter.doorOut);
    const flare = siegePlan(seq(5), L, nav, runs, T).flare, upto = FLARE_TRY.findIndex(([dx, dz]) => Math.abs(T.pad.x + dx - flare.x) < 1e-6 && Math.abs(T.pad.z + dz - flare.z) < 1e-6);
    // 台子整个压在屋面上、不压楼梯间
    for (let x = b.x0; x <= b.x1; x += 0.3) for (let z = b.z0; z <= b.z1; z += 0.3) {
      const q = landAt(nav, x, z, y + 0.6); assert.ok(q && q.floor === T.roof && Math.abs(q.y - y) < 0.05, `${T.id} 台子 (${x.toFixed(1)}, ${z.toFixed(1)}) 在屋面上`);
      assert.ok(!H.some((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1), `${T.id} 台子不压楼梯间`);
    }
    assert.ok(toBox(b, hub.x, hub.z) > 5.4, `${T.id} 台子离旋翼轴 ${toBox(b, hub.x, hub.z).toFixed(2)} 米（旋翼半径 5.3）`);
    assert.ok(ROOF_GUN.deck.h + ROOF_GUN.deck.rail < 3.15, '护栏顶比旋翼低');
    // 沙袋墙、铁丝网、台子：不压机身（外扩 1 米）、离登机门 2.5 米以上、离信号弹（和挑中它之前的备选点）、不压楼梯间（外扩 1 米）
    const parts = [...g.walls.map((w) => ({ name: '沙袋墙', d: (x, z) => toPoly(w.poly, x, z) })), ...g.wire.map((w) => ({ name: '铁丝网', d: (x, z) => Math.max(0, segDist2(x, z, w.a, w.b) - ROOF_GUN.wire.r) })), { name: '台子', d: (x, z) => toBox(b, x, z) }];
    for (const p of parts) {
      for (let x = fp.x0 - 1; x <= fp.x1 + 1; x += 0.25) for (let z = fp.z0 - 1; z <= fp.z1 + 1; z += 0.25) assert.ok(p.d(x, z) > 0, `${T.id} ${p.name} 压着机身`);
      assert.ok(p.d(door.x, door.z) > 2.5, `${T.id} ${p.name} 离登机门 ${p.d(door.x, door.z).toFixed(2)} 米`);
      assert.ok(p.d(flare.x, flare.z) > 2, `${T.id} ${p.name} 离信号弹 ${p.d(flare.x, flare.z).toFixed(1)} 米`);
      for (const [dx, dz] of FLARE_TRY.slice(0, upto + 1)) assert.ok(p.d(T.pad.x + dx, T.pad.z + dz) > 1.2, `${T.id} ${p.name} 不压信号弹的备选点 (${dx}, ${dz})`);
      for (const h of H) for (let x = h.x0 - 1; x <= h.x1 + 1; x += 0.25) for (let z = h.z0 - 1; z <= h.z1 + 1; z += 0.25) assert.ok(p.d(x, z) > 0, `${T.id} ${p.name} 压着楼梯间 (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
    assert.ok(g.seat.y - y > 3, '眼睛在台面上');
    if (T.id === 'A') {
      // 屋顶中间那一条：和停机位同一个 z（屋面南北 74 米，偏不到 2 米），往旁边让开；整圈沙袋墙离旋翼轴 6 米以上
      assert.ok(Math.abs(site.z - T.pad.z) < 2 && Math.abs((Math.min(...zs) + Math.max(...zs)) / 2 - site.z) < 4, `公寓：在中间那一条 (${site.x}, ${site.z})`);
      for (const w of g.walls) for (const p of w.poly) assert.ok(Math.hypot(p[0] - hub.x, p[1] - hub.z) > 6, `公寓：沙袋墙离旋翼轴 ${Math.hypot(p[0] - hub.x, p[1] - hub.z).toFixed(1)} 米`);
      for (const w of g.wire) for (const p of [w.a, w.b]) assert.ok(Math.hypot(p[0] - hub.x, p[1] - hub.z) > 5.3 + ROOF_GUN.wire.r, '公寓：铁丝网在旋翼外面');
    } else {
      // 北区：射界正中朝楼梯间那个出口（机房朝停机位那头的过道口），出口在射界里偏不到 30 度；停机位那一头也在射界里
      const ex = { x: Math.max(...H.map((h) => h.x1)) + 0.5, z: -235.2 }, toEx = Math.atan2(-(ex.x - g.seat.x), -(ex.z - g.seat.z));
      assert.ok(Math.abs(wrap(toEx - g.center)) < 0.52, `北区：出口在射界正中偏 ${(wrap(toEx - g.center) * 57.3).toFixed(0)} 度`);
      assert.ok(Math.abs(wrap(Math.atan2(-(hub.x - g.seat.x), -(hub.z - g.seat.z)) - g.center)) < g.arc / 2, '北区：停机位在射界里');
    }
  }
  // 八角形一圈：8 条边、两个口子各断成两段，口子宽多少就是多少
  const r = ringWalls(4.6, { 0: 2, 4: 1.6 });
  assert.equal(r.length, 10);
  assert.ok(Math.abs(Math.hypot(r[0][2] - r[1][0], r[0][3] - r[1][1]) - 2) < 1e-9, '口子 2 米宽');
});

test('工事摆进导航：台子、沙袋墙里站不住，撤掉复原；信号弹还在原来那一点；两个楼梯口、屋面四周走得到梯子口（公寓从东口进、北区从正面进），梯子口走得到登机门，楼梯口到停机位的路不贴着工事', () => {
  for (const T of Object.values(TOWERS)) {
    const y = roofY(T), before = siegePlan(seq(5), L, nav, runs, T).flare, F = nav.floors.get(T.roof), w0 = F.walls.length, o0 = F.obstacles.length;
    const { g, undo } = placeAll(T);
    try {
      const pf = createPathfinder(nav), after = siegePlan(seq(5), L, nav, runs, T).flare, foot = st(T, g.foot.x, g.foot.z);
      assert.deepEqual([after.x, after.z], [before.x, before.z], `${T.id} 信号弹的位置不变`);
      assert.ok(!clear(nav, st(T, g.x, g.z)), `${T.id} 台子里站不住`);
      for (const w of g.walls) { const c = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]; assert.ok(!clear(nav, st(T, c[0], c[1])), `${T.id} 沙袋墙上站不住`); }
      assert.ok(clear(nav, foot), `${T.id} 梯子口站得住`);
      for (const q of g.posts) { assert.ok(clear(nav, st(T, q.x, q.z)), `${T.id} 队友那一处站得住`); assert.ok(pf.findNow(foot, st(T, q.x, q.z)), `${T.id} 队友走得到他那一处`); }
      const door = rideLocalToWorld(T.pad, y, RIDE_SPECS.helicopter.doorOut);
      const board = pf.findNow(foot, st(T, door.x, door.z)); assert.ok(board, `${T.id} 梯子口走得到登机门`);
      assert.ok(pathLen(board) < (T.id === 'A' ? 10 : 8), `${T.id} 下来去登机 ${pathLen(board).toFixed(1)} 米`);
      assert.ok(wireLen(g, board) === 0, `${T.id} 去登机门不踩铁丝网`);
      for (const r of runs.filter((q) => q.to === T.roof)) {
        const top = st(T, r.b.x, r.b.z), toPad = pf.findNow(top, st(T, T.pad.x, T.pad.z));
        assert.ok(toPad, `${T.id} ${r.id} 楼梯口到停机位还走得通`);
        for (const p of toPad) { assert.ok(toBox(g.bb, p.x, p.z) > 0.8, `${r.id} 出门的路不贴着台子`); for (const w of g.walls) assert.ok(toPoly(w.poly, p.x, p.z) > 0.3, `${r.id} 出门的路不贴着沙袋墙`); }
        const p = pf.findNow(top, foot); assert.ok(p, `${T.id} ${r.id} 楼梯口走得到梯子口`);
        // 最后一段从梯子那一侧（公寓：东口；北区：正面）过来
        const last = p.at(-2), lz = (last.x - g.x) * Math.sin(g.yaw) + (last.z - g.z) * Math.cos(g.yaw);
        assert.ok(lz > 0.5, `${T.id} ${r.id} 从梯子那一侧过来（局部 z ${lz.toFixed(1)}）`);
      }
      assert.ok(pf.findNow(st(T, after.x, after.z), foot), `${T.id} 信号弹走得到梯子口`);
      // 屋面四周（翻女儿墙上来的）：每一处都走得到梯子口——工事挡路、不把谁关在外面
      const b0 = L.buildings.find((b) => b.id === T.id), xs = b0.outline.map((q) => q[0]), zs = b0.outline.map((q) => q[1]);
      let n = 0;
      for (let k = 0; k < 24; k++) {
        const u = (k + 0.5) / 24, side = k % 4, x = side === 0 ? Math.min(...xs) + 1.4 : side === 1 ? Math.max(...xs) - 1.4 : Math.min(...xs) + 2 + u * (Math.max(...xs) - Math.min(...xs) - 4);
        const z = side === 2 ? Math.min(...zs) + 1.4 : side === 3 ? Math.max(...zs) - 1.4 : Math.min(...zs) + 2 + u * (Math.max(...zs) - Math.min(...zs) - 4), q = landAt(nav, x, z, y + 0.6);
        if (!q || q.floor !== T.roof || !clear(nav, q) || housings(T).some((h) => x > h.x0 - 0.5 && x < h.x1 + 0.5 && z > h.z0 - 0.5 && z < h.z1 + 0.5)) continue;
        n++; assert.ok(pf.findNow(q, foot), `${T.id} (${x.toFixed(1)}, ${z.toFixed(1)}) 走得到梯子口`);
      }
      assert.ok(n >= 8, `${T.id} 试了 ${n} 处`);
      if (T.id === 'A') {
        // 绕到背后又远又慢：从南北两边沙袋墙外 1 米走到西口里面，比走到东口里面费时得多（按走路的时间算：铁丝网里只有 snare 的速度）
        const lw = (lx, lz) => st(T, g.x + lx * Math.cos(g.yaw) + lz * Math.sin(g.yaw), g.z - lx * Math.sin(g.yaw) + lz * Math.cos(g.yaw));
        const cost = (p) => pathLen(p) + wireLen(g, p) * (1 / ROOF_GUN.wire.slow - 1);
        for (const side of [1, -1]) {
          const from = lw(side * 5.9, 0), pw = pf.findNow(from, lw(0, -3.6)), pe = pf.findNow(from, lw(0, 3.6));
          assert.ok(pw && pe, '西口、东口都进得去');
          assert.ok(cost(pw) > cost(pe) * 1.4, `绕到西口 ${pathLen(pw).toFixed(1)} 米（铁丝网 ${wireLen(g, pw).toFixed(1)} 米），东口 ${pathLen(pe).toFixed(1)} 米（铁丝网 ${wireLen(g, pe).toFixed(1)} 米）`);
        }
      } else {
        // 北区只打一面：梯子口 1.6 米一圈里走得到的点，全在射界里（背后、侧面是女儿墙和沙袋墙）
        for (let k = 0; k < 32; k++) {
          const a = (k / 32) * Math.PI * 2, x = g.foot.x + Math.sin(a) * 1.6, z = g.foot.z + Math.cos(a) * 1.6, q = landAt(nav, x, z, y + 0.6);
          if (!q || q.floor !== T.roof || !clear(nav, q) || !pf.findNow(foot, q)) continue;
          const yaw = Math.atan2(-(x - g.seat.x), -(z - g.seat.z));
          assert.ok(Math.abs(wrap(yaw - g.center)) <= g.arc / 2, `北区：梯子口旁边 (${x.toFixed(1)}, ${z.toFixed(1)}) 在射界里`);
        }
        // 台子背后那条缝堵死了
        for (let zz = g.bb.z0; zz <= g.bb.z1; zz += 0.4) { const q = landAt(nav, g.bb.x1 + 0.35, zz, y + 0.6); assert.ok(!q || q.floor !== T.roof || !clear(nav, q), '台子背后没有路'); }
      }
    } finally { undo(); }
    assert.equal(F.walls.length, w0); assert.equal(F.obstacles.length, o0, `${T.id} 撤掉以后复原`);
  }
});

test('沙袋墙是矮墙：挡路、挡丧尸直着扑（lowCover），子弹 / 视线只挡到 0.95 米——台上往下打打得过去，往墙根打打在墙上；直升机上看也按它算', () => {
  const T = TOWERS.A, y = roofY(T), { g, undo } = placeAll(T);
  try {
    const ph = createMapPhysics(nav), w = g.walls[2], c = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], ox = c[0] - g.x, oz = c[1] - g.z, k = 1 / Math.hypot(ox, oz);
    const inside = new THREE.Vector3(g.x + ox * k * 2.5, y, g.z + oz * k * 2.5), outside = new THREE.Vector3(c[0] + ox * k * 1.5, y, c[1] + oz * k * 1.5);
    assert.ok(wallsBetween(g.walls, inside, outside), '隔着沙袋墙');
    assert.ok(!wallsBetween(g.walls, g.foot, new THREE.Vector3(g.foot.x + Math.sin(g.yaw) * 3, y, g.foot.z + Math.cos(g.yaw) * 3)), '从口子往外看不隔着');
    assert.ok(!ph.lineOfSight(inside.clone().setY(y + 0.5), outside.clone().setY(y + 0.5)), '0.5 米高挡住');
    assert.ok(ph.lineOfSight(inside.clone().setY(y + 1.5), outside.clone().setY(y + 1.5)), '1.5 米高看得过去');
    assert.ok(ph.lineOfSight(g.seat, outside.clone().setY(y + 1.2)), '台上看得见墙外的丧尸胸口（台子的挡板也只到台面那么高）');
    assert.ok(ph.lineOfSight(g.seat, new THREE.Vector3(g.foot.x, y + 1.2, g.foot.z)), '台上看得见梯子口那一只的胸口');
    const d = outside.clone().setY(y + 0.4).sub(g.seat).normalize(), hit = ph.raycast(g.seat, d, 30);
    assert.ok(hit && hit.dist < g.seat.distanceTo(outside.clone().setY(y + 0.4)) - 0.2, '往墙根底下打：打在墙上');
    assert.ok(!ph.sightAcross(new THREE.Vector3(inside.x, y + 0.4, inside.z), new THREE.Vector3(outside.x, y + 0.4, outside.z)), '跨楼层射线也挡');
  } finally { undo(); }
});

// ---- 接到游戏上（假的游戏外壳，真的导航、物理、丧尸） ----
function gworld(tower = 'A', { zombies = 0 } = {}) {
  const physics = createMapPhysics(nav); physics.pathfinder = createPathfinder(nav);
  const handlers = {}, events = [], hurt = [], shots = [], msgs = [];
  const T = TOWERS[tower], y = roofY(T);
  const player = { pos: new THREE.Vector3(T.pad.x + 3, y, T.pad.z + 3), vel: new THREE.Vector3(), eye: new THREE.Vector3(), yaw: 0, pitch: 0, alive: true, health: 100, mounted: false,
    damage(n) { hurt.push(n); this.health -= n; }, addShake() {} };
  const input = { touch: false, held: new Set(), tap: new Set(), fire: false, promptOn: false, down(a) { return this.held.has(a); }, pressed(a) { return this.tap.has(a); }, setPrompt(v) { this.promptOn = !!v; } };
  const camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.05, 500);
  const ctx = { rng: seq(11), list: [], retire(m) { m._deactivate(); const i = ctx.list.indexOf(m); if (i >= 0) ctx.list.splice(i, 1); }, releaseToken() {} };
  const enemies = { debug: { ctx }, list: ctx.list, spawn(type, pos, opts) { const z = ctx.pools[type].find((q) => !q.active); if (!z) return null; z._activate(pos, opts); ctx.list.push(z); return z; } };
  const weapon = { shown: true, setVisible(v) { this.shown = v; } };
  const G = { scene: new THREE.Scene(), physics, player, input, camera, enemies, time: { frame: 0 }, weapon, rifle: { ammo: 30, reserve: 90 },
    events: { emit(n, e) { events.push([n, e]); for (const h of handlers[n] || []) h(e); }, on(n, h) { (handlers[n] ||= []).push(h); }, off(n, h) { handlers[n] = (handlers[n] || []).filter((q) => q !== h); } },
    combat: { playerShot(o, d, opts) { shots.push({ o: o.clone(), d: d.clone(), ...opts }); return null; } },
    hud: { prompt: null, setPrompt(t) { this.prompt = t; }, message(t) { msgs.push(t); }, radio(t) { msgs.push('R:' + t); } },
    game: { state: 'playing', refreshObjective() {} }, fx: { smoke() {}, explosion() {} } };
  G.zombies = zombies ? addZombies(G, enemies, { count: zombies }) : { pool: [] };
  const siege = { enabled: true, plan: { tower: T }, state: { hold: 5, landed: false, pin: null }, demo: { running: false } }, director = { riding: false };
  const rg = createRoofGun(G, { scene: G.scene, nav, siege, director, camera });
  rg.reset();
  const frame = (dt = 1 / 30) => {
    G.time.frame++;
    camera.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); camera.updateMatrixWorld();
    physics.pathfinder.update(4);
    for (const z of [...ctx.list]) z._update(dt);
    rg.update(dt); input.tap.clear();
  };
  const run = (secs, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { each?.(); frame(); } };
  const press = (a) => { input.tap.add(a); frame(); };
  const spawn = (x, z, kind = 'walker') => G.enemies.spawn('zombie', new THREE.Vector3(x, y, z), { kind, hunt: true });
  const up = () => { const e = rg.list[0]; player.pos.copy(e.geo.foot); player.mounted = false; press('interact'); run(0.6); assert.equal(rg.active, true, '上去了'); return e; };
  return { G, T, y, rg, siege, director, player, input, camera, events, hurt, shots, msgs, weapon, frame, run, press, ctx, spawn, up, dispose() { rg.dispose(); } };
}

test('上台子：走到梯子口有提示，按 E 上去——人的脚留在梯子口、镜头抬到台面上、动不了、步枪收起来、不能切枪；再按 E 或跳就下来，枪拿回来', () => {
  const w = gworld('A'), { rg, player, G, camera } = w;
  try {
    assert.equal(rg.tower, 'A'); assert.equal(rg.list.length, 1); assert.ok(rg.list[0].group.visible, '这一局那栋楼的阵地摆出来了');
    w.frame(); assert.equal(G.hud.prompt, null, '离得远没有提示');
    const e = rg.list[0], foot = e.geo.foot;
    player.pos.set(foot.x + 0.6, foot.y, foot.z + 0.6); w.frame();
    assert.match(G.hud.prompt, /双联重机枪/);
    w.press('interact');
    assert.equal(rg.active, true); assert.equal(rg.current, e); assert.equal(player.mounted, true); assert.equal(G.weaponHold, true, '不能切枪'); assert.equal(w.weapon.shown, false, '步枪收起来');
    assert.ok(player.pos.distanceTo(foot) < 1e-6, '脚在梯子口');
    w.run(0.6);
    assert.ok(camera.position.distanceTo(e.geo.seat) < 1e-6, '镜头在台面上');
    w.input.held.add('forward'); player.vel.set(3, 0, 0); w.frame(); assert.ok(player.pos.distanceTo(foot) < 1e-6 && player.vel.length() === 0, '动不了');
    assert.equal(w.input.promptOn, true, '手机上的交互键亮着（按它下来）');
    assert.ok(rg.matePost('zhe') && rg.matePost('lin') && !rg.matePost('xu'), '架着枪时两个队友有站的地方');
    w.press('interact'); assert.equal(rg.active, false); assert.equal(player.mounted, false); assert.equal(G.weaponHold, false); assert.equal(w.weapon.shown, true, '枪拿回来了');
    assert.equal(rg.matePost('zhe'), null, '下来了队友照常跟着');
    w.run(0.5); assert.ok(Math.abs(camera.position.y - (w.y + 1.62)) < 1e-6, '镜头落回人眼');
    w.press('interact'); w.run(0.6); assert.equal(rg.active, true); w.press('jump'); assert.equal(rg.active, false);
    w.siege.state.pin = {}; w.press('interact'); assert.equal(rg.active, false, '被按住时上不去'); w.siege.state.pin = null;
  } finally { w.dispose(); }
});

test('射界：公寓那座 360 度都转得过去（枪架跟着视线绕一整圈）；北区那座转到 ±90 度就停在边上；往下压得到梯子口', () => {
  const w = gworld('A'), { player, camera } = w;
  try {
    const e = w.up(), q = new THREE.Quaternion(), d = new THREE.Vector3();
    const turnTo = (want) => { for (let i = 0; i < 400; i++) { const dy = wrap(want - player.yaw); if (Math.abs(dy) < 1e-6) break; player.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 0.05); w.frame(); } w.run(0.1); };
    const y0 = player.yaw; player.yaw += Math.PI; w.frame();
    assert.ok(Math.abs(Math.abs(wrap(player.yaw - y0)) - ROOF_GUN.traverse / 30) < 1e-6, '一帧最多转 traverse × dt');
    for (let k = 0; k < 12; k++) {
      player.pitch = -0.3; turnTo((k / 12) * Math.PI * 2 - Math.PI);
      camera.getWorldDirection(d); const look = Math.atan2(d.x, d.z);
      e.ring.getWorldQuaternion(q); const fz = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      assert.ok(Math.abs(wrap(Math.atan2(fz.x, fz.z) - look)) < 0.02, `朝 ${(player.yaw * 57.3).toFixed(0)}°：枪架跟着转`);
      const n = w.shots.length; w.input.held.add('fire'); w.run(0.4); w.input.held.delete('fire'); w.run(0.3);
      assert.ok(w.shots.length > n, `朝 ${(player.yaw * 57.3).toFixed(0)}° 打得响`);
      assert.ok(w.shots.at(-1).d.dot(d) > 0.97, '子弹顺着视线出去');
    }
    const f = e.geo.foot, to = new THREE.Vector3(f.x, f.y + 1, f.z).sub(e.geo.seat).normalize();
    turnTo(Math.atan2(-to.x, -to.z)); player.pitch = Math.asin(to.y); w.run(0.1);
    const n = w.shots.length; w.input.held.add('fire'); w.run(0.3); w.input.held.delete('fire');
    assert.ok(w.shots.length > n && w.shots.at(-1).d.dot(to) > 0.97, `压得到梯子口（往下 ${(-Math.asin(to.y) * 57.3).toFixed(0)}°）`);
  } finally { w.dispose(); }
  const t = gworld('T1'), { rg: r2, player: p2 } = t;
  try {
    const e = t.up(), c = e.geo.center;
    for (let i = 0; i < 120; i++) { p2.yaw += 0.05; t.frame(); }
    assert.ok(Math.abs(wrap(p2.yaw - c) - Math.PI / 2) < 1e-6, `往一边转：停在射界边上（${(wrap(p2.yaw - c) * 57.3).toFixed(0)}°）`);
    for (let i = 0; i < 240; i++) { p2.yaw -= 0.05; t.frame(); }
    assert.ok(Math.abs(wrap(p2.yaw - c) + Math.PI / 2) < 1e-6, '往另一边转：停在另一个边上');
    assert.equal(r2.active, true);
  } finally { t.dispose(); }
});

test('双联重机枪：两根枪管轮流打，不耗子弹、会过热——连打 6 秒左右才锁死（以前三秒多），锁着不出弹，两秒不到凉下来；步枪的子弹一发没少', () => {
  const w = gworld('A'), { player, G } = w;
  try {
    const e = w.up(); player.pitch = -0.2; w.input.held.add('fire');
    let t = 0; while (!e.gun.overheated && t < 30) { w.frame(); t += 1 / 30; }
    assert.ok(e.gun.overheated, '会过热');
    assert.ok(t > 5.5 && t < 10, `连打 ${t.toFixed(1)} 秒过热`);
    const n0 = w.shots.length; assert.ok(n0 > 40, `过热之前打了 ${n0} 发`);
    assert.ok(Math.abs(n0 / t - TWIN_HMG.rate) < 1.2, `每秒 ${(n0 / t).toFixed(1)} 发`);
    w.run(1); assert.equal(w.shots.length, n0, '锁着不出弹');
    assert.ok(w.msgs.some((m) => /过热/.test(m)));
    w.input.held.delete('fire'); let c = 1; while (e.gun.overheated && c < 10) { w.frame(); c += 1 / 30; }
    assert.ok(!e.gun.overheated && c > 1.4 && c < 2.6, `锁了 ${c.toFixed(1)} 秒凉下来`);
    w.input.held.add('fire'); w.run(1); assert.ok(w.shots.length > n0 + 5, '冷下来又能打');
    assert.equal(G.rifle.ammo, 30); assert.equal(G.rifle.reserve, 90);
    assert.ok(w.shots.every((s) => s.damage === TWIN_HMG.damage), '一发的伤害');
    const from = []; G.fx.tracer = (a) => from.push(a.clone()); w.run(0.5);
    assert.ok(from.length >= 4 && from[0].distanceTo(from[1]) > 0.15 && from[0].distanceTo(from[2]) < 0.05 + from[0].distanceTo(from[1]) * 0.2, '两个枪口轮着出弹');
  } finally { w.dispose(); }
});

test('落点炸开：打中一只，旁边 1.3 米里的也掉血、被掀开（打出硬直、往外退），远一点的不受影响；打在屋面上也炸', () => {
  const w = gworld('A', { zombies: 12 }), { player, G } = w;
  try {
    const e = w.up(), g = e.geo, c = new THREE.Vector3(g.foot.x + Math.sin(g.yaw) * 6, w.y, g.foot.z + Math.cos(g.yaw) * 6);
    const hitZ = w.spawn(c.x, c.z), near = [[0.8, 0], [-0.6, 0.5], [0, -0.9]].map(([dx, dz]) => w.spawn(c.x + dx, c.z + dz)), far = w.spawn(c.x + 3.2, c.z + 0.4);
    for (const z of [hitZ, ...near, far]) { z.zs = 'idle'; z.hunt = false; }
    const hp0 = new Map([hitZ, ...near, far].map((z) => [z, z.hp]));
    let fired = 0;
    G.combat.playerShot = (o, d, opts) => { fired++; const point = new THREE.Vector3(hitZ.pos.x, w.y + 1.2, hitZ.pos.z); hitZ.damage(opts.damage, point, d, 'body'); return { point, dist: o.distanceTo(point), enemy: hitZ, surface: 'enemy', normal: d.clone().negate() }; };
    const to = new THREE.Vector3(c.x, w.y + 1.2, c.z).sub(g.seat).normalize(); player.yaw = Math.atan2(-to.x, -to.z); player.pitch = Math.asin(to.y); w.run(0.2);
    w.input.held.add('fire'); for (let i = 0; i < 20 && !fired; i++) w.frame(); w.input.held.delete('fire');
    assert.equal(fired, 1, '打了一发');
    assert.ok(!hitZ.alive || (hitZ.hp <= 60 - TWIN_HMG.damage + 1e-6 && hitZ.pushT > 0), '直接打中的那只掉一大截血、被打得往后退');
    for (const z of near) { assert.ok(z.hp < hp0.get(z) - 8, `旁边的掉了 ${(hp0.get(z) - z.hp).toFixed(0)} 血`); assert.ok(!z.alive || (z.pushT > 0 || z.stagger > 0.3), '被掀开'); }
    assert.equal(far.hp, hp0.get(far), '3 米外的不受影响');
    assert.ok(e.gun.stats.splashHits >= 3 && e.gun.stats.shoves >= 1, `炸到 ${e.gun.stats.splashHits} 只、掀开 ${e.gun.stats.shoves} 只`);
    const d0 = near.filter((z) => z.alive).map((z) => Math.hypot(z.pos.x - c.x, z.pos.z - c.z)); w.run(0.3);
    const d1 = near.filter((z) => z.alive).map((z) => Math.hypot(z.pos.x - c.x, z.pos.z - c.z));
    assert.ok(d1.every((v, i) => v > d0[i] + 0.2), `往外退了：${d0.map((v) => v.toFixed(2))} → ${d1.map((v) => v.toFixed(2))}`);
    const z2 = w.spawn(c.x - 2, c.z - 2); z2.zs = 'idle'; z2.hunt = false; const h2 = z2.hp; fired = 0;
    G.combat.playerShot = (o) => { fired++; const point = new THREE.Vector3(z2.pos.x + 0.5, w.y, z2.pos.z); return { point, dist: o.distanceTo(point), enemy: null, surface: 'concrete', normal: new THREE.Vector3(0, 1, 0) }; };
    w.input.held.add('fire'); for (let i = 0; i < 20 && !fired; i++) w.frame(); w.input.held.delete('fire');
    assert.ok(z2.hp < h2, '打在脚边的屋面上也炸着它');
  } finally { w.dispose(); }
});

test('铁丝网：踩进去的丧尸走得很慢、一点点掉血，出来恢复；巨尸慢得少一点', () => {
  const w = gworld('A', { zombies: 4 }), { rg } = w;
  try {
    const g = rg.list[0].geo, wl = g.wire[0], mid = [(wl.a[0] + wl.b[0]) / 2, (wl.a[1] + wl.b[1]) / 2];
    const z = w.spawn(mid[0], mid[1]); z.zs = 'idle'; z.hunt = false; const hp = z.hp;
    w.run(2);
    assert.equal(z.snare, ROOF_GUN.wire.slow, '踩在网里');
    assert.ok(z.hp < hp && z.hp > hp - ROOF_GUN.wire.dps * 2 - 1, `两秒掉了 ${hp - z.hp} 血`);
    z._deactivate(); w.run(0.1);
    const b = w.spawn(mid[0], mid[1], 'brute'); w.run(0.3); assert.equal(b.snare, ROOF_GUN.wire.brute, '巨尸'); b._deactivate();
    // 走路真的慢：追人的一只从网里走 2 秒，比网外走 2 秒少一大截
    const r1 = w.spawn(mid[0], mid[1]), a0 = r1.pos.clone(); w.run(2); const inWire = Math.hypot(r1.pos.x - a0.x, r1.pos.z - a0.z); r1._deactivate();
    const r2 = w.spawn(g.x + 9.5, g.z + 0.5), b0 = r2.pos.clone(); w.run(2); const out = Math.hypot(r2.pos.x - b0.x, r2.pos.z - b0.z);
    assert.ok(inWire < out * 0.6, `网里 2 秒走 ${inWire.toFixed(2)} 米，网外 ${out.toFixed(2)} 米`);
    assert.equal(r2.snare, 1, '网外照常');
  } finally { w.dispose(); }
});

test('丧尸还是够得着人：四面八方放一圈，架着枪不开火，它们绕着沙袋墙、从口子钻进来（或者蹚过铁丝网）走到梯子口；没有一只穿墙、没有卡死的；咬得到人', () => {
  for (const tower of ['A', 'T1']) {
    const w = gworld(tower, { zombies: 16 }), { rg, hurt } = w;
    try {
      const e = w.up(), g = e.geo, out = [];
      for (let k = 0; k < 48 && out.length < 12; k++) {
        const a = (k / 48) * Math.PI * 2, r = tower === 'A' ? 8 + (k % 3) * 2 : 5 + (k % 4) * 2.5, x = g.x + Math.sin(a) * r, z = g.z + Math.cos(a) * r, q = landAt(nav, x, z, w.y + 0.6);
        if (!q || q.floor !== w.T.roof || !clear(nav, q)) continue;
        const z0 = w.spawn(x, z, k % 4 === 0 ? 'runner' : 'walker'); if (z0) out.push(z0);
      }
      assert.ok(out.length >= (tower === 'A' ? 10 : 8), `${tower} 放了 ${out.length} 只`);
      let inside = 0;
      const reached = new Set();
      w.run(45, () => {
        for (const z of out) {
          if (!z.alive) continue;
          if (Math.hypot(z.pos.x - g.foot.x, z.pos.z - g.foot.z) < 2.4) reached.add(z);
          if (toBox(g.bb, z.pos.x, z.pos.z) < 0.05 || g.walls.some((wl) => toPoly(wl.poly, z.pos.x, z.pos.z) < 0.02)) inside++;
        }
      });
      assert.equal(inside, 0, `${tower} 没有一只穿进台子 / 沙袋墙里`);
      assert.ok(reached.size >= out.length - 1, `${tower} ${reached.size}/${out.length} 只走到了梯子口`);
      assert.ok(out.every((z) => (z.noPath || 0) < 3), `${tower} 寻路都找得到`);
      assert.ok(hurt.length > 0, `${tower} 扒在梯子口的咬得到你`);
      assert.equal(rg.active, true, `${tower} 行尸咬几下不会把人拽下来`);
    } finally { w.dispose(); }
  }
});

test('架着枪时咬人有上限：梯子口同时最多 2 只在咬，咬过一口的隔将近两秒才咬下一口；站着不打照样掉一大截血；没架着枪时不管（守屋顶另有一条，siege.js）', () => {
  const w = gworld('A', { zombies: 10 }), { rg, G } = w;
  try {
    const e = w.up(), f = e.geo.foot, list = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, x = f.x + Math.sin(a) * 1.0, z = f.z + Math.cos(a) * 1.0; if (!clear(nav, st(w.T, x, z))) continue; const q = w.spawn(x, z); if (q) list.push(q); }
    assert.ok(list.length >= 4, `贴着梯子口 ${list.length} 只`);
    let most = 0; const bites = new Map();
    G.events.on('enemy:melee', (ev) => { const l = bites.get(ev.enemy) || []; l.push(G.time.frame / 30); bites.set(ev.enemy, l); });
    w.run(12, () => { most = Math.max(most, list.filter((z) => z.alive && z.zs === 'attack' && Math.hypot(z.pos.x - f.x, z.pos.z - f.z) < ROOF_GUN.bite.reach).length); });
    assert.ok(most <= ROOF_GUN.bite.cap, `同时最多 ${most} 只在咬`);
    const n = [...bites.values()].reduce((s, l) => s + l.length, 0);
    assert.ok(n >= 6, `12 秒咬了 ${n} 口（还是有压力）`);
    const gaps = [...bites.values()].flatMap((l) => l.slice(1).map((t, i) => t - l[i]));
    assert.ok(gaps.every((d) => d > ROOF_GUN.bite.cool), `同一只两口之间最短 ${Math.min(...gaps).toFixed(2)} 秒`);
    assert.ok(n <= Math.ceil(12 / (ROOF_GUN.bite.cool + 0.6)) * ROOF_GUN.bite.cap + 2, `咬得不密：${n} 口（两个位置、一口顶着 cool 秒）`);
    assert.ok(100 - w.player.health >= 40, `站着挨咬 12 秒掉了 ${100 - w.player.health} 血（不理一边的要吃亏）`);
    w.press('jump'); assert.equal(rg.active, false);
    let after = 0; w.run(6, () => { after = Math.max(after, list.filter((z) => z.alive && z.zs === 'attack').length); });
    assert.ok(after > ROOF_GUN.bite.cap, `下来以后同时 ${after} 只在咬`);
  } finally { w.dispose(); }
});

test('自动下来：直升机落稳（开始登机）、坐上飞机、阵亡、读档重来（reset）、被巨尸拍 / 气浪掀、被扑袭者扑；落稳以后上不去', () => {
  const w = gworld('T1'), { rg, player, siege, director, G } = w;
  try {
    assert.equal(rg.list.length, 1); const e = rg.list[0];
    const up = () => w.up();
    up(); siege.state.landed = true; w.frame(); assert.equal(rg.active, false, '落稳就下来'); assert.equal(player.mounted, false);
    w.press('interact'); assert.equal(rg.active, false, '落稳以后上不去'); siege.state.landed = false;
    up(); director.riding = true; w.frame(); assert.equal(rg.active, false, '坐上飞机'); director.riding = false;
    up(); player.alive = false; G.events.emit('player:dead', {}); w.frame(); assert.equal(rg.active, false, '阵亡'); player.alive = true;
    up(); rg.reset(); assert.equal(rg.active, false, '读档 / 重来'); assert.equal(player.mounted, false); assert.equal(G.weaponHold, false); assert.equal(e.gun.heat, 0);
    up(); w.hurt.length = 0; G.events.emit('zombie:burst', {}); player.damage(30); player.damage(14);
    assert.deepEqual(w.hurt, [30 * ROOF_GUN.burst, 14], '炸开那一下打折，后面咬的照实');
    G.events.emit('zombie:knock', { power: 5, burst: true }); assert.equal(rg.active, false); w.hurt.length = 0; G.events.emit('zombie:burst', {}); player.damage(30); assert.deepEqual(w.hurt, [30], '不在台上照实算');
    w.run(1.6); up(); G.events.emit('zombie:knock', { power: 12 }); assert.equal(rg.active, false); assert.match(w.msgs.at(-1), /拍下来/);
    up(); G.events.emit('zombie:pin', { enemy: {} }); assert.equal(rg.active, false);
    up(); siege.demo.running = true; w.frame(); assert.equal(rg.active, false, '看炸楼'); assert.ok(!e.group.visible, '炸楼时阵地跟着没了'); siege.demo.running = false;
  } finally { w.dispose(); }
});

test('换楼 / 关掉丧尸围城：阵地跟着这一局那栋楼走，别的楼顶的台子、沙袋墙从导航、物理里撤掉，铁丝网不再拖慢丧尸，lowCover 不再挡', () => {
  const w = gworld('A', { zombies: 2 }), { rg, siege, G } = w, FA = nav.floors.get('A-RF'), FT = nav.floors.get('T1-RF');
  const nA = 1 + ROOF_GUN.sites.A[0].walls.length, nT = 1 + ROOF_GUN.sites.T1[0].walls.length, wA = FA.walls.length;
  try {
    assert.equal(FA.obstacles.filter((o) => o.roofGun).length, nA, '公寓：台子 + 每道沙袋墙'); assert.equal(G.physics.boxes.length, 1); assert.equal(G.physics.occluders.length, 1);
    assert.equal(rg.works.walls.length, nA - 1); assert.equal(rg.works.wire.length, ROOF_GUN.sites.A[0].wire.length);
    const g = rg.list[0].geo, z = w.spawn((g.wire[0].a[0] + g.wire[0].b[0]) / 2, (g.wire[0].a[1] + g.wire[0].b[1]) / 2); w.run(0.2); assert.ok(z.snare < 1);
    assert.ok(G.lowCover(new THREE.Vector3(g.x, w.y, g.z - 2.5), new THREE.Vector3(g.x, w.y, g.z - 7)), '阵地摆着时 lowCover 挡');
    siege.plan = { tower: TOWERS.T1 }; rg.reset();
    assert.equal(FA.obstacles.filter((o) => o.roofGun).length, 0, '公寓楼顶的撤了'); assert.equal(FT.obstacles.filter((o) => o.roofGun).length, nT);
    assert.equal(FA.walls.length, wA - nA * 4, '墙线也撤了');
    assert.equal(z.snare, 1, '铁丝网撤了，不再拖慢');
    assert.equal(G.physics.boxes.length, 1); assert.equal(rg.tower, 'T1');
    siege.enabled = false; rg.reset(); assert.equal(rg.tower, null); assert.equal(FT.obstacles.filter((o) => o.roofGun).length, 0); assert.equal(G.physics.boxes.length, 0);
    assert.equal(rg.works.walls.length, 0); assert.equal(rg.works.wire.length, 0); assert.equal(G.lowCover(new THREE.Vector3(g.x, w.y, g.z - 2.5), new THREE.Vector3(g.x, w.y, g.z - 7)), false);
    assert.deepEqual(rg.markers(), []);
  } finally { w.dispose(); }
  assert.equal(FA.obstacles.filter((o) => o.roofGun).length + FT.obstacles.filter((o) => o.roofGun).length, 0, '收干净了');
  assert.equal(ZOMBIE.pool, 64, '丧尸池子 64（清扫屋顶一拨 40 只）');
});
