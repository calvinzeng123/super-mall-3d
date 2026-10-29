import test from 'node:test';
import assert from 'node:assert/strict';
import { L, onSlab } from './helpers.js';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { ART_DOME, SQUARE_CANOPY, BILLBOARDS, COURT_FOUNTAINS, CREATIVE_ROOFS, domeColumns, canopyColumns } from '../src/layout/p1-fidelity.js';
import { lrectPoly, pointInPoly, convexOverlap, polysOverlap, rect, rectPoly, toW, polySamples, polyArea, polyBounds } from '../src/layout/geom.js';

const rf = L.levels.find(l => l.id === 'P1-RF'), nav = buildNav(L);
const feature = t => rf.features.find(f => f.type === t);
const solidRooms = rf.rooms.flatMap(r => r.polys);
const column = ([x, z], r) => rectPoly(rect(x - r - .2, z - r - .2, x + r + .2, z + r + .2));
const level = id => L.levels.find(l => l.id === id);
const standable = (floor, x, z) => clear(nav, { floor, x, z, y: floor === 'ground' ? 0 : level(floor).elev, slope: null });
function walk(from, to, floor = 'P1-RF') {
  let s = { floor, x: from[0], z: from[1], y: floor === 'ground' ? 0 : level(floor).elev, slope: null };
  assert.ok(clear(nav, s), `${from} not standable`);
  const n = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / .1);
  for (let i = 0; i < n; i++) s = step(nav, s, (to[0] - from[0]) / n, (to[1] - from[1]) / n, 0);
  return s;
}

test('06 光穹：12 柱立在圆厅屋面、避开扶梯口与玻璃梯，四翼轴线从柱间进入，顶高低于酒店', () => {
  const d = feature('art-dome');
  assert.ok(d); assert.equal(d.columnsAt.length, 12);
  assert.ok(rf.elev + d.spring + d.rise < 71.1, '穹顶高过酒店');
  for (const p of domeColumns()) {
    assert.ok(Math.abs(Math.hypot(p[0] - d.cx, p[1] - d.cz) - ART_DOME.radius) < 1e-9);
    for (const q of polySamples(column(p, d.columnRadius), .2, .01)) assert.ok(onSlab(rf, q), `柱 ${p} 不在屋面`);
    for (const room of solidRooms) assert.ok(!convexOverlap(column(p, d.columnRadius), room), `柱 ${p} 压核心筒`);
    for (const v of rf.voids) assert.ok(!convexOverlap(column(p, d.columnRadius), v.poly), `柱 ${p} 压 ${v.id}`);
  }
  const P1 = L.buildings.find(b => b.id === 'P1');
  for (const w of P1.wings) {
    const angle = ((w.F.deg % 360) + 360) % 360, nearest = Math.min(...d.columnsAt.map(([x, z]) => {
      const a = (Math.atan2(z - d.cz, x - d.cx) * 180 / Math.PI + 360) % 360; return Math.min(Math.abs(a - angle), 360 - Math.abs(a - angle));
    }));
    assert.ok(nearest >= 14.9, `${w.id} 翼轴线被柱挡住`);
    const outside = toW(w.F, 36, 0), inside = toW(w.F, 24, 0);
    const s = walk(outside, inside);
    assert.ok(Math.hypot(s.x - inside[0], s.z - inside[1]) < .05, `从${w.id}翼屋面走不进穹顶 ${s.x},${s.z}`);
  }
  const [cx, cz] = d.columnsAt[0], s = walk([cx + 3, cz], [cx - 3, cz]);
  assert.ok(s.x > cx, '可以穿过穹顶柱');
});

