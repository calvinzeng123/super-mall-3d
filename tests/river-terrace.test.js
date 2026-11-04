// 云澜江景台：一期 3F 北侧江景露台与玻璃挑台；北苑消防登高面前方进深 ≤ 4 m，登高场地上空不建任何东西。
import test from 'node:test';
import assert from 'node:assert/strict';
import clipping from 'polygon-clipping';
import { L, lvl, standable, walkNav } from './helpers.js';
import { rect, rectPoly, polyBounds, polyArea, pointInPoly, toW, distToPolyEdge } from '../src/layout/geom.js';
import { NORTH_SITE } from '../src/layout/community-sites.js';
import { RIVER_TERRACE, freeIntervals, riverTerraceGeometry, riverTerraceFrontages } from '../src/layout/river-terrace.js';
import { buildNav } from '../src/layout/nav.js';
import { expansionTerraceEdges, terraceSupports } from '../src/render/build/p1-expansion.js';

const lv = lvl('P1-3F'), T = lv.riverTerrace, p1c3 = lvl('P1C-3F');
const ring = p => [...p, p[0]];
const overlap = (a, b) => clipping.intersection([ring(a)], [ring(b)]).reduce((s, q) => s + Math.abs(polyArea(q[0])) - q.slice(1).reduce((t, h) => t + Math.abs(polyArea(h)), 0), 0);
const north = L.buildings.filter(b => b.community === 'north');
const frontages = north.length ? north.map(b => b.fireFrontage) : NORTH_SITE.towers.map(t => t.plate);
const hardstands = [...(north.length ? north.map(b => b.hardstand) : NORTH_SITE.towers.map(t => t.hardstand)), ...(L.site.fireAccess || []).map(f => f.rect)];
let nav;
const getNav = () => (nav ||= buildNav(L));

test('江景台面积与形状：石材露台 1,385–1,396㎡、两座玻璃挑台、合计 ≥ 1,460㎡，全部在方庭北立面与 P1C 之间', () => {
  assert.ok(T, 'P1-3F.riverTerrace');
  assert.equal(T.name, '云澜江景台');
  assert.deepEqual(T.frontages, frontages, '露台读取北苑消防登高面');
  assert.deepEqual(riverTerraceFrontages(L).frontages, frontages);
  assert.deepEqual(T.free, [[-280, -279], [-241, -229], [-195, -153]]);
  assert.deepEqual(freeIntervals(frontages), T.free);
  assert.ok(T.area >= 1385 && T.area <= 1396, `石材露台 ${T.area.toFixed(1)}㎡`);
  assert.equal(T.prows.length, 2);
  assert.deepEqual(T.prows.map(p => [p.id, p.rect]), [['RT-PROW-1', rect(-239, -255.5, -231, -252)], ['RT-PROW-2', rect(-182, -255.5, -166, -252)]]);
  assert.deepEqual(T.prows.map(p => p.area), [28, 56]);
  assert.ok(T.area + T.prowArea >= 1460, `合计 ${(T.area + T.prowArea).toFixed(1)}㎡`);
  for (const p of [...T.pieces.flatMap(q => [q.outer, ...q.holes]), ...T.prows.map(q => q.poly)]) for (const [x, z] of p)
    assert.ok(x >= -280 - 1e-6 && x <= -105 + 1e-6 && z >= -255.5 - 1e-6 && z <= -240 + 1e-6, `顶点 (${x}, ${z})`);
  // Prow rule: min(16, w − 4), none narrower than 6 m.
  const g = riverTerraceGeometry(L, [[-280, -230], [-226, -153]]);
  assert.ok(g.prows.every(p => p.rect.x1 - p.rect.x0 >= RIVER_TERRACE.prowMin), '窄于 6 m 的挑台应被跳过');
});

test('北苑消防：登高面 ±1 m 内露台不超出 z −244，登高场地与其上空完全不被露台或挑台覆盖', () => {
  for (const [a, b] of frontages) for (const p of T.pieces) {
    const front = rectPoly(rect(a - 1, -260, b + 1, -244.01));
    assert.ok(overlap(p.outer, front) < 1e-6, `登高面 ${a}..${b} 前方露台进深超过 4 m`);
  }
  assert.ok(hardstands.length >= 2);
  for (const h of hardstands) {
    const hs = rectPoly(h);
    for (const p of T.pieces) assert.ok(overlap(p.outer, hs) < 1e-6, `露台压在登高场地 ${JSON.stringify(h)} 上空`);
    for (const p of T.prows) assert.ok(overlap(p.poly, hs) < 1e-6, `${p.id} 压在登高场地上空`);
  }
});

