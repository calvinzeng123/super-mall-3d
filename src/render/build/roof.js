// RF 天台花园：草坪、树木、花境、扶梯玻璃亭、电梯厅、4 家餐吧（玻璃亭 + 外摆 + 串灯）、
// 摩天轮「云澜之眼」、IP「云宝」、天空之镜、玻璃悬挑观景台、「云澜汇」立体字、花艺拱门、儿童乐园、花架、设备区。
import * as THREE from 'three';
import { rng, textMask, FONT_CN } from '../textures.js';
import { addTrees, planter, bench, ipMascot, umbrella, tableSet, bollard } from './props.js';
import { COLORS } from '../theme.js';
import { CORE_W, CORE_E, SERVICE } from '../../layout/constants.js';

export function buildRoof(ctx) {
  const lv = ctx.layout.levels.find((l) => l.id === 'RF');
  const L = ctx.levels.RF;
  const B = L.batch;
  const y0 = lv.elev;
  const feat = (t) => lv.features.filter((f) => f.type === t);

  // 草坪
  const grass = ctx.mats.floor('grass', 0.95);
  for (const f of feat('lawn')) {
    const r = f.rect;
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (r.x0 + uv.getX(i) * (r.x1 - r.x0)) / 6, (r.z0 + (1 - uv.getY(i)) * (r.z1 - r.z0)) / 6);
    const m = new THREE.Mesh(g, grass);
    m.position.set((r.x0 + r.x1) / 2, y0 + 0.12, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    L.base.add(m);
    B.get('satin').boxMinMax(r.x0 - 0.2, y0, r.z0 - 0.2, r.x1 + 0.2, y0 + 0.1, r.z1 + 0.2, COLORS.stoneDark);
  }
  // 树（带圆形树池）
  const trees = feat('tree').map((t) => ({ x: t.x, y: y0 + 0.5, z: t.z, s: 0.85 + ((t.x * 7 + t.z * 3) % 5) * 0.06 }));
  for (const t of trees) B.get('satin').cyl(t.x, y0, t.z, 1.1, 0.5, COLORS.stoneDark, 16);
  addTrees(L.base, ctx.mats, trees, 33);

  pavilion(ctx, lv, B, L);
  penthouseLobbies(B, y0);
  for (const u of lv.units) restaurant(ctx, lv, u, B, L);
  ferris(ctx, lv, L);
  const ip = feat('ip')[0];
  ipMascot(B, ip.x, y0, ip.z, 1.25, -Math.PI / 4);
  mirror(B, feat('mirror')[0].rect, y0);
  skywalk(B, feat('skywalk')[0].rect, y0);
  letters(B, feat('letters')[0], y0);
  arch(B, feat('arch')[0], y0);
  playground(ctx, B, L, feat('playground')[0].rect, y0);
  pergola(B, feat('pergola')[0].rect, y0);
  mech(B, lv.rooms.find((r) => r.type === 'mech').rects[0], y0);

  // 花境与座椅
  for (const [x0, z0, x1, z1] of [[-56, -36, -40, -30], [-18, -25.5, -2, -23.2], [2, -25.5, 10, -23.2], [22, 14, 34, 16], [-14, 23, -4, 23.8], [36, -22, 39, -14]]) {
    planter(B, x0, z0, x1, z1, y0, x0 * 13 + z1, true, 'satin');
  }
  for (const [x, z, r] of [[-30, -10, 0], [-30, 10, Math.PI], [-12, 16, Math.PI], [0, 16, Math.PI], [26, 9, Math.PI / 2], [26, -9, Math.PI / 2], [-48, -6, Math.PI / 2]]) bench(B, x, y0, z, r, 'satin');
  for (let x = -54; x <= 54; x += 9) { bollard(B, x, 25.2, y0); bollard(B, x, -24.8, y0); }
}

