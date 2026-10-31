# 一期室外地砖与室内设计地毯 · 发布验收

日期：2026-10-31。正式入口及后续默认部署目标为 [云澜汇 Netlify](https://yunlan-mall-calvin.netlify.app/)，site ID `3af33d60-6f93-4be3-a2e2-06f122ed5fc3`。

## 实施范围

- 一期主楼 B1M、1F–6F 与八座商业附楼共 34 个商业楼层：亚麻色圈绒底毯，海蓝、鼠尾草绿、陶土色导向带，圆形/圆角拼花、细边与弧线提花。店铺、电梯厅和公共区的覆盖面同步处理。
- 一期室外人行区域：1200×600mm 错缝浅石砖、深色收边、砂岩色点缀，两处喷泉的同心拼花；露台和下沉庭院仍为室外地砖。
- 面层按真实边界避让建筑、采光洞口、坡道、车道、停车位、水池和树穴；浅石色屋面、玻璃穹顶与原玻璃导航保留。FPS 使用原紧凑布局。

## 构建与上线

- 已执行 `npm install`、`npm test`、`npm run build:netlify`；327 项测试全部通过，其中新增真实网格射线检查覆盖地毯层、室内外衔接和广场开口。
- 应用提交：`75612c1`，已推送 GitHub `feat/explore-v4`。PR #1 的合并提交 `8c499e5` 与用户指定提交 `f3517a6` 均在祖先历史中。
- 发布目录：`dist/netlify`，79 个文件、56.35 MiB，入口 `assets/main.ZNPW4SEA.js`。
- 部署命令：`netlify deploy --prod --no-build --dir dist/netlify --site 3af33d60-6f93-4be3-a2e2-06f122ed5fc3`。
- 部署 ID：`6ae58de337b2bb355399b627`。Netlify API 确认 `ready`，正式站发布指针匹配，见 [发布状态](qa/p1-floor-published-20261031.json)。
- 正式站 HTML 引用正确入口；12 个 JavaScript 文件及 9 个新增贴图的 SHA-256 均与本次本地构建一致，见 [线上资源校验](qa/p1-floor-live-assets-20261031.json)。

## 浏览器检查

使用 Chromium 访问正式站，结果见 [运行时检查记录](qa/p1-floor-live-check-20261031.json)。

- 确认 34 个商业层配置地毯；渲染材质使用 `carpet_jacquard/color` 与 `woven_carpet/normal`，粗糙度为 1；室外与露台使用 `limestone_pavers`。
- 抽查 `P1-B1M`、`P1-3F`、`P1-6F`、`P1C-7F`、`P1E-2F`、`P1W1-1F`，未记录页面异常或楼层细节错误。
- 浅石色屋面与玻璃穹顶仍存在；北外环/星湾路的 `P1-N-IN`、`P1-N-OUT`、`P1-E-IN`、`P1-E-OUT` 保留。
- 390×844 手机尺寸下无页面横向溢出，文字 `text-shadow: none`，工具与选层面板正常显示，透镜随选项切换移动。
- 线上截图已保存至本次任务的 `outputs`：一期设计地毯、一期地砖拼花、一期铺装总览、地毯玻璃导航。

## 验收边界

首轮加载时既有沥青/草地贴图遇到 `ERR_CONNECTION_RESET`；重试后导览启动并通过上述检查，沥青资源另经 HTTP 200 下载验证。后续控制台仍记录 `person-m.5da2da91839f374d.glb` 与 `person-f.a1ec332b8f429022.glb` 的 `ERR_CONNECTION_CLOSED`。运行时 JSON 的 `errors: []` 仅表示脚本收集的页面异常为空，并不表示所有网络请求成功或控制台零错误。本次没有证明上述网络中断已消除。

手机检查为浏览器尺寸模拟，没有进行实体 iPhone 长时间运行、温升或内存测试。
