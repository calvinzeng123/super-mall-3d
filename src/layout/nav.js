// 第一人称导航模型（v4 规格第 3 节）：由布局数据生成各楼面的可站立区、墙、传送边、坡道与互动点，
// 并解算每一步移动。纯函数，可在 Node 中测试；渲染侧 explore.js 只负责输入、相机与显示。
//
// 楼面：每个楼层一个（y = 标高）；ground（室外地面）；bridge（云环天桥桥面）。
// 可站立：楼板拼块减洞口；人的中心与 8 个方向半径 r 处都可站立才算站得住——走到楼板边、中庭边自然被挡住。
// 墙：线段（铺位与用房轮廓减门洞、电梯井、扶梯占地、地铁闸机等），按半径 r 做扫掠与滑动。
// 传送边：入口、三期街区边界——人的移动线段穿过时切换楼面；两侧各加 0.6m 的门口区计入可站立。
// 坡道：扶梯、地铁出入口楼梯、落地塔扶梯、车库坡道——带方向的矩形，高度沿长度线性变化。
// 互动点：楼梯、电梯在各停靠层的门口。
import {
  frame, toW, toL, rect, rectPoly, lrectPoly, pointInPoly, unionOutline, mergeSegments, subtractOpenings,
  polySamples, polyCentroid, polyArea, polyBounds, dist,
} from './geom.js';
import { storeStyle, doorGaps } from './frontage.js';
import { ESC } from './constants.js';

export const NAV = { r: 0.3, eye: 1.62, reach: 1.6, cell: 8, zone: 0.6 };
const DEG = 180 / Math.PI;
/** 相机 yaw：朝向水平方向 (fx, fz)（three.js 相机默认看向 −z，绕 y 轴转 yaw） */
export const yawOf = (fx, fz) => Math.atan2(-fx, -fz);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]];
const CAMPUS = rect(-298, -298, 298, 298);

// ---------------------------------------------------------------------------
// 构建

