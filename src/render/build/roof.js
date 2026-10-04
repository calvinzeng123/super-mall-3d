// 天台（数据驱动，要素在各自翼楼的局部坐标系内）：草坪、树木、花境、扶梯玻璃亭、电梯厅门斗、餐吧（玻璃亭 + 外摆 + 串灯）、
// 摩天轮「云澜之眼」、IP「云宝」、天空之镜、玻璃悬挑观景台、立体字、花艺拱门、儿童乐园、花架、设备区。
import * as THREE from 'three';
import { rng, textMask, FONT_CN } from '../textures.js';
import { addTrees, planter, bench, ipMascot, umbrella, tableSet, bollard } from './props.js';
import { COLORS } from '../theme.js';
import { frame, toW, rect } from '../../layout/geom.js';

export function buildRoof(ctx) {
  for (const lv of ctx.layout.levels.filter((l) => l.kind === 'roof')) {
    const L = ctx.levels[lv.id];
    const B = L.batch;
    const y0 = lv.elev;
    const feat = (t) => lv.features.filter((f) => f.type === t);
    const b = ctx.bById[lv.building];

    // 草坪
    const grass = ctx.mats.floor('grass', 0.95);
    for (const f of feat('lawn')) {
      const r = f.rect;
      const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (r.x0 + uv.getX(i) * (r.x1 - r.x0)) / 6, (r.z0 + (1 - uv.getY(i)) * (r.z1 - r.z0)) / 6);
      const m = new THREE.Mesh(g, grass);
      const [x, z] = toW(f.frame, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      m.position.set(x, y0 + 0.12, z);
      m.rotation.y = -f.frame.a;
      m.receiveShadow = true;
      L.base.add(m);
      B.frame(f.frame, () => B.get('satin').boxMinMax(r.x0 - 0.2, y0, r.z0 - 0.2, r.x1 + 0.2, y0 + 0.1, r.z1 + 0.2, COLORS.stoneDark));
    }
    // 树（带圆形树池）
    const trees = feat('tree').map((t) => {
      const [x, z] = toW(t.frame, t.lu, t.lv);
      return { x, y: y0 + 0.5, z, s: 0.85 + ((Math.abs(t.lu * 7 + t.lv * 3)) % 5) * 0.06 };
    });
    for (const t of trees) B.get('satin').cyl(t.x, y0, t.z, 1.1, 0.5, COLORS.stoneDark, 16);
    addTrees(L.base, ctx.mats, trees, 33 + lv.id.length);

    for (const f of feat('pavilion')) B.frame(f.frame, () => pavilion(B, f.rect, y0));
    penthouseLobbies(ctx, b, lv, B);
    for (const u of lv.units.filter((x) => x.style === 'bar')) restaurant(ctx, lv, u, B, L);
    for (const f of feat('ferris')) ferris(ctx, lv, L, f);
    for (const f of feat('ip')) B.frame(f.frame, () => ipMascot(B, f.lu, y0, f.lv, f.scale || 1.2, -Math.PI / 4));
    for (const f of feat('mirror')) B.frame(f.frame, () => mirror(B, f.rect, y0));
    for (const f of feat('skywalk')) B.frame(f.frame, () => skywalk(B, f.rect, y0));
    for (const f of feat('letters')) {
      const [x, z] = toW(f.frame, f.lu, f.lv);
      B.frame(frame(x, z, f.frame.deg - 90), () => letters(B, f.text, y0));
    }
    for (const f of feat('arch')) B.frame(f.frame, () => arch(B, f.lu, f.lv, y0));
    for (const f of feat('playground')) playground(ctx, B, L, f, y0);
    for (const f of feat('pergola')) B.frame(f.frame, () => pergola(B, f.rect, y0));
    for (const m of lv.rooms.filter((r) => r.type === 'mech')) B.frame(m.frame, () => mech(B, m.rects[0], y0));
    for (const f of feat('track')) track(ctx, L, f, y0);
    for (const f of feat('court')) B.frame(f.frame, () => court(B, f.rect, y0));

    // 每个翼楼屋面：沿两侧边缘的花境与长椅、庭院灯
    for (const w of b.wings) {
      const u1 = w.link ? w.len - w.ua : w.uEnd;
      B.frame(w.F, () => {
        for (let u = w.u0 + 2; u < u1 - 6; u += 9) {
          for (const v of [-21.2, 21.2]) bollard(B, u, v, y0);
        }
      });
    }
  }
}

