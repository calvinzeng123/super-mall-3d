import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { L } from './helpers.js';
import { toW, toL } from '../src/layout/geom.js';
import { buildNav, clear, step, landAt, floorLabel } from '../src/layout/nav.js';

const nav = buildNav(L);
const homes = L.levels.flatMap(lv => lv.units.filter(u => u.residence?.suitePlan).map(u => ({ lv, u })));
const duplexes = homes.filter(({ u }) => u.residence.duplex);
const state = (lv, u, p, floor = lv.id) => {
  const [x, z] = toW(u.frame, ...p);
  return { floor, x, z, y: nav.floors.get(floor).y, slope: null };
};
function go(s, u, p, audit = null) {
  const [x, z] = toW(u.frame, ...p);
  const dx = x - s.x, dz = z - s.z, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .05));
  for (let i = 0; i < n; i++) {
    const next = step(nav, s, dx / n, dz / n);
    if (audit) audit(s, next);
    s = next;
  }
  return s;
}
const reached = (s, u, p) => Math.hypot(...toL(u.frame, s.x, s.z).map((v, i) => v - p[i])) < .025;

test('模型套房覆盖酒店公寓400户和30套夹层，住宅大堂改造后合计748住户', () => {
  assert.equal(homes.length, 400);
  assert.equal(duplexes.length, 30);
  assert.ok(duplexes.every(({ lv }) => ['H-1F','A-1F','A-20F'].includes(lv.id) && lv.height === 6.5));
  assert.equal(L.levels.filter(l => l.building === 'H' && l.levelNumber).length, 20);
  assert.equal(L.levels.filter(l => l.building === 'A' && l.levelNumber).length, 20);
  assert.equal(L.levels.filter(l => ['H', 'A', 'R1', 'R2', 'R3', 'R4'].includes(l.building)).flatMap(l => l.units).length, 748);
  const streetLandings = L.buildings.reduce((n, b) => n + (b.access?.surfaces.length || 0), 0) + (L.bridges?.access?.surfaces.length || 0);
  assert.equal(nav.floors.size, L.levels.length + 2 + 30 + streetLandings);
});

test('30套复式从入户经新侧门逐步上下楼，可达夹层床侧和书桌，再回到原层', () => {
  for (const { lv, u } of duplexes) {
    const d = u.residence.duplex;
    let s = state(lv, u, [5.5, -.8]), climbed = 0, descended = 0;
    const audit = (a, b) => {
      assert.ok(clear(nav, b), `${u.id} 行走离开支撑面`);
      assert.ok(Math.abs(a.y - b.y) < .04, `${u.id} 楼梯出现高度跳变`);
      if (b.y > a.y) climbed++;
      if (b.y < a.y) descended++;
    };
    for (const p of [[5.5, .65], [9.55, .65], [9.55, 7.5], [9.55, 11.8], [4.95, 11.8], [9.15, 11.8], [9.15, 12.7]]) {
      s = go(s, u, p, audit);
      assert.ok(reached(s, u, p), `${u.id} 未抵达 ${p}`);
    }
    assert.equal(s.floor, d.surface.id);
    assert.equal(s.y, lv.elev + 3.05);
    assert.ok(floorLabel(nav, L, s).includes('夹层'));
    for (const p of [[9.15, 11.8], [9.55, 11.8], [9.55, 7.5], [9.55, .65], [5.5, .65], [5.5, -.8]]) {
      s = go(s, u, p, audit);
      assert.ok(reached(s, u, p), `${u.id} 返回时未抵达 ${p}`);
    }
    assert.equal(s.floor, lv.id);
    assert.equal(s.y, lv.elev);
    assert.ok(climbed > 90 && descended > 90, `${u.id} 未实际沿梯段往返`);
  }
});

test('在夹层下方行走保持原层，飞行落地仅在指定高度以下寻找支撑', () => {
  for (const { lv, u } of duplexes) {
    const d = u.residence.duplex;
    let s = state(lv, u, [8.4, 11.5]);
    assert.ok(clear(nav, s));
    s = go(s, u, [9.3, 13]);
    assert.ok(reached(s, u, [9.3, 13]));
    assert.equal(s.floor, lv.id);
    assert.equal(s.y, lv.elev);
    const low = landAt(nav, s.x, s.z, lv.elev + 2.5);
    assert.equal(low.floor, lv.id);
    const high = landAt(nav, s.x, s.z, lv.elev + 4);
    assert.equal(high.floor, d.surface.id);
    const [sx, sz] = toW(u.frame, 9.55, 3.7);
    assert.ok(!clear(nav, state(lv, u, [9.55, 3.7])), '不能站进楼梯实体内部');
    const onStair = landAt(nav, sx, sz, lv.elev + 4);
    assert.equal(onStair.slope.id, d.stair.id);
    assert.ok(Math.abs(onStair.y - lv.elev - 1.525) < 1e-6);
  }
});

