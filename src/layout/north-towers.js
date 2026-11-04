// 云澜·北苑 T1/T2 塔楼记录：一梯一户，7F 空中会所、8F–13F 大平层、14F–24F 错层复式与 RF 屋顶花园。
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

const LEVEL_NAME = { club: '空中会所', roof: '屋顶花园' };
const levelName = (d, duplex) => d.kind === 'club' ? `7F ${LEVEL_NAME.club}` : d.kind === 'roof' ? `RF ${LEVEL_NAME.roof}`
  : `${d.short} ${duplex ? '错层复式' : '江景大平层'}`;
const levelLabel = (d) => d.kind === 'club' ? '住户会客厅 · 私宴厅 · 阅览室 · 健身房' : d.kind === 'roof' ? '住户屋顶花园 · 电梯直达'
  : d.levelNumber < 14 ? '一梯一户 · 三房以上大平层' : '一梯一户 · 上下错层复式';

/** The 7F residents' club over both wings (tower-local). */
function clubPlan(F, wx0, ex1) {
  const z = [
    ['lounge', 'lounge', '江景会客厅', rect(wx0, -8, -4, -0.5)], ['library', 'library', '住户阅览室', rect(wx0, -0.5, -4, 8)],
    ['dining', 'dining', '住户私宴厅', rect(4, -8, ex1, -0.5)], ['gym', 'gym', '健身房', rect(4, -0.5, ex1, 8)],
  ].map(([id, kind, name, r]) => ({ id, kind, name, rect: r }));
  const ob = (id, type, r, height) => ({ id, type, rect: r, height });
  const wm = (wx0 - 4) / 2, em = (4 + ex1) / 2;
  const obstacles = [
    ob('lounge-sofa-north', 'sofa', rect(wm - 2, -7.2, wm + 2, -6.4), .85), ob('lounge-table', 'table', rect(wm - 1, -5.3, wm + 1, -4.5), .45),
    ob('lounge-sofa-south', 'sofa', rect(wm - 2, -3.4, wm + 2, -2.6), .85),
    ob('library-shelf', 'bookcase', rect(wx0 + .2, 1.5, wx0 + .6, 7.5), 2.2), ob('library-table', 'table', rect(wm - 1.2, 3.4, wm + 1.2, 4.6), .76),
    ob('dining-table', 'table', rect(em - 2, -5.2, em + 2, -3.8), .76), ob('dining-sideboard', 'cabinet', rect(ex1 - .6, -7, ex1 - .2, -2), 1.0),
    ...[-1.6, 0, 1.6].map((dx, i) => ob(`gym-treadmill-${i}`, 'treadmill', rect(em + dx - .4, 5.6, em + dx + .4, 7.4), 1.4)),
  ];
  // Glazed partitions between the river rooms and the south rooms, with wide doors.
  const partitions = [
    { a: [wx0, -0.5], b: [-4, -0.5], door: { at: (-4 - wx0) - 2.4, width: 1.8 } },
    { a: [4, -0.5], b: [ex1, -0.5], door: { at: 2.4, width: 1.8 } },
  ];
  return { kind: 'community-club', frame: F, zones: z, obstacles, partitions, height: 5.0,
    circulation: [rect(wx0, -8, -4, 8), rect(4, -8, ex1, 8)] };
}

/** Unit-local rect → tower-local rect (both frames are multiples of 90°). */
const toTower = (TF, UF, r) => rectOf(lrectPoly(UF, r).map(([x, z]) => [x - TF.ox, z - TF.oz]));

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
    lv.rooms.push(coreRoom(`${id}-core`, 'core', F, [...elevators.flatMap((e) => ringRects(liftRect(e))), ...C.fillers, ...closed], [],
      { label: '北苑核心筒', residentialCore: id }));
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
      lv.lobbyPlan = clubPlan(F, wx0, ex1);
      for (const [i, r] of lv.lobbyPlan.circulation.entries()) lv.walk.push(localWalk(F, `${id}-club-${i}`, 'lobby', r));
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
  return { building: b, levels, stairs, elevators, escalators: [], ramps: [], entrances: [] };
}

/** Both 北苑 towers. */
export const northTowers = (hostLevels) => NORTH_SITE.towers.map((t) => northTower(t, hostLevels));
