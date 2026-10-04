// 店内陈设：按业态生成（服饰、珠宝、美妆、数码、餐饮、档口、小吃、亲子、书店、影城、电玩、超市、家居）。
import { NORMAL, OPPOSITE } from '../../layout/geom.js';
import { rng } from '../textures.js';
import { tableSet, roundTable } from './props.js';
import { shade, storeStyle } from './storefronts.js';
import { clearHeight } from './shell.js';

const CLOTHES = ['#1f2937', '#e5e7eb', '#9ca3af', '#b91c1c', '#1d4ed8', '#047857', '#d97706', '#f5f5f4', '#7c3aed', '#be185d', '#0f766e', '#78350f'];
const NEON = ['#39f3ff', '#ff3df2', '#ffd23f', '#7dff6a', '#ff6b3d', '#8b7dff'];
const PRODUCE = ['#2f9e44', '#e8590c', '#f59f00', '#c92a2a', '#74b816', '#f08c00', '#a61e4d'];

/** 在 [a0,a1] 内均匀分布 n 个点（n=1 时取中点） */
function spread(n, a0, a1) {
  if (n <= 1) return [(a0 + a1) / 2];
  return Array.from({ length: n }, (_, i) => a0 + (i * (a1 - a0)) / (n - 1));
}

/** 以第一段门面建立局部坐标：u 沿门面，v 向店内；返回该铺位在局部坐标下的范围 */
function unitFrame(u) {
  const f = u.fronts[0];
  const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
  const ux = (f.x1 - f.x0) / len, uz = (f.z1 - f.z0) / len;
  const [nx, nz] = NORMAL[f.side];
  let umin = Infinity, umax = -Infinity, vmax = 0;
  // 只取与第一段门面相接的矩形作为主体
  const main = u.rects.find((r) => (f.side === 'N' && Math.abs(r.z0 - f.z0) < 0.01) || (f.side === 'S' && Math.abs(r.z1 - f.z0) < 0.01)
    || (f.side === 'W' && Math.abs(r.x0 - f.x0) < 0.01) || (f.side === 'E' && Math.abs(r.x1 - f.x0) < 0.01)) || u.rects[0];
  for (const [x, z] of [[main.x0, main.z0], [main.x1, main.z0], [main.x1, main.z1], [main.x0, main.z1]]) {
    const du = (x - f.x0) * ux + (z - f.z0) * uz;
    const dv = -((x - f.x0) * nx + (z - f.z0) * nz);
    umin = Math.min(umin, du); umax = Math.max(umax, du); vmax = Math.max(vmax, dv);
  }
  return { f, ux, uz, nx, nz, umin, umax, depth: vmax, main, ang: Math.atan2(-uz, ux), at: (a, b) => [f.x0 + ux * a - nx * b, f.z0 + uz * a - nz * b] };
}

export function buildInteriors(ctx) {
  for (const lv of ctx.layout.levels) {
    if (lv.kind === 'roof' || lv.kind === 'parking') continue;
    const L = ctx.levels[lv.id];
    lv.units.forEach((u, i) => {
      if (storeStyle(lv, u) === 'bar' || u.brand.cat === 'rink') return;
      L.batch.frame(u.frame, () => L.signs.frame(u.frame, () => furnish(L, ctx.atlas[lv.id], lv, u, rng(1000 + i * 31 + Math.round(lv.elev * 7) + lv.id.length * 13))));
    });
  }
}

