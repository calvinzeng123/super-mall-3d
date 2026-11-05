// 滨江整合（规格 §7.2）：云澜江景台让开北苑消防登高面与登高场地；从 x-rn-sq 过街走到北苑 2 号楼街门，
// 刷卡进大堂、乘私家梯 W 到 16F 入户门；商场环廊刷卡进候梯厅；西停车场地库刷卡进西苑 1 号楼电梯厅。
// 全程用真实门禁（tapGate / updateGates / gateBlocking），不刷卡就过不去；一键导览的滨江七步；紧凑 FPS 布局不变；园区总数钉住。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import clipping from 'polygon-clipping';
import { L, lvl } from './helpers.js';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, step, clear, linksNear, tapGate, updateGates, gateBlocking, resetGates, floorLabel, unitFront, landAt, NAV } from '../src/layout/nav.js';
import { toW, toL, pointInPoly, rectPoly, polyArea } from '../src/layout/geom.js';
import { NORTH_SITE } from '../src/layout/community-sites.js';
import { NORTH_ACCESS } from '../src/layout/residential-access.js';
import { RIVER_AXIS } from '../src/layout/river.js';
import { buildTourSteps } from '../src/render/tour.js';

const nav = buildNav(L), gates = L.accessControl.gates;
const floorY = (f) => (f === 'ground' ? 0 : nav.floors.get(f).y);
const S = (floor, x, z) => ({ floor, x, z, y: floorY(floor), slope: null });
const at = (s, p, e = .05) => Math.hypot(s.x - p[0], s.z - p[1]) < e;
const ring = (p) => [...p, p[0]];
const overlap = (a, b) => clipping.intersection([ring(a)], [ring(b)])
  .reduce((n, q) => n + Math.abs(polyArea(q[0])) - q.slice(1).reduce((t, h) => t + Math.abs(polyArea(h)), 0), 0);
/** 10 cm 一步；时钟每步走 36 ms，门禁状态每步更新（出门感应、到时关门） */
function walk(r, to) {
  let { s, now } = r;
  const n = Math.max(1, Math.ceil(Math.hypot(to[0] - s.x, to[1] - s.z) / .1)), dx = (to[0] - s.x) / n, dz = (to[1] - s.z) / n;
  for (let i = 0; i < n; i++) { s = step(nav, s, dx, dz, .036); now += .036; updateGates(nav, s, now); }
  return { s, now };
}
const route = (r, pts) => pts.reduce((q, p) => walk(q, p), r);
/** 没刷卡：朝住户一侧走，停在门线外 0.5 m 以内，HUD 提示刷这道门 */
function blocked(r, id, inside) {
  const g = gates.find((q) => q.id === id), q = walk(r, inside), [, v] = toL(g.frame, q.s.x, q.s.z);
  assert.ok(v < 0 && v > -.5, `${id} 未刷卡却走过了门线 (v=${v.toFixed(2)})`);
  assert.equal(gateBlocking(nav, q.s)?.id, id, `${id} 没有提示刷卡`);
  return q;
}
/** 刷卡：先确认读卡器就在手边（E 键可互动），再刷 */
function tap(r, id) {
  const g = gates.find((q) => q.id === id), [rx, rz] = toW(g.frame, g.reader.u, g.reader.v);
  assert.ok(Math.hypot(r.s.x - rx, r.s.z - rz) <= NAV.reach + .6, `${id} 读卡器离门口太远`);
  assert.ok(linksNear(nav, g.floors[0], rx, rz).some((n) => n.link.id === id && n.options[0].action === 'tap'), `${id} 读卡器不可互动`);
  assert.ok(tapGate(nav, id, r.now));
  return r;
}
/** 乘电梯：在候梯点用 linksNear 选层，落到目标层的停靠点 */
function ride(r, liftId, floor) {
  const n = linksNear(nav, r.s.floor, r.s.x, r.s.z).find((q) => q.link.id === liftId), o = n?.options.find((q) => q.floor === floor);
  assert.ok(o, `${liftId} 在 ${r.s.floor} 不能去 ${floor}`);
  const s = S(o.floor, o.x, o.z);
  assert.ok(clear(nav, s), `${liftId} ${floor} 出梯点不可站立`);
  return { s, now: r.now + 30 };
}

