// 「零点突围」的真人敌人：武装劫持者（type: 'soldier'）。
// 原游戏只有机械飞鸥和机械猎犬；这里按它敌人模块的同一套接口写第三种，登记进它的敌人池（ctx.pools.soldier），
// 所以发现玩家、互相呼叫、轮流开火（射击令牌）、听到枪声围过来、关卡的巡逻和三波敌人，全部走原游戏自己的逻辑。
// 这里只管人本身：身体（程序生成，几个部件各一个网格）、走跑蹲瞄的动作、找射击位置、开枪、中弹、倒地。
//
// 接口和原游戏的敌人一致：pos / alive / active / hp / mode / los / fwd / sensor / lastKnown / home …，
// _activate(pos, opts) / _deactivate() / _update(dt) / _raycast(o, d, maxDist, out) / damage(amount, point, dir, part)。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const SOLDIER = {
  hp: 80, heavyHp: 110, shotDamage: 5, burst: [3, 5], burstGap: 0.1, aimTime: 0.38, cooldown: [1.3, 2.4],
  walkSpeed: 1.5, stalkSpeed: 2.4, runSpeed: 4.2, accel: 9, turnRate: 4,
  rangeMin: 6, rangeMax: 22, spreadFar: 0.11, spreadNear: 0.04, react: 0.45,
  patrolRadius: 8, corpseSeconds: 10, pool: 12,
};

// ---- 外观 ----
// 两套装备：突击手（橄榄色作战服、狼棕背心）和重装（深灰作战服、黑色重型护甲、血厚）。
// 脸上是面罩，只露一条眼缝，戴深色护目镜（镜片有一点反光，交火时泛红，方便远处看出谁在打你）。
const LOOKS = [
  { shirt: 0x4a4f3e, pants: 0x434737, vest: 0x6b6247, strap: 0x55503b, pouch: 0x5d5740, helmet: 0x545a45, mask: 0x2b2c2e, glove: 0x2a2826, boot: 0x2b2722, pad: 0x3a3b35, heavy: false },
  { shirt: 0x3a3e45, pants: 0x34383e, vest: 0x22252a, strap: 0x2c3036, pouch: 0x30343a, helmet: 0x2a2d31, mask: 0x1f2022, glove: 0x1d1d1e, boot: 0x1a1a1a, pad: 0x26292d, heavy: true },
];
const GUN = 0x1e1f21, GUN2 = 0x34352f, SKIN = 0xa77b5f, STRAP = 0x1b1b1b;
const LENS_CALM = [0.22, 0.13, 0.04], LENS_HOT = [0.9, 0.08, 0.04];

const Y = new THREE.Vector3(0, 1, 0);
function colored(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const box = (w, h, d, x, y, z, hex, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return colored(g, hex); };
/** 圆角方块：衣服、背心、靴子都用它，边角不再是硬棱 */
const rbox = (w, h, d, x, y, z, hex, r = 0.04, rx = 0) => { const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999); if (rx) g.rotateX(rx); g.translate(x, y, z); return colored(g, hex); };
const ball = (r, x, y, z, hex, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 14, 10); g.scale(sx, sy, sz); g.translate(x, y, z); return colored(g, hex); };
function limb(a, b, r0, r1, hex, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return colored(g, hex);
}
/** 两头圆的肢体（关节处不露断面） */
const capsule = (a, b, r0, r1, hex) => [limb(a, b, r0, r1, hex), ball(r0, a.x, a.y, a.z, hex), ball(r1, b.x, b.y, b.z, hex)];
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const merge = (list) => { const g = mergeGeometries(list.flat().map((q) => (q.index ? q.toNonIndexed() : q))); g.computeBoundingSphere(); return g; };

