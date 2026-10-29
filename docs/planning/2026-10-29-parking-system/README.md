# 一期停车系统地图

一期共享地库与西侧地面停车场的布局、层间连接和出入口分析。几何全部由游戏布局 `buildLayout()` 导出，截图取自游戏内游览模式，图上的车位、车道、柱子和坡道都是游戏里的实际几何。

## 文件

- [parking-map.html](parking-map.html)：分层停车地图，浏览器直接打开（需与 `shots/` 同目录）。分地面、-4.5m、-8.4m、-12m 四层，可搜索出入口、点坡道和连接道看详情；侧栏有总览、出入口分析、竖向剖面和实景截图。
- [parking-data.json](parking-data.json)：楼层、车位、柱网、坡道、连接道、道路与路口数据，由 [export-parking-data.mjs](export-parking-data.mjs) 导出。
- `shots/`：19 张游戏内截图（01–06、17 带标注），`shots/thumbs/` 为缩略图。
- [parking-map.src.html](parking-map.src.html)、[build-map.mjs](build-map.mjs)：地图页源码与构建脚本（把数据内联进页面）。
- [capture-shots.cjs](capture-shots.cjs) + [shot-views.json](shot-views.json)、[label-shots.py](label-shots.py)、[export-shots.py](export-shots.py)：截图、标注、导出。

## 竖向分层

一期共享地库共 4,210 个车位。楼层名按各楼自己的编号，所以一期的“B1”和西库、酒店、公寓的“B2”在同一标高。

| 标高 | 楼层（车位） | 互通方式 |
| --- | --- | --- |
| -4.5m | 西库 B1（1,007）、酒店 B1（20）、公寓 B1（22）；一期 B1M 为美食广场与地铁站厅 | 只走人：三处步行连廊通一期 B1M |
| -8.4m | 一期 B1（890）、西库 B2（1,064）、酒店 B2（19）、公寓 B2（24） | 平层开车：跨西外环隧道（西库）、酒店连接道、公寓连接道 |
| -12m | 一期 B2（1,164） | 只经中庭、北侧两对坡道上一期 B1 |

层间坡道 6 对：一期 B1↔B2 中庭（4.5m 宽、24m、15%）与北侧（6m、32m、11.2%）；西库 B1↔B2 中部（5m、30m、13%）与共享（6m、32m、12.2%）；酒店、公寓 B1↔B2 各一对（5m、30m、13%）。

车位 2.5 × 5.0m，主车道 6m，停车模块 5 + 6 + 5 = 16m，柱网 8m（每跨约 3 个车位），坡道 4.5–6m、最大坡度 15%，一期 B1/B2 层高 3.9m/3.6m。

## 出入口

西侧地面停车场 576 个车位（充电 57、无障碍 10），6 个车行口；场内西北、西南两处坡道下到西库 B1。

按坡道口或车行口到最近路口的距离检查，70m 以上为充足。

| 口部 | 接道路 | 落到 | 距最近路口 |
| --- | --- | --- | --- |
| 方庭北口（新增） | 北外环 | 一期 B1 | 120m |
| 星湾东口（新增） | 星湾路 | 一期 B1 | 77m |
| 公寓北口 | 北外环 | 公寓 B1 | 入 78m / **出 7.4m** |
| 酒店南口 | 西外环 | 酒店 B1 | **入 31.6m / 出 23.8m** |
| 西北、西南公共口 | 西侧地面停车场内 | 西库 B1 | 106–130m |
| 地面北口 | 西外环 | 地面停车场 | **17.5m** |
| 地面中央口 | 西外环 | 地面停车场 | 116m |
| 地面南口 | 西外环 | 地面停车场 | **39.2m** |
| 北环西口、北环东口（新增） | 北外环（西延） | 地面停车场 | 124m、77m |
| 大道口（新增） | 云澜大道（西延） | 地面停车场 | 78m |

偏近的四处都是本方案之前就有的口部。建议如下：
- 公寓北口出口只许右转，或与入口对调。
- 地面北口改为只进不出。
- 酒店南口右进右出，送客优先走地面落客环岛。
- 地面南口高峰只出不进，入场改走大道口。

## 重新生成

在仓库根目录：

```bash
node docs/planning/2026-10-29-parking-system/export-parking-data.mjs
node docs/planning/2026-10-29-parking-system/build-map.mjs
```

截图需先 `npm run build && npm run serve`：

```bash
node docs/planning/2026-10-29-parking-system/capture-shots.cjs /tmp/park-raw
python3 docs/planning/2026-10-29-parking-system/label-shots.py /tmp/park-raw /tmp/park-labeled
python3 docs/planning/2026-10-29-parking-system/export-shots.py /tmp/park-raw /tmp/park-labeled
```
