// 二期 R1–R4 渲染（supertall P0b 的 M0 部分；之后由 P-R 接着加近景 / 中景 / 远景预算）：
// 每层的住宅外壳不再逐层 clone（每层 +5 次绘制），而是每塔每个材质一个 InstancedMesh、每个标准层一个实例；
// 实例几何带 color（黑色实例规则）；进入某层室内时只隐藏这一层的实例（零缩放），其余楼层照常。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { renderContext, drawnMeshes } from './render-context.js';
import { buildHospitalityTower } from '../src/render/build/hospitality.js';
import { setResidentialDetailLevel } from '../src/render/build/residential-shell.js';
import { blackInstance } from '../src/render/build/facade-modules.js';

const R = ['R1', 'R2', 'R3', 'R4'];
const ctx = renderContext(L);
for (const id of R) buildHospitalityTower(ctx, L.buildings.find((b) => b.id === id), ctx.hospitality.buildings);

test('M0：R 每塔的标准层外壳是每个材质一个 InstancedMesh，实例数 = 标准层数；近景 ≤ 25 次绘制（以前约 130）', () => {
  for (const id of R) {
    const rec = ctx.hospitality.buildings.get(id), storeys = L.levels.filter((l) => l.building === id && l.units.some((u) => u.residence?.prototype));
    const shells = []; rec.group.traverse((o) => { if (o.isInstancedMesh && o.userData.kind === 'residential-lod') shells.push(o); });
    assert.ok(shells.length >= 3 && shells.length <= 6, `${id} ${shells.length} 个外壳实例网格`);
    for (const im of shells) {
      assert.equal(im.count, storeys.length, `${id} ${im.name}`);
      assert.ok(!blackInstance(im) && im.geometry.attributes.color, `${id} ${im.name} 缺 color 属性`);
    }
    // No per-storey clones are left.
    let clones = 0; rec.group.traverse((o) => { if (o.name?.endsWith('-residential-lod')) clones++; });
    assert.equal(clones, 0);
    const near = drawnMeshes(rec.group).filter((m) => !m.userData.towerStairs);
    assert.ok(near.length <= 25, `${id} 近景 ${near.length} 个网格`);
  }
});

test('进入某层室内时只隐藏这一层的外壳实例（零缩放），离开后恢复；其他楼层不受影响', () => {
  const rec = ctx.hospitality.buildings.get('R1'), lv = 'R1-12F';
  const shells = []; rec.group.traverse((o) => { if (o.isInstancedMesh && o.userData.kind === 'residential-lod') shells.push(o); });
  const index = shells[0].userData.levels.indexOf(lv);
  assert.ok(index >= 0);
  const scale = (im, i) => { const m = new THREE.Matrix4(), s = new THREE.Vector3(); im.getMatrixAt(i, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); return s.y; };
  setResidentialDetailLevel(ctx, 'R1', lv);
  for (const im of shells) { assert.equal(scale(im, index), 0, im.name); assert.equal(scale(im, index + 1), 1); }
  assert.equal(rec.residentialShells.get(lv).visible, false);
  assert.equal(rec.residentialShells.get('R1-13F').visible, true);
  setResidentialDetailLevel(ctx, 'R1', null);
  for (const im of shells) assert.equal(scale(im, index), 1);
});
