// 云澜·西苑塔楼外立面与远景替身（supertall 拆分：P0b 从 community.js 原样移出，之后归 P-west）。
// 只有本社区的塔楼走这里，所以 P-west 改自己的立面（加避难层、塔冠、新立面套件）不会碰到另一个社区的文件。
// community.js 的 buildCommunityTower 调用 buildWestExterior 写外立面批次，再用 westFar / drawWestFar 建 600 m 外的替身。
import { homeFacade, slab, crown, coreStorey, roofGarden, band, perimeter, canopy, skyDoorway, farFacade } from './community.js';
import { pickLitWindows, crownEdgeLines, cornerAviation, NULL_BATCH } from './far-lod.js';

/** Exterior batches of one 西苑 tower: home façades, slabs and bands, perimeter, core, canopy, sky-lobby doors, crown and roof garden. */
export function buildWestExterior({ b, B, col, XB, above, byId, pal, layout }) {
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

/** Far LOD spec of a 西苑 tower: the top for the swap distance and the night layer (hashed lit windows,
 * the lit crown cornice, red obstruction lights at the parapet corners). The day stand-in is drawWestFar. */
export function westFar({ b, above, pal }) {
  const roof = above.find((l) => l.kind === 'roof'), last = above.filter((l) => l.kind !== 'roof').at(-1);
  const top = roof ? roof.elev : last.elev + last.height, lit = [];
  farFacade(NULL_BATCH, b, above, pal, lit);
  return { top, footprint: b.footprint, night: { windows: pickLitWindows(b, lit), crownEdges: crownEdgeLines(b.footprint, top + 1.2), aviation: cornerAviation(b.footprint, top + 1.6) } };
}
/** Day stand-in (facadePlaster + facadeWindow, building frame): today's per-storey generator. */
export function drawWestFar(stand, { b, above, pal }) { farFacade(stand, b, above, pal); }
