// 云澜·北苑 T1/T2 塔楼记录：一梯一户，7F 空中大堂（与商场天台同层，朝两塔之间的一翼对天台开门，
// 刷卡闸机后的候梯厅直通核心筒）与住户会所、8F–13F 大平层、14F–24F 错层复式与 RF 屋顶花园。
// 塔楼不拥有 34 m 以下楼层：三部电梯（两部私家梯 + 消防梯）与两部疏散楼梯穿过一期宿主楼层。
// 坐标：塔楼局部坐标系 frame(cx, −232, 0)，核心筒 rect(−4,−8,4,8)；户型局部坐标见 community-units.js。
import { frame, rect, rectPoly, lrectPoly, lseg, toW, polyBounds } from './geom.js';
import { lift } from './mall.js';
import { towerStairPlan, buildTowerStairAccess } from './tower-stairs.js';
import { NORTH_SITE } from './community-sites.js';
import { COMMUNITY_PLANS } from './community-plan-data.js';
import { communityUnit, COMMUNITY_ACCENT } from './community-units.js';

const r2 = (v) => Math.round(v * 1000) / 1000;
const rectOf = (P) => { const b = polyBounds(P); return rect(r2(b.x0), r2(b.z0), r2(b.x1), r2(b.z1)); };
const inRect = (o, i, e = 1e-6) => i.x0 >= o.x0 - e && i.x1 <= o.x1 + e && i.z0 >= o.z0 - e && i.z1 <= o.z1 + e;

/** Core column, tower-local. Lifts on the north band (doors S), landing band, scissor stair pair (doors N). */
export const NORTH_CORE = Object.freeze({
  rect: rect(-4, -8, 4, 8),
  band: rect(-4, -4.8, 4, -1.6),
  lifts: [
    { key: 'LW', u: -2.7, w: 2.4, role: 'private-w', label: '北苑住户电梯 W' },
    { key: 'LF', u: 0, w: 2.6, role: 'fire', label: '北苑消防电梯' },
    { key: 'LE', u: 2.7, w: 2.4, role: 'private-e', label: '北苑住户电梯 E' },
  ].map(Object.freeze),
  liftV: -6.3, liftD: 3.0,
  landings: { W: rect(-4, -4.8, -1.4, -1.6), F: rect(-1.4, -4.8, 1.4, -1.6), E: rect(1.4, -4.8, 4, -1.6) },
  stairs: [
    { key: 'A', rect: rect(-4, -1.6, -0.2, 8), door: { x0: -1.35, z0: -1.6, x1: -0.25, z1: -1.6, side: 'N' } },
    { key: 'B', rect: rect(0.2, -1.6, 4, 8), door: { x0: 0.25, z0: -1.6, x1: 1.35, z1: -1.6, side: 'N' } },
  ].map(Object.freeze),
  // Solid strips of the column that are neither shaft, landing nor stair.
  fillers: [rect(-4, -8, 4, -7.8), rect(-4, -7.8, -3.9, -4.8), rect(-1.5, -7.8, -1.3, -4.8), rect(1.3, -7.8, 1.5, -4.8),
    rect(3.9, -7.8, 4, -4.8), rect(-0.2, -1.6, 0.2, 8)],
});

const liftRect = (e) => rect(e.lu - e.w / 2, e.lv - e.d / 2, e.lu + e.w / 2, e.lv + e.d / 2);
const inner = (r, t = 0.1) => rect(r.x0 + t, r.z0 + t, r.x1 - t, r.z1 - t);
/** Four 0.1 m wall strips round a shaft; the cabin hole is the inner rect. */
export const ringRects = (r, t = 0.1) => { const i = inner(r, t); return [rect(r.x0, r.z0, r.x1, i.z0), rect(r.x0, i.z1, r.x1, r.z1), rect(r.x0, i.z0, i.x0, i.z1), rect(i.x1, i.z0, r.x1, i.z1)]; };
export const coreRoom = (id, type, F, rects, doors = [], extra = {}) => ({ id, type, label: '', frame: F, rects, polys: rects.map((r) => lrectPoly(F, r)),
  doors, wdoors: doors.map((d) => lseg(F, d)), ...extra });
const localWalk = (F, id, kind, r, extra = {}) => ({ id, kind, frame: F, rect: r, poly: lrectPoly(F, r), ...extra });

