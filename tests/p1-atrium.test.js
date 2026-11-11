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

test('3F–RF 的中庭洞口逐层加深（两端每层退 3 米、长边每层退 1.5–2.5 米），两部观光梯挪到 6F 洞口两端以外', () => {
  let prev = [17, 10]; // 2F 原样
  for (const [short, hx, half] of ATRIUM_STEPS) {
    const v = lvl(`P1-${short}`).voids.find((x) => x.id === 'C-void');
    assert.deepEqual([v.rect.x0, v.rect.x1, v.rect.z0, v.rect.z1], [-hx, hx, -half, half], short);
    // 天台天窗两端故意收到 ±22（沿四翼中轴能走进光穹），只检查 3F–6F 的退台
    if (short !== 'RF') { assert.ok(hx >= prev[0] && half >= prev[1], `${short} 不比下一层小`); prev = [hx, half]; }
  }
  const glass = L.elevators.filter((e) => e.type === 'glass' && e.building === 'P1' && !e.square);
  assert.deepEqual(glass.map((g) => Math.abs(g.lu)), [30, 30]);
  for (const g of glass) for (const f of g.serves) assert.ok(lvl(f).voids.some((v) => v.kind === 'shaft' && pointInPoly([g.x, g.z], v.poly)), `${g.id} ${f} 没有井道`);
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

// ---------- 云澜大中庭第一轮：方庭 ----------
import { SQ_STEPS, SQ_DECKS, SQ_GLASS, WATERFALL } from '../src/layout/square-atrium.js';
import { F_SQ } from '../src/layout/square.js';

test('方庭大中庭：2F–6F 洞口每层都比下一层大（南北每层退 2.5 米），观景台是楼板（能站人）', () => {
  let prev = null;
  for (const s of ['2F', '3F', '4F', '5F', '6F']) {
    const lv = lvl(`P1-${s}`), v = lv.voids.find((x) => x.id === 'SQ-void'), [x0, x1, h] = SQ_STEPS[s];
    assert.deepEqual([v.rect.x0, v.rect.x1, v.rect.z1], [x0, x1, h], s);
    if (prev) assert.ok(h - prev[2] >= 2.5 && x1 > prev[1], `${s} 没有退台`);
    prev = SQ_STEPS[s];
    const d = SQ_DECKS[s], [cx, cz] = toW(F_SQ, (d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2);
    assert.ok(!pointInPoly([cx, cz], v.poly), `${s} 观景台在洞口里`);
    assert.equal(landAt(nav, cx, cz, lv.elev + 0.6)?.floor, lv.id, `${s} 观景台站不住`);
  }
});

test('方庭大中庭：东端交叉扶梯 1F→6F 连续，每一头都走得到；两部观光梯 1F 到天台，每层门口走得到；瀑布水池挡人', () => {
  const hubOf = (lv) => { const [x, z] = toW(F_SQ, 40, -20); return landAt(nav, x, z, lv.elev + 0.6); };
  const stack = L.escalators.filter((e) => e.square && /SQ-X\d-U$/.test(e.id)).sort((a, b) => a.bottom.y - b.bottom.y);
  assert.deepEqual(stack.map((e) => [e.from, e.to]), [['P1-1F', 'P1-2F'], ['P1-2F', 'P1-3F'], ['P1-3F', 'P1-4F'], ['P1-4F', 'P1-5F'], ['P1-5F', 'P1-6F']]);
  for (const e of L.escalators.filter((q) => q.square && /SQ-X/.test(q.id))) for (const [end, id, s] of [[e.bottom, e.from, -1], [e.top, e.to, 1]]) {
    const dx = e.top.x - e.bottom.x, dz = e.top.z - e.bottom.z, d = Math.hypot(dx, dz), lv = lvl(id);
    const p = landAt(nav, end.x + (dx / d) * 1.5 * s, end.z + (dz / d) * 1.5 * s, lv.elev + 0.6);
    assert.ok(p && findPath(nav, p, hubOf(lv), { maxNodes: 12000, cellSize: 0.8 }), `${e.id} ${id}`);
  }
  for (const [id] of SQ_GLASS) {
    const g = L.elevators.find((e) => e.id === `P1-SQ-${id}`);
    assert.deepEqual([g.serves[0], g.serves.at(-1)], ['P1-1F', 'P1-RF']);
    for (const f of g.serves) {
      const lv = lvl(f), p = landAt(nav, g.x + g.nx * 1.8, g.z + g.nz * 1.8, lv.elev + 0.6);
      assert.ok(p && findPath(nav, p, f === 'P1-RF' ? p : hubOf(lv), { maxNodes: 12000, cellSize: 0.8 }), `${g.id} ${f}`);
    }
  }
  const p = WATERFALL.pool, [cx, cz] = toW(F_SQ, (p.x0 + p.x1) / 2, 0);
  let s = landAt(nav, ...toW(F_SQ, p.x1 + 4, 0), 0.6);
  for (let i = 0; i < 80; i++) { const dx = cx - s.x, dz = cz - s.z, d = Math.hypot(dx, dz); if (d < 1e-3) break; s = step(nav, s, (dx / d) * 0.1, (dz / d) * 0.1, 0.03); }
  assert.ok(toW(F_SQ, p.x1, 0)[0] - s.x < 0.1 || Math.hypot(s.x - cx, s.z - cz) > 3, '走进了瀑布水池');
});
