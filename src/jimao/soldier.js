// 「零点突围」的真人敌人：武装劫持者（type: 'soldier'）。
// 原游戏只有机械飞鸥和机械猎犬；这里按它敌人模块的同一套接口写第三种，登记进它的敌人池（ctx.pools.soldier），
// 所以发现玩家、互相呼叫、轮流开火（射击令牌）、听到枪声围过来、关卡的巡逻和三波敌人，全部走原游戏自己的逻辑。
// 这里只管人本身：身体（程序生成，几个部件各一个网格）、走跑蹲瞄的动作、找射击位置、开枪、中弹、倒地。
//
// 接口和原游戏的敌人一致：pos / alive / active / hp / mode / los / fwd / sensor / lastKnown / home …，
// _activate(pos, opts) / _deactivate() / _update(dt) / _raycast(o, d, maxDist, out) / damage(amount, point, dir, part)。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  SURF, DECAL, FACES, paint, paintGeo, ensureRig, mergeFlat, weather, humanHead, hairShell, sculpt, createRigMaterial,
  decalGeo, grimeGeo, setDecalBox, rigDecalsOn, torsoSurface, shellPatch, edgeTube, shoulderArch, lathe, surgicalMask,
} from './skins/rig-skin.js';

export const SOLDIER = {
  hp: 80, heavyHp: 110, shotDamage: 5, burst: [3, 5], burstGap: 0.1, aimTime: 0.38, cooldown: [1.3, 2.4],
  walkSpeed: 1.5, stalkSpeed: 2.4, runSpeed: 4.2, accel: 9, turnRate: 4,
  rangeMin: 6, rangeMax: 22, spreadFar: 0.11, spreadNear: 0.04, react: 0.45,
  patrolRadius: 8, corpseSeconds: 10, pool: 12,
};

/**
 * 兵种（每次出场定一个）：在 SOLDIER 的基础上改几项。
 *   regular 步枪手：原来的样子；
 *   rusher 突击手：跑得快、贴上来打（3–10 米），点射短促频繁，血薄一点；
 *   heavy 重装：走得慢、血是两倍多，一梭子 7–10 发压着你打；
 *   marksman 狙击手：躲在 16–45 米外，瞄一秒多（红色激光先照到你身上）打一枪，一枪很疼，打完要缓两三秒；
 *   boss 头目（「猎杀头目」任务的目标）：血量五倍，长点射，个头大一圈。
 */
export const ROLES = Object.freeze({
  regular: Object.freeze({ name: '步枪手', weight: 0.5 }),
  rusher: Object.freeze({ name: '突击手', weight: 0.22, runSpeed: 5.4, stalkSpeed: 3.4, rangeMin: 3, rangeMax: 10, burst: [4, 6], aimTime: 0.24, cooldown: [0.7, 1.2], spreadFar: 0.14, spreadNear: 0.06, hpScale: 0.8, scale: 0.97 }),
  heavy: Object.freeze({ name: '重装兵', weight: 0.15, runSpeed: 3.1, stalkSpeed: 2, walkSpeed: 1.3, burst: [7, 10], burstGap: 0.085, cooldown: [1.8, 2.6], hpScale: 2.2, scale: 1.08 }),
  marksman: Object.freeze({ name: '狙击手', weight: 0.13, rangeMin: 16, rangeMax: 45, burst: [1, 1], shotDamage: 24, aimTime: 1.15, cooldown: [2.2, 3.2], spreadFar: 0.022, spreadNear: 0.008, hpScale: 0.8 }),
  boss: Object.freeze({ name: '头目', weight: 0, runSpeed: 3.6, burst: [5, 8], shotDamage: 6, cooldown: [1.1, 1.8], hpScale: 5, scale: 1.14 }),
});
/** 按比例抽一个兵种。r ∈ [0, 1)；heavyLook：这个人穿的是重装护甲（只当步枪手或重装兵） */
export function pickRole(r, heavyLook = false) {
  const names = heavyLook ? ['regular', 'heavy'] : ['regular', 'rusher', 'marksman', 'heavy'].filter((n) => n !== 'heavy' || !heavyLook);
  const pool = heavyLook ? names : names.filter((n) => n !== 'heavy');
  const total = pool.reduce((t, n) => t + ROLES[n].weight, 0);
  let x = r * total;
  for (const n of pool) { x -= ROLES[n].weight; if (x < 0) return n; }
  return 'regular';
}

// ---- 外观 ----
// 两套装备：突击手（橄榄色作战服、狼棕背心）和重装（深灰作战服、黑色重型护甲、血厚）。
// 脸上是面罩，只露一条眼缝，戴深色护目镜（镜片有一点反光，交火时泛红，方便远处看出谁在打你）。
// 质感（布、科迪拉、皮、橡胶、塑料、金属）和做旧（越往下越脏）见 skins/rig-skin.js；劫持者刚出来，不带血。
const LOOKS = [
  { shirt: 0x4a4f3e, pants: 0x434737, vest: 0x6b6247, strap: 0x55503b, pouch: 0x5d5740, helmet: 0x545a45, mask: 0x33342f, glove: 0x2a2826, boot: 0x2b2722, pad: 0x3a3b35, heavy: false, grime: 0.55, who: 0 },
  { shirt: 0x2e3137, pants: 0x2a2d32, vest: 0x22252a, strap: 0x2c3036, pouch: 0x30343a, helmet: 0x2a2d31, mask: 0x1f2022, glove: 0x1d1d1e, boot: 0x1a1a1a, pad: 0x26292d, heavy: true, grime: 0.5, who: 1 },
];
const GUN = 0x1e1f21, GUN2 = 0x34352f, SKIN = 0xa77b5f, STRAP = 0x1b1b1b, BUCKLE = 0x55575a;
const LENS_CALM = [0.07, 0.042, 0.014], LENS_HOT = [0.9, 0.08, 0.04];

const Y = new THREE.Vector3(0, 1, 0);
/** 上色：hex 是数字（只上顶点色，丧尸的旧模型这么用）或 paint()（顶点色 + 表面种类，人形骨架用） */
function colored(geo, hex) {
  if (typeof hex === 'object' && hex) return paintGeo(geo, hex.hex, hex.surf);
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const box = (w, h, d, x, y, z, hex, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return colored(g, hex); };
/** 圆角方块：衣服、背心、靴子都用它，边角不再是硬棱 */
// 同样尺寸的圆角方块搭一次、之后复制（RoundedBoxGeometry 每次现算 UV 和圆角，人形上几十块，开局省下一截时间）
const rboxCache = new Map();
function rboxGeo(w, h, d, seg, r) {
  const key = `${w},${h},${d},${seg},${r}`;
  let g = rboxCache.get(key);
  if (!g) { if (rboxCache.size > 400) rboxCache.clear(); g = new RoundedBoxGeometry(w, h, d, seg, r); rboxCache.set(key, g); }
  return new THREE.BufferGeometry().copy(g); // 不用 clone()：它会按参数重新搭一遍圆角方块
}
const rbox = (w, h, d, x, y, z, hex, r = 0.04, rx = 0, seg = 2) => { const g = rboxGeo(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999); if (rx) g.rotateX(rx); g.translate(x, y, z); return colored(g, hex); };
const ball = (r, x, y, z, hex, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 14, 10); g.scale(sx, sy, sz); g.translate(x, y, z); return colored(g, hex); };
/** 小圆点（按扣、扣子、铆钉）：几毫米的东西用不着 14×10 的球 */
const dot = (r, x, y, z, hex) => colored(new THREE.SphereGeometry(r, 6, 4).scale(1, 1, 0.6).translate(x, y, z), hex);
function limb(a, b, r0, r1, hex, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return colored(g, hex);
}
/** 两头圆的肢体（关节处不露断面） */
const capsule = (a, b, r0, r1, hex) => [limb(a, b, r0, r1, hex), ball(r0, a.x, a.y, a.z, hex), ball(r1, b.x, b.y, b.z, hex)];
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const merge = (list) => { const g = mergeGeometries(ensureRig(list.flat(Infinity).map((q) => (q.index ? q.toNonIndexed() : q)))); g.computeBoundingSphere(); return g; };
// 人形骨架的合并：零件都带 rig 属性，走快速合并（mergeFlat，结果和上面一样，开局建人快几倍）
// UV 不要：质感走三向投影（rig-skin.js），材质里也没有贴图用 UV，每个顶点省 8 个字节
const mergeRig = (list) => { const g = mergeFlat(ensureRig(list.flat(Infinity))); g.deleteAttribute('uv'); g.computeBoundingSphere(); return g; };

/** 搭模型、算命中用的小工具（zombie.js 也用） */
export { rbox, ball, limb, capsule, merge, hitSphere, hitCapsule, buildParts };
const rboxAt = rbox;
/** 人形骨架的几个尺寸（队友 squad.js 也用这副骨架） */
export const RIG = Object.freeze({ HIP_Y: 0.98, THIGH: 0.44, SHIN: 0.42 });

// 尺寸：髋关节离地 0.98 m，头盔顶约 1.84 m；面朝 +Z，右手在 -X 一侧。
const HIP_Y = 0.98, THIGH = 0.44, SHIN = 0.42;
// 各部件的轴心在站直时的骨架坐标（做旧按高度算脏、按位置点血迹要用）；和 addSoldiers / squad.js 里搭骨架的位置一致
const AT = Object.freeze({ pelvis: [0, HIP_Y, 0], torso: [0, HIP_Y + 0.1, 0], head: [0, HIP_Y + 0.6, 0], aim: [0, HIP_Y + 0.52, 0.02], thigh: [0, HIP_Y - 0.07, 0], shin: [0, HIP_Y - 0.07 - THIGH, 0] });

/**
 * 按外观搭一副人形（几个部件各一个网格，轴心见上）。look 里除了颜色还可以有（队友用）：
 *   face：'zhe' | 'lin'（露脸的真人头，头型见 rig-skin.js FACES；没有就是面罩 + 护目镜的劫持者）、skin / hair / lip / iris 颜色、
 *   shirtSurf / pantsSurf / vestSurf / gloveSurf / bootSurf（表面种类，见 rig-skin.js SURF）、tape（反光条颜色）、
 *   sleeve：'short'（短袖露小臂）、pads：false（不戴护膝护肘）、who（在材质里的编号）、grime（脏的程度）、blood（几处血迹，骨架坐标）。
 * 队友穿的是贴身的薄背心（离衬衫一厘多，V 领、袖窿、前襟拉链、包边），劫持者是硬板的防弹插板背心（本来就是方的）。
 * opts.held（联机人形、队友用）：另外搭几副不带枪的手臂和几把单独的武器（见 HELD_POSES），squad.js 按手里拿的换着显示。
 */