/** Stop lists: private W lift for the W entry floors, private E lift for the E entry floors, fire lift everywhere. */
export function northStops(id) {
  const n = (k) => `${id}-${k}F`, hosts = [...NORTH_SITE.hostDoorLevels];
  const flats = [7, 8, 9, 10, 11, 12, 13, 14].map(n);
  return {
    LW: [...hosts, ...flats, ...[16, 18, 20, 22, 24].map(n), `${id}-RF`],
    LE: [...hosts, ...flats, ...[15, 17, 19, 21, 23].map(n), `${id}-RF`],
    LF: [...hosts, ...NORTH_SITE.levels.map((l) => `${id}-${l.short}`)],
  };
}

const LEVEL_NAME = { club: '空中大堂', roof: '屋顶花园' };
const levelName = (d, duplex) => d.kind === 'club' ? `7F ${LEVEL_NAME.club}` : d.kind === 'roof' ? `RF ${LEVEL_NAME.roof}`
  : `${d.short} ${duplex ? '错层复式' : '江景大平层'}`;
// The floor rail shows the first part of the label: 空中大堂 / 江景大平层 / 错层复式 / 住户屋顶花园.
const levelLabel = (d) => d.kind === 'club' ? '空中大堂 · 刷卡乘梯 · 住户会所' : d.kind === 'roof' ? '住户屋顶花园 · 电梯直达'
  : d.levelNumber < 14 ? '江景大平层 · 一梯一户 · 三房以上' : '错层复式 · 一梯一户 · 上下两层';

/**
 * 7F 空中大堂（商场天台进出）。坐标用“朝缝”局部 u：塔楼局部 x = s·u，s = +1（T1 东翼）/ −1（T2 西翼），
 * u ∈ [4, X1]（X1 = 翼外沿）；z 为塔楼局部 z（北 −8 … 南 +8）。
 */
export const SKY_LOBBY = Object.freeze({
  gateU: 8.4, gateZ: Object.freeze([-4.95, -1.45]),   // 3.5 m 速通闸机，居中于候梯带 z −3.2
  split: -0.5,                                        // 候梯厅 / 江景休息区 | 大堂前厅
  doorS: 3.0,                                         // 南门宽，居翼中
  doorGap: Object.freeze([4.6, 7.0]),                 // 朝缝侧门 z 段（屋面在 z ≥ −228 才有楼板）
  reader: Object.freeze({ u: 1.75, v: -1.2 }),
});

/**
 * One residents' club wing, tower-local: the wing away from the gap keeps its two rooms
 * (W: 江景会客厅 + 住户阅览室, E: 住户私宴厅 + 健身房). Zones, furniture, the plaster
 * partition between the river room and the south room (1.8 m door) and the walk.
 */
function clubWing(side, wx0, ex1) {
  const W = side === 'W', a = W ? wx0 : 4, b = W ? -4 : ex1, m = (a + b) / 2;
  const ob = (id, type, r, height, extra = {}) => ({ id, type, rect: r, height, ...extra });
  if (W) return {
    zones: [['lounge', 'lounge', '江景会客厅', rect(a, -8, b, -0.5)], ['library', 'library', '住户阅览室', rect(a, -0.5, b, 8)]],
    obstacles: [
      ob('lounge-sofa-north', 'sofa', rect(m - 2, -7.2, m + 2, -6.4), .85), ob('lounge-table', 'table', rect(m - 1, -5.3, m + 1, -4.5), .45),
      ob('lounge-sofa-south', 'sofa', rect(m - 2, -3.4, m + 2, -2.6), .85),
      ob('library-shelf', 'bookcase', rect(a + .2, 1.5, a + .6, 7.5), 2.2, { facing: 'E' }), ob('library-table', 'table', rect(m - 1.2, 3.4, m + 1.2, 4.6), .76),
      ob('library-table-2', 'table', rect(m + 2.4, 3.6, m + 3.6, 4.4), .76),
      ...[-.6, .6].flatMap((dx, i) => [ob(`library-chair-${i}`, 'chair', rect(m + dx - .25, 2.7, m + dx + .25, 3.2), .9),
        ob(`library-chair-${i}-south`, 'chair', rect(m + dx - .25, 4.8, m + dx + .25, 5.3), .9, { facing: 'N' })]),
    ],
    partition: { a: [a, -0.5], b: [b, -0.5], door: { at: (b - a) - 2.4, width: 1.8 } },
    circulation: rect(a, -8, b, 8),
  };
  return {
    zones: [['dining', 'dining', '住户私宴厅', rect(a, -8, b, -0.5)], ['gym', 'gym', '健身房', rect(a, -0.5, b, 8)]],
    obstacles: [
      ob('dining-table', 'table', rect(m - 2, -5.2, m + 2, -3.8), .76), ob('dining-sideboard', 'cabinet', rect(b - .6, -7, b - .2, -2), 1.0),
      ...[-.9, .9].flatMap((dx, i) => [ob(`dining-chair-${i}`, 'chair', rect(m + dx - .25, -5.85, m + dx + .25, -5.35), .9),
        ob(`dining-chair-${i}-south`, 'chair', rect(m + dx - .25, -3.65, m + dx + .25, -3.15), .9, { facing: 'N' })]),
      ...[-1.6, 0, 1.6].map((dx, i) => ob(`gym-treadmill-${i}`, 'treadmill', rect(m + dx - .4, 5.6, m + dx + .4, 7.4), 1.4)),
    ],
    partition: { a: [a, -0.5], b: [b, -0.5], door: { at: 2.4, width: 1.8 } },
    circulation: rect(a, -8, b, 8),
  };
}

