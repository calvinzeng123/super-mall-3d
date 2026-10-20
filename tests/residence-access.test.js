// 使用真实 NAV 半径与 step 扫掠检验套内通行，不把没有隔墙当作“可达”。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { toW, toL } from '../src/layout/geom.js';
import { buildNav, clear, step, NAV } from '../src/layout/nav.js';

const nav = buildNav(L);
const homes = L.levels.flatMap((lv) => lv.units.filter((u) => u.residence).map((u) => ({ lv, u })));
const state = (lv, u, x, z) => {
  const p = toW(u.frame, x, z);
  return { floor: lv.id, x: p[0], z: p[1], y: lv.elev, slope: null };
};
function walk(from, to) {
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .1));
  const dx = (to.x - from.x) / n, dz = (to.z - from.z) / n;
  let s = from;
  for (let i = 0; i < n; i++) s = step(nav, s, dx, dz);
  return s;
}
const near = (a, b, eps = .035) => a.floor === b.floor && !a.slope && Math.hypot(a.x - b.x, a.z - b.z) < eps;

test('全部728套的入户门与内部卧室/卫浴门均有双侧净空且能实际穿越', () => {
  assert.equal(homes.length, 728);
  let partitionDoors = 0;
  for (const { lv, u } of homes) {
    const entry = u.residence.entryDoor;
    const outside = state(lv, u, entry.at, -.8), inside = state(lv, u, entry.at, .8);
    assert.ok(clear(nav, outside) && clear(nav, inside), `${u.id} 入户门两侧无站立净空`);
    assert.ok(near(walk(outside, inside), inside), `${u.id} 入户门不能实际穿越`);
    for (const p of u.residence.partitions.filter((p) => p.door)) {
      const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], len = Math.hypot(dx, dz);
      const cx = p.a[0] + dx * p.door.at / len, cz = p.a[1] + dz * p.door.at / len;
      // Source wetroom has a 0.61m clear strip beside the bathtub: sample just
      // beyond the body radius rather than placing the probe inside furniture.
      const offset = NAV.r + .005, nx = -dz / len, nz = dx / len;
      // The WC vanity reaches the door's centre line. The surveyed 0.70m door
      // remains passable 0.05m toward its lower jamb; probe only within the
      // opening's actual body-clear centre band, without widening the doorway.
      const band = Math.max(0, p.door.width / 2 - NAV.r);
      const pass = [0, -band, band].some(shift => {
        const px = cx + dx * shift / len, pz = cz + dz * shift / len;
        const a = state(lv, u, px - nx * offset, pz - nz * offset);
        const b = state(lv, u, px + nx * offset, pz + nz * offset);
        return clear(nav, a) && clear(nav, b) && near(walk(a, b), b) && near(walk(b, a), a);
      });
      assert.ok(pass, `${u.id} 门(${cx},${cz})缺少可双向穿越的真实净空`);
      partitionDoors++;
    }
  }
  assert.ok(partitionDoors >= 1400, `仅审计${partitionDoors}扇套内门`);
});

// 每种套内平面、框架朝向都选真实单元，走动边由真实0.1m step组成；
// 搜索限制在阳台前部，避免经共享阳台绕进卧室掩盖正门/走廊问题。
const templates = new Map();
for (const home of homes) {
  const { u } = home;
  const key = `${u.residence.kind}/${u.residence.prototype || u.residence.type}/${u.frame.a.toFixed(3)}`;
  if (!templates.has(key)) templates.set(key, home);
}

