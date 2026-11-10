// 可复用的小品：树、路灯、长椅、花坛、IP「云宝」、桌椅、遮阳伞、人行斑马线等。
import * as THREE from 'three';
import { COLORS } from '../theme.js';
import { rng } from '../textures.js';
import { getPropLibrary } from '../batch.js';
import { treeKit } from './tree-kit.js';

// 细支腿的上下端都嵌入座垫 / 地面，只保留四个可见侧面。
// 外轮廓和全部四条腿不变，单根由 36 顶点降到 24 顶点。
const postGeometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const postPos = [], postNor = [];
for (let i = 0; i < postGeometry.attributes.position.count; i++) {
  if (Math.abs(postGeometry.attributes.normal.getY(i)) > .99) continue;
  postPos.push(postGeometry.attributes.position.getX(i), postGeometry.attributes.position.getY(i), postGeometry.attributes.position.getZ(i));
  postNor.push(postGeometry.attributes.normal.getX(i), postGeometry.attributes.normal.getY(i), postGeometry.attributes.normal.getZ(i));
}
const OPEN_POST = { pos: postPos, nor: postNor, count: postPos.length / 3 };
postGeometry.dispose();
const postMatrix = new THREE.Matrix4(), postRotation = new THREE.Quaternion();
const postPosition = new THREE.Vector3(), postScale = new THREE.Vector3(), postAxis = new THREE.Vector3(), postUp = new THREE.Vector3(0, 1, 0);
function support(B, a, b, thick, color) {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  postPosition.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  postRotation.setFromUnitVectors(postUp, postAxis.set((b.x - a.x) / len, (b.y - a.y) / len, (b.z - a.z) / len));
  postScale.set(thick, len, thick); postMatrix.compose(postPosition, postRotation, postScale);
  B.get('metal').push(OPEN_POST, postMatrix, color);
}