/**
 * The 7F plan (tower-local): the residents' club wing away from the gap, and the 空中大堂 wing
 * facing it — arrival hall with the reception desk (south), river lounge (north-east of the gates),
 * and behind the 3-lane speed-gate bank the residents' lift hall, open to the core landing band.
 * Gate-line glass N and S of the bank and the reception backdrop wall close the lift hall.
 */
function clubPlan(F, wx0, ex1, side) {
  const s = side === 'E' ? 1 : -1, X1 = s > 0 ? ex1 : -wx0, L = SKY_LOBBY;
  const R = (u0, z0, u1, z1) => rect(Math.min(s * u0, s * u1), z0, Math.max(s * u0, s * u1), z1);
  const P = (u, z) => [s * u, z];
  const club = clubWing(s > 0 ? 'W' : 'E', wx0, ex1);
  const wm = (4 + X1) / 2, wm2 = (L.gateU + X1) / 2, uc = X1 - 3.0;
  const ob = (id, type, r, height, extra = {}) => ({ id, type, rect: r, height, skyLobby: true, ...extra });
  const zones = [
    ...club.zones.map(([id, kind, name, r]) => ({ id, kind, name, rect: r })),
    { id: 'sky-lift-hall', kind: 'lift-hall', name: '住户候梯厅', rect: R(4, -8, L.gateU, L.split) },
    { id: 'sky-river-lounge', kind: 'lounge', name: '江景休息区', rect: R(L.gateU, -8, X1, L.split) },
    { id: 'sky-hall', kind: 'lobby', name: '空中大堂', rect: R(4, L.split, X1, 8) },
  ];
  const obstacles = [
    ...club.obstacles,
    ob('reception-desk', 'desk', R(5.0, 1.2, 8.0, 2.0), 1.05),
    ob('sky-sofa', 'sofa', R(uc - 1.5, 1.2, uc + 1.5, 2.0), .85),
    ob('sky-table', 'table', R(uc - .7, 2.6, uc + .7, 3.2), .45),
    ...[-.8, .8].map((dx, i) => ob(`sky-chair-${i}`, 'chair', R(uc + dx - .25, 3.8, uc + dx + .25, 4.3), .9, { facing: 'N' })),
    ob('sky-river-table', 'table', R(wm2 - 1.2, -6.6, wm2 + 1.2, -6.0), .45),
    ...[-2.1, -.7, .7, 2.1].map((dx, i) => ob(`sky-river-chair-${i}`, 'chair', R(wm2 + dx - .25, -5.4, wm2 + dx + .25, -4.9), .9, { facing: 'N' })),
    ...[R(X1 - 1.0, 0, X1 - .2, .8), R(4.2, 7.0, 5.0, 7.8), R(X1 - 1.0, -7.8, X1 - .2, -7.0)]
      .map((r, i) => ob(`sky-planter-${i}`, 'planter', r, .9)),
  ];
  const partitions = [
    club.partition,
    { a: P(L.gateU, -8), b: P(L.gateU, L.gateZ[0]), role: 'glass', skyLobby: true },
    { a: P(L.gateU, L.gateZ[1]), b: P(L.gateU, L.split), role: 'glass', skyLobby: true },
    { a: P(4, L.split), b: P(L.gateU, L.split), skyLobby: true },
  ];
  // gateLine: the whole gate line (glass N, gate bank, glass S), sealed to the ceiling by a glass transom.
  return { kind: 'community-club', frame: F, zones, obstacles, partitions, height: 5.0, side, sign: s,
    circulation: [club.circulation, R(4, -8, L.gateU, L.split), R(L.gateU, -8, X1, L.split), R(4, L.split, X1, 8)],
    circulationIds: ['club-0', 'sky-lift-hall', 'sky-river-lounge', 'sky-hall'],
    signSpot: { x: s * 6.5, z: L.split + .09, side: 'S' }, gateLine: { a: P(L.gateU, -8), b: P(L.gateU, L.split) }, wm, X1 };
}

