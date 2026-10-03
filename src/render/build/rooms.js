// 用房：客梯核（电梯门、楼层显示）、货梯、楼梯间（梯段 + 安全出口灯）、卫生间（男/女/无障碍/母婴）、
// 设备房、停车层电梯厅玻璃门斗与 B1 扶梯厅。
import { NORMAL, rw, rd, rcx, rcz } from '../../layout/geom.js';
import { THEME, COLORS } from '../theme.js';
import { clearHeight } from './shell.js';
import { CORE_W, CORE_E, SERVICE } from '../../layout/constants.js';

/** 以一段门（或墙）为基准的局部坐标：u 沿门所在墙，v 向房间内部 */
function wallFrame(rect, side) {
  // 门所在墙的起点与方向
  const map = {
    S: { o: [rect.x0, rect.z1], u: [1, 0], len: rw(rect), depth: rd(rect) },
    N: { o: [rect.x1, rect.z0], u: [-1, 0], len: rw(rect), depth: rd(rect) },
    E: { o: [rect.x1, rect.z1], u: [0, -1], len: rd(rect), depth: rw(rect) },
    W: { o: [rect.x0, rect.z0], u: [0, 1], len: rd(rect), depth: rw(rect) },
  }[side];
  const [nx, nz] = NORMAL[side];
  return {
    ...map,
    ang: Math.atan2(-map.u[1], map.u[0]),
    at: (a, b) => [map.o[0] + map.u[0] * a - nx * b, map.o[1] + map.u[1] * a - nz * b],
  };
}

export function buildRooms(ctx) {
  const { layout } = ctx;
  for (const lv of layout.levels) {
    const L = ctx.levels[lv.id];
    const B = L.batch;
    const atlas = ctx.atlas[lv.id];
    const y0 = lv.elev;
    const H = clearHeight(lv);
    const roof = lv.kind === 'roof';
    const hh = roof ? 4.2 : H;
    for (const r of lv.rooms) {
      if (r.type === 'core') coreShafts(B, L, atlas, lv, r, y0, hh);
      else if (r.type === 'freight') freight(B, L, atlas, r, y0, hh);
      else if (r.type === 'stair') stair(B, L, atlas, r, y0, roof ? 3.6 : H, roof);
      else if (r.type === 'wc') restroom(B, L, atlas, lv, r, y0, roof ? 3.6 : H, roof);
      else if (r.type === 'equip') {
        const g = r.rects[0];
        B.get('matte').box(rcx(g), y0 + H / 2, rcz(g), rw(g) - 0.05, H, rd(g) - 0.05, '#b4b9be');
        B.get('matte').box(rcx(g), y0 + H + 0.015, rcz(g), rw(g), 0.03, rd(g), '#6b7178');
      }
    }
    // 电梯厅地面、导视
    for (const w of lv.walk) {
      if (w.kind === 'lobby' || w.kind === 'service' || (w.kind === 'eschall' && lv.kind === 'parking')) {
        const g = w.rect;
        B.get('satin').box(rcx(g), y0 + 0.01, rcz(g), rw(g) - 0.1, 0.02, rd(g) - 0.1, lv.kind === 'parking' ? '#d9dde1' : '#cfc6b8');
      }
    }
    lobbySigns(L, atlas, lv, y0, H);
    if (lv.kind === 'parking') parkingVestibules(B, L, atlas, lv, y0, H);
  }
}

function coreShafts(B, L, atlas, lv, r, y0, H) {
  const g = r.rects[0];
  const clad = lv.kind === 'parking' ? '#c3c8cc' : THEME[lv.id].column;
  B.get('satin').box(rcx(g), y0 + H / 2, rcz(g), rw(g), H, rd(g), clad);
  B.get('matte').box(rcx(g), y0 + H + 0.015, rcz(g), rw(g), 0.03, rd(g), '#5d5650');
  // 电梯门（朝电梯厅）
  const east = g.x1 < 0; // 西核：门在东侧 x1；东核：门在西侧 x0
  const fx = east ? g.x1 + 0.03 : g.x0 - 0.03;
  for (const zc of east ? [-32.1, -29.5, -26.9] : [26.9, 29.5, 32.1]) {
    B.get('metal').box(fx, y0 + 1.15, zc, 0.04, 2.3, 1.5, '#5f666d');
    B.get('metal').box(fx + (east ? 0.01 : -0.01), y0 + 1.1, zc, 0.04, 2.2, 1.2, '#c9ced3');
    B.get('metal').box(fx + (east ? 0.012 : -0.012), y0 + 1.1, zc, 0.045, 2.2, 0.02, '#8a9198');
    B.get('glow').box(fx + (east ? 0.02 : -0.02), y0 + 2.55, zc, 0.03, 0.18, 0.5, '#ff7a45');
    B.get('glow').box(fx + (east ? 0.02 : -0.02), y0 + 1.2, zc + (east ? 1.0 : -1.0), 0.03, 0.22, 0.1, '#7fd3ff');
  }
  void L; void atlas;
}

