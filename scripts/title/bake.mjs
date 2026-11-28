// 开场（src/title/）要的资源，打包时准备好，生成 src/title/title-data.js：
//   楼型   园区真实的塔楼和商场外轮廓（buildLayout() 里量出来），开场只拿这一小份 JSON，不引入整个布局模块；
//   丧尸   zombie-skin.js 的腐烂贴图在无头浏览器里照原样画一遍，存成 JPEG（颜色图 + 湿度图 + 法线 + 粗糙度，高低两档），
//          手机上不再现画（试做版主线程现画了 6 秒）；
//   行人   丧尸用的两个行人模型去掉原贴图（预画贴图顶上），每个从一兆六减到六百来 K；
//   字体   毛笔字（Ma Shan Zheng）和英文（Oswald SemiBold）按开场用到的字子集化成 woff2，不连 Google Fonts。
// 三样都按输入算一个指纹记在 assets/title/bake-stamp.json：输入没变就直接用上次的产物（产物随仓库提交），
// 所以平时打包不需要浏览器和 fonttools；变了才重做——丧尸要 Playwright（预装的 Chromium），字体要 `pip install fonttools brotli`。
// 单独跑：node scripts/title/bake.mjs [--force]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = 'assets/title', STAMP = `${OUT}/bake-stamp.json`, DATA = 'src/title/title-data.js';

/** 字体源文件（原文件和许可都在 assets/fonts/） */
export const FONT_SOURCES = Object.freeze({
  brush: { file: 'assets/fonts/MaShanZheng-Regular.ttf', out: `${OUT}/fonts/title-brush.woff2`, family: 'TitleBrush' },
  latin: { file: 'assets/fonts/Oswald-SemiBold.ttf', out: `${OUT}/fonts/title-latin.woff2`, family: 'TitleLatin' },
});

/**
 * 不管开场代码里写没写，子集里都收的字：Logo、菜单、进度条、设置、状态行（后面几步才写进 src/title/ 的文案先收进来），
 * 再加上数字、常用标点。ASCII 可见字符另外全收（英文字体小，全收省得漏）。
 */
export const BASE_CHARS = '围城云澜丧尸单人联机三零点突围园区漫游更多玩法设置无人机送外卖夜间潜入画质开场音量重看完整版短版不播自动低中高极致'
  + '服务器在线离线版本确认返回选择进入关卡正在封锁读取加载准备跳过按任意键继续退出星' + '0123456789'
  + '·・、，。：；！？（）「」『』《》—…－＋／％';

/**
 * 从源代码文本里收字：只收字符串字面量（'…'、"…"、`…`）里的字，注释里的不收。返回去重后的字符串（含 BASE_CHARS 和全部可见 ASCII）。
 * 很简单的扫描：认得转义、三种引号、行注释和块注释；正则字面量当普通代码（开场代码里没有带中文的正则）。
 */
export function collectChars(texts) {
  const set = new Set(BASE_CHARS);
  for (let c = 0x20; c < 0x7f; c++) set.add(String.fromCharCode(c));
  for (const src of texts) {
    for (let i = 0; i < src.length; i++) {
      const ch = src[i], next = src[i + 1];
      if (ch === '/' && next === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (ch === '/' && next === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 1; continue; }
      if (ch === '"' || ch === "'" || ch === '`') {
        for (i++; i < src.length && src[i] !== ch; i++) {
          if (src[i] === '\\') { i++; continue; }
          if (ch === '`' && src[i] === '$' && src[i + 1] === '{') { const end = src.indexOf('}', i); i = end < 0 ? src.length : end; continue; }
          set.add(src[i]);
        }
      }
    }
  }
  set.delete('\n'); set.delete('\r'); set.delete('\t');
  return [...set].sort().join('');
}

/**
 * buildLayout() 的结果 → 开场用的楼型：所有塔楼 + 商场（P1、P2，带外轮廓）。
 * { id, kind, x, z（中心，园区坐标，米）, w, d（沿 rot 方向的长宽）, h（从 y 往上多高）, y（底在哪个高度，地下的部分不算）, rot（弧度）, outline?（商场的外轮廓 [[x, z]…]） }
 */
export function towersFromLayout(layout) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const out = [];
  for (const b of layout.buildings) {
    if (b.kind !== 'tower' && b.kind !== 'mall') continue;
    const lv = layout.levels.filter((l) => l.building === b.id);
    if (!lv.length || !b.outline?.length) continue;
    const top = Math.max(...lv.map((l) => l.elev + l.height)), y = Math.max(0, Math.min(...lv.map((l) => l.elev)));
    const pts = b.outline;
    // 方向取第一条边（塔楼的外轮廓都是矩形）；商场是多边形，按这条边的方向量外包框
    const [ax, az] = pts[0], [bx, bz] = pts[1], rot = Math.atan2(bz - az, bx - ax), c = Math.cos(rot), s = Math.sin(rot);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [px, pz] of pts) { const u = px * c + pz * s, v = -px * s + pz * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
    const t = { id: b.id, kind: b.kind, x: r1(uc * c - vc * s), z: r1(uc * s + vc * c), w: r1(u1 - u0), d: r1(v1 - v0), h: r1(top - y), y: r1(y), rot: Math.round(rot * 1e4) / 1e4 };
    if (b.kind === 'mall') t.outline = pts.map(([px, pz]) => [r1(px), r1(pz)]);
    out.push(t);
  }
  return out;
}

