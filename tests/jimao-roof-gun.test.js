// 丧尸围城的楼顶重机枪台（src/jimao/roof-gun.js，枪是 door-gun.js 那一挺）：摆在哪（走得到、不挡停机位 / 信号弹 / 楼梯口 / 登机门）、上下台子、
// 360 度都转得过去、往下压得到台脚、不耗子弹、会过热、能穿透，直升机落稳 / 读档 / 阵亡 / 被掀下来都会下来；丧尸绕着台子走到梯子口来抓人。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, clear } from '../src/layout/nav.js';
import { createMapPhysics } from '../src/jimao/physics.js';
import { createPathfinder } from '../src/jimao/pathfinder.js';
import { stairRuns } from '../src/jimao/stairs.js';
import { TOWERS, SIEGE, siegePlan } from '../src/jimao/siege.js';
import { RIDE_SPECS, rideLocalToWorld, rideFootprint } from '../src/jimao/ride-vehicles.js';
import { aimAngles, inGunArc, DOOR_GUN } from '../src/jimao/door-gun.js';
import { ROOF_GUN, siteGeom, blockNav, unblockNav, createRoofGun } from '../src/jimao/roof-gun.js';
import { addZombies } from '../src/jimao/zombie.js';

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' }), runs = stairRuns(nav);
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };
const roofY = (T) => nav.floors.get(T.roof).y;
const st = (T, x, z) => ({ floor: T.roof, x, z, y: roofY(T), slope: null });
/** 点到台子占地（轴对齐方框）的水平距离 */
const toBox = (b, x, z) => Math.hypot(Math.max(0, b.x0 - x, x - b.x1), Math.max(0, b.z0 - z, z - b.z1));
/** 屋顶上楼梯间 / 电梯井的方框（和 siege.js housings() 一样算） */
function housings(T) {
  const lv = L.levels.find((l) => l.id === T.roof), out = [];
  const add = (pts, pad = 0) => { const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]); out.push({ x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad }); };
  for (const r of lv.rooms || []) if ((r.type === 'stair' || r.type === 'core') && r.polys?.length) add(r.polys.flat());
  for (const r of runs) if (r.to === T.roof) add([r.a, r.b, r.ea, r.eb].filter(Boolean).map((q) => [q.x, q.z]), 0.6);
  return out;
}
const FLARE_TRY = [[7.5, 3], [-7.5, 3], [3, 7.5], [3, -7.5], [-7.5, -3], [7.5, -3], [-3, 7.5], [-3, -7.5]];

