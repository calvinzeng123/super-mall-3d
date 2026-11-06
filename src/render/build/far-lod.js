// 远景替身（far LOD，supertall P0b · SPEC §2.2 M1）：每栋高塔在 600 m 外（相机到塔心，5 % 回差）把外立面批次
// 换成两个网格的替身（facadePlaster + facadeWindow），夜间再加一个点亮的窗格 / 塔冠轮廓 / 航空障碍灯网格。
//
//   farSwap(b, top, near, far, { radius, hysteresis, extra, night, onNight })   THREE.LOD 对象（从 community.js 移来）
//   farStandIn(B, b, spec)        按 spec 画替身（建筑坐标系，写进 B 的 facadePlaster / facadeWindow 批次）
//   farNight(b, night, material)  夜景层：单位面片的 InstancedMesh（逐实例着色：窗带、塔冠亮边、红色障碍灯；避难层留暗）
//   buildFarLod(ctx, b, opts)     便捷入口：建替身与夜景层、把 near 组包进 LOD，返回 { lod, far, night }
//
// 一栋塔的包（P-north / P-west / P-R / P-HA）只需给出自己的 spec：
//   spec = {
//     top,                                   主屋面标高（m），替身体量的顶
//     y0 = 0,                                体量的底（北苑立在一期屋面上，取 7F 标高）
//     footprint = b.footprint,               建筑坐标系矩形
//     mass: [{ rect, y0, y1, color }],       可选：代替默认的一个体量盒（退台、裙房）
//     faces: [{ edge: 'N'|'S'|'W'|'E', t0, t1, off, bands: [{ y0, y1, kind, color, t0, t1 }] }],
//         kind: 'glass'（facadeWindow）| 'spandrel' | 'louvre' | 'stone' | 'balcony' | 'band'（facadePlaster）
//         t0 / t1 沿边的范围（缺省整边）；连续楼层的同类窗带应合并成一条（见 mergeBands）
//     crown: [{ rect, y0, y1, color }],      塔冠、机房、女儿墙、构架：实心盒
//     roof: { y, color },                    屋面（朝上的面片）
//     extras: [(B) => {}],                   其余自定义几何（同一批次）
//     night: { windows: [{ edge, t0, t1, y0, y1 }], crownEdges: [{ edge, y0, y1, rect }], aviation: [{ x, y, z }] },
//   }
// 夜景层只在夜间、且塔处于远景时可见（onNight 切换），白天的绘制调用不变。它是每栋一个单位面片的 InstancedMesh，
// 材质是该塔剪切 glowSoft 的无顶点色克隆（逐实例颜色）：不增加几何字节，全园区只多一个实例化着色器变体（夜间才编译）。
// 不用 facadeWindowLit：它的自发光是整材质统一色，红色航空障碍灯画不出来。
import * as THREE from 'three';
import { BatchSet, frameMatrix } from '../batch.js';
import { toW } from '../../layout/geom.js';

export const FAR_LOD_RADIUS = 600;
export const FAR_LOD_HYSTERESIS = 0.05;
/** Budgets (SPEC §2.3): ≤ 2 meshes by day, ≤ 2,000 triangles (西苑 keeps 1,500); the night layer ≤ 600 triangles. */
export const FAR_BUDGET = Object.freeze({ dayMeshes: 2, dayTriangles: 2000, westTriangles: 1500, nightTriangles: 600 });
export const FAR_COLORS = Object.freeze({
  glass: '#8c9ca3', spandrel: '#b9b0a0', louvre: '#6e7375', stone: '#ddd6c8', balcony: '#a08d6e', band: '#b6ad9b',
  roof: '#aaa395', penthouse: '#c4bcad', deck: '#a8916c', planter: '#647f52',
});
export const NIGHT_COLORS = Object.freeze({ window: '#f6dfb4', crown: '#f1dcae', aviation: '#ff2a1f' });
const KIND_KEY = { glass: 'facadeWindow' };

