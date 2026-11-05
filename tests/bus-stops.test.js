// 二期星湾广场站：港湾、站台、过街横道与停靠公交；以及一期大道侧候车亭的碰撞与南侧步道绕行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { buildLayout } from '../src/layout/layout.js';
import { addBusStops, busTrack, trackPose, busTimetable, busDistance, busOutline, BUS } from '../src/layout/bus-stops.js';
import { rect, rectPoly, pointInPoly, convexOverlap, polysOverlap, distToPolyEdge, polyBounds } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import * as THREE from 'three';
import { BatchSet } from '../src/render/batch.js';
import { buildBusStops } from '../src/render/build/bus-stops.js';
import { buildTraffic, busGeometry } from '../src/render/build/traffic.js';

const S = L.site, nav = buildNav(L);
const stops = S.busStops.filter(s => s.kind === 'bay');
const [wb, eb] = stops;
const crossing = S.crossings.find(c => c.id === 'p2-bus-crossing');
const avenue = S.roads.find(r => r.id === 'avenue');
const insidePoly = (p, poly, eps = 1e-6) => pointInPoly(p, poly) || distToPolyEdge(p, poly) < eps;
const polyGap = (a, b) => polysOverlap(a, b) ? 0 : Math.min(...a.map(p => distToPolyEdge(p, b)), ...b.map(p => distToPolyEdge(p, a)));

function walk(points) {
  let s = { floor: 'ground', x: points[0][0], z: points[0][1], y: 0, slope: null };
  assert.ok(clear(nav, s), `start ${points[0]} not standable`);
  for (const [x, z] of points.slice(1)) {
    const n = Math.ceil(Math.hypot(x - s.x, z - s.z) / .1), dx = (x - s.x) / n, dz = (z - s.z) / n;
    for (let i = 0; i < n; i++) s = step(nav, s, dx, dz, 0);
    if (Math.hypot(s.x - x, s.z - z) > .05) return { ok: false, at: [s.x, s.z], target: [x, z] };
  }
  return { ok: true, at: [s.x, s.z] };
}
const walks = (name, points) => { const r = walk(points); assert.ok(r.ok, `${name} blocked at ${r.at?.map(v => v.toFixed(2))} → ${r.target}`); };
const reach = (from, to) => {
  let s = { floor: 'ground', x: from[0], z: from[1], y: 0, slope: null };
  const n = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / .1);
  for (let i = 0; i < n; i++) s = step(nav, s, (to[0] - from[0]) / n, (to[1] - from[1]) / n, 0);
  return s;
};

test('一对港湾式车站只在完整园区登记一次，不进入车道、道路记录或交通中心', () => {
  assert.equal(stops.length, 2);
  assert.equal(addBusStops(L), S.busStops, '二次调用必须复用原记录');
  assert.equal(S.crossings.filter(c => c.id === crossing.id).length, 1);
  assert.equal(S.walk.filter(w => w.id === crossing.id).length, 1);
  assert.equal(buildLayout({ expansion: false }).site.busStops, undefined, 'FPS 紧凑布局不应有星湾公交站');
  assert.ok(!S.roads.some(r => r.id.includes('bus')) && !L.extensions.roads.some(r => r.id.includes('bus')));
  assert.equal(S.transitCenter.vehicles.filter(v => v.type === 'coach').length, 2);
  for (const s of stops) {
    assert.equal(s.name, '星湾广场站');
    // Outside the six lanes, entirely beside the avenue carriageway.
    assert.ok(!convexOverlap(s.bay, avenue.poly), `${s.id} 港湾压到车道`);
    assert.ok(s.bay.every(([, z]) => Math.abs(z) >= 14 - 1e-9 && Math.abs(z) <= 17.5 + 1e-9));
    for (const b of s.berths) {
      assert.ok(b.poly.every(p => insidePoly(p, s.bay)), `${b.id} 泊位超出港湾`);
      assert.ok(b.rect.x1 - b.rect.x0 >= 15 && b.rect.z1 - b.rect.z0 >= 3.5);
    }
    // Every station area is a walk area and keeps lamps and trees out.
    for (const poly of [s.platform.poly, s.pocket.poly, s.landing.poly]) {
      assert.ok(S.walk.some(w => w.poly === poly));
      assert.ok(S.activityExclusions.includes(poly));
    }
    assert.ok(S.activityExclusions.includes(s.bay));
  }
});

