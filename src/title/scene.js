// 开场场景：建场景、四个镜头、灯光、后期、画质档；对外只有 createTitleScene()。
// 镜头内容按「场景时间」（完整版的秒数）写在 frame() 里；play('short') / 菜单背景循环用 timeline.js 换算过去。
// setT(t) 驱动一切随时间变的东西（雨、闪烁、颗粒、丧尸、旋翼、白闪、Logo / 菜单的进度），截图和导出视频逐帧一致。
// 复用游戏里现成的东西：直升机（ride-vehicles）、双联重机枪（twin-hmg）、三名队员（soldier + rig-skin + squad-roster）、
// 丧尸（zombie-skin，预画贴图）、信号弹和火（siege-props）、M4A1 模型。不引入 src/layout/*、nav.js。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRideVehicle } from '../jimao/ride-vehicles.js';
import { buildTwinHmg } from '../jimao/twin-hmg.js';
import { buildParts, RIG } from '../jimao/soldier.js';
import { createRigMaterial } from '../jimao/skins/rig-skin.js';
import { SQUAD } from '../jimao/squad-roster.js';
import { litFlare, buildFire, fireStep } from '../jimao/siege-props.js';
import { loadZombieKit } from '../jimao/zombie-skin.js';
import { TITLE_ZOMBIE_TEX, TITLE_PEOPLE, TITLE_FONTS, TITLE_FONT_FAMILIES } from './title-data.js';
import { TIMELINE, LOGO_AT, MENU_AT, TITLE_START, sampleShot, sceneTime } from './timeline.js';
import {
  R0, EMP, STR, clamp, sm, lerp, V, rng, softTex, glowSprite, resetShared, loadScan,
  buildSky, buildCity, buildApartment, buildSandbagWall, crateTex, buildRain, buildSplashes, buildSparks, buildSmokePlumes, buildDebris, upgradeHeli, buildDownwash, facadeTex, grime, boxM, shrinkTex,
} from './props.js';

// ---------------------------------------------------------------- 画质档
/**
 * 每档：渲染分辨率上限（dpr；maxMP：画面最多几百万像素，大显示器也不超，显存跟着封顶）、Bloom 分辨率（bloom，相对画面）、丧尸数（街上 horde / 楼顶 roofZ）、雨丝数、溅水数、
 * 景深、湿地面倒影、阴影（贴图边长，0 = 关）、丧尸贴图档（zset）、外围填充楼数。
 * 设计稿：horde 镜头 ≥ 60 只（low 档 30）。
 */
export const TITLE_TIERS = Object.freeze({
  low: Object.freeze({ dpr: 1, maxMP: 1.0, bloom: 0.35, horde: 30, roofZ: 16, rain: 5000, splash: 400, dof: false, reflect: false, shadow: 0, zset: 'lo', fillers: 90 }),
  balanced: Object.freeze({ dpr: 1.25, maxMP: 1.6, bloom: 0.5, horde: 60, roofZ: 24, rain: 9000, splash: 900, dof: true, reflect: false, shadow: 1024, zset: 'lo', fillers: 130 }),
  high: Object.freeze({ dpr: 1.5, maxMP: 1.6, bloom: 0.4, horde: 72, roofZ: 30, rain: 14000, splash: 1400, dof: true, reflect: true, shadow: 1024, zset: 'lo', fillers: 160 }),
  ultra: Object.freeze({ dpr: 2, maxMP: 3.7, bloom: 0.5, horde: 90, roofZ: 36, rain: 20000, splash: 2000, dof: true, reflect: true, shadow: 2048, zset: 'hi', fillers: 200 }),
});

/** 'auto' 按设备定档：手机 / 平板（粗指针）内存 ≥ 6 GB 用均衡，否则流畅；电脑用精细。纯函数 */
export function resolveTitleTier(tier = 'auto', { coarse = false, memory = 8 } = {}) {
  if (TITLE_TIERS[tier]) return tier;
  if (coarse) return memory >= 6 ? 'balanced' : 'low';
  return 'high';
}

/** 生成物里的地址（相对网站根目录的 ./assets/…，或者打包后的 data: / 带哈希的地址）换成相对 base 的 */
export const assetURL = (base, u) => (/^(data:|blob:|https?:|\/)/.test(u) ? u : base + u.replace(/^\.\//, ''));

/** 字体：毛笔字 + 英文，进度条阶段就读完（商场招牌用毛笔字；Logo 那边也直接用得上，不在出场时临时加载） */
export async function loadTitleFonts(base = './') {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  await Promise.all(Object.entries(TITLE_FONT_FAMILIES).map(async ([k, family]) => {
    if ([...document.fonts].some((f) => f.family.includes(family) && f.status === 'loaded')) return;
    const face = new FontFace(family, `url(${assetURL(base, TITLE_FONTS[k])})`);
    await face.load(); document.fonts.add(face);
  }));
}

// ---------------------------------------------------------------- 后期：景深（读深度贴图的便宜 gather）
class DofPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.uniforms = { tColor: { value: null }, tDepth: { value: null }, uFocus: { value: 10 }, uAperture: { value: 0 }, uMaxR: { value: 9 }, uNear: { value: 0.1 }, uFar: { value: 4000 }, uRes: { value: new THREE.Vector2(1, 1) } };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      // 着色器里：黄金角螺旋取 24 个点：样本自己的模糊半径够得着这里才算（清楚的前景不会被后面的糊染到）
      fragmentShader: `#include <packing>
        uniform sampler2D tColor, tDepth; uniform float uFocus, uAperture, uMaxR, uNear, uFar; uniform vec2 uRes; varying vec2 vUv;
        float viewZ(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
        float coc(float z){ return clamp(abs(z - uFocus) / max(z, 0.05) * uAperture, 0., uMaxR); }
        void main(){
          float z0 = viewZ(vUv), c0 = coc(z0);
          vec3 acc = texture2D(tColor, vUv).rgb; float wsum = 1.;

          for (int i = 1; i < 24; i++) {
            float fi = float(i), r = sqrt(fi / 24.) * uMaxR, a = fi * 2.39996;
            vec2 o = vec2(cos(a), sin(a)) * r / uRes;
            float zs = viewZ(vUv + o), cs = coc(zs);
            float w = smoothstep(r - 1.5, r, max(cs, zs > z0 ? c0 : 0.)) ;
            acc += texture2D(tColor, vUv + o).rgb * w; wsum += w;
          }
          vec3 sharp = texture2D(tColor, vUv).rgb;
          gl_FragColor = vec4(mix(sharp, acc / wsum, smoothstep(0.3, 1.5, c0 + 0.5)), 1.);
        }`,
    }));
  }
  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tColor.value = readBuffer.texture; this.uniforms.tDepth.value = readBuffer.depthTexture;
    this.uniforms.uNear.value = this.camera.near; this.uniforms.uFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
  dispose() { this.quad.material.dispose(); this.quad.dispose(); }
}

