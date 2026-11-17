// 停车层：车道漆面、车位线、充电位/无障碍位、挡车器、分区色柱、停放车辆（实例化）、
// 车道中线与方向箭头、步行脊、吊挂指示牌、地面坡道与层间坡道。全部按各自的局部坐标系生成。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, labelTexture } from '../textures.js';
import { themeOf } from '../theme.js';
import { clearHeight, flatShapeGeometry } from './shell.js';
import { frame, rect, lrectPoly, toW, toL, IDENTITY, convexOverlap, polyBounds, pointInPoly as pointInPolyLocal } from '../../layout/geom.js';
import { buildSharedGarageDetails } from './shared-garages.js';
import { cutSurfaceShapes } from './surface-shapes.js';
import { detailFor } from '../pbr.js';

const CAR_COLORS = ['#f2f2f0', '#c9ccd0', '#1f2328', '#6b7178', '#2f5d9e', '#a8262b', '#d8cbb0', '#2f5f4a', '#f2f2f0', '#c9ccd0', '#1f2328'];

/** 合并的小汽车几何（车头朝 +z），车身为白色顶点色以便实例着色 */
export function carGeometry() {
  const parts = [];
  const add = (geo, color, x, y, z) => {
    geo.translate(x, y, z);
    const c = new THREE.Color(color);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(geo.index ? geo.toNonIndexed() : geo);
  };
  add(new THREE.BoxGeometry(1.8, 0.62, 4.4), '#ffffff', 0, 0.55, 0);
  add(new THREE.BoxGeometry(1.62, 0.52, 2.3), '#ffffff', 0, 1.1, -0.25);
  add(new THREE.BoxGeometry(1.64, 0.4, 2.2), '#26303a', 0, 1.08, -0.25);
  for (const [x, z] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.35], [0.82, -1.35]]) {
    const w = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
    w.rotateZ(Math.PI / 2);
    add(w, '#15181b', x, 0.34, z);
  }
  add(new THREE.BoxGeometry(1.5, 0.12, 0.04), '#fff6dc', 0, 0.68, 2.21);
  add(new THREE.BoxGeometry(1.5, 0.1, 0.04), '#c0392b', 0, 0.72, -2.21);
  const g = new THREE.BufferGeometry();
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    p.computeVertexNormals();
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const FACE_ROT = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
const BACK = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] };

/** Paint and markings use the same true holes as the supporting slab. */
export function parkingPaintCuts(lv, poly) {
  const b = polyBounds(poly);
  return [...new Set([...lv.voids.map(v => v.poly), ...lv.slab.pieces.flatMap(p => p.holes)])]
    .filter(p => {
      const q = polyBounds(p);
      return b.x0 < q.x1 && b.x1 > q.x0 && b.z0 < q.z1 && b.z1 > q.z0;
    });
}

/**
 * 这一层所有车道的世界多边形和走向（单位向量；不是矩形的车道没有走向）。画标线、天花梁时用它判断
 * 「这一点是不是落在别的车道里」。
 */
export function aisleLanes(lv) {
  return lv.walk.filter((w) => w.kind === 'aisle' && w.poly?.length >= 3).map((w, index) => {
    let axis = null;
    if (w.rect) {
      const r = w.rect, alongU = r.x1 - r.x0 > r.z1 - r.z0, F = w.frame || IDENTITY;
      const a = toW(F, r.x0, r.z0), b = alongU ? toW(F, r.x1, r.z0) : toW(F, r.x0, r.z1), n = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      axis = [(b[0] - a[0]) / n, (b[1] - a[1]) / n];
    }
    return { w, index, poly: w.poly, bb: polyBounds(w.poly), axis };
  });
}

/**
 * 车道 lane 上的点 p（世界坐标）要不要让给别的车道：落在一条交叉的车道里（路口）就让；
 * 落在一条同向的车道里（两条叠在一起）时，排在后面的让。clear：离别的车道不到这么远也算（箭头不要顶着路口画）。
 */
