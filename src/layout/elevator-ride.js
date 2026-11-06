// 实际乘梯行程：进轿厢、关门、连续升降、开门、走出，不使用黑场传送。
// 行程时间按电梯速度压缩约一半（travel = Δy / (2 × speed)，默认 3.5 m/s 即原来的 Δy / 7）；
// realSeconds 是真实梯速下的运行时间，供 HUD 显示「实际约 n 秒」（SPEC §3.2，用户选择压缩乘梯）。
import { LIFT_SPEED_DEFAULT } from './elevator-shafts.js';

export { LIFT_SPEED_DEFAULT };
/** Acceleration (m/s²) and jerk (m/s³) of the run model: passenger cars 1.0, fire lifts 0.9 (codes.md §4.3). */
export const LIFT_RUN = Object.freeze({ accel: 1.0, fireAccel: 0.9, jerk: 1.5 });

/** Real flight time (s) of a lift run of dy metres at rated speed v: jerk-limited trapezoid,
 * t = d / v + v / a + a / j once the car reaches v; a short run peaks below v (t = 2√(d / a) + a / j). */
export function liftRunSeconds(dy, speed = LIFT_SPEED_DEFAULT, { accel = LIFT_RUN.accel, jerk = LIFT_RUN.jerk } = {}) {
  const d = Math.abs(dy);
  if (d < 1e-9) return 0;
  const t = d >= speed * speed / accel ? d / speed + speed / accel : 2 * Math.sqrt(d / accel);
  return t + accel / jerk;
}

/** In-game travel time (s) between two heights: Δy / (2 × speed), at least 1.2 s. */
export const rideTravel = (dy, speed = LIFT_SPEED_DEFAULT) => Math.max(1.2, Math.abs(dy) / (2 * speed));

/** speed: the lift's e.speed (absent = 3.5 m/s, today's Δy / 7); options.fire: the fire-lift acceleration for realSeconds. */
export function createElevatorRide(from, to, cabin, approach = null, speed = LIFT_SPEED_DEFAULT, { fire = false } = {}) {
  const v = speed ?? LIFT_SPEED_DEFAULT, dy = to.y - from.y;
  return { from, to, cabin, approach, elapsed: 0, travel: rideTravel(dy, v), speed: v,
    realSeconds: liftRunSeconds(dy, v, { accel: fire ? LIFT_RUN.fireAccel : LIFT_RUN.accel }) };
}
const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
export function sampleElevatorRide(ride, time) {
  const { from, to, cabin, travel, approach } = ride;
  const align = approach ? 0.65 : 0;
  const start = approach || from;
  const board = 0.9, close = 0.65, open = 0.65, exit = 0.9;
  const cruiseAt = align + board + close, landAt = cruiseAt + travel, exitAt = landAt + open;
  const total = exitAt + exit;
  let x = cabin.x, z = cabin.z, y = from.y, door = 0, phase = '关门';
  if (time < align) {
    const t = smooth(Math.max(0, time) / align);
    x = mix(from.x, start.x, t); z = mix(from.z, start.z, t); door = 1; phase = '走向电梯';
  } else if (time < align + board) {
    const t = smooth(Math.max(0, time - align) / board);
    x = mix(start.x, cabin.x, t); z = mix(start.z, cabin.z, t); door = 1; phase = '进入轿厢';
  } else if (time < cruiseAt) door = 1 - (time - align - board) / close;
  else if (time < landAt) { y = mix(from.y, to.y, smooth((time - cruiseAt) / travel)); phase = to.y > from.y ? '上行' : '下行'; }
  else {
    y = to.y;
    if (time < exitAt) { door = (time - landAt) / open; phase = '开门'; }
    else {
      const t = smooth(Math.min(1, (time - exitAt) / exit));
      x = mix(cabin.x, to.x, t); z = mix(cabin.z, to.z, t); door = 1; phase = '到达';
    }
  }
  return { x, y, z, door, phase, total, done: time >= total, arrived: time >= landAt };
}
