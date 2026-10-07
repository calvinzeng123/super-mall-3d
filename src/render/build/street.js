// 三期 云澜里：街区楼栋外立面（红砖 / 木格栅 / 石材 / 玻璃）、店面橱窗与门头招牌、外挑连廊（柱、栏杆、楼板封边）、
// 外挂钢楼梯、屋面与设备、两层楼栋的屋顶露台（栏杆、遮阳伞、串灯、酒吧亭）、地库楼梯口玻璃亭、
// 1F 街巷小品（中心广场旱喷与舞台、梧桐小广场、行道树、庭院灯、长椅、外摆、跨巷串灯）与街区外围绿化。
// 楼栋内容按楼层放进各层的 base（街区在园区视角也显示 base），三层楼栋的屋面放进 3F 的 facade（聚焦 3F 时隐藏）。
import * as THREE from 'three';
import { toW, frame, pointInPoly, distToPolyEdge, toL, subtractInterval } from '../../layout/geom.js';
import { COLORS } from '../theme.js';
import { rng, makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { addTrees, bench, planter, umbrella, tableSet } from './props.js';
import { shade } from './storefronts.js';
import { streetDoor } from '../../layout/frontage.js';

const GAL = 2.5;
const BAY = 4;
const STEEL = '#30353a';
const SKINS = {
  brick: { wall: '#fff4e8', dark: '#d0b49c', trim: '#ece4d6', frame: '#23272b', key: 'brick' },
  timber: { wall: '#f4e9d9', dark: '#c9ad90', trim: '#3a2f27', frame: '#2a2622', key: 'wood', slats: '#efdbc3' },
  stone: { wall: '#f0e8d9', dark: '#c9beaa', trim: '#857a69', frame: '#3f454b', key: 'stone' },
  glass: { wall: '#6b7a84', dark: '#4b5760', trim: '#d5dbdf', frame: '#283036', key: 'extSatin', curtain: true },
};
const CAFE = new Set(['cafe', 'tea', 'restaurant', 'snack']);

/** 楼栋四个立面：t 为沿立面的坐标，p(t) 为局部 (u,v)，n 为外法线 */
function sidesOf(h, w) {
  return {
    N: { id: 'N', len: 2 * h, p: (t) => [-h + t, -w], n: [0, -1], along: 'u', t: (f) => [Math.min(f.x0, f.x1) + h, Math.max(f.x0, f.x1) + h] },
    S: { id: 'S', len: 2 * h, p: (t) => [-h + t, w], n: [0, 1], along: 'u', t: (f) => [Math.min(f.x0, f.x1) + h, Math.max(f.x0, f.x1) + h] },
    W: { id: 'W', len: 2 * w, p: (t) => [-h, -w + t], n: [-1, 0], along: 'v', t: (f) => [Math.min(f.z0, f.z1) + w, Math.max(f.z0, f.z1) + w] },
    E: { id: 'E', len: 2 * w, p: (t) => [h, -w + t], n: [1, 0], along: 'v', t: (f) => [Math.min(f.z0, f.z1) + w, Math.max(f.z0, f.z1) + w] },
  };
}

/** 沿立面放盒子：t∈[t0,t1]、竖向 [yA,yB]、外偏 off（+ 朝外）、厚 d */
function putSide(B, key, sd, t0, t1, yA, yB, off, d, color) {
  if (t1 - t0 < 0.01 || yB - yA < 0.01) return;
  const [u, v] = sd.p((t0 + t1) / 2);
  const cu = u + sd.n[0] * off, cv = v + sd.n[1] * off;
  if (sd.along === 'u') B.get(key).box(cu, (yA + yB) / 2, cv, t1 - t0, yB - yA, d, color);
  else B.get(key).box(cu, (yA + yB) / 2, cv, d, yB - yA, t1 - t0, color);
}

/** 区间 [0,len] 扣除开口后的墙段 */
function remainder(len, openings) {
  const out = [];
  let x = 0;
  for (const [a, b] of [...openings].sort((p, q) => p[0] - q[0])) {
    if (a - x > 0.05) out.push([x, a]);
    x = Math.max(x, b);
  }
  if (len - x > 0.05) out.push([x, len]);
  return out;
}

export function buildStreet(ctx) {
  for (const b of ctx.layout.buildings.filter((x) => x.kind === 'street')) {
    const lvs = Object.fromEntries(ctx.layout.levels.filter((l) => l.building === b.id).map((l) => [l.short, l]));
    for (const k of b.blocks) block(ctx, b, k, lvs);
    kiosks(ctx, b, lvs['1F']);
    streetscape(ctx, b, lvs['1F']);
    surroundings(ctx, b);
    basement(ctx, b, lvs.B1);
  }
}

// ---------------------------------------------------------------------------
// 楼栋

function block(ctx, b, k, lvs) {
  const skin = SKINS[k.skin] || SKINS.brick;
  const floors = [lvs['1F'], lvs['2F'], k.floors === 3 ? lvs['3F'] : null].filter(Boolean);
  const sides = sidesOf(k.h, k.w);
  floors.forEach((lv, i) => {
    const L = ctx.levels[lv.id];
    const atlas = ctx.atlas[lv.id];
    const top = lv.elev + lv.height - 0.4;
    L.batch.frame(k.F, () => L.signs.frame(k.F, () => {
      storey(L.batch, L.signs, atlas, lv, k, skin, sides, i, top);
      columns(L.batch, lv, k, lv.elev, top);
      if (i < 2) stairFlight(L.batch, lv, k, i === 0);
    }));
    if (i > 0) L.batch.frame(k.F, () => gallery(L.batch, lv, k, skin));
  });
  // 两层楼栋：3F 为屋顶露台；三层楼栋：屋面在 3F 的 facade 组，3F 连廊加雨棚
  const L3 = ctx.levels[lvs['3F'].id];
  if (k.floors === 2) L3.batch.frame(k.F, () => L3.signs.frame(k.F, () => terrace(ctx, L3, lvs['3F'], k, skin)));
  else {
    L3.facadeBatch.frame(k.F, () => roof(L3.facadeBatch, k, skin));
    L3.batch.frame(k.F, () => L3.batch.get('extMetal').box(k.h + GAL + BAY / 2, k.top - 0.12, k.w - 2.25, BAY + 0.4, 0.16, 9.9, STEEL));
  }
  // 顶层楼梯口护栏（楼梯通到 3F 为止）
  L3.batch.frame(k.F, () => wellGuard(L3.batch, lvs['3F'].elev, k));
}

/** 一层楼的四个立面：开口（门面、卫生间门）处为橱窗 / 门，其余为墙（楼上开窗）；转角壁柱与楼板封边 */
function storey(B, S, atlas, lv, k, skin, sides, idx, top) {
  const y0 = lv.elev;
  const ground = idx === 0;
  const units = lv.units.filter((u) => u.block === k.n && u.style !== 'pavilion');
  const doors = lv.rooms.filter((m) => m.block === k.n && m.type === 'wc').flatMap((m) => m.doors.map((d) => ({ d, m })));
  for (const sd of Object.values(sides)) {
    const opens = [];
    for (const u of units) for (const f of u.fronts) if (f.side === sd.id) opens.push({ t: sd.t(f), u, f });
    for (const { d } of doors) if (d.side === sd.id) opens.push({ t: sd.t(d), door: true });
    for (const o of opens) {
      if (o.door) wcDoor(B, sd, o.t, y0, top, skin);
      else if (ground) shopfront(B, S, atlas, sd, o.t, y0, top, o.u, skin, true);
      else shopfront(B, S, atlas, sd, o.t, y0, top, o.u, skin, false);
    }
    for (const [a, c] of remainder(sd.len, opens.map((o) => o.t))) wall(B, sd, a, c, y0, top, skin, ground);
    // 门面之间的壁柱
    const cuts = new Set();
    for (const o of opens) for (const t of o.t) if (t > 0.3 && t < sd.len - 0.3) cuts.add(t.toFixed(2));
    for (const t of cuts) putSide(B, skin.key, sd, +t - 0.25, +t + 0.25, y0, top, 0.05, 0.45, skin.dark);
    // 楼板封边（本层顶）与勒脚
    putSide(B, 'stone', sd, -0.05, sd.len + 0.05, top, top + 0.32, 0.04, 0.36, skin.trim);
    putSide(B, 'extMetal', sd, -0.08, sd.len + 0.08, top + 0.32, top + 0.39, 0.12, 0.52, skin.frame);
    if (ground) {
      const gaps = opens.map((o) => o.door ? o.t : [(o.t[0] + o.t[1] - streetDoor(o.t[1] - o.t[0])) / 2, (o.t[0] + o.t[1] + streetDoor(o.t[1] - o.t[0])) / 2]);
      for (const [a, c] of gaps.reduce((ivs, g) => subtractInterval(ivs, g), [[0, sd.len]])) putSide(B, 'stone', sd, a, c, y0, y0 + 0.32, 0.06, 0.32, '#8c867b');
    }
    // 雨水立管紧贴实心转角，不占门洞或外挑连廊净宽。
    if (sd.id === 'N' || sd.id === 'S') {
      const [u, v] = sd.p(0.34);
      B.get('extMetal').cyl(u + sd.n[0] * 0.28, y0 + 0.08, v + sd.n[1] * 0.28, 0.065, top - y0 + 0.25, skin.frame, 8);
      for (const yy of [y0 + 0.65, top - 0.6]) putSide(B, 'extMetal', sd, 0.21, 0.47, yy, yy + 0.07, 0.22, 0.22, skin.frame);
    }
  }
  // 转角壁柱
  for (const [u, v] of [[-k.h, -k.w], [k.h, -k.w], [k.h, k.w], [-k.h, k.w]]) B.get(skin.key).box(u, (y0 + top) / 2, v, 0.62, top - y0, 0.62, skin.dark);
}

/** 墙段：1F 实墙（勒脚 + 腰线）；楼上为窗墙（窗洞、窗框、窗台），玻璃楼栋为幕墙，木楼栋外加竖向格栅 */
function wall(B, sd, a, c, y0, top, skin, ground) {
  const len = c - a;
  if (ground || len < 2.2) {
    putSide(B, skin.key, sd, a, c, y0, top, -0.15, 0.3, skin.wall);
    if (!ground) return;
    putSide(B, 'stone', sd, a, c, y0 + 3.55, y0 + 3.75, 0.03, 0.34, skin.trim);
    if (skin.slats) slats(B, sd, a, c, y0 + 0.4, top, []);
    return;
  }
  if (skin.curtain) {
    putSide(B, 'glassTint', sd, a, c, y0 + 0.1, top, -0.08, 0.06, 0xffffff);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) putSide(B, 'extMetal', sd, a + (len * i) / n - 0.04, a + (len * i) / n + 0.04, y0, top, 0.02, 0.22, skin.frame);
    putSide(B, 'extMetal', sd, a, c, y0 + 2.95, y0 + 3.05, 0.02, 0.2, skin.frame);
    return;
  }
  const n = Math.max(1, Math.floor(len / 3.2));
  const ww = Math.min(1.6, len / n - 0.8);
  const sill = y0 + 0.9, head = y0 + 3.0;
  const wins = Array.from({ length: n }, (_, i) => a + (len * (i + 0.5)) / n);
  putSide(B, skin.key, sd, a, c, y0, sill, -0.15, 0.3, skin.wall);
  putSide(B, skin.key, sd, a, c, head, top, -0.15, 0.3, skin.wall);
  let x = a;
  for (const m of wins) {
    putSide(B, skin.key, sd, x, m - ww / 2, sill, head, -0.15, 0.3, skin.wall);
    x = m + ww / 2;
    putSide(B, 'glassTint', sd, m - ww / 2, m + ww / 2, sill, head, -0.22, 0.05, 0xffffff);
    // 外挑石窗台 + 滴水边，内凹玻璃后有可读的窗洞深度。
    putSide(B, 'stone', sd, m - ww / 2 - 0.1, m + ww / 2 + 0.1, sill - 0.13, sill + 0.02, 0.01, 0.52, '#ded7ca');
    putSide(B, 'extMetal', sd, m - ww / 2 - 0.06, m + ww / 2 + 0.06, sill - 0.14, sill - 0.105, 0.24, 0.035, skin.frame);
    putSide(B, 'extMetal', sd, m - ww / 2 - 0.06, m - ww / 2 + 0.02, sill, head, -0.12, 0.2, skin.frame);
    putSide(B, 'extMetal', sd, m + ww / 2 - 0.02, m + ww / 2 + 0.06, sill, head, -0.12, 0.2, skin.frame);
    putSide(B, 'extMetal', sd, m - ww / 2, m + ww / 2, head - 0.02, head + 0.06, -0.12, 0.2, skin.frame);
    putSide(B, 'extMetal', sd, m - 0.03, m + 0.03, sill, head, -0.18, 0.06, skin.frame);
    putSide(B, 'extMetal', sd, m - ww / 2, m + ww / 2, head - 0.55, head - 0.51, -0.18, 0.08, skin.frame);
    if (skin === SKINS.brick) {
      putSide(B, 'brick', sd, m - ww / 2 - 0.12, m + ww / 2 + 0.12, head + 0.02, head + 0.3, 0.02, 0.32, skin.dark);
      // 砖拱过梁端部石托，避免只有一条平贴的色带。
      for (const t of [m - ww / 2, m + ww / 2]) putSide(B, 'stone', sd, t - 0.1, t + 0.1, head - 0.06, head + 0.34, 0.04, 0.4, '#e8dfce');
    }
  }
  putSide(B, skin.key, sd, x, c, sill, head, -0.15, 0.3, skin.wall);
  if (skin.slats) slats(B, sd, a, c, y0, top, wins.map((m) => [m - ww / 2 - 0.1, m + ww / 2 + 0.1, sill, head]));
}

