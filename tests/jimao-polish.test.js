// 丧尸围城 / 零点突围的打磨：商场段每一步隔开一段路、拿东西点一下就行（不用按住）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, landAt, clear } from '../src/layout/nav.js';
import { findPath } from '../src/fps/pathfinding.js';
import { pointInPoly } from '../src/layout/geom.js';
import { stairRuns } from '../src/jimao/stairs.js';
import { siegePlan, TOWERS, GATES } from '../src/jimao/siege.js';
import { MALL } from '../src/jimao/siege-mall.js';
import { roomSites, rollMission, MISSION_TYPES } from '../src/jimao/missions.js';
import { PICKUP, tapStage, tapObjective, promptVerb, shortName, createPickupFx } from '../src/jimao/pickup.js';
import { PATCHES } from '../scripts/jimao/patches.mjs';
import { escapeLikeEsbuild } from '../scripts/jimao/rebrand.mjs';

const L = buildPlayableLayout({ mode: 'arcade' }), nav = buildNav(L, { gates: 'open' }), runs = stairRuns(nav);
const seq = (seed) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 5; i++) r(); return r; };
const walk = (a, b) => { const p = findPath(nav, a, b); if (!p) return null; let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return d; };

test('商场段：相邻两步至少隔开 MALL.spread.min 米的路（摇柄在店里、撬扶梯口、捡手枪这几步本来就在上一步跟前），每一步都走得到；三层的头几步不再挤在开局那家店门口', () => {
  for (const seed of [3, 99]) {
    const plan = siegePlan(seq(seed), L, nav, runs, TOWERS.A), M = plan.mall, upto = plan.stageOf('arms');
    let prev = M.start, total = 0; const legs = {};
    for (const st of plan.stages.slice(0, upto + 1)) {
      const q = landAt(nav, st.site.x, st.site.z, st.site.y + 0.6); assert.ok(q && q.floor === st.floor && clear(nav, q), `${st.id} 站得住`);
      const d = walk(prev, st.site); assert.ok(d !== null, `${st.id}：从上一步走得到`);
      legs[st.id] = d; total += d;
      if (!MALL.spread.same.includes(st.id) && st.id !== 'crank') assert.ok(d >= MALL.spread.min, `${st.id} 离上一步只有 ${d.toFixed(1)} 米`);
      prev = st.site;
    }
    // 三层：撬棍、救人、护送各是一小段路（以前 19 / 28 / 14 米，一共 60 米，都挤在开局那家店周围）
    const three = legs.crowbar + legs.rescue + legs.escort; assert.ok(three >= 90, `三层三段一共 ${three.toFixed(0)} 米`); assert.ok(legs.escort >= 30, `护送 ${legs.escort.toFixed(1)} 米`);
    // 一整段商场不至于拖太长：开局到武器柜 400–650 米（以前约 390 米）
    assert.ok(total > 400 && total < 650, `商场段一共 ${total.toFixed(0)} 米`);
    // 没有一步落在卷帘拉下的店里（用到的店才开着）
    const lv = (f) => L.levels.find((l) => l.id === f), open = new Set(M.shops);
    for (const st of plan.stages.slice(0, upto)) {
      const shut = lv(st.floor).units.filter((u) => !u.residence && u.polys?.[0] && !open.has(u.id) && pointInPoly([st.site.x, st.site.z], u.polys[0]));
      assert.deepEqual(shut.map((u) => u.brand?.name), [], `${st.id} 落在锁着的店里`);
    }
    assert.equal(M.rescue.name, MALL.shop.rescue); assert.match(plan.stages[plan.stageOf('crowbar')].label, new RegExp(MALL.shop.crowbar));
  }
});

