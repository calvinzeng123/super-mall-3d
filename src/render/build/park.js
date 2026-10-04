// 中央公园：湖面（湖床 + 水面 + 卵石滩 + 石砌驳岸）、环湖步道与园路（带状铺装）、落地塔与地铁口前广场、
// 林地与开阔草坡、湖边亲水木栈道与亭、地铁站出入口（钢框玻璃雨棚 + 下行楼梯 + M 标识柱）、沿湖长椅与庭院灯。
import * as THREE from 'three';
import { pointInPoly, distToSeg, frame, toW } from '../../layout/geom.js';
import { shapeFromPoly, flatShapeGeometry } from './shell.js';
import { addTrees, bench, planter } from './props.js';
import { COLORS } from '../theme.js';
import { rng, labelTexture } from '../textures.js';

const FORECOURT = [[16, 20], [98, 20], [98, 58], [78, 76], [16, 76]];
const MEADOWS = [[236, 62, 26], [96, 206, 24], [252, 214, 20]];

/** 折线 → 带状网格（世界坐标 UV，按 tile 米重复） */
function ribbon(pts, width, y, loop, tile = 4) {
  const P = loop ? [...pts, pts[0]] : pts;
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)];
    let dx = c[0] - a[0], dz = c[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    if (i > 0) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const nx = -dz * width / 2, nz = dx * width / 2;
    pos.push(P[i][0] - nx, y, P[i][1] - nz, P[i][0] + nx, y, P[i][1] + nz);
    uv.push(acc / tile, 0, acc / tile, width / tile);
  }
  for (let i = 0; i < P.length - 1; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const scaleFrom = (poly, c, k, add = 0) => poly.map(([x, z]) => {
  const dx = x - c[0], dz = z - c[1];
  const r = Math.hypot(dx, dz) || 1;
  const f = (r * k + add) / r;
  return [c[0] + dx * f, c[1] + dz * f];
});

function nearPolyline(p, pts, loop) {
  let best = Infinity;
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) best = Math.min(best, distToSeg(p, pts[i], pts[(i + 1) % pts.length]));
  return best;
}

