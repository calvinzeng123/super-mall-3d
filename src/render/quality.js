// Quality preferences are read before WebGL construction, so phones do not first
// allocate the expensive desktop shadow maps and postprocessing buffers.
export const QUALITY_STORAGE_KEY = 'yunlan.quality.v1';
/**
 * 四个档位。各项的含义：
 *   resolution    画面清晰度（像素比的上限）
 *   maxFps        帧率上限
 *   shadows       太阳阴影开关；shadowSize 是阴影贴图的边长
 *   bloom         夜景柔光（夜里灯光边缘的泛光）
 *   hdr           HDR 光影：用真实天空的 HDR 图做环境光和反射，换成保色的色调映射，地面、金属、玻璃更反光
 *   dayBloom      白天的高光柔光（只在 hdr 开着时起作用）：阳光下的高光、灯具会溢出一点光
 *   ao            环境光遮蔽（只在 hdr 开着时起作用）：墙角、家具脚下、物体交接处自然变暗（屏幕空间计算，比较吃显卡）
 *   indoorLights  室内实时灯光的盏数：商场走道和社区住宅里，离你最近的几盏灯真的照亮周围（0 是不开）
 *   textures      贴图清晰度：standard 是 8 倍各向异性过滤，high 用到显卡支持的上限（最多 16 倍），斜着看地面更清楚
 *   detail        模型细节：贴图小模型在多远以内用精细版、多远以外不画
 *   decals        贴地阴影和光斑（贴图做的假阴影、灯下的光斑，几乎不花性能）
 *   crowdDensity  人群密度
 */
export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({ label: '流畅', resolution: 0.85, shadows: false, shadowSize: 1024, bloom: false, hdr: false, dayBloom: false, ao: false,
    indoorLights: 0, textures: 'standard', detail: 'low', decals: true, crowdDensity: 0.22, maxFps: 30 }),
  balanced: Object.freeze({ label: '均衡', resolution: 1.25, shadows: true, shadowSize: 2048, bloom: false, hdr: false, dayBloom: false, ao: false,
    indoorLights: 0, textures: 'standard', detail: 'balanced', decals: true, crowdDensity: 0.55, maxFps: 45 }),
  high: Object.freeze({ label: '精细', resolution: 2, shadows: true, shadowSize: 4096, bloom: true, hdr: true, dayBloom: false, ao: false,
    indoorLights: 0, textures: 'high', detail: 'high', decals: true, crowdDensity: 1, maxFps: 60 }),
  ultra: Object.freeze({ label: '极致', resolution: 2, shadows: true, shadowSize: 4096, bloom: true, hdr: true, dayBloom: true, ao: true,
    indoorLights: 8, textures: 'high', detail: 'high', decals: true, crowdDensity: 1, maxFps: 60 }),
});
const presets = ['auto', ...Object.keys(QUALITY_PRESETS)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
/** 可以单独微调的开关项和可选值。 */
export const QUALITY_SWITCHES = Object.freeze(['shadows', 'bloom', 'hdr', 'dayBloom', 'ao', 'decals']);
export const QUALITY_CHOICES = Object.freeze({
  shadowSize: Object.freeze([1024, 2048, 4096]), indoorLights: Object.freeze([0, 4, 8]), maxFps: Object.freeze([30, 45, 60]),
  textures: Object.freeze(['standard', 'high']), detail: Object.freeze(['low', 'balanced', 'high']),
});

export function normalizeQuality(value) {
  const preset = presets.includes(value?.preset) ? value.preset : 'auto';
  const input = value?.overrides || {}, overrides = {};
  for (const key of QUALITY_SWITCHES) if (typeof input[key] === 'boolean') overrides[key] = input[key];
  for (const [key, allowed] of Object.entries(QUALITY_CHOICES)) if (allowed.includes(input[key])) overrides[key] = input[key];
  if (Number.isFinite(input.resolution)) overrides.resolution = clamp(input.resolution, 0.65, 2);
  if (Number.isFinite(input.crowdDensity)) overrides.crowdDensity = clamp(input.crowdDensity, 0, 1);
  return { preset, overrides };
}

export function resolveQuality(preferences, { mobile = false, pixelRatio = 1, autoTier = mobile ? 'low' : 'high' } = {}) {
  const pref = normalizeQuality(preferences);
  const tier = pref.preset === 'auto' ? autoTier : pref.preset;
  const settings = { ...QUALITY_PRESETS[tier], ...pref.overrides };
  // Limit mobile high mode to 2048 shadows; texture/model detail is preserved.
  // 手机上室内实时灯光最多 4 盏。
  if (mobile) { settings.shadowSize = Math.min(settings.shadowSize, 2048); settings.indoorLights = Math.min(settings.indoorLights, 4); }
  // 环境光遮蔽和白天的高光柔光都在 HDR 管线里做：HDR 光影关着，这两项不起作用
  if (!settings.hdr) settings.dayBloom = settings.ao = false;
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
