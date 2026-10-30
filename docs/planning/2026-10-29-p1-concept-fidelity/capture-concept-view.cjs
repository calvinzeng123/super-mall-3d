// 用效果图拟合出的相机截取完整探索模式的一期鸟瞰，便于与概念 A 并排对图。
// 先在仓库根目录 npm run build && npm run serve，再运行：
//   node docs/planning/2026-10-29-p1-concept-fidelity/capture-concept-view.cjs out-prefix [http://127.0.0.1:5174/]
// 输出 out-prefix-day.jpg / out-prefix-night.jpg（1672×941，与效果图同尺寸）。
const { chromium } = require('playwright');
const fs = require('fs');

const CAMERA = { pos: [-158.3, 386.1, 230.7], target: [-151.5, 0, -114.4], fov: 24.5, w: 1672, h: 941 };

(async () => {
  const [prefix = 'concept-view', url = 'http://127.0.0.1:5174/'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.click('[data-mode="tour"]');
  await page.waitForFunction(() => window.__mall && document.getElementById('loading').hidden, null, { timeout: 600000, polling: 1000 });
  for (const night of [false, true]) {
    const data = await page.evaluate(({ c, night }) => {
      const app = window.__mall;
      app.setLabels(false);
      app.setNight(night);
      app.camera.fov = c.fov;
      app.camera.updateProjectionMatrix();
      return app.debugShot({ w: c.w, h: c.h, pos: c.pos, target: c.target, steps: 3, shadow: 420 });
    }, { c: CAMERA, night });
    const out = `${prefix}-${night ? 'night' : 'day'}.jpg`;
    fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
    console.log('saved', out);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
