// 丧尸围城的任务物件：武器柜、配电柜、工具（撬棍 / 保险丝 / 灭火器 / 门禁卡）、四种关卡（杂物 / 火 / 卷帘栅门 / 防火门）、信号弹。
// 以前都是几个纯色方块；停电以后人拿手电去照，方块一眼就穿帮。这里按真东西的样子搭：
//   · 几何体按材质合并：每个物件只有两三个网格（漆面、金属、亮面塑料 / 玻璃），动的部分（门扇、卷帘、拉杆）单独一个；
//     同一种物件的几何体全局只建一次、各局复用（不随一局一局地漏显存）。
//   · 颜色放在顶点色里，细节（木纹、漆面的磨损和污渍、纸箱的胶带、标签上的字）放在一张共用的小图集里，跟顶点色相乘；
//     省内存档（compact）不要图集，只剩顶点色——形状照样认得出来，只是没有字和纹理。
//   · 火：不是橙色方块，是几张交叉的「火苗卡片」，片元着色器里用噪声算火苗的形状和颜色（加色混合，不要贴图），
//     加上往上飘的火星（一组点）、几团烟、地面和台阶上一层火光（加色）、熏黑的地面。火光不用真灯：每多一盏灯，全场每个像素都要多算一遍。
// 没有 document（节点测试）：图集不画，材质照样建，几何体照样合并——测试拿得到同样的结构。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MEM } from '../render/device.js';

/** 楼梯：关卡大件摆在第一跑梯段往上 0.7 米处（siege.js 的 plan.gates[].model），本地 +z 朝上楼方向，梯段从 z = -0.7 开始。
 * 塔楼的防烟楼梯坡度都在 0.57–0.61 之间，梯段宽 1.3（北区）/ 1.6（公寓）米。 */
export const STAIR = Object.freeze({ start: -0.7, slope: 0.585, half: 0.65 });
/** 本地 z 处踏步前沿连线的高度（梯段口以前是平地） */
export const nosingY = (z) => Math.max(0, (z - STAIR.start) * STAIR.slope);

// ---------- 图集 ----------
/** 图集分区（按 1024 × 1024 排，单位像素：x, y, w, h）。木纹、漆面、金属这些是「灰度细节」，乘到顶点色上；标签是彩色的，顶点色给白。 */
export const ATLAS = Object.freeze({
  wood: [0, 0, 256, 256], woodDark: [256, 0, 256, 256], cardboard: [512, 0, 256, 256], mattress: [768, 0, 256, 256],
  door: [0, 256, 256, 512], doorSign: [256, 256, 512, 128], warn: [768, 256, 128, 128], extLabel: [896, 256, 128, 128],
  breakers: [256, 384, 512, 128], card: [768, 384, 128, 80], gauge: [896, 384, 64, 64], reader: [960, 384, 64, 128],
  lockerSign: [256, 512, 512, 128], hazard: [768, 512, 256, 64], plate: [768, 576, 256, 64], fuseLabel: [768, 640, 256, 64], flareLabel: [768, 704, 256, 64],
  paint: [256, 640, 512, 128], metal: [0, 768, 256, 256], scorch: [256, 768, 256, 256], powder: [512, 768, 256, 256], charred: [768, 768, 256, 256],
  shutterSign: [768, 464, 128, 48],
});
/** 分区 → UV 矩形 { u0, v0, u1, v1 }（画布 y 朝下，贴图 v 朝上）。纯函数 */
export function atlasRect(name) {
  const r = ATLAS[name]; if (!r) return null;
  const [x, y, w, h] = r, S = 1024;
  return { u0: x / S, u1: (x + w) / S, v0: 1 - (y + h) / S, v1: 1 - y / S };
}
/** 这一档要多大的图集：0 = 不要（省内存档）。读的是当时的 MEM（换画质会换档） */
export const atlasSize = (mem = MEM) => (mem.modelTex >= 1024 ? 1024 : mem.modelTex >= 512 ? 512 : 0);

