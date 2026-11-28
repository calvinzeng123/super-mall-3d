// 新步枪的样子：M4A1 真模型（nisu，CC0，assets/models/fps/m4a1-mobile.glb）+ 带贴图的手臂（冲锋枪模型上那双，DJMaesen，CC BY 4.0）。
// 打法、弹药、换弹时长、开镜、后坐都还是原游戏那把步枪的（vendor/game.js 的 dm）：这里只把它的模型藏起来，换上新枪和手臂，
// 每帧照着它的内部状态（rifle.anim：换弹进度、扳机、开火）摆零件和左手：
//   左手托护木 → 换弹时去抓弹匣、拔下来、到腰间换一个、插回去、拍一下底座 →（打空的）去拉拉机柄 → 回到护木；
//   右手一直握在握把上，开火时食指扣一下；第一枪以后防尘盖弹开；
//   切枪（arsenal 的放下 / 掏出）：放下时左手先松开往下撤，掏出来时枪先到、左手最后托上护木。
// 整把枪的位置（腰射、开镜、冲刺、换弹时枪身侧倾、走路晃动、后坐弹簧）原游戏已经在摆，新模型挂在它下面跟着走。
// 开镜：后照门的孔和准星尖连成一条线，正对屏幕中心（原游戏开镜时把 sightY 那条线摆到正中）。
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { gripPose } from './skins/smg-skin.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** 原游戏的缓动（五次方，两头平） */
export const smoother = (x) => { x = clamp01(x); return clamp01(x * x * x * (x * (6 * x - 15) + 10)); };

/**
 * 新步枪的参数。模型坐标（glb 里的单位，scale 换成米）：
 *   rear / front：后照门孔的中心、准星尖——开镜时这两点连成的线正对屏幕中心；
 *   eyeZ：开镜时后照门孔在眼前多远（米，原游戏开镜时枪的原点在眼前 0.135 米）；
 *   muzzle / eject：枪口、抛壳口（模型坐标）；
 *   trigger：扳机中心（手臂按它对位：冲锋枪模型上的手怎么握它的扳机，就怎么握这把的）；
 *   arms：手臂整体再挪多少（米，枪的坐标：x 右、y 上、z 后）和转多少（弧度）——右手对准握把用的。
 *   boltTravel：开火时（和打空挂机时）抛壳窗里的枪机往后走多远（模型坐标）；dustCover：防尘盖弹开转多少（弧度）。
 */
export const RIFLE_VIEW = Object.freeze({
  name: 'M4A1 突击步枪', scale: 1 / 2.36,
  rear: Object.freeze([-0.0019, 0.18, 0.163]), front: Object.freeze([-0.0018, 0.1985, -0.8135]), eyeZ: 0.075,
  muzzle: Object.freeze([-0.002, 0.0493, -1.27]), eject: Object.freeze([0.05, 0.04, -0.1]), trigger: Object.freeze([-0.002, -0.1, 0.053]),
  arms: Object.freeze({ p: Object.freeze([0, 0, 0]), r: Object.freeze([0, 0, 0]) }), armScale: 0.84,
  boltTravel: 0.07, dustCover: 1.9,
  // 表面：原贴图是中灰的钢（金属度 1），在商场灯下像没上漆的铁——颜色乘 tint 压成深灰黑的阳极氧化色。
  // （试过叠一层平铺的颗粒法线：这个模型的 UV 是小零件占大块，照门这种小件上颗粒大得像海绵，去掉了）
  tint: 0.62,
  // 准星尖上的荧光点（模型坐标、半径）：停电的时候开镜也找得到准星
  dot: Object.freeze({ at: Object.freeze([-0.0018, 0.1965, -0.8128]), r: 0.0021, color: 0xb6ff7a }),
  // 换弹时原游戏把枪往左滚 0.8 弧度、抬高 0.1 米（照它那把短枪调的）；这把弹匣长，弹匣拔出来会落到画面下沿以外——回正一点（reloadRoll）、再抬高一点（reloadLift，米）
  reloadRoll: 0.15, reloadLift: Object.freeze([0, 0.045, 0]),
  // 后照门的孔：模型上孔半径只有 0.003（实物 2.5 毫米，开镜时一个针眼，看不见准星）——加载时把孔扩到 hole 倍，孔外的圈留到 ring 为止不动（「鬼环」照门）
  aperture: Object.freeze({ mesh: 'RearIronSightGeometry_Sight_2', inner: 0.0031, ring: 0.0075, hole: 1.8 }),
  // 左手的定位点（模型坐标）：guard 护木中段偏下（掌心托着的地方）、mag 弹匣中段、catch 机匣左侧弹匣井上方的空仓挂机释放钮
  anchors: Object.freeze({ guard: Object.freeze([0, 0.035, -0.7]), mag: Object.freeze([0, -0.2, -0.15]), catch: Object.freeze([-0.04, -0.03, -0.05]) }),
  // SMG 换弹动画里左手手指的姿势取哪一帧（秒）：hold 托护木（最后一帧）、grab 抓弹匣、pinch 捏拉机柄
  fingers: Object.freeze({ hold: 2.667, grab: 0.42, pinch: 2.04 }),
});

