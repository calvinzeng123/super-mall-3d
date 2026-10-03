// 可复用的小品：树、路灯、长椅、花坛、IP「云宝」、桌椅、遮阳伞、人行斑马线等。
import * as THREE from 'three';
import { COLORS } from '../theme.js';
import { rng } from '../textures.js';

/** 实例化树木：每棵 { x, y, z, s(缩放), kind('round'|'cone'|'palm') } */
export function addTrees(group, mats, list, seed = 7) {
  if (!list.length) return null;
  const rand = rng(seed);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 6).translate(0, 0.5, 0);
  const crownRound = new THREE.IcosahedronGeometry(1, 1);
  const crownCone = new THREE.ConeGeometry(1, 2.2, 7).translate(0, 1.1, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4d33, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
  const rounds = list.filter((t) => t.kind !== 'cone');
  const cones = list.filter((t) => t.kind === 'cone');
  const crowns = new THREE.InstancedMesh(crownRound, leafMat, Math.max(1, rounds.length * 2));
  const crownsC = new THREE.InstancedMesh(crownCone, leafMat, Math.max(1, cones.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const greens = ['#4f8a3a', '#5e9a44', '#3f7a35', '#6aa24a', '#7aa84e', '#4b7f3f'];
  const c = new THREE.Color();
  list.forEach((t, i) => {
    const sc = t.s || 1;
    const h = (t.kind === 'cone' ? 1.6 : 2.4) * sc;
    m.compose(p.set(t.x, t.y, t.z), q.identity(), s.set(sc, h, sc));
    trunks.setMatrixAt(i, m);
  });
  rounds.forEach((t, i) => {
    const sc = t.s || 1;
    const top = t.y + 2.4 * sc;
    q.setFromEuler(new THREE.Euler(rand() * 0.5, rand() * 6, rand() * 0.5));
    m.compose(p.set(t.x, top + 1.1 * sc, t.z), q, s.set(2.0 * sc, 1.7 * sc, 2.0 * sc));
    crowns.setMatrixAt(i * 2, m);
    crowns.setColorAt(i * 2, c.set(greens[Math.floor(rand() * greens.length)]));
    m.compose(p.set(t.x + (rand() - 0.5) * sc, top + 2.1 * sc, t.z + (rand() - 0.5) * sc), q, s.set(1.3 * sc, 1.2 * sc, 1.3 * sc));
    crowns.setMatrixAt(i * 2 + 1, m);
    crowns.setColorAt(i * 2 + 1, c.set(greens[Math.floor(rand() * greens.length)]).offsetHSL(0, 0, 0.04));
  });
  cones.forEach((t, i) => {
    const sc = t.s || 1;
    m.compose(p.set(t.x, t.y + 1.2 * sc, t.z), q.identity(), s.set(1.1 * sc, 1.6 * sc, 1.1 * sc));
    crownsC.setMatrixAt(i, m);
    crownsC.setColorAt(i, c.set('#2f6b3a').offsetHSL(0, 0, (rand() - 0.5) * 0.08));
  });
  if (!rounds.length) crowns.count = 0;
  if (!cones.length) crownsC.count = 0;
  for (const mesh of [trunks, crowns, crownsC]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  void mats;
  return { trunks, crowns, crownsC };
}

/** 路灯：杆 + 臂 + 灯头（夜间发光） */
export function streetLamp(B, x, z, y0 = 0, dir = [0, 1], h = 8) {
  B.get('extMetal').cyl(x, y0, z, 0.1, h, '#3b4046', 8);
  const ax = x + dir[0] * 1.6, az = z + dir[1] * 1.6;
  B.get('extMetal').bar({ x, y: y0 + h - 0.1, z }, { x: ax, y: y0 + h + 0.1, z: az }, 0.08, '#3b4046');
  B.get('glow').box(ax, y0 + h, az, dir[0] ? 0.9 : 0.35, 0.12, dir[1] ? 0.9 : 0.35, '#ffe2a8');
}

/** 庭院灯（矮柱灯） */
export function bollard(B, x, z, y0 = 0) {
  B.get('extMetal').cyl(x, y0, z, 0.09, 0.9, '#2f3439', 8);
  B.get('glow').cyl(x, y0 + 0.9, z, 0.1, 0.12, '#ffe9bf', 8);
}

export function bench(B, x, y, z, ry = 0, key = 'ext') {
  const c = Math.cos(ry), s = Math.sin(ry);
  B.get(key).box(x, y + 0.45, z, 1.8, 0.08, 0.5, COLORS.wood, ry);
  B.get(key).box(x - s * 0.22, y + 0.75, z - c * 0.22, 1.8, 0.45, 0.06, COLORS.wood, ry);
  for (const k of [-0.75, 0.75]) B.get('extMetal').box(x + c * k, y + 0.22, z - s * k, 0.06, 0.44, 0.46, '#3d4146', ry);
}

/** 花坛（矩形石边 + 土 + 灌木球） */
export function planter(B, x0, z0, x1, z1, y = 0, seed = 3, flowers = true, key = 'ext') {
  const rand = rng(seed);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  B.get(key).box(cx, y + 0.3, cz, w, 0.6, d, COLORS.stoneDark);
  B.get(key).box(cx, y + 0.62, cz, w - 0.3, 0.06, d - 0.3, '#5b4532');
  const n = Math.max(2, Math.round((w * d) / 1.6));
  const fl = ['#e85d75', '#f2b134', '#f6f1e7', '#b06ad9', '#ff8c5a'];
  for (let i = 0; i < n; i++) {
    const x = x0 + 0.4 + rand() * (w - 0.8), z = z0 + 0.4 + rand() * (d - 0.8);
    const r = 0.35 + rand() * 0.35;
    const col = flowers && rand() < 0.35 ? fl[Math.floor(rand() * fl.length)] : ['#4f8a3a', '#5e9a44', '#3f7a35'][Math.floor(rand() * 3)];
    B.get('foliage').sphere(x, y + 0.65 + r * 0.6, z, r, col, r * 0.8, r, 'ico0');
  }
}

/** 原创 IP「云宝」：云朵小熊，坐姿，颈部围着云澜青色围巾。scale=1 约 5.6m 高 */
export function ipMascot(B, x, y, z, scale = 1, ry = 0, plinth = true) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  const P = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).multiplyScalar(scale).applyQuaternion(q).add(new THREE.Vector3(x, y, z));
  const S = (sx, sy, sz) => new THREE.Vector3(sx, sy, sz).multiplyScalar(scale);
  const I = new THREE.Quaternion();
  const white = '#f7f9fc', shade = '#e6edf5', teal = '#0f7f99', pink = '#f7a8c2', dark = '#25303a';
  if (plinth) {
    B.get('extSatin').cyl(x, y, z, 3.0 * scale, 0.7 * scale, COLORS.stoneDark, 24);
    B.get('extSatin').cyl(x, y + 0.7 * scale, z, 2.7 * scale, 0.08 * scale, '#d8d2c6', 24);
  }
  const by = plinth ? 0.78 : 0;
  const s = (name, lp, ls, col, rot = I) => B.get('extSatin').shape(name, P(lp[0], lp[1] + by, lp[2]), rot.clone().premultiply(q), S(...ls), col);
  s('sphere', [0, 1.45, 0], [2.7, 2.5, 2.3], white);
  s('sphere', [0, 1.35, 0.85], [1.7, 1.6, 0.9], shade);
  s('sphere', [-0.8, 0.45, 1.05], [1.1, 0.8, 1.3], white);
  s('sphere', [0.8, 0.45, 1.05], [1.1, 0.8, 1.3], white);
  s('sphere', [-0.8, 0.42, 1.65], [0.6, 0.45, 0.2], pink);
  s('sphere', [0.8, 0.42, 1.65], [0.6, 0.45, 0.2], pink);
  const armL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0.55));
  const armR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, -0.55));
  s('capsule', [-1.35, 1.75, 0.45], [0.75, 0.75, 0.75], white, armL);
  s('capsule', [1.35, 1.75, 0.45], [0.75, 0.75, 0.75], white, armR);
  s('sphere', [0, 3.65, 0], [3.0, 2.75, 2.7], white);
  // 云朵耳朵（三团）
  s('sphere', [-1.05, 4.9, -0.1], [1.1, 1.0, 1.0], white);
  s('sphere', [1.05, 4.9, -0.1], [1.1, 1.0, 1.0], white);
  s('sphere', [0, 5.15, -0.25], [1.25, 1.05, 1.1], white);
  s('sphere', [-0.48, 3.78, 1.28], [0.32, 0.4, 0.2], dark);
  s('sphere', [0.48, 3.78, 1.28], [0.32, 0.4, 0.2], dark);
  s('sphere', [-0.42, 3.86, 1.37], [0.1, 0.1, 0.06], '#ffffff');
  s('sphere', [0.54, 3.86, 1.37], [0.1, 0.1, 0.06], '#ffffff');
  s('sphere', [0, 3.42, 1.42], [0.26, 0.2, 0.16], dark);
  s('sphere', [-0.95, 3.32, 1.12], [0.48, 0.3, 0.2], pink);
  s('sphere', [0.95, 3.32, 1.12], [0.48, 0.3, 0.2], pink);
  const scarf = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  B.get('extSatin').shape('torus', P(0, 2.55 + by, 0.05), scarf.clone().premultiply(q), S(2.55, 2.55, 3.2), teal);
  s('box', [0.55, 2.05, 1.08], [0.42, 0.9, 0.14], teal, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, 0.18)));
}

