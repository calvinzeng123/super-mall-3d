// 场地：草地、广场铺装、道路与标线、人行道、行道树、路灯、南广场（喷泉、IP、立牌）、
// 四个人行入口的雨棚与门、北侧卸货区、车库出入口道闸与灯箱、周边楼宇。
import * as THREE from 'three';
import { shapeFromPoly, flatShapeGeometry } from './shell.js';
import { rectPoly, rect } from '../../layout/geom.js';
import { addTrees, streetLamp, bench, planter, ipMascot, zebra, bollard } from './props.js';
import { COLORS } from '../theme.js';
import { windowTextures, rng, labelTexture } from '../textures.js';

export function buildSite(ctx) {
  const { layout, mats } = ctx;
  const S = layout.site;
  const G = ctx.site.group;
  const B = ctx.site.batch;

  const building = rectPoly(rect(-60, -40, 60, 40));
  const trenches = S.trenches.map(rectPoly);

  // 草地（挖掉建筑与坡道敞开段）
  const groundShape = shapeFromPoly([[-900, -900], [900, -900], [900, 900], [-900, 900]], [building, ...trenches]);
  const grass = mats.floor('grass', 0.95);
  const ground = new THREE.Mesh(flatShapeGeometry(groundShape, -0.32), grass);
  ground.receiveShadow = true;
  G.add(ground);

  // 广场铺装
  const P = S.plaza;
  const plazaShape = shapeFromPoly(rectPoly(P), [building, ...trenches]);
  const plaza = new THREE.Mesh(flatShapeGeometry(plazaShape, -0.14), mats.floor('paving', 0.75));
  plaza.receiveShadow = true;
  G.add(plaza);

  roads(ctx, S, B, G);
  southPlaza(ctx, S, B);
  entrances(ctx);
  northYard(ctx, S, B);
  garageGates(ctx, S, B);
  context(ctx, G);

  // 行道树与路灯
  const trees = [];
  const rand = rng(11);
  for (let x = -250; x <= 250; x += 12) {
    for (const z of [64, 92]) if (Math.abs(x) > 6 || z === 92) trees.push({ x: x + (rand() - 0.5), y: -0.14, z, s: 0.9 + rand() * 0.3 });
    if (Math.abs(x) > 80 || x < -78 || x > 78) trees.push({ x, y: -0.14, z: -78, s: 0.8 + rand() * 0.3 });
  }
  for (let z = -250; z <= 250; z += 12) {
    if (z > 60 && z < 96) continue;
    if (z > -80 && z < -62) continue;
    for (const x of [-80, 80, -100, 100]) trees.push({ x, y: -0.14, z: z + (rand() - 0.5), s: 0.85 + rand() * 0.3 });
  }
  // 广场树阵
  for (const [x, z] of [[-70, -30], [-70, -15], [-70, 15], [-70, 30], [70, -30], [70, -15], [70, 15], [70, 30], [-34, -56], [34, -56], [-50, 58], [50, 48], [-64, 50], [64, 56]]) {
    trees.push({ x, y: -0.14, z, s: 1.1 });
  }
  addTrees(G, mats, trees, 21);
  for (let x = -240; x <= 240; x += 26) {
    streetLamp(B, x, 63.4, -0.14, [0, 1]);
    streetLamp(B, x, 92.6, -0.14, [0, -1]);
    streetLamp(B, x, -62.6, -0.14, [0, -1]);
  }
  for (let z = -240; z <= 240; z += 26) {
    if (z > 62 && z < 94) continue;
    streetLamp(B, -79.4, z, -0.14, [-1, 0]);
    streetLamp(B, 79.4, z, -0.14, [1, 0]);
  }
}

