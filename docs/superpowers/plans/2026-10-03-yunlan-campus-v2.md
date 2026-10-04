# 云澜汇园区 v2 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 按规格 `docs/superpowers/specs/2026-10-03-yunlan-campus-v2-design.md`，把单栋方形商场改造成三期园区：Y 形一期、折线新月形二期、开放街区三期，路口环形天桥连通，分三步发布到同一个在线链接。

**架构：** 布局模型仍是纯数据（Node 可测）。新增"局部坐标系 frame"：每个翼楼、圆厅套件、街区楼栋都有自己的 frame，铺位 / 用房 / 车位在 frame 内是轴对齐矩形，v1 的大部分算法（隔墙去重、店面、陈设、卫生间、车位排布）在局部坐标里原样复用，最后整体旋转平移到世界坐标。测试用世界坐标多边形（SAT 判重叠、射线法判包含）。渲染层的 Batcher 增加"当前 frame 变换"，构建器在 frame 内照旧放盒子。

**技术栈：** Three.js 0.170（jsDelivr importmap）、原生 ES Modules、node:test、esbuild。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/layout/geom.js` | 修改 | 增加 frame（`frame/toW/toL/dirW/lrectPoly/lseg`）、多边形工具（`convexOverlap/clipConvex/circlePoly/polyCentroid/distToSeg/distToPolyEdge/polySamples/segProbes/polysConnect`） |
| `src/layout/constants.js` | 重写 | 业态表（新增 auto/edu/studio/rink）、通用尺寸（HW=23, SW=7, 端部区 6m, 核心筒 16m）、中庭套件常量（沿用 v1 数值，套件局部坐标） |
| `src/layout/hub.js` | 新建 | `hubOutline()` 圆厅 + 翼楼外轮廓；`ringPieces()` 圆厅走道切块；`Wing` 局部几何（u_a、u0、bandEnd、端部区） |
| `src/layout/mall.js` | 新建 | `buildMall(spec)`：按楼层配置生成铺位、核心筒、楼梯、卫生间、走道、洞口、楼板、扶梯、电梯、入口；`finalize()` 生成世界坐标 |
| `src/layout/parking.js` | 重写 | 在 frame 内按排生成车位（阻挡物为世界多边形），翼楼车库断面、圆厅环形车道 |
| `src/layout/brands.js` | 修改 | 保留 v1 品牌作为一期品牌池；新增 `BrandPicker`（按业态词库 + 组合生成，全园区去重） |
| `src/layout/campus.js` | 新建 | 道路、人行道、斑马线、地块、广场、`site.walk`、车道入口登记 |
| `src/layout/p1.js` | 新建 | 一期规格（圆厅、三翼、各层配置、扶梯、入口、坡道、天台要素） |
| `src/layout/p2.js` | 新建（B） | 二期规格 |
| `src/layout/p3.js` | 新建（C） | 三期街区 |
| `src/layout/bridges.js` | 新建（C） | 云环、连廊、落地塔及其上下连接 |
| `src/layout/walk.js` | 重写 | 多边形步行图：楼层 / 场地 / 桥面节点，入口、扶梯、电梯、楼梯、落地塔连接 |
| `src/layout/layout.js` | 重写 | `buildLayout()` 汇总园区 |
| `src/layout/retail.js` `vertical.js` `site.js` `roof.js` | 删除 | 被 mall.js / p1.js / campus.js 取代 |
| `tests/helpers.js` | 新建 | 共享判定函数 |
| `tests/rules.test.js` | 新建 | 通用规则（对所有已存在的期执行） |
| `tests/p1.test.js` `tests/campus.test.js` | 新建 | 一期专项、总图专项 |
| `tests/p2.test.js` `tests/p3.test.js` | 新建（B/C） | 二、三期专项 |
| `tests/geom.test.js` | 新建 | 几何工具单元测试 |
| `tests/layout.test.js` | 删除 | v1 单栋测试 |
| `src/render/batch.js` | 修改 | `BatchSet.setFrame(F)`、`SignBatch.place` 支持 frame 与任意朝向 |
| `src/render/app.js` | 重写 | 楼栋 → 楼层分组（base / shell / facade / labels / flows / people / picks），状态 `{building, focus, exploded, …}`，园区 / 楼栋 / 楼层可见性，楼栋视角，多边形拾取与高亮，阴影跟随 |
| `src/render/env.js` | 修改 | `setShadowFocus(center, radius)`；雾距放大 |
| `src/render/build/shell.js` | 重写 | 楼板拼块（放 shell 组）、沿外轮廓任意边生成外立面 / 窗台 / 挡土墙 / 女儿墙、圆厅玻璃穹顶、柱、洞口栏板、筒灯、楼名与 LED 屏 |
| `src/render/build/walls.js` `storefronts.js` `interiors.js` `rooms.js` | 修改 | 按 frame 分组，在局部坐标运行 v1 算法 |
| `src/render/build/elevators.js` `parking.js` `public.js` `roof.js` `labels.js` `flows.js` `people.js` `traffic.js` | 修改 / 重写 | 数据驱动，去掉 v1 硬编码坐标 |
| `src/render/paths.js` | 重写 | 从楼层几何生成人流、车流、货流路径 |
| `src/render/build/site.js` | 重写 | 园区地面、道路、人行道、斑马线、广场（挖去建筑与坡道）、树、路灯、入口雨棚、车库道闸、周边楼宇 |
| `src/render/build/bridges.js` `street.js` `park.js` | 新建（C） | 天桥、三期街区外观、公园与地铁站 |
| `src/render/ui.js` `src/shell.html` `src/render/tour.js` | 修改 / 重写 | 园区 / 一期 / 二期 / 三期切换、每期楼层栏、全园区目录；导览 |

## 数据契约 v2

```js
// Frame     { id, ox, oz, deg, a, c, s }  局部 (u,v) → 世界 (ox + u·c − v·s, oz + u·s + v·c)；渲染旋转 rotation.y = −a
// 局部写法沿用 v1：rect {x0,z0,x1,z1} 中 x≡u、z≡v；side 'N'=−v 'S'=+v 'W'=−u 'E'=+u
// Unit      { id, code, slot, level, building, wing, brand, style, frame, rects, fronts, polys, wfronts, terrace? }
//           polys: 世界凸多边形[]；wfronts: {x0,z0,x1,z1,nx,nz}[]（外法线朝走道）
// Room      { id, type:'core'|'wc'|'stair'|'equip'|'mech'|'kiosk', label, frame, rects, doors, polys, wdoors }
// Walk      { id, kind, poly, outdoor?, frame?, rect? }      Void { id, kind, poly, frame?, rect?, radius? }
// Level     { id:'P1-1F', building, short:'1F', name, kind:'parking'|'food'|'retail'|'roof'|'street', elev, height,
//             theme, ground?, outline, slab:{ pieces:[{outer, holes}] }, units, rooms, walk, voids, features,
//             parking?: { stalls:[{frame, lx, lz, w, d, face, x, z, poly, row, zone, type}], columns:[{frame,lx,lz}], aisles:[poly] } }
// Building  { id:'P1', name, short, en, kind:'mall'|'street', levels:[id], outline, center:[x,z], radius }
// Escalator { id, building, pair, from, to, dir, bottom{x,y,z}, top{x,y,z}, width, rise, run, slot, label }
// Elevator  { id, building, type:'passenger'|'glass', frame, lu, lv, w, d, door, x, z, nx, nz, reach, serves }
// Stair     { id, building, frame, rect, door, doorByLevel?, poly, wdoor, wdoorByLevel?, serves }
// Entrance  { id, building, name, level, seg, nx, nz, width, main, to:'site'|'bridge' }
// Ramp      { id, building, type:'street-in'|'street-out'|'down'|'up', name, width, frame, lane, poly, from, to }
// Layout    { buildings, levels, escalators, elevators, stairs, entrances, ramps, site, bridges, categories }
```

## 一期关键数值（局部坐标，单位米）

- C1 = (−106,−106)，R=34，u_a=√(34²−23²)=25.04，店铺带起点 u0=35，套件 frame 旋转 45°。
- 翼楼：SE 45° uEnd 84（核心筒 −v 带 u∈[51,67]）；W 165° uEnd 96（核心筒 +v 带 u∈[55,71]）；N 285° uEnd 88（核心筒 −v 带 u∈[35,51]）。端部区 u∈[uEnd−6,uEnd]，角部楼梯 |v|∈[17,23]。
- 核心筒（+v 带，起点 c；−v 带把 v 取反）：电梯井 u∈[c,c+5.6]×v∈[7,10]（两台 2.6×3 轿厢，门朝 −v）；电梯厅 u∈[c,c+8]×v∈[10,18] + 通道 u∈[c+5.6,c+8]×v∈[7,10]；楼梯 u∈[c,c+8]×v∈[18,23]（门在 v=18 朝 −v）；卫生间 u∈[c+8,c+16]×v∈[7,23]（门在 v=7 朝 −v，仅商业 / 餐饮层）。
- 圆厅口袋楼梯 u∈[29,35]×|v|∈[18,23]：SE 的 +v、SE 的 −v、N 的 −v 各一部。
- 车库断面（每翼）：车位 v∈[18,23] 朝 N、车道 [12,18]、车位 [7,12] 朝 S、步行脊 [−7,7]、车位 [−12,−7] 朝 N、车道 [−18,−12]、车位 [−23,−18] 朝 S；车道自 u=28 起（与圆厅环形车道重叠），横向车道 u∈[uEnd−12,uEnd−6]×v∈[−23,23]。
- 套件（局部坐标数值同 v1）：1F 洞口 (−5,−8,5,8) r0.6；2F/3F 洞口 (−17,−10,17,10) r4；观光梯 (±15.5,0)；扶梯 K1/K2 B1M→1F（z 轴，top ∓8，cross ∓2.55）、K3/K4 1F→2F（z 轴，top ∓10，cross ∓10.65）、K5/K6 2F→3F（x 轴，居中，cross ∓15.15，3F 开洞）。
- 翼楼扶梯：P0 B1→B1M 在 W 翼（u 48→54.76，B1M 开洞）；P7 3F→RF 在 W 翼（u 42→51.53，RF 开洞 + 玻璃亭）。
- B1↔B2 坡道：套件 frame 内 x∈[−12,12]，下行车道 z∈[−4.6,−0.1]（B1 端在 x=+12），上行车道 z∈[0.1,4.6]；B1 楼板开洞 (−12,−4.75,12,4.75)。
- 地面坡道：N 翼 frame，入口车道 v∈[−5.5,−0.5]、出口车道 v∈[0.5,5.5]，u 从 85（B1）到 141（地面），敞开段 u∈[100,141]，车道入口 u∈[139,162]。
- 入口：SE 端 u=84、v∈[−8,8] 主入口；W 端 u=96、v∈[−4,4]；圆厅弧面 99°–111°、219°–231°、339°–351°；2F SE 端 u=84、v∈[−5,5] 接天桥。

---

## A 阶段：引擎改造 + 一期重做 + 总图道路

### 任务 A1：几何工具（先写单元测试）

**文件：** 修改 `src/layout/geom.js`；创建 `tests/geom.test.js`

- [ ] **步骤 1：写失败的测试** `tests/geom.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { frame, toW, toL, lrectPoly, lseg, rect, convexOverlap, clipConvex, circlePoly, polyArea, polysConnect, polySamples, pointInPoly } from '../src/layout/geom.js';
import { hubOutline } from '../src/layout/hub.js';