export function buildNav(layout) {
  const floors = new Map();
  const mk = (id, y, kind, extra = {}) => {
    const F = { id, y, kind, building: null, level: null, pieces: [], zones: [], walls: [], obstacles: [], grid: new Map(), portals: [], slopes: [], ...extra };
    floors.set(id, F);
    return F;
  };
  const piece = (outer, holes = []) => ({ outer, holes: holes.map((h) => ({ poly: h, bb: polyBounds(h) })), bb: polyBounds(outer) });

  // ---------- 楼面与可站立区 ----------
  for (const lv of layout.levels) {
    const F = mk(lv.id, lv.elev, 'level', { building: lv.building, level: lv });
    for (const p of lv.slab.pieces) F.pieces.push(piece(p.outer, [...p.holes, ...lv.voids.map((v) => v.poly)]));
    // 夹层属于原楼层的某一户，不新增建筑楼层或住户。独立导航面仅由套内楼梯进入；
    // 仍站在原楼面的人经过其下方时不会被自动投影到较高的支撑面。
    for (const u of lv.units) {
      const d = u.residence?.duplex;
      if (!d) continue;
      const M = mk(d.surface.id, lv.elev + d.height, 'mezzanine', { building: lv.building, level: lv, parentFloor: lv.id, unit: u });
      M.pieces.push(piece(lrectPoly(u.frame, d.surface.rect), (d.surface.holes || []).map(r => lrectPoly(u.frame, r))));
    }
  }
  // 街区外挂楼梯的半层平台是独立支撑面。它们复用下层显示组，
  // 不新增目录楼层；两个梯段必须经过实体平台，不能传送跳层。
  for (const b of layout.buildings) for (const surface of b.access?.surfaces || []) {
    const level = layout.levels.find(l => l.id === surface.parentFloor);
    const F = mk(surface.id, surface.elev, 'mezzanine', {
      building: b.id, level, parentFloor: surface.parentFloor, stairLanding: true,
    });
    F.pieces.push(piece(surface.poly));
  }
  // 新区地下联廊与空桥由独立结构板支撑，仍属于其起点楼面；
  // 到终点的门线后再切换到商场/另一栋楼，整条通道可实际步行。
  for (const path of layout.extensions?.paths || []) {
    const F = floors.get(path.level);
    if (!F) continue;
    for (const p of path.slab?.pieces || []) F.pieces.push(piece(p.outer, p.holes || []));
  }
  const S = layout.site;
  const p3 = layout.buildings.find((b) => b.kind === 'street');
  const district = p3 ? p3.outline : null;
  const ground = mk('ground', 0, 'ground');
  const groundHoles = [
    ...layout.buildings.filter((b) => b.kind === 'mall' || b.kind === 'tower').map((b) => b.outline),
    ...(layout.extensions?.gateways || []).filter(g => Math.abs(g.elev) < .01).map(g => g.poly),
    ...(district ? [district] : []),
    ...(S.park ? [S.park.lake] : []),
    ...S.trenches,
    ...(S.openings || []),
  ];
  ground.pieces.push(piece(rectPoly(S.bounds || CAMPUS), groundHoles));
  const br = layout.bridges;
  const bridge = br ? mk('bridge', br.y, 'bridge') : null;
  if (bridge) for (const w of br.walk) bridge.pieces.push(piece(w.poly));
  // 三期街区内的地面就是三期 1F 街巷楼层
  const street = p3 ? p3.levels.find((id) => floors.get(id).level.ground) : null;
  const groundAt = (x, z) => (street && pointInPoly([x, z], district) ? street : 'ground');

  // ---------- 墙 ----------
  const wall = (F, x0, z0, x1, z1) => { if (F && Math.hypot(x1 - x0, z1 - z0) > 0.02) F.walls.push({ x0, z0, x1, z1 }); };
  const wallL = (F, Fr, s) => {
    const [ax, az] = toW(Fr, s.x0, s.z0), [bx, bz] = toW(Fr, s.x1, s.z1);
    wall(F, ax, az, bx, bz);
  };
  const box = (F, Fr, r) => {
    const P = lrectPoly(Fr, r);
    for (let i = 0; i < 4; i++) wall(F, ...P[i], ...P[(i + 1) % 4]);
  };
  const obstacle = (F, Fr, r) => {
    box(F, Fr, r);
    F.obstacles.push(piece(lrectPoly(Fr, r)));
  };
  const polygonObstacle = (F, Fr, o) => {
    const transform = P => P.map(p => toW(Fr, ...p));
    const outer = transform(o.poly), holes = (o.holes || []).map(transform);
    for (const P of [outer, ...holes]) for (let i = 0; i < P.length; i++) wall(F, ...P[i], ...P[(i + 1) % P.length]);
    F.obstacles.push(piece(outer, holes));
  };
  for (const o of S.forecourt?.obstacles || []) polygonObstacle(ground, frame(0, 0, 0), o);
  for (const o of S.westParking?.islands || []) polygonObstacle(ground, frame(0, 0, 0), o);
  for (const lot of layout.extensions?.surfaceParking || []) {
    for (const [i, s] of lot.stalls.entries()) {
      if (i % 4 === 0) continue;
      const sideways = s.face === 'E' || s.face === 'W';
      const hx = sideways ? 2.2 : .9, hz = sideways ? .9 : 2.2;
      obstacle(ground, frame(0, 0, 0), rect(s.x-hx,s.z-hz,s.x+hx,s.z+hz));
    }
  }
  // All 29 residential floors reuse the same three plans at identical world
  // X/Z frames. Collision vertices and wall records are immutable; share them
  // instead of allocating another complete model projection on every storey.
  const measuredUnitGeometry = new Map();
  const partition = (F, Fr, p) => {
    const [x0, z0] = p.a, [x1, z1] = p.b;
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.02) return;
    const seg = (a, b) => wallL(F, Fr, { x0: x0 + (x1 - x0) * a / len,
      z0: z0 + (z1 - z0) * a / len, x1: x0 + (x1 - x0) * b / len,
      z1: z0 + (z1 - z0) * b / len });
    if (p.door) {
      seg(0, Math.max(0, p.door.at - p.door.width / 2));
      seg(Math.min(len, p.door.at + p.door.width / 2), len);
    } else seg(0, len);
  };
  for (const lv of layout.levels) {
    const F = floors.get(lv.id);
    for (const u of lv.units) {
      // Detailed residential models already include measured external walls,
      // open door leaves, balcony glass, wetroom screens and furniture solids.
      // Rebuilding a generic rectangular shell would seal their real openings.
      if (u.residence?.collisionFromModel) {
        const key = `${u.residence.prototype}/${u.frame.ox}/${u.frame.oz}/${u.frame.a}`;
        if (!measuredUnitGeometry.has(key)) {
          const geometry = { walls: [], obstacles: [] };
          for (const o of u.residence.obstacles) polygonObstacle(geometry, u.frame, o);
          measuredUnitGeometry.set(key, geometry);
        }
        const geometry = measuredUnitGeometry.get(key);
        F.walls.push(...geometry.walls); F.obstacles.push(...geometry.obstacles);
        continue;
      }
      const style = storeStyle(lv, u);
      const openings = [];
      for (const f of u.fronts) {
        const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
        const entry = u.residence?.entryDoor;
        const gaps = entry ? [[entry.at - entry.width / 2, entry.at + entry.width / 2]] : doorGaps(style, len);
        for (const [a, b] of gaps) {
          const t0 = a / len, t1 = b / len;
          openings.push({ x0: f.x0 + (f.x1 - f.x0) * t0, z0: f.z0 + (f.z1 - f.z0) * t0, x1: f.x0 + (f.x1 - f.x0) * t1, z1: f.z0 + (f.z1 - f.z0) * t1, side: f.side });
        }
      }
      for (const s of subtractOpenings(mergeSegments(unionOutline(u.rects)), openings)) wallL(F, u.frame, s);
      for (const p of u.residence?.partitions || []) partition(F, u.frame, p);
      for (const o of u.residence?.obstacles || []) obstacle(F, u.frame, o.rect);
      const d = u.residence?.duplex;
      if (d) {
        const M = floors.get(d.surface.id);
        for (const p of d.surface.railings) partition(M, u.frame, p);
        for (const o of d.obstacles || []) obstacle(M, u.frame, o.rect);
        // 下层不能横穿阶梯实体；低端入口与高端落脚处保留净空。
        const s = d.stair, hw = s.width / 2;
        const dx = s.top[0] - s.bottom[0], dz = s.top[1] - s.bottom[1], len = Math.hypot(dx, dz);
        const nx = -dz / len * hw, nz = dx / len * hw;
        for (const sign of [-1, 1]) wallL(F, u.frame, { x0: s.bottom[0] + sign * nx, z0: s.bottom[1] + sign * nz, x1: s.top[0] + sign * nx, z1: s.top[1] + sign * nz });
        wallL(F, u.frame, { x0: s.top[0] + nx, z0: s.top[1] + nz, x1: s.top[0] - nx, z1: s.top[1] - nz });
        F.obstacles.push(piece([
          toW(u.frame, s.bottom[0] + nx, s.bottom[1] + nz), toW(u.frame, s.top[0] + nx, s.top[1] + nz),
          toW(u.frame, s.top[0] - nx, s.top[1] - nz), toW(u.frame, s.bottom[0] - nx, s.bottom[1] - nz),
        ]));
      }
    }
    for (const m of lv.rooms) {
      // 开放式钢梯的实体侧护栏由布局登记，入口和两跑之间不封墙。
      if (m.openStair) {
        for (const s of m.navigationWalls || []) wallL(F, m.frame, s);
        continue;
      }
      const outline = mergeSegments(unionOutline(m.rects));
      // Protected residential stair rooms have a real doorway and a solid
      // landing before the shaft. Their floor-change interaction is retained.
      const segments = m.shaftRect ? subtractOpenings(outline, m.doors || []) : outline;
      for (const s of segments) wallL(F, m.frame, s);
    }
    if (lv.lobbyPlan) {
      for (const p of lv.lobbyPlan.partitions || []) partition(F, lv.lobbyPlan.frame, p);
      for (const o of lv.lobbyPlan.obstacles || []) obstacle(F, lv.lobbyPlan.frame, o.rect);
    }
    for (const f of lv.features) {
      if (f.type === 'gates') {
        const n = Math.max(2, Math.round((f.z1 - f.z0) / 0.95));
        for (let i = 0; i <= n; i++) { const z = f.z0 + ((f.z1 - f.z0) * i) / n; wall(F, f.x - 0.85, z, f.x + 0.85, z); }
      } else if (f.type === 'market-stall') {
        obstacle(F, frame(0, 0, 0), rect(f.x - f.w / 2, f.z - f.d / 2, f.x + f.w / 2, f.z + f.d / 2));
      } else if (f.type === 'fence') wall(F, f.x0, f.z, f.x1, f.z);
      else if (f.type === 'psd') wall(F, f.x0, f.z, f.x1, f.z);
      else if (f.type === 'tvm') {
        const hw = (f.n * 1.1) / 2;
        box(F, frame(0, 0, 0), rect(f.x - hw, f.z - 0.3, f.x + hw, f.z + 0.3));
      }
    }
  }
  // 不在核心筒里的电梯井
  for (const e of layout.elevators) {
    if (!(e.type === 'glass' || e.exterior)) continue;
    for (const id of e.serves) box(floors.get(id), e.frame, rect(e.lu - e.w / 2, e.lv - e.d / 2, e.lu + e.w / 2, e.lv + e.d / 2));
  }
  // 地铁地面出入口：雨棚两侧玻璃与背板
  for (const e of layout.entrances.filter((x) => x.kiosk)) {
    const G = e.kiosk.frame;
    const [kx, kz] = toW(G, e.kiosk.run + 1.5, 0);
    const F = floors.get(groundAt(kx, kz));
    for (const v of [-3.45, 3.45]) wallL(F, G, { x0: -0.5, z0: v, x1: 12, z1: v });
    wallL(F, G, { x0: -0.5, z0: -3.45, x1: -0.5, z1: 3.45 });
  }

  // ---------- 坡道 ----------
  const slopes = [];
  const slope = (o) => {
    const sl = { belt: 0, ...o };
    slopes.push(sl);
    for (const id of [sl.low, sl.high]) { const F = floors.get(id); if (F && !F.slopes.includes(sl)) F.slopes.push(sl); }
    return sl;
  };
  const lane = (id, kind, bx, bz, by, tx, tz, ty, hw, low, high, belt) => {
    const len = Math.hypot(tx - bx, tz - bz);
    return slope({ id, kind, F: frame(bx, bz, Math.atan2(tz - bz, tx - bx) * DEG), len, hw, y0: by, y1: ty, low, high, belt });
  };
  // 扶梯：每条梯道一段；下层占地封闭，只留梯道下端入口
  const escalators = [...layout.escalators];
  if (br) {
    for (const v of br.verticals.filter((x) => x.type === 'escalator')) {
      const [bx, bz] = toW(v.frame, v.bottom.lu, v.bottom.lv), [tx, tz] = toW(v.frame, v.top.lu, v.top.lv);
      escalators.push({ id: v.id, pair: v.tower, dir: v.dir, from: groundAt(bx, bz), to: 'bridge', bottom: { x: bx, y: 0, z: bz }, top: { x: tx, y: br.y, z: tz }, width: v.width });
    }
  }
  const pairs = new Map();
  for (const e of escalators) {
    lane(e.id, 'escalator', e.bottom.x, e.bottom.z, e.bottom.y, e.top.x, e.top.z, e.top.y, (e.width || ESC.width) / 2, e.from, e.to, e.dir === 'up' ? 1 : -1);
    if (!pairs.has(e.pair)) pairs.set(e.pair, []);
    pairs.get(e.pair).push(e);
  }
  for (const list of pairs.values()) {
    const e = list[0];
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    const cx = list.reduce((a, q) => a + q.bottom.x, 0) / list.length, cz = list.reduce((a, q) => a + q.bottom.z, 0) / list.length;
    const Fr = frame(cx, cz, Math.atan2(uz, ux) * DEG);
    const offs = list.map((q) => toL(Fr, q.bottom.x, q.bottom.z)[1]);
    const half = Math.max(...offs.map((o) => Math.abs(o))) + (e.width || ESC.width) / 2 + 0.05;
    const F = floors.get(e.from);
    wallL(F, Fr, { x0: 0, z0: -half, x1: run, z1: -half });
    wallL(F, Fr, { x0: 0, z0: half, x1: run, z1: half });
    wallL(F, Fr, { x0: run, z0: -half, x1: run, z1: half });
    // 下端：扣掉每条梯道的入口
    const ent = offs.map((o) => [o - ((e.width || ESC.width) / 2 - NAV.r), o + ((e.width || ESC.width) / 2 - NAV.r)]).sort((a, b) => a[0] - b[0]);
    let v = -half;
    for (const [a, b] of ent) { if (a > v) wallL(F, Fr, { x0: 0, z0: v, x1: 0, z1: a }); v = Math.max(v, b); }
    if (v < half) wallL(F, Fr, { x0: 0, z0: v, x1: 0, z1: half });
  }
  // 地铁地面出入口：楼梯 + 扶梯整段
  for (const e of layout.entrances.filter((x) => x.kiosk)) {
    const G = e.kiosk.frame;
    const [kx, kz] = toW(G, e.kiosk.run + 1.5, 0);
    slope({ id: `exit-${e.exit}`, kind: 'exit', F: G, len: e.kiosk.run, hw: e.kiosk.hw, y0: floors.get(e.level).y, y1: 0, low: e.level, high: groundAt(kx, kz) });
  }
  // 车库坡道、一期 B1↔B2 坡道
  for (const r of layout.ramps) {
    const [lo, hi] = r.from.y <= r.to.y ? [r.from, r.to] : [r.to, r.from];
    const fl = (p) => (p.level === 'street' ? groundAt(p.x, p.z) : p.level);
    lane(r.id, 'ramp', lo.x, lo.z, lo.y, hi.x, hi.z, hi.y, r.width / 2, fl(lo), fl(hi), 0);
  }
  for (const lv of layout.levels) for (const u of lv.units) {
    const d = u.residence?.duplex;
    if (!d) continue;
    const s = d.stair, [bx, bz] = toW(u.frame, ...s.bottom), [tx, tz] = toW(u.frame, ...s.top);
    lane(s.id, 'interior-stair', bx, bz, lv.elev, tx, tz, lv.elev + d.height, s.width / 2, lv.id, d.surface.id, 0);
  }

  for (const b of layout.buildings) for (const f of b.access?.flights || []) {
    lane(f.id, 'exterior-stair', f.bottom.x, f.bottom.z, f.bottom.y,
      f.top.x, f.top.z, f.top.y, f.width / 2, f.from, f.to, 0);
  }

  // ---------- 传送边与门口区 ----------
  const portals = [];
  const portal = (a, b, seg, kind) => {
    const p = { a, b, seg, kind };
    portals.push(p);
    const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0) || 1;
    const nx = -(seg.z1 - seg.z0) / len, nz = (seg.x1 - seg.x0) / len;
    const k = NAV.zone;
    const zone = [[seg.x0 - nx * k, seg.z0 - nz * k], [seg.x1 - nx * k, seg.z1 - nz * k], [seg.x1 + nx * k, seg.z1 + nz * k], [seg.x0 + nx * k, seg.z0 + nz * k]];
    for (const id of [a, b]) { const F = floors.get(id); if (F) { F.portals.push(p); F.zones.push(zone); } }
  };
  for (const e of layout.entrances) {
    if (e.kiosk || e.architecturalOpening) continue;
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    const to = e.to === 'bridge' ? 'bridge' : e.to === 'site' ? groundAt(mx + e.nx, mz + e.nz) : e.to;
    if (floors.has(e.level) && floors.has(to)) portal(e.level, to, e.seg, 'entrance');
  }
  if (district) {
    const gid = groundAt(...polyCentroid(district));
    for (let i = 0; i < district.length; i++) {
      const [x0, z0] = district[i], [x1, z1] = district[(i + 1) % district.length];
      portal('ground', gid, { x0, z0, x1, z1 }, 'district');
    }
  }

  // ---------- 空间索引 ----------
  for (const F of floors.values()) indexWalls(F);

  const nav = { floors, portals, slopes, slopeById: new Map(slopes.map((s) => [s.id, s])), links: [], groundAt };

  // ---------- 互动点（楼梯、电梯、落地塔）：门外找一个站得住的点 ----------
  const stopAt = (floor, x, z, nx, nz) => {
    const F = floors.get(floor);
    for (const d of [1.0, 0.8, 1.3, 0.6, 1.6, 2.0]) {
      const px = x + nx * d, pz = z + nz * d;
      if (F && clearAt(nav, F, px, pz)) return { floor, x: px, z: pz, face: [nx, nz] };
    }
    return { floor, x: x + nx, z: z + nz, face: [nx, nz] };
  };
  for (const s of layout.stairs) {
    const stops = s.serves.filter((id) => floors.has(id)).map((id) => {
      const d = (s.wdoorByLevel && s.wdoorByLevel[id]) || s.wdoor;
      return stopAt(id, (d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2, d.nx, d.nz);
    });
    nav.links.push({ id: s.id, kind: 'stair', name: s.kind === 'kiosk' ? '地库楼梯' : '楼梯', stops: sortStops(stops, floors) });
  }
  for (const e of layout.elevators) {
    const stops = e.serves.filter((id) => floors.has(id)).map((id) => stopAt(id, e.x + e.nx * e.reach, e.z + e.nz * e.reach, e.nx, e.nz));
    nav.links.push({ id: e.id, kind: 'lift', elevator: e, name: e.type === 'glass' || e.tower ? '观光电梯' : e.type === 'freight' ? '货梯' : '电梯', stops: sortStops(stops, floors) });
  }
  if (br) {
    for (const v of br.verticals.filter((x) => x.type !== 'escalator')) {
      const t = br.towers.find((q) => q.id === v.tower);
      const [cx, cz] = t.center;
      const d = Math.hypot(v.ground[0] - cx, v.ground[1] - cz) || 1;
      const face = [(v.ground[0] - cx) / d, (v.ground[1] - cz) / d];
      nav.links.push({
        id: v.id, kind: v.type === 'lift' ? 'lift' : 'stair', name: `${t.name}${v.type === 'lift' ? '电梯' : '楼梯'}`,
        stops: [{ floor: groundAt(...v.ground), x: v.ground[0], z: v.ground[1], face }, { floor: 'bridge', x: v.deck[0], z: v.deck[1], face }],
      });
    }
  }
  return nav;
}

