// 一期样板中庭：洞口逐层退台、扶梯和观光梯落脚不受影响、1F 中庭摆设有碰撞且不挡路。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { buildNav, landAt, step } from '../src/layout/nav.js';
import { findPath } from '../src/fps/pathfinding.js';
import { toW, pointInPoly } from '../src/layout/geom.js';
import clipping from 'polygon-clipping';
import { ATRIUM_STEPS } from '../src/layout/p1-expansion-spec.js';
import { ATRIUM } from '../src/layout/p1-atrium.js';

const nav = buildNav(L);
const P1 = L.buildings.find((b) => b.id === 'P1'), F = P1.rotundas[0].kitF;
const lvl = (id) => L.levels.find((l) => l.id === id);
// 超级商业中心把圆厅、方庭和西北翼的洞口合成一个：原来的洞口记录在合并记录的 parts 里（rect 不变），poly 用合并后的
const part = (lv, id) => { const v = lv.voids.find((x) => x.id === id) || lv.voids.find((x) => x.parts?.some((p) => p.id === id));
  return v && { ...(v.parts?.find((p) => p.id === id) || v), poly: v.poly }; };

test('3F–RF 的中庭洞口逐层加深（两端每层退 3 米、长边每层退 1.5–2.5 米），两部观光梯挪到 6F 洞口两端以外', () => {
  let prev = [17, 10]; // 2F 原样
  for (const [short, hx, half] of ATRIUM_STEPS) {
    const v = part(lvl(`P1-${short}`), 'C-void');
    assert.deepEqual([v.rect.x0, v.rect.x1, v.rect.z0, v.rect.z1], [-hx, hx, -half, half], short);
    // 天台天窗两端故意收到 ±22（沿四翼中轴能走进光穹），只检查 3F–6F 的退台
    if (short !== 'RF') { assert.ok(hx >= prev[0] && half >= prev[1], `${short} 不比下一层小`); prev = [hx, half]; }
  }
  const glass = L.elevators.filter((e) => e.type === 'glass' && e.building === 'P1' && !e.square);
  // 超级商业中心：西观光梯（GW）往外挪 4 米，给圆厅到西北翼的「颈」让路
  assert.deepEqual(glass.map((g) => Math.abs(g.lu)), [34, 30]);
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
    const lv = lvl(`P1-${s}`), v = part(lv, 'SQ-void'), [x0, x1, h] = SQ_STEPS[s];
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

// ---------- 超级商业中心第一步：A、B 楼面，方庭 + 西北翼 + 圆厅一个洞口 ----------
import { NW_FRAME, megaVoidParts } from '../src/layout/p1-mega.js';

test('超级商业中心：6F 一个洞口从方庭直通圆厅（一眼望到头），2F–6F 每层都有西北翼大椭圆', () => {
  const rc = toW(NW_FRAME, 0, 0), sc = [-220, -200];
  const six = lvl('P1-6F').voids.find((v) => pointInPoly(rc, v.poly));
  assert.ok(six && pointInPoly(sc, six.poly), '6F 方庭和圆厅不在同一个洞口里');
  for (const s of ['2F', '3F', '4F', '5F', '6F']) {
    const lv = lvl(`P1-${s}`), { oval } = megaVoidParts(s);
    const c = oval.reduce((a, q) => [a[0] + q[0] / oval.length, a[1] + q[1] / oval.length], [0, 0]);
    assert.ok(lv.voids.some((v) => v.kind === 'atrium' && v.mega && pointInPoly(c, v.poly)), `${s} 没有大椭圆洞口`);
    // 楼板上对应开洞
    assert.ok(lv.slab.pieces[0].holes.some((h) => pointInPoly(c, h)), `${s} 楼板没开洞`);
  }
  // 洞口逐层往外退：上一层的洞口面积比下一层大
  const areaOf = (P) => Math.abs(P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const total = (s) => lvl(`P1-${s}`).voids.filter((v) => v.mega).reduce((n, v) => n + areaOf(v.poly), 0);
  for (const [a, b] of [['2F', '3F'], ['3F', '4F'], ['4F', '5F'], ['5F', '6F']]) assert.ok(total(b) > total(a), `${b} 洞口不比 ${a} 大`);
});

test('超级商业中心：1F 洞口正下方没有铺位（中庭广场），两座庭院喷泉搬进广场且挡人；新铺位门口有走道', () => {
  const lv = lvl('P1-1F'), two = lvl('P1-2F');
  const holes = two.voids.filter((v) => v.mega).map((v) => v.poly);
  for (const u of lv.units) for (const p of u.polys) {
    const c = p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
    assert.ok(!holes.some((h) => pointInPoly(c, h)), `${u.id} 在 2F 洞口正下方`);
  }
  const fountains = L.fidelity.landscape.fountains.filter((f) => f.indoor);
  assert.equal(fountains.length, 2);
  for (const f of fountains) assert.ok(holes.some((h) => pointInPoly([f.x, f.z], h)), `${f.id} 不在中庭广场上`);
  const mega = L.levels.flatMap((l) => l.units.filter((u) => u.mega));
  assert.ok(mega.length >= 45, `新铺位只有 ${mega.length} 家`);
  for (const u of mega) {
    const f = u.wfronts[0], m = [(f.x0 + f.x1) / 2 + f.nx * 1.5, (f.z0 + f.z1) / 2 + f.nz * 1.5], l = lvl(u.level);
    assert.equal(landAt(nav, m[0], m[1], l.elev + 0.6)?.floor, u.level, `${u.id} 门口站不住`);
  }
});

test('超级商业中心：两座天桥换成附楼外墙上的门（2F 到艺文馆、西苑 P1W4），1F 艺文馆南门直通商场，都能双向走过', () => {
  const links = L.fidelity.mega.links;
  assert.deepEqual(links.map((k) => k.id).sort(), ['P1-ART-C', 'P1-ART-W-RETURN', 'P1-MEGA-P1C']);
  assert.ok(!L.extensions.paths.some((p) => p.id === 'P1-ART-C' || p.id === 'P1-ART-W-RETURN'), '桥还在');
  for (const k of links) {
    const e = L.entrances.find((q) => q.id === k.doors[0]), [mx, mz] = [(e.seg.x0 + e.seg.x1) / 2, (e.seg.z0 + e.seg.z1) / 2];
    const a = lvl(e.level), b = lvl(e.to);
    for (const [from, to, sign] of [[a, b, 1], [b, a, -1]]) {
      let s = landAt(nav, mx - e.nx * 2 * sign, mz - e.nz * 2 * sign, from.elev + 0.6);
      assert.equal(s?.floor, from.id, `${k.id} ${from.id} 一侧站不住`);
      for (let i = 0; i < 40; i++) s = step(nav, s, e.nx * 0.1 * sign, e.nz * 0.1 * sign);
      assert.equal(s.floor, to.id, `${k.id} 从 ${from.id} 过不去`);
    }
  }
});

test('楼板三角剖分不补洞：每块楼板剖分出来的面积 = 外轮廓 − 洞（重叠的洞会让 Earcut 把中庭洞口补上，从 1F 往上看成了一整块天花）', async () => {
  const THREE = await import('three');
  const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length]; a += x0 * z1 - x1 * z0; } return Math.abs(a / 2); };
  for (const lv of L.levels.filter((l) => l.building === 'P1')) {
    lv.slab.pieces.forEach((piece, k) => {
      const want = area(piece.outer) - (piece.holes || []).reduce((s, h) => s + area(h), 0);
      const shape = new THREE.Shape(piece.outer.map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const h of piece.holes || []) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
      const g = new THREE.ShapeGeometry(shape, 6), p = g.attributes.position, idx = g.index;
      let got = 0;
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
        got += Math.abs((p.getX(b) - p.getX(a)) * (p.getY(c) - p.getY(a)) - (p.getX(c) - p.getX(a)) * (p.getY(b) - p.getY(a))) / 2;
      }
      assert.ok(Math.abs(got - want) < 2, `${lv.id} 楼板 ${k}：剖分 ${got.toFixed(0)} m²，应为 ${want.toFixed(0)} m²`);
    });
  }
});

