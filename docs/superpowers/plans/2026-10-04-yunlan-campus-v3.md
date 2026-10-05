# 云澜汇园区 v3 实现计划（一期第四翼 + 方庭 + 地铁云澜汇站）

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在一期西北空地放回原四方格商场（方庭），用全宽第四翼与一期圆厅连成一体；扩建地铁站为站厅 + 站台 + 四条对角线通道，直通一、二、三期地下层并在四个街区设地面出入口。

**架构：** 方庭与西北翼直接并入一期的楼层（同一套 level 对象），由 `square.js` 按 v1 槽位表在方庭局部 frame 内生成；一期外轮廓改由广义 `hubOutline`（相邻翼内侧边在圆外相交时直接相接）+ 方庭拼接生成。地铁是新楼栋 `M`（kind `metro`），两层；跨楼连通用 `entrance.to = 楼层 id` 表示。渲染沿用现有通用模块，新增方庭天台 / 中庭小品与 `metro.js`。

**技术栈：** 纯 JS（ESM）、node:test、three.js r170、esbuild。

规格：`docs/superpowers/specs/2026-10-04-yunlan-campus-v3-design.md`

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/layout/hub.js` | 外轮廓：单圆厅时按角度排序各翼，相邻翼内侧边在圆外相交则取交点；翼的 `annex` 折线替换末端边 | 修改 |
| `src/layout/mall.js` | 翼楼支持 `start`（铺位带起点）、`neck`（喇叭口口袋多边形）、`annex`（末端接方庭：无端部区 / 端楼梯 / 端入口）；`spec.annex(ctx)` 钩子 | 修改 |
| `src/layout/square.js` | 方庭：v1 槽位、走廊、核心筒、观光梯、扶梯、楼梯、入口、车位、天台，全部写入一期楼层 | 新建 |
| `src/layout/p1.js` | 西北翼、各层西北翼配置、方庭钩子、一期广场扩到整块地 | 修改 |
| `src/layout/metro.js` | 地铁楼栋 M：站厅、站台、通道、出入口、跨楼连接口、列车数据 | 新建 |
| `src/layout/layout.js` | 汇总加入 M；各期地下连接口登记 | 修改 |
| `src/layout/walk.js` | `entrance.to` 为楼层 id 时连到该层走道 | 修改 |
| `src/layout/campus.js` | 公园 B 口移到 (53,53) | 修改 |
| `tests/p1x.test.js`、`tests/metro.test.js` | 新规则 | 新建 |
| `tests/campus.test.js`、`tests/p1.test.js`、`tests/p2.test.js` | 楼板 / 轮廓规则只针对地上；入口外侧可为另一栋楼层 | 修改 |
| `src/render/build/square.js` | 方庭中庭服务台与悬挂装置、天台露天影院 / 农场 / 观景台 | 新建 |
| `src/render/build/metro.js` | 站厅、通道、站台、列车动画、地面出入口、地下连通口标识 | 新建 |
| `src/render/{app,ui,paths,tour}.js`、`build/{labels,site,shell}.js` | 地铁分期、方庭动线与标注、景观避让、导览 | 修改 |

---

## D 阶段：第四翼 + 方庭

### 任务 D1：测试（先写，必须失败）

**文件：** 创建 `tests/p1x.test.js`

- [ ] 写测试：

```js
// 一期延展：第四翼（西北翼）+ 方庭（原四方格商场）（v3 规格第 2、3、6 节）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, levelsOf, directionCount } from './helpers.js';
import { convexOverlap, lrectPoly, rect, toW, dist } from '../src/layout/geom.js';

const p1 = () => L.buildings.find((b) => b.id === 'P1');
const wing = (id) => p1().wings.find((w) => w.id === id);

test('一期四翼：西北翼全宽段与西翼、北翼的翼楼矩形互不重叠', () => {
  assert.deepEqual(p1().wings.map((w) => w.id).sort(), ['N', 'NW', 'SE', 'W']);
  const nw = wing('NW');
  const body = (w, u0) => lrectPoly(w.F, rect(u0, -23, w.uEnd, 23));
  for (const id of ['W', 'N']) assert.ok(!convexOverlap(body(nw, nw.start), body(wing(id), wing(id).ua), 0.05), `西北翼与 ${id} 翼重叠`);
});

