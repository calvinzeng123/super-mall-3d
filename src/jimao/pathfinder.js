// 零点突围：分帧寻路。
// 以前敌人和路线指引直接调 fps/pathfinding.js 的 findPath：一次同步算完，冷的时候一条路要 100–1300 毫秒
// （楼面格子的「能不能走」「两格之间能不能过」都要用玩家的碰撞一步步试，试完才缓存），
// 敌人每 3 秒左右集体重算一次，画面就隔几步卡一下。
// 现在改成请求—回调：request() 排队，update(budgetMs) 每帧只算几毫秒，算完回调；没算完下一帧接着算。
// 算法和原来一样（同层 0.8 米格子 A*，边用 traceMotion 验证；跨层先在楼梯、扶梯、门洞这些连接上找一串，再逐段同层找），
// 只是：① 写成生成器，随时能停；② 格子缓存用整数键（原来是字符串键）；③ 拉直路线时少试几次；
// ④ 可选把电梯也当成连接（lifts: true，给玩家的路线指引用——敌人不会坐电梯）。
import { clear } from '../layout/nav.js';
import { traceMotion, connectorsFor } from '../fps/pathfinding.js';

export const PATH = Object.freeze({ cell: 0.8, maxNodes: 12000, budget: 3, direct: 25, liftFixed: 6, liftPerFloor: 2.2 });

const OFF = 4096, SPAN = 8192;
const keyOf = (i, j) => (i + OFF) * SPAN + (j + OFF);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const STEP = DIRS.map(([a, b]) => Math.hypot(a, b));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

class Heap {
  constructor() { this.a = []; }
  get length() { return this.a.length; }
  push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].f <= v.f) break; a[i] = a[p]; i = p; } a[i] = v; }
  pop() {
    const a = this.a, first = a[0], end = a.pop();
    if (a.length) { let i = 0; for (;;) { let j = i * 2 + 1; if (j >= a.length) break; if (j + 1 < a.length && a[j + 1].f < a[j].f) j++; if (a[j].f >= end.f) break; a[i] = a[j]; i = j; } a[i] = end; }
    return first;
  }
}

