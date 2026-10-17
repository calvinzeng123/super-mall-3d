// 云环天桥：环形箱梁（白色铝板包覆）+ 桥面铺装、内外玻璃栏板与扶手、玻璃顶棚（钢立柱 + 径向檩条）、夜间灯带、
// 支柱（带柱帽的圆柱）、四条连廊、两座落地塔（钢框玻璃盒、折返楼梯、玻璃电梯、户外扶梯）与桥上行人。
// 全部放在场地组（园区、单期、楼上楼层视角都可见）。
import * as THREE from 'three';
import { toW } from '../../layout/geom.js';
import { COLORS } from '../theme.js';
import { drawEscalator, stripGeometry } from './escalators.js';
import { bridgePaths, polyline } from '../paths.js';
import { rng } from '../textures.js';
import { BatchSet } from '../batch.js';
import { buildBridgeStairGeometry } from './bridge-stairs.js';

const WHITE = '#eef1f3';
const STEEL = '#3a4047';
const LED = '#a5ecff';

function ringShape(r0, r1) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, 0, Math.PI * 2, false);
  const h = new THREE.Path();
  h.absarc(0, 0, r0, 0, Math.PI * 2, true);
  s.holes.push(h);
  return s;
}

export function buildBridges(ctx) {
  const br = ctx.layout.bridges;
  if (!br) return;
  const G = new THREE.Group();
  G.name = 'bridges';
  ctx.site.group.add(G);
  const B = new BatchSet(ctx.mats.base);
  const { y, thick, R } = br;
  const r0 = R - br.width / 2, r1 = R + br.width / 2;
  const yb = y - thick;

  // ---------- 环形箱梁与桥面 ----------
  const bodyMat = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.32, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape(r0, r1), { depth: thick, bevelEnabled: false, curveSegments: 96 }).rotateX(-Math.PI / 2).translate(0, yb, 0), bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  const deckGeo = new THREE.ShapeGeometry(ringShape(r0 + 0.05, r1 - 0.05), 96);
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.translate(0, y + 0.02, 0);
  const deck = new THREE.Mesh(deckGeo, ctx.mats.floor('deck-garden', 0.6));
  deck.receiveShadow = true;
  G.add(body, deck);

  const mouths = br.links.map((k) => (k.deg * Math.PI) / 180);
  const inMouth = (a, r) => mouths.some((m) => Math.abs(Math.atan2(Math.sin(a - m), Math.cos(a - m))) < Math.asin((br.linkWidth / 2 + 0.25) / r));
  const N = 120;
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const ry = -a + Math.PI / 2;
    for (const [r, side] of [[r0 + 0.12, -1], [r1 - 0.12, 1]]) {
      const seg = (2 * Math.PI * r) / N;
      // 侧面灯带（箱梁外侧中部）
      B.get('glow').box(ca * (r + side * 0.14), yb + thick * 0.45, sa * (r + side * 0.14), seg + 0.02, 0.06, 0.03, LED, ry);
      if (side > 0 && inMouth(a, r)) continue;
      B.get('glass').box(ca * r, y + 0.6, sa * r, seg + 0.01, 1.05, 0.03, 0xffffff, ry);
      B.get('extMetal').box(ca * r, y + 1.12, sa * r, seg + 0.02, 0.06, 0.1, STEEL, ry);
      if (i % 4 === 0) B.get('extMetal').box(ca * r, y + 0.56, sa * r, 0.06, 1.12, 0.06, STEEL);
    }
  }
  // 顶棚：内外两圈立柱 + 径向檩条 + 玻璃环 + 檐口灯带
  const yc = y + 3.6;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    B.get('extMetal').cyl(ca * (r0 + 0.35), y, sa * (r0 + 0.35), 0.09, yc - y, STEEL, 8);
    if (!inMouth(a, r1)) B.get('extMetal').cyl(ca * (r1 - 0.35), y, sa * (r1 - 0.35), 0.09, yc - y, STEEL, 8);
    B.get('extMetal').bar({ x: ca * (r0 - 0.3), y: yc + 0.05, z: sa * (r0 - 0.3) }, { x: ca * (r1 + 0.3), y: yc + 0.25, z: sa * (r1 + 0.3) }, 0.12, WHITE);
  }
  const roofGeo = new THREE.ExtrudeGeometry(ringShape(r0 - 0.3, r1 + 0.3), { depth: 0.04, bevelEnabled: false, curveSegments: 96 }).rotateX(-Math.PI / 2).translate(0, yc + 0.2, 0);
  const roofMesh = new THREE.Mesh(roofGeo, ctx.mats.base.glass);
  roofMesh.renderOrder = 2;
  G.add(roofMesh);
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    for (const r of [r0 - 0.3, r1 + 0.3]) {
      const seg = (2 * Math.PI * r) / N;
      B.get('extMetal').box(Math.cos(a) * r, yc + 0.12, Math.sin(a) * r, seg + 0.02, 0.18, 0.14, WHITE, -a + Math.PI / 2);
      B.get('glow').box(Math.cos(a) * r, yc + 0.0, Math.sin(a) * r, seg + 0.02, 0.04, 0.05, '#ffe2b0', -a + Math.PI / 2);
    }
  }

  // ---------- 支柱 ----------
  for (const s of br.supports) {
    const median = Math.abs(s.z) <= 2;
    const g0 = median ? 0.1 : -0.14;
    B.get('extSatin').cyl(s.x, g0, s.z, 1.1, 0.4, COLORS.stoneDark, 20);
    B.get('extSatin').cyl(s.x, g0, s.z, 0.75, yb - 0.9 - g0, '#e4e4df', 20);
    B.get('extSatin').cone(s.x, yb - 0.95, s.z, 1.6, 0.95, '#e4e4df', 20);
    B.get('extSatin').box(s.x, yb - 0.08, s.z, 3.2, 0.16, 3.2, '#d9dbd8');
  }

  // ---------- 连廊 ----------
  for (const k of br.links) {
    const ua = Math.sqrt(r1 * r1 - (br.linkWidth / 2) ** 2) - 0.4;
    const ub = k.tower ? k.u1 - 1 + 0.2 : k.u1;
    const hw = br.linkWidth / 2;
    const L = ub - ua;
    B.frame(k.frame, () => {
      B.get('extSatin').box(ua + L / 2, yb + thick / 2, 0, L, thick, br.linkWidth, WHITE);
      B.get('ext').box(ua + L / 2, y + 0.015, 0, L, 0.03, br.linkWidth - 0.1, '#9c6a43');
      for (const s of [-1, 1]) {
        B.get('glass').box(ua + L / 2 + 0.3, y + 0.6, s * (hw - 0.1), L - 0.6, 1.05, 0.03, 0xffffff);
        B.get('extMetal').box(ua + L / 2 + 0.3, y + 1.12, s * (hw - 0.1), L - 0.6, 0.06, 0.1, STEEL);
        B.get('glow').box(ua + L / 2, yb + thick * 0.45, s * (hw + 0.02), L, 0.06, 0.03, LED);
        for (let u = ua + 1.5; u < ub - 0.5; u += 4.5) B.get('extMetal').cyl(u, y, s * (hw - 0.3), 0.09, yc - y, STEEL, 8);
        B.get('extMetal').box(ua + L / 2, yc + 0.12, s * (hw + 0.2), L, 0.18, 0.14, WHITE);
        B.get('glow').box(ua + L / 2, yc, s * (hw + 0.2), L, 0.04, 0.05, '#ffe2b0');
      }
      for (let u = ua + 1.5; u < ub; u += 2.25) B.get('extMetal').box(u, yc + 0.12, 0, 0.1, 0.12, br.linkWidth + 0.5, WHITE);
    });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L, 0.04, br.linkWidth + 0.5), ctx.mats.base.glass);
    const [cx, cz] = toW(k.frame, ua + L / 2, 0);
    roof.position.set(cx, yc + 0.2, cz);
    roof.rotation.y = -k.frame.a;
    roof.renderOrder = 2;
    G.add(roof);
  }

  // ---------- 落地塔 ----------
  const strips = { up: [], down: [] };
  for (const T of br.towers) strips.up.push(...tower(ctx, B, G, br, T, strips));
  for (const dir of ['up', 'down']) {
    if (!strips[dir].length) continue;
    const mesh = new THREE.Mesh(stripGeometry(strips[dir]), ctx.mats.steps[dir]);
    mesh.receiveShadow = true;
    G.add(mesh);
  }
  B.flush(G);
  walkers(ctx, G, br);
  picks(ctx, br);
}