function buildParts(look, opts = {}) {
  const L = look, human = !!L.face, S = SURF, zhe = L.face === 'zhe', lin = L.face === 'lin';
  // 薄片（缝线、反光条、名牌、卡扣）圆角只要一圈，省三角形
  const rbox = (w, h, d, x, y, z, c, r = 0.04, rx = 0) => rboxAt(w, h, d, x, y, z, c, r, rx, Math.min(w, h, d) < 0.04 ? 1 : 2);
  const P = (hex, surf) => paint(hex, surf), dk = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
  const shirt = P(L.shirt, L.shirtSurf ?? S.CLOTH), pants = P(L.pants, L.pantsSurf ?? S.CLOTH), vest = P(L.vest, L.vestSurf ?? S.CORDURA);
  const strap = P(L.strap, L.strapSurf ?? S.CORDURA), pouch = P(L.pouch, S.CORDURA), helmet = P(L.helmet, S.PLASTIC), mask = P(L.mask, S.KNIT);
  const glove = P(L.glove, L.gloveSurf ?? S.LEATHER), boot = P(L.boot, L.bootSurf ?? S.LEATHER), pad = P(L.pad, S.RUBBER), skin = P(L.skin ?? SKIN, S.SKIN);
  const belt = P(STRAP, S.CORDURA), sole = P(L.sole ?? STRAP, S.RUBBER), gun = P(GUN, S.METAL), gun2 = P(GUN2, S.POLYMER), buckle = P(BUCKLE, S.METAL), clip = P(0x1c1d1f, S.POLYMER);
  const tape = P(L.tape ?? 0xa4a8ab, S.RETRO), seam = P(dk(L.vest, 0.62), L.vestSurf ?? S.CORDURA);
  const pads = L.pads !== false, hivis = L.vestSurf === S.HIVIS;
  const wear = (geo, at) => weather(geo, { at, who: L.who ?? 0 });
  const rot = (g, rx, ry, rz) => { if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); return g; };
  const ell = (r, at, c, seg = 12, ring = 8) => { const g = new THREE.SphereGeometry(1, seg, ring); g.scale(r[0], r[1], r[2]); g.translate(at[0], at[1], at[2]); return colored(g, c); };

  // 腰带：一条 4.5 厘米宽的织带，顺着胯的轮廓绕一圈（不再是一块比腰还宽的厚板），上下两道包边；
  // 卡扣是金属的（有倒角、有一点金属光），腰包有包盖、盖缝和一颗按扣
  const hipT = torsoSurface({ hw: 0.17, hd: 0.115, rc: 0.07, yb: -0.3, yt: 0.3, off: 0.007 }), bY0 = 0.062, bY1 = 0.107;
  const beltBand = shellPatch(hipT, { y0: bY0, y1: bY1, cols: 48, rows: 1, hex: STRAP, surf: S.CORDURA, wrap: true });
  const beltEdge = (y) => edgeTube(Array.from({ length: 36 }, (_, i) => hipT.point(i / 36, y)), 0.0042, dk(STRAP, 1.25), S.CORDURA, { inset: 0.002, sides: 4 });
  const bz = hipT.point(0, 0.08).p[2];
  const hipPouch = (x, z, c, w = 0.07) => [
    rbox(w, 0.085, 0.055, x, 0.035, z, c, 0.014), rbox(w + 0.004, 0.03, 0.06, x, 0.078, z + 0.002, c, 0.01), // 包身 + 包盖
    rbox(w * 0.86, 0.004, 0.003, x, 0.063, z + 0.032, P(dk(c.hex, 0.62), c.surf), 0.001), dot(0.0045, x, 0.07, z + 0.033, buckle), // 盖缝 + 按扣
  ];
  const pelvis = wear(mergeRig([
    rbox(0.34, 0.22, 0.23, 0, -0.01, 0, pants, 0.07),
    beltBand, beltEdge(bY0), beltEdge(bY1),
    rbox(0.048, 0.036, 0.008, 0, 0.0845, bz + 0.004, buckle, 0.004), rbox(0.03, 0.02, 0.004, 0, 0.0845, bz + 0.009, P(STRAP, S.CORDURA), 0.002), // 卡扣（外框 + 中间压着的带子）
    rbox(0.012, 0.09, 0.006, 0.02, -0.03, 0.116, P(dk(L.pants, 0.7), L.pantsSurf ?? S.CLOTH), 0.003), // 门襟
    rbox(0.09, 0.08, 0.008, 0.08, -0.02, -0.115, pants, 0.01), rbox(0.09, 0.08, 0.008, -0.08, -0.02, -0.115, pants, 0.01), // 后兜
    hipPouch(0.15, 0.09, lin ? P(0x5e2a27, S.CORDURA) : pouch, lin ? 0.055 : 0.07), hipPouch(-0.16, -0.06, pouch), // 林医生：左胯红色止血带包、右后急救包
    L.heavy ? rbox(0.18, 0.16, 0.04, 0, -0.07, 0.125, vest, 0.02) : [],
  ]), AT.pelvis);

  // ---- 上身 ----
  const torsoParts = [rbox(0.36, 0.44, 0.22, 0, 0.24, 0, shirt, 0.08)];
  if (human) {
    // 斜方肌：脖子到肩膀的一道斜坡（不再是一根直筒脖子插在方块上）
    for (const s of [-1, 1]) torsoParts.push(rot(ell([0.072, 0.03, 0.058], [0, 0, 0], shirt, 12, 8), 0, 0, -s * 0.42).translate(s * 0.088, 0.447, -0.012));
    // 脖子：根部粗、往上收
    torsoParts.push(lathe(v(0, 0.425, -0.004), v(0, 0.545, 0.004), [[0, 0.07], [0.25, 0.058], [0.6, 0.052], [1, 0.05]], L.skin, S.SKIN, 14));
    // 贴身背心：离衬衫 1.3 厘米的一层壳。V 领、两侧袖窿挖开，下摆略外翻；边上一圈包边盖住壳和衣服的缝
    const T = torsoSurface({ off: 0.013 }), vTop = 0.445, neck = 0.075, vBot = zhe ? 0.325 : 0.35, arm = 0.27, y0 = 0.095;
    const sF = T.sAt(0.13), sB = T.sAt(0.13, false);
    const top = (s) => {
      const sa = s <= 0.5 ? s : 1 - s;
      if (sa > sF && sa < sB) return vTop - (vTop - arm) * Math.sin(Math.PI * (sa - sF) / (sB - sF)) ** 0.75;
      const q = T.point(s, 0.2).p, ax = Math.abs(q[0]);
      if (ax >= neck) return vTop;
      return q[2] > 0 ? vBot + (vTop - vBot) * (ax / neck) ** 0.85 : vTop - 0.014 * (1 - ax / neck);
    };
    const shell = shellPatch(T, { y0, y1: top, cols: 80, rows: 9, hex: L.vest, surf: L.vestSurf ?? S.CORDURA, flare: 0.004, wrap: true });
    grimeGeo(shell, (x, y) => 0.55 + 0.25 * Math.max(0, 1 - (y - y0) / 0.07)); // 下摆脏一点
    const bind = L.bind ?? dk(L.vest, 0.78), loop = (y, extra) => Array.from({ length: 80 }, (_, i) => T.point(i / 80, typeof y === 'function' ? y(i / 80) : y, extra));
    torsoParts.push(shell, edgeTube(loop(top, 0), 0.0048, bind, L.vestSurf ?? S.CORDURA, { inset: 0.004 }), edgeTube(loop(y0, 0.004), 0.0045, bind, L.vestSurf ?? S.CORDURA, { inset: 0.003 }));
    // 前襟的拉链：一条深色的齿 + 拉头
    const zf = T.point(0, 0.2).p[2];
    torsoParts.push(rbox(0.008, vBot - y0, 0.003, 0, (vBot + y0) / 2, zf + 0.0012, clip, 0.0015), rbox(0.012, 0.022, 0.005, 0, vBot - 0.03, zf + 0.003, buckle, 0.002));
    // 肩带：顺着肩膀从胸前绕到背后
    for (const s of [-1, 1]) torsoParts.push(shoulderArch(T, { x0: s < 0 ? -0.13 : 0.07, x1: s < 0 ? -0.07 : 0.13, yFront: 0.42, off: 0.016, thick: 0.004, hex: L.vest, surf: L.vestSurf ?? S.CORDURA }));
    if (hivis) {
      // 荧光背心：腰上两圈银灰反光条，前后各两道竖条上肩（反光条是单独一种表面：微珠、低粗糙度、逆反射）
      for (const [a, b] of [[0.125, 0.165], [0.205, 0.245]]) torsoParts.push(shellPatch(T, { y0: a, y1: b, cols: 80, rows: 1, extra: 0.0016, hex: L.tape, surf: S.RETRO, wrap: true }));
      for (const s of [-1, 1]) for (const front of [true, false]) {
        const s0 = T.sAt(s * 0.08, front), s1 = T.sAt(s * 0.12, front);
        torsoParts.push(shellPatch(T, { s0: Math.min(s0, s1), s1: Math.max(s0, s1), y0: 0.245, y1: vTop, cols: 2, rows: 6, extra: 0.0016, hex: L.tape, surf: S.RETRO }));
        if (front) torsoParts.push(shoulderArch(T, { x0: s < 0 ? -0.12 : 0.08, x1: s < 0 ? -0.08 : 0.12, yFront: 0.43, off: 0.0175, thick: 0.0015, hex: L.tape, surf: S.RETRO }));
      }
      // 背后「保安」印字（贴花），夹在两道竖条中间
      const b0 = T.sAt(0.07, false), b1 = T.sAt(-0.07, false);
      torsoParts.push(decalGeo(shellPatch(T, { s0: Math.min(b0, b1), s1: Math.max(b0, b1), y0: 0.3175, y1: 0.3925, cols: 6, rows: 2, extra: 0.0012, hex: L.vest, surf: L.vestSurf }), DECAL.ZHE_BACK));
      setDecalBox(DECAL.ZHE_BACK, AT.torso[0], AT.torso[1] + 0.355, 0.075, 0.0375);
      // 左肩：对讲机手咪，线绕到背后
      torsoParts.push(rbox(0.032, 0.055, 0.022, 0.1, 0.405, 0.131, P(0x1a1b1c, S.POLYMER), 0.008), rbox(0.026, 0.012, 0.004, 0.1, 0.42, 0.143, P(0x2c2d2e, S.RUBBER), 0.002));
      torsoParts.push(limb(v(0.11, 0.43, 0.125), v(0.125, 0.465, 0.05), 0.0035, 0.0035, P(0x1a1b1c, S.RUBBER), 5), limb(v(0.125, 0.465, 0.05), v(0.13, 0.455, -0.06), 0.0035, 0.0035, P(0x1a1b1c, S.RUBBER), 5));
      // 衬衫领子和门襟（V 领里看得见）：两个领尖、一条门襟、两颗扣子
      for (const s of [-1, 1]) torsoParts.push(colored(rot(rboxGeo(0.045, 0.026, 0.05, 1, 0.006), -0.5, s * 0.5, s * 0.25).translate(s * 0.045, 0.462, 0.065), shirt));
      torsoParts.push(rbox(0.016, 0.13, 0.004, 0, 0.395, 0.111, P(dk(L.shirt, 0.82), L.shirtSurf ?? S.CLOTH), 0.002), ...[0.36, 0.41].map((y) => dot(0.0045, 0, y, 0.114, P(0x8c8f8a, S.POLYMER))));
    } else {
      // 林医生：刷手服的 V 领滚边；左胸绿十字急救标；下面两个包（红色止血带包、急救包）；背后急救背包
      for (const s of [-1, 1]) torsoParts.push(limb(v(s * 0.052, 0.458, 0.085), v(0, 0.392, 0.111), 0.0042, 0.0042, P(dk(L.shirt, 0.72), L.shirtSurf ?? S.CLOTH), 5));
      torsoParts.push(rbox(0.065, 0.065, 0.006, -0.1, 0.39, zf + 0.002, P(0xc9cbc4, S.CORDURA), 0.008), rbox(0.045, 0.014, 0.004, -0.1, 0.39, zf + 0.0055, P(0x2f7a4e, S.CORDURA), 0.002), rbox(0.014, 0.045, 0.004, -0.1, 0.39, zf + 0.0055, P(0x2f7a4e, S.CORDURA), 0.002));
      // 红色止血带包、急救包挂在腰带上（见 pelvis）：背心正面腰上那一截空着——低持枪时右手和枪就在那里
      // 听诊器挂在脖子上，听头垂在右胸
      const tube = P(0x2e3133, S.RUBBER), path = (pts) => pts.slice(1).map((q, i) => limb(v(...pts[i]), v(...q), 0.0055, 0.0055, tube, 6));
      torsoParts.push(path([[-0.045, 0.33, zf + 0.006], [-0.058, 0.4, zf + 0.002], [-0.072, 0.452, 0.075], [-0.06, 0.49, 0.0], [-0.03, 0.495, -0.06], [0.03, 0.495, -0.06], [0.06, 0.49, 0.0], [0.07, 0.452, 0.075], [0.058, 0.4, zf + 0.003], [0.052, 0.375, zf + 0.008]]));
      const disc = new THREE.CylinderGeometry(0.018, 0.018, 0.008, 14); disc.rotateX(Math.PI / 2); disc.translate(-0.045, 0.318, zf + 0.009); torsoParts.push(colored(disc, P(0xa9adb0, S.METAL)));
      // 胸牌：挂绳从脖子两侧下来，卡套 + 工作证（贴花）
      const lan = P(0x2b5c55, S.CLOTH);
      torsoParts.push(limb(v(-0.05, 0.455, 0.07), v(-0.03, 0.36, zf + 0.004), 0.003, 0.003, lan, 4), limb(v(0.04, 0.458, 0.075), v(0.0, 0.36, zf + 0.004), 0.003, 0.003, lan, 4));
      torsoParts.push(rbox(0.06, 0.092, 0.004, -0.015, 0.31, zf + 0.004, P(0x9aa1a4, S.GLOSS), 0.004), rbox(0.014, 0.012, 0.006, -0.015, 0.36, zf + 0.005, clip, 0.002));
      torsoParts.push(decalGeo(rbox(0.054, 0.085, 0.003, -0.015, 0.309, zf + 0.0062, P(0xdedfda, S.PLASTIC), 0.003), DECAL.LIN_BADGE));
      setDecalBox(DECAL.LIN_BADGE, AT.torso[0] - 0.015, AT.torso[1] + 0.309, 0.027, 0.0425);
      const bz = T.point(0.5, 0.27).p[2] - 0.038;
      torsoParts.push(rbox(0.25, 0.27, 0.075, 0, 0.27, bz, pouch, 0.03), rbox(0.08, 0.025, 0.004, 0, 0.3, bz - 0.038, P(0x2f7a4e, S.CORDURA), 0.002), rbox(0.025, 0.08, 0.004, 0, 0.3, bz - 0.038, P(0x2f7a4e, S.CORDURA), 0.002));
      torsoParts.push(rbox(0.25, 0.012, 0.079, 0, 0.36, bz, P(dk(L.pouch, 0.7), S.CORDURA), 0.004)); // 背包的拉链盖
    }
    // 胸前左侧挂一支小手电（灯罩在 squad.js：镜头那一点亮在灯体正前方）：灯体、灯头的一圈边、背后的夹子
    const tz = T.point(T.sAt(0.1), 0.36).p[2];
    const body = new THREE.CylinderGeometry(0.0155, 0.0165, 0.032, 12); body.rotateX(Math.PI / 2); body.translate(0.1, 0.36, tz + 0.018);
    const bezel = new THREE.TorusGeometry(0.0135, 0.0032, 6, 14); bezel.translate(0.1, 0.36, tz + 0.034);
    torsoParts.push(colored(body, P(0x2a2b2d, S.METAL)), colored(bezel, P(0x4a4c4f, S.METAL)), rbox(0.02, 0.04, 0.005, 0.1, 0.36, tz + 0.002, clip, 0.002));
  } else {
    torsoParts.push(rbox(0.41, 0.33, 0.28, 0, 0.26, 0.005, vest, 0.045));
    // 背心肩带、下摆缝线
    torsoParts.push(rbox(0.07, 0.05, 0.3, 0.12, 0.45, 0, strap, 0.02), rbox(0.07, 0.05, 0.3, -0.12, 0.45, 0, strap, 0.02), rbox(0.414, 0.012, 0.284, 0, 0.098, 0.005, seam, 0.005));
    // 腰封（两侧的宽带）+ 正面两个插扣
    for (const s of [-1, 1]) torsoParts.push(rbox(0.024, 0.14, 0.2, s * 0.205, 0.18, 0, strap, 0.008), rbox(0.03, 0.035, 0.012, s * 0.15, 0.17, 0.147, clip, 0.004), rbox(0.016, 0.02, 0.006, s * 0.15, 0.17, 0.155, P(0x111213, S.POLYMER), 0.002));
    // 正面的织带（MOLLE）：一排排横的窄带，弹匣包挂在上面
    for (const y of [0.11, 0.14, 0.27, 0.3, 0.33, 0.36]) torsoParts.push(rbox(0.36, 0.012, 0.005, 0, y, 0.146, strap, 0.002));
    for (const y of [0.13, 0.17, 0.21, 0.25, 0.29, 0.33]) torsoParts.push(rbox(0.22, 0.012, 0.005, 0, y, -0.137, strap, 0.002)); // 背面也有
    const front = [pouch, pouch, pouch];
    [-0.105, 0, 0.105].forEach((x, i) => {
      torsoParts.push(rbox(0.085, 0.12, 0.05, x, 0.17, 0.16, front[i], 0.015), rbox(0.09, 0.035, 0.056, x, 0.225, 0.162, front[i], 0.012));
      torsoParts.push(rbox(0.018, 0.03, 0.006, x, 0.2, 0.19, buckle, 0.004));
    });
    torsoParts.push(rbox(0.05, 0.13, 0.1, 0.215, 0.2, 0.02, pouch, 0.015));
    torsoParts.push(rbox(0.1, 0.03, 0.008, 0.1, 0.4, 0.146, P(L.nameTape ?? L.strap, S.CORDURA), 0.004));
    // 背后的水袋和电台、天线
    torsoParts.push(rbox(0.26, 0.3, 0.07, 0, 0.27, -0.17, pouch, 0.03), rbox(0.08, 0.16, 0.06, 0.1, 0.36, -0.215, belt, 0.015), limb(v(0.12, 0.42, -0.22), v(0.12, 0.66, -0.22), 0.007, 0.005, gun, 5));
    // 脖子：面罩的围脖
    torsoParts.push(lathe(v(0, 0.425, 0), v(0, 0.535, 0.005), [[0, 0.072], [0.3, 0.06], [1, 0.056]], L.mask, S.KNIT, 14));
    if (L.heavy) {
      // 重装：加厚的前后插板、护肩（小一圈、顺着肩膀往下斜，不再是一字横杠）、护喉
      torsoParts.push(rbox(0.45, 0.2, 0.31, 0, 0.16, 0.005, vest, 0.04));
      for (const y of [0.12, 0.16, 0.2]) torsoParts.push(rbox(0.38, 0.012, 0.005, 0, y, 0.162, strap, 0.002));
      for (const s of [-1, 1]) torsoParts.push(colored(rot(rboxGeo(0.11, 0.036, 0.16, 2, 0.016), 0, 0, -s * 0.38).translate(s * 0.215, 0.425, 0), vest));
      torsoParts.push(rbox(0.15, 0.045, 0.035, 0, 0.462, 0.11, vest, 0.016, -0.25));
    }
  }
  const torso = wear(mergeRig(torsoParts), AT.torso);

  // ---- 头 ----
  const headParts = [];
  let visor;
  if (human) {
    // 头型、脸的贴花（眼睛眉毛唇形）都按 rig-skin.js 的 FACES；没有贴花的档位用小几何体的五官
    const F = FACES[L.face], hc = F.c, hr = F.r, slot = rigDecalsOn() ? F.slot : 0;
    setDecalBox(F.slot, AT.head[0] + hc[0], AT.head[1] + hc[1], hr[0], hr[1]);
    headParts.push(humanHead({ c: hc, r: hr, k: F.k, nose: F.nose, stubble: F.stubble, skin: L.skin, lip: L.lip, brow: L.hair, iris: L.iris, hair: L.hair, line: F.line, decal: slot }));
    headParts.push(hairShell({ c: hc, r: hr, k: F.k, hair: L.hair, line: F.line, inflate: zhe ? 1.04 : 1.05 }));
    if (zhe) {
      // 黄色安全帽：帽壳、一圈帽檐（前面长）、顶上一道加强筋、帽灯；帽檐里一圈深色的吸汗带
      const dome = new THREE.SphereGeometry(0.124, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(0.94, 0.86, 1.08); dome.translate(0, 0.142, -0.002);
      const brim = new THREE.CylinderGeometry(0.128, 0.132, 0.012, 28); brim.scale(0.94, 1, 1.1); brim.translate(0, 0.142, 0.002);
      const peak = new THREE.CylinderGeometry(0.06, 0.06, 0.01, 16, 1, false, -Math.PI / 2, Math.PI); peak.scale(1.4, 1, 0.9); peak.translate(0, 0.139, 0.118);
      const rib = new THREE.TorusGeometry(0.106, 0.011, 6, 20, Math.PI); rib.rotateY(Math.PI / 2); rib.scale(1, 0.86, 1.08); rib.translate(0, 0.142, -0.002);
      const band = new THREE.CylinderGeometry(0.094, 0.094, 0.008, 24, 1, true); band.scale(1, 1, 1.12); band.translate(0, 0.134, 0.002);
      headParts.push(colored(dome, helmet), colored(brim, helmet), colored(peak, helmet), colored(rib, helmet), colored(band, P(0x1b1b1c, S.LEATHER)));
      headParts.push(rbox(0.036, 0.024, 0.026, 0, 0.165, 0.126, P(0x2a2b2c, S.POLYMER), 0.008));
      const lens = new THREE.CylinderGeometry(0.0085, 0.0085, 0.005, 12); lens.rotateX(Math.PI / 2); lens.translate(0, 0.165, 0.14); headParts.push(colored(lens, P(0x8b9295, S.GLOSS)));
    } else {
      // 林医生：头发往后梳，脑后低低地挽一个髻，扎一根头绳（侧面、背面都看得出）
      headParts.push(ell([0.037, 0.032, 0.03], [0, 0.068, -0.118], P(L.hair, S.HAIR), 14, 10), ell([0.026, 0.02, 0.018], [0, 0.074, -0.142], P(L.hair, S.HAIR), 10, 8));
      const tie = new THREE.TorusGeometry(0.022, 0.0065, 6, 16); tie.scale(1, 0.9, 1); tie.translate(0, 0.07, -0.096); headParts.push(colored(tie, P(0x5a2632, S.RUBBER)));
      // 外科口罩拉到下巴底下：一片带三道褶的长方形垂在下巴底下，四根耳挂绕到耳朵后面（rig-skin.js surgicalMask）
      headParts.push(surgicalMask({ c: hc, hex: 0x86a9bd, loop: 0xd6dcdf, ear: [hc[0] + hr[0] * 0.95, hc[1] - 0.012, hc[2] - 0.012] }));
    }
    visor = new THREE.BufferGeometry().copy(LENS_STUB);
  } else {
    // 面罩里的头：同一个雕过的头型（力度 0.75）——面罩底下看得出鼻梁、眉骨和下巴；面罩是针织的（竖罗纹）
    const mh = sculptHeadMask();
    headParts.push(colored(mh, mask), ball(0.0095, 0, 0.07, 0.112, mask, 1, 1.7, 1), box(0.11, 0.03, 0.02, 0, 0.107, 0.083, skin)); // 镜框边上露出一点皮肤
    const helmetTop = new THREE.SphereGeometry(0.138, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2); helmetTop.scale(1, 0.95, 1.1); helmetTop.translate(0, 0.12, -0.005);
    headParts.push(
      colored(helmetTop, helmet),
      limb(v(0, 0.118, -0.01), v(0, 0.135, -0.01), 0.146, 0.146, helmet, 16), // 帽檐
      rbox(0.03, 0.03, 0.16, -0.14, 0.15, 0, gun, 0.008), rbox(0.03, 0.03, 0.16, 0.14, 0.15, 0, gun, 0.008), // 两侧导轨
      rbox(0.05, 0.085, 0.085, -0.122, 0.08, -0.005, pad, 0.02), rbox(0.05, 0.085, 0.085, 0.122, 0.08, -0.005, pad, 0.02), // 耳罩
      rbox(0.045, 0.03, 0.03, 0, 0.215, 0.135, gun, 0.008), // 夜视仪挂座
      rbox(0.06, 0.03, 0.012, 0, 0.2, -0.15, P(0x3a3b35, S.RUBBER), 0.006), // 后脑的电池盒 / 识别灯
    );
    // 护目镜：一整片弧形的深色镜片（单独的网格，用镜片材质），一圈橡胶镜框，两侧的扣、绕到脑后的松紧带
    const G = gogglesFor(mh);
    headParts.push(...G.frame, G.strap);
    // 面罩嘴前一块透气的网布（略鼓、深一点），后脑勺识别贴（反光的方块，手电一照就亮）、两侧导轨上的金属卡座
    const mouth = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); mouth.rotateX(Math.PI / 2); mouth.scale(0.026, 0.018, 0.005);
    const mf = (() => { const q = mh.attributes.position; let z = 0; for (let i = 0; i < q.count; i++) if (Math.abs(q.getY(i) - 0.034) < 0.015 && Math.abs(q.getX(i)) < 0.012) z = Math.max(z, q.getZ(i)); return z; })();
    mouth.translate(0, 0.034, mf - 0.002); headParts.push(colored(mouth, P(dk(L.mask, 0.82), S.CORDURA)));
    headParts.push(rbox(0.036, 0.036, 0.006, 0, 0.175, -0.148, P(0x8e9294, S.RETRO), 0.004, 0.25));
    for (const s of [-1, 1]) headParts.push(rbox(0.012, 0.022, 0.03, s * 0.157, 0.15, 0.05, buckle, 0.003));
    visor = G.lens;
  }
  const head = wear(mergeRig(headParts), AT.head);

  // ---- 双臂和步枪一起，绕肩线转（抬枪、压枪、后坐）----
  // 枪是一支紧凑的短枪（伸缩托收着）：枪口还在原处（squad.js / 这里的 muzzle 在 z 0.78），机匣、握把、弹匣、枪托往前挪了 8 厘米——
  // 低持枪时整组绕胸口转下去，原来的握把、右手、弹匣正好扎进背心（胸前一块碎的黑三角、手从包里穿出来），挪出来就在背心前面了
  const rs = v(-0.2, 0, 0), re = v(-0.245, -0.215, 0.1), rh = v(-0.1, -0.155, 0.26);
  const ls = v(0.2, 0, 0), le = v(0.17, -0.2, 0.24), lh = v(-0.07, -0.12, 0.42);
  const cuffC = P(dk(L.shirt, 0.8), L.shirtSurf ?? S.CLOTH), gloveCuff = P(L.gloveCuff ?? dk(L.glove, 0.7), L.gloveSurf ?? S.LEATHER);
  const ring = (at, dir, r, tube, c, seg = 14) => { const g = new THREE.TorusGeometry(r, tube, 5, seg); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)); g.translate(at.x, at.y, at.z); return colored(g, c); };
  const arm = (s, e, h) => {
    const out = [], ua = e.clone().sub(s).normalize(), fa = h.clone().sub(e).normalize();
    if (L.sleeve === 'short') {
      // 短袖：袖子到上臂一半，袖口卷一道边（一圈略粗、颜色深一点的边）；下面露胳膊——上臂、小臂同一个肤色，
      // 小臂按肌肉粗细车出来（肘下最粗，往手腕收细），手腕细
      const m = s.clone().lerp(e, 0.52);
      out.push(lathe(s, m, [[0, 0.056], [0.4, 0.055], [1, 0.052]], L.shirt, L.shirtSurf ?? S.CLOTH, 14), ring(m.clone().lerp(s, 0.02), ua, 0.051, 0.0042, P(dk(L.shirt, 0.8), L.shirtSurf ?? S.CLOTH)));
      out.push(lathe(s.clone().lerp(e, 0.4), e, [[0, 0.043], [0.5, 0.041], [1, 0.037]], L.skin, S.SKIN, 12), ball(0.037, e.x, e.y, e.z, skin, 1, 1, 1));
      out.push(lathe(e, h, [[0, 0.037], [0.2, 0.04], [0.55, 0.035], [0.84, 0.028], [1, 0.026]], L.skin, S.SKIN, 12));
    } else {
      // 长袖：三角肌往下收成上臂，肘、小臂（肘下最粗）往手腕收；袖口一圈收口 + 一颗扣子
      out.push(lathe(s, e, [[0, 0.058], [0.15, 0.058], [0.45, 0.053], [0.8, 0.047], [1, 0.045]], L.shirt, L.shirtSurf ?? S.CLOTH, 14));
      out.push(ball(0.045, e.x, e.y, e.z, shirt), lathe(e, h, [[0, 0.045], [0.22, 0.047], [0.6, 0.041], [0.85, 0.037], [1, 0.036]], L.shirt, L.shirtSurf ?? S.CLOTH, 12));
      const c0 = h.clone().lerp(e, 0.2), c1 = h.clone().lerp(e, 0.07);
      out.push(lathe(c0, c1, [[0, 0.04], [0.1, 0.042], [0.9, 0.042], [1, 0.04]], cuffC.hex, cuffC.surf, 12));
      if (L.cuffButton) { const up = new THREE.Vector3().crossVectors(fa, Y).normalize(), q = c0.clone().lerp(c1, 0.5).addScaledVector(up, s.x < 0 ? -0.042 : 0.042); out.push(dot(0.0042, q.x, q.y, q.z, P(0x8c8f8a, S.POLYMER))); }
    }
    out.push(hand(e, h, glove, gloveCuff, s.x < 0 ? 1 : -1));
    if (pads) {
      // 护肘：包在肘尖外侧的一块软壳（不再是一个灰球）
      const ax = h.clone().sub(s).normalize(), outv = e.clone().sub(s.clone().lerp(h, 0.5)), side = new THREE.Vector3().crossVectors(ax, outv).normalize();
      outv.addScaledVector(ax, -ax.dot(outv)).normalize(); side.crossVectors(ax, outv).normalize();
      const g = new THREE.SphereGeometry(1, 12, 8); g.scale(0.046, 0.06, 0.036);
      g.applyMatrix4(new THREE.Matrix4().makeBasis(side, ax, outv)); g.translate(e.x + outv.x * 0.02, e.y + outv.y * 0.02, e.z + outv.z * 0.02);
      out.push(colored(g, pad));
    }
    return out;
  };
  // 肩：小一圈的三角肌（压扁的椭球，顺着上臂往下斜），不再是比头还宽的大球
  const delt = (x) => { const g = new THREE.SphereGeometry(1, 14, 10); g.scale(0.056, 0.06, 0.06); g.rotateZ(x < 0 ? 0.35 : -0.35); g.translate(x, -0.012, 0); return colored(g, shirt); };
  const rifleGun = () => [
    rbox(0.055, 0.1, 0.32, -0.1, -0.1, 0.29, gun, 0.012), // 机匣
    rbox(0.06, 0.075, 0.22, -0.1, -0.085, 0.47, gun2, 0.015), // 护木
    rbox(0.012, 0.012, 0.32, -0.1, -0.043, 0.32, gun, 0.003), // 顶上导轨
    limb(v(-0.1, -0.08, 0.57), v(-0.1, -0.08, 0.76), 0.013, 0.013, gun, 8), // 枪管
    limb(v(-0.1, -0.08, 0.74), v(-0.1, -0.08, 0.8), 0.02, 0.02, gun, 8), // 消焰器
    rbox(0.036, 0.12, 0.06, -0.1, -0.19, 0.3, gun, 0.01, 0.32), // 弹匣（短，往前斜）
    rbox(0.04, 0.09, 0.05, -0.1, -0.185, 0.2, gun2, 0.01, -0.3), // 握把
    rbox(0.045, 0.085, 0.15, -0.1, -0.105, 0.07, gun2, 0.018), rbox(0.05, 0.1, 0.02, -0.1, -0.11, -0.005, P(0x161718, S.RUBBER), 0.008), // 伸缩托 + 托底板
    rbox(0.04, 0.05, 0.09, -0.1, -0.02, 0.3, gun, 0.01), // 瞄具
    limb(v(-0.1, -0.135, 0.4), v(-0.1, -0.135, 0.52), 0.012, 0.012, belt, 5), // 枪带
  ];
  const aimParts = [arm(rs, re, rh), arm(ls, le, lh), delt(-0.19), delt(0.19), rifleGun()];
  const aim = wear(mergeRig(aimParts), AT.aim);

  // ---- 联机人形：几副手臂（不带枪）+ 几把武器，都在 aim 的坐标里（肩线中点为原点，+Z 朝前，右手在 -X）----
  // 刀 / 斧子那只右手单独一组（knifeR，原点在右肩：挥刀时整条胳膊绕肩转），轴心见 HELD_POSES.pivot
  let held = null;
  if (opts.held) {
    const steel = P(0xa4a8ac, S.METAL), dark = P(0x2a2b2d, S.POLYMER), wood = P(0x5a3a22, S.LEATHER), olive = P(0x3d4532, S.POLYMER), tan = P(0x6b5a3c, S.POLYMER);
    /** 一根方条：从 a 到 b，截面 w × h（h 那一边尽量朝上） */
    const bar = (a, b, w, h, c) => {
      const d = b.clone().sub(a), len = d.length(), f = d.normalize(); let sx = new THREE.Vector3().crossVectors(Y, f);
      if (sx.lengthSq() < 1e-6) sx.set(1, 0, 0); sx.normalize(); const up = new THREE.Vector3().crossVectors(f, sx);
      const g = new THREE.BoxGeometry(w, h, len); g.applyMatrix4(new THREE.Matrix4().makeBasis(sx, up, f)); g.translate((a.x + b.x) / 2 + 0, (a.y + b.y) / 2, (a.z + b.z) / 2);
      return colored(g, c);
    };
    const PZ = HELD_POSES.pivot, piv = v(PZ[0], PZ[1], PZ[2]), atR = [AT.aim[0] + PZ[0], AT.aim[1] + PZ[1], AT.aim[2] + PZ[2]];
    const J = (q) => v(q[0], q[1], q[2]);
    const armsOf = (q, side = 'both') => [side !== 'left' ? arm(J(q.r[0]), J(q.r[1]), J(q.r[2])) : [], side !== 'right' ? arm(J(q.l[0]), J(q.l[1]), J(q.l[2])) : [], side !== 'left' ? delt(-0.19) : [], side !== 'right' ? delt(0.19) : []];
    const toPivot = (list) => list.flat(Infinity).map((g) => g.translate(-piv.x, -piv.y, -piv.z));
    const K = HELD_POSES.knife, kh = J(K.r[2]), kf = kh.clone().sub(J(K.r[1])).normalize();
    const A = HELD_POSES.axe, ah = J(A.r[2]), af = ah.clone().sub(J(A.r[1])).normalize();
    const kup = new THREE.Vector3().crossVectors(kf, new THREE.Vector3().crossVectors(Y, kf).normalize()).normalize();
    const aup = new THREE.Vector3().crossVectors(af, new THREE.Vector3().crossVectors(Y, af).normalize()).normalize();
    const at = (o, f, k) => o.clone().addScaledVector(f, k);
    held = {
      arms: {
        rifle: wear(mergeRig(armsOf(HELD_POSES.rifle)), AT.aim),
        pistol: wear(mergeRig(armsOf(HELD_POSES.pistol)), AT.aim),
        none: wear(mergeRig(armsOf(HELD_POSES.none)), AT.aim),
        knifeL: wear(mergeRig(armsOf(K, 'left')), AT.aim),
        knifeR: wear(mergeRig(toPivot(armsOf(K, 'right'))), atR),
        axeR: wear(mergeRig(toPivot(armsOf(A, 'right'))), atR),
      },
      guns: {
        rifle: wear(mergeRig(rifleGun()), AT.aim),
        // 冲锋枪：短机匣、长直弹匣、折叠托（细铁条）、短枪管
        smg: wear(mergeRig([
          rbox(0.05, 0.085, 0.25, -0.1, -0.095, 0.33, gun, 0.012), rbox(0.04, 0.05, 0.1, -0.1, -0.085, 0.5, gun2, 0.012),
          limb(v(-0.1, -0.08, 0.55), v(-0.1, -0.08, 0.66), 0.012, 0.012, gun, 8), rbox(0.03, 0.17, 0.038, -0.1, -0.22, 0.36, gun, 0.008, 0.08),
          rbox(0.036, 0.085, 0.045, -0.1, -0.175, 0.22, gun2, 0.01, -0.3), bar(v(-0.1, -0.08, 0.2), v(-0.1, -0.1, 0.02), 0.012, 0.012, gun), bar(v(-0.1, -0.1, 0.02), v(-0.1, -0.16, 0.02), 0.012, 0.04, gun),
          rbox(0.02, 0.03, 0.05, -0.1, -0.04, 0.32, gun, 0.006),
        ]), AT.aim),
        // 榴弹枪：粗短的发射管 + 前握把 + 肩托
        launcher: wear(mergeRig([
          limb(v(-0.1, -0.07, 0.16), v(-0.1, -0.07, 0.62), 0.036, 0.036, olive, 12), limb(v(-0.1, -0.07, 0.6), v(-0.1, -0.07, 0.64), 0.04, 0.04, gun, 12),
          rbox(0.06, 0.1, 0.16, -0.1, -0.1, 0.14, gun, 0.014), rbox(0.04, 0.09, 0.05, -0.1, -0.185, 0.2, gun2, 0.01, -0.3),
          rbox(0.035, 0.08, 0.04, -0.1, -0.15, 0.42, gun2, 0.01), rbox(0.05, 0.09, 0.14, -0.1, -0.1, 0.02, tan, 0.016), rbox(0.025, 0.045, 0.06, -0.1, -0.005, 0.32, gun, 0.006),
        ]), AT.aim),
        // 手枪：套筒、枪身、握把（双手握在胸前）
        pistol: wear(mergeRig([
          rbox(0.03, 0.034, 0.19, -0.045, -0.085, 0.475, gun, 0.006), rbox(0.028, 0.022, 0.15, -0.045, -0.108, 0.47, gun2, 0.006),
          rbox(0.03, 0.09, 0.042, -0.045, -0.148, 0.405, gun2, 0.01, -0.28), rbox(0.006, 0.012, 0.012, -0.045, -0.062, 0.56, gun, 0.002),
        ]), AT.aim),
        // 刀：握在右手里，刃顺着小臂往前（刀柄、护手、刀刃）
        knife: wear(mergeRig(toPivot([
          bar(at(kh, kf, -0.05), at(kh, kf, 0.05), 0.024, 0.03, dark), bar(at(kh, kf, 0.05), at(kh, kf, 0.065), 0.03, 0.06, gun),
          bar(at(kh, kf, 0.065), at(kh, kf, 0.24), 0.006, 0.034, steel),
        ])), atR),
        // 斧子：长柄（握在后半截）、斧头横在前端
        axe: wear(mergeRig(toPivot([
          bar(at(ah, af, -0.12), at(ah, af, 0.42), 0.028, 0.034, wood),
          bar(at(ah, af, 0.36).addScaledVector(aup, -0.03), at(ah, af, 0.36).addScaledVector(aup, 0.13), 0.02, 0.1, steel),
          bar(at(ah, af, 0.33).addScaledVector(aup, -0.05), at(ah, af, 0.33).addScaledVector(aup, -0.015), 0.024, 0.05, gun),
        ])), atR),
      },
      muzzle: HELD_POSES.muzzle, pivot: PZ, knifeUp: [kup.x, kup.y, kup.z],
    };
  }

  // ---- 腿 ----
  const pocket = P(lin ? L.pants : L.pouch, lin ? (L.pantsSurf ?? S.CLOTH) : S.CORDURA);
  // 裤子的缝：两侧的侧缝（外侧缝、内侧缝——两条腿共用一个网格，两边都有）、前面的烫线，作战裤 / 工装裤膝盖上两道立体裁剪的拼缝，
  // 裤脚一圈卷边——真的缝线，不是贴图里一排排的人字纹
  const thighProf = [[0, 0.098], [0.3, 0.092], [0.75, 0.08], [1, 0.074]], shinProf = [[0, 0.07], [0.3, 0.068], [0.75, 0.058], [1, 0.056]];
  const rAt = (prof, t) => { for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) { const [t0, r0] = prof[i - 1], [t1, r1] = prof[i]; return r0 + (r1 - r0) * (t - t0) / (t1 - t0); } return prof[prof.length - 1][1]; };
  const seamC = dk(L.pants, 0.7), pSurf = L.pantsSurf ?? S.CLOTH;
  const seamLine = (prof, len, a, t0 = 0, t1 = 1) => edgeTube(Array.from({ length: 7 }, (_, k) => { const t = t0 + (t1 - t0) * k / 6, r = rAt(prof, t) + 0.0008; return { p: [Math.sin(a) * r, -t * len, Math.cos(a) * r], n: [Math.sin(a), 0, Math.cos(a)] }; }), 0.0022, seamC, pSurf, { closed: false, sides: 3, inset: 0 });
  const arcSeam = (prof, len, t, a0, a1, n = 9) => edgeTube(Array.from({ length: n }, (_, k) => { const a = a0 + (a1 - a0) * k / (n - 1), r = rAt(prof, t) + 0.0008; return { p: [Math.sin(a) * r, -t * len, Math.cos(a) * r], n: [Math.sin(a), 0, Math.cos(a)] }; }), 0.0022, seamC, pSurf, { closed: false, sides: 3, inset: 0 });
  const thigh = wear(mergeRig([
    lathe(v(0, 0, 0), v(0, -THIGH, 0), thighProf, L.pants, pSurf, 14), ball(0.098, 0, 0, 0, pants), ball(0.074, 0, -THIGH, 0, pants),
    rbox(0.05, 0.14, 0.13, 0.085, -0.2, 0.01, pocket, 0.015), rbox(0.056, 0.035, 0.136, 0.087, -0.13, 0.01, pocket, 0.012), // 侧兜 + 兜盖
    rbox(0.004, 0.003, 0.12, 0.111, -0.149, 0.01, P(dk(pocket.hex, 0.6), pocket.surf), 0.001), // 兜盖底下的缝
    seamLine(thighProf, THIGH, Math.PI / 2, 0.08), seamLine(thighProf, THIGH, -Math.PI / 2, 0.08), seamLine(thighProf, THIGH, 0, 0.12, 0.92), // 侧缝、烫线
  ]), AT.thigh);
  const shinLen = SHIN - 0.06;
  const shin = wear(mergeRig([
    lathe(v(0, 0, 0), v(0, -shinLen, 0), shinProf, L.pants, pSurf, 14),
    seamLine(shinProf, shinLen, Math.PI / 2), seamLine(shinProf, shinLen, -Math.PI / 2),
    lin ? [] : [arcSeam(shinProf, shinLen, 0.02, -1.3, 1.3), arcSeam(shinProf, shinLen, 0.24, -1.3, 1.3)], // 膝盖的拼缝（作战裤、工装裤）
    colored(new THREE.TorusGeometry(0.0565, 0.004, 4, 16).rotateX(Math.PI / 2).translate(0, -shinLen + 0.004, 0), P(dk(L.pants, 0.82), pSurf)), // 裤脚卷边
    pads ? rbox(0.1, 0.11, 0.06, 0, -0.02, 0.06, pad, 0.025) : [], // 护膝
    pads ? rbox(0.104, 0.02, 0.04, 0, -0.02, 0.02, belt, 0.006) : [], // 护膝的绑带
    rbox(0.115, 0.13, 0.27, 0, -SHIN - 0.025, 0.04, boot, 0.035),
    rbox(0.07, 0.05, 0.1, 0, -SHIN + 0.025, 0.1, P(dk(L.boot, 0.7), L.bootSurf ?? S.LEATHER), 0.012), // 鞋带那一条
    rbox(0.12, 0.022, 0.28, 0, -SHIN - 0.085, 0.04, sole, 0.008), // 鞋底
  ]), AT.shin);
  return { pelvis, torso, head, visor, aim, thigh, shin, held };
}
/**
 * 联机人形按手里拿的换的几副手臂（aim 的坐标：肩线中点为原点，+Z 朝前，右手在 -X）：r / l = [肩, 肘, 手]。
 * rifle：两手端枪（冲锋枪、榴弹枪也这么端）；pistol：两手往前伸、握在胸前；knife：右手握刀在前下方、左手护在胸前；axe：右手提斧在身侧；
 * none：两手垂着（没拿东西的小许）。pivot：刀 / 斧子那条右胳膊绕着转的点（右肩）；muzzle：每把枪的枪口
 */
