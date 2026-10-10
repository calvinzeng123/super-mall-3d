# 01 / 02 三房两厅 · Blender交付

> 当前状态（2026-10-09）：01、02、03 已按 1:1 接入 R1–R4 的 2F–30F，1F 为独立大堂，合计 348 户。见[住宅接入说明](residential-integration.md)及[园区接入 QA](qa-2026-10-09-residential-integration.md)。以下保留独立样板的交付与验收口径，原始成品未因接入而修改。

2026-10-09。两套均为三房两厅两卫，含墙轮廓179.40㎡、阳台43.68㎡单列；不是净使用面积。01横厅家庭型和02镜像阅读型的具体入口、家具与动线区别见[布局说明](residential-01-02-plan.md)。

## 打开成品

- [01成品目录](../prototypes/residential01/)：`云澜汇_01三房两厅.blend`、对应GLB和`住宅01_离线漫游.html`。
- [02成品目录](../prototypes/residential02/)：`云澜汇_02三房两厅.blend`、对应GLB和`住宅02_离线漫游.html`。
- 每套12张1600×1100 Cycles效果图：整体、顶视、客厅、餐厅、主卧、两间次卧、厨房、主卫、公卫、阳台、客厅夜景。中文平面图另有PNG/SVG。
- `build-report.json`、`actual-mesh-audit.json`、`asset-validation.json`、`viewer-qa.json`与`manifest.json`记录构建、真实几何、再导入、离线交互和校验值；`qa-images/`保留浏览器证据。

HTML需下载后用浏览器打开；模型、贴图和Three.js均已内嵌。快速视角包含各卧室和卫浴，02增加阅读区；支持屋顶、日夜、环绕与自由移动。WASD移动、Q/E升降、Shift加速、Esc退出；手机有方向与升降按钮。独立查看器的自由移动是观察相机，可穿墙；园区版已另接实际模型碰撞。

Blender文件按Structure、Ceilings、Windows、Joinery、Furnishings、Lighting、Cameras分组；米制、Z向上、贴图打包。默认剖顶总览隐藏Ceilings的渲染，渲染室内需打开该集合。glTF不支持Blender面光，所以GLB单独在第三方软件打开时需补环境/室内灯；交付HTML已带专用补光。

## 核验

| 项目 | 01 | 02 |
|---|---:|---:|
| 保存的Blender网格对象 | 1483 | 1525 |
| GLB重新导入网格对象 | 1483 | 1525 |
| 源文件使用中的打包图片 | 16 | 16 |
| GLB内嵌图片 | 16 | 16 |
| 外部GLB资源 | 0 | 0 |
| 负尺度mesh变换 | 0 | 0 |
| 外包络越界/墙穿插/门口侵入/窗遮挡 | 全部0 | 全部0 |
| 实际网格可达目标 | 14/14 | 14/14 |

几何通行检查以0.30m人物半径、0.05m网格搜索，使用真实网格离地0.12–1.75m投影，含12个空间点和2个淋浴区；墙角接触容差0.03m。阳台洗烘塔曾遮主卧窗，已移至实墙下、联动花槽与雨棚。导出检查覆盖GLB长度/图片内嵌/有限顶点/细曲线网格及整体范围，并在干净Blender场景重新导入。02镜像烘焙并修正绕序，最终导出不留负尺度mesh。

两套查看器都做过桌面1440×900与手机390×844模拟的完整视角、日夜、顶板、键鼠/触屏移动检查；断网后从空白页面重新初始化，无HTTP资源请求、运行异常或WebGL错误。最终相机版本重导后重新构建HTML，并完整重跑上述交互检查；各自QA报告绑定最终模型、HTML和截图的SHA256。手机测试是浏览器模拟，不是实体设备测试。

独立样板交付时，共享检查工具扩展后，原03重新审计仍为1705个mesh、18/18目标可达、冲突0；新viewer源码的03临时页面兼容测试也通过。该阶段03既有成品和园区运行代码未重建，前次95项园区测试不作为独立住宅样板的验证结果；后续园区接入验证见本文顶部链接。

## 重建

在仓库根目录安装现有Node依赖后运行。将下面的01改为02即可制作另一套：

```sh
npm ci
/Applications/Blender.app/Contents/MacOS/blender --background --factory-startup \
  --python scripts/residential/build_three_bedroom.py -- \
  --unit 01 --out prototypes/residential01
node scripts/residential/build-viewer.mjs --unit 01
/Applications/Blender.app/Contents/MacOS/blender --background --factory-startup \
  --python scripts/residential/audit_residence.py -- \
  --blend prototypes/residential01/云澜汇_01三房两厅.blend \
  --plan scripts/residential/plan_01.json --out prototypes/residential01
/Applications/Blender.app/Contents/MacOS/blender --background --factory-startup \
  --python scripts/residential/verify_assets.py -- \
  --plan scripts/residential/plan_01.json --out prototypes/residential01
python3 scripts/residential/draw_plan.py \
  --audit prototypes/residential01/actual-mesh-audit.json \
  --plan scripts/residential/plan_01.json --out prototypes/residential01
```

构建器支持`--quick`、`--no-render`与`--views overview,living`。PNG平面图需要Pillow与中文字体，SVG不依赖Pillow。查看器CLI支持`--unit`或`--plan`，原03位置参数用法继续兼容。浏览器QA脚本为`qa-viewer.mjs`，依赖本机Playwright skill提供的CLI，详见脚本头部命令；它不是普通场景运行依赖。

用户套房及其内含图片不属于CC0；原件未更改。新增材质使用仓库既有Poly Haven橡木/石材CC0图，来源见[材质清单](texture-sources.md)。园区接入已按模型实际尺寸重排核心筒、门口与楼层加载，保持整套家具的原始比例；接入参数及后续重建顺序见[住宅接入说明](residential-integration.md)。
