// 丧尸围城的任务物件（src/jimao/siege-props.js + siege.js 里的 lockerModel / switchModel / toolModel / gateModel / gateBlock / flareModel）：
// 图集分区、各档内存要不要图集、没有 document 时照样建得出来、每个物件几次绘制、关卡大件不往楼梯口外面伸、解决以后的动画方向、几何体复用。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ATLAS, atlasRect, atlasSize, nosingY, STAIR, flameLayout, propStats, propMats, fireStep, flameMaterial, Kit, SHUTTER, DOOR, FIRE, faceYaw, propTop, softSlab, switchLever } from '../src/jimao/siege-props.js';
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

/** 物件里不透明、看得见的网格的所有三角形（物件自己的坐标系） */
function solidTris(g) {
  g.updateMatrixWorld(true);
  const shown = (o) => { for (let p = o; p && p !== g.parent; p = p.parent) if (p.visible === false) return false; return true; };
  const out = [];
  g.traverse((o) => {
    if (!o.isMesh || o.userData.beacon || o.material?.isShaderMaterial || o.material?.transparent || !shown(o)) return;
    const P = o.geometry.attributes.position, I = o.geometry.index, n = I ? I.count : P.count;
    const v = (k) => new THREE.Vector3().fromBufferAttribute(P, I ? I.getX(k) : k).applyMatrix4(o.matrixWorld);
    for (let k = 0; k < n; k += 3) out.push(new THREE.Triangle(v(k), v(k + 1), v(k + 2)));
  });
  return out;
}
test('目标光柱不穿过物件：光柱那一截（芯 6 厘米宽）跟物件的任何一个三角形都不相交，而且从物件顶上不远处起', () => {
  const all = { 武器柜: lockerModel(), 配电柜: switchModel(), 信号弹: flareModel(), ...Object.fromEntries(['撬棍', '保险丝', '灭火器', '门禁卡'].map((t) => [t, toolModel(t)])), ...Object.fromEntries(Object.keys(GATES).map((t) => [`${t} 交互点`, gateModel(t)])) };
  for (const [name, g] of Object.entries(all)) {
    let b = null; g.traverse((o) => { if (o.userData.beacon) b = o; });
    assert.ok(b, `${name} 有光柱`); assert.equal(b.material.blending, THREE.AdditiveBlending, `${name}：光柱是加色的光，不是实心棍子`);
    const y0 = b.position.y, y1 = y0 + b.scale.y, box = new THREE.Box3(new THREE.Vector3(b.position.x - 0.03, y0, b.position.z - 0.03), new THREE.Vector3(b.position.x + 0.03, y1, b.position.z + 0.03));
    const hit = solidTris(g).find((t) => box.intersectsTriangle(t));
    assert.ok(!hit, `${name}：光柱 ${y0.toFixed(2)}–${y1.toFixed(2)} 米穿过了物件`);
    assert.ok(y1 - y0 >= 0.69 && y1 >= 2.3, `${name}：光柱 ${y0.toFixed(2)}–${y1.toFixed(2)} 米，太短`);
    const top = Math.max(propTop(g), propTop(g, 0.3)); assert.ok(y0 - 0.1 <= top + 1e-6, `${name}：光柱离物件顶（${top.toFixed(2)}）太远，起在 ${y0.toFixed(2)}`);
  }
  // 桌上的工具：光柱从工具上面起（以前从离地 0.2 米起，正好穿过桌面和门禁卡）
  let b = null; toolModel('门禁卡').traverse((o) => { if (o.userData.beacon) b = o; }); assert.ok(b.position.y > 0.72, `门禁卡的光柱起在 ${b.position.y.toFixed(2)}`);
});

test('物件朝向：近处有墙就背靠墙；四面空就正面朝最开阔的一边；量不出来不转', () => {
  const dir = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
  // 墙在 -x 方向 0.6 米：正面（本地 +z）转到朝 +x
  let y = faceYaw((dx) => (dx < -0.7 ? 0.6 / -dx : 4)); let [fx, fz] = dir(y); assert.ok(fx > 0.95 && Math.abs(fz) < 0.3, `朝 ${fx.toFixed(2)}, ${fz.toFixed(2)}`);
  // 四面都离墙 2 米以上，+z 方向一条 4 米长的走廊：朝 +z
  y = faceYaw((dx, dz) => (dz > 0.9 ? 4 : 2)); [fx, fz] = dir(y); assert.ok(fz > 0.9, `朝 ${fx.toFixed(2)}, ${fz.toFixed(2)}`);
  assert.equal(faceYaw(() => 3), 0, '四面一样：不转');
  assert.equal(faceYaw(() => NaN), 0, '量不出来：不转');
});

