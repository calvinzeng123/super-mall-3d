// 零点突围：地面上若隐若现的路线指引。
// 从玩家脚下沿导航网格（楼梯、扶梯都算）到最近一个还没完成的目标（中继、证物箱、情报箱；歼灭任务是最近的敌人，坚守任务是控制点）；
// 目标都完成了就指向撤离点。
// 物品在住户、客房、商铺里时，先寻路到门外，再从门口直线进房间。
// 画法：路线上每 1.4 米一个贴地的淡蓝色小箭头（加色、半透明），一道流光沿路往目标方向推；只画眼前 45 米左右。
// 每 1.5 秒最多重算一次路线，只在目标换了、或玩家离开路线 5 米以上时才重算。坐载具时不画。
import * as THREE from 'three';
import { findPath, traceMotion } from '../fps/pathfinding.js';
import { landAt, clear } from '../layout/nav.js';
import { pointInPoly } from '../layout/geom.js';
import { storeStyle, doorGaps } from '../layout/frontage.js';
import { routeHint } from './minimap.js';

// door：穿店门时门里门外各这么远一个点（从门洞正中直进直出）；landing：上下扶梯 / 楼梯、过门洞，两头先顺着梯子方向直走这么远再拐；bend：拐点往弯外挪这么远（照着箭头走的人会抄近路，贴着门框、店角、卷帘拐弯就蹭上去卡住）
export const GUIDE = Object.freeze({ spacing: 1.4, ahead: 45, count: 34, recompute: 1.5, stray: 5, speed: 7, color: '#9fe8ff', landing: 1.3, bend: 0.7, door: 1.0 });

/**
 * 物品在房间里：返回这一户入户门外的一点（走廊里、正对着门），没有入户门（复式上层）返回 null。
 * 门的位置用户型数据里的 entryDoor.at（沿门脸的位置）——以前取门脸中点，北区塔楼的门脸中点正对着电梯井，那一点根本站不了人，
 * 路线指引就指不到门口。给了 nav 就挑一个真站得住的距离；没有门的数据才退回门脸中点。
 */
