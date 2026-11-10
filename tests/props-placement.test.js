// 贴图模型摆得合不合常理：朝向、留出通道、站在楼板上、不穿墙、成组陈设互不相碰、台面上的东西不悬空，
// 以及增加立体感的贴地假阴影和天花分格。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BatchSet, usePropLibrary } from '../src/render/batch.js';
import { PROP_ASSETS } from '../src/render/props/prop-data.js';
import { PROP_CATALOG } from '../scripts/props/catalog.mjs';
import { auditSets, themedSets, checkSet, EXTENT, SEATS, penetration } from '../scripts/props/set-rules.mjs';
import { accessZones, blockedZone, floorGuard, levelWalls, supported, grounded, fits, crossed, DOOR_CLEAR } from '../src/layout/access-zones.js';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav } from '../src/layout/nav.js';
import { frame, toW, rect, rectPoly, pointInPoly } from '../src/layout/geom.js';
import { unitFrame, faceAngle } from '../src/render/build/interiors.js';
import { ceilingBays } from '../src/render/build/shell.js';
import { ceilingRelief, runs, RIB, EDGE_BEAM } from '../src/render/build/ceiling.js';
import { pocketSet } from '../src/render/build/prop-sets.js';
import { HEIST_PROPS, shutterPlacement } from '../src/arcade/games/heist-rules.js';
import { HUB_CARGO } from '../src/arcade/games/drone-rules.js';

const manifest = JSON.parse(readFileSync('assets/models/props/manifest.json', 'utf8'));
const INFO = new Map(PROP_ASSETS.map((p) => [p.id, p]));
const materials = (extra = {}) => ({ ...Object.fromEntries(['matte', 'metal', 'glow', 'satin', 'stone'].map((k) => [k, new THREE.MeshBasicMaterial()])), ...extra });
/** 带真实包围盒的假模型库：记下交过来的摆放记录和被拦下的次数。 */
const library = () => ({ stats: {}, has: (id) => INFO.has(id), info: (id) => INFO.get(id), instantiate() {} });
const square = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
let tour;
const layout = () => (tour ||= buildPlayableLayout({ mode: 'tour' }));

test('every seat faces +Z: the build measured its backrest behind the seat', () => {
  assert.equal(PROP_CATALOG.length, 101);
  const checked = manifest.props.filter((p) => typeof p.backrestOffset === 'number');
  assert.ok(checked.length >= 12, `${checked.length} seats were measured`);
  // 靠背（高处的顶点）在座面后方 3 cm 以上才算朝前；朝外摆的椅子就是这一条没守住
  for (const p of checked) assert.ok(p.backrestOffset < -0.03, `${p.id} backrest offset ${p.backrestOffset}`);
  for (const id of ['outdoor_chair', 'dining_chair', 'shell_chair', 'cafe_chair', 'armchair', 'sofa2', 'sofa3']) assert.ok(checked.some((p) => p.id === id), `${id} is measured`);
  // 每个模型都标了怎么安装：落地、吊顶、挂墙
  assert.deepEqual([...new Set(PROP_ASSETS.map((p) => p.mount))].sort(), ['ceiling', 'floor', 'wall']);
  for (const p of PROP_ASSETS) {
    if (p.mount === 'ceiling') assert.ok(Math.abs(p.max[1]) < 1e-6, `${p.id} hangs from its origin`);
    else if (p.mount === 'wall') assert.ok(Math.abs(p.min[2]) < 1e-6, `${p.id} has its back on its origin`);
    else assert.ok(Math.abs(p.min[1]) < 1e-6, `${p.id} stands on its origin`);
  }
});