function roads(ctx, S, B, G) {
  const asphalt = ctx.mats.floor('asphalt', 0.9);
  const yR = -0.12;
  const pieces = [];
  const south = S.roads.find((r) => r.id === 'south').rect;
  const north = S.roads.find((r) => r.id === 'north').rect;
  const west = S.roads.find((r) => r.id === 'west').rect;
  const east = S.roads.find((r) => r.id === 'east').rect;
  pieces.push(south, north);
  for (const v of [west, east]) {
    pieces.push(rect(v.x0, v.z0, v.x1, north.z0), rect(v.x0, north.z1, v.x1, south.z0), rect(v.x0, south.z1, v.x1, v.z1));
  }
  for (const d of S.driveways) pieces.push(d);
  for (const r of pieces) {
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
    // 让贴图按世界坐标平铺
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (r.x0 + uv.getX(i) * (r.x1 - r.x0)) / 8, (r.z0 + (1 - uv.getY(i)) * (r.z1 - r.z0)) / 8);
    asphalt.map.repeat.set(1, 1);
    const m = new THREE.Mesh(g, asphalt);
    m.position.set((r.x0 + r.x1) / 2, yR + (S.driveways.includes(r) ? 0.006 : 0), (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    G.add(m);
  }
  const y = yR + 0.012;
  const white = '#ecebe6', yellow = '#e7b416';
  // 横向道路：中心双黄线 + 车道虚线
  for (const road of [south, north]) {
    const cz = (road.z0 + road.z1) / 2;
    const lanes = road === south ? 6 : 2;
    const lw = (road.z1 - road.z0) / lanes;
    for (const off of [-0.12, 0.12]) B.get('ext').box(0, y, cz + off, road.x1 - road.x0, 0.02, 0.12, yellow);
    for (let k = 1; k < lanes; k++) {
      if (k === lanes / 2) continue;
      const z = road.z0 + k * lw;
      for (let x = road.x0 + 2; x < road.x1 - 4; x += 9) {
        if (x > west.x0 - 4 && x < west.x1 + 4) continue;
        if (x > east.x0 - 4 && x < east.x1 + 4) continue;
        B.get('ext').box(x + 1.5, y, z, 3, 0.02, 0.14, white);
      }
    }
  }
  for (const road of [west, east]) {
    const cx = (road.x0 + road.x1) / 2;
    const lw = (road.x1 - road.x0) / 4;
    for (const seg of [[road.z0, north.z0], [north.z1, south.z0], [south.z1, road.z1]]) {
      const cz = (seg[0] + seg[1]) / 2, len = seg[1] - seg[0];
      for (const off of [-0.12, 0.12]) B.get('ext').box(cx + off, y, cz, 0.12, 0.02, len - 8, yellow);
      for (const k of [1, 3]) {
        for (let z = seg[0] + 6; z < seg[1] - 6; z += 9) B.get('ext').box(road.x0 + k * lw, y, z + 1.5, 0.14, 0.02, 3, white);
      }
    }
  }
  // 斑马线：南门正对、四个路口
  zebra(B, 0, (south.z0 + south.z1) / 2, 12, south.z1 - south.z0 - 1, 'z', y);
  for (const road of [west, east]) {
    zebra(B, (road.x0 + road.x1) / 2, south.z0 - 3, road.x1 - road.x0 - 1, 4, 'x', y);
    zebra(B, (road.x0 + road.x1) / 2, north.z1 + 3, road.x1 - road.x0 - 1, 4, 'x', y);
  }
  // 人行道路缘石
  const curb = (x0, z0, x1, z1) => B.get('ext').boxMinMax(x0, -0.14, z0, x1, 0.02, z1, '#c9c5bc');
  curb(-260, south.z0 - 0.3, 260, south.z0);
  curb(-260, south.z1, 260, south.z1 + 0.3);
  curb(-260, north.z1, 260, north.z1 + 0.3);
  curb(-260, north.z0 - 0.3, 260, north.z0);
  // 外侧人行道
  const walk = ctx.mats.floor('paving', 0.8);
  for (const r of [rect(-260, south.z1, 260, south.z1 + 6), rect(-260, north.z0 - 6, 260, north.z0), rect(west.x0 - 6, -260, west.x0, 260), rect(east.x1, -260, east.x1 + 6, 260)]) {
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (r.x0 + uv.getX(i) * (r.x1 - r.x0)) / 4.8, (r.z0 + (1 - uv.getY(i)) * (r.z1 - r.z0)) / 4.8);
    const m = new THREE.Mesh(g, walk);
    m.position.set((r.x0 + r.x1) / 2, -0.135, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    G.add(m);
  }
}

function southPlaza(ctx, S, B) {
  const y = -0.14;
  // 喷泉
  const f = S.fountain;
  B.get('extSatin').cyl(f.x, y, f.z, f.r, 0.55, COLORS.stoneDark, 24);
  B.get('water').cyl(f.x, y + 0.05, f.z, f.r - 0.35, 0.45, '#ffffff', 24);
  B.get('extSatin').cyl(f.x, y, f.z, 1.2, 1.2, COLORS.stone, 16);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    B.get('glass').cyl(f.x + Math.cos(a) * 3.2, y + 0.5, f.z + Math.sin(a) * 3.2, 0.08, 1.6 + (i % 3) * 0.5, '#ffffff', 6);
  }
  B.get('glass').cyl(f.x, y + 1.2, f.z, 0.18, 3.2, '#ffffff', 8);
  // IP 雕塑
  ipMascot(B, S.southIP.x, y, S.southIP.z, S.southIP.scale, -0.35);
  // 立牌
  const m = S.monument;
  B.get('extSatin').box(m.x, y + 2.2, m.z, 9, 4.4, 1.4, '#2d3339');
  B.get('glow').box(m.x, y + 0.25, m.z, 9.2, 0.08, 1.5, COLORS.led);
  const lab = labelTexture('云澜汇', { bg: 'rgba(0,0,0,0)', fg: '#ffffff', sub: 'YUNLAN MALL' });
  const mat = ctx.mats.screen(lab.texture, 0.95, 1.4);
  mat.transparent = true;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.4 * lab.aspect, 3.4), mat);
  plane.position.set(m.x, y + 2.4, m.z + 0.72);
  ctx.site.group.add(plane);
  // 花坛与长椅
  for (const x of [-48, -32, 32, 48]) planter(B, x - 4, 44, x + 4, 48, y, x + 100);
  for (const x of [-40, -24, 24, 40]) { bench(B, x, y, 50.5, 0); bench(B, x, y, 53.5, Math.PI); }
  for (let x = -54; x <= 54; x += 6) if (Math.abs(x) > 10) bollard(B, x, 41.6, y);
  // 公交站
  const bs = S.busStop;
  B.get('extMetal').box(bs.x, y + 1.5, bs.z + 0.9, 8, 3, 0.08, '#4b5563');
  B.get('glass').box(bs.x, y + 1.4, bs.z + 0.85, 7.8, 2.4, 0.04, '#ffffff');
  B.get('extMetal').box(bs.x, y + 3.05, bs.z, 8.4, 0.12, 2.4, '#2f3439');
  B.get('glow').box(bs.x + 3.2, y + 1.6, bs.z + 0.95, 1.2, 1.8, 0.05, '#cfe8ff');
  bench(B, bs.x - 1.5, y, bs.z + 0.2, Math.PI);
  // 非机动车停车
  for (let i = 0; i < 12; i++) B.get('extMetal').box(-28 + i * 0.9, y + 0.4, 60.5, 0.05, 0.8, 0.8, '#6b7280');
}

