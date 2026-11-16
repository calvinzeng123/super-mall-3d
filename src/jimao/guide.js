// 零点突围：地面上若隐若现的路线指引。
// 从玩家脚下沿导航网格（楼梯、扶梯都算）到最近一个还没完成的目标（中继、证物箱、情报箱）；目标都完成了就指向撤离点。
// 物品在住户、客房、商铺里时，先寻路到门外，再从门口直线进房间。
// 画法：路线上每 1.4 米一个贴地的淡蓝色小箭头（加色、半透明），一道流光沿路往目标方向推；只画眼前 45 米左右。
// 每 1.5 秒最多重算一次路线，只在目标换了、或玩家离开路线 5 米以上时才重算。坐载具时不画。
import * as THREE from 'three';
import { findPath } from '../fps/pathfinding.js';
import { landAt, clear } from '../layout/nav.js';

export const GUIDE = Object.freeze({ spacing: 1.4, ahead: 45, count: 34, recompute: 1.5, stray: 5, speed: 7, color: '#9fe8ff' });

/** 物品在房间里：返回门外一点（门脸中点沿外法线 1.5 米），否则 null */
export function doorOutside(layout, site) {
  if (!site?.unit) return null;
  const lv = layout.levels.find((l) => l.id === site.floor), u = lv?.units?.find((q) => q.id === site.unit), f = u?.wfronts?.[0];
  if (!f) return null;
  const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2;
  for (const g of [1, -1]) {
    const x = mx + f.nx * 1.5 * g, z = mz + f.nz * 1.5 * g;
    if (Math.hypot(x - site.x, z - site.z) > Math.hypot(mx - site.x, mz - site.z)) return { floor: site.floor, x, z, y: lv.elev, slope: null };
  }
  return null;
}

/** 把路线点（导航状态）按 spacing 重新采样成一串 {x, y, z, s}；s 是从起点算的里程 */
export function resample(points, spacing = GUIDE.spacing) {
  const out = [];
  if (!points || points.length < 2) return out;
  let s = 0, carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    for (let d = carry; d < len; d += spacing) {
      const t = d / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, s: s + d, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len });
    }
    carry = (carry - len) % spacing; if (carry < 0) carry += spacing;
    s += len;
  }
  return out;
}

export function createRouteGuide(G, { scene, layout, nav, hidden = () => false }) {
  // 贴地小箭头：朝 +z，双面
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.2); shape.lineTo(0.17, -0.04); shape.lineTo(0.09, -0.04); shape.lineTo(0, 0.08); shape.lineTo(-0.09, -0.04); shape.lineTo(-0.17, -0.04); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, GUIDE.count);
  mesh.name = '零点突围路线指引'; mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.count = 0;
  const base = new THREE.Color(GUIDE.color), col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3();
  for (let i = 0; i < GUIDE.count; i++) mesh.setColorAt(i, base);
  scene.add(mesh);

  let route = [], key = '', wait = 0, t = 0;

  /** 现在该去哪：没完成的目标里离玩家最近的；都完成了去撤离点 */
  function target() {
    const run = G.game?.run, p = G.player?.pos;
    if (!run || !p) return null;
    if (!run.allCut) {
      const open = (run.relays || []).filter((r) => !r.cut && r.o?.pos);
      if (!open.length) return null;
      const r = open.sort((a, b) => a.o.pos.distanceTo(p) - b.o.pos.distanceTo(p))[0], site = r.o.site || { floor: r.o.zone, x: r.o.pos.x, z: r.o.pos.z };
      return { key: r.id, floor: site.floor, x: r.o.pos.x, y: r.o.pos.y, z: r.o.pos.z, door: doorOutside(layout, site) };
    }
    const x = G.level?.extraction;
    if (!x?.pos) return null;
    const st = landAt(nav, x.pos.x, x.pos.z, x.pos.y + 0.6);
    return st ? { key: 'extract', floor: st.floor, x: x.pos.x, y: x.pos.y, z: x.pos.z, door: null } : null;
  }

  function plan(tg) {
    const from = G.physics?.stateOf?.(G.player.pos);
    if (!from) return [];
    const goal = tg.door || { floor: tg.floor, x: tg.x, z: tg.z, y: tg.y, slope: null };
    if (!clear(nav, goal)) return [];
    const pts = findPath(nav, from, goal) || [];
    if (!pts.length) return [];
    const list = pts.map((s) => ({ x: s.x, y: s.y ?? 0, z: s.z }));
    if (tg.door) list.push({ x: tg.x, y: tg.y, z: tg.z });
    return resample(list);
  }

  function update(dt) {
    t += dt; wait -= dt;
    const playing = G.game?.state === 'playing' && G.player?.alive !== false && !hidden();
    const tg = playing ? target() : null;
    if (!tg) { mesh.count = 0; route = []; key = ''; return; }
    const p = G.player.pos;
    // 离路线最近的点（只在前面一段里找）
    let near = 0, nd = Infinity;
    for (let i = 0; i < route.length; i++) { const d = Math.hypot(route[i].x - p.x, route[i].z - p.z) + Math.abs(route[i].y - p.y) * 2; if (d < nd) { nd = d; near = i; } }
    if (wait <= 0 && (tg.key !== key || nd > GUIDE.stray || !route.length)) {
      wait = GUIDE.recompute;
      key = tg.key; route = plan(tg); near = 0;
    }
    // 从脚下往前画一段；流光往目标方向推，两头渐隐
    let n = 0;
    const s0 = route[near]?.s ?? 0;
    for (let i = near + 1; i < route.length && n < GUIDE.count; i++) {
      const r = route[i], ds = r.s - s0;
      if (ds > GUIDE.ahead) break;
      const wave = 0.5 + 0.5 * Math.cos(((r.s - t * GUIDE.speed) / 6) * Math.PI * 2);
      const fade = Math.min(1, ds / 3) * Math.min(1, (GUIDE.ahead - ds) / 10);
      col.copy(base).multiplyScalar((0.22 + 0.55 * wave * wave) * fade);
      q.setFromAxisAngle(up, Math.atan2(r.dx, r.dz));
      m4.compose(p3.set(r.x, r.y + 0.05, r.z), q, one);
      mesh.setMatrixAt(n, m4); mesh.setColorAt(n, col); n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  return { mesh, update, get route() { return route; }, reset() { route = []; key = ''; wait = 0; mesh.count = 0; },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); } };
}