/**
 * 左手的关键位置：手心「握住的那一点」（手指圈起来的中心）放在哪、手怎么转。枪的坐标，米；x 右、y 上、z 后（和镜头一个朝向）。
 * at：从哪个定位点算起（RIFLE_VIEW.anchors），p：再挪多少，r：手在原来托护木的姿势上绕握点再转多少（x、y、z 欧拉角，枪的坐标轴），
 * fingers：手指用哪一套（RIFLE_VIEW.fingers 的名字）。
 *   guard 托护木；near 靠近弹匣；mag 抓住弹匣；pouch 到腰间（画面外左下方）；under 新弹匣对准弹匣井；tap 掌根往上拍底座；
 *   seat 拍完手还在弹匣上；catch 手挪到机匣左侧的空仓挂机钮；press 拇指按下去（枪机复进）；off 切枪时左手撤到画面外。
 * 打空了不去拉拉机柄：拉机柄在机匣尾巴上、正贴着眼前，手伸过去会挡住大半个画面——按空仓挂机钮（M4 真实的打空换弹也是这么做的）。
 */
export const HAND_KEYS = Object.freeze({
  guard: Object.freeze({ at: 'guard', p: [0, -0.028, 0.01], r: [0, 0, 0], fingers: 'hold' }),
  near: Object.freeze({ at: 'mag', p: [-0.03, -0.08, -0.03], r: [1.4, 0.8, -0.2], fingers: 'grab' }),
  mag: Object.freeze({ at: 'mag', p: [0, -0.045, 0], r: [1.57, 0.8, -0.2], fingers: 'hold' }),
  pouch: Object.freeze({ at: 'mag', p: [-0.12, -0.32, 0.1], r: [1.3, 0.6, -0.5], fingers: 'hold' }),
  under: Object.freeze({ at: 'mag', p: [0, -0.085, 0.005], r: [1.57, 0.8, -0.2], fingers: 'hold' }),
  tap: Object.freeze({ at: 'mag', p: [0, -0.1, 0], r: [1.4, 0.8, -0.2], fingers: 'grab' }),
  seat: Object.freeze({ at: 'mag', p: [0, -0.055, 0], r: [1.57, 0.8, -0.2], fingers: 'hold' }),
  catch: Object.freeze({ at: 'catch', p: [-0.03, -0.03, 0], r: [1.57, 0.8, -0.2], fingers: 'hold' }),
  press: Object.freeze({ at: 'catch', p: [-0.015, -0.035, 0], r: [1.57, 0.8, 0], fingers: 'hold' }),
  off: Object.freeze({ at: 'guard', p: [-0.1, -0.3, 0.2], r: [0.4, 0, 0.5], fingers: 'hold' }),
});

