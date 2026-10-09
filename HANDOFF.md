# 交接文档 · 云澜汇园区 3D

> 最后更新：2026-10-09。先读以下最新交接，再按需查历史规格。项目介绍与启动方法见 [README.md](README.md)。

## 2026-10-09 最新交接：01 / 02 三房样板

用户要求继续制作01、02，允许镜像但需有区别。两套现均为 **三房两厅两卫＋15.6×2.8m阳台**，与03四房构成三个独立样板；**R1–R4仍未批量接入，`src/`和园区离线页未改**。户型区别见[布局说明](docs/residential-01-02-plan.md)，验收与重建见[交付说明](docs/residential-01-02-delivery.md)。

- 01横厅家庭型：西南主卧、北侧两次卧、双沙发，厨房侧入、公卫玄关侧入、东西向六人桌。
- 02镜像阅读型：东西镜像保留源家具1:1，在此基础上把厨房和公卫改为南侧入口、重排南北向餐桌、增设窗边书桌、改变次卧用途。不是只改名字或配色。
- 新数据：`scripts/residential/plan_01.json`与`plan_02.json`，`assembly`定义精细家具位置与镜像、`views/viewer`定义机位和补光；共享构建器`build_three_bedroom.py --unit 01/02 --out DIR`。03构建器及其既有成品未修改。
- 新成品：`prototypes/residential01/`、`prototypes/residential02/`；每套有`.blend`、`.glb`、离线HTML、12张效果图、中文PNG/SVG平面图、校验清单及QA证据。
- 共有检查与平面图脚本现在支持`--plan`；离线页生成器支持`--unit`或`--plan`，旧03位置参数兼容。已有03查看器源码兼容验证和实际几何回归通过。
- 镜像在导出前烘焙为独立网格、校正法线并清除负尺度层级；不要二次镜像`plan_02`中的世界坐标。两份GLB重新导入均无负尺度mesh，贴图内嵌。
- 实际网格：01为1483个mesh、02为1525个mesh；各14/14目标可达，墙、门、窗遮挡及外包络越界均为0。阳台洗烘柜已移动到实墙下并调整邻近花槽，避免遮主卧窗。
- 与03相同：用户套房不是CC0；新增木/石贴图沿用现有Poly Haven资产。Blender含面光，GLB不支持面光，独立查看器使用自身补光。自由漫游允许穿墙，后续楼栋接入另需碰撞导航。

## 2026-10-07 前次交接：独立住宅 03 样板

用户确定先做 **03 四房两厅**，01／02 后续分别做不同的三房两厅，所有户型有大阳台。本轮独立 Blender 建模，**未改 `src/`、`index.html` 或 `dist/mall.html`，R1–R4 的 360 户没有批量替换**。先看 [原型布局](docs/residential-prototype-plan.md) 与 [交付/验证说明](docs/residential-prototype-delivery.md)。

- 交付：`prototypes/residential03/` 内有可编辑、贴图内嵌的 `.blend`、完整 `.glb`、离线查看器、预览和校验清单；完整效果图与 ZIP 在本次本地交付目录。
- 源码：`scripts/residential/plan_03.json` 定义米制、Z向上的平面；`build_residence.py` 搭建筑/材质/灯光，`furniture.py` 生成精细家居；`audit_residence.py` 检查实际模型，`draw_plan.py` 从实际投影出中文平面图。`viewer.js/html` 与 `build-viewer.mjs` 构建独立离线查看器。
- 住宅：4卧、客厅、餐厅、厨房、3卫、洗衣和大阳台。17.6×11.5m 的含墙平面范围202.40㎡；阳台49.28㎡单列，不是净使用或销售面积。
- 主卧床组和两组沙发等来自 `user-suite-processed.glb`，保持源家具1:1；用户资产不得标成CC0。橡木/石材沿用本仓库的Poly Haven CC0贴图。所有用到的图像内嵌。
- 保存与导出：家具曲线先转换为网格，保留龙头、软管和床品缝边；Blender保存面光和Cycles机位。glTF不支持面光，离线查看器自带校准的室内灯；不可假定其他GLB查看器与Blender效果一致。
- 独立查看器是自由移动展示，不含园区碰撞或电梯系统。下一步接入时须重做住宅占地、楼栋核心筒/门口对齐、层高与导航，不能简单缩放这个17.6m宽户型塞入旧单元。该次交付时01/02只有布局方向；两套后续成品见本文最新交接。

