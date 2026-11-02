import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { pointInPoly, toW } from '../src/layout/geom.js';
import { INTERCHANGE } from '../src/layout/metro-interchange.js';
import { endBulkhead } from '../src/render/build/metro-interchange.js';

const onSlab = (lv, p) => lv.slab.pieces.some(s => pointInPoly(p, s.outer) && !(s.holes || []).some(h => pointInPoly(p, h)));

test('platform levels have floor right up to the tiled outer wall, but no walkable area there', () => {
  for (const line of L.buildings.find(b => b.id === 'M').interchange.lines) {
    const lv = L.levels.find(l => l.id === line.level);
    for (const s of [-1, 1]) for (const x of [-55, -20, 0, 20, 55]) {
      const strip = toW(line.frame, x, s * 20.3);
      assert.ok(onSlab(lv, strip), `${lv.id} has a hole beside the wall at ${x},${s * 20.3}`);
      assert.ok(!lv.walk.some(w => pointInPoly(strip, w.poly)), 'the wall strip stays off the walk mesh');
    }
  }
  assert.equal(INTERCHANGE.wallFace, 20.8 - 0.14);
});

test('each station end wall closes the box around both running tunnels', () => {
  const line = { track: INTERCHANGE.track }, g = endBulkhead(line, -12, 1);
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  assert.ok(Math.abs(min.x - 66) < 1e-6 && Math.abs(max.x - 66) < 1e-6);
  assert.ok(max.z - min.z > 41 && min.y < -13.35 && max.y > -12 + 4.6, 'covers wall to wall and track bed to ceiling');
  // Two tunnel holes: the triangulated wall has far fewer triangles' area than the full rectangle.
  const p = g.attributes.position, idx = g.index.array;
  let area = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]].map(k => [p.getZ(k), p.getY(k)]);
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }
  const full = (max.z - min.z) * (max.y - min.y);
  assert.ok(area < full - 2 * 25 && area > full - 2 * 40, `two ~32m² tunnel openings, got ${full - area}`);
});