test('大椭圆中庭顶上开玻璃天窗：屋面开洞在 6F 洞口里面、不压楼梯电梯；天窗下面一圈屋顶咖啡座和花池都在真屋面上', () => {
  const rf = lvl('P1-RF'), six = lvl('P1-6F'), sky = rf.voids.find((v) => v.id === 'MEGA-sky');
  assert.ok(sky, '屋面没有大天窗');
  const open6 = six.voids.filter((v) => v.kind === 'atrium');
  const ring = (P) => [[...P, P[0]]], areaMP = (mp) => mp.reduce((t, poly) => t + poly.reduce((u, r, i) => { let a = 0; for (let k = 0; k < r.length - 1; k++) a += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1]; return u + (i ? -1 : 1) * Math.abs(a / 2); }, 0), 0);
  const outside = areaMP(clipping.difference([ring(sky.poly)], ...open6.map((v) => [ring(v.poly)])));
  assert.ok(outside < 1, `天窗有 ${outside.toFixed(1)} m² 不在 6F 洞口上方`);
  assert.ok(rf.slab.pieces.some((p) => p.holes.includes(sky.poly)), '屋面楼板没开洞');
  for (const s of L.stairs.filter((x) => x.poly && x.serves.includes('P1-RF'))) assert.ok(!s.poly.some((q) => pointInPoly(q, sky.poly)), `${s.id} 在天窗里`);
  const cinema = rf.features.find((f) => f.type === 'cinema-open');
  assert.ok(cinema && ![[cinema.rect.x0, cinema.rect.z0], [cinema.rect.x1, cinema.rect.z0], [cinema.rect.x1, cinema.rect.z1], [cinema.rect.x0, cinema.rect.z1]].some((q) => pointInPoly(q, sky.poly)), '露天影院压在天窗上');
});
