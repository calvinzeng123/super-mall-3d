// 无人机送外卖的规则部分：停机坪、订单、飞行、电量、评星。不碰 three.js 和 DOM，Node 里可以直接测。
import { polyArea, polyCentroid, pointInPoly } from '../../layout/geom.js';
import { sample } from '../rng.js';

export const DRONE = Object.freeze({
  radius: 0.7, // 碰撞球半径（m）
  speed: 22, reverse: 10, strafe: 14, climb: 9, // 前进 / 后退 / 平移 / 升降的最高速度（m/s）
  yawRate: 1.9, accel: 3.2, ceiling: 260,
  padRadius: 3.4, padHeight: 2.2, padSpeed: 4, holdSeconds: 1.1, // 悬停在停机坪上方多久算取餐 / 送达
  battery: 100, drainBase: 0.8, drainSpeed: 0.03, drainClimb: 0.12, // 每秒耗电（%）：悬停 + 速度 + 爬升
  crashSpeed: 7, crashBattery: 8, // 撞上去的速度超过它算一次碰撞，扣电
  windFrom: 55, windFull: 100, // 风从这个高度开始，到这个高度吹满
  swapPenalty: 12, // 电量耗尽自动返航换电，扣的秒数
});

/** 每关的参数。zone：near 只送近处，all 全园区。wind 是高空满风的风速（m/s）。 */
export const DRONE_LEVELS = Object.freeze({
  lunch: { orders: 4, seconds: 240, wind: 0, night: false, zone: 'near' },
  dinner: { orders: 5, seconds: 330, wind: 3.2, night: false, zone: 'all' },
  night: { orders: 6, seconds: 400, wind: 5, night: true, zone: 'all' },
});

const FOOD = new Set(['cafe', 'restaurant', 'tea', 'snack', 'food', 'bar']);
const NEAR = 240; // 离取餐点这么近算“近处”

const centroidIn = (poly) => { const c = polyCentroid(poly); return pointInPoly(c, poly) ? c : null; };

/**
 * 取餐点和投递点：{ id, name, x, y, z, hub?, zone }，y 是落脚面高度。
 * air 是 buildAirspace(layout)：用它确认每个点上方是空的、脚下真的有面。
 */
