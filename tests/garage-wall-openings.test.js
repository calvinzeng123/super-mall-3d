import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLayout } from '../src/layout/layout.js';
import { BatchSet } from '../src/render/batch.js';
import { sill, retaining, outlineEdges } from '../src/render/build/shell.js';
import { basement } from '../src/render/build/street.js';

test('二三期全部街道坡口的实际挡土墙与矮墙保留双向全身净空', () => {
  const layout = buildLayout();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  let checked = 0;
  for (const building of ['P2', 'P3']) {
    const b = layout.buildings.find(b => b.id === building);
    const lv = layout.levels.find(l => l.id === `${building}-B1`);
    const batch = new BatchSet({ matte: material }), facadeBatch = new BatchSet({ concrete: material, ext: material });
    const group = new THREE.Group();
    const ctx = { layout, levels: { [lv.id]: { batch, facadeBatch } }, outlineEdges: () => outlineEdges(lv.outline, b) };
    if (building === 'P2') { sill(ctx, lv); retaining(ctx, lv); }
    else basement(ctx, b, lv);
    batch.flush(group); facadeBatch.flush(group); group.updateMatrixWorld(true);
    assert.ok(group.children.length >= 2, `${building} wall geometry was not built`);
    for (const ramp of layout.ramps.filter(r => r.building === building && r.type.startsWith('street'))) {
      const [high, low] = ramp.from.y > ramp.to.y ? [ramp.from, ramp.to] : [ramp.to, ramp.from];
      const dx = low.x - high.x, dz = low.z - high.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
      const point = (t, side, height) => new THREE.Vector3(
        high.x + dx * t - uz * side, high.y + (low.y - high.y) * t + height, high.z + dz * t + ux * side);
      for (const side of [-ramp.width / 2 + .35, -1.1, 0, 1.1, ramp.width / 2 - .35]) {
        for (const height of [.15, .45, 1, 1.62, 2.4]) for (const reverse of [false, true]) {
          const a = point(reverse ? 1.01 : -.01, side, height), target = point(reverse ? -.01 : 1.01, side, height);
          const distance = a.distanceTo(target), direction = target.sub(a).normalize();
          const hits = new THREE.Raycaster(a, direction, .001, distance).intersectObjects(group.children, false);
          assert.equal(hits.length, 0, `${ramp.id} ${reverse ? 'up' : 'down'} side=${side} body=${height}: wall at ${JSON.stringify(hits[0]?.point)}`);
          checked++;
        }
      }
    }
    // Positive control: a non-portal side still has a wall; empty geometry
    // cannot accidentally make the clearance assertions pass.
    const intact = outlineEdges(lv.outline, b).some(e => {
      const x = e.mid[0], z = e.mid[1], nx = -e.F.s, nz = e.F.c;
      return new THREE.Raycaster(new THREE.Vector3(x - nx, lv.elev + 1.62, z - nz),
        new THREE.Vector3(nx, 0, nz), 0, 2).intersectObjects(group.children, false).length > 0;
    });
    assert.ok(intact, `${building} lost its surrounding retaining walls`);
    for (const mesh of group.children) mesh.geometry.dispose();
  }
  assert.equal(checked, 300);
  material.dispose();
});