// ---------------------------------------------------------------- 后期：调色（ACES、青橙、抬暗部、色差、镜头雨滴、暗角、颗粒、2.39:1 黑边、白闪）
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uExp: { value: 1 }, uBars: { value: 1 }, uAspect: { value: 16 / 9 }, uFade: { value: 0 }, uWhite: { value: 0 }, uRed: { value: 0 }, uVig: { value: 1 }, uLift: { value: 1 }, uDrops: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  // 着色器里：镜头上的雨滴：一格一格随机放水珠，水珠里的画面被折射（往中心收、上下颠倒一点），边上一圈暗
  //   大的几颗往下淌
  //   青橙：暗部偏青、亮部偏暖
  //   抬暗部：最暗处是深青灰，不是纯黑（「暗而通透」）
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT, uExp, uBars, uAspect, uFade, uWhite, uRed, uVig, uLift, uDrops; uniform vec2 uRes; varying vec2 vUv;
    vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); }

    vec2 drops(vec2 uv, out float rim){
      rim = 0.; vec2 off = vec2(0.);
      for (int L = 0; L < 2; L++) {
        float sc = L == 0 ? 9. : 17.;
        vec2 g = uv * vec2(uAspect, 1.) * sc; vec2 id = floor(g), f = fract(g) - 0.5;
        float h = hash(id + float(L) * 7.1), life = fract(uT * (0.08 + h * 0.1) + h);
        if (h > 0.84) {
          vec2 c = (vec2(hash(id + 1.3), hash(id + 2.7)) - 0.5) * 0.6; c.y += life * 0.25 * step(0.85, h);
          vec2 d = f - c; float r = (0.13 + h * 0.12) * (1. - life * 0.4); float dist = length(d * vec2(1., 1.15));
          float m = smoothstep(r, r * 0.8, dist) * smoothstep(0.98, 0.7, life);
          off += -d * m * 0.9 / sc; rim += smoothstep(r * 0.65, r, dist) * m;
        }
      }
      return off;
    }
    void main(){
      vec2 uv = vUv; vec2 cc = uv - 0.5;
      float rim = 0.; if (uDrops > 0.) uv += drops(uv, rim) * uDrops;
      float r2 = dot(cc, cc), ca = 0.0022 * r2 * 4.;
      vec3 col; col.r = texture2D(tDiffuse, uv - cc * ca).r; col.g = texture2D(tDiffuse, uv).g; col.b = texture2D(tDiffuse, uv + cc * ca).b;
      col *= uExp;
      col = aces(col);
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, 0.9);

      col += vec3(-0.010, 0.006, 0.020) * (1. - smoothstep(0.0, 0.4, l));
      col *= mix(vec3(1.), vec3(1.06, 0.99, 0.9), smoothstep(0.35, 0.9, l));
      col = toSRGB(clamp(col, 0., 1.));
      col = mix(col, col * vec3(1.1, 0.72, 0.7), uRed);

      col = col * (1. - 0.075 * uLift) + vec3(0.045, 0.058, 0.066) * uLift;
      col = mix(col, col*col*(3.-2.*col), 0.18);
      col *= 1. - rim * 0.08 * uDrops;
      float vig = smoothstep(1.05, 0.3, length(cc * vec2(uAspect * 0.6, 1.0)));
      col *= mix(1., mix(0.5, 1., vig), uVig);
      float gr = hash(floor(gl_FragCoord.xy * 0.75) + fract(uT * 7.13) * 91.) - 0.5;
      col += gr * 0.045 * (1. - l * 0.5);
      col = mix(col, vec3(1.), uWhite);
      col *= 1. - uFade;
      float vis = min(1., uAspect / 2.39); float bar = (1. - vis) * 0.5 * uBars;
      if (uv.y < bar || uv.y > 1. - bar || vUv.y < bar || vUv.y > 1. - bar) col = vec3(0.);
      gl_FragColor = vec4(col, 1.);
    }`,
};

// ---------------------------------------------------------------- 湿地面倒影（只给商场门口那一镜）：Reflector 的着色器换成「积水处才反光、被法线扰动、掠射角更亮」
const WET_REFLECT = {
  uniforms: { color: { value: new THREE.Color(1, 1, 1) }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, tMask: { value: null }, uT: { value: 0 }, uStr: { value: 1 } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vW; varying vec2 vUv;
    void main(){ vUv = uv; vUvR = textureMatrix * vec4(position, 1.); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  // 着色器里：粗糙度低的地方 = 积水
  //   雨点打在水面上的小涟漪：扰动反射
  fragmentShader: `uniform sampler2D tDiffuse, tMask; uniform float uT, uStr; varying vec4 vUvR; varying vec3 vW; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    void main(){
      float wet = 1. - texture2D(tMask, vUv * 6.).r;

      vec2 cell = floor(vW.xz * 3.), f = fract(vW.xz * 3.) - 0.5; float ph = fract(uT * 1.7 + h(cell));
      float ring = sin((length(f) - ph * 0.5) * 40.) * (1. - ph) * step(length(f), 0.5) * step(0.5, h(cell + 3.1));
      vec4 uvr = vUvR; uvr.xy += (vec2(ring) * 0.004 + (vec2(h(vW.xz), h(vW.zx)) - 0.5) * 0.002) * uvr.w;
      vec3 refl = texture2DProj(tDiffuse, uvr).rgb;
      vec3 v = normalize(cameraPosition - vW); float fres = 0.04 + 0.96 * pow(1. - max(v.y, 0.), 5.);
      float a = clamp(mix(0.12, 0.95, smoothstep(0.2, 0.7, wet)) * (0.35 + 0.65 * fres), 0., 1.) * uStr;
      gl_FragColor = vec4(refl, a);
    }`,
};

// ---------------------------------------------------------------- 主入口
/**
 * 建开场场景。canvas：要画的画布；tier：画质档（'auto' / 'low' / 'balanced' / 'high' / 'ultra'）；
 * onProgress(label, p)：进度（p 0..1，含着色器预编译、每个镜头预热）；base：网站根目录（读贴图、模型用）；
 * dpr：覆盖这一档的分辨率上限（截图用）；preserveDrawingBuffer：截图 / 导出视频时打开。
 * 返回 TitleScene：play / skip / setT / on / ui / stats / resize / dispose。
 */
export async function createTitleScene(canvas, { tier = 'auto', onProgress = () => {}, base = './', dpr = null, preserveDrawingBuffer = false } = {}) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const tierId = resolveTitleTier(tier, { coarse, memory: navigator.deviceMemory || 8 }), Q = TITLE_TIERS[tierId];
  let progress = 0;
  const step = (label, p) => { progress = Math.max(progress, p); onProgress(label, progress); };
  step('正在封锁云澜', 0.02);

  // ---- 渲染器
  const REFL = 0.4; // 湿地面倒影的分辨率（相对画面；水面被雨点扰动，用不着全清）
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer, powerPreference: 'high-performance', stencil: false });
  const size = () => [Math.max(1, canvas.clientWidth || innerWidth), Math.max(1, canvas.clientHeight || innerHeight)];
  const DPR = (() => { const [w, h] = size(); return Math.min(globalThis.devicePixelRatio || 1, dpr ?? Q.dpr, dpr ? Infinity : Math.max(0.5, Math.sqrt((Q.maxMP * 1e6) / (w * h)))); })();
  renderer.setPixelRatio(DPR);
  { const [w, h] = size(); renderer.setSize(w, h, false); }
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = Q.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  // 雾色和天空地平线的光雾是同一个颜色（线性值），远处的楼、地面融进天里，不留一道硬的地平线
  const FOG = new THREE.Color().setRGB(0.06, 0.08, 0.112, THREE.LinearSRGBColorSpace);
  scene.fog = new THREE.FogExp2(FOG, 0.006);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 4000);
  scene.add(camera);

  // ---- 天光：冷色月光（从楼群背后打过来，给人和楼勾一道轮廓）+ 半球天光（暗部抬到深青灰）
  const hemi = new THREE.HemisphereLight(0x5d7494, 0x2a221c, 0.75); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xa9bddf, 1.4); moon.position.set(-220, 260, -330); scene.add(moon); scene.add(moon.target);
  if (Q.shadow) { moon.castShadow = true; moon.shadow.mapSize.set(Q.shadow, Q.shadow); Object.assign(moon.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 800 }); moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.03; }
  moon.target.position.set(0, R0, 0);
  // 补光：从机位这一侧打过去的一盏冷色平行光（逆光里的丧尸、人物正面不再是一块死黑剪影）；强度按镜头给
  const fill = new THREE.DirectionalLight(0x9fb2d0, 0); scene.add(fill); scene.add(fill.target);

  // ---- 环境反射：同一片夜空烘成 PMREM，湿地面、金属、玻璃都反着天光（不再是一片死黑）
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  { const sk = buildSky(envScene); sk.uniforms.uLift.value = 1.2;
    for (const [x, y, z, c, s] of [[-300, 260, -500, 0x9fb4d8, 220], [600, 30, 300, 0x8a5a40, 300], [-500, 20, 500, 0x6a4a3a, 260], [0, -200, 0, 0x2a2622, 900]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.6) })); m.position.set(x, y, z); envScene.add(m);
    } }
  const envRT = pmrem.fromScene(envScene, 0.02, 1, 4000);
  envScene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  pmrem.dispose();
  scene.environment = envRT.texture; scene.environmentIntensity = 0.35;

  const sky = buildSky(scene);
  step('读取模型', 0.08);

  // ---- 资源：扫描贴图、丧尸（预画贴图）、M4A1、字体，一起读
  const loader = new THREE.TextureLoader();
  let loaded = 0; const tick = (label) => { loaded++; step(label, 0.08 + (loaded / 5) * 0.42); };
  const [concrete, formed, kit, m4gltf] = await Promise.all([
    loadScan(base, 'garage_concrete', loader, tierId === 'ultra' ? 1024 : 512).then((s) => { tick('读取贴图'); return s; }),
    loadScan(base, 'formed_concrete', loader, tierId === 'ultra' ? 1024 : 512).then((s) => { tick('读取贴图'); return s; }),
    loadZombieKit({ prebaked: TITLE_ZOMBIE_TEX.map((e) => ({ ...e, url: assetURL(base, e.url) })), set: Q.zset, people: TITLE_PEOPLE.map((e) => ({ ...e, url: assetURL(base, e.url) })) }).then((k) => { tick('唤醒尸群'); return k; }).catch((e) => { console.warn('[开场] 丧尸没读到，先不放', e); tick('唤醒尸群'); return null; }),
    new GLTFLoader().loadAsync(`${base}assets/models/fps/m4a1-mobile.glb`).then((g) => { tick('读取模型'); return g; }).catch((e) => { console.warn('[开场] M4A1 没读到', e); tick('读取模型'); return null; }),
    loadTitleFonts(base).then(() => tick('读取字体')).catch((e) => { console.warn('[开场] 字体没读到', e); tick('读取字体'); }),
  ]);
  const scans = { concrete, formed };
  step('搭建城市', 0.52);

  // ---- 布景
  const city = new THREE.Group(); scene.add(city);
  const cityFx = buildCity(city, { fillers: Q.fillers });
  const roof = new THREE.Group(); scene.add(roof);
  const apt = buildApartment(roof, scans);
  const fireMats = [], flareLights = [];
  const smoke = buildSmokePlumes(scene, [[-260, 420, 260, 90], [380, 300, 300, 110], [-520, -120, 220, 80], [120, 640, 340, 120], [520, -380, 200, 70], [-80, 260, 150, 50]]);

  // 机枪阵地：沙袋墙 + 双联重机枪 + 枪口火光 + 曳光弹 + 信号弹 + 弹药箱
  const bags = buildSandbagWall({ radius: 2.35 }); bags.position.set(EMP.x, R0, EMP.z); roof.add(bags);
  // 重机枪的材质：游戏里由材质库给（程序化 PBR）；开场不引入材质库，给一份同名的小材质表：同样的底色 + 三向投影的磨损、划痕、雨水
  const HMG_LOOK = { gunmetal: [0x3a3d40, 0.85, 0.36], anodized_black: [0x1a1b1d, 0.6, 0.42], polymer_black: [0x1d1e1f, 0.05, 0.75], steel_worn: [0x8a8f93, 0.85, 0.4], brass: [0xc9a04a, 0.9, 0.3], hull_paint: [0x343b26, 0.3, 0.58] };
  const hmgMats = { get: (name) => { const L = HMG_LOOK[name]; if (!L) return null;
    return grime(new THREE.MeshStandardMaterial({ color: L[0], metalness: L[1], roughness: L[2], envMapIntensity: 1.7 }), { scale: 5, amt: name === 'hull_paint' ? 0.85 : 0.4, edge: name === 'hull_paint' ? 0.55 : 0.3, panel: name === 'hull_paint' ? 0.3 : 0, rough: 0.3, wet: 0.5, streak: name === 'hull_paint' ? 0.5 : 0 }); } };
  const hmg = buildTwinHmg({ mats: hmgMats }, { base: 1.15 });
  // 开场里不要防盾的两翼：远看是两块印着「12.7」的平板，把枪身挡成一个方盒子；拿掉以后机匣、粗枪管、弹药箱的剪影出来了
  for (const c of hmg.pitchG.children) if (c.isGroup && Math.abs(Math.abs(c.position.x) - 0.5) < 0.01 && Math.abs(c.position.z - 0.5) < 0.01) c.visible = false;
  hmg.root.position.set(EMP.x, R0 + 1.2, EMP.z); hmg.root.rotation.y = Math.PI; hmg.pitchG.rotation.x = 0.05;
  hmg.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material?.envMapIntensity != null) o.material.envMapIntensity = 1.6; } });
  roof.add(hmg.root);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0x3a3d40, metalness: 0.8, roughness: 0.35 })); ped.position.set(EMP.x, R0 + 0.3, EMP.z); roof.add(ped);
  const FLASH = (() => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), r = rng(5);
    g.translate(S / 2, S / 2); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + r() * 0.4, L = S * (0.22 + r() * 0.22); g.rotate(a); const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, 'rgba(255,230,180,1)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -S * 0.035); g.lineTo(L, 0); g.lineTo(0, S * 0.035); g.fill(); g.rotate(-a); }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.26); gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.3, 'rgba(255,190,90,0.7)'); gr.addColorStop(1, 'rgba(255,90,10,0)'); g.fillStyle = gr; g.fillRect(-S / 2, -S / 2, S, S);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  // 枪口火光的亮度压着：bloom 只给一圈光晕，不把枪身整个吞掉
  const flashMat = new THREE.MeshBasicMaterial({ map: FLASH, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, fog: false, color: new THREE.Color(1.5, 1.1, 0.75) });
  const flashes = hmg.muzzles.map((mz) => {
    const grp = new THREE.Group(); mz.add(grp);
    for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), flashMat); if (k === 1) p.rotation.y = Math.PI / 2; if (k === 2) { p.rotation.x = Math.PI / 2; p.scale.set(0.5, 1.4, 1); p.position.z = 0.3; } grp.add(p); }
    return grp;
  });
  const muzzleLight = new THREE.PointLight(0xffa040, 0, 22, 1.6); roof.add(muzzleLight);
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.7, 0.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const tracers = Array.from({ length: 10 }, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.5, 4, 1, true), tracerMat); m.rotation.x = Math.PI / 2; const p = new THREE.Group(); p.add(m); roof.add(p); return p; });
  // 枪身的补光：从机位这一侧的斜上方打一盏冷光（镜头看到的是枪的后面和侧面），连射间隙也看得清枪的形状，防盾背面不再是一块黑
  const gunRim = new THREE.SpotLight(0xbcd2ff, 0, 14, 0.5, 0.6, 1.2); gunRim.position.set(EMP.x + 1.8, R0 + 3.6, EMP.z + 3.4); gunRim.target.position.set(EMP.x, R0 + 1.2, EMP.z); roof.add(gunRim); roof.add(gunRim.target);
  for (const [x, z] of [[EMP.x - 4.8, EMP.z + 3.6], [EMP.x + 5.6, EMP.z - 3.2], [EMP.x + 1, EMP.z - 6.5]]) {
    const f = litFlare(); f.position.set(x, R0, z); f.scale.setScalar(1.4); roof.add(f);
    f.traverse((o) => { if (o.material?.uniforms?.uTime) fireMats.push(o.material); });
    if (f.children.length >= 2) f.children[f.children.length - 2].visible = false; // 冒烟的那一柱在这个距离看着像一团团球
    const l = new THREE.PointLight(0xff2a14, 2.2, 18, 1.4); l.position.set(x + 0.6, R0 + 0.6, z + 0.1); roof.add(l); flareLights.push(l);
    const gl = glowSprite(0xff3018, 0.9); gl.position.set(x + 0.6, R0 + 0.5, z + 0.14); roof.add(gl);
  }
  // 弹药箱：箱体（压出加强筋的边）、盖子、两头的提手、喷的白字，堆在沙袋旁边
  // 箱面：喷字、压筋、掉漆的贴图（每个面整张贴），再叠一层三向投影的脏污
  { const ct = crateTex();
    const crateMat = grime(new THREE.MeshStandardMaterial({ map: ct.map, normalMap: ct.normalMap, roughnessMap: ct.roughnessMap, roughness: 1, metalness: 0.45, envMapIntensity: 1.4 }), { scale: 3, amt: 0.35, edge: 0.25, rough: 0.2, wet: 0.5 });
    const parts = [];
    const put = (g, x, y, z, ry) => { g.rotateY(ry); g.translate(x, y, z); for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n); parts.push(g.index ? g.toNonIndexed() : g); };
    for (const [x, z, ry, y0] of [[EMP.x + 2.2, EMP.z + 2.4, 0.3, 0], [EMP.x + 2.9, EMP.z + 3.1, -0.2, 0], [EMP.x + 2.4, EMP.z + 2.6, 0.15, 0.47], [EMP.x - 2.8, EMP.z + 2.8, 0.1, 0]]) {
      const c = Math.cos(ry), sn = Math.sin(ry), L = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
      put(new THREE.BoxGeometry(0.86, 0.4, 0.46), x, R0 + y0 + 0.2, z, ry);
      put(new THREE.BoxGeometry(0.9, 0.06, 0.5), x, R0 + y0 + 0.43, z, ry);
      for (const lx of [-0.3, 0, 0.3]) { const [px, pz] = L(lx, 0); put(new THREE.BoxGeometry(0.04, 0.42, 0.49), px, R0 + y0 + 0.21, pz, ry); }
      for (const s2 of [-1, 1]) { const [px, pz] = L(s2 * 0.45, 0); const h = new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI); h.rotateY(Math.PI / 2); put(h, px, R0 + y0 + 0.3, pz, ry); }
    }
    const crates = new THREE.Mesh(mergeGeometries(parts), crateMat); parts.forEach((g) => g.dispose()); crates.castShadow = crates.receiveShadow = true; roof.add(crates); }
  step('布置楼顶', 0.58);

  // ---- 三名队员（游戏里的人形和外观）+ M4A1
  const looks = [SQUAD.lead.look, SQUAD.members[0].look, SQUAD.members[1].look];
  const rigMat = createRigMaterial({ name: 'title-squad', emissive: 0x16181a, looks });
  const yawG = Math.PI - 0.32, fG = V(Math.sin(yawG), 0, Math.cos(yawG));
  const GUNNER = { p: V(EMP.x + 0.3, R0, EMP.z + 0.9), f: fG, back: fG.clone().negate(), right: V(-fG.z, 0, fG.x) };
  // 三个人各有各的姿势（不再三个人一样站桩）：机枪手压在枪上；阿哲端枪低姿、仰头看直升机；林医生单膝跪地侧身瞄着楼梯口
  const squad = [
    { look: looks[0], p: V(EMP.x + 0.3, R0, EMP.z + 0.9), yaw: yawG, aim: -0.05, pose: 'gunner' },
    { look: looks[1], p: V(EMP.x - 3.3, R0, EMP.z + 0.9), yaw: Math.PI + 0.55, aim: 0.0, pose: 'watch' },
    { look: looks[2], p: V(EMP.x + 3.0, R0, EMP.z + 1.0), yaw: 2.35, aim: 0.0, pose: 'kneel' },
  ].map((s) => {
    const parts = buildParts(s.look), mk = (geo) => { const m = new THREE.Mesh(geo, rigMat); m.castShadow = true; return m; };
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const hips = new THREE.Group(); hips.position.y = RIG.HIP_Y; body.add(hips); hips.add(mk(parts.pelvis));
    const spine = new THREE.Group(); spine.position.y = 0.1; hips.add(spine); spine.add(mk(parts.torso));
    const head = new THREE.Group(); head.position.y = 0.5; spine.add(head); head.add(mk(parts.head));
    const aim = new THREE.Group(); aim.position.set(0, 0.42, 0.02); spine.add(aim); aim.add(mk(parts.aim));
    const legs = [0.092, -0.092].map((x) => { const thigh = new THREE.Group(); thigh.position.set(x, -0.07, 0); hips.add(thigh); thigh.add(mk(parts.thigh)); const shin = new THREE.Group(); shin.position.y = -RIG.THIGH; thigh.add(shin); shin.add(mk(parts.shin)); return { thigh, shin }; });
    root.position.copy(s.p); root.rotation.y = s.yaw; aim.rotation.x = s.aim;
    const L = (a, b, c, d) => { legs[0].thigh.rotation.x = a; legs[0].shin.rotation.x = b; legs[1].thigh.rotation.x = c; legs[1].shin.rotation.x = d; };
    if (s.pose === 'gunner') { L(-0.35, 0.3, 0.25, 0.15); spine.rotation.x = 0.28; hips.position.y = RIG.HIP_Y - 0.06; aim.visible = false; }
    else if (s.pose === 'watch') {
      // 重心压在后脚、上身微侧、枪口朝下（低姿戒备），头抬起来看头顶的直升机
      L(-0.28, 0.32, 0.18, 0.12); legs[0].thigh.rotation.z = 0.08; legs[1].thigh.rotation.z = -0.1;
      hips.position.y = RIG.HIP_Y - 0.05; hips.rotation.z = 0.05; spine.rotation.set(0.06, 0.25, -0.04); head.rotation.set(-0.42, -0.3, 0);
      aim.rotation.set(0.6, 0.4, 0);
    } else {
      // 单膝跪：前腿大腿放平、小腿垂直；后腿膝盖着地、小腿往后平放；上身前探贴着枪
      L(-1.45, 1.42, 0.15, 1.55); hips.position.y = RIG.SHIN + 0.08; spine.rotation.x = 0.2; head.rotation.x = 0.05; aim.rotation.x = -0.12;
    }
    roof.add(root);
    return { root, spine, aim, head, hips, s, base: { spine: spine.rotation.x, head: head.rotation.x, hipY: hips.position.y, aimX: aim.rotation.x } };
  });
  if (m4gltf) {
    // M4A1 在画面里只有几十像素长：贴图缩到 512（1024 的三张要 16 MB 显存）
    const m4 = m4gltf.scene; m4.traverse((o) => { if (o.isMesh) { o.castShadow = true; for (const m of [o.material].flat()) { if (m.emissive) m.emissiveIntensity = 0; m.envMapIntensity = 1.5; if (tierId !== 'ultra') for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (m[k]) shrinkTex(m[k], 512); } } });
    const box = new THREE.Box3().setFromObject(m4), sz = box.getSize(V()), len = Math.max(sz.x, sz.y, sz.z);
    m4.scale.setScalar(0.9 / len); squad[1].aim.add(m4);
  }

  // ---- 直升机（游戏里的撤离直升机 + 模糊旋翼、短翼）+ 探照灯（真灯 + 体积光柱 + 镜头眩光）
  const heli = createRideVehicle({ vehicle: { kind: 'helicopter', x: 0, z: 0, yaw: 0 }, y: 0 });
  heli.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material?.envMapIntensity != null) o.material.envMapIntensity = 1.4; } });
  scene.add(heli.root);
  const heliFx = upgradeHeli(heli);
  heli.update(3, { ready: true, board: 0 }); heli.update(3, { ready: true, board: 0 });
  const downwash = buildDownwash(scene, Q.rain > 6000 ? 700 : 350);
  const beam = {};
  { const housing = new THREE.Group(); housing.position.set(0, 0.35, 2.1); heli.body.add(housing); beam.housing = housing;
    // 灯头只略超 Bloom 门槛：太亮的点被 Bloom 的截断高斯糊成一块方形的白斑；外面的圆光晕交给下面的 glow 精灵
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.9, 1.75) })); lens.position.z = 0.01; housing.add(lens);
    // 航行灯：一颗小亮点 + 很窄的一圈晕（以前 0.7 米的光斑贴在机舱侧面，像一大团绿雾）；装在短翼尖上
    const nav = (c, x, y, z, size = 0.22) => { const s = glowSprite(c, size, 2.2); s.position.set(x, y, z); heli.body.add(s); return s; };
    beam.navR = nav(0xff2010, -2.02, 1.3, -0.3); beam.navG = nav(0x20ff60, 2.02, 1.3, -0.3); beam.strobe = nav(0xffffff, 0, 2.9, -5.5, 0.3);
    // 探照灯不投影（再来一张阴影图等于把整个场景多画一遍）；地上的影子由月光那一张给
    const sp = new THREE.SpotLight(0xeaf2ff, 0, 0, 0.14, 0.95, 0);
    scene.add(sp); scene.add(sp.target); beam.spot = sp;
    const g = new THREE.CylinderGeometry(0.004, Math.tan(0.14) + 0.004, 1, 48, 24, true); g.translate(0, -0.5, 0);
    beam.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uT: { value: 0 }, uI: { value: 1 }, uCam: { value: V() }, uGround: { value: R0 } },
      vertexShader: 'varying float vA; varying vec3 vW; varying vec3 vN; void main(){ vA = -position.y; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
      // 着色器里：光柱扎进地面 / 屋面的地方：离地 3 米内淡出，不留一道硬边
      fragmentShader: `varying float vA; varying vec3 vW; varying vec3 vN; uniform float uT, uI, uGround; uniform vec3 uCam;
        float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
        float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y), mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y), f.z); }
        void main(){
          vec3 v = normalize(uCam - vW); float fr = pow(abs(dot(normalize(vN), v)), 2.0);
          float a = clamp(vA, 0., 1.);
          float fall = pow(1.0 - a, 1.2) * smoothstep(0.0, 0.03, a) * smoothstep(1.0, 0.8, a);
          float dust = 0.55 + 0.6 * n3(vW * 0.35 + vec3(0., uT * 1.5, uT*0.3)) + 0.35 * n3(vW * 1.3 - vec3(0., uT * 6., 0.));
          float nearFade = smoothstep(1.5, 9.0, length(uCam - vW));

          float ground = smoothstep(uGround, uGround + 3.0, vW.y);
          gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * fr * fall * dust * uI * nearFade * ground * 0.24, 1.0);
        }`,
    });
    beam.cone = new THREE.Mesh(g, beam.mat); beam.cone.frustumCulled = false; beam.cone.renderOrder = 5; scene.add(beam.cone);
    const GLOW = (() => { const t = softTex().clone(); return t; })();
    const STREAK = (() => { const W = 512, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H; const x2 = c.getContext('2d'), img = x2.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2), v = Math.exp(-dy * dy * 40) * Math.pow(1 - Math.min(1, Math.abs(dx)), 2.2), i = (y * W + x) * 4; img.data[i] = 150 * v; img.data[i + 1] = 200 * v; img.data[i + 2] = 255 * v; img.data[i + 3] = 255; }
      x2.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    beam.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    beam.streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: STREAK, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    beam.glow.renderOrder = beam.streak.renderOrder = 9; scene.add(beam.glow); scene.add(beam.streak); }

  // ---- 雨、溅水、火星
  const rain = buildRain(scene, Q.rain);
  const splash = buildSplashes(scene, Q.splash);
  const sparks = buildSparks(scene, Q.rain > 6000 ? 260 : 120);

  // ---- 商场门口：幕墙、破门里透出的应急灯、招牌、翻倒烧着的车、警车警灯、湿地面倒影、碎纸
  const street = new THREE.Group(); street.position.copy(STR); scene.add(street);
  const streetFx = {};
  {
    const sg = new THREE.MeshStandardMaterial({ map: concrete.map.clone(), normalMap: concrete.normalMap.clone(), color: 0x8a8c8e, roughness: 1, metalness: 0, envMapIntensity: 1.6 });
    for (const t of [sg.map, sg.normalMap]) { t.repeat.set(30, 30); t.needsUpdate = true; }
    const pudMask = (() => { const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), r = rng(31), img = g.createImageData(S, S);
      const grid = Array.from({ length: 17 * 17 }, () => r());
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = (x / S) * 16, v = (y / S) * 16, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j, s = (q) => q * q * (3 - 2 * q), at = (a, b) => grid[(b % 16) * 17 + (a % 16)];
        const n = lerp(lerp(at(i, j), at(i + 1, j), s(fx)), lerp(at(i, j + 1), at(i + 1, j + 1), s(fx)), s(fy)); const k = (y * S + x) * 4; const rr = clamp(0.75 - clamp((n - 0.45) * 4) * 0.7) * 255; img.data[k] = img.data[k + 1] = img.data[k + 2] = rr; img.data[k + 3] = 255; }
      g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
    sg.roughnessMap = pudMask.clone(); sg.roughnessMap.repeat.set(6, 6); sg.roughnessMap.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), sg); ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0.02, 20); ground.receiveShadow = true; street.add(ground);
    if (Q.reflect) {
      const [w, h] = size();
      const refl = new Reflector(new THREE.PlaneGeometry(120, 120), { textureWidth: Math.round(w * DPR * REFL), textureHeight: Math.round(h * DPR * REFL), clipBias: 0.003, shader: WET_REFLECT, multisample: 0 });
      refl.material.transparent = true; refl.material.depthWrite = false; refl.material.uniforms.tMask.value = pudMask; refl.material.uniforms.uStr.value = 0.6;
      refl.rotation.x = -Math.PI / 2; refl.position.set(0, 0.04, 20); refl.visible = false; refl.renderOrder = 1; street.add(refl); streetFx.refl = refl;
      // 倒影只照商场门口这条街：画倒影那一遍把楼顶和远景楼群藏起来（看不到，白白多一倍绘制调用）
      const rb = refl.onBeforeRender;
      // 镜头眩光（探照灯正对镜头的光晕、横条）是贴着镜头的东西，倒影里不该有：一起藏起来
      refl.onBeforeRender = function (...args) { const cv = city.visible, rv = roof.visible, gv = beam.glow.visible; city.visible = roof.visible = beam.glow.visible = beam.streak.visible = false; rb.apply(this, args); city.visible = cv; roof.visible = rv; beam.glow.visible = beam.streak.visible = gv; };
    }
    // 商场正立面：幕墙贴图 + 一大块被砸开、里面亮着应急灯的入口
    const ft = facadeTex(57, 'mall', 512);
    ft.emissiveMap.dispose(); // 商场停电：幕墙后面没有亮灯（之前随机亮的一格像一块悬空的橙色牌子），不要自发光图
    for (const t of [ft.map, ft.roughnessMap]) { t.repeat.set(4, 1.6); t.needsUpdate = true; }
    const facade = new THREE.Mesh(new THREE.PlaneGeometry(124, 30), new THREE.MeshStandardMaterial({ map: ft.map, roughnessMap: ft.roughnessMap, metalness: 0.3, envMapIntensity: 1.4 }));
    facade.position.set(0, 15, 40); facade.rotation.y = Math.PI; street.add(facade);
    const mass = new THREE.Mesh(new THREE.BoxGeometry(124, 30, 60), new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.9 })); mass.position.set(0, 15, 70.2); street.add(mass);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 3), new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.5, metalness: 0.6 })); canopy.position.set(0, 6.2, 37); canopy.castShadow = true; street.add(canopy);
    // 破门里面：停电的商场大堂（不再是一整块发白的亮板）——吊顶上一排应急灯管、往里越来越暗、
    // 倒下的货架和柱子的剪影、地上的反光；只有灯管和它照到的一圈亮，其余是暗青绿
    { const W = 1024, H = 256, [c, g] = (() => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; })(), r = rng(71);
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2c5a4c'); bg.addColorStop(0.35, '#183830'); bg.addColorStop(0.75, '#0b1a17'); bg.addColorStop(1, '#1c3a32'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // 往里的透视：两侧的柱子一根比一根小、一根比一根暗
      for (let k = 0; k < 7; k++) { const sc = 1 - k * 0.12, a = 0.85 - k * 0.1; for (const sx of [-1, 1]) { g.fillStyle = `rgba(4,10,9,${a})`; g.fillRect(W / 2 + sx * (W * 0.46 * sc) - 14 * sc, H * (0.5 - 0.45 * sc), 28 * sc, H * 0.9 * sc); } }
      // 吊顶上的应急灯管（几根坏了）+ 照在地上的一圈
      for (let k = 0; k < 12; k++) { if (r() < 0.3) continue; const x = 40 + k * 82 + r() * 20, y = 18 + r() * 22, w = 50 + r() * 30;
        g.fillStyle = 'rgba(200,255,230,0.95)'; g.fillRect(x, y, w, 4);
        const lg = g.createRadialGradient(x + w / 2, y, 0, x + w / 2, y, 90); lg.addColorStop(0, 'rgba(140,255,210,0.35)'); lg.addColorStop(1, 'rgba(140,255,210,0)'); g.fillStyle = lg; g.fillRect(x - 90, y - 90, w + 180, 180);
        const fg = g.createRadialGradient(x + w / 2, H * 0.93, 0, x + w / 2, H * 0.93, 70); fg.addColorStop(0, 'rgba(120,230,190,0.25)'); fg.addColorStop(1, 'rgba(120,230,190,0)'); g.fillStyle = fg; g.fillRect(x - 70, H * 0.8, w + 140, H * 0.2); }
      // 倒了的货架、推车、堆着的纸箱的剪影
      for (let k = 0; k < 14; k++) { const x = r() * W, w = 30 + r() * 110, h = 20 + r() * 80, y = H * 0.92 - h; g.save(); g.translate(x, y + h); g.rotate((r() - 0.5) * 0.5); g.fillStyle = `rgba(3,8,7,${0.7 + r() * 0.3})`; g.fillRect(-w / 2, -h, w, h); g.fillStyle = 'rgba(80,140,120,0.18)'; for (let q = 1; q < 4; q++) g.fillRect(-w / 2, -h + (h * q) / 4, w, 2); g.restore(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const dg = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.8), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(0.75, 0.75, 0.75) })); dg.position.set(0, 2.9, 39.9); dg.rotation.y = Math.PI; street.add(dg); }
    const mulMat = new THREE.MeshStandardMaterial({ color: 0x1c1f22, metalness: 0.7, roughness: 0.4 });
    for (let i = -5; i <= 5; i++) { const mul = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.8, 0.3), mulMat); mul.position.set(i * 2.2, 2.9, 39.7); mul.rotation.z = i === 2 ? 0.25 : i === -3 ? -0.18 : 0; street.add(mul); }
    const doorLight = new THREE.SpotLight(0x9dffd8, 4, 80, 0.7, 0.9, 1.0); doorLight.position.set(0, 4.5, 42); doorLight.target.position.set(0, 0, 4); street.add(doorLight); street.add(doorLight.target);
    // 招牌「云澜」：霓虹管坏了一半，闪
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 256; const sx = sc.getContext('2d');
    sx.fillStyle = '#000'; sx.fillRect(0, 0, 1024, 256);
    sx.font = `170px "${TITLE_FONT_FAMILIES.brush}", serif`; sx.textBaseline = 'middle';
    let gx = 90; for (const [ch, on] of [['云', 1], ['澜', 1]]) { sx.shadowColor = 'rgba(255,60,40,0.9)'; sx.shadowBlur = on ? 26 : 0; sx.fillStyle = on ? 'rgb(255,80,60)' : 'rgb(50,14,12)'; sx.fillText(ch, gx, 130); gx += 190; }
    // 英文一行：霓虹管，第二个 L 坏了（暗着）
    sx.font = `64px "${TITLE_FONT_FAMILIES.latin}", sans-serif`; let ex = 560;
    // 坏的那个 L 单独画在另一张透明图上（同样的位置），自己一跳一跳地闪：灭的时候也留一点暗红的灯管，看得出是坏灯不是错别字
    const lc = document.createElement('canvas'); lc.width = 1024; lc.height = 256; const lx = lc.getContext('2d'); lx.font = sx.font; lx.textBaseline = 'middle';
    for (const [i, ch] of [...'YUNLAN MALL'].entries()) {
      const dead = i === 10;
      if (dead) { lx.shadowColor = 'rgba(255,90,60,0.9)'; lx.shadowBlur = 16; lx.fillStyle = 'rgb(255,135,105)'; lx.fillText(ch, ex, 132); sx.shadowBlur = 0; sx.fillStyle = 'rgb(95,32,24)'; sx.fillText(ch, ex, 132); }
      else { sx.shadowColor = 'rgba(255,90,60,0.9)'; sx.shadowBlur = 16; sx.fillStyle = 'rgb(255,135,105)'; sx.fillText(ch, ex, 132); }
      ex += sx.measureText(ch).width + 2;
    }
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
    streetFx.sign = new THREE.MeshBasicMaterial({ map: st, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.8, 1.8, 1.8) });
    streetFx.signL = new THREE.MeshBasicMaterial({ map: lt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0, 0, 0) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(36, 9), streetFx.sign); sign.position.set(0, 9.2, 39.5); sign.rotation.y = Math.PI; street.add(sign);
    const signL = new THREE.Mesh(sign.geometry, streetFx.signL); signL.position.set(0, 9.2, 39.45); signL.rotation.y = Math.PI; street.add(signL);
    // 车：侧面轮廓挤出来（引擎盖、风挡斜面、车顶、行李箱，轮拱是圆的）、玻璃车厢、轮胎 + 轮毂；翻倒烧着的那辆漆面烧黑
    const carM = grime(new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: 0.32, metalness: 0.7, envMapIntensity: 1.5 }), { scale: 1.2, amt: 0.45, edge: 0.2, rough: 0.25, wet: 0.5 });
    const burnt = grime(new THREE.MeshStandardMaterial({ color: 0x2a2522, roughness: 0.75, metalness: 0.4, envMapIntensity: 0.8 }), { scale: 1.5, amt: 1, edge: 0.5, rough: 0.4 });
    const carGlass = new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.05, metalness: 0.9, envMapIntensity: 2 });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }), rim = new THREE.MeshStandardMaterial({ color: 0x8a8e92, roughness: 0.35, metalness: 0.9 });
    const extr = (pts, width, bevel = 0.06) => { const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
      g.rotateY(-Math.PI / 2); g.translate(width / 2 - bevel, 0, 0); return g; };
    const bodyShape = () => { const sh = new THREE.Shape(); sh.moveTo(-2.2, 0.32);
      sh.lineTo(-1.82, 0.32); sh.absarc(-1.38, 0.36, 0.44, Math.PI, 0, true); sh.lineTo(0.98, 0.32); sh.absarc(1.42, 0.36, 0.44, Math.PI, 0, true);
      sh.lineTo(2.18, 0.32); sh.lineTo(2.28, 0.55); sh.lineTo(2.22, 0.78); sh.lineTo(1.25, 0.9); sh.lineTo(-1.65, 0.97); sh.lineTo(-2.2, 0.9); sh.lineTo(-2.3, 0.62); sh.lineTo(-2.2, 0.32);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 1.72, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.08, bevelSegments: 2, curveSegments: 10 });
      g.rotateY(-Math.PI / 2); g.translate(0.86, 0, 0); return g; };
    const carShape = (grp, flip, mat = carM) => {
      const inner = new THREE.Group(); if (flip) inner.rotation.z = Math.PI; grp.add(inner);
      inner.add(new THREE.Mesh(bodyShape(), mat));
      inner.add(new THREE.Mesh(extr([[-1.6, 0.92], [1.08, 0.9], [0.32, 1.38], [-1.18, 1.41], [-1.75, 0.98]], 1.56, 0.04), carGlass));
      inner.add(new THREE.Mesh(extr([[-1.22, 1.38], [0.36, 1.36], [0.3, 1.45], [-1.16, 1.47]], 1.62, 0.03), mat));
      const wg = [], rg = [];
      for (const [x, z] of [[-0.86, 1.42], [0.86, 1.42], [-0.86, -1.38], [0.86, -1.38]]) {
        const w = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 20); w.rotateZ(Math.PI / 2); w.translate(x, 0.36, z); wg.push(w);
        const r2 = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 12); r2.rotateZ(Math.PI / 2); r2.translate(x * 1.01, 0.36, z); rg.push(r2);
      }
      inner.add(new THREE.Mesh(mergeGeometries(wg), tyre)); inner.add(new THREE.Mesh(mergeGeometries(rg), rim)); wg.concat(rg).forEach((g) => g.dispose());
      grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    };
    const car = new THREE.Group(); car.position.set(9, 0, 22); car.rotation.set(0, 0.7, 2.6); carShape(car, true, burnt); street.add(car);
    const fire = new THREE.Group(); fire.position.set(9, 0.6, 22); fire.scale.setScalar(2.6); buildFire(fire); street.add(fire);
    fire.traverse((o) => { if (o.material?.uniforms?.uTime) fireMats.push(o.material); });
    // 车身里外三处火（车头机舱、车厢里从破窗往外窜、车尾），车身上一片片烧红的漆皮，顶上一柱被火映红的黑烟
    for (const [x, y, z, sc] of [[7.6, 0.4, 21.2, 1.5], [10.2, 0.5, 23.1, 1.3]]) { const f2 = new THREE.Group(); f2.position.set(x, y, z); f2.scale.setScalar(sc); buildFire(f2); street.add(f2); f2.traverse((o) => { if (o.material?.uniforms?.uTime) fireMats.push(o.material); }); }
    for (const [x, y, z, sz] of [[8.4, 0.9, 21.6, 1.1], [9.8, 1.2, 22.7, 0.9], [9.1, 0.4, 23.4, 1.3], [8.0, 1.4, 22.4, 0.8]]) { const e = glowSprite(0xff5a18, sz, 2.4); e.position.set(x, y, z); street.add(e); }
    streetFx.smoke = buildSmokePlumes(street, [[9, 24, 14, 2.5]]);
    const fl = new THREE.PointLight(0xff7a2a, 12, 45, 1.4); fl.position.set(9, 2.5, 22); street.add(fl); flareLights.push(fl);
    const fl2 = new THREE.PointLight(0xff8a3a, 6, 14, 1.6); fl2.position.set(7.0, 1.2, 20.5); street.add(fl2); flareLights.push(fl2);
    const pc = new THREE.Group(); pc.position.set(-6, 0, 13); pc.rotation.y = -0.7; carShape(pc, false); street.add(pc);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: 0x222 })); bar.position.set(0, 1.53, -0.4); pc.add(bar);
    const barR = glowSprite(0xff1508, 0.8), barB = glowSprite(0x1530ff, 0.8); barR.position.set(-0.4, 1.62, -0.4); barB.position.set(0.4, 1.62, -0.4); pc.add(barR); pc.add(barB);
    const bs = new THREE.SpotLight(0xff1a0a, 7, 60, 0.5, 0.6, 1.0); bs.position.set(0, 2, 0); pc.add(bs); pc.add(bs.target);
    const pl = new THREE.PointLight(0xff1a0a, 2.2, 25, 1.2); pl.position.set(0, 2.2, 0); pc.add(pl);
    Object.assign(streetFx, { barR, barB, spot: bs, pl, pc });
    // 路灯杆（灭了）、隔离墩、垃圾
    const pole = new THREE.MeshStandardMaterial({ color: 0x3a3d40, metalness: 0.7, roughness: 0.4 });
    for (const z of [-20, 0, 20]) for (const x of [-22, 22]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 9, 8), pole); p.position.set(x, 4.5, z); p.castShadow = true; street.add(p); const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.2), pole); arm.position.set(x - Math.sign(x) * 1.1, 8.9, z); street.add(arm); }
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x8c8a82, roughness: 0.8 });
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 0.5), barrierMat); b.position.set(-14 + i * 2.3, 0.4, 6 + (i % 2) * 0.4); b.rotation.y = (i - 2) * 0.12; b.castShadow = b.receiveShadow = true; street.add(b); }
    const fogM = new THREE.MeshBasicMaterial({ map: softTex(), color: new THREE.Color(0.06, 0.08, 0.09), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    // 贴地的雾片：16 片合成一个网格（一次绘制）
    { const fr = rng(19), list = []; for (let i = 0; i < 16; i++) { const g = new THREE.PlaneGeometry(30, 6); g.translate((fr() - 0.5) * 50, 1.2 + fr(), 40 - i * 4); list.push(g); }
      const f = new THREE.Mesh(mergeGeometries(list), fogM); list.forEach((g) => g.dispose()); f.frustumCulled = false; street.add(f); }
    streetFx.debris = buildDebris(street, 36);
  }
  step('召集尸群', 0.66);

  // ---- 丧尸：三种动作（走、扑、踉跄），体型 0.9–1.15，街上一大群从商场门里涌出来，楼顶一群朝机枪逼近
  const zs = [];
  if (kit) {
    const r = rng(101);
    const gaitOf = (i) => (i % 5 === 0 ? 'lunge' : i % 4 === 1 ? 'stagger' : 'walk');
    for (let i = 0; i < Q.horde; i++) {
      const z = kit.create(); z.setLook(i, i % 13 === 5 ? 'lunger' : i % 17 === 3 ? 'brute' : i % 6 === 2 ? 'pale' : i % 11 === 7 ? 'spitter' : null);
      const s = 0.9 + r() * 0.25; z.group.scale.set(s * (0.96 + r() * 0.1), s, s);
      street.add(z.group);
      zs.push({ z, where: 'street', gait: gaitOf(i), lane: (r() - 0.5) * 2, speed: 0.9 + r() * 0.8, off: r(), sway: r() * 6 });
    }
    for (let i = 0; i < Q.roofZ; i++) {
      const z = kit.create(); z.setLook(i + 3, i === 2 ? 'lunger' : i === 7 ? 'brute' : i % 5 === 1 ? 'pale' : null);
      const s = 0.9 + r() * 0.25; z.group.scale.set(s, s, s);
      roof.add(z.group);
      zs.push({ z, where: 'roof', gait: gaitOf(i + 2), i, off: r(), lat: r(), speed: 0.8 + r() * 1.4, sway: r() * 6 });
    }
  }
  // 开场里的丧尸再「病」一点：皮肤和衣服整体压成灰绿、发暗，再在原来的着色器后面叠一层——
  // 成片的泥污（衣服下摆、裤腿更脏）、干了的黑红血块、被撕破处的暗斑；看着是一群感染者，不是一街穿 Polo 衫的路人
  { const seen = new Set();
    const sicken = (m) => {
      if (seen.has(m)) return; seen.add(m);
      m.color.setRGB(0.62, 0.68, 0.58);
      const base = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        base?.call(m, sh, r);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vZP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvZP = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vZP;
          float zh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          float zn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
            return mix(mix(mix(zh(i), zh(i + vec3(1,0,0)), f.x), mix(zh(i + vec3(0,1,0)), zh(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(zh(i + vec3(0,0,1)), zh(i + vec3(1,0,1)), f.x), mix(zh(i + vec3(0,1,1)), zh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
          .replace('#include <map_fragment>', `#include <map_fragment>
          { float n1 = zn(vZP * 9.) * 0.6 + zn(vZP * 23.) * 0.4, n2 = zn(vZP * 6. + 17.) * 0.65 + zn(vZP * 31.) * 0.35;
            float low = 1. - smoothstep(0.2, 1.1, vZP.y);                       // 越往下越脏
            vec3 c = diffuseColor.rgb, gray = vec3(dot(c, vec3(0.3, 0.59, 0.11)));
            c = mix(c, gray * vec3(0.92, 1.0, 0.88), 0.45);                       // 褪色、发灰绿
            c *= mix(1., 0.5 + 0.5 * n1, 0.55 + 0.35 * low);                    // 泥污
            float blood = smoothstep(0.6, 0.72, n2) * (0.6 + 0.4 * smoothstep(0.9, 1.5, vZP.y));
            c = mix(c, vec3(0.16, 0.025, 0.02), blood * 0.85);                   // 干了的血块（胸口、领口多）
            diffuseColor.rgb = c; }`);
      };
      const key = m.customProgramCacheKey?.() || '';
      m.customProgramCacheKey = () => key + '-title-sick'; m.needsUpdate = true;
    };
    const visit = (g) => g.traverse((o) => { if (o.isMesh && o.material?.name === 'zombie-skin') sicken(o.material); });
    for (const q of zs) visit(q.z.group);
    // 有的外观（特殊感染者）要 setLook 后才挂上：把所有可能的材质都过一遍
    for (const look of ['lunger', 'brute', 'pale', 'spitter', null]) for (let k = 0; k < 6; k++) { const z = kit?.create(); if (!z) break; z.setLook(k, look); visit(z.group); }
  }
  // 眼睛：模型上每只丧尸两颗小球（各一次绘制调用，一百只就是两百次）换成一批点一次画完；每帧按丧尸的姿势算世界坐标
  const eyes = (() => {
    const list = [];
    for (const q of zs) for (const m of q.z.group.children) for (const e of m.children) { e.visible = false; list.push({ q, mesh: m, e }); }
    const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3), on = new Float32Array(list.length);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('on', new THREE.BufferAttribute(on, 1));
    const U = { uRes: { value: 1080 } };
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: `attribute vec3 color; attribute float on; uniform float uRes; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); float d = -mv.z;
          gl_PointSize = on * clamp(0.05 * projectionMatrix[1][1] * uRes * 0.5 / max(d, 0.5), 2.0, 14.); vC = color;
          gl_Position = projectionMatrix * mv; }`,
      // 着色器里：一颗亮芯 + 很小的一圈晕（远处只剩一个亮点）
      fragmentShader: `varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5) * 2.; if (r > 1.) discard; gl_FragColor = vec4(vC * (exp(-r * r * 18.) * 1.6 + exp(-r * r * 4.) * 0.25), 1.); }`,
    }));
    pts.frustumCulled = false; scene.add(pts);
    const w = V();
    return { pts, U, step() {
      for (let i = 0; i < list.length; i++) {
        const { q, mesh, e } = list[i], vis = q.z.group.visible && mesh.visible && q.z.group.parent.visible;
        on[i] = vis ? 1 : 0; if (!vis) continue;
        if (!q.done) { q.z.group.updateMatrixWorld(true); q.done = true; }
        e.getWorldPosition(w); pos[i * 3] = w.x; pos[i * 3 + 1] = w.y; pos[i * 3 + 2] = w.z;
        const c = e.material.color; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      for (const q of zs) q.done = false;
      g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.on.needsUpdate = true;
    } };
  })();
  const poseZombies = (T, hideRoof) => {
    for (const q of zs) {
      const ph0 = T * q.speed * 0.62 + q.off * 10;
      let lean = 0.36 + 0.06 * Math.sin(q.sway * 3), sway = Math.sin(T * 2 + q.sway) * 0.1 + Math.sin(q.sway * 5) * 0.06, lunge = 0, phase = ph0, moving = 1, adv = T * q.speed, side = 0;
      if (q.gait === 'lunge') { const pounce = Math.max(0, Math.sin(T * 2.6 + q.sway)); phase = ph0 * 1.5; lean = 0.5 + 0.25 * pounce; lunge = 0.3 + 0.7 * pounce; adv = T * q.speed * 1.5 + pounce * 0.4; }
      else if (q.gait === 'stagger') { phase = T * 0.45 * q.speed + 0.35 * Math.sin(T * 1.7 + q.sway) + q.off * 10; moving = 0.7; lean = 0.18 + 0.22 * Math.max(0, Math.sin(T * 0.9 + q.sway)); sway = Math.sin(T * 1.1 + q.sway) * 0.26; adv = T * q.speed * 0.55 + Math.sin(T * 1.3 + q.sway) * 0.3; side = Math.sin(T * 0.8 + q.sway) * 0.6; }
      if (q.where === 'street') {
        const span = 34, d = (q.off * span + adv) % span;
        const z = 38 - d, x = q.lane * (4 + d * 0.4) + Math.sin(T * 0.6 + q.sway) * 0.4 + side;
        q.z.group.position.set(x, 0, z); q.z.group.rotation.y = Math.PI + Math.atan2(-x * 0.02, 1) + Math.sin(q.sway) * 0.3;
        q.z.group.visible = d > 0.5;
      } else {
        const G = GUNNER, d = 27 - ((q.off * 21 + adv) % 21), lat = (q.lat - 0.5) * (5 + d * 0.55) + side;
        q.z.group.position.copy(G.p).addScaledVector(G.f, d).addScaledVector(G.right, lat).setY(R0);
        q.z.group.rotation.y = Math.atan2(-G.f.x, -G.f.z) + Math.sin(q.sway) * 0.3;
        q.z.group.visible = !hideRoof;
      }
      q.z.pose({ phase, moving, lean, sway, lunge });
    }
  };

  // ---- 后期链：场景（带深度）→ 景深 → Bloom → 调色
  const [w0, h0] = size();
  const rt = new THREE.WebGLRenderTarget(w0 * DPR, h0 * DPR, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(w0 * DPR, h0 * DPR) });
  const composer = new EffectComposer(renderer, rt);
  // 两张交替的缓冲各要一张自己的深度贴图（clone 出来的会共用同一份 GPU 贴图，景深读深度时成了读写同一张）
  composer.renderTarget2.depthTexture?.dispose(); composer.renderTarget2.depthTexture = new THREE.DepthTexture(w0 * DPR, h0 * DPR);
  composer.setPixelRatio(DPR); composer.setSize(w0, h0);
  composer.addPass(new RenderPass(scene, camera));
  const dof = new DofPass(camera); dof.enabled = false; composer.addPass(dof);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w0 * Q.bloom, h0 * Q.bloom), 0.7, 0.55, 0.9); composer.addPass(bloom);
  const grade = new ShaderPass(GRADE); composer.addPass(grade);
  const G = grade.uniforms; // ShaderPass 会复制 uniforms：一律写 pass.uniforms
  const setSizes = (w, h) => {
    renderer.setSize(w, h, false); composer.setSize(w, h);
    for (const t of [composer.renderTarget1, composer.renderTarget2]) if (t.depthTexture) { t.depthTexture.image.width = w * DPR; t.depthTexture.image.height = h * DPR; }
    bloom.setSize(w * DPR * Q.bloom, h * DPR * Q.bloom);
    dof.setSize(w * DPR, h * DPR);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    G.uAspect.value = w / h; G.uRes.value.set(w * DPR, h * DPR);
    rain.uniforms.uRes.value.set(w * DPR, h * DPR); rain.uniforms.uMinPx.value = 1.1 * DPR;
    splash.uniforms.uRes.value = h * DPR; sparks.uniforms.uRes.value = h * DPR; downwash.uniforms.uRes.value = h * DPR;
    cityFx.lampU.uRes.value = h * DPR; cityFx.glowU.uRes.value = h * DPR; eyes.U.uRes.value = h * DPR;
    if (streetFx.refl) streetFx.refl.getRenderTarget().setSize(Math.round(w * DPR * REFL), Math.round(h * DPR * REFL));
  };
  setSizes(w0, h0);
  step('编排镜头', 0.7);

  // ---------------------------------------------------------------- 镜头
  const portrait = () => camera.aspect < 1;
  const fitFov = (vfov) => {
    const a = camera.aspect, b = 16 / 9; if (a >= b) return vfov;
    const hz = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov) / 2) * b);
    return Math.min(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hz / 2) / a)), a < 1 ? 78 : 62);
  };
  // 手持晃动：几组不成倍数的正弦叠起来（逐帧可重复）
  const shake = (T, amp) => V(Math.sin(T * 1.31) * 0.6 + Math.sin(T * 2.93 + 1) * 0.3 + Math.sin(T * 7.1) * 0.06, Math.sin(T * 1.73 + 2) * 0.5 + Math.sin(T * 3.37) * 0.25, Math.sin(T * 1.11 + 4) * 0.4).multiplyScalar(amp);
  const look = (from, to, fov, roll = 0, amp = 0, T = 0) => {
    const s = shake(T, amp); camera.position.copy(from).add(s); camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(to.clone().addScaledVector(s, 0.6)); camera.fov = fitFov(fov); camera.updateProjectionMatrix();
  };
  const tmp = V(), tmp2 = V(), NEGY = V(0, -1, 0);
  const setHeli = (pos, yaw, pitch, roll, target, T, intensity = 1, groundY = R0) => {
    heli.setPose({ x: pos.x, y: pos.y, z: pos.z, yaw, pitch, roll }, Math.sin(T * 1.7) * 0.15);
    heli.root.updateMatrixWorld(true);
    heliFx.uniforms.uT.value = T;
    const o = beam.housing.getWorldPosition(V()), dir = tmp.copy(target).sub(o), L = dir.length(); dir.normalize();
    const sp = beam.spot; sp.position.copy(o); sp.target.position.copy(target); sp.intensity = 4.5 * intensity; sp.target.updateMatrixWorld();
    beam.cone.position.copy(o); beam.cone.quaternion.setFromUnitVectors(NEGY, dir); beam.cone.scale.set(L, L * 1.15, L);
    Object.assign(beam.mat.uniforms.uI, { value: intensity }); beam.mat.uniforms.uT.value = T; beam.mat.uniforms.uCam.value.copy(camera.position); beam.mat.uniforms.uGround.value = groundY;
    const toCam = tmp2.copy(camera.position).sub(o), dc = toCam.length(); toCam.normalize();
    const k = Math.pow(Math.max(0, dir.dot(toCam)), 28) * intensity, lensP = o.clone().addScaledVector(toCam, 0.4), bs = dc * 0.02;
    beam.glow.position.copy(lensP); beam.streak.position.copy(lensP);
    // 正对镜头时的光晕收着：只比灯头大一圈，不把整架直升机糊成一个白盘
    beam.glow.scale.setScalar(bs * (0.7 + 3.6 * k)); beam.glow.material.color.setScalar(0.45 + 1.2 * k);
    beam.streak.scale.set(bs * (3 + 40 * k), bs * (0.15 + 1.2 * k), 1); beam.streak.material.color.setScalar(0.1 + 0.8 * k);
    beam.strobe.visible = (T * 1.3) % 1 < 0.08;
    rain.uniforms.uBeamO.value.copy(o); rain.uniforms.uBeamD.value.copy(dir); rain.uniforms.uBeamI.value = intensity;
    downwash.uniforms.uC.value.copy(pos); downwash.uniforms.uY.value = groundY; downwash.uniforms.uT.value = T;
  };
  let hmgKick = 0; // 这一帧机枪有没有在打（机枪手肩膀跟着抖）
  const fireHmg = (T, heavy) => {
    const rate = 8, ph = (T * rate) % 1, side = Math.floor(T * rate) % 2;
    // 连射一阵、停一下（heavy：一直打，但每发之间火光只占不到三成的时间）
    const burst = heavy ? (Math.sin(T * 1.9) > -0.55 ? 1 : 0) : (Math.sin(T * 0.9) > 0.2 ? 1 : 0);
    const on = !!burst && ph < 0.28;
    hmgKick = on ? 1 - ph / 0.28 : 0;
    flashes.forEach((f, i) => { f.visible = on && i === side; f.rotation.z = (T * 17.3 + i) % 6.28; f.scale.setScalar(0.8 + 0.4 * ((T * 13.7) % 1)); });
    muzzleLight.intensity = burst ? (on ? 4.5 : 0.6) : 0;
    hmg.muzzles[side].getWorldPosition(muzzleLight.position); muzzleLight.position.y += 0.3; roof.worldToLocal(muzzleLight.position);
    hmg.pitchG.rotation.x = 0.03 + Math.sin(T * 0.7) * 0.02; if (hmg.yawG) hmg.yawG.rotation.y = -0.32 + Math.sin(T * 0.4) * 0.06;
    hmg.barrels?.forEach((b, i) => { b.position.z = i === side && ph < 0.3 && burst ? -0.05 : 0; });
    const mz = hmg.muzzles[0].getWorldPosition(V()), q = hmg.muzzles[0].getWorldQuaternion(new THREE.Quaternion()), fwd = V(0, 0, 1).applyQuaternion(q);
    tracers.forEach((t, i) => { const d = ((T * rate + i) % tracers.length) / tracers.length; t.position.copy(mz).addScaledVector(fwd, 3 + d * 120); roof.worldToLocal(t.position); t.quaternion.copy(q); t.visible = !!burst && (i % 2 === 0 || heavy); });
    // 打在尸群里迸火星
    sparks.uniforms.uOn.value = burst ? 1 : 0;
    sparks.uniforms.uO.value.forEach((p, i) => { p.copy(mz).addScaledVector(fwd, 14 + i * 3 + Math.sin(T * 3 + i) * 2); p.y = R0 + 0.3 + (i % 2) * 0.8; });
    return burst;
  };

  // 每帧的「默认值」：各镜头只改自己要的
  const reset = () => {
    G.uBars.value = 1; G.uFade.value = 0; G.uWhite.value = 0; G.uRed.value = 0; G.uExp.value = 1; G.uLift.value = 1; G.uDrops.value = 0; G.uVig.value = 1;
    scene.fog.density = 0.006; scene.fog.color.copy(FOG); renderer.shadowMap.autoUpdate = true;
    rain.uniforms.uAmt.value = 1; rain.uniforms.uBox.value = 40; rain.uniforms.uPt.value.set(0, -999, 0); rain.uniforms.uAmb.value = 0.45;
    splash.points.visible = false; sparks.points.visible = false; sparks.uniforms.uOn.value = 0;
    downwash.uniforms.uAmt.value = 0;
    flashes.forEach((f) => { f.visible = false; }); muzzleLight.intensity = 0; tracers.forEach((t) => { t.visible = false; });
    gunRim.intensity = 0; dof.enabled = false; dof.uniforms.uAperture.value = 0;
    bloom.threshold = 0.9; bloom.strength = 0.7; bloom.radius = 0.55;
    if (streetFx.refl) streetFx.refl.visible = false;
    hemi.intensity = 0.75; moon.intensity = 1.6; scene.environmentIntensity = 0.35; fill.intensity = 0;
  };

  let lastShot = '';
  /** 画场景时间 T 这一帧（不含 render） */
  const frame = (T) => {
    const { shot, local: u } = sampleShot(TIMELINE.full, T), name = shot.id;
    lastShot = name;
    sky.uniforms.uT.value = T; rain.uniforms.uT.value = T; rain.uniforms.uCam.value.copy(camera.position);
    G.uT.value = Math.floor(T * 24) / 24; smoke.uniforms.uT.value = T;
    splash.uniforms.uT.value = T; sparks.uniforms.uT.value = T;
    fireStep(fireMats, T);
    reset(); hmgKick = 0;
    poseZombies(T, T >= TITLE_START);
    for (const [i, s] of apt.beacons.entries()) s.visible = Math.sin(T * 2.6 + i) > -0.2;
    cityFx.glowU.uT.value = T;
    for (const [i, l] of flareLights.entries()) l.intensity = (i < 3 ? 2.2 : i === 3 ? 12 : 6) * (0.78 + 0.22 * Math.sin(T * 13 + i * 2.1) * Math.sin(T * 7.3 + i));
    streetFx.smoke.uniforms.uT.value = T;
    { const a = T * 9, red = Math.sin(a) > 0; streetFx.barR.material.opacity = 0.5 + 0.5 * Math.max(0, Math.sin(a)); streetFx.barB.material.opacity = 0.5 + 0.5 * Math.max(0, -Math.sin(a));
      streetFx.spot.target.position.set(Math.sin(a) * 10, 0, Math.cos(a) * 10); streetFx.spot.color.setHex(red ? 0xff1a0a : 0x1a2aff); streetFx.pl.color.copy(streetFx.spot.color); }
    streetFx.sign.color.setScalar((Math.sin(T * 31) > 0.7 || Math.sin(T * 7.3) > 0.95) ? 0.5 : 1.8);
    { const f = Math.sin(T * 23.7) * Math.sin(T * 5.1 + 1.3); streetFx.signL.color.setScalar(f > 0.55 ? 1.6 : f > 0.3 ? 0.55 : 0); } // 坏灯：大半时间灭着，隔一阵抽搐两下
    streetFx.debris.step(T);
    let lightning = 0;

    if (name === 'aerial') {
      // 高空俯冲：穿过雨幕，压向停电的城市；公寓楼在画面中间，楼顶一道探照灯
      const e = sm(0, 1, u);
      look(V(lerp(-200, -150, e), lerp(150, 112, e), lerp(215, 165, e)), V(lerp(20, 12, e), lerp(98, 86, e), lerp(-10, -6, e)), 34, 0.02 * Math.sin(T * 0.4) - 0.025, 0.25, T);
      setHeli(V(lerp(-40, -30, u), R0 + 42, lerp(40, 30, u)), -2.3 + u * 0.3, 0.18, 0.06, V(lerp(-6, 4, u) + Math.sin(T * 0.9) * 3, R0, lerp(4, 14, u)), T, 1.9);
      beam.spot.intensity *= 0.5; // 楼顶上的尸群只被光柱擦到，不是一把白点
      scene.fog.density = 0.0019; rain.uniforms.uBox.value = 60; rain.uniforms.uAmb.value = 0.6;
      lightning = Math.max(0, 1 - Math.abs(T - 2.2) * 6) + Math.max(0, 1 - Math.abs(T - 2.6) * 10) * 0.7;
      G.uExp.value = 1.45; bloom.threshold = 0.85; bloom.strength = 0.75;
    } else if (name === 'horde') {
      // 商场门口贴地低机位：尸潮从亮着应急灯的破门里涌向镜头，红蓝警灯、烧着的车、湿地面倒影
      const e = sm(0, 1, u);
      look(V(STR.x + lerp(3.5, 2.0, e), lerp(0.45, 0.7, e), STR.z + lerp(-4, -1, e)), V(STR.x + lerp(-1.5, -0.5, e), 5.2, STR.z + 38), 40, -0.05, 0.03, T);
      setHeli(V(STR.x + lerp(-40, 20, u), 46, STR.z + 24), Math.PI / 2, 0.1, -0.1, V(STR.x + lerp(-16, 8, u), 0, STR.z + 30), T, 1.3, 0);
      scene.fog.density = 0.0065; rain.uniforms.uPt.value.copy(streetFx.pc.getWorldPosition(V())).setY(2); rain.uniforms.uBox.value = 26;
      splash.points.visible = true; splash.uniforms.uY.value = 0; splash.uniforms.uBox.value = 16; splash.uniforms.uCam.value.copy(camera.position);
      if (streetFx.refl) streetFx.refl.visible = true;
      renderer.shadowMap.autoUpdate = false; // 月光阴影图只罩着公寓楼顶，这一镜用不上，不重画
      G.uRed.value = 0.04; G.uExp.value = Q.reflect ? 1.0 : 1.3; G.uDrops.value = 0.2; bloom.threshold = 1.0; bloom.strength = 0.5; rain.uniforms.uAmb.value = 0.3; // 没有倒影的档地面暗一截，曝光补回来
    } else if (name === 'roof') {
      // 楼顶死守：从机枪手肩后看出去，双联重机枪对着尸群打；前景沙袋虚掉，尸群被直升机探照灯逆光照出轮廓
      const e = sm(0, 1, u), Gn = GUNNER;
      // 机位压低在沙袋墙外、枪的左后侧：双联重机枪的机匣、两根粗枪管、弹药箱是画面左边的主体（3/4 侧后方，枪身轮廓完整），
      // 枪管指向画面纵深里涌过来的尸群；最近的沙袋虚成前景，机枪手在枪后半掩着
      const gun = V(EMP.x, R0 + 1.2, EMP.z);
      const from = gun.clone().addScaledVector(Gn.right, lerp(-2.5, -2.3, e)).addScaledVector(Gn.back, lerp(2.3, 2.0, e)).setY(R0 + lerp(1.7, 1.6, e));
      const to = gun.clone().addScaledVector(Gn.f, 6).addScaledVector(Gn.right, lerp(2.6, 2.3, e)).setY(R0 + 0.9);
      look(from, to, 38, 0.025, 0.03, T);
      const tg = Gn.p.clone().addScaledVector(Gn.f, 19).setY(R0), hp = Gn.p.clone().addScaledVector(Gn.f, 42).addScaledVector(Gn.right, 6).setY(R0 + 14);
      setHeli(hp, Math.atan2(tg.x - hp.x, tg.z - hp.z), 0.3, 0.05, tg.add(V(Math.sin(T * 0.8) * 1.5, 0, 0)), T, 1.6);
      fireHmg(T, true); sparks.points.visible = true;
      gunRim.intensity = 14;
      scene.fog.density = 0.01; rain.uniforms.uBox.value = 18;
      splash.points.visible = true; splash.uniforms.uY.value = R0; splash.uniforms.uBox.value = 12; splash.uniforms.uCam.value.copy(camera.position);
      // 对焦在尸群上，前景的枪和沙袋虚一点（仍看得出形状），镜头里慢慢往远处推一点焦
      dof.enabled = Q.dof; dof.uniforms.uFocus.value = lerp(6.5, 8, e); dof.uniforms.uAperture.value = 1.4; dof.uniforms.uMaxR.value = 6 * DPR;
      fill.intensity = 1.3; hemi.intensity = 0.9;
      // 枪口火光：bloom 门槛抬高、强度压低，只留一圈光晕
      bloom.threshold = 1.1; bloom.strength = 0.45; bloom.radius = 0.4;
      G.uExp.value = 1.0; G.uDrops.value = 0.35;
    } else if (name === 'heli') {
      // 直升机从楼边升起（开头半秒就露头），探照灯扫进镜头 → 白闪
      const e = sm(0, 1, u);
      look(V(12.5, R0 + 0.95, 27.5), V(24, R0 + lerp(3, 6.5, e), 32), 36, -0.03, 0.03, T);
      const rise = sm(0, 0.75, u);
      const hp = V(24.5, R0 + lerp(-1.5, 5.5, rise), 34);
      const into = sm(0.68, 0.9, u); // 光柱最后一秒多才扫进镜头（前面看得清直升机的侧影），接白闪
      const tgt = V(lerp(16, camera.position.x, into), lerp(R0 - 12, camera.position.y, into), lerp(26, camera.position.z, into)).add(V(0, 0.6 * into, -1.2 * into));
      setHeli(hp, -Math.PI / 2 - 1.05, -0.05 + 0.12 * (1 - e), 0.14, tgt, T, 1.6); // 侧着 3/4：机头、短翼、尾梁的剪影都在
      downwash.uniforms.uAmt.value = 1;
      scene.fog.density = 0.008; rain.uniforms.uBox.value = 22;
      splash.points.visible = true; splash.uniforms.uY.value = R0; splash.uniforms.uBox.value = 12; splash.uniforms.uCam.value.copy(camera.position);
      G.uWhite.value = sm(0.9, 1.0, u) * 0.85; G.uExp.value = 1.0; G.uDrops.value = 0.3;
      // 对焦在直升机上：前景的女儿墙栏杆虚掉（不再是一根清清楚楚横穿画面的光棍）
      dof.enabled = Q.dof; dof.uniforms.uFocus.value = camera.position.distanceTo(hp); dof.uniforms.uAperture.value = 3.4; dof.uniforms.uMaxR.value = 6 * DPR;
    } else {
      // 标题：楼顶低机位，回头看三个人；直升机悬在女儿墙外给他们逆光；之后一直循环（菜单背景）
      const k = T - TITLE_START;
      G.uWhite.value = 0.85 * (1 - sm(0, 1.4, k));
      G.uBars.value = 1 - sm(1.0, 3.0, k);
      const drift = Math.sin(k * 0.12) * 0.4, P = portrait();
      const from = P ? V(EMP.x - 1.2 + drift, R0 + 0.9, EMP.z - 7.5) : V(EMP.x - 3.6 + drift, R0 + 0.8, EMP.z - 4.9);
      const to = P ? V(EMP.x + 0.2, R0 + 2.3, EMP.z + 4) : V(EMP.x - 0.6, R0 + 2.2, EMP.z + 3);
      look(from, to, P ? 50 : 40, 0, 0.02, T);
      const hp = P ? V(EMP.x - 2 + Math.sin(k * 0.3) * 0.8, R0 + 9.5, EMP.z + 20) : V(EMP.x - 4 + Math.sin(k * 0.3) * 0.8, R0 + 10.5 + Math.sin(k * 0.5) * 0.3, EMP.z + 19);
      setHeli(hp, Math.PI + 0.35, 0.2, 0.06, V(EMP.x - 0.5 + Math.sin(k * 0.35) * 1.5, R0, EMP.z + 6.5 + Math.cos(k * 0.27)), T, 1.5);
      downwash.uniforms.uAmt.value = 0.18;
      fireHmg(T, false); sparks.points.visible = false;
      gunRim.intensity = 10;
      scene.fog.density = 0.01; rain.uniforms.uBox.value = 26;
      splash.points.visible = true; splash.uniforms.uY.value = R0; splash.uniforms.uBox.value = 12; splash.uniforms.uCam.value.copy(camera.position);
      G.uExp.value = 1.05; G.uDrops.value = 0.15; fill.intensity = 0.7;
      // 景深：对焦在三个人身上，前景沙袋、机枪虚掉一点，背后的城市和直升机略软
      dof.enabled = Q.dof; dof.uniforms.uFocus.value = P ? 9 : 7; dof.uniforms.uAperture.value = 2.4; dof.uniforms.uMaxR.value = 5 * DPR;
    }
    // 呼吸、重心的小晃动（三个人相位错开），机枪手开火时肩膀跟着一抖一抖
    squad.forEach((m, i) => {
      const br = Math.sin(T * 1.7 + i * 2.1);
      m.spine.rotation.x = m.base.spine + br * 0.018 + (i === 0 ? hmgKick * 0.04 : 0); m.hips.position.y = m.base.hipY + br * 0.006;
      m.head.rotation.x = m.base.head + Math.sin(T * 0.9 + i * 2) * 0.035; m.head.rotation.y = (m.s.pose === 'watch' ? -0.3 : 0) + Math.sin(T * 0.37 + i) * 0.12;
      m.aim.rotation.x = m.base.aimX + Math.sin(T * 1.3 + i * 1.7) * 0.012;
    });
    // 只画这一镜看得到的：商场门口那条街只在 horde 镜头里出现，公寓楼顶（布景、人、楼顶的尸群、灯）在 horde 镜头里看不到
    street.visible = name === 'horde'; roof.visible = name !== 'horde';
    eyes.step();
    camera.getWorldDirection(tmp); fill.position.copy(camera.position).addScaledVector(tmp, -6).add(V(0, 4, 0)); fill.target.position.copy(camera.position).addScaledVector(tmp, 12); fill.target.updateMatrixWorld();
    rain.uniforms.uCam.value.copy(camera.position);
    if (streetFx.refl) streetFx.refl.material.uniforms.uT.value = T;
    sky.uniforms.uFlash.value = lightning;
    cityFx.lampU.uFog.value = cityFx.glowU.uFog.value = scene.fog.density;
    moon.intensity += lightning * 6; hemi.intensity += lightning * 1.5;
  };

  // ---------------------------------------------------------------- 预编译 + 每个镜头预热两帧（不让第一次切镜头时卡一下）
  step('编译着色器', 0.74);
  frame(TIMELINE.full[2].t0 + 1);
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);
  const warm = [3.5, 10, 16, 24.5, TITLE_START + 4];
  for (let i = 0; i < warm.length; i++) {
    frame(warm[i]); composer.render(); frame(warm[i] + 0.05); composer.render();
    step('预热镜头', 0.76 + ((i + 1) / warm.length) * 0.22);
    await new Promise((r) => setTimeout(r, 0));
  }

  // ---------------------------------------------------------------- 播放、事件、统计
  const listeners = { logo: [], menu: [], end: [] };
  const emit = (e) => { for (const fn of listeners[e]) { try { fn(); } catch (err) { console.error(err); } } };
  let version = 'full', list = TIMELINE.full, t = 0, fired = new Set(), raf = 0, last = 0, frameMs = 16.7, disposed = false;
  const at = (v) => ({ logo: LOGO_AT[v] ?? LOGO_AT.full, menu: MENU_AT[v] ?? MENU_AT.full });
  const check = () => {
    const a = at(version);
    if (t >= a.logo && !fired.has('logo')) { fired.add('logo'); emit('logo'); }
    if (t >= a.menu && !fired.has('menu')) { fired.add('menu'); emit('menu'); emit('end'); }
  };
  renderer.info.autoReset = false;
  // 每帧主线程花在哪：logicMs = 摆镜头、丧尸、灯（frame()），submitMs = 把绘制命令交给 GL（不含显卡真正画的时间）
  let logicMs = 0, submitMs = 0;
  const render = () => { renderer.info.reset(); const a = performance.now(); frame(sceneTime(list, t)); const b = performance.now(); composer.render(); const c = performance.now(); logicMs = b - a; submitMs = c - b; check(); };
  const loop = (now) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    if (dt > 0) frameMs = frameMs * 0.9 + dt * 1000 * 0.1;
    t += dt; render();
  };
  const start = () => { if (!raf && !disposed) { last = 0; raf = requestAnimationFrame(loop); } };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const onResize = () => { if (!disposed) { const [w, h] = size(); setSizes(w, h); } };
  addEventListener('resize', onResize);

  // 显存估计：贴图（含 mipmap）+ 几何 + 渲染目标
  const MB = (b) => +(b / 1048576).toFixed(1);
  const gpuParts = () => {
    let tx = 0, geo = 0; const seen = new Set();
    const tex = (x) => { if (!x || seen.has(x.source)) return; seen.add(x.source); const im = x.image; const w = im?.width || 0, h = im?.height || 0; tx += w * h * 4 * (x.generateMipmaps !== false ? 1.33 : 1); };
    scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); for (const a of Object.values(o.geometry.attributes)) geo += a.array?.byteLength || 0; geo += o.geometry.index?.array?.byteLength || 0; }
      for (const m of [o.material].flat()) { if (!m) continue; for (const v of Object.values(m)) if (v?.isTexture) tex(v); if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture) tex(u.value); }
    });
    const px = renderer.domElement.width * renderer.domElement.height;
    let rts = px * 8 * 2 + px * 4 * 2 + px * Q.bloom * Q.bloom * 8 * 3.7; // 两张半精度 + 两张深度 + Bloom（亮部一张 + 5 级 × 横竖两张，逐级减半）
    if (streetFx.refl) rts += px * REFL * REFL * 8; // 湿地面倒影（颜色 + 深度）
    rts += envRT.width * envRT.height * 8; // 环境反射（PMREM，一张 768×1024 半精度图集）
    if (Q.shadow) rts += Q.shadow * Q.shadow * 4 * 2;
    return { textures: MB(tx), geometry: MB(geo), targets: MB(rts), total: MB(tx + geo + rts) };
  };
  /** 显存估计：贴图（含 mipmap）+ 几何 + 渲染目标（后期链、倒影、阴影、环境反射） */
  const gpuMB = () => gpuParts().total;
  step('就绪', 1);

  return {
    tier: tierId,
    renderer, scene, camera,
    /** 播放：'full' 完整版、'short' 短版、'none' 不播（直接 Logo + 菜单，背景循环） */
    play(v = 'full') {
      fired = new Set();
      if (v === 'none') { version = 'full'; list = [TIMELINE.loop]; t = MENU_AT.full; check(); }
      else { version = TIMELINE[v] ? v : 'full'; list = TIMELINE[version]; t = 0; }
      start();
    },
    /** 跳过：马上停在 Logo + 菜单（已经过了就什么都不做） */
    skip() {
      const a = at(version);
      if (t < a.menu) { t = a.menu; render(); }
      start();
    },
    /** 画这一版第 t 秒（截图、导出视频用；Logo / 菜单事件照样会按时间触发） */
    setT(time, v = null) {
      if (v && TIMELINE[v] && v !== version) { version = v; list = TIMELINE[v]; fired = new Set(); }
      stop(); t = Math.max(0, time); render();
    },
    on(evt, fn) { listeners[evt]?.push(fn); return () => { const l = listeners[evt]; const i = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); }; },
    /** 现在的进度：t、哪个镜头、Logo / 菜单出现到几成（0..1，界面按这个做渐变） */
    ui() { const a = at(version); return { t, version, shot: lastShot, logo: clamp((t - a.logo) / 1.2), menu: clamp((t - a.menu) / 0.8) }; },
    stats() { return { frameMs: +frameMs.toFixed(2), gpuMB: gpuMB(), gpu: gpuParts(), tier: tierId, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, logicMs: +logicMs.toFixed(2), submitMs: +submitMs.toFixed(2) }; },
    resize: onResize,
    /**
     * 拍下当前这一帧（data URL）。渲染器没开 preserveDrawingBuffer，帧画完一交给屏幕缓冲区就清了，
     * 所以在同一个任务里先重画一帧再 toDataURL；已经释放了返回 null。
     */
    snapshot(type = 'image/jpeg', quality = 0.82) {
      if (disposed) return null;
      render();
      return renderer.domElement.toDataURL(type, quality);
    },
    /** 彻底释放：停循环、几何 / 材质 / 贴图 / 渲染目标全 dispose、丢掉 GL 上下文 */
    dispose() {
      if (disposed) return; disposed = true; stop(); removeEventListener('resize', onResize);
      const seen = new Set(), free = (x) => { if (x && !seen.has(x) && typeof x.dispose === 'function') { seen.add(x); x.dispose(); } };
      scene.traverse((o) => {
        free(o.geometry);
        for (const m of [o.material].flat()) { if (!m) continue; for (const v of Object.values(m)) if (v?.isTexture) free(v); if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture) free(u.value); free(m); }
        if (o.isLight && o.shadow?.map) free(o.shadow.map);
        if (o.getRenderTarget) free(o.getRenderTarget());
      });
      kit?.dispose(); heli.dispose();
      for (const s of Object.values(scans)) { free(s.map); free(s.normalMap); }
      free(envRT); free(rt.depthTexture);
      composer.passes.forEach((p) => p.dispose?.()); composer.dispose();
      scene.clear(); resetShared();
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