export function dronePads(layout, air) {
  const level = (id) => layout.levels.find((l) => l.id === id);
  const open = (x, y, z) => !air.hit(x, y + 1.8, z, 1.6) && Math.abs(air.surfaceBelow(x, z, y + 3) - y) < 0.6;
  const pads = [];

  // 取餐点：一期天台上离商场中心最近的一块空露台
  const p1 = layout.buildings.find((b) => b.id === 'P1'), rf = level('P1-RF');
  const centre = p1?.center ? [p1.center.x ?? p1.center[0], p1.center.z ?? p1.center[1]] : polyCentroid(p1.outline);
  const decks = (rf?.walk || []).filter((w) => w.kind === 'deck' && w.poly?.length >= 3 && Math.abs(polyArea(w.poly)) > 60)
    .map((w) => centroidIn(w.poly)).filter(Boolean).filter(([x, z]) => open(x, rf.elev, z))
    .sort((a, b) => Math.hypot(a[0] - centre[0], a[1] - centre[1]) - Math.hypot(b[0] - centre[0], b[1] - centre[1]));
  if (!decks.length) throw new Error('一期天台上找不到可用的取餐点');
  const hub = { id: 'hub', name: '商场天台 · 取餐点', x: decks[0][0], y: rf.elev, z: decks[0][1], hub: true, zone: 'hub' };
  pads.push(hub);
  const zoneOf = (x, z) => (Math.hypot(x - hub.x, z - hub.z) <= NEAR ? 'near' : 'far');
  const add = (id, name, x, z, y) => {
    if (!open(x, y, z)) return false;
    pads.push({ id, name, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), zone: zoneOf(x, z) });
    return true;
  };

  // 各栋塔楼的楼顶：停机坪放在朝取餐点的那个角，往里收 7 m，避开中间的电梯机房
  for (const b of layout.buildings.filter((x) => x.kind === 'tower')) {
    const roof = layout.levels.find((l) => l.building === b.id && l.kind === 'roof');
    if (!roof) continue;
    const c = polyCentroid(roof.outline);
    const corners = [...roof.outline].sort((p, q) => Math.hypot(p[0] - hub.x, p[1] - hub.z) - Math.hypot(q[0] - hub.x, q[1] - hub.z));
    for (const [cx, cz] of corners) {
      const d = Math.hypot(c[0] - cx, c[1] - cz) || 1, k = Math.min(0.45, 7 / d);
      if (add(`${b.id}-roof`, `${b.name} · 楼顶`, cx + (c[0] - cx) * k, cz + (c[1] - cz) * k, roof.elev)) break;
    }
  }
  // 艺文馆屋顶
  const art = level('P1C-RF'), artDeck = art?.walk?.find((w) => w.kind === 'deck');
  const artC = artDeck && centroidIn(artDeck.poly);
  if (artC) add('P1C-roof', '云澜艺文馆 · 屋顶', artC[0], artC[1], art.elev);
  // 江对岸的滨江公园、星湾桥桥面
  const river = layout.site?.river;
  if (river?.north?.park) {
    const z = (river.north.park[0] + river.north.park[1]) / 2;
    add('river-park', '对岸滨江公园 · 草坪', hub.x, z, air.surfaceBelow(hub.x, z, 5));
  }
  const arch = river?.bridges?.find((b) => b.kind === 'tied-arch');
  if (arch) {
    const x = (arch.deck.x0 + arch.deck.x1) / 2 + 9, z = (arch.deck.z0 + arch.deck.z1) / 2;
    add('xingwan-bridge', '星湾桥 · 桥中', x, z, air.surfaceBelow(x, z, 5));
  }
  return pads;
}

/** 一期里能出餐的店。 */
export function foodShops(layout) {
  const out = [];
  for (const lv of layout.levels) {
    if (!/^P1/.test(lv.building)) continue;
    for (const u of lv.units || []) if (u.brand?.name && FOOD.has(u.brand.cat)) out.push({ id: u.id, name: u.brand.name, level: lv.short || lv.id });
  }
  return out;
}

/** 这一关的订单：[{ n, shop, to }]，to 是投递点。同一关的订单固定（rng 由关卡决定）。 */
export function buildOrders(layout, pads, cfg, rng) {
  const targets = pads.filter((p) => !p.hub && (cfg.zone === 'all' || p.zone === 'near'));
  if (!targets.length) throw new Error('没有可送的投递点');
  const picked = sample(rng, targets, cfg.orders);
  while (picked.length < cfg.orders) picked.push(targets[Math.floor(rng() * targets.length)]);
  const shops = sample(rng, foodShops(layout), cfg.orders);
  return picked.map((to, i) => ({ n: i + 1, shop: shops[i % Math.max(1, shops.length)] || { name: '云澜食集' }, to }));
}

export const newDrone = (pad) => ({ x: pad.x, y: pad.y + DRONE.radius + 0.6, z: pad.z, vx: 0, vy: 0, vz: 0, yaw: 0, battery: DRONE.battery });

/** 风：方向缓慢摆动，带一点阵风。返回水平风速（m/s），已按高度折算。 */
export function windAt(t, strength, y) {
  if (!strength) return { x: 0, z: 0, k: 0 };
  const k = Math.max(0, Math.min(1, (y - DRONE.windFrom) / (DRONE.windFull - DRONE.windFrom)));
  const a = 0.7 + 0.5 * Math.sin(t * 0.11) + t * 0.015, gust = 0.75 + 0.25 * Math.sin(t * 0.9);
  return { x: Math.cos(a) * strength * gust * k, z: Math.sin(a) * strength * gust * k, k };
}

