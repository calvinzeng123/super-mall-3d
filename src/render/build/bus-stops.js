// 云澜大道公交站：星湾广场站的港湾路面、抬高站台、路缘石、候车亭（立柱、雨棚、玻璃挡风墙）、座椅、站牌、
// 垃圾桶、导向牌、站灯、港湾标线与过街横道（安全岛、停止线、信号灯），以及一期大道侧的路边候车亭。
// 静态构件都写进场地批次（沿用已有材质键，不增加绘制调用）；所有文字共用一张图集，
// 立面招牌一次绘制、路面"公交车站"字样一次绘制，另加港湾沥青和站区铺装两张面片。
import * as THREE from 'three';
import { flatShapeGeometry } from './shell.js';
import { cutSurfaceShapes, addCutSurfaceSlab } from './surface-shapes.js';
import { rect, rectPoly } from '../../layout/geom.js';
import { bench, streetLamp, zebra } from './props.js';
import { waitingBench } from './transit-center.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';

const C = {
  green: '#28453d', gold: '#b39c6e', cream: '#efe7cb', light: '#e2dcc7', ink: '#29433a', metal: '#53675f',
  kerb: '#c9c5bc', platform: '#d3ccbb', edge: '#bdb8ad', tactile: '#c7ac71', yellow: '#e7b416', white: '#ecebe6',
  teal: '#39746c', blue: '#2f86b0', pole: '#3b4046',
};
const Y_ROAD = -0.12, Y_BAY = -0.114, Y_WALK = -0.135, PAINT_BAY = Y_BAY + 0.01, PAINT_ROAD = Y_ROAD + 0.012;

// ---------------------------------------------------------------------------
// 图集：1024 × 1024，所有站名牌、站牌、导向牌、线路图和路面字共用一张贴图。
const ATLAS = 1024;
const SLOT = {
  fascia: i => [0, i * 128, 1024, 128],
  road: [0, 256, 512, 128],
  panel: i => [(i % 4) * 256, 384 + Math.floor(i / 4) * 320, 256, 320],
};
const uvOf = ([x, y, w, h]) => [(x + 2) / ATLAS, 1 - (y + h - 2) / ATLAS, (x + w - 2) / ATLAS, 1 - (y + 2) / ATLAS];

function frameBox(g, [x, y, w, h], bg, rule = C.gold) {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.strokeStyle = rule; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
}
function text(g, s, x, y, size, color, { font = FONT_CN, weight = 600, align = 'center', max } = {}) {
  g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  if (max) g.fillText(s, x, y, max); else g.fillText(s, x, y);
}
function badge(g, s, x, y, w, h, color) {
  g.fillStyle = color; g.fillRect(x, y, w, h);
  text(g, s, x + w / 2, y + h / 2 + 1, h * .62, '#ffffff', { font: FONT_EN, weight: 700 });
}

