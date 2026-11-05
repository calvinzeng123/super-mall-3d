// 园区标注去重：被西苑塔楼挡住的标注隐藏，屏幕上重叠的只留近处 / 各期名称，相机背后的不画。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { declutterLabels, towerOccluders, labelRect, LABEL_PRIORITY } from '../src/render/label-declutter.js';

const label = (x, y, z, style = 'entrance', w = .2, h = .026) => {
  const s = new THREE.Sprite(); s.center.set(.5, 0); s.scale.set(w, h, 1); s.position.set(x, y, z);
  s.userData.prio = LABEL_PRIORITY[style] ?? 1; return s;
};
const cam = (pos, target) => {
  const c = new THREE.PerspectiveCamera(42, 1.6, .3, 12000); c.position.set(...pos); c.lookAt(...target); c.updateMatrixWorld(); return c;
};

test('西苑 H1 视角：塔楼背后的共享车库标注被挡住隐藏，塔楼自身名称仍显示', () => {
  const occ = towerOccluders(L), W1 = L.buildings.find((b) => b.id === 'W1');
  assert.ok(occ.some((b) => b.userData.id === 'W1') && occ.some((b) => b.userData.id === 'T2'));
  const c = cam([-330, 95, -315], [-425, 40, -236]);
  const behind = label(-470, 6.5, -205), front = label(-400, 30, -262);
  declutterLabels([behind, front], c, occ);
  assert.equal(behind.visible, false, '塔楼背后的标注仍画在塔身上');
  assert.ok(front.visible);
  // 从低处仰看：塔楼名称在自身塔顶上方，不被自己的包围盒挡住；被另一栋塔挡住时才隐藏。
  const low = cam([-300, 40, -330], [-430, 80, -236]), title = label(W1.center[0], 85.5 + 26, W1.center[1], 'title', .5, .04);
  title.userData.building = 'W1';
  declutterLabels([title], low, occ);
  assert.ok(labelRect(title, low) && title.visible);
});

test('屏幕上重叠的标注只留一个：近处优先，各期名称按 2.5 倍优先；相机背后与画面外的不画', () => {
  const c = cam([0, 50, 200], [0, 0, 0]);
  const near = label(0, 5, 50), far = label(0, 5.4, 40);   // same screen spot, the farther one drops
  const titleFar = label(80, 20, -300, 'title', .3, .04), entranceNear = label(80, 20, -260);
  const back = label(0, 5, 400), aside = label(5000, 5, 0);
  for (const s of [near, far, titleFar, entranceNear, back, aside]) s.visible = true;
  declutterLabels([near, far, titleFar, entranceNear, back, aside], c, []);
  const r = [near, far].map((s) => labelRect(s, c));
  assert.ok(r[0].x0 < r[1].x1 && r[1].x0 < r[0].x1 && r[0].y0 < r[1].y1 && r[1].y0 < r[0].y1, '测试前提：两枚标注在屏幕上重叠');
  assert.ok(near.visible && !far.visible);
  assert.ok(back.visible === false && aside.visible === false);
  assert.ok(titleFar.visible, '各期名称被近处小标注挤掉');
});
