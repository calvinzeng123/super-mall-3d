// 队友 / 劫持者人形的质感（src/jimao/skins/rig-skin.js）和 buildParts 的新外观：纯逻辑部分 + 没有 document 时不生成贴图。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SURF, SURF_PARAMS, paint, paintGeo, ensureRig, mergeFlat, weather, REST_RANGE, MAX_SPOTS, lookUniforms, detailSize, detailContext, fillDetailRows,
  acquireRigDetail, releaseRigDetail, rigDetailState, surfGlsl, patchRigShader, createRigMaterial, sculpt, facePoint, humanHead, hairShell,
  macroContext, fillMacroRows, acquireRigDecals, releaseRigDecals, rigDecalsOn, DECAL, FACES, setDecalBox, decalBox, decalGeo, grimeGeo,
  torsoSurface, shellPatch, edgeTube, shoulderArch, lathe,
} from '../src/jimao/skins/rig-skin.js';
import { buildParts, RIG, merge } from '../src/jimao/soldier.js';
import { SQUAD } from '../src/jimao/squad.js';
import { MEMORY_PROFILES } from '../src/render/device.js';

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

test('表面种类和参数表一一对应，GLSL 查表按表生成', () => {
  const ids = Object.values(SURF);
  assert.equal(ids.length, SURF_PARAMS.length);
  assert.deepEqual([...ids].sort((a, b) => a - b), ids.map((_, i) => i), '种类编号从 0 连续');
  for (const p of SURF_PARAMS) {
    assert.equal(p.w.length, 4);
    assert.ok(p.rough > 0 && p.rough <= 1 && p.metal >= 0 && p.metal <= 1 && p.bump >= 0 && p.bump < 0.001 && p.fold >= 0 && p.fold < 0.004, '粗糙度 / 金属度 / 起伏在合理范围');
  }
  // 织纹周期：细图 R 每块 48 道、G 64 格——布料的织纹在 2–4 毫米（比真布粗一些，一两米外 720p 下还看得出；上一版 1–2 毫米被 mipmap 平均成光板）
  for (const k of ['CLOTH', 'SCRUBS', 'CORDURA', 'HIVIS']) { const p = SURF_PARAMS[SURF[k]], mm = 1000 / p.s / (p.w[0] >= p.w[1] ? 48 : 64); assert.ok(mm > 2 && mm < 4.2, `${k} 织纹 ${mm.toFixed(2)} 毫米`); }
  assert.equal(SURF_PARAMS[SURF.PLASTIC].fold, 0, '硬壳（安全帽、头盔）不起衣褶');
  assert.ok(SURF_PARAMS[SURF.RETRO].rough <= 0.3 && SURF_PARAMS[SURF.RETRO].metal >= 0.5, '反光条：低粗糙度、有金属感（银灰）');
  assert.ok(SURF_PARAMS[SURF.RETRO].retro > 0 && SURF_PARAMS.filter((p) => p.retro > 0).length === 1, '只有反光条逆反射');
  assert.equal(SURF_PARAMS[SURF.SKIN].blood, 0, '脸上不画血');
  const glsl = surfGlsl();
  assert.equal((glsl.match(/if \(t == \d+\)/g) || []).length, SURF_PARAMS.length);
  assert.match(glsl, /void rigSurf\(int t, out vec4 w, out vec4 a, out vec4 b, out vec4 x\)/);
  assert.doesNotMatch(glsl, /NaN|undefined/);
});

test('上色：顶点色 + rig 属性；ensureRig 只在混用时补齐', () => {
  const g = paintGeo(new THREE.BoxGeometry(1, 1, 1), 0xff0000, SURF.HIVIS);
  assert.equal(g.attributes.rig.itemSize, 4); assert.ok(g.attributes.rig.normalized);
  assert.equal(g.attributes.rig.array[0], SURF.HIVIS);
  assert.ok(Math.abs(g.attributes.color.array[0] - 1) < 1e-6 && g.attributes.color.array[1] === 0);
  const plain = new THREE.BoxGeometry(1, 1, 1);
  ensureRig([plain]); assert.equal(plain.attributes.rig, undefined, '都没带就不动（丧尸的旧模型）');
  ensureRig([g, plain]); assert.ok(plain.attributes.rig, '混用时补成布料');
  assert.equal(paint(0x123456, SURF.SKIN).surf, SURF.SKIN);
});

