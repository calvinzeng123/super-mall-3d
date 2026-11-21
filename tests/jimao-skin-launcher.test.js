// G40 榴弹枪的外形和表面（src/jimao/skins/launcher-skin.js）：贴图配方、几何工具、整枪的尺寸约束。
// 测试环境没有 document：贴图一律不做，材质是纯色的，几何照常生成——这几条路都不能报错。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pw, walnut, blued, textureSet, loft, lathe, stripShape, curve2, extrude, plain, finish, merge, G40, buildG40, wearable, createG40Materials } from '../src/jimao/skins/launcher-skin.js';
import { LAUNCHER_VIEW, createLauncher } from '../src/jimao/launcher.js';

const count = (g) => g.attributes.position.count;
const box = (g) => { g.computeBoundingBox(); return g.boundingBox; };

test('分段线性表：中间插值、两头夹住', () => {
  const t = [[0, 1], [2, 5], [3, 5]];
  assert.equal(pw(t, -1), 1); assert.equal(pw(t, 1), 3); assert.equal(pw(t, 2.5), 5); assert.equal(pw(t, 9), 5);
});

test('胡桃木和烤蓝钢的配方：范围对、可复现、接得上缝；木纹顺着 u、细而直（不是斑马纹）；钢是近中性的深灰（只偏一点蓝）、没有麻点', () => {
  const S = 64, W = walnut(S, 4), W2 = walnut(S, 4), B = blued(S, 2);
  for (const [name, R] of [['walnut', W], ['blued', B]]) {
    assert.equal(R.color.length, S * S * 3, name); assert.equal(R.height.length, S * S); assert.equal(R.mask.length, S * S);
    assert.ok(R.color.every((v) => v >= 0 && v < 256), `${name} 颜色在范围里`); assert.ok(R.rough.every((v) => v >= 0 && v <= 1) && R.mask.every((v) => v >= 0 && v <= 1), name);
  }
  assert.deepEqual([...W.color.slice(0, 30)], [...W2.color.slice(0, 30)]); assert.notDeepEqual([...W.color.slice(0, 30)], [...walnut(S, 5).color.slice(0, 30)]);
  const mean = (R, c) => { let s = 0; for (let k = c; k < R.color.length; k += 3) s += R.color[k]; return s / (R.color.length / 3); };
  assert.ok(mean(W, 0) > mean(W, 2) * 1.8, '木头偏红棕');
  // 钢：底色近中性，蓝只偏一点（偏多了白天看是一层蓝灰漆）；整体是深的
  assert.ok(mean(B, 2) > mean(B, 0) * 1.02 && mean(B, 2) < mean(B, 0) * 1.12 && mean(B, 0) > 40 && mean(B, 0) < 62, `钢近中性的深灰：${mean(B, 0).toFixed(1)} / ${mean(B, 2).toFixed(1)}`);
  // 顺纹：沿 u（横向）相邻像素的差，比沿 v（竖向）的小得多
  const grad = (R) => { let du = 0, dv = 0; for (let y = 0; y < S - 1; y++) for (let x = 0; x < S - 1; x++) { const i = (y * S + x) * 3; du += Math.abs(R.color[i + 3] - R.color[i]); dv += Math.abs(R.color[i + S * 3] - R.color[i]); } return [du, dv]; };
  const [wu, wv] = grad(W); assert.ok(wv > wu * 2, `木纹顺着 u：横 ${wu.toFixed(0)} 竖 ${wv.toFixed(0)}`);
  // 不是斑马纹：相邻两行的亮度差的平均值，比整张图的明暗跨度小一个量级
  let lo = 255, hi = 0; for (let i = 0; i < W.color.length; i += 3) { lo = Math.min(lo, W.color[i]); hi = Math.max(hi, W.color[i]); }
  assert.ok(wv / ((S - 1) * (S - 1)) < (hi - lo) * 0.2, '线细、反差缓');
  // 钢：颜色几乎是匀的（没有麻点），粗糙度有缓缓的深浅
  let sd = 0; const m0 = mean(B, 0); for (let i = 0; i < B.color.length; i += 3) sd += (B.color[i] - m0) ** 2; sd = Math.sqrt(sd / (S * S));
  assert.ok(sd < m0 * 0.2, `钢的颜色匀：均值 ${m0.toFixed(1)} 标准差 ${sd.toFixed(1)}`);
  // 粗糙度：有一点深浅，但幅度小（金属高光对粗糙度很敏感，起伏大了高光里是一块一块的雾斑）
  let rl = 1, rh = 0; for (const v of B.rough) { rl = Math.min(rl, v); rh = Math.max(rh, v); } assert.ok(rh - rl > 0.04 && rh - rl < 0.2 && rh < 0.55 && rl > 0.2, `钢的粗糙度 ${rl.toFixed(2)} … ${rh.toFixed(2)}`);
  // 拉丝：一行一条（竖向相邻像素的高度差明显比横向大），而且幅度小
  { let du = 0, dv = 0; for (let y = 0; y < S - 1; y++) for (let x = 0; x < S - 1; x++) { const i = y * S + x; du += Math.abs(B.height[i + 1] - B.height[i]); dv += Math.abs(B.height[i + S] - B.height[i]); } assert.ok(dv > du * 1.5 && dv / ((S - 1) * (S - 1)) < 0.08, `拉丝顺着 u、很浅：横 ${du.toFixed(1)} 竖 ${dv.toFixed(1)}`); }
  // 木头的细节层：只有细线和棕眼（平均在 0.5 上下，没有宽色带的大起伏），钢没有
  assert.equal(W.detail.length, S * S); assert.equal(B.detail, undefined);
  { let m = 0; for (const v of W.detail) { assert.ok(v >= 0 && v <= 1); m += v; } m /= S * S; assert.ok(Math.abs(m - 0.5) < 0.06, `细节层的平均 ${m.toFixed(3)}`); }
  // 接缝：最后一列接第一列、最后一行接第一行，跳变不比里面的大多少
  for (const R of [W, B]) { let seam = 0, inner = 0; for (let y = 0; y < S; y++) { seam += Math.abs(R.color[(y * S + S - 1) * 3] - R.color[y * S * 3]); inner += Math.abs(R.color[(y * S + 31) * 3] - R.color[(y * S + 32) * 3]); } assert.ok(seam < inner * 3 + S * 2, `左右接缝 ${seam.toFixed(0)} / ${inner.toFixed(0)}`); }
});

