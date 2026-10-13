// 三期 云澜里：保留11栋街区楼栋，新增8栋后街骑楼与双层地下车库。
// 楼上经连续双跑外挂楼梯和外挑连廊进入；西侧两组街道出入口、B1/B2双向层间坡道。
// 约定：每栋一个 frame（原点在楼栋中心，u 沿长边 L），楼栋 u∈[−L/2,L/2]、v∈[−W/2,W/2]；
// 外挑连廊在 +v 侧与 +u 端（宽 2.5m），+u 端再外挂 4m 服务区：楼梯（部分楼栋另有客梯井）。
import { frame, IDENTITY, rect, rectPoly, lrectPoly, lpoly, lseg, toW, dirW, polyBounds, pointInPoly, distToPolyEdge, dist } from './geom.js';
import { fillRows, markSpecial } from './parking.js';
import { split, lift } from './mall.js';
import { addDriveway, addTrench } from './campus.js';
import { CATEGORIES } from './constants.js';

/** [编号, 中心 x, 中心 z, 长 L, 宽 W, 角度, 层数] */
export const BLOCKS = [
  [1, -55, 60, 26, 18, 10, 2],
  [2, -95, 58, 30, 20, -8, 3],
  [3, -140, 66, 34, 22, 5, 3],
  [4, -185, 70, 30, 24, -12, 2],
  [5, -70, 105, 24, 30, 25, 2],
  [6, -120, 112, 36, 22, -15, 3],
  [7, -170, 120, 28, 26, 8, 2],
  [8, -215, 125, 22, 30, -5, 3],
  [9, -90, 160, 34, 20, 12, 2],
  [10, -145, 168, 30, 24, -10, 3],
  [11, -200, 175, 32, 22, 6, 2],
  // 后街骑楼：连续沿街门面、横向公共外廊，留出南外环消防净距。
  ...Array.from({ length: 8 }, (_, i) => [12 + i, -226 + i * 26, 233, 17, 14, 0, 3]),
];
const LIFT = new Set([3, 6, 10]);
const WC = new Set([3, 10]);
const BAR = new Set([1, 5, 9]);
const SKIN = { 1: 'brick', 2: 'stone', 3: 'timber', 4: 'brick', 5: 'glass', 6: 'brick', 7: 'timber', 8: 'stone', 9: 'brick', 10: 'glass', 11: 'timber' };
const GAL = 2.5;
const BAY = 4;

/** 街区铺装（1F 室外地面）、地下车库范围 */
export const DISTRICT = rect(-245, 20, -16, 250);
const BASEMENT = rect(-240, 40, -40, 184);
/** 地库东北角 45° 切角：切面正对路口，是地铁三期通道口（135° 对角线 frame 上 u = PORTAL_U，v∈[−5,5]） */
const CHAMFER = 5 * Math.SQRT2;
const BASEMENT_POLY = [[BASEMENT.x0, BASEMENT.z0], [BASEMENT.x1 - CHAMFER, BASEMENT.z0], [BASEMENT.x1, BASEMENT.z0 + CHAMFER], [BASEMENT.x1, BASEMENT.z1], [BASEMENT.x0, BASEMENT.z1]];
const CORNER_CUT = [[BASEMENT.x1 - CHAMFER, BASEMENT.z0], [BASEMENT.x1, BASEMENT.z0], [BASEMENT.x1, BASEMENT.z0 + CHAMFER]];
export const PORTAL_U = Math.hypot(BASEMENT.x1, BASEMENT.z0) + CHAMFER / Math.SQRT2;
/** 地库楼梯口（广场上的玻璃亭，B1 与 1F 共用一扇门，门开向 B1 车道） */
const KIOSKS = [
  { id: 'KS1', r: rect(-226, 71, -218, 77), side: 'S' },
  { id: 'KS2', r: rect(-232, 163, -224, 169), side: 'N' },
  { id: 'KS3', r: rect(-58, 83, -50, 89), side: 'N' },
  { id: 'KS4', r: rect(-58, 147, -50, 153), side: 'N' },
];

