// 开场场景里的「布景」：天空、远景楼群（园区真实楼型 + 立面贴图）、公寓楼顶、沙袋机枪阵地、商场门口街景、
// 直升机加强（旋翼模糊盘、下洗气流）、雨、溅水、火星、烟柱、碎纸。镜头、灯光、后期在 scene.js。
// 每个 build*() 往传进来的 group 里加东西，返回每帧要动的那几样；所有贴图、几何在 scene.dispose() 时统一遍历释放。
// 坐标：公寓 A 楼顶中心在原点（园区坐标 x + OX、z + OZ），楼顶高 R0 米。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TITLE_TOWERS } from './title-data.js';

// ---------------------------------------------------------------- 常量与小工具
const TOWER_A = TITLE_TOWERS.find((t) => t.id === 'A');
export const OX = -TOWER_A.x, OZ = -TOWER_A.z;
/** 公寓 A 楼顶的高度（米） */
export const R0 = Math.round(TOWER_A.h * 10) / 10;
/** 女儿墙高 */
export const PARA = 1.25;
/** 机枪阵地中心（枪口朝 -z） */
export const EMP = new THREE.Vector3(-6, R0, 20);
/** 商场门口那条街的原点（公寓北边，朝商场方向） */
export const STR = new THREE.Vector3(-60, 0, 120);

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** 可重复的随机数（同一个种子每次一样：截图、导出视频逐帧一致） */
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const canvas2d = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const canvasTex = (c, srgb = true, repeat = false) => {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; return t;
};
/** 中心亮、四周透明的圆形光斑（灯、火光、雾片共用） */
export function radialTex(stops, S = 128) {
  const [c, g] = canvas2d(S); const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, S, S); return canvasTex(c);
}
let SOFT_TEX = null;
export const softTex = () => (SOFT_TEX ||= radialTex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.4)'], [1, 'rgba(0,0,0,0)']]));
export function resetShared() { SOFT_TEX = null; }

/** 发光点（信标、警灯、远处的火）：加色混合的精灵 */
export function glowSprite(color, size, mul = 3, fog = false) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: new THREE.Color(color).multiplyScalar(mul), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog, toneMapped: true }));
  s.scale.setScalar(size); return s;
}

// ---------------------------------------------------------------- PBR 贴图（仓库里现成的 CC0 扫描贴图）
const TEX_DIR = 'assets/textures/scans/';
/** 读一组扫描贴图（颜色 + 法线），repeat 米一块。base：网站根目录（打包时可换） */
export async function loadScan(base, id, loader = new THREE.TextureLoader()) {
  const [map, normalMap] = await Promise.all(['color', 'normal'].map((k) => loader.loadAsync(`${base}${TEX_DIR}${id}/${k}.jpg`)));
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, normalMap };
}
const withRepeat = (set, rx, ry = rx) => {
  const c = (t) => { const k = t.clone(); k.repeat.set(rx, ry); k.needsUpdate = true; return k; };
  return { map: c(set.map), normalMap: c(set.normalMap) };
};

/** 程序生成的粗糙度 / 积水图：低洼处积水（粗糙度低、颜色深），其余是湿水泥。灰度，r 通道 = 粗糙度 */
function puddleTex(seed, S = 512, wet = 0.45) {
  const [c, g] = canvas2d(S), r = rng(seed), img = g.createImageData(S, S), d = img.data;
  // 几层低频噪声叠出水洼形状
  const N = 24, grid = Array.from({ length: (N + 1) * (N + 1) }, () => r());
  const noise = (x, y, f) => { x *= f; y *= f; const i = Math.floor(x) % N, j = Math.floor(y) % N, fx = x % 1, fy = y % 1, s = (t) => t * t * (3 - 2 * t);
    const at = (a, b) => grid[(b % N) * (N + 1) + (a % N)]; const a0 = at(i, j), a1 = at(i + 1, j), b0 = at(i, j + 1), b1 = at(i + 1, j + 1);
    return (a0 + (a1 - a0) * s(fx)) + ((b0 + (b1 - b0) * s(fx)) - (a0 + (a1 - a0) * s(fx))) * s(fy); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, n = noise(u, v, 6) * 0.6 + noise(u, v, 13) * 0.3 + noise(u, v, 29) * 0.1;
    const pud = clamp((n - (1 - wet)) * 6);
    const rough = lerp(0.62, 0.06, pud) + (r() - 0.5) * 0.06;
    const k = (y * S + x) * 4; d[k] = d[k + 1] = d[k + 2] = clamp(rough) * 255; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); return canvasTex(c, false, true);
}

