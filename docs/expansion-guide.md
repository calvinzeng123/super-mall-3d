# 云澜汇扩建区使用说明

打开交付包中的 `mall.html` 即可离线浏览。源码工程生成的同一文件位于 `dist/mall.html`，Three.js 和本轮贴图都已打包进去。

## 从哪里进入

顶部楼栋栏可以选择酒店、公寓和住宅 1 至 4，再用楼层栏查看指定楼层。楼层较多时上下滚动，点「全楼」恢复外观。

| 楼栋 | 位置与主入口 | 地上居住层 |
|---|---|---|
| H 云澜酒店 | 一期西侧，东侧主入口朝向方庭 | 20 层，每层 10 间，共 200 间 |
| A 云澜服务公寓 | 酒店南侧，东侧主入口 | 20 层，每层 10 间，共 200 间 |
| R1 至 R4 云澜汇楼盘 | 二期星湾后区，南侧主入口朝向商场 | 每栋 30 层，每层 3 户，共 360 户 |

新增六栋楼的全部楼层可进入，包含地下层和屋顶。合计 760 间客房及住宅使用可复用房型模板，并非 760 套独创设计。住宅每层包含一居、两居、三居三种户型。园区远处原有的城市白色楼群是背景装饰，不能进入。

## 走进房间与乘梯

1. 点工具栏「漫游」，再点击画面控制视角。鼠标无法锁定时，按住画面拖动也可转头。
2. 用 WASD 或方向键行走，Shift 加速，空格跳跃。F 或连续按两次空格切换飞行，飞行时空格上升、C 下降。
3. 走到电梯门正前方，按 E 或点楼层提示选层。新增楼栋的玻璃轿厢会连续升降，到站后继续漫游。飞行模式下先按 F 返回步行，再操作电梯。
4. 点「地点」打开目录，可快速选择建筑、楼层或房间。Esc 释放鼠标，点「退出」回到俯瞰视角。

普通客房与住宅均设床和独立卫浴，公寓有厨房，住宅有厨房、客厅及阳台。

## 地下连通与停车

地下步行主线为住宅 R1 的 B1 → 星湾 P2 的 B1 → 地铁 M 的 B1 → 一期 P1 的 B1M → 酒店 H 的 B1 → 公寓 A 的 B1。R2、R3、R4 的 B1 通过地下支路接入 R1 共享通道。酒店 2F 另有通往方庭 2F 的空中连廊。

酒店、公寓的 B2 车库与一期 P1 的 B1 车库互通。住宅区有独立进出坡道，位于住宅区西北侧，沿北侧环路可达，连接住宅 B1 共享车库。

## 免费贴图

本轮使用 Poly Haven 的六套 CC0 材质，图片已保存在本地，离线浏览无需连接素材站。

- [Marble 01 石材](https://polyhaven.com/a/marble_01)
- [Concrete Pavement 02 铺装](https://polyhaven.com/a/concrete_pavement_02)
- [Oak Wood Planks 橡木](https://polyhaven.com/a/oak_wood_planks)
- [Brick Wall 09 砖墙](https://polyhaven.com/a/brick_wall_09)
- [Clean Asphalt 沥青](https://polyhaven.com/a/clean_asphalt)
- [Grass Ground 草地](https://polyhaven.com/a/grass_ground)

授权见 [Poly Haven 官方许可](https://polyhaven.com/license)，作者、用途和文件校验记录见 [贴图来源文档](texture-sources.md)。

## 从源码运行

电脑需安装 Node.js、npm 和 Python 3。在工程根目录依次执行以下命令，首次安装依赖需要联网。

```sh
npm ci
npm run build
npm run serve
```

随后打开 [本地预览](http://127.0.0.1:5174)。改动源码后重新执行 `npm run build`，即可更新页面和 `dist/mall.html`。
