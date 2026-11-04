// 云澜·北苑穿过一期的住户核心筒：电梯井与楼梯间的石材围护（穿越层整体封闭）、开门层的候梯厅、
// 一期 1F 住户大堂（石材地面、墙板、礼宾台、信报柜、街门与雨棚、导视）、地库电梯厅与消防登高场地标线。
// 全部写入宿主楼层已有的批次（batch / facadeBatch / signs），不增加绘制调用。
import { NORTH_CORE } from '../../layout/north-towers.js';
import { NORTH_ACCESS } from '../../layout/residential-access.js';
import { NORTH_SITE } from '../../layout/community-sites.js';
import { distToPolyEdge } from '../../layout/geom.js';
import { clearHeight } from './shell.js';

const STONE = '#cfc6b8', CONCRETE = '#c3c8cc', FLOOR = '#ddd5c7', TRIM = '#3a332b', BRONZE = '#8a7a5c';
const r = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });
const rw = (q) => q.x1 - q.x0, rd = (q) => q.z1 - q.z0, cx = (q) => (q.x0 + q.x1) / 2, cz = (q) => (q.z0 + q.z1) / 2;

/** Thin wall along an axis-aligned local segment, with openings [a, b] along it. */
function wallRun(G, key, x0, z0, x1, z1, y0, h, t, color, openings = []) {
  const alongX = Math.abs(z1 - z0) < 1e-6, lo = alongX ? Math.min(x0, x1) : Math.min(z0, z1), hi = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  let ivs = [[lo, hi]];
  for (const [a, b] of openings) ivs = ivs.flatMap(([p, q]) => [[p, Math.min(q, a)], [Math.max(p, b), q]]).filter(([p, q]) => q - p > .01);
  for (const [a, b] of ivs) {
    if (alongX) G.get(key).box((a + b) / 2, y0 + h / 2, z0, b - a, h, t, color);
    else G.get(key).box(x0, y0 + h / 2, (a + b) / 2, t, h, b - a, color);
  }
}

export function buildResidentialCores(ctx) {
  const towers = ctx.layout.buildings.filter((b) => b.community === 'north' && b.hostLevels?.length);
  const stats = { boxes: 0, levels: 0 };
  for (const b of towers) {
    const stairs = ctx.layout.stairs.filter((s) => s.residentialCore === b.id);
    const lifts = ctx.layout.elevators.filter((e) => e.residentialCore === b.id);
    for (const id of b.hostLevels) {
      const L = ctx.levels[id], lv = ctx.lvById[id];
      if (!L || !lv) continue;
      const door = NORTH_SITE.hostDoorLevels.includes(id);
      const garage = lv.kind === 'parking', H = clearHeight(lv), y0 = lv.elev;
      const B = counted(L.batch, stats);
      B.frame(b.frame, () => core(B, lv, { door, garage, H, y0, stairs, lifts }));
      if (door) residents(ctx, L, lv, b, B, { garage, H, y0 });
      stats.levels++;
    }
  }
  hardstandPaint(ctx, stats);
  ctx.residentialCoreStats = stats;
  return stats;
}

/** Count boxes written (used by the mobile-cost test). */
function counted(B, stats) {
  return { frame: (F, fn) => B.frame(F, fn), get: (k) => { const g = B.get(k); return { box: (...a) => { stats.boxes++; g.box(...a); } }; } };
}

