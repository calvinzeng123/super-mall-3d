// 程序化 PBR 面层：按效果图补齐的石材、陶土、铜板、瓦屋面、抹灰、清水混凝土与木格栅。
// 全部在本地用数学噪声生成（无外部图片、无网络请求），可无缝平铺；颜色贴图保持接近中性的明度变化，
// 色相仍由合批顶点色决定，所以同一张图能给不同楼栋上不同的石色。
// 贴图坐标：u 沿墙面水平，v 竖直向上（与 surface-uv.js 的米制投影一致），一张图覆盖 meters 米。
// 由 scripts/procedural-textures.mjs 离线渲染成 JPEG，运行时与 CC0 贴图一样嵌入加载，不占启动时间。

// ---------- 可平铺噪声 ----------

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = t => t * t * (3 - 2 * t);

/** 周期值噪声：fx × fy 个格点在 [0,1)² 内首尾相接，所以贴图可以无缝平铺 */
function vnoise(u, v, fx, fy, seed) {
  const x = u * fx, y = v * fy;
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = smooth(x - x0), ty = smooth(y - y0);
  const m = (a, n) => ((a % n) + n) % n;
  const xa = m(x0, fx), xb = m(x0 + 1, fx), ya = m(y0, fy), yb = m(y0 + 1, fy);
  const a = hash(xa, ya, seed), b = hash(xb, ya, seed), c = hash(xa, yb, seed), d = hash(xb, yb, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** 分形噪声，0–1；fx/fy 为首层格点数（整数），之后每层翻倍 */
export function fbm(u, v, fx, fy, seed, octaves = 4) {
  let s = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    s += vnoise(u, v, fx << o, fy << o, seed + o * 17) * amp;
    norm += amp; amp *= 0.5;
  }
  return s / norm;
}

const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const cellRand = (i, j, seed) => hash(i, j, seed + 991);

// ---------- 各面层的逐像素定义 ----------
// 每个 sample(u, v) 返回 [明度 r, g, b（约 0.6–1.05）, 高度 0–1, 粗糙度 0–1]。

/** 石材干挂：1.2 × 0.6m 大板错缝，6–8mm 胶缝，水平层理与洞孔（洞石） */
function travertine(u, v, S) {
  const W = 2.4, H = 2.4, pw = 1.2, ph = 0.6, joint = 0.008;
  const x = u * W, y = v * H, row = Math.floor(y / ph), off = (row % 2) * pw / 2;
  const col = Math.floor(((x + off) % W) / pw), lx = (x + off) % pw, ly = y - row * ph;
  const edge = Math.min(lx, pw - lx, ly, ph - ly);
  if (edge < joint / 2) return [0.62, 0.6, 0.57, 0, 0.92];
  const tone = 0.955 + cellRand(col, row, S) * 0.06;
  const bed = fbm(u, v, 3, 40, S + 1, 4);                   // 水平层理
  const cloud = fbm(u, v, 6, 6, S + 2, 4);
  const pore = fbm(u, v, 48, 96, S + 3, 2);                 // 横向拉长的小洞
  const pit = pore > 0.74 ? (pore - 0.74) * 3.5 : 0;
  const l = tone * (0.9 + (bed - 0.5) * 0.16 + (cloud - 0.5) * 0.08) - pit * 0.35;
  const bevel = clamp01((edge - joint / 2) / 0.004);
  return [l * 1.01, l, l * 0.965, 0.55 + bevel * 0.4 - pit * 0.5 + (bed - 0.5) * 0.04, 0.62 + (1 - bed) * 0.1 + pit * 0.2];
}

/** 陶土挂板：0.1m 宽竖向陶棍，0.6m 一段错缝，每段釉色深浅不一 */
function terracotta(u, v, S) {
  const W = 1.2, H = 1.2, bw = 0.1, gap = 0.018, seg = 0.6;
  const x = u * W, y = v * H, i = Math.floor(x / bw), lx = x - i * bw;
  const shift = (i % 3) * 0.2, j = Math.floor(((y + shift) % H) / seg), ly = (y + shift) % seg;
  if (lx > bw - gap || ly < 0.006) return [0.48, 0.42, 0.38, 0, 0.95];
  const t = (lx / (bw - gap)) * 2 - 1, round = Math.sqrt(Math.max(0, 1 - t * t));
  const r = cellRand(i, j, S), r2 = cellRand(i, j, S + 5);
  const grain = fbm(u, v, 24, 24, S + 7, 3);
  const l = 0.84 + r * 0.2 + (grain - 0.5) * 0.08;
  // 窑变：少数陶棍偏橙或偏褐
  return [l * (1.0 + (r2 - 0.5) * 0.08), l * (0.97 - (r2 - 0.5) * 0.06), l * (0.95 - (r2 - 0.5) * 0.1),
    0.25 + round * 0.7, 0.66 + (grain - 0.5) * 0.12];
}

/** 拉丝铜板：竖向拉丝、轻微氧化斑，1m 一条压缝 */
function bronze(u, v, S) {
  const streak = fbm(u, v, 96, 2, S, 3), patina = fbm(u, v, 4, 4, S + 3, 4);
  const seam = Math.abs(u - 0.5) < 0.003 ? 1 : 0;
  const l = 0.9 + (streak - 0.5) * 0.18 + (patina - 0.5) * 0.1 - seam * 0.25;
  return [l * 1.02, l, l * 0.96, 0.6 + (streak - 0.5) * 0.08 - seam * 0.5, 0.36 + (streak - 0.5) * 0.18 + (patina - 0.5) * 0.12];
}

/** 筒瓦屋面：0.3m 一排，瓦垄起拱，上排压下排留出阴影，零星苔痕 */
function roofTile(u, v, S) {
  const W = 1.8, H = 1.8, tw = 0.3, rh = 0.3;
  const x = u * W, y = v * H, r = Math.floor(y / rh), ly = (y - r * rh) / rh;
  const xi = x + (r % 2) * tw / 2, i = Math.floor(xi / tw) % 6, lx = (xi % tw) / tw;
  const arch = Math.sin(lx * Math.PI);                       // 瓦垄
  const lap = ly < 0.14 ? ly / 0.14 : 1;                      // 上一排瓦的下缘投影
  const dirt = fbm(u, v, 8, 8, S + 2, 4), moss = fbm(u, v, 5, 5, S + 9, 3);
  const tone = 0.8 + cellRand(i, r, S) * 0.24;
  const l = tone * (0.62 + 0.38 * lap) * (0.92 + arch * 0.12) * (0.9 + (dirt - 0.5) * 0.25);
  const m = clamp01((moss - 0.62) * 4) * 0.25;
  return [l * (1 - m * 0.4), l * (1 - m * 0.05), l * (1 - m * 0.5), arch * 0.6 + ly * 0.35, 0.7 + (dirt - 0.5) * 0.2];
}

/** 细抹灰（真石漆）：低频批刀痕 + 高频砂粒 */
function plaster(u, v, S) {
  const trowel = fbm(u, v, 5, 3, S, 4), sand = fbm(u, v, 128, 128, S + 4, 2);
  const l = 0.95 + (trowel - 0.5) * 0.09 + (sand - 0.5) * 0.06;
  return [l, l * 0.995, l * 0.985, 0.5 + (trowel - 0.5) * 0.2 + (sand - 0.5) * 0.25, 0.86 + (sand - 0.5) * 0.08];
}

/** 清水混凝土：1.2 × 0.6m 模板分缝，每块 6 个对拉螺栓孔，木纹模板印 */
function boardConcrete(u, v, S) {
  const W = 2.4, H = 1.2, pw = 1.2, ph = 0.6;
  const x = u * W, y = v * H, ci = Math.floor(x / pw), ri = Math.floor(y / ph), lx = x - ci * pw, ly = y - ri * ph;
  const edge = Math.min(lx, pw - lx, ly, ph - ly);
  const board = fbm(u, v, 2, 48, S + 1, 3);                 // 横向木纹模板印
  const cloud = fbm(u, v, 5, 5, S + 2, 4);
  const tone = 0.9 + cellRand(ci, ri, S) * 0.07;
  let l = tone * (0.93 + (cloud - 0.5) * 0.14 + (board - 0.5) * 0.06), h = 0.55 + (board - 0.5) * 0.1;
  if (edge < 0.004) { l *= 0.72; h = 0.3; }
  for (const hx of [0.3, 0.9]) for (const hy of [0.15, 0.45]) {
    const d = Math.hypot(lx - hx, ly - hy);
    if (d < 0.014) { l *= 0.55 + d * 20; h = 0.15; }
  }
  return [l, l, l * 0.99, h, 0.88 + (cloud - 0.5) * 0.08];
}

/** 木格栅墙板：60mm 竖向木条、15mm 黑缝，木纹沿竖向 */
function timberSlat(u, v, S) {
  const W = 1.2, sw = 0.075, gap = 0.015;
  const x = u * W, i = Math.floor(x / sw), lx = x - i * sw;
  if (lx > sw - gap) return [0.3, 0.27, 0.24, 0, 0.9];
  const grain = fbm(u, v, 160, 3, S + i, 3), knot = fbm(u, v, 16, 8, S + 3, 2);
  const tone = 0.86 + cellRand(i, 0, S) * 0.18;
  const l = tone * (0.9 + (grain - 0.5) * 0.24) - Math.max(0, knot - 0.78) * 0.8;
  const t = lx / (sw - gap);
  return [l * 1.03, l, l * 0.94, 0.7 + Math.sin(t * Math.PI) * 0.25, 0.62 + (grain - 0.5) * 0.15];
}

/** Honed limestone, 1200 × 600mm running bond, narrow recessed grout. */
function limestonePavers(u, v, S) {
  const x = u * 4.8, y = v * 4.8, row = Math.floor(y / .6);
  const xx = (x + (row % 2) * .6) % 4.8, col = Math.floor(xx / 1.2);
  const lx = xx % 1.2, ly = y % .6, edge = Math.min(lx, 1.2 - lx, ly, .6 - ly);
  const grain = fbm(u, v, 128, 128, S + 3, 2);
  if (edge < .004) return [.56, .55, .51, .14, .98];
  const cloud = fbm(u, v, 12, 16, S, 3), bed = fbm(u, v, 10, 56, S + 7, 2);
  const tone = .88 + cellRand(col, row, S) * .08 + (cloud - .5) * .06 + (grain - .5) * .045;
  const bevel = clamp01((edge - .004) / .005);
  return [tone * 1.02, tone * 1.01, tone * .985, .58 + bevel * .14 + (bed - .5) * .025, .77 + grain * .1];
}

/** Dense loop-pile wool, 600mm repeat. Neutral yarn lets every inlay share
 * these maps; no reflective veins or stone joints occur in the carpet. */
function wovenCarpet(u, v, S) {
  const row = Math.floor(v * 128), shift = (row % 2) * .5;
  const warp = Math.sin((u * 128 + shift) * Math.PI * 2);
  const weft = Math.sin(v * 128 * Math.PI * 2);
  const yarn = fbm(u, v, 128, 128, S, 2), soft = fbm(u, v, 16, 16, S + 1, 2);
  const nap = warp * weft, l = .89 + nap * .035 + (yarn - .5) * .11 + (soft - .5) * .035;
  return [l * 1.015, l, l * .98, .5 + nap * .09 + (yarn - .5) * .16, .94 + yarn * .055];
}

/** Linked quarter-circle jacquard, an original cloud/ripple motif. The colour
 * repeat is large; rendering keeps the existing 600mm pile normals separate. */
function carpetJacquard(u, v, S) {
  const x = u * 4.8, y = v * 4.8, col = Math.floor(x / 2.4), row = Math.floor(y / 2.4);
  let lx = x % 2.4; const ly = y % 2.4;
  if ((col + row) % 2) lx = 2.4 - lx;
  const distances = [Math.hypot(lx, ly), Math.hypot(2.4 - lx, 2.4 - ly)];
  const stripe = Math.min(...distances.flatMap(r => [.88, 1.04, 1.20, 1.36, 1.52].map(radius => Math.abs(r - radius))));
  const yarn = fbm(u, v, 128, 128, S, 2);
  const l = (stripe < .018 ? .73 : stripe < .033 ? .97 : .9) + (yarn - .5) * .04;
  return [l * 1.015, l, l * .98, .5, .98];
}

function metroTerrazzo(u,v,seed){
  const h=hash(Math.floor(u*210),Math.floor(v*210),seed),n=fbm(u,v,12,12,seed,2);
  const joint=Math.min((u*2)%1,1-(u*2)%1,(v*2)%1,1-(v*2)%1)<.007;
  const value=joint?.61:h>.91?.64+h*.1:.9+(n-.5)*.07;
  return [value,value*.995,value*.98,joint?-.15:(h-.5)*.025,.72];
}
function metroCeramic(u,v,seed){
  const row=Math.floor(v*4),x=(u*2+(row%2)*.5)%1,y=(v*4)%1;
  const edge=Math.min(x,1-x,y,1-y),seam=edge<.014,n=fbm(u,v,8,8,seed,2);
  const value=seam?.63:.94+(n-.5)*.025;
  return [value,value,value*.995,seam?-.22:Math.min(edge,.06)*.4,seam?.9:.29];
}
function tunnelLiner(u,v,seed){
  const x=u%1,y=(v*4+Math.floor(u*2)*.5)%1,n=fbm(u,v,16,12,seed,3);
  const seam=Math.min(x,1-x,y,1-y)<.012,value=seam?.45:.78+(n-.5)*.12;
  return [value,value*.99,value*.97,seam?-.2:(n-.5)*.06,.92];
}
export const PROCEDURAL_SURFACES = Object.freeze({
  metro_terrazzo: {label:'地铁 · 细骨料水磨石',meters:[2.4,2.4],sample:metroTerrazzo,normal:1.2,seed:151},
  metro_ceramic: {label:'地铁 · 釉面陶瓷墙砖',meters:[2.4,2.4],sample:metroCeramic,normal:1.3,seed:157},
  tunnel_liner: {label:'地铁 · 盾构混凝土管片',meters:[2,6],sample:tunnelLiner,normal:1.5,seed:163},
  limestone_pavers: { label: '一期 · 浅石色错缝地砖', meters: [4.8, 4.8], sample: limestonePavers, normal: 1.8, seed: 101 },
  woven_carpet: { label: '一期 · 圈绒编织地毯', meters: [.6, .6], sample: wovenCarpet, normal: 1.0, seed: 113 },
  carpet_jacquard: { label: '一期 · 云纹弧线提花', meters: [4.8, 4.8], sample: carpetJacquard, normal: .2, seed: 127 },
  travertine_panel: { label: '洞石干挂大板', meters: [2.4, 2.4], sample: travertine, normal: 2.2, seed: 11 },
  terracotta_baguette: { label: '陶土挂板', meters: [1.2, 1.2], sample: terracotta, normal: 3.0, seed: 23 },
  bronze_brushed: { label: '拉丝铜板', meters: [1, 1], sample: bronze, normal: 1.2, seed: 37 },
  clay_roof_tile: { label: '筒瓦屋面', meters: [1.8, 1.8], sample: roofTile, normal: 4.0, seed: 41 },
  fine_plaster: { label: '细抹灰', meters: [2, 2], sample: plaster, normal: 1.0, seed: 53 },
  board_concrete: { label: '清水混凝土', meters: [2.4, 1.2], sample: boardConcrete, normal: 2.0, seed: 67 },
  timber_slat: { label: '木格栅墙板', meters: [1.2, 1.2], sample: timberSlat, normal: 3.0, seed: 79 },
});

/** 逐像素生成三张图的原始字节（RGBA），供贴图与测试使用 */
export function surfacePixels(id, size = 512) {
  const spec = PROCEDURAL_SURFACES[id];
  if (!spec) throw new Error('unknown procedural surface ' + id);
  const n = size * size, color = new Uint8Array(n * 4), rough = new Uint8Array(n * 4), normal = new Uint8Array(n * 4);
  const height = new Float32Array(n);
  for (let j = 0; j < size; j++) {
    const v = (j + 0.5) / size;
    for (let i = 0; i < size; i++) {
      const [r, g, b, h, ro] = spec.sample((i + 0.5) / size, v, spec.seed);
      const p = j * size + i, o = p * 4;
      color[o] = Math.round(clamp01(r) * 255); color[o + 1] = Math.round(clamp01(g) * 255); color[o + 2] = Math.round(clamp01(b) * 255); color[o + 3] = 255;
      const q = Math.round(clamp01(ro) * 255);
      rough[o] = rough[o + 1] = rough[o + 2] = q; rough[o + 3] = 255;
      height[p] = h;
    }
  }
  // 高度 → 切线空间法线（v 向上，与 OpenGL 约定一致），边缘环绕取样保持无缝
  const k = spec.normal * size / 512;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const H = (a, b) => height[((b + size) % size) * size + ((a + size) % size)];
    const dx = (H(i + 1, j) - H(i - 1, j)) * k, dy = (H(i, j + 1) - H(i, j - 1)) * k;
    const len = Math.hypot(dx, dy, 1), o = (j * size + i) * 4;
    normal[o] = Math.round((-dx / len * 0.5 + 0.5) * 255);
    normal[o + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
    normal[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
    normal[o + 3] = 255;
  }
  return { color, normal, roughness: rough, size };
}