test('方庭在一期地块内、离道路 ≥5m；东南斜面与西北翼末端重合', () => {
  const sq = p1().square;
  assert.ok(sq, '缺少方庭');
  for (const [x, z] of sq.outline) assert.ok(x >= -281 && x <= -21 && z >= -251 && z <= -25, `方庭顶点 (${x.toFixed(1)}, ${z.toFixed(1)}) 离路太近`);
  const nw = wing('NW');
  for (const v of [-23, 23]) {
    const e = toW(nw.F, nw.uEnd, v);
    assert.ok(sq.chamfer.some((p) => dist(p, e) < 0.05), '斜面端点与西北翼末端不重合');
  }
});

test('方庭与西北翼铺位数量', () => {
  const need = { '1F': 22, '2F': 22, '3F': 14, B1M: 18 };
  for (const [s, n] of Object.entries(need)) {
    const lv = lvl(`P1-${s}`);
    const k = lv.units.filter((u) => u.square).length;
    assert.ok(k >= n, `${lv.id} 方庭只有 ${k} 家`);
    const w = lv.units.filter((u) => u.wing === 'NW').length;
    assert.ok(w >= 6, `${lv.id} 西北翼只有 ${w} 家`);
  }
});

test('方庭 4 个人行入口均非主入口；一期 1F 仍恰有 1 个主入口', () => {
  const sq = L.entrances.filter((e) => e.building === 'P1' && e.square);
  assert.equal(sq.length, 4);
  assert.ok(sq.every((e) => !e.main));
  assert.ok(directionCount(sq) >= 3);
  assert.equal(L.entrances.filter((e) => e.building === 'P1' && e.level === 'P1-1F' && e.main).length, 1);
});