let ATL = null; // { tex, size, canvas }
/** 分帧画：每帧画一两块，单帧不超过几毫秒（开局正在加载，不能卡住） */
function slices() {
  const q = []; let busy = false;
  const tick = typeof requestAnimationFrame === 'function' ? (f) => requestAnimationFrame(() => setTimeout(f, 0)) : (f) => setTimeout(f, 16);
  const run = () => { const job = q.shift(); if (job) { try { job(); } catch (e) { console.error('[丧尸围城] 物件贴图出错', e); } } if (q.length) tick(run); else busy = false; };
  return { add(job) { q.push(job); if (!busy) { busy = true; tick(run); } } };
}
function atlas() {
  const size = atlasSize();
  if (!size || typeof document === 'undefined') return null;
  if (ATL && ATL.size === size) return ATL;
  if (ATL) ATL.tex.dispose();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); if (!g) return null;
  // 先铺一层中性灰（画完之前的那几帧也不会是一片白）
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.name = 'siege-props';
  ATL = { tex, size, canvas: c };
  const s = size / 1024, later = slices(), mark = () => { tex.needsUpdate = true; };
  for (const [name, draw] of Object.entries(PAINT)) later.add(() => { const r = ATLAS[name]; g.save(); g.scale(s, s); g.beginPath(); g.rect(r[0], r[1], r[2], r[3]); g.clip(); g.translate(r[0], r[1]); draw(g, r[2], r[3], rnd(name.length * 977 + r[0] + r[1])); g.restore(); mark(); });
  return ATL;
}
const rnd = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const FONT = "'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif";
/** 灰度噪点：一堆半透明小方块（比逐像素快得多） */
function speck(g, w, h, r, n, a, light = false, sz = 3) { for (let i = 0; i < n; i++) { const v = light ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${(a * (0.3 + r() * 0.7)).toFixed(3)})`; const k = 1 + r() * sz; g.fillRect(r() * w, r() * h, k, k); } }
function grime(g, w, h, r, k = 1) {
  // 下面脏、边角磨亮、几道划痕
  const gr = g.createLinearGradient(0, h, 0, h * 0.55); gr.addColorStop(0, `rgba(30,24,18,${0.35 * k})`); gr.addColorStop(1, 'rgba(30,24,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  speck(g, w, h, r, 260 * k, 0.12); speck(g, w, h, r, 90 * k, 0.1, true);
  g.lineWidth = 1; for (let i = 0; i < 14 * k; i++) { g.strokeStyle = `rgba(255,255,255,${(0.08 + r() * 0.12).toFixed(2)})`; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 50, y + (r() - 0.5) * 14); g.stroke(); }
}
function grain(g, w, h, r, base, lines, dark) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < lines; i++) { const y = r() * h, a = 0.05 + r() * (dark ? 0.12 : 0.18); g.strokeStyle = `rgba(40,25,10,${a.toFixed(3)})`; g.lineWidth = 0.6 + r() * 1.8; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3 + (r() - 0.5) * 1.5); g.stroke(); }
  speck(g, w, h, r, 120, 0.08);
}
function text(g, t, x, y, px, color, weight = 700, align = 'center') { g.fillStyle = color; g.font = `${weight} ${px}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y); }
function soot(g, w, h, r, rgb, alpha) {
  // 一团不规则的熏黑 / 干粉：许多叠起来的软圆
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * w * 0.32, x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d * 0.9, rad = w * (0.06 + r() * 0.14);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${rgb},${(alpha * (0.25 + r() * 0.35)).toFixed(3)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
const PAINT = {
  wood: (g, w, h, r) => grain(g, w, h, r, '#e4e0da', 60, false),
  woodDark: (g, w, h, r) => { grain(g, w, h, r, '#dcd8d2', 40, true); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28); g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2; g.strokeRect(18, 18, w - 36, h - 36); },
  cardboard: (g, w, h, r) => {
    g.fillStyle = '#e9e5df'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 6) { g.fillStyle = `rgba(80,60,30,${(0.03 + r() * 0.03).toFixed(3)})`; g.fillRect(x, 0, 2, h); }
    g.fillStyle = 'rgba(255,250,235,0.55)'; g.fillRect(0, h * 0.44, w, h * 0.12); // 封箱胶带
    g.fillStyle = 'rgba(60,40,20,0.5)'; g.font = `700 22px ${FONT}`; g.textAlign = 'left'; g.fillText('易碎 · 向上', 20, h * 0.8);
    speck(g, w, h, r, 120, 0.12); grime(g, w, h, r, 0.6);
  },
  mattress: (g, w, h, r) => {
    g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 18) { g.fillStyle = 'rgba(90,100,120,0.16)'; g.fillRect(x, 0, 7, h); }
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1.5; for (let y = 16; y < h; y += 32) for (let x = 16; x < w; x += 32) { g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.stroke(); }
    for (let i = 0; i < 4; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(120,80,30,0.35)'); gr.addColorStop(0.8, 'rgba(120,80,30,0.12)'); gr.addColorStop(1, 'rgba(120,80,30,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    speck(g, w, h, r, 80, 0.08);
  },
  door: (g, w, h, r) => {
    g.fillStyle = '#e2ddd6'; g.fillRect(0, 0, w, h);
    // 钢门的压纹面板：两块凹进去的方框
    for (const [y0, y1] of [[40, 190], [300, 470]]) { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3; g.strokeRect(30, y0, w - 60, y1 - y0); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.strokeRect(34, y0 + 4, w - 68, y1 - y0 - 8); }
    grime(g, w, h, r, 1.4);
    // 下半截踢脏了
    const gr = g.createLinearGradient(0, h, 0, h * 0.8); gr.addColorStop(0, 'rgba(25,20,15,0.45)'); gr.addColorStop(1, 'rgba(25,20,15,0)'); g.fillStyle = gr; g.fillRect(0, h * 0.8, w, h * 0.2);
  },
  doorSign: (g, w, h) => {
    g.fillStyle = '#0f7a43'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f2f2ea'; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, h - 16);
    text(g, '常闭式防火门', w / 2, h * 0.36, 52, '#f6f6ee'); text(g, '请随手关门', w / 2, h * 0.74, 34, '#f6f6ee', 600);
  },
  warn: (g, w, h) => {
    g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2c018'; g.strokeStyle = '#111'; g.lineWidth = 7; g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w - 10, h * 0.78); g.lineTo(10, h * 0.78); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.moveTo(w * 0.54, h * 0.24); g.lineTo(w * 0.4, h * 0.52); g.lineTo(w * 0.52, h * 0.5); g.lineTo(w * 0.46, h * 0.72); g.lineTo(w * 0.62, h * 0.42); g.lineTo(w * 0.5, h * 0.44); g.closePath(); g.fill();
    text(g, '当心触电', w / 2, h * 0.9, 19, '#111');
  },
  extLabel: (g, w, h) => {
    g.fillStyle = '#b8231b'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4efe4'; g.fillRect(8, 8, w - 16, h - 16);
    text(g, '灭火器', w / 2, h * 0.24, 26, '#b8231b'); text(g, 'MFZ/ABC4', w / 2, h * 0.46, 15, '#222', 600);
    g.fillStyle = '#222'; for (let i = 0; i < 4; i++) g.fillRect(18, h * 0.6 + i * 9, w - 36 - (i % 2) * 20, 3);
  },
  breakers: (g, w, h, r) => {
    g.fillStyle = '#9a9c9c'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9cbcb'; g.fillRect(0, h * 0.18, w, h * 0.64); // 导轨
    for (let i = 0; i < 12; i++) {
      const x = 8 + i * 41.5; g.fillStyle = i === 0 ? '#e8e6e0' : '#f0eee8'; g.fillRect(x, h * 0.2, i === 0 ? 70 : 36, h * 0.6);
      if (i === 0) { g.fillStyle = '#b23a2a'; g.fillRect(x + 22, h * 0.32, 26, 34); continue; }
      g.fillStyle = '#222'; g.fillRect(x + 12, h * (r() < 0.25 ? 0.3 : 0.45), 12, 22); g.fillStyle = '#444'; g.fillRect(x + 6, h * 0.72, 24, 4);
    }
    g.fillStyle = '#f2f2ee'; g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = '#333'; g.font = `600 12px ${FONT}`; g.textAlign = 'left'; for (let i = 0; i < 11; i++) g.fillText(['照明', '插座', '电梯', '应急', '风机', '水泵', '1#', '2#', '3#', '备用', '备用'][i], 56 + i * 41.5, h * 0.93);
  },
  card: (g, w, h) => {
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a5a9a'; g.fillRect(0, 0, w, h * 0.3);
    text(g, '云澜 · 门禁卡', w * 0.5, h * 0.15, 13, '#f4f4f0'); g.fillStyle = '#c9ccd2'; g.fillRect(8, h * 0.4, 26, 32);
    g.fillStyle = '#555'; for (let i = 0; i < 3; i++) g.fillRect(42, h * 0.44 + i * 10, 70 - i * 14, 4);
  },
  gauge: (g, w, h) => {
    g.fillStyle = '#d8d8d4'; g.fillRect(0, 0, w, h); g.fillStyle = '#f6f6f0'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.42, 0, 7); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#b8231b'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.32, Math.PI * 0.8, Math.PI * 1.1); g.stroke();
    g.strokeStyle = '#2a8a3a'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.32, Math.PI * 1.25, Math.PI * 1.75); g.stroke();
    g.strokeStyle = '#111'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w * 0.7, h * 0.26); g.stroke();
  },
  reader: (g, w, h) => {
    g.fillStyle = '#26282b'; g.fillRect(0, 0, w, h); g.fillStyle = '#16181a'; g.fillRect(6, 6, w - 12, h - 12);
    g.strokeStyle = 'rgba(220,225,230,0.65)'; g.lineWidth = 2.5; for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(w / 2 - 6, h * 0.55, i * 7, -0.7, 0.7); g.stroke(); }
    g.strokeStyle = 'rgba(220,225,230,0.5)'; g.strokeRect(w / 2 - 14, h * 0.78, 28, 14);
  },
  lockerSign: (g, w, h) => {
    g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, w, h);
    text(g, '枪械柜', w * 0.33, h * 0.46, 70, 'rgba(30,30,30,0.85)', 800); text(g, '双人双锁 · 闲人免入', w * 0.76, h * 0.46, 24, 'rgba(30,30,30,0.75)', 600);
  },
  hazard: (g, w, h) => { g.fillStyle = '#e8b820'; g.fillRect(0, 0, w, h); g.fillStyle = '#151515'; for (let x = -h; x < w + h; x += 44) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 22, h); g.lineTo(x + 22 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); } },
  plate: (g, w, h) => { g.fillStyle = '#eceae2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#333'; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10); text(g, '低压配电柜 AP-B1', w / 2, h / 2, 26, '#1d1d1d'); },
  fuseLabel: (g, w, h) => { g.fillStyle = '#f0e6c8'; g.fillRect(0, 0, w, h); text(g, '保险丝 · 熔断器 32A', w / 2, h / 2, 26, '#2a2a2a'); },
  flareLabel: (g, w, h) => { g.fillStyle = '#c42a18'; g.fillRect(0, 0, w, h); text(g, '手持信号弹 · 红光', w * 0.42, h / 2, 26, '#f6efe0'); g.fillStyle = '#f6efe0'; g.fillRect(w - 46, 10, 34, h - 20); },
  paint: (g, w, h, r) => { g.fillStyle = '#e6e4e0'; g.fillRect(0, 0, w, h); grime(g, w, h, r, 1.2); },
  metal: (g, w, h, r) => {
    g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${(r() * 0.06).toFixed(3)})`; g.fillRect(0, y, w, 1); }
    speck(g, w, h, r, 160, 0.1); grime(g, w, h, r, 0.8);
  },
  scorch: (g, w, h, r) => soot(g, w, h, r, '8,6,5', 0.95),
  powder: (g, w, h, r) => soot(g, w, h, r, '236,234,226', 0.8),
  charred: (g, w, h, r) => {
    g.fillStyle = '#d2cec9'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(0,0,0,${(0.3 + r() * 0.5).toFixed(2)})`; g.lineWidth = 1 + r() * 2; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 + r() * 22, y + (r() - 0.5) * 4); g.stroke(); }
    speck(g, w, h, r, 200, 0.2, true, 2);
  },
  shutterSign: (g, w, h) => { g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h); g.fillStyle = '#c4261c'; g.fillRect(0, 0, w, 18); text(g, '防火卷帘', w / 2, 9, 13, '#fff'); text(g, '下方禁止堆放', w / 2, h * 0.64, 16, '#c4261c'); },
};

