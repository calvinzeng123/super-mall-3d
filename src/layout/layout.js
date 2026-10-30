// 汇总园区布局模型：buildLayout() → { buildings, levels, escalators, elevators, stairs, entrances, ramps, site, bridges, categories }
import { buildSite, addPark } from './campus.js';
import { BrandPicker } from './brands.js';
import { buildMall } from './mall.js';
import { buildP3 } from './p3.js';
import { buildBridges } from './bridges.js';
import { buildMetro } from './metro.js';
import { buildHospitality } from './hospitality.js';
import { addUrbanDistrict } from './urban.js';
import { addForecourt } from './forecourt.js';
import { P1 } from './p1.js';
import { P2 } from './p2.js';
import { CATEGORIES } from './constants.js';
import { prepareRideableElevators } from './elevator-shafts.js';
import { applySharedGarages } from './shared-garages.js';
import { addTransitCenter } from './transit-center.js';
import { buildExpandedP1Spec } from './p1-expansion-spec.js';
import { applyP1Expansion } from './p1-expansion.js';
import { applyP1VehicleAccess } from './p1-access.js';
import { applyP1Fidelity } from './p1-fidelity.js';

/** expansion: the full phase-one tour (false builds the compact FPS authoring
 * layout). fidelity: the concept A scheme on top of it — extra vehicle access,
 * roof forms, roofscape and landscape; false gives the tour before the scheme. */
export function buildLayout({ expansion = true, fidelity = expansion } = {}) {
  const site = buildSite();
  const picker = new BrandPicker(2026);
  const originalP1 = buildMall(P1, site, picker);
  const expandedP1 = expansion ? buildMall(buildExpandedP1Spec(P1), buildSite(), new BrandPicker(2026)) : originalP1;
  if (expansion) {
    const oldRoof = originalP1.levels.find(l => l.short === 'RF');
    for (const unit of expandedP1.levels.find(l => l.short === 'RF').units) {
      const original = oldRoof.units.find(u => u.id === unit.id);
      if (original) unit.brand = original.brand;
    }
  }
  const parts = [expandedP1, buildMall(P2, site, picker), buildP3(site, picker)];
  addPark(site);
  parts.push(buildMetro(parts, site, picker));
  const hospitality = buildHospitality(parts, site);
  parts.push(...hospitality.parts);
  addForecourt(site);
  addUrbanDistrict(site);
  const all = (k) => parts.flatMap((p) => p[k]);
  const buildings = parts.map((p) => p.building);
  const layout = {
    buildings,
    levels: all('levels'),
    escalators: all('escalators'),
    elevators: all('elevators'),
    stairs: all('stairs'),
    entrances: all('entrances'),
    ramps: all('ramps'),
    site,
    bridges: buildBridges(buildings),
    categories: { ...CATEGORIES, hotel: { label: '酒店套房', color: '#a27d49' }, apartment: { label: '服务公寓', color: '#537b78' }, residential: { label: '住宅', color: '#7b8470' } },
    extensions: hospitality.extensions,
  };
  applySharedGarages(layout);
  if (expansion) applyP1Expansion(layout, picker);
  if (expansion && fidelity) { applyP1VehicleAccess(layout); applyP1Fidelity(layout); }
  addTransitCenter(layout.site, layout.extensions);
  return prepareRideableElevators(layout);
}
