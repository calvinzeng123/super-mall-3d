// 一期南中庭（layout/p1-south-atrium.js）：2F–6F 一个半径 7.5 米的圆洞，1F 下面是光之树。只在游览布局里有。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { buildNav, clear } from '../src/layout/nav.js';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { pointInPoly, lrectPoly } from '../src/layout/geom.js';
import { SOUTH_ATRIUM } from '../src/layout/p1-south-atrium.js';

const { x, z, r } = SOUTH_ATRIUM;
const lvl = (id) => L.levels.find((l) => l.id === id);
const ring = (R, n = 48) => Array.from({ length: n }, (_, k) => [x + Math.cos(k / n * Math.PI * 2) * R, z + Math.sin(k / n * Math.PI * 2) * R]);

test('南中庭：2F–6F 都开了圆洞（楼板上有洞），1F、屋面不开；FPS 布局没有', () => {
  for (const s of ['2F', '3F', '4F', '5F', '6F']) {
    const lv = lvl(`P1-${s}`), v = lv.voids.find((q) => q.id === 'SOUTH-void');
    assert.ok(v && v.mega && v.kind === 'atrium', `${s} 没有南中庭洞口`);
    assert.ok(lv.slab.pieces.some((p) => (p.holes || []).includes(v.poly)), `${s} 楼板上没挖洞`);
    assert.ok(!lv.walk.some((w) => pointInPoly([x, z], w.poly)), `${s} 洞口中间还是走道`);
  }
  for (const id of ['P1-1F', 'P1-RF']) assert.ok(!lvl(id).voids.some((q) => q.id === 'SOUTH-void'), `${id} 不该开洞`);
  const fps = buildPlayableLayout({ mode: 'fps' });
  assert.ok(!fps.levels.some((l) => l.voids.some((q) => q.id === 'SOUTH-void')), 'FPS 布局不改');
});

test('南中庭：洞口外一圈 ≥ 2.6 米都是走道（不压铺位、楼梯、电梯），洞口边上能站、洞里站不了', () => {
  const nav = buildNav(L);
  const stairPolys = L.stairs.filter((s) => s.building === 'P1').map((s) => lrectPoly(s.frame, s.rect));
  for (const s of ['2F', '3F', '4F', '5F', '6F']) {
    const lv = lvl(`P1-${s}`);
    for (const R of [r + 0.6, r + 1.5, r + 2.6]) for (const p of ring(R)) {
      assert.ok(lv.walk.some((w) => pointInPoly(p, w.poly)), `${s} 洞外 ${R.toFixed(1)} m 处不是走道`);
      assert.ok(!lv.units.some((u) => u.polys.some((q) => pointInPoly(p, q))), `${s} 洞外 ${R.toFixed(1)} m 处压着铺位`);
      assert.ok(!stairPolys.some((q) => pointInPoly(p, q)), `${s} 洞外 ${R.toFixed(1)} m 处压着楼梯`);
    }
    const y = lv.elev;
    assert.ok(!clear(nav, { floor: lv.id, x, z, y, slope: null }), `${s} 洞口中间能站人`);
    for (const p of ring(r + 1.2, 12)) assert.ok(clear(nav, { floor: lv.id, x: p[0], z: p[1], y, slope: null }), `${s} 洞口边 (${p.map((q) => q.toFixed(1))}) 站不了人`);
  }
  // 1F 洞口正下方是走道（光之树花池在渲染里登记成漫游障碍）
  assert.ok(lvl('P1-1F').walk.some((w) => pointInPoly([x, z], w.poly)), '1F 洞口下面不是走道');
});

test('南中庭：洞口边 3 米内没有岛柜、花园、休息区（拿掉的记在 fidelity.mega.southAtrium.dropped）', () => {
  const M = L.fidelity.mega;
  assert.ok(M.southAtrium && M.southAtrium.dropped.length > 0);
  for (const it of M.islands || []) {
    if (!/^P1-[1-6]F$/.test(it.level)) continue;
    const corners = [[it.x - it.hx, it.z - it.hz], [it.x + it.hx, it.z - it.hz], [it.x + it.hx, it.z + it.hz], [it.x - it.hx, it.z + it.hz]];
    assert.ok(corners.every(([px, pz]) => Math.hypot(px - x, pz - z) >= r + 3), `${it.level} 的 ${it.kind} 贴着南中庭`);
  }
});