// 尺寸：髋关节离地 0.98 m，头盔顶约 1.84 m；面朝 +Z，右手在 -X 一侧。
const HIP_Y = 0.98, THIGH = 0.44, SHIN = 0.42;
function buildParts(look) {
  const L = look;
  const pelvis = merge([
    rbox(0.34, 0.22, 0.23, 0, -0.01, 0, L.pants, 0.07),
    rbox(0.36, 0.055, 0.245, 0, 0.085, 0, STRAP, 0.02), // 腰带
    rbox(0.07, 0.09, 0.06, 0.15, 0.04, 0.09, L.pouch, 0.015), rbox(0.07, 0.09, 0.06, -0.16, 0.04, -0.06, L.pouch, 0.015),
    L.heavy ? rbox(0.18, 0.16, 0.04, 0, -0.07, 0.125, L.vest, 0.02) : [],
  ]);
  const torsoParts = [
    rbox(0.36, 0.44, 0.22, 0, 0.24, 0, L.shirt, 0.08),
    rbox(0.41, 0.33, 0.28, 0, 0.26, 0.005, L.vest, 0.045),
    // 背心肩带
    rbox(0.07, 0.05, 0.3, 0.12, 0.45, 0, L.strap, 0.02), rbox(0.07, 0.05, 0.3, -0.12, 0.45, 0, L.strap, 0.02),
    // 胸前三个弹匣包、侧面一个
    rbox(0.085, 0.12, 0.05, -0.105, 0.17, 0.16, L.pouch, 0.015), rbox(0.085, 0.12, 0.05, 0, 0.17, 0.16, L.pouch, 0.015), rbox(0.085, 0.12, 0.05, 0.105, 0.17, 0.16, L.pouch, 0.015),
    rbox(0.05, 0.13, 0.1, 0.215, 0.2, 0.02, L.pouch, 0.015),
    // 背后的水袋和电台、天线
    rbox(0.26, 0.3, 0.07, 0, 0.27, -0.17, L.pouch, 0.03), rbox(0.08, 0.16, 0.06, 0.1, 0.36, -0.215, STRAP, 0.015),
    limb(v(0.12, 0.42, -0.22), v(0.12, 0.66, -0.22), 0.007, 0.005, GUN, 5),
    limb(v(0, 0.44, 0), v(0, 0.53, 0.005), 0.068, 0.062, L.mask), // 脖子（围脖）
  ];
  if (L.heavy) torsoParts.push(rbox(0.45, 0.2, 0.31, 0, 0.16, 0.005, L.vest, 0.04), rbox(0.15, 0.06, 0.2, -0.235, 0.43, 0, L.vest, 0.02), rbox(0.15, 0.06, 0.2, 0.235, 0.43, 0, L.vest, 0.02), rbox(0.2, 0.08, 0.06, 0, 0.47, 0.13, L.vest, 0.02));
  const torso = merge(torsoParts);
  const helmetTop = new THREE.SphereGeometry(0.138, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2); helmetTop.scale(1, 0.95, 1.1); helmetTop.translate(0, 0.12, -0.005);
  const head = merge([
    ball(0.105, 0, 0.095, 0, L.mask, 0.98, 1.15, 1.05), // 头（面罩）
    box(0.13, 0.034, 0.03, 0, 0.108, 0.093, SKIN), // 眼缝露出的皮肤
    colored(helmetTop, L.helmet),
    limb(v(0, 0.118, -0.01), v(0, 0.135, -0.01), 0.146, 0.146, L.helmet, 16), // 帽檐
    rbox(0.03, 0.03, 0.16, -0.14, 0.15, 0, GUN, 0.008), rbox(0.03, 0.03, 0.16, 0.14, 0.15, 0, GUN, 0.008), // 两侧导轨
    rbox(0.05, 0.085, 0.085, -0.122, 0.08, -0.005, L.pad, 0.02), rbox(0.05, 0.085, 0.085, 0.122, 0.08, -0.005, L.pad, 0.02), // 耳罩
    rbox(0.045, 0.03, 0.03, 0, 0.215, 0.135, GUN, 0.008), // 夜视仪挂座
    box(0.22, 0.016, 0.02, 0, 0.11, 0.075, STRAP), // 护目镜带
  ]);
  // 护目镜（单独一个网格，用镜片材质）
  const lens = (x) => { const g = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14); g.rotateX(Math.PI / 2); g.scale(1.15, 0.8, 1); g.translate(x, 0.108, 0.104); return g; };
  const visor = mergeGeometries([lens(-0.037), lens(0.037)].map((g) => g.toNonIndexed()));
  // 双臂和步枪一起，绕肩线转（抬枪、压枪、后坐）
  const rs = v(-0.2, 0, 0), re = v(-0.25, -0.22, 0.07), rh = v(-0.1, -0.16, 0.19);
  const ls = v(0.2, 0, 0), le = v(0.17, -0.2, 0.24), lh = v(-0.07, -0.12, 0.42);
  const aim = merge([
    capsule(rs, re, 0.062, 0.05, L.shirt), capsule(re, rh, 0.05, 0.04, L.shirt), ball(0.046, rh.x, rh.y, rh.z, L.glove, 1, 0.9, 1.3),
    capsule(ls, le, 0.062, 0.05, L.shirt), capsule(le, lh, 0.05, 0.04, L.shirt), ball(0.046, lh.x, lh.y, lh.z, L.glove, 1, 0.9, 1.3),
    ball(0.055, re.x, re.y, re.z, L.pad), ball(0.055, le.x, le.y, le.z, L.pad), // 护肘
    ball(0.074, -0.2, -0.015, 0, L.shirt), ball(0.074, 0.2, -0.015, 0, L.shirt), // 肩
    rbox(0.055, 0.1, 0.4, -0.1, -0.1, 0.25, GUN, 0.012), // 机匣
    rbox(0.06, 0.075, 0.22, -0.1, -0.085, 0.47, GUN2, 0.015), // 护木
    limb(v(-0.1, -0.08, 0.57), v(-0.1, -0.08, 0.76), 0.013, 0.013, GUN, 8), // 枪管
    limb(v(-0.1, -0.08, 0.74), v(-0.1, -0.08, 0.8), 0.02, 0.02, GUN, 8), // 消焰器
    rbox(0.04, 0.16, 0.07, -0.1, -0.21, 0.21, GUN, 0.01, 0.2), // 弹匣
    rbox(0.045, 0.1, 0.06, -0.1, -0.19, 0.12, GUN, 0.01, -0.3), // 握把
    rbox(0.05, 0.11, 0.22, -0.1, -0.1, -0.02, GUN2, 0.02), // 枪托
    rbox(0.04, 0.05, 0.09, -0.1, -0.02, 0.26, GUN, 0.01), // 瞄具
    limb(v(-0.1, -0.135, 0.38), v(-0.1, -0.135, 0.5), 0.012, 0.012, STRAP, 5), // 枪带
  ]);
  const thigh = merge([capsule(v(0, 0, 0), v(0, -THIGH, 0), 0.098, 0.074, L.pants), rbox(0.05, 0.14, 0.13, 0.085, -0.2, 0.01, L.pouch, 0.015)]);
  const shin = merge([
    limb(v(0, 0, 0), v(0, -SHIN + 0.06, 0), 0.07, 0.055, L.pants),
    rbox(0.1, 0.11, 0.06, 0, -0.02, 0.06, L.pad, 0.025), // 护膝
    rbox(0.115, 0.13, 0.27, 0, -SHIN - 0.025, 0.04, L.boot, 0.035),
    box(0.12, 0.02, 0.28, 0, -SHIN - 0.085, 0.04, STRAP), // 鞋底
  ]);
  return { pelvis, torso, head, visor, aim, thigh, shin };
}

