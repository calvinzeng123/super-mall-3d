// 云澜江：河道、星湾桥与四座城市桥、南岸滨江步道、江景玻璃眺台与北岸绿道（游览布局）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, standable, walkNav } from './helpers.js';
import { buildLayout } from '../src/layout/layout.js';
import { buildSite } from '../src/layout/campus.js';
import { addUrbanDistrict, NORTH_GRID } from '../src/layout/urban.js';
import { RIVER, RIVER_AXIS } from '../src/layout/river.js';
import { NORTH_SITE } from '../src/layout/community-sites.js';
import { rect, rectPoly, polyBounds, convexOverlap, pointInPoly, rectsOverlap } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';

const R = L.site.river;
const channel = rectPoly(rect(-1500, -436, 1500, -290));
const inRect = (r, x, z, eps = 0.01) => x >= r.x0 - eps && x <= r.x1 + eps && z >= r.z0 - eps && z <= r.z1 + eps;
const onDeck = (poly) => R.bridges.some(b => poly.every(([x, z]) => inRect(b.deck, x, z)));
let nav;
const getNav = () => (nav ||= buildNav(L));

test('FPS 紧凑布局没有云澜江，北侧城市路网保持原网格；游览布局北网格退到滨江北路', () => {
  const fps = buildLayout({ expansion: false });
  assert.equal(fps.site.river, undefined);
  assert.ok(fps.site.urban.roads.some(r => r.id === 'city-h-360') && !fps.site.urban.roads.some(r => r.id === 'city-h-500'));
  assert.equal(fps.site.urban.blocks.length, 43);
  assert.equal(fps.site.urban.buildings.length, 84);
  // The default call and { river:false } build the same district.
  const a = buildSite(), b = buildSite();
  addUrbanDistrict(a); addUrbanDistrict(b, { river: false });
  assert.deepEqual(a.urban, b.urban);
  const U = L.site.urban;
  assert.deepEqual(NORTH_GRID.river, [-800, -650, -500]);
  assert.equal(U.roads.length, 24);
  assert.equal(U.blocks.length, 42);
  assert.equal(U.buildings.length, 82);
  assert.ok(U.roads.some(r => r.id === 'city-h-500') && U.roads.some(r => r.id === 'city-h-650'));
  assert.deepEqual(U.roads.find(r => r.id === 'city-xingwan-n').rect, rect(-10, -500, 10, -298));
  const parks = U.blocks.filter(b => b.name === '对岸滨江公园');
  assert.equal(parks.length, 4);
  for (const p of parks) assert.deepEqual([p.rect.z0, p.rect.z1], [-484, -452]);
});

test('云澜江 112 m 水面横贯全图：两岸堤顶 z −290 / −436，渲染 ±1500、导航 ±960', () => {
  assert.equal(R.name, '云澜江');
  assert.ok(R.water.z1 - R.water.z0 >= 100, '水面宽度');
  assert.equal(R.south.bankTop, -290);
  assert.equal(R.north.bankTop, -436);
  assert.deepEqual(polyBounds(R.channel), { x0: -1500, z0: -436, x1: 1500, z1: -290 });
  const wb = polyBounds(R.water.poly);
  assert.ok(wb.x0 <= -1500 && wb.x1 >= 1500 && wb.z1 === -300);
  const hb = R.navHoles.map(polyBounds);
  assert.equal(Math.min(...hb.map(b => b.x0)), RIVER.nav.x0);
  assert.equal(Math.max(...hb.map(b => b.x1)), RIVER.nav.x1);
  for (const b of hb) assert.ok(b.z0 >= -436 && b.z1 <= -290);
  // Holes cover the channel exactly minus decks and lookouts.
  const area = hb.reduce((s, b) => s + (b.x1 - b.x0) * (b.z1 - b.z0), 0);
  const solid = R.bridges.reduce((s, b) => s + (b.deck.x1 - b.deck.x0) * 146 + (b.lookouts || []).reduce((t, r) => t + (r.x1 - r.x0) * (r.z1 - r.z0), 0), 0) + 32 * 16;
  assert.ok(Math.abs(area + solid - 1920 * 146) < 0.01, `${area} + ${solid}`);
});

