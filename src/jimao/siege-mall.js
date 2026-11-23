// 丧尸围城的商场段：开局被锁在三层的一家店里，一步步摸到一层的保安室。
//   三层：在店里找到卷帘的手摇柄 → 摇开卷帘出去 → 到自行车店找撬棍 → 撬开下二层的扶梯口；
//   二层：保安的手枪 → 物业的值班表（上面写着门禁卡在几号储物柜）→ 三个储物柜里开对的那个（开错的蹦出一只丧尸）
//        → 启动发电机给卷帘供电，它轰隆隆地响，守住一阵 → 按开下一层的卷帘；
//   一层：保安室的武器柜（要门禁卡才开）。之后合闸、进住宅楼，和原来一样。
// 这里只管「哪一步在哪儿、叫什么」，是纯函数（测试直接用真地图跑）；怎么演在 siege.js。
import { landAt, clear } from '../layout/nav.js';
import { toW } from '../layout/geom.js';

/**
 * shop：各步在哪家店（按店名找；找不到 / 站不住就退到同层别的店，见 pick）；
 * stairs：从三层下二层、二层下一层各走哪一部扶梯（坡道 id 的前缀）；
 * zone：二、三层只开放离任务地点这么多米以内的一片；lockers：三个储物柜排开的间距；
 * gen：发电机要守多少秒、期间隔几秒来几只；out：摇开卷帘时门外等着几只。
 */
export const MALL = Object.freeze({
  floors: Object.freeze({ top: 'P1-3F', mid: 'P1-2F', ground: 'P1-1F' }),
  shop: Object.freeze({ start: '意食', crowbar: '骑行家', pistol: '冲浪者', note: '风格志', card: '小确幸饰品', gen: '盲盒星球' }),
  stairs: Object.freeze({ down3: 'P1-K6', down2: 'P1-K3' }),
  zone: 46, lockers: 1.25,
  gen: Object.freeze({ seconds: 25, every: 4.5, each: 2 }), out: 3,
  // 救人：被困的店离撬棍那家、扶梯口都至少 near 米；护送时隔 every 秒从看不见的地方来 each 只，小许走到扶梯口 arrive 米内算到
  rescue: Object.freeze({ near: 8, every: 7, each: 2, arrive: 4.5 }),
  // 潜行：一路站着 count 只发呆的行尸（离路线 band 米以内、彼此隔开 gap 米）；响动到 wake 全醒，人走到它跟前 close 米（蹲着 closeCrouch 米）这一只和旁边 group 米内的醒
  sneak: Object.freeze({ count: 14, band: 6, gap: 2.4, wake: 60, close: 2.4, closeCrouch: 1.3, group: 5, run: 22, walk: 7, arrive: 2.6 }),
  // 搬油桶：抬着跑多快、离发电机最好多远（取 lo–hi 米之间最接近 best 的那家）、隔几秒来几只
  fuel: Object.freeze({ speed: 0.62, lo: 16, hi: 40, best: 26, every: 6, each: 2, pick: 1.3 }),
});

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
 * 商场段的每一步。返回 { stages, start, shop（开局那家店：{ id, name, poly, fronts }）, lockers（三个柜子：[{ x, y, z, n, right }]）, down3, down2（两处扶梯口的坡道 id） }。
 * stages 的每一项和 siege.js 的一样：{ id, kind, obj（'item' 捡 / 'relay' 操作）, floor, site, label, verb, text, hud, noise }。
 */
