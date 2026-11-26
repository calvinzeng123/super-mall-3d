// 丧尸围城的商场段：开局被锁在三层的一家店里，一步步摸到一层的保安室。
//   三层：在店里找到卷帘的手摇柄 → 摇开卷帘出去 → 到自行车店找撬棍 → 撬开下二层的扶梯口；
//   二层：保安的手枪 → 物业的值班表（上面写着门禁卡在几号储物柜）→ 三个储物柜里开对的那个（开错的蹦出一只丧尸）
//        → 启动发电机给卷帘供电，它轰隆隆地响，守住一阵 → 按开下一层的卷帘；
//   一层：保安室的武器柜（要门禁卡才开）。之后合闸、进住宅楼，和原来一样。
// 开局手里只有刀：店门外墙上挂着一个消火栓箱，里面有把消防斧（axe：箱子挂在哪、站哪儿捡）。
// 这里只管「哪一步在哪儿、叫什么」，是纯函数（测试直接用真地图跑）；怎么演在 siege.js。
import { landAt, clear } from '../layout/nav.js';
import { toW } from '../layout/geom.js';
import { storeStyle, doorGaps } from '../layout/frontage.js';

/**
 * shop：各步在哪家店（按店名找；找不到 / 站不住就退到同层别的店，见 pick）；
 * stairs：从三层下二层、二层下一层各走哪一部扶梯（坡道 id 的前缀）；
 * zone：二、三层只开放离任务地点这么多米以内的一片；lockers：三个储物柜排开的间距；
 * gen：发电机要守多少秒、期间隔几秒来几只；out：摇开卷帘时门外等着几只。
 */
export const MALL = Object.freeze({
  floors: Object.freeze({ top: 'P1-3F', mid: 'P1-2F', ground: 'P1-1F' }),
  // 三层：撬棍在西头的影城（出门往西走一趟），被困的人在南边那排的绘本馆（再往东走回来），护送到东边的扶梯口——每一步都是一小段路，不挤在开局那家店门口
  shop: Object.freeze({ start: '意食', crowbar: '云澜影城', rescue: '绘本馆', pistol: '冲浪者', note: '风格志', card: '小确幸饰品', gen: '盲盒星球' }),
  stairs: Object.freeze({ down3: 'P1-K6', down2: 'P1-K3' }),
  // 相邻两步之间至少走多远（米，按寻路的路程；测试用它验）。same 里的那几步本来就在上一步跟前：出店门（摇柄在店里）、撬扶梯口（护送到了就撬）、捡手枪（摸到门口就进店）
  spread: Object.freeze({ min: 25, same: Object.freeze(['exit', 'pry', 'pistol']) }),
  lobby: 3,
  zone: 46, lockers: 1.25,
  // 卷帘拉下的店：人走到离卷帘 leash 米就停（再往前镜头就站进卷帘那一层里、看不见它，像一堵空气墙）；寻路（路线指引、队友、丧尸）离它 path 米以外绕过去
  pad: Object.freeze({ leash: 0.35, path: 0.5, hose: 0.3 }),
  gen: Object.freeze({ seconds: 25, every: 4.5, each: 2 }), out: 3,
  // 救人：被困的店离撬棍那家、扶梯口都至少 near 米；护送时隔 every 秒从看不见的地方来 each 只，追人的最多 mob 只先扑小许，小许走到扶梯口 arrive 米内算到；
  // 卷帘撬开以后小许先走到门洞外 out 米、往旁边挪 side 米的地方（不挡在撬门的人跟前）；
  // soft：你手里还没枪（只有刀 / 斧子）时小许挨一口只掉这么多成（一口多少、同时几只咬得到见 squad.js 的 SQUAD.guest）
  rescue: Object.freeze({ near: 8, every: 7, each: 2, mob: 2, arrive: 4.5, out: 1.0, side: 1.4, soft: 0.6 }),
  // 消防斧：开局那家店门口的消火栓箱（宽 w 米），站到箱子正前方 out 米捡。先找门对面：出门 lo–hi 米是中庭栏杆（地面到头），
  // 箱子连着石材壁柱背靠栏杆（离地面边 edge 米）、正面朝着门（卷帘一起来，从门里就看得见），顺着门脸往 side 里那几个距离挪开一点（不挡出门的路），
  // 站到箱子正前方 across 米捡（壁柱 + 箱子厚 depth 米，人离它 siege.js 的 MALL.pad.leash 米就停）；门对面没有栏杆就退回门洞旁边的实墙上（离门洞 gap 米）
  axe: Object.freeze({ w: 0.9, gap: 0.15, out: 0.55, lo: 2.4, hi: 6, edge: 0.06, across: 0.75, depth: 0.29, wide: 1.02, side: Object.freeze([1.6, 2.2, 1.0, 2.8]) }),
  // 潜行：一路站着 count 只发呆的行尸（离路线 band 米以内、彼此隔开 gap 米）；响动到 wake 全醒，人走到它跟前 close 米（蹲着 closeCrouch 米）这一只和旁边 group 米内的醒
  sneak: Object.freeze({ count: 14, band: 6, gap: 2.4, wake: 60, close: 2.4, closeCrouch: 1.3, group: 5, run: 22, walk: 7, arrive: 2.6 }),
  // 搬油桶：抬着跑多快、离发电机最好多远（取 lo–hi 米之间最接近 best 的那家）、隔几秒来几只
  fuel: Object.freeze({ speed: 0.62, lo: 16, hi: 40, best: 26, every: 6, each: 2, pick: 1.3 }),
});

