// 丧尸围城的停电场景：00:00，全楼断电。
// 渲染器本来有昼夜（env.setNight）：入夜以后天黑了，但室内的地面、天花、招牌会按贴图自发光——那是「晚上开着灯的商场」。
// 停电是另一回事：天照样黑，室内的自发光只留一点点（应急电源），补光和环境反射压到很低，近处起一层薄雾；
// 人手里一支手电（一盏不投影的聚光灯，跟着镜头），照到哪儿哪儿才看得清。开枪的火光、燃烧瓶的火会把周围照亮一下。
// 只在丧尸围城里开；零点突围还是原来的白天。所有改动都是「画这一帧之前乘上去、画完还原」，不动渲染器自己存的昼夜状态。
//
// 手电要像一支真的 LED 强光手电，而不是一个均匀的大白圆：
//   光斑分两层——中间一小团亮的「聚光芯」，外面一大圈暗的「泛光」（真手电的反光杯就是这样），芯的边上还有一道很淡的环。
//   这两层画在一张小小的「光罩」图上（SpotLight.map）：three r170 只要聚光灯挂了 map，每帧都会自己算投影矩阵，不投影也照样生效，
//   多出来的只是每个像素一次贴图采样——比再加一盏宽角度的灯（每个像素多算一遍整套光照）便宜得多。
//   人的眼睛会适应：贴着墙照，墙不会一片死白。这里每秒探几次手电前面的东西有多远（几条射线打物理世界的墙和楼板），
//   近了就把亮度往下收（像相机的自动曝光），远处照人还是原来的亮度。
import * as THREE from 'three';
import { MEM } from '../render/device.js';

/**
 * glow：室内自发光留多少（0 = 全黑，1 = 正常夜景）；hemi / room / sun / exposure：补光、环境反射、月光、曝光各乘多少；
 * fog：雾从几米起、到几米全遮住；torch：手电的光强（聚光芯正中）、照多远、光锥半角（泛光的外沿）、边缘虚化、衰减指数、颜色。
 * torch.beam：光罩——core 聚光芯半径（光锥半径的几分之几）、spill 泛光亮度（芯的几分之几）、ring 芯边上那道环、warm 泛光偏暖多少、size 光罩边长（像素）。
 * torch.adapt：近处收光——ref 米以内开始收、k 收的快慢（亮度 ∝ (距离/ref)^k）、min 最少留几成、every 几秒探一次、spread 侧边几条射线偏开多少弧度、
 *   down / up：变暗、变亮各用几秒（挡到墙上很快收，移开慢慢放，像眼睛）；turn：镜头一下子转过这么多弧度就不等下一次，马上再探
 *   （猛一转身脸贴着墙，不然要白一下才暗下来）。
 */
export const BLACKOUT = Object.freeze({
  glow: 0.11, power: 0, hemi: 1, room: 0.9, sun: 0.6, exposure: 1.1, // power：灯具、招牌、LED 屏的供电（materials.setPower）
  fog: Object.freeze({ near: 5, far: 62, color: 0x06080b, openNear: 60, openFar: 900 }), // open*：坐上直升机 / 到了室外，雾退远（不然从天上什么都看不见）
  // 手电的衰减故意比真实的慢（decay 1，不是平方反比）：二三十米外还照得见人影；贴着墙的过曝交给 adapt 收。
  // 颜色是偏中性略冷的白（常见的强光 LED 手电那样）：血、皮肤在暖黄光下会糊成一片土色，在中性白下红是红、灰是灰
  torch: Object.freeze({ power: 7, distance: 58, angle: 0.74, penumbra: 0.12, decay: 1, color: 0xf1f4ff, sway: 0.35,
    beam: Object.freeze({ core: 0.3, spill: 0.2, ring: 0.1, warm: 0.07, size: 128 }),
    adapt: Object.freeze({ ref: 5, k: 0.9, min: 0.2, every: 0.12, spread: 0.2, down: 0.06, up: 0.45, turn: 0.12 }) }),
  flicker: Object.freeze({ every: [7, 19], dip: 0.45, time: 0.5 }),
});

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * 手电光斑在距离 d 米处的亮度（相对值，聚光芯正中）：power ÷ d^decay，超过 distance 归零前平滑收掉。纯函数，测试和调参用。
 */
