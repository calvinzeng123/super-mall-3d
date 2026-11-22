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

// ---------- 第二轮：走廊、防火门扇、安全出口灯、楼层牌朝向、踏步防滑条 ----------
import { corridorSpec, corridorDetails, buildCorridorInstances, exitSign, textRuns, CORRIDOR_PAINT } from '../src/render/build/tower-stairs.js';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav } from '../src/layout/nav.js';
import { buildStairSigns } from '../src/jimao/stairs.js';

test('酒店 / 公寓走廊：两侧户门墙的门洞都认出来；消火栓箱、表箱不压门洞、门套，留在户门墙以内；地下室、首层大堂不画', () => {
  for (const id of ['A', 'H']) {
    const b = tower(id);
    for (const lv of L.levels.filter((l) => l.building === id)) {
      const spec = corridorSpec(b, lv), suites = lv.units?.filter((u) => u.residence?.suitePlan).length || 0;
      if (!suites) { assert.equal(spec, null, `${lv.id} 没有套房，不该有走廊细部`); continue; }
      assert.ok(spec, `${lv.id} 缺走廊细部`);
      assert.equal(spec.sides.reduce((n, s) => n + s.doors.length, 0), suites, `${lv.id} 户门数`);
      for (const s of spec.sides) for (const [a, b2] of s.doors) assert.ok(b2 - a > .8 && b2 - a < 1.2 && a > s.x0 && b2 < s.x1);
      assert.deepEqual(spec.boxes.map((q) => q.kind).sort(), ['hydrant', 'hydrant', 'meter', 'meter'], lv.id);
      for (const q of spec.boxes) {
        const s = spec.sides[q.side];
        assert.ok(q.x - q.w / 2 > s.x0 && q.x + q.w / 2 < s.x1, `${lv.id} ${q.kind} 出了户门墙`);
        for (const [a, b2] of s.doors) assert.ok(q.x + q.w / 2 < a - .15 || q.x - q.w / 2 > b2 + .15, `${lv.id} ${q.kind} 压门洞`);
        for (const o of spec.boxes) if (o !== q && o.side === q.side) assert.ok(Math.abs(o.x - q.x) > (o.w + q.w) / 2, '箱子叠在一起');
      }
    }
  }
  // 典型楼层（3.4 m）共用一份模板
  const A = tower('A'), keys = new Set(L.levels.filter((l) => l.building === 'A' && l.height === 3.4).map((l) => JSON.stringify(corridorSpec(A, l))));
  assert.equal(keys.size, 1);
});

test('走廊细部不进行走身体：凸出户门墙不到 4 cm，门洞净宽里 0.1 m 以上没有东西；只用一个批次（+1 个绘制调用，只在当前楼层上下显示）', () => {
  const A = tower('A'), lv = byId.get('A-12F'), spec = corridorSpec(A, lv), solids = [];
  const rec = { get: () => ({ box: (x, y, z, w, h, d) => solids.push({ x, y, z, w, h, d }) }) };
  corridorDetails(rec, spec, 'plaster');
  assert.ok(solids.length > 60, `走廊细部太少：${solids.length}`);
  for (const o of solids) {
    if (o.y - o.h / 2 > 2.9) continue;   // 吊顶上的烟感
    const s = spec.sides.reduce((p, q) => (Math.abs(q.z - o.z) < Math.abs(p.z - o.z) ? q : p));
    const out = (s.n > 0 ? o.z + o.d / 2 - s.z : s.z - (o.z - o.d / 2));
    assert.ok(out < .045, `凸出墙面 ${out.toFixed(3)} m：x ${o.x.toFixed(2)} y ${o.y.toFixed(2)}`);
    if (o.y + o.h / 2 > .1 && o.y - o.h / 2 < 2.15) for (const [a, b2] of s.doors) assert.ok(o.x + o.w / 2 <= a + .002 || o.x - o.w / 2 >= b2 - .002 || out < -.01, `门洞里有东西 x ${o.x.toFixed(2)}`);
  }
  const materials = Object.fromEntries(['plaster', 'extMetal'].map((k) => [k, new THREE.MeshStandardMaterial()]));
  const group = new THREE.Group(), ctx = { dynamic: [] };
  buildCorridorInstances(ctx, A, L.levels.filter((l) => l.building === 'A').sort((a, z) => a.elev - z.elev), materials, group);
  assert.equal(group.children.length, 0, 'lazy：没去过的楼层不建模板');
  ctx.dynamic[0].update(0, 0, { state: { building: 'A', explore: { building: 'A', level: 'A-12F' } } });
  assert.ok(group.children.length >= 1 && group.children.every((m) => m.material === materials.plaster), '走廊只用刷漆一个批次');
  const shown = group.children.filter((m) => m.visible), tris = shown.reduce((n, m) => n + m.geometry.index.count / 3, 0);
  assert.equal(shown.reduce((n, m) => n + m.count, 0), 3, '当前层和上下各一层');
  assert.ok(tris < 2500, `走廊模板 ${tris} 三角形`);
  for (const m of group.children) m.geometry.dispose();
});