test('摆在哪：公寓两座、北区一座；台子整个压在屋面上（不在楼梯间里、离女儿墙留得出一圈路），离停机位够远（旋翼扫不到）、不压信号弹的备选点；摆进导航以后台子里站不住、梯子口站得住', () => {
  assert.equal(ROOF_GUN.sites.A.length, 2, '公寓楼顶两座（两个楼梯间各盯一座）');
  assert.equal(ROOF_GUN.sites.T1.length, 1, '北区 1 号楼只放得下一座');
  for (const T of Object.values(TOWERS)) {
    const y = roofY(T), H = housings(T), b0 = L.buildings.find((b) => b.id === T.id), xs = b0.outline.map((p) => p[0]), zs = b0.outline.map((p) => p[1]);
    const out = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }, fp = rideFootprint(T.pad);
    for (const site of ROOF_GUN.sites[T.id]) {
      const g = siteGeom(site, y), b = g.bb;
      for (let x = b.x0 - 0.6; x <= b.x1 + 0.6; x += 0.3) for (let z = b.z0 - 0.6; z <= b.z1 + 0.6; z += 0.3) {
        const q = landAt(nav, x, z, y + 0.6); assert.ok(q && q.floor === T.roof && Math.abs(q.y - y) < 0.05, `${site.name} (${x.toFixed(1)}, ${z.toFixed(1)}) 在屋面上`);
        assert.ok(!H.some((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1), `${site.name} 不压楼梯间`);
      }
      assert.ok(Math.min(b.x0 - out.x0, out.x1 - b.x1, b.z0 - out.z0, out.z1 - b.z1) >= 1.2, `${site.name} 离女儿墙至少 1.2 米（翻墙上来的、绕台子的走得过）`);
      // 主旋翼：机身里 (0, 3.15, -0.45)、半径 5.3 米；台子连护栏最高 deck.h + rail，比旋翼低——水平上也扫不到
      const hub = rideLocalToWorld(T.pad, y, [0, 0, -0.45]), rotor = toBox(b, hub.x, hub.z);
      assert.ok(rotor > 5.4, `${site.name} 离旋翼轴 ${rotor.toFixed(2)} 米（旋翼半径 5.3）`);
      assert.ok(ROOF_GUN.deck.h + ROOF_GUN.deck.rail < 3.15, '护栏顶比旋翼低');
      assert.ok(toBox(b, (fp.x0 + fp.x1) / 2, (fp.z0 + fp.z1) / 2) > 4, '离机身远');
      // 信号弹：siegePlan 按 FLARE_TRY 的顺序挑第一处站得住的；挑中的那一处和排在它前面的备选点都不压（压了信号弹就挪地方了——下一个测试摆进导航再核一遍）
      const flare = siegePlan(seq(5), L, nav, runs, T).flare, upto = FLARE_TRY.findIndex(([dx, dz]) => Math.abs(T.pad.x + dx - flare.x) < 1e-6 && Math.abs(T.pad.z + dz - flare.z) < 1e-6);
      assert.ok(toBox(b, flare.x, flare.z) > 2.5, `${site.name} 离信号弹 ${toBox(b, flare.x, flare.z).toFixed(1)} 米`);
      for (const [dx, dz] of FLARE_TRY.slice(0, upto + 1)) assert.ok(toBox(b, T.pad.x + dx, T.pad.z + dz) > 1.5, `${site.name} 不压信号弹的备选点 (${dx}, ${dz})`);
      assert.ok(g.seat.y - y > 3, '眼睛在台面上');
    }
  }
  // 摆进导航：台子里站不住，梯子口站得住；撤掉复原
  const T = TOWERS.A, g = siteGeom(ROOF_GUN.sites.A[0], roofY(T)), F = nav.floors.get(T.roof), w0 = F.walls.length, o0 = F.obstacles.length;
  assert.ok(clear(nav, st(T, g.x, g.z)), '摆之前台子那儿是空地');
  const h = blockNav(nav, T.roof, g.poly);
  assert.ok(!clear(nav, st(T, g.x, g.z)) && !clear(nav, st(T, g.x + 1, g.z - 1)), '台子里站不住');
  assert.ok(clear(nav, st(T, g.foot.x, g.foot.z)), '梯子口站得住');
  unblockNav(nav, h);
  assert.equal(F.walls.length, w0); assert.equal(F.obstacles.length, o0); assert.ok(clear(nav, st(T, g.x, g.z)), '撤掉以后复原');
});

test('摆进导航以后：信号弹还在原来那一点；楼梯口出来到停机位的路不贴着台子；梯子口从楼梯口、信号弹走得到，到登机门也走得到；台子背面绕得到梯子口', () => {
  for (const T of Object.values(TOWERS)) {
    const y = roofY(T), before = siegePlan(seq(5), L, nav, runs, T).flare;
    const blocks = ROOF_GUN.sites[T.id].map((s) => blockNav(nav, T.roof, siteGeom(s, y).poly));
    try {
      const pf = createPathfinder(nav), after = siegePlan(seq(5), L, nav, runs, T).flare;
      assert.deepEqual([after.x, after.z], [before.x, before.z], `${T.id} 信号弹的位置不变`);
      const door = rideLocalToWorld(T.pad, y, RIDE_SPECS.helicopter.doorOut);
      for (const site of ROOF_GUN.sites[T.id]) {
        const g = siteGeom(site, y), foot = st(T, g.foot.x, g.foot.z);
        for (const r of runs.filter((q) => q.to === T.roof)) {
          const top = st(T, r.b.x, r.b.z), toPad = pf.findNow(top, st(T, T.pad.x, T.pad.z));
          assert.ok(toPad, `${T.id} ${r.id} 楼梯口到停机位还走得通`);
          for (const p of toPad) assert.ok(toBox(g.bb, p.x, p.z) > 0.8, `${r.id} 出门的路不贴着 ${site.name}`);
          assert.ok(pf.findNow(top, foot), `${r.id} 楼梯口走得到 ${site.name} 的梯子口`);
        }
        assert.ok(pf.findNow(st(T, after.x, after.z), foot), `信号弹走得到 ${site.name}`);
        assert.ok(pf.findNow(foot, st(T, door.x, door.z)), `${site.name} 走得到登机门`);
        // 台子背面（梯子对面）1 米外：站得住、绕得到梯子口
        const back = { x: 2 * g.x - g.foot.x, z: 2 * g.z - g.foot.z }, k = (ROOF_GUN.deck.size / 2 + 1) / Math.hypot(back.x - g.x, back.z - g.z), bx = g.x + (back.x - g.x) * k, bz = g.z + (back.z - g.z) * k;
        assert.ok(clear(nav, st(T, bx, bz)), `${site.name} 背面站得住`);
        const p = pf.findNow(st(T, bx, bz), foot); assert.ok(p, `${site.name} 背面绕得到梯子口`);
        for (const q of p) assert.ok(toBox(g.bb, q.x, q.z) > 0.05, '绕着走，不穿台子');
      }
    } finally { for (const b of blocks.reverse()) unblockNav(nav, b); }
  }
});

