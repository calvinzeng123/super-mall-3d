// 丧尸围城的任务物件（src/jimao/siege-props.js + siege.js 里的 lockerModel / switchModel / toolModel / gateModel / gateBlock / flareModel）：
// 图集分区、各档内存要不要图集、没有 document 时照样建得出来、每个物件几次绘制、关卡大件不往楼梯口外面伸、解决以后的动画方向、几何体复用。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ATLAS, atlasRect, atlasSize, nosingY, STAIR, flameLayout, propStats, propMats, fireStep, flameMaterial, Kit, SHUTTER, DOOR } from '../src/jimao/siege-props.js';
import { lockerModel, switchModel, toolModel, gateModel, gateBlock, flareModel, GATES } from '../src/jimao/siege.js';
import { MEMORY_PROFILES } from '../src/render/device.js';

test('图集：分区都在 1024² 里、互不重叠；UV 矩形在 0–1 之间（v 朝上）', () => {
  const list = Object.entries(ATLAS);
  for (const [k, [x, y, w, h]] of list) {
    assert.ok(w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 1024, k);
    const r = atlasRect(k); assert.ok(r.u0 >= 0 && r.u1 <= 1 && r.v0 >= 0 && r.v1 <= 1 && r.u0 < r.u1 && r.v0 < r.v1, k);
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [a, A] = list[i], [b, B] = list[j];
    const overlap = A[0] < B[0] + B[2] && B[0] < A[0] + A[2] && A[1] < B[1] + B[3] && B[1] < A[1] + A[3];
    assert.ok(!overlap, `${a} 和 ${b} 重叠`);
  }
  assert.equal(atlasRect('nope'), null);
  const r = atlasRect('wood'); assert.equal(r.v1, 1, '画布最上面一行是 v = 1');
});

test('图集大小跟内存档：省内存档不要图集，手机两档 512²，电脑 1024²；都不超过 1024²', () => {
  assert.equal(atlasSize(MEMORY_PROFILES.compact), 0);
  assert.equal(atlasSize(MEMORY_PROFILES.standard), 512);
  assert.equal(atlasSize(MEMORY_PROFILES.rich), 512);
  assert.equal(atlasSize(MEMORY_PROFILES.full), 1024);
  for (const m of Object.values(MEMORY_PROFILES)) assert.ok(atlasSize(m) <= 1024);
});

test('没有 document：材质照样建（没有贴图）、物件照样搭，不抛错', () => {
  assert.equal(typeof document, 'undefined');
  const M = propMats();
  assert.equal(M.map, null); assert.equal(M.paint.map, null); assert.ok(M.paint.vertexColors);
  for (const make of [lockerModel, switchModel, flareModel, () => toolModel('撬棍'), () => toolModel('保险丝'), () => toolModel('灭火器'), () => toolModel('门禁卡'), ...Object.keys(GATES).map((t) => () => gateModel(t)), ...Object.keys(GATES).map((t) => () => gateBlock(t))]) {
    const g = make(); assert.ok(g.isGroup); g.userData.update?.(0.1); g.userData.setState?.('cut'); g.userData.clear?.(); g.userData.update?.(0.5); g.userData.reset?.();
  }
});

test('每个物件只有几次绘制：同材质的零件合并了', () => {
  const budget = { locker: 10, switch: 8, flare: 4, tool: 6, sign: 6, block: 9 };
  const check = (name, g, cap) => { const s = propStats(g); assert.ok(s.draws <= cap, `${name}：${s.draws} 次绘制（上限 ${cap}）`); assert.ok(s.tris < 4000, `${name}：${s.tris} 个三角形`); return s; };
  check('武器柜', lockerModel(), budget.locker); check('配电柜', switchModel(), budget.switch); check('信号弹', flareModel(), budget.flare);
  for (const t of ['撬棍', '保险丝', '灭火器', '门禁卡']) check(t, toolModel(t), budget.tool);
  for (const t of Object.keys(GATES)) { check(`${t} 交互点`, gateModel(t), budget.sign); check(`${t} 大件`, gateBlock(t), budget.block); }
  // 合并前后对比：杂物堆以前 4 个方块 4 次绘制，现在几十个零件也只有两三次
  const deb = propStats(gateBlock('debris')); assert.ok(deb.draws <= 3 && deb.tris > 300, JSON.stringify(deb));
});

