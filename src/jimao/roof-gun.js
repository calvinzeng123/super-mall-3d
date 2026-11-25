// 丧尸围城：楼顶的机枪阵地（第五轮重做）。
// 用户实玩以后：「扫完一边另一边又串得很快串过来了，在塔台上打几下就重伤了因为怪太多了，能不能设置一个障碍物？或者是另一种样式的机枪？
//   更爽的固定枪械？（只设置一把在楼顶中间 公寓）如果是住宅的话就是单侧」。丧尸不减，改成「工事 + 更狠的枪」：
// 每栋楼只有一座（ROOF_GUN.sites）：
//   公寓：楼顶中间那一条（停机位在正中，往西让开旋翼和登机门），360 度都能转；台子四周一圈八角形沙袋墙，只留两个口子——
//     东口（朝停机位，两个楼梯间出来的尸流都往这儿汇，正对着枪，也是下来去登机的路）、西口（窄，外面是挨着女儿墙那条过道，过道里铺满铁丝网）。
//     南北两边再各拉一道铁丝网横在两个楼梯口过来的路上：尸流在枪口下面挤成一堆、走得很慢。绕到背后（西口）要钻过道里的铁丝网，又远又慢。
//   北区 1 号楼：东南角（屋顶太小，停机位、旋翼、登机门占了东半边中间），只打一面：射界 180 度朝西（楼梯间出口、整片屋面都在里面，
//     背后是女儿墙、北侧一道沙袋墙，丧尸只能从正面来），正面斜拉一道铁丝网，口子留在停机位南边那一条（正对着枪）。
// 工事全是真的：沙袋墙进导航（实心障碍，人、丧尸、队友都绕着走）、挡子弹 / 挡视线到它的顶高（0.95 米，站在台上往下打打得过去，
//   贴着墙的丧尸腿脚被挡着）、直升机上往下看也挡（castAcross 按同一份导航）；铁丝网不挡路，踩进去的丧尸走得很慢、一点点掉血（snare）；
//   丧尸看得见人、中间隔着沙袋墙就不直着扑（zombie.js 问 G.lowCover），跟着寻路绕到口子。开局才摆进导航（只摆这一局那栋楼的），换楼 / 关掉模式撤掉。
// 枪：双联重机枪（twin-hmg.js）：两根粗枪管轮流打，榴弹 / 燃烧弹落点炸一小团、把一堆掀开；子弹不限，连打 6 秒半才过热（原来三秒多）。
// 上台：走到梯子口按 E（手机上是交互键）。站上台子、动不了、视线就是枪口；再按 E 或跳就下来，手里还是原来那把枪（架着枪时不能切枪）。
// 压力（台子不是无敌的）：丧尸只认梯子口那一点——你的「脚」在梯子口（人的位置留在梯子底下，丧尸、队友、寻路都按它算，镜头抬到台面上）。
//   架着枪时贴着梯子口同时最多 bite.cap 只在咬（其余的围着等），咬过一口的隔 bite.cool 秒才咬下一口；
//   巨尸一巴掌、胖尸的气浪会把你从台上掀下来，扑袭者扑上来会把你拽下来；喷酸者的酸够不着台上。
// 什么时候能用：丧尸围城、这一局那栋楼的楼顶上、直升机还没落稳（守屋顶、点信号弹之前都行）。落稳（开始登机）、阵亡、读档 / 重开（reset）自动下来；坐飞机、看炸楼时不能用。
import * as THREE from 'three';
import { NAV } from '../layout/nav.js';
import { sandbagGeometry, DRESS } from './dressing.js';
import { createTwinHmg } from './twin-hmg.js';

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/**
 * 八角形的一圈沙袋墙（台子的局部坐标：+z 是梯子那一面），边心距 a 米；gaps：{ 第几条边（0 在 +z，按 45 度往 +x 转）: 口子多宽 }。
 * 每条边两头各多出 0.15 米（拐角压严实），有口子的边从正中断开。返回 [[x0, z0, x1, z1], ...]
 */
export function ringWalls(a, gaps = {}) {
  const h = a * Math.tan(Math.PI / 8) + 0.15, out = [];
  for (let k = 0; k < 8; k++) {
    const f = (k * Math.PI) / 4, nx = Math.sin(f), nz = Math.cos(f), tx = Math.cos(f), tz = -Math.sin(f), cx = nx * a, cz = nz * a, g = gaps[k];
    if (g) { out.push([cx - tx * h, cz - tz * h, cx - tx * g / 2, cz - tz * g / 2], [cx + tx * g / 2, cz + tz * g / 2, cx + tx * h, cz + tz * h]); }
    else out.push([cx - tx * h, cz - tz * h, cx + tx * h, cz + tz * h]);
  }
  return out;
}

/**
 * deck：台面边长、高度、护栏高、梯子口宽；ring：环形枪架半径、导轨离台面多高、枪的耳轴再高出导轨 gun 米；
 * gunEye：人眼在耳轴后面、上面多少米（顺着枪身量：人站在枪后面握着握把，枪往下压，人跟着探身——枪在画面里一直待在下面那一截、不挡准星；平端时眼睛离台面正好 eye 米）；
 * traverse：枪架最快每秒转多少弧度（转身打背后的一秒出头）；foot：梯子口那一点离台边多远（丧尸、队友都认这一点是「你」）；use：离梯子口多近能上；
 * climb / down：上、下台子的镜头过渡几秒；burst：站在台上挨胖尸炸开的那一下打几折；band：台子挡子弹 / 视线的方盒从多高到多高（下面那截导航障碍自己挡到 1.15 米）；
 * gun：双联重机枪改哪几项（twin-hmg.js 的 TWIN_HMG）；desk / touch：辅助瞄准（键鼠弱、触屏强）；aim：辅助瞄准管多远；
 * bite：架着枪时梯子口 reach 米内同时最多 cap 只在咬（巨尸算两只），咬过一口的 cool 秒以后才咬下一口；
 * bags：沙袋墙多厚、挡到多高；wire：铁丝网管多宽（离网的中线 r 米以内算踩进去）、踩进去走多快（巨尸 brute）、每秒掉多少血（每 tick 秒结一次）；
 * sites：每栋楼那一座（x, z 台子正中；face 梯子朝哪；arc 射界多宽，Infinity 不限、正中朝 face；walls 沙袋墙、wire 铁丝网都是台子的局部坐标 [x0, z0, x1, z1]，+z 朝 face；
 *   posts：架着枪时两个队友站哪（阿哲、林医生），局部坐标）
 */
