// 停车层：车道漆面、车位线、充电位/无障碍位、挡车器、分区色柱、停放车辆（实例化）、
// 车道中线与方向箭头、人行斑马线、吊挂指示牌、地面坡道与 B1↔B2 坡道。
import * as THREE from 'three';
import { rng, labelTexture } from '../textures.js';
import { zebra } from './props.js';
import { THEME } from '../theme.js';
import { clearHeight } from './shell.js';

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
    const band = THEME[lv.id].band;
    const rand = rng(lv.id === 'B1' ? 5 : 9);
    const P = lv.parking;
    const white = '#f1f1ee';

    // 车道漆面
    for (const a of P.aisles) B.get('satin').box((a.x0 + a.x1) / 2, y0 + 0.006, (a.z0 + a.z1) / 2, a.x1 - a.x0, 0.008, a.z1 - a.z0, lv.id === 'B1' ? '#79838f' : '#7b8880');

    // 车位线、特殊车位、挡车器
    const lines = new Set();
    const cars = [];
    for (const s of P.stalls) {
      const alongX = s.face === 'N' || s.face === 'S';
      const hw = (alongX ? s.w : s.d) / 2;
      const hd = (alongX ? s.d : s.w) / 2;
      for (const k of [-1, 1]) {
        const key = alongX ? `x${(s.x + k * hw).toFixed(2)},${s.z}` : `z${(s.z + k * hw).toFixed(2)},${s.x}`;
        if (lines.has(key)) continue;
        lines.add(key);
        if (alongX) B.get('matte').box(s.x + k * hw, y0 + 0.012, s.z, 0.12, 0.01, s.d, white);
        else B.get('matte').box(s.x, y0 + 0.012, s.z + k * hw, s.w, 0.01, 0.12, white);
      }
      const back = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] }[s.face];
      if (s.type !== 'normal') {
        const col = s.type === 'ev' ? '#2e9c6a' : '#2f6fd6';
        B.get('matte').box(s.x, y0 + 0.01, s.z, s.w - 0.14, 0.01, s.d - 0.14, col);
        if (s.type === 'ev') {
          const px = s.x + back[0] * (hd - 0.3), pz = s.z + back[1] * (hd - 0.3);
          B.get('satin').box(px, y0 + 0.75, pz, 0.35, 1.5, 0.3, '#f4f6f7');
          B.get('glow').box(px - back[0] * 0.16, y0 + 1.15, pz - back[1] * 0.16, alongX ? 0.2 : 0.02, 0.25, alongX ? 0.02 : 0.2, '#36d07a');
        } else {
          B.get('matte').cyl(s.x, y0 + 0.012, s.z, 0.55, 0.012, '#ffffff', 16);
          B.get('matte').cyl(s.x, y0 + 0.016, s.z, 0.42, 0.012, col, 16);
        }
      }
      // 挡车器
      const wx = s.x + back[0] * (hd - 0.9), wz = s.z + back[1] * (hd - 0.9);
      B.get('matte').box(wx, y0 + 0.07, wz, alongX ? 1.6 : 0.18, 0.14, alongX ? 0.18 : 1.6, '#e7b416');
      if (rand() < (s.type === 'accessible' ? 0.4 : 0.7)) {
        cars.push({ x: s.x - back[0] * 0.15, z: s.z - back[1] * 0.15, ry: FACE_ROT[s.face], color: s.type === 'ev' ? '#d8e8f2' : CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] });
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
      B.get('matte').box(col.x, y0 + H / 2, col.z, 0.6, H, 0.6, '#cfd3d7');
      B.get('satin').box(col.x, y0 + 1.4, col.z, 0.62, 0.6, 0.62, band);
      for (let k = 0; k < 4; k++) B.get('matte').box(col.x, y0 + 0.12 + k * 0.22, col.z, 0.63, 0.1, 0.63, k % 2 ? '#1d2023' : '#e7b416');
    }

    // 车道中线（虚线）与方向箭头
    const dash = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.floor(len / 3);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.25) / n;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        B.get('matte').box(x, y0 + 0.014, z, x1 !== x0 ? 1.4 : 0.1, 0.01, x1 !== x0 ? 0.1 : 1.4, '#e7b416');
      }
    };
    for (const a of P.aisles) {
      const w = a.x1 - a.x0, d = a.z1 - a.z0;
      if (w > d) dash(a.x0 + 2, (a.z0 + a.z1) / 2, a.x1 - 2, (a.z0 + a.z1) / 2);
      else dash((a.x0 + a.x1) / 2, a.z0 + 2, (a.x0 + a.x1) / 2, a.z1 - 2);
    }
    const arrow = (x, z, dir) => {
      const [dx, dz] = dir;
      const ry = Math.atan2(dx, dz);
      B.get('matte').box(x - dx * 0.5, y0 + 0.015, z - dz * 0.5, 0.25, 0.01, 1.6, white, ry);
      for (const s of [-1, 1]) B.get('matte').box(x + dx * 0.35 + s * dz * 0.25, y0 + 0.015, z + dz * 0.35 - s * dx * 0.25, 0.22, 0.01, 0.9, white, ry + s * 0.65);
    };
    // 推荐行车环线：进 C（南向）→ A2（东向）→ AE（南向）→ A4（西向）→ AW（北向）→ A1（东向）→ C（北向）出
    for (const z of [-30, -12, 10]) { arrow(-1.5, z, [0, 1]); arrow(1.5, z, [0, -1]); }
    for (const x of [-40, -20, 20, 40]) { arrow(x, -5.25, [1, 0]); arrow(x, 21, [-1, 0]); arrow(x, -21, [1, 0]); arrow(x, 10.25, [-1, 0]); }
    for (const z of [-15, 0, 15]) { arrow(52, z, [0, 1]); arrow(-52, z, [0, -1]); }

    // 人行斑马线：电梯厅 / 扶梯厅前横穿 A1、A4
    zebra(B, -30.5, -21, 5, 4.4, 'z', y0 + 0.016, 'matte');
    zebra(B, 30.5, 21, 5, 4.4, 'z', y0 + 0.016, 'matte');
    if (lv.id === 'B1') zebra(B, -13, -21, 6, 4.4, 'z', y0 + 0.016, 'matte');

    // 吊挂指示牌
    hangSign(ctx, L, `${lv.short} · A区`, -30, -12.5, y0 + H - 0.5, band, 'parking');
    hangSign(ctx, L, `${lv.short} · B区`, 30, -12.5, y0 + H - 0.5, band, 'parking');
    hangSign(ctx, L, `${lv.short} · C区`, -30, 12.5, y0 + H - 0.5, band, 'parking');
    hangSign(ctx, L, `${lv.short} · D区`, 30, 12.5, y0 + H - 0.5, band, 'parking');
    hangSign(ctx, L, '电梯厅 · 客梯', -30.5, -20, y0 + H - 0.5, '#1f2933', 'lift');
    hangSign(ctx, L, '电梯厅 · 客梯', 30.5, 20, y0 + H - 0.5, '#1f2933', 'lift');
    if (lv.id === 'B1') {
      hangSign(ctx, L, '出口 EXIT ↑', 0, -36, y0 + H - 0.5, '#0f8a4a', 'exit');
      hangSign(ctx, L, '扶梯 → 美食广场', -13, -19.5, y0 + H - 0.5, '#b45309', 'escalator');
      hangSign(ctx, L, '↓ 往 B2', 52, -26, y0 + H - 0.5, '#1d4ed8', 'parking');
    } else {
      hangSign(ctx, L, '↑ 往 B1 · 出口', 22, -26, y0 + H - 0.5, '#0f8a4a', 'exit');
    }
  }
  streetRamps(ctx);
  innerRamps(ctx);
}