/** 3F→天台扶梯玻璃亭（屋顶绿化） */
function pavilion(ctx, lv, B, L) {
  const r = lv.features.find((f) => f.type === 'pavilion').rect;
  const y0 = lv.elev, h = 4.4;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  for (const [x, z, sx, sz, gap] of [[cx, r.z0, r.x1 - r.x0, 0.05, false], [cx, r.z1, r.x1 - r.x0, 0.05, false], [r.x1, cz, 0.05, r.z1 - r.z0, false], [r.x0, cz, 0.05, r.z1 - r.z0, true]]) {
    if (gap) {
      B.get('glass').box(x, y0 + h / 2, r.z0 + 1.75, sx, h, 3.5, 0xffffff);
      B.get('glass').box(x, y0 + h / 2, r.z1 - 1.75, sx, h, 3.5, 0xffffff);
      B.get('glass').box(x, y0 + 3.4, cz, sx, 2.0, 3.0, 0xffffff);
    } else B.get('glass').box(x, y0 + h / 2, z, sx, h, sz, 0xffffff);
  }
  for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1], [cx, r.z0], [cx, r.z1]]) B.get('metal').box(x, y0 + h / 2, z, 0.22, h, 0.22, COLORS.white);
  B.get('satin').box(cx, y0 + h + 0.15, cz, r.x1 - r.x0 + 0.8, 0.3, r.z1 - r.z0 + 0.8, COLORS.white);
  B.get('foliage').box(cx, y0 + h + 0.36, cz, r.x1 - r.x0 - 0.2, 0.14, r.z1 - r.z0 - 0.2, '#6b9b45');
  for (let k = 0; k < 10; k++) B.get('foliage').sphere(r.x0 + 1.2 + k * 1.7, y0 + h + 0.55, cz + (k % 2 ? 2.4 : -2.4), 0.5, k % 3 ? '#4f8a3a' : '#e86f8c', 0.4, 0.5, 'ico0');
  B.get('glow').box(r.x0 - 0.05, y0 + h - 0.2, cz, 0.08, 0.08, r.z1 - r.z0, COLORS.led);
  void ctx; void L;
}

/** 电梯厅、货梯厅出屋面的玻璃门斗 */
function penthouseLobbies(B, y0) {
  for (const r of [CORE_W.lobby, CORE_E.lobby, SERVICE.lobby]) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0, h = 4.2;
    const north = cz < 0;
    const openZ = north ? r.z1 : r.z0;
    B.get('glass').box(cx, y0 + h / 2, openZ, w, h, 0.05, 0xffffff);
    B.get('satin').box(cx, y0 + h + 0.12, cz, w + 0.4, 0.24, d + 0.4, COLORS.white);
    B.get('glow').box(cx, y0 + h - 0.15, openZ + (north ? 0.05 : -0.05), w, 0.08, 0.06, COLORS.led);
    B.get('metal').box(r.x0, y0 + h / 2, openZ, 0.15, h, 0.15, COLORS.white);
    B.get('metal').box(r.x1, y0 + h / 2, openZ, 0.15, h, 0.15, COLORS.white);
  }
}