// ---------------------------------------------------------------- 天空：冷色夜空 + 城市火光映红的地平线 + 云 + 月亮
export function buildSky(group) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uT: { value: 0 }, uFlash: { value: 0 }, uLift: { value: 1 }, uMoon: { value: V(-0.45, 0.42, -0.78).normalize() } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    // 着色器里：深青灰的夜空（不是纯黑）：天顶偏蓝，地平线一圈被城里的火映成暗橙
    //   月亮在云后面：一大圈冷光晕，云边被它照亮
    //   月光照亮的云边
    fragmentShader: `varying vec3 vD; uniform float uT, uFlash, uLift; uniform vec3 uMoon;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
    void main(){
      vec3 d = normalize(vD); float y = d.y;

      vec3 top = vec3(0.028,0.042,0.068), mid = vec3(0.075,0.098,0.125), hor = vec3(0.30,0.17,0.10);
      vec3 c = mix(mid, top, smoothstep(0.02, 0.65, y));
      float glowDir = 0.55 + 0.45 * dot(normalize(d.xz + 1e-4), normalize(vec2(-0.6, 0.8)));
      c = mix(c, hor * (0.55 + 0.8 * glowDir), exp(-max(y,0.0) * 7.0) * 0.85);

      float md = max(dot(d, uMoon), 0.);
      vec3 moonGlow = vec3(0.30,0.38,0.52) * (pow(md, 18.) * 0.9 + pow(md, 400.) * 3.0);
      vec2 uv = d.xz / max(0.12, y + 0.18) * 1.5 + vec2(uT * 0.018, uT * 0.006);
      float cl = fbm(uv), cloud = smoothstep(0.32, 0.82, cl);
      vec3 cc = mix(vec3(0.085,0.10,0.12), vec3(0.32,0.18,0.10) * (0.4+glowDir), exp(-max(y,0.)*3.2));
      cc += vec3(0.20,0.25,0.32) * pow(md, 6.) * (1. - cloud) * 0.8;
      c = mix(c + moonGlow * (1. - cloud * 0.85), cc, cloud * 0.85 * smoothstep(-0.05, 0.15, y));
      c += uFlash * vec3(0.55,0.6,0.78) * (0.35 + cloud) * smoothstep(-0.1, 0.4, y);
      if (y < 0.0) c = mix(hor * 0.45, vec3(0.03,0.035,0.04), smoothstep(0.0, -0.25, y));
      gl_FragColor = vec4(c * uLift, 1.);
    }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat); sky.frustumCulled = false; sky.renderOrder = -10; group.add(sky);
  return { mesh: sky, uniforms: mat.uniforms };
}

// ---------------------------------------------------------------- 楼的立面贴图：窗格、楼层带、壁柱、空调机位，随机暖灯（不出现红蓝彩窗）
/**
 * kind：'res' 住宅（窗小、带阳台栏板）、'office' 写字楼（横向玻璃带）、'old' 老楼（窗不齐、脏）、'mall' 商场（大块幕墙）。
 * 返回 { map, emissiveMap, roughnessMap, bays, floors, bayW, floorH }：一张贴图横 bays 跨、竖 floors 层。
 */
export function facadeTex(seed, kind = 'res', S = 512) {
  const r = rng(seed);
  const spec = { res: { bays: 6, floors: 12, lit: 0.075 }, office: { bays: 8, floors: 12, lit: 0.05 }, old: { bays: 6, floors: 10, lit: 0.09 }, mall: { bays: 6, floors: 4, lit: 0.015 } }[kind];
  const { bays, floors } = spec, bw = S / bays, fh = (S * 2) / floors, H = S * 2;
  const [c, g] = canvas2d(S, H), [e, ge] = canvas2d(S, H), [ro, gr] = canvas2d(S, H);
  // 底色：混凝土 / 涂料，带竖向的雨水污痕
  const base = { res: [74, 76, 78], office: [52, 58, 64], old: [82, 76, 68], mall: [46, 50, 54] }[kind];
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, S, H);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, H);
  gr.fillStyle = 'rgb(215,215,215)'; gr.fillRect(0, 0, S, H);
  for (let i = 0; i < 900; i++) { const v = r(); g.fillStyle = `rgba(${v < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + r() * 0.05})`; g.fillRect(r() * S, r() * H, 2 + r() * 10, 2 + r() * 10); }
  for (let j = 0; j < floors; j++) {
    const y = j * fh;
    // 楼层带（楼板）：比墙亮一点，下沿一道阴影
    const band = kind === 'office' ? 0.26 : 0.14;
    g.fillStyle = `rgba(150,150,145,${kind === 'mall' ? 0.15 : 0.22})`; g.fillRect(0, y + fh * (1 - band), S, fh * band);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + fh * (1 - band) - 2, S, 2);
    for (let i = 0; i < bays; i++) {
      const x = i * bw;
      let wx = x + bw * 0.16, wy = y + fh * 0.16, ww = bw * 0.68, wh = fh * 0.6;
      if (kind === 'office') { wx = x + 2; ww = bw - 4; wy = y + fh * 0.06; wh = fh * 0.66; }
      if (kind === 'mall') { wx = x + 3; ww = bw - 6; wy = y + fh * 0.08; wh = fh * 0.78; }
      if (kind === 'old') { wx += (r() - 0.5) * bw * 0.06; wh *= 0.85 + r() * 0.15; }
      // 玻璃：深色，上亮下暗（反着夜空），窗框
      const gl = g.createLinearGradient(0, wy, 0, wy + wh);
      gl.addColorStop(0, kind === 'office' ? '#3a4a58' : '#2c3640'); gl.addColorStop(1, '#10161c');
      g.fillStyle = '#1b1e21'; g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
      gr.fillStyle = 'rgb(28,28,28)'; gr.fillRect(wx, wy, ww, wh);
      // 竖梃
      g.fillStyle = '#15181b'; const m = kind === 'office' ? 3 : kind === 'mall' ? 2 : 1;
      for (let k = 1; k <= m; k++) g.fillRect(wx + (ww * k) / (m + 1) - 1, wy, 2, wh);
      const k = r();
      if (k < spec.lit) {
        // 亮灯：钨丝暖黄或者暖白日光灯；拉了一半窗帘的只亮一截
        const warm = r() < 0.7, w = 0.55 + r() * 0.45, half = r() < 0.4;
        const col = warm ? [255 * w, 176 * w, 96 * w] : [255 * w, 228 * w, 188 * w];
        const lg = ge.createLinearGradient(0, wy, 0, wy + wh); lg.addColorStop(0, `rgba(${col.map((v) => v * 0.7 | 0)},1)`); lg.addColorStop(1, `rgba(${col.map((v) => v | 0)},1)`);
        ge.fillStyle = lg; const cx = half ? wx + ww * (0.35 + r() * 0.3) : wx;
        ge.fillRect(cx, wy, half ? ww * 0.3 : ww, wh);
        ge.fillStyle = 'rgba(0,0,0,0.5)'; for (let q = 1; q <= m; q++) ge.fillRect(wx + (ww * q) / (m + 1) - 1, wy, 2, wh);
        g.fillStyle = `rgba(${col.map((v) => v | 0)},0.35)`; g.fillRect(cx, wy, half ? ww * 0.3 : ww, wh);
      } else if (k < spec.lit + 0.06 && kind !== 'mall') {
        // 窗帘（米色、灰），不发光
        g.fillStyle = `rgba(${r() < 0.5 ? '120,108,92' : '86,88,90'},0.7)`; g.fillRect(wx + (r() < 0.5 ? 0 : ww * 0.5), wy, ww * 0.5, wh);
      } else if (k > 0.985) {
        // 远处着火的房间：橙色、下半截亮
        ge.fillStyle = 'rgba(255,110,30,0.95)'; ge.fillRect(wx, wy + wh * 0.45, ww, wh * 0.55);
      }
      if (kind === 'res') {
        // 阳台栏板 + 空调外机
        g.fillStyle = 'rgba(160,160,155,0.55)'; g.fillRect(x + bw * 0.08, y + fh * 0.62, bw * 0.84, fh * 0.16);
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + bw * 0.08, y + fh * 0.78, bw * 0.84, 2);
        if (r() < 0.5) { g.fillStyle = '#8d9093'; g.fillRect(x + bw * 0.78, y + fh * 0.82, bw * 0.16, fh * 0.12); g.fillStyle = '#3a3d40'; g.beginPath(); g.arc(x + bw * 0.86, y + fh * 0.88, fh * 0.04, 0, 7); g.fill(); }
      }
    }
    if (kind !== 'office' && kind !== 'mall') for (let i = 0; i <= bays; i++) { g.fillStyle = 'rgba(110,110,106,0.35)'; g.fillRect(i * bw - 3, y, 6, fh); }
  }
  // 雨水污痕：从楼层带往下拖
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.1})`; g.fillRect(r() * S, r() * H, 1 + r() * 3, 20 + r() * 90); }
  const map = canvasTex(c, true, true), emissiveMap = canvasTex(e, true, true), roughnessMap = canvasTex(ro, false, true);
  return { map, emissiveMap, roughnessMap, bays, floors, bayW: kind === 'office' ? 3.6 : 3.4, floorH: 3.1 };
}