const LEVELS = [
  {
    short: 'B2', name: 'B2 停车场', kind: 'parking', elev: -9, height: 4.5,
    theme: { key: 'park-ochre', floor: 'concrete-green', accent: '#bb8443', label: '地下二层 · 双向层间坡道 · 电梯厅' },
  },
  {
    short: 'B1', name: 'B1 停车场', kind: 'parking', elev: -4.5, height: 4.5,
    theme: { key: 'park-green', floor: 'concrete-green', accent: '#2e9c6a', label: '停车场 · 云澜里地库 · 西侧出入口' },
  },
  {
    short: '1F', name: '1F 街巷', kind: 'street', elev: 0, height: 5, ground: true,
    theme: { key: 'street', floor: 'cobble', accent: '#9a5b34', label: '街巷首层 · 咖啡 · 买手店 · 中心广场' },
    cats: ['cafe', 'fashion', 'accessory', 'tea', 'home', 'beauty', 'books', 'shoes', 'toys', 'snack'],
  },
  {
    short: '2F', name: '2F 餐厅与工作室', kind: 'street', elev: 5, height: 4.5,
    theme: { key: 'loft', floor: 'wood-warm', accent: '#3d6f8f', label: '外廊二层 · 餐厅 · 设计工作室' },
    cats: ['restaurant', 'studio', 'restaurant', 'edu', 'cafe', 'restaurant', 'home'],
  },
  {
    short: '3F', name: '3F 屋顶露台', kind: 'street', elev: 9.5, height: 4.5,
    theme: { key: 'terrace', floor: 'deck-garden', accent: '#5a8f4e', label: '三层 · 酒吧 · 屋顶露台' },
    cats: ['bar', 'restaurant', 'studio', 'bar', 'cafe'],
  },
];

const walkL = (F, id, kind, r, outdoor = false) => ({ id, kind, poly: lrectPoly(F, r), frame: F, rect: r, outdoor });

function makeBlock([n, x, z, L, W, deg, floors]) {
  const F = frame(x, z, deg, `P3-K${n}`);
  const h = L / 2, w = W / 2;
  const hasLift = LIFT.has(n);
  const bay0 = w - (hasLift ? 11 : 7);
  return {
    n, id: `K${n}`, name: `${n} 号楼`, x, z, L, W, deg, floors, F, h, w, skin: SKIN[n] || (n % 2 ? 'timber' : 'brick'), heritage: n >= 12,
    lift: hasLift, wc: WC.has(n), bar: BAR.has(n), top: floors === 3 ? 14 : 9.5,
    foot: lrectPoly(F, rect(-h, -w, h, w)),
    poly: lrectPoly(F, rect(-h, -w, h + GAL + BAY, w + GAL)),
    deck: [[-h, -w], [h + GAL, -w], [h + GAL, bay0], [h + GAL + BAY, bay0], [h + GAL + BAY, w + GAL], [-h, w + GAL]],
    gallery: { side: rect(-h, w, h + GAL, w + GAL), end: rect(h, -w, h + GAL, w + GAL) },
    stairRect: rect(h + GAL, w - 7, h + GAL + BAY, w + GAL),
    stairDoor: { x0: h + GAL, z0: w - 6.8, x1: h + GAL, z1: w - 5.1, side: 'W' },
    stairShaft: rect(h + GAL + .1, w - 4.8, h + GAL + BAY - .1, w + GAL - .1),
    stairLanding: rect(h + GAL, w - 7, h + GAL + BAY, w - 4.8),
    shaft: hasLift ? rect(h + GAL, w - 11, h + GAL + BAY, w - 7) : null,
  };
}

