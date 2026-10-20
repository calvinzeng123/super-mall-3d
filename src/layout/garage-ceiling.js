import { polyBounds, toL } from './geom.js';
import { subtractRect } from './urban.js';

/** WPG is a rectangular garage. Disjoint solid panels avoid duplicate or
 * intersecting Shape holes where a lift shaft is already inside a lobby cut. */
export function garageCeilingPanels(building, site, levels = []) {
  const openings = [
    ...(building.accessKiosks || []),
    ...[...(site.trenches || []), ...(site.openings || [])].map(poly => polyBounds(poly.map(p => toL(building.frame, ...p)))),
    ...levels.flatMap(lv => (lv.voids || []).filter(v => v.kind === 'shaft')
      .map(v => polyBounds(v.poly.map(p => toL(building.frame, ...p))))),
  ];
  let panels = [{ ...building.footprint }];
  for (const cut of openings) panels = panels.flatMap(panel => subtractRect(panel, cut));
  return panels;
}