test('露台不与其他楼体重叠，P1C 的 3F 楼板已扣除；石材进楼板、走道与露台列表，玻璃挑台只进导航面', () => {
  for (const b of L.buildings.filter(b => !['P1', 'P1C'].includes(b.id) && b.kind !== 'metro' && !b.undergroundOnly))
    for (const p of T.pieces) assert.ok(overlap(p.outer, b.outline) < 0.01, `露台与 ${b.id} 重叠`);
  for (const p of T.pieces) for (const s of p1c3.slab.pieces) assert.ok(overlap(p.outer, s.outer) < 0.01, '露台与 P1C-3F 楼板重叠');
  for (const p of T.pieces) {
    assert.ok(lv.slab.pieces.some(s => s.outer === p.outer && s.riverTerrace));
    assert.ok(lv.walk.some(w => w.poly === p.outer && w.kind === 'deck' && w.outdoor));
    assert.ok(lv.expansion.terraces.includes(p.outer) && lv.expansion.terrace.floorPolys.includes(p.outer) && lv.expansion.floorPolys.includes(p.outer));
    assert.equal(lv.expansion.terraces.filter(q => q === p.outer).length, 1, '露台重复登记');
  }
  assert.equal(lv.expansion.terrace.pieces, undefined, '不得设置 terrace.pieces');
  for (const pr of T.prows) {
    assert.ok(lv.navSurfaces.some(s => s.id === pr.id && s.kind === 'glass-deck'));
    assert.ok(!lv.slab.pieces.some(s => pointInPoly([(pr.rect.x0 + pr.rect.x1) / 2, (pr.rect.z0 + pr.rect.z1) / 2], s.outer)), `${pr.id} 不应有石材楼板`);
    assert.ok(!lv.walk.some(w => pointInPoly([(pr.rect.x0 + pr.rect.x1) / 2, -254], w.poly)));
  }
  assert.ok(!L.extensions.paths.some(p => p.id?.includes('PROW') || p.riverTerrace), '挑台不得进入 extensions.paths');
  const info = lv.features.filter(f => f.riverTerrace);
  assert.ok(info.some(f => f.type === 'river-terrace' && f.name === '云澜江景台' && f.pickInfo[0] === '云澜江景台' && /1,475㎡/.test(f.pickInfo[1])));
  assert.equal(info.filter(f => f.type === 'glass-prow').length, 2);
});

test('导航：3F 北通道与 P1C 新北门双向走上露台，4 m 带不外扩，两座玻璃挑台可站立', () => {
  const N = getNav();
  const S = (x, z, f = 'P1-3F') => standable(N, f, x, z);
  for (const p of [[-265, -242], [-235, -248], [-174, -250], [-129, -250], [-110, -252], [-235, -255.1], [-174, -255.1], [-170, -253]]) assert.ok(S(...p), `可站立 ${p}`);
  for (const p of [[-265, -246], [-220, -246], [-200, -246], [-235, -255.9], [-174, -255.9], [-228, -254], [-185, -254]]) assert.ok(!S(...p), `不可站立 ${p}`);
  const go = (floor, pts) => {
    let s = { floor, x: pts[0][0], z: pts[0][1] };
    for (const p of pts.slice(1)) {
      s = walkNav(N, s.floor, [s.x, s.z], p);
      assert.ok(Math.hypot(s.x - p[0], s.z - p[1]) < .05, `停在 (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) ${s.floor} 目标 ${p}`);
    }
    return s;
  };
  // Corridor → the 1.1 m slot past SQ-ART-3F → north passage → notch → terrace band, gap deck and prow.
  go('P1-3F', [[-226, -223.45], [-220, -223.45], [-220, -236], [-220, -242], [-235, -242], [-235, -250], [-235, -255], [-235, -242], [-265, -242]]);
  go('P1-3F', [[-265, -242], [-220, -242], [-220, -236], [-220, -223.45], [-226, -223.45]]);
  const inP1C = go('P1-3F', [[-220, -242], [-174, -242], [-174, -255], [-174, -248], [-129, -250], [-129, -244], [-129, -238]]);
  assert.equal(inP1C.floor, 'P1C-3F');
  const back = go('P1C-3F', [[-129, -238], [-129, -250], [-174, -248]]);
  assert.equal(back.floor, 'P1-3F');
  const door = L.entrances.filter(e => e.riverTerrace);
  assert.deepEqual(door.map(e => [e.id, e.level, e.to]).sort(), [['P1-3F-river-terrace-p1c', 'P1-3F', 'P1C-3F'], ['P1C-3F-river-terrace', 'P1C-3F', 'P1-3F']]);
  for (const e of door) assert.deepEqual([e.seg.x0, e.seg.x1, e.seg.z0], [-131.2, -126.8, polyBounds(p1c3.expansion.facadePoly).z0]);
  const z = door[0].seg.z0;
  const along = p1c3.navWalls.filter(w => w.facade && Math.abs(w.z0 - z) < .01 && Math.abs(w.z1 - z) < .01);
  assert.ok(along.length >= 2);
  for (const w of along) assert.ok(Math.max(w.x0, w.x1) <= -131.2 + 1e-6 || Math.min(w.x0, w.x1) >= -126.8 - 1e-6, 'P1C-3F 门洞被立面墙封住');
});

