// 丧尸围城的停电场景：00:00，全楼断电。
// 渲染器本来有昼夜（env.setNight）：入夜以后天黑了，但室内的地面、天花、招牌会按贴图自发光——那是「晚上开着灯的商场」。
// 停电是另一回事：天照样黑，室内的自发光只留一点点（应急电源），补光和环境反射压到很低，近处起一层薄雾；
// 人手里一支手电（一盏不投影的聚光灯，跟着镜头），照到哪儿哪儿才看得清。开枪的火光、燃烧瓶的火会把周围照亮一下。
// 只在丧尸围城里开；零点突围还是原来的白天。所有改动都是「画这一帧之前乘上去、画完还原」，不动渲染器自己存的昼夜状态。
import * as THREE from 'three';

/**
 * glow：室内自发光留多少（0 = 全黑，1 = 正常夜景）；hemi / room / sun / exposure：补光、环境反射、月光、曝光各乘多少；
 * fog：雾从几米起、到几米全遮住；torch：手电的光强、照多远、光锥半角、边缘虚化、衰减指数、颜色。
 */
export const BLACKOUT = Object.freeze({
  glow: 0.11, power: 0, hemi: 1, room: 0.9, sun: 0.6, exposure: 1.1, // power：灯具、招牌、LED 屏的供电（materials.setPower）
  fog: Object.freeze({ near: 5, far: 62, color: 0x06080b, openNear: 60, openFar: 900 }), // open*：坐上直升机 / 到了室外，雾退远（不然从天上什么都看不见）
  // 手电的衰减故意比真实的慢（decay 1，不是平方反比）：贴着墙不至于一片死白，二三十米外还照得见人影
  torch: Object.freeze({ power: 6.5, distance: 58, angle: 0.62, penumbra: 0.9, decay: 1, color: 0xfff0d8, sway: 0.35 }),
  flicker: Object.freeze({ every: [7, 19], dip: 0.45, time: 0.5 }),
});

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * 手电光斑在距离 d 米处的亮度（相对值）：power ÷ d^decay，超过 distance 归零前平滑收掉。纯函数，测试和调参用。
 */
export function torchAt(d, T = BLACKOUT.torch) {
  if (!(d > 0) || d >= T.distance) return 0;
  const k = 1 - (d / T.distance) ** 4;
  return (T.power / Math.max(0.5, d) ** T.decay) * k * k;
}

/**
 * app：园区渲染器（app.env、app.ctx.mats、app.setNight）；viewLayer：枪那一层（手电也要照到枪上）。
 * 返回 { enabled（读写）, level（0–1，渐变中的当前值）, update(dt), begin()（画之前调，返回还原函数）, light, dispose() }。
 */
export function createBlackout({ app, scene, camera, viewLayer = 0, rng = Math.random, B = BLACKOUT }) {
  const env = app.env, mats = app.ctx?.mats || env?.mats || null;
  let enabled = false, level = 0, t = 0, glowNow = -1, open = 0, openTarget = 0, flickT = lerp(B.flicker.every[0], B.flicker.every[1], rng()), dip = 0;
  // 手电：挂在镜头上，稍微偏右下（握枪那只手的位置），光锥指向镜头前方
  const light = new THREE.SpotLight(B.torch.color, 0, B.torch.distance, B.torch.angle, B.torch.penumbra, B.torch.decay);
  light.name = 'siege-torch'; light.castShadow = false;
  light.position.set(0.16, -0.14, 0.05); light.target.position.set(0.02, -0.02, -6);
  void viewLayer; // 手电不照枪那一层：离光源只有三四十厘米，手和枪会一片死白；枪靠环境反射和枪口火光
  camera.add(light); camera.add(light.target);
  const wasNight = !!app.state?.night;
  const fogColor = new THREE.Color(B.fog.color), keepFog = new THREE.Color();

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
    // 手电：亮度跟着渐变走，带一点手的晃动
    light.intensity = B.torch.power * level;
    light.target.position.x = 0.02 + Math.sin(t * 1.3) * 0.02 * B.torch.sway;
    light.target.position.y = -0.02 + Math.sin(t * 1.9 + 1) * 0.015 * B.torch.sway;
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
    get level() { return level; }, light, update, begin,
    /** 人在室外 / 直升机上（0–1）：雾退远 */
    set open(v) { openTarget = Math.max(0, Math.min(1, +v || 0)); }, get open() { return open; },
    dispose() { setEnabled(false); if (mats && glowNow >= 0) { mats.power = 1; mats.setNight(env?.night ?? 0); } light.removeFromParent(); light.target.removeFromParent(); light.dispose(); },
  };
}
