// 消防楼梯、候梯厅细部（墙裙、踢脚、扶手、门框、消火栓箱……）：做法分组、实例化模板的材质与顶点预算、
// 不挡行走身体、没有 document 时照常构建（这些细部只是几何和顶点色，不碰画布）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { BatchSet } from '../src/render/batch.js';
import { towerStairPlan } from '../src/layout/tower-stairs.js';
import { buildTowerStairGeometry, buildTowerStairInstances, stairDetailSpec, stairDetailKey, STAIR_PAINT } from '../src/render/build/tower-stairs.js';

const byId = new Map(L.levels.map((l) => [l.id, l]));
const tower = (id) => L.buildings.find((b) => b.id === id);
const stairsOf = (b) => L.stairs.filter((s) => s.building === b.id);
const levelsOf = (b) => (b.community ? (b.stairLevelIds || b.levels).map((id) => byId.get(id)).filter(Boolean) : L.levels.filter((l) => l.building === b.id)).sort((a, z) => a.elev - z.elev);

test('做法分组：社区塔楼自己楼层墙内皮 0.1、宿主楼层与公寓 0.2；穿越层没有门；消火栓 / 表箱挂在出楼梯门迎面的电梯墙垛上', () => {
  const T1 = tower('T1'), A = tower('A');
  const t11 = stairDetailSpec(T1, byId.get('T1-11F'), stairsOf(T1), L.elevators);
  assert.equal(t11.inset, .1); assert.equal(t11.head, 2.3); assert.ok(t11.wellGuard); assert.ok(!t11.lining);
  const lob = t11.lobby;
  assert.ok(lob, 'T1 自己的楼层应有候梯厅细部');
  assert.deepEqual(lob.boxes.map((q) => q.kind), ['hydrant']);
  // 迎面电梯（消防电梯 LF）在两樘楼梯门之间；箱子在它西侧的墙垛上：不压任何电梯门洞和门套，
  // 不出前室（两侧候梯厅隔层封死，封死的那块是实心核心筒）
  assert.ok(lob.face && lob.face.x0 < 0 && lob.face.x1 > 0);
  assert.deepEqual(lob.fire, [-1.4, 1.4]);
  for (const q of lob.boxes) {
    for (const [a, b] of lob.gaps) assert.ok(q.x + q.w / 2 < a - .07 || q.x - q.w / 2 > b + .07, `${q.kind} 压电梯门 ${a}..${b}`);
    assert.ok(q.x - q.w / 2 > lob.fire[0] && q.x + q.w / 2 < lob.fire[1], `${q.kind} 出了前室`);
    // 出楼梯门迎面看得到：箱子中心离某一樘楼梯门中心不到 1.3 m
    assert.ok(stairsOf(T1).some((s) => Math.abs((s.door.x0 + s.door.x1) / 2 - q.x) < 1.3), `${q.kind} 不在楼梯门正对面`);
  }
  // 报警按钮在两樘楼梯门之间
  const [da, db] = stairsOf(T1).map((s) => s.door).sort((a, b) => a.x0 - b.x0);
  assert.ok(lob.alarm > da.x1 && lob.alarm < db.x0);
  // 电梯墙面在候梯厅一侧、楼梯门墙面在另一侧，间距就是候梯厅进深（3.2 m 减两道半墙）
  assert.ok(Math.abs(Math.abs(lob.z1 - lob.z0) - (3.2 - .06 - .1)) < 1e-6);
  // 隔层停靠的电梯不分组：15F（W 不停）和 16F（E 不停）是同一个签名
  const k15 = stairDetailKey(byId.get('T1-15F'), stairDetailSpec(T1, byId.get('T1-15F'), stairsOf(T1), L.elevators));
  const k16 = stairDetailKey(byId.get('T1-16F'), stairDetailSpec(T1, byId.get('T1-16F'), stairsOf(T1), L.elevators));
  assert.equal(k15, k16);
  const b1 = stairDetailSpec(T1, byId.get('P1-B1'), stairsOf(T1));
  assert.equal(b1.inset, .2); assert.equal(b1.head, 2.2);
  assert.ok(Object.values(b1.stairs).every((s) => s.doors.length === 1) && !b1.lobby && b1.lining);
  const pass = stairDetailSpec(T1, byId.get('P1-3F'), stairsOf(T1));
  assert.ok(Object.values(pass.stairs).every((s) => s.doors.length === 0), '穿越层不该有门框');
  const a6 = stairDetailSpec(A, byId.get('A-6F'), stairsOf(A));
  assert.equal(a6.inset, .2); assert.equal(a6.head, 2.35); assert.ok(!a6.wellGuard);
  assert.ok(Object.values(a6.stairs).every((s) => s.doors.length === 1) && !a6.lobby && a6.lining);
  // 公寓：消火栓箱挂在楼梯间门口平台的侧墙上，离门 0.74–1.46 m，在第一跑起步（2 m）之前
  for (const [id, s] of Object.entries(a6.stairs)) {
    assert.equal(s.inner?.kind, 'hydrant', id);
    assert.ok(s.inner.v - s.inner.w / 2 > a6.inset + .3 && s.inner.v + s.inner.w / 2 < 2 - .3, id);
  }
  assert.ok(Object.values(t11.stairs).every((s) => !s.inner), '社区塔楼的箱子挂在门外，楼梯间里不再挂');
  assert.ok(Object.values(b1.stairs).every((s) => !s.inner));
  // 典型楼层共用一组：A 的 2F–19F（3.4 m）一个签名，T1 的 8F–24F 按层高最多三组
  const keysA = new Set(L.levels.filter((l) => l.building === 'A' && l.height === 3.4).map((l) => stairDetailKey(l, stairDetailSpec(A, l, stairsOf(A)))));
  assert.equal(keysA.size, 1);
  const keysT = new Set(L.levels.filter((l) => l.building === 'T1' && /^T1-(8|9|1\d|2[0-4])F$/.test(l.id)).map((l) => stairDetailKey(l, stairDetailSpec(T1, l, stairsOf(T1), L.elevators))));
  assert.ok(keysT.size <= 3, `${keysT.size} 组`);
});

