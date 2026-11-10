// Poly Haven 下载：只取 1k 的 glTF、它的 .bin 和用得到的贴图（底色、ARM），按 md5 校验后放进缓存目录。
// 素材全部是 CC0；出处和校验值写进 assets/models/props/manifest.json，运行时不访问 Poly Haven。
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const AGENT = 'yunlan-props-pipeline/1.0';
const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');
const exists = (file) => stat(file).then(() => true, () => false);

async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      if (i >= tries - 1) throw new Error(`${url}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}

async function cached(file, url, sum) {
  if (await exists(file)) {
    const bytes = await readFile(file);
    if (!sum || md5(bytes) === sum) return bytes;
  }
  const bytes = await get(url);
  if (sum && md5(bytes) !== sum) throw new Error(`md5 mismatch: ${url}`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return bytes;
}

/** 资产信息（名称、作者、类别），整份目录只下载一次。 */
export async function assetInfo(cache, id) {
  const file = path.join(cache, '_catalog-models.json');
  if (!(await exists(file))) await writeFile(file, await get('https://api.polyhaven.com/assets?t=models'));
  const all = JSON.parse(await readFile(file, 'utf8'));
  if (!all[id]) throw new Error(`Poly Haven 没有这个模型：${id}`);
  return all[id];
}

/**
 * 下载一个模型的 1k glTF 到 cache/<id>/，返回 { gltfPath, files }。
 * wanted(name) 决定要不要某张贴图（默认只要底色、ARM 和单独的透明度图，不要法线）。
 */
export async function fetchModel(cache, id, wanted = (name) => !/_nor_(gl|dx)_|_disp_|_rough_|_metal_|_ao_|_spec_/.test(name)) {
  const dir = path.join(cache, id);
  await mkdir(dir, { recursive: true });
  const listFile = path.join(dir, '_files.json');
  if (!(await exists(listFile))) await writeFile(listFile, await get(`https://api.polyhaven.com/files/${id}`));
  const list = JSON.parse(await readFile(listFile, 'utf8'));
  const entry = list.gltf?.['1k']?.gltf;
  if (!entry) throw new Error(`${id}: 没有 1k glTF`);
  const files = [];
  const gltfPath = path.join(dir, path.basename(entry.url));
  await cached(gltfPath, entry.url, entry.md5);
  files.push({ path: path.basename(entry.url), url: entry.url, md5: entry.md5, bytes: entry.size });
  // glTF 里引用但没下载的贴图（法线等）在读入前会从 JSON 里摘掉，见 build-props.mjs
  for (const [name, item] of Object.entries(entry.include || {})) {
    if (name.endsWith('.bin') || wanted(name)) {
      await cached(path.join(dir, name), item.url, item.md5);
      files.push({ path: name, url: item.url, md5: item.md5, bytes: item.size });
    }
  }
  return { dir, gltfPath, files };
}
