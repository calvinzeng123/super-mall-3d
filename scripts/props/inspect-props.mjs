// 查看 Poly Haven 模型的结构：节点、包围盒、材质、UV 范围、三角形数。定清单时用，不产出素材。
// 用法：node scripts/props/inspect-props.mjs <缓存目录> <id> [<id> ...]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { fetchModel, assetInfo } from './polyhaven.mjs';

const [cache, ...ids] = process.argv.slice(2);
if (!cache || !ids.length) { console.error('用法：inspect-props.mjs <缓存目录> <id> ...'); process.exit(1); }

/** 读入 glTF，摘掉所有贴图引用（只看几何）。 */
export async function readGeometryOnly(gltfPath) {
  const json = JSON.parse(await readFile(gltfPath, 'utf8'));
  for (const m of json.materials || []) {
    delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
    if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
    delete m.extensions;
  }
  delete json.textures; delete json.images; delete json.samplers;
  const resources = {};
  for (const b of json.buffers || []) resources[b.uri] = await readFile(path.join(path.dirname(gltfPath), b.uri));
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).readJSON({ json, resources });
}

const f = (n) => n.toFixed(2);
for (const id of ids) {
  try {
    const info = await assetInfo(cache, id);
    const { gltfPath } = await fetchModel(cache, id, () => false);
    const raw = JSON.parse(await readFile(gltfPath, 'utf8'));
    const doc = await readGeometryOnly(gltfPath);
    const scene = doc.getRoot().listScenes()[0];
    const b = getBounds(scene);
    const size = b.max.map((v, i) => v - b.min[i]);
    console.log(`\n# ${id} · ${info.name} · ${info.polycount} tris · ${size.map(f).join(' × ')} m (x,y,z) · min y ${f(b.min[1])}`);
    const mats = (raw.materials || []).map((m) => `${m.name}${m.alphaMode && m.alphaMode !== 'OPAQUE' ? `[${m.alphaMode}]` : ''}${m.doubleSided ? '[2s]' : ''}`);
    console.log(`  materials(${mats.length}): ${mats.join(', ')}`);
    const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh());
    for (const n of nodes.slice(0, 24)) {
      const nb = getBounds(n), ns = nb.max.map((v, i) => v - nb.min[i]);
      let tris = 0, uvMin = [Infinity, Infinity], uvMax = [-Infinity, -Infinity];
      const names = new Set();
      for (const p of n.getMesh().listPrimitives()) {
        tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
        names.add(p.getMaterial()?.getName());
        const uv = p.getAttribute('TEXCOORD_0');
        if (uv) { const lo = uv.getMin([0, 0]), hi = uv.getMax([0, 0]); uvMin = uvMin.map((v, i) => Math.min(v, lo[i])); uvMax = uvMax.map((v, i) => Math.max(v, hi[i])); }
      }
      console.log(`  - ${n.getName()} · ${Math.round(tris)} tris · ${ns.map(f).join('×')} @ x${f((nb.min[0] + nb.max[0]) / 2)} z${f((nb.min[2] + nb.max[2]) / 2)} · uv ${uvMin.map(f)}..${uvMax.map(f)} · ${[...names].join(',')}`);
    }
    if (nodes.length > 24) console.log(`  … ${nodes.length - 24} more nodes`);
  } catch (error) { console.log(`\n# ${id}: FAILED ${error.message}`); }
}
