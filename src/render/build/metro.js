// 地铁云澜汇站（渲染）：站厅（墙面、圆柱、闸机、栏杆、售票机、客服中心、站名墙、导向牌）、四条通道（墙面、广告灯箱、导向带、
// 尽端连接口）、站台（屏蔽门、轨道、隧道口、两列往返列车、到站屏、长椅）、地面出入口（玻璃雨棚、楼梯、上行扶梯、M 标识柱）、
// 各期地下层的地铁连接口（门框 + 灯箱）。吊顶只在相机进入地下时显示，俯视时露出站内；列车在隧道口用裁剪平面截断。
import * as THREE from 'three';
import { frame, toW, toL, subtractInterval } from '../../layout/geom.js';
import { EXIT, carve } from '../../layout/metro.js';
import { buildMallStairLevel, buildStairApproach } from './mall-stairs.js';
import { BatchSet, SignBatch } from '../batch.js';
import { drawEscalator, stripGeometry } from './escalators.js';
import { makeCanvas, canvasTexture, scaled, releaseAfterUpload, FONT_CN, FONT_EN } from '../textures.js';
import { clearHeight } from './shell.js';

const RED = '#c8352b';
const LINE = '7';
const WALL = '#e9ecef';
const DEG = 180 / Math.PI;
/** 各通道的导向色与去向（与所通往的一期 / 二期 / 三期 / 公园主题色一致） */
const PASSAGE = {
  PA: { color: '#b08d4f', cn: '一期 云澜汇', en: 'YUNLAN MALL · B1M FOOD COURT', end: '一期 云澜汇 · B1M 美食广场' },
  PC: { color: '#c2402f', cn: '二期 星湾', en: 'XINGWAN · B1 PARKING', end: '二期 星湾 · B1 停车场' },
  PD: { color: '#9a5b34', cn: '三期 云澜里', en: 'YUNLAN LANE · B1 PARKING', end: '三期 云澜里 · B1 停车场' },
  PB: { color: '#4a9a50', cn: '中央公园', en: 'CENTRAL PARK', end: '中央公园' },
};
const ADS = [
  ['云澜汇 周年庆', 'YUNLAN MALL · 全场 8 折起', '#7a1f2b', '#d9a24a'],
  ['星湾 真冰场', 'XINGWAN ICE RINK · 冬季限定', '#0f3d5c', '#5fb7e5'],
  ['云澜里 周末市集', 'YUNLAN LANE · 每周六 18:00', '#5a2d18', '#e0a060'],
  ['云澜光穹 艺术中庭', 'ART DOME · 天台夜景', '#3b2a17', '#d9a24a'],
  ['IMAX 星湾影城', 'XINGWAN IMAX · 新片上映', '#111a24', '#f0c040'],
  ['湖畔音乐节', 'CENTRAL PARK · LAKESIDE LIVE', '#1f5133', '#9be07a'],
];
/** 列车：6 节 × 19m，每侧每节 4 樘门（车厢局部 x）；停车时列车中心在 x=0 */
const CAR = 19;
const DOORS = [-6.6, -2.2, 2.2, 6.6];
const XCLIP = 70;
const XFAR = 186;

// ---------------------------------------------------------------------------
// 导向牌图集（一张贴图、一次绘制）

