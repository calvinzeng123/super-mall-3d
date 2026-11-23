// 丧尸围城的楼顶（src/layout/playable.js markSiegeRoofs + src/render/build/hospitality.js crown()）：
// 撤离那两栋楼的屋面在围城里是能走、能打的平台，画面上不能有导航里没有的大件——公寓那间 2.4 米高的机房正压在停机位上，
// 守屋顶时尸群从它后面绕过来、走到跟前两三米才露出来（用户：最后一波守住等直升机的时候还是看不到敌人）。漫游、小游戏的屋顶照旧。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { renderContext, drawnMeshes } from './render-context.js';
import { buildPlayableLayout, markSiegeRoofs, SIEGE_ROOFS } from '../src/layout/playable.js';
import { buildHospitalityTower } from '../src/render/build/hospitality.js';
import { buildCommunityTower } from '../src/render/build/community.js';
import { TOWERS } from '../src/jimao/siege.js';

/** 这栋楼画出来的东西里，停机位周围 5.3 米的方框里、屋面以上 0.3–6 米的三角形有几个（近景） */
function nearPad(L, id) {
  const ctx = renderContext(L), b = L.buildings.find((q) => q.id === id), T = TOWERS[id];
  const rec = b.community ? buildCommunityTower(ctx, b, ctx.hospitality.buildings) : buildHospitalityTower(ctx, b, ctx.hospitality.buildings);
  const lod = rec.group.getObjectByProperty('isLOD', true), cam = new THREE.PerspectiveCamera(); cam.position.set(T.pad.x, 80, T.pad.z); cam.updateMatrixWorld(); lod?.update(cam);
  const roof = L.levels.find((l) => l.id === T.roof).elev, meshes = [...drawnMeshes(rec.group), ...(rec.roofGroup && rec.roofGroup !== rec.group ? drawnMeshes(rec.roofGroup) : [])];
  const v = new THREE.Vector3(), M = new THREE.Matrix4(), W = new THREE.Matrix4(), box = new THREE.Box3();
  let n = 0;
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const p = m.geometry.attributes.position, idx = m.geometry.index, k = m.isInstancedMesh ? m.count : 1, tris = (idx ? idx.count : p.count) / 3;
    for (let c = 0; c < k; c++) {
      if (m.isInstancedMesh) { m.getMatrixAt(c, M); W.multiplyMatrices(m.matrixWorld, M); } else W.copy(m.matrixWorld);
      for (let t = 0; t < tris; t++) {
        box.makeEmpty(); for (let j = 0; j < 3; j++) box.expandByPoint(v.fromBufferAttribute(p, idx ? idx.getX(t * 3 + j) : t * 3 + j).applyMatrix4(W));
        if (box.max.y < roof + 0.3 || box.min.y > roof + 6) continue;
        if (box.max.x < T.pad.x - 5.3 || box.min.x > T.pad.x + 5.3 || box.max.z < T.pad.z - 5.3 || box.min.z > T.pad.z + 5.3) continue;
        n++;
      }
    }
  }
  return n;
}

test('围城的地图：撤离那两栋楼的屋面标成能打的平台（playableRoof），停机位周围屋面以上没有画出来的东西；小游戏、漫游的同一栋楼照旧有机房', () => {
  assert.deepEqual([...SIEGE_ROOFS].sort(), Object.values(TOWERS).map((t) => t.roof).sort(), '围城的每一栋撤离楼都标了');
  const plain = buildPlayableLayout({ mode: 'arcade' }), siege = markSiegeRoofs(buildPlayableLayout({ mode: 'arcade' }));
  assert.equal(siege.game, 'jimao');
  for (const t of Object.values(TOWERS)) {
    assert.equal(siege.levels.find((l) => l.id === t.roof).playableRoof, true, `${t.roof} 能打`);
    assert.ok(!plain.levels.find((l) => l.id === t.roof).playableRoof, `小游戏的 ${t.roof} 不动`);
    assert.equal(nearPad(siege, t.id), 0, `${t.id} 停机位周围屋面以上没有东西`);
  }
  assert.ok(nearPad(plain, 'A') > 20, '小游戏里公寓楼顶还是有那间机房（这个检查本身管用）');
});