/** 落地塔：钢框玻璃盒、楼板（留楼梯井与电梯井）、屋顶、折返楼梯、玻璃电梯（动画）、户外扶梯 */
export function tower(ctx, B, G, br, T, strips) {
  const F = T.frame;
  const { y } = br;
  const r = T.rect;
  const tc = (r.x0 + r.x1) / 2;
  const s = T.side;
  const H = y + 4.1;
  B.frame(F, () => {
    // 地面铺装与楼板
    B.get('extSatin').box(tc, 0.04, 0, r.x1 - r.x0 + 1.2, 0.08, r.z1 - r.z0 + 1.2, '#cfc8bb');
    for (const piece of T.deckPieces) {
      const r=piece.rect,t=piece.thickness;
      B.get('extSatin').box((r.x0+r.x1)/2,y-t/2,(r.z0+r.z1)/2,r.x1-r.x0,t,r.z1-r.z0,WHITE);
      B.get('ext').box((r.x0+r.x1)/2,y+.015,(r.z0+r.z1)/2,r.x1-r.x0,.03,r.z1-r.z0,'#9c6a43');
    }
    // 钢框
    for (const [u, v] of [[r.x0, r.z0], [r.x0, r.z1], [r.x1, r.z0], [r.x1, r.z1], [r.x1, 0], [tc, r.z0], [tc, r.z1]]) B.get('extMetal').box(u, H / 2, v, 0.3, H, 0.3, STEEL);
    for (const yy of [3.4, y - 0.5, H]) {
      for (const v of [r.z0, r.z1]) B.get('extMetal').box(tc, yy, v, r.x1 - r.x0, 0.22, 0.22, STEEL);
      for (const u of [r.x0, r.x1]) B.get('extMetal').box(u, yy, 0, 0.22, 0.22, r.z1 - r.z0, STEEL);
    }
    // 玻璃幕墙（连廊口、扶梯口、地面出入口处断开）
    const pane = (u, v, along, a, b, yA, yB) => {
      if (along === 'u') B.get('glass').box((a + b) / 2, (yA + yB) / 2, v, b - a, yB - yA, 0.04, 0xffffff);
      else B.get('glass').box(u, (yA + yB) / 2, (a + b) / 2, 0.04, yB - yA, b - a, 0xffffff);
    };
    for (const [u, v, along, a0, a1, gaps] of [
      [r.x0, 0, 'v', r.z0, r.z1, [[-2.6, 2.6, y, H], [-2.2, 2.2, 0, 3.0]]],
      [r.x1, 0, 'v', r.z0, r.z1, []],
      [0, s * r.z1, 'u', r.x0, r.x1, [[tc - 4.1, tc + 0.1, y, H]]],
      [0, -s * r.z1, 'u', r.x0, r.x1, [[tc + 0.5, tc + 3.5, 0, 3.0]]],
    ]) {
      const step = 1.25;
      for (let t = a0; t < a1 - 0.01; t += step) {
        const tb = Math.min(a1, t + step);
        const tm = (t + tb) / 2;
        let segs = [[0.1, H - 0.1]];
        for (const [g0, g1, ya, yb2] of gaps) {
          if (tm > g0 && tm < g1) segs = segs.flatMap(([p, q]) => [[p, Math.min(q, ya)], [Math.max(p, yb2), q]]).filter(([p, q]) => q - p > 0.05);
        }
        for (const [ya, yb2] of segs) pane(u, v, along, t + 0.02, tb - 0.02, ya, yb2);
      }
    }
    // 屋顶 + 灯带
    B.get('ext').box(tc, H + 0.2, 0, r.x1 - r.x0 + 0.8, 0.4, r.z1 - r.z0 + 0.8, WHITE);
    for (const v of [r.z0 - 0.42, r.z1 + 0.42]) B.get('glow').box(tc, H + 0.12, v, r.x1 - r.x0 + 0.8, 0.06, 0.04, LED);
    // 电梯井
    const lu = tc + 3.4, lv = s * 2.5;
    for (const [du, dv] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]]) B.get('extMetal').box(lu + du, H / 2, lv + dv, 0.12, H, 0.12, STEEL);
    for (const [su, sv, ou, ov] of [[2.6, 0.03, 0, -1.3], [2.6, 0.03, 0, 1.3], [0.03, 2.6, 1.3, 0]]) B.get('glass').box(lu + ou, H / 2, lv + ov, su, H - 0.2, sv, 0xffffff);
  });
  buildBridgeStairGeometry(B,br,T);
  // 电梯轿厢
  const car = liftCar(ctx);
  const [lx, lz] = toW(F, tc + 3.4, s * 2.5);
  car.position.set(lx, 0, lz);
  car.rotation.y = -F.a;
  G.add(car);
  const period = 2 * (3.2 + y / 1.6 + 1.2);
  const phase = s > 0 ? 0 : period / 2;
  ctx.dynamic.push({
    update(dt, time) {
      const t = (time + phase) % period;
      const half = period / 2;
      const k = t < half ? Math.max(0, Math.min(1, (t - 3.2) / (half - 3.2))) : 1 - Math.max(0, Math.min(1, (t - half - 3.2) / (half - 3.2)));
      car.position.y = (k * k * (3 - 2 * k)) * y;
    },
  });
  // 户外扶梯（上行 / 下行）
  const out = [];
  for (const v of br.verticals.filter((x) => x.tower === T.id && x.type === 'escalator')) {
    const [bx, bz] = toW(F, v.lu, v.bottom.lv);
    const [tx, tz] = toW(F, v.lu, v.top.lv);
    const e = { bottom: { x: bx, y: 0, z: bz }, top: { x: tx, y, z: tz }, width: v.width };
    const strip = drawEscalator(B, e, '#c3c9cf');
    (v.dir === 'up' ? out : strips.down).push(strip);
  }
  return out;
}