test('放样和车削：三角形数、UV 按真实尺寸、面朝外；车削绕一圈的贴图重复整数次，长直段两头补了点', () => {
  // 边长 2 厘米、长 10 厘米的方管
  const sq = (z) => [[-0.01, -0.01, z], [0.01, -0.01, z], [0.01, 0.01, z], [-0.01, 0.01, z]];
  const g = finish(loft([sq(0), sq(0.05), sq(0.1)], { tileU: 0.1, tileV: 0.04, capStart: true, capEnd: true }));
  assert.equal(count(g) / 3, 2 * 4 * 2 + 4 * 2);
  const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv; let umax = 0, vmax = 0;
  for (let i = 0; i < count(g); i++) {
    const out = P.getX(i) * N.getX(i) + P.getY(i) * N.getY(i) + (P.getZ(i) - 0.05) * N.getZ(i); assert.ok(out > 0, '法线朝外');
    assert.ok(Math.abs(Math.hypot(N.getX(i), N.getY(i), N.getZ(i)) - 1) < 1e-5);
    if (i < 2 * 4 * 6) { umax = Math.max(umax, UV.getX(i)); vmax = Math.max(vmax, UV.getY(i)); }
  }
  assert.ok(Math.abs(umax - 1) < 1e-6 && Math.abs(vmax - 2) < 1e-6, `10 厘米长 = 1 格，周长 8 厘米 = 2 格（${umax}, ${vmax}）`);
  // 朝里的管子（枪膛）
  const inner = finish(loft([sq(0), sq(0.1)], { flip: true })); for (let i = 0; i < count(inner); i++) assert.ok(inner.attributes.position.getX(i) * inner.attributes.normal.getX(i) + inner.attributes.position.getY(i) * inner.attributes.normal.getY(i) < 0);
  // 车削：半径 2 厘米的圆管，tile 4 厘米 → 周长 12.57 厘米取整 3 圈
  const tube = finish(lathe([[0, 0.02], [-0.1, 0.02]], { segs: 16, tileU: 0.05, tileV: 0.04 }));
  assert.equal(count(tube) / 3, 16 * 2 * 3, '10 厘米的直段两头各补一圈：3 段'); let v1 = 0; for (let i = 0; i < count(tube); i++) v1 = Math.max(v1, tube.attributes.uv.getY(i)); assert.equal(v1, 3);
  for (let i = 0; i < count(tube); i++) { const x = tube.attributes.position.getX(i), y = tube.attributes.position.getY(i), nx = tube.attributes.normal.getX(i), ny = tube.attributes.normal.getY(i); assert.ok((x * nx + y * ny) / 0.02 > 0.999, '圆管的法线是径向的（接缝处也是）'); }
  assert.equal(count(lathe([[0, 0.02], [-0.1, 0.02]], { segs: 8, refine: 0 })) / 3, 16);
});