/** 盒子楼：侧面按真实尺寸铺立面贴图（窗不会被拉长），顶上是屋面 */
function towerGeometry(w, h, d, tex) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const tw = tex.bays * tex.bayW, th = tex.floors * tex.floorH;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + w / 2, y = p.getY(i) + h / 2, z = p.getZ(i) + d / 2;
    if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z / tw, y / th); else if (Math.abs(n.getZ(i)) > 0.5) uv.setXY(i, x / tw, y / th); else uv.setXY(i, x / 40, z / 40);
  }
  return g;
}
function facadeMaterial(tex, emissive = 1.6) {
  return new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissiveMap, emissive: 0xffffff, emissiveIntensity: emissive, roughnessMap: tex.roughnessMap, roughness: 1, metalness: 0.15, envMapIntensity: 1.2 });
}

/**
 * 高度雾：离地越高雾越薄（楼脚埋在雾里、楼顶露出来），只给远景楼群和地面用。
 * 在材质自己的着色器里改 fog_fragment，不动全局的 ShaderChunk（游戏后面还要用同一份 three）。
 */
export function heightFog(m, { falloff = 0.018, floor = 0.35 } = {}) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying float vFogY;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvFogY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nvarying float vFogY;')
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
        float hf = mix(1.0, ${floor.toFixed(3)}, 1.0 - exp(-max(vFogY, 0.0) * ${falloff.toFixed(4)}));
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * hf * hf);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
      #endif`);
  };
  m.customProgramCacheKey = () => `hfog-${falloff}-${floor}`;
  return m;
}