function core(B, lv, { door, garage, H, y0, stairs, lifts }) {
  const C = NORTH_CORE, clad = garage ? CONCRETE : STONE, t = .2, h = H;
  const band = C.band;
  // Perimeter: the column is a closed stone box on pass levels; on door levels the
  // landing band opens to the lobby / foyer on the west (tower-local x = −4).
  const westOpen = door ? [[band.z0 + .2, band.z1 - .2]] : [];
  wallRun(B, 'stone', C.rect.x0 + t / 2, C.rect.z0, C.rect.x0 + t / 2, C.rect.z1, y0, h, t, clad, westOpen);
  wallRun(B, 'stone', C.rect.x1 - t / 2, C.rect.z0, C.rect.x1 - t / 2, C.rect.z1, y0, h, t, clad);
  wallRun(B, 'stone', C.rect.x0, C.rect.z0 + t / 2, C.rect.x1, C.rect.z0 + t / 2, y0, h, t, clad);
  wallRun(B, 'stone', C.rect.x0, C.rect.z1 - t / 2, C.rect.x1, C.rect.z1 - t / 2, y0, h, t, clad);
  if (!door) {
    // Sealed: a fire-rated cap line at mid height reads the column as solid from both sides.
    B.get('matte').box(0, y0 + h + .015, 0, rw(C.rect), .03, rd(C.rect), '#5d5650');
    return;
  }
  // Lift lobby floor and the two fronts: lifts (north) and stairs (south).
  B.get('stone').box(cx(band), y0 + .012, cz(band), rw(band), .024, rd(band), FLOOR);
  const liftDoors = lifts.map((e) => [e.lu - .55, e.lu + .55]);
  wallRun(B, 'stone', band.x0, band.z0 - .1, band.x1, band.z0 - .1, y0, h, .2, clad, liftDoors);
  for (const e of lifts) {
    const serves = e.serves.includes(lv.id);
    B.get('metal').box(e.lu, y0 + 1.15, band.z0 + .01, 1.3, 2.35, .06, '#5f666d');
    B.get('satin').box(e.lu, y0 + 1.1, band.z0 + .03, 1.1, 2.2, .04, serves ? '#c9ced3' : clad);
    if (serves) B.get('glow').box(e.lu, y0 + 2.5, band.z0 + .05, .5, .16, .02, e.role === 'fire' ? '#ff7a45' : '#d9c39a');
  }
  const stairDoors = stairs.map((s) => [s.door.x0, s.door.x1]);
  wallRun(B, 'stone', band.x0, band.z1 + .1, band.x1, band.z1 + .1, y0, h, .2, clad, stairDoors);
  for (const s of stairs) {
    const m = (s.door.x0 + s.door.x1) / 2, w = s.door.x1 - s.door.x0;
    B.get('metal').box(m, y0 + 2.15, band.z1 + .05, w + .12, .1, .26, TRIM);
    B.get('satin').box(s.door.x1 - .03, y0 + 1.05, band.z1 + .02 + w / 2, .05, 2.1, w, '#9aa3a8');   // fire door parked open
    B.get('glow').box(m, y0 + 2.42, band.z1 - .02, .42, .16, .03, '#18c26a');                        // 安全出口
  }
  // Stair enclosures behind the doors: side walls and the rear wall to the shaft.
  for (const s of stairs) wallRun(B, 'stone', s.rect.x0 + .1, s.rect.z0, s.rect.x0 + .1, s.rect.z1, y0, h, .2, clad);
}

function residents(ctx, L, lv, b, B, { garage, H, y0 }) {
  const A = NORTH_ACCESS[b.id], n = b.id.slice(1);
  const atlas = ctx.atlas?.[lv.id], cell = (id) => atlas?.cell?.(id);
  const floors = garage ? [A.foyer] : [...A.lobby, A.vestibule];
  for (const q of floors) B.get('stone').box(cx(q), y0 + .012, cz(q), rw(q), .024, rd(q), garage ? '#cfd2d4' : FLOOR);
  const walls = garage ? [] : A.lobbyWalls;
  // Interior wall panels (the façade itself is the mall's): skip runs on the P1 outline.
  for (const s of walls) {
    const mid = [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];
    if (lv.outline && distToPolyEdge(mid, lv.outline) < .3) continue;
    wallRun(B, 'stone', s.x0, s.z0, s.x1, s.z1, y0, H, .12, '#e6dfd2');
  }
  if (garage) for (const s of NORTH_ACCESS[b.id].garageWalls) wallRun(B, 'stone', s.x0, s.z0, s.x1, s.z1, y0, H, .15, CONCRETE);
  if (!garage) {
    const [, , desk] = A.fixtures.find((f) => f[0] === 'desk'), [, , lockers] = A.fixtures.find((f) => f[0] === 'lockers');
    B.get('satin').box(cx(desk), y0 + .52, cz(desk), rw(desk), 1.04, rd(desk), '#6f5a44');
    B.get('stone').box(cx(desk), y0 + 1.07, cz(desk), rw(desk) + .06, .06, rd(desk) + .06, '#efe9df');
    B.get('glow').box(cx(desk), y0 + .2, cz(desk), rw(desk) - .2, .04, rd(desk) + .02, '#ffe2b0');
    B.get('metal').box(cx(lockers), y0 + 1.1, cz(lockers), rw(lockers), 2.2, rd(lockers), '#8d949a');
    for (let z = lockers.z0 + .4; z < lockers.z1 - .2; z += .8) B.get('glow').box(cx(lockers), y0 + 1.95, z, rw(lockers) + .02, .03, .5, '#cfe8ff');
    streetDoor(L, A, y0);
  }
  // Header over the gate opening (mall portal / garage door): stone lintel and a bronze transom.
  for (const g of ctx.layout.accessControl?.gates || []) {
    if (!g.floors.includes(lv.id) || g.zone !== `${b.id}-${lv.short}` || g.id.endsWith('STREET-GATE')) continue;
    B.frame(g.frame, () => {
      const span = g.line.u1 - g.line.u0, cu = (g.line.u0 + g.line.u1) / 2;
      B.get('stone').box(cu, y0 + (3.05 + H) / 2, .06, span, H - 3.05, .24, garage ? CONCRETE : STONE);
      B.get('metal').box(cu, y0 + 3.02, -.08, span + .1, .08, .1, BRONZE);
    });
  }
  // Wayfinding: residents' sign over the mall gate / garage door, lobby name inside the street door.
  const S = L.signs;
  if (S && atlas) {
    const g = ctx.layout.accessControl?.gates.find((q) => q.zone === `${b.id}-${lv.short}` && q.kind === (garage ? 'glass-door' : 'speed-gates'));
    if (g) {
      const mid = g.line.u1 / 2, F = g.frame;
      const [x, z] = [F.ox + mid * F.c + 0.3 * F.s, F.oz + mid * F.s - 0.3 * F.c];
      const side = facing(-F.s, F.c, true);
      S.place(x, y0 + 2.75, z, 3.5, .5, side, cell(`res-${b.id}-${garage ? 'garage' : 'mall'}`));
    }
    if (!garage) {
      const x = (A.street.x0 + A.street.x1) / 2;
      S.place(x, y0 + 3.1, -237.5, 2.8, .4, 'S', cell(`res-${b.id}-lobby`));
      L.facadeSigns?.place(x, y0 + 4.75, -242.45, 3.2, .46, 'N', cell(`res-${b.id}-name`));
    }
  }
  void n;
}

