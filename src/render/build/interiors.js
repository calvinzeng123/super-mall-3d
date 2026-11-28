// 店内陈设：按业态生成（服饰、珠宝、美妆、数码、餐饮、档口、小吃、亲子、书店、影城、电玩、超市、家居）。
import { NORMAL } from '../../layout/geom.js';
import { glassDoors } from '../../layout/frontage.js';
import { cinemaPlan, cinemaFrame, CINEMA } from '../../layout/cinema.js';
import { rng } from '../textures.js';
import { tableSet, roundTable } from './props.js';
import { homeShowroom } from './prop-sets.js';
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
export function unitFrame(u) {
  const f = u.fronts[0];
  const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
  const ux = (f.x1 - f.x0) / len, uz = (f.z1 - f.z0) / len;
  const [nx, nz] = NORMAL[f.side];
  let umin = Infinity, umax = -Infinity, vmax = 0;
  // 主体取贴着第一段门面的那块矩形。L 形铺位可能有两块都贴着门面所在的那条线，取和门面重合最长的一块
  // （原来取第一块，会把整间店的陈设摆进一条 1 m 宽的边条里）。
  const touching = u.rects.filter((r) => (f.side === 'N' && Math.abs(r.z0 - f.z0) < 0.01) || (f.side === 'S' && Math.abs(r.z1 - f.z0) < 0.01)
    || (f.side === 'W' && Math.abs(r.x0 - f.x0) < 0.01) || (f.side === 'E' && Math.abs(r.x1 - f.x0) < 0.01));
  const along = f.side === 'N' || f.side === 'S' ? ['x0', 'x1'] : ['z0', 'z1'];
  const shared = (r) => Math.min(r[along[1]], Math.max(f[along[0]], f[along[1]])) - Math.max(r[along[0]], Math.min(f[along[0]], f[along[1]]));
  const main = touching.sort((p, q) => shared(q) - shared(p))[0] || u.rects[0];
  for (const [x, z] of [[main.x0, main.z0], [main.x1, main.z0], [main.x1, main.z1], [main.x0, main.z1]]) {
    const du = (x - f.x0) * ux + (z - f.z0) * uz;
    const dv = -((x - f.x0) * nx + (z - f.z0) * nz);
    umin = Math.min(umin, du); umax = Math.max(umax, du); vmax = Math.max(vmax, dv);
  }
  return { f, ux, uz, nx, nz, umin, umax, depth: vmax, main, ang: Math.atan2(-uz, ux), at: (a, b) => [f.x0 + ux * a - nx * b, f.z0 + uz * a - nz * b] };
}

/**
 * 铺位局部坐标 (a, b) 里的朝向换成摆模型用的转角（模型正面转后朝 (sin, cos)）。
 * face：0 朝店内（+b），Math.PI 朝门口，Math.PI / 2 朝 +a，−Math.PI / 2 朝 −a。
 */
export function faceAngle(F, face) {
  const sin = Math.sin(face), cos = Math.cos(face);
  return Math.atan2(F.ux * sin - F.nx * cos, F.uz * sin - F.nz * cos);
}

export function buildInteriors(ctx) {
  for (const _ of buildInteriorsSteps(ctx)); // eslint-disable-line no-unused-vars
}