/** 木格栅：每 0.5m 一根竖向木条，遇窗洞断开 */
function slats(B, sd, a, c, y0, top, holes) {
  for (let t = a + 0.25; t < c - 0.1; t += 0.5) {
    const hole = holes.find(([p, q]) => t > p && t < q);
    const spans = hole ? [[y0, hole[2]], [hole[3], top]] : [[y0, top]];
    for (const [ya, yb] of spans) putSide(B, 'wood', sd, t - 0.04, t + 0.04, ya, yb, 0.08, 0.12, SKINS.timber.slats);
  }
}

/** 卫生间外门：墙 + 门洞（深色门扇）+ 门楣 */
function wcDoor(B, sd, [a, c], y0, top, skin) {
  putSide(B, skin.key, sd, a, c, y0 + 2.6, top, -0.15, 0.3, skin.wall);
  putSide(B, 'extMetal', sd, a + 0.1, c - 0.1, y0, y0 + 2.6, -0.2, 0.06, '#3b4a52');
  putSide(B, 'extMetal', sd, a, c, y0 + 2.6, y0 + 2.72, 0.04, 0.3, skin.trim);
}

/** 店面：1F 为橱窗 + 门 + 门头招牌（N 侧带雨篷与侧挑招牌）；楼上为落地玻璃 + 门 + 招牌带 */
function shopfront(B, S, atlas, sd, [a, c], y0, top, u, skin, ground) {
  const len = c - a;
  const cell = atlas.cell(u.id);
  const glassTop = ground ? y0 + 3.45 : y0 + 2.95;
  const kerb = ground ? y0 + 0.32 : y0 + 0.06;
  const door = streetDoor(len);
  const mid = (a + c) / 2;
  const n = Math.max(2, Math.round(len / 1.8));
  for (let i = 0; i < n; i++) {
    const p = a + 0.25 + ((len - 0.5) * i) / n, q = a + 0.25 + ((len - 0.5) * (i + 1)) / n;
    if (q > mid - door / 2 && p < mid + door / 2) {
      // 门洞两侧的余量
      if (p < mid - door / 2) putSide(B, 'glass', sd, p, mid - door / 2, kerb, glassTop, -0.1, 0.04, 0xffffff);
      if (q > mid + door / 2) putSide(B, 'glass', sd, mid + door / 2, q, kerb, glassTop, -0.1, 0.04, 0xffffff);
      continue;
    }
    putSide(B, 'glass', sd, p, q, kerb, glassTop, -0.1, 0.04, 0xffffff);
  }
  for (let i = 0; i <= n; i++) {
    const t = a + 0.25 + ((len - 0.5) * i) / n;
    if (Math.abs(t - mid) < door / 2 - 0.05) continue;
    putSide(B, 'extMetal', sd, t - 0.04, t + 0.04, kerb, glassTop, -0.08, 0.12, skin.frame);
  }
  // 开门营业：门扇内收在门洞两侧，中央通行宽度与 streetDoor 完全一致。
  for (const s of [-1, 1]) {
    const t = mid + s * (door / 2 + 0.065);
    putSide(B, 'extMetal', sd, t - 0.06, t + 0.06, y0, y0 + 2.6, -0.1, 0.25, skin.frame);
    putSide(B, 'glass', sd, t - 0.025, t + 0.025, y0 + 0.04, y0 + 2.5, -0.58, 0.88, 0xffffff);
    putSide(B, 'extMetal', sd, t - s * 0.085 - 0.012, t - s * 0.085 + 0.012, y0 + 0.85, y0 + 1.35, -0.8, 0.035, '#c9b37a');
  }
  putSide(B, 'extMetal', sd, mid - door / 2 - 0.05, mid + door / 2 + 0.05, y0 + 2.5, y0 + 2.6, -0.45, 0.14, skin.frame);
  putSide(B, 'glass', sd, mid - door / 2, mid + door / 2, y0 + 2.6, glassTop, -0.1, 0.04, 0xffffff);
  for (const [p, q] of [[a, mid - door / 2], [mid + door / 2, c]]) putSide(B, 'stone', sd, p, q, y0, kerb, -0.05, 0.3, '#8c867b');
  putSide(B, 'extMetal', sd, a + 0.2, c - 0.2, glassTop, glassTop + 0.08, -0.06, 0.16, skin.frame);
  // 门头：品牌色底板 + 招牌
  const fy0 = glassTop + 0.08, fy1 = Math.min(top, fy0 + (ground ? 0.85 : 0.62));
  const fascia = shade(u.brand.bg, u.brand.bg.toLowerCase() === '#ffffff' ? -0.06 : -0.1);
  putSide(B, 'extSatin', sd, a + 0.2, c - 0.2, fy0, fy1, 0.06, 0.2, fascia);
  putSide(B, 'extMetal', sd, a + 0.16, c - 0.16, fy1, fy1 + 0.045, 0.09, 0.36, skin.frame);
  putSide(B, 'glow', sd, a + 0.3, c - 0.3, glassTop - 0.045, glassTop - 0.012, 0.06, 0.12, '#ffdfac');
  if (top > fy1 + 0.02) putSide(B, skin.key, sd, a, c, fy1, top, -0.15, 0.3, skin.wall);
  let sw = Math.min(len * 0.7, ground ? 6 : 5);
  let sh = sw / 4;
  if (sh > (fy1 - fy0) * 0.86) { sh = (fy1 - fy0) * 0.86; sw = sh * 4; }
  const [su, sv] = sd.p(mid);
  S.place(su + sd.n[0] * 0.18, (fy0 + fy1) / 2, sv + sd.n[1] * 0.18, sw, sh, sd.id, cell);
  // 1F 北侧：帆布雨篷 + 侧挑招牌
  if (ground && sd.id === 'N' && len >= 5) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.42);
    const [au, av] = sd.p(mid);
    B.get('ext').shape('box', new THREE.Vector3(au, glassTop - 0.25, av - 0.62), q, new THREE.Vector3(len - 0.8, 0.05, 1.4), shade(u.brand.bg, 0.05));
    B.get('ext').box(au, glassTop - 0.55, av - 1.26, len - 0.8, 0.22, 0.03, shade(u.brand.bg, -0.15));
    // 支撑悬臂、雨篷前沿和两只檐下射灯都有实体厚度。
    for (const t of [a + 0.65, c - 0.65]) {
      const [bu, bv] = sd.p(t);
      B.get('extMetal').bar({ x: bu, y: glassTop - 0.92, z: bv - 0.05 }, { x: bu, y: glassTop - 0.48, z: bv - 1.2 }, 0.035, skin.frame);
      B.get('extMetal').box(bu, glassTop - 0.36, bv - 0.45, 0.15, 0.1, 0.18, skin.frame);
      B.get('glow').box(bu, glassTop - 0.42, bv - 0.45, 0.09, 0.022, 0.1, '#ffe7bd');
    }
    B.get('extMetal').box(au, glassTop - 0.51, av - 1.27, len - 0.75, 0.035, 0.035, skin.frame);
    const [bu, bv] = sd.p(c - 0.6);
    B.get('extMetal').box(bu, glassTop + 0.55, bv - 0.55, 0.05, 0.05, 1.1, STEEL);
    S.place(bu + 0.03, glassTop + 0.25, bv - 0.85, 1.4, 0.35, 'E', cell);
    S.place(bu - 0.03, glassTop + 0.25, bv - 0.85, 1.4, 0.35, 'W', cell);
    B.get('extSatin').box(bu, glassTop + 0.25, bv - 0.85, 0.05, 0.42, 1.48, fascia);
  }
}

