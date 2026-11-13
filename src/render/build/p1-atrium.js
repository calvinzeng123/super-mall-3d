// 一期样板中庭（游览模式，布局见 layout/p1-atrium.js 和 p1-expansion-spec.js 的 ATRIUM_STEPS）。
// 照用户的预想图：四根白色树形柱从 1F 直通到光穹下面散开；每层洞口边是白色弧形栏板 + 暖光灯带 + 垂下来的绿植花槽；
// 1F 中庭地面上一座螺旋雕塑喷泉、一座叠石跌水，棕榈花池和休息沙发；中庭上空三组金色光环吊灯；两块竖向大屏。
// 跨楼层的东西（树形柱）按楼层切段画进各层自己的批次，楼层分开显示（爆炸视图、只看某层）时各段跟着自己那层走。
import * as THREE from 'three';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN, rng } from '../textures.js';
import { pointInPoly, lrectPoly, toW, toL, frame, IDENTITY, distToPolyEdge } from '../../layout/geom.js';
import clipping from 'polygon-clipping';
import { NW_FRAME, SE_FRAME, W_FRAME, MEGA_OVAL, MEGA_SKY } from '../../layout/p1-mega.js';
import { SLAB_T } from './shell.js';
import { F_SQ } from '../../layout/square.js';
import { WATERFALL, SQ_DECKS, SQ_GROUND } from '../../layout/square-atrium.js';

const sgE = new THREE.Euler(), sgQ = new THREE.Quaternion(), sgP = new THREE.Vector3(), sgS = new THREE.Vector3();
const leafE = new THREE.Euler(0, 0, 0, 'YXZ'), leafQ = new THREE.Quaternion(), leafP = new THREE.Vector3(), leafS = new THREE.Vector3();
const WHITE = '#f3f0ea', GOLD = '#c8a25a', WARM = '#ffd9a0', GOLD_LED = '#ffc675', LEAF = '#4f7f3c', LEAF2 = '#3d6a32';
const FLOWERS = ['#e58fb5', '#c96aa8', '#f2b6c8', '#a77bd1', '#f6e7a1'];

export function buildP1Atrium(ctx) {
  const lv1 = ctx.layout.levels.find((l) => l.id === 'P1-1F');
  const f = lv1?.features.find((x) => x.type === 'p1-atrium');
  if (!f || !ctx.levels['P1-1F']) return;
  const F = f.frame;
  const levels = ctx.layout.levels.filter((l) => l.building === 'P1' && l.elev >= 0).sort((a, b) => a.elev - b.elev);
  const rf = levels.find((l) => l.kind === 'roof');
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i], L = ctx.levels[lv.id];
    if (!L) continue;
    const next = levels[i + 1];
    if (lv !== rf) columnSegment(L.batch, F, f, lv.elev, next ? next.elev : lv.elev + lv.height);
    if (lv.elev > 0) balcony(ctx, L.shellBatch || L.batch, lv);
  }
  if (rf && ctx.levels[rf.id]) canopies(ctx.levels[rf.id].batch, F, f, rf.elev);
  const L1 = ctx.levels['P1-1F'];
  fountain(L1.batch, F, f.fountain, lv1.elev);
  cascade(L1.batch, F, f.cascade, lv1.elev);
  for (const p of f.palms) palm(L1.batch, F, p, lv1.elev, p.u * 7 + p.v);
  for (const s of f.lounges) lounge(L1.batch, F, s, lv1.elev);
  grandSquare(ctx, levels);
  megaAtrium(ctx, levels);
  const top = levels.find((l) => l.id === 'P1-6F');
  if (top && rf && ctx.levels[top.id]) {
    chandeliers(ctx.levels[top.id].batch, F, rf.elev);
    screens(ctx, ctx.levels[top.id], F);
  }
}

/** 树形柱的一段：白色柱身（从下往上略收），每层楼板高度一圈铜色箍和暖光；1F 柱脚一圈石材座 */
function columnSegment(B, F, f, y0, y1) {
  const r = (y) => 0.62 - 0.2 * Math.min(1, y / 34);
  B.frame(F, () => {
    for (const c of f.columns) {
      B.get('satin').cyl(c.u, y0, c.v, r((y0 + y1) / 2), y1 - y0, WHITE, 24);
      // 柱身上六条竖向凹槽（浅灰细条），看得出是做出来的造型柱
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2, rr = r((y0 + y1) / 2) + 0.005;
        B.get('satin').box(c.u + Math.cos(a) * rr, (y0 + y1) / 2, c.v + Math.sin(a) * rr, 0.05, y1 - y0, 0.05, '#d9d4ca', -a);
      }
      B.get('facadeBronze').cyl(c.u, y0 + 0.02, c.v, r(y0) + 0.06, 0.16, GOLD, 24);
      if (y0 === 0) {
        B.get('travertine').cyl(c.u, y0, c.v, 0.72, 0.42, '#e6dfd2', 24);
        B.get('glow').cyl(c.u, y0 + 0.42, c.v, 0.66, 0.03, WARM, 24);
      }
    }
  });
}

/** 柱顶在天窗里散开成十根弯肋（伞状），撑向光穹；肋下面一条暖光 */
function canopies(B, F, f, y0) {
  B.frame(F, () => {
    for (const c of f.columns) {
      B.get('satin').cyl(c.u, y0, c.v, 0.42, 3.4, WHITE, 24);
      const ribs = 10, steps = 7;
      for (let k = 0; k < ribs; k++) {
        const a = (k / ribs) * Math.PI * 2;
        let prev = null;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps, rho = 0.3 + 7 * t, y = y0 + 3.3 + 5.2 * Math.sin((t * Math.PI) / 2) - 0.6 * t * t;
          const p = { x: c.u + Math.cos(a) * rho, y, z: c.v + Math.sin(a) * rho };
          if (prev) {
            B.get('satin').bar(prev, p, 0.2 - 0.1 * t, WHITE);
            B.get('glow').bar({ ...prev, y: prev.y - 0.12 }, { ...p, y: p.y - 0.12 }, 0.035, WARM);
          }
          prev = p;
        }
        B.get('glowSoft').sphere(prev.x, prev.y, prev.z, 0.16, WARM, undefined, undefined, 'sphereLo');
      }
      // 一圈连接肋梢的细环
      for (let k = 0; k < 20; k++) {
        const a0 = (k / 20) * Math.PI * 2, a1 = ((k + 1) / 20) * Math.PI * 2, rho = 4.6, y = y0 + 3.3 + 5.2 * Math.sin(((4.3 / 7) * Math.PI) / 2) - 0.6 * (4.3 / 7) ** 2;
        B.get('satin').bar({ x: c.u + Math.cos(a0) * rho, y, z: c.v + Math.sin(a0) * rho }, { x: c.u + Math.cos(a1) * rho, y, z: c.v + Math.sin(a1) * rho }, 0.08, WHITE);
      }
    }
  });
}

/** 一层洞口边：白色弧形栏板（盖住楼板边）+ 底边暖光灯带 + 外挂花槽和垂下来的藤蔓、花。扶梯口、观光梯门前不挂花槽。 */
function balcony(ctx, B, lv) {
  for (const v of lv.voids.filter((x) => /^(C-void|SQ-void|SQ-sky|MEGA-void)/.test(x.id))) balconyEdge(ctx, B, lv, v);
}

function balconyEdge(ctx, B, lv, v) {
  const gaps = [];
  for (const e of ctx.layout.escalators) for (const end of [[e.top, e.to], [e.bottom, e.from]]) if (end[1] === lv.id) gaps.push([end[0].x, end[0].z, 4.2]);
  for (const g of ctx.layout.elevators) if (g.type === 'glass' && g.serves.includes(lv.id)) { const [x, z] = toW(g.frame, g.lu, g.lv); gaps.push([x, z, 3]); }
  const skip = (x, z) => gaps.some(([gx, gz, r]) => Math.hypot(x - gx, z - gz) < r);
  const inUnit = (x, z) => lv.units.some((u) => u.polys.some((q) => pointInPoly([x, z], q))) || lv.voids.some((q) => pointInPoly([x, z], q.poly));
  const fall = [toW(F_SQ, WATERFALL.x, WATERFALL.z0), toW(F_SQ, WATERFALL.x, WATERFALL.z1)];
  const nearFall = (x, z) => (v.id === 'SQ-void' || v.square) && Math.abs(x - fall[0][0]) < 2 && z > Math.min(fall[0][1], fall[1][1]) - 1.5 && z < Math.max(fall[0][1], fall[1][1]) + 1.5;
  const rand = rng(lv.elev * 13 + 7 + v.poly.length), P = v.poly, y = lv.elev, roof = lv.kind === 'roof';
  for (let i = 0; i < P.length; i++) {
    const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length], len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) continue;
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    // 朝洞口那一侧的法向
    let nx = -uz, nz = ux;
    if (!pointInPoly([(x0 + x1) / 2 + nx * 0.3, (z0 + z1) / 2 + nz * 0.3], P)) { nx = -nx; nz = -nz; }
    const ang = Math.atan2(-uz, ux), n = Math.max(1, Math.ceil(len / 1.6));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, mx = x0 + (x1 - x0) * t, mz = z0 + (z1 - z0) * t, pl = len / n + 0.03;
      // 栏板：楼板边包一圈白色弧面（0.9 米高），底下一条暖光
      B.get('satin').box(mx + nx * 0.1, y - 0.42, mz + nz * 0.1, pl, 0.88, 0.16, WHITE, ang);
      // 栏板下沿的暖金色灯带（效果图里每层一圈金色光带）：外侧一条 9 厘米高的灯带，底面一条朝下的灯槽
      B.get('glow').box(mx + nx * 0.19, y - 0.79, mz + nz * 0.19, pl, 0.09, 0.03, GOLD_LED, ang);
      B.get('glow').box(mx + nx * 0.1, y - 0.865, mz + nz * 0.1, pl, 0.012, 0.1, WARM, ang);
      // 夜里栏板里的上照灯把洞口边往里 2.5 米的天花洗亮一条（贴花，越往里越暗），天花不再整片一样亮
      if (!roof) B.ceilPool(mx - nx * 1.1, y - (SLAB_T[lv.kind] ?? 0.45), mz - nz * 1.1, pl + 0.4, 2.6, 0xffc27a, ang);
      // 地面上一条跟着栏板走的暖光线（离栏板 2.2 米），扶梯口、观光梯门前、铺位里不画
      const gx = mx - nx * 2.2, gz = mz - nz * 2.2;
      if (!roof && v.mega && !skip(gx, gz) && !inUnit(gx, gz)) B.get('glowSoft').box(gx, y + 0.008, gz, pl, 0.006, 0.045, '#ffe6bf', ang);
      if (roof || skip(mx, mz) || nearFall(mx, mz)) continue;
      // 花槽挂在栏板外侧：浅色槽身、上面一排鼓起来的灌木团，几串小叶子垂下来，偶尔开花
      B.get('matte').box(mx + nx * 0.34, y - 0.2, mz + nz * 0.34, pl, 0.26, 0.28, '#ece8df', ang);
      // 花槽里的灌木：五小团深浅不一的绿（原来三大团深绿多面体，远看像一排石块）
      for (let q = 0; q < 5; q++) {
        const s = (q - 2) * pl * 0.2 + (rand() - 0.5) * 0.15, rr = 0.17 + rand() * 0.07;
        B.get('foliage').sphere(mx + ux * s + nx * (0.32 + rand() * 0.08), y - 0.04 + rand() * 0.08, mz + uz * s + nz * (0.32 + rand() * 0.08), rr,
          ['#5f9447', '#4f7f3c', '#76a85a', '#6a9a4c'][Math.floor(rand() * 4)], rr * 0.7, rr * 0.85, 'ico0');
      }
      const vines = rand() < 0.35 ? 0 : 1 + Math.floor(rand() * 2);
      for (let q = 0; q < vines; q++) {
        const s = (rand() - 0.5) * pl * 0.9, L = 0.5 + rand() * (lv.height > 5 ? 1.7 : 1.2), sway = (rand() - 0.5) * 0.25;
        // 一串串垂下来的藤叶：每一节左右两片小叶，随机偏转、略微下垂（原来是一串小球，远看像珠帘）
        for (let d = 0.1; d < L; d += 0.17) {
          const t = d / L, jx = Math.sin(d * 7 + s * 3) * 0.05, lx = mx + ux * (s + jx + sway * t) + nx * (0.47 + t * 0.06), lz = mz + uz * (s + jx + sway * t) + nz * (0.47 + t * 0.06);
          for (const side of [1, -1]) {
            const yaw = Math.atan2(-uz, ux) + side * (0.6 + rand() * 0.5);
            leafE.set(-0.35 - rand() * 0.4, yaw, side * 0.3); leafQ.setFromEuler(leafE);
            leafP.set(lx + ux * side * 0.045, y - 0.3 - d - (side > 0 ? 0 : 0.07), lz + uz * side * 0.045);
            leafS.set(0.13 - 0.04 * t, 0.012, 0.075 - 0.02 * t);
            B.get('foliage').shape('box', leafP, leafQ, leafS, rand() < 0.5 ? '#5f9447' : (rand() < 0.5 ? '#4a803c' : '#76a85a'));
          }
        }
      }
      if (rand() < 0.5) for (let q = 0; q < 3; q++) {
        const s = (rand() - 0.5) * pl * 0.85;
        B.get('foliage').sphere(mx + ux * s + nx * (0.3 + rand() * 0.15), y + 0.1, mz + uz * s + nz * (0.3 + rand() * 0.15), 0.09 + rand() * 0.04, FLOWERS[Math.floor(rand() * FLOWERS.length)], undefined, undefined, 'ico0');
      }
    }
  }
}