test('河道内除桥面外没有建筑、街坊、城市楼、树木路灯、坡道洞口、车道与西停车场', () => {
  for (const b of L.buildings.filter(b => b.kind !== 'metro' && !b.undergroundOnly)) assert.ok(polyBounds(b.outline).z0 >= -290, `${b.id} 越过南岸`);
  for (const b of L.site.urban.blocks) assert.ok(!convexOverlap(b.poly, channel, .01), `${b.id}`);
  for (const b of L.site.urban.buildings) assert.ok(!convexOverlap(b.poly, channel, .01), `${b.id}`);
  for (const t of [...L.site.urban.trees, ...L.site.urban.lamps]) assert.ok(!(t.z > -436 && t.z < -290), `城市树木或路灯 (${t.x}, ${t.z})`);
  for (const p of [...L.site.trenches, ...L.site.openings, ...L.site.driveways]) assert.ok(!convexOverlap(p, channel, .01), JSON.stringify(polyBounds(p)));
  for (const r of L.ramps) assert.ok(!convexOverlap(r.poly, channel, .01), r.id);
  for (const lot of L.extensions.surfaceParking) assert.ok(!convexOverlap(lot.poly, channel, .01), lot.id);
  assert.ok(!convexOverlap(L.site.westParking.poly, channel, .01));
  for (const p of L.site.plazas) assert.ok(!convexOverlap(p.poly, channel, .01) || onDeck(p.poly), p.id);
});

test('跨河的每条南北道路都有且只有一座桥，桥面 = 车行道 ± 6 m；星湾路两段同属星湾桥', () => {
  const crossing = L.site.roads.filter(r => convexOverlap(r.poly, channel, .01));
  assert.ok(crossing.length >= 6);
  for (const r of crossing) {
    assert.equal(r.dir, 'z', `${r.id} 东西向道路不应跨河`);
    const owners = R.bridges.filter(b => b.roads.includes(r.id));
    assert.equal(owners.length, 1, r.id);
    const d = owners[0].deck;
    assert.equal(d.x0, r.rect.x0 - 6); assert.equal(d.x1, r.rect.x1 + 6);
    assert.deepEqual([d.z0, d.z1], [-436, -290]);
  }
  assert.equal(R.bridges.length, 5);
  const xw = R.bridges.find(b => b.id === 'XW-BR');
  assert.equal(xw.name, '星湾桥');
  assert.equal(xw.kind, 'tied-arch');
  assert.deepEqual([...xw.roads].sort(), ['city-xingwan-n', 'xingwan']);
  assert.equal(xw.span, 146);
  assert.deepEqual([xw.deck.x0, xw.deck.x1], [-16, 16]);
  assert.equal(xw.deckTop, -0.12);
  assert.deepEqual(xw.lookouts, [rect(-24, -369, -16, -357), rect(16, -369, 24, -357)]);
  assert.deepEqual(R.bridges.filter(b => b.kind === 'girder').map(b => [b.id, b.name]),
    [['city-v-890-BR', '城西二桥'], ['city-v-540-BR', '城西桥'], ['city-v540-BR', '城东桥'], ['city-v890-BR', '城东二桥']]);
  for (const b of R.bridges.filter(b => b.kind === 'girder')) assert.deepEqual(b.piers, [-339, -387]);
});