// ---------------------------------------------------------------- 远景楼群：园区真实楼型 + 外围填充的城市天际线 + 地面路网 + 街灯和火点
export function buildCity(group, { fillers = 150, fires = 40 } = {}) {
  // 远景楼贴图用 256 宽（远看够了），省显存；主角公寓楼在 buildApartment 里单独用 512
  const tex = { res: facadeTex(11, 'res', 256), office: facadeTex(23, 'office', 256), old: facadeTex(37, 'old', 256), mall: facadeTex(31, 'mall', 256) };
  const mats = Object.fromEntries(Object.entries(tex).map(([k, t]) => [k, heightFog(facadeMaterial(t, k === 'mall' ? 0.8 : 1.7))]));
  const roofMat = heightFog(new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.85 }));
  const crownMat = heightFog(new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.7, metalness: 0.3 }));
  const beacons = [];
  // 几百栋楼按材质合并成几个大网格（一栋一个网格要上千次绘制调用）
  const sides = { res: [], office: [], old: [], mall: [] }, roofs = [], crowns = [];
  const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), S4 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  const place = (geo, x, y, z, rot) => geo.applyMatrix4(M4.compose(new THREE.Vector3(x, y, z), Q4.setFromAxisAngle(UP, rot), S4));
  const addTower = (x, z, w, d, h, y, rot, kind) => {
    const g = towerGeometry(w, h, d, tex[kind]);
    // 盒子的 6 个面分两份：四个侧面（立面贴图）、顶和底（屋面）
    const idx = g.index.array, side = [], top = [];
    for (const gr of g.groups) for (let i = gr.start; i < gr.start + gr.count; i++) (gr.materialIndex === 2 || gr.materialIndex === 3 ? top : side).push(idx[i]);
    const mk = (list) => { const k = new THREE.BufferGeometry(); for (const n of ['position', 'normal', 'uv']) k.setAttribute(n, g.attributes[n].clone()); k.setIndex(list); return place(k, x, y + h / 2, z, rot); };
    sides[kind].push(mk(side)); roofs.push(mk(top)); g.dispose();
  };
  // 楼顶轮廓：机房、退台、桅杆（红色航空障碍灯）
  const crown = (x, top, z, w, d, rot, k) => {
    const c = Math.cos(rot), s2 = Math.sin(rot), at = (lx, lz) => [x + lx * c + lz * s2, z - lx * s2 + lz * c];
    const box = (bw, bh, bd, lx, ly, lz) => { const [px, pz] = at(lx, lz); crowns.push(place(new THREE.BoxGeometry(bw, bh, bd), px, top + ly, pz, rot)); };
    box(w * 0.45, 4.5, d * 0.4, w * 0.12, 2.25, 0); box(w * 0.22, 7.5, d * 0.24, -w * 0.22, 3.75, d * 0.1);
    if (k % 2 === 0) { const [px, pz] = at(-w * 0.22, d * 0.1); crowns.push(place(new THREE.CylinderGeometry(0.15, 0.3, 14, 6), px, top + 14.5, pz, 0));
      const sp = glowSprite(0xff2a1a, 3.2); sp.position.set(px, top + 22, pz); group.add(sp); beacons.push(sp); }
  };
  for (const t of TITLE_TOWERS) {
    if (t.id === 'A') continue; // 主角公寓楼单独建（楼顶有布景）
    const x = t.x + OX, z = t.z + OZ;
    if (t.kind === 'mall' && t.outline) {
      // 商场：照外轮廓挤出来，立面用幕墙贴图
      const shape = new THREE.Shape(t.outline.map((p) => new THREE.Vector2(p[0] + OX, -(p[1] + OZ))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: t.h, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv, p = geo.attributes.position, n = geo.attributes.normal, tw = tex.mall.bays * 5, th = tex.mall.floors * 5;
      for (let i = 0; i < p.count; i++) { const ny = Math.abs(n.getY(i)); if (ny < 0.5) { const along = Math.abs(n.getX(i)) > Math.abs(n.getZ(i)) ? p.getZ(i) : p.getX(i); uv.setXY(i, along / tw, p.getY(i) / th); } else uv.setXY(i, p.getX(i) / 40, p.getZ(i) / 40); }
      const m = new THREE.Mesh(geo, [roofMat, mats.mall]); m.position.y = t.y || 0; m.receiveShadow = true; group.add(m);
      continue;
    }
    const kind = t.id.startsWith('R') ? 'office' : t.id.startsWith('W') ? 'old' : 'res';
    addTower(x, z, t.w, t.d, t.h, t.y || 0, t.rot, kind);
    crown(x, (t.y || 0) + t.h, z, t.w, t.d, t.rot, t.id.length + (t.id.charCodeAt(t.id.length - 1) || 0));
  }
  // 外围填充：一圈圈的城市楼群（只看剪影 + 窗灯），空出航拍镜头的飞行路线
  const r = rng(77), kinds = ['res', 'office', 'old', 'res'];
  for (let i = 0; i < fillers; i++) {
    const a = r() * Math.PI * 2, dd = 360 + r() * 1100, w = 22 + r() * 40, d = 18 + r() * 36, h = 28 + Math.pow(r(), 1.5) * 170;
    if (Math.abs(((a - 2.33 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.42 && dd < 900) continue;
    const kind = kinds[i % kinds.length], x = Math.cos(a) * dd, z = Math.sin(a) * dd, rot = r() * 0.5;
    addTower(x, z, w, d, h, 0, rot, kind);
    if (h > 110 && r() < 0.6) { const s = glowSprite(0xff2a1a, 5); s.position.set(x, h + 1.5, z); group.add(s); beacons.push(s); }
  }
  const merged = (list, mat) => { if (!list.length) return; const g = mergeGeometries(list); list.forEach((x) => x.dispose()); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m); };
  for (const k of Object.keys(sides)) merged(sides[k], mats[k]);
  merged(roofs, roofMat);
  for (const c of crowns) if (c.attributes.uv) c.deleteAttribute('uv');
  merged(crowns.map((c) => (c.index ? c.toNonIndexed() : c)), crownMat);
  // 地面：路网（深色沥青、浅色人行道、车道线），湿的
  const [c, g] = canvas2d(1024), rr = rng(5);
  g.fillStyle = '#2b2d2f'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '200,200,200'},${rr() * 0.05})`; g.fillRect(rr() * 1024, rr() * 1024, 4 + rr() * 30, 4 + rr() * 30); }
  for (let k = 0; k < 4; k++) {
    const o = k * 256;
    g.fillStyle = '#141617'; g.fillRect(o + 220, 0, 36, 1024); g.fillRect(0, o + 220, 1024, 36); // 马路
    g.fillStyle = 'rgba(200,190,150,0.5)'; for (let y = 0; y < 1024; y += 22) { g.fillRect(o + 237, y, 2, 11); g.fillRect(y, o + 237, 11, 2); }
    g.fillStyle = '#3e4143'; g.fillRect(o + 214, 0, 6, 1024); g.fillRect(o + 256, 0, 6, 1024); g.fillRect(0, o + 214, 1024, 6); g.fillRect(0, o + 256, 1024, 6);
  }
  const gt = canvasTex(c, true, true); gt.repeat.set(30, 30);
  const rough = puddleTex(9, 256, 0.5); rough.repeat.set(90, 90);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), heightFog(new THREE.MeshStandardMaterial({ map: gt, roughnessMap: rough, roughness: 1, metalness: 0.0, envMapIntensity: 1.4 })));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);
  // 零星还亮着的路灯（钠灯，暖橙），沿着路网；远处路口烧着的车（橙光 + 烟）
  const lampPos = [], rl = rng(13), cell = 8000 / 30 / 4;
  for (let i = 0; i < 320; i++) {
    const gx = Math.round((rl() - 0.5) * 22), gz = Math.round((rl() - 0.5) * 22), along = (rl() - 0.5) * cell;
    const x = gx * cell + (rl() < 0.5 ? along : 0) - cell * 0.03, z = gz * cell + (rl() < 0.5 ? 0 : along) - cell * 0.03;
    if (Math.hypot(x, z) < 70 || rl() < 0.35) continue;
    lampPos.push(x, 9, z);
  }
  // 路灯：一个 Points 画完（几百个精灵要几百次绘制调用）
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  const lamps = new THREE.Points(lg, new THREE.PointsMaterial({ map: softTex(), color: new THREE.Color(1, 0.63, 0.31).multiplyScalar(1.6), size: 9, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true }));
  lamps.frustumCulled = false; group.add(lamps);
  const fireSprites = [], fr = rng(9);
  for (let i = 0; i < fires; i++) {
    const a = fr() * Math.PI * 2, d = 140 + fr() * 900, p = V(Math.cos(a) * d, 3, Math.sin(a) * d);
    const s = glowSprite(new THREE.Color(1, 0.4, 0.1), 8 + fr() * 14, 2 + fr() * 2); s.position.copy(p); group.add(s); fireSprites.push(s);
  }
  return { beacons, lamps, fires: fireSprites, materials: mats };
}

// ---------------------------------------------------------------- 主角公寓楼 + 楼顶（湿水泥、女儿墙、停机坪、楼梯间、水箱、空调外机、天线）
export function buildApartment(group, scans) {
  const tex = facadeTex(3, 'res');
  const body = new THREE.Mesh(towerGeometry(38, R0, 74, tex), [facadeMaterial(tex, 1.6), facadeMaterial(tex, 1.6), new THREE.MeshStandardMaterial({ color: 0x222 }), new THREE.MeshStandardMaterial({ color: 0x222 }), facadeMaterial(tex, 1.6), facadeMaterial(tex, 1.6)]);
  body.position.set(0, R0 / 2 - 0.01, 0); body.receiveShadow = true; group.add(body);
  // 屋面：扫描水泥贴图 + 积水粗糙度（低洼处反光）
  const slabSet = withRepeat(scans.concrete, 12, 24), pud = puddleTex(21, 512, 0.42); pud.repeat.set(4, 8);
  const wetMat = new THREE.MeshStandardMaterial({ ...slabSet, color: 0x9a9a96, roughnessMap: pud, roughness: 1, metalness: 0, envMapIntensity: 1.6, normalScale: new THREE.Vector2(0.8, 0.8) });
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(38, 74), wetMat); slab.rotation.x = -Math.PI / 2; slab.position.y = R0; slab.receiveShadow = true; group.add(slab);
  const wallSet = withRepeat(scans.formed, 6, 1);
  const con = new THREE.MeshStandardMaterial({ ...wallSet, color: 0xb0aca4, roughness: 0.82, envMapIntensity: 1 });
  const pw = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, PARA, d), con); m.position.set(x, R0 + PARA / 2, z); m.castShadow = m.receiveShadow = true; group.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.1, d + 0.14), con); cap.position.set(x, R0 + PARA + 0.05, z); cap.receiveShadow = true; group.add(cap);
  };
  pw(38, 0.3, 0, -37); pw(38, 0.3, 0, 37); pw(0.3, 74, -19, 0); pw(0.3, 74, 19, 0);
  // 停机坪：画在屋面上的圆圈和 H（旧、斑驳）
  const [c, g] = canvas2d(512), rr = rng(4);
  g.clearRect(0, 0, 512, 512); g.strokeStyle = '#d8d2bc'; g.lineWidth = 20; g.beginPath(); g.arc(256, 256, 220, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#d8d2bc'; for (const [x, y, w, h] of [[160, 130, 50, 250], [302, 130, 50, 250], [160, 230, 192, 46]]) g.fillRect(x, y, w, h);
  g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${rr() * 0.7})`; g.fillRect(rr() * 512, rr() * 512, 2 + rr() * 6, 2 + rr() * 6); }
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ map: canvasTex(c), transparent: true, roughness: 0.4, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, R0 + 0.01, -6); group.add(pad);
  // 楼梯间出口：门里亮着应急绿灯，门边一盏红色警示灯
  const hh = new THREE.Mesh(new THREE.BoxGeometry(7, 3.6, 6), con); hh.position.set(9, R0 + 1.8, -24); hh.castShadow = hh.receiveShadow = true; group.add(hh);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.85, 0.65).multiplyScalar(1.4) })); door.position.set(7.5, R0 + 1.15, -20.99); group.add(door);
  const lamp = glowSprite(0xff2010, 1.2); lamp.position.set(9, R0 + 2.9, -20.9); group.add(lamp);
  // 水箱、空调外机、天线（金属：环境反射 + 雨水）
  const metal = new THREE.MeshStandardMaterial({ color: 0x5a6064, roughness: 0.38, metalness: 0.7, envMapIntensity: 1.3 });
  for (const [x, z, w, h, d] of [[-12, -28, 4, 1.8, 3], [-12, -23, 4, 1.8, 3], [13, 8, 3, 1.4, 6], [13, 16, 3, 1.4, 6], [-14, 30, 3, 2.4, 3]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metal); m.position.set(x, R0 + h / 2, z); m.castShadow = m.receiveShadow = true; group.add(m);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.32, Math.min(w, d) * 0.32, 0.06, 24), new THREE.MeshStandardMaterial({ color: 0x181a1b, roughness: 0.6 })); fan.position.set(x, R0 + h + 0.03, z); group.add(fan);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3.5, 32), metal); tank.position.set(-13, R0 + 3.8, -12); tank.castShadow = true; group.add(tank);
  for (const [x, z] of [[-14.5, -13.5], [-11.5, -13.5], [-14.5, -10.5], [-11.5, -10.5]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.1, 0.2), metal); l.position.set(x, R0 + 1.05, z); group.add(l); }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 12, 8), metal); mast.position.set(15, R0 + 6, -33); group.add(mast);
  const ml = glowSprite(0xff2a1a, 1.6); ml.position.set(15, R0 + 12.2, -33); group.add(ml);
  return { beacons: [ml, lamp], slab, wetMat };
}