/** 螺旋雕塑喷泉：石材池沿、水面、两条绕着上升的金色/白色缎带（9 米高），一圈水柱拱向中间 */
function fountain(B, F, p, y0) {
  B.frame(F, () => {
    const { u, v, r } = p, Hs = p.H || 9;
    B.get('travertine').cyl(u, y0, v, r, 0.55, '#e8e1d4', 48);
    B.get('satin').cyl(u, y0 + 0.55, v, r + 0.05, 0.06, '#f6f3ec', 48);
    B.get('water').cyl(u, y0 + 0.02, v, r - 0.25, 0.46, '#3f86a6', 48);
    B.get('travertine').cyl(u, y0, v, 1.1, 0.75, '#ddd4c4', 32);
    // 两条缎带：从底座盘旋到 9 米，半径从 1.3 收到 0.5
    const H = Hs, turns = 2.2 * Hs / 9;
    for (const [phase, color, key] of [[0, GOLD, 'facadeBronze'], [Math.PI, '#eef1f2', 'metal']]) {
      let prev = null;
      for (let s = 0; s <= 64; s++) {
        const t = s / 64, a = phase + t * turns * Math.PI * 2, rad = 1.3 - 0.8 * t;
        const q = { x: u + Math.cos(a) * rad, y: y0 + 0.75 + t * H, z: v + Math.sin(a) * rad };
        if (prev) B.get(key).bar(prev, q, 0.22 - 0.1 * t, color);
        prev = q;
      }
    }
    B.get('glowSoft').sphere(u, y0 + 0.75 + H + 0.3, v, 0.28, WARM, undefined, undefined, 'sphereLo');
    // 中间一根细水柱，池边 16 道水弧
    B.get('glowSoft').cyl(u, y0 + 0.75, v, 0.06, 4.2, '#e6f5fa', 10);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      let prev = null;
      for (let s = 0; s <= 6; s++) {
        const t = s / 6, rad = (r - 0.35) * (1 - t * 0.55), q = { x: u + Math.cos(a) * rad, y: y0 + 0.5 + 2.2 * 4 * t * (1 - t) * 0.6, z: v + Math.sin(a) * rad };
        if (prev) B.get('glowSoft').bar(prev, q, 0.045, '#e6f5fa');
        prev = q;
      }
    }
    // 池边一圈花
    const rand = rng(41);
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      B.get('foliage').sphere(u + Math.cos(a) * (r - 0.15), y0 + 0.66, v + Math.sin(a) * (r - 0.15), 0.16, rand() < 0.4 ? LEAF : FLOWERS[k % FLOWERS.length], undefined, undefined, 'sphereLo');
    }
  });
}

/** 叠石跌水：椭圆水池，后半边叠起来的石头（3 米高），三道白色水帘落进池里，池边花草 */
function cascade(B, F, p, y0) {
  B.frame(F, () => {
    const { u, v, rx, rz } = p, rand = rng(77);
    B.get('travertine').sphere(u, y0 + 0.2, v, rx, '#d8cfbf', 0.4, rz, 'sphereLo');
    B.get('water').sphere(u, y0 + 0.36, v, rx - 0.35, '#3a7f9b', 0.12, rz - 0.35, 'sphereLo');
    // 石头堆在远离中庭中心的一侧（v 更负）
    const back = v - rz * 0.45;
    for (let k = 0; k < 26; k++) {
      const s = (rand() - 0.5) * rx * 1.6, h = rand();
      B.get('matte').sphere(u + s, y0 + 0.4 + h * 2.6 * (1 - Math.abs(s) / (rx * 0.9)), back - rand() * 1.2, 0.6 + rand() * 0.6, rand() < 0.5 ? '#8c8579' : '#a39b8c', 0.45 + rand() * 0.35, 0.55 + rand() * 0.3, 'sphereLo');
    }
    for (const s of [-1.6, 0, 1.6]) {
      const top = y0 + 2.4 - Math.abs(s) * 0.5;
      B.get('glowSoft').box(u + s, (top + y0 + 0.4) / 2, back + 0.55, 0.9, top - y0 - 0.4, 0.04, '#e8f4f6');
      B.get('glowSoft').sphere(u + s, y0 + 0.42, back + 0.8, 0.5, '#f4fbfc', 0.08, 0.35, 'sphereLo');
    }
    for (let k = 0; k < 34; k++) {
      const a = Math.PI * 0.05 + (k / 34) * Math.PI * 0.9;
      B.get('foliage').sphere(u + Math.cos(a) * (rx - 0.1), y0 + 0.45, v + Math.sin(a) * (rz - 0.1), 0.18, rand() < 0.45 ? LEAF : FLOWERS[k % FLOWERS.length], undefined, undefined, 'sphereLo');
    }
  });
}

/** 棕榈花池：圆形花池 + 微弯的树干 + 一圈下垂的叶 */
function palm(B, F, p, y0, seed) {
  const rand = rng(Math.abs(Math.round(seed * 97)) + 3);
  B.frame(F, () => {
    const { u, v, r } = p;
    B.get('travertine').cyl(u, y0, v, r, 0.5, '#e6dfd2', 32);
    B.get('foliage').cyl(u, y0 + 0.5, v, r - 0.08, 0.06, '#5a4632', 32);
    for (let k = 0; k < 14; k++) {
      const a = rand() * Math.PI * 2, d = rand() * (r - 0.3);
      B.get('foliage').sphere(u + Math.cos(a) * d, y0 + 0.62, v + Math.sin(a) * d, 0.16, rand() < 0.5 ? LEAF : FLOWERS[k % FLOWERS.length], undefined, undefined, 'sphereLo');
    }
    const H = 5.5 + rand() * 1.8, lean = (rand() - 0.5) * 0.5, la = rand() * Math.PI * 2;
    let prev = { x: u, y: y0 + 0.55, z: v };
    for (let s = 1; s <= 8; s++) {
      const t = s / 8, q = { x: u + Math.cos(la) * lean * t * t, y: y0 + 0.55 + H * t, z: v + Math.sin(la) * lean * t * t };
      B.get('wood').bar(prev, q, 0.24 - 0.08 * t, '#8a7259');
      prev = q;
    }
    // 棕榈叶：一根细叶轴，两侧一排排往下垂的小叶（羽状），不是一根粗方条
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + rand() * 0.3, len = 2.4 + rand() * 0.9, col = k % 2 ? LEAF : LEAF2;
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
      let fp = prev;
      for (let s = 1; s <= 8; s++) {
        const t = s / 8, q = { x: prev.x + ca * len * t, y: prev.y + 0.6 * t - 1.6 * t * t, z: prev.z + sa * len * t };
        B.get('foliage').bar(fp, q, 0.06, col);
        if (s > 1) {
          const ll = 0.75 * (1 - t * 0.55);
          for (const side of [1, -1]) B.get('foliage').bar(q, { x: q.x + (px * side * 0.9 + ca * 0.35) * ll, y: q.y - 0.32 * ll, z: q.z + (pz * side * 0.9 + sa * 0.35) * ll }, 0.07, col);
        }
        fp = q;
      }
    }
  });
}

/** 休息区：一张浅色长沙发 + 两张单人椅 + 圆茶几（贴图模型；没有就画简单的） */
function lounge(B, F, s, y0) {
  B.frame(F, () => {
    const face = s.v > 0 ? Math.PI : 0; // 面朝喷泉/跌水那一侧
    B.blob(s.u, y0, s.v, s.d + 0.6, s.w + 0.6);
    B.get('matte').box(s.u, y0 + 0.01, s.v, s.d + 0.4, 0.02, s.w + 0.4, '#d9cdb8');
    if (!B.prop('sofa3', s.u, y0, s.v, face + Math.PI / 2)) B.get('matte').box(s.u, y0 + 0.4, s.v, 0.9, 0.8, 2.4, '#e9e3d6');
    B.prop('coffee_table_round', s.u + (s.v > 0 ? 1 : -1) * 0, y0, s.v + (s.v > 0 ? -1.2 : 1.2), 0);
    B.prop('plant_tall', s.u - 0.6, y0, s.v + (s.v > 0 ? 1.6 : -1.6), 0, 0.9);
    // 效果图里沙发边上那种金色高花瓶插一大捧粉花：地毯两个外角各一只
    const sv = s.v > 0 ? 1 : -1;
    flowerUrn(B, s.u + 0.85, s.v - sv * 1.7, y0, Math.round(Math.abs(s.u * 13 + s.v * 7)));
    flowerUrn(B, s.u + 0.85, s.v + sv * 1.75, y0, Math.round(Math.abs(s.u * 7 + s.v * 13)) + 5);
  });
}

/** 金色花瓶 + 一大捧花（粉、玫红、白，底下一圈叶子）：瓶身鼓肚、细颈、外翻口，花团是半球上攒很多小花球 */
function flowerUrn(B, x, z, y0, seed) {
  const rand = rng(seed + 11);
  B.get('facadeBronze').cyl(x, y0, z, 0.2, 0.08, GOLD, 16);
  B.get('facadeBronze').sphere(x, y0 + 0.42, z, 0.27, GOLD, 0.36, 0.27);
  B.get('facadeBronze').cyl(x, y0 + 0.72, z, 0.15, 0.12, GOLD, 16);
  B.get('facadeBronze').cyl(x, y0 + 0.84, z, 0.24, 0.05, GOLD, 16);
  const cy = y0 + 0.92, pinks = ['#f0a6c4', '#e27aa6', '#f7d2df', '#fbeef2', '#d9649a'];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rand() * 0.3;
    B.get('foliage').sphere(x + Math.cos(a) * 0.36, cy + 0.02, z + Math.sin(a) * 0.36, 0.13, k % 2 ? LEAF : LEAF2, 0.07, 0.13, 'sphereLo');
  }
  for (let k = 0; k < 34; k++) {
    // 半球面上均匀撒点（高度均匀 → 面积均匀）
    const h = rand(), a = rand() * Math.PI * 2, rr = Math.sqrt(1 - h * h) * 0.42;
    B.get('foliage').sphere(x + Math.cos(a) * rr, cy + 0.06 + h * 0.4, z + Math.sin(a) * rr, 0.08 + rand() * 0.04, pinks[k % pinks.length], undefined, undefined, 'ico0');
  }
}