/** 扶梯玻璃亭（屋顶绿化），开口在 +u 端（扶梯出口） */
function pavilion(B, r, y0) {
  const h = 4.4;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  for (const [x, z, sx, sz, gap] of [[cx, r.z0, r.x1 - r.x0, 0.05, false], [cx, r.z1, r.x1 - r.x0, 0.05, false], [r.x0, cz, 0.05, r.z1 - r.z0, false], [r.x1, cz, 0.05, r.z1 - r.z0, true]]) {
    if (gap) {
      B.get('glass').box(x, y0 + h / 2, r.z0 + 1.75, sx, h, 3.5, 0xffffff);
      B.get('glass').box(x, y0 + h / 2, r.z1 - 1.75, sx, h, 3.5, 0xffffff);
      B.get('glass').box(x, y0 + 3.4, cz, sx, 2.0, r.z1 - r.z0 - 7, 0xffffff);
    } else B.get('glass').box(x, y0 + h / 2, z, sx, h, sz, 0xffffff);
  }
  for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1], [cx, r.z0], [cx, r.z1]]) B.get('metal').box(x, y0 + h / 2, z, 0.22, h, 0.22, COLORS.white);
  B.get('satin').box(cx, y0 + h + 0.15, cz, r.x1 - r.x0 + 0.8, 0.3, r.z1 - r.z0 + 0.8, COLORS.white);
  B.get('foliage').box(cx, y0 + h + 0.36, cz, r.x1 - r.x0 - 0.2, 0.14, r.z1 - r.z0 - 0.2, '#6b9b45');
  for (let k = 0; k < 10; k++) B.get('foliage').sphere(r.x0 + 1.2 + k * ((r.x1 - r.x0 - 2.4) / 9), y0 + h + 0.55, cz + (k % 2 ? 2.4 : -2.4), 0.5, k % 3 ? '#4f8a3a' : '#e86f8c', 0.4, 0.5, 'ico0');
  B.get('glow').box(r.x1 + 0.05, y0 + h - 0.2, cz, 0.08, 0.08, r.z1 - r.z0, COLORS.led);
}

/** 电梯出屋面的玻璃门斗（每个核心筒一组，在电梯门前） */
function penthouseLobbies(ctx, b, lv, B) {
  const y0 = lv.elev;
  for (const w of b.wings) {
    if (!w.core) continue;
    const s = w.core.band, c = w.core.u;
    const v0 = s * 7, v1 = s * 3.6;
    const h = 4.2;
    B.frame(w.F, () => {
      const cu = c + 2.8;
      B.get('glass').box(cu, y0 + h / 2, v1, 6.4, h, 0.05, 0xffffff);
      for (const u of [c - 0.4, c + 6]) B.get('glass').box(u, y0 + h / 2, (v0 + v1) / 2, 0.05, h, Math.abs(v0 - v1), 0xffffff);
      B.get('satin').box(cu, y0 + h + 0.12, (v0 + v1) / 2, 7.0, 0.24, Math.abs(v0 - v1) + 0.4, COLORS.white);
      B.get('glow').box(cu, y0 + h - 0.15, v1 - s * 0.05, 6.2, 0.08, 0.06, COLORS.led);
    });
  }
}