test('shop furniture faces the same way whichever side the shopfront is on', () => {
  // 四个朝向的门面、门面线段两种走向：face = π 朝门口，0 朝店内，π/2 朝 +a
  for (const side of ['N', 'S', 'E', 'W']) for (const flip of [false, true]) {
    const r = rect(0, 0, 8, 6);
    const line = { N: [0, 0, 8, 0], S: [0, 6, 8, 6], W: [0, 0, 0, 6], E: [8, 0, 8, 6] }[side];
    const f = flip ? { x0: line[2], z0: line[3], x1: line[0], z1: line[1], side } : { x0: line[0], z0: line[1], x1: line[2], z1: line[3], side };
    const F = unitFrame({ rects: [r], fronts: [f] });
    const towards = (face) => { const a = faceAngle(F, face); return [Math.sin(a), Math.cos(a)]; };
    const [dx, dz] = [F.at(1, 0)[0] - F.at(0, 0)[0], F.at(1, 0)[1] - F.at(0, 0)[1]], [ix, iz] = [F.at(0, 1)[0] - F.at(0, 0)[0], F.at(0, 1)[1] - F.at(0, 0)[1]];
    const near = (v, x, z, what) => assert.ok(Math.hypot(v[0] - x, v[1] - z) < 1e-9, `${side}${flip ? ' flipped' : ''} ${what}: ${v}`);
    near(towards(0), ix, iz, 'into the shop');
    near(towards(Math.PI), -ix, -iz, 'towards the door');
    near(towards(Math.PI / 2), dx, dz, 'towards +a');
    near(towards(-Math.PI / 2), -dx, -dz, 'towards −a');
    // 店内的点确实在矩形里
    const [px, pz] = F.at((F.umin + F.umax) / 2, F.depth / 2);
    assert.ok(px > 0 && px < 8 && pz > 0 && pz < 6);
  }
});

test('an L-shaped shop is furnished in the part behind its shopfront, not in a side strip', () => {
  // 一期 3F–6F 的 SQ-N2：一条 1 m 宽的边条和主体都贴着门面那条线，主体才是门面后面那一块
  const u = { rects: [rect(-20, -40, -19, -24), rect(-19, -28, -12, -24)], fronts: [{ x0: -19, z0: -24, x1: -12, z1: -24, side: 'S' }] };
  const F = unitFrame(u);
  assert.equal(F.main, u.rects[1]);
  assert.ok(Math.abs(F.umax - F.umin - 7) < 1e-9 && Math.abs(F.depth - 4) < 1e-9);
  for (const lv of layout().levels) for (const unit of lv.units) {
    if (unit.residence || !unit.fronts?.length) continue;
    const frameOf = unitFrame(unit), f = unit.fronts[0], len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
    // 主体和门面至少重合一半
    assert.ok(frameOf.umax - frameOf.umin >= Math.min(len, 2) * 0.5 - 1e-6, `${unit.id}: ${frameOf.umax - frameOf.umin} m wide behind a ${len} m front`);
  }
});

test('keep-clear zones cover shop doors, escalator ends, lift doors and entrances', () => {
  const lv = layout().levels.find((l) => l.id === 'P1-2F'), zones = accessZones(layout(), lv);
  const kinds = (re) => zones.filter((z) => re.test(z.what)).length;
  assert.ok(kinds(/店门/) > 20 && kinds(/扶梯/) >= 2 && kinds(/电梯/) >= 2, zones.length + ' zones');
  const door = zones.find((z) => z.poly);
  const cx = door.poly.reduce((s, p) => s + p[0], 0) / 4, cz = door.poly.reduce((s, p) => s + p[1], 0) / 4;
  assert.equal(blockedZone(zones, cx, cz, 0), door);
  assert.equal(blockedZone([door], cx + 40, cz + 40, 0.5), null);
  // 门洞的留空区一共深 2.8 m：店内 1.6 m、店外 1.2 m
  const depth = Math.hypot(door.poly[2][0] - door.poly[1][0], door.poly[2][1] - door.poly[1][1]);
  assert.ok(Math.abs(depth - (DOOR_CLEAR.inside + DOOR_CLEAR.outside)) < 1e-6);
  const ring = { what: '扶梯', circle: [0, 0, 2.2] }, gate = { what: '出入口', seg: { x0: 10, z0: 0, x1: 14, z1: 0 }, reach: 1.2 };
  assert.equal(blockedZone([ring], 2.5, 0, 0.4), ring);
  assert.equal(blockedZone([ring], 2.7, 0, 0.4), null);
  assert.equal(blockedZone([gate], 12, 1.5, 0.4), gate);
  assert.equal(blockedZone([gate], 12, 1.7, 0.4), null);
});