test('01 方庭天幕：18 根周边柱立在 RF 楼板上，覆盖中庭天窗和两部玻璃梯，影院与观景台迁出', () => {
  const c = feature('glass-canopy');
  assert.ok(c); assert.equal(c.columnsAt.length, 18);
  const outline = rectPoly(SQUARE_CANOPY.rect);
  for (const p of canopyColumns()) {
    for (const q of polySamples(column(p, c.columnRadius), .2, .01)) assert.ok(onSlab(rf, q), `天幕柱 ${p} 落在退台切口外`);
    for (const room of solidRooms) assert.ok(!convexOverlap(column(p, c.columnRadius), room), `天幕柱 ${p} 压用房`);
    for (const f of rf.features.filter(f => f.rect && f.type !== 'glass-canopy' && f.type !== 'art-dome'))
      assert.ok(!convexOverlap(column(p, c.columnRadius), lrectPoly(f.frame, f.rect)), `天幕柱 ${p} 压 ${f.type}`);
  }
  for (const p of rf.voids.find(v => v.id === 'SQ-sky').poly) assert.ok(pointInPoly(p, outline), '天幕没有盖住方庭天窗');
  for (const id of ['P1-SQ-GW', 'P1-SQ-GE']) { const e = L.elevators.find(e => e.id === id); assert.ok(pointInPoly([e.x, e.z], outline)); }
  for (const t of ['cinema-open', 'viewdeck']) assert.ok(!convexOverlap(lrectPoly(feature(t).frame, feature(t).rect), outline), `${t} 仍在天幕下`);
  for (const t of ['cinema-open', 'viewdeck', 'farm']) for (const q of polySamples(lrectPoly(feature(t).frame, feature(t).rect), 1, .3)) assert.ok(onSlab(rf, q), `${t} 不在屋面`);
});

test('北翼采光峡谷替代摩天轮：落在北翼屋面中轴、不压核心筒与设备，两侧树木在屋面上', () => {
  const k = feature('canyon-skylight');
  assert.ok(k); assert.ok(!feature('ferris') && !feature('ferris-platform'));
  const poly = lrectPoly(k.frame, k.rect);
  for (const q of polySamples(poly, 1, .05)) assert.ok(onSlab(rf, q), '采光峡谷不在屋面');
  for (const room of solidRooms) assert.ok(!convexOverlap(poly, room), '采光峡谷压用房');
  const trees = rf.features.filter(f => f.type === 'tree' && f.frame === k.frame && Math.abs(Math.abs(f.lv) - 5.5) < 1e-9);
  assert.equal(trees.length, 12);
  for (const t of trees) assert.ok(onSlab(rf, toW(t.frame, t.lu, t.lv)), '峡谷树不在屋面');
});

test('FPS 布局不含效果图改造：无光穹、天幕、峡谷、屋顶家具、坡屋顶和地面景观，摩天轮与酒店 29 个车位保持', () => {
  const compact = buildLayout({ expansion: false }), old = compact.levels.find(l => l.id === 'P1-RF');
  const types = old.features.map(f => f.type);
  for (const t of ['art-dome', 'glass-canopy', 'canyon-skylight']) assert.ok(!types.includes(t));
  assert.ok(types.includes('ferris'));
  assert.ok(!old.navObstacles);
  assert.equal(compact.fidelity, undefined);
  const all = new Set(compact.levels.flatMap(l => l.features.map(f => f.type)));
  for (const t of ['planter-bed', 'cafe-cluster', 'glass-pavilion', 'timber-lattice', 'creative-roof']) assert.ok(!all.has(t), `FPS 出现 ${t}`);
  assert.equal(compact.extensions.surfaceParking.find(l => l.id === 'hotel-shared-parking').stalls.length, 29);
});

test('屋面改浅色石材：花池与咖啡座只放在真实屋面上，避开核心筒、天窗、光穹柱环和天幕，实体即导航障碍', () => {
  assert.equal(rf.theme.floor, 'roof-stone');
  const beds = rf.features.filter(f => f.type === 'planter-bed'), cafes = rf.features.filter(f => f.type === 'cafe-cluster');
  assert.ok(beds.length >= 16 && cafes.length >= 12, `花池 ${beds.length} 咖啡座 ${cafes.length}`);
  const canopy = rectPoly(SQUARE_CANOPY.rect);
  for (const f of [...beds, ...cafes]) {
    const poly = lrectPoly(f.frame, f.rect);
    for (const q of polySamples(poly, .5, .05)) assert.ok(onSlab(rf, q) && !rf.voids.some(v => pointInPoly(q, v.poly)), `${f.type} 不在屋面`);
    for (const room of solidRooms) assert.ok(!convexOverlap(poly, room), `${f.type} 压核心筒`);
    for (const u of rf.units) assert.ok(!u.polys.some(p => convexOverlap(poly, p)), `${f.type} 压 ${u.id}`);
    assert.ok(poly.every(([x, z]) => Math.hypot(x - ART_DOME.cx, z - ART_DOME.cz) >= ART_DOME.radius + 4.5), `${f.type} 进入光穹柱环`);
    assert.ok(!convexOverlap(poly, canopy), `${f.type} 在天幕下`);
  }
  for (const f of beds) { const r = f.rect, [x, z] = toW(f.frame, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); assert.ok(!standable('P1-RF', x, z), '花池可以穿过'); }
  for (const f of cafes) { assert.equal(f.tablesAt.length, 2); for (const [x, z] of f.tablesAt) assert.ok(!standable('P1-RF', x, z), '餐桌可以穿过'); }
});

