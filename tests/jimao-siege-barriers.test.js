// 丧尸围城的卷帘做成真东西（src/jimao/siege-barriers.js、siege.js）：
// 开局那家店（影城）、这一局用到的店的墙和门脸，人、队友、丧尸（都走 nav.js 的 step）穿不过去，只有真开着的门洞过得去；
// 卷帘关着挡人、挡子弹，卷到顶才放开；按住撬的时候帘片跟着进度抬起来但还挡着；扶梯口的防火卷帘一样。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, clear, step } from '../src/layout/nav.js';
import { pointInPoly } from '../src/layout/geom.js';
import { storeStyle, doorGaps } from '../src/layout/frontage.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { stairRuns } from '../src/jimao/stairs.js';
import { createSiege, siegePlan as siegePlanFn, GATE_OPEN, GATE_DONE } from '../src/jimao/siege.js';
import { addZombies, ZOMBIE } from '../src/jimao/zombie.js';
import { BARRIER, barrierWall, barrierLook, mouthSegment, wallKey, releaseBarrierWalls } from '../src/jimao/siege-barriers.js';
import { FPS_MISSION } from '../src/fps/mission-layout.js';
import { cinemaPlan, CINEMA } from '../src/layout/cinema.js';
import { toW } from '../src/layout/geom.js';
import { findPath } from '../src/fps/pathfinding.js';

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' }), runs = stairRuns(nav);
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };
const lvOf = (id) => L.levels.find((l) => l.id === id);
const unitById = (id) => { for (const lv of L.levels) { const u = lv.units.find((q) => q.id === id); if (u) return { lv, u }; } return null; };

function world(seed) {
  const physics = createMapPhysics(nav), scene = new THREE.Scene(), handlers = {};
  const ctx = { rng: seq(11), list: [], retire(m) { m._deactivate(); const i = ctx.list.indexOf(m); if (i >= 0) ctx.list.splice(i, 1); }, releaseToken() {} };
  const enemies = { debug: { ctx }, list: ctx.list, spawn(type, pos, opts) { const z = ctx.pools[type].find((q) => !q.active); if (!z) return null; z._activate(pos, opts); ctx.list.push(z); return z; } };
  const s = FPS_MISSION.spawn, y = lvOf(s.floor).elev, msgs = [];
  const player = { pos: new THREE.Vector3(s.x, y, s.z), vel: new THREE.Vector3(), alive: true, health: 100, damage() {}, addShake() {} };
  const G = { scene, physics, player, enemies, time: { frame: 0 }, events: { emit(n, e) { for (const h of handlers[n] || []) h(e); }, on(n, h) { (handlers[n] ||= []).push(h); } }, fx: { smoke() {}, explosion() {} } };
  const zombies = addZombies(G, enemies, { count: ZOMBIE.pool });
  const heli = { root: new THREE.Group(), poses: [], setPose() {}, reset() {}, moveTo() {} };
  const director = { state: { mission: null, restore: false, checkpoint: null }, vehicles: { heli }, riding: false, openExtraction() {}, deadActions() {} };
  Object.assign(G, { game: { state: 'playing', run: { relays: [] }, refreshObjective() {} }, hud: { message: (t) => msgs.push(t), radio: (t) => msgs.push('R:' + t) }, rifle: { ammo: 30, reserve: 150 },
    weapon: { locked: [], melee: 'knife', select() {}, lock(l) { this.locked = l; }, unlock() { return true; }, setMelee(k) { this.melee = k; return true; }, grant() { return true; } } });
  physics.stateOf = (p) => landAt(nav, p.x, p.z, p.y + 0.6); physics.forget = () => {};
  const store = new Map([['jimao-siege', '1']]);
  const siege = createSiege(G, { layout: L, nav, scene, zombies, director, runs, rng: seq(seed), storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } });
  const m = siege.mission(seq(seed)); director.state.mission = m;
  m.objectives.forEach((o) => { o.object = o.model(); o.pos = new THREE.Vector3(o.site.x, o.site.y, o.site.z); });
  G.game.run.relays = m.objectives.map((o) => ({ o, cut: false, t: 0 }));
  siege.reset();
  const cut = (n) => { for (let i = 0; i < n; i++) G.game.run.relays.find((r) => !r.cut).cut = true; };
  const run = (secs) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { G.time.frame++; for (const z of zombies.pool) if (z.active) z._deactivate(); siege.update(1 / 30); } };
  return { G, siege, m, plan: m.plan, cut, run, msgs, physics };
}