/** 三组金色光环吊灯：中庭正中一组三环，两部观光梯前各一组两环；细吊索挂到光穹里 */
function chandeliers(B, F, roofY) {
  B.frame(F, () => {
    const ring = (u, v, R, y) => {
      const n = Math.max(24, Math.round(R * 8));
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
        const p = { x: u + Math.cos(a0) * R, y, z: v + Math.sin(a0) * R }, q = { x: u + Math.cos(a1) * R, y, z: v + Math.sin(a1) * R };
        B.get('facadeBronze').bar(p, q, 0.16, GOLD);
        B.get('glow').bar({ ...p, y: y - 0.1 }, { ...q, y: y - 0.1 }, 0.06, WARM);
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        B.get('metal').bar({ x: u + Math.cos(a) * R, y, z: v + Math.sin(a) * R }, { x: u + Math.cos(a) * R * 0.2, y: roofY + 7, z: v + Math.sin(a) * R * 0.2 }, 0.012, '#9aa0a6');
      }
    };
    ring(0, 0, 6, roofY - 2.2); ring(0, 0, 4.3, roofY - 4.4); ring(0, 0, 2.7, roofY - 6.2);
    for (const u of [-10.5, 10.5]) { ring(u, 0, 2.6, roofY - 3.2); ring(u, 0, 1.6, roofY - 4.8); }
  });
}

/** 两块竖向大屏：挂在 4F–6F 的洞口长边前，面朝中庭中心 */
function screens(ctx, L, F) {
  const tex = screenTexture(ctx);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true });
  mat.color.setScalar(1.25);
  for (const side of [1, -1]) {
    const w = 4.2, h = 11.6, v = side * 12.6, yMid = 18.8 + h / 2;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const [x, z] = toW(F, 0, v);
    mesh.position.set(x, yMid, z);
    // 面朝圆心：平面法线是 +z，转到指向 (−v) 方向
    const [cx, cz] = toW(F, 0, 0);
    mesh.rotation.y = Math.atan2(cx - x, cz - z);
    mesh.name = 'P1-atrium-screen';
    L.base.add(mesh);
    // 背面也是同一张画面（从对面楼层看过来不是一块黑板），四周一圈白色边框
    const rear = mesh.clone(); rear.rotation.y += Math.PI;
    rear.position.add(new THREE.Vector3(Math.sin(mesh.rotation.y), 0, Math.cos(mesh.rotation.y)).multiplyScalar(-0.12));
    L.base.add(rear);
    L.batch.frame(F, () => {
      const sv = v - side * 0.06;
      for (const du of [-(w / 2 + 0.08), w / 2 + 0.08]) L.batch.get('satin').box(du, yMid, sv, 0.16, h + 0.32, 0.2, WHITE);
      for (const dy of [-(h / 2 + 0.08), h / 2 + 0.08]) L.batch.get('satin').box(0, yMid + dy, sv, w + 0.32, 0.16, 0.2, WHITE);
    });
    // 吊杆
    L.batch.frame(F, () => { for (const du of [-1.6, 1.6]) L.batch.get('metal').box(du, yMid + h / 2 + 1.4, v, 0.05, 2.8, 0.05, '#9aa0a6'); });
  }
}

function screenTexture(ctx) {
  if (ctx.p1AtriumScreen) return ctx.p1AtriumScreen;
  const c = makeCanvas(384, 1056), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#1a2a5e'); grad.addColorStop(0.55, '#5a3f8c'); grad.addColorStop(1, '#e48fb0');
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  // 城市天际线剪影 + 窗灯
  const rand = rng(5);
  g.fillStyle = '#16183a';
  let x = 0;
  while (x < c.width) {
    const w = 18 + rand() * 30, h = 160 + rand() * 340;
    g.fillRect(x, c.height - h, w, h);
    g.fillStyle = 'rgba(255,214,150,0.75)';
    for (let yy = c.height - h + 10; yy < c.height - 8; yy += 12) for (let xx = x + 3; xx < x + w - 4; xx += 7) if (rand() < 0.45) g.fillRect(xx, yy, 3, 5);
    g.fillStyle = '#16183a';
    x += w + 2;
  }
  g.fillStyle = '#ffffff'; g.textAlign = 'center';
  g.font = `600 92px ${FONT_CN}`; g.fillText('云澜汇', c.width / 2, 190);
  g.font = `500 34px ${FONT_EN}`; g.fillText('YUNLAN  MALL', c.width / 2, 245);
  g.font = `400 30px ${FONT_CN}`; g.fillText('城市客厅 · 光影中庭', c.width / 2, 320);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(c.width / 2 - 60, 345, 120, 3);
  return (ctx.p1AtriumScreen = canvasTexture(c, { clamp: true }));
}

// ---------------- 云澜大中庭第一轮：方庭 ----------------
/** 方庭大中庭：大瀑布（按楼层切段的落水面 + 顶上的出水口 + 1F 水池和水雾）、各层玻璃观景台、两组光环吊灯、水池边的棕榈 */
function grandSquare(ctx, levels) {
  const lv1 = levels.find((l) => l.id === 'P1-1F'), rf = levels.find((l) => l.kind === 'roof');
  if (!lv1?.voids.some((v) => v.id === 'SQ-void') || !rf) return;
  const water = waterMaterial(ctx);
  const W = WATERFALL, width = W.z1 - W.z0, cz = (W.z0 + W.z1) / 2;
  const topY = rf.elev - 0.5;
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i], L = ctx.levels[lv.id];
    if (!L || lv.kind === 'roof') continue;
    // 这一层高度范围里的那一段落水（两层：前面一层快、后面一层慢，看起来有厚度）
    const y0 = lv.id === 'P1-1F' ? lv.elev + 0.45 : lv.elev, y1 = Math.min(topY, levels[i + 1]?.elev ?? topY);
    if (y1 <= y0) continue;
    for (const [dx, mat] of [[0, water.front], [-0.35, water.back]]) {
      const g = new THREE.PlaneGeometry(width, y1 - y0);
      // 贴图按世界高度对齐，各段接得上
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, (uv.getY(k) * (y1 - y0) + y0) / 6);
      const m = new THREE.Mesh(g, mat);
      const [x, z] = toW(F_SQ, W.x + dx, cz);
      m.position.set(x, (y0 + y1) / 2, z);
      m.rotation.y = Math.PI / 2; // 面朝 +x（中庭）
      m.name = 'P1-SQ-waterfall'; m.renderOrder = 3;
      L.base.add(m);
    }
    // 每层楼板边上一道横向的出水石檐（水好像从每层溢下来）
    if (lv.id !== 'P1-1F') L.batch.frame(F_SQ, () => {
      L.batch.get('travertine').box(W.x - 0.25, lv.elev - 0.35, cz, 0.7, 0.5, width + 0.8, '#d9d0bf');
      L.batch.get('glowSoft').box(W.x + 0.12, lv.elev - 0.62, cz, 0.06, 0.06, width, '#dff3fa');
    });
  }
  const R = ctx.levels[rf.id];
  // 顶上的出水口：天台楼板下面一道铜色水槽
  R.batch.frame(F_SQ, () => {
    R.batch.get('facadeBronze').box(W.x - 0.4, rf.elev - 0.45, cz, 1.2, 0.7, width + 1.4, GOLD);
    R.batch.get('glow').box(W.x + 0.22, rf.elev - 0.82, cz, 0.05, 0.05, width + 1.2, WARM);
  });
  // 1F 水池：石沿、水面、溅起的水雾
  const L1 = ctx.levels[lv1.id], B = L1.batch, p = W.pool, rand = rng(9);
  B.frame(F_SQ, () => {
    const cx = (p.x0 + p.x1) / 2, pw = p.x1 - p.x0, pd = p.z1 - p.z0;
    B.get('travertine').box(cx, 0.28, cz, pw, 0.56, pd, '#e6dfd2');
    B.get('water').box(cx, 0.5, cz, pw - 0.6, 0.1, pd - 0.6, '#3c88a8');
    // 落水处一条白色水花带 + 往外散的几圈波纹（扁平的，不是一团团的球）
    B.get('glowSoft').box(W.x + 0.7, 0.57, cz, 1.4, 0.05, width, '#f2fafc');
    for (let k = 0; k < 3; k++) B.get('glowSoft').box(W.x + 2.2 + k * 1.6, 0.56, cz, 0.12, 0.02, width * (0.92 - k * 0.12), '#d9eef5');
    for (let k = 0; k < 24; k++) B.get('glowSoft').box(W.x + 0.4 + rand() * 1.2, 0.6 + rand() * 0.25, W.z0 + rand() * width, 0.25, 0.05, 0.25, '#ffffff');
    for (let k = 0; k < 30; k++) {
      const z = p.z0 + 0.2 + rand() * (pd - 0.4);
      B.get('foliage').sphere(p.x1 - 0.25, 0.62, z, 0.18, rand() < 0.4 ? LEAF : FLOWERS[k % FLOWERS.length], undefined, undefined, 'sphereLo');
    }
  });
  for (const [u, v] of [[-28, -14], [-28, 14], [-16, -16], [-16, 16]]) palm(B, F_SQ, { u, v, r: 1.4 }, lv1.elev, u * 3 + v);
  // 中轴花坛：石材池边、灌木团、花，每个花坛中间一棵小树
  const rb = rng(55);
  B.frame(F_SQ, () => {
    for (const r of SQ_GROUND.beds) {
      const cx = (r.x0 + r.x1) / 2, czb = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
      B.get('travertine').box(cx, 0.25, czb, w, 0.5, d, '#e6dfd2');
      B.get('foliage').box(cx, 0.52, czb, w - 0.3, 0.06, d - 0.3, '#5a4632');
      for (let k = 0; k < 16; k++) B.get('foliage').sphere(r.x0 + 0.4 + rb() * (w - 0.8), 0.7, r.z0 + 0.4 + rb() * (d - 0.8), 0.28 + rb() * 0.12, k % 3 ? (rb() < 0.5 ? LEAF : LEAF2) : FLOWERS[k % FLOWERS.length], undefined, undefined, 'sphereLo');
    }
  });
  for (const r of SQ_GROUND.beds) B.prop('plant_tall', (r.x0 + r.x1) / 2, lv1.elev + 0.5, (r.z0 + r.z1) / 2, 0, 1.3);
  // 咖啡外摆：一个小吧台 + 四张圆桌、每张配椅子和遮阳伞
  for (const r of SQ_GROUND.cafes) cafe(B, r, lv1.elev);
  // 各层玻璃观景台：玻璃地板、三边暖光、一对望远镜
  for (const lv of levels) {
    const d = SQ_DECKS[lv.short], L = ctx.levels[lv.id];
    if (!d || !L) continue;
    const Bd = L.batch, y = lv.elev, cx = (d.x0 + d.x1) / 2, czd = (d.z0 + d.z1) / 2, w = d.x1 - d.x0, dd = d.z1 - d.z0;
    const out = czd > 0 ? -1 : 1; // 观景台伸向 z=0 的那一边
    Bd.frame(F_SQ, () => {
      Bd.get('glass').box(cx, y + 0.03, czd, w - 0.1, 0.04, dd - 0.1, '#bfe6ef');
      Bd.get('satin').box(cx, y - 0.25, czd, w, 0.5, dd, WHITE);
      Bd.get('glow').box(cx, y - 0.5, out > 0 ? d.z1 : d.z0, w, 0.05, 0.05, WARM);
      for (const x of [d.x0, d.x1]) Bd.get('glow').box(x, y - 0.5, czd, 0.05, 0.05, dd, WARM);
      for (const k of [-1, 1]) {
        const bx = cx + k * 1.2, bz = (out > 0 ? d.z1 : d.z0) - out * 0.8;
        Bd.get('metal').cyl(bx, y, bz, 0.06, 1.1, '#6d7276', 10);
        Bd.get('metal').box(bx, y + 1.18, bz, 0.22, 0.16, 0.42, '#3d4246');
      }
    });
  }
  // 两组光环吊灯，挂在方庭玻璃天幕下面
  const top = levels.find((l) => l.id === 'P1-6F');
  if (top && ctx.levels[top.id]) {
    const Bt = ctx.levels[top.id].batch;
    Bt.frame(F_SQ, () => {
      for (const [u, R0] of [[-14, 7], [6, 5]]) for (const [k, y] of [[1, rf.elev - 2.4], [0.7, rf.elev - 4.6], [0.42, rf.elev - 6.6]]) {
        const Rr = R0 * k, n = Math.round(Rr * 8);
        for (let j = 0; j < n; j++) {
          const a0 = (j / n) * Math.PI * 2, a1 = ((j + 1) / n) * Math.PI * 2;
          const p0 = { x: u + Math.cos(a0) * Rr, y, z: Math.sin(a0) * Rr }, p1 = { x: u + Math.cos(a1) * Rr, y, z: Math.sin(a1) * Rr };
          Bt.get('facadeBronze').bar(p0, p1, 0.16, GOLD);
          Bt.get('glow').bar({ ...p0, y: y - 0.1 }, { ...p1, y: y - 0.1 }, 0.06, WARM);
        }
        if (k === 1) for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2 + 0.3; Bt.get('metal').bar({ x: u + Math.cos(a) * Rr, y, z: Math.sin(a) * Rr }, { x: u, y: rf.elev + 8, z: 0 }, 0.012, '#9aa0a6'); }
      }
    });
  }
}