test('夹层护栏阻止侧向跌落，楼梯实体阻止下层横穿，户间仍然隔离', () => {
  for (const { lv, u } of duplexes) {
    const d = u.residence.duplex;
    let s = state(lv, u, [6, 7.5], d.surface.id);
    s = go(s, u, [6, 5.4]);
    assert.equal(s.floor, d.surface.id);
    assert.equal(s.slope, null);
    assert.ok(toL(u.frame, s.x, s.z)[1] >= 6.69);
    s = state(lv, u, [8.25, 3.5]);
    assert.ok(clear(nav, s));
    s = go(s, u, [10.5, 3.5]);
    assert.equal(s.floor, lv.id);
    assert.equal(s.slope, null);
    assert.ok(toL(u.frame, s.x, s.z)[0] <= 8.51);
    s = state(lv, u, [10.5, 12]);
    s = go(s, u, [12, 12]);
    assert.ok(toL(u.frame, s.x, s.z)[0] <= 10.71);
  }
});

test('导入家具占地不可站立，电视墙东端的真实走道保持通行', () => {
  for (const { lv, u } of [homes[0], homes[1], homes.find(h => h.lv.id === 'A-2F')]) {
    for (const o of u.residence.obstacles) {
      const r = o.rect;
      assert.ok(!clear(nav, state(lv, u, [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2])), `${u.id}/${o.id} 家具可穿入`);
    }
    let s = state(lv, u, [5.46, .8]);
    for (const p of [[5.46, 4.9], [4.05, 4.9], [4.05, 8.4]]) {
      s = go(s, u, p);
      assert.ok(reached(s, u, p), `${u.id} 电视墙绕行失败 ${p}`);
    }
    s = state(lv, u, [.75, 11.2]);
    assert.ok(clear(nav, s));
    s = go(s, u, [.75, 9.5]);
    assert.ok(toL(u.frame, s.x, s.z)[1] >= 10.81, `${u.id} 从后庭进入封闭检修缝`);
  }
});

test('套房从玄关绕过电视墙进入独卫，并真正通过湿区及WC玻璃门', () => {
  for (const { lv, u } of [homes[0], homes[1], homes.find(h => h.lv.id === 'A-2F')]) {
    let s = state(lv, u, [5.46, .8]);
    // Bath entry, WC entrance (shifted 0.05m past the vanity), wetroom and
    // shower circulation all use their surveyed openings, in both orientations.
    for (const p of [[5.46, 4.95], [3.95, 4.95], [3.95, 3.425], [3.95, 2.2], [3.95, 3.425], [3.2, 3.425], [3.2, 2.15]]) {
      s = go(s, u, p);
      assert.ok(reached(s, u, p), `${u.id} 独卫路径被挡 ${p}`);
      assert.ok(clear(nav, s));
    }
  }
});

test('夹层复制床的实物尺寸及床头墙、两侧床头柜与导航占地一致', () => {
  const bytes = fs.readFileSync(new URL('../assets/models/user-suite-processed.glb', import.meta.url));
  const model = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const sourceBed = model.nodes.find(n => n.name?.startsWith('Bed ') && n.mesh !== undefined);
  const positions = model.meshes[sourceBed.mesh].primitives.map(p => model.accessors[p.attributes.POSITION]);
  const lo = [0, 1, 2].map(k => Math.min(...positions.map(p => p.min[k])));
  const hi = [0, 1, 2].map(k => Math.max(...positions.map(p => p.max[k])));
  for (const { lv, u } of duplexes) {
    const d = u.residence.duplex, bed = d.beds[0];
    // Source rotateY(+PI/2) maps source depth to local width.
    assert.ok(Math.abs(bed.w - (hi[2] - lo[2])) < 1e-5);
    assert.ok(Math.abs(bed.d - (hi[0] - lo[0])) < 1e-5);
    const localBed = u.residence.beds[0];
    assert.ok(Math.abs(localBed.x - (lo[2] + hi[2]) / 2 - 1.45) < 1e-5);
    assert.ok(Math.abs(localBed.z - (10.35 - (lo[0] + hi[0]) / 2)) < 1e-5);
    const probe = state(lv, u, [bed.x + bed.w / 2 + .2, bed.z], d.surface.id);
    assert.ok(!clear(nav, probe), `${u.id} 身体穿入真实床沿`);
    for (const id of ['upper-headboard-wall', 'upper-nightstand-window', 'upper-nightstand-entry']) {
      const obstacle = d.obstacles.find(o => o.id === id);
      assert.ok(obstacle, `${u.id} 漏掉复制的${id}`);
      const r = obstacle.rect;
      assert.ok(!clear(nav, state(lv, u, [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2], d.surface.id)));
    }
  }
});