/** 天台餐吧：玻璃亭 + 屋面光伏 + 门头招牌 + 外摆 + 串灯（在"门面朝 −z"的局部坐标系内绘制） */
function restaurant(ctx, lv, u, B, L) {
  const r0 = u.rects[0];
  const front = u.fronts[0];
  const flip = front.side === 'S';
  const cu = (r0.x0 + r0.x1) / 2;
  // −v 侧的餐吧：绕自身中线旋转 180°，使门面同样朝局部 −z
  const [ox, oz] = toW(u.frame, cu, 0);
  const F = flip ? frame(ox, oz, u.frame.deg + 180) : u.frame;
  const map = (rr) => (flip ? rect(-(rr.x1 - cu), -rr.z1, -(rr.x0 - cu), -rr.z0) : rr);
  const r = map(r0), t = map(u.terrace);
  const y0 = lv.elev, h = 4.0;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  const brand = u.brand;
  const cell = ctx.atlas[lv.id].cell(u.id);
  B.frame(F, () => L.signs.frame(F, () => {
    B.get('glass').box(cx, y0 + h / 2, r.z0, w, h, 0.05, 0xffffff);
    B.get('glass').box(r.x0, y0 + h / 2, cz, 0.05, h, d, 0xffffff);
    B.get('glass').box(r.x1, y0 + h / 2, cz, 0.05, h, d, 0xffffff);
    B.get('satin').box(cx, y0 + h / 2, r.z1, w, h, 0.25, '#e9e4da');
    for (let x = r.x0; x <= r.x1 + 0.01; x += w / 4) B.get('metal').box(x, y0 + h / 2, r.z0, 0.14, h, 0.14, COLORS.darkSteel);
    B.get('satin').box(cx, y0 + h + 0.2, cz + 0.3, w + 0.6, 0.4, d + 1.2, COLORS.darkSteel);
    B.get('satin').box(cx, y0 + h - 0.35, r.z0 - 0.08, w, 0.7, 0.12, brand.bg);
    const sw = Math.min(w * 0.7, 6.4);
    L.signs.place(cx, y0 + h - 0.35, r.z0 - 0.16, sw, sw / 4, 'N', cell);
    B.get('satin').box(cx, y0 + h + 0.95, r.z1 + 0.35, sw + 0.3, sw / 4 + 0.25, 0.12, brand.bg);
    L.signs.place(cx, y0 + h + 0.95, r.z1 + 0.43, sw, sw / 4, 'S', cell);
    for (const k of [-1, 1]) B.get('metal').box(cx + (k * sw) / 3, y0 + h + 0.4, r.z1 + 0.3, 0.08, 0.6, 0.08, COLORS.darkSteel);
    for (let i = 0; i < 4; i++) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25);
      B.get('metal').shape('box', new THREE.Vector3(r.x0 + (w * (i + 0.5)) / 4, y0 + h + 0.7, cz), q, new THREE.Vector3(w / 4 - 0.3, 0.06, d - 1.5), '#1e2a44');
    }
    B.get('satin').box(cx, y0 + 0.55, r.z1 - 1.2, w - 2, 1.1, 0.8, '#3b2a20');
    B.get('glow').box(cx, y0 + 2.2, r.z1 - 0.2, w - 2.5, 1.0, 0.06, brand.cat === 'bar' ? '#ffcf80' : '#fff1dc');
    for (let i = 0; i < 3; i++) tableSet(B, r.x0 + (w * (i + 0.5)) / 3, y0, cz - 0.5, 0, { chair: brand.bg, top: '#efe9df' }, 'satin');
    const ucol = ['#f4f1ea', brand.bg, '#e0567a', '#43b6cd'];
    let k = 0;
    for (let x = t.x0 + 2; x <= t.x1 - 2; x += 4) {
      for (const z of [t.z0 + 1.6, t.z1 - 1.8]) {
        tableSet(B, x, y0, z, 0, { chair: '#c9b38f', top: '#f4f1ea' }, 'satin');
        umbrella(B, x, y0, z, ucol[k++ % ucol.length], 1.5);
      }
    }
    for (const [x, z] of [[t.x0 + 0.3, t.z0 + 0.3], [t.x1 - 0.3, t.z0 + 0.3]]) B.get('metal').cyl(x, y0, z, 0.06, 3.6, COLORS.darkSteel, 8);
    for (let s = 0; s < 3; s++) {
      const za = t.z0 + 0.3, zb = r.z0 - 0.1;
      const xa = t.x0 + 0.3 + s * ((t.x1 - t.x0 - 0.6) / 2);
      for (let i = 0; i <= 10; i++) {
        const tt = i / 10;
        B.get('glow').sphere(xa, y0 + 3.6 - Math.sin(tt * Math.PI) * 0.7, za + (zb - za) * tt, 0.07, '#ffd58a', 0.07, 0.07, 'sphereLo');
      }
    }
  }));
}