test('同一种物件的几何体全局只建一次（一局一局重开不漏显存）', () => {
  const a = gateBlock('debris'), b = gateBlock('debris');
  const geos = (g) => { const out = []; g.traverse((o) => o.isMesh && out.push(o.geometry)); return out; };
  assert.deepEqual(geos(a), geos(b));
  assert.equal(toolModel('撬棍').children.find((c) => c.isMesh).geometry, toolModel('撬棍').children.find((c) => c.isMesh).geometry);
});

test('关卡大件：横向不出梯段宽（1.3 米），不往楼梯口前面的平台伸（以前的方块就到 z ≈ -0.5）', () => {
  for (const t of Object.keys(GATES)) {
    const g = gateBlock(t); g.updateMatrixWorld(true);
    const box = new THREE.Box3();
    g.traverse((o) => { if (!o.isMesh || !o.visible || o.material?.blending === THREE.AdditiveBlending || o.material?.isShaderMaterial) return; o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); });
    assert.ok(box.min.x > -0.8 && box.max.x < 0.8, `${t}：x ${box.min.x.toFixed(2)}…${box.max.x.toFixed(2)}`);
    assert.ok(box.min.z > -0.75, `${t}：最靠前 z = ${box.min.z.toFixed(2)}`);
    assert.ok(box.max.y < 3.1, `${t}：最高 ${box.max.y.toFixed(2)} 米`);
  }
});

test('解决以后：杂物推到 +x、火灭了（烟再飘一会儿）留下干粉、卷帘收上去、防火门朝人这边（-z）转开；reset 回原样', () => {
  const deb = gateBlock('debris'); deb.userData.clear(); deb.userData.update(1); assert.ok(deb.children[0].position.x > 1);
  const fire = gateBlock('fire'), junk = fire.children[0], powder = fire.children.find((c) => c.name === '干粉');
  const flames = junk.children.find((c) => c.name === 'flames');
  fire.userData.update(0.5); assert.ok(flames.material.uniforms.uTime.value > 0.4, '火苗在动');
  fire.userData.clear(); for (let i = 0; i < 30; i++) fire.userData.update(1 / 30);
  assert.ok(flames.material.uniforms.uFade.value < 0.25, '明火一秒多就灭'); assert.equal(powder.visible, true, '地上留下干粉');
  const smoke = junk.children.find((c) => c.name === 'smoke'); assert.ok(smoke.material.uniforms.uFade.value > 0.5, '烟还在飘');
  for (let i = 0; i < 200; i++) fire.userData.update(1 / 30); assert.equal(junk.visible, false, '烟也散了');
  fire.userData.reset(); assert.equal(junk.visible, true); assert.equal(powder.visible, false); assert.equal(flames.material.uniforms.uFade.value, 1);
  const fuse = gateBlock('fuse'), cur = fuse.children[0]; assert.equal(cur.position.y, SHUTTER.top);
  fuse.userData.clear(); for (let i = 0; i < 60; i++) fuse.userData.update(1 / 30); assert.ok(cur.scale.y < 0.1, `卷帘收到 ${cur.scale.y.toFixed(2)}`);
  fuse.userData.reset(); assert.equal(cur.scale.y, 1);
  const lock = gateBlock('lock'), leaf = lock.children[0];
  lock.userData.clear(); for (let i = 0; i < 40; i++) lock.userData.update(1 / 30);
  const end = new THREE.Vector3(DOOR.leaf, 1, 0).applyEuler(leaf.rotation).add(leaf.position);
  assert.ok(end.z < -0.6, `门扇的另一头转到人这边：z = ${end.z.toFixed(2)}`);
  lock.userData.reset(); assert.equal(leaf.rotation.y, 0); assert.equal(leaf.position.x, -DOOR.half);
});