export const ROOF_GUN = Object.freeze({
  deck: Object.freeze({ size: 2.4, h: 1.6, rail: 1.0, gap: 0.72 }),
  ring: Object.freeze({ r: 0.9, y: 1.02, gun: 0.18 }), eye: 1.62, gunEye: Object.freeze([0.9, 0.42]), ladder: 0.15, traverse: 2.6,
  foot: 0.7, use: 1.8, climb: 0.45, down: 0.3, burst: 0.5,
  band: Object.freeze([1.15, 1.5]),
  gun: Object.freeze({}),
  desk: Object.freeze({ assistCone: 0.06, assistPull: 0.8, assistPullIdle: 0, bulletCone: 0.02 }),
  touch: Object.freeze({ assistCone: 0.16, assistPull: 2.4, assistPullIdle: 1.0, bulletCone: 0.06 }),
  aim: 70,
  bite: Object.freeze({ cap: 2, reach: 2.4, cool: 1.9 }),
  bags: Object.freeze({ thick: 0.7, top: 0.95 }),
  wire: Object.freeze({ r: 0.95, slow: 0.45, brute: 0.7, dps: 3, tick: 0.5 }),
  sites: Object.freeze({
    // 公寓：屋面 38 × 74 米，停机位在正中 (-35, -214)、旋翼半径 5.3、登机门在机身西边 (-36.8, -213.8)，信号弹在东边。
    // 台子放在中间那一条、往西 11.5 米：沙袋墙最东一点离旋翼轴 6.9 米、离登机门 5 米，西边离女儿墙留一条 2.3 米的过道。梯子朝东（东口进来就到，下来去登机也近）；从西口钻进来的要绕过台子才到梯子口
    A: Object.freeze([Object.freeze({ x: -46.5, z: -214, face: Object.freeze([1, 0]), arc: Infinity, name: '机枪阵地',
      walls: Object.freeze(ringWalls(4.6, { 0: 1.6, 4: 2.0 })),
      // 西边过道（女儿墙和沙袋墙之间）口子南北两段、贴着西北 / 西南两条斜边外面各一段（绕到西口去的贴着墙走也得蹚过去）；
      // 南北两条横在两个楼梯口过来的路上（离停机位、旋翼、信号弹都远）
      wire: Object.freeze([[1.3, -6.15, 6.6, -6.15], [-1.3, -6.15, -6.6, -6.15], [2.51, -5.76, 5.76, -2.51], [-2.51, -5.76, -5.76, -2.51], [10.5, -3.5, 10.5, 11.5], [-10.5, -3.5, -10.5, 11.5]]),
      posts: Object.freeze([[2.9, -1.6], [-2.9, -1.6]]) })]),
    // 北区 1 号楼：屋面 36 × 16 米，中间一道机房（两个楼梯间，出口是机房朝东那头的过道口，约 (-256, -235)），东半边停机位 (-249.2, -232)、登机门在机身南边。
    // 台子顶在东南角（背后、南边都是女儿墙），梯子朝西；北边一道沙袋墙（挡住从停机位、信号弹那边绕过来的），后面再补一截把台子和女儿墙之间的缝堵死。
    // 射界 180 度、正中朝西：楼梯间出口在正中偏右 14 度、停机位在右前 43 度，整片丧尸能走到的屋面都在里面；正面斜拉一道铁丝网，口子留在它和停机位之间
    T1: Object.freeze([Object.freeze({ x: -244.0, z: -238.2, face: Object.freeze([-1, 0]), arc: Math.PI, name: '机枪阵地',
      walls: Object.freeze([[-1.4, -1.55, 3.25, -1.55], [2.9, -1.55, 2.9, 3.0]]),
      wire: Object.freeze([[-1.4, 6.4, 3.2, 9.4]]),
      posts: Object.freeze([[1.9, -0.5], [1.9, 0.8]]) })]),
  }),
});

/**
 * 一座台子在世界里的样子（纯函数）。y：屋面高度。返回 { x, y, z, yaw（模型绕 y 转多少：模型里梯子在 +z 那一面）, poly（导航障碍：台子连梯子的占地）, bb,
 * foot（梯子口那一点，屋面上）, seat（人站在台上时眼睛在哪）, walls（沙袋墙：{ a, b, poly（导航里那一块）, len, rot }）, wire（铁丝网：{ a, b }）,
 * posts（队友站哪）, arc（射界）, center（射界正中朝哪，按人的 yaw 算） }
 */