// ---------------------------------------------------------------- 沙袋：压扁的袋形（不是球），两头收口、中间鼓、表面有褶，麻布贴图
/** 一只沙袋的几何：长 len、宽 wid、高 hgt；局部原点在袋底中心 */
export function sandbagGeometry(len = 0.62, wid = 0.36, hgt = 0.2, seed = 1) {
  const r = rng(seed), g = new THREE.BoxGeometry(1, 1, 1, 14, 5, 8), p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // 先把方块揉成圆角枕头：越靠边越往里收
    const ax = Math.abs(v.x) * 2, az = Math.abs(v.z) * 2, ay = v.y * 2; // -1..1
    const pinch = 1 - 0.55 * Math.pow(ax, 4);             // 两头收口
    const belly = 1 - 0.35 * Math.pow(Math.abs(ay), 2);   // 上下压扁后侧面鼓出来
    let x = v.x * (1 - 0.08 * Math.pow(Math.abs(ay), 2));
    let z = v.z * pinch * belly;
    let y = v.y * pinch * (1 - 0.25 * Math.pow(az, 3)) + (v.y > 0 ? 0.1 * (1 - ax * ax) * (1 - az * az) : 0);
    // 褶皱 + 一点随机的鼓包
    const wr = 0.035 * Math.sin(x * 28 + seed) * Math.cos(z * 19) + 0.02 * (r() - 0.5);
    p.setXYZ(i, x * len, (y + 0.5) * hgt + wr * hgt * 0.6, z * wid + wr * wid * 0.3);
  }
  g.computeVertexNormals();
  return g;
}
/** 麻布贴图：编织纹理（颜色 + 法线），沙袋共用 */
function burlapTex(S = 256) {
  const [c, g] = canvas2d(S), [n, gn] = canvas2d(S), r = rng(17), img = g.createImageData(S, S), ni = gn.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wx = Math.sin((x / S) * Math.PI * 2 * 48), wy = Math.sin((y / S) * Math.PI * 2 * 48);
    const weave = (wx * wy) * 0.6, k = (y * S + x) * 4, noise = r() * 0.18, dirt = Math.sin(x * 0.05 + y * 0.03) * 0.08;
    const v = 0.62 + weave * 0.12 + noise + dirt;
    img.data[k] = 118 * v; img.data[k + 1] = 104 * v; img.data[k + 2] = 78 * v; img.data[k + 3] = 255;
    ni.data[k] = 128 + wx * 60; ni.data[k + 1] = 128 + wy * 60; ni.data[k + 2] = 230; ni.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); gn.putImageData(ni, 0, 0);
  const map = canvasTex(c, true, true), normalMap = canvasTex(n, false, true); map.repeat.set(2, 1); normalMap.repeat.set(2, 1);
  return { map, normalMap };
}
/** 马蹄形沙袋墙（后面开口），三层错缝；返回 Mesh（合并成一个几何） */
export function buildSandbagWall({ radius = 2.4, arc = Math.PI * 1.55, rows = 3, seed = 8 } = {}) {
  const parts = [], r = rng(seed), L = 0.62, W = 0.36, H = 0.2;
  for (let row = 0; row < rows; row++) {
    const rad = radius - row * 0.06, n = Math.floor((arc * rad) / (L * 0.92));
    for (let i = 0; i < n; i++) {
      const a = -arc / 2 + ((i + (row % 2 ? 0.5 : 0)) / n) * arc;
      if (row % 2 && i === n - 1) continue;
      const g = sandbagGeometry(L * (0.94 + r() * 0.1), W, H * (0.9 + r() * 0.2), seed * 100 + row * 31 + i);
      g.rotateY(-a + Math.PI / 2 + (r() - 0.5) * 0.12); g.rotateZ((r() - 0.5) * 0.06);
      g.translate(Math.sin(a) * rad, row * H * 0.82, -Math.cos(a) * rad);
      parts.push(g);
    }
  }
  const geo = mergeGeometries(parts); parts.forEach((p) => p.dispose());
  const { map, normalMap } = burlapTex();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.45, 0.45), color: 0xeee2c6, roughness: 0.85, metalness: 0, envMapIntensity: 1.3 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- 雨：屏幕空间保底宽度的雨丝（2 倍像素密度下也看得见），被探照灯和警灯照亮