test('拿东西点一下就行：捡起来、按开关、刷卡的步骤是 tap；撬、摇、加油启动、清障、换保险丝、灭火要按住；护送、潜行到了自动完成', () => {
  const plan = siegePlan(seq(7), L, nav, runs, TOWERS.A), tap = {}, hold = {};
  for (const st of plan.stages) (tapStage(st) ? tap : hold)[st.kind === 'gate' ? `gate:${st.type}` : st.kind] = true;
  for (const k of ['crank', 'crowbar', 'pistol', 'note', 'card', 'fuel', 'open', 'locker', 'switch', 'tool', 'flare']) assert.ok(tap[k], `${k} 点一下`);
  for (const k of ['shutter', 'rescue', 'pry', 'gen', 'holdout', 'escort', 'sneak']) assert.ok(hold[k] && !tap[k], `${k} 按住`);
  for (const type of Object.keys(GATES)) assert.equal(tapStage({ kind: 'gate', type }), type === 'lock', `关卡 ${type}`);
  // 零点突围：取回箱子点一下；切中继、拆炸弹按住；丧尸围城自己标过的照旧
  const sites = roomSites(L, nav);
  for (const type of MISSION_TYPES) for (const o of rollMission(seq(11), sites, { type }).objectives) assert.equal(tapObjective(o), o.kind === 'item', `${type} / ${o.kind}`);
  assert.equal(tapObjective({ kind: 'relay', tap: true }), true); assert.equal(tapObjective({ kind: 'item', tap: false }), false);
  assert.equal(promptVerb(true), '按 E'); assert.equal(promptVerb(false, '交互'), '按住 交互'); assert.equal(shortName('撬棍 · 三层 云澜影城'), '撬棍');
});

test('原游戏补丁：o.tap 的目标按下那一下就完成（pressed、一下加满进度）、提示写「按」、不画进度圈；别的照旧按住 cutSeconds 秒', () => {
  const code = readFileSync('src/jimao/vendor/game.js', 'utf8');
  for (const [why, , to] of PATCHES.filter(([w]) => /点一下/.test(w))) assert.equal(code.split(escapeLikeEsbuild(to)).length - 1, 1, why);
  assert.ok(code.includes('L === V && (L.o.tap ? r.pressed("interact") : r.down("interact"))'));
  assert.ok(code.includes('L.t += L.o.tap ? 1 : P / Yi.cutSeconds'));
  assert.ok(code.includes('Fo(V.t), !!V.o.tap)'));
  assert.ok(code.includes('m.classList.toggle("tap", !!tp)'));
});

test('拿到手的小动作：点一下的目标完成时，那件东西复制一份飞到镜头前缩没（不新建几何、材质），枪往下沉一下再抬回来，提示「拿到 · 撬棍」；按住的目标不做', async () => {
  const THREE = await import('three');
  const handlers = {}, lowered = [], sounds = [];
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.6, 0); scene.add(camera);
  const mk = (id, tap, stageKind) => { const g = new THREE.Group(), item = new THREE.Group(); item.userData.cutHide = true; const geo = new THREE.BoxGeometry(0.3, 0.05, 0.05), mat = new THREE.MeshStandardMaterial(); item.add(new THREE.Mesh(geo, mat)); g.add(item); g.position.set(2, 0.7, -1); scene.add(g); return { id, label: '撬棍 · 三层 云澜影城', tap, stageKind, kind: 'item', object: g, geo, mat }; };
  const a = mk('crowbar', true, 'crowbar'), b = mk('pry', false, 'pry');
  const G = { events: { on: (n, f) => { handlers[n] = f; }, off() {} }, game: { run: { relays: [{ id: 'crowbar', o: a }, { id: 'pry', o: b }] } }, arms: { setLowered: (k) => lowered.push(k) }, audio: { play: (n) => sounds.push(n) } };
  const fx = createPickupFx(G, { scene, camera });
  const n0 = scene.children.length;
  handlers['objective:done']({ id: 'pry' }); assert.equal(fx.active, 0, '按住的不飞'); assert.equal(sounds.length, 0);
  handlers['objective:done']({ id: 'crowbar' }); assert.equal(fx.active, 1); assert.equal(scene.children.length, n0 + 1); assert.equal(sounds.length, 1);
  let ghost = scene.children.at(-1), mesh = null; ghost.traverse((c) => { if (c.isMesh) mesh = c; });
  assert.equal(mesh.geometry, a.geo, '共用几何'); assert.equal(mesh.material, a.mat, '共用材质');
  const d0 = ghost.position.distanceTo(camera.position);
  fx.update(PICKUP.fly / 2); assert.ok(ghost.position.distanceTo(camera.position) < d0, '往镜头飞'); assert.ok(ghost.scale.x < 1, '在缩');
  assert.ok(Math.max(...lowered) > 0.2, '枪沉下去');
  fx.update(PICKUP.fly); fx.update(PICKUP.dip.t); assert.equal(fx.active, 0); assert.equal(scene.children.length, n0, '飞完拿掉'); assert.equal(lowered.at(-1), 0, '枪抬回来');
});

