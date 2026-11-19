// 导航的三处加速（nav.js）都不许改变结果：
// ① supported() 按 0.5 米格子缓存「这一格整格在楼板上 / 整格不在」，有多边形边经过的格子逐点算；
// ② 逐点算时按 z 把多边形的边分桶，只看同一档的边；
// ③ 墙的查询多了一层 2 米的细格，只返回查询范围附近的墙，顺序和原来一样（墙的编号从小到大）。
// ④ landAt（正下方最高的能站的楼面）按高度排好、带包围盒，不再把上千个楼面全过一遍；
// ⑤ 零点突围的射线（子弹、视线）只查经过的格子里的墙、射线高度范围里的楼板。
// 这里拿园区地图（零点突围用的那张）的几层楼面随机取点，和不加速的算法逐一对照。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayableLayout } from '../src/layout/playable.js';
import * as THREE from 'three';
import { buildNav, supported, supportedExact, clear, step, landAt, landAtExact, NAV, __wallQueries } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';

const L = buildPlayableLayout({ mode: 'arcade' });
const nav = buildNav(L);
const FLOORS = ['P1-1F', 'P1-3F', 'P1-B1M', 'P1-RF', 'H-2F', 'A-B1', 'ground'];
function seq(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function bounds(F) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of F.pieces) { x0 = Math.min(x0, p.bb.x0); x1 = Math.max(x1, p.bb.x1); z0 = Math.min(z0, p.bb.z0); z1 = Math.max(z1, p.bb.z1); }
  return { x0: Math.max(x0, -420), x1: Math.min(x1, 320), z0: Math.max(z0, -420), z1: Math.min(z1, 320) };
}

test('supported()：格子缓存 + 分桶的结果和逐点精确判断完全一样（每层 6000 个随机点，含贴着楼板边、洞口边的点）', () => {
  for (const id of FLOORS) {
    const F = nav.floors.get(id), b = bounds(F), rnd = seq(id.length * 7919 + 13);
    let inside = 0, bad = 0;
    const check = (x, z) => { const a = supported(F, x, z), e = supportedExact(F, x, z); if (a !== e) bad++; if (e) inside++; };
    for (let i = 0; i < 4000; i++) check(b.x0 + rnd() * (b.x1 - b.x0), b.z0 + rnd() * (b.z1 - b.z0));
    // 贴着多边形边的点：每条边上取点再往两侧偏 1 厘米、30 厘米
    const polys = [...F.zones, ...F.pieces.flatMap((p) => [p.outer, ...p.holes.map((h) => h.poly)])];
    for (let i = 0; i < 2000; i++) {
      const poly = polys[Math.floor(rnd() * polys.length)], k = Math.floor(rnd() * poly.length), a = poly[k], c = poly[(k + 1) % poly.length], t = rnd();
      const d = [0.01, -0.01, 0.3, -0.3][i % 4], len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      check(a[0] + (c[0] - a[0]) * t - (c[1] - a[1]) / len * d, a[1] + (c[1] - a[1]) * t + (c[0] - a[0]) / len * d);
    }
    assert.equal(bad, 0, `${id}：有 ${bad} 个点缓存的结果和精确判断不一样`);
    assert.ok(inside > 300, `${id}：随机点里在楼板上的太少（${inside}），没测到东西`);
    // 同一个点再问一次（这回走缓存）还是一样
    const rnd2 = seq(id.length * 7919 + 13);
    for (let i = 0; i < 500; i++) { const x = b.x0 + rnd2() * (b.x1 - b.x0), z = b.z0 + rnd2() * (b.z1 - b.z0); assert.equal(supported(F, x, z), supportedExact(F, x, z)); }
  }
});

test('墙的查询：细格返回的是粗格的子集、编号从小到大，会碰到的墙（离点不到半径、或和这一步相交）一条不少', () => {
  const segDist = (px, pz, w) => { const dx = w.x1 - w.x0, dz = w.z1 - w.z0, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - w.x0) * dx + (pz - w.z0) * dz) / l2)); return Math.hypot(px - w.x0 - dx * t, pz - w.z0 - dz * t); };
  const cross = (x0, z0, x1, z1, w) => { const ex = w.x1 - w.x0, ez = w.z1 - w.z0, mx = x1 - x0, mz = z1 - z0, den = mx * ez - mz * ex; if (Math.abs(den) < 1e-12) return false;
    const t = ((w.x0 - x0) * ez - (w.z0 - z0) * ex) / den, s = ((w.x0 - x0) * mz - (w.z0 - z0) * mx) / den; return t >= 0 && t <= 1 && s >= 0 && s <= 1; };
  for (const id of FLOORS) {
    const F = nav.floors.get(id), b = bounds(F), rnd = seq(id.length * 104729 + 7), index = new Map(F.walls.map((w, i) => [w, i]));
    let near = 0;
    for (let i = 0; i < 3000; i++) {
      const x0 = b.x0 + rnd() * (b.x1 - b.x0), z0 = b.z0 + rnd() * (b.z1 - b.z0), len = i % 3 ? rnd() * 0.3 : rnd() * 1.4, a = rnd() * 6.2832;
      const x1 = i % 5 ? x0 + Math.cos(a) * len : x0, z1 = i % 5 ? z0 + Math.sin(a) * len : z0;
      const fine = __wallQueries.fine(F, x0, z0, x1, z1), coarse = __wallQueries.coarse(F, x0, z0, x1, z1), set = new Set(fine);
      for (const w of fine) assert.ok(coarse.includes(w), `${id}：细格多返回了一段墙`);
      const order = fine.map((w) => index.get(w));
      // 查询落在同一个粗格里时细格才生效：这时编号必须从小到大（和粗格单格的顺序一样）
      const c = NAV.cell, pad = NAV.r + 0.05, single = Math.floor((Math.min(x0, x1) - pad) / c) === Math.floor((Math.max(x0, x1) + pad) / c) && Math.floor((Math.min(z0, z1) - pad) / c) === Math.floor((Math.max(z0, z1) + pad) / c);
      if (single) for (let k = 1; k < order.length; k++) assert.ok(order[k] > order[k - 1], `${id}：细格返回的墙没按编号排`);
      for (const w of coarse) if (segDist(x0, z0, w) < NAV.r || segDist(x1, z1, w) < NAV.r || cross(x0, z0, x1, z1, w)) { near++; assert.ok(set.has(w), `${id}：会碰到的墙没在细格结果里`); }
    }
    if (F.walls.length > 100) assert.ok(near > 20, `${id}：随机查询几乎没碰到墙（${near}），没测到东西`);
  }
});

