import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLayout } from '../src/layout/layout.js';
import { pointInPoly, polyBounds, rectPoly } from '../src/layout/geom.js';
import { buildCarpetFloor, addFinishMesh, p1PavingCutouts, buildP1PavingInlays } from '../src/render/build/floor-finishes.js';
import { finishClipping } from '../src/layout/p1-finishes.js';
import { siteGroundHoles } from '../src/render/build/site.js';

const inside = (p, piece) => pointInPoly(p, piece.outer) && !(piece.holes || []).some(h => pointInPoly(p, h));
const materials = () => {
  const cache = new Map();
  return { floor(kind) {
    if (!cache.has(kind)) { const m = new THREE.MeshBasicMaterial(); m.name = kind; cache.set(kind, m); }
    return cache.get(kind);
  } };
};
const down = (group, x, z, y) => new THREE.Raycaster(new THREE.Vector3(x, y + .2, z), new THREE.Vector3(0, -1, 0), 0, .5).intersectObject(group);
const dispose = group => group.traverse(o => o.geometry?.dispose());

test('一期全部商业层的实际地毯网格保留楼板空洞，露台及下沉庭院使用室外砖', () => {
  const layout = buildLayout(), bById = Object.fromEntries(layout.buildings.map(b => [b.id, b]));
  const levels = layout.levels.filter(lv => lv.finishes), mats = materials();
  assert.equal(levels.length, 34);
  let probes = 0, outdoor = 0;
  for (const lv of levels) {
    const shell = new THREE.Group(), ctx = { mats, bById, levels: { [lv.id]: { shell } } };
    buildCarpetFloor(ctx, lv);
    shell.updateMatrixWorld(true);
    const b = polyBounds(lv.outline);
    for (let x = b.x0 + .43; x < b.x1; x += 6.71) for (let z = b.z0 + .37; z < b.z1; z += 6.43) {
      const p = [x, z], onSlab = lv.slab.pieces.some(s => inside(p, s));
      const hits = down(shell, x, z, lv.elev);
      assert.equal(!!hits.length, onSlab, `${lv.id}: floor/opening at ${p}`);
      if (!onSlab) continue;
      const envelope = lv.expansion?.facadePolys;
      const exterior = (envelope?.length && !envelope.some(poly => pointInPoly(p, poly))) || lv.walk.some(w => w.outdoor && pointInPoly(p, w.poly));
      assert.equal(hits[0].object.material.name.startsWith('p1-paving'), !!exterior, `${lv.id}: indoor/outdoor at ${p}`);
      if (exterior) outdoor++;
      probes++;
    }
    dispose(shell);
  }
  assert.ok(probes > 2500 && outdoor > 20, `${probes} floor probes, ${outdoor} outdoor probes`);
  assert.equal(layout.levels.find(l => l.id === 'P1-RF').theme.floor, 'roof-stone');
  assert.ok(layout.levels.filter(l => l.kind === 'parking' || !l.building.startsWith('P1')).every(l => !l.finishes));
  assert.ok(buildLayout({ expansion: false }).levels.every(l => !l.finishes));
});

test('一期广场的全铺装和拼花实际网格避让建筑、全部坡口及车道', () => {
  const layout = buildLayout(), b = layout.buildings.find(b => b.id === 'P1');
  const cuts = p1PavingCutouts(layout, siteGroundHoles(layout));
  const group = new THREE.Group(), mats = materials();
  const polygons = finishClipping.difference([rectPoly(b.plot)], ...cuts.map(p => [p]));
  addFinishMesh(group, polygons, mats.floor('p1-paving'), -.14, 'plaza');
  buildP1PavingInlays({ layout, site: { group }, mats }, b.plot, cuts);
  group.updateMatrixWorld(true);
  let paved = 0, clear = 0;
  for (let x = b.plot.x0 + .43; x < b.plot.x1; x += 4.73) for (let z = b.plot.z0 + .37; z < b.plot.z1; z += 4.97) {
    const expected = !cuts.some(poly => pointInPoly([x, z], poly));
    assert.equal(!!down(group, x, z, -.14).length, expected, `paving at ${x},${z}`);
    expected ? paved++ : clear++;
  }
  assert.ok(paved > 500 && clear > 500);
  dispose(group);
});
