// 丧尸围城：楼顶的重机枪台（用户：楼顶的僵尸太多，步枪备弹少——在楼顶搭个高台、架一挺重机枪，360 度都能扫，扫掉涌上来的，别让它们凑过来）。
// 只在丧尸围城里、这一局那栋楼的楼顶上有：公寓楼顶两座（两个楼梯间门口各盯一座），北区 1 号楼一座（屋顶 36 × 16 米，西半边隔着机房只通一道 0.9 米的门、看不见楼梯口，
// 东半边又是停机位、旋翼和登机门，只放得下一座）。丧尸的数量、波次一点不动（SIEGE.hold / waves / surge、TOWERS.*.hold 都不碰）。
// 高台：2.4 米见方、1.6 米高的钢架台，四面围着钢挡板、上面一圈护栏，一面挂直梯（护栏在梯子那儿留个口子）。导航里是实心障碍（人、丧尸、队友都绕着走），
//   挡子弹 / 挡视线（导航障碍按 1.15 米高的实体算，再补一个方盒到 1.5 米），直升机上往下看也挡（physics.addOccluder）。开局才摆进导航（只摆这一局那栋楼的），换楼 / 关掉模式撤掉。
// 枪：舱门机枪那一挺 M134（door-gun.js），挂在台面上一圈环形枪架上（和接应车车顶那挺一样：枪跟着视线绕人转一整圈，永远在人前面），左右不限、往下压得到台脚。
//   弹药不限，只会过热（打久了锁死、冷却了才能再打）；子弹能穿透，一排丧尸能连穿几只；辅助瞄准键鼠弱、触屏强。
// 上台：走到梯子口按 E（手机上是交互键）。站上台子、动不了、视线就是枪口；再按 E 或跳就下来，手里还是原来那把枪（架着枪时不能切枪）。
// 压力（台子不是无敌的）：丧尸只认梯子口那一点——你的「脚」在梯子口（人的位置留在梯子底下，丧尸、队友、寻路都按它算，镜头抬到台面上）。
//   扒在梯子口的照样抓你，同时最多 SIEGE.crowd.bite 只（原来那条咬人上限，守屋顶时 siege.js 的 biteCap 照管）；台子四面是钢板，别处够不着；
//   巨尸一巴掌、胖尸的气浪会把你从台上掀下来，扑袭者扑上来会把你拽下来；喷酸者照样往梯子口吐。
// 什么时候能用：丧尸围城、这一局那栋楼的楼顶上、直升机还没落稳（守屋顶、点信号弹之前都行）。落稳（开始登机）、阵亡、读档 / 重开（reset）自动下来；坐飞机、看炸楼时不能用。
import * as THREE from 'three';
import { NAV } from '../layout/nav.js';
import { createDoorGun } from './door-gun.js';

/**
 * deck：台面边长、高度、护栏高、梯子口宽；ring：环形枪架半径、导轨离台面多高（贴着护栏顶，往下看台脚不挡）、枪的转轴再高出导轨 gun 米
 *   （眼睛离台面 eye 米，转轴在眼睛下面 0.3 米——和接应车那挺一样，整挺枪都在视野里）；traverse：枪架最快每秒转多少弧度（重机枪转得慢：转身打背后的要一秒多）；
 * foot：梯子口那一点离台边多远（丧尸、队友都认这一点是「你」）；use：离梯子口多近能上；climb / down：上、下台子的镜头过渡几秒；
 * band：台子挡子弹 / 视线的方盒从多高到多高（下面那截导航障碍自己挡到 1.15 米）；
 * gun：重机枪（改 door-gun.js 的 DOOR_GUN）——每秒 13 发、一发 40（奔尸一发、行尸两发），能穿 1 只（穿过去打 0.6 折），
 *   热量 0.018 一发（连打 5 秒多锁死）、每秒散 0.3、冷到 0.35 才能再打（锁两秒多）；左右不限、往上 0.55、往下 1.35 弧度（压得到台脚）；
 * desk / touch：辅助瞄准（键鼠弱：4° 内只在开火时轻轻带一下；触屏强：9° 内、不开火也带）；aim：辅助瞄准管多远；
 * sites：每栋楼的台子在哪（x, z 台子正中，face 梯子朝哪个方向）。公寓：两个楼梯间门口各一座，梯子朝停机位；北区：东北角一座，梯子朝停机位那边
 */
