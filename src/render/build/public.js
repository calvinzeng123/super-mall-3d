// 公共区域：B1M 美食广场用餐区与吊灯、云澜老街牌坊与灯笼串；1F 服务台与中庭花池；
// 2F 快闪店；2F/3F 观景休息区；中庭"云朵"悬挂艺术装置。
import * as THREE from 'three';
import { pointInRect } from '../../layout/geom.js';
import { rng, makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { tableSet, roundTable, bench, planter } from './props.js';
import { COLORS } from '../theme.js';

export function buildPublic(ctx) {
  foodCourt(ctx);
  oldStreetGate(ctx);
  infoDesk(ctx);
  popups(ctx);
  lounges(ctx);
  atriumArt(ctx);
}

/** 扶梯及其前后缓冲区、观光梯门口的禁放区 */
function keepOut(ctx, levelId) {
  const zones = [];
  for (const e of ctx.layout.escalators) {
    if (e.from !== levelId && e.to !== levelId) continue;
    const xs = [e.bottom.x, e.top.x], zs = [e.bottom.z, e.top.z];
    const alongX = Math.abs(e.top.x - e.bottom.x) > 0.1;
    const pad = 4.2;
    zones.push(alongX
      ? { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: e.bottom.z - 1.6, z1: e.bottom.z + 1.6 }
      : { x0: e.bottom.x - 1.6, x1: e.bottom.x + 1.6, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad });
  }
  for (const g of ctx.layout.elevators.filter((x) => x.type === 'glass')) zones.push({ x0: g.x - 4, x1: g.x + 4, z0: g.z - 2.8, z1: g.z + 2.8 });
  return zones;
}

function foodCourt(ctx) {
  const lv = ctx.layout.levels.find((l) => l.id === 'B1M');
  const B = ctx.levels.B1M.batch;
  const court = lv.walk.find((w) => w.kind === 'foodcourt').rect;
  const y0 = lv.elev;
  const avoid = keepOut(ctx, 'B1M');
  const lanes = [{ x0: -1.6, x1: 1.6, z0: court.z0, z1: court.z1 }, { x0: court.x0, x1: court.x1, z0: -1.6, z1: 1.6 }];
  const rand = rng(77);
  const chairs = ['#f08a24', '#19a39a', '#f2c230', '#e65f5c', '#4a90d9'];
  const tops = ['#f4efe6', '#e8dcc8'];
  for (let x = court.x0 + 2.2; x <= court.x1 - 2.2; x += 3.1) {
    for (let z = court.z0 + 2.4; z <= court.z1 - 2.4; z += 3.0) {
      const p = [x, z];
      const box = { x0: x - 1.3, x1: x + 1.3, z0: z - 1.3, z1: z + 1.3 };
      const hit = [...avoid, ...lanes].some((r) => box.x0 < r.x1 && r.x0 < box.x1 && box.z0 < r.z1 && r.z0 < box.z1);
      if (hit || !pointInRect(p, court)) continue;
      const c = chairs[Math.floor(rand() * chairs.length)];
      if (rand() < 0.35) roundTable(B, x, y0, z, 4, { chair: c, top: tops[0] });
      else tableSet(B, x, y0, z, rand() < 0.5 ? 0 : Math.PI / 2, { chair: c, top: tops[1] });
    }
  }
  // 吊灯（暖光球）
  for (let x = court.x0 + 3; x <= court.x1 - 3; x += 6) {
    for (let z = court.z0 + 3; z <= court.z1 - 3; z += 6) {
      if (Math.abs(x) < 7 && Math.abs(z) < 10) continue;
      B.get('metal').box(x, y0 + 3.75, z, 0.02, 0.5, 0.02, '#2b2f33');
      B.get('glow').sphere(x, y0 + 3.4, z, 0.32, '#ffd9a0');
    }
  }
  // 地面引导色带（十字通道）
  for (const r of lanes) B.get('satin').box((r.x0 + r.x1) / 2, y0 + 0.012, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.01, r.z1 - r.z0, '#c9a77a');
}

/** 云澜老街：牌坊 + 灯笼串 + 石板路 */
function oldStreetGate(ctx) {
  const lv = ctx.layout.levels.find((l) => l.id === 'B1M');
  const L = ctx.levels.B1M;
  const B = L.batch;
  const y0 = lv.elev;
  // 石板路覆盖西侧通道与环廊西段、西端广场
  const stone = ctx.mats.floor('stone', 0.8);
  for (const id of ['passW', 'ringW', 'plazaW']) {
    const r = lv.walk.find((w) => w.id === id).rect;
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (r.x0 + uv.getX(i) * (r.x1 - r.x0)) / 4, (r.z0 + (1 - uv.getY(i)) * (r.z1 - r.z0)) / 4);
    stone.map.repeat.set(1, 1);
    const m = new THREE.Mesh(g, stone);
    m.position.set((r.x0 + r.x1) / 2, y0 + 0.006 + (id === 'passW' ? 0.002 : 0), (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    L.base.add(m);
  }
  // 牌坊（面向美食广场）
  const gx = -23.4;
  const red = '#a3241f', tile = '#3a3f45', gold = '#d4a72c';
  for (const z of [-5.4, -1.8, 1.8, 5.4]) {
    B.get('satin').cyl(gx, y0, z, 0.28, 3.9, red, 12);
    B.get('satin').cyl(gx, y0, z, 0.42, 0.35, '#6b6258', 12);
  }
  B.get('satin').box(gx, y0 + 3.55, 0, 0.5, 0.35, 11.6, red);
  B.get('satin').box(gx, y0 + 3.95, 0, 0.6, 0.45, 4.2, red);
  B.get('matte').box(gx, y0 + 4.32, 0, 1.6, 0.18, 12.6, tile);
  B.get('matte').box(gx, y0 + 4.42, 0, 1.0, 0.1, 13.0, tile);
  // 匾额
  const c = makeCanvas(512, 160);
  const g = c.getContext('2d');
  g.fillStyle = '#5a1410'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = gold; g.lineWidth = 10; g.strokeRect(8, 8, 496, 144);
  g.fillStyle = '#f2cf6b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 92px ${FONT_CN}`; g.fillText('云澜老街', 256, 74);
  g.font = `600 26px ${FONT_EN}`; g.fillText('YUNLAN OLD STREET', 256, 132);
  const mat = ctx.mats.screen(canvasTexture(c, { clamp: true }), 0.9, 1.25);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), mat);
  plaque.position.set(gx + 0.32, y0 + 3.95, 0);
  plaque.rotation.y = Math.PI / 2;
  L.base.add(plaque);
  // 灯笼串：沿西侧通道与环廊
  const strings = [
    { a: [-38, -2.5], b: [-23.8, -2.5] }, { a: [-38, 2.5], b: [-23.8, 2.5] },
    { a: [-41, -22], b: [-41, 22] },
  ];
  for (const s of strings) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const n = Math.floor(len / 1.6);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = s.a[0] + (s.b[0] - s.a[0]) * t, z = s.a[1] + (s.b[1] - s.a[1]) * t;
      const sag = Math.sin(t * Math.PI * Math.max(1, Math.round(len / 7))) * 0.25;
      B.get('glow').sphere(x, y0 + 3.35 - Math.abs(sag), z, 0.22, i % 5 === 2 ? '#f2b134' : '#d6332a', 0.27, 0.22, 'sphereLo');
    }
  }
}