test('木纹投影：UV 按位置取，不跟着截面的大小走；侧面的纹顺着轴线，截面放大的地方不发散；两个件用同一个投影时相贯处纹路一样', () => {
  // 一根越往后越高的方木（前头 2 厘米高，后头 6 厘米高），木纹轴线水平
  const sq = (z, h) => [[-0.01, -h, z], [0.01, -h, z], [0.01, h, z], [-0.01, h, z]];
  const g = loft([sq(0, 0.01), sq(0.1, 0.03)], { tileU: 0.2, tileV: 0.1, grain: { slope: 0 }, capStart: true, capEnd: true });
  const P = g.attributes.position, UV = g.attributes.uv;
  for (let i = 0; i < 2 * 4 * 3; i++) { const d = UV.getX(i) - P.getZ(i) / 0.2; assert.ok(Math.abs(d) < 1e-6 || Math.abs(d - 0.21) < 1e-6, 'u 顺着轴线走（朝上朝下的面错开 0.21 格）'); }
  // 右侧面（x = +0.01 的那一条）：v 只跟 y 有关——同一个 y 在前后两个截面上 v 一样，纹是平行的
  const side = []; for (let t = 0; t < 2 * 4; t++) { const idx = [t * 3, t * 3 + 1, t * 3 + 2]; if (idx.every((i) => Math.abs(P.getX(i) - 0.01) < 1e-9)) side.push(...idx); }
  assert.equal(side.length, 6, '右侧面两个三角形');
  for (const i of side) { assert.ok(Math.abs(UV.getY(i) - P.getY(i) / 0.1) < 1e-6, 'v = y / tileV'); assert.ok(Math.abs(UV.getX(i) - P.getZ(i) / 0.2) < 1e-6, 'u = z / tileU'); }
  // 顶面：v 取 x
  const top = []; for (let t = 0; t < 2 * 4; t++) { const idx = [t * 3, t * 3 + 1, t * 3 + 2]; if (idx.every((i) => P.getY(i) > 0.009)) top.push(...idx); }
  assert.equal(top.length, 6); const vs = top.map((i) => UV.getY(i) - P.getX(i) / 0.1); assert.ok(vs.every((v) => Math.abs(v - vs[0]) < 1e-6), '顶面 v 跟着 x');
  // 轴线往下斜：沿着斜的方向走，u 涨、v 不变
  const tilt = loft([sq(0, 0.01), sq(0.1, 0.01)], { tileU: 0.2, tileV: 0.1, grain: { slope: 0.3, shift: [0.1, 0.2] } }), TP = tilt.attributes.position, TU = tilt.attributes.uv;
  for (let t = 0; t < count(tilt) / 3; t++) for (const i of [t * 3, t * 3 + 1, t * 3 + 2]) if ([0, 1, 2].every((c) => Math.abs(TP.getX(t * 3 + c) - 0.01) < 1e-9)) { const along = -TP.getY(i) * Math.sin(0.3) + TP.getZ(i) * Math.cos(0.3), perp = TP.getY(i) * Math.cos(0.3) + TP.getZ(i) * Math.sin(0.3); assert.ok(Math.abs(TU.getX(i) - (along / 0.2 + 0.1)) < 1e-6 && Math.abs(TU.getY(i) - (perp / 0.1 + 0.2)) < 1e-6); }
  // 枪托和握把：同一个投影，所以侧面上同一个位置的 UV 是同一个函数——拿整枪的木头几何查：右侧面上所有顶点都满足同一个式子
  const m = buildG40(), W = m.body.wood, WP = W.attributes.position, WN = W.attributes.normal, WU = W.attributes.uv, sl = G40.grainSlope; let checked = 0;
  for (let t = 0; t < count(W) / 3; t++) {
    const idx = [t * 3, t * 3 + 1, t * 3 + 2]; if (!idx.every((i) => WN.getX(i) > 0.97)) continue;
    for (const i of idx) { const along = (-WP.getY(i) * Math.sin(sl) + WP.getZ(i) * Math.cos(sl)) / 0.3, perp = (WP.getY(i) * Math.cos(sl) + WP.getZ(i) * Math.sin(sl)) / 0.15; assert.ok(Math.abs(WU.getX(i) - along) < 1e-5 && Math.abs(WU.getY(i) - perp) < 1e-5, '枪托、握把右侧面：u 顺着枪托中线、v 垂直于它'); checked++; }
  }
  assert.ok(checked > 60, `查了 ${checked} 个顶点`);
  for (const g2 of [...Object.values(m.body), ...Object.values(m.tube), m.shell, g, tilt]) g2.dispose();
});

