# 首页重做（《围城》开场动画 + 主菜单）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 网站一打开：进度条 → Three.js 实时开场动画（4 镜）→ 毛笔 Logo 落下 → 主机风格主菜单，选模式后释放开场场景、直接进游戏；整站改名《围城》。

**Architecture:** 新目录 `src/title/` 自成一块（场景、时间轴、后期、Logo、菜单、启动路由），由 `src/main.js` 挂载，替换旧的 `launcher.js` / `cover-options.js` 封面。开场场景复用游戏里的直升机、双联重机枪、队员、丧尸套件；资源（楼型 JSON、预烘焙丧尸贴图、子集字体）在打包时生成。进游戏前彻底销毁开场 renderer，再调用现有 `runtime.startRuntime`。

**Tech Stack:** three 0.170（`three/examples/jsm` 后期）、esbuild（`build.mjs` 单文件版、`scripts/build-netlify.mjs` Pages 版）、node:test、Playwright（预装 Chromium）、ffmpeg。

**Spec:** `docs/superpowers/specs/2026-11-27-title-screen-design.md`
**视觉参考（一次性试做，不进仓库）：** `/tmp/claude-0/-home-user-super-mall-3d/696de14d-a14b-56e5-8956-2ce14976e3b6/scratchpad/cover7/`（`main.js` 镜头 / 后期 / 复用写法，`index.html` 菜单与 Logo，`shots/`、`cinematic-720.mp4`）。可以从这里搬代码，但要按本计划的接口整理。

## Global Constraints