export function buildRain(group, count) {
  const U = {
    uT: { value: 0 }, uCam: { value: V() }, uBox: { value: 40 }, uAmt: { value: 1 }, uRes: { value: new THREE.Vector2(1920, 1080) }, uMinPx: { value: 1.6 },
    uBeamO: { value: V() }, uBeamD: { value: V(0, -1, 0) }, uBeamI: { value: 1 }, uTan: { value: Math.tan(0.13) },
    uPt: { value: V(0, -999, 0) }, uPtC: { value: new THREE.Color(1, 0.15, 0.08) }, uAmb: { value: 0.45 },
  };
  const r = rng(3), base = new THREE.PlaneGeometry(1, 1); base.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position);
  const seeds = new Float32Array(count * 4); for (let i = 0; i < count * 4; i++) seeds[i] = r();
  g.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4)); g.instanceCount = count;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: U,
    // 着色器里：屏幕上的宽度：真实宽度（1.4 厘米）投影出来不够 uMinPx 像素就按 uMinPx 画，亮度按比例减一点（免得近处一片白）
    vertexShader: `attribute vec4 seed; uniform float uT, uBox, uTan, uBeamI, uMinPx, uAmb; uniform vec3 uCam, uBeamO, uBeamD, uPt; uniform vec2 uRes;
      varying float vL; varying vec2 vUv; varying float vPt;
      void main(){
        float B = uBox, H = B * 1.2;
        vec3 p = seed.xyz * vec3(2.*B, H, 2.*B);
        float sp = 15. + seed.w * 6.;
        p.y = mod(p.y - uT * sp, H);
        vec3 c = uCam; vec3 w = c + vec3(mod(p.x - c.x, 2.*B) - B, p.y - H*0.5, mod(p.z - c.z, 2.*B) - B);
        vec3 dir = normalize(vec3(0.12, -1., 0.03));
        float len = 0.5 + seed.w * 0.45;
        vec3 top = w, bot = w + dir * len;
        vec4 ca = projectionMatrix * viewMatrix * vec4(top, 1.), cb = projectionMatrix * viewMatrix * vec4(bot, 1.);
        vec4 cp = mix(ca, cb, position.y);

        float worldPx = 0.014 * projectionMatrix[1][1] * uRes.y * 0.5 / max(cp.w, 0.01);
        float px = max(uMinPx, worldPx);
        vec2 sa = ca.xy / max(ca.w, 0.01), sb = cb.xy / max(cb.w, 0.01);
        vec2 d2 = (sb - sa) * uRes; d2 = length(d2) > 1e-4 ? normalize(d2) : vec2(0., 1.);
        vec2 nrm = vec2(-d2.y, d2.x);
        cp.xy += nrm * position.x * px * 2. / uRes * cp.w;
        float dc = length(w - c);
        vec3 v = w - uBeamO; float al = dot(v, uBeamD); float perp = length(v - uBeamD * al);
        float inC = al > 0. ? smoothstep(uTan * al * 1.3 + 0.3, uTan * al * 0.35, perp) : 0.;
        vPt = 14. / (1. + dot(w - uPt, w - uPt) * 0.06);
        vL = (uAmb + inC * 4.5 * uBeamI + vPt * 0.12) * mix(1., clamp(worldPx / px, 0.25, 1.), 0.6);
        vL *= smoothstep(0.25, 2.0, dc) * (1. - smoothstep(B*0.7, B, dc));
        if (ca.w < 0.05 || cb.w < 0.05) vL = 0.;
        vUv = position.xy + vec2(0.5, 0.);
        gl_Position = cp;
      }`,
    fragmentShader: `varying float vL; varying vec2 vUv; varying float vPt; uniform vec3 uPtC; uniform float uAmt;
      void main(){ float e = 1. - abs(vUv.x - 0.5) * 2.; float t = smoothstep(0., 0.25, vUv.y) * smoothstep(1., 0.55, vUv.y);
        vec3 col = mix(vec3(0.72,0.82,1.0), uPtC, clamp(vPt * 0.08, 0., 0.7));
        gl_FragColor = vec4(col * vL * e * t * uAmt * 0.8, 1.); }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6; group.add(mesh);
  return { mesh, uniforms: U };
}

// ---------------------------------------------------------------- 溅水：雨点落到地面 / 屋面上溅起的小水花（一圈扩散的环 + 中心水珠）
export function buildSplashes(group, count) {
  const U = { uT: { value: 0 }, uCam: { value: V() }, uY: { value: 0 }, uBox: { value: 14 }, uRes: { value: 1080 }, uAmt: { value: 1 }, uLit: { value: new THREE.Color(0.7, 0.78, 0.9) } };
  const r = rng(41), pos = new Float32Array(count * 3), seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) { pos[i * 3] = r(); pos[i * 3 + 1] = 0; pos[i * 3 + 2] = r(); seed[i * 2] = r(); seed[i * 2 + 1] = r(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 2));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: U,
    // 着色器里：每一轮换个落点（同一个水花不在原地反复冒）
    vertexShader: `attribute vec2 seed; uniform float uT, uY, uBox, uRes; uniform vec3 uCam; varying float vA; varying float vK;
      void main(){
        float life = 0.42, ph = fract(uT / life + seed.x), cyc = floor(uT / life + seed.x);

        vec2 jit = fract(vec2(sin(cyc * 12.9898 + seed.y * 78.2), sin(cyc * 39.346 + seed.x * 11.1)) * 43758.5453);
        vec2 xz = (fract(position.xz + jit * 0.37) - 0.5) * 2. * uBox + uCam.xz;
        vec3 w = vec3(xz.x, uY + 0.02 + ph * 0.05, xz.y);
        vec4 mv = viewMatrix * vec4(w, 1.);
        float d = -mv.z;
        vA = (1. - ph) * smoothstep(0.5, 2.5, d) * (1. - smoothstep(uBox * 0.8, uBox, length(xz - uCam.xz)));
        vK = ph;
        gl_PointSize = clamp((0.05 + ph * 0.12) * uRes / max(d, 0.1) * 1.2, 1.5, 40.);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; varying float vK; uniform float uAmt; uniform vec3 uLit;
      void main(){ vec2 p = gl_PointCoord * 2. - 1.; p.y *= 2.2; float r = length(p);
        float ring = smoothstep(0.18, 0.0, abs(r - vK * 0.9)) ; float dot0 = smoothstep(0.35, 0.0, r) * (1. - vK);
        float a = (ring * 0.8 + dot0) * vA * uAmt; if (a < 0.003) discard;
        gl_FragColor = vec4(uLit * a * 0.35, 1.); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 7; group.add(pts);
  return { points: pts, uniforms: U };
}

// ---------------------------------------------------------------- 火星：子弹打在楼顶、丧尸身上迸出的火花（抛物线、拖尾）
export function buildSparks(group, count = 220) {
  const U = { uT: { value: 0 }, uO: { value: [V(), V(), V(), V()] }, uOn: { value: 0 }, uRes: { value: 1080 } };
  const r = rng(61), seed = new Float32Array(count * 4), pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 4; i++) seed[i] = r();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: U,
    vertexShader: `attribute vec4 seed; uniform float uT, uOn, uRes; uniform vec3 uO[4]; varying float vA;
      void main(){
        float life = 0.35 + seed.w * 0.3, ph = fract(uT / life + seed.x);
        int k = int(seed.y * 3.999);
        vec3 o = k == 0 ? uO[0] : k == 1 ? uO[1] : k == 2 ? uO[2] : uO[3];
        float a = seed.z * 6.2832, up = 2.5 + seed.w * 4.;
        vec3 v = vec3(cos(a) * (2. + seed.x * 4.), up, sin(a) * (2. + seed.x * 4.));
        vec3 w = o + v * ph * life + vec3(0., -9.8, 0.) * ph * ph * life * life;
        vec4 mv = viewMatrix * vec4(w, 1.);
        vA = (1. - ph) * uOn;
        gl_PointSize = clamp(0.06 * uRes / max(-mv.z, 0.1), 1.5, 10.);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5) * 2.; float a = smoothstep(1., 0., r) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(2.4, 1.3, 0.45) * a, 1.); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 8; group.add(pts);
  return { points: pts, uniforms: U };
}

// ---------------------------------------------------------------- 烟柱：远处着火的街区冒起的烟（底下被火映橙，上面被月光照冷）
export function buildSmokePlumes(group, spots) {
  const U = { uT: { value: 0 }, uMoon: { value: new THREE.Color(0.32, 0.38, 0.48) } };
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, uniforms: U,
    // 着色器里：圆柱形公告板：绕竖轴转向镜头
    //   往一边被风吹歪
    vertexShader: `varying vec2 vUv; varying float vSeed; attribute float seed;
      void main(){ vUv = uv; vSeed = seed;

        vec3 c = (modelMatrix * vec4(0.,0.,0.,1.)).xyz; vec3 toCam = cameraPosition - c; toCam.y = 0.; toCam = normalize(toCam);
        vec3 right = vec3(toCam.z, 0., -toCam.x);
        vec3 sc = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.);
        vec3 w = c + right * position.x * sc.x + vec3(0., position.y * sc.y, 0.);
        w.x += pow(max(uv.y, 0.), 1.6) * sc.y * 0.35;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.); }`,
    fragmentShader: `varying vec2 vUv; varying float vSeed; uniform float uT; uniform vec3 uMoon;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.07; a*=.5; } return s; }
      void main(){
        vec2 uv = vUv; float y = uv.y;
        float width = mix(0.18, 0.5, pow(y, 0.7));
        float edge = 1. - smoothstep(width * 0.4, width, abs(uv.x - 0.5));
        float d = fbm(vec2(uv.x * 3. + vSeed * 7., y * 4. - uT * 0.12 + vSeed));
        float a = edge * smoothstep(0.32, 0.75, d) * smoothstep(0., 0.08, y) * (1. - smoothstep(0.7, 1., y)) * 0.85;
        vec3 fire = vec3(0.9, 0.38, 0.12) * exp(-y * 7.) * 1.6;
        vec3 col = mix(vec3(0.06, 0.06, 0.065), uMoon * 0.55, smoothstep(0.2, 0.9, y) * d) + fire;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const plumes = [];
  spots.forEach(([x, z, h, w], i) => {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1); g.translate(0, 0.5, 0);
    g.setAttribute('seed', new THREE.Float32BufferAttribute([i * 0.37, i * 0.37, i * 0.37, i * 0.37], 1));
    const p = new THREE.Mesh(g, m); p.position.set(x, 0, z); p.scale.set(w, h, 1); p.frustumCulled = false; p.renderOrder = 1; group.add(p); plumes.push(p);
  });
  return { plumes, uniforms: U };
}