test('港湾离路口 ≥50 m，离车库坡口、车道入口和地铁出入口 ≥15 m', () => {
  const junctionEdges = [-10, 10, 16, 286, -286];
  for (const s of stops) {
    const b = polyBounds(s.bay);
    for (const x of junctionEdges) assert.ok(Math.min(Math.abs(b.x0 - x), Math.abs(b.x1 - x)) >= 50, `${s.id} 距路口 ${x} 不足 50 m`);
    for (const [kind, polys] of [['trench', S.trenches], ['opening', S.openings], ['driveway', S.driveways],
      ['kiosk', L.entrances.filter(e => e.kiosk).map(e => e.kiosk.poly)]]) {
      for (const p of polys) assert.ok(polyGap(s.bay, p) >= 15, `${s.id} 距 ${kind} 不足 15 m`);
    }
    const others = S.crossings.filter(c => c !== crossing && c.poly.some(([, z]) => Math.abs(z) <= 14));
    for (const c of others) assert.ok(polyGap(s.bay, c.poly) >= 50, `${s.id} 距 ${c.id} 不足 50 m`);
  }
  // The crossing joins both sidewalks between the two bays.
  assert.ok(polyGap(crossing.poly, wb.bay) > 3 && polyGap(crossing.poly, eb.bay) > 3);
  assert.equal(crossing.rect.z0, -14); assert.equal(crossing.rect.z1, 14);
});

test('候车亭、座椅、站牌和信号灯不占港湾、泊位和横道，候车亭前留 ≥2.1 m 净宽', () => {
  for (const s of stops) {
    const areas = [s.platform.poly, s.pocket.poly, s.landing.poly, crossing.poly,
      ...S.sidewalks.map(w => w.poly), rectPoly(rect(165, -16, 180, 16))];
    for (const o of s.obstacles) {
      for (const q of [...stops.map(t => t.bay), crossing.poly, ...stops.flatMap(t => t.berths.map(b => b.poly))])
        assert.ok(!convexOverlap(o.poly, q), `${o.id} 压到港湾或横道`);
      // Station lamps stand on the lawn just beyond the pocket ends.
      if (o.id.includes('-lamp-')) assert.ok(!convexOverlap(o.poly, avenue.poly) && polyGap(o.poly, s.pocket.poly) < 2);
      else assert.ok(o.poly.every(p => areas.some(a => insidePoly(p, a))), `${o.id} 不在站区内`);
    }
    const sh = s.shelter;
    const under = s.obstacles.filter(o => o.poly.some(([x]) => x > sh.x0 - .01 && x < sh.x1 + .01) && o.poly.every(([, z]) => Math.abs(z) < 21));
    const nearest = Math.min(...under.flatMap(o => o.poly.map(([, z]) => Math.abs(z - s.platform.edgeZ))));
    assert.ok(nearest >= 2.1, `${s.id} 候车亭前净宽仅 ${nearest.toFixed(2)} m`);
    // Shelter, canopy and tactile edge all sit on the raised platform.
    assert.ok(rectPoly(rect(sh.x0, Math.min(sh.z - sh.d / 2, sh.z + sh.d / 2), sh.x1, Math.max(sh.z - sh.d / 2, sh.z + sh.d / 2))).every(p => insidePoly(p, s.platform.poly)));
    assert.equal(s.platform.edgeZ, s.bay.reduce((z, p) => (Math.abs(p[1]) > Math.abs(z) ? p[1] : z), 0));
  }
});

test('从星湾广场门经站台、横道到公园，以及东行站台到公园都能实走', () => {
  const sa = L.entrances.find(e => e.id === 'P2-SA'), sb = L.entrances.find(e => e.id === 'P2-SB');
  const door = (e, d) => [(e.seg.x0 + e.seg.x1) / 2 + e.nx * d, (e.seg.z0 + e.seg.z1) / 2 + e.nz * d];
  walks('星湾广场门 → 西行站台 → 横道 → 公园', [door(sa, 1.2), [143.6, -23], [143.5, -18.2], [125, -18], [172, -18], [172, 22], [150, 30]]);
  walks('站台后侧袋状步道东西贯通', [[100, -17], [107.5, -22.5], [152.5, -22.5], [160, -17]]);
  walks('冰场门 → 过街落脚区 → 横道', [door(sb, 1.2), [177.8, -23], [172, -20], [172, 0]]);
  walks('东行站台 → 西端开口 → 袋状步道 → 公园', [[223, 18], [197, 18], [197, 23], [186.5, 23], [150, 30]]);
  walks('沿北侧人行道经过西行港湾', [[60, -18.5], [100, -18.5]]);
  for (const s of stops) {
    // Walking through the glass wind screen is stopped at the screen.
    const x = s.shelter.x + 2.5, from = [x, s.platform.edgeZ + s.side * .5], to = [x, s.side * 21.5];
    const end = reach(from, to);
    assert.ok(Math.abs(end.z) < 20.5 && Math.abs(end.z) > 19, `${s.id} 挡风玻璃可被穿过 (${end.z.toFixed(2)})`);
  }
});

