import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobility, tickMobility, startSlide, movementPose, MOBILITY, SLIDE } from '../src/fps/mobility.js';

test('slide state exists on a fresh mobility and only starts from a grounded sprint', () => {
  const m = createMobility();
  assert.equal(m.sliding, false);
  assert.equal(m.slide, 0);
  assert.equal(m.slideProgress, 0);
  assert.equal(m.slideCooldown, 0);
  assert.equal(startSlide(m, { grounded: false }), false);
  assert.equal(startSlide(m, { sprinting: false }), false);
  assert.equal(startSlide(m, { aiming: true }), false);
  const airborne = createMobility();
  airborne.height = .4;
  assert.equal(startSlide(airborne), false);
  assert.equal(m.sliding, false);
  assert.equal(startSlide(m, { crouch: true }), true);
  assert.equal(m.sliding, true);
  assert.equal(m.slide, SLIDE.duration);
  assert.equal(m.slideProgress, 0);
  assert.equal(m.slideCooldown, SLIDE.cooldown);
  assert.equal(m.sprinting, false);
  assert.equal(startSlide(m), false, 'cannot re-enter during the slide');
});

test('slide speed eases from the burst speed down to a walk, monotonically', () => {
  const m = createMobility();
  assert.equal(startSlide(m), true);
  const first = tickMobility(m, .04, { moving: true });
  assert.equal(first.sliding, true);
  assert.ok(first.speed > MOBILITY.walk + 4, 'burst starts near MOBILITY.slide');
  let previous = first.speed, steps = 1;
  while (m.sliding && steps < 40) {
    const result = tickMobility(m, .04, { moving: true });
    assert.ok(result.speed <= previous + 1e-9, 'speed curve never rises');
    assert.ok(result.speed >= MOBILITY.walk - 1e-9, 'never slower than a walk');
    previous = result.speed;
    steps++;
  }
  assert.equal(m.sliding, false);
  assert.equal(m.slideProgress, 1);
  assert.equal(tickMobility(m, .04, { moving: true }).speed, MOBILITY.walk);
  assert.ok(SLIDE.speed === MOBILITY.slide && SLIDE.speed === 9);
});

test('slide drains a little stamina, blocks sprint and gates re-entry until the cooldown ends', () => {
  const m = createMobility();
  assert.equal(startSlide(m), true);
  tickMobility(m, .05, { moving: true, sprint: true });
  assert.equal(m.sprinting, false);
  const drained = 100 - m.stamina;
  assert.ok(drained > 0 && drained < 2, 'slide costs less stamina than a sprint tick');
  for (let i = 0; i < 20 && m.sliding; i++) tickMobility(m, .05, { moving: true });
  assert.equal(m.sliding, false);
  assert.ok(m.slideCooldown > 0, 'cooldown is still running right after the slide');
  assert.equal(startSlide(m), false);
  for (let i = 0; i < 30; i++) tickMobility(m, .05, { moving: false });
  assert.equal(m.slideCooldown, 0);
  assert.equal(startSlide(m), true);
});

test('movementPose keeps an idle body at zero and adds a bounded slide pose', () => {
  const idle = movementPose(1, { moving: 0 });
  assert.ok(Object.values(idle).every(v => Math.abs(v) < 1e-9));
  assert.ok(Object.values(movementPose(1, {})).every(v => Math.abs(v) < 1e-9));
  const entry = movementPose(1, { sliding: 1, slideProgress: 0 });
  assert.ok(Object.values(entry).every(v => Math.abs(v) < 1e-9), 'slide pose eases in');
  const slide = movementPose(1, { sliding: 1, slideProgress: .5 });
  assert.ok(slide.y < -.15, 'body drops toward the ground');
  assert.ok(slide.rx < -.1, 'torso leans back');
  assert.ok(Math.abs(slide.ry) > .1, 'shoulders turn through the slide');
  assert.ok(slide.z > .02, 'weight shifts backward');
  for (const value of Object.values(slide)) assert.ok(Number.isFinite(value) && Math.abs(value) < 1);
  const half = movementPose(1, { sliding: .5, slideProgress: .5 });
  assert.ok(Math.abs(half.y) < Math.abs(slide.y), 'blend scales the pose');
  // The slide pose never leaks into the existing sprint pose defaults.
  const run = movementPose(1, { moving: 1, sprint: 1 });
  assert.ok(Math.abs(run.rz) > .45);
});