export const ROOF_GUN = Object.freeze({
  deck: Object.freeze({ size: 2.4, h: 1.6, rail: 1.0, gap: 0.72 }),
  ring: Object.freeze({ r: 0.9, y: 1.02, gun: 0.3 }), eye: 1.62, ladder: 0.15, traverse: 2.0,
  foot: 0.7, use: 1.8, climb: 0.45, down: 0.3,
  band: Object.freeze([1.15, 1.5]),
  gun: Object.freeze({ rate: 13, damage: 40, spread: 0.018, heatPerShot: 0.018, cool: 0.3, unlock: 0.35, spinUp: 0.35, range: 160,
    yaw: Infinity, pitchUp: 0.55, pitchDown: 1.35, pierce: 1, pierceMul: 0.6 }),
  desk: Object.freeze({ assistCone: 0.07, assistPull: 0.9, assistPullIdle: 0, bulletCone: 0.025 }),
  touch: Object.freeze({ assistCone: 0.157, assistPull: 2.4, assistPullIdle: 1.0, bulletCone: 0.06 }),
  aim: 70,
  sites: Object.freeze({
    A: Object.freeze([Object.freeze({ x: -42, z: -231, face: Object.freeze([0, 1]), name: '一号机枪台' }), Object.freeze({ x: -28, z: -197, face: Object.freeze([0, -1]), name: '二号机枪台' })]),
    T1: Object.freeze([Object.freeze({ x: -244.6, z: -237.4, face: Object.freeze([0, 1]), name: '机枪台' })]),
  }),
});

/**
 * 一座台子在世界里的样子（纯函数）。y：屋面高度。返回 { x, y, z, yaw（模型绕 y 转多少：模型里梯子在 +z 那一面）, poly（导航障碍：台子连梯子的占地）,
 * bb, foot（梯子口那一点，屋面上）, seat（人站在台上时眼睛在哪） }
 */
export function siteGeom(site, y, R = ROOF_GUN) {
  const [fx, fz] = site.face, yaw = Math.atan2(fx, fz), h = R.deck.size / 2, c = Math.cos(yaw), s = Math.sin(yaw);
  const w = (lx, lz) => [site.x + lx * c + lz * s, site.z - lx * s + lz * c];
  const poly = [w(-h, -h), w(h, -h), w(h, h + R.ladder), w(-h, h + R.ladder)];
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const [footX, footZ] = w(0, h + R.ladder + R.foot);
  return { x: site.x, y, z: site.z, yaw, poly, bb: { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) },
    foot: new THREE.Vector3(footX, y, footZ), seat: new THREE.Vector3(site.x, y + R.deck.h + R.eye, site.z) };
}

