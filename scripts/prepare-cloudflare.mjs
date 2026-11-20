// Cloudflare Pages 发布前的准备：在线上包（dist/netlify，由 npm run build:netlify 生成）里写一份 _headers。
// 缓存规则和 netlify.toml 里的一致：带哈希的 /assets/* 永久缓存，首页和 manifest 每次都回源确认。
// Netlify 也认 _headers，内容相同，两边发布同一个目录互不影响。
// 用法：npm run build:netlify && node scripts/prepare-cloudflare.mjs && npx wrangler pages deploy dist/netlify --project-name <项目名> --branch main
import { writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const out = 'dist/netlify';
export const CLOUDFLARE_HEADERS = `/assets/*
  Cache-Control: public, max-age=31536000, immutable

/
  Cache-Control: public, max-age=0, must-revalidate

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/manifest.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
  Cache-Control: public, max-age=0, must-revalidate
`;

if (import.meta.url === `file://${process.argv[1]}`) {
  await stat(path.join(out, 'index.html')).catch(() => { throw new Error(`先运行 npm run build:netlify（没找到 ${out}/index.html）`); });
  await writeFile(path.join(out, '_headers'), CLOUDFLARE_HEADERS);
  console.log(`${out}/_headers 已写好（Cloudflare Pages 的缓存规则）`);
}
