// 入口：检查 WebGL → 生成布局模型 → 搭建 3D 场景 → 绑定界面
import { buildLayout } from './layout/layout.js';
import { createApp } from './render/app.js';
import { createUI } from './render/ui.js';

window.__mallBooted = true;
const $ = (id) => document.getElementById(id);

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function main() {
  if (!webglAvailable()) {
    window.__mallFail('浏览器不支持 WebGL', '请用最新版 Chrome、Edge 或 Safari 打开这个页面。');
    return;
  }
  const bar = $('loadingBar');
  const text = $('loadingText');
  const layout = buildLayout();
  const app = await createApp(layout, $('stage'), {
    onProgress(label, p) {
      text.textContent = `${label}…`;
      bar.style.width = `${Math.round(p * 100)}%`;
    },
  });
  createUI(app, layout);
  bar.style.width = '100%';
  $('loading').classList.add('done');
  setTimeout(() => { $('loading').hidden = true; }, 700);
  window.__mall = app;
}

main().catch((err) => {
  console.error(err);
  window.__mallFail('场景搭建出错', String((err && err.message) || err));
});
