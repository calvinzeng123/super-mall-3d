// 幕墙与立面套件（supertall P0b · SPEC §2.2 curtain-wall.js）：竖梃与视窗玻璃竖向合并（根数与层数无关），
// 每层一条层间窗槛墙；混合立面（北苑：100 m 以下保留窗洞立面与开敞阳台，以上做幕墙）只在上半段出玻璃，交界一条腰线；
// 倒角幕墙四角各一块斜玻璃；避难层百叶带与乙级防火窗；消防救援窗红三角；塔冠格栅、航空障碍灯、加强层腰桁架。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BatchSet } from '../src/render/batch.js';
import { curtainWall, splitFacade, transitionBand, louvreBand, rescueMarks, crownFins, aviationLights, belt, rectEdges } from '../src/render/build/curtain-wall.js';

const mats = new Proxy({}, { get: (m, k) => (m[k] ||= Object.assign(new THREE.MeshBasicMaterial({ vertexColors: true }), { name: k })) });
const plate = { x0: -10, x1: 10, z0: -8, z1: 8 };
const tower = (n, y0 = 34, h = 3.6) => Array.from({ length: n }, (_, i) => ({ id: `T-${i + 8}F`, elev: y0 + h * i, height: h }));
function draw(fn) {
  const B = new BatchSet(mats), g = new THREE.Group(), stats = fn(B);
  B.flush(g);
  const by = Object.fromEntries(g.children.map((m) => [m.material.name, m]));
  return { g, by, stats, verts: (k) => by[k]?.geometry.attributes.position.count || 0 };
}
function bounds(mesh) { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox; }

test('curtainWall：竖梃竖向合并（根数与层数无关），每层一条窗槛墙，玻璃从最低层底到最高层顶', () => {
  const a = draw((B) => curtainWall(B, plate, { levels: tower(10), module: 1.5 }));
  const b = draw((B) => curtainWall(B, plate, { levels: tower(20), module: 1.5 }));
  assert.equal(a.stats.mullions, b.stats.mullions, '竖梃根数随层数变化：没有竖向合并');
  assert.equal(a.verts('extMetal'), b.verts('extMetal'));
  assert.equal(a.stats.spandrels, 10 * 4);
  assert.equal(b.stats.spandrels, 20 * 4);
  const glass = bounds(b.by.glassTint);
  assert.ok(Math.abs(glass.min.y - 34) < .01 && Math.abs(glass.max.y - (34 + 3.6 * 20)) < .01, `${glass.min.y}–${glass.max.y}`);
  // About 430 vertices per added storey at most (spandrels; mullions and glass merge vertically).
  const per = (b.g.children.reduce((n, m) => n + m.geometry.attributes.position.count, 0) - a.g.children.reduce((n, m) => n + m.geometry.attributes.position.count, 0)) / 10;
  assert.ok(per <= 430, `${per} 顶点 / 层`);
});

test('混合立面：splitFacade(levels, 100) 把 100 m 以下留给窗洞立面，幕墙只画上半段；交界有一条腰线；skip 跳过某层窗槛墙', () => {
  const levels = [...tower(18, 34, 3.6), ...tower(9, 34 + 3.6 * 18, 3.9).map((l, i) => ({ ...l, id: `T-${26 + i}F` }))];
  const { punched, curtain } = splitFacade(levels, 100);
  assert.ok(punched.every((l) => l.elev < 100) && curtain.every((l) => l.elev >= 100));
  assert.equal(punched.length + curtain.length, levels.length);
  const r = draw((B) => { const s = curtainWall(B, plate, { levels: curtain, finEvery: 0, skip: (lv, e) => lv.id === curtain[2].id && e.side === 'N' }); transitionBand(B, plate, curtain[0].elev); return s; });
  assert.ok(bounds(r.by.glassTint).min.y >= curtain[0].elev - .01, '窗洞立面的楼层出现了幕墙玻璃');
  assert.equal(r.stats.spandrels, curtain.length * 4 - 1);
  const band = bounds(r.by.extSatin);
  assert.ok(Math.abs((band.min.y + band.max.y) / 2 - curtain[0].elev) < .05, '交界腰线不在分界标高');
});

test('倒角幕墙：四角各一块斜玻璃；鳍片每隔一根竖梃一片', () => {
  const plain = draw((B) => curtainWall(B, plate, { levels: tower(4), finEvery: 0 }));
  const cham = draw((B) => curtainWall(B, plate, { levels: tower(4), chamfer: 1.2 }));
  assert.equal(cham.stats.panes - plain.stats.panes, 4);
  assert.ok(cham.verts('extSatin') > 0 && !plain.by.extSatin, '鳍片');
});

test('避难层百叶带、消防救援窗、塔冠格栅、航空障碍灯、腰桁架', () => {
  const e = rectEdges(plate).find((q) => q.side === 'N');
  const lb = draw((B) => louvreBand(B, e, 93.6, 99, { blades: 8, fireWindows: [[-6, -3], [3, 6]] }));
  assert.equal(lb.stats.fireWindows, 2);
  assert.equal(lb.stats.blades, 8 * 3, '防火窗两侧与中间三段百叶');
  assert.ok(lb.verts('glassTint') > 0, '乙级防火窗');
  const rm = draw((B) => rescueMarks(B, e, tower(5), [[-7, -6], [6, 7]]));
  assert.equal(rm.stats, 10);
  const red = new THREE.Color('#e0332b'), col = rm.by.glowSoft.geometry.attributes.color;
  assert.ok(Math.abs(col.getX(0) - red.r) < .02 && Math.abs(col.getY(0) - red.g) < .02, '救援窗标记不是红色');
  const cf = draw((B) => crownFins(B, plate, 140.7, (t, edge) => 10 - Math.abs(t) * .2));
  assert.ok(cf.stats >= 16 && bounds(cf.by.extSatin).max.y <= 150.71);
  const av = draw((B) => aviationLights(B, [{ x: -10, y: 151, z: -8 }, { x: 10, y: 151, z: 8 }]));
  assert.equal(av.stats, 2);
  assert.ok(av.by.glowSoft);
  const bt = draw((B) => belt(B, e, 93.6, 99, 6));
  assert.equal(bt.stats, 6);
  assert.ok(bounds(bt.by.extMetal).max.y <= 99.01);
});