// 丧尸贴图：高档颜色图 1024、其余 512；低档（手机）颜色图 512、其余 256。外观：三套普通 + 惨白、扑袭、喷酸、巨尸（胖尸开场用不上）
export const ZOMBIE_BAKE = Object.freeze({
  sets: Object.freeze({ hi: { colour: 1024, surface: 512 }, lo: { colour: 512, surface: 256 } }),
  looks: Object.freeze(['walker-0', 'walker-1', 'walker-2', 'pale', 'lunger', 'spitter', 'brute']),
  quality: Object.freeze({ colour: 0.84, wet: 0.9, normal: 0.88, rough: 0.85 }),
  seed: 20261120,
});

// 1×1 的灰色 PNG：顶替行人模型里那张一兆的原贴图（开场的丧尸用预画贴图，原贴图用不上，进度条阶段省两兆）
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==', 'base64');

/**
 * GLB 里内嵌的图片全换成 1×1 的 PNG，几何、走路姿势、材质原样不动（缓冲区按 4 字节对齐重排，bufferView 的偏移跟着改）。纯函数。
 */
export function stripGlbImages(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB');
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8, bin = bytes.subarray(binStart, binStart + bytes.readUInt32LE(20 + jsonLength));
  const imageViews = new Set((json.images || []).map((im) => im.bufferView).filter((v) => v != null));
  const parts = []; let at = 0;
  json.bufferViews.forEach((view, i) => {
    const data = imageViews.has(i) ? TINY_PNG : bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const pad = (4 - (at % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); at += pad; }
    view.byteOffset = at; view.byteLength = data.length; parts.push(data); at += data.length;
  });
  const pad = (4 - (at % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); at += pad; }
  json.buffers[0].byteLength = at;
  for (const im of json.images || []) im.mimeType = 'image/png';
  let text = Buffer.from(JSON.stringify(json), 'utf8'); const jp = (4 - (text.length % 4)) % 4; if (jp) text = Buffer.concat([text, Buffer.alloc(jp, 0x20)]);
  const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + text.length + 8 + at, 8);
  jh.writeUInt32LE(text.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(at, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, text, bh, ...parts]);
}

const sha = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(p); return h.digest('hex').slice(0, 20); };
const filesUnder = async (dir, re) => (await readdir(dir)).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f));

async function zombieInputs() {
  const files = ['src/jimao/zombie-skin.js', 'src/jimao/skins/zombie-paint.js', 'assets/models/people/rocketbox-m.glb', 'assets/models/people/rocketbox-f.glb'];
  return sha(JSON.stringify(ZOMBIE_BAKE), ...(await Promise.all(files.map((f) => readFile(f)))));
}