export function buildP3(site, picker) {
  const bid = 'P3';
  const blocks = BLOCKS.map(makeBlock);
  const district = rectPoly(DISTRICT);
  const levels = LEVELS.map((c) => ({
    id: `${bid}-${c.short}`, building: bid, short: c.short, name: c.name, kind: c.kind, elev: c.elev, height: c.height,
    theme: { ...c.theme }, outline: c.kind === 'parking' ? BASEMENT_POLY : district, ground: !!c.ground,
    units: [], rooms: [], walk: [], voids: [], features: [], slab: null, cfg: c,
  }));
  const by = Object.fromEntries(levels.map((l) => [l.short, l]));
  const ids = (...s) => s.map((k) => by[k].id);
  const state = { split: { k: 0 }, cat: {} };
  const brand = (lv, cat) => {
    if (cat) return picker.take(cat);
    const cats = lv.cfg.cats;
    const k = (state.cat[lv.id] = (state.cat[lv.id] || 0) + 1);
    return picker.take(cats[(k - 1) % cats.length]);
  };
  const unit = (lv, b, slot, r, fronts, br, extra = {}) =>
    lv.units.push({ id: `${lv.id}-${b.id}-${slot}`, slot: `${b.id}-${slot}`, level: lv.id, building: bid, block: b.n, brand: br, frame: b.F, rects: [r], fronts, style: 'street', skin: b.skin, ...extra });

  // ---------- 垂直交通 ----------
  const elevators = [];
  const stairs = [];
  for (const b of blocks) {
    const serves = b.lift ? ids('B2', 'B1', '1F', '2F', '3F') : ids('1F', '2F', '3F');
    stairs.push({ id: `${bid}-${b.id}-ST`, building: bid, block: b.n, kind: 'exterior', frame: b.F, rect: b.stairRect, door: b.stairDoor, doorByLevel: {}, serves });
    if (b.lift) elevators.push({ ...lift(`${bid}-${b.id}-L`, bid, 'passenger', b.F, b.h + GAL + 1.8, b.w - 9, 3, 2.6, 'W', serves), exterior: true, block: b.n });
  }
  for (const k of KIOSKS) {
    const r = k.r;
    const z = k.side === 'S' ? r.z1 : r.z0;
    stairs.push({ id: `${bid}-${k.id}`, building: bid, kind: 'kiosk', frame: IDENTITY, rect: r, door: { x0: r.x0 + 2, z0: z, x1: r.x1 - 2, z1: z, side: k.side }, doorByLevel: {}, serves: ids('B2', 'B1', '1F') });
  }
  for (const lv of levels) {
    for (const s of stairs) {
      if (!s.serves.includes(lv.id)) continue;
      const b = blocks.find(b => b.n === s.block);
      lv.rooms.push({ id: s.id, type: 'stair', label: s.kind === 'kiosk' ? '地库出入口' : '楼梯', frame: s.frame, rects: [s.rect], doors: [s.door], block: s.block,
        ...(b ? { openStair: true, shaftRect: b.stairShaft, landingRect: b.stairLanding, navigationWalls: [
          { x0: b.h + GAL + BAY, z0: b.w - 7, x1: b.h + GAL + BAY, z1: b.w + GAL },
          { x0: b.h + GAL, z0: b.w - 7, x1: b.h + GAL + BAY, z1: b.w - 7 },
          { x0: b.h + GAL, z0: b.w + GAL, x1: b.h + GAL + BAY, z1: b.w + GAL },
        ] } : {}) });
      if (b) lv.walk.push(walkL(b.F, `${b.id}-stair-landing`, 'landing', b.stairLanding, lv.elev >= 0));
    }
    for (const b of blocks) {
      if (b.lift) lv.rooms.push({ id: `${bid}-${b.id}-core`, type: 'core', label: '客梯', frame: b.F, rects: [b.shaft], doors: [], block: b.n });
    }
  }

  // ---------- 1F 街巷 ----------
  const g = by['1F'];
  g.walk.push({ id: 'district', kind: 'plaza', poly: district, outdoor: true });
  for (const b of blocks) {
    const { h, w } = b;
    let u0 = -h;
    if (b.wc) {
      g.rooms.push({ id: `${bid}-${b.id}-wc`, type: 'wc', label: '洗手间', frame: b.F, rects: [rect(-h, -w, -h + 8, w)], doors: [{ x0: -h + 2.5, z0: -w, x1: -h + 5.5, z1: -w, side: 'N' }], block: b.n });
      u0 = -h + 8;
    }
    const parts = split(u0, h, [10, 9, 12, 8, 11], state.split);
    parts.forEach(([p, q], i) => {
      const fronts = [{ x0: p, z0: -w, x1: q, z1: -w, side: 'N' }, { x0: p, z0: w, x1: q, z1: w, side: 'S' }];
      if (i === 0 && !b.wc) fronts.push({ x0: p, z0: -w + 1, x1: p, z1: w - 1, side: 'W' });
      if (i === parts.length - 1) fronts.push({ x0: q, z0: -w + 1, x1: q, z1: w - 1, side: 'E' });
      unit(g, b, `${i + 1}`, rect(p, -w, q, w), fronts, brand(g));
    });
  }

  streetFeatures(g, blocks);

  // ---------- 2F / 3F：外挑连廊、楼上铺位、屋顶露台 ----------
  for (const s of ['2F', '3F']) {
    const lv = by[s];
    for (const b of blocks) {
      const { h, w } = b;
      const roof = s === '3F' && b.floors === 2;
      if (roof) {
        lv.walk.push(walkL(b.F, `${b.id}-terrace`, 'terrace', rect(-h, -w, h + GAL, w + GAL), true));
        if (b.bar) {
          const r = rect(-h + 1.5, -w + 1.5, -h + 1.5 + Math.min(12, b.L * 0.45), -w + 1.5 + Math.min(8, b.W * 0.4));
          unit(lv, b, 'bar', r, [{ x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1, side: 'S' }], brand(lv, 'bar'), { style: 'pavilion' });
        }
        continue;
      }
      lv.walk.push(walkL(b.F, `${b.id}-gal`, 'gallery', b.gallery.side, true));
      lv.walk.push(walkL(b.F, `${b.id}-galE`, 'gallery', b.gallery.end, true));
      const n = b.L >= 32 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const p = -h + (b.L * i) / n, q = -h + (b.L * (i + 1)) / n;
        const fronts = [{ x0: p, z0: w, x1: q, z1: w, side: 'S' }];
        if (i === n - 1) fronts.push({ x0: q, z0: -w + 1, x1: q, z1: w - 1, side: 'E' });
        unit(lv, b, `${i + 1}`, rect(p, -w, q, w), fronts, brand(lv));
      }
    }
  }

  // ---------- B1 / B2 停车 ----------
  const p = by['B1'];
  const innerLanes = [rect(-220, 130, -184, 136), rect(-220, 138, -184, 144)];
  for (const p of [by.B1, by.B2]) {
  const B = BASEMENT;
  const aisleZ = Array.from({ length: 9 }, (_, k) => 45 + 16 * k);
  // 单向车道：东西向车道隔行反向，三条南北向车道连成回路（dir 为行驶方向，供地面箭头与车流使用）
  // 东北角切角：A0 止于东车道西缘，东车道自切面起，切面与东车道之间补一块三角车道
  aisleZ.forEach((z, k) => p.walk.push({ ...walkL(IDENTITY, `A${k}`, 'aisle', rect(B.x0, z, k ? B.x1 : B.x1 - 6, z + 6)), dir: k % 2 ? [-1, 0] : [1, 0] }));
  const cross = [['XW', B.x0, B.x0 + 6, [0, 1], B.z0], ['XM', -143, -137, [0, -1], B.z0], ['XE', B.x1 - 6, B.x1, [0, -1], B.z0 + CHAMFER]];
  for (const [id, a, c, dir, z0] of cross) p.walk.push({ ...walkL(IDENTITY, id, 'aisle', rect(a, z0, c, B.z1)), dir });
  p.walk.push({ id: 'XE-cut', kind: 'aisle', poly: [[B.x1 - 6, B.z0 + CHAMFER - 6], [B.x1, B.z0 + CHAMFER], [B.x1 - 6, B.z0 + CHAMFER]], outdoor: false });
  for (const b of blocks.filter((k) => k.lift)) p.walk.push(walkL(b.F, `${b.id}-lobby`, 'lobby', rect(b.h - 2, b.w - 12, b.h + GAL, b.w + GAL)));
  const segs = [['G', B.x0 + 6, -143], ['H', -137, B.x1 - 6]];
  const rows = [];
  for (const [zone, u0, u1] of segs) {
    rows.push({ id: `${zone}-w0`, u0, u1, v0: B.z0, v1: aisleZ[0], face: 'S', zone });
    for (let k = 0; k < aisleZ.length - 1; k++) {
      const a = aisleZ[k] + 6, c = aisleZ[k + 1];
      rows.push({ id: `${zone}-${k}n`, u0, u1, v0: a, v1: (a + c) / 2, face: 'N', zone });
      rows.push({ id: `${zone}-${k}s`, u0, u1, v0: (a + c) / 2, v1: c, face: 'S', zone });
    }
    rows.push({ id: `${zone}-w1`, u0, u1, v0: aisleZ[aisleZ.length - 1] + 6, v1: B.z1, face: 'N', zone });
  }
  for (const [i, r] of innerLanes.entries()) {
    // 端部6m车道接东西向支路，两层同时保留坡道落脚净空。
    p.walk.push(walkL(IDENTITY, `ramp-reserve-${i}`, 'aisle', rect(r.x0 - 2, r.z0, r.x1 + 2, r.z1)));
  }
  p.walk.push(walkL(IDENTITY, 'ramp-west-cross', 'aisle', rect(-223, 125, -217, 147)));
  p.walk.push(walkL(IDENTITY, 'ramp-east-cross', 'aisle', rect(-187, 125, -181, 147)));
  const blocked = [...p.walk.map((w) => w.poly), ...p.rooms.flatMap((m) => m.rects.map((r) => lrectPoly(m.frame, r))), CORNER_CUT];
  const stalls = [];
  const columns = [];
  for (const zone of ['G', 'H']) {
    const res = fillRows(IDENTITY, rows.filter((r) => r.zone === zone), blocked, zone);
    stalls.push(...res.stalls);
    columns.push(...res.columns);
  }
  markSpecial(stalls, elevators.map((e) => [e.x, e.z]), 'G-w0');
  p.parking = { stalls, columns, aisles: p.walk.filter((w) => w.kind === 'aisle').map((w) => w.poly) };
  }

  // ---------- 坡道（西侧直坡道接西外环） ----------
  const ramp = (id, type, name, lane, from, to) => ({ id: `${bid}-${id}`, building: bid, type, name, width: 5, frame: IDENTITY, lane, poly: rectPoly(lane), from, to });
  const ramps = [
    ramp('IN', 'street-in', '车库入口', rect(-267, 105.5, -236, 110.5), { x: -267, z: 108, y: 0, level: 'street' }, { x: -236, z: 108, y: -4.5, level: p.id }),
    ramp('OUT', 'street-out', '车库出口', rect(-267, 99.5, -236, 104.5), { x: -236, z: 102, y: -4.5, level: p.id }, { x: -267, z: 102, y: 0, level: 'street' }),
    ramp('SOUTH-IN', 'street-in', '西南车库入口', rect(-276, 174.5, -236, 179.5), { x: -276, z: 177, y: 0, level: 'street' }, { x: -236, z: 177, y: -4.5, level: p.id }),
    ramp('SOUTH-OUT', 'street-out', '西南车库出口', rect(-276, 167.5, -236, 172.5), { x: -236, z: 170, y: -4.5, level: p.id }, { x: -276, z: 170, y: 0, level: 'street' }),
    { ...ramp('B1-B2-DOWN', 'down', 'B1 至 B2 下行', innerLanes[0], { x: -220, z: 133, y: -4.5, level: p.id }, { x: -184, z: 133, y: -9, level: by.B2.id }), width: 6 },
    { ...ramp('B2-B1-UP', 'up', 'B2 至 B1 上行', innerLanes[1], { x: -184, z: 141, y: -9, level: by.B2.id }, { x: -220, z: 141, y: -4.5, level: p.id }), width: 6 },
  ];
  addDriveway(site, rectPoly(rect(-289, 165, -272, 182)));
  addTrench(site, rectPoly(rect(-274, 167, -239, 173)));
  addTrench(site, rectPoly(rect(-274, 174, -239, 180)));
  addDriveway(site, rectPoly(rect(-288, 97, -265, 113)));
  addTrench(site, rectPoly(rect(-265, 99, -246, 111)));
  site.walk.push({ id: 'P3-plaza', kind: 'plaza', poly: district, outdoor: true });

  // 连续后街外廊在梯井之外，避免横桥穿过楼梯洞口。
  for (const lv of [by['2F'], by['3F']])
    lv.walk.push(walkL(IDENTITY, 'heritage-link-promenade', 'gallery', rect(-234.5, 242.5, -33, 246), true));
  const access = buildStreetAccess(blocks, by);

  // ---------- 楼板与编号 ----------
  for (const lv of levels) {
    if (lv.kind === 'parking' || lv.short === '1F') lv.slab = { pieces: [{ outer: lv.outline, holes: [] }] };
    else lv.slab = { pieces: [
      ...blocks.map((b) => ({ outer: lpoly(b.F, b.deck), holes: [], block: b.n })),
      ...lv.walk.filter(w => w.id.startsWith('heritage-link-')).map(w => ({ outer: w.poly, holes: [] })),
    ] };
    for (const b of blocks) {
      const under = lv.short === 'B2' ? false : lv.short === 'B1' || lv.short === '1F' ? b.lift : true;
      if (!under) continue;
      const poly = lrectPoly(b.F, b.stairShaft);
      lv.voids.push({ id: `${lv.id}-${b.id}-stair-opening`, kind: 'stair', stair: `P3-${b.id}-ST`, poly });
      const plate = lv.slab.pieces.find(s => s.block === b.n) || lv.slab.pieces[0];
      plate.holes.push(poly);
    }
    if (lv.short === 'B1') for (const [i, r] of innerLanes.entries()) {
      const hole = rectPoly(rect(r.x0 + .5, r.z0, r.x1 - .5, r.z1));
      lv.voids.push({ id: `P3-layer-ramp-${i}`, kind: 'ramp', poly: hole });
      lv.slab.pieces[0].holes.push(hole);
    }
    for (const u of lv.units) {
      u.polys = u.rects.map((r) => lrectPoly(u.frame, r));
      u.wfronts = u.fronts.map((f) => lseg(u.frame, f));
      u.brand.catLabel = (CATEGORIES[u.brand.cat] || {}).label || u.brand.cat;
    }
    for (const m of lv.rooms) {
      m.polys = m.rects.map((r) => lrectPoly(m.frame, r));
      m.wdoors = m.doors.map((d) => lseg(m.frame, d));
    }
    lv.units.forEach((u, i) => { u.code = `C${lv.short}-${String(i + 1).padStart(2, '0')}`; });
  }
  for (const s of stairs) {
    s.poly = lrectPoly(s.frame, s.rect);
    s.wdoor = lseg(s.frame, s.door);
    s.wdoorByLevel = {};
  }

  const bb = polyBounds(district);
  const center = [(bb.x0 + bb.x1) / 2, (bb.z0 + bb.z1) / 2];
  const building = {
    id: bid, code: 'C', name: '三期 · 云澜里', short: '三期', en: 'YUNLAN LANE', kind: 'street', levels: levels.map((l) => l.id),
    outline: district, center, radius: Math.max(...district.map(([x, z]) => Math.hypot(x - center[0], z - center[1]))), plot: rect(-286, 20, -16, 256),
    rotundas: [], wings: [], access,
    blocks: blocks.map(({ n, id, name, x, z, L, W, deg, floors, F, h, w, skin, heritage, lift: hasLift, wc, bar, top, foot, poly, deck, gallery, stairRect, stairDoor, stairShaft, stairLanding, shaft }) => ({
      n, id, name, x, z, L, W, deg, floors, F, h, w, skin, heritage, lift: hasLift, wc, bar, top, foot, poly, deck: lpoly(F, deck), ldeck: deck, gallery, stairRect, stairDoor, stairShaft, stairLanding, shaft,
    })),
    kiosks: KIOSKS.map((k) => ({ ...k, poly: rectPoly(k.r) })),
  };
  for (const lv of levels) delete lv.cfg;
  // 地铁三期通道口：切面中段 8m，外法线指向路口
  const PF = frame(0, 0, 135, 'P3-metro');
  const [x0, z0] = toW(PF, PORTAL_U, -4);
  const [x1, z1] = toW(PF, PORTAL_U, 4);
  const [nx, nz] = dirW(PF, -1, 0);
  const entrances = [{ id: `${bid}-MT`, building: bid, name: '地铁通道口', level: p.id, seg: { x0, z0, x1, z1 }, nx, nz, width: 8, main: false, to: 'M-B1', square: false }];
  return { building, levels, escalators: [], elevators, stairs, entrances, ramps };
}

