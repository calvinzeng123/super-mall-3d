// 云澜江景台渲染：悬挑钢托架、铝板封边、两座玻璃挑台（三面 1.2 m 玻璃栏板）、望远镜与面江长椅。
// 写入 P1-3F 的 shellBatch（随楼层显隐，只用该批次已有的材质键：0 新增绘制调用）；
// LED 灯带写入同层 facadeBatch 已有的 glow。石材面层、栏杆和露台家具由 p1-expansion.js terraces() 绘制。
import { bench } from './props.js';
import { COLORS } from '../theme.js';
import { textMask, FONT_CN } from '../textures.js';
import { SLAB_T } from './shell.js';
import { RIVER_TERRACE } from '../../layout/river-terrace.js';
import { expansionTerraceEdges, terraceSupports } from './p1-expansion.js';

const FASCIA = '#c9c5bd', GRILLAGE = '#8b949b';

/** Glass prow cantilevered north from a deck edge: laminated glass floor, steel grillage,
 * 1.2 m glass on the two sides and the far end, LED line along the free edges. */
export function glassProw(B, FB, r, y) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  B.get('glass').box(cx, y - .01, cz, w, .06, d, '#ffffff');
  for (const x of [r.x0 + .08, r.x1 - .08]) B.get('extMetal').box(x, y - .24, cz, .16, .4, d, GRILLAGE);
  B.get('extMetal').box(cx, y - .24, r.z0 + .08, w, .4, .16, GRILLAGE);
  for (let x = r.x0 + 2.4; x < r.x1 - 1; x += 2.4) B.get('extMetal').box(x, y - .18, cz, .07, .24, d, GRILLAGE);
  const rail = (x0, z0, x1, z1) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = Math.hypot(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, sx = t => alongX ? len : t, sz = t => alongX ? t : len;
    B.get('glass').box(mx, y + .65, mz, sx(.04), 1.2, sz(.04), '#ffffff');
    B.get('extMetal').box(mx, y + 1.28, mz, sx(.07), .06, sz(.07), COLORS.steel);
    FB?.get('glow').box(mx, y + .04, mz, sx(.05), .03, sz(.05), COLORS.led);
  };
  rail(r.x0 + .05, r.z0, r.x0 + .05, r.z1);
  rail(r.x1 - .05, r.z0, r.x1 - .05, r.z1);
  rail(r.x0, r.z0 + .05, r.x1, r.z0 + .05);
}

/** Pixel mask → merged rectangles (runs that repeat row after row become one box). */
export function maskRects(mask, w, h, on = (i, j) => mask.data[(j * w + i) * 4] > 120) {
  const out = [], active = new Map();
  for (let j = 0; j <= h; j++) {
    const runs = new Map();
    if (j < h) for (let i = 0, a = -1; i <= w; i++) {
      const lit = i < w && on(i, j);
      if (lit && a < 0) a = i;
      if (!lit && a >= 0) { runs.set(`${a}:${i}`, [a, i]); a = -1; }
    }
    for (const [k, r] of active) if (!runs.has(k)) { out.push(r); active.delete(k); }
    for (const [k, [a, b]] of runs) if (active.has(k)) active.get(k).j1 = j + 1; else active.set(k, { i0: a, i1: b, j0: j, j1: j + 1 });
  }
  return out;
}

/** 「云澜汇 · 江景台」 channel letters on a dark band under the P1C deck edge, facing the river. */
function riverLetters(B, FB, cx, z, yTop, text = '云澜汇 · 江景台') {
  if (typeof document === 'undefined') return 0;
  const W = 288, H = 40, vox = .03, mask = textMask(text, `900 34px ${FONT_CN}`, W, H);
  const xl = cx + W * vox / 2;                  // facing -z: the reader's right hand is -x
  B.get('extMetal').box(cx, yTop - H * vox / 2, z + .06, W * vox + .8, H * vox + .3, .1, '#2c363c');
  const rects = maskRects(mask, W, H);
  for (const r of rects) B.get('extSatin').box(xl - (r.i0 + r.i1) / 2 * vox, yTop - (r.j0 + r.j1) / 2 * vox, z - .02, (r.i1 - r.i0) * vox, (r.j1 - r.j0) * vox, .12, '#f6f3ec');
  FB?.get('glow').box(cx, yTop - H * vox - .2, z - .03, W * vox + .6, .04, .04, COLORS.led);
  return rects.length;
}

