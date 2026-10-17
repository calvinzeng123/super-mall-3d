// Quality preferences are read before WebGL construction, so phones do not first
// allocate the expensive desktop shadow maps and postprocessing buffers.
export const QUALITY_STORAGE_KEY = 'yunlan.quality.v1';
export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({ label: '流畅', resolution: 0.85, shadows: false, shadowSize: 1024, bloom: false, crowdDensity: 0.22, maxFps: 30 }),
  balanced: Object.freeze({ label: '均衡', resolution: 1.25, shadows: true, shadowSize: 2048, bloom: false, crowdDensity: 0.55, maxFps: 45 }),
  high: Object.freeze({ label: '精细', resolution: 2, shadows: true, shadowSize: 4096, bloom: true, crowdDensity: 1, maxFps: 60 }),
});
const presets = ['auto', ...Object.keys(QUALITY_PRESETS)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function normalizeQuality(value) {
  const preset = presets.includes(value?.preset) ? value.preset : 'auto';
  const input = value?.overrides || {}, overrides = {};
  for (const key of ['shadows', 'bloom']) if (typeof input[key] === 'boolean') overrides[key] = input[key];
  if (Number.isFinite(input.resolution)) overrides.resolution = clamp(input.resolution, 0.65, 2);
  if (Number.isFinite(input.crowdDensity)) overrides.crowdDensity = clamp(input.crowdDensity, 0, 1);
  return { preset, overrides };
}

export function resolveQuality(preferences, { mobile = false, pixelRatio = 1, autoTier = mobile ? 'low' : 'high' } = {}) {
  const pref = normalizeQuality(preferences);
  const tier = pref.preset === 'auto' ? autoTier : pref.preset;
  const settings = { ...QUALITY_PRESETS[tier], ...pref.overrides };
  // Limit mobile high mode to 2048 shadows; texture/model detail is preserved.
  if (mobile) settings.shadowSize = Math.min(settings.shadowSize, 2048);
  return { ...settings, preset: pref.preset, tier,
    pixelRatio: Math.min(Math.max(0.65, pixelRatio || 1), settings.resolution),
    custom: Object.keys(pref.overrides).length > 0,
    automatic: pref.preset === 'auto' && !Object.keys(pref.overrides).length,
    autoReduced: pref.preset === 'auto' && autoTier !== (mobile ? 'low' : 'high') };
}

export function createQualityManager({ mobile = false, pixelRatio = 1, storage } = {}) {
  let pref;
  try { pref = normalizeQuality(JSON.parse(storage?.getItem(QUALITY_STORAGE_KEY) || 'null')); }
  catch { pref = normalizeQuality(null); }
  let autoTier = mobile ? 'low' : 'high';
  const listeners = new Set();
  const snapshot = () => resolveQuality(pref, { mobile, pixelRatio, autoTier });
  function change(persist) {
    if (persist) { try { storage?.setItem(QUALITY_STORAGE_KEY, JSON.stringify(pref)); } catch { /* Private browsing can disable storage. */ } }
    const result = snapshot();
    listeners.forEach(fn => fn(result));
    return result;
  }
  return {
    get current() { return snapshot(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    select(preset) {
      pref = normalizeQuality({ preset });
      autoTier = mobile ? 'low' : 'high';
      return change(true);
    },
    customize(patch) {
      pref = normalizeQuality({ ...pref, overrides: { ...pref.overrides, ...patch } });
      return change(true);
    },
    degrade() {
      // Explicit choices stay explicit. Only automatic mode can reduce itself.
      if (!snapshot().automatic || autoTier === 'low') return false;
      autoTier = autoTier === 'high' ? 'balanced' : 'low';
      change(false);
      return true;
    },
  };
}