- 只推分支 `claude/wonderful-thompson-olaaxb`；提交信息中文，结尾两行：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01G96wHwaUgjDQet7D1uBHPg`；代码和提交里不写模型名。
- 注释、界面文字中文，风格和 `src/jimao` 一致。
- Pages 版首页首次下载（进度条阶段）≤ 6 MB gzip；中档手机约 6–8 秒读完；开场显存 ≤ 150 MB。
- 开场帧率：中档手机 ≥ 30 帧、电脑 60 帧；按画质档（`COVER_TIERS` 的 auto/low/balanced/high/ultra，存储沿用 `readCoverTier/writeCoverTier` 的 key）降分辨率 / Bloom / 丧尸数 / 雨量 / 景深。
- 同一时间只有一个 WebGL 上下文；进游戏前 `renderer.dispose()` + `renderer.forceContextLoss()` + 所有贴图几何体 dispose。
- 字体打进包里（Ma Shan Zheng + 英文字体，子集化），运行时不连 Google Fonts。
- 关键镜头亮度中位数 ≥ 0.18（Rec.709 亮度，0–1，去掉黑边后统计）。
- 整站名《围城》：`<title>`、manifest `name`/`short_name`、`apple-mobile-web-app-title`、`theme-color`、图标；「云澜」只留在 Logo 印章和园区名。
- 底边状态行不带边框、不编数字：服务器在线 / 离线来自真实探测，版本号来自 `__JM_BUILD__`。
- 单文件版 `dist/mall.html` 只需能播开场、能进游戏，不受加载预算约束。
- 浏览器验证用 `flock <scratchpad>/browser.lock` 包住、前台跑；给人看的截图 deviceScaleFactor 2。

## Review Focus

1. **开场播放中途点了模式 / 按跳过**：应立即停在 Logo + 菜单，而不是黑屏或双开场——测试在 Task 3。
2. **进游戏后内存没释放**（开场 GL 上下文还活着、两个上下文并存，手机被杀）——测试在 Task 4（`disposeTitle` 后 `renderer.info.memory` 归零、`getContext` 丢失）。
3. **WebGL 不可用 / 资源 404 / 字体加载失败**：退回静态主视觉 + 同一套菜单，仍能进游戏——测试在 Task 4。
4. **从游戏「返回」后刷新**：不再被深链送回游戏，也不重播开场——测试在 Task 3（路由纯函数）。
5. **Logo 首帧不完整 / 闪字**：字体未就绪就开始 Logo 动画——测试在 Task 3（`prepareLogo` 只在 `document.fonts.check` 为真后 resolve）+ Task 5 浏览器逐帧检查。

---

### Task 1: 开场资源打包（楼型、丧尸贴图、字体）

**Files:**
- Create: `scripts/title/bake.mjs`（导出楼型 JSON、预画丧尸贴图、子集字体）
- Create: `src/title/title-data.js`（生成物：`TITLE_TOWERS`、`TITLE_ZOMBIE_TEX`、`TITLE_FONTS`）
- Create: `assets/fonts/`（Ma Shan Zheng、英文标题字体原文件 + 许可）
- Modify: `build.mjs`、`scripts/build-netlify.mjs`（调用 bake；Pages 版把贴图 / 字体作为独立 asset 输出，replacements 里替换 `title-data.js`）
- Test: `tests/title-data.test.js`

**Interfaces:**
- Produces: `TITLE_TOWERS: Array<{id:string, x:number, z:number, w:number, d:number, h:number, rot:number}>`（来自 `buildLayout()`：A、R1–R4、H、W1/W2、T1/T2、P1 商场外轮廓，坐标米）；`TITLE_ZOMBIE_TEX: Array<{id:string, size:number, url:string}>`（预烘焙的 `zombie-skin.js` 腐烂贴图，KTX2 或 JPEG，单张 ≤ 512 px 在 compact 档）；`TITLE_FONTS: {brush:string, latin:string}`（woff2 url）。
- `zombie-skin.js` 新增 `loadZombieKit({prebaked})`：传入预烘焙贴图时跳过 CPU 画图。

- [ ] **Step 1: 写失败测试** `tests/title-data.test.js`：`TITLE_TOWERS` 含 id `A`、`R1`…`R4`，每项 `h > 20`；`TITLE_FONTS.brush` 非空；`loadZombieKit({prebaked:TITLE_ZOMBIE_TEX})` 在 node 假 canvas 下不调用画图函数（spy 计数为 0）。
- [ ] **Step 2: 跑测试确认失败** `node --test tests/title-data.test.js` → FAIL（模块不存在）。
- [ ] **Step 3: 实现 bake + 生成物 + `loadZombieKit({prebaked})`**；字体子集只含开场 / 菜单 / 进度条 / Logo 用到的字（从 `src/title/*.js` 的字符串里收集）。
- [ ] **Step 4: 跑测试通过**；`npm run build:netlify` 成功，`dist/netlify/assets` 出现字体和丧尸贴图文件。
- [ ] **Step 5: 提交** 「开场资源打包：楼型、预画丧尸贴图、子集字体」。

### Task 2: 开场场景与时间轴

**Files:**
- Create: `src/title/scene.js`（建场景、镜头、灯光、后期、画质档）
- Create: `src/title/timeline.js`（镜头时间表 + 纯函数取样）
- Create: `src/title/props.js`（城市立面、楼顶、沙袋、直升机加强、雨、溅水、镜头雨滴、火星、烟）
- Test: `tests/title-timeline.test.js`

**Interfaces:**
- Consumes: Task 1 的 `TITLE_TOWERS`、`TITLE_ZOMBIE_TEX`；游戏模块 `createRideVehicle`（ride-vehicles.js）、`buildTwinHmg`（twin-hmg.js）、`buildParts/RIG`（soldier.js）+ `createRigMaterial`（rig-skin.js）+ `SQUAD`（squad.js）、`loadZombieKit`（zombie-skin.js）、`litFlare/buildFire/fireStep`（siege-props.js）、`assets/models/fps/m4a1-mobile.glb`。不得 import `src/layout/*`、`nav.js`（若 `squad.js` 牵进来，把 `SQUAD` 外观表拆到无依赖的小文件）。
- Produces:
  - `TIMELINE: {full:Shot[], short:Shot[], loop:Shot}`，`Shot = {id:'aerial'|'horde'|'roof'|'heli'|'title', t0:number, t1:number}`；完整版 aerial 0–7、horde 7–13.5、roof 13.5–20、heli 20–26、title 26 起；Logo 落下 27.0、菜单出现 28.4；短版约 6 秒（roof 末段 + heli + Logo）。
  - `sampleShot(list:Shot[], t:number) -> {shot:Shot, local:number /*0..1*/}`
  - `createTitleScene(canvas:HTMLCanvasElement, {tier:string, onProgress:(label:string,p:number)=>void}) -> Promise<TitleScene>`
  - `TitleScene = { play(version:'full'|'short'|'none'), skip(), setT(t:number), on(evt:'logo'|'menu'|'end', fn), stats():{frameMs:number, gpuMB:number}, dispose():void }`；`setT` 驱动一切时间变化（雨、闪烁、颗粒、丧尸、旋翼、UI 渐变），用于截图和导出视频。
  - 构建完成前：所有着色器 `renderer.compile` 预编译，并离屏渲染每个镜头各 2 帧预热；预热进度计入 `onProgress`。

- [ ] **Step 1: 写失败测试** `tests/title-timeline.test.js`：`sampleShot(TIMELINE.full, 8).shot.id === 'horde'`；`sampleShot(TIMELINE.full, 21).shot.id === 'heli'`；`TIMELINE.full` 首尾相接无空隙；短版总长 5–7 秒；`sampleShot(TIMELINE.full, 999).shot.id === 'title'`。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现 `timeline.js`。** 跑测试通过。
- [ ] **Step 4: 实现 `scene.js`、`props.js`**，满足 spec §6 全部条目：
  - 亮度：冷色月光轮廓光 + 天光半球光，暗部抬到深青灰；曝光按镜头在时间轴里设；
  - heli 镜头开头直升机 0.5 秒内露出楼边（修试做版 20–22 秒空镜）；
  - roof 镜头：枪口火光 bloom 阈值单独压，连射间隙枪身可见；沙袋用压扁的袋形几何 + PBR；景深（BokehPass 或便宜的 gather，low 档关）；
  - 丧尸：至少 3 种动作（走、扑、踉跄），体型缩放 0.9–1.15 随机，horde 镜头 ≥ 60 只（low 档 30）；
  - 楼：立面贴图（窗格、楼层带、随机暖灯，不出现红蓝彩窗）+ 高度雾；直升机：旋翼模糊盘 + 下洗气流粒子；
  - 雨在 2× 像素密度下可见 + 地面溅水 + 镜头雨滴；horde 镜头湿地面反光（只这一镜）；
  - 后期：Bloom、ACES、调色、色差、暗角、颗粒、2.39:1 黑边、白闪；写 `pass.uniforms`（`ShaderPass` 会复制 uniforms）；`visible` 一律用布尔值。
- [ ] **Step 5: 浏览器自检**：起本地服务，写 `scratchpad/title/shots.cjs`，在 t=4.5、10、16、24.5、34 截 1600×900（dpr 2），计算每张去黑边后的亮度中位数并打印；全部 ≥ 0.18，肉眼看近景没有方块 / 球体。不达标就调，不进下一步。
- [ ] **Step 6: 提交** 「开场场景：四个镜头、提亮、后期、复用游戏模型」。

### Task 3: Logo、主菜单与启动路由

**Files:**
- Create: `src/title/logo.js`（预栅格化毛笔 Logo：「围城」+ 血红笔刷 + 「云澜」印章 + DEAD MALL）
- Create: `src/title/menu.js`（左上 Logo、左下竖排菜单、二级菜单、设置面板、底边状态行、键盘 / 鼠标 / 触屏）
- Create: `src/title/route.js`（纯函数：开场版本、预选项、深链、返回清理、入口参数）
- Create: `src/title/title.css.js`（样式字符串，含手机横竖屏）
- Test: `tests/title-route.test.js`、`tests/title-menu.test.js`

**Interfaces:**
- Produces:
  - `prepareLogo({fonts:{brush:string,latin:string}, scale:number}) -> Promise<HTMLCanvasElement>`：先 `FontFace.load()` + `document.fonts.add`，等 `document.fonts.check('64px TitleBrush')` 为真才画；失败时 reject（调用方走兜底静态 Logo 图，Task 4）。
  - `ENTRIES`（顺序固定）：`[{id:'siege',label:'丧尸围城（单人）',en:'CAMPAIGN',mode:'jimao',query:'siege=1&autostart=1'}, {id:'coop',label:'联机 · 三人',en:'CO-OP',mode:'jimao',query:'siege=1&mp=1&autostart=1'}, {id:'zero',label:'零点突围',en:'ZERO HOUR',mode:'jimao',query:'siege=0&autostart=1'}, {id:'tour',label:'园区漫游',en:'FREE ROAM',mode:'tour',query:''}, {id:'more',label:'更多玩法',en:'MORE',children:[{id:'drone',label:'无人机送外卖',mode:'tour',query:'play=drone'},{id:'heist',label:'夜间潜入',mode:'tour',query:'play=heist'}]}, {id:'settings',label:'设置',en:'SETTINGS'}]`；每项一句中文说明（试做版的文案可沿用）。
  - `introVersion({search:string, storage:Storage|null, reducedMotion:boolean}) -> 'full'|'short'|'none'`：首访 full；看过（key `weicheng.intro.seen`）short；设置项 key `weicheng.intro.pref` 可为 `full|short|none`；`reducedMotion` → none；`sessionStorage` 有 `weicheng.returning` → none。
  - `deepLink(search:string) -> {direct:{mode,query}|null, preselect:string|null}`：`room=` 有效房间码 → direct 进联机（`siege=1&mp=1&room=CODE&autostart=1`）；`siege=1`→preselect `siege`，`siege=0`→`zero`，`mp=1`→`coop`，`play=drone|heist`→`more`；`guns`、`t`、`shot`、`nointro`、`cover` 等不触发。
  - `returnCleanup(search:string) -> string`：去掉 `room`、`mp`、`siege`、`play`、`autostart` 后的 search。
  - `mountMenu(root:HTMLElement, {logo:HTMLCanvasElement, preselect:string|null, tier:string, onSelect:(entry)=>void, onTier:(tier)=>void, onReplay:()=>void}) -> {show():void, setLoading(label:string,p?:number):void, showError(msg:string):void, setServer(online:boolean|null):void, dispose():void}`。
  - `probeServer(url:string, timeoutMs=4000) -> Promise<boolean>`：把 `COOP_SERVER.url` 的 `wss://` 换 `https://` 加 `/health`，返回是否 `ok`。