/** 实例化树木：每棵 { x, y, z, s(缩放), kind('round'|'cone'|'palm') } */
export function addTrees(group, mats, list, seed = 7) {
  if (!list.length) return null;
  const rand = rng(seed);
  // 接了贴图模型库（完整园区、小游戏）时用贴图树：叶片簇树冠加树皮树干；否则是原来的多面体树
  const library = getPropLibrary(), kit = library ? treeKit() : null;
  if (kit) {
    const shared = library.resources();
    for (const g of [kit.crown, kit.cone, kit.trunk]) shared.geometries.add(g);
    for (const m of [kit.leafMat, kit.needleMat, kit.trunkMat, kit.leafDepth, kit.needleDepth]) { shared.materials.add(m); if (m.map) shared.textures.add(m.map); }
  }
  const trunkGeo = kit ? kit.trunk : new THREE.CylinderGeometry(0.16, 0.24, 1, 6).translate(0, 0.5, 0);
  const crownRound = kit ? kit.crown : new THREE.IcosahedronGeometry(1, 1);
  const crownCone = kit ? kit.cone : new THREE.ConeGeometry(1, 2.2, 7).translate(0, 1.1, 0);
  const trunkMat = kit ? kit.trunkMat : new THREE.MeshStandardMaterial({ color: 0x6b4d33, roughness: 0.9 });
  const leafMat = kit ? kit.leafMat : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
  const rounds = list.filter((t) => t.kind !== 'cone');
  const cones = list.filter((t) => t.kind === 'cone');
  const crowns = new THREE.InstancedMesh(crownRound, leafMat, Math.max(1, rounds.length * 2));
  const crownsC = new THREE.InstancedMesh(crownCone, kit ? kit.needleMat : leafMat, Math.max(1, cones.length));
  if (kit) { crowns.customDepthMaterial = kit.leafDepth; crownsC.customDepthMaterial = kit.needleDepth; }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  // 贴图本身已经是绿的，实例色只做浅浅的冷暖深浅变化
  const greens = kit ? ['#eef3dc', '#ffffe6', '#dcebd2', '#f3f7df', '#fff3d2', '#e2eed4'] : ['#4f8a3a', '#5e9a44', '#3f7a35', '#6aa24a', '#7aa84e', '#4b7f3f'];
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
    crowns.setColorAt(i * 2 + 1, c.set(greens[Math.floor(rand() * greens.length)]).offsetHSL(0, 0, kit ? 0 : 0.04));
  });
  cones.forEach((t, i) => {
    const sc = t.s || 1;
    m.compose(p.set(t.x, t.y + 1.2 * sc, t.z), q.identity(), s.set(1.1 * sc, 1.6 * sc, 1.1 * sc));
    crownsC.setMatrixAt(i, m);
    crownsC.setColorAt(i, c.set(kit ? '#f2f6ee' : '#2f6b3a').offsetHSL(0, 0, (rand() - 0.5) * 0.08));
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
  // 街边小件（贴图模型）：隔几根灯杆在背向车道的一侧放一个垃圾桶、消火栓或配电箱。位置由坐标决定，每次都一样。
  const pick = Math.abs(Math.round(x * 13 + z * 7)) % 9, bx = x - dir[0] * .95, bz = z - dir[1] * .95, face = Math.atan2(dir[0], dir[1]);
  if (pick === 0) { if (B.prop('trash_can', bx, y0, bz, face, .82, { outdoor: true }) && Math.round(x + z) % 2) B.prop('trash_bag', bx + dir[1] * .6, y0, bz + dir[0] * .6, face + 1, .7, { outdoor: true }); }
  else if (pick === 3) B.prop('hydrant', bx, y0, bz, face, 1, { outdoor: true });
  else if (pick === 6) B.prop('utility_box', bx, y0, bz, face, 1, { outdoor: true });
}

/** 庭院灯（矮柱灯） */
export function bollard(B, x, z, y0 = 0) {
  B.get('extMetal').cyl(x, y0, z, 0.09, 0.9, '#2f3439', 8);
  B.get('glow').cyl(x, y0 + 0.9, z, 0.1, 0.12, '#ffe9bf', 8);
}

export function bench(B, x, y, z, ry = 0, key = 'ext') {
  const c = Math.cos(ry), s = Math.sin(ry);
  B.blob?.(x, y, z, 2.3, 0.95, ry);
  for (let i = 0; i < 5; i++) {
    const dz = -.20 + i * .10;
    B.get(key).box(x + s * dz, y + .45, z + c * dz, 1.8, .075, .083, COLORS.wood, ry);
  }
  for (let i = 0; i < 3; i++) B.get(key).box(x - s * .22, y + .6 + i * .14, z - c * .22, 1.8, .11, .06, COLORS.wood, ry);
  for (const k of [-0.75, 0.75]) B.get('extMetal').box(x + c * k, y + 0.22, z - s * k, 0.06, 0.44, 0.46, '#3d4146', ry);
  for (const k of [-.81, .81]) {
    B.get('extMetal').box(x + c * k, y + .59, z - s * k, .035, .25, .035, '#3d4146', ry);
    B.get('extMetal').box(x + c * k, y + .72, z - s * k, .05, .045, .38, '#3d4146', ry);
  }
}

/** 花坛（矩形石边 + 土 + 灌木球） */
export function planter(B, x0, z0, x1, z1, y = 0, seed = 3, flowers = true, key = 'ext') {
  const rand = rng(seed);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  B.blob?.(cx, y, cz, w + 0.9, d + 0.9);
  // 真正的种植槽：石材围边低于花叶，土壤内退，不用整块实心顶面盖住植物根部。
  for (const x of [x0 + .09, x1 - .09]) B.get(key).box(x, y + .3, cz, .18, .6, d, COLORS.stoneDark);
  for (const z of [z0 + .09, z1 - .09]) B.get(key).box(cx, y + .3, z, Math.max(.1, w - .36), .6, .18, COLORS.stoneDark);
  B.get(key).box(cx, y + .54, cz, Math.max(.1, w - .3), .04, Math.max(.1, d - .3), '#5b4532');
  if (B.hasProp?.('plant_fern')) { plantBed(B, x0, z0, x1, z1, y + .56, rand, flowers); return; }
  const n = Math.max(2, Math.round((w * d) / 1.6));
  const fl = ['#e85d75', '#f2b134', '#f6f1e7', '#b06ad9', '#ff8c5a'];
  for (let i = 0; i < n; i++) {
    const x = x0 + 0.4 + rand() * (w - 0.8), z = z0 + 0.4 + rand() * (d - 0.8);
    const r = 0.35 + rand() * 0.35;
    const col = flowers && rand() < 0.35 ? fl[Math.floor(rand() * fl.length)] : ['#4f8a3a', '#5e9a44', '#3f7a35'][Math.floor(rand() * 3)];
    B.get('foliage').sphere(x, y + 0.65 + r * 0.6, z, r, col, r * 0.8, r, 'ico0');
  }
}

const BED_PLANTS = [['plant_fern', .99], ['plant_fern_b', .87], ['plant_calathea', .6], ['plant_calathea_b', .4], ['plant_anthurium', .9], ['plant_anthurium_b', .76]];
const BED_SHRUBS = [['plant_pachira_small', .97], ['plant_pachira', 1.05]];
const BED_FLOWERS = [['flower_gazania', .34], ['flower_gazania_b', .28]];
/**
 * 花坛里的贴图植物：窄的种观叶植物，够宽的隔几棵放一株小树，flowers 再点几簇花。
 * 每个条目是 [模型, 原始宽度]，按想要的冠幅缩放。y 是土面标高。
 */
export function plantBed(B, x0, z0, x1, z1, y, rand, flowers = true) {
  const w = x1 - x0, d = z1 - z0, short = Math.min(w, d);
  const put = (list, x, z, spread) => {
    const [id, width] = list[Math.floor(rand() * list.length)];
    B.prop(id, x, y, z, rand() * Math.PI * 2, spread / width, { anchored: true }); // 种在花坛里，不用再查脚下有没有楼板
  };
  const inset = Math.min(.45, short * .3);
  const at = () => [x0 + inset + rand() * Math.max(.01, w - 2 * inset), z0 + inset + rand() * Math.max(.01, d - 2 * inset)];
  const n = Math.min(14, Math.max(1, Math.round((w * d) / 2.6)));
  for (let i = 0; i < n; i++) {
    const [x, z] = at();
    if (short > 1.6 && i % 4 === 0) put(BED_SHRUBS, x, z, Math.min(short * .8, 1.0 + rand() * .4));
    else put(BED_PLANTS, x, z, Math.min(short * 1.25, .85 + rand() * .55));
  }
  if (flowers) for (let i = 0; i < Math.max(1, Math.round(n * .6)); i++) { const [x, z] = at(); put(BED_FLOWERS, x, z, .55 + rand() * .3); }
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
  if (B.hasProp?.('cafe_table')) {
    // 贴图模型：木方桌配四把椅子。室外用折叠椅，餐厅（satin）用皮餐椅，其余用壳椅并染成这一家的颜色。
    const seat = key === 'ext' ? 'outdoor_chair' : key === 'satin' ? 'dining_chair' : 'shell_chair';
    const c0 = Math.cos(ry), s0 = Math.sin(ry);
    B.prop('cafe_table', x, y, z, ry, [1, .766 / .8, 1]); // 桌面 0.766 m，和各处摆在桌上的餐具高度一致
    for (const [lx, lz, r] of [[-0.3, 0.6, 0], [0.3, 0.6, 0], [-0.3, -0.6, Math.PI], [0.3, -0.6, Math.PI]])
      B.prop(seat, x + lx * c0 + lz * s0, y, z - lx * s0 + lz * c0, ry + r + Math.PI, .9, seat === 'shell_chair' ? { color: chair } : undefined);
    return;
  }
  B.get(key).box(x, y + 0.74, z, 1.1, 0.05, 0.75, top, ry);
  B.get('metal').box(x, y + 0.36, z, 0.08, 0.72, 0.08, leg, ry);
  B.get('metal').box(x, y + .035, z, .58, .06, .43, leg, ry);
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const [lx, lz, r] of [[-0.35, 0.62, 0], [0.35, 0.62, 0], [-0.35, -0.62, Math.PI], [0.35, -0.62, Math.PI]]) {
    const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
    B.get(key).box(wx, y + 0.45, wz, 0.42, 0.06, 0.42, chair, ry + r);
    const bx = wx + Math.sin(ry + r) * 0.19, bz = wz + Math.cos(ry + r) * 0.19;
    B.get(key).box(bx, y + 0.7, bz, 0.42, 0.45, 0.05, chair, ry + r);
    for (const da of [-.15, .15]) for (const db of [-.14, .14]) {
      const x = wx + c * da + s * db, z = wz - s * da + c * db;
      support(B, {x, y, z}, {x, y: y + .43, z}, .027, leg);
    }
  }
}