/** 落水的材质：竖向水纹贴图往下流（每帧挪贴图），前后两层速度不同 */
function waterMaterial(ctx) {
  if (ctx.p1Waterfall) return ctx.p1Waterfall;
  const c = makeCanvas(256, 512), g = c.getContext('2d'), rand = rng(31);
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    const x = rand() * c.width, w = 1 + rand() * 4, y = rand() * c.height, h = 40 + rand() * 260, a = 0.25 + rand() * 0.55;
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, `rgba(235,248,252,0)`); grad.addColorStop(0.5, `rgba(235,248,252,${a})`); grad.addColorStop(1, `rgba(235,248,252,0)`);
    g.fillStyle = grad; g.fillRect(x, y, w, h); g.fillRect(x, y - c.height, w, h);
  }
  const make = (opacity) => {
    const tex = canvasTexture(c, { repeat: 1 });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 1);
    return new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.15, 1.25, 1.3), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: true });
  };
  const front = make(0.85), back = make(0.55);
  ctx.dynamic?.push({ name: 'p1-waterfall', update(dt) { front.map.offset.y += dt * 0.9; back.map.offset.y += dt * 0.6; } });
  return (ctx.p1Waterfall = { front, back });
}

/** 中庭里的咖啡外摆（方庭局部坐标的一块矩形）：小吧台、木地台、四张圆桌带椅子和伞 */
function cafe(B, r, y0, F = F_SQ) {
  B.frame(F, () => {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
    B.get('wood').box(cx, y0 + 0.04, cz, w, 0.08, d, '#b08b62');
    // 吧台靠一端
    B.get('satin').box(r.x0 + 0.8, y0 + 0.55, cz, 1.0, 1.1, Math.min(2.6, d - 0.6), '#f2ece2');
    B.get('wood').box(r.x0 + 0.8, y0 + 1.13, cz, 1.2, 0.06, Math.min(2.8, d - 0.4), '#8a6a48');
    B.get('glow').box(r.x0 + 0.27, y0 + 0.3, cz, 0.03, 0.05, Math.min(2.4, d - 0.8), WARM);
    for (const [fx, fz] of [[0.35, 0.28], [0.75, 0.28], [0.35, 0.72], [0.75, 0.72]]) {
      const x = r.x0 + 1.6 + (w - 2.2) * fx, z = r.z0 + d * fz;
      if (!B.prop('cafe_table_round', x, y0 + 0.08, z, 0)) B.get('wood').cyl(x, y0 + 0.08, z, 0.4, 0.74, '#7a5a3c', 12);
      for (const a of [0, Math.PI]) B.prop('cafe_chair', x + Math.cos(a) * 0.75, y0 + 0.08, z + Math.sin(a) * 0.75, a + Math.PI / 2);
      B.get('metal').cyl(x, y0 + 0.08, z, 0.03, 2.3, '#6d7276', 8);
      B.get('matte').cone(x, y0 + 2.1, z, 1.15, 0.45, ['#f3ead9', '#e7d3b0', '#d9e4dc'][Math.round(fx * 10 + fz * 10) % 3], 10);
    }
    // 串灯：外摆四角各一根细灯杆（3 米），四边和两条对角拉一串下垂的暖色小灯泡（伞顶之上）
    const top = y0 + 3.0, corners = [[r.x0 + 0.1, r.z0 + 0.1], [r.x1 - 0.1, r.z0 + 0.1], [r.x1 - 0.1, r.z1 - 0.1], [r.x0 + 0.1, r.z1 - 0.1]];
    for (const [px, pz] of corners) { B.get('metal').cyl(px, y0 + 0.08, pz, 0.025, top - y0 - 0.08, '#2f3336', 6); B.get('glow').sphere(px, top + 0.03, pz, 0.09, WARM, undefined, undefined, 'sphereLo'); }
    const strings = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]];
    for (const [i, j] of strings) {
      const [ax, az] = corners[i], [bx, bz] = corners[j], len = Math.hypot(bx - ax, bz - az), n = Math.max(4, Math.round(len / 0.45));
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const t = k / n, sag = 0.45 * 4 * t * (1 - t) * Math.min(1, len / 6);
        const pt = { x: ax + (bx - ax) * t, y: top - sag, z: az + (bz - az) * t };
        if (prev) B.get('metal').bar(prev, pt, 0.008, '#2f3336');
        if (k > 0 && k < n) B.get('glow').sphere(pt.x, pt.y - 0.06, pt.z, 0.075, '#ffe0a8', undefined, undefined, 'sphereLo');
        prev = pt;
      }
    }
  });
}

// ---------------- 超级商业中心：西北翼大中庭（布局见 layout/p1-mega.js） ----------------
/** 1F 中庭广场：两座金色螺旋喷泉（大的 12 米）、一圈棕榈和樱花树池、喷泉外两道金色地面圆环；
 *  大椭圆上空（6F 往上）三组金色光环吊灯。 */
function megaAtrium(ctx, levels) {
  const M = ctx.layout.fidelity?.mega, D = ctx.layout.fidelity?.landscape;
  const L1 = ctx.levels['P1-1F'], lv1 = levels.find((l) => l.id === 'P1-1F');
  if (!M || !L1 || !lv1) return;
  const B = L1.batch, y0 = lv1.elev;
  for (const f of (D?.fountains || []).filter((q) => q.indoor)) {
    fountain(B, IDENTITY, { u: f.x, v: f.z, r: f.r - 0.4, H: f.r >= 6 ? 12 : 9 }, y0);
    for (const [R, w] of [[f.r + 1.2, 0.14], [f.r + 2.2, 0.08]]) floorRing(B, f.x, f.z, R, w, y0);
  }
  floorInlay(ctx, B, lv1, y0, (D?.fountains || []).filter((q) => q.indoor));
  plazaPendants(ctx, lv1);
  plazaBaffles(ctx, lv1);
  // 新楼面天花：沿西北翼方向的暖光灯带（3 米一条，6 米一行），只挂在头顶真有楼板的地方
  for (let i = 0; i < levels.length - 1; i++) {
    const lv = levels[i], up = levels[i + 1], L = ctx.levels[lv.id];
    if (!L || !/^[1-6]F$/.test(lv.short)) continue;
    const y = up.elev - (SLAB_T[up.kind] ?? 0.45) - 0.03, walks = lv.walk.filter((w) => w.mega);
    const holes = up.voids.map((v) => v.poly);
    for (let u = 20; u <= 130; u += 6) for (let v = -80; v <= 80; v += 6) {
      const [x, z] = toW(NW_FRAME, u, v);
      if (!walks.some((w) => pointInPoly([x, z], w.poly)) || holes.some((h) => pointInPoly([x, z], h))) continue;
      const a = toW(NW_FRAME, u - 1.5, v), b = toW(NW_FRAME, u + 1.5, v);
      if (holes.some((h) => pointInPoly(a, h) || pointInPoly(b, h))) continue;
      L.batch.get('glowSoft').bar({ x: a[0], y, z: a[1] }, { x: b[0], y, z: b[1] }, 0.09, '#ffe2b8');
    }
  }
  // 店面溢光：每家店门脸外面地上一片暖光（贴花，不加实时光源），让走道地面像效果图那样被店里的灯照亮
  for (const lv of levels.filter((l) => /^[1-6]F$/.test(l.short))) {
    const L = ctx.levels[lv.id];
    if (!L) continue;
    const holes = lv.voids.map((v) => v.poly), pots = [];
    for (const u of lv.units) for (const f of u.wfronts || []) {
      const dx = f.x1 - f.x0, dz = f.z1 - f.z0, len = Math.hypot(dx, dz);
      if (len < 2 || f.nx === undefined) continue;
      const cx = (f.x0 + f.x1) / 2 + f.nx * 1.9, cz = (f.z0 + f.z1) / 2 + f.nz * 1.9;
      if (holes.some((h) => pointInPoly([cx, cz], h)) || !lv.walk.some((w) => pointInPoly([cx, cz], w.poly))) continue;
      L.batch.pool(cx, lv.elev, cz, len * 0.95, 3.6, 0xffdcae, Math.atan2(-dz, dx));
      // 餐饮店（咖啡、茶饮、餐厅、烘焙、小吃）门口一块 A 字黑板立牌：离玻璃 1.3 米、门脸中点偏 1.4 米
      if (['cafe', 'tea', 'restaurant', 'bakery', 'snack'].includes(u.brand?.cat) && len >= 4) {
        const ux = dx / len, uz = dz / len, ax = (f.x0 + f.x1) / 2 + ux * 1.4 + f.nx * 1.3, az = (f.z0 + f.z1) / 2 + uz * 1.4 + f.nz * 1.3;
        if (!holes.some((h) => pointInPoly([ax, az], h)) && lv.walk.some((w) => pointInPoly([ax, az], w.poly)) && !(lv.navObstacles || []).some((o) => pointInPoly([ax, az], o.poly))) {
          const ry = Math.atan2(f.nx, f.nz), y = lv.elev;
          for (const side of [1, -1]) {
            sgE.set(-side * 0.2, ry, 0, 'YXZ'); sgQ.setFromEuler(sgE); // 两块板顶部往中间靠（A 字）
            sgP.set(ax + f.nx * side * 0.14, y + 0.47, az + f.nz * side * 0.14);
            L.batch.get('wood').shape('box', sgP, sgQ, sgS.set(0.62, 0.95, 0.035), '#7a5a3c');
            sgP.set(ax + f.nx * side * 0.16, y + 0.5, az + f.nz * side * 0.16);
            L.batch.get('matte').shape('box', sgP, sgQ, sgS.set(0.5, 0.7, 0.012), '#25302b');
            sgP.set(ax + f.nx * side * 0.17, y + 0.62, az + f.nz * side * 0.17);
            L.batch.get('matte').shape('box', sgP, sgQ, sgS.set(0.36, 0.05, 0.006), '#f3efe4');
            sgP.set(ax + f.nx * side * 0.17, y + 0.48, az + f.nz * side * 0.17);
            L.batch.get('matte').shape('box', sgP, sgQ, sgS.set(0.28, 0.035, 0.006), '#e8b4c4');
          }
        }
      }
      // 门脸两端各一盆绿植（离玻璃 0.55 米、离端头 0.5 米）：白色或炭灰色圆盆，灌木团或一棵小橄榄树
      if (len < 5) continue;
      const blocked = (lv.navObstacles || []).map((o) => o.poly);
      for (const end of [0, 1]) {
        const t = end ? 1 - 0.5 / len : 0.5 / len, px = f.x0 + dx * t + f.nx * 0.55, pz = f.z0 + dz * t + f.nz * 0.55;
        if (holes.some((h) => pointInPoly([px, pz], h)) || !lv.walk.some((w) => pointInPoly([px, pz], w.poly)) || blocked.some((q) => pointInPoly([px, pz], q))) continue;
        // 相邻两家门脸的端头挨着，两盆会并排挤在一起：1.2 米内已有一盆就不放
        if (pots.some(([qx, qz]) => Math.hypot(qx - px, qz - pz) < 1.2)) continue;
        pots.push([px, pz]);
        const seed = Math.abs(Math.round(px * 13 + pz * 7)), y = lv.elev;
        L.batch.get('satin').cyl(px, y, pz, 0.27, 0.5, seed % 2 ? '#f2efe8' : '#3a3c40', 18);
        L.batch.get('foliage').cyl(px, y + 0.5, pz, 0.24, 0.03, '#4a3a2c', 14);
        if (seed % 3 === 0) {
          L.batch.get('wood').bar({ x: px, y: y + 0.5, z: pz }, { x: px, y: y + 1.5, z: pz }, 0.05, '#6b5440');
          L.batch.get('foliage').sphere(px, y + 1.75, pz, 0.75, '#6f8f52', 0.62, 0.75, 'ico');
        } else {
          for (let k = 0; k < 3; k++) L.batch.get('foliage').sphere(px + Math.cos(k * 2.1) * 0.12, y + 0.72 + k * 0.08, pz + Math.sin(k * 2.1) * 0.12, 0.42, k % 2 ? LEAF : '#5d8f45', 0.38, 0.42, 'ico');
        }
      }
    }
  }
  greenWalls(ctx, levels);
  directoryTotems(ctx, levels);
  for (const lv of levels.filter((l) => /^[2-6]F$/.test(l.short))) if (ctx.levels[lv.id]) balconyInlay(ctx.levels[lv.id].batch, lv);
  blossomClouds(ctx, levels);
  // A、B 走道里的岛柜（粉白玻璃柜 + 灯箱顶）和咖啡外摆
  for (const it of M.islands || []) {
    const L = ctx.levels[it.level], lv = levels.find((l) => l.id === it.level);
    if (!L || !lv) continue;
    if (it.kind === 'cafe') cafe(L.batch, { x0: it.x - it.hx, x1: it.x + it.hx, z0: it.z - it.hz, z1: it.z + it.hz }, lv.elev, IDENTITY);
    else if (it.kind === 'garden') garden(L.batch, it, lv.elev);
    else if (it.kind === 'lounge') lounge(L.batch, IDENTITY, { u: it.x, v: it.z, w: 3.6, d: 2.2 }, lv.elev);
    else kiosk(L.batch, it, lv.elev, it.x * 3 + it.z);
  }
  M.plaza?.trees.forEach((t, i) => (t.kind === 'palm' ? palm(B, IDENTITY, { u: t.x, v: t.z, r: t.r }, y0, i * 13 + 5) : blossom(B, t, y0, i)));
  const six = levels.find((l) => l.id === 'P1-6F'), rf = levels.find((l) => l.kind === 'roof');
  const sky = rf?.voids.find((v) => v.id === 'MEGA-sky');
  if (sky && ctx.levels[rf.id]) skyShell(ctx.levels[rf.id].shellBatch || ctx.levels[rf.id].batch, sky, rf.elev);
  if (six && rf && ctx.levels[six.id]) banners(ctx, ctx.levels[six.id], [six, levels.find((l) => l.id === 'P1-5F')].filter(Boolean), rf.elev);
  if (six && rf && ctx.levels[six.id]) {
    const roofY = rf.elev;
    for (const [u, R] of [[MEGA_OVAL.u - 18, 4], [MEGA_OVAL.u, 6.5], [MEGA_OVAL.u + 18, 4]]) {
      const [x, z] = toW(NW_FRAME, u, MEGA_OVAL.v);
      haloRing(ctx.levels[six.id].batch, x, z, R, roofY - 2.4, roofY);
      haloRing(ctx.levels[six.id].batch, x, z, R * 0.66, roofY - 4.6, roofY);
    }
  }
}

