// 云澜社区住宅的门（“竖着的门板”修复）：每樘户内门的门扇开 90° 停在它所服务的房间里、贴墙停放，
// 入户门贴入户墙停放；门扇有门套与执手、不用木地板纹理；门扇是导航障碍物，但每个门洞都能走过、
// 每个房间都走得到；门扇不压床与家具，家具不挡门洞；1.8 m 以上的高柜不用木地板纹理。
// 最后用旧的门扇规则（铰链在 a 端、按 a→b 方向开）跑同样的判据，确认旧行为不能通过。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, walkNav, standable } from './helpers.js';
import { toL, toW, pointInPoly } from '../src/layout/geom.js';
import { buildNav } from '../src/layout/nav.js';
import { Batcher, BatchSet } from '../src/render/batch.js';
import { buildResidenceFloor } from '../src/render/build/residence-interiors.js';
import { DOOR, partitionAxis, doorSpan, bedRects, doorPassages, wallSegments, wallRect, inSwing } from '../src/layout/community-units.js';

const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
const base = new Proxy({}, { get: (m, k) => typeof k === 'string' ? (m[k] ||= Object.assign(new THREE.MeshBasicMaterial(), { name: k })) : undefined });

const CIRC = new Set(['hall', 'entry', 'dining', 'living', 'family', 'balcony']);
const SWING_ROLES = (p) => p.door && !['opening', 'balcony-slider', 'railing'].includes(p.role);
const ov = (a, b, pad = 0) => a.x0 < b.x1 - pad && b.x0 < a.x1 - pad && a.z0 < b.z1 - pad && b.z0 < a.z1 - pad;
const grow = (q, k) => ({ x0: q.x0 - k, z0: q.z0 - k, x1: q.x1 + k, z1: q.z1 + k });
const community = L.levels.filter((lv) => (lv.units || []).some((u) => u.residence?.kind === 'community'));
// West: every floor repeats the same plans (12F stands for all); north: every floor.
const probed = community.filter((lv) => /^T/.test(lv.building) || /-12F$/.test(lv.id));
/** One unit per distinct plan and level part (78). */
const distinct = (() => {
  const seen = new Map();
  for (const lv of community) for (const u of lv.units) { const r = u.residence; if (r?.kind === 'community' && !seen.has(r.plan + r.level)) seen.set(r.plan + r.level, { lv, u }); }
  return [...seen.values()];
})();