function drawSignCell(g, x, y, w, h, s) {
  g.save();
  g.translate(x, y);
  g.fillStyle = s.bg || '#23282d';
  g.fillRect(0, 0, w, h);
  if (s.line !== false) {
    g.fillStyle = s.color || RED;
    g.fillRect(0, h - Math.round(h * 0.07), w, Math.round(h * 0.07));
  }
  const fg = s.fg || '#ffffff';
  let left = h * 0.18;
  let right = w - h * 0.18;
  if (s.badge) {
    const r = h * 0.3;
    g.fillStyle = s.color || RED;
    g.beginPath();
    g.arc(left + r, h * 0.46, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = s.badgeFg || '#ffffff';
    g.font = `800 ${Math.round(r * 1.25)}px ${FONT_EN}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s.badge, left + r, h * 0.49);
    left += r * 2 + h * 0.14;
  }
  if (s.arrow) {
    const a = h * 0.46;
    const cx = s.arrowLeft ? left + a / 2 : right - a / 2;
    g.save();
    g.translate(cx, h * 0.46);
    g.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[s.arrow]);
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(a * 0.5, 0); g.lineTo(0, -a * 0.44); g.lineTo(0, -a * 0.17); g.lineTo(-a * 0.5, -a * 0.17);
    g.lineTo(-a * 0.5, a * 0.17); g.lineTo(0, a * 0.17); g.lineTo(0, a * 0.44); g.closePath();
    g.fill();
    g.restore();
    if (s.arrowLeft) left += a + h * 0.14;
    else right -= a + h * 0.14;
  }
  const fit = (text, weight, px, family, max) => {
    let size = px;
    g.font = `${weight} ${size}px ${family}`;
    while (g.measureText(text).width > max && size > 10) {
      size -= 2;
      g.font = `${weight} ${size}px ${family}`;
    }
  };
  g.textAlign = s.center ? 'center' : 'left';
  g.textBaseline = 'middle';
  const tx = s.center ? (left + right) / 2 : left;
  g.fillStyle = fg;
  fit(s.text, 700, Math.round(h * (s.sub ? 0.36 : 0.46)), FONT_CN, right - left);
  g.fillText(s.text, tx, s.sub ? h * 0.37 : h * 0.47);
  if (s.sub) {
    g.fillStyle = s.subColor || 'rgba(255,255,255,0.74)';
    fit(s.sub, 600, Math.round(h * 0.19), FONT_EN, right - left);
    g.fillText(s.sub, tx, h * 0.72);
  }
  g.restore();
}

function drawAd(g, x, y, w, h, [title, sub, a, b]) {
  const grd = g.createLinearGradient(x, y, x + w, y + h);
  grd.addColorStop(0, a);
  grd.addColorStop(1, b);
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    g.arc(x + w * (0.6 + k * 0.1), y + h * (0.2 + (k % 3) * 0.25), h * (0.12 + k * 0.04), 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = `800 ${Math.round(h * 0.2)}px ${FONT_CN}`;
  g.fillText(title, x + w * 0.07, y + h * 0.42);
  g.font = `600 ${Math.round(h * 0.085)}px ${FONT_EN}`;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(sub, x + w * 0.07, y + h * 0.66);
}

function drawLineMap(g, x, y, w, h) {
  g.fillStyle = '#f4f5f6';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#23282d';
  g.font = `700 ${Math.round(h * 0.13)}px ${FONT_CN}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(`地铁 ${LINE} 号线 线路图`, x + 24, y + h * 0.14);
  const names = ['星湾北', '星湾', '云澜汇', '云澜里', '湖滨', '南山'];
  const y0 = y + h * 0.56;
  g.fillStyle = RED;
  g.fillRect(x + 50, y0 - 7, w - 100, 14);
  names.forEach((n, i) => {
    const cx = x + 70 + ((w - 140) * i) / (names.length - 1);
    const here = n === '云澜汇';
    g.fillStyle = '#ffffff';
    g.strokeStyle = here ? '#23282d' : RED;
    g.lineWidth = 7;
    g.beginPath();
    g.arc(cx, y0, here ? 20 : 14, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#23282d';
    g.textAlign = 'center';
    g.font = `${here ? 800 : 600} ${Math.round(h * (here ? 0.13 : 0.1))}px ${FONT_CN}`;
    g.fillText(n, cx, y0 + h * 0.22);
  });
}

/** 货架式装箱：返回 cell(id) → [u0,v0,u1,v1] 与 aspect(id) */
function makeAtlas(entries) {
  const W = 2048;
  let x = 0, y = 0, rowH = 0;
  const pos = new Map();
  for (const e of entries) {
    if (x + e.w > W) { x = 0; y += rowH; rowH = 0; }
    pos.set(e.id, [x, y]);
    x += e.w;
    rowH = Math.max(rowH, e.h);
  }
  const H = y + rowH;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const cells = new Map();
  for (const e of entries) {
    const [px, py] = pos.get(e.id);
    e.draw(g, px, py, e.w, e.h);
    const pad = 1.5;
    cells.set(e.id, { uv: [(px + pad) / W, 1 - (py + e.h - pad) / H, (px + e.w - pad) / W, 1 - (py + pad) / H], aspect: e.w / e.h });
  }
  const texture = releaseAfterUpload(canvasTexture(scaled(c), { clamp: true }));
  return { texture, get: (id) => cells.get(id) };
}

function signEntries(b) {
  const out = [];
  const sign = (id, s, w = 1024, h = 192) => out.push({ id, w, h, draw: (g, x, y, cw, ch) => drawSignCell(g, x, y, cw, ch, s) });
  sign('name', { text: '云澜汇站', sub: `YUNLAN HUI STATION · 地铁 ${LINE} 号线`, badge: LINE });
  sign('in', { text: '进站', sub: 'ENTRANCE · 刷卡 / 扫码', arrow: 'up', color: '#2e9c6a' }, 640, 160);
  sign('out', { text: '出站 · A B C D 口', sub: 'EXIT', arrow: 'up', color: '#e7b416' }, 768, 160);
  sign('service', { text: '客服中心', sub: 'CUSTOMER SERVICE', color: '#0f6f86' }, 640, 160);
  sign('tvm', { text: '自动售票', sub: 'TICKETS · 扫码 / 现金', color: '#0f6f86' }, 640, 160);
  sign('station', { text: '往 站厅 · 进站', sub: `TO STATION · LINE ${LINE}`, arrow: 'up', badge: LINE });
  sign('equip', { text: '设备区 · 闲人免进', sub: 'STAFF ONLY', color: '#e7b416', line: true }, 640, 160);
  sign('portal', { text: '地铁 云澜汇站', sub: `METRO LINE ${LINE} · YUNLAN HUI`, badge: 'M' });
  for (const ex of b.exits) {
    const p = PASSAGE[ex.passage];
    sign(`mouth-${ex.id}`, { text: `${ex.id} 口 · ${p.cn}`, sub: `EXIT ${ex.id} · ${p.en}`, arrow: 'up', color: p.color });
    sign(`pass-${ex.passage}`, { text: `往 ${p.cn} · ${ex.id} 口`, sub: `TO ${p.en}`, arrow: 'up', color: p.color });
    sign(`end-${ex.passage}`, { text: p.end, sub: p.en, color: p.color });
    sign(`exit-${ex.id}`, { text: `地铁 ${ex.id} 口`, sub: `云澜汇站 · ${p.cn}`, bg: RED, color: '#ffffff', badgeFg: RED, line: false, badge: 'M' }, 896, 192);
    sign(`up-${ex.id}`, { text: `出口 ${ex.id} · 地面`, sub: `EXIT ${ex.id} · ${p.en}`, arrow: 'up', color: '#e7b416' });
  }
  for (const [id, text, en] of [['E', '往 星湾', 'TO XINGWAN'], ['W', '往 云澜里', 'TO YUNLAN LANE']]) {
    sign(`pids-${id}`, { text: `${text}  2 分钟`, sub: `${en} · NEXT TRAIN 2 MIN`, bg: '#0b0d10', fg: '#ffb347', subColor: 'rgba(255,179,71,0.8)', line: false }, 1024, 160);
    sign(`dir-${id}`, { text, sub: en, arrow: id === 'E' ? 'right' : 'left', arrowLeft: id === 'W' }, 768, 160);
  }
  sign('m', { text: 'M', bg: RED, line: false, center: true }, 192, 192);
  for (const ex of b.exits) sign(`letter-${ex.id}`, { text: ex.id, bg: '#ffffff', fg: '#23282d', line: false, center: true }, 192, 192);
  ADS.forEach((a, i) => out.push({ id: `ad${i}`, w: 512, h: 320, draw: (g, x, y, w, h) => drawAd(g, x, y, w, h, a) }));
  out.push({ id: 'linemap', w: 1024, h: 256, draw: drawLineMap });
  return out;
}

// ---------------------------------------------------------------------------
// 小工具

/** 沿 frame F 的 u 方向的一段墙：内表面在 v，墙体向 −inward 方向加厚；带踢脚与线路色腰线 */
function wallRun(B, F, u0, u1, v, inward, y0, H, { color = WALL, band = RED, t = 0.3 } = {}) {
  if (u1 - u0 < 0.05) return;
  const cu = (u0 + u1) / 2, len = u1 - u0;
  B.frame(F, () => {
    B.get('satin').box(cu, y0 + H / 2, v - (inward * t) / 2, len, H, t, color);
    B.get('matte').box(cu, y0 + 0.08, v + inward * 0.012, len, 0.16, 0.024, '#5c6369');
    if (band) B.get('satin').box(cu, y0 + 2.45, v + inward * 0.012, len, 0.1, 0.024, band);
  });
}

/** 吊挂导向牌：带外框与吊杆，正反两面可不同 */
function hangSign(B, S, atlas, F, u, v, y, nu, nv, front, back, h, yCeil) {
  const f = atlas.get(front);
  const w = h * f.aspect;
  const ry = Math.atan2(nu, nv);
  B.frame(F, () => {
    B.get('metal').box(u, y, v, w + 0.12, h + 0.12, 0.08, '#2b3036', ry);
    const px = Math.cos(ry), pz = -Math.sin(ry);
    for (const k of [-1, 1]) {
      const a = (k * (w / 2 - 0.25));
      B.get('metal').box(u + px * a, (y + h / 2 + yCeil) / 2, v + pz * a, 0.04, yCeil - y - h / 2, 0.04, '#8a939b');
    }
  });
  S.frame(F, () => {
    S.placeN(u + nu * 0.045, y, v + nv * 0.045, w, h, nu, nv, f.uv);
    if (back) {
      const g = atlas.get(back);
      const bw = Math.min(w, h * g.aspect);
      S.placeN(u - nu * 0.045, y, v - nv * 0.045, bw, bw / g.aspect, -nu, -nv, g.uv);
    }
  });
}

/** 贴墙灯箱 / 招牌：frame F 内 (u,v) 处，朝 (nu,nv)，宽按图集比例 */
function wallSign(B, S, atlas, F, u, v, y, nu, nv, id, h, glowFrame = false) {
  const c = atlas.get(id);
  const w = h * c.aspect;
  const ry = Math.atan2(nu, nv);
  // 由墙面向外：发光边（可选）→ 金属外框 → 画面
  B.frame(F, () => {
    if (glowFrame) B.get('glow').box(u - nu * 0.006, y, v - nv * 0.006, w + 0.3, h + 0.3, 0.012, '#fff7e8', ry);
    B.get('metal').box(u + nu * 0.012, y, v + nv * 0.012, w + 0.12, h + 0.12, 0.03, '#2b3036', ry);
  });
  S.frame(F, () => S.placeN(u + nu * 0.03, y, v + nv * 0.03, w, h, nu, nv, c.uv));
}

const IDF = frame(0, 0, 0, 'metro-world');

// ---------------------------------------------------------------------------

export function buildMetro(ctx) {
  const b = ctx.bById.M;
  if (!b) return;
  const lv1 = ctx.lvById['M-B1'], lv2 = ctx.lvById['M-B2'];
  const L1 = ctx.levels[lv1.id], L2 = ctx.levels[lv2.id];
  const atlas = makeAtlas(signEntries(b));
  const signMat = ctx.mats.screen(atlas.texture, 0.92, 1.3);
  const signs = { b1: new SignBatch(), b2: new SignBatch(), shell: new SignBatch() };
  const stairs = ctx.layout.stairs.filter(s => s.building === b.id);
  for (const lv of [lv2, lv1]) buildMallStairLevel(ctx.levels[lv.id].batch, lv, stairs, b.access, { flights: true });
  buildStairApproach(ctx, lv1.id, lv2.id, stairs, b.access);
  ctx.renderer.localClippingEnabled = true;

  concourse(ctx, b, lv1, L1, atlas, signs.b1);
  passages(ctx, b, lv1, L1, atlas, signs.b1);
  platform(ctx, b, lv2, L2, atlas, signs.b2);
  const ceilings = [ceiling(ctx, b, lv1, L1), platformCeiling(ctx, b, lv2, L2)];
  const strips = b.exits.map((ex) => exitKiosk(ctx, b, lv1, L1, ex, atlas, signs.shell));
  const steps = new THREE.Mesh(stripGeometry(strips), ctx.mats.steps.up);
  steps.receiveShadow = true;
  L1.shell.add(steps);
  portals(ctx, b, atlas, signMat);
  const trains = [train(ctx, b, lv2, L2, 1), train(ctx, b, lv2, L2, -1)];
  const psd = [screenDoors(ctx, b, lv2, L2, 1), screenDoors(ctx, b, lv2, L2, -1)];

  signs.b1.flush(L1.base, signMat);
  signs.b2.flush(L2.base, signMat);
  signs.shell.flush(L1.shell, signMat);

  // 动态：吊顶按相机高度显隐；列车进站 → 停站开门 → 出站（导览可把时钟对到"列车正在进站"）
  const period = 84;
  let offset = 0, last = 0;
  ctx.metroSync = (at) => { offset = at - (((last % period) + period) % period); };
  ctx.dynamic.push({
    name: 'metro',
    update(dt, time, app) {
      last = time;
      const cy = app.camera.position.y;
      for (const c of ceilings) c.group.visible = !!(c.L.base.visible && c.L.group.visible) && cy < c.y - 0.05;
      trains.forEach((tr, i) => {
        if (!L2.base.visible || !L2.group.visible) return;
        const t = (((time + offset + i * period * 0.5) % period) + period) % period;
        const s = tr.dir;
        let x = 0, open = 0, on = true;
        if (t < 22) x = -s * XFAR * (1 - t / 22) ** 2;
        else if (t < 46) {
          const k = t - 22;
          open = k < 1.5 ? 0 : k < 3 ? (k - 1.5) / 1.5 : k < 20.5 ? 1 : k < 22 ? 1 - (k - 20.5) / 1.5 : 0;
        } else if (t < 68) x = s * XFAR * ((t - 46) / 22) ** 2;
        else on = false;
        tr.group.visible = on;
        tr.group.position.x = x;
        const e = open * open * (3 - 2 * open);
        tr.left.position.x = -0.64 * e;
        tr.right.position.x = 0.64 * e;
        const d = psd[i];
        d.left.position.x = -0.98 * e;
        d.right.position.x = 0.98 * e;
      });
    },
  });
}

// ---------------------------------------------------------------------------
// 站厅

function concourse(ctx, b, lv, L, atlas, S) {
  const B = L.batch;
  // 墙体放进 shell 并一直砌到地面下：园区视角透过出入口梯井看到的是站内墙面，而不是地平线下的天空
  const W = L.shellBatch;
  const y0 = lv.elev, H = clearHeight(lv), HW = -0.1 - y0;
  const { x0, z0, x1, z1 } = b.box;
  // 外墙：南北墙在通道口处断开
  const mouths = { N: [], S: [] };
  for (const p of b.passages) {
    const a = toW(p.F, ...p.lpoly[0]), c = toW(p.F, ...p.lpoly[3]);
    (a[1] < 0 ? mouths.N : mouths.S).push({ p, x0: Math.min(a[0], c[0]), x1: Math.max(a[0], c[0]), z: a[1] < 0 ? z0 : z1 });
  }
  for (const [z, inward, ms] of [[z0, 1, mouths.N], [z1, -1, mouths.S]]) {
    let ivs = [[x0, x1]];
    for (const m of ms) ivs = subtractInterval(ivs, [m.x0, m.x1]);
    for (const [a, c] of ivs) wallRun(W, IDF, a, c, z, inward, y0, HW);
  }
  const FZ = frame(0, 0, 90, 'metro-z');
  // frame(0,0,90)：u → +z，v → −x
  wallRun(W, FZ, z0 - 0.3, z1 + 0.3, -x0, -1, y0, HW);
  wallRun(W, FZ, z0 - 0.3, z1 + 0.3, -x1, 1, y0, HW);
  // 站名墙（两端）与线路图
  wallSign(B, S, atlas, IDF, x0 + 0.02, 0, y0 + 1.9, 1, 0, 'name', 1.1, true);
  wallSign(B, S, atlas, IDF, x1 - 0.02, 0, y0 + 1.9, -1, 0, 'name', 1.1, true);
  wallSign(B, S, atlas, IDF, -30, z0 + 0.02, y0 + 1.75, 0, 1, 'linemap', 1.2);
  wallSign(B, S, atlas, IDF, 30, z1 - 0.02, y0 + 1.75, 0, -1, 'linemap', 1.2);
  // 长廊广告灯箱（避开通道口与用房）
  let k = 0;
  for (const [z, nz, ms] of [[z0, 1, mouths.N], [z1, -1, mouths.S]]) {
    for (let x = -50; x <= 50; x += 12) {
      if (Math.abs(x - (nz > 0 ? -30 : 30)) < 6 || ms.some((m) => x > m.x0 - 3 && x < m.x1 + 3)) continue;
      wallSign(B, S, atlas, IDF, x, z + nz * 0.02, y0 + 1.6, 0, nz, `ad${k++ % ADS.length}`, 1.5, true);
    }
  }
  // 圆柱
  for (const x of [-48, -24, -12, 0, 12, 24, 48]) {
    for (const z of [-5, 5]) {
      B.get('satin').cyl(x, y0, z, 0.42, H, '#eceef0', 20);
      B.get('metal').cyl(x, y0, z, 0.47, 0.14, '#9aa1a8', 20);
      B.get('metal').cyl(x, y0 + H - 0.12, z, 0.47, 0.12, '#9aa1a8', 20);
    }
  }
  // 闸机、付费区栏杆、售票机
  for (const f of lv.features) {
    if (f.type === 'gates') {
      const n = Math.max(2, Math.round((f.z1 - f.z0) / 0.95));
      const pitch = (f.z1 - f.z0) / n;
      for (let i = 0; i <= n; i++) {
        const z = f.z0 + i * pitch;
        B.get('satin').box(f.x, y0 + 0.5, z, 1.7, 1.0, 0.24, '#d7dce1');
        B.get('metal').box(f.x, y0 + 1.02, z, 1.74, 0.05, 0.27, '#2b3036');
        for (const s of [-1, 1]) B.get('glow').box(f.x + s * 0.87, y0 + 0.92, z, 0.02, 0.14, 0.12, s < 0 ? '#3ddc84' : '#ff5a4f');
        if (i < n) {
          const w = pitch / 2 - 0.2;
          B.get('glass').box(f.x, y0 + 0.82, z + 0.12 + w / 2, 0.03, 0.55, w, 0xffffff);
          B.get('glass').box(f.x, y0 + 0.82, z + pitch - 0.12 - w / 2, 0.03, 0.55, w, 0xffffff);
        }
      }
      const cz = (f.z0 + f.z1) / 2;
      const s = Math.sign(f.x);
      hangSign(B, S, atlas, IDF, f.x + s * 0.6, cz, y0 + 2.7, s, 0, 'in', 'out', 0.42, y0 + H);
    } else if (f.type === 'fence') {
      const len = f.x1 - f.x0, cx = (f.x0 + f.x1) / 2;
      B.get('glass').box(cx, y0 + 0.62, f.z, len, 1.04, 0.03, 0xffffff);
      B.get('metal').box(cx, y0 + 1.17, f.z, len, 0.06, 0.08, '#aab2b9');
      for (let x = f.x0; x <= f.x1 + 0.01; x += 2) B.get('metal').box(x, y0 + 0.6, f.z, 0.06, 1.2, 0.06, '#aab2b9');
    } else if (f.type === 'tvm') {
      const s = f.face === 'N' ? -1 : 1;
      for (let i = 0; i < f.n; i++) {
        const x = f.x + (i - (f.n - 1) / 2) * 1.1;
        B.get('satin').box(x, y0 + 0.95, f.z, 0.95, 1.9, 0.6, '#30363c');
        B.get('satin').box(x, y0 + 1.86, f.z, 0.97, 0.08, 0.62, RED);
        B.get('glow').box(x, y0 + 1.35, f.z + s * 0.305, 0.62, 0.42, 0.01, '#7cc8ff');
        B.get('metal').box(x, y0 + 0.95, f.z + s * 0.32, 0.5, 0.12, 0.06, '#9aa1a8');
      }
      hangSign(B, S, atlas, IDF, f.x, f.z + s * 0.2, y0 + 2.75, 0, s, 'tvm', 'tvm', 0.36, y0 + H);
    }
  }
  // 客服中心：跨闸机线的玻璃岗亭
  for (const r of lv.rooms.filter((m) => m.type === 'service')) {
    const g = r.rects[0];
    const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2, w = g.x1 - g.x0, d = g.z1 - g.z0;
    B.get('satin').box(cx, y0 + 0.55, cz, w, 1.1, d, '#dfe3e6');
    B.get('satin').box(cx, y0 + 1.13, cz, w + 0.12, 0.05, d + 0.12, '#f4f5f6');
    B.get('glass').box(cx, y0 + 1.9, cz, w, 1.5, d, 0xffffff);
    B.get('satin').box(cx, y0 + 2.78, cz, w + 0.2, 0.3, d + 0.2, '#f2f3f4');
    B.get('glow').box(cx, y0 + 2.62, cz, w + 0.24, 0.04, d + 0.24, '#dff1ff');
    for (const s of [-1, 1]) {
      const c = atlas.get('service');
      const h = 0.34;
      S.placeN(cx + s * (w / 2 + 0.11), y0 + 2.78, cz, Math.min(d + 0.1, h * c.aspect), h, s, 0, c.uv);
    }
  }
  // 通道口导向牌（面向站厅）
  for (const ms of [mouths.N, mouths.S]) {
    for (const m of ms) {
      const ex = b.exits.find((e) => e.passage === m.p.id);
      const nz = m.z < 0 ? 1 : -1;
      hangSign(B, S, atlas, IDF, (m.x0 + m.x1) / 2, m.z + nz * 1.2, y0 + 2.75, 0, nz, `mouth-${ex.id}`, 'station', 0.46, y0 + H);
    }
  }
  // 盲道（长廊中线）
  for (const z of [-8, 8]) B.get('satin').box(0, y0 + 0.008, z, 112, 0.012, 0.3, '#e2b33a');
}

/** 站厅、通道吊顶（铝条板 + 线形灯带），独立分组，按相机高度显隐 */
function ceiling(ctx, b, lv, L) {
  const group = new THREE.Group();
  const B = new BatchSet(ctx.mats.base);
  const y = lv.elev + clearHeight(lv);
  const { x0, z0, x1, z1 } = b.box;
  B.get('glowSoft').box((x0 + x1) / 2, y + 0.03, (z0 + z1) / 2, x1 - x0, 0.06, z1 - z0, '#dfe3e7');
  for (let z = -9; z <= 9; z += 3) {
    for (let x = x0 + 3; x < x1 - 3; x += 6) B.get('glow').box(x + 2.7, y - 0.01, z, 5.2, 0.03, 0.14, '#f2f8ff');
  }
  for (const p of b.passages) {
    const u0 = Math.min(p.lpoly[0][0], p.lpoly[3][0]);
    B.frame(p.F, () => {
      B.get('glowSoft').box((u0 + p.uEnd) / 2, y + 0.02, 0, p.uEnd - u0, 0.06, p.hw * 2, '#dfe3e7');
      for (let u = u0 + 2; u < p.uEnd - 1; u += 4) B.get('glow').box(u + 1.5, y - 0.01, 0, 3.2, 0.03, 0.16, '#f2f8ff');
    });
  }
  B.flush(group);
  group.visible = false;
  L.group.add(group);
  return { group, y, L };
}

// ---------------------------------------------------------------------------
// 通道

function passages(ctx, b, lv, L, atlas, S) {
  const B = L.batch;
  const W = L.shellBatch;
  const y0 = lv.elev, H = clearHeight(lv), HW = -0.1 - y0;
  let ad = 2;
  for (const p of b.passages) {
    const F = p.F;
    const info = PASSAGE[p.id];
    const ex = b.exits.find((e) => e.passage === p.id);
    const [eu, ev] = toL(F, ex.kiosk.frame.ox, ex.kiosk.frame.oz);
    const side = Math.abs(ev) > 1 ? Math.sign(ev) : 0;
    const gap = side ? [eu, eu + EXIT.landing] : null;
    const uMouth = Math.max(p.lpoly[0][0], p.lpoly[3][0]);
    for (const s of [-1, 1]) {
      const v = s * p.hw;
      const uStart = s > 0 ? p.lpoly[3][0] : p.lpoly[0][0];
      let ivs = [[uStart, p.uEnd]];
      if (gap && s === side) ivs = subtractInterval(ivs, gap);
      for (const [a, c] of ivs) wallRun(W, F, a, c, v, -s, y0, HW, { band: info.color });
      for (let u = uMouth + 6; u < p.uEnd - 5; u += 9) {
        if (gap && s === side && u > gap[0] - 3 && u < gap[1] + 3) continue;
        wallSign(B, S, atlas, F, u, v - s * 0.02, y0 + 1.55, 0, -s, `ad${ad++ % ADS.length}`, 1.5, true);
      }
    }
    // 出入口侧向平台：外墙与尽端墙
    if (side) {
      const vo = side * (p.hw + 6.5);
      wallRun(W, F, gap[0], gap[1], vo, -side, y0, HW, { band: info.color });
      // 平台尽端墙：frame 的 u 沿通道 v 向，v 指向通道 −u（平台内侧）
      const FZ = frame(...toW(F, gap[1], 0), p.deg + 90, `${p.id}-land`);
      const [a, c] = [Math.min(side * p.hw, vo), Math.max(side * p.hw, vo)];
      wallRun(W, FZ, a, c, 0, 1, y0, HW, { band: info.color });
    }
    // 楼梯底部上方指向地面的导向牌（面向平台 / 通道里的来人）
    hangSign(B, S, atlas, ex.kiosk.frame, -0.4, 0, y0 + 2.75, -1, 0, `up-${ex.id}`, null, 0.42, y0 + H);
    // 地面导向带与盲道
    B.frame(F, () => {
      B.get('satin').box((uMouth + p.uEnd) / 2, y0 + 0.01, 0, p.uEnd - uMouth, 0.012, 0.36, info.color);
      B.get('satin').box((uMouth + p.uEnd) / 2, y0 + 0.008, -1.6, p.uEnd - uMouth, 0.012, 0.3, '#e2b33a');
    });
    // 吊挂导向牌：正面朝外行方向的来人（面向站厅），背面朝回站厅方向
    for (const u of [uMouth + 8, (uMouth + p.uEnd) / 2 + 4]) hangSign(B, S, atlas, F, u, 0, y0 + 2.75, -1, 0, `pass-${p.id}`, 'station', 0.42, y0 + H);
    // 尽端：去往各期的连接口门框（门框与灯箱由 portals() 画在各期一侧）；公园通道尽端接 B 口楼梯
    if (p.to) wallSign(B, S, atlas, F, p.uEnd - 0.05, 0, y0 + 2.95, -1, 0, `end-${p.id}`, 0.4);
  }
}

// ---------------------------------------------------------------------------
// 站台

function platform(ctx, b, lv, L, atlas, S) {
  const B = L.batch;
  const y0 = lv.elev;
  const yTop = lv.elev + clearHeight(lv);
  const P = b.platform;
  const { x0, z0, x1, z1 } = b.box;
  const rail = y0 - 1.1;
  const bed = rail - 0.3;
  // 站台边缘：竖向侧面、白色安全线、黄色盲道
  for (const s of [-1, 1]) {
    const z = s * P.z1;
    B.get('satin').box(0, (y0 + bed) / 2, z + s * 0.01, P.x1 - P.x0, y0 - bed, 0.02, '#9aa0a6');
    B.get('satin').box(0, y0 + 0.008, s * (P.z1 - 0.55), 114, 0.012, 0.4, '#e2b33a');
  }
  for (const s of [-1, 1]) {
    const zc = s * b.track;
    // 道床、排水沟、钢轨、轨枕
    B.get('ext').box(0, bed - 0.15, s * ((P.z1 + z1) / 2), (x1 - x0) + 36, 0.3, z1 - P.z1, '#7d8288');
    B.get('ext').box(0, bed + 0.005, zc, (x1 - x0) + 36, 0.01, 0.5, '#41464c');
    for (const g of [-0.7175, 0.7175]) B.get('metal').box(0, rail - 0.09, zc + g, (x1 - x0) + 36, 0.18, 0.08, '#8e959c');
    for (let x = x0 - 18; x < x1 + 18; x += 0.65) B.get('ext').box(x, bed + 0.06, zc, 0.26, 0.12, 2.3, '#a3a8ad');
    // 刚性接触网
    B.get('metal').box(0, y0 + 4.1, zc, (x1 - x0) + 36, 0.12, 0.2, '#3a3f44');
    for (let x = x0 + 3; x < x1; x += 9) B.get('metal').box(x, y0 + 4.6, zc, 0.08, 1.0, 0.08, '#3a3f44');
    // 轨行区外墙：站名牌与广告交替
    const zw = s * z1;
    B.get('satin').box(0, (bed + yTop) / 2, zw + s * 0.15, x1 - x0, yTop - bed, 0.3, '#dfe3e7');
    B.get('satin').box(0, y0 + 3.4, zw - s * 0.012, x1 - x0, 0.12, 0.024, RED);
    for (let i = 0; i < 6; i++) wallSign(B, S, atlas, IDF, (i - 2.5) * CAR, zw - s * 0.02, y0 + 2.2, 0, -s, 'name', 0.8, true);
    for (let i = 0; i < 5; i++) wallSign(B, S, atlas, IDF, (i - 2) * CAR, zw - s * 0.02, y0 + 1.9, 0, -s, `ad${(i + (s > 0 ? 3 : 0)) % ADS.length}`, 1.8, true);
    // 隧道：两端各 18m 的箱形隧道（内壁深色），列车在其中被裁剪
    for (const e of [-1, 1]) {
      const xa = e * x1, xb = e * (x1 + 18);
      const cx = (xa + xb) / 2;
      const zi = s * P.z1, zo = s * z1;
      B.get('ext').box(cx, (bed + yTop) / 2, zo + s * 0.15, 18, yTop - bed, 0.3, '#6b7076');
      B.get('ext').box(cx, (bed + yTop) / 2, zi - s * 0.15, 18, yTop - bed, 0.3, '#6b7076');
      B.get('ext').box(cx, y0 + 4.4 + 0.2, s * ((P.z1 + z1) / 2), 18, 0.4, z1 - P.z1 + 0.6, '#5d6267');
      B.get('matte').box(xb, (bed + y0 + 4.4) / 2, s * ((P.z1 + z1) / 2), 0.2, y0 + 4.4 - bed, z1 - P.z1, '#15181b');
    }
  }
  // 站台两端墙（设备区）与轨行区上方端墙
  for (const e of [-1, 1]) {
    const FZ = frame(0, 0, 90, 'pf-end');
    wallRun(B, FZ, P.z0, P.z1, -e * P.x1, e, y0, yTop - y0, { band: RED });
    wallSign(B, S, atlas, IDF, e * (P.x1 - 0.02), 0, y0 + 2.2, -e, 0, 'equip', 0.5);
    B.get('satin').box(e * x1, (y0 + 4.4 + yTop) / 2 + 0.2, 0, 0.3, yTop - y0 - 4.4, z1 - z0, '#dfe3e7');
    // 站台端部设备区地面
    B.get('ext').box(e * (P.x1 + x1) / 2, y0 - 0.2, 0, x1 - P.x1, 0.4, P.z1 - P.z0, '#9da2a7');
  }
  // 圆柱、长椅、到站信息屏
  for (const x of [-58, -40, -32, 32, 40, 58]) {
    B.get('satin').cyl(x, y0, 0, 0.45, yTop - y0, '#eceef0', 20);
    B.get('metal').cyl(x, y0, 0, 0.5, 0.15, '#9aa1a8', 20);
  }
  for (const x of [-36, 36]) {
    for (const s of [-1, 1]) {
      B.get('metal').box(x, y0 + 0.42, s * 0.55, 2.4, 0.06, 0.45, '#b8bfc6');
      B.get('metal').box(x, y0 + 0.2, s * 0.55, 0.08, 0.4, 0.4, '#4a5056');
    }
  }
  for (const x of [-7, 7, -43, 43]) {
    const c = atlas.get('pids-E');
    const h = 0.42, w = h * c.aspect;
    B.get('metal').box(x, y0 + 3.0, 0, w + 0.14, h + 0.14, 0.18, '#1b1e22');
    for (const k of [-1, 1]) B.get('metal').box(x + k * (w / 2 - 0.3), (y0 + 3.2 + yTop) / 2, 0, 0.05, yTop - y0 - 3.2, 0.05, '#8a939b');
    S.placeN(x, y0 + 3.0, 0.1, w, h, 0, 1, atlas.get('pids-E').uv);
    S.placeN(x, y0 + 3.0, -0.1, w, h, 0, -1, atlas.get('pids-W').uv);
  }
  for (const x of [-20, 20, -52, 52]) {
    const h = 0.36;
    for (const [s, id] of [[1, 'dir-E'], [-1, 'dir-W']]) {
      const c = atlas.get(id);
      const w = h * c.aspect;
      B.get('metal').box(x, y0 + 2.9, s * 4.2, w + 0.1, h + 0.1, 0.06, '#2b3036');
      S.placeN(x, y0 + 2.9, s * 4.2 + s * 0.035, w, h, 0, s, c.uv);
      S.placeN(x, y0 + 2.9, s * 4.2 - s * 0.035, w, h, 0, -s, c.uv);
      for (const k of [-1, 1]) B.get('metal').box(x + k * (w / 2 - 0.2), (y0 + 2.9 + h / 2 + yTop) / 2, s * 4.2, 0.04, yTop - y0 - 2.9 - h / 2, 0.04, '#8a939b');
    }
  }
}

/** 站台吊顶：灯带沿站台纵向 */
export function platformCeiling(ctx, b, lv, L) {
  const group = new THREE.Group();
  const B = new BatchSet(ctx.mats.base);
  const y = lv.elev + 4.6;
  const P = b.platform;
  const { x0, z0, x1, z1 } = b.box;
  // The suspended ceiling sits between B2 and B1, so every continuous
  // stair and escalator must keep a real opening through it.
  const holes = [
    ...lv.rooms.filter(r => r.openStair).flatMap(r => r.rects),
    ...ctx.lvById['M-B1'].voids.filter(v => ['escalator', 'shaft'].includes(v.kind)).map(v => v.rect),
  ];
  for (const r of carve(P, holes)) B.get('glowSoft').box((r.x0+r.x1)/2, y+.03, (r.z0+r.z1)/2, r.x1-r.x0, .06, r.z1-r.z0, '#dde2e6');
  // 轨行区上方为深色结构顶板
  for (const s of [-1, 1]) B.get('satin').box((x0 + x1) / 2, y + 0.03, s * (P.z1 + z1) / 2, x1 - x0, 0.06, z1 - P.z1, '#4e545a');
  B.get('satin').box((x0 + P.x0) / 2, y + 0.03, 0, P.x0 - x0, 0.06, P.z1 - P.z0, '#4e545a');
  B.get('satin').box((P.x1 + x1) / 2, y + 0.03, 0, x1 - P.x1, 0.06, P.z1 - P.z0, '#4e545a');
  for (const z of [-4.5, -1.5, 1.5, 4.5]) {
    for (let x = P.x0 + 2; x < P.x1 - 2; x += 6) {
      // Keep the narrow light strips: carve's general paving helper omits
      // sub-30cm rectangles, so split each strip by its crossing voids here.
      let spans = [[x+.1, x+5.3]];
      for (const r of holes) if (r.z0 < z+.08 && r.z1 > z-.08) spans = subtractInterval(spans, [r.x0,r.x1]);
      for (const [a,c] of spans) if(c-a>.03) B.get('glow').box((a+c)/2, y-.01, z, c-a, .03, .16, '#f2f8ff');
    }
  }
  B.flush(group);
  group.visible = false;
  L.group.add(group);
  return { group, y, L };
}

/** 屏蔽门：固定玻璃 + 门楣 + 滑动门扇（左右两组整体平移） */
function screenDoors(ctx, b, lv, L, s) {
  const B = L.batch;
  const y0 = lv.elev;
  const z = s * b.platform.z1;
  const doors = [];
  for (let k = 0; k < b.train.cars; k++) for (const d of DOORS) doors.push((k - (b.train.cars - 1) / 2) * CAR + d);
  const half = 1.0;
  B.get('metal').box(0, y0 + 2.75, z, 115, 0.5, 0.3, '#2b3036');
  // 门楣以上的封板（到吊顶）
  B.get('satin').box(0, y0 + 3.8, z, 120, 1.6, 0.16, '#e3e6e9');
  B.get('satin').box(0, y0 + 3.4, z - s * 0.09, 120, 0.1, 0.02, RED);
  B.get('glow').box(0, y0 + 2.48, z - s * 0.16, 115, 0.04, 0.02, '#e8f3ff');
  let x = -57.5;
  for (const dx of [...doors, 57.5 + half]) {
    const a = x, c = dx - half;
    if (c - a > 0.1) {
      B.get('glass').box((a + c) / 2, y0 + 1.25, z, c - a, 2.4, 0.03, 0xffffff);
      B.get('metal').box(a + 0.04, y0 + 1.25, z, 0.08, 2.5, 0.12, '#9aa1a8');
      B.get('metal').box(c - 0.04, y0 + 1.25, z, 0.08, 2.5, 0.12, '#9aa1a8');
    }
    x = dx + half;
  }
  const left = new THREE.Group(), right = new THREE.Group();
  for (const [grp, k] of [[left, -1], [right, 1]]) {
    const LB = new BatchSet(ctx.mats.base);
    for (const dx of doors) {
      const cx = dx + k * half / 2;
      LB.get('glass').box(cx, y0 + 1.22, z + s * 0.06, half - 0.04, 2.34, 0.03, 0xffffff);
      LB.get('metal').box(cx - k * (half / 2 - 0.03), y0 + 1.22, z + s * 0.06, 0.05, 2.36, 0.06, '#c3c9cf');
      LB.get('metal').box(cx, y0 + 2.38, z + s * 0.06, half - 0.04, 0.05, 0.06, '#c3c9cf');
    }
    LB.flush(grp);
    L.base.add(grp);
  }
  return { left, right };
}

// ---------------------------------------------------------------------------
// 列车（s = 行驶方向：+1 东行在南侧轨道 z>0，−1 西行在北侧轨道 z<0）

function train(ctx, b, lv, L, s) {
  const clip = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), XCLIP), new THREE.Plane(new THREE.Vector3(1, 0, 0), XCLIP)];
  const mats = {
    satin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2, clippingPlanes: clip }),
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1, clippingPlanes: clip }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, clippingPlanes: clip }),
    glassTint: new THREE.MeshStandardMaterial({ color: 0x1c2a33, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55, depthWrite: false, clippingPlanes: clip }),
  };
  const group = new THREE.Group();
  const zc = s * b.track;
  group.position.set(0, lv.elev, zc);
  const B = new BatchSet(mats);
  const n = b.train.cars;
  const len = CAR - 0.5;
  const hw = b.train.w / 2;
  const plat = -s; // 站台在列车的哪一侧（局部 z 符号）
  for (let k = 0; k < n; k++) {
    const cx = (k - (n - 1) / 2) * CAR;
    // 车体：裙部、窗带立柱、上部、车顶
    B.get('satin').box(cx, 0.32, 0, len, 1.25, hw * 2, '#eef1f3');
    B.get('satin').box(cx, 2.3, 0, len, 0.6, hw * 2, '#eef1f3');
    B.get('satin').box(cx, 2.72, 0, len - 0.3, 0.25, hw * 2 - 0.3, '#c9cfd4');
    B.get('glow').box(cx, 1.48, 0, len - 0.4, 1.05, hw * 2 - 0.25, '#fff2d8');
    for (const z of [-1, 1]) {
      B.get('satin').box(cx, 0.7, z * (hw + 0.006), len, 0.16, 0.012, RED);
      B.get('satin').box(cx, 2.08, z * (hw + 0.006), len, 0.05, 0.012, RED);
      // 窗与立柱
      const segs = [[-len / 2 + 0.3, DOORS[0] - 0.85], [DOORS[0] + 0.85, DOORS[1] - 0.85], [DOORS[1] + 0.85, DOORS[2] - 0.85], [DOORS[2] + 0.85, DOORS[3] - 0.85], [DOORS[3] + 0.85, len / 2 - 0.3]];
      for (const [a, c] of segs) {
        B.get('glassTint').box(cx + (a + c) / 2, 1.48, z * (hw + 0.004), c - a, 1.0, 0.02, 0xffffff);
        B.get('satin').box(cx + a - 0.04, 1.48, z * hw, 0.1, 1.05, 0.03, '#e3e7ea');
        B.get('satin').box(cx + c + 0.04, 1.48, z * hw, 0.1, 1.05, 0.03, '#e3e7ea');
      }
      // 非站台一侧的车门（关闭）
      if (z !== plat) for (const d of DOORS) door(B, cx + d, z * (hw + 0.01), 0, 0);
    }
    // 转向架、车下设备、车顶空调、贯通道
    for (const e of [-6.4, 6.4]) B.get('matte').box(cx + e, -0.62, 0, 2.6, 0.7, hw * 2 - 0.4, '#25292d');
    B.get('matte').box(cx, -0.45, 0, 7, 0.45, hw * 2 - 0.6, '#3a3f44');
    for (const e of [-4.2, 4.2]) B.get('satin').box(cx + e, 2.98, 0, 3.2, 0.32, 1.9, '#b9c0c6');
    if (k < n - 1) B.get('matte').box(cx + CAR / 2, 1.3, 0, 0.6, 2.4, hw * 2 - 0.5, '#2b2f33');
  }
  // 司机室端部：挡风玻璃、头灯、尾灯、线路号屏
  for (const e of [-1, 1]) {
    const x = e * ((n * CAR) / 2 - 0.25);
    B.get('satin').box(x - e * 0.25, 1.4, 0, 0.5, 2.9, hw * 2 - 0.2, '#d9dee2');
    B.get('glassTint').box(x + e * 0.02, 1.55, 0, 0.04, 1.05, hw * 2 - 0.6, 0xffffff);
    B.get('satin').box(x + e * 0.02, 0.62, 0, 0.04, 0.28, hw * 2 - 0.2, RED);
    for (const z of [-1, 1]) {
      B.get('glow').box(x + e * 0.03, 0.42, z * 0.95, 0.03, 0.14, 0.34, e === s ? '#ffffff' : '#ff3b30');
    }
    B.get('glow').box(x + e * 0.03, 2.3, 0, 0.03, 0.26, 1.3, '#ffb347');
  }
  B.flush(group);
  // 站台一侧车门：两组门扇整体平移
  const left = new THREE.Group(), right = new THREE.Group();
  for (const [grp, k] of [[left, -1], [right, 1]]) {
    const DB = new BatchSet(mats);
    for (let c = 0; c < n; c++) {
      const cx = (c - (n - 1) / 2) * CAR;
      for (const d of DOORS) door(DB, cx + d + k * 0.33, plat * (hw + 0.01), k, 1);
    }
    DB.flush(grp);
    group.add(grp);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  L.base.add(group);
  return { group, left, right, dir: s };
}

