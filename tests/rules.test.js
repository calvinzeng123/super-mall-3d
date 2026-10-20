// 通用布局规则：对园区里已存在的每一期执行（规格第 10 节 3、4、6、7、11、12、14、16 条）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, inWalk, inVoid, onSlab, stairDoor, midOf, liftProbe, insetPts, segProbes } from './helpers.js';
import { convexOverlap, polySamples, dist, pointInPoly, lrectPoly, distToPolyEdge } from '../src/layout/geom.js';
import { buildWalkGraph, components } from '../src/layout/walk.js';

test('同层铺位、用房互不重叠，都在楼板内且不落入洞口', () => {
  for (const lv of L.levels) {
    const items = [
      ...lv.units.flatMap((u) => u.polys.map((p) => ({ id: `${u.code} ${u.brand.name}`, p }))),
      ...lv.rooms.flatMap((m) => m.polys.map((p) => ({ id: m.id, p, room: m }))),
    ];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].id === items[j].id) continue;
        if (convexOverlap(items[i].p, items[j].p)) assert.fail(`${lv.id}: ${items[i].id} 与 ${items[j].id} 重叠`);
      }
      for (const q of polySamples(items[i].p, 1.5, 0.05)) {
        const room = items[i].room;
        const ownShaft = lv.voids.find(v => pointInPoly(q, v.poly) && (
          room?.type === 'stair' && v.kind === 'stair' && v.stair === items[i].id
          || room?.type === 'core' && v.kind === 'shaft' && v.elevator
            && L.elevators.some(e => e.id === v.elevator && e.frame.id === room.frame.id
              && room.polys.some(p => pointInPoly([e.x, e.z], p)))
        ));
        const cutShaft = ownShaft && lv.slab.pieces.some(s => s.holes.some(h =>
          ownShaft.poly.every(p => pointInPoly(p, h) || distToPolyEdge(p, h) < 1e-6) && pointInPoly(q, h)));
        if (!onSlab(lv, q) && !cutShaft) assert.fail(`${lv.id}: ${items[i].id} 在 (${q[0].toFixed(1)}, ${q[1].toFixed(1)}) 处不在楼板上或落入无关洞口`);
      }
      const room = items[i].room;
      if (room?.landingRect) for (const q of polySamples(lrectPoly(room.frame, room.landingRect), .5, .08))
        assert.ok(onSlab(lv, q), `${lv.id}: ${room.id} 消防落脚平台没有楼板`);
    }
  }
});

test('每个铺位至少有一段门面临走道', () => {
  for (const lv of L.levels) {
    for (const u of lv.units) {
      assert.ok(u.wfronts.length > 0, `${u.code} 没有门面`);
      const ok = u.wfronts.some((f) => segProbes(f, 0.5).some((p) => inWalk(lv, p)));
      assert.ok(ok, `${lv.id} ${u.code} ${u.brand.name} 的门面不临走道`);
    }
  }
});

test('客梯：每层 ≥2 部；每部电梯在每个停靠层的门口都在走道上', () => {
  for (const lv of L.levels) {
    const n = L.elevators.filter((e) => e.type === 'passenger' && e.serves.includes(lv.id)).length;
    assert.ok(n >= 2, `${lv.id} 客梯只有 ${n} 部`);
  }
  for (const e of L.elevators) {
    for (const id of e.serves) assert.ok(inWalk(lvl(id), liftProbe(e)), `${e.id} 在 ${id} 的门口不在走道上`);
  }
});

test('扶梯几何：30°、两端落点在楼板走道上、斜段在上层洞口内', () => {
  for (const e of L.escalators) {
    const lo = lvl(e.from);
    const hi = lvl(e.to);
    assert.equal(e.bottom.y, lo.elev, `${e.id} 底部标高`);
    assert.equal(e.top.y, hi.elev, `${e.id} 顶部标高`);
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const deg = (Math.atan2(e.top.y - e.bottom.y, run) * 180) / Math.PI;
    assert.ok(Math.abs(deg - 30) < 0.3, `${e.id} 坡度 ${deg.toFixed(2)}°`);
    const ux = (e.top.x - e.bottom.x) / run;
    const uz = (e.top.z - e.bottom.z) / run;
    const low = [e.bottom.x - ux * 1.2, e.bottom.z - uz * 1.2];
    const high = [e.top.x + ux * 1.2, e.top.z + uz * 1.2];
    assert.ok(onSlab(lo, low) && inWalk(lo, low), `${e.id} 底部落点不在 ${lo.id} 楼板走道上`);
    assert.ok(onSlab(hi, high) && inWalk(hi, high), `${e.id} 顶部落点不在 ${hi.id} 楼板走道上`);
    for (let t = 0.15; t <= 0.951; t += 0.1) {
      for (const s of [-1, 0, 1]) {
        const off = s * (e.width / 2 - 0.1);
        const p = [e.bottom.x + (e.top.x - e.bottom.x) * t - uz * off, e.bottom.z + (e.top.z - e.bottom.z) * t + ux * off];
        assert.ok(inVoid(hi, p), `${e.id} 斜段 t=${t.toFixed(2)} 会撞到 ${hi.id} 楼板`);
      }
    }
  }
});