/** Footprint edges in the building frame; t runs along x (N / S) or z (W / E); n is the outward normal. */
export const rectEdges = (r) => [
  { side: 'N', axis: 'x', c: r.z0, lo: r.x0, hi: r.x1, n: [0, -1] }, { side: 'S', axis: 'x', c: r.z1, lo: r.x0, hi: r.x1, n: [0, 1] },
  { side: 'W', axis: 'z', c: r.x0, lo: r.z0, hi: r.z1, n: [-1, 0] }, { side: 'E', axis: 'z', c: r.x1, lo: r.z0, hi: r.z1, n: [1, 0] },
];
const edgeOf = (r, side) => rectEdges(r).find((e) => e.side === side);
const at = (e, t, off = 0) => (e.axis === 'x' ? [t, e.c + e.n[1] * off] : [e.c + e.n[0] * off, t]);
const Y = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Quaternion();

/** An outward-facing quad on footprint edge e from t0 to t1, `off` proud of the edge line (2 triangles). */
export function farQuad(B, key, e, t0, t1, y0, y1, off, color) {
  if (t1 - t0 < .02 || y1 - y0 < .02) return;
  let a = at(e, t0, off), b = at(e, t1, off);
  // A 'plane' faces the left normal (−dz, dx) of a → b: flip it to face out of the footprint.
  if (-(b[1] - a[1]) * e.n[0] + (b[0] - a[0]) * e.n[1] < 0) [a, b] = [b, a];
  const dx = b[0] - a[0], dz = b[1] - a[1];
  _q.setFromAxisAngle(Y, -Math.atan2(dz, dx));
  B.get(key).shape('plane', _p.set((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2), _q, _s.set(Math.hypot(dx, dz), y1 - y0, 1), color);
}
const boxOf = (B, key, r, y0, y1, color) => B.get(key).box((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, y1 - y0, r.z1 - r.z0, color);

/** Consecutive bands of one kind / colour / span merge into one (glazing up the tower is one strip). */
export function mergeBands(bands, gap = 1.05) {
  const groups = new Map();
  for (const q of bands) {
    const k = `${q.kind}|${q.color || ''}|${q.t0 ?? ''}|${q.t1 ?? ''}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(q);
  }
  const out = [];
  for (const list of groups.values()) {
    list.sort((p, q) => p.y0 - q.y0);
    for (const q of list) {
      const l = out.at(-1);
      if (l && l.kind === q.kind && l.color === q.color && l.t0 === q.t0 && l.t1 === q.t1 && q.y0 <= l.y1 + gap) l.y1 = Math.max(l.y1, q.y1);
      else out.push({ ...q });
    }
  }
  return out;
}

/** The distant stand-in from a spec (see the file header): the mass, face bands, crown boxes, roof and extras. */
export function farStandIn(B, b, spec) {
  const fp = spec.footprint || b.footprint, y0 = spec.y0 ?? 0, top = spec.top;
  for (const m of spec.mass || [{ rect: fp, y0, y1: top, color: spec.color || FAR_COLORS.stone }]) boxOf(B, 'facadePlaster', m.rect, m.y0, m.y1, m.color || FAR_COLORS.stone);
  for (const f of spec.faces || []) {
    const e = edgeOf(f.rect || fp, f.edge);
    for (const q of f.bands || []) {
      const key = KIND_KEY[q.kind] || 'facadePlaster', t0 = q.t0 ?? f.t0 ?? e.lo, t1 = q.t1 ?? f.t1 ?? e.hi;
      farQuad(B, key, e, t0, t1, q.y0, q.y1, q.off ?? f.off ?? (key === 'facadeWindow' ? .02 : .05), q.color || FAR_COLORS[q.kind] || FAR_COLORS.spandrel);
    }
  }
  for (const c of spec.crown || []) boxOf(B, 'facadePlaster', c.rect, c.y0, c.y1, c.color || FAR_COLORS.penthouse);
  if (spec.roof) {
    const r = spec.roof.rect || fp;
    B.get('facadePlaster').shape('planeUp', _p.set((r.x0 + r.x1) / 2, spec.roof.y + .02, (r.z0 + r.z1) / 2), _up, _s.set(r.x1 - r.x0 - .4, 1, r.z1 - r.z0 - .4), spec.roof.color || FAR_COLORS.roof);
  }
  for (const fn of spec.extras || []) fn(B);
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/**
 * Night windows of a tower, per storey and per face, hashed by level id so lit floors do not repeat:
 * storeys [{ id, y0, y1, refuge }] (refuge storeys stay dark), faces [{ edge, t0, t1 }] (building frame).
 * Each face of each storey gets 0–`perFace` lit strips of `width` m at hashed positions; about `rate` lit.
 */
export function storeyNightWindows(b, storeys, faces, { rate = .32, perFace = 2, width = 2.6, sill = .7, head = .5 } = {}) {
  const out = [];
  for (const s of storeys) {
    if (s.refuge || s.y1 - s.y0 < 2) continue;
    for (const f of faces) {
      const len = f.t1 - f.t0, slots = Math.max(1, Math.floor(len / (width * 1.6)));
      for (let k = 0; k < perFace; k++) {
        const r = hash(`${b.id}|${s.id}|${f.edge}|${k}`);
        if (r > rate) continue;
        const slot = Math.floor(hash(`${s.id}|${f.edge}|${k}|slot`) * slots), w = Math.min(width, len - .4);
        const t0 = f.t0 + .2 + slot * (len - .4 - w) / Math.max(1, slots - 1 || 1);
        out.push({ edge: f.edge, t0, t1: t0 + w, y0: s.y0 + sill, y1: s.y1 - head, rect: f.rect });
      }
    }
  }
  return out;
}
/**
 * A hashed share of candidate windows [{ level, edge, t0, t1, y0, y1 }] for the night layer: about `rate` of them,
 * at most `max` (lowest hashes first), so lit floors vary floor by floor and the layer stays ≤ 600 triangles.
 */
export function pickLitWindows(b, candidates, { rate = .3, max = 240 } = {}) {
  const scored = candidates.map((w, i) => ({ w, h: hash(`${b.id}|${w.level}|${w.edge}|${w.t0.toFixed(2)}|${i}`) })).filter((q) => q.h < rate);
  return scored.sort((p, q) => p.h - q.h).slice(0, max).map((q) => q.w);
}
/** A batch sink that discards geometry: runs a stand-in generator only to collect its night candidates. */
export const NULL_BATCH = Object.freeze({ get: () => NULL_BATCHER, frame: (F, fn) => fn() });
const NULL_BATCHER = Object.freeze({ shape() {}, box() {}, push() {}, cyl() {}, sphere() {}, bar() {}, cone() {} });
/** Lit crown edge lines: a 0.25 m strip round the top of rect at height y (4 quads). */
export const crownEdgeLines = (rect, y, h = .25) => ['N', 'S', 'W', 'E'].map((edge) => ({ edge, rect, y0: y - h, y1: y }));
/** Obstruction lights at the four corners of rect, height y. */
export const cornerAviation = (rect, y) => [[rect.x0, rect.z0], [rect.x1, rect.z0], [rect.x0, rect.z1], [rect.x1, rect.z1]].map(([x, z]) => ({ x, y, z }));

/**
 * Instance transforms of the night layer in the building frame: one unit quad per lit window, per crown edge and
 * two crossed quads per obstruction light. [{ matrix: Matrix4, color }]; 2 triangles each.
 */
export function nightQuads(b, night, fp = b.footprint) {
  const out = [], m = () => new THREE.Matrix4();
  const quad = (e, t0, t1, y0, y1, off, color) => {
    if (t1 - t0 < .02 || y1 - y0 < .02) return;
    const a = at(e, t0, off), z = at(e, t1, off), dx = z[0] - a[0], dz = z[1] - a[1];
    _q.setFromAxisAngle(Y, -Math.atan2(dz, dx));
    out.push({ matrix: m().compose(_p.set((a[0] + z[0]) / 2, (y0 + y1) / 2, (a[1] + z[1]) / 2), _q, _s.set(Math.hypot(dx, dz), y1 - y0, 1)), color });
  };
  for (const w of night.windows || []) quad(edgeOf(w.rect || fp, w.edge), w.t0, w.t1, w.y0, w.y1, .09, w.color || NIGHT_COLORS.window);
  for (const c of night.crownEdges || []) { const e = edgeOf(c.rect || fp, c.edge); quad(e, e.lo - .12, e.hi + .12, c.y0, c.y1, .14, c.color || NIGHT_COLORS.crown); }
  for (const a of night.aviation || []) for (const r of [0, Math.PI / 2]) {
    _q.setFromAxisAngle(Y, r);
    out.push({ matrix: m().compose(_p.set(a.x, a.y, a.z), _q, _s.set(.9, .9, 1)), color: a.color || NIGHT_COLORS.aviation });
  }
  return out;
}

const UNIT_QUAD = new THREE.PlaneGeometry(1, 1);
const _c = new THREE.Color();
/**
 * The night layer of one far tower: an InstancedMesh of a unit quad (6 vertices shared by every tower, so it adds
 * no geometry bytes) in a plain clone of the tower's clipped glowSoft (vertexColors off: primitive geometry carries
 * no colour attribute, the black-instance rule), tinted per instance (warm windows and crown edges, red lights).
 */
export function farNight(b, night, material, fp = b.footprint) {
  const quads = nightQuads(b, night, fp);
  if (!quads.length || !material) return null;
  const mat = material.clone();
  mat.vertexColors = false; mat.color.setScalar(1); mat.side = THREE.DoubleSide; mat.toneMapped = material.toneMapped;
  mat.clippingPlanes = material.clippingPlanes; mat.clipShadows = material.clipShadows;
  const mesh = new THREE.InstancedMesh(UNIT_QUAD, mat, quads.length), F = frameMatrix(b.frame), w = new THREE.Matrix4();
  quads.forEach((q, i) => { mesh.setMatrixAt(i, w.multiplyMatrices(F, q.matrix)); mesh.setColorAt(i, _c.set(q.color)); });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = `${b.id}-far-night`; mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.farNight = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Swaps the exterior batches (`near`) for the stand-in meshes (`far`) by distance. The renderer calls update() on
 * an isLOD object before it draws the object's children, with the main camera only; the shadow pass reuses that
 * choice. The stand-in starts hidden, so the exterior reads as the full tower until a frame is drawn.
 * extra: objects outside the LOD (lobby, roof garden) that show only with the near branch.
 * night: the night layer, shown while distant and the scene is at night (onNight(fn) registers fn(t)).
 */
export function farSwap(b, top, near, far, { radius = FAR_LOD_RADIUS, hysteresis = FAR_LOD_HYSTERESIS, extra = [], night = null, onNight = null } = {}) {
  const lod = new THREE.LOD(), [cx, cz] = toW(b.frame, (b.footprint.x0 + b.footprint.x1) / 2, (b.footprint.z0 + b.footprint.z1) / 2);
  const centre = new THREE.Vector3(cx, top / 2, cz), eye = new THREE.Vector3();
  lod.name = `${b.id}-far-lod`;
  lod.add(near, ...far);
  if (night) lod.add(night);
  for (const m of far) m.visible = false;
  let distant = false, dark = false;
  const sync = () => { if (night) night.visible = distant && dark; };
  sync();
  onNight?.((t) => { dark = t > .05; sync(); });
  lod.update = (camera) => {
    const want = eye.setFromMatrixPosition(camera.matrixWorld).distanceTo(centre) > radius * (distant ? 1 - hysteresis : 1);
    if (want === distant) return;
    distant = want; near.visible = !distant;
    for (const o of extra) if (o) o.visible = !distant;
    for (const m of far) m.visible = distant;
    sync();
  };
  lod.userData.farLod = { radius, hysteresis, centre, get distant() { return distant; } };
  return lod;
}

/**
 * Builds the stand-in (and the night layer when spec.night is given) in the building frame with the tower's own
 * clipped materials, moves every child of `group` into a near branch and adds the LOD to `group`.
 * Returns { lod, far: [meshes], night: mesh | null }.
 */
export function buildFarLod(ctx, b, group, materials, spec, { extra = [], draw = null } = {}) {
  const near = new THREE.Group(), stand = new BatchSet(materials), far = new THREE.Group();
  near.name = `${b.id}-near`;
  near.add(...group.children);
  stand.frame(b.frame, () => (draw ? draw(stand) : farStandIn(stand, b, spec)));
  stand.flush(far, { shadow: true });
  const meshes = [...far.children];
  for (const m of meshes) m.name = `${b.id}-far`;
  const night = spec?.night ? farNight(b, spec.night, materials.glowSoft, spec.footprint || b.footprint) : null;
  const lod = farSwap(b, spec?.top ?? 0, near, meshes, { extra, night, onNight: ctx.mats?.onNight ? (fn) => ctx.mats.onNight(fn) : null });
  group.add(lod);
  return { lod, far: meshes, night };
}
