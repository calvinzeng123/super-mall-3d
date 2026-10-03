// Canvas 程序化贴图：地面材质、招牌图集、图标、标注、LED 屏、周边楼窗格。
import * as THREE from 'three';

export const FONT_CN = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Source Han Sans SC",sans-serif';
export const FONT_EN = '"Barlow Semi Condensed","Avenir Next Condensed","Helvetica Neue",Arial,sans-serif';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function rng(seed = 1) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

let ANISO = 8;
export function setAnisotropy(n) { ANISO = n; }

export function canvasTexture(c, { repeat = 1, srgb = true, clamp = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = ANISO;
  t.repeat.set(repeat, repeat);
  return t;
}

// ---------- 地面材质 ----------

function chips(ctx, size, n, palette, r0, r1, rand) {
  for (let i = 0; i < n; i++) {
    const x = rand() * size, y = rand() * size, r = r0 + rand() * (r1 - r0);
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
    ctx.beginPath();
    const k = 4 + Math.floor(rand() * 3);
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2 + rand() * 0.6;
      const rr = r * (0.6 + rand() * 0.5);
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
  }
}

function grid(ctx, size, step, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let p = 0; p <= size; p += step) {
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
}

function mottle(ctx, size, n, colors, rmin, rmax, rand) {
  for (let i = 0; i < n; i++) {
    const x = rand() * size, y = rand() * size, r = rmin + rand() * (rmax - rmin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = colors[Math.floor(rand() * colors.length)];
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function boards(ctx, size, boardPx, colors, gap, rand, horizontal = true) {
  for (let b = 0; b * boardPx < size; b++) {
    let p = -rand() * size * 0.5;
    while (p < size) {
      const len = size * (0.28 + rand() * 0.35);
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
      if (horizontal) ctx.fillRect(p, b * boardPx, len - 2, boardPx - gap);
      else ctx.fillRect(b * boardPx, p, boardPx - gap, len - 2);
      ctx.strokeStyle = 'rgba(60,35,15,0.10)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const o = b * boardPx + (k + 0.5) * ((boardPx - gap) / 4) + (rand() - 0.5) * 3;
        ctx.beginPath();
        if (horizontal) { ctx.moveTo(p, o); ctx.bezierCurveTo(p + len * 0.3, o + 2, p + len * 0.6, o - 2, p + len, o); }
        else { ctx.moveTo(o, p); ctx.bezierCurveTo(o + 2, p + len * 0.3, o - 2, p + len * 0.6, o, p + len); }
        ctx.stroke();
      }
      p += len;
    }
  }
}

/** 地面贴图：返回 { texture, meters }，meters 为一张贴图覆盖的米数 */
export function floorTexture(kind) {
  const S = 1024;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const rand = rng(kind.length * 977 + 13);
  let meters = 4;
  switch (kind) {
    case 'marble-white': {
      meters = 4.8;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const alt = (i + j) % 2 === 0;
        const v = rand() * 8;
        ctx.fillStyle = alt ? `rgb(${238 - v},${231 - v},${219 - v})` : `rgb(${224 - v},${221 - v},${214 - v})`;
        ctx.fillRect(i * 256, j * 256, 256, 256);
      }
      ctx.lineCap = 'round';
      for (let k = 0; k < 34; k++) {
        let x = rand() * S, y = rand() * S;
        ctx.strokeStyle = `rgba(110,104,96,${0.16 + rand() * 0.22})`;
        ctx.lineWidth = 0.8 + rand() * 2.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s2 = 0; s2 < 6; s2++) {
          const nx = x + (rand() - 0.3) * 200, ny = y + (rand() - 0.5) * 200;
          ctx.quadraticCurveTo((x + nx) / 2 + (rand() - 0.5) * 70, (y + ny) / 2 + (rand() - 0.5) * 70, nx, ny);
          x = nx; y = ny;
        }
        ctx.stroke();
      }
      grid(ctx, S, 256, 'rgba(150,136,112,0.85)', 3);
      ctx.strokeStyle = '#c3a062';
      ctx.lineWidth = 7;
      ctx.strokeRect(0, 0, S, S);
      break;
    }
    case 'terrazzo-cool': {
      meters = 4;
      ctx.fillStyle = '#c9d2d8';
      ctx.fillRect(0, 0, S, S);
      chips(ctx, S, 6500, ['#ffffff', '#8f9ba4', '#5f6c76', '#c0c8ce', '#6f95ad', '#a9bac5', '#e9eef1', '#3f4a52'], 1.5, 5.5, rand);
      grid(ctx, S, 512, 'rgba(185,162,107,0.95)', 4);
      break;
    }
    case 'terrazzo-warm': {
      meters = 4;
      ctx.fillStyle = '#dfc9aa';
      ctx.fillRect(0, 0, S, S);
      chips(ctx, S, 6200, ['#c0583a', '#f6eedf', '#7d5032', '#d39652', '#ffffff', '#9a948f', '#e7b47e', '#5b3a24'], 1.8, 7, rand);
      grid(ctx, S, 512, 'rgba(150,112,64,0.95)', 4);
      break;
    }
    case 'wood-warm': {
      meters = 4;
      ctx.fillStyle = '#6b4a2f';
      ctx.fillRect(0, 0, S, S);
      boards(ctx, S, 51, ['#c4935f', '#b98654', '#cf9f6c', '#ad7a4b', '#c79a68'], 2, rand);
      break;
    }
    case 'deck-garden': {
      meters = 4;
      ctx.fillStyle = '#3d2a1d';
      ctx.fillRect(0, 0, S, S);
      boards(ctx, S, 36, ['#9c6a43', '#a8754c', '#93623d', '#b07d52', '#a06f46'], 4, rand, false);
      break;
    }
    case 'concrete-blue':
    case 'concrete-green': {
      meters = 8;
      const blue = kind === 'concrete-blue';
      ctx.fillStyle = blue ? '#8d98a3' : '#93a097';
      ctx.fillRect(0, 0, S, S);
      mottle(ctx, S, 160, blue ? ['rgba(70,80,95,0.10)', 'rgba(170,180,190,0.12)', 'rgba(60,90,140,0.08)'] : ['rgba(70,90,75,0.10)', 'rgba(175,185,175,0.12)', 'rgba(60,120,80,0.08)'], 30, 160, rand);
      chips(ctx, S, 2500, ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.08)'], 0.6, 1.6, rand);
      grid(ctx, S, 512, 'rgba(60,64,70,0.25)', 2);
      break;
    }
    case 'paving': {
      meters = 4.8;
      ctx.fillStyle = '#b9b6ae';
      ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        const v = 170 + rand() * 30;
        ctx.fillStyle = `rgb(${v + 6},${v + 4},${v})`;
        ctx.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
      }
      chips(ctx, S, 3000, ['rgba(0,0,0,0.07)', 'rgba(255,255,255,0.10)'], 0.5, 1.4, rand);
      break;
    }
    case 'stone': {
      meters = 4;
      ctx.fillStyle = '#6f6a63';
      ctx.fillRect(0, 0, S, S);
      let y = 0;
      while (y < S) {
        const h = 90 + rand() * 60;
        let x = -rand() * 100;
        while (x < S) {
          const w = 120 + rand() * 140;
          const v = 125 + rand() * 40;
          ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
          ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
          x += w;
        }
        y += h;
      }
      break;
    }
    case 'asphalt': {
      meters = 8;
      ctx.fillStyle = '#3c3f43';
      ctx.fillRect(0, 0, S, S);
      chips(ctx, S, 9000, ['rgba(255,255,255,0.07)', 'rgba(0,0,0,0.18)', 'rgba(120,120,120,0.12)'], 0.5, 1.6, rand);
      break;
    }
    case 'grass': {
      meters = 6;
      ctx.fillStyle = '#7a9757';
      ctx.fillRect(0, 0, S, S);
      mottle(ctx, S, 260, ['rgba(70,105,45,0.28)', 'rgba(160,170,95,0.20)', 'rgba(110,125,60,0.24)'], 20, 110, rand);
      for (let i = 0; i < 14000; i++) {
        ctx.strokeStyle = rand() < 0.5 ? 'rgba(40,80,25,0.25)' : 'rgba(170,200,110,0.25)';
        const x = rand() * S, y = rand() * S;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 3, y - 4 - rand() * 5); ctx.stroke();
      }
      break;
    }
    case 'rubber': {
      meters = 4;
      ctx.fillStyle = '#e8734a';
      ctx.fillRect(0, 0, S, S);
      chips(ctx, S, 6000, ['#f59e0b', '#ef4444', '#fde68a', '#fb923c'], 1, 3, rand);
      break;
    }
    default:
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(0, 0, S, S);
  }
  const texture = canvasTexture(c);
  return { texture, meters };
}