## 2026-10-07 前次交接：用户套房模型与首层复式

本轮在原有园区继续，保留三期商场、407 家商铺、六栋塔楼及 760 个住户单元。H 酒店 200 套、A 公寓 200 套均改为用户自制 `酒店套房_改造后.glb` 的真实家具及房间模型；R1–R4 的 360 户住宅仍用现有住宅构建器。详细坐标、文件职责和限制见 [docs/suite-integration.md](docs/suite-integration.md)。

- **原件与许可**：`assets/models/user-suite-original.glb` 保留原始字节，处理结果为 `user-suite-processed.glb`，校验与变更写入同目录 `manifest.json`。用户自制模型及其中 23 张图片不是 CC0；园区六套 Poly Haven CC0 材质继续独立管理。
- **1:1 放置**：源模型绕 Y 轴旋转 `Math.PI / 2`；单元局部 `x = sourceZ + 1.45`、`z = 10.35 - sourceX`，再经 `u.frame` 转到世界坐标。渲染 y 为 `sourceY + lv.elev + 0.035`，其中 3.5 厘米用于避免与园区楼板共面，不改变模型比例。不要拉伸源家具填满 11×15 米单元。
- **空间补全**：公寓右翼为台盆、双灶、柜体、洗烘和收纳；酒店右翼为茶水、衣柜、行李区。后侧低矮休闲家具保留原落地窗视线，后庭经右翼进入。原门洞、附翼新门和卫浴玻璃门通过处理后的真实几何开放。
- **复式仅在 A1F**：10 套沿用 6.5 米楼层空间，夹层地面高 3.05 米，右侧 18 级楼梯连接上下层，夹层含原模型床组及新增书桌、衣柜和护栏；不增加 `layout.levels` 或住户数量；导航内部增加各户 `-MEZZ` 支撑面 ID。楼梯、夹层、护栏及家具占地由 `src/layout/suite-plan.js` 与导航共用。
- **灯光**：`src/render/suite-lighting.js` 创建桌面 10 盏 / 移动端 8 盏固定灯池，随当前套房移动；桌面其中两盏投影，移动端不启用这些局部阴影。不会为 400 套常驻复制灯光。处理后独立 GLB 另保留 8 盏 `KHR_lights_punctual` 灯供模型单独使用，园区运行时由灯池管理。
- **加载与释放**：`suite-asset.js` 只解析一次源资源，共享几何、材质和贴图；`suite-models.js` 按访问层创建 `InstancedMesh`，`suite-interiors.js` 合批新增细节。`app.residenceCache` 仍最多保留 3 个楼层。退层只释放实例资源及该层自有几何，禁止释放共享源资源；整个源资源的释放归 loader 的 `dispose()` 负责。
- **生成文件**：模型处理规则更改后执行 `node scripts/prepare-suite-asset.mjs`，再 `npm run build`。构建把处理后 GLB 内嵌到 `src/render/suite-data.js` 与离线页面；该数据模块和 `pbr-data.js` 均为忽略的生成文件，不要手改。
- **验收状态**：95/95 自动化测试通过。浏览器验证复式上下楼、酒店/公寓20F、灯光跟随及3层缓存；共享资源释放次数为0。桌面与iPhone UA模拟以 `file://` 断网加载，均无页面异常及HTTP请求。处理后GLB已单独再导入渲染。详见 [本轮QA](docs/qa-2026-10-07-suite.md)；未做实体iPhone验证。
- **交付内容**：本次版本包含源码、源/处理后GLB、模型清单、离线页面、README、HANDOFF及验收截图，目标仍为私有仓库 `origin/feat/explore-v4`。推送结果以GitHub提交记录为准。`dist/mall.html`为最新离线园区；独立套房可用 `assets/models/user-suite-processed.glb`。旧的2026-10-06 ZIP不含本轮接入。

