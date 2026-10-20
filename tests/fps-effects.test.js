import test from 'node:test';
import assert from 'node:assert/strict';
import { springStep, stepShake, createCameraEffects, SHAKE } from '../src/fps/effects.js';

const offsets = state => ({ x: state.x, y: state.y, z: state.z, roll: state.roll, fov: state.fov });
const assertZero = (object, message) =>
  assert.ok(Object.values(object).every(value => Math.abs(value) < 1e-9), message);

test('springStep is deterministic, stable on slow frames and settles on its target', () => {
  const a = { value: 1, velocity: 0 }, b = { value: 1, velocity: 0 };
  for (let i = 0; i < 120; i++) {
    springStep(a, 1 / 30);
    springStep(b, 1 / 30);
    assert.equal(a.value, b.value);
    assert.ok(Number.isFinite(a.value) && Number.isFinite(a.velocity));
  }
  assert.ok(Math.abs(a.value) < 1e-3);
  assert.ok(Math.abs(a.velocity) < .1);
  // A paused-tab style dt is clamped instead of exploding the spring.
  const slow = { value: 0, velocity: 0 };
  for (let i = 0; i < 80; i++) springStep(slow, .1, 1);
  assert.ok(Number.isFinite(slow.value) && Math.abs(slow.value - 1) < .1);
  // Zero dt never changes state; custom stiffness is honoured.
  const still = { value: .4, velocity: 0 };
  springStep(still, 0);
  assert.deepEqual(still, { value: .4, velocity: 0 });
});

test('shake offsets are deterministic, bounded by their tuning and decay to rest', () => {
  const a = { trauma: 1, time: 0 }, b = { trauma: 1, time: 0 };
  for (let i = 0; i < 12; i++) {
    stepShake(a, 1 / 60);
    stepShake(b, 1 / 60);
    assert.deepEqual(offsets(a), offsets(b), 'no randomness in the shake basis');
    assert.ok(Math.abs(a.x) <= SHAKE.sway);
    assert.ok(Math.abs(a.y) <= SHAKE.sway * 1.5);
    assert.ok(Math.abs(a.z) <= SHAKE.sway);
    assert.ok(Math.abs(a.roll) <= SHAKE.sway * 1.5);
    assert.ok(Math.abs(a.fov) <= SHAKE.fov);
  }
  for (let i = 0; i < 180; i++) stepShake(a, 1 / 60);
  assert.equal(a.trauma, 0);
  assert.ok(Object.values(offsets(a)).every(value => Math.abs(value) < 1e-9));
  const calm = { trauma: 0, time: 0 };
  stepShake(calm, 1 / 60);
  assert.ok(Object.values(offsets(calm)).every(value => value === 0));
});

test('createCameraEffects reuses its offsets, shakes deterministically and resets', () => {
  const probe = createCameraEffects();
  const idle = probe.update(1 / 60);
  assertZero(idle, 'idle camera shake is at rest');
  assert.equal(probe.update(1 / 60), idle, 'offset object is reused (no per-frame allocation)');
  const first = createCameraEffects(), second = createCameraEffects();
  first.shake(1);
  second.shake(1);
  let moved = 0;
  for (let i = 0; i < 8; i++) {
    const a = first.update(1 / 60), b = second.update(1 / 60);
    assert.deepEqual({ ...a }, { ...b });
    for (const value of Object.values(a)) assert.ok(Number.isFinite(value));
    moved += Math.abs(a.x) + Math.abs(a.y) + Math.abs(a.roll);
  }
  assert.ok(moved > .01, 'a full-power shake produces visible offsets');
  first.reset();
  assertZero(first.update(1 / 60), 'reset clears every offset');
  first.dispose();
  first.shake(1);
  assertZero(first.update(1 / 60), 'a disposed layer is inert');
});
