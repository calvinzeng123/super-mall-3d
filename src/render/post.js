// HDR 后处理管线（只在「HDR 光影」开着、并且用到环境光遮蔽或高光柔光时才建）。
//   1. 场景画进一张半浮点（HDR，亮度可以超过 1）、带多重采样抗锯齿的画面缓冲；
//   2. 环境光遮蔽：只读这张缓冲的深度图（法线从深度推出来，不把场景再画一遍），在较低分辨率下算好、降噪；
//   3. 把颜色乘上遮蔽，拷进一张普通的 HDR 缓冲；高光柔光在这张缓冲上做（只有亮度超过阈值的高光会溢出）；
//   4. 最后统一做色调映射和 sRGB 转换，输出到屏幕。
// 对外的样子和 EffectComposer 一致（passes / setPixelRatio / setSize / render / dispose），env.js 两条路共用同一套释放逻辑。
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOShader, generateMagicSquareNoise } from 'three/addons/shaders/GTAOShader.js';
import { PoissonDenoiseShader, generatePdSamplePointInitializer } from 'three/addons/shaders/PoissonDenoiseShader.js';

/** 遮蔽的取样数（每个像素）和降噪的取样数。 */
export const AO_SAMPLES = 12, AO_DENOISE_SAMPLES = 8;

const QUAD_VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

function noiseTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  // 固定的伪随机序列：同一台设备每次的噪点一样，截图可以复现
  let seed = 0x2f6e2b1;
  for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed >>> 24; }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  return t;
}