function paintFascia(g, slot, stop) {
  const [x, y, w, h] = slot;
  frameBox(g, slot, C.green);
  // Bus pictogram badge, the station name and the direction of travel.
  g.fillStyle = C.gold; g.fillRect(x + 22, y + 20, 88, 88);
  text(g, '公交', x + 66, y + 52, 32, C.green);
  text(g, 'BUS', x + 66, y + 86, 20, C.green, { font: FONT_EN, weight: 700 });
  text(g, stop.name, x + 140, y + 64, 68, C.cream, { align: 'left', max: 360 });
  g.fillStyle = C.gold; g.fillRect(x + 512, y + 26, 3, 76);
  text(g, stop.directions[0], x + 540, y + 46, 34, C.cream, { align: 'left', max: w - 560 });
  text(g, stop.directions[1], x + 540, y + 90, 24, '#d7c9a0', { font: FONT_EN, weight: 500, align: 'left', max: w - 560 });
}
function paintPole(g, slot, stop) {
  const [x, y, w] = slot;
  g.fillStyle = C.light; g.fillRect(x, y, w, 320);
  g.fillStyle = C.green; g.fillRect(x, y, w, 74);
  text(g, '星湾广场', x + w / 2, y + 30, 40, C.cream);
  text(g, 'XINGWAN PLAZA', x + w / 2, y + 60, 17, '#d7c9a0', { font: FONT_EN, weight: 600 });
  badge(g, '12', x + 14, y + 88, 56, 34, C.teal);
  text(g, '云澜接驳', x + 80, y + 106, 26, C.ink, { align: 'left' });
  text(g, '一期交通中心⇄二期星湾', x + w / 2, y + 142, 17, C.ink, { max: w - 20 });
  badge(g, '36', x + 14, y + 162, 56, 34, C.blue);
  text(g, '星湾 · 公园', x + 80, y + 180, 26, C.ink, { align: 'left' });
  text(g, stop.directions[0], x + w / 2, y + 222, 19, C.ink, { max: w - 20 });
  g.fillStyle = '#16191b'; g.fillRect(x + 10, y + 250, w - 20, 60);
  text(g, '下一班  2 分钟', x + w / 2, y + 272, 24, '#f2b544');
  text(g, 'NEXT BUS  2 MIN', x + w / 2, y + 297, 14, '#c99a3a', { font: FONT_EN, weight: 600 });
}
function paintTotem(g, slot, lines) {
  const [x, y, w] = slot;
  frameBox(g, slot, C.green);
  let yy = y + 50;
  for (const [s, size, color, font] of lines) {
    if (s === '-') { g.fillStyle = C.gold; g.fillRect(x + 30, yy - 6, w - 60, 2); yy += 18; continue; }
    text(g, s, x + w / 2, yy, size, color || C.cream, { font: font || FONT_CN, max: w - 30 });
    yy += size * 1.32;
  }
}
function paintRouteMap(g, slot, stop) {
  const [x, y, w] = slot;
  g.fillStyle = '#f3efe2'; g.fillRect(x, y, w, 320);
  g.fillStyle = C.green; g.fillRect(x, y, w, 46);
  text(g, '12路 · 36路  线路图', x + w / 2, y + 23, 22, C.cream);
  const stops = ['一期交通中心', '云澜汇', '星湾路', '星湾广场', '中央公园', '东外环'];
  const here = 3, top = y + 72, step = 44;
  g.fillStyle = C.teal; g.fillRect(x + 40, top, 6, step * (stops.length - 1));
  stops.forEach((s, i) => {
    const cy = top + i * step;
    g.fillStyle = i === here ? '#d24d3a' : '#ffffff'; g.beginPath(); g.arc(x + 43, cy, i === here ? 11 : 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.teal; g.lineWidth = 3; g.beginPath(); g.arc(x + 43, cy, i === here ? 11 : 8, 0, Math.PI * 2); g.stroke();
    text(g, i === here ? `${s}（本站）` : s, x + 66, cy, i === here ? 22 : 19, i === here ? '#a8331f' : C.ink, { align: 'left', max: w - 76 });
  });
  text(g, stop.travel < 0 ? '↑ 本侧开往 一期' : '↓ 本侧开往 东外环', x + w / 2, y + 304, 15, C.ink);
}

function paintAtlas(stops) {
  const canvas = makeCanvas(ATLAS, ATLAS), g = canvas.getContext('2d');
  g.clearRect?.(0, 0, ATLAS, ATLAS);
  const [wb, eb] = stops;
  paintFascia(g, SLOT.fascia(0), wb);
  paintFascia(g, SLOT.fascia(1), eb);
  // Road legend: yellow glyphs on a transparent background (alpha-tested).
  const [rx, ry] = SLOT.road;
  '公交车站'.split('').forEach((ch, i) => text(g, ch, rx + 64 + i * 128, ry + 66, 116, C.yellow, { weight: 700 }));
  paintPole(g, SLOT.panel(0), wb);
  paintPole(g, SLOT.panel(1), eb);
  const EN = FONT_EN;
  // Arrows are drawn for a reader facing the panel.
  paintTotem(g, SLOT.panel(2), [['二期星湾 ↑', 40], ['星湾广场门 · 冰场门', 21], ['XINGWAN MALL · ICE RINK', 15, '#d7c9a0', EN], ['-'], ['地铁 C 口 ←', 30], ['METRO EXIT C', 15, '#d7c9a0', EN], ['云澜汇 一期 ←', 21]]);
  paintTotem(g, SLOT.panel(3), [['公交 ↑', 44], ['星湾广场站', 28], ['12路 · 36路 往一期', 19], ['BUS STOP', 15, '#d7c9a0', EN], ['-'], ['过街 · 中央公园 ←', 21], ['CROSSING · PARK', 15, '#d7c9a0', EN]]);
  paintTotem(g, SLOT.panel(4), [['中央公园 ↑', 40], ['CENTRAL PARK', 16, '#d7c9a0', EN], ['湖滨步道 · 游船码头', 19], ['-'], ['地铁 G 口 →', 30], ['METRO EXIT G', 15, '#d7c9a0', EN], ['二期星湾 过街 →', 20]]);
  paintTotem(g, SLOT.panel(5), [['公交 ↑', 44], ['星湾广场站', 28], ['12路 · 36路 往东外环', 19], ['BUS STOP', 15, '#d7c9a0', EN], ['-'], ['过街 · 二期星湾 ←', 21], ['CROSSING · XINGWAN', 15, '#d7c9a0', EN]]);
  paintRouteMap(g, SLOT.panel(6), wb);
  paintRouteMap(g, SLOT.panel(7), eb);
  return canvasTexture(canvas, { clamp: true });
}

/** Textured quads merged into one geometry: c centre, r/u unit right/up vectors. */
function quadSet() {
  const pos = [], nor = [], uv = [];
  return {
    count: () => pos.length / 3,
    add(c, r, u, w, h, slot) {
      const n = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]];
      const [u0, v0, u1, v1] = uvOf(slot);
      const P = (a, b) => [c[0] + r[0] * a * w / 2 + u[0] * b * h / 2, c[1] + r[1] * a * w / 2 + u[1] * b * h / 2, c[2] + r[2] * a * w / 2 + u[2] * b * h / 2];
      const corners = [[P(-1, -1), [u0, v0]], [P(1, -1), [u1, v0]], [P(1, 1), [u1, v1]], [P(-1, 1), [u0, v1]]];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...corners[k][0]); nor.push(...n); uv.push(...corners[k][1]); }
    },
    /** Vertical panel facing the horizontal direction (nx, nz). */
    face(x, y, z, nx, nz, w, h, slot) { this.add([x, y, z], [nz, 0, -nx], [0, 1, 0], w, h, slot); },
    mesh(material, name) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, material);
      m.name = name; m.castShadow = false; m.receiveShadow = false;
      return m;
    },
  };
}