export function laneClash(lanes, lane, p, clear = 0) {
  if (!lane) return false;
  for (const o of lanes) {
    if (o === lane) continue;
    const b = o.bb;
    if (p[0] < b.x0 - clear || p[0] > b.x1 + clear || p[1] < b.z0 - clear || p[1] > b.z1 + clear) continue;
    const parallel = !!(o.axis && lane.axis && Math.abs(o.axis[0] * lane.axis[0] + o.axis[1] * lane.axis[1]) > 0.94);
    const inside = pointInPolyLocal(p, o.poly);
    if (parallel) { if (inside && o.index < lane.index) return true; continue; }
    if (inside) return true;
    if (clear > 0 && [[clear, 0], [-clear, 0], [0, clear], [0, -clear]].some(([dx, dz]) => pointInPolyLocal([p[0] + dx, p[1] + dz], o.poly))) return true;
  }
  return false;
}

export function buildParking(ctx) {
  const carGeo = carGeometry();
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45 });
  ctx.carGeo = carGeo;
  ctx.carMat = carMat;
  for (const lv of ctx.layout.levels.filter((l) => l.kind === 'parking')) {
    const L = ctx.levels[lv.id];
    const B = L.batch;
    const y0 = lv.elev;
    const H = clearHeight(lv);
    const band = themeOf(lv).band;
    const rand = rng(lv.id.length * 7 + Math.round(-lv.elev * 10));
    const P = lv.parking;
    const white = '#f1f1ee';
    const aisleCol = lv.theme.key === 'park-blue' ? '#79838f' : lv.theme.key === 'park-green' ? '#7b8880' : '#857f74';

    // 车道与步行脊漆面
    // 粗糙度和 base.floorPaint 一样：矩形车道走合批（floorPaint），带洞的车道走这张材质，两种叠在一起不能一块深一块浅
    const aisleMat = new THREE.MeshStandardMaterial({ color: aisleCol, roughness: 0.62 });
    ctx.mats.onNight((t) => aisleMat.emissive.setRGB(t * 0.1, t * 0.1, t * 0.11));
    detailFor(aisleMat, ctx.mats.surfaces, 'floorPaint');
    const paint = ctx.mats.base.floorPaint ? 'floorPaint' : 'satin';
    const painted = [], spinePainted = [];
    for (const w of lv.walk) {
      const cuts = parkingPaintCuts(lv, w.poly);
      if (w.kind === 'aisle') {
        if (w.rect && !cuts.length) {
          const r = w.rect;
          B.frame(w.frame, () => B.get(paint).box((r.x0 + r.x1) / 2, y0 + 0.006, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.008, r.z1 - r.z0, aisleCol));
        } else {
          painted.push(flatShapeGeometry(cutSurfaceShapes(w.poly, cuts), y0 + .007));
        }
      } else if ((w.kind === 'spine' || w.kind === 'eschall') && w.rect) {
        const r = w.rect;
        if (cuts.length) {
          spinePainted.push(flatShapeGeometry(cutSurfaceShapes(w.poly, cuts), y0 + .008));
          continue;
        }
        B.frame(w.frame, () => {
          B.get(paint).box((r.x0 + r.x1) / 2, y0 + 0.008, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 0.2, 0.01, r.z1 - r.z0 - 0.2, '#c9c3b6');
          for (const v of [r.z0 + 0.3, r.z1 - 0.3]) B.get('satin').box((r.x0 + r.x1) / 2, y0 + 0.012, v, r.x1 - r.x0 - 0.4, 0.01, 0.12, band);
        });
      }
    }
    for (const [pieces, material] of [[painted, aisleMat], [spinePainted,
      detailFor(new THREE.MeshStandardMaterial({ color: '#c9c3b6', roughness: .62 }), ctx.mats.surfaces, 'floorPaint')]]) {
      if (!pieces.length) { if (material !== aisleMat) material.dispose(); continue; }
      const merged = mergeGeometries(pieces, false);
      pieces.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${lv.id}-cut-parking-paint`; mesh.receiveShadow = true; L.base.add(mesh);
    }

    // 车位线、特殊车位、挡车器、停放车辆
    const lines = new Set();
    const cars = [];
    for (const s of P.stalls) {
      const alongU = s.face === 'N' || s.face === 'S';
      const hw = (alongU ? s.w : s.d) / 2;
      const hd = (alongU ? s.d : s.w) / 2;
      const back = BACK[s.face];
      B.frame(s.frame, () => {
        for (const k of [-1, 1]) {
          const key = `${s.frame.id}:` + (alongU ? `u${(s.lx + k * hw).toFixed(2)},${s.lz}` : `v${(s.lz + k * hw).toFixed(2)},${s.lx}`);
          if (lines.has(key)) continue;
          lines.add(key);
          if (alongU) B.get('matte').flat(s.lx + k * hw, y0 + 0.017, s.lz, 0.12, s.d, white);
          else B.get('matte').flat(s.lx, y0 + 0.017, s.lz + k * hw, s.w, 0.12, white);
        }
        if (s.type !== 'normal') {
          const col = s.type === 'ev' ? '#2e9c6a' : '#2f6fd6';
          B.get('matte').flat(s.lx, y0 + 0.015, s.lz, s.w - 0.14, s.d - 0.14, col);
          if (s.type === 'ev') {
            const px = s.lx + back[0] * (hd - 0.3), pz = s.lz + back[1] * (hd - 0.3);
            B.get('satin').box(px, y0 + 0.75, pz, 0.35, 1.5, 0.3, '#f4f6f7');
            B.get('glow').box(px - back[0] * 0.16, y0 + 1.15, pz - back[1] * 0.16, alongU ? 0.2 : 0.02, 0.25, alongU ? 0.02 : 0.2, '#36d07a');
          } else {
            B.get('matte').cyl(s.lx, y0 + 0.012, s.lz, 0.55, 0.012, '#ffffff', 16);
            B.get('matte').cyl(s.lx, y0 + 0.016, s.lz, 0.42, 0.012, col, 16);
          }
        }
        B.get('matte').box(s.lx + back[0] * (hd - 0.9), y0 + 0.07, s.lz + back[1] * (hd - 0.9), alongU ? 1.6 : 0.18, 0.14, alongU ? 0.18 : 1.6, '#e7b416');
      });
      if (rand() < (s.type === 'accessible' ? 0.4 : 0.7)) {
        const [cx, cz] = toW(s.frame, s.lx - back[0] * 0.15, s.lz - back[1] * 0.15);
        cars.push({ x: cx, z: cz, ry: FACE_ROT[s.face] - s.frame.a, color: s.type === 'ev' ? '#d8e8f2' : CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] });
      }
    }
    if (cars.length) {
      const inst = new THREE.InstancedMesh(carGeo, carMat, cars.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), c = new THREE.Color();
      cars.forEach((car, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.ry);
        m.compose(p.set(car.x, y0, car.z), q, sc);
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, c.set(car.color));
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      L.base.add(inst);
    }

    // 柱：混凝土 + 分区色带 + 防撞护角
    for (const col of P.columns) {
      B.frame(col.frame, () => {
        B.get('matte').box(col.lx, y0 + H / 2, col.lz, 0.6, H, 0.6, '#cfd3d7');
        B.get('satin').box(col.lx, y0 + 1.4, col.lz, 0.62, 0.6, 0.62, band);
        for (let k = 0; k < 4; k++) B.get('matte').box(col.lx, y0 + 0.12 + k * 0.22, col.lz, 0.63, 0.1, 0.63, k % 2 ? '#1d2023' : '#e7b416');
      });
    }

    // 圆厅下的结构柱：内圈绕中央坡道一圈；外圈只在翼楼开口之间
    const bld = ctx.bById[lv.building];
    for (const r of bld.rotundas) {
      const ring = [];
      for (let a = 0; a < 360; a += 30) ring.push([18, a]);
      for (let a = 0; a < 360; a += 12) {
        const mouth = bld.wings.some((w) => {
          const d = Math.abs((((a - (w.rot === r.id ? w.deg : w.deg + 180)) % 360) + 540) % 360 - 180);
          return (w.rot === r.id || w.to === r.id) && d < Math.asin(18 / (r.R - 3)) * (180 / Math.PI) + 6;
        });
        if (!mouth) ring.push([r.R - 3, a]);
      }
      for (const [rad, a] of ring) {
        const x = r.x + Math.cos((a * Math.PI) / 180) * rad, z = r.z + Math.sin((a * Math.PI) / 180) * rad;
        if (lv.voids.some((v) => pointInPolyLocal([x, z], v.poly))) continue;
        B.get('matte').cyl(x, y0, z, 0.38, H, '#cfd3d7', 16);
        B.get('satin').cyl(x, y0 + 1.1, z, 0.4, 0.6, band, 16);
        for (let k = 0; k < 4; k++) B.get('matte').cyl(x, y0 + 0.02 + k * 0.22, z, 0.41, 0.1, k % 2 ? '#1d2023' : '#e7b416', 16);
      }
    }

    // 车道中线（虚线）与方向箭头：翼楼车道 aisle2 向外、aisle1 向内，横向车道由 +v 侧驶向 −v 侧
    const arrow = (x, z, dx, dz) => {
      const ry = Math.atan2(dx, dz);
      B.get('matte').box(x - dx * 0.5, y0 + 0.015, z - dz * 0.5, 0.25, 0.01, 1.6, white, ry);
      // 箭头的两撇从两侧向前收到尖上（以前转反了，两撇向前张开，画出来是个「Y」）
      for (const sgn of [-1, 1]) B.get('matte').box(x + dx * 0.39 + sgn * dz * 0.27, y0 + 0.015, z + dz * 0.39 - sgn * dx * 0.27, 0.22, 0.01, 0.9, white, ry - sgn * 0.65);
    };
    const lanes = aisleLanes(lv);
    for (const w of lv.walk) {
      if (w.kind !== 'aisle' || !w.rect || w.id.endsWith('throat') || w.id.endsWith('endzone')) continue;
      const r = w.rect;
      const alongU = r.x1 - r.x0 > r.z1 - r.z0;
      const len = alongU ? r.x1 - r.x0 : r.z1 - r.z0;
      const dir = w.dir || (w.id.endsWith('aisle1') ? [-1, 0] : w.id.endsWith('aisle2') ? [1, 0] : [0, -1]);
      const cuts = parkingPaintCuts(lv, w.poly);
      const lane = lanes.find((l) => l.w === w);
      // 标线要让开楼板洞口，也要让开路口：两条车道交叉的地方不画中线和箭头；两条车道叠在一起（同向）时只有先来的那条画
      const markFits = (x, z, clear = 0) => !cuts.some(poly =>
        convexOverlap(lrectPoly(w.frame, rect(x - 1.5, z - 1.5, x + 1.5, z + 1.5)), poly))
        && !laneClash(lanes, lane, toW(w.frame, x, z), clear);
      B.frame(w.frame, () => {
        const n = Math.floor((len - 4) / 3);
        for (let i = 0; i < n; i++) {
          const t = 2 + (i + 0.25) * 3;
          if (alongU && markFits(r.x0 + t, (r.z0 + r.z1) / 2)) B.get('matte').flat(r.x0 + t, y0 + 0.019, (r.z0 + r.z1) / 2, 1.4, 0.1, '#e7b416');
          else if (!alongU && markFits((r.x0 + r.x1) / 2, r.z0 + t)) B.get('matte').flat((r.x0 + r.x1) / 2, y0 + 0.019, r.z0 + t, 0.1, 1.4, '#e7b416');
        }
        for (let t = 10; t < len - 6; t += 16) {
          if (alongU && markFits(r.x0 + t, (r.z0 + r.z1) / 2 + 1.5, 2.5)) arrow(r.x0 + t, (r.z0 + r.z1) / 2 + 1.5, dir[0], dir[1]);
          else if (!alongU && markFits((r.x0 + r.x1) / 2 + 1.5, r.z0 + t, 2.5)) arrow((r.x0 + r.x1) / 2 + 1.5, r.z0 + t, dir[0], dir[1]);
        }
      });
    }

    // 吊挂指示牌：各翼分区、电梯厅
    const b = ctx.bById[lv.building];
    for (const w of b.wings) {
      if (w.link) continue;
      const mid = (w.u0 + w.uEnd - 12) / 2;
      hangSign(ctx, L, `${lv.short} · ${w.zone || w.id}区`, w.F, mid, 15, y0 + H - 0.5, band, 'parking');
      hangSign(ctx, L, `${lv.short} · ${w.zone || w.id}区`, w.F, mid, -15, y0 + H - 0.5, band, 'parking');
    }
    if (b.kind === 'street') {
      for (const [zone, x] of [['G', -188], ['H', -91]]) for (const z of [64, 112, 160]) hangSign(ctx, L, `${lv.short} · ${zone}区`, IDENTITY, x, z, y0 + H - 0.5, band, 'parking');
    }
    if (b.square) for (const [lu, lv2] of [[-30, -21], [30, -21], [0, 21], [-52, 0]]) hangSign(ctx, L, `${lv.short} · ${b.square.zone}区`, b.square.F, lu, lv2, y0 + H - 0.5, band, 'parking');
    for (const e of ctx.layout.elevators) {
      if (e.type !== 'passenger' || !e.serves.includes(lv.id)) continue;
      if (e.exterior) hangSign(ctx, L, '电梯厅 · 客梯', e.frame, e.lu - 5.5, e.lv, y0 + H - 0.5, '#1f2933', 'lift');
      else if (e.id.endsWith('L1')) hangSign(ctx, L, '电梯厅 · 客梯', e.frame, e.lu + 1.5, e.lv + (e.door === 'N' ? -4.5 : 4.5), y0 + H - 0.5, '#1f2933', 'lift');
    }
  }
  streetRamps(ctx);
  rampHeads(ctx);
  innerRamps(ctx);
  buildSharedGarageDetails(ctx);
}

/** 双面吊挂指示牌（局部坐标系 F 内的位置） */
function hangSign(ctx, L, text, F, lu, lv, y, bg, icon) {
  const lab = labelTexture(text, { bg, fg: '#ffffff', icon });
  const mat = ctx.mats.screen(lab.texture, 0.95, 1.4);
  const h = 0.55;
  const geo = new THREE.PlaneGeometry(h * lab.aspect, h);
  const [x, z] = toW(F, lu, lv);
  for (const r of [0, Math.PI]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = -F.a + Math.PI / 2 + r;
    L.base.add(m);
  }
  L.batch.frame(F, () => L.batch.get('metal').box(lu, y + 0.45, lv, 0.03, 0.4, 0.03, '#4a5056'));
}

/** 沿坡道方向建立的局部坐标系：u 从 from 指向 to，v 为车道横向 */
function rampFrame(r) {
  const deg = (Math.atan2(r.to.z - r.from.z, r.to.x - r.from.x) * 180) / Math.PI;
  return { F: frame(r.from.x, r.from.z, deg), len: Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z) };
}

/** 斜板：局部 u 从 (0,ya) 到 (len,yb)，车道 v∈[−w/2,w/2] */
function slopedSlab(B, key, len, ya, yb, w, t, color) {
  const sl = Math.hypot(len, yb - ya);
  const ang = Math.atan2(yb - ya, len);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
  const n = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0);
  const c = new THREE.Vector3(len / 2, (ya + yb) / 2, 0).addScaledVector(n, -t / 2);
  B.get(key).shape('box', c, q, new THREE.Vector3(sl, t, w), color);
}

function rampMarks(B, len, ya, yb, w, steps) {
  const sl = Math.hypot(len, yb - ya);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(yb - ya, len));
  // 行车方向的箭头（坡道局部 u 是行车方向）：一根杆加两撇，两撇从两侧向前收到尖上。以前是一根杆顶一道横杠，像个「T」
  const yAt = (u) => ya + (yb - ya) * u / len + .03, HEAD = 0.65, _y = new THREE.Vector3(0, 1, 0);
  for (let i = 1; i < steps; i++) {
    const u = len * i / steps;
    B.get('matte').shape('box', new THREE.Vector3(u, yAt(u), 0), q, new THREE.Vector3(1.5, .02, .25), '#ffffff');
    for (const side of [-1, 1]) {
      const cu = u + 1.15 - 0.45 * Math.cos(HEAD), cv = side * 0.45 * Math.sin(HEAD);
      B.get('matte').shape('box', new THREE.Vector3(cu, yAt(cu), cv),
        q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(_y, side * HEAD)), new THREE.Vector3(0.9, .02, .22), '#ffffff');
    }
  }
  for (const v of [-w / 2 + 0.25, w / 2 - 0.25]) B.get('matte').shape('box', new THREE.Vector3(len / 2, (ya + yb) / 2 + 0.03, v), q, new THREE.Vector3(sl, 0.02, 0.15), '#e7b416');
}

/** Guard walls follow the actual incline. Tall horizontal boxes previously
 * hid the next deck and made a descending ramp look like a black void. */
function rampGuards(B, len, ya, yb, width) {
  const rise = yb - ya, sl = Math.hypot(len, rise);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(rise, len));
  for (const side of [-1, 1]) {
    const z = side * (width / 2 + .12);
    B.get('matte').shape('box', new THREE.Vector3(len / 2, (ya + yb) / 2 + .45, z),
      q, new THREE.Vector3(sl, .9, .24), '#b9bfba');
    B.get('metal').shape('box', new THREE.Vector3(len / 2, (ya + yb) / 2 + .95, z),
      q, new THREE.Vector3(sl, .08, .12), '#536861');
    for (let u = 2; u < len - 1; u += 4) {
      const y = ya + rise * u / len;
      B.get('glow').box(u, y + .7, side * (width / 2 - .01), .3, .13, .025, '#f3dc8b');
      B.get('matte').box(u, y + .2, z, .28, .3, .27, '#d9ae3a');
    }
  }
}

/** 地面车库出入口坡道（敞开段 + 暗埋段），属于其地下层；敞开段（坡道槽）另画一份整宽坡面到场地组，园区视角也可见 */
function streetRamps(ctx) {
  const S = ctx.site.batch;
  for (const t of ctx.layout.site.trenches) {
    const r = ctx.layout.ramps.find((x) => x.type.startsWith('street') && convexOverlap(x.poly, t));
    if (!r) continue;
    const { F, len } = rampFrame(r);
    const loc = t.map(([x, z]) => toL(F, x, z));
    // A covered ramp keeps its whole slab in the site group, so the tunnel
    // floor beyond the open trench is still drawn when the deck is hidden.
    const ua = r.cover ? 0 : Math.max(0, Math.min(...loc.map((p) => p[0]))), ub = r.cover ? len : Math.min(len, Math.max(...loc.map((p) => p[0])));
    const va = Math.min(...loc.map((p) => p[1])), vb = Math.max(...loc.map((p) => p[1]));
    if (ub - ua < 1) continue;
    const yAt = (u) => r.from.y + ((r.to.y - r.from.y) * u) / len;
    const [ox, oz] = toW(F, ua, (va + vb) / 2);
    const G = frame(ox, oz, F.deg);
    S.frame(G, () => {
      slopedSlab(S, 'ext', ub - ua, yAt(ua) - 0.02, yAt(ub) - 0.02, vb - va, 0.4, '#555b62');
      const sl = Math.hypot(ub - ua, yAt(ub) - yAt(ua));
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(yAt(ub) - yAt(ua), ub - ua));
      S.get('ext').shape('box', new THREE.Vector3((ub - ua) / 2, (yAt(ua) + yAt(ub)) / 2 + 0.01, 0), q, new THREE.Vector3(sl, 0.02, 0.15), '#ecebe6');
    });
  }
  for (const r of ctx.layout.ramps.filter((x) => x.type === 'street-in' || x.type === 'street-out')) {
    const lvId = r.from.level === 'street' ? r.to.level : r.from.level;
    const B = ctx.levels[lvId].batch;
    const { F, len } = rampFrame(r);
    B.frame(F, () => {
      slopedSlab(B, 'matte', len, r.from.y, r.to.y, r.width, 0.4, '#555b62');
      rampGuards(B, len, r.from.y, r.to.y, r.width);
      rampMarks(B, len, r.from.y, r.to.y, r.width, 9);
    });
  }
}

/** Street ramp heads seen from the site: a light canopy over the open trench
 * (phase-one gates, as in the concept aerial) and, for covered ramps, the
 * portal, tunnel walls and cover slab between the trench and the deck. */
function rampHeads(ctx) {
  const S = ctx.site.batch;
  // 洞口头墙、暗埋段侧墙和盖板：清水混凝土（以前借用铺装混凝土的贴图，颜色发暗发棕，还一格一格的）
  const wall = ctx.mats.base.facadeBoardConcrete ? 'facadeBoardConcrete' : 'concrete';
  for (const r of ctx.layout.ramps.filter((x) => x.type.startsWith('street'))) {
    const street = r.from.level === 'street' ? r.from : r.to, low = street === r.from ? r.to : r.from;
    const len = Math.hypot(low.x - street.x, low.z - street.z);
    const F = frame(street.x, street.z, Math.atan2(low.z - street.z, low.x - street.x) * 180 / Math.PI);
    const yAt = (u) => street.y + ((low.y - street.y) * u) / len;
    const open = r.cover ? r.cover.open : len, w = r.width, half = w / 2;
    S.frame(F, () => {
      if (['P1', 'H', 'A'].includes(r.building)) {
        const span = open - 0.6, ribs = Math.max(2, Math.round(span / 1.5));
        for (let u = 0.6; u <= open - 0.3; u += 6) for (const v of [-half - 0.35, half + 0.35]) S.get('extMetal').box(u, 1.6, v, 0.14, 3.4, 0.14, '#59605d');
        S.get('extMetal').box(open / 2, 3.32, 0, span + 0.6, 0.12, w + 1.2, '#6a716d');
        S.get('glass').box(open / 2, 3.42, 0, span + 0.4, 0.04, w + 1.0, '#ffffff');
        for (let i = 0; i <= ribs; i++) S.get('extMetal').box(0.3 + (span * i) / ribs, 3.47, 0, 0.06, 0.06, w + 1.1, '#6a716d');
        S.get('glow').box(open / 2, 3.24, 0, span, 0.03, 0.12, '#fff2cf');
      }
      if (!r.cover) return;
      const uc = Math.min(len, (len * 4.5) / -low.y);
      // Portal head wall at grade and the cover slab the plaza sits on.
      S.get(wall).box(open + 0.2, 0.05, 0, 0.4, 1.0, w + 0.9, '#b9bfba');
      S.get(wall).box((open + uc) / 2, -0.42, 0, uc - open, 0.3, w + 0.9, '#a4aca8');
      for (let u = open; u < uc - 0.01; u += 2) {
        const b = Math.min(uc, u + 2), bottom = yAt(b) - 0.4;
        for (const v of [-half - 0.3, half + 0.3]) S.get(wall).box((u + b) / 2, (bottom - 0.27) / 2, v, b - u, -0.27 - bottom, 0.3, '#a9b1ad');
      }
      S.get('glow').box((open + uc) / 2, -0.6, 0, uc - open - 0.6, 0.04, 0.16, '#eef6ff');
    });
  }
}

/** 层间坡道（属于下层，聚焦任一层都可见） */
function innerRamps(ctx) {
  const inner = ctx.layout.ramps.filter((x) => x.type === 'down' || x.type === 'up');
  for (const r of inner) {
    const low = r.from.y < r.to.y ? r.from.level : r.to.level;
    const B = ctx.levels[low].batch;
    const { F, len } = rampFrame(r);
    B.frame(F, () => {
      slopedSlab(B, 'matte', len, r.from.y, r.to.y, r.width, 0.35, '#5d646b');
      rampGuards(B, len, r.from.y, r.to.y, r.width);
      rampMarks(B, len, r.from.y, r.to.y, r.width, 6);
    });
  }
  rampOpeningParapets(ctx, inner);
}

/** 坡道洞口的护墙：高、厚（m），和取样步长。 */
export const RAMP_PARAPET = Object.freeze({ height: 1.1, thick: 0.2, step: 0.5, min: 0.8 });

/**
 * 坡道洞口四周哪几段要砌护墙。poly 是洞口（世界多边形），mouths 是坡道在这一层的上口 [{ x, z, half }]
 * （车从那里开上楼面，要留空）。返回每条边上要砌的段 [{ a: [x, z], b: [x, z] }]。
 */
export function parapetRuns(poly, mouths, step = RAMP_PARAPET.step, min = RAMP_PARAPET.min) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < min) continue;
    const n = Math.max(1, Math.round(len / step)), at = (t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    let start = null;
    for (let k = 0; k <= n; k++) {
      const c = at(Math.min(1, (k + 0.5) / n));
      const open = k === n || mouths.some((m) => Math.hypot(c[0] - m.x, c[1] - m.z) < m.half);
      if (!open && start == null) start = k / n;
      if (open && start != null) { if ((k / n - start) * len >= min) out.push({ a: at(start), b: at(k / n) }); start = null; }
    }
  }
  return out;
}

/**
 * 层间坡道在上层楼板上开的洞：以前洞口四周什么都没有，站在上层往洞里看，直接看到下一层的地面，像地板没有底。
 * 现在沿洞口砌一圈混凝土护墙（带一道黄黑警示带和钢扶手），只在坡道开上来的那一头留口。属于上层。
 */
function rampOpeningParapets(ctx, ramps) {
  const P = RAMP_PARAPET, done = new Set();
  for (const r of ramps) {
    const hi = r.from.y > r.to.y ? r.from : r.to, upper = ctx.layout.levels.find((l) => l.id === hi.level), L = ctx.levels[hi.level];
    if (!upper || !L) continue;
    const mid = [(r.from.x + r.to.x) / 2, (r.from.z + r.to.z) / 2];
    const hole = upper.voids.find((v) => v.kind === 'ramp' && v.poly && pointInPolyLocal(mid, v.poly));
    if (!hole || done.has(hole)) continue;
    done.add(hole);
    // 这个洞里所有坡道的上口（中央坡道一个洞里有上、下两条）
    const mouths = ramps.filter((o) => pointInPolyLocal([(o.from.x + o.to.x) / 2, (o.from.z + o.to.z) / 2], hole.poly))
      .map((o) => { const h = o.from.y > o.to.y ? o.from : o.to; return { x: h.x, z: h.z, half: o.width / 2 + 0.45 }; });
    const B = L.batch, y0 = upper.elev;
    const cx = hole.poly.reduce((t, q) => t + q[0], 0) / hole.poly.length, cz = hole.poly.reduce((t, q) => t + q[1], 0) / hole.poly.length;
    for (const { a, b } of parapetRuns(hole.poly, mouths)) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
      // 墙立在洞口外侧的楼板上（往洞外挪半个墙厚）
      let nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if ((mx + nx - cx) ** 2 + (mz + nz - cz) ** 2 < (mx - cx) ** 2 + (mz - cz) ** 2) { nx = -nx; nz = -nz; }
      const x = mx + nx * P.thick / 2, z = mz + nz * P.thick / 2;
      B.get('matte').box(x, y0 + P.height / 2, z, P.thick, P.height, len + P.thick, '#b9bfba', ry);
      B.get('matte').box(x, y0 + 0.16, z, P.thick + 0.02, 0.16, len + P.thick, '#e7b416', ry);
      B.get('metal').box(x, y0 + P.height + 0.06, z, 0.08, 0.06, len + P.thick, '#59605d', ry);
    }
  }
}
