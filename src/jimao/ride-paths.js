// 零点突围的两条撤离路线（世界坐标，纯数据 + 纯函数，测试里直接用）。
//   接应车：公寓 B1 车库 → 东北公寓口出口坡道（A-OUT，−4.5 → 0 米）→ 右转上星湾路一路往南 → 右转上云澜大道往西。
//            玩家站在车顶射击口里，沿路两侧的武装分子冲出来拦截。
//   直升机：一期屋顶停机位垂直升 28 米 → 绕一期屋顶飞一整圈（左舷机枪始终朝着屋顶）→ 顺切线加速爬升离开。

// ---- 接应车 ----
export const CAR_ROUTE = Object.freeze({
  // 车头朝南（−z）停在车库西侧，离坡道底 20 米
  start: { x: -50, z: -232, yaw: Math.PI },
  // 拐角点：相邻两段直线在拐角处用半径 r 的圆弧连起来
  points: [[-50, -232], [-50, -253.5], [4, -253.5], [4, -6], [-175, -6]],
  radius: [0, 4, 6, 7, 0],
  ramp: { x0: -47, x1: -17, z0: -256, z1: -251, y0: -4.5, y1: 0 },
  garageY: -4.5,
  garage: { x0: -56, x1: -47, z0: -258, z1: -176 }, // 公寓 B1 车库里坡道底以西这一段
  speed: { garage: 6, street: 14, accel: 3.2 },
});

/** 把拐角磨圆后的折线按 0.5 米一段采样：[{x, z, s}]，s 是累计里程 */
export function sampleRoute(route = CAR_ROUTE) {
  const P = route.points, out = [];
  const push = (x, z) => { const last = out.at(-1); const s = last ? last.s + Math.hypot(x - last.x, z - last.z) : 0; if (!last || s - last.s > 1e-6) out.push({ x, z, s }); };
  let cur = P[0];
  push(cur[0], cur[1]);
  for (let i = 1; i < P.length; i++) {
    const b = P[i], next = P[i + 1], r = route.radius[i] || 0;
    if (!next || r <= 0) { line(cur, b); cur = b; continue; }
    const din = norm(sub(b, cur)), dout = norm(sub(next, b));
    const a = [b[0] - din[0] * r, b[1] - din[1] * r], c = [b[0] + dout[0] * r, b[1] + dout[1] * r];
    line(cur, a);
    for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; push(u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]); }
    cur = c;
  }
  return out;
  function line(a, b) { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5)); for (let k = 1; k <= n; k++) push(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

/** 路面高度：车库里 −4.5，出口坡道上线性升到 0，其余（街上）0 */
export function routeY(x, z, route = CAR_ROUTE) {
  const R = route.ramp;
  if (z >= R.z0 - 0.5 && z <= R.z1 + 0.5 && x >= R.x0 && x <= R.x1) return R.y0 + (R.y1 - R.y0) * (x - R.x0) / (R.x1 - R.x0);
  const g = route.garage;
  if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) return route.garageY;
  return 0;
}

/** 里程 s 处的车姿：位置、朝向（车头 +z 转到行驶方向）、坡道上的俯仰 */
export function carPoseAt(samples, s, route = CAR_ROUTE) {
  const n = samples.length, S = Math.max(0, Math.min(samples[n - 1].s, s));
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].s <= S) lo = m; else hi = m; }
  const a = samples[lo], b = samples[hi], t = b.s > a.s ? (S - a.s) / (b.s - a.s) : 0;
  const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
  // 朝向取前后各 1.5 米的弦，转弯更顺
  const f = pointAt(samples, Math.min(samples[n - 1].s, S + 1.5)), r = pointAt(samples, Math.max(0, S - 1.5));
  const yaw = Math.atan2(f.x - r.x, f.z - r.z);
  const yF = routeY(f.x, f.z, route), yR = routeY(r.x, r.z, route), dist = Math.hypot(f.x - r.x, f.z - r.z) || 1;
  return { x, y: routeY(x, z, route), z, yaw, pitch: -Math.atan2(yF - yR, dist), roll: 0, dir: { x: (f.x - r.x) / dist, z: (f.z - r.z) / dist } };
}
function pointAt(samples, s) {
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].s <= s) lo = m; else hi = m; }
  const a = samples[lo], b = samples[hi], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** 车速：车库和坡道上慢（6 m/s），上了路加速到 14 m/s，最后 30 米减速停下 */
