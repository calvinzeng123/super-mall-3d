// 云澜·西苑：西停车场北排的两栋 3梯5户 板式住宅（W1 / W2，云澜物业）。每层五户、户型各不相同，
// 两部客梯 + 一部消防电梯、两部防烟楼梯、1.8 m 内走廊；1F 门禁社区大堂，B1/B2 为住户电梯厅，
// 经刷卡门接西侧共享车库。坐标：塔楼局部 x 沿板长（东），z 向南；户型数据见 community-plan-data.js。
import { frame, rect, rectPoly, lrectPoly, lseg, toW, polyBounds, subtractInterval } from './geom.js';
import { lift } from './mall.js';
import { towerStairPlan, buildTowerStairAccess } from './tower-stairs.js';
import { WEST_SITE } from './community-sites.js';
import { COMMUNITY_PLANS } from './community-plan-data.js';
import { communityUnit, COMMUNITY_ACCENT } from './community-units.js';
import { gateRecord, zoneRecord } from './access-records.js';

const HW = WEST_SITE.slab.w / 2, HD = WEST_SITE.slab.d / 2;   // 21.7 × 9.6
const CORE_W = 15.7;
// Tower-local bands: north row z[-9.6,-1.2] | corridor z[-1.2,0.6] | south row z[0.6,9.6].
export const WEST_BANDS = Object.freeze({ north: -HD, corridor: [-1.2, 0.6], south: HD });
// Basement lobby: core + corridor + a 2 m card-door vestibule up to the deck portal.
const BASEMENT = Object.freeze({ corridor: [-1.2, 1.0], portal: 3.0 });
const LOBBY_GATE_Z = 7.2;

const r2 = (v) => Math.round(v * 1000) / 1000;
const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };
const localWalk = (F, id, kind, r) => ({ id, kind, frame: F, rect: r, poly: lrectPoly(F, r) });
const room = (id, type, F, rects, extra = {}) => ({ id, type, label: type === 'stair' ? '安全楼梯' : '核心筒', frame: F,
  rects, polys: rects.map((r) => lrectPoly(F, r)), doors: [], wdoors: [], ...extra });
const wall = (a, b, door, extra = {}) => ({ a, b, ...(door ? { door } : {}), ...extra });

const { x0: PX0, z0: PZ0, x1: PX1, z1: PZ1 } = WEST_SITE.plot;
const FR = WEST_SITE.fireRoad;
export const WEST_GARDEN = deepFreeze({
  id: 'west-garden', name: '云澜·西苑', en: 'YUNLAN WEST GARDEN', operator: '云澜物业',
  plot: rect(PX0, PZ0, PX1, PZ1),
  // One E–W fire road along the south facades, fed from 北环 through gate WP-G4 and the tower gap.
  fireRoad: rect(FR.x0, FR.z0, FR.x1, FR.z1),
  gateLane: rect(-425.5, PZ0, -418.5, FR.z0),
  gate: { id: 'WP-G4', x: -422, z: -251, width: 7 },
  // The kept pedestrian spine becomes the community's internal N–S path; the south fence runs along z −204.
  path: rect(-428.5, PZ0, -425.5, PZ1),
  southWalk: rect(PX0, PZ1, -301, PZ1 + 4),
  towers: WEST_SITE.towers.map((t, i) => ({
    id: t.id, number: i + 1, center: [...t.center], core: [...t.core],
    name: `云澜·西苑 ${i + 1} 号楼`, short: `西苑${i + 1}`, en: `YUNLAN WEST GARDEN ${i + 1}`, accent: COMMUNITY_ACCENT.west,
  })),
});