test('the floor guard knows the slab, its openings and every wall furniture could run into', () => {
  const guard = { zones: [], pieces: [{ outer: square(0, 0, 20, 10), holes: [square(8, 3, 12, 7)] }], walls: [{ x0: 15, z0: 0, x1: 15, z1: 6 }], grid: null };
  assert.equal(supported(guard, 2, 2), true);
  assert.equal(supported(guard, 10, 5), false, 'over the opening');
  assert.equal(supported(guard, 25, 5), false, 'off the slab');
  assert.equal(grounded(guard, 7.8, 5, 0.6), false, 'one side hangs over the opening');
  assert.equal(grounded(guard, 6, 5, 0.6), true);
  assert.equal(fits(guard, 14.5, 3, 1.4), false, 'a table set 0.5 m from a wall is squeezed');
  assert.equal(fits(guard, 13.9, 3, 1.4), true);
  // 单件家具按实际占地判断：贴着墙可以，墙从中间穿过不行
  assert.equal(crossed(guard, square(15.02, 1, 15.6, 3)), null, 'a cabinet standing against the wall');
  assert.equal(crossed(guard, square(14.6, 1, 15.4, 3)), guard.walls[0]);
  assert.equal(crossed(guard, square(14.6, 6.5, 15.4, 8)), null, 'past the end of the wall');
  assert.equal(crossed({ ...guard, walls: [{ x0: 4, z0: 4, x1: 4.4, z1: 4 }], grid: null }, square(3.5, 3.5, 5, 4.5)).x0, 4, 'a post wholly inside the footprint');

  // 真实楼层：守卫的墙都是导航里的墙（房间的门洞除外——门洞对家具来说也是墙），不凭空多出来
  const nav = buildNav(layout());
  const key = (s) => { const a = [Math.round(s.x0 * 100), Math.round(s.z0 * 100)], b = [Math.round(s.x1 * 100), Math.round(s.z1 * 100)]; return (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a]).join('|'); };
  let total = 0, unknown = 0;
  for (const id of ['P1-B1M', 'P1-1F', 'P1-3F', 'P1-6F', 'P1-RF', 'P2-2F', 'P3-2F', 'P1S-RF', 'P1W1-RF']) {
    const lv = layout().levels.find((l) => l.id === id), walls = levelWalls(layout(), lv), known = new Set(nav.floors.get(id).walls.map(key));
    total += walls.length;
    for (const s of walls) if (!known.has(key(s))) unknown++;
    const g = floorGuard(layout(), lv);
    assert.equal(g.walls.length, walls.length);
    assert.ok(g.pieces.length > 0 && g.zones.length >= 0);
  }
  assert.ok(total > 2000, `${total} wall segments`);
  assert.ok(unknown / total < 0.01, `${unknown} of ${total} guard walls are not navigation walls`);
  // 屋顶的格栅立柱、设备间这些，原来守卫不知道，桌椅就摆到了柱子上
  const roof = layout().levels.find((l) => l.id === 'P1S-RF'), post = roof.navObstacles.find((o) => /post/.test(o.id || ''));
  const [px, pz] = [post.poly.reduce((s, p) => s + p[0], 0) / post.poly.length, post.poly.reduce((s, p) => s + p[1], 0) / post.poly.length];
  assert.equal(fits(floorGuard(layout(), roof), px + 0.4, pz, 1.1), false, 'a table beside a lattice post');
});