test('mergeFlat 和 toNonIndexed + mergeGeometries 的结果一致', () => {
  const a = paintGeo(new THREE.SphereGeometry(0.1, 6, 4), 0x336699, SURF.SKIN), b = paintGeo(new THREE.BoxGeometry(0.2, 0.1, 0.3).toNonIndexed(), 0x996633, SURF.CORDURA);
  const fast = mergeFlat([a, b]), ref = merge([a, b]);
  for (const name of ['position', 'normal', 'uv', 'color', 'rig']) {
    assert.equal(fast.attributes[name].count, ref.attributes[name].count, name);
    assert.deepEqual(Array.from(fast.attributes[name].array), Array.from(ref.attributes[name].array), name);
  }
  assert.equal(fast.index, null);
});

test('weather 记下站姿位置和是谁；lookUniforms 按 who 取脏和血，多出的血迹丢掉', () => {
  const g = weather(paintGeo(new THREE.BoxGeometry(0.2, 0.2, 0.2).toNonIndexed(), 0xffffff), { at: [0, 1, 0], who: 1 });
  const r = g.attributes.rest; assert.ok(r.normalized && r.array instanceof Int16Array);
  const y0 = r.array[1] / 32767 * REST_RANGE; assert.ok(Math.abs(y0 - (g.attributes.position.getY(0) + 1)) < 1e-3);
  assert.equal(r.array[3], 1);
  const u = lookUniforms([{ who: 0, grime: 0.3, blood: [{ c: [0, 1, 0], r: 0.1, k: 0.5 }] }, { who: 1, grime: 0.9, blood: Array.from({ length: 12 }, () => ({ c: [0, 0, 0], r: 0.1 })) }]);
  assert.equal(u.rigGrime.value.x, 0.3); assert.equal(u.rigGrime.value.y, 0.9);
  assert.equal(u.rigSpot.value.length, MAX_SPOTS); assert.equal(u.rigSpotK.value.length, MAX_SPOTS);
  assert.equal(u.rigSpotK.value[0].x, 0); assert.equal(u.rigSpotK.value[0].y, 0.5); assert.equal(u.rigSpotK.value[1].x, 1);
  assert.equal(u.rigSpotK.value[0].z, 1, '没写拉长就是圆的');
  const du = lookUniforms([{ who: 2, blood: [{ c: [0, 1, 0], r: 0.05, e: 3, a: 0.4 }] }]).rigSpotK.value, dr = du[0];
  assert.equal(dr.z, 3); assert.equal(dr.w, 0.4); assert.equal(du[MAX_SPOTS - 1].x, -1, '空位谁也不是');
  // 队友的血迹全部放得下
  const sq = lookUniforms(SQUAD.members.map((m) => m.look));
  assert.equal(sq.rigSpotK.value.filter((k) => k.x >= 0).length, SQUAD.members.reduce((n, m) => n + m.look.blood.length, 0));
});