test('附楼屋顶：艺文馆玻璃亭南面向草坪敞开、另三面挡人，南庭棚架柱与各咖啡桌为障碍', () => {
  const culture = level('P1C-RF'), pav = culture.features.find(f => f.type === 'glass-pavilion'), r = pav.rect, x = (r.x0 + r.x1) / 2 + 3;
  let s = walk([x, r.z1 + 2], [x, r.z1 - 2], 'P1C-RF');
  assert.ok(Math.abs(s.z - (r.z1 - 2)) < .05, '从草坪进不了玻璃亭');
  s = walk([x, r.z0 - 1.5], [x, r.z0 + 2], 'P1C-RF');
  assert.ok(s.z < r.z0, '玻璃亭北墙能穿过');
  s = walk([r.x0 - 1.5, r.z1 - 4], [r.x0 + 2, r.z1 - 4], 'P1C-RF');
  assert.ok(s.x < r.x0, '玻璃亭西墙能穿过');
  for (const [tx, tz] of pav.tablesAt) assert.ok(!standable('P1C-RF', tx, tz));
  const dining = level('P1S-RF'), lattice = dining.features.find(f => f.type === 'timber-lattice');
  for (const [px, pz] of lattice.postsAt) assert.ok(!standable('P1S-RF', px, pz), '棚架柱可以穿过');
  for (const id of ['P1S-RF', 'P1E-RF']) {
    const cafes = level(id).features.filter(f => f.type === 'cafe-cluster');
    assert.ok(cafes.length >= 2, `${id} 咖啡座 ${cafes.length}`);
    for (const f of cafes) for (const [tx, tz] of f.tablesAt) assert.ok(!standable(id, tx, tz), `${id} 餐桌可以穿过`);
  }
});

test('西里四栋：坡屋顶盖住约六成屋面，W1/W3 双坡、W2/W4 锯齿；檐口高过楼梯间，柱落在屋面上并挡人，南侧留露台', () => {
  for (const [id, style] of Object.entries(CREATIVE_ROOFS)) {
    const lv = level(`${id}-RF`), f = lv.features.find(f => f.type === 'creative-roof'), r = f.rect;
    assert.equal(f.style, style);
    assert.ok(f.eave >= 3.8 + .3, `${id} 檐口压到楼梯间`);
    const cover = (r.x1 - r.x0) * (r.z1 - r.z0) / Math.abs(polyArea(lv.slab.pieces[0].outer));
    assert.ok(cover >= .55 && cover <= .8, `${id} 覆盖 ${cover.toFixed(2)}`);
    assert.ok(f.postsAt.length >= 6);
    for (const [px, pz] of f.postsAt) {
      const sq = rectPoly(rect(px - .2, pz - .2, px + .2, pz + .2));
      for (const q of polySamples(sq, .2, .01)) assert.ok(onSlab(lv, q), `${id} 柱不在屋面`);
      for (const room of lv.rooms) assert.ok(!room.polys.some(p => convexOverlap(p, sq)), `${id} 柱压 ${room.id}`);
      for (const v of lv.voids) assert.ok(!convexOverlap(v.poly, sq), `${id} 柱压 ${v.id}`);
      assert.ok(!standable(lv.id, px, pz), `${id} 柱子可以穿过`);
    }
    const door = lv.rooms.find(room => room.type === 'stair').doors[0], b = polyBounds(lv.slab.pieces[0].outer), x = (door.x0 + door.x1) / 2;
    assert.ok(b.z1 - 1.5 > r.z1, `${id} 南侧没有露台`);
    const s = walk([x, door.z0 + .8], [x, b.z1 - 1.5], lv.id);
    assert.ok(Math.abs(s.z - (b.z1 - 1.5)) < .05, `${id} 从楼梯口走不到南露台 ${s.z}`);
  }
});

