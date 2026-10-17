// 地铁 云澜汇站（v3 规格第 4 节）：路口地下两层——B1 站厅（−4.5）、B2 岛式站台（−12）；
// 四条沿对角线的地下通道分别接一期 B1M、二期 B1、三期 B1 与公园 B 口，A / C / D 口自通道侧向出地面。
// 约定：站厅、站台用世界坐标（x 沿云澜大道）；通道 frame(0,0,θ)，u 沿对角线向外，v = u 转 +90°；
// 出入口 frame 原点在楼梯底端中线，u 指向上行方向（u∈[0,RUN] 由站厅标高升到地面）。
import { frame, IDENTITY, rect, rectPoly, lrectPoly, lpoly, lseg, toW, polyBounds, subtractInterval, convexOverlap } from './geom.js';
import { ESC, CATEGORIES } from './constants.js';
import { lift } from './mall.js';
import { PORTAL_U } from './p3.js';
import { prepareMallStairs, buildMallStairAccess } from './mall-stairs.js';

export const METRO = {
  box: rect(-66, -11, 66, 11),
  platform: rect(-60, -6, 60, 6),
  track: 7.6,
  train: { cars: 6, len: 19, w: 3 },
  gate: 36,
  line: '7 号线',
};
/** 出入口：楼梯段长 RUN、两端平台、半宽 HW、雨棚范围（出入口 frame 局部） */
export const EXIT = { run: 9.5, landing: 2.5, hw: 3, roof: rect(-0.5, -3.5, 12, 3.5), open: rect(0, -3.25, 9.5, 3.25) };
const HW = 4;
const C0 = 11 * Math.SQRT2;

const LEVELS = [
  {
    short: 'B2', name: 'B2 站台', kind: 'platform', elev: -12, height: 7.5,
    theme: { key: 'platform', floor: 'granite', accent: '#c8352b', label: '岛式站台 · 往星湾 / 往云澜里 · 6 节编组' },
  },
  {
    short: 'B1', name: 'B1 站厅', kind: 'concourse', elev: -4.5, height: 4,
    theme: { key: 'metro', floor: 'metro-terrazzo', accent: '#c8352b', label: '站厅 · 售检票 · 四向通道接各期商场与公园' },
  },
];

/** 四条通道：一期、二期接翼楼末端立面，三期接地库切角，公园止于 B 口楼梯底 */
const PASSAGES = [
  { id: 'PA', deg: 225, name: '一期通道', en: 'TO YUNLAN MALL', to: 'P1-B1M', end: (b) => facade(b.P1, 'SE') },
  { id: 'PC', deg: 315, name: '二期通道', en: 'TO XINGWAN', to: 'P2-B1', end: (b) => facade(b.P2, 'W') },
  { id: 'PD', deg: 135, name: '三期通道', en: 'TO YUNLAN LANE', to: 'P3-B1', end: () => PORTAL_U },
  { id: 'PB', deg: 45, name: '公园通道', en: 'TO CENTRAL PARK', to: null, end: () => 68 },
];
/** 出入口：A / C / D 在通道一侧（side），楼梯朝路口方向上行，u 为楼梯顶端；B 在公园通道尽端继续上行 */
const EXITS = [
  { id: 'A', passage: 'PA', side: -1, u: 46, name: 'A 口 · 一期云澜汇' },
  { id: 'C', passage: 'PC', side: 1, u: 46, name: 'C 口 · 二期星湾' },
  { id: 'D', passage: 'PD', side: -1, u: 39.5, name: 'D 口 · 三期云澜里' },
  { id: 'B', passage: 'PB', end: true, name: 'B 口 · 中央公园' },
];

function facade(b, wingId) {
  const w = b.wings.find((x) => x.id === wingId);
  return Math.hypot(...toW(w.F, w.uEnd, 0));
}

/** 轴对齐矩形 r 扣掉若干轴对齐矩形，返回覆盖剩余部分的矩形（按 x 切竖条、相同 z 区间的相邻竖条合并） */
export function carve(r, holes) {
  const hs = holes
    .map((h) => rect(Math.max(h.x0, r.x0), Math.max(h.z0, r.z0), Math.min(h.x1, r.x1), Math.min(h.z1, r.z1)))
    .filter((h) => h.x1 - h.x0 > 1e-6 && h.z1 - h.z0 > 1e-6);
  const xs = [...new Set([r.x0, r.x1, ...hs.flatMap((h) => [h.x0, h.x1])])].sort((a, b) => a - b);
  const strips = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    if (b - a < 1e-6) continue;
    let ivs = [[r.z0, r.z1]];
    for (const h of hs) if (h.x0 < b - 1e-6 && h.x1 > a + 1e-6) ivs = subtractInterval(ivs, [h.z0, h.z1]);
    const key = ivs.map(([p, q]) => `${p.toFixed(3)}:${q.toFixed(3)}`).join('|');
    const last = strips[strips.length - 1];
    if (last && last.key === key) last.b = b;
    else strips.push({ a, b, ivs, key });
  }
  return strips.flatMap((s) => s.ivs.filter(([z0, z1]) => z1 - z0 > 0.3).map(([z0, z1]) => rect(s.a, z0, s.b, z1)));
}

