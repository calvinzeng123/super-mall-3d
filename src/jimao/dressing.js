// 零点突围：战术布置。任务地点周围摆几段沙袋墙和水泥隔离墩——既是「被武装分子占了」的样子，也是打起来能蹲的掩体
// （原来只有旧 FPS 任务留下的五个箱子）。每处任务地点 0–3 段，离中心 5–7.5 米，长边顺着 x 或 z；
// 位置是离线算好的：占地往外 1.5 米一圈都是导航空地（不堵路、不压墙），离撤离载具的门 9 米以上（tests/jimao-missions.test.js 逐个验）。
// 导航里算实心障碍（和原来的箱子一样登记成 market-stall），射线按 1.15 米高挡子弹：蹲着打不到、站着露头。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 一段掩体的尺寸（米）：长、厚、高 */
export const DRESS = Object.freeze({ length: 2.4, depth: 0.75, height: 1.05 });
export const DRESSING = Object.freeze([
  { floor: 'P1-1F', x: -164.27, z: -92.17, along: 'z', kind: 'sandbag' },
  { floor: 'P1-1F', x: -170.95, z: -84.75, along: 'x', kind: 'barrier' },
  { floor: 'P1-1F', x: -176.32, z: -87.95, along: 'z', kind: 'sandbag' },
  { floor: 'P1-2F', x: -94.73, z: -134.81, along: 'z', kind: 'sandbag' },
  { floor: 'P1-2F', x: -107.38, z: -138.17, along: 'z', kind: 'barrier' },
  { floor: 'P1-B1M', x: -145.91, z: -95.08, along: 'z', kind: 'sandbag' },
  { floor: 'P1-B1M', x: -132.95, z: -139.24, along: 'z', kind: 'sandbag' },
  { floor: 'P1-B1M', x: -142.45, z: -140.7, along: 'z', kind: 'barrier' },
  { floor: 'P1-B1M', x: -133.62, z: -132.03, along: 'x', kind: 'sandbag' },
  { floor: 'P1-B1', x: -120.85, z: -132.73, along: 'z', kind: 'sandbag' },
  { floor: 'P1-B1', x: -129.37, z: -127.53, along: 'x', kind: 'barrier' },
  { floor: 'P1-B1', x: -130.15, z: -135.13, along: 'z', kind: 'sandbag' },
  { floor: 'P1-4F', x: -96.97, z: -133.34, along: 'z', kind: 'sandbag' },
  { floor: 'P1-4F', x: -106.5, z: -134.61, along: 'z', kind: 'barrier' },
  { floor: 'P1-4F', x: -97.51, z: -126.12, along: 'x', kind: 'sandbag' },
  { floor: 'P1-5F', x: -152.31, z: -120.9, along: 'x', kind: 'sandbag' },
  { floor: 'P1-6F', x: -99.82, z: -135.53, along: 'z', kind: 'sandbag' },
  { floor: 'P1-6F', x: -93.51, z: -138.76, along: 'x', kind: 'barrier' },
  { floor: 'P1-6F', x: -103.55, z: -132.89, along: 'z', kind: 'sandbag' },
  { floor: 'P1-RF', x: -155.21, z: -122.02, along: 'z', kind: 'sandbag' },
  { floor: 'P1-RF', x: -164.82, z: -121.95, along: 'z', kind: 'barrier' },
  { floor: 'P1-RF', x: -160.05, z: -127.2, along: 'x', kind: 'sandbag' },
  { floor: 'P1-RF', x: -92.02, z: -141.35, along: 'z', kind: 'sandbag' },
  { floor: 'P1-RF', x: -96.48, z: -132.42, along: 'x', kind: 'barrier' },
  { floor: 'P1-RF', x: -98.18, z: -144.86, along: 'x', kind: 'sandbag' },
  { floor: 'P1C-1F', x: -127.71, z: -218.94, along: 'z', kind: 'sandbag' },
  { floor: 'H-1F', x: -246.25, z: -75.54, along: 'x', kind: 'sandbag' },
  { floor: 'H-1F', x: -250.07, z: -82.16, along: 'z', kind: 'barrier' },
  { floor: 'H-1F', x: -238.97, z: -76.71, along: 'z', kind: 'sandbag' },
  { floor: 'H-8F', x: -214.34, z: -91.01, along: 'x', kind: 'sandbag' },
  { floor: 'H-12F', x: -214.34, z: -91.01, along: 'x', kind: 'sandbag' },
  { floor: 'A-1F', x: -30.82, z: -216.42, along: 'z', kind: 'sandbag' },
  { floor: 'A-1F', x: -39.63, z: -211.74, along: 'x', kind: 'barrier' },
  { floor: 'A-1F', x: -39.96, z: -219.37, along: 'z', kind: 'sandbag' },
  { floor: 'A-6F', x: -29.18, z: -183.13, along: 'z', kind: 'sandbag' },
  { floor: 'M-B1', x: -31.83, z: -15.11, along: 'z', kind: 'sandbag' },
  { floor: 'M-B1', x: -36.81, z: -6.46, along: 'x', kind: 'barrier' },
  { floor: 'M-B1', x: -41.15, z: -12.75, along: 'z', kind: 'sandbag' },
  { floor: 'M-B3', x: -13.06, z: -7.64, along: 'z', kind: 'sandbag' },
  { floor: 'M-B3', x: -20.51, z: -1, along: 'x', kind: 'barrier' },
  { floor: 'M-B3', x: -22.65, z: -8.33, along: 'z', kind: 'sandbag' },
]);

