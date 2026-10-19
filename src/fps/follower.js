import { step } from '../layout/nav.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const copy = p => ({ ...p, slope: p.slope ? { ...p.slope } : null });

/** Keep the actual collision-solved substeps, including stair entry/exit.
 * Sparse straight chords can cut the inside of a landing or change which
 * escalator the follower enters. Every saved position was occupied by player. */
export function recordTrail(trail, state) {
  const previous = trail.at(-1);
  if (!previous || distance(previous, state) > .015 || previous.floor !== state.floor
    || previous.slope?.id !== state.slope?.id) trail.push(copy(state));
}

/** Replay a trail through the same collision solver, using a distance budget.
 * Several close samples may be consumed in one frame; sample density must not
 * cap the teammate's walking speed. The recorded trajectory already includes
 * escalator belt motion, so replay does not add that displacement a second time. */
export function advanceTrail(nav, actor, trail, index, { dt, gap = 2.6, speed = 4.2, catchUpSpeed = 7.4 } = {}) {
  if (!trail.length) return { state: copy(actor), index, moving: false };
  let stop = trail.length - 1, behind = 0;
  while (stop > 0 && behind < gap) { behind += distance(trail[stop], trail[stop - 1]); stop--; }
  // A return trip can put player and teammate close in X/Z on different levels;
  // decide catch-up from remaining trail, rather than straight-line distance.
  let backlog = 0;
  for (let i = Math.max(1, index); i <= stop && backlog <= 4; i++) backlog += distance(trail[i], trail[i - 1]);
  let budget = (backlog > 4 ? catchUpSpeed : speed) * Math.min(.06, Math.max(0, dt || 0));
  let state = copy(actor), travelled = 0, heading = actor.yaw || 0;
  index = Math.min(Math.max(0, index), stop);
  for (let iterations = 0; iterations < 64 && budget > .00001; iterations++) {
    const target = trail[index], d = distance(state, target);
    if (d < .001) {
      if (index >= stop) break;
      index++; continue;
    }
    const amount = Math.min(d, budget, .12), dx = (target.x - state.x) / d * amount, dz = (target.z - state.z) / d * amount;
    const next = step(nav, state, dx, dz, 0), moved = distance(state, next);
    if (moved < .00001) break;
    heading = Math.atan2(next.x - state.x, next.z - state.z);
    travelled += moved; budget -= Math.max(amount, moved); state = next;
  }
  return { state, index, moving: travelled > .002, yaw: heading };
}
