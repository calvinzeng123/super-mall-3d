// 云澜大道公交站：二期星湾广场前的一对港湾式车站（星湾广场站，每向两个泊位，中间为信号控制的人行横道），
// 以及一期大道侧原有的路边候车亭。只登记场地数据（site.busStops）：车道外的港湾、候车站台、候车亭与
// 小品的碰撞体、过街横道与安全岛、停靠公交的行驶轨迹与时刻。港湾不进入 site.roads / extensions.roads。
import { rect, rectPoly } from './geom.js';

// 12 m 低地板城市公交。轴距 7.2 m，前轴在车身中心前 3.8 m。
export const BUS = { length: 12, width: 2.55, height: 3.2, frontAxle: 3.8, rearAxle: -3.4 };

const box = (x, z, hw, hd = hw) => rectPoly(rect(x - hw, z - hd, x + hw, z + hd));

/** 候车亭：立柱和玻璃挡风墙都在背面（back = -1 背面朝北，+1 朝南），朝车道的一侧完全敞开。 */
function shelter(id, x, z, w, d, back) {
  const posts = [-w / 2 + .25, -w / 6, w / 6, w / 2 - .25].map(dx => [x + dx, z + back * (d / 2 - .15)]);
  const zb = z + back * d / 2;
  const screen = rect(x - w / 2, Math.min(zb, zb - back * .08), x + w / 2, Math.max(zb, zb - back * .08));
  return { id, x, z, w, d, h: 3.3, back, x0: x - w / 2, x1: x + w / 2, front: z - back * d / 2, posts, screen };
}

/** 一个港湾式车站。side：站台在车道的哪一侧（-1 北 / +1 南）；travel：车辆行驶方向（-1 向西 / +1 向东）。 */
function bayStop(spec) {
  const { id, side, travel, bay, berths, platform, pocket, shelterAt, seats, pole, bins, totem, lamps, landing, mapAt } = spec;
  const curbZ = side * 14;
  // Widen the bay by 0.3 m into the carriageway so the straight sidewalk kerb
  // (z = ±14 ± 0.15) is removed along the whole bay mouth.
  const [a, , , d] = bay;
  const curbCut = [[a[0], curbZ - side * .3], ...bay, [d[0], curbZ - side * .3]];
  const S = shelter(`${id}-shelter`, shelterAt[0], shelterAt[1], 22, 2.6, side);
  const stop = {
    id, kind: 'bay', name: '星湾广场站', en: 'XINGWAN PLAZA', side, travel, curbZ,
    laneZ: side * 12, bayZ: side * 15.9,
    bay, curbCut,
    berths: berths.map(([bid, x0, x1, cx]) => {
      const r = rect(x0, Math.min(curbZ, curbZ + side * 3.5), x1, Math.max(curbZ, curbZ + side * 3.5));
      return { id: `${id}-${bid}`, name: bid, rect: r, poly: rectPoly(r), x: cx, front: cx + travel * BUS.length / 2 };
    }),
    platform: { rect: platform, poly: rectPoly(platform), edgeZ: side < 0 ? platform.z1 : platform.z0, top: .06 },
    pocket: { rect: pocket, poly: rectPoly(pocket) },
    shelter: S,
    seats: seats.map((x, i) => ({ id: `${id}-seat-${i + 1}`, x, z: side * 20, w: 3, d: .65, back: side })),
    pole: { x: pole[0], z: pole[1] },
    bins: bins.map(([x, z]) => ({ x, z, r: .22 })),
    totem: { x: totem[0], z: totem[1], w: .9, d: .3 },
    map: { x: mapAt, z: S.screen[side < 0 ? 'z1' : 'z0'] - side * .04, w: 1, d: .08 },
    lamps: lamps.map(x => ({ x, z: side * 22.5, dir: [0, -side] })),
    landing: { rect: landing, poly: rectPoly(landing) },
    // Back-of-sidewalk kerb removed where the station pocket and the crossing
    // landing join the sidewalk.
    curbGaps: [rectPoly(rect(pocket.x0, side * 20 - .3, pocket.x1, side * 20 + .3)),
      rectPoly(rect(landing.x0, side * 20 - .3, landing.x1, side * 20 + .3))],
    obstacles: [],
  };
  const o = stop.obstacles, block = (oid, poly) => o.push({ id: `${id}-${oid}`, poly });
  S.posts.forEach(([px, pz], i) => block(`post-${i + 1}`, box(px, pz, .11)));
  block('wind-screen', rectPoly(S.screen));
  const m = stop.map;
  block('route-map', rectPoly(rect(m.x - m.w / 2, Math.min(m.z - m.d / 2, m.z + m.d / 2), m.x + m.w / 2, Math.max(m.z - m.d / 2, m.z + m.d / 2))));
  for (const s of stop.seats) block(s.id.slice(id.length + 1), rectPoly(rect(s.x - s.w / 2, s.z - s.d / 2, s.x + s.w / 2, s.z + s.d / 2)));
  block('pole', box(stop.pole.x, stop.pole.z, .09));
  stop.bins.forEach((b, i) => block(`bin-${i + 1}`, box(b.x, b.z, .25)));
  block('totem', box(stop.totem.x, stop.totem.z, stop.totem.w / 2, stop.totem.d / 2));
  stop.lamps.forEach((l, i) => block(`lamp-${i + 1}`, box(l.x, l.z, .12)));
  // Each S-curve is given for the bus front axle; the rear axle trails it.
  // Two buses per direction, 12 s apart: the first takes the front berth.
  stop.service = {
    entry: spec.entry, exit: spec.exit, speed: 10, brake: 1.2, accel: 1, dwell: 20, period: 90,
    buses: [
      { id: `${id}-bus-1`, berth: stop.berths[0].id, offset: spec.phase, route: '12路', livery: '#39746c' },
      { id: `${id}-bus-2`, berth: stop.berths[1].id, offset: spec.phase + 12, route: '36路', livery: '#2f86b0' },
    ],
  };
  return stop;
}