test('江景台：露台读取北苑 1/2 号楼的消防登高面，任何消防登高场地上空没有露台、挑台或楼板', () => {
  const north = L.buildings.filter((b) => b.community === 'north');
  assert.deepEqual(north.map((b) => b.id), ['T1', 'T2']);
  assert.deepEqual(north.map((b) => b.fireFrontage), NORTH_SITE.towers.map((t) => t.plate));
  const T = lvl('P1-3F').riverTerrace;
  assert.deepEqual(T.frontages, north.map((b) => b.fireFrontage), '江景台没有读取塔楼的消防登高面');
  const fa = L.site.fireAccess;
  assert.deepEqual(fa.map((f) => [f.id, f.tower]), [['HS1', 'T1'], ['HS2', 'T2']]);
  for (const b of north) assert.ok(fa.some((f) => f.tower === b.id && JSON.stringify(f.rect) === JSON.stringify(b.hardstand)), `${b.id} 登高场地未登记`);
  for (const f of fa) {
    const hs = rectPoly(f.rect);
    for (const p of T.pieces) assert.ok(overlap(p.outer, hs) < 1e-6, `江景台压在 ${f.id} 上空`);
    for (const p of T.prows) assert.ok(overlap(p.poly, hs) < 1e-6, `${p.id} 压在 ${f.id} 上空`);
    // 登高场地上空完全露天：地面以上任何楼层的楼板与导航面都不进入
    for (const lv of L.levels.filter((l) => l.elev > .5)) {
      for (const p of lv.slab.pieces) assert.ok(overlap(p.outer, hs) < 1e-6, `${lv.id} 楼板压在 ${f.id} 上空`);
      for (const n of lv.navSurfaces || []) if (n.poly) assert.ok(overlap(n.poly, hs) < 1e-6, `${lv.id} ${n.id} 压在 ${f.id} 上空`);
    }
  }
});