/** 四个人行入口：雨棚 + 玻璃门（南门主入口带旋转门） */
function entrances(ctx) {
  const L = ctx.levels['1F'];
  const F = L.facadeBatch;
  for (const e of ctx.layout.entrances) {
    const main = e.main;
    const width = e.width;
    const depth = main ? 7 : 4.5;
    const hY = main ? 4.9 : 4.4;
    const alongX = e.side === 'S' || e.side === 'N';
    const out = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[e.side];
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    const cw = width + (main ? 8 : 4);
    // 雨棚
    const cx = mx + out[0] * depth / 2, cz = mz + out[1] * depth / 2;
    F.get('glass').box(cx, hY, cz, alongX ? cw : depth, 0.06, alongX ? depth : cw, 0xffffff);
    F.get('extMetal').box(cx, hY + 0.18, cz, alongX ? cw + 0.2 : depth + 0.1, 0.28, alongX ? depth + 0.1 : cw + 0.2, COLORS.white);
    const edgeX = mx + out[0] * depth, edgeZ = mz + out[1] * depth;
    F.get('glow').box(edgeX, hY + 0.05, edgeZ, alongX ? cw : 0.08, 0.05, alongX ? 0.08 : cw, COLORS.led);
    for (const k of [-1, 1]) {
      const px = alongX ? mx + k * (cw / 2 - 0.6) : edgeX - out[0] * 0.4;
      const pz = alongX ? edgeZ - out[1] * 0.4 : mz + k * (cw / 2 - 0.6);
      F.get('extMetal').cyl(px, 0, pz, 0.16, hY, COLORS.steel, 12);
    }
    // 门：玻璃门扇 + 门框
    const n = Math.round(width / 2);
    for (let i = 0; i < n; i++) {
      const a = -width / 2 + (i + 0.5) * (width / n);
      if (main && Math.abs(a) < 2.2) continue;
      const px = alongX ? mx + a : mx, pz = alongX ? mz : mz + a;
      const open = i % 3 === 1;
      if (!open) F.get('glass').box(px, 2.0, pz, alongX ? width / n - 0.1 : 0.05, 3.9, alongX ? 0.05 : width / n - 0.1, 0xffffff);
      F.get('extMetal').box(alongX ? px - width / n / 2 : px, 2.0, alongX ? pz : pz - width / n / 2, 0.08, 4.0, 0.08, COLORS.glassFrame);
    }
    if (main) {
      // 旋转门
      F.get('glass').cyl(mx, 0.02, mz, 2.0, 3.0, 0xffffff, 24);
      F.get('extMetal').cyl(mx, 3.0, mz, 2.1, 0.35, COLORS.steel, 24);
      F.get('extMetal').cyl(mx, 0.0, mz, 2.1, 0.06, COLORS.steel, 24);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI + 0.3;
        F.get('glass').box(mx, 1.5, mz, 3.9, 2.9, 0.04, 0xffffff, a);
      }
      // 台阶与无障碍坡道
      ctx.site.batch.get('extSatin').box(mx, -0.07, mz + 2.5, width + 6, 0.14, 5, COLORS.stone);
    }
    // 门头标识
    const text = e.name.replace(' · ', ' ');
    const lab = labelTexture(text, { bg: 'rgba(15,111,134,0.95)', fg: '#ffffff', icon: 'info', accent: '#a5ecff' });
    const mat = ctx.mats.screen(lab.texture, 0.95, 1.35);
    mat.transparent = true;
    const h = main ? 1.1 : 0.8;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(h * lab.aspect, h), mat);
    plane.position.set(edgeX + out[0] * 0.08, hY + 0.75, edgeZ + out[1] * 0.08);
    plane.rotation.y = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }[e.side];
    L.facade.add(plane);
  }
}