- 游戏侧：`src/jimao/run.js` 在 `params.autostart` 时同时写 `jimao-siege` 存档为当前 `siege` 值（现有 `autostart` 已跳过片头和游戏标题菜单，只补存档）。

- [ ] **Step 1: 写失败测试** `tests/title-route.test.js`：
  - `introVersion({search:'',storage:empty,reducedMotion:false})==='full'`；写过 seen 后 `'short'`；pref `none` → `'none'`；reducedMotion → `'none'`；returning → `'none'`。
  - `deepLink('?room=ab12cd').direct.query` 含 `room=AB12CD` 和 `autostart=1`；`deepLink('?siege=1').preselect==='siege'`；`deepLink('?mp=1').direct===null`；`deepLink('?guns=now&t=3').preselect===null`。
  - `returnCleanup('?room=AB12CD&mp=1&siege=1&quality=low')==='?quality=low'`。
  `tests/title-menu.test.js`（jsdom 不可用就用仓库现有的假 DOM 写法，参照 `tests/cover-options.test.js`）：`ENTRIES` 一级 6 项、顺序如上；「更多玩法」不直接触发 `onSelect`，展开后两项触发；方向键 + Enter 选中第一项触发 `onSelect` 一次；Esc 关闭二级菜单。
  `prepareLogo` 测试：假 `document.fonts.check` 先返回 false，确认 promise 未 resolve，再置 true 后 resolve。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现 `route.js`、`logo.js`、`menu.js`、`title.css.js`**；状态行样式照 spec §5（无框、低对比、版本 `__JM_BUILD__`），手机横屏只留右侧状态，竖屏 Logo 在上、菜单在下。
