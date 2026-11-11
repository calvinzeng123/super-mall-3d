// 一期样板中庭（游览模式，布局见 layout/p1-atrium.js 和 p1-expansion-spec.js 的 ATRIUM_STEPS）。
// 照用户的预想图：四根白色树形柱从 1F 直通到光穹下面散开；每层洞口边是白色弧形栏板 + 暖光灯带 + 垂下来的绿植花槽；
// 1F 中庭地面上一座螺旋雕塑喷泉、一座叠石跌水，棕榈花池和休息沙发；中庭上空三组金色光环吊灯；两块竖向大屏。
// 跨楼层的东西（树形柱）按楼层切段画进各层自己的批次，楼层分开显示（爆炸视图、只看某层）时各段跟着自己那层走。
import * as THREE from 'three';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN, rng } from '../textures.js';
import { pointInPoly, lrectPoly, toW } from '../../layout/geom.js';

const WHITE = '#f3f0ea', GOLD = '#c8a25a', WARM = '#ffd9a0', LEAF = '#4f7f3c', LEAF2 = '#3d6a32';
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
    if (lv.elev > 0) balcony(ctx, L.shellBatch, lv);
  }
  if (rf && ctx.levels[rf.id]) canopies(ctx.levels[rf.id].batch, F, f, rf.elev);
  const L1 = ctx.levels['P1-1F'];
  fountain(L1.batch, F, f.fountain, lv1.elev);
  cascade(L1.batch, F, f.cascade, lv1.elev);
  for (const p of f.palms) palm(L1.batch, F, p, lv1.elev, p.u * 7 + p.v);
  for (const s of f.lounges) lounge(L1.batch, F, s, lv1.elev);
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
        B.get('glowSoft').sphere(prev.x, prev.y, prev.z, 0.16, WARM);
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
  const v = lv.voids.find((x) => x.id === 'C-void');
  if (!v) return;
  const gaps = [];
  for (const e of ctx.layout.escalators) for (const end of [[e.top, e.to], [e.bottom, e.from]]) if (end[1] === lv.id) gaps.push([end[0].x, end[0].z, 4.2]);
  for (const g of ctx.layout.elevators) if (g.type === 'glass' && g.serves.includes(lv.id)) { const [x, z] = toW(g.frame, g.lu, g.lv); gaps.push([x, z, 3]); }
  const skip = (x, z) => gaps.some(([gx, gz, r]) => Math.hypot(x - gx, z - gz) < r);
  const rand = rng(lv.elev * 13 + 7), P = v.poly, y = lv.elev, roof = lv.kind === 'roof';
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
      B.get('glow').box(mx + nx * 0.19, y - 0.84, mz + nz * 0.19, pl, 0.045, 0.03, WARM, ang);
      if (roof || skip(mx, mz)) continue;
      // 花槽挂在栏板外侧：浅色槽身、上面一排鼓起来的灌木团，几串小叶子垂下来，偶尔开花
      B.get('matte').box(mx + nx * 0.34, y - 0.2, mz + nz * 0.34, pl, 0.26, 0.28, '#ece8df', ang);
      for (let q = 0; q < 3; q++) {
        const s = (q - 1) * pl * 0.32 + (rand() - 0.5) * 0.2;
        B.get('foliage').sphere(mx + ux * s + nx * 0.36, y - 0.02, mz + uz * s + nz * 0.36, 0.3, rand() < 0.5 ? LEAF : LEAF2, 0.18, 0.2, 'sphereLo');
      }
      const vines = rand() < 0.35 ? 0 : 1 + Math.floor(rand() * 2);
      for (let q = 0; q < vines; q++) {
        const s = (rand() - 0.5) * pl * 0.9, L = 0.5 + rand() * (lv.height > 5 ? 1.7 : 1.2), sway = (rand() - 0.5) * 0.25;
        for (let d = 0.1; d < L; d += 0.13) {
          const t = d / L, jx = Math.sin(d * 7 + s * 3) * 0.05;
          B.get('foliage').sphere(mx + ux * (s + jx + sway * t) + nx * (0.47 + t * 0.06), y - 0.3 - d, mz + uz * (s + jx + sway * t) + nz * (0.47 + t * 0.06), 0.085 - 0.03 * t, rand() < 0.5 ? '#5f9447' : '#4a803c', 0.07, 0.04, 'ico0');
        }
      }
      if (rand() < 0.5) for (let q = 0; q < 3; q++) {
        const s = (rand() - 0.5) * pl * 0.85;
        B.get('foliage').sphere(mx + ux * s + nx * (0.3 + rand() * 0.15), y + 0.1, mz + uz * s + nz * (0.3 + rand() * 0.15), 0.09 + rand() * 0.04, FLOWERS[Math.floor(rand() * FLOWERS.length)], undefined, undefined, 'sphereLo');
      }
    }
  }
}

