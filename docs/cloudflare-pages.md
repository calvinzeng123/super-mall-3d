# Cloudflare Pages 部署

2026-10-20。除 Netlify 外，浏览器版另起一个 Cloudflare Pages 项目，互不影响：

| 项 | 值 |
| --- | --- |
| Pages 项目 | `yunlan-mall-v5` |
| 访问地址 | https://yunlan-mall-v5.pages.dev/ |
| 本次部署 | https://42eb0b6e.yunlan-mall-v5.pages.dev（2026-10-20 手动部署，main 分支） |
| 构建命令 | `npm run build:netlify` |
| 发布目录 | `dist/netlify/`（49 个文件，约 52.9 MiB） |
| 配置 | 根目录 `wrangler.toml`（`pages_build_output_dir = "dist/netlify"`） |
| 缓存头 | `dist/netlify/_headers`，由 `scripts/build-netlify.mjs` 生成，Netlify 与 Pages 共用 |

## 手动部署

```sh
npm ci
npm run build:netlify
npx wrangler pages deploy dist/netlify \
  --project-name yunlan-mall-v5 --branch main --commit-dirty=true
# 或
npm run deploy:cf
```

首次部署前创建项目（本仓库已创建，创建一次即可）：

```sh
npx wrangler pages project create yunlan-mall-v5 --production-branch=main
```

Wrangler 需要登录 Cloudflare 账号（`npx wrangler login` 或 `CLOUDFLARE_API_TOKEN`）。
GitHub 推送不会自动发布；Cloudflare 与 Netlify 一样保持手动部署。

本次部署已用 Playwright 实测：线上首页、行动简报、标准难度出发、FPS 场景加载均通过，
9 名敌人 / 8 个拾取物 / 可选目标数据齐全，控制台无报错；`assets/*` 返回一年 immutable 缓存头。

## 与 Netlify 的差异

- **没有 Functions**：`netlify/functions/squad-order.mjs` 是 Netlify-only。Cloudflare 部署中
  暂停菜单的“自然语言队友指令”会按现有容错回退到本地解析（跟随/守位/掩护），战斗与任务逻辑不受影响。
- 线上资源使用内容哈希，`_headers` 为 `assets/*` 设置一年 immutable 缓存，首页与署名页不缓存。
- 离线单文件版 `dist/mall.html` 仍随 Git 仓库提供，不参与 Pages 发布（发布目录只有 `dist/netlify/`）。
- 线上入口不会创建 WebGL，也不会在选模式前请求模型；FPS 的 5.75 MiB 枪械与探索的住宅模型仍按需加载。

## 可选：连接 GitHub 自动部署

在 Cloudflare Dashboard → Workers & Pages → `yunlan-mall-v5` → Settings → Builds & deployments
连接仓库 `calvinzeng123/super-mall-3d` 与 `feat/fps-gameplay-v5` 分支，构建命令
`npm run build:netlify`，输出目录 `dist/netlify`，Node 版本 20 或 24。连接后每次推送可自动构建。
