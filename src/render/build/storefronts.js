// 店面：玻璃橱窗 + 门洞 + 门头招牌；美食档口为开敞柜台；B1M 西翼为"云澜老街"木门脸、瓦檐与红灯笼。
import * as THREE from 'three';
import { NORMAL } from '../../layout/geom.js';
import { themeOf } from '../theme.js';
import { clearHeight } from './shell.js';

export function frontFrame(f) {
  const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
  const ux = (f.x1 - f.x0) / len, uz = (f.z1 - f.z0) / len;
  const [nx, nz] = NORMAL[f.side];
  return {
    len, ux, uz, nx, nz,
    ang: Math.atan2(-uz, ux),
    /** 局部坐标：u 沿门面，v 向店内（负值为店外） */
    at: (u, v) => [f.x0 + ux * u - nx * v, f.z0 + uz * u - nz * v],
  };
}

export function shade(hex, k) {
  const c = new THREE.Color(hex);
  return k < 0 ? c.lerp(new THREE.Color('#000000'), -k) : c.lerp(new THREE.Color('#ffffff'), k);
}

/** 店面样式：布局数据里的 style 为准；美食层的档口与小吃改为开敞柜台 */
export function storeStyle(lv, u) {
  const cat = u.brand.cat;
  if (u.style === 'showroom') return 'glass';
  if (u.style && u.style !== 'glass') return u.style;
  if (lv.kind === 'food' && ['food', 'snack'].includes(cat)) return 'stall';
  if (cat === 'cinema') return 'cinema';
  return 'glass';
}

export function buildStorefronts(ctx) {
  for (const lv of ctx.layout.levels) {
    if (lv.kind === 'roof' || lv.kind === 'parking') continue;
    const L = ctx.levels[lv.id];
    const atlas = ctx.atlas[lv.id];
    for (const u of lv.units) {
      const style = storeStyle(lv, u);
      if (style === 'bar' || style === 'rink' || style === 'street' || style === 'pavilion') continue;
      L.batch.frame(u.frame, () => L.signs.frame(u.frame, () => {
        for (const f of u.fronts) front(L.batch, L.signs, lv, u, f, atlas.cell(u.id), style);
      }));
    }
  }
}

