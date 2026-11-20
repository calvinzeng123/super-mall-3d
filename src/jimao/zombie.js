// 「丧尸围城」的丧尸。和武装劫持者（soldier.js）一样登记进原游戏的敌人模块（ctx.pools.zombie），
// 所以开枪命中、击倒播报、得分、弹药掉落、小地图红点都走现成的；不同的是它们不开枪、不躲、不用原游戏的侦察逻辑：
//   没发现人时原地晃或慢慢游荡；看见、听见（枪声、拉闸、尖叫）就直直地扑过来，贴身以后抡一下再咬。
// 四种：
//   walker 行尸：慢、量大；
//   runner 奔尸：跑得比人走路快，血薄，专门打乱站位；
//   bloater 胖尸：血厚、慢，倒下的时候炸开（3.6 米内掉血，也炸别的丧尸）；
//   screamer 尖叫者：不上来咬，隔着八九米尖叫——叫一声招来一波（siege.js 接 zombie:scream），直升机在天上时对着飞机叫，掉机体耐久。
// 模型比真人敌人省：躯干 + 头一个网格、两条胳膊、两条腿，一只 5 个网格；同屏三十多只。
// 对原游戏来说它们的 type 还是 'soldier'（脚步声、倒地声、命中粗筛都按真人走），另有 zombie: true 和 kind。
import * as THREE from 'three';
import { merge, hitSphere, hitCapsule } from './soldier.js';

// 丧尸的模型用便宜的几何体（直角方块、8 段的球、6 棱的圆柱）：一只两千来个顶点，三十多只加起来才顶得上三四个真人敌人
const UP = new THREE.Vector3(0, 1, 0);
function colored(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const rbox = (w, h, d, x, y, z, hex, r = 0, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return colored(g, hex); };
const ball = (r, x, y, z, hex, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 8, 6); g.scale(sx, sy, sz); g.translate(x, y, z); return colored(g, hex); };
function capsule(a, b, r0, r1, hex) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length(), g = new THREE.CylinderGeometry(r1, r0, len, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return [colored(g, hex)];
}

export const ZOMBIE = Object.freeze({
  hp: 60, speed: 1.3, bite: 14, reach: 1.3, windup: 0.42, cooldown: 0.95,
  sense: 15, senseBlind: 5.5, hear: 36, lose: 30, loseSeconds: 9,
  accel: 6, turnRate: 3.4, corpseSeconds: 6, pool: 34, replan: [1.4, 2.6], direct: 7,
  farUpdate: 34, // 离人这么远以外的，隔帧才动一次（省 CPU）
});
export const KINDS = Object.freeze({
  walker: Object.freeze({ name: '行尸', weight: 0.68 }),
  runner: Object.freeze({ name: '奔尸', weight: 0.16, speed: 4.7, hp: 36, bite: 10, windup: 0.26, cooldown: 0.7, scale: 0.96, lean: 0.4 }),
  bloater: Object.freeze({ name: '胖尸', weight: 0.09, speed: 0.95, hp: 190, bite: 22, windup: 0.6, scale: 1.2, girth: 1.45, burst: Object.freeze({ radius: 3.6, damage: 34 }) }),
  screamer: Object.freeze({ name: '尖叫者', weight: 0.07, speed: 1.7, hp: 48, bite: 0, keep: 8.5, scream: Object.freeze({ every: 6.5, first: 1.6, range: 26, heli: 3, heliEvery: 8, heliFirst: 5 }), scale: 1.02 }),
  // 下面三种不参加平时的随机抽取（weight 0），由节奏器（pacing.js）点名放：
  // 扑袭者：远远蹲下、一个飞扑把人按住撕咬——被按住走不了，打死它或它咬够了才松开；飞扑能侧身躲开
  lunger: Object.freeze({ name: '扑袭者', weight: 0, speed: 5, hp: 70, bite: 7, windup: 0.22, cooldown: 0.55, scale: 0.98, lean: 0.5, look: 'lunger',
    pounce: Object.freeze({ min: 3.6, max: 11, crouch: 0.65, speed: 13.5, time: 0.85, hit: 1.25, damage: 16, pin: 5, every: 5.5 }) }),
  // 喷酸者：不近身，隔着十来米往人脚下吐一口酸——落地成一滩，站在里面持续掉血，逼人挪窝
  spitter: Object.freeze({ name: '喷酸者', weight: 0, speed: 2.3, hp: 60, bite: 8, keep: 12, scale: 1.04, look: 'spitter',
    spit: Object.freeze({ every: 5.2, first: 2.2, range: 22, flight: 0.8, radius: 2.7, seconds: 6.5, dps: 9 }) }),
  // 巨尸：又高又壮的头目，血极厚、打不出硬直，一巴掌把人拍飞；慢跑的速度比人走路快、比人冲刺慢
  brute: Object.freeze({ name: '巨尸', weight: 0, speed: 4.3, hp: 1300, bite: 32, reach: 1.95, windup: 0.5, cooldown: 1.15, scale: 1.4, girth: 1.38, look: 'brute', knock: 9, sturdy: true }),
});
/** 特殊感染者（节奏器按名额放的那几种） */
export const SPECIALS = Object.freeze(['bloater', 'screamer', 'lunger', 'spitter', 'brute']);
/** 贴图外形用哪一套特殊色调（zombie-skin.js）：尖叫者惨白，扑袭者、喷酸者、巨尸各有一套；普通的是 null */
const lookOf = (kind) => (kind === 'screamer' ? 'pale' : KINDS[kind]?.look || null);

