// 首页《围城》：进度条 → Three.js 实时开场动画 → Logo 落下、主菜单浮出（src/title/boot.js）。
// 开场自己一块（Three.js + 开场场景 + 开场资源）；游戏本体（runtime.js：园区布局、渲染、零点突围 / 丧尸围城 / 漫游）
// 选了模式、开场场景释放以后才动态 import——Pages 版按块拆开，游戏不进首页的首次下载。
import { bootTitle } from './title/boot.js';
import { createTitleScene } from './title/scene.js';
window.__mallBooted = true;
document.body.dataset.mode = 'launch';
document.getElementById('loading').hidden = true;

const storageOf = (name) => { try { return window[name]; } catch { return null; } };
const root = document.createElement('div');
root.id = 'title';
const canvas = document.createElement('canvas');
canvas.setAttribute('aria-label', '围城 开场动画');
root.append(canvas);
document.body.append(root);

let runtime = null;
/** 首页句柄（调试、截图、导出视频用：window.__title.then((h) => h.scene.setT(…))） */
window.__title = bootTitle({
  canvas, root, search: location.search,
  storage: storageOf('localStorage'), session: storageOf('sessionStorage'),
  createScene: createTitleScene,
  async startRuntime(mode, onProgress) {
    try {
      runtime = await import('./runtime.js');
      return await runtime.startRuntime(mode, onProgress);
    } catch(error) {
      // 载入出错不是被系统关掉：擦掉「正在进入」，刷新重试时不降内存档、不提示「上次被关掉」（菜单那边显示红字、再点刷新）
      try { runtime?.bootFailed?.(); } catch { /* 擦不掉就算了 */ }
      throw error;
    }
  },
});
