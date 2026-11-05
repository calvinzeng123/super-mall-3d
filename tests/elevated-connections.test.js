import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { pointInPoly } from '../src/layout/geom.js';
import { BRIDGE } from '../src/layout/bridges.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { usesExpansionFacade, expansionFacadeWalls } from '../src/layout/p1-expansion.js';
import { BatchSet, SignBatch } from '../src/render/batch.js';
import { buildShell } from '../src/render/build/shell.js';

const paint = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {},
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => paint, toDataURL: () => '' }) };
const nav = buildNav(L);
const segLen = s => Math.hypot(s.x1 - s.x0, s.z1 - s.z0);

// Upper-storey glass envelopes used to be drawn only: a player walked out
// through the façade anywhere on the annexes and P1 3F-6F.
test('附楼上层与一期 3F 以上的玻璃幕墙有碰撞，门洞处仍可通行', () => {
  let tested = 0;
  for (const lv of L.levels.filter(l => usesExpansionFacade(l) && l.elev > 1)) {
    const polys = lv.expansion.facadePolys || [lv.expansion.facadePoly];
    for (const w of expansionFacadeWalls(lv, L.entrances)) {
      const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
      if (len < 2) continue;
      const mx = (w.x0 + w.x1) / 2, mz = (w.z0 + w.z1) / 2;
      let nx = -(w.z1 - w.z0) / len, nz = (w.x1 - w.x0) / len;
      if (polys.some(p => pointInPoly([mx + nx * .5, mz + nz * .5], p))) { nx = -nx; nz = -nz; }
      const s0 = { floor: lv.id, x: mx - nx * .7, z: mz - nz * .7, y: lv.elev, slope: null };
      if (!clear(nav, s0)) continue;
      let s = s0;
      for (let i = 0; i < 30; i++) s = step(nav, s, nx * .05, nz * .05);
      const out = (s.x - mx) * nx + (s.z - mz) * nz;
      assert.ok(out < 0, `${lv.id} 幕墙 (${mx.toFixed(1)},${mz.toFixed(1)}) 可以穿出 ${out.toFixed(2)} m`);
      tested++;
    }
  }
  assert.ok(tested > 200, `只检查了 ${tested} 段幕墙`);
});

// Oblique bridge ends left wedges of deck and side glass running through the
// stone beside a narrower door; every bridge now meets its doors square.
test('十座艺术环廊天桥都垂直进出门洞，门洞与桥面同宽，门洞上方有门楣', () => {
  assert.equal(L.expansion.routes.length, 10);
  for (const r of L.expansion.routes) {
    const path = L.extensions.paths.find(p => p.id === r.id);
    const ends = [['start', path.points[0], path.points[1]], ['target', path.points.at(-1), path.points.at(-2)]];
    for (const [key, end, next] of ends) {
      const e = L.entrances.find(en => en.id === `${r.id}-${key}`);
      const dx = next[0] - end[0], dz = next[2] - end[2], len = Math.hypot(dx, dz);
      const cross = Math.abs(dx / len * e.nz - dz / len * e.nx);
      assert.ok(cross < .02, `${r.id} ${key} 斜接门洞 (${(Math.asin(Math.min(1, cross)) * 180 / Math.PI).toFixed(1)}°)`);
      assert.ok(Math.abs(segLen(e.seg) - path.width) < .06, `${r.id} ${key} 门宽 ${segLen(e.seg).toFixed(2)} ≠ 桥宽 ${path.width}`);
      assert.ok(e.lintel > 3 && e.lintel < 3.9, `${r.id} ${key} 门洞没有门楣`);
    }
  }
});

test('一期、二期云环天桥入口与 5 m 连廊同宽，不在两侧留出落空缺口', () => {
  for (const id of ['P1-BR', 'P2-BR']) {
    const e = L.entrances.find(en => en.id === id);
    assert.ok(Math.abs(segLen(e.seg) - BRIDGE.linkWidth) < .05, `${id} 门宽 ${segLen(e.seg).toFixed(2)}`);
  }
});

// The 2F façade bays used to open whole 4 m bays floor-to-4.6 m at every
// skybridge door: glass and stone now close beside and above the doorway.
test('二层天桥门洞只开桥面宽度、到门楣高度，两侧和上方的幕墙保留', () => {
  const full = L, P1 = full.buildings.find(b => b.id === 'P1');
  const layout = { ...full, buildings: [P1], levels: full.levels.filter(lv => lv.id === 'P1-2F' || lv.id === 'P1-3F') };
  const materials = new Proxy({}, { get: (m, k) => m[k] ||= new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) });
  const floor = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const levels = Object.fromEntries(layout.levels.map(lv => [lv.id, { lv, base: new THREE.Group(), shell: new THREE.Group(), facade: new THREE.Group(),
    signs: new SignBatch(), facadeSigns: new SignBatch(), batch: new BatchSet(materials), shellBatch: new BatchSet(materials), facadeBatch: new BatchSet(materials) }]));
  const ctx = { layout, levels, mats: { base: materials, floor: () => floor, onNight: () => {}, screen: () => materials.screen, sign: () => materials.sign },
    dynamic: [],
    bById: { P1 }, atlas: { 'P1-2F': { cell: () => null }, 'P1-3F': { cell: () => null } }, buildings: { P1: { b: P1, levels: Object.values(levels) } } };
  buildShell(ctx);
  const meshes = [];
  for (const v of Object.values(levels)) {
    v.batch.flush(v.base); v.shellBatch.flush(v.shell); v.facadeBatch.flush(v.facade);
    for (const g of [v.base, v.shell, v.facade]) { g.updateMatrixWorld(true); g.traverse(o => { if (o.isMesh) meshes.push(o); }); }
  }
  const lv = layout.levels.find(l => l.id === 'P1-2F');
  let checked = 0;
  for (const id of ['P1-ART-S-start', 'P1-ART-E-start', 'P1-BR']) {
    const e = full.entrances.find(en => en.id === id && en.level === lv.id);
    if (!e) continue;
    const len = segLen(e.seg), tx = (e.seg.x1 - e.seg.x0) / len, tz = (e.seg.z1 - e.seg.z0) / len;
    const head = e.lintel ?? 3.85;
    const cast = (along, h) => {
      const x = e.seg.x0 + tx * along, z = e.seg.z0 + tz * along;
      return new THREE.Raycaster(new THREE.Vector3(x + e.nx * 1.5, lv.elev + h, z + e.nz * 1.5), new THREE.Vector3(-e.nx, 0, -e.nz), 0, 3).intersectObjects(meshes, false);
    };
    for (let along = .4; along < len - .35; along += .5) for (const h of [1.2, 2.6]) assert.equal(cast(along, h).length, 0, `${id} 门洞被挡 ${along.toFixed(1)},${h}`);
    for (let along = .4; along < len - .35; along += .5) assert.ok(cast(along, head + .45).length > 0, `${id} 门洞上方露空 ${along.toFixed(1)}`);
    for (const along of [-.7, len + .7]) assert.ok(cast(along, 1.6).length > 0, `${id} 门旁幕墙缺失 ${along.toFixed(1)}`);
    checked++;
  }
  assert.ok(checked >= 2);
  for (const m of meshes) m.geometry.dispose();
  for (const m of Object.values(materials)) m.dispose();
  floor.dispose();
});