test('frame：局部 ↔ 世界互逆，门面法线随 frame 旋转', () => {
  const F = frame(10, -5, 30);
  const [x, z] = toW(F, 3, 4);
  const [u, v] = toL(F, x, z);
  assert.ok(Math.abs(u - 3) < 1e-9 && Math.abs(v - 4) < 1e-9);
  const s = lseg(frame(0, 0, 90), { x0: 0, z0: 7, x1: 10, z1: 7, side: 'N' });
  assert.ok(Math.abs(s.nx - 1) < 1e-9 && Math.abs(s.nz) < 1e-9, '90° frame 的 N（−v）应指向 +x');
});

test('SAT：相接不算重叠，交叠算重叠，旋转矩形也成立', () => {
  const a = lrectPoly(frame(0, 0, 0), rect(0, 0, 10, 10));
  assert.equal(convexOverlap(a, lrectPoly(frame(0, 0, 0), rect(10, 0, 20, 10))), false);
  assert.equal(convexOverlap(a, lrectPoly(frame(0, 0, 0), rect(9, 0, 20, 10))), true);
  assert.equal(convexOverlap(a, lrectPoly(frame(15, 5, 45), rect(-3, -3, 3, 3))), true);
  assert.equal(convexOverlap(a, lrectPoly(frame(16, 5, 45), rect(-3, -3, 3, 3))), false);
});