test('细节图：按档位定大小（省内存档不要），可平铺，数值在 0–255', () => {
  assert.equal(detailSize(MEMORY_PROFILES.compact), 0);
  assert.equal(detailSize(MEMORY_PROFILES.standard), 256);
  assert.equal(detailSize(MEMORY_PROFILES.rich), 256);
  assert.equal(detailSize(MEMORY_PROFILES.full), 512);
  for (const m of Object.values(MEMORY_PROFILES)) assert.ok(detailSize(m) <= 1024);
  const size = 128, ctx = detailContext(size);
  let y = 0; while (y < size) y = fillDetailRows(ctx, y, Math.min(size, y + 5));
  const d = ctx.data; let min = 255, max = 0;
  for (let i = 0; i < d.length; i++) { min = Math.min(min, d[i]); max = Math.max(max, d[i]); }
  assert.ok(max - min > 100, '有起伏');
  // 无缝：跨过接缝的相邻像素之差，和图里普通相邻像素之差是一个量级（每个通道看平均值）
  const at = (x, yy, c) => d[(yy * size + x) * 4 + c];
  for (let c = 0; c < 4; c++) {
    let edge = 0, inner = 0;
    for (let i = 0; i < size; i++) { edge += Math.abs(at(0, i, c) - at(size - 1, i, c)) + Math.abs(at(i, 0, c) - at(i, size - 1, c)); inner += Math.abs(at(size >> 1, i, c) - at((size >> 1) - 1, i, c)) + Math.abs(at(i, size >> 1, c) - at(i, (size >> 1) - 1, c)); }
    assert.ok(edge <= inner * 1.6 + size * 2, `通道 ${c} 左右 / 上下接得上（接缝 ${edge}，图内 ${inner}）`);
  }
  const again = detailContext(size); fillDetailRows(again, 0, size); assert.deepEqual(Array.from(again.data.slice(0, 400)), Array.from(d.slice(0, 400)), '可复现');
  // 粗图同样无缝，四个通道都拉开了对比
  const mc = macroContext(64); let my = 0; while (my < 64) my = fillMacroRows(mc, my, Math.min(64, my + 7));
  const m = mc.data, mat = (x, yy, c) => m[(yy * 64 + x) * 4 + c];
  for (let c = 0; c < 4; c++) {
    let edge = 0, inner = 0, lo = 255, hi = 0;
    for (let i = 0; i < 64; i++) { edge += Math.abs(mat(0, i, c) - mat(63, i, c)) + Math.abs(mat(i, 0, c) - mat(i, 63, c)); inner += Math.abs(mat(32, i, c) - mat(31, i, c)) + Math.abs(mat(i, 32, c) - mat(i, 31, c)); }
    for (let i = c; i < m.length; i += 4) { lo = Math.min(lo, m[i]); hi = Math.max(hi, m[i]); }
    assert.ok(edge <= inner * 1.6 + 128, `粗图通道 ${c} 接得上`); assert.ok(hi - lo > 120, `粗图通道 ${c} 有对比`);
  }
  // 够快：拿的时候同步补完也不卡。不按墙上时间卡（机器一忙就挂过一次），改成卡「活有多少」：
  // 每一档最大的图（电脑 512² 细图 + 256² 粗图，手机两档 256² + 128²）一共多少像素；
  // 预生成一步 8 行，按行分几次填和一次填完一个像素都不差（分帧预生成的结果和同步生成一样）
  const px = (m) => { const s = detailSize(m); return s * s + (s >> 1) * (s >> 1); };
  assert.ok(px(MEMORY_PROFILES.full) <= 512 * 512 + 256 * 256, '电脑一档最多 512² + 256²');
  for (const m of [MEMORY_PROFILES.standard, MEMORY_PROFILES.rich]) assert.ok(px(m) <= px(MEMORY_PROFILES.full) / 4, `${m.name} 档的活是电脑的四分之一`);
  assert.equal(px(MEMORY_PROFILES.compact), 0);
  const one = detailContext(96); fillDetailRows(one, 0, 96);
  const parts = detailContext(96); for (let r = 0; r < 96; r += 8) assert.equal(fillDetailRows(parts, r, Math.min(96, r + 8)), Math.min(96, r + 8));
  assert.deepEqual(Array.from(parts.data), Array.from(one.data), '细图分段填和一次填完一样');
  const m1 = macroContext(48); fillMacroRows(m1, 0, 48); const m2 = macroContext(48); for (let r = 0; r < 48; r += 8) fillMacroRows(m2, r, Math.min(48, r + 8));
  assert.deepEqual(Array.from(m2.data), Array.from(m1.data), '粗图分段填和一次填完一样');
  // 墙上时间只兜一个很松的底（桌面上二三十毫秒，这里给到 3 秒）：只为抓住「一不小心变成逐像素建对象 / 平方级」这种量级上的退步
  const t0 = performance.now(); const big = detailContext(512); fillDetailRows(big, 0, 512); const bm = macroContext(256); fillMacroRows(bm, 0, 256);
  assert.ok(performance.now() - t0 < 3000, `生成用了 ${(performance.now() - t0).toFixed(0)} 毫秒`);
});