test('a batch with a floor guard refuses models that block a door, hang over a void or straddle a wall', () => {
  const lib = library();
  usePropLibrary(lib);
  try {
    const B = new BatchSet(materials());
    B.guard = { zones: [{ what: '店门', poly: square(4, -1.2, 6, 1.6) }], pieces: [{ outer: square(0, -10, 20, 10), holes: [square(10, 4, 14, 8)] }], walls: [{ x0: 16, z0: -10, x1: 16, z1: 10 }], grid: null };
    const place = (id, x, z, opts) => { const before = B.placed?.length || 0; assert.equal(B.prop(id, x, 0, z, 0, 1, opts), true); return (B.placed?.length || 0) - before; };
    assert.equal(place('armchair', 2, -5), 1, 'free floor');
    assert.equal(place('armchair', 5, 0.5), 0, 'inside the door zone');
    assert.equal(place('armchair', 6.3, 0.5), 0, 'its footprint reaches into the door zone');
    assert.equal(place('armchair', 12, 6), 0, 'over the void');
    assert.equal(place('armchair', 16.1, -5), 0, 'the wall runs through it');
    assert.equal(place('armchair', 16.6, -5), 1, 'against the wall is fine');
    assert.equal(place('armchair', 30, 0), 0, 'off the slab');
    assert.deepEqual(lib.stats, { keptClear: 2, unfit: 2, walled: 1 });
    // 固定在别的东西上的（花坛里的植物）、吊顶和挂墙的不查
    assert.equal(place('plant_fern', 12, 6, { anchored: true }), 1);
    assert.equal(place('chandelier', 12, 6), 1);
    assert.equal(place('frame_b', 16.02, 0), 1);
    // 很小的东西（杯子、面包）不查
    assert.equal(place('tea_cup', 5, 0.5), 1);
    // 局部坐标系里摆的，按世界坐标判断
    B.frame(frame(100, 0, 0), () => assert.equal(place('armchair', -95, 0.5), 0, 'local (-95, .5) is world (5, .5): the door zone'));
    assert.equal(B.blocked(5, 0.5), true);
    assert.equal(B.unfit(2, -5, 1.4), false);
    assert.equal(B.unfit(15.5, -5, 1.4), true);
    const free = new BatchSet(materials());
    assert.equal(free.unfit(5, 0.5), false, 'no guard, no checks');
  } finally { usePropLibrary(null); }
});

test('every themed set is laid out sensibly', () => {
  const sets = themedSets();
  assert.equal(sets.filter((s) => s.kind === 'pocket').length, 36, '18 pocket sets, each at either end');
  assert.equal(sets.filter((s) => s.kind === 'showroom').length, 16, '4 styles × 4 slots');
  for (const set of auditSets()) assert.deepEqual(set.findings, [], set.name);
  // 规则本身是管用的：把挂画挪离墙面、把椅子转过去、把茶几挪出格子，都查得出来
  const hung = sets.find((s) => s.items.some((i) => i.id === 'frame_b'));
  const off = { ...hung, items: hung.items.map((i) => (i.id === 'frame_b' ? { ...i, x: i.x + i.front[0] * 0.08, z: i.z + i.front[1] * 0.08 } : i)) };
  assert.ok(checkSet(off).findings.some((f) => f.rule === 'wall' && f.id === 'frame_b'), 'a picture 8 cm off its wall');
  const dining = sets.find((s) => s.items.some((i) => i.id === 'dining_table'));
  const turned = { ...dining, items: dining.items.map((i) => (i.id === 'dining_chair' ? { ...i, front: [-i.front[0], -i.front[1]] } : i)) };
  assert.equal(checkSet(turned).findings.filter((f) => f.rule === 'facing').length, 4, 'four chairs with their backs to the table');
  assert.ok(SEATS.has('outdoor_chair'));
  assert.ok(EXTENT.showroom[0] <= 1.2 && EXTENT.showroom[1] <= 1.3, 'a showroom set fits a 2.4 m × 2.6 m slot');
  assert.equal(penetration(square(0, 0, 1, 1), square(0.9, 0, 2, 1)).toFixed(2), '0.10');
  assert.equal(penetration(square(0, 0, 1, 1), square(1.1, 0, 2, 1)), 0);
  // 口袋里的一组摆在哪一端都面朝口袋中间
  for (const end of [-1, 1]) {
    const placed = [];
    pocketSet({ hasProp: () => true, blob() {}, get: () => ({ box() {} }), prop: (id, x, y, z, ry) => placed.push({ id, x, ry }) }, 0, 0, 0, 0, end);
    assert.ok(Math.sin(placed[0].ry) * -end > 0.99, 'the bust looks towards the middle of the pocket');
  }
});