function liftCar(ctx) {
  const car = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.4, metalness: 0.4 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), mat);
  floor.position.y = 0.075;
  const roof = floor.clone();
  roof.position.y = 2.6;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.35, 2.15), ctx.mats.base.glass);
  glass.position.y = 1.32;
  const light = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 1.6), ctx.mats.base.glow);
  light.position.y = 2.5;
  car.add(floor, roof, glass, light);
  return car;
}

/** 桥上行人：云环双向、连廊往返、扶梯乘客 */
function walkers(ctx, G, br) {
  const paths = bridgePaths(br);
  const n = 90;
  const bodyGeo = new THREE.CapsuleGeometry(0.21, 0.92, 3, 8).translate(0, 0.67, 0);
  const headGeo = new THREE.SphereGeometry(0.125, 10, 8).translate(0, 1.5, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), n);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), n);
  bodies.frustumCulled = false;
  heads.frustumCulled = false;
  const CL = ['#2f3a45', '#c0392b', '#2f6fd6', '#f2f2f0', '#e0a526', '#2e9c6a', '#7b4fd6', '#d1495b', '#8a6a4a', '#1f2328'];
  const SK = ['#f1d3b8', '#e8c1a0', '#d9a77f', '#c68e63'];
  const rand = rng(612);
  const c = new THREE.Color();
  const list = [];
  for (let i = 0; i < n; i++) {
    const onEsc = rand() < 0.12;
    const pool = paths.filter((p) => !!p.escalator === onEsc);
    const path = pool[Math.floor(rand() * pool.length)];
    const pl = polyline(path.pts, path.loop);
    list.push({ pl, loop: path.loop, esc: !!path.escalator, d: rand() * pl.total, speed: path.escalator ? 0.5 : 0.9 + rand() * 0.5, dir: path.loop && rand() < 0.5 ? -1 : 1, lateral: path.escalator ? 0 : (rand() - 0.5) * 2.6, phase: rand() * 10 });
    bodies.setColorAt(i, c.set(CL[Math.floor(rand() * CL.length)]));
    heads.setColorAt(i, c.set(SK[Math.floor(rand() * SK.length)]));
  }
  bodies.instanceColor.needsUpdate = true;
  heads.instanceColor.needsUpdate = true;
  G.add(bodies, heads);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const pos = [0, 0, 0], dir = [0, 0, 1];
  let acc = 0;
  ctx.dynamic.push({
    update(dt, time) {
      acc += dt;
      if (acc < 1 / 40 || !ctx.site.group.visible) return;
      const step = acc;
      acc = 0;
      list.forEach((a, i) => {
        a.d += a.speed * a.dir * step;
        if (!a.loop && (a.d > a.pl.total || a.d < 0)) a.d = a.dir > 0 ? 0 : a.pl.total;
        a.pl.at(a.d, pos, dir);
        const ln = Math.hypot(dir[0], dir[2]) || 1;
        const bob = a.esc ? 0 : Math.abs(Math.sin((time + a.phase) * 7)) * 0.035;
        p.set(pos[0] - (dir[2] / ln) * a.lateral, pos[1] - (a.esc ? 1.32 : 0.07) + bob, pos[2] + (dir[0] / ln) * a.lateral);
        q.setFromAxisAngle(up, Math.atan2(dir[0] * a.dir, dir[2] * a.dir));
        m.compose(p, q, sc);
        bodies.setMatrixAt(i, m);
        heads.setMatrixAt(i, m);
      });
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    },
  });
}

