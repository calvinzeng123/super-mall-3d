// 零点突围：地面上若隐若现的路线指引。
// 从玩家脚下沿导航网格（楼梯、扶梯都算）到最近一个还没完成的目标（中继、证物箱、情报箱；歼灭任务是最近的敌人，坚守任务是控制点）；
// 目标都完成了就指向撤离点。
// 物品在住户、客房、商铺里时，先寻路到门外，再从门口直线进房间。
// 画法：路线上每 1.4 米一个贴地的淡蓝色小箭头（加色、半透明），一道流光沿路往目标方向推；只画眼前 45 米左右。
// 每 1.5 秒最多重算一次路线，只在目标换了、或玩家离开路线 5 米以上时才重算。坐载具时不画。
import * as THREE from 'three';
import { findPath } from '../fps/pathfinding.js';
import { landAt, clear } from '../layout/nav.js';
import { routeHint } from './minimap.js';

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

export function createRouteGuide(G, { scene, layout, nav, hidden = () => false, pathfinder = null }) {
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

  let route = [], key = '', wait = 0, t = 0, job = null, hint = null, last = null, nextStep = null, planAt = null, planFloor = null, nearS = 0;

  /** 现在该去哪：没完成的目标里离玩家最近的；都完成了去撤离点 */
  function target() {
    const run = G.game?.run, p = G.player?.pos;
    if (!run || !p) return null;
    // 任务自己指定的目标（missions.js：歼灭指向最近的敌人、坚守指向控制点）；undefined 时照下面的规则
    const custom = G.level?.guideTarget?.();
    if (custom !== undefined) return custom;
    if (!run.allCut) {
      const open = (run.relays || []).filter((r) => !r.cut && r.o?.pos && !r.o.locked); // locked：还没放出来的目标（丧尸围城一步一步来）
      if (!open.length) return null;
      const r = open.sort((a, b) => a.o.pos.distanceTo(p) - b.o.pos.distanceTo(p))[0], site = r.o.site || { floor: r.o.zone, x: r.o.pos.x, z: r.o.pos.z };
      return { key: r.id, name: String(r.o.label || r.label || '目标').split(' · ')[0], floor: site.floor, x: r.o.pos.x, y: r.o.pos.y, z: r.o.pos.z, door: doorOutside(layout, site) };
    }
    const x = G.level?.extraction;
    if (!x?.pos) return null;
    const st = landAt(nav, x.pos.x, x.pos.z, x.pos.y + 0.6);
    return st ? { key: 'extract', name: x.label || '撤离点', floor: st.floor, x: x.pos.x, y: x.pos.y, z: x.pos.z, door: null } : null;
  }

  /** 排一条路（分帧寻路，pathfinder.js；把电梯也算进去）。算出来以前旧路线照画 */
  function plan(tg) {
    const from = G.physics?.stateOf?.(G.player.pos);
    if (from) { planAt = { x: from.x, z: from.z }; if (!from.slope) planFloor = from.floor; }
    const goal = tg.door || { floor: tg.floor, x: tg.x, z: tg.z, y: tg.y, slope: null };
    job?.cancel(); job = null;
    if (!from || from.slope || !clear(nav, goal)) { if (!from || !clear(nav, goal)) { route = []; hint = null; } return; }
    const done = (pts) => {
      job = null;
      if (!pts || !pts.length) { route = []; hint = null; nextStep = null; return; }
      // 路线里有电梯：箭头只画到电梯门口，后面的等坐上去、到了那一层再重新算
      // 下一步怎么走（小地图下面那行字）：第一次换楼层的地方、怎么换、还有多远
      nextStep = routeHint(nav, layout, pts, tg.name || '目标');
      const cut = pts.findIndex((p) => p.via === 'lift'), list = (cut >= 0 ? pts.slice(0, cut) : pts).map((s) => ({ x: s.x, y: s.y ?? 0, z: s.z }));
      hint = cut >= 0 ? { kind: 'lift', name: pts[cut].lift, from: pts[cut].from, to: pts[cut].to, x: pts[cut - 1].x, y: pts[cut - 1].y ?? 0, z: pts[cut - 1].z } : null;
      if (cut < 0 && tg.door) list.push({ x: tg.x, y: tg.y, z: tg.z });
      // 起点离电梯门口不到一步远时路线只有一个点：补一个点，照样画得出来
      if (list.length === 1) list.unshift({ x: from.x, y: from.y ?? list[0].y, z: from.z });
      route = resample(list);
    };
    if (pathfinder) job = pathfinder.request(from, goal, done, { lifts: true, urgent: true });
    else done(findPath(nav, from, goal));
  }

  function update(dt) {
    t += dt; wait -= dt;
    const playing = G.game?.state === 'playing' && G.player?.alive !== false && !hidden();
    const tg = playing ? target() : null;
    last = tg;
    if (!tg) { mesh.count = 0; route = []; hint = null; nextStep = null; key = ''; job?.cancel(); job = null; return; }
    const p = G.player.pos;
    // 离路线最近的点（只在前面一段里找）
    let near = 0, nd = Infinity;
    for (let i = 0; i < route.length; i++) { const d = Math.hypot(route[i].x - p.x, route[i].z - p.z) + Math.abs(route[i].y - p.y) * 2; if (d < nd) { nd = d; near = i; } }
    nearS = route[near]?.s ?? 0;
    // 换了一层（上完扶梯、出了电梯）：路线的第一段已经走完，重新算（下一步的提示也跟着换）
    const cur = G.physics?.stateOf?.(p), floorChanged = !!cur && !cur.slope && planFloor != null && cur.floor !== planFloor;
    if (wait <= 0 && !job && (tg.key !== key || nd > GUIDE.stray || !route.length || floorChanged)) {
      wait = GUIDE.recompute;
      key = tg.key; plan(tg);
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

  return { mesh, update, get route() { return route; }, get target() { return last; },
    /** 路线要坐电梯时：{ kind: 'lift', name, from, to, x, y, z }（电梯门口），否则 null */
    get hint() { return hint; },
    /** 下一步：{ kind: 'goal' | 'slope' | 'lift', dist, text, x, y, z }，距离随人往前走实时扣掉 */
    get next() {
      if (!nextStep || !planAt || !G.player) return nextStep;
      // 已经沿路线走了多远：离人最近的那个路线点的里程（路线画不出来时退回直线距离）
      const moved = route.length ? nearS : Math.hypot(G.player.pos.x - planAt.x, G.player.pos.z - planAt.z), left = Math.max(0, nextStep.dist - moved);
      return { ...nextStep, dist: left, text: nextStep.text.replace(/· \d+ 米$/, `· ${Math.max(1, Math.round(left))} 米`) };
    },
    reset() { job?.cancel(); job = null; route = []; hint = null; nextStep = null; key = ''; wait = 0; mesh.count = 0; },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); } };
}
