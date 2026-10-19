// 方庭（一期延展）专属陈设：1F 中庭服务台与悬挂"云朵"灯组；天台露天星空影院（LED 银幕、阶梯木平台、懒人沙发、串灯）、
// 屋顶农场（种植池、作物、玻璃温室、工具房、稻草人）、方庭观景台（抬高木平台、玻璃栏板、望远镜）。
// 其余（铺位、店面、走道、扶梯、观光梯、外立面、天窗）由通用模块生成。
import * as THREE from 'three';
import { toW } from '../../layout/geom.js';
import { COLORS } from '../theme.js';
import { rng, makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { bench } from './props.js';

export function buildSquare(ctx) {
  for (const b of ctx.layout.buildings.filter((x) => x.square)) {
    const F = b.square.F;
    const lv = (s) => ctx.layout.levels.find((l) => l.building === b.id && l.short === s);
    const rf = lv('RF');
    atrium(ctx, F, lv('1F'), lv('2F'), rf?.playableCap ? rf.elev - .75 : null);
    if (!rf) continue;
    const L = ctx.levels[rf.id];
    for (const f of rf.features) {
      if (f.type === 'cinema-open') cinema(ctx, L, f, rf.elev);
      else if (f.type === 'farm') farm(L.batch, f, rf.elev);
      else if (f.type === 'viewdeck') viewdeck(L.batch, f, rf.elev);
    }
  }
}

/** 1F 中庭服务台（主轴东侧）+ 2F/3F 中庭上空悬挂的云朵灯组 */
function atrium(ctx, F, lv1, lv2, ceiling = null) {
  if (lv1) {
    const B = ctx.levels[lv1.id].batch;
    const y = lv1.elev;
    B.frame(F, () => {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (i / 8);
        B.get('satin').box(14 + Math.cos(a) * 2.4, y + 0.55, 13 + Math.sin(a) * 1.4, 0.95, 1.1, 0.5, '#f4f1ea', -a + Math.PI / 2);
      }
      B.get('satin').box(14, y + 1.12, 13.6, 5.2, 0.06, 1.6, '#c9b37a');
      B.get('glow').box(14, y + 0.25, 12.15, 4.6, 0.06, 0.04, '#ffe2b0');
      B.get('satin').box(14, y + 2.6, 15.2, 4.2, 1.0, 0.12, '#0f6f86');
    });
  }
  if (lv2) {
    const B = ctx.levels[lv2.id].batch;
    const rand = rng(77);
    const anchor = ceiling ?? lv2.elev + 10.6;
    B.frame(F, () => {
      for (let k = 0; k < (ceiling == null ? 14 : 8); k++) {
        const x = -13 + rand() * 26, z = -6 + rand() * 12;
        const y = ceiling == null ? lv2.elev + 4.5 + rand() * 4.5 : anchor - 1.35 + rand() * .35;
        B.get('metal').box(x, (y + anchor) / 2, z, 0.02, anchor - y, 0.02, '#9aa0a6');
        for (let j = 0; j < 4; j++) B.get('glowSoft').sphere(x + (rand() - 0.5) * 1.6, y + (rand() - 0.5) * 0.5, z + (rand() - 0.5) * 1.2, 0.5 + rand() * 0.35, '#ffffff', 0.38, 0.45, 'ico');
      }
    });
  }
}