/** 按比例抽一种。r ∈ [0, 1)；mix 可以改比例（{ runner: 0.3 } 这样） */
export function pickKind(r, mix = null) {
  const names = Object.keys(KINDS), w = names.map((n) => mix?.[n] ?? KINDS[n].weight), total = w.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < names.length; i++) { x -= w[i]; if (x < 0) return names[i]; }
  return 'walker';
}

// 衣服：四套日常穿着（商场里的顾客、店员、保安）；皮肤灰绿
const LOOKS = [
  { shirt: 0x5c6b7a, pants: 0x2f3440, shoe: 0x1c1c1e, hair: 0x1d1a17 },
  { shirt: 0x8a3b34, pants: 0x3a3a36, shoe: 0x2a2420, hair: 0x2b2118 },
  { shirt: 0xb9b3a4, pants: 0x30405a, shoe: 0x202024, hair: 0x4a3a2c },
  { shirt: 0x2d4a3a, pants: 0x24262a, shoe: 0x18181a, hair: 0x101010 },
];
const SKIN = 0x7d8a6f, SKIN_DARK = 0x5f6b55, BLOOD = 0x4a0f0d, MOUTH = 0x2a0606;
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const HIP = 0.94, LEG = 0.9, SHOULDER = 1.42, SKIN_CYCLES = 0.62; // SKIN_CYCLES：贴图外形每走一米，走路姿势转多少圈（和 zombie-skin.js 的 cyclesPerMetre 一致）
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (k, dt) => 1 - Math.exp(-k * dt);

/** 一套外观的几何体：{ body（髋为原点：骨盆、躯干、头）, arm（肩为原点，朝 +Z 平举）, leg（髋为原点，朝下） } */
/** 从原游戏的活动敌人列表里把 m 摘干净（有几份摘几份） */
export function unlist(list, m) { if (!list) return; for (let i = list.length - 1; i >= 0; i--) if (list[i] === m) list.splice(i, 1); }

export function zombieParts(look, { girth = 1, screamer = false } = {}) {
  const L = look, g = girth;
  const body = merge([
    rbox(0.33 * g, 0.2, 0.22 * g, 0, 0, 0, L.pants, 0.06),
    rbox(0.37 * g, 0.5, 0.23 * g, 0, 0.3, 0.02, L.shirt, 0.08, 0.16),          // 躯干前倾
    rbox(0.2 * g, 0.16, 0.02, 0.05, 0.34, 0.15 * g, BLOOD, 0.01, 0.16),         // 胸口的血迹
    rbox(0.09, 0.1, 0.02, -0.1, 0.16, 0.14 * g, BLOOD, 0.01, 0.16),
    capsule(v(0, 0.52, 0.07), v(0, 0.6, 0.1), 0.055, 0.05, SKIN_DARK),          // 脖子
    ball(0.115, 0, 0.71, 0.13, SKIN, 0.92, 1.08, 1),                            // 头（往前探）
    ball(0.118, 0, 0.745, 0.105, L.hair, 0.94, 0.9, 0.98),                      // 头发
    rbox(0.07, screamer ? 0.085 : 0.03, 0.03, 0, screamer ? 0.635 : 0.655, 0.232, MOUTH, 0.012), // 嘴（尖叫者张得很大）
    ball(0.016, 0.042, 0.725, 0.232, 0xd8d2b0), ball(0.016, -0.042, 0.725, 0.232, 0xd8d2b0),      // 发白的眼睛
  ]);
  const arm = merge([
    capsule(v(0, 0, 0), v(0, -0.03, 0.3), 0.05, 0.043, L.shirt),
    capsule(v(0, -0.03, 0.3), v(0, -0.01, 0.56), 0.04, 0.034, SKIN),
    ball(0.045, 0, -0.01, 0.6, SKIN_DARK, 0.9, 0.6, 1.2),
  ]);
  const leg = merge([
    capsule(v(0, 0, 0), v(0, -0.44, 0.02), 0.085 * g, 0.066, L.pants),
    capsule(v(0, -0.44, 0.02), v(0, -0.83, 0), 0.062, 0.05, L.pants),
    rbox(0.09, 0.07, 0.24, 0, -0.875, 0.05, L.shoe, 0.03),
  ]);
  return { body, arm, leg };
}

/**
 * 建一池丧尸并登记进原游戏的敌人模块（G.enemies.spawn('zombie', pos, { kind, hunt })）。
 * 返回 { pool, alert(pos, radius)（这一点的响动：范围内的丧尸都扑过来）, alive(), dispose() }。
 * hunt: true 的丧尸认定了人，隔多远、隔几层都追（尸潮用）。
 */
