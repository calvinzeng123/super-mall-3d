// 几何工具单元测试：局部坐标系、SAT、多边形裁剪、走道相接、圆厅外轮廓。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  frame, toW, toL, lrectPoly, lseg, rect, rectPoly, convexOverlap, polysOverlap, clipConvex, circlePoly, polyArea, polysConnect, polySamples, pointInPoly,
} from '../src/layout/geom.js';
import { hubOutline } from '../src/layout/hub.js';

test('frame：局部 ↔ 世界互逆，门面法线随 frame 旋转', () => {
  const F = frame(10, -5, 30);
  const [x, z] = toW(F, 3, 4);
  const [u, v] = toL(F, x, z);
  assert.ok(Math.abs(u - 3) < 1e-9 && Math.abs(v - 4) < 1e-9);
  const s = lseg(frame(0, 0, 90), { x0: 0, z0: 7, x1: 10, z1: 7, side: 'N' });
  assert.ok(Math.abs(s.nx - 1) < 1e-9 && Math.abs(s.nz) < 1e-9, '90° frame 的 N（−v）应指向 +x');
});

test('凹多边形相交：U 形缺口里的方块不算重叠（SAT 会误判），压到翼、整块落在翼内都算，相接不算', () => {
  const U = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]];
  const notch = rectPoly(rect(12, 15, 18, 25));
  assert.equal(convexOverlap(U, notch), true);
  assert.equal(polysOverlap(U, notch), false);
  assert.equal(polysOverlap(U, rectPoly(rect(8, 15, 14, 25))), true);
  assert.equal(polysOverlap(U, rectPoly(rect(2, 15, 8, 25))), true);
  assert.equal(polysOverlap(rectPoly(rect(2, 15, 8, 25)), U), true);
  assert.equal(polysOverlap(U, rectPoly(rect(30, 0, 40, 10))), false);
});

test('SAT：相接不算重叠，交叠算重叠，旋转矩形也成立', () => {
  const a = lrectPoly(frame(0, 0, 0), rect(0, 0, 10, 10));
  assert.equal(convexOverlap(a, lrectPoly(frame(0, 0, 0), rect(10, 0, 20, 10))), false);
  assert.equal(convexOverlap(a, lrectPoly(frame(0, 0, 0), rect(9, 0, 20, 10))), true);
  // 45° 旋转、边长 6 的正方形：最左顶点在 中心x − 4.24
  assert.equal(convexOverlap(a, lrectPoly(frame(13, 5, 45), rect(-3, -3, 3, 3))), true);
  assert.equal(convexOverlap(a, lrectPoly(frame(14.5, 5, 45), rect(-3, -3, 3, 3))), false);
});

test('clipConvex：圆盘与半平面相交面积正确', () => {
  const disk = circlePoly(0, 0, 10, 240);
  const half = clipConvex(disk, [[-20, 0], [20, 0], [20, 20], [-20, 20]]);
  assert.ok(Math.abs(Math.abs(polyArea(half)) - Math.PI * 50) < 1.5);
});

test('polysConnect：共边 ≥1m 相连，只碰一个角不相连', () => {
  const r = (x0, z0, x1, z1) => lrectPoly(frame(0, 0, 0), rect(x0, z0, x1, z1));
  assert.equal(polysConnect(r(0, 0, 5, 5), r(5, 0, 9, 5)), true);
  assert.equal(polysConnect(r(0, 0, 5, 5), r(5, 5, 9, 9)), false);
  assert.equal(polysConnect(r(0, 0, 5, 5), r(2, 2, 3, 3)), true);
});

test('hubOutline：Y 形三翼轮廓包含圆心与各翼末端，翼楼之间露出圆弧', () => {
  const rots = [{ id: 'C', x: 0, z: 0, R: 34 }];
  const arms = [{ id: 'a', rot: 'C', deg: 45, uEnd: 84 }, { id: 'b', rot: 'C', deg: 165, uEnd: 96 }, { id: 'c', rot: 'C', deg: 285, uEnd: 88 }];
  const out = hubOutline(rots, arms, 23);
  assert.ok(pointInPoly([0, 0], out));
  for (const a of arms) assert.ok(pointInPoly(toW(frame(0, 0, a.deg), a.uEnd - 1, 0), out), `${a.id} 末端`);
  assert.ok(pointInPoly(toW(frame(0, 0, 105), 33.5, 0), out), '105° 处圆弧内侧');
  assert.ok(!pointInPoly(toW(frame(0, 0, 105), 34.5, 0), out), '105° 处圆弧外侧');
  for (const p of polySamples(lrectPoly(frame(0, 0, 45), rect(26, -22.9, 83.9, 22.9)), 3)) assert.ok(pointInPoly(p, out));
});

