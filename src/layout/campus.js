// 园区总图：道路、人行道、斑马线、地块、广场与场地步行区（规格第 2 节）。
// 各期在构建时用 addDriveway / addTrench / addPlaza 登记车道入口、坡道敞开段与广场。
import { rect, rectPoly } from './geom.js';

const R = (id, x0, z0, x1, z1, extra = {}) => {
  const r = rect(x0, z0, x1, z1);
  return { id, rect: r, poly: rectPoly(r), ...extra };
};

export function buildSite() {
  const roads = [
    R('avenue', -298, -14, 298, 14, { name: '云澜大道', dir: 'x', lanes: 6, median: 2 }),
    R('xingwan', -10, -298, 10, 298, { name: '星湾路', dir: 'z', lanes: 4 }),
    R('ring-n', -298, -268, 298, -256, { name: '北外环', dir: 'x', lanes: 2 }),
    R('ring-s', -298, 256, 298, 268, { name: '南外环', dir: 'x', lanes: 2 }),
    R('ring-w', -298, -268, -286, 268, { name: '西外环', dir: 'z', lanes: 2 }),
    R('ring-e', 286, -268, 298, 268, { name: '东外环', dir: 'z', lanes: 2 }),
    R('service-n', 10, -176, 286, -164, { name: '星湾北街', dir: 'x', lanes: 2 }),
  ];
  const sidewalks = [
    R('sw-an-w', -286, -20, -10, -14), R('sw-an-e', 10, -20, 286, -14),
    R('sw-as-w', -286, 14, -10, 20), R('sw-as-e', 10, 14, 286, 20),
    R('sw-xw-n', -16, -256, -10, -14), R('sw-xe-n', 10, -164, 16, -14), R('sw-xe-nn', 10, -256, 16, -176),
    R('sw-xw-s', -16, 14, -10, 256), R('sw-xe-s', 10, 14, 16, 256),
  ];
  const crossings = [
    R('x-av-w', -16, -14, -10, 14, { axis: 'z' }), R('x-av-e', 10, -14, 16, 14, { axis: 'z' }),
    R('x-xw-n', -10, -20, 10, -14, { axis: 'x' }), R('x-xw-s', -10, 14, 10, 20, { axis: 'x' }),
    R('x-svc', 10, -176, 16, -164, { axis: 'x' }),
  ];
  const plots = [
    R('P1', -286, -256, -16, -20, { name: '一期 云澜汇' }),
    R('P2', 16, -164, 286, -20, { name: '二期 星湾' }),
    R('P2-back', 16, -256, 286, -176, { name: '二期后区' }),
    R('P3', -286, 20, -16, 256, { name: '三期 云澜里' }),
    R('park', 16, 20, 286, 256, { name: '中央公园' }),
  ];
  const site = {
    roads, sidewalks, crossings, plots,
    walk: [...sidewalks, ...crossings].map((s) => ({ id: s.id, kind: s.id.startsWith('x-') ? 'crossing' : 'sidewalk', poly: s.poly, outdoor: true })),
    plazas: [],
    driveways: [],
    trenches: [],
    features: [],
  };
  return site;
}

/** 广场：既是场地步行区，也是渲染时的铺装范围（建筑与坡道开口在渲染时挖掉） */
export function addPlaza(site, id, poly, building) {
  site.plazas.push({ id, poly, building });
  site.walk.push({ id, kind: 'plaza', poly, outdoor: true });
}
export const addDriveway = (site, poly) => site.driveways.push(poly);
export const addTrench = (site, poly) => site.trenches.push(poly);