/** Tower-local rectangles shared by the layout, gates and renderer. */
export function westCore(c) {
  return {
    core: rect(c, -HD, c + CORE_W, WEST_BANDS.corridor[0]),
    stairs: [rect(c, -HD, c + 3.6, -1.2), rect(c + 12.1, -HD, c + CORE_W, -1.2)],
    doors: [[c + 1.1, c + 2.5], [c + 13.2, c + 14.6]],
    lobby: rect(c + 6.35, -7.2, c + 9.35, -1.2),
    // 管道井 west of the lift lobby; 垃圾间 · 强弱电间 east of it.
    service: [
      { id: 'pipes', name: '管道井', rects: [rect(c + 3.6, -HD, c + 6.35, -6.6), rect(c + 3.6, -1.7, c + 6.35, -1.2)] },
      { id: 'refuse', name: '垃圾间 · 强弱电间', rects: [rect(c + 6.35, -HD, c + 12.1, -7.2), rect(c + 9.35, -7.2, c + 12.1, -5.4), rect(c + 9.35, -2.6, c + 12.1, -1.2)] },
    ],
    basement: rect(c, -HD, c + CORE_W, BASEMENT.portal),
    vestibule: rect(c + 6.35, BASEMENT.corridor[1], c + 9.35, BASEMENT.portal),
    portal: { x0: c + 6.35, x1: c + 9.35, z: BASEMENT.portal },
  };
}

/** 1F 社区大堂：门禁前厅 → 刷卡玻璃门 → 入口大堂；礼宾、物业服务中心、会客、信报快递、儿童活动与阅览。 */
export function communityLobby(F, slab, core) {
  const { x0: sx0, z0: sz0, x1: sx1, z1: sz1 } = slab, cz = WEST_BANDS.corridor;
  const z = [
    ['management', '云澜物业服务中心', 'management', rect(sx0, cz[1], -12, sz1)],
    ['lounge', '住户会客厅', 'lounge', rect(-12, cz[1], -4, sz1)],
    ['entry', '入口大堂', 'entry', rect(-4, cz[1], 4, LOBBY_GATE_Z)],
    ['vestibule', '门禁前厅', 'vestibule', rect(-4, LOBBY_GATE_Z, 4, sz1)],
    ['waiting', '休息等候', 'waiting', rect(4, cz[1], 11, 4)],
    ['reception', '礼宾接待', 'reception', rect(4, 4, 11, sz1)],
    ['mail', '信报与快递', 'mail', rect(11, cz[1], sx1, sz1)],
    ['kids', '儿童活动室', 'kids', rect(sx0, sz0, core.x0, cz[0])],
    ['washroom', '公共卫生间', 'washroom', rect(core.x1, sz0, core.x1 + 4.5, cz[0])],
    ['reading', '社区阅览室', 'reading', rect(core.x1 + 4.5, sz0, sx1, cz[0])],
  ];
  const zones = z.map(([id, name, kind, r]) => ({ id, kind, name, rect: r, navigationPoint: [r2((r.x0 + r.x1) / 2), r2((r.z0 + r.z1) / 2)] }));
  const at = (id) => zones.find((q) => q.id === id).rect;
  const obstacles = [];
  const ob = (id, type, r, height) => obstacles.push({ id, type, rect: r, height });
  const chair = (id, x, zz) => ob(id, 'chair', rect(x - .275, zz - .275, x + .275, zz + .275), .9);
  ob('reception-desk', 'desk', rect(5.6, 6.2, 9.4, 7.0), 1.06);
  ob('reception-back-cabinet', 'cabinet', rect(5.6, 9.0, 10.4, 9.4), 2.2);
  chair('reception-chair', 7.5, 7.6);
  ob('waiting-sofa', 'sofa', rect(5.2, 1.4, 9.2, 2.3), .85);
  ob('waiting-table', 'table', rect(6.2, 2.8, 8.2, 3.5), .45);
  const L = at('lounge');
  ob('lounge-sofa-west', 'sofa', rect(L.x0 + .5, 3.2, L.x0 + 1.5, 7.2), .85);
  ob('lounge-sofa-south', 'sofa', rect(L.x0 + 2.4, 8.3, L.x1 - 2.4, 9.2), .85);
  ob('lounge-table', 'table', rect(L.x0 + 2.6, 4.4, L.x0 + 4.8, 5.8), .45);
  ob('lounge-bookcase', 'bookcase', rect(L.x0 + 2.2, 1.1, L.x1 - 1.6, 1.5), 1.8);
  const M = at('management');
  ob('management-desk', 'desk', rect(M.x0 + 2.4, 4.6, M.x0 + 6.4, 5.5), .78);
  ob('management-storage', 'cabinet', rect(M.x0 + .4, 1.4, M.x0 + 1.0, 8.8), 2.2);
  chair('management-chair-north', M.x0 + 4.4, 4.0); chair('management-chair-south', M.x0 + 4.4, 6.1);
  const P = at('mail');
  ob('mailbox-wall', 'mailbox', rect(P.x1 - .7, 1.4, P.x1 - .2, 5.8), 2.1);
  ob('parcel-lockers', 'locker', rect(P.x1 - .8, 6.4, P.x1 - .2, 9.1), 2.1);
  ob('mail-table', 'table', rect(P.x0 + 2.4, 3.4, P.x0 + 5.4, 4.6), .76);
  const K = at('kids');
  ob('kids-shelf', 'cabinet', rect(K.x0 + .5, K.z0 + .4, K.x0 + Math.min(6, K.x1 - K.x0 - 1), K.z0 + .9), 1.2);
  ob('kids-table', 'table', rect(K.x0 + 2.2, K.z0 + 3.4, K.x0 + 4.4, K.z0 + 4.8), .55);
  const Wc = at('washroom');
  ob('washroom-vanity', 'vanity', rect(Wc.x0 + .3, Wc.z0 + 1.0, Wc.x0 + 1.3, Wc.z0 + 3.6), .84);
  ob('washroom-wc', 'wc', rect(Wc.x1 - 1.5, Wc.z0 + .4, Wc.x1 - .5, Wc.z0 + 1.7), .78);
  const R = at('reading');
  ob('reading-bookcase', 'bookcase', rect(R.x0 + .4, R.z0 + .4, R.x1 - .5, R.z0 + .9), 2.2);
  ob('reading-table', 'table', rect(R.x0 + 1.4, R.z0 + 3.4, Math.min(R.x1 - 1.4, R.x0 + 5.4), R.z0 + 4.6), .76);
  const partitions = [
    // The card door closes the vestibule on its third side; both side screens are glass.
    wall([-4, LOBBY_GATE_Z], [-4, sz1], null, { role: 'glass' }), wall([4, LOBBY_GATE_Z], [4, sz1], null, { role: 'glass' }),
    wall([-12, cz[1]], [-12, sz1], { at: 1.6, width: 1.2 }), wall([sx0, cz[1]], [-12, cz[1]]),
    wall([sx0, cz[0]], [core.x0, cz[0]], { at: (core.x0 - sx0) / 2, width: 1.4 }, { role: 'glass' }),
    wall([core.x1, cz[0]], [core.x1 + 4.5, cz[0]], { at: 1.5, width: 1.0 }), wall([core.x1 + 4.5, sz0], [core.x1 + 4.5, cz[0]]),
    wall([core.x1 + 4.5, cz[0]], [sx1, cz[0]], { at: (sx1 - core.x1 - 4.5) / 2, width: 2.4 }, { role: 'glass' }),
  ];
  const circulation = [rect(sx0, cz[0], sx1, cz[1]), at('entry'), at('vestibule')];
  return { kind: 'community-lobby', frame: F, zones, obstacles, partitions, circulation, height: 4.5, gateZ: LOBBY_GATE_Z };
}