test('floor-standing models get a soft contact shadow, things on tables and in planters do not', () => {
  usePropLibrary(library());
  try {
    const decal = () => { const m = new THREE.MeshBasicMaterial({ transparent: true }); m.map = new THREE.Texture(); m.userData.decal = true; return m; };
    const B = new BatchSet(materials({ aoBlob: decal(), aoEdge: decal() }));
    B.floorY = 12;
    assert.equal(B.shaded, true);
    const QUAD = 6; // 一块贴地方片：两个三角形，不共用顶点
    const quads = () => (B.sets.aoBlob?.n || 0) / QUAD;
    B.prop('armchair', 0, 12, 0);
    assert.equal(quads(), 1);
    B.prop('vase_a', 0, 12.9, 0);
    assert.equal(quads(), 1, 'a vase on a plinth');
    B.prop('plant_fern', 3, 12, 0, 0, 1, { anchored: true });
    assert.equal(quads(), 1, 'a plant in a bed');
    B.prop('chandelier', 0, 16, 0); B.prop('frame_b', 0, 13.5, 0); B.prop('tea_cup', 0, 12, 0); B.prop('manhole', 5, 12, 0);
    assert.equal(quads(), 1, 'hung, tiny and flat things');
    B.prop('outdoor_table', 6, 12.12, 0);
    assert.equal(quads(), 2, 'a table on a 12 cm deck still counts as standing on the floor');
    B.edge(0, 0, 4, 0, 12, 0.6, 1);
    assert.equal(B.sets.aoEdge.n, QUAD);
    B.edge(0, 0, 0.1, 0, 12, 0.6, 1);
    assert.equal(B.sets.aoEdge.n, QUAD, 'too short to bother');
    // 没有假阴影材质的场合（FPS、别的测试）什么都不加
    const plain = new BatchSet(materials());
    plain.prop('armchair', 0, 0, 0); plain.blob(0, 0, 0, 1, 1); plain.edge(0, 0, 4, 0, 0);
    assert.equal(plain.shaded, false);
    assert.deepEqual(Object.keys(plain.sets), []);
  } finally { usePropLibrary(null); }
});