/** 双面吊挂指示牌 */
function hangSign(ctx, L, text, x, z, y, bg, icon) {
  const lab = labelTexture(text, { bg, fg: '#ffffff', icon });
  const mat = ctx.mats.screen(lab.texture, 0.95, 1.4);
  const h = 0.55;
  const geo = new THREE.PlaneGeometry(h * lab.aspect, h);
  for (const r of [0, Math.PI]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = r;
    L.base.add(m);
  }
  L.batch.get('metal').box(x, y + 0.45, z, 0.03, 0.4, 0.03, '#4a5056');
}

/** 斜板：沿 x 方向从 (xa,ya) 到 (xb,yb)，车道 z∈[z0,z1] */
function slopedSlab(B, key, xa, ya, xb, yb, z0, z1, t, color) {
  const len = Math.hypot(xb - xa, yb - ya);
  const ang = Math.atan2(yb - ya, xb - xa);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
  const n = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0);
  const c = new THREE.Vector3((xa + xb) / 2, (ya + yb) / 2, (z0 + z1) / 2).addScaledVector(n, -t / 2);
  B.get(key).shape('box', c, q, new THREE.Vector3(len, t, z1 - z0), color);
}

/** 地面车库出入口坡道（敞开段 + 暗埋段），属于 B1 组 */
function streetRamps(ctx) {
  const L = ctx.levels.B1;
  const B = L.batch;
  for (const r of ctx.layout.ramps.filter((x) => x.type === 'street-in' || x.type === 'street-out')) {
    const { lane } = r;
    const xa = r.from.x, ya = r.from.y, xb = r.to.x, yb = r.to.y;
    slopedSlab(B, 'matte', xa, ya, xb, yb, lane.z0, lane.z1, 0.4, '#555b62');
    // 两侧挡墙
    const yLow = Math.min(ya, yb) - 0.5;
    for (const z of [lane.z0 - 0.15, lane.z1 + 0.15]) B.get('matte').boxMinMax(Math.min(xa, xb), yLow, z - 0.15, Math.max(xa, xb), -0.15, z + 0.15, '#a3a9ae');
    // 路面标线与箭头
    const steps = 9;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = xa + (xb - xa) * t, y = ya + (yb - ya) * t + 0.03;
      const dir = r.type === 'street-in' ? 1 : 1;
      B.get('matte').box(x, y, (lane.z0 + lane.z1) / 2, 1.5, 0.02, 0.25, '#ffffff');
      B.get('matte').box(x + dir * 0.75, y, (lane.z0 + lane.z1) / 2, 0.45, 0.02, 0.9, '#ffffff');
    }
    for (const z of [lane.z0 + 0.25, lane.z1 - 0.25]) {
      const len = Math.hypot(xb - xa, yb - ya);
      const ang = Math.atan2(yb - ya, xb - xa);
      B.get('matte').shape('box', new THREE.Vector3((xa + xb) / 2, (ya + yb) / 2 + 0.03, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang), new THREE.Vector3(len, 0.02, 0.15), '#e7b416');
    }
  }
  // 连接区两侧墙
  B.get('matte').boxMinMax(-6.3, -8.4, -52.3, 6.3, -0.15, -52, '#a3a9ae');
}

