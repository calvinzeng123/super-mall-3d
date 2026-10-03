# 云澜汇 3D 商场 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 按规格 `docs/superpowers/specs/2026-10-03-yunlan-mall-3d-design.md` 构建一个可在浏览器中交互的写实 3D 购物中心（7 个楼层），打包为单文件 HTML 并发布在线链接。

**架构：** 纯数据的布局模型（`src/layout/`，可在 Node 中测试）描述楼层、铺位、洞口、垂直交通、坡道、天台要素；渲染层（`src/render/`）读取布局模型，用 Three.js 程序化生成几何（按材质合并 + 实例化），再叠加动画与 UI。esbuild 把源码打包进 HTML 模板。

**技术栈：** Three.js 0.170（jsDelivr CDN，importmap）、原生 ES Modules、node:test、esbuild。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `package.json` | `type: module`，脚本 `test` / `build` / `serve` |
| `build.mjs` | 读取 `src/shell.html`，生成 `index.html`（开发）、`dist/mall.html`（完整页面）、`dist/artifact.html`（发布片段） |
| `src/shell.html` | `<title>`、样式、importmap、UI 骨架，`<!--APP-->` 占位 |
| `src/main.js` | 启动：WebGL 检测 → `buildLayout()` → `createApp()` |
| `src/layout/geom.js` | 矩形/线段/多边形工具（纯函数） |
| `src/layout/constants.js` | 楼层表、建筑范围、核心筒坐标、主题 |
| `src/layout/brands.js` | 原创虚构品牌表（按楼层、业态） |
| `src/layout/retail.js` | 1F/2F/3F/B1M 的铺位槽位、合并、走廊 |
| `src/layout/vertical.js` | 扶梯、电梯、楼梯、核心筒用房 |
| `src/layout/parking.js` | B1/B2 车道、车位、坡道、设备房 |
| `src/layout/roof.js` | 天台走道、餐吧、摩天轮、IP、水景等 |
| `src/layout/layout.js` | `buildLayout()` 汇总所有楼层 |
| `src/layout/walk.js` | 步行连通图（测试与行人路径共用） |
| `src/render/app.js` | 渲染器、相机、控制器、主循环、状态（楼层/爆炸/昼夜） |
| `src/render/batch.js` | `Batcher`：带顶点色的几何合并器 |
| `src/render/materials.js` | 共享材质库 |
| `src/render/textures.js` | Canvas 贴图：地面、招牌图集、图标、海报、LED 屏 |
| `src/render/build/shell.js` | 楼板（含洞口）、柱、外立面、幕墙、天窗、女儿墙 |
| `src/render/build/walls.js` | 由铺位/用房轮廓生成隔墙（去重） |
| `src/render/build/storefronts.js` | 店面玻璃、门、招牌 |
| `src/render/build/interiors.js` | 按业态生成店内陈设 |
| `src/render/build/rooms.js` | 核心筒、电梯门、楼梯间、卫生间内部 |
| `src/render/build/escalators.js` | 扶梯（踏步滚动） |
| `src/render/build/elevators.js` | 观光梯井道与轿厢动画 |
| `src/render/build/foodcourt.js` | B1M 用餐区、老街、超市 |
| `src/render/build/parking.js` | 车位线、停放车辆、柱、坡道、道闸、标识 |
| `src/render/build/roof.js` | 花园、餐吧、摩天轮、IP、天空之镜、观景台 |
| `src/render/build/site.js` | 地面、道路、广场、树、路灯、周边建筑、入口雨棚 |
| `src/render/build/people.js` | 行人实例化与动画 |
| `src/render/build/flows.js` | 动线箭头 |
| `src/render/build/labels.js` | 文字标注精灵 |
| `src/render/env.js` | 灯光、天空、昼夜、泛光、性能降级 |
| `src/render/ui.js` | 楼层栏、目录搜索、悬停提示、工具栏 |
| `src/render/tour.js` | 一键导览镜头路径 |
| `tests/layout.test.js` | 布局规则测试 |

## 数据契约（布局模型）