export function addZombies(G, enemies, { count = ZOMBIE.pool, scene = G.scene } = {}) {
  const ctx = enemies.debug.ctx, rng = ctx.rng || Math.random;
  const group = new THREE.Group(); group.name = 'zombies'; scene?.add(group);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, name: 'zombie' });
  const sets = { normal: LOOKS.map((l) => zombieParts(l)), fat: LOOKS.map((l) => zombieParts(l, { girth: KINDS.bloater.girth })), scream: LOOKS.map((l) => zombieParts({ ...l, shirt: 0xcfcabb, hair: 0x8a8578 }, { screamer: true })) };
  const pool = [], planFrame = { n: -1 };
  for (let i = 0; i < count; i++) { const z = make(i); pool.push(z); group.add(z.rig.group); }
  ctx.pools = Object.assign(ctx.pools || {}, { zombie: pool });
  enemies.debug.zombies = pool;

  function make(index) {
    const root = new THREE.Group(); root.name = 'zombie-' + index; root.visible = false;
    const body = new THREE.Group(); root.add(body);
    const hips = new THREE.Group(); hips.position.y = HIP; body.add(hips);
    const mk = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = false; return m; };
    const torso = mk(sets.normal[0].body); hips.add(torso);
    const arms = [0.21, -0.21].map((x) => { const a = mk(sets.normal[0].arm); a.position.set(x, SHOULDER - HIP, 0.06); hips.add(a); return a; });
    const legs = [0.09, -0.09].map((x) => { const l = mk(sets.normal[0].leg); l.position.set(x, -0.04, 0); hips.add(l); return l; });
    const vel = new THREE.Vector3(), want = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
    const headPos = new THREE.Vector3(), chest = new THREE.Vector3(), pelvis = new THREE.Vector3(), feet = new THREE.Vector3();
    let C = { ...ZOMBIE }, scale = 1, skin = null, lookI = index, walk = 0; // skin：贴图外形（zombie-skin.js），有了就不画方块人

    const m = {
      id: 0, type: 'soldier', zombie: true, kind: 'walker', name: '行尸', pos: root.position, alive: false, active: false, hp: ZOMBIE.hp, maxHp: ZOMBIE.hp, rig: { group: root },
      yaw: 0, speed: 0, home: new THREE.Vector3(), lastKnown: new THREE.Vector3(), lure: new THREE.Vector3(), goal: new THREE.Vector3(), sensor: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), muzzle: new THREE.Vector3(), headPos,
      mode: 'patrol', modeSeen: 'patrol', los: false, passive: false, hasToken: false, exposure: 0,
      zs: 'idle', zsT: 0, hunt: false, cool: 0, senseT: 0, loseT: 0, path: null, wp: 0, planT: 0, stuckT: 0, wanderT: 0, hasGoal: false, screamT: 0, target: null,
      gait: 0, phase: 0, swing: 0, lunge: 0, stagger: 0, dieT: 0, fall: 0, fallV: 0, fallSign: 1, sink: 0, skip: 0,

      damage(amount, point, dir, part, by = null) {
        if (!m.alive) return false;
        m.hp -= amount; m.by = by; // by：谁打的（'squad' = 队友；不记玩家的得分和连杀）
        G.events.emit('enemy:hit', { enemy: m, point, part: part || 'body' });
        if (point) G.fx?.smoke?.(point, { size: 0.18, life: 0.4, color: 0x3a0b0b, rise: 0.15 });
        if (!C.sturdy) m.stagger = Math.min(0.5, m.stagger + (part === 'weak' ? 0.4 : amount / 90));
        if (m.zs === 'idle' && !m.fixed) notice(G.player?.pos, true);
        if (m.hp <= 0) { die(dir, part); return true; }
        return false;
      },
      _activate(at, opts = {}) {
        const kind = KINDS[opts.kind] ? opts.kind : pickKind(rng(), opts.mix);
        const K = KINDS[kind];
        C = { ...ZOMBIE, ...K }; scale = K.scale || 1;
        m.kind = kind; m.name = K.name; m.feedName = K.name; m.maxHp = C.hp; m.hp = C.hp; m.role = kind;
        const look = Math.floor(rng() * LOOKS.length) % LOOKS.length, set = (kind === 'bloater' ? sets.fat : kind === 'screamer' ? sets.scream : sets.normal)[look];
        torso.geometry = set.body; for (const a of arms) a.geometry = set.arm; for (const l of legs) l.geometry = set.leg;
        arms[0].position.x = 0.21 * (K.girth || 1); arms[1].position.x = -0.21 * (K.girth || 1);
        root.scale.setScalar(scale);
        lookI = Math.floor(rng() * 97); walk = rng();
        if (skin) { skin.setLook(lookI, lookOf(kind)); skin.group.scale.set(K.girth || 1, 1, K.girth || 1); }
        m.special = SPECIALS.includes(kind); m.pounceT = K.pounce ? 0.25 + rng() * 0.45 : 0; m.spitT = K.spit ? K.spit.first + rng() : 0; m.pinT = 0; m.leap = null;
        m.active = true; m.alive = true; m.passive = !!opts.passive; m.sink = 0; m.hunt = !!opts.hunt; m.target = opts.targetPos || null;
        m.lureT = 0; m.pushT = 0;
        m.fixed = !!opts.fixed; m.sweep = null; m.bit = false; // fixed：钉在原地（阳台玻璃后面拍玻璃的那几只），不走、不追
        m.pos.copy(at);
        const g = G.physics.groundHeight?.(at.x, at.z, at.y + 1);
        if (g > -40 && Math.abs(g - at.y) < 1.2) m.pos.y = g;
        m.home.copy(m.pos); m.yaw = opts.yaw ?? rng() * Math.PI * 2; m.speed = 0; vel.set(0, 0, 0);
        m.zs = 'idle'; m.zsT = 0; m.mode = 'patrol'; m.modeSeen = 'patrol'; m.los = false; m.cool = 0.3 + rng() * 0.5; m.senseT = rng() * 0.3; m.loseT = 0;
        m.path = null; m.pathJob?.cancel?.(); m.pathJob = null; m.hasGoal = false; m.planT = 0; m.stuckT = 0; m.wanderT = 1 + rng() * 5;
        m.screamT = K.scream ? (G.missions?.rideKind === 'helicopter' ? K.scream.heliFirst : K.scream.first) + rng() : 0; // 对着飞机叫的第一声晚一点，给人找到它的时间
        m.gait = rng() * 6.28; m.phase = rng() * 6.28; m.swing = 0; m.lunge = 0; m.stagger = 0; m.dieT = 0; m.fall = 0; m.fallV = 0; m.skip = index % 2;
        body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
        root.visible = true;
        if (!m.fixed && (opts.state === 'alert' || m.hunt)) notice(opts.target || G.player?.pos, true);
        pose(0.016);
      },
      // 同时把自己从原游戏的活动列表里摘掉：原游戏只在 retire() 里摘，而 spawn() 每次都往列表里再放一遍——
      // 直接 _deactivate()（走远了回收、登机时清场）不摘的话，这只下次再用就在列表里有两份，一帧被更新两遍（越回收越快：走得快、咬得快、尖叫者一秒一声）。
      _deactivate() { m.active = false; m.alive = false; root.visible = false; m.pathJob?.cancel?.(); m.pathJob = null; ctx.releaseToken?.(m); unlist(ctx.list, m); },
      _raycast(o, d, maxDist, out) {
        let hit = false;
        if (hitSphere(o, d, headPos, 0.15 * scale, maxDist, out)) { out.part = 'weak'; out.enemy = m; hit = true; }
        if (hitCapsule(o, d, pelvis, chest, 0.23 * scale * (C.girth || 1), maxDist, out)) { out.part = 'body'; out.enemy = m; hit = true; }
        if (hitCapsule(o, d, pelvis, feet, 0.16 * scale, maxDist, out)) { out.part = 'body'; out.enemy = m; hit = true; }
        return hit;
      },
      _update(dt) {
        if (!m.active) return;
        if (!m.alive) { dead(dt); return; }
        // 离得远的隔帧才动一次（步长翻倍，走得一样快）
        const pl = G.player, far = pl ? Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z) > ZOMBIE.farUpdate : true;
        if (far && ((m.skip ^= 1) === 1)) return;
        live(far ? dt * 2 : dt);
      },
      /** 听到 / 看到动静：朝那边扑过去 */
      alert(at, hunt = false) { if (m.alive && !m.fixed) notice(at, hunt); },
      debugPose(fields = {}) { Object.assign(m, fields); if (fields.fall !== undefined) body.rotation.x = m.fall * m.fallSign; pose(0); },
    };

    function notice(at, hunt) {
      if (at) m.lastKnown.copy(at);
      if (hunt) m.hunt = true;
      if (m.zs === 'idle') { m.zs = 'chase'; m.zsT = 0; m.planT = 0; m.loseT = 0; m.mode = 'engage'; }
    }
    function plan(goal) {
      const st = G.physics.stateOf?.(m.pos);
      if (st && st.slope && m.path) { m.planT = 0.25; return; }
      if (planFrame.n === G.time?.frame) { m.planT = 0.04 + rng() * 0.08; return; }
      planFrame.n = G.time?.frame;
      m.planT = ZOMBIE.replan[0] + rng() * (ZOMBIE.replan[1] - ZOMBIE.replan[0]);
      m.pathJob?.cancel?.();
      const req = G.physics.nav?.requestPath;
      if (!req) { m.path = null; return; }
      m.pathJob = req(m.pos, goal, (path) => {
        m.pathJob = null;
        if (!m.active || !m.alive) return;
        m.path = path && path.length ? path : null; m.wp = 0;
        if (m.path) { let best = Infinity; for (let i = 0; i < Math.min(m.path.length, 6); i++) { const d = Math.hypot(m.path[i].x - m.pos.x, m.path[i].z - m.pos.z) + Math.abs(m.path[i].y - m.pos.y) * 2; if (d < best) { best = d; m.wp = i; } } }
      });
    }
    /** 朝 goal 走：近处、看得见就直着走，否则跟寻路的拐点 */
    function steer(dt, goal, speed, direct) {
      let tx = goal.x, tz = goal.z;
      if (!direct) {
        m.planT -= dt; if (m.planT <= 0) plan(goal);
        if (m.path) {
          while (m.wp < m.path.length - 1 && Math.hypot(m.path[m.wp].x - m.pos.x, m.path[m.wp].z - m.pos.z) < 0.6) m.wp++;
          const w = m.path[Math.min(m.wp, m.path.length - 1)]; tx = w.x; tz = w.z;
        }
      } else m.path = null;
      const ex = tx - m.pos.x, ez = tz - m.pos.z, el = Math.hypot(ex, ez) || 1;
      want.set(ex / el * speed, 0, ez / el * speed);
    }

    function live(dt) {
      if (m.fixed) { // 拍玻璃：原地一下一下抡
        m.mode = 'engage'; m.speed = 0; m.lunge = Math.max(0, Math.sin(m.phase * 3.2)) * 0.8; m.fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
        pose(dt); return;
      }
      const pl = G.player, alivePl = pl && pl.alive !== false;
      m.fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw)); m.sensor.copy(headPos);
      const dx = pl ? pl.pos.x - m.pos.x : 99, dz = pl ? pl.pos.z - m.pos.z : 99, dy = pl ? pl.pos.y - m.pos.y : 0, dist = Math.hypot(dx, dz);
      m.cool -= dt; m.stagger = Math.max(0, m.stagger - dt);
      want.set(0, 0, 0);
      let faceYaw = null;
      // 每 0.3 秒左右看一眼：近处直接察觉，稍远要看得见
      if ((m.senseT -= dt) <= 0) {
        m.senseT = 0.28 + rng() * 0.1;
        m.los = false;
        if (alivePl && Math.abs(dy) < 3.2 && dist < ZOMBIE.hear) {
          tmp.set(m.pos.x, m.pos.y + 1.5 * scale, m.pos.z); tmp2.set(pl.pos.x, pl.pos.y + 1.4, pl.pos.z);
          m.los = dist < 1.6 || !!G.physics.lineOfSight?.(tmp, tmp2);
        }
        if (m.zs === 'idle' && alivePl && !m.passive && Math.abs(dy) < 3.2 && (dist < ZOMBIE.senseBlind || (dist < ZOMBIE.sense && m.los))) notice(pl.pos, false);
      }
      const speed = C.speed * (m.stagger > 0 ? 0.35 : 1);
      // 直升机在飞：尖叫者不管人在哪一层，站住冲着飞机叫（120 米内），每叫一声掉机体耐久
      const heliAt = C.scream && G.missions?.rideKind === 'helicopter' ? G.missions.vehicleCenter?.() : null;
      if (m.lureT > 0 && (m.lureT -= dt) <= 0 && m.zs === 'idle') { m.home.copy(m.pos); m.hasGoal = false; }
      if (m.lureT > 0 && (m.zs === 'idle' || m.zs === 'chase')) {
        // 被诱饵弹引着：凑过去围着它抓挠，不看人
        m.mode = 'engage';
        const lx = m.lure.x - m.pos.x, lz = m.lure.z - m.pos.z, ld = Math.hypot(lx, lz);
        if (ld > 1.2) steer(dt, m.lure, speed, ld < ZOMBIE.direct && Math.abs(m.lure.y - m.pos.y) < 1.2);
        else { faceYaw = Math.atan2(lx, lz); m.lunge = Math.max(0, Math.sin(m.phase * 3.2)) * 0.6; }
        m.lastKnown.copy(m.lure); m.loseT = 0;
      } else if (heliAt && Math.hypot(heliAt.x - m.pos.x, heliAt.y - m.pos.y, heliAt.z - m.pos.z) < 120) {
        m.mode = 'engage'; faceYaw = Math.atan2(heliAt.x - m.pos.x, heliAt.z - m.pos.z);
        if (m.zs === 'scream') { if ((m.zsT += dt) > 1.1) m.zs = 'chase'; }
        else if ((m.screamT -= dt) <= 0) { m.screamT = C.scream.heliEvery * (0.85 + rng() * 0.3); m.zs = 'scream'; m.zsT = 0; scream(heliAt); }
      } else if (m.zs === 'idle') {
        m.mode = 'patrol';
        // 游荡：隔一阵挪两步
        if ((m.wanderT -= dt) <= 0) {
          m.wanderT = 3 + rng() * 6;
          const q = G.physics.nav?.randomPoint?.(m.home, 4);
          if (q && Math.abs(q.y - m.pos.y) < 0.6) { m.goal.copy(q); m.hasGoal = true; }
        }
        if (m.hasGoal) { if (Math.hypot(m.goal.x - m.pos.x, m.goal.z - m.pos.z) < 0.5) m.hasGoal = false; else steer(dt, m.goal, C.speed * 0.45, true); }
      } else if (m.zs === 'chase') {
        m.mode = 'engage'; m.zsT += dt;
        const near = alivePl && Math.abs(dy) < 3.2 && dist < ZOMBIE.lose;
        if (near && (m.los || dist < ZOMBIE.senseBlind)) { m.lastKnown.copy(pl.pos); m.loseT = 0; } else if (m.hunt && alivePl) m.lastKnown.copy(pl.pos); else m.loseT += dt;
        if (!alivePl || (!m.hunt && m.loseT > ZOMBIE.loseSeconds)) { m.zs = 'idle'; m.home.copy(m.pos); m.hasGoal = false; m.path = null; }
        else if (C.pounce && near && m.los && Math.abs(dy) < 1.4 && (m.pounceT -= dt) <= 0 && dist > C.pounce.min && dist < C.pounce.max) {
          // 扑袭者：够得着的距离上先蹲一下（有一声低吼，给人反应的时间），再扑
          m.zs = 'crouch'; m.zsT = 0; faceYaw = Math.atan2(dx, dz);
          G.events.emit('enemy:telegraph', { enemy: m, pos: m.pos, type: 'soldier', scream: true, pounce: true });
        } else if (C.spit && near && m.los) {
          // 喷酸者：隔着十来米站住吐；太近了往后退
          faceYaw = Math.atan2(dx, dz);
          if (dist > C.keep + 3) steer(dt, m.lastKnown, speed, dist < ZOMBIE.direct);
          else if (dist < C.keep - 4) want.set(-dx / (dist || 1) * speed, 0, -dz / (dist || 1) * speed);
          if ((m.spitT -= dt) <= 0 && dist < C.spit.range) {
            m.spitT = C.spit.every * (0.85 + rng() * 0.3); m.zs = 'scream'; m.zsT = 0.45; // 借尖叫的后仰姿势，短一点
            G.events.emit('zombie:spit', { enemy: m, from: headPos.clone(), to: new THREE.Vector3(pl.pos.x + (pl.vel?.x || 0) * 0.35, pl.pos.y, pl.pos.z + (pl.vel?.z || 0) * 0.35), ...C.spit });
          }
        }
        else if (C.scream && near && m.los) {
          // 尖叫者：凑到八九米就站住叫；太近了往后退
          faceYaw = Math.atan2(dx, dz);
          if (dist > C.keep + 2) steer(dt, m.lastKnown, speed, dist < ZOMBIE.direct);
          else if (dist < C.keep - 3) want.set(-dx / (dist || 1) * speed, 0, -dz / (dist || 1) * speed);
          if ((m.screamT -= dt) <= 0) { m.screamT = C.scream.every * (0.85 + rng() * 0.3); m.zs = 'scream'; m.zsT = 0; scream(pl.pos); }
        } else {
          const direct = m.los && dist < ZOMBIE.direct && Math.abs(dy) < 1.2;
          steer(dt, m.lastKnown, speed, direct);
          if (alivePl && C.bite > 0 && dist < C.reach * scale && Math.abs(dy) < 1.3 && m.cool <= 0) { m.zs = 'attack'; m.zsT = 0; G.events.emit('enemy:telegraph', { enemy: m, pos: m.pos, type: 'soldier', melee: true }); }
          if (dist < 2.2 && alivePl) faceYaw = Math.atan2(dx, dz);
        }
      } else if (m.zs === 'attack') {
        // 抡一下再咬：抡的时候还在往前凑，抡完够得着才算咬中
        m.zsT += dt; faceYaw = Math.atan2(dx, dz);
        const k = m.zsT / C.windup;
        m.lunge = k < 1 ? k : Math.max(0, 1 - (m.zsT - C.windup) / 0.25);
        if (k < 1 && dist > 0.75) want.set(dx / (dist || 1) * speed * 0.8, 0, dz / (dist || 1) * speed * 0.8);
        if (k >= 1 && m.zs === 'attack' && !m.bit) {
          m.bit = true;
          if (alivePl && dist < C.reach * scale + 0.4 && Math.abs(dy) < 1.4) {
            pl.damage?.(C.bite, m.pos); G.events.emit('enemy:melee', { enemy: m, pos: m.pos, zombie: true });
            if (C.knock && pl.vel) { pl.vel.x += dx / (dist || 1) * C.knock; pl.vel.z += dz / (dist || 1) * C.knock; pl.vel.y = Math.max(pl.vel.y || 0, 3.2); pl.addShake?.(0.6); G.events.emit('zombie:knock', { enemy: m }); }
          }
        }
        if (m.zsT >= C.windup + 0.25) { m.zs = 'chase'; m.cool = C.cooldown * (0.85 + rng() * 0.3); m.bit = false; m.lunge = 0; }
      } else if (m.zs === 'scream') {
        m.zsT += dt; faceYaw = Math.atan2(dx, dz);
        if (m.zsT > 1.1) m.zs = 'chase';
      } else if (m.zs === 'crouch') {
        // 蹲下蓄力：盯着人；到点朝人这一刻的位置（带一点提前量）扑出去
        m.zsT += dt; faceYaw = Math.atan2(dx, dz); m.lunge = -0.5;
        if (!alivePl) m.zs = 'chase';
        else if (m.zsT >= C.pounce.crouch) {
          const tx = pl.pos.x + (pl.vel?.x || 0) * 0.22 - m.pos.x, tz = pl.pos.z + (pl.vel?.z || 0) * 0.22 - m.pos.z, tl = Math.hypot(tx, tz) || 1;
          m.leap = { x: tx / tl, z: tz / tl }; m.zs = 'leap'; m.zsT = 0; m.yaw = Math.atan2(tx, tz);
        }
      } else if (m.zs === 'leap') {
        // 飞扑：直线冲出去，方向不再改（所以能躲）；碰到人就按住，扑空 / 撞墙就踉跄一下
        m.zsT += dt; m.lunge = 1; faceYaw = Math.atan2(m.leap.x, m.leap.z);
        vel.x = m.leap.x * C.pounce.speed; vel.z = m.leap.z * C.pounce.speed; want.set(vel.x, 0, vel.z); m.leaping = true;
        if (alivePl && dist < C.pounce.hit && Math.abs(dy) < 1.5) {
          m.zs = 'pin'; m.zsT = 0; m.pinT = 0; m.cool = 0.35; m.lunge = 0.6;
          pl.damage?.(C.pounce.damage, m.pos); pl.addShake?.(0.7);
          G.events.emit('zombie:pin', { enemy: m }); G.events.emit('enemy:melee', { enemy: m, pos: m.pos, zombie: true });
        } else if (m.zsT > C.pounce.time) { m.zs = 'chase'; m.stagger = 0.5; m.pounceT = C.pounce.every; m.lunge = 0; }
      } else if (m.zs === 'pin') {
        // 按住人撕咬：贴在人身前不动；人被按住走不了（siege.js 管），打死它、或它咬够了才松开
        m.pinT += dt; m.lunge = 0.6; faceYaw = Math.atan2(dx, dz);
        if (!alivePl || m.pinT > C.pounce.pin) { m.zs = 'chase'; m.stagger = 0.5; m.pounceT = C.pounce.every; m.lunge = 0; G.events.emit('zombie:unpin', { enemy: m }); }
        else {
          const fy = pl.yaw ?? 0; m.pos.set(pl.pos.x - Math.sin(fy) * 0.95, pl.pos.y, pl.pos.z - Math.cos(fy) * 0.95); vel.set(0, 0, 0); want.set(0, 0, 0); m.pinned = true;
          if (m.cool <= 0) { m.cool = C.cooldown; pl.damage?.(C.bite, m.pos); G.events.emit('enemy:melee', { enemy: m, pos: m.pos, zombie: true }); }
        }
      }

      // 互相让开（挤成一团但不叠在一起），不顶到人身上
      for (const o of ctx.list) {
        if (o === m || !o.active || !o.alive) continue;
        const ox = m.pos.x - o.pos.x, oz = m.pos.z - o.pos.z, d = Math.hypot(ox, oz), r = 0.62;
        if (d < r && d > 1e-3 && Math.abs(o.pos.y - m.pos.y) < 1.5) { want.x += ox / d * (r - d) * 4; want.z += oz / d * (r - d) * 4; }
      }
      if (pl && dist < 0.7 && dist > 1e-3) { want.x -= dx / dist * 2; want.z -= dz / dist * 2; }

      const k = ease(ZOMBIE.accel, dt);
      if (m.leaping) m.leaping = false; // 飞扑：速度是直接给的，不走加速
      else { vel.x += (want.x - vel.x) * k; vel.z += (want.z - vel.z) * k; }
      if (m.pushT > 0) { m.pushT -= dt; vel.x = m.pushX; vel.z = m.pushZ; faceYaw ??= m.yaw; } // 被推开的那一下：直接往后退，脸还朝着人
      vel.y = 0;
      const sp = Math.hypot(vel.x, vel.z);
      if (faceYaw === null && sp > 0.15) faceYaw = Math.atan2(vel.x, vel.z);
      if (faceYaw !== null) { const d = wrap(faceYaw - m.yaw); m.yaw = wrap(m.yaw + clamp(d, -ZOMBIE.turnRate * dt, ZOMBIE.turnRate * dt)); }
      if (m.pinned) { m.pinned = false; m.speed = 0; pose(dt); return; } // 按着人：位置已经贴到人身前了
      const res = G.physics.moveCapsule?.(m.pos, vel, dt, 0.28, 1.7) || null;
      if (!res) { m.pos.x += vel.x * dt; m.pos.z += vel.z * dt; }
      m.speed = Math.hypot(vel.x, vel.z);
      if (m.zs === 'leap' && res?.hitWall) { m.zs = 'chase'; m.stagger = 0.6; m.pounceT = C.pounce.every; m.lunge = 0; } // 扑到墙上
      if (res?.hitWall && want.lengthSq() > 0.3) { m.stuckT += dt; if (m.stuckT > 0.7) { m.stuckT = 0; m.planT = 0; m.path = null; } } else m.stuckT = Math.max(0, m.stuckT - dt);
      pose(dt);
    }

    function scream(at) {
      G.events.emit('zombie:scream', { enemy: m, pos: m.pos, target: at });
      G.events.emit('enemy:telegraph', { enemy: m, pos: m.pos, type: 'soldier', scream: true });
      // 直升机在飞：冲着飞机叫——借「敌人开火」这条路去掉机体耐久（missions.js 按弹道离机身多近算命中）
      const heli = G.missions?.rideKind === 'helicopter' ? G.missions.vehicleCenter?.() : null;
      if (heli) { tmp.copy(heli).sub(headPos).normalize(); G.events.emit('enemy:fire', { enemy: m, pos: headPos.clone(), dir: tmp.clone(), type: 'screamer', scream: true, hits: C.scream.heli }); }
    }

    function die(dir, part) {
      if (m.zs === 'pin') G.events.emit('zombie:unpin', { enemy: m });
      m.alive = false; m.dieT = 0; m.fall = 0; m.fallV = 0; m.pathJob?.cancel?.(); m.pathJob = null;
      const f = dir ? dir.x * Math.sin(m.yaw) + dir.z * Math.cos(m.yaw) : -1;
      m.fallSign = f > 0 ? 1 : -1;
      G.events.emit('enemy:killed', { enemy: m, pos: m.pos, type: 'soldier', part, zombie: true, kind: m.kind, by: m.by || null });
      if (C.burst) burst();
    }
    /** 胖尸炸开：范围内的人和别的丧尸都掉血（离得越近越多） */
    function burst() {
      const B = C.burst, at = tmp.set(m.pos.x, m.pos.y + 1, m.pos.z).clone();
      G.fx?.explosion?.(at, 0.9); G.fx?.smoke?.(at, { size: 1.6, life: 1.4, color: 0x3c4a1e, rise: 0.6 });
      G.events.emit('zombie:burst', { enemy: m, pos: at });
      const pl = G.player;
      if (pl && pl.alive !== false) { const d = Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z, pl.pos.y - m.pos.y); if (d < B.radius) { pl.damage?.(Math.round(B.damage * (1 - d / B.radius * 0.7)), m.pos); pl.addShake?.(0.5); } }
      for (const o of [...ctx.list]) { if (o === m || !o.alive || !o.active) continue; const d = Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z, o.pos.y - m.pos.y); if (d < B.radius) o.damage(B.damage * 1.6 * (1 - d / B.radius * 0.6), null, null, 'body'); }
    }
    function dead(dt) {
      m.dieT += dt;
      if (m.sink > 0) { m.sink += dt; body.position.y -= 0.2 * dt; if (m.sink > 2.2) ctx.retire?.(m); return; }
      if (m.fall < 1.45) { m.fallV += (3.5 + Math.sin(m.fall) * 14) * dt; m.fall = Math.min(1.45, m.fall + m.fallV * dt); if (m.fall >= 1.45) G.events.emit('enemy:step', { pos: m.pos, type: 'soldier', enemy: m, speed: 3 }); }
      body.rotation.x = m.fall * m.fallSign;
      m.speed = 0; pose(dt);
      if (m.dieT > ZOMBIE.corpseSeconds) m.sink = 1e-3;
    }

    function pose(dt) {
      const sp = m.speed, run = Math.min(1, sp / 4), before = Math.sin(m.gait);
      if (skin && m.alive) walk += sp * dt * SKIN_CYCLES;
      if (m.alive) { m.gait += dt * (1.6 + sp * 2.3); m.phase += dt; }
      if (m.alive && sp > 0.4 && Math.sign(Math.sin(m.gait)) !== Math.sign(before)) G.events.emit('enemy:step', { pos: m.pos, type: 'soldier', enemy: m, speed: sp });
      const sway = Math.sin(m.phase * 1.3) * 0.05, lean = (C.lean || 0.12) * (0.4 + run) + m.lunge * 0.35 - m.stagger * 0.6;
      root.rotation.y = m.yaw;
      hips.position.y = HIP - Math.abs(Math.cos(m.gait)) * 0.03 * Math.min(1, sp);
      hips.rotation.set(lean, 0, sway + Math.sin(m.gait) * 0.06 * Math.min(1, sp));
      // 胳膊：平时半举着晃，追人的时候往前伸，扑咬时两只一起抡下来；尖叫时张开往后仰
      const up = m.zs === 'idle' ? 0.9 : m.zs === 'scream' ? -0.5 : 0.12, sc = m.zs === 'scream' ? 1 : 0;
      for (let i = 0; i < 2; i++) {
        const s = i ? -1 : 1, a = arms[i];
        a.rotation.set(up + Math.sin(m.gait + i * 2.1) * 0.22 * (0.4 + Math.min(1, sp)) - m.lunge * 0.9 - lean, s * (0.12 + sc * 0.7), 0);
        const l = legs[i]; l.rotation.x = -Math.sin(m.gait + i * Math.PI) * Math.min(0.6, 0.18 + sp * 0.16) - lean * 0.7;
      }
      if (sc) hips.rotation.x = -0.25;
      // 贴图外形：整个人前倾 / 摇晃 / 扑咬时往前探，走路姿势按走过的路程转
      if (skin) skin.pose({ phase: walk, moving: m.alive ? Math.min(1, 0.25 + sp / 0.9) : 0.3, lean: sc ? -0.22 : lean * 0.8 + (m.zs === 'attack' ? 0.12 : 0), sway: sway * 1.4, lunge: m.lunge });
      // 命中用的几个点（不走矩阵，直接按朝向算）
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw), h = m.alive ? 1 : Math.max(0.12, Math.cos(m.fall)), fwd = (lean * 0.5 + 0.13 + (m.alive ? 0 : Math.sin(m.fall) * m.fallSign * 1.4)) * scale;
      headPos.set(m.pos.x + fx * fwd, m.pos.y + 1.66 * scale * h, m.pos.z + fz * fwd);
      chest.set(m.pos.x + fx * fwd * 0.6, m.pos.y + 1.36 * scale * h, m.pos.z + fz * fwd * 0.6);
      pelvis.set(m.pos.x, m.pos.y + HIP * scale * h, m.pos.z);
      feet.set(m.pos.x, m.pos.y + 0.08, m.pos.z);
      m.muzzle.copy(headPos);
    }
    /** 换上贴图外形（kit.create() 的返回值）；null = 换回方块人 */
    /** 被推了一把（近战键）：往 (dx, dz) 方向退一步、趔趄不到一秒，正要咬 / 正按着人的被打断；巨尸推不动，只顿一下 */
    m.shove = (dx, dz, power = 7) => {
      if (!m.alive || !m.active || m.fixed) return false;
      if (C.sturdy) { m.stagger = Math.max(m.stagger, 0.25); return false; }
      if (m.zs === 'pin') { m.pinned = false; m.pounceT = C.pounce.every; G.events.emit('zombie:unpin', { enemy: m }); }
      if (m.zs === 'attack' || m.zs === 'crouch' || m.zs === 'leap' || m.zs === 'pin') { m.zs = 'chase'; m.bit = false; m.lunge = 0; m.leaping = false; }
      m.stagger = Math.max(m.stagger, 0.9); m.cool = Math.max(m.cool, 0.9); m.pushT = 0.22; m.pushX = dx * power; m.pushZ = dz * power;
      return true;
    };
    /** 被响动引过去（诱饵弹）：seconds 秒内不管人，朝 at 凑；巨尸不吃这一套 */
    m.distract = (at, seconds = 1.2) => {
      if (!m.alive || !m.active || m.fixed || C.sturdy) return false;
      m.lure.copy(at); m.lureT = Math.max(m.lureT, seconds); return true;
    };
    m._skin = (sk) => {
      if (skin) skin.group.removeFromParent();
      skin = sk || null; hips.visible = !skin;
      if (skin) { body.add(skin.group); skin.setLook(lookI, lookOf(m.kind)); skin.group.scale.set(C.girth || 1, 1, C.girth || 1); pose(0); }
    };
    return m;
  }

  let kit = null;
  return {
    pool,
    /** 贴图外形加载好了：池子里每只都换上（方块人藏起来） */
    useSkin(k) { if (kit === k) return; kit = k; for (const z of pool) z._skin(k ? k.create() : null); },
    get skinned() { return !!kit; },
    alive: () => pool.filter((z) => z.active && z.alive),
    /** at 这一点有动静（枪声、拉闸、尖叫）：radius 米内同一层上下的丧尸都扑过来；hunt 表示认定了人，不会跟丢 */
    alert(at, radius, hunt = false) {
      let n = 0;
      for (const z of pool) if (z.active && z.alive && Math.abs(z.pos.y - at.y) < 7 && Math.hypot(z.pos.x - at.x, z.pos.z - at.z) < radius) { z.alert(at, hunt); n++; }
      return n;
    },
    dispose() { kit?.dispose?.(); kit = null; group.removeFromParent(); for (const set of Object.values(sets)) for (const p of set) { p.body.dispose(); p.arm.dispose(); p.leg.dispose(); } mat.dispose(); delete ctx.pools.zombie; },
  };
}