/** 门面 f（世界坐标）上能走过去的门洞 [[a, b], ...]（从 f 的起点量，米）：和导航网格在门面上开的洞一样（nav.js） */
function gapsOf(lv, u, f) {
  const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0), e = u.residence?.entryDoor;
  return { len, gaps: e ? [[e.at - e.width / 2, e.at + e.width / 2]] : doorGaps(storeStyle(lv, u), len) };
}
/**
 * 店门外挂消火栓箱的那一点：门面上紧挨着门洞的一段实墙（够 w 宽）。toward：先试离它近的一边（出了门顺路）。
 * 返回 { floor, x, y, z（箱子正前方、捡斧子站的地方）, wall: { x, z, yaw（箱子正面朝外：rotation.y） } }；都不行返回 null。
 */
export function cabinetSpot(nav, lv, u, f, toward = null, A = MALL.axe) {
  if (!f) return null;
  const { len, gaps } = gapsOf(lv, u, f), tx = (f.x1 - f.x0) / len, tz = (f.z1 - f.z0) / len, spots = [];
  let at = 0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) { if (a - at >= A.w + A.gap) { if (at > 0.01) spots.push(at + A.gap + A.w / 2); spots.push(a - A.gap - A.w / 2); } at = Math.max(at, b); }
  if (len - at >= A.w + A.gap && at > 0.01) spots.push(at + A.gap + A.w / 2);
  const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2, side = toward ? Math.sign((toward.x - mx) * tx + (toward.z - mz) * tz) || 1 : 1;
  spots.sort((p, q) => side * (q - p));
  for (const c of spots) {
    const wx = f.x0 + tx * c, wz = f.z0 + tz * c, x = wx + f.nx * A.out, z = wz + f.nz * A.out, st = landAt(nav, x, z, lv.elev + 0.6);
    if (st && st.floor === lv.id && Math.abs(st.y - lv.elev) < 0.3 && clear(nav, st)) return { floor: lv.id, x: st.x, y: lv.elev, z: st.z, wall: { x: wx, z: wz, yaw: Math.atan2(f.nx, f.nz) } };
  }
  return null;
}
/**
 * 门对面的消火栓箱（见 MALL.axe）：门洞 gap（[a, b]，从门脸起点量）中间往外走到地面到头（中庭栏杆）的地方，箱子背靠那儿、正面朝门；
 * eye：门里头站着看的那一点（卷帘一开从这儿要看得见箱子）。返回和 cabinetSpot 一样的 { floor, x, y, z, wall: { x, z, yaw }, across: true }；没有合适的返回 null
 */
