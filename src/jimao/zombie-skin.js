// 丧尸的外形：用园区行人的贴图模型（Microsoft Rocketbox，MIT；一男一女，各带八个走路姿势），把贴图重画成丧尸。
// 怎么画在 skins/zombie-paint.js：先把模型的三角形按 UV 摊到一张小网格上，贴图上每一处都知道自己在身体的哪里，
// 于是伤口落在身体的实处、血往下淌、越往脚下越脏、眼窝和嘴唇按脸的三维位置压暗，UV 接缝两边对得上。
// 每种外观一张颜色图（几套色调 + 特殊感染者），伤口各外观各挑各的（一群里不会个个胸口同一块血）；
// 法线和粗糙度每个模型一张、各外观共用（布料哑光、皮肤有点蜡）。各外观自己的湿血、伤口、涎水、油泥的光泽
// 编在颜色图的透明通道里（zombie-paint.js 的 encodeWet），这里的着色器补丁读出来改粗糙度、把湿处的布纹法线抹平。
// 走路用模型自带的姿势循环，前倾、摇晃、扑咬、倒地都是整个人的姿态（模型没有骨骼，胳膊抬不起来）。眼睛是两粒很小的发光点：停电的楼里先看见眼睛。
// zombie.js 里手搭的方块人留着：模型没加载出来（或测试环境）就还用它。
// 行人那份几何上传显卡后内存里的贴图可能已经缩过 / 关掉了，这里单独再解析一份。
// 画贴图是开局时的大块 CPU 活：全部切成小段，每段十来毫秒，隔帧接着画（不卡开局那几秒）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PEOPLE_ASSETS } from '../render/people-data.js';
import { fetchBinary } from '../render/fetch-binary.js';
import { MEM } from '../render/device.js';
import { LOOKS, PAINT, noiseTableSteps, rasterBodySteps, bodyFrame, planFace, planLook, bloodField, prepareLayers, paintColour, paintSurface } from './skins/zombie-paint.js';

/**
 * tones：几套色调 [衣服去色后乘上的 R, G, B, 保留多少原来的颜色]（皮肤、伤、血、脏怎么画见 zombie-paint.js 的 LOOKS.walker，一一对应）；
 * special：特殊感染者的（body：用哪个模型，0 男 1 女，不写两个都做；eye：眼睛的颜色；optional：省内存档不做，用普通的那套顶上；env：环境反射多强，不写用 envMapIntensity）。
 * size：颜色图最大边长（电脑 1024；手机按内存档位的 modelTex：512 / 256）；法线和粗糙度是颜色图的一半，省内存档不做。
 * cyclesPerMetre：每走一米走路姿势转多少圈。
 */
export const ZOMBIE_SKIN = Object.freeze({
  size: 1024,
  tones: Object.freeze([[0.62, 0.7, 0.56, 0.34], [0.56, 0.6, 0.62, 0.26], [0.7, 0.62, 0.5, 0.4]]),
  // 尖叫者惨白没血色，扑袭者一身黑灰、红眼，喷酸者蜡黄发绿、嘴边淌涎水，巨尸暗红满身烂疮，胖尸灰绿发紫、一身脓疱
  special: Object.freeze({
    pale: Object.freeze({ tone: [0.84, 0.86, 0.8, 0.12], eye: 0xffffff }),
    lunger: Object.freeze({ tone: [0.42, 0.4, 0.42, 0.2], body: 0, eye: 0xff4a3a, env: 0.62 }), // 一身黑，环境反射多给一点，手电下才有轮廓
    spitter: Object.freeze({ tone: [0.7, 0.74, 0.46, 0.26], body: 1, eye: 0xb6ff5a }),
    brute: Object.freeze({ tone: [0.5, 0.34, 0.3, 0.22], body: 0, eye: 0xffa040 }),
    bloater: Object.freeze({ tone: [0.66, 0.7, 0.52, 0.3], eye: 0xd8e070, optional: true }),
  }),
  // 眼睛：放在眼球（模型自带、贴图上那一小块）的正前面，往里缩 inset；量不到眼球时按离头顶 below、两眼间距的一半 half 估。radius：发光点的半径
  eyes: Object.freeze({ below: 0.108, half: 0.031, inset: 0.003, radius: 0.005, color: 0xffe9a8 }),
  envMapIntensity: 0.38, // 停电时环境光本来就压得很低，留一点让湿血、皮肤在暗处有个轮廓，不至于一团死黑
  bloatGirth: 1.3, // 横向撑开超过这么多、又不是别的特殊感染者的，就是胖尸（zombie.js 只给胖尸撑这么宽）
  cyclesPerMetre: 0.62,
});

