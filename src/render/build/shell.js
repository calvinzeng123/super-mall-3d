// 建筑主体：楼板拼块（shell 组）、柱、洞口栏板、剖切矮墙、地下挡土墙、外立面（沿外轮廓任意边生成）、
// 屋面（女儿墙、圆厅玻璃拱顶、商业街天窗）、楼名与 LED 屏、楼板下筒灯。
import * as THREE from 'three';
import { pointInPoly, distToPolyEdge, frame, toW, toL, lrectPoly } from '../../layout/geom.js';
import { themeOf, COLORS } from '../theme.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';

export const SLAB_T = { retail: 0.45, food: 0.45, parking: 0.35, roof: 0.6, street: 0.4 };
const DEG = 180 / Math.PI;

export function shapeFromPoly(outer, holes = []) {
  const s = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return s;
}
export function flatShapeGeometry(shape, y) {
  const g = new THREE.ShapeGeometry(shape, 6);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
function slabGeometry(shape, top, t) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, top - t, 0);
  return g;
}

/** 楼层上方楼板厚度（作为本层净高的扣减） */
export function clearHeight(lv) {
  return lv.height - 0.5;
}

/** 外轮廓的边：每条边一个局部坐标系（u 沿边、+v 指向楼外），附带长度与类型 */
export function outlineEdges(poly, building) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i], p1 = poly[(i + 1) % poly.length];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (len < 0.05) continue;
    const deg = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * DEG;
    let F = frame(p0[0], p0[1], deg);
    // 让 +v 指向楼外
    const [mx, mz] = toW(F, len / 2, 0.3);
    if (pointInPoly([mx, mz], poly)) F = frame(p1[0], p1[1], deg + 180);
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    let kind = 'side';
    for (const r of building ? building.rotundas : []) {
      const d0 = Math.hypot(p0[0] - r.x, p0[1] - r.z) - r.R, d1 = Math.hypot(p1[0] - r.x, p1[1] - r.z) - r.R;
      if (Math.abs(d0) < 0.05 && Math.abs(d1) < 0.05 && len < 4) kind = 'arc';
    }
    if (kind === 'side' && building) {
      for (const w of building.wings) {
        if (w.link) continue;
        const [u, v] = toL(w.F, mid[0], mid[1]);
        if (Math.abs(u - w.uEnd) < 0.1 && Math.abs(v) < 23.1) kind = 'end';
      }
    }
    out.push({ F, len, mid, kind });
  }
  return out;
}

export function buildShell(ctx) {
  const { layout, mats } = ctx;
  const slabBody = new THREE.MeshStandardMaterial({ color: 0xdcdcd8, roughness: 0.9 });
  mats.onNight((t) => slabBody.emissive.setRGB(t * 0.12, t * 0.11, t * 0.1));
  const edgesCache = new Map();
  ctx.outlineEdges = (lv) => {
    if (!edgesCache.has(lv.id)) edgesCache.set(lv.id, outlineEdges(lv.outline, ctx.bById[lv.building]));
    return edgesCache.get(lv.id);
  };

  for (const lv of layout.levels) {
    const L = ctx.levels[lv.id];
    const t = SLAB_T[lv.kind] || 0.45;
    const floorMat = mats.floor(lv.theme.floor, lv.kind === 'parking' ? 0.62 : lv.kind === 'street' ? 0.78 : lv.short === '1F' ? 0.2 : 0.42);
    for (const piece of lv.slab.pieces) {
      const shape = shapeFromPoly(piece.outer, piece.holes);
      const top = new THREE.Mesh(flatShapeGeometry(shape, lv.elev), floorMat);
      top.receiveShadow = true;
      top.name = 'floor';
      // 楼板体顶面比地面低 3cm：远景时两者不会深度冲突
      const body = new THREE.Mesh(slabGeometry(shape, lv.elev - 0.03, t), slabBody);
      body.castShadow = true;
      body.receiveShadow = true;
      L.shell.add(top, body);
    }
    const b = ctx.bById[lv.building];
    if (b.kind !== 'mall') continue;
    if (lv.kind === 'retail' || lv.kind === 'food') {
      columns(ctx, lv);
      railings(ctx, lv);
    }
    if (lv.kind === 'roof') {
      railings(ctx, lv);
      roofTop(ctx, lv);
    }
    if (lv.elev >= 0 && lv.kind === 'retail') facade(ctx, lv);
    if (lv.elev < 0) retaining(ctx, lv);
    sill(ctx, lv);
  }
  for (const b of layout.buildings) if (b.kind === 'mall') signage(ctx, b);
  ceilingLights(ctx);
}