/** 同 buildInteriors，每布置完一间铺位让出一次（按需加载的楼层分帧搭建时用，见 floor-detail-scene.js） */
export function* buildInteriorsSteps(ctx) {
  for (const lv of ctx.layout.levels) {
    if (lv.kind === 'roof' || lv.kind === 'parking') continue;
    const L = ctx.levels[lv.id];
    for (let i = 0; i < lv.units.length; i++) {
      const u = lv.units[i];
      if (u.residence) continue; // 塔楼房间由单层惰性内饰构建器负责。
      if (storeStyle(lv, u) === 'bar' || u.brand.cat === 'rink') continue;
      L.batch.frame(u.frame, () => L.signs.frame(u.frame, () => furnish(L, ctx.atlas[lv.id], lv, u, rng(1000 + i * 31 + Math.round(lv.elev * 7) + lv.id.length * 13))));
      yield `${u.id} ${u.brand.cat}`;
    }
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
  // 贴图模型：face 是朝向——0 朝店内（+b），Math.PI 朝门口，Math.PI / 2 朝 +a，−Math.PI / 2 朝 −a；没有模型库时返回 false。
  // 朝向按 (a, b) 坐标里的方向换算成铺位坐标里的转角：门面在南侧或东侧的铺位，(a, b) 是左手系，
  // 直接拿角度相加会把朝两侧的椅子转反。
  const prop = (id, a, b, h = 0, face = Math.PI, scale = 1, opts) => {
    const [x, z] = F.at(a, b);
    return B.prop(id, x, y0 + h, z, faceAngle(F, face), scale, opts);
  };
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
  // 一期（游览布局有 lv.finishes）原来店里一律铺地毯，俯视看店里是一片暗褐色；效果图里店里是亮的石材、浅木地板。
  // 影院、电玩还是地毯，其余和别的楼一样按业态铺浅木/石材，默认的「satin」换成抛光的奶油色石材
  const carpeted = lv.finishes && ['cinema', 'arcade'].includes(cat);
  // 一期的木地板只给餐饮和书店（木纹贴图俯视偏深褐色），时装、家居、奢侈品也用奶油色石材，像效果图里亮白的店面
  const woodCats = lv.finishes ? ['books', 'cafe', 'tea', 'restaurant'] : ['books', 'cafe', 'tea', 'home', 'fashion', 'luxury'];
  const floorKey = carpeted ? 'carpet' : woodCats.includes(cat) ? 'wood'
    : ['jewelry', 'beauty', 'tech', 'accessory'].includes(cat) || lv.finishes ? 'stone' : 'satin';
  const carpetTint = ['cinema', 'arcade', 'jewelry'].includes(cat) ? '#607878'
    : ['restaurant', 'cafe', 'tea', 'snack'].includes(cat) ? '#b19a80'
    : ['kids', 'books', 'home', 'studio'].includes(cat) ? '#9da78b' : '#c1b5a1';
  const floorTint = floorKey === 'carpet' ? carpetTint : floorKey === 'wood' ? '#eee6d9' : floorKey === 'stone' ? '#eeece5' : floorCol;
  for (const r of u.rects) B.get(floorKey).box((r.x0 + r.x1) / 2, y0 + 0.008, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 0.2, 0.016, r.z1 - r.z0 - 0.2, floorTint);
  // 一期游览布局：店里地面每 3.6 m 一团暖光（灯下的光斑贴花，比走道上的暖一点），俯视时店里像效果图那样亮堂、发暖
  if (lv.finishes && !carpeted) for (const r of u.rects) {
    const nx = Math.max(1, Math.round((r.x1 - r.x0) / 3.6)), nz = Math.max(1, Math.round((r.z1 - r.z0) / 3.6));
    const sx = (r.x1 - r.x0) / nx, sz = (r.z1 - r.z0) / nz;
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) B.pool(r.x0 + (i + .5) * sx, y0, r.z0 + (k + .5) * sz, Math.min(3.4, sx), Math.min(3.4, sz), 0xffcf96);
  }

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

  // 一期游览布局：大档口（≥ 100 m²）出品台前面摆堂食桌椅，不再是整片空地板只在最里面有灶台。
  const stallSeating = () => {
    if (!lv.finishes || W * D < 100) return;
    const cols = Math.max(1, Math.floor((W - 1) / 2.4));
    for (let b = 2.9; b < D * .55 - 1.3; b += 2.4) {
      for (const a of spread(cols, u0 + 1.3, u1 - 1.3)) {
        const [x, z] = F.at(a, b);
        if (B.unfit(x, z, 1.4)) continue;
        roundTable(B, x, y0, z, 3, { chair: shade(u.brand.bg, .2).getStyle() });
        detail.tableware(a, b, .77);
      }
    }
  };

  switch (cat) {
    case 'fashion': case 'luxury': case 'accessory': case 'shoes': case 'sports': {
      // 陈列沿两侧展开，中间保留连续进深通道；支架与衣物分开，商品有实际轮廓。
      // 一期游览布局：大铺位的鞋架/包架沿进深一直排到底，不再三组就停，俯视店里不再空一半。
      const bays = Math.max(1, Math.min(lv.finishes ? 6 : 3, Math.floor((D - 3.4) / 1.7)));
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
          const railEnd = Math.max(2.5, Math.min(D - 2, lv.finishes ? D : 10.2));
          P('metal', a, (2.0 + railEnd) / 2, y0 + 1.88, .035, railEnd - 2, .035, '#b4af9d');
          for (const b of [2, railEnd]) P('metal', a, b, y0 + .94, .035, .035, 1.88, '#b4af9d');
          for (let b = 2.25; b < railEnd; b += .64) detail.shirt(a, b, 1.79, CLOTHES[Math.floor(rand() * CLOTHES.length)], Math.PI / 2);
        }
      }
      if (W > 6 && D > 6) {
        // 岛台分居两侧，入口到收银台之间留 1.8m 中央通道。
        // 一期游览布局：岛台与挂衣架沿进深交替排满（每 3 m 一排），而不是只在中段摆一对。
        const islandRows = lv.finishes && D > 8.5 ? [] : [D * .48];
        if (lv.finishes && D > 8.5) for (let b = 3.0; b < D - 2.8; b += 3.0) islandRows.push(b);
        for (const b of islandRows) for (const a of [u0 + W * .27, u1 - W * .27]) {
          const len = Math.min(1.5, W * .23);
          P('wood', a, b, y0 + .42, len, .9, .84, '#eee3d4');
          P('stone', a, b, y0 + .86, len + .05, .95, .06, '#f6f3eb');
          for (let k = 0; k < 3; k++) {
            const x = a - len * .29 + k * len * .29;
            if (cat === 'accessory' || cat === 'luxury') detail.bag(x, b, .89, CLOTHES[(k + 3) % CLOTHES.length]);
            else if (cat === 'shoes' || cat === 'sports') detail.shoe(x, b, .89, CLOTHES[k]);
            else for (let h = 0; h < 3; h++) P('matte', x, b, y0 + .92 + h * .045, .32, .38, .038, CLOTHES[(k * 2 + h) % CLOTHES.length]);
          }
        }
        const rackRows = lv.finishes && D > 8.5 ? islandRows.slice(0, -1).map(b => b + 1.5) : D > 9 ? [D * .72] : [];
        for (const b of rackRows) {
          rackRow(u0 + 1.6, mid - 1.0, b);
          rackRow(mid + 1.0, u1 - 1.6, b);
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
        const rows = lv.finishes && D > 9 ? spread(Math.floor((D - 3.5) / 2.6), 2.6, D - 2.6) : [D * 0.35, D * 0.65];
        for (const b of rows) {
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
        // 贴图模型：台面上的蛋糕、可颂和门口的立式黑板
        prop(cat === 'tea' ? 'teapot' : 'cake_carrot', mid + .55, b - .1, 1.13, Math.PI, 1.25);
        prop(cat === 'tea' ? 'tea_cup' : 'croissant', mid + .95, b - .18, 1.13, Math.PI + .6, 1.3);
        // 立式黑板摆在店门外、门洞旁边，牌面朝走道
        const flen = Math.hypot(F.f.x1 - F.f.x0, F.f.z1 - F.f.z0), door = glassDoors(style, flen);
        if (door.width && flen > 5.5) prop('chalkboard', flen / 2 + door.width / 2 + .8, -.55, 0, Math.PI - .3, .78);
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
          if (B.unfit(x, z, 1.4)) continue; // 店门里面留出过道；楼板外、洞口上、墙里不摆
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
          if (B.unfit(x, z, 1.4)) continue; // 店门里面留出过道；楼板外、洞口上、墙里不摆
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
      stallSeating();
      break;
    }
    case 'snack': {
      stallKitchen(P, detail, u0, u1, D, y0, u.brand, rand);
      for (let k = 0; k < 3; k++) for (let s = 0; s < 3; s++) P('satin', u0 + 1 + k * 0.7, 1.6, y0 + 1.15 + s * 0.16, 0.5, 0.5, 0.15, '#d9c19a');
      stallSeating();
      break;
    }
    case 'bakery': {
      const count = Math.max(1, Math.min(3, Math.floor((W - 1.5) / 1.8)));
      const caseRows = lv.finishes && D > 9 ? [D * .3, D * .48, D * .66].filter(b => b < D - 2.6) : [D * .48];
      for (const b of caseRows) for (const a of spread(count, u0 + 1.2, u1 - 1.2)) {
        P('wood', a, b, y0 + .42, 1.35, .9, .84, '#eee3d4');
        detail.pastryCase(a, b, .86);
      }
      counter(u1 - 1.4, D - 1.3, 1.8);
      for (let shelf = 0; shelf < 3; shelf++) {
        const h = .65 + shelf * .52;
        P('wood', mid, D - .45, y0 + h, W - 1.1, .58, .07, '#eee3d4');
        const count = Math.min(10, Math.floor((W - 1.4) / .48));
        for (let k = 0; k < count; k++) {
          const [x, z] = F.at(u0 + .9 + k * (W - 1.8) / Math.max(1, count - 1), D - .45);
          if (!B.prop(['croissant', 'burger_bun', 'croissant'][(k + shelf) % 3], x, y0 + h + .035, z, F.ang + k * 1.9, (k + shelf) % 3 === 1 ? 2.1 : 1.5))
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
      // 一期游览布局：玻璃展柜按 2.2 m 间距排满店中间（中轴留通道），原来只有 4 个，大店中间一片空。
      const toyCases = [];
      if (lv.finishes && W > 6 && D > 8) {
        const cols = Math.max(2, 2 * Math.floor((W - 3) / 4.4));
        for (let b = 3.0; b < D - 2.2; b += 2.2) for (const a of spread(cols, u0 + 1.7, u1 - 1.7)) if (Math.abs(a - mid) > .8) toyCases.push([a, b]);
      } else for (let k = 0; k < 4; k++) toyCases.push([mid - 1.2 + (k % 2) * 2.4, D * .4 + Math.floor(k / 2) * 2]);
      for (const [a, b] of toyCases) {
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
        if (B.unfit(x, z, 1.4)) continue;
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
      // 影城：入口大堂、候场区、走廊、阶梯放映厅——摆在哪、多大和导航是同一份（layout/cinema.js），看到的实心东西就挡人
      cinemaInterior(B, cinemaPlan(u), y0, H);
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
      // 贴图模型：每家店按铺位号取一种风格（现代、中式、古典、餐厅），四组样板间。
      // 一组占地约 2.2 m × 2.4 m，两侧墙边各有 0.65 m 的货架：中间够 4.8 m 摆两列，不够就摆一列、一组一排；
      // 中间不到 2.3 m 的小铺不摆。第一排从店门往里 3 m 起，不占门里面的过道；
      // 哪一组的位置挡了门、贴了墙或出了楼板，整组不摆。
      if (B.hasProp('sofa2')) {
        const free = W - 1.3, cols = free >= 4.8 ? 2 : 1, variant = [...u.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);
        for (let k = 0; k < (lv.finishes ? 8 : 4) && free >= 2.3; k++) {
          const a = u0 + .65 + (k % cols + .5) * (free / cols), b = 3.0 + Math.floor(k / cols) * 2.6;
          if (b > D - 1.3) break;
          if (B.unfit(...F.at(a, b), 1.3)) continue;
          homeShowroom(prop, variant, k, a, b, H);
        }
      }
      for (let k = 0; k < 4 && !B.hasProp('sofa2'); k++) {
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

/** 七段数码管：数字 d 的哪几段亮（a 上、b 右上、c 右下、d 下、e 左下、f 左上、g 中） */
const SEG7 = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
const POSTERS = ['#c0392b', '#1f6feb', '#e6a817', '#7b2cbf', '#0f9d76', '#d6336c', '#f2622e', '#2b9bd6'];

/**
 * 影城（layout/cinema.js 的平面）：放映厅（阶梯看台、一把把有坐垫椅背扶手的座椅、带台阶的过道、银幕、壁灯、厅号、出口灯）、
 * 走廊、检票口、售票台、卖品部、排队栏杆、场次屏、柱子、候场区的长椅、海报灯箱、服务台。
 * 全都写进这一层的合并批次（每种材质一次绘制），座椅两百来把也不多一次绘制调用。坐标是规范坐标 (a, b)，经 cinemaFrame 换到铺位局部坐标。
 */
function cinemaInterior(B, plan, y0, H) {
  if (!plan.frame) return;
  const C = CINEMA, K = cinemaFrame(plan.frame), h = H - 0.3;
  /** 规范坐标里的盒子：中心 (a, b)、底面离地 y、尺寸 sa × sb × sy */
  const box = (key, a, b, y, sa, sb, sy, color) => { if (sa <= 0 || sb <= 0 || sy <= 0) return; const [x, z] = K.at(a, b), [sx, sz] = K.size(sa, sb); B.get(key).box(x, y0 + y + sy / 2, z, sx, sy, sz, color); };
  const span = (key, a0, b0, a1, b1, y, sy, color) => box(key, (a0 + a1) / 2, (b0 + b1) / 2, y, Math.abs(a1 - a0), Math.abs(b1 - b0), sy, color);
  const post = (key, a, b, y, r, sy, color, seg = 8) => { const [x, z] = K.at(a, b); B.get(key).cyl(x, y0 + y, z, r, sy, color, seg); };
  /** 立在墙上的一块（贴着 b 等于常数的墙，横向沿 a）：中心 (a, b)，宽 w、高 hh，厚 t */
  const panelB = (key, a, b, y, w, hh, t, color) => box(key, a, b, y, w, t, hh, color);
  const panelA = (key, a, b, y, w, hh, t, color) => box(key, a, b, y, t, w, hh, color);
  // 站在走廊里（朝 −b 看）的人的右手是不是 +a：数字别画成镜像
  const m = K.dirB[1] * K.dirA[0] - K.dirB[0] * K.dirA[1] >= 0 ? 1 : -1;
  /** 七段数字（贴在 b 等于常数的墙面上，从 +b 那一侧看） */
  const digit = (n, a, b, y, s, color) => {
    const on = SEG7[n] || '', t = s * 0.16, w = s * 0.55;
    const segs = { a: [0, s, w, t], g: [0, s / 2, w, t], d: [0, 0, w, t], f: [-w / 2, s * 0.75, t, s / 2], b: [w / 2, s * 0.75, t, s / 2], e: [-w / 2, s * 0.25, t, s / 2], c: [w / 2, s * 0.25, t, s / 2] };
    for (const k of on) { const [da, dy, sw, sh] = segs[k]; panelB('glow', a + m * da, b, y + dy - sh / 2, sw, sh, 0.02, color); }
  };
  const wallBox = (w, height, color, y = 0) => {
    const [a0, b0] = [w.x0, w.z0], len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0); if (len < 0.05) return;
    const alongX = Math.abs(w.z1 - w.z0) < 1e-6;
    B.get('matte').box((w.x0 + w.x1) / 2, y0 + y + height / 2, (w.z0 + w.z1) / 2, alongX ? len + 0.2 : 0.2, height, alongX ? 0.2 : len + 0.2, color);
    void a0; void b0;
  };

  // ---------- 放映厅 ----------
  for (const hall of plan.halls) {
    const { a0, a1, b0, b1, sb } = hall, am = (a0 + a1) / 2;
    span('matte', a0, sb, a1, b1, 0.016, 0.02, '#1b1216'); // 银幕前那块地：深色地毯
    // 银幕：黑色遮幅框 + 发光的幕面，挂在银幕墙里侧
    const sw = hall.screen.a1 - hall.screen.a0, sy = Math.min(3.3, h - 1.4);
    panelB('matte', am, b1 - 0.13, 0.85, sw + 0.5, sy + 0.4, 0.04, '#07070a');
    panelB('glow', am, b1 - 0.16, 1.05, sw, sy, 0.02, '#cfd6e8');
    // 看台：一级一级，台面深红地毯、前沿一条灯带
    for (const t of hall.tiers) {
      span('matte', a0 + C.aisle, t.b0, a1 - C.aisle, t.b1, 0, t.top, '#2b1a20');
      panelB('glowSoft', am, t.b1 + 0.006, t.top - 0.05, a1 - a0 - 2 * C.aisle - 0.1, 0.025, 0.01, '#ffb35c');
    }
    // 座椅：每把都是座盆、坐垫、椅背、底座，两把之间一根扶手（带杯托）
    for (const row of hall.rows) {
      const y = row.base, bb = row.b, half = C.seat.w / 2;
      for (const a of row.seats) {
        box('matte', a, bb + 0.3, y, 0.26, 0.26, 0.32, '#1a1a1e');                 // 底座
        box('satin', a, bb + 0.32, y + 0.32, 0.5, 0.5, 0.14, '#9e1b2f');           // 坐垫
        box('satin', a, bb + 0.06, y + 0.4, 0.5, 0.12, C.seat.back - 0.42, '#a51f33'); // 椅背
        box('matte', a, bb - 0.005, y + 0.42, 0.52, 0.03, C.seat.back - 0.46, '#2a0e15'); // 椅背后壳
      }
      const first = row.seats[0] - half, n = row.seats.length;
      for (let j = 0; j <= n; j++) {
        const a = first + j * C.seat.w;
        box('matte', a, bb + 0.3, y, 0.06, 0.08, 0.62, '#1f1f24');                  // 扶手立柱
        box('satin', a, bb + 0.3, y + 0.62, 0.07, 0.56, 0.05, '#2c2c33');           // 扶手
        if (j > 0 && j < n) post('metal', a, bb + 0.55, y + 0.58, 0.035, 0.07, '#3a3a42', 6); // 杯托
      }
    }
    // 过道：每级半排高的台阶（和导航里的坡道一样高），台阶口一条灯，墙边一根扶手
    for (const ai of hall.aisles) {
      const len = ai.b1 - ai.b0, n = Math.max(1, Math.round((ai.b1 - b0) / (C.pitch / 2)));
      for (let j = 0; j < n; j++) {
        const s1 = ai.b1 - j * (C.pitch / 2), s0 = j === n - 1 ? b0 : s1 - C.pitch / 2, um = Math.min(len, ai.b1 - (s0 + s1) / 2);
        const top = ai.y0 + (ai.y1 - ai.y0) * Math.max(0, um) / len;
        span('matte', ai.a0, s0, ai.a1, s1, 0, top, '#24161b');
        panelB('glowSoft', (ai.a0 + ai.a1) / 2, s1 + 0.005, top - 0.03, ai.a1 - ai.a0 - 0.2, 0.02, 0.01, '#9fd8ff');
      }
      const wa = Math.abs(ai.a0 - a0) < 0.01 ? a0 + 0.09 : a1 - 0.09, [xb, zb] = K.at(wa, ai.b1), [xt, zt] = K.at(wa, ai.b0);
      B.get('metal').bar({ x: xb, y: y0 + ai.y0 + 0.9, z: zb }, { x: xt, y: y0 + ai.y1 + 0.9, z: zt }, 0.045, '#8c8f96');
    }
    // 壁灯：两侧墙上，跟着看台往后升
    const tierTop = (b) => (hall.tiers.find((t) => b >= t.b0 && b <= t.b1)?.top ?? 0);
    for (let b = sb - 0.6; b > b0 + 0.5; b -= 2.4) for (const [wa, side] of [[a0 + 0.13, 1], [a1 - 0.13, -1]]) {
      panelA('matte', wa, b, tierTop(b) + 2.0, 0.3, 0.42, 0.06, '#2a2024');
      panelA('glowSoft', wa + side * 0.035, b, tierTop(b) + 2.03, 0.18, 0.36, 0.02, '#ffcf8a');
    }
    // 门：门框、门头；里面门上方绿色出口灯，外面（走廊那一侧）门上方厅号灯箱
    for (const d of hall.doors) {
      const dc = (d.a0 + d.a1) / 2, dw = d.a1 - d.a0;
      for (const ja of [d.a0 + 0.04, d.a1 - 0.04]) box('metal', ja, b1, 0, 0.08, 0.26, 2.25, '#6d6f76');
      box('matte', dc, b1, 2.25, dw, 0.22, h - 2.25, '#3a2a30');
      panelB('glow', dc, b1 - 0.13, 2.38, 0.56, 0.22, 0.03, '#25d366');
      panelB('glow', dc - 0.12, b1 - 0.15, 2.43, 0.1, 0.12, 0.01, '#f2fff6');
      if (!d.exit) {
        panelB('matte', dc, b1 + 0.13, 2.45, 0.9, 0.62, 0.04, '#121216');
        digit(hall.n, dc + m * 0.12, b1 + 0.16, 2.55, 0.42, '#ffd166');
        panelB('glow', dc - m * 0.26, b1 + 0.16, 2.6, 0.12, 0.12, 0.01, '#ffd166');
      } else {
        panelB('glow', dc, b1 + 0.13, 2.38, 0.56, 0.22, 0.03, '#25d366');
      }
    }
  }
  // 厅墙、走廊和大堂之间的隔墙（深色吸音墙面）
  for (const w of plan.walls) wallBox(w, h, '#3a2a30');
  const corr = plan.corridor;
  if (corr) {
    span('matte', corr.a0, corr.b0, corr.a1, corr.b1, 0.016, 0.02, '#2d1c25');
    span('matte', corr.a0 + 0.4, corr.b0 + 0.6, corr.a1 - 0.4, corr.b1 - 0.6, 0.036, 0.004, '#7a1e2e'); // 走廊地毯
    for (let a = corr.a0 + 1.6; a < corr.a1 - 1; a += 3.2) panelB('glowSoft', a, (corr.b0 + corr.b1) / 2, h - 0.08, 0.5, 0.04, 0.5, '#ffe6bf');
    // 走廊靠大堂那面墙上的海报灯箱（检票口两边）
    const [c0, c1] = plan.check;
    for (let a = corr.a0 + 1.4; a < corr.a1 - 1; a += 2.4) if (a + 0.7 < c0 - 0.2 || a - 0.7 > c1 + 0.2) { panelB('matte', a, corr.b1 - 0.13, 0.9, 1.3, 1.95, 0.05, '#18141a'); panelB('glow', a, corr.b1 - 0.16, 0.98, 1.16, 1.78, 0.02, POSTERS[Math.round(a * 7) % POSTERS.length]); }
    // 检票口：门头、两边的检票台；门头上（大堂那一侧）一块场次屏
    box('matte', (c0 + c1) / 2, corr.b1, 2.6, c1 - c0, 0.24, h - 2.6, '#3a2a30');
    const sb2 = corr.b1 + 0.14, sw2 = Math.min(5.2, plan.frame.W - 6);
    panelB('matte', (c0 + c1) / 2, sb2, 2.75, sw2 + 0.2, 1.35, 0.06, '#0d0f14');
    panelB('glow', (c0 + c1) / 2, sb2 + 0.035, 2.82, sw2, 1.2, 0.01, '#0f1a2c');
    for (let i = 0; i < 5; i++) {
      const y = 3.82 - i * 0.22, a = (c0 + c1) / 2 - sw2 / 2 + 0.2;
      panelB('glow', a + 0.35, sb2 + 0.045, y, 0.5, 0.1, 0.005, i % 2 ? '#7fd1ff' : '#ffd166');
      panelB('glow', a + 1.3 + (i % 3) * 0.2, sb2 + 0.045, y, 1.4 - (i % 3) * 0.3, 0.08, 0.005, '#e6edf7');
      for (let k = 0; k < 3; k++) panelB('glow', a + sw2 - 1.65 + k * 0.5, sb2 + 0.045, y, 0.36, 0.08, 0.005, k === i % 3 ? '#25d366' : '#9aa7b8');
    }
  }
  // ---------- 入口大堂 ----------
  const fo = plan.foyer;
  if (fo) {
    const desk = (d, concession) => {
      if (!d) return;
      const bb = d.b0 + C.backbar.d, cb = d.b1 - C.counter.d, wa = d.a1 - d.a0, mid = (d.a0 + d.a1) / 2;
      span('matte', d.a0, d.b0, d.a1, d.b1, 0.016, 0.02, '#20181c');
      // 后柜（靠墙）和上面的价目灯箱
      span('wood', d.a0, d.b0, d.a1, bb, 0, C.backbar.h, '#5a3524');
      for (let k = 0; k < Math.floor(wa / 1.6); k++) panelB('glow', d.a0 + 0.8 + k * 1.6, d.b0 + 0.02, 2.5, 1.4, 0.8, 0.02, concession ? ['#f2a51a', '#e8590c', '#d6336c'][k % 3] : '#1b2a44');
      // 柜台：台身、亮色台面、台口一条灯带；两头封板（台里面进不去）
      span('satin', d.a0, cb, d.a1, d.b1, 0, C.counter.h - 0.05, concession ? '#7a1b24' : '#2b2f3a');
      span('satin', d.a0 - 0.03, cb - 0.05, d.a1 + 0.03, d.b1 + 0.05, C.counter.h - 0.05, 0.05, '#e9e2d0');
      panelB('glowSoft', mid, d.b1 + 0.005, 0.12, wa - 0.2, 0.04, 0.01, '#ffcf8a');
      for (const ea of [d.a0 + 0.04, d.a1 - 0.04]) span('satin', ea - 0.04, bb, ea + 0.04, cb, 0, C.counter.h, concession ? '#7a1b24' : '#2b2f3a');
      if (concession) {
        // 爆米花机、饮料机、一摞纸桶
        span('glass', mid - 1.4, cb + 0.1, mid - 0.7, cb + 0.6, C.counter.h, 0.7, '#fff6d6');
        span('glow', mid - 1.35, cb + 0.15, mid - 0.75, cb + 0.55, C.counter.h + 0.02, 0.32, '#ffd54a');
        span('metal', mid + 0.2, cb + 0.1, mid + 0.9, cb + 0.55, C.counter.h, 0.6, '#9aa0a8');
        for (let k = 0; k < 4; k++) post('satin', mid + 1.3 + k * 0.2, cb + 0.35, C.counter.h, 0.07, 0.22, k % 2 ? '#d62828' : '#f8f4ea', 8);
      } else {
        // 售票机屏幕
        for (let k = 0; k < Math.floor(wa / 1.5); k++) { const a = d.a0 + 0.75 + k * 1.5; box('matte', a, cb + 0.3, C.counter.h, 0.4, 0.06, 0.3, '#1a1a20'); box('glow', a, cb + 0.33, C.counter.h + 0.04, 0.34, 0.01, 0.22, '#7fd1ff'); }
      }
    };
    desk(fo.ticket, false); desk(fo.concession, true);
    // 排队栏杆：立柱 + 红色伸缩带
    for (const [a, r0, r1] of fo.rails) {
      const n = Math.max(1, Math.round((r1 - r0) / 1.1));
      for (let k = 0; k <= n; k++) { const b = r0 + (r1 - r0) * k / n; post('metal', a, b, 0, 0.17, 0.03, '#2d2f35', 12); post('metal', a, b, 0, 0.03, C.rail, '#b8bcc4', 8); }
      span('satin', a - 0.015, r0, a + 0.015, r1, C.rail - 0.1, 0.05, '#9b1020');
    }
    if (fo.podium) { const q = fo.podium; span('satin', q.a0, q.b0, q.a1, q.b1, 0, 1.05, '#2b2f3a'); span('glow', q.a0 + 0.1, q.b0 + 0.2, q.a1 - 0.1, q.b0 + 0.5, 1.05, 0.02, '#7fd1ff'); }
    // 柱子：石材柱身、底座、腰上一圈灯
    for (const [a, b] of fo.pillars) {
      box('stone', a, b, 0, C.pillar, C.pillar, h, '#d8d0c2');
      box('matte', a, b, 0, C.pillar + 0.06, C.pillar + 0.06, 0.12, '#2a2024');
      box('glowSoft', a, b, 2.9, C.pillar + 0.04, C.pillar + 0.04, 0.06, '#ffcf8a');
    }
  }
  // ---------- 候场区 ----------
  const lo = plan.lounge;
  if (lo) {
    for (const q of lo.benches) {
      const am = (q.a0 + q.a1) / 2, len = q.a1 - q.a0, back = q.face > 0 ? q.b0 : q.b1, sit = (q.b0 + q.b1) / 2 + q.face * 0.03;
      for (const da of [-len / 2 + 0.15, len / 2 - 0.15]) box('metal', am + da, sit, 0, 0.06, 0.4, 0.38, '#3a3c42');
      box('satin', am, sit, 0.38, len, q.b1 - q.b0 - 0.06, 0.1, '#b8322f');
      box('satin', am, back + q.face * 0.05, 0.42, len, 0.08, C.bench.h - 0.42, '#9c2a29');
    }
    for (const p of lo.posters) {
      const a = p.side === 'a0' ? 0.07 : plan.frame.W - 0.07;
      panelA('matte', a, p.b, 0.95, 1.3, 1.95, 0.06, '#18141a');
      panelA('glow', a + (p.side === 'a0' ? 0.035 : -0.035), p.b, 1.03, 1.16, 1.78, 0.02, POSTERS[Math.round(p.b * 3) % POSTERS.length]);
    }
    const d = lo.duty;
    if (d) {
      span('satin', d.a0, d.b0, d.a1, d.b1, 0, 1.0, '#2b2f3a');
      span('satin', d.a0 - 0.03, d.b0 - 0.03, d.a1 + 0.03, d.b1 + 0.03, 1.0, 0.05, '#e9e2d0');
      const face = d.side === 'a1' ? d.a0 - 0.01 : d.a1 + 0.01;
      panelA('glowSoft', face, (d.b0 + d.b1) / 2, 0.75, 1.6, 0.16, 0.01, '#7fd1ff');
      box('matte', (d.a0 + d.a1) / 2, (d.b0 + d.b1) / 2 + 0.5, 1.05, 0.4, 0.3, 0.3, '#1a1a20');
    }
  }
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
