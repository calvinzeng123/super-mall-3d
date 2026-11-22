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
  paint: [256, 640, 256, 128], stencil: [512, 640, 256, 128], metal: [0, 768, 256, 256], scorch: [256, 768, 256, 256], powder: [512, 768, 256, 256], charred: [768, 768, 256, 256],
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
  // 贴花那几块（熏黑、干粉）先挖空：没画好之前不能是一块不透明的方片（贴在地上就是个黑长方形）
  for (const k of ['scorch', 'powder']) { const r = ATLAS[k]; g.clearRect(r[0] * size / 1024, r[1] * size / 1024, r[2] * size / 1024, r[3] * size / 1024); }
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
    // 绗缝床垫面：米白底、斜格子的绗缝线、每个交点一个凹进去的扣（tuft），四周一圈包边；几块黄褐色的旧水渍。
    // 这块图横向是床垫的宽（0.9 米）、纵向是长（1.9 米）：纵向的格子密一倍，铺上去格子才是方的
    g.fillStyle = '#efece4'; g.fillRect(0, 0, w, h);
    const dx = 46, dy = 22;
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(70,72,86,0.32)';
    for (let i = -h; i < w + h; i += dx) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h * dx / dy / 2, h); g.stroke(); g.beginPath(); g.moveTo(i, 0); g.lineTo(i - h * dx / dy / 2, h); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; for (let i = -h; i < w + h; i += dx) { g.beginPath(); g.moveTo(i + 2, 0); g.lineTo(i + 2 + h * dx / dy / 2, h); g.stroke(); }
    // 扣：每格中心一个小暗点 + 一圈压出来的阴影
    for (let y = 0; y <= h + dy; y += dy) for (let x = ((y / dy) % 2) * dx / 2; x <= w + dx; x += dx) { const gr = g.createRadialGradient(x, y, 0, x, y, 7); gr.addColorStop(0, 'rgba(40,40,50,0.5)'); gr.addColorStop(1, 'rgba(40,40,50,0)'); g.fillStyle = gr; g.fillRect(x - 7, y - 7, 14, 14); }
    g.strokeStyle = 'rgba(60,70,100,0.55)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); // 包边
    for (let i = 0; i < 4; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(120,80,30,0.3)'); gr.addColorStop(0.8, 'rgba(120,80,30,0.1)'); gr.addColorStop(1, 'rgba(120,80,30,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    speck(g, w, h, r, 80, 0.08); grime(g, w, h, r, 0.5);
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
    // 印刷的卡面：整面深蓝到青的渐变、白字、金色芯片、一道白色的弧——放在桌上两三米外也认得出「一张蓝卡」
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1f4f9c'); gr.addColorStop(1, '#1b8aa6'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 5; g.beginPath(); g.arc(w * 1.05, h * 1.3, h * 1.05, Math.PI * 1.05, Math.PI * 1.5); g.stroke();
    text(g, '云澜 · 门禁卡', w * 0.5, h * 0.2, 15, '#f4f6fa'); text(g, 'RESIDENT', w * 0.7, h * 0.82, 10, 'rgba(240,245,250,0.85)', 600);
    g.fillStyle = '#d8b65a'; g.fillRect(10, h * 0.4, 22, 17); g.strokeStyle = 'rgba(90,70,20,0.7)'; g.lineWidth = 1; g.strokeRect(10, h * 0.4, 22, 17); g.beginPath(); g.moveTo(21, h * 0.4); g.lineTo(21, h * 0.4 + 17); g.moveTo(10, h * 0.4 + 8.5); g.lineTo(32, h * 0.4 + 8.5); g.stroke();
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
  fuseLabel: (g, w, h) => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h); g.fillStyle = '#c4261c'; g.fillRect(0, 0, 54, h); text(g, '熔', 27, h / 2, 34, '#fff'); text(g, '熔断器 RT18-32A × 10', w / 2 + 26, h * 0.38, 22, '#1d1d1d'); text(g, '低压熔断体 · 陶瓷管', w / 2 + 26, h * 0.76, 15, '#555', 600); },
  flareLabel: (g, w, h) => { g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h); g.fillStyle = '#c42a18'; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 10, w, 10); text(g, '应急求救信号弹', w * 0.4, h * 0.52, 22, '#1d1d1d'); text(g, '手持 · 红光', w * 0.4, h * 0.82 - 4, 11, '#c42a18', 600);
    g.fillStyle = '#f2c018'; g.beginPath(); g.moveTo(w - 30, 20); g.lineTo(w - 8, h - 14); g.lineTo(w - 52, h - 14); g.closePath(); g.fill(); text(g, '!', w - 30, h - 26, 20, '#111', 800); },
  stencil: (g, w, h, r) => {
    // 喷漆模板字（资产编号）：灰底上的字，边缘糙一点；字下面一块贴纸撕剩的残边
    g.fillStyle = '#d6d4ce'; g.fillRect(0, 0, w, h);
    text(g, '资产编号', w * 0.5, h * 0.26, 24, 'rgba(25,25,25,0.82)', 800); text(g, 'BA-1F-07', w * 0.5, h * 0.6, 40, 'rgba(25,25,25,0.85)', 800);
    speck(g, w, h, r, 260, 0.35, true, 2); g.fillStyle = 'rgba(245,242,230,0.9)'; g.fillRect(w * 0.18, h * 0.82, w * 0.36, h * 0.13); grime(g, w, h, r, 0.6);
  },
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

// ---------- 物件朝向 ----------
/**
 * 任务物件转多少（rotation.y，物件本地 +z 是正面）：free(dx, dz) 返回从交互点往 (dx, dz) 方向能走多远（米，最多 max）。
 * toward（弧度，同一个约定：方向 (sin, cos)）：人大概从哪边过来（开局点、同一层的另一个目标）——正面朝那边，但只在前面 open 米以内没有挡着的方向里挑
 * （以前不管朝哪都是 yaw 0，武器柜在大厅当中，人先看到的是一块空白的侧板 / 背板）。
 * 不给 toward：离墙近（wall 米内）就背靠最近的墙、正面朝外；四面都空就正面朝最开阔的一边。都量不出来（free 全一样）：0，不转。纯函数
 */
export function faceYaw(free, { n = 16, wall = 1.3, max = 4, toward = null, open = 1.0 } = {}) {
  const a = (i) => (i / n) * Math.PI * 2, d = [];
  for (let i = 0; i < n; i++) d.push(Math.min(max, Math.max(0, +free(Math.sin(a(i)), Math.cos(a(i))) || 0)));
  if (Number.isFinite(toward)) {
    let best = -1, gap = Infinity;
    for (let i = 0; i < n; i++) { if (d[i] < open) continue; const g = Math.abs(Math.atan2(Math.sin(a(i) - toward), Math.cos(a(i) - toward))); if (g < gap - 1e-9) { gap = g; best = i; } }
    if (best >= 0) return a(best);
  }
  let lo = 0, hi = 0;
  for (let i = 1; i < n; i++) { if (d[i] < d[lo] - 1e-6) lo = i; }
  if (d[lo] >= Math.max(...d) - 1e-6) return 0;
  if (d[lo] < wall) return a(lo) + Math.PI;
  // 最空的一边：相邻三个方向平均一下（一条窄缝不算开阔）
  const s = (i) => (d[(i + n - 1) % n] + d[i] * 2 + d[(i + 1) % n]) / 4;
  for (let i = 1; i < n; i++) if (s(i) > s(hi) + 1e-6) hi = i;
  return a(hi);
}