/** 摩天轮「云澜之眼」：轮体缓慢旋转、轿厢保持竖直、夜间彩色灯光 */
function ferris(ctx, lv, L, f) {
  const R = f.radius;
  const hubY = lv.elev + 0.8 + 2.75 + R;
  const B = L.batch;
  B.setFrame(f.frame);
  f = { ...f, x: f.lu, z: f.lv };
  const hub = new THREE.Vector3(f.x, hubY, f.z);
  // 支架：两侧 A 字形
  for (const dz of [-3.6, 3.6]) {
    for (const dx of [-8.5, 8.5]) B.get('extMetal').bar({ x: f.x + dx, y: lv.elev, z: f.z + dz * 1.35 }, { x: f.x, y: hubY, z: f.z + dz * 0.55 }, 0.55, COLORS.white);
    B.get('extMetal').bar({ x: f.x - 6.3, y: lv.elev + 5, z: f.z + dz * 1.22 }, { x: f.x + 6.3, y: lv.elev + 5, z: f.z + dz * 1.22 }, 0.3, COLORS.white);
    B.get('satin').box(f.x - 8.5, lv.elev + 0.3, f.z + dz * 1.35, 1.6, 0.6, 1.6, COLORS.stoneDark);
    B.get('satin').box(f.x + 8.5, lv.elev + 0.3, f.z + dz * 1.35, 1.6, 0.6, 1.6, COLORS.stoneDark);
  }
  B.get('extMetal').shape('cyl24', new THREE.Vector3(f.x, hubY, f.z - 2.4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(2.0, 4.8, 2.0), '#d9dde0');
  // 登乘台 + 售票亭
  const p = (lv.features.find((x) => x.type === 'ferris-platform') || { rect: rect(f.x - 4, f.z - 3, f.x + 4, f.z + 3) }).rect;
  B.get('satin').boxMinMax(p.x0, lv.elev, p.z0, p.x1, lv.elev + 0.6, p.z1, '#d8d2c6');
  for (let i = 0; i < 4; i++) B.get('satin').boxMinMax(p.x0 + 2, lv.elev + i * 0.15, p.z1 + 0.3 * (4 - i), p.x1 - 2, lv.elev + (i + 1) * 0.15, p.z1 + 0.3 * (5 - i), '#cfc8bb');
  B.get('glass').boxMinMax(p.x0, lv.elev + 0.6, p.z0, p.x0 + 0.05, lv.elev + 1.7, p.z1, 0xffffff);
  B.get('glass').boxMinMax(p.x1 - 0.05, lv.elev + 0.6, p.z0, p.x1, lv.elev + 1.7, p.z1, 0xffffff);
  B.get('satin').box(p.x1 + 2.2, lv.elev + 1.4, p.z1 - 1, 2.6, 2.8, 2.2, '#6a3fb5');
  B.get('glow').box(p.x1 + 2.2, lv.elev + 2.6, p.z1 + 0.12, 2.2, 0.5, 0.04, '#f5d0fe');
  for (let i = 0; i < 4; i++) B.get('extMetal').box(p.x1 + 1 + i * 0.01, lv.elev + 0.5, p.z1 + 2 + i * 1.2, 4, 0.05, 0.05, COLORS.steel);

  B.setFrame(null);
  // 局部坐标系的父节点：轮体与轿厢都在其中
  const holder = new THREE.Group();
  const [hx, hz] = toW(f.frame, 0, 0);
  holder.position.set(hx, 0, hz);
  holder.rotation.y = -f.frame.a;
  L.base.add(holder);
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
  holder.add(rot);

  // 轿厢（实例化，始终竖直）
  const cab = gondolaGeometry();
  const cabMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3 });
  const cabs = new THREE.InstancedMesh(cab, cabMat, N);
  const hues = [0.0, 0.08, 0.15, 0.33, 0.5, 0.58, 0.72, 0.85];
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) cabs.setColorAt(i, c.setHSL(hues[i % hues.length], 0.65, 0.58));
  cabs.instanceColor.needsUpdate = true;
  cabs.frustumCulled = false;
  leds.frustumCulled = false;
  holder.add(cabs);
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const period = 150;
  ctx.ferris = { rot, hub, holder };
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

