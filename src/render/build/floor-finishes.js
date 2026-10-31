import * as THREE from 'three';
import { circlePoly, lrectPoly, polyBounds, rectPoly, roundedRectPoly } from '../../layout/geom.js';
import { floorFinishRegions, finishClipping as clipping } from '../../layout/p1-finishes.js';

const union = polygons => polygons.length ? clipping.union(...polygons) : [];
const ring = (x, z, outer, inner) => [circlePoly(x, z, outer, 96), circlePoly(x, z, inner, 96)];

/** One mesh per finish, with real holes, world-metre UVs and shared materials. */
export function addFinishMesh(group, polygons, material, y, name) {
  if (!polygons.length) return;
  const shapes = polygons.map(([outer, ...holes]) => {
    const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
    shape.holes = holes.map(poly => new THREE.Path(poly.map(([x, z]) => new THREE.Vector2(x, -z))));
    return shape;
  });
  const geometry = new THREE.ShapeGeometry(shapes, 1).rotateX(-Math.PI / 2).translate(0, y, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Art-deco runners connect actual public corridors; concentric woven rings
 * echo the rotunda and the rounded square court. No decorative floor spans
 * an atrium, lift, terrace, shop or service room. */
export function carpetInlays(lv, building, inside = floorFinishRegions(lv).inside) {
  const walks = lv.walk.filter(w => !w.outdoor);
  // The slab is the exact public domain after subtracting enclosed units and
  // rooms. Unioning the many overlapping navigation probes creates sliver
  // intersections along the rotunda and is unnecessary for a floor finish.
  let mask = inside;
  const rooms = [...lv.units, ...lv.rooms].flatMap(u => (u.polys || []).map(p => [p]));
  if (mask.length && rooms.length) mask = clipping.difference(mask, ...rooms);
  const outer = [], inner = [], motifs = [];
  for (const w of walks) {
    if (!w.rect || !['street', 'corridor', 'passage', 'entrance'].includes(w.kind)) continue;
    const r = w.rect, dx = r.x1 - r.x0, dz = r.z1 - r.z0;
    if (Math.min(dx, dz) < 3 || Math.max(dx, dz) < 6) continue;
    const alongX = dx > dz, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const width = Math.min(4.8, Math.min(dx, dz) - 1.2);
    const strip = extra => lrectPoly(w.frame, alongX
      ? { x0: r.x0, x1: r.x1, z0: cz - width / 2 - extra, z1: cz + width / 2 + extra }
      : { x0: cx - width / 2 - extra, x1: cx + width / 2 + extra, z0: r.z0, z1: r.z1 });
    outer.push([strip(.2)]); inner.push([strip(0)]);
  }
  for (const r of building.rotundas || []) {
    outer.push(ring(r.x, r.z, r.R - 4.7, r.R - 9.3));
    inner.push(ring(r.x, r.z, r.R - 4.9, r.R - 9.1));
    // Four restrained woven lozenges, aligned with the rotunda axes.
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, x = r.x + Math.cos(a) * (r.R - 7), z = r.z + Math.sin(a) * (r.R - 7);
      motifs.push([[[x, z - .65], [x + .65, z], [x, z + .65], [x - .65, z]]]);
    }
  }
  const bounds = building.id === 'P1' ? { x0: -246, x1: -194, z0: -214, z1: -186 } : polyBounds(lv.outline);
  const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.z0 + bounds.z1) / 2;
  const w = building.id === 'P1' ? 23 : Math.max(3, (bounds.x1 - bounds.x0) / 2 - 5);
  const d = building.id === 'P1' ? 11 : Math.max(3, (bounds.z1 - bounds.z0) / 2 - 5);
  const rounded = (inset, radius) => roundedRectPoly({ x0: cx - w + inset, x1: cx + w - inset, z0: cz - d + inset, z1: cz + d - inset }, Math.min(radius, d - inset, w - inset), 10);
  outer.push([rounded(0, 7), rounded(1.9, 5.1)]);
  inner.push([rounded(.2, 6.8), rounded(1.7, 5.3)]);
  if (building.id !== 'P1') {
    const rect = extra => rectPoly({ x0: cx - 1.7 - extra, x1: cx + 1.7 + extra, z0: bounds.z0 + 1, z1: bounds.z1 - 1 });
    outer.push([rect(.2)]); inner.push([rect(0)]);
  }
  const color = mask.length ? clipping.intersection(mask, union(inner)) : [];
  const edging = mask.length ? clipping.difference(clipping.intersection(mask, union(outer)), union(inner)) : [];
  const details = motifs.length && color.length ? clipping.intersection(color, union(motifs)) : [];
  return { color, edging, details };
}

