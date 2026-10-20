import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { parkingPaintCuts } from '../src/render/build/parking.js';
import { cutSurfaceShapes } from '../src/render/build/surface-shapes.js';
import { flatShapeGeometry } from '../src/render/build/shell.js';
import { pointInPoly, polyBounds, distToPolyEdge } from '../src/layout/geom.js';

test('停车漆面的真实三角形随坡口和电梯井裁切，不重新盖住挖空区域', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  let absent = 0, present = 0;
  for (const lv of L.levels.filter(l => l.kind === 'parking')) {
    for (const w of lv.walk.filter(w => ['aisle', 'spine', 'eschall'].includes(w.kind))) {
      const cuts = parkingPaintCuts(lv, w.poly);
      if (!cuts.length) continue;
      const geometry = flatShapeGeometry(cutSurfaceShapes(w.poly, cuts), lv.elev + .007);
      const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld(true);
      const b = polyBounds(w.poly), edges = [w.poly, ...cuts];
      for (let x = b.x0 + .37; x < b.x1; x += 1.7) for (let z = b.z0 + .41; z < b.z1; z += 1.7) {
        const p = [x, z];
        if (edges.some(poly => distToPolyEdge(p, poly) < .04)) continue;
        const expected = pointInPoly(p, w.poly) && !cuts.some(poly => pointInPoly(p, poly));
        const ray = new THREE.Raycaster(new THREE.Vector3(x, lv.elev + 1, z), new THREE.Vector3(0, -1, 0), 0, 2);
        assert.equal(ray.intersectObject(mesh).length > 0, expected, `${lv.id}/${w.id} at ${x},${z}`);
        if (expected) present++; else absent++;
      }
      geometry.dispose();
    }
  }
  material.dispose();
  assert.ok(absent > 100, '必须实际检查坡口内不可见的漆面');
  assert.ok(present > 100, '裁洞不能把正常车道全部删除');
});
