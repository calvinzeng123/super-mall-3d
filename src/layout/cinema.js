// 影城的平面：渲染（render/build/interiors.js）和第一人称导航（nav.js）共用一份，保证「看到的东西」就是「挡人的东西」。
// 以前影城只是一条贴着门脸的大堂、两间方盒子厅、每排座椅一块红色矮墙——人从座椅「贴图」里穿过去，也不像个影城。现在是一间真的影城：
//   入口大堂（门脸的门洞开在这里）：售票台、卖品部（柜台 + 后柜）、排队栏杆、检票口、柱子，检票口上方一块场次屏；
//   候场区（远离放映厅的那一头）：一组组背靠背的长椅、墙上的海报灯箱、服务台（值班台）；
//   检票口进去是一条走廊，走廊一侧是各个厅的门：每个厅两道门（入场门、散场门，门头有厅号、门里有绿色出口灯）；
//   放映厅：门开在银幕那一头的两个角上，进门是银幕前的一块平地；座椅一排比一排高（阶梯看台），两边是带台阶的过道，墙上有壁灯。
// 导航（nav.js）里：厅墙、隔墙、柱子是整面墙；柜台、长椅、栏杆、看台每一级、每排椅背都是有顶高的实心东西（人过不去，子弹只挡到顶高）；
// 两条过道是导航里的坡道（kind 'aisle'，两头都在这一层：人走上去脚下的高度跟着台阶升，走到最后一排是死胡同，原路下来）。
// 看台那一块从地面上是进不去的（一整块实心的阶梯），座椅之间的腿位比人窄，只能走过道——和真影院里一样，人只在过道里上下。
// 坐标：铺位局部坐标（和 u.rects 一样）。内部先在「规范坐标」(a, b) 里排：a 横跨铺位、b 从放映厅那一头（封闭的一端）量到另一头。纯函数。

import { doorGaps } from './frontage.js';

/**
 * inset：厅墙、走廊离铺位外墙多远；hall：厅进深最多多少、至少多少；hallMin：厅宽至少多少；two：铺位净宽够这么多就并排两个厅；split：两个厅之间的缝；
 * corridor：走廊宽；check：检票口宽；foyer：大堂进深；front：银幕到第一级看台的平地；aisle：过道宽；pitch：排距；rise：每排升多高；
 * seat：座椅（宽 w、坐垫高 h、椅背顶 back（离这一级台面））；rail：栏杆高；counter：柜台高、进深；backbar：后柜高、进深；
 * bench：长椅（长、进深、椅背顶）；pillar：柱子边长；clear：门洞前后留多少空地不摆东西
 */
export const CINEMA = Object.freeze({
  inset: 0.4, hall: Object.freeze({ max: 13.6, min: 9 }), hallMin: 6.5, two: 15.5, split: 0.3,
  corridor: 2.4, check: 2.4, foyer: 14, front: 3.2, aisle: 1.3, pitch: 1.1, rise: 0.24,
  seat: Object.freeze({ w: 0.56, h: 0.46, back: 1.0 }), rail: 1.0,
  counter: Object.freeze({ h: 1.1, d: 0.8 }), backbar: Object.freeze({ h: 2.2, d: 0.45 }), bench: Object.freeze({ l: 2.2, d: 0.55, h: 0.85 }), pillar: 0.8, clear: 1.2,
});

/** 规范坐标 → 铺位局部坐标的换算 */
export function cinemaFrame(fr) {
  const { along, flip, r } = fr;
  const at = (a, b) => (along === 'z' ? [r.x0 + a, flip ? r.z1 - b : r.z0 + b] : [flip ? r.x1 - b : r.x0 + b, r.z0 + a]);
  return {
    at,
    /** 规范坐标里的线段 / 矩形 → 局部坐标 */
    seg: (a0, b0, a1, b1) => { const [x0, z0] = at(a0, b0), [x1, z1] = at(a1, b1); return { x0, z0, x1, z1 }; },
    rect: (a0, b0, a1, b1) => { const [x0, z0] = at(a0, b0), [x1, z1] = at(a1, b1); return { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) }; },
    /** 规范坐标里 sa × sb 的东西在局部坐标里是多大（[sx, sz]） */
    size: (sa, sb) => (along === 'z' ? [sa, sb] : [sb, sa]),
    /** +b 方向（朝银幕、朝大堂）在局部坐标里是哪个方向 */
    dirB: along === 'z' ? [0, flip ? -1 : 1] : [flip ? -1 : 1, 0],
    dirA: along === 'z' ? [1, 0] : [0, 1],
  };
}

