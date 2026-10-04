// Batcher：把大量小几何（盒子、圆柱、球……）按矩阵变换写入同一块顶点缓冲，
// 带逐顶点颜色，最后合成一个 Mesh —— 每层每种材质只需一次绘制调用。
import * as THREE from 'three';

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

export class Batcher {
  constructor(owner = null) {
    this.cap = 0;
    this.n = 0;
    this.owner = owner;
    this.xf = null;
    this.grow(8192);
  }

  grow(min) {
    const cap = Math.max(min, this.cap * 2);
    const resize = (arr, k) => {
      const next = new Float32Array(cap * k);
      if (arr) next.set(arr.subarray(0, this.n * k));
      return next;
    };
    this.pos = resize(this.pos, 3);
    this.nor = resize(this.nor, 3);
    this.uv = resize(this.uv, 2);
    this.col = resize(this.col, 3);
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
    for (let i = 0; i < t.count; i++) {
      const x = t.pos[i * 3], y = t.pos[i * 3 + 1], z = t.pos[i * 3 + 2];
      const o = (this.n + i) * 3;
      pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = t.nor[i * 3], ny = t.nor[i * 3 + 1], nz = t.nor[i * 3 + 2];
      let ax = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      let ay = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      let az = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const len = Math.hypot(ax, ay, az) || 1;
      nor[o] = ax / len; nor[o + 1] = ay / len; nor[o + 2] = az / len;
      col[o] = _c.r; col[o + 1] = _c.g; col[o + 2] = _c.b;
      const ou = (this.n + i) * 2;
      if (t.uv) {
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
  mesh(material, { shadow = true, receive = true, name = '' } = {}) {
    if (this.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, this.n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.n * 3), 3));
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
    this.b = new Batcher();
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
    const m = this.b.mesh(material, { shadow: false, receive: false, name: 'signs' });
    if (m) group.add(m);
    this.b = new Batcher();
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
  }
  get(key) {
    if (!this.sets[key]) this.sets[key] = new Batcher(this);
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
  /** 把所有批次合成网格加入 group */
  flush(group, opts = {}) {
    for (const [key, b] of Object.entries(this.sets)) {
      const mat = this.materials[key];
      if (!mat) throw new Error('missing material ' + key);
      const noShadow = key === 'glass' || key === 'glow' || key === 'glowSoft' || key === 'water';
      const m = b.mesh(mat, { shadow: !noShadow && opts.shadow !== false, receive: key !== 'glow' && key !== 'glowSoft', name: key });
      if (m) {
        if (key === 'glass' || key === 'water') m.renderOrder = 2;
        group.add(m);
      }
    }
    this.sets = {};
  }
}