test('河道内的人行道和斑马线全部落在桥面上；滨江步道不与既有人行道重复铺装', () => {
  for (const s of [...L.site.sidewalks, ...L.site.urban.sidewalks, ...L.site.crossings, ...L.site.urban.crossings]) {
    if (!convexOverlap(s.poly, channel, .01)) continue;
    const r = polyBounds(s.poly), wet = rectPoly(rect(r.x0, Math.max(r.z0, -436), r.x1, Math.min(r.z1, -290)));
    assert.ok(onDeck(wet), `${s.id} 悬空在河上`);
  }
  for (const id of ['sw-xw-nr', 'sw-xe-nr']) {
    const s = L.site.sidewalks.find(q => q.id === id);
    assert.ok(s && L.site.walk.some(w => w.id === id), id);
    assert.deepEqual([s.rect.z0, s.rect.z1], [-298, -268]);
  }
  const paved = [...L.site.sidewalks, ...L.site.urban.sidewalks].map(s => s.rect);
  const proms = R.promenades.filter(p => p.kind === 'promenade');
  for (const p of proms) {
    assert.ok(L.site.walk.some(w => w.id === p.id && w.outdoor), p.id);
    for (const s of paved) assert.ok(!rectsOverlap(p.rect, s, .001), `${p.id} 与人行道重叠`);
    for (const r of L.site.roads) assert.ok(!rectsOverlap(p.rect, r.rect, .001), `${p.id} 压路 ${r.id}`);
  }
  assert.ok(proms.some(p => p.bank === 'S') && proms.some(p => p.bank === 'N'));
});

test('北外环斑马线：方庭北门轴线 x −228、P1C、北庭、R1–R4、西苑，以及星湾桥南桥头', () => {
  const X = Object.fromEntries(L.site.crossings.filter(c => c.river).map(c => [c.id, c]));
  assert.deepEqual(Object.keys(X).sort(), ['x-rn-bt', 'x-rn-p1c', 'x-rn-r12', 'x-rn-r34', 'x-rn-sq', 'x-rw-xy', 'x-xw-river']);
  const axis = (NORTH_SITE.movedNorthDoor.x0 + NORTH_SITE.movedNorthDoor.x1) / 2;
  assert.equal(RIVER_AXIS, axis);
  assert.ok(Math.abs((X['x-rn-sq'].rect.x0 + X['x-rn-sq'].rect.x1) / 2 - -228) <= 0.5);
  assert.deepEqual([X['x-rn-sq'].rect.x0, X['x-rn-sq'].rect.x1], [-231, -225]);
  assert.deepEqual([X['x-rw-xy'].rect.x0, X['x-rw-xy'].rect.x1], [-431, -425]);
  assert.deepEqual(X['x-xw-river'].rect, rect(-10, -283, 10, -277));
  for (const c of Object.values(X)) {
    assert.ok(L.site.walk.some(w => w.id === c.id && w.kind === 'crossing'), c.id);
    if (c.axis === 'z') assert.deepEqual([c.rect.z0, c.rect.z1], [-268, -256]);
    for (const d of L.site.driveways) assert.ok(!convexOverlap(c.poly, d, .01), `${c.id} 压车道`);
    for (const t of [...L.site.trenches, ...L.site.openings]) assert.ok(!convexOverlap(c.poly, t, .01), `${c.id} 压坡道洞口`);
  }
  const lk = R.lookouts.find(l => l.id === 'RV-LOOK-S');
  assert.deepEqual(lk.rect, rect(-244, -306, -212, -290));
  assert.deepEqual(lk.glass, rect(-240, -306, -216, -294));
  assert.deepEqual(R.pavilion.rect, rect(-240, -449, -216, -441));
});