test('棱角的磨损和暗角：凸棱有磨损、平面中间没有、凹角发暗；大平面三个角都在棱上的只给三成', () => {
  // 一根带一圈凸箍的管子：箍的棱是凸的，箍脚是凹的
  const g = finish(lathe([[0, 0.02], [-0.04, 0.02], [-0.04, 0.024], [-0.05, 0.024], [-0.05, 0.02], [-0.1, 0.02]], { segs: 16 }), { edge: 1, occl: 1 });
  const P = g.attributes.position, K = g.attributes.aSkin; let top = 0, foot = 0, far = 0;
  for (let i = 0; i < count(g); i++) {
    const r = Math.hypot(P.getX(i), P.getY(i)), z = P.getZ(i);
    if (r > 0.0239) top = Math.max(top, K.getY(i)); else if (Math.abs(z + 0.04) < 1e-6 || Math.abs(z + 0.05) < 1e-6) { foot = Math.max(foot, K.getX(i)); assert.equal(K.getY(i), 0, '凹角不磨'); }
    if (z < -0.06 || z > -0.03) far = Math.max(far, K.getY(i), K.getX(i));
  }
  assert.ok(top > 0.9, `箍的棱磨损 ${top}`); assert.ok(foot > 0.9, `箍脚发暗 ${foot}`); assert.equal(far, 0, '离棱 3 毫米以外的管身是干净的');
  // 挤出的方块：端面的三角形三个角都在棱上——只给三成；侧面的倒角是细条，给足
  const e = finish(extrude(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.03, 0), new THREE.Vector2(0.03, 0.02), new THREE.Vector2(0, 0.02)]), 0.01, { bevel: 0.001 }), { edge: 1 });
  let capMax = 0, bevelMax = 0;
  for (let t = 0; t < count(e) / 3; t++) { const nx = Math.abs(e.attributes.normal.getX(t * 3)); for (let c = 0; c < 3; c++) { const w = e.attributes.aSkin.getY(t * 3 + c); if (nx > 0.999) capMax = Math.max(capMax, w); else bevelMax = Math.max(bevelMax, w); } }
  assert.ok(capMax > 0 && capMax <= 0.31, `端面 ${capMax}`); assert.ok(bevelMax > 0.9, `倒角 ${bevelMax}`);
  assert.ok(Math.abs(box(e).max.x - 0.005) < 1e-6 && Math.abs(box(e).min.x + 0.005) < 1e-6 && Math.abs(box(e).max.z - 0.03) < 1e-6, '侧面轮廓挤出：厚度沿 x 居中，倒角不撑大外廓');
  // extra：手动加的磨损 / 暗角叠在上面，夹在 0–1
  const x = finish(lathe([[0, 0.02], [-0.1, 0.02]], { segs: 16 }), { extra: (px, py, pz) => [pz < -0.05 ? 2 : 0, 0.25] });
  for (let i = 0; i < count(x); i++) { assert.equal(x.attributes.aSkin.getY(i), x.attributes.position.getZ(i) < -0.05 ? 1 : 0); assert.equal(x.attributes.aSkin.getX(i), 0.25); }
});