/**
 * 换弹的时间轴（秒）：和原游戏步枪的换弹一模一样的节拍（它的声音、弹药数在这些时刻变），只是手去的地方换成新枪上的。
 * 普通换弹 2.1 秒；打空了 2.72 秒（最后多一下拉机柄）。弹匣 0.47 秒离开弹匣井、1.345 秒插回去（magout / magin 事件）。
 */
export const RELOAD_KEYS = Object.freeze({
  tactical: Object.freeze([[0, 'guard'], [0.1, 'guard'], [0.36, 'near'], [0.44, 'mag'], [0.5, 'mag'], [0.8, 'pouch'], [0.98, 'pouch'], [1.28, 'under'], [1.35, 'mag'], [1.45, 'tap'], [1.52, 'seat'], [1.62, 'mag'], [1.7, 'near'], [2.02, 'guard'], [9, 'guard']]),
  empty: Object.freeze([[0, 'guard'], [0.1, 'guard'], [0.36, 'near'], [0.44, 'mag'], [0.5, 'mag'], [0.8, 'pouch'], [0.98, 'pouch'], [1.28, 'under'], [1.35, 'mag'], [1.45, 'tap'], [1.52, 'seat'], [1.62, 'mag'], [1.7, 'near'],
    [1.96, 'catch'], [2.02, 'catch'], [2.14, 'press'], [2.19, 'press'], [2.26, 'catch'], [2.36, 'near'], [2.66, 'guard'], [9, 'guard']]),
  magOut: 0.47, magIn: 1.345, boltRelease: 2.19,
});

/** 时间轴上 t 秒时在哪两个关键姿势之间：{ a, b, k }（k 已缓动） */
export function keyAt(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1];
  return { a, b, k: smoother((t - t0) / Math.max(1e-4, t1 - t0)) };
}

/**
 * 换弹进行到 t 秒（empty：打空了）时枪上零件的状态（纯函数，测试直接用）：
 *   held：弹匣在左手里（跟着手走）；boltOpen：枪机还挂在后面（打空了的，到 2.19 秒按下空仓挂机钮才复进，0.035 秒走完）。
 */
export function reloadParts(t, empty, R = RELOAD_KEYS) {
  const held = t >= R.magOut && t < R.magIn;
  const boltOpen = empty ? (t < R.boltRelease ? 1 : Math.max(0, 1 - (t - R.boltRelease) / 0.035)) : 0;
  return { held, boltOpen };
}

/**
 * 左手托不托在枪上（0–1）。phase：arsenal 的切枪阶段（'lower' 放下 / 'draw' 掏出 / null），k：这一段进行到哪（0–1），mine：切的是不是步枪。
 * 放下时左手先松开（前 60% 就撤完），掏出来时枪先到、左手最后才托上（35%–85%）。
 */
export function supportWeight(phase, k, mine = true) {
  if (!mine || !phase) return 1;
  if (phase === 'lower') return 1 - smoother(k / 0.6);
  if (phase === 'draw') return smoother((k - 0.35) / 0.5);
  return 1;
}

/** 新枪贴图多大：电脑 1024，手机省内存 / 标准档 512（内存档位见 render/device.js 的 MEMORY_PROFILES）；原游戏画质是「低」也 512 */
export function rifleTextureCap(mem, quality) {
  const name = mem?.name || 'full';
  let cap = name === 'compact' || name === 'standard' ? 512 : 1024;
  if (quality?.tex && quality.tex <= 512) cap = Math.min(cap, 512);
  return cap;
}

/**
 * 两段骨骼的解析 IK：肩 s、肘到肩的长度 a、腕到肘的长度 b、目标腕位置 t、肘往哪边弯（pole：一个点）。返回肘应在的位置（写进 out）。
 * 够不着就把手臂伸直指向目标；太近就按最短距离算。纯函数。
 */
