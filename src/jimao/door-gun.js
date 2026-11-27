// 零点突围：直升机左舷舱门的六管机枪（M134 式）。
// 模型：枪架立柱 + 转盘 + U 形摇架，机匣（电机、供弹机、退壳口）、六根枪管（三道箍、消焰口）绕轴转、
// 后面两只铲形握把（橡胶握套、扳机按钮）、环形瞄具、一节节软供弹槽连到挂在架子上的弹药箱（箱上有标签）。
// 材质用原游戏的程序化 PBR 材质（gunmetal / anodized_black / polymer_black / steel_worn / brass），和步枪一个质感。
// 射击：跟着视线转（左右 ±77°、上 25° 下 69° 射界），按住开火，枪管先转起来再出弹，每秒 20 发，曳光弹每发都有；
// 弹药不限，会过热：持续打 4 秒左右过热锁死，冷却到三成才能再打，枪管越热越红。
// 辅助瞄准：准星附近的敌人会把视角拉过去、子弹往它身上修正（直升机在绕圈，不辅助很难打中）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DOOR_GUN = Object.freeze({ rate: 20, damage: 55, range: 450, spread: 0.009, heatPerShot: 0.0125, cool: 0.32, unlock: 0.3, spinUp: 0.35,
  yaw: 1.35, pitchUp: 0.45, pitchDown: 1.2,
  // 辅助瞄准：准星 9° 以内的敌人会把视角往它身上拉（开火时拉得更快，顺带抵消直升机在动）；4° 以内子弹直接朝它飞
  assistCone: 0.157, assistPull: 2.6, assistPullIdle: 1.1, bulletCone: 0.07 });

const _iq = new THREE.Quaternion(), _ad = new THREE.Vector3();
/** 从 from 看 point，换到枪架坐标里（q：枪架的世界朝向，枪口默认朝枪架 +z）：{ yaw 左右, pitch 往下为正, dist }，和 update 里转枪的算法一样 */
export function aimAngles(q, from, point, out = { yaw: 0, pitch: 0, dist: 0 }) {
  _ad.set(point.x - from.x, point.y - from.y, point.z - from.z); out.dist = _ad.length();
  if (out.dist < 1e-6) { out.yaw = 0; out.pitch = 0; return out; }
  _ad.multiplyScalar(1 / out.dist).applyQuaternion(_iq.copy(q).invert());
  out.yaw = Math.atan2(_ad.x, _ad.z); out.pitch = -Math.asin(Math.max(-1, Math.min(1, _ad.y)));
  return out;
}
/** 子弹打在 castAcross 找到的墙 / 楼板 / 阳台上：原游戏 impact 事件的样子（火花、弹孔、声音都按 point、normal、surface 读）。法线是零的（老数据）就朝着来的方向 */
export function impactAt(wall, dir) {
  const n = wall.normal && wall.normal.lengthSq() > 1e-6 ? wall.normal.clone() : dir.clone().negate();
  return { point: wall.point.clone(), normal: n, dist: wall.dist, surface: wall.surface || 'concrete', enemy: null, dir: dir.clone(), from: 'player' };
}
/** 这个角度在射界里（左右 ±yaw、上 pitchUp 下 pitchDown，边上留 margin 弧度）、150 米以内（辅助瞄准也只管这么远） */
export function inGunArc(a, margin = 0.03, range = 150, C = DOOR_GUN) {
  return a.dist <= range && Math.abs(a.yaw) <= C.yaw - margin && a.pitch >= -C.pitchUp + margin && a.pitch <= C.pitchDown - margin;
}

function material(G, name, fallback) {
  try { const m = G?.mats?.get?.(name, { triplanar: true }); if (m) return m; } catch { /* 没有材质库（测试）就用后备 */ }
  return new THREE.MeshStandardMaterial(fallback);
}

/** 弹药箱侧面的标签：橄榄绿底、黄色字和条纹、批号 */
function canLabel() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#45512f'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#d9c24a'; g.fillRect(0, 118, 256, 10); g.fillRect(0, 134, 256, 4);
  g.fillStyle = '#e9e3c4'; g.font = 'bold 30px monospace'; g.textAlign = 'center';
  g.fillText('7.62 MM', 128, 44); g.font = 'bold 18px monospace'; g.fillText('LINKED  4:1 TRACER', 128, 72); g.fillText('4400 RDS · LOT YL-26', 128, 98);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 160, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 造枪：返回 { root（挂到机舱的转盘）, yawG, pitchG, barrels, muzzle, eject, mats, dispose } */