export function torchAt(d, T = BLACKOUT.torch) {
  if (!(d > 0) || d >= T.distance) return 0;
  const k = 1 - (d / T.distance) ** 4;
  return (T.power / Math.max(0.5, d) ** T.decay) * k * k;
}

/**
 * 光罩上离中心 r（0 = 正中，1 = 光锥外沿）处的亮度和颜色 [r, g, b]（0–1）。纯函数。
 * 芯：中间一团接近 1、往外柔和地掉下去；芯边上一道很淡的亮环（反光杯的边）；泛光：芯外一圈平台，往外沿慢慢收到 0，略偏暖。
 * a：方位角（弧度），给泛光加一点点不均匀——真手电的光斑从来不是完美的圆。
 */
export function beamAt(r, a = 0, P = BLACKOUT.torch.beam) {
  if (!(r >= 0) || r >= 1) return [0, 0, 0];
  const c = P.core, core = Math.exp(-((r / (c * 0.78)) ** 2.4));
  const ring = P.ring * Math.exp(-(((r - c * 1.05) / (c * 0.16)) ** 2));
  const edge = 1 - smooth(0.62, 0.98, r);
  const wob = 1 + 0.05 * Math.sin(a * 3 + 0.7) + 0.03 * Math.sin(a * 7 + 2.1) + 0.04 * Math.sin(r * 31); // 泛光里极淡的不匀和同心纹
  const spill = P.spill * edge * wob * smooth(0, c * 0.9, r);
  const v = Math.min(1, core + ring + spill * (1 - core));
  // 越往外越偏暖（LED 泛光边上那圈淡黄）；芯保持中性
  const w = P.warm * smooth(c * 0.6, 1, r);
  return [v, v * (1 - w * 0.35), v * (1 - w)];
}

/** 光罩图（size × size，RGBA，线性值 0–255）。纯函数：节点测试里也能算，不需要画布。 */
export function beamCookie(size = BLACKOUT.torch.beam.size, P = BLACKOUT.torch.beam) {
  const n = Math.max(8, size | 0), data = new Uint8Array(n * n * 4), h = (n - 1) / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x - h) / h, dy = (y - h) / h, [r, g, b] = beamAt(Math.hypot(dx, dy), Math.atan2(dy, dx), P), i = (y * n + x) * 4;
    data[i] = Math.round(r * 255); data[i + 1] = Math.round(g * 255); data[i + 2] = Math.round(b * 255); data[i + 3] = 255;
  }
  return { size: n, data };
}

/**
 * 近处收光：手电前面的东西离 d 米时，光强乘多少（0–1）。ref 米以外不收；以内按 (d/ref)^k 收，最少留 min。
 * k 略小于 1：墙上的照度 ∝ 光强 ÷ 距离，贴得越近仍然稍微更亮一点（不然像是手电自己变暗了），但不会一片死白。纯函数。
 */
export function torchGain(d, A = BLACKOUT.torch.adapt) {
  if (!(d > 0)) return A.min;
  if (d >= A.ref) return 1;
  return Math.max(A.min, (d / A.ref) ** A.k);
}

/**
 * 几条探测射线的结果合成一个「有效距离」：屏幕上最亮的那块决定曝光。w 是各条射线的权重（正中 1，偏到泛光里的小一些）。
 * 没打到东西的射线记 far。纯函数。
 */
export function nearOf(dists, w, far) {
  let best = 0;
  for (let i = 0; i < dists.length; i++) { const d = dists[i] > 0 ? Math.min(dists[i], far) : far; best = Math.max(best, (w[i] ?? 1) / Math.max(0.15, d)); }
  return best > 0 ? 1 / best : far;
}

