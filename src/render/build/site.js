// 园区场地：草地（挖去建筑与坡道开口）、广场铺装、道路与标线（大道中央绿化带）、人行道与路缘石、斑马线、
// 行道树与路灯、入口雨棚与门（按入口法线）、车库道闸与灯箱、坡道护栏、卸货区、一期广场小品、园区外周边楼宇、未建地块围挡。
import * as THREE from 'three';
import { shapeFromPoly, flatShapeGeometry } from './shell.js';
import { cutSurfaceShapes, addCutSurfaceSlab } from './surface-shapes.js';
import { rect, rectPoly, frame, toW, toL, lrectPoly, pointInPoly, clipConvex, distToPolyEdge, polyArea, convexOverlap } from '../../layout/geom.js';
import { hubOutline } from '../../layout/hub.js';
import { addTrees, streetLamp, bench, planter, ipMascot, zebra, bollard } from './props.js';
import { COLORS } from '../theme.js';
import { rng, labelTexture, makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { buildUrbanDistrict } from './urban.js';
import { buildContextBuildings } from './context-buildings.js';
import { buildForecourt } from './forecourt.js';
import { buildWestParkingDetails } from './west-parking.js';
import { buildPlayableSite } from './playable-site.js';

const DEG = 180 / Math.PI;
/** 各期围合的铺装广场（椭圆）：渲染铺装与水景，并让草坪树阵避开 */
const COURTYARDS = { P2: { cx: 158, cz: -50, rx: 26, rz: 15 } };
const inCourtyard = (bid, [x, z], pad = 2) => {
  const c = COURTYARDS[bid];
  return !!c && ((x - c.cx) / (c.rx + pad)) ** 2 + ((z - c.cz) / (c.rz + pad)) ** 2 < 1;
};

/** 凸入口步道减去凸塔楼占地，交界处拆成实体铺装片，不把越界塔楼当作内洞。 */
export function subtractTowerFootprints(poly, footprints) {
  let pieces = [poly];
  for (const footprint of footprints) {
    const winding = Math.sign(polyArea(footprint)) || 1;
    pieces = pieces.flatMap(piece => {
      if (!convexOverlap(piece, footprint, 1e-8)) return [piece];
      let inside = piece;
      const outside = [];
      for (let i = 0; i < footprint.length && inside.length >= 3; i++) {
        const a = footprint[i], b = footprint[(i + 1) % footprint.length];
        const distance = p => winding * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
        const keep = [], cut = [];
        for (let j = 0; j < inside.length; j++) {
          const p = inside[j], q = inside[(j + 1) % inside.length], dp = distance(p), dq = distance(q);
          (dp >= 0 ? keep : cut).push(p);
          if ((dp >= 0) !== (dq >= 0)) {
            const t = dp / (dp - dq), hit = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
            keep.push(hit); cut.push(hit);
          }
        }
        if (cut.length >= 3 && Math.abs(polyArea(cut)) > 1e-7) outside.push(cut);
        inside = keep;
      }
      return outside;
    });
  }
  return pieces;
}

/** 斜向灯臂加方灯头的最远角约 2.24m；活动、停车和坡口仅保留边界外的灯杆。 */
export function siteLampPlacement(layout) {
  const towers = [...layout.buildings.filter(b => b.kind !== 'metro' && !b.undergroundOnly).map(b => b.outline), ...raisedConnections(layout)];
  const clear = siteActivityFootprints(layout);
  const near = (p, poly, margin) => pointInPoly(p, poly) || distToPolyEdge(p, poly) < margin;
  return (x, z) => !towers.some(poly => near([x, z], poly, 2.25)) && !clear.some(poly => near([x, z], poly, .45));
}

const raisedConnections = layout => [
  ...(layout.extensions?.gateways || []).filter(g => g.elev >= 0).map(g => g.poly),
  ...(layout.extensions?.paths || []).filter(p => p.kind === 'skybridge').flatMap(p => (p.slab?.pieces || []).map(s => s.outer)),
  ...layout.buildings.flatMap(b => (b.accessKiosks || []).map(r => lrectPoly(b.frame, r))),
  ...(layout.levels || []).flatMap(l => (l.garageKiosks || []).map(k => k.poly)),
];
const siteActivityFootprints = layout => {
  const S = layout.site, ext = layout.extensions;
  return [...(S.activityExclusions || []), ...(S.trenches || []), ...(S.openings || []), ...(S.driveways || []),
    ...(S.westParking?.poly ? [S.westParking.poly] : []),
    ...(S.crossings || []).map(c => c.poly), ...(ext?.surfaceParking || []).map(lot => lot.poly),
    ...(ext?.roads || []).flatMap(road => road.polys || []), ...(ext?.paths || []).filter(p => p.kind === 'ground').flatMap(p => p.polys || [])];
};

/** 使用抖动后的实际树心和树冠外包半径；不只检查树干中心是否落在楼内。 */
export function siteTreePlacement(layout) {
  const solids = [...layout.buildings.filter(b => b.kind !== 'metro' && !b.undergroundOnly).map(b => b.outline), ...raisedConnections(layout), ...siteActivityFootprints(layout)];
  return tree => {
    const p = [tree.x, tree.z], radius = (tree.kind === 'cone' ? 1.1 : 2.05) * (tree.s || 1) + .15;
    return !solids.some(poly => pointInPoly(p, poly) || distToPolyEdge(p, poly) < radius);
  };
}

/** 地下附库上方仍是场地，只给实际坡口和地铁梯井留洞。 */
export function siteGroundHoles(layout) {
  const S = layout.site;
  const outlines = layout.buildings.filter(b => b.kind !== 'metro' && !b.undergroundOnly).map(b => b.outline);
  // cutSurfaceShapes unions intersecting and duplicate cuts before triangulation.
  return [...outlines, ...S.trenches, ...(S.openings || [])];
}

export function buildSite(ctx) {
  const { layout, mats } = ctx;
  const S = layout.site;
  const G = ctx.site.group;
  const B = ctx.site.batch;
  const holes = siteGroundHoles(layout);
  if (layout.playable) { buildPlayableSite(ctx, holes); return; }

  // 草地
  const ground = new THREE.Mesh(flatShapeGeometry(cutSurfaceShapes([[-1500, -1500], [1500, -1500], [1500, 1500], [-1500, 1500]], holes), -0.32), mats.floor('grass', 0.95));
  ground.name = 'site-grass-cut';
  ground.receiveShadow = true;
  G.add(ground);
  // 广场：有地块的商场做"外扩铺装带 + 入口步道 + 草坪树阵"，其余广场整块铺装
  const landscaped = new Set();
  for (const b of layout.buildings) {
    if (b.kind === 'mall' && b.plot) {
      landscape(ctx, b, holes, G, B);
      landscaped.add(b.id);
    }
  }
  for (const p of S.plazas) {
    if (landscaped.has(p.building)) continue;
    const m = new THREE.Mesh(flatShapeGeometry(cutSurfaceShapes(p.poly, holes), -0.14), mats.floor('paving', 0.75));
    m.name = 'site-plaza-cut';
    m.receiveShadow = true;
    G.add(m);
  }

  roads(ctx, S, B, G);
  buildUrbanDistrict(ctx);
  entrances(ctx);
  garageGates(ctx, S, B);
  plazaFeatures(ctx, B);
  hoardings(ctx, S, B, G);
  context(ctx, G);
  greenery(ctx, S, B, G);
  buildForecourt(ctx);
  buildWestParkingDetails(ctx);
}

/** 商场地块景观：与建筑同形的外扩铺装带（裁到地块内）、入口步道（直通人行道或地块边）、草坪上的树阵与路灯 */
function landscape(ctx, b, holes, G, B) {
  const S = ctx.layout.site;
  const inset = (r, d) => rect(r.x0 + d, r.z0 + d, r.x1 - d, r.z1 - d);
  const plotIn = rectPoly(inset(b.plot, 2));
  const extendOf = (w) => {
    let lim = w.uEnd + 20;
    for (const t of S.trenches) {
      const loc = t.map(([x, z]) => toL(w.F, x, z));
      if (loc.every(([u, v]) => Math.abs(v) < 23 && u > w.uEnd - 1)) lim = Math.min(lim, Math.min(...loc.map((p) => p[0])) - 0.5);
    }
    return lim;
  };
  const rots = b.rotundas.map((r) => ({ id: r.id, x: r.x, z: r.z, R: r.R + 18 }));
  const arms = b.wings.map((w) => (w.link ? { id: w.id, rot: w.rot, to: w.to, deg: w.deg } : { id: w.id, rot: w.rot, deg: w.deg, uEnd: extendOf(w) }));
  const band = clipConvex(hubOutline(rots, arms, 41), plotIn);
  const pave = ctx.mats.floor('paving', 0.75);
  const m = new THREE.Mesh(flatShapeGeometry(cutSurfaceShapes(band, holes), -0.14), pave);
  m.name = 'site-landscape-cut';
  m.receiveShadow = true;
  G.add(m);
  // 入口步道：沿入口外法线直到地块边
  const paths = [];
  const towers = ctx.layout.buildings.filter(other => ['tower', 'annex'].includes(other.kind) && !other.undergroundOnly).map(other => other.outline);
  const allowLamp = siteLampPlacement(ctx.layout);
  for (const e of ctx.layout.entrances) {
    if (e.building !== b.id || e.to !== 'site') continue;
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    const F = frame(mx, mz, Math.atan2(e.nz, e.nx) * DEG);
    const hw = Math.max(3, e.width / 2);
    const strip = clipConvex([toW(F, 8, -hw), toW(F, 160, -hw), toW(F, 160, hw), toW(F, 8, hw)], plotIn);
    if (strip.length < 3) continue;
    for (const piece of subtractTowerFootprints(strip, towers)) {
      paths.push(piece);
      const pm = new THREE.Mesh(flatShapeGeometry(cutSurfaceShapes(piece, holes), -0.1), pave);
      pm.name = 'site-entry-path-cut';
      pm.receiveShadow = true;
      G.add(pm);
    }
    for (let u = 20; u < 160; u += 15) {
      const [x, z] = toW(F, u, 0);
      if (!pointInPoly([x, z], strip)) break;
      for (const k of [-1, 1]) {
        const [lx, lz] = toW(F, u, k * (hw + 0.6));
        if (!allowLamp(lx, lz)) continue;
        streetLamp(B, lx, lz, -0.14, [k * F.s, -k * F.c], 5);
      }
    }
  }
  // 草坪树阵：抖动网格，避开铺装带、步道、坡道、车道入口与地铁出入口
  const kiosks = ctx.layout.entrances.filter((e) => e.kiosk).map((e) => e.kiosk.poly);
  const rand = rng(b.id.length * 97 + 5);
  const trees = [];
  const allowTree = siteTreePlacement(ctx.layout);
  const otherBuildings = ctx.layout.buildings.filter((other) => other.id !== b.id && other.kind !== 'metro' && !other.undergroundOnly).map((other) => other.outline);
  const r = inset(b.plot, 6);
  const near = (p, poly) => pointInPoly(p, poly);
  for (let x = r.x0; x < r.x1; x += 10) {
    for (let z = r.z0; z < r.z1; z += 10) {
      if (rand() < 0.35) continue;
      const p = [x + (rand() - 0.5) * 6, z + (rand() - 0.5) * 6];
      const activities = [...(S.activityExclusions || []), ...(ctx.layout.extensions?.surfaceParking || []).map(p => p.poly)];
      if (near(p, band) || near(p, b.outline) || distToPolyEdge(p, b.outline) < 4 || otherBuildings.some((q) => near(p, q) || distToPolyEdge(p, q) < 3) || inCourtyard(b.id, p) || paths.some((q) => near(p, q)) || S.trenches.some((t) => near(p, t)) || S.driveways.some((d) => near(p, d)) || activities.some(q => near(p,q) || distToPolyEdge(p,q)<2) || kiosks.some((k) => near(p, k) || distToPolyEdge(p, k) < 3)) continue;
      const k = 3;
      if ([[k, 0], [-k, 0], [0, k], [0, -k]].some(([dx, dz]) => near([p[0] + dx, p[1] + dz], band) || paths.some((q) => near([p[0] + dx, p[1] + dz], q)))) continue;
      const tree = { x: p[0], y: -0.3, z: p[1], s: 0.85 + rand() * 0.5, kind: rand() < 0.3 ? 'cone' : 'round' };
      if (allowTree(tree)) trees.push(tree);
    }
  }
  addTrees(G, ctx.mats, trees, 61 + b.id.length);
}

const flatRect = (G, mat, r, y, tile, holes = []) => {
  const g = flatShapeGeometry(cutSurfaceShapes(rectPoly(r), holes), y);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  const m = new THREE.Mesh(g, mat);
  m.name = 'site-road-cut';
  m.receiveShadow = true;
  G.add(m);
  return m;
};

function roads(ctx, S, B, G) {
  const openings = [...S.trenches, ...(S.openings || [])];
  const asphalt = ctx.mats.floor('asphalt', 0.9);
  asphalt.map.repeat.set(1, 1);
  const R = Object.fromEntries(S.roads.map((r) => [r.id, r.rect]));
  const yR = -0.12;
  // 路面：交叉处只铺一次
  const pieces = [
    R.avenue, R['ring-n'], R['ring-s'], R['service-n'],
    rect(-10, -256, 10, -14), rect(-10, 14, 10, 256), rect(-10, -298, 10, -268), rect(-10, 268, 10, 298),
    rect(-298, -256, -286, -14), rect(-298, 14, -286, 256), rect(286, -256, 298, -14), rect(286, 14, 298, 256),
  ];
  for (const r of pieces) flatRect(G, asphalt, r, yR, 8, openings);
  for (const d of S.driveways) {
    const m = new THREE.Mesh(flatShapeGeometry(cutSurfaceShapes(d, openings), yR + 0.006), asphalt);
    m.name = 'site-driveway-cut';
    m.receiveShadow = true;
    G.add(m);
  }
  const y = yR + 0.012;
  const white = '#ecebe6', yellow = '#e7b416';
  const inX = (x) => Math.abs(x) < 17 || Math.abs(x) > 284;
  // 云澜大道：中央绿化隔离带 + 每向 3 车道
  const av = R.avenue;
  for (const seg of [[av.x0, -17], [17, av.x1]]) {
    const len = seg[1] - seg[0], cx = (seg[0] + seg[1]) / 2;
    B.get('ext').box(cx, -0.02, 0, len - 2, 0.2, 4, COLORS.stoneDark);
    B.get('foliage').box(cx, 0.12, 0, len - 2.4, 0.24, 3.4, '#5e8f45');
  }
  for (const z of [-10, -6, 6, 10]) {
    for (let x = av.x0 + 2; x < av.x1 - 4; x += 9) if (!inX(x) && !inX(x + 3)) B.get('ext').box(x + 1.5, y, z, 3, 0.02, 0.14, white);
  }
  for (const z of [-2.2, 2.2]) for (const seg of [[av.x0, -17], [17, av.x1]]) B.get('ext').box((seg[0] + seg[1]) / 2, y, z, seg[1] - seg[0] - 2, 0.02, 0.12, yellow);
  // 星湾路：双黄线 + 车道虚线
  for (const seg of [[-298, -20], [20, 298]]) {
    const cz = (seg[0] + seg[1]) / 2, len = seg[1] - seg[0];
    for (const off of [-0.12, 0.12]) B.get('ext').box(off, y, cz, 0.12, 0.02, len, yellow);
    for (const x of [-5, 5]) for (let z = seg[0] + 3; z < seg[1] - 3; z += 9) if (Math.abs(z + 170) > 8) B.get('ext').box(x, y, z + 1.5, 0.14, 0.02, 3, white);
  }
  // 外环与星湾北街：中心黄线
  for (const id of ['ring-n', 'ring-s']) {
    const r = R[id];
    B.get('ext').box(0, y, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 30, 0.02, 0.12, yellow);
  }
  for (const id of ['ring-w', 'ring-e']) {
    const r = R[id];
    for (const seg of [[-256, -20], [20, 256]]) B.get('ext').box((r.x0 + r.x1) / 2, y, (seg[0] + seg[1]) / 2, 0.12, 0.02, seg[1] - seg[0] - 4, yellow);
  }
  { const r = R['service-n']; B.get('ext').box((r.x0 + r.x1) / 2 + 4, y, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 12, 0.02, 0.12, yellow); }
  // 斑马线与停止线
  for (const c of S.crossings) {
    const r = c.rect;
    const paintY=(ctx.layout.extensions?.roads||[]).some(road=>road.polys.some(p=>convexOverlap(c.poly,p)))?.065:y;
    if(c.id.startsWith('west-cross-')){
      zebra(B,(r.x0+r.x1)/2,(r.z0+r.z1)/2,c.axis==='z'?r.x1-r.x0-.3:r.z1-r.z0-.3,c.axis==='z'?r.z1-r.z0-.3:r.x1-r.x0-.3,c.axis,paintY);continue;
    }
    if (c.axis === 'z') zebra(B, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 1, r.z1 - r.z0 - 4.4, 'z', paintY);
    else zebra(B, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.z1 - r.z0 - 1, r.x1 - r.x0 - 1, 'x', paintY);
  }
  for (const x of [-17.5, 17.5]) B.get('ext').box(x, y, x < 0 ? 8 : -8, 0.3, 0.02, 12, white);
  for (const z of [-21, 21]) B.get('ext').box(z < 0 ? -5 : 5, y, z, 10, 0.02, 0.3, white);
  // 人行道 + 路缘石
  const walk = ctx.mats.floor('paving', 0.8);
  for (const s of S.sidewalks) {
    flatRect(G, walk, s.rect, -0.135, 4.8, openings);
    const r = s.rect;
    const horiz = r.x1 - r.x0 > r.z1 - r.z0;
    if (horiz) for (const z of [r.z0, r.z1]) addCutSurfaceSlab(B, 'ext', rectPoly(rect(r.x0, z - .15, r.x1, z + .15)), openings, .02, .16, '#c9c5bc');
    else for (const x of [r.x0, r.x1]) addCutSurfaceSlab(B, 'ext', rectPoly(rect(x - .15, r.z0, x + .15, r.z1)), openings, .02, .16, '#c9c5bc');
  }
}

/** 人行入口：雨棚 + 玻璃门（主入口带旋转门与台阶）+ 门头标识；在以入口外法线为 u 轴的局部坐标系内绘制 */
function entrances(ctx) {
  for (const e of ctx.layout.entrances) {
    if (e.to !== 'site' || e.kiosk || e.coveredConnection) continue;
    const L = ctx.levels[e.level];
    const FB = L.facadeBatch;
    const main = e.main;
    const custom = L.lv.expansion && L.lv.expansion.zone !== 'main';
    const width = e.width;
    const depth = custom ? 3.1 : main ? 7 : 4.5;
    const hY = custom ? 4.05 : main ? 4.9 : 4.4;
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    const F = frame(mx, mz, Math.atan2(e.nz, e.nx) * DEG);
    const cw = width + (main ? 8 : 4);
    const y0 = L.lv.elev;
    if (!custom) FB.frame(F, () => {
      FB.get('glass').box(depth / 2, y0 + hY, 0, depth, 0.06, cw, 0xffffff);
      FB.get('extMetal').box(depth / 2, y0 + hY + 0.18, 0, depth + 0.1, 0.28, cw + 0.2, COLORS.white);
      FB.get('glow').box(depth, y0 + hY + 0.05, 0, 0.08, 0.05, cw, COLORS.led);
      for (const k of [-1, 1]) FB.get('extMetal').cyl(depth - 0.4, y0, k * (cw / 2 - 0.6), 0.16, hY, COLORS.steel, 12);
      const n = Math.max(2, Math.round(width / 2));
      for (let i = 0; i < n; i++) {
        const a = -width / 2 + (i + 0.5) * (width / n);
        if (main && Math.abs(a) < 2.2) continue;
        if (i % 3 !== 1) FB.get('glass').box(0, y0 + 2.0, a, 0.05, 3.9, width / n - 0.1, 0xffffff);
        FB.get('extMetal').box(0, y0 + 2.0, a - width / n / 2, 0.08, 4.0, 0.08, COLORS.glassFrame);
      }
      if (main) {
        FB.get('glass').cyl(0, y0 + 0.02, 0, 2.0, 3.0, 0xffffff, 24);
        FB.get('extMetal').cyl(0, y0 + 3.0, 0, 2.1, 0.35, COLORS.steel, 24);
        for (let k = 0; k < 4; k++) FB.get('glass').box(0, y0 + 1.5, 0, 3.9, 2.9, 0.04, 0xffffff, (k / 4) * Math.PI + 0.3);
        ctx.site.batch.frame(F, () => ctx.site.batch.get('extSatin').box(2.6, -0.07, 0, 5, 0.14, width + 6, COLORS.stone));
      }
    });
    const lab = labelTexture(e.name.replace(' · ', ' '), { bg: 'rgba(15,111,134,0.95)', fg: '#ffffff', icon: 'info', accent: '#a5ecff' });
    const mat = ctx.mats.screen(lab.texture, 0.95, 1.35);
    mat.transparent = true;
    const h = main ? 1.1 : 0.8;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(h * lab.aspect, h), mat);
    const [px, pz] = toW(F, depth + 0.08, 0);
    plane.position.set(px, y0 + hY + 0.75, pz);
    plane.rotation.y = Math.atan2(e.nx, e.nz);
    L.facade.add(plane);
  }
}

