// 云澜·北苑 T1/T2：一期屋面北缘上的一梯一户塔楼（7F 会所、8F–13F 大平层、14F–24F 错层复式），
// 核心筒穿过一期宿主楼层，方庭北门西移，屋面让出塔楼底板，消防登高场地落在北外环一侧。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, onSlab } from './helpers.js';
import { buildNav, step, clear } from '../src/layout/nav.js';
import { rect, rectPoly, lrectPoly, polyBounds, convexOverlap, pointInPoly, polySamples, toW } from '../src/layout/geom.js';
import { communityContractErrors } from '../src/layout/community-contract.js';
import { planSignature } from '../src/layout/community-plan.js';
import { NORTH_SITE } from '../src/layout/community-sites.js';

const nav = buildNav(L);
const towers = L.buildings.filter((b) => b.community === 'north');
const P1 = (s) => lvl(`P1-${s}`);
const unitsOf = (b) => L.levels.filter((l) => l.building === b.id).flatMap((l) => l.units);
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
function move(s, p) {
  const n = Math.max(1, Math.ceil(Math.hypot(p.x - s.x, p.z - s.z) / .05)), dx = (p.x - s.x) / n, dz = (p.z - s.z) / n;
  for (let i = 0; i < n; i++) {
    const prev = s; s = step(nav, s, dx, dz);
    assert.ok(clear(nav, s), `${s.floor} 脚下无支撑`);
    assert.ok(Math.abs(s.y - prev.y) < .04, `${s.floor} 竖向跳变`);
  }
  assert.ok(Math.hypot(s.x - p.x, s.z - p.z) < .03, `${s.floor}: 停在 ${s.x.toFixed(2)},${s.z.toFixed(2)}，目标 ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
  assert.equal(s.floor, p.floor);
  return s;
}

test('北苑 T1/T2 满足社区契约，两栋塔楼底板、间距、高度与规格一致', () => {
  assert.deepEqual(towers.map((b) => b.id), ['T1', 'T2']);
  for (const b of towers) assert.deepEqual(communityContractErrors(L, b), [], b.id);
  const [T1, T2] = towers;
  assert.deepEqual(polyBounds(T1.outline), { x0: -278, z0: -240, x1: -242, z1: -224 });
  assert.deepEqual(polyBounds(T2.outline), { x0: -228, z0: -240, x1: -196, z1: -224 });
  assert.equal(T2.bounds.x0 - T1.bounds.x1, 14);
  const canopy = P1('RF').features.find((f) => f.type === 'glass-canopy');
  for (const b of towers) {
    assert.equal(canopy.rect.z0 - b.bounds.z1, 6, `${b.id} 与方庭天幕间距`);
    const top = Math.max(...L.levels.filter((l) => l.building === b.id).map((l) => l.elev));
    assert.ok(top <= 100 && b.height <= 100, `${b.id} 屋面 ${top}`);
    assert.equal(lvl(b.levels[0]).elev, P1('RF').elev, '7F 会所与一期屋面同高');
    assert.equal(b.levels.length, 19);
    assert.deepEqual(b.fireFrontage, NORTH_SITE.towers.find((t) => t.id === b.id).plate);
  }
});

test('核心筒穿过一期每个宿主楼层：用房落在核心筒矩形上、无商铺压占，拆除的 16 个铺位与规格一致', () => {
  for (const b of towers) {
    const t = NORTH_SITE.towers.find((q) => q.id === b.id), col = rectPoly(rect(t.core[0], -240, t.core[1], -224));
    for (const id of b.hostLevels) {
      const lv = lvl(id), rooms = lv.rooms.filter((r) => r.residentialCore === b.id);
      assert.deepEqual(rooms.map((r) => r.id).sort(), [`${b.id}-ST-A`, `${b.id}-ST-B`, `${b.id}-core`].sort(), `${id} ${b.id}`);
      const box = polyBounds(rooms.flatMap((r) => r.polys.flat()));
      for (const [k, v] of Object.entries({ x0: t.core[0], z0: -240, x1: t.core[1], z1: -224 })) assert.ok(near(box[k], v, 1e-6), `${id} ${b.id} 核心筒 ${k}`);
      assert.ok(!lv.units.some((u) => u.polys.some((p) => convexOverlap(p, col))), `${id} 有商铺压核心筒`);
      const door = NORTH_SITE.hostDoorLevels.includes(id);
      for (const s of rooms.filter((r) => r.type === 'stair')) assert.equal(s.doors.length, door ? 1 : 0, `${id} ${s.id} 门`);
    }
  }
  const want = ['B1M', '1F', '2F', '3F', '4F', '5F', '6F'].flatMap((s) => [`P1-${s}-SQ-N1`, `P1-${s}-SQ-N5`]).concat(['P1-1F-SQ-NW', 'P1-1F-SQ-N3']);
  assert.deepEqual([...L.northResidences.removedUnits].sort(), want.sort());
  assert.equal(L.levels.filter((l) => l.building === 'P1').flatMap((l) => l.units).length, 367);
});

test('方庭北门西移至 SQ-N3：门段 x[−232,−224]，从北外环广场 (−228,−245) 走进方庭', () => {
  const e = L.entrances.find((q) => q.id === 'P1-SQ-N');
  assert.equal(e.name, '方庭北门');
  assert.deepEqual([e.seg.x0, e.seg.z0, e.seg.x1, e.seg.z1].map((v) => Math.round(v * 1e6) / 1e6).sort((a, b) => a - b), [-240, -240, -232, -224].sort((a, b) => a - b));
  let s = { floor: 'ground', x: -228, z: -245, y: 0, slope: null };
  assert.ok(clear(nav, s));
  for (let i = 0; i < 130; i++) s = step(nav, s, 0, .1);
  assert.equal(s.floor, 'P1-1F');
  assert.ok(s.z > -233, `停在 ${s.z}`);
  assert.ok(P1('1F').walk.some((w) => w.id === 'SQ-entN' && pointInPoly([-228, -232], w.poly)));
});

test('一期屋面：塔楼底板下的六部商场竖向交通止于 6F，屋面仍有双客梯双楼梯，农园与观景台移位，底板上无屋面设施', () => {
  const rf = P1('RF');
  assert.deepEqual(L.northResidences.cappedVerticals, ['P1-SQ-W-L1', 'P1-SQ-W-L2', 'P1-SQ-W-L3', 'P1-SQ-F1', 'P1-SQ-ST-W', 'P1-SQ-ST-SV']);
  for (const id of L.northResidences.cappedVerticals) {
    const v = L.elevators.find((e) => e.id === id) || L.stairs.find((s) => s.id === id);
    assert.ok(!v.serves.includes('P1-RF') && v.serves.includes('P1-6F'), id);
  }
  assert.ok(L.elevators.filter((e) => e.type === 'passenger' && e.serves.includes('P1-RF')).length >= 2);
  assert.ok(L.stairs.filter((s) => s.serves.includes('P1-RF')).length >= 2);
  const feature = (t) => rf.features.find((f) => f.type === t);
  assert.deepEqual(feature('farm').rect, rect(-278, -222.5, -260, -211));
  assert.deepEqual(feature('viewdeck').rect, rect(-239, -228, -229, -219.5));
  const plates = towers.map((b) => b.outline);
  const hits = (P) => plates.some((pl) => convexOverlap(P, pl));
  for (const w of rf.walk) assert.ok(!hits(w.poly), `屋面走道 ${w.id} 压塔楼底板`);
  const dot = ([x, z], r = .5) => rectPoly(rect(x - r, z - r, x + r, z + r));
  for (const f of rf.features) {
    const P = f.rect ? lrectPoly(f.frame, f.rect) : f.lu !== undefined ? dot(toW(f.frame, f.lu, f.lv)) : f.x !== undefined ? dot([f.x, f.z]) : null;
    if (P) assert.ok(!hits(P), `屋面设施 ${f.type} 压塔楼底板`);
  }
  for (const o of rf.navObstacles || []) assert.ok(!hits(o.poly), `屋面障碍 ${o.id} 压塔楼底板`);
  for (const r of rf.rooms) for (const p of r.polys) assert.ok(!hits(p), `屋面用房 ${r.id} 压塔楼底板`);
  for (const pl of plates) for (const q of polySamples(pl, 2, .3)) assert.ok(!onSlab(rf, q), `一期屋面楼板仍在塔楼底板下 ${q}`);
  // 7F 会所落在原屋面标高，站得住
  for (const b of towers) assert.ok(onSlab(lvl(b.levels[0]), [b.center[0] - 10, b.center[1]]));
});

test('电梯停靠：两部私家梯各停本侧入户层，消防梯停全部楼层；不停一期商场楼层；宿主楼层均有电梯井洞', () => {
  for (const b of towers) {
    const id = b.id, n = (k) => `${id}-${k}F`, hosts = ['P1-B2', 'P1-B1', 'P1-1F'];
    const lift = (k) => L.elevators.find((e) => e.id === `${id}-${k}`);
    assert.deepEqual(lift('LW').serves, [...hosts, ...[7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24].map(n), `${id}-RF`]);
    assert.deepEqual(lift('LE').serves, [...hosts, ...[7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19, 21, 23].map(n), `${id}-RF`]);
    assert.deepEqual(lift('LF').serves, [...hosts, ...b.levels]);
    assert.deepEqual([lift('LW').role, lift('LE').role, lift('LF').role], ['private-w', 'private-e', 'fire']);
    for (const lid of b.levels) assert.ok(L.elevators.filter((e) => e.type === 'passenger' && e.serves.includes(lid)).length >= 2, lid);
    for (const lv of L.levels.filter((l) => l.building === id)) for (const u of lv.units) {
      const own = lift(u.slot === 'W' ? 'LW' : 'LE');
      if (u.residence.level === 'upper') assert.ok(!own.serves.includes(lv.id), `${own.id} 停在 ${u.code} 的上层`);
      else assert.ok(own.serves.includes(lv.id), `${u.code} 的入户层没有私家梯`);
    }
    for (const e of L.elevators.filter((q) => q.residentialCore === id)) {
      for (const s of [...NORTH_SITE.hostPassLevels, 'P1-RF']) assert.ok(!e.serves.includes(s), `${e.id} 停 ${s}`);
      for (const hid of b.hostLevels) assert.ok(lvl(hid).voids.some((v) => v.elevator === e.id && v.kind === 'shaft'), `${e.id} 在 ${hid} 没有井道`);
      assert.deepEqual(e.shaftLevels, b.stairLevelIds);
    }
  }
});

test('两部疏散楼梯从 P1-B2 连续走到塔楼屋面再走回来，穿越层无门', () => {
  for (const b of towers) {
    for (const stair of ['ST-A', 'ST-B']) {
      const routes = b.access.routes.filter((r) => r.stair === `${b.id}-${stair}`);
      assert.equal(routes[0].from, 'P1-B2'); assert.equal(routes.at(-1).to, `${b.id}-RF`);
      for (let i = 1; i < routes.length; i++) assert.equal(routes[i].from, routes[i - 1].to);
      assert.ok(routes.every((r) => !NORTH_SITE.hostPassLevels.includes(r.from) && !NORTH_SITE.hostPassLevels.includes(r.to)));
      const chained = routes.find((r) => r.from === 'P1-1F');
      assert.equal(chained.to, `${b.id}-7F`); assert.equal(chained.landings.length, 6);
      assert.equal(routes.find((r) => r.from === 'P1-B1').landings.length, 2);
      for (const r of routes) for (const path of [r.waypoints, [...r.waypoints].reverse()]) {
        let s = { ...path[0], slope: null };
        assert.ok(clear(nav, s), `${r.id} 起点`);
        for (const p of path.slice(1)) s = move(s, p);
      }
    }
  }
});

test('8F–24F 每层恰两户；复式经梯段 A、平台、梯段 B 上下往返无跳变，上层楼梯洞与挑空不可站立', () => {
  for (const b of towers) {
    for (const lid of b.levels.filter((id) => lvl(id).levelNumber >= 8)) {
      const lv = lvl(lid);
      assert.equal(lv.units.length, 2, lid);
      assert.equal(new Set(lv.units.map((u) => u.residence.home)).size, 2, lid);
      assert.deepEqual(lv.units.map((u) => u.slot).sort(), ['E', 'W'], lid);
    }
    for (const lv of L.levels.filter((l) => l.building === b.id)) for (const u of lv.units.filter((q) => q.residence.level === 'lower')) {
      const r = u.residence, st = r.homeStair, [A, B] = st.flights, upper = r.homeLevels[1], landing = `${u.id}-home-landing`;
      const midZ = (st.landing.z0 + st.landing.z1) / 2;
      const P = (x, z, floor) => { const [wx, wz] = toW(u.frame, x, z); return { x: wx, z: wz, floor }; };
      const up = [P(A.bottom[0], A.bottom[1] + .8, lv.id), P(A.top[0], midZ, landing), P(B.bottom[0], midZ, landing), P(B.top[0], B.top[1] + .7, upper)];
      for (const path of [up, [...up].reverse()]) {
        let s = { ...path[0], y: lvl(path[0].floor).elev, slope: null };
        assert.ok(clear(nav, s), `${u.code} 楼梯口`);
        let flights = 0;
        for (const p of path.slice(1)) {
          s = move(s, p);
          flights++;
        }
        assert.equal(flights, 3);
      }
      const ulv = lvl(upper);
      for (const v of ulv.voids.filter((q) => (q.kind === 'home-stair' || q.kind === 'home-void') && q.unit === r.partner))
        for (const q of polySamples(v.poly, .5, .35)) assert.ok(!clear(nav, { floor: upper, x: q[0], z: q[1], y: ulv.elev, slope: null }), `${upper} ${v.id} 可站立`);
    }
  }
});

test('每栋 24 户 34 个楼层单元、24 种不同户型，复式编号与名称唯一', () => {
  for (const b of towers) {
    const units = unitsOf(b), homes = new Map();
    for (const u of units) { if (!homes.has(u.residence.home)) homes.set(u.residence.home, []); homes.get(u.residence.home).push(u); }
    assert.equal(units.length, 34); assert.equal(homes.size, 24);
    const sig = [...homes.values()].map((parts) => parts.sort((a, c) => lvl(a.level).elev - lvl(c.level).elev).map((u) => planSignature(u.residence)).join('|'));
    assert.equal(new Set(sig).size, 24, `${b.id} 户型重复`);
    assert.equal([...homes.values()].filter((p) => p.length === 2).length, 10);
    for (const parts of homes.values()) {
      const area = parts.reduce((n, u) => n + u.residence.area, 0), beds = parts.reduce((n, u) => n + u.residence.bedrooms, 0);
      assert.ok(beds >= 3 && area >= 180, `${parts[0].code} ${beds} 房 ${area}㎡`);
      if (parts.length === 2) {
        assert.deepEqual(parts.map((u) => u.code.slice(-2)), ['-L', '-U']);
        assert.ok(parts[0].brand.name.endsWith('下层') && parts[1].brand.name.endsWith('上层'));
      }
    }
  }
  const all = towers.flatMap(unitsOf);
  for (const k of ['code', 'id']) assert.equal(new Set(all.map((u) => u[k])).size, all.length, k);
  assert.equal(new Set(all.map((u) => u.brand.name)).size, all.length);
  assert.equal(new Set(all.map((u) => u.brand.en)).size, all.length);
});

test('消防登高场地 HS1/HS2：36/32 × 10 m，距塔楼北立面 5 m、贴北外环 1 m 内，不压坡口与地面障碍', () => {
  const ring = L.site.roads.find((r) => r.id === 'ring-n'), rb = ring.rect || polyBounds(ring.poly);
  const obstacles = [...(L.site.urban?.buildings || []), ...(L.site.forecourt?.obstacles || []), ...(L.site.busStops || []).flatMap((s) => s.obstacles),
    ...(L.site.transitCenter?.obstacles || []), ...(L.site.westParking?.islands || []), ...(L.site.river?.obstacles || [])].map((o) => o.poly);
  for (const b of towers) {
    const hs = L.site.fireAccess.find((f) => f.tower === b.id), r = hs.rect;
    assert.deepEqual(r, b.hardstand);
    assert.equal(r.x1 - r.x0, b.id === 'T1' ? 36 : 32); assert.equal(r.z1 - r.z0, 10);
    assert.deepEqual([r.x0, r.x1], b.fireFrontage);
    assert.equal(b.bounds.z0 - r.z1, 5);
    assert.ok(r.z0 - rb.z1 <= 1 && r.z0 >= rb.z1, `${hs.id} 离北外环 ${r.z0 - rb.z1}`);
    assert.ok(!L.site.trenches.some((t) => convexOverlap(t, hs.poly)), `${hs.id} 压坡口`);
    assert.ok(!obstacles.some((p) => convexOverlap(p, hs.poly)), `${hs.id} 有障碍`);
    assert.ok(polySamples(hs.poly, 2, .2).every((q) => clear(nav, { floor: 'ground', x: q[0], z: q[1], y: 0, slope: null })), `${hs.id} 地面不可通行`);
  }
});