export function solveElbow(s, a, b, t, pole, out = new THREE.Vector3()) {
  const d0 = new THREE.Vector3().subVectors(t, s), len = d0.length() || 1e-6, dir = d0.multiplyScalar(1 / len);
  const d = Math.min(a + b - 1e-5, Math.max(Math.abs(a - b) + 1e-5, len));
  const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))), sinA = Math.sqrt(1 - cosA * cosA);
  const pv = new THREE.Vector3().subVectors(pole, s); pv.addScaledVector(dir, -pv.dot(dir));
  if (pv.lengthSq() < 1e-10) pv.set(0, -1, 0).addScaledVector(dir, -dir.y);
  pv.normalize();
  return out.copy(s).addScaledVector(dir, a * cosA).addScaledVector(pv, a * sinA);
}

/**
 * rifle：原游戏的步枪（要有 anim、spec、root）；layer：枪那一层。
 * 返回 { ready, root, attach(m4Gltf, smgGltf, opts), update(dt, info), dispose() }。
 * attach 之前什么都不改（还是原来那把枪）。
 */
/**
 * 后照门的孔扩大（就地改那块网格的顶点）：在照门板的平面里，离孔心 r 的点挪到 apertureRadius(r)。纯几何，测试直接用。
 */
export function apertureRadius(r, A = RIFLE_VIEW.aperture) {
  if (r >= A.ring) return r;
  if (r <= A.inner) return r * A.hole;
  const a = A.inner * A.hole;
  return a + (r - A.inner) / (A.ring - A.inner) * (A.ring - a);
}
function widenAperture(scene, V) {
  let mesh = null; scene.traverse((o) => { if (!mesh && o.isMesh && o.name === V.aperture.mesh) mesh = o; });
  if (!mesh?.geometry?.attributes?.position) return false;
  scene.updateMatrixWorld(true);
  // 孔心换到这块网格自己的坐标（照门板竖着、法线朝 z）
  const c = new THREE.Vector3(...V.rear);
  c.applyMatrix4(new THREE.Matrix4().copy(mesh.matrixWorld).invert().multiply(scene.matrixWorld));
  const p = mesh.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i) - c.x, dy = p.getY(i) - c.y, r = Math.hypot(dx, dy);
    if (r < 1e-7 || r >= V.aperture.ring) continue;
    const s = apertureRadius(r, V.aperture) / r; p.setXY(i, c.x + dx * s, c.y + dy * s);
  }
  p.needsUpdate = true; mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  return true;
}

