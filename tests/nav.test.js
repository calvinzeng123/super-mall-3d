// 第一人称导航模型（v4 规格第 3、8 节）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl } from './helpers.js';
import { pointInPoly, toW, toL, dist } from '../src/layout/geom.js';
import { doorGaps, storeStyle } from '../src/layout/frontage.js';
import { buildNav, step, clear, landAt, spawn, sightBlocked, NAV } from '../src/layout/nav.js';

const nav = buildNav(L);
const at = (floor, x, z) => ({ floor, x, z, y: nav.floors.get(floor).y, slope: null });
/** 分成小步走：每步不超过 0.1m（与控制器一致，防止穿墙） */
const walk = (s, dx, dz) => {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let i = 0; i < n; i++) s = step(nav, s, dx / n, dz / n, 0);
  return s;
};
const targetOf = (e) => (e.to === 'bridge' ? 'bridge' : e.to === 'site' ? 'ground' : e.to);

test('每个入口都能穿过，并切换到正确楼面', () => {
  for (const e of L.entrances.filter((x) => !x.kiosk)) {
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    const s0 = at(e.level, mx - e.nx * 1.5, mz - e.nz * 1.5);
    assert.ok(clear(nav, s0), `${e.id} 内侧起点不可站立`);
    const s1 = walk(s0, e.nx * 3, e.nz * 3);
    assert.equal(s1.floor, targetOf(e), `${e.id} 穿过后楼面为 ${s1.floor}`);
    assert.ok(dist([s1.x, s1.z], [s0.x, s0.z]) > 2.9, `${e.id} 被挡住`);
  }
});

test('每个铺位都能从门口走进去（冰场除外）', () => {
  for (const lv of L.levels) {
    for (const u of lv.units) {
      const style = storeStyle(lv, u);
      if (style === 'rink') continue;
      const ok = u.fronts.some((f, i) => {
        const w = u.wfronts[i];
        const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
        const entry = u.residence?.entryDoor;
        const gaps = entry ? [[entry.at-entry.width/2, entry.at+entry.width/2]] : doorGaps(style, len);
        if (!gaps.length) return false;
        const [a, b] = gaps[0];
        const t = (a + b) / 2 / len;
        const px = w.x0 + (w.x1 - w.x0) * t, pz = w.z0 + (w.z1 - w.z0) * t;
        const s0 = at(lv.id, px + w.nx * 1.5, pz + w.nz * 1.5);
        if (!clear(nav, s0)) return false;
        const s1 = walk(s0, -w.nx * 3, -w.nz * 3);
        return s1.floor === lv.id && u.polys.some((p) => pointInPoly([s1.x, s1.z], p));
      });
      assert.ok(ok, `${lv.id} ${u.code} ${u.brand.name} 进不去`);
    }
  }
});

test('铺位侧墙挡人：从店内朝侧墙走，停在墙前', () => {
  let checked = 0;
  for (const lv of L.levels.filter((l) => ['retail', 'food'].includes(l.kind))) {
    for (const u of lv.units.filter((x) => x.rects.length === 1).slice(0, 3)) {
      const r = u.rects[0];
      const c = toW(u.frame, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      const fronts = new Set(u.fronts.map((f) => f.side));
      const side = ['E', 'W', 'N', 'S'].find((sd) => !fronts.has(sd));
      if (!side) continue;
      const [du, dv] = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] }[side];
      const [dx, dz] = [du * u.frame.c - dv * u.frame.s, du * u.frame.s + dv * u.frame.c];
      const s0 = at(lv.id, c[0], c[1]);
      if (!clear(nav, s0)) continue;
      const s1 = walk(s0, dx * 30, dz * 30);
      assert.ok(u.polys.some((p) => pointInPoly([s1.x, s1.z], p)), `${lv.id} ${u.code} 穿出侧墙`);
      checked++;
    }
  }
  assert.ok(checked >= 20, `只检查了 ${checked} 家`);
});

test('中庭洞口挡人：一期 2F 朝圆厅中心走，停在洞口外', () => {
  const p1 = L.buildings.find((b) => b.id === 'P1');
  const r = p1.rotundas[0];
  const lv = lvl('P1-2F');
  const s0 = at(lv.id, r.x + 28, r.z);
  assert.ok(clear(nav, s0));
  const s1 = walk(s0, -30, 0);
  assert.equal(s1.floor, lv.id);
  assert.ok(!lv.voids.some((v) => pointInPoly([s1.x, s1.z], v.poly)), '走进了中庭洞口');
});

test('斜向接近后已站进第一阶仍可接上楼梯，靠近高端同样可下楼', () => {
  const sl = nav.slopeById.get('H-ST2-1F-2F-flight-1');
  assert.ok(sl);
  for (const [floor, u, sign] of [[sl.low, .136658, 1], [sl.high, sl.len - .136658, -1]]) {
    const [x,z] = toW(sl.F, u, 0);
    let s = at(floor,x,z);
    s = step(nav,s,sl.F.c*.08*sign,sl.F.s*.08*sign);
    assert.equal(s.slope?.id,sl.id,`${floor} 起步区未接入`);
    for(let i=0;i<Math.ceil(sl.len/.08)+4;i++) s=step(nav,s,sl.F.c*.08*sign,sl.F.s*.08*sign);
    assert.equal(s.floor,sign>0?sl.high:sl.low);
    assert.ok(clear(nav,s));
  }
});

test('坡段中部不能从错误标高横向吸附，防止侧面跳层', () => {
  const sl = nav.slopeById.get('H-ST2-1F-2F-flight-1');
  const [x,z]=toW(sl.F,sl.len/2,0);
  for(const floor of [sl.low,sl.high]) {
    const s=step(nav,at(floor,x,z),sl.F.c*.08,sl.F.s*.08);
    assert.equal(s.slope,null);
    assert.equal(s.floor,floor);
    assert.equal(s.y,nav.floors.get(floor).y);
  }
});