/**
 * 一个像素的丧尸化：先算亮度，颜色往灰里收（keep 是保留多少原色），再乘上色调。纯函数，返回 [r, g, b]（0–255）。
 */
export function zombieTone(r, g, b, [tr, tg, tb, keep]) {
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const mix = (c) => l + (c - l) * keep;
  return [Math.min(255, mix(r) * tr), Math.min(255, mix(g) * tg), Math.min(255, mix(b) * tb)];
}

/** 第 phase（0–1）圈走路姿势 → 两个相邻姿势的序号和权重。纯函数。 */
export function walkBlend(phase, poses) {
  const f = (((phase % 1) + 1) % 1) * poses, a = Math.floor(f) % poses;
  return { a, b: (a + 1) % poses, t: f - Math.floor(f) };
}

async function parsePerson(record) {
  const bytes = record.url.startsWith('data:')
    ? Uint8Array.from(atob(record.url.slice(record.url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer
    : await fetchBinary(record.url, { label: '丧尸模型' });
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh || mesh.geometry.morphAttributes.position?.length !== record.poses) throw new Error('丧尸模型缺少走路姿势');
  return mesh;
}

/**
 * 脸在哪：按第 0 个走路姿势量（基础顶点 + 第 0 帧位移；模型的基础姿势和走路姿势头的位置不完全一样）。
 * 返回 { top（头顶高度）, front（眼睛那一圈最靠前的 z）, x（头的左右中心）, nose? }，几何带 UV 时再加
 * eyes（两个眼球 [{ x, y, z, front }]）和 mouth（口腔的中心 { x, y }）——从贴图上眼球、口腔那两小块对应的顶点量
 * （第一轮按头顶往下的固定距离估，眼睛落在眉骨上，发光点和眼窝都高了两三厘米）。
 */
export function faceOf(geometry) {
  const P = geometry.attributes.position, D = geometry.morphAttributes.position?.[0], rel = geometry.morphTargetsRelative, UV = geometry.attributes.uv;
  const at = (i, get) => (D ? (rel ? get(P, i) + get(D, i) : get(D, i)) : get(P, i));
  const X = (a, i) => a.getX(i), Y = (a, i) => a.getY(i), Z = (a, i) => a.getZ(i);
  let top = -Infinity; for (let i = 0; i < P.count; i++) top = Math.max(top, at(i, Y));
  let front = -Infinity, sx = 0, n = 0;
  for (let i = 0; i < P.count; i++) { const y = at(i, Y); if (y > top - 0.15 && y < top - 0.07) { front = Math.max(front, at(i, Z)); sx += at(i, X); n++; } }
  const out = { top, front, x: n ? sx / n : 0 };
  if (!UV) return out;
  const inBox = (b, u, v) => u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3];
  const E = [[0, 0, 0, 0, -Infinity], [0, 0, 0, 0, -Infinity]], M = [0, 0, 0];
  let noseZ = -Infinity, noseY = 0;
  for (let i = 0; i < P.count; i++) {
    const x = at(i, X), y = at(i, Y), z = at(i, Z), u = UV.getX(i), v = UV.getY(i);
    if (y < top - 0.32) continue;
    if (inBox(PAINT.islands.eye, u, v)) { const e = E[x < out.x ? 0 : 1]; e[0] += x; e[1] += y; e[2] += z; e[3]++; e[4] = Math.max(e[4], z); }
    else if (inBox(PAINT.islands.mouth, u, v)) { M[0] += x; M[1] += y; M[2]++; }
    else if (y < top - 0.1 && Math.abs(x - out.x) < 0.03 && z > noseZ) { noseZ = z; noseY = y; }
  }
  if (E[0][3] && E[1][3]) out.eyes = E.map((e) => ({ x: e[0] / e[3], y: e[1] / e[3], z: e[2] / e[3], front: e[4] }));
  if (M[2]) out.mouth = { x: M[0] / M[2], y: M[1] / M[2] };
  if (noseZ > -Infinity) out.nose = { x: out.x, y: noseY, z: noseZ };
  return out;
}

// 切片：一个生成器跑到这一段用满 budget 毫秒就停，隔一帧再接着跑（和 arsenal.js 的 frameQueue 一个意思）
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const nextFrame = () => new Promise((done) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(done, 0)) : setTimeout(done, 0)));
async function pause(clock, what) {
  const d = now() - clock.t;
  if (d > clock.worst[0]) clock.worst = [d, what]; // 记下最长的一段是在干什么（量切片用）
  if (d > clock.budget) { clock.slices++; await nextFrame(); clock.t = now(); }
}
async function drain(gen, clock, what) {
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
    await pause(clock, what);
  }
}