/** 东南入口长廊、西翼长廊的洞口里各吊三团樱花花云（2F–3F 之间，进门一抬头就看见）：几十个粉白小花球攒成椭球，腰上一圈金环，细吊索拉到屋面 */
function blossomClouds(ctx, levels) {
  const lv2 = levels.find((l) => l.id === 'P1-2F'), lv3 = levels.find((l) => l.id === 'P1-3F'), rf = levels.find((l) => l.kind === 'roof');
  const L = lv2 && ctx.levels[lv2.id];
  if (!L || !lv3 || !rf) return;
  const pinks = ['#f2b6c8', '#e58fb5', '#f7cfdc', '#d97aa6', '#fbe3ea', '#ffffff'];
  // 东南入口长廊三团、西翼长廊三团
  for (const [F, u] of [[SE_FRAME, 44], [SE_FRAME, 54], [SE_FRAME, 64], [W_FRAME, 38], [W_FRAME, 50], [W_FRAME, 62]]) {
    const [x, z] = toW(F, u, 0);
    // 2F、3F 的洞口里离边都要 ≥ 2.6 米（花云半径 1.6 米）
    if (![lv2, lv3].every((lv) => lv.voids.some((v) => v.mega && pointInPoly([x, z], v.poly) && distToPolyEdge([x, z], v.poly) > 2.6))) continue;
    const rand = rng(u * 7 + Math.round(F.deg) + 3), cy = (lv2.elev + lv3.elev) / 2 + 0.6;
    for (let k = 0; k < 46; k++) {
      const a = rand() * Math.PI * 2, b = Math.acos(rand() * 2 - 1), r = 0.55 + rand() * 0.45;
      B2(L).get('foliage').sphere(x + Math.sin(b) * Math.cos(a) * 1.5 * r, cy + Math.cos(b) * 0.95 * r, z + Math.sin(b) * Math.sin(a) * 1.5 * r,
        0.42 + rand() * 0.22, pinks[Math.floor(rand() * pinks.length)], undefined, undefined, 'ico');
    }
    for (let k = 0; k < 6; k++) { const a = rand() * Math.PI * 2; B2(L).get('foliage').sphere(x + Math.cos(a) * 1.2, cy - 0.5 + rand() * 0.4, z + Math.sin(a) * 1.2, 0.3, LEAF, 0.2, 0.3, 'ico0'); }
    const n = 28;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      B2(L).get('facadeBronze').bar({ x: x + Math.cos(a0) * 1.75, y: cy, z: z + Math.sin(a0) * 1.75 }, { x: x + Math.cos(a1) * 1.75, y: cy, z: z + Math.sin(a1) * 1.75 }, 0.05, GOLD);
    }
    for (const a of [0, 2.09, 4.19]) B2(L).get('metal').bar({ x: x + Math.cos(a) * 1.75, y: cy, z: z + Math.sin(a) * 1.75 }, { x: x + Math.cos(a) * 0.6, y: rf.elev, z: z + Math.sin(a) * 0.6 }, 0.012, '#9aa0a6');
  }
}
const B2 = (L) => L.batch;

/** 楼层导览牌的画面：顶上楼层号、下面按业态列出本层的店（虚构品牌，取自布局里的品牌记录） */
function directoryTexture(ctx, lv) {
  ctx.p1Directory ||= {};
  if (ctx.p1Directory[lv.id]) return ctx.p1Directory[lv.id];
  const c = makeCanvas(320, 1000), g = c.getContext('2d');
  g.fillStyle = '#fbf9f4'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#26324d'; g.fillRect(0, 0, c.width, 190);
  g.fillStyle = '#d8b56a'; g.fillRect(0, 186, c.width, 6);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 108px ${FONT_EN}`; g.fillText(lv.short, c.width / 2, 92);
  g.font = `500 24px ${FONT_CN}`; g.fillText('楼层导览 · DIRECTORY', c.width / 2, 160);
  const by = new Map();
  for (const u of lv.units) { const k = u.brand?.catLabel; if (!k || !u.brand?.name) continue; if (!by.has(k)) by.set(k, []); by.get(k).push(u.brand.name); }
  let y = 230;
  g.textAlign = 'left';
  for (const [cat, names] of [...by].sort((a, b) => b[1].length - a[1].length)) {
    if (y > c.height - 70) break;
    g.fillStyle = '#b08a3e'; g.font = `600 26px ${FONT_CN}`; g.fillText(cat, 26, y); y += 36;
    g.fillStyle = '#3a3f4a'; g.font = `400 22px ${FONT_CN}`;
    for (const n of names.slice(0, 4)) { if (y > c.height - 40) break; g.fillText('· ' + n, 40, y); y += 30; }
    y += 12;
  }
  return (ctx.p1Directory[lv.id] = canvasTexture(c, { clamp: true }));
}

/** 扶梯口旁边立一块楼层导览牌（白色立牌、金边、深蓝顶条，两面都是本层导览，夜里自发光）。
 *  位置：扶梯端头侧面 1.2 米、往外 1.2 米；要在走道上、不在洞口和障碍上，同层两块之间 ≥ 8 米 */
function directoryTotems(ctx, levels) {
  for (const lv of levels.filter((l) => /^[1-6]F$/.test(l.short))) {
    const L = ctx.levels[lv.id];
    if (!L) continue;
    const blocked = [...(lv.navObstacles || []).map((o) => o.poly), ...lv.units.flatMap((u) => u.polys), ...lv.voids.map((v) => v.poly)];
    const ok = (x, z) => lv.walk.some((w) => pointInPoly([x, z], w.poly)) && !blocked.some((q) => pointInPoly([x, z], q))
      && lv.voids.every((v) => !pointInPoly([x, z], v.poly) && distToPolyEdge([x, z], v.poly) > 0.8);
    const placed = [];
    let mat = null;
    for (const e of ctx.layout.escalators) {
      for (const [end, sign] of [[e.bottom, -1], [e.top, 1]]) {
        if ((sign < 0 ? e.from : e.to) !== lv.id) continue;
        const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z), ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
        for (const side of [1, -1]) {
          const x = end.x + ux * sign * 1.2 + -uz * side * (e.width / 2 + 1.2), z = end.z + uz * sign * 1.2 + ux * side * (e.width / 2 + 1.2);
          if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 8)) continue;
          if (![[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]].every(([dx, dz]) => ok(x + dx, z + dz))) continue;
          placed.push([x, z]);
          const ang = Math.atan2(-uz, ux) + Math.PI / 2, y = lv.elev;
          L.batch.get('satin').box(x, y + 1.1, z, 0.74, 2.2, 0.16, '#f6f3ec', ang);
          L.batch.get('facadeBronze').box(x, y + 0.04, z, 0.82, 0.08, 0.24, GOLD, ang);
          L.batch.get('facadeBronze').box(x, y + 2.22, z, 0.8, 0.04, 0.2, GOLD, ang);
          mat ||= ctx.mats.sign(directoryTexture(ctx, lv));
          for (const face of [1, -1]) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.94), mat);
            const fx = Math.sin(ang + (face > 0 ? 0 : Math.PI)), fz = Math.cos(ang + (face > 0 ? 0 : Math.PI));
            m.position.set(x + fx * 0.081, y + 1.15, z + fz * 0.081);
            m.rotation.y = ang + (face > 0 ? 0 : Math.PI);
            m.name = 'P1-directory-totem';
            L.base.add(m);
          }
          break;
        }
      }
    }
  }
}

/** 竖向布幔的四种画面（虚构活动名）：底色渐变、竖排大字、上下金线 */
const BANNERS = [
  { top: '#f7c6d5', bottom: '#e07fa3', title: '春日花市', sub: 'SPRING BLOOM', ink: '#ffffff' },
  { top: '#c8303a', bottom: '#8e1622', title: '周年庆典', sub: 'ANNIVERSARY', ink: '#ffe3a3' },
  { top: '#bfe3d8', bottom: '#2f8f7c', title: '云澜艺术季', sub: 'ART SEASON', ink: '#ffffff' },
  { top: '#2b3a6b', bottom: '#151c38', title: '夜光市集', sub: 'NIGHT MARKET', ink: '#ffd98a' },
];
function bannerTexture(ctx, i) {
  ctx.p1Banners ||= [];
  if (ctx.p1Banners[i]) return ctx.p1Banners[i];
  const d = BANNERS[i], c = makeCanvas(256, 1440), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, d.top); grad.addColorStop(1, d.bottom);
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#d8b56a'; for (const y of [28, 40, c.height - 44, c.height - 32]) g.fillRect(16, y, c.width - 32, 4);
  g.fillStyle = d.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 44px ${FONT_CN}`; g.fillText('云澜汇', c.width / 2, 110);
  const chars = [...d.title], step = Math.min(190, 900 / chars.length);
  g.font = `700 ${Math.round(step * 0.82)}px ${FONT_CN}`;
  chars.forEach((ch, k) => g.fillText(ch, c.width / 2, 260 + step * (k + 0.5)));
  g.font = `500 30px ${FONT_EN}`; g.fillText(d.sub, c.width / 2, c.height - 150);
  if (i === 3) { const r = rng(17); g.fillStyle = 'rgba(255,230,170,0.8)'; for (let k = 0; k < 60; k++) g.fillRect(r() * c.width, r() * c.height, 2, 2); }
  return (ctx.p1Banners[i] = canvasTexture(c, { clamp: true }));
}