/** 从 (x, z) 沿 (dx, dz) 一小步一小步走 dist 米（和人、队友、丧尸走路一样的 step）。返回最后站的地方 */
function walk(floor, x, z, dx, dz, dist = 2.6) {
  let s = landAt(nav, x, z, (nav.floors.get(floor)?.y ?? 0) + 0.6); if (!s || s.floor !== floor || !clear(nav, s)) return null;
  const n = Math.ceil(dist / 0.08), l = Math.hypot(dx, dz);
  for (let i = 0; i < n; i++) s = step(nav, s, (dx / l) * 0.08, (dz / l) * 0.08, 1 / 30);
  return s;
}
/** 一家店的每段墙都扫一遍：从店里离墙 1 米的地方往外走。返回走出去了的那些点（{ edge, x, z }：墙上的位置） */
function sweepShop(floor, poly) {
  const out = [], n = poly.length, cx = poly.reduce((a, p) => a + p[0], 0) / n, cz = poly.reduce((a, p) => a + p[1], 0) / n;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len; if ((cx - (a[0] + b[0]) / 2) * nx + (cz - (a[1] + b[1]) / 2) * nz < 0) { nx = -nx; nz = -nz; }
    for (let t = 0.35; t < len - 0.35; t += 0.25) {
      const px = a[0] + (b[0] - a[0]) * t / len, pz = a[1] + (b[1] - a[1]) * t / len, s = walk(floor, px + nx, pz + nz, -nx, -nz);
      if (s && (s.floor !== floor || s.slope || !pointInPoly([s.x, s.z], poly))) out.push({ edge: i, x: px, z: pz });
    }
  }
  return out;
}
/** 门脸上真开着的门洞（世界坐标的线段），量一点离它多远 */
function gapSegs(lv, u) {
  const out = [];
  for (const f of u.wfronts || []) {
    const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0), tx = (f.x1 - f.x0) / len, tz = (f.z1 - f.z0) / len;
    for (const [a, b] of doorGaps(storeStyle(lv, u), len)) out.push({ f, x0: f.x0 + tx * a, z0: f.z0 + tz * a, x1: f.x0 + tx * b, z1: f.z0 + tz * b });
  }
  return out;
}
const segD = (x, z, q) => { const dx = q.x1 - q.x0, dz = q.z1 - q.z0, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - q.x0) * dx + (z - q.z0) * dz) / l2)); return Math.hypot(x - q.x0 - dx * t, z - q.z0 - dz * t); };
const inGap = (p, gaps) => gaps.some((q) => segD(p.x, p.z, q) < 0.05);