/** 一段 [p, q] 扣掉洞 holes（[[c0, c1]]），剩下的几段 */
function cut(p, q, holes) {
  let out = [[p, q]];
  for (const [c0, c1] of holes) out = out.flatMap(([s, t]) => (c1 <= s || c0 >= t ? [[s, t]] : [[s, Math.max(s, c0)], [Math.min(t, c1), t]]).filter(([m, n]) => n - m > 0.02));
  return out;
}

/**
 * 铺位 u（影城）的平面。返回：
 *   frame：{ along, flip, r, W（横向净宽）, L（纵向长） }（规范坐标，见 cinemaFrame）；
 *   halls：[{ n（厅号）, a0, a1, b0（后墙）, b1（银幕墙）, sb（第一级看台的前沿）, tiers: [{ b0, b1, top }], rows: [{ b（椅背那条线）, base（台面高）, seats: [a] }],
 *            aisles: [{ a0, a1, b0（顶端）, b1（底端 = sb）, y0, y1 }], doors: [{ a0, a1, exit }], screen: { a0, a1 } }]（规范坐标）；
 *   corridor：{ b0, b1, a0, a1 } 或 null；part：大堂和走廊之间那道隔墙的 b（null：没有）；check：检票口 [a0, a1]；
 *   foyer：{ b0, b1, ticket, concession（{ a0, a1, b0, b1 } 或 null）, rails: [[a, b0, b1]], pillars: [[a, b]], podium }；
 *   lounge：{ b0, b1, benches: [{ a0, a1, b0, b1, face（+1：坐着朝 +b） }], posters: [{ side（'a0' | 'a1'）, b }], duty（服务台）}；
 *   —— 下面是给导航的（铺位局部坐标）——
 *   walls：整面墙的线段；low：[{ ...线段, top }]（栏杆、椅背）；solids：[{ rect, top（null：顶到天花） }]；under：过道台阶底下（地面上进不去）的矩形；
 *   aisles：[{ bottom: [x, z], top: [x, z], hw, y0, y1 }]（离这层地面的高度）；spots：{ spawn, duty }（[x, z]：开局站的地方、服务台跟前）
 */