export const HELD_POSES = Object.freeze({
  rifle: Object.freeze({ r: [[-0.2, 0, 0], [-0.245, -0.215, 0.1], [-0.1, -0.155, 0.26]], l: [[0.2, 0, 0], [0.17, -0.2, 0.24], [-0.07, -0.12, 0.42]] }),
  pistol: Object.freeze({ r: [[-0.2, 0, 0], [-0.17, -0.16, 0.22], [-0.05, -0.125, 0.42]], l: [[0.2, 0, 0], [0.13, -0.18, 0.21], [-0.015, -0.14, 0.405]] }),
  knife: Object.freeze({ r: [[-0.2, 0, 0], [-0.27, -0.25, 0.05], [-0.2, -0.3, 0.29]], l: [[0.2, 0, 0], [0.25, -0.22, 0.1], [0.12, -0.17, 0.3]] }),
  axe: Object.freeze({ r: [[-0.2, 0, 0], [-0.26, -0.27, 0.04], [-0.22, -0.4, 0.22]], l: [[0.2, 0, 0], [0.25, -0.22, 0.1], [0.12, -0.17, 0.3]] }),
  none: Object.freeze({ r: [[-0.2, 0, 0], [-0.25, -0.27, -0.01], [-0.24, -0.53, 0.04]], l: [[0.2, 0, 0], [0.25, -0.27, -0.01], [0.24, -0.53, 0.04]] }),
  pivot: Object.freeze([-0.2, 0, 0]),
  muzzle: Object.freeze({ rifle: Object.freeze([-0.1, -0.08, 0.78]), smg: Object.freeze([-0.1, -0.08, 0.66]), launcher: Object.freeze([-0.1, -0.07, 0.65]), pistol: Object.freeze([-0.045, -0.085, 0.575]) }),
});
const smooth01 = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
// 队友没有护目镜：visor 给一个空的几何体（接口不变）
const LENS_STUB = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
/**
 * 戴手套的手（握着枪）：手背一块、四根手指（两节，指根往前、第二节往下卷着握住）、拇指压在旁边，手腕一圈深色的手套口。
 * 不再是一块扁板（「连指手套」）。e→h 是小臂方向；th：拇指在哪一侧（右手 1，左手 -1）。
 */