/** Side ('N'|'S'|'E'|'W') of the normal (nx, nz); public side when flip. */
function facing(nx, nz, flip) {
  const [x, z] = flip ? [-nx, -nz] : [nx, nz];
  return Math.abs(x) > Math.abs(z) ? (x > 0 ? 'E' : 'W') : (z > 0 ? 'S' : 'N');
}

/** Automatic street doors parked open, transom and a 2.4 m glass canopy at y 4.2 (in the façade batch). */
function streetDoor(L, A, y0) {
  const F = L.facadeBatch, { x0, x1 } = A.street, w = x1 - x0, c = (x0 + x1) / 2;
  for (const s of [-1, 1]) {
    F.get('glassTint').box(c + s * (w / 2 + w / 4 + .05), y0 + 1.25, -239.92, w / 2, 2.5, .03, 0xffffff);
    F.get('extMetal').box(c + s * (w / 2 + .03), y0 + 1.5, -239.9, .06, 3.0, .1, BRONZE);
  }
  F.get('extMetal').box(c, y0 + 3.05, -239.9, w + .12, .1, .12, BRONZE);
  F.get('glassTint').box(c, y0 + 3.6, -239.93, w + .12, 1.0, .03, 0xffffff);
  // Narrow enough to keep clear of the 方庭北门 canopy next to the T2 door.
  const cw = w + 1.2, d = 2.4;
  F.get('glassTint').box(c, y0 + 4.2, -240 - d / 2, cw, .04, d, 0xffffff);
  F.get('extMetal').box(c, y0 + 4.16, -240 - d + .04, cw + .08, .14, .08, BRONZE);
  for (const s of [-1, 1]) {
    F.get('extMetal').box(c + s * cw / 2, y0 + 4.16, -240 - d / 2, .08, .14, d, BRONZE);
    // tie rods back to the façade
    F.get('extMetal').box(c + s * (cw / 2 - .3), y0 + 4.9, -240 - d / 2 + .1, .04, 1.45, .04, '#5b5045');
  }
  F.get('extMetal').box(c, y0 + 4.75, -242.4, 3.4, .56, .06, '#2f2a24');
}

/** Fire-truck hardstands HS1 / HS2: yellow border and hatching on the 北外环 frontage. */
function hardstandPaint(ctx, stats) {
  const B = ctx.site?.batch;
  if (!B) return;
  for (const f of ctx.layout.site.fireAccess || []) {
    if (!f.tower) continue;
    const q = r(f.rect.x0, f.rect.z0, f.rect.x1, f.rect.z1), y = .035, c = '#e2b33a';
    B.get('ext').box(cx(q), y, q.z0 + .1, rw(q), .02, .2, c); B.get('ext').box(cx(q), y, q.z1 - .1, rw(q), .02, .2, c);
    B.get('ext').box(q.x0 + .1, y, cz(q), .2, .02, rd(q), c); B.get('ext').box(q.x1 - .1, y, cz(q), .2, .02, rd(q), c);
    for (let x = q.x0 + 2; x < q.x1 - 1; x += 2) B.get('ext').box(x, y, cz(q), .12, .02, rd(q) - .6, '#d6a72f', Math.PI / 4);
    stats.boxes += 4 + Math.floor((rw(q) - 3) / 2);
  }
}