test('没有 document：不生成贴图，材质照样能建、能销毁', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(acquireRigDetail(512), null);
  assert.equal(rigDetailState(), null);
  releaseRigDetail();
  assert.equal(rigDecalsOn(), false); assert.equal(acquireRigDecals([{ face: 'zhe' }]), null); releaseRigDecals();
  const mat = createRigMaterial({ name: 't', looks: SQUAD.members.map((m) => m.look) });
  assert.ok(mat.vertexColors && typeof mat.onBeforeCompile === 'function');
  assert.equal(mat.defines.RIG_DETAIL, undefined, '没细节图就不开 RIG_DETAIL');
  // 着色器拼接：所有替换点都在 three 的着色器里找得到
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  mat.onBeforeCompile(shader);
  for (const s of ['vRest = vec4', 'attribute vec4 rest']) assert.ok(shader.vertexShader.includes(s), s);
  for (const s of ['rigSurf(rigT', 'roughnessFactor = rigRough', 'metalnessFactor = rigMetal', 'rigRetro * rigTint * irradiance', 'totalEmissiveRadiance *= 0.3', 'normalize( vViewPosition )']) assert.ok(shader.fragmentShader.includes(s), s);
  assert.ok(shader.uniforms.rigSpot && shader.uniforms.rigGrime);
  assert.equal(shader.uniforms.rigDetail, undefined);
  assert.doesNotMatch(shader.fragmentShader, /#ifdef RIG_DECAL[\s\S]*rigDecalBox\[slot/, '贴花数组不用动态下标（按循环挑）');
  const m2 = patchRigShader(new THREE.MeshStandardMaterial(), { value: null, macro: { value: null } }, [], { value: null });
  assert.equal(m2.defines.RIG_DETAIL, ''); assert.equal(m2.defines.RIG_DECAL, '');
  assert.notEqual(m2.customProgramCacheKey(), mat.customProgramCacheKey());
  const sh2 = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  m2.onBeforeCompile(sh2);
  assert.ok(sh2.uniforms.rigDetail && sh2.uniforms.rigMacro && sh2.uniforms.rigDecal && sh2.uniforms.rigDecalBox.value.length === 4 && sh2.uniforms.rigDecalUv.value.length === 4);
  mat.dispose();
});

test('人头：雕过的头型左右对称，脸面五官在脸前', () => {
  const [x1, y1, z1] = sculpt(0.4, 0.1, Math.sqrt(1 - 0.17)), [x2, y2, z2] = sculpt(-0.4, 0.1, Math.sqrt(1 - 0.17));
  assert.ok(Math.abs(x1 + x2) < 1e-9 && y1 === y2 && Math.abs(z1 - z2) < 1e-9);
  const head = { c: [0, 0.09, 0], r: [0.085, 0.112, 0.1], k: 1 };
  const eye = facePoint(head, 0.33, 0.07), chin = facePoint(head, 0, -0.85);
  assert.ok(eye[2] > 0.07 && eye[1] > chin[1]);
  const parts = humanHead({ c: head.c, r: head.r, skin: 0xa8765a, lip: 0x8a5446, brow: 0x111111 });
  assert.ok(parts.length > 10 && parts.every((g) => g.attributes.rig && g.attributes.color), '没有贴花：小几何体的眼睛眉毛');
  // 下颌角：下半脸侧面（下颌角）比下巴宽得多；下巴底下压平
  const jaw = sculpt(0.85, -0.5, Math.sqrt(1 - 0.85 ** 2 - 0.25), 1), chinS = sculpt(0.25, -0.75, Math.sqrt(1 - 0.0625 - 0.5625), 1);
  assert.ok(jaw[0] > 0.7 && chinS[0] < 0.2, `下颌角 ${jaw[0].toFixed(2)}、下巴 ${chinS[0].toFixed(2)}`);
  // 耳朵露在头外面（一侧伸出头的半宽）
  const merged = new THREE.Box3(); for (const g of parts) { g.computeBoundingBox(); merged.union(g.boundingBox); }
  assert.ok(merged.max.x > head.r[0] * 1.02 && merged.min.x < -head.r[0] * 1.02, '有耳朵');
  // 有贴花：五官画在贴花里，头皮的脸面标了槽号，往两侧渐隐；没有几何体的眼白
  const dec = humanHead({ c: head.c, r: head.r, skin: 0xa8765a, lip: 0x8a5446, brow: 0x111111, hair: 0x111111, line: [0.5, 0.1, -0.5], decal: DECAL.ZHE_FACE });
  const skull = dec[0], rg = skull.attributes.rig.array, pos = skull.attributes.position;
  let front = 0, side = 0;
  for (let i = 0; i < pos.count; i++) { assert.equal(rg[i * 4 + 2], DECAL.ZHE_FACE); if (pos.getZ(i) > 0.09 && Math.abs(pos.getY(i) - 0.09) < 0.03) front = Math.max(front, rg[i * 4 + 3]); if (Math.abs(pos.getX(i)) > 0.08) side = Math.max(side, rg[i * 4 + 3]); }
  assert.ok(front > 200 && side < 60, `脸前 ${front}、两侧 ${side}`);
  assert.ok(!dec.some((g) => g.attributes.rig.array[0] === SURF.GLOSS), '有贴花就不要几何体的眼白');
  assert.ok(dec.length < parts.length);
  const hair = hairShell({ c: head.c, r: head.r, hair: 0x111111, line: [0.5, 0.1, -0.5], inflate: 1.045 });
  hair.computeBoundingBox(); assert.ok(hair.boundingBox.max.y > head.c[1] + head.r[1], '头发盖住头顶');
  // 发际线以外的头发壳缩在头皮里（头皮那一圈已经涂成发色，交线藏在发色里，不会一格一格地锯齿）
  const hp = hair.attributes.position, dir = hair.userData.dir; let out = 0, n = 0;
  for (let i = 0; i < hp.count; i++) {
    const nx = dir[i * 3], ny = dir[i * 3 + 1], nz = dir[i * 3 + 2]; if (nz < 0.3 || ny > 0.3) continue; // 脸面（发际线 0.5 以下）
    const q = sculpt(nx, ny, nz, 1), sk = [head.c[0] + q[0] * head.r[0], head.c[1] + q[1] * head.r[1], head.c[2] + q[2] * head.r[2]];
    n++; if (Math.hypot(hp.getX(i) - head.c[0], hp.getY(i) - head.c[1], hp.getZ(i) - head.c[2]) > Math.hypot(sk[0] - head.c[0], sk[1] - head.c[1], sk[2] - head.c[2]) - 1e-4) out++;
  }
  assert.ok(n > 20); assert.equal(out, 0, '脸前的头发壳都缩在头皮里');
});

