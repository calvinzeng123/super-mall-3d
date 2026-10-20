import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FPS_CONTROL_STORAGE_KEY, FPS_SETTINGS_STORAGE_KEY,
  CONTROL_KEYS, CONTROL_ARENA_INSETS, SETTINGS_SECTIONS,
  normalizeControlSettings, loadControlSettings, saveControlSettings,
  clampControlPosition, controlButtonSize, layoutControlDefaults,
} from '../src/fps/hud.js';

/** Minimal localStorage stand-in: the HUD never touches a real browser here. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
  };
}

test('settings v2 keeps the v1 defaults exact and adds safe v5 defaults', () => {
  const defaults = normalizeControlSettings(null);
  assert.equal(defaults.scale, 1);
  assert.equal(defaults.opacity, .78);
  assert.equal(defaults.sensitivity, 1);
  assert.equal(defaults.invertY, false);
  assert.deepEqual(defaults.positions, { portrait: {}, landscape: {} });
  assert.equal(defaults.deadzone, .12);
  assert.equal(defaults.aimAssist, true);
  assert.equal(defaults.crosshair, 'cross');
  assert.equal(defaults.crosshairColor, 'amber');
  assert.equal(defaults.crosshairSize, 1);
  assert.equal(defaults.hudScale, 1);
  for (const key of ['killfeed', 'compass', 'hints', 'damageIndicators', 'lowHpVignette']) assert.equal(defaults[key], true, key);
  assert.equal(defaults.shake, 1);
  assert.equal(defaults.masterVolume, .8);
  assert.equal(defaults.sfxVolume, .9);
});

test('new v5 settings clamp instead of trusting corrupt saves', () => {
  const settings = normalizeControlSettings({
    deadzone: 9, crosshair: 'triangle', crosshairColor: 'pink', crosshairSize: -3,
    hudScale: 99, shake: -1, masterVolume: 'loud', sfxVolume: 2,
    aimAssist: 'yes', killfeed: 'no', compass: 0, hints: null, damageIndicators: 'true',
    lowHpVignette: false,
  });
  assert.equal(settings.deadzone, .4);
  assert.equal(settings.crosshair, 'cross');
  assert.equal(settings.crosshairColor, 'amber');
  assert.equal(settings.crosshairSize, .5);
  assert.equal(settings.hudScale, 1.3);
  assert.equal(settings.shake, 0);
  assert.equal(settings.masterVolume, .8);
  assert.equal(settings.sfxVolume, 1);
  assert.equal(settings.aimAssist, true);
  assert.equal(settings.killfeed, true);
  assert.equal(settings.compass, true);
  assert.equal(settings.hints, true);
  assert.equal(settings.damageIndicators, true);
  assert.equal(settings.lowHpVignette, false);
});

test('valid v5 enums/booleans survive a round trip and unknown keys are dropped', () => {
  const settings = normalizeControlSettings({
    crosshair: 'circle', crosshairColor: 'mint', aimAssist: false, killfeed: false, hints: false,
    compass: false, damageIndicators: false, lowHpVignette: false,
    deadzone: .24, hudScale: .9, shake: 1.25, masterVolume: .35, sfxVolume: .55, crosshairSize: 1.6,
    brightness: 42, cheat: true,
  });
  assert.equal(settings.crosshair, 'circle');
  assert.equal(settings.crosshairColor, 'mint');
  assert.equal(settings.aimAssist, false);
  assert.equal(settings.killfeed, false);
  assert.equal(settings.compass, false);
  assert.equal(settings.hints, false);
  assert.equal(settings.damageIndicators, false);
  assert.equal(settings.lowHpVignette, false);
  assert.equal(settings.deadzone, .24);
  assert.equal(settings.hudScale, .9);
  assert.equal(settings.shake, 1.25);
  assert.equal(settings.masterVolume, .35);
  assert.equal(settings.sfxVolume, .55);
  assert.equal(settings.crosshairSize, 1.6);
  assert.equal(settings.brightness, undefined);
  assert.equal(settings.cheat, undefined);
});

test('melee and grenade join the draggable controls while old layouts still normalise', () => {
  assert.ok(CONTROL_KEYS.includes('melee'));
  assert.ok(CONTROL_KEYS.includes('grenade'));
  const legacy = normalizeControlSettings({
    positions: { portrait: { fire: { x: .8, y: .8 }, melee: { x: .9, y: .2 } }, landscape: { grenade: { x: .1, y: .1 } } },
  });
  assert.deepEqual(legacy.positions.portrait.fire, { x: .8, y: .8 });
  assert.deepEqual(legacy.positions.portrait.melee, { x: .9, y: .2 });
  assert.deepEqual(legacy.positions.landscape.grenade, { x: .1, y: .1 });
  assert.deepEqual(legacy.positions.landscape, { grenade: { x: .1, y: .1 } });
  // Out-of-range custom spots are clamped, not rejected.
  const clamped = normalizeControlSettings({ positions: { portrait: { grenade: { x: 4, y: -2 } } } });
  assert.deepEqual(clamped.positions.portrait.grenade, { x: 1, y: 0 });
});

test('v1 control storage migrates into v2 and keeps player layout', () => {
  const storage = fakeStorage({ [FPS_CONTROL_STORAGE_KEY]: JSON.stringify({
    scale: 1.2, opacity: .6, sensitivity: 1.8, invertY: true,
    positions: { landscape: { fire: { x: .88, y: .55 } } },
  }) });
  const settings = loadControlSettings(storage);
  assert.equal(settings.scale, 1.2);
  assert.equal(settings.opacity, .6);
  assert.equal(settings.sensitivity, 1.8);
  assert.equal(settings.invertY, true);
  assert.deepEqual(settings.positions.landscape.fire, { x: .88, y: .55 });
  // v5 fields come from defaults, and the upgraded blob is persisted under v2.
  assert.equal(settings.crosshair, 'cross');
  assert.equal(settings.masterVolume, .8);
  assert.ok(storage.getItem(FPS_SETTINGS_STORAGE_KEY));
  assert.equal(JSON.parse(storage.getItem(FPS_SETTINGS_STORAGE_KEY)).sensitivity, 1.8);
});

test('v2 storage wins over v1, corrupt JSON falls back to defaults, saving normalises', () => {
  const storage = fakeStorage({
    [FPS_CONTROL_STORAGE_KEY]: JSON.stringify({ sensitivity: 2.4 }),
    [FPS_SETTINGS_STORAGE_KEY]: JSON.stringify({ sensitivity: .7, crosshair: 'dot' }),
  });
  const settings = loadControlSettings(storage);
  assert.equal(settings.sensitivity, .7);
  assert.equal(settings.crosshair, 'dot');

  const corrupt = fakeStorage({ [FPS_SETTINGS_STORAGE_KEY]: '{broken' });
  assert.equal(loadControlSettings(corrupt).sensitivity, 1);

  assert.equal(loadControlSettings(null).scale, 1);
  const target = fakeStorage();
  assert.equal(saveControlSettings(target, { sensitivity: 99, positions: { portrait: { fire: { x: 2, y: 2 } } } }), true);
  const saved = JSON.parse(target.getItem(FPS_SETTINGS_STORAGE_KEY));
  assert.equal(saved.sensitivity, 2.5);
  assert.deepEqual(saved.positions.portrait.fire, { x: 1, y: 1 });
  // Private-mode storage that throws never crashes the HUD.
  assert.equal(saveControlSettings({ setItem() { throw new Error('denied'); } }, {}), false);
  assert.deepEqual(loadControlSettings({ getItem() { throw new Error('denied'); } }), normalizeControlSettings());
});

test('settings section map covers every tunable v5 field exactly once', () => {
  const grouped = Object.values(SETTINGS_SECTIONS).flat();
  assert.equal(new Set(grouped).size, grouped.length);
  const defaults = normalizeControlSettings();
  for (const key of grouped) assert.notEqual(defaults[key], undefined, key);
  for (const group of ['ops', 'hud', 'display', 'audio', 'assist']) assert.ok(Array.isArray(SETTINGS_SECTIONS[group]));
});

test('default layouts keep every control inside the arena and non-overlapping at 140%', () => {
  const viewports = [[375, 667, 'portrait'], [667, 375, 'landscape'], [430, 932, 'portrait'], [932, 430, 'landscape']];
  for (const [viewportWidth, viewportHeight, orientation] of viewports) {
    const width = viewportWidth - CONTROL_ARENA_INSETS.left - CONTROL_ARENA_INSETS.right;
    const height = viewportHeight - CONTROL_ARENA_INSETS.top - CONTROL_ARENA_INSETS.bottom;
    const positions = layoutControlDefaults(orientation, width, height, 1.4);
    assert.deepEqual(Object.keys(positions).sort(), [...CONTROL_KEYS].sort(), `${viewportWidth}x${viewportHeight}`);
    const radius = Object.fromEntries(CONTROL_KEYS.map(key => [key, controlButtonSize(key, 1.4) / 2]));
    for (const key of CONTROL_KEYS) {
      const point = positions[key];
      assert.ok(point.x >= 0 && point.x <= 1 && Number.isFinite(point.y), `${key} fraction`);
      const x = point.x * width, y = point.y * height;
      assert.ok(x - radius[key] >= 3.5, `${key} left edge ${viewportWidth}x${viewportHeight}`);
      assert.ok(y - radius[key] >= 3.5, `${key} top edge ${viewportWidth}x${viewportHeight}`);
      assert.ok(x + radius[key] <= width - 3.5, `${key} right edge ${viewportWidth}x${viewportHeight}`);
      assert.ok(y + radius[key] <= height - 3.5, `${key} bottom edge ${viewportWidth}x${viewportHeight}`);
    }
    for (let i = 0; i < CONTROL_KEYS.length; i += 1) {
      for (let j = i + 1; j < CONTROL_KEYS.length; j += 1) {
        const a = CONTROL_KEYS[i], b = CONTROL_KEYS[j];
        const dx = (positions[a].x - positions[b].x) * width;
        const dy = (positions[a].y - positions[b].y) * height;
        const distance = Math.hypot(dx, dy);
        assert.ok(distance >= radius[a] + radius[b],
          `${a}/${b} overlap at ${viewportWidth}x${viewportHeight}: ${distance.toFixed(1)} < ${(radius[a] + radius[b]).toFixed(1)}`);
      }
    }
  }
});

test('layout defaults are deterministic, orientation-specific and safe at every scale', () => {
  const portrait = layoutControlDefaults('portrait', 355, 654, 1);
  const landscape = layoutControlDefaults('landscape', 647, 362, 1);
  assert.deepEqual(portrait, layoutControlDefaults('portrait', 355, 654, 1));
  assert.notDeepEqual(portrait, landscape);
  for (const scale of [.8, 1, 1.2, 1.4]) {
    const positions = layoutControlDefaults('portrait', 355, 654, scale);
    for (const key of CONTROL_KEYS) {
      assert.ok(Number.isFinite(positions[key].x) && Number.isFinite(positions[key].y), `${key}@${scale}`);
    }
  }
  const collapsed = layoutControlDefaults('landscape', 0, 0, 1.4);
  for (const key of CONTROL_KEYS) assert.ok(Number.isFinite(collapsed[key].x) && Number.isFinite(collapsed[key].y));
});

test('control sizing matches the CSS footprint rules for the layout editor', () => {
  assert.equal(controlButtonSize('fire', 1), 72);
  assert.equal(controlButtonSize('move', 1), 108);
  assert.equal(controlButtonSize('melee', 1), 52);
  assert.equal(controlButtonSize('fire', 1.4), 100.8);
  // 44px is the minimum touch target regardless of the scale slider.
  assert.equal(controlButtonSize('reload', .8), 44);
  assert.equal(controlButtonSize('reload', 99), 72.8);
  assert.equal(controlButtonSize('reload', NaN), 52);
});

test('clampControlPosition keeps legacy behaviour for the editor drag maths', () => {
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
  assert.deepEqual(clampControlPosition({ x: NaN, y: Infinity }, 0, 0, 100), { x: .5, y: .5 });
});