/** 圆桌 + 若干椅 */
export function roundTable(B, x, y, z, n = 4, colors = {}, key = 'matte') {
  const top = colors.top || '#f3efe7', chair = colors.chair || '#2f86b0';
  if (B.hasProp?.('outdoor_table')) {
    // 贴图模型：折叠小桌配 n 把折叠椅，椅子朝向桌心
    B.prop('outdoor_table', x, y, z, 0, [1, .77 / .726, 1]); // 模型的桌面在 0.726 m，拉到 0.77 m，和原来的圆桌、桌上的餐具一样高
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      B.prop('outdoor_chair', x + Math.cos(a) * .78, y, z + Math.sin(a) * .78, Math.atan2(-Math.cos(a), -Math.sin(a)), .95);
    }
    return;
  }
  B.get(key).cyl(x, y + 0.72, z, 0.45, 0.05, top, 16);
  B.get('metal').cyl(x, y, z, 0.05, 0.72, '#3a3f45', 8);
  B.get('metal').cyl(x, y + .015, z, .25, .04, '#3a3f45', 12);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cx = x + Math.cos(a) * 0.82, cz = z + Math.sin(a) * 0.82;
    B.get(key).cyl(cx, y + 0.42, cz, 0.22, 0.06, chair, 8);
    B.get(key).box(cx + Math.cos(a) * 0.2, y + 0.68, cz + Math.sin(a) * 0.2, 0.06, 0.45, 0.4, chair, -a);
    for (const s of [-1, 1]) {
      const dx = Math.cos(a + Math.PI / 2) * .13 * s, dz = Math.sin(a + Math.PI / 2) * .13 * s;
      support(B, {x: cx + dx, y: y + .42, z: cz + dz}, {x: cx + dx * 1.15, y, z: cz + dz * 1.15}, .027, '#3a3f45');
    }
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
  // 贴图模型：斑马线旁的井盖。两条斑马线挨得近时会算到同一个位置，1.5 m 内已经有一个就不再摆。
  const mx = cx + (axis === 'z' ? len / 2 + 1.4 : 0), mz = cz + (axis === 'z' ? 0 : len / 2 + 1.4);
  const [wx, wz] = B.world ? B.world(mx, mz) : [mx, mz], covers = (B.manholes ||= []);
  if (!covers.some(([px, pz]) => Math.hypot(px - wx, pz - wz) < 1.5)) { covers.push([wx, wz]); B.prop('manhole', mx, y - .045, mz, 0, 1, { outdoor: true }); }
  for (let i = 0; i < n; i++) {
    const o = -len / 2 + (i + 0.5) * (len / n);
    if (axis === 'z') B.get(key).box(cx + o, y, cz, 0.45, 0.02, w, '#f2f2ee');
    else B.get(key).box(cx, y, cz + o, w, 0.02, 0.45, '#f2f2ee');
  }
}
