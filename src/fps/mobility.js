// Vertical movement is independent of the floor navigation solver. Horizontal
// collision still respects walls, shaft openings and railings while airborne.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Ground-slide tuning: one slide is shorter than the sprint stamina cycle so
 *  chaining slides can never replace sprinting as the fastest traversal. */
export const SLIDE = Object.freeze({ duration: .62, speed: 9, cooldown: 1.1 });
const SLIDE_STAMINA = 9;
export const MOBILITY = Object.freeze({ walk: 3.8, sprint: 6.8, crouch: 2,
  aim: 2.5, jumpVelocity: 4.8, gravity: 14, staminaDrain: 21, staminaRecovery: 17,
  slide: SLIDE.speed });

export function createMobility() {
  return { stamina: 100, exhausted: false, sprinting: false, height: 0,
    velocity: 0, landing: 0, jumpCooldown: 0, jumps: 0,
    slide: 0, slideProgress: 0, slideCooldown: 0, sliding: false };
}

export function jump(motion, { grounded = true, ceiling = 3, blocked = false } = {}) {
  if (blocked || !grounded || motion.height > .001 || motion.jumpCooldown > 0 || ceiling < .22) return false;
  motion.velocity = Math.min(MOBILITY.jumpVelocity, Math.sqrt(2 * MOBILITY.gravity * ceiling));
  motion.height = .001;
  motion.jumpCooldown = .35;
  motion.jumps++;
  return true;
}

/** Explicit slide entry: the caller decides when the player crouches while
 * sprinting, so idle/airborne frames can never start one by accident.
 * `crouch` is accepted for call-site symmetry: the crouch key is normally
 * already held on the frame this is requested. Aiming blocks the slide. */
export function startSlide(motion, { grounded = true, sprinting = true, crouch = false, aiming = false } = {}) {
  if (!grounded || !sprinting || aiming) return false;
  if (motion.sliding || motion.slide > 0 || motion.slideCooldown > 0 || motion.height > .001) return false;
  motion.slide = SLIDE.duration;
  motion.slideProgress = 0;
  motion.sliding = true;
  motion.slideCooldown = SLIDE.cooldown;
  motion.sprinting = false;
  return true;
}

export function tickMobility(m, dt, { moving = false, sprint = false,
  crouch = false, aiming = false, busy = false, firing = false, ceiling = 3 } = {}) {
  dt = clamp(Number(dt) || 0, 0, .1);
  m.jumpCooldown = Math.max(0, m.jumpCooldown - dt);
  m.slideCooldown = Math.max(0, m.slideCooldown - dt);
  m.landing *= Math.exp(-dt * 14);
  if (m.sliding) {
    m.slide = Math.max(0, m.slide - dt);
    m.slideProgress = clamp(1 - m.slide / SLIDE.duration, 0, 1);
    if (!m.slide) m.sliding = false;
  }
  if (m.exhausted && m.stamina >= 28) m.exhausted = false;
  m.sprinting = !m.sliding && moving && sprint && !crouch && !aiming && !busy && !firing && !m.exhausted && m.stamina > 0;
  // A slide glides instead of sprinting: it still costs stamina, but far less
  // than holding sprint, so it is a burst option rather than a free speed-up.
  if (m.sliding) m.stamina = clamp(m.stamina - SLIDE_STAMINA * dt, 0, 100);
  else m.stamina = clamp(m.stamina + (m.sprinting ? -MOBILITY.staminaDrain : MOBILITY.staminaRecovery) * dt, 0, 100);
  if (!m.stamina) { m.exhausted = true; m.sprinting = false; }
  let landed = false;
  if (m.height > 0 || m.velocity > 0) {
    m.velocity -= MOBILITY.gravity * dt;
    m.height += m.velocity * dt;
    if (m.height > ceiling) { m.height = Math.max(0, ceiling); m.velocity = Math.min(0, m.velocity); }
    if (m.height <= 0) { m.height = 0; m.velocity = 0; m.landing = 1; landed = true; }
  }
  const sliding = m.sliding;
  // Quadratic ease-out from the slide burst back down to a walk.
  const slideSpeed = sliding ? MOBILITY.walk + (MOBILITY.slide - MOBILITY.walk) * (1 - m.slideProgress) ** 2 : 0;
  return { speed: sliding ? slideSpeed : busy ? 1.5 : crouch ? MOBILITY.crouch : aiming ? MOBILITY.aim : m.sprinting ? MOBILITY.sprint : MOBILITY.walk,
    landed, airborne: m.height > .001, sliding, slideProgress: m.slideProgress };
}

/** Measured visible pose offsets for the existing licensed arms and weapons.
 * This adds no synthetic arm geometry and remains legible at the 30 FPS cap.
 * A slide snaps the body down over the first fifth of the move, keeps the
 * weapon canted low and sideways, then settles as the stride runs out. */
export function movementPose(time, { sprint = 0, moving = 0, aiming = 0,
  airborne = 0, landing = 0, sliding = 0, slideProgress = 0 } = {}) {
  const walk = moving * (1 - .8 * aiming) * (1 - .7 * sprint);
  const stride = time * 11.8, sway = Math.sin(stride), bounce = Math.cos(stride * 2);
  const slide = clamp(Number(sliding) || 0, 0, 1), progress = clamp(Number(slideProgress) || 0, 0, 1);
  const dip = slide * Math.min(1, progress / .18) * (1 - .3 * clamp((progress - .7) / .3, 0, 1));
  return {
    x: Math.sin(time * 8.5) * .008 * walk - .025 * sprint + sway * .035 * sprint
      - .05 * dip + Math.sin(progress * 9) * .012 * dip,
    y: Math.sin(time * 17) * .005 * walk - .085 * sprint + bounce * .026 * sprint - .025 * airborne
      - .06 * landing - .32 * dip + bounce * .012 * dip,
    z: .085 * sprint + Math.cos(stride) * .018 * sprint + .035 * airborne + .10 * dip,
    rx: -.18 * sprint + Math.sin(stride) * .035 * sprint + .04 * airborne + .07 * landing
      - .40 * dip + Math.sin(progress * 6.2) * .03 * dip,
    ry: Math.sin(time * 4.25) * .008 * walk + .14 * sprint + Math.cos(stride) * .025 * sprint + .36 * dip,
    rz: -.56 * sprint + sway * .05 * sprint + Math.cos(time * 8.5) * .008 * walk - .30 * dip,
  };
}
