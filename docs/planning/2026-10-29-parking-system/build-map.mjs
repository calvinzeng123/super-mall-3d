// 生成停车地图页：把 parking-data.json 内联进 parking-map.src.html。
//   parking-map.html  完整页面（doctype、charset、viewport），可直接用浏览器打开
//   第二个参数（可选）  发布片段：不带 doctype/head/body，供 Artifact 包装
// 用法（仓库根目录）：
//   node docs/planning/2026-10-29-parking-system/export-parking-data.mjs
//   node docs/planning/2026-10-29-parking-system/build-map.mjs [片段输出路径]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const data = readFileSync(join(here, 'parking-data.json'), 'utf8').replace(/</g, '\\u003c');
const page = readFileSync(join(here, 'parking-map.src.html'), 'utf8').replace('/*__PARKING_DATA__*/null', () => data);
const full = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n'
  + page + '\n</body>\n</html>\n';
writeFileSync(join(here, 'parking-map.html'), full);
if (process.argv[2]) writeFileSync(process.argv[2], page);
console.log('parking-map.html', Math.round(full.length / 1024), 'KB');