export function buildPark(ctx) {
  const pk = ctx.layout.site.park;
  if (!pk) return;
  const G = new THREE.Group();
  G.name = 'park';
  ctx.site.group.add(G);
  const B = ctx.site.batch;
  const mats = ctx.mats;
  const c = pk.center;

  // ---------- 湖 ----------
  const beach = scaleFrom(pk.lake, c, 1, 2.2);
  const add = (geo, mat, order = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.renderOrder = order;
    G.add(m);
    return m;
  };
  add(flatShapeGeometry(shapeFromPoly(beach, [pk.lake]), -0.24), new THREE.MeshStandardMaterial({ color: 0xc9b996, roughness: 0.95 }));
  add(flatShapeGeometry(shapeFromPoly(pk.lake), -0.235), new THREE.MeshStandardMaterial({ color: 0x1f3d46, roughness: 0.9 }));
  add(flatShapeGeometry(shapeFromPoly(scaleFrom(pk.lake, c, 1, -0.3)), -0.16), mats.base.water, 2);
  for (let i = 0; i < pk.lake.length; i++) {
    const a = pk.lake[i], b = pk.lake[(i + 1) % pk.lake.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    B.get('ext').box((a[0] + b[0]) / 2, -0.18, (a[1] + b[1]) / 2, len + 0.3, 0.2, 0.55, '#a39b8c', Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
  }

  // ---------- 步道与广场 ----------
  const pave = mats.floor('paving', 0.8);
  add(ribbon(pk.loop, 4, -0.12, true), pave);
  for (const p of pk.paths) add(ribbon(p, 3, -0.125, false), pave);
  const mf = frame(pk.metro.x, pk.metro.z, pk.metro.deg || 0, 'metro');
  const well = [[-2.2, -1.95], [5.2, -1.95], [5.2, 1.95], [-2.2, 1.95]].map(([u, v]) => toW(mf, u, v));
  const fc = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeFromPoly(FORECOURT, [well]), { depth: 0.35, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.35, 0), pave);
  fc.receiveShadow = true;
  G.add(fc);
  for (const [x, z] of [[24, 60], [34, 68], [88, 30], [92, 44]]) planter(B, x - 2.5, z - 1.5, x + 2.5, z + 1.5, 0, x + z, true);

  // ---------- 林地与草坡 ----------
  const rand = rng(2468);
  const trees = [];
  const shore = scaleFrom(pk.lake, c, 1, 6);
  for (let x = 20; x < 284; x += 8) {
    for (let z = 24; z < 254; z += 8) {
      const p = [x + (rand() - 0.5) * 6, z + (rand() - 0.5) * 6];
      if (rand() < 0.38) continue;
      if (pointInPoly(p, shore) || pointInPoly(p, FORECOURT)) continue;
      if (nearPolyline(p, pk.loop, true) < 4 || pk.paths.some((q) => nearPolyline(p, q, false) < 3.5)) continue;
      if (MEADOWS.some(([mx, mz, r]) => Math.hypot(p[0] - mx, p[1] - mz) < r)) continue;
      if (Math.hypot(p[0] - pk.metro.x, p[1] - pk.metro.z) < 12) continue;
      trees.push({ x: p[0], y: -0.3, z: p[1], s: 0.8 + rand() * 0.7, kind: rand() < 0.3 ? 'cone' : 'round' });
    }
  }
  addTrees(G, mats, trees, 1357);
  for (const [mx, mz, r] of MEADOWS) {
    B.get('foliage').sphere(mx, -0.3, mz, r * 0.55, '#7d9c55', 1.2, r * 0.45, 'ico');
  }

  // ---------- 沿湖长椅与庭院灯 ----------
  const L = pk.loop;
  let acc = 0;
  for (let i = 0; i < L.length; i++) {
    const a = L[i], b = L[(i + 1) % L.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    acc += len;
    if (acc < 16) continue;
    acc = 0;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    const out = Math.hypot(a[0] - dz - c[0], a[1] + dx - c[1]) > Math.hypot(a[0] - c[0], a[1] - c[1]) ? 1 : -1;
    const nx = -dz * out, nz = dx * out;
    const lx = a[0] + nx * 2.8, lz = a[1] + nz * 2.8;
    B.get('extMetal').cyl(lx, -0.12, lz, 0.07, 4.0, '#2b2f33', 8);
    B.get('glow').sphere(lx, 3.85, lz, 0.2, '#ffe2b0', 0.24, 0.2);
    bench(B, a[0] - nx * 2.9, -0.12, a[1] - nz * 2.9, Math.atan2(dx, dz) + Math.PI / 2);
  }

  pavilion(ctx, B, pk, c);
  metro(ctx, B, G, pk.metro);
  picks(ctx, pk);
}

/** 湖边亲水木栈道 + 亭（四柱、攒尖顶、宝顶） */
function pavilion(ctx, B, pk, c) {
  // 取湖岸西北方向的点，向湖内伸出 10m
  let best = pk.lake[0], score = -Infinity;
  for (const p of pk.lake) {
    const s = -(p[0] - c[0]) - (p[1] - c[1]);
    if (s > score) { score = s; best = p; }
  }
  const dir = Math.atan2(c[1] - best[1], c[0] - best[0]);
  const F = frame(best[0], best[1], (dir * 180) / Math.PI, 'park-pier');
  B.frame(F, () => {
    B.get('ext').box(2, 0.12, 0, 12, 0.14, 2.6, '#8a5a36');
    for (let u = -3; u <= 7; u += 2) for (const v of [-1.2, 1.2]) B.get('ext').cyl(u, -0.6, v, 0.1, 0.75, '#5a3a22', 6);
    for (const v of [-1.3, 1.3]) B.get('ext').box(2, 0.6, v, 12, 0.06, 0.06, '#5a3a22');
    const u0 = 11;
    B.get('ext').box(u0, 0.15, 0, 6.4, 0.3, 6.4, '#8a5a36');
    for (const [du, dv] of [[-2.6, -2.6], [2.6, -2.6], [2.6, 2.6], [-2.6, 2.6]]) B.get('ext').cyl(u0 + du, 0.3, dv, 0.16, 3.2, '#9b2d20', 10);
    B.get('ext').box(u0, 3.55, 0, 6.6, 0.3, 6.6, '#9b2d20');
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    B.get('ext').shape('cone4', new THREE.Vector3(u0, 3.7, 0), q, new THREE.Vector3(10.6, 2.6, 10.6), '#3d4248');
    B.get('extMetal').sphere(u0, 6.45, 0, 0.28, '#d4a72c');
    for (const v of [-2, 2]) B.get('ext').box(u0, 0.75, v * 1.3, 3.6, 0.08, 0.4, COLORS.wood);
  });
}

/** 地铁出入口：下沉楼梯（侧墙、踏步、端墙灯箱）、白色金属雨棚 + 玻璃侧板、M 标识柱与站名牌 */
function metro(ctx, B, G, m) {
  const F = frame(m.x, m.z, m.deg || 0, 'metro');
  B.frame(F, () => {
    // 梯井：u 从 −2 向 +5 下沉 3m
    const n = 14;
    for (let i = 0; i < n; i++) {
      const u = -2 + (i + 0.5) * 0.5;
      const y = -((i + 1) * 3.0) / n;
      B.get('ext').box(u, y + 0.08, 0, 0.52, 0.16, 3.7, i % 2 ? '#9a9ea2' : '#8f9396');
      B.get('ext').box(u - 0.24, y + 0.165, 0, 0.04, 0.012, 3.7, '#e7b416');
    }
    for (const v of [-1.95, 1.95]) B.get('ext').box(1.5, -1.55, v, 7.4, 3.1, 0.12, '#c9ccd0');
    B.get('ext').box(5.2, -1.55, 0, 0.12, 3.1, 3.9, '#2a2d31');
    B.get('glow').box(5.12, -1.3, 0, 0.04, 0.5, 2.6, '#ffffff');
    B.get('ext').box(1.5, -3.1, 0, 7.4, 0.1, 3.9, '#5d6267');
    for (const v of [-1.8, 1.8]) B.get('extMetal').bar({ x: -2, y: 0.95, z: v }, { x: 5, y: -2.05, z: v }, 0.05, '#c9ccd0');
    for (const v of [-2.05, 2.05]) {
      B.get('glass').box(1.5, 0.55, v, 7.4, 1.0, 0.04, 0xffffff);
      B.get('extMetal').box(1.5, 1.08, v, 7.4, 0.06, 0.08, '#2b2f33');
    }
    // 雨棚：四柱 + 白色金属屋面 + 玻璃侧板与端板
    for (const [u, v] of [[-3, -2.6], [5.4, -2.6], [5.4, 2.6], [-3, 2.6]]) B.get('extMetal').box(u, 1.75, v, 0.16, 3.5, 0.16, '#2b2f33');
    B.get('extMetal').box(1.2, 3.6, 0, 9.4, 0.28, 6.2, '#f2f2ee');
    B.get('extMetal').box(1.2, 3.42, -3.05, 9.4, 0.1, 0.1, '#c8352b');
    B.get('extMetal').box(1.2, 3.42, 3.05, 9.4, 0.1, 0.1, '#c8352b');
    B.get('glow').box(1.2, 3.44, 0, 8.6, 0.03, 0.5, '#eaf6ff');
    for (const v of [-2.6, 2.6]) B.get('glass').box(1.2, 1.8, v, 8.4, 3.2, 0.04, 0xffffff);
    B.get('glass').box(5.4, 1.8, 0, 0.04, 3.2, 5.2, 0xffffff);
    // M 标识柱
    B.get('extMetal').box(-5, 2.2, -3.2, 0.5, 4.4, 0.5, '#2b2f33');
    B.get('glow').cyl(-5, 4.4, -3.2, 0.75, 0.16, '#c8352b', 24);
  });
  const lab = labelTexture(m.name, { bg: 'rgba(200,53,43,0.96)', fg: '#ffffff', icon: 'info', sub: 'METRO · 云澜汇站' });
  const mat = ctx.mats.screen(lab.texture, 0.95, 1.45);
  const h = 0.9;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(h * lab.aspect, h), mat);
  const [x, z] = toW(F, -3.15, 0);
  sign.position.set(x, 3.0, z);
  sign.rotation.y = -F.a - Math.PI / 2;
  G.add(sign);
  const logo = labelTexture('M', { bg: 'rgba(200,53,43,1)', fg: '#ffffff' });
  const lm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), ctx.mats.screen(logo.texture, 1.0, 1.5));
  const [lx, lz] = toW(F, -5, -3.2);
  for (const k of [-1, 1]) {
    const p = lm.clone();
    p.position.set(lx + F.c * k * 0.27, 3.7, lz + F.s * k * 0.27);
    p.rotation.y = Math.atan2(F.c * k, F.s * k);
    G.add(p);
  }
}

function picks(ctx, pk) {
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const lake = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeFromPoly(pk.lake), { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.5, 0), mat);
  lake.userData = { kind: 'facility', title: '云澜湖 · 中央公园', desc: '湖面约 1.6 公顷 · 环湖步道 600m · 亲水栈道与湖亭' };
  ctx.site.picks.add(lake);
  const m = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 6), mat);
  m.position.set(pk.metro.x, 2, pk.metro.z);
  m.userData = { kind: 'facility', title: pk.metro.name, desc: '地铁云澜汇站 B 出入口 · 经云环天桥直达各期商场' };
  ctx.site.picks.add(m);
}