test('防火门扇五金、门头安全出口灯：朝走廊、贴在门扇 / 墙面上，不进门洞；安全出口灯是真实尺寸（≤ 0.32 × 0.16 m）', () => {
  const A = tower('A'), stairs = stairsOf(A), lv = byId.get('A-12F'), spec = stairDetailSpec(A, lv, stairs);
  assert.ok(spec.leaves && !stairDetailSpec(tower('T1'), byId.get('T1-11F'), stairsOf(tower('T1')), L.elevators).leaves, '只有酒店 / 公寓的门扇贴在门外墙上');
  // 门头的安全出口灯
  const signs = [];
  exitSign({ box: (x, y, z, w, h, d, c) => signs.push({ x, y, z, w, h, d, c }) }, 0, 2.53, 4, 1);
  assert.equal(signs.length, 1);
  assert.ok(signs[0].w <= .32 && signs[0].h <= .16 && signs[0].z < 4 && signs[0].z + signs[0].d / 2 <= 4 - .001 + .03, '牌子在墙面外、不厚');
  let quads = 0;
  exitSign({ box: () => {}, shape: (name, p, q, s) => { quads++; const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(q); assert.ok(nrm.z < -.99, '小人朝走廊'); assert.ok(p.z < 4 - .02); } }, 0, 2.53, 4, 1);
  assert.ok(quads >= 12, `小人和门 ${quads} 片`);
  // 门扇五金都在门扇外面（走廊一侧），离门洞边 2 cm 以外
  const off = lv.elev, flights = A.access.flights.filter((f) => f.parentFloor === lv.id).map((f) => ({ ...f, bottom: { ...f.bottom, y: f.bottom.y - off }, top: { ...f.top, y: f.top.y - off } }));
  const surfaces = A.access.surfaces.filter((s) => s.parentFloor === lv.id).map((s) => ({ ...s, elev: s.elev - off }));
  const solids = [], rec = { get: () => ({ box: (x, y, z, w, h, d, c) => solids.push({ x, y, z, w, h, d, c }), bar: () => {} }) };
  buildTowerStairGeometry(rec, { ...A, access: { protected: true, flights, surfaces } }, [], stairs, { enclosures: false, detail: spec });
  const hw = solids.filter((o) => [STAIR_PAINT.lever, STAIR_PAINT.hingeKnuckle, STAIR_PAINT.wiredGlass, STAIR_PAINT.plate].includes(o.c));
  assert.ok(hw.length >= 4 * stairs.length * 2, `门扇五金 ${hw.length}`);
  for (const s of stairs) {
    const dir = towerStairPlan(s).direction, mine = hw.filter((o) => o.x > s.rect.x0 - 1 && o.x < s.rect.x1 + 1 && Math.abs(o.z - s.door.z0) < .2);
    assert.ok(mine.length >= 8, s.id);
    for (const o of mine) {
      assert.ok((o.z - s.door.z0) * dir < -.07, `${s.id} 五金不在门扇外面：z ${o.z.toFixed(3)}`);
      assert.ok(o.x + o.w / 2 <= s.door.x0 - .02 || o.x - o.w / 2 >= s.door.x1 + .02, `${s.id} 五金进了门洞 x ${o.x.toFixed(2)}`);
    }
  }
});