/** 天台餐吧：玻璃亭 + 屋面光伏 + 门头招牌 + 外摆 + 串灯 */
function restaurant(ctx, lv, u, B, L) {
  const r = u.rects[0];
  const y0 = lv.elev, h = 4.0;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  const brand = u.brand;
  // 玻璃墙与框架
  B.get('glass').box(cx, y0 + h / 2, r.z0, w, h, 0.05, 0xffffff);
  B.get('glass').box(r.x0, y0 + h / 2, cz, 0.05, h, d, 0xffffff);
  B.get('glass').box(r.x1, y0 + h / 2, cz, 0.05, h, d, 0xffffff);
  B.get('satin').box(cx, y0 + h / 2, r.z1, w, h, 0.25, '#e9e4da');
  for (let x = r.x0; x <= r.x1 + 0.01; x += w / 4) B.get('metal').box(x, y0 + h / 2, r.z0, 0.14, h, 0.14, COLORS.darkSteel);
  B.get('satin').box(cx, y0 + h + 0.2, cz + 0.3, w + 0.6, 0.4, d + 1.2, COLORS.darkSteel);
  B.get('satin').box(cx, y0 + h - 0.35, r.z0 - 0.08, w, 0.7, 0.12, brand.bg);
  const sw = Math.min(w * 0.7, 6.4);
  L.signs.place(cx, y0 + h - 0.35, r.z0 - 0.16, sw, sw / 4, 'N', ctx.atlas.RF.cell(u.id));
  // 背面（朝主街）也挂招牌
  B.get('satin').box(cx, y0 + h + 0.95, r.z1 + 0.35, sw + 0.3, sw / 4 + 0.25, 0.12, brand.bg);
  L.signs.place(cx, y0 + h + 0.95, r.z1 + 0.43, sw, sw / 4, 'S', ctx.atlas.RF.cell(u.id));
  B.get('metal').box(cx - sw / 3, y0 + h + 0.4, r.z1 + 0.3, 0.08, 0.6, 0.08, COLORS.darkSteel);
  B.get('metal').box(cx + sw / 3, y0 + h + 0.4, r.z1 + 0.3, 0.08, 0.6, 0.08, COLORS.darkSteel);
  // 光伏板
  for (let i = 0; i < 4; i++) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25);
    B.get('metal').shape('box', new THREE.Vector3(r.x0 + w * (i + 0.5) / 4, y0 + h + 0.7, cz), q, new THREE.Vector3(w / 4 - 0.3, 0.06, d - 1.5), '#1e2a44');
  }
  // 室内：吧台 + 桌椅
  B.get('satin').box(cx, y0 + 0.55, r.z1 - 1.2, w - 2, 1.1, 0.8, '#3b2a20');
  B.get('glow').box(cx, y0 + 2.2, r.z1 - 0.2, w - 2.5, 1.0, 0.06, brand.cat === 'bar' ? '#ffcf80' : '#fff1dc');
  for (let i = 0; i < 3; i++) tableSet(B, r.x0 + w * (i + 0.5) / 3, y0, cz - 0.5, 0, { chair: brand.bg, top: '#efe9df' }, 'satin');
  // 外摆
  const t = u.terrace;
  const ucol = ['#f4f1ea', brand.bg, '#e0567a', '#43b6cd'];
  let k = 0;
  for (let x = t.x0 + 2; x <= t.x1 - 2; x += 4) {
    for (const z of [t.z0 + 1.6, t.z1 - 1.8]) {
      tableSet(B, x, y0, z, 0, { chair: '#c9b38f', top: '#f4f1ea' }, 'satin');
      umbrella(B, x, y0, z, ucol[k++ % ucol.length], 1.5);
    }
  }
  // 串灯
  const poles = [[t.x0 + 0.3, t.z0 + 0.3], [t.x1 - 0.3, t.z0 + 0.3]];
  for (const [x, z] of poles) B.get('metal').cyl(x, y0, z, 0.06, 3.6, COLORS.darkSteel, 8);
  for (let s = 0; s < 3; s++) {
    const za = t.z0 + 0.3 + s * 0.01, zb = r.z0 - 0.1;
    const xa = t.x0 + 0.3 + s * ((t.x1 - t.x0 - 0.6) / 2);
    for (let i = 0; i <= 10; i++) {
      const tt = i / 10;
      const x = xa, z = za + (zb - za) * tt;
      const y = y0 + 3.6 - Math.sin(tt * Math.PI) * 0.7 + (tt > 0.9 ? 0.0 : 0);
      B.get('glow').sphere(x, y, z, 0.07, '#ffd58a', 0.07, 0.07, 'sphereLo');
    }
  }
}

