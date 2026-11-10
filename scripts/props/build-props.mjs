// 把 Poly Haven 的 CC0 模型加工成园区里能成百上千摆放的小模型：
//   每个模型一个网格、一种材质、一张贴图（多材质拼成图集，环境光遮蔽烘进底色），减面，量化，贴图压成 WebP。
// 产出：assets/models/props/<id>.glb、assets/models/props/manifest.json（出处、校验值、加工参数）、
//       每个模型另有 <id>.lod1.glb：远景用的简化几何（不带贴图）。
//       src/render/props/prop-data.js（运行时用的目录：路径、尺寸、三角形数）。
//
// 用法：node scripts/props/build-props.mjs <缓存目录> [id ...]      （不写 id 就全部重做）
// 依赖不进 package.json（只有加工素材时才用）：
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, meshopt, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { fetchModel, assetInfo } from './polyhaven.mjs';
import { PROP_CATALOG } from './catalog.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OUT = path.join(root, 'assets/models/props');
const [cache, ...only] = process.argv.slice(2);
if (!cache) { console.error('用法：build-props.mjs <缓存目录> [id ...]'); process.exit(1); }
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const matches = (list, name) => (list || []).some((rule) => (rule instanceof RegExp ? rule.test(name) : rule === name));
const AO_STRENGTH = 0.65;

// ---------- 小矩阵工具（列主序 4×4，和 glTF 一致） ----------
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const rotY = (deg) => { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
const rotX = (deg) => { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const applyPoint = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
/** 法线用逆转置的 3×3；这里只有旋转和缩放，按列的平方长度归一即可（非均匀缩放也成立）。 */
const applyNormal = (m, x, y, z) => {
  const sx = m[0] ** 2 + m[1] ** 2 + m[2] ** 2, sy = m[4] ** 2 + m[5] ** 2 + m[6] ** 2, sz = m[8] ** 2 + m[9] ** 2 + m[10] ** 2;
  const nx = m[0] * x / sx + m[4] * y / sy + m[8] * z / sz, ny = m[1] * x / sx + m[5] * y / sy + m[9] * z / sz, nz = m[2] * x / sx + m[6] * y / sy + m[10] * z / sz;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
};

/** 读入 glTF；没下载的贴图（法线等）用 1×1 占位，材质里不再引用。 */
async function readSource(gltfPath) {
  const dir = path.dirname(gltfPath), json = JSON.parse(await readFile(gltfPath, 'utf8'));
  for (const m of json.materials || []) { delete m.normalTexture; delete m.emissiveTexture; }
  const blank = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#808080' } }).png().toBuffer();
  const resources = {};
  for (const b of json.buffers || []) resources[b.uri] = await readFile(path.join(dir, b.uri));
  for (const image of json.images || []) {
    const bytes = await readFile(path.join(dir, image.uri)).catch(() => null);
    resources[image.uri] = bytes || blank;
    if (!bytes) image.mimeType = 'image/png';
  }
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).readJSON({ json, resources });
}

/** 一种材质 → 一格贴图：底色乘上环境光遮蔽；顺便量出平均粗糙度和金属度。 */
async function bakeCell(material, width, height, keepAlpha, tintable = false) {
  const factor = material.getBaseColorFactor();
  const base = material.getBaseColorTexture()?.getImage();
  const arm = (material.getMetallicRoughnessTexture() || material.getOcclusionTexture())?.getImage();
  const raw = (bytes) => sharp(bytes).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
  const rgba = base ? await raw(base) : Buffer.alloc(width * height * 4, 255);
  let rough = material.getRoughnessFactor(), metal = material.getMetallicFactor();
  if (arm) {
    const data = await raw(arm);
    let r = 0, m = 0;
    for (let i = 0; i < width * height; i++) {
      const ao = 1 - AO_STRENGTH * (1 - data[i * 4] / 255);
      for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(rgba[i * 4 + c] * ao);
      r += data[i * 4 + 1]; m += data[i * 4 + 2];
    }
    rough *= r / (width * height * 255); metal *= m / (width * height * 255);
  }
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(rgba[i * 4 + c] * factor[c]);
    rgba[i * 4 + 3] = keepAlpha ? Math.round(rgba[i * 4 + 3] * factor[3]) : 255;
  }
  if (tintable) {
    // 可染色：去掉原来的颜色只留明暗，把最常见的亮度提到接近白，运行时乘上想要的颜色
    const luma = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) luma[i] = Math.round(0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]);
    const median = [...luma].sort((a, b) => a - b)[luma.length >> 1] || 128;
    for (let i = 0; i < width * height; i++) {
      const v = Math.min(255, Math.round(luma[i] / median * 215));
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    }
  }
  return { rgba, rough, metal };
}