/** 楼板底面的灯具：商业层为筒灯点阵，停车层为沿车道的灯管（随上层楼板显示，从下方可见） */
function ceilingLights(ctx) {
  for (const B of Object.values(ctx.buildings)) {
    const levels = B.levels.map((L) => L.lv);
    for (let i = 1; i < levels.length; i++) {
      const above = levels[i], below = levels[i - 1];
      const Bt = ctx.levels[above.id].batch;
      const y = above.elev - (SLAB_T[above.kind] || 0.45) - 0.04;
      const inVoid = (x, z) => above.voids.some((v) => pointInPoly([x, z], v.poly));
      const seen = new Set();
      const once = (x, z, k = 2) => {
        const key = `${Math.round(x / k)},${Math.round(z / k)}`;
        if (seen.has(key) || inVoid(x, z)) return false;
        seen.add(key);
        return true;
      };
      if (below.kind === 'parking') {
        for (const w of below.walk) {
          if (w.kind !== 'aisle' || !w.rect) continue;
          const r = w.rect;
          const alongU = r.x1 - r.x0 > r.z1 - r.z0;
          const len = alongU ? r.x1 - r.x0 : r.z1 - r.z0;
          for (let t = 3; t < len - 1; t += 6) {
            const lu = alongU ? r.x0 + t : (r.x0 + r.x1) / 2, lv = alongU ? (r.z0 + r.z1) / 2 : r.z0 + t;
            const [x, z] = toW(w.frame, lu, lv);
            if (!once(x, z, 3)) continue;
            Bt.frame(w.frame, () => Bt.get('glow').box(lu, y, lv, alongU ? 1.4 : 0.14, 0.06, alongU ? 0.14 : 1.4, '#eef6ff'));
          }
        }
      } else if (below.kind !== 'roof') {
        for (const w of below.walk) {
          if (w.outdoor) continue;
          const xs = w.poly.map((p) => p[0]), zs = w.poly.map((p) => p[1]);
          for (let x = Math.ceil(Math.min(...xs) / 4) * 4; x < Math.max(...xs); x += 4) {
            for (let z = Math.ceil(Math.min(...zs) / 4) * 4; z < Math.max(...zs); z += 4) {
              if (!pointInPoly([x, z], w.poly) || distToPolyEdge([x, z], w.poly) < 0.8) continue;
              if (!once(x, z)) continue;
              Bt.get('glow').cyl(x, y - 0.03, z, 0.2, 0.04, '#fff3dc', 8);
            }
          }
        }
      }
    }
  }
}

/** 店面分隔线上的柱子（外墙上的跳过） */
function columns(ctx, lv) {
  const L = ctx.levels[lv.id];
  const B = L.batch;
  const seen = new Set();
  const h = clearHeight(lv);
  const th = themeOf(lv);
  for (const u of lv.units) {
    for (const f of u.fronts) {
      for (const [a, b] of [[f.x0, f.z0], [f.x1, f.z1]]) {
        const [x, z] = toW(u.frame, a, b);
        const k = `${x.toFixed(1)},${z.toFixed(1)}`;
        if (seen.has(k) || distToPolyEdge([x, z], lv.outline) < 0.6) continue;
        seen.add(k);
        B.frame(u.frame, () => {
          B.get('satin').box(a, lv.elev + h / 2, b, 0.7, h, 0.7, th.column);
          B.get('metal').box(a, lv.elev + 0.06, b, 0.78, 0.12, 0.78, th.trim);
        });
      }
    }
  }
}