/** 露天星空影院：东侧 LED 银幕（动态画面），西向三级阶梯木平台，前排懒人沙发，四周串灯 */
function cinema(ctx, L, f, y0) {
  const B = L.batch;
  const r = f.rect;
  const W = r.x1 - r.x0, D = r.z1 - r.z0;
  const cz = (r.z0 + r.z1) / 2;
  const sx = r.x1 - 0.6;
  B.frame(f.frame, () => {
    B.get('ext').box((r.x0 + r.x1) / 2, y0 + 0.06, cz, W, 0.12, D, '#5f8f45');
    // 银幕框架
    for (const z of [cz - 8.6, cz + 8.6]) B.get('extMetal').box(sx, y0 + 4.6, z, 0.4, 9.2, 0.4, '#1d2023');
    B.get('extMetal').box(sx, y0 + 9.1, cz, 0.5, 0.4, 17.6, '#1d2023');
    B.get('ext').box(sx + 0.15, y0 + 4.9, cz, 0.12, 7.6, 16.6, '#0b0d10');
    // 阶梯木平台：离银幕最远（西端）最高，逐级降向银幕
    for (let k = 0; k < 3; k++) {
      const h = 1.8 - k * 0.6;
      B.get('ext').box(r.x0 + k * 4 + 2, y0 + h / 2, cz, 4, h, D - 4, '#a8754c');
      B.get('ext').box(r.x0 + k * 4 + 3.4, y0 + h + 0.25, cz, 0.5, 0.5, D - 5, '#7a4a2a');
    }
    // 懒人沙发
    const rand = rng(31);
    const cols = ['#e85d75', '#f2b134', '#2f86b0', '#2e9c6a', '#f6f1e7', '#7b4fd6'];
    for (let x = r.x0 + 14; x < sx - 6; x += 2.6) {
      for (let z = r.z0 + 3; z < r.z1 - 3; z += 2.4) {
        if (rand() < 0.15) continue;
        B.get('satin').sphere(x, y0 + 0.45, z, 0.75, cols[Math.floor(rand() * cols.length)], 0.42, 0.75, 'ico');
      }
    }
    // 串灯（四角灯杆）
    const posts = [[r.x0 + 0.5, r.z0 + 0.5], [r.x1 - 1.5, r.z0 + 0.5], [r.x1 - 1.5, r.z1 - 0.5], [r.x0 + 0.5, r.z1 - 0.5]];
    for (const [x, z] of posts) B.get('extMetal').cyl(x, y0, z, 0.07, 4.2, '#2b2f33', 8);
    for (let i = 0; i < 4; i++) {
      const [xa, za] = posts[i], [xb, zb] = posts[(i + 1) % 4];
      const n = Math.round(Math.hypot(xb - xa, zb - za) / 1.2);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        B.get('glow').sphere(xa + (xb - xa) * t, y0 + 4.0 - Math.sin(Math.PI * t) * 0.8, za + (zb - za) * t, 0.08, '#ffd9a0', 0.08, 0.08, 'sphereLo');
      }
    }
  });
  // 银幕画面（夜晚更亮）
  const c = makeCanvas(1024, 448);
  const g = c.getContext('2d');
  const tex = canvasTexture(c, { clamp: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(16.2, 7.2), ctx.mats.screen(tex, 0.7, 1.7));
  const [x, z] = toW(f.frame, sx - 0.05, cz);
  mesh.position.set(x, y0 + 4.9, z);
  mesh.rotation.y = -f.frame.a - Math.PI / 2;
  L.base.add(mesh);
  let last = -1;
  ctx.dynamic.push({
    update(dt, time) {
      const k = Math.floor(time * 4);
      if (k === last || !L.group.visible) return;
      last = k;
      const grd = g.createLinearGradient(0, 0, 0, 448);
      grd.addColorStop(0, '#0b1d3a');
      grd.addColorStop(1, '#2b1640');
      g.fillStyle = grd;
      g.fillRect(0, 0, 1024, 448);
      for (let i = 0; i < 60; i++) {
        const sx2 = (i * 97 + time * 8) % 1024, sy = (i * 53) % 300;
        g.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * Math.abs(Math.sin(time + i))})`;
        g.fillRect(sx2, sy, 2, 2);
      }
      g.fillStyle = '#f5d36b';
      g.beginPath();
      g.arc(820, 110, 46, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.textBaseline = 'middle';
      g.font = `800 92px ${FONT_CN}`;
      g.fillText('星空露天影院', 60, 250);
      g.font = `700 40px ${FONT_EN}`;
      g.fillText('ROOFTOP CINEMA · TONIGHT 20:00', 64, 350);
      tex.needsUpdate = true;
    },
  });
}

/** 屋顶农场：成行的种植池与作物、玻璃温室、工具房、稻草人、雨水罐 */
function farm(B, f, y0) {
  const r = f.rect;
  const rand = rng(57);
  const crops = ['#4f8a3a', '#6aa24a', '#7aa84e', '#3f7a35', '#c9a227', '#d9482b'];
  B.frame(f.frame, () => {
    const gx1 = r.x0 + 12;
    for (let x = gx1 + 1; x < r.x1 - 1; x += 3.2) {
      for (const [z0, z1] of [[r.z0 + 1, (r.z0 + r.z1) / 2 - 1], [(r.z0 + r.z1) / 2 + 1, r.z1 - 1]]) {
        const cz = (z0 + z1) / 2, len = z1 - z0;
        B.get('ext').box(x, y0 + 0.3, cz, 1.6, 0.6, len, '#8a5a36');
        B.get('ext').box(x, y0 + 0.62, cz, 1.4, 0.05, len - 0.2, '#5b4532');
        const col = crops[Math.floor(rand() * crops.length)];
        for (let z = z0 + 0.6; z < z1 - 0.4; z += 0.7) B.get('foliage').sphere(x + (rand() - 0.5) * 0.5, y0 + 0.8, z, 0.28 + rand() * 0.12, col, 0.3, 0.28, 'ico0');
      }
    }
    // 玻璃温室（西端）
    const hx = r.x0 + 6, hz = (r.z0 + r.z1) / 2, hw = 10, hd = Math.min(14, r.z1 - r.z0 - 4);
    B.get('glass').box(hx, y0 + 1.6, hz, hw, 3.2, hd, 0xffffff);
    for (const s of [-1, 1]) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), s * 0.5);
      B.get('glass').shape('box', new THREE.Vector3(hx + s * hw * 0.22, y0 + 4.3, hz), q, new THREE.Vector3(hw * 0.56, 0.05, hd), 0xffffff);
    }
    for (let k = 0; k <= 4; k++) B.get('extMetal').box(hx - hw / 2 + (k * hw) / 4, y0 + 2.3, hz, 0.08, 4.6, hd + 0.1, '#f2f2ee');
    for (let k = 0; k < 6; k++) B.get('foliage').sphere(hx - 3 + (k % 3) * 3, y0 + 0.9, hz - 3 + Math.floor(k / 3) * 6, 0.9, '#5e9a44', 0.9, 0.9, 'ico');
    // 工具房、稻草人、雨水罐
    B.get('ext').box(r.x1 - 2.5, y0 + 1.2, r.z0 + 2, 3, 2.4, 2.4, '#c8352b');
    B.get('ext').box(r.x1 - 2.5, y0 + 2.5, r.z0 + 2, 3.4, 0.2, 2.8, '#3d4248');
    const sx = (gx1 + r.x1) / 2, sz = (r.z0 + r.z1) / 2;
    B.get('ext').box(sx, y0 + 1.1, sz, 0.08, 2.2, 0.08, '#6b4d33');
    B.get('ext').box(sx, y0 + 1.7, sz, 1.4, 0.08, 0.08, '#6b4d33');
    B.get('ext').box(sx, y0 + 1.55, sz, 0.5, 0.7, 0.3, '#2f86b0');
    B.get('ext').sphere(sx, y0 + 2.15, sz, 0.22, '#f1d3b8');
    B.get('ext').cone(sx, y0 + 2.3, sz, 0.4, 0.3, '#e0a526', 10);
    B.get('extSatin').cyl(r.x1 - 1.5, y0, r.z1 - 2, 0.8, 1.8, '#2f6fd6', 16);
  });
}

/** 观景台：抬高木平台 + 台阶 + 外侧玻璃栏板 + 两台望远镜 + 长椅 */
function viewdeck(B, f, y0) {
  const r = f.rect;
  const cx = (r.x0 + r.x1) / 2;
  B.frame(f.frame, () => {
    B.get('ext').box(cx, y0 + 0.3, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.6, r.z1 - r.z0, '#9c6a43');
    for (let k = 0; k < 3; k++) B.get('ext').box(cx, y0 + 0.1 + k * 0.2, r.z1 + 0.9 - k * 0.3, 6, 0.2 + k * 0.2, 0.3, '#8a5a36');
    B.get('glass').box(cx, y0 + 1.15, r.z0 + 0.15, r.x1 - r.x0, 1.1, 0.04, 0xffffff);
    B.get('extMetal').box(cx, y0 + 1.72, r.z0 + 0.15, r.x1 - r.x0, 0.06, 0.1, COLORS.darkSteel);
    for (const x of [cx - 6, cx + 6]) {
      B.get('extMetal').cyl(x, y0 + 0.6, r.z0 + 1.2, 0.06, 1.1, '#3b4046', 8);
      B.get('extMetal').box(x, y0 + 1.8, r.z0 + 1.1, 0.25, 0.25, 0.7, '#c9ccd0', 0.3);
    }
    bench(B, cx, y0 + 0.6, r.z0 + 5, 0, 'ext');
    bench(B, cx - 9, y0 + 0.6, r.z0 + 5, 0, 'ext');
    bench(B, cx + 9, y0 + 0.6, r.z0 + 5, 0, 'ext');
  });
}