test('卷帘墙：关着挡路、挡子弹；开着不挡；同一段墙按位置只登记一次；样子跟着开度走（灯：红 → 黄 → 绿）', () => {
  const lv = lvOf('P1-3F'), F = nav.floors.get(lv.id), physics = createMapPhysics(nav);
  // 找一块空地，横着摆一段 3 米的墙
  let at = null; for (let x = -175; x < -120 && !at; x += 1.5) for (let z = -130; z < -60 && !at; z += 1.5) { const ok = [-2, -1, 0, 1, 2].every((k) => { const q = landAt(nav, x + k, z, lv.elev + 0.6); return q && q.floor === lv.id && clear(nav, q) && [-1.5, 1.5].every((d) => { const r = landAt(nav, x + k, z + d, lv.elev + 0.6); return r && r.floor === lv.id && clear(nav, r); }); }); if (ok) at = { x, z }; }
  assert.ok(at, '三层找得到一块 5 × 3 米的空地');
  const seg = { x0: at.x - 1.5, z0: at.z, x1: at.x + 1.5, z1: at.z }, n0 = F.walls.length, g = barrierWall(nav, lv.id, seg);
  assert.equal(barrierWall(nav, lv.id, { ...seg }), g, '同一处不重复登记'); assert.equal(F.walls.length, n0 + 1); assert.equal(wallKey(lv.id, seg), g.id);
  const cross = () => { const s = walk(lv.id, at.x, at.z - 1, 0, 1, 2); return s.z > at.z; };
  const shoot = () => physics.raycast(new THREE.Vector3(at.x, lv.elev + 1.2, at.z - 1), new THREE.Vector3(0, 0, 1), 3)?.dist ?? Infinity;
  assert.equal(g.open, true, '登记了先是开着（不挡）'); assert.ok(cross()); assert.ok(shoot() > 1.5);
  g.open = false; assert.equal(cross(), false, '关着：走不过去'); assert.ok(shoot() < 1.05, '关着：子弹打在卷帘上');
  g.open = true; assert.ok(cross(), '开了：走得过去'); assert.ok(shoot() > 1.5);
  g.open = false; releaseBarrierWalls(nav); assert.equal(g.open, true, '换一局：全放开');
  // 样子
  assert.deepEqual(barrierLook(0, 3.2), { left: 3.2, bottom: 0, light: 'red' });
  const half = barrierLook(0.5, 3.2, true); assert.ok(Math.abs(half.left - 1.6) < 1e-9 && half.light === 'amber');
  assert.equal(barrierLook(1, 3.2).light, 'green'); assert.ok(barrierLook(1, 3.2).left > 0, '卷到顶还留一截在出帘口（不是凭空没了）');
  // 扶梯口：落在楼面上、梯口外面，横跨整个梯宽
  const sl = nav.slopes.find((q) => q.high === 'P1-3F' && q.low === 'P1-2F'), ms = mouthSegment(nav, sl, true);
  assert.equal(ms.floor, 'P1-3F'); assert.ok(Math.abs(Math.hypot(ms.x1 - ms.x0, ms.z1 - ms.z0) - 2 * (sl.hw + BARRIER.mouth.side)) < 1e-6);
});

test('影城的放映厅：厅墙不挡门脸、留出大堂；厅墙、座椅、卖品台进了导航（看到的墙就是挡人的墙），厅只从门洞进出；开局点、手摇柄、卷帘开关之间都走得通', () => {
  const lv = lvOf('P1-3F'), u = lv.units.find((q) => q.brand?.name === '云澜影城'), C = cinemaPlan(u), F = nav.floors.get(lv.id);
  assert.ok(C.halls.length >= 1 && C.walls.length >= 4 && C.rows.length > 4 && C.counter, '有厅、有墙、有座椅、有卖品台');
  // 厅墙离每一面门脸都至少一条大堂宽（以前厅墙就贴在门脸里面 0.4 米，门洞被墙堵着）
  const segD2 = (x, z, q) => { const dx = q.x1 - q.x0, dz = q.z1 - q.z0, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - q.x0) * dx + (z - q.z0) * dz) / l2)); return Math.hypot(x - q.x0 - dx * t, z - q.z0 - dz * t); };
  for (const w of C.walls) for (const f of u.fronts) for (const k of [0, 0.5, 1]) assert.ok(segD2(w.x0 + (w.x1 - w.x0) * k, w.z0 + (w.z1 - w.z0) * k, f) >= CINEMA.lobby - 0.05, '厅墙不贴门脸');
  // 导航里有这些墙：每段厅墙的中点两侧 0.2 米之间走不过去
  for (const w of C.walls) {
    const [ax, az] = toW(u.frame, w.x0, w.z0), [bx, bz] = toW(u.frame, w.x1, w.z1), mx = (ax + bx) / 2, mz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az); if (l < 1.2) continue;
    const nx = -(bz - az) / l, nz = (bx - ax) / l, s = walk(lv.id, mx + nx * 0.6, mz + nz * 0.6, -nx, -nz, 1.2);
    if (s) assert.ok((s.x - mx) * nx + (s.z - mz) * nz > 0, '厅墙挡人');
  }
  assert.ok(F.walls.some((w) => w.top > 0.6 && w.top < 3), '座椅是矮墙（站着能从上面开枪）');
  // 每个厅：从厅里走得到大堂（门洞真开着）
  const seq0 = (s) => { let v = s; return () => ((v = (v * 16807) % 2147483647) / 2147483647); };
  const plan = siegePlanOf(1), M = plan.mall, st = (q) => ({ floor: lv.id, x: q.x, z: q.z, y: lv.elev, slope: null });
  for (const h of C.halls) {
    const back = h.screen + h.sign * ((h.along === 'z' ? h.z1 - h.z0 : h.x1 - h.x0) - 0.8), mid = h.along === 'z' ? (h.x0 + h.x1) / 2 : (h.z0 + h.z1) / 2;
    const [x, z] = h.along === 'z' ? toW(u.frame, mid, back) : toW(u.frame, back, mid);
    assert.ok(findPath(nav, st({ x, z }), st(M.start)), '厅里走得到开局点（从门洞出来）');
  }
  void seq0;
  assert.ok(findPath(nav, st(M.start), st(plan.stages[0].site)) && findPath(nav, st(plan.stages[0].site), st(plan.stages[1].site)), '开局点 → 手摇柄 → 卷帘开关走得通');
});