// ---------- 目标光柱 ----------
/**
 * 物件在 (0, 0) 那根竖线附近最高到多高（米）：从上往下打几条射线，打到的最高点。只算看得见、不透明的网格（光柱、火苗、火光这些不算）。
 * 光柱从这里往上起——以前光柱从离地 0.2 米起，正好穿过桌面、门禁卡、配电箱、信号弹箱，最该看清的东西上插着一根发光的棍子。
 */
export function propTop(g, r = 0.05) {
  g.updateMatrixWorld(true);
  const shown = (o) => { for (let p = o; p && p !== g.parent; p = p.parent) if (p.visible === false) return false; return true; };
  const list = []; g.traverse((o) => { if (o.isMesh && !o.userData.beacon && !o.material?.isShaderMaterial && !o.material?.transparent && shown(o)) list.push(o); });
  const rc = new THREE.Raycaster(); rc.far = 20;
  const base = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), hit = new THREE.Vector3();
  let top = 0;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    rc.set(base.set(dx, 12, dz).applyMatrix4(g.matrixWorld), down);
    const h = rc.intersectObjects(list, false)[0];
    if (h) top = Math.max(top, hit.copy(h.point).applyMatrix4(inv).y);
  }
  return top;
}
const BEAM = { geo: null, mats: new Map() };
/** 光柱：一张始终侧过来对着镜头的竖条（绕竖轴转，顶点着色器里做），中间一道细亮线、两边柔光，底下 0.3 米淡入、顶上淡出。不吃光照 */
export function beaconMesh(y0, y1, color = 0xffb347, width = 0.16) {
  BEAM.geo ||= new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  let mat = BEAM.mats.get(color);
  if (!mat) {
    const c = new THREE.Color(color);
    mat = new THREE.ShaderMaterial({
      name: 'siege-beacon', transparent: true, depthWrite: false, toneMapped: false, fog: false,
      uniforms: { uColor: { value: new THREE.Vector3(c.r, c.g, c.b) }, uWidth: { value: width } },
      vertexShader: /* glsl */`
        uniform float uWidth; varying vec2 vUv; varying float vLen;
        void main() { vUv = uv;
          vec4 w = modelMatrix * vec4(0.0, position.y, 0.0, 1.0);
          vec3 to = cameraPosition - w.xyz; to.y = 0.0; float l = length(to);
          vec3 side = l > 1e-4 ? vec3(to.z, 0.0, -to.x) / l : vec3(1.0, 0.0, 0.0);
          w.xyz += side * position.x * uWidth;
          vLen = length(modelMatrix[1].xyz);
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying vec2 vUv; varying float vLen;
        void main() { float x = abs(vUv.x - 0.5) * 2.0, y = vUv.y * vLen; // y：离光柱底端几米
          float core = exp(-x * x * 60.0) * 0.9 + exp(-x * x * 7.0) * 0.28;
          float a = min(1.0, core) * smoothstep(0.0, 0.3, y) * (1.0 - smoothstep(vLen - 0.45, vLen, y));
          // 普通混合、不是加色：白天亮墙前面加色的光会被冲没，普通混合两种场景下都看得见；颜色略超 1（夜里带一点泛光）
          gl_FragColor = vec4(uColor * (1.15 + 0.5 * exp(-x * x * 60.0)), a);
          #include <colorspace_fragment>
        }`,
    });
    BEAM.mats.set(color, mat);
  }
  const m = new THREE.Mesh(BEAM.geo, mat); m.name = 'beacon'; m.position.y = y0; m.scale.y = Math.max(0.1, y1 - y0);
  m.frustumCulled = false; m.renderOrder = 5; m.castShadow = false; m.userData.beacon = true;
  return m;
}

// ---------- 火、烟、火星、火光（着色器，加色混合，不要贴图） ----------
const NOISE = /* glsl */`
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v / 0.875; } // 三层就够（手机上火苗卡片叠好几层，每层都要算两遍）
`;
/** 推进一组火 / 烟材质的时间、设淡出（uFade：1 = 正常，0 = 没了）。每个物件自己一份 uniform，几处火互不影响 */
export function fireStep(list, t, fade = null) { for (const m of list) { m.uniforms.uTime.value = t % 600; if (fade != null) m.uniforms.uFade.value = typeof fade === 'function' ? fade(m) : fade; } }