/**
 * app：园区渲染器（app.env、app.ctx.mats、app.setNight）；viewLayer：枪那一层（手电不照那一层）。
 * probe(origin, dir, max)：往前打一条射线，返回打到东西的距离（米）或 null；不给就用 physics.raycast（physics 不给就找游戏里的 G.physics）。
 * 返回 { enabled（读写）, level（0–1，渐变中的当前值）, gain（近处收光的当前倍数）, near（探到的有效距离）, update(dt), begin()（画之前调，返回还原函数）, light, dispose() }。
 */
export function createBlackout({ app, scene, camera, viewLayer = 0, rng = Math.random, B = BLACKOUT, probe = null, physics = null }) {
  const env = app.env, mats = app.ctx?.mats || env?.mats || null, T = B.torch, A = T.adapt;
  let enabled = false, level = 0, t = 0, glowNow = -1, open = 0, openTarget = 0, flickT = lerp(B.flicker.every[0], B.flicker.every[1], rng()), dip = 0;
  let gain = 1, gainTo = 1, near = T.distance, probeT = 0;
  // 手电：挂在镜头上，稍微偏右下（握枪那只手的位置），光锥指向镜头前方
  const light = new THREE.SpotLight(T.color, 0, T.distance, T.angle, T.penumbra, T.decay);
  light.name = 'siege-torch'; light.castShadow = false;
  light.position.set(0.16, -0.14, 0.05); light.target.position.set(0.02, -0.02, -6);
  // 光罩：聚光芯 + 泛光（见文件头）。128² 的线性图，不要 mipmap（光斑很柔，放大缩小都看不出），64 KB
  let cookie = null;
  if (T.beam) {
    const c = beamCookie(MEM.modelTex >= 512 ? T.beam.size : T.beam.size / 2, T.beam); // 省内存档 64²（16 KB）
    cookie = new THREE.DataTexture(c.data, c.size, c.size, THREE.RGBAFormat);
    cookie.name = 'siege-torch-beam'; cookie.colorSpace = THREE.NoColorSpace;
    cookie.magFilter = cookie.minFilter = THREE.LinearFilter; cookie.generateMipmaps = false;
    cookie.wrapS = cookie.wrapT = THREE.ClampToEdgeWrapping; cookie.needsUpdate = true;
    light.map = cookie;
  }
  void viewLayer; // 手电不照枪那一层：离光源只有三四十厘米，手和枪会一片死白；枪靠环境反射和枪口火光
  camera.add(light); camera.add(light.target);
  const wasNight = !!app.state?.night;
  const fogColor = new THREE.Color(B.fog.color), keepFog = new THREE.Color();

  // 探测射线：正中一条，上下左右各偏 spread 弧度一条（偏出去的落在泛光里，权重低一些）
  const origin = new THREE.Vector3(), fwd = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion(), lastDir = new THREE.Vector3(), nowDir = new THREE.Vector3();
  const turnCos = Math.cos(A.turn ?? 0.12);
  const OFFS = [[0, 0, 1], [A.spread, 0, 0.62], [-A.spread, 0, 0.62], [0, A.spread, 0.55], [0, -A.spread, 0.7]], W = OFFS.map((o) => o[2]), dists = OFFS.map(() => 0);
  const ray = probe || ((o, d, max) => {
    const P = physics || app?.physics || globalThis.__G?.physics || null;
    const hit = P?.raycast?.(o, d, max);
    return hit && Number.isFinite(hit.dist) ? hit.dist : null;
  });
  function measure() {
    camera.updateMatrixWorld?.();
    camera.getWorldPosition(origin); camera.getWorldQuaternion(q); lastDir.set(0, 0, -1).applyQuaternion(q);
    for (let i = 0; i < OFFS.length; i++) {
      fwd.set(OFFS[i][0], OFFS[i][1], -1).normalize().applyQuaternion(q);
      dir.copy(fwd);
      let d = null; try { d = ray(origin, dir, A.ref * 2); } catch { d = null; }
      dists[i] = d > 0 ? d : T.distance;
    }
    near = nearOf(dists, W, T.distance);
    gainTo = torchGain(near, A);
  }

  function setEnabled(v) {
    v = !!v; if (v === enabled) return;
    enabled = v;
    // 天色跟着换：开 → 入夜；关 → 回到进来时的样子
    app.setNight?.(enabled ? true : wasNight);
  }

  function update(dt) {
    t += dt;
    level = Math.max(0, Math.min(1, level + (enabled ? dt : -dt) / 1.4));
    open += (openTarget - open) * Math.min(1, dt * 1.5);
    // 应急电源偶尔抖一下：整层暗半秒
    if (level > 0.5) { flickT -= dt; if (flickT <= 0) { flickT = lerp(B.flicker.every[0], B.flicker.every[1], rng()); dip = B.flicker.time; } }
    dip = Math.max(0, dip - dt);
    const wob = dip > 0 ? 1 - B.flicker.dip * Math.abs(Math.sin(dip * 38)) : 1;
    // 室内自发光：夜景是 1，停电只留一点。昼夜渐变的那一秒多里渲染器自己在设，等它到位再接手
    const night = env?.night ?? 0;
    if (mats && level > 0 && Math.abs(night - (env?.target ?? night)) < 1e-3) {
      const g = lerp(night, B.glow * wob, level);
      if (Math.abs(g - glowNow) > 0.004) { glowNow = g; mats.power = lerp(1, B.power, level); mats.setNight(g); }
    } else if (mats && level === 0 && glowNow >= 0) { glowNow = -1; mats.power = 1; mats.setNight(night); }
    // 近处收光：每 every 秒探一次，变暗快、变亮慢（指数逼近，帧率高低结果一样）
    if (level > 0.01) {
      probeT -= dt;
      if (probeT > 0) { camera.getWorldQuaternion(q); if (nowDir.set(0, 0, -1).applyQuaternion(q).dot(lastDir) < turnCos) probeT = 0; } // 猛一转：马上探
      if (probeT <= 0) { probeT = A.every; measure(); }
      const tau = gainTo < gain ? A.down : A.up;
      gain += (gainTo - gain) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));
    } else { gain = gainTo = 1; probeT = 0; }
    // 手电：亮度跟着渐变走，带一点手的晃动
    light.intensity = T.power * level * gain;
    light.target.position.x = 0.02 + Math.sin(t * 1.3) * 0.02 * T.sway;
    light.target.position.y = -0.02 + Math.sin(t * 1.9 + 1) * 0.015 * T.sway;
    light.visible = level > 0.01;
  }

  /** 画这一帧之前：把补光、环境反射、月光、曝光压下去，雾拉近。返回还原函数（画完马上调）。 */
  function begin() {
    if (!(level > 0) || !env) return null;
    const { hemi, sun } = env, renderer = env.renderer, fog = scene.fog;
    const keep = [hemi.intensity, sun.intensity, scene.environmentIntensity, renderer.toneMappingExposure, fog?.near, fog?.far];
    if (fog) keepFog.copy(fog.color);
    hemi.intensity *= lerp(1, B.hemi, level); sun.intensity *= lerp(1, B.sun, level);
    scene.environmentIntensity *= lerp(1, B.room, level); renderer.toneMappingExposure *= lerp(1, B.exposure, level);
    if (fog) { fog.near = lerp(fog.near, lerp(B.fog.near, B.fog.openNear, open), level); fog.far = lerp(fog.far, lerp(B.fog.far, B.fog.openFar, open), level); fog.color.lerp(fogColor, level); }
    return () => {
      [hemi.intensity, sun.intensity, scene.environmentIntensity, renderer.toneMappingExposure] = keep;
      if (fog) { fog.near = keep[4]; fog.far = keep[5]; fog.color.copy(keepFog); }
    };
  }

  return {
    get enabled() { return enabled; }, set enabled(v) { setEnabled(v); },
    get level() { return level; }, get gain() { return gain; }, get near() { return near; }, light, update, begin,
    /** 人在室外 / 直升机上（0–1）：雾退远 */
    set open(v) { openTarget = Math.max(0, Math.min(1, +v || 0)); }, get open() { return open; },
    dispose() { setEnabled(false); if (mats && glowNow >= 0) { mats.power = 1; mats.setNight(env?.night ?? 0); } light.removeFromParent(); light.target.removeFromParent(); light.map = null; cookie?.dispose(); light.dispose(); },
  };
}
