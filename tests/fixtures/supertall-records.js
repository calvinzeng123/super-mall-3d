// Synthetic supertall records for P0b's render / UI tests (SPEC §2.2 "fixtures", C-15): the field shapes of
// SPEC §2.1 (zones, refuge level + refugePlan, lift speed / role / zone / card / fireOnly, stair breakLevels,
// gate role / leaf / releaseOnAlarm), so P0b's consumers are tested without P0a's builders. Each tower package
// tests the real records in its own files.
//
// ST: a 22-storey tower, frame (300, -500), plate 24 × 16 m:
//   B1 (−4.5), 1F lobby (0, 4.5 m), 2F–9F homes (3.2 m), 10F 避难层 (4.5 m), 11F–19F homes, 20F 避难层 (5.4 m), 21F–22F homes, RF.
//   Lifts: ST-L1 / ST-L2 passenger 'low' bank 3 m/s (B1 1F 2–9 · 11–19), ST-H1 passenger 'high' 4 m/s (B1 1F 21 22 RF),
//   ST-F fire lift 4 m/s on every level, ST-S service-fire with fireOnly on 1F (its normal stops are B1 2F–22F).
//   Stairs ST-A / ST-B with breakLevels 10F / 20F. Gates ST-1F-GATE (entry, own leaf), ST-A-EXIT (exit, existing leaf),
//   ST-A-12F (reentry, existing leaf).
import { frame, rect, lrectPoly, toW } from '../../src/layout/geom.js';

export const ST_FRAME = frame(300, -500, 0);
export const ST_PLATE = rect(-12, -8, 12, 8);
const F = ST_FRAME;

const storey = (short, elev, height, extra = {}) => ({ short, elev, height, ...extra });
export const ST_STOREYS = [
  storey('B1', -4.5, 4.5, { kind: 'garage-lobby' }), storey('1F', 0, 4.5, { kind: 'lobby' }),
  ...Array.from({ length: 8 }, (_, i) => storey(`${i + 2}F`, 4.5 + 3.2 * i, 3.2)),
  storey('10F', 4.5 + 3.2 * 8, 4.5, { kind: 'refuge' }),
  ...Array.from({ length: 9 }, (_, i) => storey(`${i + 11}F`, 4.5 + 3.2 * 8 + 4.5 + 3.2 * i, 3.2)),
];
{ const l = ST_STOREYS.at(-1); ST_STOREYS.push(storey('20F', l.elev + l.height, 5.4, { kind: 'refuge', outrigger: true })); }
for (const s of ['21F', '22F']) { const l = ST_STOREYS.at(-1); ST_STOREYS.push(storey(s, l.elev + l.height, 3.2)); }
{ const l = ST_STOREYS.at(-1); ST_STOREYS.push(storey('RF', l.elev + l.height, 3.2, { kind: 'roof' })); }

const levelId = (short) => `ST-${short}`;
const num = (short) => (/^(\d+)F$/.exec(short) ? +/^(\d+)F$/.exec(short)[1] : null);

/** A refugePlan in the SPEC §2.1 shape (poly world; rect / frame local as P0a's refugeLevel adds them). */
export function refugePlan(elev, outrigger = false) {
  const area = rect(-12, -8, 12, -1), west = rect(-12, 1, -2, 8), east = rect(2, 1, 12, 8);
  return {
    frame: F, face: 'N',
    areas: [{ id: 'refuge-area', name: '避难区', rect: area, poly: lrectPoly(F, area), net: 168 }],
    plant: [
      { id: 'plant-w', name: '水泵房', rect: west, poly: lrectPoly(F, west), rating: '3.00h', contents: ['transfer tank', 'pumps'] },
      { id: 'plant-e', name: '风机房', rect: east, poly: lrectPoly(F, east), rating: '2.00h', contents: ['fans', 'electrical'] },
    ],
    vestibules: [{ id: 'vest', name: '防火隔间', rect: rect(-2, 1, 2, 3), poly: lrectPoly(F, rect(-2, 1, 2, 3)), doors: [] }],
    windows: [{ edge: 'N', span: [-10, -2], kind: 'fire-window-B' }, { edge: 'N', span: [2, 10], kind: 'fire-window-B' }, { edge: 'S', span: [-12, 12], kind: 'louvre' }],
    fixtures: [['hydrant', -6, -1.3], ['hose-reel', -4, -1.3], ['extinguisher', 4, -1.3], ['fire-phone', 6, -1.3], ['pa', 0, -4], ['sign', 0, -1.2]]
      .map(([kind, x, z]) => { const [wx, wz] = toW(F, x, z); return { kind, x: wx, z: wz, label: kind === 'sign' ? '10F 避难层' : '' }; }),
    serves: [], persons: 800, netRequired: 160, outrigger,
  };
}