// ---- 接到游戏上（假的游戏外壳，真的导航、物理、丧尸） ----
function gworld(tower = 'A', { zombies = 0 } = {}) {
  const physics = createMapPhysics(nav); physics.pathfinder = createPathfinder(nav);
  const handlers = {}, events = [], hurt = [], shots = [], msgs = [];
  const T = TOWERS[tower], y = roofY(T);
  const player = { pos: new THREE.Vector3(T.pad.x + 3, y, T.pad.z + 3), vel: new THREE.Vector3(), eye: new THREE.Vector3(), yaw: 0, pitch: 0, alive: true, health: 100, mounted: false,
    damage(n) { hurt.push(n); this.health -= n; }, addShake() {} };
  const input = { touch: false, held: new Set(), tap: new Set(), fire: false, promptOn: false, down(a) { return this.held.has(a); }, pressed(a) { return this.tap.has(a); }, setPrompt(v) { this.promptOn = !!v; } };
  const camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.05, 500);
  const ctx = { rng: seq(11), list: [], retire(m) { m._deactivate(); const i = ctx.list.indexOf(m); if (i >= 0) ctx.list.splice(i, 1); }, releaseToken() {} };
  const enemies = { debug: { ctx }, list: ctx.list, spawn(type, pos, opts) { const z = ctx.pools[type].find((q) => !q.active); if (!z) return null; z._activate(pos, opts); ctx.list.push(z); return z; } };
  const weapon = { shown: true, setVisible(v) { this.shown = v; } };
  const G = { scene: new THREE.Scene(), physics, player, input, camera, enemies, time: { frame: 0 }, weapon, rifle: { ammo: 30, reserve: 90 },
    events: { emit(n, e) { events.push([n, e]); for (const h of handlers[n] || []) h(e); }, on(n, h) { (handlers[n] ||= []).push(h); }, off(n, h) { handlers[n] = (handlers[n] || []).filter((q) => q !== h); } },
    combat: { playerShot(o, d, opts) { shots.push({ o: o.clone(), d: d.clone(), ...opts }); return null; } },
    hud: { prompt: null, setPrompt(t) { this.prompt = t; }, message(t) { msgs.push(t); }, radio(t) { msgs.push('R:' + t); } },
    game: { state: 'playing', refreshObjective() {} }, fx: { smoke() {}, explosion() {} } };
  G.zombies = zombies ? addZombies(G, enemies, { count: zombies }) : { pool: [] };
  const siege = { enabled: true, plan: { tower: T }, state: { hold: 5, landed: false, pin: null }, demo: { running: false } }, director = { riding: false };
  const rg = createRoofGun(G, { scene: G.scene, nav, siege, director, camera });
  rg.reset();
  /** 一帧：先照原游戏摆镜头（人眼、yaw / pitch），再走寻路、丧尸、机枪台 */
  const frame = (dt = 1 / 30) => {
    G.time.frame++;
    camera.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); camera.updateMatrixWorld();
    physics.pathfinder.update(4);
    for (const z of [...ctx.list]) z._update(dt);
    rg.update(dt); input.tap.clear();
  };
  const run = (secs, each) => { for (let t = 0; t < secs - 1e-9; t += 1 / 30) { each?.(); frame(); } };
  const press = (a) => { input.tap.add(a); frame(); };
  return { G, T, y, rg, siege, director, player, input, camera, events, hurt, shots, msgs, weapon, frame, run, press, ctx, dispose() { rg.dispose(); } };
}

