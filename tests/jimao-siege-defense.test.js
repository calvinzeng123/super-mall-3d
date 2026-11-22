// 丧尸围城的封门和路障（src/jimao/siege-defense.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav } from '../src/layout/nav.js';
import { SIEGE, TOWERS } from '../src/jimao/siege.js';
import { DEFENSE, sealSegments, buildSeals, segDist, createBarricades } from '../src/jimao/siege-defense.js';

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' });
const insideOf = (T) => (f) => SIEGE.area.mall.includes(f) || f === T.power || String(f).startsWith(`${T.id}-`);

test('封门：范围往外的每个门口、每部扶梯口都有一道卷帘；范围里面互通的口子不封；两栋楼各算各的', () => {
  for (const T of Object.values(TOWERS)) {
    const inside = insideOf(T), segs = sealSegments(nav, inside);
    const doors = segs.filter((q) => q.kind === 'door'), slopes = segs.filter((q) => q.kind === 'slope');
    assert.ok(doors.length >= 16, `${T.id}：商场一层通到街上的门都封（${doors.length} 道）`); assert.ok(slopes.length >= 8, `${T.id}：上二层的扶梯、楼梯都封（${slopes.length} 处）`);
    // 该封的一个不漏、不该封的一个不封
    const want = nav.portals.filter((p) => inside(p.a) !== inside(p.b)).length; assert.equal(doors.length, want);
    for (const q of segs) { assert.ok(Math.hypot(q.x1 - q.x0, q.z1 - q.z0) > 0.5 && q.h >= 2.5); assert.ok(Number.isFinite(q.y)); }
    // 商场一层 → 二层的扶梯：封在一层这头（标高贴着一层）
    const up = nav.slopes.filter((s) => s.low === 'P1-1F' && s.high === 'P1-2F'); assert.ok(up.length >= 2);
    assert.ok(slopes.filter((q) => Math.abs(q.y - nav.floors.get('P1-1F').y) < 0.6).length >= up.length);
    // 没有 document：照样建得出来（一个网格），能释放
    const scene = new THREE.Group(), built = buildSeals(scene, segs);
    assert.equal(built.count, segs.length); assert.equal(scene.children.length, 1); assert.ok(built.mesh.geometry.attributes.position.count > segs.length * 24);
    built.dispose(); assert.equal(scene.children.length, 0);
  }
  assert.equal(buildSeals(new THREE.Group(), []).mesh, null);
});

test('路障：发几个摆几个、摆在面前；丧尸碰上被推回去、路障掉耐久，掉光了塌；巨尸几下拍碎；最多立 max 道', () => {
  assert.deepEqual(segDist(0, 2, -1, 0, 1, 0), { d: 2, x: 0, z: 0 }); assert.equal(segDist(5, 0, -1, 0, 1, 0).d, 4);
  const scene = new THREE.Group(), msgs = [], shoved = [];
  const mk = (x, z, kind = 'walker') => ({ active: true, alive: true, kind, pos: new THREE.Vector3(x, 0, z), shove(dx, dz, p) { shoved.push([dx, dz, p]); this.pos.x += dx; this.pos.z += dz; return true; } });
  const pool = [];
  const G = { player: { pos: new THREE.Vector3(0, 0, 0), yaw: 0 }, game: { state: 'playing' }, hud: { message: (t) => msgs.push(t) }, events: { emit() {} }, physics: { groundHeight: () => 0 } };
  const B = createBarricades(G, { scene, zombies: { pool } });
  assert.equal(B.place(), null, '没开不摆'); B.enabled = true; assert.equal(B.place(), null, '手里没有'); assert.ok(msgs.some((t) => /没有路障/.test(t)));
  assert.equal(B.give(2), 2); assert.equal(B.give(9), DEFENSE.carry - 2, '最多带 carry 个');
  const w = B.place(); assert.ok(w); assert.equal(B.count, DEFENSE.carry - 1);
  // yaw = 0 面朝 −z：路障在前面 ahead 米，长边沿 x
  assert.ok(Math.abs(w.z + DEFENSE.wall.ahead) < 1e-6 && Math.abs(w.x) < 1e-6); assert.ok(Math.abs(w.x1 - w.x0) > 2 && Math.abs(w.z1 - w.z0) < 1e-6);
  // 一只行尸走到跟前：被往它来的那边推回去，路障掉一点
  const z = mk(0.3, -DEFENSE.wall.ahead - 0.6); pool.push(z);
  B.update(0.4); assert.equal(shoved.length, 1); assert.ok(shoved[0][1] < -0.9, '往外推'); assert.equal(w.hp, DEFENSE.wall.hp - DEFENSE.wall.wear);
  // 离得远的、不在一层的不管
  pool.push(mk(0, -8), Object.assign(mk(0, -DEFENSE.wall.ahead), { pos: new THREE.Vector3(0, 4, -DEFENSE.wall.ahead) })); B.update(0.4); assert.equal(shoved.length, 1);
  // 巨尸：两下就碎
  pool.length = 0; pool.push(mk(0, -DEFENSE.wall.ahead - 0.5, 'brute')); B.update(0.4); B.update(0.4);
  assert.ok(w.hp <= 0 && w.fallT >= 0, '塌了'); assert.ok(msgs.some((t) => /冲垮/.test(t)));
  for (let i = 0; i < 5; i++) B.update(0.2); assert.equal(B.walls.length, 0); assert.equal(scene.children[0].children.length, 0);
  // 最多立 max 道：再摆就把最早的那道撤掉
  pool.length = 0; B.give(9); for (let i = 0; i < DEFENSE.wall.max + 1; i++) { G.player.pos.x = i * 4; B.give(1); B.place(); B.update(0.6); }
  assert.ok(B.walls.filter((q) => q.fallT < 0).length <= DEFENSE.wall.max);
  // 落脚点和人不在一层：不摆
  G.physics.groundHeight = () => 5; B.give(1); assert.equal(B.place(), null); assert.ok(msgs.some((t) => /摆不下/.test(t)));
  B.reset(); assert.equal(B.count, 0); assert.equal(B.walls.length, 0); B.dispose(); assert.equal(scene.children.length, 0);
});