/** 连廊柱（外挑连廊外缘、端部服务区四角）：每层一段 */
function columns(B, lv, k, y0, top) {
  const { h, w } = k;
  const bay0 = k.ldeck[2][1];
  const pts = [];
  const nU = Math.max(2, Math.round((k.L + GAL) / 6));
  for (let i = 0; i <= nU; i++) pts.push([-h + 0.2 + ((k.L + GAL - 0.4) * i) / nU, w + GAL - 0.2]);
  const nV = Math.max(1, Math.round((bay0 + k.w) / 6));
  for (let i = 0; i < nV; i++) pts.push([h + GAL - 0.2, -w + 0.2 + ((bay0 + w - 0.4) * i) / nV]);
  for (const [u, v] of [[h + GAL + BAY - 0.2, bay0 + 0.2], [h + GAL + BAY - 0.2, w + GAL - 0.2], [h + GAL + 0.2, bay0 + 0.2]]) pts.push([u, v]);
  for (const [u, v] of pts) B.get('extMetal').box(u, (y0 + top) / 2, v, 0.28, top - y0, 0.28, STEEL);
}

/** 楼上连廊：楼板外缘封边、玻璃栏板 + 扶手（贴墙一侧与楼梯井除外） */
function gallery(B, lv, k, skin) {
  const { h, w } = k;
  const y0 = lv.elev;
  const bay0 = k.ldeck[2][1];
  // 外缘（局部线段）：侧连廊外缘、侧连廊西端、端连廊外缘、端连廊北端
  const edges = [
    [[-h, w + GAL], [h + GAL, w + GAL]],
    [[-h, w], [-h, w + GAL]],
    [[h + GAL, -w], [h + GAL, bay0]],
    [[h, -w], [h + GAL, -w]],
  ];
  for (const [p, q] of edges) {
    rail(B, p, q, y0);
    band(B, p, q, y0 - 0.4, y0, skin.trim);
  }
  // 服务区外缘封边
  for (const [p, q] of [[[h + GAL, bay0], [h + GAL + BAY, bay0]], [[h + GAL + BAY, bay0], [h + GAL + BAY, w + GAL]], [[h + GAL + BAY, w + GAL], [h + GAL, w + GAL]]]) band(B, p, q, y0 - 0.4, y0, skin.trim);
  // 外廊底是完整木饰面吊顶，灯具附着在楼板下方；灯距跟随6m结构柱网。
  B.get('wood').box(GAL / 2, y0 - 0.43, w + GAL / 2, k.L + GAL - 0.2, 0.045, GAL - 0.18, '#e7d7bf');
  for (let u = -h + 2; u < h + GAL - 0.5; u += 4.5) {
    B.get('extMetal').cyl(u, y0 - 0.52, w + GAL / 2, 0.13, 0.06, STEEL, 8);
    B.get('glow').cyl(u, y0 - 0.54, w + GAL / 2, 0.095, 0.025, '#ffe7c0', 8);
  }
}