## 2026-10-07 早前仓库与交接状态（模型接入前）

- GitHub 私有仓库：<https://github.com/calvinzeng123/super-mall-3d>，远程名 `origin`，当前及默认分支为 `feat/explore-v4`。
- 扩建实现提交 `8338a93` 已于 2026-10-06 推送并核对远端，包含源码、18 张 PBR 图片、离线页面与验收资料。此次更新补充首页 README、实际场景预览及交接状态，不改变运行代码。
- 本节保留模型接入前的仓库状态；当前实现优先以上面的最新交接为准。更早章节中“未登录 GitHub”“没有远程”“待推送”等内容已过时。
- 运行前执行 `npm ci`、`npm run build`、`npm run serve`；验证执行 `npm test`。最新功能验收为 83/83，通过情况见 [QA 记录](docs/qa-2026-10-06.md)。此次文档更新仅检查文档链接和提交，不重复运行功能测试。
- 继续开发时保留原商场与新增楼栋，以共享布局数据同步渲染、门洞和导航。对电梯、楼层或地下连接的修改，应重新检查对应浏览器路径及离线产物。
- GitHub 源码上传已完成；未部署新的在线体验站点，也未导出本轮 GLB。历史本地 ZIP 是 2026-10-06 功能交付快照，最新文档以仓库为准。

## 2026-10-06 最新交接：真实材质与酒店住宅扩建

本轮以 `e9b0e16` 为基线，在现有 `feat/explore-v4` 工作区继续；保留原商场、街区、公园、地铁。用户追加的酒店、公寓和住宅已落到现有总图，后续以 `8338a93` 上传 GitHub 私有仓库。

### 当前内容

- 一期西侧：H 云澜酒店、A 云澜服务公寓，各 20 个居住层，每层 10 间；B1 接地铁/商场，B2 接一期车库，RF 屋顶花园。
- 二期后侧：云澜汇楼盘 R1–R4，各 30 个居住层，每层 3 户，108㎡一居、120㎡两居、180㎡三居。各栋 B1 停车层共用地下干道，R1 北侧设独立入口/出口双坡道。
- 共 760 套，逐套有可进入的入户门、床、独卫；住宅另有厨房、餐厅、起居区和阳台。户型为可复用模板，并非 760 套独立设计。
- 12 部新玻璃电梯通过对齐门口、进舱、关门、连续升降、开门、出舱到达任意停靠层。井道逐层挖空；原商场电梯与消防楼梯仍沿用互动换层。
- 地下步行链：住宅 B1 → 二期 B1 → 地铁站厅 → 一期 B1M → 酒店 B1 → 公寓 B1；酒店 2F 另有空桥接方庭 2F，H/A 的 B2 车行道连接一期 B1。
- 新增庭院、屋顶花园、入口雨棚、楼层与房号导视；原店铺增加服装、鞋包、书籍、数码、咖啡、烘焙等细部，原建筑门窗、檐口与屋顶设备同步深化。
- 六套 Poly Haven CC0 素材、18 张 1K PBR 图片已保存于 `assets/textures/`；来源、作者、许可和校验值见 `docs/texture-sources.md`、`assets/textures/manifest.json`。

### 构建与文件

```bash
npm ci
npm test
npm run build
npm run serve
```

开发版访问 `http://127.0.0.1:5174/`。`dist/mall.html` 包含 Three.js 和全部贴图，可离线直接打开；不再需要 CDN 或在线字体。依赖是 esbuild 与固定 Three.js 0.170.0。模板仍为 `src/shell.html`，不要直接改生成的 `index.html`。

