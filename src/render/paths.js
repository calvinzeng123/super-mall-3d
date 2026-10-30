// 动线路径（数据驱动）：人流（商业街两侧往返、圆厅回游环、扶梯上下行、车位 → 电梯）、
// 车流（车库：坡道口 → 各翼外侧车道 → 圆厅环道，靠右行驶、逆时针绕圆厅）、货流（卸货区 → 北翼）。
// 每条路径为三维折线 [[x,y,z],...]，loop=true 表示闭合环线。动线箭头与行人、车辆动画共用。
import { frame, toW, toL, pointInPoly } from '../layout/geom.js';

const DEG = 180 / Math.PI;
const mod360 = (a) => ((a % 360) + 360) % 360;

function ring(cx, cz, r, y, n = 32) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
  }
  return pts;
}

/** 从角度 a0 递减到 a1 的圆弧点（右行车辆在本坐标系内逆时针绕圆厅） */
function arcDown(r, rad, a0, a1, y, step = 8) {
  const pts = [];
  let d = mod360(a0 - a1);
  if (d < 1) d += 360;
  const n = Math.max(2, Math.ceil(d / step));
  for (let i = 0; i <= n; i++) {
    const a = ((a0 - (d * i) / n) * Math.PI) / 180;
    pts.push([r.x + Math.cos(a) * rad, y, r.z + Math.sin(a) * rad]);
  }
  return pts;
}

const W3 = (F, u, v, y) => {
  const [x, z] = toW(F, u, v);
  return [x, y, z];
};

export function levelPaths(layout) {
  const out = {};
  const P = (id) => (out[id] = out[id] || { people: [], vehicle: [], goods: [] });
  const bById = Object.fromEntries(layout.buildings.map((b) => [b.id, b]));
  for (const lv of layout.levels) {
    const b = bById[lv.building];
    if (b.kind === 'street') {
      streetPaths(layout, b, lv, P(lv.id));
      continue;
    }
    if (b.kind === 'metro') {
      metroPaths(b, lv, P(lv.id));
      continue;
    }
    if (b.kind !== 'mall') continue;
    const y = lv.elev + 0.07;
    if (lv.kind === 'parking') {
      parkingPaths(layout, b, lv, P(lv.id));
      continue;
    }
    const roof = lv.kind === 'roof';
    for (const r of b.rotundas) P(lv.id).people.push({ loop: true, pts: ring(r.x, r.z, r.R - (roof ? 4 : 6.5), y), name: roof ? '天窗环廊' : '圆厅回游线' });
    for (const w of b.wings) {
      const u0 = w.R - 3;
      const u1 = w.link ? w.len - (w.R - 3) : w.uEnd - 3;
      for (const v of roof ? [-12, 12] : [-4.6, 4.6]) {
        P(lv.id).people.push({ loop: false, pts: [W3(w.F, u0, v, y), W3(w.F, u1, v, y)], name: roof ? '屋面步道' : '商业街' });
      }
    }
    for (const e of layout.entrances.filter((x) => x.level === lv.id)) {
      const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
      P(lv.id).people.push({ loop: false, pts: [[mx - e.nx * 1, y, mz - e.nz * 1], [mx - e.nx * 12, y, mz - e.nz * 12]], name: '入口 → 商场' });
    }
    // 方庭：环廊回游线 + 十字轴线（天台为平台环线）
    if (b.square) {
      const F = b.square.F;
      const ring = roof ? [[-50, -30], [10, -30], [30, -16], [30, 16], [-10, 30], [-50, 30]] : [[-41, -21], [41, -21], [41, 21], [-41, 21]];
      P(lv.id).people.push({ loop: true, pts: ring.map(([u, v]) => W3(F, u, v, y)), name: roof ? '方庭天台' : '方庭环廊' });
      if (!roof) {
        for (const [a, c] of [[[0, -36], [0, -21]], [[3, 36], [3, 21]], [[-56, 0], [-41, 0]], [[56, 0], [41, 0]]]) {
          P(lv.id).people.push({ loop: false, pts: [W3(F, a[0], a[1], y), W3(F, c[0], c[1], y)], name: '方庭入口 → 环廊' });
        }
      }
    }
  }
  // 扶梯：上行沿斜面向上，下行向下
  for (const e of layout.escalators) {
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    const a = [e.bottom.x - ux * 2.0, e.bottom.y + 1.35, e.bottom.z - uz * 2.0];
    const b = [e.bottom.x, e.bottom.y + 1.35, e.bottom.z];
    const c = [e.top.x, e.top.y + 1.35, e.top.z];
    const d = [e.top.x + ux * 2.0, e.top.y + 1.35, e.top.z + uz * 2.0];
    P(e.from).people.push({ loop: false, escalator: true, pts: e.dir === 'up' ? [a, b, c, d] : [d, c, b, a], name: e.dir === 'up' ? '扶梯上行' : '扶梯下行' });
  }
  return out;
}