export function buildDoorGun(G, { post = 0.62, drop = 0.6 } = {}) {
  const M = {
    gun: material(G, 'gunmetal', { color: '#3a3d40', metalness: 0.85, roughness: 0.38 }),
    black: material(G, 'anodized_black', { color: '#161718', metalness: 0.6, roughness: 0.45 }),
    poly: material(G, 'polymer_black', { color: '#1d1e1f', metalness: 0.05, roughness: 0.8 }),
    steel: material(G, 'steel_worn', { color: '#8a8f93', metalness: 0.85, roughness: 0.4 }),
    brass: material(G, 'brass', { color: '#c9a04a', metalness: 0.9, roughness: 0.3 }),
    olive: material(G, 'hull_paint', { color: '#4a5634', metalness: 0.25, roughness: 0.65 }),
    label: new THREE.MeshStandardMaterial({ map: canLabel(), roughness: 0.85, metalness: 0.05 }),
    hot: new THREE.MeshStandardMaterial({ color: '#2b2c2e', metalness: 0.8, roughness: 0.35, emissive: new THREE.Color('#ff5a14'), emissiveIntensity: 0 }),
  };
  const geos = new Set();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    geos.add(geo); const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o;
  };
  const cyl = (p, r, len, m, x, y, z, seg = 14, axis = 'z') => add(p, new THREE.CylinderGeometry(r, r, len, seg), m, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
  const box = (p, w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz);

  const root = new THREE.Group(); root.name = '舱门机枪';
  // 枪架：舱底立柱、转盘（左右转）
  // post：立柱长度（直升机从舱底立起来 0.62 米；装甲车架在车顶环上，只要一小截）
  cyl(root, 0.035, post, M.olive, 0, -0.11 - post / 2, 0, 12, 'y');
  cyl(root, 0.06, 0.05, M.black, 0, -0.1, 0, 16, 'y');
  for (let k = 0; k < 6; k++) box(root, 0.012, 0.03, 0.03, M.steel, Math.cos(k) * 0.065, -0.1, Math.sin(k) * 0.065);
  const yawG = new THREE.Group(); root.add(yawG);
  // U 形摇架 + 俯仰轴
  box(yawG, 0.2, 0.03, 0.08, M.olive, 0, -0.06, 0);
  for (const s of [-1, 1]) { box(yawG, 0.025, 0.11, 0.07, M.olive, s * 0.1, -0.005, 0); cyl(yawG, 0.022, 0.03, M.black, s * 0.115, 0.04, 0, 12, 'x'); }
  const pitchG = new THREE.Group(); pitchG.position.y = 0.04; yawG.add(pitchG);

  const gun = new THREE.Group(); pitchG.add(gun);
  // 机匣：主筒、前后端盖、电机（右）、供弹机和供弹口（左）、退壳口（右下）
  cyl(gun, 0.07, 0.3, M.gun, 0, 0, 0.04, 20);
  cyl(gun, 0.074, 0.02, M.black, 0, 0, 0.19, 20); cyl(gun, 0.074, 0.025, M.black, 0, 0, -0.115, 20);
  for (const z of [-0.05, 0.03, 0.11]) cyl(gun, 0.072, 0.008, M.steel, 0, 0, z, 20);
  cyl(gun, 0.042, 0.19, M.black, 0.085, 0.035, 0.0, 14);                           // 电机
  for (let k = 0; k < 7; k++) cyl(gun, 0.045, 0.006, M.steel, 0.085, 0.035, -0.07 + k * 0.022, 14); // 散热片
  box(gun, 0.03, 0.03, 0.05, M.black, 0.085, 0.08, -0.07);                          // 电缆插头
  box(gun, 0.09, 0.11, 0.15, M.black, -0.105, 0.0, 0.04);                           // 供弹机
  box(gun, 0.05, 0.045, 0.1, M.steel, -0.16, -0.02, 0.04);                          // 供弹口
  for (const z of [0.0, 0.08]) box(gun, 0.095, 0.012, 0.012, M.steel, -0.105, 0.058, z);
  box(gun, 0.05, 0.03, 0.06, M.black, 0.05, -0.075, 0.07);                          // 退壳口
  // 环形瞄具
  box(gun, 0.012, 0.09, 0.012, M.black, 0, 0.11, 0.07);
  add(gun, new THREE.TorusGeometry(0.04, 0.0035, 6, 24), M.black, 0, 0.16, 0.07);
  box(gun, 0.006, 0.08, 0.004, M.black, 0, 0.16, 0.07); box(gun, 0.08, 0.006, 0.004, M.black, 0, 0.16, 0.07);
  box(gun, 0.006, 0.03, 0.006, M.black, 0, 0.085, 0.62);                             // 准星
  // 枪管组：六根枪管 + 三道箍 + 消焰口，整组绕 z 转
  const barrels = new THREE.Group(); barrels.position.z = 0.19; gun.add(barrels);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, x = Math.cos(a) * 0.034, y = Math.sin(a) * 0.034;
    cyl(barrels, 0.0115, 0.62, M.hot, x, y, 0.31, 10);
    cyl(barrels, 0.015, 0.045, M.black, x, y, 0.635, 10);                          // 消焰口
    for (const z of [0.05, 0.14]) cyl(barrels, 0.0135, 0.012, M.steel, x, y, z, 10);
  }
  for (const z of [0.12, 0.36, 0.58]) cyl(barrels, 0.054, 0.022, M.black, 0, 0, z, 18); // 枪管箍
  cyl(barrels, 0.012, 0.6, M.steel, 0, 0, 0.3, 8);                                  // 中心轴
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 0.87); gun.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.06, -0.09, 0.07); gun.add(eject);
  // 后部铲形握把：框架、两只橡胶握套（滚花环）、扳机按钮、保险
  for (const s of [-1, 1]) {
    box(gun, 0.02, 0.02, 0.16, M.black, s * 0.075, 0.0, -0.2);
    cyl(gun, 0.022, 0.15, M.poly, s * 0.11, 0.0, -0.28, 12, 'y');
    for (let k = 0; k < 5; k++) cyl(gun, 0.0235, 0.006, M.black, s * 0.11, -0.05 + k * 0.025, -0.28, 12, 'y');
    box(gun, 0.03, 0.02, 0.03, s > 0 ? M.black : M.steel, s * 0.11, 0.085, -0.28);
    box(gun, 0.018, 0.012, 0.03, new THREE.MeshStandardMaterial({ color: s > 0 ? '#b52a1f' : '#1c1c1c', roughness: 0.5 }), s * 0.11, 0.1, -0.27);
  }
  box(gun, 0.25, 0.02, 0.02, M.black, 0, 0.0, -0.28);
  box(gun, 0.25, 0.02, 0.02, M.black, 0, 0.0, -0.13);
  // 软供弹槽：从供弹口往下、往后一节节连到弹药箱
  // drop：弹药箱挂在转轴下面多远（直升机挂在枪架下 0.6 米；装甲车的枪贴着车顶，箱子只能挂在枪旁边）
  const ky = drop / 0.6;
  const chute = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.19, -0.02, 0.04), new THREE.Vector3(-0.26, -0.12 * ky, 0.0), new THREE.Vector3(-0.3, -0.3 * ky, -0.08), new THREE.Vector3(-0.28, -0.46 * ky, -0.12)]);
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, p = chute.getPoint(t), tan = chute.getTangent(t);
    const seg = box(gun, 0.075, 0.035, 0.03, k % 2 ? M.black : M.steel, p.x, p.y, p.z);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
  }
  // 弹药箱：挂在枪下左侧，跟着枪转；提手、两个搭扣、侧面标签、露出一截弹链
  const can = new THREE.Group(); can.position.set(-0.27, -drop, -0.12); gun.add(can);
  box(can, 0.2, 0.26, 0.32, M.olive, 0, 0, 0);
  box(can, 0.21, 0.02, 0.33, M.black, 0, 0.13, 0);
  add(can, new THREE.PlaneGeometry(0.3, 0.19), M.label, -0.101, 0, 0, 0, -Math.PI / 2, 0);
  for (const z of [-0.1, 0.1]) box(can, 0.03, 0.04, 0.02, M.steel, 0.1, 0.11, z);
  box(can, 0.04, 0.015, 0.16, M.black, 0, 0.145, 0);
  for (let k = 0; k < 5; k++) { cyl(can, 0.006, 0.05, M.brass, -0.02 + (k % 2) * 0.01, 0.15, -0.06 + k * 0.03, 8, 'x'); }

  // 静态部件按材质合并（枪管组、转盘层次保留，便于转动）
  for (const g of [root, yawG, gun, can, barrels]) mergeByMaterial(g, geos);
  return { root, yawG, pitchG, barrels, muzzle, eject, mats: M,
    dispose() { root.removeFromParent(); geos.forEach((g) => g.dispose()); M.label.map?.dispose(); M.label.dispose(); M.hot.dispose(); } };
}

function mergeByMaterial(group, geos) {
  const meshes = group.children.filter((c) => c.isMesh);
  for (const m of new Set(meshes.map((c) => c.material))) {
    const members = meshes.filter((c) => c.material === m);
    if (members.length < 2) continue;
    const gs = members.map((c) => { c.updateMatrix(); const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); g.applyMatrix4(c.matrix); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; });
    const merged = mergeGeometries(gs, false); geos.add(merged);
    group.add(new THREE.Mesh(merged, m));
    gs.forEach((g) => g.dispose()); members.forEach((c) => c.removeFromParent());
  }
}

/**
 * 舱门机枪的操作。mount 是机舱里的挂点（Object3D，默认枪口朝舱门外 = mount 的 +z）。
 * update(dt, { active, firing, camera }) 每帧调用；返回 { heat, overheated, inArc }。
 */
/**
 * label：状态条上的名字；post：立柱长度（见 buildDoorGun）；flash：枪口焰大小（车顶机枪就在眼前，给小一点，不然糊住准星）；
 * cfg：改掉 DOOR_GUN 里的哪几项（楼顶重机枪：左右不限 yaw: Infinity、往下压得更低、辅助瞄准弱一点、子弹能穿 pierce 只）。tune(over) 开打以后再改（键鼠 / 触屏换辅助瞄准）
 */
export function createDoorGun(G, mount, { label = 'M134 舱门机枪', post, drop, flash = 1.5, cfg = null } = {}) {
  const C = { pierce: 0, pierceMul: 0.6, puppetRate: 8, ...DOOR_GUN, ...(cfg || {}) };
  const gun = buildDoorGun(G, { ...(post == null ? {} : { post }), ...(drop == null ? {} : { drop }) });
  mount.add(gun.root);
  let heat = 0, overheated = false, spin = 0, spinAngle = 0, cooldown = 0, active = false, shooting = false;
  const q = new THREE.Quaternion(), d = new THREE.Vector3(), dir = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3(), mz = new THREE.Vector3(), ej = new THREE.Vector3(), vel = new THREE.Vector3();
  let inArc = true;
  const hud = makeHud(label);

  /** 准星附近最近的目标（夹角最小、150 米内）：{ point, angle } */
  let lock = null;
  function pickTarget(camera, targets) {
    camera.getWorldPosition(from); camera.getWorldDirection(dir);
    let best = null;
    for (const t of targets || []) {
      to.copy(t).sub(from); const dist = to.length();
      if (dist > 150 || dist < 1) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, to.dot(dir) / dist)));
      if (ang < C.assistCone && (!best || ang < best.angle)) best = { point: t, angle: ang };
    }
    return best;
  }
  /** 把玩家视角（原游戏的 yaw / pitch，世界坐标）往目标转，每秒最多转 rate 弧度，越靠近准星拉得越轻 */
  function pull(camera, point, rate, dt) {
    camera.getWorldPosition(from); to.copy(point).sub(from).normalize();
    const yaw = Math.atan2(-to.x, -to.z), pitch = Math.asin(to.y), P = G.player;
    if (!P) return;
    let dy = ((yaw - P.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, dp = pitch - P.pitch;
    const step = rate * dt, n = Math.hypot(dy, dp);
    if (n > step) { dy *= step / n; dp *= step / n; }
    P.yaw += dy; P.pitch += dp;
  }

  let cam = null;
  const mq = new THREE.Quaternion(), ma = { yaw: 0, pitch: 0, dist: 0 }, me = new THREE.Vector3();
  /** 人眼在哪（最近一次 update 给的镜头；还没给过就用枪架） */
  function eye(out = new THREE.Vector3()) { return cam ? cam.getWorldPosition(out) : mount.getWorldPosition(out); }
  /** 这一点枪转得过去（在射界里）：HUD 标记、辅助瞄准、丧尸能不能打飞机都按这一条（siege.js 的 exposed） */
  function canAim(point, from = null) { mount.getWorldQuaternion(mq); return inGunArc(aimAngles(mq, from || eye(me), point, ma), 0.03, 150, C); }

  function update(dt, { active: on = false, firing = false, camera = null, targets = null } = {}) {
    active = on; hud.show(on); if (camera) cam = camera;
    lock = on && camera ? pickTarget(camera, targets) : null;
    if (lock) pull(camera, lock.point, (firing ? C.assistPull : C.assistPullIdle) * (1 - 0.6 * lock.angle / C.assistCone), dt);
    heat = Math.max(0, heat - C.cool * dt * (firing && !overheated ? 0.15 : 1));
    if (overheated && heat < C.unlock) overheated = false;
    if (on && camera) {
      // 视线方向换到挂点坐标里，枪跟着转（超出射界就停在边上、不出弹）
      mount.getWorldQuaternion(q).invert();
      camera.getWorldDirection(d).applyQuaternion(q);
      const yaw = Math.atan2(d.x, d.z), pitch = -Math.asin(Math.max(-1, Math.min(1, d.y)));
      const cy = Math.max(-C.yaw, Math.min(C.yaw, yaw)), cp = Math.max(-C.pitchUp, Math.min(C.pitchDown, pitch));
      inArc = Math.abs(cy - yaw) < 0.02 && Math.abs(cp - pitch) < 0.02;
      gun.yawG.rotation.y += (cy - gun.yawG.rotation.y) * Math.min(1, dt * 18);
      gun.pitchG.rotation.x += (cp - gun.pitchG.rotation.x) * Math.min(1, dt * 18);
    }
    const want = on && firing && !overheated ? 1 : 0;
    spin += (want - spin) * Math.min(1, dt / (want ? C.spinUp : 0.9));
    spinAngle += dt * spin * 60; gun.barrels.rotation.z = spinAngle;
    cooldown -= dt;
    shooting = !!(on && firing && !overheated && inArc && spin > 0.6 && camera);
    if (shooting) {
      while (cooldown <= 0) { cooldown += 1 / C.rate; shoot(camera); }
    } else cooldown = Math.max(cooldown, 0);
    gun.mats.hot.emissiveIntensity = Math.max(0, heat - 0.25) * 2.2;
    hud.set(heat, overheated, inArc, !!lock);
    return { heat, overheated, inArc };
  }

  function shoot(camera) {
    camera.getWorldPosition(from); camera.getWorldDirection(dir);
    // 子弹修正：准星 4° 以内有敌人，就朝它身上打
    if (lock && lock.angle < C.bulletCone) dir.copy(lock.point).sub(from).normalize();
    const a = Math.random() * Math.PI * 2, r = Math.tan(C.spread) * Math.sqrt(Math.random());
    const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(dir, up).normalize(), u2 = new THREE.Vector3().crossVectors(right, dir);
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(u2, Math.sin(a) * r).normalize();
    let hit = null;
    // 子弹穿不过楼：原游戏的射线只查起点那一层的墙（从天上打出去就只有楼板挡），楼的外墙、楼顶楼梯间挡不住，
    // 楼里看不见的丧尸照样打得中。射程先按跨楼层的射线截到第一堵墙 / 楼板
    const wall = G.physics?.castAcross?.(from, dir, C.range) || null;
    // 射程多放一毫米：castAcross 从挪过的起点量，同一堵墙量出来比 raycast 短 1e-14，不放的话 raycast 看得见的墙也不冒火花
    const reach = wall ? wall.dist + 1e-3 : C.range;
    try { hit = G.combat?.playerShot?.(from.clone(), dir.clone(), { damage: C.damage, range: reach, impulse: 2 }); } catch { /* 打空 */ }
    // 穿透（楼顶重机枪）：打中一只，从它身后接着飞，再打中后面排着的 pierce 只，每穿一只伤害打 pierceMul 折；穿过去的那一截照样被墙截住
    for (let k = 0, dmg = C.damage; k < C.pierce && hit?.enemy && hit.dist < reach - 0.5; k++) {
      const o = from.clone().addScaledVector(dir, hit.dist + 0.45), left = reach - hit.dist - 0.45; let next = null;
      try { next = G.combat?.playerShot?.(o, dir.clone(), { damage: (dmg *= C.pierceMul), range: left, impulse: 2 }); } catch { next = null; }
      if (!next) break;
      hit = { ...next, dist: hit.dist + 0.45 + next.dist };
    }
    // 打在 raycast 不查的墙、楼板、阳台上（起点那一层以外的）：火花、弹孔、声音照样要有（原游戏的处理按 point / normal 读）
    if (!hit && wall) G.events?.emit?.('impact', impactAt(wall, dir));
    gun.muzzle.getWorldPosition(mz);
    to.copy(hit?.point || wall?.point || from.clone().addScaledVector(dir, 320));
    G.fx?.tracer?.(mz.clone(), to.clone(), { color: 0xffb35a, speed: 720, width: 0.055 });
    G.fx?.muzzleFlash?.(mz.clone(), dir.clone(), { scale: flash });
    G.render?.lightPool?.flash?.(mz.clone(), 0xffb060, 30, 10, 0.05);
    if (Math.random() < 0.5) { gun.eject.getWorldPosition(ej); vel.set(0, -1.5, 0).addScaledVector(right, 2.2); G.fx?.shell?.(ej.clone(), vel.clone()); }
    G.events?.emit?.('weapon:fire', { origin: from.clone(), dir: dir.clone(), muzzle: mz.clone(), ads: 0, doorGun: true });
    G.player?.addShake?.(0.035);
    heat = Math.min(1, heat + C.heatPerShot);
    if (heat >= 1) { overheated = true; G.hud?.message?.('机枪过热！松开扳机冷却', 1.6); }
  }

  /**
   * 别人在用这挺枪（联机：右舷那挺是阿哲的、左舷是主角的）：枪口转到他报的角度（枪架坐标：yaw 左右、pitch 往下为正），
   * 他在开火就转枪管、隔 1 / puppetRate 秒画一发曳光弹和枪口焰——只是画面，不打伤害、不出响动（命中由他那边报给主机）
   */
  let puppetT = 0;
  function puppet(dt, { yaw = 0, pitch = 0, firing = false } = {}) {
    active = false; hud.show(false);
    gun.yawG.rotation.y += (Math.max(-C.yaw, Math.min(C.yaw, yaw)) - gun.yawG.rotation.y) * Math.min(1, dt * 12);
    gun.pitchG.rotation.x += (Math.max(-C.pitchUp, Math.min(C.pitchDown, pitch)) - gun.pitchG.rotation.x) * Math.min(1, dt * 12);
    spin += ((firing ? 1 : 0) - spin) * Math.min(1, dt / (firing ? C.spinUp : 0.9));
    spinAngle += dt * spin * 60; gun.barrels.rotation.z = spinAngle;
    shooting = false;
    if (!firing || spin < 0.6) { puppetT = 0; return; }
    if ((puppetT -= dt) > 0) return;
    puppetT = 1 / C.puppetRate;
    gun.muzzle.getWorldPosition(mz); gun.muzzle.getWorldQuaternion(q); dir.set(0, 0, 1).applyQuaternion(q);
    G.fx?.tracer?.(mz.clone(), mz.clone().addScaledVector(dir, 160), { color: 0xffb35a, speed: 720, width: 0.05 });
    G.fx?.muzzleFlash?.(mz.clone(), dir.clone(), { scale: flash * 0.8 });
  }

  return { gun, update, puppet, canAim, eye, get heat() { return heat; }, get overheated() { return overheated; }, get active() { return active; },
    /** 这一帧枪口朝哪（枪架坐标）、是不是正在出弹：联机时发给别人，别人那边的这挺枪照着转、照着冒火 */
    get aim() { return { yaw: gun.yawG.rotation.y, pitch: gun.pitchG.rotation.x, firing: shooting }; },
    reset() { heat = 0; overheated = false; spin = 0; cooldown = 0; gun.mats.hot.emissiveIntensity = 0; hud.show(false); },
    cfg: C, tune(over) { Object.assign(C, over || {}); },
    dispose() { gun.dispose(); hud.remove(); } };
}

/** 屏幕下方的机枪状态条：名字、弹药不限、温度条、过热 / 超出射界提示 */
export function makeHud(label = 'M134 舱门机枪') {
  if (typeof document === 'undefined') return { show() {}, set() {}, remove() {} };
  const el = document.createElement('div');
  el.className = 'jm-doorgun';
  el.innerHTML = `<b>${label}</b><span class="inf">弹药 ∞</span><i><em></em></i><span class="st"></span>`;
  el.hidden = true;
  (document.getElementById('ui') || document.body).appendChild(el);
  const bar = el.querySelector('em'), st = el.querySelector('.st');
  let last = '';
  return {
    show(on) { if (el.hidden === on) el.hidden = !on; },
    set(heat, over, arc, locked = false) {
      bar.style.width = `${Math.round(heat * 100)}%`; el.classList.toggle('hot', over);
      const t = over ? '过热 · 冷却中' : !arc ? '超出射界' : heat > 0.7 ? '温度高' : locked ? '已锁定' : '按住开火';
      if (t !== last) { last = t; st.textContent = t; }
    },
    remove() { el.remove(); },
  };
}

export const DOOR_GUN_CSS = `
/* 坐在载具上用的是车载机枪：手雷、切枪、换弹、跳、蹲、近战、瞄准、交互这些键用不着，还会压住机枪的状态条（用户截图）；步枪的子弹数也不该显示 */
/* 联机时机舱里拿步枪的那个人（.jm-cabin）：换弹、瞄准键和子弹数照常留着 */
.jm-riding:not(.jm-cabin) .t-reload, .jm-riding .t-jump, .jm-riding:not(.jm-cabin) .t-ads, .jm-riding .t-crouch, .jm-riding .t-melee, .jm-riding .t-nade, .jm-riding .t-swap, .jm-riding .t-interact { display: none !important; }
.jm-riding:not(.jm-cabin) .h-ammo { display: none !important; }
/* 治疗、路障在飞机上用不着（看炸楼那一段也是），手机上这两个键正好在中间偏右、拖着转视角老按到它们（测试：一趟飞下来「不用治——血是满的」十七遍） */
.jm-riding .t-heal, .jm-riding .t-wall, .jm-riding .jm-heal, .jm-riding .jm-walls { display: none !important; }
/* 手机上无线电字幕平时在准星正下方（minimap.js），坐飞机时挡着要打的楼——挪到屏幕最底下（机枪状态条下面） */
.is-touch .jm-riding .comms { top: auto !important; bottom: calc(8px + var(--sab, 0px)) !important; }
.jm-doorgun { position: absolute; left: 50%; bottom: 92px; transform: translateX(-50%); z-index: 6; display: flex; align-items: center; gap: 12px;
  padding: 7px 14px; border-radius: 10px; background: rgba(10, 14, 12, .55); color: #e8efe2; font: 600 13px/1 system-ui, sans-serif; letter-spacing: .04em; pointer-events: none; }
.jm-doorgun .inf { color: #9fe3a8; }
.jm-doorgun i { position: relative; width: 140px; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, .14); overflow: hidden; }
.jm-doorgun em { position: absolute; inset: 0 auto 0 0; width: 0; background: linear-gradient(90deg, #f0c24a, #ff6a2a); }
.jm-doorgun .st { min-width: 84px; color: #cfd6cc; font-weight: 500; }
.jm-doorgun.hot .st { color: #ff7a4a; }
.jm-doorgun.hot em { background: #ff4a2a; }
@media (max-width: 700px) { .jm-doorgun { bottom: 150px; gap: 8px; font-size: 12px; } .jm-doorgun i { width: 90px; } }
`;
