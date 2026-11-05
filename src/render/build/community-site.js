// 云澜·西苑社区场地：地块边界围墙（步行口、北门 G4 门楼与岗亭）、消防登高场地黄色边线与字样、
// 社区花园（草坪、种植池、乔木、座椅与庭院灯）。几何全部取自 layout site.westGarden，
// 与步行碰撞（围墙、门柱、岗亭、种植池、柱子与路桩）一一对应。
import * as THREE from 'three';
import { BatchSet, SignBatch } from '../batch.js';
import { subtractInterval, rect } from '../../layout/geom.js';
import { addTrees, planter, bench, bollard } from './props.js';
import { SIGN_CELLS } from './community.js';

const FENCE = { plinth: '#cfc7b6', metal: '#3f4a47', t: .32 };
const overlaps = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
const centre = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

/** Fence: stone plinth, posts every 3 m and palisade bars every 0.4 m, interrupted at the gates. */
function fence(B, f) {
  const [ax, az] = f.a, [bx, bz] = f.b, alongX = Math.abs(bz - az) < 1e-6, lo = alongX ? Math.min(ax, bx) : Math.min(az, bz), hi = alongX ? Math.max(ax, bx) : Math.max(az, bz);
  const P = (t) => alongX ? [t, az] : [ax, t];
  for (const [t0, t1] of f.gaps.reduce((iv, g) => subtractInterval(iv, g), [[lo, hi]])) {
    const len = t1 - t0, [cx, cz] = P((t0 + t1) / 2);
    B.get('stone').box(cx, .22, cz, alongX ? len : FENCE.t, .44, alongX ? FENCE.t : len, FENCE.plinth);
    B.get('extMetal').box(cx, 1.78, cz, alongX ? len : .06, .05, alongX ? .06 : len, FENCE.metal);
    B.get('extMetal').box(cx, .62, cz, alongX ? len : .05, .04, alongX ? .05 : len, FENCE.metal);
    for (let t = t0 + .2; t < t1 - .1; t += .4) { const [x, z] = P(t); B.get('extMetal').box(x, 1.18, z, .025, 1.2, .025, FENCE.metal); }
    for (let t = t0; t <= t1 + 1e-6; t += Math.max(1, len / Math.ceil(len / 3))) { const [x, z] = P(Math.min(t, t1)); B.get('stone').box(x, .9, z, .3, 1.8, .3, FENCE.plinth); }
  }
}

/** Painted 消防登高场地: a yellow border, inner hatching at both ends and the legend. */
function hardstand(B, signs, h) {
  const r = h.rect, y = .028, line = (x0, z0, x1, z1) => B.get('ext').box((x0 + x1) / 2, y, (z0 + z1) / 2, Math.max(.15, x1 - x0), .012, Math.max(.15, z1 - z0), '#f2c230');
  line(r.x0, r.z0, r.x1, r.z0 + .15); line(r.x0, r.z1 - .15, r.x1, r.z1);
  line(r.x0, r.z0, r.x0 + .15, r.z1); line(r.x1 - .15, r.z0, r.x1, r.z1);
  for (const x of [r.x0 + 1.2, r.x1 - 1.2]) for (let k = 0; k < 4; k++) {
    const z = r.z0 + 1.6 + k * 2.2;
    B.get('ext').box(x, y, z, 1.8, .012, .18, '#f2c230', Math.PI / 4);
  }
  signs.push({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: Math.min(14, r.x1 - r.x0 - 6), tower: h.tower });
}

/** 北门 G4：两根石柱与门楼横梁跨过社区步道与消防车道，抬起的道闸，岗亭在车道东侧。 */
function northGate(B, G, lane) {
  const top = 4.0, [p0, p1] = G.pillars;
  for (const r of G.pillars) { const [x, z] = centre(r); B.get('stone').box(x, top / 2, z, r.x1 - r.x0, top, r.z1 - r.z0, FENCE.plinth); }
  B.get('extMetal').box((p0.x0 + p1.x1) / 2, top + .65, G.z, p1.x1 - p0.x0, 1.3, .5, FENCE.metal);
  B.get('extMetal').box(G.boom.x, .55, G.boom.z, .3, 1.1, .3, '#d7d2c4');
  B.get('extMetal').bar({ x: G.boom.x, y: 1.05, z: G.boom.z }, { x: lane.x1 - 1.2, y: 3.6, z: G.boom.z }, .07, '#d84b3c');
  const b = G.booth, [bx, bz] = centre(b);
  B.get('stone').box(bx, 1.3, bz, b.x1 - b.x0, 2.6, b.z1 - b.z0, '#e9e3d6');
  B.get('extMetal').box(bx, 1.55, b.z0 - .01, b.x1 - b.x0 - .5, 1.0, .03, '#3d5560');
  B.get('extMetal').box(b.x0 - .01, 1.55, bz, .03, 1.0, b.z1 - b.z0 - .5, '#3d5560');
  B.get('extMetal').box(bx, 2.68, bz, b.x1 - b.x0 + .5, .16, b.z1 - b.z0 + .5, FENCE.metal);
}

