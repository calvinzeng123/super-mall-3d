// 立面楼层模块（supertall P0b · SPEC §2.2 facade-modules.js）：一层的几何画一次，按层实例化（每个材质一个
// InstancedMesh，矩阵 = 塔楼坐标系 × 标高）；隐藏 / 恢复某层的实例；「黑色实例」规则：批次几何带 color 属性，
// 图元几何用无顶点色的克隆材质（保留该塔的剪切平面）。全园区所有塔楼外壳里没有会画成黑色的实例网格。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { renderContext } from './render-context.js';
import { moduleSet, blackInstance, plainInstanceMaterial } from '../src/render/build/facade-modules.js';
import { buildCommunityTower } from '../src/render/build/community.js';
import { buildHospitalityTower } from '../src/render/build/hospitality.js';

const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
const mats = new Proxy({}, { get: (m, k) => (m[k] ||= Object.assign(new THREE.MeshBasicMaterial({ vertexColors: true, clippingPlanes: [plane] }), { name: k })) });
const b = { id: 'MT', frame: { ox: 100, oz: -50, deg: 0, a: 0, c: 1, s: 0 } };
const levels = Array.from({ length: 12 }, (_, i) => ({ id: `MT-${i + 2}F`, elev: 4.5 + 3 * i, height: 3 }));

test('moduleSet：一层画一次（BatchSet），每个材质一个 InstancedMesh，每层一个实例，矩阵 = 塔楼坐标系 × 标高', () => {
  const mods = moduleSet({}, b, mats, { local: true });
  mods.build('A', (B) => { B.get('facadePlaster').box(0, 1.5, 0, 10, 3, .2, '#ffffff'); B.get('glassTint').box(0, 1.5, .2, 8, 2, .02, '#ffffff'); });
  const ims = mods.instance('A', levels);
  assert.equal(ims.length, 2);
  for (const im of ims) {
    assert.equal(im.count, levels.length);
    assert.ok(im.geometry.attributes.color, '批次几何必须带 color（否则画成黑色）');
    assert.ok(!blackInstance(im));
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    im.getMatrixAt(3, m); p.setFromMatrixPosition(m);
    assert.deepEqual(p.toArray().map((v) => +v.toFixed(3)), [100, levels[3].elev, -50]);
    assert.ok(im.material.clippingPlanes.includes(plane), '实例沿用该塔的剪切平面');
  }
});

test('隐藏 / 恢复某层：该层所有材质的实例矩阵置零缩放，其他层不动；handle.visible 读写同一状态', () => {
  const mods = moduleSet({}, b, mats);
  mods.build('A', (B) => { B.get('facadePlaster').box(0, 1.5, 0, 10, 3, .2, '#fff'); B.get('extMetal').box(0, 3, 0, 10, .1, .3, '#333'); });
  const ims = mods.instance('A', levels), scale = (im, i) => { const m = new THREE.Matrix4(), s = new THREE.Vector3(); im.getMatrixAt(i, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); return s.x; };
  mods.hide('MT-5F');
  for (const im of ims) { assert.equal(scale(im, 3), 0); assert.equal(scale(im, 2), 1); }
  const h = mods.handle('MT-5F');
  assert.equal(h.visible, false);
  h.visible = true;
  for (const im of ims) assert.equal(scale(im, 3), 1);
});

test('图元实例（立柱、百叶等）：材质是无顶点色的克隆，颜色逐实例设置，保留剪切平面——不会画成黑色', () => {
  const mods = moduleSet({}, b, mats, { local: true });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const im = mods.primitive('fins', box, mats.extSatin, levels, (lv) => [new THREE.Matrix4().makeTranslation(-5, lv.elev + 1.5, -8), new THREE.Matrix4().makeTranslation(5, lv.elev + 1.5, -8)],
    { colors: (lv, i) => (i % 2 ? '#8a7a5c' : '#3e3b37') });
  assert.equal(im.count, levels.length * 2);
  assert.ok(!im.material.vertexColors && !blackInstance(im) && im.instanceColor);
  assert.ok(im.material.clippingPlanes.includes(plane));
  assert.notEqual(im.material, mats.extSatin, '不得改动批次材质本身');
  assert.ok(mats.extSatin.vertexColors);
  // A vertex-colour batch material on primitive geometry is exactly the black-instance case the rule forbids.
  assert.ok(blackInstance(new THREE.InstancedMesh(box, mats.extSatin, 1)));
  assert.ok(!plainInstanceMaterial(mats.extSatin).vertexColors);
});

test('黑色实例规则（全园区十栋高塔外壳）：每个材质开着顶点色的 InstancedMesh 都带 color 属性', () => {
  const ctx = renderContext(L);
  let n = 0;
  for (const b of L.buildings.filter((q) => q.kind === 'tower')) {
    const rec = b.community ? buildCommunityTower(ctx, b, ctx.hospitality.buildings) : buildHospitalityTower(ctx, b, ctx.hospitality.buildings);
    rec.group.traverse((o) => { if (o.isInstancedMesh) { n++; assert.ok(!blackInstance(o), `${b.id} ${o.name} 会画成黑色`); } });
  }
  assert.ok(n >= 4 * 5, `只找到 ${n} 个实例网格`);
});