/** 大椭圆中庭里挂一圈竖向布幔（9 米长、1.6 米宽、朝圆心），从天窗下的金色横杆垂下，夜里自发光。
 *  布幔下端落到 5F 楼板以上 2 米，而洞口越往下越小，所以位置要同时在 6F 和 5F 的洞口里（离边 ≥ 2 米） */
function banners(ctx, L, lvs, roofY) {
  const holesBy = lvs.map((lv) => lv.voids.filter((v) => v.mega).map((v) => v.poly));
  const [u0, v0] = [MEGA_OVAL.u, MEGA_OVAL.v], [a, b] = MEGA_OVAL.steps['6F'], [cx, cz] = toW(NW_FRAME, u0, v0);
  const mats = BANNERS.map((_, i) => { const m = ctx.mats.sign(bannerTexture(ctx, i)); m.side = THREE.DoubleSide; return m; });
  const geom = new THREE.PlaneGeometry(1.6, 9);
  let k = 0;
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2, [x, z] = toW(NW_FRAME, u0 + Math.cos(t) * (a - 8), v0 + Math.sin(t) * (b - 8));
    if (!holesBy.every((holes) => holes.some((h) => pointInPoly([x, z], h) && distToPolyEdge([x, z], h) > 2))) continue;
    const mesh = new THREE.Mesh(geom, mats[k % mats.length]);
    const top = roofY + 0.4, yMid = top - 4.6;
    mesh.position.set(x, yMid, z);
    mesh.rotation.y = Math.atan2(cx - x, cz - z);
    mesh.name = 'P1-atrium-banner';
    L.base.add(mesh);
    const ry = mesh.rotation.y, dx = Math.cos(ry) * 0.9, dz = -Math.sin(ry) * 0.9;
    L.batch.get('metal').bar({ x: x - dx, y: top, z: z - dz }, { x: x + dx, y: top, z: z + dz }, 0.06, GOLD);
    for (const sgn of [-1, 1]) L.batch.get('metal').bar({ x: x + sgn * dx * 0.9, y: top, z: z + sgn * dz * 0.9 }, { x: x + sgn * dx * 0.9, y: top + 1.2, z: z + sgn * dz * 0.9 }, 0.015, '#9aa0a6');
    L.batch.get('metal').bar({ x: x - dx, y: top - 9.2, z: z - dz }, { x: x + dx, y: top - 9.2, z: z + dz }, 0.04, GOLD);
    k++;
  }
}

/**
 * 大椭圆中庭顶上的玻璃网壳：屋面开洞一圈 1 米高的石材压顶，上面一片鼓起来的玻璃（椭圆穹顶，靠边按 1:1.6 的坡收回到压顶高度，
 * 天窗被楼梯间让出来的凹口处也一样落回去），玻璃按 3 米网格分块，网格线是白色钢肋，中间一圈金色环梁。
 * 高度场：h = min(穹顶 rise·(1 − r²), 离边线距离 / 1.6)，r 是相对大椭圆的半径。
 */
function skyShell(B, v, y0) {
  const P = v.poly, base = y0 + 1.0, rise = 7.5, { a, b } = MEGA_SKY, cu = MEGA_OVAL.u, cv = MEGA_OVAL.v;
  const H = (x, z) => {
    const [u, w] = toL(NW_FRAME, x, z), r2 = ((u - cu) / a) ** 2 + ((w - cv) / b) ** 2;
    return base + Math.max(0, Math.min(rise * (1 - r2), distToPolyEdge([x, z], P) / 1.6));
  };
  // 压顶
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    B.get('satin').bar({ x: p[0], y: y0 + 0.5, z: p[1] }, { x: q[0], y: y0 + 0.5, z: q[1] }, 0.5, '#d9d2c3');
    B.get('satin').bar({ x: p[0], y: base - 0.04, z: p[1] }, { x: q[0], y: base - 0.04, z: q[1] }, 0.32, '#e9e4da');
  }
  // 玻璃：NW 局部坐标 3 m 网格，每格和天窗多边形求交，交出来的块按高度场抬起来（三角扇）
  const loc = P.map(([x, z]) => toL(NW_FRAME, x, z)), us = loc.map((q) => q[0]), ws = loc.map((q) => q[1]);
  const G = 3, u0 = Math.floor(Math.min(...us) / G) * G, u1 = Math.max(...us), w0 = Math.floor(Math.min(...ws) / G) * G, w1 = Math.max(...ws);
  const ring = [[...P, P[0]].map(([x, z]) => [x, z])];
  const pos = [], nor = [];
  const tri = (A, Bp, C) => {
    const ux = Bp[0] - A[0], uy = Bp[1] - A[1], uz = Bp[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; [Bp, C] = [C, Bp]; }
    pos.push(...A, ...Bp, ...C); for (let k = 0; k < 3; k++) nor.push(nx, ny, nz);
  };
  for (let u = u0; u < u1; u += G) for (let w = w0; w < w1; w += G) {
    const cell = [[u, w], [u + G, w], [u + G, w + G], [u, w + G], [u, w]].map(([p, q]) => toW(NW_FRAME, p, q));
    let parts;
    try { parts = clipping.intersection([ring], [cell]); } catch { continue; }
    for (const poly of parts) {
      const pts = poly[0].slice(0, -1).map(([x, z]) => [x, H(x, z), z]);
      if (pts.length < 3) continue;
      const c = pts.reduce((s, q) => [s[0] + q[0] / pts.length, 0, s[2] + q[2] / pts.length], [0, 0, 0]);
      c[1] = H(c[0], c[2]);
      for (let i = 0; i < pts.length; i++) tri(c, pts[i], pts[(i + 1) % pts.length]);
    }
  }
  if (pos.length) B.get('glass').push({ pos: new Float32Array(pos), nor: new Float32Array(nor), count: pos.length / 3 }, new THREE.Matrix4(), '#ffffff');
  // 钢肋：网格线沿高度场走，只画在天窗里面的段
  const rib = (pa, pb, t, col) => {
    const n = Math.max(1, Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 1.5));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const x = pa[0] + (pb[0] - pa[0]) * i / n, z = pa[1] + (pb[1] - pa[1]) * i / n;
      const inn = pointInPoly([x, z], P) && distToPolyEdge([x, z], P) > 0.15;
      const cur = inn ? { x, y: H(x, z) + 0.06, z } : null;
      if (prev && cur) B.get('metal').bar(prev, cur, t, col);
      prev = cur;
    }
  };
  for (let u = u0; u <= u1; u += G) rib(toW(NW_FRAME, u, w0), toW(NW_FRAME, u, w1), 0.12, '#f4f2ec');
  for (let w = w0; w <= w1; w += G) rib(toW(NW_FRAME, u0, w), toW(NW_FRAME, u1, w), 0.12, '#f4f2ec');
  // 金色环梁（穹顶半高处一圈）
  const n = 72;
  for (let k = 0; k < n; k++) {
    const t0 = (k / n) * Math.PI * 2, t1 = ((k + 1) / n) * Math.PI * 2;
    const p0 = toW(NW_FRAME, cu + a * 0.55 * Math.cos(t0), cv + b * 0.55 * Math.sin(t0)), p1 = toW(NW_FRAME, cu + a * 0.55 * Math.cos(t1), cv + b * 0.55 * Math.sin(t1));
    if (!pointInPoly(p0, P) || !pointInPoly(p1, P)) continue;
    B.get('facadeBronze').bar({ x: p0[0], y: H(...p0) + 0.1, z: p0[1] }, { x: p1[0], y: H(...p1) + 0.1, z: p1[1] }, 0.22, GOLD);
  }
}

/**
 * 和别的楼贴着的实墙（艺文馆、西苑附楼、酒店那几面，墙外 1 米就在另一栋楼里）前面是走道、又排不下铺位的地方，
 * 从中庭对面看过去是一大块白墙。每层做一面落地的垂直绿墙：铜色边框、成片的叶团和几簇花、底部一条暖光洗墙灯。
 * 只挑连续 ≥ 6 米、前面 1.5 米是走道（不是铺位、用房）的墙段；门口两边各 3 米留空。
 */