test('实例化模板只用两个批次（绘制调用 +0）：有 plaster 时刷漆面走 plaster，没有时退回 concrete；每层恰好一个实例，模板三角形有上限', () => {
  for (const keys of [['plaster', 'extMetal'], ['concrete', 'extMetal']]) for (const id of ['T1', 'A', 'H', 'W1']) {
    const b = tower(id), levels = levelsOf(b), materials = Object.fromEntries(keys.map((k) => [k, new THREE.MeshStandardMaterial()]));
    const group = new THREE.Group(), ctx = { dynamic: [], layout: L };
    // 只给两种材质：用到别的批次 flush 会抛 missing material
    buildTowerStairInstances(ctx, b, levels, stairsOf(b), materials, group);
    const withFlights = levels.filter((l) => b.access.flights.some((f) => f.parentFloor === l.id));
    // 每组模板按 [刷漆面, 金属] 的顺序建网格：遇到刷漆面就是新的一组（同一层高可能有好几组，名字相同）
    const records = new Map();
    let bucket = -1;
    for (const m of group.children) {
      assert.ok(keys.includes(m.sourceMesh.name), m.name);
      if (m.sourceMesh.name === keys[0]) bucket++;
      const key = `${m.name.replace(/-(plaster|concrete|extMetal)$/, '')}#${bucket}`, g = m.geometry;
      records.set(key, (records.get(key) || 0) + (g.index ? g.index.count : g.attributes.position.count) / 3);
      assert.ok(g.attributes.color, `${m.name} 缺顶点色`);
      // 去重成带索引的几何：顶点数明显少于三角形数 × 3
      assert.ok(g.index && g.attributes.position.count < g.index.count * .8, `${m.name} 没有去重`);
    }
    // 一份模板（两部楼梯、一层）：常规层高（≤ 3.6 m）不超过 6000 个三角形，更高的楼层梯段长、栏杆多，不超过 9000
    for (const [k, v] of records) { const h = +/-stairs-([\d.]+)#/.exec(k)[1]; assert.ok(v < (h <= 3.6 ? 6000 : 9000), `${k}: ${v} 三角形`); }
    const paintMat = materials[keys[0]];
    for (const lv of withFlights) {
      ctx.dynamic[0].update(0, 0, { state: { building: b.id, explore: { building: b.id, level: lv.id } } });
      const ys = [];
      for (const m of group.children.filter((q) => q.material === paintMat && q.visible)) for (let i = 0; i < m.count; i++) { const mx = new THREE.Matrix4(); m.getMatrixAt(i, mx); ys.push(mx.elements[13]); }
      assert.equal(ys.filter((y) => Math.abs(y - lv.elev) < 1e-5).length, 1, `${id} ${lv.id} 应该恰好一个实例`);
    }
    for (const m of group.children) m.geometry.dispose();
    for (const m of Object.values(materials)) m.dispose();
  }
});

test('去重不改画面：带索引的模板展开后和合批原样的三角形逐个相同', () => {
  const b = tower('A'), lv = byId.get('A-12F'), stairs = stairsOf(b), spec = stairDetailSpec(b, lv, stairs), off = lv.elev;
  const flights = b.access.flights.filter((f) => f.parentFloor === lv.id).map((f) => ({ ...f, bottom: { ...f.bottom, y: f.bottom.y - off }, top: { ...f.top, y: f.top.y - off } }));
  const surfaces = b.access.surfaces.filter((s) => s.parentFloor === lv.id).map((s) => ({ ...s, elev: s.elev - off }));
  const materials = Object.fromEntries(['plaster', 'extMetal'].map((k) => [k, new THREE.MeshStandardMaterial()]));
  const raw = new BatchSet(materials), g0 = new THREE.Group();
  buildTowerStairGeometry(raw, { ...b, access: { protected: true, flights, surfaces } }, [], stairs, { enclosures: false, detail: spec, paint: 'plaster' });
  raw.flush(g0);
  const group = new THREE.Group(), ctx = { dynamic: [] };
  buildTowerStairInstances(ctx, b, [byId.get('A-11F'), lv], stairs, materials, group);
  for (const m of g0.children) {
    const inst = group.children.find((q) => q.sourceMesh.name === m.name), a = m.geometry.attributes.position, g = inst.geometry, idx = g.index.array, p = g.attributes.position;
    assert.equal(idx.length, a.count);
    for (let i = 0; i < a.count; i += 7) for (let k = 0; k < 3; k++) assert.equal(p.array[idx[i] * 3 + k], a.array[i * 3 + k]);
  }
});

test('细部不进行走身体：梯段宽度内、脚以上 0.4–1.75 m 没有新增实体；门框不压门洞', () => {
  for (const id of ['T1', 'A']) {
    const b = tower(id), stairs = stairsOf(b);
    for (const lid of id === 'T1' ? ['T1-11F', 'P1-B1', 'P1-3F'] : ['A-6F', 'A-B1']) {
      const lv = byId.get(lid), spec = stairDetailSpec(b, lv, stairs), off = lv.elev;
      const flights = b.access.flights.filter((f) => f.parentFloor === lid).map((f) => ({ ...f, bottom: { ...f.bottom, y: f.bottom.y - off }, top: { ...f.top, y: f.top.y - off } }));
      const surfaces = b.access.surfaces.filter((s) => s.parentFloor === lid).map((s) => ({ ...s, elev: s.elev - off }));
      const solids = [], rec = { get: () => ({ box: (x, y, z, w, h, d) => solids.push({ x, y, z, w, h, d }), bar: () => {} }) };
      buildTowerStairGeometry(rec, { ...b, access: { protected: true, flights, surfaces } }, [], stairs, { enclosures: false, detail: spec });
      assert.ok(solids.length > 50, `${lid} 细部太少`);
      for (const f of flights) {
        const [x0, z0] = f.localBottom, [, z1] = f.localTop, lo = x0 - f.width / 2 + .06, hi = x0 + f.width / 2 - .06;
        for (const o of solids) {
          const t = (o.z - z0) / (z1 - z0);
          if (t < 0 || t > 1) continue;
          const walk = f.bottom.y + (f.top.y - f.bottom.y) * t;
          if (o.y + o.h / 2 <= walk + .4 || o.y - o.h / 2 >= walk + 1.75) continue;
          assert.ok(o.x + o.w / 2 <= lo || o.x - o.w / 2 >= hi, `${lid} ${f.id}: 实体压进梯段 x ${o.x.toFixed(2)} y ${o.y.toFixed(2)} z ${o.z.toFixed(2)}`);
        }
      }
      // 门洞净宽内（门口内外各 0.6 m）、0.1–2.2 m 高没有东西
      for (const s of stairs) for (const d of spec.stairs[s.id].doors) {
        const p = towerStairPlan(s), za = s.door.z0 - p.direction * .6, zb = s.door.z0 + p.direction * .6;
        for (const o of solids) {
          if (o.y + o.h / 2 < .1 || o.y - o.h / 2 > 2.19) continue;   // 门头横框在洞口上沿以上
          if (o.z < Math.min(za, zb) || o.z > Math.max(za, zb)) continue;
          assert.ok(o.x + o.w / 2 <= d.x0 + .005 || o.x - o.w / 2 >= d.x1 - .005, `${lid} ${s.id}: 门洞里有实体 x ${o.x.toFixed(2)} y ${o.y.toFixed(2)}`);
        }
      }
    }
  }
});

test('没有 document（node）时照常构建，颜色是合法的十六进制', () => {
  assert.equal(typeof document, 'undefined');
  for (const c of Object.values(STAIR_PAINT)) assert.match(c, /^#[0-9a-f]{6}$/);
  const b = tower('A'), group = new THREE.Group(), ctx = { dynamic: [] };
  const materials = Object.fromEntries(['concrete', 'extMetal'].map((k) => [k, new THREE.MeshStandardMaterial()]));
  assert.doesNotThrow(() => buildTowerStairInstances(ctx, b, levelsOf(b), stairsOf(b), materials, group, { lazy: true, idle: [] }));
  assert.equal(group.children.length, 0, 'lazy：没去过的楼层不建模板');
  ctx.dynamic[0].update(0, 0, { state: { building: 'A', explore: { building: 'A', level: 'A-6F' } } });
  assert.ok(group.children.length >= 2);
  for (const m of group.children) m.geometry.dispose();
});
