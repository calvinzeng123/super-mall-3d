// 建筑主体：楼板（含洞口）、柱、中庭栏杆、外立面、天窗、女儿墙、LED 大屏、商场名。
import * as THREE from 'three';
import { pointInRect } from '../../layout/geom.js';
import { THEME, COLORS } from '../theme.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';

export const SLAB_T = { retail: 0.45, food: 0.45, parking: 0.35, roof: 0.6 };

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

export function buildShell(ctx) {
  const { layout, mats } = ctx;
  const slabBody = new THREE.MeshStandardMaterial({ color: 0xdcdcd8, roughness: 0.9 });
  mats.onNight((t) => slabBody.emissive.setRGB(t * 0.12, t * 0.11, t * 0.1));

  for (const lv of layout.levels) {
    const L = ctx.levels[lv.id];
    const t = SLAB_T[lv.kind];
    const shape = shapeFromPoly(lv.slab.outer, lv.slab.holes);
    const floorMat = mats.floor(lv.theme.floor, lv.kind === 'parking' ? 0.62 : lv.id === '1F' ? 0.2 : 0.42);
    const top = new THREE.Mesh(flatShapeGeometry(shape, lv.elev), floorMat);
    top.receiveShadow = true;
    top.name = 'floor';
    const body = new THREE.Mesh(slabGeometry(shape, lv.elev - 0.012, t), slabBody);
    body.castShadow = true;
    body.receiveShadow = true;
    L.base.add(top, body);
    L.floorMesh = top;

    if (lv.kind === 'retail' || lv.kind === 'food') {
      columns(ctx, lv);
      railings(ctx, lv);
    }
    if (lv.kind === 'roof') {
      railings(ctx, lv);
      skylight(ctx, lv);
      parapet(ctx, lv);
      mallName(ctx, lv);
    }
    if (lv.elev >= 0 && lv.kind === 'retail') facade(ctx, lv);
    if (lv.elev < 0) retaining(ctx, lv);
    sill(ctx, lv);
  }
  ledScreen(ctx);
}