export function buildCommunitySite(ctx) {
  const S = ctx.layout.site.westGarden;
  if (!S) return null;
  const group = new THREE.Group(); group.name = 'west-garden-site';
  const B = new BatchSet(ctx.mats.base), trees = [], legends = [];
  for (const f of S.fence) fence(B, f);
  northGate(B, S.gate, S.gateLane);
  // 南侧步行口：两根门柱与顶梁。
  const pg = S.pathGate;
  for (const r of pg.posts) { const [x, z] = centre(r); B.get('stone').box(x, 1.4, z, r.x1 - r.x0, 2.8, r.z1 - r.z0, FENCE.plinth); }
  B.get('extMetal').box((pg.posts[0].x0 + pg.posts[1].x1) / 2, 2.85, pg.z, pg.posts[1].x1 - pg.posts[0].x0, .14, .3, FENCE.metal);
  for (const h of S.hardstands) hardstand(B, legends, h);
  // 花园：乔木只种在登高场地、消防车道、车道与楼前 5 m 救援带以外。
  const blocked = [S.fireRoad, S.gateLane, S.path, ...S.hardstands.map((h) => h.rect),
    ...ctx.layout.buildings.filter((b) => b.community === 'west').map((b) => b.bounds),
    ...(ctx.layout.extensions?.paths || []).filter((p) => p.kind === 'ground' && /main-approach/.test(p.id)).flatMap((p) => p.polys.map((q) => rect(Math.min(...q.map((v) => v[0])), Math.min(...q.map((v) => v[1])), Math.max(...q.map((v) => v[0])), Math.max(...q.map((v) => v[1])))))];
  const lawn = (r) => {
    B.get('foliage').box((r.x0 + r.x1) / 2, .03, (r.z0 + r.z1) / 2, r.x1 - r.x0, .04, r.z1 - r.z0, '#6f9a56');
    for (const z of [r.z0, r.z1]) B.get('stone').box((r.x0 + r.x1) / 2, .06, z, r.x1 - r.x0, .12, .16, '#d6d0c2');
    for (const x of [r.x0, r.x1]) B.get('stone').box(x, .06, (r.z0 + r.z1) / 2, .16, .12, r.z1 - r.z0, '#d6d0c2');
  };
  for (const bed of S.garden) {
    const r = bed.rect;
    if (bed.raised) { planter(B, r.x0, r.z0, r.x1, r.z1, 0, Math.round(Math.abs(r.x0)), true, 'stone'); continue; }
    lawn(r);
    if (!bed.trees) continue;
    for (let x = r.x0 + 4; x < r.x1 - 3; x += 9) {
      const z = (r.z0 + r.z1) / 2, tree = { x, z, y: 0, s: 1.05, kind: 'round' };
      if (blocked.some((q) => overlaps(q, rect(x - 2.6, z - 2.6, x + 2.6, z + 2.6)))) continue;
      trees.push(tree);
      if (Math.round(x) % 2) bench(B, x + 3, 0, r.z1 - .7, Math.PI, 'ext');
    }
  }
  for (const [x, z] of S.bollards) bollard(B, x, z);
  B.flush(group);
  addTrees(group, ctx.mats, trees, 517);
  // 消防登高场地字样：用各楼招牌图集中的地面字样条，不另建贴图。
  for (const l of legends) {
    const mat = ctx.hospitality?.buildings.get(l.tower)?.signMaterial;
    if (!mat) continue;
    const signs = new SignBatch(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    signs.b.shape('plane', new THREE.Vector3(l.x, .035, l.z), q, new THREE.Vector3(l.w, l.w * 96 / 1024, 1), 0xffffff, SIGN_CELLS.hardstand);
    signs.flush(group, mat);
  }
  ctx.site?.group.add(group);
  ctx.hospitality && (ctx.hospitality.westGarden = group);
  return group;
}