/** 摩天轮「云澜之眼」：轮体缓慢旋转、轿厢保持竖直、夜间彩色灯光 */
function ferris(ctx, lv, L) {
  const f = lv.features.find((x) => x.type === 'ferris');
  const R = f.radius;
  const hubY = lv.elev + 0.8 + 2.75 + R;
  const hub = new THREE.Vector3(f.x, hubY, f.z);
  const B = L.batch;
  // 支架：两侧 A 字形
  for (const dz of [-3.6, 3.6]) {
    for (const dx of [-8.5, 8.5]) B.get('extMetal').bar({ x: f.x + dx, y: lv.elev, z: f.z + dz * 1.35 }, { x: f.x, y: hubY, z: f.z + dz * 0.55 }, 0.55, COLORS.white);
    B.get('extMetal').bar({ x: f.x - 6.3, y: lv.elev + 5, z: f.z + dz * 1.22 }, { x: f.x + 6.3, y: lv.elev + 5, z: f.z + dz * 1.22 }, 0.3, COLORS.white);
    B.get('satin').box(f.x - 8.5, lv.elev + 0.3, f.z + dz * 1.35, 1.6, 0.6, 1.6, COLORS.stoneDark);
    B.get('satin').box(f.x + 8.5, lv.elev + 0.3, f.z + dz * 1.35, 1.6, 0.6, 1.6, COLORS.stoneDark);
  }
  B.get('extMetal').shape('cyl24', new THREE.Vector3(f.x, hubY, f.z - 2.4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(2.0, 4.8, 2.0), '#d9dde0');
  // 登乘台 + 售票亭
  const p = lv.features.find((x) => x.type === 'ferris-platform').rect;
  B.get('satin').boxMinMax(p.x0, lv.elev, p.z0, p.x1, lv.elev + 0.6, p.z1, '#d8d2c6');
  for (let i = 0; i < 4; i++) B.get('satin').boxMinMax(p.x0 + 2, lv.elev + i * 0.15, p.z1 + 0.3 * (4 - i), p.x1 - 2, lv.elev + (i + 1) * 0.15, p.z1 + 0.3 * (5 - i), '#cfc8bb');
  B.get('glass').boxMinMax(p.x0, lv.elev + 0.6, p.z0, p.x0 + 0.05, lv.elev + 1.7, p.z1, 0xffffff);
  B.get('glass').boxMinMax(p.x1 - 0.05, lv.elev + 0.6, p.z0, p.x1, lv.elev + 1.7, p.z1, 0xffffff);
  B.get('satin').box(p.x1 + 2.2, lv.elev + 1.4, p.z1 - 1, 2.6, 2.8, 2.2, '#6a3fb5');
  B.get('glow').box(p.x1 + 2.2, lv.elev + 2.6, p.z1 + 0.12, 2.2, 0.5, 0.04, '#f5d0fe');
  for (let i = 0; i < 4; i++) B.get('extMetal').box(p.x1 + 1 + i * 0.01, lv.elev + 0.5, p.z1 + 2 + i * 1.2, 4, 0.05, 0.05, COLORS.steel);

  // 旋转体
  const rot = new THREE.Group();
  rot.position.copy(hub);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.35, metalness: 0.7 });
  const geos = [];
  const tube = (rad, z, t) => new THREE.TorusGeometry(rad, t, 6, 96).translate(0, 0, z);
  for (const z of [-1.3, 1.3]) { geos.push(tube(R, z, 0.2), tube(R - 1.6, z, 0.12)); }
  const N = f.gondolas;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    for (const z of [-1.3, 1.3]) {
      const spoke = new THREE.CylinderGeometry(0.06, 0.06, R, 4);
      spoke.translate(0, R / 2, 0);
      spoke.rotateZ(a - Math.PI / 2);
      spoke.translate(0, 0, z);
      geos.push(spoke);
    }
    const cross = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 4).rotateX(Math.PI / 2);
    cross.translate(Math.cos(a) * R, Math.sin(a) * R, 0);
    geos.push(cross);
  }
  for (const g of geos) {
    if (g.index) { const n = g.toNonIndexed(); g.copy(n); }
  }
  const merged = mergeGeos(geos);
  const wheel = new THREE.Mesh(merged, wheelMat);
  wheel.castShadow = false;
  rot.add(wheel);
  // 轮缘灯珠
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const ledGeo = new THREE.SphereGeometry(0.16, 6, 4);
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, 192);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 192; i++) {
    const a = (i / 96) * Math.PI * 2;
    const z = i < 96 ? 1.55 : -1.55;
    m4.makeTranslation(Math.cos(a) * R, Math.sin(a) * R, z);
    leds.setMatrixAt(i, m4);
  }
  rot.add(leds);
  L.base.add(rot);

  // 轿厢（实例化，始终竖直）
  const cab = gondolaGeometry();
  const cabMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3 });
  const cabs = new THREE.InstancedMesh(cab, cabMat, N);
  const hues = [0.0, 0.08, 0.15, 0.33, 0.5, 0.58, 0.72, 0.85];
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) cabs.setColorAt(i, c.setHSL(hues[i % hues.length], 0.65, 0.58));
  cabs.instanceColor.needsUpdate = true;
  L.base.add(cabs);
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const period = 150;
  ctx.ferris = { rot, hub };
  ctx.dynamic.push({
    update(dt, time) {
      const th = (time / period) * Math.PI * 2;
      rot.rotation.z = th;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 + th;
        pos.set(hub.x + Math.cos(a) * R, hub.y + Math.sin(a) * R - 1.7, hub.z);
        m4.compose(pos, q, one);
        cabs.setMatrixAt(i, m4);
      }
      cabs.instanceMatrix.needsUpdate = true;
      const night = ctx.mats.night;
      if (night > 0.02) ledMat.color.setHSL((time * 0.05) % 1, 0.85, 0.45 + 0.25 * night).multiplyScalar(1 + night);
      else ledMat.color.setRGB(0.92, 0.94, 0.96);
    },
  });
}