/** 定向矩形（世界坐标）：从 p 沿方向 (ux,uz) 的 [a,b] 段，半宽 hw */
function orientedRect(px, pz, ux, uz, a, b, hw) {
  const nx = -uz, nz = ux;
  return [
    [px + ux * a - nx * hw, pz + uz * a - nz * hw], [px + ux * b - nx * hw, pz + uz * b - nz * hw],
    [px + ux * b + nx * hw, pz + uz * b + nz * hw], [px + ux * a + nx * hw, pz + uz * a + nz * hw],
  ];
}

/** 洞口玻璃栏板（扶梯落点、观光梯门口处断开） */
function railings(ctx, lv) {
  const B = ctx.levels[lv.id].batch;
  const gaps = [];
  for (const e of ctx.layout.escalators) {
    if (e.to !== lv.id) continue;
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    gaps.push(orientedRect(e.top.x, e.top.z, ux, uz, -0.6, 2.6, e.width / 2 + 0.25));
  }
  for (const g of ctx.layout.elevators) {
    if (g.type !== 'glass' || !g.serves.includes(lv.id)) continue;
    gaps.push(lrectPoly(g.frame, { x0: g.lu - 2.2, x1: g.lu + 2.2, z0: g.lv - 1.9, z1: g.lv + 1.9 }));
  }
  const th = themeOf(lv);
  for (const v of lv.voids) {
    if (v.kind === 'shaft' || v.kind === 'skylight' || v.kind === 'ramp') continue;
    const P = v.poly;
    for (let i = 0; i < P.length; i++) {
      const [x0, z0] = P[i];
      const [x1, z1] = P[(i + 1) % P.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      const n = Math.max(1, Math.ceil(len / 1.6));
      const ang = Math.atan2(-(z1 - z0), x1 - x0);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const mx = x0 + (x1 - x0) * t, mz = z0 + (z1 - z0) * t;
        if (gaps.some((g) => pointInPoly([mx, mz], g))) continue;
        const pl = len / n + 0.02;
        B.get('glass').box(mx, lv.elev + 0.62, mz, pl, 1.0, 0.03, 0xffffff, ang);
        B.get('metal').box(mx, lv.elev + 1.12, mz, pl, 0.06, 0.09, th.trim, ang);
        B.get('satin').box(mx, lv.elev + 0.07, mz, pl, 0.14, 0.24, th.column, ang);
      }
    }
  }
}

/** 楼层外墙在剖切状态下的矮墙轮廓（立面隐藏时仍能看出边界） */
function sill(ctx, lv) {
  const B = ctx.levels[lv.id].batch;
  const c = lv.kind === 'parking' || lv.kind === 'food' ? COLORS.concrete : COLORS.stone;
  const h = lv.kind === 'roof' ? 0.3 : 0.9;
  const key = lv.kind === 'roof' ? 'satin' : 'matte';
  for (const e of ctx.outlineEdges(lv)) {
    B.frame(e.F, () => B.get(key).box(e.len / 2, lv.elev + h / 2, -0.15, e.len + 0.02, h, 0.3, c));
  }
}

/** 地下室挡土墙（立面组，聚焦时隐藏） */
function retaining(ctx, lv) {
  const F = ctx.levels[lv.id].facadeBatch;
  const h = lv.height;
  for (const e of ctx.outlineEdges(lv)) {
    F.frame(e.F, () => F.get('ext').box(e.len / 2, lv.elev + h / 2 - 0.05, 0.2, e.len + 0.4, h, 0.4, '#9fa5ab'));
  }
}

// ---------- 外立面 ----------

