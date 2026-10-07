// 西侧酒店、公寓与星湾后区住宅。所有坐标以米计；套内几何均在各自 unit.frame 内。
// 私卫属于 residence，不放进 lv.rooms（后者只表示独立公共核心筒）。
import { frame, IDENTITY, rect, rectPoly, lrectPoly, lseg, toW, polyBounds, convexOverlap } from './geom.js';
import { lift } from './mall.js';
import { fillRows, markSpecial } from './parking.js';
import { addPlaza } from './campus.js';

export const HOSPITALITY = {
  west: rect(-485, -250, -310, -30),
  residential: rect(16, -256, 286, -176),
  towers: [
    { id: 'H', usage: 'hotel', name: '云澜酒店', short: '酒店', en: 'YUNLAN HOTEL', x: -432, z: -207, w: 74, d: 38, storeys: 20, floorHeight: 3.4, lobbyHeight: 6.5, accent: '#a27d49' },
    { id: 'A', usage: 'apartment', name: '云澜服务公寓', short: '公寓', en: 'YUNLAN RESIDENCES', x: -432, z: -82, w: 74, d: 38, storeys: 20, floorHeight: 3.4, lobbyHeight: 6.5, accent: '#537b78' },
    ...[49, 115, 181, 247].map((x, i) => ({ id: `R${i + 1}`, usage: 'residential', name: `云澜汇楼盘 ${i + 1} 号楼`, short: `住宅${i + 1}`, en: `YUNLAN RESIDENTIAL TOWER ${i + 1}`, x, z: -218, w: 32, d: 26, storeys: 30, floorHeight: 3.1, lobbyHeight: 4, accent: ['#7b8470', '#9b795f', '#637e91', '#867c96'][i] })),
  ],
};
const localWalk = (F, id, kind, r) => ({ id, kind, frame: F, rect: r, poly: lrectPoly(F, r) });
const zone = (id, kind, r) => ({ id, kind, rect: r });
const wall = (a, b, at, width = 0.9) => ({ a, b, ...(at == null ? {} : { door: { at, width } }) });
const room = (id, type, F, r, doors = []) => ({ id, type, label: type === 'stair' ? '安全楼梯' : '电梯厅', frame: F, rects: [r], polys: [lrectPoly(F, r)], doors, wdoors: doors.map(d => lseg(F, d)) });

