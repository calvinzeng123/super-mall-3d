// 布局规则测试：对应规格第 8 节。先写测试，再实现布局模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/layout/layout.js';
import {
  rectsOverlap, pointInRect, pointInPoly, frontProbes, doorProbe, rectSamples, rectCornersInset, dist, mid, NORMAL,
} from '../src/layout/geom.js';
import { buildWalkGraph, components } from '../src/layout/walk.js';

const L = buildLayout();
const ORDER = ['B2', 'B1', 'B1M', '1F', '2F', '3F', 'RF'];
const level = (id) => L.levels.find((l) => l.id === id);
const inWalk = (lv, p) => lv.walk.some((w) => pointInRect(p, w.rect));
const inVoid = (lv, p) => lv.voids.some((v) => pointInPoly(p, v.poly));
const onSlab = (lv, p) => pointInPoly(p, lv.slab.outer) && !inVoid(lv, p);
const stairDoor = (s, levelId) => (s.doorByLevel && s.doorByLevel[levelId]) || s.door;

test('七个楼层，标高与规格一致，场景主题各不相同', () => {
  assert.deepEqual(L.levels.map((l) => l.id), ORDER);
  const elev = Object.fromEntries(L.levels.map((l) => [l.id, l.elev]));
  assert.deepEqual(elev, { B2: -12, B1: -8.4, B1M: -4.5, '1F': 0, '2F': 5.5, '3F': 11, RF: 16.5 });
  assert.equal(new Set(L.levels.map((l) => l.theme.floor)).size, 7, '每层地面材质应不同');
  assert.equal(new Set(L.levels.map((l) => l.theme.key)).size, 7, '每层场景主题应不同');
});

test('铺位数量：1F/2F ≥ 25，3F/B1M ≥ 20', () => {
  assert.ok(level('1F').units.length >= 25, `1F 只有 ${level('1F').units.length} 个铺位`);
  assert.ok(level('2F').units.length >= 25, `2F 只有 ${level('2F').units.length} 个铺位`);
  assert.ok(level('3F').units.length >= 20, `3F 只有 ${level('3F').units.length} 个铺位`);
  assert.ok(level('B1M').units.length >= 20, `B1M 只有 ${level('B1M').units.length} 个铺位`);
});

test('同层铺位、用房互不重叠，都在楼板内，且不落入洞口', () => {
  for (const lv of L.levels) {
    const boxes = [
      ...lv.units.flatMap((u) => u.rects.map((r) => ({ id: `${u.code} ${u.brand.name}`, r }))),
      ...lv.rooms.flatMap((m) => m.rects.map((r) => ({ id: m.id, r }))),
    ];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].id === boxes[j].id) continue;
        assert.ok(!rectsOverlap(boxes[i].r, boxes[j].r), `${lv.id}: ${boxes[i].id} 与 ${boxes[j].id} 重叠`);
      }
      for (const p of rectSamples(boxes[i].r, 1.5)) {
        assert.ok(pointInPoly(p, lv.slab.outer), `${lv.id}: ${boxes[i].id} 超出楼板`);
        assert.ok(!inVoid(lv, p), `${lv.id}: ${boxes[i].id} 落入洞口`);
      }
    }
  }
});

test('每个铺位至少有一段门面临公共走廊', () => {
  for (const lv of L.levels) {
    for (const u of lv.units) {
      assert.ok(u.fronts.length > 0, `${u.code} 没有门面`);
      const ok = u.fronts.some((f) => frontProbes(f).some((p) => inWalk(lv, p)));
      assert.ok(ok, `${lv.id} ${u.code} ${u.brand.name} 的门面不临走廊`);
    }
  }
});

test('卫生间：B1M 与 1F–3F 每层 ≥2 组，B1/B2/RF ≥1 组，门口通走廊', () => {
  const wc = (id) => level(id).rooms.filter((m) => m.type === 'wc');
  for (const id of ['B1M', '1F', '2F', '3F']) assert.ok(wc(id).length >= 2, `${id} 卫生间不足 2 组`);
  for (const id of ['B1', 'B2', 'RF']) assert.ok(wc(id).length >= 1, `${id} 没有卫生间`);
  for (const lv of L.levels) {
    for (const m of wc(lv.id)) {
      assert.ok(m.doors.some((d) => frontProbes(d).some((p) => inWalk(lv, p))), `${lv.id} ${m.id} 的门不通走廊`);
    }
  }
});

test('客梯覆盖 B2–RF，每部电梯在每个停靠层的门口都在走廊上', () => {
  for (const id of ORDER) {
    const lifts = L.elevators.filter((e) => e.type === 'passenger' && e.serves.includes(id));
    assert.ok(lifts.length >= 2, `${id} 客梯不足 2 部`);
  }
  assert.equal(L.elevators.filter((e) => e.type === 'glass').length, 2, '应有 2 部观光电梯');
  for (const e of L.elevators) {
    for (const id of e.serves) assert.ok(inWalk(level(id), doorProbe(e)), `${e.id} 在 ${id} 的门口不在走廊上`);
  }
});

