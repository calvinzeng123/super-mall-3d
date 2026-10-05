# 交接文档 · 云澜汇园区 3D

> 最后更新：2026-10-05。接手前先读本文件，再按需读 `docs/superpowers/` 下的规格与计划。

## 1. 项目是什么

一个纯前端、可交互的写实建筑可视化：路口四个地块组成的商业园区，浏览器里直接打开。

| 部分 | 内容 |
|---|---|
| 一期 · 云澜汇（P1） | Y 形四翼 + 圆厅商场，B2–RF 共 7 层；西北翼末端接**方庭**（v1 的原四方格商场 120×80m） |
| 二期 · 星湾（P2） | 三翼两圆厅新月形，B1–RF 共 6 层，真冰场、IMAX、天空跑道 |
| 三期 · 云澜里（P3） | 11 栋 2–3 层楼栋的开放街区 + 整片地库，中心广场、屋顶露台 |
| 云环天桥 | 路口上空圆环桥 + 四条对角连廊 + 两座落地塔 |
| 中央公园 | 湖面、环湖步道、林地 |
| 地铁 · 云澜汇站（M） | B1 站厅、B2 岛式站台（两列往返列车）、四条对角通道接一期 B1M / 二期 B1 / 三期 B1 / 公园，A/B/C/D 四个地面出入口 |

所有店铺品牌都是原创虚构的（`src/layout/brands.js`），不对应真实品牌。

## 2. 当前状态

- **代码**：开发分支 `feat/campus-v2`（v2、v3 的全部 28 个提交）已在本地**快进合并进 `main`**；分支保留着，留给 PR 用。
- **测试**：`npm test` 57/57 通过。
- **线上**：<https://claude.ai/artifact/VAMbvbuX4yirRLGBpbYMuK>，第 8 版（私有，需在页面 Share 菜单里分享给别人才能打开）。版本对应：第 5 版 = C 阶段（三期 + 天桥 + 公园），第 6 版 = D 阶段（第四翼 + 方庭），第 7 版 = E 阶段（地铁），第 8 版 = 内存瘦身（第 7 版在 iPhone 的 Claude App 里打不开，判断是内存超限，见第 7 节"内存预算"）。
- **还没做**：推送到 GitHub 并开 PR——这台机器 `gh` 未登录、仓库没有远程地址。做法见第 9 节。

## 3. 快速上手

```bash
npm install          # 只有 esbuild 一个开发依赖
npm test             # node:test，跑 tests/*.test.js（只测布局模型，不需要浏览器）
npm run build        # 生成 index.html（开发版）、dist/artifact.html（发布片段）、dist/mall.html（可双击打开的单文件）
npm run serve        # python3 serve.py 5174 → http://localhost:5174
```

- three.js r170 走 jsDelivr 的 importmap，构建时 `three` 与 `three/addons/*` 保持外部引用。
- **不要直接改 `index.html`**：它由 `src/shell.html` 模板生成，样式、DOM 都改 `src/shell.html`。
- 发布：在 Claude 里用 Artifact 工具把 `dist/artifact.html` 发布到上面的链接（带 `url` 参数即更新同一链接）。

## 4. 目录与模块职责

```
src/
  main.js                 入口：布局 → 场景 → 界面 → 导览；window.__mall = app
  shell.html              页面模板（样式、DOM）
  layout/                 纯数据的布局模型（可在 Node 中运行和测试）
    layout.js             汇总：buildLayout() → { buildings, levels, escalators, elevators, stairs, entrances, ramps, site, bridges }
    geom.js               平面几何：frame/toW/toL、多边形、裁剪、连通判定
    campus.js             道路、人行道、地块、广场、公园；site.trenches（坡道）与 site.openings（地铁梯井）
    mall.js + hub.js      圆厅 + 翼楼通用商场构建器（一期、二期）
    p1.js / p2.js         一期、二期参数（翼楼、楼层、扶梯、入口、坡道、天台回调）
    square.js             方庭：作为一期的一部分，通过 spec.square 的 setup/level 钩子写入一期各层
    p3.js                 三期街区（楼栋表、地库、地库东北角 45° 切角 = 地铁口）
    metro.js              地铁：两层、四条通道、四个出入口，并给三期 1F 楼板挖梯井、改公园 B 口位置
    bridges.js            云环天桥
    walk.js               步行连通图（测试"全园区连通"用）
    brands.js / constants.js / parking.js
  render/
    app.js                渲染器、相机、每期 → 每层分组、构建步骤、可见性规则、视角、拾取
    ui.js / tour.js       界面（分期按钮、楼层牌、目录）与一键导览
    batch.js              BatchSet / SignBatch：大量小几何合并成每层每材质一个网格
    materials.js / textures.js / theme.js / env.js / paths.js / perf.js
    build/*.js            各类构建器：shell（楼板、外立面、地下外墙）、walls、storefronts、interiors、rooms、
                          escalators、elevators、public、parking、roof、square、street、bridges、park、metro、
                          site、flows、labels、people、traffic
tests/                    规则测试（rules）+ 各期专项（p1、p1x、p2、p3、metro、campus、geom、perf）
docs/superpowers/         规格（specs）与实现计划（plans），按 v1 / v2 / v3 分文件
serve.py                  开发服务器：禁缓存；POST /__shot?name=xx 把截图存到 shots/xx.jpg
```