/** 北侧：卸货区货车、卸货平台 */
function northYard(ctx, S, B) {
  const y = -0.14;
  const ld = S.loading;
  B.get('ext').box((ld.x0 + ld.x1) / 2, y + 0.6, -41, ld.x1 - ld.x0, 1.2, 2, '#8d9298');
  for (let x = ld.x0 + 1; x < ld.x1; x += 2.2) B.get('ext').box(x, y + 0.02, -46, 0.15, 0.03, 8, '#e7b416');
  // 货车
  const tx = 16, tz = -48.5;
  B.get('ext').box(tx, y + 2.1, tz, 2.5, 2.8, 7.5, '#f2f2ee');
  B.get('ext').box(tx, y + 1.5, tz - 4.9, 2.4, 2.2, 2.2, '#2f6fd6');
  B.get('glass').box(tx, y + 2.0, tz - 6.0, 2.2, 0.9, 0.05, 0xffffff);
  for (const [dx, dz] of [[-1.2, -4.8], [1.2, -4.8], [-1.2, 1.5], [1.2, 1.5], [-1.2, 3], [1.2, 3]]) B.get('ext').box(tx + dx, y + 0.45, tz + dz, 0.4, 0.9, 0.9, '#1d2023');
  B.get('glow').box(tx, y + 3.6, tz, 2.0, 0.05, 6, '#ffd9a0');
}