export function stLevels() {
  return ST_STOREYS.map((s, index) => {
    const id = levelId(s.short), refuge = s.kind === 'refuge', homes = !refuge && s.kind !== 'roof' && s.kind !== 'lobby' && s.elev > 0;
    const units = homes ? ['W', 'E'].map((side) => ({ id: `${id}-${side}`, code: `ST-${String(num(s.short)).padStart(2, '0')}0${side === 'W' ? 1 : 2}`, building: 'ST', level: id,
      frame: F, rects: [side === 'W' ? rect(-12, 0, -1, 8) : rect(1, 0, 12, 8)], residence: { home: `ST-${s.short}${side}` } })) : [];
    return {
      id, building: 'ST', short: s.short, levelNumber: num(s.short) ?? undefined, index, elev: s.elev, height: s.height,
      kind: s.kind || 'community', name: refuge ? `${s.short} 避难层` : `${s.short} ${s.kind === 'lobby' ? '大堂' : s.kind === 'roof' ? '屋顶设备层' : '住宅'}`,
      theme: { accent: refuge ? '#7d868b' : '#6f8a7a', label: refuge ? `避难层 · 设备层 · 消防电梯停靠${s.outrigger ? ' · 加强层' : ''}` : s.kind === 'lobby' ? '住宅大堂' : s.kind === 'roof' ? '屋顶设备层' : num(s.short) > 20 ? '顶层大平层' : num(s.short) > 10 ? '云端大平层' : '江景大平层' },
      units, rooms: [], walk: [{ id: `${id}-core`, kind: 'corridor', frame: F, rect: rect(-2, -3, 2, 1), poly: lrectPoly(F, rect(-2, -3, 2, 1)) }],
      voids: [], features: [], slab: { pieces: [{ outer: lrectPoly(F, ST_PLATE), holes: [], localRect: { ...ST_PLATE } }] },
      ...(refuge ? { refugePlan: refugePlan(s.elev, !!s.outrigger) } : {}),
    };
  });
}

/** b.zones in the SPEC §2.1 shape (bottom-up), with P0a's optional `levels` list. */
export function stZones(levels) {
  const ids = (from, to) => { const a = levels.findIndex((l) => l.id === from), b = levels.findIndex((l) => l.id === to); return levels.slice(a, b + 1).map((l) => l.id); };
  const z = (id, name, from, to, kind, lifts, homes) => ({ id, name, from: levelId(from), to: levelId(to), kind, lifts, homes, levels: ids(levelId(from), levelId(to)) });
  return [
    z('ST-basement', 'B1 地下', 'B1', 'B1', 'basement', ['ST-L1', 'ST-L2', 'ST-H1', 'ST-F'], 0),
    z('ST-lobby', '1F 大堂', '1F', '1F', 'lobby', ['ST-L1', 'ST-L2', 'ST-H1', 'ST-F'], 0),
    z('ST-low', '低区 江景大平层 2–9F', '2F', '9F', 'band', ['ST-L1', 'ST-L2', 'ST-F', 'ST-S'], 16),
    z('ST-R1', '10F 避难层', '10F', '10F', 'refuge', ['ST-F', 'ST-S'], 0),
    z('ST-mid', '中区 云端大平层 11–19F', '11F', '19F', 'band', ['ST-L1', 'ST-L2', 'ST-F', 'ST-S'], 18),
    z('ST-R2', '20F 避难层 · 加强层', '20F', '20F', 'refuge', ['ST-F', 'ST-S'], 0),
    z('ST-high', '高区 21–22F', '21F', '22F', 'band', ['ST-H1', 'ST-F', 'ST-S'], 4),
    z('ST-roof', 'RF 屋顶设备层', 'RF', 'RF', 'roof', ['ST-H1', 'ST-F', 'ST-S'], 0),
  ];
}

