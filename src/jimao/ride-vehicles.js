// 零点突围的撤离载具：能坐进去的直升机和装甲接应车。
// 机身、车身是空心的：舱底、舱顶、侧壁、座椅、仪表台、驾驶员都有，玻璃透明，坐在里面能看到外面。
// 局部坐标：机头 / 车头朝 +z，+x 是左手边（登机门、车门都在 +x 这一侧）。
// 静态部件按材质合并成几个网格；旋翼、尾桨、车轮、车门单独动。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 每种载具：登机门外一点（站在这里就开始登机）、门内一点、乘坐时眼睛的位置和默认朝向（seatYaw，相对机头，+ 是往左转）、
 * 占地（导航障碍）。直升机：坐在左舷舱门的机枪后面，朝舱门外；接应车：从左后门上车，站到后排、从车顶射击口探出上半身。 */
export const RIDE_SPECS = Object.freeze({
  helicopter: {
    doorOut: [1.75, 1.7, -0.25], doorIn: [0.75, 1.88, -0.35], seat: [0.6, 1.9, -0.22], seatYaw: Math.PI / 2,
    gunMount: [1.0, 1.3, -0.22], // 坐在舱门边、眼睛抬高（离舱底 1.1 米）：枪在视线下方 0.6 米，从枪身上面往下看楼顶，舱底不挡
    footprint: { x0: -1.2, x1: 1.2, z0: -1.9, z1: 2.4 },
  },
  car: {
    doorOut: [1.85, 1.65, -0.5], doorIn: [0.95, 1.52, -0.5], seat: [0, 2.72, -0.6], seatYaw: 0,
    // 车顶机枪：环形枪架（车顶上一圈导轨）的圆心在射击口正中（眼睛正下方），枪挂在环上、离圆心 0.9 米，跟着视线绕着人转一整圈。
    // 枪要离眼睛够远、够高，整挺枪（握把、机匣、枪管）才都在视野里：离太近只看得见枪管，机匣在屏幕下沿外面
    gunRing: [0, 2.42, -0.6], gunReach: 0.9,
    footprint: { x0: -1.2, x1: 1.2, z0: -2.8, z1: 2.85 },
  },
});
/** 登机（走到门口 → 钻进舱 → 坐好、关门）用的秒数，之后载具才开动 */
export const BOARD_TIME = 2.6;

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** 把局部点按载具朝向转到世界（不含机身起飞后的位移，只用来摆放触发点、障碍） */
export function rideLocalToWorld(vehicle, y0, p) {
  const v = new THREE.Vector3(p[0], p[1], p[2]).applyAxisAngle(Y_AXIS, vehicle.yaw || 0);
  return { x: vehicle.x + v.x, y: y0 + v.y, z: vehicle.z + v.z };
}