- 布局：`src/layout/hospitality.js`；新增塔楼 `kind:'tower'`，用途在 `usage`。单元私卫/隔墙在 `u.residence`，不要放进公共 `lv.rooms`。
- 连接板在 `extensions.paths[].slab.pieces`，导航显式加入其可站立区域；通道在渲染侧按同标高矩形并集建边墙，避免转角/支路被堵。
- 建筑外壳：`render/build/hospitality.js`，整栋按材质合批，水平裁切面用于选层查看。地下通道按当前标高显示，顶板按相机高度隐藏。
- 内饰：`render/build/residence-interiors.js`，按访问层创建并释放，`app.residenceCache` 最多 3 层；RF 景观和停车场是独立常驻层组。
- 真实乘梯：`layout/elevator-ride.js`、`render/build/tower-elevators.js`、`render/explore.js`。`app.explore.rideLift(id,level)` 仅在有效候梯位置可调用；经过的楼层同步加载内饰。
- 材质：`render/pbr.js`、`surface-uv.js`。米制 UV；颜色图 sRGB，法线/粗糙度线性。手机判定下共享 PBR 图片缩至 512²。
- 使用说明：`docs/expansion-guide.md`。本轮详细变更：`docs/revisions/2026-10-06-material-detail.md`。最终验证记录：`docs/qa-2026-10-06.md`。

### 验证与边界

新增检查覆盖 760 套房门及套内门双向穿越、各户型卧室/卫浴可达、地下全链双向小步行走、独立坡道、电梯洞口及连续升降；完整结果以 QA 文档为准。几何体上传后仍释放静态 CPU 顶点数组，拾取几何除外；`geometry.userData.bufferBytes` 保留上传前体积，便于检查。

远景城市白楼是原有背景装饰，不是本轮新增的六栋可进入建筑。家具、树木和车辆仍不参与人物碰撞。未测试实体 iPhone；手机适配以浏览器模拟检查为准。源码已推送 GitHub；没有新的在线站点或 GLB 交付。

---

以下 1–12 节保留 2026-10-05 基线交接供追溯，其中旧测试数量、CDN、发布状态和“所有电梯传送”等描述属于历史记录；当前实现以上述新交接和 QA 文档为准。

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

除了俯瞰浏览，还可以点工具栏「漫游」以第一人称在园区里走（第 7 节）：走进每栋楼、每层、每家店、地铁站、天桥和天台，随时可以飞起来。

## 2. 当前状态

