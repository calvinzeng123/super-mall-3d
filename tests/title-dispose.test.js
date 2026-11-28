// 开场场景的真实释放（src/title/scene.js 的 dispose + boot.js 的 disposeTitle）：在无头 Chromium（软件 WebGL）里
// 用真的 createTitleScene 走一遍 bootTitle，放完开场、出菜单以后调 disposeTitle()，检查
//   · renderer.info.memory 的几何体、贴图都归零（显存真的还回去了）；
//   · renderer.getContext().isContextLost() 为真（同一时间只剩游戏那一个 GL 上下文）；
//   · 定格的那一帧不是黑图（scene.snapshot 在同一个任务里先画再拍）。
// 机器上没装 Playwright / Chromium 时跳过。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, extname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, '..');
let chromium = null;
for (const id of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(id)); break; } catch { /* 换下一个 */ } }

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2' };
const PAGE = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}#root{position:fixed;inset:0}#root canvas{width:100%;height:100%;display:block}</style>
<script type="importmap">{ "imports": { "three": "/node_modules/three/build/three.module.js", "three/addons/": "/node_modules/three/examples/jsm/" } }</script>
<div id="root"></div>
<script type="module">
import { bootTitle, disposeTitle } from '/src/title/boot.js';
import { createTitleScene } from '/src/title/scene.js';
const root = document.getElementById('root'), canvas = document.createElement('canvas'); root.append(canvas);
window.__disposeTitle = disposeTitle;
window.__title = bootTitle({ canvas, root, base: '/', search: '?intro=none', storage: null, session: null, prefetch: false, probe: async () => false,
  createTitleScene: (c, o) => createTitleScene(c, { ...o, tier: 'low' }),
  startRuntime: async () => { window.__started = true; } }).then((h) => { window.__h = h; return h; }, (e) => { window.__err = String(e?.stack || e); });
</script>`;

function serve() {
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/__dispose.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    try { const b = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(b); }
    catch { res.writeHead(404); res.end(); }
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

test('disposeTitle()：真场景释放后 renderer.info.memory 归零、GL 上下文丢掉；定格帧不是黑图', { skip: !chromium && '没装 Playwright', timeout: 600000 }, async () => {
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${srv.address().port}/__dispose.html`);
    await page.waitForFunction(() => window.__h || window.__err, null, { timeout: 540000 });
    assert.equal(await page.evaluate(() => window.__err || null), null);
    const r = await page.evaluate(async () => {
      const h = window.__h, sc = h.scene, renderer = sc.renderer;
      // 放一会儿（真的走 requestAnimationFrame 画几帧），再从「点击」这样的任务外部释放
      await new Promise((ok) => setTimeout(ok, 600));
      const before = { ...renderer.info.memory }, lostBefore = renderer.getContext().isContextLost();
      const released = window.__disposeTitle();
      const bg = document.querySelector('.wc-boot').style.backgroundImage;
      // 定格帧：解出来量平均亮度（黑图 ≈ 0）
      const m = /url\("(data:image\/jpeg[^"]+)"\)/.exec(bg);
      let luma = -1;
      if (m) {
        const img = new Image(); img.src = m[1]; await img.decode();
        const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 36);
        const d = g.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 765; luma = s / (d.length / 4);
      }
      return { fallback: h.fallback, before, lostBefore, released, after: { ...renderer.info.memory }, lost: renderer.getContext().isContextLost(), canvasHidden: document.querySelector('#root canvas').style.display === 'none', still: !!m, luma, again: window.__disposeTitle(), sceneAfter: h.scene };
    });
    assert.equal(r.fallback, false, '真场景建起来了（不是兜底主视觉）');
    assert.equal(r.lostBefore, false);
    assert.ok(r.before.geometries > 0 && r.before.textures > 0, `释放前有显存占用：${JSON.stringify(r.before)}`);
    assert.equal(r.released, true);
    assert.deepEqual(r.after, { geometries: 0, textures: 0 }, '几何体、贴图全还回去');
    assert.equal(r.lost, true, 'GL 上下文丢掉');
    assert.equal(r.canvasHidden, true);
    assert.equal(r.again, false, '再调一次什么都不做');
    assert.equal(r.sceneAfter, null);
    assert.ok(r.still, '背景是定格的那一帧（不是兜底图）');
    assert.ok(r.luma > 0.03, `定格帧不是黑图（平均亮度 ${r.luma.toFixed(3)}）`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); srv.close();
  }
});
