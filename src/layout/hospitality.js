// 西侧酒店、公寓与星湾后区住宅。所有坐标以米计；套内几何均在各自 unit.frame 内。
// 私卫属于 residence，不放进 lv.rooms（后者只表示独立公共核心筒）。
import { frame, IDENTITY, rect, rectPoly, lrectPoly, lseg, toW, polyBounds, convexOverlap } from './geom.js';
import { lift } from './mall.js';
import { fillRows, markSpecial } from './parking.js';
import { addPlaza } from './campus.js';
import { createSuitePlan, createSuiteMezzanine, suiteAdditionObstacles } from './suite-plan.js';
import { createResidentialPlan, RESIDENTIAL_SLOTS } from './residential-plan.js';

export const HOSPITALITY = {
  west: rect(-485, -250, -310, -30),
  residential: rect(16, -256, 286, -176),
  towers: [
    { id: 'H', usage: 'hotel', name: '云澜酒店', short: '酒店', en: 'YUNLAN HOTEL', x: -432, z: -207, w: 74, d: 38, storeys: 20, floorHeight: 3.4, lobbyHeight: 6.5, accent: '#a27d49' },
    { id: 'A', usage: 'apartment', name: '云澜服务公寓', short: '公寓', en: 'YUNLAN RESIDENCES', x: -432, z: -82, w: 74, d: 38, storeys: 20, floorHeight: 3.4, lobbyHeight: 6.5, accent: '#537b78' },
    ...[49, 115, 181, 247].map((x, i) => ({ id: `R${i + 1}`, usage: 'residential', name: `云澜汇楼盘 ${i + 1} 号楼`, short: `住宅${i + 1}`, en: `YUNLAN RESIDENTIAL TOWER ${i + 1}`, x, z: -218, w: 42, d: 33.2, storeys: 30, floorHeight: 3.4, lobbyHeight: 4.8, accent: ['#7b8470', '#9b795f', '#637e91', '#867c96'][i] })),
  ],
};
const localWalk = (F, id, kind, r) => ({ id, kind, frame: F, rect: r, poly: lrectPoly(F, r) });
const wall = (a, b, at, width = 0.9) => ({ a, b, ...(at == null ? {} : { door: { at, width } }) });
const room = (id, type, F, r, doors = []) => ({ id, type, label: type === 'stair' ? '安全楼梯' : '电梯厅', frame: F, rects: [r], polys: [lrectPoly(F, r)], doors, wdoors: doors.map(d => lseg(F, d)) });

function residence(usage, type, w, d, prototype) {
  if (usage === 'residential') return createResidentialPlan(prototype);
  // door.at is the opening center, measured in metres from partition.a.
  const data = { kind: usage, type, area: +(w * d).toFixed(2), entryDoor: { at: w / 2, width: 1.25 }, exteriorSides: ['S'], windowSide: 'S', rooms: [], beds: [], bathrooms: [], partitions: [], kitchen: null, living: null };
  if (usage !== 'residential') {
    const suite = createSuitePlan();
    Object.assign(data, { suitePlan: suite, entryDoor: suite.entryDoor, rooms: suite.rooms, beds: suite.beds,
      bathrooms: suite.bathrooms, living: suite.living, partitions: suite.partitions, obstacles: suite.obstacles });
  }
  return data;
}

function addUnit(lv, spec, slot, F, w, d, type, prototype) {
  const number = `${String(lv.levelNumber).padStart(2, '0')}${String(slot).padStart(2, '0')}`;
  const catLabel = spec.usage === 'hotel' ? '酒店套房' : spec.usage === 'apartment' ? '服务公寓' : `${prototype} · ${prototype === '03' ? '四房两厅' : '三房两厅'}`;
  const fronts = [{ x0: 0, z0: 0, x1: w, z1: 0, side: 'N' }];
  const r = rect(0, 0, w, d);
  const u = { id: `${lv.id}-U${slot}`, code: `${spec.id}-${number}`, slot: String(slot), building: spec.id, level: lv.id, frame: F, rects: [r], polys: [lrectPoly(F, r)], fronts, wfronts: fronts.map(f => lseg(F, f)), style: 'residence', brand: { name: `${spec.name} ${number}`, en: `${spec.en} ${number}`, cat: spec.usage, catLabel, bg: spec.accent, fg: '#ffffff', logo: 'diamond' }, residence: residence(spec.usage, type, w, d, prototype) };
  if (spec.usage === 'apartment' && lv.levelNumber === 1) u.residence.duplex = createSuiteMezzanine(u.id);
  if (u.residence.suitePlan) u.residence.obstacles = [...u.residence.obstacles, ...suiteAdditionObstacles(spec.usage, !!u.residence.duplex)];
  lv.units.push(u);
}