/** 1F 服务台（南门大堂）与中庭花池 */
function infoDesk(ctx) {
  const L = ctx.levels['1F'];
  const B = L.batch;
  const atlas = ctx.atlas['1F'];
  const x = 0, z = 31, y0 = 0;
  B.get('satin').box(x, y0 + 0.55, z, 5.2, 1.1, 1.1, '#f4f1ea');
  B.get('metal').box(x, y0 + 1.13, z, 5.4, 0.06, 1.3, '#b08d4f');
  B.get('glow').box(x, y0 + 0.2, z + 0.57, 5.0, 0.06, 0.02, '#ffe6b0');
  for (const dx of [-1.6, 1.6]) B.get('matte').box(x + dx, y0 + 1.3, z - 0.2, 0.5, 0.35, 0.05, '#1f2933');
  L.signs.place(x, y0 + 3.3, z + 0.02, 3.2, 0.8, 'S', atlas.cell('wf-info'));
  B.get('satin').box(x, y0 + 3.3, z - 0.03, 3.3, 0.9, 0.05, '#0f6f86');
  B.get('metal').box(x, y0 + 4.05, z - 0.03, 0.06, 0.7, 0.06, '#4a5056');
  // 中庭四角花池
  for (const [px, pz] of [[-9, -12], [9, -12], [-9, 12], [9, 12]]) planter(B, px - 1.4, pz - 1.0, px + 1.4, pz + 1.0, y0, px * 3 + pz, true, 'matte');
  for (const [px, pz, r] of [[-14, -12.8, 0], [14, -12.8, 0], [-14, 12.8, Math.PI], [14, 12.8, Math.PI]]) bench(B, px, y0, pz, r, 'matte');
}

