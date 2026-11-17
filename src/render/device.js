// 设备档位：手机、平板（含伪装成 Mac 的 iPadOS）走低内存配置——贴图减半、阴影 2048、像素比 ≤1.5。
// iOS 会直接结束内存超限的网页进程（表现为整页"出错了"），所以这里宁可保守。
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
const touchMac = /Macintosh/.test(ua) && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 1;

export const MOBILE = /iPhone|iPad|iPod|Android/i.test(ua) || touchMac;

// 这台设备最近一次「显示资源被系统回收」（WebGL 上下文丢失，多半是显存不够）的时间。7 天内再打开就走省显存档。
const LOSS_KEY = 'yunlan-context-lost';
const LOSS_DAYS = 7;
const LOSS_COUNT_KEY = 'yunlan-context-lost-n';
function readLoss() {
  try {
    const t = Number(globalThis.localStorage?.getItem(LOSS_KEY));
    return Number.isFinite(t) && t > 0 && Date.now() - t < LOSS_DAYS * 864e5;
  } catch { return false; }
}
function readLossCount() {
  try { return readLoss() ? Math.max(1, Number(globalThis.localStorage?.getItem(LOSS_COUNT_KEY)) || 1) : 0; } catch { return 0; }
}
/** 上次在这台设备上显存不够、被回收过 */
export const AFTER_CONTEXT_LOSS = readLoss();
/** 7 天内被回收过几次：一次降一档，两次以上直接用最省的一档 */
export const CONTEXT_LOSSES = readLossCount();
/** 省显存档：手机、平板，或上次被回收过的电脑——画质自动档从「流畅」起、楼层细节少留几层、
 * 装饰性的小几何（垂藤、小花、绿墙叶团）不做。 */
export const LITE = MOBILE || AFTER_CONTEXT_LOSS;
/** 记一笔：显示资源被回收了，下次打开走省显存档 */
export function markContextLoss() {
  try {
    globalThis.localStorage?.setItem(LOSS_COUNT_KEY, String(readLossCount() + 1));
    globalThis.localStorage?.setItem(LOSS_KEY, String(Date.now()));
  } catch { /* 隐私模式存不了就算了 */ }
}
// ---------------------------------------------------------------------------------------------------------
// 内存档位：贴图多大、装饰性的几何做不做、楼层细节留几层，跟着画质档位走（进入某个模式时由 configureMemory 定下来）。
//   compact   省内存：手机的「流畅 / 自动」、被系统回收过显存以后。贴图再缩一档、材质只留颜色贴图、
//             天花分格梁 / 车库梁 / 城市背景楼的窗格这类装饰几何不做、楼层细节只留 2 层、顶点坐标压成 16 位。
//   standard  手机的「均衡」，或被回收过一次的电脑：贴图半边长（以前手机一律是这一档）。
//   rich      手机的「精细 / 极致」：招牌、导向牌这些程序化贴图 0.75 倍，材质颜色贴图 1024。
//   full      电脑：原始大小。
// 贴图大小是加载时定的，改画质以后要重新进入才换（memory-notice.js 会提示）。
export const MEMORY_PROFILES = Object.freeze({
  compact: Object.freeze({ name: 'compact', label: '省内存', texScale: 0.35, pbrSize: 256, pbrColorSize: 256, pbrMaps: 'color', modelTex: 256, propShift: 2, floors: 2, decor: false, lite: true, packPositions: true }),
  standard: Object.freeze({ name: 'standard', label: '标准', texScale: 0.5, pbrSize: 512, pbrColorSize: 512, pbrMaps: 'all', modelTex: 512, propShift: 1, floors: 4, decor: true, lite: true }),
  rich: Object.freeze({ name: 'rich', label: '高清贴图', texScale: 0.75, pbrSize: 512, pbrColorSize: 1024, pbrMaps: 'all', modelTex: 512, propShift: 1, floors: 4, decor: true, lite: true }),
  full: Object.freeze({ name: 'full', label: '原始大小', texScale: 1, pbrSize: Infinity, pbrColorSize: Infinity, pbrMaps: 'all', modelTex: Infinity, propShift: 0, floors: 6, decor: true, lite: false }),
});
const ORDER = ['compact', 'standard', 'rich', 'full'];

/**
 * 这个画质档位该用哪个内存档位。tier: 'auto' | 'low' | 'balanced' | 'high' | 'ultra'。纯函数（测试直接用）。
 * lost：这台设备 7 天内被系统回收过几次显存——一次：在原来的基础上降一档；两次以上：直接用省内存档。
 */
export function memoryProfileFor(tier, { mobile = MOBILE, lost = CONTEXT_LOSSES } = {}) {
  let name;
  if (+lost >= 2) return 'compact';
  if (mobile) name = tier === 'high' || tier === 'ultra' ? 'rich' : tier === 'balanced' ? 'standard' : 'compact';
  else name = 'full';
  if (lost) name = mobile ? (name === 'rich' ? 'standard' : 'compact') : (tier === 'low' ? 'compact' : 'standard');
  return name;
}

/** 当前的内存档位（对象本身会被 configureMemory 换掉，用的时候现取 MEM.xxx，别在模块顶层存下来） */
export let MEM = MEMORY_PROFILES[memoryProfileFor('auto')];
/** 程序化贴图（招牌图集、地面材质、导向牌）的缩放 */
export let TEX_SCALE = MEM.texScale;

/** 进入某个模式之前调：按存下来的画质档位定内存档位。返回档位名。 */
export function configureMemory(tier = 'auto', opts) {
  MEM = MEMORY_PROFILES[memoryProfileFor(tier, opts)] || MEMORY_PROFILES.standard;
  TEX_SCALE = MEM.texScale;
  return MEM.name;
}
/** a 比 b 更省（-1）、一样（0）、更费（1） */
export const compareMemory = (a, b) => Math.sign(ORDER.indexOf(a) - ORDER.indexOf(b));

/** 把一张图缩到最长边不超过 cap（已经够小就原样返回）。返回 画布 或 原图 */
export function capImage(image, cap) {
  const max = Math.max(image?.width || 0, image?.height || 0);
  if (!image || !Number.isFinite(cap) || max <= cap || typeof document === 'undefined') return image;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * cap / max)); canvas.height = Math.max(1, Math.round(image.height * cap / max));
  const g = canvas.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
export const SHADOW_SIZE = LITE ? 2048 : 4096;
export const MAX_PIXEL_RATIO = LITE ? 1.5 : 2;