test('ceiling bays follow each walkway and their ribs stop at the voids of the floor above', () => {
  assert.deepEqual(runs(4, 1, (t) => t < 0.5), [[0, 0.5]]);
  assert.deepEqual(runs(4, 1, () => true), [[0, 1]]);
  assert.deepEqual(runs(4, 1, (t) => t < 0.25 || t > 0.75), [[0, 0.25], [0.75, 1]]);
  const F = frame(0, 0, 0);
  const walk = (id, r) => ({ id, kind: 'street', frame: F, rect: r, poly: rectPoly(r).map(([x, z]) => toW(F, x, z)) });
  const below = { id: 'T-1F', kind: 'retail', elev: 0, height: 6, walk: [walk('side', rect(40, 0, 48, 4.5)), walk('main', rect(0, 0, 48, 14)), { id: 'yard', kind: 'plaza', outdoor: true, frame: F, rect: rect(0, 20, 9, 29), poly: [] }] };
  const bays = ceilingBays(below);
  assert.deepEqual(bays.map((b) => b.w.id), ['main', 'side'], 'largest first, outdoor walks left out');
  assert.deepEqual([bays[0].nx, bays[0].nz], [12, 3], 'a 48 m × 14 m street: 4 m bays along, three rows across');
  assert.equal(bays[1].earlier.length, 1);
  // 上一层：整块楼板，中间一条 5 m 宽的街谷洞口（z 4.5–9.5）
  const above = { id: 'T-2F', kind: 'retail', elev: 6, slab: { pieces: [{ outer: square(-2, -2, 50, 16), holes: [] }] }, voids: [{ kind: 'street', poly: square(4, 4.5, 44, 9.5) }, { kind: 'shaft', poly: square(46, 10, 47, 11) }] };
  const boxes = [];
  const B = { frame: (f, fn) => fn(), get: (key) => ({ box: (x, y, z, sx, sy, sz, color, rot = 0) => boxes.push({ key, x, y, z, sx, sy, sz, rot }) }) };
  const ctx = { depthCues: true, lvById: { 'T-1F': below, 'T-2F': above }, levels: { 'T-1F': { batch: B } } };
  ceilingRelief(ctx, { id: 'T', levels: ['T-1F', 'T-2F'] }, below);
  const ribs = boxes.filter((b) => b.key === 'matte' && Math.abs(b.sy - RIB.depth) < 1e-9), beams = boxes.filter((b) => b.key === 'matte' && Math.abs(b.sy - EDGE_BEAM.depth) < 1e-9);
  assert.ok(ribs.length > 20, `${ribs.length} ribs`);
  const soffit = 6 - 0.45;
  for (const b of ribs) {
    assert.ok(Math.abs(b.y + RIB.depth / 2 - soffit) < 1e-9, 'ribs hang from the slab above');
    // 梁的每一段都在楼板底下，不伸到街谷洞口里（取样步长以内）
    const ends = b.sz > b.sx ? [[b.x, b.z - b.sz / 2 + RIB.step], [b.x, b.z + b.sz / 2 - RIB.step]] : [[b.x - b.sx / 2 + RIB.step, b.z], [b.x + b.sx / 2 - RIB.step, b.z]];
    for (const p of ends) assert.ok(!pointInPoly(p, above.voids[0].poly), `rib at ${b.x},${b.z} reaches under the void`);
  }
  // 横梁被街谷截成两段（两侧回廊底下各一段），街谷正上方没有
  const cross = ribs.filter((b) => b.sz > b.sx && Math.abs(b.x - 24) < 1e-6);
  assert.equal(cross.length, 2);
  assert.ok(cross.every((b) => b.sz < 5 && b.sz > 3.5));
  // 街谷四周有边梁，竖井不加
  assert.equal(beams.length, 4);
  assert.ok(beams.every((b) => Math.abs(b.y + EDGE_BEAM.depth / 2 - soffit) < 1e-9));
  assert.ok(beams.every((b) => !pointInPoly([b.x, b.z], above.voids[0].poly)), 'edge beams sit under the slab, not in the opening');
  assert.equal(boxes.filter((b) => b.key === 'glow').length, 4, 'a light strip under each edge beam');
  // FPS（没有 depthCues）和停车层不加
  const none = [];
  ceilingRelief({ ...ctx, depthCues: false, levels: { 'T-1F': { batch: { frame: (f, fn) => fn(), get: () => ({ box: () => none.push(1) }) } } } }, { id: 'T', levels: ['T-1F', 'T-2F'] }, below);
  assert.equal(none.length, 0);
});