function siegePlanOf(seed) { return siegePlanFn(seq(seed), L, nav, runs); }

for (const seed of [1, 2, 3, 4, 5]) {
  test(`第 ${seed} 局：影城和用到的店的墙穿不过去，只有开着的门洞过得去；卷帘卷到顶才让人过、关着挡子弹；按住撬时帘片跟着抬；扶梯口的防火卷帘一样`, () => {
    const { G, siege, plan, cut, run, msgs, physics } = world(seed), M = plan.mall, at = plan.stageOf, top = M.shop, F3 = 'P1-3F';
    const home = unitById(top.id), exitBar = siege.doors.get('exit');
    assert.ok(exitBar && exitBar.state === 'closed', '大门的卷帘落着');
    // 1. 开局：影城四面墙、三面门脸，一处都出不去
    const before = sweepShop(F3, top.poly);
    assert.deepEqual(before, [], `开局从影城走得出去：${JSON.stringify(before.slice(0, 3))}`);
    // 外面的往里走也进不去（丧尸、队友走路是同一套）
    const f0 = top.fronts[0], mx = (f0.x0 + f0.x1) / 2, mz = (f0.z0 + f0.z1) / 2;
    const outAt = [0.6, 0.8, 1.0, 1.3, 1.6].map((d) => ({ d, q: landAt(nav, mx + f0.nx * d, mz + f0.nz * d, 12.6) })).find((o) => o.q?.floor === F3 && clear(nav, o.q));
    assert.ok(outAt, '大门外站得住');
    const inn = walk(F3, outAt.q.x, outAt.q.z, -f0.nx, -f0.nz, outAt.d + 1.5); assert.ok(inn && !pointInPoly([inn.x, inn.z], top.poly), '门外的进不来');
    // 子弹：打在卷帘上
    const eye = new THREE.Vector3(mx - f0.nx * 1.5, exitBar.center.y - 0.4, mz - f0.nz * 1.5), dir = new THREE.Vector3(f0.nx, 0, f0.nz);
    assert.ok((physics.raycast(eye, dir, 6)?.dist ?? Infinity) < 1.55, '关着的卷帘挡子弹');
    // 2. 拿了手摇柄、按住摇：帘片跟着抬，可还挡着
    cut(1); run(0.1); assert.equal(siege.state.stage, at('exit'));
    G.game.run.relays[at('exit')].t = 0.6; run(1.2);
    assert.ok(exitBar.k > 0.35 && exitBar.k <= BARRIER.hold + 1e-6, `按住摇：帘片抬到 ${exitBar.k.toFixed(2)}`);
    assert.deepEqual(sweepShop(F3, top.poly), [], '摇到一半：还出不去');
    G.game.run.relays[at('exit')].t = 0; run(1.5); assert.ok(exitBar.k < 0.05, '松手：落回去');
    // 3. 摇开：卷到顶之前还挡着，到顶放开；开了屏幕上说一声
    cut(1); run(0.2); assert.equal(exitBar.state, 'opening'); assert.deepEqual(sweepShop(F3, top.poly), [], '卷到一半：还挡着');
    run(BARRIER.rise + 0.3); assert.equal(exitBar.state, 'open'); assert.ok(msgs.some((t) => /卷帘已打开/.test(t)));
    assert.ok((physics.raycast(eye, dir, 6)?.dist ?? Infinity) > 1.7, '开了：子弹打得出去');
    // 只有大门那一道门洞出得去，别的墙、别的门脸照旧挡着
    const gaps = gapSegs(home.lv, home.u), exitGaps = gaps.filter((q) => q.f === home.u.wfronts.find((f) => Math.abs(f.x0 - f0.x0) < 1e-6 && Math.abs(f.z0 - f0.z0) < 1e-6));
    const after = sweepShop(F3, top.poly);
    assert.ok(after.length > 0, '大门开了：出得去');
    assert.ok(after.every((p) => inGap(p, exitGaps)), `只从大门的门洞出去：${JSON.stringify(after.filter((p) => !inGap(p, exitGaps)).slice(0, 3))}`);
    // 4. 这一局用到的别的店：墙穿不过去，只有门洞（救人那家撬开之前连门洞也不行）
    for (const id of M.shops) {
      if (id === top.id) continue;
      const q = unitById(id), poly = q.u.polys?.[0]; if (!poly) continue;
      const out = sweepShop(q.lv.id, poly), g = gapSegs(q.lv, q.u);
      if (id === M.rescue?.unit) { assert.deepEqual(out, [], `救人那家（${q.u.brand.name}）撬开之前出不来`); continue; }
      assert.ok(out.every((p) => inGap(p, g)), `${q.u.brand.name}：从墙上出去了 ${JSON.stringify(out.filter((p) => !inGap(p, g)).slice(0, 3))}`);
    }
    // 5. 扶梯口的防火卷帘：撬开之前上不去扶梯；撬开、卷到顶以后下得去
    const sl = nav.slopes.find((q) => q.id === M.down3), bars = siege.doors.list.filter((b) => b.id.startsWith('pry:'));
    assert.ok(sl && bars.length >= 1 && bars.every((b) => b.state === 'closed' && b.kind === 'fire'));
    const onto = () => { const s = walk(F3, ...((p) => [p.x, p.z])(plan.stages[at('pry')].site), ...dirTo(sl), 3.5); return !!s?.slope || s?.floor === 'P1-2F'; };
    assert.equal(onto(), false, '防火卷帘落着：上不了扶梯');
    cut(at('pry') + 1 - siege.state.stage); run(0.2); assert.equal(onto(), false, '卷到一半还挡着');
    run(BARRIER.rise + 0.3); assert.ok(bars.every((b) => b.state === 'open')); assert.equal(onto(), true, '卷到顶：下得去');
  });
}
/** 从扶梯口的交互点朝坡道顶端走的方向 */
function dirTo(sl) { return [-sl.F.c, -sl.F.s]; }