test('小工具：加粗的中线、光滑曲线、自带几何转换、拼合', () => {
  const s = stripShape([[0, 0], [0.01, 0], [0.02, 0]], 0.002).getPoints(); assert.equal(s.length, 6); assert.ok(s.every((p) => Math.abs(Math.abs(p.y) - 0.001) < 1e-9));
  const c = curve2([[0, 0], [1, 1], [2, 0]], 9); assert.equal(c.length, 9); assert.deepEqual(c[0], [0, 0]); assert.ok(Math.abs(c[8][0] - 2) < 1e-9 && c[4][1] > 0.9);
  const t = plain(new THREE.TorusGeometry(0.01, 0.002, 4, 6), 2, 3); assert.equal(count(t) / 3, 4 * 6 * 2); assert.equal(t.index, null);
  const a = finish(lathe([[0, 0.01], [-0.01, 0.01]], { segs: 6, refine: 0 })), b = plain(new THREE.BoxGeometry(0.01, 0.01, 0.01)), na = count(a), nb = count(b);
  const m = merge([a, null, b]); assert.equal(count(m), na + nb); assert.equal(m.attributes.aSkin.count, na + nb); assert.equal(m.attributes.aSkin.getY(na + 1), 0, '没有 aSkin 的补 0'); assert.ok(m.attributes.normal && m.attributes.uv);
});