// ---------- 材质 ----------
const PM = {};
/** 共用材质：漆面（木头、纸箱、漆过的钢板、标签）、金属、亮面（塑料、玻璃）、熏黑 / 干粉（透明贴花）、指示灯 */
export function propMats() {
  const A = atlas(), map = A?.tex || null;
  if (PM.paint && PM.map === map) return PM;
  const std = (o) => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map, ...o });
  for (const k of ['paint', 'metal', 'gloss', 'decal']) PM[k]?.dispose?.();
  Object.assign(PM, { map,
    paint: std({ roughness: 0.78, metalness: 0 }),
    metal: std({ roughness: 0.4, metalness: 0.8 }),
    gloss: std({ roughness: 0.22, metalness: 0.15 }),
    decal: std({ roughness: 0.95, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  });
  PM.ledRed ||= new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  PM.ledGreen ||= new THREE.MeshBasicMaterial({ color: 0x4dff7a, toneMapped: false });
  PM.ledAmber ||= new THREE.MeshBasicMaterial({ color: 0xffb030, toneMapped: false });
  PM.lamp ||= new THREE.MeshBasicMaterial({ color: 0x2a1410, toneMapped: true }); // 不亮的指示灯罩
  return PM;
}

// ---------- 拼装 ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
/**
 * 按材质收集零件、最后合并成一个材质一个网格。at(pos, rot, fn)：在一个局部坐标系里摆一组零件（可以嵌套）。
 * add(key, geo, { color, region, label, p, r, s })：label = 彩色标签（有图集时顶点色给白，没有图集时用 color）。
 */
export class Kit {
  constructor(useAtlas = !!PM.map) { this.parts = new Map(); this.stack = [new THREE.Matrix4()]; this.useAtlas = useAtlas; this.tris = 0; }
  at(p = [0, 0, 0], r = [0, 0, 0], fn) { const m = new THREE.Matrix4().compose(_v.set(...p), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(1, 1, 1)); this.stack.push(this.top().clone().multiply(m)); fn(); this.stack.pop(); return this; }
  top() { return this.stack[this.stack.length - 1]; }
  add(key, geo, { color = 0xffffff, region = null, label = false, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
    const R = region ? atlasRect(region) : null;
    const uv = geo.attributes.uv;
    if (uv) for (let i = 0; i < uv.count; i++) { if (R) uv.setXY(i, R.u0 + uv.getX(i) * (R.u1 - R.u0), R.v0 + uv.getY(i) * (R.v1 - R.v0)); else uv.setXY(i, 0.5, 0.31); } // 没指定分区：落在漆面那块中间（一个近乎中性的点）
    _c.set(label && this.useAtlas ? 0xffffff : color);
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    _m.compose(_v.set(...p), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(...s));
    geo.applyMatrix4(this.top().clone().multiply(_m));
    if (!geo.index) geo.setIndex([...Array(n).keys()]);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(geo); this.tris += geo.index.count / 3;
    return this;
  }
  box(key, w, h, d, o = {}) { return this.add(key, new THREE.BoxGeometry(w, h, d), o); }
  cyl(key, r0, r1, h, seg, o = {}) { return this.add(key, new THREE.CylinderGeometry(r0, r1, h, seg, 1, !!o.open, o.t0 || 0, o.tl || Math.PI * 2), o); }
  plane(key, w, h, o = {}) { return this.add(key, new THREE.PlaneGeometry(w, h), o); }
  torus(key, R, r, seg, tube, arc, o = {}) { return this.add(key, new THREE.TorusGeometry(R, r, seg, tube, arc), o); }
  lathe(key, pts, seg, o = {}) { return this.add(key, new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), o); }
  /** 合并好的几何体 { key: BufferGeometry } */
  geometries() { const out = {}; for (const [k, list] of this.parts) out[k] = mergeGeometries(list, false); for (const list of this.parts.values()) for (const g of list) g.dispose(); this.parts.clear(); return out; }
}
const GEO = new Map();
/** 同一种物件的几何体只建一次（key 里带上有没有图集：顶点色不一样） */
function cached(key, build) {
  propMats();
  const k = `${key}|${PM.map ? 1 : 0}`;
  if (!GEO.has(k)) { const kit = new Kit(!!PM.map); build(kit); GEO.set(k, { geos: kit.geometries(), tris: kit.tris }); }
  return GEO.get(k).geos;
}
/** 火、烟、信号弹这些着色器物件的几何体也只建一次（材质每处一份：各自的时间、淡出互不影响；没有贴图，丢了也不占显存） */
const RAW = new Map();
const once = (key, make) => { if (!RAW.has(key)) RAW.set(key, make()); return RAW.get(key); };
/** 把合并好的几何体挂成网格（每个材质一个） */
function meshes(parent, geos, { shadow = true } = {}) {
  const M = propMats(), out = {};
  for (const [k, geo] of Object.entries(geos)) { const m = new THREE.Mesh(geo, M[k]); m.name = k; m.castShadow = shadow && k !== 'decal'; m.receiveShadow = k !== 'decal'; parent.add(m); out[k] = m; }
  return out;
}
/** 一个物件（含子组）一共几次绘制、多少三角形。纯函数，测试和报预算用 */
export function propStats(root) {
  let draws = 0, tris = 0;
  const shown = (o) => { for (let p = o; p && p !== root.parent; p = p.parent) if (p.visible === false) return false; return true; };
  root.traverse((o) => { if (!(o.isMesh || o.isPoints) || !shown(o)) return; draws++; const g = o.geometry; tris += o.isPoints ? 0 : (g.index ? g.index.count : g.attributes.position.count) / 3; });
  return { draws, tris: Math.round(tris) };
}

// ---------- 火、烟、火星、火光（着色器，加色混合，不要贴图） ----------
const NOISE = /* glsl */`
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
`;
/** 推进一组火 / 烟材质的时间、设淡出（uFade：1 = 正常，0 = 没了）。每个物件自己一份 uniform，几处火互不影响 */
export function fireStep(list, t, fade = null) { for (const m of list) { m.uniforms.uTime.value = t % 600; if (fade != null) m.uniforms.uFade.value = typeof fade === 'function' ? fade(m) : fade; } }

/** 火苗卡片：uv.y 0 在底、1 在顶；seed 让每张卡片的噪声错开。hot：颜色（普通火是橙黄，信号弹是红） */
export function flameMaterial({ hot = [1.0, 0.86, 0.55], mid = [1.0, 0.4, 0.05], cool = [0.55, 0.06, 0.0], gain = 1.25 } = {}) {
  return new THREE.ShaderMaterial({
    name: 'siege-flame', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uHot: { value: new THREE.Vector3(...hot) }, uMid: { value: new THREE.Vector3(...mid) }, uCool: { value: new THREE.Vector3(...cool) }, uGain: { value: gain } },
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime; varying vec2 vUv; varying float vSeed;
      void main() { vUv = uv; vSeed = seed; vec3 p = position; float h = uv.y * uv.y;
        p.x += sin(uTime * 3.1 + seed * 6.0) * 0.05 * h; p.z += cos(uTime * 2.3 + seed * 4.0) * 0.05 * h;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uFade, uGain; uniform vec3 uHot, uMid, uCool; varying vec2 vUv; varying float vSeed;
      ${NOISE}
      void main() {
        float y = vUv.y;
        float n = fbm(vec2(vUv.x * 3.0 + vSeed * 7.0, y * 2.2 - uTime * 2.6 + vSeed * 3.0));
        float n2 = fbm(vec2(vUv.x * 6.0 - vSeed * 3.0, y * 4.5 - uTime * 4.2));
        float w = mix(0.44, 0.05, pow(y, 0.75));
        float x = abs(vUv.x - 0.5 + (n - 0.5) * 0.4 * y);
        float body = smoothstep(w, w * 0.25, x);
        float shape = body * smoothstep(1.0, 0.3, y + (n2 - 0.5) * 0.6) * smoothstep(0.0, 0.1, y);
        float heat = clamp(shape * (1.45 - y * 1.15) + (n - 0.5) * 0.35, 0.0, 1.0);
        vec3 col = mix(uCool, uMid, smoothstep(0.08, 0.5, heat));
        col = mix(col, uHot, smoothstep(0.62, 0.96, heat));
        float a = shape * uFade * smoothstep(0.02, 0.2, heat);
        gl_FragColor = vec4(col * uGain, a);
        #include <colorspace_fragment>
      }`,
  });
}
/** 一组往上飘的烟团（每团一张朝着镜头的卡片）：center 属性是团的起点，seed 错开；color 烟的颜色，fire 底下被火映的颜色 */
export function smokeMaterial({ color = [0.09, 0.085, 0.08], fire = [0.5, 0.2, 0.05], opacity = 0.3, rise = 1.6, grow = 1.6, drift = [0.15, 0.05], period = 4 } = {}) {
  return new THREE.ShaderMaterial({
    name: 'siege-smoke', transparent: true, depthWrite: false, toneMapped: true, fog: false,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Vector3(...color) }, uFire: { value: new THREE.Vector3(...fire) }, uOpacity: { value: opacity }, uRise: { value: rise }, uGrow: { value: grow }, uDrift: { value: new THREE.Vector2(...drift) }, uPeriod: { value: period } },
    vertexShader: /* glsl */`
      attribute vec3 center; attribute float seed; uniform float uTime, uRise, uGrow, uPeriod; uniform vec2 uDrift; varying vec2 vUv; varying float vLife; varying float vSeed;
      void main() { vUv = uv; vSeed = seed;
        float life = fract(uTime / uPeriod + seed); vLife = life;
        vec3 c = center + vec3(uDrift.x * life + sin(seed * 31.0 + uTime * 0.7) * 0.08, uRise * life, uDrift.y * life);
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        float size = (0.35 + uGrow * life) * (0.8 + fract(seed * 7.3) * 0.4);
        mv.xy += (uv - 0.5) * size;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uFade, uOpacity; uniform vec3 uColor, uFire; varying vec2 vUv; varying float vLife; varying float vSeed;
      ${NOISE}
      void main() {
        vec2 q = vUv - 0.5; float r = length(q) * 2.0;
        float n = fbm(q * 3.0 + vec2(vSeed * 13.0, -uTime * 0.25));
        float puff = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.7);
        float a = puff * sin(3.14159 * vLife) * uOpacity * uFade;
        vec3 col = mix(uFire, uColor, smoothstep(0.0, 0.45, vLife)) * (0.8 + n * 0.4);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
/** 火星：一组点，从火堆里往上窜、左右飘、越飘越暗 */
export function emberMaterial({ color = [1.0, 0.55, 0.15], rise = 1.7, period = 2.2 } = {}) {
  return new THREE.ShaderMaterial({
    name: 'siege-embers', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Vector3(...color) }, uRise: { value: rise }, uPeriod: { value: period } },
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime, uRise, uPeriod; varying float vLife;
      void main() { float life = fract(uTime / (uPeriod * (0.7 + fract(seed * 5.1) * 0.6)) + seed); vLife = life;
        vec3 p = position + vec3(sin(seed * 40.0 + uTime * 2.0) * 0.18 * life, uRise * life * (0.6 + fract(seed * 3.7) * 0.6), cos(seed * 30.0 + uTime * 1.7) * 0.18 * life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(18.0 * (1.0 - life * 0.6) / max(0.5, -mv.z), 1.0, 5.0);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform float uFade; uniform vec3 uColor; varying float vLife;
      void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q)) * (1.0 - vLife) * uFade;
        gl_FragColor = vec4(mix(vec3(1.0, 0.85, 0.5), uColor, vLife) * 1.4, a);
        #include <colorspace_fragment>
      }`,
  });
}
/** 火光：地面、台阶上一层加色的暖光，中心在火堆，随火苗一闪一闪。center 本地坐标，radius 米 */
export function glowMaterial({ color = [1.0, 0.42, 0.12], center = [0, 0.3, 0.1], radius = [1.2, 1.5, 2.2], strength = 0.4 } = {}) {
  return new THREE.ShaderMaterial({
    name: 'siege-fire-glow', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Vector3(...color) }, uCenter: { value: new THREE.Vector3(...center) }, uRadius: { value: new THREE.Vector3(...(Array.isArray(radius) ? radius : [radius, radius, radius])) }, uStrength: { value: strength } },
    vertexShader: /* glsl */`varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uFade, uStrength; uniform vec3 uColor, uCenter, uRadius; varying vec3 vPos;
      void main() { float r = length((vPos - uCenter) / uRadius); // 楼梯间窄：横向收得快，顺着梯段拉得长
        float flick = 0.82 + 0.1 * sin(uTime * 11.0) + 0.08 * sin(uTime * 23.0 + 1.3);
        float a = exp(-r * r * 3.0) * (1.0 - smoothstep(0.6, 1.0, r)) * uStrength * flick * uFade;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
/** 火苗卡片的排布：n 朵火，每朵两张交叉的卡片。返回 [{ x, z, w, h, turn, seed }]（本地坐标，底在 nosingY(z)）。纯函数 */
export function flameLayout(n = 7, { half = 0.5, z0 = -0.35, z1 = 0.55, rng = rnd(7) } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5, x = -half + t * half * 2 + (rng() - 0.5) * 0.12, z = z0 + rng() * (z1 - z0);
    const mid = 1 - Math.abs(t - 0.5) * 1.4; // 中间的火高、两边矮
    out.push({ x, z, w: 0.42 + rng() * 0.3, h: 0.7 + mid * 0.75 + rng() * 0.2, turn: rng() * Math.PI, seed: rng() });
  }
  return out;
}
function flameGeometry(list, base = nosingY) {
  const pos = [], uv = [], seed = [], idx = [];
  for (const f of list) for (const k of [0, 1]) {
    const a = f.turn + k * Math.PI / 2, cx = Math.cos(a) * f.w / 2, cz = Math.sin(a) * f.w / 2, y0 = base(f.z) - 0.05, s = f.seed + k * 0.37, o = pos.length / 3;
    pos.push(f.x - cx, y0, f.z - cz, f.x + cx, y0, f.z + cz, f.x + cx, y0 + f.h, f.z + cz, f.x - cx, y0 + f.h, f.z - cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1); seed.push(s, s, s, s); idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1)); g.setIndex(idx);
  g.computeBoundingSphere(); return g;
}
function puffGeometry(centers) {
  const pos = [], uv = [], cen = [], seed = [], idx = [];
  centers.forEach(([x, y, z, s], i) => { const o = i * 4; for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { pos.push(x, y, z); uv.push(u, v); cen.push(x, y, z); seed.push(s); } idx.push(o, o + 1, o + 2, o, o + 2, o + 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('center', new THREE.Float32BufferAttribute(cen, 3)); g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1)); g.setIndex(idx);
  // 烟团在着色器里才往上飘、长大：包围球给大一点，不然会被视锥剔掉
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 12); return g;
}
function emberGeometry(n, rng, { half = 0.5, z0 = -0.3, z1 = 0.5 } = {}) {
  const pos = [], seed = [];
  for (let i = 0; i < n; i++) { const z = z0 + rng() * (z1 - z0); pos.push((rng() - 0.5) * half * 2, nosingY(z) + 0.1 + rng() * 0.2, z); seed.push(rng()); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4); return g;
}
/** 沿楼梯铺的一张面：平地部分（z0 到梯段口）+ 顺着踏步前沿斜上去的部分（梯段口到 z1），宽 w。给火光和熏黑用 */
function stairSheet(kit, key, w, z0, z1, o = {}, lift = 0.012) {
  const flatL = STAIR.start - z0, ang = Math.atan(STAIR.slope), slopeL = (z1 - STAIR.start) / Math.cos(ang);
  if (flatL > 0) kit.plane(key, w, flatL, { ...o, p: [0, lift, (z0 + STAIR.start) / 2], r: [-Math.PI / 2, 0, 0] });
  if (slopeL > 0) { const zm = (STAIR.start + z1) / 2; kit.plane(key, w, slopeL, { ...o, p: [0, nosingY(zm) + lift + 0.02, zm], r: [-Math.PI / 2 - ang, 0, 0] }); }
}
function rawSheet(w, z0, z1, lift = 0.015) {
  const k = new Kit(false); stairSheet(k, 'g', w, z0, z1, {}, lift); const g = k.geometries().g; g.deleteAttribute('color'); return g;
}

// ---------- 家具零件（杂物堆、火堆、桌子共用） ----------
const C = Object.freeze({ oak: 0x9a6a3e, walnut: 0x5a3a24, pine: 0xb48a58, kraft: 0xa98457, ticking: 0xb3ab98, steel: 0x8a8f94, galv: 0xa6aaad, dark: 0x1c1d1f, rubber: 0x121212,
  red: 0xa8201a, door: 0x7a2e24, grey: 0xb9bcbc, greyGreen: 0x5f6e66, cream: 0xd9d3c4, black: 0x0d0d0e, char: 0x2a2725, blue: 0x2f5f9e, orange: 0xd9621e, yellow: 0xd9a21f, brass: 0xb08a3a, white: 0xeeeeea });
function chair(k, { color = C.oak, region = 'wood' } = {}) {
  const o = { color, region };
  k.box('paint', 0.42, 0.035, 0.4, { ...o, p: [0, 0.45, 0] });
  for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) k.box('paint', 0.032, 0.45, 0.032, { ...o, p: [x, 0.225, z] });
  for (const x of [-0.18, 0.18]) k.box('paint', 0.03, 0.48, 0.03, { ...o, p: [x, 0.7, -0.185] });
  k.box('paint', 0.4, 0.12, 0.02, { ...o, p: [0, 0.86, -0.185] }); k.box('paint', 0.4, 0.05, 0.02, { ...o, p: [0, 0.66, -0.185] });
  k.box('paint', 0.36, 0.02, 0.02, { ...o, p: [0, 0.14, -0.17] });
}
function carton(k, w, h, d, o = {}) {
  k.box('paint', w, h, d, { color: C.kraft, region: 'cardboard', ...o });
  // 盖子的两片翘起一点
  if (o.flaps !== false) k.at(o.p || [0, 0, 0], o.r || [0, 0, 0], () => { k.box('paint', w * 0.98, 0.006, d * 0.48, { color: C.kraft, region: 'cardboard', p: [0, h / 2 + 0.03, -d * 0.26], r: [-0.35, 0, 0] }); });
}

// ---------- 物件 ----------
/** 武器柜（保安室）：双开门钢柜，门上冲压百叶、电子锁、模板喷字；开了以后两扇门敞开，里面一排步枪、弹药箱 */
export function buildLocker(g) {
  const geos = cached('locker', (k) => {
    const body = { color: C.greyGreen, region: 'paint' };
    k.box('paint', 1.04, 1.86, 0.02, { ...body, p: [0, 0.99, -0.24] }); // 背板
    for (const x of [-0.51, 0.51]) k.box('paint', 0.02, 1.86, 0.5, { ...body, p: [x, 0.99, 0] });
    k.box('paint', 1.04, 0.02, 0.5, { ...body, p: [0, 1.91, 0] }); k.box('paint', 1.04, 0.02, 0.5, { ...body, p: [0, 0.07, 0] });
    k.box('paint', 1.06, 0.06, 0.52, { color: C.dark, p: [0, 0.03, 0] }); // 底座
    k.box('paint', 1.0, 0.02, 0.4, { ...body, p: [0, 1.5, -0.02] }); // 隔板
    k.box('paint', 1.0, 0.02, 0.4, { ...body, p: [0, 0.4, -0.02] });
    k.box('paint', 0.9, 0.04, 0.06, { color: C.dark, p: [0, 1.25, -0.16] }); // 枪架上下两道托
    k.box('paint', 0.9, 0.04, 0.12, { color: C.dark, p: [0, 0.44, -0.12] });
    // 架上的步枪（两支，第三格空着——那支在你手里）
    for (const x of [-0.3, 0]) k.at([x, 0.47, -0.13], [0, 0, 0], () => {
      k.box('metal', 0.045, 0.62, 0.05, { color: C.dark, p: [0, 0.42, 0] }); k.box('metal', 0.03, 0.3, 0.03, { color: C.dark, p: [0, 0.88, 0.005] });
      k.box('paint', 0.05, 0.24, 0.07, { color: C.rubber, p: [0, 0.1, 0.01] }); k.box('metal', 0.035, 0.14, 0.05, { color: C.dark, p: [0, 0.36, 0.05], r: [0.25, 0, 0] });
    });
    // 上层：弹药箱、手电
    for (const [x, w] of [[-0.3, 0.3], [0.08, 0.26], [0.32, 0.16]]) k.box('paint', w, 0.16, 0.22, { color: 0x4a5236, region: 'paint', p: [x, 1.59, -0.08] });
    k.cyl('metal', 0.02, 0.02, 0.2, 8, { color: C.dark, p: [0.33, 1.7, -0.05], r: [0, 0, Math.PI / 2] });
    // 门上方的铭牌、顶上的电子锁盒
    k.plane('paint', 0.62, 0.155, { region: 'lockerSign', label: true, color: C.cream, p: [0, 1.73, 0.262] });
  });
  return meshes(g, geos);
}
/** 武器柜的两扇门：关着（cutHide）、敞开（cutShow）。两扇门、电子锁、门上的字合成一份几何体（每个状态两三次绘制） */
function lockerLeaf(k, side, open) {
  // 合页在柜子两侧（x = ±0.5），门扇往柜子中间伸；开着时往外转 110°
  k.at([side * 0.5, 0.99, 0.262], [0, open ? side * -1.9 : 0, 0], () => {
    const x = (v) => -side * v, o = { color: C.greyGreen, region: 'paint' };
    k.box('paint', 0.5, 1.78, 0.025, { ...o, p: [x(0.25), 0, 0] });
    for (const y0 of [0.62, -0.75]) for (let i = 0; i < 6; i++) k.box('paint', 0.3, 0.012, 0.012, { color: 0x3f4a44, p: [x(0.25), y0 + i * 0.045, 0.016] }); // 冲压百叶
    k.box('metal', 0.022, 0.22, 0.03, { color: C.steel, region: 'metal', p: [x(0.46), 0, 0.03] }); // 拉手
    if (side === 1 && !open) { // 电子锁（靠门缝那一边）
      k.box('gloss', 0.07, 0.11, 0.025, { color: C.dark, p: [x(0.42), 0.25, 0.03] });
      for (let i = 0; i < 9; i++) k.box('gloss', 0.012, 0.01, 0.006, { color: 0x6a6e72, p: [x(0.42) - 0.016 + (i % 3) * 0.016, 0.27 - Math.floor(i / 3) * 0.016, 0.044] });
    }
  });
}
export function lockerDoors() {
  const make = (open) => {
    const grp = new THREE.Group();
    meshes(grp, cached(open ? 'lockerOpen' : 'lockerShut', (k) => {
      for (const side of [-1, 1]) lockerLeaf(k, side, open);
      if (!open) k.plane('paint', 0.5, 0.125, { region: 'lockerSign', label: true, color: C.cream, p: [0, 1.62, 0.292] }); // 门上横贴的模板字
    }));
    return grp;
  };
  return { closed: make(false), open: make(true) };
}

/** 配电柜（B1 合闸）：落地灰柜、上面两块表和指示灯、中间铭牌、下面一个大闸刀手柄；顶上一截桥架通到天花 */
export function buildSwitchCabinet(g) {
  const geos = cached('switch', (k) => {
    const o = { color: C.grey, region: 'paint' };
    k.box('paint', 0.82, 1.72, 0.45, { ...o, p: [0, 0.96, 0] });
    k.box('paint', 0.84, 0.1, 0.47, { color: C.dark, p: [0, 0.05, 0] }); // 底座槽钢
    k.box('paint', 0.86, 0.05, 0.5, { ...o, p: [0, 1.845, 0] }); // 顶盖
    k.box('metal', 0.3, 1.2, 0.12, { color: C.galv, region: 'metal', p: [0, 2.47, -0.12] }); // 往上走的桥架
    k.box('paint', 0.78, 0.008, 0.008, { color: 0x6e7272, p: [0, 1.22, 0.226] }); // 上下两扇门的缝
    k.box('paint', 0.008, 0.66, 0.008, { color: 0x6e7272, p: [0.36, 1.55, 0.226] });
    // 上门：两块表（表盘用压力表那块图）、三个指示灯座
    for (const x of [-0.18, 0.06]) { k.box('gloss', 0.16, 0.16, 0.03, { color: C.dark, p: [x, 1.58, 0.235] }); k.plane('gloss', 0.13, 0.13, { region: 'gauge', label: true, color: C.white, p: [x, 1.58, 0.252] }); }
    for (const x of [0.22, 0.29]) k.cyl('gloss', 0.022, 0.022, 0.03, 12, { color: 0x2a2a2a, p: [x, 1.66, 0.24], r: [Math.PI / 2, 0, 0] });
    k.plane('paint', 0.36, 0.09, { region: 'plate', label: true, color: C.white, p: [-0.06, 1.37, 0.2265] });
    k.plane('paint', 0.14, 0.14, { region: 'warn', label: true, color: C.yellow, p: [0.24, 1.37, 0.2265] });
    // 下门：闸刀底座、两侧导槽、门把
    k.box('paint', 0.26, 0.42, 0.04, { color: C.dark, p: [0, 0.86, 0.245] });
    k.box('metal', 0.03, 0.12, 0.04, { color: C.steel, region: 'metal', p: [0.33, 0.95, 0.25] });
    k.plane('paint', 0.5, 0.09, { region: 'hazard', label: true, color: C.yellow, p: [0, 0.2, 0.2265] });
    // 从柜底钻进地面的电缆
    for (const x of [-0.25, -0.12]) k.cyl('gloss', 0.025, 0.025, 0.3, 8, { color: C.rubber, p: [x, 0.05, -0.1], r: [0, 0, 0] });
  });
  return meshes(g, geos);
}
/** 闸刀手柄：down = 分闸（红把手朝下），up = 合闸 */
export function switchLever(up) {
  const geos = cached('lever', (k) => { k.box('metal', 0.05, 0.3, 0.04, { color: C.steel, region: 'metal', p: [0, 0.15, 0] }); k.box('gloss', 0.22, 0.07, 0.08, { color: C.red, p: [0, 0.31, 0] }); k.cyl('metal', 0.045, 0.045, 0.2, 14, { color: C.steel, region: 'metal', p: [0, 0, 0], r: [0, 0, Math.PI / 2] }); });
  const grp = new THREE.Group(); grp.position.set(0, 0.86, 0.29); grp.rotation.x = up ? -0.55 : Math.PI + 0.55; meshes(grp, geos); return grp;
}

/** 放工具的小边桌（木面、抽屉、四条腿） */
export function buildTable(g) {
  const geos = cached('table', (k) => {
    const o = { color: C.oak, region: 'wood' };
    k.box('paint', 0.66, 0.035, 0.44, { ...o, p: [0, 0.7, 0] });
    k.box('paint', 0.6, 0.1, 0.4, { color: 0x8a5e36, region: 'wood', p: [0, 0.63, 0] });
    k.box('paint', 0.3, 0.075, 0.012, { color: 0x8f6440, region: 'wood', p: [0, 0.63, 0.205] });
    k.cyl('metal', 0.012, 0.012, 0.02, 8, { color: C.brass, p: [0, 0.63, 0.218], r: [Math.PI / 2, 0, 0] });
    for (const [x, z] of [[-0.29, -0.18], [0.29, -0.18], [-0.29, 0.18], [0.29, 0.18]]) k.box('paint', 0.04, 0.6, 0.04, { ...o, p: [x, 0.3, z] });
  });
  return meshes(g, geos);
}
/** 工具本身（摆在 item 组里；item 的原点是桌面，灭火器例外——立在地上） */
export function buildTool(item, tool) {
  const geos = cached(`tool:${tool}`, (k) => {
    if (tool === '撬棍') {
      k.at([0.02, 0.016, 0.02], [0, 0.5, 0], () => {
        k.cyl('paint', 0.013, 0.013, 0.56, 6, { color: C.red, p: [0, 0, 0], r: [0, 0, Math.PI / 2] }); // 六角棱钢，漆红
        k.cyl('metal', 0.013, 0.013, 0.08, 6, { color: C.steel, region: 'metal', p: [-0.31, 0, 0], r: [0, 0, Math.PI / 2] });
        k.torus('metal', 0.05, 0.012, 6, 12, Math.PI * 1.15, { color: C.steel, region: 'metal', p: [-0.35, 0.0, 0.05], r: [Math.PI / 2, 0, Math.PI / 2] }); // 弯钩
        k.box('metal', 0.05, 0.008, 0.026, { color: C.steel, region: 'metal', p: [-0.355, 0, 0.1], r: [0, 0.3, 0] }); // 羊角
        k.box('metal', 0.06, 0.008, 0.024, { color: C.steel, region: 'metal', p: [0.3, 0.004, 0], r: [0, 0, 0.18] }); // 扁头
      });
    } else if (tool === '保险丝') {
      k.box('gloss', 0.24, 0.05, 0.16, { color: C.orange, p: [0, 0.025, 0] }); // 盒子
      k.box('gloss', 0.22, 0.01, 0.14, { color: 0x262626, p: [0, 0.046, 0] });
      k.at([0, 0.05, -0.08], [-1.2, 0, 0], () => { k.box('gloss', 0.24, 0.012, 0.16, { color: C.orange, p: [0, 0, 0.08] }); k.plane('paint', 0.18, 0.05, { region: 'fuseLabel', label: true, color: C.cream, p: [0, 0.0065, 0.08], r: [-Math.PI / 2, 0, 0] }); });
      for (let i = 0; i < 4; i++) { const x = -0.075 + i * 0.05; k.cyl('gloss', 0.011, 0.011, 0.05, 10, { color: C.white, p: [x, 0.058, 0.01], r: [Math.PI / 2, 0, 0] }); for (const z of [-0.023, 0.043]) k.cyl('metal', 0.012, 0.012, 0.012, 10, { color: C.brass, p: [x, 0.058, z], r: [Math.PI / 2, 0, 0] }); }
      // 盒子外面散着两根
      for (const [x, z, a] of [[0.17, 0.06, 0.4], [0.2, -0.04, -0.2]]) { k.cyl('gloss', 0.011, 0.011, 0.05, 10, { color: C.white, p: [x, 0.011, z], r: [Math.PI / 2, a, 0] }); }
    } else if (tool === '灭火器') {
      // 立在地上：瓶身（旋转体）、瓶口阀门、压把、压力表、皮管和喷嘴、标签
      k.lathe('gloss', [[0, 0], [0.072, 0], [0.078, 0.012], [0.078, 0.43], [0.07, 0.47], [0.045, 0.5], [0.022, 0.51], [0, 0.512]], 18, { color: C.red });
      k.cyl('metal', 0.022, 0.026, 0.05, 10, { color: C.brass, p: [0, 0.535, 0] });
      k.box('metal', 0.05, 0.045, 0.05, { color: C.steel, region: 'metal', p: [0, 0.575, 0] });
      k.box('gloss', 0.16, 0.012, 0.03, { color: C.dark, p: [0.05, 0.62, 0], r: [0, 0, -0.18] }); // 压把
      k.box('gloss', 0.15, 0.012, 0.03, { color: C.dark, p: [0.05, 0.585, 0], r: [0, 0, 0.05] }); // 提把
      k.cyl('gloss', 0.022, 0.022, 0.012, 14, { color: C.white, p: [0, 0.578, 0.03], r: [Math.PI / 2, 0, 0] });
      k.plane('gloss', 0.036, 0.036, { region: 'gauge', label: true, color: C.white, p: [0, 0.578, 0.0365] });
      k.cyl('paint', 0.0805, 0.0805, 0.2, 18, { open: true, t0: -0.9, tl: 1.8, region: 'extLabel', label: true, color: C.cream, p: [0, 0.25, 0] });
      k.torus('gloss', 0.06, 0.009, 6, 10, Math.PI, { color: C.rubber, p: [-0.06, 0.53, 0.0], r: [0, Math.PI / 2, 0] }); // 皮管绕下来
      k.cyl('gloss', 0.009, 0.009, 0.3, 6, { color: C.rubber, p: [-0.09, 0.38, 0.0] });
      k.cyl('gloss', 0.013, 0.009, 0.06, 8, { color: C.dark, p: [-0.09, 0.21, 0.0] });
      k.cyl('metal', 0.01, 0.01, 0.06, 8, { color: C.steel, p: [-0.088, 0.47, 0], r: [0, 0, 0] }); // 瓶身上的卡子
      k.box('paint', 0.02, 0.012, 0.03, { color: 0xe2c22a, p: [0.03, 0.6, 0.02] }); // 保险销的黄封签
    } else {
      // 门禁卡：插在透明卡套里，挂一条蓝色挂绳，搭在桌上
      k.box('gloss', 0.088, 0.003, 0.058, { color: C.white, p: [0, 0.003, 0], r: [0, 0.35, 0] });
      k.plane('gloss', 0.086, 0.054, { region: 'card', label: true, color: C.blue, p: [0, 0.0048, 0], r: [-Math.PI / 2, 0, 0.35] });
      k.at([0, 0.002, 0], [0, 0.35, 0], () => {
        k.box('metal', 0.016, 0.004, 0.012, { color: C.steel, p: [0, 0.003, -0.036] });
        // 挂绳：压扁的一圈蓝色织带，平摊在桌面上
        k.torus('paint', 0.1, 0.007, 4, 28, Math.PI * 1.8, { color: C.blue, p: [-0.03, 0.003, -0.14], r: [-Math.PI / 2, 0, 1.6], s: [1, 0.6, 0.3] });
      });
    }
  });
  return meshes(item, geos, { shadow: tool !== '门禁卡' });
}

/** 分区配电箱（电梯厅换保险丝）：落地支架上的灰箱，门敞着，里面一排断路器和三个熔断器座 */
export function buildFuseBox(g) {
  const geos = cached('fusebox', (k) => {
    const o = { color: C.grey, region: 'paint' };
    for (const x of [-0.24, 0.24]) k.box('metal', 0.04, 1.0, 0.04, { color: C.galv, region: 'metal', p: [x, 0.5, -0.06] }); // 支架
    k.box('metal', 0.6, 0.03, 0.3, { color: C.galv, region: 'metal', p: [0, 0.015, -0.06] });
    k.at([0, 1.42, 0], [0, 0, 0], () => {
      k.box('paint', 0.62, 0.8, 0.02, { ...o, p: [0, 0, -0.12] });
      for (const x of [-0.3, 0.3]) k.box('paint', 0.02, 0.8, 0.24, { ...o, p: [x, 0, 0] });
      for (const y of [-0.39, 0.39]) k.box('paint', 0.62, 0.02, 0.24, { ...o, p: [0, y, 0] });
      k.plane('paint', 0.56, 0.14, { region: 'breakers', label: true, color: C.white, p: [0, 0.18, -0.105] });
      // 三个熔断器座（黑色陶瓷底座 + 铜夹）
      for (const x of [-0.14, 0, 0.14]) { k.box('gloss', 0.08, 0.16, 0.04, { color: 0x1d1d1d, p: [x, -0.12, -0.09] }); for (const y of [-0.18, -0.06]) k.box('metal', 0.03, 0.012, 0.02, { color: C.brass, p: [x, y, -0.065] }); }
      // 门：敞开 110°，门里面贴着线路图
      k.at([-0.31, 0, 0.12], [0, -1.9, 0], () => { k.box('paint', 0.62, 0.8, 0.02, { ...o, p: [0.31, 0, 0] }); k.plane('paint', 0.16, 0.16, { region: 'warn', label: true, color: C.yellow, p: [0.31, 0.2, -0.0105], r: [0, Math.PI, 0] }); });
      // 一根拖到地上的电缆
      k.cyl('gloss', 0.018, 0.018, 1.0, 8, { color: C.rubber, p: [0.22, -0.82, -0.08], r: [0, 0, 0.12] });
    });
  });
  return meshes(g, geos);
}
/** 换上的三根保险丝（cutShow） */
export function fuseInserts() {
  const geos = cached('fuseIn', (k) => { for (const x of [-0.14, 0, 0.14]) { k.cyl('gloss', 0.016, 0.016, 0.1, 10, { color: C.white, p: [x, 1.3, -0.07] }); for (const y of [1.25, 1.35]) k.cyl('metal', 0.018, 0.018, 0.02, 10, { color: C.brass, p: [x, y, -0.07] }); } });
  const grp = new THREE.Group(); meshes(grp, geos); return grp;
}

/** 信号弹：一个打开的橙色硬壳箱，里面两支红色信号弹，第三支拿出来斜放着 */
export function buildFlareKit(g) {
  const geos = cached('flare', (k) => {
    k.box('gloss', 0.46, 0.12, 0.3, { color: C.orange, p: [0, 0.06, 0] });
    k.box('gloss', 0.42, 0.02, 0.26, { color: 0x222222, p: [0, 0.112, 0] });
    k.at([0, 0.12, -0.15], [-1.9, 0, 0], () => k.box('gloss', 0.46, 0.04, 0.3, { color: C.orange, p: [0, 0.02, 0.15] }));
    for (const x of [-0.08, 0.08]) { k.cyl('paint', 0.022, 0.022, 0.34, 12, { color: C.red, p: [x, 0.13, 0.02], r: [Math.PI / 2, 0, Math.PI / 2] }); }
    k.cyl('paint', 0.0222, 0.0222, 0.16, 12, { open: true, region: 'flareLabel', label: true, color: C.red, p: [0.08, 0.13, 0.02], r: [0, 0, Math.PI / 2] });
    for (const x of [-0.08, 0.08]) k.cyl('gloss', 0.024, 0.024, 0.05, 12, { color: C.dark, p: [x + 0.17, 0.13, 0.02], r: [0, 0, Math.PI / 2] });
  });
  return meshes(g, geos);
}
/** 点着的信号弹：立着的红管、白热的头、红色火苗、一大股往上飘的红烟、地上一圈红光（cutShow） */
export function litFlare() {
  const grp = new THREE.Group(); grp.name = '点燃的信号弹';
  const geos = cached('flareLit', (k) => { k.cyl('paint', 0.022, 0.022, 0.32, 12, { color: C.red, p: [0.45, 0.16, 0.1] }); k.cyl('gloss', 0.05, 0.08, 0.04, 12, { color: C.dark, p: [0.45, 0.02, 0.1] }); });
  meshes(grp, geos, { shadow: false });
  const head = new THREE.Mesh(once('flareHead', () => new THREE.SphereGeometry(0.035, 10, 8)), once('flareHeadMat', () => new THREE.MeshBasicMaterial({ color: 0xffe2d0, toneMapped: false }))); head.position.set(0.45, 0.34, 0.1); grp.add(head);
  const flame = new THREE.Mesh(once('flareFlame', () => flameGeometry([{ x: 0.45, z: 0.1, w: 0.22, h: 0.5, turn: 0.3, seed: 0.2 }, { x: 0.45, z: 0.1, w: 0.16, h: 0.38, turn: 1.1, seed: 0.7 }], () => 0.32)),
    flameMaterial({ hot: [1, 0.85, 0.8], mid: [1, 0.18, 0.08], cool: [0.6, 0.02, 0.02], gain: 1.5 }));
  flame.frustumCulled = false; grp.add(flame);
  const smoke = new THREE.Mesh(once('flarePuffs', () => { const puffs = []; for (let i = 0; i < 14; i++) puffs.push([0.45, 0.45, 0.1, i / 14]); return puffGeometry(puffs); }), smokeMaterial({ color: [0.42, 0.1, 0.1], fire: [0.9, 0.2, 0.15], opacity: 0.38, rise: 9, grow: 3.2, drift: [1.6, 0.6], period: 7 }));
  smoke.frustumCulled = false; smoke.renderOrder = 4; grp.add(smoke);
  const glow = new THREE.Mesh(once('flareGlow', () => new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2).translate(0.45, 0.02, 0.1)), glowMaterial({ color: [1, 0.12, 0.08], center: [0.45, 0, 0.1], radius: [3, 3, 3], strength: 0.3 }));
  grp.add(glow);
  grp.userData.mats = [flame.material, smoke.material, glow.material];
  return grp;
}

// ---------- 关卡大件（摆在梯段口，本地 +z 朝上楼） ----------
/** 杂物：倒下的大衣柜斜卡在梯段上、床垫、两把椅子、纸箱、木板、床头柜、水桶。全在一个组里（撬开时整堆推到一边） */
export function buildDebris(junk) {
  const geos = cached('debris', (k) => {
    const ang = Math.atan(STAIR.slope);
    // 大衣柜：背朝下躺在踏步上，柜顶朝楼上，略斜着卡住
    k.at([0.05, 0.88, 0.29], [-ang, 0.14, 0.07], () => {
      k.box('paint', 0.92, 0.52, 1.9, { color: C.walnut, region: 'woodDark' });
      for (const x of [-0.23, 0.23]) k.box('paint', 0.44, 0.02, 1.8, { color: 0x6a4630, region: 'woodDark', p: [x, 0.27, 0] });
      for (const x of [-0.03, 0.03]) k.box('metal', 0.015, 0.03, 0.18, { color: C.brass, p: [x, 0.29, 0.1] });
      k.box('paint', 0.96, 0.06, 0.06, { color: C.walnut, region: 'woodDark', p: [0, 0.05, 0.97] }); // 顶线
    });
    // 床垫：斜靠在衣柜上半截，往下塌
    k.at([-0.18, 1.18, 0.62], [-1.0, -0.3, 0.25], () => { k.box('paint', 0.86, 1.2, 0.17, { color: C.ticking, region: 'mattress' }); k.box('paint', 0.86, 0.6, 0.16, { color: C.ticking, region: 'mattress', p: [0, 0.82, -0.16], r: [-0.55, 0, 0] }); });
    // 一把椅子翻过来压在衣柜上，一把侧倒在梯段口
    k.at([0.32, 1.42, 0.35], [Math.PI - 0.2, 0.6, 0.15], () => chair(k));
    k.at([-0.3, 0.3, -0.5], [-0.5, Math.PI / 2 + 0.15, Math.PI / 2], () => chair(k, { color: C.pine })); // 侧倒，椅背朝楼上
    // 纸箱
    carton(k, 0.5, 0.36, 0.4, { p: [0.36, 0.2, -0.45], r: [0, 0.35, 0] });
    carton(k, 0.4, 0.3, 0.34, { p: [0.38, 0.53, -0.42], r: [0.05, 0.6, 0.06], flaps: false });
    carton(k, 0.36, 0.32, 0.36, { p: [-0.02, 0.18, -0.5], r: [0, -0.3, 0.1] });
    // 床头柜侧倒、两块木板斜插、一个塑料桶
    k.at([-0.38, 0.62, -0.25], [0.1, 0.4, Math.PI / 2 + 0.1], () => { k.box('paint', 0.45, 0.5, 0.4, { color: C.oak, region: 'wood' }); k.box('paint', 0.38, 0.14, 0.01, { color: 0x86603c, region: 'wood', p: [0, 0.12, 0.205] }); });
    k.box('paint', 1.5, 0.022, 0.13, { color: C.pine, region: 'wood', p: [0.05, 1.05, -0.05], r: [0.2, 0.25, 0.42] });
    k.box('paint', 1.3, 0.022, 0.11, { color: 0x8a6a44, region: 'wood', p: [-0.15, 0.8, 0.5], r: [-0.4, -0.5, -0.3] });
    k.cyl('gloss', 0.15, 0.12, 0.3, 14, { color: C.blue, open: true, p: [0.5, 0.15, -0.45], r: [0.3, 0, 1.4] });
  });
  return meshes(junk, geos);
}
/** 着火：烧剩的家具骨架（灭了以后还留着）、熏黑的地面和踏步（一直在）、干粉（灭了以后才有） */
export function buildFireStatic(g) {
  const geos = cached('fireStatic', (k) => {
    const o = { color: C.char, region: 'charred' };
    k.at([0.12, 0.35, -0.15], [0.3, 0.7, Math.PI / 2 + 0.2], () => { for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17]]) k.box('paint', 0.03, 0.42, 0.03, { ...o, p: [x, 0.21, z] }); k.box('paint', 0.42, 0.03, 0.36, { ...o, p: [0, 0.44, 0] }); });
    k.box('paint', 1.1, 0.06, 0.12, { ...o, p: [-0.05, 0.42, 0.1], r: [-0.3, 0.3, 0.12] });
    k.box('paint', 0.9, 0.05, 0.1, { ...o, p: [0.1, 0.2, -0.3], r: [0.25, -0.5, 0.05] });
    k.box('paint', 0.42, 0.22, 0.35, { ...o, p: [-0.35, 0.3, -0.35], r: [0.3, 0.4, 0.15] });
    k.box('paint', 0.36, 0.08, 0.4, { color: 0x1a1817, region: 'charred', p: [0.38, 0.5, 0.25], r: [-0.45, 0.2, 0.2] });
    if (k.useAtlas) stairSheet(k, 'decal', 1.5, -2.1, 1.9, { region: 'scorch', color: C.black }); // 省内存档没有图集：贴花会变成一块黑方片，不要
  });
  return meshes(g, geos, { shadow: false });
}
export function powderSheet() {
  const geos = cached('powder', (k) => { if (k.useAtlas) stairSheet(k, 'decal', 1.4, -1.9, 1.3, { region: 'powder', color: C.white }, 0.02); });
  const grp = new THREE.Group(); grp.name = '干粉'; meshes(grp, geos, { shadow: false }); return grp;
}
/** 火本身（junk 组里：灭火时缩没）：火苗、火星、烟、火光。返回要推进时间、淡出的材质 */
export function buildFire(junk) {
  const flames = new THREE.Mesh(once('flames', () => flameGeometry(flameLayout(7))), flameMaterial()); flames.name = 'flames'; flames.frustumCulled = false; flames.renderOrder = 3; junk.add(flames);
  const r = rnd(11), embers = new THREE.Points(once('embers', () => emberGeometry(46, r)), emberMaterial()); embers.name = 'embers'; embers.frustumCulled = false; embers.renderOrder = 4; junk.add(embers);
  const smoke = new THREE.Mesh(once('smoke', () => { const q = rnd(23), puffs = []; for (let i = 0; i < 7; i++) { const z = -0.2 + q() * 0.8; puffs.push([(q() - 0.5) * 0.8, nosingY(z) + 0.9, z, i / 7]); } return puffGeometry(puffs); }), smokeMaterial()); smoke.name = 'smoke'; smoke.frustumCulled = false; smoke.renderOrder = 2; junk.add(smoke);
  const glow = new THREE.Mesh(once('fireGlow', () => rawSheet(2.8, -3.0, 2.6)), glowMaterial({ center: [0, nosingY(0.1) + 0.1, 0.1], radius: [1.35, 2.0, 2.9], strength: 0.42 })); glow.name = 'fire-glow'; glow.renderOrder = 1; junk.add(glow);
  return [flames.material, embers.material, smoke.material, glow.material];
}
/** 卷帘栅门（配电箱跳闸，断电落下）：两侧导轨、顶上卷筒箱（不动），帘片（junk 组：从卷筒箱往下挂，合闸后收上去） */
export const SHUTTER = Object.freeze({ top: 2.62, bottom: nosingY(0) + 0.01, half: 0.66 });
export function buildShutterFrame(g) {
  const geos = cached('shutterFrame', (k) => {
    const S = SHUTTER, o = { color: C.galv, region: 'metal' };
    for (const x of [-S.half - 0.03, S.half + 0.03]) k.box('metal', 0.06, S.top - S.bottom + 0.05, 0.1, { ...o, p: [x, (S.top + S.bottom) / 2, 0] });
    k.box('metal', S.half * 2 + 0.2, 0.34, 0.36, { ...o, p: [0, S.top + 0.17, 0.02] });
    k.box('paint', 0.2, 0.16, 0.18, { color: C.dark, p: [S.half - 0.05, S.top + 0.08, -0.25] }); // 电机
    k.plane('paint', 0.3, 0.15, { region: 'shutterSign', label: true, color: C.white, p: [0, S.top + 0.17, -0.161], r: [0, Math.PI, 0] });
  });
  return meshes(g, geos);
}
export function buildShutterCurtain(junk) {
  const geos = cached('shutterCurtain', (k) => {
    const S = SHUTTER, h = S.top - S.bottom, o = { color: C.galv, region: 'metal' };
    const n = 12; for (let i = 0; i < n; i++) k.cyl('metal', 0.011, 0.011, h, 6, { ...o, p: [-S.half + 0.05 + i * (S.half * 2 - 0.1) / (n - 1), -h / 2, 0] });
    for (let y = 0.25; y < h; y += 0.32) k.box('metal', S.half * 2, 0.035, 0.012, { ...o, p: [0, -y, 0.012] });
    k.box('metal', S.half * 2, 0.06, 0.05, { color: 0x6d7173, region: 'metal', p: [0, -h + 0.03, 0] }); // 底梁
    k.plane('paint', 0.4, 0.05, { region: 'hazard', label: true, color: C.yellow, p: [0, -h + 0.03, -0.0255], r: [0, Math.PI, 0] });
  });
  return meshes(junk, geos);
}
/** 防火门：门框、门槛、读卡器（不动）；门扇（junk 组里的合页轴：刷卡后朝人这边转开） */
export const DOOR = Object.freeze({ half: 0.64, bottom: nosingY(0.02), height: 2.05, leaf: 0.86, z: 0 });
export function buildDoorFrame(g) {
  const geos = cached('doorFrame', (k) => {
    const D = DOOR, top = D.bottom + D.height, o = { color: 0x5a2620, region: 'paint' };
    for (const x of [-D.half - 0.04, D.half + 0.04]) k.box('paint', 0.08, top + 0.02, 0.14, { ...o, p: [x, (top + 0.02) / 2, D.z] });
    k.box('paint', D.half * 2 + 0.16, 0.1, 0.14, { ...o, p: [0, top + 0.05, D.z] });
    k.box('paint', D.half * 2 + 0.16, D.bottom, 0.16, { color: 0x6c6a64, region: 'paint', p: [0, D.bottom / 2, D.z] }); // 门槛下面那截墩子
    k.box('metal', D.half * 2, 0.012, 0.18, { color: C.steel, region: 'metal', p: [0, D.bottom + 0.006, D.z] });
    // 子母门的小扇（不动）
    k.box('paint', D.half * 2 - D.leaf - 0.01, D.height - 0.01, 0.05, { color: C.door, region: 'door', p: [D.half - (D.half * 2 - D.leaf) / 2, D.bottom + D.height / 2, D.z] });
    // 读卡器：挂在门框外侧的墙柱上
    k.box('gloss', 0.085, 0.13, 0.03, { color: C.dark, p: [D.half + 0.04, D.bottom + 1.32, D.z - 0.085] });
    k.plane('gloss', 0.075, 0.12, { region: 'reader', label: true, color: C.dark, p: [D.half + 0.04, D.bottom + 1.32, D.z - 0.1005], r: [0, Math.PI, 0] });
    k.box('paint', 0.02, 0.5, 0.02, { color: C.dark, p: [D.half + 0.04, D.bottom + 1.65, D.z - 0.08] }); // 线管
  });
  return meshes(g, geos);
}
export function buildDoorLeaf(pivot) {
  const geos = cached('doorLeaf', (k) => {
    const D = DOOR, w = D.leaf, cy = D.bottom + D.height / 2, f = -0.03; // f：朝人这一面（-z）
    k.box('paint', w, D.height - 0.01, 0.05, { color: C.door, region: 'door', p: [w / 2, cy, 0] });
    // 观察窗（夹丝玻璃）+ 压条
    k.box('gloss', 0.2, 0.55, 0.052, { color: 0x1a2226, p: [w / 2, D.bottom + 1.55, 0] });
    k.box('metal', 0.24, 0.02, 0.06, { color: 0x3a3a3a, p: [w / 2, D.bottom + 1.835, 0] }); k.box('metal', 0.24, 0.02, 0.06, { color: 0x3a3a3a, p: [w / 2, D.bottom + 1.265, 0] });
    // 推杠：两头的底座 + 横杠
    for (const x of [0.1, w - 0.08]) k.box('metal', 0.07, 0.1, 0.07, { color: C.steel, region: 'metal', p: [x, D.bottom + 1.0, f - 0.04] });
    k.box('metal', w - 0.16, 0.035, 0.045, { color: 0xc4c6c8, region: 'metal', p: [w / 2 + 0.01, D.bottom + 1.0, f - 0.065] });
    // 闭门器、踢脚不锈钢板、门上的标签
    k.box('metal', 0.32, 0.06, 0.06, { color: 0x9a9c9e, region: 'metal', p: [w * 0.55, D.bottom + D.height - 0.08, f - 0.02] });
    k.box('metal', 0.26, 0.02, 0.02, { color: 0x6a6c6e, p: [w * 0.55 + 0.12, D.bottom + D.height - 0.03, f - 0.06], r: [0, 0.4, 0] });
    k.box('metal', w - 0.04, 0.2, 0.004, { color: 0xb8babc, region: 'metal', p: [w / 2, D.bottom + 0.11, f + 0.003] });
    k.plane('paint', 0.36, 0.09, { region: 'doorSign', label: true, color: 0x0f7a43, p: [w / 2, D.bottom + 1.2, f + 0.004], r: [0, Math.PI, 0] });
  });
  return meshes(pivot, geos);
}
