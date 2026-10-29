// 平面几何工具（坐标 [x, z]：x 向东、z 向南）。纯函数，可在 Node 中测试。

export const EPS = 1e-6;

/** 规范化矩形 {x0,z0,x1,z1} */
export function rect(x0, z0, x1, z1) {
  return { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
}
export const rw = (r) => r.x1 - r.x0;
export const rd = (r) => r.z1 - r.z0;
export const rcx = (r) => (r.x0 + r.x1) / 2;
export const rcz = (r) => (r.z0 + r.z1) / 2;
export const rectArea = (r) => rw(r) * rd(r);

/** 门面/门的外法线 */
export const NORMAL = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
export const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

export function rectsOverlap(a, b, eps = EPS) {
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
}

/** 两个矩形重叠或相接，且接触长度 ≥ minLen */
export function rectsConnect(a, b, minLen = 1) {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return ox >= -EPS && oz >= -EPS && Math.max(ox, oz) >= minLen;
}

export function pointInRect(p, r, eps = 0) {
  return p[0] >= r.x0 - eps && p[0] <= r.x1 + eps && p[1] >= r.z0 - eps && p[1] <= r.z1 + eps;
}

/** 射线法判断点是否在多边形内 */
export function pointInPoly(p, poly) {
  const [x, z] = p;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return a / 2;
}

export function polyBounds(poly) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of poly) {
    x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
  }
  return { x0, z0, x1, z1 };
}

export const rectPoly = (r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];

/** 圆角矩形多边形，四角各用 seg 段圆弧 */
export function roundedRectPoly(r, radius, seg = 6) {
  const rad = Math.max(0, Math.min(radius, rw(r) / 2, rd(r) / 2));
  if (rad < EPS) return rectPoly(r);
  const corners = [
    [r.x1 - rad, r.z0 + rad, -Math.PI / 2], // 东北角：从北向东
    [r.x1 - rad, r.z1 - rad, 0],
    [r.x0 + rad, r.z1 - rad, Math.PI / 2],
    [r.x0 + rad, r.z0 + rad, Math.PI],
  ];
  const pts = [];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
    }
  }
  return pts;
}

/** 门面外侧的探测点（1/4、1/2、3/4 处，外偏 d 米） */
export function frontProbes(f, d = 0.5) {
  const [nx, nz] = NORMAL[f.side];
  return [0.25, 0.5, 0.75].map((t) => [f.x0 + (f.x1 - f.x0) * t + nx * d, f.z0 + (f.z1 - f.z0) * t + nz * d]);
}

/** 电梯门口外侧探测点；电梯 {x,z,w(东西),d(南北),door} */
export function doorProbe(e, d = 0.6) {
  const [nx, nz] = NORMAL[e.door];
  return [e.x + nx * (e.w / 2 + d), e.z + nz * (e.d / 2 + d)];
}

/** 矩形内部网格采样点 */
export function rectSamples(r, step = 1, inset = 0.05) {
  const w = rw(r) - 2 * inset, h = rd(r) - 2 * inset;
  const nx = Math.max(1, Math.round(w / step)), nz = Math.max(1, Math.round(h / step));
  const pts = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) pts.push([r.x0 + inset + (w * i) / nx, r.z0 + inset + (h * j) / nz]);
  return pts;
}

/** 四角内缩点 + 中心点 */
export function rectCornersInset(r, inset = 1) {
  const ix = Math.min(inset, rw(r) / 2), iz = Math.min(inset, rd(r) / 2);
  return [
    [r.x0 + ix, r.z0 + iz], [r.x1 - ix, r.z0 + iz], [r.x1 - ix, r.z1 - iz], [r.x0 + ix, r.z1 - iz], [rcx(r), rcz(r)],
  ];
}

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const mid = (s) => [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];
export const segLen = (s) => Math.hypot(s.x1 - s.x0, s.z1 - s.z0);

/** 矩形四条边（带外法线方向） */
export function rectEdges(r) {
  return [
    { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0, side: 'N' },
    { x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1, side: 'S' },
    { x0: r.x0, z0: r.z0, x1: r.x0, z1: r.z1, side: 'W' },
    { x0: r.x1, z0: r.z0, x1: r.x1, z1: r.z1, side: 'E' },
  ];
}

const isH = (s) => Math.abs(s.z1 - s.z0) < EPS;
const lineKey = (s) => (isH(s) ? 'h' : 'v') + ':' + (isH(s) ? s.z0 : s.x0).toFixed(3);
const span = (s) => (isH(s) ? [Math.min(s.x0, s.x1), Math.max(s.x0, s.x1)] : [Math.min(s.z0, s.z1), Math.max(s.z0, s.z1)]);
function fromSpan(proto, a, b) {
  return isH(proto) ? { ...proto, x0: a, x1: b, z0: proto.z0, z1: proto.z0 } : { ...proto, x0: proto.x0, x1: proto.x0, z0: a, z1: b };
}