/** Unit-local rect → tower-local rect (both frames are multiples of 90°). */
const toTower = (TF, UF, r) => rectOf(lrectPoly(UF, r).map(([x, z]) => [x - TF.ox, z - TF.oz]));

/**
 * World records of the 7F sky lobby: lv.skyLobby (HUD rects, gate frame shared by layout and render)
 * and the two doors onto P1-RF — S onto the roof garden, GAP onto the 空中大堂前庭 — as same-height
 * entrance portals (level Tn-7F → P1-RF, like the P1C-3F ⇄ P1-3F 江景台 door).
 */
function skyLobbyRecords(id, n, F, lv, plan) {
  const s = plan.sign, X1 = plan.X1, L = SKY_LOBBY, W = (r) => rectOf(lrectPoly(F, r));
  const zone = (zid) => W(plan.zones.find((z) => z.id === zid).rect);
  const club = plan.zones.filter((z) => !z.id.startsWith('sky-')).map((z) => W(z.rect));
  const name = `云澜·北苑 ${n} 号楼 · 空中大堂`;
  const doorS = { x0: r2(F.ox + Math.min(s * (plan.wm - L.doorS / 2), s * (plan.wm + L.doorS / 2))), z0: r2(F.oz + 8),
    x1: r2(F.ox + Math.max(s * (plan.wm - L.doorS / 2), s * (plan.wm + L.doorS / 2))), z1: r2(F.oz + 8) };
  const gx = r2(F.ox + s * X1), doorG = { x0: gx, z0: r2(F.oz + L.doorGap[0]), x1: gx, z1: r2(F.oz + L.doorGap[1]) };
  const ent = (key, seg, nx, nz) => ({ id: `${id}-SKY-${key}`, building: id, level: lv.id, to: 'P1-RF', name, seg, nx, nz,
    width: r2(Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0)), main: false, skyLobby: key, residentialCore: id });
  const entrances = [ent('S', doorS, 0, 1), ent('GAP', doorG, s, 0)];
  lv.skyLobby = { building: id, name, liftHall: zone('sky-lift-hall'), publicRects: [zone('sky-river-lounge'), zone('sky-hall')], clubRects: club,
    doors: entrances.map((e) => e.id), gate: `${id}-7F-GATE`,
    gateFrame: [r2(F.ox + s * L.gateU), r2(F.oz + (s > 0 ? L.gateZ[0] : L.gateZ[1])), s > 0 ? 90 : -90] };
  return { entrances };
}

/**
 * Tower record set for 北苑 T1/T2 from NORTH_SITE + COMMUNITY_PLANS.north.
 * hostLevels: the P1 level records the core rises through (B2…6F), for the stair access.
 */