/** 店面分隔线上的柱子 */
function columns(ctx, lv) {
  const B = ctx.levels[lv.id].batch;
  const seen = new Set();
  const h = clearHeight(lv);
  const col = THEME[lv.id].column;
  const pts = [];
  for (const u of lv.units) for (const f of u.fronts) pts.push([f.x0, f.z0], [f.x1, f.z1]);
  for (const [x, z] of pts) {
    if (Math.abs(x) >= 59.5 || Math.abs(z) >= 39.5) continue;
    const k = `${x.toFixed(1)},${z.toFixed(1)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    B.get('satin').box(x, lv.elev + h / 2, z, 0.7, h, 0.7, col);
    B.get('metal').box(x, lv.elev + 0.06, z, 0.78, 0.12, 0.78, THEME[lv.id].trim);
  }
}

/** 洞口玻璃栏板（扶梯落点、观光梯门口处断开） */
function railings(ctx, lv) {
  const B = ctx.levels[lv.id].batch;
  const gaps = [];
  for (const e of ctx.layout.escalators) {
    if (e.to !== lv.id) continue;
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    const a = { x: e.top.x - ux * 0.6, z: e.top.z - uz * 0.6 };
    const b = { x: e.top.x + ux * 2.6, z: e.top.z + uz * 2.6 };
    const hw = e.width / 2 + 0.25;
    gaps.push({ x0: Math.min(a.x, b.x) - Math.abs(uz) * hw, x1: Math.max(a.x, b.x) + Math.abs(uz) * hw, z0: Math.min(a.z, b.z) - Math.abs(ux) * hw, z1: Math.max(a.z, b.z) + Math.abs(ux) * hw });
  }
  for (const g of ctx.layout.elevators) {
    if (g.type !== 'glass') continue;
    gaps.push({ x0: g.x - 2.2, x1: g.x + 2.2, z0: g.z - 1.9, z1: g.z + 1.9 });
  }
  const trim = THEME[lv.id].trim;
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
        const t0 = k / n, t1 = (k + 1) / n;
        const mx = x0 + (x1 - x0) * ((t0 + t1) / 2), mz = z0 + (z1 - z0) * ((t0 + t1) / 2);
        if (gaps.some((g) => pointInRect([mx, mz], g))) continue;
        const pl = len / n + 0.02;
        B.get('glass').box(mx, lv.elev + 0.62, mz, pl, 1.0, 0.03, 0xffffff, ang);
        B.get('metal').box(mx, lv.elev + 1.12, mz, pl, 0.06, 0.09, trim, ang);
        B.get('satin').box(mx, lv.elev + 0.07, mz, pl, 0.14, 0.24, THEME[lv.id].column, ang);
      }
    }
    // 洞口侧面包边（楼板厚度位置）
  }
}

/** 楼层外墙在剖切状态下的矮墙轮廓（立面隐藏时仍能看出边界） */
function sill(ctx, lv) {
  const B = ctx.levels[lv.id].batch;
  const c = lv.kind === 'parking' || lv.kind === 'food' ? COLORS.concrete : COLORS.stone;
  const h = lv.kind === 'roof' ? 0.3 : 0.9;
  const y = lv.elev + h / 2;
  const key = lv.kind === 'roof' ? 'satin' : 'matte';
  B.get(key).box(0, y, -40 + 0.15, 120, h, 0.3, c);
  B.get(key).box(0, y, 40 - 0.15, 120, h, 0.3, c);
  B.get(key).box(-60 + 0.15, y, 0, 0.3, h, 80, c);
  B.get(key).box(60 - 0.15, y, 0, 0.3, h, 80, c);
}

/** 地下室挡土墙（立面组，聚焦时隐藏） */
function retaining(ctx, lv) {
  const F = ctx.levels[lv.id].facadeBatch;
  const h = lv.height;
  const y = lv.elev + h / 2 - 0.05;
  const c = '#9fa5ab';
  F.get('ext').box(0, y, -40 - 0.2, 120.8, h, 0.4, c);
  F.get('ext').box(0, y, 40 + 0.2, 120.8, h, 0.4, c);
  F.get('ext').box(-60 - 0.2, y, 0, 0.4, h, 80, c);
  F.get('ext').box(60 + 0.2, y, 0, 0.4, h, 80, c);
  if (lv.id === 'B1') {
    F.get('ext').box(-6.2, y, -46, 0.4, h, 12, c);
    F.get('ext').box(6.2, y, -46, 0.4, h, 12, c);
  }
}

// ---------- 外立面 ----------

const EDGES = [
  { side: 'S', axis: 'x', fixed: 40, from: -60, to: 60, out: [0, 1] },
  { side: 'N', axis: 'x', fixed: -40, from: -60, to: 60, out: [0, -1] },
  { side: 'E', axis: 'z', fixed: 60, from: -40, to: 40, out: [1, 0] },
  { side: 'W', axis: 'z', fixed: -60, from: -40, to: 40, out: [-1, 0] },
];

function bayType(lv, e, m, idx) {
  const one = lv.id === '1F';
  if (one) {
    if (e.side === 'S' && Math.abs(m) < 8) return 'entrance';
    if (e.side !== 'S' && Math.abs(m) < 4) return 'entrance';
    if (e.side === 'N' && m > 12 && m < 20) return 'dock';
  }
  if (e.side === 'S' && Math.abs(m) < 28) return 'curtain';
  if ((e.side === 'E' || e.side === 'W') && Math.abs(m) < 4) return 'curtain';
  if (one) {
    const inside = e.axis === 'x' ? [m, e.fixed - e.out[1] * 1.5] : [e.fixed - e.out[0] * 1.5, m];
    if (lv.units.some((u) => u.rects.some((r) => pointInRect(inside, r)))) return 'shopwindow';
    return 'stone';
  }
  return idx % 3 === 1 ? 'slot' : 'stone';
}

function facade(ctx, lv) {
  const F = ctx.levels[lv.id].facadeBatch;
  const y0 = lv.elev;
  const H = lv.height;
  for (const e of EDGES) {
    const place = (a0, a1, yA, yB, depth, offset, key, color) => {
      const am = (a0 + a1) / 2, al = Math.abs(a1 - a0), ym = (yA + yB) / 2, yh = yB - yA;
      const off = e.fixed + (e.axis === 'x' ? e.out[1] : e.out[0]) * offset;
      if (e.axis === 'x') F.get(key).box(am, ym, off, al, yh, depth, color);
      else F.get(key).box(off, ym, am, depth, yh, al, color);
    };
    let idx = 0;
    for (let a = e.from; a < e.to - 0.01; a += 4, idx++) {
      const b = a + 4;
      const m = (a + b) / 2;
      const type = bayType(lv, e, m, idx);
      if (type === 'stone') {
        place(a + 0.02, b - 0.02, y0, y0 + H, 0.32, 0.16, 'ext', COLORS.stone);
        place(a, a + 0.04, y0, y0 + H, 0.34, 0.17, 'ext', COLORS.stoneDark);
      } else if (type === 'slot') {
        place(a, a + 1.6, y0, y0 + H, 0.32, 0.16, 'ext', COLORS.stone);
        place(b - 1.6, b, y0, y0 + H, 0.32, 0.16, 'ext', COLORS.stone);
        place(a + 1.6, b - 1.6, y0, y0 + H, 0.06, 0.05, 'glassTint', 0xffffff);
        place(a + 1.55, a + 1.65, y0, y0 + H, 0.4, 0.2, 'extMetal', COLORS.glassFrame);
        place(b - 1.65, b - 1.55, y0, y0 + H, 0.4, 0.2, 'extMetal', COLORS.glassFrame);
      } else if (type === 'curtain') {
        place(a, b, y0 + 0.5, y0 + H, 0.06, 0.08, 'glassTint', 0xffffff);
        for (const p of [a, a + 2]) place(p - 0.05, p + 0.05, y0, y0 + H, 0.32, 0.22, 'extMetal', COLORS.glassFrame);
        place(a, b, y0 + H * 0.62 - 0.04, y0 + H * 0.62 + 0.04, 0.2, 0.18, 'extMetal', COLORS.glassFrame);
      } else if (type === 'shopwindow') {
        place(a, b, y0, y0 + 0.35, 0.36, 0.18, 'ext', COLORS.stoneDark);
        place(a + 0.1, b - 0.1, y0 + 0.35, y0 + 4.0, 0.05, 0.06, 'glassTint', 0xffffff);
        place(a, b, y0 + 4.0, y0 + H, 0.32, 0.16, 'ext', COLORS.stone);
        for (const p of [a, m, b]) place(p - 0.05, p + 0.05, y0 + 0.35, y0 + 4.0, 0.22, 0.14, 'extMetal', COLORS.glassFrame);
      } else if (type === 'entrance') {
        place(a, b, y0 + 4.2, y0 + H, 0.05, 0.06, 'glassTint', 0xffffff);
        place(a, b, y0 + 4.15, y0 + 4.25, 0.3, 0.16, 'extMetal', COLORS.glassFrame);
      } else if (type === 'dock') {
        place(a + 0.2, b - 0.2, y0, y0 + 4.2, 0.12, 0.08, 'extMetal', '#9aa1a7');
        for (let k = 0; k < 14; k++) place(a + 0.2, b - 0.2, y0 + 0.15 + k * 0.29, y0 + 0.18 + k * 0.29, 0.14, 0.09, 'extMetal', '#7d848a');
        place(a, b, y0 + 4.2, y0 + H, 0.32, 0.16, 'ext', COLORS.stone);
      }
    }
    // 楼层分隔带 + 夜间灯带
    const len = e.to - e.from;
    place(e.from - 0.3, e.to + 0.3, y0 - 0.32, y0 + 0.3, 0.42, 0.21, 'ext', COLORS.spandrel);
    place(e.from - 0.3, e.to + 0.3, y0 + 0.31, y0 + 0.36, 0.44, 0.22, 'glow', COLORS.led);
    if (lv.id === '3F') {
      place(e.from - 0.3, e.to + 0.3, y0 + H - 0.1, y0 + H + 0.35, 0.46, 0.23, 'ext', COLORS.spandrel);
    }
    void len;
  }
  facadeSigns(ctx, lv);
}

/** 外立面店招：1F 沿街店铺在橱窗上方；2F/3F 角部主力店大招牌 */
function facadeSigns(ctx, lv) {
  const S = ctx.levels[lv.id].facadeSigns;
  const atlas = ctx.atlas[lv.id];
  const y0 = lv.elev;
  for (const u of lv.units) {
    for (const r of u.rects) {
      const touches = [
        r.z1 >= 39.99 && { side: 'S', a0: r.x0, a1: r.x1 },
        r.z0 <= -39.99 && { side: 'N', a0: r.x0, a1: r.x1 },
        r.x1 >= 59.99 && { side: 'E', a0: r.z0, a1: r.z1 },
        r.x0 <= -59.99 && { side: 'W', a0: r.z0, a1: r.z1 },
      ].filter(Boolean);
      for (const t of touches) {
        const span = t.a1 - t.a0;
        const m = (t.a0 + t.a1) / 2;
        if (t.side === 'S' && Math.abs(m) < 30) continue;
        const big = lv.id !== '1F';
        if (big && span < 14) continue;
        if (!big && span < 6) continue;
        const w = big ? Math.min(12, span * 0.6) : Math.min(5.2, span * 0.62);
        const h = w / 4;
        const y = big ? y0 + lv.height * 0.55 : y0 + 4.75;
        S.quad(t.side, m, y, w, h, atlas.cell(u.id));
      }
    }
  }
}

// ---------- 屋面 ----------

function parapet(ctx, lv) {
  const B = ctx.levels[lv.id].batch;
  const y = lv.elev;
  const runs = [
    [0, -40, 120, 'x'], [0, 40, 120, 'x'], [-60, 0, 80, 'z'], [60, 0, 80, 'z'],
  ];
  for (const [x, z, len, ax] of runs) {
    const n = Math.round(len / 2);
    for (let i = 0; i < n; i++) {
      const a = -len / 2 + (i + 0.5) * (len / n);
      // 南侧观景台处断开
      if (ax === 'x' && z === 40 && Math.abs(a) < 4) continue;
      const px = ax === 'x' ? a : x, pz = ax === 'x' ? z : a;
      const sx = ax === 'x' ? len / n : 0.04, sz = ax === 'x' ? 0.04 : len / n;
      B.get('glass').box(px, y + 0.75, pz, sx, 1.1, sz, 0xffffff);
    }
    const sx = ax === 'x' ? len : 0.12, sz = ax === 'x' ? 0.12 : len;
    B.get('metal').box(x, y + 1.32, z, sx, 0.07, sz, COLORS.steel);
    B.get('satin').box(x, y + 0.12, z, ax === 'x' ? len : 0.4, 0.24, ax === 'x' ? 0.4 : len, COLORS.stoneDark);
  }
}

function skylight(ctx, lv) {
  const B = ctx.levels[lv.id].batch;
  const f = lv.features.find((x) => x.type === 'skylight');
  const r = f.rect;
  const y0 = lv.elev + 0.5;
  const cz = (r.z0 + r.z1) / 2;
  const half = (r.z1 - r.z0) / 2;
  const rise = 3.6;
  const xs0 = r.x0 + 0.2, xs1 = r.x1 - 0.2;
  // 拱面：沿 x 方向的半椭圆拱
  const seg = 18;
  const prof = [];
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI;
    prof.push([cz - Math.cos(th) * half, y0 + Math.sin(th) * rise]);
  }
  for (let i = 0; i < seg; i++) {
    const [z0, yA] = prof[i];
    const [z1, yB] = prof[i + 1];
    const len = Math.hypot(z1 - z0, yB - yA);
    const ang = Math.atan2(yB - yA, z1 - z0);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -ang);
    B.get('glass').shape('box', new THREE.Vector3((xs0 + xs1) / 2, (yA + yB) / 2, (z0 + z1) / 2), q, new THREE.Vector3(xs1 - xs0, 0.04, len), 0xffffff);
  }
  // 端头山墙玻璃（近似：竖直扇形分段）
  for (const xe of [xs0, xs1]) {
    for (let i = 0; i < seg; i++) {
      const [z0, yA] = prof[i];
      const [z1, yB] = prof[i + 1];
      B.get('glass').boxMinMax(xe - 0.02, y0, Math.min(z0, z1), xe + 0.02, (yA + yB) / 2, Math.max(z0, z1), 0xffffff);
    }
  }
  // 钢拱肋
  for (let x = xs0; x <= xs1 + 0.01; x += (xs1 - xs0) / 12) {
    for (let i = 0; i < seg; i++) {
      const [z0, yA] = prof[i];
      const [z1, yB] = prof[i + 1];
      B.get('metal').bar({ x, y: yA, z: z0 }, { x, y: yB, z: z1 }, 0.12, COLORS.white);
    }
  }
  B.get('metal').box((xs0 + xs1) / 2, y0 + rise, cz, xs1 - xs0, 0.16, 0.2, COLORS.white);
  // 天窗基座
  B.get('satin').box((r.x0 + r.x1) / 2, lv.elev + 0.25, r.z0 - 0.3, r.x1 - r.x0 + 1, 0.5, 0.6, COLORS.stoneDark);
  B.get('satin').box((r.x0 + r.x1) / 2, lv.elev + 0.25, r.z1 + 0.3, r.x1 - r.x0 + 1, 0.5, 0.6, COLORS.stoneDark);
  B.get('satin').box(r.x0 - 0.3, lv.elev + 0.25, cz, 0.6, 0.5, r.z1 - r.z0, COLORS.stoneDark);
  B.get('satin').box(r.x1 + 0.3, lv.elev + 0.25, cz, 0.6, 0.5, r.z1 - r.z0, COLORS.stoneDark);
}

function mallName(ctx, lv) {
  const c = makeCanvas(2048, 512);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 2048, 512);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.font = `800 300px ${FONT_CN}`;
  g.fillText('云澜汇', 40, 260);
  g.font = `700 150px ${FONT_EN}`;
  g.fillText('YUNLAN MALL', 1020, 270);
  const tex = canvasTexture(c, { clamp: true });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: true });
  ctx.mats.onNight((t) => mat.color.setRGB(0.95 + t * 0.9, 0.97 + t * 0.9, 1.0 + t * 0.9));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), mat);
  mesh.position.set(-4, lv.elev + 4.4, 40.45);
  mesh.renderOrder = 3;
  ctx.levels[lv.id].facade.add(mesh);
  // 字牌背后的钢架
  const B = ctx.levels[lv.id].facadeBatch;
  B.get('extMetal').box(-4, lv.elev + 2.2, 40.3, 24, 0.12, 0.12, COLORS.darkSteel);
  for (const x of [-14, -4, 6]) B.get('extMetal').box(x, lv.elev + 2.4, 40.25, 0.12, 4.6, 0.12, COLORS.darkSteel);
}

/** 南立面 LED 大屏（2F–3F），内容动态刷新 */
function ledScreen(ctx) {
  const lv = ctx.layout.levels.find((l) => l.id === '3F');
  const c = makeCanvas(1024, 384);
  const g = c.getContext('2d');
  const tex = canvasTexture(c, { clamp: true });
  const mat = ctx.mats.screen(tex, 0.8, 1.6);
  const w = 26, h = 9;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(0, 6.0 + h / 2 + 0.6, 40.55);
  ctx.levels['3F'].facade.add(mesh);
  const F = ctx.levels['3F'].facadeBatch;
  F.get('extMetal').box(0, mesh.position.y, 40.42, w + 0.6, h + 0.6, 0.2, COLORS.black);
  const slides = [
    { t: '云澜汇 · 欢迎光临', s: 'YUNLAN MALL', a: '#0f6f86', b: '#43b6cd' },
    { t: '天台「云澜之眼」摩天轮', s: 'SKY EYE · 每晚 19:00 灯光秀', a: '#3b1d6e', b: '#e0567a' },
    { t: 'B1M 美食广场 · 云澜老街', s: 'FOOD COURT · 60+ 美味', a: '#8a2c10', b: '#f59e0b' },
    { t: '3F 云澜影城 IMAX', s: 'YUNLAN CINEMA', a: '#111827', b: '#f5c518' },
  ];
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
      g.font = `800 84px ${FONT_CN}`;
      g.textBaseline = 'middle';
      const slide = Math.min(1, phase * 4);
      g.globalAlpha = slide;
      g.fillText(s.t, 60 + (1 - slide) * 40, 160);
      g.font = `700 40px ${FONT_EN}`;
      g.fillText(s.s, 64, 262);
      g.globalAlpha = 1;
      // 像素网格质感
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = 0; x < 1024; x += 6) g.fillRect(x, 0, 1, 384);
      for (let y = 0; y < 384; y += 6) g.fillRect(0, y, 1024, 1);
      tex.needsUpdate = true;
    },
  });
  void lv;
}