test('进模式时整页被关掉（iOS 内存超限）：下次打开记一次，内存档位降一档；两次以上用省内存档；正常进去玩稳了 / 离开就擦掉，不算', async () => {
  const { markBootStart, markBootDone, bootCrashes, memoryProfileFor, BOOT } = await import('../src/render/device.js');
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
  const st = mem();
  assert.deepEqual(markBootStart('jimao', st), { crashed: false, crashes: 0 }, '第一次进');
  markBootDone(st); assert.deepEqual(markBootStart('jimao', st), { crashed: false, crashes: 0 }, '上次进去玩稳了：不算');
  // 这次没擦掉就「死了」：下次打开算一次
  const a = markBootStart('jimao', st); assert.deepEqual(a, { crashed: true, crashes: 1 }); assert.equal(bootCrashes(st), 1);
  const b = markBootStart('jimao', st); assert.deepEqual(b, { crashed: true, crashes: 2 });
  // 降档：手机精细档本来是高清贴图，被关掉一次降到标准，两次省内存；电脑原始大小 → 标准
  assert.equal(memoryProfileFor('high', { mobile: true, lost: 0, ram: null }), 'rich');
  assert.equal(memoryProfileFor('high', { mobile: true, lost: a.crashes, ram: null }), 'standard');
  assert.equal(memoryProfileFor('high', { mobile: true, lost: b.crashes, ram: null }), 'compact');
  assert.equal(memoryProfileFor('auto', { mobile: false, lost: 1, ram: null }), 'standard');
  // 7 天以前的不算
  st.setItem(BOOT.crash, String(Date.now() - (BOOT.days + 1) * 864e5)); assert.equal(bootCrashes(st), 0);
  // 存不了（隐私模式）也不出错
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.deepEqual(markBootStart('jimao', bad), { crashed: false, crashes: 0 }); markBootDone(bad);
});

test('内存小的电脑（navigator.deviceMemory）：≤ 2 GB 省内存档、≤ 4 GB 标准档（精细 / 极致用高清贴图）；不知道的（Safari）照旧原始大小；手机的默认（自动 / 流畅）一律省内存档', async () => {
  const { memoryProfileFor } = await import('../src/render/device.js');
  const f = (tier, ram, mobile = false) => memoryProfileFor(tier, { mobile, lost: 0, ram });
  assert.deepEqual(['auto', 'low', 'high', 'ultra'].map((t) => f(t, 2)), ['compact', 'compact', 'compact', 'compact']);
  assert.deepEqual(['auto', 'low', 'balanced', 'high', 'ultra'].map((t) => f(t, 4)), ['standard', 'standard', 'standard', 'rich', 'rich']);
  assert.deepEqual(['auto', 'high'].map((t) => f(t, 8)), ['full', 'full']); assert.equal(f('auto', null), 'full');
  assert.deepEqual(['auto', 'low'].map((t) => f(t, null, true)), ['compact', 'compact'], '手机没调过画质：省内存档进');
});