/** B1↔B2 坡道（属于 B2 组，聚焦任一层都可见） */
function innerRamps(ctx) {
  const L = ctx.levels.B2;
  const B = L.batch;
  for (const r of ctx.layout.ramps.filter((x) => x.type === 'down' || x.type === 'up')) {
    const { lane } = r;
    slopedSlab(B, 'matte', r.from.x, r.from.y, r.to.x, r.to.y, lane.z0, lane.z1, 0.35, '#5d646b');
    const lo = Math.min(r.from.y, r.to.y), hi = Math.max(r.from.y, r.to.y);
    B.get('matte').boxMinMax(lane.x0, lo, lane.z0 - 0.2, lane.x1, hi + 1.0, lane.z0, '#a3a9ae');
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const x = r.from.x + (r.to.x - r.from.x) * t, y = r.from.y + (r.to.y - r.from.y) * t + 0.03;
      const dir = Math.sign(r.to.x - r.from.x);
      B.get('matte').box(x, y, (lane.z0 + lane.z1) / 2, 1.2, 0.02, 0.22, '#ffffff');
      B.get('matte').box(x + dir * 0.6, y, (lane.z0 + lane.z1) / 2, 0.4, 0.02, 0.8, '#ffffff');
    }
  }
  B.get('matte').boxMinMax(25, -12, -30.7, 49, -8.0, -30.5, '#a3a9ae');
}