/** 车库出入口：道闸、岗亭、限高架、P 灯箱 */
function garageGates(ctx, S, B) {
  const y = -0.14;
  const gates = [
    { x: -66, z: -49.5, label: '车库入口', sub: 'P · ENTRANCE', icon: 'parking', dir: 1 },
    { x: 66, z: -49.5, label: '车库出口', sub: 'P · EXIT', icon: 'parking', dir: -1 },
  ];
  for (const g of gates) {
    // 限高架
    for (const dz of [-3.2, 3.2]) B.get('extMetal').cyl(g.x, y, g.z + dz, 0.14, 3.0, '#e7b416', 8);
    B.get('extMetal').box(g.x, y + 2.9, g.z, 0.3, 0.35, 6.8, '#e7b416');
    for (let i = 0; i < 6; i++) B.get('ext').box(g.x + 0.16, y + 2.9, g.z - 2.75 + i * 1.1, 0.02, 0.36, 0.55, i % 2 ? '#1d2023' : '#e7b416');
    // 道闸
    const bx = g.x + g.dir * 3;
    B.get('extMetal').box(bx, y + 0.55, g.z + 2.6, 0.45, 1.1, 0.45, '#d9dde0');
    B.get('ext').box(bx, y + 1.05, g.z - 0.2, 0.12, 0.12, 5.4, '#e8352b');
    for (let i = 0; i < 5; i++) B.get('ext').box(bx, y + 1.05, g.z - 2.4 + i * 1.1, 0.13, 0.13, 0.5, '#ffffff');
    // 岗亭
    B.get('ext').box(bx, y + 1.4, g.z + 4.8, 2.2, 2.8, 2.2, '#e9ecef');
    B.get('glass').box(bx, y + 1.7, g.z + 3.69, 1.8, 1.2, 0.04, 0xffffff);
    // P 灯箱
    const lab = labelTexture(g.label, { bg: 'rgba(29,78,216,0.96)', fg: '#ffffff', icon: g.icon, sub: g.sub });
    const mat = ctx.mats.screen(lab.texture, 1.0, 1.45);
    const h = 2.2;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(h * lab.aspect, h), mat);
    const px = g.x - g.dir * 2;
    plane.position.set(px, y + 5.2, g.z - 5.6);
    plane.rotation.y = g.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    const back = plane.clone();
    back.rotation.y += Math.PI;
    ctx.site.group.add(plane, back);
    B.get('extMetal').cyl(px, y, g.z - 5.6, 0.12, 4.0, '#3b4046', 8);
  }
  // 坡道敞开段的雨棚
  for (const t of S.trenches) {
    const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
    const near = cx < 0 ? t.x0 : t.x1;
    const cover = 10;
    const x0 = cx < 0 ? near : near - cover, x1 = cx < 0 ? near + cover : near;
    B.get('glass').boxMinMax(x0, 4.2, t.z0 - 0.4, x1, 4.26, t.z1 + 0.4, 0xffffff);
    B.get('extMetal').boxMinMax(x0, 4.26, t.z0 - 0.5, x1, 4.5, t.z0 - 0.3, COLORS.white);
    B.get('extMetal').boxMinMax(x0, 4.26, t.z1 + 0.3, x1, 4.5, t.z1 + 0.5, COLORS.white);
    for (let x = x0 + 1; x <= x1; x += 4.5) for (const z of [t.z0 - 0.4, t.z1 + 0.4]) B.get('extMetal').cyl(x, 0, z, 0.1, 4.2, COLORS.white, 8);
    // 敞开段两侧护栏
    for (const z of [t.z0 - 0.15, t.z1 + 0.15]) B.get('ext').boxMinMax(t.x0, -0.14, z - 0.15, t.x1, 1.05, z + 0.15, COLORS.concrete);
  }
}

/** 周边楼宇体块（带窗格贴图，夜间窗户发光） */
function context(ctx, G) {
  const rand = rng(42);
  const spots = [];
  // 只放在北、东北、西北、西侧的远处，避免遮挡从东南方向看过来的主视角
  for (const [x0, x1, z0, z1] of [[-460, -170, -420, -150], [170, 460, -420, -150], [-150, 150, -440, -170], [-470, -190, -120, 160], [190, 470, -140, 40]]) {
    for (let i = 0; i < 5; i++) spots.push([x0 + rand() * (x1 - x0), z0 + rand() * (z1 - z0)]);
  }
  const tints = ['#9fb3c2', '#a9b8c0', '#b4c1c9', '#93a7b8'];
  const mats = [];
  for (let k = 0; k < 4; k++) {
    const tx = windowTextures(100 + k, { tint: tints[k] });
    const m = new THREE.MeshStandardMaterial({ map: tx.map, emissiveMap: tx.emissive, emissive: 0x000000, roughness: 0.55, metalness: 0.2 });
    ctx.mats.onNight((t) => m.emissive.setScalar(t * 0.5));
    mats.push(m);
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x, z] of spots) {
    const w = 24 + rand() * 30, d = 22 + rand() * 26, h = 28 + rand() * 90;
    const mat = mats[Math.floor(rand() * mats.length)];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2 - 0.3, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // 按尺寸调整贴图平铺
    G.add(mesh);
  }
}
