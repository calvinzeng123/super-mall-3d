// 画质档位（首页菜单「设置 → 画质」）：漫游（含小游戏）存在 yunlan.quality.v1 的 preset，FPS 存在原游戏的 saltline.settings.v1 的 quality。
// 菜单里选一档，两边一起改（进去后各自的「设置」还能细调，那边改了以那边为准）；开场场景也按这一档降分辨率、Bloom、丧尸数、雨量、景深。
// 原来在 src/cover-options.js（旧封面），旧封面删掉后搬到这里，存储的 key 不变。纯数据 + 纯函数，node 里能测。
import { QUALITY_STORAGE_KEY } from '../render/quality.js';

export const COVER_TIERS = Object.freeze([
  Object.freeze({ id: 'auto', label: '自动', note: '按设备自动定档（手机默认省内存）' }),
  Object.freeze({ id: 'low', label: '流畅', note: '最省内存，老手机、平板用这档' }),
  Object.freeze({ id: 'balanced', label: '均衡', note: '阴影开、贴图适中' }),
  Object.freeze({ id: 'high', label: '精细', note: '电脑推荐' }),
  Object.freeze({ id: 'ultra', label: '极致', note: '高端显卡；手机容易被系统回收' }),
]);
export const FPS_SETTINGS_KEY = 'saltline.settings.v1';
const TIER_TO_FPS = Object.freeze({ auto: 'auto', low: 'low', balanced: 'medium', high: 'high', ultra: 'ultra' });

/** 现在的档位（以漫游的为准；漫游没存过、FPS 存过就用 FPS 的） */
export function readCoverTier(storage) {
  try {
    const p = JSON.parse(storage?.getItem(QUALITY_STORAGE_KEY) || 'null')?.preset;
    if (TIER_TO_FPS[p] && p !== 'auto') return p;
    const q = JSON.parse(storage?.getItem(FPS_SETTINGS_KEY) || 'null')?.quality;
    const back = Object.entries(TIER_TO_FPS).find(([, v]) => v === q)?.[0];
    return back || 'auto';
  } catch { return 'auto'; }
}

/** 选一档：两边一起写；FPS 那份只改 quality，别的设置（灵敏度、音量…）原样留着。存不了（无痕模式）返回 false */
export function writeCoverTier(storage, tier) {
  if (!TIER_TO_FPS[tier]) return false;
  try {
    storage.setItem(QUALITY_STORAGE_KEY, JSON.stringify({ preset: tier, overrides: {} }));
    let fps = {};
    try { const v = JSON.parse(storage.getItem(FPS_SETTINGS_KEY) || 'null'); if (v && typeof v === 'object') fps = v; } catch { fps = {}; }
    storage.setItem(FPS_SETTINGS_KEY, JSON.stringify({ ...fps, quality: TIER_TO_FPS[tier] }));
    return true;
  } catch { return false; }
}
