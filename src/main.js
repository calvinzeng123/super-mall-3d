// The title screen is deliberately independent of Three.js and world assets.
// The online build splits the dynamic import: opening the cover creates no GL
// context, downloads no GLB and allocates no map geometry.
import { mountLauncher } from './launcher.js';
import { COVER_URL, FPS_COVER_URL } from './cover-data.js';
import { mergeLaunchQuery, launchCleanup, LAUNCH_ADDED_KEY } from './cover-options.js';
window.__mallBooted = true;
document.body.dataset.mode = 'launch';
document.getElementById('loading').hidden = true;

// 封面上次替玩家写进地址栏的参数（siege / mp / play）：「返回封面」整页刷新回来时擦掉；换了深链（地址不一样）不动
const session = (() => { try { return window.sessionStorage; } catch { return null; } })();
try {
  const s = launchCleanup(location.search, JSON.parse(session?.getItem(LAUNCH_ADDED_KEY) || 'null'));
  if (s != null) history.replaceState(history.state, '', `${location.pathname}${s}${location.hash}`);
  session?.removeItem(LAUNCH_ADDED_KEY);
} catch { /* 存不了就不擦 */ }

/** 进模式前把这个入口的参数写进地址栏（零点突围 / 丧尸围城 / 联机读的是 location.search） */
function applyLaunchQuery(query) {
  if (!query) return;
  const { search, added } = mergeLaunchQuery(location.search, query);
  try {
    history.replaceState(history.state, '', `${location.pathname}${search}${location.hash}`);
    if (added.length) session?.setItem(LAUNCH_ADDED_KEY, JSON.stringify({ search, added }));
  } catch { /* 预览环境改不了地址：照常进模式（默认设置） */ }
}

let failed = false;
const launcher = mountLauncher({ backgroundUrl:COVER_URL, fpsUrl:FPS_COVER_URL, async onSelect(mode, { query = '' } = {}) {
  if (failed) { location.reload(); return; }
  launcher.setLoading('准备进入云澜汇',0);
  try {
    applyLaunchQuery(query);
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