function sortStops(stops, floors) {
  return stops.sort((a, b) => floors.get(a.floor).y - floors.get(b.floor).y);
}

function indexWalls(F) {
  const c = NAV.cell, pad = NAV.r + 0.05;
  F.walls.forEach((w, i) => {
    const x0 = Math.floor((Math.min(w.x0, w.x1) - pad) / c), x1 = Math.floor((Math.max(w.x0, w.x1) + pad) / c);
    const z0 = Math.floor((Math.min(w.z0, w.z1) - pad) / c), z1 = Math.floor((Math.max(w.z0, w.z1) + pad) / c);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const k = `${gx},${gz}`;
        if (!F.grid.has(k)) F.grid.set(k, []);
        F.grid.get(k).push(i);
      }
    }
  });
}

function wallsNear(F, x0, z0, x1, z1) {
  const c = NAV.cell, pad = NAV.r + 0.05;
  const gx0 = Math.floor((Math.min(x0, x1) - pad) / c), gx1 = Math.floor((Math.max(x0, x1) + pad) / c);
  const gz0 = Math.floor((Math.min(z0, z1) - pad) / c), gz1 = Math.floor((Math.max(z0, z1) + pad) / c);
  if (gx0 === gx1 && gz0 === gz1) return (F.grid.get(`${gx0},${gz0}`) || []).map((i) => F.walls[i]);
  const set = new Set();
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) for (const i of F.grid.get(`${gx},${gz}`) || []) set.add(i);
  return [...set].map((i) => F.walls[i]);
}