function levelDefs() {
  const L = WEST_SITE.levels;
  return [
    { short: 'B2', elev: L.B2, height: r2(L.B1 - L.B2), kind: 'garage-lobby' },
    { short: 'B1', elev: L.B1, height: r2(-L.B1), kind: 'garage-lobby' },
    { short: '1F', levelNumber: 1, elev: 0, height: L.lobbyHeight, kind: 'lobby' },
    ...Array.from({ length: L.top - 1 }, (_, i) => ({ short: `${i + 2}F`, levelNumber: i + 2,
      elev: r2(L.lobbyHeight + i * L.floorHeight), height: L.floorHeight, kind: 'community' })),
    { short: 'RF', elev: L.roof, height: 3.2, kind: 'roof' },
  ];
}

const levelName = (spec, d) => d.kind === 'garage-lobby' ? `${d.short} 住户电梯厅 · 接共享车库`
  : d.kind === 'lobby' ? '1F 社区大堂' : d.kind === 'roof' ? 'RF 屋顶花园' : `${d.short} 五户住宅`;
const levelLabel = (spec, d) => d.kind === 'garage-lobby' ? '住户刷卡进入 · 西侧共享车库'
  : d.kind === 'lobby' ? '门禁大堂 · 礼宾 · 物业服务中心 · 信报快递' : d.kind === 'roof' ? '屋顶花园 · 电梯直达'
    : `3梯5户 · 两房 / 三房 / 四房 · ${spec.name}`;

