// 环境：天空、雾、灯光、阴影、夜景泛光、HDR 光影、性能降级。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HdrPipeline } from './post.js';
import { loadSky } from './sky.js';

const DAY = {
  top: new THREE.Color('#3f7cc8'), horizon: new THREE.Color('#cfe1ee'), bottom: new THREE.Color('#bcc6cc'),
  fog: new THREE.Color('#cddde8'), hemiSky: new THREE.Color('#dcebff'), hemiGround: new THREE.Color('#7d7465'),
  sun: new THREE.Color('#fff0d8'),
};
const NIGHT = {
  top: new THREE.Color('#050a1a'), horizon: new THREE.Color('#1d2a4a'), bottom: new THREE.Color('#0a0e17'),
  fog: new THREE.Color('#141d33'), hemiSky: new THREE.Color('#5a6a9a'), hemiGround: new THREE.Color('#1a1712'),
  sun: new THREE.Color('#9fb6ff'),
};

/**
 * 「HDR 光影」的调校。原来各处（园区、住宅、套房）每帧设的曝光和补光强度都不动，
 * 这里的倍数只在画这一帧的时候乘上去、画完还原，所以关掉 HDR 画面和以前一模一样。
 * 带 In / Out 的成对数值按「相机在室内还是室外」过渡（像眼睛进出房间时的适应）。
 *   exposureOut / exposureIn   曝光倍数。室内压一点，配合保色的 Neutral 色调映射，白沙发、白墙不再糊成一片
 *   exposureNightOut / In      夜里的曝光倍数。原来的 ACES 会把暗部整体提亮约 1.6 倍，Neutral 不会，夜景要自己补上
 *   hemiOut / hemiIn           没有方向的半球补光：室内压低，明暗才拉得开；夜里补光本来就弱，不再压
 *   hemiTint                   室外的半球补光调暖一点，抵掉天空环境图带来的偏蓝
 *   hemiTintIn                 室内（白天）的半球补光也调暖：效果图里商场里是一片暖金色的灯光，不是日光的中性白
 *   room                       室内环境图的倍数
 *   sky / skyNight             室外材质反射的天空环境图强度（白天 / 夜里）
 *   skyGain                    看得见的天空照片的亮度倍数
 *   dayBloom / dayThreshold      白天高光柔光的强度和阈值（亮度超过阈值的高光才溢出，白墙不会发雾）
 *   nightBloom / nightThreshold  夜景柔光的强度倍数和阈值下限（只让灯具和招牌发光，不再整片发白）
 *   aoIntensity                环境光遮蔽压暗的程度
 *   lampHemi / lampRoom        「室内灯光」亮着时，半球补光和室内环境图再乘的倍数（不开 HDR 光影也生效）
 */
export const HDR_GRADE = Object.freeze({
  exposureOut: 1.0, exposureIn: 0.9, exposureNightOut: 1.5, exposureNightIn: 1.1,
  hemiOut: 0.9, hemiIn: 0.6, hemiTint: Object.freeze([1.0, 0.93, 0.8]), hemiTintIn: Object.freeze([1.0, 0.88, 0.7]), room: 1.1,
  sky: 1.5, skyNight: 0.1, skyGain: 1.2,
  dayBloom: 0.3, dayThreshold: 1.5, nightBloom: 0.8, nightThreshold: 1.0, aoIntensity: 0.9,
  lampHemi: 0.72, lampRoom: 0.82,
});
const lerp = (a, b, t) => a + (b - a) * t;