/** 车库：车行环线（坡道口 → 每翼"外侧车道出、内侧车道回" → 圆厅环道）与车位 → 电梯步行线 */
function parkingPaths(layout, b, lv, P) {
  const y = lv.elev + 0.05;
  const ramps = layout.ramps.filter((r) => r.building === b.id);
  const inR = ramps.find((r) => r.type === 'street-in' && r.to.level === lv.id);
  const outR = ramps.find((r) => r.type === 'street-out' && r.from.level === lv.id);
  const r = b.rotundas[0];
  const terminal = b.wings.filter((w) => !w.link);
  if (b.rotundas.length === 1 && terminal.length) {
    // Only a wing-end ramp starts the loop; shared-garage gates join it elsewhere.
    const wingRamp = inR && b.wings.find((w) => w.F === inR.frame);
    const rampWing = wingRamp || terminal[0];
    const order = [...terminal].sort((p, q) => mod360(rampWing.F.deg - p.F.deg) - mod360(rampWing.F.deg - q.F.deg));
    const ringR = r.R - 9;
    const delta = (Math.atan2(15, ringR) * DEG);
    const pts = [];
    if (wingRamp) pts.push([inR.to.x, y, inR.to.z], W3(rampWing.F, rampWing.uEnd - 9, -3, y), W3(rampWing.F, rampWing.uEnd - 9, -15, y));
    const seq = [...order.slice(1), order[0]];
    let fromAng = rampWing.F.deg - delta;
    pts.push(W3(rampWing.F, r.R - 4, -15, y));
    for (const w of seq) {
      pts.push(...arcDown(r, ringR, fromAng, w.F.deg + delta, y));
      pts.push(W3(w.F, r.R - 4, 15, y), W3(w.F, w.uEnd - 9, 15, y));
      if (w === rampWing) {
        if (wingRamp && outR) pts.push(W3(w.F, w.uEnd - 9, 3, y), [outR.from.x, y, outR.from.z]);
        break;
      }
      pts.push(W3(w.F, w.uEnd - 9, -15, y), W3(w.F, r.R - 4, -15, y));
      fromAng = w.F.deg - delta;
    }
    P.vehicle.push({ loop: false, pts, name: '入场 → 推荐环线 → 出场' });
  } else if (b.rotundas.length === 2 && inR && outR) {
    // 两个圆厅（二期）：坡道喉部 → 中翼内侧车道向西 → 绕 A → 西翼往返 → 绕 A → 中翼外侧车道向东 → 绕 B → 东翼往返 → 绕 B → 中翼内侧车道回到喉部
    const [rA, rB] = b.rotundas;
    const link = b.wings.find((w) => w.link);
    const ends = b.wings.filter((w) => !w.link);
    const wA = ends.find((w) => w.rot === rA.id), wB = ends.find((w) => w.rot === rB.id);
    const ringR = rA.R - 7;
    const delta = Math.atan2(15, ringR) * DEG;
    const [iu] = [inR.lane.x0 + 2.5];
    const [ou] = [outR.lane.x0 + 2.5];
    const back = (w) => [W3(w.F, rA.R - 4, 15, y), W3(w.F, w.uEnd - 9, 15, y), W3(w.F, w.uEnd - 9, -15, y), W3(w.F, rA.R - 4, -15, y)];
    const pts = [
      [inR.to.x, y, inR.to.z], W3(link.F, iu, -15, y), W3(link.F, rA.R - 4, -15, y),
      ...arcDown(rA, ringR, 360 - delta, wA.F.deg + delta, y), ...back(wA),
      ...arcDown(rA, ringR, wA.F.deg - delta, delta, y),
      W3(link.F, rA.R - 4, 15, y), W3(link.F, link.len - (rB.R - 4), 15, y),
      ...arcDown(rB, ringR, 180 - delta, wB.F.deg + delta, y), ...back(wB),
      ...arcDown(rB, ringR, wB.F.deg - delta, 180 + delta, y),
      W3(link.F, link.len - (rB.R - 4), -15, y), W3(link.F, ou, -15, y), [outR.from.x, y, outR.from.z],
    ];
    P.vehicle.push({ loop: false, pts, name: '入场 → 推荐环线 → 出场' });
  }
  for (const e of layout.elevators) {
    if (e.type !== 'passenger' || !e.serves.includes(lv.id) || !e.id.endsWith('L1') || e.door === 'E' || e.door === 'W') continue;
    const s = e.door === 'N' ? -1 : 1;
    P.people.push({ loop: false, pts: [W3(e.frame, e.lu + 1.5, e.lv + s * 2.2, y + 0.02), W3(e.frame, e.lu + 1.5, e.lv + s * 8.5, y + 0.02), W3(e.frame, e.lu + 14, e.lv + s * 8.5, y + 0.02)], name: '电梯厅 → 步行脊' });
  }
}

