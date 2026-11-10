// 核对每个模型的「正面」是不是真的朝 +Z。坐具用几何判断：靠背（高处的顶点）应该在座面的后方（−Z 一侧）。
// 用法：node scripts/props/audit-fronts.mjs      （需要加工工具，见 build-props.mjs 顶上的说明）
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'assets/models/props/manifest.json'), 'utf8'));
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

/** 靠背相对座面的前后偏移（米）：高处四分之一的顶点的 z 均值减去中段顶点的 z 均值。负数 = 靠背在后（正面朝 +Z）。 */
export async function backrestOffset(file) {
  const doc = await io.read(file);
  const node = doc.getRoot().listNodes().find((n) => n.getMesh());
  const prim = node.getMesh().listPrimitives()[0], P = prim.getAttribute('POSITION'), m = node.getWorldMatrix(), el = [];
  const pts = [];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, el); pts.push([m[0] * el[0] + m[4] * el[1] + m[8] * el[2] + m[12], m[1] * el[0] + m[5] * el[1] + m[9] * el[2] + m[13], m[2] * el[0] + m[6] * el[1] + m[10] * el[2] + m[14]]); }
  const ys = pts.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), h = y1 - y0;
  const mean = (list) => list.reduce((s, p) => s + p[2], 0) / Math.max(1, list.length);
  const top = pts.filter((p) => p[1] > y0 + h * 0.78), mid = pts.filter((p) => p[1] > y0 + h * 0.3 && p[1] < y0 + h * 0.55);
  return { offset: mean(top) - mean(mid), top: top.length, mid: mid.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const p of manifest.props.filter((x) => x.group === 'seat' || /chair|sofa|bench/.test(x.id))) {
    const r = await backrestOffset(path.join(root, 'assets/models/props', p.file));
    console.log(`${p.id.padEnd(16)} backrest z-offset ${r.offset.toFixed(3)} m  ${r.offset < -0.03 ? 'front = +Z ✓' : r.offset > 0.03 ? 'front = −Z ✗ (faces backwards)' : 'no clear backrest'}`);
  }
}
