import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLayout } from '../src/layout/layout.js';
import { shapeFromPoly, flatShapeGeometry } from '../src/render/build/shell.js';
import { pointInPoly, polyBounds, distToPolyEdge } from '../src/layout/geom.js';

test('各期地库实际三角化楼板与布局支撑一致，不产生空白破面或补回坡口', () => {
  const layout = buildLayout();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  let samples = 0;
  for (const lv of layout.levels.filter(l => l.kind === 'parking')) {
    const meshes = lv.slab.pieces.map(p => new THREE.Mesh(flatShapeGeometry(shapeFromPoly(p.outer, p.holes), lv.elev), material));
    for (const mesh of meshes) mesh.updateMatrixWorld(true);
    const bounds = polyBounds(lv.outline);
    const edges = lv.slab.pieces.flatMap(p => [p.outer, ...p.holes]);
    for (let x = bounds.x0 + .73; x < bounds.x1; x += 4.7) {
      for (let z = bounds.z0 + .81; z < bounds.z1; z += 4.7) {
        const q = [x, z];
        if (edges.some(p => distToPolyEdge(q, p) < .08)) continue;
        const supported = lv.slab.pieces.some(p => pointInPoly(q, p.outer) && !p.holes.some(h => pointInPoly(q, h)));
        const ray = new THREE.Raycaster(new THREE.Vector3(x, lv.elev + 1, z), new THREE.Vector3(0, -1, 0), 0, 2);
        const rendered = ray.intersectObjects(meshes, false).length > 0;
        assert.equal(rendered, supported, `${lv.id}: ${x.toFixed(2)},${z.toFixed(2)} ${supported ? 'invisible floor' : 'ramp hole filled'}`);
        samples++;
      }
    }
    for (const mesh of meshes) mesh.geometry.dispose();
  }
  material.dispose();
  assert.ok(samples > 5000);
});
