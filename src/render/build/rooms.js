// 用房：客梯核（电梯门、楼层显示）、货梯、楼梯间（梯段 + 安全出口灯）、卫生间（男/女/无障碍/母婴）、
// 设备房、停车层电梯厅玻璃门斗与 B1 扶梯厅。
import { NORMAL, rw, rd, rcx, rcz } from '../../layout/geom.js';
import { themeOf, COLORS } from '../theme.js';
import { clearHeight } from './shell.js';

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
    const lifts = layout.elevators.filter((e) => e.type === 'passenger' && e.serves.includes(lv.id));
    // 三期地上层：楼梯为外挂钢梯、客梯为室外玻璃梯，由 street.js / elevators.js 绘制
    const street = ctx.bById[lv.building].kind === 'street' && lv.kind !== 'parking';
    for (const r of lv.rooms) {
      if (street && (r.type === 'core' || r.type === 'stair')) continue;
      B.frame(r.frame, () => L.signs.frame(r.frame, () => {
        if (r.type === 'core') coreShafts(B, lv, r, y0, hh, lifts.filter((e) => e.frame.id === r.frame.id));
        else if (r.type === 'stair') stair(B, L, atlas, r, y0, roof ? 3.6 : H, roof);
        else if (r.type === 'wc') restroom(B, L, atlas, lv, r, y0, roof ? 3.6 : H, roof);
        else if (r.type === 'equip') {
          const g = r.rects[0];
          B.get('matte').box(rcx(g), y0 + H / 2, rcz(g), rw(g) - 0.05, H, rd(g) - 0.05, '#b4b9be');
          B.get('matte').box(rcx(g), y0 + H + 0.015, rcz(g), rw(g), 0.03, rd(g), '#6b7178');
        }
      }));
    }
    // 电梯厅地面
    for (const w of lv.walk) {
      if (!w.rect || !(w.kind === 'lobby' || w.kind === 'service' || w.kind === 'eschall')) continue;
      const g = w.rect;
      B.frame(w.frame, () => B.get('satin').box(rcx(g), y0 + 0.01, rcz(g), rw(g) - 0.1, 0.02, rd(g) - 0.1, lv.kind === 'parking' ? '#d9dde1' : '#cfc6b8'));
    }
    if (!street) lobbySigns(L, atlas, lv, y0, H, lifts);
    if (lv.kind === 'parking') parkingVestibules(B, L, atlas, lv, y0, H, lifts);
  }
}