// 一张画好的像素 → 贴图（直接用像素数组：颜色图的透明通道里编着湿度，走画布会被预乘透明度吃掉精度）。
// 上传显卡以后就把像素扔掉（手机上内存紧；显示资源被回收会整页刷新，不需要重传）
function toTexture(pixels, size, srgb) {
  const t = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = srgb ? 4 : 2; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  t.onUpdate = () => { t.onUpdate = null; t.image = { width: size, height: size, data: null }; };
  return t;
}

/**
 * 着色器补丁：颜色图的透明通道 → 湿度（zombie-paint.js 的 encodeWet：0.5 以下是头发的半透明，0.5 往上越大越湿）。
 * 湿处粗糙度降下来（干血痂 0.8 左右、油泥 0.55、刚淌的血 0.4、伤口正中 0.2），越湿越把共用法线图里的布纹抹平（血把布纹填平了，伤口里也不会透出条纹的高光）。
 * 透明通道读完以后改回 1：材质不透明，输出的透明度不能跟着变。
 */
function wetShader(shader) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n\tfloat zWet = clamp( diffuseColor.a * 2.0 - 1.0, 0.0, 1.0 );\n\tdiffuseColor.a = 1.0;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, mix( 0.82, 0.2, zWet * zWet ), smoothstep( 0.0, 0.1, zWet ) );')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\tnormal = normalize( mix( normal, nonPerturbedNormal, smoothstep( 0.35, 0.9, zWet ) * 0.85 ) );');
}

/** 这一档内存下贴图多大：{ colour（颜色图边长）, surface（法线 / 粗糙度边长，0 = 不做） }。纯函数 */
export function zombieTexSizes(mem = MEM) {
  const colour = Math.max(128, Math.min(ZOMBIE_SKIN.size, mem.modelTex || 512));
  return { colour, surface: mem.name === 'compact' || mem.pbrMaps === 'color' ? 0 : colour >> 1 };
}

/**
 * 载入一次，之后 create() 出任意多只。返回 { looks, create(), dispose(), stats }；
 * create() 返回 { group, setLook(index, special), pose({ phase, moving, lean, sway, lunge }), dispose() }：group 的原点在脚下、面朝局部 +Z。
 * stats：画贴图花了多久（ms，总计 / 最长的一段）、几张图、显存大约多少。
 */
