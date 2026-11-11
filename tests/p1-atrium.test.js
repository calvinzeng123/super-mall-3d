// 一期样板中庭：洞口逐层退台、扶梯和观光梯落脚不受影响、1F 中庭摆设有碰撞且不挡路。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { buildNav, landAt, step } from '../src/layout/nav.js';
import { findPath } from '../src/fps/pathfinding.js';
import { toW, pointInPoly } from '../src/layout/geom.js';
import { ATRIUM_STEPS } from '../src/layout/p1-expansion-spec.js';
import { ATRIUM } from '../src/layout/p1-atrium.js';

const nav = buildNav(L);
const P1 = L.buildings.find((b) => b.id === 'P1'), F = P1.rotundas[0].kitF;
const lvl = (id) => L.levels.find((l) => l.id === id);

test('3F–RF 的中庭洞口逐层加深（退台），长边固定在两部观光梯门口', () => {
  let prev = 10; // 2F 原样
  for (const [short, half] of ATRIUM_STEPS) {
    const v = lvl(`P1-${short}`).voids.find((x) => x.id === 'C-void');
    assert.deepEqual([v.rect.x0, v.rect.x1, v.rect.z0, v.rect.z1], [-17, 17, -half, half], short);
    assert.ok(half >= prev, `${short} 不比下一层小`); prev = half;
  }
  for (const g of L.elevators.filter((e) => e.type === 'glass' && e.building === 'P1')) assert.equal(Math.abs(g.lu), 15.5);
});

test('扶梯两端都落在楼板上，离洞口至少 1.5 米', () => {
  for (const lv of L.levels.filter((l) => l.building === 'P1' && ATRIUM_STEPS.some(([s]) => l.id === `P1-${s}`))) {
    const v = lv.voids.find((x) => x.id === 'C-void');
    for (const e of L.escalators) for (const [p, id] of [[e.top, e.to], [e.bottom, e.from]]) {
      if (id !== lv.id) continue;
      assert.ok(!pointInPoly([p.x, p.z], v.poly), `${e.pair} 落在 ${lv.id} 洞口里`);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        assert.ok(!pointInPoly([p.x + Math.cos(a) * 1.5, p.z + Math.sin(a) * 1.5], v.poly) || Math.hypot(p.x - toW(F, 0, 0)[0], p.z - toW(F, 0, 0)[1]) > 20, `${e.pair}@${lv.id}`);
      }
    }
  }
});

test('1F 中庭：喷泉、跌水、树形柱、花池挡人；四个翼楼口、两扇门、服务台之间都走得通', () => {
  const at = (u, v) => { const [x, z] = toW(F, u, v); return landAt(nav, x, z, 0.6); };
  for (const [u, v, r] of [[ATRIUM.fountain.u, ATRIUM.fountain.v, ATRIUM.fountain.r], [ATRIUM.cascade.u, ATRIUM.cascade.v, ATRIUM.cascade.rz], ...ATRIUM.columns.map((c) => [c.u, c.v, c.r]), ...ATRIUM.palms.map((p) => [p.u, p.v, p.r])]) {
    // 从 4 米外朝中心直走，停在边上
    let s = at(u, v + (v > 0 ? r + 3.5 : -(r + 3.5))); const [cx, cz] = toW(F, u, v);
    for (let i = 0; i < 80; i++) { const dx = cx - s.x, dz = cz - s.z, d = Math.hypot(dx, dz); if (d < 1e-3) break; s = step(nav, s, (dx / d) * 0.1, (dz / d) * 0.1, 0.03); }
    assert.ok(Math.hypot(s.x - cx, s.z - cz) > r, `走进了 (${u}, ${v})`);
  }
  const pts = [[30, 0], [-30, 0], [-15, 27], [-15, -27], [15, 26], [15, -26], [19, -9.5]];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
    assert.ok(findPath(nav, at(...pts[i]), at(...pts[j]), { maxNodes: 12000, cellSize: 0.8 }), `${pts[i]} → ${pts[j]}`);
});
