// 零点突围：第二把枪和刀。原游戏只有一把步枪（「近战」键是空的）。这里加：
//   手枪「P17」：半自动，12 发弹匣，打身体三枪、打头一两枪；开镜快，后坐小；套筒会后坐复进、打空挂机，
//               换弹是倾枪 → 退弹匣 → 上新弹匣 →（打空时）释放套筒；
//   战术刀：近战键（V / F，手机「近战」键）随时出刀——不管手里拿的是哪把枪，刺完自动换回来；也可以切到 3 号位一直拿着刀；
//           2.3 米内、准星附近的敌人中刀掉 150 血（步枪手、突击手、狙击手一刀，重装兵两刀）。
//   切枪：1 步枪 / 2 手枪 / 3 刀，Q 换回上一把，滚轮轮换；手机上多一个「切枪」键。切的时候先把手里的放下去、再把新的举起来。
// 两个新模型都是照着原游戏步枪握把的位置搭的，手直接用步枪那双（克隆出来），所以握持对得上。
// 对外：G.weapon 换成这里的「当前武器」代理（HUD、弹药补给、自动开火读的都是它），原来的步枪在 G.rifle。
// G.arms.setLowered(k) 给翻越用（翻的时候枪放低）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const PISTOL = Object.freeze({ name: 'P17 手枪', mag: 12, reserve: 48, reserveMax: 72, damage: 36, range: 90, interval: 0.115, holdInterval: 0.2,
  spreadHip: 0.022, spreadAds: 0.0035, reload: 1.45, reloadEmpty: 1.75, adsRate: 11, recoil: 0.011 });
export const KNIFE = Object.freeze({ name: '战术刀', damage: 150, reach: 2.3, cone: 0.9, time: 0.5, hitAt: 0.14, cooldown: 0.08, lunge: 2.6 });
export const SWAP = Object.freeze({ lower: 0.17 });
// 掏出来的动画各多长（秒）；quick 是近战键那种「马上要用」的快掏，不带花样
export const DRAW = Object.freeze({ rifle: 0.46, pistol: 0.64, knife: 0.58, quick: 0.13 });
export const SLOTS = Object.freeze(['rifle', 'pistol', 'knife']);
/** 步枪握把在枪模型里的位置（原游戏的 grip）：手枪、刀的握把都摆在这里，手才握得上 */
const GRIP = Object.freeze([0, -0.1, 0.073]);
const GRIP_TILT = -0.3; // 握把往前倾的角度（弧度）：步枪握把大约这么斜
/** 托枪的左手相对握把中心的位置和偏转（照着截图调出来的） */
const LEFT_HAND = { x: 0, y: 0.035, z: -0.014, yaw: 0.15 };
/** 右手肘在枪模型里大概的位置（小臂从握把往后、往右下伸到这里） */
const ELBOW = new THREE.Vector3(0.15, -0.33, 0.48);

// ---- 几何小工具 ----
/** 按顶点位置重写 UV（一米 = 贴图一格），和原游戏的做法一样：它的金属、聚合物材质都是按米铺的 */
function metricUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ax > 0.5) uv.setXY(i, p.getZ(i), p.getY(i)); else if (ay > 0.5) uv.setXY(i, p.getX(i), p.getZ(i)); else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}
const box = (w, h, d, x = 0, y = 0, z = 0, r = 0, rx = 0) => {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
};
const cyl = (r0, r1, len, x, y, z, seg = 14, axis = 'z') => {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg);
  if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
};
const merged = (parts) => { const g = mergeGeometries(parts.map((q) => (q.index ? q.toNonIndexed() : q))); g.computeVertexNormals(); return metricUV(g); };

/**
 * 手枪的几何：坐标原点在握把中心（之后整体挪到步枪握把的位置），−z 朝前，y 朝上。
 * 返回 { frame, slide, dark, mag, trigger, dots, muzzle, eject, sightY }：frame 是聚合物套筒座，slide 是钢套筒（开火时往后走），
 * dark 是套筒上的防滑纹、抛壳窗、照门缺口这些深色细节（跟着套筒动），mag 是弹匣，dots 是三点白光瞄具。
 */