// ---------------------------------------------------------------------------
// 构件

/** Dashed line between two points on the ground (boxes in the batch). */
function dashes(B, [ax, az], [bx, bz], y, width, color, dash = 1, gap = .6) {
  const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, ry = -Math.atan2(dz, dx);
  for (let s = gap / 2; s + dash <= len; s += dash + gap) {
    const m = s + dash / 2;
    B.get('ext').box(ax + dx * m, y, az + dz * m, dash, .02, width, color, ry);
  }
}
/** Outward offset of a straight edge, away from point (cx, cz). */
function offsetEdge([ax, az], [bx, bz], d, [cx, cz]) {
  const len = Math.hypot(bx - ax, bz - az);
  let nx = -(bz - az) / len, nz = (bx - ax) / len;
  if (nx * (ax - cx) + nz * (az - cz) < 0) { nx = -nx; nz = -nz; }
  return [[ax + nx * d, az + nz * d], [bx + nx * d, bz + nz * d]];
}

/** Sloped plate from a platform edge (midpoint ex, ez) down to the paving,
 * descending along the horizontal unit vector (dx, dz). */
const _q = new THREE.Quaternion(), _tilt = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function ramp(B, ex, ez, dx, dz, width, high, low, run = 1.6, t = .12) {
  const drop = high - low, θ = Math.atan2(drop, run), u = run / 2 - Math.sin(θ) * t / 2;
  _tilt.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -θ);
  _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dz, dx)).multiply(_tilt);
  _p.set(ex + dx * u, (high + low) / 2 - Math.cos(θ) * t / 2, ez + dz * u);
  B.get('ext').shape('box', _p, _q, _s.set(Math.hypot(run, drop), t, width), C.platform);
}