test('栏杆审计：每段真实落差都有栏杆，北立面、挑台口与 P1C 外墙一侧不设栏杆，总长 150–210 m', () => {
  const supports = terraceSupports(L, lv);
  assert.ok(supports.length >= 3, 'P1C-3F 楼板与两座挑台');
  const edges = expansionTerraceEdges(lv, L.entrances, supports);
  const river = edges.filter(e => e.riverTerrace);
  assert.ok(river.length >= 10 && river.every(e => e.mid[1] <= -239.99));
  let total = 0;
  const railAt = [];
  for (const e of river) for (const [a, b] of e.spans) {
    total += b - a;
    for (let u = a + .05; u < b; u += .25) railAt.push(toW(e.F, u, 0));
  }
  assert.ok(total >= 150 && total <= 210, `江景台栏杆 ${total.toFixed(1)} m`);
  const inFront = ([x, z]) => Math.abs(z + 240) < .01 && x > -280 && x < -160;
  for (const p of railAt) {
    assert.ok(!inFront(p), `立面 z −240 上的栏杆 ${p}`);
    for (const pr of T.prows) assert.ok(!(Math.abs(p[1] - pr.rect.z1) < .01 && p[0] > pr.rect.x0 + .05 && p[0] < pr.rect.x1 - .05), `${pr.id} 挑台口被栏杆封住`);
    for (const s of p1c3.slab.pieces) assert.ok(!(pointInPoly(p, s.outer)) && !(Math.abs(p[1] + 245.82) < .05 && p[0] > -141 && p[0] < -117), 'P1C 外墙一侧的栏杆');
  }
  // Continuity: every boundary sample that drops to open air is railed.
  const onSlab = q => lv.slab.pieces.some(s => pointInPoly(q, s.outer) && !s.holes.some(h => pointInPoly(q, h))) && !lv.voids.some(v => pointInPoly(q, v.poly));
  const enclosed = q => lv.expansion.facadePolys.some(f => pointInPoly(q, f));
  const near = q => railAt.some(r => Math.hypot(r[0] - q[0], r[1] - q[1]) < .3);
  let drops = 0;
  for (const p of T.pieces) for (let i = 0; i < p.outer.length; i++) {
    const a = p.outer[i], b = p.outer[(i + 1) % p.outer.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    for (let u = .4; u < len - .4; u += .5) {
      const q = [a[0] + (b[0] - a[0]) * u / len, a[1] + (b[1] - a[1]) * u / len];
      let out = [q[0] + nx * .18, q[1] + nz * .18];
      if (pointInPoly(out, p.outer)) out = [q[0] - nx * .18, q[1] - nz * .18];
      if (onSlab(out) || enclosed(out) || supports.some(s => pointInPoly(out, s))) continue;
      drops++;
      assert.ok(near(q), `落差处缺栏杆 (${q[0].toFixed(2)}, ${q[1].toFixed(2)})`);
    }
  }
  assert.ok(drops > 300, `${drops} 个落差采样`);
  // The open gap between the 方庭 NE corner and P1C is railed along the facade line.
  assert.ok(railAt.some(([x, z]) => Math.abs(z + 240) < .01 && x > -160 && x < -153));
  // P1C-3F's own perimeter rail stops where the river terrace continues beyond its slab edge.
  const p1cEdges = expansionTerraceEdges(p1c3, L.entrances, terraceSupports(L, p1c3));
  let p1cRail = 0;
  for (const e of p1cEdges) for (const [a, b] of e.spans) for (let u = a + .05; u < b; u += .25) {
    p1cRail++;
    const out = toW(e.F, u, .18);
    // 0.25 m sampling: a stub may remain only at the very end of the joint.
    assert.ok(!T.pieces.some(p => pointInPoly(out, p.outer) && distToPolyEdge(out, p.outer) > .17), `P1C-3F 栏杆挡在江景台上 ${out.map(v => v.toFixed(2))}`);
  }
  assert.ok(p1cRail > 100, 'P1C-3F 其余外缘保留栏杆');
});
