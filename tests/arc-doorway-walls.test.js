import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, lvl } from './helpers.js';
import { BatchSet } from '../src/render/batch.js';
import { distToSeg } from '../src/layout/geom.js';
import { sill, retaining, outlineEdges, edgeSpans } from '../src/render/build/shell.js';

const edgesOf = (lv, b) => (lv.expansion?.floorPolys || [lv.outline]).flatMap(p => outlineEdges(p, b));
const sameSeg = (a, b) => Math.hypot(a.x0 - b.x0, a.z0 - b.z0) + Math.hypot(a.x1 - b.x1, a.z1 - b.z1) < .01;
// Every below-grade doorway that retaining() cuts into a mall wall where a
// tunnel or dock lower than the storey ends: the wall must stay above it.
const ends = L.extensions.paths.filter(p => ['underground', 'garage'].includes(p.kind)).flatMap(p => [p.points[0], p.points.at(-1)]);
const docks = L.extensions.gateways.filter(g => g.elev < 0 && !g.openDeck);
const mouths = L.entrances.filter(e => {
  const lv = lvl(e.level), b = L.buildings.find(b => b.id === lv?.building);
  if (!lv || lv.elev >= 0 || b.kind !== 'mall') return false;
  const a = [e.seg.x0, e.seg.z0], z = [e.seg.x1, e.seg.z1];
  if (!ends.some(p => Math.abs(p[1] - lv.elev) < .01 && distToSeg([p[0], p[2]], a, z) < .3)
    && !docks.some(d => d.level === e.level && sameSeg(d.innerSeg, e.seg))) return false;
  return edgesOf(lv, b).some(edge => edgeSpans(edge, [e], 0).reduce((n, [a, z]) => n + z - a, 0) < edge.len - .01);
}).map(e => e.id);

test('地下连廊与接驳厅进入商场的墙洞全部保留顶板以上的门楣', () => {
  for (const id of ['west-parking-mall-to', 'P1-hotel-inner-B1M', 'P1-apartment-inner-B1M', 'shared-west-mall-to',
    'residential-mall-metro-to', 'P1-sunken-food-door']) assert.ok(mouths.includes(id), `${id} is not a tunnel mouth`);
  for (const id of mouths) {
    const e = L.entrances.find(en => en.id === id), lv = lvl(e.level);
    assert.ok(e.lintel > 2.8 && e.lintel < lv.height, `${id} has no lintel below its ${lv.height} m storey`);
  }
});

// A doorway on a rotunda is a straight chord across several short arc edges.
// The B1M food-hall door to the sunken art court used to keep its full-height
// retaining wall: walkable, but rendered as a solid "virtual wall".
test('圆厅弧墙上的门（下沉广场美食通廊）retaining 与矮墙实际开洞，门外弧墙保留', () => {
  for (const id of new Set(['P1-sunken-food-door', 'residential-mall-metro-to', ...mouths])) {
    const e = L.entrances.find(en => en.id === id), lv = lvl(e.level), b = L.buildings.find(b => b.id === lv.building);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mats = new Proxy({}, { get: () => material });
    const batch = new BatchSet(mats), facadeBatch = new BatchSet(mats), group = new THREE.Group();
    const ctx = { layout: L, levels: { [lv.id]: { batch, facadeBatch } }, outlineEdges: l => edgesOf(l, b) };
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
    if (e.lintel || mouths.includes(id)) for (let along = .3; along < len - .25; along += .4)
      assert.ok(cast(along, e.lintel + .2).length > 0 && cast(along, lv.height - .3).length > 0,
        `${id} lintel missing above the tunnel ceiling at ${along.toFixed(2)}`);
    for (const mesh of group.children) mesh.geometry.dispose();
    material.dispose();
  }
});