function bayAndPlatform(B, s) {
  const σ = s.side, P = s.platform, r = P.rect, top = P.top, cx = (r.x0 + r.x1) / 2, len = r.x1 - r.x0;
  const centre = [(s.bay[1][0] + s.bay[2][0]) / 2, s.curbZ + σ * 1.75];
  // Raised boarding platform (top +0.06 m), sitting down to the sidewalk paving,
  // with ramps at both ends and behind the open end of the shelter.
  addCutSurfaceSlab(B, 'ext', P.poly, [], top, .2, C.platform);
  const midZ = (r.z0 + r.z1) / 2, backZ = σ < 0 ? r.z0 : r.z1, S = s.shelter;
  for (const [x, dx] of [[r.x0, -1], [r.x1, 1]]) ramp(B, x, midZ, dx, 0, r.z1 - r.z0, top, Y_WALK);
  const [o0, o1] = s.travel < 0 ? [S.x1 + .9, r.x1] : [r.x0, S.x0 - .7];
  ramp(B, (o0 + o1) / 2, backZ, 0, σ, o1 - o0, top, Y_WALK);
  // Boarding kerb stone, tactile warning strip and a gold safety line.
  B.get('ext').box(cx, (top + .005 + Y_WALK - .01) / 2, P.edgeZ + σ * .125, len, top + .005 - Y_WALK + .01, .25, C.edge);
  const tz = P.edgeZ + σ * .55;
  B.get('extSatin').box(cx, top + .006, tz, len - .3, .012, .3, C.tactile);
  for (let x = r.x0 + .3; x < r.x1 - .2; x += .33) B.get('extSatin').box(x, top + .015, tz, .02, .008, .22, '#ae935d');
  B.get('extSatin').box(cx, top + .004, P.edgeZ + σ * .3, len - .3, .008, .06, C.yellow);
  // Kerbs along both tapers (the platform itself is the kerb along the berths).
  for (const [a, b] of [[s.bay[0], s.bay[1]], [s.bay[2], s.bay[3]]]) {
    const [a2, b2] = offsetEdge(a, b, .3, centre);
    addCutSurfaceSlab(B, 'ext', [a, b, b2, a2], [], .02, .16, C.kerb);
  }
  // Yellow dashed bay outline just inside the kerbs and along the bay mouth.
  const inset = (a, b, d) => offsetEdge(a, b, -d, centre);
  const [m0, m1] = [[s.bay[0][0] + 1, s.curbZ + σ * .15], [s.bay[3][0] - 1, s.curbZ + σ * .15]];
  dashes(B, m0, m1, PAINT_BAY, .2, C.yellow);
  for (const [a, b] of [[s.bay[0], s.bay[1]], [s.bay[1], s.bay[2]], [s.bay[2], s.bay[3]]]) {
    const [a2, b2] = inset(a, b, .3);
    dashes(B, a2, b2, PAINT_BAY, .15, C.yellow, .8, .5);
  }
  // White bars at the front of each berth.
  for (const b of s.berths) {
    const x = s.travel < 0 ? b.rect.x0 : b.rect.x1;
    B.get('ext').box(x, PAINT_BAY, s.curbZ + σ * 1.75, .3, .02, 3.1, C.white);
  }
}

function shelterFrame(B, Q, s, atlasIndex) {
  const S = s.shelter, top = s.platform.top, h = S.h, back = S.back;
  for (const [px, pz] of S.posts) {
    B.get('extMetal').box(px, top + h / 2, pz, .14, h, .14, C.metal);
    B.get('extMetal').bar({ x: px, y: top + h - .45, z: pz }, { x: px, y: top + h - .04, z: S.front + back * .1 }, .07, C.metal);
  }
  // Canopy: steel frame, timber soffit and a soft light strip near the front.
  B.get('extMetal').box(S.x, top + h + .01, S.z, S.w + .3, .14, S.d + .3, C.metal);
  B.get('wood').box(S.x, top + h - .08, S.z, S.w, .04, S.d, '#b89d75');
  B.get('glowSoft').box(S.x, top + h - .105, S.z - back * S.d * .28, S.w - .6, .025, .08, '#f1dfb2');
  // Glass wind screen along the back, with steel rails.
  const sz = (S.screen.z0 + S.screen.z1) / 2;
  B.get('glass').box(S.x, top + 1.45, sz, S.w, 2.5, .05, '#ffffff');
  for (const y of [top + .18, top + 2.72]) B.get('extMetal').box(S.x, y, sz, S.w, .06, .08, C.metal);
  // Station name board standing on the canopy front edge, readable from the
  // road and from the plaza behind the shelter.
  const fz = S.front + back * .12, fy = top + h + .08 + .48;
  B.get('extMetal').box(S.x, fy, fz, 7.2, .96, .12, '#20332d');
  B.get('glowSoft').box(S.x, top + h + .1, fz, 7.2, .04, .14, '#f1dfb2');
  Q.face(S.x, fy, fz - back * .061, 0, -back, 6.96, .87, SLOT.fascia(atlasIndex));
  Q.face(S.x, fy, fz + back * .061, 0, back, 6.96, .87, SLOT.fascia(atlasIndex));
  // Route map light box on the inside of the wind screen.
  const m = s.map;
  B.get('extMetal').box(m.x, top + 1.45, m.z, m.w + .06, 1.3, m.d, '#20332d');
  Q.face(m.x, top + 1.45, m.z - back * (m.d / 2 + .004), 0, -back, m.w - .06, 1.22, SLOT.panel(6 + atlasIndex));
}