function residence(usage, type, w, d) {
  // door.at is the opening center, measured in metres from partition.a.
  const data = { kind: usage, type, area: +(w * d).toFixed(2), entryDoor: { at: w / 2, width: 1.25 }, exteriorSides: ['S'], windowSide: 'S', rooms: [], beds: [], bathrooms: [], partitions: [], kitchen: null, living: null };
  if (usage !== 'residential') {
    const bath = rect(w - 4, 0, w, 4.8);
    const living = rect(0.4, 4.9, 5.6, d - 0.4);
    data.rooms = [zone('entry', 'entry', rect(4.5, 0, 6.8, 4.9)), zone('living', 'living', living), zone('bedroom', 'bedroom', rect(5.8, 5.2, w - 0.25, d - 0.3)), zone('bath', 'bathroom', bath)];
    data.beds = type === 'twin-suite' ? [{ x: 7.25, z: 10.1, w: 1.25, d: 2.1, room: 'bedroom' }, { x: 9.25, z: 10.1, w: 1.25, d: 2.1, room: 'bedroom' }] : [{ x: 8.45, z: 10.1, w: 2, d: 2.15, room: 'bedroom' }];
    data.bathrooms = [{ id: 'bath', rect: bath }];
    data.living = { rect: living };
    data.partitions = [wall([w - 4, 0], [w - 4, 4.8], 2.35), wall([w - 4, 4.8], [w, 4.8])];
    if (usage === 'apartment') {
      const kitchen = rect(0.4, 0.4, 4.2, 4.2);
      data.kitchen = { rect: kitchen }; data.rooms.push(zone('kitchen', 'kitchen', kitchen));
      data.rooms.push(zone('dining', 'dining', rect(0.4, 4.9, 4.8, 7.4)));
    } else data.rooms.push(zone('tea', 'kitchenette', rect(0.4, 0.4, 4.2, 3.8)));
  } else {
    // 三种真实平面：108㎡一居、120㎡两居、180㎡三居；卫生间与卧室用显式门洞分隔。
    const n = type === 'one-bedroom' ? 1 : type === 'two-bedroom' ? 2 : 3;
    const bath = rect(w - 3.2, 0, w, 3);
    const living = rect(0.3, 4.3, Math.max(5.8, w * 0.43), d - 1.55);
    const kitchen = rect(0.3, 0.3, 4.2, 3.4);
    data.bathrooms = [{ id: 'bath', rect: bath }]; data.kitchen = { rect: kitchen }; data.living = { rect: living };
    data.rooms.push(zone('entry', 'entry', rect(w / 2 - 0.7, 0, w / 2 + 0.7, 3.6)), zone('bath', 'bathroom', bath), zone('kitchen', 'kitchen', kitchen), zone('living', 'living', living), zone('dining', 'dining', rect(4.3, 0.4, w - 3.4, 3.4)));
    data.partitions.push(wall([w - 3.2, 0], [w - 3.2, 3], 1.5), wall([w - 3.2, 3], [w, 3]));
    const bedroomStart = n === 3 ? 8 : 6.4;
    const span = (w - bedroomStart) / n;
    for (let i = 0; i < n; i++) {
      const a = bedroomStart + i * span, b = i === n - 1 ? w : a + span;
      const r = rect(a, 4.3, b, d - 1.5);
      data.rooms.push(zone(`bed-${i + 1}`, 'bedroom', r));
      data.beds.push({ x: (a + b) / 2, z: (4.3 + d - 1.5) / 2, w: n === 1 ? 1.8 : 1.5, d: 2.05, room: `bed-${i + 1}` });
      data.partitions.push(wall([a, 4.3], [b, 4.3], (b - a) / 2), wall([a, 4.3], [a, d - 1.5]));
    }
    const balcony = rect(0, d - 1.5, w, d);
    data.rooms.push(zone('balcony', 'balcony', balcony)); data.balcony = balcony;
  }
  return data;
}

function addUnit(lv, spec, slot, F, w, d, type) {
  const number = `${String(lv.levelNumber).padStart(2, '0')}${String(slot).padStart(2, '0')}`;
  const catLabel = spec.usage === 'hotel' ? '酒店套房' : spec.usage === 'apartment' ? '服务公寓' : ({ 'one-bedroom': '一室一厅', 'two-bedroom': '两室两厅', 'three-bedroom': '三室两厅' })[type];
  const fronts = [{ x0: 0, z0: 0, x1: w, z1: 0, side: 'N' }];
  const r = rect(0, 0, w, d);
  const u = { id: `${lv.id}-U${slot}`, code: `${spec.id}-${number}`, slot: String(slot), building: spec.id, level: lv.id, frame: F, rects: [r], polys: [lrectPoly(F, r)], fronts, wfronts: fronts.map(f => lseg(F, f)), style: 'residence', brand: { name: `${spec.name} ${number}`, en: `${spec.en} ${number}`, cat: spec.usage, catLabel, bg: spec.accent, fg: '#ffffff', logo: 'diamond' }, residence: residence(spec.usage, type, w, d) };
  lv.units.push(u);
}

