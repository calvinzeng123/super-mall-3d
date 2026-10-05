# 第一人称漫游（v4）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在现有园区页面加「漫游」模式：人眼高度步行（墙、楼板边缘挡人，扶梯与坡道换层，楼梯与电梯一键换层），可切换飞行；电脑键鼠、手机摇杆，横竖屏都可用。

**架构：** 纯函数导航模型 `src/layout/nav.js` 从布局数据生成各楼面的可站立区、墙、传送边、坡道和互动点，并提供 `step()` 解算每一步移动（Node 中测试）；渲染侧 `src/render/explore.js` 负责输入、相机、显示规则与 HUD，复用现有场景。门洞规则抽到 `src/layout/frontage.js`，渲染与导航共用。

**技术栈：** three.js r170（jsDelivr importmap）、esbuild、node:test。

规格：`docs/superpowers/specs/2026-10-05-first-person-explore-design.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| 创建 `src/layout/frontage.js` | 店面样式 `storeStyle(lv, u)` 与门洞 `doorGaps(style, len)`（局部 u 区间） |
| 修改 `src/render/build/storefronts.js`、`street.js`、`interiors.js` | 改为引用 frontage.js（行为不变） |
| 创建 `src/layout/nav.js` | `buildNav`、`step`、`clear`、`landAt`、`linksNear`、`spawn`、`floorLabel`、`NAV` 常量 |
| 创建 `tests/nav.test.js` | 导航模型测试 |
| 创建 `src/render/explore.js` | 漫游控制器：输入、物理、相机、互动、传送、准星拾取、HUD 更新 |
| 修改 `src/render/app.js` | `state.explore`、漫游显示分支、停用 OrbitControls、近裁剪面 |
| 修改 `src/render/ui.js` | 工具栏「漫游」、漫游时目录点击改为传送 |
| 修改 `src/shell.html` | HUD、摇杆与按钮、样式 |
| 修改 `src/main.js` | `attachExplore(app, ui)` |
| 修改 `HANDOFF.md` | 漫游说明 |

---

### 任务 F1：导航模型测试（先写，必须失败）

**文件：** 创建 `tests/nav.test.js`

- [ ] 写测试：

```js
// 第一人称导航模型（v4 规格第 3、8 节）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl } from './helpers.js';
import { pointInPoly, toW, toL, dist } from '../src/layout/geom.js';
import { doorGaps, storeStyle } from '../src/layout/frontage.js';
import { buildNav, step, clear, landAt, spawn, NAV } from '../src/layout/nav.js';

const nav = buildNav(L);
const at = (floor, x, z) => ({ floor, x, z, y: nav.floors.get(floor).y, slope: null });
/** 分成小步走：每步不超过 0.1m（与控制器一致，防止穿墙） */
const walk = (s, dx, dz) => {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let i = 0; i < n; i++) s = step(nav, s, dx / n, dz / n, 0);
  return s;
};
const targetOf = (e) => (e.to === 'bridge' ? 'bridge' : e.to === 'site' ? 'ground' : e.to);

test('每个入口都能穿过，并切换到正确楼面', () => {
  for (const e of L.entrances.filter((x) => !x.kiosk)) {
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    const s0 = at(e.level, mx - e.nx * 1.5, mz - e.nz * 1.5);
    assert.ok(clear(nav, s0), `${e.id} 内侧起点不可站立`);
    const s1 = walk(s0, e.nx * 3, e.nz * 3);
    assert.equal(s1.floor, targetOf(e), `${e.id} 穿过后楼面为 ${s1.floor}`);
    assert.ok(dist([s1.x, s1.z], [s0.x, s0.z]) > 2.9, `${e.id} 被挡住`);
  }
});