const walkR = (id, kind, r) => ({ id, kind, poly: rectPoly(r), frame: IDENTITY, rect: r });

/** 站台 → 站厅扶梯一对（沿 x，上下行各一，斜段 30°） */
function escPair(id, lo, hi, bottom, sign, label) {
  const rise = +(hi.elev - lo.elev).toFixed(3);
  const run = rise * Math.sqrt(3);
  const top = bottom + sign * run;
  const h = ESC.slotHalf;
  const slotRect = rect(Math.min(bottom, top), -h, Math.max(bottom, top), h);
  return [-1, 1].map((k, i) => {
    const z = (k * ESC.lane) / 2;
    return {
      id: `M-${id}-${i ? 'D' : 'U'}`, building: 'M', pair: `M-${id}`, from: lo.id, to: hi.id, dir: i ? 'down' : 'up',
      bottom: { x: bottom, y: lo.elev, z }, top: { x: top, y: hi.elev, z }, width: ESC.width, rise, run, slot: true, label,
      frame: IDENTITY, axis: 'x', wing: null, rot: null, slotRect, square: false,
    };
  });
}

/**
 * parts：一期、二期、三期已构建的 { building, levels }；同时登记场地开口、改公园 B 口位置、
 * 在地面层楼板（三期街巷）上为出入口挖洞。返回与其它期相同结构的 { building, levels, … }。
 */
