// 贴图树：树冠是一团深色的实心加上二十来张朝外的叶片（镂空的树叶贴图），树干贴树皮。
// 贴图都是在画布上现画的（不占下载），几何和材质全园区共用；每棵树仍然只是几个实例，一次绘制调用画完一片。
// 只在接了贴图模型库的模式（完整园区、小游戏合集）里用；FPS 和单元测试仍是原来的多面体树。
import * as THREE from 'three';
import { TEX_SCALE } from '../device.js';
import { rng } from '../textures.js';

let kit = null;

/** 一簇树叶：先铺一块实心的深绿，再由暗到亮叠一百多片叶子，四周留出参差的镂空边。 */
function leafTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'), rand = rng(4711), c = size / 2;
  g.fillStyle = '#31552a';
  g.beginPath(); g.arc(c, c, size * 0.2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#4b3a26'; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2, r = size * (0.3 + rand() * 0.14);
    g.lineWidth = size * 0.012;
    g.beginPath(); g.moveTo(c, c); g.quadraticCurveTo(c + Math.cos(a + 0.3) * r * 0.5, c + Math.sin(a + 0.3) * r * 0.5, c + Math.cos(a) * r, c + Math.sin(a) * r); g.stroke();
  }
  const leaves = 170;
  for (let i = 0; i < leaves; i++) {
    const k = i / leaves, a = rand() * Math.PI * 2, r = size * 0.44 * Math.sqrt(rand());
    const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
    const length = size * (0.075 + rand() * 0.06), width = length * (0.42 + rand() * 0.16);
    const hue = 88 + rand() * 34, light = 20 + k * 26 + rand() * 6;
    g.save();
    g.translate(x, y); g.rotate(a + (rand() - 0.5) * 1.6);
    const fill = g.createLinearGradient(0, 0, length, 0);
    fill.addColorStop(0, `hsl(${hue} 46% ${light - 5}%)`); fill.addColorStop(1, `hsl(${hue + 6} 52% ${light + 7}%)`);
    g.fillStyle = fill;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(length * 0.3, -width, length * 0.75, -width * 0.7, length, 0);
    g.bezierCurveTo(length * 0.75, width * 0.7, length * 0.3, width, 0, 0); g.fill();
    g.strokeStyle = `hsl(${hue + 8} 40% ${light + 14}%)`; g.lineWidth = Math.max(1, size * 0.003);
    g.beginPath(); g.moveTo(length * 0.06, 0); g.lineTo(length * 0.94, 0); g.stroke();
    g.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

/** 针叶：一排排下垂的深绿针束，下缘参差。上下可以接着铺（每层裙边用一整幅）。 */
function needleTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const g = canvas.getContext('2d'), rand = rng(977);
  g.fillStyle = '#23492f'; g.fillRect(0, 0, size, size * 0.62);
  for (let i = 0; i < 520; i++) {
    const x = rand() * size, y = rand() * size * 0.7, len = size * (0.12 + rand() * 0.2);
    g.strokeStyle = `hsl(${128 + rand() * 22} ${34 + rand() * 18}% ${17 + rand() * 20}%)`;
    g.lineWidth = Math.max(1, size * (0.006 + rand() * 0.008));
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * size * 0.06, Math.min(size, y + len)); g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping; texture.anisotropy = 4;
  return texture;
}

/** 树皮：竖向的深浅沟纹。 */
function barkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 128;
  const g = canvas.getContext('2d'), rand = rng(31);
  g.fillStyle = '#6a4d35'; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `hsl(${24 + rand() * 10} ${22 + rand() * 16}% ${18 + rand() * 26}%)`;
    g.lineWidth = 1 + rand() * 2.4;
    const x = rand() * 64, y = rand() * 128;
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + (rand() - 0.5) * 6, y + 14, x + (rand() - 0.5) * 6, y + 30, x + (rand() - 0.5) * 4, y + 26 + rand() * 30); g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * 阔叶树冠（单位半径 1，原点在球心）：实心的二十面体 + cards 张朝外的叶片。
 * 叶片的法线都取「从球心指向顶点」的方向，受光像一整团，不会一片亮一片暗。纯几何，不碰 DOM。
 */