test('住户回家：x-rn-sq 过北外环 → 北苑 2 号楼街门 → 刷卡进大堂 → 私家梯 W → 16F 入户门（不刷卡进不去）', () => {
  resetGates(nav);
  const start = [-228, -262], xing = L.site.crossings.find((c) => c.id === 'x-rn-sq');
  assert.ok(pointInPoly(start, xing.poly), '起点不在 x-rn-sq 斑马线上');
  assert.equal(RIVER_AXIS, -228, '斑马线在方庭北门轴线上');
  assert.ok(clear(nav, S('ground', ...start)));
  const door = L.entrances.find((e) => e.id === 'T2-STREET'), x = (door.seg.x0 + door.seg.x1) / 2;
  let r = route({ s: S('ground', ...start), now: 0 }, [[-228, -250], [x, -244], [x, -238.6]]);
  assert.equal(r.s.floor, 'P1-1F', '没有从街门走进门斗');
  assert.ok(at(r.s, [x, -238.6]));
  // 门斗玻璃门：不刷卡挡住；刷卡后进大堂，HUD 显示住户区
  r = tap(blocked(r, 'T2-STREET-GATE', [x, -236]), 'T2-STREET-GATE');
  r = walk(r, [x, -235.2]);
  assert.ok(at(r.s, [x, -235.2]), `刷卡后仍进不去大堂 (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
  assert.equal(floorLabel(nav, L, r.s), '北苑 2 号楼 · 住户大堂（一期 1F）');
  // 大堂 → 私家梯 W 的 1F 候梯点
  const lw = nav.links.find((k) => k.id === 'T2-LW'), stop = lw.stops.find((q) => q.floor === 'P1-1F');
  assert.equal(lw.name, '北苑住户电梯 W');
  r = route(r, [[r.s.x, stop.z], [stop.x, stop.z]]);
  assert.ok(at(r.s, [stop.x, stop.z]), `大堂走不到私家梯 (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
  // 乘梯到 16F：停的是那一户（16–17F 错层复式下层）的入户门厅
  r = ride(r, 'T2-LW', 'T2-16F');
  const home = lvl('T2-16F').units.find((u) => u.residence?.entryDoor && u.wfronts?.length);
  assert.ok(home, 'T2-16F 没有带入户门的户');
  assert.equal(home.id, 'T2-16F-W');
  assert.deepEqual(home.residence.homeLevels, ['T2-16F', 'T2-17F']);
  const w = unitFront(L, home), t = home.residence.entryDoor.at / Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
  const d = [w.x0 + (w.x1 - w.x0) * t, w.z0 + (w.z1 - w.z0) * t];
  r = walk(r, [d[0] + w.nx * .85, d[1] + w.nz * .85]);
  assert.ok(at(r.s, [d[0] + w.nx * .85, d[1] + w.nz * .85]), `16F 候梯厅走不到入户门 (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
  r = walk(r, [d[0] - w.nx * 1.2, d[1] - w.nz * 1.2]);
  assert.equal(r.s.floor, 'T2-16F');
  assert.ok(home.polys.some((p) => pointInPoly([r.s.x, r.s.z], p)), `没有从入户门进到户内 (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
  resetGates(nav);
});

test('商场一侧：方庭北环廊 (−220, −221) 刷 T2-1F-GATE 闸机 → 2 号楼候梯厅，三部住户电梯都能按到', () => {
  resetGates(nav);
  let r = { s: S('P1-1F', -220, -221), now: 0 };
  assert.ok(clear(nav, r.s));
  assert.ok(!floorLabel(nav, L, r.s).includes('住户'), '起点已在住户区');
  r = tap(blocked(r, 'T2-1F-GATE', [-220, -226.5]), 'T2-1F-GATE');
  const aisle = NORTH_SITE.towers.find((t) => t.id === 'T2').core[0] - 2.2;   // 绕开礼宾台
  const band = NORTH_ACCESS.T2.band, z = (band.z0 + band.z1) / 2;
  r = route(r, [[-220, -226.5], [aisle, -226.5], [aisle, z], [(band.x0 + band.x1) / 2, z]]);
  assert.ok(pointInPoly([r.s.x, r.s.z], rectPoly(band)), `闸机后走不到候梯厅 (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
  assert.equal(floorLabel(nav, L, r.s), '北苑 2 号楼 · 住户大堂（一期 1F）');
  for (const id of ['T2-LW', 'T2-LF', 'T2-LE']) {
    const st = nav.links.find((k) => k.id === id).stops.find((q) => q.floor === 'P1-1F');
    r = walk(r, [st.x, st.z]);
    assert.ok(at(r.s, [st.x, st.z]), `候梯厅走不到 ${id}`);
    assert.ok(linksNear(nav, 'P1-1F', st.x, st.z).some((n) => n.link.id === id && n.options.length >= 15), `${id} 不能选层`);
  }
  resetGates(nav);
});

test('西苑地库：西停车场 B1 车库 → 门户 → 刷 W1-B1-GATE → 西苑 1 号楼客梯 L1（不刷卡进不去）', () => {
  resetGates(nav);
  const g = gates.find((q) => q.id === 'W1-B1-GATE'), lane = g.lanes[0], u = (lane.u0 + lane.u1) / 2;
  const [x, z0] = toW(g.frame, u, -1.2), inside = toW(g.frame, u, 2.5);
  let r = { s: S('WPG-B1', x, -222), now: 0 };
  assert.ok(clear(nav, r.s));
  assert.match(floorLabel(nav, L, r.s), /^西侧车库/);
  r = walk(r, [x, z0]);
  assert.equal(r.s.floor, 'W1-B1', '没有经门户走进西苑 1 号楼地库电梯厅');
  assert.ok(at(r.s, [x, z0]));
  r = tap(blocked(r, 'W1-B1-GATE', inside), 'W1-B1-GATE');
  r = walk(r, inside);
  assert.ok(at(r.s, inside), '刷卡后仍进不去');
  const st = nav.links.find((k) => k.id === 'W1-L1').stops.find((q) => q.floor === 'W1-B1');
  r = walk(r, [st.x, st.z]);
  assert.ok(at(r.s, [st.x, st.z]), `走不到 W1-L1 (${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
  assert.equal(floorLabel(nav, L, r.s), '西苑 1 号楼 · 住户电梯厅（B1）');
  const up = ride(r, 'W1-L1', 'W1-12F');
  assert.equal(up.s.floor, 'W1-12F');
  // 到时关门：之后从车库一侧再走又被挡住
  r = walk({ s: S('W1-B1', x, z0), now: r.now + g.hold + 5 }, [x, z0]);
  assert.equal(nav.gates.get(g.id).open, false, '门禁没有自动关闭');
  blocked(r, 'W1-B1-GATE', inside);
  resetGates(nav);
});

test('一键导览：一期天台之后依次是云澜江、星湾桥、江景台、北苑、商场住户通道、西苑、对岸，人视镜头都站在能站人的地方', () => {
  const steps = buildTourSteps(L), i = steps.findIndex((s) => s.caption.startsWith('一期天台')), added = steps.slice(i + 1, -1);
  assert.deepEqual([...new Set(added.map((s) => s.caption))], ['云澜江 · 星湾桥连接一期与二期', '星湾桥 · 146 m 系杆拱与跨中玻璃挑台',
    '云澜江景台 · 3F 江景露台与玻璃眺台', '云澜·北苑 · 一梯一户江景大平层与错层复式', '云澜·北苑 · 商场住户通道（刷卡门禁）',
    '云澜·西苑 · 3梯5户社区', '对岸看江景商场与北苑']);
  assert.equal(steps.at(-1).caption, '园区全景');
  for (const s of added) {
    assert.ok([...s.pos.toArray(), ...s.target.toArray(), s.dur].every(Number.isFinite), s.caption);
    if (s.building) assert.ok(L.buildings.some((b) => b.id === s.building), `${s.caption} ${s.building}`);
    if (s.focus) assert.equal(lvl(s.focus)?.building, s.building ?? 'P1', `${s.caption} ${s.focus}`);
    const [x, y, z] = s.pos.toArray(), F = y < 20 && landAt(nav, x, z, y);
    // 低机位 = 人眼高度：脚下 1.5–2.5 m 有可站立的楼面（不在墙里、柱里、水面上）
    if (F) assert.ok(y - F.y > 1.5 && y - F.y < 2.5 && clear(nav, S(F.floor, x, z)), `${s.caption} 镜头 (${x},${y},${z}) 脚下 ${F.floor}@${F.y}`);
  }
  assert.equal(added.filter((s) => s.pos.y < 20).length, 6, '应有 6 个人视机位');
  // 商场住户通道：沿方庭北门轴线进门，1F 剖切后才画出闸机，之后西苑一步撤掉剖切
  const gate = added.filter((s) => s.caption.includes('商场住户通道'));
  assert.deepEqual(gate.map((s) => [s.pos.x, s.focus ?? null]), [[RIVER_AXIS, null], [RIVER_AXIS, 'P1-1F'], [-220, 'P1-1F']]);
  assert.equal(added.find((s) => s.caption.startsWith('云澜·西苑')).building, 'W1');
});

test('紧凑 FPS 布局哈希不变', () => {
  const pinned = readFileSync(new URL('./fps-frozen.test.js', import.meta.url), 'utf8').match(/FPS_LAYOUT_SHA256 = '([0-9a-f]{64})'/)[1];
  const json = JSON.stringify(buildLayout({ expansion: false }));
  assert.equal(createHash('sha256').update(json).digest('hex'), pinned);
});

test('园区总数（游览布局，实测）：338 层、76 部电梯、106 部楼梯、664 个商铺、1,066 条住宅记录（1,046 户）', () => {
  const units = L.levels.flatMap((l) => l.units || []), res = units.filter((u) => u.residence);
  assert.equal(L.levels.length, 338);
  assert.equal(L.elevators.length, 76);
  assert.equal(L.stairs.length, 106);
  assert.equal(units.length - res.length, 664);
  assert.equal(units.filter((u) => !u.residence && lvl(u.level).building === 'P1').length, 367);
  assert.equal(res.length, 1066);
  assert.equal(new Set(res.map((u) => u.residence.home ?? u.id)).size, 1046);
  const homes = (c) => new Set(res.filter((u) => u.residence.community === c).map((u) => u.residence.home ?? u.id)).size;
  assert.deepEqual([homes('west'), homes('north')], [270, 48]);
  assert.deepEqual([gates.length, L.accessControl.zones.length], [14, 12]);
  const P = L.site.westParking;
  assert.deepEqual([P.stallCount, P.lots.length, P.evCount, P.accessibleCount], [427, 20, 51, 9]);
  assert.deepEqual([L.site.urban.buildings.length, L.site.urban.trees.length], [82, 1314]);
});

test('位置提示：江景台、玻璃挑台、星湾桥与跨中挑台、南岸步道、玻璃眺台、对岸绿道与观景亭都报出地名；社区塔楼用全名、街门门厅单独命名', () => {
  const label = (floor, x, z) => floorLabel(nav, L, S(floor, x, z));
  assert.equal(label('P1-3F', -235, -246), '云澜江景台（一期 3F）');
  assert.equal(label('P1-3F', -235, -254.5), '云澜江景台 · 江景台玻璃挑台（一期 3F）');
  assert.equal(label('P1-3F', -174, -254.5), '云澜江景台 · 江景台玻璃挑台（一期 3F）');
  assert.equal(label('ground', -13, -330), '室外 · 星湾桥');
  assert.equal(label('ground', -20, -363), '室外 · 星湾桥 · 跨中玻璃挑台');
  assert.equal(label('ground', -540, -330), '室外 · 城西桥');
  assert.equal(label('ground', -100, -282), '室外 · 南岸滨江步道');
  assert.equal(label('ground', -228, -300), '室外 · 江景玻璃眺台');
  assert.equal(label('ground', -100, -444), '室外 · 北岸滨江绿道');
  assert.equal(label('ground', -228, -445), '室外 · 观景亭 · 对岸滨江公园');
  assert.equal(label('W1-12F', -456, -241.8), '云澜·西苑 1 号楼 · 12F 五户住宅');
  assert.ok(!label('W1-1F', -456, -224).includes('西苑1'), label('W1-1F', -456, -224));
  assert.equal(label('T2-16F', -212, -238), '云澜·北苑 2 号楼 · 16F 错层复式');
  for (const [b, x] of [['1', -272], ['2', -220]]) assert.equal(label('P1-1F', x, -238.8), `北苑 ${b} 号楼 · 住户门厅（一期 1F）`);
  // 门厅只改提示，不影响门禁：街门门禁仍挡在刷卡门线上。
  assert.ok(gates.some((g) => g.id === 'T2-STREET-GATE'));
});

test('方庭 3F 去江景台的北通道口正对走廊：北侧扶梯移到通道口以东，3F 走廊沿 x 方向能直接走进通道并到江景台', () => {
  const art = L.escalators.filter((e) => /SQ-ART-(3F|5F)/.test(e.id));
  assert.equal(art.length, 4);
  for (const e of art) assert.ok(Math.min(e.bottom.x, e.top.x) > -216, `${e.id} 仍挡在通道口前 (${e.bottom.x.toFixed(2)})`);
  // 通道口 x[−224,−216] 南侧 4 m 内整条可站（不再只剩扶梯与口线之间 1.1 m 的缝）。
  for (let x = -223.5; x <= -216.5; x += .5) for (let z = -223.5; z <= -220; z += .5) assert.ok(clear(nav, S('P1-3F', x, z)), `通道口前 (${x},${z}) 站不了人`);
  let r = { s: S('P1-3F', -232, -220.5), now: 0 };
  assert.ok(clear(nav, r.s));
  r = route(r, [[-220, -220.5], [-220, -224.5], [-220, -232], [-220, -235.5]]);
  assert.ok(at(r.s, [-220, -235.5], .2), `没走进北通道：(${r.s.x.toFixed(2)},${r.s.z.toFixed(2)})`);
});