export function doorOutside(layout, site, nav = null) {
  if (!site?.unit) return null;
  const lv = layout.levels.find((l) => l.id === site.floor), u = lv?.units?.find((q) => q.id === site.unit), f = u?.wfronts?.[0];
  if (!f) return null;
  // 目标本来就在店门外（丧尸围城撬卷帘救人：站在店门口撬）：不用先找门。以前照样取「离落点远的那一侧」，反倒取到了店里面，路线从锁着的店里穿
  if (!u.residence && u.polys?.length && !u.polys.some((p) => pointInPoly([site.x, site.z], p))) return null;
  // 商铺：门脸上真开着的门洞（和导航开的洞一样），挑离物品最近、门外站得住的那一个——以前取第一面门脸的中点，
  // 骑行家这种四面门脸的店，那一点外面可能是实墙，从那儿直线进店就顶在墙上
  if (!u.residence && nav) {
    let best = null;
    for (const d of doorwaysOf(layout, site.floor)) {
      if (!u.wfronts.some((w) => Math.abs((d.cx - w.x0) * w.nz - (d.cz - w.z0) * w.nx) < 0.05 && Math.min(w.x0, w.x1) - 0.05 <= d.cx && d.cx <= Math.max(w.x0, w.x1) + 0.05 && Math.min(w.z0, w.z1) - 0.05 <= d.cz && d.cz <= Math.max(w.z0, w.z1) + 0.05)) continue;
      const out = Math.hypot(d.cx + d.nx - site.x, d.cz + d.nz - site.z) > Math.hypot(d.cx - d.nx - site.x, d.cz - d.nz - site.z) ? 1 : -1;
      for (const k of [1.3, 1.0, 1.7]) {
        const st = landAt(nav, d.cx + d.nx * k * out, d.cz + d.nz * k * out, lv.elev + 0.6);
        if (!st || st.floor !== site.floor || !clear(nav, st)) continue;
        const dist = Math.hypot(d.cx - site.x, d.cz - site.z);
        if (!best || dist < best.dist) best = { dist, q: { floor: site.floor, x: st.x, z: st.z, y: lv.elev, slope: null } };
        break;
      }
    }
    if (best) return best.q;
  }
  const at = u.residence?.entryDoor?.at, L = Math.hypot(f.x1 - f.x0, f.z1 - f.z0) || 1;
  // 门脸在世界里是 (x0,z0) → (x1,z1)，对应户内坐标沿门脸从 fronts[0].x0 到 x1
  const lf = u.fronts?.[0], k = typeof at === 'number' && lf ? (at - lf.x0) / ((lf.x1 - lf.x0) || 1) : 0.5;
  const mx = f.x0 + (f.x1 - f.x0) * k, mz = f.z0 + (f.z1 - f.z0) * k;
  void L;
  // 外法线：离落点更远的那一侧
  const out = Math.hypot(mx + f.nx - site.x, mz + f.nz - site.z) > Math.hypot(mx - f.nx - site.x, mz - f.nz - site.z) ? 1 : -1;
  for (const d of [1.3, 1.0, 0.8, 1.7]) {
    const x = mx + f.nx * d * out, z = mz + f.nz * d * out;
    if (!nav) return { floor: site.floor, x, z, y: lv.elev, slope: null };
    const st = landAt(nav, x, z, lv.elev + 0.6);
    if (st && st.floor === site.floor && clear(nav, st)) return { floor: site.floor, x: st.x, z: st.z, y: lv.elev, slope: null };
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

/**
 * 寻路给的路线（导航状态，拐点和拐点之间是能直走的直线）照着箭头走得顺一点：
 * ① 上下扶梯 / 楼梯、过门洞（相邻两点不在同一层）：落地那头顺着梯子的方向再直走 landing 米才拐，上去那头也先对直了再上——
 *    以前一下扶梯就九十度拐弯，人还站在梯子尾巴上，往旁边一迈就被扶手挡住；
 * ② 拐点往弯外挪 bend 米（挪不动就少挪点）：箭头是贴着门框、店角拐的，人跟着走会抄近路，蹭到门框、卷帘就卡住。
 * 挪过、加过的点前后两段都要真走得通（walk：默认用玩家的碰撞试走；寻路服务给的还要绕开锁着的店）。纯函数，返回新的一串
 */
const doorCache = new WeakMap();
/** 这一层商铺门面上的门洞：[{ x0, z0, x1, z1（门洞两头）, cx, cz（中点）, nx, nz（门面法线）, w（宽） }]（和导航在门面上开的洞一样：nav.js） */
export function doorwaysOf(layout, floor) {
  if (!layout) return [];
  let byFloor = doorCache.get(layout); if (!byFloor) doorCache.set(layout, byFloor = new Map());
  let list = byFloor.get(floor); if (list) return list;
  list = [];
  const lv = layout.levels?.find((l) => l.id === floor);
  for (const u of lv?.units || []) {
    if (u.residence) continue;
    let style = null; try { style = storeStyle(lv, u); } catch { continue; }
    for (const f of u.wfronts || []) {
      const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0); if (len < 0.5) continue;
      const tx = (f.x1 - f.x0) / len, tz = (f.z1 - f.z0) / len;
      for (const [a, b] of doorGaps(style, len)) list.push({ x0: f.x0 + tx * a, z0: f.z0 + tz * a, x1: f.x0 + tx * b, z1: f.z0 + tz * b, cx: f.x0 + tx * (a + b) / 2, cz: f.z0 + tz * (a + b) / 2, nx: f.nx, nz: f.nz, w: b - a });
    }
  }
  byFloor.set(floor, list);
  return list;
}
const crossT = (a, b, d) => {
  const dx = b.x - a.x, dz = b.z - a.z, ex = d.x1 - d.x0, ez = d.z1 - d.z0, den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((d.x0 - a.x) * ez - (d.z0 - a.z) * ex) / den, u = ((d.x0 - a.x) * dz - (d.z0 - a.z) * dx) / den;
  return t > 0 && t < 1 && u >= -0.05 && u <= 1.05 ? t : -1;
};

/**
 * layout：给了就把穿过店门的那一段改成从门洞正中间直着进出（门里门外各 GUIDE.door 米一个点）——
 * 以前寻路是贴着门框斜着穿的，出门就拐，人跟着走蹭上门框、被卷帘挡住（意食、影城的门口都卡过）
 */
export function easeRoute(nav, pts, walk = (a, b) => !!traceMotion(nav, a, b), { landing = GUIDE.landing, bend = GUIDE.bend, layout = null, door = GUIDE.door } = {}) {
  if (!pts || pts.length < 2) return pts;
  const out = pts.slice(), flat = (q) => q && !q.via && !q.slope && !q.door;
  const ok = (q) => { const st = clear(nav, q); return !!st; };
  // ⓪ 过店门：从门洞正中直进直出
  if (layout) for (let k = 1; k < out.length; k++) {
    const a = out[k - 1], b = out[k];
    if (a.floor !== b.floor || a.via || b.via || a.door) continue;
    let best = null, bt = 2;
    for (const d of doorwaysOf(layout, a.floor)) { const t = crossT(a, b, d); if (t >= 0 && t < bt) { bt = t; best = d; } }
    if (!best) continue;
    const side = Math.sign((a.x - best.cx) * best.nx + (a.z - best.cz) * best.nz) || 1;
    // 从哪儿穿门洞：原来穿的那一点，但离门框至少 1.1 米（门洞窄就走正中）；
    // 进门 / 出门以后马上顺着门面往一边拐（拐过去的那一点在门洞外头）：从门洞离那一边远的那半边穿过去，拐个大弯，里侧的门框离得远
    const tx = (best.x1 - best.x0) / best.w, tz = (best.z1 - best.z0) / best.w, half = best.w / 2, m = Math.min(1.1, half);
    const tc = (q) => (q.x - best.cx) * tx + (q.z - best.cz) * tz, ta = tc(a), tb = tc(b), u0 = ta + (tb - ta) * bt;
    const clampU = (u) => Math.max(-half + m, Math.min(half - m, u)), off = Math.max(0, Math.min(1, half - 0.7));
    const big = Math.abs(tb) >= Math.abs(ta) ? tb : ta, small = big === tb ? ta : tb;
    const wide = Math.abs(big) > half && !(Math.sign(small) === Math.sign(big) && Math.abs(small) > 0.4) ? -Math.sign(big) * off : clampU(u0);
    let done = false;
    for (const [dd, u] of [[door, wide], [door * 0.7, wide], [door, clampU(u0)], [door * 0.7, clampU(u0)], [door * 0.7, 0]]) {
      const ox = best.cx + tx * u, oz = best.cz + tz * u;
      const p = { ...a, x: ox + best.nx * side * dd, z: oz + best.nz * side * dd, door: true }, q = { ...a, x: ox - best.nx * side * dd, z: oz - best.nz * side * dd, door: true };
      delete p.via; delete q.via;
      if (!(ok(p) && ok(q) && walk(a, p) && walk(p, q) && walk(q, b))) continue;
      out.splice(k, 0, p, q); k += 2; done = true;
      // 门洞前后贴着门面的那两个拐点（比门里门外那两点还靠门面）：去掉，不然出了门又往回折一下
      const nd = (r) => Math.abs((r.x - best.cx) * best.nx + (r.z - best.cz) * best.nz);
      // 现在 out[k - 3] = a、out[k - 2] = p（门这边）、out[k - 1] = q（门那边）、out[k] = b
      const nb = out[k + 1];
      if (nb && nb.floor === b.floor && !nb.via && nd(b) < dd && walk(q, nb)) out.splice(k, 1);
      const pa = out[k - 4];
      if (pa && pa.floor === a.floor && !pa.via && !pa.door && nd(a) < dd && walk(pa, p)) { out.splice(k - 3, 1); k--; }
      break;
    }
    void done;
  }
  for (let k = 1; k < out.length; k++) {
    const p = out[k - 1], q = out[k];
    if (p.floor === q.floor || q.via === 'lift' || p.via === 'lift') continue;
    const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz); if (len < 0.3) continue;
    const ux = dx / len, uz = dz / len;
    // 落地那头
    const n = out[k + 1];
    if (flat(n) && n.floor === q.floor && Math.hypot(n.x - q.x, n.z - q.z) > 0.5) {
      for (const d of [landing, landing * 0.6]) {
        const e = { ...q, x: q.x + ux * d, z: q.z + uz * d, slope: null }; delete e.via;
        if (ok(e) && walk(q, e) && walk(e, n)) { out.splice(k + 1, 0, e); break; }
      }
    }
    // 上去那头
    const b = out[k - 2];
    if (flat(b) && b.floor === p.floor && Math.hypot(b.x - p.x, b.z - p.z) > 0.5) {
      for (const d of [landing, landing * 0.6]) {
        const e = { ...p, x: p.x - ux * d, z: p.z - uz * d, slope: null }; delete e.via;
        if (ok(e) && walk(b, e) && walk(e, p)) { out.splice(k - 1, 0, e); k++; break; }
      }
    }
  }
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1], p = out[i], c = out[i + 1];
    if (!flat(p) || a.floor !== p.floor || c.floor !== p.floor || a.via || c.via || a.door || c.door) continue; // 门洞前后那两点不动（已经对直了）
    let ux = p.x - a.x, uz = p.z - a.z, vx = c.x - p.x, vz = c.z - p.z; const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    if (lu < 0.3 || lv < 0.3) continue;
    ux /= lu; uz /= lu; vx /= lv; vz /= lv;
    if (ux * vx + uz * vz > 0.94) continue; // 拐得不到 20°
    let ox = ux - vx, oz = uz - vz; const lo = Math.hypot(ox, oz); if (lo < 1e-6) continue; ox /= lo; oz /= lo; // 弯外：拐弯那一侧的反方向
    for (const d of [bend, bend * 0.6, bend * 0.3]) {
      const q = { ...p, x: p.x + ox * d, z: p.z + oz * d };
      if (ok(q) && walk(a, q) && walk(q, c)) { out[i] = q; break; }
    }
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

  let route = [], routeKey = null, key = '', wait = 0, t = 0, job = null, hint = null, last = null, nextStep = null, planAt = null, planFloor = null, nearS = 0;

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
      return { key: r.id, name: String(r.o.label || r.label || '目标').split(' · ')[0], floor: site.floor, x: r.o.pos.x, y: r.o.pos.y, z: r.o.pos.z, door: doorOutside(layout, site, nav) };
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
      const cut = pts.findIndex((p) => p.via === 'lift'), head = cut >= 0 ? pts.slice(0, cut) : pts.slice();
      // 物品在店里 / 户里：寻路到门外，再从门口直线进去（这一段也一起顺：穿门洞从正中过）
      if (cut < 0 && tg.door) head.push({ floor: tg.floor, x: tg.x, y: tg.y, z: tg.z, slope: null });
      const list = easeRoute(nav, head, pathfinder?.walkable, { layout }).map((s) => ({ x: s.x, y: s.y ?? 0, z: s.z }));
      hint = cut >= 0 ? { kind: 'lift', name: pts[cut].lift, from: pts[cut].from, to: pts[cut].to, x: pts[cut - 1].x, y: pts[cut - 1].y ?? 0, z: pts[cut - 1].z } : null;
      // 起点离电梯门口不到一步远时路线只有一个点：补一个点，照样画得出来
      if (list.length === 1) list.unshift({ x: from.x, y: from.y ?? list[0].y, z: from.z });
      route = resample(list); routeKey = tg.key;
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
    /** 现在这条路线是给哪个目标算的（target().key）；刚换了目标、新路线还没算出来时还是上一个 */
    get planned() { return routeKey; },
    /** 路线要坐电梯时：{ kind: 'lift', name, from, to, x, y, z }（电梯门口），否则 null */
    get hint() { return hint; },
    /** 下一步：{ kind: 'goal' | 'slope' | 'lift', dist, text, x, y, z }，距离随人往前走实时扣掉 */
    get next() {
      if (!nextStep || !planAt || !G.player) return nextStep;
      // 已经沿路线走了多远：离人最近的那个路线点的里程（路线画不出来时退回直线距离）
      const moved = route.length ? nearS : Math.hypot(G.player.pos.x - planAt.x, G.player.pos.z - planAt.z), left = Math.max(0, nextStep.dist - moved);
      return { ...nextStep, dist: left, text: nextStep.text.replace(/· \d+ 米$/, `· ${Math.max(1, Math.round(left))} 米`) };
    },
    reset() { job?.cancel(); job = null; route = []; routeKey = null; hint = null; nextStep = null; key = ''; wait = 0; mesh.count = 0; },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); } };
}