/** 三期街区：1F 绕楼栋的街巷环线、楼上沿外挑连廊、屋顶露台环线；B1 单向车行回路与楼梯口步行线 */
function streetPaths(layout, b, lv, P) {
  const y = lv.elev + 0.07;
  const GAL = 2.5, BAY = 4;
  if (lv.kind === 'parking') {
    const yv = lv.elev + 0.05;
    const inR = layout.ramps.find((r) => r.building === b.id && r.type === 'street-in');
    const outR = layout.ramps.find((r) => r.building === b.id && r.type === 'street-out');
    if (inR && outR) {
      P.vehicle.push({
        loop: false, name: '入场 → 推荐环线 → 出场',
        pts: [[inR.to.x, yv, inR.to.z], [-237, yv, 110], [-237, yv, 128], [-43, yv, 128], [-43, yv, 96], [-237, yv, 96], [-237, yv, 100], [outR.from.x, yv, outR.from.z]],
      });
    }
    for (const k of b.kiosks) {
      const r = k.r;
      const dz = k.side === 'S' ? 1 : -1;
      const z = k.side === 'S' ? r.z1 : r.z0;
      const cx = (r.x0 + r.x1) / 2;
      P.people.push({ loop: false, name: '车位 → 楼梯口', pts: [[cx - 14, y, z + dz * 3], [cx, y, z + dz * 3], [cx, y, z + dz * 0.8]] });
    }
    for (const e of layout.elevators.filter((x) => x.exterior && x.serves.includes(lv.id))) {
      P.people.push({ loop: false, name: '车位 → 电梯厅', pts: [W3(e.frame, e.lu - 2.2, e.lv, y), W3(e.frame, e.lu - 4.5, e.lv, y), W3(e.frame, e.lu - 4.5, e.lv - 6, y)] });
    }
    return;
  }
  const others = (k) => [...b.blocks.filter((o) => o !== k).map((o) => o.poly), ...b.kiosks.map((o) => o.poly)];
  const clear = (pts, k) => {
    const obs = others(k);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const n = Math.ceil(Math.hypot(c[0] - a[0], c[2] - a[2]));
      for (let j = 0; j <= n; j++) {
        const p = [a[0] + ((c[0] - a[0]) * j) / n, a[2] + ((c[2] - a[2]) * j) / n];
        if (obs.some((o) => pointInPoly(p, o))) return false;
      }
    }
    return true;
  };
  for (const k of b.blocks) {
    const { h, w } = k;
    if (lv.short === '1F') {
      for (const off of [2.8, 1.8]) {
        const pts = [[-h - off, -w - off], [h + GAL + BAY + off, -w - off], [h + GAL + BAY + off, w + GAL + off], [-h - off, w + GAL + off]].map(([u, v]) => W3(k.F, u, v, y));
        if (!clear(pts, k)) continue;
        P.people.push({ loop: true, pts, name: '街巷漫游' });
        break;
      }
    } else if (lv.short === '3F' && k.floors === 2) {
      P.people.push({ loop: true, name: '屋顶露台', pts: [[-h + 1.8, -w + 1.8], [h + 1.3, -w + 1.8], [h + 1.3, w + 1.3], [-h + 1.8, w + 1.3]].map(([u, v]) => W3(k.F, u, v, y)) });
    } else {
      P.people.push({ loop: false, name: '外挑连廊', pts: [[-h + 0.8, w + 1.25], [h + 1.25, w + 1.25], [h + 1.25, -w + 0.8]].map(([u, v]) => W3(k.F, u, v, y)) });
    }
  }
}

