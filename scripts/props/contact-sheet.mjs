// 素材总览图：把 assets/models/props 里的每个模型各渲染一格，检查减面后的样子、朝向（正面朝 +Z）和尺寸。
// 用法：node scripts/props/contact-sheet.mjs <输出目录> [每张几列=5] [格子像素=300] [near|far|front]   （far 看远景简化版，没有贴图；front 从 +Z 正对模型，核对朝向）
// 需要本机有 Playwright 和 Chromium（只在检查素材时用）。
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [outDir, colsArg = '5', cellArg = '300', which = 'near'] = process.argv.slice(2);
if (!outDir) { console.error('用法：contact-sheet.mjs <输出目录> [列数] [格子像素]'); process.exit(1); }
const cols = Number(colsArg), cell = Number(cellArg), perSheet = cols * cols;
const { chromium } = createRequire(import.meta.url)('playwright');
const manifest = JSON.parse(await readFile(path.join(root, 'assets/models/props/manifest.json'), 'utf8'));
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.html': 'text/html', '.wasm': 'application/wasm' };

const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#20262c">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<canvas id="c"></canvas>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const params = new URLSearchParams(location.search), cols = +params.get('cols'), cell = +params.get('cell');
const props = await (await fetch('/__props')).json();
const rows = Math.ceil(props.length / cols);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(cols * cell, rows * cell, false);
canvas.style.width = cols * cell + 'px'; canvas.style.height = rows * cell + 'px';
renderer.setScissorTest(true); renderer.autoClear = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9e6e0');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
scene.add(new THREE.HemisphereLight('#dcebff', '#7d7465', 1.1));
const sun = new THREE.DirectionalLight('#fff0d8', 2.2); sun.position.set(3, 6, 4); scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#cfc9bf', roughness: 1 }));
scene.add(floor);
// 正面箭头：指向 +Z，放在地面上
const arrow = new THREE.Mesh(new THREE.ConeGeometry(.06, .18, 3).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d2452d' }));
scene.add(arrow);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const camera = new THREE.PerspectiveCamera(30, 1, .01, 100);
const overlay = document.createElement('canvas'); overlay.width = cols * cell; overlay.height = rows * cell;
overlay.style.cssText = 'position:absolute;left:0;top:0'; document.body.appendChild(overlay);
const g = overlay.getContext('2d'); g.font = '600 13px system-ui'; g.textBaseline = 'top';
renderer.setScissor(0, 0, cols * cell, rows * cell); renderer.setViewport(0, 0, cols * cell, rows * cell);
renderer.setClearColor('#20262c'); renderer.clear();
for (const [i, p] of props.entries()) {
  const gltf = await loader.loadAsync('/assets/models/props/' + p.file);
  const obj = gltf.scene; scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * .5 + .02;
  floor.scale.setScalar(r * 1.5); floor.position.set(0, Math.min(0, box.min.y) - .001, 0);
  arrow.scale.setScalar(Math.max(.4, r * 1.4)); arrow.position.set(0, floor.position.y + .01, r * 1.35);
  // 正面图：相机在 +Z 一侧正对模型，看到的就是模型的「正面」（椅子应该看到座面，柜子应该看到柜门）
  if (params.get('view') === 'front') camera.position.set(center.x + r * .25, center.y + r * .7, center.z + r * 3.6);
  else camera.position.set(center.x + r * 2.2, center.y + r * 1.45, center.z + r * 3.1);
  camera.lookAt(center); camera.updateProjectionMatrix();
  const cx = i % cols, cy = Math.floor(i / cols);
  renderer.setViewport(cx * cell, (rows - 1 - cy) * cell, cell, cell); renderer.setScissor(cx * cell + 1, (rows - 1 - cy) * cell + 1, cell - 2, cell - 2);
  renderer.clear(); renderer.render(scene, camera);
  await new Promise(r => setTimeout(r, 30)); renderer.render(scene, camera);
  scene.remove(obj);
  g.fillStyle = '#1b2228'; g.fillText(p.id + ' · ' + p.label, cx * cell + 8, cy * cell + 7);
  g.fillStyle = '#5a646c'; g.fillText(p.size.map(v => v.toFixed(2)).join('×') + ' m · ' + p.triangles + ' 面 · ' + Math.round(p.bytes / 1024) + ' kB', cx * cell + 8, cy * cell + 24);
}
window.__done = true;
</script>`;

let current = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/sheet.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); return; }
  if (url.pathname === '/__props') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(current)); return; }
  try {
    const file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) throw new Error('outside');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const props = manifest.props.map((p) => (which === 'far'
    ? { id: p.id, label: p.label + '（远景）', file: p.lod.file, size: p.size, triangles: p.lod.triangles, bytes: p.lod.bytes }
    : { id: p.id, label: p.label, file: p.file, size: p.size, triangles: p.triangles, bytes: p.bytes }));
  for (let s = 0; s * perSheet < props.length; s++) {
    const part = props.slice(s * perSheet, (s + 1) * perSheet), rows = Math.ceil(part.length / cols);
    const tab = await browser.newPage({ viewport: { width: cols * cell, height: rows * cell }, deviceScaleFactor: 1 });
    tab.on('pageerror', (e) => console.error('page error:', e.message));
    tab.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    current = part;
    await tab.goto(`http://127.0.0.1:${port}/sheet.html?cols=${cols}&cell=${cell}&view=${which === 'front' ? 'front' : 'angle'}`);
    await tab.waitForFunction(() => window.__done === true, null, { timeout: 180000 });
    const file = path.join(outDir, `props-${which === 'near' ? '' : which + '-'}${String(s + 1).padStart(2, '0')}.png`);
    await tab.screenshot({ path: file });
    await tab.close();
    console.log(file);
  }
} finally { await browser.close(); server.close(); }