/** 局部线段上的玻璃栏板 + 钢扶手 + 立柱 */
function rail(B, [u0, v0], [u1, v1], y0, h = 1.1) {
  const len = Math.hypot(u1 - u0, v1 - v0);
  if (len < 0.1) return;
  const ang = Math.atan2(-(v1 - v0), u1 - u0);
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  B.get('glass').box(cu, y0 + h / 2 + 0.05, cv, len, h - 0.15, 0.03, 0xffffff, ang);
  B.get('extMetal').box(cu, y0 + h, cv, len, 0.06, 0.08, STEEL, ang);
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    B.get('extMetal').box(u0 + (u1 - u0) * t, y0 + h / 2, v0 + (v1 - v0) * t, 0.05, h, 0.05, STEEL);
  }
}

/** 局部线段外侧的封边条 */
function band(B, [u0, v0], [u1, v1], yA, yB, color) {
  const len = Math.hypot(u1 - u0, v1 - v0);
  const ang = Math.atan2(-(v1 - v0), u1 - u0);
  B.get('ext').box((u0 + u1) / 2, (yA + yB) / 2, (v0 + v1) / 2, len + 0.06, yB - yA, 0.12, color, ang);
}

/** 外挂钢楼梯：本层到上一层两跑（西跑向 +v、东跑回 −v），中间平台；外侧竖向钢格栅 */
function stairFlight(B, lv, k, ground) {
  const { h, w } = k;
  const u0 = h + GAL, u1 = u0 + BAY;
  const y0 = lv.elev, H = lv.height;
  const vLow = w - 4.8, vMid = w + 0.7;
  const lanes = [[u0 + 0.15, u0 + 1.95, vLow, vMid, y0, y0 + H / 2], [u0 + 2.05, u1 - 0.15, vMid, vLow, y0 + H / 2, y0 + H]];
  for (const [ua, ub, va, vb, ya, yb] of lanes) {
    const n = Math.max(8, Math.round((yb - ya) / 0.17));
    const run = vb - va;
    for (let i = 0; i < n; i++) {
      const v = va + (run * (i + 0.5)) / n;
      const y = ya + ((yb - ya) * (i + 1)) / n;
      B.get('extMetal').box((ua + ub) / 2, y - 0.02, v, ub - ua, 0.05, Math.abs(run) / n + 0.02, '#8d949a');
    }
    for (const u of [ua, ub]) {
      B.get('extMetal').bar({ x: u, y: ya - 0.12, z: va }, { x: u, y: yb - 0.12, z: vb }, 0.07, STEEL);
      B.get('extMetal').bar({ x: u, y: ya + 0.95, z: va }, { x: u, y: yb + 0.95, z: vb }, 0.05, STEEL);
    }
  }
  // 中间平台 + 护栏
  B.get('extMetal').box((u0 + u1) / 2, y0 + H / 2 - 0.06, (vMid + w + GAL) / 2, BAY - 0.1, 0.12, w + GAL - vMid, '#8d949a');
  rail(B, [u1 - 0.05, vMid], [u1 - 0.05, w + GAL - 0.05], y0 + H / 2);
  rail(B, [u1 - 0.05, w + GAL - 0.05], [u0, w + GAL - 0.05], y0 + H / 2);
  // 1F 起步平台（地面上的钢平台）
  if (ground) B.get('extMetal').box((u0 + u1) / 2, y0 + 0.04, (k.ldeck[2][1] + vLow) / 2 + 2, BAY, 0.08, 2.2, '#8d949a');
  // 外侧竖向钢格栅（东面、南面）
  for (let v = vLow; v < w + GAL; v += 0.5) B.get('extMetal').box(u1 + 0.08, y0 + H / 2, v, 0.05, H - 0.1, 0.16, '#5b636a');
  for (let u = u0 + 0.25; u < u1; u += 0.5) B.get('extMetal').box(u, y0 + H / 2, w + GAL + 0.08, 0.16, H - 0.1, 0.05, '#5b636a');
}

