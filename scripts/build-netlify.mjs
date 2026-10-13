// Dedicated public output: only the application and the runtime assets it uses.
// The existing single-file build remains available for offline delivery.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
const residences = await generatedData('residential-data.js', 'RESIDENTIAL_ASSETS');
for (const record of residences) {
  const bytes = Buffer.from(record.data, 'base64');
  if (bytes.length !== record.compressedBytes || sha256(bytes) !== record.compressedSHA256)
    throw new Error(`住宅${record.unit}压缩资源校验失败`);
  // .bin must be served without Content-Encoding: gzip. DecompressionStream
  // consumes the gzip bytes itself; automatic HTTP decompression would corrupt it.
  record.url = await emitAsset(`residence-${record.unit}`, 'bin', bytes, 'residence-gzip');
  delete record.data;
}

const replacements = new Map([
  ['pbr-data.js', `export const SURFACE_ASSETS = ${JSON.stringify(surfaces)};`],
  ['suite-data.js', `export const SUITE_MODEL_URL = ${JSON.stringify(suiteURL)};`],
  ['residential-data.js', `export const RESIDENTIAL_ASSETS = ${JSON.stringify(residences)};`],
]);
const bundled = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'esm', minify: true,
  target: 'es2022', write: false, legalComments: 'none',
  plugins: [{ name: 'local-runtime-assets', setup(builder) {
    builder.onLoad({ filter: /[\\/](?:pbr|suite|residential)-data\.js$/ }, args => ({
      contents: replacements.get(path.basename(args.path)), loader: 'js',
    }));
  } }],
});
const script = await emitAsset('app', 'js', bundled.outputFiles[0].contents, 'application');
const license = await readFile('node_modules/three/LICENSE', 'utf8');
const shell = (await readFile('src/shell.html', 'utf8'))
  .replace(/<link[^>]*https:\/\/fonts\.[^>]+>\s*/g, '')
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
if (!shell.includes('<!--APP-->')) throw new Error('src/shell.html 缺少 <!--APP--> 占位');
const body = shell.replace('<!--APP-->', () => `<!-- Three.js license\n${license}\n-->\n<script type="module" src="${script}"></script>`);
const html = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '</head>\n<body>\n' + body + '\n</body>\n</html>\n';
await writeFile(path.join(output, 'index.html'), html);
files.push({ path: 'index.html', bytes: Buffer.byteLength(html), sha256: sha256(html), kind: 'document' });
await writeFile(path.join(output, 'asset-manifest.json'), JSON.stringify({ version: 1, files }, null, 2) + '\n');
console.log(`dist/netlify: ${files.length + 1} files · ${(files.reduce((sum, file) => sum + file.bytes, 0) / 1024 / 1024).toFixed(2)} MiB · application ${(bundled.outputFiles[0].contents.length / 1024).toFixed(0)} KiB`);
