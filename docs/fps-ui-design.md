# 封锁行动 · 手机入口与操作界面

2026-10-20。实现文件为 `src/launcher.js` 与 `src/fps/hud.js`。全部为原生 DOM 与内嵌样式，不引入 UI 框架、字体下载、额外 WebGL 上下文或全屏背景模糊。

## 视觉与入口

沿用云澜汇实际场景图作为封面，深蓝灰背景、银白文字、琥珀色行动按钮。普通导览与竞技 FPS 共用入口；进入模式前只显示二维图片与文字。标题、场景图、真实的“一期 → 酒店 → 公寓”路线为识别元素。手机横屏封面左右分栏，竖屏操作按钮置于下方；遵守 iPhone safe-area。

前置设计遵循 frontend-design / Superdesign，使用已有六份初始化文件，针对新页面生成设计而非虚构旧页面。设计草稿：<https://p.superdesign.dev/draft/5c6a936f-73ad-4a4b-a932-e3f427d4f181>。实现使用本地字体和 SVG 图标；没有将草稿的外部 UI CDN 带入游戏。

```js
const launcher = mountLauncher({
  backgroundUrl, // 线上本地图片 URL；离线构建可传 data URI。
  async onSelect(mode) { /* 'tour' | 'fps'；此时才初始化相应场景 */ },
});
launcher.setLoading('正在载入…', 0.6); // progress 是 0..1；省略则为不确定进度。
launcher.showError('加载失败，请重试');
launcher.dispose();
```

入口自身不加载 3D。必须由启动模块延迟初始化模式；成功初始化后调用 `dispose()`。切换模式可重新载入入口，释放上一模式的 GPU/JS 资源。

## 游戏界面接口

```js
const hud = createFPSHUD({
  onAction(action, payload) {},
  onMove({ x, y }) {}, // x 正值向右，y 正值向前，-1..1。
  onLook({ dx, dy }) {}, // CSS 像素；灵敏度与反转只由游戏应用一次。
  onSettings(settings) {},
});
```

- `fire`：`{ pressed: boolean }`，松手、取消、暂停与页面失焦均释放。
- `sprint`：`{ active: boolean }`，点击切换持续冲刺，再推动摇杆；暂停和失焦会释放。
- `ads` / `crouch`：`{ active: boolean }`。
- `reload` / `swap` / `interact` / `heal` / `jump`：点击调用；跳跃也纳入拖动和横竖屏独立布局。
- `extract-route` 切换车辆 / 直升机；`firemode` 切换 SMG 全自动 / 两连发；`lift` 传 `{ id, floor }`，游戏校验候梯位置后启动连续乘梯。
- `squad`：`{ command: 'follow' | 'hold' | 'cover' }`。
- `order`：`{ text }`，由游戏解析或请求后端；输入框不直接调用模型，不暴露密钥。
- `pause`：`{ paused }`；`restart` / `exit` 由启动与游戏层处理。

左摇杆、独立转向区域、按住开火可多指同时使用；按住开火按钮也可拖动瞄准。桌面精准指针不被触屏转向层遮挡。控制按钮不小于 44 CSS px，默认布局在放大至 140% 时仍避让相邻按钮。画面中部保留准星和必要互动文字。

`hud.update(snapshot)` 支持：

```js
{
  hp, maxHp, ammo, reserve, weapon, reloading,
  objective, detail, progress, // progress 为任务阶段 0、1、2。
  heading, bearing, distance, floorLabel,
  teammate: { name, hp, status, command },
  interactLabel, extracting, // extracting 为 0..1，-1/false/null 隐藏。
  medkits, healing, ads, crouching, message, hit, damaged,
  stamina, sprinting, sprintRequested, airborne, movementLabel,
  extractionLabel, fireMode, threatLabel,
}
```

`hud.marker` 是供游戏投影导航标记的 DOM 容器；`hud.map` 是默认隐藏的备用容器。`setPaused(bool)` 只同步界面，不反向发送 pause 动作；玩家点击暂停、设置或编辑器才会调用 pause 回调。`showSettings()`、`editControls()` 可程序打开对应界面；`showLiftStops(link,currentFloor)` 显示实际停靠楼层，不提供任意传送。

结果接口 `showResult({success,title,subtitle,kills,shots,accuracy,time,intel,teammate})`：`accuracy` 是 **0–100 百分数**，`time` 是秒，`intel` 是 0–2，兼容旧布尔字段并显示 `0/2`–`2/2`。`clearResult()` / `reset()` 隐藏结果与准星状态并恢复普通 HUD，不重建模型。`notify(text)` 在暂停时也更新指令反馈，不把消息藏在菜单后面。`dispose()` 释放监听器、计时器和 DOM。

## 自定义与署名

设置包括按键大小、不透明度、转向灵敏度与上下反转，写入 `yunlan.fps.controls.v1`。横竖屏位置独立保存为可用屏幕范围内的归一化坐标。存储不可用时仍能使用当前会话设置。

拖动编辑器真正暂停游戏，先释放摇杆、开火与冲刺。保存写入布局；取消恢复打开编辑器前的位置。旋转屏幕中止当前拖动并使用对应方向布局。恢复默认同时清除两个方向的位置。编辑器不会因拖动开火键而发射。

菜单内置素材署名面板，无须下载额外文件，离线也能阅读。列出 DJMaesen 的 SMG/手臂、ELIZION 的 Desert Eagle、CC BY 4.0 原作/许可链接及改动说明；同时列出 Rocketbox MIT 和 Poly Haven CC0。HTTP(S) 非 localhost 页面另提供完整在线署名链接。

## 验证范围

`docs/qa/fps-ui-controls.json` 记录独立界面检查。上一版的 34 项浏览器断言覆盖入口延迟、回调、按住释放、三触点同时移动/开火/转向、暂停、文字指令、设置保存、拖动不触发开火、横竖屏独立、取消/恢复、结果/重新开始；并验证 375×667、667×375、430×932、932×430 的 140% 默认控制位置不越界和不相互覆盖。`tests/fps-hud.test.js` 验证损坏存储、隔离复制与屏幕边缘约束。

`fps-hud-layout-preview-*` 截图是使用既有场景图片作背景的**独立 UI 预览**，不构成真实游戏截图或物理手机验收。完整游戏流程、资源加载、帧率和上线验收由本轮主游戏 QA 记录另行说明。

本轮冲刺、跳跃、双撤离和电梯的真实浏览器验收见 [扩展 QA](fps-expansion-qa.md)。