/** One 云澜·西苑 slab tower: levels, core, five homes per floor, lobby, entrance and basement lobbies. */
export function westTower(spec) {
  const id = spec.id, [cx, cz] = spec.center, c = spec.core[0];
  const F = frame(cx, cz, 0, id), footprint = rect(-HW, -HD, HW, HD), outline = lrectPoly(F, footprint);
  const K = westCore(c), data = COMMUNITY_PLANS.west[id];
  const defs = levelDefs(), ids = defs.map((d) => `${id}-${d.short}`);
  const top = defs.at(-1).elev;
  const stairs = K.stairs.map((r, i) => {
    const [d0, d1] = K.doors[i], door = { x0: d0, z0: r.z1, x1: d1, z1: r.z1, side: 'S' };
    const s = { id: `${id}-ST-${'AB'[i]}`, building: id, residentialCore: id, frame: F, rect: r, poly: lrectPoly(F, r),
      door, wdoor: lseg(F, door), wdoorByLevel: {}, serves: ids, label: `西苑${spec.number}号楼 ${'AB'[i]} 梯` };
    const plan = towerStairPlan(s);
    return Object.assign(s, { continuous: true, shaftRect: plan.shaftRect, landingRect: plan.landingRect });
  });
  const elevators = [
    { ...lift(`${id}-L1`, id, 'passenger', F, c + 4.975, -5.4, 2.6, 2.4, 'E', ids), label: '西苑客梯 1', role: 'passenger' },
    { ...lift(`${id}-L2`, id, 'passenger', F, c + 4.975, -2.9, 2.6, 2.4, 'E', ids), label: '西苑客梯 2', role: 'passenger' },
    { ...lift(`${id}-L3`, id, 'passenger', F, c + 10.725, -4.0, 2.6, 2.8, 'W', ids), label: '消防电梯', role: 'fire', fire: true, stretcher: true },
  ].map((e) => ({ ...e, tower: true, residentialCore: id }));
  const liftRect = (e) => rect(r2(e.lu - e.w / 2), r2(e.lv - e.d / 2), r2(e.lu + e.w / 2), r2(e.lv + e.d / 2));
  const levels = defs.map((d, i) => {
    const below = d.elev < 0, slabRect = below ? K.basement : footprint;
    const lv = { ...d, id: ids[i], building: id, name: levelName(spec, d),
      theme: { key: 'loft', floor: below ? 'concrete-blue' : d.kind === 'roof' ? 'terrace-stone' : 'terrazzo', accent: spec.accent, label: levelLabel(spec, d) },
      // A basement lobby level is only its slab; the deck around it belongs to WPG.
      outline: below ? lrectPoly(F, slabRect) : outline, units: [], rooms: [], walk: [], voids: [], features: [],
      slab: { pieces: [{ outer: lrectPoly(F, slabRect), holes: [], localRect: slabRect }] } };
    const holes = lv.slab.pieces[0].holes;
    for (const s of stairs) {
      lv.rooms.push(room(s.id, 'stair', F, [s.rect], { doors: [s.door], wdoors: [s.wdoor], continuous: true,
        shaftRect: s.shaftRect, landingRect: s.landingRect, residentialCore: id }));
      const poly = lrectPoly(F, s.shaftRect);
      lv.voids.push({ id: `${s.id}-void`, kind: 'stair', frame: F, rect: s.shaftRect, poly, stair: s.id, residentialCore: id });
      holes.push(poly);
    }
    for (const e of elevators) {
      const r = liftRect(e), inner = rect(r.x0 + .09, r.z0 + .09, r.x1 - .09, r.z1 - .09);
      lv.rooms.push(room(`${e.id}-shaft`, 'core', F, [rect(r.x0, r.z0, r.x1, inner.z0), rect(r.x0, inner.z1, r.x1, r.z1),
        rect(r.x0, inner.z0, inner.x0, inner.z1), rect(inner.x1, inner.z0, r.x1, inner.z1)], { label: e.label, residentialCore: id }));
      const poly = lrectPoly(F, inner);
      lv.voids.push({ id: `${e.id}-void`, kind: 'shaft', frame: F, rect: inner, poly, elevator: e.id });
      holes.push(poly);
    }
    for (const s of K.service) lv.rooms.push(room(`${id}-core-${s.id}`, 'core', F, s.rects, { label: s.name, residentialCore: id }));
    const corridor = below ? rect(c, BASEMENT.corridor[0], c + CORE_W, BASEMENT.corridor[1]) : rect(-HW, WEST_BANDS.corridor[0], HW, WEST_BANDS.corridor[1]);
    lv.walk.push(localWalk(F, `${id}-corridor`, below ? 'lobby' : 'corridor', corridor), localWalk(F, `${id}-lift-lobby`, 'lobby', K.lobby));
    lv.corePlan = { kind: 'community', frame: F, core: K.core, corridor,
      landings: [{ id: `${id}-lift-lobby`, rect: K.lobby, open: true }],
      lifts: elevators.map((e) => ({ id: e.id, rect: liftRect(e), door: e.door, x: e.lu, z: e.lv, role: e.role })),
      stairs: stairs.map((s) => ({ id: s.id, continuous: true, rect: s.rect, door: s.door, shaftRect: s.shaftRect, landingRect: s.landingRect })),
      service: K.service.map((s) => ({ id: s.id, name: s.name, rects: s.rects })) };
    if (below) {
      lv.walk.push(localWalk(F, `${id}-${d.short}-vestibule`, 'lobby', K.vestibule));
      // Glass side screens of the card-door vestibule (world segments).
      lv.navWalls = [K.vestibule.x0, K.vestibule.x1].map((x) => {
        const [x0, z0] = toW(F, x, K.vestibule.z0), [x1, z1] = toW(F, x, K.vestibule.z1);
        return { x0, z0, x1, z1, glass: true };
      });
      lv.corePlan.vestibule = K.vestibule;
      lv.corePlan.portal = K.portal;
    } else if (d.kind === 'lobby') {
      lv.lobbyPlan = communityLobby(F, footprint, K.core);
      for (const [j, r] of lv.lobbyPlan.circulation.slice(1).entries()) lv.walk.push(localWalk(F, `${id}-lobby-${j}`, 'lobby', r));
    } else if (d.kind === 'roof') {
      // Roof garden decks around the core; planters stand along the parapet.
      for (const [j, r] of [rect(-HW + 1.3, WEST_BANDS.corridor[1], HW - 1.3, HD - 1.3), rect(-HW + 1.3, -HD + 1.3, c, WEST_BANDS.corridor[0]),
        rect(c + CORE_W, -HD + 1.3, HW - 1.3, WEST_BANDS.corridor[0])].entries()) lv.walk.push(localWalk(F, `${id}-roof-deck-${j}`, 'deck', r));
      lv.roofGarden = { planters: roofPlanters(c) };
      lv.navObstacles = lv.roofGarden.planters.map((p) => ({ id: `${id}-${p.id}`, poly: lrectPoly(F, p.rect) }));
    } else {
      for (const [slot, u] of data.units.entries()) {
        const number = `${String(d.levelNumber).padStart(2, '0')}${String(slot + 1).padStart(2, '0')}`;
        const uf = frame(cx + u.frame.ox, cz + u.frame.oz, u.frame.deg, `${lv.id}-${u.slot}`);
        lv.units.push(communityUnit({ lv, building: id, id: `${lv.id}-${u.slot}`, code: `${id}-${number}`, slot: String(slot + 1).padStart(2, '0'),
          frame: uf, plan: u.plan, name: `${spec.name} ${number}`, en: `${spec.en}-${number}`, accent: spec.accent, community: 'west' }));
      }
    }
    return lv;
  });
  const plot = WEST_GARDEN.plot, hs = WEST_GARDEN.fireRoad;
  const bounds = polyBounds(outline);
  const b = { id, code: id, name: spec.name, short: spec.short, en: spec.en, kind: 'tower', usage: 'community', community: 'west',
    campusGroup: 'P1', accent: spec.accent, operator: WEST_GARDEN.operator, frame: F, footprint, bounds, outline, center: [cx, cz],
    radius: Math.hypot(2 * HW, 2 * HD) / 2, height: top, storeys: WEST_SITE.levels.top, levels: ids, rotundas: [], wings: [],
    plot, massing: { width: 2 * HW, depth: 2 * HD, top, podiumHeight: WEST_SITE.levels.lobbyHeight, facadeModule: 3.0 },
    entryLevel: `${id}-1F`, stackedOn: null, stairLevelIds: [...ids],
    fireFrontage: [r2(bounds.x0), r2(bounds.x1)], hardstand: { x0: r2(bounds.x0), z0: hs.z0, x1: r2(bounds.x1), z1: hs.z1 },
    deckExclusions: [lrectPoly(F, K.basement)],
    // World portal segment of each basement lobby onto the shared deck (G2, D5).
    deckPortal: (() => { const [x0, z] = toW(F, K.portal.x0, K.portal.z), [x1] = toW(F, K.portal.x1, K.portal.z); return { x0: r2(x0), z0: r2(z), x1: r2(x1), z1: r2(z) }; })(),
  };
  b.access = buildTowerStairAccess(b, levels, stairs);
  const seg = lseg(F, { x0: -2, z0: HD, x1: 2, z1: HD, side: 'S' });
  const entrances = [{ id: `${id}-MAIN`, building: id, level: `${id}-1F`, name: `${spec.name} · 社区大堂主入口`, seg, nx: seg.nx, nz: seg.nz,
    width: 4, main: true, to: 'site', coveredConnection: true }];
  return { building: b, levels, stairs, elevators, escalators: [], ramps: [], entrances };
}