/** 地铁：站台候车、站厅长廊与付费区回游、闸机进站、四条通道往返、出入口楼梯与上行扶梯 */
function metroPaths(b, lv, P) {
  const y = lv.elev + 0.07;
  const line = (pts, name, extra = {}) => P.people.push({ loop: false, name, pts: pts.map(([x, z, yy = y]) => [x, yy, z]), ...extra });
  if (lv.short === 'B2') {
    for (const s of [-1, 1]) {
      line([[-56, s * 3.9], [56, s * 3.9]], '站台候车');
      line([[56, s * 4.6], [-56, s * 4.6]], '站台候车');
    }
    return;
  }
  line([[-54, -8], [56, -8]], '站厅长廊');
  line([[56, -7], [-54, -7]], '站厅长廊');
  line([[-56, 8], [54, 8]], '站厅长廊');
  line([[54, 7], [-56, 7]], '站厅长廊');
  P.people.push({ loop: true, name: '付费区', pts: [[-30, y, -3.6], [30, y, -3.6], [30, y, 3.6], [-30, y, 3.6]] });
  line([[-58, 1.5], [-36, 1.5], [-27.5, 0.9]], '闸机进站');
  line([[58, -1.5], [36, -1.5], [27.5, -0.9]], '闸机进站');
  line([[-27.5, -0.9], [-36, -2.5], [-56, -2.5]], '闸机出站');
  line([[27.5, 0.9], [36, 2.5], [56, 2.5]], '闸机出站');
  for (const p of b.passages) {
    const u0 = Math.max(p.lpoly[0][0], p.lpoly[3][0]) - 4;
    const end = p.uEnd - 1.5;
    P.people.push({ loop: false, name: p.name, pts: [W3(p.F, u0, -1.4, y), W3(p.F, end, -1.4, y)] });
    P.people.push({ loop: false, name: p.name, pts: [W3(p.F, end, 1.4, y), W3(p.F, u0, 1.4, y)] });
  }
  for (const ex of b.exits) {
    const G = ex.kiosk.frame;
    const p = b.passages.find((q) => q.id === ex.passage);
    const [pu, pv] = toL(p.F, G.ox, G.oz);
    const side = Math.abs(pv) > 1;
    const [au, av] = toL(G, ...toW(p.F, side ? pu + 1.2 : pu - 8, 0));
    const T = (u, v, yy) => W3(G, u, v, yy);
    const run = ex.kiosk.run;
    P.people.push({ loop: false, name: `${ex.id} 口出站`, pts: [T(au, av, y), T(side ? -1.2 : au, -1.1, y), T(0, -1.1, y), T(run, -1.1, 0.07), T(run + 2.5, -1.1, 0.07)] });
    const rise = -lv.elev, er = rise * Math.sqrt(3);
    P.people.push({ loop: false, escalator: true, name: `${ex.id} 口扶梯`, pts: [T(-1.4, 1.9, lv.elev + 1.35), T(0.85, 1.9, lv.elev + 1.35), T(0.85 + er, 1.9, 1.35), T(0.85 + er + 2, 1.9, 1.35)] });
  }
}

/** 天桥：云环双向环线、四条连廊、落地塔扶梯 */
export function bridgePaths(br) {
  const y = br.y + 0.07;
  const people = [];
  for (const [r, name] of [[br.R - 1.2, '云环 · 内圈'], [br.R + 1.2, '云环 · 外圈']]) people.push({ loop: true, pts: ring(0, 0, r, y, 72), name });
  for (const k of br.links) people.push({ loop: false, name: k.name, pts: [W3(k.frame, k.u0 - 1, 0, y), W3(k.frame, k.u1 + (k.building ? 2 : 3), 0, y)] });
  for (const v of br.verticals.filter((x) => x.type === 'escalator')) {
    const T = (lu, lv, yy) => W3(v.frame, lu, lv, yy);
    const s = Math.sign(v.bottom.lv - v.top.lv);
    const a = T(v.lu, v.bottom.lv + s * 2, 1.35), b2 = T(v.lu, v.bottom.lv, 1.35), c = T(v.lu, v.top.lv, br.y + 1.35), d = T(v.lu, v.top.lv - s * 2, br.y + 1.35);
    people.push({ loop: false, escalator: true, name: v.dir === 'up' ? '扶梯上行' : '扶梯下行', pts: v.dir === 'up' ? [a, b2, c, d] : [d, c, b2, a] });
  }
  return people;
}

