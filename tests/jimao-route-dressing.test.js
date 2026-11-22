// 丧尸围城的沿途痕迹（src/jimao/route-dressing.js）：图集格子、种子、贴花矩阵、落点（在楼面上、墙边、不压关卡大件）、没有 document 时不建东西。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, supported } from '../src/layout/nav.js';
import { pointInPoly } from '../src/layout/geom.js';
import { findPath } from '../src/fps/pathfinding.js';
import { stairRuns } from '../src/jimao/stairs.js';
import { siegePlan, TOWERS } from '../src/jimao/siege.js';
import { MEMORY_PROFILES } from '../src/render/device.js';
import {
  ROUTE_DRESS, ATLAS_CELLS, GRAFFITI, cellUv, cellAspect, atlasSize, densityFor, hashString, mulberry32, dressSeed,
  floorAxes, wallAxes, itemMatrix, resampleLine, routeLegs, planDressing, paintAtlas, createRouteDressing, coreOf, routeFlights,
} from '../src/jimao/route-dressing.js';

test('图集格子：都在 16 × 16 以内、互不重叠、每格都画得出来（涂鸦有字）', () => {
  const N = ROUTE_DRESS.grid, used = new Set();
  for (const [name, [x, y, w, h]] of Object.entries(ATLAS_CELLS)) {
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= N && y + h <= N, `${name} 出界`);
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) { const k = `${i},${j}`; assert.ok(!used.has(k), `${name} 和别的格子重叠在 ${k}`); used.add(k); }
    const uv = cellUv(name);
    assert.equal(uv.length, 4); assert.ok(uv[0] >= 0 && uv[1] >= 0 && uv[0] + uv[2] <= 1 + 1e-9 && uv[1] + uv[3] <= 1 + 1e-9);
  }
  for (const [name, g] of Object.entries(GRAFFITI)) { assert.ok(ATLAS_CELLS[name], `涂鸦 ${name} 有格子`); assert.ok(g.text.length > 0); }
  assert.equal(cellAspect('drag'), 1 / 3); assert.equal(cellAspect('pool0'), 1); assert.equal(cellUv('nope'), null);
  // UV 的 v 从图集下沿算（纹理 flipY）：最上面一行的格子 v 最大
  assert.ok(cellUv('pool0')[1] > cellUv('handL')[1]);
});

test('图集尺寸：电脑 1024，手机各档 512（不超过 1024）；省内存档少放一些', () => {
  assert.equal(atlasSize(MEMORY_PROFILES.full), 1024);
  for (const k of ['compact', 'standard', 'rich']) assert.equal(atlasSize(MEMORY_PROFILES[k]), 512);
  assert.ok(densityFor(MEMORY_PROFILES.compact) < 1); assert.equal(densityFor(MEMORY_PROFILES.full), 1);
});

test('随机数：同一个种子同样的序列；种子跟着计划走', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  assert.deepEqual(sa, sb); assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
  assert.equal(hashString('abc'), hashString('abc')); assert.notEqual(hashString('abc'), hashString('abd'));
  const plan = { tower: { id: 'A' }, stages: [{ id: 'arms', floor: 'P1-1F', site: { x: 1, z: 2 } }] };
  assert.equal(dressSeed(plan), dressSeed(structuredClone(plan)));
  assert.notEqual(dressSeed(plan), dressSeed({ ...plan, tower: { id: 'T1' } }));
});

test('贴花的轴：地面朝上、墙面朝法线，右 × 上 = 法线（正面朝外，不用双面）；矩阵按宽高缩放', () => {
  const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  for (const a of [0, 0.7, 2, -2.5]) { const f = floorAxes(a); assert.ok(near(crossV(f.r, f.u), f.n)); assert.deepEqual(f.n, [0, 1, 0]); assert.ok(near(f.u, [Math.sin(a), 0, Math.cos(a)])); }
  for (const [nx, nz, phi] of [[1, 0, 0], [0, -1, 0.3], [0.6, 0.8, -1]]) { const w = wallAxes(nx, nz, phi); assert.ok(near(crossV(w.r, w.u), w.n), `${nx},${nz}`); }
  assert.ok(near(wallAxes(1, 0).u, [0, 1, 0]));
  const m = itemMatrix({ ...floorAxes(0), p: [1, 2, 3], w: 2, h: 0.5 });
  assert.deepEqual([...m.slice(12, 15)], [1, 2, 3]);
  assert.ok(Math.abs(Math.hypot(m[0], m[1], m[2]) - 2) < 1e-6 && Math.abs(Math.hypot(m[4], m[5], m[6]) - 0.5) < 1e-6);
});