/** Roof planters along the parapet, clear of the core penthouse and the stair doors. */
function roofPlanters(c) {
  const out = [], push = (id, r) => out.push({ id, rect: r });
  for (const [i, [x0, x1]] of [[-HW + .2, -11], [-9, 9], [11, HW - .2]].entries()) push(`roof-planter-s${i}`, rect(x0, HD - 1.2, x1, HD - .2));
  push('roof-planter-w', rect(-HW + .2, -6, -HW + 1.2, 6.4));
  push('roof-planter-e', rect(HW - 1.2, -6, HW - .2, 6.4));
  if (c - (-HW) > 6) push('roof-planter-nw', rect(-HW + 2, -HD + .2, c - 1, -HD + 1.2));
  if (HW - (c + CORE_W) > 6) push('roof-planter-ne', rect(c + CORE_W + 1, -HD + .2, HW - 2, -HD + 1.2));
  return out;
}

/** 西苑 card doors: the 1F street vestibule and the two basement deck vestibules (all single-floor). */
export function westGates(part) {
  const b = part.building, F = b.frame, id = b.id, n = id.replace(/\D/g, ''), c = toCore(b);
  const K = westCore(c), poly = (r) => lrectPoly(F, r);
  const sign = { cn: `云澜·西苑 ${n} 号楼 · 住户大堂`, en: 'YUNLAN WEST GARDEN · RESIDENTS', sub: '住户刷卡通行 · 访客请至礼宾台' };
  const zone = (short, rects) => zoneRecord({ id: `${id}-${short}-zone`, building: id, name: `云澜·西苑 ${n} 号楼住户区`,
    label: `西苑 ${n} 号楼 · ${short === '1F' ? '住户大堂' : '住户电梯厅'}`, floor: `${id}-${short}`, polys: rects.map(poly) });
  const zones = [
    zone('1F', [rect(-HW, -HD, HW, LOBBY_GATE_Z), rect(-HW, LOBBY_GATE_Z, -4, HD), rect(4, LOBBY_GATE_Z, HW, HD)]),
    ...['B1', 'B2'].map((short) => zone(short, [rect(c, -HD, c + CORE_W, K.vestibule.z0), rect(c, K.vestibule.z0, K.vestibule.x0, K.portal.z),
      rect(K.vestibule.x1, K.vestibule.z0, c + CORE_W, K.portal.z)])),
  ];
  const gates = [
    { ...gateRecord({ id: `${id}-1F-GATE`, zone: `${id}-1F-zone`, kind: 'glass-door', name: `西苑 ${n} 号楼 · 住户门禁`, floor: `${id}-1F`,
      frame: [...toW(F, 4, LOBBY_GATE_Z), 180], length: 8, lanes: [{ u0: 3.2, u1: 4.8 }], reader: { u: 2.2, v: -0.8 }, sign }), building: id, portal: null },
    ...['B1', 'B2'].map((short) => ({ ...gateRecord({ id: `${id}-${short}-GATE`, zone: `${id}-${short}-zone`, kind: 'glass-door',
      name: `西苑 ${n} 号楼 · 地下住户门禁`, floor: `${id}-${short}`, frame: [...toW(F, K.vestibule.x1, K.vestibule.z0), 180], length: 3,
      lanes: [{ u0: .7, u1: 2.3 }], reader: { u: 1.5, v: -1.2 }, sign: { ...sign, cn: `云澜·西苑 ${n} 号楼 · 住户电梯厅` } }), building: id, portal: null })),
  ];
  return { zones, gates };
}
const toCore = (b) => WEST_GARDEN.towers.find((t) => t.id === b.id).core[0];