export function buildRiverTerrace(ctx) {
  const lv = ctx.layout.levels.find(l => l.riverTerrace);
  const L = lv && ctx.levels[lv.id];
  if (!L) return null;
  const B = L.shellBatch, FB = L.facadeBatch, T = lv.riverTerrace, y = lv.elev;
  const soffit = y - .03 - (SLAB_T[lv.kind] || .45), steel = B.get('extMetal');
  const facade = RIVER_TERRACE.facade;
  // Steel cantilever brackets every 6 m from the 2F/3F transfer zone to the deck soffit.
  const inDeck = x => T.decks.some(d => x > d.x0 && x < d.x1);
  for (const d of T.decks) for (let x = d.x0 + 1; x < d.x1 - .5; x += 6) steel.bar({ x, y: y - 1.7, z: facade }, { x, y: soffit, z: d.z0 + .4 }, .24, COLORS.darkSteel);
  for (let x = RIVER_TERRACE.x0 + 3; x < RIVER_TERRACE.x1; x += 6) if (!inDeck(x)) steel.bar({ x, y: y - 1.1, z: facade }, { x, y: soffit, z: RIVER_TERRACE.band + .4 }, .18, COLORS.darkSteel);
  const p1cFace = -245.8;
  for (let x = T.p1cDeck.x0 + 13; x < T.p1cDeck.x1 - 12; x += 5.5) steel.bar({ x, y: y - 1.6, z: p1cFace }, { x, y: soffit, z: T.p1cDeck.z0 + .4 }, .22, COLORS.darkSteel);
  // Aluminium fascia and LED line on every free edge (the railed spans).
  const edges = expansionTerraceEdges(lv, ctx.layout.entrances, terraceSupports(ctx.layout, lv)).filter(e => e.riverTerrace);
  for (const e of edges) for (const [a, b] of e.spans) {
    B.frame(e.F, () => steel.box((a + b) / 2, y - .33, .04, b - a, .62, .08, FASCIA));
    FB?.frame(e.F, () => FB.get('glow').box((a + b) / 2, y - .5, .09, b - a, .04, .03, COLORS.led));
  }
  for (const p of T.prows) glassProw(B, FB, p.rect, y);
  // Telescopes beside each prow mouth and benches facing the river.
  const scope = (x, z) => {
    steel.cyl(x, y, z, .06, 1.1, '#3b4046', 8);
    steel.box(x, y + 1.2, z - .1, .22, .22, .7, '#c9ccd0', .25);
  };
  const seats = [];
  for (const p of T.prows) {
    const d = T.decks.find(d => p.rect.x0 >= d.x0 && p.rect.x1 <= d.x1);
    if (!d) continue;
    const zEdge = d.z0 + .9;
    for (const x of [Math.max(d.x0 + .9, p.rect.x0 - 1.6), Math.min(d.x1 - .9, p.rect.x1 + 1.6)]) scope(x, zEdge);
    for (const x of [p.rect.x0 + .9, p.rect.x1 - .9]) seats.push([x, d.z0 + 4.5]);
  }
  for (const [x, z] of seats) bench(B, x, y + .012, z, Math.PI, 'ext');
  // The sign band hangs under the P1C deck fascia on the 1F P1C-N door axis.
  const door = T.door ? (T.door.x0 + T.door.x1) / 2 : (T.p1cDeck.x0 + T.p1cDeck.x1) / 2;
  const letters = riverLetters(B, FB, door, T.p1cDeck.z0 - .12, y - .7);
  return { edges: edges.length, prows: T.prows.length, letters };
}
