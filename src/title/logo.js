// 首页 Logo（试做版 Logo B）：骨白毛笔「围城」+ 身后一道血红笔刷 +「云澜」红印章 + DEAD MALL，预先栅格化成一张画布。
// 试做版的毛病：Logo 是带 feTurbulence / feDisplacementMap 滤镜的 SVG，字体又是用到才读——出场那一刻浏览器才排版、才跑滤镜，
// 所以「卡了一下，然后才跳到正常状态，一开始是显示不全的」。正式版在进度条阶段就：读字体 → 等 document.fonts.check 为真 → 一次画完；
// 出场时菜单只对这张现成的画布做透明度 / 位移动画（见 title.css.js），不再排版、不再读字体、不跑滤镜。
// 笔刷、干笔飞白、印章的残缺都用固定种子的随机数画，每次一样。
import { TITLE_FONT_FAMILIES } from './title-data.js';

/** Logo 画布的设计尺寸（scale = 1 时的像素；菜单按宽度缩放显示） */
export const LOGO_SIZE = Object.freeze({ w: 1200, h: 520 });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** 固定种子的随机数（mulberry32） */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * 读字体并画 Logo。fonts = { brush, latin }：两个字体文件的地址（已经换算好的）。
 * 先 FontFace.load() + document.fonts.add（已经读过的同名字体不重复读），再等 document.fonts.check 对两种字体都为真才画；
 * 没有字体接口、读失败、超时（默认 10 秒）都 reject——调用方改用静态 Logo 图。返回画好的整张画布（dataset.ready = '1'）。
 * doc、FontFace、poll（轮询间隔毫秒）、timeout 可以注入（测试用）。
 */
