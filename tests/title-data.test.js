// 开场资源（scripts/title/bake.mjs 生成的 src/title/title-data.js）：楼型、预画好的丧尸贴图、子集字体；
// 以及 zombie-skin.js 的 loadZombieKit({ prebaked })：有现成贴图就不在手机上现画
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { TITLE_TOWERS, TITLE_ZOMBIE_TEX, TITLE_FONTS } from '../src/title/title-data.js';
import { loadZombieKit } from '../src/jimao/zombie-skin.js';
import { PEOPLE_ASSETS } from '../src/render/people-data.js';
import { collectChars, BASE_CHARS } from '../scripts/title/bake.mjs';

const local = (url) => new URL('../' + url.replace(/^\.\//, ''), import.meta.url);

test('楼型：园区真实的几栋塔楼和商场外轮廓，坐标是米，高度都够', () => {
  const ids = new Set(TITLE_TOWERS.map((t) => t.id));
  for (const id of ['A', 'R1', 'R2', 'R3', 'R4', 'H', 'W1', 'W2', 'T1', 'T2', 'P1']) assert.ok(ids.has(id), `缺 ${id}`);
  for (const t of TITLE_TOWERS) {
    for (const k of ['x', 'z', 'w', 'd', 'h', 'rot']) assert.equal(typeof t[k], 'number', `${t.id}.${k}`);
    assert.ok(t.h > 20, `${t.id} 高 ${t.h}`);
    assert.ok(t.w > 5 && t.d > 5 && t.w < 400 && t.d < 400, `${t.id} ${t.w}×${t.d}`);
  }
  const p1 = TITLE_TOWERS.find((t) => t.id === 'P1');
  assert.ok(Array.isArray(p1.outline) && p1.outline.length >= 4, '商场带外轮廓');
  const a = TITLE_TOWERS.find((t) => t.id === 'A'), r1 = TITLE_TOWERS.find((t) => t.id === 'R1');
  assert.ok(r1.h > a.h, '二期 R 楼比公寓 A 高');
});

test('字体：毛笔字和英文各一份 woff2，文件在、不大，不连外网', () => {
  assert.ok(TITLE_FONTS.brush && TITLE_FONTS.latin, '两个字体都有');
  for (const url of [TITLE_FONTS.brush, TITLE_FONTS.latin]) {
    assert.ok(!/^https?:/.test(url), `${url} 不能是外网地址`);
    assert.match(url, /\.woff2$/);
    const bytes = readFileSync(local(url));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${url} 是 woff2`);
    assert.ok(bytes.length < 200 * 1024, `${url} ${bytes.length} 字节，子集化了`);
  }
});

test('字体子集：从开场代码里的字符串收字，再加上必收的那些', () => {
  const chars = collectChars(['const a = "围城·DEAD MALL"; // 注释里的字不收：废', "b = '零点突围'", '`进入关卡${x}`']);
  for (const c of '围城零点突进入关卡DEAMLD ·') assert.ok(chars.includes(c), `缺 ${c}`);
  assert.ok(!chars.includes('废'), '注释里的字不收');
  for (const c of '围城云澜丧尸联机设置0123456789') assert.ok(BASE_CHARS.includes(c), `必收字缺 ${c}`);
});

test('丧尸贴图：每个模型每套外观一张颜色图 + 湿度图，法线 / 粗糙度每模型一张；高低两档，低档颜色图不超过 512', () => {
  assert.ok(TITLE_ZOMBIE_TEX.length > 0);
  for (const e of TITLE_ZOMBIE_TEX) {
    assert.ok(e.id && e.url && e.size > 0, JSON.stringify(e));
    assert.ok(['hi', 'lo'].includes(e.set) && ['colour', 'wet', 'normal', 'rough'].includes(e.kind), e.id);
    assert.ok(existsSync(local(e.url)), `${e.url} 不存在`);
    assert.match(e.url, /\.jpg$/);
  }
  for (const set of ['hi', 'lo']) {
    const list = TITLE_ZOMBIE_TEX.filter((e) => e.set === set);
    for (let body = 0; body < PEOPLE_ASSETS.length; body++) {
      const mine = list.filter((e) => e.body === body);
      const colours = mine.filter((e) => e.kind === 'colour');
      assert.ok(colours.length >= 3, `${set} 模型 ${body} 只有 ${colours.length} 套外观`);
      for (const c of colours) assert.ok(mine.some((e) => e.kind === 'wet' && e.look === c.look), `${c.id} 缺湿度图`);
      for (const k of ['normal', 'rough']) assert.equal(mine.filter((e) => e.kind === k).length, 1, `${set} 模型 ${body} ${k}`);
    }
  }
  for (const e of TITLE_ZOMBIE_TEX.filter((e) => e.set === 'lo')) assert.ok(e.size <= 512, `${e.id} ${e.size}`);
});

// 假的「人」：一块带 UV、带走路姿势的小方片（node 里不解析 GLB）
function fakePerson(record) {
  const geo = new THREE.PlaneGeometry(0.4, 1.8, 2, 6); geo.translate(0, 0.9, 0);
  geo.morphAttributes.position = Array.from({ length: record.poses }, () => geo.attributes.position.clone());
  geo.morphTargetsRelative = false;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial()); mesh.morphTargetInfluences = new Array(record.poses).fill(0);
  return mesh;
}

test('loadZombieKit({ prebaked })：用现成贴图建材质，不现画（画图函数、画布一次都不碰）', async () => {
  let draws = 0, canvases = 0;
  const painter = new Proxy({}, { get: () => () => { draws++; return { next: () => ({ done: true }) }; } });
  const hadDocument = 'document' in globalThis, old = globalThis.document;
  globalThis.document = { createElement: () => { canvases++; return { getContext: () => { canvases++; return null; } }; } };
  const loaded = [];
  try {
    const kit = await loadZombieKit({
      prebaked: TITLE_ZOMBIE_TEX, set: 'lo',
      deps: { paint: painter, parse: async (record) => fakePerson(record), loadTexture: async (url) => { loaded.push(url); return new THREE.Texture(); } },
    });
    assert.equal(draws, 0, '画图函数被调用了');
    assert.equal(canvases, 0, '碰了画布');
    const want = TITLE_ZOMBIE_TEX.filter((e) => e.set === 'lo');
    assert.deepEqual([...new Set(loaded)].sort(), want.map((e) => e.url).sort(), '低档的贴图全读了，高档的一张没读');
    assert.ok(kit.looks >= 6);
    const z = kit.create(); z.setLook(1); z.pose({ phase: 0.3 });
    const mesh = z.group.children.find((m) => m.visible), m = mesh.material;
    assert.ok(m.map && m.alphaMap && m.normalMap && m.roughnessMap, '颜色、湿度、法线、粗糙度都挂上了');
    assert.equal(m.map.flipY, false, '贴图和画出来的像素一个朝向');
    assert.equal(m.map.colorSpace, THREE.SRGBColorSpace);
    assert.ok(kit.stats.prebaked, 'stats 标明是现成贴图');
    kit.dispose();
  } finally {
    if (hadDocument) globalThis.document = old; else delete globalThis.document;
  }
});

test('行人模型去掉原贴图：和 PEOPLE_ASSETS 一个顺序、姿势数一样，文件小了一大半', async () => {
  const { TITLE_PEOPLE } = await import('../src/title/title-data.js');
  assert.equal(TITLE_PEOPLE.length, PEOPLE_ASSETS.length);
  TITLE_PEOPLE.forEach((p, i) => {
    assert.equal(p.id, PEOPLE_ASSETS[i].id); assert.equal(p.poses, PEOPLE_ASSETS[i].poses);
    const bytes = readFileSync(local(p.url));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB');
    assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB 长度对得上');
    assert.ok(bytes.length < 800 * 1024, `${p.url} ${bytes.length}`);
  });
});