export function buildMetro(parts, site, picker) {
  const bid = 'M';
  const byB = Object.fromEntries(parts.map((p) => [p.building.id, p.building]));
  const box = rectPoly(METRO.box);
  const levels = LEVELS.map((c) => ({
    id: `${bid}-${c.short}`, building: bid, short: c.short, name: c.name, kind: c.kind, elev: c.elev, height: c.height,
    theme: { ...c.theme }, outline: box, units: [], rooms: [], walk: [], voids: [], features: [], slab: null,
  }));
  const [B2, B1] = levels;
  const serves = [B2.id, B1.id];

  // ---------- 垂直交通：扶梯两对、客梯两部（站台中部）、楼梯两部（站台两端） ----------
  const escalators = [...escPair('MA', B2, B1, -12, -1, '站台 ↔ 站厅（西）'), ...escPair('MB', B2, B1, 12, 1, '站台 ↔ 站厅（东）')];
  const slots = [escalators[0].slotRect, escalators[2].slotRect];
  const elevators = [
    { ...lift('M-L1', bid, 'passenger', IDENTITY, 0, -1.5, 3, 2.6, 'N', serves), exterior: true },
    { ...lift('M-L2', bid, 'passenger', IDENTITY, 0, 1.5, 3, 2.6, 'S', serves), exterior: true },
  ];
  const shafts = rect(-1.5, -2.8, 1.5, 2.8);
  const stairs = [
    { id: 'M-STW', building: bid, kind: 'metro', frame: IDENTITY, rect: rect(-54, -2, -46, 2), door: { x0: -46, z0: -1.2, x1: -46, z1: 1.2, side: 'E' }, doorByLevel: {}, serves },
    { id: 'M-STE', building: bid, kind: 'metro', frame: IDENTITY, rect: rect(46, -2, 54, 2), door: { x0: 46, z0: -1.2, x1: 46, z1: 1.2, side: 'W' }, doorByLevel: {}, serves },
  ];
  prepareMallStairs(stairs);
  for (const s of stairs) {
    s.poly = lrectPoly(s.frame, s.rect);
    s.wdoor = lseg(s.frame, s.door);
    s.wdoorByLevel = {};
    for (const lv of levels) lv.rooms.push({ id: s.id, type: 'stair', label: '楼梯', frame: IDENTITY, rects: [s.rect], doors: [s.door] });
  }

  // ---------- B2 站台 ----------
  B2.walk.push(...carve(METRO.platform, [...stairs.map((s) => s.rect), shafts, ...slots]).map((r, i) => walkR(`PF${i}`, 'platform', r)));
  B2.slab = { pieces: [{ outer: rectPoly(METRO.platform), holes: [] }] };
  B2.features.push({ type: 'psd', z: -METRO.platform.z1, x0: -57, x1: 57 }, { type: 'psd', z: METRO.platform.z1, x0: -57, x1: 57 });
  // 靠右行车：南侧轨道（z>0）东行往星湾，北侧轨道西行往云澜里
  B2.features.push({ type: 'rail', z: METRO.track, dir: 1, name: '往星湾', en: 'TO XINGWAN' }, { type: 'rail', z: -METRO.track, dir: -1, name: '往云澜里', en: 'TO YUNLAN LANE' });

  // ---------- B1 站厅：中部付费区，两端与南北两条长廊为非付费区 ----------
  const G = METRO.gate;
  const svc = [rect(-G - 2, -5, -G + 2, -2), rect(G - 2, 2, G + 2, 5)];
  const shop = { W: rect(-66, -11, -56, -5), E: rect(56, 5, 66, 11) };
  const wc = rect(58, -11, 66, -5);
  const office = rect(-66, 5, -58, 11);
  const hall = (id, r, holes) => carve(r, holes).map((q, i) => walkR(`${id}${i}`, 'concourse', q));
  B1.walk.push(...hall('HW', rect(-66, -5, -G, 5), [stairs[0].rect, svc[0]]));
  B1.walk.push(...hall('HP', rect(-G, -5, G, 5), [...svc, ...slots, shafts]));
  B1.walk.push(...hall('HE', rect(G, -5, 66, 5), [stairs[1].rect, svc[1]]));
  B1.walk.push(walkR('NS', 'concourse', rect(-56, -11, 58, -5)), walkR('SS', 'concourse', rect(-58, 5, 56, 11)));
  for (const [k, r] of svc.entries()) B1.rooms.push({ id: `M-SVC${k + 1}`, type: 'service', label: '客服中心', frame: IDENTITY, rects: [r], doors: [] });
  B1.rooms.push({ id: 'M-WC', type: 'wc', label: '洗手间', frame: IDENTITY, rects: [wc], doors: [{ x0: 60.5, z0: -5, x1: 63.5, z1: -5, side: 'S' }] });
  B1.rooms.push({ id: 'M-OFFICE', type: 'equip', label: '站务室', frame: IDENTITY, rects: [office], doors: [{ x0: -63.5, z0: 5, x1: -60.5, z1: 5, side: 'N' }] });
  const unit = (slot, r, front, cat) => {
    const brand = picker.take(cat);
    B1.units.push({ id: `${B1.id}-${slot}`, slot, level: B1.id, building: bid, brand, frame: IDENTITY, rects: [r], fronts: [front], style: 'glass' });
  };
  unit('W', shop.W, { x0: -65, z0: -5, x1: -57, z1: -5, side: 'S' }, 'convenience');
  unit('E', shop.E, { x0: 57, z0: 5, x1: 65, z1: 5, side: 'N' }, 'bakery');
  B1.voids.push(...slots.map((r, k) => ({ id: `M-slot-${k ? 'MB' : 'MA'}`, kind: 'escalator', poly: rectPoly(r), frame: IDENTITY, rect: r })));
  B1.voids.push({ id: 'M-shaft', kind: 'shaft', poly: rectPoly(shafts), frame: IDENTITY, rect: shafts });
  B1.features.push({ type: 'gates', x: -G, z0: -2, z1: 5, name: '西闸机' }, { type: 'gates', x: G, z0: -5, z1: 2, name: '东闸机' });
  B1.features.push({ type: 'fence', x0: -G + 2, x1: G, z: -5 }, { type: 'fence', x0: -G, x1: G - 2, z: 5 });
  B1.features.push({ type: 'tvm', x: -42, z: 4.2, n: 4, face: 'N' }, { type: 'tvm', x: 42, z: -4.2, n: 4, face: 'S' });

  // ---------- 四条通道（属于站厅层） ----------
  const passages = PASSAGES.map((p) => {
    const F = frame(0, 0, p.deg, `M-${p.id}`);
    const sg = Math.sign(F.s * F.c);
    const uEnd = p.end(byB);
    const pts = [[C0 + HW * sg, -HW], [uEnd, -HW], [uEnd, HW], [C0 - HW * sg, HW]];
    const poly = lpoly(F, pts);
    B1.walk.push({ id: p.id, kind: 'passage', poly, frame: F, lpoly: pts });
    return { id: p.id, deg: p.deg, name: p.name, en: p.en, to: p.to, F, u0: C0 - HW, uEnd, hw: HW, lpoly: pts, poly };
  });
  const pById = Object.fromEntries(passages.map((p) => [p.id, p]));

  // ---------- 出入口（楼梯 + 上行扶梯 + 玻璃雨棚） ----------
  const exits = EXITS.map((x) => {
    const P = pById[x.passage];
    const [ox, oz] = x.end ? toW(P.F, P.uEnd, 0) : toW(P.F, x.u + EXIT.run, x.side * 7.5);
    const Gf = frame(ox, oz, x.end ? P.deg : (P.deg + 180) % 360, `M-X${x.id}`);
    if (!x.end) {
      const v = [x.side * HW, x.side * (HW + 6.5)].sort((a, b) => a - b);
      const r = rect(x.u + EXIT.run, v[0], x.u + EXIT.run + EXIT.landing, v[1]);
      B1.walk.push({ id: `X${x.id}`, kind: 'exit', poly: lrectPoly(P.F, r), frame: P.F, rect: r });
    }
    const [kx, kz] = toW(Gf, (EXIT.roof.x0 + EXIT.roof.x1) / 2, 0);
    const kiosk = { x: kx, z: kz, deg: Gf.deg, frame: Gf, poly: lrectPoly(Gf, EXIT.roof), open: lrectPoly(Gf, EXIT.open), run: EXIT.run, rise: -B1.elev, hw: EXIT.hw };
    site.openings.push(kiosk.open);
    const seg = lseg(Gf, { x0: 0, z0: -EXIT.hw, x1: 0, z1: EXIT.hw, side: 'E' });
    return {
      id: `M-${x.id}`, building: bid, name: x.name, level: B1.id, seg: { x0: seg.x0, z0: seg.z0, x1: seg.x1, z1: seg.z1 }, nx: seg.nx, nz: seg.nz,
      width: EXIT.hw * 2, main: false, to: 'site', square: false, exit: x.id, passage: P.id, kiosk,
    };
  });
  // 地面为楼层楼板的地块（三期街巷）在出入口处挖洞
  for (const p of parts) {
    for (const lv of p.levels.filter((l) => l.ground)) {
      for (const piece of lv.slab.pieces) for (const e of exits) if (convexOverlap(piece.outer, e.kiosk.open)) piece.holes.push(e.kiosk.open);
    }
  }
  const bx = exits.find((e) => e.exit === 'B').kiosk;
  site.park.metro = { x: bx.x, z: bx.z, deg: bx.deg, name: '地铁云澜汇站 · B 口' };

  // ---------- 楼板与编号 ----------
  const landings = B1.walk.filter((w) => w.kind === 'exit').map((w) => ({ outer: w.poly, holes: [] }));
  B1.slab = { pieces: [{ outer: box, holes: B1.voids.map((v) => v.poly) }, ...passages.map((p) => ({ outer: p.poly, holes: [] })), ...landings] };
  for (const lv of levels) {
    for (const u of lv.units) {
      u.polys = u.rects.map((r) => lrectPoly(u.frame, r));
      u.wfronts = u.fronts.map((f) => lseg(u.frame, f));
      u.brand.catLabel = (CATEGORIES[u.brand.cat] || {}).label || u.brand.cat;
    }
    for (const m of lv.rooms) {
      m.polys = m.rects.map((r) => lrectPoly(m.frame, r));
      m.wdoors = m.doors.map((d) => lseg(m.frame, d));
    }
    lv.units.forEach((u, i) => { u.code = `M${lv.short}-${String(i + 1).padStart(2, '0')}`; });
  }

  const bb = polyBounds(box);
  const building = {
    id: bid, code: 'M', name: '地铁 · 云澜汇站', short: '地铁', en: 'YUNLAN HUI STATION', kind: 'metro', levels: levels.map((l) => l.id),
    outline: box, center: [(bb.x0 + bb.x1) / 2, (bb.z0 + bb.z1) / 2], radius: 64, plot: null, rotundas: [], wings: [],
    box: METRO.box, platform: METRO.platform, track: METRO.track, train: METRO.train, gate: METRO.gate, line: METRO.line,
    passages, exits: exits.map((e) => ({ id: e.exit, name: e.name, passage: e.passage, entrance: e.id, kiosk: e.kiosk })),
  };
  building.access = buildMallStairAccess(building, levels, stairs);
  return { building, levels, escalators, elevators, stairs, entrances: exits, ramps: [] };
}