export function pistolGeometry() {
  const t = GRIP_TILT, top = 0.05;
  // 套筒座：握把（前后有弧面、带防滑块）、扳机护圈、防尘盖（下面有导轨槽）、海狸尾
  const frame = [
    box(0.03, 0.108, 0.05, 0, 0, 0, 0.008, t),
    box(0.032, 0.05, 0.004, 0, -0.008, 0.0255, 0.001, t), box(0.032, 0.05, 0.004, 0, -0.004, -0.0255, 0.001, t), // 握把前后的防滑块
    box(0.0325, 0.06, 0.03, 0, -0.008, 0, 0.002, t),                                                              // 两侧握把片
    box(0.027, 0.022, 0.15, 0, top + 0.011, -0.058, 0.004),                                                       // 防尘盖 / 机匣座
    box(0.024, 0.012, 0.03, 0, top + 0.012, 0.03, 0.004),                                                         // 海狸尾
    box(0.012, 0.0045, 0.05, 0, top - 0.031, -0.04, 0.002), box(0.012, 0.03, 0.0045, 0, top - 0.017, -0.064, 0.002), // 扳机护圈：底、前
    box(0.012, 0.012, 0.012, 0, top - 0.026, -0.014, 0.003, 0.5),                                                 // 护圈和握把的过渡
  ];
  for (const z of [-0.075, -0.09, -0.105]) frame.push(box(0.0275, 0.004, 0.006, 0, top - 0.002, z));             // 导轨槽之间的筋
  // 套筒：主体（顶上两条棱倒角）、枪口、照门、准星
  const sy = top + 0.036, sz = -0.04, slide = [
    box(0.0268, 0.027, 0.186, 0, sy, sz, 0.0045),
    cyl(0.0078, 0.0078, 0.012, 0, sy - 0.002, sz - 0.094, 14),                                                    // 枪管口
    box(0.0045, 0.006, 0.006, -0.0052, sy + 0.0165, sz + 0.082), box(0.0045, 0.006, 0.006, 0.0052, sy + 0.0165, sz + 0.082), // 照门两个柱
    box(0.016, 0.003, 0.008, 0, sy + 0.0135, sz + 0.082),
    box(0.0036, 0.0055, 0.006, 0, sy + 0.0163, sz - 0.082),                                                       // 准星
    box(0.006, 0.012, 0.012, -0.0146, top + 0.018, -0.012, 0.001),                                                // 套筒挡板（左侧）
  ];
  // 深色细节：后部防滑纹（两侧各 7 道）、抛壳窗、枪口内孔、扳机
  const dark = [];
  for (let i = 0; i < 7; i++) for (const x of [-0.0136, 0.0136]) dark.push(box(0.0006, 0.019, 0.0022, x, sy - 0.001, sz + 0.058 + i * 0.0045 - 0.002, 0, 0.18));
  dark.push(box(0.012, 0.0008, 0.03, 0.006, sy + 0.0138, sz - 0.004), box(0.0008, 0.011, 0.03, 0.0137, sy + 0.006, sz - 0.004)); // 抛壳窗（顶、右侧）
  dark.push(cyl(0.0046, 0.0046, 0.0125, 0, sy - 0.002, sz - 0.0945, 12));
  const trigger = [box(0.006, 0.02, 0.005, 0, top - 0.014, -0.03, 0.002, 0.25)];
  // 弹匣：斜插在握把里，底板露在外面
  const mag = [box(0.021, 0.1, 0.034, 0, -0.004, 0, 0.002, t), box(0.0305, 0.008, 0.052, 0, -0.058, 0.0165, 0.003, t)];
  const dots = [];
  for (const x of [-0.0052, 0.0052]) dots.push(new THREE.CircleGeometry(0.0011, 10).translate(x, sy + 0.0172, sz + 0.0851));
  dots.push(new THREE.CircleGeometry(0.0012, 10).translate(0, sy + 0.0172, sz - 0.0789));
  return { frame: merged(frame), slide: merged(slide), dark: merged(dark), mag: merged(mag), trigger: merged(trigger), dots: mergeGeometries(dots),
    muzzle: [0, sy - 0.002, sz - 0.1], eject: [0.014, sy + 0.008, sz - 0.004], sightY: sy + 0.0185, slideTravel: 0.032 };
}

/**
 * 战术刀的几何：原点在握把中心，握把沿着步枪握把的方向（斜着朝上朝前），刀尖朝握把上端。
 * 返回 { blade, handle, guard }。blade 是带血槽的单刃刀身（17 厘米），handle 是有防滑纹的握把，guard 是护手和尾锤。
 */
export function knifeGeometry() {
  const s = new THREE.Shape();
  // 刀身轮廓（x 是刃宽方向，y 是刀长）：刀背平直，刀刃从护手处鼓出去、到刀尖收拢
  s.moveTo(-0.012, 0); s.lineTo(0.013, 0); s.lineTo(0.016, 0.05); s.quadraticCurveTo(0.016, 0.13, -0.004, 0.172); s.lineTo(-0.012, 0.15); s.lineTo(-0.012, 0); s.closePath();
  const bladeG = new THREE.ExtrudeGeometry(s, { depth: 0.0032, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0016, bevelSegments: 1 });
  bladeG.translate(0, 0, -0.0016); bladeG.rotateY(Math.PI / 2);   // 刀面转到竖着（刃宽沿 z）
  bladeG.translate(0, 0.062, 0);
  const fuller = box(0.0048, 0.085, 0.004, 0, 0.062 + 0.06, -0.004);  // 血槽（深色）
  const handle = [cyl(0.0135, 0.0125, 0.105, 0, 0, 0, 12, 'y')];
  handle[0].scale(0.82, 1, 1.25);
  for (let i = 0; i < 6; i++) handle.push(cyl(0.0142, 0.0142, 0.004, 0, -0.04 + i * 0.016, 0, 12, 'y').scale(0.82, 1, 1.25));
  const guard = [box(0.011, 0.008, 0.052, 0, 0.058, 0, 0.003), box(0.014, 0.012, 0.03, 0, -0.058, 0, 0.004)];
  const rot = (g) => { g.rotateX(GRIP_TILT); return g; };
  return { blade: rot(metricUV(bladeG.index ? bladeG.toNonIndexed() : bladeG)), fuller: rot(metricUV(fuller.toNonIndexed())), handle: rot(merged(handle)), guard: rot(merged(guard)) };
}

const ease = (k) => k * k * (3 - 2 * k);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** 换弹进行到 k（0–1）时各部件在哪：{ tilt, magDrop, hand, slide }，都是 0–1。empty：打空了，最后要释放套筒 */
export function reloadPose(k, empty = false) {
  const seg = (a, b) => clamp01((k - a) / (b - a));
  const tilt = ease(seg(0, 0.14)) * (1 - ease(seg(0.82, 1)));
  const out = ease(seg(0.14, 0.3)), back = ease(seg(0.34, 0.62));
  return { tilt, magDrop: out * (1 - back), hand: out * (1 - ease(seg(0.56, 0.74))), slide: empty ? 1 - ease(seg(0.72, 0.78)) : 0, magIn: k >= 0.62 };
}
/**
 * 掏枪 / 掏刀进行到 k（0–1）时的姿势。都从「在下面」（drop = 1）开始，k = 1 时全部归零。
 *   手枪：从枪套里抽上来，绕扳机护圈转一整圈（spin 是还剩多少弧度没转完），左手跟上来（hand 1 → 0）拉一下套筒（rack 0 → 1 → 0，枪往里侧一歪 cant）；
 *   刀：  抽上来往上一抛（toss），刀在手里前后翻一整圈（spin）接住，手腕一抖（flick）摆好；
 *   步枪：从右下斜着甩上来（cant：枪身侧倾 → 摆正），顶到肩上有个回弹（snap）。
 * plain：不带花样，只是举起来（近战键的快掏、刺完换回原来那把）。
 */