## 5. 核心约定（改布局前必读）

- **坐标**：平面 `[x, z]`，x 向东、z 向南，y 向上；单位米。道路：云澜大道沿 x（z∈[−14,14]），星湾路沿 z（x∈[−10,10]），路口在原点。
- **局部坐标系 `frame(ox, oz, deg)`**：`toW(F,u,v)` = (ox + u·c − v·s, oz + u·s + v·c)。翼楼 frame 原点在圆厅圆心、u 沿翼楼轴线向外；地铁通道 frame 原点在路口、u 沿对角线向外。`rect` 的 x≡u、z≡v；门面 `side` 'N'=−v、'S'=+v、'W'=−u、'E'=+u。
- **楼层模型**：每层有 `walk`（可走区域多边形）、`units`（铺位，带 `fronts` 门面线段）、`rooms`（楼梯/核心筒/卫生间/设备）、`voids`（洞口）、`features`（景观要素）、`slab.pieces`（楼板拼块，`holes` 为洞）。
- **入口**：`entrance.to` 可以是 `'site'`（场地）、`'bridge'`（桥面）或**另一栋的楼层 id**（如一期 B1M 的地铁口 `to: 'M-B1'`）；步行图按外侧点所在的走道连接。地铁出入口另带 `kiosk`（雨棚 frame、多边形、梯井开口）。
- **楼层 kind**：`retail` / `food` / `parking` / `roof` / `street` / `concourse` / `platform`。疏散距离规则只检查 retail、food、parking。
- **规则测试**（`tests/rules.test.js`）对所有楼层生效：铺位与用房不重叠且在楼板上、门面临走道、每层客梯 ≥2、扶梯 30° 且两端落在走道上并穿过上层洞口、楼梯 ≥2、疏散距离、车位不压车道、店名与铺位号唯一、全园区步行连通。新增楼栋或楼层，必须先让这些规则通过。

## 6. 渲染要点

- 每层一个 `THREE.Group`，下分 `base`（室内）、`shell`（楼板与结构）、`facade`（外立面）、`labels`、`flows`、`people`、`picks`。
- 可见性在 `app.js` 的 `applyVisibility()`：
  - 园区视角只显示各层 shell + facade（屋面层、三期地上街巷另显示 base）。
  - 选中某期展开室内；聚焦某层时隐藏它上面的楼层。
  - **地铁特例**：未选中时只显示站厅层的 shell（出入口雨棚、站内墙体，透过梯井可见）；选中地铁时撤掉地面（siteGroup）；聚焦一期 B1M / 二期 B1 / 三期 B1 时一并显示相连的站厅。
- 地铁站厅、站台的吊顶是独立分组，只在相机低于吊顶时显示（`build/metro.js` 的动态更新），俯视时露出站内。
- 列车用材质裁剪平面在隧道口（|x| > 70）截断；`ctx.metroSync(at)` 可把列车时钟对到某个相位，导览进站台时会调用。
- 同层所有楼板拼块合并成一个地面网格 + 一个楼板体网格（省绘制调用）。

## 7. 调试与验证技巧