/** 车库出入口：限高架、道闸、岗亭、P 灯箱（在坡道地面端，沿坡道方向的局部坐标系）；坡道敞开段护栏 */
function garageGates(ctx, S, B) {
  const y = -0.14;
  for (const r of ctx.layout.ramps.filter((x) => x.type.startsWith('street'))) {
    const street = r.from.level === 'street' ? r.from : r.to;
    const other = r.from.level === 'street' ? r.to : r.from;
    const deg = Math.atan2(street.z - other.z, street.x - other.x) * DEG; // u 指向坡道外（地面方向）
    const F = frame(street.x, street.z, deg);
    const inbound = r.type === 'street-in';
    B.frame(F, () => {
      const g = 4;
      for (const dv of [-r.width / 2 - 0.4, r.width / 2 + 0.4]) B.get('extMetal').cyl(g, y, dv, 0.14, 3.0, '#e7b416', 8);
      B.get('extMetal').box(g, y + 2.9, 0, 0.3, 0.35, r.width + 1.2, '#e7b416');
      for (let i = 0; i < 6; i++) B.get('ext').box(g + 0.16, y + 2.9, -r.width / 2 + 0.4 + i * ((r.width - 0.8) / 5), 0.02, 0.36, 0.5, i % 2 ? '#1d2023' : '#e7b416');
      B.get('extMetal').box(1.5, y + 0.55, r.width / 2 + 0.6, 0.45, 1.1, 0.45, '#d9dde0');
      B.get('ext').box(1.5, y + 1.05, 0, 0.12, 0.12, r.width, '#e8352b');
      B.get('ext').box(1.6, y + 1.4, r.width / 2 + 2.4, 2.2, 2.8, 2.2, '#e9ecef');
      B.get('glass').box(1.6, y + 1.7, r.width / 2 + 1.29, 1.8, 1.2, 0.04, 0xffffff);
      B.get('extMetal').cyl(7, y, -r.width / 2 - 1.2, 0.12, 4.0, '#3b4046', 8);
    });
    const lab = labelTexture(inbound ? '车库入口' : '车库出口', { bg: 'rgba(29,78,216,0.96)', fg: '#ffffff', icon: 'parking', sub: inbound ? 'P · ENTRANCE' : 'P · EXIT' });
    const mat = ctx.mats.screen(lab.texture, 1.0, 1.45);
    const h = 2.0;
    const [px, pz] = toW(F, 7, -r.width / 2 - 1.2);
    for (const k of [0, Math.PI]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(h * lab.aspect, h), mat);
      plane.position.set(px, y + 5.0, pz);
      plane.rotation.y = -F.a + Math.PI / 2 + k;
      ctx.site.group.add(plane);
    }
  }
  // 坡道敞开段两侧矮墙
  for (const t of S.trenches) {
    for (let i = 0; i < t.length; i++) {
      const p0 = t[i], p1 = t[(i + 1) % t.length];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (len < 15) continue;
      const F = frame(p0[0], p0[1], Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * DEG);
      B.frame(F, () => {
        B.get('ext').box(len / 2, 0.45, 0, len, 1.2, 0.3, COLORS.concrete);
        B.get('glass').box(len / 2, 1.5, 0, len, 0.9, 0.04, 0xffffff);
        B.get('extMetal').box(len / 2, 1.98, 0, len, 0.06, 0.08, COLORS.steel);
      });
    }
  }
}