test('手机 / 平板进零点突围、丧尸围城：加载时不再把所有贴图一口气传上显卡（预热只编着色器）；进去以后「站稳」才擦掉「正在进入」', () => {
  const run = readFileSync('src/jimao/run.js', 'utf8'), rt = readFileSync('src/runtime.js', 'utf8');
  assert.match(run, /if \(!MEM\.lite\) for \(const tex of textures\) \{ try \{ renderer\.initTexture\(tex\)/);
  assert.match(rt, /const boot=markBootStart\(mode\)/); assert.match(rt, /settleBoot\(mode,boot,window\.__memory\.profile\)/);
});

test('商场段的小物件不再是纯色方块：按材质合并（每件两三次绘制）、用的是共用图集的分区（漆面、金属、钢门压纹、警示）；拿走的部分（item）和做完才亮的灯（on）各自分开', async () => {
  const { mallModel } = await import('../src/jimao/siege.js');
  const { mallPropParts, propStats } = await import('../src/jimao/siege-props.js');
  for (const k of ['crank', 'note', 'fuel', 'gen', 'shutter', 'open', 'pry', 'rescue', 'holdout']) {
    const g = mallModel(k), P = mallPropParts(k), s = propStats(g);
    assert.ok(P.item && Object.keys(P.item).length, `${k}：有能拿走 / 用掉的部分`);
    assert.ok(s.draws <= 8, `${k}：${s.draws} 次绘制`);
    let item = null; g.traverse((o) => { if (o.userData.cutHide && !item) item = o; }); assert.ok(item && item.children.length, `${k}：item 组里有网格`);
    // 同一种物件第二次建：几何体共用（不随一局一局地漏显存）
    const g2 = mallModel(k), geoms = (x) => { const a = []; x.traverse((o) => o.isMesh && a.push(o.geometry)); return a; };
    assert.ok(geoms(g2).every((q) => geoms(g).includes(q) || q.type === 'CylinderGeometry'), `${k}：几何体共用`);
  }
  const lk = mallModel('card', null, { mall: { lockers: [{ x: 0, z: 0, n: 1 }, { x: 1.25, z: 0, n: 2, right: true }, { x: 2.5, z: 0, n: 3 }] } });
  assert.equal(lk.userData.lockers.length, 3); assert.equal(lk.userData.lockers.filter((q) => q.door.userData.cutHide).length, 1, '只有对的那个拿了卡柜门开着');
});

test('绿植叶团、花球不再是一块块平面的「宝石」：绿植批次用球心放射的圆法线（顶点数不变），材质去掉 flatShading，片元按世界坐标叠叶簇噪声；省内存档不做凹凸；克隆出来的材质也带着', async () => {
  const THREE = await import('three');
  const { tpl, SOFT_TEMPLATES, BatchSet } = await import('../src/render/batch.js');
  const { leafDetail, LEAF } = await import('../src/render/materials.js');
  for (const name of SOFT_TEMPLATES) {
    const t = tpl(name); assert.ok(t.soft && t.soft.count === t.count && t.soft.pos === t.pos, `${name}：同一份顶点`);
    for (let i = 0; i < t.count; i++) { const [x, y, z] = [0, 1, 2].map((k) => t.pos[i * 3 + k]), [a, b, c] = [0, 1, 2].map((k) => t.soft.nor[i * 3 + k]), r = Math.hypot(x, y, z);
      assert.ok(Math.abs(a * x + b * y + c * z - r) < 1e-4, `${name} 第 ${i} 个法线朝外`); }
  }
  // 绿植批次：叶团每个顶点的法线都从球心朝外（圆的）；别的批次照旧是平的
  const set = new BatchSet({ foliage: new THREE.MeshStandardMaterial(), matte: new THREE.MeshStandardMaterial() });
  set.get('foliage').sphere(3, 1, -2, 0.5, '#5f9447', 0.5, 0.5, 'ico0'); set.get('matte').sphere(3, 1, -2, 0.5, '#5f9447', 0.5, 0.5, 'ico0');
  const radial = (b) => { let ok = 0; for (let i = 0; i < b.n; i++) { const p = [0, 1, 2].map((k) => b.pos[i * 3 + k] - [3, 1, -2][k]), n = [0, 1, 2].map((k) => b.nor[i * 3 + k] / 127), r = Math.hypot(...p); if (Math.abs((p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) / r - 1) < 0.02) ok++; } return ok / b.n; };
  assert.ok(radial(set.sets.foliage) > 0.99); assert.ok(radial(set.sets.matte) < 0.5);
  // 材质：着色器补丁接得上 three 自带的标准材质着色器
  for (const bump of [true, false]) {
    const m = leafDetail(new THREE.MeshStandardMaterial({ flatShading: true, vertexColors: true }), bump);
    assert.equal(m.flatShading, false); assert.equal(m.customProgramCacheKey(), `leaf-${bump ? 'b' : 'c'}`);
    const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    m.onBeforeCompile(sh);
    assert.match(sh.vertexShader, /vLeafPos = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;/);
    assert.match(sh.fragmentShader, /float leafNoise\(vec3 x\)/); assert.match(sh.fragmentShader, new RegExp(`leafQ \\* ${LEAF.cluster.toFixed(3)}`));
    assert.equal(/dFdx\(h\)/.test(sh.fragmentShader), bump, '凹凸只在非省内存档');
    assert.ok(!/[^\x00-\x7f]/.test(sh.fragmentShader), '着色器里不夹中文');
    const c = m.clone(); assert.equal(c.customProgramCacheKey(), m.customProgramCacheKey()); assert.equal(c.flatShading, false);
  }
});