test('mini-game props stand where they should: full-height shutters, a card on the table top, stacked boxes that hold', () => {
  // 卷帘门：从楼面拉到 3.05 m。原来放在楼面标高，模型上下各一半，下半截埋在地里
  const shutter = INFO.get('shutter'), at = shutterPlacement({ x0: 2, z0: 5, x1: 8, z1: 5, side: 'S' }, [0, 1], 6.5);
  assert.equal(shutter.mount, 'wall');
  assert.ok(Math.abs(at.y + shutter.min[1] * at.scale[1] - 6.5) < 1e-9, 'the bottom edge sits on the floor');
  assert.ok(Math.abs(at.y + shutter.max[1] * at.scale[1] - (6.5 + HEIST_PROPS.shutter.height)) < 1e-9, 'the top edge reaches the lintel');
  assert.ok(Math.abs(shutter.size[0] * at.scale[0] - 5.7) < 0.01, 'it spans the shopfront less 15 cm each side');
  assert.deepEqual([at.x, at.z], [5, 5 + HEIST_PROPS.shutter.gap], 'just outside the glass');
  assert.ok(Math.abs(Math.sin(at.ry)) < 1e-9 && Math.cos(at.ry) > 0.99, 'facing the walkway');
  assert.equal(shutterPlacement({ x0: 0, z0: 0, x1: 1, z1: 0, side: 'S' }, [0, 1], 0), null);
  assert.ok(Math.abs(shutter.size[0] - HEIST_PROPS.shutter.width) < 0.01 && Math.abs(shutter.size[1] - HEIST_PROPS.shutter.tall) < 0.01);
  // 门禁卡放在边几的台面上：台面就在包围盒顶（围边不高于 1 cm）
  const table = INFO.get('side_table');
  assert.ok(HEIST_PROPS.tableTop <= table.size[1] + 1e-9 && HEIST_PROPS.tableTop > table.size[1] - 0.01, `table top ${HEIST_PROPS.tableTop} vs ${table.size[1]}`);
  // 取餐点的一摞箱子：叠在上面的，底面贴着下面那只的顶面，重心落在下面那只的范围里
  const boxes = HUB_CARGO.map(([id, x, y, z, ry, scale]) => {
    const info = INFO.get(id), cos = Math.cos(ry), sin = Math.sin(ry), hx = info.size[0] * scale / 2, hz = info.size[2] * scale / 2;
    return { id, x, y, z, top: y + info.size[1] * scale, inside: (px, pz) => { const dx = px - x, dz = pz - z; return Math.abs(dx * cos - dz * sin) <= hx && Math.abs(dx * sin + dz * cos) <= hz; } };
  });
  const stacked = boxes.filter((b) => b.y > 0.01);
  assert.equal(stacked.length, 2);
  for (const b of stacked) {
    const under = boxes.find((o) => o !== b && Math.abs(o.top - b.y) < 0.02 && o.inside(b.x, b.z));
    assert.ok(under, `${b.id} at ${b.x}, ${b.y}, ${b.z} rests on a box below it`);
  }
  for (const b of boxes.filter((q) => q.y <= 0.01)) for (const o of boxes.filter((q) => q !== b && q.y <= 0.01)) assert.ok(!o.inside(b.x, b.z), 'boxes on the ground do not sit inside each other');
});

test('later furniture can ask whether earlier furniture already stands at a spot', () => {
  usePropLibrary(library());
  try {
    const B = new BatchSet(materials());
    assert.equal(B.crowded(0, 0, 2), false, 'nothing placed yet');
    B.prop('cafe_table', 10, 0, 10);
    const before = B.placed.length;
    B.prop('ottoman', 0, 0, 0);
    assert.equal(B.crowded(10.6, 10, 1), true);
    assert.equal(B.crowded(12, 10, 1), false);
    assert.equal(B.crowded(0.5, 0, 1), true, 'the ottoman counts by default');
    assert.equal(B.crowded(0.5, 0, 1, before), false, 'but not when only the earlier pieces are asked about');
    B.frame(frame(100, 0, 0), () => assert.equal(B.crowded(-90, 10, 1), true, 'local (-90, 10) is world (10, 10)'));
  } finally { usePropLibrary(null); }
});