// ---------------------------------------------------------------------------
// 判定

function supported(F, x, z) {
  for (const zp of F.zones) if (pointInPoly([x, z], zp)) return true;
  for (const p of F.pieces) {
    const b = p.bb;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    if (!pointInPoly([x, z], p.outer)) continue;
    let hole = false;
    for (const h of p.holes) {
      const hb = h.bb;
      if (x < hb.x0 || x > hb.x1 || z < hb.z0 || z > hb.z1) continue;
      if (pointInPoly([x, z], h.poly)) { hole = true; break; }
    }
    if (!hole) return true;
  }
  return false;
}

/** 点是否落在与本楼面相连的某段坡道的梯道矩形里（人的边缘可以探到坡道上方） */
function overSlope(F, x, z) {
  for (const sl of F.slopes) {
    const [u, v] = toL(sl.F, x, z);
    if (u >= -0.05 && u <= sl.len + 0.05 && Math.abs(v) <= sl.hw) return true;
  }
  return false;
}

function segDist(px, pz, w) {
  const dx = w.x1 - w.x0, dz = w.z1 - w.z0;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - w.x0) * dx + (pz - w.z0) * dz) / l2));
  const qx = w.x0 + dx * t, qz = w.z0 + dz * t;
  return [Math.hypot(px - qx, pz - qz), qx, qz];
}