/** 楼梯在顶层的井口护栏 */
function wellGuard(B, y0, k) {
  const { h, w } = k;
  const u0 = h + GAL, u1 = u0 + BAY;
  rail(B, [u0, w - 4.8], [u0, w + GAL], y0);
  rail(B, [u0 + 2, w - 4.8], [u1, w - 4.8], y0);
}

/** 三层楼栋屋面：屋面板、檐口、女儿墙、设备与太阳能板；连廊雨棚 */
function roof(B, k, skin) {
  const { h, w } = k;
  const y = k.top;
  B.get('concrete').box(0, y - 0.2, 0, k.L + 0.5, 0.4, k.W + 0.5, '#d4d0c7');
  B.get(skin.key).box(0, y + 0.45, -w + 0.12, k.L + 0.5, 0.9, 0.25, skin.dark);
  B.get(skin.key).box(0, y + 0.45, w - 0.12, k.L + 0.5, 0.9, 0.25, skin.dark);
  B.get(skin.key).box(-h + 0.12, y + 0.45, 0, 0.25, 0.9, k.W, skin.dark);
  B.get(skin.key).box(h - 0.12, y + 0.45, 0, 0.25, 0.9, k.W, skin.dark);
  B.get('concrete').box(0, y + 0.025, 0, k.L - 0.4, 0.05, k.W - 0.4, '#b8b9b5');
  for (const z of [-w + 0.12, w - 0.12]) B.get('extMetal').box(0, y + 0.93, z, k.L + 0.6, 0.06, 0.4, skin.frame);
  for (const x of [-h + 0.12, h - 0.12]) B.get('extMetal').box(x, y + 0.93, 0, 0.4, 0.06, k.W + 0.1, skin.frame);
  // 连廊雨棚（侧、端）
  B.get('extMetal').box(GAL / 2, y - 0.15, w + GAL / 2, k.L + GAL, 0.12, GAL + 0.3, STEEL);
  B.get('extMetal').box(h + GAL / 2, y - 0.15, 0, GAL, 0.12, k.W, STEEL);
  // 设备与太阳能板
  const rand = rng(k.n * 31);
  for (let i = 0; i < 3; i++) {
    const u = -h + 3 + rand() * (k.L - 8), v = -w + 3 + rand() * (k.W - 8);
    B.get('concrete').box(u, y + 0.1, v, 2.45, 0.2, 1.65, '#c1bcb1');
    B.get('ext').box(u, y + 0.88, v, 2.2, 1.35, 1.4, '#c9cdd0');
    for (const x of [u - 0.57, u + 0.57]) {
      B.get('extMetal').cyl(x, y + 1.565, v, 0.42, 0.045, '#333d43', 12);
      B.get('extMetal').cyl(x, y + 1.61, v, 0.105, 0.05, '#aab1b4', 8);
      for (const a of [0, Math.PI / 2]) B.get('extMetal').box(x, y + 1.62, v, 0.7, 0.016, 0.025, '#929a9e', a);
    }
    for (let yy = y + 0.42; yy < y + 1.48; yy += 0.2) B.get('extMetal').box(u, yy, v - 0.715, 1.9, 0.045, 0.035, '#5d676a');
  }
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35);
  for (let u = -h + 2; u < h - 3; u += 2.4) {
    B.get('extMetal').shape('box', new THREE.Vector3(u + 1, y + 0.75, w - 4), q, new THREE.Vector3(2.2, 0.06, 2.6), '#1f3550');
    for (const x of [u + 0.15, u + 1.85]) B.get('extMetal').bar({ x, y: y + 0.1, z: w - 4.95 }, { x, y: y + 1.17, z: w - 2.85 }, 0.065, '#707b82');
  }
}

/** 两层楼栋的屋顶露台：栏板、木平台上的外摆与遮阳伞、花箱、四角灯杆串灯；三家露台酒吧亭 */
function terrace(ctx, L, lv, k, skin) {
  const B = L.batch;
  const { h, w } = k;
  const y0 = lv.elev;
  const D = k.ldeck;
  // 主楼范围铺木平台，楼梯服务区保持原铺装；不是覆盖整个L形楼板的悬空贴片。
  B.get('wood').box(0, y0 + 0.025, 0, k.L - 0.28, 0.05, k.W - 0.28, '#eee3d1');
  for (const z of [-w + 0.12, w - 0.12]) B.get('extMetal').box(0, y0 + 0.055, z, k.L - 0.24, 0.03, 0.045, '#655b4b');
  for (let i = 0; i < D.length; i++) {
    const p = D[i], q = D[(i + 1) % D.length];
    rail(B, p, q, y0);
    band(B, p, q, y0 - 0.4, y0, skin.trim);
  }
  const bar = lv.units.find((u) => u.block === k.n && u.style === 'pavilion');
  const r = bar ? bar.rects[0] : null;
  const rand = rng(k.n * 17 + 3);
  const cols = ['#f4f1ea', '#c8352b', '#2f6f8f', '#e0a526'];
  for (let u = -h + 3; u < h + 0.5; u += 4.2) {
    for (let v = -w + 3; v < w + 1; v += 4.2) {
      if (r && u > r.x0 - 2 && u < r.x1 + 2 && v > r.z0 - 2 && v < r.z1 + 2.5) continue;
      if (rand() < 0.25) continue;
      tableSet(B, u, y0, v, rand() * Math.PI, { top: '#efe9df', chair: '#3a3f45' }, 'ext');
      umbrella(B, u, y0, v, cols[Math.floor(rand() * cols.length)], 1.5);
    }
  }
  for (let u = -h + 1; u < h - 2.2; u += 6) planter(B, u, -w + 0.4, u + 2.2, -w + 1.2, y0, k.n * 7 + u, true, 'stone');
  // 串灯：四角灯杆，两两相连成环
  const posts = [[-h + 0.6, -w + 0.6], [h - 0.6, -w + 0.6], [h - 0.6, w + GAL - 0.6], [-h + 0.6, w + GAL - 0.6]];
  for (const [u, v] of posts) B.get('extMetal').cyl(u, y0, v, 0.06, 3.6, STEEL, 8);
  for (let i = 0; i < 4; i++) {
    const [ua, va] = posts[i], [ub, vb] = posts[(i + 1) % 4];
    catenary(B, [ua, y0 + 3.5, va], [ub, y0 + 3.5, vb], 0.6, 1.0);
  }
  if (bar) pavilion(B, L.signs, ctx.atlas[lv.id], y0, bar);
}

