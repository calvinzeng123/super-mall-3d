import * as THREE from 'three';

// Additive impact/explosion particles share one locally generated soft sprite
// texture and a fixed pool, so bursts never allocate geometry or textures on
// the phone's render thread. All camera shake math is deterministic and pure.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = ([lo, hi]) => lo + Math.random() * (hi - lo);

/** Camera shake tuning: outputs are metres, radians and degrees. */
export const SHAKE = Object.freeze({ recover: 2.8, sway: .06, fov: 2.6 });
// Tuned so the semi-implicit Euler step stays stable even at the clamped
// 1/12 s frame budget while still settling a dip within ~0.6 s.
const SPRING = Object.freeze({ stiffness: 110, damping: 13 });

/** One deterministic damped-spring step. Mutates the caller's {value,velocity}
 * so the update loop stays allocation-free and node tests can drive it. */
export function springStep(state, dt, target = 0, { stiffness = SPRING.stiffness, damping = SPRING.damping } = {}) {
  dt = clamp(Number(dt) || 0, 0, 1 / 12);
  state.velocity += ((target - state.value) * stiffness - state.velocity * damping) * dt;
  state.value += state.velocity * dt;
  return state;
}

/** Pure trauma shake step. A fixed sine basis replaces random numbers so two
 * identical inputs always produce identical offsets (replays and unit tests).
 * Trauma is squared for a soft tail: light hits tremble, explosions slam. */
export function stepShake(state, dt) {
  dt = clamp(Number(dt) || 0, 0, 1 / 12);
  const st = state;
  st.time = (st.time || 0) + dt;
  st.trauma = clamp((st.trauma || 0) - dt * SHAKE.recover, 0, 1);
  const amp = st.trauma * st.trauma, t = st.time, s = SHAKE.sway;
  st.x = amp * s * .5 * (Math.sin(t * 27.7) + .45 * Math.sin(t * 51.3));
  st.y = amp * s * .8 * (Math.sin(t * 33.1 + 1.2) + .4 * Math.sin(t * 57.7));
  st.z = amp * s * .7 * Math.sin(t * 21.4 + .6);
  st.roll = -amp * s * .9 * (Math.sin(t * 24.9 + .8) + .35 * Math.sin(t * 43.1));
  st.fov = amp * SHAKE.fov * Math.sin(t * 19.1 + .3);
  return st;
}

/** Camera shake layer. update() returns a reused offset object: add it to the
 * camera position/FOV after the normal look math, never replace the camera. */
export function createCameraEffects() {
  const state = { trauma: 0, time: 0, x: 0, y: 0, z: 0, roll: 0, fov: 0 };
  const dip = { value: 0, velocity: 0 };
  const offsets = { x: 0, y: 0, z: 0, roll: 0, fov: 0 };
  let disposed = false;
  function reset() {
    state.trauma = 0; state.time = 0;
    state.x = state.y = state.z = state.roll = state.fov = 0;
    dip.value = dip.velocity = 0;
    offsets.x = offsets.y = offsets.z = offsets.roll = offsets.fov = 0;
  }
  return {
    /** Add impulse 0..1 (already scaled by the player's shake setting). */
    shake(power = 1) {
      if (disposed) return;
      state.trauma = clamp(state.trauma + Math.abs(Number(power) || 0), 0, 1);
      dip.velocity -= Math.abs(Number(power) || 0) * .35;
    },
    /** Advance one frame; returns a stable {x,y,z,roll,fov} object. */
    update(dt) {
      if (disposed) return offsets;
      stepShake(state, dt);
      springStep(dip, dt, 0);
      offsets.x = state.x;
      offsets.y = state.y + dip.value;
      offsets.z = state.z;
      offsets.roll = state.roll;
      offsets.fov = state.fov;
      return offsets;
    },
    reset,
    dispose() { if (disposed) return; disposed = true; reset(); },
  };
}