export function cinemaPlan(u, C = CINEMA) {
  const r = u.rects?.[0];
  const out = { frame: null, halls: [], corridor: null, part: null, check: null, foyer: null, lounge: null, walls: [], low: [], solids: [], under: [], aisles: [], spots: { spawn: null, duty: null } };
  if (!r) return out;
  const sides = new Set((u.fronts || []).map((f) => f.side));
  const along = r.z1 - r.z0 >= r.x1 - r.x0 ? 'z' : 'x';
  const loSide = along === 'z' ? 'N' : 'W', hiSide = along === 'z' ? 'S' : 'E';
  const flip = sides.has(loSide) && !sides.has(hiSide), farSide = flip ? loSide : hiSide, hallSide = flip ? hiSide : loSide;
  const W = along === 'z' ? r.x1 - r.x0 : r.z1 - r.z0, L = along === 'z' ? r.z1 - r.z0 : r.x1 - r.x0;
  const fr = { along, flip, r, W, L }, K = cinemaFrame(fr);
  out.frame = fr;
  // 门脸上的门洞：侧面（和长边平行）的换成 b 区间，远端那一面的换成 a 区间
  const sideDoorsB = [], farDoorsA = [];
  for (const f of u.fronts || []) {
    const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0); if (len < 0.05) continue;
    const ux = (f.x1 - f.x0) / len, uz = (f.z1 - f.z0) / len;
    for (const [g0, g1] of doorGaps('cinema', len)) {
      const p = [f.x0 + ux * g0, f.z0 + uz * g0], q = [f.x0 + ux * g1, f.z0 + uz * g1];
      const toB = (pt) => (along === 'z' ? (flip ? r.z1 - pt[1] : pt[1] - r.z0) : (flip ? r.x1 - pt[0] : pt[0] - r.x0));
      const toA = (pt) => (along === 'z' ? pt[0] - r.x0 : pt[1] - r.z0);
      if (f.side === farSide) farDoorsA.push([Math.min(toA(p), toA(q)), Math.max(toA(p), toA(q))]);
      else if (f.side !== hallSide) sideDoorsB.push([Math.min(toB(p), toB(q)), Math.max(toB(p), toB(q))]);
    }
  }
  const I = C.inset, solid = (a0, b0, a1, b1, top = null) => out.solids.push({ rect: K.rect(a0, b0, a1, b1), top });
  const wall = (a0, b0, a1, b1) => out.walls.push(K.seg(a0, b0, a1, b1));
  const low = (a0, b0, a1, b1, top) => out.low.push({ ...K.seg(a0, b0, a1, b1), top });

  // ---------- 放映厅、走廊 ----------
  const firstDoor = sideDoorsB.length ? Math.min(...sideDoorsB.map((d) => d[0])) : L;
  const hallLen = Math.min(C.hall.max, firstDoor - C.clear - C.corridor - I, L - I - C.corridor - 8);
  const halls = sides.has(hallSide) || hallLen < C.hall.min || W - 2 * I < C.hallMin ? 0 : W - 2 * I >= C.two ? 2 : 1;
  let part = I; // 大堂从哪儿开始（没有厅：从封闭那头起）
  if (halls) {
    const b0 = I, b1 = I + hallLen, each = (W - 2 * I - (halls - 1) * C.split) / halls;
    for (let i = 0; i < halls; i++) {
      const a0 = I + i * (each + C.split), a1 = a0 + each, sb = b1 - C.front;
      const hall = { n: i + 1, a0, a1, b0, b1, sb, tiers: [], rows: [], aisles: [], doors: [], screen: { a0: a0 + C.aisle + 0.3, a1: a1 - C.aisle - 0.3 } };
      // 门：银幕墙两个角上，正对两条过道；靠检票口那一道是入场门，另一道散场门（门里绿色出口灯）
      const mid = W / 2, nearA0 = Math.abs(a0 + C.aisle / 2 - mid) < Math.abs(a1 - C.aisle / 2 - mid);
      hall.doors.push({ a0, a1: a0 + C.aisle, exit: !nearA0 }, { a0: a1 - C.aisle, a1, exit: nearA0 });
      // 看台：从银幕往后一级比一级高，最后一级一直铺到后墙
      const n = Math.max(1, Math.floor((sb - b0 - 0.3) / C.pitch)), g = (n * C.rise) / (sb - b0);
      for (let k = 0; k < n; k++) {
        const t1 = sb - k * C.pitch, t0 = k === n - 1 ? b0 : t1 - C.pitch, top = +(0.05 + g * (sb - (t1 - C.pitch / 2))).toFixed(3);
        hall.tiers.push({ b0: t0, b1: t1, top });
        // 一排座椅：椅背在这一级靠后（远离银幕）那头，坐垫朝银幕
        const rb = t1 - C.pitch + 0.16, sa0 = a0 + C.aisle, sa1 = a1 - C.aisle, m = Math.floor((sa1 - sa0 - 0.1) / C.seat.w), seats = [];
        for (let j = 0; j < m; j++) seats.push(+(sa0 + (sa1 - sa0) / 2 + (j - (m - 1) / 2) * C.seat.w).toFixed(3));
        hall.rows.push({ b: rb, base: top, seats });
        solid(sa0, t0, sa1, t1, top);
        low(sa0, rb, sa1, rb, +(top + C.seat.back).toFixed(3));
        solid(sa0, rb - 0.06, sa1, rb + 0.56, +(top + C.seat.h + 0.1).toFixed(3)); // 坐垫、扶手那一截：横着打一排也挡
      }
      // 过道：底端在看台前沿（地面），顶端顶着后墙；台阶底下从地面上进不去
      for (const [p, q] of [[a0, a0 + C.aisle], [a1 - C.aisle, a1]]) {
        const y1 = +(0.05 + g * (sb - b0 - 0.35)).toFixed(3);
        hall.aisles.push({ a0: p, a1: q, b0: b0 + 0.35, b1: sb, y0: 0.05, y1 });
        out.under.push(K.rect(p, b0, q, sb));
        out.aisles.push({ bottom: K.at((p + q) / 2, sb), top: K.at((p + q) / 2, b0 + 0.35), hw: (q - p) / 2, y0: 0.05, y1 });
      }
      // 厅墙：两侧、后墙、银幕墙（扣掉两道门）
      wall(a0, b0, a0, b1); wall(a1, b0, a1, b1); wall(a0, b0, a1, b0);
      for (const [p, q] of cut(a0, a1, hall.doors.map((d) => [d.a0, d.a1]))) wall(p, b1, q, b1);
      out.halls.push(hall);
    }
    // 走廊：厅门外一条，两头封死；靠大堂那面是隔墙，正中开检票口
    const c0 = b1, c1 = b1 + C.corridor;
    out.corridor = { a0: I, a1: W - I, b0: c0, b1: c1 };
    wall(I, c0, I, c1); wall(W - I, c0, W - I, c1);
    out.check = [W / 2 - C.check / 2, W / 2 + C.check / 2];
    for (const [p, q] of cut(I, W - I, [out.check])) wall(p, c1, q, c1);
    part = c1; out.part = c1;
  }

  // ---------- 入口大堂 ----------
  const fb0 = part, fb1 = Math.min(L - I, part + C.foyer);
  const ck = out.check || [W / 2 - C.check / 2, W / 2 + C.check / 2];
  const foyer = { b0: fb0, b1: fb1, ticket: null, concession: null, rails: [], pillars: [], podium: null };
  const desk = (a0, a1) => {
    if (a1 - a0 < 2.4) return null;
    const d = { a0, a1, b0: fb0, b1: fb0 + C.backbar.d + 0.65 + C.counter.d };
    solid(a0, d.b0, a1, d.b1, C.counter.h); solid(a0, d.b0, a1, d.b0 + C.backbar.d, C.backbar.h);
    return d;
  };
  if (fb1 - fb0 > 6) {
    foyer.ticket = desk(I + 0.6, ck[0] - 1.0);
    foyer.concession = desk(ck[1] + 1.0, W - I - 1.0);
    // 排队栏杆：售票台前面三道，和台子垂直，把人分成两列；离门洞那一段留出来
    if (foyer.ticket) {
      const t = foyer.ticket, rb0 = t.b1 + 0.5, rb1 = Math.min(t.b1 + 2.7, ...sideDoorsB.map((d) => d[0] - C.clear).filter((v) => v > rb0 + 1));
      if (rb1 > rb0 + 1) for (const a of [t.a0 + 1.0, t.a0 + 2.4, t.a0 + 3.8]) if (a < t.a1 - 0.4) { foyer.rails.push([a, rb0, rb1]); low(a, rb0, a, rb1, C.rail); }
    }
    // 检票台：检票口靠大堂那边一侧
    if (out.part != null) { foyer.podium = { a0: ck[1] + 0.1, a1: ck[1] + 0.7, b0: fb0 + 0.1, b1: fb0 + 0.9 }; solid(foyer.podium.a0, foyer.podium.b0, foyer.podium.a1, foyer.podium.b1, 1.05); }
    // 柱子：大堂后半，两边各一根（不挡门洞、不挡中间那条路）
    const pb = fb1 - 1.0, P = C.pillar / 2, nearDoor = (b) => sideDoorsB.some(([d0, d1]) => b > d0 - C.clear - P && b < d1 + C.clear + P);
    if (fb1 - fb0 > 9 && W >= 12 && !nearDoor(pb)) for (const a of [4.2, W - 4.2]) { foyer.pillars.push([a, pb]); solid(a - P, pb - P, a + P, pb + P, null); }
  }
  out.foyer = foyer;

  // ---------- 候场区 ----------
  const lb0 = fb1, lb1 = L - I;
  if (lb1 - lb0 > 6) {
    const lounge = { b0: lb0, b1: lb1, benches: [], posters: [], duty: null };
    // 中间那条路（远端门洞正对着的那一段）不摆长椅
    const path = farDoorsA.length ? [Math.min(...farDoorsA.map((d) => d[0])) - 1.0, Math.max(...farDoorsA.map((d) => d[1])) + 1.0] : [W / 2 - 2.2, W / 2 + 2.2];
    // 服务台（值班台）：贴一面实墙（那一段没有门脸），先试 a1 那面，候场区中段
    const db = lb0 + Math.min(10.1, (lb1 - lb0) * 0.66), sideFronts = (u.fronts || []).filter((f) => f.side !== farSide && f.side !== hallSide);
    const glassAt = (aSide) => sideFronts.some((f) => {
      const onA1 = along === 'z' ? f.side === 'E' : f.side === 'S';
      if (onA1 !== (aSide === 'a1')) return false;
      const bs = [[f.x0, f.z0], [f.x1, f.z1]].map((pt) => (along === 'z' ? (flip ? r.z1 - pt[1] : pt[1] - r.z0) : (flip ? r.x1 - pt[0] : pt[0] - r.x0)));
      return Math.min(...bs) < db + 1.05 && Math.max(...bs) > db - 1.05;
    });
    const dutySide = !glassAt('a1') ? 'a1' : !glassAt('a0') ? 'a0' : null;
    if (dutySide && db + 1 < lb1 - 0.5) {
      const [d0, d1] = dutySide === 'a1' ? [W - I - 1.6, W - I - 0.1] : [I + 0.1, I + 1.6];
      lounge.duty = { a0: d0, a1: d1, b0: db - 1.0, b1: db + 1.0, side: dutySide }; solid(d0, db - 1.0, d1, db + 1.0, 1.05);
      out.spots.duty = K.at(dutySide === 'a1' ? W - I - 2.6 : I + 2.6, db);
    }
    // 长椅：背靠背一对一对，左右两块
    const zones = [[I + 1.6, path[0] - 0.4], [path[1] + 0.4, W - I - 1.6]];
    for (const [z0, z1] of zones) {
      if (z1 - z0 < C.bench.l) continue;
      const am = (z0 + z1) / 2;
      for (let b = lb0 + 2.5; b + 0.7 < lb1 - 1.2; b += 3.5) {
        if (lounge.duty && am - C.bench.l / 2 < lounge.duty.a1 + 2.2 && am + C.bench.l / 2 > lounge.duty.a0 - 2.2 && b + 0.7 > lounge.duty.b0 - 1.2 && b - 0.7 < lounge.duty.b1 + 1.2) continue;
        if (sideDoorsB.some(([d0, d1]) => b + 0.7 > d0 - C.clear && b - 0.7 < d1 + C.clear) && (z0 < I + 2 || z1 > W - I - 2)) continue;
        for (const s of [-1, 1]) lounge.benches.push({ a0: am - C.bench.l / 2, a1: am + C.bench.l / 2, b0: s < 0 ? b - C.bench.d - 0.03 : b + 0.03, b1: s < 0 ? b - 0.03 : b + C.bench.d + 0.03, face: s });
        solid(am - C.bench.l / 2, b - C.bench.d - 0.03, am + C.bench.l / 2, b + C.bench.d + 0.03, C.bench.h);
      }
    }
    const posterSide = lounge.duty?.side === 'a0' ? 'a1' : 'a0';
    if (!glassAt(posterSide)) for (let b = lb0 + 1.6; b < lb1 - 1; b += 2.6) lounge.posters.push({ side: posterSide, b });
    out.lounge = lounge;
  }
  // 开局站的地方：离服务台近的那个厅，银幕前的平地上、靠检票口那道门
  const dutyA = out.lounge?.duty ? (out.lounge.duty.a0 + out.lounge.duty.a1) / 2 : 0;
  const h0 = [...out.halls].sort((p, q) => Math.abs((p.a0 + p.a1) / 2 - dutyA) - Math.abs((q.a0 + q.a1) / 2 - dutyA))[0];
  if (h0) { const d = h0.doors.find((q) => !q.exit) || h0.doors[0], a = d.a0 < (h0.a0 + h0.a1) / 2 ? d.a1 + 0.8 : d.a0 - 0.8; out.spots.spawn = K.at(a, h0.b1 - 1.2); out.spots.hall = h0.n; }
  return out;
}