test('一期大道候车亭背板与长椅有碰撞，南侧步道绕到候车亭东侧仍可通行', () => {
  const p1 = S.busStops.find(s => s.id === 'p1-avenue-stop');
  assert.ok(p1 && p1.obstacles.length >= 2);
  for (const x of [-73, -71.5, -70, -67]) {
    const end = reach([x, -14.3], [x, -20.5]);
    assert.ok(end.z > -16.6, `穿过一期候车亭背板 x=${x} 到达 ${end.z.toFixed(2)}`);
  }
  // The promenade centreline along the sidewalk stays clear of the shelter.
  for (const o of p1.obstacles) assert.ok(o.poly.every(([, z]) => z > -17 + .35), `${o.id} 挡住步道中线`);
  const prom = S.forecourt.paths.find(p => p.id === 'south-promenade');
  assert.deepEqual(prom.points.slice(2, 5), [[-94, -17], [-63, -17], [-63, -23]]);
  for (const o of p1.obstacles) assert.ok(!convexOverlap(o.poly, prom.polys[3]), `${o.id} 堵住步道北折段`);
  walks('南侧步道：沿中线在候车亭后侧通过，再于东侧北折', [[-150, -23], ...prom.points.slice(1)]);
  walks('南侧步道：反向', [...prom.points.slice(1)].reverse());
  walks('候车亭前的候车区可沿路缘通行', [[-94, -14.3], [-63, -14.3]]);
});

test('停靠公交：车轮始终在车道或港湾内，停稳时整车在泊位内且车门朝站台，同向两车不重叠', () => {
  const obstacles = S.busStops.flatMap(s => s.obstacles);
  for (const s of stops) {
    const track = busTrack(s), half = rectPoly(s.side < 0 ? rect(-300, -14, 300, -2.2) : rect(-300, 2.2, 300, 14));
    const inCarriageway = p => Math.abs(p[0]) > 290 || insidePoly(p, half, .02) || insidePoly(p, s.bay, .02);
    const pose = {};
    for (let d = 0; d <= track.total; d += .25) {
      trackPose(track, d, pose);
      const outline = busOutline(pose);
      if (pose.x < 60 || pose.x > 260) continue;
      for (let u = -1; u <= 1; u += .25) for (const v of [-1, 1]) {
        const p = [pose.x + pose.hx * u * BUS.length / 2 - pose.hz * v * BUS.width / 2, pose.z + pose.hz * u * BUS.length / 2 + pose.hx * v * BUS.width / 2];
        assert.ok(inCarriageway(p), `${s.id} 车身越过路缘 (${p.map(n => n.toFixed(2))})`);
      }
      for (const o of obstacles) assert.ok(!convexOverlap(outline, o.poly, 0), `${s.id} 公交扫过 ${o.id}`);
    }
    const tables = s.service.buses.map(bus => ({ bus, table: busTimetable(track, bus) }));
    for (const { bus, table } of tables) {
      assert.ok(table.end <= table.period, `${bus.id} 一个周期内跑不完`);
      assert.ok(table.leave - table.arrive >= 15);
      const berth = s.berths.find(b => b.id === bus.berth);
      const rest = trackPose(track, busDistance(table, table.offset + (table.arrive + table.leave) / 2));
      assert.ok(busOutline(rest).every(p => insidePoly(p, berth.poly, .01)), `${bus.id} 停靠时超出泊位 ${berth.id}`);
      assert.ok(Math.abs(rest.x - berth.x) < .05);
      assert.ok(Math.sign(rest.hx) === s.travel, `${bus.id} 逆向停靠`);
      // Doors are on the bus's right (local -x), which must face the platform.
      const doorSide = [-rest.hz, rest.hx];
      assert.ok(doorSide[1] * s.side > .99, `${bus.id} 车门背向站台`);
    }
    for (let t = 0; t < 180; t += .25) {
      const shapes = tables.map(({ table }) => busDistance(table, t)).filter(d => d !== null).map(d => busOutline(trackPose(track, d), .3));
      if (shapes.length === 2) assert.ok(!convexOverlap(shapes[0], shapes[1], 0), `${s.id} 两车在 t=${t} 重叠`);
    }
  }
});

