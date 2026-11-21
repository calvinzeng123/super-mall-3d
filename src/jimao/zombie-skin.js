// 丧尸的外形：用园区行人的贴图模型（Microsoft Rocketbox，MIT；一男一女，各带八个走路姿势），把贴图重画成丧尸。
// 怎么画在 skins/zombie-paint.js：先把模型的三角形按 UV 摊到一张小网格上，贴图上每一处都知道自己在身体的哪里，
// 于是伤口落在身体的实处、血往下淌、越往脚下越脏、眼窝和嘴唇按脸的三维位置压黑，UV 接缝两边对得上。
// 每种外观一张颜色图（几套色调 + 特殊感染者）；法线和粗糙度每个模型一张、各外观共用（湿血反光、布料哑光、皮肤有点蜡）。
// 走路用模型自带的姿势循环，前倾、摇晃、扑咬、倒地都是整个人的姿态（模型没有骨骼，胳膊抬不起来）。眼睛是两粒很小的发光点：停电的楼里先看见眼睛。
// zombie.js 里手搭的方块人留着：模型没加载出来（或测试环境）就还用它。
// 行人那份几何上传显卡后内存里的贴图可能已经缩过 / 关掉了，这里单独再解析一份。
// 画贴图是开局时的大块 CPU 活：全部切成小段，每段十来毫秒，隔帧接着画（不卡开局那几秒）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PEOPLE_ASSETS } from '../render/people-data.js';
import { fetchBinary } from '../render/fetch-binary.js';
import { MEM } from '../render/device.js';
import { LOOKS, noiseTableSteps, rasterBodySteps, bodyFrame, planWounds, planStains, stainField, prepareLayers, paintColour, paintSurface } from './skins/zombie-paint.js';

/**
 * tones：几套色调 [衣服去色后乘上的 R, G, B, 保留多少原来的颜色, 旧血块数]（皮肤、血、脏怎么画见 zombie-paint.js 的 LOOKS.walker，一一对应）；
 * special：特殊感染者的（body：用哪个模型，0 男 1 女，不写两个都做；eye：眼睛的颜色；optional：省内存档不做，用普通的那套顶上）。
 * size：颜色图最大边长（电脑 1024；手机按内存档位的 modelTex：512 / 256）；法线和粗糙度是颜色图的一半，省内存档不做。
 * cyclesPerMetre：每走一米走路姿势转多少圈。
 */