- 页面里 `window.__mall` 就是 app。`app.debugShot({ pos, target, w, h, steps })` 立即渲染一帧并返回 JPEG dataURL；配合 `fetch('/__shot?name=xx', { method: 'POST', body: url })` 存到 `shots/`（已 gitignore）。
- **后台标签页没有 rAF**：预览面板隐藏时主循环不跑，动态内容只在 `debugShot` 的 `steps` 里更新。测地铁时先摆好相机，再手动调用 `app.ctx.dynamic.find(d => d.name === 'metro').update(0, t, app)`，然后 `debugShot({ steps: 0 })`。
- 统计绘制调用要先设 `renderer.info.autoReset = false`（后期处理有多个 pass）。当前园区视角约 495 次。
- **内存预算（手机能否打开的关键）**：iOS 会直接结束内存超限的网页进程，Claude App 里表现为整页 "Something went wrong"。第 7 版几何体约 302 MB、贴图约 367 MB、构建峰值堆约 700 MB，在 iPhone 上打不开（判断为内存超限，未能在真机上抓到崩溃日志）。第 8 版的对策：
  - `batch.js` 顶点格式压缩为 18 字节/顶点（Float32 位置 + Int8 法线 + Uint8 颜色，只有招牌批次带 uv），几何体约 117 MB；
  - `app.js` 的 `releaseGeometryAfterUpload`：顶点数组上传显卡后释放（包围体提前算好；拾取盒的几何体排除在外——渲染器照样会上传它们，但射线拾取要读顶点）；
  - `textures.js` 的 `scaled` / `releaseAfterUpload`：招牌图集、地面材质、地铁导向牌在手机上缩到一半边长，上传后释放画布；
  - `device.js`：手机 / 平板阴影贴图 2048、像素比 ≤1.5。
  - 新增大量几何前先在本地量一下（遍历场景，累加各 attribute 的字节数与贴图像素），别让总量回到第 7 版的水平。
- 踩过的坑：
  - three.js 只把 `visible === false` 当作隐藏，`null` 会被渲染——可见性表达式要转成布尔值。
  - 给 `THREE.Shape` 挖洞时，洞不能互相包含（会被三角剖分重新填上）。`site.js` 已过滤被其它洞包含的洞。
  - `index.html` 由模板生成，直接改会被构建覆盖。

## 8. 已知问题与限制

- 二期 B1 标高 −4.2，比地铁站厅（−4.5）高 0.3m，通道尽端做了 3m 缓坡。
- 手机上选中地铁后，楼层栏要横向滑动才能看到 B2（与一期楼层多时相同）。
- 列车按固定 84 秒周期往返，与时刻无关；夜景下出入口雨棚偏暗（只有 M 标识柱和檐口灯带发光）。
- 室内只有站厅、站台吊顶会随相机高度显隐；各期商场仍是"聚焦某层就隐藏上层"的剖切方式。
- 顶点数组上传后已释放：若手机切后台导致 WebGL 上下文丢失，无法自动恢复，页面会提示刷新。
- 手机竖屏的园区总览里，路口一带的标注（四个地铁口、两座落地塔、天桥）比较挤。

## 9. 待办：推送到 GitHub 并开 PR

`main` 已在本地合并，但远程还没有。PR 需要远程 `main` 停在 v1 的基线提交 `2ca529c`，这样 PR 才能完整列出 v2、v3 的改动。

1. 在终端登录 GitHub（需要你本人操作）：`gh auth login`
2. 运行脚本（不给参数时新建同名**私有**仓库；已有仓库就把地址作为参数传入）：
   ```bash
   scripts/open-pr.sh
   ```
   脚本做的事：添加远程 → 把基线 `2ca529c` 推为远程 `main` → 推送 `feat/campus-v2` → 以 `docs/pr/campus-v2.md` 为正文开 PR。它**不会**推送本地已合并的 `main`，PR 留给你审阅后在 GitHub 上合并；合并后本地 `git pull` 即可快进。

## 10. 后续可做

- 地面出入口加无障碍电梯（目前只有楼梯 + 上行扶梯）。
- 列车时刻与界面联动（站台到站屏显示倒计时）。
- 三期街区 1F 的行人避开 D 口梯井（目前行走路径只按楼栋避让）。
- 移动端楼层栏在选中分期时自动滚到可见。

## 11. 开发流程

本项目按 superpowers 流程推进：头脑风暴 → 规格（`docs/superpowers/specs/`）→ 实现计划（`docs/superpowers/plans/`，任务带编号、逐个勾选）→ 先写测试（TDD）→ 实现 → 截图验证 → 提交（commit 信息带任务编号）→ 发布。v3 计划第 E2 任务末尾记录了实施时相对设计稿的几何调整。
