// 影城的放映厅：渲染（interiors.js）和第一人称导航（nav.js）共用一份，保证「看到的墙」就是「挡人的墙」。
// 以前放映厅只是画出来的四面墙、一块银幕、几排座椅，导航里一样都没有：厅的墙紧贴着两面门脸（门洞被墙挡着），
// 人从银幕、墙、座椅里直接穿过去——开局锁在影城里，出门要「穿墙」。现在：
//   门脸那几面先留出一条大堂（lobby 米宽），厅摆在剩下的那块里、不碰门脸；每个厅朝大堂那几面开门（door 米宽，开在后排那头）；
//   厅的墙扣掉门洞以后进导航；每排座椅是一段矮墙（顶高 top，人过不去、站着能从上面开枪），两头留过道；卖品台是一块实心障碍。
// 坐标都是铺位局部坐标（和 u.rects 一样）。纯函数。

/**
 * lobby：门脸那一面留多宽的大堂；inset：不是门脸的那几面离铺位外墙多远；share：厅最多占长边的几成；gap：两个厅之间的缝；
 * door：厅门宽；doorAt：门开在厅长边从银幕那头量的几成处；minHall：厅短边至少多宽（不够就不摆厅）；
 * row：排距；first：第一排离银幕多远；aisle：两边过道宽；seat：座椅进深、高；rise：一排比一排高多少；
 * counter：卖品台的长、宽、高（摆在大堂正中）
 */
export const CINEMA = Object.freeze({
  lobby: 3.6, inset: 0.4, share: 0.62, gap: 0.4, door: 1.8, doorAt: 0.78, minHall: 6,
  row: 1.1, first: 2.4, aisle: 1.4, seat: Object.freeze({ d: 0.6, h: 0.7 }), rise: 0.18,
  counter: Object.freeze({ w: 7, d: 1.0, h: 1.1 }),
});

const seg = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });
/** 一段墙 [a, b]（沿 axis 方向）扣掉门洞 doors（[[c0, c1]]），剩下的几段 */
function cut(a, b, doors) {
  let out = [[a, b]];
  for (const [c0, c1] of doors) out = out.flatMap(([p, q]) => (c1 <= p || c0 >= q ? [[p, q]] : [[p, Math.max(p, c0)], [Math.min(q, c1), q]]).filter(([s, t]) => t - s > 0.02));
  return out;
}

/**
 * 铺位 u（影城）的放映厅。返回 { halls, walls, rows, counter }：
 *   halls：[{ x0, z0, x1, z1, along（'x' | 'z'：银幕到后排的方向）, screen（银幕那一头的坐标）, sign（+1：后排在坐标大的那头）, doors: [{ side, c0, c1 }] }]；
 *   walls：厅墙扣掉门洞以后的线段 [{ x0, z0, x1, z1 }]；rows：每排座椅的中线 [{ x0, z0, x1, z1, top, k }]；counter：卖品台 { x0, z0, x1, z1 } 或 null。
 */
