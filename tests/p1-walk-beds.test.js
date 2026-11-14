// 一期走道弧形花坛（layout/p1-walk-beds.js）：2F–6F 宽走道上的月牙形花坛，是导航障碍，人流从两边绕。只在游览布局里有。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { buildNav, clear } from '../src/layout/nav.js';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { pointInPoly } from '../src/layout/geom.js';
import { levelPaths } from '../src/render/paths.js';

const beds = L.fidelity.mega.beds;
const lvl = (id) => L.levels.find((l) => l.id === id);

test('弧形花坛：2F–6F 每层都有，是弯的（中线弓起来），记成导航障碍；FPS 布局没有', () => {
  assert.ok(beds.length >= 20, `只有 ${beds.length} 个`);
  for (const s of ['2F', '3F', '4F', '5F', '6F']) assert.ok(beds.some((b) => b.level === `P1-${s}`), `${s} 没有花坛`);
  for (const b of beds) {
    const [a, m, c] = [b.line[0], b.line[Math.floor(b.line.length / 2)], b.line.at(-1)];
    const chord = Math.hypot(c[0] - a[0], c[1] - a[1]), dev = Math.abs((c[0] - a[0]) * (a[1] - m[1]) - (a[0] - m[0]) * (c[1] - a[1])) / chord;
    assert.ok(dev > 0.8, `${b.id} 不弯（弓高 ${dev.toFixed(2)}）`);
    assert.ok(lvl(b.level).navObstacles.some((o) => o.id === b.id && o.poly === b.poly), `${b.id} 不是导航障碍`);
  }
  const fps = buildPlayableLayout({ mode: 'fps' });
  assert.ok(!fps.fidelity?.mega?.beds && !fps.levels.some((l) => (l.navObstacles || []).some((o) => /-bed-/.test(o.id))), 'FPS 布局不改');
});

test('弧形花坛：外面 2.6 m 一圈都是走道（不贴店门、栏板、洞口），人流离中线 ≥ 半宽 + 2.2 m', () => {
  const P = levelPaths(L);
  for (const b of beds) {
    const lv = lvl(b.level);
    const ok = (x, z) => lv.walk.some((w) => pointInPoly([x, z], w.poly)) && !lv.voids.some((v) => pointInPoly([x, z], v.poly)) && !lv.units.some((u) => u.polys.some((q) => pointInPoly([x, z], q)));
    for (const [x, z, hw] of b.line) {
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; assert.ok(ok(x + Math.cos(a) * (hw + 2.6), z + Math.sin(a) * (hw + 2.6)), `${b.id} 外面不是走道`); }
      for (const path of P[b.level].people) for (const q of path.pts) assert.ok(Math.hypot(q[0] - x, q[2] - z) > hw + 2.2, `${b.id} 压在人流 ${path.name} 上`);
    }
  }
});

test('弧形花坛：站不上去，走过去被挡住，旁边能站', () => {
  const nav = buildNav(L);
  for (const b of beds.filter((_, i) => i % 3 === 0)) {
    const lv = lvl(b.level), y = lv.elev, [x, z, hw] = b.line[Math.floor(b.line.length / 2)];
    assert.ok(!clear(nav, { floor: lv.id, x, z, y, slope: null }), `${b.id} 中间能站人`);
    // 法向（中线中点两侧）：离开半宽 + 1.4 m 能站
    const [px, pz] = b.line[Math.floor(b.line.length / 2) + 1], tx = px - x, tz = pz - z, tl = Math.hypot(tx, tz);
    const nx = -tz / tl, nz = tx / tl;
    assert.ok(clear(nav, { floor: lv.id, x: x + nx * (hw + 1.4), z: z + nz * (hw + 1.4), y, slope: null }), `${b.id} 旁边站不了人`);
  }
});