/** 一期大道侧原有路边候车亭（背板、玻璃、灯箱与长椅），补登碰撞。原先居中于 z = -17，
 * 背板和长椅横在南侧步道中线上；现向路缘移 1.4 m，步道从背板后方通过（雨棚距路缘 0.4 m）。 */
function kerbsideStop() {
  const x = -70, z = -15.6;
  return {
    id: 'p1-avenue-stop', kind: 'kerbside', name: '云澜汇站', x, z,
    shelter: { x, z, w: 8, d: 2.4, back: -1 },
    seats: [{ x: x - 1.5, z: z - .2 }],
    obstacles: [
      // Back panel, glass and the advertising light box behind it.
      { id: 'p1-avenue-stop-back-panel', poly: rectPoly(rect(x - 4, z - .98, x + 4, z - .82)) },
      { id: 'p1-avenue-stop-bench', poly: rectPoly(rect(x - 2.4, z - .68, x - .6, z + .06)) },
    ],
  };
}

export function addBusStops(layout) {
  const site = layout.site;
  if (site.busStops) return site.busStops;
  const wb = bayStop({
    id: 'p2-bus-wb', side: -1, travel: -1,
    bay: [[100, -14], [115, -17.5], [145, -17.5], [165, -14]],
    berths: [['A', 115, 130, 122], ['B', 130, 145, 138]],
    platform: rect(113, -20.5, 147, -17.5), pocket: rect(107, -25, 153, -20.5),
    shelterAt: [126, -19.15], seats: [119, 126, 133], mapAt: 116.25,
    pole: [113.6, -18.6], bins: [[114, -20.1], [137.6, -20.1]], totem: [147.5, -24.6],
    lamps: [105.5, 154.5], landing: rect(167, -22.5, 182, -14),
    entry: [170, 142], exit: [118, 98], phase: 0,
  });
  const eb = bayStop({
    id: 'p2-bus-eb', side: 1, travel: 1,
    bay: [[179, 14], [194, 17.5], [224, 17.5], [236, 14]],
    berths: [['A', 209, 224, 217], ['B', 194, 209, 202]],
    platform: rect(192, 17.5, 226, 20.5), pocket: rect(186, 20.5, 232, 25),
    shelterAt: [213, 19.15], seats: [206, 213, 220], mapAt: 203.25,
    pole: [225.4, 18.6], bins: [[201.6, 20.1], [225.5, 20.1]], totem: [190.5, 24.6],
    lamps: [184.5, 233.5], landing: rect(167, 14, 177, 22.5),
    // Phased so both directions are at their berths together (t ≈ 33–42 s).
    entry: [176, 198], exit: [221, 237], phase: 56,
  });
  // Fascia and stop-pole lettering: direction of travel, then the English line.
  wb.directions = ['往 星湾路 · 一期', 'XINGWAN PLAZA · WESTBOUND'];
  eb.directions = ['往 东外环 · 中央公园', 'XINGWAN PLAZA · EASTBOUND'];
  // Mid-block signalised crossing between the two bays: pedestrians walk
  // behind the stopped buses, with a refuge where the median planting stops.
  const cr = rect(169, -14, 175, 14);
  const crossing = {
    id: 'p2-bus-crossing', rect: cr, poly: rectPoly(cr), axis: 'z', busStop: true,
    refuge: rect(168.5, -2, 175.5, 2),
    stopLines: [{ x: 177, z0: -14, z1: -2.2 }, { x: 167, z0: 2.2, z1: 14 }],
    signals: [
      { x: 166.6, z: -14.6, vehicle: 1 }, { x: 177.4, z: 14.6, vehicle: -1 },
      { x: 168.2, z: 0 }, { x: 175.8, z: 0 },
    ],
    // Dropped kerbs at both crossing mouths.
    curbGaps: [rectPoly(rect(cr.x0, -14.3, cr.x1, -13.7)), rectPoly(rect(cr.x0, 13.7, cr.x1, 14.3))],
  };
  wb.crossing = eb.crossing = crossing.id;
  // Signal poles: the north kerb and west refuge poles are recorded with the
  // westbound stop, the south kerb and east refuge poles with the eastbound one.
  crossing.signals.forEach((s, i) => (i % 2 ? eb : wb).obstacles.push({ id: `${crossing.id}-signal-${i + 1}`, poly: box(s.x, s.z, .125) }));
  site.crossings.push(crossing);
  for (const s of [wb, eb]) {
    site.walk.push({ id: `${s.id}-platform`, kind: 'promenade', poly: s.platform.poly, outdoor: true },
      { id: `${s.id}-pocket`, kind: 'promenade', poly: s.pocket.poly, outdoor: true },
      { id: `${s.id}-landing`, kind: 'promenade', poly: s.landing.poly, outdoor: true });
  }
  site.walk.push({ id: crossing.id, kind: 'crossing', poly: crossing.poly, outdoor: true });
  // Street trees, lamps and lawn trees keep clear of the bays and stations.
  site.activityExclusions = [...(site.activityExclusions || []),
    ...[wb, eb].flatMap(s => [s.bay, s.platform.poly, s.pocket.poly, s.landing.poly])];
  site.busStops = [wb, eb, kerbsideStop()];
  return site.busStops;
}