function greenWalls(ctx, levels) {
  const others = ctx.layout.buildings.filter((b) => b.id !== 'P1' && b.outline && !b.undergroundOnly && b.kind !== 'metro').map((b) => b.outline);
  for (let i = 0; i < levels.length - 1; i++) {
    const lv = levels[i], up = levels[i + 1], L = ctx.levels[lv.id];
    if (!L || !/^[1-6]F$/.test(lv.short)) continue;
    const top = up.elev - (SLAB_T[up.kind] ?? 0.45) - 0.5, y0 = lv.elev;
    const solid = [...lv.units.flatMap((u) => u.polys), ...(lv.rooms || []).flatMap((r) => r.polys || []), ...lv.voids.map((v) => v.poly), ...(lv.navObstacles || []).map((o) => o.poly)];
    const walkAt = (q) => lv.walk.some((w) => pointInPoly(q, w.poly)) && !solid.some((p) => pointInPoly(q, p));
    const doors = ctx.layout.entrances.filter((e) => e.level === lv.id || e.to === lv.id).map((e) => [(e.seg.x0 + e.seg.x1) / 2, (e.seg.z0 + e.seg.z1) / 2]);
    const rand = rng(lv.elev * 13 + 7);
    for (const P of lv.expansion?.facadePolys || [lv.outline]) for (let k = 0; k < P.length; k++) {
      const a = P[k], b = P[(k + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 6) continue;
      const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
      // 墙的两侧：一侧在别的楼里（实墙），另一侧是走道
      const at = (t, off) => [a[0] + tx * t - tz * off, a[1] + tz * t + tx * off];
      const n = Math.floor(len), ok = [];
      for (let j = 0; j < n; j++) {
        const t = j + 0.5;
        let side = 0;
        for (const sgn of [1, -1]) if (others.some((o) => pointInPoly(at(t, -sgn * 1.0), o)) && walkAt(at(t, sgn * 1.5))) side = sgn;
        ok.push(side && !doors.some(([x, z]) => Math.hypot(x - at(t, 0)[0], z - at(t, 0)[1]) < 3) ? side : 0);
      }
      for (let j = 0; j < n;) {
        if (!ok[j]) { j++; continue; }
        let e = j; while (e < n && ok[e] === ok[j]) e++;
        if (e - j >= 6) {
          const sgn = ok[j], t0 = j + 0.3, t1 = e - 0.3, mid = (t0 + t1) / 2, w = t1 - t0, h = top - y0 - 0.2;
          const F = frame(...at(mid, sgn * 0.2), (Math.atan2(tz, tx) * 180) / Math.PI);
          const nv = sgn; // 局部 +v 朝走道（sgn=1）或 −v
          L.batch.frame(F, () => {
            L.batch.get('foliage').box(0, y0 + 0.1 + h / 2, nv * 0.12, w, h, 0.24, LEAF2);
            for (let q = 0; q < Math.round(w * h * 1.6); q++) {
              const u = (rand() - 0.5) * (w - 0.4), yy = y0 + 0.3 + rand() * (h - 0.4), rr = 0.22 + rand() * 0.22;
              const col = rand() < 0.12 ? FLOWERS[Math.floor(rand() * FLOWERS.length)] : rand() < 0.5 ? LEAF : '#5f9a48';
              L.batch.get('foliage').sphere(u, yy, nv * (0.3 + rand() * 0.08), rr, col, rr * 0.9, rr * 0.55, 'ico0');
            }
            L.batch.get('facadeBronze').box(0, y0 + 0.1 + h + 0.06, nv * 0.2, w + 0.2, 0.12, 0.4, GOLD);
            L.batch.get('facadeBronze').box(0, y0 + 0.06, nv * 0.25, w + 0.2, 0.12, 0.5, GOLD);
            for (const u of [-w / 2 - 0.05, w / 2 + 0.05]) L.batch.get('facadeBronze').box(u, y0 + 0.1 + h / 2, nv * 0.2, 0.1, h, 0.4, GOLD);
            L.batch.get('glowSoft').box(0, y0 + 0.16, nv * 0.48, w - 0.2, 0.04, 0.06, WARM);
          });
          const [px, pz] = at(mid, sgn * 1.6);
          L.batch.pool(px, lv.elev, pz, w, 2.4, 0xffd9a0, Math.atan2(-tz, tx));
          (ctx.greenWallCount = (ctx.greenWallCount || 0) + 1);
        }
        j = e;
      }
    }
  }
}

/**
 * 1F 中庭地面的石材拼花（效果图里广场地面有深色石材镶边和放射纹，不是一整片素色）：
 * ① 沿 2F 大中庭洞口（方庭、大椭圆、圆厅、长廊）的投影往里 1.2 米一圈 0.36 米宽深色石带，外侧贴一条 6 厘米金线；
 * ② 每座喷泉外一圈 24 条放射石线（深浅相间）。石材面比地面高 1–2 厘米，压在倒影膜上面（不然被倒影洗淡看不见）。碰到树池、喷泉、咖啡外摆这些障碍或不在走道上的段落不画。
 */
function floorInlay(ctx, B, lv1, y0, fountains) {
  const lv2 = ctx.layout.levels.find((l) => l.id === 'P1-2F');
  if (!lv2) return;
  const blocked = (lv1.navObstacles || []).map((o) => o.poly);
  const free = (x, z) => lv1.walk.some((w) => pointInPoly([x, z], w.poly)) && !blocked.some((q) => pointInPoly([x, z], q))
    && !lv1.voids.some((v) => pointInPoly([x, z], v.poly));
  // 大中庭洞口（方庭 + 大椭圆合成的 SQ-void、圆厅 C-void、长廊 MEGA-void-*）
  for (const v of lv2.voids.filter((q) => q.mega && /^(SQ-void|C-void|MEGA-void)/.test(q.id))) {
    const P = v.poly;
    for (let i = 0; i < P.length; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length], len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.3) continue;
      let nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      if (!pointInPoly([(x0 + x1) / 2 + nx * 0.3, (z0 + z1) / 2 + nz * 0.3], P)) { nx = -nx; nz = -nz; }
      const ang = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.ceil(len / 1.2));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, mx = x0 + (x1 - x0) * t + nx * 1.2, mz = z0 + (z1 - z0) * t + nz * 1.2, pl = len / n + 0.02;
        if (!free(mx, mz)) continue;
        B.get('stone').box(mx, y0 + 0.014, mz, pl, 0.01, 0.36, '#6e6359', ang);
        B.get('facadeBronze').box(mx - nx * 0.3, y0 + 0.015, mz - nz * 0.3, pl, 0.01, 0.06, GOLD, ang);
      }
    }
  }
  for (const f of fountains) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, r0 = f.r + 2.7, r1 = f.r + 6.5;
      const ax = f.x + Math.cos(a) * r0, az = f.z + Math.sin(a) * r0, bx = f.x + Math.cos(a) * r1, bz = f.z + Math.sin(a) * r1;
      if (![0, .5, 1].every((t) => free(ax + (bx - ax) * t, az + (bz - az) * t))) continue;
      B.get('stone').box((ax + bx) / 2, y0 + 0.014, (az + bz) / 2, r1 - r0, 0.01, k % 2 ? 0.1 : 0.16, k % 2 ? '#a89a86' : '#7d7064', Math.atan2(-(bz - az), bx - ax));
    }
  }
}

/** 1F 广场四周：2F 楼板底下、离洞口边 1.6 米每 4 米吊一盏暖色球灯（吊线、铜色灯帽、发光球、地上一团光） */
function plazaPendants(ctx, lv1) {
  const lv2 = ctx.layout.levels.find((l) => l.id === 'P1-2F'), L = ctx.levels[lv1.id];
  if (!lv2 || !L) return;
  const ceil = lv2.elev - (SLAB_T[lv2.kind] ?? 0.45), voids2 = lv2.voids.map((v) => v.poly);
  const blocked = [...(lv1.navObstacles || []).map((o) => o.poly), ...lv1.units.flatMap((u) => u.polys), ...lv1.voids.map((v) => v.poly)];
  const placed = [];
  for (const v of lv2.voids.filter((q) => q.mega && /^(SQ-void|C-void|MEGA-void)/.test(q.id))) {
    const P = v.poly;
    for (let i = 0; i < P.length; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length], len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.5) continue;
      let nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      if (pointInPoly([(x0 + x1) / 2 + nx * 0.3, (z0 + z1) / 2 + nz * 0.3], P)) { nx = -nx; nz = -nz; } // 朝楼板（洞口外）
      for (let d = 2; d < len - 1; d += 4) {
        const x = x0 + (x1 - x0) * (d / len) + nx * 1.6, z = z0 + (z1 - z0) * (d / len) + nz * 1.6;
        if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3.5)) continue;
        if (voids2.some((h) => pointInPoly([x, z], h)) || !lv1.walk.some((w) => pointInPoly([x, z], w.poly)) || blocked.some((q) => pointInPoly([x, z], q))) continue;
        placed.push([x, z]);
        const drop = ceil - 1.7;
        L.batch.get('metal').bar({ x, y: ceil, z }, { x, y: drop + 0.28, z }, 0.012, '#2b2b2b');
        L.batch.get('facadeBronze').cyl(x, drop + 0.2, z, 0.12, 0.1, GOLD, 12);
        L.batch.get('glow').sphere(x, drop, z, 0.44, '#ffd9a0', undefined, undefined, 'sphereLo');
        L.batch.pool(x, lv1.elev, z, 3.2, 3.2, 0xffd6a0);
      }
    }
  }
}

/**
 * 1F 广场四周的木格栅吊顶：2F 楼板底下，沿大中庭洞口边每 0.75 米一根木条，垂直于洞口边、从离边 2.5 米伸到 9 米，
 * 绕着洞口呈放射状。只检查木条的起点、中点、终点（都要在走道上、不在洞口和铺位房间里），不行就退成 2.5–6 米的短条。
 */
function plazaBaffles(ctx, lv1) {
  const lv2 = ctx.layout.levels.find((l) => l.id === 'P1-2F'), L = ctx.levels[lv1.id];
  if (!lv2 || !L) return;
  const ceil = lv2.elev - (SLAB_T[lv2.kind] ?? 0.45), voids2 = lv2.voids.map((v) => v.poly);
  const solid = [...lv1.units.flatMap((u) => u.polys), ...(lv1.rooms || []).flatMap((r) => r.polys || []), ...lv1.voids.map((v) => v.poly)];
  // 多边形先配一个外框，点不在框里就不做 pointInPoly（几十个大多边形逐个精算太慢，开场会卡）
  const boxed = (polys) => polys.map((P) => ({ P, b: P.reduce((r, [x, z]) => [Math.min(r[0], x), Math.min(r[1], z), Math.max(r[2], x), Math.max(r[3], z)], [Infinity, Infinity, -Infinity, -Infinity]) }));
  const hitAny = (list, x, z) => list.some(({ P, b }) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && pointInPoly([x, z], P));
  const V = boxed(voids2), W = boxed(lv1.walk.map((w) => w.poly)), S = boxed(solid);
  const ok = (x, z) => !hitAny(V, x, z) && hitAny(W, x, z) && !hitAny(S, x, z);
  const placed = [], segDist = (x, z, q) => {
    const dx = q.x1 - q.x0, dz = q.z1 - q.z0, t = Math.max(0, Math.min(1, ((x - q.x0) * dx + (z - q.z0) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - q.x0 - dx * t, z - q.z0 - dz * t);
  };
  for (const v of lv2.voids.filter((q) => q.mega && /^(SQ-void|C-void|MEGA-void)/.test(q.id))) {
    const P = v.poly;
    for (let i = 0; i < P.length; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length], len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.75) continue;
      let nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      if (pointInPoly([(x0 + x1) / 2 + nx * 0.3, (z0 + z1) / 2 + nz * 0.3], P)) { nx = -nx; nz = -nz; }
      for (let d = 0.375; d < len; d += 0.75) {
        const bx = x0 + (x1 - x0) * (d / len), bz = z0 + (z1 - z0) * (d / len);
        for (const [a, b] of [[2.5, 9], [2.5, 6]]) {
          if (![a, (a + b) / 2, b].every((t) => ok(bx + nx * t, bz + nz * t))) continue;
          // 洞口拐角处相邻两条边的木条会交叉成 X：离已放的木条不到 0.3 米就不放
          const seg = { x0: bx + nx * a, z0: bz + nz * a, x1: bx + nx * b, z1: bz + nz * b };
          if ([0, 0.25, 0.5, 0.75, 1].some((t) => placed.some((q) => segDist(seg.x0 + (seg.x1 - seg.x0) * t, seg.z0 + (seg.z1 - seg.z0) * t, q) < 0.3))) break;
          placed.push({ ...seg, cx: bx + nx * (a + b) / 2, cz: bz + nz * (a + b) / 2, len: b - a, ry: Math.atan2(nx, nz) });
          break;
        }
      }
    }
  }
  // 孤零零的一两根木条看着像掉下来的梁：只画 1.6 米内至少有两根邻居的
  for (const q of placed) {
    if (placed.filter((o) => o !== q && Math.hypot(o.cx - q.cx, o.cz - q.cz) < 1.6).length < 2) continue;
    L.batch.get('wood').box(q.cx, ceil - 0.16, q.cz, 0.07, 0.22, q.len, '#b88a5a', q.ry);
  }
}