/** 一期广场：喷泉、IP 雕塑、立牌、卸货区货车、公交站；二期星湾广场：椭圆铺装、旱喷、座椅 */
function plazaFeatures(ctx, B) {
  const y = -0.14;
  if (ctx.bById.P2) starBayPlaza(ctx, B);
  const p1 = ctx.bById.P1;
  if (!p1) return;
  // 喷泉（东南主入口与路口之间，偏离天桥轴线）
  const f = { x: -30, z: -52, r: 6 };
  B.get('extSatin').cyl(f.x, y, f.z, f.r, 0.55, COLORS.stoneDark, 24);
  B.get('water').cyl(f.x, y + 0.05, f.z, f.r - 0.35, 0.45, '#ffffff', 24);
  B.get('extSatin').cyl(f.x, y, f.z, 1.2, 1.2, COLORS.stone, 16);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    B.get('glass').cyl(f.x + Math.cos(a) * 3.2, y + 0.5, f.z + Math.sin(a) * 3.2, 0.08, 1.6 + (i % 3) * 0.5, '#ffffff', 6);
  }
  B.get('glass').cyl(f.x, y + 1.2, f.z, 0.18, 3.2, '#ffffff', 8);
  ipMascot(B, -52, y, -30, 0.75, 0.6);
  // 立牌
  const m = { x: -24, z: -40 };
  const F = frame(m.x, m.z, 45);
  B.frame(F, () => {
    B.get('extSatin').box(0, y + 2.2, 0, 1.4, 4.4, 9, '#2d3339');
    B.get('glow').box(0, y + 0.25, 0, 1.5, 0.08, 9.2, COLORS.led);
  });
  const lab = labelTexture('云澜汇', { bg: 'rgba(0,0,0,0)', fg: '#ffffff', sub: 'YUNLAN MALL' });
  const mat = ctx.mats.screen(lab.texture, 0.95, 1.4);
  mat.transparent = true;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.4 * lab.aspect, 3.4), mat);
  const [px, pz] = toW(F, 0.72, 0);
  plane.position.set(px, y + 2.4, pz);
  plane.rotation.y = Math.atan2(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4));
  ctx.site.group.add(plane);
  // 花坛与长椅
  for (const [x, z] of [[-40, -64], [-64, -40], [-28, -70], [-70, -28]]) planter(B, x - 3, z - 2, x + 3, z + 2, y, x * 7 + z);
  for (const [x, z, r] of [[-36, -60, 0.8], [-60, -36, 2.4], [-24, -60, 0.8]]) bench(B, x, y, z, r);
  // 卸货区：北翼末端坡道旁
  const N = p1.wings.find((w) => w.id === 'N');
  if (N) {
    B.frame(N.F, () => {
      B.get('ext').box(N.uEnd + 1, y + 0.6, 12, 2, 1.2, 8, '#8d9298');
      for (let v = 9; v <= 15; v += 2.2) B.get('ext').box(N.uEnd + 6, y + 0.02, v, 8, 0.03, 0.15, '#e7b416');
      const tu = N.uEnd + 8.5, tv = 12;
      B.get('ext').box(tu, y + 2.1, tv, 7.5, 2.8, 2.5, '#f2f2ee');
      B.get('ext').box(tu + 4.9, y + 1.5, tv, 2.2, 2.2, 2.4, '#2f6fd6');
      B.get('glass').box(tu + 6.0, y + 2.0, tv, 0.05, 0.9, 2.2, 0xffffff);
      for (const [du, dv] of [[-3, -1.2], [-3, 1.2], [1.5, -1.2], [1.5, 1.2], [4.8, -1.2], [4.8, 1.2]]) B.get('ext').box(tu + du, y + 0.45, tv + dv, 0.9, 0.9, 0.4, '#1d2023');
    });
  }
  // 公交站：云澜大道北侧人行道
  const bs = { x: -70, z: -17 };
  B.get('extMetal').box(bs.x, y + 1.5, bs.z - 0.9, 8, 3, 0.08, '#4b5563');
  B.get('glass').box(bs.x, y + 1.4, bs.z - 0.85, 7.8, 2.4, 0.04, '#ffffff');
  B.get('extMetal').box(bs.x, y + 3.05, bs.z, 8.4, 0.12, 2.4, '#2f3439');
  B.get('glow').box(bs.x + 3.2, y + 1.6, bs.z - 0.95, 1.2, 1.8, 0.05, '#cfe8ff');
  bench(B, bs.x - 1.5, y, bs.z - 0.2, 0);
}