/** 区间集合减去一个区间 */
export function subtractInterval(ivs, [c0, c1]) {
  const res = [];
  for (const [a, b] of ivs) {
    if (c1 <= a + EPS || c0 >= b - EPS) { res.push([a, b]); continue; }
    if (c0 > a + EPS) res.push([a, c0]);
    if (c1 < b - EPS) res.push([c1, b]);
  }
  return res;
}

/** 互不重叠矩形并集的外轮廓线段（相邻矩形的公共边抵消） */
export function unionOutline(rects) {
  const edges = rects.flatMap(rectEdges);
  const out = [];
  for (const e of edges) {
    let ivs = [span(e)];
    for (const o of edges) {
      if (o === e || o.side !== OPPOSITE[e.side] || lineKey(o) !== lineKey(e)) continue;
      ivs = subtractInterval(ivs, span(o));
    }
    for (const [a, b] of ivs) if (b - a > EPS) out.push(fromSpan(e, a, b));
  }
  return out;
}

/** 合并共线且重叠/相接的线段（忽略 side），用于墙体去重 */
export function mergeSegments(segs) {
  const groups = new Map();
  for (const s of segs) {
    const k = lineKey(s);
    if (!groups.has(k)) groups.set(k, { proto: s, spans: [] });
    groups.get(k).spans.push(span(s));
  }
  const out = [];
  for (const { proto, spans } of groups.values()) {
    spans.sort((p, q) => p[0] - q[0]);
    let [a, b] = spans[0];
    for (let i = 1; i < spans.length; i++) {
      const [c, d] = spans[i];
      if (c <= b + EPS) b = Math.max(b, d);
      else { out.push(fromSpan(proto, a, b)); [a, b] = [c, d]; }
    }
    out.push(fromSpan(proto, a, b));
  }
  return out;
}

/** 从线段集合中扣除开口（门面、门洞）——仅扣除共线部分 */
export function subtractOpenings(segs, openings) {
  const out = [];
  for (const s of segs) {
    let ivs = [span(s)];
    for (const o of openings) if (lineKey(o) === lineKey(s)) ivs = subtractInterval(ivs, span(o));
    for (const [a, b] of ivs) if (b - a > 0.05) out.push(fromSpan(s, a, b));
  }
  return out;
}

/** 线段是否与矩形内部相交（用于检查线段穿过房间） */
export function segHitsRect(s, r, eps = 0.05) {
  const [a, b] = span(s);
  if (isH(s)) return s.z0 > r.z0 + eps && s.z0 < r.z1 - eps && b > r.x0 + eps && a < r.x1 - eps;
  return s.x0 > r.x0 + eps && s.x0 < r.x1 - eps && b > r.z0 + eps && a < r.z1 - eps;
}

// ---------------------------------------------------------------------------
// v2：局部坐标系（frame）与任意多边形
// 局部 (u,v) 沿用 v1 写法：rect 的 x≡u、z≡v；side 'N'=−v 'S'=+v 'W'=−u 'E'=+u。
// 世界坐标 = (ox + u·c − v·s, oz + u·s + v·c)；渲染时 rotation.y = −a。

/** 局部坐标系：原点 (ox,oz)，u 轴方向角 deg（从 +x 转向 +z） */
export function frame(ox, oz, deg = 0, id = '') {
  const a = (deg * Math.PI) / 180;
  return { id, ox, oz, deg, a, c: Math.cos(a), s: Math.sin(a) };
}
export const IDENTITY = frame(0, 0, 0, 'world');
export const toW = (F, u, v) => [F.ox + u * F.c - v * F.s, F.oz + u * F.s + v * F.c];
export function toL(F, x, z) {
  const dx = x - F.ox, dz = z - F.oz;
  return [dx * F.c + dz * F.s, -dx * F.s + dz * F.c];
}
/** 局部方向向量 → 世界方向向量 */
export const dirW = (F, du, dv) => [du * F.c - dv * F.s, du * F.s + dv * F.c];
/** 局部轴对齐矩形 → 世界四边形 */
export const lrectPoly = (F, r) => rectPoly(r).map(([u, v]) => toW(F, u, v));
/** 局部门面 {x0,z0,x1,z1,side} → 世界线段 + 外法线 */
export function lseg(F, s) {
  const [x0, z0] = toW(F, s.x0, s.z0);
  const [x1, z1] = toW(F, s.x1, s.z1);
  const [nx, nz] = dirW(F, ...NORMAL[s.side]);
  return { x0, z0, x1, z1, nx, nz };
}
/** 局部点集 → 世界点集 */
export const lpoly = (F, pts) => pts.map(([u, v]) => toW(F, u, v));

export function polyCentroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

export function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t));
}

export function distToPolyEdge(p, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSeg(p, poly[j], poly[i]));
  return d;
}

