// 队友 / 劫持者人形的质感（src/jimao/skins/rig-skin.js）和 buildParts 的新外观：纯逻辑部分 + 没有 document 时不生成贴图。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SURF, SURF_PARAMS, paint, paintGeo, ensureRig, mergeFlat, weather, REST_RANGE, MAX_SPOTS, lookUniforms, detailSize, detailContext, fillDetailRows,
  acquireRigDetail, releaseRigDetail, rigDetailState, surfGlsl, patchRigShader, createRigMaterial, sculpt, facePoint, humanHead, hairShell,
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
    assert.ok(p.rough > 0 && p.rough <= 1 && p.metal >= 0 && p.metal <= 1 && p.bump >= 0 && p.bump < 0.01, '粗糙度 / 金属度 / 起伏在合理范围');
  }
  assert.ok(SURF_PARAMS[SURF.RETRO].retro > 0 && SURF_PARAMS.filter((p) => p.retro > 0).length === 1, '只有反光条逆反射');
  assert.equal(SURF_PARAMS[SURF.SKIN].blood, 0, '脸上不画血');
  const glsl = surfGlsl();
  assert.equal((glsl.match(/if \(t == \d+\)/g) || []).length, SURF_PARAMS.length);
  assert.match(glsl, /void rigSurf\(int t, out vec4 w, out vec4 a, out vec4 b, out float c\)/);
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
});

test('没有 document：不生成贴图，材质照样能建、能销毁', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(acquireRigDetail(512), null);
  assert.equal(rigDetailState(), null);
  releaseRigDetail();
  const mat = createRigMaterial({ name: 't', looks: SQUAD.members.map((m) => m.look) });
  assert.ok(mat.vertexColors && typeof mat.onBeforeCompile === 'function');
  assert.equal(mat.defines.RIG_DETAIL, undefined, '没细节图就不开 RIG_DETAIL');
  // 着色器拼接：所有替换点都在 three 的着色器里找得到
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  mat.onBeforeCompile(shader);
  for (const s of ['vRest = vec4', 'attribute vec4 rest']) assert.ok(shader.vertexShader.includes(s), s);
  for (const s of ['rigSurf(rigT', 'roughnessFactor = rigRough', 'metalnessFactor = rigMetal', 'rigRetro * irradiance', 'totalEmissiveRadiance *= 0.3']) assert.ok(shader.fragmentShader.includes(s), s);
  assert.ok(shader.uniforms.rigSpot && shader.uniforms.rigGrime);
  assert.equal(shader.uniforms.rigDetail, undefined);
  const m2 = patchRigShader(new THREE.MeshStandardMaterial(), { value: null });
  assert.equal(m2.defines.RIG_DETAIL, '');
  assert.notEqual(m2.customProgramCacheKey(), mat.customProgramCacheKey());
  mat.dispose();
});

test('人头：雕过的头型左右对称，脸面五官在脸前', () => {
  const [x1, y1, z1] = sculpt(0.4, 0.1, Math.sqrt(1 - 0.17)), [x2, y2, z2] = sculpt(-0.4, 0.1, Math.sqrt(1 - 0.17));
  assert.ok(Math.abs(x1 + x2) < 1e-9 && y1 === y2 && Math.abs(z1 - z2) < 1e-9);
  const head = { c: [0, 0.09, 0], r: [0.085, 0.112, 0.1], k: 1 };
  const eye = facePoint(head, 0.33, 0.07), chin = facePoint(head, 0, -0.85);
  assert.ok(eye[2] > 0.07 && eye[1] > chin[1]);
  const parts = humanHead({ c: head.c, r: head.r, skin: 0xa8765a, lip: 0x8a5446, brow: 0x111111 });
  assert.ok(parts.length > 10 && parts.every((g) => g.attributes.rig && g.attributes.color));
  const hair = hairShell({ c: head.c, r: head.r, hair: 0x111111, line: [0.5, 0.1, -0.5], inflate: 1.045 });
  hair.computeBoundingBox(); assert.ok(hair.boundingBox.max.y > head.c[1] + head.r[1], '头发盖住头顶');
});

test('buildParts：部件和轴心不变，三角形不超过原来的两倍左右，队友露脸、劫持者戴面罩', () => {
  const zhe = buildParts(SQUAD.members[0].look), lin = buildParts(SQUAD.members[1].look);
  const soldier = buildParts({ shirt: 0x4a4f3e, pants: 0x434737, vest: 0x6b6247, strap: 0x55503b, pouch: 0x5d5740, helmet: 0x545a45, mask: 0x2b2c2e, glove: 0x2a2826, boot: 0x2b2722, pad: 0x3a3b35, heavy: false, who: 0 });
  for (const P of [zhe, lin, soldier]) {
    assert.deepEqual(Object.keys(P).sort(), ['aim', 'head', 'pelvis', 'shin', 'thigh', 'torso', 'visor']);
    for (const [k, g] of Object.entries(P)) if (k !== 'visor') for (const a of ['position', 'normal', 'color', 'rig', 'rest']) assert.ok(g.attributes[a], `${k}.${a}`);
    const total = ['pelvis', 'torso', 'head', 'aim'].reduce((n, k) => n + tris(P[k]), 0) + 2 * (tris(P.thigh) + tris(P.shin));
    assert.ok(total < 30000, `每个人 ${total} 个三角形（原来约 1.5 万）`);
  }
  assert.equal(RIG.HIP_Y, 0.98);
  const surfs = (g) => new Set(Array.from({ length: g.attributes.rig.count }, (_, i) => g.attributes.rig.array[i * 4]));
  assert.ok(surfs(zhe.head).has(SURF.SKIN) && surfs(zhe.head).has(SURF.HAIR) && surfs(zhe.head).has(SURF.PLASTIC), '阿哲：脸、头发、安全帽');
  assert.ok(surfs(zhe.torso).has(SURF.HIVIS) && surfs(zhe.torso).has(SURF.RETRO), '荧光背心 + 反光条');
  assert.ok(surfs(lin.head).has(SURF.SKIN) && !surfs(lin.head).has(SURF.PLASTIC), '林医生不戴头盔');
  assert.ok(surfs(lin.aim).has(SURF.SKIN), '短袖露小臂');
  assert.ok(surfs(soldier.head).has(SURF.KNIT) && !surfs(soldier.head).has(SURF.HAIR), '劫持者戴面罩');
  // 头的包围球大致不变（命中判定按骨架算，模型不能大出一圈）
  for (const P of [zhe, lin]) { P.head.computeBoundingBox(); assert.ok(P.head.boundingBox.max.y < 0.3 && P.head.boundingBox.min.y > -0.06); }
});