/** 场地动线：车库进出（含坡道）、人行至各入口、货车至卸货区 */
export function sitePaths(layout) {
  const y = -0.08;
  const vehicle = [];
  const garage = {};
  for (const b of layout.buildings) {
    const inR = layout.ramps.find((r) => r.building === b.id && r.type === 'street-in');
    const outR = layout.ramps.find((r) => r.building === b.id && r.type === 'street-out');
    if (!inR || !outR) continue;
    const dirIn = [inR.from.x - inR.to.x, inR.from.z - inR.to.z];
    const li = Math.hypot(...dirIn);
    const dirOut = [outR.to.x - outR.from.x, outR.to.z - outR.from.z];
    const lo = Math.hypot(...dirOut);
    const pin = { loop: false, name: '车库入口', pts: [[inR.from.x + (dirIn[0] / li) * 22, y, inR.from.z + (dirIn[1] / li) * 22], [inR.from.x, inR.from.y + 0.05, inR.from.z], [inR.to.x, inR.to.y + 0.05, inR.to.z]] };
    const pout = { loop: false, name: '车库出口', pts: [[outR.from.x, outR.from.y + 0.05, outR.from.z], [outR.to.x, outR.to.y + 0.05, outR.to.z], [outR.to.x + (dirOut[0] / lo) * 22, y, outR.to.z + (dirOut[1] / lo) * 22]] };
    vehicle.push(pin, pout);
    garage[b.id] = { in: pin, out: pout };
  }
  const people = [];
  for (const e of layout.entrances) {
    if (e.to !== 'site') continue;
    if (e.kiosk) {
      // 地铁出入口：从广场走进雨棚、下楼梯到站厅层
      const T = (u, v, yy) => W3(e.kiosk.frame, u, v, yy);
      const r = e.kiosk.run;
      people.push({ loop: false, name: `进站 · ${e.name}`, pts: [T(r + 22, -1.1, y), T(r + 2.5, -1.1, y), T(r, -1.1, 0), T(0, -1.1, -e.kiosk.rise + 0.07), T(-1.5, -1.1, -e.kiosk.rise + 0.07)] });
      continue;
    }
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    people.push({ loop: false, name: `前往${e.name}`, pts: [[mx + e.nx * 26, y, mz + e.nz * 26], [mx + e.nx * 1, y, mz + e.nz * 1]] });
  }
  for (const c of layout.site.crossings) {
    const r = c.rect;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    people.push({ loop: false, name: '过街', pts: c.axis === 'z' ? [[cx, y, r.z0 - 3], [cx, y, r.z1 + 3]] : [[r.x0 - 3, y, cz], [r.x1 + 3, y, cz]] });
  }
  if (layout.bridges) people.push(...bridgePaths(layout.bridges));
  const goods = [];
  const p1 = layout.buildings.find((b) => b.id === 'P1');
  if (p1) {
    const N = p1.wings.find((w) => w.id === 'N');
    goods.push({ loop: false, name: '货车 → 卸货区', pts: [[-20, y, -262], W3(N.F, N.uEnd + 60, 12, y), W3(N.F, N.uEnd + 16, 12, y), W3(N.F, N.uEnd + 2, 12, y)] });
  }
  return { vehicle, people, goods, garage };
}

/** 折线长度与按距离取点 */
export function polyline(pts, loop) {
  const segs = [];
  let total = 0;
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return {
    total,
    segs,
    at(d, out = [0, 0, 0], dir = [0, 0, 1]) {
      const s = loop ? ((d % total) + total) % total : Math.max(0, Math.min(total, d));
      let seg = segs[segs.length - 1];
      for (const g of segs) {
        if (s <= g.start + g.len) { seg = g; break; }
      }
      const t = seg.len ? (s - seg.start) / seg.len : 0;
      out[0] = seg.a[0] + (seg.b[0] - seg.a[0]) * t;
      out[1] = seg.a[1] + (seg.b[1] - seg.a[1]) * t;
      out[2] = seg.a[2] + (seg.b[2] - seg.a[2]) * t;
      const l = seg.len || 1;
      dir[0] = (seg.b[0] - seg.a[0]) / l;
      dir[1] = (seg.b[1] - seg.a[1]) / l;
      dir[2] = (seg.b[2] - seg.a[2]) / l;
      return out;
    },
  };
}

void frame;