// 楼里那几道关（杂物、着火、电动栅门、反锁的防火门）：以前是摆在楼梯上的模型，人踏上楼梯被拽回来，队友、丧尸照走、子弹照穿。
// 现在梯段上登记一处停点：关着谁都过不去（从楼上往下也一样），杂物、栅门、防火门挡子弹；被堵的每个楼梯间都摆着那一件；动画走完才放开
for (const seed of [1, 2, 3]) {
  test(`第 ${seed} 局：楼里的关卡真挡着——两个楼梯间都堵着、上下都过不去、挡子弹；解开的动画走完才过得去，过得去时屏幕上说一声`, () => {
    const { siege, plan, cut, run, msgs, physics } = world(seed);
    const climb = (r, from = 'a') => {
      const up = from === 'a', p = up ? r.a : r.b, d = up ? r.da : { x: -r.db.x, z: -r.db.z };
      let s = { floor: up ? r.from : r.to, x: p.x, z: p.z, y: nav.floors.get(up ? r.from : r.to).y, slope: null };
      for (let i = 0; i < 60; i++) s = step(nav, s, d.x * 0.08, d.z * 0.08, 1 / 30);
      return s;
    };
    const through = (s, r) => !s.slope ? s.floor !== r.from : false; // 走过了停点：上到了休息平台
    for (const g of plan.gates) {
      assert.equal(g.bars.length, g.runs.length, `${g.floor}：被堵的每段楼梯都摆着东西`);
      assert.ok(g.bars.every((b) => b.gate && b.gate.open === false), '停点登记了、关着');
      const need = g.stage - siege.state.stage; if (need > 0) { cut(need); run(0.5 + need / 15); }
      assert.equal(siege.state.stage, g.stage);
      for (const id of g.runs) {
        const r = runs.find((q) => q.id === id), s = climb(r);
        assert.equal(through(s, r), false, `${g.type} · ${id}：关着上不去`);
        if (g.type !== 'fire') { const eye = new THREE.Vector3(r.a.x, nav.floors.get(r.from).y + 1.3, r.a.z), hit = physics.raycast(eye, new THREE.Vector3(r.da.x, 0.35, r.da.z).normalize(), 4); assert.ok(hit && hit.dist < 2.2, `${g.type}：关着挡子弹`); }
      }
      // 从楼上往下走：也过不去（丧尸、队友走路是同一套）
      const r0 = runs.find((q) => q.id === g.core), sl = nav.slopeById.get(g.bars[0].slope), stop = sl.stops.find((q) => q.gate === g.bars[0].gate);
      let s = { floor: r0.from, x: 0, z: 0, y: 0, slope: { id: sl.id, u: Math.min(sl.len, stop.u + 0.9), v: 0 } };
      for (let i = 0; i < 40; i++) s = step(nav, s, -sl.F.c * 0.08, -sl.F.s * 0.08, 1 / 30);
      assert.ok(s.slope && s.slope.u > stop.u, '从上面往下也过不去');
      cut(1); run(0.2);
      for (const id of g.runs) assert.equal(through(climb(runs.find((q) => q.id === id)), runs.find((q) => q.id === id)), false, `${g.type}：动画还没走完，照样挡着`);
      run(GATE_OPEN[g.type] + 0.3);
      for (const id of g.runs) { const r = runs.find((q) => q.id === id); assert.ok(through(climb(r), r), `${g.type} · ${id}：解开了，上得去`); }
      assert.ok(msgs.includes('R:' + GATE_DONE[g.type]), `解开了屏幕上说「${GATE_DONE[g.type]}」`);
    }
  });
}