/** 屋顶酒吧亭：玻璃盒 + 挑檐平屋顶 + 门头招牌 + 吧台 */
function pavilion(B, S, atlas, y0, u) {
  const r = u.rects[0];
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, W = r.x1 - r.x0, D = r.z1 - r.z0;
  const H = 3.4;
  for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) B.get('extMetal').box(x, y0 + H / 2, z, 0.16, H, 0.16, STEEL);
  B.get('glass').box(cx, y0 + H / 2, r.z0, W, H, 0.04, 0xffffff);
  B.get('glass').box(r.x0, y0 + H / 2, cz, 0.04, H, D, 0xffffff);
  B.get('glass').box(r.x1, y0 + H / 2, cz, 0.04, H, D, 0xffffff);
  B.get('glass').box(cx - W / 4 - 0.5, y0 + H / 2, r.z1, W / 2 - 1, H, 0.04, 0xffffff);
  B.get('glass').box(cx + W / 4 + 0.5, y0 + H / 2, r.z1, W / 2 - 1, H, 0.04, 0xffffff);
  B.get('ext').box(cx, y0 + H + 0.12, cz + 0.4, W + 1.2, 0.24, D + 2.0, '#2b2f33');
  B.get('glow').box(cx, y0 + H - 0.02, r.z1 + 1.3, W, 0.04, 0.06, '#ffd38a');
  B.get('extSatin').box(cx, y0 + H - 0.35, r.z1 + 0.05, Math.min(W - 1, 7), 0.6, 0.12, shade(u.brand.bg, -0.1));
  S.place(cx, y0 + H - 0.35, r.z1 + 0.13, Math.min(W - 1.2, 2.2), 0.55, 'S', atlas.cell(u.id));
}

/** 下垂的串灯：两端点之间的悬链线（近似抛物线）+ 灯泡 */
function catenary(B, a, b, sag, step = 0.9) {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const n = Math.max(2, Math.round(len / step));
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    B.get('extMetal').bar({ x: prev[0], y: prev[1], z: prev[2] }, { x: p[0], y: p[1], z: p[2] }, 0.02, '#2a2d30');
    if (i < n) B.get('glow').sphere(p[0], p[1] - 0.08, p[2], 0.07, '#ffd9a0', 0.09, 0.07, 'sphereLo');
    prev = p;
  }
}

// ---------------------------------------------------------------------------
// 地库楼梯口、街巷景观、外围绿化、地库外墙

/** 地库楼梯口：玻璃亭（白色挑檐屋顶、P 标识）；B1 一段由 rooms.js 绘制 */
function kiosks(ctx, b, lv) {
  const L = ctx.levels[lv.id];
  const B = L.batch;
  const atlas = ctx.atlas[lv.id];
  for (const k of b.kiosks) {
    const r = k.r;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, W = r.x1 - r.x0, D = r.z1 - r.z0;
    const H = 3.2;
    const doorZ = k.side === 'S' ? r.z1 : r.z0;
    const s = k.side === 'S' ? 1 : -1;
    for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) B.get('extMetal').box(x, H / 2, z, 0.18, H, 0.18, STEEL);
    B.get('glass').box(cx, H / 2, r.z0 + r.z1 - doorZ, W, H, 0.04, 0xffffff);
    B.get('glass').box(r.x0, H / 2, cz, 0.04, H, D, 0xffffff);
    B.get('glass').box(r.x1, H / 2, cz, 0.04, H, D, 0xffffff);
    for (const x of [r.x0 + 1, r.x1 - 1]) B.get('glass').box(x, H / 2, doorZ, 2, H, 0.04, 0xffffff);
    B.get('ext').box(cx, H + 0.15, cz + s * 0.6, W + 0.8, 0.3, D + 1.6, '#f2f2ee');
    B.get('glow').box(cx, H - 0.02, doorZ + s * 1.1, W - 0.4, 0.04, 0.08, '#eaf6ff');
    // 下行梯口（深色）与护栏
    B.get('ext').box(cx, 0.02, cz - s * 0.4, W - 2.4, 0.04, D - 2.4, '#2a2d31');
    for (const x of [r.x0 + 1.2, r.x1 - 1.2]) B.get('extMetal').box(x, 0.55, cz - s * 0.4, 0.05, 1.1, D - 2.4, STEEL);
    B.get('extSatin').box(cx, H - 0.45, doorZ + s * 0.08, 3.4, 0.7, 0.1, '#1d4ed8');
    L.signs.place(cx, H - 0.45, doorZ + s * 0.14, 2.6, 0.65, k.side, atlas.cell('wf-park'));
  }
}