export function drawPose(slot, k, plain = false) {
  k = clamp01(k);
  const seg = (a, b) => clamp01((k - a) / (b - a)), out = (x) => 1 - (1 - x) * (1 - x) * (1 - x), bump = (x) => Math.sin(clamp01(x) * Math.PI);
  const zero = { drop: 0, spin: 0, toss: 0, rack: 0, hand: 0, cant: 0, snap: 0, flick: 0 };
  if (plain) return { ...zero, drop: 1 - ease(k) };
  if (slot === 'pistol') return { ...zero, drop: 1 - out(seg(0, 0.36)), spin: (1 - out(seg(0.03, 0.56))) * Math.PI * 2, hand: 1 - ease(seg(0.5, 0.66)), rack: bump(seg(0.64, 0.92)), cant: bump(seg(0.56, 1)) };
  if (slot === 'knife') return { ...zero, drop: 1 - out(seg(0, 0.34)), spin: (1 - out(seg(0.04, 0.64))) * Math.PI * 2, toss: bump(seg(0.04, 0.64)), flick: bump(seg(0.64, 1)) };
  return { ...zero, drop: 1 - out(seg(0, 0.55)), cant: 1 - ease(seg(0.12, 0.72)), snap: bump(seg(0.66, 1)) * (1 - seg(0.66, 1)) };
}
/** 出刀进行到 k（0–1）时刀的位置：{ back, thrust, sweep }。先往右后收一下，再往前往左刺出去，然后收回 */
export function slashPose(k) {
  const wind = ease(clamp01(k / 0.2)) * (1 - ease(clamp01((k - 0.2) / 0.12)));
  const thrust = ease(clamp01((k - 0.18) / 0.14)) * (1 - ease(clamp01((k - 0.42) / 0.5)));
  return { back: wind, thrust, sweep: ease(clamp01((k - 0.2) / 0.3)) * (1 - ease(clamp01((k - 0.6) / 0.4))) };
}
/** 刀能不能刺到这个敌人：水平距离、高差、和视线方向的夹角。eye 是眼睛位置，(fx, fy, fz) 是视线方向 */
export function knifeReaches(eye, fx, fy, fz, enemy, reach = KNIFE.reach, cone = KNIFE.cone) {
  const dx = enemy.pos.x - eye.x, dy = enemy.pos.y + 1.1 - eye.y, dz = enemy.pos.z - eye.z, d = Math.hypot(dx, dy, dz);
  if (d > reach || d < 1e-3) return d < 1e-3;
  return Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy + dz * fz) / d))) <= cone;
}