// ---------------------------------------------------------------------------
// Render probe: every batched box of a floor with its material key, colour and unit-local AABB.
function probeFloor(lv) {
  const rec = [], P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), M = new THREE.Matrix4(), Y = new THREE.Vector3(0, 1, 0);
  const getOrig = BatchSet.prototype.get, boxOrig = Batcher.prototype.box;
  BatchSet.prototype.get = function (key) { const b = getOrig.call(this, key); b.__key = key; return b; };
  Batcher.prototype.box = function (cx, cy, cz, sx, sy, sz, color, ry = 0) {
    const xf = this.owner ? this.owner.xf : this.xf;
    P.set(cx, cy, cz); Q.setFromAxisAngle(Y, ry); S.set(sx, sy, sz); M.compose(P, Q, S);
    const W = xf ? new THREE.Matrix4().multiplyMatrices(xf, M) : M.clone(), e = W.elements;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [e[12] + (e[0] * a + e[8] * b) / 2, e[14] + (e[2] * a + e[10] * b) / 2]);
    rec.push({ key: this.__key, color: String(color).toLowerCase(), size: [sx, sy, sz], c: [e[12], e[13], e[14]], corners, y: [e[13] - sy / 2 - lv.elev, e[13] + sy / 2 - lv.elev] });
    return boxOrig.call(this, cx, cy, cz, sx, sy, sz, color, ry);
  };
  try { buildResidenceFloor({ layout: L, mats: { base } }, { lv }).dispose(); } finally { BatchSet.prototype.get = getOrig; Batcher.prototype.box = boxOrig; }
  return rec;
}
/** A probed box in a unit's local frame (axis-aligned there: unit frames turn in 90° steps). */
const local = (u, b) => {
  const l = b.corners.map(([x, z]) => toL(u.frame, x, z)), xs = l.map((p) => p[0]), zs = l.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0: b.y[0], y1: b.y[1], key: b.key, color: b.color, size: b.size };
};
const WALL = new Set(['#eeeae1', '#e4ddd0', '#e6e0d2', '#ebe6db']);
const DOOR_COLORS = new Set(['#f4f1ea', '#ebe5d8', '#4b4844', '#615b54']);
const TV_WALL = new Set(['#8f6f52', '#d8cdb9']);
/** Per probed floor and unit: the home's boxes split into walls, door parts and furniture (unit-local). */
const floors = probed.map((lv) => {
  const rec = probeFloor(lv), units = lv.units.filter((u) => u.residence?.kind === 'community');
  return { lv, units: units.map((u) => {
    const mine = rec.filter((b) => pointInPoly([b.c[0], b.c[2]], u.polys[0])).map((b) => local(u, b));
    // Walls from the whole floor near the home: party and front walls straddle its outline (drawn once per floor).
    const near = rec.map((b) => local(u, b)).filter((b) => b.x1 > -.3 && b.x0 < u.residence.width + .3 && b.z1 > -.3 && b.z0 < u.residence.depth + .3);
    const leaves = (u.residence.doorLeaves || []).filter((l) => l.rect);
    const doorPart = (b) => DOOR_COLORS.has(b.color) || (b.key === 'metal' && leaves.some((l) => ov(b, grow(l.rect, .1)) && b.y0 > .9 && b.y1 < 1.1));
    const isWall = (b) => b.key === 'matte' && WALL.has(b.color) && b.y1 - b.y0 > .3;
    const walls = near.filter(isWall);
    const doors = mine.filter((b) => !isWall(b) && doorPart(b));
    const furniture = mine.filter((b) => !isWall(b) && !doors.includes(b) && b.y1 > .25 && b.y0 < 2.0 && b.y0 > -.05
      && !(b.key === 'glass' && Math.abs(b.size[1] - .95) < 1e-6));
    return { u, all: mine, walls, doors, furniture };
  }) };
});

// ---------------------------------------------------------------------------
// Predicates (each returns a list of violations), shared with the mutation check at the end.