test('导航：水面不可站立，五座桥面中线和两侧 ±14 m 可站立，拱肋线不可站，眺台可站', () => {
  const N = getNav(), S = (x, z) => standable(N, 'ground', x, z);
  for (const x of [-700, -200, 300]) for (const z of [-310, -350, -400]) assert.ok(!S(x, z), `水面 (${x}, ${z})`);
  for (const b of R.bridges) {
    const cx = (b.deck.x0 + b.deck.x1) / 2;
    for (const z of [-430, -363, -300]) for (const dx of [-14, 0, 14]) assert.ok(S(cx + dx, z), `${b.id} 桥面 (${cx + dx}, ${z})`);
    assert.ok(!S(b.deck.x0 - 1.2, -330) && !S(b.deck.x1 + 1.2, -330), `${b.id} 桥面外侧`);
  }
  assert.ok(!S(17.2, -340) && !S(-17.2, -390), '拱肋线');
  assert.ok(S(-20, -363) && S(20, -363), '桥上玻璃挑台');
  assert.ok(S(-220, -305) && S(-228, -296) && S(-243, -300), '南岸江景玻璃眺台');
  assert.ok(!S(-246, -296) && !S(-228, -307), '眺台以外的护岸与水面');
  assert.ok(S(-228, -280) && S(100, -285) && S(-400, -280) && S(-228, -444) && S(200, -444), '两岸步道');
  for (const [x, z] of R.pavilion.columns) assert.ok(!S(x, z), '观景亭立柱是障碍');
});

test('实走：一期北门 → 斑马线 → 滨江步道 → 星湾桥 → 滨江北路，各城市桥与南岸全程双向可走', () => {
  const N = getNav();
  // 0.3 m steps as in urban.test.js: long promenade routes stay affordable.
  const route = (pts) => {
    for (const list of [pts, [...pts].reverse()]) {
      let s = { floor: 'ground', x: list[0][0], z: list[0][1], y: 0, slope: null };
      assert.ok(clear(N, s), `起点 ${list[0]}`);
      for (const p of list.slice(1)) {
        const dx = p[0] - s.x, dz = p[1] - s.z, n = Math.ceil(Math.hypot(dx, dz) / .3);
        for (let i = 0; i < n; i++) s = step(N, s, dx / n, dz / n, 0);
        assert.ok(Math.hypot(s.x - p[0], s.z - p[1]) < .05, `停在 (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) 目标 ${p}`);
      }
    }
  };
  route([[-228, -258], [-228, -280], [-12, -280], [-12, -500]]);
  route([[-220, -258], [-220, -280], [12, -280], [12, -470]]);
  for (const b of R.bridges.filter(b => b.kind === 'girder')) for (const dx of [-13, 13]) {
    const x = (b.deck.x0 + b.deck.x1) / 2 + dx;
    route([[x, -280], [x, -446]]);
  }
  route([[-880, -282], [880, -282]]);
  route([[-880, -444], [880, -444]]);
  route([[-12, -280], [-12, -363], [-22, -363]]);
  route([[12, -280], [12, -363], [22, -363]]);
  route([[-228, -262], [-228, -270], [-228, -304]]);
  // Into the river is blocked at the railing line.
  const s = walkNav(N, 'ground', [-200, -285], [-200, -300]);
  assert.ok(s.z > -290.01, `走进了河里 ${s.z}`);
});