export function createArsenal(G, { camera, layer = 0, ui = null }) {
  const rifle = G.weapon, rifleVm = camera.children.find((c) => /^viewmodel/.test(c.name || '')) || null;
  // 自己的材质（原游戏那几种枪用材质要配它自己的顶点数据，直接拿来用会发白）：深色磷化钢、哑光聚合物、亮钢
  const M = {
    slide: new THREE.MeshStandardMaterial({ color: 0x1d1f22, metalness: 0.62, roughness: 0.48 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x151617, metalness: 0.08, roughness: 0.66 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x070808, metalness: 0.3, roughness: 0.85 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 1, roughness: 0.2 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x1b1c1a, metalness: 0.05, roughness: 0.78 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xf2f2ee, toneMapped: false }),
    flash: new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  };
  const mesh = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; parent.add(m); return m; };
  // 步枪上的两只手（材质叫 glove_fabric 的两个组：先右后左）
  const hands = rifleVm ? rifleVm.children.filter((c) => c.isGroup && c.children[0]?.material?.name === 'glove_fabric') : [];
  const cloneHand = (i, parent) => { if (!hands[i]) return null; const h = hands[i].clone(true); parent.add(h); return h; };

  // ---- 手枪 ----
  const pg = pistolGeometry();
  const pistolRoot = new THREE.Group(); pistolRoot.name = 'viewmodel-p17';
  const pBody = new THREE.Group(); pBody.position.set(...GRIP); pistolRoot.add(pBody);
  mesh(pg.frame, M.frame, pBody);
  const pSlide = new THREE.Group(); pBody.add(pSlide);
  mesh(pg.slide, M.slide, pSlide); mesh(pg.dark, M.dark, pSlide); mesh(pg.dots, M.dot, pSlide);
  const pTrigger = mesh(pg.trigger, M.dark, pBody);
  // 转枪的轴：扳机护圈正中（食指穿过去的地方）
  pg.trigger.computeBoundingBox();
  const pPivot = pg.trigger.boundingBox.getCenter(new THREE.Vector3()), pBase = new THREE.Vector3(...GRIP);
  const pMag = new THREE.Group(); pBody.add(pMag); mesh(pg.mag, M.frame, pMag);
  const flash = new THREE.Group(); flash.position.set(pg.muzzle[0], pg.muzzle[1], pg.muzzle[2] - 0.03); pBody.add(flash);
  // 枪口焰：一张中心亮、四周带几道火舌的贴图，正面一片、侧面两片交叉
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,240,1)'); grad.addColorStop(0.25, 'rgba(255,214,140,0.9)'); grad.addColorStop(0.6, 'rgba(255,150,60,0.28)'); grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,220,160,0.55)'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 29, 32 + Math.sin(a) * 29); g.stroke(); }
    M.flash.map = new THREE.CanvasTexture(c); M.flash.map.colorSpace = THREE.SRGBColorSpace;
  }
  { const q = mesh(new THREE.PlaneGeometry(0.075, 0.075), M.flash, flash); q.position.z = -0.005; }
  for (const r of [0.6, -0.6]) { const q = mesh(new THREE.PlaneGeometry(0.05, 0.11), M.flash, flash); q.rotation.set(Math.PI / 2, r, 0); q.position.z = -0.03; }
  flash.visible = false;
  const pRight = cloneHand(0, pistolRoot), pLeft = cloneHand(1, pistolRoot);
  // 左手从护木挪到握把左前方托住右手。步枪上左手是掌心朝上托着护木（手指绕着枪管方向弯）；
  // 托手枪要掌心朝右贴住握把、手指绕着握把弯、小臂从左下后方伸过来——整体转一下：x → −z，y → +x，z → −y，再跟着握把的倾角斜过去。
  const leftBase = new THREE.Vector3();
  if (pLeft) {
    const R = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0));
    pLeft.updateMatrix();
    const m = new THREE.Matrix4().makeTranslation(GRIP[0] + LEFT_HAND.x, GRIP[1] + LEFT_HAND.y, GRIP[2] + LEFT_HAND.z)
      .multiply(new THREE.Matrix4().makeRotationX(GRIP_TILT)).multiply(new THREE.Matrix4().makeRotationY(LEFT_HAND.yaw)).multiply(R)
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.255)).multiply(pLeft.matrix);
    m.decompose(pLeft.position, pLeft.quaternion, pLeft.scale);
    leftBase.copy(pLeft.position);
  }

  // ---- 刀 ----
  const kg = knifeGeometry();
  // 整个模型挂在「手肘」下面（knifeRoot 的原点就是手肘）：出刀时绕手肘转，前臂和刀挥出去，手肘留在右下方不动
  const knifeRoot = new THREE.Group(); knifeRoot.name = 'viewmodel-knife';
  const kArm = new THREE.Group(); kArm.position.copy(ELBOW).negate(); knifeRoot.add(kArm);
  const kBody = new THREE.Group(); kBody.position.set(...GRIP); kArm.add(kBody);
  mesh(kg.blade, M.steel, kBody); mesh(kg.fuller, M.dark, kBody); mesh(kg.handle, M.grip, kBody); mesh(kg.guard, M.slide, kBody);
  cloneHand(0, kArm);
  // 平时的握姿（刀尖朝前上方、往里斜）和这个姿势下手肘在镜头里的位置
  const K_IDLE = new THREE.Euler(-0.42, 0.3, 0.38), K_ELBOW = new THREE.Vector3(0.105, -0.085, -0.4).add(ELBOW.clone().applyEuler(K_IDLE));

  for (const root of [pistolRoot, knifeRoot]) { root.visible = false; camera.add(root); root.traverse((o) => { if (layer) o.layers.set(layer); }); }

  // ---- 状态 ----
  const P = { ammo: PISTOL.mag, reserve: PISTOL.reserve, cool: 0, held: 0, ads: 0, adsLin: 0, slide: 0, locked: false, reload: null, kick: 0, kickV: 0, flip: 0, flipV: 0, flashT: 0, spread: PISTOL.spreadHip, lastShot: -9, bob: 0, swayX: 0, swayY: 0, sprint: 0, finger: 0 };
  const K = { t: -1, cool: 0, hit: false, bob: 0, swayX: 0, swayY: 0, sprint: 0 };
  const S = { cur: 'rifle', prev: 'pistol', next: null, phase: null, t: 0, drop: 0, lowered: 0, shown: true, quick: null, plain: false, pose: null, racked: false, time: 0 };
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), e1 = new THREE.Euler();
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const rootOf = (slot) => (slot === 'pistol' ? pistolRoot : slot === 'knife' ? knifeRoot : rifleVm);
  const rand = () => (G.rng?.fork ? Math.random() : Math.random());

  function muzzleWorld(out = new THREE.Vector3()) { pBody.updateWorldMatrix(true, false); return out.set(...pg.muzzle).applyMatrix4(pBody.matrixWorld); }
  function fireDir(spread) {
    camera.getWorldDirection(v1);
    if (spread > 0) { const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * spread; v2.set(Math.cos(a) * r, Math.sin(a) * r, 0).applyQuaternion(camera.getWorldQuaternion(q1)); v1.add(v2).normalize(); }
    return v1;
  }
  function shootPistol() {
    P.ammo--; P.cool = PISTOL.interval; P.held = 0; P.lastShot = S.time; P.slide = 1; P.locked = P.ammo <= 0;
    const origin = camera.getWorldPosition(v3).clone(), dir = fireDir(P.spread).clone();
    let hit = null;
    try { hit = G.combat?.playerShot?.(origin, dir, { damage: PISTOL.damage, range: PISTOL.range }) || null; } catch (e) { console.error('[零点突围] 手枪开火出错', e); }
    const muzzle = muzzleWorld();
    G.events?.emit?.('weapon:fire', { origin, dir, muzzle, ads: P.ads, kind: 'pistol' });
    G.fx?.tracer?.(muzzle, hit?.point || origin.clone().addScaledVector(dir, PISTOL.range));
    // 抛壳：往右上方甩
    pBody.updateWorldMatrix(true, false);
    const ej = v2.set(...pg.eject).applyMatrix4(pBody.matrixWorld).clone(), vel = new THREE.Vector3(1.8 + rand(), 1.4 + rand() * 0.6, 0.3 - rand() * 0.5).applyQuaternion(camera.getWorldQuaternion(q1));
    if (G.player?.vel) vel.add(G.player.vel);
    G.fx?.shell?.(ej, vel);
    G.render?.lightPool?.flash?.(muzzle, 0xffc880, 20, 7, 0.05);
    const k = 1 - 0.45 * P.ads;
    G.player?.addRecoil?.(PISTOL.recoil * k * (0.85 + rand() * 0.3), (rand() - 0.5) * 0.006 * k);
    G.player?.addShake?.(0.07 * k);
    P.kickV += 2.2 * k; P.flipV += 3.4 * k; P.flashT = 0.045; P.finger = 1;
    M.flash.opacity = 0.95; flash.visible = true; flash.rotation.z = rand() * Math.PI;
    P.spread = Math.min(0.06, P.spread + 0.012 * k);
  }
  function startReload() {
    if (P.reload || P.ammo >= PISTOL.mag || P.reserve <= 0) return false;
    const empty = P.ammo <= 0;
    P.reload = { t: 0, dur: empty ? PISTOL.reloadEmpty : PISTOL.reload, empty, out: false, in: false, bolt: false };
    G.events?.emit?.('weapon:reload', { phase: 'start', empty });
    return true;
  }
  function stepReload(dt) {
    const r = P.reload; r.t += dt;
    const k = r.t / r.dur, pose = reloadPose(k, r.empty);
    if (!r.out && k >= 0.16) { r.out = true; G.events?.emit?.('weapon:reload', { phase: 'magout', empty: r.empty }); }
    if (!r.in && pose.magIn) {
      r.in = true; const take = Math.min(PISTOL.mag - P.ammo, P.reserve); P.ammo += take; P.reserve -= take;
      G.events?.emit?.('weapon:reload', { phase: 'magin', empty: r.empty });
    }
    if (r.empty && !r.bolt && k >= 0.75) { r.bolt = true; P.locked = false; G.events?.emit?.('weapon:reload', { phase: 'bolt', empty: true }); }
    if (k >= 1) { P.reload = null; P.locked = false; G.events?.emit?.('weapon:reload', { phase: 'done' }); return reloadPose(1, false); }
    return pose;
  }

  /** 出刀：算一次命中（刺出去的那一刻） */
  function knifeHit() {
    const eye = camera.getWorldPosition(v3), f = camera.getWorldDirection(v1);
    let best = null, bd = Infinity;
    for (const e of G.enemies?.list || []) {
      if (!e.alive || !e.active || !knifeReaches(eye, f.x, f.y, f.z, e)) continue;
      const d = Math.hypot(e.pos.x - eye.x, e.pos.z - eye.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return false;
    const point = new THREE.Vector3(best.pos.x, best.pos.y + 1.15, best.pos.z), dir = f.clone();
    if (bd > 0.8 && G.physics?.lineOfSight && !G.physics.lineOfSight(eye, point)) return false;
    let killed = false;
    try { killed = best.damage(KNIFE.damage, point, dir, 'body') === true; } catch (e) { console.error('[零点突围] 刀伤害出错', e); }
    G.events?.emit?.('impact', { point, normal: dir.clone().negate(), dist: bd, surface: 'enemy', enemy: best, part: 'body', dir, from: 'player', killed });
    G.events?.emit?.('player:hitEnemy', { enemy: best, part: 'body', killed, weak: false, melee: true });
    G.player?.addShake?.(0.18);
    return true;
  }
  function slash() {
    if (K.t >= 0 || K.cool > 0) return false;
    K.t = 0; K.hit = false;
    G.events?.emit?.('weapon:melee', {});
    // 近处有人：往前垫一小步
    const p = G.player;
    if (p?.onGround && p.vel) {
      const eye = camera.getWorldPosition(v3), f = camera.getWorldDirection(v1);
      if ((G.enemies?.list || []).some((e) => e.alive && e.active && knifeReaches(eye, f.x, f.y, f.z, e, KNIFE.reach + 1.2))) { p.vel.x += f.x * KNIFE.lunge; p.vel.z += f.z * KNIFE.lunge; }
    }
    return true;
  }

  // ---- 切枪 ----
  function select(slot, { quick = false, plain = false } = {}) {
    if (!SLOTS.includes(slot) || (slot === S.cur && !S.next) || S.next === slot) return false;
    if (S.cur === 'pistol' && P.reload) P.reload = null;
    // 正掏到一半又换：从现在放下去的位置接着放（不跳）
    const from = S.phase === 'draw' ? clamp01(S.drop) : 0;
    S.next = slot; S.phase = 'lower'; S.t = from * SWAP.lower; S.quick = quick ? (S.quick || S.cur) : null; S.plain = quick || plain; S.pose = null;
    return true;
  }
  function applySwitch() {
    S.prev = S.cur; S.cur = S.next; S.next = null; S.phase = 'draw'; S.t = 0; S.racked = false;
    for (const s of SLOTS) { const r = rootOf(s); if (s === 'rifle') rifle?.setVisible?.(S.shown && S.cur === 'rifle'); else if (r) r.visible = S.shown && S.cur === s; }
    if (S.cur === 'rifle') rifle?.snap?.();
    ui?.classList?.toggle('jm-knife', S.cur === 'knife');
    paintBtn();
    G.events?.emit?.('weapon:switch', { to: S.cur, from: S.prev });
  }
  const DIGIT = { Digit1: 'rifle', Digit2: 'pistol', Digit3: 'knife' };
  const onKey = (e) => {
    if (e.repeat || G.game?.state !== 'playing') return;
    if (DIGIT[e.code]) select(DIGIT[e.code]); else if (e.code === 'KeyQ') select(S.prev === S.cur ? 'pistol' : S.prev);
  };
  const onWheel = (e) => { if (G.game?.state !== 'playing' || Math.abs(e.deltaY) < 1) return; const i = SLOTS.indexOf(S.next || S.cur); select(SLOTS[(i + (e.deltaY > 0 ? 1 : SLOTS.length - 1)) % SLOTS.length]); };
  if (typeof addEventListener === 'function') { addEventListener('keydown', onKey); addEventListener('wheel', onWheel, { passive: true }); }
  let btn = null;
  function paintBtn() { if (btn) btn.querySelector('span').textContent = S.cur === 'rifle' ? '手枪' : '步枪'; }
  function buildUi() {
    const touch = ui?.querySelector?.('.touch');
    if (!touch || btn || typeof document === 'undefined') return;
    btn = document.createElement('button'); btn.className = 't-btn t-swap'; btn.setAttribute('aria-label', '切换武器'); btn.innerHTML = '<span></span>';
    const down = (e) => { e.preventDefault(); e.stopPropagation(); btn.classList.add('active'); select(S.cur === 'rifle' ? 'pistol' : 'rifle'); };
    const up = (e) => { e.preventDefault?.(); btn.classList.remove('active'); };
    btn.addEventListener('touchstart', down, { passive: false }); btn.addEventListener('touchend', up, { passive: false }); btn.addEventListener('touchcancel', up, { passive: false });
    touch.appendChild(btn); paintBtn();
  }

  // ---- 每帧 ----
  /** 手枪 / 刀共用的晃动：走路的起伏、转头时枪跟得慢一点、冲刺时枪抬起来。写进 st.bob / swayX / swayY / sprint，返回起伏量 */
  function sway(st, dt, adsK = 0) {
    const p = G.player, inp = G.input, sp = p ? Math.hypot(p.vel.x, p.vel.z) : 0, amt = Math.min(1, sp / 4) * (p?.onGround === false ? 0.2 : 1) * (1 - 0.82 * adsK);
    st.bob += sp * dt * 1.9;
    st.swayX = damp(st.swayX, Math.max(-0.03, Math.min(0.03, -(inp?.look?.dx || 0) * 0.9)), 9, dt);
    st.swayY = damp(st.swayY, Math.max(-0.03, Math.min(0.03, (inp?.look?.dy || 0) * 0.9)), 9, dt);
    st.sprint = damp(st.sprint, p?.sprinting ? 1 : 0, 9, dt);
    return amt;
  }
  function updatePistol(dt, active, busy) {
    const inp = G.input, p = G.player;
    P.cool -= dt; P.flashT -= dt;
    if (P.flashT <= 0 && flash.visible) { flash.visible = false; M.flash.opacity = 0; }
    let pose = null;
    if (active && !busy) {
      const wantAds = !!inp.ads && !P.reload && !p?.sprinting;
      P.adsLin = clamp01(P.adsLin + (wantAds ? 1 : -1) * PISTOL.adsRate * dt * 0.5);
      if (inp.pressed?.('reload')) startReload();
      const edge = !!inp.pressed?.('fire'), holding = !!inp.fire || !!inp.down?.('fire');
      P.held = holding ? P.held + dt : 0;
      if ((edge || (holding && P.held >= PISTOL.holdInterval)) && P.cool <= 0 && !P.reload && P.sprint < 0.4) {
        if (P.ammo > 0) shootPistol();
        else if (!startReload() && edge) G.events?.emit?.('weapon:dry', {});
      }
      if (P.ammo <= 0 && !P.reload && P.reserve > 0 && S.time - P.lastShot > 0.35) startReload();
    } else P.adsLin = clamp01(P.adsLin - PISTOL.adsRate * dt * 0.5);
    if (P.reload) pose = stepReload(dt);
    P.ads = ease(P.adsLin);
    // 套筒：开火后坐 0.09 秒复进；打空挂在后面
    P.slide = P.locked ? Math.max(P.slide, 1) : Math.max(0, P.slide - dt / 0.09);
    if (pose && pose.slide !== undefined && P.reload?.empty) P.slide = Math.max(P.slide * (P.locked ? 1 : 0), pose.slide);
    // 掏枪：枪绕扳机护圈转、左手跟上来拉套筒
    const dr = active ? S.pose : null;
    if (dr && !P.locked) P.slide = Math.max(P.slide, dr.rack);
    if (dr && dr.rack > 0.5 && !S.racked) { S.racked = true; G.events?.emit?.('weapon:reload', { phase: 'bolt', kind: 'pistol', draw: true }); }
    const spin = dr ? -dr.spin : 0;
    pBody.rotation.x = spin;
    pBody.position.copy(pBase).add(pPivot).sub(v3.copy(pPivot).applyAxisAngle(X_AXIS, spin));
    pSlide.position.z = pg.slideTravel * Math.min(1, P.slide);
    P.finger = Math.max(0, P.finger - dt * 9); pTrigger.position.z = 0.004 * P.finger;
    // 后坐弹簧
    P.kickV += (-P.kick * 260 - P.kickV * 22) * dt; P.kick += P.kickV * dt;
    P.flipV += (-P.flip * 210 - P.flipV * 19) * dt; P.flip += P.flipV * dt;
    const moving = p ? Math.hypot(p.vel.x, p.vel.z) : 0;
    const target = bi(PISTOL.spreadHip, PISTOL.spreadAds, P.ads) * (1 + Math.min(1, moving / 6) * 1.2) * (p?.onGround === false ? 1.8 : 1);
    P.spread = damp(P.spread, target, 7, dt);
    const amt = sway(P, dt, P.ads), bobX = Math.sin(P.bob) * 0.0042 * amt, bobY = -Math.abs(Math.cos(P.bob)) * 0.0038 * amt;
    const tilt = (pose?.tilt || 0) + 0.45 * (dr?.cant || 0), hand = Math.max(pose?.hand || 0, dr?.hand || 0);
    // 腰射在右下、开镜到正中（照门准星对到屏幕中心）
    const hip = v1.set(0.062, -0.03, -0.38), ads = v2.set(0, -(GRIP[1] + pg.sightY), -0.36);
    pistolRoot.position.lerpVectors(hip, ads, P.ads);
    pistolRoot.position.x += bobX + P.swayX * 0.5; pistolRoot.position.y += bobY - P.swayY * 0.4 - 0.05 * P.sprint - 0.045 * tilt; pistolRoot.position.z += 0.012 * P.kick + 0.04 * P.sprint;
    e1.set(0.05 * P.flip + 0.5 * P.sprint + 0.26 * tilt - P.swayY * 0.6, P.swayX * 0.9 + 0.25 * P.sprint + (1 - P.ads) * 0.03, -0.62 * tilt + P.swayX * 0.4);
    pistolRoot.quaternion.setFromEuler(e1);
    pMag.position.y = -0.17 * (pose?.magDrop || 0); pMag.visible = !(pose && pose.magDrop > 0.97);
    if (pLeft) { pLeft.position.copy(leftBase); pLeft.position.y -= 0.21 * hand; pLeft.position.z += 0.05 * hand; }
  }
  function updateKnife(dt, active, busy) {
    const inp = G.input;
    K.cool -= dt;
    if (active && !busy && K.t < 0 && (inp.pressed?.('fire') || inp.pressed?.('melee') || (inp.fire && K.cool <= -0.15))) slash();
    let pose = { back: 0, thrust: 0, sweep: 0 };
    if (K.t >= 0) {
      K.t += dt;
      if (!K.hit && K.t >= KNIFE.hitAt) { K.hit = true; knifeHit(); }
      pose = slashPose(K.t / KNIFE.time);
      if (K.t >= KNIFE.time) { K.t = -1; K.cool = KNIFE.cooldown; if (S.quick && S.cur === 'knife') { const back = S.quick; S.quick = null; select(back, { plain: true }); } }
    }
    const amt = sway(K, dt), bobX = Math.sin(K.bob) * 0.005 * amt, bobY = -Math.abs(Math.cos(K.bob)) * 0.0045 * amt;
    // 平时刀尖朝前上方斜着握在右下；出刀：先往右后收，再往前往左刺
    // 挥的时候手肘往前送（手臂伸出去），不然前臂绕过来会贴到镜头上
    knifeRoot.position.set(K_ELBOW.x + bobX + K.swayX * 0.5 + 0.03 * pose.sweep, K_ELBOW.y + bobY - K.swayY * 0.4 - 0.04 * K.sprint + 0.02 * pose.thrust, K_ELBOW.z + 0.05 * pose.back - 0.12 * pose.thrust - 0.24 * pose.sweep);
    // 横着从右往左划（绕手肘转）：刀先往右后摆，再扫到左前方、略往下压
    e1.set(K_IDLE.x - 0.16 * pose.thrust + 0.3 * K.sprint, K_IDLE.y - 0.3 * pose.back + 0.5 * pose.sweep + K.swayX, K_IDLE.z + 0.3 * pose.sweep - 0.1 * pose.back);
    knifeRoot.quaternion.setFromEuler(e1);
    // 掏刀：刀离手往上一抛、前后翻一整圈落回手里，接住以后手腕一抖
    const dr = active ? S.pose : null;
    kBody.rotation.x = dr ? -dr.spin : 0;
    kBody.position.set(GRIP[0], GRIP[1] + 0.075 * (dr?.toss || 0), GRIP[2] - 0.03 * (dr?.toss || 0));
    if (dr?.flick) { knifeRoot.rotateZ(-0.24 * dr.flick); knifeRoot.rotateX(-0.05 * dr.flick); } // 幅度小一点：这里转的是整条前臂（原点在手肘）
  }
  const bi = (a, b, k) => a + (b - a) * k;
  const MUTED = new Set(['fire', 'ads', 'reload', 'melee']);
  function quietUpdate(dt) {
    const inp = G.input;
    if (!inp || !rifle?.update) return;
    const down = inp.down, pressed = inp.pressed, fire = inp.fire, ads = inp.ads;
    if (down) inp.down = (a) => !MUTED.has(a) && down.call(inp, a);
    if (pressed) inp.pressed = (a) => !MUTED.has(a) && pressed.call(inp, a);
    inp.fire = false; inp.ads = false;
    try { rifle.update(dt); } finally { if (down) inp.down = down; if (pressed) inp.pressed = pressed; inp.fire = fire; inp.ads = ads; }
  }

  const proxy = {
    stub: false,
    get name() { return S.cur === 'pistol' ? PISTOL.name : S.cur === 'knife' ? KNIFE.name : rifle?.name; },
    // 拿着刀时报满弹（HUD 上数字藏起来了）：报 0 的话原游戏会一直提示「弹药耗尽」「弹药不足」
    get ammo() { return S.cur === 'pistol' ? P.ammo : S.cur === 'knife' ? 30 : rifle?.ammo; },
    get magSize() { return S.cur === 'pistol' ? PISTOL.mag : S.cur === 'knife' ? 30 : rifle?.magSize; },
    get reserve() { return S.cur === 'pistol' ? P.reserve : S.cur === 'knife' ? 150 : rifle?.reserve; },
    get state() { return S.phase ? 'idle' : S.cur === 'pistol' ? (P.reload ? 'reloading' : S.time - P.lastShot < 0.14 ? 'firing' : P.sprint > 0.5 ? 'sprinting' : 'idle') : S.cur === 'knife' ? (K.t >= 0 ? 'firing' : 'idle') : rifle?.state; },
    get ads() { return S.phase ? 0 : S.cur === 'pistol' ? P.ads : S.cur === 'knife' ? 0 : rifle?.ads; },
    get spread() { return S.cur === 'pistol' ? P.spread : S.cur === 'knife' ? 0.004 : rifle?.spread; },
    get current() { return S.cur; }, get switching() { return !!S.phase; }, get slashing() { return K.t >= 0; },
    pistol: P, knife: K, roots: { pistol: pistolRoot, knife: knifeRoot, rifle: rifleVm }, parts: { pistol: pBody, knife: kBody }, get draw() { return S.pose; },
    select, slash, startReload, buildUi,
    /** 近战键：手里不是刀就先换成刀刺一下、刺完换回来 */
    quickKnife() { if (S.cur === 'knife' && !S.next) return slash(); if (S.next === 'knife') return false; return select('knife', { quick: true }); },
    update(dt) {
      S.time += dt;
      if (G.input?.touch && !btn) buildUi();
      // 近战键
      if (G.input?.pressed?.('melee') && G.game?.state === 'playing' && S.shown) proxy.quickKnife();
      // 切枪动画：放下 → 换 → 举起
      if (S.phase) {
        S.t += dt;
        if (S.phase === 'lower') { S.drop = clamp01(S.t / (S.quick ? SWAP.lower * 0.6 : SWAP.lower)); if (S.drop >= 1) applySwitch(); }
        if (S.phase === 'draw') {
          const k = clamp01(S.t / (S.plain ? DRAW.quick : DRAW[S.cur]));
          S.pose = drawPose(S.cur, k, S.plain); S.drop = S.pose.drop;
          if (k >= 1) { S.phase = null; S.drop = 0; S.pose = null; S.plain = false; if (S.cur === 'knife' && S.quick) slash(); }
        }
      }
      const busy = !!S.phase || S.lowered > 0.3;
      // 步枪每帧都要更新（它自己把模型摆回握姿，放下 / 掏出的偏移才加得上去）；切枪途中把开火、开镜、换弹的输入挡掉
      if (S.cur === 'rifle') { if (S.phase) quietUpdate(dt); else rifle?.update?.(dt); }
      updatePistol(dt, S.cur === 'pistol', busy);
      updateKnife(dt, S.cur === 'knife', busy);
      // 放下去的量（切枪、翻越）：加在当前这把的模型上
      // 掏的时候 S.drop 已经是缓动过的（先快后慢地上来）；放下、翻越是线性的，这里再缓动
      const d = Math.max(S.phase === 'draw' ? S.drop : ease(S.drop), ease(S.lowered)), root = rootOf(S.cur);
      if (root && d > 0) { root.position.y -= 0.24 * d; root.position.z += 0.05 * d; root.rotateX(-0.75 * d); }
      // 步枪的花样：从右下斜着甩上来，枪身侧倾着摆正，顶到肩上回弹一下
      const dr = S.cur === 'rifle' ? S.pose : null;
      if (root && dr) { root.position.x += 0.07 * dr.cant; root.position.z += 0.03 * dr.snap; root.position.y -= 0.012 * dr.snap; root.rotateZ(-0.95 * dr.cant); root.rotateY(0.5 * dr.cant); root.rotateX(0.07 * dr.snap); }
    },
    reset() {
      rifle?.reset?.();
      Object.assign(P, { ammo: PISTOL.mag, reserve: PISTOL.reserve, cool: 0, held: 0, ads: 0, adsLin: 0, slide: 0, locked: false, reload: null, kick: 0, kickV: 0, flip: 0, flipV: 0, flashT: 0, lastShot: -9, sprint: 0 });
      Object.assign(K, { t: -1, cool: 0, hit: false });
      Object.assign(S, { cur: 'rifle', prev: 'pistol', next: null, phase: null, t: 0, drop: 0, lowered: 0, quick: null, plain: false, pose: null, racked: false });
      pistolRoot.visible = knifeRoot.visible = false; flash.visible = false;
      rifle?.setVisible?.(S.shown);
      ui?.classList?.remove('jm-knife'); paintBtn();
    },
    setVisible(v) { S.shown = !!v; rifle?.setVisible?.(S.shown && S.cur === 'rifle'); pistolRoot.visible = S.shown && S.cur === 'pistol'; knifeRoot.visible = S.shown && S.cur === 'knife'; },
    /** 弹药补给：步枪照旧，手枪顺带补四成（封顶） */
    addAmmo(n) { rifle?.addAmmo?.(n); P.reserve = Math.min(PISTOL.reserveMax, P.reserve + Math.round(n * 0.4)); },
    muzzleWorld(out) { return S.cur === 'pistol' ? muzzleWorld(out) : rifle?.muzzleWorld?.(out); },
    reloadNow() { return S.cur === 'pistol' ? startReload() : rifle?.reloadNow?.(); },
    setWetness(v) { rifle?.setWetness?.(v); }, snap() { rifle?.snap?.(); },
    /** 翻越时把枪放低（0–1） */
    setLowered(k) { S.lowered = clamp01(k); },
    dispose() {
      if (typeof removeEventListener === 'function') { removeEventListener('keydown', onKey); removeEventListener('wheel', onWheel); }
      for (const r of [pistolRoot, knifeRoot]) r.removeFromParent();
      for (const g of [pg.frame, pg.slide, pg.dark, pg.mag, pg.trigger, pg.dots, kg.blade, kg.fuller, kg.handle, kg.guard]) g.dispose();
      M.flash.map?.dispose?.(); for (const m of Object.values(M)) m.dispose();
      btn?.remove();
    },
  };
  return proxy;
}

export const ARSENAL_CSS = `
/* 「切枪」键：换弹键左上方 */
.t-swap { width: 54px; height: 54px; right: calc(246px + var(--sar)); bottom: calc(120px + var(--sab)); border-color: #9fc4e8; color: #cfe4f7; }
/* 拿着刀：不显示弹药数 */
.jm-knife .h-ammo-n, .jm-knife .h-ammo-r, .jm-knife .h-pips { visibility: hidden; }
`;