test('G40 整枪：三角形数在预算里、数据都是有限的；枪管那一组相对铰链；缺口和准星对着瞄准线；枪托不挡视线；握把、护木还在手的位置', () => {
  const V = LAUNCHER_VIEW, m = buildG40({ hinge: V.hinge });
  assert.ok(m.triangles > 3000 && m.triangles < 8600, `三角形 ${m.triangles}`);
  assert.deepEqual(Object.keys(m.body), ['steel', 'dark', 'wood', 'rubber', 'ink']); assert.deepEqual(Object.keys(m.tube), ['steel', 'dark', 'wood', 'bore', 'ink']);
  for (const g of [...Object.values(m.body), ...Object.values(m.tube), m.shell]) {
    assert.ok(g && count(g) % 3 === 0);
    for (const k of ['position', 'normal', 'uv']) assert.ok(g.attributes[k].array.every(Number.isFinite), k);
    if (g.attributes.aSkin) assert.ok(g.attributes.aSkin.array.every((v) => v >= 0 && v <= 1));
  }
  assert.ok(m.tube.bore.attributes.color && m.tube.ink.attributes.color && m.body.ink.attributes.color, '枪膛和漆点用顶点色');
  // 枪管：从药室口（z = 0）到枪口（V.muzzle），相对铰链
  const barrel = box(m.tube.steel); assert.ok(Math.abs(barrel.min.z + V.hinge[2] - V.muzzle[2]) < 1e-4, '枪口在 muzzle'); assert.ok(Math.abs(barrel.max.z + V.hinge[2]) < 1e-4, '药室口在 z = 0');
  assert.ok(Math.abs((barrel.max.x + barrel.min.x) / 2) < 1e-4 && barrel.max.x > 0.024 && barrel.max.x < 0.03);
  // 瞄准线：缺口、准星尖都在 sightY（开镜时 V.ads 把这个高度放在屏幕正中）
  assert.ok(Math.abs(G40.notchY - V.sightY) < 0.001 && Math.abs(G40.bladeY - V.sightY) < 0.001); assert.ok(G40.frontZ < G40.sightZ && G40.sightZ < 0);
  const sights = box(m.tube.dark); assert.ok(Math.abs(sights.max.y + V.hinge[1] - G40.leafTop) < 1e-3, '表尺框立着'); assert.ok(sights.min.z + V.hinge[2] < G40.frontZ);
  // 枪托：机匣后面的上沿一路往下走，处处比瞄准线低至少 2.5 厘米，到托底低 9 厘米以上（开镜时它在屏幕正下方，高了就是一大条木头）；
  // 镜头（开镜时在 z = −V.ads[2]）看缺口的那条线从它上面过
  let prev = Infinity; for (const [z, y] of G40.stockTop) { if (z < 0.0925) continue; assert.ok(y <= prev && y < V.sightY - 0.025, `z=${z} 上沿 ${y}`); prev = y; }
  assert.ok(prev < V.sightY - 0.09 && V.ads[2] <= -0.4 && V.ads[2] >= -0.47 && V.ads[0] === 0 && Math.abs(V.ads[1] + V.sightY) < 1e-9, '开镜：瞄准线在屏幕正中，枪不比原来近');
  const wood = box(m.body.wood), pad = box(m.body.rubber); assert.ok(wood.max.y < V.sightY - 0.025 && pad.max.y < V.sightY - 0.07 && pad.max.z < -V.ads[2] - 0.05, '托底在镜头前面、瞄准线下面');
  assert.ok(box(m.body.steel).max.y < V.sightY - 0.012, '机匣顶比瞄准线低');
  // 握把：步枪右手的基准点 (0, −0.1, 0.073) 落在握把里；护木：左手托的那一段（z −0.16 … −0.27）有木头，底在 −0.04 上下
  const P = m.body.wood.attributes.position; let zf = Infinity, zb = -Infinity, hw = 0;
  for (let i = 0; i < P.count; i++) if (Math.abs(P.getY(i) + 0.1) < 0.012 && P.getZ(i) < 0.14) { zf = Math.min(zf, P.getZ(i)); zb = Math.max(zb, P.getZ(i)); hw = Math.max(hw, Math.abs(P.getX(i))); }
  assert.ok(zf < 0.073 && zb > 0.073 && zb - zf > 0.035 && zb - zf < 0.06 && hw > 0.012 && hw < 0.018, `握把前后 ${zf.toFixed(3)} … ${zb.toFixed(3)}，半宽 ${hw.toFixed(4)}`);
  const fore = box(m.tube.wood); assert.ok(fore.min.z + V.hinge[2] < -0.27 && fore.max.z + V.hinge[2] > -0.05); assert.ok(Math.abs(fore.min.y + V.hinge[1] + 0.04) < 0.004 && fore.max.x < 0.03);
  // 弹底：露在药室口外面一截
  const shell = box(m.shell); assert.ok(shell.max.z + V.hinge[2] > 0.008 && shell.max.z + V.hinge[2] < 0.02);
  for (const g of [...Object.values(m.body), ...Object.values(m.tube), m.shell]) g.dispose();
});

