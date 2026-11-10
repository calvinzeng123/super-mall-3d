// Batcher：把大量小几何（盒子、圆柱、球……）按矩阵变换写入同一块顶点缓冲，
// 带逐顶点颜色，最后合成一个 Mesh —— 每层每种材质只需一次绘制调用。
// 顶点格式尽量紧凑（位置 Float32、法线 Int8、颜色 Uint8，只有招牌批次带 uv）：
// 全园区七百多万个顶点，44 字节/顶点会把手机浏览器的内存撑爆，现在是 18 字节/顶点。
import * as THREE from 'three';
import { surfaceUV } from './surface-uv.js';
import { blockedZone, fits, grounded, crossed } from '../layout/access-zones.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Matrix3();
const _c = new THREE.Color();
const Y = new THREE.Vector3(0, 1, 0);

const TEMPLATES = {};
function fromGeometry(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  return {
    pos: g.attributes.position.array,
    nor: g.attributes.normal.array,
    uv: g.attributes.uv ? g.attributes.uv.array : null,
    count: g.attributes.position.count,
  };
}

/** 基础模板（单位尺寸）。名字后缀 b 表示底面在 y=0。 */
export function tpl(name) {
  if (TEMPLATES[name]) return TEMPLATES[name];
  let g;
  const seg = /^(cyl|cone)(\d+)$/.exec(name);
  if (seg) {
    const n = Number(seg[2]);
    g = seg[1] === 'cyl'
      ? new THREE.CylinderGeometry(0.5, 0.5, 1, n).translate(0, 0.5, 0)
      : new THREE.ConeGeometry(0.5, 1, n).translate(0, 0.5, 0);
    TEMPLATES[name] = fromGeometry(g);
    return TEMPLATES[name];
  }
  switch (name) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'sphere': g = new THREE.SphereGeometry(0.5, 14, 10); break;
    case 'sphereLo': g = new THREE.SphereGeometry(0.5, 8, 6); break;
    case 'ico': g = new THREE.IcosahedronGeometry(0.5, 1); break;
    case 'ico0': g = new THREE.IcosahedronGeometry(0.5, 0); break;
    case 'plane': g = new THREE.PlaneGeometry(1, 1); break; // XY 平面，朝 +z
    case 'planeUp': g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); break; // XZ 平面，朝 +y
    case 'torus': g = new THREE.TorusGeometry(0.5, 0.06, 6, 20); break;
    case 'halfTorus': g = new THREE.TorusGeometry(0.5, 0.06, 6, 16, Math.PI); break;
    case 'capsule': g = new THREE.CapsuleGeometry(0.5, 1, 4, 8); break;
    default: throw new Error('unknown template ' + name);
  }
  TEMPLATES[name] = fromGeometry(g);
  return TEMPLATES[name];
}

/** 局部坐标系 frame → 变换矩阵（平移到原点 + 绕 Y 旋转 −a，使局部 u 轴对准世界方向） */
export function frameMatrix(F) {
  const m = new THREE.Matrix4().makeRotationY(-F.a);
  m.setPosition(F.ox, 0, F.oz);
  return m;
}

const _mf = new THREE.Matrix4();

let propLibrary = null;
/**
 * 接上贴图模型库（src/render/props/library.js）。只有完整园区和小游戏合集接；
 * 没接的时候（单元测试、FPS、模型包下载失败）BatchSet.prop() 返回 false，各处照旧画程序化几何。
 */
export function usePropLibrary(library) { propLibrary = library || null; }
/** 当前接上的贴图模型库；没接时是 null（各处据此决定画贴图版还是程序化版）。 */
export const getPropLibrary = () => propLibrary;

export class Batcher {
  constructor(owner = null, withUv = false, projected = false) {
    this.cap = 0;
    this.n = 0;
    this.owner = owner;
    this.xf = null;
    this.withUv = withUv;
    this.projected = projected;
    this.grow(4096);
  }

  grow(min) {
    const cap = Math.max(min, Math.ceil(this.cap * 1.5));
    const resize = (arr, k, Type) => {
      const next = new Type(cap * k);
      if (arr) next.set(arr.subarray(0, this.n * k));
      return next;
    };
    this.pos = resize(this.pos, 3, Float32Array);
    this.nor = resize(this.nor, 3, Int8Array);
    this.col = resize(this.col, 3, Uint8Array);
    if (this.withUv) this.uv = resize(this.uv, 2, Float32Array);
    this.cap = cap;
  }

