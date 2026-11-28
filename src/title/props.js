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
let SOFT_TEX = null, GRIME_TEX = null;
// 光斑：高斯样的衰减一直收到 0（边上不留一圈方形的底）
export const softTex = () => (SOFT_TEX ||= radialTex([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.62)'], [0.3, 'rgba(255,255,255,0.22)'], [0.55, 'rgba(255,255,255,0.05)'], [0.8, 'rgba(255,255,255,0.008)'], [1, 'rgba(255,255,255,0)']]));
export function resetShared() { SOFT_TEX = null; GRIME_TEX = null; }

/**
 * 脏污 / 磨损贴图（可平铺）：r = 大块污渍（低频噪声），g = 细划痕和掉漆点，b = 面板缝（网格线 + 铆钉）。
 * 给没有 uv 的合并网格（机枪、直升机、楼顶杂物）用三向投影贴上去。
 */
function grimeTex(S = 256) {
  const [c, g] = canvas2d(S), r = rng(97), img = g.createImageData(S, S), d = img.data;
  const N = 16, grid = Array.from({ length: N * N }, () => r());
  const at = (i, j) => grid[((j % N) + N) % N * N + ((i % N) + N) % N];
  const noise = (x, y, f) => { x *= f; y *= f; const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, s = (t) => t * t * (3 - 2 * t);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * s(fx), b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * s(fx); return a + (b - a) * s(fy); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * N, v = (y / S) * N;
    const blot = noise(u / N, v / N, 4) * 0.5 + noise(u / N, v / N, 8) * 0.3 + noise(u / N, v / N, 16) * 0.2;
    const k = (y * S + x) * 4;
    d[k] = clamp(blot) * 255; d[k + 1] = 0;
    // 面板缝：每 64 像素一道（横竖都有），交叉处旁边一颗铆钉
    const px = x % 64, py = y % 64, line = (px < 2 || py < 2) ? 1 : 0, rivet = (Math.hypot(px - 6, py - 6) < 1.6 || Math.hypot(px - 32, py - 5) < 1.4) ? 0.7 : 0;
    d[k + 2] = Math.max(line, rivet) * 255; d[k + 3] = 255;
  }
  // 划痕、掉漆：细短线（g 通道）
  for (let i = 0; i < 520; i++) {
    const x0 = r() * S, y0 = r() * S, a = r() * Math.PI, L = 2 + r() * 14;
    for (let s = 0; s < L; s++) { const x = Math.floor(x0 + Math.cos(a) * s) & (S - 1), y = Math.floor(y0 + Math.sin(a) * s) & (S - 1); d[(y * S + x) * 4 + 1] = 140 + r() * 115; }
  }
  for (let i = 0; i < 900; i++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); d[(y * S + x) * 4 + 1] = 90 + r() * 120; }
  g.putImageData(img, 0, 0); return canvasTex(c, false, true);
}

/**
 * 给一个标准材质加三向投影的脏污、划痕和面板缝（按物体自己的坐标，scale = 每米几块）：
 * amt 污渍深浅、edge 划痕 / 掉漆露出的亮色、panel 面板缝的深浅、rough 粗糙度跟着污渍变多少。
 * 没有 uv 的合并网格也能用；同一个着色器，参数走 uniforms（不同材质不重复编译）。
 */
export function grime(m, { scale = 1, amt = 0.5, edge = 0.15, panel = 0, rough = 0.3, wet = 0 } = {}) {
  const tex = (GRIME_TEX ||= grimeTex());
  const U = { tGrime: { value: tex }, uGS: { value: scale }, uGA: { value: amt }, uGE: { value: edge }, uGP: { value: panel }, uGR: { value: rough }, uGW: { value: wet } };
  m.userData.grime = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP; varying vec3 vGN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGP = position; vGN = normal;');
    // 着色器里：三个方向各采一次，按法线权重混合；污渍压暗、划痕提亮、面板缝压暗；雨水让上表面更光
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP; varying vec3 vGN; uniform sampler2D tGrime; uniform float uGS, uGA, uGE, uGP, uGR, uGW;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 gw = pow(abs(normalize(vGN)), vec3(4.)); gw /= dot(gw, vec3(1.));
        vec3 gp = vGP * uGS;
        vec4 gG = texture2D(tGrime, gp.yz) * gw.x + texture2D(tGrime, gp.xz) * gw.y + texture2D(tGrime, gp.xy) * gw.z;
        vec4 gG2 = texture2D(tGrime, gp.zy * 0.23 + 0.31) * gw.x + texture2D(tGrime, gp.zx * 0.23 + 0.17) * gw.y + texture2D(tGrime, gp.yx * 0.23 + 0.53) * gw.z;
        float gDirt = gG.r * 0.55 + gG2.r * 0.45;
        diffuseColor.rgb *= mix(1., 0.45 + 1.1 * gDirt, uGA);
        diffuseColor.rgb *= 1. - gG.b * uGP;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.6 + 0.12, gG.g * uGE);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (gDirt - 0.5) * uGR + gG.g * 0.08 - uGW * smoothstep(0.3, 0.9, normalize(vGN).y) * 0.4, 0.04, 1.);`);
  };
  m.customProgramCacheKey = () => 'grime1';
  return m;
}

/**
 * 把一张已经读进来的贴图缩到最长边 max 像素（在上传显卡之前做；显存按面积省）。
 * 开场里 1024 的扫描贴图、M4A1 贴图在画面上用不到这么细，缩到 512 一张省四分之三。
 */
export function shrinkTex(t, max) {
  const im = t?.image, w = im?.width || 0, h = im?.height || 0;
  if (!w || !h || Math.max(w, h) <= max || typeof document === 'undefined') return t;
  const k = max / Math.max(w, h), [c, g] = canvas2d(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
  g.drawImage(im, 0, 0, c.width, c.height); im.close?.();
  t.image = c; t.needsUpdate = true; return t;
}

/** 方盒子，uv 按米铺（每 tile 米一块贴图，不会被拉长） */
export function boxM(w, h, d, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d), n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)) > 0.5, ay = Math.abs(n.getY(i)) > 0.5;
    const [su, sv] = ax ? [d, h] : ay ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  return g;
}

/** 发光点（信标、警灯、远处的火）：加色混合的精灵 */
export function glowSprite(color, size, mul = 3, fog = false) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: new THREE.Color(color).multiplyScalar(mul), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog, toneMapped: true }));
  s.scale.setScalar(size); return s;
}

/**
 * 一批发光点一次画完（远处的火、航空障碍灯）：list = [{ p, color, size（米）, blink（0 = 火光跳动，1 = 障碍灯一亮一灭）, ph }]。
 * 光斑在着色器里算成圆的，亮度压在 Bloom 门槛附近（不会被 Bloom 糊成方块）；随场景雾变淡。返回 { points, uniforms }，每帧写 uT。
 */
export function glowPoints(group, list) {
  const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), aux = new Float32Array(n * 3);
  list.forEach((q, i) => { pos.set([q.p.x, q.p.y, q.p.z], i * 3); const c = new THREE.Color(q.color); col.set([c.r, c.g, c.b], i * 3); aux.set([q.size, q.blink || 0, q.ph ?? i * 1.7], i * 3); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aux', new THREE.BufferAttribute(aux, 3));
  const U = { uT: { value: 0 }, uRes: { value: 1080 }, uFog: { value: 0.006 } };
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: U,
    vertexShader: `attribute vec3 color; attribute vec3 aux; uniform float uT, uRes, uFog; varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); float d = -mv.z;
        gl_PointSize = clamp(aux.x * 2.2 * projectionMatrix[1][1] * uRes * 0.5 / max(d, 1.), 2., 96.);
        float on = aux.y > 0.5 ? step(-0.3, sin(uT * 2.2 + aux.z)) : 0.82 + 0.18 * sin(uT * (5. + mod(aux.z, 3.)) + aux.z) * sin(uT * 7.3 + aux.z * 2.);
        vA = on * exp(-uFog * uFog * d * d * 0.45); vC = color;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5) * 2.; if (r > 1.) discard;
        float core = exp(-r * r * 40.), halo = exp(-r * r * 5.) * (1. - r);
        gl_FragColor = vec4(vC * (core * 1.2 + halo * 0.35) * vA, 1.); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; group.add(pts);
  return { points: pts, uniforms: U };
}