test('贴身背心：壳离躯干一厘多，不是一块板；反光条、肩带、包边、车出来的肢体都带齐属性', () => {
  const T = torsoSurface({ off: 0.013 });
  // 躯干圆角方块的有向距离
  const sdf = ([x, y, z]) => { const qx = Math.abs(x) - 0.1, qy = Math.abs(y - 0.24) - 0.14, qz = Math.abs(z) - 0.03; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - 0.08; };
  for (let i = 0; i < 40; i++) for (const y of [0.1, 0.2, 0.3, 0.4, 0.44]) { const d = sdf(T.point(i / 40, y).p); assert.ok(d > 0.009 && d < 0.016, `s=${i / 40} y=${y} 离躯干 ${d.toFixed(4)}`); }
  assert.ok(T.sAt(0.1) < 0.15 && T.sAt(0.1, false) > 0.35 && T.sAt(0.1, false) < 0.5);
  const sh = shellPatch(T, { y0: 0.1, y1: (s) => 0.3 + 0.1 * Math.sin(s * 6.28), cols: 16, rows: 3, hex: 0xffff00, surf: SURF.HIVIS, wrap: true });
  const tube = edgeTube(Array.from({ length: 12 }, (_, i) => T.point(i / 12, 0.1)), 0.005, 0x333333);
  const arch = shoulderArch(T, { x0: 0.07, x1: 0.13, off: 0.016, hex: 0xffff00 });
  const arm = lathe(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.3, 0.1), [[0, 0.06], [0.5, 0.05], [1, 0.04]], 0x223344);
  for (const g of [sh, tube, ...arch, arm]) for (const a of ['position', 'normal', 'uv', 'color', 'rig']) assert.ok(g.attributes[a], a);
  assert.ok(mergeFlat([sh, tube, ...arch, arm]).attributes.position.count > 0, '能和别的零件合并');
  grimeGeo(sh, () => 0.25); assert.equal(sh.attributes.rig.array[1], 64);
  decalGeo(sh, 3, () => 0.5); assert.equal(sh.attributes.rig.array[2], 3); assert.equal(sh.attributes.rig.array[3], 128);
  setDecalBox(2, 0.1, 1.6, 0.08, 0.1); assert.deepEqual(decalBox(2).toArray(), [0.1, 1.6, 0.08, 0.1]);
  assert.ok(FACES.zhe.slot === DECAL.ZHE_FACE && FACES.lin.slot === DECAL.LIN_FACE);
});