test('扶梯几何：30°、落点在楼板走廊上、斜段在上层洞口内', () => {
  for (const e of L.escalators) {
    const lo = level(e.from);
    const hi = level(e.to);
    assert.equal(e.bottom.y, lo.elev, `${e.id} 底部标高`);
    assert.equal(e.top.y, hi.elev, `${e.id} 顶部标高`);
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const deg = (Math.atan2(e.top.y - e.bottom.y, run) * 180) / Math.PI;
    assert.ok(Math.abs(deg - 30) < 0.3, `${e.id} 坡度 ${deg.toFixed(2)}°`);
    const ux = (e.top.x - e.bottom.x) / run;
    const uz = (e.top.z - e.bottom.z) / run;
    const low = [e.bottom.x - ux * 1.2, e.bottom.z - uz * 1.2];
    const high = [e.top.x + ux * 1.2, e.top.z + uz * 1.2];
    assert.ok(onSlab(lo, low) && inWalk(lo, low), `${e.id} 底部落点不在 ${lo.id} 楼板走廊上`);
    assert.ok(onSlab(hi, high) && inWalk(hi, high), `${e.id} 顶部落点不在 ${hi.id} 楼板走廊上`);
    for (let t = 0.15; t <= 0.951; t += 0.1) {
      for (const s of [-1, 0, 1]) {
        const off = s * (e.width / 2 - 0.1);
        const p = [e.bottom.x + (e.top.x - e.bottom.x) * t - uz * off, e.bottom.z + (e.top.z - e.bottom.z) * t + ux * off];
        assert.ok(inVoid(hi, p), `${e.id} 斜段 t=${t.toFixed(2)} 会撞到 ${hi.id} 楼板`);
      }
    }
  }
});

test('扶梯：每段都有上行和下行，共 8 对 16 部，同层扶梯互不重叠', () => {
  const segs = [['B1', 'B1M'], ['B1M', '1F'], ['1F', '2F'], ['2F', '3F'], ['3F', 'RF']];
  for (const [a, b] of segs) {
    const es = L.escalators.filter((e) => e.from === a && e.to === b);
    assert.ok(es.some((e) => e.dir === 'up') && es.some((e) => e.dir === 'down'), `${a}→${b} 缺少上行或下行扶梯`);
  }
  assert.equal(L.escalators.length, 16);
  assert.equal(new Set(L.escalators.map((e) => e.pair)).size, 8);
  const foot = (e) => {
    const xs = [e.bottom.x, e.top.x], zs = [e.bottom.z, e.top.z];
    const alongX = Math.abs(e.top.x - e.bottom.x) > Math.abs(e.top.z - e.bottom.z);
    const h = e.width / 2 - 0.01;
    return alongX
      ? { x0: Math.min(...xs) - 2.4, x1: Math.max(...xs) + 2.4, z0: e.bottom.z - h, z1: e.bottom.z + h }
      : { x0: e.bottom.x - h, x1: e.bottom.x + h, z0: Math.min(...zs) - 2.4, z1: Math.max(...zs) + 2.4 };
  };
  for (let i = 0; i < L.escalators.length; i++) {
    for (let j = i + 1; j < L.escalators.length; j++) {
      const a = L.escalators[i], b = L.escalators[j];
      if (a.from !== b.from) continue;
      assert.ok(!rectsOverlap(foot(a), foot(b)), `${a.id} 与 ${b.id} 重叠`);
    }
  }
});

test('1F 人行入口 ≥4 个，分布在东南西北，入口内侧连走廊、外侧在建筑外', () => {
  const ents = L.entrances.filter((e) => e.level === '1F');
  assert.ok(ents.length >= 4);
  assert.deepEqual(new Set(ents.map((e) => e.side)), new Set(['N', 'S', 'E', 'W']));
  assert.equal(ents.filter((e) => e.main).length, 1, '应有 1 个主入口');
  const f1 = level('1F');
  for (const e of ents) {
    const [nx, nz] = NORMAL[e.side];
    const [mx, mz] = mid(e.seg);
    assert.ok(inWalk(f1, [mx - nx * 1, mz - nz * 1]), `${e.name} 内侧不是走廊`);
    assert.ok(!pointInPoly([mx + nx * 1, mz + nz * 1], f1.slab.outer), `${e.name} 外侧仍在建筑内`);
  }
});

