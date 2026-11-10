// 小游戏版里被裁掉的楼（二期、三期）的低细节体块：一个合并网格，每栋是一组多边形柱体。
// 数据来自 layout.arcade.massing（layout/arcade-scope.js）。
// 墙面贴一张现画的幕墙贴图（4 开间 × 4 层一幅，按米铺），夜里随机亮几扇窗；屋顶和基座靠顶点色区分。
import * as THREE from 'three';
import { rng } from '../textures.js';

/** 一幅贴图盖多宽、多高（m）：4 个 4 m 开间、4 层 3.6 m。 */
export const MASSING_TILE = [16, 14.4];

/** 幕墙贴图和夜景贴图（哪几扇窗亮着）。没有 DOM（单元测试）时返回 null，体块就是纯色的。 */
function facadeTextures() {
  if (typeof document === 'undefined') return null;
  const size = 512, cell = size / 4, rand = rng(2026);
  const make = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const day = make(), night = make(), g = day.getContext('2d'), n = night.getContext('2d');
  g.fillStyle = '#eef0f1'; g.fillRect(0, 0, size, size);
  n.fillStyle = '#000'; n.fillRect(0, 0, size, size);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * cell + 9, y = j * cell + 26, w = cell - 18, h = cell - 46;
    const glass = g.createLinearGradient(0, y, 0, y + h);
    glass.addColorStop(0, '#93a9ba'); glass.addColorStop(1, '#5f7688');
    g.fillStyle = glass; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(x, y, w, h * .22);
    g.fillStyle = '#c3c8cc'; g.fillRect(x + w / 2 - 2, y, 4, h);
    if (rand() < .38) { n.fillStyle = rand() < .5 ? '#ffd9a0' : '#fff1cf'; n.fillRect(x, y, w, h); }
  }
  g.fillStyle = '#b9bfc4';
  for (let j = 0; j <= 4; j++) g.fillRect(0, j * cell - 3, size, 6); // 楼板线
  const texture = (canvas) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  return { map: texture(day), emissiveMap: texture(night) };
}

const WALL = new THREE.Color(0xe3e6e8), ROOF = new THREE.Color(0xd6d9db), BASE = new THREE.Color(0xa9afb5);

/** 把一个多边形柱体的三角面写进数组。墙面按高度分两色：底部 4 m 深一些，像裙房基座。 */
function pushPrism(out, poly, y0, y1) {
  const area = poly.reduce((s, [x, z], i) => { const [nx, nz] = poly[(i + 1) % poly.length]; return s + x * nz - nx * z; }, 0);
  const pts = area < 0 ? [...poly].reverse() : poly; // 统一成 (x, z) 平面逆时针
  const yb = Math.min(y1, y0 + 4);
  // 墙面的 UV 按米铺：u 沿墙走，v 是标高；一幅贴图 16 m × 14.4 m
  const quad = (ax, az, bx, bz, ya, yb2, nx, nz, color, len) => {
    const v = [[ax, ya, az, 0], [bx, ya, bz, len], [bx, yb2, bz, len], [ax, ya, az, 0], [bx, yb2, bz, len], [ax, yb2, az, 0]];
    for (const [x, y, z, along] of v) {
      out.pos.push(x, y, z); out.nor.push(nx, 0, nz); out.col.push(color.r, color.g, color.b);
      out.uv.push(along / MASSING_TILE[0], y / MASSING_TILE[1]);
    }
  };
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const nx = dz / len, nz = -dx / len; // 逆时针多边形的外法线
    quad(ax, az, bx, bz, y0, yb, nx, nz, BASE, len);
    if (y1 > yb) quad(ax, az, bx, bz, yb, y1, nx, nz, WALL, len);
  }
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    // (x, z) 逆时针在 three 的右手系里朝下，交换两点让顶面朝上
    // 屋顶的 UV 都落在楼板线上（一条纯色带），看起来是一整块浅灰
    for (const i of [a, c, b]) { out.pos.push(pts[i][0], y1, pts[i][1]); out.nor.push(0, 1, 0); out.col.push(ROOF.r, ROOF.g, ROOF.b); out.uv.push(.5, 0); }
  }
}

/** @returns {THREE.Mesh|null} */
export function buildArcadeMassing(ctx) {
  const blocks = ctx.layout.arcade?.massing;
  if (!blocks?.length) return null;
  const out = { pos: [], nor: [], col: [], uv: [] };
  for (const b of blocks) pushPrism(out, b.poly, b.y0, b.y1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  const textures = facadeTextures();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: textures ? 0.55 : 0.92, metalness: textures ? 0.15 : 0,
    ...(textures ? { ...textures, emissive: 0xffffff, emissiveIntensity: 0 } : {}) });
  if (textures) ctx.mats?.onNight?.((t) => { material.emissiveIntensity = t * 0.75; });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'arcade-massing';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  ctx.root.add(mesh);
  return mesh;
}