function hand(e, h, c, cuff, th = 1) {
  const f = h.clone().sub(e).normalize(), side = new THREE.Vector3().crossVectors(f, Y).normalize(), up = new THREE.Vector3().crossVectors(side, f);
  const m = new THREE.Matrix4().makeBasis(side, up, f).setPosition(h);
  const parts = [rboxGeo(0.07, 0.032, 0.066, 1, 0.012).translate(0, 0.003, 0.026)];
  // 四根手指：各一块小圆角方块，第一节往前、第二节往下卷（并拢，侧面挨着侧面——指缝就是圆角留下的那道暗线），小指短一点
  [-0.0255, -0.0085, 0.0085, 0.0255].forEach((x, i) => {
    const l = i === 3 ? 0.85 : i === 1 ? 1.06 : 1, w = i === 3 ? 0.0145 : 0.0165;
    parts.push(rboxGeo(w, 0.022, 0.03 * l, 1, 0.0055).translate(x, 0.004, 0.066 + 0.006 * l));
    parts.push(rboxGeo(w * 0.96, 0.03 * l, 0.02, 1, 0.0055).rotateX(-0.25).translate(x, -0.016 * l, 0.077 + 0.004 * l));
  });
  // 拇指：两节，顺着拳头往前压
  const seg = (a, b, r) => { const d = new THREE.Vector3().subVectors(b, a), len = d.length(); const g = new THREE.CylinderGeometry(r * 0.92, r, len, 8, 1, true); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g; };
  const t0 = v(-th * 0.03, -0.004, 0.01), t1 = v(-th * 0.038, -0.01, 0.046), t2 = v(-th * 0.03, -0.016, 0.07);
  parts.push(seg(t0, t1, 0.0115), new THREE.SphereGeometry(0.0106, 8, 6).translate(t1.x, t1.y, t1.z), seg(t1, t2, 0.0105), new THREE.SphereGeometry(0.0095, 8, 6).translate(t2.x, t2.y, t2.z));
  const out = parts.map((g) => colored(g.applyMatrix4(m), c));
  // 手套口：手腕一圈深色的收口
  const cg = new THREE.CylinderGeometry(0.037, 0.036, 0.026, 12, 1, true); cg.rotateX(Math.PI / 2); cg.translate(0, 0, -0.006); out.push(colored(cg.applyMatrix4(m), cuff || c));
  return out;
}
// 面罩里的头：雕过的头型（力度 0.75），和原来的球一样大
function sculptHeadMask() {
  const g = new THREE.SphereGeometry(1, 22, 18), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const [x, y, z] = sculpt(p.getX(i), p.getY(i), p.getZ(i), 0.75); p.setXYZ(i, x * 0.103, 0.095 + y * 0.121, z * 0.11); } // 力度 0.75：面罩是贴脸的针织，眉骨、颧骨、下巴都透出来
  g.computeVertexNormals();
  return g;
}
/**
 * 护目镜：两片往外鼓的椭圆镜片（单独的网格，用镜片材质：低粗糙度、有反光，手电一照就有一点高光），
 * 每片一圈橡胶镜框、中间一道鼻梁、两侧的扣；松紧带从两侧扣上去，绕过耳罩、勒在头盔后半圈上（不是一条横贯的「焊工面罩」缝）
 */
