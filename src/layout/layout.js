// 汇总布局模型：buildLayout() → { levels, escalators, elevators, stairs, entrances, ramps, site }
import { BUILDING, LEVELS, VOID_1F, VOID_UP, GLASS_LIFTS, GLASS_SHAFT, CATEGORIES } from './constants.js';
import { rect, rectPoly, roundedRectPoly, rcx, rcz } from './geom.js';
import { fillRetail } from './retail.js';
import { coreRooms, buildEscalators, escalatorSlot, ELEVATORS, STAIRS } from './vertical.js';
import { fillParking, B1_OUTER, B1_RAMP_HOLE } from './parking.js';
import { fillRoof } from './roof.js';
import { ENTRANCES, RAMPS, SITE } from './site.js';

function addVoids(lv, escalators) {
  const add = (id, kind, poly) => lv.voids.push({ id, kind, poly });
  if (lv.id === '1F') {
    add('atrium', 'atrium', roundedRectPoly(VOID_1F.rect, VOID_1F.radius));
    for (const g of GLASS_LIFTS) {
      const h = GLASS_SHAFT / 2;
      add(`shaft-${g.id}`, 'shaft', rectPoly(rect(g.x - h, g.z - h, g.x + h, g.z + h)));
    }
  }
  if (lv.id === '2F' || lv.id === '3F') add('atrium', 'atrium', roundedRectPoly(VOID_UP.rect, VOID_UP.radius));
  if (lv.id === 'RF') add('skylight', 'skylight', roundedRectPoly(VOID_UP.rect, VOID_UP.radius));
  if (lv.id === 'B1') add('ramp', 'ramp', rectPoly(B1_RAMP_HOLE));
  const pairs = new Map();
  for (const e of escalators) {
    if (e.slot && e.to === lv.id) {
      if (!pairs.has(e.pair)) pairs.set(e.pair, []);
      pairs.get(e.pair).push(e);
    }
  }
  for (const [pair, list] of pairs) add(`slot-${pair}`, 'escalator', rectPoly(escalatorSlot(list)));
}

/** 铺位号：按顺时针环绕（从西北角开始）排序后编号 */
function assignCodes(lv) {
  const angle = (u) => {
    const r = u.rects[0];
    const a = Math.atan2(rcz(r), rcx(r));
    return (a + Math.PI * 1.75) % (Math.PI * 2);
  };
  const ring = (u) => (Math.abs(rcx(u.rects[0])) > 40 || Math.abs(rcz(u.rects[0])) > 22 ? 0 : 1);
  const sorted = [...lv.units].sort((a, b) => ring(a) - ring(b) || angle(a) - angle(b));
  sorted.forEach((u, i) => { u.code = `${lv.short}-${String(i + 1).padStart(2, '0')}`; });
}

export function buildLayout() {
  const levels = LEVELS.map((base) => ({
    ...base, theme: { ...base.theme }, units: [], rooms: [], walk: [], voids: [], features: [], slab: null,
  }));
  const byId = Object.fromEntries(levels.map((l) => [l.id, l]));
  const escalators = buildEscalators(byId);

  for (const lv of levels) {
    const core = coreRooms(lv.id);
    lv.rooms.push(...core.rooms);
    lv.walk.push(...core.walk);
    if (lv.kind === 'retail' || lv.kind === 'food') fillRetail(lv);
    else if (lv.kind === 'parking') fillParking(lv);
    else fillRoof(lv);
    addVoids(lv, escalators);
    lv.slab = { outer: lv.id === 'B1' ? B1_OUTER : rectPoly(BUILDING), holes: lv.voids.map((v) => v.poly) };
    assignCodes(lv);
    for (const u of lv.units) u.brand.catLabel = (CATEGORIES[u.brand.cat] || {}).label || u.brand.cat;
  }

  return {
    levels,
    escalators,
    elevators: ELEVATORS,
    stairs: STAIRS,
    entrances: ENTRANCES,
    ramps: RAMPS,
    site: SITE,
    categories: CATEGORIES,
  };
}