function gondolaGeometry() {
  const parts = [];
  const add = (g, color, y) => {
    g.translate(0, y, 0);
    const n = g.index ? g.toNonIndexed() : g;
    const col = new Float32Array(n.attributes.position.count * 3);
    const cc = new THREE.Color(color);
    for (let i = 0; i < col.length; i += 3) { col[i] = cc.r; col[i + 1] = cc.g; col[i + 2] = cc.b; }
    n.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(n);
  };
  add(new THREE.CylinderGeometry(1.0, 0.9, 0.3, 12), '#ffffff', -0.9);
  add(new THREE.CylinderGeometry(1.02, 1.02, 1.2, 12, 1, true), '#bcd3de', -0.15);
  add(new THREE.SphereGeometry(1.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', 0.45);
  add(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 4), '#9aa0a6', 1.2);
  return mergeGeos(parts);
}

function mergeGeos(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  const hasColor = list.every((g) => g.attributes.color);
  const col = hasColor ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (col) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** 天空之镜：石边水池 + 镜面水面 + 汀步 */
function mirror(B, r, y0) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  B.get('satin').box(cx, y0 + 0.2, r.z0, w + 0.6, 0.4, 0.3, COLORS.stone);
  B.get('satin').box(cx, y0 + 0.2, r.z1, w + 0.6, 0.4, 0.3, COLORS.stone);
  B.get('satin').box(r.x0, y0 + 0.2, cz, 0.3, 0.4, d, COLORS.stone);
  B.get('satin').box(r.x1, y0 + 0.2, cz, 0.3, 0.4, d, COLORS.stone);
  B.get('mirror').box(cx, y0 + 0.16, cz, w - 0.1, 0.04, d - 0.1, '#ffffff');
  for (let i = 0; i < 9; i++) B.get('satin').cyl(r.x0 + 2.5 + i * 2.4, y0 + 0.05, cz + Math.sin(i * 1.3) * 1.2, 0.55, 0.22, '#e9e4da', 16);
}

/** 玻璃悬挑观景台 */
function skywalk(B, r, y0) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  B.get('glass').box(cx, y0 + 0.02, cz + 1, w, 0.06, d - 2, 0xffffff);
  for (const x of [r.x0, r.x1]) B.get('metal').box(x, y0 - 0.2, cz + 1, 0.25, 0.4, d - 2, COLORS.darkSteel);
  for (let z = 40.5; z <= r.z1; z += 1.8) B.get('metal').box(cx, y0 - 0.2, z, w, 0.3, 0.12, COLORS.darkSteel);
  B.get('glass').box(r.x0, y0 + 0.65, cz + 1, 0.04, 1.2, d - 2, 0xffffff);
  B.get('glass').box(r.x1, y0 + 0.65, cz + 1, 0.04, 1.2, d - 2, 0xffffff);
  B.get('glass').box(cx, y0 + 0.65, r.z1, w, 1.2, 0.04, 0xffffff);
  B.get('metal').box(cx, y0 + 1.27, r.z1, w, 0.06, 0.08, COLORS.steel);
  B.get('glow').box(cx, y0 + 0.05, r.z1 - 0.1, w, 0.04, 0.06, COLORS.led);
}

/** 「云澜汇」立体字：把文字栅格化后逐行合并为盒子 */
function letters(B, f, y0) {
  const W = 132, H = 44, vox = 0.1;
  const img = textMask(f.text, `900 40px ${FONT_CN}`, W, H);
  // 面朝南（主街方向）：观看者面向北时左手为 -x，所以文字从 -x 向 +x 排列
  const x0 = f.x - (W * vox) / 2;
  for (let j = 0; j < H; j++) {
    let run = -1;
    for (let i = 0; i <= W; i++) {
      const on = i < W && img.data[(j * W + i) * 4] > 120;
      if (on && run < 0) run = i;
      if (!on && run >= 0) {
        const a = run, b = i;
        const xa = x0 + a * vox, xb = x0 + b * vox;
        B.get('extSatin').box((xa + xb) / 2, y0 + 0.6 + (H - j) * vox, f.z, Math.abs(xb - xa), vox, 0.7, '#ffffff');
        run = -1;
      }
    }
  }
  B.get('satin').box(f.x, y0 + 0.3, f.z, W * vox + 1, 0.6, 1.6, '#0f6f86');
  B.get('glow').box(f.x, y0 + 0.62, f.z + 0.81, W * vox + 1, 0.05, 0.03, COLORS.led);
}