test('滨江家具：树、灯、长椅不占斑马线、桥面、车道或挑台；方庭北侧不种第二排树；芦苇 ≤ 600 株', () => {
  const F = R.furniture;
  const crossings = [...L.site.crossings, ...L.site.urban.crossings].map(c => c.poly);
  const lookouts = [...R.lookouts.map(l => rectPoly(l.rect)), ...R.bridges.flatMap(b => (b.lookouts || []).map(rectPoly))];
  const decks = R.bridges.map(b => rectPoly(b.deck));
  const promenade = [...F.trees, ...F.lamps.filter(l => !l.bridge), ...F.benches.filter(b => !b.bridge)];
  assert.ok(F.trees.length >= 250 && F.trees.length <= 360, `${F.trees.length} 棵`);
  for (const t of promenade) {
    const p = [t.x, t.z];
    for (const poly of [...crossings, ...decks, ...lookouts, ...L.site.driveways]) assert.ok(!pointInPoly(p, poly), `(${t.x}, ${t.z}) 落在通行区`);
    assert.ok(t.z >= -452 && t.z <= -268 && !(t.z > -436 && t.z < -290), `(${t.x}, ${t.z}) 落入河道`);
  }
  for (const t of F.trees.filter(t => t.z === -285)) assert.ok(!(t.x >= -290 && t.x <= -100), `第二排树 ${t.x}`);
  assert.ok(F.trees.some(t => t.z === -285) && F.trees.some(t => t.z === -447));
  // Bridge lamps stand on the sidewalks, never in the lookout openings.
  const xw = R.bridges.find(b => b.id === 'XW-BR');
  const bridgeLamps = F.lamps.filter(l => l.bridge === 'XW-BR');
  assert.equal(bridgeLamps.length, 16);
  for (const l of bridgeLamps) {
    assert.ok(Math.abs(Math.abs(l.x) - 15.2) < 1e-9);
    for (const r of xw.lookouts) assert.ok(!(l.z >= r.z0 - 0.5 && l.z <= r.z1 + 0.5), `灯杆挡住挑台入口 ${l.z}`);
  }
  assert.ok(F.reeds.length * 3 <= 600 && F.reeds.length >= 150);
  for (const r of F.reeds) {
    assert.ok(Math.abs(r.x) <= 602 && r.z >= -416 && r.z <= -412, `芦苇 (${r.x}, ${r.z})`);
    for (const d of R.bridges) assert.ok(!inRect(d.deck, r.x, r.z, 1), '芦苇在桥下');
  }
  // Obstacles: the 4 pavilion columns, 星湾桥's 2 crash barriers and the 4 name plates on their ends.
  const ids = R.obstacles.map(o => o.id);
  assert.deepEqual([ids.filter(i => i === 'RV-PAVILION-col').length, ids.filter(i => i === 'XW-BR-barrier').length,
    ids.filter(i => i === 'XW-BR-nameplate').length, ids.length], [4, 2, 4, 10]);
});

test('星湾桥：防撞护栏与桥名牌立在车行道和人行道之间，人走不穿；桥名牌不占人行道', () => {
  const xw = R.bridges.find(b => b.id === 'XW-BR'), car = xw.carriage;
  assert.deepEqual(xw.barriers, [rect(-10.35, -436, -10.05, -290), rect(10.05, -436, 10.35, -290)]);
  assert.equal(xw.nameplates.length, 4);
  for (const r of xw.nameplates) {
    // On the barrier line at an abutment, outside the carriageway and inside the first 0.4 m of the sidewalk.
    assert.ok(r.x1 <= car.x0 + 1e-9 ? r.x0 >= car.x0 - .4 - 1e-9 : r.x0 >= car.x1 - 1e-9 && r.x1 <= car.x1 + .4 + 1e-9, JSON.stringify(r));
    assert.ok(Math.min(Math.abs(r.z1 - -290), Math.abs(r.z0 - -436)) <= .1 + 1e-9, JSON.stringify(r));
    assert.ok(xw.barriers.some(b => r.x0 <= b.x0 && r.x1 >= b.x1), '桥名牌在护栏端头');
  }
  const N = getNav(), S = (x, z) => standable(N, 'ground', x, z);
  for (const r of [...xw.barriers, ...xw.nameplates]) assert.ok(!S((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2), `护栏/桥名牌可站 ${JSON.stringify(r)}`);
  // From the sidewalk towards the carriageway: stopped at the barrier, both sides, mid-span.
  for (const [x0, x1] of [[13, 7], [-13, -7]]) {
    const s = walkNav(N, 'ground', [x0, -340], [x1, -340]);
    assert.ok(Math.abs(s.x) > 10.35, `穿过防撞护栏到 (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
  }
  // The whole sidewalk stays walkable past the plates, at the balustrade and beside the barrier.
  for (const x of [-15.6, -11, 11, 15.6]) for (const [a, b] of [[-286, -446], [-446, -286]]) {
    const s = walkNav(N, 'ground', [x, a], [x, b]);
    assert.ok(Math.hypot(s.x - x, s.z - b) < .05, `人行道 x ${x} 停在 (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
  }
});