export class HdrPipeline {
  /** bloom：UnrealBloomPass（由 env.js 建好、调参数）。samples：多重采样数。 */
  constructor(renderer, scene, camera, bloom, { samples = 4 } = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.bloom = bloom; this.samples = samples;
    this.output = new OutputPass(); this.output.renderToScreen = true;
    this.passes = [bloom, this.output];
    this.pixelRatio = renderer.getPixelRatio();
    const size = renderer.getSize(new THREE.Vector2());
    this.width = size.x; this.height = size.y;
    /** 遮蔽的参数：radius 是取样半径（米），intensity 是压暗的程度，scale 是遮蔽图相对画面的分辨率。 */
    this.ao = { enabled: false, radius: 0.6, intensity: 0.85, scale: 1 };
    this.bloomOn = false;
    this.scene_ = null; this.color = null; this.aoTargets = null; this.aoParts = null;
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.white.needsUpdate = true;
    this.copy = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tAo: { value: this.white }, aoIntensity: { value: 0 } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tAo; uniform float aoIntensity; varying vec2 vUv;
        void main() { vec4 c = texture2D(tDiffuse, vUv); float ao = mix(1.0, texture2D(tAo, vUv).r, aoIntensity); gl_FragColor = vec4(c.rgb * ao, 1.0); }`,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.quad = new FullScreenQuad(this.copy);
  }

  get effective() { return [Math.max(1, Math.floor(this.width * this.pixelRatio)), Math.max(1, Math.floor(this.height * this.pixelRatio))]; }

  setPixelRatio(ratio) { this.pixelRatio = ratio; this.setSize(this.width, this.height); }

  setSize(width, height) {
    this.width = width; this.height = height;
    const [w, h] = this.effective;
    this.scene_?.setSize(w, h); this.color?.setSize(w, h);
    this.bloom.setSize(w, h); this.output.setSize?.(w, h);
    this.sizeAo();
  }

  /** 画面缓冲按需要建：要算遮蔽时才带深度图。 */
  targets() {
    const [w, h] = this.effective, depth = this.ao.enabled;
    if (this.scene_ && !!this.scene_.depthTexture !== depth) { this.scene_.depthTexture?.dispose(); this.scene_.dispose(); this.scene_ = null; }
    if (!this.scene_) {
      this.scene_ = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.samples,
        depthTexture: depth ? new THREE.DepthTexture(w, h, THREE.UnsignedIntType) : null });
      this.scene_.texture.name = 'hdr-scene';
    }
    if (!this.color) { this.color = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }); this.color.texture.name = 'hdr-color'; }
    if (depth && !this.aoParts) this.buildAo();
  }

  buildAo() {
    const gtao = new THREE.ShaderMaterial({
      defines: { ...GTAOShader.defines, PERSPECTIVE_CAMERA: 1, SAMPLES: AO_SAMPLES, NORMAL_VECTOR_TYPE: 0, DEPTH_SWIZZLING: 'x' },
      uniforms: THREE.UniformsUtils.clone(GTAOShader.uniforms),
      vertexShader: GTAOShader.vertexShader, fragmentShader: GTAOShader.fragmentShader,
      blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    });
    gtao.uniforms.tNoise.value = generateMagicSquareNoise();
    gtao.uniforms.distanceExponent.value = 1; gtao.uniforms.thickness.value = 1; gtao.uniforms.distanceFallOff.value = 1; gtao.uniforms.scale.value = 1;
    const denoise = new THREE.ShaderMaterial({
      defines: { ...PoissonDenoiseShader.defines, SAMPLES: AO_DENOISE_SAMPLES, SAMPLE_VECTORS: generatePdSamplePointInitializer(AO_DENOISE_SAMPLES, 2, 2),
        NORMAL_VECTOR_TYPE: 0, DEPTH_VALUE_SOURCE: 0 },
      uniforms: THREE.UniformsUtils.clone(PoissonDenoiseShader.uniforms),
      vertexShader: PoissonDenoiseShader.vertexShader, fragmentShader: PoissonDenoiseShader.fragmentShader,
      blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    });
    denoise.uniforms.tNoise.value = noiseTexture();
    denoise.uniforms.lumaPhi.value = 10; denoise.uniforms.depthPhi.value = 2; denoise.uniforms.normalPhi.value = 3; denoise.uniforms.radius.value = 6;
    this.aoParts = { gtao, denoise };
    const make = () => new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.aoTargets = { raw: make(), clean: make() };
    this.sizeAo();
  }

  sizeAo() {
    if (!this.aoTargets) return;
    const [w, h] = this.effective, aw = Math.max(1, Math.round(w * this.ao.scale)), ah = Math.max(1, Math.round(h * this.ao.scale));
    this.aoTargets.raw.setSize(aw, ah); this.aoTargets.clean.setSize(aw, ah);
    this.aoParts.gtao.uniforms.resolution.value.set(aw, ah);
    this.aoParts.denoise.uniforms.resolution.value.set(aw, ah);
  }

  disposeAo() {
    if (!this.aoParts) return;
    for (const m of Object.values(this.aoParts)) { m.uniforms.tNoise.value?.dispose(); m.dispose(); }
    for (const t of Object.values(this.aoTargets)) t.dispose();
    this.aoParts = this.aoTargets = null;
  }

  fullscreen(material, target, clear = null) {
    const { renderer } = this;
    renderer.setRenderTarget(target);
    if (clear !== null) { renderer.setClearColor(clear, 1); renderer.clear(); }
    this.quad.material = material;
    this.quad.render(renderer);
  }

  render() {
    const { renderer, scene, camera } = this;
    this.targets();
    if (!this.ao.enabled && this.aoParts) this.disposeAo();
    const autoClear = renderer.autoClear, clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
    renderer.autoClear = true;
    renderer.setRenderTarget(this.scene_);
    renderer.render(scene, camera);
    renderer.autoClear = false;
    let ao = this.white;
    if (this.ao.enabled) {
      const { gtao, denoise } = this.aoParts, depth = this.scene_.depthTexture;
      const u = gtao.uniforms;
      u.tDepth.value = depth; u.radius.value = this.ao.radius;
      u.cameraNear.value = camera.near; u.cameraFar.value = camera.far;
      u.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
      u.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
      u.cameraWorldMatrix.value.copy(camera.matrixWorld);
      this.fullscreen(gtao, this.aoTargets.raw, 0xffffff);
      const d = denoise.uniforms;
      d.tDiffuse.value = this.aoTargets.raw.texture; d.tDepth.value = depth;
      d.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
      this.fullscreen(denoise, this.aoTargets.clean, 0xffffff);
      ao = this.aoTargets.clean.texture;
    }
    this.copy.uniforms.tDiffuse.value = this.scene_.texture;
    this.copy.uniforms.tAo.value = ao;
    this.copy.uniforms.aoIntensity.value = this.ao.enabled ? this.ao.intensity : 0;
    this.fullscreen(this.copy, this.color);
    if (this.bloomOn && this.bloom.strength > 0.001) this.bloom.render(renderer, null, this.color, 0, false);
    renderer.autoClear = true;
    this.output.render(renderer, null, this.color);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.autoClear = autoClear;
  }

  dispose() {
    this.disposeAo();
    this.scene_?.depthTexture?.dispose(); this.scene_?.dispose(); this.color?.dispose();
    this.scene_ = this.color = null;
    this.white.dispose(); this.copy.dispose(); this.quad.dispose();
  }
}