function furniture(B, Q, s, atlasIndex) {
  const top = s.platform.top;
  for (const seat of s.seats) waitingBench(B, seat);
  // Stop pole with a double-sided route panel facing along the kerb, and a
  // next-bus display below it.
  const { x: px, z: pz } = s.pole;
  B.get('extMetal').cyl(px, top, pz, .07, 3.05, C.pole, 10);
  B.get('extMetal').box(px, top + 2.38, pz, .07, 1.04, .84, '#20332d');
  for (const k of [-1, 1]) Q.face(px + k * .037, top + 2.38, pz, k, 0, .8, 1, SLOT.panel(atlasIndex));
  B.get('extSatin').cyl(px, top + 3.05, pz, .2, .05, C.gold, 16);
  B.get('glowSoft').box(px, top + 1.58, pz, .06, .2, .62, '#e9b24a');
  for (const b of s.bins) {
    B.get('extMetal').cyl(b.x, top, b.z, b.r, .86, '#3f5a50', 12);
    B.get('extMetal').cyl(b.x, top + .86, b.z, b.r + .02, .06, '#2a3a34', 12);
  }
  // Wayfinding totem in the pocket, both faces lettered.
  const t = s.totem;
  B.get('extSatin').box(t.x, Y_WALK + 1.3, t.z, t.w, 2.6, t.d, C.green);
  B.get('extSatin').box(t.x, Y_WALK + 2.64, t.z, t.w + .08, .08, t.d + .08, C.gold);
  const faces = s.side < 0 ? [[1, 2], [-1, 3]] : [[-1, 4], [1, 5]];
  for (const [nz, slot] of faces) Q.face(t.x, Y_WALK + 1.62, t.z + nz * (t.d / 2 + .004), 0, nz, .8, 1, SLOT.panel(slot));
  for (const l of s.lamps) streetLamp(B, l.x, l.z, Y_WALK, l.dir, 6);
}

function crossingFurniture(B, c) {
  const r = c.rect, cx = (r.x0 + r.x1) / 2, w = r.x1 - r.x0 - 1;
  // Bars parallel to the traffic, split at the refuge.
  for (const [z0, z1] of [[r.z0 + .4, c.refuge.z0 - .2], [c.refuge.z1 + .2, r.z1 - .4]]) zebra(B, cx, (z0 + z1) / 2, z1 - z0, w, 'x', PAINT_ROAD);
  for (const l of c.stopLines) B.get('ext').box(l.x, PAINT_ROAD, (l.z0 + l.z1) / 2, .4, .02, l.z1 - l.z0 - .2, C.white);
  // Dropped kerbs with tactile warning pads on both sidewalks.
  for (const z of [r.z0, r.z1]) B.get('extSatin').box(cx, Y_WALK + .006, z + Math.sign(z) * .55, r.x1 - r.x0, .012, .6, C.tactile);
  for (const sgl of c.signals) {
    const kerb = Math.abs(sgl.z) > 14, base = kerb ? Y_WALK : Y_ROAD, h = sgl.vehicle ? 5.6 : 3.1;
    B.get('extMetal').cyl(sgl.x, base, sgl.z, .08, h, C.pole, 10);
    // Pedestrian heads face across the carriageway (both ways on the refuge).
    const across = kerb ? [-Math.sign(sgl.z)] : [-1, 1];
    B.get('extMetal').box(sgl.x, base + 2.55, sgl.z, .3, .62, .26, '#23282c');
    for (const nz of across) {
      B.get('glowSoft').box(sgl.x, base + 2.7, sgl.z + nz * .135, .19, .19, .02, '#7a2c25');
      B.get('glowSoft').box(sgl.x, base + 2.42, sgl.z + nz * .135, .19, .19, .02, '#58d08a');
    }
    B.get('extMetal').box(sgl.x, base + 1.15, sgl.z, .12, .2, .12, '#e1d6a8');
    if (sgl.vehicle) {
      // Far-side vehicle signal on an arm over the kerb lane, facing the
      // approaching traffic that stops at the stop line.
      const armZ = sgl.z - Math.sign(sgl.z) * 4.2, fx = sgl.vehicle;
      B.get('extMetal').bar({ x: sgl.x, y: base + 5.3, z: sgl.z }, { x: sgl.x, y: base + 5.3, z: armZ }, .1, C.pole);
      B.get('extMetal').box(sgl.x, base + 4.75, armZ, .3, 1.05, .36, '#23282c');
      for (const [dy, col] of [[.33, '#d64a3a'], [0, '#5a4a1e'], [-.33, '#244d34']]) B.get('glowSoft').cyl(sgl.x + fx * .16, base + 4.75 + dy - .12, armZ, .12, .24, col, 10);
    }
  }
}