export function buildCarpetFloor(ctx, lv) {
  const { inside, outside } = floorFinishRegions(lv), L = ctx.levels[lv.id], finish = lv.finishes;
  addFinishMesh(L.shell, inside, ctx.mats.floor(finish.field), lv.elev, 'floor');
  addFinishMesh(L.shell, outside, ctx.mats.floor(finish.exterior), lv.elev, 'outdoor-tiled-floor');
  const inlays = carpetInlays(lv, ctx.bById[lv.building], inside);
  addFinishMesh(L.shell, inlays.color, ctx.mats.floor(finish.accent), lv.elev + .006, 'woven-carpet-runners');
  addFinishMesh(L.shell, inlays.edging, ctx.mats.floor(finish.border), lv.elev + .006, 'woven-carpet-edging');
  addFinishMesh(L.shell, inlays.details, ctx.mats.floor(finish.border), lv.elev + .01, 'woven-carpet-lozenges');
}

/** All the outdoor pedestrian ground is tiled, including former lawn gaps.
 * Keep vehicle surfaces, real openings, fountains and planted tree pits open. */
export function p1PavingCutouts(layout, baseHoles) {
  const S = layout.site, D = layout.fidelity?.landscape;
  return [...baseHoles, ...(S.driveways || []), ...S.roads.map(r => rectPoly(r.rect)),
    ...(layout.extensions?.roads || []).flatMap(r => r.polys || []),
    ...(layout.extensions?.surfaceParking || []).map(p => p.poly),
    ...(D?.hotelLoop ? [roundedRectPoly(D.hotelLoop.rect, D.hotelLoop.corner, 6)] : []),
    ...(D?.fountains || []).map(f => circlePoly(f.x, f.z, f.r, 48)),
    ...(D?.trees || []).map(t => rectPoly({ x0: t.x - .85, x1: t.x + .85, z0: t.z - .85, z1: t.z + .85 }))];
}

export function buildP1PavingInlays(ctx, plot, holes) {
  const surface = clipping.difference([rectPoly(plot)], ...holes.map(p => [p]));
  const dark = [], warm = [];
  for (const f of ctx.layout.fidelity?.landscape?.fountains || []) {
    dark.push(ring(f.x, f.z, f.r + 2.5, f.r + 1.45));
    warm.push(ring(f.x, f.z, f.r + 2.8, f.r + 2.6));
    warm.push(ring(f.x, f.z, f.r + 1.3, f.r + 1.05));
  }
  const inset = d => rectPoly({ x0: plot.x0 + d, x1: plot.x1 - d, z0: plot.z0 + d, z1: plot.z1 - d });
  dark.push([inset(.35), inset(.85)]);
  warm.push([inset(1.05), inset(1.22)]);
  addFinishMesh(ctx.site.group, clipping.intersection(surface, union(dark)), ctx.mats.floor('p1-paving-border'), -.125, 'P1-plaza-stone-inlays');
  addFinishMesh(ctx.site.group, clipping.intersection(surface, union(warm)), ctx.mats.floor('p1-paving-inlay'), -.124, 'P1-plaza-sandstone-inlays');
}
