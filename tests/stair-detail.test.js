// 消防楼梯、候梯厅细部（墙裙、踢脚、扶手、门框、消火栓箱……）：做法分组、实例化模板的材质与顶点预算、
// 不挡行走身体、没有 document 时照常构建（这些细部只是几何和顶点色，不碰画布）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { towerStairPlan } from '../src/layout/tower-stairs.js';
import { buildTowerStairGeometry, buildTowerStairInstances, stairDetailSpec, stairDetailKey, STAIR_PAINT } from '../src/render/build/tower-stairs.js';

const byId = new Map(L.levels.map((l) => [l.id, l]));
const tower = (id) => L.buildings.find((b) => b.id === id);
const stairsOf = (b) => L.stairs.filter((s) => s.building === b.id);
const levelsOf = (b) => (b.community ? (b.stairLevelIds || b.levels).map((id) => byId.get(id)).filter(Boolean) : L.levels.filter((l) => l.building === b.id)).sort((a, z) => a.elev - z.elev);

test('做法分组：社区塔楼自己楼层墙内皮 0.1、宿主楼层与公寓 0.2；穿越层没有门；门外消火栓 / 表箱只挂在候梯厅里', () => {
  const T1 = tower('T1'), A = tower('A');
  const t11 = stairDetailSpec(T1, byId.get('T1-11F'), stairsOf(T1));
  assert.equal(t11.inset, .1); assert.equal(t11.head, 2.3); assert.ok(t11.wellGuard);
  assert.deepEqual(Object.values(t11.stairs).map((s) => s.lobby?.kind), ['hydrant', 'meter']);
  for (const [id, s] of Object.entries(t11.stairs)) {
    const st = L.stairs.find((q) => q.id === id), { x, w } = s.lobby;
    // 箱子在门旁边的墙上，不压门洞，也不出楼梯外框
    assert.ok(x + w / 2 < st.door.x0 || x - w / 2 > st.door.x1, id);
    assert.ok(x - w / 2 > st.rect.x0 && x + w / 2 < st.rect.x1, id);
  }
  const b1 = stairDetailSpec(T1, byId.get('P1-B1'), stairsOf(T1));
  assert.equal(b1.inset, .2); assert.equal(b1.head, 2.2);
  assert.ok(Object.values(b1.stairs).every((s) => s.doors.length === 1 && !s.lobby));
  const pass = stairDetailSpec(T1, byId.get('P1-3F'), stairsOf(T1));
  assert.ok(Object.values(pass.stairs).every((s) => s.doors.length === 0), '穿越层不该有门框');
  const a6 = stairDetailSpec(A, byId.get('A-6F'), stairsOf(A));
  assert.equal(a6.inset, .2); assert.equal(a6.head, 2.35); assert.ok(!a6.wellGuard);
  assert.ok(Object.values(a6.stairs).every((s) => !s.lobby && s.doors.length === 1));
  // 典型楼层共用一组：A 的 2F–19F（3.4 m）一个签名，T1 的 8F–24F 按层高最多三组
  const keysA = new Set(L.levels.filter((l) => l.building === 'A' && l.height === 3.4).map((l) => stairDetailKey(l, stairDetailSpec(A, l, stairsOf(A)))));
  assert.equal(keysA.size, 1);
  const keysT = new Set(L.levels.filter((l) => l.building === 'T1' && /^T1-(8|9|1\d|2[0-4])F$/.test(l.id)).map((l) => stairDetailKey(l, stairDetailSpec(T1, l, stairsOf(T1)))));
  assert.ok(keysT.size <= 3, `${keysT.size} 组`);
});

test('实例化模板只用 concrete / extMetal 两个批次（绘制调用 +0），每层恰好一个实例，模板顶点有上限', () => {
  for (const id of ['T1', 'A', 'H', 'W1']) {
    const b = tower(id), levels = levelsOf(b), materials = Object.fromEntries(['concrete', 'extMetal'].map((k) => [k, new THREE.MeshStandardMaterial()]));
    const group = new THREE.Group(), ctx = { dynamic: [] };
    // 只给两种材质：用到别的批次 flush 会抛 missing material
    buildTowerStairInstances(ctx, b, levels, stairsOf(b), materials, group);
    const withFlights = levels.filter((l) => b.access.flights.some((f) => f.parentFloor === l.id));
    const records = new Map();
    for (const m of group.children) {
      assert.ok(['concrete', 'extMetal'].includes(m.sourceMesh.name), m.name);
      const key = m.name.replace(/-(concrete|extMetal)$/, '');
      records.set(key, (records.get(key) || 0) + m.geometry.attributes.position.count);
      assert.ok(m.geometry.attributes.color, `${m.name} 缺顶点色`);
    }
    // 一份模板（两部楼梯、一层）不超过 6000 个三角形
    for (const [k, v] of records) assert.ok(v / 3 < 6000, `${k}: ${v / 3} 三角形`);
    for (const lv of withFlights) {
      ctx.dynamic[0].update(0, 0, { state: { building: b.id, explore: { building: b.id, level: lv.id } } });
      const ys = [];
      for (const m of group.children.filter((q) => q.material === materials.concrete && q.visible)) for (let i = 0; i < m.count; i++) { const mx = new THREE.Matrix4(); m.getMatrixAt(i, mx); ys.push(mx.elements[13]); }
      assert.equal(ys.filter((y) => Math.abs(y - lv.elev) < 1e-5).length, 1, `${id} ${lv.id} 应该恰好一个实例`);
    }
    for (const m of group.children) m.geometry.dispose();
    for (const m of Object.values(materials)) m.dispose();
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