/** 二期星湾广场：三翼围合的椭圆铺装、旱喷水景、环形座椅与树池 */
function starBayPlaza(ctx, B) {
  const y = -0.14;
  const { cx, cz, rx, rz } = COURTYARDS.P2;
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]);
  }
  const m = new THREE.Mesh(flatShapeGeometry(shapeFromPoly(pts), -0.075), ctx.mats.floor('stone', 0.7));
  m.receiveShadow = true;
  ctx.site.group.add(m);
  // 旱喷：地面喷头阵列 + 水雾柱
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const x = cx + Math.cos(a) * 7, z = cz + Math.sin(a) * 4.2;
    B.get('glass').cyl(x, y, z, 0.12, 1.2 + (i % 3) * 0.7, '#ffffff', 6);
    B.get('glow').cyl(x, y + 0.02, z, 0.25, 0.03, '#bfe9f5', 8);
  }
  B.get('glass').cyl(cx, y, cz, 0.35, 4.2, '#ffffff', 10);
  B.get('water').cyl(cx, y + 0.02, cz, 9.5, 0.04, '#ffffff', 32);
  // 环形座椅与树池
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const x = cx + Math.cos(a) * (rx - 4), z = cz + Math.sin(a) * (rz - 3);
    if (i % 2) bench(B, x, y, z, -a + Math.PI / 2);
    else {
      B.get('extSatin').cyl(x, y, z, 1.3, 0.5, COLORS.stoneDark, 16);
      B.get('foliage').sphere(x, y + 2.6, z, 1.6, '#4f8a3a', 1.4, 1.6, 'ico');
      B.get('ext').cyl(x, y + 0.5, z, 0.16, 1.6, '#6b4d33', 6);
    }
  }
}