/** 在无头 Chromium 里跑真正的 loadZombieKit，每画完一张就把像素编成 JPEG 拿回来 */
async function bakeZombies() {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch {
    const require = (await import('node:module')).createRequire(import.meta.url);
    try { ({ chromium } = require('playwright')); } catch { throw new Error('丧尸贴图要重画，但没有 Playwright：装上（或预装的 Chromium）再打包'); }
  }
  const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };
  const page0 = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><body></body>`;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__bake.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page0); return; }
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    try { const body = await readFile(file); res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.warn('[bake] 页面出错', e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/__bake.html`);
    const results = [];
    for (const [set, sizes] of Object.entries(ZOMBIE_BAKE.sets)) {
      const shots = await page.evaluate(async ({ sizes, cfg }) => {
        const { loadZombieKit } = await import('/src/jimao/zombie-skin.js');
        const out = [];
        // 颜色图：RGB 原样、不透明；湿度图：透明通道（头发透明度 / 湿度，见 zombie-paint.js 的 encodeWet）摊成灰度
        const encode = (pixels, size, pick, q) => {
          const c = document.createElement('canvas'); c.width = c.height = size;
          const g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
          for (let i = 0; i < d.length; i += 4) { pick(pixels, i, d); d[i + 3] = 255; }
          g.putImageData(img, 0, 0);
          return c.toDataURL('image/jpeg', q);
        };
        const rgb = (s, i, d) => { d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; };
        const alpha = (s, i, d) => { d[i] = d[i + 1] = d[i + 2] = s[i + 3]; };
        const kit = await loadZombieKit({ seed: cfg.seed, budget: 1e9, sizes, capture: ({ body, kind, look, size, pixels }) => {
          if (kind === 'colour' && !cfg.looks.includes(look)) return;
          if (kind === 'colour') {
            out.push({ body, kind: 'colour', look, size, data: encode(pixels, size, rgb, cfg.quality.colour) });
            out.push({ body, kind: 'wet', look, size: size >> 1, data: encode(halve(pixels, size), size >> 1, alpha, cfg.quality.wet) });
          } else out.push({ body, kind, look: null, size, data: encode(pixels, size, rgb, cfg.quality[kind]) });
        } });
        kit.dispose();
        // 湿度图只要颜色图一半大（湿处是成片的，头发边上那点透明度半分辨率够用）：2×2 取平均
        function halve(p, s) {
          const h = s >> 1, o = new Uint8ClampedArray(h * h * 4);
          for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
            const a = ((2 * y) * s + 2 * x) * 4, b = a + s * 4;
            o[(y * h + x) * 4 + 3] = (p[a + 3] + p[a + 7] + p[b + 3] + p[b + 7] + 2) >> 2;
          }
          return o;
        }
        return out;
      }, { sizes, cfg: ZOMBIE_BAKE });
      for (const s of shots) results.push({ ...s, set });
    }
    return results;
  } finally {
    await browser.close(); server.close();
  }
}

/** pyftsubset（fonttools）子集化成 woff2 */
function subsetFont(src, out, chars) {
  const args = [src, `--text=${chars}`, '--flavor=woff2', `--output-file=${out}`, '--layout-features=*', '--no-hinting', '--desubroutinize'];
  for (const cmd of [['pyftsubset', args], ['python3', ['-m', 'fontTools.subset', ...args]]]) {
    try { execFileSync(cmd[0], cmd[1], { stdio: ['ignore', 'ignore', 'pipe'] }); return; } catch (e) { if (e.code !== 'ENOENT' && cmd[0] !== 'pyftsubset') throw e; }
  }
  throw new Error('字体要重新子集化，但没有 fonttools：pip install fonttools brotli');
}

async function readStamp() { try { return JSON.parse(await readFile(STAMP, 'utf8')); } catch { return {}; } }

/**
 * 准备好全部开场资源并写 src/title/title-data.js。force：不看指纹，全部重做。
 * 返回 { towers, zombies, fonts, rebuilt: [...这次重做了哪几样] }
 */
