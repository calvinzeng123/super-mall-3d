// Dedicated public output: only the application and the runtime assets it uses.
// The existing single-file build remains available for offline delivery.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FPS_MODEL_ASSETS } from '../src/fps/model-data.js';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
await import('../build.mjs');

const output = path.join(root, 'dist/netlify');
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'assets'), { recursive: true });
const files = [];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function emitAsset(name, extension, bytes, kind) {
  const hash = sha256(bytes), relative = `assets/${name}.${hash.slice(0, 16)}.${extension}`;
  await writeFile(path.join(output, relative), bytes);
  files.push({ path: relative, bytes: bytes.length, sha256: hash, kind });
  return `./${relative}`;
}

// Read the offline generator's metadata, so image deduplication and dimensions
// continue to have one source of truth. The plugin prevents base64 being bundled.
async function generatedData(filename, exportName) {
  const text = await readFile(`src/render/${filename}`, 'utf8');
  const prefix = `export const ${exportName} = `;
  const start = text.indexOf(prefix);
  if (start < 0 || !text.trimEnd().endsWith(';')) throw new Error(`Invalid generated module: ${filename}`);
  return JSON.parse(text.slice(start + prefix.length).trim().slice(0, -1));
}
function dataBytes(url, mime) {
  const prefix = `data:${mime};base64,`;
  if (!url.startsWith(prefix)) throw new Error(`Unexpected asset encoding: ${mime}`);
  return Buffer.from(url.slice(prefix.length), 'base64');
}

const surfaces = await generatedData('pbr-data.js', 'SURFACE_ASSETS');
for (const surface of surfaces) for (const [kind, url] of Object.entries(surface.maps)) {
  surface.maps[kind] = await emitAsset(`${surface.id}-${kind}`, 'jpg', dataBytes(url, 'image/jpeg'), 'texture');
}
const suiteURL = await emitAsset('suite', 'glb', dataBytes(await generatedData('suite-data.js', 'SUITE_MODEL_URL'), 'model/gltf-binary'), 'suite');
const people = await generatedData('people-data.js', 'PEOPLE_ASSETS');
for (const person of people) person.url = await emitAsset(`person-${person.id}`, 'glb', dataBytes(person.url, 'model/gltf-binary'), 'textured-person');
// Both phone modes physically omit the residential district. Do not publish or
// download its 01/02/03 models; the source GLBs remain in the authoring repo.
const residences = [];
const fpsAssets = await Promise.all(FPS_MODEL_ASSETS.map(async a=>({...a,
  url:await emitAsset(a.id==='rifle'?'smg45':a.id==='pistol'?'deagle':'fps-hands','glb',await readFile(a.url.replace(/^\.\//,'')),'fps-model'),
})));
const coverURL = await emitAsset('cover','jpg',await readFile('docs/images/hotel-apartment-sides-overview.jpg'),'cover');

const replacements = new Map([
  ['people-data.js', `export const PEOPLE_ASSETS = ${JSON.stringify(people)};`],
  ['pbr-data.js', `export const SURFACE_ASSETS = ${JSON.stringify(surfaces)};`],
  ['suite-data.js', `export const SUITE_MODEL_URL = ${JSON.stringify(suiteURL)};`],
  ['residential-data.js', `export const RESIDENTIAL_ASSETS = ${JSON.stringify(residences)};`],
  ['model-data.js', `export const FPS_MODEL_ASSETS = ${JSON.stringify(fpsAssets)};`],
  ['cover-data.js', `export const COVER_URL = ${JSON.stringify(coverURL)};`],
]);
const bundled = await build({
  entryPoints: ['src/main.js'], bundle: true, splitting:true, format: 'esm', minify: true,
  outdir:path.join(output,'assets'), entryNames:'[name].[hash]',chunkNames:'chunk.[hash]',metafile:true,
  target: 'es2022', write: false, legalComments: 'none',
  plugins: [{ name: 'local-runtime-assets', setup(builder) {
    builder.onLoad({ filter: /[\\/](?:pbr|suite|residential|people|model|cover)-data\.js$/ }, args => ({
      contents: replacements.get(path.basename(args.path)), loader: 'js',
    }));
  } }],
});
let script;
for(const file of bundled.outputFiles){
  const relative=path.relative(output,file.path).split(path.sep).join('/');
  await writeFile(file.path,file.contents);
  const isEntry=/\/main\./.test(file.path);
  files.push({path:relative,bytes:file.contents.length,sha256:sha256(file.contents),kind:isEntry?'launcher-script':'application-chunk'});
  if(isEntry)script=`./${relative}`;
}
if(!script)throw new Error('Missing launcher entry');
const credits = await readFile('assets/models/fps/CREDITS.txt','utf8');
const escaped = credits.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const creditsPage='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>云澜汇素材署名</title><style>body{max-width:760px;margin:40px auto;padding:0 22px;background:#101d28;color:#e2eaf0;font:15px/1.8 system-ui}pre{white-space:pre-wrap}a{color:#edc188}</style><h1>云澜汇 · 素材署名</h1><p><a href="./">返回封面</a></p><pre>'+escaped+'</pre><p>园区石材、木纹等 PBR 贴图来自 Poly Haven（CC0）。贴图行人来自 Microsoft Rocketbox（MIT）。用户提供的套房模型由用户授权在本项目使用，不属于 CC0。</p></html>';
await writeFile(path.join(output,'credits.html'),creditsPage);
files.push({path:'credits.html',bytes:Buffer.byteLength(creditsPage),sha256:sha256(creditsPage),kind:'credits'});
await mkdir(path.join(output,'assets/models/fps'),{recursive:true});
for(const name of ['CREDITS.txt','UPSTREAM-SMG-LICENSE.md','UPSTREAM-DESERT-EAGLE-LICENSE.md','UPSTREAM-MIT-LICENSE.txt','sources.json']){
  const bytes=await readFile(`assets/models/fps/${name}`),relative=`assets/models/fps/${name}`;
  await writeFile(path.join(output,relative),bytes);files.push({path:relative,bytes:bytes.length,sha256:sha256(bytes),kind:'license'});
}
const license = await readFile('node_modules/three/LICENSE', 'utf8');
const peopleLicense = await readFile('assets/models/people/LICENSE.txt', 'utf8');
const shell = (await readFile('src/shell.html', 'utf8'))
  .replace(/<link[^>]*https:\/\/fonts\.[^>]+>\s*/g, '')
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
if (!shell.includes('<!--APP-->')) throw new Error('src/shell.html 缺少 <!--APP--> 占位');
const body = shell.replace('<!--APP-->', () => `<!-- Three.js license\n${license}\n-->\n<!-- Microsoft Rocketbox avatar license\n${peopleLicense}\n-->\n<script type="module" src="${script}"></script>`);
const html = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '</head>\n<body>\n' + body + '\n</body>\n</html>\n';
await writeFile(path.join(output, 'index.html'), html);
files.push({ path: 'index.html', bytes: Buffer.byteLength(html), sha256: sha256(html), kind: 'document' });
await writeFile(path.join(output, 'asset-manifest.json'), JSON.stringify({ version: 1, files }, null, 2) + '\n');
console.log(`dist/netlify: ${files.length + 1} files · ${(files.reduce((sum, file) => sum + file.bytes, 0) / 1024 / 1024).toFixed(2)} MiB · lazy launcher ${script}`);
