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
