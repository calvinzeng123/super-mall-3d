# FPS 第一人称模型与许可

2026-10-19 引入。资源只在进入竞技 FPS 时加载，普通园区导览不会触发这三份下载。当前资源总计 **6,026,600 字节（5.75 MiB）**，包括真实贴图手套、布料袖子、SMG-45 和 Desert Eagle。

| 用途 | 作者及原始作品 | 许可 | 本地资源 |
| --- | --- | --- | --- |
| SMG-45、双手、手套袖子、原生换弹 | DJMaesen，[fps animated smg](https://sketchfab.com/3d-models/fps-animated-smg-ea3dad7478624495a5a46f40127b0579) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `assets/models/fps/smg45-mobile.glb` |
| 手枪双手握持 | 同上；Operation Steel Tide 将同一原始手臂制作成紧凑手枪握持姿态 | CC BY 4.0 | `assets/models/fps/pistol-hands-mobile.glb` |
| Desert Eagle 手枪 | ELIZION，[Desert Eagle](https://sketchfab.com/3d-models/desert-eagle-cabde59f5cf24effaf80536e35d04e95) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `assets/models/fps/desert-eagle-mobile.glb` |

两份原作者作品的公开 Sketchfab API 均实查 `isDownloadable=true`、`license.slug=by`、许可链接为 CC BY 4.0；作者、原始页面、许可字段和采集日期保存在 `assets/models/fps/sources.json`。实际下载采用 [Operation Steel Tide](https://github.com/AetherRadar/operation-steel-tide) 中的公开可再分发副本，并固定到该文件记录的提交与 SHA-256。不能将这些模型标为 CC0 或 MIT；上游软件 MIT 许可与模型许可分开保存。

## 改动与性能

- 保留源模型网格、UV、材质贴图、蒙皮和 SMG 的 `reload` 动画；没有使用立方体替代枪或手。
- 手/SMG 图片最大 1024 像素，手枪图片最大 512 像素，JPEG 92 编码；金属、法线和粗糙度图仍保留。没有引入专用 GPU 压缩解码器。
- SMG 21,425 三角形；手枪 13,279 三角形，加握持双手 13,704 三角形。只显示当前武器。
- 两套手共用同一组已加载材质，释放手枪手部的重复纹理及位图；顺序解析三份 GLB，降低同时解码峰值。
- SMG 换弹来自原作者骨骼动画。手枪用原始分件进行弹匣、套筒运动和手臂姿态变化；换枪、呼吸、行走摆动和后坐力在运行时控制。
- 独立相机和灯光仍复用主 WebGLRenderer，主场景后清深度渲染，不再创建第二个 WebGL 上下文。竖屏缩小模型，瞄准时移开近镜枪托。
- `dispose()` 释放本模块加载的几何、材质和位图；世界人物拿枪只共享原资产，不为每个人复制纹理。

## 集成接口

`src/fps/model-data.js` 导出 `FPS_MODEL_ASSETS`；公开构建可替换 URL，不应把 GLB Base64 放入首页应用脚本。

```js
const viewmodel = await createViewmodel({ camera, renderer, onProgress });
viewmodel.update(deltaSeconds, {
  weapon: 'rifle', // SMG-45；'pistol' = Desert Eagle；也支持 0/1
  moving: true, aiming: false,
  reloading: false, reloadProgress: 0,
  switching: false, switchProgress: 0,
});
// 先渲染地图，后渲染 viewmodel。
viewmodel.render();
viewmodel.fire();
const npcWeapon = viewmodel.createWorldWeapon('rifle');
// NPC 挂点：握把中心为原点，枪口朝 +Z；SMG 长约 0.65m。
// NPC 卸载只移除 Object3D，不单独 dispose 共享几何/材质。
viewmodel.dispose();
```

`onProgress` 收到 `{stage:'model',id,label,loaded,total}`。`stats` 提供加载字节、可用动画、当前武器与释放状态。

公开包须保留 `assets/models/fps/CREDITS.txt` 的内容，并从游戏菜单提供作者/许可署名入口。完整上游适配通知保存在同目录 `UPSTREAM-SMG-LICENSE.md`、`UPSTREAM-DESERT-EAGLE-LICENSE.md`。

## 重建与检查

```sh
python3 scripts/fps-assets/download-sources.py /tmp/yunlan-fps-source
python3 scripts/fps-assets/prepare-models.py /tmp/yunlan-fps-source
```

预处理依赖 Pillow。`manifest.json` 保存处理前后字节数、哈希、三角形、贴图尺寸与动画名称。

浏览器验证覆盖 852×393 横屏、393×852 竖屏，两把枪的常态、瞄准、换弹中段/后段，五个换弹/切枪进度点，以及世界枪克隆的尺寸、数值和共享几何。结果保存在 `assets/models/fps/qa-viewmodel.json`。这些是浏览器画面与模型检查，不代表实体 iPhone 的温升、帧率和长时间内存验收。
