import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { frame, toW } from '../src/layout/geom.js';
import { landscape } from '../src/render/build/hospitality.js';

const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };

function landscapeMeshes() {
  const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) });
  const group = new THREE.Group();
  const ctx = { layout: L, mats: { base: materials, floor: () => materials.floor }, site: { group }, hospitality: {} };
  landscape(ctx, L.buildings.filter(b => b.kind === 'tower'));
  group.updateMatrixWorld(true);
  const meshes = []; group.traverse(o => { if (o.isMesh) meshes.push(o); });
  return meshes;
}

// Planters, trees, benches and bollards used to land in door approaches and
// even inside a later annex: drawn solid, walked through.
test('酒店与住宅景观的花池、树、长椅和护柱不挡任何街道门口，也不落进附楼内', () => {
  const meshes = landscapeMeshes();
  let doors = 0;
  for (const e of L.entrances.filter(e => e.to === 'site' && L.levels.find(l => l.id === e.level)?.elev === 0)) {
    const len = Math.hypot(e.seg.x1 - e.seg.x0, e.seg.z1 - e.seg.z0), tx = (e.seg.x1 - e.seg.x0) / len, tz = (e.seg.z1 - e.seg.z0) / len;
    for (let along = .3; along < len - .25; along += .5) for (const h of [.3, .9, 1.6]) {
      const x = e.seg.x0 + tx * along + e.nx * .3, z = e.seg.z0 + tz * along + e.nz * .3;
      const hits = new THREE.Raycaster(new THREE.Vector3(x, h, z), new THREE.Vector3(e.nx, 0, e.nz), 0, 4.5).intersectObjects(meshes, false);
      assert.equal(hits.length, 0, `${e.id} 门口 ${along.toFixed(1)} m 处 ${h} m 高被景观挡住 (${hits[0]?.point.x.toFixed(2)},${hits[0]?.point.z.toFixed(2)})`);
    }
    doors++;
  }
  assert.ok(doors > 20);
  // The old garden spot at (-252,-112) is now inside the P1W3 tea house.
  const down = new THREE.Raycaster(new THREE.Vector3(-252, 12, -112), new THREE.Vector3(0, -1, 0), 0, 12).intersectObjects(meshes, false);
  assert.equal(down.length, 0, 'P1W3 附楼内还有花池或树');
  for (const m of meshes) m.geometry.dispose();
});

test('酒店车库入口的道闸立柱放在两条车道之间，不挡 ST2 共享楼梯亭出口', () => {
  const r = L.ramps.find(r => r.id === 'H-IN'), out = L.ramps.find(r => r.id === 'H-OUT');
  const street = r.from.level === 'street' ? r.from : r.to, other = r.from.level === 'street' ? r.to : r.from;
  const F = frame(street.x, street.z, Math.atan2(street.z - other.z, street.x - other.x) * 180 / Math.PI);
  const [, pz] = toW(F, 1.5, (r.gate?.side ?? 1) * (r.width / 2 + .6));
  const zIn = street.z, zOut = (out.from.level === 'street' ? out.from : out.to).z;
  assert.ok(pz > Math.min(zIn, zOut) && pz < Math.max(zIn, zOut), `H-IN 道闸立柱在 z=${pz.toFixed(2)}，不在两车道之间`);
  assert.equal(r.gate?.booth, false);
});

// Site entrances used to draw glass leaves over 2/3 of the door and a 4 m
// revolving drum at main doors, all walk-through: they now stand open.
test('商场街道门洞内只有门框和门楣，没有能穿过去的玻璃门扇或旋转门', async () => {
  const { BatchSet, SignBatch } = await import('../src/render/batch.js');
  const { buildSite } = await import('../src/render/build/site.js');
  const mk = () => { const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); m.map = new THREE.Texture(); return m; };
  const materials = new Proxy({}, { get: (m, k) => typeof k === 'string' ? (m[k] ||= mk()) : undefined });
  const site = new THREE.Group();
  const ctx = { layout: L, root: new THREE.Group(), dynamic: [], renderer: { localClippingEnabled: true }, camera: { position: new THREE.Vector3() },
    mats: new Proxy({ base: materials, floor: () => materials.floor, sign: () => materials.sign, screen: () => materials.screen, onNight: () => {} },
      { get: (t, k) => k in t ? t[k] : (typeof k === 'string' ? () => materials[`mat-${k}`] : undefined) }),
    site: { group: site, batch: new BatchSet(materials) }, hospitality: { buildings: new Map() }, buildings: {}, levels: {} };
  for (const lv of L.levels) ctx.levels[lv.id] = { lv, batch: new BatchSet(materials), shellBatch: new BatchSet(materials), facadeBatch: new BatchSet(materials),
    base: new THREE.Group(), shell: new THREE.Group(), facade: new THREE.Group(), signs: new SignBatch(), facadeSigns: new SignBatch(), group: new THREE.Group() };
  ctx.bById = Object.fromEntries(L.buildings.map(b => [b.id, b]));
  ctx.atlas = Object.fromEntries(L.levels.map(lv => [lv.id, { cell: () => null }]));
  buildSite(ctx);
  let doors = 0;
  for (const e of L.entrances.filter(e => e.to === 'site' && !e.kiosk && !e.coveredConnection)) {
    const v = ctx.levels[e.level]; if (!v || v.lv.expansion?.zone && v.lv.expansion.zone !== 'main') continue;
    v.facadeBatch.flush(v.facade); v.facade.updateMatrixWorld(true);
    const meshes = []; v.facade.traverse(o => { if (o.isMesh) meshes.push(o); });
    const len = Math.hypot(e.seg.x1 - e.seg.x0, e.seg.z1 - e.seg.z0), tx = (e.seg.x1 - e.seg.x0) / len, tz = (e.seg.z1 - e.seg.z0) / len;
    for (let along = .35; along < len - .3; along += .5) for (const h of [.3, 1.6, 2.6]) {
      const x = e.seg.x0 + tx * along - e.nx * .8, z = e.seg.z0 + tz * along - e.nz * .8;
      const hits = new THREE.Raycaster(new THREE.Vector3(x, v.lv.elev + h, z), new THREE.Vector3(e.nx, 0, e.nz), 0, 1.6).intersectObjects(meshes, false);
      assert.equal(hits.length, 0, `${e.id} 门洞 ${along.toFixed(1)} m、${h} m 高处有玻璃或门框挡住`);
    }
    doors++;
  }
  assert.ok(doors >= 5, `只检查了 ${doors} 个门`);
});
