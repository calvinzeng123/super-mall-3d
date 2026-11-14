// 一期门口的道路配套（游览模式）：云澜大道 × 星湾路路口原来只有斑马线和停止线，没有信号灯和车道导向箭头。
// 这里补上：四个进口道每条车道一组导向箭头（内侧左转、中间直行、外侧直右），四个路口转角各一根信号灯杆
// （两根悬臂分别伸到大道和星湾路的车道上方挂机动车信号灯，杆身上一组行人信号灯朝人行横道），转角路缘一块盲道提示砖。
// 靠右行驶：大道东行车在 +z 半幅、西行在 −z；星湾路往 +z 走的车在 −x 半幅。停止线已有（site.js：x=±17.5、z=±21）。

const Y_PAINT = -0.106, Y_WALK = -0.135; // 同 bus-stops.js 的路面、人行道标高
const WHITE = '#ecebe6', POLE = '#3b4045', HOUSING = '#23282c';

export function buildP1Streets(ctx) {
  if (!ctx.depthCues || ctx.layout.playable || !ctx.site?.batch) return;
  const B = ctx.site.batch, roads = new Set(ctx.layout.site.roads.map((r) => r.id));
  if (!roads.has('avenue') || !roads.has('xingwan')) return;
  const arrows = [];
  // 进口道：前进方向 (fx, fz)、车道中心（横向坐标）和每条车道的箭头种类
  const approaches = [
    { f: [1, 0], at: -26, lanes: [[4.1, 'L'], [8, 'S'], [12, 'SR']] },
    { f: [-1, 0], at: 26, lanes: [[-4.1, 'L'], [-8, 'S'], [-12, 'SR']] },
    { f: [0, 1], at: -29, lanes: [[-2.5, 'L'], [-7.5, 'SR']] },
    { f: [0, -1], at: 29, lanes: [[2.5, 'L'], [7.5, 'SR']] },
  ];
  for (const a of approaches) for (const [c, kind] of a.lanes) {
    const [fx, fz] = a.f, x = fx ? a.at : c, z = fx ? c : a.at;
    laneArrow(B, x, z, fx, fz, kind);
    arrows.push(kind);
  }
  // 信号灯杆：四个转角（人行道上，离路缘 1.6 米）
  const poles = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 11.6, z = sz * 15.6;
    signalPole(B, x, z, sx, sz);
    // 盲道提示砖：转角两条人行横道口
    B.get('extSatin').box(x, Y_WALK + 0.01, sz * 14.6, 2.4, 0.012, 0.6, '#e2c94a');
    B.get('extSatin').box(sx * 10.6, Y_WALK + 0.01, z, 0.6, 0.012, 2.4, '#e2c94a');
    poles.push([x, z]);
  }
  ctx.p1Streets = { arrows: arrows.length, poles };
}

/** 路面导向箭头：局部前进方向 f，左手 l = (fz, −fx)（靠右行驶，左手朝中线）。S 直行、L 左转、SR 直行加右转 */
function laneArrow(B, x, z, fx, fz, kind) {
  const lx = fz, lz = -fx, ang = Math.atan2(-fz, fx);
  const at = (u, v) => [x + fx * u + lx * v, z + fz * u + lz * v];
  const bar = (u, v, len, w, rot = 0) => { const [px, pz] = at(u, v); B.get('ext').box(px, Y_PAINT, pz, len, 0.02, w, WHITE, ang + rot); };
  // 箭头尖在 (u, v)，朝局部角 rot（0 = 前进方向，+π/2 = 左手）：两根 0.75 米的斜杆在尖上合拢
  const head = (u, v, rot = 0) => {
    const du = Math.cos(rot), dv = Math.sin(rot), pu = -dv, pv = du;
    for (const s of [-1, 1]) { const [px, pz] = at(u - 0.3 * du + s * 0.22 * pu, v - 0.3 * dv + s * 0.22 * pv); B.get('ext').box(px, Y_PAINT, pz, 0.75, 0.02, 0.18, WHITE, ang + rot - s * 0.633); }
  };
  bar(-1.6, 0, 3.2, 0.2); // 杆身
  if (kind !== 'L') head(0.55, 0);
  if (kind === 'L') { bar(0.3, 0.45, 0.2, 1.1, 0); bar(0.3, 0.95, 1.2, 0.2, Math.PI / 2); head(0.3, 1.6, Math.PI / 2); }
  if (kind === 'SR') { bar(-0.6, -0.55, 1.2, 0.2, -Math.PI / 2); head(-0.6, -1.25, -Math.PI / 2); }
}

function signalPole(B, x, z, sx, sz) {
  const h = 6.2;
  B.get('extMetal').cyl(x, Y_WALK, z, 0.11, h, POLE, 10);
  B.get('extMetal').cyl(x, Y_WALK, z, 0.2, 0.5, POLE, 10);
  // 大道方向悬臂：伸向道路中线，灯头朝对面驶来的车（−z 半幅西行 → 朝 +x）
  const az = z - sz * 9, faceX = -sz;
  B.get('extMetal').bar({ x, y: Y_WALK + 5.8, z }, { x, y: Y_WALK + 5.8, z: az }, 0.12, POLE);
  for (const t of [0.55, 1]) vehicleHead(B, x + faceX * 0.2, Y_WALK + 5.2, z + (az - z) * t, faceX, 0, t === 1 ? 'G' : 'G');
  // 星湾路方向悬臂
  const ax = x - sx * 7.5, faceZ = sx;
  B.get('extMetal').bar({ x, y: Y_WALK + 5.4, z }, { x: ax, y: Y_WALK + 5.4, z }, 0.1, POLE);
  vehicleHead(B, ax, Y_WALK + 4.8, z + faceZ * 0.2, 0, faceZ, 'R');
  // 行人信号灯：朝两条人行横道（沿 x 过大道、沿 z 过星湾路）
  for (const [nx, nz] of [[0, -sz], [-sx, 0]]) {
    const px = x + nx * 0.22, pz = z + nz * 0.22;
    B.get('extMetal').box(px, Y_WALK + 2.6, pz, nx ? 0.26 : 0.3, 0.62, nx ? 0.3 : 0.26, HOUSING);
    B.get('glowSoft').box(px + nx * 0.14, Y_WALK + 2.75, pz + nz * 0.14, nx ? 0.02 : 0.19, 0.19, nx ? 0.19 : 0.02, nx ? '#d64a3a' : '#7a2c25');
    B.get('glowSoft').box(px + nx * 0.14, Y_WALK + 2.47, pz + nz * 0.14, nx ? 0.02 : 0.19, 0.19, nx ? 0.19 : 0.02, nx ? '#244d34' : '#58d08a');
  }
  B.get('extMetal').box(x - sx * 0.16, Y_WALK + 1.15, z, 0.12, 0.2, 0.12, '#e1d6a8'); // 过街按钮
}

/** 机动车信号灯：竖排三灯，face 是灯面朝向；lit = 'R' | 'G' */
function vehicleHead(B, x, y, z, fx, fz, lit) {
  B.get('extMetal').box(x, y, z, fx ? 0.34 : 0.4, 1.1, fx ? 0.4 : 0.34, HOUSING);
  const cols = lit === 'R' ? ['#ff4a3a', '#4a3d1c', '#1d3a28'] : ['#5a211c', '#4a3d1c', '#3cf07a'];
  [0.34, 0, -0.34].forEach((dy, i) => B.get('glowSoft').box(x + fx * 0.18, y + dy, z + fz * 0.18, fx ? 0.03 : 0.24, 0.24, fx ? 0.24 : 0.03, cols[i]));
}