/** Every leaf hangs within 5 cm of a jamb of its opening, stands at the wall face, fills the opening, ≤ wall height. */
function hingeViolations(res, wallH) {
  const out = [];
  for (const p of res.partitions.filter(SWING_ROLES)) {
    const l = p.door.leaf;
    if (!l) { out.push(`${p.id}: no leaf`); continue; }
    if (l.kind === 'pocket') continue;
    const s = partitionAxis(p), [g0, g1] = doorSpan(p), a = (pt) => s.axis === 'x' ? pt[0] : pt[1], n = (pt) => s.axis === 'x' ? pt[1] : pt[0];
    const jamb = l.side === 'lo' ? g0 : g1, hingeFace = a(l.hinge) + (l.side === 'lo' ? -1 : 1) * l.t / 2;
    if (Math.abs(hingeFace - jamb) > .05) out.push(`${p.id}: hinge ${Math.abs(hingeFace - jamb).toFixed(3)} m from the jamb`);
    if (Math.abs(Math.abs(n(l.hinge) - s.c) - .06) > .02) out.push(`${p.id}: hinge edge not at the wall face`);
    if (Math.abs(a(l.free) - a(l.hinge)) > 1e-3 || Math.abs(Math.abs(n(l.free) - n(l.hinge)) - l.w) > 1e-3) out.push(`${p.id}: leaf not at 90°`);
    if (l.w < g1 - g0 - .1 || l.w > g1 - g0) out.push(`${p.id}: leaf ${l.w} does not fill the ${(g1 - g0).toFixed(2)} m opening`);
    if (l.h > wallH || l.h < 2.0) out.push(`${p.id}: leaf height ${l.h}`);
  }
  return out;
}
/** Every leaf opens into the room the door serves: never a hall / living / dining / foyer / family room off a private room. */
function sideViolations(res) {
  const kind = (id) => res.rooms.find((r) => r.id === id)?.kind, out = [];
  for (const p of res.partitions.filter(SWING_ROLES)) {
    const l = p.door.leaf, other = p.id.split('/').find((id) => id !== l?.into);
    if (!l || l.kind === 'pocket') continue;
    if (!p.id.split('/').includes(l.into)) out.push(`${p.id}: leaf in a third room ${l.into}`);
    else if (CIRC.has(kind(l.into)) && kind(other) && !CIRC.has(kind(other))) out.push(`${p.id}: leaf in ${kind(l.into)} ${l.into}, not in ${kind(other)} ${other}`);
    // The leaf really lies in that room.
    const R = res.rooms.find((r) => r.id === l.into)?.rect;
    if (R && !(l.rect.x0 >= R.x0 - .01 && l.rect.x1 <= R.x1 + .01 && l.rect.z0 >= R.z0 - .01 && l.rect.z1 <= R.z1 + .01)) out.push(`${p.id}: leaf outside ${l.into}`);
  }
  return out;
}
/** Leaves (open, and their swing for beds and bedside tables) clear of beds, bedside tables, furniture boxes (0.25–2.0 m), walls and each other. */
function clashViolations(res, furniture = []) {
  const out = [], leaves = (res.doorLeaves || []).filter((l) => l.rect), walls = wallSegments(res).map(wallRect);
  const beds = bedRects(res);
  for (const l of leaves) {
    const core = grow(l.rect, -.005);
    for (const b of beds) { if (ov(core, b.rect)) out.push(`${l.id}: leaf on ${b.id}`); else if (inSwing(l, b.rect)) out.push(`${l.id}: ${b.id} in the leaf's swing`); }
    for (const f of furniture) if (ov(core, f, .005)) out.push(`${l.id}: leaf through ${f.key} ${f.color} ${f.size.map((v) => v.toFixed(2)).join('×')}`);
    for (const w of walls) if (ov(core, w)) out.push(`${l.id}: leaf through a wall`);
    for (const m of leaves) if (m !== l && ov(core, m.rect)) out.push(`${l.id}: leaf on leaf ${m.id}`);
  }
  return out;
}
/** Furniture in a doorway: passage = opening less 5 cm a side × 0.45 m on both sides, 0.2–1.8 m high. */
function doorwayViolations(res, furniture) {
  const out = [];
  for (const q of doorPassages(res, .45)) for (const f of furniture) {
    if (f.y0 < 1.8 && f.y1 > .2 && ov(q.rect, f, .01)) out.push(`${q.id}: ${f.key} ${f.color} ${f.size.map((v) => v.toFixed(2)).join('×')} in the doorway`);
  }
  return out;
}
/** Boxes ≥ 1.8 m tall in the oak floor-plank 'wood' material (only the TV feature wall may be). */
const tallWood = (boxes) => boxes.filter((b) => b.key === 'wood' && b.size[1] >= 1.8 - 1e-6 && !(TV_WALL.has(b.color) && Math.min(b.size[0], b.size[2]) <= .031));

// ---------------------------------------------------------------------------

