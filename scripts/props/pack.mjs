// 发布构建用：把 assets/models/props 里的所有 GLB（精细版和远景版）首尾相接打成一包。
// 返回 { bytes, assets }：assets 是运行时目录，每条带 offset / length（精细版）和 lodOffset / lodLength（远景版）。
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PROP_ASSETS } from '../../src/render/props/prop-data.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

export async function packProps() {
  const chunks = [], assets = [];
  let offset = 0;
  for (const { url, lodUrl, ...rest } of PROP_ASSETS) {
    const near = await readFile(path.join(root, url)), far = await readFile(path.join(root, lodUrl));
    assets.push({ ...rest, offset, length: near.length, lodOffset: offset + near.length, lodLength: far.length });
    chunks.push(near, far);
    offset += near.length + far.length;
  }
  return { bytes: Buffer.concat(chunks), assets };
}
