import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { convexOverlap, pointInPoly } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { WEST_GATE_AXIS, gantryPosts } from '../src/layout/west-parking.js';
import { BatchSet } from '../src/render/batch.js';
import { buildWestParkingDetails } from '../src/render/build/west-parking.js';

const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };

const P = L.site.westParking, W = L.extensions.paths.find(p => p.id === 'west-gate-promenade'), nav = buildNav(L);
const D = L.expansion.westArrival;
function walk(points, floor = 'ground') {
  let s = { floor, x: points[0][0], z: points[0][1], y: 0, slope: null };
  assert.ok(clear(nav, s), `起点不可站立 ${points[0]}`);
  for (const p of points.slice(1)) {
    const dx = p[0] - s.x, dz = p[1] - s.z, n = Math.ceil(Math.hypot(dx, dz) / .15);
    for (let i = 0; i < n; i++) s = step(nav, s, dx / n, dz / n, 0);
    assert.ok(Math.hypot(s.x - p[0], s.z - p[1]) < .05, `停在 ${s.x.toFixed(2)},${s.z.toFixed(2)}，目标 ${p}`);
  }
  return s;
}

test('西门步道过西外环后一直延伸到停车场步行脊，车位与场地面层都让开步道', () => {
  assert.ok(W && D.lotWalk === W.id);
  const [x0, z0] = [Math.min(...W.polys[0].map(p => p[0])), Math.min(...W.polys[0].map(p => p[1]))];
  const [x1, z1] = [Math.max(...W.polys[0].map(p => p[0])), Math.max(...W.polys[0].map(p => p[1]))];
  assert.equal(x0, -427); assert.equal(x1, -298); assert.ok(Math.abs((z0 + z1) / 2 - WEST_GATE_AXIS) < 1e-9);
  // The art promenade ends exactly where the lot walk starts, after its zebra over 西外环.
  assert.deepEqual(D.path.points.at(-1), [-298, WEST_GATE_AXIS]);
  assert.ok(L.site.crossings.some(c => c.id === 'west-cross-art-gate' && pointInPoly([-292, WEST_GATE_AXIS], c.poly)));
  for (const lot of P.lots) {
    assert.ok(!convexOverlap(lot.poly, W.polys[0], .02), `${lot.id} 场地面层压住步道`);
    for (const s of lot.stalls) assert.ok(!convexOverlap(s.poly, W.polys[0], .02), `${lot.id} 车位压住步道`);
  }
  // Every lot carriageway the walk crosses is painted as a pedestrian crossing.
  const crossed = P.roads.flatMap(r => r.polys).filter(q => convexOverlap(q, W.polys[0], .02));
  assert.ok(crossed.length >= 4);
  for (const q of crossed) {
    const cx = q.reduce((a, p) => a + p[0], 0) / q.length;
    assert.ok(L.site.crossings.some(c => pointInPoly([cx, WEST_GATE_AXIS], c.poly)), `车道 x=${cx} 缺少斑马线`);
  }
  // 北排车位让给云澜·西苑后仍保留 427 个车位、49 个以上充电位和 9 个无障碍位
  assert.ok(P.stallCount > 420 && P.evCount >= 49 && P.accessibleCount >= 9);
});

test('从西门门厅经斑马线和停车场步行轴走到步行脊，双向、全宽可走', () => {
  const route = [...D.path.points];
  const inside = walk([D.interior, ...route], 'P1-1F');
  assert.equal(inside.floor, 'ground');
  const end = walk([[-298, WEST_GATE_AXIS], [-427, WEST_GATE_AXIS], [-427, -66]]);
  assert.equal(end.floor, 'ground');
  for (const dz of [-2.3, -1.2, 0, 1.2, 1.8]) for (const pts of [[[-299, WEST_GATE_AXIS + dz], [-426, WEST_GATE_AXIS + dz]], [[-426, WEST_GATE_AXIS + dz], [-299, WEST_GATE_AXIS + dz]]]) walk(pts);
  const back = walk([[-427, WEST_GATE_AXIS], [-298, WEST_GATE_AXIS], ...[...route].reverse(), D.interior]);
  assert.equal(back.floor, 'P1-1F');
});

test('停车场门架立柱有碰撞；步道上的中央口立柱改为悬臂，步道带内没有实体', () => {
  const G2 = P.gates.find(g => g.id === 'WP-G2');
  assert.deepEqual(gantryPosts(G2), [-G2.width / 2 - .75]);
  for (const g of P.gates) {
    const [fx, fz] = g.facing || [1, 0], a = Math.atan2(fz, fx);
    for (const dz of gantryPosts(g)) {
      const x = g.x - Math.sin(a) * dz, z = g.z + Math.cos(a) * dz;
      assert.equal(clear(nav, { floor: 'ground', x, z, y: 0 }), false, `${g.id} 立柱 (${x},${z}) 可穿过`);
    }
  }
  const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) });
  const group = new THREE.Group();
  buildWestParkingDetails({ layout: L, mats: { base: materials, sign: () => materials.sign }, site: { group, batch: new BatchSet(materials) } });
  group.updateMatrixWorld(true);
  const meshes = []; group.traverse(o => { if (o.isMesh && !o.isInstancedMesh) meshes.push(o); });
  const half = W.width / 2;
  for (const dz of [-half + .7, 0, half - .9]) for (const h of [.3, 1.6, 2.4]) {
    const hits = new THREE.Raycaster(new THREE.Vector3(-298.5, h, WEST_GATE_AXIS + dz), new THREE.Vector3(-1, 0, 0), 0, 128).intersectObjects(meshes, false);
    assert.equal(hits.length, 0, `步道带内被挡 dz=${dz} h=${h} at x=${hits[0]?.point.x.toFixed(2)}`);
  }
});