test('三块画屏：外挂在真实立面外 0.6m，所跨楼层立面连续；西翼避开酒店连廊，东南翼在 3F LED 之上', () => {
  assert.equal(L.fidelity.billboards.length, BILLBOARDS.length);
  for (const b of L.fidelity.billboards) {
    const levels = L.levels.filter(l => l.building === 'P1' && l.kind !== 'roof' && l.elev < b.y1 && l.elev + l.height > b.y0);
    assert.ok(levels.length >= 2, `${b.id} 只跨 ${levels.length} 层`);
    const [a, , c] = b.face;
    for (const lv of levels) for (let t = 0; t <= 1.0001; t += .25) {
      const px = a[0] + (c[0] - a[0]) * t, pz = a[1] + (c[1] - a[1]) * t;
      assert.ok(onSlab(lv, [px - b.nx * .4, pz - b.nz * .4]) && !onSlab(lv, [px + b.nx * .4, pz + b.nz * .4]), `${b.id} 在 ${lv.id} 未贴立面`);
    }
    assert.ok(Math.abs((b.x - (a[0] + c[0]) / 2) * b.nx + (b.z - (a[1] + c[1]) / 2) * b.nz - .6) < 1e-6, `${b.id} 未外挂 0.6m`);
  }
  const W = BILLBOARDS.find(b => b.id === 'W-end'), SE = BILLBOARDS.find(b => b.id === 'SE-end');
  assert.ok(W.v1 <= -4.5 || W.v0 >= 4.5, '西翼画屏压酒店连廊');
  assert.ok(SE.y0 >= level('P1-4F').elev, '东南翼画屏压 3F LED');
});

test('地面景观：两处喷泉雕塑、东南大台阶、两条行道树带、云伞和酒店落客环岛都是实体障碍，不压坡口、路口和建筑', () => {
  const D = L.fidelity.landscape, S = L.site;
  assert.equal(D.fountains.length, COURT_FOUNTAINS.length);
  assert.ok(D.trees.filter(t => t.z === -21.4).length >= 20, '云澜大道行道树不足');
  assert.ok(D.trees.filter(t => t.x === -18.6).length >= 12, '星湾路行道树不足');
  const solids = [...S.trenches, ...S.openings, ...S.driveways, ...(S.crossings || []).map(c => c.poly)];
  const outlines = L.buildings.filter(b => !b.undergroundOnly && b.kind !== 'metro').map(b => b.outline);
  const sq = (x, z, h) => rectPoly(rect(x - h, z - h, x + h, z + h));
  const items = [...D.fountains.map(f => [f.id, f.poly]), [D.steps.id, D.steps.poly], ['sunken-canopy', sq(D.sculpture.x, D.sculpture.z, 1.1)],
    ...D.trees.map(t => ['tree', sq(t.x, t.z, .45)]), ['H-dropoff-planter', D.hotelLoop.planterPoly]];
  for (const [id, poly] of items) {
    for (const q of solids) assert.ok(!convexOverlap(poly, q), `${id} 压坡口/路口`);
    for (const q of outlines) assert.ok(!polysOverlap(poly, q), `${id} 压建筑`);
  }
  for (const f of D.fountains) assert.ok(!standable('ground', f.x + f.r - .6, f.z), `${f.id} 可以走进水池`);
  const [sx, sz] = toW(D.steps.frame, (D.steps.rect.x0 + D.steps.rect.x1) / 2, (D.steps.rect.z0 + D.steps.rect.z1) / 2);
  assert.ok(!standable('ground', sx, sz), '大台阶可以穿过');
  assert.ok(!standable('ground', D.sculpture.x, D.sculpture.z), '云伞底座可以穿过');
  const t = D.trees.find(t => t.z === -21.4);
  assert.ok(!standable('ground', t.x, t.z) && standable('ground', t.x, -24.5), '行道树挡住了南侧长廊');
  const lot = L.extensions.surfaceParking.find(l => l.id === 'hotel-shared-parking'), loop = D.hotelLoop;
  assert.ok(lot.stalls.length >= 20 && !lot.stalls.some(s => convexOverlap(s.poly, loop.poly)), '环岛内仍有车位');
  assert.ok(Math.abs(loop.rect.z0 - lot.aisle.z1) < 1e-9, '环岛没有接上停车通道');
  for (const r of L.ramps.filter(r => r.type.startsWith('street'))) assert.ok(!convexOverlap(loop.poly, r.poly), `环岛压 ${r.id}`);
  assert.ok(!standable('ground', loop.cx, loop.cz), '环岛花坛可以穿过');
});