test('扶梯：上行从下端走上去到上层，下行从上端走下去到下层', () => {
  for (const e of L.escalators) {
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    if (e.dir === 'up') {
      const s0 = at(e.from, e.bottom.x - ux * 1.2, e.bottom.z - uz * 1.2);
      const s1 = walk(s0, ux * (run + 4), uz * (run + 4));
      assert.equal(s1.floor, e.to, `${e.id} 没到 ${e.to}`);
      assert.ok(Math.abs(s1.y - e.top.y) < 1e-6);
    } else {
      const s0 = at(e.to, e.top.x + ux * 1.2, e.top.z + uz * 1.2);
      const s1 = walk(s0, -ux * (run + 4), -uz * (run + 4));
      assert.equal(s1.floor, e.from, `${e.id} 没到 ${e.from}`);
      assert.ok(Math.abs(s1.y - e.bottom.y) < 1e-6);
    }
  }
});

test('地铁出入口：从站厅沿楼梯走上地面', () => {
  for (const e of L.entrances.filter((x) => x.kiosk)) {
    const G = e.kiosk.frame;
    const [x0, z0] = toW(G, -1.2, -1.1);
    const s0 = at(e.level, x0, z0);
    assert.ok(clear(nav, s0), `${e.name} 起点不可站立`);
    const [dx, dz] = [G.c * (e.kiosk.run + 4.5), G.s * (e.kiosk.run + 4.5)];
    const s1 = walk(s0, dx, dz);
    assert.ok(s1.floor === 'ground' || s1.floor === 'P3-1F', `${e.name} 到了 ${s1.floor}`);
    assert.equal(s1.y, 0);
  }
});

test('出生点可站立：总览、各期、各层', () => {
  const opts = [{}, ...L.buildings.map((b) => ({ building: b.id })), ...L.levels.map((l) => ({ level: l.id }))];
  for (const o of opts) {
    const s = spawn(nav, L, o);
    assert.ok(s && clear(nav, s), `出生点不可站立：${JSON.stringify(o)}`);
  }
});

test('楼梯、电梯在每个停靠层的互动点都可站立', () => {
  for (const k of nav.links) for (const st of k.stops) assert.ok(clear(nav, at(st.floor, st.x, st.z)), `${k.id} 在 ${st.floor} 的互动点不可站立`);
});

test('飞行落地：一期东南翼上空 9m 落到 2F', () => {
  const se = L.buildings.find((b) => b.id === 'P1').wings.find((w) => w.id === 'SE');
  // u=55 在 2F 商业街两段通高缝 [40,52]、[58,72] 之间（缝里本来就该掉到 1F）
  const [x, z] = toW(se.F, 55, 0);
  const s = landAt(nav, x, z, 9);
  assert.equal(s && s.floor, 'P1-2F');
});

test('连通：一期 1F 从主入口内侧能走到同层每家店的门口', () => {
  const lv = lvl('P1-1F');
  const e = L.entrances.find((x) => x.level === lv.id && x.main);
  const mx = (e.seg.x0 + e.seg.x1) / 2 - e.nx * 2, mz = (e.seg.z0 + e.seg.z1) / 2 - e.nz * 2;
  const key = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const seen = new Set([key(mx, mz)]);
  const queue = [[Math.round(mx), Math.round(mz)]];
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(x + dx, z + dz);
      if (seen.has(k)) continue;
      // 单步走 1m：step 对墙做扫掠检测，不会穿墙
      const s1 = step(nav, at(lv.id, x, z), dx, dz, 0);
      if (s1.floor !== lv.id || dist([s1.x, s1.z], [x + dx, z + dz]) > 0.05) continue;
      seen.add(k);
      queue.push([x + dx, z + dz]);
    }
  }
  for (const u of lv.units) {
    const w = u.wfronts[0];
    const px = (w.x0 + w.x1) / 2 + w.nx * 1.5, pz = (w.z0 + w.z1) / 2 + w.nz * 1.5;
    const near = [...seen].some((k) => { const [a, b] = k.split(',').map(Number); return Math.hypot(a - px, b - pz) < 1.2; });
    assert.ok(near, `${u.code} ${u.brand.name} 的门口走不到`);
  }
});

test('视线遮挡：楼板挡住视线，中庭洞口与同层不挡', () => {
  const lv2 = lvl('P1-2F');
  const eye = NAV.eye + lv2.elev;
  // 站在 2F 楼板上往正下方看：穿过楼板，被挡
  const p = spawn(nav, L, { building: 'P1', level: 'P1-2F' });
  assert.ok(sightBlocked(nav, [p.x, eye, p.z], [p.x, 1, p.z]), '透过楼板看到了下层');
  // 中庭洞口正上方往下看：不挡
  const v = lv2.voids[0].poly;
  const cx = v.reduce((a, q) => a + q[0], 0) / v.length, cz = v.reduce((a, q) => a + q[1], 0) / v.length;
  assert.ok(!sightBlocked(nav, [cx, eye, cz], [cx, 1, cz]), '中庭洞口挡住了视线');
  // 同层平视：不挡
  assert.ok(!sightBlocked(nav, [p.x, eye, p.z], [p.x + 10, eye - 0.5, p.z]), '同层平视被挡');
  // 室外地面以下：从广场往下看，被地面挡住
  const g = spawn(nav, L, {});
  assert.ok(sightBlocked(nav, [g.x, NAV.eye, g.z], [g.x, -3, g.z]), '透过室外地面看到了地下');
});