/** 各期外立面配色：一期暖米色石材；二期深灰金属板 + 金色竖向百叶 */
const PALETTE = {
  P1: { stone: COLORS.stone, stoneDark: COLORS.stoneDark, spandrel: COLORS.spandrel, frame: COLORS.glassFrame, fin: null },
  P2: { stone: '#4a4f55', stoneDark: '#33373c', spandrel: '#24272b', frame: '#2b2f33', fin: '#b8925a' },
};
const paletteOf = (bid) => PALETTE[bid] || PALETTE.P1;

function bayType(ctx, lv, e, center, idx) {
  const first = lv.short === '1F';
  for (const en of ctx.layout.entrances) {
    if (en.level !== lv.id) continue;
    const dx = en.seg.x1 - en.seg.x0, dz = en.seg.z1 - en.seg.z0;
    const l2 = dx * dx + dz * dz;
    const t = ((center[0] - en.seg.x0) * dx + (center[1] - en.seg.z0) * dz) / l2;
    const px = en.seg.x0 + dx * t, pz = en.seg.z0 + dz * t;
    if (t > -0.02 && t < 1.02 && Math.hypot(center[0] - px, center[1] - pz) < 0.6) return 'entrance';
  }
  if (e.kind === 'arc') return 'curtain';
  if (e.kind === 'end' && !first) return 'curtain';
  const [ix, iz] = toW(e.F, 0, -1.5);
  const inside = [center[0] + ix - e.F.ox, center[1] + iz - e.F.oz];
  if (first) {
    if (lv.units.some((u) => u.polys.some((p) => pointInPoly(inside, p)))) return 'shopwindow';
    return e.kind === 'end' ? 'curtain' : 'stone';
  }
  return idx % 3 === 1 ? 'slot' : 'stone';
}

function facade(ctx, lv) {
  const FB = ctx.levels[lv.id].facadeBatch;
  const y0 = lv.elev;
  const H = lv.height;
  const pal = paletteOf(lv.building);
  const top = ctx.levels[lv.id].index === ctx.buildings[lv.building].levels.length - 2;
  for (const e of ctx.outlineEdges(lv)) {
    FB.frame(e.F, () => {
      // place(a0,a1,yA,yB,深度,外偏,材质,颜色)：u∈[a0,a1]，v 为外偏（+v 朝外）
      const place = (a0, a1, yA, yB, depth, offset, key, color) => FB.get(key).box((a0 + a1) / 2, (yA + yB) / 2, offset, Math.abs(a1 - a0), yB - yA, depth, color);
      const n = e.kind === 'arc' ? 1 : Math.max(1, Math.round(e.len / 4));
      const bw = e.len / n;
      for (let i = 0; i < n; i++) {
        const a = i * bw, b = a + bw, m = (a + b) / 2;
        const center = toW(e.F, m, 0);
        const type = bayType(ctx, lv, e, center, i);
        if (type === 'stone') {
          place(a + 0.02, b - 0.02, y0, y0 + H, 0.32, 0.16, pal.fin ? 'extSatin' : 'ext', pal.stone);
          place(a, a + 0.04, y0, y0 + H, 0.34, 0.17, 'ext', pal.stoneDark);
          if (pal.fin) for (const p of [a + bw * 0.25, a + bw * 0.5, a + bw * 0.75]) place(p - 0.06, p + 0.06, y0, y0 + H, 0.55, 0.42, 'extMetal', pal.fin);
        } else if (type === 'slot') {
          const s = Math.min(1.6, bw * 0.4);
          place(a, a + s, y0, y0 + H, 0.32, 0.16, pal.fin ? 'extSatin' : 'ext', pal.stone);
          place(b - s, b, y0, y0 + H, 0.32, 0.16, pal.fin ? 'extSatin' : 'ext', pal.stone);
          place(a + s, b - s, y0, y0 + H, 0.06, 0.05, 'glassTint', 0xffffff);
          place(a + s - 0.05, a + s + 0.05, y0, y0 + H, 0.4, 0.2, 'extMetal', pal.fin || pal.frame);
          place(b - s - 0.05, b - s + 0.05, y0, y0 + H, 0.4, 0.2, 'extMetal', pal.fin || pal.frame);
        } else if (type === 'curtain') {
          place(a, b, y0 + 0.5, y0 + H, 0.06, 0.08, 'glassTint', 0xffffff);
          for (const p of e.kind === 'arc' ? [a] : [a, m]) place(p - 0.05, p + 0.05, y0, y0 + H, 0.32, 0.22, 'extMetal', pal.frame);
          if (pal.fin && e.kind === 'arc') place(a - 0.07, a + 0.07, y0, y0 + H, 0.7, 0.45, 'extMetal', pal.fin);
          place(a, b, y0 + H * 0.62 - 0.04, y0 + H * 0.62 + 0.04, 0.2, 0.18, 'extMetal', pal.frame);
        } else if (type === 'shopwindow') {
          place(a, b, y0, y0 + 0.35, 0.36, 0.18, 'ext', pal.stoneDark);
          place(a + 0.1, b - 0.1, y0 + 0.35, y0 + 4.4, 0.05, 0.06, 'glassTint', 0xffffff);
          place(a, b, y0 + 4.4, y0 + H, 0.32, 0.16, pal.fin ? 'extSatin' : 'ext', pal.stone);
          for (const p of [a, m, b]) place(p - 0.05, p + 0.05, y0 + 0.35, y0 + 4.4, 0.22, 0.14, 'extMetal', pal.frame);
        } else if (type === 'entrance') {
          place(a, b, y0 + 4.6, y0 + H, 0.05, 0.06, 'glassTint', 0xffffff);
          place(a, b, y0 + 4.55, y0 + 4.65, 0.3, 0.16, 'extMetal', pal.frame);
        }
      }
      // 楼层分隔带 + 夜间灯带
      place(-0.3, e.len + 0.3, y0 - 0.32, y0 + 0.3, 0.42, 0.21, 'ext', pal.spandrel);
      place(-0.3, e.len + 0.3, y0 + 0.31, y0 + 0.36, 0.44, 0.22, 'glow', pal.fin ? '#ffd38a' : COLORS.led);
      if (top) place(-0.3, e.len + 0.3, y0 + H - 0.1, y0 + H + 0.35, 0.46, 0.23, 'ext', pal.spandrel);
    });
  }
  facadeSigns(ctx, lv);
}

