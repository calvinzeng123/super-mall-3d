// 设备档位：手机、平板（含伪装成 Mac 的 iPadOS）走低内存配置——贴图减半、阴影 2048、像素比 ≤1.5。
// iOS 会直接结束内存超限的网页进程（表现为整页"出错了"），所以这里宁可保守。
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
const touchMac = /Macintosh/.test(ua) && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 1;

export const MOBILE = /iPhone|iPad|iPod|Android/i.test(ua) || touchMac;
/** 程序化贴图（招牌图集、地面材质、导向牌）在手机上缩到一半边长，显存降到四分之一 */
export const TEX_SCALE = MOBILE ? 0.5 : 1;
export const SHADOW_SIZE = MOBILE ? 2048 : 4096;
export const MAX_PIXEL_RATIO = MOBILE ? 1.5 : 2;
