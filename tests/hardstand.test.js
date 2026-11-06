// 消防登高场地（supertall P0a, SPEC §1.0 / §2.1；GB 55037 §3.4.6–7, GB 50016 §7.2.1–2）：hardstandRecord() 的形状，
// hardstandErrors() 对今天四块场地（北苑 HS1 / HS2 在 site.fireAccess，西苑 HS-W1 / HS-W2 在 site.westGarden.hardstands）
// 无误，并逐类报错：尺寸、短边、离外墙 5–10 m、覆盖整条长边、场地内或场地与外墙之间的树 / 车位 / 坡道口 / 建筑。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { rect } from '../src/layout/geom.js';
import { HARDSTAND, hardstandRecord, hardstandErrors, allHardstands, hardstandFace } from '../src/layout/hardstand.js';

const T1 = L.buildings.find((b) => b.id === 'T1');
const HS1 = L.site.fireAccess.find((h) => h.id === 'HS1');
const has = (errs, re) => errs.some((e) => re.test(e));
/** A copy of the layout whose site has `extra` obstacles (nothing shared is mutated). */
const withSite = (patch) => ({ ...L, site: { ...L.site, ...patch(L.site) } });

test('今天四块消防登高场地全部合规；两份清单都被读取', () => {
  assert.deepEqual(allHardstands(L.site).map((h) => h.id), ['HS1', 'HS2', 'HS-W1', 'HS-W2']);
  for (const h of allHardstands(L.site)) assert.deepEqual(hardstandErrors(h, h.tower ?? h.building, L), [], h.id);
  // by id, from either list
  assert.deepEqual(hardstandErrors('HS-W2', 'W2', L), []);
  assert.deepEqual(hardstandErrors('HS-X', 'W2', L), ['hardstand: missing']);
  assert.equal(hardstandFace(HS1.rect, T1.bounds), 'N');
  const rec = hardstandRecord({ id: 'HS-R1', building: 'R1', rect: rect(28, -195.4, 70, -185.4), face: 'S' });
  assert.deepEqual(Object.keys(rec).sort(), ['building', 'face', 'id', 'label', 'name', 'poly', 'rect', 'tower']);
  assert.equal(rec.label, '消防登高场地'); assert.equal(rec.tower, 'R1'); assert.equal(rec.poly.length, 4);
  assert.deepEqual(HARDSTAND, { long: 20, short: 10, near: 5, far: 10, label: '消防登高场地', tol: 1e-6 });
});

test('hardstandErrors：尺寸、短边、离墙距离、整条长边、障碍物逐类报错', () => {
  const at = (r, face) => hardstandErrors({ id: 'HS-test', rect: r, ...(face ? { face } : {}) }, T1, L);
  // T1: plate x[-278, -242] z[-240, -224]; HS1 x[-278, -242] z[-255, -245] (5 m off the north face)
  assert.ok(has(at(rect(-278, -255, -242, -248)), /size 36\.00 × 7\.00/));
  assert.ok(has(at(rect(-278, -251, -242, -241)), /near edge 1\.00 m off the N facade/));
  assert.ok(has(at(rect(-278, -262, -242, -252)), /near edge 12\.00 m off the N facade/));
  assert.ok(has(at(rect(-270, -255, -242, -245)), /does not cover the full N side/));
  assert.ok(has(at(rect(-237, -240, -227, -219), 'E'), /face E is a short side/));
  // obstacles inside it, or between it and the facade (trees, parking stalls)
  const tree = (x, z) => withSite((S) => ({ urban: { ...S.urban, trees: [...S.urban.trees, { x, z, y: 0, s: 1, kind: 'round' }] } }));
  assert.ok(has(hardstandErrors(HS1, T1, tree(-260, -250)), /tree .* inside it/));
  assert.ok(has(hardstandErrors(HS1, T1, tree(-260, -242.5)), /tree .* between it and the facade/));
  assert.deepEqual(hardstandErrors(HS1, T1, tree(-260, -270)), [], 'a tree beyond the hardstand is fine');
  const stall = { ...L, extensions: { ...L.extensions, surfaceParking: [...L.extensions.surfaceParking,
    { id: 'test-lot', stalls: [{ id: 'test-stall', poly: [[-262, -252], [-259.5, -252], [-259.5, -247], [-262, -247]] }] }] } };
  assert.ok(has(hardstandErrors(HS1, T1, stall), /parking stall test-stall inside it/));
  // west: a stall of the west parking lot in the strip in front of W1
  const W1 = L.buildings.find((b) => b.id === 'W1'), HSW1 = L.site.westGarden.hardstands.find((h) => h.id === 'HS-W1');
  const lots = withSite((S) => ({ westParking: { ...S.westParking, lots: [...S.westParking.lots, { id: 'x', stalls: [{ id: 'w-stall', poly: [[-460, -226], [-457.5, -226], [-457.5, -222.5], [-460, -222.5]] }] }] } }));
  assert.ok(has(hardstandErrors(HSW1, W1, lots), /parking stall w-stall between it and the facade/));
});