test('方庭垂直交通与天台', () => {
  assert.equal(L.elevators.filter((e) => e.type === 'glass' && e.square).length, 2);
  const pairs = new Set(L.escalators.filter((e) => e.square).map((e) => e.pair));
  assert.ok(pairs.size >= 8, `方庭只有 ${pairs.size} 对扶梯`);
  const rf = lvl('P1-RF');
  for (const t of ['cinema-open', 'farm', 'viewdeck']) assert.ok(rf.features.some((f) => f.type === t), `天台缺少 ${t}`);
  assert.ok(rf.voids.some((v) => v.kind === 'skylight' && v.square), '缺少方庭中庭天窗');
});
```

- [ ] 运行 `node --test tests/p1x.test.js`，预期 5 项 FAIL（`wings` 只有 3 个、`square` 未定义）。
- [ ] Commit `test(layout): 一期第四翼与方庭规则测试（任务 D1）`

### 任务 D2：广义外轮廓

**文件：** 修改 `src/layout/hub.js`；测试 `tests/geom.test.js`

- [ ] 在 `geom.test.js` 加测试：单圆厅 R=34、四翼 45/165/225/285（225 翼带 `annex` 折线），`hubOutline` 结果是简单多边形（任意两条非相邻边不相交），西翼与 225 翼之间的连接点等于两条内侧边的交点（误差 <1e-6），且不含 207°–242° 之间的圆弧点。
- [ ] 实现：`rots.length === 1` 时走新流程——

```js
function singleHub(r, arms, HW, step) {
  const beta = Math.asin(HW / r.R) * DEG;
  const ua = Math.sqrt(r.R * r.R - HW * HW);
  const A = [...arms].sort((a, b) => mod360(a.deg) - mod360(b.deg));
  const n = A.length;
  const J = A.map((a, i) => {
    const b = A[(i + 1) % n];
    if (mod360(b.deg - a.deg) > 2 * beta) return { arc: [a.deg + beta, a.deg + beta + mod360(b.deg - beta - a.deg - beta)] };
    const Fa = frame(r.x, r.z, a.deg), Fb = frame(r.x, r.z, b.deg);
    return { p: lineHit(toW(Fa, 0, HW), dirW(Fa, 1, 0), toW(Fb, 0, -HW), dirW(Fb, 1, 0)) };
  });
  const pts = [];
  A.forEach((a, i) => {
    const F = frame(r.x, r.z, a.deg);
    const prev = J[(i - 1 + n) % n], next = J[i];
    pts.push(prev.p || toW(F, ua, -HW));
    if (a.annex) pts.push(...a.annex);
    else pts.push(toW(F, a.uEnd, -HW), toW(F, a.uEnd, HW));
    pts.push(next.p || toW(F, ua, HW));
    if (next.arc) arc(pts, r, next.arc[0], next.arc[1], step);
  });
  return pts;
}
```

  `lineHit(p, d, q, e)` 解两直线交点。多圆厅（二期）保持原算法。
- [ ] `npm test` 全部 PASS（一期原三翼外轮廓与旧算法一致：旧测试不变）。Commit `feat(layout): 外轮廓支持相邻翼在圆外相接与末端拼接（任务 D2）`

### 任务 D3：西北翼

**文件：** 修改 `src/layout/mall.js`、`src/layout/p1.js`

- [ ] `makeWing`：`w.start` 存在时 `u0 = w.start`、停车层 `aisleStart = w.start`、车位排起点 `w.start + 1.5`；`w.annex` 存在时 `bandEnd = streetEnd = aisleEnd = spineEnd = rowEnd = uEnd`，且不生成端部区、端楼梯、端入口；`wingRetail` 中 `w.neck`（局部多边形 `{ plus, minus }`）替代首段矩形口袋；末端两家店的端门面朝 `+u`（进入方庭大厅）。
- [ ] `p1.js`：`wings` 加 `{ id: 'NW', rot: 'C', deg: 225, uEnd: 99.37, start: 39.85, annex: true, core: { band: -1, u: 62 }, zone: 'J', name: '西北翼' }`；喇叭口口袋（西北翼局部坐标）`plus = [[33.27,7],[39.85,7],[39.85,23],[32.44,10.17]]`、`minus` 为其关于 v 的镜像；各层 `wings.NW`：B1M `cats: ['food','snack','tea']`；2F `slots: [[59,67]]`；3F `slots: [[44,56]]`；RF `skylights: [[59,67]]`；扶梯 `{ pair: 'K7', wing: 'NW', from: '1F', to: '2F', axis: 'x', sign: 1, bottom: 44, cross: 0, slot: true }`、`{ pair: 'K8', wing: 'NW', from: '2F', to: '3F', axis: 'x', sign: 1, bottom: 70, cross: 0, slot: true }`；外轮廓臂表传 `annex` 折线（由 square.js 导出的 `SQUARE_CHAIN`）。
- [ ] 一期广场 `plazas` 改为 `rect(-286,-256,-16,-20)`。
- [ ] `npm test`：p1x 前两项 PASS，其余待 D4。Commit `feat(layout): 一期西北翼（任务 D3）`

### 任务 D4：方庭

**文件：** 创建 `src/layout/square.js`；修改 `src/layout/mall.js`（`spec.annex` 钩子）

- [ ] 局部 frame `F_SQ = frame(-220, -200, 0, 'P1-SQ')`；`SQUARE_CHAIN = [[-192.53,-160],[-280,-160],[-280,-240],[-160,-240],[-160,-192.53]]`（世界坐标，西北翼右后角 → 方庭外圈 → 左后角）；`CHAMFER = [[-192.53,-160],[-160,-192.53]]`。
- [ ] 槽位表：v1 `SLOTS` 去掉 `S6`、`SE`、`E2`、`E3`、`S5`、`arcade`；`E1` 改 `EB(-18,-10)`；新增 `arcade: island(23,38,6,18)`（3F 合并东南岛铺）；`market` 改 `rect(23,-18,49,18)`。各层使用：

```js
const RING = ['N1', 'N2', 'N3', 'N5', 'N6', 'N7', 'S1', 'S2', 'S3', 'NW', 'W1', 'W2', 'W3', 'SW', 'NE', 'E1'];
const ISLANDS = ['INW-a', 'INW-b', 'ISW-a', 'ISW-b', 'INE-a', 'INE-b', 'ISE-a', 'ISE-b'];
const LEVEL_SLOTS = {
  '1F': [...RING, ...ISLANDS],
  '2F': [...RING, 'N4', 'S4', ...ISLANDS],
  '3F': ['cinema', 'kids', 'books', 'W2', 'W3', 'N1', 'N2', 'N3', 'N4', 'N5', 'S2', 'S3', 'S4', 'INW-a', 'INW-b', 'ISW-a', 'ISW-b', 'INE-a', 'INE-b', 'arcade'],
  B1M: ['N1', 'N3', 'N4', 'N5', 'N6', 'N7', 'S1', 'S2', 'S3', 'S4a', 'S4b', 'NW', 'W1', 'W2', 'W3', 'SW', 'NE', 'market', 'INW-a', 'INW-b', 'ISW-a', 'ISW-b'],
};
```

  品牌：按所在层 `cfg.cats` 轮流 `picker.take`；`cinema` → `arcade` 业态（"沉浸剧场 / VR"），`kids`、`books`、`market` → 各自业态。铺位 `square: true`，id `${lv.id}-SQ-${slot}`。
- [ ] 走廊：v1 `corridors()`，`ringS` 截到 `x≤43.47`、`ringE` 截到 `z≤23.47`；各商业层加入口大厅多边形 `[[24,24],[24,40],[27.47,40],[60,7.47],[60,4],[44,4],[44,24]]`（B1/B2 同形为车道）。
- [ ] 核心筒与用房：西客梯核（v1 `CORE_W`，3 台，门朝 E）；东客梯核移到南带：井道 `rect(12.5,24,16,33)`（3 台沿 z，门朝 W）、电梯厅 `rect(8,24,12.5,33)`、楼梯 `rect(8,33,16,40)` 门朝 N；东卫生间 `rect(16,24,24,40)` 门 `x∈[18.5,21.5]` 朝 N；西卫生间、服务核、楼梯 S4 沿用 v1；S5 移到 `rect(55,-10,60,-4)`（1F–RF，门朝 S）。
- [ ] 中庭：1F 洞口 `rect(-5,-8,5,8)` r0.6；2F/3F 洞口 `rect(-17,-10,17,10)` r4；RF 天窗同形（`kind: 'skylight'`、`square: true`、带 `radius`）。观光梯 `(±15.5,0)` 服务 B1M–3F，`square: true`。
- [ ] 扶梯（按一期层高重算）：`SQ-P0` B1→B1M（axis z, sign 1, top −24, cross −16.15, slot）；`SQ-P1/P2` B1M→1F（axis z, sign ∓1, top ∓8, cross ∓2.55）；`SQ-P3/P4` 1F→2F（axis z, sign ∓1, top ∓10, cross ∓10.65）；`SQ-P5/P6` 2F→3F（axis x, sign ±1, centered, cross ∓15.15, slot）；`SQ-P7` 3F→RF（axis x, sign −1, bottom −23.5, cross 0, slot）。B1 扶梯厅 `rect(-20,-40,-6,-24)`，B1M 扶梯厅 `rect(-20,-40,-12,-24)`。
- [ ] 入口（1F，`square: true`，均非主）：南门 `x∈[-8,8], z=40`、北门 `x∈[-4,4], z=-40`、西门 `z∈[-4,4], x=-60`、东门 `z∈[-4,4], x=60`。
- [ ] 车库（B1/B2）：v1 `ROWS`、`aisles()`、设备房（去掉 v1 坡道相关：`CN`、`RAMP`、`B1_RAMP_HOLE`），被斜面切到的车位排在大厅处截断；车位 `zone: 'K'`。
- [ ] 天台：木平台走道（v1 `fillRoof` 的 D1–D4、SK* 走道，去掉 SW3/SKY）；`cinema-open`（东半部 `rect(22,-20,56,16)`，银幕在东墙）、`farm`（西半部 `rect(-56,-22,-26,20)`，种植池 + 温室）、`viewdeck`（北侧 `rect(-18,-40,10,-26)`）；扶梯玻璃亭 `rect(-37,-5,-19,5)`；天台卫生间 `rect(-8,28,0,36)`。
- [ ] `building.square = { F, outline, chamfer, zone: 'K' }`。
- [ ] `npm test` 全部 PASS（含 p1x 5 项、rules 全部、p1 原测试）。Commit `feat(layout): 方庭（原四方格商场）并入一期（任务 D4）`

### 任务 D5：方庭渲染

**文件：** 创建 `src/render/build/square.js`；修改 `app.js`（构建步骤）、`paths.js`、`build/labels.js`、`build/site.js`、`build/roof.js`

- [ ] 方庭中庭：1F 服务台、中庭悬挂装置（云朵灯组）、观光梯（通用模块已覆盖）。
- [ ] 天台：露天星空影院（银幕框架 + LED 银幕动画 + 阶梯木平台 + 懒人沙发）、屋顶农场（种植池 + 玻璃温室 + 稻草人）、观景台（玻璃栏板 + 望远镜）。
- [ ] 动线：方庭环廊环线 + 十字轴线 + 西北翼商业街；停车层 K 区标注。
- [ ] 景观：一期地块树阵避开一期外轮廓（含方庭）；方庭四门外的入口步道（通用模块）。
- [ ] 浏览器验证：园区、一期全楼、1F/2F/3F/B1M/B1/RF 各层、方庭天台近景；无控制台报错。Commit `feat(render): 一期西北翼与方庭（任务 D5）`

### 任务 D6：D 阶段验证与发布

- [ ] `npm test`、`npm run build`；截图（园区昼 / 夜、一期各层、方庭天台、手机竖屏）；记录性能。
- [ ] 发布到同一链接。Commit `chore: D 阶段打包与发布`

---

## E 阶段：地铁云澜汇站

### 任务 E1：测试（先写，必须失败）

**文件：** 创建 `tests/metro.test.js`；修改 `tests/campus.test.js`、`tests/p1.test.js`、`tests/p2.test.js`

- [ ] campus：楼板压路、外轮廓重叠两条规则只检查 `elev ≥ 0` 的楼层 / 非 `metro` 楼栋（地下站厅本就在道路下方）。
- [ ] p1/p2 入口测试：`e.to` 为楼层 id 时外侧落在该层走道。
- [ ] metro.test.js：

```js
// 地铁云澜汇站（v3 规格第 4、6 节）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, levelsOf, inWalk } from './helpers.js';
import { pointInPoly, convexOverlap } from '../src/layout/geom.js';