function furnish(L, atlas, lv, u, rand) {
  const B = L.batch;
  const F = unitFrame(u);
  const y0 = lv.elev;
  const H = clearHeight(lv);
  const cat = u.brand.cat;
  const style = storeStyle(lv, u);
  const P = (key, a, b, y, sa, sb, sy, color, rot = 0) => {
    const [x, z] = F.at(a, b);
    B.get(key).box(x, y, z, sa, sy, sb, color, F.ang + rot);
  };
  const W = F.umax - F.umin;
  const D = F.depth;
  const u0 = F.umin, u1 = F.umax;
  const mid = (u0 + u1) / 2;

  // 地面（每个矩形一块）
  const floorCol = {
    cinema: '#2a1d24', arcade: '#1c1530', kids: '#ffe7a8', supermarket: '#e6e8e6', restaurant: '#c9a57c', bar: '#b08a63',
    jewelry: '#2d2c33', food: '#e7dccb', snack: '#8c7b68', tea: '#c7b08a', books: '#d9c6a5', cafe: '#cfae86',
  }[cat] || shade(u.brand.bg, 0.78).getStyle();
  for (const r of u.rects) B.get('satin').box((r.x0 + r.x1) / 2, y0 + 0.008, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 0.2, 0.016, r.z1 - r.z0 - 0.2, floorCol);

  // 品牌背景墙（深度足够时）
  if (D >= 5 && !['cinema', 'supermarket', 'kids'].includes(cat)) {
    const bw = Math.min(W * 0.55, 6.5), bh = Math.min(2.6, H - 1.6);
    P('satin', mid, D - 0.18, y0 + 1.3 + bh / 2, bw, 0.1, bh, u.brand.bg);
    const [x, z] = F.at(mid, D - 0.25);
    L.signs.place(x, y0 + 1.3 + bh / 2, z, Math.min(bw * 0.8, 4), Math.min(bw * 0.8, 4) / 4, OPPOSITE[F.f.side], atlas.cell(u.id));
  }

  const counter = (a, b, len = 2.2) => {
    P('satin', a, b, y0 + 0.5, len, 0.7, 1.0, shade(u.brand.bg, 0.25));
    P('satin', a, b, y0 + 1.02, len + 0.1, 0.8, 0.04, '#f3f4f6');
    P('matte', a + len * 0.25, b - 0.05, y0 + 1.25, 0.35, 0.25, 0.35, '#1f2937');
  };
  const mannequin = (a, b, color) => {
    P('satin', a, b, y0 + 0.05, 0.5, 0.5, 0.1, '#d1d5db');
    P('matte', a, b, y0 + 1.0, 0.42, 0.28, 1.0, color);
    P('satin', a, b, y0 + 1.7, 0.2, 0.2, 0.26, '#e5e7eb');
  };
  const rackRow = (a0, a1, b, y = 1.0) => {
    P('metal', (a0 + a1) / 2, b, y0 + 1.75, a1 - a0, 0.04, 0.04, '#9aa0a6');
    for (let a = a0 + 0.3; a < a1 - 0.2; a += 0.55) P('matte', a, b, y0 + y + 0.25, 0.5, 0.45, 0.95, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
  };

  switch (cat) {
    case 'fashion': case 'luxury': case 'accessory': case 'shoes': case 'sports': {
      const side0 = u0 + 0.45, side1 = u1 - 0.45;
      for (const a of [side0, side1]) {
        for (let b = 2.2; b < D - 1.2; b += 0.55) {
          if (cat === 'shoes' || cat === 'sports') {
            P('matte', a, b, y0 + 1.1, 0.4, 0.5, 2.2, '#efeae2');
            for (let k = 0; k < 4; k++) P('matte', a, b, y0 + 0.5 + k * 0.48, 0.3, 0.32, 0.14, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
          } else {
            P('matte', a, b, y0 + 1.25, 0.45, 0.5, 0.95, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
          }
        }
        P('metal', a, (2.2 + D - 1.2) / 2, y0 + 1.78, 0.04, D - 3.2, 0.04, '#9aa0a6');
      }
      if (W > 5 && D > 6) {
        const nt = Math.min(3, Math.floor(W / 3.2));
        for (let i = 0; i < nt; i++) {
          const a = u0 + (i + 1) * (W / (nt + 1));
          P('satin', a, D * 0.48, y0 + 0.42, 1.6, 0.9, 0.84, '#e7e2d8');
          for (let k = 0; k < 4; k++) P('matte', a - 0.55 + k * 0.37, D * 0.48, y0 + 0.9, 0.3, 0.4, 0.12 + rand() * 0.12, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
        }
        if (D > 9) rackRow(mid - Math.min(3, W / 3), mid + Math.min(3, W / 3), D * 0.72);
      }
      const nm = Math.max(1, Math.min(3, Math.floor(W / 3)));
      for (let i = 0; i < nm; i++) mannequin(u0 + (i + 0.6) * (W / (nm + 0.2)), 1.3, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
      counter(u1 - 1.6, D - 1.3);
      break;
    }
    case 'jewelry': {
      for (const a of [u0 + 0.7, u1 - 0.7]) {
        for (let b = 1.8; b < D - 1.4; b += 1.6) {
          P('satin', a, b, y0 + 0.45, 0.8, 1.5, 0.9, '#2b2b31');
          P('glass', a, b, y0 + 1.07, 0.78, 1.48, 0.34, 0xffffff);
          P('glow', a, b, y0 + 0.93, 0.7, 1.4, 0.02, '#fff1cf');
        }
      }
      if (W > 6) {
        for (const b of [D * 0.45, D * 0.45 + 1.7]) {
          P('satin', mid, b, y0 + 0.45, Math.min(4, W - 3.6), 0.8, 0.9, '#2b2b31');
          P('glass', mid, b, y0 + 1.07, Math.min(4, W - 3.6), 0.78, 0.34, 0xffffff);
          P('glow', mid, b, y0 + 0.93, Math.min(3.8, W - 3.8), 0.7, 0.02, '#fff1cf');
        }
      }
      for (let k = 0; k < 6; k++) P('satin', mid - 1.2 + (k % 3) * 1.2, D - 0.45, y0 + 1.4 + Math.floor(k / 3) * 0.9, 1.0, 0.3, 0.6, '#3a2f2a');
      break;
    }
    case 'beauty': {
      const ni = Math.max(1, Math.floor(W / 3.5));
      for (let i = 0; i < ni; i++) {
        const a = u0 + (i + 0.5) * (W / ni);
        for (const b of [D * 0.35, D * 0.65]) {
          if (b > D - 1.5) continue;
          P('satin', a, b, y0 + 0.45, 1.8, 0.9, 0.9, '#fafafa');
          for (let k = 0; k < 6; k++) P('satin', a - 0.7 + k * 0.28, b, y0 + 0.98, 0.12, 0.12, 0.18, CLOTHES[(k + i) % CLOTHES.length]);
        }
      }
      for (const a of [u0 + 0.3, u1 - 0.3]) {
        P('satin', a, D / 2, y0 + 1.3, 0.35, D - 2, 2.4, '#ffffff');
        P('glow', a, D / 2, y0 + 1.6, 0.4, D - 2.4, 0.8, shade(u.brand.bg, 0.5));
      }
      counter(u1 - 1.6, D - 1.2, 1.8);
      break;
    }
    case 'tech': {
      const nt = Math.max(1, Math.floor((D - 3) / 3));
      for (let i = 0; i < nt; i++) {
        const b = 2.5 + i * 3;
        P('satin', mid, b, y0 + 0.45, Math.min(W - 2.4, 6), 1.3, 0.9, '#d6b88f');
        for (let k = -2; k <= 2; k++) P('matte', mid + k * Math.min(1.1, (W - 3) / 5), b, y0 + 0.93, 0.36, 0.24, 0.03, '#111827');
      }
      P('glow', mid, D - 0.25, y0 + 2.3, Math.min(W - 1.5, 7), 0.08, 2.2, '#1e3a8a');
      P('glow', mid, D - 0.2, y0 + 2.3, Math.min(W - 2.5, 6), 0.06, 1.8, '#60a5fa');
      counter(u0 + 1.6, D - 1.5, 2.0);
      break;
    }
    case 'cafe': case 'tea': {
      if (style === 'oldstreet' || lv.kind === 'food') { stallKitchen(P, u0, u1, D, y0, u.brand, rand); if (W * D < 60) break; }
      else {
        P('satin', mid, D - 1.2, y0 + 0.55, Math.min(W - 1.2, 5), 0.8, 1.1, '#6b4a33');
        P('satin', mid, D - 1.2, y0 + 1.12, Math.min(W - 1.0, 5.2), 0.9, 0.05, '#f3efe7');
        for (let k = 0; k < 3; k++) P('metal', mid - 1.4 + k * 1.4, D - 1.25, y0 + 1.35, 0.5, 0.45, 0.45, k === 1 ? '#c0c4c8' : '#2b2f33');
        P('glow', mid, D - 0.2, y0 + 2.7, Math.min(W - 1.5, 4.5), 0.06, 1.0, '#fff1dc');
      }
      const rows = Math.floor((D - (lv.kind === 'food' ? 4.5 : 3.2)) / 2.4);
      const cols = Math.max(1, Math.floor((W - 1) / 2.4));
      for (let i = 0; i < rows; i++) {
        for (const a of spread(cols, u0 + 1.3, u1 - 1.3)) {
          const [x, z] = F.at(a, 1.8 + i * 2.4);
          roundTable(B, x, y0, z, 3, { chair: cat === 'tea' ? '#3f8f6d' : '#c08a5a' });
        }
      }
      break;
    }
    case 'restaurant': case 'bar': {
      // 后厨出菜口
      P('metal', mid, D - 1.0, y0 + 0.55, W - 1.2, 0.9, 1.1, '#c9cdd1');
      P('matte', mid, D - 0.3, y0 + (H - 1) / 2 + 0.2, W - 0.6, 0.4, H - 1, '#e8e4dc');
      if (style === 'oldstreet') { for (let k = 0; k < 4; k++) P('glow', u0 + (k + 0.5) * (W / 4), D * 0.5, y0 + 3.3, 0.5, 0.5, 0.6, '#d6332a'); }
      const cols = Math.max(1, Math.floor((W - 1.2) / 2.6));
      const rows = Math.max(1, Math.floor((D - 3.4) / 2.5));
      const tc = { top: cat === 'bar' ? '#2b2f33' : '#efe9df', chair: shade(u.brand.bg, 0.15).getStyle() };
      for (let i = 0; i < rows; i++) {
        for (const a of spread(cols, u0 + 1.4, u1 - 1.4)) {
          const [x, z] = F.at(a, 1.8 + i * 2.5);
          tableSet(B, x, y0, z, F.ang, tc);
        }
      }
      break;
    }
    case 'food': {
      stallKitchen(P, u0, u1, D, y0, u.brand, rand);
      break;
    }
    case 'snack': {
      stallKitchen(P, u0, u1, D, y0, u.brand, rand);
      for (let k = 0; k < 3; k++) for (let s = 0; s < 3; s++) P('satin', u0 + 1 + k * 0.7, 1.6, y0 + 1.15 + s * 0.16, 0.5, 0.5, 0.15, '#d9c19a');
      break;
    }
    case 'kids': {
      if (W * D > 300) playground(P, B, F, u0, u1, D, y0, rand);
      else {
        for (const a of [u0 + 0.4, u1 - 0.4]) for (let b = 1.8; b < D - 0.8; b += 0.6) P('matte', a, b, y0 + 0.9, 0.5, 0.5, 1.8, NEON[Math.floor(rand() * NEON.length)]);
        for (let k = 0; k < 6; k++) P('matte', mid - 1.5 + (k % 3) * 1.5, D * 0.5 + Math.floor(k / 3) * 1.4, y0 + 0.3, 0.9, 0.9, 0.6, NEON[k % NEON.length]);
      }
      break;
    }
    case 'toys': {
      for (const a of [u0 + 0.4, u1 - 0.4]) for (let b = 1.8; b < D - 0.8; b += 0.6) {
        P('matte', a, b, y0 + 1.0, 0.5, 0.5, 2.0, '#f3f4f6');
        for (let k = 0; k < 4; k++) P('matte', a, b, y0 + 0.4 + k * 0.45, 0.35, 0.3, 0.25, NEON[Math.floor(rand() * NEON.length)]);
      }
      for (let k = 0; k < 4; k++) P('glass', mid - 1.2 + (k % 2) * 2.4, D * 0.4 + Math.floor(k / 2) * 2, y0 + 1.0, 1.0, 1.0, 1.6, 0xffffff);
      break;
    }
    case 'books': {
      const nrows = Math.floor((D - 4) / 2.2);
      for (let i = 0; i < nrows; i++) {
        const b = 3 + i * 2.2;
        const len = W - 3;
        P('satin', mid, b, y0 + 0.9, len, 0.45, 1.8, '#8a5a35');
        for (let k = 0; k < Math.floor(len / 0.5); k++) {
          for (let s = 0; s < 4; s++) P('matte', u0 + 1.75 + k * 0.5, b, y0 + 0.25 + s * 0.42, 0.42, 0.5, 0.3, CLOTHES[(k * 3 + s + i) % CLOTHES.length]);
        }
      }
      for (const a of [u0 + 0.3, u1 - 0.3]) P('satin', a, D / 2, y0 + 1.6, 0.4, D - 1.5, 3.2, '#6b4426');
      for (let k = 0; k < 3; k++) {
        const [x, z] = F.at(u0 + 2.5 + k * 3, D - 2.2);
        roundTable(B, x, y0, z, 4, { chair: '#566a8c' });
      }
      break;
    }
    case 'cinema': {
      // 大堂：售票、卖品、海报灯箱；后部为 4 个影厅
      P('satin', mid - 4, 4.5, y0 + 0.55, 7, 1.0, 1.1, '#3a1d28');
      P('glow', mid - 4, 4.4, y0 + 1.15, 6.8, 0.9, 0.03, '#f5c518');
      for (let k = 0; k < 6; k++) P('glow', u0 + 2 + k * 3.2, 0.6, y0 + 2.4, 1.6, 0.05, 2.4, NEON[k % NEON.length]);
      hallsCinema(B, F, u, y0, H, rand);
      break;
    }
    case 'arcade': {
      for (let b = 2.5; b < D - 1.5; b += 2.4) {
        for (let a = u0 + 1.4; a < u1 - 1.2; a += 1.1) {
          P('matte', a, b, y0 + 0.85, 0.85, 0.75, 1.7, '#1b1530');
          P('glow', a, b - 0.39, y0 + 1.25, 0.65, 0.02, 0.5, NEON[Math.floor(rand() * NEON.length)]);
        }
      }
      for (let k = 0; k < 4; k++) {
        P('glass', u1 - 1.2, 2.5 + k * 2.2, y0 + 1.1, 1.1, 1.1, 1.8, 0xffffff);
        for (let s = 0; s < 5; s++) P('matte', u1 - 1.4 + (s % 3) * 0.2, 2.4 + k * 2.2 + (s % 2) * 0.2, y0 + 0.5, 0.18, 0.18, 0.18, NEON[(s + k) % NEON.length]);
      }
      break;
    }
    case 'supermarket': {
      supermarket(P, B, F, u0, u1, D, y0, rand, u);
      break;
    }
    case 'home': {
      for (let k = 0; k < 4; k++) {
        const a = u0 + (k % 2 + 1) * (W / 3), b = 2.2 + Math.floor(k / 2) * 2.6;
        if (b > D - 1.2) continue;
        P('satin', a, b, y0 + 0.4, 1.5, 0.9, 0.8, '#d6c3a5');
        for (let s = 0; s < 3; s++) {
          const [x, z] = F.at(a - 0.45 + s * 0.45, b);
          B.get('foliage').sphere(x, y0 + 1.05, z, 0.22, ['#5e9a44', '#e85d75', '#f2b134'][s]);
        }
      }
      for (const a of [u0 + 0.4, u1 - 0.4]) for (let b = 1.8; b < D - 0.8; b += 0.8) P('satin', a, b, y0 + 1.0, 0.45, 0.7, 2.0, '#efe7da');
      break;
    }
    case 'auto': {
      // 展车：车身 + 车窗 + 轮子，旋转展台
      const n = Math.max(1, Math.floor(W / 8));
      for (let i = 0; i < n; i++) {
        const a = u0 + (i + 0.5) * (W / n), b = D * 0.5;
        const [x, z] = F.at(a, b);
        B.get('metal').cyl(x, y0, z, 3.2, 0.12, '#d9dde1', 32);
        const col = ['#e8e9eb', '#1f2a44', '#b4232c', '#2d6a8f'][i % 4];
        P('metal', a, b, y0 + 0.75, 4.6, 1.9, 0.7, col, 0.5);
        P('glass', a, b, y0 + 1.35, 2.8, 1.7, 0.55, 0xffffff, 0.5);
        P('metal', a, b, y0 + 1.66, 2.6, 1.6, 0.06, col, 0.5);
      }
      P('glow', mid, D - 0.25, y0 + 2.6, Math.min(W - 2, 12), 0.08, 2.2, '#cfe8ff');
      counter(u0 + 2.2, D - 1.6, 2.4);
      break;
    }
    case 'edu': {
      const rows = Math.max(1, Math.floor((D - 3) / 2.2));
      for (let i = 0; i < rows; i++) {
        for (const a of spread(Math.max(1, Math.floor((W - 2) / 1.6)), u0 + 1.2, u1 - 1.2)) {
          P('satin', a, 2.4 + i * 2.2, y0 + 0.36, 1.2, 0.6, 0.72, '#f3e6c8');
          P('matte', a, 2.4 + i * 2.2 + 0.55, y0 + 0.24, 0.4, 0.4, 0.48, NEON[(i + Math.round(a)) % NEON.length]);
        }
      }
      P('matte', mid, D - 0.2, y0 + 1.6, Math.min(W - 1.5, 5), 0.06, 1.4, '#2f4f3f');
      break;
    }
    case 'studio': {
      for (let k = 0; k < Math.max(1, Math.floor(W / 4)); k++) {
        const a = u0 + 2 + k * 4;
        if (a > u1 - 1.5) break;
        P('satin', a, D * 0.5, y0 + 0.45, 2.2, 1.2, 0.9, '#c9a77a');
        for (let s2 = 0; s2 < 3; s2++) P('matte', a - 0.6 + s2 * 0.6, D * 0.5, y0 + 1.0, 0.3, 0.3, 0.2, CLOTHES[(k + s2) % CLOTHES.length]);
      }
      for (const a of [u0 + 0.35, u1 - 0.35]) P('satin', a, D / 2, y0 + 1.2, 0.4, D - 2, 2.4, '#efe7da');
      break;
    }
    default:
      counter(mid, D - 1.4);
  }
}

/** 档口后厨：操作台、灶台、排烟罩 */
function stallKitchen(P, u0, u1, D, y0, brand, rand) {
  const W = u1 - u0, mid = (u0 + u1) / 2;
  P('metal', mid, D - 0.9, y0 + 0.45, W - 0.8, 0.9, 0.9, '#c9cdd1');
  for (let k = 0; k < Math.floor((W - 1) / 1.2); k++) {
    P('metal', u0 + 1 + k * 1.2, D - 0.9, y0 + 0.95, 0.7, 0.6, 0.12, '#2b2f33');
    if (rand() < 0.6) P('metal', u0 + 1 + k * 1.2, D - 0.9, y0 + 1.15, 0.4, 0.4, 0.3, '#9aa0a6');
  }
  P('metal', mid, D - 0.8, y0 + 2.6, W - 0.6, 1.2, 0.6, '#b8bfc6');
  P('matte', mid, D - 0.2, y0 + 1.6, W - 0.4, 0.3, 3.2, shade(brand.bg, 0.6));
  P('satin', mid, D * 0.55, y0 + 0.45, Math.max(1, W - 2), 0.7, 0.9, '#e5e7eb');
}

/** 儿童乐园：彩色软垫、滑梯、球池、攀爬架 */
function playground(P, B, F, u0, u1, D, y0, rand) {
  const mid = (u0 + u1) / 2;
  const cols = ['#ff6b6b', '#ffd23f', '#4dabf7', '#69db7c', '#b197fc', '#ff922b'];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) P('matte', u0 + 2 + i * ((u1 - u0 - 4) / 6), 3 + j * ((D - 5) / 4), y0 + 0.03, (u1 - u0 - 4) / 6 - 0.1, (D - 5) / 4 - 0.1, 0.06, cols[(i + j) % cols.length]);
  // 攀爬塔
  P('matte', mid - 3, D * 0.55, y0 + 1.5, 3, 3, 3, '#ffd23f');
  P('matte', mid - 3, D * 0.55, y0 + 3.2, 3.4, 3.4, 0.4, '#ff6b6b');
  // 滑梯
  const [sx, sz] = F.at(mid, D * 0.55);
  B.get('matte').bar({ x: sx - F.ux * 1.5, y: y0 + 2.9, z: sz - F.uz * 1.5 }, { x: sx + F.ux * 3.5, y: y0 + 0.3, z: sz + F.uz * 3.5 }, 0.9, '#4dabf7');
  // 球池
  P('satin', u1 - 4, D - 4, y0 + 0.35, 5, 4, 0.7, '#ffffff');
  for (let k = 0; k < 60; k++) {
    const [x, z] = F.at(u1 - 6.2 + rand() * 4.4, D - 5.7 + rand() * 3.4);
    B.get('matte').sphere(x, y0 + 0.62, z, 0.16, cols[k % cols.length], 0.16, 0.16, 'sphereLo');
  }
  // 小火车轨道
  for (let k = 0; k < 10; k++) P('matte', u0 + 2 + k * 1.1, D - 2, y0 + 0.4, 0.9, 0.8, 0.8, cols[k % cols.length]);
}

/** 影城后部：4 个影厅（暗色地面、红色座椅、发光银幕） */
function hallsCinema(B, F, u, y0, H, rand) {
  for (const r of u.rects) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const horizontal = w >= d;
    const n = 2;
    for (let i = 0; i < n; i++) {
      const hall = horizontal
        ? { x0: r.x0 + (i * w) / n + 0.4, x1: r.x0 + ((i + 1) * w) / n - 0.4, z0: r.z0 + 0.4, z1: r.z0 + d * 0.62 }
        : { x0: r.x0 + 0.4, x1: r.x1 - 0.4, z0: r.z0 + (i * d) / n * 0.62 + 0.4, z1: r.z0 + ((i + 1) * d) / n * 0.62 - 0.4 };
      const hw = hall.x1 - hall.x0, hd = hall.z1 - hall.z0;
      const cx = (hall.x0 + hall.x1) / 2, cz = (hall.z0 + hall.z1) / 2;
      B.get('matte').box(cx, y0 + 0.02, cz, hw, 0.03, hd, '#20141a');
      for (const [x, z, sx, sz] of [[hall.x0, cz, 0.2, hd], [hall.x1, cz, 0.2, hd], [cx, hall.z0, hw, 0.2], [cx, hall.z1, hw, 0.2]]) {
        B.get('matte').box(x, y0 + (H - 0.3) / 2, z, sx, H - 0.3, sz, '#3a2a30');
      }
      const along = hw >= hd;
      // 银幕在远端
      if (along) B.get('glow').box(hall.x0 + 0.25, y0 + 2.4, cz, 0.05, 2.6, hd * 0.75, '#f4f6ff');
      else B.get('glow').box(cx, y0 + 2.4, hall.z0 + 0.25, hw * 0.75, 2.6, 0.05, '#f4f6ff');
      const rows = Math.floor(((along ? hw : hd) - 3) / 1.1);
      for (let k = 0; k < rows; k++) {
        const o = 2.4 + k * 1.1;
        const step = k * 0.18;
        if (along) B.get('matte').box(hall.x0 + o, y0 + 0.35 + step, cz, 0.6, 0.7, hd - 1.6, '#b3263b');
        else B.get('matte').box(cx, y0 + 0.35 + step, hall.z0 + o, hw - 1.6, 0.7, 0.6, '#b3263b');
      }
    }
  }
  void F;
  void rand;
}

/** 超市：收银台、货架、生鲜岛、冷柜 */
function supermarket(P, B, F, u0, u1, D, y0, rand, u) {
  const W = u1 - u0;
  // 收银台（靠门面）
  for (let k = 0; k < 7; k++) {
    const a = u0 + 4 + k * ((W - 8) / 6);
    P('satin', a, 3.2, y0 + 0.45, 0.8, 2.2, 0.9, '#f1f3f5');
    P('glow', a, 2.2, y0 + 1.9, 0.3, 0.05, 0.3, '#2b8a3e');
  }
  // 货架（垂直于门面，形成纵向通道）
  for (let a = u0 + 3; a < u1 - 3; a += 2.6) {
    P('satin', a, D * 0.55, y0 + 0.85, 0.8, D * 0.5, 1.7, '#e9ecef');
    for (let s = 0; s < 3; s++) P('matte', a, D * 0.55, y0 + 0.4 + s * 0.5, 0.86, D * 0.5 - 0.2, 0.28, PRODUCE[(Math.floor(a) + s) % PRODUCE.length]);
  }
  // 生鲜岛
  for (let k = 0; k < 3; k++) {
    P('satin', u0 + W * (0.3 + k * 0.2), D - 3.5, y0 + 0.4, 2.2, 1.4, 0.8, '#8a5a35');
    for (let s = 0; s < 6; s++) P('matte', u0 + W * (0.3 + k * 0.2) - 0.8 + (s % 3) * 0.8, D - 3.8 + Math.floor(s / 3) * 0.6, y0 + 0.85, 0.7, 0.55, 0.12, PRODUCE[(s + k) % PRODUCE.length]);
  }
  // 冷柜墙
  P('glow', (u0 + u1) / 2, D - 0.6, y0 + 1.1, W - 2, 0.6, 2.0, '#d8f3ff');
  P('glass', (u0 + u1) / 2, D - 1.0, y0 + 1.1, W - 2, 0.05, 2.0, 0xffffff);
  void B;
  void rand;
  void u;
}