/** 凸多边形分离轴判定：内部交叠超过 eps 才算重叠（相接不算） */
export function convexOverlap(a, b, eps = 0.02) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p0 = poly[i], p1 = poly[(i + 1) % poly.length];
      let nx = p1[1] - p0[1], nz = -(p1[0] - p0[0]);
      const len = Math.hypot(nx, nz);
      if (len < 1e-9) continue;
      nx /= len; nz /= len;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const [x, z] of a) { const d = x * nx + z * nz; if (d < amin) amin = d; if (d > amax) amax = d; }
      for (const [x, z] of b) { const d = x * nx + z * nz; if (d < bmin) bmin = d; if (d > bmax) bmax = d; }
      if (amax <= bmin + eps || bmax <= amin + eps) return false;
    }
  }
  return true;
}

/** 任意（含凹）多边形是否相交：边真正相交，或一方包含另一方（相接不算） */
export function polysOverlap(a, b) {
  const side = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const p = a[i], q = a[(i + 1) % a.length], r = b[j], t = b[(j + 1) % b.length];
    if (side(r, t, p) * side(r, t, q) < 0 && side(p, q, r) * side(p, q, t) < 0) return true;
  }
  return pointInPoly(a[0], b) || pointInPoly(b[0], a);
}

function lineHit(P, Q, A, B) {
  const r = [Q[0] - P[0], Q[1] - P[1]], s = [B[0] - A[0], B[1] - A[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return [P[0], P[1]];
  const t = ((A[0] - P[0]) * s[1] - (A[1] - P[1]) * s[0]) / den;
  return [P[0] + r[0] * t, P[1] + r[1] * t];
}

/** Sutherland–Hodgman：subject 被凸多边形 clip 裁剪（自动适应 clip 的方向） */
export function clipConvex(subject, clip) {
  const sgn = Math.sign(polyArea(clip)) || 1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const A = clip[i], B = clip[(i + 1) % clip.length];
    const inside = (p) => sgn * ((B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0])) >= -1e-9;
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const P = input[j], Q = input[(j + 1) % input.length];
      const pin = inside(P), qin = inside(Q);
      if (pin) out.push(P);
      if (pin !== qin) out.push(lineHit(P, Q, A, B));
    }
  }
  return out;
}

/** 圆（n 边形近似），顶点在 a0 + k·360/n 度 */
export function circlePoly(cx, cz, r, n = 120, a0 = 0) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = ((a0 + (k * 360) / n) * Math.PI) / 180;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

/** 多边形内部网格采样（离边 ≥ inset），外加向形心内缩的顶点 */
export function polySamples(poly, step = 1.5, inset = 0.05) {
  const b = polyBounds(poly);
  const nx = Math.max(1, Math.ceil((b.x1 - b.x0) / step));
  const nz = Math.max(1, Math.ceil((b.z1 - b.z0) / step));
  const pts = [];
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const p = [b.x0 + ((b.x1 - b.x0) * i) / nx, b.z0 + ((b.z1 - b.z0) * j) / nz];
      if (pointInPoly(p, poly) && distToPolyEdge(p, poly) >= inset) pts.push(p);
    }
  }
  const c = polyCentroid(poly);
  for (const v of poly) {
    const d = dist(v, c);
    if (d <= inset * 4) continue;
    const k = (inset * 2) / d;
    pts.push([v[0] + (c[0] - v[0]) * k, v[1] + (c[1] - v[1]) * k]);
  }
  return pts;
}

/** 世界门面线段外侧探测点（1/4、1/2、3/4 处沿外法线偏 d） */
export function segProbes(f, d = 0.5) {
  return [0.25, 0.5, 0.75].map((t) => [f.x0 + (f.x1 - f.x0) * t + f.nx * d, f.z0 + (f.z1 - f.z0) * t + f.nz * d]);
}

/** 两个多边形是否相连：重叠或共边，且接触长度 ≥ minLen */
export function polysConnect(a, b, minLen = 1, tol = 0.05) {
  const ba = polyBounds(a), bb = polyBounds(b);
  if (ba.x0 > bb.x1 + tol || bb.x0 > ba.x1 + tol || ba.z0 > bb.z1 + tol || bb.z0 > ba.z1 + tol) return false;
  const step = 0.5;
  let len = 0;
  for (const [P, Q, bq] of [[a, b, bb], [b, a, ba]]) {
    for (let i = 0; i < P.length; i++) {
      const p0 = P[i], p1 = P[(i + 1) % P.length];
      const l = dist(p0, p1);
      const n = Math.max(1, Math.ceil(l / step));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const p = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
        if (p[0] < bq.x0 - tol || p[0] > bq.x1 + tol || p[1] < bq.z0 - tol || p[1] > bq.z1 + tol) continue;
        if (pointInPoly(p, Q) || distToPolyEdge(p, Q) <= tol) {
          len += l / n;
          if (len >= minLen) return true;
        }
      }
    }
  }
  return false;
}

/** 圆角矩形（局部）→ 世界多边形 */
export const lroundPoly = (F, r, radius, seg = 6) => roundedRectPoly(r, radius, seg).map(([u, v]) => toW(F, u, v));
