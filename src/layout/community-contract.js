// 云澜社区住宅塔楼的数据契约：西苑 W1/W2 与北苑 T1/T2 的布局记录必须满足这些字段，
// 社区渲染器（render/build/community.js）只依赖这里列出的字段。返回错误字符串列表，空表示通过。
import { pointInPoly, polyCentroid } from './geom.js';
import { NORTH_SITE } from './community-sites.js';
import { LIFT_ROLES as ROLES, isFireLift } from './elevator-shafts.js';
import { refugeLevelErrors } from './refuge.js';

// 'refuge': a numbered 避难层 with no homes and a refugePlan (refuge.js). Supertall P0a.
export const LEVEL_KINDS = new Set(['garage-lobby', 'lobby', 'club', 'community', 'roof', 'refuge']);
export const LIFT_ROLES = new Set(ROLES);
const VOID_REF = { stair: 'stair', shaft: 'elevator', 'home-stair': 'unit', 'home-void': 'unit' };
const LOBBY = { west: ['1F', 'community-lobby'], north: ['7F', 'community-club'] };

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v) => typeof v === 'string' && v.length > 0;
const isRect = (r) => !!r && ['x0', 'z0', 'x1', 'z1'].every((k) => num(r[k])) && r.x0 < r.x1 && r.z0 < r.z1;
const isPoly = (p) => Array.isArray(p) && p.length >= 3 && p.every((q) => Array.isArray(q) && num(q[0]) && num(q[1]));
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