test('buildParts：部件和轴心不变，三角形不超过原来的两倍左右，队友露脸、劫持者戴面罩', () => {
  const zhe = buildParts(SQUAD.members[0].look), lin = buildParts(SQUAD.members[1].look);
  const soldier = buildParts({ shirt: 0x4a4f3e, pants: 0x434737, vest: 0x6b6247, strap: 0x55503b, pouch: 0x5d5740, helmet: 0x545a45, mask: 0x2b2c2e, glove: 0x2a2826, boot: 0x2b2722, pad: 0x3a3b35, heavy: false, who: 0 });
  for (const P of [zhe, lin, soldier]) {
    assert.deepEqual(Object.keys(P).sort(), ['aim', 'head', 'pelvis', 'shin', 'thigh', 'torso', 'visor']);
    for (const [k, g] of Object.entries(P)) if (k !== 'visor') for (const a of ['position', 'normal', 'color', 'rig', 'rest']) assert.ok(g.attributes[a], `${k}.${a}`);
    const total = ['pelvis', 'torso', 'head', 'aim'].reduce((n, k) => n + tris(P[k]), 0) + 2 * (tris(P.thigh) + tris(P.shin));
    assert.ok(total < 30000, `每个人 ${total} 个三角形（原来约 1.5 万，最多两倍）`);
  }
  assert.equal(RIG.HIP_Y, 0.98);
  const surfs = (g) => new Set(Array.from({ length: g.attributes.rig.count }, (_, i) => g.attributes.rig.array[i * 4]));
  assert.ok(surfs(zhe.head).has(SURF.SKIN) && surfs(zhe.head).has(SURF.HAIR) && surfs(zhe.head).has(SURF.PLASTIC), '阿哲：脸、头发、安全帽');
  assert.ok(surfs(zhe.torso).has(SURF.HIVIS) && surfs(zhe.torso).has(SURF.RETRO), '荧光背心 + 反光条');
  assert.ok(surfs(lin.head).has(SURF.SKIN) && !surfs(lin.head).has(SURF.PLASTIC), '林医生不戴头盔');
  assert.ok(surfs(lin.aim).has(SURF.SKIN), '短袖露小臂');
  assert.ok(surfs(soldier.head).has(SURF.KNIT) && !surfs(soldier.head).has(SURF.HAIR), '劫持者戴面罩');
  assert.ok(tris(soldier.visor) > 20 && surfs(soldier.head).has(SURF.RUBBER), '护目镜：一整片弧形镜片 + 橡胶镜框');
  // 背心是贴身的薄壳：荧光布的顶点离躯干（圆角方块）都不超过 2.5 厘米（上一版的板子正面离衬衫 2–3 厘米，还往下多出一截）
  const sdf = ([x, y, z]) => { const qx = Math.abs(x) - 0.1, qy = Math.abs(y - 0.24) - 0.14, qz = Math.abs(z) - 0.03; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - 0.08; };
  const tp = zhe.torso.attributes.position, tr = zhe.torso.attributes.rig.array, rest = zhe.torso.attributes.rest.array;
  let far = 0, lowest = 9;
  for (let i = 0; i < tp.count; i++) if (tr[i * 4] === SURF.HIVIS) { const p = [rest[i * 4] / 32767 * REST_RANGE, rest[i * 4 + 1] / 32767 * REST_RANGE - 1.08, rest[i * 4 + 2] / 32767 * REST_RANGE]; far = Math.max(far, sdf(p)); lowest = Math.min(lowest, p[1]); }
  assert.ok(far < 0.025, `背心离躯干最远 ${far.toFixed(3)} 米`); assert.ok(lowest > 0.085, '下摆不往下多出一截');
  assert.ok(surfs(zhe.head).has(SURF.SKIN) && !surfs(zhe.torso).has(SURF.KNIT), '阿哲不戴面罩');
  assert.ok(surfs(lin.head).has(SURF.SCRUBS) && surfs(lin.head).has(SURF.RUBBER), '林医生：口罩、头绳');
  // 头的包围球大致不变（命中判定按骨架算，模型不能大出一圈）
  for (const P of [zhe, lin]) { P.head.computeBoundingBox(); assert.ok(P.head.boundingBox.max.y < 0.3 && P.head.boundingBox.min.y > -0.06); }
});