test('物件的状态：完成（cut）以后光柱、门、拉杆、工具按约定显隐，指示灯从红换绿', () => {
  const vis = (g, pred) => { let v = null; g.traverse((o) => { if (pred(o)) v = o.visible; }); return v; };
  const L = lockerModel(); L.userData.setState('cut');
  assert.equal(vis(L, (o) => o.userData.beacon), false); assert.equal(vis(L, (o) => o.userData.cutHide && o.isGroup), false); assert.equal(vis(L, (o) => o.userData.cutShow), true);
  const S = switchModel(), lamps = () => S.children.filter((c) => c.isMesh && c.geometry.type === 'CylinderGeometry');
  const red = propMats().ledRed, green = propMats().ledGreen;
  assert.equal(lamps()[0].material, red); S.userData.setState('cut'); assert.equal(lamps()[1].material, green); assert.notEqual(lamps()[0].material, red);
  const T = toolModel('灭火器'), item = T.children.find((c) => c.userData.cutHide); assert.ok(item); T.userData.setState('cut'); assert.equal(item.visible, false);
  const F = flareModel(), lit = F.children.find((c) => c.userData.cutShow); assert.equal(lit.visible, false); F.userData.setState('cut'); assert.equal(lit.visible, true); F.userData.update(0.2);
});

test('纯函数：踏步前沿高度、火苗排布、Kit 合并、fireStep', () => {
  assert.equal(nosingY(STAIR.start - 1), 0); assert.ok(Math.abs(nosingY(0) - 0.7 * STAIR.slope) < 1e-9);
  const L = flameLayout(7); assert.equal(L.length, 7);
  for (const f of L) { assert.ok(Math.abs(f.x) < 0.62 && f.h > 0.6 && f.h < 1.8 && f.w > 0.3); }
  assert.ok(L[3].h > L[0].h, '中间的火比两边高');
  const k = new Kit(false); k.box('paint', 1, 1, 1, { color: 0xff0000 }); k.box('paint', 1, 1, 1, { p: [2, 0, 0] }); k.cyl('metal', 0.1, 0.1, 1, 8);
  const geos = k.geometries(); assert.deepEqual(Object.keys(geos).sort(), ['metal', 'paint']);
  assert.equal(geos.paint.attributes.position.count, 48); assert.ok(geos.paint.attributes.color);
  const m = flameMaterial(); fireStep([m], 3.5, 0.4); assert.equal(m.uniforms.uTime.value, 3.5); assert.equal(m.uniforms.uFade.value, 0.4);
  const m2 = flameMaterial(); assert.notEqual(m.uniforms.uTime, m2.uniforms.uTime, '每处火自己一份时间');
});

test('火苗卡片大致横着摆（不顺着梯段斜穿踏步）；火、烟、信号弹的几何体各局共用，材质各自一份', () => {
  for (const f of flameLayout(7)) assert.ok(Math.abs(f.turn) <= 0.25 + 1e-9, `turn ${f.turn.toFixed(2)}`);
  const parts = (g) => { const m = {}; g.traverse((o) => { if (o.name && (o.isMesh || o.isPoints)) m[o.name] = o; }); return m; };
  const a = parts(gateBlock('fire')), b = parts(gateBlock('fire'));
  for (const k of ['flames', 'embers', 'smoke', 'fire-glow']) { assert.ok(a[k], k); assert.equal(a[k].geometry, b[k].geometry, `${k} 几何体共用`); assert.notEqual(a[k].material, b[k].material, `${k} 材质各自一份`); }
  const fa = flareModel(), fb = flareModel(), lit = (g) => g.children.find((c) => c.userData.cutShow);
  const ga = []; lit(fa).traverse((o) => o.isMesh && ga.push(o.geometry)); const gb = []; lit(fb).traverse((o) => o.isMesh && gb.push(o.geometry));
  assert.deepEqual(ga, gb, '信号弹点着以后的火苗、烟、红光几何体共用');
});