export function northTower(site, hostLevels) {
  const { id } = site, n = id.slice(1), accent = COMMUNITY_ACCENT.north;
  const F = frame(site.frame[0], site.frame[1], 0, id);
  const [px0, px1] = site.plate, half = (px1 - px0) / 2;
  const footprint = rect(-half, -8, half, 8), outline = lrectPoly(F, footprint);
  const wx0 = px0 - site.frame[0], ex1 = px1 - site.frame[0];
  const data = COMMUNITY_PLANS.north[id];
  const name = `云澜·北苑 ${n} 号楼`, en = `YUNLAN NORTH RESIDENCE ${n}`;
  const stops = northStops(id);
  const C = NORTH_CORE;

  // ---------- levels ----------
  const defs = NORTH_SITE.levels;
  const homesOn = (num) => data.homes.flatMap((h) => h.levels.includes(num) ? [{ h, i: h.levels.indexOf(num) }] : []);
  const levels = defs.map((d) => {
    const duplex = d.levelNumber >= 14 && homesOn(d.levelNumber).some(({ h }) => h.kind === 'duplex');
    return {
      id: `${id}-${d.short}`, building: id, short: d.short, ...(d.levelNumber ? { levelNumber: d.levelNumber } : {}),
      name: levelName(d, duplex), kind: d.kind, elev: d.elev, height: d.height,
      theme: { key: 'lux', floor: d.kind === 'roof' ? 'terrace-stone' : 'terrazzo', accent, label: levelLabel(d) },
      outline, units: [], rooms: [], walk: [], voids: [], features: [], slab: { pieces: [] },
    };
  });
  const ownIds = levels.map((l) => l.id), byId = Object.fromEntries(levels.map((l) => [l.id, l]));
  const hostIds = hostLevels.map((l) => l.id);
  const doorLevels = [...NORTH_SITE.hostDoorLevels, ...ownIds];

  // ---------- stairs and lifts ----------
  const stairs = C.stairs.map((s) => {
    const st = { id: `${id}-ST-${s.key}`, building: id, residentialCore: id, label: '北苑住宅疏散楼梯', frame: F, rect: s.rect, poly: lrectPoly(F, s.rect),
      door: { ...s.door }, wdoor: lseg(F, s.door), wdoorByLevel: {}, serves: doorLevels, passLevels: [...NORTH_SITE.hostPassLevels] };
    const plan = towerStairPlan(st);
    return Object.assign(st, { continuous: true, shaftRect: plan.shaftRect, landingRect: plan.landingRect });
  });
  const shaftLevels = [...hostIds, ...ownIds];
  const elevators = C.lifts.map((l) => ({
    ...lift(`${id}-${l.key}`, id, 'passenger', F, l.u, C.liftV, l.w, C.liftD, 'S', stops[l.key]),
    tower: true, residentialCore: id, label: l.label, role: l.role, shaftLevels,
    ...(l.role === 'fire' ? { fire: true, stretcher: true } : {}),
  }));
  const stopsAt = (key, lvId) => stops[key].includes(lvId);

  // ---------- homes ----------
  const homes = [];
  const UF = { W: frame(site.core[0], -240, 90, `${id}-W`), E: frame(site.core[1], -224, -90, `${id}-E`) };
  for (const h of data.homes) {
    const parts = h.parts.map((p, i) => ({ p, lv: byId[`${id}-${h.levels[i]}F`] }));
    const homeLevels = parts.map(({ lv }) => lv.id);
    const side = h.side, duplex = h.kind === 'duplex';
    const tag = duplex ? `${h.levels[0]}${h.levels[1]}${side}` : `${String(h.levels[0]).padStart(2, '0')}${side}`;
    const area = Math.round(h.parts.reduce((s, q) => s + q.plan.area, 0));
    const label = h.parts[0].plan.label;
    const units = parts.map(({ p, lv }, i) => {
      const upper = p.plan.level === 'upper', part = !duplex ? '' : upper ? 'U' : 'L';
      const code = duplex ? `${id}-${tag}-${part}` : `${id}-${tag}`;
      const title = duplex ? `${h.levels[0]}–${h.levels[1]}${side} 复式 · ${upper ? '上层' : '下层'}`
        : h.kind === 'penthouse-flat' ? `${tag} 顶层大平层` : `${tag} 大平层`;
      const enTitle = duplex ? `${tag} ${upper ? 'UPPER' : 'LOWER'}` : h.kind === 'penthouse-flat' ? `${tag} PENTHOUSE` : tag;
      return communityUnit({ lv, building: id, community: 'north', id: `${lv.id}-${side}`, code, slot: side, frame: UF[side], plan: p.plan,
        name: `${name} ${title}`, en: `${en} · ${enTitle}`, catLabel: `${label}${duplex ? '复式' : ''} · ${area}㎡`, accent,
        home: h.id, homeLevels, ...(duplex ? { partner: `${parts[1 - i].lv.id}-${side}` } : {}), ...(upper ? { fronts: [] } : {}) });
    });
    units.forEach((u, i) => parts[i].lv.units.push(u));
    homes.push({ id: h.id, kind: h.kind, side, levels: homeLevels, units: units.map((u) => u.id) });
  }

  // ---------- per-level plate, core, voids and walks ----------
  let skyLobby = null;
  for (const lv of levels) {
    for (const s of stairs) {
      const poly = lrectPoly(F, s.shaftRect);
      lv.voids.push({ id: `${s.id}-${lv.short}-shaft`, kind: 'stair', frame: F, rect: s.shaftRect, poly, stair: s.id, residentialCore: id });
    }
    for (const e of elevators) {
      const r = inner(liftRect(e));
      lv.voids.push({ id: `${e.id}-ride-shaft-${lv.id}`, kind: 'shaft', elevator: e.id, frame: F, rect: r, poly: lrectPoly(F, r) });
    }
    for (const u of lv.units) {
      const r = u.residence;
      if (r.level !== 'upper') continue;
      const hole = toTower(F, u.frame, r.homeStair.upperHole);
      lv.voids.push({ id: `${u.id}-home-stair`, kind: 'home-stair', unit: u.id, frame: F, rect: hole, poly: lrectPoly(F, hole) });
      for (const [i, v] of (r.voids || []).entries()) {
        const vr = toTower(F, u.frame, v);
        lv.voids.push({ id: `${u.id}-home-void-${i}`, kind: 'home-void', unit: u.id, frame: F, rect: vr, poly: lrectPoly(F, vr) });
      }
    }
    // Plate minus voids: every opening, the façade-side 挑空 included, is a hole of the plate.
    lv.slab.pieces = [{ outer: outline, holes: lv.voids.map((v) => v.poly), localRect: footprint }];
    for (const v of lv.voids) if (!inRect(footprint, v.rect)) throw new Error(`${lv.id}: ${v.id} outside the plate`);
    // Core rooms: the two stairs and the solid column (shaft rings, fillers, closed landings).
    const open = { W: stopsAt('LW', lv.id), F: true, E: stopsAt('LE', lv.id) };
    for (const s of stairs) lv.rooms.push(coreRoom(s.id, 'stair', F, [s.rect], [s.door], { label: '北苑住宅疏散楼梯', continuous: true,
      shaftRect: s.shaftRect, landingRect: s.landingRect, residentialCore: id }));
    const closed = ['W', 'E'].filter((k) => !open[k]).map((k) => C.landings[k]);
    // Pick card: the generic core card ('客梯 · 2 台客梯 · 全楼直达') is wrong for a 一梯一户 core.
    lv.rooms.push(coreRoom(`${id}-core`, 'core', F, [...elevators.flatMap((e) => ringRects(liftRect(e))), ...C.fillers, ...closed], [],
      { label: '北苑核心筒', residentialCore: id,
        pickInfo: ['云澜·北苑住户核心筒', lv.kind === 'club' ? '住户电梯 W / E · 消防电梯 · 闸机内刷卡乘梯' : '住户电梯 W / E · 消防电梯 · 一梯一户'] }));
    lv.walk.push(localWalk(F, `${id}-fire-lobby`, 'lobby', C.landings.F));
    if (open.W) lv.walk.push(localWalk(F, `${id}-landing-W`, 'lobby', C.landings.W));
    if (open.E) lv.walk.push(localWalk(F, `${id}-landing-E`, 'lobby', C.landings.E));
    // Private landing ↔ fire lobby: 0.9 m fire door in the partition.
    lv.navWalls = [];
    for (const [k, x] of [['W', -1.4], ['E', 1.4]]) if (open[k]) for (const [z0, z1] of [[-4.8, -3.65], [-2.75, -1.6]]) {
      const [ax, az] = toW(F, x, z0), [bx, bz] = toW(F, x, z1);
      lv.navWalls.push({ x0: ax, z0: az, x1: bx, z1: bz, residentialCore: id });
    }
    lv.corePlan = { kind: 'community', frame: F, core: C.rect,
      landings: [['W', `${id}-landing-W`], ['F', `${id}-fire-lobby`], ['E', `${id}-landing-E`]].map(([k, lid]) => ({ id: lid, rect: C.landings[k], open: open[k] })),
      lifts: elevators.map((e) => ({ id: e.id, rect: liftRect(e), door: e.door, x: e.lu, z: e.lv, role: e.role })),
      stairs: stairs.map((s) => ({ id: s.id, continuous: true, rect: s.rect, door: s.door, shaftRect: s.shaftRect, landingRect: s.landingRect })) };
    if (lv.kind === 'club') {
      lv.lobbyPlan = clubPlan(F, wx0, ex1, site.skyLobby || 'E');
      for (const [i, r] of lv.lobbyPlan.circulation.entries()) lv.walk.push(localWalk(F, `${id}-${lv.lobbyPlan.circulationIds[i]}`, 'lobby', r));
      skyLobby = skyLobbyRecords(id, n, F, lv, lv.lobbyPlan);
    } else if (lv.kind === 'roof') {
      lv.walk.push(localWalk(F, `${id}-roof-garden-W`, 'deck', rect(wx0, -8, -4, 8)), localWalk(F, `${id}-roof-garden-E`, 'deck', rect(4, -8, ex1, 8)));
    }
  }

  // ---------- building, stair access and duplex flights ----------
  const merged = [...hostLevels, ...levels].sort((a, b) => a.elev - b.elev);
  const top = defs.at(-1).elev;
  const b = {
    id, code: id, name, short: `北苑${n}`, en, kind: 'tower', usage: 'community', community: 'north', stackedOn: 'P1', campusGroup: 'P1',
    addition: 'p1-podium', accent, frame: F, footprint, outline, bounds: polyBounds(outline), center: [F.ox, F.oz],
    radius: Math.hypot(px1 - px0, 16) / 2, height: top, storeys: defs.filter((d) => d.levelNumber).length, levels: ownIds,
    entryLevel: 'P1-1F', hostLevels: hostIds, stairLevelIds: merged.map((l) => l.id),
    fireFrontage: [px0, px1], hardstand: { ...site.hardstand }, rotundas: [], wings: [], plot: null,
    massing: { width: px1 - px0, depth: 16, top, podiumHeight: NORTH_SITE.podiumRoof, facadeModule: 3.3 },
    spawn: { floor: 'P1-1F', x: id === 'T1' ? -272 : -220, z: id === 'T1' ? -234 : -232, yaw: 0 },
    homes,
  };
  b.access = buildTowerStairAccess(b, merged, stairs);
  for (const lv of levels) for (const u of lv.units) {
    const r = u.residence;
    if (r.level !== 'lower') continue;
    const upper = byId[r.homeLevels[1]], st = r.homeStair, landing = `${u.id}-home-landing`;
    const at = (q, y, floor) => { const [x, z] = toW(u.frame, ...q); return { x, z, y, floor }; };
    const [A, B] = st.flights, mid = lv.elev + st.landingY;
    const common = { building: id, frame: u.frame, unit: u.id, home: r.home, parentFloor: lv.id, steps: A.steps, rise: st.landingY };
    b.access.surfaces.push({ id: landing, stair: `${u.id}-home-stair`, building: id, parentFloor: lv.id, frame: u.frame, elev: mid,
      rect: st.landing, poly: lrectPoly(u.frame, st.landing), unit: u.id, homeStair: true });
    b.access.flights.push(
      { ...common, id: `${u.id}-stair-A`, kind: 'interior-stair', from: lv.id, to: landing, width: A.width, run: Math.abs(A.top[1] - A.bottom[1]),
        bottom: at(A.bottom, lv.elev, lv.id), top: at(A.top, mid, landing), localBottom: A.bottom, localTop: A.top },
      { ...common, id: `${u.id}-stair-B`, kind: 'interior-stair', from: landing, to: upper.id, width: B.width, run: Math.abs(B.top[1] - B.bottom[1]),
        bottom: at(B.bottom, mid, landing), top: at(B.top, upper.elev, upper.id), localBottom: B.bottom, localTop: B.top });
  }
  return { building: b, levels, stairs, elevators, escalators: [], ramps: [], entrances: skyLobby ? skyLobby.entrances : [] };
}

/** Both 北苑 towers. */
export const northTowers = (hostLevels) => NORTH_SITE.towers.map((t) => northTower(t, hostLevels));
