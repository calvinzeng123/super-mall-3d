// 汇总园区布局模型：buildLayout() → { buildings, levels, escalators, elevators, stairs, entrances, ramps, site, bridges, categories }
import { buildSite } from './campus.js';
import { BrandPicker } from './brands.js';
import { buildMall } from './mall.js';
import { P1 } from './p1.js';
import { CATEGORIES } from './constants.js';

export function buildLayout() {
  const site = buildSite();
  const picker = new BrandPicker(2026);
  const parts = [buildMall(P1, site, picker)];
  const all = (k) => parts.flatMap((p) => p[k]);
  return {
    buildings: parts.map((p) => p.building),
    levels: all('levels'),
    escalators: all('escalators'),
    elevators: all('elevators'),
    stairs: all('stairs'),
    entrances: all('entrances'),
    ramps: all('ramps'),
    site,
    bridges: null,
    categories: CATEGORIES,
  };
}
