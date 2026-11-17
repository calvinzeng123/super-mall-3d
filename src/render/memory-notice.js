// 贴图大小、装饰几何是进入模式时按画质档位定的（device.js 的内存档位）。玩的过程中改了画质、换到另一个内存档位时，
// 这里在屏幕下方给一条提示：重新进入后生效，旁边一个「立即重新载入」。不打断当前这一局。
import { MEM, MEMORY_PROFILES, memoryProfileFor, compareMemory } from './device.js';

/** 这次换画质以后该不该提示：返回 null（不用）或 { to, text }。纯函数，测试直接用 */
export function memoryNotice(tier, current = MEM.name, opts) {
  const to = memoryProfileFor(tier, opts);
  if (to === current) return null;
  const more = compareMemory(to, current) > 0;
  return { to, text: more
    ? `画质调高了：贴图和模型细节会换成「${MEMORY_PROFILES[to].label}」，重新进入后生效（更清楚，也更占内存）`
    : `画质调低了：贴图和模型细节会换成「${MEMORY_PROFILES[to].label}」，重新进入后生效（更省内存）` };
}

export function createMemoryNotice({ onReload = () => location.reload() } = {}) {
  if (typeof document === 'undefined') return { update() {}, dispose() {} };
  let el = null;
  const hide = () => { el?.remove(); el = null; };
  return {
    /** tier：'auto' | 'low' | 'balanced' | 'high' | 'ultra' */
    update(tier) {
      const n = memoryNotice(tier);
      if (!n) { hide(); return; }
      if (!el) {
        el = document.createElement('div'); el.className = 'memory-notice';
        el.style.cssText = 'position:fixed;left:50%;bottom:calc(64px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:70;display:flex;gap:10px;align-items:center;'
          + 'max-width:min(92vw,560px);padding:9px 12px;border-radius:12px;background:rgba(18,24,30,.9);color:#eef2f4;font:13px/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)';
        el.innerHTML = '<span></span><button type="button" style="flex:none;padding:7px 12px;border:0;border-radius:8px;background:#c8a25a;color:#111;font:600 13px system-ui,sans-serif">立即重新载入</button><button type="button" aria-label="关闭" style="flex:none;border:0;background:none;color:#aeb7bd;font-size:18px;line-height:1;padding:2px 4px">×</button>';
        const [reload, close] = el.querySelectorAll('button');
        reload.addEventListener('click', () => onReload()); close.addEventListener('click', hide);
        // 零点突围的界面层会吃掉触摸：这条提示自己接住
        for (const type of ['touchstart', 'mousedown']) el.addEventListener(type, (e) => e.stopPropagation());
        document.body.appendChild(el);
      }
      el.querySelector('span').textContent = n.text;
    },
    dispose: hide,
  };
}