/** 一期大道侧的路边候车亭（原 site.js 绘制，造型不变）。 */
function kerbsideShelter(B, s) {
  const y = -0.14, { x, z } = s;
  B.get('extMetal').box(x, y + 1.5, z - 0.9, 8, 3, 0.08, '#4b5563');
  B.get('glass').box(x, y + 1.4, z - 0.85, 7.8, 2.4, 0.04, '#ffffff');
  B.get('extMetal').box(x, y + 3.05, z, 8.4, 0.12, 2.4, '#2f3439');
  B.get('glow').box(x + 3.2, y + 1.6, z - 0.95, 1.2, 1.8, 0.05, '#cfe8ff');
  for (const seat of s.seats) bench(B, seat.x, y, seat.z, 0);
}

function flatMesh(mat, polys, y, tile, name) {
  const shapes = polys.flatMap(p => cutSurfaceShapes(p, []));
  const g = flatShapeGeometry(shapes, y), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  const m = new THREE.Mesh(g, mat);
  m.name = name; m.receiveShadow = true;
  return m;
}

export function buildBusStops(ctx) {
  const all = ctx.layout.site.busStops;
  if (!all?.length) return null;
  const B = ctx.site.batch, group = new THREE.Group();
  group.name = 'bus-stops';
  for (const s of all.filter(s => s.kind === 'kerbside')) kerbsideShelter(B, s);
  const stops = all.filter(s => s.kind === 'bay');
  if (stops.length) {
    // Bay asphalt, and station paving where the pockets and crossing landings
    // extend the sidewalk into the lawns (the sidewalk itself is already paved).
    group.add(flatMesh(ctx.mats.floor('asphalt', 0.9), stops.map(s => s.bay), Y_BAY, 8, 'bus-bay-asphalt'));
    const paving = stops.flatMap(s => {
      const p = s.pocket.rect, l = s.landing.rect, σ = s.side;
      return [rectPoly(rect(p.x0, Math.min(p.z0, p.z1, σ * 20), p.x1, Math.max(p.z0, p.z1, σ * 20))),
        rectPoly(σ < 0 ? rect(l.x0, l.z0, l.x1, -20) : rect(l.x0, 20, l.x1, l.z1))];
    });
    group.add(flatMesh(ctx.mats.floor('paving', 0.8), paving, Y_WALK, 4.8, 'bus-station-paving'));
    const Q = quadSet(), road = quadSet();
    stops.forEach((s, i) => {
      bayAndPlatform(B, s);
      shelterFrame(B, Q, s, i);
      furniture(B, Q, s, i);
      // "公交车站" in the rear berth, upright for the driver pulling in.
      const berth = s.berths[1], bx = (berth.rect.x0 + berth.rect.x1) / 2, h = [s.travel, 0, 0];
      road.add([bx, PAINT_BAY + .014, s.curbZ + s.side * 1.75], [0, 0, s.travel], h, 2.9, 2.2, SLOT.road);
    });
    for (const c of ctx.layout.site.crossings.filter(c => c.busStop)) crossingFurniture(B, c);
    const texture = paintAtlas(stops);
    const signs = Q.mesh(ctx.mats.sign(texture), 'bus-stop-signs');
    const legend = road.mesh(new THREE.MeshStandardMaterial({ map: texture, alphaTest: .5, roughness: .8, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'bus-bay-legend');
    legend.receiveShadow = true;
    group.add(signs, legend);
    group.userData = { stops: stops.length, berths: stops.reduce((n, s) => n + s.berths.length, 0), signFaces: Q.count() / 6 };
  }
  ctx.site.group.add(group);
  ctx.busStops = { group, stops: all };
  return group;
}