/** 螺旋雕塑喷泉：石材池沿、水面、两条绕着上升的金色/白色缎带（9 米高），一圈水柱拱向中间 */
function fountain(B, F, p, y0) {
  B.frame(F, () => {
    const { u, v, r } = p;
    B.get('travertine').cyl(u, y0, v, r, 0.55, '#e8e1d4', 48);
    B.get('satin').cyl(u, y0 + 0.55, v, r + 0.05, 0.06, '#f6f3ec', 48);
    B.get('water').cyl(u, y0 + 0.02, v, r - 0.25, 0.46, '#3f86a6', 48);
    B.get('travertine').cyl(u, y0, v, 1.1, 0.75, '#ddd4c4', 32);
    // 两条缎带：从底座盘旋到 9 米，半径从 1.3 收到 0.5
    const H = 9, turns = 2.2;
    for (const [phase, color, key] of [[0, GOLD, 'facadeBronze'], [Math.PI, '#eef1f2', 'metal']]) {
      let prev = null;
      for (let s = 0; s <= 64; s++) {
        const t = s / 64, a = phase + t * turns * Math.PI * 2, rad = 1.3 - 0.8 * t;
        const q = { x: u + Math.cos(a) * rad, y: y0 + 0.75 + t * H, z: v + Math.sin(a) * rad };
        if (prev) B.get(key).bar(prev, q, 0.22 - 0.1 * t, color);
        prev = q;
      }
    }
    B.get('glowSoft').sphere(u, y0 + 0.75 + H + 0.3, v, 0.28, WARM);
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
      B.get('foliage').sphere(u + Math.cos(a) * (r - 0.15), y0 + 0.66, v + Math.sin(a) * (r - 0.15), 0.16, rand() < 0.4 ? LEAF : FLOWERS[k % FLOWERS.length]);
    }
  });
}

/** 叠石跌水：椭圆水池，后半边叠起来的石头（3 米高），三道白色水帘落进池里，池边花草 */
function cascade(B, F, p, y0) {
  B.frame(F, () => {
    const { u, v, rx, rz } = p, rand = rng(77);
    B.get('travertine').sphere(u, y0 + 0.2, v, rx, '#d8cfbf', 0.4, rz);
    B.get('water').sphere(u, y0 + 0.36, v, rx - 0.35, '#3a7f9b', 0.12, rz - 0.35);
    // 石头堆在远离中庭中心的一侧（v 更负）
    const back = v - rz * 0.45;
    for (let k = 0; k < 26; k++) {
      const s = (rand() - 0.5) * rx * 1.6, h = rand();
      B.get('matte').sphere(u + s, y0 + 0.4 + h * 2.6 * (1 - Math.abs(s) / (rx * 0.9)), back - rand() * 1.2, 0.6 + rand() * 0.6, rand() < 0.5 ? '#8c8579' : '#a39b8c', 0.45 + rand() * 0.35, 0.55 + rand() * 0.3);
    }
    for (const s of [-1.6, 0, 1.6]) {
      const top = y0 + 2.4 - Math.abs(s) * 0.5;
      B.get('glowSoft').box(u + s, (top + y0 + 0.4) / 2, back + 0.55, 0.9, top - y0 - 0.4, 0.04, '#e8f4f6');
      B.get('glowSoft').sphere(u + s, y0 + 0.42, back + 0.8, 0.5, '#f4fbfc', 0.08, 0.35);
    }
    for (let k = 0; k < 34; k++) {
      const a = Math.PI * 0.05 + (k / 34) * Math.PI * 0.9;
      B.get('foliage').sphere(u + Math.cos(a) * (rx - 0.1), y0 + 0.45, v + Math.sin(a) * (rz - 0.1), 0.18, rand() < 0.45 ? LEAF : FLOWERS[k % FLOWERS.length]);
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
      B.get('foliage').sphere(u + Math.cos(a) * d, y0 + 0.62, v + Math.sin(a) * d, 0.16, rand() < 0.5 ? LEAF : FLOWERS[k % FLOWERS.length]);
    }
    const H = 5.5 + rand() * 1.8, lean = (rand() - 0.5) * 0.5, la = rand() * Math.PI * 2;
    let prev = { x: u, y: y0 + 0.55, z: v };
    for (let s = 1; s <= 8; s++) {
      const t = s / 8, q = { x: u + Math.cos(la) * lean * t * t, y: y0 + 0.55 + H * t, z: v + Math.sin(la) * lean * t * t };
      B.get('wood').bar(prev, q, 0.24 - 0.08 * t, '#8a7259');
      prev = q;
    }
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + rand() * 0.3, len = 2.2 + rand() * 0.9;
      let fp = prev;
      for (let s = 1; s <= 4; s++) {
        const t = s / 4, q = { x: prev.x + Math.cos(a) * len * t, y: prev.y + 0.6 * t - 1.6 * t * t, z: prev.z + Math.sin(a) * len * t };
        B.get('foliage').bar(fp, q, 0.36 - 0.2 * t, k % 2 ? LEAF : LEAF2);
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
  });
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