export function cabinetAcross(nav, lv, f, gap, eye, toward = null, A = MALL.axe) {
  const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0), tx = (f.x1 - f.x0) / len, tz = (f.z1 - f.z0) / len, c = (gap[0] + gap[1]) / 2, y = lv.elev + 0.6;
  const on = (x, z) => { const q = landAt(nav, x, z, y); return !!q && q.floor === lv.id && Math.abs(q.y - lv.elev) < 0.3; };
  // 从门脸上沿外法线往外走，地面到头的那一点（lo–hi 米之间才算）
  const edgeAt = (s) => { const bx = f.x0 + tx * (c + s), bz = f.z0 + tz * (c + s); let d = 0.5; while (d < A.hi + 0.5 && on(bx + f.nx * d, bz + f.nz * d)) d += 0.05; return d >= A.lo && d <= A.hi ? { bx, bz, d } : null; };
  const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2, side = toward ? Math.sign((toward.x - mx) * tx + (toward.z - mz) * tz) || 1 : 1;
  for (const k of A.side) for (const s of [side * k, -side * k]) {
    const e = edgeAt(s); if (!e) continue;
    const d = e.d - A.edge, wx = e.bx + f.nx * d, wz = e.bz + f.nz * d, st = landAt(nav, wx - f.nx * A.across, wz - f.nz * A.across, y);
    if (!st || st.floor !== lv.id || !clear(nav, st)) continue;
    // 壁柱两头都落在这一层的地面上（不悬在洞口外、不压到扶梯口）
    if (![-A.wide / 2, A.wide / 2].every((u) => on(wx + tx * u - f.nx * 0.05, wz + tz * u - f.nz * 0.05))) continue;
    // 隔着门洞看得见：从 eye 到箱子正面中间那一条线，穿过门脸的地方落在门洞里
    const fx = wx - f.nx * 0.3, fz = wz - f.nz * 0.3, de = (eye.x - f.x0) * f.nx + (eye.z - f.z0) * f.nz, df = (fx - f.x0) * f.nx + (fz - f.z0) * f.nz;
    if (!(de < 0 && df > 0)) continue;
    const t = de / (de - df), cx = eye.x + (fx - eye.x) * t, cz = eye.z + (fz - eye.z) * t, along = (cx - f.x0) * tx + (cz - f.z0) * tz;
    if (along < gap[0] + 0.25 || along > gap[1] - 0.25) continue;
    return { floor: lv.id, x: st.x, y: lv.elev, z: st.z, wall: { x: wx, z: wz, yaw: Math.atan2(-f.nx, -f.nz) }, across: true };
  }
  return null;
}
/**
 * 被困的店撬开以后小许往哪儿走：门洞中间往外 out 米、再顺着门面往旁边挪 side 米（两边都试）。
 * 撬门的人站在门面中点外面（q.out）对着门：这一点不能在他的视线上（偏开 30° 以上），也不能贴着他。返回 { floor, x, y, z } 或 null
 */
export function exitSpot(nav, lv, q, R = MALL.rescue) {
  const f = q.front, { len, gaps } = gapsOf(lv, q.u, f), tx = (f.x1 - f.x0) / len, tz = (f.z1 - f.z0) / len;
  for (const [a, b] of gaps) for (const s of [R.side, -R.side]) {
    const c = (a + b) / 2, x = f.x0 + tx * c + f.nx * R.out + tx * s, z = f.z0 + tz * c + f.nz * R.out + tz * s, st = landAt(nav, x, z, lv.elev + 0.6);
    const dx = x - q.out.x, dz = z - q.out.z, d = Math.hypot(dx, dz);
    if (d < 0.8 || -(dx * f.nx + dz * f.nz) / d > 0.85) continue;
    if (st && st.floor === lv.id && Math.abs(st.y - lv.elev) < 0.3 && clear(nav, st)) return { floor: lv.id, x: st.x, y: lv.elev, z: st.z };
  }
  return null;
}