  /** 写入一个模板，按矩阵变换，颜色可为 THREE.Color / 十六进制数 / CSS 字符串 */
  push(t, m, color, uvMap) {
    const xf = this.owner ? this.owner.xf : this.xf;
    if (xf) m = _mf.multiplyMatrices(xf, m);
    if (this.n + t.count > this.cap) this.grow(this.n + t.count);
    _n.getNormalMatrix(m);
    const e = m.elements;
    const ne = _n.elements;
    if (color && color.isColor) _c.copy(color);
    else _c.set(color === undefined ? 0xffffff : color);
    const { pos, nor, uv, col } = this;
    const cr = Math.round(Math.min(1, Math.max(0, _c.r)) * 255), cg = Math.round(Math.min(1, Math.max(0, _c.g)) * 255), cb = Math.round(Math.min(1, Math.max(0, _c.b)) * 255);
    let pnx = 0, pny = 1, pnz = 0;
    for (let i = 0; i < t.count; i++) {
      const x = t.pos[i * 3], y = t.pos[i * 3 + 1], z = t.pos[i * 3 + 2];
      const o = (this.n + i) * 3;
      pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = t.nor[i * 3], ny = t.nor[i * 3 + 1], nz = t.nor[i * 3 + 2];
      const ax = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      const ay = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      const az = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const k = 127 / (Math.hypot(ax, ay, az) || 1);
      nor[o] = Math.round(ax * k); nor[o + 1] = Math.round(ay * k); nor[o + 2] = Math.round(az * k);
      col[o] = cr; col[o + 1] = cg; col[o + 2] = cb;
      const ou = (this.n + i) * 2;
      if (uv && this.projected) {
        // 同一三角形使用同一投影面，圆柱跨轴处也不会在三角形内部扭曲。
        if (i % 3 === 0) {
          let tx = 0, ty = 0, tz = 0;
          for (let j = i; j < Math.min(i + 3, t.count); j++) {
            tx += t.nor[j * 3]; ty += t.nor[j * 3 + 1]; tz += t.nor[j * 3 + 2];
          }
          pnx = ne[0] * tx + ne[3] * ty + ne[6] * tz;
          pny = ne[1] * tx + ne[4] * ty + ne[7] * tz;
          pnz = ne[2] * tx + ne[5] * ty + ne[8] * tz;
        }
        const coords = surfaceUV(pos[o], pos[o + 1], pos[o + 2], pnx, pny, pnz);
        uv[ou] = coords[0]; uv[ou + 1] = coords[1];
      } else if (uv && t.uv) {
        const u = t.uv[i * 2], v = t.uv[i * 2 + 1];
        if (uvMap) { uv[ou] = uvMap[0] + u * (uvMap[2] - uvMap[0]); uv[ou + 1] = uvMap[1] + v * (uvMap[3] - uvMap[1]); }
        else { uv[ou] = u; uv[ou + 1] = v; }
      }
    }
    this.n += t.count;
  }

  /** 以中心点 + 尺寸放置盒子，可绕 y 轴旋转 */
  box(cx, cy, cz, sx, sy, sz, color, ry = 0) {
    _p.set(cx, cy, cz);
    _q.setFromAxisAngle(Y, ry);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    this.push(tpl('box'), _m, color);
  }