function gogglesFor(mh) {
  const p = mh.attributes.position, yc = 0.106;
  // 眼睛那一截面罩最靠前的弧（按 x 取：镜片贴着脸）
  const front = (x) => { let z = 0; for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - yc) < 0.018 && Math.abs(p.getX(i) - x) < 0.02 && p.getZ(i) > z) z = p.getZ(i); return z; };
  const lens = [], frame = [];
  for (const s of [-1, 1]) {
    const cx = s * 0.034, cz = front(cx) + 0.007, turn = s * 0.32;
    const cap = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); cap.rotateX(Math.PI / 2); cap.scale(0.025, 0.0175, 0.011); cap.rotateY(turn); cap.translate(cx, yc, cz);
    lens.push(cap.toNonIndexed());
    const rim = Array.from({ length: 16 }, (_, k) => { const a = k / 16 * Math.PI * 2, q = new THREE.Vector3(Math.cos(a) * 0.0265, Math.sin(a) * 0.019, 0.0015).applyAxisAngle(Y, turn); return { p: [cx + q.x, yc + q.y, cz + q.z], n: [Math.sin(turn), 0, Math.cos(turn)] }; });
    frame.push(edgeTube(rim, 0.0055, 0x1d1e20, SURF.RUBBER, { sides: 5, inset: 0.002 }));
    const clip = rboxGeo(0.014, 0.03, 0.018, 1, 0.004); clip.rotateY(s * 0.9); clip.translate(s * 0.07, yc, front(s * 0.062) - 0.002); frame.push(paintGeo(clip, 0x26272a, SURF.POLYMER));
  }
  const bridge = rboxGeo(0.018, 0.012, 0.012, 1, 0.004); bridge.translate(0, yc + 0.004, front(0) + 0.008); frame.push(paintGeo(bridge, 0x1d1e20, SURF.RUBBER));
  // 松紧带：两侧扣子 → 绕过耳罩外面 → 斜着勒到头盔后半圈
  const sp = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, a = -1.25 - (Math.PI * 2 - 2.5) * t, lift = 0.045 * Math.sin(Math.PI * t) ** 0.6, rx = 0.142 + 0.012 * Math.sin(Math.PI * t), rz = 0.148 + 0.012 * Math.sin(Math.PI * t);
    sp.push({ p: [Math.sin(a) * rx, yc + 0.004 + lift, Math.cos(a) * rz], n: [Math.sin(a), 0.2, Math.cos(a)] });
  }
  const strap = edgeTube(sp, 0.0075, 0x26282a, SURF.CORDURA, { closed: false, sides: 4, inset: 0 });
  return { lens: mergeFlat(lens.map((g) => { g.deleteAttribute('uv'); return g; })), frame, strap };
}