/** 拾取：云环、连廊、落地塔 */
function picks(ctx, br) {
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const ring = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape(br.R - br.width / 2, br.R + br.width / 2), { depth: 4.6, bevelEnabled: false, curveSegments: 48 }).rotateX(-Math.PI / 2).translate(0, br.y - br.thick, 0), mat);
  ring.userData = { kind: 'facility', title: '云环天桥', desc: '路口上空的环形步行桥 · 直径 68m · 桥面 6.5m · 连通四个地块' };
  ctx.site.picks.add(ring);
  for (const k of br.links) {
    const L = k.u1 - k.u0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, 4.6, br.linkWidth), mat);
    const [x, z] = toW(k.frame, (k.u0 + k.u1) / 2, 0);
    m.position.set(x, br.y - br.thick + 2.3, z);
    m.rotation.y = -k.frame.a;
    m.userData = { kind: 'facility', title: k.name, desc: k.building ? `云环 ↔ ${ctx.bById[k.building].name} 2F 天桥入口` : '云环 ↔ 落地塔（楼梯 · 扶梯 · 电梯）' };
    ctx.site.picks.add(m);
  }
  for (const T of br.towers) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(T.rect.x1 - T.rect.x0, br.y + 4.4, T.rect.z1 - T.rect.z0), mat);
    m.position.set(T.center[0], (br.y + 4.4) / 2, T.center[1]);
    m.rotation.y = -T.frame.a;
    m.userData = { kind: 'facility', title: T.name, desc: '折返楼梯 · 上下行扶梯 · 玻璃电梯 · 连接地面与云环' };
    ctx.site.picks.add(m);
  }
}