/** 外立面店招：1F 外墙铺位在橱窗上方；楼上大铺位挂大招牌 */
function facadeSigns(ctx, lv) {
  const L = ctx.levels[lv.id];
  const S = L.facadeSigns;
  const atlas = ctx.atlas[lv.id];
  const big = lv.short !== '1F';
  for (const u of lv.units) {
    for (const r of u.rects) {
      const sides = [
        ['W', r.x0, (r.z0 + r.z1) / 2, r.z1 - r.z0], ['E', r.x1, (r.z0 + r.z1) / 2, r.z1 - r.z0],
        ['N', (r.x0 + r.x1) / 2, r.z0, r.x1 - r.x0], ['S', (r.x0 + r.x1) / 2, r.z1, r.x1 - r.x0],
      ];
      for (const [side, lu, lz, span] of sides) {
        if (distToPolyEdge(toW(u.frame, lu, lz), lv.outline) > 0.05) continue;
        if (big && span < 14) continue;
        if (!big && span < 6) continue;
        const w = big ? Math.min(12, span * 0.6) : Math.min(5.2, span * 0.62);
        const h = w / 4;
        const y = big ? lv.elev + lv.height * 0.55 : lv.elev + 5.2;
        const off = 0.36;
        const [ox, oz] = { W: [-off, 0], E: [off, 0], N: [0, -off], S: [0, off] }[side];
        S.frame(u.frame, () => S.place(lu + ox, y, lz + oz, w, h, side, atlas.cell(u.id)));
      }
    }
  }
}

// ---------- 屋面 ----------