/** 沙袋墙：三层，每层前后两排，上面一层错半个袋子、少一个 */
export function sandbagGeometry() {
  const parts = [], bag = new THREE.SphereGeometry(0.5, 9, 6);
  [4, 4, 3].forEach((n, r) => {
    for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
      const g = bag.clone();
      const jitter = ((i * 7 + r * 3 + (side > 0 ? 5 : 0)) % 5) / 5 - 0.4;
      g.scale(0.6, 0.3, 0.38);
      g.rotateY(jitter * 0.18);
      // 顶上一层只有三个，往里错半个袋子
      g.translate(-DRESS.length / 2 + 0.3 + (i + (n === 3 ? 0.5 : 0)) * 0.6, 0.17 + r * 0.3, side * 0.18 + jitter * 0.03);
      parts.push(g);
    }
  });
  const out = mergeGeometries(parts);
  out.computeVertexNormals();
  return out;
}
/** 水泥隔离墩：底宽上窄的梯形截面拉成 2.4 米长，顶上一道橙色警示条（返回 [墩身, 警示条]） */
export function barrierGeometry() {
  const s = new THREE.Shape(), b = DRESS.depth / 2, t = 0.13, h = 0.95;
  s.moveTo(-b, 0); s.lineTo(b, 0); s.lineTo(b, 0.14); s.lineTo(t + 0.04, 0.36); s.lineTo(t, h); s.lineTo(-t, h); s.lineTo(-t - 0.04, 0.36); s.lineTo(-b, 0.14); s.closePath();
  const body = new THREE.ExtrudeGeometry(s, { depth: DRESS.length, bevelEnabled: false });
  body.rotateY(Math.PI / 2); body.translate(-DRESS.length / 2, 0, 0); // 截面在 z–y 平面，沿 x 拉长
  const stripe = new THREE.BoxGeometry(DRESS.length - 0.2, 0.05, t * 2 + 0.02); stripe.translate(0, h + 0.02, 0);
  return [body, stripe];
}

/** 一段掩体在导航里的占地（长边顺 x：w 是长；顺 z：d 是长） */
export const dressFootprint = (p) => (p.along === 'x' ? { w: DRESS.length, d: DRESS.depth } : { w: DRESS.depth, d: DRESS.length });

/** 把掩体登记成导航障碍（建导航之前调）。返回登记了几段 */
export function registerDressing(layout, list = DRESSING) {
  let n = 0;
  list.forEach((p, i) => {
    const lv = layout.levels.find((l) => l.id === p.floor);
    if (!lv) return;
    const id = `dress-${i}`;
    if (!lv.features.some((f) => f.id === id)) lv.features.push({ id, type: 'market-stall', tactical: true, floor: p.floor, y: lv.elev, x: p.x, z: p.z, ...dressFootprint(p), height: DRESS.height });
    n++;
  });
  return n;
}

/** 画出来：沙袋墙、隔离墩各一个实例化网格（一共 3 次绘制） */
export function buildDressing(scene, layout, list = DRESSING) {
  const group = new THREE.Group(); group.name = '零点突围战术布置';
  const sand = new THREE.MeshStandardMaterial({ color: '#857b66', roughness: 0.96, metalness: 0 });
  const concrete = new THREE.MeshStandardMaterial({ color: '#a3a5a1', roughness: 0.88, metalness: 0.02 });
  const warn = new THREE.MeshStandardMaterial({ color: '#e0862c', roughness: 0.6 });
  const [bodyGeo, stripeGeo] = barrierGeometry(), bagGeo = sandbagGeometry();
  const items = list.map((p) => ({ p, lv: layout.levels.find((l) => l.id === p.floor) })).filter((q) => q.lv);
  const make = (geo, mat, kind) => {
    const of = items.filter((q) => q.p.kind === kind), mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, of.length)), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    of.forEach(({ p, lv }, i) => { q.setFromAxisAngle(up, p.along === 'x' ? 0 : Math.PI / 2); m.compose(new THREE.Vector3(p.x, lv.elev, p.z), q, one); mesh.setMatrixAt(i, m); });
    mesh.count = of.length; mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  make(bagGeo, sand, 'sandbag'); make(bodyGeo, concrete, 'barrier'); make(stripeGeo, warn, 'barrier');
  scene.add(group);
  return { group, count: items.length, dispose() { group.removeFromParent(); for (const g of [bagGeo, bodyGeo, stripeGeo]) g.dispose(); for (const m of [sand, concrete, warn]) m.dispose(); } };
}