const M = () => L.buildings.find((b) => b.id === 'M');

test('地铁两层：站厅 −4.5、站台 −12，主题不同', () => {
  assert.ok(M(), '缺少地铁');
  const ls = levelsOf('M');
  assert.deepEqual(ls.map((l) => [l.short, l.elev]), [['B2', -12], ['B1', -4.5]]);
  assert.equal(new Set(ls.map((l) => l.theme.key)).size, 2);
});

test('一期 B1M、二期 B1、三期 B1 各有通往站厅的连接口', () => {
  for (const id of ['P1-B1M', 'P2-B1', 'P3-B1']) {
    const es = L.entrances.filter((e) => e.level === id && e.to === 'M-B1');
    assert.equal(es.length, 1, `${id} 缺少地铁连接口`);
    const e = es[0];
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    assert.ok(inWalk(lvl(id), [mx - e.nx, mz - e.nz]), `${id} 连接口内侧不是走道`);
    assert.ok(inWalk(lvl('M-B1'), [mx + e.nx, mz + e.nz]), `${id} 连接口外侧不在站厅通道`);
  }
});

test('四个地面出入口分属一期、二期、三期与公园，雨棚不压道路与人行道', () => {
  const ex = L.entrances.filter((e) => e.building === 'M' && e.to === 'site');
  assert.ok(ex.length >= 4);
  const plots = new Set(ex.map((e) => L.site.plots.find((p) => pointInPoly([e.kiosk.x, e.kiosk.z], p.poly))?.id));
  for (const id of ['P1', 'P2', 'P3', 'park']) assert.ok(plots.has(id), `${id} 没有地铁出入口`);
  for (const e of ex) {
    for (const r of [...L.site.roads, ...L.site.sidewalks]) assert.ok(!convexOverlap(e.kiosk.poly, r.poly), `${e.name} 雨棚压到 ${r.id}`);
  }
});