export function createPathfinder(nav, { cell = PATH.cell, maxNodes = PATH.maxNodes, now = () => performance.now() } = {}) {
  const grids = new Map();
  // 绕开的地方（setAvoid：丧尸围城里卷帘拉下的店）：avoid(floor, x, z) 为真的格子不走，直线、拉直的那几段也不从里面穿；
  // core 是不留余量的那一圈（店里面）：起点或终点自己就在里面的那一段照旧（不然出不来），起点、终点接到格子上的那一小段只要不穿进去就行。
  // 格子的结果按层缓存，setAvoid 时清掉
  let avoid = null, core = null; const shun = new Map();
  const shunned = (floor, i, j) => { let c = shun.get(floor); if (!c) shun.set(floor, c = new Map()); const k = keyOf(i, j); let v = c.get(k); if (v === undefined) { v = avoid(floor, i * cell, j * cell) ? 1 : 0; c.set(k, v); } return v === 1; };
  const crosses = (a, b, fn) => { const L = dist(a, b), n = Math.ceil(L / 0.3); for (let k = 0; k <= n; k++) { const t = n ? k / n : 0; if (fn(a.floor, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return true; } return false; };
  const stats = { requests: 0, done: 0, failed: 0, cancelled: 0, slices: 0, worst: 0, cells: 0, edges: 0 };
  const floorY = (id) => nav.floors.get(id)?.y ?? 0;
  const asState = (s) => ({ ...s, y: s.y ?? floorY(s.floor), slope: s.slope || null });
  const gridOf = (floor) => { let g = grids.get(floor); if (!g) grids.set(floor, g = { open: new Map(), edge: new Map(), y: floorY(floor) }); return g; };

  function ops(floor) {
    const g = gridOf(floor), y = g.y;
    const point = (i, j) => ({ floor, x: i * cell, z: j * cell, y, slope: null });
    const isOpen = (i, j) => {
      const k = keyOf(i, j); let v = g.open.get(k);
      if (v === undefined) { v = clear(nav, point(i, j)) ? 1 : 0; g.open.set(k, v); stats.cells++; }
      return v === 1;
    };
    /** 从 (i, j) 朝第 d 个方向走一格过不过得去（低 8 位：算过了；高 8 位：过得去） */
    const edge = (i, j, d) => {
      const k = keyOf(i, j); let e = g.edge.get(k) | 0;
      if (!(e & (1 << d))) {
        const ok = !!traceMotion(nav, point(i, j), point(i + DIRS[d][0], j + DIRS[d][1]));
        e |= (1 << d) | (ok ? 1 << (d + 8) : 0); g.edge.set(k, e); stats.edges++;
      }
      return (e & (1 << (d + 8))) !== 0;
    };
    return { point, isOpen, edge };
  }

  /** 同一层里从 a 到 b：生成器，每展开一个格子让出一次。返回 [a, …拐点, b] 或 null */
  function* local(a, b) {
    if (a.floor !== b.floor || !clear(nav, a) || !clear(nav, b)) return null;
    yield; // 跨层的路是一串很短的同层段（扶梯口到下一部扶梯口），每段开头都让一次，不然一帧里连着算完好几段
    const dodge = !!avoid && !core(a.floor, a.x, a.z) && !core(b.floor, b.x, b.z);
    const walk = (p, q) => traceMotion(nav, p, q) && !(dodge && crosses(p, q, avoid)), join = (p, q) => traceMotion(nav, p, q) && !(dodge && crosses(p, q, core));
    if (dist(a, b) < PATH.direct && walk(a, b)) return [asState(a), asState(b)];
    yield;
    const g0 = ops(a.floor), point = g0.point, edge = g0.edge, isOpen = dodge ? (i, j) => g0.isOpen(i, j) && !shunned(a.floor, i, j) : g0.isOpen;
    const starts = [], ends = new Map();
    for (const [isStart, s] of [[true, a], [false, b]]) {
      const cx = Math.round(s.x / cell), cz = Math.round(s.z / cell);
      for (let i = cx - 2; i <= cx + 2; i++) for (let j = cz - 2; j <= cz + 2; j++) {
        if (!isOpen(i, j)) continue;
        const p = point(i, j);
        yield; // 楼梯口、扶梯口附近试走一次要将近 1 毫秒，25 个点不能一口气试完
        if (!(isStart ? join(s, p) : join(p, s))) continue;
        if (isStart) starts.push({ i, j, cost: dist(s, p) }); else ends.set(keyOf(i, j), dist(s, p));
      }
      yield;
    }
    if (!starts.length || !ends.size) return null;
    const open = new Heap(), costs = new Map(), parents = new Map();
    for (const s of starts) { const k = keyOf(s.i, s.j); costs.set(k, s.cost); open.push({ i: s.i, j: s.j, k, g: s.cost, f: s.cost + Math.hypot(s.i * cell - b.x, s.j * cell - b.z) }); }
    let visited = 0, found = null;
    while (open.length && visited++ < maxNodes) {
      const cur = open.pop();
      if (cur.g > costs.get(cur.k) + 1e-6) continue;
      if (ends.has(cur.k)) { found = cur; break; }
      for (let d = 0; d < 8; d++) {
        const i = cur.i + DIRS[d][0], j = cur.j + DIRS[d][1], k = keyOf(i, j), g = cur.g + STEP[d] * cell;
        if (g >= (costs.get(k) ?? Infinity) || !isOpen(i, j) || !edge(cur.i, cur.j, d)) continue;
        costs.set(k, g); parents.set(k, cur.k);
        open.push({ i, j, k, g, f: g + Math.hypot(i * cell - b.x, j * cell - b.z) });
      }
      yield;
    }
    if (!found) return null;
    const raw = [asState(b)];
    for (let k = found.k; k !== undefined; k = parents.get(k)) raw.push(point(Math.floor(k / SPAN) - OFF, (k % SPAN) - OFF));
    raw.push(asState(a)); raw.reverse();
    // 只留拐点：从 i 往前最多看 18 格，试 18、12、8、5、3、2 格远的那个点能不能直接走到（原来是 18 往下逐个试）
    const out = [raw[0]];
    for (let i = 0; i < raw.length - 1;) {
      let j = i + 1;
      for (const n of [18, 12, 8, 5, 3, 2]) { const q = Math.min(raw.length - 1, i + n); if (q <= i + 1) break; yield; if (walk(raw[i], raw[q])) { j = q; break; } }
      out.push(raw[j]); i = j;
    }
    return out;
  }

  // ---- 跨层：楼梯、扶梯、门洞（connectorsFor，和 fps/pathfinding.js 共用一份），可选加电梯 ----
  let connectors = null, liftConnectors = null;
  // 给玩家排路线时（lifts: true）可以禁掉一些连接：丧尸围城里停电 / 被锁的电梯、被堵的楼梯（setBlocked）。敌人的寻路不受影响
  let blocked = null;
  function allConnectors(lifts) {
    connectors ||= connectorsFor(nav).map((c) => ({ ...c }));
    if (!lifts) return connectors;
    if (!liftConnectors) {
      liftConnectors = [];
      for (const link of nav.links || []) {
        if (link.kind !== 'lift' || !(link.stops?.length > 1)) continue;
        const stops = link.stops.map((s, n) => ({ n, s: asState({ floor: s.floor, x: s.x, z: s.z }) })).filter((q) => clear(nav, q.s));
        for (const p of stops) for (const q of stops) if (p !== q) {
          liftConnectors.push({ id: `${link.id}:${p.s.floor}>${q.s.floor}`, a: p.s, b: q.s, points: [p.s, { ...q.s, via: 'lift', lift: link.name || '电梯', from: p.s.floor, to: q.s.floor }], kind: 'lift', link: link.id, from: p.s.floor, to: q.s.floor,
            cost: PATH.liftFixed + Math.abs(p.n - q.n) * PATH.liftPerFloor });
        }
      }
    }
    return [...connectors, ...liftConnectors];
  }
  const byFloor = new Map();
  function floorsOf(lifts) {
    let f = byFloor.get(!!lifts);
    if (!f) {
      const all = allConnectors(lifts); f = { all, floors: new Map() };
      all.forEach((c, i) => { if (!f.floors.has(c.a.floor)) f.floors.set(c.a.floor, []); f.floors.get(c.a.floor).push(i); });
      byFloor.set(!!lifts, f);
    }
    return f;
  }
  /** 在连接（楼梯、扶梯、门洞、电梯）上找一串从 start 那层到 target 那层的走法。园区地图有四千多个连接，所以也分片 */
  function* connectorRoute(start, target, banned, lifts) {
    const { all, floors } = floorsOf(lifts);
    const heap = new Heap(), costs = new Map([[-1, 0]]), parents = new Map();
    heap.push({ id: -1, p: start, g: 0, f: dist(start, target) });
    let n = 0;
    while (heap.length) {
      const cur = heap.pop(); if (cur.g > costs.get(cur.id) + 1e-6) continue;
      if (cur.p.floor === target.floor && !banned.has(`${cur.id}>target`)) {
        const route = []; for (let id = cur.id; id !== -1; id = parents.get(id)) route.unshift({ c: all[id], index: id });
        return route;
      }
      const list = floors.get(cur.p.floor);
      if (list) for (let q = 0; q < list.length; q++) {
        const index = list[q];
        if (banned.size && banned.has(`${cur.id}>${index}`)) continue;
        if (lifts && blocked && blocked(all[index])) continue;
        const c = all[index], g = cur.g + dist(cur.p, c.a) + (c.cost ?? dist(c.a, c.b) + Math.abs(c.a.y - c.b.y) * 2);
        if (g >= (costs.get(index) ?? Infinity)) continue;
        costs.set(index, g); parents.set(index, cur.id);
        heap.push({ id: index, p: c.b, g, f: g + dist(c.b, target) + Math.abs(c.b.y - (target.y ?? 0)) * 2 });
      }
      if ((++n & 7) === 0) yield;
    }
    return null;
  }

  function* search(start, target, { lifts = false } = {}) {
    const a = asState(start), b = asState(target);
    if (!clear(nav, a) || !clear(nav, b)) return null;
    // 同一层：先在本层找；本层走不通（比如被中庭洞口隔开的两片）而且允许电梯时，再按跨层的办法找
    if (a.floor === b.floor) { const p = yield* local(a, b); if (p || !lifts) return p; }
    const banned = new Set();
    for (let attempt = 0; attempt < 8; attempt++) {
      const route = yield* connectorRoute(a, b, banned, lifts);
      if (!route) return null;
      if (!route.length) return null;
      let result = [a], current = a, previous = -1, failed = false;
      for (const { c, index } of route) {
        const part = yield* local(current, c.a);
        if (!part) { banned.add(`${previous}>${index}`); failed = true; break; }
        result.push(...part.slice(1), ...c.points.slice(1)); current = c.b; previous = index;
      }
      if (failed) continue;
      const last = yield* local(current, b);
      if (last) return [...result, ...last.slice(1)];
      banned.add(`${previous}>target`);
    }
    return null;
  }

  const queue = [];
  const api = {
    stats, cell,
    get pending() { return queue.length; },
    /** fn(connector) 返回 true 的连接，给玩家排路线时不走（connector: { id, kind, link?, from?, to? }）；传 null 取消 */
    setBlocked(fn) { blocked = typeof fn === 'function' ? fn : null; },
    /** fn(floor, x, z) 返回 true 的地方寻路绕开（谁的路都绕：人、队友、丧尸），inner 是不带余量的里圈（默认同 fn）；传 null 取消。范围变了（比如一家店的卷帘撬开了）再调一次：缓存清掉重算 */
    setAvoid(fn, inner = null) { avoid = typeof fn === 'function' ? fn : null; core = typeof inner === 'function' ? inner : avoid; shun.clear(); },
    /** 排一条路：算完调 cb(path | null)。opts.lifts 把电梯算进去；opts.urgent 插到队首（正在算的那条之后）。返回 { cancel() } */
    request(from, to, cb, opts = {}) {
      const job = { gen: search(from, to, opts), cb, dead: false, cancel() { if (!job.dead) { job.dead = true; stats.cancelled++; } } };
      stats.requests++;
      if (opts.urgent && queue.length) queue.splice(1, 0, job); else queue.push(job);
      return job;
    },
    /** 每帧调一次：最多算 budgetMs 毫秒 */
    update(budgetMs = PATH.budget) {
      if (!queue.length) return;
      const t0 = now(), end = t0 + budgetMs;
      stats.slices++;
      do {
        const job = queue[0];
        if (job.dead) { queue.shift(); continue; }
        let r;
        try { r = job.gen.next(); } catch (e) { r = { done: true, value: null }; console.error('[零点突围] 寻路出错', e); }
        if (r.done) {
          queue.shift(); job.dead = true;
          if (r.value) stats.done++; else stats.failed++;
          try { job.cb(r.value || null); } catch (e) { console.error('[零点突围] 寻路回调出错', e); }
        }
      } while (queue.length && now() < end);
      stats.worst = Math.max(stats.worst, now() - t0);
    },
    /** 一次算完（测试、开局前用） */
    findNow(from, to, opts = {}) { const g = search(from, to, opts); for (;;) { const r = g.next(); if (r.done) return r.value || null; } },
    /** 开局前把跨层连接表建好（楼梯、扶梯、门洞每个都要试走一遍，放在加载画面里做） */
    prepare() { floorsOf(false); floorsOf(true); },
    reset() { for (const j of queue) j.dead = true; queue.length = 0; },
  };
  return api;
}