/** 1F 街巷：中心广场（铺装圆、旱喷、舞台）、梧桐小广场、乔木与树池、庭院灯、长椅、咖啡外摆、跨巷串灯 */
function streetscape(ctx, b, lv) {
  const L = ctx.levels[lv.id];
  const B = L.batch;
  const G = L.base;
  const y = lv.elev;
  const feats = lv.features;
  const obstacles = [...b.blocks.map((k) => k.poly), ...b.kiosks.map((k) => k.poly)];
  const clearOf = (p, d) => !obstacles.some((o) => pointInPoly(p, o)) && obstacles.every((o) => distToPolyEdge(p, o) >= d);
  const round = (cx, cz, r, color, yy = y + 0.025) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    m.position.set(cx, yy, cz);
    m.receiveShadow = true;
    G.add(m);
  };
  for (const f of feats) {
    if (f.type === 'plaza') {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(f.r, 64).rotateX(-Math.PI / 2), ctx.mats.floor('stone', 0.7));
      disc.position.set(f.x, y + 0.025, f.z);
      disc.receiveShadow = true;
      G.add(disc);
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        B.get('ext').box(f.x + Math.cos(a) * f.r, y + 0.03, f.z + Math.sin(a) * f.r, 0.3, 0.06, (Math.PI * 2 * f.r) / 64 + 0.05, '#8a8378', -a);
      }
    } else if (f.type === 'fountain') {
      B.get('extSatin').cyl(f.x, y, f.z, f.r + 0.4, 0.45, COLORS.stoneDark, 32);
      B.get('water').cyl(f.x, y + 0.05, f.z, f.r, 0.36, '#ffffff', 32);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        B.get('glass').cyl(f.x + Math.cos(a) * (f.r - 1.2), y + 0.4, f.z + Math.sin(a) * (f.r - 1.2), 0.07, 0.8 + (i % 4) * 0.45, '#ffffff', 6);
        B.get('glow').cyl(f.x + Math.cos(a) * (f.r - 1.2), y + 0.4, f.z + Math.sin(a) * (f.r - 1.2), 0.14, 0.02, '#bfe9f5', 8);
      }
      B.get('glass').cyl(f.x, y + 0.4, f.z, 0.22, 3.0, '#ffffff', 10);
    } else if (f.type === 'stage') stage(ctx, L, f, y);
    else if (f.type === 'grove') {
      round(f.x, f.z, f.r, '#b8ad98');
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        if (i % 2) bench(B, f.x + Math.cos(a) * 5.5, y, f.z + Math.sin(a) * 5.5, -a + Math.PI / 2);
      }
      B.get('extSatin').cyl(f.x, y, f.z, 1.4, 0.5, COLORS.stoneDark, 20);
      B.get('foliage').sphere(f.x, y + 0.9, f.z, 1.1, '#5e9a44', 0.6, 1.1, 'ico0');
    }
  }
  // 乔木与树池
  const trees = feats.filter((f) => f.type === 'tree').map((f) => ({ x: f.x, y, z: f.z, s: f.scale, kind: 'round' }));
  for (const t of trees) B.get('ext').box(t.x, y + 0.02, t.z, 1.6, 0.04, 1.6, '#4a4540');
  addTrees(G, ctx.mats, trees, 77);
  // 庭院灯与长椅：沿街巷的网格点，离楼栋 ≥3.5m、避开树与广场
  const plaza = feats.find((f) => f.type === 'plaza');
  const stageF = feats.find((f) => f.type === 'stage');
  const nearTree = (p, d) => trees.some((t) => Math.hypot(t.x - p[0], t.z - p[1]) < d);
  const rand = rng(523);
  for (let x = -238; x <= -36; x += 15) {
    for (let z = 38; z <= 200; z += 15) {
      const p = [x + (rand() - 0.5) * 4, z + (rand() - 0.5) * 4];
      if (!clearOf(p, 3.5) || nearTree(p, 2.5)) continue;
      if (plaza && Math.hypot(p[0] - plaza.x, p[1] - plaza.z) < plaza.r + 2) continue;
      if (stageF && Math.hypot(p[0] - stageF.x, p[1] - stageF.z) < 10) continue;
      if (Math.hypot(p[0] + 40, p[1] - 40) < 20) continue;
      lamp(B, p[0], y, p[1]);
      if (rand() < 0.45) bench(B, p[0] + 1.6, y, p[1], rand() < 0.5 ? 0 : Math.PI / 2);
    }
  }
  // 咖啡外摆：1F 咖啡、茶饮、餐厅、小吃铺位北侧门前
  for (const u of lv.units) {
    if (!CAFE.has(u.brand.cat)) continue;
    const f = u.fronts.find((x) => x.side === 'N');
    if (!f) continue;
    const k = b.blocks.find((x) => x.n === u.block);
    const len = Math.abs(f.x1 - f.x0);
    for (let i = 0; i < Math.min(3, Math.floor(len / 3.2)); i++) {
      const lu = Math.min(f.x0, f.x1) + 1.6 + i * 3.2, lv2 = -k.w - 3.2;
      const [x, z] = toW(k.F, lu, lv2);
      if (!clearOf([x, z], 1.5) || nearTree([x, z], 1.8)) continue;
      tableSet(B, x, y, z, -k.F.a, { top: '#f3efe7', chair: shade(u.brand.bg, 0.1).getStyle() }, 'ext');
      umbrella(B, x, y, z, i % 2 ? '#f4f1ea' : shade(u.brand.bg, 0.2).getStyle(), 1.4);
    }
  }
  // 跨巷串灯：相邻楼栋外角之间
  const corners = b.blocks.map((k) => [[-k.h, -k.w], [k.h + GAL, -k.w], [k.h + GAL + BAY, k.w + GAL], [-k.h, k.w + GAL]].map(([u, v]) => toW(k.F, u, v)));
  const lines = [];
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      let best = null;
      for (const p of corners[i]) for (const q of corners[j]) {
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d > 7 && d < 24 && (!best || d < best.d)) best = { p, q, d };
      }
      if (!best) continue;
      const mid = [(best.p[0] + best.q[0]) / 2, (best.p[1] + best.q[1]) / 2];
      if (obstacles.some((o) => pointInPoly(mid, o))) continue;
      lines.push(best);
    }
  }
  for (const { p, q, d } of lines) catenary(B, [p[0], y + 6.3, p[1]], [q[0], y + 6.3, q[1]], Math.min(1.4, d * 0.06), 1.0);
}

function lamp(B, x, y, z) {
  B.get('extMetal').cyl(x, y, z, 0.07, 4.2, '#2b2f33', 8);
  B.get('extMetal').cyl(x, y + 4.2, z, 0.26, 0.08, '#2b2f33', 12);
  B.get('glow').sphere(x, y + 4.0, z, 0.2, '#ffe2b0', 0.24, 0.2, 'sphere');
}