test('门扇记录：78 个户型层每樘户内门与入户门都有门扇；铰链在门框 5 cm 内、开 90°、不高于墙；渲染的门扇与记录重合', () => {
  let doors = 0, rest = 0, pocket = 0, front = 0;
  for (const { lv, u } of distinct) {
    const res = u.residence, wallH = Math.max(2.6, lv.height - .3);
    assert.deepEqual(hingeViolations(res, wallH), [], `${u.code}`);
    for (const p of res.partitions.filter(SWING_ROLES)) { doors++; if (p.door.leaf.rest) rest++; if (p.door.leaf.kind === 'pocket') pocket++; }
    const e = res.entryDoor;
    if (res.level === 'upper') { assert.equal(e, null); continue; }
    front++;
    const l = e.leaf, [g0, g1] = [e.at - e.width / 2, e.at + e.width / 2];
    assert.ok(l && l.front && l.into && res.rooms.find((r) => r.id === l.into)?.kind === 'entry', `${u.code} 入户门扇不在玄关`);
    assert.ok(Math.abs(l.hinge[0] - (l.side === 'lo' ? g0 + DOOR.frontLining : g1 - DOOR.frontLining)) < .03, `${u.code} 入户门铰链不在门框上`);
    assert.ok(l.rest && l.rest.gap <= DOOR.gap + 1e-6, `${u.code} 入户门扇没有贴墙停放`);
  }
  assert.equal(doors, 707);
  // Design figures: almost every interior leaf parks against a wall; no pocket fallback needed today.
  assert.ok(rest / doors >= .95, `贴墙门扇 ${rest}/${doors}`);
  assert.equal(pocket, 0);
  assert.equal(front, 58);
  // Rendered: each swing leaf is one matte box at its record (leaf colour, h tall), never the floor-plank 'wood'.
  for (const { units } of floors) for (const { u, all } of units) for (const l of (u.residence.doorLeaves || []).filter((q) => q.rect)) {
    const hit = all.filter((b) => ['#ebe5d8', '#615b54'].includes(b.color) && Math.abs(b.x0 - l.rect.x0) < .002 && Math.abs(b.x1 - l.rect.x1) < .002 && Math.abs(b.z0 - l.rect.z0) < .002 && Math.abs(b.z1 - l.rect.z1) < .002);
    assert.equal(hit.length, 1, `${u.code} ${l.id} 门扇未按记录绘制`);
    assert.ok(Math.abs(hit[0].y1 - hit[0].y0 - l.h) < 1e-3 && hit[0].key !== 'wood', `${u.code} ${l.id} 门扇尺寸 / 材质`);
    // Two jambs and a head deeper than the wall, and a metal lever within 10 cm of the free edge at 0.9–1.1 m.
    const handle = all.filter((b) => b.key === 'metal' && b.y0 > .9 && b.y1 < 1.1 && Math.hypot((b.x0 + b.x1) / 2 - l.free[0], (b.z0 + b.z1) / 2 - l.free[1]) < .2);
    assert.ok(handle.length >= 1, `${u.code} ${l.id} 缺少执手`);
  }
});

test('门扇开向所服务的房间（卧室、卫生间、储藏、书房、厨房、衣帽间、家务间），不开进走廊、客餐厅或玄关', () => {
  for (const { u } of distinct) assert.deepEqual(sideViolations(u.residence), [], u.code);
});

test('门扇不压床、床头柜、家具、墙或别的门扇（渲染出的家具盒体逐一核对）', () => {
  let leaves = 0;
  for (const { units } of floors) for (const { u, furniture } of units) {
    leaves += (u.residence.doorLeaves || []).length;
    assert.deepEqual(clashViolations(u.residence, furniture), [], `${u.code}`);
  }
  assert.ok(leaves > 700, `${leaves}`);
});

test('家具不挡任何门洞、开口、推拉门或入户门（通行区 0.45 m × 两侧，0.2–1.8 m 高）', () => {
  for (const { units } of floors) for (const { u, furniture } of units) assert.deepEqual(doorwayViolations(u.residence, furniture), [], u.code);
});

test('1.8 m 及以上的盒体不用木地板纹理（wood），只有电视背景墙例外；高柜有门板缝与拉手，书架有书', () => {
  let cabinets = 0, books = 0;
  for (const { units } of floors) for (const { u, all } of units) {
    assert.deepEqual(tallWood(all).map((b) => `${b.color} ${b.size.map((v) => v.toFixed(2)).join('×')}`), [], u.code);
    cabinets += all.filter((b) => b.key === 'matte' && b.size[1] >= 1.8 && b.y0 < .2 && !WALL.has(b.color) && !DOOR_COLORS.has(b.color)).length;
    books += all.filter((b) => ['#7d937c', '#b7846c', '#6f7f99'].includes(b.color) && b.y0 > .05).length;
  }
  assert.ok(cabinets > 300 && books > 50, `${cabinets} 个高柜 / ${books} 排书`);
});

