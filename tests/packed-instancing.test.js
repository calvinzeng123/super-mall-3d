// 省内存档（手机）下 BatchSet.flush() 出来的网格顶点是压缩的，还原用的平移 / 缩放在网格自己的矩阵里。
// 拿它的几何体去做实例化时必须把这层还原乘进每个实例的矩阵（batch.js 的 instanceMatrix），
// 否则整件东西缩在原点——手机上公寓 / 酒店 / 塔楼的消防梯段、电梯轿厢「不见了」就是这么来的。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { instanceMatrix, packPositions } from '../src/render/batch.js';

test('instanceMatrix：压缩过的几何体，实例矩阵里先还原再摆放；没压缩的原样', () => {
  // 一个 4 × 2 × 6 的盒子，中心在 (10, 5, -3)
  const pos = new Float32Array([8, 4, -6, 12, 4, -6, 12, 6, 0, 8, 6, 0]);
  const packed = packPositions(pos);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(packed.array, 3, true)); g.userData.packedPositions = true;
  const source = new THREE.Mesh(g); source.position.fromArray(packed.center); source.scale.fromArray(packed.half); source.updateMatrix();
  const place = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(100, 20, 50);
  const m = instanceMatrix(source, place.clone());
  const P = g.attributes.position;
  for (let i = 0; i < 4; i++) {
    const got = new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(m), want = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(place);
    assert.ok(got.distanceTo(want) < 0.01, `顶点 ${i}：${got.toArray().map((v) => v.toFixed(2))} ≠ ${want.toArray().map((v) => v.toFixed(2))}`);
  }
  // 不过这一遍：顶点还在 [-1, 1] 的小方块里
  assert.ok(new THREE.Vector3().fromBufferAttribute(P, 0).applyMatrix4(place).distanceTo(new THREE.Vector3(8, 4, -6).applyMatrix4(place)) > 5);
  const plain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); plain.position.set(3, 3, 3); plain.updateMatrix();
  assert.deepEqual(instanceMatrix(plain, place.clone()).elements, place.elements, '没压缩的几何体不动');
});

test('拿 flush() 出来的几何体做实例化的地方都过了 instanceMatrix', () => {
  const dir = new URL('../src/render/build/', import.meta.url);
  const hits = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    // 同一个文件里既 flush 出模板、又把模板的几何体交给 InstancedMesh
    if (/\.flush\(/.test(src) && /new THREE\.InstancedMesh\(\s*(source|src|m|template)\.geometry/.test(src)) hits.push([f, /instanceMatrix\(/.test(src)]);
  }
  assert.deepEqual(hits.map(([f]) => f).sort(), ['facade-modules.js', 'mall-stairs.js', 'tower-elevators.js', 'tower-stairs.js'], '有新的实例化点：照样过一遍 instanceMatrix，再加进这张清单');
  for (const [f, ok] of hits) assert.ok(ok, `${f} 没有调 instanceMatrix`);
});