test('路线重新取样：等间距、带方向', () => {
  const pts = resampleLine([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }], 1);
  assert.ok(pts.length >= 6 && pts.length <= 8);
  assert.ok(Math.abs(pts[1].x - pts[0].x - 1) < 1e-9);
  assert.ok(Math.abs(pts[0].a - Math.PI / 2) < 1e-9);
  assert.deepEqual(resampleLine([], 1), []); assert.deepEqual(resampleLine(null), []);
});

test('没有 document（node）：不建东西，update / dispose 都不出错', () => {
  const scene = { add() { throw new Error('不该往场景里加东西'); } };
  const d = createRouteDressing({ siege: { enabled: true, plan: {} } }, { scene, nav: null, layout: null, doc: null });
  assert.doesNotThrow(() => { d.update(0.016); d.update(0.016); d.dispose(); });
  assert.equal(d.mesh, null); assert.equal(d.ready, false);
  // 画图集要画布：拿一个什么都不做的假上下文也能一格一格走完，不碰 document
  const calls = new Proxy({}, { get: (t, k) => (k === 'canvas' ? null : k === 'measureText' ? () => ({ width: 10 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  const names = [...paintAtlas(calls, 256, 1)].filter(Boolean);
  assert.equal(names.length, Object.keys(ATLAS_CELLS).length);
});

// ---- 真地图上的落点（建一次地图要二十来秒） ----
const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' }), runs = stairRuns(nav);
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };
const FLIGHTS = L.buildings.flatMap((b) => b.access?.flights || []).filter((f) => f.steps);
/** 点在某段梯段的某一级踏步面上（踏步面高 = 起点 + 级高 × 第几级） */
function onTread([x, y, z]) {
  return FLIGHTS.some((f) => {
    const dx = f.top.x - f.bottom.x, dz = f.top.z - f.bottom.z, L2 = Math.hypot(dx, dz), u = ((x - f.bottom.x) * dx + (z - f.bottom.z) * dz) / L2, v = Math.abs((x - f.bottom.x) * dz - (z - f.bottom.z) * dx) / L2;
    if (u < 0 || u > L2 || v > f.width / 2) return false;
    const i = Math.min(f.steps - 1, Math.floor((u / L2) * f.steps)), top = f.bottom.y + (f.top.y - f.bottom.y) * (i + 1) / f.steps;
    return Math.abs(top + ROUTE_DRESS.treadLift - y) < 0.01;
  });
}
function dress(tower, seed, density = 1) {
  const plan = siegePlan(seq(seed), L, nav, runs, TOWERS[tower]);
  const legs = {}; for (const l of routeLegs(plan, nav, L)) legs[l.key] = findPath(nav, l.from, l.to) || [];
  const gen = planDressing({ plan, nav, layout: L, runs, rng: mulberry32(dressSeed(plan)), legs, density });
  let r, steps = 0; do { r = gen.next(); steps++; } while (!r.done);
  return { plan, items: r.value, steps };
}

test('两栋楼：每一步周围都有痕迹，三道关那几层最多；分很多小步算完；同一局结果一样', () => {
  for (const T of ['T1', 'A']) for (const seed of [7, 99]) {
    const { plan, items, steps } = dress(T, seed);
    assert.ok(items.length > 120 && items.length <= ROUTE_DRESS.maxItems, `${T}/${seed} 一共 ${items.length} 个`);
    assert.ok(steps > 12, '切成了小步');
    const lv = new Map(); for (const it of items) lv.set(it.lv, (lv.get(it.lv) || 0) + 1);
    for (const st of plan.stages) assert.ok(lv.get(st.floor) > 0 || lv.get(nav.floors.get(st.floor)?.parentFloor) > 0, `${T} ${st.id}（${st.floor}）有痕迹`);
    for (const g of plan.gates) assert.ok(lv.get(g.floor) >= 20, `${T} ${g.floor} 有 ${lv.get(g.floor)} 个`);
    const cells = new Set(items.map((it) => it.cell));
    for (const c of ['drops', 'footL', 'footR', 'drag', 'tape', 'gInfected', 'gPower', 'gRoof', 'gSos']) assert.ok(cells.has(c), `${T}/${seed} 有 ${c}`);
    for (const it of items) {
      assert.ok(ATLAS_CELLS[it.cell], it.cell);
      assert.ok([it.p, it.r, it.u, it.n].every((v) => v.length === 3 && v.every(Number.isFinite)) && it.w > 0 && it.h > 0, `${it.cell} 数值正常`);
      assert.ok(it.alpha > 0 && it.alpha <= 1);
    }
    const again = dress(T, seed).items;
    assert.equal(again.length, items.length); assert.deepEqual(again.slice(0, 20).map((i) => i.p), items.slice(0, 20).map((i) => i.p));
  }
});

test('落点：地面贴花平放在楼面上（不浮、不在洞口）、不压关卡大件；墙面贴花竖直、贴在墙线外一点、不上天花板', () => {
  for (const T of ['T1', 'A']) {
    const { plan, items } = dress(T, 21);
    for (const it of items) {
      if (it.n[1] > 0.99) { // 地面
        const st = landAt(nav, it.p[0], it.p[2], it.p[1] + 0.3);
        // 踏步上的血滴：导航里梯段是一道斜坡，踏步面比斜坡高出不到一级
        if (it.cell === 'drops' && onTread(it.p)) continue;
        assert.ok(st && it.p[1] - st.y > 0.02 && it.p[1] - st.y < 0.065, `${it.cell} @ ${it.p.map((v) => v.toFixed(2))} 在楼面上（面层之上一点）`);
        for (const g of plan.gates) if (Math.abs(g.model.y - st.y) < 0.5 && it.cell !== 'drops') assert.ok(Math.hypot(g.model.x - it.p[0], g.model.z - it.p[2]) > 1.0, `${it.cell} 没压在 ${g.type} 上`);
      } else if (Math.abs(it.n[1]) < 1e-6) { // 墙面
        if (it.cell === 'tape') continue;
        // 贴在关卡大件（反锁的防火门门扇）上的：门开了就不画；贴在门扇那一面上（离大件不到一米）
        if (it.until >= 0) { const g = plan.gates.find((q) => q.stage === it.until); assert.ok(g && Math.hypot(g.model.x - it.p[0], g.model.z - it.p[2]) < 1, `${it.cell} 在门扇上`); continue; }
        // 贴花前面那块楼面：贴花中心以下最近的一层（户内的东西贴得低，不能按 1.5 米高去猜）
        const F = [...nav.floors.values()].filter((f) => f.y <= it.p[1] && it.p[1] - f.y < 2.6 && supported(f, it.p[0] + it.n[0] * 0.3, it.p[2] + it.n[2] * 0.3)).sort((a, b) => b.y - a.y)[0];
        // 梯段边上的墙：前面是梯段（导航里的斜坡），不是楼面
        // 楼梯连接（一按就上下楼）的梯段不在导航里：落在楼梯间框里也算
        if (!F) {
          const fx = it.p[0] + it.n[0] * 0.45, fz = it.p[2] + it.n[2] * 0.45, st = landAt(nav, fx, fz, it.p[1] + 1);
          const inCore = L.stairs.some((s) => s.poly?.length && pointInPoly([fx, fz], s.poly));
          assert.ok(inCore || (st && st.slope && it.p[1] - st.y < 2.4 && it.p[1] - st.y > -1.6), `${it.cell} 前面是能走的楼面或梯段`); continue;
        }
        const top = it.p[1] + Math.abs(it.u[1]) * it.h / 2 - F.y;
        assert.ok(top < 2.45, `${it.cell} 上沿 ${top.toFixed(2)} 米没碰天花板`);
        assert.ok(it.p[1] - F.y - it.h / 2 > 0.05 || it.cell === 'scorch', `${it.cell} 下沿在地面以上`);
      } else assert.fail(`${it.cell} 方向不对`);
    }
  }
});

test('省内存档：同一局放得更少', () => {
  const full = dress('A', 7, 1).items.length, lite = dress('A', 7, densityFor(MEMORY_PROFILES.compact)).items.length;
  assert.ok(lite < full, `${lite} < ${full}`);
});

test('楼梯：关卡上下那两段多滴血，关卡之间、最后一道关到屋顶一路往上的梯段也有零星几滴（同一个楼梯间）', () => {
  assert.equal(coreOf('T1-ST-B-11F-12F-flight-1'), 'T1-ST-B');
  assert.equal(coreOf('A-ST2-6F-7F-flight-2'), 'A-ST2');
  for (const T of ['T1', 'A']) {
    const plan = siegePlan(seq(7), L, nav, runs, TOWERS[T]);
    const fl = routeFlights(plan, L, nav, runs), ids = new Set(fl.map((f) => f.id));
    assert.equal(ids.size, fl.length, '梯段不重复');
    const yOf = (f) => nav.floors.get(f)?.y ?? 0;
    for (const g of plan.gates) {
      const heavy = fl.filter((f) => f.heavy && coreOf(f.id) === coreOf(g.core));
      assert.ok(heavy.some((f) => f.from === g.floor), `${T} ${g.floor} 往上那段`);
      assert.ok(heavy.some((f) => f.to === g.floor), `${T} 从下面上到 ${g.floor} 的那段`);
    }
    const light = fl.filter((f) => !f.heavy);
    assert.ok(light.length >= 4, `${T} 关卡之间的梯段 ${light.length}`);
    const lo = yOf(plan.gates[0].floor), hi = yOf(plan.tower.roof);
    for (const f of light) assert.ok(f.bottom.y >= lo - 0.2 && f.bottom.y < hi, `${f.id} 在第一道关和屋顶之间`);
  }
});

test('关卡跟前：每道关 3 米内至少 4 个墙上的痕迹、一大滩血；放工具的那户里也有东西（同一层的分组里）', () => {
  for (const T of ['T1', 'A']) for (const seed of [7, 21, 99]) {
    const { plan, items } = dress(T, seed);
    const lvOf = (f) => nav.floors.get(f)?.parentFloor || nav.floors.get(f)?.level?.id || f;
    for (const g of plan.gates) {
      const st = plan.stages[g.stage], near = (it, p, r = 3) => Math.abs(it.p[1] - p.y) < 2.6 && Math.hypot(it.p[0] - p.x, it.p[2] - p.z) < r;
      // 配电箱那道关：人在电梯厅的配电箱前，栅门在楼梯口——墙上的算两处的
      const walls = items.filter((it) => Math.abs(it.n[1]) < 0.5 && (near(it, st.site) || (g.type === 'fuse' && near(it, g.model))));
      assert.ok(walls.length >= 4, `${T}/${seed} ${g.floor} ${g.type}：墙上 ${walls.length} 个`);
      const pools = items.filter((it) => /^pool/.test(it.cell) && it.w >= 1.1 && near(it, st.site, 3.2));
      assert.ok(pools.length >= 1, `${T}/${seed} ${g.floor} ${g.type}：门前一大滩血`);
      if (g.type === 'fire') assert.ok(items.some((it) => it.cell === 'scorch' && near(it, g.model, 3) && it.h > 2), `${T}/${seed} 火背后熏到天花板的烟`);
      if (g.type === 'lock') assert.ok(items.filter((it) => it.until === g.stage).length >= 3, `${T}/${seed} 门扇上的手印`);
    }
    for (const st of plan.stages.filter((s) => s.kind === 'tool')) {
      const inUnit = items.filter((it) => it.lv === lvOf(st.floor) && Math.abs(it.p[1] - st.site.y) < 2.6 && Math.hypot(it.p[0] - st.site.x, it.p[2] - st.site.z) < 4);
      assert.ok(inUnit.length >= 6 && inUnit.some((it) => /^pool/.test(it.cell)), `${T}/${seed} ${st.id} 那户里 ${inUnit.length} 个`);
    }
  }
});

test('墙上的手印一半是往下滑的；地上的血点有顺着走的方向拉长的一串', () => {
  const { items } = dress('A', 7);
  const hands = items.filter((it) => /^hand/.test(it.cell));
  const drag = hands.filter((it) => it.cell === 'handDrag').length;
  assert.ok(drag >= hands.length * 0.3 && drag <= hands.length * 0.75, `往下滑的 ${drag} / ${hands.length}`);
  assert.ok(items.filter((it) => it.cell === 'trail').length >= 8);
  // 血的深浅逐个不同
  const tones = new Set(items.filter((it) => it.mode === 1).map((it) => (it.tone ?? 1).toFixed(2)));
  assert.ok(tones.size > 20);
});