- [ ] **Step 4: 跑测试通过。**
- [ ] **Step 5: 提交** 「主菜单、毛笔 Logo、启动路由」。

### Task 4: 接线、兜底、释放、改名，删旧封面

**Files:**
- Modify: `src/main.js`（新流程：进度条 → `createTitleScene` → `play` → 菜单；选择 → `dispose` → `runtime.startRuntime`）
- Create: `src/title/boot.js`（`bootTitle()`：上面的编排 + 兜底）
- Create: `assets/title/fallback.jpg`（镜头 4 / 标题画面的离线截图，Task 2 的 shots 产出）
- Modify: `index.html`、`src/shell.html`、`assets/icons/manifest.webmanifest`、`assets/icons/*.png`、`build.mjs`、`scripts/build-netlify.mjs`（改名《围城》、theme-color 改深色、credits 页标题）
- Modify: `src/runtime.js`（游戏内「返回」改为设 `sessionStorage['weicheng.returning']=1` 并跳 `returnCleanup` 后的地址）
- Delete: `src/launcher.js`、`src/cover-options.js`、`src/cover-data.js` 的旧封面图引用及其测试；改写依赖它们的测试（`tests/cover-options.test.js` 等，`grep -rl "cover-options\|launcher" tests src`）；`src/jimao/coop/coop.js` 里对 `MP_ENTRY` 的引用改到 `route.js`
- Test: `tests/title-boot.test.js`

