// 「几猫」的物理接口，接到我们自己的地图上。
// 原游戏的物理是一堆轴对齐方盒加一块平地，只有一层；我们的地图是多层楼面、斜坡（楼梯、扶梯）和二维墙线。
// 这里实现原游戏各模块要用的同一套接口（moveCapsule / raycast / lineOfSight / groundHeight / nav），底下换成我们的导航网格：
//   走路：水平方向交给 layout/nav.js 的 step()（墙、栏杆、楼梯、扶梯都在里面）；竖直方向（跳、落地、天花）在这里按原游戏的规则算。
//   射线：墙线和障碍物按竖直的面算，楼板按水平面算（中庭、扶梯洞这些洞口不挡）。
import * as THREE from 'three';
import { step, landAt, supported, NAV } from '../layout/nav.js';
import { findPath } from '../fps/pathfinding.js';

/** 原游戏的台阶高度：站在地上时，脚下这么高以内的落差直接贴地（下楼梯不会腾空）。 */
const STEP_UP = 0.42;
/** 障碍物（柜台、掩体、家具）的高度：导航网格只有平面形状，射线按这么高的实体算。 */
const OBSTACLE_HEIGHT = 1.15;

export function createMapPhysics(nav) {
  const floorHeight = (F) => Math.max(2.6, (F.level?.height || 4.5) - 0.4);
  /** 每个移动的东西（玩家的脚下位置向量）对应的导航状态 { floor, x, z, y, slope } */
  const tracked = new WeakMap();

  function locate(x, y, z) {
    return landAt(nav, x, z, y + 0.6);
  }
  function stateFor(pos) {
    let s = tracked.get(pos);
    // 第一次见到、或者被传送了（重生、换关）：重新找脚下的楼面
    if (!s || Math.hypot(s.x - pos.x, s.z - pos.z) > 1.5 || Math.abs(pos.y - s.y) > 6) {
      s = locate(pos.x, pos.y, pos.z) || s;
      if (s) tracked.set(pos, s);
    }
    return s;
  }
  function floorAt(x, y, z) {
    const s = locate(x, y, z);
    return s ? nav.floors.get(s.floor) : null;
  }

  const ray = { o: new THREE.Vector3(), d: new THREE.Vector3() };
  /** 射线和二维线段（竖直的面，底 y0、高 h）求交，返回距离或 Infinity */
  function hitSegment(ax, az, bx, bz, y0, h, maxDist, out) {
    const { o, d } = ray, ex = bx - ax, ez = bz - az, den = d.x * ez - d.z * ex;
    if (Math.abs(den) < 1e-9) return;
    const t = ((ax - o.x) * ez - (az - o.z) * ex) / den, u = ((ax - o.x) * d.z - (az - o.z) * d.x) / den;
    if (t <= 1e-4 || t >= out.dist || t > maxDist || u < 0 || u > 1) return;
    const y = o.y + d.y * t;
    if (y < y0 - 0.02 || y > y0 + h) return;
    // 法线朝着射线来的方向
    let nx = -ez, nz = ex; const len = Math.hypot(nx, nz) || 1; nx /= len; nz /= len;
    if (nx * d.x + nz * d.z > 0) { nx = -nx; nz = -nz; }
    out.dist = t; out.normal.set(nx, 0, nz); out.surface = 'concrete';
  }

  const physics = {
    nav,
    boxes: [],
    bounds: { min: new THREE.Vector3(-1e5, -1e5, -1e5), max: new THREE.Vector3(1e5, 1e5, 1e5) },
    addBox(min, max, opts = {}) { const b = { min: min.clone(), max: max.clone(), surface: opts.surface || 'concrete', tag: opts.tag || '', bulletOnly: !!opts.bulletOnly }; physics.boxes.push(b); return b; },
    removeBox(b) { const i = physics.boxes.indexOf(b); if (i >= 0) physics.boxes.splice(i, 1); },
    build() {},
    /** 导航状态（只读），给画面同步楼层可见性用 */
    stateOf(pos) { return tracked.get(pos) || null; },

    raycast(origin, dir, maxDist = 500) {
      ray.o.copy(origin); ray.d.copy(dir).normalize();
      const out = { dist: Infinity, normal: new THREE.Vector3(), surface: 'concrete', box: null };
      const F = floorAt(origin.x, origin.y, origin.z);
      if (F) {
        const h = floorHeight(F);
        for (const w of F.walls) hitSegment(w.x0, w.z0, w.x1, w.z1, F.y, h, maxDist, out);
        for (const o of F.obstacles) {
          const b = o.bb;
          // 包围盒都够不着就跳过（射线离得远的家具）
          const p = o.outer;
          if (!p || !b) continue;
          for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; hitSegment(a[0], a[1], c[0], c[1], F.y, OBSTACLE_HEIGHT, maxDist, out); }
        }
      }
      // 楼板：射线穿过某个楼面高度处，那里若是楼板实体就挡住
      if (Math.abs(ray.d.y) > 1e-6) for (const G of nav.floors.values()) {
        const t = (G.y - ray.o.y) / ray.d.y;
        if (t <= 1e-4 || t >= out.dist || t > maxDist) continue;
        const x = ray.o.x + ray.d.x * t, z = ray.o.z + ray.d.z * t;
        if (!supported(G, x, z)) continue;
        out.dist = t; out.normal.set(0, ray.d.y < 0 ? 1 : -1, 0); out.surface = 'concrete';
      }
      for (const b of physics.boxes) {
        const box = new THREE.Box3(b.min, b.max), p = new THREE.Ray(ray.o, ray.d).intersectBox(box, new THREE.Vector3());
        if (!p) continue;
        const t = p.distanceTo(ray.o);
        if (t < out.dist && t <= maxDist) { out.dist = t; out.surface = b.surface; out.box = b; out.normal.set(0, 1, 0); }
      }
      if (!Number.isFinite(out.dist)) return null;
      out.point = ray.o.clone().addScaledVector(ray.d, out.dist);
      return out;
    },
    lineOfSight(a, b) {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      if (len < 1e-4) return true;
      return !physics.raycast(a, d.multiplyScalar(1 / len), len - 0.05);
    },
    groundHeight(x, z, yMax = 50) {
      const s = landAt(nav, x, z, yMax);
      return s ? s.y : -50;
    },
    moveCapsule(pos, vel, dt, radius = 0.32, height = 1.8, stepUp = true) {
      const res = { onGround: false, hitWall: false, hitCeil: false, surface: 'concrete' };
      let s = stateFor(pos);
      if (!s) { pos.addScaledVector(vel, dt); return res; }
      const dx = vel.x * dt, dz = vel.z * dt, want = Math.hypot(dx, dz);
      if (want > 1e-6) {
        const n = Math.max(1, Math.ceil(want / 0.15)), x0 = s.x, z0 = s.z;
        for (let i = 0; i < n; i++) s = step(nav, s, dx / n, dz / n, dt / n);
        const gx = s.x - x0, gz = s.z - z0, got = Math.hypot(gx, gz);
        // 被墙挡住：速度换成实际走出去的那部分（贴着墙滑），和原游戏的处理一样
        if (got < want * 0.9 - 1e-4) { res.hitWall = true; vel.x = gx / dt; vel.z = gz / dt; }
      }
      tracked.set(pos, s);
      pos.x = s.x; pos.z = s.z;
      const ground = s.y, F = nav.floors.get(s.floor), ceil = ground + (F ? floorHeight(F) : 3);
      const y = pos.y + vel.y * dt;
      if (vel.y > 0 && y + height > ceil) { pos.y = ceil - height; vel.y = 0; res.hitCeil = true; }
      else if (y <= ground) { pos.y = ground; if (vel.y < 0) vel.y = 0; res.onGround = true; }
      else if (stepUp && vel.y <= 0 && y - ground < STEP_UP) { pos.y = ground; vel.y = 0; res.onGround = true; }
      else pos.y = y;
      return res;
    },
  };

  // 敌人用的寻路接口（第一轮还没有敌人；按楼面在我们的导航网格上找路）
  physics.nav = {
    cell: 0.8,
    isWalkable(x, z) { return !!landAt(nav, x, z, 1e4); },
    findPath(from, to) {
      const a = locate(from.x, from.y ?? 0, from.z), b = locate(to.x, to.y ?? 0, to.z);
      if (!a || !b) return null;
      const path = findPath(nav, a, b, { maxNodes: 2400, cellSize: 0.8 });
      return path ? path.map((p) => new THREE.Vector3(p.x, p.y ?? 0, p.z)) : null;
    },
    randomPoint(c, r) {
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * r, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        const s = locate(x, (c.y ?? 0) + 0.5, z);
        if (s && Math.abs(s.y - (c.y ?? s.y)) < 0.6) return new THREE.Vector3(x, s.y, z);
      }
      return new THREE.Vector3(c.x, c.y ?? 0, c.z);
    },
    clearLine(a, b) { return physics.lineOfSight(new THREE.Vector3(a.x, (a.y ?? 0) + 0.5, a.z), new THREE.Vector3(b.x, (b.y ?? 0) + 0.5, b.z)); },
  };
  physics.EYE = NAV.eye;
  return physics;
}
