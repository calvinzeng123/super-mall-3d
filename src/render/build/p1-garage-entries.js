// 一期 B1 停车场里通往商场的入口（游览模式）：原来 B1 → B1M 的扶梯直接立在车库里，只有一块灰色地面和一个浮着的标签，
// 走到跟前才知道这里能上商场。每组扶梯脚下朝车库的那一头做一个入口门头：两根米白立柱、一道发光门楣
// （「云澜汇 购物中心入口 / B1M 美食广场 · 1F–6F」，两面都有）、门厅地面换成暖色石材加金色收边、两侧花箱、顶上一条暖光灯带。
import * as THREE from 'three';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { pointInPoly } from '../../layout/geom.js';

const GOLD = '#c8a25a', CREAM = '#efe9df', WARM = '#ffd9a0';

export function buildP1GarageEntries(ctx) {
  if (!ctx.depthCues || ctx.layout.playable) return;
  const lv = ctx.layout.levels.find((l) => l.id === 'P1-B1'), L = lv && ctx.levels[lv.id];
  if (!L) return;
  const mat = ctx.mats.sign(entryTexture(ctx));
  const pairs = new Map();
  for (const e of ctx.layout.escalators.filter((q) => q.from === lv.id && q.to === 'P1-B1M')) {
    const k = e.pair || e.id;
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k).push(e);
  }
  const portals = [];
  for (const list of pairs.values()) {
    const bx = list.reduce((a, e) => a + e.bottom.x, 0) / list.length, bz = list.reduce((a, e) => a + e.bottom.z, 0) / list.length;
    const tx = list.reduce((a, e) => a + e.top.x, 0) / list.length, tz = list.reduce((a, e) => a + e.top.z, 0) / list.length;
    const hall = lv.walk.find((w) => w.kind === 'eschall' && pointInPoly([bx, bz], w.poly));
    if (!hall) continue;
    const len = Math.hypot(tx - bx, tz - bz), dx = (tx - bx) / len, dz = (tz - bz) / len, px = -dz, pz = dx;
    // 门厅横向范围：门厅多边形在扶梯横向上的投影
    const across = hall.poly.map(([x, z]) => (x - bx) * px + (z - bz) * pz), along = hall.poly.map(([x, z]) => (x - bx) * dx + (z - bz) * dz);
    const a0 = Math.min(...across), a1 = Math.max(...across), back = Math.min(...along);
    const w = a1 - a0 - 0.3, mid = (a0 + a1) / 2;
    // 门头立在门厅朝车库的那一头（扶梯脚往后，离门厅边 0.3 米），扶梯下端前面至少留 3 米
    const s = Math.max(back + 0.3, -6), cx = bx + dx * s + px * mid, cz = bz + dz * s + pz * mid;
    portal(ctx, L, lv, mat, { cx, cz, dx, dz, px, pz, w, hall });
    portals.push({ pair: list[0].pair, x: +cx.toFixed(2), z: +cz.toFixed(2), width: +w.toFixed(2) });
  }
  ctx.p1GarageEntries = portals;
}

function portal(ctx, L, lv, mat, { cx, cz, dx, dz, px, pz, w, hall }) {
  const B = L.batch, y0 = lv.elev, H = lv.height - 0.45, ang = Math.atan2(-pz, px); // 局部 x 轴沿门头横向
  const at = (u, v) => [cx + px * u + dx * v, cz + pz * u + dz * v];
  // 门厅地面：暖色石材 + 一圈金色收边（盖在原来的灰色地面上）
  const r = hall.rect;
  B.frame(hall.frame, () => {
    const fw = r.x1 - r.x0 - 0.5, fd = r.z1 - r.z0 - 0.5, fx = (r.x0 + r.x1) / 2, fz = (r.z0 + r.z1) / 2;
    B.get('stone').box(fx, y0 + 0.016, fz, fw, 0.01, fd, '#e3d8c6');
    for (const o of [-1, 1]) {
      B.get('facadeBronze').box(fx, y0 + 0.018, fz + o * (fd / 2 - 0.05), fw, 0.01, 0.06, GOLD);
      B.get('facadeBronze').box(fx + o * (fw / 2 - 0.05), y0 + 0.018, fz, 0.06, 0.01, fd, GOLD);
    }
  });
  // 两根立柱
  for (const o of [-1, 1]) {
    const [x, z] = at(o * (w / 2 - 0.3), 0);
    B.get('satin').box(x, y0 + H / 2, z, 0.6, H, 0.6, CREAM, ang);
    B.get('facadeBronze').box(x, y0 + 0.08, z, 0.64, 0.16, 0.64, GOLD, ang);
    // 花箱：立柱外侧（车库那一边），灌木团 + 几朵花
    const [qx, qz] = at(o * (w / 2 - 0.3), -0.9);
    B.get('satin').box(qx, y0 + 0.3, qz, 0.9, 0.6, 0.7, '#e9e3d8', ang);
    for (let k = 0; k < 5; k++) {
      const [sx, sz] = at(o * (w / 2 - 0.3) + (k - 2) * 0.17, -0.9 + ((k * 37) % 5 - 2) * 0.08);
      B.get('foliage').sphere(sx, y0 + 0.68 + (k % 2) * 0.06, sz, 0.2, k === 2 ? '#e58fb5' : k % 2 ? '#4f7f3c' : '#5f9447', 0.17, 0.2, 'ico0');
    }
  }
  // 门楣：米白盒子，底边一条暖光，两面贴发光招牌
  const hy = y0 + H - 0.5, hh = 0.9;
  const [mx, mz] = at(0, 0);
  B.get('satin').box(mx, hy, mz, w, hh, 0.5, CREAM, ang);
  B.get('glow').box(mx, hy - hh / 2 - 0.02, mz, w - 0.8, 0.03, 0.08, WARM, ang);
  const geo = new THREE.PlaneGeometry(Math.min(w - 1.4, 5.6), 0.62);
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(geo, mat);
    const [sx, sz] = at(0, side * 0.26);
    m.position.set(sx, hy, sz);
    m.rotation.y = Math.atan2(dx * side, dz * side);
    m.name = 'P1-garage-entry-sign';
    L.base.add(m);
  }
  // 门厅顶上一条长灯带 + 天花光晕（从门头一直到扶梯脚）
  const [lx, lz] = at(0, 3.2);
  B.get('glow').box(lx, y0 + H - 0.03, lz, 0.18, 0.03, 6, '#fff1d8', ang);
  B.ceilPool?.(lx, y0 + H, lz, w * 0.8, 7, 0xffd9a8, ang);
}

function entryTexture(ctx) {
  if (ctx.p1GarageEntryTex) return ctx.p1GarageEntryTex;
  const c = makeCanvas(1024, 112), g = c.getContext('2d');
  g.fillStyle = '#2b2622'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#c8a25a'; g.fillRect(0, 4, c.width, 3); g.fillRect(0, c.height - 7, c.width, 3);
  g.textBaseline = 'middle';
  g.fillStyle = '#f6e3b8'; g.textAlign = 'left';
  g.font = `700 50px ${FONT_CN}`; g.fillText('云澜汇 购物中心入口', 36, 46);
  g.font = `500 22px ${FONT_EN}`; g.fillStyle = '#d9c39a'; g.fillText('YUNLAN MALL ENTRANCE', 40, 86);
  g.textAlign = 'right'; g.fillStyle = '#ffffff';
  g.font = `600 34px ${FONT_CN}`; g.fillText('↑ B1M 美食广场 · 1F–6F', c.width - 36, 56);
  return (ctx.p1GarageEntryTex = canvasTexture(c, { clamp: true }));
}