// ---- 射线和人体部件求交 ----
const _ab = new THREE.Vector3(), _ao = new THREE.Vector3(), _c = new THREE.Vector3();
function hitSphere(o, d, c, r, maxDist, out) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z, b = ox * d.x + oy * d.y + oz * d.z, q = ox * ox + oy * oy + oz * oz - r * r, h = b * b - q;
  if (h < 0) return false;
  const t = -b - Math.sqrt(h);
  if (t < 0 || t > maxDist || t >= out.dist) return false;
  out.dist = t; out.point.copy(o).addScaledVector(d, t); out.normal.copy(out.point).sub(c).normalize();
  return true;
}
/** 射线和胶囊（a—b，半径 r）：取射线上离线段最近的点附近的球近似，和原游戏的做法相同 */
function hitCapsule(o, d, a, b, r, maxDist, out) {
  _ab.subVectors(b, a); _ao.subVectors(o, a);
  const aa = _ab.dot(_ab), ad = _ab.dot(d), aao = _ab.dot(_ao), dao = d.dot(_ao), den = aa - ad * ad;
  let s = den > 1e-8 ? (aao - ad * dao) / den : 0; s = s < 0 ? 0 : s > 1 ? 1 : s;
  _c.copy(a).addScaledVector(_ab, s);
  return hitSphere(o, d, _c, r, maxDist, out);
}
const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (k, dt) => 1 - Math.exp(-k * dt);

/**
 * 建一池真人敌人并登记进原游戏的敌人模块。
 * enemies：J.createEnemies(G) 的返回值；patrolLines：可选的巡逻路线（每条是几个 {x,y,z}），出生点附近有路线就沿着走。
 */
