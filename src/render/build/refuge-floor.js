// 避难层室内（supertall P0b · SPEC §2.2）：按 lv.refugePlan 画避难区地面（蓝灰环氧 + 黄色边线）、设备间
// （2.00 h / 3.00 h 墙体、水箱 / 水泵 / 风机）、防火隔间、消火栓箱 / 软管卷盘 / 灭火器 / 消防电话 / 广播 / 标识、
// 百叶背板与乙级防火窗、消防电梯停靠牌。一层一个组，≤ 3k 顶点，经楼层 LRU 到访时才建（app.js ensureTowerFloor）。
//
// refugePlan（SPEC §2.1，P0a refuge.js）：{ frame?, face, areas: [{ id, name, poly, rect?, net }],
//   plant: [{ id, name, poly, rect?, rating, contents }], vestibules: [{ name, poly, doors }],
//   windows: [{ edge, span, kind: 'fire-window-B' | 'louvre' }], fixtures: [{ kind, x, z, label }], outrigger, … }
// poly 与 fixtures 的 x / z 是世界坐标；windows 的 edge / span 按塔楼坐标系的外轮廓（lv.slab 的 localRect 或 footprint）。
import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { toW } from '../../layout/geom.js';

export const REFUGE_COLORS = Object.freeze({
  floor: '#7f97a3', edge: '#e1b63a', wall2h: '#c9c6bd', wall3h: '#b4ada1', tank: '#8b9da5', pump: '#3d6b8c', fan: '#9aa2a3',
  pipe: '#b5463b', hydrant: '#c0392b', sign: '#4caf72', phone: '#d24b3b', pa: '#e5e1d6', louvre: '#5b6164', fireFrame: '#a8352c',
});
export const REFUGE_FLOOR_MAX_VERTICES = 3000;

const boundsOf = (poly) => ({ x0: Math.min(...poly.map((p) => p[0])), x1: Math.max(...poly.map((p) => p[0])), z0: Math.min(...poly.map((p) => p[1])), z1: Math.max(...poly.map((p) => p[1])) });
const box = (B, key, r, y0, y1, color) => B.get(key).box((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, y1 - y0, r.z1 - r.z0, color);
const inset = (r, d) => ({ x0: r.x0 + d, x1: r.x1 - d, z0: r.z0 + d, z1: r.z1 - d });

/** World rect of a plan item: its poly's bounds (tower frames are axis-aligned), else its local rect in plan.frame. */
function worldRect(item, frame) {
  if (item.poly?.length) return boundsOf(item.poly);
  if (item.rect && frame) return boundsOf([[item.rect.x0, item.rect.z0], [item.rect.x1, item.rect.z1]].map((p) => toW(frame, ...p)));
  return item.rect || null;
}

/** Plant contents → equipment boxes inside a plant room rect r (world). */
function equipment(B, r, y, h, contents = []) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const has = (k) => contents.some((c) => String(c).includes(k));
  if (has('tank') || has('水箱')) { // fire-water transfer / break tank: a panel tank on plinths
    const t = inset(r, Math.min(w, d) * .18);
    box(B, 'concrete', { ...t, z1: t.z0 + .25 }, y, y + .2, '#9a9d98');
    box(B, 'extSatin', t, y + .2, y + Math.min(h - .8, 2.6), REFUGE_COLORS.tank);
  }
  if (has('pump') || has('水泵') || has('PRV')) for (let k = 0; k < 2; k++) { // pump sets with their red mains
    const x = r.x0 + w * (.3 + .4 * k);
    box(B, 'extSatin', { x0: x - .45, x1: x + .45, z0: r.z1 - 1.3, z1: r.z1 - .5 }, y, y + .9, REFUGE_COLORS.pump);
    box(B, 'extMetal', { x0: x - .08, x1: x + .08, z0: r.z0 + .3, z1: r.z1 - .4 }, y + 1.25, y + 1.41, REFUGE_COLORS.pipe);
  }
  if (has('fan') || has('风机') || has('新风') || has('AHU')) { // pressurisation fans / AHUs
    box(B, 'extSatin', { x0: cx - Math.min(1.6, w * .3), x1: cx + Math.min(1.6, w * .3), z0: cz - .7, z1: cz + .7 }, y, y + 1.5, REFUGE_COLORS.fan);
    box(B, 'extMetal', { x0: cx - .5, x1: cx + .5, z0: cz - .5, z1: cz + .5 }, y + 1.5, Math.min(y + h - .3, y + 2.8), '#7c8486');
  }
  if (has('electrical') || has('配电')) box(B, 'extSatin', { x0: r.x0 + .2, x1: Math.min(r.x1 - .2, r.x0 + 2.6), z0: r.z0 + .1, z1: r.z0 + .7 }, y, y + 2.1, '#d8d6cf');
}

