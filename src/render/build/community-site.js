// 云澜·西苑社区场地：南侧与地块边界围墙（步行口、北门 G4 车行口）、北门门楼与岗亭、
// 消防登高场地黄色边线与字样、社区花园（草坪、灌木、乔木、座椅与庭院灯），全部避开登高场地与车道。
import * as THREE from 'three';
import { BatchSet, SignBatch } from '../batch.js';
import { subtractInterval, rect } from '../../layout/geom.js';
import { addTrees, planter, bench, bollard } from './props.js';
import { SIGN_CELLS } from './community.js';

const FENCE = { plinth: '#cfc7b6', metal: '#3f4a47' };
const overlaps = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;

/** Fence: stone plinth, posts every 3 m and palisade bars every 0.4 m, interrupted at the gates. */
function fence(B, f) {
  const [ax, az] = f.a, [bx, bz] = f.b, alongX = Math.abs(bz - az) < 1e-6, lo = alongX ? Math.min(ax, bx) : Math.min(az, bz), hi = alongX ? Math.max(ax, bx) : Math.max(az, bz);
  const P = (t) => alongX ? [t, az] : [ax, t];
  for (const [t0, t1] of f.gaps.reduce((iv, g) => subtractInterval(iv, g), [[lo, hi]])) {
    const len = t1 - t0, [cx, cz] = P((t0 + t1) / 2);
    B.get('stone').box(cx, .22, cz, alongX ? len : .32, .44, alongX ? .32 : len, FENCE.plinth);
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

export function buildCommunitySite(ctx) {
  const S = ctx.layout.site.westGarden;
  if (!S) return null;
  const group = new THREE.Group(); group.name = 'west-garden-site';
  const B = new BatchSet(ctx.mats.base), trees = [], legends = [];
  for (const f of S.fence) fence(B, f);
  // 北门 G4：门楼横梁、两侧石柱、抬起的道闸与岗亭。
  const lane = S.gateLane, gz = S.plot.z0, cx = (lane.x0 + lane.x1) / 2;
  for (const x of [lane.x0 - .5, lane.x1 + .5]) B.get('stone').box(x, 2.2, gz, .9, 4.4, .9, FENCE.plinth);
  B.get('extMetal').box(cx, 4.55, gz, lane.x1 - lane.x0 + 2, .3, .5, FENCE.metal);
  B.get('extMetal').box(lane.x1 - .2, .55, gz + .9, .3, 1.1, .3, '#d7d2c4');
  B.get('extMetal').bar({ x: lane.x1 - .2, y: 1.05, z: gz + .9 }, { x: lane.x1 - 1.6, y: 4.2, z: gz + .9 }, .07, '#d84b3c');
  const booth = S.gate.booth, bx = (booth.x0 + booth.x1) / 2, bz = (booth.z0 + booth.z1) / 2;
  B.get('stone').box(bx, 1.3, bz, booth.x1 - booth.x0, 2.6, booth.z1 - booth.z0, '#e9e3d6');
  B.get('extMetal').box(bx, 1.55, booth.z0 - .01, booth.x1 - booth.x0 - .5, 1.0, .03, '#3d5560');
  B.get('extMetal').box(booth.x0 - .01, 1.55, bz, .03, 1.0, booth.z1 - booth.z0 - .5, '#3d5560');
  B.get('extMetal').box(bx, 2.68, bz, booth.x1 - booth.x0 + .5, .16, booth.z1 - booth.z0 + .5, FENCE.metal);
  // 步行口：两根门柱与顶梁。
  for (const fz of [S.plot.z1, S.plot.z0]) {
    for (const x of [S.path.x0 - .2, S.path.x1 + .2]) B.get('stone').box(x, 1.4, fz, .45, 2.8, .45, FENCE.plinth);
    B.get('extMetal').box((S.path.x0 + S.path.x1) / 2, 2.85, fz, S.path.x1 - S.path.x0 + .9, .14, .3, FENCE.metal);
  }
  for (const h of S.hardstands) hardstand(B, legends, h);
  // 花园：围墙与消防车道之间、两楼之间及楼后绿带；乔木只种在登高场地与楼前 5 m 救援带以外。
  const blocked = [S.fireRoad, S.gateLane, S.path, ...S.hardstands.map((h) => h.rect),
    ...ctx.layout.buildings.filter((b) => b.community === 'west').map((b) => b.bounds),
    ...(ctx.layout.extensions?.paths || []).filter((p) => p.kind === 'ground' && /main-approach/.test(p.id)).flatMap((p) => p.polys.map((q) => rect(Math.min(...q.map((v) => v[0])), Math.min(...q.map((v) => v[1])), Math.max(...q.map((v) => v[0])), Math.max(...q.map((v) => v[1])))))];
  const lawn = (r) => {
    B.get('foliage').box((r.x0 + r.x1) / 2, .03, (r.z0 + r.z1) / 2, r.x1 - r.x0, .04, r.z1 - r.z0, '#6f9a56');
    for (const z of [r.z0, r.z1]) B.get('stone').box((r.x0 + r.x1) / 2, .06, z, r.x1 - r.x0, .12, .16, '#d6d0c2');
    for (const x of [r.x0, r.x1]) B.get('stone').box(x, .06, (r.z0 + r.z1) / 2, .16, .12, r.z1 - r.z0, '#d6d0c2');
  };
  const P = S.plot, fz = S.fireRoad;
  const beds = [];
  // South garden band between the fence and the fire road, split by the community path.
  for (const [x0, x1] of [[P.x0 + .6, S.path.x0 - .6], [S.path.x1 + .6, P.x1 - .6]]) beds.push({ r: rect(x0, fz.z1 + .8, x1, P.z1 - .8), trees: true });
  // Between the towers, beside the community path and the G4 lane.
  const t0 = ctx.layout.buildings.find((b) => b.id === S.towers[0])?.bounds, t1 = ctx.layout.buildings.find((b) => b.id === S.towers[1])?.bounds;
  if (t0 && t1) {
    beds.push({ r: rect(t0.x1 + 1.2, t0.z0 + 1, S.path.x0 - .8, fz.z0 - 1), trees: true });
    beds.push({ r: rect(S.gateLane.x1 + 4.2, t0.z0 + 4, t1.x0 - 1.2, fz.z0 - 1), trees: false });
    // Behind the towers (north band) and the 5 m rescue band in front: low planting only.
    for (const b of [t0, t1]) {
      beds.push({ r: rect(b.x0 + .5, P.z0 + .7, b.x1 - .5, b.z0 - .6), trees: false });
      for (const [x0, x1] of subtractInterval([[b.x0 + .5, b.x1 - .5]], [(b.x0 + b.x1) / 2 - 3.2, (b.x0 + b.x1) / 2 + 3.2])) beds.push({ r: rect(x0, b.z1 + .7, x1, fz.z0 - .9), trees: false, low: true });
    }
  }
  for (const bed of beds) {
    const r = bed.r;
    if (r.x1 - r.x0 < 1.5 || r.z1 - r.z0 < 1.2) continue;
    if (bed.low) { planter(B, r.x0, r.z0, r.x1, r.z1, 0, Math.round(Math.abs(r.x0)), true, 'stone'); continue; }
    lawn(r);
    if (!bed.trees) continue;
    for (let x = r.x0 + 4; x < r.x1 - 3; x += 9) {
      const z = (r.z0 + r.z1) / 2, tree = { x, z, y: 0, s: 1.05, kind: 'round' };
      if (blocked.some((q) => overlaps(q, rect(x - 2.6, z - 2.6, x + 2.6, z + 2.6)))) continue;
      trees.push(tree);
      if (Math.round(x) % 2) bench(B, x + 3, 0, r.z1 - .7, Math.PI, 'ext');
    }
  }
  for (let z = P.z0 + 4; z < P.z1 - 2; z += 8) for (const x of [S.path.x0 - .45, S.path.x1 + .45]) if (!overlaps(rect(x - .2, z - .2, x + .2, z + .2), S.fireRoad)) bollard(B, x, z);
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
