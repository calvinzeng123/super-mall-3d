# 贴图行人：来源、处理与运行方式

2026-10-17：原来的胶囊身体与圆球头部已替换为 **Microsoft Rocketbox** 的两套真人比例人物网格。两套人物都保留原有脸部、皮肤、衣物、鞋履、头发贴图。男女人物复用各自的模型；这不是大量独立扫描人物，也不是写实程度无限制的角色系统。

## 来源与许可

- 作者/发布方：Microsoft / Rocketbox。使用 `Male_Adult_01` 和 `Female_Adult_01`。
- 固定源版本：[0943055db6ec570bcef9f2c8b41c9e5467c808f9](https://github.com/microsoft/Microsoft-Rocketbox/tree/0943055db6ec570bcef9f2c8b41c9e5467c808f9)。
- [原库 README](https://github.com/microsoft/Microsoft-Rocketbox/blob/0943055db6ec570bcef9f2c8b41c9e5467c808f9/README.md) 明确记录 2020 年 12 月改为 MIT，头像库也按 MIT 发布。不能沿用更早公告的仅研究用途描述。
- [原库 MIT 许可](https://github.com/microsoft/Microsoft-Rocketbox/blob/0943055db6ec570bcef9f2c8b41c9e5467c808f9/LICENSE.md) 允许使用、修改和分发；本项目保留完整版权与许可于 `assets/models/people/LICENSE.txt`，线上和离线 HTML 也内嵌该许可。
- `assets/models/people/manifest.json` 保存每个源 FBX/颜色贴图的固定下载 URL、SHA-256，以及最终 GLB 校验值。资源不在运行时从第三方网站获取。

## 实际模型与性能

| 资源 | 三角面 | 标准身高 | 贴图 | 步行姿态 |
|---|---:|---:|---|---:|
| 男性休闲人物 | 3,571 | 1.80 m | 1024² RGBA 图集 | 8 |
| 女性休闲人物 | 4,190 | 1.69 m | 1024² RGBA 图集 | 8 |

两份 GLB 合计 3,202,260 字节（约 3.05 MiB）。手机解码后将每份共享图集缩到 512²。图集保留头发透明遮罩；运行时采用 alpha-test，避免整个人体进入透明排序。

使用源模型的原生骨骼，在 Blender 中生成保守的摆臂、迈步与屈膝动作，再烘焙为八个循环形变姿态。这里使用的是新写的程序步态，不是原库动作捕捉；尝试过的另一 FBX 动作存在绑定骨架差异，未纳入成品。每个姿态按支撑鞋底落地校准。

每个可显示楼层至多使用两份 `InstancedMesh`，整个园区共享几何、材质与图集。实例之间错开动作相位并稍微变化身高。每个行人没有独立骨骼、AnimationMixer 或复制贴图；站在扶梯上时停止迈步。楼层隐藏时不更新人群；非闭环路径到终点原路返回。人物仍是装饰，不阻挡玩家导航。

画质接入 `ctx.peopleQuality.setDensity(fraction)` 和 `.stats`：流畅/均衡/精细分别使用 22% / 55% / 100% 人群与 95 / 155 / 230 m 距离剔除，动画更新上限 20 / 30 / 30 Hz。远景城市总览会隐藏距离过远的小人物。切回近景自动恢复，不需要重新加载模型。

## 重建

需要 Python Pillow 与 Blender：

```sh
python3 scripts/people/prepare_people.py --cache /tmp/yunlan-rocketbox
node --test tests/people-assets.test.js
npm run build:netlify
```

转换器只下载这两个人物和所需颜色图；不会克隆整个大型原库。源文件缓存保留在 `/tmp`，生成 GLB 和清单进入仓库。`src/render/people-data.js` 是被忽略的生成模块，离线构建内嵌数据，Netlify 构建外置为内容哈希 GLB。

实现位于 `src/render/people-asset.js`、`src/render/build/people.js`、`scripts/people/`。不更改现有套房或三种住宅模型。

## 验证范围

- 自动检查两模型许可文本、源文件校验、内嵌纹理、UV、全部八个形变、三角面预算、人体尺度、鞋底落地和无异常拉长肢体。
- 浏览器 GPU 检查直接调用正式 `buildPeople`：两张真实纹理、八姿态插值、12 人→0 人→3 人→12 人切换、无页面或着色器错误。该独立测试场景不代替完整园区走查。
- iPhone 15 浏览器模拟确认图集缩为 512²，步行形变和人群密度往返切换同样通过，零页面/着色器错误。
- [桌面人物测试场景](images/people-textured-preview.png)、[手机人物测试场景](images/people-textured-mobile.png)；记录见 [桌面 GPU 检查](qa/people-browser-desktop.json) 与 [手机 GPU 检查](qa/people-browser-mobile.json)。这是浏览器模拟，非真机验收。