export function siteGeom(site, y, R = ROOF_GUN) {
  const [fx, fz] = site.face, yaw = Math.atan2(fx, fz), h = R.deck.size / 2, c = Math.cos(yaw), s = Math.sin(yaw);
  const w = (lx, lz) => [site.x + lx * c + lz * s, site.z - lx * s + lz * c];
  const poly = [w(-h, -h), w(h, -h), w(h, h + R.ladder), w(-h, h + R.ladder)];
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const [footX, footZ] = w(0, h + R.ladder + R.foot), t = R.bags.thick / 2;
  const walls = (site.walls || []).map(([x0, z0, x1, z1]) => {
    const L = Math.hypot(x1 - x0, z1 - z0) || 1e-6, ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = -uz * t, nz = ux * t;
    return { a: w(x0, z0), b: w(x1, z1), len: L, rot: Math.atan2(-(z1 - z0), x1 - x0), local: [x0, z0, x1, z1],
      poly: [w(x0 + nx, z0 + nz), w(x1 + nx, z1 + nz), w(x1 - nx, z1 - nz), w(x0 - nx, z0 - nz)] };
  });
  const wire = (site.wire || []).map(([x0, z0, x1, z1]) => ({ a: w(x0, z0), b: w(x1, z1), local: [x0, z0, x1, z1] }));
  return { x: site.x, y, z: site.z, yaw, poly, bb: { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) },
    foot: new THREE.Vector3(footX, y, footZ), seat: new THREE.Vector3(site.x, y + R.deck.h + R.eye, site.z), walls, wire,
    posts: (site.posts || []).map(([lx, lz]) => { const [x, z] = w(lx, lz); return new THREE.Vector3(x, y, z); }),
    arc: site.arc ?? Infinity, center: Math.atan2(-fx, -fz) };
}

/** 点到线段的水平距离 */
export function segDist2(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L));
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}
/** 两条线段相交（含端点） */
function cross(ax, az, bx, bz, cx, cz, dx, dz) {
  const d = (x0, z0, x1, z1, x2, z2) => (x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0);
  const d1 = d(cx, cz, dx, dz, ax, az), d2 = d(cx, cz, dx, dz, bx, bz), d3 = d(ax, az, bx, bz, cx, cz), d4 = d(ax, az, bx, bz, dx, dz);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
/** a → b 这条线（水平）穿不穿过这几道沙袋墙（任何一块的四条边） */
export function wallsBetween(walls, a, b) {
  for (const wl of walls) { const p = wl.poly; for (let i = 0; i < 4; i++) { const q = p[i], r = p[(i + 1) % 4]; if (cross(a.x, a.z, b.x, b.z, q[0], q[1], r[0], r[1])) return true; } }
  return false;
}

/** 导航里临时加一块实心障碍（floor 那一层，poly 一圈）：墙线 + 障碍多边形，和 buildNav 里的家具一样（墙按 8 米一格登记）。top：矮障碍（沙袋墙）挡子弹 / 视线只挡到这么高。返回撤掉时用的那一份 */
export function blockNav(nav, floor, poly, top = null) {
  const F = nav.floors.get(floor); if (!F) return null;
  // 和别的楼层共用一份墙的（标准层）先拆开——楼顶不会，保险起见
  if (F.sharedPlan) { F.walls = F.walls.slice(); F.obstacles = F.obstacles.slice(); F.grid = new Map([...F.grid].map(([k, v]) => [k, v.slice()])); F.sharedPlan = null; }
  const i0 = F.walls.length, c = NAV.cell, pad = NAV.r + 0.05, keys = new Set();
  poly.forEach((p, k) => { const q = poly[(k + 1) % poly.length]; F.walls.push({ x0: p[0], z0: p[1], x1: q[0], z1: q[1], ...(top == null ? {} : { top }) }); });
  for (let i = i0; i < F.walls.length; i++) {
    const w = F.walls[i];
    for (let gx = Math.floor((Math.min(w.x0, w.x1) - pad) / c); gx <= Math.floor((Math.max(w.x0, w.x1) + pad) / c); gx++)
      for (let gz = Math.floor((Math.min(w.z0, w.z1) - pad) / c); gz <= Math.floor((Math.max(w.z0, w.z1) + pad) / c); gz++) {
        const k = `${gx},${gz}`; if (!F.grid.has(k)) F.grid.set(k, []); F.grid.get(k).push(i); keys.add(k);
      }
  }
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const ob = { outer: poly.map((p) => [p[0], p[1]]), holes: [], bb: { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }, roofGun: true, ...(top == null ? {} : { top }) };
  F.obstacles.push(ob);
  return { floor, i0, n: poly.length, keys: [...keys], ob };
}
/** 撤掉 blockNav 加的那一块（后加的先撤）。墙线只能从最后面摘：不是最后那几段（中间又加过别的）就原地压成一个点——不挡路 */
export function unblockNav(nav, b) {
  const F = b && nav.floors.get(b.floor); if (!F) return;
  const i = F.obstacles.indexOf(b.ob); if (i >= 0) F.obstacles.splice(i, 1);
  if (F.walls.length === b.i0 + b.n) {
    F.walls.length = b.i0;
    for (const k of b.keys) { const l = F.grid.get(k); if (!l) continue; const r = l.filter((j) => j < b.i0); if (r.length) F.grid.set(k, r); else F.grid.delete(k); }
  } else for (let j = b.i0; j < b.i0 + b.n; j++) { const w = F.walls[j]; if (w) Object.assign(w, { x1: w.x0, z1: w.z0 }); }
}

const ease = (k) => k * k * (3 - 2 * k);

/** 材质：原游戏的程序化 PBR（和枪一个质感）；没有材质库（测试）就用后备 */
function mat(G, name, fallback) {
  try { const m = G?.mats?.get?.(name, { triplanar: true }); if (m) return m; } catch { /* 用后备 */ }
  return new THREE.MeshStandardMaterial(fallback);
}

/** 台子的模型（不含枪）：钢挡板、四根角柱、花纹钢板台面、护栏（梯子那面留口）、踢脚板、直梯、环形枪架。模型里梯子在 +z 那一面，原点在台子正下方的屋面上 */
function buildDeck(G, M, R = ROOF_GUN) {
  const D = R.deck, s = D.size, h = D.h, half = s / 2, byMat = new Map();
  const put = (m, geo, x, y, z, rx = 0, ry = 0, rz = 0) => { geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z); (byMat.get(m) || byMat.set(m, []).get(m)).push(geo); };
  const box = (m, w, hh, d, x, y, z, ry = 0) => put(m, new THREE.BoxGeometry(w, hh, d), x, y, z, 0, ry);
  const bar = (m, x0, y0, z0, x1, y1, z1, r = 0.028) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), L = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, L, 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    (byMat.get(m) || byMat.set(m, []).get(m)).push(g);
  };
  for (const [x, z, w, d] of [[0, half, s, 0.05], [0, -half, s, 0.05], [half, 0, 0.05, s], [-half, 0, 0.05, s]]) box(M.olive, w - 0.1, h - 0.2, d, x, 0.08 + (h - 0.2) / 2, z);
  for (const [x, z] of [[half, half], [-half, half], [half, -half], [-half, -half]]) { box(M.steel, 0.12, h, 0.12, x, h / 2, z); box(M.dark, 0.22, 0.03, 0.22, x, 0.015, z); }
  for (const z of [-half + 0.02, half - 0.02]) box(M.dark, s, 0.08, 0.06, 0, h * 0.55, z);
  for (const x of [-half + 0.02, half - 0.02]) box(M.dark, 0.06, 0.08, s, x, h * 0.55, 0);
  box(M.deck, s + 0.08, 0.07, s + 0.08, 0, h - 0.035, 0);
  const top = h + D.rail, mid = h + D.rail / 2, g2 = D.gap / 2;
  const posts = [[half, half], [-half, half], [half, -half], [-half, -half], [half, 0], [-half, 0], [0, -half], [g2, half], [-g2, half]];
  for (const [x, z] of posts) bar(M.rail, x, h, z, x, top, z, 0.03);
  for (const y of [top, mid]) {
    bar(M.rail, -half, y, -half, half, y, -half); bar(M.rail, half, y, -half, half, y, half); bar(M.rail, -half, y, -half, -half, y, half);
    bar(M.rail, -half, y, half, -g2, y, half); bar(M.rail, g2, y, half, half, y, half);
  }
  for (const [x, z, w, d] of [[0, -half, s, 0.03], [half, 0, 0.03, s], [-half, 0, 0.03, s], [-(half + g2) / 2, half, half - g2, 0.03], [(half + g2) / 2, half, half - g2, 0.03]]) box(M.rail, w, 0.12, d, x, h + 0.06, z);
  const lz = half + R.ladder - 0.05;
  for (const x of [-0.24, 0.24]) { bar(M.steel, x, 0, lz, x, top, lz, 0.025); bar(M.steel, x, h - 0.05, half, x, h - 0.05, lz, 0.022); }
  for (let y = 0.3; y < h + 0.01; y += 0.3) bar(M.steel, -0.24, y, lz, 0.24, y, lz, 0.016);
  const ry = h + R.ring.y, rr = R.ring.r;
  put(M.dark, new THREE.TorusGeometry(rr, 0.026, 8, 40), 0, ry, 0, Math.PI / 2);
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2, cx = Math.cos(a), cz = Math.sin(a); bar(M.dark, cx * (rr + 0.12), h, cz * (rr + 0.12), cx * rr, ry - 0.04, cz * rr, 0.025); }
  // 台面上两箱备用弹药（木箱）
  for (const [x, z, r] of [[-0.75, -0.75, 0.2], [0.78, -0.72, -0.15]]) { box(M.wood, 0.5, 0.28, 0.32, x, h + 0.14, z, r); box(M.dark, 0.52, 0.03, 0.06, x, h + 0.27, z, r); }
  return group(byMat);
}
/** 按材质合成一个网格一份 */
function group(byMat) {
  const g = new THREE.Group(), geos = [];
  for (const [m, list] of byMat) {
    const geo = mergeAll(list); geos.push(geo);
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  }
  return { group: g, dispose() { geos.forEach((q) => q.dispose()); } };
}

