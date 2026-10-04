// 扶梯：桁架、踏步（上行/下行两种材质，贴图滚动）、玻璃栏板、黑色扶手、梳齿板。
import * as THREE from 'three';
import { THEME } from '../theme.js';

const PITCH = Math.PI / 6;
const STEP_W = 1.0;
const LANDING = 2.4;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/** 按基向量放置盒子（X 沿长度、Y 向上、Z 横向） */
function orientedBox(B, key, c, len, h, w, X, Y, Z, color) {
  _m.makeBasis(X, Y, Z);
  _q.setFromRotationMatrix(_m);
  B.get(key).shape('box', c, _q, new THREE.Vector3(len, h, w), color);
}

export function buildEscalators(ctx) {
  const strips = {}; // levelId → { up: [], down: [] }
  for (const e of ctx.layout.escalators) {
    const L = ctx.levels[e.from];
    const B = L.batch;
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    const px = -uz, pz = ux;
    const y0 = e.bottom.y, y1 = e.top.y;
    const slope = Math.hypot(run, y1 - y0);
    const cos = Math.cos(PITCH), sin = Math.sin(PITCH);
    const Xs = new THREE.Vector3(ux * cos, sin, uz * cos);
    const Ys = new THREE.Vector3(-ux * sin, cos, -uz * sin);
    const Zs = new THREE.Vector3(px, 0, pz);
    const Xh = new THREE.Vector3(ux, 0, uz);
    const Yh = new THREE.Vector3(0, 1, 0);
    const at = (s, t, y) => new THREE.Vector3(e.bottom.x + ux * s + px * t, y, e.bottom.z + uz * s + pz * t);
    const short = ctx.lvById[e.from].short;
    const trussCol = short === '1F' || short === 'B1M' ? '#b9a27a' : '#c3c9cf';
    const midY = (y0 + y1) / 2;

    // 桁架：斜段 + 上下水平段（外包装饰板）
    orientedBox(B, 'metal', at(run / 2, 0, midY - 0.55 / cos), slope + 0.4, 1.0, e.width, Xs, Ys, Zs, trussCol);
    orientedBox(B, 'metal', at(run + LANDING / 2 - 0.2, 0, y1 - 0.45), LANDING + 0.4, 0.9, e.width, Xh, Yh, Zs, trussCol);
    // 底部机坑盖板 / 顶部梳齿板
    orientedBox(B, 'metal', at(-LANDING / 2, 0, y0 + 0.012), LANDING, 0.02, e.width, Xh, Yh, Zs, '#9aa0a6');
    orientedBox(B, 'metal', at(run + LANDING / 2, 0, y1 + 0.012), LANDING, 0.02, e.width, Xh, Yh, Zs, '#9aa0a6');
    // 栏板与扶手（两侧）
    for (const side of [-1, 1]) {
      const t = side * (e.width / 2 - 0.12);
      orientedBox(B, 'glass', at(run / 2, t, midY + 0.55 / cos), slope, 0.9, 0.03, Xs, Ys, Zs, 0xffffff);
      orientedBox(B, 'glass', at(-0.6, t, y0 + 0.55), 1.2, 0.9, 0.03, Xh, Yh, Zs, 0xffffff);
      orientedBox(B, 'glass', at(run + 0.6, t, y1 + 0.55), 1.2, 0.9, 0.03, Xh, Yh, Zs, 0xffffff);
      orientedBox(B, 'matte', at(run / 2, t, midY + 1.02 / cos), slope + 0.1, 0.09, 0.1, Xs, Ys, Zs, '#1d2023');
      orientedBox(B, 'matte', at(-0.65, t, y0 + 1.02), 1.4, 0.09, 0.1, Xh, Yh, Zs, '#1d2023');
      orientedBox(B, 'matte', at(run + 0.65, t, y1 + 1.02), 1.4, 0.09, 0.1, Xh, Yh, Zs, '#1d2023');
      // 裙板
      orientedBox(B, 'metal', at(run / 2, t, midY + 0.12 / cos), slope, 0.25, 0.06, Xs, Ys, Zs, '#d5d9dd');
      // 扶手端部回转
      for (const [s, y] of [[-1.35, y0 + 0.62], [run + 1.35, y1 + 0.62]]) {
        const c = at(s, t, y);
        _m.makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(px, 0, pz));
        _q.setFromRotationMatrix(_m);
        const flip = s < 0 ? Math.PI / 2 : -Math.PI / 2;
        const qq = _q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), flip));
        B.get('matte').shape('halfTorus', c, qq, new THREE.Vector3(0.82, 0.82, 1.4), '#1d2023');
      }
    }
    // 踏步带（动画贴图）
    if (!strips[e.from]) strips[e.from] = { up: [], down: [] };
    strips[e.from][e.dir].push({ e, ux, uz, px, pz, run, y0, y1 });
    void THEME;
  }

  for (const [levelId, s] of Object.entries(strips)) {
    for (const dir of ['up', 'down']) {
      if (!s[dir].length) continue;
      const geo = stripGeometry(s[dir]);
      const mesh = new THREE.Mesh(geo, ctx.mats.steps[dir]);
      mesh.receiveShadow = true;
      mesh.name = `steps-${dir}`;
      ctx.levels[levelId].base.add(mesh);
    }
  }
  const up = ctx.mats.steps.up.map;
  const down = ctx.mats.steps.down.map;
  ctx.dynamic.push({
    update(dt) {
      up.offset.y -= dt * 0.5 / 0.4;
      down.offset.y += dt * 0.5 / 0.4;
    },
  });
}

/** 踏步带几何：下平台 → 斜段 → 上平台，UV 的 v 以 0.4m 为一级 */
function stripGeometry(list) {
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  let base = 0;
  for (const { e, ux, uz, px, pz, run, y0, y1 } of list) {
    const prof = [[-LANDING + 0.15, y0 + 0.03], [0, y0 + 0.03], [run, y1 + 0.03], [run + LANDING - 0.15, y1 + 0.03]];
    let acc = 0;
    prof.forEach(([s, y], i) => {
      if (i > 0) acc += Math.hypot(s - prof[i - 1][0], y - prof[i - 1][1]);
      for (const t of [-STEP_W / 2, STEP_W / 2]) {
        pos.push(e.bottom.x + ux * s + px * t, y, e.bottom.z + uz * s + pz * t);
        uv.push(t > 0 ? 1 : 0, acc / 0.4);
        nor.push(0, 1, 0);
      }
    });
    for (let i = 0; i < prof.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    base += prof.length * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