/** Every contract violation of community tower b (record or id) in layout, as strings. */
export function communityContractErrors(layout, b) {
  if (typeof b === 'string') b = layout.buildings.find((x) => x.id === b);
  if (!b) return ['building: missing'];
  const errs = [], id = b.id;
  const err = (path, msg) => errs.push(`${id} ${path}: ${msg}`);
  const levelById = new Map(layout.levels.map((l) => [l.id, l]));
  const elevOf = (lid) => levelById.get(lid)?.elev;
  const sortedByElev = (ids) => [...ids].sort((a, z) => elevOf(a) - elevOf(z));
  const north = b.community === 'north';

  // ---------- building ----------
  if (b.kind !== 'tower') err('building.kind', `expected 'tower', got ${b.kind}`);
  if (b.usage !== 'community') err('building.usage', `expected 'community', got ${b.usage}`);
  if (!['west', 'north'].includes(b.community)) err('building.community', `expected 'west' | 'north', got ${b.community}`);
  for (const k of ['name', 'short', 'en', 'accent']) if (!str(b[k])) err(`building.${k}`, 'required string');
  if (b.campusGroup !== 'P1') err('building.campusGroup', `expected 'P1', got ${b.campusGroup}`);
  if (!b.frame || !num(b.frame.ox) || !num(b.frame.oz) || b.frame.deg !== 0) err('building.frame', 'required, deg 0');
  if (!isRect(b.footprint)) err('building.footprint', 'required local rect');
  if (!isPoly(b.outline)) err('building.outline', 'required polygon');
  if (!b.bounds || !['x0', 'z0', 'x1', 'z1'].every((k) => num(b.bounds[k]))) err('building.bounds', 'required rect');
  if (!Array.isArray(b.center) || !num(b.center[0]) || !num(b.center[1])) err('building.center', 'required [x, z]');
  for (const k of ['radius', 'height']) if (!num(b[k]) || b[k] <= 0) err(`building.${k}`, 'required positive number');
  if (!Number.isInteger(b.storeys) || b.storeys <= 0) err('building.storeys', 'required positive integer');
  const own = layout.levels.filter((l) => l.building === id).map((l) => l.id);
  const levels = Array.isArray(b.levels) ? b.levels : [];
  if (!Array.isArray(b.levels) || !levels.length) err('building.levels', 'required level ids');
  else {
    for (const lid of levels) if (levelById.get(lid)?.building !== id) err('building.levels', `${lid} is not an own level`);
    if (!sameSet(levels, own)) err('building.levels', 'must list exactly the own levels');
    if (levels.some((lid, i) => i && !(elevOf(levels[i - 1]) < elevOf(lid)))) err('building.levels', 'must ascend by elev');
  }
  const entry = north ? 'P1-1F' : `${id}-1F`;
  if (b.entryLevel !== entry) err('building.entryLevel', `expected ${entry}, got ${b.entryLevel}`);
  if (b.stackedOn !== (north ? 'P1' : null)) err('building.stackedOn', `expected ${north ? "'P1'" : 'null'}, got ${b.stackedOn}`);
  let host = [];
  if (north) {
    const want = [...NORTH_SITE.hostDoorLevels, ...NORTH_SITE.hostPassLevels];
    for (const lid of want) if (!levelById.has(lid)) err('building.hostLevels', `host level ${lid} missing from the layout`);
    host = sortedByElev(want.filter((lid) => levelById.has(lid)));
    if (!Array.isArray(b.hostLevels) || b.hostLevels.join() !== host.join()) err('building.hostLevels', `expected ${host.join(',')} (sorted by elev)`);
  } else if (b.hostLevels?.length) err('building.hostLevels', 'west towers have no host levels');
  const stairLevels = north ? sortedByElev([...host, ...levels]) : levels;
  if (!Array.isArray(b.stairLevelIds) || b.stairLevelIds.join() !== stairLevels.join()) err('building.stairLevelIds', `expected ${north ? 'host + own' : 'own'} levels sorted by elev`);
  if (!Array.isArray(b.fireFrontage) || b.fireFrontage.length !== 2 || !num(b.fireFrontage[0]) || !num(b.fireFrontage[1]) || !(b.fireFrontage[0] < b.fireFrontage[1])) err('building.fireFrontage', 'required [x0, x1]');
  if (!isRect(b.hardstand)) err('building.hardstand', 'required {x0, z0, x1, z1}');
  const access = b.access;
  if (!access || access.protected !== true || !['surfaces', 'flights', 'routes'].every((k) => Array.isArray(access[k]))) err('building.access', 'required {protected:true, surfaces, flights, routes}');

  // ---------- levels and units ----------
  const units = new Map(layout.levels.flatMap((l) => l.units.map((u) => [u.id, u])));
  const stairIds = new Set(layout.stairs.map((s) => s.id)), liftIds = new Set(layout.elevators.map((e) => e.id));
  for (const lid of own) {
    const lv = levelById.get(lid), at = `level ${lid}`;
    if (!LEVEL_KINDS.has(lv.kind)) err(`${at} kind`, `unexpected ${lv.kind}`);
    if (lv.kind === 'refuge') for (const e of refugeLevelErrors(lv)) errs.push(`${id} ${e}`);
    if (!num(lv.elev)) err(`${at} elev`, 'required number');
    if (!num(lv.height) || lv.height <= 0) err(`${at} height`, 'required positive number');
    const m = /^(\d+)F$/.exec(lv.short || '');
    if (!str(lv.short)) err(`${at} short`, 'required');
    else if (m ? lv.levelNumber !== +m[1] : lv.levelNumber != null) err(`${at} levelNumber`, m ? `expected ${+m[1]}` : 'none on B/RF levels');
    const pieces = lv.slab?.pieces;
    if (!Array.isArray(pieces) || !pieces.length || !pieces.every((p) => isPoly(p.outer) && Array.isArray(p.holes) && isRect(p.localRect))) {
      err(`${at} slab`, 'required pieces [{outer, holes, localRect}]');
    }
    if (!Array.isArray(lv.voids)) err(`${at} voids`, 'required array');
    for (const v of lv.voids || []) {
      const ref = VOID_REF[v.kind];
      if (!ref) { err(`${at} voids`, `${v.id}: unexpected kind ${v.kind}`); continue; }
      if (!isPoly(v.poly)) err(`${at} voids`, `${v.id}: poly required`);
      const known = ref === 'stair' ? stairIds.has(v.stair) : ref === 'elevator' ? liftIds.has(v.elevator) : lv.units.some((u) => u.id === v.unit);
      if (!known) err(`${at} voids`, `${v.id}: ${ref} ${v[ref]} not found`);
      if (isPoly(v.poly) && Array.isArray(pieces)) {
        const c = polyCentroid(v.poly);
        const standable = pieces.some((p) => isPoly(p.outer) && pointInPoly(c, p.outer) && !(p.holes || []).some((h) => pointInPoly(c, h)));
        if (standable) err(`${at} slab`, `void ${v.id} must be a slab hole`);
      }
    }
    const cp = lv.corePlan;
    if (!cp || cp.kind !== 'community' || !cp.frame || !isRect(cp.core)
      || !Array.isArray(cp.landings) || !cp.landings.every((q) => str(q.id) && isRect(q.rect) && typeof q.open === 'boolean')
      || !Array.isArray(cp.lifts) || !cp.lifts.every((q) => str(q.id) && isRect(q.rect) && q.door != null)
      || !Array.isArray(cp.stairs) || !cp.stairs.every((q) => str(q.id) && isRect(q.rect) && q.door != null && isRect(q.shaftRect) && isRect(q.landingRect))) {
      err(`${at} corePlan`, "required {kind:'community', frame, core, landings, lifts, stairs}");
    }
    const [lobbyShort, lobbyKind] = LOBBY[b.community] || [];
    if (lv.short === lobbyShort) {
      const lp = lv.lobbyPlan;
      if (!lp || lp.kind !== lobbyKind || !lp.frame || !Array.isArray(lp.zones) || !lp.zones.every((z) => str(z.id) && str(z.kind) && str(z.name) && isRect(z.rect))
        || !['obstacles', 'partitions', 'circulation'].every((k) => Array.isArray(lp[k]))) {
        err(`${at} lobbyPlan`, `required {kind:'${lobbyKind}', frame, zones, obstacles, partitions, circulation}`);
      }
    }
    for (const u of lv.units) {
      const r = u.residence, ut = `unit ${u.id}`;
      if (r?.kind !== 'community') { err(`${ut} residence.kind`, "expected 'community'"); continue; }
      if (u.building !== id || u.level !== lid) err(`${ut} building`, 'must be this tower and level');
      if (r.community !== b.community) err(`${ut} residence.community`, `expected ${b.community}`);
      if (u.style !== 'residence' || u.brand?.cat !== 'community' || !str(u.code)) err(`${ut} brand`, 'made by communityUnit (style, brand.cat, code)');
      if (!Array.isArray(u.rects) || !u.frame || !Array.isArray(u.fronts) || !Array.isArray(u.wfronts)) err(`${ut} fronts`, 'rects, frame, fronts and wfronts required');
      if (!['flat', 'lower', 'upper'].includes(r.level)) err(`${ut} residence.level`, `unexpected ${r.level}`);
      if (!Array.isArray(r.homeLevels) || !r.homeLevels.includes(lid)) err(`${ut} residence.homeLevels`, 'must include its level');
      if (r.level === 'upper') {
        if (r.entryDoor !== null) err(`${ut} entryDoor`, 'must be null on an upper level');
        if (u.fronts?.length) err(`${ut} fronts`, 'must be [] on an upper level');
      } else if (!r.entryDoor) err(`${ut} entryDoor`, 'required');
      if (r.level !== 'flat') {
        const p = units.get(r.partner);
        if (!p || p.building !== id || p.residence?.partner !== u.id) err(`${ut} partner`, 'duplex levels must name each other');
      }
      if (r.level === 'lower') {
        if (!(r.obstacles || []).some((o) => o.id === 'home-stair-under-B')) err(`${ut} residence.obstacles`, 'home-stair-under-B missing (communityUnit)');
        const flights = (access?.flights || []).filter((f) => f.kind === 'interior-stair');
        const up = units.get(r.partner)?.level;
        if (!flights.some((f) => f.from === lid) || !flights.some((f) => f.to === up)) err('building.access', `${u.id}: duplex flights with kind 'interior-stair' required`);
      }
    }
  }

  // ---------- lifts ----------
  const lifts = layout.elevators.filter((e) => e.building === id || e.residentialCore === id);
  if (!lifts.length) err('lifts', 'none');
  for (const e of lifts) {
    const at = `lift ${e.id}`;
    if (e.tower !== true) err(`${at} tower`, 'expected true');
    if (e.residentialCore !== id) err(`${at} residentialCore`, `expected ${id}`);
    if (!str(e.label)) err(`${at} label`, 'required string');
    if (!LIFT_ROLES.has(e.role)) err(`${at} role`, `unexpected ${e.role}`);
    if (!Array.isArray(e.serves) || !e.serves.length || e.serves.some((lid) => !stairLevels.includes(lid))) err(`${at} serves`, 'must be host or own levels');
    if (e.fireOnly != null && (!Array.isArray(e.fireOnly) || e.fireOnly.some((lid) => !stairLevels.includes(lid) || e.serves?.includes(lid)))) err(`${at} fireOnly`, 'host or own levels that are not normal stops');
    // Passenger and private lifts pass refuge floors with no landing door (GB 55037 §7.1.15-3).
    if (!isFireLift(e)) for (const lid of e.serves || []) if (levelById.get(lid)?.kind === 'refuge') err(`${at} serves`, `${lid} is a refuge floor: only fire lifts land there`);
    if (north) {
      const stops = (e.serves || []).map(elevOf).filter(num), lo = Math.min(...stops), hi = Math.max(...stops);
      const passes = stairLevels.filter((lid) => elevOf(lid) >= lo && elevOf(lid) <= hi);
      if (!Array.isArray(e.shaftLevels) || passes.some((lid) => !e.shaftLevels.includes(lid))) err(`${at} shaftLevels`, 'must list every level the shaft passes');
    }
  }

  // ---------- stairs ----------
  const stairs = layout.stairs.filter((s) => s.building === id || s.residentialCore === id);
  if (!stairs.length) err('stairs', 'none');
  for (const s of stairs) {
    const at = `stair ${s.id}`;
    if (s.building !== id) err(`${at} building`, `expected ${id}`);
    if (s.residentialCore !== id) err(`${at} residentialCore`, `expected ${id}`);
    if (!Array.isArray(s.serves) || !s.serves.length || s.serves.some((lid) => !stairLevels.includes(lid))) err(`${at} serves`, 'must be host or own levels');
    if (north) {
      if (!Array.isArray(s.passLevels) || !sameSet(s.passLevels, NORTH_SITE.hostPassLevels)) err(`${at} passLevels`, 'must be the sealed host levels');
      if ((s.serves || []).some((lid) => NORTH_SITE.hostPassLevels.includes(lid))) err(`${at} serves`, 'door levels only');
    } else if (s.passLevels?.length) err(`${at} passLevels`, 'west stairs have none');
    if (s.continuous !== true) err(`${at} continuous`, 'expected true');
    if (!isRect(s.shaftRect)) err(`${at} shaftRect`, 'required rect');
    if (!isRect(s.landingRect)) err(`${at} landingRect`, 'required rect');
  }
  return errs;
}
