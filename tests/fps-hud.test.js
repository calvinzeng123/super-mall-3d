import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeControlSettings, clampControlPosition } from '../src/fps/hud.js';

test('FPS control defaults are valid without browser storage', () => {
  const defaults = normalizeControlSettings(null);
  assert.equal(defaults.scale, 1);
  assert.equal(defaults.opacity, .78);
  assert.equal(defaults.sensitivity, 1);
  assert.equal(defaults.invertY, false);
  assert.deepEqual(defaults.positions, { portrait: {}, landscape: {} });
});

test('corrupt saved settings cannot create invisible controls or extreme aim', () => {
  const settings = normalizeControlSettings({ scale: Infinity, opacity: -99, sensitivity: 99, invertY: 'true', positions: { portrait: { fire: { x: 9, y: -4 }, reload: { x: NaN, y: .5 }, unknown: { x: .5, y: .5 } } } });
  assert.equal(settings.scale, 1);
  assert.equal(settings.opacity, .3);
  assert.equal(settings.sensitivity, 2.5);
  assert.equal(settings.invertY, false);
  assert.deepEqual(settings.positions.portrait, { fire: { x: 1, y: 0 } });
});

test('portrait and landscape layouts remain separate, copied settings do not alias', () => {
  const source = { positions: { portrait: { fire: { x: .8, y: .7 } }, landscape: { fire: { x: .9, y: .5 } } } };
  const settings = normalizeControlSettings(source);
  settings.positions.portrait.fire.x = .2;
  assert.equal(source.positions.portrait.fire.x, .8);
  assert.equal(settings.positions.landscape.fire.x, .9);
});

test('dragging a control to an edge keeps the whole touch target within the arena', () => {
  for (const [width, height] of [[375, 667], [667, 375], [430, 932], [932, 430]]) {
    for (const input of [{ x: -1, y: -1 }, { x: 2, y: 2 }, { x: .5, y: .5 }]) {
      const size = { width: 100, height: 72 };
      const point = clampControlPosition(input, width, height, size);
      assert.ok(point.x * width - size.width / 2 >= 3.99);
      assert.ok(point.y * height - size.height / 2 >= 3.99);
      assert.ok(point.x * width + size.width / 2 <= width - 3.99);
      assert.ok(point.y * height + size.height / 2 <= height - 3.99);
    }
  }
});

test('temporarily collapsed viewport cannot produce NaN control positions', () => {
  assert.deepEqual(clampControlPosition({ x: NaN, y: Infinity }, 0, 0, 100), { x: .5, y: .5 });
});