test('站厅 ↔ 站台：上下行扶梯各 ≥2、楼梯 ≥2、客梯 ≥2', () => {
  const es = L.escalators.filter((e) => e.from === 'M-B2' && e.to === 'M-B1');
  assert.ok(es.filter((e) => e.dir === 'up').length >= 2 && es.filter((e) => e.dir === 'down').length >= 2);
  assert.ok(L.stairs.filter((s) => s.serves.includes('M-B1') && s.serves.includes('M-B2')).length >= 2);
  assert.ok(L.elevators.filter((e) => e.serves.includes('M-B1') && e.serves.includes('M-B2')).length >= 2);
});

test('四条通道沿对角线', () => {
  const ang = M().passages.map((p) => Math.round(((p.deg % 360) + 360) % 360)).sort((a, b) => a - b);
  assert.deepEqual(ang, [45, 135, 225, 315]);
});
```

- [ ] 运行，预期新增 FAIL。Commit `test(layout): 地铁云澜汇站规则测试（任务 E1）`

### 任务 E2：地铁布局

**文件：** 创建 `src/layout/metro.js`；修改 `layout.js`、`walk.js`、`campus.js`

- [ ] 楼层：`M-B2` 站台（−12、层高 5.5、主题 `platform`）、`M-B1` 站厅（−4.5、层高 4.0、主题 `metro`）。
- [ ] 站厅走道：`rect(-66,-5,66,5)`、`rect(-56,-11,66,-5)`、`rect(-66,5,56,11)`；铺位 便利店 `rect(-66,-11,-56,-5)` 门面朝 S、面包店 `rect(56,5,66,11)` 门面朝 N；客服中心、卫生间为用房；闸机线 `x=±36`（要素，不挡走道）。
- [ ] 站台走道 `rect(-60,-6,60,6)`；轨道 `z=±8.75`；列车 6 节 × 19m。
- [ ] 扶梯：`MA` axis x、sign −1、bottom −12、cross −3（站台 → 站厅西）；`MB` axis x、sign 1、bottom 12、cross 3；站厅楼板洞口为斜段外包矩形。楼梯 `rect(-4,-5,4,-1)` 门朝 N、`rect(-4,1,4,5)` 门朝 S（两层同门）。客梯 `(-32,0)` 门朝 N、`(32,0)` 门朝 S，玻璃井道（`exterior: true`）。
- [ ] 通道（站厅层走道，frame(0,0,θ) 局部 `u∈[12,uEnd]×v∈[-4,4]`）：225° uEnd 65.9、315° uEnd 64、135° uEnd 60、45° uEnd 76；A/C/D 分支 `u∈[45,52.6]×v∈[∓14,∓4]`（A：225° 取 −v；C：315° 取 +v；D：135° 取 −v）。
- [ ] 连接口：一期 B1M 东南翼末端（翼局部 `u=84, v∈[-4,4]`，外法线 +u，`to: 'M-B1'`）；二期 B1 西翼末端（`u=86`）；三期 B1 东北角（135° frame `u=57.6, v∈[-4,4]`，外法线指向原点）。
- [ ] 地面出入口（`building: 'M'`, `to: 'site'`, 带 `kiosk: { x, z, deg, poly }`）：A (−44.4,−24.6)、C (44.4,−24.6)、D (−24.6,44.4)、B (53,53)；公园 `site.park.metro` 移到 B。
- [ ] `walk.js`：入口外侧——`to === 'site'` 用场地、`'bridge'` 用桥面，否则当作楼层 id 用 `walksAt(e.to, out)`。
- [ ] `npm test` 全部 PASS。Commit `feat(layout): 地铁站厅、站台与四条通道（任务 E2）`

### 任务 E3：地铁渲染

**文件：** 创建 `src/render/build/metro.js`；修改 `app.js`、`ui.js`、`build/labels.js`、`paths.js`、`build/shell.js`

- [ ] 站厅：浅色水磨石、铝板吊顶 + 线形灯带、圆柱、闸机阵列、售票机、客服中心、导向牌"云澜汇站 YUNLAN HUI"、线路图灯箱。
- [ ] 通道：墙面瓷砖、地面导向线、灯带、广告灯箱、方向牌（"一期云澜汇 →" 等）。
- [ ] 站台：屏蔽门、轨道（道床 + 钢轨）、列车（6 节，进站减速 → 停站开门 → 出站加速，两侧交替）、到站信息屏。
- [ ] 地面出入口：玻璃雨棚 + M 标识柱 + 楼梯 + 上行扶梯（复用 `drawEscalator`）；场地挖洞。
- [ ] 各期连接口：地下墙面开口 + "地铁 Metro" 灯箱。
- [ ] 分期按钮加"地铁"；地铁楼栋在园区视角隐藏，选中后显示两层；拾取信息。
- [ ] 浏览器验证：站厅、站台列车、通道、出入口、各期连接口；手机竖屏。Commit `feat(render): 地铁云澜汇站（任务 E3）`

### 任务 E4：导览与最终验证

- [ ] 导览：二期天台之后加入"地铁站厅 → 站台列车"，一期段加入"方庭中庭"。
- [ ] `npm test`、`npm run build`、全套截图、性能；发布同一链接；finishing-a-development-branch 收尾。Commit `chore: E 阶段打包与发布`

---

## 规格覆盖自检

| 规格章节 | 任务 |
|---|---|
| 2 西北翼 | D1、D2、D3、D5 |
| 3 方庭 | D1、D4、D5 |
| 4 地铁 | E1、E2、E3 |
| 5 界面与渲染 | D5、E3、E4 |
| 6 测试 | D1、E1 |
| 7 交付 | D6、E4 |
