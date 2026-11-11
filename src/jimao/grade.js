// 几猫的画面反馈：受伤红边、低血量去色和脉动暗角、开镜收紧的暗角、受伤时的轻微色散、开火闪白、黑场淡入淡出。
// 公式照搬原游戏的合成着色器（它的 grade 段），只取跟玩法有关的这几项；它的辉光、镜头脏污、太阳光晕、自动曝光不搬。
// 做法：世界和枪先画进一张离屏图，再用一个全屏三角形把图贴回屏幕，顺手做完这些效果和色调映射。
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const FRAGMENT = /* glsl */`
uniform sampler2D tScene; uniform float uAspect, uDamage, uLowHealth, uAds, uFlash, uFade, uSaturation, uVignette, uCA, uTime;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0)) / (0.25 * (uAspect * uAspect + 1.0));
  // 径向色散：平时几乎看不出，受伤时变大
  vec2 off = c * r2 * (uCA + uDamage * 0.006);
  vec3 col = vec3(texture2D(tScene, vUv + off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - off).b);
  col += vec3(1.0, 0.97, 0.9) * uFlash * 2.5;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  col = clamp(gl_FragColor.rgb, 0.0, 1.0);
  float l = luma(col);
  // 饱和度：低血量、受伤时去色
  float sat = uSaturation * (1.0 - 0.65 * uLowHealth) * (1.0 - 0.5 * uDamage);
  col = mix(vec3(l), col, sat);
  // 暗角：底子 + 低血量 + 开镜收紧
  float vig = uVignette + uLowHealth * 0.55 + uAds * 0.22;
  float vr = smoothstep(0.15 - uAds * 0.08, 1.05, r2);
  col *= 1.0 - vig * vr * vr * (3.0 - 2.0 * vr);
  // 受伤：四周红边；低血量：红边随心跳脉动
  float edge = smoothstep(0.18, 1.0, r2);
  col = mix(col, vec3(0.55, 0.02, 0.01) * (0.35 + l), clamp(uDamage * edge * 0.85 + uLowHealth * edge * edge * 0.25 * (0.75 + 0.25 * sin(uTime * 5.0)), 0.0, 1.0));
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** samples：离屏图的多重采样数（画布本身的抗锯齿在离屏图上不起作用）。 */
export function createGrade(renderer, post, { samples = 4, vignette = 0.12 } = {}) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
  target.texture.name = 'jimao-scene';
  const uniforms = {
    tScene: { value: target.texture }, uAspect: { value: 1 }, uDamage: { value: 0 }, uLowHealth: { value: 0 }, uAds: { value: 0 },
    uFlash: { value: 0 }, uFade: { value: 0 }, uSaturation: { value: 1 }, uVignette: { value: vignette }, uCA: { value: 0.0015 }, uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'jimao-grade', uniforms, fragmentShader: FRAGMENT,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(material), size = new THREE.Vector2();
  return {
    target,
    /** 这一帧往离屏图里画 */
    begin() {
      renderer.getDrawingBufferSize(size);
      if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
      renderer.setRenderTarget(target);
    },
    /** 贴回屏幕 */
    end(time) {
      Object.assign(uniforms.uAspect, { value: size.x / Math.max(1, size.y) });
      uniforms.uDamage.value = post.damage || 0; uniforms.uLowHealth.value = post.lowHealth || 0; uniforms.uAds.value = post.ads || 0;
      uniforms.uFlash.value = post.flash || 0; uniforms.uFade.value = post.fade || 0; uniforms.uSaturation.value = post.saturation ?? 1; uniforms.uTime.value = time;
      renderer.setRenderTarget(null);
      quad.render(renderer);
    },
    dispose() { target.dispose(); material.dispose(); quad.dispose(); },
  };
}