  /** 由最小/最大角点放置轴对齐盒子 */
  boxMinMax(x0, y0, z0, x1, y1, z1, color) {
    this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), color);
  }

  /** 任意姿态：位置、四元数、缩放 */
  shape(name, position, quaternion, scale, color, uvMap) {
    _m.compose(position, quaternion, scale);
    this.push(tpl(name), _m, color, uvMap);
  }

  /** 竖直圆柱，底面在 y */
  cyl(x, y, z, r, h, color, seg = 16) {
    _p.set(x, y, z);
    _q.identity();
    _s.set(r * 2, h, r * 2);
    _m.compose(_p, _q, _s);
    this.push(tpl(`cyl${seg}`), _m, color);
  }

  cone(x, y, z, r, h, color, seg = 8) {
    _p.set(x, y, z);
    _q.identity();
    _s.set(r * 2, h, r * 2);
    _m.compose(_p, _q, _s);
    this.push(tpl(`cone${seg}`), _m, color);
  }

  sphere(x, y, z, rx, color, ry = rx, rz = rx, name = 'sphere') {
    _p.set(x, y, z);
    _q.identity();
    _s.set(rx * 2, ry * 2, rz * 2);
    _m.compose(_p, _q, _s);
    this.push(tpl(name), _m, color);
  }

  /** 两点之间的细杆（盒截面） */
  bar(a, b, thick, color) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return;
    _p.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    _q.setFromUnitVectors(Y, _s.set(dx / len, dy / len, dz / len));
    _s.set(thick, len, thick);
    _m.compose(_p, _q, _s);
    this.push(tpl('box'), _m, color);
  }

  /** 生成网格；为空返回 null */
  mesh(material, { shadow = true, receive = true, name = '', consume = false } = {}) {
    if (this.n === 0) return null;
    // flush owns these buffers exclusively. Transfer and trim them instead of
    // temporarily retaining both the grown builder and a full geometry copy.
    // A direct mesh() call still creates an independent, reusable snapshot.
    const take = (key, count) => {
      const source = this[key];
      const bytes = count * source.BYTES_PER_ELEMENT;
      const result = consume && typeof source.buffer.transferToFixedLength === 'function'
        ? new source.constructor(source.buffer.transferToFixedLength(bytes))
        : source.slice(0, count);
      if (consume) this[key] = null;
      return result;
    };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(take('pos', this.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(take('nor', this.n * 3), 3, true));
    if (this.withUv) g.setAttribute('uv', new THREE.BufferAttribute(take('uv', this.n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(take('col', this.n * 3), 3, true));
    if (consume) { this.n = 0; this.cap = 0; }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = receive;
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

const SIDE_ROT = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
const _sq = new THREE.Quaternion();
const _sp = new THREE.Vector3();
const _ss = new THREE.Vector3();

/** 招牌面片批次：每块招牌是一张朝向某方向的平面，UV 指向图集中的一格 */
export class SignBatch {
  constructor() {
    this.b = new Batcher(null, true);
  }
  /** 之后的 place 都按局部坐标系 F 解释（null 恢复世界坐标） */
  setFrame(F) {
    this.b.xf = F ? frameMatrix(F) : null;
    return this;
  }
  /** 按世界法线 (nx,nz) 放置招牌 */
  placeN(x, y, z, w, h, nx, nz, uv) {
    if (!uv) return;
    _sq.setFromAxisAngle(Y, Math.atan2(nx, nz));
    _sp.set(x, y, z);
    _ss.set(w, h, 1);
    this.b.shape('plane', _sp, _sq, _ss, 0xffffff, uv);
  }
  /** 中心 (x,y,z)，宽 w 高 h，朝向 side（外法线），uv=[u0,v0,u1,v1] */
  place(x, y, z, w, h, side, uv) {
    if (!uv) return;
    _sq.setFromAxisAngle(Y, SIDE_ROT[side]);
    _sp.set(x, y, z);
    _ss.set(w, h, 1);
    this.b.shape('plane', _sp, _sq, _ss, 0xffffff, uv);
  }
  flush(group, material) {
    const m = this.b.mesh(material, { shadow: false, receive: false, name: 'signs', consume: true });
    if (m) group.add(m);
    this.b = new Batcher(null, true);
  }
  /** 与 BatchSet.frame 相同：在 F 内执行 fn 后恢复 */
  frame(F, fn) {
    const prev = this.b.xf;
    this.setFrame(F);
    try { fn(); } finally { this.b.xf = prev; }
  }
}

/** 一组按材质名区分的 Batcher */
export class BatchSet {
  constructor(materials) {
    this.materials = materials;
    this.sets = {};
    this.xf = null;
    /** 这一批是不是露天的（场地、屋顶）：露天的贴图模型夜里不自发光。 */
    this.outdoor = false;
    /** 这一批所在楼层的摆放约束（layout/access-zones.js 的 floorGuard：留空区域、楼板、墙段）；没设就不检查。 */
    this.guard = null;
    /** 这一批所在楼层的楼面标高；设了以后，只有落在楼面上的模型才垫假阴影（摆在台面、台座上的不垫）。 */
    this.floorY = null;
  }
  get(key) {
    if (!this.sets[key]) {
      const mat = this.materials[key];
      const textured = !!(mat?.map || mat?.normalMap || mat?.roughnessMap);
      // 贴花（假阴影）用模板自带的 UV；其余带贴图的批次按世界坐标投影 UV
      this.sets[key] = new Batcher(this, textured, textured && !mat.userData?.decal);
    }
    return this.sets[key];
  }
  /** 之后写入的几何都按局部坐标系 F 解释（null 恢复世界坐标） */
  setFrame(F) {
    this.xf = F ? frameMatrix(F) : null;
    return this;
  }
  /** 在 F 内执行 fn 后恢复原 frame */
  frame(F, fn) {
    const prev = this.xf;
    this.setFrame(F);
    try { fn(); } finally { this.xf = prev; }
  }
  /** 当前局部坐标系里的 (x, z) 换成世界坐标。 */
  world(x, z) {
    const e = this.xf?.elements;
    return e ? [e[0] * x + e[8] * z + e[12], e[2] * x + e[10] * z + e[14]] : [x, z];
  }
  /**
   * (x, z)（当前局部坐标系）为中心、半径 r 的东西会不会挡住店门、扶梯口、电梯门或出入口。
   * 这一批没有设摆放约束（单元测试、FPS）时总是返回 false。
   */
  blocked(x, z, r = 0.4) {
    if (!this.guard) return false;
    const [wx, wz] = this.world(x, z);
    return !!blockedZone(this.guard.zones, wx, wz, r);
  }
  /** 半径 r 的东西放在 (x, z) 是不是不合适：挡了通道、脚下没有楼板（伸到洞口或板外）、或有墙从中间穿过。 */
  unfit(x, z, r = 0.4) {
    if (!this.guard) return false;
    const [wx, wz] = this.world(x, z);
    return !!blockedZone(this.guard.zones, wx, wz, r) || !fits(this.guard, wx, wz, r);
  }
  /**
   * (x, z)（当前局部坐标系）周围 r 米内，这一批里是不是已经摆了别的贴图模型（按各自的原点算）。
   * 两处各管各的摆放代码共用一块地方时（美食层的口袋休息区和用餐区），后摆的用它避开先摆的。
   * count：只看最先摆下的那么多件（调用方在自己开始摆之前记下 placed.length，就不会被自己刚摆的挡住）。
   */
  crowded(x, z, r, count = Infinity) {
    if (!this.placed?.length) return false;
    const [wx, wz] = this.world(x, z), n = Math.min(count, this.placed.length);
    for (let i = 0; i < n; i++) { const m = this.placed[i].m; if (Math.hypot(m[12] - wx, m[14] - wz) < r) return true; }
    return false;
  }
  /** 有没有贴地假阴影的材质（完整园区和小游戏有；FPS 和单元测试没有，下面两个函数就什么也不做）。 */
  get shaded() { return !!this.materials.aoBlob?.userData?.decal; }
  /**
   * 脚下的一团软阴影：以 (x, z) 为中心、w × d，贴在标高 y 的面上，绕竖轴转 ry。
   * 让家具、柱子、花池「落」在地上，而不是浮着。
   */
  blob(x, y, z, w, d, ry = 0) {
    if (!this.shaded) return;
    _p.set(x, y + 0.028, z); _q.setFromAxisAngle(Y, ry); _s.set(w, 1, d);
    this.get('aoBlob').shape('planeUp', _p, _q, _s, 0xffffff);
  }
  /**
   * 墙根的一条渐暗带：沿线段 (ax, az) → (bx, bz) 铺，贴着线的一侧最深，向 side 指的那一侧（1 是行进方向的左手边，−1 是右手边）
   * 淡出 width 米。贴在标高 y 的面上。
   */
  edge(ax, az, bx, bz, y, width = 0.7, side = 1) {
    if (!this.shaded) return;
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    // 贴图深的一边在模板的 −Z 一侧；转 θ 后模板 +X 对准线段方向，+Z 对准 (−dz, dx)
    const nx = -dz / len * side, nz = dx / len * side;
    _p.set((ax + bx) / 2 + nx * width / 2, y + 0.024, (az + bz) / 2 + nz * width / 2);
    _q.setFromAxisAngle(Y, Math.atan2(-dz, dx) + (side > 0 ? 0 : Math.PI));
    _s.set(len, 1, width);
    this.get('aoEdge').shape('planeUp', _p, _q, _s, 0xffffff);
  }
  /** 模型库里有没有这个模型（决定要不要走程序化的画法）。 */
  hasProp(id) { return !!propLibrary?.has(id); }
  /**
   * 摆一个贴图模型：底面中心在 (x, y, z)，绕竖轴转 ry（模型正面原本朝 +Z，转后朝 (sin ry, cos ry)），
   * scale 是数或 [sx, sy, sz]。outdoor 的模型夜里不自发光；color 给整件染色（白色贴图的椅子可以染成各种颜色）；
   * anchored 表示它固定在别的东西上（种在花坛里、摆在台座上），不做下面的落地检查。
   * 没有这个模型时返回 false，调用方改画程序化几何。当前局部坐标系（setFrame / frame）同样生效。
   */
  prop(id, x, y, z, ry = 0, scale = 1, { outdoor = this.outdoor, color = null, anchored = false } = {}) {
    if (!propLibrary?.has(id)) return false;
    const info = propLibrary.info?.(id), floorMounted = info?.mount === 'floor';
    const sx = Array.isArray(scale) ? scale[0] : scale, sz = Array.isArray(scale) ? scale[2] : scale;
    _p.set(x, y, z);
    _q.setFromAxisAngle(Y, ry);
    if (Array.isArray(scale)) _s.set(scale[0], scale[1], scale[2]); else _s.setScalar(scale);
    _m.compose(_p, _q, _s);
    if (this.xf) _m.premultiply(this.xf);
    // 保险：落地的模型不许挡住店门、扶梯口、电梯门和出入口，不许悬在洞口上，也不许有墙从中间穿过。
    // 不合适就不摆（仍返回 true，调用方不必改画别的）；成组的桌椅由调用方先用 unfit() 整组判断。
    if (this.guard && !anchored && floorMounted) {
      const reach = Math.max(info.size[0] * sx, info.size[2] * sz) * 0.5;
      if (reach > 0.15) {
        const e = _m.elements, wx = e[12], wz = e[14];
        const corner = (lx, lz) => [e[0] * lx + e[8] * lz + wx, e[2] * lx + e[10] * lz + wz];
        const why = blockedZone(this.guard.zones, wx, wz, reach) ? 'keptClear'
          : !grounded(this.guard, wx, wz, Math.min(reach, 0.9)) ? 'unfit'
          : crossed(this.guard, [corner(info.min[0], info.min[2]), corner(info.max[0], info.min[2]), corner(info.max[0], info.max[2]), corner(info.min[0], info.max[2])]) ? 'walled' : null;
        if (why) { if (propLibrary.stats) propLibrary.stats[why] = (propLibrary.stats[why] || 0) + 1; return true; }
      }
    }
    (this.placed ||= []).push({ id, m: _m.toArray(), outdoor: !!outdoor, color });
    // 落在楼面上的模型脚下自动垫一团软阴影。种在花坛里的、摆在台面上的、太小或太扁（井盖）的不垫。
    if (!anchored && floorMounted && this.shaded && (this.floorY == null || Math.abs(y - this.floorY) < 0.2)) {
      const w = info.size[0] * sx, d = info.size[2] * sz;
      if (Math.max(w, d) > 0.3 && info.size[1] * (Array.isArray(scale) ? scale[1] : scale) > 0.15) this.blob(x, y, z, w * 1.35 + 0.15, d * 1.35 + 0.15, ry);
    }
    return true;
  }
  /** 把所有批次合成网格加入 group */
  flush(group, opts = {}) {
    if (this.placed?.length) { propLibrary?.instantiate(group, this.placed); this.placed = null; }
    for (const [key, b] of Object.entries(this.sets)) {
      const mat = this.materials[key];
      if (!mat) throw new Error('missing material ' + key);
      const decal = !!mat.userData?.decal;
      const noShadow = key === 'glass' || key === 'glow' || key === 'glowSoft' || key === 'water' || decal;
      const m = b.mesh(mat, { shadow: !noShadow && opts.shadow !== false, receive: key !== 'glow' && key !== 'glowSoft' && !decal, name: key, consume: true });
      if (m) {
        if (key === 'glass' || key === 'water') m.renderOrder = 2;
        if (decal) m.renderOrder = 1; // 在不透明物之后、玻璃之前画
        group.add(m);
      }
    }
    this.sets = {};
  }
}