const unitOf = (layout, floor, name) => layout.levels.find((l) => l.id === floor)?.units.find((u) => !u.residence && u.brand?.name === name) || null;
/** 店里站得住的一点：矩形里 (fx, fz) 比例的位置（0.5, 0.5 是正中） */
function spotIn(nav, lv, u, fx, fz) {
  const r = u.rects?.[0]; if (!r) return null;
  const [x, z] = toW(u.frame, r.x0 + (r.x1 - r.x0) * fx, r.z0 + (r.z1 - r.z0) * fz), st = landAt(nav, x, z, lv.elev + 0.6);
  return st && st.floor === lv.id && clear(nav, st) ? { floor: lv.id, x: st.x, y: lv.elev, z: st.z, unit: u.id, name: u.brand?.name || '商铺' } : null;
}
/** 找这家店里的一点（按 tries 里的比例挨个试）；这家不行就换同层别的店 */
function pick(layout, nav, floor, name, tries = [[0.5, 0.5]], skip = new Set()) {
  const lv = layout.levels.find((l) => l.id === floor); if (!lv) return null;
  const first = unitOf(layout, floor, name), list = [first, ...lv.units.filter((u) => !u.residence && u !== first && !skip.has(u.id))].filter(Boolean);
  for (const u of list) for (const [fx, fz] of tries) { const q = spotIn(nav, lv, u, fx, fz); if (q) return { ...q, u }; }
  return null;
}

/**
 * 商场段的每一步。返回 { stages, start, shop（开局那家店：{ id, name, poly, fronts }）, lockers（三个柜子：[{ x, y, z, n, right }]）, down3, down2（两处扶梯口的坡道 id），
 *   rescue（被困的店：{ name, inside, exit（撬开以后小许先走到的门外一点）, front, unit }）, axe（店门外的消火栓箱：见 cabinetSpot） }。
 * stages 的每一项和 siege.js 的一样：{ id, kind, obj（'item' 捡 / 'relay' 操作）, floor, site, label, verb, text, hud, noise }。
 */