// ---------------------------------------------------------------- PBR 贴图（仓库里现成的 CC0 扫描贴图）
const TEX_DIR = 'assets/textures/scans/';
/** 读一组扫描贴图（颜色 + 法线），repeat 米一块。base：网站根目录（打包时可换）；max：缩到最长边几像素 */
export async function loadScan(base, id, loader = new THREE.TextureLoader(), max = 512) {
  const [map, normalMap] = await Promise.all(['color', 'normal'].map((k) => loader.loadAsync(`${base}${TEX_DIR}${id}/${k}.jpg`).then((t) => shrinkTex(t, max))));
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

// ---------------------------------------------------------------- 天空：月夜（深靛蓝天顶、冷青灰的城市光雾、一窄条火光、被月光镶边的云、星）
export function buildSky(group) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uT: { value: 0 }, uFlash: { value: 0 }, uLift: { value: 1 }, uMoon: { value: V(-0.45, 0.42, -0.78).normalize() } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    // 着色器里：夜空不是纯黑——天顶深靛蓝、地平线冷青灰；月亮一圈冷光晕，云朝月亮的一侧被镶亮
    fragmentShader: `varying vec3 vD; uniform float uT, uFlash, uLift; uniform vec3 uMoon;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
    void main(){
      vec3 d = normalize(vD); float y = d.y;
      // 月夜：天顶深靛蓝，往下渐成冷青灰的城市光雾；只有城里着火的那个方向，贴着地平线一窄条暗橙
      vec3 top = vec3(0.016,0.028,0.062), mid = vec3(0.045,0.066,0.104), haze = vec3(0.06,0.08,0.112);
      vec3 c = mix(mid, top, smoothstep(0.04, 0.6, y));
      c = mix(c, haze, exp(-max(y, 0.0) * 9.0));
      float fireDir = pow(0.5 + 0.5 * dot(normalize(d.xz + 1e-4), normalize(vec2(-0.6, 0.8))), 6.);
      c += vec3(0.16, 0.07, 0.025) * fireDir * exp(-max(y, 0.0) * 22.0);

      float md = max(dot(d, uMoon), 0.);
      vec3 moonGlow = vec3(0.26,0.34,0.50) * (pow(md, 14.) * 0.75 + pow(md, 90.) * 0.6) + vec3(0.9, 0.95, 1.0) * smoothstep(0.99955, 0.9997, md) * 2.2;
      vec2 uv = d.xz / max(0.12, y + 0.18) * 1.5 + vec2(uT * 0.018, uT * 0.006);
      float cl = fbm(uv), cloud = smoothstep(0.34, 0.8, cl);
      // 云：底下被城市灯光映成冷灰，朝月亮的一侧镶一道银边
      vec3 cc = mix(vec3(0.06,0.075,0.10), vec3(0.11,0.12,0.14) + vec3(0.08,0.035,0.01) * fireDir, exp(-max(y,0.)*3.2));
      cc += vec3(0.30,0.36,0.46) * pow(md, 5.) * smoothstep(0.55, 0.95, cl) * 0.9;
      c = mix(c + moonGlow * (1. - cloud * 0.9), cc, cloud * 0.8 * smoothstep(-0.05, 0.15, y));
      c += uFlash * vec3(0.55,0.6,0.78) * (0.35 + cloud) * smoothstep(-0.1, 0.4, y);
      if (y < 0.0) c = mix(haze * 0.8, vec3(0.03,0.038,0.05), smoothstep(0.0, -0.25, y));
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
  const spec = { res: { bays: 6, floors: 12, lit: 0.12 }, office: { bays: 8, floors: 12, lit: 0.09 }, old: { bays: 6, floors: 10, lit: 0.13 }, mall: { bays: 6, floors: 4, lit: 0 } }[kind];
  const { bays, floors } = spec, bw = S / bays, fh = (S * 2) / floors, H = S * 2;
  const [c, g] = canvas2d(S, H), [e, ge] = canvas2d(S, H), [ro, gr] = canvas2d(S, H);
  // 底色：混凝土 / 涂料，带竖向的雨水污痕
  const base = { res: [104, 106, 106], office: [70, 78, 86], old: [110, 100, 88], mall: [58, 62, 66] }[kind];
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
      if (k < spec.lit && kind !== 'mall') {
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
      } else if (k > 0.985 && kind !== 'mall') {
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
function towerGeometry(w, h, d, tex, y0 = 0) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const tw = tex.bays * tex.bayW, th = tex.floors * tex.floorH;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + w / 2, y = p.getY(i) + h / 2 + y0, z = p.getZ(i) + d / 2;
    if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z / tw, y / th); else if (Math.abs(n.getZ(i)) > 0.5) uv.setXY(i, x / tw, y / th); else uv.setXY(i, x / 40, z / 40);
  }
  return g;
}
function facadeMaterial(tex, emissive = 1.6) {
  return new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissiveMap, emissive: 0xffffff, emissiveIntensity: emissive, roughnessMap: tex.roughnessMap, roughness: 1, metalness: 0.15, envMapIntensity: 1.2 });
}

/**
 * 高度雾：离地越高雾越薄（楼脚埋在雾里、楼顶露出来），只给远景楼群和地面用。
 * 雾不是一整块：按世界坐标叠两层低频噪声，一团团浓淡不同、高低错开（远近有层次，不再是一块平板）。
 * 在材质自己的着色器里改 fog_fragment，不动全局的 ShaderChunk（游戏后面还要用同一份 three）。
 */
export function heightFog(m, { falloff = 0.018, floor = 0.35 } = {}) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying vec3 vFogW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvFogW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>
      varying vec3 vFogW;
      float hfH(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float hfN(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hfH(i),hfH(i+vec2(1,0)),f.x), mix(hfH(i+vec2(0,1)),hfH(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
        float fogN = hfN(vFogW.xz * 0.0045) * 0.65 + hfN(vFogW.xz * 0.017 + 7.3) * 0.35;
        float fogTop = mix(0.55, 1.6, fogN);
        float hf = mix(1.0, ${floor.toFixed(3)}, 1.0 - exp(-max(vFogW.y, 0.0) * ${falloff.toFixed(4)} / fogTop));
        hf *= mix(0.6, 1.25, fogN);
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * hf * hf);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * mix(0.85, 1.12, fogN), fogFactor);
      #endif`);
  };
  m.customProgramCacheKey = () => `hfog2-${falloff}-${floor}`;
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
  // 女儿墙：楼顶一圈 1.1 米高的矮墙（剪影上看得出楼顶的厚度，不是一刀切的方块）
  const parapet = (x, top, z, w, d, rot) => {
    const c = Math.cos(rot), s2 = Math.sin(rot), t = 0.35, ph = 1.1;
    for (const [bw, bd, lx, lz] of [[w, t, 0, d / 2 - t / 2], [w, t, 0, -d / 2 + t / 2], [t, d, w / 2 - t / 2, 0], [t, d, -w / 2 + t / 2, 0]])
      crowns.push(place(new THREE.BoxGeometry(bw + 0.2, ph, bd + 0.2), x + lx * c + lz * s2, top + ph / 2, z - lx * s2 + lz * c, rot));
  };
  /** 一栋楼：高的有一半做退台（上面一截收进去），每一段顶上都有女儿墙 */
  const addTower = (x, z, w, d, h, y, rot, kind, setback = 0) => {
    if (setback > 0 && h > 55) {
      const h1 = Math.round(h * (0.58 + setback * 0.25)), w2 = w * (0.66 + setback * 0.12), d2 = d * (0.72 + setback * 0.1);
      addBlock(x, z, w, d, h1, y, rot, kind, 0); parapet(x, y + h1, z, w, d, rot);
      addBlock(x, z, w2, d2, h - h1, y + h1, rot, kind, h1); parapet(x, y + h, z, w2, d2, rot);
      return { w: w2, d: d2 };
    }
    addBlock(x, z, w, d, h, y, rot, kind, 0); parapet(x, y + h, z, w, d, rot);
    return { w, d };
  };
  const addBlock = (x, z, w, d, h, y, rot, kind, y0) => {
    const g = towerGeometry(w, h, d, tex[kind], y0);
    // 盒子的 6 个面分两份：四个侧面（立面贴图）、顶和底（屋面）
    const idx = g.index.array, side = [], top = [];
    for (const gr of g.groups) for (let i = gr.start; i < gr.start + gr.count; i++) (gr.materialIndex === 2 || gr.materialIndex === 3 ? top : side).push(idx[i]);
    const mk = (list) => { const k = new THREE.BufferGeometry(); for (const n of ['position', 'normal', 'uv']) k.setAttribute(n, g.attributes[n].clone()); k.setIndex(list); return place(k, x, y + h / 2, z, rot); };
    sides[kind].push(mk(side)); roofs.push(mk(top)); g.dispose();
  };
  // 楼顶轮廓：机房、退台、桅杆（红色航空障碍灯）
  const crown = (x, top, z, w, d, rot, k, mast = true) => {
    const c = Math.cos(rot), s2 = Math.sin(rot), at = (lx, lz) => [x + lx * c + lz * s2, z - lx * s2 + lz * c];
    const box = (bw, bh, bd, lx, ly, lz) => { const [px, pz] = at(lx, lz); crowns.push(place(new THREE.BoxGeometry(bw, bh, bd), px, top + ly, pz, rot)); };
    box(w * 0.45, 4.5, d * 0.4, w * 0.12, 2.25, 0); box(w * 0.22, 7.5, d * 0.24, -w * 0.22, 3.75, d * 0.1);
    if (k % 3 === 1) { const [px, pz] = at(w * 0.28, -d * 0.2); crowns.push(place(new THREE.CylinderGeometry(1.6, 1.6, 3.2, 12), px, top + 1.6, pz, 0)); }
    if (mast && k % 2 === 0) { const [px, pz] = at(-w * 0.22, d * 0.1); crowns.push(place(new THREE.CylinderGeometry(0.15, 0.3, 14, 6), px, top + 14.5, pz, 0));
      beacons.push({ p: V(px, top + 22, pz), color: 0xff2a1a, size: 3.2, blink: 1 }); }
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
    const k = t.id.length + (t.id.charCodeAt(t.id.length - 1) || 0);
    const top = addTower(x, z, t.w, t.d, t.h, t.y || 0, t.rot, kind, k % 3 === 0 ? 0.5 : 0);
    crown(x, (t.y || 0) + t.h, z, top.w, top.d, t.rot, k);
  }
  // 外围填充：一圈圈的城市楼群（只看剪影 + 窗灯），空出航拍镜头的飞行路线
  const r = rng(77), kinds = ['res', 'office', 'old', 'res'];
  for (let i = 0; i < fillers; i++) {
    const a = r() * Math.PI * 2, dd = 360 + r() * 1100, w = 22 + r() * 40, d = 18 + r() * 36, h = 28 + Math.pow(r(), 1.5) * 170;
    if (Math.abs(((a - 2.33 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.42 && dd < 900) continue;
    const kind = kinds[i % kinds.length], x = Math.cos(a) * dd, z = Math.sin(a) * dd, rot = r() * 0.5;
    const top = addTower(x, z, w, d, h, 0, rot, kind, r() < 0.5 ? r() : 0);
    if (h > 40) crown(x, h, z, top.w, top.d, rot, i, false);
    if (h > 110 && r() < 0.6) beacons.push({ p: V(x, h + 1.5, z), color: 0xff2a1a, size: 5, blink: 1 });
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
  // 路灯：一个 Points 画完（几百个精灵要几百次绘制调用）；着色器里算圆形的光斑（中心一颗亮芯 + 一圈很淡的晕），
  // 亮度压在 Bloom 门槛附近：圆晕是自己画出来的，不靠 Bloom 把一个亮点糊成方块
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  const lampU = { uRes: { value: 1080 }, uFog: { value: 0.006 }, uFogC: { value: new THREE.Color(0x1c2530) } };
  const lamps = new THREE.Points(lg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: lampU,
    vertexShader: `uniform float uRes, uFog; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); float d = -mv.z;
        gl_PointSize = clamp(20. * projectionMatrix[1][1] * uRes * 0.5 / max(d, 1.), 3., 64.);
        vA = exp(-uFog * uFog * d * d * 0.55);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5) * 2.; if (r > 1.) discard;
        float core = exp(-r * r * 60.), halo = exp(-r * r * 6.) * (1. - r);
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * (core * 1.1 + halo * 0.12) * vA, 1.); }`,
  }));
  lamps.frustumCulled = false; group.add(lamps);
  // 远处路口烧着的车 / 房子（橙光，一跳一跳）+ 航空障碍灯：各一批点
  const fr = rng(9), fireList = [];
  for (let i = 0; i < fires; i++) { const a = fr() * Math.PI * 2, d = 140 + fr() * 900; fireList.push({ p: V(Math.cos(a) * d, 3, Math.sin(a) * d), color: new THREE.Color(1, 0.42, 0.12).multiplyScalar(0.9 + fr() * 0.4), size: 9 + fr() * 14, blink: 0 }); }
  const glows = glowPoints(group, [...fireList, ...beacons]);
  return { lamps, lampU, glowU: glows.uniforms, materials: mats };
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
  // 女儿墙、楼梯间：清水混凝土扫描贴图，uv 按米铺（2.5 米一块，不拉长）+ 雨水污渍、往下拖的水痕
  const wallSet = withRepeat(scans.formed, 1, 1);
  const con = grime(new THREE.MeshStandardMaterial({ ...wallSet, color: 0xb4b0a8, roughness: 0.86, envMapIntensity: 1 }), { scale: 0.35, amt: 0.65, edge: 0.05, rough: 0.3, wet: 0.4 });
  const metal = grime(new THREE.MeshStandardMaterial({ color: 0x7c8286, roughness: 0.46, metalness: 0.5, envMapIntensity: 1.3 }), { scale: 0.8, amt: 0.7, edge: 0.35, panel: 0.25, rough: 0.35, wet: 0.5 });
  const rust = grime(new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.62, metalness: 0.3, envMapIntensity: 1.1 }), { scale: 1.2, amt: 0.9, edge: 0.25, rough: 0.4 });
  const merge = (list, mat, shadow = true) => { const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x))); list.forEach((x) => x.dispose()); const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; group.add(m); return m; };
  const at = (geo, x, y, z, ry = 0, rx = 0, rz = 0) => { geo.rotateX(rx); geo.rotateZ(rz); geo.rotateY(ry); geo.translate(x, y, z); return geo; };
  const conParts = [], metParts = [], rustParts = [];
  // 女儿墙：墙身 + 压顶（外挑、带滴水）+ 内侧泛水台阶；压顶上一圈钢栏杆
  const pw = (w, d, x, z) => {
    conParts.push(at(boxM(w, PARA, d, 2.5), x, R0 + PARA / 2, z));
    conParts.push(at(boxM(w + 0.22, 0.12, d + 0.22, 2.5), x, R0 + PARA + 0.06, z));
    conParts.push(at(boxM(w + 0.3, 0.05, d + 0.3, 2.5), x, R0 + PARA - 0.03, z));
    conParts.push(at(boxM(w > d ? w : 0.5, 0.3, w > d ? 0.5 : d, 2.5), x - (w > d ? 0 : Math.sign(x) * 0.3), R0 + 0.15, z - (w > d ? Math.sign(z) * 0.3 : 0)));
    const L = Math.max(w, d), n = Math.floor(L / 1.6);
    for (let i = 0; i <= n; i++) { const t = -L / 2 + (i / n) * L; metParts.push(at(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), x + (w > d ? t : 0), R0 + PARA + 0.62, z + (w > d ? 0 : t))); }
    for (const y of [0.55, 1.08]) metParts.push(at(new THREE.CylinderGeometry(0.03, 0.03, L, 8), x, R0 + PARA + 0.12 + y, z, 0, w > d ? 0 : Math.PI / 2, w > d ? Math.PI / 2 : 0));
  };
  pw(38, 0.3, 0, -37); pw(38, 0.3, 0, 37); pw(0.3, 74, -19, 0); pw(0.3, 74, 19, 0);
  // 停机坪：画在屋面上的圆圈和 H（旧、斑驳）
  const [c, g] = canvas2d(512), rr = rng(4);
  g.clearRect(0, 0, 512, 512); g.strokeStyle = '#d8d2bc'; g.lineWidth = 20; g.beginPath(); g.arc(256, 256, 220, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#d8d2bc'; for (const [x, y, w, h] of [[160, 130, 50, 250], [302, 130, 50, 250], [160, 230, 192, 46]]) g.fillRect(x, y, w, h);
  g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${rr() * 0.7})`; g.fillRect(rr() * 512, rr() * 512, 2 + rr() * 6, 2 + rr() * 6); }
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ map: canvasTex(c), transparent: true, roughness: 0.4, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, R0 + 0.01, -6); group.add(pad);
  // 楼梯间出口：墙身 + 外挑的顶板 + 门洞（门框、往外开着的钢门、门里亮着应急绿灯的楼梯间）+ 门上的安全出口牌、门边红色警示灯
  conParts.push(at(boxM(7, 3.6, 6, 2.5), 9, R0 + 1.8, -24));
  conParts.push(at(boxM(7.6, 0.22, 6.6, 2.5), 9, R0 + 3.71, -24));
  conParts.push(at(boxM(7.2, 0.4, 6.2, 2.5), 9, R0 + 0.2, -24));
  // 门洞：门框（三根）凸出墙面，里面是凹进去的楼梯间（一张竖着的渐变：顶上灯亮、往下变暗，能看到两级台阶的影子）
  for (const [w, h, x, y] of [[0.14, 2.45, 6.78, 1.22], [0.14, 2.45, 8.22, 1.22], [1.58, 0.14, 7.5, 2.45]]) metParts.push(at(new THREE.BoxGeometry(w, h, 0.18), x, R0 + y, -20.95));
  const [dc, dg] = canvas2d(128, 256);
  { const gr = dg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#9fffd6'); gr.addColorStop(0.18, '#3c9a78'); gr.addColorStop(0.7, '#0f2a22'); gr.addColorStop(1, '#06100c'); dg.fillStyle = gr; dg.fillRect(0, 0, 128, 256);
    dg.fillStyle = 'rgba(0,0,0,0.55)'; for (let k = 0; k < 4; k++) dg.fillRect(0, 150 + k * 26, 128, 9);
    dg.fillStyle = 'rgba(0,0,0,0.7)'; dg.fillRect(96, 30, 10, 226); dg.fillStyle = 'rgba(190,255,225,0.35)'; dg.fillRect(20, 6, 70, 6); }
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.3), new THREE.MeshBasicMaterial({ map: canvasTex(dc), color: new THREE.Color(0.9, 1, 0.95) }));
  inner.position.set(7.5, R0 + 1.15, -21.25); group.add(inner);
  for (const [w, h, x, z] of [[0.04, 2.3, 6.85, -21.12], [0.04, 2.3, 8.15, -21.12], [1.3, 0.04, 7.5, -21.12]]) conParts.push(at(new THREE.BoxGeometry(w, h, 0.3), x, R0 + (h > 1 ? 1.15 : 2.3), z));
  // 往外推开七十度的钢门（门板 + 推杠）
  { const leaf = new THREE.BoxGeometry(1.25, 2.25, 0.05); leaf.translate(0.625, 0, 0); metParts.push(at(leaf, 6.85, R0 + 1.13, -20.9, -1.2));
    const bar = new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6); bar.rotateZ(Math.PI / 2); bar.translate(0.6, 0, 0.05); metParts.push(at(bar, 6.85, R0 + 1.05, -20.9, -1.2)); }
  const [sc2, sg2] = canvas2d(128, 48);
  sg2.fillStyle = '#0a5c3a'; sg2.fillRect(0, 0, 128, 48); sg2.fillStyle = '#e8fff2'; sg2.font = 'bold 30px sans-serif'; sg2.textAlign = 'center'; sg2.textBaseline = 'middle'; sg2.fillText('EXIT', 74, 25);
  sg2.beginPath(); sg2.moveTo(12, 24); sg2.lineTo(30, 12); sg2.lineTo(30, 36); sg2.fill();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: canvasTex(sc2), color: new THREE.Color(1.3, 1.3, 1.3) }));
  sign.position.set(7.5, R0 + 2.75, -20.84); group.add(sign);
  const lamp = glowSprite(0xff2010, 1.0, 2); lamp.position.set(9, R0 + 2.9, -20.82); group.add(lamp);
  // 楼梯间顶上：排风口、一根排气管
  metParts.push(at(new THREE.BoxGeometry(1.4, 0.6, 1.0), 10.6, R0 + 4.12, -25));
  metParts.push(at(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 10), 7.4, R0 + 4.6, -26));
  // 空调外机（机壳 + 顶上的风扇罩）
  for (const [x, z, w, h, d] of [[-12, -28, 4, 1.8, 3], [-12, -23, 4, 1.8, 3], [13, 8, 3, 1.4, 6], [13, 16, 3, 1.4, 6], [14, -8, 3, 2.4, 3]]) {
    metParts.push(at(new THREE.BoxGeometry(w, h, d), x, R0 + h / 2 + 0.12, z));
    rustParts.push(at(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), x, R0 + 0.06, z));
    const fr = Math.min(w, d) * 0.32;
    rustParts.push(at(new THREE.CylinderGeometry(fr, fr, 0.12, 20, 1, true), x, R0 + h + 0.18, z));
    for (let k = 0; k < 4; k++) rustParts.push(at(new THREE.BoxGeometry(fr * 2, 0.02, 0.03), x, R0 + h + 0.22, z, k * 0.785));
  }
  // 水箱：罐身、加强箍、锥顶、检修梯、四条腿 + 斜撑
  rustParts.push(at(new THREE.CylinderGeometry(2.2, 2.2, 3.5, 32), -13, R0 + 3.8, -12));
  rustParts.push(at(new THREE.ConeGeometry(2.3, 0.7, 32), -13, R0 + 5.9, -12));
  for (const y of [2.4, 3.6, 4.8]) metParts.push(at(new THREE.TorusGeometry(2.22, 0.05, 6, 40), -13, R0 + y, -12, 0, Math.PI / 2));
  for (const [x, z] of [[-14.5, -13.5], [-11.5, -13.5], [-14.5, -10.5], [-11.5, -10.5]]) metParts.push(at(new THREE.BoxGeometry(0.2, 2.1, 0.2), x, R0 + 1.05, z));
  for (const [x, z, ry] of [[-13, -13.5, 0], [-13, -10.5, 0], [-14.5, -12, Math.PI / 2], [-11.5, -12, Math.PI / 2]]) metParts.push(at(new THREE.BoxGeometry(0.06, 3.6, 0.08), x, R0 + 1.05, z, ry, 0, 0.98));
  for (const s2 of [-0.25, 0.25]) metParts.push(at(new THREE.BoxGeometry(0.04, 5.6, 0.04), -10.75 + 0, R0 + 2.8, -12 + s2));
  for (let k = 0; k < 16; k++) metParts.push(at(new THREE.BoxGeometry(0.03, 0.03, 0.5), -10.75, R0 + 0.3 + k * 0.34, -12));
  // 天线杆
  metParts.push(at(new THREE.CylinderGeometry(0.08, 0.12, 12, 8), 15, R0 + 6, -33));
  merge(conParts, con); merge(metParts, metal); merge(rustParts, rust);
  const ml = glowSprite(0xff2a1a, 1.6, 2); ml.position.set(15, R0 + 12.2, -33); group.add(ml);
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
  // 一个 InstancedMesh 画完（一张纸一个网格要几十次绘制调用），每张纸自己的颜色
  const r = rng(71), cols = [0xd8d2c0, 0xb8b2a2, 0x9a3a2c, 0xe6e0cf].map((c) => new THREE.Color(c));
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.21, 0.29, 2, 2), new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), n);
  mesh.frustumCulled = false; group.add(mesh);
  const list = [], o = new THREE.Object3D();
  for (let i = 0; i < n; i++) { mesh.setColorAt(i, cols[i % cols.length]); list.push({ x: (r() - 0.5) * 26, z: r() * 30, h: 0.2 + r() * 3.5, s: 0.6 + r() * 1.4, p: r() * 10 }); }
  return {
    mesh,
    step(T) {
      list.forEach((d, i) => {
        const t = T * d.s + d.p;
        o.position.set(d.x + Math.sin(t * 0.7) * 2 + T * 0.8 * d.s % 8, Math.max(0.03, d.h + Math.sin(t * 1.3) * 0.6 - ((T * 0.3) % 2)), d.z + Math.cos(t * 0.5) * 1.5);
        o.rotation.set(t * 2.1, t * 1.3, t * 0.7); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
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
    // 着色器里：四片桨在快门时间里扫出的拖影（前沿实、后沿虚），整盘一层很淡的灰，桨尖一圈亮环；
    //   离桨毂近的地方暗（桨根粗、遮得多）
    fragmentShader: `varying vec2 vP; uniform float uT, uLit;
      void main(){ float r = length(vP) / 5.3; float a = atan(vP.y, vP.x);
        float ph = mod(a - uT * 41.0, 1.5708) / 1.5708;
        float smear = smoothstep(0.0, 0.04, ph) * pow(1.0 - ph, 5.0) + smoothstep(0.985, 1.0, ph);
        float hub = smoothstep(0.1, 0.06, r);
        float tip = smoothstep(0.02, 0.0, abs(r - 0.975)) * 0.1;
        float alpha = (0.18 + smear * 0.5 * (0.6 + 0.4 * r) + tip) * smoothstep(1.0, 0.965, r) * smoothstep(0.04, 0.1, r) + hub * 0.7;
        vec3 c = mix(vec3(0.02,0.024,0.028), vec3(0.3,0.34,0.38) * uLit, tip + smear * 0.1);
        gl_FragColor = vec4(c, alpha); }`,
  });
  let disc = null;
  heli.root.traverse((o) => { if (o.isMesh && o.geometry?.type === 'CircleGeometry' && Math.abs((o.geometry.parameters?.radius || 0) - 5.3) < 0.01) disc = o; });
  if (disc) {
    // 旋翼锥度：桨尖比桨根高一点（侧面看是一个很浅的碟，不是一条线）
    const g = disc.geometry.clone(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)) / 5.3; p.setZ(i, r * r * 0.32); }
    g.computeVertexNormals(); disc.geometry = g; disc.material = blurMat; disc.renderOrder = 4;
  }
  // 机身换掉：游戏里那架是给机舱内视角做的（一块块板子拼的舱壁、座椅、驾驶员），在开场的远景 / 中景里像一堆盒子。
  // 这里另做一个看外形的低多边形机身：截面是圆角的「超椭圆」，沿机身放样（机头 → 机舱 → 收成尾梁），
  // 机头上半截和舱门窗是玻璃，发动机整流罩、排气口、短翼 + 火箭巢、起落橇、垂尾和平尾都有；漆面带面板缝和磨损。
  for (const o of [...heli.body.children]) if (o.isMesh) o.visible = false;
  const paint = grime(new THREE.MeshStandardMaterial({ color: 0x46503e, roughness: 0.55, metalness: 0.35, envMapIntensity: 1.4 }), { scale: 1.4, amt: 0.55, edge: 0.3, panel: 0.45, rough: 0.3, wet: 0.5 });
  const dark = grime(new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.5, metalness: 0.6, envMapIntensity: 1.2 }), { scale: 2, amt: 0.5, edge: 0.35, rough: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1318, roughness: 0.06, metalness: 0.9, envMapIntensity: 2.4 });
  const cabin = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.035, 0.012, 0.01) });
  const parts = { paint: [], dark: [] };
  const put = (k, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z); for (const n of Object.keys(geo.attributes)) if (n !== 'position' && n !== 'normal') geo.deleteAttribute(n); parts[k].push(geo.index ? geo.toNonIndexed() : geo); return geo; };
  // 机身放样：[z, 半宽, 半高, 中心高]
  const ST = [[2.62, 0.04, 0.04, 1.22], [2.48, 0.38, 0.36, 1.27], [2.2, 0.68, 0.6, 1.37], [1.7, 0.9, 0.76, 1.48], [1.0, 1.0, 0.82, 1.55], [0.0, 1.03, 0.84, 1.57],
    [-1.0, 1.01, 0.82, 1.6], [-1.7, 0.86, 0.7, 1.72], [-2.3, 0.52, 0.46, 1.9], [-2.9, 0.3, 0.3, 2.0], [-4.6, 0.19, 0.19, 2.06], [-5.8, 0.13, 0.14, 2.12], [-6.1, 0.05, 0.06, 2.15]];
  const SEG = 28, pos = [], idx = { body: [], glass: [], cabin: [] };
  const ring = (st) => { const out = []; for (let k = 0; k <= SEG; k++) { const a = -Math.PI / 2 + (k / SEG) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), e = 0.72;
    out.push([st[1] * Math.sign(c) * Math.pow(Math.abs(c), e), st[3] + st[2] * Math.sign(sn) * Math.pow(Math.abs(sn), e), st[0]]); } return out; };
  ST.forEach((st) => ring(st).forEach((p) => pos.push(...p)));
  for (let i = 0; i < ST.length - 1; i++) for (let k = 0; k < SEG; k++) {
    const A = i * (SEG + 1) + k, B = A + 1, C = A + SEG + 1, D = C + 1;
    const mz = (ST[i][0] + ST[i + 1][0]) / 2, my = pos[A * 3 + 1] - (ST[i][3] + ST[i + 1][3]) / 2, mx = Math.abs(pos[A * 3]);
    // 机头上半截：风挡和顶窗；机身两侧：舱门开着（看进去是暗红的舱内灯）；舱门前面一扇小窗
    let k2 = 'body';
    if (mz > 1.05 && mz < 2.5 && my > -0.12) k2 = 'glass';
    else if (mz > 1.3 && mz < 2.2 && my > -0.45 && mx > 0.5) k2 = 'glass';
    else if (mz < 0.6 && mz > -0.95 && my > -0.38 && my < 0.5 && mx > 0.9) k2 = 'cabin';
    idx[k2].push(A, C, B, B, C, D);
  }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fg.setIndex([...idx.body, ...idx.glass, ...idx.cabin]);
  fg.addGroup(0, idx.body.length, 0); fg.addGroup(idx.body.length, idx.glass.length, 1); fg.addGroup(idx.body.length + idx.glass.length, idx.cabin.length, 2);
  fg.computeVertexNormals();
  const fuse = new THREE.Mesh(fg, [paint, glass, cabin]); fuse.castShadow = true; heli.body.add(fuse);
  // 风挡中梁、门框
  put('dark', new THREE.BoxGeometry(0.06, 0.05, 1.4), 0, 2.06, 1.75, -0.55);
  for (const s of [-1, 1]) { put('dark', new THREE.BoxGeometry(0.06, 1.3, 0.08), s * 1.0, 1.55, 0.74); put('dark', new THREE.BoxGeometry(0.06, 1.3, 0.08), s * 1.0, 1.55, -1.04); }
  // 发动机整流罩（放样的小一号）+ 两个排气口 + 进气口
  { const CW = [[0.75, 0.04, 0.04, 2.42], [0.5, 0.48, 0.24, 2.44], [-0.5, 0.6, 0.32, 2.47], [-1.6, 0.55, 0.3, 2.45], [-2.35, 0.32, 0.2, 2.33], [-2.6, 0.12, 0.08, 2.28]];
    const cp = [], ci = []; CW.forEach((st) => ring(st).forEach((p) => cp.push(...p)));
    for (let i = 0; i < CW.length - 1; i++) for (let k = 0; k < SEG; k++) { const A = i * (SEG + 1) + k; ci.push(A, A + SEG + 1, A + 1, A + 1, A + SEG + 1, A + SEG + 2); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setIndex(ci); cg.computeVertexNormals(); parts.paint.push(cg.toNonIndexed()); cg.dispose(); }
  for (const s of [-1, 1]) {
    put('dark', new THREE.CylinderGeometry(0.15, 0.19, 0.55, 14, 1, true), s * 0.5, 2.6, -2.05, Math.PI / 2 + 0.35);
    put('dark', new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14), s * 0.52, 2.55, 0.35, Math.PI / 2);
  }
  // 旋翼轴、桨毂
  put('dark', new THREE.CylinderGeometry(0.11, 0.15, 0.5, 12), 0, 2.92, -0.45);
  put('dark', new THREE.CylinderGeometry(0.32, 0.26, 0.14, 16), 0, 3.12, -0.45);
  // 垂尾（后掠）、平尾、尾桨轴
  { const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-0.75, 1.35), new THREE.Vector2(-1.15, 1.4), new THREE.Vector2(-0.6, 0)]);
    const g = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1 }); g.translate(0, 0, -0.04);
    put('paint', g, 0, 2.08, -5.5, 0, -Math.PI / 2);
    const st = new THREE.Shape([new THREE.Vector2(-1.05, 0), new THREE.Vector2(1.05, 0), new THREE.Vector2(0.95, -0.42), new THREE.Vector2(-0.95, -0.42)]);
    const sg = new THREE.ExtrudeGeometry(st, { depth: 0.05, bevelEnabled: false }); put('paint', sg, 0, 2.06, -5.0, Math.PI / 2); }
  put('dark', new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), 0.12, 2.2, -5.95, 0, 0, Math.PI / 2);
  // 短翼（下反、翼型截面）+ 挂架 + 两个火箭巢（圆头圆尾的筒，前面一圈黑色的管口）
  for (const s of [-1, 1]) {
    const wing = new THREE.Shape([new THREE.Vector2(0, 0.35), new THREE.Vector2(1.15, 0.22), new THREE.Vector2(1.15, -0.2), new THREE.Vector2(0, -0.4)]);
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
    wg.rotateX(Math.PI / 2); if (s < 0) wg.scale(-1, 1, 1); put('paint', wg, s * 0.95, 1.32, -0.25, 0, 0, s * -0.1);
    put('dark', new THREE.BoxGeometry(0.08, 0.26, 0.4), s * 1.85, 1.08, -0.25);
    const prof = [[0, -0.75], [0.12, -0.72], [0.19, -0.6], [0.2, 0.45], [0.17, 0.62], [0.13, 0.7], [0, 0.7]].map(([r, y]) => new THREE.Vector2(r, y));
    put('paint', new THREE.LatheGeometry(prof, 16), s * 1.85, 0.86, -0.25, Math.PI / 2);
    put('dark', new THREE.CylinderGeometry(0.14, 0.14, 0.03, 16), s * 1.85, 0.86, 0.46, Math.PI / 2);
    // 起落橇：滑管（前端上翘）+ 两根弯撑
    const skid = new THREE.CatmullRomCurve3([V(s * 1.12, 0.12, -1.7), V(s * 1.12, 0.12, 1.3), V(s * 1.12, 0.2, 1.85), V(s * 1.12, 0.42, 2.05)]);
    put('dark', new THREE.TubeGeometry(skid, 24, 0.055, 8));
    for (const z of [-0.95, 0.95]) put('dark', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(s * 1.12, 0.12, z), V(s * 1.1, 0.42, z), V(s * 0.95, 0.72, z), V(s * 0.55, 0.82, z)]), 10, 0.045, 6));
  }
  // 机鼻下的光电球、天线
  put('dark', new THREE.SphereGeometry(0.2, 16, 12), 0, 0.82, 2.1);
  put('dark', new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4), 0, 2.85, -3.2, -0.5);
  for (const [k, m] of [['paint', paint], ['dark', dark]]) { const g = mergeGeometries(parts[k]); parts[k].forEach((x) => x.dispose()); const o = new THREE.Mesh(g, m); o.castShadow = true; heli.body.add(o); }
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