/** 车门（单扇 k=±1 或整樘 k=0）：门板 + 门窗 */
function door(B, x, z, k, leaves) {
  const w = leaves ? 0.64 : 1.3;
  B.get('satin').box(x, 0.98, z, w, 1.95, 0.02, '#d5dade');
  B.get('glassTint').box(x, 1.5, z + Math.sign(z) * 0.006, w - 0.2, 0.8, 0.012, 0xffffff);
  B.get('satin').box(x - (k * w) / 2, 0.98, z + Math.sign(z) * 0.008, 0.02, 1.95, 0.012, k ? '#9aa1a8' : '#6f767c');
}

// ---------------------------------------------------------------------------
// 地面出入口：楼梯 + 上行扶梯 + 玻璃雨棚 + M 标识柱（画在站厅层 shell 组：园区视角也可见）

function exitKiosk(ctx, b, lv, L, ex, atlas, S) {
  const B = L.shellBatch;
  const G = ex.kiosk.frame;
  const R = EXIT.run, hw = EXIT.hw;
  const y0 = lv.elev;
  const rise = -y0;
  const yAt = (u) => y0 + (rise * u) / R;
  B.frame(G, () => {
    // 梯井侧墙（地下）与地面压顶
    for (const s of [-1, 1]) {
      B.get('ext').box(R / 2, y0 + rise / 2 - 0.1, s * (hw + 0.3), R + 0.4, rise + 0.2, 0.3, '#c9ccd0');
      B.get('ext').box(R / 2 + 0.6, -0.04, s * (hw + 0.3), R + 2.0, 0.2, 0.7, '#b8b2a7');
    }
    // 楼梯：两跑 + 中间平台，花岗岩踏步 + 深色防滑条
    const v0 = -hw + 0.1, v1 = 0.7;
    const sv = (v0 + v1) / 2, sw = v1 - v0;
    const steps = [];
    for (let i = 0; i < 14; i++) steps.push([i * 0.3, (i + 1) * 0.3, y0 + 0.15 * (i + 1)]);
    steps.push([4.2, 5.3, y0 + 2.25]);
    for (let i = 0; i < 14; i++) steps.push([5.3 + i * 0.3, 5.3 + (i + 1) * 0.3, y0 + 2.25 + 0.15 * (i + 1)]);
    for (const [a, c, top] of steps) {
      B.get('ext').box((a + c) / 2, (y0 + top) / 2, sv, c - a, top - y0, sw, '#b9bdc1');
      B.get('ext').box(a + 0.05, top + 0.004, sv, 0.08, 0.008, sw, '#3a3f44');
    }
    // 扶手与中间栏杆
    for (const v of [v0 + 0.05, v1 + 0.15]) {
      B.get('extMetal').bar({ x: 0, y: y0 + 0.95, z: v }, { x: R, y: rise + y0 + 0.95, z: v }, 0.05, '#c9ccd0');
      for (let u = 0.5; u < R; u += 1.5) B.get('extMetal').box(u, yAt(u) + 0.48, v, 0.04, 0.95, 0.04, '#9aa1a8');
    }
    // 顶部平台（地面）
    B.get('extSatin').box(R + EXIT.landing / 2, -0.06, 0, EXIT.landing + 0.2, 0.14, hw * 2 + 0.6, '#b8bcc0');
    B.get('ext').box(R + 0.25, 0.02, 0, 0.5, 0.02, hw * 2, '#e2b33a');
    // 雨棚：玻璃侧墙 + 金属竖梃 + 白色金属顶 + LED 檐口
    const r = EXIT.roof;
    const ch = 3.0;
    for (const s of [-1, 1]) {
      const v = s * (hw + 0.45);
      B.get('glass').box((r.x0 + r.x1) / 2 - 0.2, ch / 2 + 0.05, v, r.x1 - r.x0 - 0.4, ch - 0.1, 0.04, 0xffffff);
      for (let u = r.x0 + 0.2; u <= r.x1 - 0.2; u += 1.55) B.get('extMetal').box(u, ch / 2, v, 0.08, ch, 0.1, '#2b3036');
    }
    B.get('extMetal').box(r.x0 + 0.1, ch / 2, 0, 0.1, ch, hw * 2 + 0.9, '#2b3036');
    B.get('glass').box(r.x0 + 0.15, ch / 2, 0, 0.04, ch - 0.1, hw * 2 + 0.8, 0xffffff);
    B.get('extSatin').box((r.x0 + r.x1) / 2, ch + 0.14, 0, r.x1 - r.x0 + 0.4, 0.28, hw * 2 + 1.5, '#f4f4f1');
    B.get('glow').box((r.x0 + r.x1) / 2, ch - 0.02, 0, r.x1 - r.x0 - 0.6, 0.03, 0.4, '#eaf6ff');
    for (const s of [-1, 1]) B.get('extMetal').box((r.x0 + r.x1) / 2, ch + 0.02, s * (hw + 0.75), r.x1 - r.x0 + 0.4, 0.08, 0.08, RED);
    B.get('extMetal').box(r.x1 + 0.2, ch + 0.02, 0, 0.08, 0.08, hw * 2 + 1.5, RED);
    // M 标识柱
    const pv = (ex.passage === 'PC' ? 1 : -1) * (hw + 1.6) * (ex.id === 'B' ? -1 : 1);
    B.get('extMetal').box(r.x1 + 1.2, 2.1, pv, 0.5, 4.2, 0.5, '#2b3036');
    B.get('extMetal').box(r.x1 + 1.2, 4.55, pv, 0.95, 0.95, 0.95, RED);
    B.get('glow').box(r.x1 + 1.2, 4.03, pv, 0.97, 0.05, 0.97, '#ffe0dc');
  });
  S.frame(G, () => {
    const r = EXIT.roof;
    const c = atlas.get(`exit-${ex.id}`);
    const h = 0.62;
    S.placeN(r.x1 + 0.23, 3.1, 0, h * c.aspect, h, 1, 0, c.uv);
    const back = atlas.get(`exit-${ex.id}`);
    S.placeN(r.x0 - 0.06, 2.3, 0, h * back.aspect, h, -1, 0, back.uv);
    const pv = (ex.passage === 'PC' ? 1 : -1) * (hw + 1.6) * (ex.id === 'B' ? -1 : 1);
    const m = atlas.get('m').uv, lt = atlas.get(`letter-${ex.id}`).uv;
    for (const [nu, nv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      S.placeN(r.x1 + 1.2 + nu * 0.48, 4.55, pv + nv * 0.48, 0.8, 0.8, nu, nv, m);
      S.placeN(r.x1 + 1.2 + nu * 0.26, 3.45, pv + nv * 0.26, 0.42, 0.42, nu, nv, lt);
    }
  });
  // 上行扶梯（世界坐标）
  const pt = (u, v) => toW(G, u, v);
  const bu = 0.85, run = rise * Math.sqrt(3);
  const [bx, bz] = pt(bu, hw - 1.1);
  const [tx, tz] = pt(bu + run, hw - 1.1);
  const e = { bottom: { x: bx, y: y0, z: bz }, top: { x: tx, y: 0, z: tz }, width: 1.8 };
  return drawEscalator(B, e, '#c3c9cf');
}

// ---------------------------------------------------------------------------
// 各期地下层的地铁连接口：不锈钢门框 + 商场一侧"地铁"灯箱

function portals(ctx, b, atlas, signMat) {
  for (const e of ctx.layout.entrances.filter((x) => x.to === 'M-B1')) {
    const L = ctx.levels[e.level];
    const lv = L.lv;
    const B = L.batch;
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    const F = frame(mx, mz, Math.atan2(e.nz, e.nx) * DEG, `${e.id}-portal`);
    const w = e.width;
    const y0 = lv.elev;
    B.frame(F, () => {
      for (const k of [-1, 1]) B.get('metal').box(0, y0 + 1.7, k * (w / 2 + 0.15), 0.5, 3.4, 0.3, '#b8bfc6');
      B.get('metal').box(0, y0 + 3.55, 0, 0.5, 0.3, w + 0.6, '#b8bfc6');
      B.get('glow').box(-0.27, y0 + 3.4, 0, 0.02, 0.04, w, '#ffe0dc');
    });
    const S = new SignBatch();
    const c = atlas.get('portal');
    const h = 0.55;
    S.frame(F, () => S.placeN(-0.27, y0 + 2.95, 0, Math.min(w - 0.4, h * c.aspect), h, -1, 0, c.uv));
    S.flush(L.base, signMat);
    // 二期 B1（−4.2）比站厅高 0.3m：通道尽端 3m 缓坡
    if (Math.abs(lv.elev - ctx.lvById['M-B1'].elev) > 0.05) {
      const dy = lv.elev - ctx.lvById['M-B1'].elev;
      const ang = -Math.atan2(dy, 3);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -F.a, ang, 'YXZ'));
      const [cx, cz] = toW(F, 1.5, 0);
      ctx.levels['M-B1'].batch.get('satin').shape('box', new THREE.Vector3(cx, ctx.lvById['M-B1'].elev + dy / 2, cz), q, new THREE.Vector3(Math.hypot(3, dy), 0.06, w), '#c9ced2');
    }
  }
}