const RESIDENTIAL_STAIRS = [rect(-20.4, -12.5, -15, -3.1), rect(15, -12.5, 20.4, -3.1)];
const RESIDENTIAL_PLATE = [
  rect(-19.4, 1.6, -3.8, 15.9), rect(3.8, 1.6, 19.4, 15.9), rect(-8.8, -15.9, 8.8, -1.6),
  rect(-20.4, -1.6, 20.4, 1.6), rect(-3.8, 1.6, 3.8, 6.8),
  ...RESIDENTIAL_STAIRS, rect(-20.4, -3.1, -15, -1.6), rect(15, -3.1, 20.4, -1.6),
];
const containsRect = (outer, inner) => inner.x0 >= outer.x0 - 1e-6 && inner.x1 <= outer.x1 + 1e-6 && inner.z0 >= outer.z0 - 1e-6 && inner.z1 <= outer.z1 + 1e-6;

/** First floor is a shared arrival/community floor, independent of the homes. */
function residentialLobby(F) {
  const zones = [
    ['entry', '入口门厅', rect(-4.8, 10.6, 4.8, 16.6)],
    ['reception', '礼宾接待', rect(6.4, 7.2, 13.4, 12.5)],
    ['waiting', '会客等候', rect(-18.5, 4.5, -6.2, 13.8)],
    ['mail', '信报与快递', rect(14.5, 1.9, 19.7, 13.8)],
    ['management', '物业服务', rect(-13.7, -13.7, -5.8, -5.3)],
    ['reading', '社区阅读', rect(-4.8, -13.7, 8.8, -5.3)],
    ['washroom', '公共卫生间', rect(9.8, -13.7, 13.8, -5.3)],
  ].map(([id, name, r]) => ({ id, name, rect: r }));
  const targets = { entry: [0, 14], reception: [9.9, 11], waiting: [-10, 9.6], mail: [16.7, 9.5],
    management: [-9.7, -6.5], reading: [0, -7], washroom: [11.8, -7] };
  for (const z of zones) z.navigationPoint = targets[z.id];
  const obstacles = [
    ['reception-desk', 'desk', rect(8, 8.6, 11.8, 9.6), 1.06],
    ['reception-back-cabinet', 'cabinet', rect(8, 6.6, 12.3, 7.1), 2.2],
    ['waiting-sofa-west', 'sofa', rect(-17.3, 7, -16.3, 11), .85],
    ['waiting-sofa-north', 'sofa', rect(-15.5, 5.5, -11.5, 6.5), .85],
    ['waiting-coffee-table', 'table', rect(-14.8, 8, -12.7, 9.2), .45],
    ['mailbox-wall', 'mailbox', rect(18.6, 2.5, 19.4, 7.5), 2.1],
    ['parcel-lockers', 'locker', rect(18.4, 8.5, 19.4, 12.8), 2.1],
    ['management-desk', 'desk', rect(-12, -10.4, -8, -9.5), .78],
    ['management-storage', 'cabinet', rect(-13.4, -13.3, -6.2, -12.7), 2.2],
    ['reading-bookcase', 'bookcase', rect(-4.4, -13.3, 8.3, -12.7), 2.2],
    ['reading-table', 'table', rect(-2.5, -10.5, 2.5, -9.2), .76],
    ['reading-sofa', 'sofa', rect(5.6, -10.5, 6.6, -7), .85],
    ['washroom-vanity', 'vanity', rect(10.1, -12.9, 11.1, -10.3), .84],
    ['washroom-wc', 'wc', rect(12.1, -12.4, 13.1, -11.1), .78],
  ].map(([id, type, r, height]) => ({ id, type, rect: r, height }));
  for (const [id, x, z] of [
    ['management-chair-north', -10, -11.1], ['management-chair-south', -10, -8.8],
    ['reception-chair', 10, 8],
    ...[-1.6, 0, 1.6].flatMap((x, i) => [[`reading-chair-north-${i}`, x, -11.15], [`reading-chair-south-${i}`, x, -8.55]]),
  ]) obstacles.push({ id, type: 'chair', rect: rect(x-.275, z-.275, x+.275, z+.275), height: .9 });
  const partitions = [];
  for (const id of ['management', 'washroom']) {
    const r = zones.find(z => z.id === id).rect;
    partitions.push(wall([r.x0, r.z0], [r.x1, r.z0]), wall([r.x0, r.z0], [r.x0, r.z1]),
      wall([r.x1, r.z0], [r.x1, r.z1]), wall([r.x0, r.z1], [r.x1, r.z1], (r.x1-r.x0)/2, 1.2));
  }
  return { frame: F, zones, obstacles, partitions, height: 4.8,
    circulation: [rect(-5.4, 7, 5.4, 16.6), rect(-7.2, -1.6, -3.2, 10.6), rect(3.2, -1.6, 6.2, 10.6), rect(-14.6, -5.3, 14.6, -1.6)] };
}