**Interfaces:**
- Consumes: Task 2 `createTitleScene/TitleScene`、Task 3 `mountMenu/introVersion/deepLink/returnCleanup/prepareLogo/probeServer/ENTRIES`。
- Produces: `bootTitle({canvas, root, storage, search, startRuntime}) -> Promise<void>`；`disposeTitle()` 后 `renderer.getContext().isContextLost()===true`。
- Pages 版：菜单出现后，若 `!navigator.connection?.saveData`，对 runtime 入口 chunk 和 jimao chunk 发 `<link rel="prefetch">`（URL 来自 esbuild metafile，build-netlify 写进 shell 的一个 `<script type="application/json" id="prefetch">`）。

- [ ] **Step 1: 写失败测试** `tests/title-boot.test.js`（注入假 `createTitleScene` 与假 `startRuntime`）：
  - 场景 reject（模拟无 WebGL）→ 菜单仍挂载、背景为 fallback 图，选「零点突围」调用 `startRuntime('jimao')` 且地址含 `siege=0&autostart=1`；
  - 正常路径：选择后先调 `scene.dispose()` 再调 `startRuntime`（记录调用顺序）；
  - 播放中调用 `skip()` 后立即触发 `menu` 事件；
  - `?room=AB12CD` → 不创建场景，直接 `startRuntime('jimao')`；
  - `prepareLogo` reject → 用静态 Logo 图，不报错。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现 `boot.js` 并改 `main.js`**；进度条：黑底、底边细线、文案轮换（「正在封锁云澜……」等 3–4 句）；进度 = 资源下载 + 场景构建 + 预编译预热；全部完成才 `play`。
- [ ] **Step 4: 改名与删旧封面**；`grep -rn "云澜汇" index.html src/shell.html assets/icons build.mjs scripts/build-netlify.mjs` 只剩园区内部用途（户型文件名等）。
- [ ] **Step 5: 全量测试** `npm test` 全过（改写 / 删除旧封面测试后）。
- [ ] **Step 6: 提交** 「首页换成《围城》开场：接线、兜底、释放、整站改名，删旧封面」。

### Task 5: 打包、预算、浏览器验收、视频、部署

**Files:**
- Create: `scratchpad/title/verify.cjs`、`scratchpad/title/video.cjs`（不进仓库）
- Modify: `HANDOFF.md`（第 3 行线上信息 + 新一节）

- [ ] **Step 1: 打包** `npm run build:netlify && node scripts/prepare-cloudflare.mjs` 成功；统计首页首次下载（进度条阶段请求的所有文件 gzip 总和）≤ 6 MB，打印清单。
- [ ] **Step 2: 浏览器验收**（`flock`，dpr 2）：电脑 1600×900、手机横 844×390、竖 390×844：
  - 进度条走完才开播；完整版、短版（第二次打开）、跳过、减少动态效果、`?room=` 直进大厅；
  - 每 1/30 秒抓 Logo 出场 27.0–28.2 秒的帧：第一帧可见 Logo 时 Logo 画布已完整（与最终帧逐像素差异只来自透明度 / 位移动画）；
  - 关键镜头亮度中位数 ≥ 0.18；
  - 选每个入口都能进对应模式（不出现游戏自己的「断讯」片头和标题菜单），联机入口打开大厅；游戏内返回 → 直接到菜单、刷新不再进游戏；
  - 进游戏后只剩一个 WebGL 上下文；手机模拟 compact 档开场期间页面报错 0；
  - 关掉 WebGL（`getContext` 返回 null）→ 兜底主视觉 + 菜单可进游戏。
- [ ] **Step 3: 导出视频** 用 `setT` 逐帧渲染 1920×1080 30fps 完整版 + 菜单停留 5 秒，ffmpeg 出 `cinematic-1080.mp4`（CRF 23 + 轻降噪）和 `cinematic-720.mp4`；抽帧检查每一镜。
- [ ] **Step 4: 提交 dist** 「重新打包」，推送；部署 Cloudflare Pages，比对线上入口 JS 的 SHA-256 与本地一致；线上打开首页走一遍进度条 → 开场 → 菜单 → 进丧尸围城。
- [ ] **Step 5: 更新 HANDOFF** 并提交推送；把视频和关键截图发给用户。