test('走路：在一期 1F 朝随机方向走 4000 步，每一步都还站得住；撞墙会停、不穿墙', () => {
  const rnd = seq(4207);
  let s = { floor: 'P1-1F', x: -135, z: -98, y: 0, slope: null }, moved = 0, a = 0;
  for (let i = 0; i < 4000; i++) {
    if (i % 40 === 0) a = rnd() * 6.2832;
    const n = step(nav, s, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 1 / 30);
    assert.ok(clear(nav, n), `第 ${i} 步走到了站不住的地方 (${n.x.toFixed(2)}, ${n.z.toFixed(2)}) ${n.floor}`);
    moved += Math.hypot(n.x - s.x, n.z - s.z); s = n;
  }
  assert.ok(moved > 200, `只走了 ${moved.toFixed(0)} 米`);
});

test('landAt：按高度排序 + 包围盒的结果和把所有楼面过一遍完全一样（6000 个点 × 8 种高度上限）', () => {
  const rnd = seq(11); let landed = 0, onStair = 0;
  for (let i = 0; i < 6000; i++) {
    const x = -300 + rnd() * 400, z = -300 + rnd() * 300, yMax = [-12, -4, 0.6, 7, 13, 30, 60, 1e4][i % 8];
    const a = landAt(nav, x, z, yMax), b = landAtExact(nav, x, z, yMax);
    assert.deepEqual(a, b, `(${x.toFixed(2)}, ${z.toFixed(2)}) yMax ${yMax}`);
    if (b) landed++; if (b?.slope) onStair++;
  }
  assert.ok(landed > 3000, `落到楼面上的点只有 ${landed} 个`);
  // 楼梯上的点单独测：每部楼梯中线上取三个点
  const stairs = nav.slopes.filter((sl) => ['interior-stair', 'exterior-stair', 'protected-stair'].includes(sl.kind)).slice(0, 300);
  for (const sl of stairs) for (const k of [0.25, 0.5, 0.75]) {
    const u = sl.len * k, x = sl.F.ox + sl.F.c * u, z = sl.F.oz + sl.F.s * u;
    if (!Number.isFinite(x)) continue;
    assert.deepEqual(landAt(nav, x, z, 1e4), landAtExact(nav, x, z, 1e4));
    if (landAtExact(nav, x, z, 1e4)?.slope) onStair++;
  }
  assert.ok(stairs.length > 50);
});

test('零点突围的射线：只查经过的格子和高度范围，命中距离和全部过一遍的一模一样（3000 条）', () => {
  const P = createMapPhysics(nav), rnd = seq(7); let hits = 0, slabs = 0;
  for (let i = 0; i < 3000; i++) {
    const a = rnd() * 6.2832, floor = [['P1-1F', -135, -98], ['H-2F', -245, -81], ['P1-RF', -160, -120], ['P1-B1M', -151, -94]][i % 4];
    const o = new THREE.Vector3(floor[1] + (rnd() - 0.5) * 60, nav.floors.get(floor[0]).y + 1.5, floor[2] + (rnd() - 0.5) * 60);
    const d = new THREE.Vector3(Math.cos(a), (rnd() - 0.5) * (i % 5 ? 0.3 : 2), Math.sin(a)), max = i % 3 ? 60 : 500;
    P.bruteRays = true; const want = P.raycast(o, d, max);
    P.bruteRays = false; const got = P.raycast(o, d, max);
    assert.equal(!!got, !!want, `第 ${i} 条：一个打中一个没打中`);
    if (want) { assert.ok(Math.abs(got.dist - want.dist) < 1e-9, `第 ${i} 条：距离 ${got.dist} ≠ ${want.dist}`); hits++; if (Math.abs(want.normal.y) > 0.5) slabs++; }
  }
  assert.ok(hits > 2000 && slabs > 100, `打中 ${hits} 条，其中楼板 ${slabs} 条`);
});