/** 2F 快闪店 */
function popups(ctx) {
  const L = ctx.levels['2F'];
  const B = L.batch;
  const y0 = 5.5;
  const items = [
    { x: 15, z: -14.2, name: 'POP-UP', color: '#2f86b0' },
    { x: -15, z: 14.2, name: 'POP-UP', color: '#e0567a' },
  ];
  for (const k of items) {
    B.get('satin').box(k.x, y0 + 0.5, k.z, 3.2, 1.0, 1.6, '#f7f7f5');
    B.get('satin').box(k.x, y0 + 1.03, k.z, 3.3, 0.06, 1.7, k.color);
    for (let i = 0; i < 5; i++) B.get('matte').box(k.x - 1.2 + i * 0.6, y0 + 1.2, k.z, 0.4, 0.3, 0.4, ['#f2c230', '#1f2937', '#e65f5c', '#19a39a', '#ffffff'][i]);
    for (const dx of [-1.55, 1.55]) B.get('metal').box(k.x + dx, y0 + 1.6, k.z, 0.06, 3.2, 0.06, '#4a5056');
    B.get('glow').box(k.x, y0 + 3.1, k.z, 3.2, 0.5, 0.08, k.color);
  }
}

/** 2F/3F 东西两端观景休息区：沙发、绿植 */
function lounges(ctx) {
  for (const id of ['2F', '3F']) {
    const lv = ctx.layout.levels.find((l) => l.id === id);
    const B = ctx.levels[id].batch;
    const y0 = lv.elev;
    for (const sx of [-1, 1]) {
      const cx = sx * 52;
      B.get('satin').box(cx, y0 + 0.008, 0, 15.5, 0.016, 7.6, '#d9cbb5');
      for (const dz of [-2.2, 2.2]) {
        B.get('matte').box(cx + sx * 2, y0 + 0.25, dz, 3.2, 0.5, 0.9, '#55707f');
        B.get('matte').box(cx + sx * 2, y0 + 0.62, dz + (dz > 0 ? 0.38 : -0.38), 3.2, 0.5, 0.18, '#55707f');
      }
      B.get('satin').cyl(cx + sx * 2, y0, 0, 0.5, 0.45, '#e9e2d6', 16);
      // 绿植避开两端消防楼梯门（西端门在北侧，东端门在南侧）
      const dz = sx > 0 ? -3 : 3;
      B.get('matte').cyl(cx + sx * 6.5, y0, dz, 0.45, 0.7, '#6b4426', 12);
      B.get('foliage').sphere(cx + sx * 6.5, y0 + 1.4, dz, 0.7, '#4f8a3a');
    }
  }
  void bench; void COLORS;
}

/** 中庭"云朵"悬挂艺术装置（随 3F 显示） */
function atriumArt(ctx) {
  const B = ctx.levels['3F'].batch;
  const rand = rng(2026);
  const anchors = [];
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand());
    const x = Math.cos(a) * r * 10;
    const z = Math.sin(a) * r * 5.2;
    const y = 9.2 + rand() * 5.0 - r * 1.6;
    const rad = 0.35 + rand() * 0.55;
    anchors.push([x, y, z, rad]);
  }
  for (const [x, y, z, rad] of anchors) {
    B.get('glowSoft').sphere(x, y, z, rad, rand() < 0.15 ? '#bfe9f5' : '#f6f8fb');
    B.get('metal').box(x, (y + rad + 16.4) / 2, z, 0.012, 16.4 - y - rad, 0.012, '#9aa0a6');
  }
}
