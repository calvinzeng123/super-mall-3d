// 把 procedural-surfaces.mjs 的程序化面层渲染成 JPEG，写入 assets/textures/procedural/ 与清单。
// 用法（仓库根目录）：node scripts/procedural-textures.mjs   需要 python3 + Pillow 编码 JPEG。
// 结果是确定的：同一份源码重复运行得到同样的像素；build.mjs 把这些文件与 CC0 贴图一起嵌入。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PROCEDURAL_SURFACES, surfacePixels } from './procedural-surfaces.mjs';

const OUT = 'assets/textures/procedural';
const SIZE = { travertine_panel: 1024, board_concrete: 1024, terracotta_baguette: 1024, timber_slat: 1024 };
const QUALITY = { color: 88, normal: 92, roughness: 84 };
const tmp = mkdtempSync(join(tmpdir(), 'proc-tex-'));
const jobs = [], assets = [];

for (const [id, spec] of Object.entries(PROCEDURAL_SURFACES)) {
  const size = SIZE[id] || 512, px = surfacePixels(id, size), maps = {};
  mkdirSync(join(OUT, id), { recursive: true });
  for (const purpose of ['color', 'normal', 'roughness']) {
    // 行 0 是 v=0（墙脚）；图片文件自上而下存，所以这里翻转一次，运行时贴图按图片惯例 flipY。
    const rgb = Buffer.alloc(size * size * 3), src = px[purpose];
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const s = ((size - 1 - j) * size + i) * 4, d = (j * size + i) * 3;
      rgb[d] = src[s]; rgb[d + 1] = src[s + 1]; rgb[d + 2] = src[s + 2];
    }
    const raw = join(tmp, `${id}-${purpose}.rgb`), path = `${OUT}/${id}/${purpose}.jpg`;
    writeFileSync(raw, rgb);
    jobs.push([raw, path, size, QUALITY[purpose]]);
    maps[purpose] = { path, width: size, height: size, colorSpace: purpose === 'color' ? 'srgb' : 'linear' };
  }
  assets.push({ id, label: spec.label, meters: spec.meters, maps });
}

execFileSync('python3', ['-I', '-c', `
import json, sys
from PIL import Image
for raw, path, size, q in json.loads(sys.argv[1]):
    Image.frombytes('RGB', (size, size), open(raw, 'rb').read()).save(path, quality=q, optimize=True, subsampling=0)
`, JSON.stringify(jobs)], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });

let total = 0;
for (const a of assets) for (const m of Object.values(a.maps)) {
  const data = readFileSync(m.path);
  m.bytes = data.length; m.sha256 = createHash('sha256').update(data).digest('hex'); total += data.length;
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({
  version: 1, source: 'Generated in this repository by scripts/procedural-textures.mjs from scripts/procedural-surfaces.mjs',
  license: 'CC0-1.0', credit: '程序化生成，无外部图片', totalImageBytes: total, assets,
}, null, 2) + '\n');
console.log(`${assets.length} surfaces, ${(total / 1024).toFixed(0)} KB`);