/** Whether the nav floor has an obstacle piece exactly over a unit-local rect (world bounds within 1 cm). */
function navObstacle(nav, floor, u, q) {
  const pts = [[q.x0, q.z0], [q.x1, q.z0], [q.x1, q.z1], [q.x0, q.z1]].map(([x, z]) => toW(u.frame, x, z));
  const bb = { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])) };
  return nav.floors.get(floor).obstacles.some((o) => ['x0', 'x1', 'z0', 'z1'].every((k) => Math.abs(o.bb[k] - bb[k]) < .01));
}

test('门扇是导航障碍物，每个门洞都能双向走过，每个房间都走得到（走廊净宽 ≥ 0.6 m）', () => {
  const nav = buildNav(L);
  for (const { lv, u } of distinct) {
    const res = u.residence, floor = lv.id, W = (x, z) => toW(u.frame, x, z);
    for (const l of (res.doorLeaves || []).filter((q) => q.rect)) assert.ok(navObstacle(nav, floor, u, l.rect), `${u.code} ${l.id} 门扇不是导航障碍物`);
    // Every doorway walked straight through its centre (0.45–1.0 m out on either side), both ways.
    const links = [];
    for (const p of res.partitions.filter((q) => q.door && q.role !== 'railing')) {
      const s = partitionAxis(p), [g0, g1] = doorSpan(p), c = (g0 + g1) / 2, at = (k) => s.axis === 'x' ? [c, s.c + k] : [s.c + k, c];
      const pick = (sgn) => [.45, .6, .8, 1.0].map((k) => at(sgn * k)).find((q) => standable(nav, floor, ...W(...q)));
      const a = pick(-1), b = pick(1);
      if (!a || !b) { assert.ok(p.role === 'balcony-slider', `${u.code} ${p.id} 门洞两侧站不住`); continue; }
      for (const [from, to] of [[a, b], [b, a]]) {
        const st = walkNav(nav, floor, W(...from), W(...to)), [tx, tz] = W(...to);
        assert.ok(st.floor === floor && Math.hypot(st.x - tx, st.z - tz) < .1, `${u.code} ${p.id} 走不过门洞（停在 ${st.x.toFixed(2)}, ${st.z.toFixed(2)}）`);
      }
      links.push([a, b]);
    }
    // The front door, from the landing into the foyer past the folded-back leaf, and out again.
    if (res.entryDoor) {
      const out = [res.entryDoor.at, -.6], inn = [res.entryDoor.at, .7];
      if (standable(nav, floor, ...W(...out))) for (const [from, to] of [[out, inn], [inn, out]]) {
        const st = walkNav(nav, floor, W(...from), W(...to)), [tx, tz] = W(...to);
        assert.ok(st.floor === floor && Math.hypot(st.x - tx, st.z - tz) < .1, `${u.code} 走不过入户门（停在 ${st.x.toFixed(2)}, ${st.z.toFixed(2)}）`);
      }
    }
    // Flood fill over standable points (walker radius 0.3 m), joined across every doorway walked above: every room is
    // reached from the entry (or an upper level's family room). A 0.2 m grid first; a room it misses (a walkway only a
    // few centimetres wider than the walker, e.g. past a bed's foot) is retried on a 0.1 m grid.
    const family = res.rooms.filter((r) => r.kind === 'family').sort((a, b) => (b.rect.x1 - b.rect.x0) * (b.rect.z1 - b.rect.z0) - (a.rect.x1 - a.rect.x0) * (a.rect.z1 - a.rect.z0))[0]?.rect;
    const origin = res.entryDoor ? [res.entryDoor.at, .7] : [(family.x0 + family.x1) / 2, (family.z0 + family.z1) / 2];
    const flood = (k) => {
      const cols = Math.ceil(res.width / k), rows = Math.ceil(res.depth / k), memo = new Int8Array(cols * rows), seen = new Uint8Array(cols * rows);
      const ok = (q) => { if (!memo[q]) memo[q] = standable(nav, floor, ...W((q % cols + .5) * k, (Math.floor(q / cols) + .5) * k)) ? 1 : -1; return memo[q] > 0; };
      /** Nearest standable cell to a local point (within 0.45 m). */
      const cellAt = ([x, z]) => {
        let best = -1, bd = .45;
        const n = Math.ceil(.45 / k);
        for (let i = Math.floor(x / k) - n; i <= Math.floor(x / k) + n; i++) for (let j = Math.floor(z / k) - n; j <= Math.floor(z / k) + n; j++) {
          if (i < 0 || j < 0 || i >= cols || j >= rows || !ok(i + j * cols)) continue;
          const d = Math.hypot((i + .5) * k - x, (j + .5) * k - z);
          if (d < bd) { bd = d; best = i + j * cols; }
        }
        return best;
      };
      const jump = new Map();
      for (const [a, b] of links) { const ca = cellAt(a), cb = cellAt(b); if (ca < 0 || cb < 0) continue; for (const [p, q] of [[ca, cb], [cb, ca]]) jump.set(p, [...(jump.get(p) || []), q]); }
      const start = cellAt(origin);
      assert.ok(start >= 0, `${u.code} 起点站不住`);
      const queue = [start]; seen[start] = 1;
      while (queue.length) {
        const q = queue.pop(), i = q % cols, j = Math.floor(q / cols);
        const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => (i + di < 0 || j + dj < 0 || i + di >= cols || j + dj >= rows) ? -1 : i + di + (j + dj) * cols);
        for (const n of [...next, ...(jump.get(q) || [])]) if (n >= 0 && !seen[n] && ok(n)) { seen[n] = 1; queue.push(n); }
      }
      return (r) => {
        for (let i = Math.floor(r.rect.x0 / k); i < Math.ceil(r.rect.x1 / k); i++) for (let j = Math.floor(r.rect.z0 / k); j < Math.ceil(r.rect.z1 / k); j++) {
          const x = (i + .5) * k, z = (j + .5) * k;
          if (x > r.rect.x0 && x < r.rect.x1 && z > r.rect.z0 && z < r.rect.z1 && seen[i + j * cols]) return true;
        }
        return false;
      };
    };
    const rooms = res.rooms.filter((q) => !['stair', 'void'].includes(q.kind));
    const coarse = flood(.2), missed = rooms.filter((r) => !coarse(r));
    if (missed.length) { const fine = flood(.1); for (const r of missed) assert.ok(fine(r), `${u.code} ${r.id}（${r.name}）走不到`); }
  }
});

