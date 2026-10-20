import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';

/**
 * Cut real openings through a surface, including cuts crossing its perimeter.
 * Overlapping/nested holes must first be unioned by the boolean operation;
 * passing them straight to Earcut can silently fill a trench or lose a floor.
 */
export function cutSurfaceShapes(outer, holes = []) {
  if (outer.length < 3) return [];
  const bounds = poly => poly.reduce((b, [x, z]) => [
    Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z),
  ], [Infinity, Infinity, -Infinity, -Infinity]);
  const a = bounds(outer);
  const cuts = holes.filter(poly => {
    if (poly.length < 3) return false;
    const b = bounds(poly);
    return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  });
  const polygons = cuts.length ? polygonClipping.difference([outer], ...cuts.map(poly => [poly])) : [[outer]];
  return polygons.map(([ring, ...inner]) => {
    const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
    shape.holes = inner.map(poly => new THREE.Path(poly.map(([x, z]) => new THREE.Vector2(x, -z))));
    return shape;
  });
}

/** Keep cut paving batched, so the extra openings do not add draw calls. */
export function addCutSurfaceSlab(batch, key, outer, holes, top, thickness, color) {
  const shapes = cutSurfaceShapes(outer, holes);
  if (!shapes.length) return;
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2).translate(0, top - thickness, 0);
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  batch.get(key).push({
    pos: g.attributes.position.array, nor: g.attributes.normal.array,
    uv: g.attributes.uv?.array, count: g.attributes.position.count,
  }, new THREE.Matrix4(), color);
  if (g !== geometry) g.dispose();
  geometry.dispose();
}
