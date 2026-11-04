import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, lvl } from './helpers.js';
import { BatchSet } from '../src/render/batch.js';
import { sill, retaining, outlineEdges } from '../src/render/build/shell.js';

// A doorway on a rotunda is a straight chord across several short arc edges.
// The B1M food-hall door to the sunken art court used to keep its full-height
// retaining wall: walkable, but rendered as a solid "virtual wall".
test('圆厅弧墙上的门（下沉广场美食通廊）retaining 与矮墙实际开洞，门外弧墙保留', () => {
  for (const id of ['P1-sunken-food-door', 'residential-mall-metro-to']) {
    const e = L.entrances.find(en => en.id === id), lv = lvl(e.level), b = L.buildings.find(b => b.id === lv.building);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mats = new Proxy({}, { get: () => material });
    const batch = new BatchSet(mats), facadeBatch = new BatchSet(mats), group = new THREE.Group();
    const ctx = { layout: L, levels: { [lv.id]: { batch, facadeBatch } },
      outlineEdges: l => (l.expansion?.floorPolys || [l.outline]).flatMap(p => outlineEdges(p, b)) };
    sill(ctx, lv); retaining(ctx, lv);
    batch.flush(group); facadeBatch.flush(group); group.updateMatrixWorld(true);
    const len = Math.hypot(e.seg.x1 - e.seg.x0, e.seg.z1 - e.seg.z0), tx = (e.seg.x1 - e.seg.x0) / len, tz = (e.seg.z1 - e.seg.z0) / len;
    const cast = (along, h) => {
      const x = e.seg.x0 + tx * along, z = e.seg.z0 + tz * along;
      return new THREE.Raycaster(new THREE.Vector3(x - e.nx * 1.2, lv.elev + h, z - e.nz * 1.2),
        new THREE.Vector3(e.nx, 0, e.nz), 0, 3).intersectObjects(group.children);
    };
    for (let along = .3; along < len - .25; along += .4) for (const h of [.3, 1.6, 2.6])
      assert.equal(cast(along, h).length, 0, `${id} wall blocks doorway at ${along.toFixed(2)},${h}`);
    for (const along of [-1.2, len + 1.2]) assert.ok(cast(along, 1.6).length > 0, `${id} adjacent arc wall missing`);
    if (e.lintel) for (let along = .3; along < len - .25; along += .4)
      assert.ok(cast(along, e.lintel + .4).length > 0, `${id} lintel missing above the tunnel ceiling at ${along.toFixed(2)}`);
    for (const mesh of group.children) mesh.geometry.dispose();
    material.dispose();
  }
});