function roofTop(ctx, lv) {
  const B = ctx.levels[lv.id].batch;
  const y = lv.elev;
  const skywalks = lv.features.filter((f) => f.type === 'skywalk');
  for (const e of ctx.outlineEdges(lv)) {
    const crown = e.kind === 'arc';
    B.frame(e.F, () => {
      const n = Math.max(1, Math.round(e.len / 2));
      for (let i = 0; i < n; i++) {
        const a = (i + 0.5) * (e.len / n);
        const [wx, wz] = toW(e.F, a, 0);
        if (skywalks.some((f) => { const [u, v] = toL(f.frame, wx, wz); return u > f.rect.x0 - 1 && u < f.rect.x1 + 1 && v > f.rect.z0 - 0.5 && v < f.rect.z1 + 0.5; })) continue;
        B.get('glass').box(a, y + 0.75, -0.05, e.len / n, 1.1, 0.04, 0xffffff);
      }
      B.get('metal').box(e.len / 2, y + 1.32, -0.05, e.len, 0.07, 0.12, COLORS.steel);
      B.get('satin').box(e.len / 2, y + 0.12, -0.2, e.len, 0.24, 0.4, COLORS.stoneDark);
      if (crown) {
        // 圆厅顶部金属冠：竖向翼片 + 顶环
        B.get('extMetal').box(e.len / 2, y + 2.6, 0.1, e.len, 0.25, 0.5, COLORS.white);
        B.get('extMetal').box(0, y + 1.4, 0.1, 0.12, 2.6, 0.7, COLORS.white);
        B.get('glow').box(e.len / 2, y + 2.45, 0.36, e.len, 0.06, 0.04, COLORS.led);
      }
    });
  }
  for (const v of lv.voids) {
    if (v.kind !== 'skylight') continue;
    if (v.radius) vault(B, v, y, 3.6);
    else ridge(B, v, y);
  }
}

/** 圆厅玻璃拱顶：沿洞口长轴的半椭圆拱 + 钢拱肋（在套件坐标系内） */
function vault(B, v, y, rise) {
  const r = v.rect;
  const y0 = y + 0.5;
  const cz = (r.z0 + r.z1) / 2;
  const half = (r.z1 - r.z0) / 2;
  const xs0 = r.x0 + 0.2, xs1 = r.x1 - 0.2;
  const seg = 18;
  const prof = [];
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI;
    prof.push([cz - Math.cos(th) * half, y0 + Math.sin(th) * rise]);
  }
  B.frame(v.frame, () => {
    for (let i = 0; i < seg; i++) {
      const [z0, yA] = prof[i];
      const [z1, yB] = prof[i + 1];
      const len = Math.hypot(z1 - z0, yB - yA);
      const ang = Math.atan2(yB - yA, z1 - z0);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -ang);
      B.get('glass').shape('box', new THREE.Vector3((xs0 + xs1) / 2, (yA + yB) / 2, (z0 + z1) / 2), q, new THREE.Vector3(xs1 - xs0, 0.04, len), 0xffffff);
    }
    for (const xe of [xs0, xs1]) {
      for (let i = 0; i < seg; i++) {
        const [z0, yA] = prof[i];
        const [z1, yB] = prof[i + 1];
        B.get('glass').boxMinMax(xe - 0.02, y0, Math.min(z0, z1), xe + 0.02, (yA + yB) / 2, Math.max(z0, z1), 0xffffff);
      }
    }
    for (let x = xs0; x <= xs1 + 0.01; x += (xs1 - xs0) / 12) {
      for (let i = 0; i < seg; i++) {
        const [z0, yA] = prof[i];
        const [z1, yB] = prof[i + 1];
        B.get('metal').bar({ x, y: yA, z: z0 }, { x, y: yB, z: z1 }, 0.12, COLORS.white);
      }
    }
    B.get('metal').box((xs0 + xs1) / 2, y0 + rise, cz, xs1 - xs0, 0.16, 0.2, COLORS.white);
    B.get('satin').box((r.x0 + r.x1) / 2, y + 0.25, r.z0 - 0.3, r.x1 - r.x0 + 1, 0.5, 0.6, COLORS.stoneDark);
    B.get('satin').box((r.x0 + r.x1) / 2, y + 0.25, r.z1 + 0.3, r.x1 - r.x0 + 1, 0.5, 0.6, COLORS.stoneDark);
    B.get('satin').box(r.x0 - 0.3, y + 0.25, cz, 0.6, 0.5, r.z1 - r.z0, COLORS.stoneDark);
    B.get('satin').box(r.x1 + 0.3, y + 0.25, cz, 0.6, 0.5, r.z1 - r.z0, COLORS.stoneDark);
  });
}