function freight(B, L, atlas, r, y0, H) {
  const g = r.rects[0];
  B.get('matte').box(rcx(g), y0 + H / 2, rcz(g), rw(g), H, rd(g), '#b9bec3');
  B.get('matte').box(rcx(g), y0 + H + 0.015, rcz(g), rw(g), 0.03, rd(g), '#5d5650');
  B.get('metal').box(g.x1 + 0.03, y0 + 1.35, -29, 0.05, 2.7, 2.4, '#7d848b');
  B.get('metal').box(g.x1 + 0.04, y0 + 1.35, -29, 0.05, 2.6, 0.03, '#4a5056');
  B.get('glow').box(g.x1 + 0.05, y0 + 2.9, -29, 0.03, 0.18, 0.6, '#ff7a45');
  void L; void atlas;
}

/** 楼梯：两跑楼梯 + 平台 + 门上方安全出口灯 */
function stair(B, L, atlas, r, y0, H, roof) {
  const g = r.rects[0];
  const door = r.doors[0];
  const longX = rw(g) >= rd(g);
  const len = (longX ? rw(g) : rd(g)) - 2.4;
  const lane = (longX ? rd(g) : rw(g)) / 2 - 0.2;
  const half = H / 2;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const h1 = half * ((i + 1) / n);
    const h2 = half + half * ((i + 1) / n);
    const a = -len / 2 + len * t;
    if (longX) {
      B.get('matte').box(rcx(g) + a, y0 + h1 / 2, g.z0 + 0.2 + lane / 2, len / n, h1, lane, '#c9c4bb');
      B.get('matte').box(rcx(g) - a, y0 + half + (h2 - half) / 2, g.z1 - 0.2 - lane / 2, len / n, Math.min(h2 - half, half) + 0.01, lane, '#c9c4bb');
    } else {
      B.get('matte').box(g.x0 + 0.2 + lane / 2, y0 + h1 / 2, rcz(g) + a, lane, h1, len / n, '#c9c4bb');
    }
  }
  if (longX) B.get('matte').box(rcx(g) + len / 2 + 0.6, y0 + half - 0.1, rcz(g), 1.2, 0.2, rd(g) - 0.4, '#bdb7ad');
  B.get('metal').box(rcx(g), y0 + 1.0, rcz(g), longX ? len : 0.06, 0.06, longX ? 0.06 : len, '#4a5056');
  // 门与安全出口灯
  const [nx, nz] = NORMAL[door.side];
  const mx = (door.x0 + door.x1) / 2, mz = (door.z0 + door.z1) / 2;
  const alongX = door.side === 'N' || door.side === 'S';
  B.get('metal').box(mx + nx * 0.06, y0 + 1.1, mz + nz * 0.06, alongX ? 1.5 : 0.06, 2.2, alongX ? 0.06 : 1.5, '#5b6b5f');
  L.signs.place(mx + nx * 0.14, y0 + 2.55, mz + nz * 0.14, 1.6, 0.4, door.side, atlas.cell('wf-exit'));
  if (roof) B.get('satin').box(rcx(g), y0 + H + 0.1, rcz(g), rw(g) + 0.3, 0.2, rd(g) + 0.3, COLORS.stoneDark);
}