test('上台子：走到梯子口有提示，按 E 上去——人的脚留在梯子口、镜头抬到台面上、动不了、步枪收起来、不能切枪；再按 E 或跳就下来，枪拿回来', () => {
  const w = gworld('A'), { rg, player, G, camera } = w;
  try {
    assert.equal(rg.tower, 'A'); assert.equal(rg.list.length, 2); assert.ok(rg.list.every((e) => e.group.visible), '这一局那栋楼的台子摆出来了');
    w.frame(); assert.equal(G.hud.prompt, null, '离得远没有提示');
    const e = rg.list[0], foot = e.geo.foot;
    player.pos.set(foot.x + 0.8, foot.y, foot.z + 0.6); w.frame();
    assert.match(G.hud.prompt, /架起重机枪/);
    w.press('interact');
    assert.equal(rg.active, true); assert.equal(rg.current, e); assert.equal(player.mounted, true); assert.equal(G.weaponHold, true, '不能切枪'); assert.equal(w.weapon.shown, false, '步枪收起来');
    assert.ok(player.pos.distanceTo(foot) < 1e-6, '脚在梯子口');
    w.run(0.6);
    assert.ok(camera.position.distanceTo(e.geo.seat) < 1e-6, '镜头在台面上');
    assert.ok(camera.position.y - w.y > ROOF_GUN.deck.h + 1.5, '站在高台上');
    w.input.held.add('forward'); player.vel.set(3, 0, 0); w.frame(); assert.ok(player.pos.distanceTo(foot) < 1e-6 && player.vel.length() === 0, '动不了');
    assert.equal(w.input.promptOn, true, '手机上的交互键亮着（按它下来）');
    w.press('interact'); assert.equal(rg.active, false); assert.equal(player.mounted, false); assert.equal(G.weaponHold, false); assert.equal(w.weapon.shown, true, '枪拿回来了');
    w.run(0.5); assert.ok(Math.abs(camera.position.y - (w.y + 1.62)) < 1e-6, '镜头落回人眼');
    // 跳也能下来
    w.press('interact'); w.run(0.6); assert.equal(rg.active, true); w.press('jump'); assert.equal(rg.active, false);
    // 被拽住（扑袭者按住）时上不去
    w.siege.state.pin = {}; w.press('interact'); assert.equal(rg.active, false, '被按住时上不去'); w.siege.state.pin = null;
  } finally { w.dispose(); }
});