test('挂画挂在墙上（背面离墙面 ≤ 3 cm，下沿高出边柜 ≥ 0.15 m）；北苑复式楼层盒体预算 ≤ 1,500、≤ 8 个网格', () => {
  let pictures = 0;
  for (const { units } of floors) for (const { u, all, walls } of units) {
    for (const p of all.filter((b) => b.color === '#3f3a34' && b.size[1] > .7 && b.size[1] < .8)) {
      pictures++;
      const thinX = p.x1 - p.x0 < p.z1 - p.z0;
      const gap = Math.min(...walls.filter((w) => thinX ? w.z0 < p.z1 && p.z0 < w.z1 : w.x0 < p.x1 && p.x0 < w.x1)
        .map((w) => thinX ? Math.max(w.x0 - p.x1, p.x0 - w.x1) : Math.max(w.z0 - p.z1, p.z0 - w.z1)).filter((g) => g > -.02), 9);
      assert.ok(gap <= .03, `${u.code} 挂画离墙 ${gap.toFixed(3)} m`);
      assert.ok(p.y0 >= .76 + .15, `${u.code} 挂画下沿 ${p.y0.toFixed(2)} m`);
    }
  }
  assert.ok(pictures >= 20, `${pictures} 幅挂画`);
  for (const id of ['T1-16F', 'T1-17F', 'T2-20F']) {
    const r = buildResidenceFloor({ layout: L, mats: { base } }, { lv: L.levels.find((l) => l.id === id) });
    let meshes = 0, tris = 0;
    r.group.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    r.dispose();
    assert.ok(meshes <= 8 && tris / 12 <= 1500, `${id} ${meshes} 网格 / ${tris / 12} 盒`);
  }
});

