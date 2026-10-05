// 环境：天空、雾、灯光、阴影、夜景泛光、性能降级。
import * as THREE from 'three';
import { SHADOW_SIZE } from './device.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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

export class Environment {
  constructor(renderer, scene, camera, mats) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.mats = mats;
    this.night = 0;
    this.target = 0;
    this.bloomEnabled = true;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.skyUniforms = {
      topColor: { value: DAY.top.clone() },
      horizonColor: { value: DAY.horizon.clone() },
      bottomColor: { value: DAY.bottom.clone() },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(3200, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: this.skyUniforms,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; varying vec3 vDir;
          void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizonColor, topColor, pow(h, 0.5)) : mix(horizonColor, bottomColor, pow(-h, 0.35));
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
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun, this.sun.target);
    this.setShadowFocus(new THREE.Vector3(0, 0, 0), 150);

    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.0, 0.55, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.apply();
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
    this.bloom.strength = 0.85 * t;
    this.mats.setNight(t);
  }

  update(dt) {
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    if (Math.abs(this.night - this.target) > 1e-3) {
      const step = dt / 1.2;
      this.night = this.night < this.target ? Math.min(this.target, this.night + step) : Math.max(this.target, this.night - step);
      this.apply();
    }
  }

  render() {
    const { renderer, scene, camera } = this;
    camera.layers.set(0);
    if (this.bloomEnabled && this.night > 0.02) this.composer.render();
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
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }
}