export async function prepareLogo({ fonts = {}, scale = 1, doc = globalThis.document, FontFace = globalThis.FontFace, poll = 16, timeout = 10000, families = TITLE_FONT_FAMILIES } = {}) {
  if (!doc?.fonts || typeof FontFace !== 'function') throw new Error('浏览器没有字体接口，Logo 改用静态图');
  const has = (fam) => [...doc.fonts].some((f) => String(f.family || '').replace(/["']/g, '') === fam && f.status === 'loaded');
  try {
    await Promise.all(['brush', 'latin'].map(async (k) => {
      if (has(families[k])) return;
      const face = new FontFace(families[k], `url(${fonts[k]})`);
      await face.load();
      doc.fonts.add(face);
    }));
  } catch (e) { throw new Error(`Logo 字体读取失败：${e?.message || e}`); }
  const ready = () => { try { return doc.fonts.check(`64px "${families.brush}"`, '围城云澜') && doc.fonts.check(`40px "${families.latin}"`, 'DEAD MALL'); } catch { return false; } };
  const t0 = Date.now();
  while (!ready()) {
    if (Date.now() - t0 > timeout) throw new Error('Logo 字体等了太久还不可用');
    await wait(poll);
  }
  const canvas = drawLogo(doc, scale, families);
  canvas.dataset.ready = '1';
  return canvas;
}

/** 画 Logo（字体必须已经可用）。返回画布 */
export function drawLogo(doc, scale, families = TITLE_FONT_FAMILIES) {
  const { w: W, h: H } = LOGO_SIZE;
  const mk = (w, h) => { const c = doc.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale); const g = c.getContext('2d'); g.setTransform(scale, 0, 0, scale, 0, 0); return [c, g]; };
  const [canvas, g] = mk(W, H);
  const brush = `"${families.brush}", serif`, latin = `"${families.latin}", sans-serif`;

  bloodSlash(g, rng(21));

  // 字的影子：黑色晕开，压在笔刷上，让骨白的字从红底里跳出来
  g.save();
  g.font = `400px ${brush}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 34 * scale; g.shadowOffsetY = 6 * scale;
  g.fillStyle = 'rgba(0,0,0,0.78)'; g.fillText('围城', 600, 384);
  g.restore();

  // 骨白的「围城」：单独画在一张图上，再刮出干笔飞白、斑点，压一点陈旧的污渍和溅上的血
  const [gc, gx] = mk(W, H);
  gx.font = `400px ${brush}`; gx.textAlign = 'center'; gx.textBaseline = 'alphabetic';
  const bone = gx.createLinearGradient(0, 90, 0, 400); bone.addColorStop(0, '#f6f2e9'); bone.addColorStop(0.55, '#ddd5c6'); bone.addColorStop(1, '#b4ab9a');
  gx.fillStyle = bone; gx.fillText('围城', 600, 380);
  const r = rng(11);
  gx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 40; i++) { // 陈旧的污渍：几道发黄发灰的横纹
    const y = 110 + r() * 280, x = 230 + r() * 720, len = 60 + r() * 260;
    gx.strokeStyle = `rgba(${90 + r() * 40},${78 + r() * 30},${60 + r() * 20},${0.05 + r() * 0.1})`; gx.lineWidth = 2 + r() * 8;
    gx.beginPath(); gx.moveTo(x, y); gx.lineTo(x + len, y - len * 0.04 + (r() - 0.5) * 6); gx.stroke();
  }
  for (let i = 0; i < 26; i++) { // 溅上去的血点，多在字的下半截（靠近笔刷）
    const x = 260 + r() * 680, y = 270 + r() * 120, rad = 1.5 + r() * r() * 9;
    gx.fillStyle = `rgba(${150 + r() * 40},${10 + r() * 14},${8 + r() * 10},${0.55 + r() * 0.35})`;
    gx.beginPath(); gx.ellipse(x, y, rad * (1 + r()), rad, r() * Math.PI, 0, Math.PI * 2); gx.fill();
  }
  gx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 150; i++) { // 干笔飞白：顺着笔势的细长缺口，成簇出现（一笔里几根毛同时断），不铺满整个字
    const cx = 220 + r() * 760, cy = 110 + r() * 290, n = 2 + Math.floor(r() * 4), a = -0.06 + (r() - 0.5) * 0.1;
    if (r() < 0.45) continue;
    for (let j = 0; j < n; j++) {
    const x = cx + (r() - 0.5) * 20, y = cy + j * (2 + r() * 3), len = 12 + r() * r() * 130;
    gx.strokeStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`; gx.lineWidth = 0.5 + r() * r() * 1.8; gx.lineCap = 'round';
    gx.beginPath(); gx.moveTo(x, y); gx.quadraticCurveTo(x + len * 0.5, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 4, x + len * Math.cos(a), y + len * Math.sin(a)); gx.stroke();
    }
  }
  for (let i = 0; i < 420; i++) { // 斑点、砂眼
    const x = 220 + r() * 760, y = 100 + r() * 300, rad = 0.4 + r() * r() * 2.6;
    gx.fillStyle = `rgba(0,0,0,${0.4 + r() * 0.6})`; gx.beginPath(); gx.arc(x, y, rad, 0, Math.PI * 2); gx.fill();
  }
  gx.globalCompositeOperation = 'source-over';
  g.drawImage(gc, 0, 0, W, H);

  seal(g, mk, brush, rng(7));

  // DEAD MALL：逐字排开（字距 22），两边各一道细线
  g.save();
  g.font = `40px ${latin}`; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = '#ece7dd';
  g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 10 * scale;
  const text = 'DEAD MALL', gap = 22, ws = [...text].map((ch) => g.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  let x = 600 - total / 2;
  for (const [i, ch] of [...text].entries()) { g.fillText(ch, x, 466); x += ws[i] + gap; }
  g.globalAlpha = 0.5; g.shadowBlur = 0;
  g.fillRect(600 - total / 2 - 28 - 150, 452, 150, 1.5);
  g.fillRect(600 + total / 2 + 28, 452, 150, 1.5);
  g.restore();
  return canvas;
}

/** 字后面那一道血红笔刷：一束顺着笔势的「毛」叠出来，起笔饱满、收笔散成飞白，边上甩出血点和往下淌的血 */
function bloodSlash(g, r) {
  // 笔势中线（三次贝塞尔）和半宽（起笔粗、收笔细）
  const P = [[88, 348], [300, 312], [640, 322], [1116, 264]];
  const at = (t) => { const u = 1 - t; const b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]; return [P.reduce((s, p, i) => s + p[0] * b[i], 0), P.reduce((s, p, i) => s + p[1] * b[i], 0)]; };
  const nrm = (t) => { const a = at(Math.max(0, t - 0.005)), b = at(Math.min(1, t + 0.005)); const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  const half = (t) => 32 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.04)), 0.45) * (1 - 0.35 * t);
  const pt = (t, v) => { const [x, y] = at(t), [nx, ny] = nrm(t), h = half(t) * v; return [x + nx * h, y + ny * h]; };

  // 底：笔刷芯（不透明的那一块）
  g.save();
  const grad = g.createLinearGradient(80, 0, 1120, 0); grad.addColorStop(0, '#8e0d07'); grad.addColorStop(0.35, '#b8140c'); grad.addColorStop(0.8, '#c81a10'); grad.addColorStop(1, '#a3120a');
  g.fillStyle = grad; g.globalAlpha = 0.95;
  g.beginPath();
  for (let i = 0; i <= 60; i++) { const [x, y] = pt(0.02 + (i / 60) * 0.8, -0.72); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let i = 60; i >= 0; i--) { const [x, y] = pt(0.02 + (i / 60) * 0.8, 0.72); g.lineTo(x, y); }
  g.closePath(); g.fill();
  // 毛：每根从起笔附近开始，到不同的地方断掉（越靠边越早断），收笔一段就成了飞白
  g.lineCap = 'round';
  for (let k = 0; k < 170; k++) {
    const v = (r() * 2 - 1) * (0.55 + r() * 0.5), edge = Math.abs(v);
    const t0 = r() * 0.06, t1 = Math.min(1, 0.62 + r() * 0.42 - edge * edge * 0.3);
    const dark = r() < 0.35, a = 0.35 + r() * 0.6;
    g.strokeStyle = dark ? `rgba(${90 + r() * 30},6,4,${a})` : `rgba(${190 + r() * 50},${18 + r() * 22},${12 + r() * 12},${a})`;
    g.lineWidth = 0.8 + r() * 3.2;
    const wob = r() * 1000;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = lerp(t0, t1, i / 40), [x, y] = pt(t, v + Math.sin(wob + t * 9) * 0.04);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  // 甩出去的血点（多在收笔那头）和往下淌的血
  for (let i = 0; i < 70; i++) {
    const t = Math.pow(r(), 0.6), side = r() < 0.5 ? -1 : 1, [x, y] = pt(t, side * (1 + r() * 1.8));
    const rad = 0.8 + r() * r() * 6;
    g.fillStyle = `rgba(${150 + r() * 50},${12 + r() * 12},8,${0.5 + r() * 0.45})`;
    g.beginPath(); g.ellipse(x + (r() - 0.5) * 30, y + side * r() * 16, rad * (1 + r() * 1.5), rad, -0.1, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 7; i++) {
    const t = 0.12 + r() * 0.62, [x, y] = pt(t, 0.8), len = 14 + r() * 46, wd = 1.6 + r() * 2.4;
    g.fillStyle = `rgba(${150 + r() * 30},12,8,0.85)`;
    g.fillRect(x - wd / 2, y - 2, wd, len);
    g.beginPath(); g.arc(x, y + len, wd * 0.95, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

/** 「云澜」红印章：白文两字竖排，边缘有缺口、印泥不匀 */
function seal(g, mk, brush, r) {
  const S = 140, [sc, sx] = mk(S, S);
  sx.fillStyle = '#c8160d';
  const o = 14, s = 112, rad = 8;
  sx.beginPath(); sx.moveTo(o + rad, o); sx.lineTo(o + s - rad, o); sx.quadraticCurveTo(o + s, o, o + s, o + rad); sx.lineTo(o + s, o + s - rad); sx.quadraticCurveTo(o + s, o + s, o + s - rad, o + s);
  sx.lineTo(o + rad, o + s); sx.quadraticCurveTo(o, o + s, o, o + s - rad); sx.lineTo(o, o + rad); sx.quadraticCurveTo(o, o, o + rad, o); sx.closePath(); sx.fill();
  sx.globalCompositeOperation = 'source-atop'; // 印泥不匀：深浅斑
  for (let i = 0; i < 40; i++) { sx.fillStyle = `rgba(${r() < 0.5 ? '90,0,0' : '255,60,40'},${0.06 + r() * 0.12})`; sx.beginPath(); sx.arc(o + r() * s, o + r() * s, 4 + r() * 16, 0, Math.PI * 2); sx.fill(); }
  sx.globalCompositeOperation = 'destination-out'; // 字刻出来（白文）：先挖空，再在底下垫纸色
  sx.font = `54px ${brush}`; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = '#000';
  sx.fillText('云', 70, 44); sx.fillText('澜', 70, 98);
  for (let i = 0; i < 90; i++) { // 边缘缺口
    const e = r() * 4, p = r() * s; const [x, y] = e < 1 ? [o + p, o] : e < 2 ? [o + s, o + p] : e < 3 ? [o + p, o + s] : [o, o + p];
    sx.beginPath(); sx.arc(x + (r() - 0.5) * 3, y + (r() - 0.5) * 3, 0.6 + r() * r() * 4, 0, Math.PI * 2); sx.fill();
  }
  for (let i = 0; i < 140; i++) { sx.globalAlpha = 0.3 + r() * 0.7; sx.beginPath(); sx.arc(o + r() * s, o + r() * s, 0.3 + r() * 1.3, 0, Math.PI * 2); sx.fill(); }
  sx.globalAlpha = 1;
  sx.globalCompositeOperation = 'destination-over'; // 挖空的字里透出的纸色
  sx.fillStyle = '#efe4d6'; sx.font = `54px ${brush}`; sx.fillText('云', 70, 44); sx.fillText('澜', 70, 98);
  sx.globalCompositeOperation = 'source-over';
  g.save(); g.translate(1000 + 56, 72 + 56); g.rotate((4 * Math.PI) / 180); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 12;
  g.drawImage(sc, -S / 2, -S / 2, S, S); g.restore();
}
