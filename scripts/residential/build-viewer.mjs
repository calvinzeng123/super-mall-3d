import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(directory, '../..');
const defaultOutputDirectory = process.env.RESIDENTIAL_OUTPUT_DIR || path.join(project, 'prototypes/residential03');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/residential/build-viewer.mjs [model.glb] [output.html]\nDefaults to prototypes/residential03/ in this repository. Set RESIDENTIAL_OUTPUT_DIR for another default directory, or pass both file paths explicitly.');
  process.exit(0);
}
const modelPath = path.resolve(args[0] || path.join(defaultOutputDirectory, '云澜汇_03四房两厅.glb'));
const outputPath = path.resolve(args[1] || path.join(defaultOutputDirectory, '住宅03_离线漫游.html'));
const planPath = path.join(directory, 'plan_03.json');
const model = await fs.readFile(modelPath).catch(error => { throw new Error(`住宅模型尚未生成或无法读取：${modelPath}`, { cause: error }); });
if (model.length < 20 || model.readUInt32LE(0) !== 0x46546c67) throw new Error('输入文件不是有效的 GLB 模型');
if (model.readUInt32LE(8) !== model.length) throw new Error('GLB 文件长度不完整');
let plan = {};
try { plan = JSON.parse(await fs.readFile(planPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const metadata = { title: '云澜汇 · 住宅03 四房两厅', modelFile: path.basename(modelPath), modelBytes: model.length, modelSHA256: crypto.createHash('sha256').update(model).digest('hex'), threeVersion: '0.170.0', coordinateSystem: 'glTF Y up; Blender (x,y,z) maps to glTF (x,z,-y)', standalone: true };
const result = await build({
  entryPoints: [path.join(directory, 'viewer.js')], absWorkingDir: project,
  bundle: true, write: false, format: 'iife', minify: true, target: ['es2022'], legalComments: 'inline',
  define: {
    __RESIDENTIAL_MODEL__: JSON.stringify(`data:model/gltf-binary;base64,${model.toString('base64')}`),
    __RESIDENTIAL_PLAN__: JSON.stringify(plan), __RESIDENTIAL_BUILD__: JSON.stringify(metadata),
  },
});
const template = await fs.readFile(path.join(directory, 'viewer.html'), 'utf8');
const license = await fs.readFile(path.join(project, 'node_modules/three/LICENSE'), 'utf8');
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = template.replace('/*VIEWER_BUNDLE*/', () => script).replace('<!--THIRD_PARTY_LICENSE-->', () => `<!-- Three.js ${metadata.threeVersion}\n${license.replace(/-->/g, '-- >')}\n-->`);
if (html.includes('/*VIEWER_BUNDLE*/')) throw new Error('Viewer bundle placeholder was not replaced');
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html);
console.log(JSON.stringify({ output: outputPath, htmlBytes: Buffer.byteLength(html), ...metadata }, null, 2));
