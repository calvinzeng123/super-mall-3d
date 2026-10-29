import test from 'node:test';
import assert from 'node:assert/strict';
import { L, onSlab } from './helpers.js';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { ART_DOME, SQUARE_CANOPY, domeColumns, canopyColumns } from '../src/layout/p1-fidelity.js';
import { lrectPoly, pointInPoly, convexOverlap, rect, rectPoly, toW, polySamples } from '../src/layout/geom.js';

const rf = L.levels.find(l => l.id === 'P1-RF'), nav = buildNav(L);
const feature = t => rf.features.find(f => f.type === t);
const solidRooms = rf.rooms.flatMap(r => r.polys);
const column = ([x, z], r) => rectPoly(rect(x - r - .2, z - r - .2, x + r + .2, z + r + .2));
function walk(from, to) {
  let s = { floor: 'P1-RF', x: from[0], z: from[1], y: rf.elev, slope: null };
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

test('FPS 布局不含光穹、天幕和峡谷，摩天轮保持', () => {
  const old = buildLayout({ expansion: false }).levels.find(l => l.id === 'P1-RF');
  const types = old.features.map(f => f.type);
  for (const t of ['art-dome', 'glass-canopy', 'canyon-skylight']) assert.ok(!types.includes(t));
  assert.ok(types.includes('ferris'));
  assert.ok(!old.navObstacles);
});