export const ZOMBIE_SKIN = Object.freeze({
  size: 1024,
  tones: Object.freeze([[0.62, 0.7, 0.56, 0.34, 3], [0.56, 0.6, 0.62, 0.26, 2], [0.7, 0.62, 0.5, 0.4, 5]]),
  // 尖叫者惨白没血色，扑袭者一身黑灰、红眼，喷酸者蜡黄发绿、嘴边淌涎水，巨尸暗红满身烂疮，胖尸灰绿发紫、一身脓疱
  special: Object.freeze({
    pale: Object.freeze({ tone: [0.84, 0.86, 0.8, 0.12, 1], eye: 0xffffff }),
    lunger: Object.freeze({ tone: [0.42, 0.4, 0.42, 0.2, 4], body: 0, eye: 0xff4a3a }),
    spitter: Object.freeze({ tone: [0.74, 0.8, 0.42, 0.3, 2], body: 1, eye: 0xb6ff5a }),
    brute: Object.freeze({ tone: [0.5, 0.34, 0.3, 0.22, 6], body: 0, eye: 0xffa040 }),
    bloater: Object.freeze({ tone: [0.66, 0.7, 0.52, 0.3, 3], eye: 0xd8e070, optional: true }),
  }),
  eyes: Object.freeze({ below: 0.108, half: 0.031, inset: 0.01, radius: 0.0068, color: 0xffe9a8 }), // 眼睛：离头顶多少米、两眼间距的一半、比脸的最前面缩进多少、半径
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
 * 返回 { top（头顶高度）, front（眼睛那一圈最靠前的 z）, x（头的左右中心） }。
 */
export function faceOf(geometry) {
  const P = geometry.attributes.position, D = geometry.morphAttributes.position?.[0], rel = geometry.morphTargetsRelative;
  const at = (i, get) => (D ? (rel ? get(P, i) + get(D, i) : get(D, i)) : get(P, i));
  const X = (a, i) => a.getX(i), Y = (a, i) => a.getY(i), Z = (a, i) => a.getZ(i);
  let top = -Infinity; for (let i = 0; i < P.count; i++) top = Math.max(top, at(i, Y));
  let front = -Infinity, sx = 0, n = 0;
  for (let i = 0; i < P.count; i++) { const y = at(i, Y); if (y > top - 0.15 && y < top - 0.07) { front = Math.max(front, at(i, Z)); sx += at(i, X); n++; } }
  return { top, front, x: n ? sx / n : 0 };
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

// 一张画好的像素 → 贴图。上传显卡以后就把画布缩掉（手机上内存紧，画布那份像素留着没用；显示资源被回收会整页刷新，不需要重传）
function toTexture(pixels, size, srgb) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'); g.putImageData(new ImageData(pixels, size, size), 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false; t.anisotropy = srgb ? 4 : 2; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.onUpdate = () => { t.onUpdate = null; t.image = { width: size, height: size }; canvas.width = canvas.height = 1; };
  return t;
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
    const frame = bodyFrame(geo.attributes.position.array), plan = planWounds(body, frame, face, seed + bi * 101);
    await pause(clock, 'plan');
    const layers = await drain(prepareLayers(src, size, body, plan, tables), clock, 'layers');
    // 法线和粗糙度：每个模型一张，各外观共用
    let normalMap = null, roughnessMap = null;
    if (surface) {
      const nPix = new Uint8ClampedArray(surface * surface * 4), rPix = new Uint8ClampedArray(surface * surface * 4);
      await drain(paintSurface(src, layers, tables, nPix, rPix), clock, 'surface');
      await pause(clock, 'surface');
      normalMap = toTexture(nPix, surface, false); await pause(clock, 'upload'); roughnessMap = toTexture(rPix, surface, false); count(surface); count(surface);
      shared.push(normalMap, roughnessMap);
    }
    const paint = async (look, tone, key) => {
      const pix = new Uint8ClampedArray(size * size * 4), stains = planStains(body, frame, seed + bi * 7 + key * 131, tone[4] ?? look.stains, !!look.back);
      await pause(clock, 'stains');
      await drain(paintColour(src, layers, look, tone, stainField(body, stains), body, pix), clock, 'colour');
      await pause(clock, 'colour');
      const map = toTexture(pix, size, true); count(size);
      const m = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: roughnessMap ? 1 : 0.86, alphaTest: 0.45, side: THREE.DoubleSide, metalness: 0, envMapIntensity: ZOMBIE_SKIN.envMapIntensity, name: 'zombie-skin' });
      shared.push(map, m);
      await pause(clock, 'upload');
      return m;
    };
    const materials = []; for (let i = 0; i < ZOMBIE_SKIN.tones.length; i++) materials.push(await paint(LOOKS.walker[i], ZOMBIE_SKIN.tones[i], i));
    const special = {};
    for (const [name, sp] of Object.entries(ZOMBIE_SKIN.special)) {
      if ((sp.body != null && sp.body !== bi) || (sp.optional && compact)) continue; // 省内存档不多做胖尸那两张，和以前一样多
      special[name] = await paint(LOOKS[name], sp.tone, 10 + Object.keys(special).length);
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
        for (const sx of [1, -1]) { const eye = new THREE.Mesh(eyeGeo, eyeMat); eye.position.set(b.face.x + E.half * sx, b.face.top - E.below, b.face.front - E.inset); mesh.add(eye); }
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
