// Vertical movement is independent of the floor navigation solver. Horizontal
// collision still respects walls, shaft openings and railings while airborne.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const MOBILITY = Object.freeze({ walk: 3.8, sprint: 6.8, crouch: 2,
  aim: 2.5, jumpVelocity: 4.8, gravity: 14, staminaDrain: 21, staminaRecovery: 17 });

export function createMobility() {
  return { stamina: 100, exhausted: false, sprinting: false, height: 0,
    velocity: 0, landing: 0, jumpCooldown: 0, jumps: 0 };
}

export function jump(motion, { grounded = true, ceiling = 3, blocked = false } = {}) {
  if (blocked || !grounded || motion.height > .001 || motion.jumpCooldown > 0 || ceiling < .22) return false;
  motion.velocity = Math.min(MOBILITY.jumpVelocity, Math.sqrt(2 * MOBILITY.gravity * ceiling));
  motion.height = .001;
  motion.jumpCooldown = .35;
  motion.jumps++;
  return true;
}

export function tickMobility(m, dt, { moving = false, sprint = false,
  crouch = false, aiming = false, busy = false, firing = false, ceiling = 3 } = {}) {
  dt = clamp(Number(dt) || 0, 0, .1);
  m.jumpCooldown = Math.max(0, m.jumpCooldown - dt);
  m.landing *= Math.exp(-dt * 14);
  if (m.exhausted && m.stamina >= 28) m.exhausted = false;
  m.sprinting = moving && sprint && !crouch && !aiming && !busy && !firing && !m.exhausted && m.stamina > 0;
  m.stamina = clamp(m.stamina + (m.sprinting ? -MOBILITY.staminaDrain : MOBILITY.staminaRecovery) * dt, 0, 100);
  if (!m.stamina) { m.exhausted = true; m.sprinting = false; }
  let landed = false;
  if (m.height > 0 || m.velocity > 0) {
    m.velocity -= MOBILITY.gravity * dt;
    m.height += m.velocity * dt;
    if (m.height > ceiling) { m.height = Math.max(0, ceiling); m.velocity = Math.min(0, m.velocity); }
    if (m.height <= 0) { m.height = 0; m.velocity = 0; m.landing = 1; landed = true; }
  }
  return { speed: busy ? 1.5 : crouch ? MOBILITY.crouch : aiming ? MOBILITY.aim : m.sprinting ? MOBILITY.sprint : MOBILITY.walk,
    landed, airborne: m.height > .001 };
}

/** Measured visible pose offsets for the existing licensed arms and weapons.
 * This adds no synthetic arm geometry and remains legible at the 30 FPS cap. */
export function movementPose(time, { sprint = 0, moving = 0, aiming = 0,
  airborne = 0, landing = 0 } = {}) {
  const walk = moving * (1 - .8 * aiming) * (1 - .7 * sprint);
  const stride = time * 11.8, sway = Math.sin(stride), bounce = Math.cos(stride * 2);
  return {
    x: Math.sin(time * 8.5) * .008 * walk - .025 * sprint + sway * .035 * sprint,
    y: Math.sin(time * 17) * .005 * walk - .085 * sprint + bounce * .026 * sprint - .025 * airborne - .06 * landing,
    z: .085 * sprint + Math.cos(stride) * .018 * sprint + .035 * airborne,
    rx: -.18 * sprint + Math.sin(stride) * .035 * sprint + .04 * airborne + .07 * landing,
    ry: Math.sin(time * 4.25) * .008 * walk + .14 * sprint + Math.cos(stride) * .025 * sprint,
    rz: -.56 * sprint + sway * .05 * sprint + Math.cos(time * 8.5) * .008 * walk,
  };
}