/** 未建地块：围挡 + 效果图广告牌 */
function hoardings(ctx, S, B, G) {
  const built = new Set(ctx.layout.buildings.map((b) => b.id));
  const plans = [
    { id: 'P2', title: '二期 · 星湾', sub: 'XINGWAN · 冰场 · IMAX · 天空跑道', a: '#0f3d5c', b: '#2f86b0' },
    { id: 'P3', title: '三期 · 云澜里', sub: 'YUNLAN LANES · 开放街区', a: '#5a2d18', b: '#c0703a' },
    { id: 'park', title: '中央公园 · 地铁站', sub: 'CENTRAL PARK · METRO', a: '#1f5133', b: '#4a9a50' },
  ];
  for (const p of plans) {
    if (built.has(p.id) || (p.id === 'park' && S.park)) continue;
    const r = S.plots.find((x) => x.id === p.id).rect;
    // 围挡：沿靠路口的两条边
    const edges = [];
    edges.push([[r.x0 + 2, r.z0 > 0 ? r.z0 + 2 : r.z1 - 2], [r.x1 - 2, r.z0 > 0 ? r.z0 + 2 : r.z1 - 2]]);
    edges.push([[r.x0 > 0 ? r.x0 + 2 : r.x1 - 2, r.z0 + 2], [r.x0 > 0 ? r.x0 + 2 : r.x1 - 2, r.z1 - 2]]);
    for (const [p0, p1] of edges) {
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const F = frame(p0[0], p0[1], Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * DEG);
      B.frame(F, () => {
        for (let u = 0; u < len; u += 3) B.get('ext').box(u + 1.5, 1.1, 0, 2.96, 2.5, 0.12, Math.floor(u / 3) % 2 ? '#e9ecef' : '#d9dde0');
        B.get('ext').box(len / 2, 2.42, 0, len, 0.12, 0.2, '#2f86b0');
      });
    }
    const c = makeCanvas(1024, 384);
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 1024, 384);
    grd.addColorStop(0, p.a);
    grd.addColorStop(1, p.b);
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 384);
    g.fillStyle = '#ffffff';
    g.textBaseline = 'middle';
    g.font = `800 112px ${FONT_CN}`;
    g.fillText(p.title, 56, 150);
    g.font = `700 40px ${FONT_EN}`;
    g.fillText(p.sub, 60, 268);
    g.font = `700 34px ${FONT_CN}`;
    g.fillText('规划建设中', 60, 330);
    const mat = ctx.mats.screen(canvasTexture(c, { clamp: true }), 0.9, 1.3);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(24, 9), mat);
    const cx = r.x0 > 0 ? r.x0 + 30 : r.x1 - 30, cz = r.z0 > 0 ? r.z0 + 22 : r.z1 - 22;
    board.position.set(cx, 7.5, cz);
    board.rotation.y = Math.atan2(-cx, -cz);
    G.add(board);
    B.get('extMetal').box(cx, 1.6, cz, 0.3, 3.2, 0.3, '#3b4046');
  }
}