test('clipConvex：圆盘与半平面相交面积正确', () => {
  const disk = circlePoly(0, 0, 10, 240);
  const half = clipConvex(disk, [[-20, 0], [20, 0], [20, 20], [-20, 20]]);
  assert.ok(Math.abs(Math.abs(polyArea(half)) - Math.PI * 50) < 1.5);
});

test('polysConnect：共边 ≥1m 相连，只碰一个角不相连', () => {
  const r = (x0, z0, x1, z1) => lrectPoly(frame(0, 0, 0), rect(x0, z0, x1, z1));
  assert.equal(polysConnect(r(0, 0, 5, 5), r(5, 0, 9, 5)), true);
  assert.equal(polysConnect(r(0, 0, 5, 5), r(5, 5, 9, 9)), false);
  assert.equal(polysConnect(r(0, 0, 5, 5), r(2, 2, 3, 3)), true);
});

test('hubOutline：Y 形三翼轮廓包含圆心与各翼末端，翼楼之间露出圆弧', () => {
  const rots = [{ id: 'C', x: 0, z: 0, R: 34 }];
  const arms = [{ id: 'a', rot: 'C', deg: 45, uEnd: 84 }, { id: 'b', rot: 'C', deg: 165, uEnd: 96 }, { id: 'c', rot: 'C', deg: 285, uEnd: 88 }];
  const out = hubOutline(rots, arms, 23);
  assert.ok(pointInPoly([0, 0], out));
  for (const a of arms) assert.ok(pointInPoly(toW(frame(0, 0, a.deg), a.uEnd - 1, 0), out), `${a.id} 末端`);
  assert.ok(pointInPoly(toW(frame(0, 0, 105), 33.5, 0), out), '105° 处圆弧内侧');
  assert.ok(!pointInPoly(toW(frame(0, 0, 105), 34.5, 0), out), '105° 处圆弧外侧');
  for (const p of polySamples(lrectPoly(frame(0, 0, 45), rect(26, -22.9, 83.9, 22.9)), 3)) assert.ok(pointInPoly(p, out));
});
```

- [ ] **步骤 2：运行** `node --test tests/geom.test.js`，预期 FAIL（`frame` 未导出、`hub.js` 不存在）。
- [ ] **步骤 3：实现** geom.js 新函数（frame 变换；SAT 投影判离；Sutherland–Hodgman 裁剪，自动判断裁剪多边形方向；`polysConnect` 先做包围盒剔除，再沿两边界每 0.5m 取样，落在对方内部或 0.05m 以内的累计长度 ≥ minLen 即相连）与 `src/layout/hub.js` 的 `hubOutline(rots, arms, HW, step=3)`：从第一个翼楼的 +β 角点出发，按角度递增找下一个翼楼起点 θ−β，补 3° 整数倍的弧点；端翼依次加 (u_a,−HW)(uEnd,−HW)(uEnd,HW)(u_a,HW)；连接翼沿 v=−HW 走到另一圆厅，在对方 (θ+180°)+β 处继续，回到起点结束。
- [ ] **步骤 4：运行** `node --test tests/geom.test.js`，预期 PASS。
- [ ] **步骤 5：Commit** `feat(layout): v2 几何工具（frame、多边形、圆厅外轮廓）`

### 任务 A2：一期与总图规则测试（先写，必须失败）

**文件：** 创建 `tests/helpers.js`、`tests/rules.test.js`、`tests/p1.test.js`、`tests/campus.test.js`；删除 `tests/layout.test.js`；`package.json` 的 test 脚本改为 `node --test tests/*.test.js`（不变）

- [ ] **步骤 1：helpers.js**

```js
import { buildLayout } from '../src/layout/layout.js';
import { pointInPoly, segProbes, dist, polyCentroid } from '../src/layout/geom.js';
export const L = buildLayout();
export const lvl = (id) => L.levels.find((l) => l.id === id);
export const levelsOf = (b) => L.levels.filter((l) => l.building === b);
export const inWalk = (lv, p) => lv.walk.some((w) => pointInPoly(p, w.poly));
export const inVoid = (lv, p) => lv.voids.some((v) => pointInPoly(p, v.poly));
export const onSlab = (lv, p) => lv.slab.pieces.some((s) => pointInPoly(p, s.outer) && !s.holes.some((h) => pointInPoly(p, h))) && !inVoid(lv, p);
export const inSite = (p) => L.site.walk.some((w) => pointInPoly(p, w.poly));
export const inBridge = (p) => (L.bridges ? L.bridges.walk.some((w) => pointInPoly(p, w.poly)) : false);
export const stairDoor = (s, id) => (s.wdoorByLevel && s.wdoorByLevel[id]) || s.wdoor;
export const midOf = (s) => [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];
export const liftProbe = (e) => [e.x + e.nx * (e.reach + 0.6), e.z + e.nz * (e.reach + 0.6)];
export function insetPts(poly, d = 1) {
  const c = polyCentroid(poly);
  return poly.map((p) => { const k = Math.min(d, dist(p, c) / 2) / (dist(p, c) || 1); return [p[0] + (c[0] - p[0]) * k, p[1] + (c[1] - p[1]) * k]; });
}
export { segProbes };
```

- [ ] **步骤 2：rules.test.js**（对 `L.buildings` 中所有期执行，规格第 10 节 3、4、6、7、11、12（通用部分）、14、16 条）
  - 同层任意两个不同归属的多边形（铺位 polys、用房 polys）`convexOverlap(...,0.02)` 为 false；每个多边形 `polySamples(poly,1.5,0.05)` 都 `onSlab`。
  - 每个铺位 `wfronts.some(f => segProbes(f,0.5).some(p => inWalk(lv,p)))`。
  - 每层（含停车、天台）客梯 ≥2 部；每部电梯每个停靠层 `inWalk(lv, liftProbe(e))`。
  - 扶梯：30°±0.3；两端外延 1.2m 的落点 `onSlab && inWalk`；斜段 t=0.15…0.95、横向三点都在上层洞口内；同一 `from` 层的扶梯占地（底端前 2.4m 到顶端后 2.4m、宽 width）两两 SAT 不重叠。
  - 每层 ≥2 部楼梯；`kind` 为 retail/food/parking 的层，非 outdoor 走道多边形 `insetPts(poly,1)` 到本层楼梯门中点或本层入口中点的最小距离 ≤45（停车 ≤60）。
  - 停车层车位 `poly` 与本层 `kind==='aisle'` 走道、用房 SAT 不重叠，且 `onSlab`。
  - 全园区 `brand.name`、`brand.en`、`code` 各自唯一。
  - 连通：`components(buildWalkGraph(L))` 中，所有入口、所有铺位、所有楼层走道、`site.walk`、桥面走道在同一分量。
- [ ] **步骤 3：p1.test.js**（一期专项，规格第 10 节 1、2、5、6、8、9、10、12、13 条）
  - 楼层顺序与标高 `{B2:-12,B1:-8.4,B1M:-4.5,'1F':0,'2F':6.5,'3F':12,RF:17.5}`，7 个 `theme.key` 互不相同。
  - 铺位：1F/2F ≥25，3F/B1M ≥20；卫生间：B1M/1F/2F/3F ≥2，B1/B2/RF ≥1，门口探测点在走道内。
  - 观光梯恰 2 部；扶梯 8 对 16 部，B1→B1M、B1M→1F、1F→2F、2F→3F、3F→RF 各有上下行。
  - 入口（level 为 P1-1F）≥4、恰 1 个 main；法线方向按 30° 聚类 ≥3 类；内侧 1m `inWalk`，外侧 1m 不在任何 P1-1F 楼板拼块内且 `inSite`；`to:'bridge'` 的入口外侧 `inBridge`（C 阶段生效，A 阶段桥面不存在时跳过）。
  - 坡道：street-in / street-out 各 1、车道多边形 SAT 不重叠、坡度 ≤0.15；地面端在 `L.site.driveways` 内，地下端 `inWalk`；B1↔B2 有 down 与 up。
  - 车位：B1、B2 各 ≥150，B1 含 `ev` 与 `accessible`。
  - 天台：餐吧（bar/restaurant）≥3，features 含 ferris×1、ip、mirror、skywalk、letters。
- [ ] **步骤 4：campus.test.js**：道路含云澜大道、星湾路、四条外环、星湾北街；每期 1F 楼板拼块的 `polySamples` 点不落在任何道路或人行道多边形内；各期外轮廓两两不相交（采样点互不包含）。
- [ ] **步骤 5：运行** `npm test`，预期 FAIL（`buildLayout` 仍是 v1 结构）。
- [ ] **步骤 6：Commit** `test(layout): v2 一期与总图规则测试`

### 任务 A3：业态、品牌、总图

**文件：** 重写 `src/layout/constants.js`；修改 `src/layout/brands.js`；创建 `src/layout/campus.js`

- [ ] **步骤 1：constants.js** — `CATEGORIES`（v1 全部 + auto 新能源汽车 #2d6a8f、edu 教育培训 #3f8f6d、studio 设计工作室 #8a6f5a、rink 冰场 #4aa3df）；`HW=23, SW=7, END=6, CORE=16`；套件 `KIT = { void1F:{rect,r}, voidUp:{rect,r}, glass:[{id,x,z,door}], lane:1.85, width:1.8 }`。
- [ ] **步骤 2：brands.js** — `BRANDS`（v1 原表）改名为一期品牌池；新增 `class BrandPicker { constructor(seed); take(cat); fromPool(level, slot) }`：先按业态从 `POOLS[cat]`（每类 10–20 个原创中英文名 + 配色 + 字标）取未用条目，取完则用 `CN_HEAD×CN_TAIL`、`EN_HEAD×EN_TAIL` 组合生成；`used` 集合跨期共享，保证唯一。
- [ ] **步骤 3：campus.js** — `buildSite()` 返回 `{ roads, sidewalks, crossings, plots, walk, driveways:[], trenches:[], plazas }`，数值取规格第 2 节；`site.walk` 先含 8 段人行道、4 条斑马线、一期广场 `(-270,-250)–(-16,-20)`；导出 `addDriveway(site, poly)`、`addTrench(site, poly)` 供各期登记。
- [ ] **步骤 4：Commit** `feat(layout): 业态、品牌词库与园区总图`

### 任务 A4：圆厅 + 翼楼通用构建器

**文件：** 修改 `src/layout/hub.js`；创建 `src/layout/mall.js`；重写 `src/layout/parking.js`

- [ ] **步骤 1：hub.js** — `ringPieces(rot, kitF, rect|null, kind, R)`：`circlePoly(cx,cz,R,120)` 分别与套件 frame 下洞口外接矩形的北、南、西、东四块裁剪（无洞口时整个圆盘一块）；`makeWing(spec, rot)` 返回 `{ id, F, R, ua, u0:R+1, uEnd, bandEnd:uEnd-6 (连接翼为 L-(R+1)), core, link }`。
- [ ] **步骤 2：mall.js 商业 / 餐饮层** — `retailLevel(ctx, lv, cfg)`：
  - 每翼：端部区与角部楼梯；核心筒用房 + 电梯厅走道；口袋走道 `u∈[u_a,u0]×v∈[7,23]`（扣除口袋楼梯）；商业街走道（有通高缝时拆成两侧条带 + 段间连桥）；店铺带按 `cfg.anchors` 预留后，用 `split(a,b,pattern,6)` 按宽度序列切分，余量 <6m 并入最后一间；靠圆厅首铺另加朝 −u 的门面。
  - 圆厅：`ringPieces` 按配置挖套件洞口；套件洞口、观光梯井、扶梯洞口加入 `voids`。
  - 品牌：锚点铺位按 `slot` 指定，其余按楼层品牌池顺序或 `BrandPicker.take(cat)`。
- [ ] **步骤 3：parking.js** — `fillRows(F, rows, blocks)`：沿 u 每 3 车一跨（跨间 0.5m 柱位），车位世界多边形与 `blocks`（走道、用房、洞口的世界多边形）SAT 重叠即跳过；`wingParking(wing, opts)` 生成断面车道、横向车道、步行脊（停车层卫生间所在翼扣出卫生间）、车位排；圆厅环形车道 = `ringPieces` 绕开中央坡道块。
- [ ] **步骤 4：mall.js 其余** — `parkingLevel`、`roofLevel`（翼楼屋面整块走道 + 圆厅环形走道 + 天窗洞口）、`kitEscalators` / `wingEscalators`（v1 成对算法在 frame 内计算后变换到世界坐标，洞口为局部矩形变换后的多边形）、电梯（核心筒 2 部 + 套件观光梯 2 部）、楼梯（核心、端部、口袋，停车层换门）、`finalize(level)`（`polys`、`wfronts`、`wdoors`、stalls 的世界坐标）、楼板 `{ pieces:[{ outer: hubOutline, holes: voids 中非走道部分 }] }`。
- [ ] **步骤 5：Commit** `feat(layout): 圆厅翼楼通用构建器与车库排布`

### 任务 A5：一期规格、步行图、汇总（让测试通过）

**文件：** 创建 `src/layout/p1.js`；重写 `src/layout/walk.js`、`src/layout/layout.js`；删除 `retail.js`、`vertical.js`、`site.js`、`roof.js`

- [ ] **步骤 1：p1.js** — 按"一期关键数值"写 spec；各层配置：
  - B1M：圆厅 foodcourt；SE 档口 / 餐厅（宽度序列 7,6,8,7,9）；W 老街（6,7,6,8，`style:'oldstreet'`，P0 洞口）；N 超市锚点 u∈[51,82] 全宽。
  - 1F：宽度 8,7,9,8,10,7；SE 端主入口大堂、W 端西门大堂、N 端后勤卸货。
  - 2F：宽度 9,8,10,7,11,8；SE 端天桥入口；通高缝 SE [40,52][58,72]、W [40,52][58,70][76,86]、N [40,52][58,72]。
  - 3F：锚点 影城 W u∈[71,90] 全宽、儿童乐园 N +v [60,82]、书店 SE −v [35,51]、电玩城 SE +v [60,78]；通高缝 SE [40,52][58,72]、W [58,70]、N [40,52][58,72]。
  - RF：天台要素（餐吧 4 家：SE +v [36,48][52,64]、−v [36,48][52,64]，v∈±[13,21]，外摆朝街；卫生间亭；观景台 u∈[84,90]；立体字；西翼花园、扶梯亭；北翼摩天轮 u=64、IP、设备区）、3F 通高缝上方天窗。
  - B1/B2：车库；B1 W 翼步行脊扶梯厅；SE 翼步行脊卫生间；圆厅中央坡道；B1 N 翼端部区为坡道口车道。
- [ ] **步骤 2：walk.js** — 节点 `walk:{level}:{id}`、`unit:{id}`、`ent:{id}`、`site:{id}`、`bridge:{id}`；同层 `polysConnect`；门面探测点；扶梯落点；电梯门口；楼梯门；入口内外侧；`ground` 层与 `site.walk` 相接；桥面与落地塔（C 阶段）。
- [ ] **步骤 3：layout.js** — `buildLayout()`：`site = buildSite()`；`P1 = buildMall(P1_SPEC, site, picker)`；汇总数组，`buildings` 带 `outline/center/radius`。
- [ ] **步骤 4：运行** `npm test`，预期 PASS；失败按断言修正坐标，禁止放宽阈值。
- [ ] **步骤 5：Commit** `feat(layout): 一期 Y 形布局通过 v2 规则测试`

### 任务 A6：渲染基础改造（frame 批处理、楼栋分组、可见性、阴影跟随）

**文件：** 修改 `src/render/batch.js`、`src/render/env.js`；重写 `src/render/app.js` 的分组与状态部分

- [ ] **步骤 1：batch.js** — `BatchSet.setFrame(F|null)`：所有子 `Batcher.push` 先左乘 frame 矩阵（平移 (ox,0,oz) + 绕 Y 旋转 −a）；`SignBatch.setFrame(F)` 同理，`place(x,y,z,w,h,side,uv)` 的 side 在局部坐标解释；新增 `placeN(x,y,z,w,h,nx,nz,uv)` 按世界法线放置。
- [ ] **步骤 2：app.js 分组** — `ctx.buildings[id] = { group, levels:[...] }`；每层 `{ group, base, shell, facade, labels, flows, people, picks, batch, shellBatch, facadeBatch, signs, facadeSigns }`；楼板放 `shell`。
- [ ] **步骤 3：可见性规则**（`applyVisibility`）：
  - 园区（`state.building=null`）：每层显示 `shell + facade`，`base` 只在屋面层、三期显示；场地与天桥显示。
  - 选中某期：该期全部 `base` 显示；其他期按园区规则。
  - 选中楼层：该期高于焦点层的隐藏、焦点层立面隐藏（剖切）；其他期按园区规则。
  - 爆炸：只作用于选中期，其他期与天桥隐藏。
- [ ] **步骤 4：视角** — `buildingView(b)` 由 `center/radius` 计算；`levelView(b, lv)`；园区总览 `OVERVIEW`。`env.setShadowFocus(center, radius)` 在飞行结束时调用：园区 radius≈330、单期 ≈150、单层 ≈110，并置 `shadowMap.needsUpdate`。
- [ ] **步骤 5：拾取与高亮** — 拾取盒按 frame 放置（铺位每个 rect 一个盒，加 `rotation.y=−a`）；高亮框同理。
- [ ] **步骤 6：Commit** `feat(render): frame 批处理与楼栋分组`

### 任务 A7：建筑主体（楼板、外立面、屋面）

**文件：** 重写 `src/render/build/shell.js`；修改 `walls.js`

- [ ] **步骤 1：楼板** — 每层每个 `slab.pieces` 一块 Shape（含洞口），顶面用楼层地面材质，挤出楼板体，放 `shell`。
- [ ] **步骤 2：外立面** — 沿 `level.outline` 每条边生成：长边按 4m 分隔（不足 4m 的弧边整段一个隔间）；隔间类型由内侧 1.5m 处判定：入口（与入口线段重合）→ 入口幕墙；圆厅弧面 → 通高玻璃幕墙 + 竖向铝肋；1F 铺位 → 橱窗；其他层 → 石材 / 窄窗交替；楼层分隔带 + 夜间灯带；地下层为挡土墙。
- [ ] **步骤 3：屋面** — 女儿墙沿外轮廓；圆厅玻璃穹顶（经纬肋 + 玻璃面，覆盖 skylight 洞口）；商业街天窗（玻璃双坡）；楼名字牌立在 SE 端屋顶（朝路口）；LED 屏挂在 SE 端 2F–3F 立面（入口上方、天桥之上）。
- [ ] **步骤 4：柱、洞口栏板、筒灯** — 柱在门面端点（不在外轮廓上）；栏板沿所有 atrium / street / escalator 洞口；筒灯在走道多边形内按 4m 网格（跳过洞口）。
- [ ] **步骤 5：walls.js** — 按 `frame.id` 分组，在局部坐标做 `unionOutline → mergeSegments → subtractOpenings`，在 `setFrame(F)` 下生成墙体；外轮廓上的墙段（局部 |v|=23 或 u=uEnd）跳过。
- [ ] **步骤 6：浏览器验证** — `preview_start mall-dev`，`debugShot` 截园区总览、一期外观、一期 2F 剖切，Read 截图确认 Y 形、弧形幕墙、洞口栏板。
- [ ] **步骤 7：Commit** `feat(render): 任意外轮廓的楼板与外立面`

### 任务 A8：店面、陈设、用房、垂直交通

**文件：** 修改 `storefronts.js`、`interiors.js`、`rooms.js`、`elevators.js`、`escalators.js`

- [ ] **步骤 1：storefronts / interiors** — 每个铺位在 `setFrame(u.frame)` 下运行 v1 代码；`storeStyle` 改读 `u.style`；侧挑招牌两面用局部 side。
- [ ] **步骤 2：rooms.js** — 核心筒电梯门位置取自 `layout.elevators`（同 frame 局部坐标）；卫生间、楼梯在 frame 下复用；停车层电梯厅玻璃门斗沿电梯井朝步行脊一侧生成。
- [ ] **步骤 3：elevators.js** — 观光梯停靠序列按所属期楼层栈计算；`levelOffsetAt(ctx, building, y)`。
- [ ] **步骤 4：浏览器验证** — 截一期 1F、2F 俯视与一个铺位近景。
- [ ] **步骤 5：Commit** `feat(render): 店面陈设与核心筒适配局部坐标`

### 任务 A9：公共区、车库、天台

**文件：** 重写 `public.js`；修改 `parking.js`、`roof.js`

- [ ] **步骤 1：public.js** — 美食广场（P1 B1M 圆厅环形布桌，避开扶梯与观光梯）；老街牌坊（W 翼 B1M 街口）与灯笼串（沿 W 翼商业街）；服务台（每个主入口大堂）；口袋休息区沙发绿植；端部休息区；每个套件圆厅的"云朵"悬挂装置。
- [ ] **步骤 2：parking.js** — 车位线、特殊车位、挡车器、停放车辆在 `setFrame(stall.frame)` 下生成；车道漆面与虚线、箭头沿车道多边形主轴；吊牌数据驱动（各翼分区、电梯厅、出口）；地面坡道与 B1↔B2 坡道按 `ramp.frame` 局部坐标生成斜板与挡墙。
- [ ] **步骤 3：roof.js** — 一期天台要素按 feature 的 frame 放置；摩天轮轮面沿北翼轴线。
- [ ] **步骤 4：浏览器验证** — 截 B1M、B1、RF。
- [ ] **步骤 5：Commit** `feat(render): 美食广场、车库、天台适配`

### 任务 A10：场地、动线、标注、行人车流

**文件：** 重写 `site.js`、`paths.js`、`labels.js`、`traffic.js`；修改 `flows.js`、`people.js`

- [ ] **步骤 1：site.js** — 草地（挖去各期 1F 外轮廓与坡道敞开段）、道路沥青与标线、隔离带绿化、人行道、斑马线、广场铺装、行道树、路灯、入口雨棚（按入口法线）、车库道闸与灯箱（按坡道 frame）、卸货区、园区外周边楼宇、二三期地块"规划中"围挡（B/C 阶段替换）。
- [ ] **步骤 2：paths.js** — 每翼商业街中线往返线、圆厅回游环、端部大堂进出线、扶梯上下行线；停车层车行环线（坡道口 → 横向车道 → 外侧车道 → 圆厅环道 → 其他翼 → 出口）；场地：人行道、入口、车库进出。
- [ ] **步骤 3：labels / traffic / people** — 标注由 layout 数据生成（入口、扶梯、观光梯、客梯、卫生间、端部楼梯、天台打卡点、车库）；园区视角显示各期名称大牌；道路车辆按新道路车道行驶；车库车辆沿车行环线。
- [ ] **步骤 4：浏览器验证** — 截园区总览（含动线）、一期 B1 车流。
- [ ] **步骤 5：Commit** `feat(render): 园区场地、动线与标注`

### 任务 A11：界面与导览（一期版）

**文件：** 修改 `src/render/ui.js`、`src/shell.html`、`src/render/tour.js`

- [ ] **步骤 1：shell.html** — 左侧面板上方加 "园区 / 一期 / 二期 / 三期" 分段按钮（未建成的期显示"规划中"并禁用），下方为所选期的楼层栏；标题区显示所选期名称。
- [ ] **步骤 2：ui.js** — 分段按钮调用 `app.setBuilding(id)`；楼层栏随所选期重建；目录：园区视角列出各期，选期后列楼层，选层后列店铺；搜索覆盖全园区；事实标签按所选范围统计。
- [ ] **步骤 3：tour.js** — 一期版导览：园区 → SE 主入口 → 圆厅中庭 → K4 扶梯上 2F → 2F 商业街 → K6 上 3F → W 翼 P7 上天台 → 摩天轮 → 一期全景。
- [ ] **步骤 4：浏览器验证** — 依次点击分段按钮、楼层、目录、搜索；窄屏（375×812）截图。
- [ ] **步骤 5：Commit** `feat(ui): 园区与分期切换`

### 任务 A12：A 阶段验证与发布

- [ ] `npm test` 全部通过；`npm run build`；截园区、一期全楼、7 个楼层、爆炸、夜景、导览中段、手机竖屏；`renderer.info` 记录园区与一期视角的 draw calls / 三角形数。
- [ ] Commit `chore: A 阶段打包`；用 Artifact 以同一链接 `https://claude.ai/artifact/VAMbvbuX4yirRLGBpbYMuK` 发布 `dist/artifact.html`。

---

## B 阶段：二期 星湾

### 任务 B1：二期测试（先写，必须失败）

**文件：** 创建 `tests/p2.test.js`

- [ ] 楼层与标高 `{B1:-4.2,'1F':0,'2F':6.5,'3F':12,'4F':17.5,RF:23}`，6 个主题不同；1F–4F 铺位各 ≥20；卫生间 1F–4F ≥2、B1/RF ≥1；观光梯恰 2 部；1F↔2F、2F↔3F、3F↔4F 各 ≥2 对且有上下行；入口 ≥4、3 个方向以上、1 个主入口、内外侧判定同一期；坡道入出各 1、坡度 ≤0.15、地面端在车道入口内；B1 车位 ≥150；RF features 含 `track` 与 `court`；1F 有 `cat==='auto'` 的铺位，4F 有影城，1F 有冰场（`cat==='rink'`）。
- [ ] 运行 `npm test`，预期 p2 FAIL、其余 PASS。Commit `test(layout): 二期规则测试`

### 任务 B2：二期布局

**文件：** 创建 `src/layout/p2.js`；修改 `layout.js`、`campus.js`（二期广场、星湾北街车道入口）、`brands.js`（二期词库）

- [ ] 圆厅 A (106.07,−106.07)、B (210.07,−106.07)，R=30，u_a=19.26，u0=31；西翼 135° uEnd 86（核心筒 +v u∈[40,56]）、中翼 A→B 0°（核心筒 −v u∈[31,47]）、东翼 45° uEnd 72（核心筒 −v u∈[31,47]）。
- [ ] 套件：A 标准（1F 无洞口；K3/K4 1F→2F，K5/K6 2F→3F）；B 冰场：1F 冰场铺位 = 套件 rect(−15,−9,15,9)（四面门面），2F–4F 洞口 rect(−17,−11,17,11) r4，1F→2F 两对在 2F 开洞 z=±15.15、居中 x 轴。
- [ ] 3F→4F 两对：中翼 u 50→59.53（4F 开洞）；东翼 u 45.53→36（4F 开洞）。
- [ ] 1F：中翼 +v 带整段汽车展厅（auto）；4F：IMAX 锚点 东翼 u∈[47,66] 全宽，端部区为影城后勤。
- [ ] 入口：W 端 u=86 v∈[−8,8]（主）、E 端 u=72 v∈[−4,4]、A 弧面 61.5°–73.5°、B 弧面 106.5°–118.5°、A 弧面 264°–276°；2F W 端接天桥。
- [ ] 坡道：中翼 frame，入口车道 u∈[48.5,53.5]、出口车道 u∈[54.5,59.5]，v 从 −22（B1）到 −50（地面）；B1 中翼 −v 带 u∈[48,60] 为坡道喉部车道。
- [ ] RF：`track` = `hubOutline` 以 R−5、HW=17、uEnd−5 生成的闭合环线；`court` 在中翼 u∈[38,66]×v∈[−7.5,7.5]；西翼屋顶花园。
- [ ] 运行 `npm test` 全部 PASS。Commit `feat(layout): 二期 星湾布局`

### 任务 B3：二期渲染

**文件：** 修改 `public.js`（冰场：冰面、挡板、看台、滑冰人群）、`interiors.js`（auto 展车、edu 课桌、studio 工作台）、`roof.js`（跑道红色塑胶带 + 白色分道线、篮球场 + 围网 + 篮架、屋顶花园）、`shell.js`（二期立面配色：深灰金属 + 竖向金色百叶，圆厅暖白）、`ui.js`（启用二期）

- [ ] 浏览器验证：二期外观、1F 冰场与展厅、4F IMAX、RF 跑道球场、B1 坡道。Commit `feat(render): 二期 星湾`

### 任务 B4：B 阶段验证与发布

- [ ] 测试、打包、截图（园区、二期全楼、各层），同一链接发布。Commit `chore: B 阶段打包`

---

## C 阶段：三期 云澜里 + 云环天桥 + 中央公园

### 任务 C1：三期、天桥、公园测试（先写，必须失败）

**文件：** 创建 `tests/p3.test.js`；扩展 `tests/campus.test.js`

- [ ] 三期楼层 `{B1:-4.5,'1F':0,'2F':5,'3F':9.5}`；铺位合计 ≥40；卫生间 ≥2；每层客梯 ≥2；B1 车位 ≥200；坡道入出各 1；11 栋楼栋多边形互不重叠且不压道路。
- [ ] 天桥：`bridges.y===6.5`，`y−thick ≥ 5.0`；四条连廊：P1、P2 两条的建筑端点在对应 2F 走道内，P3、公园两条的端点在落地塔桥面内；支柱点不落在车行道多边形内（隔离带除外）；落地塔的楼梯 / 扶梯 / 电梯把桥面与 `site.walk` 连起来。
- [ ] 一、二期 `to:'bridge'` 入口外侧 `inBridge`。
- [ ] 运行，预期新增测试 FAIL。Commit `test(layout): 三期、天桥、公园规则测试`

### 任务 C2：三期与天桥布局

**文件：** 创建 `src/layout/p3.js`、`src/layout/bridges.js`；修改 `campus.js`（公园、地铁口、三期地面）、`walk.js`、`layout.js`

- [ ] p3.js：每栋一个 frame（规格第 6 节表）；1F 按 9–12m 切成横贯铺位，两侧长边门面；2F/3F 每栋两间（餐厅、酒吧、工作室），门面朝 +v 外挑连廊（v∈[W/2,W/2+2.5]）；端部外挂楼梯（u∈[L/2,L/2+3.5]×v∈[W/2−5,W/2+2.5]，1F 门朝 +v，楼上门朝 −u）；#3、#6、#10 客梯在 −u 端 v∈[W/2−3,W/2]，门朝 +v；楼上楼板拼块 = 楼栋 ∪ 连廊 ∪ 楼梯平台（L 形多边形）；1F 为 `ground` 层，楼板 = 地块铺装；B1 车库轴对齐 frame，楼梯口 3 个，西侧坡道。
- [ ] bridges.js：云环走道 = 圆环切成 24 段四边形；连廊 4 条（沿对角线 frame，u 从 36 到建筑端或落地塔）；落地塔 10×10m，含楼梯、扶梯（6.5m 升高）、电梯，作为 `bridges.verticals` 连接塔顶走道与地面 `site.walk`；支柱 6 处。
- [ ] 运行 `npm test` 全部 PASS。Commit `feat(layout): 三期街区与云环天桥`

### 任务 C3：三期、天桥、公园渲染

**文件：** 创建 `src/render/build/street.js`、`bridges.js`、`park.js`；修改 `app.js`（天桥组）、`site.js`、`ui.js`（启用三期）

- [ ] street.js：红砖 / 木格栅 / 玻璃立面、外挑连廊与钢栏杆、外挂钢楼梯、屋顶露台（遮阳伞、串灯、花箱）、中心广场舞台与水景。
- [ ] bridges.js：环形箱梁（分段弧形）、玻璃顶棚与钢拱、栏杆、夜间灯带、支柱、连廊、落地塔（玻璃盒 + 扶梯 + 楼梯 + 电梯）。
- [ ] park.js：不规则湖面（水面材质）、环湖步道、草坡、树林、地铁出入口玻璃雨棚。
- [ ] 浏览器验证：园区俯瞰、天桥近景、三期街巷人视角、公园。Commit `feat(render): 三期街区、云环天桥与中央公园`

### 任务 C4：园区导览与最终验证

**文件：** 重写 `src/render/tour.js`

- [ ] 导览：一期主入口 → 圆厅中庭 → 扶梯上 2F → 经云环天桥 → 二期冰场圆厅 → 天空跑道 → 俯瞰三期街区 → 一期天台摩天轮 → 园区全景。
- [ ] `npm test`、`npm run build`；截园区（昼 / 夜）、每期全楼与各层、导览、手机竖屏；记录性能；同一链接发布。
- [ ] 使用 finishing-a-development-branch 收尾。Commit `chore: C 阶段打包与发布`

---

## 规格覆盖自检

| 规格章节 | 任务 |
|---|---|
| 1 成功标准 | A5/B2/C2（布局）+ A12/B4/C4（截图与发布） |
| 2 坐标与总图 | A3、C2 |
| 3 翼楼 + 圆厅体系 | A1、A4 |
| 4 一期 | A5、A7–A11 |
| 5 二期 | B1–B3 |
| 6 三期 | C1–C3 |
| 7 公园与地铁 | C2、C3 |
| 8 天桥 | C1–C3 |
| 9 交互与性能 | A6、A11、C4 |
| 10 测试 1–16 | A2（1–14、16 中一期部分）、B1、C1（15 与全园区 16） |
| 11 交付分步 | A12、B4、C4 |

## 执行方式

内联执行（与 v1 相同，使用 superpowers:executing-plans），每个阶段结束发布一次。