/** 玻璃悬挑观景台：沿 +u 悬挑出外墙 */
function skywalk(B, r, y0) {
  const cz = (r.z0 + r.z1) / 2, d = r.z1 - r.z0;
  B.get('glass').box((r.x0 - 0.5 + r.x1) / 2, y0 + 0.02, cz, r.x1 - r.x0 + 0.5, 0.06, d, 0xffffff);
  for (const z of [r.z0, r.z1]) B.get('metal').box((r.x0 + r.x1) / 2, y0 - 0.2, z, r.x1 - r.x0, 0.4, 0.25, COLORS.darkSteel);
  for (let x = r.x0 + 0.5; x <= r.x1; x += 1.8) B.get('metal').box(x, y0 - 0.2, cz, 0.12, 0.3, d, COLORS.darkSteel);
  for (const z of [r.z0, r.z1]) B.get('glass').box((r.x0 + r.x1) / 2, y0 + 0.65, z, r.x1 - r.x0, 1.2, 0.04, 0xffffff);
  B.get('glass').box(r.x1, y0 + 0.65, cz, 0.04, 1.2, d, 0xffffff);
  B.get('metal').box(r.x1, y0 + 1.27, cz, 0.08, 0.06, d, COLORS.steel);
  B.get('glow').box(r.x1 - 0.1, y0 + 0.05, cz, 0.06, 0.04, d, COLORS.led);
}