test('踏步：L 形防滑条（踏面一条、踢面上沿一条），踢面比踏面深、偏冷；踏步和平台同一种水泥色', () => {
  const lum = (h) => { const c = new THREE.Color(h); return .2126 * c.r + .7152 * c.g + .0722 * c.b; };
  assert.equal(STAIR_PAINT.tread, STAIR_PAINT.landing);
  assert.ok(lum(STAIR_PAINT.riser) < lum(STAIR_PAINT.tread) - .05);
  const r = new THREE.Color(STAIR_PAINT.riser);
  assert.ok(r.b >= r.r - .01, '踢面偏冷');
  const A = tower('A'), lv = byId.get('A-12F'), stairs = stairsOf(A), spec = stairDetailSpec(A, lv, stairs), off = lv.elev;
  const flights = A.access.flights.filter((f) => f.parentFloor === lv.id).map((f) => ({ ...f, bottom: { ...f.bottom, y: f.bottom.y - off }, top: { ...f.top, y: f.top.y - off } }));
  const nos = [], rec = { get: () => ({ box: (x, y, z, w, h, d, c) => { if (c === STAIR_PAINT.nosing) nos.push({ h, d }); }, bar: () => {} }) };
  buildTowerStairGeometry(rec, { ...A, access: { protected: true, flights, surfaces: [] } }, [], stairs, { enclosures: false, detail: spec });
  const steps = flights.reduce((n, f) => n + f.steps, 0);
  // 每级一条朝上（薄、5.5 cm 深）、一条朝前（2.7 cm 高、薄）
  assert.equal(nos.filter((o) => Math.abs(o.d - .055) < 1e-6).length, steps);
  assert.equal(nos.filter((o) => Math.abs(o.h - .027) < 1e-6).length, steps);
});

test('楼层牌：T1、A 每个楼梯口的牌子背靠背两片，每片都是正面朝外、字不镜像；朝着来人的那片法线和牌子朝向一致', () => {
  const nav = buildNav(buildPlayableLayout({ mode: 'arcade' })), built = buildStairSigns(nav, { doc: null });
  const mine = built.signs.filter((s) => /^(T1|A)-/.test(s.floor));
  assert.ok(mine.length > 60, `${mine.length} 块`);
  const quads = [];
  for (const m of built.root.children) {
    const p = m.geometry.attributes.position.array, uv = m.geometry.attributes.uv.array, idx = m.geometry.index.array;
    for (let k = 0; k < idx.length; k += 6) {
      const v = (i) => new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]), [i0, i1, i2] = [idx[k], idx[k + 1], idx[k + 2]];
      const n = new THREE.Vector3().crossVectors(v(i1).sub(v(i0)), v(i2).sub(v(i0))).normalize();
      const du = uv[i1 * 2] - uv[i0 * 2], U = v(i1).sub(v(i0)).multiplyScalar(Math.sign(du));
      quads.push({ c: v(i0).add(v(i2)).multiplyScalar(.5), n, U });
    }
  }
  for (const s of mine) {
    const at = quads.filter((q) => Math.hypot(q.c.x - s.x, q.c.z - s.z) < .01 && Math.abs(q.c.y - s.y) < .01);
    assert.equal(at.length, 2, `${s.floor} 的牌子应该两片`);
    // 面朝牌子的人（站在法线那一侧）右手方向 = (nz, 0, −nx)：u 从左到右
    for (const q of at) assert.ok(q.U.dot(new THREE.Vector3(q.n.z, 0, -q.n.x)) > 0, `${s.floor} ${s.label} 镜像`);
    assert.ok(at.some((q) => q.n.x * s.nx + q.n.z * s.nz > .99), `${s.floor} 没有朝着来人的那一片`);
  }
  for (const m of built.root.children) m.geometry.dispose();
});

test('没有 document 时字形是空的（只画素色标签条），不抛错', () => {
  assert.equal(textRuns('消火栓'), null);
  for (const c of Object.values(CORRIDOR_PAINT)) assert.match(c, /^#[0-9a-f]{6}$/);
});