const paint = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => (t[k] = v, true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
function renderCtx() {
  const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial() });
  const site = { group: new THREE.Group(), batch: new BatchSet(materials), labels: new THREE.Group(), picks: new THREE.Group() };
  return { layout: L, site, root: new THREE.Group(), dynamic: [], levels: {}, paths: { site: {}, levels: {} },
    carGeo: new THREE.BoxGeometry(1.8, 1.4, 4.4), carMat: new THREE.MeshStandardMaterial({ vertexColors: true }),
    mats: { base: materials, floor: () => new THREE.MeshBasicMaterial(), sign: map => new THREE.MeshBasicMaterial({ map }), onNight() {} } };
}

test('渲染：站区构件与招牌都在场地批次和一张图集里，港湾上方只有路面与标线', () => {
  const ctx = renderCtx(), group = buildBusStops(ctx);
  assert.ok(group && ctx.site.group.children.includes(group));
  assert.deepEqual(group.children.map(m => m.name).sort(), ['bus-bay-asphalt', 'bus-bay-legend', 'bus-station-paving', 'bus-stop-signs']);
  // Fascia front/back, both pole faces, both totem faces and the route map, per stop.
  assert.equal(group.userData.signFaces, 14);
  const signs = group.getObjectByName('bus-stop-signs'), legend = group.getObjectByName('bus-bay-legend');
  assert.equal(signs.material.map, legend.material.map, '招牌与路面字应共用一张图集');
  for (const m of group.children) assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));
  const flushed = new THREE.Group();
  ctx.site.batch.flush(flushed);
  assert.ok(flushed.children.length >= 6);
  let raised = 0;
  for (const mesh of flushed.children) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const p = [pos.getX(i), pos.getZ(i)], y = pos.getY(i);
      assert.ok(Number.isFinite(y));
      for (const s of stops) if (y > .03 && pointInPoly(p, s.bay) && distToPolyEdge(p, s.bay) > .05) raised++;
    }
  }
  assert.equal(raised, 0, '港湾上方不应有高于路缘的构件');
  // Lettered panels face the road, the plaza behind and both kerb directions.
  const n = signs.geometry.attributes.normal;
  const dirs = new Set();
  for (let i = 0; i < n.count; i++) dirs.add(`${Math.round(n.getX(i))},${Math.round(n.getY(i))},${Math.round(n.getZ(i))}`);
  assert.deepEqual([...dirs].sort(), ['-1,0,0', '0,0,-1', '0,0,1', '1,0,0']);
  assert.ok([...legend.geometry.attributes.normal.array].every((v, i) => Math.abs(v - (i % 3 === 1 ? 1 : 0)) < 1e-6));
});

test('渲染：公交为一个不投影的实例化网格，按时刻停靠泊位、离站后驶离', () => {
  const g = busGeometry(), pos = g.attributes.position;
  assert.ok(pos.count < 2000, `公交模型顶点过多 ${pos.count}`);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  assert.ok(Math.abs(bb.max.z - BUS.length / 2) < .05 && Math.abs(bb.min.z + BUS.length / 2) < .05 && bb.max.y <= BUS.height + 1e-6);
  // Doors sit on the right-hand side (local -x) of a bus facing +z.
  const doors = [];
  for (let i = 0; i < pos.count; i++) if (pos.getX(i) < -BUS.width / 2 - .02) doors.push(pos.getZ(i));
  assert.ok(doors.length > 0 && Math.max(...doors) > 4);
  const ctx = renderCtx();
  buildTraffic(ctx);
  const line = ctx.busService, mesh = line.mesh;
  assert.equal(mesh.count, 4); assert.equal(mesh.castShadow, false); assert.ok(ctx.site.group.children.includes(mesh));
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const at = i => { mesh.getMatrixAt(i, m); m.decompose(p, q, sc); return { x: p.x, z: p.z, s: sc.x }; };
  // On load every bus is at its berth.
  line.buses.forEach((b, i) => {
    const { x, z, s } = at(i), berth = stops.flatMap(t => t.berths).find(r => r.id === b.berth);
    assert.ok(Math.abs(s - 1) < 1e-6); assert.ok(pointInPoly([x, z], berth.poly), `${b.id} 未在 ${berth.id}`);
  });
  ctx.site.group.visible = true;
  for (let i = 0; i < 300; i++) ctx.dynamic[0].update(.1, 0, { state: { exploded: false } });
  line.buses.forEach((b, i) => {
    const { x, z, s } = at(i), berth = stops.flatMap(t => t.berths).find(r => r.id === b.berth);
    if (s > .5) assert.ok(!pointInPoly([x, z], berth.poly), `${b.id} 停靠超过 30 s`);
  });
});
