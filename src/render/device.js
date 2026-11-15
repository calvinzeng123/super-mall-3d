// 设备档位：手机、平板（含伪装成 Mac 的 iPadOS）走低内存配置——贴图减半、阴影 2048、像素比 ≤1.5。
// iOS 会直接结束内存超限的网页进程（表现为整页"出错了"），所以这里宁可保守。
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
const touchMac = /Macintosh/.test(ua) && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 1;

export const MOBILE = /iPhone|iPad|iPod|Android/i.test(ua) || touchMac;

// 这台设备最近一次「显示资源被系统回收」（WebGL 上下文丢失，多半是显存不够）的时间。7 天内再打开就走省显存档。
const LOSS_KEY = 'yunlan-context-lost';
const LOSS_DAYS = 7;
function readLoss() {
  try {
    const t = Number(globalThis.localStorage?.getItem(LOSS_KEY));
    return Number.isFinite(t) && t > 0 && Date.now() - t < LOSS_DAYS * 864e5;
  } catch { return false; }
}
/** 上次在这台设备上显存不够、被回收过 */
export const AFTER_CONTEXT_LOSS = readLoss();
/** 省显存档：手机、平板，或上次被回收过的电脑——画质自动档从「流畅」起、楼层细节少留几层、
 * 装饰性的小几何（垂藤、小花、绿墙叶团）不做。 */
export const LITE = MOBILE || AFTER_CONTEXT_LOSS;
/** 记一笔：显示资源被回收了，下次打开走省显存档 */
export function markContextLoss() {
  try { globalThis.localStorage?.setItem(LOSS_KEY, String(Date.now())); } catch { /* 隐私模式存不了就算了 */ }
}
/** 程序化贴图（招牌图集、地面材质、导向牌）在手机上缩到一半边长，显存降到四分之一 */
export const TEX_SCALE = LITE ? 0.5 : 1;
export const SHADOW_SIZE = LITE ? 2048 : 4096;
export const MAX_PIXEL_RATIO = LITE ? 1.5 : 2;