export function crownGeometry(cards = 22, seed = 7) {
  const rand = rng(seed), pos = [], nor = [], uv = [], idx = [];
  const core = new THREE.IcosahedronGeometry(0.68, 0), cp = core.attributes.position; // 多面体几何本来就不带索引
  for (let i = 0; i < cp.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(cp, i), n = v.clone().normalize();
    pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); uv.push(0.5 + n.x * 0.09, 0.5 + n.y * 0.09); idx.push(i);
  }
  core.dispose();
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), v = new THREE.Vector3();
  for (let k = 0; k < cards; k++) {
    // 斐波那契球面：方向分布均匀；最底下那一圈不放叶片（那里是树干）
    const y = 1 - (k + 0.5) / cards * 1.72, r = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.399963;
    d.set(Math.cos(a) * r, y, Math.sin(a) * r);
    n.set(d.x + (rand() - 0.5) * 0.7, d.y + (rand() - 0.5) * 0.7, d.z + (rand() - 0.5) * 0.7).normalize();
    t.crossVectors(Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up, n).normalize(); b.crossVectors(n, t);
    const size = 1.0 + rand() * 0.35, base = pos.length / 3, spin = rand() * Math.PI * 2, cs = Math.cos(spin), sn = Math.sin(spin);
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const tu = (su * cs - sv * sn) * size / 2, tv = (su * sn + sv * cs) * size / 2;
      v.copy(d).multiplyScalar(0.7).addScaledVector(t, tu).addScaledVector(b, tv);
      pos.push(v.x, v.y, v.z);
      v.normalize(); nor.push(v.x, v.y, v.z);
      uv.push(su * 0.5 + 0.5, sv * 0.5 + 0.5);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

/** 针叶树冠（底面在 y=0，高 2.2，底半径 1）：四层由下到上收小的裙边，每层是一圈开口的锥面。 */
export function coneCrownGeometry(tiers = 4, segments = 9) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let k = 0; k < tiers; k++) {
    const y0 = k * 0.46, y1 = y0 + 0.95 - k * 0.06, r0 = 1 - k * 0.2, r1 = Math.max(0.03, r0 * 0.18);
    const base = pos.length / 3;
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2 + k * 0.5, cx = Math.cos(a), cz = Math.sin(a);
      pos.push(cx * r0, y0, cz * r0, cx * r1, y1, cz * r1);
      const ny = (r0 - r1) / (y1 - y0), len = Math.hypot(1, ny);
      nor.push(cx / len, ny / len, cz / len, cx / len, ny / len, cz / len);
      uv.push(i / segments * 3, 0, i / segments * 3, 1);
    }
    for (let i = 0; i < segments; i++) { const p = base + i * 2; idx.push(p, p + 1, p + 3, p, p + 3, p + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

/** 整个园区共用的一套：几何、材质、阴影用的镂空深度材质。 */
export function treeKit() {
  if (kit) return kit;
  const size = Math.round(512 * TEX_SCALE), leaf = leafTexture(size), needle = needleTexture(Math.round(256 * TEX_SCALE)), bark = barkTexture();
  const leafMat = new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, envMapIntensity: 0.35 });
  const needleMat = new THREE.MeshStandardMaterial({ map: needle, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, metalness: 0, envMapIntensity: 0.3 });
  const trunkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95, metalness: 0 });
  leafMat.name = 'tree leaves · canvas'; needleMat.name = 'tree needles · canvas'; trunkMat.name = 'tree bark · canvas';
  const depth = (map) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
  kit = { crown: crownGeometry(), cone: coneCrownGeometry(), leafMat, needleMat, trunkMat, leafDepth: depth(leaf), needleDepth: depth(needle),
    trunk: new THREE.CylinderGeometry(0.16, 0.24, 1, 7).translate(0, 0.5, 0) };
  return kit;
}
