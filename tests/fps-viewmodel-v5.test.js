import test from 'node:test';
import assert from 'node:assert/strict';
import { dampValue, recoilOffset, knifeSwing, grenadeThrow, slideViewPose,
  RECOIL, KNIFE_SWING, GRENADE_THROW } from '../src/fps/viewmodel.js';

test('dampValue approaches a target frame-rate independently and stays bounded', () => {
  const once = dampValue(0, 1, .1, 12);
  const twice = dampValue(dampValue(0, 1, .05, 12), 1, .05, 12);
  assert.ok(Math.abs(once - twice) < 1e-9);
  assert.ok(once > .6 && once < .72);
  assert.equal(dampValue(3, 3, .1), 3);
  assert.equal(dampValue(0, 1, 0), 0);
  assert.ok(dampValue(0, 1, 1e6, 12) <= 1 + 1e-9);
  assert.ok(Number.isFinite(dampValue(0, 1, NaN, 12)));
  assert.ok(Number.isFinite(dampValue(0, 1, .1, 0)));
});

test('per-weapon recoil alternates horizontally, wraps and is damped by ADS', () => {
  const rifle0 = recoilOffset('rifle', 0, 0), rifle1 = recoilOffset('rifle', 1, 0);
  const pistol0 = recoilOffset('pistol', 0, 0);
  assert.ok(Object.keys(RECOIL).join() === 'rifle,pistol');
  assert.ok(pistol0.kick > rifle0.kick && pistol0.pitch > rifle0.pitch);
  assert.ok(rifle0.yaw > 0 && rifle1.yaw < 0, 'sustained fire sways left/right');
  assert.ok(rifle0.roll > 0 && rifle1.roll < 0);
  for (const [key, value] of Object.entries(rifle0)) {
    assert.ok(Number.isFinite(value));
    assert.ok(key === 'kick' ? value > 0 && value < 2 : Math.abs(value) < .06);
  }
  const ads = recoilOffset('rifle', 0, 1);
  assert.ok(ads.kick < rifle0.kick && ads.pitch < rifle0.pitch && ads.yaw < rifle0.yaw);
  assert.deepEqual(recoilOffset('rifle', 5), recoilOffset('rifle', 0));
  assert.deepEqual(recoilOffset(0), recoilOffset('rifle'));
  assert.deepEqual(recoilOffset(1), recoilOffset('pistol'));
  assert.deepEqual(recoilOffset('pistol', -3), recoilOffset('pistol', 3));
  assert.ok(KNIFE_SWING.duration > 0 && GRENADE_THROW.duration > 0);
});

test('knife swing starts and ends at rest with a fast cross-screen arc', () => {
  const rest = knifeSwing(0);
  assert.ok(Object.values(rest).every(v => Math.abs(v) < 1e-9));
  assert.ok(Object.values(knifeSwing(1)).every(v => Math.abs(v) < 1e-9));
  const arc = knifeSwing(KNIFE_SWING.impactAt);
  assert.ok(Math.abs(arc.ry) > .8, 'blade sweeps across the view');
  assert.ok(Math.abs(arc.rx) > .3 && arc.z < -.05, 'blade drives forward');
  for (let t = 0; t <= 1; t += .05) {
    const pose = knifeSwing(t);
    assert.deepEqual(Object.keys(pose).sort(), ['rx', 'ry', 'rz', 'x', 'y', 'z']);
    for (const value of Object.values(pose)) assert.ok(Number.isFinite(value) && Math.abs(value) < 1.5);
  }
  assert.deepEqual(knifeSwing(-2), knifeSwing(0));
  assert.deepEqual(knifeSwing(4), knifeSwing(1));
});

test('grenade throw raises the hand, releases mid-arc and returns to rest', () => {
  assert.ok(Object.values(grenadeThrow(0)).every((value, index) => index === 6 ? value === 0 : Math.abs(value) < 1e-9));
  const rest = grenadeThrow(1);
  assert.equal(rest.release, 1);
  assert.ok(Object.entries(rest).every(([key, value]) => key === 'release' || Math.abs(value) < 1e-9));
  const windup = grenadeThrow(.2);
  assert.ok(windup.y > .05, 'the throwing hand lifts before the toss');
  assert.equal(grenadeThrow(GRENADE_THROW.releaseAt).release, 0);
  assert.ok(grenadeThrow(.58).release > .3, 'grenade leaves the hand before the toss ends');
  for (let t = 0; t <= 1; t += .05) {
    for (const value of Object.values(grenadeThrow(t))) assert.ok(Number.isFinite(value));
  }
});

test('slide view pose is zero at rest and cants the weapon through the slide', () => {
  const none = slideViewPose(0, .5);
  assert.ok(Object.values(none).every(value => Math.abs(value) < 1e-9));
  const slide = slideViewPose(1, .5);
  assert.ok(slide.y < -.03 && slide.rz < -.05 && slide.ry > .05);
  for (const value of Object.values(slide)) assert.ok(Number.isFinite(value) && Math.abs(value) < .3);
  assert.ok(Math.abs(slideViewPose(.5, .5).y) < Math.abs(slide.y), 'blend scales the pose');
  assert.ok(Math.abs(slideViewPose(1, 0).y) < Math.abs(slide.y), 'pose eases in');
});