/** 导航里临时加一块实心障碍（floor 那一层，poly 一圈）：墙线 + 障碍多边形，和 buildNav 里的家具一样（墙按 8 米一格登记）。返回撤掉时用的那一份 */
export function blockNav(nav, floor, poly) {
  const F = nav.floors.get(floor); if (!F) return null;
  // 和别的楼层共用一份墙的（标准层）先拆开——楼顶不会，保险起见
  if (F.sharedPlan) { F.walls = F.walls.slice(); F.obstacles = F.obstacles.slice(); F.grid = new Map([...F.grid].map(([k, v]) => [k, v.slice()])); F.sharedPlan = null; }
  const i0 = F.walls.length, c = NAV.cell, pad = NAV.r + 0.05, keys = new Set();
  poly.forEach((p, k) => { const q = poly[(k + 1) % poly.length]; F.walls.push({ x0: p[0], z0: p[1], x1: q[0], z1: q[1] }); });
  for (let i = i0; i < F.walls.length; i++) {
    const w = F.walls[i];
    for (let gx = Math.floor((Math.min(w.x0, w.x1) - pad) / c); gx <= Math.floor((Math.max(w.x0, w.x1) + pad) / c); gx++)
      for (let gz = Math.floor((Math.min(w.z0, w.z1) - pad) / c); gz <= Math.floor((Math.max(w.z0, w.z1) + pad) / c); gz++) {
        const k = `${gx},${gz}`; if (!F.grid.has(k)) F.grid.set(k, []); F.grid.get(k).push(i); keys.add(k);
      }
  }
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const ob = { outer: poly.map((p) => [p[0], p[1]]), holes: [], bb: { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }, roofGun: true };
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
  // 四面钢挡板（底下离地一点，露出角柱的脚）、四根角柱、台面（花纹钢板，比挡板宽一圈）
  for (const [x, z, w, d] of [[0, half, s, 0.05], [0, -half, s, 0.05], [half, 0, 0.05, s], [-half, 0, 0.05, s]]) box(M.olive, w - 0.1, h - 0.2, d, x, 0.08 + (h - 0.2) / 2, z);
  for (const [x, z] of [[half, half], [-half, half], [half, -half], [-half, -half]]) { box(M.steel, 0.12, h, 0.12, x, h / 2, z); box(M.dark, 0.22, 0.03, 0.22, x, 0.015, z); }
  for (const z of [-half + 0.02, half - 0.02]) box(M.dark, s, 0.08, 0.06, 0, h * 0.55, z); // 挡板中间一道横梁
  for (const x of [-half + 0.02, half - 0.02]) box(M.dark, 0.06, 0.08, s, x, h * 0.55, 0);
  box(M.deck, s + 0.08, 0.07, s + 0.08, 0, h - 0.035, 0);
  // 护栏：四角和每边正中立柱，上栏 rail、中栏一半高，踢脚板；梯子那面（+z）正中留 gap 宽的口子
  const top = h + D.rail, mid = h + D.rail / 2, g2 = D.gap / 2;
  const posts = [[half, half], [-half, half], [half, -half], [-half, -half], [half, 0], [-half, 0], [0, -half], [g2, half], [-g2, half]];
  for (const [x, z] of posts) bar(M.rail, x, h, z, x, top, z, 0.03);
  for (const y of [top, mid]) {
    bar(M.rail, -half, y, -half, half, y, -half); bar(M.rail, half, y, -half, half, y, half); bar(M.rail, -half, y, -half, -half, y, half);
    bar(M.rail, -half, y, half, -g2, y, half); bar(M.rail, g2, y, half, half, y, half);
  }
  for (const [x, z, w, d] of [[0, -half, s, 0.03], [half, 0, 0.03, s], [-half, 0, 0.03, s], [-(half + g2) / 2, half, half - g2, 0.03], [(half + g2) / 2, half, half - g2, 0.03]]) box(M.rail, w, 0.12, d, x, h + 0.06, z);
  // 直梯：两根梯帮从屋面一直伸到护栏顶（上下时扶手），踏棍隔 0.3 米
  const lz = half + R.ladder - 0.05;
  for (const x of [-0.24, 0.24]) { bar(M.steel, x, 0, lz, x, top, lz, 0.025); bar(M.steel, x, h - 0.05, half, x, h - 0.05, lz, 0.022); }
  for (let y = 0.3; y < h + 0.01; y += 0.3) bar(M.steel, -0.24, y, lz, 0.24, y, lz, 0.016);
  // 环形枪架：一圈导轨（环的圆心就是人站的地方），四根斜撑从台面撑上来
  const ry = h + R.ring.y, rr = R.ring.r;
  put(M.dark, new THREE.TorusGeometry(rr, 0.026, 8, 40), 0, ry, 0, Math.PI / 2);
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2, cx = Math.cos(a), cz = Math.sin(a); bar(M.dark, cx * (rr + 0.12), h, cz * (rr + 0.12), cx * rr, ry - 0.04, cz * rr, 0.025); }
  const group = new THREE.Group(), geos = [];
  for (const [m, list] of byMat) {
    const g = mergeAll(list); geos.push(g);
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  return { group, dispose() { geos.forEach((g) => g.dispose()); } };
}
/** 几何体按顺序拼成一个（都只留位置、法线、uv）：不引 BufferGeometryUtils 也行 */
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
 * 返回 { update(dt), reset(), active（架着枪）, current（架着的那座）, list（这一局那栋楼的几座）, mount(e), dismount(why), markers(), dispose() }
 */