// ---------------------------------------------------------------- 碎纸：街上被风卷着飘的传单、纸片
export function buildDebris(group, n = 36) {
  const r = rng(71), mats = [0xd8d2c0, 0xb8b2a2, 0x9a3a2c, 0xe6e0cf].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }));
  const geo = new THREE.PlaneGeometry(0.21, 0.29, 2, 2);
  const list = [];
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, mats[i % mats.length]); group.add(m); list.push({ m, x: (r() - 0.5) * 26, z: r() * 30, h: 0.2 + r() * 3.5, s: 0.6 + r() * 1.4, p: r() * 10 }); }
  return {
    list,
    step(T) {
      for (const d of list) {
        const t = T * d.s + d.p;
        d.m.position.set(d.x + Math.sin(t * 0.7) * 2 + T * 0.8 * d.s % 8, Math.max(0.03, d.h + Math.sin(t * 1.3) * 0.6 - ((T * 0.3) % 2)), d.z + Math.cos(t * 0.5) * 1.5);
        d.m.rotation.set(t * 2.1, t * 1.3, t * 0.7);
      }
    },
  };
}

// ---------------------------------------------------------------- 直升机加强：旋翼模糊盘（径向条纹 + 桨尖亮环）、尾桨模糊、短翼和挂架、下洗气流
/** 换掉 ride-vehicles 那块几乎看不见的灰盘子：转得飞快的旋翼在镜头里是一圈有条纹的半透明盘 */
export function upgradeHeli(heli) {
  const U = { uT: { value: 0 }, uLit: { value: 1 } };
  const blurMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: U,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec2 vP; uniform float uT, uLit;
      void main(){ float r = length(vP) / 5.3; float a = atan(vP.y, vP.x);
        float blades = pow(abs(cos(a - uT * 47.0)), 26.) + pow(abs(cos(a - uT * 47.0 + 1.5708)), 26.);
        float hub = smoothstep(0.12, 0.08, r);
        float tip = smoothstep(0.015, 0.0, abs(r - 0.985)) * 0.18;
        float alpha = (0.07 + blades * 0.18 + tip) * smoothstep(1.0, 0.97, r) * smoothstep(0.05, 0.12, r) + hub * 0.6;
        vec3 c = mix(vec3(0.05,0.055,0.06), vec3(0.45,0.5,0.55) * uLit, tip + blades * 0.2);
        gl_FragColor = vec4(c, alpha); }`,
  });
  let disc = null;
  heli.root.traverse((o) => { if (o.isMesh && o.geometry?.type === 'CircleGeometry' && Math.abs((o.geometry.parameters?.radius || 0) - 5.3) < 0.01) disc = o; });
  if (disc) { disc.material = blurMat; disc.renderOrder = 4; }
  // 机身加点军用直升机的轮廓：短翼 + 火箭巢、发动机排气口、机鼻下的光电球、天线
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b322c, roughness: 0.5, metalness: 0.6, envMapIntensity: 1.2 });
  const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, m = dark) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; heli.body.add(o); return o; };
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(1.3, 0.08, 0.6), s * 1.55, 1.25, -1.35, 0, 0, s * -0.08);
    add(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 14), s * 2.05, 1.05, -1.35, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 12), s * 0.52, 2.62, -2.3, Math.PI / 2 + 0.3);
  }
  add(new THREE.SphereGeometry(0.22, 16, 12), 0, 0.42, 2.0);
  add(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 4), 0, 2.85, -3.4, -0.5);
  // 尾桨模糊盘
  const tail = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: 0x1a1d1f, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  tail.position.set(0.24, 2.2, -5.95); tail.rotation.y = Math.PI / 2; heli.body.add(tail);
  return { uniforms: U };
}

/** 下洗气流：旋翼往下压出的水雾，贴着地面 / 屋面一圈一圈往外扩 */
export function buildDownwash(group, count = 700) {
  const U = { uT: { value: 0 }, uC: { value: V(0, -999, 0) }, uY: { value: 0 }, uAmt: { value: 0 }, uRes: { value: 1080 } };
  const r = rng(83), seed = new Float32Array(count * 3), pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) seed[i] = r();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: U,
    vertexShader: `attribute vec3 seed; uniform float uT, uY, uAmt, uRes; uniform vec3 uC; varying float vA;
      void main(){
        float life = 1.6 + seed.z, ph = fract(uT / life + seed.x);
        float a = seed.y * 6.2832 + ph * 0.6;
        float rad = 1.5 + ph * (9. + seed.z * 6.);
        vec3 w = vec3(uC.x + cos(a) * rad, uY + 0.2 + sin(ph * 3.1416) * (0.6 + seed.z * 1.4), uC.z + sin(a) * rad);
        vec4 mv = viewMatrix * vec4(w, 1.);
        float hgt = uC.y - uY;
        vA = sin(ph * 3.1416) * uAmt * (1. - smoothstep(6., 26., hgt));
        gl_PointSize = clamp((0.9 + ph * 2.2) * uRes / max(-mv.z, 0.5) * 0.5, 2., 160.);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5) * 2.; float a = smoothstep(1., 0., r) * vA * 0.09; if (a < 0.002) discard; gl_FragColor = vec4(vec3(0.62, 0.68, 0.74), a); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 5; group.add(pts);
  return { points: pts, uniforms: U };
}