test('没有画布（测试环境）：不做贴图、材质是纯色的、磨损着色器不装；整把枪照常建、照常拆', () => {
  assert.equal(textureSet(walnut(16, 1), 16), null); assert.equal(textureSet(null, 16), null);
  const L = createG40Materials(); assert.deepEqual(Object.keys(L.M), ['steel', 'dark', 'wood', 'rubber', 'brass', 'bore', 'ink']); assert.equal(L.textures.length, 0);
  for (const k of ['steel', 'dark', 'wood', 'rubber', 'brass']) { const m = L.M[k]; assert.equal(m.map, null); assert.equal(m.roughnessMap, null); assert.ok(m.roughness > 0.3 && m.roughness <= 1, `${k} 粗糙度 ${m.roughness}`); assert.equal(m.userData.wear, undefined); }
  assert.ok(L.M.wood.color.r > L.M.wood.color.b * 1.5 && L.M.bore.vertexColors && L.M.ink.vertexColors); assert.doesNotThrow(() => L.dispose());
  assert.equal(wearable(null), null); const bare = new THREE.MeshStandardMaterial(); assert.equal(wearable(bare), bare); assert.equal(bare.userData.wear, undefined);
  // 有粗糙度贴图的材质：着色器里接上 aSkin 和那几个量（这里只是改字符串，不用真的编译）
  const mat = new THREE.MeshStandardMaterial({ roughnessMap: new THREE.Texture() }); wearable(mat, { color: 0x808080, rough: 0.3, amount: 0.5, occl: 0.4 });
  assert.equal(mat.userData.wear.uWearRough.value, 0.3); assert.equal(mat.customProgramCacheKey(), 'g40-wear');
  const sh = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}', fragmentShader: '#include <common>\nvoid main() {\n#include <map_fragment>\n#include <roughnessmap_fragment>\n}' }; mat.onBeforeCompile(sh);
  assert.ok(sh.uniforms.uWearColor && sh.uniforms.uOccl.value === 0.4 && sh.uniforms.uSpec.value === 1 && sh.uniforms.uOcclRough.value === 0 && sh.uniforms.uDetail === undefined); assert.equal(mat.defines?.G40_DETAIL, undefined);
  assert.match(sh.vertexShader, /attribute vec2 aSkin;[\s\S]*vSkin = aSkin;/); assert.match(sh.fragmentShader, /varying vec2 vSkin;[\s\S]*skinWear[\s\S]*roughnessFactor = clamp\( mix/);
  // 木头那一档：高光压低、叠细节层（细节层的开关是一个宏，不开的材质不多取那两次贴图）
  const wd = new THREE.MeshStandardMaterial({ roughnessMap: new THREE.Texture() }); wearable(wd, { spec: 0.5, occlRough: -0.1, maskScale: [0.5, 1], detail: { scale: [3, 2], amount: 0.9, normal: 0.4 } });
  assert.equal(wd.defines.G40_DETAIL, ''); assert.deepEqual(wd.userData.wear.uDetail.value.toArray(), [3, 2, 0.9, 0.4]); assert.equal(wd.userData.wear.uSpec.value, 0.5); assert.deepEqual(wd.userData.wear.uMaskScale.value.toArray(), [0.5, 1]);
  const sh2 = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_end>' }; wd.onBeforeCompile(sh2);
  assert.match(sh2.fragmentShader, /G40_DETAIL[\s\S]*roughnessMap, vRoughnessMapUv \* uDetail\.xy[\s\S]*uMaskScale[\s\S]*tbn \* vec3\( dn\.xy \* uDetail\.w[\s\S]*directSpecular \*= uSpec/);
  // 整把枪
  const camera = new THREE.PerspectiveCamera(), gl = createLauncher({}, { camera, layer: 3 });
  let meshes = 0, tris = 0; gl.root.traverse((o) => { assert.equal(o.layers.mask, 1 << 3, '都在枪那一层'); if (o.isMesh) { meshes++; tris += o.geometry.attributes.position.count / 3; } });
  assert.ok(meshes <= 12, `绘制次数 ${meshes}`); assert.ok(tris < 8000);
  assert.equal(gl.parts.tube.position.y, LAUNCHER_VIEW.hinge[1]); assert.equal(gl.parts.shell.parent, gl.parts.tube); assert.equal(gl.parts.shell.visible, false); assert.ok(gl.parts.body.children.length >= 4);
  const mz = gl.muzzleWorld(); assert.ok(Math.abs(mz.z - LAUNCHER_VIEW.muzzle[2]) < 1e-9);
  assert.doesNotThrow(() => gl.dispose()); assert.equal(gl.root.parent, null);
});