test('hubOutline：两圆厅由连接翼相连，三翼轮廓闭合', () => {
  const rots = [{ id: 'A', x: 0, z: 0, R: 30 }, { id: 'B', x: 104, z: 0, R: 30 }];
  const arms = [{ id: 'W', rot: 'A', deg: 135, uEnd: 86 }, { id: 'M', rot: 'A', to: 'B', deg: 0 }, { id: 'E', rot: 'B', deg: 45, uEnd: 72 }];
  const out = hubOutline(rots, arms, 23);
  for (const p of [[0, 0], [104, 0], [52, 0], [52, 22], [52, -22]]) assert.ok(pointInPoly(p, out), `${p} 应在轮廓内`);
  assert.ok(pointInPoly(toW(frame(0, 0, 135), 85, 0), out));
  assert.ok(pointInPoly(toW(frame(104, 0, 45), 71, 0), out));
  assert.ok(!pointInPoly([52, 24], out) && !pointInPoly([52, -24], out), '中翼两侧之外');
  assert.ok(pointInPoly(toW(frame(0, 0, 270), 29.5, 0), out) && !pointInPoly(toW(frame(0, 0, 270), 30.5, 0), out), 'A 北侧圆弧');
});

test('hubOutline：相邻翼在圆外相交时直接相接，末端可拼接附属轮廓，结果为简单多边形', async () => {
  const { hubOutline } = await import('../src/layout/hub.js');
  const { frame: fr, toW: tw } = await import('../src/layout/geom.js');
  const C = { id: 'C', x: -106, z: -106, R: 34 };
  const chain = [[-192.53, -160], [-280, -160], [-280, -240], [-160, -240], [-160, -192.53]];
  const arms = [
    { id: 'SE', rot: 'C', deg: 45, uEnd: 84 }, { id: 'W', rot: 'C', deg: 165, uEnd: 96 },
    { id: 'NW', rot: 'C', deg: 225, uEnd: 99.37, annex: chain }, { id: 'N', rot: 'C', deg: 285, uEnd: 88 },
  ];
  const P = hubOutline([C], arms, 23);
  // 简单多边形：任意两条不相邻的边不相交
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const hit = (p, q, r, s) => cross(p, q, r) * cross(p, q, s) < -1e-9 && cross(r, s, p) * cross(r, s, q) < -1e-9;
  for (let i = 0; i < P.length; i++) {
    for (let j = i + 2; j < P.length; j++) {
      if (i === 0 && j === P.length - 1) continue;
      assert.ok(!hit(P[i], P[(i + 1) % P.length], P[j], P[(j + 1) % P.length]), `边 ${i} 与边 ${j} 相交`);
    }
  }
  // 西翼与西北翼之间的连接点 = 西翼北边与西北翼西南边的交点（u=39.85 处）
  const I = tw(fr(-106, -106, 225), 39.85, -23);
  assert.ok(P.some((p) => Math.hypot(p[0] - I[0], p[1] - I[1]) < 0.02), '缺少西翼 / 西北翼交点');
  // 两个交点之间不再有圆弧点
  const ang = (p) => (((Math.atan2(p[1] + 106, p[0] + 106) * 180) / Math.PI) + 360) % 360;
  assert.ok(!P.some((p) => Math.abs(Math.hypot(p[0] + 106, p[1] + 106) - 34) < 0.01 && ang(p) > 208 && ang(p) < 242), '西翼与北翼之间仍有圆弧');
  // 方庭拼接：外轮廓包含方庭四角中的三个外角
  for (const q of [[-280, -160], [-280, -240], [-160, -240]]) assert.ok(P.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6));
});