// One radial alpha mask for every particle: generated on a 2D canvas, never
// downloaded. Additive blending turns it into sparks, smoke or an explosion.
function createSoftTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.35, 'rgba(255,255,255,.72)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const IMPACTS = Object.freeze({
  spark: { count: 7, life: [.18, .34], speed: [1.2, 4.4], spread: .55, up: .55,
    gravity: 7, drag: 1.6, size: [.03, .15], alpha: .95, spin: 9, colors: [0xffd28a, 0xffab52, 0xfff1c9] },
  blood: { count: 6, life: [.22, .42], speed: [.7, 2.4], spread: .7, up: .45,
    gravity: 10, drag: 2.2, size: [.04, .16], alpha: .8, spin: 4, colors: [0xc0443a, 0x9a2f27, 0x621f19] },
  dust: { count: 4, life: [.32, .55], speed: [.25, .95], spread: .9, up: .5,
    gravity: .4, drag: 2.8, size: [.06, .2], alpha: .45, spin: 1, colors: [0xcbbda6, 0xa89b8a] },
});
const EXPLOSION = Object.freeze({
  flash: { count: 1, life: [.16, .24], speed: [0, 0], spread: 0, up: 0,
    gravity: 0, drag: 0, size: [1.1, 2.2], alpha: 1, spin: 2, colors: [0xfff0c4] },
  sparks: { count: 9, life: [.2, .5], speed: [2.4, 6.5], spread: .9, up: .8,
    gravity: 8, drag: 1.4, size: [.04, .22], alpha: .95, spin: 12, colors: [0xffd28a, 0xff8a34, 0xfff3c4] },
  smoke: { count: 7, life: [.7, 1.25], speed: [.5, 1.5], spread: .8, up: 1,
    gravity: -.45, drag: 1.6, size: [.28, 1.1], alpha: .34, spin: 1.5, colors: [0x4a4440, 0x6b635b, 0x2f2b28] },
});

/** Pooled world VFX. Call impact/explosion/dust from the simulation, update()
 * once per frame and dispose() with the world; nothing else is downloaded. */
export function createWorldEffects(scene) {
  if (!scene) throw new Error('createWorldEffects requires a scene');
  const POOL = 48;
  const texture = createSoftTexture();
  const group = new THREE.Group();
  group.name = 'YunlanPooledVFX';
  scene.add(group);
  const particles = [];
  let cursor = 0, disposed = false;
  for (let i = 0; i < POOL; i++) {
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.frustumCulled = false;
    group.add(sprite);
    particles.push({ sprite, material, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0,
      gravity: 0, drag: 0, size0: 0, size1: 0, alpha: 0, spin: 0 });
  }
  const stats = { pool: POOL, active: 0 };

  function spawn(x, y, z, config) {
    for (let i = 0; i < POOL; i++) {
      const p = particles[cursor];
      cursor = (cursor + 1) % POOL;
      if (p.life > 0) continue;
      const speed = rand(config.speed), theta = Math.random() * Math.PI * 2;
      p.maxLife = p.life = rand(config.life);
      p.vx = Math.cos(theta) * speed * config.spread;
      p.vz = Math.sin(theta) * speed * config.spread;
      p.vy = speed * (config.up * .55 + .18);
      p.gravity = config.gravity;
      p.drag = config.drag;
      p.size0 = config.size[0];
      p.size1 = config.size[1];
      p.alpha = config.alpha;
      p.spin = (Math.random() * 2 - 1) * config.spin;
      p.sprite.position.set(x, y, z);
      p.sprite.scale.setScalar(p.size0);
      p.sprite.visible = true;
      p.material.rotation = Math.random() * Math.PI;
      p.material.opacity = 0;
      p.material.color.setHex(config.colors[(Math.random() * config.colors.length) | 0]);
      return p;
    }
    return null;
  }

  function burst(config, point) {
    const x = Number(point?.x) || 0, y = Number(point?.y) || 0, z = Number(point?.z) || 0;
    for (let i = 0; i < config.count; i++) spawn(x, y, z, config);
  }

  return {
    /** point: {x,y,z}; kind: 'spark' | 'blood' | 'dust'. */
    impact(point, kind = 'spark') {
      if (disposed) return;
      burst(IMPACTS[kind] || IMPACTS.spark, point);
    },
    explosion(point) {
      if (disposed) return;
      burst(EXPLOSION.flash, point);
      burst(EXPLOSION.sparks, point);
      burst(EXPLOSION.smoke, point);
    },
    dust(point) {
      if (disposed) return;
      burst(IMPACTS.dust, point);
    },
    update(dt) {
      if (disposed) return;
      dt = clamp(Number(dt) || 0, 0, .1);
      let active = 0;
      for (const p of particles) {
        if (p.life <= 0) continue;
        p.life -= dt;
        const material = p.material;
        if (p.life <= 0) { material.opacity = 0; p.sprite.visible = false; continue; }
        const drag = Math.exp(-p.drag * dt);
        p.vx *= drag; p.vz *= drag;
        p.vy = (p.vy - p.gravity * dt) * drag;
        const sprite = p.sprite;
        sprite.position.x += p.vx * dt;
        sprite.position.y += p.vy * dt;
        sprite.position.z += p.vz * dt;
        const t = 1 - p.life / p.maxLife;
        sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * t);
        // Fade in over the first quarter of life, then out on a quadratic tail.
        material.opacity = p.alpha * Math.min(1, t * 8) * (1 - t) * (1 - t * .35);
        material.rotation += p.spin * dt;
        active++;
      }
      stats.active = active;
    },
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      for (const p of particles) p.material.dispose();
      particles.length = 0;
      texture?.dispose();
      group.clear();
    },
  };
}
