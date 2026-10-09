# 住宅03 · 模型交付与验证

本轮完成独立的四房两厅三卫精装样板。它用于确定住宅内部空间和细节，尚未接入R1–R4楼栋；园区运行代码与已有酒店、公寓版本保持原状。

## 文件与使用

成品集中于 [`prototypes/residential03/`](../prototypes/residential03/)。

- `云澜汇_03四房两厅.blend`：Blender 5.1.2编辑源文件，米制/Z向上，贴图已打包；建筑、天花、门窗、家具、灯光、相机分别放在集合中。默认是剖顶概览，切换室内相机后打开Ceilings集合的渲染可见性。Cycles室内面光、日光、台面照明和相机均保留。
- `云澜汇_03四房两厅.glb`：完整几何、材质、内嵌贴图、相机与太阳光。适合后续Three.js或其他工具导入。glTF不支持Blender面光，第三方查看器需要自己的环境与室内灯。
- `住宅03_离线漫游.html`：下载后在桌面浏览器打开；Three.js、GLB和贴图都内嵌。支持12个快速视角、平面、屋顶显隐、日夜切换、鼠标环绕及自由移动。手机有方向、升降和视角拖动控件。这里的自由移动是观察相机，允许穿墙；园区接入时需要另接碰撞导航。
- `03四房两厅_中文平面图.png/.svg`：家具与墙体由最终Blender实际网格投影生成，门窗符号与面积取自平面定义。
- `overview.png`等：1600×1100的Cycles效果图；包含客厅、主卧、厨房、餐厅、阳台、卫浴、另三卧、俯瞰、顶视及夜景，共12张。
- `build-report.json`、`actual-mesh-audit.json`、`asset-validation.json`、`viewer-qa.json`与`manifest.json`：生成信息、实际几何复核、导出复核、查看器验收及文件SHA256。

## 空间与细节

主卧和南次卧配独立套卫，北侧两间卧室共用公卫；每间卧室有独立床铺、衣柜及外窗，北侧卧室另有学习区。厨房包含L形操作台、凹槽水盆、龙头、灶具、烤箱、冰箱、吊柜及把手；独立洗衣房有叠放洗烘和家务水槽。卫浴含台盆、镜子、马桶、淋浴隔断、顶喷、手持软管和地漏。客厅使用源模型沙发，餐厅配置六人桌椅和餐具，阳台有玻璃栏杆、桌椅、休闲座和种植。

新床品使用垂边、褶皱、翻折边、蓬松枕头、靠枕与床尾毯；窗帘有真实褶皱，地板有拼缝，门有门框和把手，台盆柜体中空以保留槽内空间。龙头弯管、软管、枝干、缝边等曲线在导出前转换为网格。

含墙平面范围为17.6×11.5m，即202.40㎡；阳台17.6×2.8m，即49.28㎡。两项分别列示，不能当作净使用或销售面积。

## 素材来源

主卧床组、两组沙发、客厅挂画和落地灯来自用户提供的套房，经现有`assets/models/user-suite-processed.glb`导入并保持1:1比例。用户原始文件与仓库保留副本SHA256仍为`db210ebc36728c7afa4b67112c6e8a9f27e68695ade30a2d7d63a59d349e03bd`，未修改。用户模型及内含图片不是CC0。

新家具、墙体、门窗、灯具和软装由本轮Blender脚本生成。橡木和石材沿用仓库`oak_wood_planks`、`marble_01`的Poly Haven CC0素材；来源和许可见[材质来源](texture-sources.md)及`assets/textures/manifest.json`。HTML包含Three.js的MIT许可文本。无需运行时下载素材。

## 验证口径

实际网格检查使用0.03m接触容差、0.30m行走半径和0.05m网格；全部18个目标（15个房间/阳台位置及3个淋浴区）可从入户到达，未发现家具穿墙、门口占用或窗前高柜/贴面遮挡。源家具的世界轴缩放均为1。此检查针对保存后的实际网格，不是仅验证JSON占位框。

导出复核检查GLB结构、内嵌图片、所有位置数据有限性，并在干净Blender场景中重新导入，核对网格数量和整体范围。查看器完整交互测试包含桌面1440×900、手机390×844模拟、12个视角、屋顶、昼夜、键盘/触屏移动；断网后从空白页面重新初始化，HTTP请求、运行异常和WebGL错误均为0。具体模型版本和复核记录由各JSON中的SHA256绑定；手机结果不是实体设备测试。

本轮没有修改园区运行代码，未重复执行前次95项园区测试；它们验证的是上一轮套房接入。独立模型没有柜门、入户门或水龙头操作动画；门叶保存为开启状态，方便观察和后续接入。

## 重建

从仓库根目录运行，先安装现有Node依赖，并安装Blender。macOS示例：

```sh
npm ci
/Applications/Blender.app/Contents/MacOS/blender --background --factory-startup \
  --python scripts/residential/build_residence.py -- --out prototypes/residential03
node scripts/residential/build-viewer.mjs
/Applications/Blender.app/Contents/MacOS/blender --background --factory-startup \
  --python scripts/residential/audit_residence.py -- \
  --blend prototypes/residential03/云澜汇_03四房两厅.blend --out prototypes/residential03
/Applications/Blender.app/Contents/MacOS/blender --background --factory-startup \
  --python scripts/residential/verify_assets.py -- --out prototypes/residential03
python3 scripts/residential/draw_plan.py \
  --audit prototypes/residential03/actual-mesh-audit.json --out prototypes/residential03
```

`--quick`仅供低采样预览，`--no-render`仅输出模型，`--views overview,living`可选渲染机位。`draw_plan.py`始终输出SVG；PNG还需要Pillow及中文字体。模型重建会改变资产校验值，须重新构建HTML并做查看器复核。

## 后续接入

2026-10-09已完成01和02的不同三房两厅样板，见[01/02交付说明](residential-01-02-delivery.md)；03保留当前四房两厅，三种户型都有大阳台。已有园区的单元尺度小于本样板，后续需要同步调整住宅楼占地、公共核心筒、入户门、走廊、立面、按层资源和导航，不能整体压缩模型来填入旧房间。三个独立样板均已交付，不代表360户完成替换。