/** 街区舞台：台面 + 台阶 + 钢桁架门框 + LED 背景屏 + 音箱 */
function stage(ctx, L, f, y) {
  const B = L.batch;
  const F = frame(f.x, f.z, f.deg, 'P3-stage');
  // 局部：u 朝观众（舞台正面），v 沿台宽
  B.frame(F, () => {
    B.get('ext').box(0, y + 0.45, 0, f.d, 0.9, f.w, '#3a3f45');
    B.get('wood').box(0, y + 0.91, 0, f.d - 0.1, 0.02, f.w - 0.1, '#e4d4bd');
    for (let i = 0; i < 3; i++) B.get('ext').box(f.d / 2 + 0.3 + i * 0.35, y + 0.15 + i * 0.3 - 0.3, 0, 0.35, 0.3 + i * 0.3, 3, '#5d6267');
    for (const v of [-f.w / 2, f.w / 2]) {
      B.get('extMetal').box(-f.d / 2 + 0.3, y + 3.4, v, 0.4, 6.8, 0.4, '#1d2023');
      B.get('extMetal').box(f.d / 2 - 0.3, y + 3.4, v, 0.4, 6.8, 0.4, '#1d2023');
    }
    B.get('extMetal').box(0, y + 6.8, -f.w / 2, f.d, 0.4, 0.4, '#1d2023');
    B.get('extMetal').box(0, y + 6.8, f.w / 2, f.d, 0.4, 0.4, '#1d2023');
    for (const u of [-f.d / 2 + 0.3, f.d / 2 - 0.3]) B.get('extMetal').box(u, y + 6.8, 0, 0.4, 0.4, f.w, '#1d2023');
    B.get('ext').box(-f.d / 2 + 0.05, y + 3.6, 0, 0.1, 5.2, f.w - 0.8, '#15181b');
    for (const v of [-f.w / 2 + 0.9, f.w / 2 - 0.9]) B.get('ext').box(f.d / 2 - 0.6, y + 1.5, v, 0.7, 1.2, 0.7, '#22262a');
    for (let i = 0; i < 6; i++) B.get('glow').box(f.d / 2 - 0.3, y + 6.55, -f.w / 2 + 1 + i * ((f.w - 2) / 5), 0.25, 0.25, 0.25, i % 2 ? '#ffd38a' : '#a5ecff');
  });
  // LED 背景屏（动态）
  const c = makeCanvas(1024, 512);
  const g = c.getContext('2d');
  const tex = canvasTexture(c, { clamp: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(f.w - 1.2, 4.6), ctx.mats.screen(tex, 0.85, 1.6));
  const [x, z] = toW(F, -f.d / 2 + 0.12, 0);
  mesh.position.set(x, y + 3.6, z);
  mesh.rotation.y = -F.a + Math.PI / 2;
  L.base.add(mesh);
  let last = -1;
  ctx.dynamic.push({
    update(dt, time) {
      const k = Math.floor(time * 6);
      if (k === last || !L.group.visible) return;
      last = k;
      const grd = g.createLinearGradient(0, 0, 1024, 512);
      grd.addColorStop(0, `hsl(${(time * 20) % 360},70%,28%)`);
      grd.addColorStop(1, `hsl(${(time * 20 + 120) % 360},75%,45%)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 24; i++) {
        const h = 60 + Math.abs(Math.sin(time * 3 + i * 0.7)) * 220;
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(40 + i * 40, 512 - h, 26, h);
      }
      g.fillStyle = '#ffffff';
      g.textBaseline = 'middle';
      g.font = `800 112px ${FONT_CN}`;
      g.fillText('云澜里 · 街区音乐节', 60, 170);
      g.font = `700 48px ${FONT_EN}`;
      g.fillText('YUNLAN LANE LIVE · EVERY FRIDAY 19:30', 64, 290);
      tex.needsUpdate = true;
    },
  });
}

/** 街区外围：西侧与南侧草坪上的树林（避开车库坡道、车道），沿街区边的矮绿篱 */
function surroundings(ctx, b) {
  const S = ctx.layout.site;
  const plot = b.plot;
  const district = b.outline;
  const rand = rng(909);
  const trees = [];
  for (let x = plot.x0 + 4; x < plot.x1 - 2; x += 9) {
    for (let z = plot.z0 + 4; z < plot.z1 - 4; z += 9) {
      const p = [x + (rand() - 0.5) * 5, z + (rand() - 0.5) * 5];
      if (rand() < 0.3) continue;
      if (pointInPoly(p, district) || distToPolyEdge(p, district) < 3) continue;
      if (S.trenches.some((t) => pointInPoly(p, t) || distToPolyEdge(p, t) < 4) || S.driveways.some((d) => pointInPoly(p, d) || distToPolyEdge(p, d) < 4)) continue;
      trees.push({ x: p[0], y: -0.3, z: p[1], s: 0.85 + rand() * 0.5, kind: rand() < 0.35 ? 'cone' : 'round' });
    }
  }
  addTrees(ctx.site.group, ctx.mats, trees, 404);
  // 街区铺装外缘的绿篱（西、南两边）
  const B = ctx.site.batch;
  const bb = { x0: Math.min(...district.map((p) => p[0])), x1: Math.max(...district.map((p) => p[0])), z0: Math.min(...district.map((p) => p[1])), z1: Math.max(...district.map((p) => p[1])) };
  for (let z = bb.z0 + 2; z < bb.z1 - 1; z += 4) {
    if (z > 92 && z < 118) continue;
    B.get('foliage').box(bb.x0 - 1.2, 0.2, z + 1.5, 1.2, 0.9, 3.6, '#4f7f3a');
  }
  for (let x = bb.x0; x < bb.x1 - 4; x += 4) B.get('foliage').box(x + 2, 0.2, bb.z1 + 1.2, 3.6, 0.9, 1.2, '#4f7f3a');
}

/** 地库：外墙（facade）与剖切矮墙（base） */
function basement(ctx, b, lv) {
  if (!lv) return;
  const L = ctx.levels[lv.id];
  const P = lv.outline;
  const ents = ctx.layout.entrances.filter((e) => e.level === lv.id);
  for (let i = 0; i < P.length; i++) {
    const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const F = frame(x0, z0, (Math.atan2(z1 - z0, x1 - x0) * 180) / Math.PI);
    // 地铁连接口（东北角切面）处开洞
    let ivs = [[0, len]];
    for (const e of ents) {
      const [u0, v0] = toL(F, e.seg.x0, e.seg.z0), [u1, v1] = toL(F, e.seg.x1, e.seg.z1);
      if (Math.abs(v0) < 0.15 && Math.abs(v1) < 0.15) ivs = subtractInterval(ivs, [Math.min(u0, u1), Math.max(u0, u1)]);
    }
    for (const [a, b] of ivs) {
      const a2 = a < 0.01 ? -0.2 : a, b2 = b > len - 0.01 ? len + 0.2 : b;
      L.batch.frame(F, () => L.batch.get('matte').box((a + b) / 2, lv.elev + 0.45, 0, b - a, 0.9, 0.3, COLORS.concrete));
      L.facadeBatch.frame(F, () => L.facadeBatch.get('ext').box((a2 + b2) / 2, lv.elev + lv.height / 2 - 0.2, 0, b2 - a2, lv.height - 0.4, 0.4, '#9fa5ab'));
    }
  }
  void b;
}