test('第三轮：雕过的头（下颌线、颧骨、眉骨）、脸前网格密、口罩是垂在下巴底下的一片、手有手指、低持枪时握把不扎进背心', async () => {
  const { faceSphere, weldNormals, surgicalMask } = await import('../src/jimao/skins/rig-skin.js');
  // 下颌线：下巴底下是往上斜的一个面（同一高度，下颌线以下的点比球面高）
  const under = sculpt(0, -0.95, Math.sqrt(1 - 0.9025), 1), side = sculpt(0.75, -0.3, Math.sqrt(1 - 0.5625 - 0.09), 1);
  assert.ok(under[1] > -0.9, `下巴底下压上去 ${under[1].toFixed(2)}`);
  assert.ok(side[0] < 0.75, '两颊收进去一个面');
  const brow = sculpt(0.2, 0.25, Math.sqrt(1 - 0.04 - 0.0625), 1), sock = sculpt(0.34, 0.08, Math.sqrt(1 - 0.1156 - 0.0064), 1);
  assert.ok(brow[2] - sock[2] > 0.08, '眉骨比眼窝往前');
  // 脸朝前的球：极点在脸前偏下，脸上那一圈网格比后脑密；接缝处法线一致
  const g = faceSphere(32, 24); g.computeVertexNormals(); weldNormals(g);
  const p = g.attributes.position, n = g.attributes.normal;
  assert.ok(p.getZ(0) > 0.95 && p.getY(0) < 0, '极点在脸前、往下偏');
  const seen = new Map(); let bad = 0;
  for (let i = 0; i < p.count; i++) { const k = [p.getX(i), p.getY(i), p.getZ(i)].map((q) => Math.round(q * 1e4)).join(); const m = seen.get(k); if (m && Math.hypot(n.getX(i) - n.getX(m), n.getY(i) - n.getY(m), n.getZ(i) - n.getZ(m)) > 1e-4) bad++; else if (!m) seen.set(k, i); }
  assert.equal(bad, 0, '接缝、极点上的法线取了平均');
  // 口罩：两面、垂在下巴底下（不绕到下颌角成一圈护颈），四根耳挂
  const mask = surgicalMask({ c: [0, 0.09, 0.004], hex: 0x86a9bd, loop: 0xd6dcdf, ear: [0.073, 0.078, -0.008] });
  const box = new THREE.Box3(); for (const q of mask.slice(0, 2)) { q.computeBoundingBox(); box.union(q.boundingBox); }
  assert.ok(box.min.y > -0.06 && box.max.y < 0.03 && box.max.x < 0.065 && box.min.z > 0.0, `口罩的范围 ${JSON.stringify(box)}`);
  assert.equal(mask.length, 2 + 2 + 4, '两面 + 上下包边 + 四根耳挂');
  // 低持枪（squad.js / 这里的姿势：aim 转 (0.55, 0.35, 0)）时，右手和握把在背心前面
  const zhe = buildParts(SQUAD.members[0].look), ap = zhe.aim.attributes.position;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.42, 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, 0.35, 0)), new THREE.Vector3(1, 1, 1));
  const q = new THREE.Vector3(), a = new THREE.Vector3(); let inside = 0, near = 0;
  for (let i = 0; i < ap.count; i++) {
    a.fromBufferAttribute(ap, i); if (Math.hypot(a.x + 0.1, a.y + 0.155, a.z - 0.26) > 0.05) continue; // 右手那一团
    near++; q.copy(a).applyMatrix4(m); if (Math.abs(q.x) < 0.16 && q.y > 0.05 && q.y < 0.42 && q.z < 0.12) inside++;
  }
  assert.ok(near > 50 && inside / near < 0.1, `右手扎进躯干的顶点 ${inside}/${near}`);
  // 枪口还在原处（muzzle 在 z 0.78，枪管末端 0.8）
  let maxZ = 0; for (let i = 0; i < ap.count; i++) maxZ = Math.max(maxZ, ap.getZ(i)); assert.ok(maxZ > 0.79 && maxZ < 0.82);
  // 劫持者：两片镜片（左右各一）
  const sold = buildParts({ shirt: 0x4a4f3e, pants: 0x434737, vest: 0x6b6247, strap: 0x55503b, pouch: 0x5d5740, helmet: 0x545a45, mask: 0x2b2c2e, glove: 0x2a2826, boot: 0x2b2722, pad: 0x3a3b35, heavy: false, who: 0 });
  const vp = sold.visor.attributes.position; let L = 0, R = 0, mid = 0;
  for (let i = 0; i < vp.count; i++) { const x = vp.getX(i); if (x > 0.012) L++; else if (x < -0.012) R++; else mid++; }
  assert.ok(L > 50 && R > 50 && mid < (L + R) * 0.1, '两片分开的镜片，中间是鼻梁');
  assert.ok(sold.head.attributes.rig.array.some((v, i) => i % 4 === 0 && v === SURF.RETRO), '头盔后面一块反光识别贴');
});