/** 占地矩形（世界坐标、轴对齐；朝向只用 0 / ±90° / 180°） */
export function rideFootprint(vehicle) {
  const f = RIDE_SPECS[vehicle.kind].footprint;
  const pts = [[f.x0, f.z0], [f.x1, f.z1]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyAxisAngle(Y_AXIS, vehicle.yaw || 0));
  const xs = pts.map((p) => p.x + vehicle.x), zs = pts.map((p) => p.z + vehicle.z);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

export function createRideVehicle(exit) {
  const v = exit.vehicle, heli = v.kind === 'helicopter', spec = RIDE_SPECS[v.kind];
  const root = new THREE.Group(), body = new THREE.Group(), parts = new THREE.Group();
  root.name = `撤离-${v.kind}`; root.add(body); body.add(parts);
  root.position.set(v.x, exit.y, v.z); root.rotation.y = v.yaw || 0;

  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, ...o });
  const M = {
    paint: std(heli ? '#3d4c3f' : '#2f3c42', { metalness: 0.55, roughness: 0.45 }),
    dark: std('#15191c', { metalness: 0.3, roughness: 0.7 }),
    trim: std('#8d9692', { metalness: 0.8, roughness: 0.35 }),
    cabin: std('#4a5150', { roughness: 0.85, metalness: 0.1 }),
    floor: std('#262a2c', { roughness: 0.9, metalness: 0.2 }),
    fabric: std(heli ? '#6b6a4c' : '#2c2f33', { roughness: 0.95, metalness: 0 }),
    suit: std(heli ? '#4f5a3c' : '#22282e', { roughness: 0.9, metalness: 0 }),
    skin: std('#c99a78', { roughness: 0.8, metalness: 0 }),
    rubber: std('#121414', { roughness: 0.95, metalness: 0 }),
    glass: new THREE.MeshStandardMaterial({ color: '#9fc4cf', metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    screen: new THREE.MeshBasicMaterial({ color: '#3fe0a6' }),
    amber: new THREE.MeshBasicMaterial({ color: '#ffb547' }),
    lamp: new THREE.MeshBasicMaterial({ color: '#eaf8de' }),
    red: new THREE.MeshBasicMaterial({ color: '#e0563f' }),
    green: new THREE.MeshBasicMaterial({ color: '#5be0b8' }),
    blur: new THREE.MeshBasicMaterial({ color: '#20262a', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  };
  const geos = new Set();
  const mesh = (g, m, x, y, z, parent = parts) => { geos.add(g); const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };
  const box = (w, h, d, x, y, z, m = M.paint, parent = parts) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  const ball = (r, x, y, z, m, parent = parts, s = [1, 1, 1]) => { const o = mesh(new THREE.SphereGeometry(r, 12, 8), m, x, y, z, parent); o.scale.set(...s); return o; };
  const bar = (a, b, r, m = M.trim, parent = parts) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), m, ...A.clone().add(B).multiplyScalar(0.5).toArray(), parent);
    o.quaternion.setFromUnitVectors(Y_AXIS, d.normalize()); return o;
  };
  const seat = (x, y, z, w, back = 0.72) => { // 坐垫顶面在 y，靠背在身后（前排靠背矮一点，后排往前看不挡）
    box(w, 0.12, 0.5, x, y - 0.06, z, M.fabric);
    box(w, back, 0.1, x, y + back / 2, z - 0.27, M.fabric);
    box(w * 0.9, 0.06, 0.06, x, y + back, z - 0.27, M.dark);
  };
  /** 坐着的人：飞行员 / 司机，手伸向操纵杆或方向盘 */
  const person = (x, y, z, hands) => {
    box(0.42, 0.56, 0.26, x, y + 0.32, z, M.suit);                      // 躯干
    box(0.36, 0.14, 0.5, x, y + 0.08, z + 0.2, M.suit);                 // 大腿
    for (const s of [-1, 1]) box(0.13, 0.48, 0.14, x + s * 0.1, y - 0.2, z + 0.44, M.suit); // 小腿
    ball(0.12, x, y + 0.75, z + 0.02, M.skin);
    ball(0.145, x, y + 0.8, z - 0.01, heli ? M.paint : M.dark, parts, [1, 0.9, 1.05]); // 头盔 / 头发
    if (heli) box(0.22, 0.07, 0.04, x, y + 0.76, z + 0.13, M.dark);     // 护目镜
    for (const s of [-1, 1]) bar([x + s * 0.22, y + 0.52, z], hands(s), 0.05, M.suit);
  };

  const rotor = new THREE.Group(), tailRotor = new THREE.Group(), wheels = [], doors = [], blades = [], blinkers = [];
  let blurDisc = null;

  if (heli) {
    // ---- 机舱：舱底、舱顶、后舱壁、两侧舱门大开（滑门推到后面） ----
    box(1.9, 0.08, 3.75, 0, 0.74, 0.15, M.floor);
    for (let z = -1.5; z < 1.9; z += 0.35) box(1.8, 0.012, 0.04, 0, 0.785, z, M.dark); // 防滑条
    box(1.75, 0.42, 3.4, 0, 0.5, 0.1, M.paint);                                         // 机腹
    box(1.95, 0.09, 3.0, 0, 2.3, -0.2, M.paint);                                        // 舱顶
    box(1.8, 0.02, 2.9, 0, 2.25, -0.2, M.cabin);                                        // 顶棚内衬
    box(1.25, 0.48, 2.4, 0, 2.58, -0.55, M.paint);                                      // 发动机罩
    for (const s of [-1, 1]) { const e = mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.5, 10), M.dark, s * 0.45, 2.66, -1.85); e.rotation.x = Math.PI / 2; }
    box(1.95, 1.56, 0.07, 0, 1.53, -1.72, M.paint);                                     // 后舱壁
    box(1.8, 1.4, 0.02, 0, 1.53, -1.68, M.cabin);
    for (let k = 0; k < 5; k++) bar([-0.8 + k * 0.4, 0.95, -1.66], [-0.8 + k * 0.4, 2.1, -1.66], 0.012, M.fabric); // 货网
    for (const s of [-1, 1]) {
      box(0.07, 1.56, 0.65, s * 0.97, 1.53, -1.38);                                   // 门后侧壁
      box(0.07, 0.55, 0.75, s * 0.97, 1.05, 0.98);                                    // 驾驶舱侧壁下半
      box(0.04, 0.95, 0.7, s * 0.97, 1.8, 0.98, M.glass);                             // 驾驶舱侧窗
      bar([s * 0.98, 0.8, -1.05], [s * 0.98, 2.27, -1.05], 0.035);                   // 门框
      bar([s * 0.98, 0.8, 0.63], [s * 0.98, 2.27, 0.63], 0.035);
      bar([s * 1.0, 2.24, -2.5], [s * 1.0, 2.24, 0.63], 0.025);                      // 滑门上轨
      box(0.05, 1.42, 1.5, s * 1.04, 1.52, -2.0);                                     // 推到后面的滑门
      box(0.035, 0.5, 0.6, s * 1.07, 1.75, -2.0, M.glass);
      bar([s * 1.1, 0.12, -1.6], [s * 1.1, 0.12, 1.75], 0.065, M.dark);              // 起落橇
      bar([s * 1.1, 0.12, 1.75], [s * 1.1, 0.3, 2.05], 0.065, M.dark);
      for (const z of [-1.0, 1.0]) bar([s * 1.1, 0.12, z], [s * 0.8, 0.45, z], 0.055);
      bar([s * 0.92, 2.16, -1.0], [s * 0.92, 2.16, 0.55], 0.02);                     // 门边扶手（深色金属，不再是不受光的亮黄）：贴着门上沿——放在 1.95 米正好横在机枪手眼前，像一条橙色的杠挡住半个画面
    }
    // 机头：上面一大块玻璃（透明，坐在后面看得到外面），下面一圈机身
    const nose = mesh(new THREE.SphereGeometry(1, 22, 12, 0, Math.PI, 0, 1.95), M.glass, 0, 1.52, 1.33); nose.scale.set(0.97, 0.78, 1.0);
    const chin = mesh(new THREE.SphereGeometry(1, 22, 6, 0, Math.PI, 1.95, Math.PI - 1.95), M.paint, 0, 1.52, 1.33); chin.scale.set(0.97, 0.78, 1.0);
    bar([0, 0.95, 2.32], [0, 2.28, 1.4], 0.025, M.dark);                                // 风挡中梁
    // 驾驶舱：仪表台、两块屏、中控台、两把驾驶座、一名飞行员
    box(1.6, 0.34, 0.42, 0, 1.18, 1.82, M.dark);
    box(1.5, 0.05, 0.5, 0, 1.38, 1.78, M.dark);
    for (const s of [-1, 1]) { const sc = box(0.42, 0.26, 0.02, s * 0.4, 1.24, 1.6, M.screen); sc.rotation.x = -0.35; }
    box(0.26, 0.36, 0.6, 0, 0.98, 1.3, M.dark);
    for (const s of [-1, 1]) seat(s * 0.45, 1.02, 1.12, 0.46, 0.5);
    person(-0.45, 1.02, 1.17, (s) => [-0.45 + s * 0.15, 1.12, 1.55]);
    bar([-0.45, 0.8, 1.5], [-0.45, 1.1, 1.55], 0.025, M.dark);                         // 驾驶杆
    // 后舱：一排朝前的座椅（玩家坐左边靠门），顶上一盏红色舱灯
    seat(0, 1.0, -1.25, 1.75);
    for (const x of [-0.45, 0.45]) { bar([x - 0.12, 1.7, -1.5], [x - 0.15, 1.05, -1.22], 0.02, M.amber); bar([x + 0.12, 1.7, -1.5], [x + 0.15, 1.05, -1.22], 0.02, M.amber); }
    ball(0.07, 0, 2.2, -0.6, M.red, parts, [1.6, 0.5, 1]);
    // 尾梁、尾翼、尾桨
    const tail = mesh(new THREE.CylinderGeometry(0.17, 0.42, 4.5, 12), M.paint, 0, 1.65, -3.95); tail.rotation.x = -Math.PI / 2;
    box(1.8, 0.06, 0.7, 0, 1.7, -5.3, M.trim);
    const fin = box(0.09, 1.9, 0.8, 0, 2.25, -5.95); fin.rotation.x = 0.12;
    tailRotor.position.set(0.17, 2.2, -5.95); body.add(tailRotor);
    box(0.05, 1.65, 0.13, 0, 0, 0, M.dark, tailRotor); box(0.05, 0.13, 1.65, 0, 0, 0, M.dark, tailRotor);
    // 主旋翼：慢转时是两片桨，快转时换成半透明圆盘（舱里往上看不会被一道道黑条挡住）
    bar([0, 2.8, -0.45], [0, 3.15, -0.45], 0.09);
    rotor.position.set(0, 3.15, -0.45); body.add(rotor);
    for (const a of [0, Math.PI / 2]) { const b = box(10.6, 0.055, 0.23, 0, 0, 0, M.dark, rotor); b.rotation.y = a; blades.push(b); }
    blurDisc = mesh(new THREE.CircleGeometry(5.3, 40), M.blur, 0, 0.01, 0, rotor); blurDisc.rotation.x = -Math.PI / 2; blurDisc.visible = false;
    ball(0.2, 0, 0, 0, M.trim, rotor, [1, 0.5, 1]);
    blinkers.push(ball(0.09, 1.0, 2.25, 0.5, M.red), ball(0.09, -1.0, 2.25, 0.5, M.green), ball(0.08, 0, 2.9, -5.95, M.red));
    ball(0.13, 0, 0.3, 1.9, M.lamp, parts, [1, 0.6, 1]);
  } else {
    // ---- 装甲车：车头、车尾实心，中间乘员舱空心 ----
    box(2.0, 0.1, 4.0, 0, 0.56, -0.25, M.floor);                                        // 车厢地板
    box(2.12, 0.62, 1.55, 0, 0.88, 1.98);                                               // 车头
    const hood = box(2.04, 0.12, 1.45, 0, 1.24, 1.95); hood.rotation.x = -0.06;
    box(2.12, 0.62, 0.95, 0, 0.88, -2.2);                                               // 车尾
    box(2.12, 1.0, 0.1, 0, 1.55, -2.62);                                                // 后门
    box(1.6, 0.5, 0.04, 0, 1.68, -2.68, M.glass);
    // 车顶（盖到后门），后排正上方开一个 0.8 米见方的射击口：口边一圈钢环（车顶机枪的环形枪架）、往后翻平的舱盖
    box(1.95, 0.08, 1.65, 0, 2.03, 0.575); box(1.95, 0.08, 1.65, 0, 2.03, -1.775);
    for (const s of [-1, 1]) box(0.575, 0.08, 0.7, s * 0.6875, 2.03, -0.6);
    box(1.85, 0.02, 1.6, 0, 1.98, 0.55, M.cabin); box(1.85, 0.02, 1.6, 0, 1.98, -1.75, M.cabin);
    for (const s of [-1, 1]) { box(0.86, 0.12, 0.06, 0, 2.12, -0.6 + s * 0.4, M.trim); box(0.06, 0.12, 0.86, s * 0.4, 2.12, -0.6, M.trim); }
    // 口前原来有一块防弹挡板：换成车顶机枪以后去掉（机枪绕着射击口转一整圈，挡板会挡住枪）
    box(0.8, 0.05, 0.8, 0, 2.1, -2.0);                                                        // 舱盖往后翻平、贴在车顶上（以前竖着，回头看被它挡住一大片）；放到枪架导轨后面
    { const rail = mesh(new THREE.TorusGeometry(0.9, 0.028, 8, 40), M.trim, 0, 2.1, -0.6); rail.rotation.x = Math.PI / 2; } // 车顶机枪的环形导轨
    for (const s of [-1, 1]) {
      if (s < 0) box(0.08, 0.6, 3.0, s * 1.03, 0.88, -0.25);                          // 右侧车身下半（整段）
      else { box(0.08, 0.6, 1.17, s * 1.03, 0.88, 0.62); box(0.08, 0.6, 0.73, s * 1.03, 0.88, -1.38); } // 左侧，中间留后门
      box(0.08, 0.6, 0.95, s * 1.03, 1.5, -2.2);                                      // 车尾侧板
      for (const [z, lean] of [[1.18, 0.35], [0.03, 0], [-1.05, 0], [-1.72, 0]]) { const p = box(0.09, 0.85, 0.09, s * 1.0, 1.6, z); p.rotation.x = lean; }
      box(0.04, 0.55, 1.05, s * 1.0, 1.55, 0.6, M.glass);                             // 前门窗
      if (s < 0) box(0.04, 0.55, 1.0, s * 1.0, 1.55, -0.5, M.glass);                  // 右后窗
      box(0.04, 0.5, 0.6, s * 1.0, 1.55, -1.4, M.glass);
      bar([s * 1.15, 0.57, -1.7], [s * 1.15, 0.57, 1.35], 0.08, M.dark);              // 踏板
      box(0.25, 0.16, 0.34, s * 1.17, 1.6, 1.1, M.dark);                              // 后视镜
      for (const z of [-1.74, 1.74]) {
        const w = new THREE.Group(); w.position.set(s * 1.04, 0.54, z); body.add(w); wheels.push(w);
        const tire = mesh(new THREE.TorusGeometry(0.41, 0.12, 8, 18), M.rubber, 0, 0, 0, w); tire.rotation.y = Math.PI / 2;
        const hub = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12), M.trim, 0, 0, 0, w); hub.rotation.z = Math.PI / 2;
        for (let k = 0; k < 5; k++) { const sp = box(0.13, 0.045, 0.46, 0, 0, 0, M.dark, w); sp.rotation.x = (k * Math.PI) / 5; }
      }
      box(0.59, 0.18, 0.04, s * 0.66, 1.03, 2.77, M.lamp);
      box(0.22, 0.37, 0.05, s * 0.85, 1.18, -2.68, M.red);
      blinkers.push(box(0.35, 0.09, 0.18, s * 0.35, 2.12, -0.1, s > 0 ? M.green : M.red));
    }
    const ws = box(1.85, 0.72, 0.04, 0, 1.62, 1.2, M.glass); ws.rotation.x = -0.35;    // 前挡风
    box(2.24, 0.22, 0.28, 0, 0.67, 2.75, M.dark); box(2.2, 0.22, 0.25, 0, 0.66, -2.72, M.dark);
    for (let y = 0.9; y < 1.2; y += 0.08) box(0.65, 0.035, 0.05, 0, y, 2.78, M.trim);
    // 车内：仪表台、方向盘、前排两座（左边司机）、后排长座
    box(1.85, 0.3, 0.45, 0, 1.15, 1.0, M.dark);
    box(0.36, 0.12, 0.02, 0.45, 1.27, 0.78, M.screen);
    const wheel = mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 16), M.dark, 0.45, 1.33, 0.72); wheel.rotation.x = -0.45;
    bar([0.45, 1.33, 0.72], [0.45, 1.2, 0.95], 0.03, M.dark);
    for (const s of [-1, 1]) seat(s * 0.45, 0.98, 0.35, 0.5, 0.52);
    person(0.45, 0.98, 0.4, (s) => [0.45 + s * 0.17, 1.33, 0.7]);
    seat(0, 0.98, -0.65, 1.75);
    box(1.7, 0.4, 0.5, 0, 0.75, -0.65, M.dark);
    // 左后门：铰链在前沿，登车时往外开
    const door = new THREE.Group(); door.position.set(1.03, 0, 0.03); body.add(door); doors.push(door);
    box(0.07, 0.6, 1.05, 0, 0.88, -0.53, M.paint, door);
    box(0.05, 0.55, 0.95, 0, 1.55, -0.53, M.glass, door);
    box(0.08, 0.05, 1.05, 0, 1.85, -0.53, M.paint, door);
    box(0.05, 0.05, 0.22, 0.05, 1.15, -0.85, M.trim, door);
  }

  // 静态部件按材质合并（透明的玻璃最后画）
  parts.updateMatrixWorld(true);
  for (const m of new Set(parts.children.map((c) => c.material))) {
    const members = parts.children.filter((c) => c.material === m && !blinkers.includes(c));
    if (!members.length) continue;
    const gs = members.map((c) => { const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); g.applyMatrix4(c.matrix); g.deleteAttribute('uv'); return g; });
    const merged = mergeGeometries(gs, false); geos.add(merged);
    const o = new THREE.Mesh(merged, m); if (m === M.glass) o.renderOrder = 2; body.add(o);
    gs.forEach((g) => g.dispose()); members.forEach((c) => c.removeFromParent());
  }
  for (const b of blinkers) body.add(b);
  parts.removeFromParent();

  const smooth = (x) => x * x * (3 - 2 * x);
  let spin = 0, blink = 0, roll = 0;
  const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  const home = { x: v.x, y: exit.y, z: v.z, yaw: v.yaw || 0 };
  const park = () => { root.position.set(home.x, home.y, home.z); root.rotation.set(0, home.yaw, 0); body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); };
  return {
    root, body, kind: v.kind, spec,
    /** 撤离路线上的位姿（世界坐标；pitch 正是低头，roll 正是往右压） */
    setPose(p, bob = 0) {
      root.position.set(p.x, p.y, p.z); root.rotation.set(0, p.yaw, 0);
      body.position.set(0, bob, 0); body.rotation.set(p.pitch || 0, 0, p.roll || 0);
    },
    /** 每帧：ready 撤离就绪（旋翼怠速、灯闪），board 登机秒数（< 0 表示还没登），speed 车速（转车轮） */
    update(dt, { ready = false, board = -1, speed = 0 } = {}) {
      blink += dt;
      if (heli) {
        spin = ready || board >= 0 ? Math.min(1, spin + dt * 0.5) : Math.max(0, spin - dt * 0.3);
        rotor.rotation.y += dt * (6 + 36 * spin); tailRotor.rotation.x += dt * (10 + 50 * spin);
        const blur = spin > 0.45; blades.forEach((b) => { b.visible = !blur; }); blurDisc.visible = blur;
      } else {
        roll += (speed * dt) / 0.53; wheels.forEach((w) => { w.rotation.x = -roll; });
        // 登车时开门（0.3–0.9 秒），坐好后关门（1.9–2.4 秒）
        const open = board < 0 ? 0 : board < 0.9 ? smooth(Math.max(0, (board - 0.3) / 0.6)) : board < 1.9 ? 1 : 1 - smooth(Math.min(1, (board - 1.9) / 0.5));
        doors.forEach((d) => { d.rotation.y = -1.05 * open; });
      }
      blinkers.forEach((b, i) => { b.visible = !ready || Math.sin(blink * 6 + i) > -0.2; });
    },
    /** 局部点在这一帧的世界坐标（含起飞位移） */
    toWorld(p, out = new THREE.Vector3()) { root.updateMatrixWorld(true); return body.localToWorld(out.set(p[0], p[1], p[2])); },
    /** 坐在座位上：位置 + 朝向（lookYaw / lookPitch 是相对机头的自由视角） */
    seatPose(lookYaw = 0, lookPitch = 0) {
      const position = this.toWorld(spec.seat);
      body.getWorldQuaternion(tmpQ);
      tmpE.set(lookPitch, Math.PI + (spec.seatYaw || 0) + lookYaw, 0);
      return { position, quaternion: tmpQ.clone().multiply(new THREE.Quaternion().setFromEuler(tmpE)) };
    },
    /** 换一个停放位置（丧尸围城：直升机改停公寓楼顶）；p = { x, y, z, yaw } */
    moveTo(p) { Object.assign(home, { x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0 }); park(); },
    reset() { spin = 0; roll = 0; park(); doors.forEach((d) => { d.rotation.y = 0; }); wheels.forEach((w) => { w.rotation.x = 0; }); },
    dispose() { root.removeFromParent(); geos.forEach((g) => g.dispose()); Object.values(M).forEach((m) => m.dispose()); },
  };
}