test('同层扶梯（含上下平台）互不重叠', () => {
  const foot = (e) => {
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    const px = -uz, pz = ux, h = e.width / 2 - 0.01;
    const a = [e.bottom.x - ux * 2.4, e.bottom.z - uz * 2.4], b = [e.top.x + ux * 2.4, e.top.z + uz * 2.4];
    return [[a[0] - px * h, a[1] - pz * h], [b[0] - px * h, b[1] - pz * h], [b[0] + px * h, b[1] + pz * h], [a[0] + px * h, a[1] + pz * h]];
  };
  for (let i = 0; i < L.escalators.length; i++) {
    for (let j = i + 1; j < L.escalators.length; j++) {
      const a = L.escalators[i], b = L.escalators[j];
      if (a.from !== b.from) continue;
      assert.ok(!convexOverlap(foot(a), foot(b)), `${a.id} 与 ${b.id} 重叠`);
    }
  }
});

test('疏散：每层 ≥2 部楼梯；室内走道到最近楼梯或出口 ≤45m（停车层 ≤60m）', () => {
  for (const lv of L.levels) {
    const st = L.stairs.filter((s) => s.serves.includes(lv.id));
    assert.ok(st.length >= 2, `${lv.id} 楼梯只有 ${st.length} 部`);
    if (!['retail', 'food', 'parking'].includes(lv.kind)) continue;
    const exits = st.map((s) => midOf(stairDoor(s, lv.id)));
    exits.push(...L.entrances.filter((e) => e.level === lv.id).map((e) => midOf(e.seg)));
    const limit = lv.kind === 'parking' ? 60 : 45;
    for (const w of lv.walk) {
      if (w.outdoor) continue;
      for (const p of insetPts(w.poly, 1)) {
        const d = Math.min(...exits.map((q) => dist(p, q)));
        assert.ok(d <= limit, `${lv.id} ${w.id} 点 (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) 到最近楼梯 ${d.toFixed(1)}m`);
      }
    }
  }
});

test('停车：车位不压车道和用房，且在楼板上', () => {
  for (const lv of L.levels.filter((l) => l.parking)) {
    const blocks = [
      ...lv.walk.filter((w) => w.kind === 'aisle').map((w) => ({ id: w.id, p: w.poly })),
      ...lv.rooms.flatMap((m) => m.polys.map((p) => ({ id: m.id, p }))),
    ];
    for (const s of lv.parking.stalls) {
      for (const b of blocks) {
        if (convexOverlap(s.poly, b.p)) assert.fail(`${lv.id} 车位 (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) 压到 ${b.id}`);
      }
      for (const q of polySamples(s.poly, 2, 0.05)) {
        if (!onSlab(lv, q)) assert.fail(`${lv.id} 车位 (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) 不在楼板上`);
      }
    }
  }
});

test('全园区店名唯一（原创虚构品牌），铺位号唯一', () => {
  const units = L.levels.flatMap((l) => l.units);
  const dup = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);
  assert.deepEqual(dup(units.map((u) => u.brand.name)), [], '中文店名重复');
  assert.deepEqual(dup(units.map((u) => u.brand.en)), [], '英文店名重复');
  assert.deepEqual(dup(units.map((u) => u.code)), [], '铺位号重复');
});

test('连通：入口、铺位、所有走道、场地与桥面在同一步行网络', () => {
  const comp = components(buildWalkGraph(L));
  const root = comp.get(`ent:${L.entrances[0].id}`);
  assert.notEqual(root, undefined);
  for (const e of L.entrances) assert.equal(comp.get(`ent:${e.id}`), root, `${e.name} 不连通`);
  for (const lv of L.levels) {
    for (const u of lv.units) assert.equal(comp.get(`unit:${u.id}`), root, `${u.code} ${u.brand.name} 不可达`);
    for (const w of lv.walk) assert.equal(comp.get(`walk:${lv.id}:${w.id}`), root, `${lv.id} 走道 ${w.id} 不可达`);
  }
  for (const w of L.site.walk) assert.equal(comp.get(`site:${w.id}`), root, `场地 ${w.id} 不可达`);
  if (L.bridges) for (const w of L.bridges.walk) assert.equal(comp.get(`bridge:${w.id}`), root, `桥面 ${w.id} 不可达`);
});