function tower(spec) {
  const F = frame(spec.x, spec.z, 0, spec.id), footprint = rect(-spec.w / 2, -spec.d / 2, spec.w / 2, spec.d / 2), outline = lrectPoly(F, footprint);
  const residential = spec.usage === 'residential';
  const basement = residential ? [{ short: 'B1', elev: -4.2, height: 4.2, kind: 'parking' }] : [{ short: 'B2', elev: -8.4, height: 3.9, kind: 'parking' }, { short: 'B1', elev: -4.5, height: 4.5, kind: 'concourse' }];
  const defs = [...basement, ...Array.from({ length: spec.storeys }, (_, i) => ({ short: `${i + 1}F`, levelNumber: i + 1, elev: i === 0 ? 0 : +(spec.lobbyHeight + (i - 1) * spec.floorHeight).toFixed(3), height: i === 0 ? spec.lobbyHeight : spec.floorHeight, kind: spec.usage }))];
  const top = +(spec.lobbyHeight + (spec.storeys - 1) * spec.floorHeight).toFixed(3);
  defs.push({ short: 'RF', elev: top, height: 3.2, kind: 'roof' });
  const levels = defs.map(c => ({ ...c, id: `${spec.id}-${c.short}`, building: spec.id, name: c.kind === 'parking' ? `${c.short} 住客车库` : c.kind === 'concourse' ? 'B1 商场与地铁连廊' : c.kind === 'roof' ? 'RF 屋顶花园' : `${c.short} ${residential ? '三户住宅' : '十间套房'}`, theme: { key: residential ? 'loft' : 'lux', floor: c.kind === 'parking' ? 'concrete-blue' : c.kind === 'roof' ? 'terrace-stone' : 'terrazzo', accent: spec.accent, label: c.kind === 'parking' ? '住客车库 · 独立进出' : c.kind === 'roof' ? '屋顶花园 · 电梯直达' : c.kind === 'concourse' ? '商场连廊 · 地铁换乘' : `${residential ? '三种户型' : '独卫套房'} · ${spec.name}` }, outline, units: [], rooms: [], walk: [], voids: [], features: [], slab: { pieces: [{ outer: outline, holes: [] }] } }));
  if (residential) for (const lv of levels) {
    if (lv.levelNumber === 1) {
      lv.kind = 'lobby'; lv.name = '1F 迎宾与社区大堂';
      lv.theme.label = '礼宾 · 会客 · 信报快递 · 物业 · 阅读';
      lv.lobbyPlan = residentialLobby(F);
    }
    // Three dwelling wings, two protected stair cores, a connecting corridor and
    // lift lobby form the upper floor plate. The light wells remain real voids.
    const rs = lv.elev > 0 ? RESIDENTIAL_PLATE : [footprint];
    lv.slab.pieces = rs.map(r => ({ outer: lrectPoly(F, r), holes: [], localRect: r }));
    lv.corePlan = { frame: F, corridor: rect(-20.4, -1.6, 20.4, 1.6),
      liftLobby: rect(-3.8, 1.6, 3.8, 3.6),
      stairVestibules: [rect(-20.4, -3.1, -15, -1.6), rect(15, -3.1, 20.4, -1.6)],
      lightWells: [rect(-15, -15.9, -8.8, -3.1), rect(8.8, -15.9, 15, -3.1), rect(-3.8, 6.8, 3.8, 15.9)],
      upperPlate: RESIDENTIAL_PLATE, stairs: [], lifts: [] };
  }
  const ids = levels.map(l => l.id);
  const stairs = (residential ? RESIDENTIAL_STAIRS : [rect(-36, -14, -30, -4), rect(30, 4, 36, 14)]).map((r, i) => {
    const side = residential || i === 0 ? 'S' : 'N', z = side === 'S' ? r.z1 : r.z0;
    const door = { x0: residential ? (r.x0+r.x1)/2-.7 : r.x0 + 1.1, z0: z, x1: residential ? (r.x0+r.x1)/2+.7 : r.x1 - 1.1, z1: z, side };
    const s = { id: `${spec.id}-ST${i + 1}`, building: spec.id, frame: F, rect: r, poly: lrectPoly(F, r), door, wdoor: lseg(F, door), wdoorByLevel: {}, serves: ids };
    if (residential) {
      s.shaftRect = rect(r.x0+.4, r.z0+.7, r.x1-.4, r.z1-2);
      s.landingRect = rect(r.x0+.2, r.z1-2, r.x1-.2, r.z1-.2);
    }
    return s;
  });
  const elevators = residential ? [-1.7, 1.7].map((x, i) => ({ ...lift(`${spec.id}-L${i + 1}`, spec.id, 'passenger', F, x, 5.1, 2.7, 3, 'N', ids), exterior: true, tower: true })) : [-34.25, -30.75].map((x, i) => ({ ...lift(`${spec.id}-L${i + 1}`, spec.id, 'passenger', F, x, 4.5, 2.8, 3, 'N', ids), exterior: true, tower: true }));
  for (const lv of levels) {
    lv.walk.push(localWalk(F, `${spec.id}-hall`, lv.kind === 'parking' ? 'aisle' : 'corridor', residential ? rect(-20.4, -1.6, 20.4, 1.6) : rect(-spec.w / 2, -2.5, spec.w / 2, 2.5)));
    if (residential) {
      lv.walk.push(localWalk(F, `${spec.id}-lift-hall`, 'lobby', lv.corePlan.liftLobby));
      if (lv.lobbyPlan) {
        for (const [i, r] of lv.lobbyPlan.circulation.entries()) lv.walk.push(localWalk(F, `${spec.id}-lobby-${i}`, 'lobby', r));
      } else if (lv.kind === 'parking') {
        lv.walk.push(localWalk(F, `${spec.id}-garage-cross-aisle`, 'aisle', rect(-21, -3, 21, 3)),
          localWalk(F, `${spec.id}-garage-exit-aisle`, 'aisle', rect(5.5, 3, 11.5, spec.d/2)));
      }
    }
    else lv.walk.push(localWalk(F, `${spec.id}-lobby`, 'lobby', rect(28, -3, 37, 3)), localWalk(F, `${spec.id}-lift-hall`, 'lobby', rect(-37, -2.5, -28, 3)));
    for (const s of stairs) {
      const stairRoom = room(s.id, 'stair', F, s.rect, [s.door]);
      if (residential) { stairRoom.shaftRect=s.shaftRect; stairRoom.landingRect=s.landingRect; }
      lv.rooms.push(stairRoom);
      const d = s.door;
      lv.walk.push(localWalk(F, `${s.id}-approach`, 'lobby', rect(d.x0, Math.min(d.z0, -2), d.x1, Math.max(d.z0, 2))));
      if (residential) {
        const poly = lrectPoly(F, s.shaftRect);
        lv.voids.push({ id: `${s.id}-void`, kind: 'stair', frame: F, rect: s.shaftRect, poly, stair: s.id });
        for (const piece of lv.slab.pieces) if (containsRect(piece.localRect, s.shaftRect)) piece.holes.push(poly);
        lv.corePlan.stairs.push({ id: s.id, rect: s.rect, door: s.door, shaftRect: s.shaftRect, landingRect: s.landingRect });
        lv.walk.push(localWalk(F, `${s.id}-vestibule`, 'lobby', lv.corePlan.stairVestibules[stairs.indexOf(s)]));
      }
    }
    for (const e of elevators) {
      const r = rect(e.lu - e.w / 2, e.lv - e.d / 2, e.lu + e.w / 2, e.lv + e.d / 2);
      const inner = rect(r.x0 + 0.09, r.z0 + 0.09, r.x1 - 0.09, r.z1 - 0.09);
      const rings = [rect(r.x0, r.z0, r.x1, inner.z0), rect(r.x0, inner.z1, r.x1, r.z1), rect(r.x0, inner.z0, inner.x0, inner.z1), rect(inner.x1, inner.z0, r.x1, inner.z1)];
      const core = room(`${e.id}-shaft`, 'core', F, r);
      core.rects = rings; core.polys = rings.map(q => lrectPoly(F, q));
      lv.rooms.push(core);
      const poly = lrectPoly(F, inner);
      lv.voids.push({ id: `${e.id}-void`, kind: 'shaft', frame: F, rect: inner, poly, elevator: e.id });
      if (residential) {
        for (const piece of lv.slab.pieces) if (containsRect(piece.localRect, inner)) piece.holes.push(poly);
        lv.corePlan.lifts.push({ id: e.id, rect: r, door: e.door, x: e.lu, z: e.lv });
      } else lv.slab.pieces[0].holes.push(poly);
    }
    if (lv.levelNumber) {
      if (!residential) {
        for (let i = 0; i < 5; i++) {
          const x0 = -27.5 + i * 11;
          const north = toW(F, x0 + 11, -2.5), south = toW(F, x0, 2.5);
          addUnit(lv, spec, i + 1, frame(...north, 180, `${lv.id}-N${i}`), 11, 15, spec.usage === 'apartment' ? 'serviced-suite' : 'king-suite');
          addUnit(lv, spec, i + 6, frame(...south, 0, `${lv.id}-S${i}`), 11, 15, spec.usage === 'apartment' ? 'serviced-suite' : 'king-suite');
        }
      } else if (lv.levelNumber > 1) {
        for (const slot of RESIDENTIAL_SLOTS) {
          const plan = createResidentialPlan(slot.prototype);
          addUnit(lv, spec, slot.slot, frame(...toW(F, slot.x, slot.z), slot.rotation, `${lv.id}-${slot.prototype}`), plan.width, plan.depth, plan.type, slot.prototype);
        }
      }
    } else if (lv.kind === 'parking') {
      const rows = [{ id: `${spec.id}-north`, u0: -spec.w / 2 + 1, u1: spec.w / 2 - 1, v0: -8, v1: -3, face: 'S' }, { id: `${spec.id}-south`, u0: -spec.w / 2 + 1, u1: spec.w / 2 - 1, v0: 3, v1: 8, face: 'N' }];
      const filled = fillRows(F, rows, [...lv.rooms.flatMap(r => r.polys), ...lv.walk.map(w => w.poly)], spec.id);
      markSpecial(filled.stalls, elevators.map(e => [e.x, e.z]), `${spec.id}-south`, 3);
      lv.parking = { ...filled, aisles: lv.walk.filter(w => w.kind === 'aisle'), zone: spec.id };
    }
  }
  const b = { id: spec.id, code: spec.id, name: spec.name, short: spec.short, en: spec.en, kind: 'tower', usage: spec.usage, frame: F, footprint, bounds: polyBounds(outline), outline, center: [spec.x, spec.z], radius: Math.hypot(spec.w, spec.d) / 2, height: top, storeys: spec.storeys, levels: ids, rotundas: [], wings: [], plot: residential ? HOSPITALITY.residential : HOSPITALITY.west, massing: { width: spec.w, depth: spec.d, top, podiumHeight: spec.lobbyHeight, facadeModule: residential ? 3.2 : 2.75 } };
  const entrance = residential ? { seg: { x0: spec.x - 2, z0: spec.z + spec.d/2, x1: spec.x + 2, z1: spec.z + spec.d/2 }, nx: 0, nz: 1 } : { seg: { x0: spec.x + 37, z0: spec.z - 2.2, x1: spec.x + 37, z1: spec.z + 2.2 }, nx: 1, nz: 0 };
  return { building: b, levels, stairs, elevators, escalators: [], ramps: [], entrances: [{ ...entrance, id: `${spec.id}-MAIN`, building: spec.id, level: `${spec.id}-1F`, name: `${spec.name}主入口`, width: residential ? 4 : 4.4, main: true, to: 'site' }] };
}

