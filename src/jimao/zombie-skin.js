// 丧尸的外形：用园区行人的贴图模型（Microsoft Rocketbox，MIT；一男一女，各带八个走路姿势），把贴图处理成丧尸——
// 整体去色、偏灰绿、压暗，再泼上几块血污和脏污；每个模型出几套不同的色调。走路用模型自带的姿势循环，
// 前倾、摇晃、扑咬、倒地都是整个人的姿态（模型没有骨骼，胳膊抬不起来）。眼睛是两粒很小的发光点：停电的楼里先看见眼睛。
// zombie.js 里手搭的方块人留着：模型没加载出来（或测试环境）就还用它。
// 行人那份几何上传显卡后内存里的贴图可能已经缩过 / 关掉了，这里单独再解析一份。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PEOPLE_ASSETS } from '../render/people-data.js';
import { fetchBinary } from '../render/fetch-binary.js';
import { MEM } from '../render/device.js';

/**
 * tones：几套色调 [去色后乘上的 R, G, B, 保留多少原来的颜色, 血污块数]；pale 给尖叫者（惨白）。
 * cyclesPerMetre：每走一米走路姿势转多少圈。
 */
export const ZOMBIE_SKIN = Object.freeze({
  size: 512,
  tones: Object.freeze([[0.62, 0.7, 0.56, 0.34, 7], [0.56, 0.6, 0.62, 0.26, 5], [0.7, 0.62, 0.5, 0.4, 9]]),
  pale: Object.freeze([0.84, 0.86, 0.8, 0.12, 4]),
  eyes: Object.freeze({ below: 0.108, half: 0.031, inset: 0.01, radius: 0.0068, color: 0xffe9a8 }), // 眼睛：离头顶多少米、两眼间距的一半、比脸的最前面缩进多少、半径
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

/** 把行人贴图画成丧尸贴图：逐像素去色上色，再用「正片叠底」泼血污、脏污。rng 决定血污的位置。 */
function paintZombie(image, tone, rng, size) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, size, size);
  const data = g.getImageData(0, 0, size, size), p = data.data;
  for (let i = 0; i < p.length; i += 4) { const c = zombieTone(p[i], p[i + 1], p[i + 2], tone); p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; }
  g.putImageData(data, 0, 0);
  g.globalCompositeOperation = 'multiply';
  const blot = (x, y, r, inner, outer) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, inner); gr.addColorStop(0.55, outer); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  for (let k = 0; k < tone[4]; k++) { // 血污：深红，大小不一，旁边带两三滴溅出去的
    const x = rng() * size, y = rng() * size, r = size * (0.03 + rng() * 0.07);
    blot(x, y, r, 'rgba(70,8,6,1)', 'rgba(120,22,16,1)');
    for (let j = 0; j < 3; j++) blot(x + (rng() - 0.5) * r * 3, y + (rng() - 0.5) * r * 3, r * (0.15 + rng() * 0.2), 'rgba(80,10,8,1)', 'rgba(130,30,22,1)');
  }
  for (let k = 0; k < 10; k++) blot(rng() * size, rng() * size, size * (0.05 + rng() * 0.09), 'rgba(150,140,120,1)', 'rgba(200,192,176,1)'); // 脏污
  g.globalCompositeOperation = 'source-over';
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 2;
  return texture;
}

/**
 * 载入一次，之后 create() 出任意多只。返回 { create(), dispose() }；
 * create() 返回 { group, setLook(index, pale), pose({ phase, moving, lean, sway, lunge }), dispose() }：group 的原点在脚下、面朝局部 +Z。
 */
export async function loadZombieKit({ seed = 20261120 } = {}) {
  let s = seed >>> 0; const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const size = Math.min(ZOMBIE_SKIN.size, MEM.modelTex || ZOMBIE_SKIN.size);
  const bodies = [], shared = [];
  for (const record of PEOPLE_ASSETS) {
    const source = await parsePerson(record), image = source.material.map.image;
    const face = faceOf(source.geometry);
    const materials = [...ZOMBIE_SKIN.tones, ZOMBIE_SKIN.pale].map((tone) => {
      const map = paintZombie(image, tone, rng, size);
      const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, envMapIntensity: 0.15, name: 'zombie-skin' });
      shared.push(map, m);
      return m;
    });
    source.material.map?.dispose(); source.material.dispose(); image.close?.();
    shared.push(source.geometry);
    bodies.push({ geometry: source.geometry, poses: record.poses, face, materials });
  }
  const E = ZOMBIE_SKIN.eyes, eyeGeo = new THREE.SphereGeometry(E.radius, 8, 6), eyeMat = new THREE.MeshBasicMaterial({ color: E.color, toneMapped: false, fog: false });
  shared.push(eyeGeo, eyeMat);

  return {
    looks: bodies.length * ZOMBIE_SKIN.tones.length,
    create() {
      const group = new THREE.Group(); group.name = 'zombie-skin';
      const meshes = bodies.map((b) => {
        const mesh = new THREE.Mesh(b.geometry, b.materials[0]);
        mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = false; mesh.visible = false; // 姿势会把四肢带出站姿的包围盒
        for (const sx of [1, -1]) { const eye = new THREE.Mesh(eyeGeo, eyeMat); eye.position.set(b.face.x + E.half * sx, b.face.top - E.below, b.face.front - E.inset); mesh.add(eye); }
        group.add(mesh);
        return mesh;
      });
      let cur = 0;
      return {
        group,
        /** 换一套外观：index 决定男女和色调；pale = 惨白（尖叫者） */
        setLook(index, pale = false) {
          const n = bodies.length, i = ((index % n) + n) % n, t = pale ? ZOMBIE_SKIN.tones.length : Math.floor(index / n) % ZOMBIE_SKIN.tones.length;
          cur = i; meshes.forEach((m, k) => { m.visible = k === i; }); meshes[i].material = bodies[i].materials[t];
        },
        /** phase：走路姿势的圈数；moving 0–1：走得越慢越接近站姿；lean / sway：前倾、左右晃（弧度）；lunge 0–1：扑咬时往前探 */
        pose({ phase = 0, moving = 1, lean = 0, sway = 0, lunge = 0 } = {}) {
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