// 联机：卷帘开没开跟着主机的步数走（客户端 siege.follow，步数照主机的 relays），按住摇的进度跟着主机的快照（followOut → followState 的 hk）。
// 两边各有一份卷帘（各自的模型、开度、灯）；导航网格是同一张，所以这里只看客户端自己那份卷帘的开度和状态
test('联机：主机按住摇，客户端的帘片跟着抬；主机摇开了，客户端的卷帘也卷上去、到顶才算开，屏幕上说「卷帘已打开」', () => {
  const host = world(2), cl = world(2), at = host.plan.stageOf;
  cl.siege.follow = true;
  const sync = () => { cl.G.game.run.relays.forEach((r, i) => { r.cut = host.G.game.run.relays[i].cut; }); cl.siege.followState(host.siege.followOut()); };
  const both = (secs) => { for (let t = 0; t < secs - 1e-9; t += 0.1) { host.run(0.1); sync(); cl.run(0.1); } };
  const hb = host.siege.doors.get('exit'), cb = cl.siege.doors.get('exit');
  assert.ok(cb && cb.state === 'closed' && cb !== hb, '客户端自己有一道大门卷帘，落着');
  host.cut(1); both(0.3); assert.equal(cl.siege.state.stage, at('exit'), '客户端跟到「摇卷帘」这一步');
  host.G.game.run.relays[at('exit')].t = 0.6; both(1.2);
  assert.ok(cb.k > 0.35 && cb.state === 'closed', `主机按住摇：客户端的帘片抬到 ${cb.k.toFixed(2)}、还算关着`);
  host.G.game.run.relays[at('exit')].t = 0; host.cut(1); both(0.3);
  assert.equal(cb.state, 'opening', '主机摇开：客户端的卷帘往上卷');
  both(BARRIER.rise + 0.4);
  assert.equal(cb.state, 'open'); assert.ok(cl.msgs.some((t) => /卷帘已打开/.test(t)), '客户端屏幕上也说「卷帘已打开」');
});