// ---- 射线和人体部件求交 ----
const _ab = new THREE.Vector3(), _ao = new THREE.Vector3(), _c = new THREE.Vector3();
function hitSphere(o, d, c, r, maxDist, out) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z, b = ox * d.x + oy * d.y + oz * d.z, q = ox * ox + oy * oy + oz * oz - r * r, h = b * b - q;
  if (h < 0) return false;
  const t = -b - Math.sqrt(h);
  if (t < 0 || t > maxDist || t >= out.dist) return false;
  out.dist = t; out.point.copy(o).addScaledVector(d, t); out.normal.copy(out.point).sub(c).normalize();
  return true;
}
/** 射线和胶囊（a—b，半径 r）：取射线上离线段最近的点附近的球近似，和原游戏的做法相同 */
function hitCapsule(o, d, a, b, r, maxDist, out) {
  _ab.subVectors(b, a); _ao.subVectors(o, a);
  const aa = _ab.dot(_ab), ad = _ab.dot(d), aao = _ab.dot(_ao), dao = d.dot(_ao), den = aa - ad * ad;
  let s = den > 1e-8 ? (aao - ad * dao) / den : 0; s = s < 0 ? 0 : s > 1 ? 1 : s;
  _c.copy(a).addScaledVector(_ab, s);
  return hitSphere(o, d, _c, r, maxDist, out);
}
const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (k, dt) => 1 - Math.exp(-k * dt);

/**
 * 建一池真人敌人并登记进原游戏的敌人模块。
 * enemies：J.createEnemies(G) 的返回值；patrolLines：可选的巡逻路线（每条是几个 {x,y,z}），出生点附近有路线就沿着走。
 */