/** 卫生间：前室洗手台 + 男/女厕 + 无障碍 + 母婴室 */
function restroom(B, L, atlas, lv, r, y0, H, roof) {
  const g = r.rects[0];
  const door = r.doors[0];
  const F = wallFrame(g, door.side);
  const P = (key, a, b, y, sa, sb, sy, color) => {
    const [x, z] = F.at(a, b);
    B.get(key).box(x, y, z, sa, sy, sb, color, F.ang);
  };
  const W = F.len, D = F.depth;
  const tile = '#eef0f1';
  P('satin', W / 2, D / 2, y0 + 0.008, W - 0.2, D - 0.2, 0.016, '#dfe3e6');
  if (roof) {
    // 天台卫生间为独立小屋
    P('matte', W / 2, D / 2, y0 + H / 2, W, D, H, '#e7e2d8');
    P('satin', W / 2, D / 2, y0 + H + 0.1, W + 0.4, D + 0.4, 0.2, COLORS.stoneDark);
    const [x, z] = F.at(W / 2, -0.12);
    L.signs.place(x, y0 + 2.9, z, 2.6, 0.65, door.side, atlas.cell('wf-wc'));
    return;
  }
  // 隔墙（前室与内部）
  const wall = (a0, a1, b0, b1) => P('matte', (a0 + a1) / 2, (b0 + b1) / 2, y0 + H / 2, Math.max(0.12, a1 - a0), Math.max(0.12, b1 - b0), H, tile);
  wall(0, 0.4, 3, 3.1);
  wall(1.4, 3.3, 3, 3.1);
  wall(4.7, 6.6, 3, 3.1);
  wall(7.6, 8, 3, 3.1);
  wall(2.95, 3.05, 3, D);
  wall(4.95, 5.05, 3, D);
  wall(3, 5, 6.5, 6.6);
  wall(3, 5, 10.5, 10.6);
  // 洗手台 + 镜子
  P('satin', W / 2, 2.55, y0 + 0.82, 4.6, 0.55, 0.12, '#f7f7f5');
  for (let k = 0; k < 4; k++) P('satin', W / 2 - 1.65 + k * 1.1, 2.6, y0 + 0.9, 0.42, 0.32, 0.06, '#ffffff');
  P('glass', W / 2, 2.98, y0 + 1.7, 4.4, 0.03, 1.0, 0xffffff);
  P('glow', W / 2, 2.95, y0 + 2.3, 4.4, 0.04, 0.06, '#fff6e5');
  // 男厕：小便斗 + 隔间
  for (let k = 0; k < 4; k++) P('satin', 0.22, 4 + k * 0.9, y0 + 0.75, 0.3, 0.45, 0.65, '#ffffff');
  for (let k = 0; k < 6; k++) {
    const b = 8.6 + k * 1.15;
    if (b > D - 0.6) break;
    P('matte', 2.05, b + 0.55, y0 + 1.0, 1.8, 0.04, 2.0, '#9db4c0');
    P('satin', 2.55, b, y0 + 0.22, 0.65, 0.42, 0.44, '#ffffff');
  }
  // 女厕：隔间
  for (let k = 0; k < 10; k++) {
    const b = 4 + k * 1.15;
    if (b > D - 0.6) break;
    P('matte', 7.2, b + 0.55, y0 + 1.0, 1.6, 0.04, 2.0, '#e7b6c8');
    P('satin', 7.55, b, y0 + 0.22, 0.6, 0.42, 0.44, '#ffffff');
  }
  // 无障碍：坐便 + 扶手 + 洗手盆
  P('satin', 4.4, 4.0, y0 + 0.22, 0.6, 0.42, 0.44, '#ffffff');
  P('metal', 3.3, 4.5, y0 + 0.8, 0.05, 1.2, 0.05, '#c0c4c8');
  P('satin', 3.4, 5.9, y0 + 0.8, 0.5, 0.4, 0.1, '#ffffff');
  // 母婴室：护理台 + 沙发
  P('satin', 4.4, 7.4, y0 + 0.45, 0.8, 1.2, 0.9, '#f5d0dd');
  P('matte', 3.5, 9.4, y0 + 0.3, 0.8, 1.4, 0.6, '#a8c6e0');
  // 门头标识（外）与内部男女标识
  const [x, z] = F.at(W / 2, -0.12);
  L.signs.place(x, y0 + 3.0, z, 2.6, 0.65, door.side, atlas.cell('wf-wc'));
  P('glow', 0.9, 3.12, y0 + 2.4, 0.5, 0.03, 0.5, '#4d8fe0');
  P('glow', 7.1, 3.12, y0 + 2.4, 0.5, 0.03, 0.5, '#e05a8a');
  P('glow', 4.0, 3.12, y0 + 2.4, 0.5, 0.03, 0.5, '#3aa76d');
  void lv;
}

/** 电梯厅、货梯厅入口的导视牌 */
function lobbySigns(L, atlas, lv, y0, H) {
  const y = y0 + Math.min(3.35, H - 0.4);
  L.signs.place(-30.5, y, -24 + 0.12, 2.4, 0.6, 'S', atlas.cell('wf-lift'));
  L.signs.place(30.5, y, 24 - 0.12, 2.4, 0.6, 'N', atlas.cell('wf-lift'));
  if (lv.rooms.some((r) => r.type === 'freight')) L.signs.place((SERVICE.lobby.x0 + SERVICE.lobby.x1) / 2, y, -24 + 0.12, 2.0, 0.5, 'S', atlas.cell('wf-freight'));
  void CORE_W; void CORE_E;
}

/** 停车层：电梯厅与扶梯厅的玻璃门斗 */
function parkingVestibules(B, L, atlas, lv, y0, H) {
  const fronts = [
    { x0: -33, x1: -28, z: -24, side: 'S' },
    { x0: 28, x1: 33, z: 24, side: 'N' },
  ];
  if (lv.id === 'B1') fronts.push({ x0: -20, x1: -6, z: -24, side: 'S', esc: true });
  for (const f of fronts) {
    const len = f.x1 - f.x0;
    const n = Math.round(len / 1.4);
    for (let i = 0; i < n; i++) {
      const a = f.x0 + (i + 0.5) * (len / n);
      const mid = (f.x0 + f.x1) / 2;
      if (Math.abs(a - mid) < 1.0) continue;
      B.get('glass').box(a, y0 + 1.4, f.z, len / n - 0.05, 2.8, 0.04, 0xffffff);
    }
    B.get('metal').box((f.x0 + f.x1) / 2, y0 + 2.85, f.z, len, 0.12, 0.12, '#4a5056');
    B.get('matte').box((f.x0 + f.x1) / 2, y0 + (2.9 + H) / 2, f.z, len, H - 2.9, 0.2, '#d4d8dc');
    const sign = f.esc ? 'wf-food' : 'wf-lift';
    L.signs.place((f.x0 + f.x1) / 2, y0 + 3.15, f.z + (f.side === 'S' ? 0.13 : -0.13), Math.min(len - 0.4, 2.8), Math.min(len - 0.4, 2.8) / 4, f.side, atlas.cell(sign));
  }
}