/**
 * 走一步。axes 来自 input.axes()；yaw 是绕 Y 轴的转角，机头朝 (−sin yaw, −cos yaw)。
 * 返回 { impact }：这一步撞上实体时的水平速度（没撞是 0）。
 */
export function stepDrone(s, axes, dt, air, wind = { x: 0, z: 0 }) {
  s.yaw -= axes.rx * DRONE.yawRate * dt;
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
  const fwd = axes.ly * (axes.ly >= 0 ? DRONE.speed : DRONE.reverse), side = axes.lx * DRONE.strafe;
  const k = Math.min(1, DRONE.accel * dt);
  s.vx += (fx * fwd + rx * side - s.vx) * k;
  s.vz += (fz * fwd + rz * side - s.vz) * k;
  s.vy += (axes.ry * DRONE.climb - s.vy) * Math.min(1, DRONE.accel * 1.4 * dt);
  const speed = Math.hypot(s.vx, s.vz);
  const d = { x: (s.vx + wind.x) * dt, y: s.vy * dt, z: (s.vz + wind.z) * dt };
  if (s.y + d.y > DRONE.ceiling) d.y = Math.max(0, DRONE.ceiling - s.y);
  const p = air.move(s, d, DRONE.radius);
  let impact = 0;
  if (p.bumped) { impact = speed; s.vx *= -0.25; s.vz *= -0.25; }
  if (p.grounded || (d.y && p.y === s.y)) s.vy = 0;
  s.x = p.x; s.y = p.y; s.z = p.z;
  s.battery = Math.max(0, s.battery - (DRONE.drainBase + DRONE.drainSpeed * speed + DRONE.drainClimb * Math.max(0, s.vy)) * dt);
  return { impact };
}

/** 是否稳稳悬停在停机坪上方。 */
export function overPad(s, pad) {
  const h = s.y - DRONE.radius - pad.y;
  return Math.hypot(s.x - pad.x, s.z - pad.z) <= DRONE.padRadius && h >= -0.3 && h <= DRONE.padHeight
    && Math.hypot(s.vx, s.vy, s.vz) <= DRONE.padSpeed;
}

/** 评星：送到一半 1 星；全部送到 2 星；全部送到、最多碰一次、还剩两成时间 3 星。 */
export function droneStars({ delivered, total, crashes, timeLeft, seconds }) {
  if (delivered < Math.ceil(total / 2)) return 0;
  if (delivered < total) return 1;
  return crashes <= 1 && timeLeft >= seconds * 0.2 ? 3 : 2;
}

export const droneScore = ({ delivered, crashes, timeLeft }) => Math.max(0, Math.round(delivered * 100 + Math.max(0, timeLeft) - crashes * 20));

// ---------------------------------------------------------------------------
// 一局的流程：取餐 → 投递 → 回去取下一单。画面层（drone.js）只管把这些事件画出来。

const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const ZERO = Object.freeze({ lx: 0, ly: 0, rx: 0, ry: 0 });

export function newRun(cfg, orders, hub) {
  return { cfg, orders, hub, drone: newDrone(hub), phase: 'pickup', index: 0, hold: 0, delivered: 0, crashes: 0, swaps: 0,
    t: 0, timeLeft: cfg.seconds, stun: 0, ended: false, reason: null };
}

/** 现在该去哪：取餐阶段是取餐点，投递阶段是这一单的投递点。 */
export const runTarget = (run) => (run.phase === 'pickup' || run.index >= run.orders.length ? run.hub : run.orders[run.index].to);

/**
 * 走一帧，返回这一帧发生的事件：
 *   { type: 'crash' } 撞了一下；{ type: 'swap' } 电量耗尽、自动返航换电；
 *   { type: 'pickup', order } 取到餐；{ type: 'deliver', order } 送达；{ type: 'end', reason } 结束（'done' | 'time'）。
 */
