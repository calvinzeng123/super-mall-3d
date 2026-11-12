// 夜间潜入的规则部分：巡逻路线、保安的视野和听觉、警觉条、评星。不碰 three.js 和 DOM。
// 朝向约定：yaw 是绕 Y 轴的转角，面朝 (sin yaw, cos yaw)，和 FPS 的敌人一致。
import { polyCentroid, polyArea, pointInPoly, distToPolyEdge } from '../../layout/geom.js';

export const HEIST = Object.freeze({
  range: 20, fov: 100, touch: 1.8, // 视野：最远距离（m）、张角（度）、贴到这么近不管朝向都会发现
  fillNear: 0.8, fillFar: 0.15, decay: 0.3, // 被看见时警觉条每秒涨多少（贴身 / 最远处），没人看见时每秒回落多少
  hear: 10, runSpeed: 4.2, investigate: 6, // 跑步声传多远（m）；多快算跑（m/s）；保安去查看多久（s）
  guardSpeed: 1.5, searchSpeed: 2.4, pause: 2.2, turn: 3.2,
  objectiveRadius: 2.6, hold: 1.4, // 站进目标圈多久算完成
  par: 360, // 三星的时间线（s）
});

/** 每关：各层几名保安，和依次要到的目标（都取该层的出生点：最大走道里靠中心的位置）。 */
export const HEIST_LEVELS = Object.freeze({
  gallery: {
    guards: [['P1-1F', 2], ['P1-2F', 1], ['P1C-1F', 1], ['P1C-4F', 1], ['P1-B1M', 1], ['M-B1', 1]],
    objectives: [
      { id: 'card', level: 'P1-1F', title: '拿到保安的门禁卡', where: '商场 1F 中庭服务台', done: '门禁卡到手' },
      { id: 'exhibit', level: 'P1C-4F', title: '取走展品', where: '云澜艺文馆 4F 展厅', done: '展品到手，快走' },
      { id: 'escape', level: 'M-B1', title: '赶上末班地铁', where: '地铁站厅（商场 B1M 有通道）', done: '上车了' },
    ],
  },
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/**
 * 巡逻候选点：每条走道的中心；大块的走道再加几个「中心到各顶点 55% 处」的点。
 * standable(x, z) 判断站不站得住；相距不到 4 m 的点只留一个。
 */
export function patrolNodes(level, standable) {
  const out = [];
  const add = (x, z) => {
    if (Number.isFinite(x) && standable(x, z) && !out.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) out.push({ x, z });
  };
  for (const w of level.walk || []) {
    if (!(w.poly?.length >= 3)) continue;
    const c = polyCentroid(w.poly);
    add(c[0], c[1]);
    if (Math.abs(polyArea(w.poly)) > 150) for (const [x, z] of w.poly) add(c[0] + (x - c[0]) * 0.55, c[1] + (z - c[1]) * 0.55);
  }
  return out;
}

/**
 * 候选点之间能不能直线走到。每个点只试最近的 k 个（整层两两寻路太慢）。
 * trace(a, b) 沿直线走一遍，走得通返回真。返回邻接表（下标数组）。
 */
export function patrolEdges(nodes, trace, k = 6, maxLen = 70) {
  const adj = nodes.map(() => new Set());
  nodes.forEach((a, i) => {
    const near = nodes.map((b, j) => [dist(a, b), j]).filter(([d, j]) => j !== i && d <= maxLen)
      .sort((p, q) => p[0] - q[0]).slice(0, k);
    for (const [, j] of near) if (!adj[i].has(j) && trace(a, nodes[j])) { adj[i].add(j); adj[j].add(i); }
  });
  return adj.map((set) => [...set]);
}

/** 给 n 名保安挑起点：只在有边的点里挑，彼此尽量远。 */
export function patrolStarts(nodes, adj, rng, n) {
  // 先从至少连着两条巡逻边的点里挑（只连一条的点走两步就到头，巡逻线太短）
  const linked = nodes.map((_, i) => i).filter((i) => adj[i].length >= 2);
  const pool = linked.length >= n ? linked : nodes.map((_, i) => i).filter((i) => adj[i].length);
  if (!pool.length) return [];
  const chosen = [pool.splice(Math.floor(rng() * pool.length), 1)[0]];
  while (chosen.length < n && pool.length) {
    let best = 0, bestD = -1;
    pool.forEach((i, at) => { const d = Math.min(...chosen.map((c) => dist(nodes[c], nodes[i]))); if (d > bestD) { bestD = d; best = at; } });
    chosen.push(pool.splice(best, 1)[0]);
  }
  return chosen;
}

/**
 * 一条往返巡逻线：从 start 出发，每次去「没去过、离起点最远」的邻点，走 legs 段后原路返回。
 * 返回 [{ x, z, stop }]，首尾相接循环走；每个点都是停留点。
 */
export function patrolLoop(nodes, adj, start, legs = 4) {
  const path = [start], seen = new Set([start]);
  while (path.length <= legs) {
    // 优先去还能接着往下走的邻点（死胡同放最后），同样能走的里挑离起点最远的
    const onward = (j) => adj[j].some((k) => !seen.has(k) && k !== j);
    const next = adj[path.at(-1)].filter((j) => !seen.has(j))
      .sort((p, q) => (onward(q) - onward(p)) || dist(nodes[q], nodes[start]) - dist(nodes[p], nodes[start]))[0];
    if (next == null) break;
    path.push(next); seen.add(next);
  }
  const loop = path.length > 1 ? [...path, ...path.slice(1, -1).reverse()] : path;
  return loop.map((i) => ({ x: nodes[i].x, z: nodes[i].z, stop: true }));
}

const SEE_THROUGH = new Set(['atrium', 'street', 'escalator']);
/** 这一层里视线能越过的洞口：中庭、内街上空、扶梯口（电梯井和楼梯间不算）。 */
export const openVoids = (level) => (level?.voids || []).filter((v) => SEE_THROUGH.has(v.kind) && v.poly?.length >= 3).map((v) => v.poly);

function crosses(a, b, w) {
  const dx = b.x - a.x, dz = b.z - a.z, ex = w.x1 - w.x0, ez = w.z1 - w.z0, den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((w.x0 - a.x) * ez - (w.z0 - a.z) * ex) / den, u = ((w.x0 - a.x) * dz - (w.z0 - a.z) * dx) / den;
  return t > 1e-5 && t < 1 - 1e-5 && u >= 0 && u <= 1;
}

/**
 * 同一层里 a 能不能看见 b。墙挡视线；站不了人的地方（柜台、楼外）也挡，但中庭这类洞口上空看得穿：
 * 隔着中庭，对面的保安看得见你。walls: [{ x0, z0, x1, z1 }]；standable(x, z)；voids: 多边形数组。
 */
export function sightLine(a, b, walls, standable, voids = []) {
  for (const w of walls) if (crosses(a, b, w)) return false;
  const n = Math.max(1, Math.ceil(dist(a, b) / 0.65));
  for (let i = 1; i < n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
    // 洞口边上有一圈栏杆的让位（站不了人，但挡不住视线），所以洞口按外扩 0.9 m 算
    if (!standable(x, z) && !voids.some((poly) => pointInPoly([x, z], poly) || distToPolyEdge([x, z], poly) < 0.9)) return false;
  }
  return true;
}

export const newGuard = (id, floor, y, route, start = 0) => ({
  id, floor, y, x: route[start].x, z: route[start].z, yaw: 0, route, i: (start + 1) % route.length,
  mode: 'patrol', wait: 0, target: null, until: 0, stuck: 0,
});

/** 保安 g 能不能看见 p（同层、距离内、在视锥里或贴身、中间没有墙）。los(a, b) 是视线函数。 */
export function guardSees(g, p, los) {
  if (g.floor !== p.floor) return false;
  const d = dist(g, p);
  if (d > HEIST.range) return false;
  if (d > HEIST.touch) {
    const facing = (Math.sin(g.yaw) * (p.x - g.x) + Math.cos(g.yaw) * (p.z - g.z)) / Math.max(1e-3, d);
    if (facing < Math.cos(HEIST.fov * Math.PI / 360)) return false;
  }
  return los(g, p);
}

/** 被这名保安看见时，警觉条每秒涨多少：越近越快。 */
export const alertRate = (d) => HEIST.fillNear + (HEIST.fillFar - HEIST.fillNear) * Math.min(1, d / HEIST.range);

/**
 * 更新一帧的警觉。player: { floor, x, z, speed, hidden }；返回 { alert, seenBy, heardBy }。
 * 看见玩家的保安停下来盯着（mode 'look'）；听到跑步声的保安过去查看（mode 'investigate'）。
 */
export function updateAlert(alert, guards, player, dt, now, los) {
  let rate = 0, seenBy = 0, heardBy = 0;
  for (const g of guards) {
    const sees = !player.hidden && guardSees(g, player, los);
    if (sees) {
      seenBy++;
      rate = Math.max(rate, alertRate(dist(g, player)) * (player.speed > HEIST.runSpeed ? 1.4 : 1));
      g.mode = 'look'; g.target = { x: player.x, z: player.z }; g.until = now + 1.5;
    } else if (!player.hidden && g.floor === player.floor && player.speed > HEIST.runSpeed && dist(g, player) <= HEIST.hear) {
      heardBy++;
      g.mode = 'investigate'; g.target = { x: player.x, z: player.z }; g.until = now + HEIST.investigate;
    }
  }
  const next = seenBy ? alert + rate * dt : alert - HEIST.decay * dt;
  return { alert: Math.max(0, Math.min(1, next)), seenBy, heardBy };
}

/**
 * 保安走一步。walk(g, dx, dz) 用导航模型挪动并返回新位置 { x, z }（会被墙挡住）。
 */
export function stepGuard(g, dt, now, walk) {
  const turnTo = (yaw) => { g.yaw += Math.max(-HEIST.turn * dt, Math.min(HEIST.turn * dt, wrapPi(yaw - g.yaw))); };
  const go = (to, speed) => {
    const dx = to.x - g.x, dz = to.z - g.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return 0;
    turnTo(Math.atan2(dx, dz));
    const stepLen = Math.min(d, speed * dt), p = walk(g, dx / d * stepLen, dz / d * stepLen);
    const moved = Math.hypot(p.x - g.x, p.z - g.z);
    g.x = p.x; g.z = p.z;
    g.stuck = moved < stepLen * 0.3 ? g.stuck + dt : 0;
    return d - moved;
  };
  if (g.mode === 'look') {
    if (g.target) turnTo(Math.atan2(g.target.x - g.x, g.target.z - g.z));
    if (now >= g.until) { g.mode = 'investigate'; g.until = now + HEIST.investigate; } // 人不见了，过去看看
    return;
  }
  if (g.mode === 'investigate') {
    const left = g.target ? go(g.target, HEIST.searchSpeed) : 0;
    if (left < 1.2 || now >= g.until || g.stuck > 1.5) {
      g.mode = 'patrol'; g.target = null; g.wait = HEIST.pause; g.stuck = 0;
      // 回到离自己最近的路点
      let best = 0, bestD = Infinity;
      g.route.forEach((p, i) => { const d = dist(p, g); if (d < bestD) { bestD = d; best = i; } });
      g.i = best;
    }
    return;
  }
  if (g.wait > 0) { g.wait -= dt; g.yaw += Math.sin(now * 1.3 + g.id.length) * 0.9 * dt; return; } // 站着左右张望
  if (g.route.length < 2) return;
  const to = g.route[g.i], left = go(to, HEIST.guardSpeed);
  if (left < 0.35 || g.stuck > 2) {
    if (to.stop && g.stuck <= 2) g.wait = HEIST.pause;
    g.i = (g.i + 1) % g.route.length; g.stuck = 0;
  }
}

/** 评星：逃出去 1 星；全程警觉没过六成 2 星；再加上在时间线内 3 星。 */
export function heistStars({ escaped, maxAlert, seconds }) {
  if (!escaped) return 0;
  if (maxAlert >= 0.6) return 1;
  return seconds <= HEIST.par ? 3 : 2;
}

export const heistScore = ({ escaped, maxAlert, seconds }) => (escaped ? Math.max(0, Math.round(1000 - seconds - maxAlert * 300)) : 0);

/**
 * 潜入里几件贴图道具的尺寸（m）。
 * shutter：卷帘门拉下来的高度、离门面线多远、模型本身的宽和高；tableTop：放门禁卡的边几的台面高度
 * （用 scripts/props/audit-sets.mjs 量模型得到的，包围盒看不出来）。
 */
export const HEIST_PROPS = Object.freeze({ shutter: Object.freeze({ height: 3.05, gap: 0.16, width: 1.08, tall: 2.4 }), tableTop: 0.55 });

/**
 * 一段门面上卷帘门的摆法（铺位局部坐标）：{ x, y, z, ry, scale }。front 是门面线段，normal 是朝店外的法向，elev 是楼面标高。
 * 卷帘门模型的原点在背面正中（上下各一半），所以 y 取楼面加门高的一半——放在楼面标高的话下半截会埋在地里。
 * 门面不到 1.2 m 宽的不装，返回 null。
 */
export function shutterPlacement(front, normal, elev) {
  const len = Math.hypot(front.x1 - front.x0, front.z1 - front.z0), S = HEIST_PROPS.shutter;
  if (len < 1.2) return null;
  const [nx, nz] = normal;
  return { x: (front.x0 + front.x1) / 2 + nx * S.gap, y: elev + S.height / 2, z: (front.z0 + front.z1) / 2 + nz * S.gap, ry: Math.atan2(nx, nz), scale: [(len - 0.3) / S.width, S.height / S.tall, 0.6] };
}