- **代码**：开发分支 `feat/campus-v2`（v2、v3 的全部 28 个提交）已在本地**快进合并进 `main`**；分支保留着，留给 PR 用。第一人称漫游（v4）在分支 `feat/explore-v4`（任务 F1–F6）。
- **测试**：`npm test` 68/68 通过。
- **线上**：<https://claude.ai/artifact/VAMbvbuX4yirRLGBpbYMuK>，第 10 版（私有，需在页面 Share 菜单里分享给别人才能打开）。版本对应：第 5 版 = C 阶段（三期 + 天桥 + 公园），第 6 版 = D 阶段（第四翼 + 方庭），第 7 版 = E 阶段（地铁），第 8 版 = 内存瘦身（第 7 版在 iPhone 的 Claude App 里打不开，判断是内存超限，见第 8 节"内存预算"），第 9 版 = 修复第 8 版悬停与点击报错（拾取盒顶点被释放），第 10 版 = 第一人称漫游。
- **还没做**：推送到 GitHub 并开 PR——这台机器 `gh` 未登录、仓库没有远程地址。做法见第 10 节。

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
    nav.js                第一人称导航模型：楼面、墙、传送边、坡道、互动点；step / landAt / sightBlocked 等（第 7 节）
    frontage.js           店面样式与门洞规则（渲染与导航共用）
    brands.js / constants.js / parking.js
  render/
    app.js                渲染器、相机、每期 → 每层分组、构建步骤、可见性规则、视角、拾取
    ui.js / tour.js       界面（分期按钮、楼层牌、目录）与一键导览
    explore.js            第一人称漫游控制器：键鼠 / 触屏输入 → nav.step → 相机，HUD、互动面板、准星拾取
    device.js             手机判定、贴图缩放、阴影贴图与像素比上限
    batch.js              BatchSet / SignBatch：大量小几何合并成每层每材质一个网格
    materials.js / textures.js / theme.js / env.js / paths.js / perf.js
    build/*.js            各类构建器：shell（楼板、外立面、地下外墙）、walls、storefronts、interiors、rooms、
                          escalators、elevators、public、parking、roof、square、street、bridges、park、metro、
                          site、flows、labels、people、traffic
tests/                    规则测试（rules）+ 各期专项（p1、p1x、p2、p3、metro、campus、geom、perf）+ 导航（nav）
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

## 7. 第一人称漫游（v4）

规格 `docs/superpowers/specs/2026-10-05-first-person-explore-design.md`，计划 `docs/superpowers/plans/2026-10-05-first-person-explore.md`。

- **入口**：工具栏「漫游」（`app.enterExplore()`）。出生点：聚焦了某层 → 该层；选中某期 → 1F 主入口内侧（地铁：站厅中部）；总览 → 一期东南主入口外。「退出」回到进入前的俯瞰视角与选择。导览中点「漫游」会先停导览。
- **操作**：电脑点画面锁定鼠标（锁不上就按住拖动），WASD / 方向键走、Shift 跑、空格跳、连按两下空格或 F 切换飞行（空格上升、C 下降）、E 打开楼梯电梯面板（数字键选层）。手机（`body.touch`）左侧 40% 是浮动摇杆（推到底跑）、右侧拖动看、右下 ▲ / ▼（飞行时）/「飞」，楼梯电梯提示本身就是互动按钮。「地点」打开目录，点分期 / 楼层 / 店铺直接传送。
- **导航模型**（`layout/nav.js`，纯函数，`tests/nav.test.js` 覆盖）：
  - 楼面：每个楼层一个，加 `ground`（室外地面）和 `bridge`（桥面 6.5m）。可站立 = 楼板拼块减洞口；人的中心和 8 个方向 0.3m 处都要可站立，走到楼板边、中庭边自然停住，不用另建栏杆墙。
  - 墙：铺位轮廓减门洞（`frontage.js` 的 `doorGaps`，与渲染一致）、用房、非核心筒电梯井、扶梯下层占地（只留入口）、地铁闸机 / 栏杆 / 售票机 / 屏蔽门、出入口雨棚玻璃。按 0.3m 半径扫掠并沿墙滑动；控制器每帧按 ≤0.1m 分步调用。
  - 传送边：入口（含一期 B1M、二期 B1、三期 B1 到地铁站厅的通道口）、三期街区边界（`ground` ↔ `P3-1F`）。
  - 坡道：扶梯（每条梯道一段，皮带 0.5m/s）、地铁出入口（楼梯 + 扶梯整段）、落地塔扶梯、车库坡道。状态里的 `slope` 是 `{ id, u, v }`，坡道本体在 `nav.slopeById`。
  - 互动点：楼梯（相邻停靠层）、电梯（全部停靠层），选择后黑场传送到同一部楼梯 / 电梯在目标层的门口。
  - `sightBlocked(nav, a, b)`：视线穿过某楼面高度处若是楼板实体即被挡——准星拾取用它避免"看着地板却显示楼下的店"。
- **显示规则**（`app.js` 的 `applyExploreVisibility`）：所在楼完整显示（不剖切），在地面以上时不画车库层；室外时 30m 内那栋楼只显示地上各层室内；在地铁或相连地下层时显示地铁；在坡道上按低端楼面算。视场角第一人称 60°（`fitFov`），近裁剪面 0.15m。
- **性能与内存**（1280×800、像素比 2、本机强制同步计时，只看相对值）：俯瞰约 7.4ms/帧；漫游一期 1F 6.5、二期 1F 4.5、三期街巷 6.1、地铁 4.4、广场 7.0ms，绘制调用 255–367 次（含阴影与泛光），都不超过俯瞰。第一次走进某栋楼的室内会卡一下（几何上传显卡、编译着色器），之后正常。导航模型构建约 15ms，4030 条墙线段、72 段坡道、82 部楼梯电梯，JSON 约 450KB，不保留任何顶点数据。
- **调试**：`app.explore.state`（位置、楼面、坡道、视角、是否飞行）、`app.explore.teleport({ unit } | { building, level })`。预览面板隐藏时没有 rAF：手动循环 `app.ctx.dynamic` 推进（漫游的 `update` 在里面），按键用 `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))` 模拟；刚刷新、还没渲染过时拾取盒的世界矩阵未就位，先 `debugShot` 一帧。

## 8. 调试与验证技巧

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

## 9. 已知问题与限制

- 二期 B1 标高 −4.2，比地铁站厅（−4.5）高 0.3m，通道尽端做了 3m 缓坡。
- 手机上选中地铁后，楼层栏要横向滑动才能看到 B2（与一期楼层多时相同）。
- 列车按固定 84 秒周期往返，与时刻无关；夜景下出入口雨棚偏暗（只有 M 标识柱和檐口灯带发光）。
- 室内只有站厅、站台吊顶会随相机高度显隐；各期商场仍是"聚焦某层就隐藏上层"的剖切方式。
- 顶点数组上传后已释放：若手机切后台导致 WebGL 上下文丢失，无法自动恢复，页面会提示刷新。
- 手机竖屏的园区总览里，路口一带的标注（四个地铁口、两座落地塔、天桥）比较挤。
- 漫游：家具、树木、车辆、行人、球场围网都不挡人；楼梯和电梯是互动传送，不能真的走楼梯、进轿厢；屏蔽门常闭，不能上车。
- 漫游：地下空间沿用俯瞰时的日光（地面不投影），偶尔能在地下墙面上看到地面树木的淡影。

## 10. 待办：推送到 GitHub 并开 PR

`main` 已在本地合并，但远程还没有。PR 需要远程 `main` 停在 v1 的基线提交 `2ca529c`，这样 PR 才能完整列出 v2、v3 的改动。

1. 在终端登录 GitHub（需要你本人操作）：`gh auth login`
2. 运行脚本（不给参数时新建同名**私有**仓库；已有仓库就把地址作为参数传入）：
   ```bash
   scripts/open-pr.sh
   ```
   脚本做的事：添加远程 → 把基线 `2ca529c` 推为远程 `main` → 推送 `feat/campus-v2` → 以 `docs/pr/campus-v2.md` 为正文开 PR。它**不会**推送本地已合并的 `main`，PR 留给你审阅后在 GitHub 上合并；合并后本地 `git pull` 即可快进。

## 11. 后续可做

- 地面出入口加无障碍电梯（目前只有楼梯 + 上行扶梯）。
- 列车时刻与界面联动（站台到站屏显示倒计时）。
- 三期街区 1F 的行人避开 D 口梯井（目前行走路径只按楼栋避让）。
- 移动端楼层栏在选中分期时自动滚到可见。
- 漫游：楼梯做成可走的坡道、小地图、行人避让玩家。

## 12. 开发流程

本项目按 superpowers 流程推进：头脑风暴 → 规格（`docs/superpowers/specs/`）→ 实现计划（`docs/superpowers/plans/`，任务带编号、逐个勾选）→ 先写测试（TDD）→ 实现 → 截图验证 → 提交（commit 信息带任务编号）→ 发布。v3 计划第 E2 任务末尾记录了实施时相对设计稿的几何调整。