export function addSoldiers(G, enemies, { count = SOLDIER.pool, patrolLines = [] } = {}) {
  const ctx = enemies.debug.ctx, rng = ctx.rng;
  const group = new THREE.Group(); group.name = 'soldiers'; G.scene.add(group);
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04, name: 'soldier' });
  const parts = LOOKS.map(buildParts);
  const laserGeo = new THREE.BoxGeometry(0.008, 0.008, 1); laserGeo.translate(0, 0, 0.5);
  const laserMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.25, 0.15), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pool = [], planFrame = { n: -1 };
  for (let i = 0; i < count; i++) {
    const s = makeSoldier(i, i % 3 === 2 ? 1 : 0);
    pool.push(s); group.add(s.rig.group);
  }
  ctx.pools = Object.assign(ctx.pools || {}, { soldier: pool });
  enemies.debug.soldiers = pool;

  function makeSoldier(index, lookIndex) {
    const look = LOOKS[lookIndex], P = parts[lookIndex];
    const mesh = (geo, mat = bodyMat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.12, metalness: 0.7, emissive: new THREE.Color(...LENS_CALM) });
    const root = new THREE.Group(); root.name = 'soldier-' + index; root.visible = false;
    const body = new THREE.Group(); root.add(body); // 倒地时绕脚下转
    const hips = new THREE.Group(); hips.position.y = HIP_Y; body.add(hips); hips.add(mesh(P.pelvis));
    const spine = new THREE.Group(); spine.position.y = 0.1; hips.add(spine); spine.add(mesh(P.torso));
    const head = new THREE.Group(); head.position.y = 0.5; spine.add(head); head.add(mesh(P.head));
    const visor = new THREE.Mesh(P.visor, lensMat); head.add(visor);
    const aim = new THREE.Group(); aim.position.set(0, 0.42, 0.02); spine.add(aim); aim.add(mesh(P.aim));
    const muzzle = new THREE.Object3D(); muzzle.position.set(-0.1, -0.08, 0.78); aim.add(muzzle);
    const laser = new THREE.Mesh(laserGeo, laserMat); laser.visible = false; laser.frustumCulled = false; group.add(laser);
    const legs = [0.092, -0.092].map((x) => {
      const thigh = new THREE.Group(); thigh.position.set(x, -0.07, 0); hips.add(thigh); thigh.add(mesh(P.thigh));
      const shin = new THREE.Group(); shin.position.y = -THIGH; thigh.add(shin); shin.add(mesh(P.shin));
      return { thigh, shin };
    });
    const vel = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), aimDir = new THREE.Vector3();
    const headPos = new THREE.Vector3(), chest = new THREE.Vector3(), pelvisPos = new THREE.Vector3(), kneeL = new THREE.Vector3(), kneeR = new THREE.Vector3(), footL = new THREE.Vector3(), footR = new THREE.Vector3();
    const maxHp = look.heavy ? SOLDIER.heavyHp : SOLDIER.hp;

    const m = {
      id: 0, type: 'soldier', heavy: look.heavy, pos: root.position, alive: false, active: false, hp: maxHp, rig: { group: root },
      yaw: 0, speed: 0, home: new THREE.Vector3(), lastKnown: new THREE.Vector3(), goal: new THREE.Vector3(), firePos: new THREE.Vector3(), firePlayer: new THREE.Vector3(),
      sensor: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), muzzle: new THREE.Vector3(), headPos,
      mode: 'patrol', modeSeen: 'patrol', los: false, seeT: 0, noSeeT: 0, senseT: 0, exposure: 0, modeT: 0, passive: false, hasToken: false,
      es: 'move', esT: 0, cool: 1, shots: 0, bursts: 0, path: null, wp: 0, planT: 0, hasGoal: false, waitT: 0, moveT: 0, stuckT: 0,
      patrolLine: null, patrolI: 0, planGoal: new THREE.Vector3(), gait: 0, crouch: 0, crouchWant: 0, lowReady: 1, pitch: 0, twist: 0, recoil: 0, recoilV: 0,
      flinchP: 0, flinchPV: 0, flinchR: 0, flinchRV: 0, scan: 0, phase: 0, dieT: 0, fall: 0, fallV: 0, fallSign: 1, fallRoll: 0, crumple: false, sink: 0,

      damage(amount, point, dir, part) {
        if (!m.alive) return false;
        m.hp -= amount;
        G.events.emit('enemy:hit', { enemy: m, point, part: part || 'body' });
        // 中弹一缩：被打的那一侧往后仰
        const k = Math.min(1.5, amount / 25);
        if (dir) {
          const fwdHit = dir.x * Math.sin(m.yaw) + dir.z * Math.cos(m.yaw), side = dir.x * Math.cos(m.yaw) - dir.z * Math.sin(m.yaw);
          m.flinchPV += fwdHit * 7 * k; m.flinchRV += side * 6 * k;
        }
        m.recoilV += 4 * k;
        if (point) G.fx.smoke(point, { size: 0.16, life: 0.35, color: 0x3a0b0b, rise: 0.2 });
        ctx.provoke(m);
        if (m.hp <= 0) { die(dir, part); return true; }
        return false;
      },
      _activate(at, opts = {}) {
        m.active = true; m.alive = true; m.hp = maxHp; m.passive = !!opts.passive; m.sink = 0;
        m.pos.copy(at);
        const g = G.physics.groundHeight(at.x, at.z, at.y + 1);
        if (g > -40 && Math.abs(g - at.y) < 1.2) m.pos.y = g;
        m.home.copy(m.pos); m.yaw = opts.yaw ?? rng() * Math.PI * 2; m.speed = 0; vel.set(0, 0, 0);
        m.mode = opts.state === 'alert' ? 'investigate' : 'patrol'; m.modeSeen = m.mode; m.modeT = 10;
        m.lastKnown.copy(opts.target || (G.player ? G.player.pos : at));
        m.los = false; m.seeT = m.noSeeT = 0; m.exposure = 0; m.senseT = rng() * 0.2; m.hasToken = false;
        m.es = 'move'; m.cool = 0.5 + rng(); m.path = null; m.hasGoal = false; m.waitT = rng() * 1.5; m.planT = 0;
        m.crouch = m.crouchWant = 0; m.lowReady = m.mode === 'patrol' ? 1 : 0.3; m.pitch = 0; m.twist = 0;
        m.recoil = m.recoilV = m.flinchP = m.flinchPV = m.flinchR = m.flinchRV = 0;
        m.dieT = 0; m.fall = m.fallV = 0; m.crumple = false; m.phase = rng() * 6.28; m.gait = rng() * 6.28;
        // 出生点附近有现成的巡逻路线就沿着走，没有就在出生点附近转
        m.patrolLine = null;
        let best = 14;
        for (const line of patrolLines) for (const p of line) {
          const d = Math.hypot(p.x - at.x, p.z - at.z);
          if (d < best && Math.abs((p.y ?? 0) - m.pos.y) < 1.5) { best = d; m.patrolLine = line; m.patrolI = line.indexOf(p); }
        }
        lensMat.emissive.setRGB(...LENS_CALM); laser.visible = false;
        body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
        root.visible = true; pose(0.016);
      },
      _deactivate() {
        m.active = false; m.alive = false; root.visible = false; laser.visible = false; ctx.releaseToken(m);
      },
      _raycast(o, d, maxDist, out) {
        let hit = false;
        if (hitSphere(o, d, headPos, 0.14, maxDist, out)) { out.part = 'weak'; out.enemy = m; hit = true; }
        if (hitCapsule(o, d, pelvisPos, chest, 0.21, maxDist, out)) { out.part = 'body'; out.enemy = m; hit = true; }
        if (hitCapsule(o, d, pelvisPos, kneeL, 0.11, maxDist, out) || hitCapsule(o, d, kneeL, footL, 0.09, maxDist, out)) { out.part = 'body'; out.enemy = m; hit = true; }
        if (hitCapsule(o, d, pelvisPos, kneeR, 0.11, maxDist, out) || hitCapsule(o, d, kneeR, footR, 0.09, maxDist, out)) { out.part = 'body'; out.enemy = m; hit = true; }
        return hit;
      },
      _update(dt) { if (!m.active) return; if (m.alive) live(dt); else dead(dt); },
      /** 调试/截图用：直接摆一个姿势（不走 AI） */
      debugPose(fields = {}) { Object.assign(m, fields); if (fields.fall !== undefined) { body.rotation.x = m.fall * m.fallSign; } pose(0); },
    };

    // ---- 寻路 ----
    // 找路比较贵（跨楼层的路要在几层楼面上搜），所以只在目标真的变了、被卡住、或者隔几秒才重算，并且所有人一帧最多算一次
    function setGoal(p, force) {
      if (!force && m.hasGoal && m.goal.distanceToSquared(p) < 0.25) return;
      m.goal.copy(p); m.hasGoal = true; m.stuckT = 0;
      if (force || !m.path || m.planGoal.distanceToSquared(p) > 2.25) m.planT = 0;
    }
    function plan() {
      // 在楼梯、扶梯上不重新找路：从坡道中间算出来的路会先回到坡脚，人就在楼梯上来回走。等走完这一段再算
      const st = G.physics.stateOf(m.pos);
      if (st && st.slope && m.path) { m.planT = 0.25; return; }
      if (planFrame.n === G.time.frame) { m.planT = 0.03 + rng() * 0.05; return; }
      planFrame.n = G.time.frame;
      m.planT = 3.5 + rng() * 1.5; m.planGoal.copy(m.goal);
      let path = null;
      try { path = G.physics.nav.findPath(m.pos, m.goal); } catch { path = null; }
      m.path = path && path.length ? path : null; m.wp = 0;
      if (m.path && m.path.length > 1 && Math.hypot(m.path[0].x - m.pos.x, m.path[0].z - m.pos.z) < 0.6) m.wp = 1;
    }
    /** 朝目标走；到了返回 true。want 写进期望的水平速度 */
    function follow(dt, speed, want) {
      if (!m.hasGoal) return true;
      m.planT -= dt; if (m.planT <= 0) plan();
      const dx = m.goal.x - m.pos.x, dz = m.goal.z - m.pos.z, dist = Math.hypot(dx, dz);
      if (dist < 0.5 && Math.abs(m.goal.y - m.pos.y) < 1.2) { m.hasGoal = false; return true; }
      let tx = m.goal.x, tz = m.goal.z;
      if (m.path) {
        while (m.wp < m.path.length - 1 && Math.hypot(m.path[m.wp].x - m.pos.x, m.path[m.wp].z - m.pos.z) < 0.6) m.wp++;
        const w = m.path[Math.min(m.wp, m.path.length - 1)]; tx = w.x; tz = w.z;
      }
      const ex = tx - m.pos.x, ez = tz - m.pos.z, el = Math.hypot(ex, ez) || 1;
      const s = Math.min(speed, 0.5 + dist * 1.8);
      want.set(ex / el * s, 0, ez / el * s);
      return false;
    }
    /** 找一个射击位置：离玩家 6–22 米、看得见玩家、不和同伴挤在一起，优先掩体旁边 */
    function pickFirePos() {
      const pl = G.player; if (!pl) return;
      const eye = pl.eye || pl.pos;
      let best = Infinity;
      const tryPoint = (q, bonus) => {
        const r = Math.hypot(q.x - pl.pos.x, q.z - pl.pos.z);
        if (r < SOLDIER.rangeMin || r > SOLDIER.rangeMax) return;
        if (Math.abs(q.y - pl.pos.y) > 6) return;
        let score = Math.hypot(q.x - m.pos.x, q.z - m.pos.z) * 0.9 + bonus + rng() * 3;
        for (const o of ctx.list) {
          if (o === m || !o.alive || o.type !== 'soldier') continue;
          const f = o.es === 'move' ? o.firePos : o.pos;
          if (Math.hypot(q.x - f.x, q.z - f.z) < 3) score += 16;
        }
        if (score >= best) return;
        tmp2.set(q.x, q.y + 1.45, q.z);
        if (!G.physics.lineOfSight(tmp2, eye)) score += 22;
        if (score < best) { best = score; m.firePos.set(q.x, q.y, q.z); }
      };
      const cover = G.level && G.level.coverPoints;
      if (cover) for (const c of cover) tryPoint(c, -3);
      for (let k = 0; k < 6; k++) { const q = G.physics.nav.randomPoint(pl.pos, SOLDIER.rangeMax); if (q) tryPoint(q, 0); }
      const bearing = Math.atan2(m.pos.z - pl.pos.z, m.pos.x - pl.pos.x);
      for (let k = 0; k < 5; k++) {
        const a = bearing + (rng() - 0.5) * 2.6, r = SOLDIER.rangeMin + 1 + rng() * (SOLDIER.rangeMax - SOLDIER.rangeMin - 2);
        tmp.set(pl.pos.x + Math.cos(a) * r, 0, pl.pos.z + Math.sin(a) * r);
        tmp.y = G.physics.groundHeight(tmp.x, tmp.z, pl.pos.y + 1);
        if (Math.abs(tmp.y - pl.pos.y) < 0.8) tryPoint(tmp, 1);
      }
      if (best === Infinity) m.firePos.copy(m.pos);
      m.firePlayer.copy(pl.pos); setGoal(m.firePos, true);
      m.es = 'move'; m.esT = 0; m.moveT = 0; m.bursts = 0;
      // 远处一半的时候蹲着打
      m.crouchWant = Math.hypot(m.firePos.x - pl.pos.x, m.firePos.z - pl.pos.z) > 11 && rng() < 0.55 ? 1 : 0;
    }

    // ---- 活着 ----
    const want = new THREE.Vector3();
    function live(dt) {
      const pl = G.player;
      m.fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
      m.sensor.copy(headPos);
      ctx.think(m, dt, SOLDIER.react);
      if (m.mode !== m.modeSeen) {
        m.modeSeen = m.mode; m.hasGoal = false; m.path = null; m.waitT = 0;
        if (m.mode === 'engage') pickFirePos();
        else if (m.es === 'aim' || m.es === 'burst') { ctx.releaseToken(m); m.es = 'move'; }
      }
      m.cool -= dt;
      want.set(0, 0, 0);
      let faceYaw = null, aimAt = null, raise = 0.3, crouch = 0, laserOn = false, maxSpeed = SOLDIER.runSpeed;
      const toPl = pl ? Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z) : 1e9;

      if (m.mode === 'patrol') {
        raise = 1; maxSpeed = SOLDIER.walkSpeed;
        if (m.hasGoal) { if (follow(dt, SOLDIER.walkSpeed, want)) m.waitT = 1.5 + rng() * 3; }
        else {
          m.waitT -= dt; m.scan += dt;
          faceYaw = m.yaw + Math.sin(m.scan * 0.7 + m.phase) * 0.02;
          if (m.waitT <= 0) {
            if (m.patrolLine) { m.patrolI = (m.patrolI + 1) % m.patrolLine.length; const p = m.patrolLine[m.patrolI]; setGoal(tmp.set(p.x, p.y ?? m.pos.y, p.z), true); }
            else { const q = G.physics.nav.randomPoint(m.home, SOLDIER.patrolRadius); if (q && Math.abs(q.y - m.pos.y) < 0.6) setGoal(q, true); else m.waitT = 1; }
          }
        }
      } else if (m.mode === 'investigate' || m.mode === 'search') {
        raise = 0.15;
        const d = Math.hypot(m.lastKnown.x - m.pos.x, m.lastKnown.z - m.pos.z);
        if (d > 2.2) {
          setGoal(m.lastKnown); follow(dt, d < 8 ? SOLDIER.stalkSpeed : SOLDIER.runSpeed, want);
          // 我们的地图大、楼层多，原游戏 10 秒左右的「搜索」不够跑完一段楼梯；还在往那边赶的时候就不放弃
          if (m.speed > 1 && m.path) m.modeT = Math.max(m.modeT, 2);
        }
        else { m.hasGoal = false; m.scan += dt; faceYaw = m.yaw + Math.sin(m.scan * 0.9) * 0.05; }
      } else if (pl) {
        aimAt = pl.pos; raise = 0;
        const toYaw = Math.atan2(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z);
        switch (m.es) {
          case 'move': {
            m.moveT += dt;
            const arrived = follow(dt, SOLDIER.runSpeed, want), inRange = toPl > SOLDIER.rangeMin - 1 && toPl < SOLDIER.rangeMax + 2;
            if (arrived || (m.moveT > 1.2 && m.los && inRange && rng() < dt * 0.8) || m.moveT > 7) { m.es = 'aim'; m.esT = 0; m.hasGoal = false; }
            else if (pl.pos.distanceToSquared(m.firePlayer) > 49) pickFirePos();
            // 边跑边看着玩家（看得见的时候），跑的方向和身体朝向分开
            if (m.los) faceYaw = toYaw;
            break;
          }
          case 'aim': {
            faceYaw = toYaw; m.esT += dt; crouch = m.crouchWant;
            if (m.los) {
              if (toPl < SOLDIER.rangeMin - 3 && m.esT > 0.8) pickFirePos();
              else if (m.cool <= 0 && pl.alive !== false && Math.abs(wrapAngle(toYaw - m.yaw)) < 0.25 && ctx.requestToken(m)) { m.es = 'tele'; m.esT = SOLDIER.aimTime; }
            } else if (m.noSeeT > 1.2 || m.esT > 3.5) pickFirePos();
            break;
          }
          case 'tele': { // 举枪瞄准：激光指示（给玩家的提示，和原游戏机器敌人开火前的预警是一个意思）
            faceYaw = toYaw; crouch = m.crouchWant; laserOn = true; m.esT -= dt;
            if (m.esT <= 0) { m.es = 'burst'; m.shots = SOLDIER.burst[0] + Math.floor(rng() * (SOLDIER.burst[1] - SOLDIER.burst[0] + 1)); m.esT = 0; }
            break;
          }
          case 'burst': {
            faceYaw = toYaw; crouch = m.crouchWant; m.esT -= dt;
            if (m.esT <= 0) { m.esT = SOLDIER.burstGap * (0.85 + rng() * 0.3); m.shots--; fire(pl); }
            if (m.shots <= 0) {
              ctx.releaseToken(m); m.cool = SOLDIER.cooldown[0] + rng() * (SOLDIER.cooldown[1] - SOLDIER.cooldown[0]); m.bursts++;
              if (m.bursts >= 1 + (rng() < 0.5 ? 1 : 0)) pickFirePos(); else { m.es = 'aim'; m.esT = 0; }
            }
            break;
          }
        }
      }

      // 互相让开，也别贴到玩家身上
      for (const o of ctx.list) {
        if (o === m || !o.active || !o.alive) continue;
        const dx = m.pos.x - o.pos.x, dz = m.pos.z - o.pos.z, d = Math.hypot(dx, dz), r = o.type === 'soldier' ? 0.9 : 1.4;
        if (d < r && d > 1e-3 && Math.abs(o.pos.y - m.pos.y) < 1.5) { want.x += dx / d * (r - d) * 3; want.z += dz / d * (r - d) * 3; }
      }
      if (pl && toPl < 1.1 && toPl > 1e-3) { want.x += (m.pos.x - pl.pos.x) / toPl * 2; want.z += (m.pos.z - pl.pos.z) / toPl * 2; }
      if (crouch > 0.5) want.multiplyScalar(0.2);

      // 速度、朝向
      const k = ease(SOLDIER.accel, dt);
      vel.x += (want.x - vel.x) * k; vel.z += (want.z - vel.z) * k; vel.y = 0;
      const sp = Math.hypot(vel.x, vel.z);
      if (faceYaw === null && sp > 0.2) faceYaw = Math.atan2(vel.x, vel.z);
      if (faceYaw !== null) { const d = wrapAngle(faceYaw - m.yaw); m.yaw += clamp(d, -SOLDIER.turnRate * dt, SOLDIER.turnRate * dt) + d * ease(6, dt) * 0.3; m.yaw = wrapAngle(m.yaw); }
      // 走（在我们的导航网格上，和玩家同一套碰撞：墙、栏杆、楼梯、扶梯）
      const res = G.physics.moveCapsule(m.pos, vel, dt, 0.3, 1.8);
      m.speed = Math.hypot(vel.x, vel.z);
      if (res.hitWall && want.lengthSq() > 0.5) { m.stuckT += dt; if (m.stuckT > 0.6) { m.stuckT = 0; m.planT = 0; if (m.mode === 'engage' && m.es === 'move') pickFirePos(); else if (m.mode === 'patrol') m.hasGoal = false; } }
      else m.stuckT = Math.max(0, m.stuckT - dt);

      // 姿态
      m.crouch += (crouch - m.crouch) * ease(8, dt);
      m.lowReady += (raise - m.lowReady) * ease(6, dt);
      if (aimAt) {
        tmp.set(aimAt.x - m.pos.x, aimAt.y + 1.1 - (m.pos.y + HIP_Y + 0.52 - m.crouch * 0.4), aimAt.z - m.pos.z);
        m.pitch += (clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.9, 0.9) - m.pitch) * ease(10, dt);
        m.twist += (clamp(wrapAngle(Math.atan2(tmp.x, tmp.z) - m.yaw), -0.6, 0.6) - m.twist) * ease(10, dt);
      } else { m.pitch += (0 - m.pitch) * ease(4, dt); m.twist += (0 - m.twist) * ease(4, dt); }
      lensMat.emissive.setRGB(...(m.mode === 'engage' ? LENS_HOT : LENS_CALM));
      pose(dt);
      // 瞄准激光
      laser.visible = laserOn;
      if (laserOn) {
        aimDir.set(0, 0, 1).transformDirection(muzzle.matrixWorld);
        const h = G.physics.raycast(m.muzzle, aimDir, 40), len = h ? h.dist : 40;
        laser.position.copy(m.muzzle); laser.quaternion.setFromUnitVectors(tmp.set(0, 0, 1), aimDir); laser.scale.set(1, 1, len);
      }
    }

    function fire(pl) {
      tmp.set(pl.pos.x, pl.pos.y + (pl.crouching ? 0.8 : 1.15), pl.pos.z);
      aimDir.copy(tmp).sub(m.muzzle).normalize();
      const spread = (SOLDIER.spreadFar + (SOLDIER.spreadNear - SOLDIER.spreadFar) * m.exposure) * (1 + ctx.playerSpeed * 0.3) * (m.crouch > 0.5 ? 0.75 : 1);
      aimDir.x += (rng() - 0.5) * 2 * spread; aimDir.y += (rng() - 0.5) * 2 * spread; aimDir.z += (rng() - 0.5) * 2 * spread; aimDir.normalize();
      const wall = G.physics.raycast(m.muzzle, aimDir, 150);
      const hit = G.combat.enemyShot(m.muzzle, aimDir, { damage: SOLDIER.shotDamage, range: 150 });
      const len = hit ? m.muzzle.distanceTo(tmp) : wall ? wall.dist : 90;
      tmp2.copy(m.muzzle).addScaledVector(aimDir, len);
      G.fx.tracer(m.muzzle, tmp2, { color: 0xffc880, speed: 280, width: 0.03 });
      G.fx.muzzleFlash(m.muzzle, aimDir, { scale: 0.7 });
      G.render?.lightPool?.flash(m.muzzle, 0xffb070, 20, 7, 0.05);
      G.events.emit('enemy:fire', { enemy: m, pos: m.muzzle, dir: aimDir, type: 'soldier' });
      m.recoilV += 9;
    }

    // ---- 倒地 ----
    function die(dir, part) {
      m.alive = false; ctx.releaseToken(m); laser.visible = false; m.dieT = 0; m.fall = 0; m.fallV = 0;
      // 被从背后打中往前扑，从前面打中往后倒；倒的方向上 1.6 米内有墙就反过来，两边都有墙就跪倒
      const f = dir ? dir.x * Math.sin(m.yaw) + dir.z * Math.cos(m.yaw) : -1;
      m.fallSign = f > 0 ? 1 : -1;
      const blocked = (sign) => { tmp.set(m.pos.x, m.pos.y + 0.6, m.pos.z); tmp2.set(Math.sin(m.yaw) * sign, 0, Math.cos(m.yaw) * sign); return !!G.physics.raycast(tmp, tmp2, 1.7); };
      if (blocked(m.fallSign)) m.fallSign = -m.fallSign;
      m.crumple = blocked(m.fallSign);
      m.fallRoll = (rng() - 0.5) * 0.5; m.speed *= 0.3;
      lensMat.emissive.setRGB(0, 0, 0);
      G.events.emit('enemy:killed', { enemy: m, pos: m.pos, type: 'soldier', part });
    }
    function dead(dt) {
      m.dieT += dt;
      if (m.sink > 0) {
        m.sink += dt; body.position.y -= 0.18 * dt;
        if (m.sink > 2.5) ctx.retire(m);
        return;
      }
      const t = m.dieT;
      // 先膝盖一软，再整个人倒下去（角加速度随角度变大，像真的倒下）
      m.crouch += ((t < 0.35 ? 0.6 : m.crumple ? 1 : 0.35) - m.crouch) * ease(9, dt);
      m.lowReady += (1.6 - m.lowReady) * ease(5, dt);
      const target = m.crumple ? 0.45 : 1.42;
      if (t > 0.12 && m.fall < target) { m.fallV += (3 + Math.sin(m.fall) * 14) * dt; m.fall = Math.min(target, m.fall + m.fallV * dt); if (m.fall >= target && m.fallV > 2) G.events.emit('enemy:step', { pos: m.pos, type: 'soldier', speed: 6 }); }
      body.rotation.x = m.fall * m.fallSign; body.rotation.z = m.fallRoll * Math.min(1, m.fall);
      m.pitch += (0 - m.pitch) * ease(4, dt); m.twist += (0 - m.twist) * ease(4, dt);
      vel.multiplyScalar(Math.exp(-5 * dt));
      if (t < 1) { m.pos.x += vel.x * dt; m.pos.z += vel.z * dt; }
      pose(dt);
      if (t > SOLDIER.corpseSeconds) m.sink = 1e-3;
    }

    // ---- 摆姿势：步态、蹲、举枪、后坐、中弹 ----
    function pose(dt) {
      const sp = m.speed, amp = m.alive ? Math.min(0.55, sp * 0.14) : 0;
      const stride = 1.3 + sp * 0.15, before = Math.sin(m.gait);
      if (m.alive) m.gait += dt * sp / stride * Math.PI * 2;
      if (m.alive && sp > 0.4 && Math.sign(Math.sin(m.gait)) !== Math.sign(before)) G.events.emit('enemy:step', { pos: m.pos, type: 'soldier', enemy: m, speed: sp });
      // 弹簧：后坐、中弹前后仰、左右晃
      m.recoilV += (-m.recoil * 220 - m.recoilV * 22) * dt; m.recoil += m.recoilV * dt;
      m.flinchPV += (-m.flinchP * 120 - m.flinchPV * 14) * dt; m.flinchP += m.flinchPV * dt;
      m.flinchRV += (-m.flinchR * 120 - m.flinchRV * 14) * dt; m.flinchR += m.flinchRV * dt;
      const c = m.crouch, run = Math.min(1, sp / SOLDIER.runSpeed);
      root.rotation.y = m.yaw;
      hips.position.y = HIP_Y - 0.4 * c - Math.abs(Math.cos(m.gait)) * 0.035 * Math.min(1, sp / 2);
      spine.rotation.set(0.14 * run + 0.18 * c + m.flinchP * 0.06 - m.pitch * 0.15, m.twist * 0.7, m.flinchR * 0.06);
      head.rotation.set(-m.pitch * 0.4 - 0.08 * run, m.twist * 0.3, 0);
      // 枪的世界俯仰 = 身体前倾 + 枪自己的转角；这里减掉身体前倾，让枪口正好对准目标（垂枪警戒时往下压）
      aim.rotation.set(-m.pitch + m.lowReady * 0.55 - m.recoil * 0.02 - spine.rotation.x, m.lowReady * 0.35, 0);
      aim.position.z = 0.02 - m.recoil * 0.004;
      for (let i = 0; i < 2; i++) {
        const p = m.gait + i * Math.PI, L = legs[i];
        L.thigh.rotation.x = -amp * Math.sin(p) - 1.1 * c;
        L.shin.rotation.x = amp * 1.4 * Math.max(0, Math.cos(p)) + 1.9 * c + 0.05;
      }
      root.updateMatrixWorld(true);
      head.localToWorld(headPos.set(0, 0.11, 0.01));
      spine.localToWorld(chest.set(0, 0.36, 0));
      hips.localToWorld(pelvisPos.set(0, 0, 0));
      legs[0].shin.localToWorld(kneeL.set(0, 0, 0)); legs[0].shin.localToWorld(footL.set(0, -SHIN, 0.03));
      legs[1].shin.localToWorld(kneeR.set(0, 0, 0)); legs[1].shin.localToWorld(footR.set(0, -SHIN, 0.03));
      muzzle.getWorldPosition(m.muzzle);
    }
    return m;
  }
  return pool;
}