export function addSoldiers(G, enemies, { count = SOLDIER.pool, patrolLines = [] } = {}) {
  const ctx = enemies.debug.ctx, rng = ctx.rng;
  const group = new THREE.Group(); group.name = 'soldiers'; G.scene.add(group);
  // 一种材质全员共用：顶点色 + 表面种类 + 共用细节图（rig-skin.js）
  const bodyMat = createRigMaterial({ name: 'soldier', looks: LOOKS });
  const parts = LOOKS.map(buildParts);
  const laserGeo = new THREE.BoxGeometry(0.008, 0.008, 1); laserGeo.translate(0, 0, 0.5);
  const laserMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.25, 0.15), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pool = [], planFrame = { n: -1 };
  for (let i = 0; i < count; i++) {
    const s = makeSoldier(i, i % 3 === 2 ? 1 : 0);
    pool.push(s); group.add(s.rig.group);
  }
  ctx.pools = Object.assign(ctx.pools || {}, { soldier: pool });
  enemies.debug.soldiers = pool;

  function makeSoldier(index, lookIndex) {
    const look = LOOKS[lookIndex], P = parts[lookIndex];
    const mesh = (geo, mat = bodyMat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
    // 镜片：茶色、很光、带一点金属反射（环境光里是一片琥珀色的反光，手电照过去有一个亮点）
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x6a4818, roughness: 0.07, metalness: 0.55, emissive: new THREE.Color(...LENS_CALM) });
    const root = new THREE.Group(); root.name = 'soldier-' + index; root.visible = false;
    const body = new THREE.Group(); root.add(body); // 倒地时绕脚下转
    const hips = new THREE.Group(); hips.position.y = HIP_Y; body.add(hips); hips.add(mesh(P.pelvis));
    const spine = new THREE.Group(); spine.position.y = 0.1; hips.add(spine); spine.add(mesh(P.torso));
    const head = new THREE.Group(); head.position.y = 0.5; spine.add(head); head.add(mesh(P.head));
    const visor = new THREE.Mesh(P.visor, lensMat); head.add(visor);
    const aim = new THREE.Group(); aim.position.set(0, 0.42, 0.02); spine.add(aim); aim.add(mesh(P.aim));
    const muzzle = new THREE.Object3D(); muzzle.position.set(-0.1, -0.08, 0.78); aim.add(muzzle);
    const laser = new THREE.Mesh(laserGeo, laserMat); laser.visible = false; laser.frustumCulled = false; group.add(laser);
    const legs = [0.092, -0.092].map((x) => {
      const thigh = new THREE.Group(); thigh.position.set(x, -0.07, 0); hips.add(thigh); thigh.add(mesh(P.thigh));
      const shin = new THREE.Group(); shin.position.y = -THIGH; thigh.add(shin); shin.add(mesh(P.shin));
      return { thigh, shin };
    });
    const vel = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), aimDir = new THREE.Vector3();
    const headPos = new THREE.Vector3(), chest = new THREE.Vector3(), pelvisPos = new THREE.Vector3(), kneeL = new THREE.Vector3(), kneeR = new THREE.Vector3(), footL = new THREE.Vector3(), footR = new THREE.Vector3();
    const maxHp = look.heavy ? SOLDIER.heavyHp : SOLDIER.hp;
    // 这个人这一次出场用的参数（兵种不同：速度、交战距离、点射长短、伤害都不一样；见 ROLES）
    let CFG = SOLDIER;

    const m = {
      id: 0, type: 'soldier', heavy: look.heavy, pos: root.position, alive: false, active: false, hp: maxHp, rig: { group: root },
      yaw: 0, speed: 0, home: new THREE.Vector3(), lastKnown: new THREE.Vector3(), goal: new THREE.Vector3(), firePos: new THREE.Vector3(), firePlayer: new THREE.Vector3(),
      sensor: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), muzzle: new THREE.Vector3(), headPos,
      mode: 'patrol', modeSeen: 'patrol', los: false, seeT: 0, noSeeT: 0, senseT: 0, exposure: 0, modeT: 0, passive: false, hasToken: false,
      es: 'move', esT: 0, cool: 1, shots: 0, bursts: 0, path: null, wp: 0, planT: 0, hasGoal: false, waitT: 0, moveT: 0, stuckT: 0,
      patrolLine: null, patrolI: 0, planGoal: new THREE.Vector3(), gait: 0, crouch: 0, crouchWant: 0, lowReady: 1, pitch: 0, twist: 0, recoil: 0, recoilV: 0,
      flinchP: 0, flinchPV: 0, flinchR: 0, flinchRV: 0, scan: 0, phase: 0, dieT: 0, fall: 0, fallV: 0, fallSign: 1, fallRoll: 0, crumple: false, sink: 0,

      damage(amount, point, dir, part) {
        if (!m.alive) return false;
        m.hp -= amount;
        G.events.emit('enemy:hit', { enemy: m, point, part: part || 'body' });
        // 中弹一缩：被打的那一侧往后仰
        const k = Math.min(1.5, amount / 25);
        if (dir) {
          const fwdHit = dir.x * Math.sin(m.yaw) + dir.z * Math.cos(m.yaw), side = dir.x * Math.cos(m.yaw) - dir.z * Math.sin(m.yaw);
          m.flinchPV += fwdHit * 7 * k; m.flinchRV += side * 6 * k;
        }
        m.recoilV += 4 * k;
        if (point) G.fx.smoke(point, { size: 0.16, life: 0.35, color: 0x3a0b0b, rise: 0.2 });
        ctx.provoke(m);
        if (m.hp <= 0) { die(dir, part); return true; }
        return false;
      },
      _activate(at, opts = {}) {
        // 兵种：没指定就按比例随机（重装外观的人不会当突击手 / 狙击手，免得看着不像）
        const role = ROLES[opts.role] ? opts.role : pickRole(rng(), look.heavy);
        CFG = role === 'regular' ? SOLDIER : { ...SOLDIER, ...ROLES[role] };
        m.role = role; m.name = ROLES[role].name; m.maxHp = Math.round(maxHp * (ROLES[role].hpScale || 1));
        root.scale.setScalar(ROLES[role].scale || 1);
        m.active = true; m.alive = true; m.hp = m.maxHp; m.passive = !!opts.passive; m.sink = 0;
        m.pos.copy(at);
        const g = G.physics.groundHeight(at.x, at.z, at.y + 1);
        if (g > -40 && Math.abs(g - at.y) < 1.2) m.pos.y = g;
        m.home.copy(m.pos); m.yaw = opts.yaw ?? rng() * Math.PI * 2; m.speed = 0; vel.set(0, 0, 0);
        m.mode = opts.state === 'alert' ? 'investigate' : 'patrol'; m.modeSeen = m.mode; m.modeT = 10;
        m.lastKnown.copy(opts.target || (G.player ? G.player.pos : at));
        m.los = false; m.seeT = m.noSeeT = 0; m.exposure = 0; m.senseT = rng() * 0.2; m.hasToken = false;
        m.es = 'move'; m.cool = 0.5 + rng(); m.path = null; m.pathJob?.cancel(); m.pathJob = null; m.hasGoal = false; m.waitT = rng() * 1.5; m.planT = 0;
        m.crouch = m.crouchWant = 0; m.lowReady = m.mode === 'patrol' ? 1 : 0.3; m.pitch = 0; m.twist = 0;
        m.recoil = m.recoilV = m.flinchP = m.flinchPV = m.flinchR = m.flinchRV = 0;
        m.dieT = 0; m.fall = m.fallV = 0; m.crumple = false; m.phase = rng() * 6.28; m.gait = rng() * 6.28;
        // 出生点附近有现成的巡逻路线就沿着走，没有就在出生点附近转
        m.patrolLine = null;
        let best = 14;
        for (const line of patrolLines) for (const p of line) {
          const d = Math.hypot(p.x - at.x, p.z - at.z);
          if (d < best && Math.abs((p.y ?? 0) - m.pos.y) < 1.5) { best = d; m.patrolLine = line; m.patrolI = line.indexOf(p); }
        }
        lensMat.emissive.setRGB(...LENS_CALM); laser.visible = false;
        body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
        root.visible = true; pose(0.016);
      },
      _deactivate() {
        m.active = false; m.alive = false; root.visible = false; laser.visible = false; ctx.releaseToken(m);
        // 从活动列表里摘掉（乘坐时清场是直接 _deactivate 的；不摘，这个兵下次再用会在列表里有两份、一帧更新两遍）
        if (ctx.list) for (let i = ctx.list.length - 1; i >= 0; i--) if (ctx.list[i] === m) ctx.list.splice(i, 1);
      },
      _raycast(o, d, maxDist, out) {
        let hit = false;
        if (hitSphere(o, d, headPos, 0.14, maxDist, out)) { out.part = 'weak'; out.enemy = m; hit = true; }
        if (hitCapsule(o, d, pelvisPos, chest, 0.21, maxDist, out)) { out.part = 'body'; out.enemy = m; hit = true; }
        if (hitCapsule(o, d, pelvisPos, kneeL, 0.11, maxDist, out) || hitCapsule(o, d, kneeL, footL, 0.09, maxDist, out)) { out.part = 'body'; out.enemy = m; hit = true; }
        if (hitCapsule(o, d, pelvisPos, kneeR, 0.11, maxDist, out) || hitCapsule(o, d, kneeR, footR, 0.09, maxDist, out)) { out.part = 'body'; out.enemy = m; hit = true; }
        return hit;
      },
      _update(dt) { if (!m.active) return; if (m.alive) live(dt); else dead(dt); },
      /** 调试/截图用：直接摆一个姿势（不走 AI） */
      debugPose(fields = {}) { Object.assign(m, fields); if (fields.fall !== undefined) { body.rotation.x = m.fall * m.fallSign; } pose(0); },
    };

    // ---- 寻路 ----
    // 找路比较贵（跨楼层的路要在几层楼面上搜），所以只在目标真的变了、被卡住、或者隔几秒才重算，并且所有人一帧最多算一次
    function setGoal(p, force) {
      if (!force && m.hasGoal && m.goal.distanceToSquared(p) < 0.25) return;
      m.goal.copy(p); m.hasGoal = true; m.stuckT = 0;
      if (force || !m.path || m.planGoal.distanceToSquared(p) > 2.25) m.planT = 0;
    }
    function plan() {
      // 在楼梯、扶梯上不重新找路：从坡道中间算出来的路会先回到坡脚，人就在楼梯上来回走。等走完这一段再算
      const st = G.physics.stateOf(m.pos);
      if (st && st.slope && m.path) { m.planT = 0.25; return; }
      if (planFrame.n === G.time.frame) { m.planT = 0.03 + rng() * 0.05; return; }
      planFrame.n = G.time.frame;
      m.planT = 3.5 + rng() * 1.5; m.planGoal.copy(m.goal);
      // 分帧寻路：排队等结果，算出来之前照旧路线（或直线）走。以前是当场算完，一条路上百毫秒，几个人一起算画面就卡
      m.pathJob?.cancel();
      const gx = m.goal.x, gy = m.goal.y, gz = m.goal.z;
      m.pathJob = G.physics.nav.requestPath(m.pos, m.goal, (path) => {
        m.pathJob = null;
        if (!m.active || !m.alive || !m.hasGoal || Math.hypot(m.goal.x - gx, m.goal.z - gz) + Math.abs(m.goal.y - gy) > 1.5) return; // 目标已经换了，这条路作废
        m.path = path && path.length ? path : null; m.wp = 0;
        // 排队的这一会儿人已经往前走了：从离自己最近的那个拐点接着走
        if (m.path) { let best = Infinity; for (let i = 0; i < Math.min(m.path.length, 6); i++) { const d = Math.hypot(m.path[i].x - m.pos.x, m.path[i].z - m.pos.z) + Math.abs(m.path[i].y - m.pos.y) * 2; if (d < best) { best = d; m.wp = i; } } }
        if (m.path && m.wp < m.path.length - 1 && Math.hypot(m.path[m.wp].x - m.pos.x, m.path[m.wp].z - m.pos.z) < 0.6) m.wp++;
      });
    }
    /** 朝目标走；到了返回 true。want 写进期望的水平速度 */
    function follow(dt, speed, want) {
      if (!m.hasGoal) return true;
      m.planT -= dt; if (m.planT <= 0) plan();
      const dx = m.goal.x - m.pos.x, dz = m.goal.z - m.pos.z, dist = Math.hypot(dx, dz);
      if (dist < 0.5 && Math.abs(m.goal.y - m.pos.y) < 1.2) { m.hasGoal = false; return true; }
      let tx = m.goal.x, tz = m.goal.z;
      if (m.path) {
        while (m.wp < m.path.length - 1 && Math.hypot(m.path[m.wp].x - m.pos.x, m.path[m.wp].z - m.pos.z) < 0.6) m.wp++;
        const w = m.path[Math.min(m.wp, m.path.length - 1)]; tx = w.x; tz = w.z;
      }
      const ex = tx - m.pos.x, ez = tz - m.pos.z, el = Math.hypot(ex, ez) || 1;
      const s = Math.min(speed, 0.5 + dist * 1.8);
      want.set(ex / el * s, 0, ez / el * s);
      return false;
    }
    /** 找一个射击位置：离玩家 6–22 米、看得见玩家、不和同伴挤在一起，优先掩体旁边 */
    function pickFirePos() {
      const pl = G.player; if (!pl) return;
      const eye = pl.eye || pl.pos;
      let best = Infinity;
      const tryPoint = (q, bonus) => {
        const r = Math.hypot(q.x - pl.pos.x, q.z - pl.pos.z);
        if (r < CFG.rangeMin || r > CFG.rangeMax) return;
        if (Math.abs(q.y - pl.pos.y) > 6) return;
        let score = Math.hypot(q.x - m.pos.x, q.z - m.pos.z) * 0.9 + bonus + rng() * 3;
        for (const o of ctx.list) {
          if (o === m || !o.alive || o.type !== 'soldier') continue;
          const f = o.es === 'move' ? o.firePos : o.pos;
          if (Math.hypot(q.x - f.x, q.z - f.z) < 3) score += 16;
        }
        if (score >= best) return;
        tmp2.set(q.x, q.y + 1.45, q.z);
        if (!G.physics.lineOfSight(tmp2, eye)) score += 22;
        if (score < best) { best = score; m.firePos.set(q.x, q.y, q.z); }
      };
      const cover = G.level && G.level.coverPoints;
      if (cover) for (const c of cover) tryPoint(c, -3);
      for (let k = 0; k < 6; k++) { const q = G.physics.nav.randomPoint(pl.pos, CFG.rangeMax); if (q) tryPoint(q, 0); }
      const bearing = Math.atan2(m.pos.z - pl.pos.z, m.pos.x - pl.pos.x);
      for (let k = 0; k < 5; k++) {
        const a = bearing + (rng() - 0.5) * 2.6, r = CFG.rangeMin + 1 + rng() * (CFG.rangeMax - CFG.rangeMin - 2);
        tmp.set(pl.pos.x + Math.cos(a) * r, 0, pl.pos.z + Math.sin(a) * r);
        tmp.y = G.physics.groundHeight(tmp.x, tmp.z, pl.pos.y + 1);
        if (Math.abs(tmp.y - pl.pos.y) < 0.8) tryPoint(tmp, 1);
      }
      if (best === Infinity) m.firePos.copy(m.pos);
      m.firePlayer.copy(pl.pos); setGoal(m.firePos, true);
      m.es = 'move'; m.esT = 0; m.moveT = 0; m.bursts = 0;
      // 远处一半的时候蹲着打
      m.crouchWant = Math.hypot(m.firePos.x - pl.pos.x, m.firePos.z - pl.pos.z) > 11 && rng() < 0.55 ? 1 : 0;
    }

    // ---- 活着 ----
    const want = new THREE.Vector3();
    function live(dt) {
      const pl = G.player;
      m.fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
      m.sensor.copy(headPos);
      ctx.think(m, dt, CFG.react);
      if (m.mode !== m.modeSeen) {
        m.modeSeen = m.mode; m.hasGoal = false; m.path = null; m.waitT = 0;
        if (m.mode === 'engage') pickFirePos();
        else if (m.es === 'aim' || m.es === 'burst') { ctx.releaseToken(m); m.es = 'move'; }
      }
      m.cool -= dt;
      want.set(0, 0, 0);
      let faceYaw = null, aimAt = null, raise = 0.3, crouch = 0, laserOn = false, maxSpeed = CFG.runSpeed;
      const toPl = pl ? Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z) : 1e9;

      if (m.mode === 'patrol') {
        raise = 1; maxSpeed = CFG.walkSpeed;
        if (m.hasGoal) { if (follow(dt, CFG.walkSpeed, want)) m.waitT = 1.5 + rng() * 3; }
        else {
          m.waitT -= dt; m.scan += dt;
          faceYaw = m.yaw + Math.sin(m.scan * 0.7 + m.phase) * 0.02;
          if (m.waitT <= 0) {
            if (m.patrolLine) { m.patrolI = (m.patrolI + 1) % m.patrolLine.length; const p = m.patrolLine[m.patrolI]; setGoal(tmp.set(p.x, p.y ?? m.pos.y, p.z), true); }
            else { const q = G.physics.nav.randomPoint(m.home, CFG.patrolRadius); if (q && Math.abs(q.y - m.pos.y) < 0.6) setGoal(q, true); else m.waitT = 1; }
          }
        }
      } else if (m.mode === 'investigate' || m.mode === 'search') {
        raise = 0.15;
        const d = Math.hypot(m.lastKnown.x - m.pos.x, m.lastKnown.z - m.pos.z);
        if (d > 2.2) {
          setGoal(m.lastKnown); follow(dt, d < 8 ? CFG.stalkSpeed : CFG.runSpeed, want);
          // 我们的地图大、楼层多，原游戏 10 秒左右的「搜索」不够跑完一段楼梯；还在往那边赶的时候就不放弃
          if (m.speed > 1 && m.path) m.modeT = Math.max(m.modeT, 2);
        }
        else { m.hasGoal = false; m.scan += dt; faceYaw = m.yaw + Math.sin(m.scan * 0.9) * 0.05; }
      } else if (pl) {
        aimAt = pl.pos; raise = 0;
        const toYaw = Math.atan2(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z);
        switch (m.es) {
          case 'move': {
            m.moveT += dt;
            const arrived = follow(dt, CFG.runSpeed, want), inRange = toPl > CFG.rangeMin - 1 && toPl < CFG.rangeMax + 2;
            if (arrived || (m.moveT > 1.2 && m.los && inRange && rng() < dt * 0.8) || m.moveT > 7) { m.es = 'aim'; m.esT = 0; m.hasGoal = false; }
            else if (pl.pos.distanceToSquared(m.firePlayer) > 49) pickFirePos();
            // 边跑边看着玩家（看得见的时候），跑的方向和身体朝向分开
            if (m.los) faceYaw = toYaw;
            break;
          }
          case 'aim': {
            faceYaw = toYaw; m.esT += dt; crouch = m.crouchWant;
            if (m.los) {
              if (toPl < CFG.rangeMin - 3 && m.esT > 0.8) pickFirePos();
              else if (m.cool <= 0 && pl.alive !== false && Math.abs(wrapAngle(toYaw - m.yaw)) < 0.25 && ctx.requestToken(m)) { m.es = 'tele'; m.esT = CFG.aimTime; }
            } else if (m.noSeeT > 1.2 || m.esT > 3.5) pickFirePos();
            break;
          }
          case 'tele': { // 举枪瞄准：激光指示（给玩家的提示，和原游戏机器敌人开火前的预警是一个意思）
            faceYaw = toYaw; crouch = m.crouchWant; laserOn = true; m.esT -= dt;
            if (m.esT <= 0) { m.es = 'burst'; m.shots = CFG.burst[0] + Math.floor(rng() * (CFG.burst[1] - CFG.burst[0] + 1)); m.esT = 0; }
            break;
          }
          case 'burst': {
            faceYaw = toYaw; crouch = m.crouchWant; m.esT -= dt;
            if (m.esT <= 0) { m.esT = CFG.burstGap * (0.85 + rng() * 0.3); m.shots--; fire(pl); }
            if (m.shots <= 0) {
              ctx.releaseToken(m); m.cool = CFG.cooldown[0] + rng() * (CFG.cooldown[1] - CFG.cooldown[0]); m.bursts++;
              if (m.bursts >= 1 + (rng() < 0.5 ? 1 : 0)) pickFirePos(); else { m.es = 'aim'; m.esT = 0; }
            }
            break;
          }
        }
      }

      // 互相让开，也别贴到玩家身上
      for (const o of ctx.list) {
        if (o === m || !o.active || !o.alive) continue;
        const dx = m.pos.x - o.pos.x, dz = m.pos.z - o.pos.z, d = Math.hypot(dx, dz), r = o.type === 'soldier' ? 0.9 : 1.4;
        if (d < r && d > 1e-3 && Math.abs(o.pos.y - m.pos.y) < 1.5) { want.x += dx / d * (r - d) * 3; want.z += dz / d * (r - d) * 3; }
      }
      if (pl && toPl < 1.1 && toPl > 1e-3) { want.x += (m.pos.x - pl.pos.x) / toPl * 2; want.z += (m.pos.z - pl.pos.z) / toPl * 2; }
      if (crouch > 0.5) want.multiplyScalar(0.2);

      // 速度、朝向
      const k = ease(CFG.accel, dt);
      vel.x += (want.x - vel.x) * k; vel.z += (want.z - vel.z) * k; vel.y = 0;
      const sp = Math.hypot(vel.x, vel.z);
      if (faceYaw === null && sp > 0.2) faceYaw = Math.atan2(vel.x, vel.z);
      if (faceYaw !== null) { const d = wrapAngle(faceYaw - m.yaw); m.yaw += clamp(d, -CFG.turnRate * dt, CFG.turnRate * dt) + d * ease(6, dt) * 0.3; m.yaw = wrapAngle(m.yaw); }
      // 走（在我们的导航网格上，和玩家同一套碰撞：墙、栏杆、楼梯、扶梯）
      const res = G.physics.moveCapsule(m.pos, vel, dt, 0.3, 1.8);
      m.speed = Math.hypot(vel.x, vel.z);
      if (res.hitWall && want.lengthSq() > 0.5) { m.stuckT += dt; if (m.stuckT > 0.6) { m.stuckT = 0; m.planT = 0; if (m.mode === 'engage' && m.es === 'move') pickFirePos(); else if (m.mode === 'patrol') m.hasGoal = false; } }
      else m.stuckT = Math.max(0, m.stuckT - dt);

      // 姿态
      m.crouch += (crouch - m.crouch) * ease(8, dt);
      m.lowReady += (raise - m.lowReady) * ease(6, dt);
      if (aimAt) {
        tmp.set(aimAt.x - m.pos.x, aimAt.y + 1.1 - (m.pos.y + HIP_Y + 0.52 - m.crouch * 0.4), aimAt.z - m.pos.z);
        m.pitch += (clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.9, 0.9) - m.pitch) * ease(10, dt);
        m.twist += (clamp(wrapAngle(Math.atan2(tmp.x, tmp.z) - m.yaw), -0.6, 0.6) - m.twist) * ease(10, dt);
      } else { m.pitch += (0 - m.pitch) * ease(4, dt); m.twist += (0 - m.twist) * ease(4, dt); }
      lensMat.emissive.setRGB(...(m.mode === 'engage' ? LENS_HOT : LENS_CALM));
      pose(dt);
      // 瞄准激光
      laser.visible = laserOn;
      if (laserOn) {
        aimDir.set(0, 0, 1).transformDirection(muzzle.matrixWorld);
        const h = G.physics.raycast(m.muzzle, aimDir, 40), len = h ? h.dist : 40;
        laser.position.copy(m.muzzle); laser.quaternion.setFromUnitVectors(tmp.set(0, 0, 1), aimDir); laser.scale.set(1, 1, len);
      }
    }

    function fire(pl) {
      tmp.set(pl.pos.x, pl.pos.y + (pl.crouching ? 0.8 : 1.15), pl.pos.z);
      aimDir.copy(tmp).sub(m.muzzle).normalize();
      const spread = (CFG.spreadFar + (CFG.spreadNear - CFG.spreadFar) * m.exposure) * (1 + ctx.playerSpeed * 0.3) * (m.crouch > 0.5 ? 0.75 : 1);
      aimDir.x += (rng() - 0.5) * 2 * spread; aimDir.y += (rng() - 0.5) * 2 * spread; aimDir.z += (rng() - 0.5) * 2 * spread; aimDir.normalize();
      const wall = G.physics.raycast(m.muzzle, aimDir, 150);
      const hit = G.combat.enemyShot(m.muzzle, aimDir, { damage: CFG.shotDamage, range: 150 });
      const len = hit ? m.muzzle.distanceTo(tmp) : wall ? wall.dist : 90;
      tmp2.copy(m.muzzle).addScaledVector(aimDir, len);
      G.fx.tracer(m.muzzle, tmp2, { color: 0xffc880, speed: 280, width: 0.03 });
      G.fx.muzzleFlash(m.muzzle, aimDir, { scale: 0.7 });
      G.render?.lightPool?.flash(m.muzzle, 0xffb070, 20, 7, 0.05);
      G.events.emit('enemy:fire', { enemy: m, pos: m.muzzle, dir: aimDir, type: 'soldier' });
      m.recoilV += 9;
    }

    // ---- 倒地 ----
    function die(dir, part) {
      m.alive = false; ctx.releaseToken(m); laser.visible = false; m.dieT = 0; m.fall = 0; m.fallV = 0;
      // 被从背后打中往前扑，从前面打中往后倒；倒的方向上 1.6 米内有墙就反过来，两边都有墙就跪倒
      const f = dir ? dir.x * Math.sin(m.yaw) + dir.z * Math.cos(m.yaw) : -1;
      m.fallSign = f > 0 ? 1 : -1;
      const blocked = (sign) => { tmp.set(m.pos.x, m.pos.y + 0.6, m.pos.z); tmp2.set(Math.sin(m.yaw) * sign, 0, Math.cos(m.yaw) * sign); return !!G.physics.raycast(tmp, tmp2, 1.7); };
      if (blocked(m.fallSign)) m.fallSign = -m.fallSign;
      m.crumple = blocked(m.fallSign);
      m.fallRoll = (rng() - 0.5) * 0.5; m.speed *= 0.3;
      lensMat.emissive.setRGB(0, 0, 0);
      G.events.emit('enemy:killed', { enemy: m, pos: m.pos, type: 'soldier', part });
    }
    function dead(dt) {
      m.dieT += dt;
      if (m.sink > 0) {
        m.sink += dt; body.position.y -= 0.18 * dt;
        if (m.sink > 2.5) ctx.retire(m);
        return;
      }
      const t = m.dieT;
      // 先膝盖一软，再整个人倒下去（角加速度随角度变大，像真的倒下）
      m.crouch += ((t < 0.35 ? 0.6 : m.crumple ? 1 : 0.35) - m.crouch) * ease(9, dt);
      m.lowReady += (1.6 - m.lowReady) * ease(5, dt);
      const target = m.crumple ? 0.45 : 1.42;
      if (t > 0.12 && m.fall < target) { m.fallV += (3 + Math.sin(m.fall) * 14) * dt; m.fall = Math.min(target, m.fall + m.fallV * dt); if (m.fall >= target && m.fallV > 2) G.events.emit('enemy:step', { pos: m.pos, type: 'soldier', speed: 6 }); }
      body.rotation.x = m.fall * m.fallSign; body.rotation.z = m.fallRoll * Math.min(1, m.fall);
      m.pitch += (0 - m.pitch) * ease(4, dt); m.twist += (0 - m.twist) * ease(4, dt);
      vel.multiplyScalar(Math.exp(-5 * dt));
      if (t < 1) { m.pos.x += vel.x * dt; m.pos.z += vel.z * dt; }
      pose(dt);
      if (t > CFG.corpseSeconds) m.sink = 1e-3;
    }

    // ---- 摆姿势：步态、蹲、举枪、后坐、中弹 ----
    function pose(dt) {
      const sp = m.speed, amp = m.alive ? Math.min(0.55, sp * 0.14) : 0;
      const stride = 1.3 + sp * 0.15, before = Math.sin(m.gait);
      if (m.alive) m.gait += dt * sp / stride * Math.PI * 2;
      if (m.alive && sp > 0.4 && Math.sign(Math.sin(m.gait)) !== Math.sign(before)) G.events.emit('enemy:step', { pos: m.pos, type: 'soldier', enemy: m, speed: sp });
      // 弹簧：后坐、中弹前后仰、左右晃
      m.recoilV += (-m.recoil * 220 - m.recoilV * 22) * dt; m.recoil += m.recoilV * dt;
      m.flinchPV += (-m.flinchP * 120 - m.flinchPV * 14) * dt; m.flinchP += m.flinchPV * dt;
      m.flinchRV += (-m.flinchR * 120 - m.flinchRV * 14) * dt; m.flinchR += m.flinchRV * dt;
      const c = m.crouch, run = Math.min(1, sp / CFG.runSpeed);
      root.rotation.y = m.yaw;
      hips.position.y = HIP_Y - 0.4 * c - Math.abs(Math.cos(m.gait)) * 0.035 * Math.min(1, sp / 2);
      spine.rotation.set(0.14 * run + 0.18 * c + m.flinchP * 0.06 - m.pitch * 0.15, m.twist * 0.7, m.flinchR * 0.06);
      head.rotation.set(-m.pitch * 0.4 - 0.08 * run, m.twist * 0.3, 0);
      // 枪的世界俯仰 = 身体前倾 + 枪自己的转角；这里减掉身体前倾，让枪口正好对准目标（垂枪警戒时往下压）
      aim.rotation.set(-m.pitch + m.lowReady * 0.55 - m.recoil * 0.02 - spine.rotation.x, m.lowReady * 0.35, 0);
      aim.position.z = 0.02 - m.recoil * 0.004;
      for (let i = 0; i < 2; i++) {
        const p = m.gait + i * Math.PI, L = legs[i];
        L.thigh.rotation.x = -amp * Math.sin(p) - 1.1 * c;
        L.shin.rotation.x = amp * 1.4 * Math.max(0, Math.cos(p)) + 1.9 * c + 0.05;
      }
      root.updateMatrixWorld(true);
      head.localToWorld(headPos.set(0, 0.11, 0.01));
      spine.localToWorld(chest.set(0, 0.36, 0));
      hips.localToWorld(pelvisPos.set(0, 0, 0));
      legs[0].shin.localToWorld(kneeL.set(0, 0, 0)); legs[0].shin.localToWorld(footL.set(0, -SHIN, 0.03));
      legs[1].shin.localToWorld(kneeR.set(0, 0, 0)); legs[1].shin.localToWorld(footR.set(0, -SHIN, 0.03));
      muzzle.getWorldPosition(m.muzzle);
    }
    return m;
  }
  return pool;
}