export function createRoofGun(G, { scene, nav, siege, director = null, camera, ui = null, R = ROOF_GUN }) {
  const root = new THREE.Group(); root.name = '楼顶重机枪台'; scene?.add(root);
  const M = {
    olive: mat(G, 'hull_paint', { color: '#4a5634', metalness: 0.3, roughness: 0.65 }),
    steel: mat(G, 'steel_worn', { color: '#8a8f93', metalness: 0.85, roughness: 0.4 }),
    dark: mat(G, 'anodized_black', { color: '#202224', metalness: 0.6, roughness: 0.5 }),
    deck: mat(G, 'gunmetal', { color: '#5b5f62', metalness: 0.8, roughness: 0.45 }),
    rail: new THREE.MeshStandardMaterial({ color: '#c9a136', metalness: 0.35, roughness: 0.55 }), // 黄色安全漆
  };
  const towers = new Map(); // 楼 id → [台子]（第一次轮到这栋楼才建）
  let on = null, cur = null, k = 0, said = false, sig = '', saidWhy = 0, lastNear = null, yaw0 = 0;
  const S = () => siege?.state || {};
  const P = () => G.player;
  const roofY = (T) => nav.floors.get(T.roof)?.y ?? 0;
  const v0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), d0 = new THREE.Vector3(), ground = new THREE.Vector3();

  function build(T) {
    const y = roofY(T);
    return (R.sites[T.id] || []).map((site, i) => {
      const geo = siteGeom(site, y, R), group = new THREE.Group(); group.name = `${T.id}-${site.name}`;
      group.position.set(site.x, y, site.z); group.rotation.y = geo.yaw;
      const deck = buildDeck(G, M, R); group.add(deck.group);
      const ring = new THREE.Group(); ring.position.y = R.deck.h + R.ring.y; group.add(ring);
      // 枪的转轴在导轨上方 ring.gun 米：立柱（door-gun 的 post）正好落在导轨上
      const mount = new THREE.Object3D(); mount.position.set(0, R.ring.gun, R.ring.r); ring.add(mount);
      const gun = createDoorGun(G, mount, { label: '重机枪 · 楼顶', post: R.ring.gun - 0.11, drop: 0.24, flash: 0.8, cfg: R.gun });
      group.visible = false; root.add(group);
      return { id: `${T.id}-${i}`, site, name: site.name, tower: T, geo, group, ring, gun, deck, blocks: null };
    });
  }
  /** 这一局那栋楼的台子摆进导航、物理（挡路、挡子弹、挡直升机上的视线）；别的楼的撤掉。换了才动，动了就让寻路把楼顶的格子重新试走 */
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
      e.blocks = { nav: blockNav(nav, e.tower.roof, g.poly),
        box: ph?.addBox?.(new THREE.Vector3(g.bb.x0, g.y + B[0], g.bb.z0), new THREE.Vector3(g.bb.x1, g.y + B[1], g.bb.z1), { surface: 'metal', tag: 'roof-gun' }) || null,
        occ: ph?.addOccluder?.({ x0: g.bb.x0, y0: g.y, z0: g.bb.z0, x1: g.bb.x1, y1: g.y + R.deck.h, z1: g.bb.z1 }, { surface: 'metal', tag: 'roof-gun' }) || null };
    } else if (!yes && e.blocks) {
      unblockNav(nav, e.blocks.nav); if (e.blocks.box) ph?.removeBox?.(e.blocks.box); if (e.blocks.occ) ph?.removeOccluder?.(e.blocks.occ);
      e.blocks = null; G.physics?.pathfinder?.forget?.(e.tower.roof);
    }
    e.group.visible = yes;
    if (!yes) { e.gun.reset(); }
  }
  const list = () => (on ? towers.get(on) || [] : []);
  /** 现在能不能用：丧尸围城、在打、直升机还没落稳、没坐载具、没在看炸楼、人活着、人在这栋楼的屋面上 */
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
  /** 人的脚放到梯子口那一点（丧尸、队友、寻路都认它），导航状态重新登记 */
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
    if (!said) { said = true; G.hud?.radio?.('重机枪架好了：子弹管够，打久了会过热——过热就松开扳机等一下。梯子口是它们唯一够得着你的地方，盯紧。E / 跳 下来。', 5); }
    else G.hud?.message?.(`${e.name} · 重机枪`, 1.2);
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
  /** 镜头：从人眼（原游戏这一帧算好的）过渡到台面上那一点（t 0 → 1） */
  function lift(e, t) {
    if (!camera || !e) return;
    ground.copy(camera.position);
    camera.position.lerpVectors(ground, e.geo.seat, ease(Math.max(0, Math.min(1, t))));
    camera.updateMatrixWorld();
    P()?.eye?.copy?.(camera.position);
  }
  /** 辅助瞄准的目标：屋面上下 3 米内、aim 米内活着的丧尸（瞄胸口） */
  function targets(e) {
    const out = [], c = e.geo.seat;
    for (const z of G.zombies?.pool || []) {
      if (!z.active || !z.alive || Math.abs(z.pos.y - e.geo.y) > 3 || Math.hypot(z.pos.x - c.x, z.pos.z - c.z) > R.aim) continue;
      out.push((z._aim ||= new THREE.Vector3()).set(z.pos.x, z.pos.y + 1.15 * (z.scale || 1), z.pos.z));
    }
    return out;
  }

  function update(dt) {
    sync();
    saidWhy -= dt;
    const live = list(), demo = !!siege?.demo?.running, inp = G.input, ok = usable();
    for (const e of live) e.group.visible = !demo;
    if (cur && (!ok || P()?.mounted === false)) dismount(); // 落稳了、上飞机了、倒下了、被别处放下来了
    let left = false; // 这一帧刚按键下来：同一下不再算成「上去」
    if (cur) {
      const e = cur;
      if (k >= 0.6 && (inp?.pressed?.('interact') || inp?.pressed?.('jump'))) { dismount(); left = true; }
      else {
        k = Math.min(1, k + dt / R.climb);
        const p = P(); p.pos.copy(e.geo.foot); p.vel?.set?.(0, 0, 0);
        // 重机枪转得慢：这一帧视线左右转多了就压回去（镜头一起压）
        const want = ((p.yaw - yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI, cap = R.traverse * dt;
        if (Math.abs(want) > cap) { const keep = Math.sign(want) * cap; camera.rotation.y -= want - keep; p.yaw = yaw0 + keep; }
        yaw0 = p.yaw;
        lift(e, k);
        // 环形枪架跟着视线转（枪永远在人前面），枪自己左右不限、上下按射界
        e.group.getWorldQuaternion(q0).invert(); camera.getWorldDirection(d0).applyQuaternion(q0);
        e.ring.rotation.y = Math.atan2(d0.x, d0.z);
        const firing = k >= 1 && !!(inp?.down?.('fire') || inp?.fire);
        e.gun.update(dt, { active: true, firing, camera, targets: targets(e) });
        // 屏幕中间那行「按住 E」的提示不出（正压在台脚那片要扫的地方）；手机上的交互键照样亮着（按它下来）
        G.input?.setPrompt?.(true);
        for (const o of live) if (o !== e) o.gun.update(dt, { active: false });
        markSig('');
        return;
      }
    }
    // 下台子：镜头从台面上落回人眼
    if (k > 0 && !cur) { k = Math.max(0, k - dt / R.down); const e = lastNear || live[0]; if (e && k > 0) lift(e, k); }
    for (const e of live) e.gun.update(dt, { active: false });
    const e = ok && !P()?.mounted && !S().pin ? near() : null;
    if (e) { G.hud?.setPrompt?.(`架起重机枪 · ${e.name}`); if (!left && inp?.pressed?.('interact')) mount(e); }
    markSig(ok && onRoofFloor(P()?.pos) ? on : '');
  }
  /** 罗盘 / 屏幕上的标记变了（上了楼顶、架上枪、下来）：让 HUD 重建一下标记 */
  function markSig(s) { if (s !== sig) { sig = s; G.game?.refreshObjective?.(); } }

  const onKnock = (ev) => { if (cur) dismount(ev?.burst ? '被气浪掀下了机枪台！' : '被巨尸从台上拍下来了！'); };
  const onPin = () => { if (cur) dismount('扑袭者把你从台上拽下来了！'); };
  const onDead = () => { if (cur) dismount(); k = 0; };
  G.events?.on?.('zombie:knock', onKnock); G.events?.on?.('zombie:pin', onPin); G.events?.on?.('player:dead', onDead);

  return {
    update, mount, dismount, sync,
    get active() { return !!cur; }, get current() { return cur; }, get list() { return list(); }, get tower() { return on; }, get blend() { return k; },
    /** HUD 标记：屋面上、没架着枪时，这栋楼的几座台子 */
    markers() { if (!sig || cur) return []; return list().map((e) => ({ id: `mg-${e.id}`, short: '机枪', label: e.name, pos: e.geo.seat.clone().setY(e.geo.y + R.deck.h + 1.1), kind: 'supply' })); },
    /** 每局开始 / 读档 / 重开：先下来、枪冷下来，再按这一局那栋楼摆台子 */
    reset() { if (cur) dismount(); k = 0; said = false; sig = ''; G.weaponHold = false; ui?.classList?.remove('jm-mg'); for (const L of towers.values()) for (const e of L) e.gun.reset(); sync(); },
    dispose() {
      if (cur) dismount(); for (const L of towers.values()) for (const e of [...L].reverse()) { place(e, false); e.gun.dispose(); e.deck.dispose(); }
      root.removeFromParent(); M.rail.dispose(); G.events?.off?.('zombie:knock', onKnock); G.events?.off?.('zombie:pin', onPin); G.events?.off?.('player:dead', onDead);
    },
  };
}