/** 1F 室外：中心广场（舞台 + 旱喷水景）、梧桐小广场、沿街行道树与巷内散植乔木 */
function streetFeatures(lv, blocks) {
  const plaza = { x: -151, z: 95, r: 15 };
  lv.features.push({ type: 'plaza', x: plaza.x, z: plaza.z, r: plaza.r, name: '云澜里中心广场', en: 'LIVE STAGE · FOUNTAIN' });
  lv.features.push({ type: 'fountain', x: -155, z: 99, r: 5.5 });
  lv.features.push({ type: 'stage', x: -141, z: 89, w: 10, d: 6, deg: 146 });
  lv.features.push({ type: 'heritage-market', rect: rect(-235, 205, -31, 221), clearLane: rect(-238, 211, -28, 217), name: '云澜旧巷 · 手作集市' });
  for (let i = 0; i < 12; i++) lv.features.push({ type: 'market-stall', x: -228 + i * 16, z: i % 2 ? 207 : 219, variant: i % 4, w: 5.2, d: 2.8 });
  lv.features.push({ type: 'grove', x: -88, z: 134, r: 12, name: '梧桐小广场' });
  const obstacles = [...blocks.map((b) => b.poly), ...KIOSKS.map((k) => rectPoly(k.r))];
  const clear = (p) => !obstacles.some((o) => pointInPoly(p, o)) && Math.min(...obstacles.map((o) => distToPolyEdge(p, o))) >= 4;
  const keepOut = [[plaza.x, plaza.z, plaza.r + 2], [-40, 40, 22], [-24, 24, 6]];
  const free = (p) => clear(p) && keepOut.every(([x, z, r]) => dist(p, [x, z]) > r);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const trees = [];
  for (let x = -236; x <= -70; x += 10) if (free([x, 27])) trees.push([x, 27, 1.1]);
  for (let x = -236; x <= -40; x += 12) {
    for (let z = 40; z <= 198; z += 12) {
      const p = [x + (rand() - 0.5) * 6, z + (rand() - 0.5) * 6];
      if (free(p) && trees.every((t) => dist(t, p) > 7)) trees.push([p[0], p[1], 0.85 + rand() * 0.4]);
    }
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    trees.push([-88 + Math.cos(a) * 9, 134 + Math.sin(a) * 9, 1.2]);
  }
  for (const [x, z, sc] of trees) lv.features.push({ type: 'tree', x, z, scale: sc });
}