export class Environment {
  constructor(renderer, scene, camera, mats, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.mats = mats;
    this.night = 0;
    this.target = 0;
    this.bloomEnabled = quality.bloom;
    this.composer = null;
    this.bloom = null;
    this.bloomProfile = { strength: 0, threshold: .8 };

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    pmrem.dispose();
    // HDR 光影的状态：天空素材第一次打开时才加载
    this.hdr = false; this.aoEnabled = false; this.dayBloom = false;
    this.skyRequest = null; this.skyEnv = null; this.skyReady = false;
    /** 相机到它看的那一点的距离（米）；漫游时是 0。画面入口每帧更新，环境光遮蔽按它定取样半径。 */
    this.viewDistance = 0;
    /** 相机在不在室内（0 室外 … 1 室内）：indoorTarget 由画面入口每帧给，indoor 跟着它平滑过渡。 */
    this.indoor = 0; this.indoorTarget = 0;
    /** 「室内灯光」亮着没有（0 … 1）：亮着时把没有方向的补光再压一些，灯才显得出明暗。由 indoor-lighting.js 给 lampTarget。 */
    this.lamp = 0; this.lampTarget = 0;

    this.skyUniforms = {
      topColor: { value: DAY.top.clone() },
      horizonColor: { value: DAY.horizon.clone() },
      bottomColor: { value: DAY.bottom.clone() },
      // 以下只在 HDR 光影下用（着色器里由 HDR_SKY 开关包着）
      skyMap: { value: null }, photoMix: { value: 0 }, skyGain: { value: HDR_GRADE.skyGain },
      hazeColor: { value: DAY.fog.clone() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunGlow: { value: 1 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(6000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: this.skyUniforms,
        vertexShader: `varying vec3 vDir;
          void main(){
          #ifdef HDR_SKY
            vDir = position; // 不先归一化：在三角面上线性插值后再归一化，方向才准，天空照片不会扭
          #else
            vDir = normalize(position);
          #endif
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; varying vec3 vDir;
          #ifdef HDR_SKY
          uniform sampler2D skyMap; uniform float photoMix; uniform float skyGain; uniform vec3 hazeColor; uniform vec3 sunDir; uniform float sunGlow;
          #endif
          void main(){
          #ifdef HDR_SKY
            vec3 d = normalize(vDir); float h = d.y;
          #else
            float h = vDir.y;
          #endif
          vec3 c = h > 0.0 ? mix(horizonColor, topColor, pow(h, 0.5)) : mix(horizonColor, bottomColor, pow(-h, 0.35));
          #ifdef HDR_SKY
          if (photoMix > 0.0) {
            // 天空照片：上半球，等距柱状（u 是方位角，v 是仰角）。地平线附近融进雾色，和远处被雾盖住的地面接上
            vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(h, 0.0, 1.0)) * 0.63661977);
            vec3 photo = mix(hazeColor, texture2D(skyMap, uv).rgb * skyGain, smoothstep(-0.01, 0.11, h));
            // 太阳：照片里那一片只是白的；再叠一个亮度超过 1 的光核和一圈光晕，高光柔光才有东西可溢出
            float s = max(dot(d, sunDir), 0.0);
            photo += vec3(1.0, 0.94, 0.84) * (pow(s, 1400.0) * 9.0 + pow(s, 90.0) * 0.22) * sunGlow;
            c = mix(c, photo, photoMix);
          }
          #endif
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // 星空（夜间渐显）
    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random(), v = Math.random() * 0.9 + 0.08;
      const th = u * Math.PI * 2, y = v;
      const r = Math.sqrt(1 - y * y);
      pts.push(Math.cos(th) * r * 3000, y * 3000, Math.sin(th) * r * 3000);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    scene.fog = new THREE.Fog(DAY.fog.clone(), 900, 3000);

    this.hemi = new THREE.HemisphereLight(DAY.hemiSky.clone(), DAY.hemiGround.clone(), 0.62);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(DAY.sun.clone(), 2.1);
    this.sunDir = new THREE.Vector3(-0.55, 0.78, 0.62).normalize();
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun, this.sun.target);
    this.setShadowFocus(new THREE.Vector3(0, 0, 0), 150);
    this.skyUniforms.sunDir.value.copy(this.sunDir);

    this.setHdr(quality);
    this.apply();
  }

  /** 把「HDR 光影」相关的三个开关记下来，并让色调映射、天空、材质跟上。只改状态，不建显卡缓冲。 */
  setHdr(quality) {
    const hdr = !!quality.hdr, changed = this.hdr !== hdr;
    this.hdr = hdr;
    this.aoEnabled = hdr && !!quality.ao;
    this.dayBloom = hdr && !!quality.dayBloom;
    if (!this.sky?.material?.defines) return changed; // 单元测试里的半成品环境没有天空
    // 保色的 Neutral 色调映射：高光不发灰、颜色不偏，适合亮度超过 1 的画面；关掉时回到原来的 ACES
    this.renderer.toneMapping = hdr ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    if (hdr && !this.skyRequest) {
      this.skyRequest = loadSky().then(({ radiance, photo }) => {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.skyEnv = pmrem.fromEquirectangular(radiance).texture;
        this.skyEnv.name = 'sky-environment';
        pmrem.dispose(); radiance.dispose();
        this.skyUniforms.skyMap.value = photo;
        this.skyReady = true;
        this.syncSky();
      }).catch((error) => { console.warn('天空素材没有加载成功，HDR 光影改用渐变天空和室内环境图。', error); });
    }
    this.syncSky();
    return changed;
  }

  /** 天空照片和天空环境图要不要用上（开着 HDR 并且素材到了）。 */
  syncSky() {
    const on = this.hdr && this.skyReady, material = this.sky.material;
    if (!!material.defines.HDR_SKY !== on) {
      if (on) material.defines.HDR_SKY = 1; else delete material.defines.HDR_SKY;
      material.needsUpdate = true;
    }
    this.mats.setHdr?.(this.hdr, on ? this.skyEnv : null);
    this.apply();
    this.renderer.shadowMap.needsUpdate = true;
  }

  ensureComposer() {
    if (this.composer) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    const profile = this.bloomProfile || { strength: .85 * this.night, threshold: .8 };
    this.bloom = new UnrealBloomPass(size, profile.strength, 0.55, profile.threshold);
    if (this.hdr) {
      // HDR 光影：半浮点画面缓冲 + 抗锯齿 + 环境光遮蔽 + 高光柔光。高分屏本身像素密，多重采样减到 2 倍
      this.composer = new HdrPipeline(this.renderer, this.scene, this.camera, this.bloom, { samples: this.renderer.getPixelRatio() >= 1.5 ? 2 : 4 });
      return;
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Room lighting can update its profile before the first night render, and
   * while low quality has released the postprocessing targets. */
  setBloomProfile(strength, threshold = .8) {
    this.bloomProfile = { strength, threshold };
    if (this.bloom) Object.assign(this.bloom, this.bloomProfile);
  }

  setQuality(quality) {
    this.bloomEnabled = quality.bloom;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.sun.castShadow = quality.shadows;
    if (!quality.shadows || this.sun.shadow.mapSize.x !== quality.shadowSize) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapPass?.dispose();
      this.sun.shadow.mapPass = null;
    }
    this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    this.renderer.shadowMap.needsUpdate = true;
    // 两条后处理路线（原来的夜景泛光、HDR 管线）的缓冲不通用：换路线、或者哪个效果都不用了，就把缓冲放掉
    const switched = this.setHdr(quality);
    const needed = quality.bloom || this.aoEnabled || this.dayBloom;
    if ((!needed || switched) && this.composer) {
      for (const pass of this.composer.passes) pass.dispose?.();
      this.composer.dispose();
      this.composer = this.bloom = null;
    }
  }

  setNight(on) { this.target = on ? 1 : 0; }

  /** 阴影相机跟随视角：以 center 为中心、覆盖半径 radius（园区约 330，单期约 150） */
  setShadowFocus(center, radius) {
    const r = Math.max(60, radius);
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(this.sunDir, r * 2 + 260);
    const sc = this.sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.near = 20; sc.far = r * 4 + 600;
    sc.updateProjectionMatrix();
    this.sun.target.updateMatrixWorld();
    this.renderer.shadowMap.needsUpdate = true;
  }

  apply() {
    const t = this.night;
    const mix = (a, b) => a.clone().lerp(b, t);
    this.skyUniforms.topColor.value.copy(mix(DAY.top, NIGHT.top));
    this.skyUniforms.horizonColor.value.copy(mix(DAY.horizon, NIGHT.horizon));
    this.skyUniforms.bottomColor.value.copy(mix(DAY.bottom, NIGHT.bottom));
    this.scene.fog.color.copy(mix(DAY.fog, NIGHT.fog));
    this.hemi.color.copy(mix(DAY.hemiSky, NIGHT.hemiSky));
    this.hemi.groundColor.copy(mix(DAY.hemiGround, NIGHT.hemiGround));
    this.hemi.intensity = 0.62 - 0.5 * t;
    this.sun.color.copy(mix(DAY.sun, NIGHT.sun));
    this.sun.intensity = 2.1 - 1.92 * t;
    this.scene.environmentIntensity = 0.45 - 0.37 * t;
    this.renderer.toneMappingExposure = 0.92 + 0.2 * t;
    this.stars.material.opacity = Math.max(0, t * 1.2 - 0.2);
    this.setBloomProfile(.85 * t);
    this.mats.setNight(t);
    if (this.skyUniforms.photoMix) {
      // 天空照片只在白天用；入夜渐渐换回渐变夜空和星星。室外材质反射的天空也跟着暗下来
      const day = 1 - Math.min(1, t * 1.25);
      this.skyUniforms.photoMix.value = this.hdr && this.skyReady ? day * day * (3 - 2 * day) : 0;
      this.skyUniforms.hazeColor.value.copy(this.scene.fog.color);
      this.skyUniforms.sunGlow.value = day;
      this.mats.setSkyIntensity?.(lerp(HDR_GRADE.sky, HDR_GRADE.skyNight, t));
    }
  }

  update(dt) {
    // Keep aerial city views clear while retaining street-level atmospheric depth.
    const altitude = Math.max(0, this.camera.position.y - 500);
    this.scene.fog.near = 900 + altitude;
    this.scene.fog.far = 3000 + altitude * 1.5;
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    if (this.indoor !== this.indoorTarget && this.indoorTarget != null) {
      this.indoor += (this.indoorTarget - this.indoor) * Math.min(1, dt * 3);
      if (Math.abs(this.indoor - this.indoorTarget) < 0.01) this.indoor = this.indoorTarget;
    }
    if (this.lamp !== this.lampTarget && this.lampTarget != null) {
      this.lamp += (this.lampTarget - this.lamp) * Math.min(1, dt * 3);
      if (Math.abs(this.lamp - this.lampTarget) < 0.01) this.lamp = this.lampTarget;
    }
    if (Math.abs(this.night - this.target) > 1e-3) {
      const step = dt / 1.2;
      this.night = this.night < this.target ? Math.min(this.target, this.night + step) : Math.max(this.target, this.night - step);
      this.apply();
    }
  }

  /** 画这一帧之前把曝光、补光乘上调校的倍数（HDR 光影的调校，加上「室内灯光」亮着时的压暗），返回还原用的函数。 */
  grade() {
    const { renderer, scene, hemi, night } = this, G = HDR_GRADE, indoor = this.indoor || 0, lamp = this.lamp || 0;
    const keep = [renderer.toneMappingExposure, hemi.intensity, scene.environmentIntensity], tint = hemi.color.clone();
    if (this.hdr) {
      renderer.toneMappingExposure *= lerp(lerp(G.exposureOut, G.exposureIn, indoor), lerp(G.exposureNightOut, G.exposureNightIn, indoor), night);
      hemi.intensity *= lerp(lerp(G.hemiOut, G.hemiIn, indoor), 1, night);
      const warm = (1 - indoor) * (1 - night), warmIn = indoor * (1 - night);
      const k = (i) => lerp(1, G.hemiTint[i], warm) * lerp(1, G.hemiTintIn[i], warmIn);
      hemi.color.setRGB(tint.r * k(0), tint.g * k(1), tint.b * k(2));
      scene.environmentIntensity *= G.room;
    }
    hemi.intensity *= lerp(1, G.lampHemi, lamp);
    scene.environmentIntensity *= lerp(1, G.lampRoom, lamp);
    return () => { [renderer.toneMappingExposure, hemi.intensity, scene.environmentIntensity] = keep; hemi.color.copy(tint); };
  }

  render() {
    const { renderer, scene, camera } = this;
    camera.layers.set(0);
    const nightBloom = this.bloomEnabled && this.night > 0.02;
    if (this.hdr || this.lamp > 0) {
      const restore = this.grade();
      if (this.hdr && (nightBloom || this.dayBloom || this.aoEnabled)) {
        this.ensureComposer();
        const post = this.composer, G = HDR_GRADE, t = this.night, profile = this.bloomProfile || { strength: 0, threshold: .8 };
        // 遮蔽的取样半径：漫游时 0.6 米（墙角、家具脚下）；俯瞰时跟着相机拉远而变大（楼和地面的交接）
        Object.assign(post.ao, { enabled: this.aoEnabled, intensity: G.aoIntensity, radius: Math.min(5, Math.max(0.6, this.viewDistance * 0.012)),
          scale: Math.min(1, Math.max(0.5, 1 / renderer.getPixelRatio())) });
        post.sizeAo();
        post.bloomOn = nightBloom || this.dayBloom;
        const keep = [this.bloom.strength, this.bloom.threshold];
        this.bloom.strength = (this.dayBloom ? G.dayBloom * (1 - t) : 0) + (nightBloom ? profile.strength * G.nightBloom : 0);
        this.bloom.threshold = Math.max(profile.threshold, lerp(G.dayThreshold, G.nightThreshold, t));
        post.render();
        [this.bloom.strength, this.bloom.threshold] = keep;
      } else if (nightBloom) { this.ensureComposer(); this.composer.render(); }
      else renderer.render(scene, camera);
      restore();
    } else if (nightBloom) { this.ensureComposer(); this.composer.render(); }
    else renderer.render(scene, camera);
    // 第二遍：只画第 1 层（文字标注），不参与泛光
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    camera.layers.set(1);
    renderer.render(scene, camera);
    camera.layers.set(0);
    renderer.autoClear = auto;
  }

  resize(w, h) {
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }
}