function clearAt(nav, F, x, z) {
  if (!supported(F, x, z)) return false;
  for (const o of F.obstacles) if (x >= o.bb.x0 && x <= o.bb.x1 && z >= o.bb.z0 && z <= o.bb.z1
    && pointInPoly([x, z], o.outer) && !o.holes.some(h => pointInPoly([x, z], h.poly))) return false;
  const r = NAV.r;
  for (const [ox, oz] of DIRS) {
    const sx = x + ox * r, sz = z + oz * r;
    if (!supported(F, sx, sz) && !overSlope(F, sx, sz)) return false;
  }
  for (const w of wallsNear(F, x, z, x, z)) if (segDist(x, z, w)[0] < r - 0.01) return false;
  return true;
}

/** 状态 s 是否站得住（坡道状态只检查横向位置） */
export function clear(nav, s) {
  if (s.slope) {
    const sl = nav.slopeById.get(s.slope.id);
    return !!sl && Math.abs(s.slope.v) <= sl.hw - NAV.r + 1e-6 && s.slope.u >= 0 && s.slope.u <= sl.len;
  }
  const F = nav.floors.get(s.floor);
  return !!F && clearAt(nav, F, s.x, s.z);
}

/** 两线段是否相交（含端点） */
function segCross(ax, az, bx, bz, s) {
  const d = (x0, z0, x1, z1, x2, z2) => (x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0);
  const d1 = d(s.x0, s.z0, s.x1, s.z1, ax, az), d2 = d(s.x0, s.z0, s.x1, s.z1, bx, bz);
  const d3 = d(ax, az, bx, bz, s.x0, s.z0), d4 = d(ax, az, bx, bz, s.x1, s.z1);
  return d1 * d2 <= 0 && d3 * d4 <= 0 && !(d1 === 0 && d2 === 0);
}

