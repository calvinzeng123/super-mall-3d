import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { BatchSet } from '../src/render/batch.js';
import { buildP1Fidelity } from '../src/render/build/p1-fidelity.js';

// Posters paint on a canvas; under Node a no-op 2D context is enough.
const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };

function render(layout) {
  const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial() });
  const levels = Object.fromEntries(layout.levels.map(lv => [lv.id, {
    lv, base: new THREE.Group(), facade: new THREE.Group(), batch: new BatchSet(materials), facadeBatch: new BatchSet(materials),
  }]));
  const ctx = { layout, levels, site: { group: new THREE.Group(), batch: new BatchSet(materials) },
    mats: { base: materials, sign: () => new THREE.MeshBasicMaterial(), onNight: () => {} } };
  buildP1Fidelity(ctx);
  for (const v of Object.values(levels)) { v.batch.flush(v.base); v.facadeBatch.flush(v.facade); }
  ctx.site.batch.flush(ctx.site.group);
  for (const g of [ctx.site.group, ...Object.values(levels).flatMap(v => [v.base, v.facade])]) g.updateMatrixWorld(true);
  return ctx;
}
const meshes = group => { const out = []; group.traverse(m => { if (m.isMesh) out.push(m); }); return out; };

/** Rendered triangles (instances included) that touch an audit box. */
function trianglesIn(groups, box) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tri = new THREE.Triangle(a, b, c);
  const m = new THREE.Matrix4(), inst = new THREE.Matrix4();
  let n = 0;
  for (const mesh of groups.flatMap(meshes)) {
    const p = mesh.geometry.attributes.position, idx = mesh.geometry.index;
    for (let j = 0; j < (mesh.isInstancedMesh ? mesh.count : 1); j++) {
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(j, inst); m.multiplyMatrices(mesh.matrixWorld, inst); } else m.copy(mesh.matrixWorld);
      for (let i = 0; i < (idx?.count || p.count); i += 3) {
        a.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m);
        b.fromBufferAttribute(p, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m);
        c.fromBufferAttribute(p, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m);
        if (box.intersectsTriangle(tri)) n++;
      }
    }
  }
  return n;
}
const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));

const tour = render(L);
const level = id => L.levels.find(l => l.id === id);

test('效果图改造生成穹顶、天幕、三块画屏和地面景观几何；FPS 一件不加', () => {
  const rf = meshes(tour.levels['P1-RF'].base).map(m => m.name);
  for (const name of ['P1-art-dome-glass', 'P1-square-canopy-glass']) assert.ok(rf.includes(name), `缺 ${name}`);
  const posters = Object.values(tour.levels).flatMap(v => meshes(v.facade)).filter(m => m.name.startsWith('P1-poster-'));
  assert.equal(posters.length, 3);
  assert.ok(meshes(tour.site.group).length > 3, '地面景观没有几何');
  const fps = render(buildPlayableLayout({ mode: 'fps' }));
  const added = [fps.site.group, ...Object.values(fps.levels).flatMap(v => [v.base, v.facade])].reduce((n, g) => n + meshes(g).length, 0);
  assert.equal(added, 0);
});

test('西里坡屋顶下 3.8m、南庭棚架下 2.6–3.7m 除周边柱外没有构件，玻璃亭南面敞开：净空与导航一致', () => {
  for (const id of ['P1W1', 'P1W2', 'P1W3', 'P1W4']) {
    const lv = level(`${id}-RF`), r = lv.features.find(f => f.type === 'creative-roof').rect, y = lv.elev;
    assert.equal(trianglesIn([tour.levels[lv.id].base], box(r.x0 + .5, y + .05, r.z0 + .5, r.x1 - .5, y + 3.8, r.z1 - .5)), 0, `${id} 坡屋顶下有构件`);
  }
  const dining = level('P1S-RF'), lattice = dining.features.find(f => f.type === 'timber-lattice'), r = lattice.rect, y = dining.elev;
  assert.equal(trianglesIn([tour.levels['P1S-RF'].base], box(r.x0 + .5, y + 2.6, r.z0 + .5, r.x1 - .5, y + lattice.height - .5, r.z1 - .5)), 0, '棚架下有伞或构件');
  const culture = level('P1C-RF'), pav = culture.features.find(f => f.type === 'glass-pavilion'), p = pav.rect, yc = culture.elev;
  assert.equal(trianglesIn([tour.levels['P1C-RF'].base], box(p.x0 + .4, yc + .2, p.z1 - .05, p.x1 - .4, yc + pav.height - .6, p.z1 + .05)), 0, '玻璃亭南面被封住');
});

test('庭院喷泉水面露出池沿之下，没有被实心池顶盖住', () => {
  // 超级商业中心：搬进 1F 中庭广场的喷泉（f.indoor）画在 P1-1F 里，见下一条
  for (const f of L.fidelity.landscape.fountains.filter((q) => !q.indoor)) {
    const a = Math.PI / 12, x = f.x + Math.cos(a) * 3, z = f.z + Math.sin(a) * 3;
    // Plaza at -0.14: water top at 0.32, rim top at 0.46.
    assert.equal(trianglesIn([tour.site.group], box(x - .15, .34, z - .15, x + .15, .6, z + .15)), 0, `${f.id} 水面被盖住`);
    assert.ok(trianglesIn([tour.site.group], box(x - .15, .25, z - .15, x + .15, .33, z + .15)) > 0, `${f.id} 没有水面`);
  }
});

test('超级商业中心：1F 中庭广场的螺旋喷泉有水面和金色缎带，棕榈、樱花树池有几何', () => {
  const indoor = L.fidelity.landscape.fountains.filter((q) => q.indoor);
  assert.equal(indoor.length, 2);
  const B = [tour.levels['P1-1F'].base];
  for (const f of indoor) {
    assert.equal(trianglesIn([tour.site.group], box(f.x - 1, 0, f.z - 1, f.x + 1, 3, f.z + 1)), 0, `${f.id} 还画在室外`);
    assert.ok(trianglesIn(B, box(f.x - 1.5, 4, f.z - 1.5, f.x + 1.5, 8, f.z + 1.5)) > 0, `${f.id} 没有螺旋缎带`);
    assert.ok(trianglesIn(B, box(f.x + 2, 0.3, f.z - .3, f.x + 3, 0.5, f.z + .3)) > 0, `${f.id} 没有水面`);
  }
  for (const t of L.fidelity.mega.plaza.trees) assert.ok(trianglesIn(B, box(t.x - .5, 3, t.z - .5, t.x + .5, 5, t.z + .5)) > 0, `${t.id} 没有树冠/树干`);
});

test('样板中庭：1F 喷泉/树形柱、各层栏板花槽、6F 两块大屏和吊灯、天台树形柱伞顶都有几何', () => {
  const n = (id, b) => trianglesIn([tour.levels[id].base], b);
  assert.ok(n('P1-1F', box(-140, 0, -140, -72, 10, -72)) > 2000, '1F 中庭几何太少');
  assert.ok(n('P1-4F', box(-140, 16, -140, -72, 18, -72)) > 500, '4F 栏板花槽');
  assert.ok(n('P1-RF', box(-140, 34, -140, -72, 44, -72)) > 500, '天台伞顶');
  assert.equal(meshes(tour.levels['P1-6F'].base).filter(m => m.name === 'P1-atrium-screen').length, 4);
});