/** 火苗卡片：uv.y 0 在底、1 在顶；seed 让每张卡片的噪声错开。hot：颜色（普通火是橙黄，信号弹是红）；core：最底下最烫那一截的颜色（发白的黄） */
export function flameMaterial({ hot = [1.0, 0.74, 0.34], mid = [0.92, 0.33, 0.05], cool = [0.42, 0.05, 0.01], core = [1.0, 0.93, 0.72], gain = 0.9 } = {}) {
  return new THREE.ShaderMaterial({
    name: 'siege-flame', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uHot: { value: new THREE.Vector3(...hot) }, uMid: { value: new THREE.Vector3(...mid) }, uCool: { value: new THREE.Vector3(...cool) }, uCore: { value: new THREE.Vector3(...core) }, uGain: { value: gain } },
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime; varying vec2 vUv; varying float vSeed;
      void main() { vUv = uv; vSeed = seed; vec3 p = position; float h = uv.y * uv.y;
        p.x += sin(uTime * 3.1 + seed * 6.0) * 0.05 * h; p.z += cos(uTime * 2.3 + seed * 4.0) * 0.05 * h;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uFade, uGain; uniform vec3 uHot, uMid, uCool, uCore; varying vec2 vUv; varying float vSeed;
      ${NOISE}
      void main() {
        float y = vUv.y / mix(0.3, 1.0, uFade); // 灭的时候火苗是往下缩回去的（不是原地变透明）
        float n = fbm(vec2(vUv.x * 3.0 + vSeed * 7.0, y * 2.2 - uTime * 2.6 + vSeed * 3.0));
        float n2 = fbm(vec2(vUv.x * 6.0 - vSeed * 3.0, y * 4.5 - uTime * 4.2));
        // 底下胖、往上收成几条火舌：底部宽到卡片的九成，中段以上很快收窄
        float w = mix(0.46, 0.04, pow(y, 0.6));
        float x = abs(vUv.x - 0.5 + (n - 0.5) * 0.45 * y);
        float body = smoothstep(w, w * 0.2, x);
        // 边缘用噪声啃出缺口（不是一条光滑的轮廓线）；卡片左右两条竖边一定收到 0（以前火苗一飘，卡片的直边就露出来）
        body *= smoothstep(0.15, 0.45, n2 + (1.0 - x / max(w, 1e-3)) * 0.55);
        body *= smoothstep(0.0, 0.14, min(vUv.x, 1.0 - vUv.x));
        // 底下 0.2 慢慢长出来：卡片底边埋在踏步里，踏步口那条线上要是正好最亮，火苗就像被一刀切齐
        float shape = body * smoothstep(1.0, 0.3, y + (n2 - 0.5) * 0.6) * smoothstep(0.02, 0.2, y + (n - 0.5) * 0.08);
        float heat = clamp(shape * (1.5 - y * 1.2) + (n - 0.5) * 0.35, 0.0, 1.0);
        vec3 col = mix(uCool, uMid, smoothstep(0.08, 0.5, heat));
        col = mix(col, uHot, smoothstep(0.6, 0.92, heat));
        // 最底下那一截（燃料上方几厘米）最烫，发白的黄：火有了「根」，不是飘在空中的一团橙色
        col = mix(col, uCore, smoothstep(0.85, 1.0, heat) * (1.0 - smoothstep(0.08, 0.38, y)));
        float a = shape * uFade * smoothstep(0.02, 0.2, heat) * 0.85; // 几张卡片叠在一起是加色：单张收一点，叠出来才不会一片白
        gl_FragColor = vec4(col * uGain, a);
        #include <colorspace_fragment>
      }`,
  });
}
/**
 * 一组烟团（每团一张朝着镜头的卡片）：center 属性是团的起点，seed 错开；color 烟本身的颜色，fire 刚冒出来时被火映的颜色。
 * 烟不吃场景光照（透明卡片算光照太贵），亮度自己算：uLit 火从下面映上来的暖光（底下亮、随火苗闪），uTorch 手电（屏幕正中那一团照亮），
 * uDay 有灯的时候（白天 / 没停电）烟是灰的，不是黑的。
 */
export function smokeMaterial({ color = [0.09, 0.085, 0.08], fire = [0.5, 0.2, 0.05], opacity = 0.3, rise = 1.6, grow = 1.6, drift = [0.15, 0.05], period = 4, base = 0.35, lit = 0 } = {}) {
  return new THREE.ShaderMaterial({
    name: 'siege-smoke', transparent: true, depthWrite: false, toneMapped: true, fog: false,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Vector3(...color) }, uFire: { value: new THREE.Vector3(...fire) }, uOpacity: { value: opacity }, uRise: { value: rise }, uGrow: { value: grow }, uDrift: { value: new THREE.Vector2(...drift) }, uPeriod: { value: period }, uBase: { value: base },
      uLit: { value: lit }, uTorch: { value: 0 }, uDay: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 center; attribute float seed; uniform float uTime, uRise, uGrow, uPeriod, uBase; uniform vec2 uDrift; varying vec2 vUv; varying float vLife; varying float vSeed; varying float vTorch;
      void main() { vUv = uv; vSeed = seed;
        float life = fract(uTime / uPeriod + seed); vLife = life;
        vec3 c = center + vec3(uDrift.x * life + sin(seed * 31.0 + uTime * 0.7) * 0.08, uRise * life, uDrift.y * life);
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        float size = (uBase + uGrow * life) * (0.8 + fract(seed * 7.3) * 0.4);
        // 手电（跟着镜头、朝正前方）：烟团离视线中心越近、越近处，被照得越亮
        float d = length(mv.xyz); vTorch = smoothstep(0.86, 0.99, -mv.z / max(d, 1e-3)) * 1.1 / max(1.0, d * 0.6);
        mv.xy += (uv - 0.5) * size;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uFade, uOpacity, uLit, uTorch, uDay; uniform vec3 uColor, uFire; varying vec2 vUv; varying float vLife; varying float vSeed; varying float vTorch;
      ${NOISE}
      void main() {
        vec2 q = vUv - 0.5; float r = length(q) * 2.0;
        float n = fbm(q * 3.0 + vec2(vSeed * 13.0, -uTime * 0.25));
        float puff = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.7);
        float a = puff * sin(3.14159 * vLife) * uOpacity * uFade;
        vec3 col = mix(uFire, uColor, smoothstep(0.0, 0.45, vLife)) * (0.8 + n * 0.4);
        float flick = 0.8 + 0.12 * sin(uTime * 11.0 + vSeed * 5.0) + 0.08 * sin(uTime * 23.0);
        col += uFire * uLit * flick * smoothstep(0.75, 0.0, vUv.y) * (0.6 + n * 0.6); // 下半边被火映红
        col = mix(col, vec3(0.3, 0.29, 0.28) * (0.75 + n * 0.5), uDay * 0.85);
        col += vec3(0.4, 0.41, 0.43) * vTorch * uTorch * (0.7 + n * 0.5); // 烟本身很暗：手电只照出一点灰，不是一团白
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
    out.push({ x, z, w: 0.42 + rng() * 0.3, h: 0.55 + mid * 0.6 + rng() * 0.15, turn: (rng() - 0.5) * 0.5, seed: rng() });
  }
  return out;
}
function flameGeometry(list, base = nosingY) {
  const pos = [], uv = [], seed = [], idx = [];
  // 每朵火两张卡片，都大致横着（沿梯段宽度方向）、左右各偏 0.45 弧度交叉：
  // 卡片要是顺着梯段方向摆，会斜穿好几级踏步，火苗底下就被踏步切出一道道水平的硬边；横着摆，底边只落在一两级上（再往下埋一点）
  for (const f of list) for (const k of [0, 1]) {
    const a = f.turn + (k ? 0.45 : -0.45), cx = Math.cos(a) * f.w / 2, cz = Math.sin(a) * f.w / 2, y0 = base(f.z - Math.abs(cz)) - 0.05, s = f.seed + k * 0.37, o = pos.length / 3;
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
const C = Object.freeze({ oak: 0x9a6a3e, walnut: 0x5a3a24, pine: 0xb48a58, kraft: 0xa98457, ticking: 0x9d9584, steel: 0x8a8f94, galv: 0xa6aaad, dark: 0x1c1d1f, rubber: 0x121212,
  red: 0xa8201a, door: 0x7a2e24, grey: 0xb9bcbc, greyGreen: 0x5f6e66, cream: 0xd9d3c4, black: 0x0d0d0e, char: 0x221e1c, blue: 0x2f5f9e, orange: 0xd9621e, yellow: 0xd9a21f, brass: 0xb08a3a, white: 0xeeeeea });
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
    // 背面（柜子摆在大厅里，背面也会被看到）：两道固定到墙上的角钢支架和螺栓、两侧一排铆钉、喷漆的资产编号、电子锁的进线（线卡、一根电缆走到地面的线盒）
    const back = -0.252;
    // 两侧板：上下各一组冲压百叶（侧面看过来不再是一整块平板）
    for (const x of [-0.522, 0.522]) for (const y0 of [1.52, 0.3]) for (let i = 0; i < 5; i++) k.box('paint', 0.008, 0.012, 0.26, { color: 0x3f4a44, p: [x, y0 + i * 0.04, 0.02] });
    for (const y of [0.42, 1.62]) { k.box('metal', 0.96, 0.05, 0.025, { color: 0x6c7470, region: 'metal', p: [0, y, back - 0.012] }); for (const x of [-0.36, 0.36]) k.cyl('metal', 0.014, 0.014, 0.02, 6, { color: C.steel, p: [x, y, back - 0.03], r: [Math.PI / 2, 0, 0] }); }
    for (const x of [-0.49, 0.49]) for (let y = 0.18; y < 1.9; y += 0.21) k.box('paint', 0.012, 0.012, 0.008, { color: 0x4c5852, p: [x, y, back - 0.004] });
    k.plane('paint', 0.4, 0.2, { region: 'stencil', label: true, color: C.cream, p: [0.08, 1.08, back - 0.002], r: [0, Math.PI, 0] });
    k.box('paint', 0.06, 0.05, 0.04, { color: C.dark, p: [-0.3, 1.86, back - 0.02] }); // 线卡
    k.cyl('gloss', 0.011, 0.011, 1.8, 6, { color: C.rubber, p: [-0.3, 0.95, back - 0.03] });
    k.box('paint', 0.12, 0.08, 0.06, { color: 0x8a8d8f, region: 'metal', p: [-0.3, 0.04, back - 0.04] }); // 地面线盒
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
    // 往上走的电缆桥架：镀锌槽（漆面材质画浅灰——停电时金属材质只反射漆黑的环境，看着是一根黑柱子），里面一束黑电缆，每 0.4 米一道托架
    k.box('paint', 0.3, 1.2, 0.012, { color: 0xb4b8ba, region: 'metal', p: [0, 2.47, -0.18] });
    for (const x of [-0.15, 0.15]) k.box('paint', 0.012, 1.2, 0.1, { color: 0xa9adb0, region: 'metal', p: [x, 2.47, -0.13] });
    for (const [x, r] of [[-0.09, 0.026], [-0.03, 0.03], [0.035, 0.024], [0.09, 0.028]]) k.cyl('gloss', r, r, 1.2, 8, { color: C.rubber, p: [x, 2.47, -0.145] });
    for (let y = 2.0; y < 3.05; y += 0.4) k.box('paint', 0.36, 0.03, 0.03, { color: 0x8e9294, region: 'metal', p: [0, y, -0.075] });
    k.box('paint', 0.78, 0.008, 0.008, { color: 0x6e7272, p: [0, 1.22, 0.226] }); // 上下两扇门的缝
    k.box('paint', 0.008, 0.66, 0.008, { color: 0x6e7272, p: [0.36, 1.55, 0.226] });
    // 上门：两块表（表盘用压力表那块图）、三个指示灯座
    for (const x of [-0.18, 0.06]) { k.box('gloss', 0.16, 0.16, 0.03, { color: C.dark, p: [x, 1.58, 0.235] }); k.plane('gloss', 0.13, 0.13, { region: 'gauge', label: true, color: C.white, p: [x, 1.58, 0.252] }); }
    for (const x of [0.22, 0.29]) k.cyl('gloss', 0.022, 0.022, 0.03, 12, { color: 0x2a2a2a, p: [x, 1.66, 0.24], r: [Math.PI / 2, 0, 0] });
    k.plane('paint', 0.36, 0.09, { region: 'plate', label: true, color: C.white, p: [-0.06, 1.37, 0.2265] });
    k.plane('paint', 0.14, 0.14, { region: 'warn', label: true, color: C.yellow, p: [0.24, 1.37, 0.2265] });
    // 下门：闸刀底座、两侧导槽、门把
    k.box('paint', 0.26, 0.42, 0.04, { color: C.dark, p: [0, 0.86, 0.245] });
    for (const x of [-0.065, 0.065]) k.box('metal', 0.02, 0.09, 0.06, { color: 0x9a9ea2, region: 'metal', p: [x, 0.86, 0.28] }); // 转轴两边的夹板
    k.box('paint', 0.06, 0.02, 0.004, { color: 0x2f8a3a, p: [0, 1.04, 0.267] }); k.box('paint', 0.06, 0.02, 0.004, { color: C.red, p: [0, 0.68, 0.267] }); // 合（绿）/ 分（红）标
    k.box('metal', 0.03, 0.12, 0.04, { color: C.steel, region: 'metal', p: [0.33, 0.95, 0.25] });
    k.plane('paint', 0.5, 0.09, { region: 'hazard', label: true, color: C.yellow, p: [0, 0.2, 0.2265] });
    // 从柜底钻进地面的电缆
    for (const x of [-0.25, -0.12]) k.cyl('gloss', 0.025, 0.025, 0.3, 8, { color: C.rubber, p: [x, 0.05, -0.1], r: [0, 0, 0] });
  });
  return meshes(g, geos);
}
/** 闸刀手柄：down = 分闸（红把手朝下），up = 合闸。一根扁钢臂从转轴上伸出来，端头一根横着的红色胶套握把；转轴两侧有夹板和一个亮的铜轴头。
 * 以前拉杆转的方向反了，整根扎进柜门里，只剩一块黑底板 */
export function switchLever(up) {
  const geos = cached('lever', (k) => {
    k.box('gloss', 0.05, 0.27, 0.018, { color: 0x9a9ea2, region: 'metal', p: [0, 0.15, 0] }); // 臂（镀锌扁钢：画成亮面，停电时金属只映出漆黑的环境）
    k.cyl('gloss', 0.027, 0.027, 0.17, 12, { color: C.red, p: [0, 0.3, 0], r: [0, 0, Math.PI / 2] }); // 握把
    for (const x of [-0.09, 0.09]) k.cyl('metal', 0.03, 0.03, 0.012, 12, { color: C.dark, p: [x, 0.3, 0], r: [0, 0, Math.PI / 2] });
    k.cyl('metal', 0.034, 0.034, 0.1, 14, { color: C.brass, region: 'metal', p: [0, 0, 0], r: [0, 0, Math.PI / 2] }); // 转轴（铜）
  });
  const grp = new THREE.Group(); grp.position.set(0, 0.86, 0.3); grp.rotation.x = up ? 0.6 : Math.PI - 0.6; meshes(grp, geos); return grp;
}

/** 放工具的小边桌（木面、抽屉、四条腿） */
export function buildTable(g) {
  const geos = cached('table', (k) => {
    const o = { color: C.oak, region: 'wood' };
    k.box('paint', 0.66, 0.035, 0.44, { ...o, p: [0, 0.7, 0] });
    k.box('paint', 0.6, 0.1, 0.4, { color: 0x8a5e36, region: 'wood', p: [0, 0.63, 0] });
    k.box('paint', 0.3, 0.075, 0.012, { color: 0x8f6440, region: 'wood', p: [0, 0.63, 0.205] });
    k.cyl('paint', 0.012, 0.012, 0.02, 8, { color: C.brass, p: [0, 0.63, 0.218], r: [Math.PI / 2, 0, 0] }); // 抽屉拉手（漆面材质画铜色：桌子整张只要一次绘制）
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
      // 一盒熔断器：白纸盒、正面和翻开的盒盖上都有红白标签，盒里一排五根陶瓷管熔断体（两头铜帽），盒外散着两根
      const box = { color: 0xe9e6de, region: 'cardboard' };
      k.box('paint', 0.26, 0.07, 0.17, { ...box, p: [0, 0.035, 0] });
      k.box('paint', 0.24, 0.004, 0.15, { color: 0x6a5a48, p: [0, 0.071, 0] }); // 盒里的底（暗一点：熔断体白，靠这个衬出来）
      k.plane('paint', 0.22, 0.055, { region: 'fuseLabel', label: true, color: C.cream, p: [0, 0.035, 0.0855] });
      k.at([0, 0.07, -0.085], [-1.15, 0, 0], () => { k.box('paint', 0.26, 0.005, 0.17, { ...box, p: [0, 0, 0.085] }); k.plane('paint', 0.22, 0.055, { region: 'fuseLabel', label: true, color: C.cream, p: [0, 0.0035, 0.085], r: [-Math.PI / 2, 0, 0] }); });
      for (let i = 0; i < 5; i++) { const x = -0.092 + i * 0.046; k.cyl('gloss', 0.013, 0.013, 0.07, 10, { color: C.white, p: [x, 0.083, 0.005], r: [Math.PI / 2, 0, 0] }); for (const z of [-0.035, 0.045]) k.cyl('metal', 0.0145, 0.0145, 0.014, 10, { color: C.brass, p: [x, 0.083, z], r: [Math.PI / 2, 0, 0] }); }
      for (const [x, z, a] of [[0.2, 0.08, 0.4], [0.23, -0.03, -0.2]]) { k.cyl('gloss', 0.013, 0.013, 0.07, 10, { color: C.white, p: [x, 0.013, z], r: [Math.PI / 2, a, 0] }); }
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
      // 门禁卡：夹在一块写字板上（深色板、白纸、金属夹——卡本身只有名片大，放在白纸上才认得出来），卡面印刷朝上，一条红挂绳从板边垂到桌上
      k.at([0, 0, 0], [0, 0.25, 0], () => {
        k.box('paint', 0.23, 0.006, 0.31, { color: 0x3b2e24, region: 'wood', p: [0, 0.003, 0] });
        k.box('paint', 0.205, 0.002, 0.27, { color: 0xf0eee6, region: 'paint', p: [0, 0.007, 0.01] });
        for (let i = 0; i < 7; i++) k.box('paint', 0.15 - (i % 3) * 0.03, 0.0005, 0.006, { color: 0x6a6c72, p: [-0.02 + (i % 3) * 0.015, 0.0082, 0.04 + i * 0.022] }); // 纸上几行字
        k.box('metal', 0.09, 0.012, 0.035, { color: C.steel, region: 'metal', p: [0, 0.012, -0.135] }); // 板夹
        k.at([0.01, 0.009, -0.04], [0, -0.3, 0], () => {
          k.box('gloss', 0.098, 0.002, 0.062, { color: C.white, p: [0, 0.001, 0] });
          k.plane('gloss', 0.096, 0.06, { region: 'card', label: true, color: C.blue, p: [0, 0.0022, 0], r: [-Math.PI / 2, 0, 0] });
          k.box('metal', 0.016, 0.004, 0.012, { color: C.steel, p: [-0.055, 0.002, 0] });
        });
        k.torus('paint', 0.1, 0.007, 4, 28, Math.PI * 1.6, { color: 0xb3261e, p: [-0.17, 0.003, 0.02], r: [-Math.PI / 2, 0, 1.2], s: [1, 0.6, 0.3] });
      });
    }
  });
  return meshes(item, geos, { shadow: tool !== '门禁卡' });
}

/** 工具底下一小片暖光（加色、不吃光照）：像是头顶那道光柱落下来的光，两三米外一眼看出「桌上那件东西」。材质全局一份（不动、不闪） */
export function pickGlow(size = 0.55) {
  const geo = once(`pickGlow:${size}`, () => new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2));
  const mat = once('pickGlowMat', () => glowMaterial({ color: [1.0, 0.62, 0.22], center: [0, 0, 0], radius: [size * 0.42, 1, size * 0.42], strength: 0.16 }));
  const m = new THREE.Mesh(geo, mat); m.name = 'pick-glow'; m.position.y = 0.004; m.renderOrder = 1; return m;
}
/** 分区配电箱（电梯厅换保险丝）：落地支架上的灰箱，门敞着，里面一排断路器和三个熔断器座 */
export function buildFuseBox(g) {
  const geos = cached('fusebox', (k) => {
    const o = { color: C.grey, region: 'paint' };
    for (const x of [-0.24, 0.24]) k.box('paint', 0.04, 1.0, 0.04, { color: C.galv, region: 'metal', p: [x, 0.5, -0.06] }); // 支架（镀锌角钢；画成漆面——停电时金属材质只映出漆黑的环境）
    k.box('paint', 0.6, 0.03, 0.3, { color: C.galv, region: 'metal', p: [0, 0.015, -0.06] });
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
      // 背面（箱子立在电梯厅当中，从电梯口过来先看到的是背面）：镀锌安装板和四颗螺栓、上下两根穿线管（往上进吊顶、往下进地）、资产编号、当心触电
      k.box('paint', 0.5, 0.66, 0.01, { color: 0xa9adb0, region: 'metal', p: [0, 0, -0.137] });
      for (const [x, y] of [[-0.21, -0.28], [0.21, -0.28], [-0.21, 0.28], [0.21, 0.28]]) k.cyl('metal', 0.012, 0.012, 0.02, 6, { color: C.steel, p: [x, y, -0.145], r: [Math.PI / 2, 0, 0] });
      k.cyl('paint', 0.022, 0.022, 1.0, 8, { color: 0xc9cbc6, region: 'paint', p: [-0.16, 0.9, -0.08] });
      k.box('paint', 0.07, 0.04, 0.07, { color: 0x9a9d98, p: [-0.16, 0.41, -0.08] });
      k.plane('paint', 0.3, 0.15, { region: 'stencil', label: true, color: C.cream, p: [0.02, 0.06, -0.1435], r: [0, Math.PI, 0] });
      k.plane('paint', 0.11, 0.11, { region: 'warn', label: true, color: C.yellow, p: [0.02, -0.2, -0.1435], r: [0, Math.PI, 0] });
    });
  });
  return meshes(g, geos);
}
/** 换上的三根保险丝（cutShow） */
export function fuseInserts() {
  const geos = cached('fuseIn', (k) => { for (const x of [-0.14, 0, 0.14]) { k.cyl('gloss', 0.016, 0.016, 0.1, 10, { color: C.white, p: [x, 1.3, -0.07] }); for (const y of [1.25, 1.35]) k.cyl('metal', 0.018, 0.018, 0.02, 10, { color: C.brass, p: [x, y, -0.07] }); } });
  const grp = new THREE.Group(); meshes(grp, geos); return grp;
}

/** 信号弹：一个打开的橙色防水硬壳箱——圆角的箱体和箱盖、盖上几道加强筋、后面一根铰链轴、前面两个搭扣和一个提手、正面一张标签；
 * 里面一块黑色海绵内衬，挖了三道槽：两支红色信号弹躺在槽里，第三道空着（点着的那支在地上）。漆面带磨损（漆面图集） */
export function buildFlareKit(g) {
  const geos = cached('flare', (k) => {
    const W = 0.5, D = 0.32, H = 0.13, shell = { color: C.orange, region: 'paint' };
    k.add('gloss', softSlab(W, H, D, { r: 0.025, seg: [4, 2, 4] }), { ...shell, p: [0, H / 2, 0] });
    for (const x of [-0.18, 0.18]) k.box('gloss', 0.03, 0.012, D - 0.04, { color: 0x1c1c1c, p: [x, 0.006, 0] }); // 底下两条防滑脚
    // 海绵内衬：三道槽（槽 = 更黑的一条），两支信号弹躺在槽里
    k.box('paint', W - 0.04, 0.012, D - 0.04, { color: 0x1d1e20, region: 'charred', p: [0, H + 0.002, 0] });
    for (const z of [-0.08, 0, 0.08]) k.box('paint', W - 0.12, 0.004, 0.048, { color: 0x070708, p: [0, H + 0.009, z] });
    for (const z of [-0.08, 0]) { k.cyl('paint', 0.021, 0.021, 0.34, 12, { color: C.red, p: [0, H + 0.014, z], r: [0, 0, Math.PI / 2] }); k.cyl('gloss', 0.023, 0.023, 0.05, 12, { color: C.dark, p: [0.19, H + 0.014, z], r: [0, 0, Math.PI / 2] }); }
    k.cyl('paint', 0.0215, 0.0215, 0.14, 12, { open: true, region: 'flareLabel', label: true, color: C.red, p: [-0.02, H + 0.014, -0.08], r: [0, 0, Math.PI / 2] });
    // 铰链轴、两个搭扣、提手、正面标签
    k.cyl('metal', 0.013, 0.013, W - 0.1, 10, { color: 0x3a3a3a, p: [0, H, -D / 2 - 0.006], r: [0, 0, Math.PI / 2] });
    for (const x of [-0.15, 0.15]) { k.box('gloss', 0.05, 0.05, 0.018, { color: 0x1c1c1c, p: [x, H - 0.02, D / 2 + 0.008] }); k.box('metal', 0.03, 0.012, 0.012, { color: C.steel, p: [x, H - 0.045, D / 2 + 0.018] }); }
    k.box('gloss', 0.16, 0.022, 0.02, { color: 0x1c1c1c, p: [0, H * 0.55, D / 2 + 0.03] }); for (const x of [-0.075, 0.075]) k.box('gloss', 0.02, 0.022, 0.035, { color: 0x1c1c1c, p: [x, H * 0.55, D / 2 + 0.015] });
    k.plane('paint', 0.2, 0.05, { region: 'flareLabel', label: true, color: C.white, p: [0, H * 0.3, D / 2 + 0.0005] });
    // 箱盖：绕铰链往后翻开 110°，外面四道加强筋，里面一层蛋格海绵
    k.at([0, H, -D / 2], [-1.92, 0, 0], () => {
      k.add('gloss', softSlab(W, 0.045, D, { r: 0.02, seg: [4, 2, 4] }), { ...shell, p: [0, 0.022, D / 2] });
      for (const x of [-0.15, -0.05, 0.05, 0.15]) k.box('gloss', 0.022, 0.012, D - 0.06, { ...shell, p: [x, 0.05, D / 2] });
      k.box('paint', W - 0.05, 0.02, D - 0.05, { color: 0x232426, region: 'charred', p: [0, -0.008, D / 2] });
    });
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
  const glow = new THREE.Mesh(once('flareGlow', () => new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2).translate(0.45, 0.02, 0.1)), glowMaterial({ color: [0.95, 0.07, 0.04], center: [0.45, 0, 0.1], radius: [2.6, 2.6, 2.6], strength: 0.2 }));
  grp.add(glow);
  grp.userData.mats = [flame.material, smoke.material, glow.material];
  return grp;
}

// ---------- 关卡大件（摆在梯段口，本地 +z 朝上楼） ----------
/**
 * 软的厚垫子（床垫）：圆角的长方块，lz 方向从 bendAt 起往 -y 弯（半径 R，弯 arc 弧度）——搭在东西上、软软地耷拉下去。
 * 圆角：每个顶点先夹回到缩进 r 的内盒，再沿夹掉的方向推出去 r（跟 RoundedBox 一个做法），法线就是推出去的方向；弯：顶点和法线一起转。
 */
export function softSlab(w, h, d, { r = 0.05, bendAt = Infinity, R = 0.4, sag = 0, seg = [6, 3, 14] } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d, seg[0], seg[1], seg[2]);
  const P = geo.attributes.position, N = geo.attributes.normal, hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r, v = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i); c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    n.subVectors(v, c); if (n.lengthSq() > 1e-10) { n.normalize(); v.copy(c).addScaledVector(n, r); } else n.fromBufferAttribute(N, i);
    // 中间微微塌下去（填充物压实了）：越靠中间越低一点
    if (sag) v.y -= sag * Math.cos(Math.min(1, Math.abs(v.x) / (w / 2)) * Math.PI / 2) * Math.cos(Math.min(1, Math.abs(v.z) / (d / 2)) * Math.PI / 2);
    // 往下弯：z < bendAt 那一段绕着（y = -R）那条线转
    const zz = bendAt - v.z;
    if (Number.isFinite(zz) && zz > 0) { const th = zz / R, rr = R + v.y, ny = n.y, nz = n.z; v.z = bendAt - rr * Math.sin(th); v.y = -R + rr * Math.cos(th); n.y = ny * Math.cos(th) + nz * Math.sin(th); n.z = -ny * Math.sin(th) + nz * Math.cos(th); }
    P.setXYZ(i, v.x, v.y, v.z); N.setXYZ(i, n.x, n.y, n.z);
  }
  return geo;
}
/** 一个扎了口的黑色垃圾袋：鼓鼓囊囊、表面不平（球面上压几道褶），顶上一个揪起来的结 */
function binBag(k, o = {}) {
  const geo = new THREE.SphereGeometry(0.22, 12, 9), P = geo.attributes.position, v = new THREE.Vector3(), q = rnd(97);
  const bumps = [...Array(6)].map(() => [new THREE.Vector3(q() - 0.5, q() - 0.3, q() - 0.5).normalize(), 0.025 + q() * 0.03]);
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const u = v.clone().normalize(); let s = 1; for (const [b, a] of bumps) s += a * Math.max(0, u.dot(b)) ** 3 * 4 - a * 0.6; s *= v.y < -0.12 ? 0.9 : 1; v.multiplyScalar(s); v.y = Math.max(v.y, -0.15); P.setXYZ(i, v.x, v.y * 0.85, v.z); }
  geo.computeVertexNormals();
  k.at(o.p || [0, 0, 0], o.r || [0, 0, 0], () => {
    k.add('gloss', geo, { color: 0x111214, p: [0, 0.13, 0] });
    k.cyl('gloss', 0.015, 0.05, 0.08, 6, { color: 0x111214, p: [0, 0.34, 0] });
    k.box('gloss', 0.1, 0.012, 0.03, { color: 0x111214, p: [0.03, 0.38, 0], r: [0, 0.4, 0.5] }); // 结的两只耳朵
    k.box('gloss', 0.09, 0.012, 0.03, { color: 0x111214, p: [-0.03, 0.375, 0.01], r: [0, -0.5, -0.6] });
  });
}
/** 一块断木板：一头齐、一头劈开（两三根尖刺） */
function brokenBoard(k, len, wid, o = {}) {
  k.at(o.p || [0, 0, 0], o.r || [0, 0, 0], () => {
    const c = { color: o.color || C.pine, region: 'wood' };
    k.box('paint', len, 0.022, wid, { ...c, p: [0, 0, 0] });
    for (const [z, l, a] of [[-wid * 0.3, 0.16, 0.12], [0.0, 0.1, -0.05], [wid * 0.32, 0.22, -0.16]]) k.box('paint', l, 0.016, wid * 0.3, { ...c, p: [len / 2 + l / 2 - 0.02, 0, z], r: [0, a, 0] });
  });
}
/** 杂物：倒下的大衣柜仰面卡在梯段上（两扇门、门板线脚、拉手冲着楼梯口的人），一张绗缝床垫搭在衣柜上、软软地从下端耷拉下来，
 * 一把椅子翻过来四脚朝天压在顶上，一把侧倒在梯段口，一盏落地灯的灯罩和灯杆从一边戳出来，几块断木板、纸箱、床头柜、水桶、一个黑垃圾袋。
 * 认不认得出是「一堆家具」靠的是轮廓：椅子腿、灯罩、断板、垃圾袋都摆在堆的边上。全在一个组里（撬开时整堆推到一边） */
export function buildDebris(junk) {
  const geos = cached('debris', (k) => {
    const ang = Math.atan(STAIR.slope);
    // 大衣柜：背朝下躺在踏步上，柜顶朝楼上，略斜着卡住；柜门那面（+y）朝上、朝楼梯口
    k.at([0.05, 0.88, 0.29], [-ang, 0.14, 0.07], () => {
      const W = 0.92, H = 0.52, L = 1.9, wood = { color: C.walnut, region: 'woodDark' }, rail = { color: 0x7a5236, region: 'wood' }, inset = { color: 0x4a2f1d, region: 'woodDark' };
      k.box('paint', W, H, L, wood);
      k.box('paint', W + 0.06, H + 0.04, 0.07, { ...wood, p: [0, 0.01, L / 2 + 0.02] }); // 顶线
      k.box('paint', W + 0.03, H + 0.02, 0.09, { color: 0x3a2516, region: 'woodDark', p: [0, 0, -L / 2 + 0.04] }); // 踢脚
      // 两扇门：门框（竖梃、横档）凸出来、颜色浅一点，中间两块凹进去的芯板；左门关着，右门被压得翘开一条缝，露出里面一截袖子
      for (const side of [-1, 1]) k.at([side * W / 4, H / 2, 0], [0, 0, side > 0 ? -0.09 : 0], () => {
        const dw = W / 2 - 0.02;
        k.box('paint', dw, 0.02, L - 0.16, { ...rail, p: [0, 0.01, 0] });
        for (const zc of [-0.42, 0.4]) { k.box('paint', dw - 0.12, 0.012, 0.64, { ...inset, p: [0, 0.022, zc] }); for (const s of [-1, 1]) k.box('paint', dw - 0.1, 0.03, 0.025, { ...rail, p: [0, 0.03, zc + s * 0.33] }); for (const s of [-1, 1]) k.box('paint', 0.025, 0.03, 0.68, { ...rail, p: [s * (dw / 2 - 0.05), 0.03, zc] }); }
        k.box('metal', 0.022, 0.03, 0.16, { color: C.brass, region: 'metal', p: [-side * (dw / 2 - 0.05), 0.05, 0.02] }); // 拉手（竖条，铜）
        for (const s of [-1, 1]) k.box('metal', 0.03, 0.02, 0.03, { color: C.brass, p: [-side * (dw / 2 - 0.05), 0.035, 0.02 + s * 0.07] });
      });
      k.box('paint', 0.012, 0.015, L - 0.2, { color: 0x150d08, p: [0, H / 2 + 0.005, 0] }); // 两扇门之间的缝
      k.box('paint', 0.07, 0.04, 0.26, { color: 0x6a2a2a, p: [0.38, H / 2 + 0.03, 0.2], r: [0, 0.4, 0.2] }); // 从门缝里挤出来的一截袖子
    });
    // 床垫：搭在衣柜左半边、从衣柜下端软软地耷拉下来，搭到梯段口的地上
    k.at([0.05, 0.88, 0.29], [-ang, 0.14, 0.07], () => {
      k.add('paint', softSlab(0.8, 0.17, 1.9, { r: 0.06, bendAt: -0.45, R: 0.28, sag: 0.03 }), { color: 0xc9bfac, region: 'mattress', p: [-0.24, 0.4, 0.28], r: [0, 0.14, -0.12] });
    });
    // 一把椅子翻过来四脚朝天压在衣柜上（椅子腿戳在堆顶上），一把侧倒在梯段口
    k.at([0.4, 1.62, 0.78], [Math.PI - 0.35, 0.75, 0.25], () => chair(k));
    k.at([-0.32, 0.3, -0.48], [-0.5, Math.PI / 2 + 0.15, Math.PI / 2], () => chair(k, { color: C.pine })); // 侧倒，椅背朝楼上
    // 落地灯：灯罩掉在右边，灯杆斜着从堆里戳出来
    k.at([0.46, 1.0, 0.25], [0.5, 0, -0.32], () => {
      k.cyl('metal', 0.012, 0.012, 1.3, 6, { color: 0x3a3a3c, region: 'metal', p: [0, 0, 0] });
      k.cyl('metal', 0.11, 0.13, 0.025, 12, { color: 0x2a2a2c, region: 'metal', p: [0, -0.65, 0] });
    });
    k.cyl('paint', 0.1, 0.19, 0.22, 14, { color: 0xd6c7a6, region: 'paint', p: [0.52, 0.2, -0.4], r: [0.2, 0, 1.25] }); // 灯罩（侧躺）
    // 纸箱
    carton(k, 0.5, 0.36, 0.4, { p: [0.36, 0.2, -0.42], r: [0, 0.35, 0] });
    carton(k, 0.4, 0.3, 0.34, { p: [0.36, 0.53, -0.38], r: [0.05, 0.6, 0.06], flaps: false });
    // 床头柜侧倒、断木板斜插、一个塑料桶、一个黑垃圾袋
    k.at([-0.4, 0.62, -0.2], [0.1, 0.4, Math.PI / 2 + 0.1], () => { k.box('paint', 0.45, 0.5, 0.4, { color: C.oak, region: 'wood' }); k.box('paint', 0.38, 0.14, 0.01, { color: 0x86603c, region: 'wood', p: [0, 0.12, 0.205] }); k.box('metal', 0.08, 0.015, 0.02, { color: C.brass, p: [0, 0.12, 0.215] }); });
    brokenBoard(k, 1.3, 0.13, { p: [0.0, 1.12, 0.0], r: [0.2, 0.25, 0.42] });
    brokenBoard(k, 1.1, 0.11, { p: [-0.02, 0.95, 0.55], r: [-0.4, -2.6, 0.3], color: 0x8a6a44 });
    k.cyl('gloss', 0.15, 0.12, 0.3, 14, { color: C.blue, open: true, p: [0.48, 0.42, 0.35], r: [0.3, 0, 1.4] });
    binBag(k, { p: [-0.42, 0, -0.5], r: [0.1, 0.6, 0.15] });
  });
  return meshes(junk, geos);
}
/** 着火：烧剩的家具骨架（灭了以后还留着）、熏黑的地面和踏步（一直在）、干粉（灭了以后才有）。
 * 骨架要在火光前面认得出来：一把烧得只剩框的椅子立在火里、一张床垫烧光了只剩弹簧架斜靠在踏步上、几根烧塌的木板——都是近乎纯黑的剪影 */
export function buildFireStatic(g) {
  const geos = cached('fireStatic', (k) => {
    const o = { color: C.char, region: 'charred' }, coal = { color: 0x0c0b0b, region: 'charred' };
    // 烧剩的椅子：侧翻在梯段口，椅背和三条腿戳出来
    k.at([0.12, 0.35, -0.15], [0.3, 0.7, Math.PI / 2 + 0.2], () => { for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17]]) k.box('paint', 0.03, 0.42, 0.03, { ...o, p: [x, 0.21, z] }); k.box('paint', 0.42, 0.03, 0.36, { ...o, p: [0, 0.44, 0] }); });
    // 另一把立在火里：只剩框（没有座面），火苗从框里穿出来
    k.at([-0.22, nosingY(0.05), 0.05], [0.04, -0.35, 0.06], () => {
      for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) k.box('paint', 0.03, 0.45, 0.03, { ...coal, p: [x, 0.225 + (z > 0 ? 0.16 : 0), z] });
      for (const x of [-0.18, 0.18]) k.box('paint', 0.028, 0.5, 0.028, { ...coal, p: [x, 0.84, 0.18], r: [0.12, 0, 0] });
      k.box('paint', 0.4, 0.035, 0.03, { ...coal, p: [0, 1.06, 0.2] }); k.box('paint', 0.4, 0.03, 0.03, { ...coal, p: [0, 0.48, -0.17] }); k.box('paint', 0.03, 0.03, 0.36, { ...coal, p: [0.18, 0.5, 0] });
    });
    // 烧光的床垫：只剩弹簧架，斜靠在上面几级踏步上（一格格的弹簧在火光前面是很好认的剪影）
    k.at([0.2, nosingY(0.75) + 0.5, 0.78], [-0.42, 0.25, 0.05], () => {
      const W = 0.7, H = 1.0, sp = 0.012;
      for (const x of [-W / 2, W / 2]) k.box('metal', sp, H, sp, { color: 0x151312, p: [x, 0, 0] });
      for (const y of [-H / 2, H / 2]) k.box('metal', W, sp, sp, { color: 0x151312, p: [0, y, 0] });
      for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) k.torus('metal', 0.05, 0.006, 3, 8, Math.PI * 2, { color: 0x1a1716, p: [-W / 2 + (i + 0.5) * W / 3, -H / 2 + (j + 0.5) * H / 5, 0.03 + ((i + j) % 2) * 0.02] }); // 一圈圈的弹簧（正面看是一个个圆环）
    });
    k.box('paint', 1.1, 0.06, 0.12, { ...o, p: [-0.05, 0.42, 0.1], r: [-0.3, 0.3, 0.12] });
    k.box('paint', 0.9, 0.05, 0.1, { ...o, p: [0.1, 0.2, -0.3], r: [0.25, -0.5, 0.05] });
    // 烧塌的一摞木板（以前是一整块黑方块，手电一照像个黑箱子）
    for (const [x, y, z, a, b] of [[-0.38, 0.05, -0.38, 0.25, 0.12], [-0.32, 0.1, -0.3, -0.35, 0.05], [-0.42, 0.14, -0.33, 0.6, -0.18], [-0.25, 0.06, -0.42, 1.4, 0.08]]) k.box('paint', 0.5, 0.035, 0.09, { ...o, p: [x, y, z], r: [b * 0.3, a + 0.4, b] });
    k.box('paint', 0.36, 0.08, 0.4, { color: 0x121010, region: 'charred', p: [0.38, 0.5, 0.25], r: [-0.45, 0.2, 0.2] });
    if (k.useAtlas) stairSheet(k, 'decal', 1.5, -2.1, 1.9, { region: 'scorch', color: C.black }); // 省内存档没有图集：贴花会变成一块黑方片，不要
  });
  return meshes(g, geos, { shadow: false });
}
export function powderSheet() {
  const geos = cached('powder', (k) => { if (k.useAtlas) stairSheet(k, 'decal', 1.4, -1.9, 1.3, { region: 'powder', color: C.white }, 0.02); });
  const grp = new THREE.Group(); grp.name = '干粉'; meshes(grp, geos, { shadow: false }); return grp;
}
/** 火的配置：烟柱、顶上积的烟层、火光、炭火。灯：借游戏灯池里的一盏（见 siege.js gateBlock），这里只给亮度和位置 */
// 火光：原来 1.5 / 6.5 m / 0xff7426，停电里别的光都压得很低，整个楼梯间被染成一片暗红（评审：「像酱紫色的墙」）；
// 压低、偏黄、照得近一点——火边上暖，回头看墙还是墙的颜色
export const FIRE = Object.freeze({ light: Object.freeze({ intensity: 0.85, distance: 5.5, color: 0xff9a4c, y: 0.75, z: 0.1, near: 15 }), ceiling: 2.15 });
/** 火本身（junk 组里：灭火时缩没）：火苗（几朵高的 + 底下一层贴着燃料的矮火）、火星、烟柱、顶上积的一层烟、地上的火光、炭火。返回要推进时间、淡出的材质 */
export function buildFire(junk) {
  const bed = [[-0.42, -0.25], [-0.12, -0.05], [0.2, 0.0], [0.45, 0.2], [-0.3, 0.35], [0.1, 0.45]].map(([x, z], i) => ({ x, z, w: 0.7, h: 0.38, turn: (i % 2 ? 0.2 : -0.2), seed: 0.13 + i * 0.17 }));
  const flames = new THREE.Mesh(once('flames', () => flameGeometry([...flameLayout(7), ...bed])), flameMaterial()); flames.name = 'flames'; flames.frustumCulled = false; flames.renderOrder = 3; junk.add(flames);
  const r = rnd(11), embers = new THREE.Points(once('embers', () => emberGeometry(46, r)), emberMaterial()); embers.name = 'embers'; embers.frustumCulled = false; embers.renderOrder = 4; junk.add(embers);
  // 烟柱：从火苗顶上冒出来，往上翻滚，底下被火映红
  const smoke = new THREE.Mesh(once('smoke', () => { const q = rnd(23), puffs = []; for (let i = 0; i < 9; i++) { const z = -0.2 + q() * 0.8; puffs.push([(q() - 0.5) * 0.8, nosingY(z) + 0.85, z, i / 9]); } return puffGeometry(puffs); }),
    smokeMaterial({ color: [0.07, 0.065, 0.06], fire: [0.45, 0.17, 0.04], opacity: 0.46, rise: 1.5, grow: 1.3, base: 0.45, lit: 0.55 })); smoke.name = 'smoke'; smoke.frustumCulled = false; smoke.renderOrder = 2; junk.add(smoke);
  // 顶上积的一层浓烟：楼梯间是个竖井，烟往上走、在上一跑梯段底下积住，慢慢翻滚、顺着梯段往上淌
  const ceil = new THREE.Mesh(once('smokeCeil', () => { const q = rnd(31), puffs = []; for (let i = 0; i < 12; i++) { const z = -1.1 + (i / 11) * 2.6 + (q() - 0.5) * 0.3; puffs.push([(q() - 0.5) * 1.1, nosingY(z) + FIRE.ceiling - q() * 0.2, z, q()]); } return puffGeometry(puffs); }),
    smokeMaterial({ color: [0.06, 0.055, 0.05], fire: [0.4, 0.14, 0.03], opacity: 0.55, rise: 0.2, grow: 0.55, base: 1.0, drift: [0.12, 0.45], period: 11, lit: 0.4 })); ceil.name = 'smoke-ceiling'; ceil.frustumCulled = false; ceil.renderOrder = 2; junk.add(ceil);
  const glow = new THREE.Mesh(once('fireGlow', () => rawSheet(2.8, -3.0, 2.6)), glowMaterial({ center: [0, nosingY(0.1) + 0.1, 0.1], radius: [1.35, 2.0, 2.9], strength: 0.22 })); glow.name = 'fire-glow'; glow.renderOrder = 1; junk.add(glow);
  // 炭火：燃料底下一粒粒烧红的炭（加色，不吃光照），火灭了跟着没
  const coals = new THREE.Mesh(once('coals', () => { const q = rnd(41), list = []; for (let i = 0; i < 26; i++) { const z = -0.4 + q() * 1.0, x = (q() - 0.5) * 1.0, s = 0.025 + q() * 0.04; list.push(new THREE.BoxGeometry(s * 1.6, s * 0.6, s).rotateY(q() * 3).translate(x, nosingY(z) + 0.02, z)); } const m = mergeGeometries(list, false); for (const x of list) x.dispose(); return m; }),
    once('coalMat', () => new THREE.MeshBasicMaterial({ color: 0xff5512, toneMapped: false }))); coals.name = 'coals'; junk.add(coals);
  return [flames.material, embers.material, smoke.material, ceil.material, glow.material];
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

// ---------- 预热 ----------
let WARM = false;
/**
 * 丧尸围城开着的时候，提前把各种物件的几何体建好（每帧只建一件）：一局开始时武器柜、配电柜、三件工具、三道关、信号弹一下子全建，
 * 合起来要几十毫秒，手机上会卡一下；建好的几何体全局缓存（cached），开局时只剩挂网格。没有 requestAnimationFrame（节点测试）就不做。
 */
export function warmProps() {
  if (WARM || typeof requestAnimationFrame !== 'function') return false;
  WARM = true;
  const q = slices(), grp = () => new THREE.Group();
  const jobs = [() => buildLocker(grp()), () => lockerDoors(), () => buildSwitchCabinet(grp()), () => switchLever(false), () => buildTable(grp()),
    ...['撬棍', '保险丝', '灭火器', '门禁卡'].map((t) => () => buildTool(grp(), t)), () => buildFuseBox(grp()), () => fuseInserts(), () => buildFlareKit(grp()), () => litFlare(),
    () => buildDebris(grp()), () => buildFire(grp()), () => buildFireStatic(grp()), () => powderSheet(), () => buildShutterFrame(grp()), () => buildShutterCurtain(grp()), () => buildDoorFrame(grp()), () => buildDoorLeaf(grp())];
  for (const j of jobs) q.add(j);
  return true;
}
