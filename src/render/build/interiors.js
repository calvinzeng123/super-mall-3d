// 店内陈设：按业态生成（服饰、珠宝、美妆、数码、餐饮、档口、小吃、亲子、书店、影城、电玩、超市、家居）。
import { NORMAL } from '../../layout/geom.js';
import { rng } from '../textures.js';
import { tableSet, roundTable } from './props.js';
import { shade, storeStyle } from './storefronts.js';
import { clearHeight } from './shell.js';
import { interiorDetail } from './interior-detail.js';

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
      if (u.residence) return; // 塔楼房间由单层惰性内饰构建器负责。
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
  const detail = interiorDetail(B, F, P, y0);
  const boutique = /^P[12]-/.test(lv.id) && (cat === 'jewelry' || cat === 'beauty');

  // 壁龛贴在单矩形铺位的实墙上；转角门面所在段不装柜，保留原有侧入口。
  const wallNiches = () => {
    if (!boutique || u.rects.length !== 1 || D < 5) return;
    const count = D > 10 ? 2 : 1;
    const span = Math.min(3.6, (D - 3.2) / count - .5);
    for (const edge of [u0, u1]) {
      const inward = edge === u0 ? 1 : -1;
      const a = edge + inward * .16;
      const rot = Math.atan2(F.ux * inward, F.uz * inward) - Math.atan2(F.nx, F.nz);
      for (const b of spread(count, 2.1 + span / 2, D - 1.7 - span / 2)) {
        const opening = u.fronts.some(f => {
          const along = [f.x0, f.z0, f.x1, f.z1];
          const a0 = (along[0] - F.f.x0) * F.ux + (along[1] - F.f.z0) * F.uz;
          const a1 = (along[2] - F.f.x0) * F.ux + (along[3] - F.f.z0) * F.uz;
          const b0 = -((along[0] - F.f.x0) * F.nx + (along[1] - F.f.z0) * F.nz);
          const b1 = -((along[2] - F.f.x0) * F.nx + (along[3] - F.f.z0) * F.nz);
          return Math.abs(a0 - edge) < .08 && Math.abs(a1 - edge) < .08 && Math.max(b0, b1) > b - span / 2 - .2 && Math.min(b0, b1) < b + span / 2 + .2;
        });
        if (opening) continue;
        detail.face('wood', a, b, 2.40, span, 2.16, cat === 'jewelry' ? '#b6a18a' : '#ddd0b8', rot);
        for (const db of [-span / 2, span / 2]) P('metal', a + inward * .015, b + db, y0 + 2.40, .05, .055, 2.22, '#a28a62');
        P('wood', edge + inward * .31, b, y0 + 1.48, .32, span, .045, '#b6a18a');
        detail.face('glowSoft', a + inward * .007, b, 3.43, span - .13, .035, '#ebd7ad', rot);
        if (cat === 'jewelry') {
          const [x, z] = F.at(edge + inward * .32, b);
          B.get('satin').sphere(x, y0 + 1.68, z, .13, '#77978a', .19, .13, 'ico0');
          P('metal', edge + inward * .31, b, y0 + 1.525, .24, .40, .045, '#c5b085');
        } else {
          for (let k = 0; k < 3; k++) {
            const db = (k - 1) * .28, h = .30 + k % 2 * .12;
            P('satin', edge + inward * .30, b + db, y0 + 1.505 + h / 2, .16, .20, h, ['#869b91', '#dfc6b9', '#ae9671'][k]);
            detail.face('matte', edge + inward * .386, b + db, 1.63, .12, .07, '#f4eee0', rot);
          }
        }
      }
    }
  };

  // 装修附在铺内既有侧墙上：踢脚线、金属收口和轨道射灯不占入口通道。
  if (D > 3 && W > 2.4 && !['cinema', 'kids', 'supermarket'].includes(cat)) {
    const warm = ['cafe', 'tea', 'books', 'home', 'restaurant', 'bakery'].includes(cat);
    for (const a of [u0 + .13, u1 - .13]) {
      P(warm ? 'wood' : 'metal', a, D / 2, y0 + .09, .035, D - .35, .18, warm ? '#b6a080' : '#9b9d91');
      P('metal', a, D / 2, y0 + H - .36, .055, D - .6, .065, '#59615a');
      for (let b = 1.3; b < D - .7; b += 3.3) {
        detail.spotlight(a + (a < mid ? .21 : -.21), b, H - .59);
      }
    }
  }

  // 地面（每个矩形一块）
  const floorCol = {
    cinema: '#2a1d24', arcade: '#1c1530', kids: '#ffe7a8', supermarket: '#e6e8e6', restaurant: '#c9a57c', bar: '#b08a63',
    jewelry: '#2d2c33', food: '#e7dccb', snack: '#8c7b68', tea: '#c7b08a', books: '#d9c6a5', cafe: '#cfae86',
  }[cat] || shade(u.brand.bg, 0.78).getStyle();
  const floorKey = lv.finishes ? 'carpet' : ['books', 'cafe', 'tea', 'home', 'fashion', 'luxury'].includes(cat) ? 'wood'
    : ['jewelry', 'beauty', 'tech', 'accessory'].includes(cat) ? 'stone' : 'satin';
  const carpetTint = ['cinema', 'arcade', 'jewelry'].includes(cat) ? '#607878'
    : ['restaurant', 'cafe', 'tea', 'snack'].includes(cat) ? '#b19a80'
    : ['kids', 'books', 'home', 'studio'].includes(cat) ? '#9da78b' : '#c1b5a1';
  const floorTint = floorKey === 'carpet' ? carpetTint : floorKey === 'wood' ? '#eee6d9' : floorKey === 'stone' ? '#eeece5' : floorCol;
  for (const r of u.rects) B.get(floorKey).box((r.x0 + r.x1) / 2, y0 + 0.008, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 0.2, 0.016, r.z1 - r.z0 - 0.2, floorTint);

  // 品牌背景墙（深度足够时）
  if (D >= 5 && !['cinema', 'supermarket', 'kids'].includes(cat)) {
    const bw = Math.min(W * 0.55, 6.5), bh = Math.min(2.6, H - 1.6);
    const base = boutique ? .12 : 1.3, tall = 1.3 + bh - base;
    P('satin', mid, D - 0.18, y0 + base + tall / 2, bw, 0.1, tall, u.brand.bg);
    const [x, z] = F.at(mid, D - 0.25);
    const logoW = Math.min(bw * .8, 4);
    L.signs.place(x, y0 + (boutique ? 1.3 + bh - .55 : 1.3 + bh / 2), z, logoW, logoW / 4, F.f.side, atlas.cell(u.id));
    if (boutique) {
      for (const a of [mid - bw / 2 + .05, mid + bw / 2 - .05]) P('metal', a, D - .245, y0 + base + tall / 2, .045, .035, tall, '#b8a178');
      P('wood', mid, D - .247, y0 + .39, bw - .14, .035, .46, '#c6b699');
    }
  }

  const counter = (a, b, len = 2.2) => {
    P('satin', a, b, y0 + 0.5, len, 0.7, 1.0, shade(u.brand.bg, 0.25));
    P('satin', a, b, y0 + 1.02, len + 0.1, 0.8, 0.04, '#f3f4f6');
    P('matte', a + len * 0.25, b - 0.05, y0 + 1.25, 0.35, 0.25, 0.35, '#1f2937');
    // 收银屏、扫码器、票据及纸袋均落在原有柜台面内。
    P('glowSoft', a + len * .25, b - .182, y0 + 1.30, .28, .01, .19, '#acc4b4');
    detail.card(a - len * .29, b - .04, 1.04);
    P('matte', a - len * .07, b + .02, y0 + 1.095, .23, .17, .11, '#d8d2bc');
    P('satin', a - len * .07, b - .076, y0 + 1.126, .17, .009, .025, '#fff4db');
    for (const db of [-.19, .19]) P('metal', a, b + db, y0 + .035, len - .08, .028, .07, '#8c7854');
  };
  const mannequin = (a, b, color) => {
    detail.cylinder('stone', a, b, .02, .31, .075, '#eeebe1', 12);
    detail.shirt(a, b, 1.51, color, 0, .94);
    for (const da of [-.115, .115]) {
      P('matte', a + da, b, y0 + .45, .145, .18, .65, '#c4c5bd');
      detail.shoe(a + da, b - .08, .10, '#e1e2d8', Math.PI / 2);
    }
    const [x, z] = F.at(a, b);
    B.get('satin').sphere(x, y0 + 1.73, z, .105, '#e7e3d8', .145, .10, 'ico0');
    detail.cylinder('satin', a, b, 1.5, .052, .12, '#e7e3d8', 6);
  };
  const rackRow = (a0, a1, b) => {
    if (a1 - a0 < .8) return;
    P('metal', (a0 + a1) / 2, b, y0 + 1.82, a1 - a0, .035, .035, '#a8a79a');
    for (const a of [a0, a1]) {
      P('metal', a, b, y0 + .91, .035, .035, 1.82, '#a8a79a');
      P('metal', a, b, y0 + .03, .32, .45, .045, '#a8a79a');
    }
    for (let a = a0 + .27; a < a1 - .18; a += .65) detail.shirt(a, b, 1.73, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
  };

  switch (cat) {
    case 'fashion': case 'luxury': case 'accessory': case 'shoes': case 'sports': {
      // 陈列沿两侧展开，中间保留连续进深通道；支架与衣物分开，商品有实际轮廓。
      const bays = Math.max(1, Math.min(3, Math.floor((D - 3.4) / 1.7)));
      for (const a of [u0 + .47, u1 - .47]) {
        if (cat === 'shoes' || cat === 'sports' || cat === 'accessory') {
          for (let bay = 0; bay < bays; bay++) {
            const b = 2.2 + bay * Math.max(1.7, (D - 5.0) / Math.max(1, bays - 1));
            P('wood', a, b, y0 + 1.12, .08, 1.48, 2.16, '#ece3d1');
            for (let k = 0; k < 3; k++) {
              const h = .45 + k * .57;
              P('wood', a, b, y0 + h, .62, 1.48, .045, '#efe3d1');
              for (const db of [-.42, .23]) {
                const col = CLOTHES[(bay * 3 + k + (db > 0 ? 3 : 0)) % CLOTHES.length];
                if (cat === 'accessory') detail.bag(a, b + db, h + .025, col);
                else detail.shoe(a, b + db, h + .025, col, Math.PI / 2);
              }
              P('metal', a, b - .73, y0 + h + .02, .40, .014, .065, '#c3b99b');
            }
          }
        } else {
          const railEnd = Math.max(2.5, Math.min(D - 2, 10.2));
          P('metal', a, (2.0 + railEnd) / 2, y0 + 1.88, .035, railEnd - 2, .035, '#b4af9d');
          for (const b of [2, railEnd]) P('metal', a, b, y0 + .94, .035, .035, 1.88, '#b4af9d');
          for (let b = 2.25; b < railEnd; b += .64) detail.shirt(a, b, 1.79, CLOTHES[Math.floor(rand() * CLOTHES.length)], Math.PI / 2);
        }
      }
      if (W > 6 && D > 6) {
        // 岛台分居两侧，入口到收银台之间留 1.8m 中央通道。
        for (const a of [u0 + W * .27, u1 - W * .27]) {
          const b = D * .48, len = Math.min(1.5, W * .23);
          P('wood', a, b, y0 + .42, len, .9, .84, '#eee3d4');
          P('stone', a, b, y0 + .86, len + .05, .95, .06, '#f6f3eb');
          for (let k = 0; k < 3; k++) {
            const x = a - len * .29 + k * len * .29;
            if (cat === 'accessory' || cat === 'luxury') detail.bag(x, b, .89, CLOTHES[(k + 3) % CLOTHES.length]);
            else if (cat === 'shoes' || cat === 'sports') detail.shoe(x, b, .89, CLOTHES[k]);
            else for (let h = 0; h < 3; h++) P('matte', x, b, y0 + .92 + h * .045, .32, .38, .038, CLOTHES[(k * 2 + h) % CLOTHES.length]);
          }
        }
        if (D > 9) {
          rackRow(u0 + 1.6, mid - 1.0, D * .72);
          rackRow(mid + 1.0, u1 - 1.6, D * .72);
        }
      }
      for (const a of (W > 5 ? [u0 + 1.15, u1 - 1.15] : [u0 + .9])) mannequin(a, 1.3, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
      counter(u1 - 1.6, D - 1.3);
      break;
    }
    case 'jewelry': {
      wallNiches();
      for (const a of [u0 + 0.7, u1 - 0.7]) {
        for (let b = 1.8; b < D - 1.4; b += 1.6) {
          P('satin', a, b, y0 + 0.45, 0.8, 1.5, 0.9, '#2b2b31');
          if (boutique) for (const h of [.105, .79]) detail.band(a, b, h, .803, 1.503, .035);
          P('glass', a, b, y0 + 1.07, 0.78, 1.48, 0.34, 0xffffff);
          P('glow', a, b, y0 + 0.93, 0.7, 1.4, 0.02, '#fff1cf');
          for (let j = 0; j < 3; j++) detail.jewelry(a, b - .43 + j * .43, .943, j);
        }
      }
      if (W > 6) {
        for (const b of [D * 0.45, D * 0.45 + 1.7]) {
          P('satin', mid, b, y0 + 0.45, Math.min(4, W - 3.6), 0.8, 0.9, '#2b2b31');
          if (boutique) for (const h of [.105, .79]) detail.band(mid, b, h, Math.min(4, W - 3.6) + .003, .803, .035);
          P('glass', mid, b, y0 + 1.07, Math.min(4, W - 3.6), 0.78, 0.34, 0xffffff);
          P('glow', mid, b, y0 + 0.93, Math.min(3.8, W - 3.8), 0.7, 0.02, '#fff1cf');
          const len = Math.min(3.8, W - 3.8);
          for (let j = 0; j < 4; j++) detail.jewelry(mid - len * .35 + j * len * .7 / 3, b, .943, j);
        }
      }
      for (let k = 0; k < 3; k++) {
        const a = mid + (k - 1) * Math.min(1.2, W * .15);
        P('wood', a, D - .29, y0 + 1.64, .94, .10, 1.38, '#aa9579');
        detail.face('matte', a, D - .345, 1.64, .82, 1.26, '#31483e');
        detail.face('metal', a, D - .346, 1.34, .44, .035, '#c9b07a');
      }
      break;
    }
    case 'beauty': {
      wallNiches();
      const ni = Math.max(1, Math.floor(W / 3.5));
      for (let i = 0; i < ni; i++) {
        const a = u0 + (i + 0.5) * (W / ni);
        for (const b of [D * 0.35, D * 0.65]) {
          if (b > D - 1.5) continue;
          P('satin', a, b, y0 + 0.45, 1.8, 0.9, 0.9, '#fafafa');
          if (boutique) {
            for (const h of [.105, .79]) detail.band(a, b, h, 1.803, .903, .035);
            detail.face('wood', a, b - .452, .445, 1.64, .51, '#d7c4a7');
            detail.face('wood', a, b + .452, .445, 1.64, .51, '#d7c4a7', Math.PI);
          }
          for (let k = 0; k < 6; k++) detail.bottle(a - .7 + k * .28, b, .9, ['#b99b73', '#84a295', '#d7b4aa'][(k + i) % 3], .18 + k % 3 * .045, k % 2 === 0);
          detail.card(a, b - .30, .9);
          P('metal', a, b + .25, y0 + 1.15, .55, .04, .46, '#d0b57d');
          P('mirror', a, b + .221, y0 + 1.16, .48, .012, .37, '#d7e2df');
        }
      }
      if (!boutique) for (const a of [u0 + .3, u1 - .3]) {
        P('satin', a, D / 2, y0 + 1.3, .35, D - 2, 2.4, '#ffffff');
        P('glow', a, D / 2, y0 + 1.6, .4, D - 2.4, .8, shade(u.brand.bg, .5));
      }
      counter(u1 - 1.6, D - 1.2, 1.8);
      break;
    }
    case 'tech': {
      const nt = Math.max(1, Math.floor((D - 3) / 3));
      const tableWidth = Math.max(1.2, Math.min(W - 2.4, 6));
      for (let i = 0; i < nt; i++) {
        const b = 2.5 + i * 3;
        P('wood', mid, b, y0 + .85, tableWidth, 1.3, .10, '#f4ead7');
        for (const a of [mid - tableWidth * .4, mid + tableWidth * .4]) P('metal', a, b, y0 + .425, .10, 1.05, .85, '#9caaa4');
        const count = Math.max(2, Math.min(5, Math.floor(tableWidth / .8)));
        for (let k = 0; k < count; k++) {
          const a = mid - tableWidth * .37 + k * tableWidth * .74 / (count - 1);
          if ((k + i) % 2) detail.laptop(a, b, .9, ['#809c9c', '#78909f', '#9c8668'][i % 3]);
          else detail.phone(a, b, .9, ['#89b59f', '#8b9ac4', '#b2a287'][k % 3]);
          P('satin', a, b - .42, y0 + .907, .19, .12, .008, '#ecebe2');
        }
      }
      // 电视墙保留显示器黑色边框；两块独立屏幕避免整面纯色发光墙。
      for (const da of [-1, 1]) {
        const a = mid + da * Math.min(1.5, W * .23), w = Math.min(2.45, W * .4);
        P('matte', a, D - .29, y0 + 2.4, w, .10, 1.45, '#2c3736');
        P('glow', a, D - .35, y0 + 2.4, w - .09, .02, 1.36, da < 0 ? '#5e847c' : '#657d93');
        P('glowSoft', a - w * .18, D - .365, y0 + 2.58, w * .44, .012, .70, '#a3b6a3');
      }
      counter(u0 + 1.6, D - 1.5, 2.0);
      break;
    }
    case 'cafe': case 'tea': {
      if (style === 'oldstreet' || lv.kind === 'food') {
        stallKitchen(P, detail, u0, u1, D, y0, u.brand, rand);
        if (W > 3.5) {
          if (cat === 'tea') detail.teaStation(mid, D * .55, .96);
          else detail.espresso(mid, D * .55, .96);
        }
        if (W * D < 60) break;
      } else {
        const len = Math.min(W - 1.2, 5.6), b = D - 1.25;
        P('wood', mid, b, y0 + .53, len, .85, 1.06, '#eee3d4');
        P('stone', mid, b, y0 + 1.09, len + .10, .96, .07, '#ffffff');
        P('metal', mid, b - .437, y0 + .09, len - .18, .025, .13, '#887959');
        for (let k = 0; k < Math.min(16, Math.floor(len / .3)); k++) P('wood', mid - len / 2 + .16 + k * .3, b - .438, y0 + .58, .045, .028, .8, '#e2d5c0');
        if (cat === 'tea') detail.teaStation(mid - .35, b, 1.13);
        else detail.espresso(mid - .35, b, 1.13);
        if (len > 4.2) detail.pastryCase(mid + len / 2 - .6, b, 1.13);
        // 后墙搁板与杯碟，留出操作面的空间。
        P('wood', mid, D - .32, y0 + 2.28, Math.min(len, 4.5), .3, .07, '#eee3d4');
        for (let k = 0; k < 5; k++) detail.cup(mid - 1.0 + k * .5, D - .32, 2.32, '#f2e8d6', false);
        for (const da of [-1.3, 1.3]) if (Math.abs(da) < len * .4) detail.pendant(mid + da, b - .15, Math.min(H - .65, 2.9), H - .08, cat === 'tea' ? '#426c58' : '#534937');
      }
      const rows = Math.floor((D - (lv.kind === 'food' ? 4.5 : 3.8)) / 2.4);
      const cols = Math.max(1, Math.floor((W - 1) / 2.4));
      for (let i = 0; i < rows; i++) {
        for (const a of spread(cols, u0 + 1.3, u1 - 1.3)) {
          const b = 1.8 + i * 2.4, [x, z] = F.at(a, b);
          roundTable(B, x, y0, z, 3, { chair: cat === 'tea' ? '#3f8f6d' : '#c08a5a' });
          if (i < 2) {
            detail.tableware(a, b, .77);
            detail.menu(a, b + .23, .77, cat === 'tea' ? '#61705c' : '#725642');
          }
        }
      }
      break;
    }
    case 'restaurant': case 'bar': {
      // 后厨出菜口与传菜台，餐区能看到碟盘、保温灯及制作设备。
      P('metal', mid, D - 1.0, y0 + .52, W - 1.2, .9, 1.04, '#b5bfba');
      P('stone', mid, D - 1.0, y0 + 1.07, W - 1.1, 1.0, .07, '#ffffff');
      P('slat', mid, D - .3, y0 + (H - 1) / 2 + .2, W - .6, .4, H - 1, '#d9b48a');
      P('metal', mid, D - .8, y0 + 2.15, W - 1.3, .72, .09, '#bec4bd');
      for (let k = 0; k < Math.min(5, Math.floor(W / 1.5)); k++) {
        const a = u0 + 1.3 + k * (W - 2.6) / Math.max(1, Math.min(5, Math.floor(W / 1.5)) - 1);
        detail.cylinder('satin', a, D - 1.08, 1.11, .22, .09, '#e8e6dd');
        detail.pendant(a, D - 1.0, 1.78, 2.11, '#9b8863');
      }
      const cols = Math.max(1, Math.floor((W - 1.2) / 2.6));
      const rows = Math.max(1, Math.floor((D - 3.4) / 2.5));
      const tc = { top: cat === 'bar' ? '#2b2f33' : '#efe9df', chair: shade(u.brand.bg, .15).getStyle() };
      for (let i = 0; i < rows; i++) {
        for (const a of spread(cols, u0 + 1.4, u1 - 1.4)) {
          const b = 1.8 + i * 2.5, [x, z] = F.at(a, b);
          tableSet(B, x, y0, z, F.ang, tc);
          if (i < 2) {
            detail.tableware(a, b, .765);
            detail.menu(a + .36, b + .19, .765, '#6d4c38');
          }
        }
      }
      if (style === 'oldstreet') for (const a of spread(Math.min(3, cols), u0 + 1.5, u1 - 1.5)) detail.pendant(a, D * .5, Math.min(3.05, H - .65), H - .08, '#9e4939');
      break;
    }
    case 'food': {
      stallKitchen(P, detail, u0, u1, D, y0, u.brand, rand);
      break;
    }
    case 'snack': {
      stallKitchen(P, detail, u0, u1, D, y0, u.brand, rand);
      for (let k = 0; k < 3; k++) for (let s = 0; s < 3; s++) P('satin', u0 + 1 + k * 0.7, 1.6, y0 + 1.15 + s * 0.16, 0.5, 0.5, 0.15, '#d9c19a');
      break;
    }
    case 'bakery': {
      const count = Math.max(1, Math.min(3, Math.floor((W - 1.5) / 1.8)));
      for (const a of spread(count, u0 + 1.2, u1 - 1.2)) {
        P('wood', a, D * .48, y0 + .42, 1.35, .9, .84, '#eee3d4');
        detail.pastryCase(a, D * .48, .86);
      }
      counter(u1 - 1.4, D - 1.3, 1.8);
      for (let shelf = 0; shelf < 3; shelf++) {
        const h = .65 + shelf * .52;
        P('wood', mid, D - .45, y0 + h, W - 1.1, .58, .07, '#eee3d4');
        const count = Math.min(10, Math.floor((W - 1.4) / .48));
        for (let k = 0; k < count; k++) {
          const [x, z] = F.at(u0 + .9 + k * (W - 1.8) / Math.max(1, count - 1), D - .45);
          B.get('matte').sphere(x, y0 + h + .14, z, .18, '#cb9250', .10, .11, 'ico0');
        }
      }
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
        P('matte', a + (a < mid ? -.22 : .22), b, y0 + 1.0, .055, .5, 2.0, '#f3f4f6');
        for (let k = 0; k < 4; k++) {
          P('wood', a, b, y0 + .26 + k * .45, .48, .48, .035, '#ddd1b5');
          if (k === 1) detail.toy(a, b, .28 + k * .45, '#d6a776');
          else {
            // 陈列样品配套盒装库存，避免每个储货格都复制高顶点公仔。
            const color = ['#829f98', '#d6a776', '#dda7a0', '#e0c45e'][k];
            P('matte', a, b, y0 + .43 + k * .45, .30, .31, .27, color);
            detail.face('satin', a + (a < mid ? .156 : -.156), b, .43 + k * .45, .20, .14, '#ece4cf',
              (a < mid ? 1 : -1) * Math.sign(F.ux * F.nz - F.uz * F.nx) * Math.PI / 2);
          }
        }
      }
      for (let k = 0; k < 4; k++) {
        const a = mid - 1.2 + (k % 2) * 2.4, b = D * .4 + Math.floor(k / 2) * 2;
        P('glass', a, b, y0 + 1, 1, 1, 1.6, 0xffffff);
        P('wood', a, b, y0 + .50, .95, .95, .55, '#e8dfcc');
        detail.toy(a - .18, b, .78, '#cd9c63'); detail.toy(a + .18, b, .78, '#7b9d94');
        detail.card(a, b - .32, .78);
      }
      break;
    }
    case 'books': {
      const nrows = Math.max(0, Math.floor((D - 5.5) / 2.3));
      for (let i = 0; i < nrows; i++) {
        const b = 3 + i * 2.3;
        // 分成两个书架，中间一直保留 1.7m 通道，实木层板之间露出独立书脊。
        for (const [a0, a1] of [[u0 + 1.1, mid - .85], [mid + .85, u1 - 1.1]]) {
          const len = a1 - a0;
          if (len < .65) continue;
          const center = (a0 + a1) / 2;
          P('wood', center, b + .18, y0 + 1.05, len, .035, 1.9, '#e6d6bb');
          for (const a of [a0, a1]) P('wood', a, b, y0 + 1.05, .065, .48, 1.95, '#efe4cd');
          for (let shelf = 0; shelf < 4; shelf++) {
            const h = .17 + shelf * .46;
            P('wood', center, b, y0 + h, len, .47, .047, '#efe4cd');
            const count = Math.min(16, Math.floor(len / .18));
            for (let k = 0; k < count; k++) detail.book(a0 + .14 + k * (len - .27) / Math.max(1, count - 1), b - .035, h + .026, CLOTHES[(k + shelf * 3 + i) % CLOTHES.length], .09 + (k % 3) * .021, .26 + (k % 4) * .035);
          }
        }
      }
      const count = Math.max(1, Math.min(3, Math.floor((W - 2) / 3)));
      for (const a of spread(count, u0 + 1.9, u1 - 1.9)) {
        const b = D - 2.0, [x, z] = F.at(a, b);
        roundTable(B, x, y0, z, 3, { chair: '#566a77' });
        P('matte', a - .15, b, y0 + .7925, .3, .38, .045, '#697c67');
        P('satin', a - .15, b, y0 + .816, .26, .34, .009, '#e8e2d1');
        detail.cylinder('metal', a + .3, b, .77, .12, .025, '#80704e');
        detail.line('metal', a + .3, b, .8, a + .3, b, 1.15, .025, '#80704e');
        detail.box('matte', a + .3, b, 1.17, .3, .18, .085, '#546e5d');
        detail.box('glow', a + .3, b, 1.123, .26, .15, .015, '#f5d6a2');
      }
      counter(u0 + 1.6, 1.4, 1.8);
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
    case 'supermarket': case 'convenience': {
      supermarket(P, B, F, u0, u1, D, y0, rand, u);
      break;
    }
    case 'home': {
      for (let k = 0; k < 4; k++) {
        const a = u0 + (k % 2 + 1) * (W / 3), b = 2.2 + Math.floor(k / 2) * 2.6;
        if (b > D - 1.2) continue;
        if (k % 2 === 0) {
          const textile = k ? '#94a498' : '#cbb797';
          P('wood', a, b, y0 + .17, 1.45, .85, .15, '#9c805f');
          P('matte', a, b, y0 + .38, 1.25, .72, .25, textile);
          P('matte', a, b + .34, y0 + .63, 1.45, .17, .34, textile);
          for (const da of [-.68, .68]) P('matte', a + da, b, y0 + .46, .14, .89, .39, textile);
          for (const da of [-.3, .3]) P('matte', a + da, b + .21, y0 + .64, .32, .12, .27, da < 0 ? '#e6dac2' : '#ae8064', da * .4);
          P('matte', a + .40, b - .08, y0 + .518, .22, .43, .03, '#eee3ce');
        } else {
          P('stone', a, b, y0 + .74, 1.5, .9, .07, '#e7ddc8');
          for (const da of [-.59, .59]) P('wood', a + da, b, y0 + .365, .09, .67, .73, '#8c7250');
          detail.bouquet(a - .35, b, .78, '#9d785c');
          detail.tableware(a + .22, b, .78);
        }
      }
      for (const a of [u0 + 0.4, u1 - 0.4]) for (let b = 1.8; b < D - 0.8; b += 0.8) {
        P('wood', a, b, y0 + 1.0, .45, .7, 2.0, '#e0d3b9');
        const faceA = a + (a < mid ? .235 : -.235);
        P('metal', faceA, b - .18, y0 + 1.1, .025, .03, .22, '#997e4e');
        P('matte', faceA, b, y0 + .9, .012, .015, 1.78, '#a49478');
        P('metal', a, b, y0 + .05, .46, .71, .06, '#7a6b55');
      }
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
function stallKitchen(P, detail, u0, u1, D, y0, brand, rand) {
  const W = u1 - u0, mid = (u0 + u1) / 2;
  P('metal', mid, D - .9, y0 + .45, W - .8, .9, .9, '#c9cdd1');
  const burners = Math.min(4, Math.floor((W - 1) / 1.2));
  for (let k = 0; k < burners; k++) {
    const a = u0 + 1 + k * 1.2;
    P('matte', a, D - .9, y0 + .925, .68, .60, .05, '#293835');
    detail.cylinder('metal', a, D - .9, .955, .19, .045, '#737e78');
    detail.cylinder('metal', a, D - .9, 1.0, .18, .22, '#bcc7c0');
    detail.cylinder('metal', a, D - .9, 1.22, .195, .025, '#d1d7ce');
    detail.cylinder('matte', a, D - .9, 1.245, .04, .025, '#27332e');
    detail.line('matte', a - .17, D - .9, 1.14, a - .30, D - .9, 1.14, .045, '#28332c');
    P('metal', a, D - 1.36, y0 + .71, .07, .018, .07, '#3d4f45');
  }
  P('metal', mid, D - .8, y0 + 2.58, W - .6, 1.12, .38, '#b8bfc6');
  P('matte', mid, D - 1.37, y0 + 2.48, W - .9, .035, .16, '#56645c');
  P('matte', mid, D - .2, y0 + 1.6, W - .4, .3, 3.2, shade(brand.bg, .6));
  // 出品台台面与点单小屏，前部保留通向店内的两侧间隙。
  const len = Math.max(1, W - 2);
  P('wood', mid, D * .55, y0 + .45, len, .7, .9, '#e8dbc3');
  P('stone', mid, D * .55, y0 + .935, len + .06, .8, .07, '#ffffff');
  if (brand.cat !== 'tea' && brand.cat !== 'cafe') {
    detail.cylinder('satin', mid, D * .55, .972, .23, .04, '#e6e1d2');
    P('wood', mid - Math.min(.75, len * .28), D * .55, y0 + .982, .42, .32, .025, '#eee3d4');
    P('matte', mid - Math.min(.75, len * .28), D * .55, y0 + 1.03, .28, .19, .07, '#c99c57');
  }
  void rand;
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
  const checkouts = Math.max(1, Math.min(7, Math.floor((W - 2) / 3.6)));
  for (const a of spread(checkouts, u0 + 1.4, u1 - 1.4)) {
    P('satin', a, 2.5, y0 + .43, .82, 1.8, .86, '#dce0d4');
    P('matte', a, 2.5, y0 + .88, .68, 1.05, .035, '#344639');
    P('metal', a, 1.88, y0 + 1.08, .08, .07, .35, '#9caa9c');
    P('matte', a, 1.88, y0 + 1.30, .30, .065, .22, '#314333');
    P('glowSoft', a, 1.838, y0 + 1.31, .25, .012, .16, '#9fbca4');
  }
  // 同一货架的层板、细立柱、包装商品分别建模，纵向通道延续到后部冷柜。
  for (let a = u0 + 1.3; a < u1 - 1.1; a += 2.6) {
    const start = 4.2, end = D - 5.2, len = end - start;
    if (len < 1) continue;
    for (const b of [start, end]) P('metal', a, b, y0 + .86, .035, .04, 1.70, '#a5afa0');
    for (let shelf = 0; shelf < 3; shelf++) {
      const h = .25 + shelf * .51;
      P('satin', a, (start + end) / 2, y0 + h, .86, len, .05, '#dfe4d6');
      const bays = Math.max(1, Math.min(9, Math.floor(len / .80)));
      for (let k = 0; k < bays; k++) {
        const b = start + .23 + k * Math.max(.1, len - .46) / Math.max(1, bays - 1);
        for (const da of [-.22, .22]) {
          const col = PRODUCE[(k + shelf * 2 + Math.abs(Math.round(a))) % PRODUCE.length];
          P('matte', a + da, b, y0 + h + .18, .24, .28, .30, col);
          P('satin', a + da, b - .145, y0 + h + .20, .18, .008, .08, '#e9e3c6');
        }
      }
    }
  }
  const islands = Math.max(1, Math.min(3, Math.floor(W / 5)));
  for (const a of spread(islands, u0 + Math.min(2, W * .3), u1 - Math.min(2, W * .3))) {
    P('wood', a, D - 3.3, y0 + .40, Math.min(2.2, W * .6), 1.35, .80, '#eadebf');
    for (let s = 0; s < 12; s++) {
      const [x, z] = F.at(a - .73 + s % 4 * .47, D - 3.58 + Math.floor(s / 4) * .3);
      B.get('matte').sphere(x, y0 + .90, z, .14, PRODUCE[s % PRODUCE.length], .13, .14, 'ico0');
    }
  }
  const fridgeW = W - 1;
  P('satin', (u0 + u1) / 2, D - .48, y0 + 1.05, fridgeW, .63, 2.1, '#cbd7ca');
  P('glowSoft', (u0 + u1) / 2, D - .813, y0 + 1.1, fridgeW - .15, .015, 1.77, '#b6cab9');
  P('glass', (u0 + u1) / 2, D - .87, y0 + 1.1, fridgeW - .08, .035, 1.85, '#ffffff');
  const doors = Math.max(1, Math.floor(fridgeW / 1.15));
  for (let i = 0; i <= doors; i++) {
    const a = u0 + .5 + i * fridgeW / doors;
    P('metal', a, D - .90, y0 + 1.10, .038, .045, 1.9, '#849785');
    if (i < doors) P('metal', a + .14, D - .93, y0 + 1.05, .025, .045, .40, '#6a846d');
  }
  void rand;
  void u;
}