// ---------- 字标图形 ----------

export function drawGlyph(ctx, type, cx, cy, r, color, letter = 'Y') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.14;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const P = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * r, y * r) : ctx.moveTo(x * r, y * r))); ctx.closePath(); };
  switch (type) {
    case 'crown': P([[-0.9, 0.55], [-0.9, -0.35], [-0.45, 0.1], [0, -0.75], [0.45, 0.1], [0.9, -0.35], [0.9, 0.55]]); ctx.fill(); break;
    case 'bolt': P([[0.15, -1], [-0.6, 0.15], [-0.05, 0.15], [-0.2, 1], [0.6, -0.2], [0.05, -0.2]]); ctx.fill(); break;
    case 'drop': ctx.beginPath(); ctx.moveTo(0, -r); ctx.bezierCurveTo(r * 0.9, -0.1 * r, r * 0.75, r * 0.95, 0, r * 0.95); ctx.bezierCurveTo(-r * 0.75, r * 0.95, -r * 0.9, -0.1 * r, 0, -r); ctx.fill(); break;
    case 'diamond': P([[-0.9, -0.3], [-0.45, -0.8], [0.45, -0.8], [0.9, -0.3], [0, 0.95]]); ctx.fill(); break;
    case 'ring': ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.lineWidth = r * 0.22; ctx.stroke(); break;
    case 'sun':
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); ctx.stroke(); }
      break;
    case 'wave':
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); for (let i = 0; i <= 20; i++) { const x = -0.95 + (i / 20) * 1.9; ctx.lineTo(x * r, (k * 0.45 + Math.sin(x * 4) * 0.16) * r); } ctx.stroke(); }
      break;
    case 'leaf':
      ctx.beginPath(); ctx.moveTo(-0.85 * r, 0.75 * r); ctx.quadraticCurveTo(-0.9 * r, -0.9 * r, 0.85 * r, -0.85 * r); ctx.quadraticCurveTo(0.8 * r, 0.8 * r, -0.85 * r, 0.75 * r); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.moveTo(-0.7 * r, 0.6 * r); ctx.lineTo(0.6 * r, -0.6 * r); ctx.stroke();
      break;
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2; const rr = i % 2 ? r * 0.42 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'heart':
      ctx.beginPath(); ctx.moveTo(0, r * 0.85); ctx.bezierCurveTo(-r * 1.1, 0, -r * 0.7, -r * 0.95, 0, -r * 0.4); ctx.bezierCurveTo(r * 0.7, -r * 0.95, r * 1.1, 0, 0, r * 0.85); ctx.fill();
      break;
    case 'moon':
      ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.2, r * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'cup':
      ctx.fillRect(-0.6 * r, -0.15 * r, 1.0 * r, 0.9 * r);
      ctx.beginPath(); ctx.arc(0.5 * r, 0.25 * r, 0.25 * r, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      for (const x of [-0.35, -0.05, 0.25]) { ctx.beginPath(); ctx.moveTo(x * r, -0.3 * r); ctx.quadraticCurveTo((x + 0.15) * r, -0.6 * r, x * r, -0.9 * r); ctx.stroke(); }
      break;
    case 'bowl':
      ctx.beginPath(); ctx.moveTo(-0.95 * r, -0.05 * r); ctx.lineTo(0.95 * r, -0.05 * r); ctx.quadraticCurveTo(0.85 * r, 0.85 * r, 0, 0.85 * r); ctx.quadraticCurveTo(-0.85 * r, 0.85 * r, -0.95 * r, -0.05 * r); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.1 * r, -0.2 * r); ctx.lineTo(0.75 * r, -0.95 * r); ctx.moveTo(0.15 * r, -0.2 * r); ctx.lineTo(0.95 * r, -0.85 * r); ctx.stroke();
      break;
    case 'flame':
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.bezierCurveTo(r * 0.9, -0.2 * r, r * 0.75, r * 0.95, 0, r * 0.95); ctx.bezierCurveTo(-r * 0.8, r * 0.95, -r * 0.8, 0, -r * 0.25, -0.35 * r); ctx.quadraticCurveTo(-r * 0.2, 0.1 * r, 0, -r); ctx.fill();
      break;
    case 'film':
      ctx.fillRect(-0.95 * r, -0.65 * r, 1.9 * r, 1.3 * r);
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 5; i++) { ctx.fillRect((-0.8 + i * 0.36) * r, -0.55 * r, 0.18 * r, 0.18 * r); ctx.fillRect((-0.8 + i * 0.36) * r, 0.37 * r, 0.18 * r, 0.18 * r); }
      ctx.fillRect(-0.7 * r, -0.25 * r, 1.4 * r, 0.5 * r);
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'book':
      ctx.beginPath(); ctx.moveTo(0, -0.55 * r); ctx.quadraticCurveTo(-0.5 * r, -0.85 * r, -0.95 * r, -0.6 * r); ctx.lineTo(-0.95 * r, 0.7 * r); ctx.quadraticCurveTo(-0.5 * r, 0.45 * r, 0, 0.75 * r); ctx.quadraticCurveTo(0.5 * r, 0.45 * r, 0.95 * r, 0.7 * r); ctx.lineTo(0.95 * r, -0.6 * r); ctx.quadraticCurveTo(0.5 * r, -0.85 * r, 0, -0.55 * r); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(0, -0.55 * r); ctx.lineTo(0, 0.75 * r); ctx.stroke();
      break;
    case 'game':
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(-0.62 * r, -0.08 * r, 0.42 * r, 0.16 * r); ctx.fillRect(-0.49 * r, -0.21 * r, 0.16 * r, 0.42 * r);
      ctx.beginPath(); ctx.arc(0.4 * r, -0.12 * r, 0.09 * r, 0, Math.PI * 2); ctx.arc(0.6 * r, 0.1 * r, 0.09 * r, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'cart':
      ctx.beginPath(); ctx.moveTo(-0.95 * r, -0.7 * r); ctx.lineTo(-0.6 * r, -0.7 * r); ctx.lineTo(-0.35 * r, 0.35 * r); ctx.lineTo(0.75 * r, 0.35 * r); ctx.lineTo(0.9 * r, -0.4 * r); ctx.lineTo(-0.5 * r, -0.4 * r); ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.25 * r, 0.72 * r, 0.16 * r, 0, Math.PI * 2); ctx.arc(0.6 * r, 0.72 * r, 0.16 * r, 0, Math.PI * 2); ctx.fill();
      break;
    case 'peak':
      P([[-1, 0.75], [-0.35, -0.55], [0, 0.0], [0.35, -0.8], [1, 0.75]]); ctx.fill();
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.42, r * 0.26, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      break;
    case 'cloud':
      ctx.beginPath(); ctx.arc(-0.45 * r, 0.15 * r, 0.42 * r, 0, Math.PI * 2); ctx.arc(0.05 * r, -0.2 * r, 0.55 * r, 0, Math.PI * 2); ctx.arc(0.5 * r, 0.15 * r, 0.42 * r, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-0.45 * r, 0.15 * r, 0.95 * r, 0.42 * r);
      break;
    default: {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2); ctx.lineWidth = r * 0.12; ctx.stroke();
      ctx.font = `700 ${Math.round(r * 1.1)}px ${FONT_EN}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, 0, r * 0.06);
    }
  }
  ctx.restore();
}

function fitFont(ctx, text, weight, family, max, min, width) {
  let size = max;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > min && ctx.measureText(text).width > width) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function spaced(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}
function spacedWidth(ctx, text, spacing) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w - spacing;
}

/** 在 (x,y,w,h) 区域绘制一块店招 */
export function drawSign(ctx, x, y, w, h, brand, { compact = false } = {}) {
  ctx.save();
  ctx.fillStyle = brand.bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = hexAlpha(brand.fg, 0.28);
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
  const gx = x + h * 0.52;
  const gy = y + h / 2;
  drawGlyph(ctx, brand.logo, gx, gy, h * 0.27, brand.fg, (brand.en || 'Y')[0]);
  const tx = x + h * 0.98;
  const tw = w - (tx - x) - h * 0.2;
  ctx.fillStyle = brand.fg;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const cn = fitFont(ctx, brand.name, 700, FONT_CN, compact ? 46 : 52, 22, tw);
  ctx.fillText(brand.name, tx, y + h * 0.5 + cn * 0.32 - (brand.en ? h * 0.1 : -h * 0.04));
  if (brand.en) {
    ctx.fillStyle = hexAlpha(brand.fg, 0.82);
    let en = 26;
    ctx.font = `600 ${en}px ${FONT_EN}`;
    while (en > 12 && spacedWidth(ctx, brand.en, en * 0.12) > tw) { en -= 2; ctx.font = `600 ${en}px ${FONT_EN}`; }
    spaced(ctx, brand.en, tx, y + h * 0.82, en * 0.12);
  }
  ctx.restore();
}

export function hexAlpha(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 招牌图集：每个条目 512×128 一格。返回 { texture, cell(id) → [u0,v0,u1,v1] } */
export function makeSignAtlas(entries) {
  const CW = 512, CH = 128, COLS = 4;
  const rows = Math.max(1, Math.ceil(entries.length / COLS));
  const W = CW * COLS, H = CH * rows;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const cells = new Map();
  entries.forEach((e, i) => {
    const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH;
    if (e.draw) e.draw(ctx, x, y, CW, CH);
    else drawSign(ctx, x, y, CW, CH, e.brand);
    const pad = 1.5;
    cells.set(e.id, [(x + pad) / W, 1 - (y + CH - pad) / H, (x + CW - pad) / W, 1 - (y + pad) / H]);
  });
  const texture = canvasTexture(c, { clamp: true });
  return { texture, cell: (id) => cells.get(id), canvas: c };
}

// ---------- 图标与标注 ----------

/** 卫生间等导视牌（512×128，深色底） */
export function drawWayfinding(ctx, x, y, w, h, kind, text, bg = '#1f2933', fg = '#ffffff') {
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  const s = h * 0.62;
  const ix = x + h * 0.55, iy = y + h / 2;
  drawPicto(ctx, kind, ix, iy, s, fg);
  if (kind === 'wc') drawPicto(ctx, 'woman', ix + s * 0.9, iy, s, fg);
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  const tx = x + h * (kind === 'wc' ? 1.55 : 1.05);
  fitFont(ctx, text, 700, FONT_CN, 50, 20, w - (tx - x) - 16);
  ctx.fillText(text, tx, y + h / 2 + 2);
  ctx.restore();
}

/** 简单象形图标 */
export function drawPicto(ctx, kind, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = 'round';
  const head = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  switch (kind) {
    case 'wc':
    case 'man':
      head(0, -s * 0.36, s * 0.1);
      ctx.fillRect(-s * 0.14, -s * 0.22, s * 0.28, s * 0.3);
      ctx.fillRect(-s * 0.13, s * 0.06, s * 0.1, s * 0.34);
      ctx.fillRect(s * 0.03, s * 0.06, s * 0.1, s * 0.34);
      break;
    case 'woman':
      head(0, -s * 0.36, s * 0.1);
      ctx.beginPath(); ctx.moveTo(-s * 0.08, -s * 0.22); ctx.lineTo(s * 0.08, -s * 0.22); ctx.lineTo(s * 0.2, s * 0.14); ctx.lineTo(-s * 0.2, s * 0.14); ctx.closePath(); ctx.fill();
      ctx.fillRect(-s * 0.09, s * 0.14, s * 0.07, s * 0.26);
      ctx.fillRect(s * 0.02, s * 0.14, s * 0.07, s * 0.26);
      break;
    case 'lift':
      ctx.strokeRect(-s * 0.32, -s * 0.4, s * 0.64, s * 0.8);
      ctx.beginPath(); ctx.moveTo(-s * 0.16, -s * 0.05); ctx.lineTo(0, -s * 0.25); ctx.lineTo(s * 0.16, -s * 0.05); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.16, s * 0.08); ctx.lineTo(0, s * 0.28); ctx.lineTo(s * 0.16, s * 0.08); ctx.closePath(); ctx.fill();
      break;
    case 'escalator':
      ctx.beginPath(); ctx.moveTo(-s * 0.42, s * 0.3); ctx.lineTo(-s * 0.18, s * 0.3); ctx.lineTo(s * 0.18, -s * 0.12); ctx.lineTo(s * 0.42, -s * 0.12); ctx.stroke();
      head(-s * 0.05, -s * 0.2, s * 0.08);
      ctx.fillRect(-s * 0.1, -s * 0.1, s * 0.1, s * 0.22);
      break;
    case 'exit':
      head(s * 0.12, -s * 0.33, s * 0.09);
      ctx.beginPath(); ctx.moveTo(s * 0.05, -s * 0.2); ctx.lineTo(-s * 0.05, s * 0.08); ctx.lineTo(-s * 0.25, s * 0.38);
      ctx.moveTo(-s * 0.05, s * 0.08); ctx.lineTo(s * 0.18, s * 0.38); ctx.moveTo(-s * 0.25, -s * 0.12); ctx.lineTo(s * 0.02, -s * 0.18); ctx.lineTo(s * 0.25, -s * 0.02); ctx.stroke();
      break;
    case 'parking':
      ctx.font = `800 ${Math.round(s * 0.9)}px ${FONT_EN}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P', 0, s * 0.04);
      break;
    case 'info':
      ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2); ctx.stroke();
      head(0, -s * 0.18, s * 0.06);
      ctx.fillRect(-s * 0.04, -s * 0.06, s * 0.08, s * 0.28);
      break;
    case 'food':
      ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.38); ctx.lineTo(-s * 0.2, s * 0.38); ctx.moveTo(-s * 0.3, -s * 0.38); ctx.lineTo(-s * 0.3, -s * 0.1); ctx.lineTo(-s * 0.1, -s * 0.1); ctx.lineTo(-s * 0.1, -s * 0.38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.38); ctx.lineTo(s * 0.2, -s * 0.38); ctx.quadraticCurveTo(s * 0.38, -s * 0.2, s * 0.2, -s * 0.02); ctx.stroke();
      break;
    case 'wheel':
      ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.32, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, -s * 0.05); ctx.lineTo(Math.cos(a) * s * 0.32, -s * 0.05 + Math.sin(a) * s * 0.32); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-s * 0.25, s * 0.42); ctx.lineTo(0, -s * 0.05); ctx.lineTo(s * 0.25, s * 0.42); ctx.stroke();
      break;
    case 'star':
      drawGlyph(ctx, 'star', 0, 0, s * 0.4, color);
      break;
    case 'cup':
      drawGlyph(ctx, 'cup', 0, 0, s * 0.38, color);
      break;
    default:
      head(0, 0, s * 0.2);
  }
  ctx.restore();
}

