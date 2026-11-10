// 空域：飞行类小游戏（无人机、滑翔）共用的简化三维碰撞。
// 每层楼是一个多边形柱体（外轮廓 × 层高），再加周边城市的楼、被裁地块的体块、天桥和桥面。
// 只回答三件事：这个球碰到实体了吗；正下方最高的面有多高；这一步能走到哪。
import { pointInPoly, polyArea, polyBounds, distToPolyEdge, lrectPoly, rectPoly } from '../layout/geom.js';

const CELL = 24;

function circlePoly(cx, cz, r, n = 20) {
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cz + r * Math.sin((i / n) * Math.PI * 2)]);
}

/** 从布局收集实体：{ poly, y0, y1, tag }。 */
export function airSolids(layout) {
  const out = [];
  // 高度取到毫米：层高相加的浮点尾数（71.10000000000001）不该让“刚好落在楼顶”变成“卡进楼里”
  const mm = (n) => Math.round(n * 1000) / 1000;
  const push = (poly, y0, y1, tag) => { if (poly?.length >= 3 && y1 > y0) out.push({ poly, y0: mm(y0), y1: mm(y1), tag }); };
  const byId = Object.fromEntries(layout.buildings.map((b) => [b.id, b]));
  for (const lv of layout.levels) {
    const b = byId[lv.building];
    if (!b || b.kind === 'metro' || b.undergroundOnly) continue;
    if (lv.kind === 'roof') {
      // 屋面本身是下一层柱体的顶；这里只收屋面上的大件
      for (const f of lv.features || []) {
        if (f.type === 'art-dome') push(circlePoly(f.cx, f.cz, f.radius), lv.elev, lv.elev + f.spring + f.rise * 0.85, f.id);
        else if (f.type === 'glass-canopy') push(rectPoly(f.rect), lv.elev + f.eave - 0.3, lv.elev + f.ridge, f.id);
        else if (f.type === 'pavilion' && f.rect && f.frame) push(lrectPoly(f.frame, f.rect), lv.elev, lv.elev + 4, `${lv.id}-pavilion`);
      }
      continue;
    }
    const y1 = lv.elev + lv.height;
    if (y1 <= 0.05) continue; // 地下层
    const polys = b.kind === 'tower' ? [lv.outline]
      : lv.expansion?.facadePolys?.length ? lv.expansion.facadePolys
        : (lv.slab?.pieces || []).map((p) => p.outer).filter((p) => p?.length >= 3 && Math.abs(polyArea(p)) > 30);
    for (const poly of polys.length ? polys : [lv.outline]) push(poly, Math.max(0, lv.elev), y1, lv.id);
  }
  for (const c of layout.site?.urban?.buildings || []) push(c.poly, 0, c.h, c.id);
  for (const m of layout.arcade?.massing || []) push(m.poly, m.y0, m.y1, m.id);
  const br = layout.bridges;
  if (br?.walk) for (const w of br.walk) push(w.poly, br.y - br.thick, br.y + 1.1, `bridge-${w.id}`);
  for (const d of layout.site?.river?.bridges || []) {
    const soffit = d.soffit ?? -2.4, top = d.deckTop ?? 0;
    push(rectPoly(d.deck), soffit, top + 1.1, d.id); // 桥面连栏杆；桥下留空，可以钻过去
  }
  return out;
}

export function buildAirspace(layout) {
  const solids = airSolids(layout).map((s) => ({ ...s, ...polyBounds(s.poly) }));
  const grid = new Map();
  for (const s of solids) {
    for (let ix = Math.floor(s.x0 / CELL); ix <= Math.floor(s.x1 / CELL); ix++) {
      for (let iz = Math.floor(s.z0 / CELL); iz <= Math.floor(s.z1 / CELL); iz++) {
        const k = `${ix},${iz}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(s);
      }
    }
  }
  const water = layout.site?.river?.water || null;
  const bounds = layout.site?.bounds || { x0: -1000, z0: -1000, x1: 1000, z1: 1000 };
  const near = (x, z, r = 0) => {
    const ix0 = Math.floor((x - r) / CELL), ix1 = Math.floor((x + r) / CELL), iz0 = Math.floor((z - r) / CELL), iz1 = Math.floor((z + r) / CELL);
    if (ix0 === ix1 && iz0 === iz1) return grid.get(`${ix0},${iz0}`) || [];
    const set = new Set();
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) for (const s of grid.get(`${ix},${iz}`) || []) set.add(s);
    return [...set];
  };
  const inside = (s, x, z, r) => x >= s.x0 - r && x <= s.x1 + r && z >= s.z0 - r && z <= s.z1 + r
    && (pointInPoly([x, z], s.poly) || (r > 0 && distToPolyEdge([x, z], s.poly) < r));

  /** 地面高度：一般是 0，江面上是水面。 */
  const ground = (x, z) => (water && pointInPoly([x, z], water.poly) ? water.y : 0);

  /** 球心 (x, y, z)、半径 r 是否碰到实体（地面另算）。返回碰到的实体或 null。 */
  function hit(x, y, z, r = 0) {
    for (const s of near(x, z, r)) if (y + r > s.y0 && y - r < s.y1 && inside(s, x, z, r)) return s;
    return null;
  }

  /** 正下方（不高于 y）最高的面：楼顶、桥面或地面。 */
  function surfaceBelow(x, z, y = Infinity) {
    let best = ground(x, z);
    for (const s of near(x, z)) if (s.y1 <= y + 1e-6 && s.y1 > best && inside(s, x, z, 0)) best = s.y1;
    return best;
  }

  /**
   * 球从 p 走 d：整步走不通就分轴滑动。返回 { x, y, z, bumped, grounded }。
   * bumped：有水平方向被挡；grounded：落在某个面上（往下走被挡）。
   */
  function move(p, d, r) {
    const free = (x, y, z) => y - r >= ground(x, z) - 1e-6 && !hit(x, y, z, r)
      && x > bounds.x0 && x < bounds.x1 && z > bounds.z0 && z < bounds.z1;
    let { x, y, z } = p, bumped = false, grounded = false;
    if (free(x + d.x, y + d.y, z + d.z)) return { x: x + d.x, y: y + d.y, z: z + d.z, bumped, grounded };
    if (d.y) {
      if (free(x, y + d.y, z)) y += d.y;
      else if (d.y < 0) { grounded = true; y = Math.max(y + d.y, surfaceBelow(x, z, y) + r); if (!free(x, y, z)) y = p.y; }
    }
    if (d.x) { if (free(x + d.x, y, z)) x += d.x; else bumped = true; }
    if (d.z) { if (free(x, y, z + d.z)) z += d.z; else bumped = true; }
    return { x, y, z, bumped, grounded };
  }

  return { solids, ground, hit, surfaceBelow, move, bounds };
}