test('车库：入口、出口坡道各 1 且分离，坡度 ≤15%，B1↔B2 双向，坡道两端接车道', () => {
  const inR = L.ramps.filter((r) => r.type === 'street-in');
  const outR = L.ramps.filter((r) => r.type === 'street-out');
  assert.equal(inR.length, 1);
  assert.equal(outR.length, 1);
  assert.ok(!rectsOverlap(inR[0].lane, outR[0].lane), '入口与出口坡道重叠');
  assert.equal(inR[0].from.y, 0);
  assert.equal(inR[0].to.y, level('B1').elev);
  assert.equal(outR[0].from.y, level('B1').elev);
  assert.equal(outR[0].to.y, 0);
  assert.ok(L.ramps.some((r) => r.type === 'down' && r.from.level === 'B1' && r.to.level === 'B2'));
  assert.ok(L.ramps.some((r) => r.type === 'up' && r.from.level === 'B2' && r.to.level === 'B1'));
  for (const r of L.ramps) {
    const h = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z);
    assert.ok(Math.abs(r.to.y - r.from.y) / h <= 0.15 + 1e-9, `${r.id} 坡度过大`);
    for (const end of [r.from, r.to]) {
      if (end.level === 'street') {
        assert.ok(L.site.driveways.some((d) => pointInRect([end.x, end.z], d, 0.01)), `${r.id} 地面端没有接到车道`);
      } else {
        assert.ok(inWalk(level(end.level), [end.x, end.z]), `${r.id} 在 ${end.level} 的端点没有接到车道`);
      }
    }
  }
});

test('连通性：所有入口、停车层电梯厅、铺位在同一个步行网络里', () => {
  const comp = components(buildWalkGraph(L));
  const root = comp.get(`ent:${L.entrances[0].id}`);
  assert.notEqual(root, undefined);
  for (const e of L.entrances) assert.equal(comp.get(`ent:${e.id}`), root, `${e.name} 不连通`);
  for (const lv of L.levels) {
    for (const u of lv.units) assert.equal(comp.get(`unit:${u.id}`), root, `${u.code} ${u.brand.name} 不可达`);
  }
  for (const id of ['B1', 'B2']) {
    const lobbies = level(id).walk.filter((w) => w.kind === 'lobby');
    assert.ok(lobbies.length >= 2, `${id} 电梯厅不足`);
    for (const w of lobbies) assert.equal(comp.get(`walk:${id}:${w.id}`), root, `${id} ${w.id} 不可达`);
  }
});

test('楼梯：每层 ≥2 部；商业层任一点到最近楼梯或出口 ≤45m，停车层 ≤60m', () => {
  for (const lv of L.levels) {
    const st = L.stairs.filter((s) => s.serves.includes(lv.id));
    assert.ok(st.length >= 2, `${lv.id} 楼梯不足 2 部`);
    if (lv.kind === 'roof') continue;
    const exits = st.map((s) => mid(stairDoor(s, lv.id)));
    if (lv.id === '1F') exits.push(...L.entrances.map((e) => mid(e.seg)));
    const limit = lv.kind === 'parking' ? 60 : 45;
    for (const w of lv.walk) {
      for (const p of rectCornersInset(w.rect, 1)) {
        const d = Math.min(...exits.map((q) => dist(p, q)));
        assert.ok(d <= limit, `${lv.id} ${w.id} 点 (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) 到最近楼梯 ${d.toFixed(1)}m`);
      }
    }
  }
});

test('停车：每层 ≥250 个车位，车位不压车道、不压用房；B1 有充电位和无障碍位', () => {
  for (const id of ['B1', 'B2']) {
    const lv = level(id);
    const stalls = lv.parking.stalls;
    assert.ok(stalls.length >= 250, `${id} 只有 ${stalls.length} 个车位`);
    const blocks = [...lv.parking.aisles, ...lv.rooms.flatMap((m) => m.rects)];
    for (const s of stalls) {
      const r = { x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: s.z - s.d / 2, z1: s.z + s.d / 2 };
      for (const b of blocks) assert.ok(!rectsOverlap(r, b, 0.02), `${id} 车位 (${s.x}, ${s.z}) 压到车道或用房`);
    }
  }
  const types = new Set(level('B1').parking.stalls.map((s) => s.type));
  assert.ok(types.has('ev') && types.has('accessible'));
});

test('天台：餐吧 ≥3、摩天轮 1、IP 雕塑 ≥1、其他打卡点', () => {
  const rf = level('RF');
  const bars = rf.units.filter((u) => ['bar', 'restaurant'].includes(u.brand.cat));
  assert.ok(bars.length >= 3, `天台餐吧只有 ${bars.length} 家`);
  const types = rf.features.map((f) => f.type);
  assert.equal(types.filter((t) => t === 'ferris').length, 1);
  assert.ok(types.includes('ip'));
  for (const t of ['mirror', 'skywalk', 'letters']) assert.ok(types.includes(t), `天台缺少 ${t}`);
});

test('店名全部唯一（原创虚构品牌）', () => {
  const units = L.levels.flatMap((l) => l.units);
  const names = units.map((u) => u.brand.name);
  const ens = units.map((u) => u.brand.en);
  assert.equal(new Set(names).size, names.length, '中文店名重复');
  assert.equal(new Set(ens).size, ens.length, '英文店名重复');
  const codes = units.map((u) => u.code);
  assert.equal(new Set(codes).size, codes.length, '铺位号重复');
});