/** 标注精灵贴图：圆角胶囊 + 图标 + 文字 */
export function labelTexture(text, { icon = null, bg = 'rgba(20,26,32,0.88)', fg = '#ffffff', accent = null, sub = null } = {}) {
  const H = 72;
  const ctxM = makeCanvas(8, 8).getContext('2d');
  ctxM.font = `700 34px ${FONT_CN}`;
  const tw = ctxM.measureText(text).width;
  let sw = 0;
  if (sub) { ctxM.font = `600 22px ${FONT_EN}`; sw = ctxM.measureText(sub).width; }
  const W = Math.ceil(Math.max(tw, sw) + (icon ? H * 0.95 : 0) + 44);
  const Hh = sub ? 96 : H;
  const c = makeCanvas(W, Hh);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  const r = 18;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, Hh, r);
  ctx.fill();
  if (accent) { ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(0, 0, 10, Hh, [r, 0, 0, r]); ctx.fill(); }
  let x = 22;
  if (icon) { drawPicto(ctx, icon, x + H * 0.36, Hh / 2, H * 0.62, accent || fg); x += H * 0.86; }
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.font = `700 34px ${FONT_CN}`;
  ctx.fillText(text, x, sub ? 34 : H / 2 + 1);
  if (sub) { ctx.font = `600 22px ${FONT_EN}`; ctx.fillStyle = hexAlpha('#ffffff', 0.72); ctx.fillText(sub, x, 72); }
  const t = canvasTexture(c, { clamp: true });
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return { texture: t, aspect: W / Hh };
}