export function mallStages(layout, nav, rng = Math.random, M = MALL) {
  const F = M.floors, yOf = (f) => nav.floors.get(f)?.y ?? 0;
  const st = (id, kind, obj, site, label, verb, text, hud, noise = 0) => ({ id, kind, obj, floor: site.floor, site: { floor: site.floor, x: site.x, y: site.y, z: site.z, ...(site.unit ? { unit: site.unit } : {}) }, label, verb, text, hud, noise });
  // 开局那家店：人站在正中，手摇柄在店的里侧，卷帘的摇把在门边（店面那条边往里 1 米）
  const home = pick(layout, nav, F.top, M.shop.start), u = home.u, lv3 = layout.levels.find((l) => l.id === F.top);
  const crank = [[0.22, 0.75], [0.78, 0.75], [0.25, 0.3], [0.75, 0.3], [0.5, 0.8]].map(([a, b]) => spotIn(nav, lv3, u, a, b)).filter((q) => q && Math.hypot(q.x - home.x, q.z - home.z) > 2)[0] || home;
  const fronts = u.wfronts || [];
  let door = null, doorF = fronts[0] || null;
  for (const f of fronts) { const mx = (f.x0 + f.x1) / 2 - f.nx * 1.1, mz = (f.z0 + f.z1) / 2 - f.nz * 1.1, q = landAt(nav, mx, mz, lv3.elev + 0.6); if (q && q.floor === F.top && clear(nav, q)) { door = { floor: F.top, x: mx, y: lv3.elev, z: mz, nx: f.nx, nz: f.nz }; doorF = f; break; } }
  door ||= { ...home, nx: fronts[0]?.nx || 0, nz: fronts[0]?.nz || 1 };
  const used = new Set([u.id]);
  const take = (floor, name, tries) => { const q = pick(layout, nav, floor, name, tries, used); if (q) used.add(q.unit); return q; };
  /** 店门外一点（门脸中点往外 out 米）和店里一点（往里 inn 米）：都站得住才算 */
  const frontOf = (lv, u, out = 1.4, inn = 2) => {
    for (const f of u.wfronts || []) {
      const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2, o = landAt(nav, mx + f.nx * out, mz + f.nz * out, lv.elev + 0.6), i = landAt(nav, mx - f.nx * inn, mz - f.nz * inn, lv.elev + 0.6);
      if (o && i && o.floor === lv.id && i.floor === lv.id && clear(nav, o) && clear(nav, i)) return { out: { floor: lv.id, x: o.x, y: lv.elev, z: o.z, unit: u.id }, inside: { floor: lv.id, x: i.x, y: lv.elev, z: i.z }, front: f, name: u.brand?.name || '商铺', u };
    }
    return null;
  };
  /** 同一层、还没用过的店里，门外那一点离 at 的距离最接近 best（在 lo–hi 之间；都不在就取最接近的）、离 avoid 里每一点都至少 minAway 米、离 far 里每一点（[点, 米]）至少那么远 */
  const near = (floor, at, { best, lo = 0, hi = Infinity, avoid = [], minAway = 0, far = [] }) => {
    const lv = layout.levels.find((l) => l.id === floor); let pickQ = null, score = Infinity;
    for (const u of lv.units) {
      if (u.residence || used.has(u.id)) continue;
      const q = frontOf(lv, u); if (!q) continue;
      const d = Math.hypot(q.out.x - at.x, q.out.z - at.z);
      if (avoid.some((a) => Math.hypot(q.out.x - a.x, q.out.z - a.z) < minAway) || far.some(([a, m]) => Math.hypot(q.out.x - a.x, q.out.z - a.z) < m)) continue;
      const sc = Math.abs(d - best) + (d < lo || d > hi ? 1000 : 0);
      if (sc < score) { score = sc; pickQ = q; }
    }
    if (pickQ) used.add(pickQ.u.id);
    return pickQ;
  };
  // 撬棍：大店（影城）正中离门十来米，放在离你最近的那道门进去 lobby 米的大堂里；找不到就按老办法放店里正中
  const lobbyOf = (floor, name, inn, from) => {
    const lv = layout.levels.find((l) => l.id === floor), u0 = unitOf(layout, floor, name); if (!u0 || used.has(u0.id)) return null;
    let best = null;
    for (const f of u0.wfronts || []) { const { len, gaps } = gapsOf(lv, u0, f), tx = (f.x1 - f.x0) / len, tz = (f.z1 - f.z0) / len;
      for (const [a, b] of gaps) { const c = (a + b) / 2, q = landAt(nav, f.x0 + tx * c - f.nx * inn, f.z0 + tz * c - f.nz * inn, lv.elev + 0.6);
        if (!q || q.floor !== floor || !clear(nav, q)) continue; const d = Math.hypot(q.x - from.x, q.z - from.z); if (!best || d < best.d) best = { d, q }; } }
    if (!best) return null; used.add(u0.id); return { floor, x: best.q.x, y: lv.elev, z: best.q.z, unit: u0.id, name: u0.brand?.name || '商铺', u: u0 };
  };
  const bike = lobbyOf(F.top, M.shop.crowbar, M.lobby, door) || take(F.top, M.shop.crowbar), gun = take(F.mid, M.shop.pistol), note = take(F.mid, M.shop.note), gen = take(F.mid, M.shop.gen);
  const axe = (door && doorF && (() => { const { len, gaps } = gapsOf(lv3, u, doorF), g = gaps.find(([a, b]) => { const c = (a + b) / 2, x = doorF.x0 + (doorF.x1 - doorF.x0) / len * c, z = doorF.z0 + (doorF.z1 - doorF.z0) / len * c; return Math.hypot(x - door.x, z - door.z) < (b - a) / 2 + 1.5; }); return g ? cabinetAcross(nav, lv3, doorF, g, door, bike, M.axe) : null; })()) || cabinetSpot(nav, lv3, u, doorF, bike, M.axe);
  // 三个储物柜：在那家店里沿长边排开，抽一个是对的
  const cardShop = take(F.mid, M.shop.card), cu = cardShop.u, r = cu.rects[0], lv2 = layout.levels.find((l) => l.id === F.mid);
  const alongX = (r.x1 - r.x0) >= (r.z1 - r.z0), right = Math.floor(rng() * 3), lockers = [];
  for (let i = 0; i < 3; i++) {
    const cx = (r.x0 + r.x1) / 2 + (alongX ? (i - 1) * M.lockers : 0), cz = (r.z0 + r.z1) / 2 + (alongX ? 0 : (i - 1) * M.lockers), [x, z] = toW(cu.frame, cx, cz);
    lockers.push({ x, y: lv2.elev, z, n: i + 1, right: i === right });
  }
  const win = lockers[right];
  // 扶梯口：坡道高的那一头（人从上面往下走）
  const top = (prefix, lo, hi) => { const s = nav.slopes.find((q) => q.id.startsWith(prefix) && q.low === lo && q.high === hi); if (!s) return null; const [x, z] = toW(s.F, s.len + 1.6, 0); return { floor: hi, x, y: yOf(hi), z, id: s.id }; };
  const d3 = top(M.stairs.down3, F.mid, F.top), d2 = top(M.stairs.down2, F.ground, F.mid);
  // 三层：被困的店员在撬棍那家和扶梯口之间的一家店里
  const mid3 = { x: (bike.x + d3.x) / 2, z: (bike.z + d3.z) / 2 };
  /** 指名的那家店（门外、店里各一点；用过了或站不住返回 null） */
  const named = (floor, name) => { const lv = layout.levels.find((l) => l.id === floor), q0 = name && unitOf(layout, floor, name); if (!q0 || used.has(q0.id)) return null; const q = frontOf(lv, q0); if (q) used.add(q0.id); return q; };
  const trap = named(F.top, M.shop.rescue) || near(F.top, mid3, { best: 0, avoid: [bike, d3, home], minAway: M.rescue.near });
  // 二层：下了扶梯（坡道低的那一头）到手枪那家店门口，中间一路是发呆的尸群
  const s3 = nav.slopes.find((q) => q.id === d3.id), [lx, lz] = s3 ? toW(s3.F, -1.6, 0) : [d3.x, d3.z];
  const gunFront = (() => { const lv = layout.levels.find((l) => l.id === F.mid), u = lv.units.find((x) => x.id === gun.unit); return u ? frontOf(lv, u) : null; })();
  const sneakTo = gunFront?.out || gun;
  // 二层：油桶在离发电机二三十米的一家店里（得抬着跑一段）
  // 油桶那家离储物柜也要隔开一段（以前挑中的就在储物柜隔壁，拿完卡转身就到）
  const can = near(F.mid, gen, { best: M.fuel.best, lo: M.fuel.lo, hi: M.fuel.hi, avoid: [gun, note, gen], minAway: 6, far: [[win, M.spread.min]] });
  const stages = [
    st('crank', 'crank', 'item', crank, `手摇柄 · ${home.name}`, '拿手摇柄', `你们被锁在三层的「${home.name}」里，卷帘落着。先在店里把卷帘的手摇柄找出来`, '在店里找卷帘的手摇柄'),
    st('exit', 'shutter', 'relay', door, `卷帘 · ${home.name}`, '摇开卷帘', '到门边把卷帘摇起来——外面有东西在拍门，手里只有刀和两颗手雷', '到门边摇开卷帘', 12),
    st('crowbar', 'crowbar', 'item', bike, `撬棍 · 三层 ${bike.name}`, '拿撬棍', `下二层的扶梯口被防火卷帘挡着。去「${bike.name}」找根撬棍`, `到「${bike.name}」找撬棍`),
    ...(trap ? [
      st('rescue', 'rescue', 'relay', trap.out, `求救 · 三层 ${trap.name}`, '撬开卷帘', `「${trap.name}」的卷帘后面有人在拍门喊救命。用撬棍把卷帘撬开`, `撬开「${trap.name}」的卷帘救人`, 15),
      st('escort', 'escort', 'relay', d3, '护送 · 三层扶梯口', '到了', '店员小许跟着你。把他带到扶梯口——丧尸会先扑他，护住他；他倒了就过去扶', '护送小许到扶梯口'),
    ] : []),
    st('pry', 'pry', 'relay', d3, '防火卷帘 · 三层扶梯口', '撬开卷帘', trap ? '到扶梯口了。小许帮你扶着，把防火卷帘撬开' : '带着撬棍回扶梯口，把防火卷帘撬开', '撬开扶梯口的防火卷帘', 25),
    st('sneak', 'sneak', 'relay', sneakTo, `穿过尸群 · 二层 ${gun.name}门口`, '过去', `二层中庭里站着一大片发呆的丧尸。蹲下（C）慢慢摸到「${gun.name}」门口——别跑、别开枪，响动满了它们全醒`, `蹲着摸过尸群，到「${gun.name}」门口`),
    st('pistol', 'pistol', 'item', gun, `手枪 · 二层 ${gun.name}`, '捡起手枪', `「${gun.name}」里倒着个保安，他的手枪还在`, `到「${gun.name}」捡保安的手枪`),
    st('note', 'note', 'item', note, `值班表 · 二层 ${note.name}`, '看值班表', `保安室的武器柜要门禁卡。物业的值班表在「${note.name}」的收银台上，看看卡收在哪`, `到「${note.name}」找值班表`),
    st('card', 'card', 'item', { floor: F.mid, x: win.x, y: win.y, z: win.z, unit: cu.id }, `门禁卡 · 二层 ${cardShop.name}`, '拿门禁卡', `值班表上写着：门禁卡在「${cardShop.name}」的 ${win.n} 号储物柜。三个柜子只有一个是对的，开错了里面可不是卡`, `「${cardShop.name}」${win.n} 号储物柜`),
    ...(can ? [st('fuel', 'fuel', 'item', can.inside, `油桶 · 二层 ${can.name}`, '抬起油桶', `下一层的卷帘是电动的，备用发电机在「${gen.name}」，可是没油。先去「${can.name}」抬一桶油——抬着不能开枪、跑不快，按 V 放下`, `到「${can.name}」抬油桶`)] : []),
    st('gen', 'gen', 'relay', gen, `发电机 · 二层 ${gen.name}`, '加油、启动', can ? `把油桶抬到「${gen.name}」，加满油、把发电机打着` : `下一层的卷帘是电动的，没电。去「${gen.name}」后面把备用发电机打着`, can ? `抬着油桶到「${gen.name}」` : `到「${gen.name}」启动发电机`, 30),
    st('open', 'open', 'relay', d2, '卷帘开关 · 二层扶梯口', '按开卷帘', '发电机带起来了，回扶梯口按开卷帘，下一层', '回扶梯口按开卷帘', 10),
  ];
  const shops = [...used]; // 这一局用到的店（别的店卷帘都拉下来）
  return { stages, start: { floor: F.top, x: home.x, y: home.y, z: home.z }, shop: { id: u.id, name: home.name, poly: u.polys?.[0] || null, fronts }, lockers, cardShop: cardShop.name, down3: d3?.id || null, down2: d2?.id || null,
    rescue: trap ? { name: trap.name, inside: trap.inside, exit: exitSpot(nav, lv3, trap, M.rescue), front: trap.front, unit: trap.u.id } : null, axe,
    sneak: { from: { floor: F.mid, x: lx, y: yOf(F.mid), z: lz }, to: sneakTo },
    fuel: can ? { name: can.name, at: can.inside, unit: can.u.id } : null, shops };
}

/** 二、三层的开放范围：离这层任何一个任务地点 zone 米以内。纯函数 */
export function inMallZone(stages, floor, x, z, M = MALL) {
  return stages.some((s) => s.floor === floor && Math.hypot(s.site.x - x, s.site.z - z) < M.zone);
}