test('每个铺位都能从门口走进去（冰场除外）', () => {
  for (const lv of L.levels) {
    for (const u of lv.units) {
      const style = storeStyle(lv, u);
      if (style === 'rink') continue;
      const ok = u.fronts.some((f, i) => {
        const w = u.wfronts[i];
        const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
        const gaps = doorGaps(style, len);
        if (!gaps.length) return false;
        const [a, b] = gaps[0];
        const t = (a + b) / 2 / len;
        const px = w.x0 + (w.x1 - w.x0) * t, pz = w.z0 + (w.z1 - w.z0) * t;
        const s0 = at(lv.id, px + w.nx * 1.5, pz + w.nz * 1.5);
        if (!clear(nav, s0)) return false;
        const s1 = walk(s0, -w.nx * 3, -w.nz * 3);
        return s1.floor === lv.id && u.polys.some((p) => pointInPoly([s1.x, s1.z], p));
      });
      assert.ok(ok, `${lv.id} ${u.code} ${u.brand.name} 进不去`);
    }
  }
});

test('铺位侧墙挡人：从店内朝侧墙走，停在墙前', () => {
  let checked = 0;
  for (const lv of L.levels.filter((l) => ['retail', 'food'].includes(l.kind))) {
    for (const u of lv.units.filter((x) => x.rects.length === 1).slice(0, 3)) {
      const r = u.rects[0];
      const c = toW(u.frame, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      const fronts = new Set(u.fronts.map((f) => f.side));
      const side = ['E', 'W', 'N', 'S'].find((sd) => !fronts.has(sd));
      if (!side) continue;
      const [du, dv] = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] }[side];
      const [dx, dz] = [du * u.frame.c - dv * u.frame.s, du * u.frame.s + dv * u.frame.c];
      const s0 = at(lv.id, c[0], c[1]);
      if (!clear(nav, s0)) continue;
      const s1 = walk(s0, dx * 30, dz * 30);
      assert.ok(u.polys.some((p) => pointInPoly([s1.x, s1.z], p)), `${lv.id} ${u.code} 穿出侧墙`);
      checked++;
    }
  }
  assert.ok(checked >= 20, `只检查了 ${checked} 家`);
});

test('中庭洞口挡人：一期 2F 朝圆厅中心走，停在洞口外', () => {
  const p1 = L.buildings.find((b) => b.id === 'P1');
  const r = p1.rotundas[0];
  const lv = lvl('P1-2F');
  const s0 = at(lv.id, r.x + 28, r.z);
  assert.ok(clear(nav, s0));
  const s1 = walk(s0, -30, 0);
  assert.equal(s1.floor, lv.id);
  assert.ok(!lv.voids.some((v) => pointInPoly([s1.x, s1.z], v.poly)), '走进了中庭洞口');
});

test('扶梯：上行从下端走上去到上层，下行从上端走下去到下层', () => {
  for (const e of L.escalators) {
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    if (e.dir === 'up') {
      const s0 = at(e.from, e.bottom.x - ux * 1.2, e.bottom.z - uz * 1.2);
      const s1 = walk(s0, ux * (run + 4), uz * (run + 4));
      assert.equal(s1.floor, e.to, `${e.id} 没到 ${e.to}`);
      assert.ok(Math.abs(s1.y - e.top.y) < 1e-6);
    } else {
      const s0 = at(e.to, e.top.x + ux * 1.2, e.top.z + uz * 1.2);
      const s1 = walk(s0, -ux * (run + 4), -uz * (run + 4));
      assert.equal(s1.floor, e.from, `${e.id} 没到 ${e.from}`);
      assert.ok(Math.abs(s1.y - e.bottom.y) < 1e-6);
    }
  }
});

test('地铁出入口：从站厅沿楼梯走上地面', () => {
  for (const e of L.entrances.filter((x) => x.kiosk)) {
    const G = e.kiosk.frame;
    const [x0, z0] = toW(G, -1.2, -1.1);
    const s0 = at(e.level, x0, z0);
    assert.ok(clear(nav, s0), `${e.name} 起点不可站立`);
    const [dx, dz] = [G.c * (e.kiosk.run + 4.5), G.s * (e.kiosk.run + 4.5)];
    const s1 = walk(s0, dx, dz);
    assert.ok(s1.floor === 'ground' || s1.floor === 'P3-1F', `${e.name} 到了 ${s1.floor}`);
    assert.equal(s1.y, 0);
  }
});

test('出生点可站立：总览、各期、各层', () => {
  const opts = [{}, ...L.buildings.map((b) => ({ building: b.id })), ...L.levels.map((l) => ({ level: l.id }))];
  for (const o of opts) {
    const s = spawn(nav, L, o);
    assert.ok(s && clear(nav, s), `出生点不可站立：${JSON.stringify(o)}`);
  }
});