/** 「云澜汇」立体字：把文字栅格化后逐行合并为盒子 */
function letters(B, text, y0) {
  const W = 132, H = 44, vox = 0.1;
  const img = textMask(text, `900 40px ${FONT_CN}`, W, H);
  const f = { x: 0, z: 0 };
  // 面朝局部 +z：观看者面向 −z 时右手为 +x，所以文字从 −x 向 +x 排列
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
function arch(B, lu, lv, y0) {
  const f = { x: lu, z: lv };
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
function playground(ctx, B, L, f, y0) {
  const r = f.rect;
  const rub = ctx.mats.floor('rubber', 0.9);
  const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, rub);
  const [mx, mz] = toW(f.frame, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
  m.position.set(mx, y0 + 0.04, mz);
  m.rotation.y = -f.frame.a;
  m.receiveShadow = true;
  L.base.add(m);
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  B.setFrame(f.frame);
  B.get('satin').box(cx - 3, y0 + 1.2, cz, 2.4, 2.4, 2.4, '#4dabf7');
  B.get('satin').box(cx - 3, y0 + 2.6, cz, 2.8, 0.4, 2.8, '#ffd23f');
  B.get('satin').bar({ x: cx - 1.8, y: y0 + 2.4, z: cz }, { x: cx + 2.4, y: y0 + 0.3, z: cz }, 0.9, '#ff6b6b');
  for (const dz of [-2.5, 2.5]) B.get('metal').bar({ x: cx + 3.6, y: y0, z: cz + dz }, { x: cx + 3.6, y: y0 + 2.6, z: cz + dz * 0.6 }, 0.12, '#69db7c');
  B.get('metal').box(cx + 3.6, y0 + 2.6, cz, 0.15, 0.15, 3.2, '#69db7c');
  for (const dz of [-0.8, 0.8]) B.get('satin').box(cx + 3.6, y0 + 0.6, cz + dz, 0.5, 0.06, 0.4, '#b197fc');
  B.setFrame(null);
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

/** 闭合折线的带状网格：法线方向上 [a,b] 的偏移带（斜接角处按折角放大，最多 2.5 倍） */
function closedRibbon(pts, a, b, y) {
  const n = pts.length;
  const pos = [], uv = [], idx = [];
  let dist = 0;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
    if (i > 0) dist += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const e1 = [p[0] - prev[0], p[1] - prev[1]], e2 = [next[0] - p[0], next[1] - p[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2];
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const k = Math.min(2.5, 1 / Math.max(0.4, mx * n1[0] + mz * n1[1]));
    for (const o of [a, b]) {
      pos.push(p[0] + mx * k * o, y, p[1] + mz * k * o);
      uv.push(dist, o);
    }
  }
  for (let i = 0; i < n; i++) {
    const j = i * 2;
    idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 天空跑道：红色塑胶带 + 白色分道线（沿建筑形状的闭合环线） */
function track(ctx, L, f, y0) {
  const hw = f.width / 2;
  const rubber = new THREE.MeshStandardMaterial({ color: 0xc8452c, roughness: 0.9, side: THREE.DoubleSide });
  ctx.mats.onNight((t) => rubber.emissive.setRGB(t * 0.12, t * 0.04, t * 0.02));
  const band = new THREE.Mesh(closedRibbon(f.path, -hw, hw, y0 + 0.06), rubber);
  band.receiveShadow = true;
  L.base.add(band);
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6, side: THREE.DoubleSide });
  for (const o of [-hw + 0.05, -hw / 3, hw / 3, hw - 0.05]) L.base.add(new THREE.Mesh(closedRibbon(f.path, o - 0.05, o + 0.05, y0 + 0.07), white));
  const glow = new THREE.Mesh(closedRibbon(f.path, hw + 0.1, hw + 0.2, y0 + 0.08), ctx.mats.base.glow);
  L.base.add(glow);
}

/** 屋顶篮球场：场地、标线、篮架、围网、灯杆（局部坐标，沿 u 为长边） */
function court(B, r, y0) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  B.get('satin').box(cx, y0 + 0.03, cz, w + 4, 0.05, d + 4, '#2f6b4f');
  B.get('satin').box(cx, y0 + 0.06, cz, w, 0.02, d, '#2f6fb0');
  const line = (x, z, sx, sz) => B.get('matte').box(x, y0 + 0.075, z, sx, 0.01, sz, '#f4f4f0');
  line(cx, r.z0, w, 0.08); line(cx, r.z1, w, 0.08); line(r.x0, cz, 0.08, d); line(r.x1, cz, 0.08, d); line(cx, cz, 0.08, d);
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  B.get('matte').shape('torus', new THREE.Vector3(cx, y0 + 0.08, cz), flat, new THREE.Vector3(3.6, 3.6, 0.6), '#f4f4f0');
  for (const k of [-1, 1]) {
    const ex = k < 0 ? r.x0 : r.x1;
    B.get('satin').box(ex - k * 2.9, y0 + 0.07, cz, 5.8, 0.01, 4.9, '#d9482b');
    const arc = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, k < 0 ? -Math.PI / 2 : Math.PI / 2));
    B.get('matte').shape('halfTorus', new THREE.Vector3(ex - k * 1.6, y0 + 0.08, cz), arc, new THREE.Vector3(13.5, 13.5, 0.6), '#f4f4f0');
    // 篮架
    B.get('metal').box(ex + k * 0.8, y0 + 1.6, cz, 0.18, 3.2, 0.18, '#2b2f33');
    B.get('metal').box(ex - k * 0.2, y0 + 3.1, cz, 1.6, 0.1, 0.1, '#2b2f33');
    B.get('glass').box(ex - k * 1.05, y0 + 3.4, cz, 0.05, 1.05, 1.8, 0xffffff);
    B.get('satin').box(ex - k * 1.08, y0 + 3.4, cz, 0.03, 1.05, 0.06, '#f4f4f0');
    B.get('metal').shape('torus', new THREE.Vector3(ex - k * 1.35, y0 + 3.05, cz), flat, new THREE.Vector3(0.9, 0.9, 1.2), '#e8590c');
  }
  // 围网与灯杆
  const fx0 = r.x0 - 2, fx1 = r.x1 + 2, fz0 = r.z0 - 2, fz1 = r.z1 + 2;
  for (const [x0, z0, x1, z1] of [[fx0, fz0, fx1, fz0], [fx0, fz1, fx1, fz1], [fx0, fz0, fx0, fz1], [fx1, fz0, fx1, fz1]]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const horiz = Math.abs(z1 - z0) < 0.01;
    B.get('glass').box((x0 + x1) / 2, y0 + 2.0, (z0 + z1) / 2, horiz ? len : 0.04, 3.6, horiz ? 0.04 : len, 0xffffff);
    for (let t = 0; t <= len; t += 3) B.get('metal').box(horiz ? x0 + t : x0, y0 + 2.0, horiz ? z0 : z0 + t, 0.08, 4.0, 0.08, '#3b4046');
    B.get('metal').box((x0 + x1) / 2, y0 + 3.85, (z0 + z1) / 2, horiz ? len : 0.08, 0.08, horiz ? 0.08 : len, '#3b4046');
  }
  for (const [x, z] of [[fx0, fz0], [fx1, fz0], [fx0, fz1], [fx1, fz1]]) {
    B.get('metal').cyl(x, y0, z, 0.12, 7, '#3b4046', 8);
    B.get('glow').box(x, y0 + 7.0, z, 1.0, 0.25, 0.5, '#ffe9bf');
  }
}