export async function bake({ force = false, log = console.log } = {}) {
  const cwd = process.cwd(); process.chdir(ROOT);
  try {
    const stamp = await readStamp(), next = { ...stamp }, rebuilt = [];
    await mkdir(`${OUT}/zombies`, { recursive: true }); await mkdir(`${OUT}/fonts`, { recursive: true });

    // 楼型：布局代码没变就用上次量的（buildLayout() 要十几秒）
    const layoutKey = sha(...(await Promise.all((await filesUnder('src/layout', /\.js$/)).map((f) => readFile(f)))));
    let towers = stamp.towers?.key === layoutKey && !force ? stamp.towers.data : null;
    if (!towers) {
      const { buildLayout } = await import(pathToFileURL(path.join(ROOT, 'src/layout/layout.js')).href);
      towers = towersFromLayout(buildLayout()); rebuilt.push('towers');
    }
    next.towers = { key: layoutKey, data: towers };

    // 丧尸贴图
    const zKey = await zombieInputs();
    let zombies = stamp.zombies?.key === zKey && !force ? stamp.zombies.files : null;
    if (zombies && zombies.some((e) => !existsSync(e.url.replace(/^\.\//, '')))) zombies = null;
    if (!zombies) {
      log('[bake] 画丧尸贴图（无头浏览器）…');
      const shots = await bakeZombies();
      for (const f of await readdir(`${OUT}/zombies`)) await rm(`${OUT}/zombies/${f}`);
      zombies = [];
      for (const s of shots) {
        const id = `zombie-${s.set}-${s.body}-${s.look ? `${s.look}-` : ''}${s.kind}`, file = `${OUT}/zombies/${id}.jpg`;
        await writeFile(file, Buffer.from(s.data.slice(s.data.indexOf(',') + 1), 'base64'));
        zombies.push({ id, set: s.set, body: s.body, kind: s.kind, look: s.look, size: s.size, url: `./${file}` });
      }
      rebuilt.push('zombies');
    }
    next.zombies = { key: zKey, files: zombies };

    // 行人模型去掉原贴图（每次都做，很快；和 PEOPLE_ASSETS 一个顺序，丧尸贴图按这个顺序编号）
    const peopleManifest = JSON.parse(await readFile('assets/models/people/manifest.json', 'utf8'));
    await mkdir(`${OUT}/people`, { recursive: true });
    const people = [];
    for (const m of peopleManifest.models) {
      const file = `${OUT}/people/${m.id}.glb`, bytes = stripGlbImages(await readFile(`assets/models/people/${m.file}`));
      let old = null; try { old = await readFile(file); } catch { /* 第一次 */ }
      if (!old || !old.equals(bytes)) await writeFile(file, bytes);
      people.push({ id: m.id, name: m.name, poses: m.poses, cycleSeconds: m.cycleSeconds, url: `./${file}` });
    }

    // 字体：开场代码里的字（title-data.js 是生成物，不算）
    const texts = await Promise.all((await filesUnder('src/title', /\.js$/)).filter((f) => !f.endsWith('title-data.js')).map((f) => readFile(f, 'utf8')));
    const chars = collectChars(texts);
    const fKey = sha(chars, ...(await Promise.all(Object.values(FONT_SOURCES).map((f) => readFile(f.file)))));
    if (stamp.fonts?.key !== fKey || force || Object.values(FONT_SOURCES).some((f) => !existsSync(f.out))) {
      log(`[bake] 字体子集化（${chars.length} 个字）…`);
      for (const f of Object.values(FONT_SOURCES)) subsetFont(f.file, f.out, chars);
      rebuilt.push('fonts');
    }
    next.fonts = { key: fKey, chars: chars.length };
    const fonts = Object.fromEntries(Object.entries(FONT_SOURCES).map(([k, f]) => [k, `./${f.out}`]));
    const families = Object.fromEntries(Object.entries(FONT_SOURCES).map(([k, f]) => [k, f.family]));

    if (rebuilt.length) await writeFile(STAMP, JSON.stringify(next, null, 1) + '\n');
    const module = '// 生成物：scripts/title/bake.mjs 写的，别手改。开场的楼型、预画丧尸贴图、子集字体。\n'
      + '// 地址相对网站根目录；打包时 build.mjs（内嵌成 data:）和 build-netlify.mjs（带哈希的独立文件）各自替换这个模块。\n'
      + `export const TITLE_TOWERS = ${JSON.stringify(towers)};\n`
      + `export const TITLE_ZOMBIE_TEX = ${JSON.stringify(zombies)};\n`
      + `export const TITLE_PEOPLE = ${JSON.stringify(people)};\n`
      + `export const TITLE_FONTS = ${JSON.stringify(fonts)};\n`
      + `export const TITLE_FONT_FAMILIES = ${JSON.stringify(families)};\n`;
    let old = ''; try { old = await readFile(DATA, 'utf8'); } catch { /* 第一次 */ }
    if (old !== module) await writeFile(DATA, module);
    if (rebuilt.length) log(`[bake] 重做了：${rebuilt.join('、')}`);
    return { towers, zombies, people, fonts, families, rebuilt };
  } finally {
    process.chdir(cwd);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const r = await bake({ force: process.argv.includes('--force') });
  let bytes = 0; for (const e of r.zombies) bytes += (await readFile(path.join(ROOT, e.url))).length;
  console.log(`楼 ${r.towers.length} 栋 · 丧尸贴图 ${r.zombies.length} 张 ${(bytes / 1024).toFixed(0)} KB · 字体 ${Object.values(r.fonts).join(' ')}`);
}