function tower(spec) {
  const F = frame(spec.x, spec.z, 0, spec.id), footprint = rect(-spec.w / 2, -spec.d / 2, spec.w / 2, spec.d / 2), outline = lrectPoly(F, footprint);
  const residential = spec.usage === 'residential';
  const basement = residential ? [{ short: 'B1', elev: -4.2, height: 4.2, kind: 'parking' }] : [{ short: 'B2', elev: -8.4, height: 3.9, kind: 'parking' }, { short: 'B1', elev: -4.5, height: 4.5, kind: 'concourse' }];
  const defs = [...basement, ...Array.from({ length: spec.storeys }, (_, i) => ({ short: `${i + 1}F`, levelNumber: i + 1, elev: i === 0 ? 0 : +(spec.lobbyHeight + (i - 1) * spec.floorHeight).toFixed(3), height: i === 0 ? spec.lobbyHeight : spec.floorHeight, kind: spec.usage }))];
  const top = +(spec.lobbyHeight + (spec.storeys - 1) * spec.floorHeight).toFixed(3);
  defs.push({ short: 'RF', elev: top, height: 3.2, kind: 'roof' });
  const levels = defs.map(c => ({ ...c, id: `${spec.id}-${c.short}`, building: spec.id, name: c.kind === 'parking' ? `${c.short} 住客车库` : c.kind === 'concourse' ? 'B1 商场与地铁连廊' : c.kind === 'roof' ? 'RF 屋顶花园' : `${c.short} ${residential ? '三户住宅' : '十间套房'}`, theme: { key: residential ? 'loft' : 'lux', floor: c.kind === 'parking' ? 'concrete-blue' : c.kind === 'roof' ? 'terrace-stone' : 'terrazzo', accent: spec.accent, label: c.kind === 'parking' ? '住客车库 · 独立进出' : c.kind === 'roof' ? '屋顶花园 · 电梯直达' : c.kind === 'concourse' ? '商场连廊 · 地铁换乘' : `${residential ? '三种户型' : '独卫套房'} · ${spec.name}` }, outline, units: [], rooms: [], walk: [], voids: [], features: [], slab: { pieces: [{ outer: outline, holes: [] }] } }));
  const ids = levels.map(l => l.id);
  const stairs = (residential ? [rect(-15.5, -12.5, -10, -3), rect(10, -12.5, 15.5, -3)] : [rect(-36, -14, -30, -4), rect(30, 4, 36, 14)]).map((r, i) => {
    const side = residential || i === 0 ? 'S' : 'N', z = side === 'S' ? r.z1 : r.z0;
    const door = { x0: r.x0 + 1.1, z0: z, x1: r.x1 - 1.1, z1: z, side };
    return { id: `${spec.id}-ST${i + 1}`, building: spec.id, frame: F, rect: r, poly: lrectPoly(F, r), door, wdoor: lseg(F, door), wdoorByLevel: {}, serves: ids };
  });
  const elevators = residential ? [-2.2, 2.2].map((x, i) => ({ ...lift(`${spec.id}-L${i + 1}`, spec.id, 'passenger', F, x, 4.2, 2.6, 3, 'S', ids), exterior: true, tower: true })) : [-34.25, -30.75].map((x, i) => ({ ...lift(`${spec.id}-L${i + 1}`, spec.id, 'passenger', F, x, 4.5, 2.8, 3, 'N', ids), exterior: true, tower: true }));
  for (const lv of levels) {
    lv.walk.push(localWalk(F, `${spec.id}-hall`, lv.kind === 'parking' ? 'aisle' : 'corridor', rect(-spec.w / 2, -2.5, spec.w / 2, 2.5)));
    if (residential) lv.walk.push(localWalk(F, `${spec.id}-lobby`, 'lobby', rect(-4, -2.5, 4, 13)));
    else lv.walk.push(localWalk(F, `${spec.id}-lobby`, 'lobby', rect(28, -3, 37, 3)), localWalk(F, `${spec.id}-lift-hall`, 'lobby', rect(-37, -2.5, -28, 3)));
    for (const s of stairs) {
      lv.rooms.push(room(s.id, 'stair', F, s.rect, [s.door]));
      const d = s.door;
      lv.walk.push(localWalk(F, `${s.id}-approach`, 'lobby', rect(d.x0, Math.min(d.z0, -2), d.x1, Math.max(d.z0, 2))));
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
      lv.slab.pieces[0].holes.push(poly);
    }
    if (lv.levelNumber) {
      if (!residential) {
        for (let i = 0; i < 5; i++) {
          const x0 = -27.5 + i * 11;
          const north = toW(F, x0 + 11, -2.5), south = toW(F, x0, 2.5);
          addUnit(lv, spec, i + 1, frame(...north, 180, `${lv.id}-N${i}`), 11, 15, i % 2 && spec.usage === 'hotel' ? 'twin-suite' : 'king-suite');
          addUnit(lv, spec, i + 6, frame(...south, 0, `${lv.id}-S${i}`), 11, 15, spec.usage === 'apartment' ? 'serviced-suite' : 'king-suite');
        }
      } else {
        addUnit(lv, spec, 1, frame(...toW(F, 9, -2.5), 180, `${lv.id}-N`), 18, 10, 'three-bedroom');
        addUnit(lv, spec, 2, frame(...toW(F, -16, 2.5), 0, `${lv.id}-SW`), 12, 10, 'two-bedroom');
        addUnit(lv, spec, 3, frame(...toW(F, 4, 2.5), 0, `${lv.id}-SE`), 12, 9, 'one-bedroom');
      }
    } else if (lv.kind === 'parking') {
      const rows = [{ id: `${spec.id}-north`, u0: -spec.w / 2 + 1, u1: spec.w / 2 - 1, v0: -8, v1: -3, face: 'S' }, { id: `${spec.id}-south`, u0: -spec.w / 2 + 1, u1: spec.w / 2 - 1, v0: 3, v1: 8, face: 'N' }];
      const filled = fillRows(F, rows, [...lv.rooms.flatMap(r => r.polys), ...lv.walk.map(w => w.poly)], spec.id);
      markSpecial(filled.stalls, elevators.map(e => [e.x, e.z]), `${spec.id}-south`, 3);
      lv.parking = { ...filled, aisles: lv.walk.filter(w => w.kind === 'aisle'), zone: spec.id };
    }
  }
  const b = { id: spec.id, code: spec.id, name: spec.name, short: spec.short, en: spec.en, kind: 'tower', usage: spec.usage, frame: F, footprint, bounds: polyBounds(outline), outline, center: [spec.x, spec.z], radius: Math.hypot(spec.w, spec.d) / 2, height: top, storeys: spec.storeys, levels: ids, rotundas: [], wings: [], plot: residential ? HOSPITALITY.residential : HOSPITALITY.west, massing: { width: spec.w, depth: spec.d, top, podiumHeight: spec.lobbyHeight, facadeModule: residential ? 3.2 : 2.75 } };
  const entrance = residential ? { seg: { x0: spec.x - 2, z0: spec.z + 13, x1: spec.x + 2, z1: spec.z + 13 }, nx: 0, nz: 1 } : { seg: { x0: spec.x + 37, z0: spec.z - 2.2, x1: spec.x + 37, z1: spec.z + 2.2 }, nx: 1, nz: 0 };
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
  surface('住宅至星湾北门', [[49, 0, -205], [49, 0, -193], [250, 0, -193]], 5);
  for (const x of [115, 181, 247]) surface(`住宅支路-${x}`, [[x, 0, -205], [x, 0, -193]], 5);
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
  appendPath(extensions, R, 'residential-garage-spine', 'garage', '住宅共享地下车行通道', [[49, -4.2, -205], [49, -4.2, -190], [250, -4.2, -190]], 6, 'R4-B1');
  appendPath(extensions, R, 'residential-mall-metro', 'underground', '住宅 · 星湾 · 地铁连廊', [[106.066, -4.2, -190], [106.066, -4.2, -135.902]], 5, P2.level.id);
  connect(R, P2, 'residential-mall-metro', { x0: 103.566, z0: -135.902, x1: 108.566, z1: -135.902 }, 0, 1, '住宅星湾地下连廊');
  for (let i = 1; i < 4; i++) {
    const B = at(`R${i + 1}`, 'B1'), x = [49, 115, 181, 247][i];
    appendPath(extensions, B, `residential-${i + 1}-garage`, 'garage', `${i + 1}号住宅地下支路`, [[x, -4.2, -205], [x, -4.2, -193]], 6, R.level.id);
    connect(B, R, `residential-${i + 1}-garage`, { x0: x - 3, z0: -193, x1: x + 3, z1: -193 }, 0, 1, '住宅共享地库');
  }
  // 独立双车道坡道在后区北缘，避免挡住住宅大堂和南侧步行轴。
  const arrival = rect(45, -248, 55, -217);
  R.level.slab.pieces.push({ outer: rectPoly(arrival), holes: [] });
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
