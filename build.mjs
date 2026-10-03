// 生成三个产物：
//   index.html          开发版，直接引用 ./src/main.js（需本地 http 服务）
//   dist/artifact.html  发布片段（无 doctype/head/body，供 Artifact 包装）
//   dist/mall.html      完整单文件页面，可双击打开
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const shell = await readFile('src/shell.html', 'utf8');
if (!shell.includes('<!--APP-->')) throw new Error('src/shell.html 缺少 <!--APP--> 占位');

await writeFile('index.html', wrap(shell.replace('<!--APP-->', '<script type="module" src="./src/main.js"></script>')));

const out = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  write: false,
  external: ['three', 'three/addons/*'],
  legalComments: 'none',
});
const code = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = shell.replace('<!--APP-->', () => `<script type="module">${code}</script>`);

await mkdir('dist', { recursive: true });
await writeFile('dist/artifact.html', page);
await writeFile('dist/mall.html', wrap(page));

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log(`index.html ok · dist/artifact.html ${kb(page)} · dist/mall.html ${kb(wrap(page))}`);

function wrap(body) {
  return (
    '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    '</head>\n<body>\n' + body + '\n</body>\n</html>\n'
  );
}