```js
// Rect  {x0,z0,x1,z1}（x0<x1, z0<z1）；Pt [x,z]；Side 'N'|'S'|'E'|'W'（门面朝向，即外法线）
// Front {x0,z0,x1,z1,side}
// Level {
//   id, name, kind:'parking'|'food'|'retail'|'roof', elev, height,
//   theme:{ key, floor, accent, label },
//   slab:{ outer:Pt[], holes:Pt[][] }, voids:[{id,kind,poly:Pt[]}],
//   units:[Unit], rooms:[Room], walk:[{id,kind,rect}], features:[Feature],
//   parking?:{ stalls:[{x,z,w,d,face,type,zone}], aisles:[Rect], rows:[...] }
// }
// Unit  { id, code, level, brand:{name,en,cat,bg,fg,logo}, rects:[Rect], fronts:[Front] }
// Room  { id, type:'core'|'wc'|'stair'|'freight'|'equip'|'shaft', rects:[Rect], doors:[Front], label }
// Escalator { id, pair, from, to, dir:'up'|'down', bottom:{x,z,y}, top:{x,z,y}, width, rise, run }
// Elevator  { id, type:'passenger'|'glass'|'freight', x, z, w, d, door:Side, serves:[levelId] }
// Stair     { id, rect, serves:[levelId], door:Front, doorByLevel?:{[levelId]:Front} }
// Entrance  { id, name, level:'1F', side, seg:{x0,z0,x1,z1}, width, main }
// Ramp      { id, type:'street-in'|'street-out'|'down'|'up', from:{x,z,y,level}, to:{x,z,y,level}, width, lane:Rect }
// Layout    { levels:[Level](B2→RF), escalators, elevators, stairs, entrances, ramps, site }
```

---

### 任务 1：工程脚手架

**文件：** 创建 `package.json`、`build.mjs`、`src/shell.html`、`src/main.js`、`.gitignore`

- [ ] **步骤 1：写 package.json**

```json
{
  "name": "yunlan-mall-3d",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "build": "node build.mjs",
    "serve": "python3 -m http.server 5173"
  },
  "devDependencies": { "esbuild": "^0.28.2" }
}
```

- [ ] **步骤 2：写 build.mjs**（读取 shell，开发版引用 `./src/main.js`，发布版内联 esbuild 打包结果，`three` 与 `three/addons/*` 标为 external 由 importmap 解析）