/** 花艺拱门 */
function arch(B, f, y0) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  B.get('satin').shape('halfTorus', new THREE.Vector3(f.x, y0 + 0.2, f.z), q, new THREE.Vector3(4.6, 6.4, 3.0), '#f4f1ea');
  const rand = rng(8);
  const cols = ['#f7a8c2', '#ffffff', '#f2b134', '#e85d75', '#c084fc'];
  for (let i = 0; i < 46; i++) {
    const a = (i / 45) * Math.PI;
    const x = f.x + (rand() - 0.5) * 0.5;
    const y = y0 + 0.2 + Math.sin(a) * 3.2;
    const z = f.z + Math.cos(a) * 2.3;
    B.get('foliage').sphere(x, y, z, 0.28 + rand() * 0.12, i % 3 === 0 ? '#5e9a44' : cols[Math.floor(rand() * cols.length)], undefined, undefined, 'ico0');
  }
}

/** 天台儿童乐园 */
function playground(ctx, B, L, r, y0) {
  const rub = ctx.mats.floor('rubber', 0.9);
  const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, rub);
  m.position.set((r.x0 + r.x1) / 2, y0 + 0.04, (r.z0 + r.z1) / 2);
  m.receiveShadow = true;
  L.base.add(m);
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  B.get('satin').box(cx - 3, y0 + 1.2, cz, 2.4, 2.4, 2.4, '#4dabf7');
  B.get('satin').box(cx - 3, y0 + 2.6, cz, 2.8, 0.4, 2.8, '#ffd23f');
  B.get('satin').bar({ x: cx - 1.8, y: y0 + 2.4, z: cz }, { x: cx + 2.4, y: y0 + 0.3, z: cz }, 0.9, '#ff6b6b');
  for (const dz of [-2.5, 2.5]) B.get('metal').bar({ x: cx + 3.6, y: y0, z: cz + dz }, { x: cx + 3.6, y: y0 + 2.6, z: cz + dz * 0.6 }, 0.12, '#69db7c');
  B.get('metal').box(cx + 3.6, y0 + 2.6, cz, 0.15, 0.15, 3.2, '#69db7c');
  for (const dz of [-0.8, 0.8]) B.get('satin').box(cx + 3.6, y0 + 0.6, cz + dz, 0.5, 0.06, 0.4, '#b197fc');
}

/** 花架长廊 */
function pergola(B, r, y0) {
  const h = 3.0;
  for (let x = r.x0; x <= r.x1 + 0.01; x += 3.5) {
    for (const z of [r.z0, r.z1]) B.get('satin').box(x, y0 + h / 2, z, 0.25, h, 0.25, COLORS.wood);
    B.get('satin').box(x, y0 + h + 0.1, (r.z0 + r.z1) / 2, 0.2, 0.25, r.z1 - r.z0 + 1, COLORS.wood);
  }
  for (const z of [r.z0, r.z1]) B.get('satin').box((r.x0 + r.x1) / 2, y0 + h - 0.05, z, r.x1 - r.x0 + 0.6, 0.2, 0.2, COLORS.darkWood);
  const rand = rng(41);
  for (let i = 0; i < 70; i++) {
    const x = r.x0 + rand() * (r.x1 - r.x0), z = r.z0 + rand() * (r.z1 - r.z0);
    B.get('foliage').sphere(x, y0 + h + 0.35, z, 0.5 + rand() * 0.3, rand() < 0.2 ? '#c084fc' : '#4f8a3a', 0.3, 0.5, 'ico0');
  }
}

/** 设备区：百叶围挡 + 冷却塔 + 空调机组 */
function mech(B, r, y0) {
  const h = 3.2;
  for (let x = r.x0; x <= r.x1; x += 0.6) {
    B.get('satin').box(x, y0 + h / 2, r.z1, 0.12, h, 0.4, '#8d949b');
    B.get('satin').box(x, y0 + h / 2, r.z0, 0.12, h, 0.4, '#8d949b');
  }
  for (let z = r.z0; z <= r.z1; z += 0.6) B.get('satin').box(r.x0, y0 + h / 2, z, 0.4, h, 0.12, '#8d949b');
  for (const x of [r.x0 + 3.5, r.x0 + 8.5]) {
    B.get('metal').cyl(x, y0, (r.z0 + r.z1) / 2, 2.0, 3.0, '#c3c9cf', 16);
    B.get('metal').cyl(x, y0 + 3.0, (r.z0 + r.z1) / 2, 1.3, 0.5, '#4a5056', 16);
  }
  for (let i = 0; i < 3; i++) B.get('metal').box(r.x0 + 13 + i * 1.6, y0 + 1.0, (r.z0 + r.z1) / 2, 1.2, 2.0, 5, '#b8bfc6');
  B.get('metal').box((r.x0 + r.x1) / 2, y0 + 2.4, r.z0 + 1.5, r.x1 - r.x0 - 2, 0.3, 0.3, '#7d848b');
}