const liftRec = (id, extra) => ({ id, building: 'ST', type: 'passenger', frame: F, lu: 0, lv: -5, w: 2.4, d: 2.6, door: 'S', x: 300, z: -505, nx: 0, nz: 1, reach: 1.5, rideable: true, tower: true, ...extra });
export function stLifts(levels) {
  const all = levels.map((l) => l.id), by = (pred) => levels.filter(pred).map((l) => l.id);
  const low = by((l) => l.short === 'B1' || l.short === '1F' || (l.levelNumber >= 2 && l.levelNumber <= 19 && l.kind !== 'refuge'));
  const high = by((l) => ['B1', '1F', '21F', '22F', 'RF'].includes(l.short));
  return [
    liftRec('ST-L1', { label: '低区客梯 1', role: 'passenger', zone: 'low', card: 'resident', speed: 3, serves: low, shaftLevels: all }),
    liftRec('ST-L2', { label: '低区客梯 2', role: 'passenger', zone: 'low', card: 'resident', speed: 3, serves: low, shaftLevels: all }),
    liftRec('ST-H1', { label: '高区客梯 1', role: 'passenger', zone: 'high', card: 'resident', speed: 4, serves: high, shaftLevels: all }),
    liftRec('ST-F', { label: '消防电梯', role: 'fire', speed: 4, serves: all, shaftLevels: all, car: { w: 1.1, d: 2.1 } }),
    liftRec('ST-S', { label: '消防 / 服务梯', role: 'service-fire', speed: 4, serves: all.filter((id) => id !== 'ST-1F'), fireOnly: ['ST-1F'], shaftLevels: all }),
  ];
}

export function stStairs() {
  const door = { x0: -1.4, z0: -1.6, x1: -0.3, z1: -1.6, side: 'N' };
  return [{ id: 'ST-A', building: 'ST', frame: F, rect: rect(-4, -1.6, 0, 8), door, serves: stLevels().map((l) => l.id), breakLevels: ['ST-10F', 'ST-20F'],
    breakDoors: { 'ST-20F': { door2: { x0: -3.7, z0: -1.6, x1: -2.6, z1: -1.6, side: 'N' }, partition: { x0: -2, z0: -1.6, x1: -2, z1: .4 } } } }];
}

/** Gate records in the §2.1 shape (gateRecord fields + role / leaf / releaseOnAlarm). */
export function stGates() {
  const g = (id, role, leaf, kind, floor, at, length, sign) => ({ id, zone: 'ST-1F', kind, name: id, floors: [floor], frame: frame(300 + at[0], -500 + at[1], 0),
    line: { u0: 0, u1: length }, lanes: [{ u0: 0, u1: length }], cabinets: [], reader: { u: length / 2, v: -.8 }, hold: 4, sign, releaseOnAlarm: true, role, leaf, building: 'ST' });
  return [
    g('ST-1F-GATE', 'entry', 'own', 'glass-door', 'ST-1F', [-1, 2], 2, { cn: '住户专区', sub: '火灾时自动释放' }),
    g('ST-A-EXIT', 'exit', 'existing', 'glass-door', 'ST-1F', [-3.9, 8], 1.1, { cn: '仅供疏散 · 外侧刷卡', sub: '火灾时自动释放' }),
    g('ST-A-12F', 'reentry', 'existing', 'glass-door', 'ST-12F', [-1.4, -1.6], 1.1, { cn: '住户楼层 · 刷卡进入', sub: '火灾时自动释放' }),
  ];
}

export function stBuilding(levels = stLevels(), { zones = true } = {}) {
  return { id: 'ST', name: '合成超高层 ST', short: 'ST', en: 'SYNTHETIC TOWER', kind: 'tower', usage: 'residential', frame: F, footprint: { ...ST_PLATE },
    levels: levels.map((l) => l.id), height: levels.at(-1).elev, ...(zones ? { zones: stZones(levels) } : {}),
    coreCard: ['ST 核心筒', '客梯 ×3 · 消防梯 ×1 · 服务梯 ×1'] };
}

/** A small layout holding only the synthetic tower (what floor-rows / lift-keypad / the render kits read). */
export function stLayout(opts = {}) {
  const levels = stLevels(), b = stBuilding(levels, opts);
  return { buildings: [b], levels, elevators: stLifts(levels), stairs: stStairs(), entrances: [], escalators: [], categories: {},
    accessControl: { gates: stGates(), zones: [] } };
}