/** 连续双跑楼梯：布局是踏步渲染和导航的唯一坐标来源。 */
function buildStreetAccess(blocks, by) {
  const access = { surfaces: [], flights: [], routes: [] };
  for (const b of blocks) {
    const levels = b.lift ? [by.B2, by.B1, by['1F'], by['2F'], by['3F']] : [by['1F'], by['2F'], by['3F']];
    const u0 = b.h + GAL, vLow = b.w - 4.8, vMid = b.w + .7;
    const world = (u, v, y, floor) => { const [x,z] = toW(b.F, u, v); return {x,y,z,floor}; };
    for (let i = 0; i < levels.length - 1; i++) {
      const lo = levels[i], hi = levels[i+1], mid = (lo.elev + hi.elev) / 2;
      const id = `P3-${b.id}-${lo.short}-${hi.short}`, landing = `${id}-landing`;
      access.surfaces.push({ id: landing, parentFloor: lo.id, building: 'P3', elev: mid,
        poly: lrectPoly(b.F, rect(u0 + .1, vMid, u0 + BAY - .1, b.w + GAL - .1)) });
      access.flights.push(
        { id: `${id}-flight-1`, from: lo.id, to: landing, bottom: world(u0+1.05,vLow,lo.elev,lo.id), top: world(u0+1.05,vMid,mid,landing), width: 1.8 },
        { id: `${id}-flight-2`, from: landing, to: hi.id, bottom: world(u0+2.95,vMid,mid,landing), top: world(u0+2.95,vLow,hi.elev,hi.id), width: 1.8 },
      );
      access.routes.push({ id, block: b.n, from: lo.id, to: hi.id, landing, waypoints: [
        world(u0-.8,vLow-1,lo.elev,lo.id), world(u0+1.05,vLow-1,lo.elev,lo.id),
        world(u0+1.05,vMid+.9,mid,landing), world(u0+2.95,vMid+.9,mid,landing),
        world(u0+2.95,vLow-1,hi.elev,hi.id), world(u0-.8,vLow-1,hi.elev,hi.id),
      ] });
    }
  }
  return access;
}