/** 行道树、隔离带乔木、路灯、广场树阵 */
function greenery(ctx, S, B, G) {
  const trees = [];
  const rand = rng(11);
  const blocked = (x, z) =>
    S.crossings.some((c) => pointInPoly([x, z], c.poly)) ||
    S.driveways.some((d) => pointInPoly([x, z], d)) ||
    ctx.layout.buildings.some((b) => b.kind !== 'metro' && !b.undergroundOnly && pointInPoly([x, z], b.outline));
  for (let x = -280; x <= 280; x += 12) {
    if (Math.abs(x) < 20) continue;
    for (const z of [-17, 17]) if (!blocked(x, z)) trees.push({ x: x + (rand() - 0.5), y: -0.14, z, s: 0.9 + rand() * 0.3 });
    if (Math.abs(x) > 24) trees.push({ x: x + 6, y: 0.1, z: 0, s: 0.75 + rand() * 0.2 });
  }
  for (let z = -250; z <= 250; z += 12) {
    if (Math.abs(z) < 24) continue;
    for (const x of [-13, 13]) if (!blocked(x, z) && Math.abs(z + 170) > 10) trees.push({ x, y: -0.14, z: z + (rand() - 0.5), s: 0.85 + rand() * 0.3 });
  }
  addTrees(G, ctx.mats, trees.filter(siteTreePlacement(ctx.layout)), 21);
  const allowLamp = siteLampPlacement(ctx.layout);
  for (let x = -270; x <= 270; x += 26) {
    if (Math.abs(x) < 24) continue;
    if (allowLamp(x, -15)) streetLamp(B, x, -15, -0.14, [0, 1]);
    if (allowLamp(x, 15)) streetLamp(B, x, 15, -0.14, [0, -1]);
  }
  for (let z = -250; z <= 250; z += 26) {
    if (Math.abs(z) < 24) continue;
    if (allowLamp(-15, z)) streetLamp(B, -15, z, -0.14, [1, 0]);
    if (allowLamp(15, z)) streetLamp(B, 15, z, -0.14, [-1, 0]);
  }
}