/** 周边楼宇立面窗格贴图（白天 map / 夜晚 emissiveMap） */
export function windowTextures(seed, { cols = 8, rows = 16, tint = '#9fb3c2' } = {}) {
  const W = 256, H = 512;
  const day = makeCanvas(W, H);
  const night = makeCanvas(W, H);
  const d = day.getContext('2d');
  const n = night.getContext('2d');
  const rand = rng(seed);
  d.fillStyle = '#d9dde0'; d.fillRect(0, 0, W, H);
  n.fillStyle = '#000000'; n.fillRect(0, 0, W, H);
  const cw = W / cols, ch = H / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    d.fillStyle = tint;
    d.globalAlpha = 0.75 + rand() * 0.25;
    d.fillRect(i * cw + 3, j * ch + 4, cw - 6, ch - 8);
    if (rand() < 0.42) {
      n.fillStyle = rand() < 0.7 ? '#ffd89a' : '#cfe6ff';
      n.globalAlpha = 0.5 + rand() * 0.5;
      n.fillRect(i * cw + 3, j * ch + 4, cw - 6, ch - 8);
    }
  }
  d.globalAlpha = 1; n.globalAlpha = 1;
  return { map: canvasTexture(day), emissive: canvasTexture(night) };
}

/** 扶梯踏步贴图（横向沟槽 + 黄色边线） */
export function stepTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4f55';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#5d636a';
  for (let x = 6; x < 120; x += 6) ctx.fillRect(x, 0, 2, 128);
  ctx.fillStyle = '#e8c547';
  ctx.fillRect(0, 0, 6, 128);
  ctx.fillRect(122, 0, 6, 128);
  ctx.fillStyle = '#2b2f33';
  ctx.fillRect(0, 0, 128, 8);
  const t = canvasTexture(c, { srgb: true });
  return t;
}

/** 动线箭头贴图（白色 V 形，透明底） */
export function chevronTexture() {
  const c = makeCanvas(128, 64);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 64);
  ctx.fillStyle = '#ffffff';
  for (const ox of [10, 74]) {
    ctx.beginPath();
    ctx.moveTo(ox, 8); ctx.lineTo(ox + 24, 8); ctx.lineTo(ox + 46, 32); ctx.lineTo(ox + 24, 56); ctx.lineTo(ox, 56); ctx.lineTo(ox + 22, 32);
    ctx.closePath(); ctx.fill();
  }
  const t = canvasTexture(c);
  return t;
}

/** 文字贴图（用于立体字采样、墙面大字） */
export function textMask(text, font, w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + h * 0.04);
  return ctx.getImageData(0, 0, w, h);
}