/**
 * 工事的模型（台子的局部坐标，和台子挂在同一个组下）：沙袋墙（dressing.js 的沙袋，按墙长拉伸铺满）、铁丝网（蛇腹形的螺旋铁丝 + 一溜钢钎 + 顶上一道直铁丝，
 * 两头各一个木头拒马）。返回 { group, dispose }
 */
function buildWorks(G, M, site, R = ROOF_GUN) {
  const root = new THREE.Group(); root.name = '机枪阵地 · 工事';
  const bag = sandbagGeometry(), walls = site.walls || [];
  let n = 0; const per = walls.map(([x0, z0, x1, z1]) => { const L = Math.hypot(x1 - x0, z1 - z0); const k = Math.max(1, Math.round(L / DRESS.length)); n += k; return k; });
  const bags = new THREE.InstancedMesh(bag, M.sand, Math.max(1, n)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), at = new THREE.Vector3();
  let i = 0;
  walls.forEach(([x0, z0, x1, z1], wi) => {
    const L = Math.hypot(x1 - x0, z1 - z0), k = per[wi], rot = Math.atan2(-(z1 - z0), x1 - x0);
    q.setFromAxisAngle(up, rot); sc.set(L / (k * DRESS.length), 1, 1.05);
    for (let j = 0; j < k; j++) { const t = (j + 0.5) / k; at.set(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t); m4.compose(at, q, sc); bags.setMatrixAt(i++, m4); }
  });
  bags.count = i; bags.instanceMatrix.needsUpdate = true; bags.castShadow = true; bags.receiveShadow = true; bags.computeBoundingSphere(); root.add(bags);
  // 铁丝网：蛇腹形螺旋（两卷错开半圈）、钢钎、顶丝、两头的拒马
  const steel = [], wood = [];
  for (const [x0, z0, x1, z1] of site.wire || []) {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, px = -uz, pz = ux, rr = 0.42, loops = Math.max(4, Math.round(L / 0.3));
    for (const [off, ph] of [[-0.22, 0], [0.22, Math.PI]]) {
      const pts = [];
      for (let k = 0; k <= loops * 10; k++) {
        const t = k / (loops * 10), a = t * loops * Math.PI * 2 + ph;
        pts.push(new THREE.Vector3(x0 + ux * L * t + px * (off + Math.cos(a) * rr * 0.55), rr + Math.sin(a) * rr, z0 + uz * L * t + pz * (off + Math.cos(a) * rr * 0.55)));
      }
      steel.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), loops * 10, 0.007, 3, false));
    }
    for (let d = 0; d <= L + 1e-6; d += 1.6) { const g = new THREE.CylinderGeometry(0.018, 0.022, 1.0, 5); g.translate(x0 + ux * d, 0.5, z0 + uz * d); steel.push(g); }
    { const g = new THREE.CylinderGeometry(0.005, 0.005, L, 3); g.rotateZ(Math.PI / 2); g.rotateY(Math.atan2(-uz, ux)); g.translate((x0 + x1) / 2, 0.95, (z0 + z1) / 2); steel.push(g); }
    for (const [ex, ez] of [[x0, z0], [x1, z1]]) for (const s of [-1, 1]) { // 拒马：两根斜撑交叉成 X，一根横梁穿过
      const g = new THREE.BoxGeometry(0.09, 1.25, 0.09); g.rotateZ(s * 0.75); g.rotateY(Math.atan2(-pz, px) + Math.PI / 2); g.translate(ex + ux * s * 0.3, 0.45, ez + uz * s * 0.3); wood.push(g);
    }
    for (const [ex, ez] of [[x0, z0], [x1, z1]]) { const g = new THREE.BoxGeometry(0.08, 0.08, 1.0); g.rotateY(Math.atan2(ux, uz)); g.translate(ex, 0.45, ez); wood.push(g); }
  }
  const byMat = new Map(); if (steel.length) byMat.set(M.wire, steel); if (wood.length) byMat.set(M.wood, wood);
  const rest = group(byMat); root.add(rest.group);
  return { group: root, dispose() { bag.dispose(); bags.dispose(); rest.dispose(); } };
}

