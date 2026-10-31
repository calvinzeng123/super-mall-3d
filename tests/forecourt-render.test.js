import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { frame, toL } from '../src/layout/geom.js';
import { BatchSet } from '../src/render/batch.js';
import { buildForecourt } from '../src/render/build/forecourt.js';

const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };

for (const rotation of [90, 0]) test(`游乐城堡旋转 ${rotation}° 后，滑梯和爬塔的真实顶点仍在乐园内而非云环路口`, () => {
  const source = L.site.forecourt.items.find(i => i.type === 'play-castle');
  const item = { ...source, rotation, frame: frame(source.x, source.z, rotation) };
  const material = new THREE.MeshBasicMaterial();
  const B = new BatchSet({});
  const group = new THREE.Group();
  buildForecourt({
    layout: { site: { forecourt: { zones: [], paths: [], items: [item] } } },
    site: { group, batch: B }, mats: { floor: () => material }, dynamic: [],
  });
  let count = 0;
  for (const batch of Object.values(B.sets)) {
    const mesh = batch.mesh(material);
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), [u, v] = toL(item.frame, x, z);
      assert.ok(Math.abs(u) <= item.w / 2 + .01 && Math.abs(v) <= item.d / 2 + .01,
        `游具顶点越出乐园：${x.toFixed(2)}, ${z.toFixed(2)}`);
      assert.ok(Math.hypot(x, z) > 100, '游具误出现在云环天桥中央道路');
      count++;
    }
    mesh.geometry.dispose();
  }
  assert.ok(B.sets.extSatin.n > 100, '滑道必须保留，不能通过删除游具消除错位');
  assert.ok(count > 5000, '必须检查完整爬塔、滑道和场地，而不是空网格');
  assert.equal(B.xf, null, '局部变换须在绘制后恢复');
  group.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
  material.dispose();
});