/** 扫掠：从 (x0,z0) 走到 (x1,z1)，碰到墙就停在墙前 */
function sweep(F, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 1e-9) return [x1, z1];
  let tMin = 1;
  for (const w of wallsNear(F, x0, z0, x1, z1)) {
    const ex = w.x1 - w.x0, ez = w.z1 - w.z0, mx = x1 - x0, mz = z1 - z0;
    const den = mx * ez - mz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((w.x0 - x0) * ez - (w.z0 - z0) * ex) / den;
    const s = ((w.x0 - x0) * mz - (w.z0 - z0) * mx) / den;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) tMin = Math.min(tMin, t);
  }
  if (tMin >= 1) return [x1, z1];
  const t = Math.max(0, tMin - 0.02 / len);
  return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
}

/** 把点推离半径 r 内的墙（迭代 3 次，沿墙滑动） */
function slide(F, x, z) {
  const r = NAV.r;
  for (let k = 0; k < 3; k++) {
    let moved = false;
    for (const w of wallsNear(F, x, z, x, z)) {
      const [d, qx, qz] = segDist(x, z, w);
      if (d >= r || d < 1e-6) continue;
      x = qx + ((x - qx) / d) * r;
      z = qz + ((z - qz) / d) * r;
      moved = true;
    }
    if (!moved) break;
  }
  return [x, z];
}