test('全部酒店、公寓及三种住宅模板从入户点经套内走道可达每间卧室和卫生间', () => {
  const testedTypes = new Set();
  for (const [template, { lv, u }] of templates) {
    testedTypes.add(`${u.residence.kind}/${u.residence.prototype || u.residence.type}`);
    if (u.residence.prototype) {
      // The model audit supplies routes through actual 0.6m body clearance,
      // including curved fixtures and the open door leaves. Verify each route
      // with real step calls; a coarse replacement BFS would miss those gaps.
      for (const zone of u.residence.rooms.filter(r => ['bedroom', 'bathroom'].includes(r.kind))) {
        const target = u.residence.navigationTargets.find(t => t.id === zone.id);
        assert.ok(target?.path.length > 1, `${template} 缺少${zone.id}真实模型路径`);
        let s = state(lv, u, ...target.path[0]);
        assert.ok(clear(nav, s));
        for (const p of target.path.slice(1)) {
          const goal = state(lv, u, ...p);
          assert.ok(clear(nav, goal), `${template}/${zone.id} 路径点被模型挡住 ${p}`);
          s = walk(s, goal);
          assert.ok(near(s, goal, .055), `${template}/${zone.id} 实际移动被挡住 ${p}`);
        }
      }
      continue;
    }
    // The surveyed suite foyer turns between a console and bench (0.623m
    // minimum gap). Its valid centre line is x5.46, off the old 0.25m grid.
    const spacing = u.residence.suitePlan ? .05 : .25;
    const originX = u.residence.suitePlan ? 5.46 : u.residence.entryDoor.at, originZ = .8;
    const bounds = u.rects[0];
    const balcony = u.residence.rooms.find((r) => r.kind === 'balcony');
    const maxZ = balcony ? balcony.rect.z0 - NAV.r - .03 : bounds.z1 - NAV.r;
    const toState = (ix, iz) => state(lv, u, originX + ix * spacing, originZ + iz * spacing);
    const key = (ix, iz) => `${ix},${iz}`;
    const seen = new Set(['0,0']), queue = [[0, 0]];
    const reached = [];
    for (let index = 0; index < queue.length; index++) {
      const [ix, iz] = queue[index];
      const s0 = toState(ix, iz);
      reached.push(toL(u.frame, s0.x, s0.z));
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = ix + dx, z = iz + dz, k = key(x, z);
        if (seen.has(k)) continue;
        const localX = originX + x * spacing, localZ = originZ + z * spacing;
        if (localX < bounds.x0 + NAV.r || localX > bounds.x1 - NAV.r || localZ < .4 || localZ > maxZ) continue;
        const goal = toState(x, z);
        if (!clear(nav, goal) || !near(walk(s0, goal), goal)) continue;
        seen.add(k); queue.push([x, z]);
      }
    }
    for (const zone of u.residence.rooms.filter((r) => ['bedroom', 'bathroom'].includes(r.kind))) {
      const r = zone.rect;
      const ok = reached.some(([x, z]) => x > r.x0 + .4 && x < r.x1 - .4 && z > r.z0 + .4 && z < r.z1 - .4);
      assert.ok(ok, `${template} ${u.id} 无法从入户门到达 ${zone.id}`);
    }
  }
  for (const type of ['residential/01', 'residential/02', 'residential/03', 'hotel/king-suite', 'apartment/serviced-suite']) {
    assert.ok(testedTypes.has(type), `缺少${type}模板审计`);
  }
});

test('套内实墙在非门洞处阻挡移动，卫浴与卧室不是仅视觉隔墙', () => {
  let checked = 0;
  const checkedTemplates = new Set();
  for (const [template, { lv, u }] of templates) {
    for (const p of u.residence.partitions.filter((p) => p.door)) {
      const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], len = Math.hypot(dx, dz);
      const solidEnd = p.door.at - p.door.width / 2;
      if (solidEnd < NAV.r * 2 + .1) continue;
      const nx = -dz / len, nz = dx / len, offset = NAV.r + (u.residence.prototype ? .15 : .005);
      // A solid panel may be backed by a real cabinet. Pick an unobstructed
      // probe pair where possible; occupied points are covered by obstacle QA.
      for (let t = NAV.r + .01; t < solidEnd - NAV.r; t += .1) {
        const cx = p.a[0] + dx * t / len, cz = p.a[1] + dz * t / len;
        const a = state(lv, u, cx - nx * offset, cz - nz * offset), b = state(lv, u, cx + nx * offset, cz + nz * offset);
        if (!clear(nav, a) || !clear(nav, b)) continue;
        assert.ok(!near(walk(a, b), b), `${template} 穿过${JSON.stringify(p)}实墙`);
        checked++; checkedTemplates.add(template); break;
      }
    }
  }
  assert.ok(checked >= 6, `仅检查${checked}片可双侧站立的实墙`);
  for (const template of templates.keys()) assert.ok(checkedTemplates.has(template), `${template}没有验证实际实墙阻挡`);
});
