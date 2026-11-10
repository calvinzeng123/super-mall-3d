// 小游戏版里被裁掉的楼（二期、三期）的低细节体块：一个合并网格，每栋是一组多边形柱体。
// 数据来自 layout.arcade.massing（layout/arcade-scope.js）。
import * as THREE from 'three';

const WALL = new THREE.Color(0xc9cdd1), ROOF = new THREE.Color(0xdfe2e4), BASE = new THREE.Color(0x9aa1a8);

/** 把一个多边形柱体的三角面写进数组。墙面按高度分两色：底部 4 m 深一些，像裙房基座。 */
function pushPrism(out, poly, y0, y1) {
  const area = poly.reduce((s, [x, z], i) => { const [nx, nz] = poly[(i + 1) % poly.length]; return s + x * nz - nx * z; }, 0);
  const pts = area < 0 ? [...poly].reverse() : poly; // 统一成 (x, z) 平面逆时针
  const yb = Math.min(y1, y0 + 4);
  const quad = (ax, az, bx, bz, ya, yb2, nx, nz, color) => {
    const v = [[ax, ya, az], [bx, ya, bz], [bx, yb2, bz], [ax, ya, az], [bx, yb2, bz], [ax, yb2, az]];
    for (const [x, y, z] of v) { out.pos.push(x, y, z); out.nor.push(nx, 0, nz); out.col.push(color.r, color.g, color.b); }
  };
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const nx = dz / len, nz = -dx / len; // 逆时针多边形的外法线
    quad(ax, az, bx, bz, y0, yb, nx, nz, BASE);
    if (y1 > yb) quad(ax, az, bx, bz, yb, y1, nx, nz, WALL);
  }
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    // (x, z) 逆时针在 three 的右手系里朝下，交换两点让顶面朝上
    for (const i of [a, c, b]) { out.pos.push(pts[i][0], y1, pts[i][1]); out.nor.push(0, 1, 0); out.col.push(ROOF.r, ROOF.g, ROOF.b); }
  }
}

/** @returns {THREE.Mesh|null} */
export function buildArcadeMassing(ctx) {
  const blocks = ctx.layout.arcade?.massing;
  if (!blocks?.length) return null;
  const out = { pos: [], nor: [], col: [] };
  for (const b of blocks) pushPrism(out, b.poly, b.y0, b.y1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
  mesh.name = 'arcade-massing';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  ctx.root.add(mesh);
  return mesh;
}