// ---------------------------------------------------------------------------
// 移动

const atSlope = (s, sl, u, v) => {
  const [x, z] = toW(sl.F, u, v);
  return { floor: s.floor, x, z, y: sl.y0 + ((sl.y1 - sl.y0) * Math.max(0, Math.min(sl.len, u))) / sl.len, slope: { id: sl.id, u, v } };
};

/**
 * 解算一步移动：s = { floor, x, z, y, slope }，(dx, dz) 为水平位移，dt 用于扶梯皮带。
 * 楼面状态：墙（扫掠 + 滑动）→ 传送边 → 坡道入口 → 可站立；不行就只走 x 或只走 z。
 */
export function step(nav, s, dx, dz, dt = 0) {
  if (s.slope) return stepSlope(nav, s, dx, dz, dt);
  const F = nav.floors.get(s.floor);
  const tries = [[dx, dz], [dx, 0], [0, dz]];
  for (const [mx, mz] of tries) {
    if (!mx && !mz) continue;
    let [x, z] = sweep(F, s.x, s.z, s.x + mx, s.z + mz);
    [x, z] = slide(F, x, z);
    for (const p of F.portals) {
      if (!segCross(s.x, s.z, x, z, p.seg)) continue;
      const G = nav.floors.get(p.a === F.id ? p.b : p.a);
      if (G && clearAt(nav, G, x, z)) return { floor: G.id, x, z, y: G.y, slope: null };
    }
    for (const sl of F.slopes) {
      const [u0, v0] = toL(sl.F, s.x, s.z), [u1, v1] = toL(sl.F, x, z);
      const lim = sl.hw - NAV.r;
      const inside = u1 >= 0 && u1 <= sl.len && Math.abs(v1) <= lim;
      const was = u0 >= 0 && u0 <= sl.len && Math.abs(v0) <= lim;
      if (!inside || was) continue;
      if ((sl.low === F.id && u0 < 0) || (sl.high === F.id && u0 > sl.len)) return atSlope({ ...s, floor: F.id }, sl, u1, v1);
    }
    if (clearAt(nav, F, x, z)) return { floor: F.id, x, z, y: F.y, slope: null };
  }
  return { ...s, y: F.y, slope: null };
}

function stepSlope(nav, s, dx, dz, dt) {
  const sl = nav.slopeById.get(s.slope.id);
  const du = dx * sl.F.c + dz * sl.F.s, dv = -dx * sl.F.s + dz * sl.F.c;
  const lim = sl.hw - NAV.r;
  let u = s.slope.u + du + sl.belt * 0.5 * dt;
  const v = Math.max(-lim, Math.min(lim, s.slope.v + dv));
  if (u < 0 || u > sl.len) {
    const G = nav.floors.get(u < 0 ? sl.low : sl.high);
    const [x, z] = toW(sl.F, u, v);
    if (G && clearAt(nav, G, x, z)) return { floor: G.id, x, z, y: G.y, slope: null };
    u = Math.max(0, Math.min(sl.len, u));
  }
  return atSlope(s, sl, u, v);
}

// ---------------------------------------------------------------------------
// 查询

/** 飞行落地：正下方（y ≤ yMax）最高的可站立楼面 */
export function landAt(nav, x, z, yMax) {
  let best = null;
  for (const F of nav.floors.values()) {
    if (F.y > yMax + 1e-6 || (best && F.y <= best.y)) continue;
    if (clearAt(nav, F, x, z)) best = F;
  }
  let result = best ? { floor: best.id, x, z, y: best.y, slope: null } : null;
  for (const sl of nav.slopes) {
    if (sl.kind !== 'interior-stair' && sl.kind !== 'exterior-stair') continue;
    const [u, v] = toL(sl.F, x, z);
    if (u < 0 || u > sl.len || Math.abs(v) > sl.hw - NAV.r) continue;
    const y = sl.y0 + (sl.y1 - sl.y0) * u / sl.len;
    if (y <= yMax + 1e-6 && (!result || y > result.y)) result = atSlope({ floor: sl.low }, sl, u, v);
  }
  return result;
}

