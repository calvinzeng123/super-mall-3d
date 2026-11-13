// 一期大中庭 1F 地面的实时倒影（效果图里抛光石材地面上倒映着栏板灯带、店招和人）。
// 做法：1F 公共地面上铺一层“倒影膜”——three 的平面镜（Reflector）把场景按地面镜像渲染到一张贴图里，
// 膜按菲涅尔（越斜看越亮）和一点竖向模糊叠在原地面上，看起来是光亮的石材，而不是镜子。
// 只在精细/极致画质（HDR 光影开着）、漫游模式、人在中庭附近时才开：倒影要把场景再画一遍，手机和鸟瞰都不需要。
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import clipping from 'polygon-clipping';

const SHADER = {
  name: 'GlossFloorReflection',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    strength: { value: 0.24 }, texel: { value: new THREE.Vector2(1 / 1024, 1 / 640) },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform vec2 texel;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec2 uv = vUv.xy / vUv.w;
      // 抛光石材的倒影是竖向拉长、略糊的：横向 2 个点、竖向 4 个点加权
      vec3 c = texture2D(tDiffuse, uv).rgb * 0.28;
      c += (texture2D(tDiffuse, uv + vec2(texel.x * 1.5, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(texel.x * 1.5, 0.0)).rgb) * 0.12;
      c += (texture2D(tDiffuse, uv + vec2(0.0, texel.y * 3.0)).rgb + texture2D(tDiffuse, uv - vec2(0.0, texel.y * 3.0)).rgb) * 0.14;
      c += (texture2D(tDiffuse, uv + vec2(0.0, texel.y * 7.0)).rgb + texture2D(tDiffuse, uv - vec2(0.0, texel.y * 7.0)).rgb) * 0.10;
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = 0.45 + 0.55 * pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
      gl_FragColor = vec4(c * color, strength * fres);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/** 世界坐标 xz 多边形（polygon-clipping 的多面体：[[外圈, 洞...], ...]）→ 平放在 y 高度、法线朝上的平面网格的形状。 */
function shapesOf(multi) {
  const shapes = [];
  for (const [outer, ...holes] of multi) {
    // 平面在本地 XY，绕 X 轴转 −90° 放平：本地 (x, y) → 世界 (x, −y)，所以这里 y 取 −z
    const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    shapes.push(s);
  }
  return shapes;
}

/**
 * 在 P1-1F 的公共地面上铺倒影膜：一期 1F 外轮廓扣掉铺位、房间和井道（只在中庭下面铺的话，倒影到楼板投影线处会一刀切断）。
 * 返回网格（没有可铺的地面时返回 null），测试用。
 */
export function buildAtriumReflection(ctx) {
  const lv1 = ctx.layout.levels.find((l) => l.id === 'P1-1F'), L = ctx.levels['P1-1F'];
  if (!lv1?.outline || !L) return null;
  let area = [[lv1.outline]];
  // 扣掉 1F 上不是公共走道的东西：铺位、房间（核心筒、卫生间、设备间）、井道。一块一块扣（几十块一起并集时 polygon-clipping 偶尔会失败）
  const cut = [...lv1.units.flatMap((u) => u.polys), ...(lv1.rooms || []).flatMap((r) => r.polys || []), ...lv1.voids.map((v) => v.poly)];
  for (const q of cut) {
    try { area = clipping.difference(area, [q]); } catch { /* 退化的小块：跳过 */ }
  }
  if (!area.length) return null;
  const geom = new THREE.ShapeGeometry(shapesOf(area));
  const renderer = ctx.renderer;
  const size = new THREE.Vector2(1024, 640);
  const mesh = new Reflector(geom, { shader: SHADER, textureWidth: size.x, textureHeight: size.y, multisample: 0, clipBias: 0.003, color: 0xffffff });
  const m = mesh.material;
  m.transparent = true; m.depthWrite = false;
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = lv1.elev + 0.004;
  mesh.name = 'P1-atrium-reflection';
  mesh.renderOrder = -1; // 先于店面光斑这些贴花画，光斑叠在倒影上
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.userData.noPick = true;
  L.base.add(mesh);
  // 夜里倒影更显（灯带、店招是亮的，周围是暗的）
  ctx.mats.onNight((t) => { m.uniforms.strength.value = 0.22 + t * 0.14; });
  // 开关：精细画质以上、漫游中、人在一期 1F 外轮廓 60 米以内。贴图跟着画布大小走（一半分辨率）
  geom.computeBoundingSphere();
  const centre = geom.boundingSphere.center.clone().applyEuler(mesh.rotation);
  centre.y = lv1.elev;
  const reach = geom.boundingSphere.radius + 60, buf = new THREE.Vector2();
  ctx.dynamic.push({ name: 'p1-atrium-reflection', update(dt, elapsed, app) {
    const cam = ctx.camera;
    const on = !!ctx.mats.hdr && !!app?.explore?.active && cam.position.distanceTo(centre) < reach;
    mesh.visible = on;
    if (!on || !renderer) return;
    renderer.getDrawingBufferSize(buf);
    const w = Math.max(256, Math.round(buf.x * 0.5)), h = Math.max(256, Math.round(buf.y * 0.5));
    if (w !== size.x || h !== size.y) {
      size.set(w, h);
      mesh.getRenderTarget().setSize(w, h);
      m.uniforms.texel.value.set(1 / w, 1 / h);
    }
  } });
  return mesh;
}