test('反证：旧门扇规则（铰链固定在 a 端、按 a→b 方向开、木地板纹理、不进导航）通不过上面的判据', () => {
  // Rebuild W1-1201's and T1-16F's leaves the old way: hinge at d0 + 0.03, swing to (dz, −dx), at the generator's position.
  let side = 0, clash = 0, hinge = 0;
  for (const { units } of floors.filter((f) => ['W1-12F', 'T1-16F', 'T1-17F', 'T1-10F'].includes(f.lv.id))) for (const { u, furniture } of units) {
    const res = structuredClone(u.residence);
    res.obstacles = res.obstacles.filter((o) => !o.id.startsWith('door-leaf/'));
    for (const b of res.beds) delete b.tables;
    res.doorLeaves = [];
    for (const p of res.partitions.filter(SWING_ROLES)) {
      if (p.door.planAt != null) p.door.at = p.door.planAt;
      const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]), dx = (p.b[0] - p.a[0]) / len, dz = (p.b[1] - p.a[1]) / len;
      const d0 = Math.max(0, p.door.at - p.door.width / 2), d1 = Math.min(len, p.door.at + p.door.width / 2), w = d1 - d0 - .06;
      const hx = p.a[0] + dx * (d0 + .03), hz = p.a[1] + dz * (d0 + .03), fx = hx + dz * w, fz = hz - dx * w;
      const R = res.rooms.find((r) => (hx + fx) / 2 > r.rect.x0 && (hx + fx) / 2 < r.rect.x1 && (hz + fz) / 2 > r.rect.z0 && (hz + fz) / 2 < r.rect.z1);
      const rect = { x0: Math.min(hx, fx) - .02 * Math.abs(dx), x1: Math.max(hx, fx) + .02 * Math.abs(dx), z0: Math.min(hz, fz) - .02 * Math.abs(dz), z1: Math.max(hz, fz) + .02 * Math.abs(dz) };
      p.door.leaf = { id: p.id, kind: 'swing', into: R?.id, side: 'lo', t: .04, w, h: 2.08, hinge: [hx, hz], free: [fx, fz], rect };
      res.doorLeaves.push(p.door.leaf);
    }
    side += sideViolations(res).length;
    clash += clashViolations(res, furniture).length;
    hinge += hingeViolations(res, 2.7).length;
  }
  assert.ok(side > 20, `旧规则开错房间 ${side}`);
  assert.ok(clash > 0, `旧规则压家具 ${clash}`);
  assert.ok(hinge > 0, `旧规则铰链 / 尺寸 ${hinge}`);
  // The old plank: a 2.08 m box in the floor-plank material.
  assert.equal(tallWood([{ key: 'wood', color: '#d8c4a3', size: [.04, 2.08, .84] }]).length, 1);
  // The old shoe cabinet stood across the foyer-to-hall opening of W1-1201.
  const w1 = floors.find((f) => f.lv.id === 'W1-12F').units.find(({ u }) => u.code === 'W1-1201');
  const old = { x0: 6.1 + .03, x1: 6.1 + .41, z0: .9 - .7, z1: .9 + .7, y0: 0, y1: 2, key: 'wood', color: '#e1d4bd', size: [.38, 2, 1.4] };
  assert.ok(doorwayViolations(w1.u.residence, [old]).length > 0, '旧鞋柜位置应挡住门洞');
  // Leaves left out of the nav: the obstacle check catches it.
  const lv = L.levels.find((l) => l.id === 'W1-12F'), unit = lv.units.find((u) => u.code === 'W1-1201');
  const kept = unit.residence.obstacles;
  try {
    unit.residence.obstacles = kept.filter((o) => !o.id.startsWith('door-leaf/'));
    const nav = buildNav(L), l = unit.residence.doorLeaves.find((q) => q.id === 'bed_3/hall_right');
    assert.ok(!navObstacle(nav, lv.id, unit, l.rect), '去掉门扇障碍后不应再有门扇障碍物');
  } finally { unit.residence.obstacles = kept; }
});