// ---------------------------------------------------------------------------
// 停靠公交的轨迹与时刻（纯函数，渲染与测试共用）

function sCurve(out, xa, za, xb, zb, n = 80) {
  for (let i = 0; i <= n; i++) { const u = i / n; out.push([xa + (xb - xa) * u, za + (zb - za) * (1 - Math.cos(Math.PI * u)) / 2]); }
}

/** Front-axle path for one bay stop: through lane → S-curve into the bay → straight → S-curve out → lane. */
export function busPath(stop) {
  const { laneZ, bayZ, travel } = stop, { entry, exit } = stop.service, pts = [[-travel * 300, laneZ]];
  sCurve(pts, entry[0], laneZ, entry[1], bayZ);
  sCurve(pts, exit[0], bayZ, exit[1], laneZ);
  pts.push([travel * 300, laneZ]);
  return pts;
}

/** Sample the bus along its path. The front axle follows the path; the rear
 * axle trails it at the wheelbase, as a real rigid bus does. Returns body
 * centre and heading every `step` metres of front-axle travel. */
export function busTrack(stop, step = .1) {
  const pts = busPath(stop), seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az);
    if (l > 1e-9) { seg.push({ ax, az, bx, bz, l, s: total }); total += l; }
  }
  const n = Math.floor(total / step) + 1, data = new Float64Array(n * 4), wb = BUS.frontAxle - BUS.rearAxle;
  let k = 0;
  const at = s => { while (k < seg.length - 1 && s > seg[k].s + seg[k].l) k++; const q = seg[k], t = Math.min(1, (s - q.s) / q.l); return [q.ax + (q.bx - q.ax) * t, q.az + (q.bz - q.az) * t]; };
  const f0 = at(0), first = seg[0];
  let rx = f0[0] - (first.bx - first.ax) / first.l * wb, rz = f0[1] - (first.bz - first.az) / first.l * wb;
  for (let i = 0; i < n; i++) {
    const [fx, fz] = at(i * step), dx = fx - rx, dz = fz - rz, l = Math.hypot(dx, dz), hx = dx / l, hz = dz / l;
    rx = fx - hx * wb; rz = fz - hz * wb;
    data.set([rx - hx * BUS.rearAxle, rz - hz * BUS.rearAxle, hx, hz], i * 4);
  }
  const track = { stop, total: (n - 1) * step, step, data };
  // Arc length at which each scheduled bus has its body centred on its berth.
  track.stops = Object.fromEntries(stop.berths.map(b => {
    for (let i = 1; i < n; i++) {
      const x0 = data[(i - 1) * 4], x1 = data[i * 4];
      if ((x0 - b.x) * (x1 - b.x) <= 0 && Math.abs(data[i * 4 + 1]) > 14) return [b.id, (i - 1 + (b.x - x0) / (x1 - x0)) * step];
    }
    throw new Error(`no stop on ${stop.id} for ${b.id}`);
  }));
  return track;
}