```js
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const shell = await readFile('src/shell.html', 'utf8');
await writeFile('index.html', wrap(shell.replace('<!--APP-->', '<script type="module" src="./src/main.js"></script>')));
const out = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'esm', minify: true,
  external: ['three', 'three/addons/*'], write: false, target: 'es2022' });
const code = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = shell.replace('<!--APP-->', `<script type="module">${code}</script>`);
await mkdir('dist', { recursive: true });
await writeFile('dist/artifact.html', page);
await writeFile('dist/mall.html', wrap(page));
function wrap(body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${body}</body></html>`;
}
```

- [ ] **步骤 3：写 shell.html 与 main.js 最小版本**（main.js 仅 `console.log('boot')`），运行 `npm install && npm run build`，预期生成 `index.html`、`dist/mall.html`、`dist/artifact.html`。
- [ ] **步骤 4：Commit** `chore: 工程脚手架`

### 任务 2：几何工具

**文件：** 创建 `src/layout/geom.js`

- [ ] **步骤 1：实现纯函数**

```js
export const rect = (x0, z0, x1, z1) => ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
export const NORMAL = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
export const rectsOverlap = (a, b, eps = 1e-6) => a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
export function rectsConnect(a, b, minLen = 1) {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return ox >= -1e-6 && oz >= -1e-6 && Math.max(ox, oz) >= minLen;
}
export const pointInRect = ([x, z], r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export function pointInPoly([x, z], poly) { /* 射线法 */ }
export const rectPoly = (r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
export function roundedRectPoly(r, radius, seg = 6) { /* 四角圆弧采样，逆时针 */ }
export function frontProbes(f, d = 0.5) { /* 1/4、1/2、3/4 处沿外法线偏移 d */ }
export function doorProbe(e, d = 0.6) { /* 电梯门面中点外偏 */ }
export function rectSamples(r, step = 1, inset = 0.05) { /* 网格采样点 */ }
export function rectCornersInset(r, inset = 1) { /* 4 角 + 中心 */ }
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const mid = (s) => [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];
export function unionOutline(rects) { /* 矩形并集外轮廓线段（共享边相互抵消） */ }
export function subtractSegments(seg, cuts) { /* 共线线段扣除 */ }
```

- [ ] **步骤 2：Commit** `feat(layout): 几何工具`

### 任务 3：布局规则测试（先写，必须失败）

**文件：** 创建 `tests/layout.test.js`

- [ ] **步骤 1：写测试**（完整内容见仓库同名文件，覆盖规格第 8 节 10 条规则；关键断言如下）

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/layout/layout.js';
import { rectsOverlap, pointInRect, pointInPoly, frontProbes, doorProbe, rectSamples, rectCornersInset, dist, mid, NORMAL } from '../src/layout/geom.js';
import { buildWalkGraph, components } from '../src/layout/walk.js';

const L = buildLayout();
const level = (id) => L.levels.find((l) => l.id === id);
const inWalk = (lv, p) => lv.walk.some((w) => pointInRect(p, w.rect));
const inVoid = (lv, p) => lv.voids.some((v) => pointInPoly(p, v.poly));
const onSlab = (lv, p) => pointInPoly(p, lv.slab.outer) && !inVoid(lv, p);

test('扶梯几何：30°、落点在楼板走廊上、斜段在上层洞口内', () => {
  for (const e of L.escalators) {
    const lo = level(e.from), hi = level(e.to);
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const deg = (Math.atan2(e.top.y - e.bottom.y, run) * 180) / Math.PI;
    assert.ok(Math.abs(deg - 30) < 0.3, `${e.id} 坡度 ${deg.toFixed(2)}°`);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    const low = [e.bottom.x - ux * 1.2, e.bottom.z - uz * 1.2], high = [e.top.x + ux * 1.2, e.top.z + uz * 1.2];
    assert.ok(onSlab(lo, low) && inWalk(lo, low), `${e.id} 底部落点不在 ${lo.id} 楼板走廊上`);
    assert.ok(onSlab(hi, high) && inWalk(hi, high), `${e.id} 顶部落点不在 ${hi.id} 楼板走廊上`);
    for (let t = 0.15; t <= 0.951; t += 0.1) for (const s of [-1, 0, 1]) {
      const off = s * (e.width / 2 - 0.1);
      const p = [e.bottom.x + (e.top.x - e.bottom.x) * t - uz * off, e.bottom.z + (e.top.z - e.bottom.z) * t + ux * off];
      assert.ok(inVoid(hi, p), `${e.id} 斜段 t=${t.toFixed(2)} 会撞到 ${hi.id} 楼板`);
    }
  }
});

test('从每个入口、每个停车层电梯厅都能走到每一个铺位', () => {
  const comp = components(buildWalkGraph(L));
  const root = comp.get(`ent:${L.entrances[0].id}`);
  for (const e of L.entrances) assert.equal(comp.get(`ent:${e.id}`), root, `${e.name} 不连通`);
  for (const lv of L.levels) for (const u of lv.units) assert.equal(comp.get(`unit:${u.id}`), root, `${u.code} ${u.brand.name} 不可达`);
});
```

- [ ] **步骤 2：运行** `npm test`，预期 FAIL：`Cannot find module '../src/layout/layout.js'`
- [ ] **步骤 3：Commit** `test(layout): 布局规则测试`

### 任务 4：布局模型实现（让测试通过）

**文件：** 创建 `constants.js`、`brands.js`、`retail.js`、`vertical.js`、`parking.js`、`roof.js`、`layout.js`、`walk.js`

- [ ] **步骤 1：constants.js** — 楼层表（标高/层高/主题）与核心筒坐标，数值取自规格第 3、4 节：

```js
export const LEVELS = [
  { id: 'B2', name: 'B2 停车场', kind: 'parking', elev: -12, height: 3.6, theme: { key: 'park-green', floor: 'concrete-green', accent: '#2f9e6b', label: '停车 · 绿区' } },
  { id: 'B1', name: 'B1 停车场', kind: 'parking', elev: -8.4, height: 3.9, theme: { key: 'park-blue', floor: 'concrete-blue', accent: '#2f6fd6', label: '停车 · 蓝区' } },
  { id: 'B1M', name: 'B1M 美食广场', kind: 'food', elev: -4.5, height: 4.5, theme: { key: 'food', floor: 'terrazzo-warm', accent: '#e0752d', label: '美食广场 · 老街 · 超市' } },
  { id: '1F', name: '1F 国际精品', kind: 'retail', elev: 0, height: 5.5, theme: { key: 'lux', floor: 'marble-white', accent: '#b8945a', label: '国际精品 · 美妆' } },
  { id: '2F', name: '2F 潮流服饰', kind: 'retail', elev: 5.5, height: 5.5, theme: { key: 'fashion', floor: 'terrazzo-cool', accent: '#3a8fb7', label: '潮流服饰 · 运动' } },
  { id: '3F', name: '3F 亲子娱乐', kind: 'retail', elev: 11, height: 5.5, theme: { key: 'family', floor: 'wood-warm', accent: '#e85d75', label: '亲子 · 餐饮 · 影城' } },
  { id: 'RF', name: 'RF 天台花园', kind: 'roof', elev: 16.5, height: 6, theme: { key: 'roof', floor: 'deck-garden', accent: '#4c9a52', label: '天台花园 · 餐吧 · 摩天轮' } },
];
export const CORE_W = { shafts: { x0: -36, z0: -34, x1: -33, z1: -24 }, lobby: { x0: -33, z0: -34, x1: -28, z1: -24 }, stair: { x0: -36, z0: -40, x1: -28, z1: -34 } };
export const CORE_E = { shafts: { x0: 33, z0: 24, x1: 36, z1: 34 }, lobby: { x0: 28, z0: 24, x1: 33, z1: 34 }, stair: { x0: 28, z0: 34, x1: 36, z1: 40 } };
export const SERVICE = { shaft: { x0: 12, z0: -34, x1: 15.5, z1: -24 }, lobby: { x0: 15.5, z0: -34, x1: 20, z1: -24 }, stair: { x0: 12, z0: -40, x1: 20, z1: -34 } };
```

- [ ] **步骤 2：retail.js** — 槽位表（北带 N1–N7、南带 S1–S6、西带 NW/W1/W2/WE/W3/SW、东带 NE/E1/EE/E2/E3/SE、8 个岛铺），`retailLevel(levelId)` 按楼层分配品牌并做合并（3F：影城 = N6+N7+NE+E1，儿童乐园 = NW+W1，书店 = SW+S1，电玩城 = SE+E3；B1M：超市 = 东翼，N2 改扶梯厅）；走廊矩形按规格第 4 节。
- [ ] **步骤 3：vertical.js** — `escalatorPair()` 生成成对扶梯（宽 1.8m，水平投影 = rise·√3），8 对数据取自规格第 6 节；电梯、楼梯、卫生间、核心筒用房。
- [ ] **步骤 4：parking.js** — 车道 A1–A4、W/E 端车道、中轴 C、连接区；`fillRow()` 按 3 车一跨生成车位并扣除用房/坡道；地面坡道与 B1↔B2 坡道。
- [ ] **步骤 5：roof.js** — 走道矩形、4 家餐吧单元、摩天轮/IP/天空之镜/观景台/立体字/花架/儿童区/设备区要素。
- [ ] **步骤 6：walk.js** — `buildWalkGraph(layout)`：同层走廊相接成边；铺位门面探针落入走廊成边；扶梯/电梯/楼梯/入口跨层成边；`components()` 返回连通分量。
- [ ] **步骤 7：layout.js** — 组装楼板外轮廓与洞口（1F 洞口 + 观光梯井、2F/3F 中庭、3F 扶梯洞、RF 天窗 + 扶梯洞、B1M 扶梯洞、B1 坡道洞 + 连接区外轮廓）。
- [ ] **步骤 8：运行** `npm test`，预期全部 PASS（失败则按断言信息修正坐标，禁止放宽测试阈值）。
- [ ] **步骤 9：Commit** `feat(layout): 布局模型通过全部规则测试`

### 任务 5：渲染基础

**文件：** `src/render/app.js`、`batch.js`、`materials.js`、`textures.js`、`env.js`

- [ ] **步骤 1：Batcher** — 把任意 BufferGeometry（去索引）按矩阵变换写入，附加 `color` 属性，`finish()` 输出一个 Mesh：

```js
export class Batcher {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; }
  add(geo, matrix, color) { /* g = geo.index ? geo.toNonIndexed() : geo; 应用矩阵并 push 到数组 */ }
  box(cx, cy, cz, sx, sy, sz, color, rotY = 0) { /* 常用：盒子 */ }
  finish(material) { /* 生成 BufferGeometry + Mesh；为空返回 null */ }
}
```

- [ ] **步骤 2：app.js** — WebGLRenderer（ACES、sRGB、阴影）、透视相机、OrbitControls（阻尼、限制俯角）、每层一个 `THREE.Group`（`levelGroups[id]`），`setFocus(levelId|null)`、`setExploded(bool)`、主循环调用各模块 `update(dt, t)`。
- [ ] **步骤 3：env.js** — RoomEnvironment 反射、半球光 + 太阳光（阴影只在楼层切换时刷新）、天空渐变；`setNight(bool)` 渐变切换；EffectComposer + UnrealBloomPass 仅夜间启用；FPS 监测 < 30 持续 3 秒则关阴影与泛光。
- [ ] **步骤 4：浏览器验证** — `npm run serve` 后打开 `http://localhost:5173/index.html`，看到地面与天空、无控制台报错。
- [ ] **步骤 5：Commit**

### 任务 6–14：构建器（每个任务：实现 → 浏览器截图验证 → Commit）

- [ ] **任务 6 shell.js**：楼板 `ExtrudeGeometry(Shape+holes)`，顶面用楼层地面贴图；8m 柱网（避开洞口与铺位门面）；外立面（南立面玻璃幕墙 + LED 大屏 + 商场名、其余石材 + 横向线条 + 1F 橱窗）；中庭玻璃天窗；女儿墙玻璃栏杆；洞口边玻璃栏板 + 扶手（扶梯落点处断开）。验证：全楼外观 + 2F 剖切可见中庭洞口。
- [ ] **任务 7 walls.js + storefronts.js + 招牌图集**：`unionOutline` 求铺位与用房轮廓，全层线段去重后扣除门面与门洞生成隔墙；门面为玻璃 + 竖梃 + 入口门洞；招牌图集每层一张 2048² Canvas，按品牌底色 + 字标 + 中英文店名绘制，夜间 emissive。验证：1F 俯视每个铺位有招牌。
- [ ] **任务 8 interiors.js**：按业态（jewelry/beauty/fashion/sports/cafe/restaurant/kids/books/cinema/arcade/tech/supermarket/food）生成陈设，全部写入顶点色 Batcher。
- [ ] **任务 9 rooms.js**：核心筒（不锈钢电梯门 + 楼层显示屏）、楼梯间（绿色安全出口标识）、卫生间（男/女/无障碍/母婴室隔间、洗手台、镜子、门头 WC 图标）、设备房。
- [ ] **任务 10 escalators.js + elevators.js**：扶梯桁架、玻璃栏板、黑色扶手、踏步面（上行/下行各一材质，贴图 offset 滚动）；观光梯玻璃井道 + 轿厢按楼层停靠循环。
- [ ] **任务 11 foodcourt.js**：用餐区桌椅（实例化）、中庭吊饰、老街木门脸与红灯笼、牌坊、超市货架与收银台。
- [ ] **任务 12 parking.js**：车位白线、充电位（绿）与无障碍位（蓝）、分区色柱与编号、停放车辆（实例化，约 65% 占用）、车道箭头、人行斑马线、地面坡道（敞开段 + 雨棚 + 道闸 + 限高架 + 入口/出口灯箱）、B1↔B2 坡道。
- [ ] **任务 13 roof.js**：草坪、乔木（实例化）、花境、木栈道、花架长廊、4 家餐吧玻璃亭 + 外摆遮阳伞 + 串灯、摩天轮（直径 30m，28 个轿厢，缓慢旋转，夜间灯光）、IP"云宝"雕塑、天空之镜水面、玻璃悬挑观景台、"云澜汇"立体字、花艺拱门、儿童游乐、设备区格栅、扶梯玻璃亭。
- [ ] **任务 14 site.js**：带坡道开口的地面、四周道路（车道线、斑马线）、南广场（铺装、喷泉、IP 雕塑、立牌）、行道树、路灯、公交站、周边建筑体块、四个入口雨棚与门、卸货区货车。

### 任务 15：UI 与交互

**文件：** `src/render/ui.js`、`src/shell.html`

- [ ] 楼层栏（全楼/RF…B2）、爆炸视图、动线、标注、昼夜、导览、重置按钮；右侧目录（当前楼层铺位 + 设施 + 搜索全楼），点击 `flyTo(unit)` 并高亮；悬停射线拾取显示店名/业态/铺位号；窄屏时目录收为底部抽屉。
- [ ] 浏览器验证：逐个点击楼层栏与工具栏，截图确认状态切换。
- [ ] Commit

### 任务 16：动线、行人、车辆

- [ ] flows.js：人流（青）/车流（橙）/货流（紫）带状箭头，贴图滚动；people.js：每层沿环廊与中庭回路行走的实例化行人；site/parking 中车辆沿道路与车库环线行驶。
- [ ] 验证 + Commit

### 任务 17：昼夜与性能

- [ ] 夜间：天空变暗、招牌/橱窗/路灯/摩天轮/LED 发光、泛光；低帧率自动降级。验证 + Commit

### 任务 18：一键导览

- [ ] tour.js：CatmullRom 路径（南广场 → 南门 → 中庭 → 1F→2F 扶梯 → 2F→3F 扶梯 → 3F→RF 扶梯 → 摩天轮俯瞰），可随时退出。验证 + Commit

### 任务 19：打包与整体验证

- [ ] `npm test` 全部通过；`npm run build`；分别打开 `index.html` 与 `dist/mall.html`，逐层截图（全楼、RF、3F、2F、1F、B1M、B1、B2、爆炸视图、夜景），检查控制台无报错。
- [ ] Commit

### 任务 20：发布

- [ ] 用 Artifact 发布 `dist/artifact.html`；把链接与本地文件路径告诉用户。