export function cinemaPlan(u, C = CINEMA) {
  const r = u.rects?.[0], out = { halls: [], walls: [], rows: [], counter: null };
  if (!r) return out;
  const sides = new Set((u.fronts || []).map((f) => f.side));
  const inner = { x0: r.x0 + (sides.has('W') ? C.lobby : C.inset), x1: r.x1 - (sides.has('E') ? C.lobby : C.inset), z0: r.z0 + (sides.has('N') ? C.lobby : C.inset), z1: r.z1 - (sides.has('S') ? C.lobby : C.inset) };
  const W = inner.x1 - inner.x0, D = inner.z1 - inner.z0;
  if (Math.min(W, D) < C.minHall) return out;
  const along = D >= W ? 'z' : 'x';
  // 厅从不是门脸的那一头摆起（两头都是 / 都不是：从坐标小的那头），大堂在另一头
  const loSide = along === 'z' ? 'N' : 'W', hiSide = along === 'z' ? 'S' : 'E';
  const fromHi = sides.has(loSide) && !sides.has(hiSide), sign = fromHi ? -1 : 1;
  const lo = along === 'z' ? inner.z0 : inner.x0, hi = along === 'z' ? inner.z1 : inner.x1, full = along === 'z' ? r.z1 - r.z0 : r.x1 - r.x0;
  const len = Math.min(hi - lo, full * C.share), cross = along === 'z' ? [inner.x0, inner.x1] : [inner.z0, inner.z1];
  // 侧面朝着大堂（门脸那一面）的才开门；两个侧面都不朝大堂：只摆一个厅，门开在后墙（朝大堂）
  const sideA = along === 'z' ? 'W' : 'N', sideB = along === 'z' ? 'E' : 'S', lobbyA = sides.has(sideA), lobbyB = sides.has(sideB);
  const n = (lobbyA || lobbyB) && len >= 2 * C.minHall + C.gap ? 2 : 1, each = (len - (n - 1) * C.gap) / n;
  for (let i = 0; i < n; i++) {
    const a0 = sign > 0 ? lo + i * (each + C.gap) : hi - i * (each + C.gap) - each, a1 = a0 + each;
    const h = along === 'z' ? { x0: cross[0], x1: cross[1], z0: a0, z1: a1 } : { x0: a0, x1: a1, z0: cross[0], z1: cross[1] };
    const screen = sign > 0 ? a0 : a1, back = sign > 0 ? a1 : a0;
    const dc = screen + sign * each * C.doorAt, dr = [Math.min(dc - sign * C.door / 2, dc + sign * C.door / 2), Math.max(dc - sign * C.door / 2, dc + sign * C.door / 2)];
    const doors = [];
    if (lobbyA) doors.push({ side: sideA, c0: dr[0], c1: dr[1] });
    if (lobbyB) doors.push({ side: sideB, c0: dr[0], c1: dr[1] });
    const c = (cross[0] + cross[1]) / 2;
    if (!doors.length) doors.push({ side: 'back', c0: c - C.door / 2, c1: c + C.door / 2 });
    out.halls.push({ ...h, along, screen, sign, doors });
    // 墙：两条长边（扣掉侧门）、银幕那头、后墙（扣掉后门）
    const gaps = (s) => doors.filter((d) => d.side === s).map((d) => [d.c0, d.c1]);
    for (const [p, q] of cut(a0, a1, gaps(sideA))) out.walls.push(along === 'z' ? seg(h.x0, p, h.x0, q) : seg(p, h.z0, q, h.z0));
    for (const [p, q] of cut(a0, a1, gaps(sideB))) out.walls.push(along === 'z' ? seg(h.x1, p, h.x1, q) : seg(p, h.z1, q, h.z1));
    out.walls.push(along === 'z' ? seg(h.x0, screen, h.x1, screen) : seg(screen, h.z0, screen, h.z1));
    for (const [p, q] of cut(cross[0], cross[1], gaps('back'))) out.walls.push(along === 'z' ? seg(p, back, q, back) : seg(back, p, back, q));
    // 座椅：从银幕往后一排排，两边留过道；最后一排离后墙至少 1.2 米（门口那条横过道）
    for (let k = 0; ; k++) {
      const o = C.first + k * C.row; if (o > each - 1.6) break;
      const at = screen + sign * o, x0 = cross[0] + C.aisle, x1 = cross[1] - C.aisle;
      out.rows.push({ ...(along === 'z' ? seg(x0, at, x1, at) : seg(at, x0, at, x1)), top: C.seat.h + k * C.rise, k });
    }
  }
  // 卖品台：大堂那一块（厅以外）的正中，够宽才摆
  const used = n * each + (n - 1) * C.gap, rest0 = sign > 0 ? lo + used + 0.4 : (along === 'z' ? r.z0 : r.x0) + (sides.has(loSide) ? C.lobby : C.inset), rest1 = sign > 0 ? (along === 'z' ? r.z1 : r.x1) - (sides.has(hiSide) ? C.lobby : C.inset) : hi - used - 0.4;
  if (rest1 - rest0 > C.counter.d + 3) {
    const m = (rest0 + rest1) / 2, c = (cross[0] + cross[1]) / 2, w = Math.min(C.counter.w, cross[1] - cross[0] - 3);
    if (w > 2) out.counter = along === 'z' ? { x0: c - w / 2, x1: c + w / 2, z0: m - C.counter.d / 2, z1: m + C.counter.d / 2 } : { x0: m - C.counter.d / 2, x1: m + C.counter.d / 2, z0: c - w / 2, z1: c + w / 2 };
  }
  return out;
}