/**
 * 直接调 meshopt 减面（gltf-transform 的 simplify 不给这些开关）：
 * Permissive 允许跨贴图接缝合并，Prune 丢掉零碎小件；还不够就用不顾拓扑的 sloppy 版本（只给远景用）。
 */
function reduce(doc, prim, target, steps, sloppy = false) {
  const P = prim.getAttribute('POSITION'), positions = new Float32Array(P.getCount() * 3), el = [];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, el); positions.set(el, i * 3); }
  let indices = new Uint32Array(prim.getIndices().getArray());
  for (const [error, flags] of steps) {
    if (indices.length / 3 <= target * 1.15) break;
    [indices] = MeshoptSimplifier.simplify(indices, positions, 3, target * 3, error, flags);
  }
  if (sloppy && indices.length / 3 > target * 1.5) [indices] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target * 3, 0.6);
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(doc.getRoot().listBuffers()[0]));
  compactPrimitive(prim);
}

async function buildProp(entry) {
  const info = await assetInfo(cache, entry.src);
  const fetched = await fetchModel(cache, entry.src);
  const source = await readSource(fetched.gltfPath);
  const scene = source.getRoot().listScenes()[0];

  // 1) 收集三角形：只留清单点名的节点，丢掉玻璃罩一类的材质
  const parts = [];
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh || (entry.nodes && !matches(entry.nodes, node.getName())) || matches(entry.dropNodes, node.getName())) return;
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      if (prim.getMode() !== 4 || !material || matches(entry.dropMaterials, material.getName())) continue;
      parts.push({ node, prim, material });
    }
  });
  if (!parts.length) throw new Error(`${entry.id}: 没有可用的网格（节点名或材质名不对？）`);
  const materials = [...new Set(parts.map((p) => p.material))];
  const sourceTriangles = parts.reduce((n, p) => n + (p.prim.getIndices()?.getCount() ?? p.prim.getAttribute('POSITION').getCount()) / 3, 0);

  // 2) 图集：材质少就横排，多了排成方阵
  const alpha = entry.alpha ?? materials.some((m) => m.getAlphaMode() === 'MASK');
  const cols = materials.length <= 2 ? materials.length : Math.ceil(Math.sqrt(materials.length));
  const rows = Math.ceil(materials.length / cols);
  const size = entry.tex || 512, cw = Math.floor(size / cols), ch = Math.floor(size / rows);
  const atlas = Buffer.alloc(size * size * 4, 0);
  let rough = 0, metal = 0, weight = 0;
  const cells = new Map();
  for (const [index, material] of materials.entries()) {
    const cx = index % cols, cy = Math.floor(index / cols);
    const cell = await bakeCell(material, cw, ch, alpha && material.getAlphaMode() !== 'OPAQUE', !!entry.tint);
    for (let y = 0; y < ch; y++) cell.rgba.copy(atlas, ((cy * ch + y) * size + cx * cw) * 4, y * cw * 4, (y + 1) * cw * 4);
    const tris = parts.filter((p) => p.material === material).reduce((n, p) => n + (p.prim.getIndices()?.getCount() ?? p.prim.getAttribute('POSITION').getCount()), 0);
    rough += cell.rough * tris; metal += cell.metal * tris; weight += tris;
    cells.set(material, { cx, cy });
  }
  rough /= weight; metal /= weight;

  // 3) 合成一个网格：顶点烘到世界坐标，UV 映进各自的格子（四周各让出 1.5 个像素，免得相邻格子串色）
  const fix = mul(rotY(entry.yaw || 0), rotX(entry.pitch || 0));
  const position = [], normal = [], uv = [], indices = [];
  let tiled = 0;
  for (const { node, prim, material } of parts) {
    const world = mul(fix, node.getWorldMatrix());
    const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0');
    const start = position.length / 3, { cx, cy } = cells.get(material), el = [];
    const padU = 1.5 / cw, padV = 1.5 / ch;
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, el); position.push(...applyPoint(world, el[0], el[1], el[2]));
      if (N) { N.getElement(i, el); normal.push(...applyNormal(world, el[0], el[1], el[2])); } else normal.push(0, 1, 0);
      let u = 0.5, v = 0.5;
      if (T) { T.getElement(i, el); u = el[0]; v = el[1]; }
      // 贴图平铺的（UV 超出 0–1）折回一格之内；真正跨格的三角形会被拉花，数出来提示
      if (u < -1e-4 || u > 1.0001 || v < -1e-4 || v > 1.0001) { tiled++; u -= Math.floor(u); v -= Math.floor(v); }
      u = Math.min(1, Math.max(0, u)); v = Math.min(1, Math.max(0, v));
      uv.push((cx + padU + u * (1 - 2 * padU)) / cols, (cy + padV + v * (1 - 2 * padV)) / rows);
    }
    const I = prim.getIndices();
    if (I) for (let i = 0; i < I.getCount(); i++) indices.push(start + I.getScalar(i));
    else for (let i = 0; i < P.getCount(); i++) indices.push(start + i);
  }

  // 4) 尺寸和落脚点：先按目标高度缩放，再把原点挪到「贴地正中」（或挂墙、吊顶、正中）
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const bounds = () => { min = [Infinity, Infinity, Infinity]; max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < position.length; i += 3) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], position[i + c]); max[c] = Math.max(max[c], position[i + c]); } };
  bounds();
  const scale = entry.height ? entry.height / (max[1] - min[1]) : entry.scale || 1;
  const pivot = entry.pivot || 'floor';
  const origin = [(min[0] + max[0]) / 2, pivot === 'floor' ? min[1] : pivot === 'ceiling' ? max[1] : (min[1] + max[1]) / 2, pivot === 'wall' ? min[2] : (min[2] + max[2]) / 2];
  for (let i = 0; i < position.length; i += 3) for (let c = 0; c < 3; c++) position[i + c] = (position[i + c] - origin[c]) * scale;
  bounds();

  // 5) 新文档：一个网格、一种材质、一张 WebP
  const doc = new Document();
  const buffer = doc.createBuffer();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const image = await sharp(atlas, { raw: { width: size, height: size, channels: 4 } })
    .webp({ quality: entry.quality || 80, alphaQuality: 90, effort: 6, smartSubsample: true }).toBuffer();
  const opaque = alpha ? image : await sharp(atlas, { raw: { width: size, height: size, channels: 4 } }).removeAlpha()
    .webp({ quality: entry.quality || 80, effort: 6, smartSubsample: true }).toBuffer();
  const texture = doc.createTexture(entry.id).setImage(opaque).setMimeType('image/webp');
  const material = doc.createMaterial(entry.id).setBaseColorTexture(texture)
    .setRoughnessFactor(Math.min(1, Math.max(0.3, entry.roughness ?? rough)))
    .setMetallicFactor(entry.metalness ?? (metal > 0.5 ? Math.min(1, metal) : 0))
    .setDoubleSided(entry.doubleSided ?? alpha)
    .setAlphaMode(alpha ? 'MASK' : 'OPAQUE').setAlphaCutoff(entry.alphaCutoff ?? 0.5);
  const prim = doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(position)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(normal)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
  const mesh = doc.createMesh(entry.id).addPrimitive(prim);
  doc.createScene(entry.id).addChild(doc.createNode(entry.id).setMesh(mesh));

  // 6) 减面到目标三角形数：误差上限按模型尺寸的比例给，没减够就逐级放宽；再做量化和 meshopt 压缩
  await doc.transform(weld());
  const count = () => prim.getIndices().getCount() / 3;
  let usedError = 0;
  for (const error of entry.error ? [entry.error].flat() : [0.01, 0.03]) {
    if (count() <= entry.tris * 1.15) break;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: entry.tris / count(), error, lockBorder: false }));
    usedError = error;
  }
  // 一堆互不相连的小件（板条、细管）用常规办法减不动：允许跨接缝合并再试一次
  if (count() > entry.tris * 1.3 && !entry.strict) reduce(doc, prim, entry.tris, [[0.02, ['Permissive']], [0.04, ['Permissive']]]);
  await doc.transform(prune(), dedup(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const glb = Buffer.from(await io.writeBinary(doc));
  await writeFile(path.join(OUT, `${entry.id}.glb`), glb);
  const triangles = prim.getIndices().getCount() / 3, vertices = prim.getAttribute('POSITION').getCount();

  // 7) 远景用的简化版：只有几何（贴图和近景版共用同一张），面数约三成，误差放得很宽
  const lodTarget = entry.lod ?? Math.min(300, Math.max(40, Math.round(triangles * 0.3)));
  reduce(doc, prim, lodTarget, [[0.05, ['Permissive']], [0.12, ['Permissive', 'Prune']], [0.25, ['Permissive', 'Prune']]], true);
  material.setBaseColorTexture(null);
  texture.dispose();
  for (const extension of doc.getRoot().listExtensionsUsed()) if (extension.extensionName === 'EXT_texture_webp') extension.dispose();
  await doc.transform(prune(), dedup(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  const lodGlb = Buffer.from(await io.writeBinary(doc));
  await writeFile(path.join(OUT, `${entry.id}.lod1.glb`), lodGlb);
  const lod = { file: `${entry.id}.lod1.glb`, bytes: lodGlb.length, sha256: sha256(lodGlb), triangles: count() };
  const round = (v) => Math.round(v * 1000) / 1000;
  return {
    id: entry.id, label: entry.label, group: entry.group, file: `${entry.id}.glb`, bytes: glb.length, sha256: sha256(glb),
    lod,
    size: max.map((v, i) => round(v - min[i])), min: min.map(round), max: max.map(round),
    triangles, vertices, texture: { size, bytes: opaque.length, format: 'webp', cells: materials.length }, tintable: !!entry.tint,
    alpha, roughness: round(material.getRoughnessFactor()), metalness: round(material.getMetallicFactor()),
    source: {
      site: 'Poly Haven', id: entry.src, name: info.name, url: `https://polyhaven.com/a/${entry.src}`,
      authors: Object.keys(info.authors || {}), license: 'CC0-1.0', resolution: '1k',
      triangles: Math.round(sourceTriangles), files: fetched.files,
    },
    processing: {
      nodes: entry.nodes?.map(String), dropMaterials: entry.dropMaterials?.map(String), scale: round(scale), pivot,
      yaw: entry.yaw || 0, aoBakedIntoColor: AO_STRENGTH, tiledUvVertices: tiled, simplifyError: usedError,
      steps: 'merge to one mesh and one atlas, weld, meshopt simplify, quantize (14/8/12 bit), meshopt compression, WebP',
    },
  };
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await mkdir(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'manifest.json');
const previous = await readFile(manifestPath, 'utf8').then((text) => new Map(JSON.parse(text).props.map((p) => [p.id, p])), () => new Map());
const records = [];
for (const entry of PROP_CATALOG) {
  if (only.length && !only.includes(entry.id) && previous.has(entry.id)) { records.push(previous.get(entry.id)); continue; }
  try {
    const record = await buildProp(entry);
    records.push(record);
    console.log(`${record.id.padEnd(22)} ${String(record.source.triangles).padStart(7)} → ${String(record.triangles).padStart(5)} / ${String(record.lod.triangles).padStart(4)} tris  ${((record.bytes + record.lod.bytes) / 1024).toFixed(0).padStart(4)} kB  ${record.size.map((v) => v.toFixed(2)).join('×')} m  cells ${record.texture.cells}${record.alpha ? ' alpha' : ''}${record.processing.tiledUvVertices ? ` tiled ${record.processing.tiledUvVertices}` : ''}`);
  } catch (error) { console.error(`${entry.id}: FAILED ${error.message}`); process.exitCode = 1; }
}
const total = records.reduce((n, r) => n + r.bytes + r.lod.bytes, 0);
await writeFile(manifestPath, JSON.stringify({
  version: 1, source: 'Poly Haven', license: 'CC0-1.0', licenseUrl: 'https://polyhaven.com/license',
  credit: 'Models from Poly Haven (CC0). Downloaded once, simplified and self-hosted; no runtime requests to Poly Haven.',
  generatedBy: 'scripts/props/build-props.mjs from scripts/props/catalog.mjs', totalBytes: total, props: records,
}, null, 2) + '\n');
await mkdir(path.join(root, 'src/render/props'), { recursive: true });
const data = records.map((r) => ({ id: r.id, label: r.label, group: r.group, url: `./assets/models/props/${r.file}`, lodUrl: `./assets/models/props/${r.lod.file}`, bytes: r.bytes + r.lod.bytes, size: r.size, min: r.min, max: r.max, triangles: r.triangles, lodTriangles: r.lod.triangles, alpha: r.alpha, ...(r.tintable ? { tintable: true } : {}) }));
await writeFile(path.join(root, 'src/render/props/prop-data.js'),
  '// Generated by scripts/props/build-props.mjs. Paths are rewritten by the builds (one packed file).\nexport const PROP_ASSETS = [\n'
  + data.map((d) => '  ' + JSON.stringify(d) + ',').join('\n') + '\n];\n'
  + '/** 发布构建把所有模型打成一个文件：{ url }，各条目带 offset / length。开发时逐个文件取。 */\nexport const PROP_PACK = null;\n');
console.log(`\n${records.length} props · ${(total / 1024 / 1024).toFixed(2)} MiB · ${records.reduce((n, r) => n + r.triangles, 0)} triangles (far LOD ${records.reduce((n, r) => n + r.lod.triangles, 0)})`);