// 轴对齐路径；端点落在门户上，横向按 width 加宽。每个路径段是独立可走区。
const strips = (points, width) => [...points.slice(1).map((q, i) => {
  const p = points[i], h = width / 2;
  return Math.abs(q[0] - p[0]) > 0.01 ? rect(Math.min(p[0], q[0]), p[2] - h, Math.max(p[0], q[0]), p[2] + h) : rect(p[0] - h, Math.min(p[2], q[2]), p[0] + h, Math.max(p[2], q[2]));
}), ...points.slice(1, -1).map(p => rect(p[0] - width / 2, p[2] - width / 2, p[0] + width / 2, p[2] + width / 2))];
function connect(a, b, id, seg, nx, nz, name) {
  a.entrances.push({ id: `${id}-from`, building: a.building.id, level: a.level.id, to: b.level.id, name, seg, nx, nz, width: Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0), main: false, extension: true });
  b.entrances.push({ id: `${id}-to`, building: b.building.id, level: b.level.id, to: a.level.id, name, seg, nx: -nx, nz: -nz, width: Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0), main: false, extension: true });
}
function appendPath(extensions, owner, id, kind, name, points, width, to) {
  const rs = strips(points, width), polys = rs.map(rectPoly);
  const path = { slab: { pieces: polys.map(outer => ({ outer, holes: [] })) }, id, kind, name, building: owner.building.id, level: owner.level.id, from: owner.level.id, to, width, height: kind === 'underground' ? 3.1 : 3.4, points, polys };
  extensions.paths.push(path);
  for (let i = 0; i < rs.length; i++) { owner.level.walk.push(localWalk(IDENTITY, `${id}-${i}`, kind === 'garage' ? 'aisle' : 'passage', rs[i])); }
  return path;
}