export function carSpeedAt(samples, s, route = CAR_ROUTE) {
  const total = samples.at(-1).s, p = carPoseAt(samples, s, route), sp = route.speed;
  const onStreet = p.y > -0.01 && s > 60;
  const v = onStreet ? Math.min(sp.street, sp.garage + (s - 60) * 0.35) : sp.garage;
  return Math.max(1.2, Math.min(v, Math.sqrt(2 * sp.accel * Math.max(0, total - s)) + 1.2));
}

// ---- 直升机 ----
export const HELI_ORBIT = Object.freeze({
  pad: { x: -182, z: -120, yaw: Math.PI },
  center: { x: -130, z: -128 },   // 一期屋顶大致的中心（光穹、大天窗之间）
  climb: 28,                      // 从屋面再升多少米
  lift: 4.5,                      // 垂直起飞秒数
  loop: 42,                       // 绕一圈秒数
  ramp: 3,                        // 绕圈起步加速的秒数
  leave: 6,                       // 离开秒数
});
export const heliDuration = (o = HELI_ORBIT) => o.lift + o.loop + o.ramp / 2 + o.leave;

/**
 * 直升机 t 秒时的位姿。左舷（+x 局部）始终朝向圆心：机头方向 f = (sinθ, −cosθ)，yaw = π − θ，θ 随时间减小。
 * y0 是屋面标高。返回 { x, y, z, yaw, pitch, roll, phase }
 */
export function heliPoseAt(t, y0, o = HELI_ORBIT) {
  const C = o.center, R = Math.hypot(o.pad.x - C.x, o.pad.z - C.z), th0 = Math.atan2(o.pad.z - C.z, o.pad.x - C.x);
  const yawOrbit = (th) => Math.PI - th, smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const omega = (Math.PI * 2) / o.loop, top = y0 + o.climb;
  if (t < o.lift) {
    const k = smooth(t / o.lift), yaw = lerpAngle(o.pad.yaw, yawOrbit(th0), smooth((t - 0.8) / (o.lift - 0.8)));
    return { x: o.pad.x, y: y0 + o.climb * k, z: o.pad.z, yaw, pitch: 0, roll: 0, phase: 'lift' };
  }
  const tau = t - o.lift, T = o.loop + o.ramp / 2;
  // 起步时角速度从 0 线性加到 ω（ramp 秒），之后匀速；转完一整圈（2π）进入离开段
  const ang = tau < o.ramp ? (omega * tau * tau) / (2 * o.ramp) : omega * (tau - o.ramp / 2);
  if (tau < T) {
    const th = th0 - ang, w = tau < o.ramp ? tau / o.ramp : 1;
    return { x: C.x + R * Math.cos(th), y: top + 2.5 * Math.sin(ang * 2), z: C.z + R * Math.sin(th), yaw: yawOrbit(th), pitch: 0.06 * w, roll: -0.16 * w, phase: 'orbit' };
  }
  // 离开：沿圈的切线方向加速、爬升
  const u = tau - T, th = th0 - Math.PI * 2, f = { x: Math.sin(th), z: -Math.cos(th) }, d = R * omega * u + 4 * u * u;
  return { x: C.x + R * Math.cos(th) + f.x * d, y: top + 3 * u * u * 0.6 + 2 * u, z: C.z + R * Math.sin(th) + f.z * d,
    yaw: yawOrbit(th), pitch: 0.14 * smooth(u / 1.5), roll: -0.16 * (1 - smooth(u / 2)), phase: 'leave' };
}
function lerpAngle(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }
