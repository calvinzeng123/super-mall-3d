// 丧尸围城：楼顶机枪阵地上的双联重机枪（高射机枪那种：两根粗枪管并排、左右轮流打）。
// 用户：「另一种样式的机枪？更爽的固定枪械？」——原来那挺是舱门机枪（M134 六管），这里换一挺更重、更好认的：
//   模型：双联摇架上两挺并排的重机枪（机匣、带散热片的粗枪管、大号制退器），两侧各挂一个弹药箱、弹链送进机匣，后面一对铲形握把和蝶形扳机，
//   前面一块分成两翼的防盾（中间留出看的缺口，下面一块护板），整个摇架跟着俯仰。材质用原游戏的程序化 PBR（gunmetal / anodized_black / hull_paint / brass…）。
//   打起来：两根枪管轮流出弹（每秒 rate 发，一根一半），每发一下大枪口焰、粗曳光、抛壳、枪管往后一坐、镜头往上一跳；
//   弹头是榴弹 / 燃烧弹：打中丧尸或者地面在 splash.r 米里炸一下（离得越远伤得越少），把周围的掀开、打出硬直；打中的那只被打得往后一退。
//   弹药不限，只会过热：连打 6 秒半才锁死（原来三秒多），锁了两秒不到就凉下来。辅助瞄准键鼠弱、触屏强（roof-gun.js 按输入方式 tune）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeHud, impactAt } from './door-gun.js';

/**
 * rate：两根枪管加起来每秒几发；damage：直接打中一发多少（行尸打头一发、打身子两发或者一发加旁边炸一下，奔尸一发）；spread：散布（弧度）；range：射程；
 * heatPerShot / cool / unlock：一发涨多少热、不开火时每秒凉多少（开着火凉得慢，只有 0.15 倍）、凉到多少才解锁——连打 6 秒半过热（以前那挺三秒多）、锁 1.9 秒；
 * yaw / pitchUp / pitchDown：枪自己在枪架上能转多少（左右不限，射界由 roof-gun.js 管）；
 * splash：弹着点炸开——半径 r 米、正中 damage、边上剩 edge 成，把周围的往外推 push（米 / 秒，推 0.14 秒，zombie.js 的 knock）；push：直接打中的那只往后推多快；
 * kick：每发镜头往上跳多少弧度（很快回正）；shake：每发镜头抖多少；flash：枪口焰多大；
 * assistCone / assistPull / assistPullIdle / bulletCone：辅助瞄准（准星多少弧度以内的拉过去、开火 / 不开火每秒拉多快、多少弧度以内子弹直接朝它飞）
 */
export const TWIN_HMG = Object.freeze({
  rate: 8, damage: 36, spread: 0.016, range: 160,
  heatPerShot: 0.0256, cool: 0.34, unlock: 0.35,
  yaw: Infinity, pitchUp: 0.6, pitchDown: 1.35,
  splash: Object.freeze({ r: 1.3, damage: 16, edge: 0.4, push: 4 }),
  push: 6, kick: 0.006, shake: 0.05, flash: 0.75,
  assistCone: 0.07, assistPull: 0.9, assistPullIdle: 0, bulletCone: 0.025,
});

function material(G, name, fallback) {
  try { const m = G?.mats?.get?.(name, { triplanar: true }); if (m) return m; } catch { /* 没有材质库（测试）就用后备 */ }
  return new THREE.MeshStandardMaterial(fallback);
}

/** 防盾上的喷字：橄榄绿底、白色编号和一圈黄黑警示条（两翼正面） */
function shieldLabel() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a5634'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '200,190,150'},${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  g.fillStyle = '#d9c24a'; for (let x = -256; x < 256; x += 36) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 18, 256); g.lineTo(x + 18 + 28, 222); g.lineTo(x + 28, 222); g.fill(); }
  g.fillStyle = '#1b1d17'; g.fillRect(0, 214, 256, 6);
  g.fillStyle = '#e8e3cf'; g.font = 'bold 64px monospace'; g.textAlign = 'center'; g.fillText('12.7', 128, 112); g.font = 'bold 30px monospace'; g.fillText('YL-07', 128, 160);
  // 掉漆、刮痕
  g.strokeStyle = 'rgba(150,150,140,0.55)'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { const x = Math.random() * 256, y = Math.random() * 200; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8 + Math.random() * 30, y + (Math.random() - 0.5) * 10); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * 造枪。原点是耳轴（俯仰的轴），+z 朝前、枪管朝前。返回 { root（挂在枪架上的转台）, yawG, pitchG, barrels: [左, 右]（各自往后坐）, muzzles, ejects, mats, dispose }
 * base：转台往下多长一截立柱（立在环形枪架的导轨上）
 */
export function buildTwinHmg(G, { base = 0.3 } = {}) {
  const M = {
    gun: material(G, 'gunmetal', { color: '#383b3e', metalness: 0.85, roughness: 0.38 }),
    black: material(G, 'anodized_black', { color: '#161718', metalness: 0.6, roughness: 0.45 }),
    poly: material(G, 'polymer_black', { color: '#1d1e1f', metalness: 0.05, roughness: 0.8 }),
    steel: material(G, 'steel_worn', { color: '#8a8f93', metalness: 0.85, roughness: 0.4 }),
    brass: material(G, 'brass', { color: '#c9a04a', metalness: 0.9, roughness: 0.3 }),
    olive: material(G, 'hull_paint', { color: '#4a5634', metalness: 0.25, roughness: 0.65 }),
    label: new THREE.MeshStandardMaterial({ map: shieldLabel(), color: '#ffffff', metalness: 0.3, roughness: 0.6 }),
    hot: new THREE.MeshStandardMaterial({ color: '#2b2c2e', metalness: 0.8, roughness: 0.35, emissive: new THREE.Color('#ff5a14'), emissiveIntensity: 0 }),
  };
  const geos = new Set();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { geos.add(geo); const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; parent.add(o); return o; };
  const cyl = (p, r, len, m, x, y, z, seg = 14, axis = 'z', r2 = r) => add(p, new THREE.CylinderGeometry(r2, r, len, seg), m, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
  const box = (p, w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz);

  const root = new THREE.Group(); root.name = '双联重机枪';
  // 立柱 + 导轨上的滑座 + 回转盘
  box(root, 0.2, 0.07, 0.16, M.black, 0, -base + 0.03, 0);
  cyl(root, 0.055, base - 0.08, M.olive, 0, -base / 2 - 0.02, 0, 14, 'y');
  cyl(root, 0.11, 0.04, M.black, 0, -0.17, 0, 20, 'y');
  for (let k = 0; k < 8; k++) box(root, 0.016, 0.03, 0.03, M.steel, Math.cos(k * 0.785) * 0.1, -0.17, Math.sin(k * 0.785) * 0.1);
  const yawG = new THREE.Group(); root.add(yawG);
  // 摇架：底板、两块侧板（耳轴座）、高低机手轮
  box(yawG, 0.56, 0.035, 0.22, M.olive, 0, -0.14, 0);
  for (const s of [-1, 1]) { box(yawG, 0.03, 0.2, 0.18, M.olive, s * 0.28, -0.05, 0); cyl(yawG, 0.035, 0.05, M.black, s * 0.3, 0, 0, 14, 'x'); }
  add(yawG, new THREE.TorusGeometry(0.06, 0.009, 6, 18), M.black, 0.33, -0.08, -0.1, 0, Math.PI / 2, 0);
  const pitchG = new THREE.Group(); yawG.add(pitchG);

  // 摇架（跟着俯仰）：托板、两挺的机匣、顶盖、拉机柄、后面的框和铲形握把
  box(pitchG, 0.5, 0.04, 0.56, M.olive, 0, -0.1, 0.02);
  const barrels = [], muzzles = [], ejects = [], parts = [];
  for (const s of [-1, 1]) {
    const x = s * 0.13;
    box(pitchG, 0.12, 0.15, 0.54, M.gun, x, 0, 0.0);                 // 机匣
    box(pitchG, 0.115, 0.03, 0.32, M.black, x, 0.09, 0.04);          // 顶盖（受弹器盖）
    box(pitchG, 0.124, 0.016, 0.02, M.steel, x, 0.06, -0.14);
    box(pitchG, 0.124, 0.016, 0.02, M.steel, x, 0.06, 0.18);
    box(pitchG, 0.03, 0.03, 0.08, M.black, x + s * 0.075, 0.02, -0.1); // 拉机柄
    box(pitchG, 0.06, 0.04, 0.07, M.black, x, -0.095, 0.08);         // 抛壳口
    box(pitchG, 0.1, 0.1, 0.06, M.black, x, 0, -0.29);              // 尾板
    // 枪管组（单独一组：打一发往后坐一下）：粗枪管、靠机匣那段的散热片、护套、大号制退器
    const b = new THREE.Group(); b.position.set(x, 0.01, 0.27); pitchG.add(b); barrels.push(b);
    cyl(b, 0.026, 1.06, M.hot, 0, 0, 0.53, 12);
    for (let k = 0; k < 10; k++) cyl(b, 0.046, 0.012, M.black, 0, 0, 0.04 + k * 0.034, 16);
    cyl(b, 0.034, 0.12, M.steel, 0, 0, 0.42, 14);
    cyl(b, 0.044, 0.15, M.black, 0, 0, 1.12, 16);
    for (const z of [1.08, 1.14]) for (const t of [-1, 1]) box(b, 0.018, 0.05, 0.022, M.gun, t * 0.04, 0, z);
    const mz = new THREE.Object3D(); mz.position.set(x, 0.01, 0.27 + 1.22); pitchG.add(mz); muzzles.push(mz);
    const ej = new THREE.Object3D(); ej.position.set(x, -0.13, 0.08); pitchG.add(ej); ejects.push(ej);
    // 弹药箱（挂在外侧）、弹链（一节节黄铜弹头）送进机匣
    const can = new THREE.Group(); can.position.set(s * 0.33, -0.05, 0.0); pitchG.add(can); parts.push(can);
    box(can, 0.13, 0.22, 0.32, M.olive, 0, 0, 0); box(can, 0.14, 0.02, 0.33, M.black, 0, 0.11, 0);
    box(can, 0.03, 0.015, 0.14, M.black, 0, 0.125, 0); for (const z of [-0.1, 0.1]) box(can, 0.02, 0.04, 0.03, M.steel, s * 0.065, 0.08, z);
    for (let k = 0; k < 6; k++) { const t = k / 5; cyl(pitchG, 0.0085, 0.07, M.brass, s * (0.31 - t * 0.12), 0.08 + Math.sin(t * Math.PI) * 0.04, 0.02 + (k % 2) * 0.012, 8, 'x'); }
  }
  box(pitchG, 0.36, 0.035, 0.05, M.black, 0, 0.02, 0.98);          // 两根枪管中间的箍
  box(pitchG, 0.02, 0.05, 0.02, M.black, 0, 0.06, 0.98);
  // 后面：框、一对铲形握把（橡胶握套）、中间的蝶形扳机
  box(pitchG, 0.36, 0.03, 0.03, M.black, 0, -0.02, -0.34);
  for (const s of [-1, 1]) {
    box(pitchG, 0.025, 0.025, 0.12, M.black, s * 0.16, -0.02, -0.3);
    cyl(pitchG, 0.022, 0.15, M.poly, s * 0.17, -0.03, -0.4, 12, 'y');
    for (let k = 0; k < 5; k++) cyl(pitchG, 0.0235, 0.006, M.black, s * 0.17, -0.09 + k * 0.03, -0.4, 12, 'y');
  }
  box(pitchG, 0.09, 0.05, 0.012, M.steel, 0, 0.0, -0.39, 0.3);
  // 防盾：中间留缺口的两翼（往外斜着收）+ 枪管底下一块护板；正面喷着编号和警示条
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.5, -0.06, 0.5); w.rotation.y = -s * 0.32; pitchG.add(w); parts.push(w);
    box(w, 0.42, 0.44, 0.014, M.olive, 0, 0, 0);
    add(w, new THREE.PlaneGeometry(0.4, 0.4), M.label, 0, 0.0, 0.009);
    box(w, 0.44, 0.025, 0.03, M.black, 0, 0.225, 0); box(w, 0.025, 0.44, 0.03, M.black, s * 0.22, 0, 0);
    for (const [x, y] of [[-0.17, 0.18], [0.17, 0.18], [-0.17, -0.18], [0.17, -0.18]]) cyl(w, 0.01, 0.01, M.steel, x, y, 0.01, 8, 'z');
    box(pitchG, 0.03, 0.03, 0.26, M.black, s * 0.26, -0.08, 0.36);    // 防盾的撑杆
  }
  box(pitchG, 0.5, 0.17, 0.014, M.olive, 0, -0.2, 0.5);
  box(pitchG, 0.52, 0.025, 0.03, M.black, 0, -0.115, 0.5);

  for (const g of [root, yawG, pitchG, ...barrels, ...parts]) mergeByMaterial(g, geos);
  return { root, yawG, pitchG, barrels, muzzles, ejects, mats: M,
    dispose() { root.removeFromParent(); geos.forEach((g) => g.dispose()); M.label.map?.dispose(); M.label.dispose(); M.hot.dispose(); } };
}

function mergeByMaterial(group, geos) {
  const meshes = group.children.filter((c) => c.isMesh);
  for (const m of new Set(meshes.map((c) => c.material))) {
    const members = meshes.filter((c) => c.material === m);
    if (members.length < 2) continue;
    const gs = members.map((c) => { c.updateMatrix(); const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); g.applyMatrix4(c.matrix); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; });
    const merged = mergeGeometries(gs, false); geos.add(merged);
    const mesh = new THREE.Mesh(merged, m); mesh.castShadow = true; group.add(mesh);
    gs.forEach((g) => g.dispose()); members.forEach((c) => c.removeFromParent());
  }
}

/**
 * 双联重机枪的操作。mount：枪架上的挂点（枪口默认朝 mount 的 +z）。update(dt, { active, firing, camera, targets }) 每帧调；返回 { heat, overheated, inArc }。
 * label：状态条上的名字；cfg：改掉 TWIN_HMG 里的哪几项；tune(over) 开打以后再改（键鼠 / 触屏换辅助瞄准）。
 * 统计（测试、浏览器验证用）：stats { shots, hits, splashHits, splashKills, shoves }
 */
export function createTwinHmg(G, mount, { label = '双联重机枪', cfg = null, base } = {}) {
  const C = { ...TWIN_HMG, ...(cfg || {}), splash: { ...TWIN_HMG.splash, ...(cfg?.splash || {}) } };
  const gun = buildTwinHmg(G, base == null ? {} : { base });
  mount.add(gun.root);
  let heat = 0, overheated = false, cooldown = 0, active = false, side = 0, kickOff = 0, inArc = true, lock = null, cam = null;
  const rec = [0, 0], stats = { shots: 0, hits: 0, splashHits: 0, splashKills: 0, shoves: 0 };
  const q = new THREE.Quaternion(), d = new THREE.Vector3(), dir = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3(), mz = new THREE.Vector3(), ej = new THREE.Vector3(), vel = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(), u2 = new THREE.Vector3();
  const hud = makeHud(label);

  /** 准星附近最近的目标（夹角最小、150 米内）：{ point, angle } */
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
  /** 把玩家视角往目标转，每秒最多 rate 弧度，越靠近准星拉得越轻 */
  function pull(camera, point, rate, dt) {
    camera.getWorldPosition(from); to.copy(point).sub(from).normalize();
    const yaw = Math.atan2(-to.x, -to.z), pitch = Math.asin(to.y), P = G.player;
    if (!P) return;
    let dy = ((yaw - P.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, dp = pitch - P.pitch;
    const step = rate * dt, n = Math.hypot(dy, dp);
    if (n > step) { dy *= step / n; dp *= step / n; }
    P.yaw += dy; P.pitch += dp;
  }

  function update(dt, { active: on = false, firing = false, camera = null, targets = null } = {}) {
    active = on; hud.show(on); if (camera) cam = camera;
    lock = on && camera ? pickTarget(camera, targets) : null;
    if (lock && C.assistPull + C.assistPullIdle > 0) pull(camera, lock.point, (firing ? C.assistPull : C.assistPullIdle) * (1 - 0.6 * lock.angle / C.assistCone), dt);
    heat = Math.max(0, heat - C.cool * dt * (firing && !overheated ? 0.15 : 1));
    if (overheated && heat < C.unlock) overheated = false;
    // 镜头上跳慢慢回正
    if (kickOff > 0 && G.player) { const back = kickOff * Math.min(1, dt * 7); G.player.pitch -= back; kickOff -= back; }
    if (on && camera) {
      mount.getWorldQuaternion(q).invert();
      camera.getWorldDirection(d).applyQuaternion(q);
      const yaw = Math.atan2(d.x, d.z), pitch = -Math.asin(Math.max(-1, Math.min(1, d.y)));
      const cy = Math.max(-C.yaw, Math.min(C.yaw, yaw)), cp = Math.max(-C.pitchUp, Math.min(C.pitchDown, pitch));
      inArc = Math.abs(cy - yaw) < 0.02 && Math.abs(cp - pitch) < 0.02;
      gun.yawG.rotation.y += (cy - gun.yawG.rotation.y) * Math.min(1, dt * 18);
      gun.pitchG.rotation.x += (cp - gun.pitchG.rotation.x) * Math.min(1, dt * 18);
    }
    for (let k = 0; k < 2; k++) { rec[k] = Math.max(0, rec[k] - dt * 9); gun.barrels[k].position.z = 0.27 - 0.07 * Math.sin(Math.min(1, rec[k]) * Math.PI * 0.5); }
    cooldown -= dt;
    if (on && firing && !overheated && inArc && camera) { while (cooldown <= 0 && !overheated) { cooldown += 1 / C.rate; shoot(camera); } }
    else cooldown = Math.max(cooldown, 0);
    gun.mats.hot.emissiveIntensity = Math.max(0, heat - 0.3) * 2.4;
    hud.set(heat, overheated, inArc, !!lock);
    return { heat, overheated, inArc };
  }

  /** 弹着点炸开：splash.r 米里的丧尸（直接打中的那只除外）掉血、往外推一下 */
  const _sp = new THREE.Vector3();
  function splash(at, d0, skip) {
    const S = C.splash, R = S.r + 0.25; let n = 0;
    for (const z of G.zombies?.pool || []) {
      if (!z.active || !z.alive || z === skip) continue;
      const dx = z.pos.x - at.x, dz = z.pos.z - at.z, dy = z.pos.y + 0.9 * (z.scale || 1) - at.y, dist = Math.hypot(dx, dz, dy * 0.7);
      if (dist > R || Math.abs(dy) > 2.2) continue;
      const k = 1 - Math.min(1, dist / R) * (1 - S.edge);
      const died = z.damage(S.damage * k, _sp.set(z.pos.x, z.pos.y + 1 * (z.scale || 1), z.pos.z), d0, 'body') === true;
      n++; stats.splashHits++; if (died) stats.splashKills++;
      if (!died && z.knock) { const h = Math.hypot(dx, dz); if (z.knock(h > 1e-3 ? dx / h : d0.x, h > 1e-3 ? dz / h : d0.z, S.push * k)) stats.shoves++; }
    }
    return n;
  }
  /** 炸开那一下的样子：火星、一团橙色的烟和尘土、一下闪光（不用原游戏的 explosion：那一下太大，还会震镜头、出大爆炸声） */
  function blastFx(at, n) {
    G.fx?.sparks?.(at.clone(), n.clone(), 9);
    G.fx?.smoke?.(at.clone(), { size: 0.55, life: 0.35, color: 0xff9a3c, rise: 1.4, count: 2 });
    G.fx?.smoke?.(at.clone(), { size: 0.9, life: 1.2, color: 0x4a4440, rise: 0.5, count: 2 });
    G.fx?.dust?.(at.clone(), n.clone(), 1.3);
    G.render?.lightPool?.flash?.(at.clone(), 0xff8a3a, 16, 6, 0.06);
  }

  function shoot(camera) {
    stats.shots++;
    camera.getWorldPosition(from); camera.getWorldDirection(dir);
    if (lock && lock.angle < C.bulletCone) dir.copy(lock.point).sub(from).normalize();
    const a = Math.random() * Math.PI * 2, r = Math.tan(C.spread) * Math.sqrt(Math.random());
    right.crossVectors(dir, up).normalize(); u2.crossVectors(right, dir);
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(u2, Math.sin(a) * r).normalize();
    // 射程截到跨楼层射线的第一堵墙 / 楼板（和舱门机枪一样：楼的外墙、楼梯间挡得住）
    const wall = G.physics?.castAcross?.(from, dir, C.range) || null, reach = wall ? wall.dist + 1e-3 : C.range;
    let hit = null;
    try { hit = G.combat?.playerShot?.(from.clone(), dir.clone(), { damage: C.damage, range: reach, impulse: 3 }); } catch { /* 打空 */ }
    if (!hit && wall) G.events?.emit?.('impact', impactAt(wall, dir));
    const z = hit?.enemy || null;
    if (z) { stats.hits++; if (z.alive && z.knock) { const h = Math.hypot(dir.x, dir.z) || 1; if (z.knock(dir.x / h, dir.z / h, C.push)) stats.shoves++; } }
    const pt = hit?.point || wall?.point || null;
    if (pt) { splash(pt, dir, z); blastFx(pt, hit?.normal || wall?.normal || dir.clone().negate()); }
    // 两根枪管轮流出弹：曳光、枪口焰、抛壳、枪管往后一坐
    const k = side; side ^= 1; rec[k] = 1;
    gun.muzzles[k].getWorldPosition(mz);
    to.copy(pt || from.clone().addScaledVector(dir, 320));
    G.fx?.tracer?.(mz.clone(), to.clone(), { color: 0xffc46a, speed: 560, width: 0.085, intensity: 22 });
    G.fx?.muzzleFlash?.(mz.clone(), dir.clone(), { scale: C.flash });
    G.render?.lightPool?.flash?.(mz.clone(), 0xffb060, 16, 9, 0.05);
    gun.ejects[k].getWorldPosition(ej); vel.set(0, -1.2, 0).addScaledVector(right, (k ? 1 : -1) * 1.8); G.fx?.shell?.(ej.clone(), vel.clone());
    G.events?.emit?.('weapon:fire', { origin: from.clone(), dir: dir.clone(), muzzle: mz.clone(), ads: 0, doorGun: true, heavy: true });
    G.player?.addShake?.(C.shake);
    if (G.player) { G.player.pitch += C.kick; kickOff += C.kick; }
    heat = Math.min(1, heat + C.heatPerShot);
    if (heat >= 1) { overheated = true; G.hud?.message?.('重机枪过热！松开扳机冷却', 1.6); }
  }

  return { gun, update, stats, get heat() { return heat; }, get overheated() { return overheated; }, get active() { return active; },
    eye(out = new THREE.Vector3()) { return cam ? cam.getWorldPosition(out) : mount.getWorldPosition(out); },
    reset() { heat = 0; overheated = false; cooldown = 0; side = 0; rec[0] = rec[1] = 0; if (kickOff && G.player) G.player.pitch -= kickOff; kickOff = 0; gun.mats.hot.emissiveIntensity = 0; hud.show(false); },
    cfg: C, tune(over) { Object.assign(C, over || {}); },
    dispose() { gun.dispose(); hud.remove(); } };
}