/** Street-door canopy of a 西苑 lobby (render/build/community.js draws it; its posts are ground obstacles). */
export const WEST_CANOPY = Object.freeze({ overhang: 1.3, depth: 3.2, post: .15 });
const FENCE_T = .32;

/** Site record shared by the renderer and the walk model: fence lines (with the gate and path
 * openings), the 北门 G4 门楼 with its guard booth, the fire road, hardstands, garden beds and
 * bollards. `obstacles` are what stands solid on the ground (fence, pillars, booth, posts,
 * raised planters, canopy posts and bollards). */
export function westGardenSite(towers) {
  const g = WEST_GARDEN, P = g.plot, lane = g.gateLane, path = g.path, fr = g.fireRoad, h = FENCE_T / 2;
  // One 门楼 spans the community path and the G4 lane; its pillars stand outside both.
  const span = [path.x0, lane.x1], gz = P.z0 + h;
  // The plinths stand just inside the plot line, so the boundary is the fence's outer face.
  const fence = [
    { id: 'south', a: [P.x0, P.z1 - h], b: [P.x1, P.z1 - h], gaps: [[path.x0, path.x1]] },
    { id: 'north', a: [P.x0, gz], b: [P.x1, gz], gaps: [span] },
    { id: 'west', a: [P.x0 + h, P.z0], b: [P.x0 + h, P.z1], gaps: [] },
    { id: 'east', a: [P.x1 - h, P.z0], b: [P.x1 - h, P.z1], gaps: [] },
  ];
  const pillar = (x) => rect(x - .45, gz - .45, x + .45, gz + .45);
  const gate = { ...g.gate, span, z: gz, pillars: [pillar(span[0] - .5), pillar(span[1] + .5)],
    boom: { x: lane.x1 + .3, z: gz + 1.0 }, booth: rect(lane.x1 + 1.2, P.z0 + .7, lane.x1 + 4.0, P.z0 + 3.1) };
  const pathGate = { z: P.z1 - .22, posts: [path.x0 - .2, path.x1 + .2].map((x) => rect(x - .2, P.z1 - .42, x + .2, P.z1 - .02)) };
  // Garden: the band between the fence and the fire road, the gap between the towers, the strip
  // behind each tower and raised planters in the 5 m rescue band (open in front of the door).
  const bounds = towers.map((t) => t.building.bounds), [t0, t1] = bounds, beds = [];
  for (const [x0, x1] of [[P.x0 + .6, path.x0 - .6], [path.x1 + .6, P.x1 - .6]]) beds.push({ rect: rect(x0, fr.z1 + .8, x1, P.z1 - .8), trees: true });
  if (t0 && t1) {
    beds.push({ rect: rect(t0.x1 + 1.2, t0.z0 + 1, path.x0 - .8, fr.z0 - 1), trees: true });
    beds.push({ rect: rect(lane.x1 + 4.2, t0.z0 + 4, t1.x0 - 1.2, fr.z0 - 1), trees: false });
  }
  for (const b of bounds) {
    beds.push({ rect: rect(b.x0 + .5, P.z0 + .7, b.x1 - .5, b.z0 - .6), trees: false });
    const m = (b.x0 + b.x1) / 2;
    for (const [x0, x1] of subtractInterval([[b.x0 + .5, b.x1 - .5]], [m - 3.6, m + 3.6])) beds.push({ rect: rect(x0, b.z1 + .7, x1, fr.z0 - .9), trees: false, raised: true });
  }
  const garden = beds.filter((q) => q.rect.x1 - q.rect.x0 >= 1.5 && q.rect.z1 - q.rect.z0 >= 1.2);
  // Bollards line the path; along the G4 lane only on the path's west side.
  const bollards = [];
  for (let z = P.z0 + 4; z < P.z1 - 2; z += 8) for (const x of [path.x0 - .45, path.x1 + .45]) {
    if (z + .2 > fr.z0 && z - .2 < fr.z1) continue;
    if (x > path.x1 && z > lane.z0 - .5 && z < lane.z1 + .5) continue;
    bollards.push([r2(x), r2(z)]);
  }
  const canopyPosts = towers.flatMap((t) => {
    const e = t.entrances.find((q) => q.main), m = (e.seg.x0 + e.seg.x1) / 2, half = (e.seg.x1 - e.seg.x0) / 2 + WEST_CANOPY.overhang;
    const z = e.seg.z0 + WEST_CANOPY.depth - WEST_CANOPY.post;
    return [m - half + WEST_CANOPY.post, m + half - WEST_CANOPY.post].map((x) => [r2(x), r2(z)]);
  });
  const obstacles = [];
  const solid = (id, kind, r) => obstacles.push({ id: `west-garden-${id}`, kind, rect: r, poly: rectPoly(r) });
  for (const f of fence) {
    const alongX = f.a[1] === f.b[1], c = alongX ? f.a[1] : f.a[0];
    for (const [i, [t0, t1]] of f.gaps.reduce((iv, q) => subtractInterval(iv, q), [[alongX ? f.a[0] : f.a[1], alongX ? f.b[0] : f.b[1]]]).entries())
      solid(`fence-${f.id}-${i}`, 'fence', alongX ? rect(t0, c - h, t1, c + h) : rect(c - h, t0, c + h, t1));
  }
  gate.pillars.forEach((r, i) => solid(`gate-pillar-${i}`, 'pillar', r));
  solid('gate-boom-post', 'post', rect(gate.boom.x - .15, gate.boom.z - .15, gate.boom.x + .15, gate.boom.z + .15));
  solid('guard-booth', 'booth', gate.booth);
  pathGate.posts.forEach((r, i) => solid(`path-gate-post-${i}`, 'post', r));
  garden.filter((q) => q.raised).forEach((q, i) => solid(`planter-${i}`, 'planter', q.rect));
  canopyPosts.forEach(([x, z], i) => solid(`canopy-post-${i}`, 'post', rect(x - .1, z - .1, x + .1, z + .1)));
  bollards.forEach(([x, z], i) => solid(`bollard-${i}`, 'bollard', rect(x - .12, z - .12, x + .12, z + .12)));
  return {
    id: g.id, name: g.name, en: g.en, operator: g.operator, plot: { ...P }, poly: rectPoly(P), fence,
    fireRoad: { ...fr }, gateLane: { ...lane }, path: { ...path }, gate, pathGate, garden, bollards, canopyPosts, obstacles,
    hardstands: towers.map((t) => ({ id: `HS-${t.building.id}`, tower: t.building.id, rect: { ...t.building.hardstand } })),
    towers: towers.map((t) => t.building.id),
  };
}