/** 2F–6F 走道上沿本层大中庭洞口边往外 2.2 米一条深色石带 + 金线（和 1F 广场的拼花呼应，楼上走道不再是一整片素色） */
function balconyInlay(B, lv) {
  const blocked = [...(lv.navObstacles || []).map((o) => o.poly), ...lv.units.flatMap((u) => u.polys)];
  const free = (x, z) => !lv.voids.some((v) => pointInPoly([x, z], v.poly)) && lv.walk.some((w) => pointInPoly([x, z], w.poly)) && !blocked.some((q) => pointInPoly([x, z], q));
  for (const v of lv.voids.filter((q) => q.mega)) {
    const P = v.poly;
    for (let i = 0; i < P.length; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length], len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.3) continue;
      let nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      if (pointInPoly([(x0 + x1) / 2 + nx * 0.3, (z0 + z1) / 2 + nz * 0.3], P)) { nx = -nx; nz = -nz; } // 朝走道
      const ang = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.ceil(len / 1.2));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, mx = x0 + (x1 - x0) * t + nx * 2.2, mz = z0 + (z1 - z0) * t + nz * 2.2, pl = len / n + 0.02;
        if (!free(mx, mz)) continue;
        B.get('stone').box(mx, lv.elev + 0.006, mz, pl, 0.012, 0.3, '#6e6359', ang);
        B.get('facadeBronze').box(mx + nx * 0.24, lv.elev + 0.007, mz + nz * 0.24, pl, 0.012, 0.05, GOLD, ang);
      }
    }
  }
}

function floorRing(B, x, z, R, w, y0) {
  const n = Math.max(32, Math.round(R * 6));
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    B.get('facadeBronze').bar({ x: x + Math.cos(a0) * R, y: y0 + 0.012, z: z + Math.sin(a0) * R }, { x: x + Math.cos(a1) * R, y: y0 + 0.012, z: z + Math.sin(a1) * R }, w, GOLD);
  }
}

function haloRing(B, x, z, R, y, roofY) {
  const n = Math.max(24, Math.round(R * 8));
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const p = { x: x + Math.cos(a0) * R, y, z: z + Math.sin(a0) * R }, q = { x: x + Math.cos(a1) * R, y, z: z + Math.sin(a1) * R };
    B.get('facadeBronze').bar(p, q, 0.16, GOLD);
    B.get('glow').bar({ ...p, y: y - 0.1 }, { ...q, y: y - 0.1 }, 0.06, WARM);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    B.get('metal').bar({ x: x + Math.cos(a) * R, y, z: z + Math.sin(a) * R }, { x: x + Math.cos(a) * R * 0.2, y: roofY - 0.2, z: z + Math.sin(a) * R * 0.2 }, 0.012, '#9aa0a6');
  }
}

/** 樱花树池：石材圆池、深色树干分三叉，一团团粉色花冠（低面数球） */
function blossom(B, t, y0, seed) {
  const rand = rng(seed * 31 + 11), { x, z, r } = t;
  B.get('travertine').cyl(x, y0, z, r, 0.5, '#e6dfd2', 28);
  if (t.bench) {
    // 树池外一圈环形座椅：白色石材座墩 + 木条坐面，底下一圈暖光
    const n = 24, R = r + 0.28;
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2, len = (2 * Math.PI * R) / n + 0.02, cx = x + Math.cos(a) * R, cz = z + Math.sin(a) * R, ang = -a + Math.PI / 2;
      B.get('satin').box(cx, y0 + 0.19, cz, len, 0.38, 0.4, '#f1ede4', ang);
      B.get('wood').box(cx, y0 + 0.415, cz, len - 0.01, 0.07, 0.48, '#9a6e46', ang);
      B.get('glowSoft').box(x + Math.cos(a) * (R + 0.21), y0 + 0.02, z + Math.sin(a) * (R + 0.21), len, 0.02, 0.03, '#ffe2b8', ang);
    }
  }
  B.get('foliage').cyl(x, y0 + 0.5, z, r - 0.08, 0.06, '#5a4632', 28);
  for (let k = 0; k < 10; k++) {
    const a = rand() * Math.PI * 2, d = rand() * (r - 0.3);
    B.get('foliage').sphere(x + Math.cos(a) * d, y0 + 0.62, z + Math.sin(a) * d, 0.15, k % 3 ? LEAF : FLOWERS[k % FLOWERS.length], undefined, undefined, 'sphereLo');
  }
  const top = { x, y: y0 + 2.4, z };
  B.get('wood').bar({ x, y: y0 + 0.55, z }, top, 0.2, '#5b4636');
  // 树冠：主枝分叉成小枝，每根小枝顶上一团由许多小花球攒成的花簇（效果图里樱花是一大团软软的粉色，不是几块大多面体）
  const pinks = ['#f2b6c8', '#e58fb5', '#f7cfdc', '#d97aa6', '#fbe3ea'];
  for (let b = 0; b < 4; b++) {
    const a = b * 1.57 + rand() * 0.6, mid = { x: x + Math.cos(a) * 0.9, y: y0 + 3.2 + rand() * 0.3, z: z + Math.sin(a) * 0.9 };
    B.get('wood').bar(top, mid, 0.13, '#5b4636');
    for (let c = 0; c < 2; c++) {
      const a2 = a + (c ? 0.45 : -0.45), tip = { x: mid.x + Math.cos(a2) * (0.8 + rand() * 0.4), y: mid.y + 0.6 + rand() * 0.5, z: mid.z + Math.sin(a2) * (0.8 + rand() * 0.4) };
      B.get('wood').bar(mid, tip, 0.07, '#5b4636');
      for (let k = 0; k < 18; k++) {
        const u = rand() * Math.PI * 2, rr = Math.sqrt(rand()), h = (rand() - 0.35) * 0.8;
        B.get('foliage').sphere(tip.x + Math.cos(u) * rr * 1.1, tip.y + h, tip.z + Math.sin(u) * rr * 1.1,
          0.2 + rand() * 0.16, pinks[Math.floor(rand() * pinks.length)], undefined, undefined, 'ico');
      }
    }
  }
  // 树池里落了一些花瓣
  for (let k = 0; k < 14; k++) {
    const a = rand() * Math.PI * 2, d = 0.4 + rand() * (r - 0.6);
    B.get('foliage').box(x + Math.cos(a) * d, y0 + 0.535, z + Math.sin(a) * d, 0.09, 0.008, 0.07, pinks[k % pinks.length], rand() * 3);
  }
}

/** 岛柜：白色柜体、粉色或薄荷色腰带、玻璃展示台、四根细柱撑起的灯箱顶 */
function kiosk(B, it, y0, seed) {
  const { x, z, hx, hz } = it, rand = rng(Math.abs(Math.round(seed * 37)) + 5);
  const tint = ['#f2b6c8', '#bfe3d4', '#f6e7a1', '#cdb8ec'][Math.abs(Math.round(seed)) % 4];
  const deep = ['#d9809f', '#6fb59a', '#d9b445', '#9a7fd1'][Math.abs(Math.round(seed)) % 4];
  // 柜台：白色柜体、金色踢脚、彩色腰带，玻璃展示台里摆一排商品，台面下一条暖光
  B.get('satin').box(x, y0 + 0.5, z, hx * 2, 1.0, hz * 2, '#f6f3ec');
  B.get('facadeBronze').box(x, y0 + 0.05, z, hx * 2 + 0.02, 0.1, hz * 2 + 0.02, GOLD);
  B.get('matte').box(x, y0 + 0.75, z, hx * 2 + 0.04, 0.22, hz * 2 + 0.04, tint);
  B.get('glass').box(x, y0 + 1.2, z, hx * 2 - 0.3, 0.4, hz * 2 - 0.3, '#ffffff');
  B.get('glow').box(x, y0 + 1.02, z, hx * 2 - 0.4, 0.03, hz * 2 - 0.4, WARM);
  const goods = ['#ffffff', tint, deep, '#2f3a4a', '#e8d2a6'];
  for (let k = 0; k < 9; k++) {
    const gx = x - hx + 0.35 + (k / 8) * (hx * 2 - 0.7), gz = z + (rand() - 0.5) * (hz - 0.4);
    if (k % 3 === 1) B.get('satin').sphere(gx, y0 + 1.12, gz, 0.16, goods[k % goods.length], 0.1, 0.16, 'sphereLo');
    else B.get('satin').box(gx, y0 + 1.1, gz, 0.16, 0.12 + rand() * 0.1, 0.12, goods[k % goods.length], rand());
  }
  // 四根金色立柱撑起双坡条纹遮阳篷（白色和店色相间），篷檐一排扇形垂边
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.get('metal').cyl(x + sx * (hx - 0.1), y0 + 1, z + sz * (hz - 0.1), 0.04, 1.6, GOLD, 6);
  const eave = y0 + 2.55, ridge = y0 + 2.95, half = hz + 0.35, slope = Math.atan2(ridge - eave, half), run = Math.hypot(half, ridge - eave);
  const n = Math.max(4, Math.round((hx * 2 + 0.5) / 0.38)), sw = (hx * 2 + 0.5) / n;
  const q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const sx = x - hx - 0.25 + (i + 0.5) * sw, col = i % 2 ? '#fbf8f1' : tint;
    for (const side of [1, -1]) {
      e.set(side * slope, 0, 0); q.setFromEuler(e);
      pos.set(sx, (eave + ridge) / 2, z + side * half / 2); scl.set(sw + 0.005, 0.03, run);
      B.get('matte').shape('box', pos, q, scl, col);
      B.get('matte').sphere(sx, eave - 0.07, z + side * half, sw * 0.95, col, 0.15, 0.04, 'sphereLo');
    }
  }
  B.get('glowSoft').box(x, eave - 0.04, z, hx * 2 - 0.2, 0.02, hz * 2 - 0.2, '#fff1d6');
  // 屋脊上一块店招（店色底、金边、上下两条暖光）
  B.get('matte').box(x, ridge + 0.26, z, hx * 1.3, 0.4, 0.08, deep);
  B.get('facadeBronze').box(x, ridge + 0.26, z, hx * 1.3 + 0.08, 0.48, 0.05, GOLD);
  for (const dy of [0.06, 0.46]) B.get('glow').box(x, ridge + dy, z, hx * 1.2, 0.025, 0.1, WARM);
}

/** 休憩花园：石材长花池（灌木和花）+ 一棵树（樱花或棕榈交替）+ 两侧木面长椅 */
function garden(B, it, y0) {
  const { x, z, hx, hz } = it, rand = rng(Math.round(Math.abs(x * 7 + z * 13)) + 1), along = hx >= hz;
  B.get('travertine').box(x, y0 + 0.25, z, along ? hx * 2 - 2.2 : 1.6, 0.5, along ? 1.6 : hz * 2 - 2.2, '#e6dfd2');
  for (let k = 0; k < 14; k++) {
    const s = (rand() - 0.5) * (Math.max(hx, hz) * 2 - 2.8), t = (rand() - 0.5) * 1.2;
    B.get('foliage').sphere(x + (along ? s : t), y0 + 0.62, z + (along ? t : s), 0.22 + rand() * 0.12, rand() < 0.5 ? LEAF : FLOWERS[k % FLOWERS.length], undefined, undefined, 'sphereLo');
  }
  if (it.seed % 2) blossom(B, { x, z, r: 0.9 }, y0 + 0.0, it.seed + 3); else palm(B, IDENTITY, { u: x, v: z, r: 0.9 }, y0, it.seed * 11 + 2);
  for (const sg of [-1, 1]) {
    const bx = along ? x : x + sg * (hx - 0.35), bz = along ? z + sg * (hz - 0.35) : z, w = along ? hx * 2 - 1.2 : 0.5, d = along ? 0.5 : hz * 2 - 1.2;
    B.get('satin').box(bx, y0 + 0.2, bz, w * 0.9, 0.4, d * 0.9, '#efe9df');
    B.get('wood').box(bx, y0 + 0.43, bz, w, 0.06, d, '#a77f58');
  }
}