/** 返回新的 parts；同时在原商场的已验证走道端头登记真实门户，保持原主体布局不动。 */
export function buildHospitality(existing, site) {
  site.bounds = rect(-495, -298, 298, 298);
  const parts = HOSPITALITY.towers.map(tower);
  const all = [...existing, ...parts], by = Object.fromEntries(all.map(p => [p.building.id, p]));
  const at = (bid, short) => ({ ...by[bid], level: by[bid].levels.find(l => l.short === short) });
  const extensions = { districts: [{ id: 'west-residences', name: '云澜酒店公寓区', rect: HOSPITALITY.west, poly: rectPoly(HOSPITALITY.west), buildingIds: ['H', 'A'] }, { id: 'xingwan-residences', name: '云澜汇楼盘 · 星湾后区', rect: HOSPITALITY.residential, poly: rectPoly(HOSPITALITY.residential), buildingIds: ['R1', 'R2', 'R3', 'R4'] }], paths: [], roads: [], connections: [] };
  for (const d of extensions.districts) {
    if (!site.plots.some(p => p.id === d.id)) site.plots.push({ id: d.id, name: d.name, rect: d.rect, poly: d.poly });
    addPlaza(site, `${d.id}-plaza`, d.poly, d.buildingIds[0]);
  }
  const surface = (id, points, width = 5) => {
    const polys = strips(points, width).map(rectPoly);
    extensions.paths.push({ id, kind: 'ground', name: id, width, points, polys });
    polys.forEach((poly, i) => addPlaza(site, `${id}-${i}`, poly, null));
  };
  surface('酒店公寓步行轴', [[-395, 0, -207], [-370, 0, -207], [-370, 0, -82], [-395, 0, -82]]);
  surface('酒店至方庭西门', [[-370, 0, -207], [-370, 0, -200], [-280, 0, -200]], 6);
  const residentialSpecs = HOSPITALITY.towers.filter(t => t.usage === 'residential');
  const residentialFront = residentialSpecs[0].z + residentialSpecs[0].d / 2;
  surface('住宅至星湾北门', [[49, 0, residentialFront], [49, 0, -193], [250, 0, -193]], 5);
  for (const t of residentialSpecs.slice(1)) surface(`住宅支路-${t.x}`, [[t.x, 0, t.z+t.d/2], [t.x, 0, -193]], 5);
  surface('住宅过街通廊', [[106.066, 0, -193], [106.066, 0, -135.902]], 6);
  const road = (id, name, points, width) => extensions.roads.push({ id, name, width, points, polys: strips(points, width).map(rectPoly) });
  road('west-access', '酒店公寓落客环路', [[-480, 0, -250], [-320, 0, -250], [-320, 0, -24], [-480, 0, -24], [-480, 0, -250]], 7);
  road('west-to-ring', '西外环连接路', [[-320, 0, -145], [-292, 0, -145]], 7);
  road('residential-loop', '住宅消防与落客环路', [[20, 0, -250], [278, 0, -250], [278, 0, -184], [20, 0, -184], [20, 0, -250]], 6);
  const H1 = at('H', 'B1'), A1 = at('A', 'B1'), P1 = at('P1', 'B1M');
  appendPath(extensions, H1, 'hotel-mall-metro', 'underground', '酒店 · 方庭 · 地铁连廊', [[-395, -4.5, -207], [-370, -4.5, -207], [-370, -4.5, -200], [-280, -4.5, -200]], 5, P1.level.id);
  connect(H1, P1, 'hotel-mall-metro', { x0: -280, z0: -202.5, x1: -280, z1: -197.5 }, 1, 0, '酒店地下连廊');
  appendPath(extensions, A1, 'apartment-hotel-metro', 'underground', '公寓至酒店地铁连廊', [[-395, -4.5, -82], [-370, -4.5, -82], [-370, -4.5, -197.5]], 5, H1.level.id);
  connect(A1, H1, 'apartment-hotel-metro', { x0: -372.5, z0: -197.5, x1: -367.5, z1: -197.5 }, 0, -1, '公寓酒店地下连廊');
  const H2 = at('H', '2F'), P12 = at('P1', '2F');
  appendPath(extensions, H2, 'hotel-skybridge', 'skybridge', '酒店至方庭空中连廊', [[-395, 6.5, -207], [-370, 6.5, -207], [-370, 6.5, -200], [-280, 6.5, -200]], 5, P12.level.id);
  connect(H2, P12, 'hotel-skybridge', { x0: -280, z0: -202.5, x1: -280, z1: -197.5 }, 1, 0, '酒店空中连廊');
  const HB = at('H', 'B2'), AB = at('A', 'B2'), PB = at('P1', 'B1');
  appendPath(extensions, HB, 'hotel-garage', 'garage', '酒店与一期地库连接道', [[-395, -8.4, -207], [-380, -8.4, -207], [-380, -8.4, -221], [-280, -8.4, -221]], 6, PB.level.id);
  const threshold = rect(-280, -224, -269, -218);
  PB.level.walk.push(localWalk(IDENTITY, 'hotel-garage-threshold', 'aisle', threshold));
  PB.level.parking.stalls = PB.level.parking.stalls.filter(s => !convexOverlap(s.poly, rectPoly(threshold)));
  connect(HB, PB, 'hotel-garage', { x0: -280, z0: -224, x1: -280, z1: -218 }, 1, 0, '酒店一期地库互通');
  appendPath(extensions, AB, 'apartment-garage', 'garage', '公寓与酒店地库连接道', [[-395, -8.4, -82], [-355, -8.4, -82], [-355, -8.4, -218]], 6, HB.level.id);
  connect(AB, HB, 'apartment-garage', { x0: -358, z0: -218, x1: -352, z1: -218 }, 0, -1, '公寓酒店地库互通');
  const R = at('R1', 'B1'), P2 = at('P2', 'B1');
  // The southern drive aisle sits east of both lift shafts, with six metres of
  // real width; it never relies on the narrow pedestrian gap between cabins.
  const garageX = x => x + 8.5;
  appendPath(extensions, R, 'residential-garage-spine', 'garage', '住宅共享地下车行通道', [[garageX(49), -4.2, residentialFront], [garageX(49), -4.2, -190], [garageX(247)+3, -4.2, -190]], 6, 'R4-B1');
  appendPath(extensions, R, 'residential-mall-metro', 'underground', '住宅 · 星湾 · 地铁连廊', [[106.066, -4.2, -190], [106.066, -4.2, -135.902]], 5, P2.level.id);
  connect(R, P2, 'residential-mall-metro', { x0: 103.566, z0: -135.902, x1: 108.566, z1: -135.902 }, 0, 1, '住宅星湾地下连廊');
  for (let i = 1; i < 4; i++) {
    const B = at(`R${i + 1}`, 'B1'), x = garageX(residentialSpecs[i].x);
    appendPath(extensions, B, `residential-${i + 1}-garage`, 'garage', `${i + 1}号住宅地下支路`, [[x, -4.2, residentialFront], [x, -4.2, -193]], 6, R.level.id);
    connect(B, R, `residential-${i + 1}-garage`, { x0: x - 3, z0: -193, x1: x + 3, z1: -193 }, 0, 1, '住宅共享地库');
  }
  // 独立双车道坡道在后区北缘，避免挡住住宅大堂和南侧步行轴。
  const arrival = rect(45, -248, 55, -217);
  // Only the part beyond the basement footprint needs an additional slab.
  // The driving reservation extends inside; duplicating that slab causes z-fighting.
  R.level.slab.pieces.push({ outer: rectPoly(rect(arrival.x0, arrival.z0, arrival.x1, R.building.bounds.z0)), holes: [] });
  R.level.walk.push(localWalk(IDENTITY, 'residential-ramp-arrival', 'aisle', arrival));
  R.level.parking.stalls = R.level.parking.stalls.filter(s => !convexOverlap(s.poly, rectPoly(arrival)));
  for (const [i, z] of [-244, -237.5].entries()) {
    const F = frame(20, z, 0, `R1-ramp-${i}`), lane = rect(0, -2.5, 28, 2.5), poly = lrectPoly(F, lane);
    const high = { x: 20, z, y: 0, level: 'street' }, low = { x: 48, z, y: -4.2, level: 'R1-B1' };
    by.R1.ramps.push({ id: `R1-${i ? 'OUT' : 'IN'}`, building: 'R1', type: i ? 'street-out' : 'street-in', name: i ? '住宅车库出口' : '住宅车库入口', width: 5, frame: F, lane, poly, from: i ? low : high, to: i ? high : low });
    site.trenches.push(poly); site.driveways.push(rectPoly(rect(16, z - 2.5, 20, z + 2.5)));
  }
  extensions.connections = all.flatMap(p => p.entrances.filter(e => e.extension).map(e => ({ id: e.id, from: e.level, to: e.to, seg: e.seg })));
  return { parts, extensions };
}
