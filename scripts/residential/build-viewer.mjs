import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(directory, '../..');
const args = process.argv.slice(2), positional = [];
let requestedPlan, requestedUnit;
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/residential/build-viewer.mjs [model.glb] [output.html] [--plan plan.json | --unit 01]\nDefaults to plan_03.json and prototypes/residential03/. RESIDENTIAL_OUTPUT_DIR overrides the default output directory. Existing positional usage is unchanged.');
  process.exit(0);
}
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--plan' || args[i] === '--unit') {
    const option = args[i], value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
    if (option === '--plan') requestedPlan = value; else requestedUnit = value.padStart(2, '0');
  } else if (args[i].startsWith('--')) throw new Error(`Unknown option: ${args[i]}`);
  else positional.push(args[i]);
}
if (positional.length > 2 || (requestedPlan && requestedUnit)) throw new Error('Pass at most two file paths and only one of --plan / --unit.');
if (requestedUnit && !/^\d{2}$/.test(requestedUnit)) throw new Error('--unit must be a two-digit unit number');
const planPath = requestedPlan ? path.resolve(requestedPlan) : path.join(directory, `plan_${requestedUnit || '03'}.json`);
const planText = await fs.readFile(planPath, 'utf8');
const plan = JSON.parse(planText);
const unit = String(plan.unit || plan.id?.match(/(\d+)$/)?.[1] || requestedUnit || '03').padStart(2, '0');
const defaultOutputDirectory = process.env.RESIDENTIAL_OUTPUT_DIR || path.join(project, `prototypes/residential${unit}`);
const basename = plan.model_basename || (unit === '03' ? '云澜汇_03四房两厅' : `云澜汇_${unit}三房两厅`);
const modelPath = path.resolve(positional[0] || path.join(defaultOutputDirectory, `${basename.replace(/\.glb$/i, '')}.glb`));
const outputPath = path.resolve(positional[1] || path.join(defaultOutputDirectory, `住宅${unit}_离线漫游.html`));
const model = await fs.readFile(modelPath).catch(error => { throw new Error(`住宅模型尚未生成或无法读取：${modelPath}`, { cause: error }); });
if (model.length < 20 || model.readUInt32LE(0) !== 0x46546c67) throw new Error('输入文件不是有效的 GLB 模型');
if (model.readUInt32LE(8) !== model.length) throw new Error('GLB 文件长度不完整');
const canonical = id => id === 'primary' ? 'master' : id;
const defaultNames = { overview: '整体', plan: '平面', living: '客厅', dining: '餐厅', master: '主卧', bedroom2: '儿童房', bedroom3: '次卧', guest: '客卧', kitchen: '厨房', bath: '主卫', commonBath: '公卫', balcony: '阳台' };
const authored = plan.viewer?.views || plan.viewerViews || plan.views || {};
const views = Object.fromEntries((Array.isArray(authored) ? authored.map(v => [v.id,v]) : Object.entries(authored)).map(([id,v]) => [canonical(id),v]));
const legacyOrder = Object.keys(defaultNames);
const viewOrder = (plan.viewer?.viewOrder || (unit === '03' ? legacyOrder : ['overview','plan', ...Object.keys(views).filter(id => !['overview','plan'].includes(id))])).map(canonical);
if (new Set(viewOrder).size !== viewOrder.length) throw new Error('Duplicate viewer view IDs');
for (const id of viewOrder) {
  if (!/^[a-zA-Z][\w-]*$/.test(id)) throw new Error(`Invalid viewer view ID: ${id}`);
  if (unit !== '03' && !['overview','plan'].includes(id) && (!views[id]?.position || !views[id]?.target)) throw new Error(`Missing authored camera for ${id}`);
}
const identity = plan.viewer?.identity || `云澜汇 · 住宅${unit}`;
const metadata = {
  title: plan.viewer?.title || (unit === '03' ? '云澜汇 · 住宅03 四房两厅' : `云澜汇 · ${plan.title || `住宅${unit} 三房两厅`}`),
  identity, description: plan.viewer?.description || (unit === '03' ? '四房两厅 · 三卫 · 南向大阳台' : '三房两厅 · 双卫 · 大阳台'), unit,
  views: viewOrder.map(id => ({ id, label: plan.viewer?.labels?.[id] || (unit === '03' ? defaultNames[id] : views[id]?.label || defaultNames[id]) || id })),
  modelFile: path.basename(modelPath), modelBytes: model.length, modelSHA256: crypto.createHash('sha256').update(model).digest('hex'),
  planFile: path.basename(planPath), planSHA256: crypto.createHash('sha256').update(planText).digest('hex'),
  threeVersion: '0.170.0', coordinateSystem: 'glTF Y up; Blender (x,y,z) maps to glTF (x,z,-y)', standalone: true,
};
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
const escapeHTML = text => String(text).replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]));
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = template.replace('/*VIEWER_BUNDLE*/', () => script)
  .replaceAll('{{TITLE}}', escapeHTML(metadata.title)).replaceAll('{{IDENTITY}}', escapeHTML(identity)).replaceAll('{{DESCRIPTION}}', escapeHTML(metadata.description))
  .replace('<!--VIEW_BUTTONS-->', () => metadata.views.map(({id,label}) => `<button type="button" data-view="${id}" aria-pressed="${id === 'overview'}">${escapeHTML(label)}</button>`).join('\n        '))
  .replace('<!--THIRD_PARTY_LICENSE-->', () => `<!-- Three.js ${metadata.threeVersion}\n${license.replace(/-->/g, '-- >')}\n-->`);
if (html.includes('/*VIEWER_BUNDLE*/') || html.includes('<!--VIEW_BUTTONS-->') || /\{\{(?:TITLE|IDENTITY|DESCRIPTION)\}\}/.test(html)) throw new Error('Viewer template placeholder was not replaced');
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html);
console.log(JSON.stringify({ output: outputPath, htmlBytes: Buffer.byteLength(html), ...metadata }, null, 2));