/** 商业街天窗：双坡玻璃 + 屋脊 */
function ridge(B, v, y) {
  const r = v.rect;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  B.frame(v.frame, () => {
    for (const s of [-1, 1]) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s * 0.5);
      B.get('glass').shape('box', new THREE.Vector3(cx, y + 0.95, cz + (s * d) / 4), q, new THREE.Vector3(w, 0.04, d / 2 / Math.cos(0.5)), 0xffffff);
    }
    B.get('metal').box(cx, y + 1.3, cz, w, 0.1, 0.14, COLORS.white);
    B.get('satin').box(cx, y + 0.35, r.z0 - 0.15, w + 0.3, 0.7, 0.3, COLORS.stoneDark);
    B.get('satin').box(cx, y + 0.35, r.z1 + 0.15, w + 0.3, 0.7, 0.3, COLORS.stoneDark);
    B.get('satin').box(r.x0 - 0.15, y + 0.35, cz, 0.3, 0.7, d, COLORS.stoneDark);
    B.get('satin').box(r.x1 + 0.15, y + 0.35, cz, 0.3, 0.7, d, COLORS.stoneDark);
    for (let x = r.x0 + 1; x < r.x1; x += 2) B.get('metal').box(x, y + 0.95, cz, 0.06, 0.06, d, COLORS.white);
  });
}

// ---------- 楼名与 LED 屏 ----------

const SIGNAGE = {
  P1: {
    title: '云澜汇', en: 'YUNLAN MALL', name: { rot: 'C', deg: 105, level: '3F' }, led: { wing: 'SE', level: '3F' },
    slides: [
      { t: '云澜汇 · 欢迎光临', s: 'YUNLAN MALL', a: '#0f6f86', b: '#43b6cd' },
      { t: '天台「云澜之眼」摩天轮', s: 'SKY EYE · 每晚 19:00 灯光秀', a: '#3b1d6e', b: '#e0567a' },
      { t: 'B1M 美食广场 · 云澜老街', s: 'FOOD COURT · 60+ 美味', a: '#8a2c10', b: '#f59e0b' },
      { t: '经云环天桥 · 直达二期星湾', s: 'SKY RING BRIDGE', a: '#111827', b: '#2f86b0' },
    ],
  },
  P2: {
    title: '星湾', en: 'XINGWAN', name: { rot: 'A', deg: 67.5, level: '4F', w: 14 }, led: { wing: 'W', level: '3F' },
    slides: [
      { t: '星湾 · 欢迎光临', s: 'XINGWAN · 冰场 · IMAX · 天空跑道', a: '#1a1f2b', b: '#b8925a' },
      { t: '1F 星湾真冰场', s: 'ICE ARENA · 全年开放', a: '#0c4a6e', b: '#7dd3fc' },
      { t: '4F IMAX 影城 · 餐饮', s: 'IMAX · DINING', a: '#111827', b: '#f5c518' },
      { t: '天台天空跑道 · 篮球场', s: 'SKY TRACK · ROOFTOP COURT', a: '#7c2d12', b: '#d9482b' },
    ],
  },
};