/** Interpolated body pose { x, z, hx, hz } at front-axle arc length s. */
export function trackPose(track, s, out = {}) {
  const { data, step } = track, n = data.length / 4;
  const f = Math.max(0, Math.min(n - 1, s / step)), i = Math.min(n - 2, Math.floor(f)), t = f - i, a = i * 4, b = a + 4;
  out.x = data[a] + (data[b] - data[a]) * t; out.z = data[a + 1] + (data[b + 1] - data[a + 1]) * t;
  const hx = data[a + 2] + (data[b + 2] - data[a + 2]) * t, hz = data[a + 3] + (data[b + 3] - data[a + 3]) * t, l = Math.hypot(hx, hz) || 1;
  out.hx = hx / l; out.hz = hz / l;
  return out;
}

/** Cruise at speed, brake into the berth, dwell, pull away and leave the
 * campus; then wait off-site until the next departure. */
export function busTimetable(track, bus) {
  const { speed: v, brake, accel, dwell, period } = track.stop.service, stopS = track.stops[bus.berth];
  const dDec = v * v / 2 / brake, dAcc = v * v / 2 / accel;
  const t1 = (stopS - dDec) / v, arrive = t1 + v / brake, leave = arrive + dwell, t4 = leave + v / accel;
  const end = t4 + (track.total - stopS - dAcc) / v;
  return { stopS, dDec, dAcc, t1, arrive, leave, t4, end, period, offset: bus.offset, v, brake, accel };
}

/** Front-axle arc length of a bus at time t (seconds); null while it is off-site. */
export function busDistance(table, t) {
  const { period: T, offset, t1, arrive, leave, t4, end, stopS, v, brake, accel, dAcc } = table;
  const u = ((t - offset) % T + T) % T;
  if (u < t1) return v * u;
  if (u < arrive) { const w = u - t1; return v * t1 + v * w - brake * w * w / 2; }
  if (u < leave) return stopS;
  if (u < t4) { const w = u - leave; return stopS + accel * w * w / 2; }
  if (u < end) return stopS + dAcc + v * (u - t4);
  return null;
}

/** Body outline (convex quad) of a bus pose. */
export function busOutline(p, pad = 0) {
  const hl = BUS.length / 2 + pad, hw = BUS.width / 2 + pad, nx = -p.hz, nz = p.hx;
  return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([u, v]) => [p.x + p.hx * u + nx * v, p.z + p.hz * u + nz * v]);
}