test('着火：人走近时从灯池借一盏灯照亮四周（暖色、随火苗闪），走远了、火灭了、关卡拆掉时都还回去', () => {
  let lent = 0; const lights = [];
  const pool = { acquire() { lent++; const light = new THREE.PointLight(0xffffff, 0, 12, 2); lights.push(light); return { light, release() { lent--; light.intensity = 0; } }; } };
  const G = { render: { lightPool: pool }, player: { pos: new THREE.Vector3(0, 0, -3) }, blackout: { level: 1, gain: 0.6 } };
  const root = new THREE.Group(), fire = gateBlock('fire'); root.add(fire);
  fire.userData.update(1 / 30, G); assert.equal(lent, 1, '人在 3 米外：借了一盏');
  const L = lights[0]; assert.ok(L.intensity > 0.5 * FIRE.light.intensity && L.intensity < 1.3 * FIRE.light.intensity, `亮度 ${L.intensity}`);
  assert.ok(L.color.r > L.color.b * 3, '暖色'); assert.ok(L.position.y > 0.5 && L.position.y < 2, `灯在火堆上方 ${L.position.y.toFixed(2)}`);
  const seen = new Set(); for (let i = 0; i < 10; i++) { fire.userData.update(1 / 30, G); seen.add(L.intensity.toFixed(3)); } assert.ok(seen.size > 3, '一闪一闪');
  const smoke = fire.children[0].children.find((c) => c.name === 'smoke-ceiling'); assert.ok(smoke, '顶上积了一层烟'); assert.equal(smoke.material.uniforms.uDay.value, 0, '停电：烟不是灰白的');
  G.player.pos.set(40, 0, 0); fire.userData.update(1 / 30, G); assert.equal(lent, 0, '走远了：还回去');
  G.player.pos.set(0, 0, -2); fire.userData.update(1 / 30, G); assert.equal(lent, 1);
  fire.userData.clear(); for (let i = 0; i < 60; i++) fire.userData.update(1 / 30, G); assert.equal(lent, 0, '火灭了：还回去');
  fire.userData.reset(); fire.userData.update(1 / 30, G); assert.equal(lent, 1, '重来：火又亮');
  fire.userData.dispose(); assert.equal(lent, 0, '关卡拆掉：还回去');
  const lone = gateBlock('fire'); root.add(lone); lone.userData.update(1 / 30, { render: {}, player: G.player }); lone.userData.update(1 / 30); assert.equal(lent, 0, '没有灯池：火照样烧、不报错');
});

test('软垫（床垫）：圆角、往下弯，顶点和法线都是有限数、法线是单位长；不弯的时候也不出 NaN', () => {
  for (const geo of [softSlab(0.8, 0.17, 1.9, { r: 0.06, bendAt: -0.45, R: 0.28, sag: 0.03 }), softSlab(0.5, 0.13, 0.32, { r: 0.025, seg: [4, 2, 4] })]) {
    const P = geo.attributes.position, N = geo.attributes.normal, v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { assert.ok(Number.isFinite(P.getX(i) + P.getY(i) + P.getZ(i))); v.fromBufferAttribute(N, i); assert.ok(Math.abs(v.length() - 1) < 1e-3); }
  }
  const bent = softSlab(0.8, 0.17, 1.9, { bendAt: -0.45, R: 0.28 }); bent.computeBoundingBox();
  assert.ok(bent.boundingBox.min.y < -0.3, `弯下去的那一截垂到 ${bent.boundingBox.min.y.toFixed(2)}`);
});

test('配电柜的闸刀：分闸、合闸两个状态的红握把都在柜门外面（以前转反了，整根扎进柜子里）', () => {
  for (const up of [false, true]) {
    const lev = switchLever(up); lev.updateMatrixWorld(true);
    const box = new THREE.Box3(); lev.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    assert.ok(box.min.z > 0.226, `${up ? '合闸' : '分闸'}：最里到 z = ${box.min.z.toFixed(3)}（柜门在 0.226）`);
    const mid = (box.min.y + box.max.y) / 2; assert.ok(up ? box.max.y > 1.05 : box.min.y < 0.67, `${up ? '朝上' : '朝下'}：${box.min.y.toFixed(2)}–${box.max.y.toFixed(2)}，中 ${mid.toFixed(2)}`);
  }
});