function front(B, S, lv, u, f, cell, style) {
  const F = frontFrame(f);
  const y0 = lv.elev;
  const H = clearHeight(lv);
  const glassTop = 3.7;
  const fasciaTop = Math.min(4.75, H - 0.05);
  const fy = (glassTop + fasciaTop) / 2;
  const brand = u.brand;
  const box = (key, uu, v, y, su, sv, sy, color) => {
    const [x, z] = F.at(uu, v);
    B.get(key).box(x, y, z, su, sy, sv, color, F.ang);
  };
  const frameCol = style === 'oldstreet' ? '#4a2c1a' : lv.short === '1F' ? '#a88a55' : '#3f454b';

  if (style === 'glass' || style === 'cinema' || style === 'market') {
    const doorW = F.len >= 5 ? Math.min(3.2, F.len * 0.3) : F.len >= 3 ? 1.8 : 0;
    const doors = style === 'market' ? [F.len * 0.25, F.len * 0.75] : [F.len / 2];
    const n = Math.max(1, Math.round(F.len / 1.6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * F.len, b = ((i + 1) / n) * F.len, m = (a + b) / 2;
      if (doorW && doors.some((d) => Math.abs(m - d) < doorW / 2)) continue;
      box('glass', m, 0, y0 + glassTop / 2, b - a - 0.03, 0.04, glassTop, 0xffffff);
    }
    for (let i = 0; i <= n; i++) box('metal', (i / n) * F.len, 0, y0 + glassTop / 2, 0.07, 0.12, glassTop, frameCol);
    box('metal', F.len / 2, 0, y0 + 0.02, F.len, 0.3, 0.04, '#9aa0a6');
  } else if (style === 'stall' || style === 'oldstreet') {
    const top = style === 'oldstreet' ? '#7a4a2a' : '#d8dde2';
    box('satin', F.len / 2 - 0.4, 0.45, y0 + 0.52, F.len - 1.6, 0.7, 1.04, style === 'oldstreet' ? '#5a3a22' : '#eef1f3');
    box('satin', F.len / 2 - 0.4, 0.45, y0 + 1.06, F.len - 1.5, 0.8, 0.05, top);
    // 菜单灯箱
    const k = Math.max(1, Math.floor(F.len / 2.2));
    for (let i = 0; i < k; i++) {
      const m = (i + 0.5) * (F.len / k);
      box('glow', m, 1.6, y0 + 2.75, Math.min(1.7, F.len / k - 0.3), 0.04, 0.85, i % 2 ? shade(brand.bg, 0.55) : '#fff2d6');
    }
    if (style === 'oldstreet') {
      for (let p = 0; p <= F.len + 0.01; p += F.len / Math.max(1, Math.round(F.len / 2.6))) box('matte', p, 0, y0 + 1.95, 0.24, 0.24, 3.9, '#4a2c1a');
      // 瓦檐
      const [x, z] = F.at(F.len / 2, -0.45);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, F.ang, 0));
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.38);
      const nrm = new THREE.Vector3(F.nx, 0, F.nz);
      // 局部 x 轴为门面方向；绕门面方向倾斜，使外侧下垂
      const axis = new THREE.Vector3(F.ux, 0, F.uz);
      const sgn = Math.sign(new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).dot(nrm)) || 1;
      tilt.setFromAxisAngle(axis, 0.36 * sgn);
      B.get('matte').shape('box', new THREE.Vector3(x, y0 + 4.05, z), tilt.multiply(q), new THREE.Vector3(F.len + 0.6, 0.16, 1.4), '#3d4248');
      for (const m of [F.len * 0.22, F.len * 0.78]) {
        const [lx, lz] = F.at(m, -0.85);
        B.get('glow').sphere(lx, y0 + 3.25, lz, 0.34, '#d6332a', 0.42, 0.34);
        B.get('metal').cyl(lx, y0 + 3.62, lz, 0.18, 0.08, '#d4a72c', 10);
        B.get('metal').cyl(lx, y0 + 2.8, lz, 0.18, 0.06, '#d4a72c', 10);
        B.get('glow').box(lx, y0 + 2.62, lz, 0.05, 0.3, 0.05, '#e9b949');
      }
    }
  }

  // 门头
  const fascia = style === 'oldstreet' ? '#3b2416' : shade(brand.bg, brand.bg.toLowerCase() === '#ffffff' ? -0.06 : -0.12);
  box('satin', F.len / 2, 0.05, y0 + fy, F.len + 0.02, 0.3, fasciaTop - glassTop, fascia);
  if (H > fasciaTop + 0.1) box('matte', F.len / 2, 0.08, y0 + (fasciaTop + H) / 2, F.len, 0.24, H - fasciaTop, themeOf(lv).wall);
  const maxW = F.len >= 14 ? 12 : 6.4;
  let w = Math.min(F.len * 0.78, maxW);
  let h = w / 4;
  const maxH = (fasciaTop - glassTop) * 0.92;
  if (h > maxH) { h = maxH; w = h * 4; }
  const [sx, sz] = F.at(F.len / 2, -0.17);
  S.place(sx, y0 + fy, sz, w, h, f.side, cell);
  // 侧挑招牌（门面较长时，方便在走廊里远远看到）
  if (F.len >= 6 && style !== 'stall') {
    const [bx, bz] = F.at(F.len - 0.6, -0.75);
    const bw = 1.6, bh = 0.4;
    B.get('metal').box(bx, y0 + 3.45, bz, 0.05, 0.05, 1.2, '#2b2f33', F.ang + Math.PI / 2);
    const sideA = f.side === 'N' || f.side === 'S' ? (F.ux > 0 ? 'E' : 'W') : F.uz > 0 ? 'S' : 'N';
    const sideB = { E: 'W', W: 'E', N: 'S', S: 'N' }[sideA];
    const off = 0.03;
    S.place(bx + (sideA === 'E' ? off : sideA === 'W' ? -off : 0), y0 + 3.15, bz + (sideA === 'S' ? off : sideA === 'N' ? -off : 0), bw, bh, sideA, cell);
    S.place(bx + (sideB === 'E' ? off : sideB === 'W' ? -off : 0), y0 + 3.15, bz + (sideB === 'S' ? off : sideB === 'N' ? -off : 0), bw, bh, sideB, cell);
    B.get('satin').box(bx, y0 + 3.15, bz, f.side === 'N' || f.side === 'S' ? 0.05 : bw + 0.08, bh + 0.08, f.side === 'N' || f.side === 'S' ? bw + 0.08 : 0.05, fascia);
  }
}