test('360 度：枪架跟着视线绕一整圈、哪个方向都在射界里（左右不限）；往下压得到台脚的丧尸，舱门机枪那个射界压不到', () => {
  const w = gworld('A'), { rg, player, camera } = w;
  try {
    const e = rg.list[1]; player.pos.copy(e.geo.foot); w.press('interact'); w.run(0.6);
    const q = new THREE.Quaternion(), d = new THREE.Vector3();
    // 鼠标一帧转 0.05 弧度（每秒 1.5 弧度，在枪架最快转速以内）转到 want
    const turnTo = (want) => { for (let i = 0; i < 400; i++) { const dy = ((want - player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; if (Math.abs(dy) < 1e-6) break; player.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 0.05); w.frame(); } w.run(0.1); };
    // 一下甩 180 度：重机枪转得慢，这一帧只转 traverse × dt
    const y0 = player.yaw; player.yaw += Math.PI; w.frame();
    assert.ok(Math.abs(Math.abs(player.yaw - y0) - ROOF_GUN.traverse / 30) < 1e-6, `一帧最多转 ${(ROOF_GUN.traverse / 30).toFixed(3)} 弧度`);
    for (let k = 0; k < 24; k++) {
      player.pitch = -0.3; turnTo((k / 24) * Math.PI * 2 - Math.PI);
      camera.getWorldDirection(d); const look = Math.atan2(d.x, d.z);
      e.ring.getWorldQuaternion(q); const ring = Math.atan2(new THREE.Vector3(0, 0, 1).applyQuaternion(q).x, new THREE.Vector3(0, 0, 1).applyQuaternion(q).z);
      assert.ok(Math.abs(((ring - look + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.02, `朝 ${(player.yaw * 57.3).toFixed(0)}°：枪架跟着转`);
      const n = w.shots.length; w.input.held.add('fire'); w.run(0.5); w.input.held.delete('fire');
      assert.ok(w.shots.length > n, `朝 ${(player.yaw * 57.3).toFixed(0)}° 打得响`);
      assert.ok(w.shots.at(-1).d.dot(d) > 0.97, '子弹顺着视线出去');
    }
    // 射界：台脚（贴着挡板，离台边 0.35 米）的丧尸胸口、头都压得到；左右任意角度
    const g = e.geo, m = new THREE.Quaternion(), C = ROOF_GUN.gun;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, r = ROOF_GUN.deck.size / 2 + 0.35, chest = new THREE.Vector3(g.x + Math.sin(a) * r, g.y + 1.15, g.z + Math.cos(a) * r);
      const ang = aimAngles(m, g.seat, chest);
      assert.ok(inGunArc({ ...ang, yaw: ang.yaw }, 0.03, 150, { ...DOOR_GUN, ...C }), `台脚 ${(a * 57.3).toFixed(0)}° 压得到（往下 ${(ang.pitch * 57.3).toFixed(0)}°）`);
    }
    const back = aimAngles(m, g.seat, new THREE.Vector3(g.x, g.y + 1.15, g.z - 10));
    assert.ok(!inGunArc(back) && inGunArc(back, 0.03, 150, { ...DOOR_GUN, ...C }), '正后方：舱门机枪转不过去，楼顶这挺转得过去');
  } finally { w.dispose(); }
});

test('不耗子弹，只会过热：连着打几秒锁死、锁着不出弹，冷下来才能再打；步枪的子弹一发没少', () => {
  const w = gworld('A'), { rg, player, G } = w;
  try {
    const e = rg.list[0]; player.pos.copy(e.geo.foot); w.press('interact'); w.run(0.6);
    player.pitch = -0.2; w.input.held.add('fire');
    let t = 0; while (!e.gun.overheated && t < 20) { w.frame(); t += 1 / 30; }
    assert.ok(e.gun.overheated, '会过热');
    assert.ok(t > 4 && t < 10, `连打 ${t.toFixed(1)} 秒过热（不是一下就热，也不是打不热）`);
    const n0 = w.shots.length; assert.ok(n0 > 50, `过热之前打了 ${n0} 发`);
    w.run(1); assert.equal(w.shots.length, n0, '锁着不出弹');
    assert.ok(w.msgs.some((m) => /过热/.test(m)));
    w.input.held.delete('fire'); let c = 0; while (e.gun.overheated && c < 10) { w.frame(); c += 1 / 30; }
    assert.ok(!e.gun.overheated && c > 1 && c < 4, `松开 ${c.toFixed(1)} 秒冷下来`);
    w.input.held.add('fire'); w.run(1); assert.ok(w.shots.length > n0 + 8, '冷下来又能打');
    assert.equal(G.rifle.ammo, 30); assert.equal(G.rifle.reserve, 90);
    assert.ok(w.shots.every((s) => s.damage === ROOF_GUN.gun.damage), '一发的伤害');
  } finally { w.dispose(); }
});

test('穿透：一排丧尸一发能连着打穿 pierce 只，后面的伤害打折；打空就不再往后找', () => {
  const w = gworld('A'), { rg, player, G } = w;
  try {
    const hits = []; let row = 3;
    G.combat.playerShot = (o, d, opts) => { hits.push(opts.damage); if (row-- > 0) return { point: o.clone().addScaledVector(d, 4), dist: 4, enemy: {}, surface: 'enemy' }; return null; };
    const e = rg.list[0]; player.pos.copy(e.geo.foot); w.press('interact'); w.run(0.6); player.pitch = -0.1;
    hits.length = 0; row = 9; w.input.held.add('fire');
    for (let i = 0; i < 40 && !hits.length; i++) w.frame();
    w.run(0.3); w.input.held.delete('fire');
    const D = ROOF_GUN.gun.damage, k = ROOF_GUN.gun.pierceMul, n = ROOF_GUN.gun.pierce;
    assert.ok(n >= 1, '能穿透');
    const one = hits.slice(0, n + 1).map((x) => +x.toFixed(2)), want = Array.from({ length: n + 1 }, (_, i) => +(D * k ** i).toFixed(2));
    assert.deepEqual(one, want, `一发打中一只再穿 ${n} 只：${one}`);
    assert.equal(hits[n + 1], D, '穿够了就停，下一发从头算');
  } finally { w.dispose(); }
});

test('自动下来：直升机落稳（开始登机）、坐上飞机、阵亡、读档重来（reset）、被巨尸拍 / 气浪掀、被扑袭者扑；落稳以后上不去', () => {
  const w = gworld('T1'), { rg, player, siege, director, G } = w;
  try {
    assert.equal(rg.list.length, 1); const e = rg.list[0];
    const up = () => { player.pos.copy(e.geo.foot); player.mounted = false; w.press('interact'); w.run(0.6); assert.equal(rg.active, true, '上去了'); };
    up(); siege.state.landed = true; w.frame(); assert.equal(rg.active, false, '落稳就下来'); assert.equal(player.mounted, false);
    w.press('interact'); assert.equal(rg.active, false, '落稳以后上不去'); siege.state.landed = false;
    up(); director.riding = true; w.frame(); assert.equal(rg.active, false, '坐上飞机'); director.riding = false;
    up(); player.alive = false; G.events.emit('player:dead', {}); w.frame(); assert.equal(rg.active, false, '阵亡'); player.alive = true;
    up(); rg.reset(); assert.equal(rg.active, false, '读档 / 重来'); assert.equal(player.mounted, false); assert.equal(G.weaponHold, false); assert.equal(e.gun.heat, 0);
    up(); G.events.emit('zombie:knock', { power: 12 }); assert.equal(rg.active, false); assert.match(w.msgs.at(-1), /拍下来/);
    up(); G.events.emit('zombie:pin', { enemy: {} }); assert.equal(rg.active, false);
    up(); siege.demo.running = true; w.frame(); assert.equal(rg.active, false, '看炸楼'); assert.ok(!e.group.visible, '炸楼时台子跟着没了'); siege.demo.running = false;
  } finally { w.dispose(); }
});

test('换楼 / 关掉丧尸围城：台子跟着这一局那栋楼走，别的楼顶的从导航、物理里撤掉', () => {
  const w = gworld('A'), { rg, siege, G } = w, FA = nav.floors.get('A-RF'), FT = nav.floors.get('T1-RF'), a0 = FA.obstacles.filter((o) => o.roofGun).length;
  try {
    assert.equal(a0, 2); assert.equal(G.physics.boxes.length, 2); assert.equal(G.physics.occluders.length, 2);
    siege.plan = { tower: TOWERS.T1 }; rg.reset();
    assert.equal(FA.obstacles.filter((o) => o.roofGun).length, 0, '公寓楼顶的撤了'); assert.equal(FT.obstacles.filter((o) => o.roofGun).length, 1);
    assert.equal(G.physics.boxes.length, 1); assert.equal(rg.tower, 'T1');
    siege.enabled = false; rg.reset(); assert.equal(rg.tower, null); assert.equal(FT.obstacles.filter((o) => o.roofGun).length, 0); assert.equal(G.physics.boxes.length, 0);
    assert.deepEqual(rg.markers(), []);
  } finally { w.dispose(); }
  assert.equal(FA.obstacles.filter((o) => o.roofGun).length + FT.obstacles.filter((o) => o.roofGun).length, 0, '收干净了');
});

test('丧尸：绕着台子走到梯子口来抓你（寻路找得到、不穿台子、不卡在台子背面），台子四面别处够不着', () => {
  const w = gworld('A', { zombies: 10 }), { rg, player, G, hurt } = w;
  try {
    const e = rg.list[0], g = e.geo; player.pos.copy(g.foot); w.press('interact'); w.run(0.6);
    // 一半放在台子背面（梯子对面）4–6 米，一半放在两侧
    const out = [];
    for (let k = 0; k < 8; k++) {
      const a = Math.PI + (k - 3.5) * 0.35, r = 4 + (k % 3), x = g.x + Math.sin(g.yaw + a) * r, z = g.z + Math.cos(g.yaw + a) * r;
      if (!clear(nav, st(w.T, x, z))) continue;
      const z0 = G.enemies.spawn('zombie', new THREE.Vector3(x, w.y, z), { kind: 'walker', hunt: true }); if (z0) out.push(z0);
    }
    assert.ok(out.length >= 6, `放了 ${out.length} 只`);
    let inside = 0;
    w.run(16, () => { for (const z of out) if (z.alive && toBox(g.bb, z.pos.x, z.pos.z) < 0.05) inside++; });
    const reached = out.filter((z) => Math.hypot(z.pos.x - g.foot.x, z.pos.z - g.foot.z) < 2.2).length;
    assert.equal(inside, 0, '没有一只穿进台子里');
    assert.ok(reached >= out.length - 2, `${reached}/${out.length} 只绕到了梯子口`);
    assert.ok(out.every((z) => (z.noPath || 0) < 3), '寻路都找得到（不会因为人站在台子上被当成走不到收回去）');
    assert.ok(hurt.length > 0, '扒在梯子口的抓得到你');
    assert.equal(rg.active, true, '行尸抓几下不会把人拽下来');
  } finally { w.dispose(); }
});