test('楼梯、电梯在每个停靠层的互动点都可站立', () => {
  for (const k of nav.links) for (const st of k.stops) assert.ok(clear(nav, at(st.floor, st.x, st.z)), `${k.id} 在 ${st.floor} 的互动点不可站立`);
});

test('飞行落地：一期东南翼上空 9m 落到 2F', () => {
  const se = L.buildings.find((b) => b.id === 'P1').wings.find((w) => w.id === 'SE');
  // u=55 在 2F 商业街两段通高缝 [40,52]、[58,72] 之间（缝里本来就该掉到 1F）
  const [x, z] = toW(se.F, 55, 0);
  const s = landAt(nav, x, z, 9);
  assert.equal(s && s.floor, 'P1-2F');
});

test('连通：一期 1F 从主入口内侧能走到同层每家店的门口', () => {
  const lv = lvl('P1-1F');
  const e = L.entrances.find((x) => x.level === lv.id && x.main);
  const mx = (e.seg.x0 + e.seg.x1) / 2 - e.nx * 2, mz = (e.seg.z0 + e.seg.z1) / 2 - e.nz * 2;
  const key = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const seen = new Set([key(mx, mz)]);
  const queue = [[Math.round(mx), Math.round(mz)]];
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(x + dx, z + dz);
      if (seen.has(k)) continue;
      // 单步走 1m：step 对墙做扫掠检测，不会穿墙
      const s1 = step(nav, at(lv.id, x, z), dx, dz, 0);
      if (s1.floor !== lv.id || dist([s1.x, s1.z], [x + dx, z + dz]) > 0.05) continue;
      seen.add(k);
      queue.push([x + dx, z + dz]);
    }
  }
  for (const u of lv.units) {
    const w = u.wfronts[0];
    const px = (w.x0 + w.x1) / 2 + w.nx * 1.5, pz = (w.z0 + w.z1) / 2 + w.nz * 1.5;
    const near = [...seen].some((k) => { const [a, b] = k.split(',').map(Number); return Math.hypot(a - px, b - pz) < 1.2; });
    assert.ok(near, `${u.code} ${u.brand.name} 的门口走不到`);
  }
});
```

- [ ] 运行 `node --test tests/nav.test.js`，预期失败（模块不存在）。Commit `test(nav): 第一人称导航模型测试（任务 F1）`

### 任务 F2：门洞规则共享（frontage.js）

**文件：** 创建 `src/layout/frontage.js`；修改 `src/render/build/storefronts.js`、`street.js`、`interiors.js`

- [ ] `storeStyle(lv, u)`：从 storefronts.js 原样搬过来（showroom → glass；u.style 优先；美食层的 food / snack → stall；cinema → cinema；其余 glass）。P3 店铺 style 为 `street`，冰场 cat 为 `rink` 时返回 `rink`。
- [ ] `doorGaps(style, len)` 返回门面局部区间数组 `[[a, b], ...]`：
  - glass / cinema / market / showroom：门宽 `len ≥ 5 ? min(3.2, 0.3·len) : len ≥ 3 ? 1.8 : 0`；门中心 market 为 `[0.25·len, 0.75·len]`，其余 `[0.5·len]`；门宽为 0 时返回 `[[0, len]]`；
  - street：门宽 `min(2.2, 0.3·len)`，居中；
  - stall / oldstreet / bar / pavilion：`[[0, len]]`；
  - rink：`[]`。
- [ ] storefronts.js 的 `doorW`、`doors` 与 street.js 的 `door` 改为由 `doorGaps` 推出（画面不变）；`storefronts.js` 继续导出 `storeStyle`（转导出），interiors.js 不用改调用。
- [ ] `npm test`、`npm run build` 通过；浏览器抽看一期 1F、三期 1F 店面不变。Commit `refactor(render): 店面门洞规则抽到 frontage.js（任务 F2）`

### 任务 F3：导航模型（nav.js）

**文件：** 创建 `src/layout/nav.js`

- [ ] 常量 `NAV = { r: 0.3, eye: 1.62, reach: 1.6, cell: 8 }`。
- [ ] 楼面：每个楼层（`y = elev`，可站立区 = `slab.pieces` 的外框减洞，再减 `voids`）；`ground`（园区 ±298 减一期 / 二期外轮廓、三期街区矩形、湖、`site.trenches`、`site.openings`）；`bridge`（`bridges.walk` 多边形并集，`y = bridges.y`）。
- [ ] 门口区（zone）：每个传送边、每段坡道两端，在相关楼面各加一个跨在边线上的矩形（沿边宽同门宽、法向 ±0.6m）计入可站立区。
- [ ] 墙（局部线段 → 世界线段）：
  - 铺位：`subtractOpenings(mergeSegments(unionOutline(u.rects)), 门洞)`，门洞由 `doorGaps(storeStyle(lv,u), len)` 落到每段门面上；
  - 用房：`unionOutline(m.rects)` 全封闭；
  - 不在核心筒的电梯（`glass` 或 `exterior`）：井道矩形；
  - 扶梯：每对在下层的占地矩形（`slotRect`）两侧与上端，下端扣掉每条梯道的入口（梯道中心 ±0.6m）；
  - 地铁要素：`gates` 每个闸机柜一段（x ± 0.85）；`fence`；`tvm` 外包矩形；`psd`；
  - 地面：地铁出入口雨棚两侧玻璃与背板（`kiosk.frame` 局部 u∈[−0.5,12]，v=±3.45；u=−0.5 背板）。
  - 按 `NAV.cell` 网格建索引。
- [ ] 传送边：入口（排除 `kiosk`）`e.level` ↔ 目标楼面（`site` → 入口在三期街区内为 `P3-1F`，否则 `ground`；`bridge` → `bridge`；其他为楼层 id）；三期街区矩形四边 `ground` ↔ `P3-1F`。
- [ ] 坡道（`{ id, kind, F, len, hw, y0, y1, low, high, belt }`，u 从低端指向高端）：
  - 每部扶梯一段：`F` 原点在 bottom、u 指向 top，`hw = 0.9`，`belt = dir === 'up' ? 1 : -1`（m/s 乘 0.5）；
  - 地铁出入口：`kiosk.frame`，u∈[0, run]，`hw = 3`，低端 `M-B1`、高端为该口所在地面楼面；
  - 落地塔扶梯：`bridges.verticals` 中 `type === 'escalator'`，底端 → 顶端，低端 `ground`、高端 `bridge`；
  - 车库坡道与一期 B1↔B2 坡道：`ramps`，`from`/`to` 中标高较低者为低端；`street` 端为 `ground` / `P3-1F`。
- [ ] 互动点：每部楼梯（门段中点外 1m，`doorByLevel` 优先）、每部电梯（门外 `reach + 0.6`）、落地塔楼梯与电梯（`v.ground` ↔ `v.deck`）。
- [ ] `clear(nav, s)`：中心与半径 r 的四个方向点都可站立，且中心离墙 ≥ r − 0.01；坡道状态时检查 v 在 ±(hw − r) 内。
- [ ] `step(nav, s, dx, dz, dt)`：
  1. 坡道状态：投到坡道局部坐标，加皮带速度 `belt·0.5·dt`，v 夹在 ±(hw − r)；u<0 / u>len 时尝试落到低 / 高端楼面（落点不可站立就夹住），高度 `y0 + (y1−y0)·u/len`；
  2. 楼面状态：先查传送边（移动线段与传送边相交且目标楼面 `clear` → 切换），再查坡道入口（低端楼面从 u<0 跨到 u≥0、或高端楼面从 u>len 跨到 u≤len，且 |v| < hw − r → 进入坡道），再做墙的扫掠检测（移动线段穿过墙就停在墙前，任意步长都不会穿墙），然后按墙做圆与线段碰撞滑动（迭代 3 次），最后检查可站立；不行就分别只走 x、只走 z，都不行就不动。
- [ ] `landAt(nav, x, z, yMax)`：所有楼面中 `y ≤ yMax` 且中心可站立的最高者。
- [ ] `linksNear(nav, floor, x, z)`：本楼面 `NAV.reach` 内的互动点及其可去楼层。
- [ ] `spawn(nav, layout, { building, level })`：按规格 2.1；楼层出生点在最大走道多边形里按 `polySamples` 找第一个 `clear` 的点，朝向多边形长边方向。
- [ ] `floorLabel(nav, layout, s)`：按规格 2.3。
- [ ] `node --test tests/nav.test.js` 全部通过；`npm test` 全部通过。Commit `feat(layout): 第一人称导航模型（任务 F3）`

### 任务 F4：漫游控制器（电脑）

**文件：** 创建 `src/render/explore.js`；修改 `app.js`、`ui.js`、`main.js`、`shell.html`

- [ ] `attachExplore(app, ui)`：首次进入时 `buildNav(layout)`；`app.enterExplore()` / `app.exitExplore()`；保存 / 恢复进入前的相机与状态；进入时停导览、取消镜头飞行、`controls.enabled = false`。
- [ ] app.js：`state.explore = { building, metro, near }`；`applyVisibility` 漫游分支（规格第 5 节）；主循环漫游时不调用 `controls.update()`；`updateNear()` 漫游时 near = 0.08。
- [ ] 输入：点击画面请求指针锁定；`mousemove` 改 yaw / pitch（pitch 夹在 ±85°）；WASD / 方向键、Shift、空格（300ms 内双击切换飞行）、C / Ctrl、F、E、数字键；Esc 释放鼠标。
- [ ] 物理：每帧把水平位移拆成 ≤0.1m 的小步调用 `step`；跳跃与重力只影响视线；飞行时直接移动（8m/s，按住加速到 30m/s）；关闭飞行用 `landAt` 落地。相机高度指数平滑；楼栋或楼面变化时更新 `state.explore` 并 `app.refresh()`；移动超过 20m 更新阴影中心。
- [ ] 工具栏「漫游」按钮（`data-act="explore"`），`body.exploring` 时隐藏工具条、楼层栏、目录、图例、提示。
- [ ] 浏览器验证：从园区进入、走进一期主入口、上扶梯到 2F、走上天桥、坐落地塔扶梯下到地面、走进地铁出入口到站台；飞行与落地。Commit `feat(render): 第一人称漫游控制器（任务 F4）`

### 任务 F5：手机操作与 HUD

**文件：** 修改 `src/render/explore.js`、`src/shell.html`、`src/render/ui.js`

- [ ] HUD：位置条、「地点」「退出」、准星、名称卡（每 0.2s 从屏幕中心对当前楼栋各层与场地的拾取盒做 25m 射线）、互动面板（楼梯：相邻楼层；电梯：全部停靠层）、黑场过渡、电脑操作提示。
- [ ] 手机（触屏设备加 `body.touch`）：左下摇杆（半径 56px，推过 80% 为跑）；屏幕 40% 以右拖动转视角；右下按钮 ▲ / ▼（飞行时）/ 飞 / 互动；按 `pointerId` 区分多指；横屏、竖屏布局。
- [ ] 目录传送：漫游时点分期 → 主入口内侧，点楼层 → 该层出生点，点店铺 → 店门外 2m 面朝店；点完收起目录。
- [ ] 浏览器验证（电脑 + 手机模拟横竖屏）：摇杆走、拖动看、上下楼互动、传送、名称卡。Commit `feat(render): 漫游 HUD、手机摇杆与目录传送（任务 F5）`

### 任务 F6：收尾与发布

- [ ] `HANDOFF.md` 增加"漫游"一节（入口、操作、导航模型、测试、已知限制）。
- [ ] `npm test`、`npm run build`；性能（漫游时绘制调用、帧时间）与内存（导航模型大小）记录；截图。
- [ ] 发布到同一链接；Commit `chore: v4 漫游打包与发布`；按 finishing-a-development-branch 收尾。

---

## 规格覆盖自检

| 规格章节 | 任务 |
|---|---|
| 2.1 进入与退出 | F4 |
| 2.2 操作 | F4（电脑）、F5（手机） |
| 2.3 HUD | F5 |
| 3 导航模型 | F1、F3 |
| 4 控制器 | F4 |
| 5 显示规则 | F4 |
| 6 界面与代码改动 | F2、F4、F5 |
| 7 性能与内存 | F6 |
| 8 测试 | F1 |
| 9 不做 | — |
| 10 交付 | F6 |