export function stepRun(run, axes, dt, air) {
  const events = [];
  if (run.ended) return events;
  const s = run.drone, { cfg } = run;
  run.t += dt; run.timeLeft -= dt;
  if (run.stun > 0) { run.stun -= dt; axes = ZERO; }
  const { impact } = stepDrone(s, axes, dt, air, windAt(run.t, cfg.wind, s.y));
  if (impact > DRONE.crashSpeed) {
    run.crashes++; run.stun = 0.45; s.battery = Math.max(0, s.battery - DRONE.crashBattery);
    events.push({ type: 'crash' });
  }
  if (s.battery <= 0) { // 订单还在手上，只是扣时间
    run.swaps++; run.timeLeft -= DRONE.swapPenalty;
    Object.assign(s, newDrone(run.hub), { yaw: s.yaw });
    events.push({ type: 'swap' });
  }
  if (overPad(s, runTarget(run))) {
    run.hold += dt;
    if (run.hold >= DRONE.holdSeconds) {
      run.hold = 0;
      const order = run.orders[run.index];
      if (run.phase === 'pickup') { run.phase = 'deliver'; s.battery = DRONE.battery; events.push({ type: 'pickup', order }); }
      else {
        run.delivered++; run.index++; run.phase = 'pickup';
        events.push({ type: 'deliver', order });
        if (run.index >= run.orders.length) { run.ended = true; run.reason = 'done'; events.push({ type: 'end', reason: 'done' }); return events; }
      }
    }
  } else run.hold = Math.max(0, run.hold - dt * 2);
  if (run.timeLeft <= 0) { run.ended = true; run.reason = 'time'; events.push({ type: 'end', reason: 'time' }); }
  return events;
}

export function runResult(run) {
  const total = run.orders.length, timeLeft = Math.max(0, run.timeLeft), seconds = run.cfg.seconds;
  const stars = droneStars({ delivered: run.delivered, total, crashes: run.crashes, timeLeft, seconds });
  return { success: run.delivered === total, stars, score: droneScore({ delivered: run.delivered, crashes: run.crashes, timeLeft }),
    seconds: seconds - timeLeft, delivered: run.delivered, total, crashes: run.crashes, swaps: run.swaps, timeLeft };
}

/** 自动驾驶（演示和测试用）：先爬到巡航高度，对准目标飞过去，到了再降到停机坪上方。 */
export function pilotAxes(run) {
  const s = run.drone, pad = runTarget(run), dx = pad.x - s.x, dz = pad.z - s.z, d = Math.hypot(dx, dz);
  const dyaw = wrapPi(Math.atan2(-dx, -dz) - s.yaw);
  const cruise = Math.max(run.hub.y, ...run.orders.map((o) => o.to.y)) + 16, goal = pad.y + DRONE.radius + 1;
  const ry = d > 22 ? Math.sign(cruise - s.y) * Math.min(1, Math.abs(cruise - s.y) / 4) : Math.sign(goal - s.y) * Math.min(1, Math.abs(goal - s.y) / 3);
  const climbing = d > 22 && cruise - s.y > 6;
  return { lx: 0, ly: climbing || Math.abs(dyaw) > 0.5 ? 0 : Math.min(1, d / 16), rx: -Math.max(-1, Math.min(1, dyaw * 3)), ry };
}

/**
 * 取餐点旁的一摞周转筐和纸箱：[模型, dx, dy, dz, 转角, 缩放]，位置相对停机坪中心（m）。
 * 叠在上面的要压在下面那只的正上方：dy 等于下面那只缩放后的高度（周转筐 0.254 × 1.3 = 0.33，纸箱 0.342 × 1.2 = 0.41）。
 */
export const HUB_CARGO = Object.freeze([
  ['crate_plastic', 4.4, 0, .6, 0, 1.3], ['crate_plastic', 4.4, .33, .7, .4, 1.3],
  ['cardboard_box', 5.3, 0, -.4, 1.1, 1.2], ['cardboard_box', 4.6, 0, -1.3, 2.6, 1.1], ['cardboard_box', 5.26, .41, -.42, .5, 1],
]);