/** 每座背景楼固定抽取尺寸和配色，避让改动不会重排其他楼的几何。 */
export function siteContextBuildings(layout) {
  if (layout.site.urban) return layout.site.urban.buildings;
  const rand = rng(42);
  const reserved = [...siteActivityFootprints(layout), ...raisedConnections(layout),
    ...layout.buildings.filter(b => b.kind !== 'metro' && !b.undergroundOnly).map(b => b.outline),
    ...(layout.site.roads || []).map(r => r.poly), ...(layout.site.sidewalks || []).map(r => r.poly)];
  const spots = [];
  for (const [x0, x1, z0, z1, n] of [
    [-760, -360, -760, -360, 8], [-320, 320, -780, -380, 9], [360, 760, -760, -360, 7],
    [-780, -380, -300, 300, 8], [380, 780, -300, 140, 6], [-760, -360, 360, 760, 5], [-320, 320, 380, 780, 5], [360, 760, 360, 760, 4],
  ]) {
    for (let i = 0; i < n; i++) spots.push([x0 + rand() * (x1 - x0), z0 + rand() * (z1 - z0)]);
  }
  return spots.map(([x, z], id) => ({ id, x, z, w: 26 + rand() * 34, d: 24 + rand() * 30, h: 24 + rand() * rand() * 120, tint: Math.floor(rand() * 6) }))
    .filter(({ x, z, w, d }) => {
      if (layout.buildings.some(b => b.kind === 'tower' && !b.undergroundOnly && (pointInPoly([x, z], b.outline) || distToPolyEdge([x, z], b.outline) < Math.max(w, d) / 2 + 22))) return false;
      // 按完整楼体再留两米边距，包含车位组之间、停车入口和主步行轴。
      const footprint = rectPoly(rect(x - w / 2 - 2, z - d / 2 - 2, x + w / 2 + 2, z + d / 2 + 2));
      return !reserved.some(poly => convexOverlap(footprint, poly));
    });
}

/** 周边外景楼：实体墙肢、凹窗、窗框与共享 CC0 外墙，保留原导航占地。 */
function context(ctx, G) {
  buildContextBuildings(ctx, siteContextBuildings(ctx.layout));
}