/** 几何体按顺序拼成一个（都只留位置、法线、uv） */
function mergeAll(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  for (const g of list) g.dispose(); for (const g of parts) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); return out;
}

export const ROOF_GUN_CSS = `
/* 架着楼顶重机枪：换弹、瞄准、蹲、近战、手雷、换枪、治疗、路障这些键用不着；跳（下来）、交互（下来）、开火留着。步枪的子弹数也不显示 */
.jm-mg .t-reload, .jm-mg .t-ads, .jm-mg .t-crouch, .jm-mg .t-melee, .jm-mg .t-nade, .jm-mg .t-swap, .jm-mg .t-heal, .jm-mg .t-wall, .jm-mg .jm-walls, .jm-mg .jm-nade-hud { display: none !important; }
.jm-mg .h-ammo { display: none !important; }
`;

/**
 * 接到游戏上。siege：丧尸围城（哪栋楼、守没守、落没落）；director：任务系统（坐没坐载具）；camera：主相机（架着枪时抬到台面上）。
 * 返回 { update(dt), reset(), active（架着枪）, current（架着的那座）, list（这一局那栋楼的那一座）, mount(e), dismount(why), markers(), matePost(id), works（工事：沙袋墙、铁丝网，世界坐标）, dispose() }
 */
export function createRoofGun(G, { scene, nav, siege, director = null, camera, ui = null, R = ROOF_GUN }) {
  const root = new THREE.Group(); root.name = '楼顶机枪阵地'; scene?.add(root);
  const M = {
    olive: mat(G, 'hull_paint', { color: '#4a5634', metalness: 0.3, roughness: 0.65 }),
    steel: mat(G, 'steel_worn', { color: '#8a8f93', metalness: 0.85, roughness: 0.4 }),
    dark: mat(G, 'anodized_black', { color: '#202224', metalness: 0.6, roughness: 0.5 }),
    deck: mat(G, 'diamond_plate', { color: '#5b5f62', metalness: 0.8, roughness: 0.45 }),
    wood: mat(G, 'wood_dark', { color: '#5a4630', metalness: 0, roughness: 0.85 }),
    wire: mat(G, 'steel_dark', { color: '#5d6266', metalness: 0.85, roughness: 0.45 }),
    rail: new THREE.MeshStandardMaterial({ color: '#c9a136', metalness: 0.35, roughness: 0.55 }), // 黄色安全漆
    sand: new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.95, name: 'roofgun-sandbag' }), // 和路障一样的沙袋
  };
  const towers = new Map(); // 楼 id → [台子]（第一次轮到这栋楼才建）
  let on = null, cur = null, k = 0, said = false, sig = '', saidWhy = 0, lastNear = null, yaw0 = 0, burstNow = false, clock = 0;
  const baseDamage = G.player?.damage?.bind?.(G.player);
  if (baseDamage) G.player.damage = (n, ...rest) => { const b = burstNow; burstNow = false; return baseDamage(cur && b ? n * R.burst : n, ...rest); };
  const onBurst = () => { burstNow = true; };
  const S = () => siege?.state || {};
  const P = () => G.player;
  const roofY = (T) => nav.floors.get(T.roof)?.y ?? 0;
  const v0 = new THREE.Vector3(), ground = new THREE.Vector3();
  // 现在摆着的工事（世界坐标）：沙袋墙给 lowCover，铁丝网给 snare
  const works = { walls: [], wire: [], y: 0, floor: null };

  function build(T) {
    const y = roofY(T);
    return (R.sites[T.id] || []).map((site, i) => {
      const geo = siteGeom(site, y, R), group = new THREE.Group(); group.name = `${T.id}-${site.name}`;
      group.position.set(site.x, y, site.z); group.rotation.y = geo.yaw;
      const deck = buildDeck(G, M, R); group.add(deck.group);
      const fort = buildWorks(G, M, site, R); group.add(fort.group);
      const ring = new THREE.Group(); ring.position.y = R.deck.h + R.ring.y; group.add(ring);
      // 枪的耳轴在导轨上方 ring.gun 米：立柱正好落在导轨上
      const mount = new THREE.Object3D(); mount.position.set(0, R.ring.gun, R.ring.r); ring.add(mount);
      const gun = createTwinHmg(G, mount, { label: '双联重机枪 · 楼顶', cfg: R.gun, base: R.ring.gun });
      group.visible = false; root.add(group);
      return { id: `${T.id}-${i}`, site, name: site.name, tower: T, geo, group, ring, gun, deck, fort, blocks: null };
    });
  }
  /** 这一局那栋楼的台子和工事摆进导航、物理（挡路、挡子弹、挡直升机上的视线）；别的楼的撤掉。换了才动，动了就让寻路把楼顶的格子重新试走 */
  function sync() {
    const T = siege?.enabled && siege.plan ? siege.plan.tower : null, want = T?.id || null;
    if (want === on) return;
    if (on) for (const e of [...towers.get(on)].reverse()) place(e, false);
    if (cur) dismount();
    on = want;
    if (T) { if (!towers.has(T.id)) towers.set(T.id, build(T)); for (const e of towers.get(T.id)) place(e, true); }
    if (T) G.physics?.pathfinder?.forget?.(T.roof);
  }
  function place(e, yes) {
    const ph = G.physics, g = e.geo, B = R.band;
    if (yes && !e.blocks) {
      // 台子的挡板只到台面那么高（deck.h）：站在台上往下打、看台脚，从台边上过得去
      e.blocks = { nav: blockNav(nav, e.tower.roof, g.poly, R.deck.h), bags: g.walls.map((wl) => blockNav(nav, e.tower.roof, wl.poly, R.bags.top)),
        box: ph?.addBox?.(new THREE.Vector3(g.bb.x0, g.y + B[0], g.bb.z0), new THREE.Vector3(g.bb.x1, g.y + B[1], g.bb.z1), { surface: 'metal', tag: 'roof-gun' }) || null,
        occ: ph?.addOccluder?.({ x0: g.bb.x0, y0: g.y, z0: g.bb.z0, x1: g.bb.x1, y1: g.y + R.deck.h, z1: g.bb.z1 }, { surface: 'metal', tag: 'roof-gun' }) || null };
      works.walls.push(...g.walls); works.wire.push(...g.wire); works.y = g.y; works.floor = e.tower.roof;
    } else if (!yes && e.blocks) {
      for (const b of [...e.blocks.bags].reverse()) unblockNav(nav, b);
      unblockNav(nav, e.blocks.nav); if (e.blocks.box) ph?.removeBox?.(e.blocks.box); if (e.blocks.occ) ph?.removeOccluder?.(e.blocks.occ);
      e.blocks = null; G.physics?.pathfinder?.forget?.(e.tower.roof);
      works.walls = works.walls.filter((w) => !g.walls.includes(w)); works.wire = works.wire.filter((w) => !g.wire.includes(w));
      for (const z of G.zombies?.pool || []) z.snare = 1;
    }
    e.group.visible = yes;
    if (!yes) e.gun.reset();
  }
  /** 这条线（水平，同一层屋面上）穿不穿过沙袋墙：zombie.js 用它决定要不要直着扑 */
  const lowCover = (a, b) => !!works.walls.length && Math.abs(a.y - works.y) < 1.2 && Math.abs(b.y - works.y) < 1.2 && wallsBetween(works.walls, a, b);
  G.lowCover = lowCover;
  const list = () => (on ? towers.get(on) || [] : []);
  /** 现在能不能用：丧尸围城、在打、直升机还没落稳、没坐载具、没在看炸楼、人活着 */
  function usable() {
    const p = P();
    return !!(on && siege?.enabled && G.game?.state === 'playing' && !S().landed && !director?.riding && !siege?.demo?.running && p && p.alive !== false);
  }
  const onRoofFloor = (p) => !!p && !!on && Math.abs(p.y - roofY(list()[0].tower)) < 1.2;
  /** 离人最近、够得着的那座（梯子口 use 米内） */
  function near() {
    const p = P()?.pos; if (!p || !onRoofFloor(p)) return null;
    let best = null, bd = R.use;
    for (const e of list()) { const d = Math.hypot(e.geo.foot.x - p.x, e.geo.foot.z - p.z); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function pinFeet(e) {
    const p = P(); p.pos.copy(e.geo.foot); p.vel?.set?.(0, 0, 0);
    G.physics?.forget?.(p.pos); G.physics?.moveCapsule?.(p.pos, v0.set(0, 0, 0), 1e-4);
  }
  function mount(e) {
    const p = P(); if (!e || !p || cur || p.mounted) return false;
    cur = e; k = 0; p.mounted = true; pinFeet(e); yaw0 = p.yaw || 0;
    G.weapon?.setVisible?.(false); G.weaponHold = true;
    ui?.classList?.add('jm-mg');
    e.gun.tune(G.input?.touch ? R.touch : R.desk);
    G.events?.emit?.('roofgun:mount', { name: e.name });
    if (!said) { said = true; G.hud?.radio?.(`双联重机枪架好了：子弹管够、落点会炸，能连打六七秒才过热。${Number.isFinite(e.geo.arc) ? '它只打正面——背后、侧面有墙。' : '它们只能从沙袋墙的两个口子进来，盯紧梯子口。'} E / 跳 下来。`, 5); }
    else G.hud?.message?.(`${e.name} · 双联重机枪`, 1.2);
    return true;
  }
  /** 下来：人还站在梯子口，手里还是原来那把枪。why：给一句提示（被掀下来、被拽下来） */
  function dismount(why = '') {
    const e = cur; if (!e) return false;
    cur = null; lastNear = e; const p = P();
    if (p) { p.mounted = false; G.physics?.forget?.(p.pos); G.physics?.moveCapsule?.(p.pos, v0.set(0, 0, 0), 1e-4); }
    G.weaponHold = false; if (!director?.riding) G.weapon?.setVisible?.(true);
    ui?.classList?.remove('jm-mg'); G.input?.setPrompt?.(false);
    e.gun.update(0, { active: false });
    if (why && saidWhy <= 0) { saidWhy = 1.5; G.hud?.message?.(why, 1.8); }
    G.events?.emit?.('roofgun:dismount', { name: e.name, why });
    return true;
  }
  /** 架着枪时眼睛在哪：环形枪架跟着视线转，耳轴在枪架前沿；人眼在耳轴后上方（顺着枪身 gunEye），枪往下压人就探身 */
  function eyeOf(e, yaw, pitch, out) {
    const g = e.geo, hx = -Math.sin(yaw), hz = -Math.cos(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), [back, up] = R.gunEye;
    const px = g.x + hx * R.ring.r, py = g.y + R.deck.h + R.ring.y + R.ring.gun, pz = g.z + hz * R.ring.r;
    return out.set(px - hx * cp * back - hx * sp * up, py - sp * back + cp * up, pz - hz * cp * back - hz * sp * up);
  }
  function lift(e, t) {
    if (!camera || !e) return;
    ground.copy(camera.position);
    camera.position.lerpVectors(ground, e.eye || e.geo.seat, ease(Math.max(0, Math.min(1, t))));
    camera.updateMatrixWorld();
    P()?.eye?.copy?.(camera.position);
  }
  /** 在不在射界里（按人的 yaw 算：正中 center、左右各一半 arc） */
  const inArc = (e, yaw) => !Number.isFinite(e.geo.arc) || Math.abs(wrap(yaw - e.geo.center)) <= e.geo.arc / 2 + 1e-6;
  /** 辅助瞄准的目标：屋面上下 3 米内、aim 米内、射界里活着的丧尸（瞄胸口） */
  function targets(e) {
    const out = [], c = e.geo.seat;
    for (const z of G.zombies?.pool || []) {
      if (!z.active || !z.alive || Math.abs(z.pos.y - e.geo.y) > 3 || Math.hypot(z.pos.x - c.x, z.pos.z - c.z) > R.aim) continue;
      if (!inArc(e, Math.atan2(-(z.pos.x - c.x), -(z.pos.z - c.z)))) continue;
      out.push((z._aim ||= new THREE.Vector3()).set(z.pos.x, z.pos.y + 1.15 * (z.scale || 1), z.pos.z));
    }
    return out;
  }
  /**
   * 铁丝网：屋面上、离网的中线 wire.r 米以内的丧尸走得很慢（巨尸慢得少一点），每 tick 秒掉一次血；离开了恢复。守屋顶、清扫时都管
   */
  function snareTick(dt) {
    const W = R.wire, wl = works.wire;
    for (const z of G.zombies?.pool || []) {
      if (!z.active || !z.alive) continue;
      let inside = false;
      if (wl.length && Math.abs(z.pos.y - works.y) < 1) for (const w of wl) if (segDist2(z.pos.x, z.pos.z, w.a, w.b) < W.r) { inside = true; break; }
      if (!inside) { if (z.snare !== 1) z.snare = 1; z.wireT = 0; continue; }
      z.snare = z.kind === 'brute' ? W.brute : W.slow;
      if ((z.wireT = (z.wireT || 0) + dt) >= W.tick) { z.wireT -= W.tick; z.damage?.(W.dps * W.tick, (z._wp ||= new THREE.Vector3()).set(z.pos.x, z.pos.y + 0.6, z.pos.z), null, 'body', 'wire'); }
    }
  }
  /**
   * 架着枪时梯子口：bite.reach 米内同时最多 bite.cap 只在咬（巨尸一只顶两只）——正在抡的、和 bite.cool 秒内刚咬过一口的都算占着一个位置，
   * 再贴上来的压着出手的冷却、围着等（不然两个位置轮得飞快，一圈挤满了照样一秒三口）；刚咬过一口的这一口抡完，冷却拉长到 bite.cool 秒
   */
  function biteTick() {
    const f = cur?.geo.foot; if (!f) return;
    const B = R.bite, near = []; let n = 0;
    for (const z of G.zombies?.pool || []) {
      if (!z.active || !z.alive) continue;
      if (z.rgBit && z.zs !== 'attack') { z.rgBit = false; z.cool = Math.max(z.cool || 0, B.cool); }
      if (Math.abs(z.pos.y - f.y) > 1.4) continue;
      const d = Math.hypot(z.pos.x - f.x, z.pos.z - f.z); if (d > B.reach * (z.scale || 1)) continue;
      const w = z.kind === 'brute' ? 2 : 1;
      if (z.zs === 'attack' || z.zs === 'leap' || z.zs === 'pin' || clock - (z.rgLast ?? -99) < B.cool) n += w; else if ((z.cool || 0) < 0.1) near.push([d, z, w]); // 还在冷却的不用管：它这会儿本来就不咬
    }
    // 上一帧排上号的先排（不然挤成一圈、离得都差不多远，每帧换一批，谁也咬不上）
    near.sort((a, b) => (b[1].rgOk ? 1 : 0) - (a[1].rgOk ? 1 : 0) || a[0] - b[0]);
    for (const [, z, w] of near) { if (n + w <= B.cap) { n += w; z.rgOk = true; continue; } z.rgOk = false; z.cool = Math.max(z.cool || 0, 0.25); }
  }
  const onMelee = (ev) => { const z = ev?.enemy, f = cur?.geo.foot; if (z?.zombie && f && Math.hypot(z.pos.x - f.x, z.pos.z - f.z) < R.bite.reach * (z.scale || 1) + 0.5) { z.rgBit = true; z.rgLast = clock; } };

  function update(dt) {
    sync(); burstNow = false; clock += dt;
    saidWhy -= dt;
    const live = list(), demo = !!siege?.demo?.running, inp = G.input, ok = usable();
    for (const e of live) e.group.visible = !demo;
    snareTick(dt);
    if (cur && (!ok || P()?.mounted === false)) dismount();
    let left = false;
    if (cur) {
      const e = cur;
      if (k >= 0.6 && (inp?.pressed?.('interact') || inp?.pressed?.('jump'))) { dismount(); left = true; }
      else {
        k = Math.min(1, k + dt / R.climb);
        const p = P(); p.pos.copy(e.geo.foot); p.vel?.set?.(0, 0, 0);
        // 重机枪转得慢：这一帧视线左右转多了就压回去（镜头一起压）；北区那座只打一面：转出射界就停在边上
        const want = ((p.yaw - yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI, cap = R.traverse * dt;
        if (Math.abs(want) > cap) { const keep = Math.sign(want) * cap; camera.rotation.y -= want - keep; p.yaw = yaw0 + keep; }
        if (Number.isFinite(e.geo.arc)) {
          const rel = wrap(p.yaw - e.geo.center), half = e.geo.arc / 2;
          if (Math.abs(rel) > half) { const fix = Math.sign(rel) * half - rel; p.yaw += fix; camera.rotation.y += fix; }
        }
        yaw0 = p.yaw;
        e.ring.rotation.y = wrap(p.yaw + Math.PI - e.geo.yaw); // 枪架的 +z 朝视线水平方向
        eyeOf(e, p.yaw, Math.max(-e.gun.cfg.pitchDown, Math.min(e.gun.cfg.pitchUp, p.pitch || 0)), e.eye ||= new THREE.Vector3());
        lift(e, k);
        const firing = k >= 1 && !!(inp?.down?.('fire') || inp?.fire);
        e.gun.update(dt, { active: true, firing, camera, targets: targets(e) });
        biteTick();
        G.input?.setPrompt?.(true);
        for (const o of live) if (o !== e) o.gun.update(dt, { active: false });
        markSig('');
        return;
      }
    }
    if (k > 0 && !cur) { k = Math.max(0, k - dt / R.down); const e = lastNear || live[0]; if (e && k > 0) lift(e, k); }
    for (const e of live) e.gun.update(dt, { active: false });
    const e = ok && !P()?.mounted && !S().pin ? near() : null;
    if (e) { G.hud?.setPrompt?.(`架起双联重机枪 · ${e.name}`); if (!left && inp?.pressed?.('interact')) mount(e); }
    markSig(ok && onRoofFloor(P()?.pos) ? on : '');
  }
  function markSig(s) { if (s !== sig) { sig = s; G.game?.refreshObjective?.(); } }

  const onKnock = (ev) => { if (cur) dismount(ev?.burst ? '被气浪掀下了机枪台！' : '被巨尸从台上拍下来了！'); };
  const onPin = () => { if (cur) dismount('扑袭者把你从台上拽下来了！'); };
  const onDead = () => { if (cur) dismount(); k = 0; };
  G.events?.on?.('zombie:knock', onKnock); G.events?.on?.('zombie:pin', onPin); G.events?.on?.('player:dead', onDead); G.events?.on?.('zombie:burst', onBurst); G.events?.on?.('enemy:melee', onMelee);
  const MATES = ['zhe', 'lin'];

  return {
    update, mount, dismount, sync, works, lowCover,
    get active() { return !!cur; }, get current() { return cur; }, get list() { return list(); }, get tower() { return on; }, get blend() { return k; },
    /** 架着枪时队友站哪（squad.js 问）：阿哲、林医生各一处（台子边上、沙袋墙里面）；别的（小许）、没架着枪返回 null */
    matePost(id) { if (!cur) return null; const i = MATES.indexOf(id); return i >= 0 ? cur.geo.posts[i] || null : null; },
    markers() { if (!sig || cur) return []; return list().map((e) => ({ id: `mg-${e.id}`, short: '机枪', label: e.name, pos: e.geo.seat.clone().setY(e.geo.y + R.deck.h + 1.1), kind: 'supply' })); },
    reset() { if (cur) dismount(); k = 0; said = false; sig = ''; G.weaponHold = false; ui?.classList?.remove('jm-mg'); for (const L of towers.values()) for (const e of L) e.gun.reset(); sync(); },
    dispose() {
      if (cur) dismount(); for (const L of towers.values()) for (const e of [...L].reverse()) { place(e, false); e.gun.dispose(); e.deck.dispose(); e.fort.dispose(); }
      root.removeFromParent(); M.rail.dispose(); M.sand.dispose(); if (G.lowCover === lowCover) G.lowCover = null;
      G.events?.off?.('zombie:knock', onKnock); G.events?.off?.('zombie:pin', onPin); G.events?.off?.('player:dead', onDead); G.events?.off?.('zombie:burst', onBurst); G.events?.off?.('enemy:melee', onMelee);
      if (baseDamage) G.player.damage = baseDamage;
    },
  };
}