export function createRifleView(rifle, { layer = 0, V = RIFLE_VIEW, KEYS = HAND_KEYS, R = RELOAD_KEYS } = {}) {
  V = { ...RIFLE_VIEW, ...V }; KEYS = { ...HAND_KEYS, ...KEYS };
  const vm = rifle?.root, k = rifle?.anim;
  let origName = null, ready = false, rig = null, holder = null, arms = null, hidden = null, flash = null;
  const own = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const parts = {}, bones = {}, finger = {}, keyFrame = {}, origMuzzle = rifle?.spec ? [...rifle.spec.muzzle] : null, origEject = rifle?.spec ? [...rifle.spec.eject] : null;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), m1 = new THREE.Matrix4();
  const S = { dust: 0, dustV: 0, shots: 0, lastShot: -9, support: 1 };
  // 左臂：肩、肘、腕；肘往左下外侧弯
  const L = { lenA: 0, lenB: 0, pole: new THREE.Vector3() };

  /** 模型坐标 → 枪的坐标（米） */
  const toGun = (p, out = new THREE.Vector3()) => out.set(p[0], p[1], p[2]).applyMatrix4(holder.matrix);

  function attach(m4, smg, { textureCap = 1024 } = {}) {
    if (ready || !vm || !k || !m4?.scene) return false;
    rig = new THREE.Group(); rig.name = 'rifle-view';
    // ---- 枪：缩成米、枪口朝 −z（模型本来就是），绕 x 稍微低头让后照门孔和准星尖连线水平，再平移到后照门孔在 (0, sightY, eyeZ) ----
    holder = new THREE.Group(); holder.name = 'm4a1';
    const sy = rifle.spec?.sightY ?? 0.069, dy = V.front[1] - V.rear[1], dz = V.rear[2] - V.front[2];
    holder.scale.setScalar(V.scale); holder.rotation.x = -Math.atan2(dy, dz);
    holder.updateMatrix();
    const a = new THREE.Vector3(...V.rear).applyMatrix4(holder.matrix);
    holder.position.set(-a.x, sy - a.y, V.eyeZ - a.z); holder.updateMatrix();
    holder.add(m4.scene); rig.add(holder);
    m4.scene.traverse((o) => {
      if (o.name) parts[o.name] = parts[o.name] || o;
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false;
      own.geometries.add(o.geometry);
      for (const m of [].concat(o.material)) { own.materials.add(m); m.side = THREE.FrontSide; m.envMapIntensity = 1; }
    });
    for (const m of own.materials) for (const [key, t] of Object.entries(m)) if (t?.isTexture) {
      own.textures.add(t);
      if (t.image && Math.max(t.image.width || 0, t.image.height || 0) > textureCap && typeof document !== 'undefined') {
        const c = document.createElement('canvas'), s = textureCap / Math.max(t.image.width, t.image.height);
        c.width = Math.round(t.image.width * s); c.height = Math.round(t.image.height * s);
        c.getContext('2d').drawImage(t.image, 0, 0, c.width, c.height); t.image.close?.(); t.image = c; t.needsUpdate = true;
      }
      t.anisotropy = 4;
    }
    widenAperture(m4.scene, V);
    for (const m of own.materials) m.color?.multiplyScalar(V.tint);
    // 准星荧光点
    { const g = new THREE.SphereGeometry(V.dot.r, 10, 8), mat = new THREE.MeshBasicMaterial({ color: V.dot.color, toneMapped: false });
      const dot = new THREE.Mesh(g, mat); dot.name = 'front-sight-dot'; dot.position.set(...V.dot.at); dot.frustumCulled = false; m4.scene.add(dot); own.geometries.add(g); own.materials.add(mat); }
    for (const name of ['Magazine', 'ChargingHandle', 'M4A1Body_03_Ejector_Lid', 'M4A1Body_02_Ejector_2', 'M4A1Body_07_Trigger']) if (parts[name]) parts[name].userData.rest = { p: parts[name].position.clone(), q: parts[name].quaternion.clone() };
    // ---- 手臂：冲锋枪模型整个克隆一份（几何、材质和冲锋枪共用，不多占显存），枪身那一支删掉，只留手臂 ----
    if (smg?.scene) {
      const src = smg.scene, full = smg.animations?.find((c) => /reload/i.test(c.name)) || smg.animations?.[0];
      // 动画只留手臂骨骼（L_ / R_ 开头）的轨道：枪身那一支下面会删掉，留着它的轨道绑定时会报一串找不到节点
      const clip = full ? new THREE.AnimationClip(full.name, full.duration, full.tracks.filter((t) => /^[LR]_/.test(t.name))) : null;
      arms = cloneSkinned(src); arms.name = 'rifle-arms';
      arms.position.set(0, 0, 0); arms.quaternion.identity(); arms.scale.set(1, 1, 1);
      const gun = []; arms.traverse((o) => { if (o.name === 'smg45') gun.push(o); });
      // 冲锋枪的扳机在哪（换算到手臂的坐标）：手臂整体平移到新枪扳机那里
      arms.updateMatrixWorld(true);
      let trig = null; arms.traverse((o) => { if (!trig && o.name === 'trigger') trig = o.getWorldPosition(new THREE.Vector3()); });
      for (const g of gun) g.removeFromParent();
      arms.traverse((o) => { if (o.isBone) bones[o.name.replace(/_\d+$/, '')] = o; if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } });
      // 姿势：冲锋枪换弹动画的最后一帧（握好的样子），右手按 smg-skin 的修正扣回握把；左手几套手指的姿势也从这段动画里取
      if (clip) {
        const mixer = new THREE.AnimationMixer(arms), act = mixer.clipAction(clip); act.play(); act.paused = true;
        for (const [name, t] of Object.entries(V.fingers)) {
          act.time = Math.min(t, clip.duration); mixer.update(0);
          finger[name] = {}; for (const [bn, b] of Object.entries(bones)) if (/^L_(thumb|point|middle|ring|pink|palm)/.test(bn)) finger[name][bn] = b.quaternion.clone();
        }
        act.time = clip.duration; mixer.update(0); mixer.stopAllAction(); mixer.uncacheRoot(arms);
        try { gripPose(arms, clip)?.apply(); } catch (e) { console.warn('[零点突围] 步枪右手握姿修正出错', e); }
      }
      // 冲锋枪模型枪口朝 +z：转半圈；扳机对到新枪的扳机上，再按 arms 微调
      const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(V.arms.r[0], Math.PI + V.arms.r[1], V.arms.r[2]));
      const tg = toGun(V.trigger);
      // armScale：手臂整体缩一点（以扳机为中心缩，右手还扣在扳机上）——冲锋枪那双手套是按它自己那把短枪配的，
      // 托在这把长枪上、又离镜头这么近，手掌比护木还宽、把枪口一带都挡住（用户：「手太大了，只要体现那个枪就好」）
      const as = V.armScale ?? 1;
      arms.quaternion.copy(turn); arms.scale.setScalar(as);
      arms.position.copy(tg).sub((trig || new THREE.Vector3()).multiplyScalar(as).applyQuaternion(turn)).add(v1.set(...V.arms.p));
      rig.add(arms);
      arms.updateMatrixWorld(true);
      if (bones.L_arm && bones.L_elbow && bones.L_wrist) {
        const s = bones.L_arm.getWorldPosition(new THREE.Vector3()), e = bones.L_elbow.getWorldPosition(new THREE.Vector3()), w = bones.L_wrist.getWorldPosition(new THREE.Vector3());
        L.lenA = s.distanceTo(e); L.lenB = e.distanceTo(w);
        // 左手托护木那一刻（动画最后一帧）在枪坐标里的位置、朝向：别的关键姿势都从这里转出去
        const inv = new THREE.Matrix4().copy(rig.matrixWorld).invert();
        keyFrame.restPos = w.clone().applyMatrix4(inv);
        keyFrame.restQ = rig.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(bones.L_wrist.getWorldQuaternion(new THREE.Quaternion()));
        // 握点：掌心和几根手指中节的平均位置（手指圈起来的那根「棍子」的中心），换成手腕自己的坐标存着——以后手腕 = 握点 − 转过的偏移
        const g = new THREE.Vector3(), names = ['L_palm', 'L_point2', 'L_middle2', 'L_ring2', 'L_thumb3'].filter((n) => bones[n]);
        for (const n of names) g.add(bones[n].getWorldPosition(v1).applyMatrix4(inv));
        if (names.length) g.multiplyScalar(1 / names.length); else g.copy(keyFrame.restPos);
        keyFrame.grip = g.sub(keyFrame.restPos).applyQuaternion(keyFrame.restQ.clone().invert());
        // 肘往哪边弯：肘现在在的那一侧（枪坐标），往外下方再推一点
        keyFrame.pole = e.clone().applyMatrix4(inv).add(new THREE.Vector3(-0.15, -0.2, 0.1));
      }
    }
    // 定位点（枪坐标）
    keyFrame.anchor = {}; for (const [n, a] of Object.entries(V.anchors)) keyFrame.anchor[n] = toGun(a);
    // 原来的模型（枪、手、瞄准镜）收进一个不显示的组：原游戏还会摆它们的位置、开关显示，但都画不出来了。枪口火光留着，挪到新枪口
    hidden = new THREE.Group(); hidden.name = 'rifle-vendor-hidden'; hidden.visible = false;
    for (const c of [...vm.children]) {
      const u = c.material?.uniforms;
      if (u?.uJet && u?.uSeed) { flash = c; continue; }
      hidden.add(c);
    }
    vm.add(hidden); vm.add(rig);
    const mz = toGun(V.muzzle), ej = toGun(V.eject);
    if (flash) flash.position.copy(mz);
    if (rifle.spec) { rifle.spec.muzzle.splice(0, 3, mz.x, mz.y, mz.z); rifle.spec.eject.splice(0, 3, ej.x, ej.y, ej.z); }
    rig.traverse((o) => { if (layer) o.layers.set(layer); });
    if (V.name) { origName = rifle.name; rifle.name = V.name; } // HUD 上的枪名
    ready = true;
    return true;
  }

  /** 关键姿势 name 的左手握点位置 / 手的朝向（枪坐标） */
  function keyPose(name, outP, outQ) {
    const K = KEYS[name] || KEYS.guard, A = keyFrame.anchor?.[K.at] || keyFrame.anchor?.guard;
    outP.copy(A).add(v3.set(K.p[0], K.p[1], K.p[2]));
    outQ.setFromEuler(new THREE.Euler(K.r[0], K.r[1], K.r[2])).multiply(keyFrame.restQ || q2.identity());
    return K;
  }
  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), handP = new THREE.Vector3(), handQ = new THREE.Quaternion();
  const magHome = new THREE.Matrix4(), magGrab = new THREE.Matrix4(), tmpM = new THREE.Matrix4();

  /** 左臂摆到 handP / handQ（枪坐标）：解两段 IK，再把手腕转到要的朝向 */
  function poseLeftArm() {
    const U = bones.L_arm, F = bones.L_elbow, H = bones.L_wrist;
    if (!U || !F || !H || !L.lenA) return;
    rig.updateMatrixWorld(true); arms.updateMatrixWorld(true);
    const RW = rig.matrixWorld, rq = rig.getWorldQuaternion(new THREE.Quaternion());
    // 手腕目标 = 握点 − 转过来的握点偏移
    const wrist = handP.clone().sub(v1.copy(keyFrame.grip).applyQuaternion(handQ));
    const s = U.getWorldPosition(new THREE.Vector3()), t = wrist.applyMatrix4(RW), pole = keyFrame.pole.clone().applyMatrix4(RW);
    const e = solveElbow(s, L.lenA, L.lenB, t, pole);
    // 上臂转到指向新的肘
    const aim = (bone, from, to) => {
      const cur = bone.children.find((c) => c.isBone && /elbow|wrist/i.test(c.name)) || null;
      const cp = (cur || bone).getWorldPosition(new THREE.Vector3());
      const d0 = cp.sub(from).normalize(), d1 = v2.subVectors(to, from).normalize();
      const dq = q1.setFromUnitVectors(d0, d1), wq = bone.getWorldQuaternion(new THREE.Quaternion());
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      bone.quaternion.copy(pq.multiply(dq.multiply(wq)));
      bone.updateMatrixWorld(true);
    };
    aim(U, s, e);
    aim(F, F.getWorldPosition(new THREE.Vector3()), t);
    // 手腕朝向：要的世界朝向 = 枪的世界朝向 × handQ
    const want = rq.clone().multiply(handQ), pq = F.getWorldQuaternion(new THREE.Quaternion()).invert();
    H.quaternion.copy(pq.multiply(want)); H.updateMatrixWorld(true);
  }

  function update(dt, info = {}) {
    if (!ready) return;
    const rw = k.reloadW || 0; rig.rotation.set(0, 0, V.reloadRoll * rw); rig.position.set(V.reloadLift[0] * rw, V.reloadLift[1] * rw, V.reloadLift[2] * rw);
    // ---- 左手：换弹时间轴，或者托护木；切枪时撤开 ----
    const rl = k.reload, empty = !!rl?.empty, t = rl ? rl.t : 0;
    const keys = empty ? R.empty : R.tactical, at = rl ? keyAt(keys, t) : { a: 'guard', b: 'guard', k: 0 };
    const KA = keyPose(at.a, pA, qA), KB = keyPose(at.b, pB, qB);
    handP.copy(pA).lerp(pB, at.k); handQ.copy(qA).slerp(qB, at.k);
    const sw = supportWeight(info.phase, info.k ?? 1, info.mine !== false);
    S.support = sw;
    if (sw < 1) { keyPose('off', pB, qB); handP.lerp(pB, 1 - sw); handQ.slerp(qB, 1 - sw); }
    // 手指：两套之间混
    const fa = finger[KA.fingers], fb = finger[KB.fingers];
    if (fa && fb) for (const bn of Object.keys(fa)) { const b = bones[bn]; if (b) b.quaternion.copy(fa[bn]).slerp(fb[bn], at.k); }
    poseLeftArm();
    // ---- 弹匣：0.47–1.345 秒在左手里（跟着关键姿势走），其余时间在弹匣井里 ----
    const mag = parts.Magazine, P = reloadParts(t, empty, R);
    if (mag?.userData.rest) {
      const rest = mag.userData.rest;
      if (rl && P.held) {
        // 弹匣在枪坐标里的原位 → 跟着「抓住弹匣」那个手的姿势一起动
        magHome.compose(rest.p, rest.q, mag.scale).premultiply(holder.matrix);
        keyPose('mag', pA, qA); magGrab.compose(pA, qA, v1.set(1, 1, 1)).invert();
        tmpM.compose(handP, handQ, v1.set(1, 1, 1)).multiply(magGrab).multiply(magHome);
        tmpM.premultiply(m1.copy(holder.matrix).invert()).decompose(mag.position, mag.quaternion, v2);
      } else { mag.position.copy(rest.p); mag.quaternion.copy(rest.q); }
    }
    // ---- 抛壳窗里的枪机、防尘盖、扳机 ----
    const bolt = parts.M4A1Body_02_Ejector_2, bt = k.boltT ?? 9, cycle = bt < 0.072 ? Math.sin(Math.PI * bt / 0.072) : 0;
    if (bolt?.userData.rest) bolt.position.z = bolt.userData.rest.p.z + V.boltTravel * Math.max(cycle * 0.95, k.boltLocked ? 0.86 : 0, rl ? 0.86 * P.boltOpen : 0);
    if (bt < 0.02 && S.lastShot !== k.lastShot) { S.lastShot = k.lastShot; S.shots++; S.dust = Math.max(S.dust, 0.001); }
    // 防尘盖：第一枪弹开（铰链在下沿，往下翻 ~110°，带一点回弹），换弹也不会自己合上
    if (S.shots > 0) { S.dustV += ((1 - S.dust) * 900 - S.dustV * 18) * dt; S.dust += S.dustV * dt; }
    const lid = parts.M4A1Body_03_Ejector_Lid; if (lid?.userData.rest) lid.quaternion.copy(lid.userData.rest.q).multiply(q1.setFromAxisAngle(v1.set(0, 0, 1), -V.dustCover * S.dust));
    const trig = parts.M4A1Body_07_Trigger; if (trig?.userData.rest) trig.quaternion.copy(trig.userData.rest.q).multiply(q1.setFromAxisAngle(v1.set(1, 0, 0), 0.22 * (k.finger || 0)));
  }

  return {
    get ready() { return ready; }, get root() { return rig; }, get holder() { return holder; }, get arms() { return arms; }, parts, bones, state: S, keyFrame,
    attach, update, keyPose,
    /** 新一局：防尘盖合上 */
    reset() { Object.assign(S, { dust: 0, dustV: 0, shots: 0, lastShot: k?.lastShot ?? -9 }); },
    dispose() {
      if (!ready) return;
      // 原来的模型放回去（下次就还是原来那把）；新枪的资源释放，手臂的几何、材质是冲锋枪的，不动
      for (const c of [...hidden.children]) vm.add(c);
      hidden.removeFromParent(); rig.removeFromParent();
      if (rifle.spec && origMuzzle) { rifle.spec.muzzle.splice(0, 3, ...origMuzzle); rifle.spec.eject.splice(0, 3, ...origEject); }
      if (flash) flash.position.set(...(origMuzzle || [0, 0, 0]));
      arms?.traverse((o) => o.skeleton?.dispose());
      for (const g of own.geometries) g.dispose(); for (const m of own.materials) m.dispose(); for (const t of own.textures) { t.dispose(); t.image?.close?.(); }
      if (origName != null) rifle.name = origName;
      ready = false;
    },
  };
}