export async function loadZombieKit({ seed = 20261120, budget = 10 } = {}) {
  // 没有 document（node 测试）就画不了贴图：直接拒绝，调用的地方（run.js）会接住、继续用方块人
  if (typeof document === 'undefined') throw new Error('没有 document，画不了丧尸贴图');
  const t0 = now(), clock = { t: now(), budget, slices: 0, worst: [0, ''] };
  const { colour: size, surface } = zombieTexSizes(MEM), compact = MEM.name === 'compact';
  const tables = { n: 256, a: await drain(noiseTableSteps(256, seed ^ 0x51), clock, 'noise'), b: await drain(noiseTableSteps(256, seed ^ 0xa3, 4, 16), clock, 'noise') };
  const bodies = [], shared = []; let bytes = 0, maps = 0;
  const count = (s) => { maps++; bytes += s * s * 4 * 4 / 3; }; // RGBA + mipmap
  for (const record of PEOPLE_ASSETS) {
    await pause(clock, 'start');
    const bi = bodies.length, source = await parsePerson(record), image = source.material.map.image, geo = source.geometry;
    clock.t = now(); // 解析模型是浏览器在后台解码，不算在这一段里
    const face = faceOf(geo);
    // 原贴图按这一档的大小取出像素
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const g2 = canvas.getContext('2d', { willReadFrequently: true }); g2.drawImage(image, 0, 0, size, size);
    const src = g2.getImageData(0, 0, size, size).data; canvas.width = canvas.height = 1;
    source.material.map?.dispose(); source.material.dispose(); image.close?.();
    await pause(clock, 'read');
    const body = await drain(rasterBodySteps({ position: geo.attributes.position.array, uv: geo.attributes.uv.array, normal: geo.attributes.normal?.array, index: geo.index?.array }), clock, 'raster');
    const frame = bodyFrame(geo.attributes.position.array), fp = planFace(body, frame, face);
    await pause(clock, 'plan');
    const layers = await drain(prepareLayers(src, size, body, fp, tables), clock, 'layers');
    // 网格第 k 格是身体哪部分（伤口、破口挑落点用：破口只开在衣服上，烂疮只长在皮上）
    const L = body.L, partAt = (k) => layers.part[Math.min(size - 1, Math.floor(((Math.floor(k / L) + 0.5) * size) / L)) * size + Math.min(size - 1, Math.floor((((k % L) + 0.5) * size) / L))];
    // 法线和粗糙度：每个模型一张，各外观共用
    let normalMap = null, roughnessMap = null;
    if (surface) {
      const nPix = new Uint8ClampedArray(surface * surface * 4), rPix = new Uint8ClampedArray(surface * surface * 4);
      await drain(paintSurface(src, layers, tables, nPix, rPix, body), clock, 'surface');
      await pause(clock, 'surface');
      normalMap = toTexture(nPix, surface, false); await pause(clock, 'upload'); roughnessMap = toTexture(rPix, surface, false); count(surface); count(surface);
      shared.push(normalMap, roughnessMap);
    }
    // 一种外观：伤按 (模型, 外观) 定——同一个模型的几套色调伤口各不相同，主伤口按外观轮换（rot 让男女两个模型错开）
    const paint = async (look, tone, key, env = ZOMBIE_SKIN.envMapIntensity) => {
      const plan = planLook(body, frame, fp, seed + bi * 101 + key * 131, look, key, partAt, bi * 2);
      await pause(clock, 'plan');
      const field = await drain(bloodField(body, plan, frame), clock, 'blood');
      const pix = new Uint8ClampedArray(size * size * 4);
      await drain(paintColour(src, layers, look, tone, plan, field, body, tables, pix), clock, 'colour');
      await pause(clock, 'colour');
      const map = toTexture(pix, size, true); count(size);
      const m = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: roughnessMap ? 1 : 0.86, alphaTest: 0.225, side: THREE.DoubleSide, metalness: 0, envMapIntensity: env, name: 'zombie-skin' });
      m.onBeforeCompile = wetShader; m.customProgramCacheKey = () => 'zombie-wet-1';
      shared.push(map, m);
      await pause(clock, 'upload');
      return m;
    };
    const materials = []; for (let i = 0; i < ZOMBIE_SKIN.tones.length; i++) materials.push(await paint(LOOKS.walker[i], ZOMBIE_SKIN.tones[i], i));
    const special = {};
    for (const [name, sp] of Object.entries(ZOMBIE_SKIN.special)) {
      if ((sp.body != null && sp.body !== bi) || (sp.optional && compact)) continue; // 省内存档不多做胖尸那两张，和以前一样多
      special[name] = await paint(LOOKS[name], sp.tone, 10 + Object.keys(special).length, sp.env);
    }
    shared.push(geo);
    bodies.push({ geometry: geo, poses: record.poses, face, materials, special });
  }
  const E = ZOMBIE_SKIN.eyes, eyeGeo = new THREE.SphereGeometry(E.radius, 8, 6);
  const eyeOf = (color) => { const m = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false }); shared.push(m); return m; };
  const eyeMat = eyeOf(E.color), eyeSpecial = Object.fromEntries(Object.entries(ZOMBIE_SKIN.special).map(([k, sp]) => [k, eyeOf(sp.eye)]));
  shared.push(eyeGeo);
  const stats = { ms: Math.round(now() - t0), longest: Math.round(clock.worst[0]), longestIn: clock.worst[1], slices: clock.slices, maps, mb: +(bytes / 1048576).toFixed(1), size, surface };

  return {
    looks: bodies.length * ZOMBIE_SKIN.tones.length,
    stats,
    create() {
      const group = new THREE.Group(); group.name = 'zombie-skin';
      const meshes = bodies.map((b) => {
        const mesh = new THREE.Mesh(b.geometry, b.materials[0]);
        mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = false; mesh.visible = false; // 姿势会把四肢带出站姿的包围盒
        // 眼睛：贴在眼球正前面（量不到眼球就按头顶往下估）
        const spots = b.face.eyes ? b.face.eyes.map((e) => [e.x, e.y, e.front - E.inset]) : [1, -1].map((sx) => [b.face.x + E.half * sx, b.face.top - E.below, b.face.front - 0.01]);
        for (const [x, y, z] of spots) { const eye = new THREE.Mesh(eyeGeo, eyeMat); eye.position.set(x, y, z); mesh.add(eye); }
        group.add(mesh);
        return mesh;
      });
      let cur = 0, spec = null, base = bodies[0].materials[0];
      const apply = (name) => {
        const mesh = meshes[cur], m = (name && bodies[cur].special[name]) || base, eye = (name && bodies[cur].special[name] && eyeSpecial[name]) || eyeMat;
        if (mesh.material !== m) { mesh.material = m; for (const e of mesh.children) e.material = eye; }
      };
      return {
        group,
        /** 换一套外观：index 决定男女和色调；special = 特殊感染者的那一套（'pale' / 'lunger' / 'spitter' / 'brute'），有的固定用某一个模型 */
        setLook(index, special = null) {
          const n = bodies.length, sp = special ? ZOMBIE_SKIN.special[special] : null;
          const i = sp && sp.body != null ? Math.min(n - 1, sp.body) : ((index % n) + n) % n;
          cur = i; meshes.forEach((m, k) => { m.visible = k === i; });
          spec = sp ? special : null; base = bodies[i].materials[Math.floor(index / n) % ZOMBIE_SKIN.tones.length];
          meshes[i].material = null; apply(spec);
        },
        /** phase：走路姿势的圈数；moving 0–1：走得越慢越接近站姿；lean / sway：前倾、左右晃（弧度）；lunge 0–1：扑咬时往前探 */
        pose({ phase = 0, moving = 1, lean = 0, sway = 0, lunge = 0 } = {}) {
          // 胖尸：zombie.js 不给它单独的外观名，只把它横向撑开——撑得够宽、又不是别的特殊感染者，就换上胖尸那一套
          if (!spec) apply(group.scale.x > ZOMBIE_SKIN.bloatGirth ? 'bloater' : null);
          const mesh = meshes[cur], w = mesh.morphTargetInfluences, { a, b, t } = walkBlend(phase, bodies[cur].poses);
          w.fill(0); w[a] = (1 - t) * moving; w[b] += t * moving;
          mesh.rotation.set(lean, 0, sway); mesh.position.set(0, 0, 0.12 * lunge);
        },
        dispose() {},
      };
    },
    dispose() { for (const item of shared) item.dispose(); },
  };
}
