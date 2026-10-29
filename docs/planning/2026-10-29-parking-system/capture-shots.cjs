// 地库截图：按 shot-views.json 的机位逐张截取游览模式画面，可只显示指定楼层。
// 先在仓库根目录 npm run build && npm run serve，再运行：
//   node docs/planning/2026-10-29-parking-system/capture-shots.cjs 输出目录 [http://127.0.0.1:5174/]
// 机位：{ name, pos, target, fov, w, h, levels?: [楼层 id], shift?: { id: [dx, dy, dz] }, offsets?: { id: dy }, site?: bool, night?: bool }
// 不给 levels 时按正常游览可见性截图（地面、建筑全部可见）；给了就只留这些楼层，shift/offsets 把楼层拆开做鸟瞰。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const [outDir, base = 'http://127.0.0.1:5174/'] = process.argv.slice(2);
  if (!outDir) throw new Error('用法：capture-shots.cjs 输出目录 [地址]');
  const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'shot-views.json'), 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.click('[data-mode="tour"]');
  await page.waitForFunction(() => window.__mall && document.getElementById('loading').hidden && window.__mall.explore, null, { timeout: 600000, polling: 1000 });
  await page.waitForTimeout(1500);
  for (const v of views) {
    const url = await page.evaluate(v => {
      const app = window.__mall, ctx = app.ctx;
      app.setLabels(false); app.setNight(!!v.night);
      app.reset(true); app.cancelFlight();
      for (const L of Object.values(ctx.levels)) { L.group.position.x = 0; L.group.position.z = 0; }
      for (const r of ctx.hospitality?.underground || []) r.group.position.set(0, 0, 0);
      if (v.levels) {
        const keep = new Set(v.levels), elevs = v.levels.map(id => ctx.levels[id].lv.elev);
        for (const B of Object.values(ctx.buildings)) {
          if (B.exterior) B.exterior.visible = false;
          for (const L of B.levels) {
            const on = keep.has(L.lv.id);
            L.group.visible = on; L.base.visible = on; L.shell.visible = on; L.facade.visible = false;
            L.labels.visible = false; L.flows.visible = false; L.people.visible = false;
            const sh = v.shift?.[L.lv.id];
            L.offsetTarget = sh ? sh[1] : v.offsets?.[L.lv.id] || 0;
            if (sh) { L.group.position.x = sh[0]; L.group.position.z = sh[2]; }
          }
        }
        ctx.site.group.visible = !!v.site;
        if (ctx.hospitality?.connections) ctx.hospitality.connections.visible = !!v.site;
        for (const r of ctx.hospitality?.underground || []) {
          const hit = elevs.findIndex(y => Math.abs(y - r.elevation) < .6);
          r.group.visible = hit >= 0;
          // 拆层鸟瞰时，地下连接道跟着所在楼层一起移动。
          if (hit >= 0) { const id = v.levels[hit], sh = v.shift?.[id]; r.group.position.set(sh ? sh[0] : 0, sh ? sh[1] : v.offsets?.[id] || 0, sh ? sh[2] : 0); }
          if (r.ceiling) r.ceiling.visible = false;
        }
      }
      if (v.fov) { app.camera.fov = v.fov; app.camera.updateProjectionMatrix(); }
      return app.debugShot({ w: v.w || 1600, h: v.h || 1000, pos: v.pos, target: v.target, steps: 2, shadow: v.shadow || 420 });
    }, v);
    fs.writeFileSync(path.join(outDir, `${v.name}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved', v.name);
  }
  if (errors.length) console.log('page errors', errors);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