/** 视线 a → b（[x, y, z]）是否被楼板挡住：穿过某个楼面高度处若是楼板实体就挡；中庭、扶梯洞等洞口不挡 */
export function sightBlocked(nav, a, b) {
  const [x0, y0, z0] = a, [x1, y1, z1] = b;
  for (const F of nav.floors.values()) {
    if ((y0 - F.y) * (y1 - F.y) >= 0) continue;
    const t = (F.y - y0) / (y1 - y0);
    if (supported(F, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return true;
  }
  return false;
}

/** 本楼面 reach 内的互动点；options 为可去的停靠层（楼梯：相邻层；电梯：全部） */
export function linksNear(nav, floor, x, z) {
  const out = [];
  for (const k of nav.links) {
    const i = k.stops.findIndex((st) => st.floor === floor && Math.hypot(st.x - x, st.z - z) <= NAV.reach);
    if (i < 0) continue;
    const options = k.kind === 'stair' ? [k.stops[i - 1], k.stops[i + 1]].filter(Boolean) : k.stops.filter((_, j) => j !== i);
    if (options.length) out.push({ link: k, stop: k.stops[i], options });
  }
  return out;
}

/** 出生点：楼层 → 最大走道里离中心最近的站得住的点；楼栋 → 主入口内侧；默认 → 一期东南主入口外广场 */
export function spawn(nav, layout, { building, level } = {}) {
  if (level) return levelSpawn(nav, layout, level);
  const inside = (e, d) => {
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    // 室外出生面朝入口，室内出生面朝楼内：两种情况都是朝 −n
    return { x: mx + e.nx * d, z: mz + e.nz * d, yaw: yawOf(-e.nx, -e.nz) };
  };
  if (building) {
    const b = layout.buildings.find((x) => x.id === building);
    if (b && (b.kind === 'mall' || b.kind === 'tower')) {
      const e = layout.entrances.find((x) => x.building === building && x.main) || layout.entrances.find((x) => x.building === building && x.to === 'site');
      if (e) {
        const p = inside(e, -2);
        const F = nav.floors.get(e.level);
        if (clearAt(nav, F, p.x, p.z)) return { floor: e.level, x: p.x, z: p.z, y: F.y, slope: null, yaw: p.yaw };
      }
    }
    const lv = b && (layout.levels.find((l) => l.building === building && (l.ground || l.short === '1F')) || layout.levels.find((l) => l.building === building && l.short === 'B1'));
    if (lv) return levelSpawn(nav, layout, lv.id, b.kind === 'street' ? featurePoint(lv, 'plaza') : null);
  }
  const e = layout.entrances.find((x) => x.building === 'P1' && x.main) || layout.entrances.find((x) => x.to === 'site' && !x.kiosk);
  if (e) {
    for (const d of [12, 9, 6, 4]) {
      const p = inside(e, d);
      const F = nav.floors.get(nav.groundAt(p.x, p.z));
      if (clearAt(nav, F, p.x, p.z)) return { floor: F.id, x: p.x, z: p.z, y: F.y, slope: null, yaw: p.yaw };
    }
  }
  return levelSpawn(nav, layout, layout.levels[0].id);
}

const featurePoint = (lv, type) => { const f = lv.features.find((q) => q.type === type); return f && f.x !== undefined ? [f.x, f.z] : null; };

function levelSpawn(nav, layout, levelId, prefer = null) {
  const lv = layout.levels.find((l) => l.id === levelId);
  const F = nav.floors.get(levelId);
  if (prefer && clearAt(nav, F, prefer[0], prefer[1])) return { floor: levelId, x: prefer[0], z: prefer[1], y: F.y, slope: null, yaw: 0 };
  const walks = [...lv.walk].sort((a, b) => Math.abs(polyArea(b.poly)) - Math.abs(polyArea(a.poly)));
  for (const w of walks) {
    const c = polyCentroid(w.poly);
    const pts = polySamples(w.poly, 1.5, 0.4).sort((p, q) => dist(p, c) - dist(q, c));
    for (const p of pts) {
      if (!clearAt(nav, F, p[0], p[1])) continue;
      const yaw = w.frame ? yawOf(w.frame.c, w.frame.s) : 0;
      return { floor: levelId, x: p[0], z: p[1], y: F.y, slope: null, yaw };
    }
  }
  return null;
}

/** 位置名称（HUD 顶部） */
export function floorLabel(nav, layout, s) {
  if (s.slope) {
    const sl = nav.slopeById.get(s.slope.id);
    return { escalator: '扶梯', exit: '地铁出入口楼梯', ramp: '坡道', 'interior-stair': '套内复式楼梯', 'exterior-stair': '街区楼梯' }[sl && sl.kind] || '';
  }
  const F = nav.floors.get(s.floor);
  if (!F) return '';
  if (F.kind === 'level' || F.kind === 'mezzanine') {
    const b = layout.buildings.find((x) => x.id === F.building);
    const suffix = F.kind === 'mezzanine' ? (F.unit ? ` · ${F.unit.code} 夹层` : ' · 楼梯中间平台') : '';
    return `${b.short} · ${F.level.name}${suffix}`;
  }
  if (F.kind === 'bridge') return '云环天桥';
  const plot = layout.site.plots.find((p) => pointInPoly([s.x, s.z], p.poly));
  return `室外 · ${plot ? plot.name : '道路'}`;
}