/** One fixture (world x, z): 消火栓箱, 软管卷盘, 灭火器, 消防电话, 应急广播, 避难层 sign. */
function fixture(B, f, y) {
  const r = (w, d) => ({ x0: f.x - w / 2, x1: f.x + w / 2, z0: f.z - d / 2, z1: f.z + d / 2 });
  if (f.kind === 'hydrant') { box(B, 'extSatin', r(.75, .24), y + .2, y + 1.8, REFUGE_COLORS.hydrant); box(B, 'glassTint', r(.6, .26), y + .35, y + 1.65, '#ffffff'); }
  else if (f.kind === 'hose-reel') B.get('extSatin').cyl(f.x, y + 1.0, f.z, .32, .16, REFUGE_COLORS.hydrant, 12);
  else if (f.kind === 'extinguisher') for (const dx of [-.12, .12]) B.get('extSatin').cyl(f.x + dx, y, f.z, .09, .55, REFUGE_COLORS.hydrant, 8);
  else if (f.kind === 'fire-phone') box(B, 'extSatin', r(.22, .1), y + 1.3, y + 1.6, REFUGE_COLORS.phone);
  else if (f.kind === 'pa') box(B, 'extSatin', r(.3, .3), y + 2.7, y + 2.85, REFUGE_COLORS.pa);
  else box(B, 'glowSoft', r(.9, .06), y + 2.3, y + 2.6, REFUGE_COLORS.sign);
}

/** Louvre backs and 乙级 fire windows on the plan's façade windows (edge / span along the slab rect, tower frame). */
function windows(B, plan, lv, frame, y, h) {
  const fp = lv.slab?.pieces?.[0]?.localRect;
  if (!fp || !frame) return;
  for (const w of plan.windows || []) {
    const [a, z] = w.span, side = w.edge, alongX = side === 'N' || side === 'S';
    const line = { N: fp.z0, S: fp.z1, W: fp.x0, E: fp.x1 }[side], inward = side === 'N' || side === 'W' ? 1 : -1;
    const at = (t, off) => toW(frame, ...(alongX ? [t, line + inward * off] : [line + inward * off, t]));
    const p = at(a, .35), q = at(z, .35), r = boundsOf([p, q]), thick = alongX ? { z0: r.z0 - .04, z1: r.z1 + .04 } : { x0: r.x0 - .04, x1: r.x1 + .04 };
    if (w.kind === 'louvre') box(B, 'extSatin', { ...r, ...thick }, y + .3, y + h - .4, REFUGE_COLORS.louvre);
    else {
      box(B, 'extMetal', { ...r, ...thick }, y + .9, y + .98, REFUGE_COLORS.fireFrame);
      box(B, 'extMetal', { ...r, ...thick }, y + 2.42, y + 2.5, REFUGE_COLORS.fireFrame);
    }
  }
}

/**
 * Refuge-floor interior of level record L (ctx.levels entry, or the level itself): { group, dispose, vertices }; the
 * caller adds the group under L.base (as for buildResidenceFloor).
 * Built lazily (the floor LRU), so towers that are not visited pay nothing.
 */
export function buildRefugeFloor(ctx, L) {
  const lv = L.lv || L, plan = lv.refugePlan, group = new THREE.Group();
  group.name = `${lv.id}-refuge-floor`;
  if (!plan) return { group, dispose() {}, vertices: 0 };
  const frame = plan.frame || ctx.bById?.[lv.building]?.frame || null, y = lv.elev, h = lv.height || 4.5;
  const B = new BatchSet(ctx.mats.base);
  B.frame(null, () => {
    for (const a of plan.areas || []) {
      const r = worldRect(a, frame);
      if (!r) continue;
      box(B, 'concrete', r, y - .01, y + .012, REFUGE_COLORS.floor);
      // Yellow safety edge line round the 避难区 (4 thin strips).
      for (const s of [{ ...r, z1: r.z0 + .08 }, { ...r, z0: r.z1 - .08 }, { ...r, x1: r.x0 + .08 }, { ...r, x0: r.x1 - .08 }]) box(B, 'extSatin', s, y + .012, y + .018, REFUGE_COLORS.edge);
    }
    for (const p of plan.plant || []) {
      const r = worldRect(p, frame);
      if (!r) continue;
      const col = p.rating === '3.00h' ? REFUGE_COLORS.wall3h : REFUGE_COLORS.wall2h, t = p.rating === '3.00h' ? .3 : .2;
      // Four walls (the room is solid: no door; it is entered through the 防火隔间), then its plant.
      for (const s of [{ ...r, z1: r.z0 + t }, { ...r, z0: r.z1 - t }, { ...r, x1: r.x0 + t, z0: r.z0 + t, z1: r.z1 - t }, { ...r, x0: r.x1 - t, z0: r.z0 + t, z1: r.z1 - t }]) box(B, 'concrete', s, y, y + h - .35, col);
      equipment(B, inset(r, t + .15), y, h, p.contents);
    }
    for (const v of plan.vestibules || []) {
      const r = worldRect(v, frame);
      if (r) box(B, 'stone', r, y - .005, y + .01, '#cfd3cf');
    }
    for (const f of plan.fixtures || []) fixture(B, f, y);
    windows(B, plan, lv, frame, y, h);
  });
  B.flush(group);
  let vertices = 0;
  group.traverse((o) => { if (o.isMesh) vertices += o.geometry.attributes.position.count; });
  return { group, vertices, dispose() { group.traverse((o) => o.geometry?.dispose?.()); }, update() {} };
}