function coreShafts(B, lv, r, y0, H, lifts) {
  const g = r.rects[0];
  const clad = lv.kind === 'parking' ? '#c3c8cc' : themeOf(lv).column;
  B.get('satin').box(rcx(g), y0 + H / 2, rcz(g), rw(g), H, rd(g), clad);
  B.get('matte').box(rcx(g), y0 + H + 0.015, rcz(g), rw(g), 0.03, rd(g), '#5d5650');
  // 电梯门（在电梯的门所在面，局部坐标）
  for (const e of lifts) {
    if (e.lu < g.x0 || e.lu > g.x1 || e.lv < g.z0 || e.lv > g.z1) continue;
    const [nx, nz] = NORMAL[e.door];
    const alongU = e.door === 'N' || e.door === 'S';
    const fx = e.lu + nx * (e.d / 2 + 0.03), fz = e.lv + nz * (e.d / 2 + 0.03);
    const box = (k, y, w, h, color, o = 0) => B.get(k).box(fx + nx * o, y, fz + nz * o, alongU ? w : 0.04, h, alongU ? 0.04 : w, color);
    box('metal', y0 + 1.15, 1.5, 2.3, '#5f666d');
    box('metal', y0 + 1.1, 1.2, 2.2, '#c9ced3', 0.01);
    box('metal', y0 + 1.1, 0.02, 2.2, '#8a9198', 0.012);
    box('glow', y0 + 2.55, 0.5, 0.18, '#ff7a45', 0.02);
  }
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

/** 客梯厅导视牌：挂在电梯门前方的商业街 / 步行脊上空 */
function lobbySigns(L, atlas, lv, y0, H, lifts) {
  const y = y0 + Math.min(3.35, H - 0.4);
  const seen = new Set();
  for (const e of lifts) {
    const key = `${e.frame.id}:${Math.round(e.lu / 8)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [nx, nz] = NORMAL[e.door];
    const mates = lifts.filter((o) => o.frame.id === e.frame.id && Math.abs(o.lv - e.lv) < 0.1 && Math.abs(o.lu - e.lu) < 6);
    const cu = mates.reduce((a, o) => a + o.lu, 0) / mates.length;
    const sx = cu + nx * (e.d / 2 + 0.6), sz = e.lv + nz * (e.d / 2 + 0.6);
    L.signs.frame(e.frame, () => L.signs.place(sx, y, sz, 2.4, 0.6, e.door, atlas.cell('wf-lift')));
    L.batch.frame(e.frame, () => L.batch.get('metal').box(sx, y + 0.55, sz, 0.04, 0.5, 0.04, '#4a5056'));
  }
}

/** 停车层：电梯门前的玻璃门斗 */
function parkingVestibules(B, L, atlas, lv, y0, H, lifts) {
  const seen = new Set();
  for (const e of lifts) {
    const key = `${e.frame.id}:${Math.round(e.lu / 8)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mates = lifts.filter((o) => o.frame.id === e.frame.id && Math.abs(o.lv - e.lv) < 0.1 && Math.abs(o.lu - e.lu) < 6);
    if (e.door === 'E' || e.door === 'W') {
      sideVestibule(B, L, atlas, e, y0, H);
      continue;
    }
    const u0 = Math.min(...mates.map((o) => o.lu)) - 2.2, u1 = Math.max(...mates.map((o) => o.lu)) + 2.2;
    const nz = NORMAL[e.door][1];
    const face = e.lv + nz * (e.d / 2);
    const v = face + nz * 2.4;
    B.frame(e.frame, () => {
      const len = u1 - u0;
      const n = Math.round(len / 1.4);
      for (let i = 0; i < n; i++) {
        const a = u0 + (i + 0.5) * (len / n);
        if (Math.abs(a - (u0 + u1) / 2) < 1.0) continue;
        B.get('glass').box(a, y0 + 1.4, v, len / n - 0.05, 2.8, 0.04, 0xffffff);
      }
      for (const a of [u0, u1]) B.get('glass').box(a, y0 + 1.4, (v + face) / 2, 0.04, 2.8, 2.4, 0xffffff);
      B.get('metal').box((u0 + u1) / 2, y0 + 2.85, v, len, 0.12, 0.12, '#4a5056');
      B.get('matte').box((u0 + u1) / 2, y0 + (2.9 + H) / 2, v, len, H - 2.9, 0.2, '#d4d8dc');
    });
    L.signs.frame(e.frame, () => L.signs.place((u0 + u1) / 2, y0 + 3.15, v + nz * 0.13, 2.8, 0.7, e.door, atlas.cell('wf-lift')));
  }
}

/** 门朝 E / W 的单台电梯门斗（三期地库）：玻璃门斗沿 v 方向展开 */
function sideVestibule(B, L, atlas, e, y0, H) {
  const nx = NORMAL[e.door][0];
  const face = e.lu + nx * (e.w / 2);
  const u = face + nx * 2.4;
  const v0 = e.lv - 2.2, v1 = e.lv + 2.2;
  B.frame(e.frame, () => {
    const len = v1 - v0;
    const n = Math.round(len / 1.4);
    for (let i = 0; i < n; i++) {
      const v = v0 + (i + 0.5) * (len / n);
      if (Math.abs(v - e.lv) < 1.0) continue;
      B.get('glass').box(u, y0 + 1.4, v, 0.04, 2.8, len / n - 0.05, 0xffffff);
    }
    for (const v of [v0, v1]) B.get('glass').box((u + face) / 2, y0 + 1.4, v, 2.4, 2.8, 0.04, 0xffffff);
    B.get('metal').box(u, y0 + 2.85, e.lv, 0.12, 0.12, len, '#4a5056');
    B.get('matte').box(u, y0 + (2.9 + H) / 2, e.lv, 0.2, H - 2.9, len, '#d4d8dc');
  });
  L.signs.frame(e.frame, () => L.signs.place(u + nx * 0.13, y0 + 3.15, e.lv, 2.8, 0.7, e.door, atlas.cell('wf-lift')));
}
