// 成组陈设的检查（口袋休息区 18 组、家居店 4 种风格 × 4 个位置）。
// 规则见 set-rules.mjs。这里另外读加工好的模型，量出「放在别的模型上」的东西下面那块台面的真实高度：
// 包围盒只知道模型的最高点（椅背、把手），不知道桌面、座面在哪。
// 用法：node scripts/props/audit-sets.mjs      （需要加工工具，见 build-props.mjs 顶上的说明）有问题时退出码为 1。
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { auditSets } from './set-rules.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'assets/models/props/manifest.json'), 'utf8'));
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const meshes = new Map();

/** 一个模型的全部三角形（模型坐标，米）：[[ax, ay, az, bx, by, bz, cx, cy, cz], ...]。 */
async function triangles(id) {
  if (meshes.has(id)) return meshes.get(id);
  const entry = manifest.props.find((p) => p.id === id);
  const doc = await io.read(path.join(root, 'assets/models/props', entry.file));
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const m = node.getWorldMatrix();
    for (const prim of node.getMesh().listPrimitives()) {
      const P = prim.getAttribute('POSITION'), I = prim.getIndices(), el = [];
      const at = (i) => { P.getElement(i, el); return [m[0] * el[0] + m[4] * el[1] + m[8] * el[2] + m[12], m[1] * el[0] + m[5] * el[1] + m[9] * el[2] + m[13], m[2] * el[0] + m[6] * el[1] + m[10] * el[2] + m[14]]; };
      const n = I ? I.getCount() : P.getCount();
      for (let k = 0; k < n; k += 3) out.push([...at(I ? I.getScalar(k) : k), ...at(I ? I.getScalar(k + 1) : k + 1), ...at(I ? I.getScalar(k + 2) : k + 2)]);
    }
  }
  meshes.set(id, out);
  return out;
}

/**
 * 模型在 (x, z)（模型坐标）处朝上的面的高度：过这一点的竖线和三角形的交点。
 * 返回所有交点高度（从高到低）。台面是其中某一个，由调用方挑离摆放高度最近的。
 */
export async function surfacesAt(id, x, z) {
  const hits = [];
  for (const t of await triangles(id)) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
    hits.push(u * ay + v * by + w * cy);
  }
  return hits.sort((p, q) => q - p);
}

let failed = 0;
for (const set of auditSets()) {
  const lines = set.findings.map((f) => `[${f.rule}] ${f.id}：${f.why}`);
  for (const { guest, host } of set.resting) {
    // 客人底面中心换到主人的模型坐标
    const dx = guest.centre[0] - host.x, dz = guest.centre[1] - host.z, cos = Math.cos(host.ry), sin = Math.sin(host.ry);
    const lx = (dx * cos - dz * sin) / host.scale[0], lz = (dx * sin + dz * cos) / host.scale[2];
    const tops = (await surfacesAt(host.id, lx, lz)).map((h) => host.y + h * host.scale[1]);
    if (!tops.length) { lines.push(`[support] ${guest.id}：正下方没有 ${host.id} 的面（放到了它的边缘之外）`); continue; }
    const nearest = tops.reduce((best, h) => (Math.abs(h - guest.y0) < Math.abs(best - guest.y0) ? h : best));
    const gap = guest.y0 - nearest;
    // 盆栽种在花盆、花箱里：底面可以比盆口低；其余的要落在面上（±2.5 cm）
    const planted = /^(plant_|flower_)/.test(guest.id) && /pot|planter/.test(host.id);
    if (planted ? guest.y0 > host.y1 + 0.02 : Math.abs(gap) > 0.025) lines.push(`[support] ${guest.id}：底面在 ${guest.y0.toFixed(3)} m，${host.id} 在这一点最近的面在 ${nearest.toFixed(3)} m（${gap > 0 ? '悬空' : '陷进去'} ${Math.abs(gap * 100).toFixed(1)} cm）；这一点所有的面：${tops.map((h) => h.toFixed(3)).join(' / ')}`);
  }
  if (lines.length) { failed += lines.length; console.log(set.name); for (const l of lines) console.log('  ' + l); }
}
console.log(failed ? `\n成组陈设有 ${failed} 处问题。` : '成组陈设没有发现问题。');
process.exit(failed ? 1 : 0);
