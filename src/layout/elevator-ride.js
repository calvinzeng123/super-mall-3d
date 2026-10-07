// 实际乘梯行程：进轿厢、关门、连续升降、开门、走出，不使用黑场传送。
export function createElevatorRide(from, to, cabin, approach = null) {
  return { from, to, cabin, approach, elapsed: 0, travel: Math.max(1.2, Math.abs(to.y - from.y) / 7) };
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
