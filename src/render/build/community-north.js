// 云澜·北苑塔楼外立面与远景替身（supertall 拆分：P0b 从 community.js 原样移出，之后归 P-north）。
// 只有本社区的塔楼走这里，所以 P-north 改自己的立面（加避难层、塔冠、新立面套件）不会碰到另一个社区的文件。
// community.js 的 buildCommunityTower 调用 buildNorthExterior 写外立面批次，再用 northFar / drawNorthFar 建 600 m 外的替身。
import { homeFacade, slab, crown, coreStorey, roofGarden, band, perimeter, canopy, skyDoorway, farFacade, skyDoorSpans } from './community.js';
import { pickLitWindows, crownEdgeLines, cornerAviation, NULL_BATCH, rectEdges } from './far-lod.js';

/** Exterior batches of one 北苑 tower: home façades, slabs and bands, perimeter, core, canopy, sky-lobby doors, crown and roof garden. */
export function buildNorthExterior({ b, B, col, XB, above, byId, pal, layout }) {
  for (const u of above.flatMap((l) => l.units)) B.frame(u.frame, () => homeFacade(B, col, u, byId.get(u.level), pal));
  B.frame(b.frame, () => {
    for (const lv of above) {
      slab(B, b, lv, pal.slab);
      if (lv.kind === 'roof') { crown(B, b, lv, pal); coreStorey(B, col, b.frame, lv, pal, 4.2, b.footprint); roofGarden(XB, b, lv, pal); continue; }
      if (lv.elev > 0) band(B, b, lv.elev, pal);
      perimeter(B, col, layout, b, lv, pal);
      coreStorey(B, col, b.frame, lv, pal, lv.height, b.footprint);
      canopy(B, layout, b, lv, pal);
      skyDoorway(B, layout, b, lv, pal);
    }
  });
}

/**
 * Far LOD of a 北苑 tower (M1 with today's builder). The day stand-in is a compact spec (≈ 0.8k vertices against the
 * per-storey generator's 3.2k, so the community resident geometry stays ≤ 10 MB): the mass from the 7F sky lobby
 * to the roof, glazing columns per face at the measured window share merged up the tower, a spandrel per storey,
 * the parapet cornice, the core penthouse and lift overruns, and the 7F south canopy (it reaches 2.4 m out).
 * The night layer picks hashed lit windows from the real window openings.
 */
export function northFar({ b, above, pal, layout }) {
  const fp = b.footprint, roof = above.find((l) => l.kind === 'roof'), storeys = above.filter((l) => l.kind !== 'roof');
  const last = storeys.at(-1), top = roof ? roof.elev : last.elev + last.height, base = Math.max(0, above[0].elev);
  const lit = [];
  farFacade(NULL_BATCH, b, above, pal, lit);
  const faces = rectEdges(fp).map((e) => {
    const len = e.hi - e.lo, wins = lit.filter((w) => w.edge === e.side);
    const share = Math.min(.7, wins.reduce((n, w) => n + (w.t1 - w.t0), 0) / Math.max(1, storeys.length) / len);
    const bands = [];
    if (share > .05) {
      const n = Math.max(2, Math.round(len / 5)), w = share * len / n;
      for (let k = 0; k < n; k++) { const m = e.lo + len * (k + .5) / n; bands.push({ kind: 'glass', t0: m - w / 2, t1: m + w / 2, y0: storeys[0].elev + .6, y1: last.elev + last.height - .4 }); }
    }
    for (const lv of storeys) if (lv.elev > 0) bands.push({ kind: 'spandrel', t0: e.lo - .05, t1: e.hi + .05, y0: lv.elev - .4, y1: lv.elev + .6, color: pal.band, off: .05 });
    bands.push({ kind: 'band', t0: e.lo - .11, t1: e.hi + .11, y0: top - .35, y1: top + 1.23, color: pal.accent, off: .11 });
    return { edge: e.side, bands };
  });
  const crown = [];
  const cp = roof?.corePlan;
  if (cp?.core) {
    crown.push({ rect: cp.core, y0: top, y1: top + 4.4 });
    for (const { rect: r } of cp.lifts) crown.push({ rect: r, y0: top + 4.4, y1: top + 5.6 });
  }
  // The 空中大堂 south canopy (skyDoorway): 2.4 m deep, the door width + 0.6 m each side, at 7F + 4.3 m.
  for (const lv of storeys) for (const { e, span: [a, z], en } of skyDoorSpans(b, lv, layout)) {
    if (en.skyLobby !== 'S') continue;
    const half = (z - a) / 2 + .6, m = (a + z) / 2, d = 2.4;
    crown.push({ rect: e.axis === 'x' ? { x0: m - half, x1: m + half, z0: e.c, z1: e.c + e.n[1] * d } : { x0: e.c, x1: e.c + e.n[0] * d, z0: m - half, z1: m + half }, y0: lv.elev + 4.22, y1: lv.elev + 4.38, color: pal.frame });
  }
  for (const c of crown) { const r = c.rect; c.rect = { x0: Math.min(r.x0, r.x1), x1: Math.max(r.x0, r.x1), z0: Math.min(r.z0, r.z1), z1: Math.max(r.z0, r.z1) }; }
  return { top, y0: base, footprint: fp, color: pal.wall, faces, crown, roof: { y: top },
    night: { windows: pickLitWindows(b, lit), crownEdges: crownEdgeLines(fp, top + 1.2), aviation: cornerAviation(fp, top + 1.6) } };
}
/** The day stand-in is drawn from the spec (farStandIn). */
export const drawNorthFar = null;