/** 方桌 + 四椅 */
export function tableSet(B, x, y, z, ry, colors = {}, key = 'matte') {
  const top = colors.top || '#e9e2d6', chair = colors.chair || '#d0612d', leg = colors.leg || '#3a3f45';
  B.get(key).box(x, y + 0.74, z, 1.1, 0.05, 0.75, top, ry);
  B.get('metal').box(x, y + 0.36, z, 0.08, 0.72, 0.08, leg, ry);
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const [lx, lz, r] of [[-0.35, 0.62, 0], [0.35, 0.62, 0], [-0.35, -0.62, Math.PI], [0.35, -0.62, Math.PI]]) {
    const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
    B.get(key).box(wx, y + 0.45, wz, 0.42, 0.06, 0.42, chair, ry + r);
    const bx = wx + Math.sin(ry + r) * 0.19, bz = wz + Math.cos(ry + r) * 0.19;
    B.get(key).box(bx, y + 0.7, bz, 0.42, 0.45, 0.05, chair, ry + r);
  }
}

/** 圆桌 + 若干椅 */
export function roundTable(B, x, y, z, n = 4, colors = {}, key = 'matte') {
  const top = colors.top || '#f3efe7', chair = colors.chair || '#2f86b0';
  B.get(key).cyl(x, y + 0.72, z, 0.45, 0.05, top, 16);
  B.get('metal').cyl(x, y, z, 0.05, 0.72, '#3a3f45', 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cx = x + Math.cos(a) * 0.82, cz = z + Math.sin(a) * 0.82;
    B.get(key).cyl(cx, y + 0.42, cz, 0.22, 0.06, chair, 8);
    B.get(key).box(cx + Math.cos(a) * 0.2, y + 0.68, cz + Math.sin(a) * 0.2, 0.06, 0.45, 0.4, chair, -a);
  }
}

/** 遮阳伞 */
export function umbrella(B, x, y, z, color = '#f4f1ea', r = 1.4) {
  B.get('extMetal').cyl(x, y, z, 0.04, 2.4, '#4a4f55', 6);
  B.get('ext').cone(x, y + 2.1, z, r, 0.55, color, 8);
}

/** 斑马线：沿 axis 方向通行，宽 w，长 len */
export function zebra(B, cx, cz, len, w, axis = 'z', y = 0.012, key = 'ext') {
  const n = Math.floor(len / 0.9);
  for (let i = 0; i < n; i++) {
    const o = -len / 2 + (i + 0.5) * (len / n);
    if (axis === 'z') B.get(key).box(cx + o, y, cz, 0.45, 0.02, w, '#f2f2ee');
    else B.get(key).box(cx, y, cz + o, w, 0.02, 0.45, '#f2f2ee');
  }
}