function signage(ctx, b) {
  const cfg = SIGNAGE[b.id];
  if (!cfg) return;
  const lv = (s) => ctx.layout.levels.find((l) => l.building === b.id && l.short === s);
  // 楼名：贴在圆厅弧面幕墙外
  if (cfg.name) {
    const r = b.rotundas.find((x) => x.id === cfg.name.rot);
    const L = ctx.levels[lv(cfg.name.level).id];
    const a = (cfg.name.deg * Math.PI) / 180;
    const c = makeCanvas(2048, 512);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 2048, 512);
    g.fillStyle = '#ffffff';
    g.textBaseline = 'middle';
    g.font = `800 300px ${FONT_CN}`;
    g.fillText(cfg.title, 40, 260);
    const tw = g.measureText(cfg.title).width;
    g.font = `700 150px ${FONT_EN}`;
    g.fillText(cfg.en, Math.max(1020, tw + 120), 270);
    const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(c, { clamp: true }), transparent: true, depthWrite: false, toneMapped: true });
    ctx.mats.onNight((t) => mat.color.setRGB(0.95 + t * 0.9, 0.97 + t * 0.9, 1.0 + t * 0.9));
    const nw = cfg.name.w || 20;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(nw, nw / 4), mat);
    mesh.position.set(r.x + Math.cos(a) * (r.R + 0.9), L.lv.elev + 2.9, r.z + Math.sin(a) * (r.R + 0.9));
    mesh.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
    mesh.renderOrder = 3;
    L.facade.add(mesh);
  }
  // LED 屏：东南翼末端立面（主入口与天桥入口上方）
  if (cfg.led) {
    const w = b.wings.find((x) => x.id === cfg.led.wing);
    const L = ctx.levels[lv(cfg.led.level).id];
    const c = makeCanvas(1024, 384);
    const g = c.getContext('2d');
    const tex = canvasTexture(c, { clamp: true });
    const mat = ctx.mats.screen(tex, 0.8, 1.6);
    const W = 26, H = 4.4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    const [x, z] = toW(w.F, w.uEnd + 0.55, 0);
    mesh.position.set(x, L.lv.elev + 2.7, z);
    mesh.rotation.y = -w.F.a + Math.PI / 2;
    L.facade.add(mesh);
    L.facadeBatch.frame(w.F, () => L.facadeBatch.get('extMetal').box(w.uEnd + 0.42, L.lv.elev + 2.7, 0, 0.2, H + 0.6, W + 0.6, COLORS.black));
    const slides = cfg.slides;
    let last = -1;
    ctx.dynamic.push({
      update(dt, time) {
        const k = Math.floor(time / 5) % slides.length;
        const phase = (time % 5) / 5;
        if (k === last && Math.floor(time * 8) % 2) return;
        last = k;
        const s = slides[k];
        const grd = g.createLinearGradient(0, 0, 1024, 384);
        grd.addColorStop(0, s.a);
        grd.addColorStop(1, s.b);
        g.fillStyle = grd;
        g.fillRect(0, 0, 1024, 384);
        g.globalAlpha = 0.18;
        for (let i = 0; i < 9; i++) {
          g.beginPath();
          g.arc(((i * 137 + time * 40) % 1200) - 80, 80 + ((i * 61) % 260), 40 + (i % 3) * 30, 0, Math.PI * 2);
          g.fillStyle = '#ffffff';
          g.fill();
        }
        g.globalAlpha = 1;
        g.fillStyle = '#ffffff';
        g.textBaseline = 'middle';
        const slide = Math.min(1, phase * 4);
        g.globalAlpha = slide;
        g.font = `800 96px ${FONT_CN}`;
        g.fillText(s.t, 60 + (1 - slide) * 40, 150);
        g.font = `700 46px ${FONT_EN}`;
        g.fillText(s.s, 64, 268);
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.12)';
        for (let x2 = 0; x2 < 1024; x2 += 6) g.fillRect(x2, 0, 1, 384);
        for (let y2 = 0; y2 < 384; y2 += 6) g.fillRect(0, y2, 1024, 1);
        tex.needsUpdate = true;
      },
    });
  }
}