export function mallStages(layout, nav, rng = Math.random, M = MALL) {
  const F = M.floors, yOf = (f) => nav.floors.get(f)?.y ?? 0;
  const st = (id, kind, obj, site, label, verb, text, hud, noise = 0) => ({ id, kind, obj, floor: site.floor, site: { floor: site.floor, x: site.x, y: site.y, z: site.z, ...(site.unit ? { unit: site.unit } : {}) }, label, verb, text, hud, noise });
  // 开局那家店：人站在正中，手摇柄在店的里侧，卷帘的摇把在门边（店面那条边往里 1 米）
  const home = pick(layout, nav, F.top, M.shop.start), u = home.u, lv3 = layout.levels.find((l) => l.id === F.top);
  const crank = [[0.22, 0.75], [0.78, 0.75], [0.25, 0.3], [0.75, 0.3], [0.5, 0.8]].map(([a, b]) => spotIn(nav, lv3, u, a, b)).filter((q) => q && Math.hypot(q.x - home.x, q.z - home.z) > 2)[0] || home;
  const fronts = u.wfronts || [];
  let door = null;
  for (const f of fronts) { const mx = (f.x0 + f.x1) / 2 - f.nx * 1.1, mz = (f.z0 + f.z1) / 2 - f.nz * 1.1, q = landAt(nav, mx, mz, lv3.elev + 0.6); if (q && q.floor === F.top && clear(nav, q)) { door = { floor: F.top, x: mx, y: lv3.elev, z: mz, nx: f.nx, nz: f.nz }; break; } }
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
  /** 同一层、还没用过的店里，门外那一点离 at 的距离最接近 best（在 lo–hi 之间；都不在就取最接近的）、离 avoid 里每一点都至少 near 米 */
  const near = (floor, at, { best, lo = 0, hi = Infinity, avoid = [], minAway = 0 }) => {
    const lv = layout.levels.find((l) => l.id === floor); let pickQ = null, score = Infinity;
    for (const u of lv.units) {
      if (u.residence || used.has(u.id)) continue;
      const q = frontOf(lv, u); if (!q) continue;
      const d = Math.hypot(q.out.x - at.x, q.out.z - at.z);
      if (avoid.some((a) => Math.hypot(q.out.x - a.x, q.out.z - a.z) < minAway)) continue;
      const sc = Math.abs(d - best) + (d < lo || d > hi ? 1000 : 0);
      if (sc < score) { score = sc; pickQ = q; }
    }
    if (pickQ) used.add(pickQ.u.id);
    return pickQ;
  };
  const bike = take(F.top, M.shop.crowbar), gun = take(F.mid, M.shop.pistol), note = take(F.mid, M.shop.note), gen = take(F.mid, M.shop.gen);
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
  const trap = near(F.top, mid3, { best: 0, avoid: [bike, d3, home], minAway: M.rescue.near });
  // 二层：下了扶梯（坡道低的那一头）到手枪那家店门口，中间一路是发呆的尸群
  const s3 = nav.slopes.find((q) => q.id === d3.id), [lx, lz] = s3 ? toW(s3.F, -1.6, 0) : [d3.x, d3.z];
  const gunFront = (() => { const lv = layout.levels.find((l) => l.id === F.mid), u = lv.units.find((x) => x.id === gun.unit); return u ? frontOf(lv, u) : null; })();
  const sneakTo = gunFront?.out || gun;
  // 二层：油桶在离发电机二三十米的一家店里（得抬着跑一段）
  const can = near(F.mid, gen, { best: M.fuel.best, lo: M.fuel.lo, hi: M.fuel.hi, avoid: [gun, note, gen], minAway: 6 });
  const stages = [
    st('crank', 'crank', 'item', crank, `手摇柄 · ${home.name}`, '拿手摇柄', `你们被锁在三层的「${home.name}」里，卷帘落着。先在店里把卷帘的手摇柄找出来`, '在店里找卷帘的手摇柄'),
    st('exit', 'shutter', 'relay', door, `卷帘 · ${home.name}`, '摇开卷帘', '到门边把卷帘摇起来——外面有东西在拍门，手里只有刀', '到门边摇开卷帘', 12),
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
    rescue: trap ? { name: trap.name, inside: trap.inside, front: trap.front, unit: trap.u.id } : null,
    sneak: { from: { floor: F.mid, x: lx, y: yOf(F.mid), z: lz }, to: sneakTo },
    fuel: can ? { name: can.name, at: can.inside, unit: can.u.id } : null, shops };
}

/** 二、三层的开放范围：离这层任何一个任务地点 zone 米以内。纯函数 */
export function inMallZone(stages, floor, x, z, M = MALL) {
  return stages.some((s) => s.floor === floor && Math.hypot(s.site.x - x, s.site.z - z) < M.zone);
}
