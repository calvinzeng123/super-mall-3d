// The title screen is deliberately independent of Three.js and world assets.
// The online build splits the dynamic import: opening the cover creates no GL
// context, downloads no GLB and allocates no map geometry.
import { mountLauncher } from './launcher.js';
import { COVER_URL } from './cover-data.js';
window.__mallBooted = true;
document.body.dataset.mode = 'launch';
document.getElementById('loading').hidden = true;
let failed = false;
const launcher = mountLauncher({ backgroundUrl:COVER_URL, async onSelect(mode) {
  if (failed) { location.reload(); return; }
  launcher.setLoading('准备进入云澜汇',0);
  try {
    const { startRuntime } = await import('./runtime.js');
    await startRuntime(mode,(label,p)=>launcher.setLoading(label,p));
    launcher.dispose();
  } catch(error) {
    failed = true;
    console.error(error);
    // Retry creates a fresh document, releasing any partially built GPU scene.
    launcher.showError(`加载未完成：${error.message || error}。点击任一模式刷新后重试。`);
  }
} });
